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
      role TEXT NOT NULL DEFAULT 'client',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* =========================
     JOBS TABLE (PRODUCTION STRUCTURE)
  ========================= */
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,

      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,

      status TEXT NOT NULL DEFAULT 'open',
      CHECK(status IN ('open', 'accepted', 'done', 'cancelled')),

      clientId INTEGER NOT NULL,
      workerId INTEGER,

      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* =========================
     JOB ACTIVITY LOG (NEW)
     Tracks lifecycle changes
  ========================= */
  db.run(`
    CREATE TABLE IF NOT EXISTS job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId TEXT NOT NULL,
      action TEXT NOT NULL,
      actorId INTEGER,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* =========================
     INDEXES (PERFORMANCE)
  ========================= */
  db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(clientId)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_worker ON jobs(workerId)`);

});

module.exports = db;