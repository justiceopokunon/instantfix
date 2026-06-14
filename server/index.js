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

// AUTH ROUTES
app.use("/auth", authRouter);

app.get("/", (req, res) => {
  res.send("InstantFix backend running");
});

// SOCKET AUTH
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

io.on("connection", (socket) => {
  console.log("connected:", socket.user.email, "| role:", socket.user.role);

  // SEND ALL JOBS FROM DB
  db.all("SELECT * FROM jobs", [], (err, rows) => {
    socket.emit("jobs:init", rows || []);
  });

  // CREATE JOB (CLIENT ONLY)
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
      (err) => {
        if (err) return;
        io.emit("job:new", job);
      }
    );
  });

  // ACCEPT JOB (HELPER ONLY)
  socket.on("job:accept", ({ jobId }) => {
    if (socket.user.role !== "helper") return;

    db.run(
      `UPDATE jobs SET status = ?, helperId = ? WHERE id = ? AND status = 'open'`,
      ["accepted", socket.user.id, jobId],
      function (err) {
        if (err) return;

        db.get(`SELECT * FROM jobs WHERE id = ?`, [jobId], (err, job) => {
          if (!job) return;
          io.emit("job:update", job);
        });
      }
    );
  });

  // COMPLETE JOB (HELPER ONLY)
  socket.on("job:done", ({ jobId }) => {
    if (socket.user.role !== "helper") return;

    db.run(
      `UPDATE jobs SET status = ? WHERE id = ?`,
      ["done", jobId],
      function (err) {
        if (err) return;

        db.get(`SELECT * FROM jobs WHERE id = ?`, [jobId], (err, job) => {
          if (!job) return;
          io.emit("job:update", job);
        });
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