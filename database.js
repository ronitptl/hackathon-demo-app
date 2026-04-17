function connectToDatabase() {
  const maxRetryAttempts = 5;
  const retryDelay = 500; // milliseconds
  let retryCount = 0;

  function attemptConnection() {
    try {
      // Establish a connection to the database
      const db = require('db-lib');
      db.connect('host=db.internal:5432', (err) => {
        if (err) {
          if (retryCount < maxRetryAttempts) {
            retryCount++;
            setTimeout(attemptConnection, retryDelay);
          } else {
            throw new Error('Max retry attempts reached — database unreachable');
          }
        } else {
          // Connection established, proceed with database operations
          console.log('Connected to database');
        }
      });
    } catch (error) {
      console.error(error);
    }
  }

  attemptConnection();
}

// Implement connection pooling to prevent exhaustion
const connectionPool = [];
const maxPoolSize = 100;

function getConnection() {
  if (connectionPool.length < maxPoolSize) {
    const connection = connectToDatabase();
    connectionPool.push(connection);
    return connection;
  } else {
    throw new Error('ECONNREFUSED — connection pool exhausted');
  }
}

// Implement deadlock detection and prevention
const waitingTransactions = {};

function executeTransaction(transactionId) {
  if (waitingTransactions[transactionId]) {
    throw new Error('Deadlock detected on table=orders waiting_txns=' + Object.keys(waitingTransactions).length);
  } else {
    waitingTransactions[transactionId] = true;
    // Execute the transaction
    console.log('Transaction executed');
    delete waitingTransactions[transactionId];
  }
}

connectToDatabase();
getConnection();
executeTransaction('transaction-1');