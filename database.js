const Database = require('better-sqlite3');
const db = new Database('chatflow.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER,
    user_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(room_id) REFERENCES rooms(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Seed default rooms
const seedRooms = db.prepare(`INSERT OR IGNORE INTO rooms (name) VALUES (?)`);
['general', 'random', 'tech-talk', 'support'].forEach(r => seedRooms.run(r));

// Seed default users
const seedUsers = db.prepare(`INSERT OR IGNORE INTO users (username) VALUES (?)`);
['alice', 'bob', 'charlie', 'diana', 'eve'].forEach(u => seedUsers.run(u));

module.exports = db;