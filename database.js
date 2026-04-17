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
    return connection;
  } catch (error) {
    console.error(`Error executing query: ${error.message}`);
    throw error;
  } finally {
    db.releaseConnection(connection);
  }
}

// To prevent deadlock, use a lock mechanism
class Lock {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  acquire() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
    } else {
      this.locked = false;
    }
  }
}

const lock = new Lock();

async function executeQueryWithLock(query) {
  await lock.acquire();
  try {
    return executeQuery(query);
  } catch (error) {
    console.error(`Error executing query with lock: ${error.message}`);
    throw error;
  } finally {
    lock.release();
  }
}

// Example usage:
executeQueryWithLock('SELECT * FROM orders');