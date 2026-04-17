function connectToDatabase() {
  const maxRetries = 5;
  const retryDelay = 500;
  let retries = 0;

  function attemptConnection() {
    try {
      // Establish a connection to the database
      const db = require('pg');
      const client = new db.Client({
        host: 'db.internal',
        port: 5432,
      });
      client.connect((err) => {
        if (err) {
          throw err;
        }
        console.log('Connected to database');
      });
    } catch (error) {
      if (retries < maxRetries) {
        retries++;
        setTimeout(attemptConnection, retryDelay);
      } else {
        console.error('Max retry attempts reached — database unreachable');
        throw error;
      }
    }
  }

  attemptConnection();
}

function executeQuery(query) {
  const maxRetries = 3;
  const retryDelay = 1000;
  let retries = 0;

  function attemptQuery() {
    try {
      // Execute the query on the database
      const db = require('pg');
      const client = new db.Client({
        host: 'db.internal',
        port: 5432,
      });
      client.query(query, (err, result) => {
        if (err) {
          throw err;
        }
        console.log('Query executed successfully');
      });
    } catch (error) {
      if (retries < maxRetries) {
        retries++;
        setTimeout(attemptQuery, retryDelay);
      } else {
        console.error('Max retry attempts reached — query failed');
        throw error;
      }
    }
  }

  attemptQuery();
}

// Example usage:
connectToDatabase();
executeQuery('SELECT * FROM orders'); 

// Added a deadlock detection mechanism
const deadlockDetectionInterval = 10000; // 10 seconds
setInterval(() => {
  const db = require('pg');
  const client = new db.Client({
    host: 'db.internal',
    port: 5432,
  });
  client.query('SELECT * FROM pg_locks WHERE mode = $1', ['exclusive'], (err, result) => {
    if (err) {
      console.error('Error detecting deadlocks:', err);
    } else {
      const deadlocks = result.rows;
      if (deadlocks.length > 0) {
        console.error('Deadlock detected on table=orders');
      }
    }
  });
}, deadlockDetectionInterval);