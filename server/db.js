const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(
  path.join(__dirname, "instantfix.db")
);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      location TEXT,
      status TEXT,
      clientId TEXT,
      workerId TEXT
    )
  `);

  db.all("PRAGMA table_info(jobs)", [], (err, columns) => {
    if (err) return;

    const columnNames = columns.map((column) => column.name);

    if (columnNames.includes("helperId") && !columnNames.includes("workerId")) {
      db.run("ALTER TABLE jobs ADD COLUMN workerId TEXT", () => {
        db.run("UPDATE jobs SET workerId = helperId WHERE workerId IS NULL AND helperId IS NOT NULL");
      });
    }
  });
});

module.exports = db;