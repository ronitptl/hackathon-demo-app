const { Pool } = require('pg');
const logger = require('./logger');

const dbConfig = {
  user: 'username',
  host: 'db.internal',
  database: 'database',
  password: 'password',
  port: 5432,
  max: 100,
  idleTimeoutMillis: 30000,
};

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
  logger.error('Database error:', err);
});

const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    logger.error('Database query error:', err);
    throw err;
  }
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Database transaction error:', err);
    throw err;
  } finally {
    client.release();
  }
};

const closePool = async () => {
  await pool.end();
};

module.exports = {
  query,
  transaction,
  closePool,
};

// Added to handle connection pool exhaustion and deadlocks
setInterval(async () => {
  const { total, idle, waiting } = await pool.getStatus();
  if (waiting > 0) {
    logger.warn(`Connection pool waiting: ${waiting}`);
    // Implement a strategy to handle waiting connections, e.g., increase pool size or terminate long-running queries
  }
}, 60000); // Check every 1 minute

// Added to handle out-of-memory warnings
process.on('warning', (warning) => {
  if (warning.name === 'MemoryWarning') {
    logger.warn('Out-of-memory warning:', warning);
    // Implement a strategy to handle out-of-memory warnings, e.g., increase heap size or optimize memory usage
  }
});