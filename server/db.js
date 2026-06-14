const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(
  path.join(__dirname, "instantfix.db")
);

/* USERS */
db.run(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
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
  helperId TEXT
)
`);

module.exports = db;