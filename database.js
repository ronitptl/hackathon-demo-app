function connectToDatabase() {
  const maxConnections = 100;
  const connectionPool = [];

  function getConnection() {
    if (connectionPool.length < maxConnections) {
      const connection = createConnection();
      connectionPool.push(connection);
      return connection;
    } else {
      throw new Error('Connection pool exhausted');
    }
  }

  function releaseConnection(connection) {
    const index = connectionPool.indexOf(connection);
    if (index !== -1) {
      connectionPool.splice(index, 1);
    }
  }

  function createConnection() {
    // Simulate creating a database connection
    return {};
  }

  return {
    getConnection,
    releaseConnection,
  };
}

const db = connectToDatabase();

function executeQuery(query) {
  const connection = db.getConnection();
  try {
    // Simulate executing a query
    console.log(`Executing query: ${query}`);
    return true;
  } catch (error) {
    console.error(`Error executing query: ${error.message}`);
    return false;
  } finally {
    db.releaseConnection(connection);
  }
}

// Add deadlock detection and prevention
let waitingTransactions = 0;
function executeTransaction(transaction) {
  waitingTransactions++;
  try {
    // Simulate executing a transaction
    console.log(`Executing transaction: ${transaction}`);
    return true;
  } catch (error) {
    console.error(`Error executing transaction: ${error.message}`);
    return false;
  } finally {
    waitingTransactions--;
    if (waitingTransactions > 47) {
      throw new Error('Deadlock detected');
    }
  }
}

// Add connection pool monitoring
setInterval(() => {
  const activeConnections = db.connectionPool.length;
  if (activeConnections >= 100) {
    console.error('Connection pool exhausted');
  }
}, 1000);

// Add heap usage monitoring
setInterval(() => {
  const heapUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
  if (heapUsage > 0.94) {
    console.error('OOM warning — heap usage at 94% forcing garbage collection');
    global.gc();
  }
}, 1000);