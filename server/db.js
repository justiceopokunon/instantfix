const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(
  path.join(__dirname, "instantfix.db")
);

db.serialize(() => {

  /* =========================
     USERS TABLE (HARDENED)
  ========================= */
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('client','helper','admin')),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* =========================
     JOBS TABLE (HARDENED)
  ========================= */
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open','accepted','done','cancelled')) DEFAULT 'open',
      clientId TEXT NOT NULL,
      workerId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* =========================
     SAFE MIGRATION: helperId → workerId
  ========================= */
  db.all("PRAGMA table_info(jobs)", [], (err, columns) => {
    if (err) return;

    const columnNames = columns.map(c => c.name);

    // If old column exists
    if (columnNames.includes("helperId") && !columnNames.includes("workerId")) {

      db.run(`ALTER TABLE jobs ADD COLUMN workerId TEXT`, () => {

        db.run(`
          UPDATE jobs
          SET workerId = helperId
          WHERE workerId IS NULL AND helperId IS NOT NULL
        `);

      });
    }
  });

});

module.exports = db;