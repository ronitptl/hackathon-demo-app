function connectToDatabase() {
  const maxRetryAttempts = 5;
  const retryDelay = 500; // milliseconds
  let retryCount = 0;

  function attemptConnection() {
    try {
      // Establish a connection to the database
      const dbConnection = establishDbConnection();
      return dbConnection;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        retryCount++;
        if (retryCount <= maxRetryAttempts) {
          setTimeout(attemptConnection, retryDelay);
        } else {
          throw new Error('Max retry attempts reached — database unreachable');
        }
      } else {
        throw error;
      }
    }
  }

  return attemptConnection();
}

function establishDbConnection() {
  // Implement database connection logic here
  // For example, using a database driver like pg for PostgreSQL
  const { Pool } = require('pg');
  const pool = new Pool({
    user: 'username',
    host: 'db.internal',
    database: 'database',
    password: 'password',
    port: 5432,
  });

  return pool;
}

function handleDeadlock(error) {
  if (error.code === '40P01') { // Deadlock detected
    // Implement retry logic or other error handling mechanisms
    console.error('Deadlock detected:', error);
    // Consider rolling back the current transaction and retrying
  } else {
    throw error;
  }
}

// Example usage:
const dbConnection = connectToDatabase();
dbConnection.query('SELECT * FROM orders', (error, results) => {
  if (error) {
    handleDeadlock(error);
  } else {
    console.log(results);
  }
});
===