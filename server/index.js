const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Jobs database
const jobs = [];

// Users store
const users = {};

/*
User structure:
{
  id,
  username,
  role: "client" | "helper"
}
*/

app.get("/", (req, res) => {
  res.send("InstantFix backend running");
});

app.get("/jobs", (req, res) => {
  res.json(jobs);
});

app.get("/users", (req, res) => {
  res.json(users);
});

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  // REGISTER USER
  socket.on("user:join", (data) => {
    users[socket.id] = {
      id: socket.id,
      username: data.username,
      role: data.role
    };

    socket.emit("user:ready", users[socket.id]);
  });

  // SEND JOBS ON CONNECT
  socket.emit("jobs:init", jobs);

  // CREATE JOB
  socket.on("job:create", (data) => {
    const job = {
      id: Date.now().toString(),
      title: data.title,
      description: data.description,
      location: data.location,
      status: "open",
      ownerId: socket.id,
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
    job.helperId = socket.id;

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
    console.log("disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("InstantFix running on port", PORT);
});