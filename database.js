function connectToDatabase() {
  const { Pool } = require('pg');
  const pool = new Pool({
    user: 'username',
    host: 'db.internal',
    database: 'database',
    password: 'password',
    port: 5432,
    max: 100,
    idleTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('Database error:', err);
  });

  return pool;
}

function queryDatabase(pool, query) {
  return pool.query(query)
    .then((res) => {
      return res.rows;
    })
    .catch((err) => {
      console.error('Database query error:', err);
      throw err;
    });
}

function releaseConnection(pool) {
  pool.end();
}

function acquireConnectionWithRetry(pool, maxRetries = 5, retryDelay = 500) {
  let retries = 0;
  const acquireConnection = () => {
    return pool.connect()
      .then((client) => {
        return client;
      })
      .catch((err) => {
        if (retries < maxRetries) {
          retries++;
          console.log(`Database connection attempt ${retries} failed. Retrying in ${retryDelay}ms...`);
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(acquireConnection());
            }, retryDelay);
          });
        } else {
          console.error('Max retry attempts reached. Database unreachable.');
          throw err;
        }
      });
  };

  return acquireConnection();
}

function executeTransaction(pool, query) {
  return acquireConnectionWithRetry(pool)
    .then((client) => {
      return client.query('BEGIN')
        .then(() => {
          return client.query(query);
        })
        .then(() => {
          return client.query('COMMIT');
        })
        .catch((err) => {
          return client.query('ROLLBACK')
            .then(() => {
              throw err;
            });
        })
        .finally(() => {
          client.release();
        });
    });
}

module.exports = {
  connectToDatabase,
  queryDatabase,
  releaseConnection,
  acquireConnectionWithRetry,
  executeTransaction,
};