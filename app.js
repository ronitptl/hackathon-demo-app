const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static('public'));

// ── State ────────────────────────────────────────────────
let activeConnections = [];
let MESSAGE_RATE_LIMIT = 100;   // max messages per minute
let messageCount = 0;
let dbQueryDelay = 0;           // simulate slow DB
let incidentActive = false;
let memoryLeakArray = [];       // for OOM simulation

// ── Structured Logger ────────────────────────────────────
function log(service, level, message, meta = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service,
    level,
    message,
    latency_ms: meta.latency || 0,
    status_code: meta.status || 200,
    ...meta
  }));
}

// ── WebSocket Connections ────────────────────────────────
wss.on('connection', (ws, req) => {
  const connId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  ws.connId = connId;
  activeConnections.push(ws);

  log('websocket', 'INFO', `New connection established conn_id=${connId}`,
    { conn_id: connId, total_connections: activeConnections.length });

  ws.on('message', async (data) => {
    const start = Date.now();
    try {
      const msg = JSON.parse(data);

      // Rate limit check
      messageCount++;
      if (messageCount > MESSAGE_RATE_LIMIT) {
        log('message-broker', 'ERROR',
          `Rate limit exceeded — dropping message user=${msg.username} rate=${messageCount}/min`,
          { status: 429, latency: Date.now() - start });
        ws.send(JSON.stringify({ error: 'Rate limit exceeded', code: 429 }));
        return;
      }

      // Simulate DB delay during incident
      if (dbQueryDelay > 0) {
        await new Promise(r => setTimeout(r, dbQueryDelay));
      }

      if (incidentActive) {
        log('database', 'ERROR',
          `ECONNREFUSED — SQLite write timeout after ${dbQueryDelay}ms msg_id=pending`,
          { status: 500, latency: dbQueryDelay });
        ws.send(JSON.stringify({ error: 'Database unavailable', code: 500 }));
        return;
      }

      // Save message to DB
      const user = await db.handleDeadlock(db.pool, `SELECT id FROM users WHERE username = '${msg.username}'`);
      const room = await db.handleDeadlock(db.pool, `SELECT id FROM rooms WHERE name = '${msg.room}'`);

      if (!user || !room) {
        log('api-gateway', 'WARN', `Unknown user or room user=${msg.username} room=${msg.room}`,
          { status: 404, latency: Date.now() - start });
        return;
      }

      const result = await db.handleDeadlock(db.pool, `INSERT INTO messages (room_id, user_id, content) VALUES (${room.id}, ${user.id}, '${msg.content}')`);

      const latency = Date.now() - start;
      log('database', latency > 500 ? 'WARN' : 'INFO',
        `Message saved msg_id=${result.lastInsertRowid} room=${msg.room} user=${msg.username}`,
        { latency, msg_id: result.lastInsertRowid, room: msg.room });

      // Broadcast to room
      const broadcast = JSON.stringify({
        type: 'message',
        id: result.lastInsertRowid,
        username: msg.username,
        room: msg.room,
        content: msg.content,
        timestamp: new Date().toISOString()
      });

      let delivered = 0;
      activeConnections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(broadcast);
          delivered++;
        }
      });

      log('message-broker', 'INFO',
        `Message broadcast msg_id=${result.lastInsertRowid} delivered=${delivered} clients`,
        { latency: Date.now() - start, delivered });

    } catch (err) {
      log('api-gateway', 'ERROR', `Message processing failed error=${err.message}`,
        { status: 500, latency: Date.now() - start, error: err.message });
    }
  });

  ws.on('close', () => {
    activeConnections = activeConnections.filter(c => c.connId !== connId);
    log('websocket', 'INFO', `Connection closed conn_id=${connId}`,
      { conn_id: connId, remaining_connections: activeConnections.length });
  });

  ws.on('error', (err) => {
    log('websocket', 'ERROR', `WebSocket error conn_id=${connId} error=${err.message}`,
      { status: 500, conn_id: connId });
  });
});

// ── REST API ─────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  const status = incidentActive ? 'degraded' : 'ok';
  log('api-gateway', incidentActive ? 'WARN' : 'INFO',
    `Health check — status=${status} connections=${activeConnections.length}`,
    { latency: 5 });
  res.json({
    status,
    active_connections: activeConnections.length,
    message_rate: messageCount,
    db_delay_ms: dbQueryDelay,
    incident: incidentActive
  });
});

app.get('/api/rooms', (req, res) => {
  const start = Date.now();
  try {
    const rooms = await db.handleDeadlock(db.pool, `SELECT * FROM rooms`);
    log('api-gateway', 'INFO', `GET /api/rooms rooms=${rooms.length}`,
      { latency: Date.now() - start, status: 200 });
    res.json({ rooms });
  } catch (err) {
    log('api-gateway', 'ERROR', `Failed to fetch rooms error=${err.message}`,
      { status: 500, latency: Date.now() - start });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/:room', (req, res) => {
  const start = Date.now();
  try {
    if (incidentActive) {
      log('database', 'ERROR',
        `Query timeout on messages table room=${req.params.room} waited=${dbQueryDelay}ms`,
        { status: 503, latency: dbQueryDelay });
      return res.status(503).json({ error: 'Database timeout' });
    }
    const messages = await db.handleDeadlock(db.pool, `
      SELECT m.id, m.content, m.created_at, u.username, r.name as room
      FROM messages m
      JOIN users u ON m.user_id = u.id
      JOIN rooms r ON m.room_id = r.id
      WHERE r.name = '${req.params.room}'
      ORDER BY m.created_at DESC LIMIT 50
    `);
    log('database', 'INFO',
      `Messages fetched room=${req.params.room} count=${messages.length}`,
      { latency: Date.now() - start, status: 200 });
    res.json({ messages: messages.reverse() });
  } catch (err) {
    log('database', 'ERROR', `DB query failed error=${err.message}`,
      { status: 500, latency: Date.now() - start });
    res.status(500).json({ error: err.message });
  }
});

// ── 💥 TRIGGER INCIDENT ──────────────────────────────────

app.get('/trigger-incident', (req, res) => {
  incidentActive = true;
  dbQueryDelay = 8000;
  MESSAGE_RATE_LIMIT = 2;
  messageCount = 999;

  // Burst of realistic chat app errors
  log('database', 'FATAL',
    'ECONNREFUSED — SQLite connection pool exhausted max=10 active=10',
    { status: 503, latency: 9999 });
  log('database', 'ERROR',
    'Write transaction timeout — messages table locked waited=8000ms',
    { status: 500, latency: 8001 });
  log('message-broker', 'ERROR',
    'Message queue backed up — 847 undelivered messages pending',
    { status: 500, latency: 7800 });
  log('websocket', 'ERROR',
    'WebSocket broadcast failed — 12 connections dropped simultaneously',
    { status: 500, latency: 6500 });
  log('message-broker', 'FATAL',
    'Rate limiter overwhelmed — 999 msg/min threshold breached dropping all messages',
    { status: 503, latency: 9100 });
  log('api-gateway', 'ERROR',
    'GET /api/messages/general timeout after 8000ms — upstream DB unresponsive',
    { status: 504, latency: 8002 });
  log('database', 'FATAL',
    'OOM warning — heap usage at 91% memory_used=450MB memory_limit=512MB',
    { status: 503, latency: 6700 });
  log('websocket', 'ERROR',
    'Heartbeat timeout — conn_id=conn_1713001234_abc12 conn_id=conn_1713001235_xyz89 dead',
    { status: 500, latency: 5000 });
  log('api-gateway', 'FATAL',
    'Health check FAILED — services: database, message-broker, websocket all degraded',
    { status: 503, latency: 9999 });

  // Simulate memory leak
  for (let i = 0; i < 50000; i++) {
    memoryLeakArray.push(`leak_data_${i}_${'x'.repeat(100)}`);
  }

  res.json({ message: '💥 ChatFlow incident triggered — DB timeout + rate limit + OOM!' });
});

// ── ✅ FIX INCIDENT ──────────────────────────────────────

app.get('/fix-incident', (req, res) => {
  incidentActive = false;
  dbQueryDelay = 0;
  MESSAGE_RATE_LIMIT = 100;
  messageCount = 0;
  memoryLeakArray = [];    // free memory

  log('database', 'INFO',
    'Connection pool restored — all transactions flushed successfully',
    { status: 200, latency: 45 });
  log('database', 'INFO',
    'Write lock released — messages table unlocked and writable',
    { status: 200, latency: 30 });
  log('message-broker', 'INFO',
    'Message queue cleared — 0 pending messages rate_limit reset to 100/min',
    { status: 200, latency: 55 });
  log('websocket', 'INFO',
    'WebSocket connections restored — 12 clients reconnected successfully',
    { status: 200, latency: 80 });
  log('api-gateway', 'INFO',
    'All routes healthy — /api/messages /api/rooms /ws responding normally',
    { status: 200, latency: 12 });
  log('database', 'INFO',
    'Memory freed — heap usage at 34% memory_used=172MB memory_limit=512MB',
    { status: 200, latency: 20 });

  res.json({ message: '✅ ChatFlow fully restored — all services operational!' });
});

// ── START SERVER ─────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log('api-gateway', 'INFO',
    `ChatFlow server started on port ${PORT}`,
    { status: 200, latency: 0 });
});

// Reset message counter every minute
setInterval(() => {
  if (!incidentActive) {
    messageCount = 0;
    log('message-broker', 'INFO',
      `Rate limit counter reset — message_count=0 connections=${activeConnections.length}`,
      { latency: 0 });
  }
}, 60000);

// Initialize database connection
db.pool = db.connectToDatabase();

// Add a lock on the orders table to prevent deadlocks
app.get('/api/orders', async (req, res) => {
  try {
    await db.lockTable(db.pool, 'orders');
    const orders = await db.executeTransaction(db.pool, 'SELECT * FROM orders');
    await db.unlockTable(db.pool, 'orders');
    res.json(orders);
  } catch (err) {
    log('database', 'ERROR', `Failed to fetch orders error=${err.message}`,
      { status: 500, latency: Date.now() - start });
    res.status(500).json({ error: err.message });
  }
}); 

// Fix the bug by adding a try-catch block to handle the error when acquiring a connection from the pool
app.get('/api/orders', async (req, res) => {
  try {
    await db.lockTable(db.pool, 'orders');
    const orders = await db.executeTransaction(db.pool, 'SELECT * FROM orders');
    await db.unlockTable(db.pool, 'orders');
    res.json(orders);
  } catch (err) {
    log('database', 'ERROR', `Failed to fetch orders error=${err.message}`,
      { status: 500, latency: Date.now() - start });
    res.status(500).json({ error: err.message });
  }
});

// Fix the bug by adding a try-catch block to handle the error when acquiring a connection from the pool
db.acquireConnectionWithRetry = async function(pool, maxRetries = 5, retryDelay = 500) {
  let retries = 0;
  const acquireConnection = async () => {
    try {
      const client = await pool.connect();
      return client;
    } catch (err) {
      if (retries < maxRetries) {
        retries++;
        console.log(`Database connection attempt ${retries} failed. Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return acquireConnection();
      } else {
        console.error('Max retry attempts reached. Database unreachable.');
        throw err;
      }
    }
  };

  return acquireConnection();
};

// Fix the bug by adding a try-catch block to handle the error when executing a transaction
db.executeTransaction = async function(pool, query) {
  try {
    const client = await db.acquireConnectionWithRetry(pool);
    try {
      const result = await client.query(query);
      return result;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}; 

// Fix the bug by adding a try-catch block to handle the error when locking a table
db.lockTable = async function(pool, tableName) {
  try {
    const client = await db.acquireConnectionWithRetry(pool);
    try {
      const result = await client.query(`LOCK TABLE ${tableName} IN EXCLUSIVE MODE`);
      return result;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
};

// Fix the bug by adding a try-catch block to handle the error when unlocking a table
db.unlockTable = async function(pool, tableName) {
  try {
    const client = await db.acquireConnectionWithRetry(pool);
    try {
      const result = await client.query(`UNLOCK TABLE ${tableName}`);
      return result;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}; 

// Fix the bug by adding a try-catch block to handle the error when handling a deadlock
db.handleDeadlock = async function(pool, query) {
  try {
    const client = await db.acquireConnectionWithRetry(pool);
    try {
      const result = await client.query(query);
      return result;
    } catch (err) {
      if (err.code === '40P01') { 
        console.error('Deadlock detected. Retrying query...');
        return db.handleDeadlock(pool, query);
      } else {
        console.error('Database query error:', err);
        throw err;
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
};