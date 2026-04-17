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

function handleDatabaseError(error) {
  if (error.code === 'ECONNREFUSED') {
    console.error('ECONNREFUSED — connection pool exhausted');
  } else if (error.message.includes('Deadlock detected')) {
    console.error('Deadlock detected on table=orders');
  } else {
    console.error('Unknown database error:', error);
  }
}

// Example usage:
const dbConnection = connectToDatabase();
dbConnection.query('SELECT * FROM orders', (error, results) => {
  if (error) {
    handleDatabaseError(error);
  } else {
    console.log(results.rows);
  }
});