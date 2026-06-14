const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { router: authRouter, JWT_SECRET } = require("./auth");
const decoded = jwt.verify(token, JWT_SECRET);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const db = require("./db");

const jobs = [];
const users = {};

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

function requireRole(role) {
  return (socket, next) => {
    if (!socket.user || socket.user.role !== role) {
      return next(new Error("Unauthorized role"));
    }
    next();
  };
}

io.on("connection", (socket) => {
  console.log(
  "connected:",
  socket.user.email,
  "| role:",
  socket.user.role
);

  users[socket.id] = socket.user;

  socket.emit("jobs:init", jobs);

  // CREATE JOB
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

    jobs.push(job);
    io.emit("job:new", job);
  });

  // ACCEPT JOB
  socket.on("job:accept", ({ jobId }) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || job.status !== "open") return;

    job.status = "accepted";
    job.helperId = socket.user.id;

    io.emit("job:update", job);
  });

  // COMPLETE JOB
  socket.on("job:done", ({ jobId }) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    job.status = "done";
    io.emit("job:update", job);
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    console.log("user disconnected:", socket.user.email);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("InstantFix running on port", PORT);
});

  // SEND INITIAL DATA
  socket.emit("jobs:init", jobs);

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

    jobs.push(job);
    io.emit("job:new", job);
  });

  // ACCEPT JOB (HELPER ONLY)
  socket.on("job:accept", ({ jobId }) => {
    if (socket.user.role !== "helper") return;

    const job = jobs.find(j => j.id === jobId);
    if (!job || job.status !== "open") return;

    job.status = "accepted";
    job.helperId = socket.user.id;

    io.emit("job:update", job);
  });

  // COMPLETE JOB (HELPER ONLY)
  socket.on("job:done", ({ jobId }) => {
    if (socket.user.role !== "helper") return;

    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    job.status = "done";

    io.emit("job:update", job);
  });