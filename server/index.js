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
const PLATFORM_FEE = 0.15; // 15%

const io = new Server(server, {
  cors: { origin: "*" }
});

/* FRONTEND */
app.use(express.static(path.join(__dirname, "../client")));
app.use("/auth", authRouter);

app.get("/", (req, res) => {
  res.send("InstantFix backend running");
});

/* AUTH */
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));

    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

/* ROLE HELPERS */
const isClient = (s) => s.user.role === "client";
const isHelper = (s) => s.user.role === "helper";
const isAdmin = (s) => s.user.role === "admin";

/* =========================
   ANALYTICS ENGINE
========================= */
function track(io, db, { type, userId, role, value }) {
  const event = {
    type,
    userId,
    role,
    value: value ? JSON.stringify(value) : null,
    createdAt: new Date().toISOString()
  };

  db.run(
    `INSERT INTO analytics_events (type, userId, role, value, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [event.type, event.userId, event.role, event.value, event.createdAt]
  );

  io.to("admin").emit("analytics:event", event);
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

  track(io, db, {
    type: "user_connected",
    userId: socket.user.id,
    role: socket.user.role,
    value: {}
  });
db.get(
  "SELECT * FROM wallets WHERE userId = ?",
  [socket.user.id],
  (err, wallet) => {
    if (!wallet) {
      db.run(
        "INSERT INTO wallets (userId, balance) VALUES (?, ?)",
        [socket.user.id, 0]
      );
    }
  }
);

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
      Object.values(job),
      (err) => {
        if (err) return console.log(err.message);

        io.to("helper").emit("job:new", job);
        io.to(`user:${job.clientId}`).emit("job:new", job);

        track(io, db, {
          type: "job_created",
          userId: job.clientId,
          role: "client",
          value: { jobId: job.id }
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
            if (updated) {
              io.to("helper").emit("job:update", updated);
              io.to(`user:${updated.clientId}`).emit("job:update", updated);

              track(io, db, {
                type: "job_accepted",
                userId: socket.user.id,
                role: "helper",
                value: { jobId }
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

    const fakePayment = 100; // base job value (simulate pricing engine)

    const fee = fakePayment * PLATFORM_FEE;
    const net = fakePayment - fee;

    db.run(
      `UPDATE jobs SET status='done', updatedAt=CURRENT_TIMESTAMP
       WHERE id=?`,
      [jobId],
      (err) => {
        if (err) return;

        /* CREDIT HELPER WALLET */
        db.run(
          `UPDATE wallets SET balance = balance + ? WHERE userId = ?`,
          [net, socket.user.id]
        );

        /* LOG TRANSACTION */
        db.run(
          `INSERT INTO transactions (userId, type, amount, fee, net, jobId, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            socket.user.id,
            "job_payment",
            fakePayment,
            fee,
            net,
            jobId,
            new Date().toISOString()
          ]
        );

        db.get("SELECT * FROM jobs WHERE id = ?", [jobId], (err, updated) => {
          if (!err && updated) {
            io.to("helper").emit("job:update", updated);
            io.to(`user:${updated.clientId}`).emit("job:update", updated);

            track(io, db, {
              type: "job_completed",
              userId: socket.user.id,
              role: "helper",
              value: { jobId, earnings: net }
            });
          }
        });
      }
    );
  });
});

  /* =========================
     ANALYTICS API
  ========================= */
  socket.on("analytics:summary", () => {
    if (!isAdmin(socket)) return;

    const summary = {};

    db.all("SELECT type, COUNT(*) as count FROM analytics_events GROUP BY type", [], (e, rows) => {
      summary.byType = rows || [];

      db.all("SELECT role, COUNT(*) as count FROM analytics_events GROUP BY role", [], (e2, rows2) => {
        summary.byRole = rows2 || [];

        db.get("SELECT COUNT(*) as totalJobs FROM jobs", [], (e3, r3) => {
          summary.totalJobs = r3?.totalJobs || 0;

          db.get("SELECT COUNT(*) as activeJobs FROM jobs WHERE status!='done'", [], (e4, r4) => {
            summary.activeJobs = r4?.activeJobs || 0;

            socket.emit("analytics:summary", summary);
          });
        });
      });
    });
  });

  socket.on("analytics:live", () => {
    if (!isAdmin(socket)) return;

    db.all(
      "SELECT * FROM analytics_events ORDER BY id DESC LIMIT 50",
      [],
      (err, rows) => {
        if (!err) socket.emit("analytics:init", rows || []);
      }
    );
  });
});

/* =========================
   SEND JOBS (ROLE-AWARE)
========================= */
function sendJobs(socket) {
  if (socket.user.role === "helper") {
    return db.all(
      "SELECT * FROM jobs WHERE status='open' ORDER BY createdAt DESC",
      [],
      (err, rows) => socket.emit("jobs:init", rows || [])
    );
  }

  if (socket.user.role === "client") {
    return db.all(
      "SELECT * FROM jobs WHERE clientId=? ORDER BY createdAt DESC",
      [socket.user.id],
      (err, rows) => socket.emit("jobs:init", rows || [])
    );
  }

  if (socket.user.role === "admin") {
    return db.all(
      "SELECT * FROM jobs ORDER BY createdAt DESC",
      [],
      (err, rows) => socket.emit("jobs:init", rows || [])
    );
  }
}

socket.on("wallet:get", () => {
  db.get(
    "SELECT * FROM wallets WHERE userId = ?",
    [socket.user.id],
    (err, wallet) => {
      socket.emit("wallet:data", wallet || { balance: 0 });
    }
  );
});

socket.on("admin:revenue", () => {
  if (!isAdmin(socket)) return;

  db.get(
    `SELECT 
      SUM(amount) as totalRevenue,
      SUM(fee) as totalFees,
      SUM(net) as totalPayouts
     FROM transactions`,
    [],
    (err, summary) => {
      db.all(
        `SELECT * FROM transactions ORDER BY id DESC LIMIT 50`,
        [],
        (err2, rows) => {
          socket.emit("admin:revenue:data", {
            summary,
            transactions: rows || []
          });
        }
      );
    }
  );
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("InstantFix running on port", PORT);
});