const express = require("express");
const http = require("http");
const cors = require("cors");
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

app.use("/auth", authRouter);

app.get("/", (req, res) => {
  res.send("InstantFix backend running");
});

// AUTH MIDDLEWARE
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

// ADMIN CHECK
function requireAdmin(socket) {
  return socket.user?.role === "admin";
}

io.on("connection", (socket) => {
  console.log("connected:", socket.user.email, "| role:", socket.user.role);

  // SEND JOBS
  db.all("SELECT * FROM jobs", [], (err, rows) => {
    socket.emit("jobs:init", rows || []);
  });

  // CREATE JOB (CLIENT)
  socket.on("job:create", (data) => {
    if (socket.user.role !== "client") return;

    const job = {
      id: Date.now().toString(),
      title: data.title,
      description: data.description,
      location: data.location,
      status: "open",
      clientId: socket.user.id,
      helperId: null
    };

    db.run(
      `INSERT INTO jobs (id, title, description, location, status, clientId, helperId)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.title,
        job.description,
        job.location,
        job.status,
        job.clientId,
        job.helperId
      ],
      () => io.emit("job:new", job)
    );
  });

  // ACCEPT JOB (HELPER)
  socket.on("job:accept", ({ jobId }) => {
    if (socket.user.role !== "helper") return;

    db.run(
      `UPDATE jobs SET status = ?, helperId = ? WHERE id = ? AND status = 'open'`,
      ["accepted", socket.user.id, jobId],
      () => {
        db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, job) => {
          if (job) io.emit("job:update", job);
        });
      }
    );
  });

  // COMPLETE JOB (HELPER)
  socket.on("job:done", ({ jobId }) => {
    if (socket.user.role !== "helper") return;

    db.run(
      `UPDATE jobs SET status = ? WHERE id = ?`,
      ["done", jobId],
      () => {
        db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, job) => {
          if (job) io.emit("job:update", job);
        });
      }
    );
  });

  // ---------------- ADMIN SYSTEM ----------------

  // GET USERS
  socket.on("admin:users", () => {
    if (!requireAdmin(socket)) return;

    db.all("SELECT id, email, role FROM users", [], (err, rows) => {
      socket.emit("admin:users:data", rows || []);
    });
  });

  // GET JOBS
  socket.on("admin:jobs", () => {
    if (!requireAdmin(socket)) return;

    db.all("SELECT * FROM jobs", [], (err, rows) => {
      socket.emit("admin:jobs:data", rows || []);
    });
  });

  // DELETE JOB
  socket.on("admin:deleteJob", ({ jobId }) => {
    if (!requireAdmin(socket)) return;

    db.run("DELETE FROM jobs WHERE id = ?", [jobId], () => {
      io.emit("job:deleted", { jobId });
    });
  });

  // CHANGE ROLE
  socket.on("admin:setRole", ({ userId, role }) => {
    if (!requireAdmin(socket)) return;

    db.run(
      "UPDATE users SET role = ? WHERE id = ?",
      [role, userId],
      () => {
        socket.emit("admin:roleUpdated", { userId, role });
      }
    );
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.user.email);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("InstantFix running on port", PORT);
});