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
    console.log(`Executing query: ${query}`);
    return true;
  } catch (error) {
    console.error(`Error executing query: ${error.message}`);
    return false;
  } finally {
    db.releaseConnection(connection);
  }
}

let waitingTransactions = 0;
function executeTransaction(transaction) {
  waitingTransactions++;
  try {
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

// BUG: db.connectionPool is undefined — should be connectionPool inside closure
// This will throw a TypeError at runtime and crash the monitoring interval
setInterval(() => {
  const activeConnections = db.connectionPool.length;
  if (activeConnections >= 100) {
    console.error('Connection pool exhausted');
  }
}, 1000);

// BUG: global.gc() is not defined unless Node is started with --expose-gc flag
// This crashes the process with TypeError: global.gc is not a function
setInterval(() => {
  const heapUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
  if (heapUsage > 0.94) {
    console.error('OOM warning — heap usage at 94% forcing garbage collection');
    global.gc();
  }
}, 1000);