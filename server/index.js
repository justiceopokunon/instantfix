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
    if (!token) return next(new Error("No token"));

    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;

    next();
  } catch (err) {
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
   CONNECTION
========================= */
io.on("connection", (socket) => {
  console.log("CONNECTED:", socket.user.email, socket.user.role);

  socket.emit("connected", { user: socket.user });

  sendJobs(socket);

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
      workerId: null
    };

    db.run(
      `INSERT INTO jobs (id, title, description, location, status, clientId, workerId)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.title,
        job.description,
        job.location,
        job.status,
        job.clientId,
        job.workerId
      ],
      (err) => {
        if (err) return console.log(err.message);
        io.emit("job:new", job);
      }
    );
  });

  /* =========================
     ACCEPT JOB (HARD RULES)
  ========================= */
  socket.on("job:accept", ({ jobId }) => {
    if (!isHelper(socket)) return;

    db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, job) => {
      if (err || !job) return;

      if (job.status !== "open") return;
      if (job.workerId) return;

      db.run(
        `UPDATE jobs SET status = 'accepted', workerId = ? WHERE id = ? AND status = 'open'`,
        [socket.user.id, jobId],
        (err) => {
          if (err) return console.log(err.message);

          db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, updated) => {
            if (updated) io.emit("job:update", updated);
          });
        }
      );
    });
  });

  /* =========================
     COMPLETE JOB (OWNER ONLY)
  ========================= */
  socket.on("job:done", ({ jobId }) => {
    if (!isHelper(socket)) return;

    db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, job) => {
      if (err || !job) return;

      if (job.status !== "accepted") return;
      if (job.workerId !== socket.user.id) return;

      db.run(
        `UPDATE jobs SET status = 'done' WHERE id = ?`,
        [jobId],
        (err) => {
          if (err) return console.log(err.message);

          db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, updated) => {
            if (updated) io.emit("job:update", updated);
          });
        }
      );
    });
  });

  /* =========================
     ADMIN USERS
========================= */
  socket.on("admin:users", () => {
    if (!isAdmin(socket)) return;

    db.all(
      "SELECT id, email, role FROM users ORDER BY id DESC",
      [],
      (err, rows) => {
        if (!err) socket.emit("admin:users:data", rows || []);
      }
    );
  });

  /* =========================
     ADMIN JOBS
========================= */
  socket.on("admin:jobs", () => {
    if (!isAdmin(socket)) return;

    db.all("SELECT * FROM jobs ORDER BY id DESC", [], (err, rows) => {
      if (!err) socket.emit("admin:jobs:data", rows || []);
    });
  });

  /* =========================
     ADMIN ROLE UPDATE
========================= */
  socket.on("admin:setRole", ({ userId, role }) => {
    if (!isAdmin(socket)) return;

    db.run(
      "UPDATE users SET role = ? WHERE id = ?",
      [role, userId],
      (err) => {
        if (err) return;

        broadcastUsers();
      }
    );
  });

  /* =========================
     ADMIN DELETE JOB
========================= */
  socket.on("admin:deleteJob", ({ jobId }) => {
    if (!isAdmin(socket)) return;

    db.run("DELETE FROM jobs WHERE id = ?", [jobId], (err) => {
      if (err) return;

      broadcastJobs();
    });
  });

  socket.on("disconnect", () => {
    console.log("DISCONNECTED:", socket.user.email);
  });
});

/* =========================
   HELPERS
========================= */
function sendJobs(socket) {
  db.all("SELECT * FROM jobs", [], (err, rows) => {
    if (!err) socket.emit("jobs:init", rows || []);
  });
}

function broadcastJobs() {
  db.all("SELECT * FROM jobs", [], (err, rows) => {
    if (!err) io.emit("admin:jobs:data", rows || []);
  });
}

function broadcastUsers() {
  db.all("SELECT id, email, role FROM users", [], (err, rows) => {
    if (!err) io.emit("admin:users:data", rows || []);
  });
}

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("InstantFix running on port", PORT);
});