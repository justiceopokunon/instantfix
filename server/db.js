const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// database file
const db = new sqlite3.Database(
  path.join(__dirname, "instantfix.db")
);

// initialize tables
db.serialize(() => {
  // USERS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  // JOBS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      location TEXT,
      status TEXT,
      clientId TEXT,
      helperId TEXT
    )
  `);
});

module.exports = db;