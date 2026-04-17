const express = require('express');
const app = express();
app.use(express.json());

let CONNECTION_POOL_LIMIT = 10;
let activeConnections = 0;
let incidentActive = false;

// Helper to print structured JSON logs
function log(service, level, message, latency_ms, status_code) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service,
    level,
    message,
    latency_ms,
    status_code
  }));
}

// ─── NORMAL ROUTES ───────────────────────────────────────────

app.get('/health', (req, res) => {
  log('api-gateway', 'INFO', 'Health check passed', 12, 200);
  res.json({ status: 'ok', pool: `${activeConnections}/${CONNECTION_POOL_LIMIT}` });
});

app.get('/api/orders', (req, res) => {
  activeConnections++;

  if (activeConnections > CONNECTION_POOL_LIMIT) {
    log('database', 'ERROR',
      `ECONNREFUSED — connection pool exhausted max=${CONNECTION_POOL_LIMIT} active=${activeConnections}`,
      5000 + Math.floor(Math.random() * 3000), 500);
    log('api-gateway', 'ERROR',
      `Upstream timeout waiting for database response after 8000ms`,
      8001, 504);
    activeConnections = Math.max(0, activeConnections - 1);
    return res.status(500).json({ error: 'Database connection pool exhausted' });
  }

  log('api-gateway', 'INFO', `GET /api/orders 200 OK`, 140, 200);
  setTimeout(() => activeConnections = Math.max(0, activeConnections - 1), 2000);
  res.json({ orders: [{ id: 1, item: 'Product A' }, { id: 2, item: 'Product B' }] });
});

app.get('/api/auth', (req, res) => {
  if (incidentActive) {
    log('auth-service', 'ERROR',
      'Cannot validate token — database unavailable user_id=4821',
      7800, 503);
    return res.status(503).json({ error: 'Auth service unavailable' });
  }
  log('auth-service', 'INFO', 'Token validated for user_id=4821', 88, 200);
  res.json({ valid: true });
});

app.get('/api/payment', (req, res) => {
  if (incidentActive) {
    log('payment-service', 'ERROR',
      'Payment FAILED txn_id=TXN998900 reason=auth_service_unavailable',
      7500, 502);
    return res.status(502).json({ error: 'Payment failed' });
  }
  log('payment-service', 'INFO',
    'Payment processed txn_id=TXN998821 amount=1200.00', 193, 200);
  res.json({ success: true, txn_id: 'TXN998821' });
});

// ─── INCIDENT TRIGGER ─────────────────────────────────────────

app.get('/trigger-incident', (req, res) => {
  incidentActive = true;
  CONNECTION_POOL_LIMIT = 0;
  activeConnections = 100;

  // Burst of FATAL logs
  log('database', 'FATAL',
    'Max retry attempts reached — database unreachable host=db.internal:5432',
    9999, 503);
  log('database', 'ERROR',
    'ECONNREFUSED — connection pool exhausted max=100 active=100',
    5000, 500);
  log('database', 'FATAL',
    'Deadlock detected on table=orders waiting_txns=47',
    8900, 503);
  log('database', 'ERROR',
    'Transaction rollback forced txn_id=TXN991234 reason=connection_lost',
    5200, 500);
  log('api-gateway', 'ERROR',
    'Circuit breaker OPEN for route /api/orders — too many failures',
    8200, 503);
  log('auth-service', 'ERROR',
    'Cannot validate token — database unavailable user_id=4821',
    7800, 503);
  log('payment-service', 'FATAL',
    'Payment gateway DOWN — 3 consecutive failures txn_id=TXN998900,TXN998901,TXN998902',
    9100, 503);
  log('database', 'FATAL',
    'OOM warning — heap usage at 94% forcing garbage collection',
    6700, 503);

  res.json({ message: '💥 Incident triggered — check your logs!' });
});

// ─── FIX / RESOLVE ────────────────────────────────────────────

app.get('/fix-incident', (req, res) => {
  incidentActive = false;
  CONNECTION_POOL_LIMIT = 10;
  activeConnections = 0;

  log('database', 'INFO',
    'Connection pool restored max=10 — all connections flushed successfully',
    45, 200);
  log('database', 'INFO',
    'Deadlock resolved — table=orders unlocked waiting_txns=0',
    30, 200);
  log('auth-service', 'INFO',
    'Service recovered — database connection re-established',
    92, 200);
  log('api-gateway', 'INFO',
    'Circuit breaker CLOSED — /api/orders route restored',
    55, 200);
  log('payment-service', 'INFO',
    'Payment gateway RESTORED — processing queue resumed',
    110, 200);

  res.json({ message: '✅ Incident resolved — all services restored' });
});

// ─── START ────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    level: 'INFO',
    message: `IncidentIQ Demo App started on port ${PORT}`,
    latency_ms: 0,
    status_code: 200
  }));
});