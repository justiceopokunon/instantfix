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
   FRONTEND SERVING
========================= */
app.use(express.static(path.join(__dirname, "../client")));

/* =========================
   AUTH ROUTES
========================= */
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

    if (!token) {
      return next(new Error("No token provided"));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;

    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

/* =========================
   CONNECTION
========================= */
io.on("connection", (socket) => {
  console.log("CONNECTED:", socket.user.email, socket.user.role);

  // DEBUG: confirm connection
  socket.emit("connected", { user: socket.user });

  // SEND JOBS (ALWAYS ON CONNECT)
  sendJobs(socket);

  /* =========================
     CREATE JOB
  ========================= */
  socket.on("job:create", (data) => {
    if (socket.user.role !== "client") return;

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
        if (err) {
          console.log("DB ERROR:", err.message);
          return;
        }

        io.emit("job:new", job);
      }
    );
  });

  /* ---------------- ADMIN USERS ---------------- */
  socket.on("admin:users", () => {
    if (socket.user.role !== "admin") return;

    db.all("SELECT id, email, role FROM users ORDER BY id DESC", [], (err, rows) => {
      if (err) {
        console.log("ADMIN USERS ERROR:", err.message);
        return;
      }

      socket.emit("admin:users:data", rows || []);
    });
  });

  /* ---------------- ADMIN JOBS ---------------- */
  socket.on("admin:jobs", () => {
    if (socket.user.role !== "admin") return;

    db.all("SELECT * FROM jobs ORDER BY id DESC", [], (err, rows) => {
      if (err) {
        console.log("ADMIN JOBS ERROR:", err.message);
        return;
      }

      socket.emit("admin:jobs:data", rows || []);
    });
  });

  /* ---------------- ADMIN SET ROLE ---------------- */
  socket.on("admin:setRole", ({ userId, role }) => {
    if (socket.user.role !== "admin") return;

    db.run("UPDATE users SET role = ? WHERE id = ?", [role, userId], (err) => {
      if (err) {
        console.log("ADMIN SET ROLE ERROR:", err.message);
        return;
      }

      db.all("SELECT id, email, role FROM users ORDER BY id DESC", [], (listErr, rows) => {
        if (!listErr) {
          socket.emit("admin:users:data", rows || []);
          socket.broadcast.emit("admin:users:data", rows || []);
        }
      });
    });
  });

  /* ---------------- ADMIN DELETE JOB ---------------- */
  socket.on("admin:deleteJob", ({ jobId }) => {
    if (socket.user.role !== "admin") return;

    db.run("DELETE FROM jobs WHERE id = ?", [jobId], (err) => {
      if (err) {
        console.log("ADMIN DELETE JOB ERROR:", err.message);
        return;
      }

      db.all("SELECT * FROM jobs ORDER BY id DESC", [], (listErr, rows) => {
        if (!listErr) {
          socket.emit("admin:jobs:data", rows || []);
          socket.broadcast.emit("admin:jobs:data", rows || []);
        }
      });
    });
  });

  /* =========================
     ACCEPT JOB
  ========================= */
  socket.on("job:accept", ({ jobId }) => {
    if (socket.user.role !== "helper") return;

    db.run(
      `UPDATE jobs SET status = 'accepted', workerId = ? WHERE id = ? AND status = 'open'`,
      [socket.user.id, jobId],
      (err) => {
        if (err) return console.log(err.message);

        db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, job) => {
          if (job) io.emit("job:update", job);
        });
      }
    );
  });

  /* =========================
     COMPLETE JOB
  ========================= */
  socket.on("job:done", ({ jobId }) => {
    if (socket.user.role !== "helper") return;

    db.run(
      `UPDATE jobs SET status = 'done' WHERE id = ?`,
      [jobId],
      (err) => {
        if (err) return console.log(err.message);

        db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, job) => {
          if (job) io.emit("job:update", job);
        });
      }
    );
  });

  socket.on("disconnect", () => {
    console.log("DISCONNECTED:", socket.user.email);
  });
});

/* =========================
   SEND JOBS FUNCTION
========================= */
function sendJobs(socket) {
  db.all("SELECT * FROM jobs", [], (err, rows) => {
    if (err) {
      console.log("DB FETCH ERROR:", err.message);
      return;
    }

    console.log("SENDING JOBS:", rows.length);
    socket.emit("jobs:init", rows || []);
  });
}

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("InstantFix running on port", PORT);
});