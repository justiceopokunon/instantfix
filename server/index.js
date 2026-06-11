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

// In-memory job database
const jobs = [];

/*
Job structure:
{
  id,
  title,
  description,
  location,
  status: "open" | "accepted" | "done",
  helperId
}
*/

app.get("/", (req, res) => {
  res.send("InstantFix backend running");
});

app.get("/jobs", (req, res) => {
  res.json(jobs);
});

io.on("connection", (socket) => {
  console.log("user connected:", socket.id);

  // send current jobs on connect
  socket.emit("jobs:init", jobs);

  // CREATE JOB
  socket.on("job:create", (data) => {
    const job = {
      id: Date.now().toString(),
      title: data.title,
      description: data.description,
      location: data.location,
      status: "open",
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
    console.log("user disconnected:", socket.id);
  });
});

sconst PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("InstantFix running on port", PORT);
});