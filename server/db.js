const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./instantfix.db");

// Create table
db.serialize(() => {
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
});

// GET ALL JOBS
function getJobs(callback) {
  db.all("SELECT * FROM jobs", [], (err, rows) => {
    callback(rows || []);
  });
}

// ADD JOB
function addJob(job, callback) {
  const stmt = `
    INSERT INTO jobs (id, title, description, location, status, clientId, workerId)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    stmt,
    [
      job.id,
      job.title,
      job.description,
      job.location,
      job.status,
      job.clientId,
      job.workerId
    ],
    callback
  );
}

// UPDATE JOB
function updateJob(job, callback) {
  const stmt = `
    UPDATE jobs
    SET title=?, description=?, location=?, status=?, clientId=?, workerId=?
    WHERE id=?
  `;

  db.run(
    stmt,
    [
      job.title,
      job.description,
      job.location,
      job.status,
      job.clientId,
      job.workerId,
      job.id
    ],
    callback
  );
}

module.exports = {
  getJobs,
  addJob,
  updateJob
};