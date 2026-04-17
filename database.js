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

// Example usage:
const pool = connectToDatabase();

// Implement retry logic with exponential backoff
function retryQuery(pool, query, retries = 0) {
  return queryDatabase(pool, query)
    .catch((err) => {
      if (retries < 5) {
        const delay = Math.pow(2, retries) * 1000;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(retryQuery(pool, query, retries + 1));
          }, delay);
        });
      } else {
        throw err;
      }
    });
}

// Deadlock detection and handling
function detectDeadlock(pool, query) {
  return pool.query(`SELECT * FROM pg_locks WHERE relation = 'orders' AND mode = 'exclusive'`)
    .then((res) => {
      if (res.rows.length > 0) {
        throw new Error('Deadlock detected on table=orders');
      } else {
        return queryDatabase(pool, query);
      }
    });
}

// Example usage with retry and deadlock detection:
retryQuery(pool, 'SELECT * FROM orders')
  .then((results) => {
    console.log(results);
  })
  .catch((err) => {
    console.error(err);
  })
  .finally(() => {
    closeDatabaseConnection(pool);
  });