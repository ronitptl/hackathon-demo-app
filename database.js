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
    executeQuery(query);
  } catch (error) {
    console.error(`Error executing query: ${error.message}`);
    throw error;
  } finally {
    lock.release();
  }
}

// To prevent connection pool exhaustion, use a queue
class Queue {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.queue = [];
  }

  enqueue(item) {
    if (this.queue.length < this.maxSize) {
      this.queue.push(item);
    } else {
      throw new Error('Queue is full');
    }
  }

  dequeue() {
    if (this.queue.length > 0) {
      return this.queue.shift();
    } else {
      return null;
    }
  }
}

const queryQueue = new Queue(100);

function executeQueryWithQueue(query) {
  queryQueue.enqueue(query);
  const queuedQuery = queryQueue.dequeue();
  if (queuedQuery) {
    executeQueryWithLock(queuedQuery);
  }
}

// Test the functions
executeQueryWithQueue('SELECT * FROM orders');