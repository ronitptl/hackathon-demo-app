function connectToDatabase() {
  const { Pool } = require('pg');
  const pool = new Pool({
    user: 'username',
    host: 'db.internal',
    database: 'database',
    password: 'password',
    port: 5432,
    max: 100,
    idleTimeoutMillis: 30000
  });

  pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });

  return pool;
}

function queryDatabase(pool, query) {
  return pool.query(query)
    .then((res) => {
      return res.rows;
    })
    .catch((err) => {
      console.error('Error querying database', err);
      throw err;
    });
}

function closeDatabaseConnection(pool) {
  pool.end();
}

// Added a mechanism to handle connection pool exhaustion
function handleConnectionPoolExhaustion(pool) {
  pool.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
      console.error('Connection pool exhausted. Waiting for 5 seconds before retrying...');
      setTimeout(() => {
        connectToDatabase();
      }, 5000);
    }
  });
}

// Added a mechanism to detect and handle deadlocks
function handleDeadlock(pool) {
  pool.on('error', (err) => {
    if (err.code === '40P01') { // 40P01 is the PostgreSQL error code for deadlock
      console.error('Deadlock detected. Rolling back transaction and retrying...');
      pool.query('ROLLBACK');
      connectToDatabase();
    }
  });
}

module.exports = {
  connectToDatabase,
  queryDatabase,
  closeDatabaseConnection,
  handleConnectionPoolExhaustion,
  handleDeadlock
};