const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(
  path.join(__dirname, "instantfix.db")
);

db.serialize(() => {
  /* USERS */
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  /* JOBS */
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      location TEXT,
      status TEXT,
      clientId TEXT,
      workerId TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `);

  /* ACTIVITY LOGS */
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      role TEXT,
      action TEXT,
      metadata TEXT,
      createdAt TEXT
    )
  `);

  /* ANALYTICS EVENTS */
  db.run(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      userId TEXT,
      role TEXT,
      value TEXT,
      createdAt TEXT
    )
  `);
});

db.run(`
  CREATE TABLE IF NOT EXISTS wallets (
    userId TEXT PRIMARY KEY,
    balance REAL DEFAULT 0
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    type TEXT,
    amount REAL,
    fee REAL,
    net REAL,
    jobId TEXT,
    createdAt TEXT
  )
`);

module.exports = db;