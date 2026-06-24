const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const { router: authRouter, JWT_SECRET } = require("./auth");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* =========================
   FRONTEND
========================= */
app.use(express.static(path.join(__dirname, "../client")));
app.use("/auth", authRouter);

app.get("/", (req, res) => {
  res.send("InstantFix backend running");
});

/* =========================
   SOCKET AUTH
========================= */
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token provided"));

    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

/* =========================
   ROLE HELPERS
========================= */
const isClient = (s) => s.user.role === "client";
const isHelper = (s) => s.user.role === "helper";
const isAdmin = (s) => s.user.role === "admin";

/* =========================
   ACTIVITY LOGGER
========================= */
function logActivity(io, db, { userId, role, action, metadata }) {
  const log = {
    userId: userId || null,
    role: role || "system",
    action,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: new Date().toISOString()
  };

  db.run(
    `INSERT INTO activity_logs (userId, role, action, metadata, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [log.userId, log.role, log.action, log.metadata, log.createdAt]
  );

  io.to("admin").emit("activity:new", log);
}

/* =========================
   CONNECTION
========================= */
io.on("connection", (socket) => {
  console.log("CONNECTED:", socket.user.email, socket.user.role);

  socket.join(socket.user.role);
  socket.join(`user:${socket.user.id}`);

  sendJobs(socket);

  socket.emit("connected", { user: socket.user });

  /* =========================
     CREATE JOB
  ========================= */
  socket.on("job:create", (data) => {
    if (!isClient(socket)) return;
    if (!data?.title || !data?.description || !data?.location) return;

    const job = {
      id: Date.now().toString(),
      title: data.title,
      description: data.description,
      location: data.location,
      status: "open",
      clientId: socket.user.id,
      workerId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.run(
      `INSERT INTO jobs (
        id, title, description, location,
        status, clientId, workerId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.title,
        job.description,
        job.location,
        job.status,
        job.clientId,
        job.workerId,
        job.createdAt,
        job.updatedAt
      ],
      (err) => {
        if (err) return console.log(err.message);

        io.to("helper").emit("job:new", job);
        io.to(`user:${job.clientId}`).emit("job:new", job);

        logActivity(io, db, {
          userId: job.clientId,
          role: "client",
          action: "job_created",
          metadata: job
        });
      }
    );
  });

  /* =========================
     ACCEPT JOB
  ========================= */
  socket.on("job:accept", ({ jobId }) => {
    if (!isHelper(socket)) return;

    db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, job) => {
      if (err || !job || job.status !== "open") return;

      db.run(
        `UPDATE jobs SET status='accepted', workerId=?, updatedAt=CURRENT_TIMESTAMP
         WHERE id=? AND status='open'`,
        [socket.user.id, jobId],
        (err) => {
          if (err) return;

          db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, updated) => {
            if (!err && updated) {
              io.to("helper").emit("job:update", updated);
              io.to(`user:${updated.clientId}`).emit("job:update", updated);

              logActivity(io, db, {
                userId: socket.user.id,
                role: "helper",
                action: "job_accepted",
                metadata: { jobId }
              });
            }
          });
        }
      );
    });
  });

  /* =========================
     COMPLETE JOB
  ========================= */
  socket.on("job:done", ({ jobId }) => {
    if (!isHelper(socket)) return;

    db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, job) => {
      if (err || !job || job.workerId !== socket.user.id) return;

      db.run(
        `UPDATE jobs SET status='done', updatedAt=CURRENT_TIMESTAMP
         WHERE id=?`,
        [jobId],
        (err) => {
          if (err) return;

          db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, updated) => {
            if (!err && updated) {
              io.to("helper").emit("job:update", updated);
              io.to(`user:${updated.clientId}`).emit("job:update", updated);

              logActivity(io, db, {
                userId: socket.user.id,
                role: "helper",
                action: "job_completed",
                metadata: { jobId }
              });
            }
          });
        }
      );
    });
  });

  /* =========================
     ADMIN LOG STREAM
  ========================= */
  socket.on("admin:logs:live", () => {
    if (!isAdmin(socket)) return;

    db.all(
      "SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100",
      [],
      (err, rows) => {
        if (!err) socket.emit("activity:init", rows || []);
      }
    );
  });

  socket.on("disconnect", () => {
    console.log("DISCONNECTED:", socket.user.email);
  });
});

/* =========================
   SEND JOBS
========================= */
function sendJobs(socket) {
  db.all("SELECT * FROM jobs", [], (err, rows) => {
    if (!err) {
      socket.emit("jobs:init", rows || []);
    }
  });
}

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("InstantFix running on port", PORT);
});