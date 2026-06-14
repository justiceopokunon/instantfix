const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

/* ---------------- REGISTER ---------------- */
router.post("/register", (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.json({ message: "Missing fields" });
  }

  const id = Date.now().toString();

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    `INSERT INTO users (id, email, password, role) VALUES (?, ?, ?, ?)`,
    [id, email, hashedPassword, role],
    (err) => {
      if (err) {
        return res.json({ message: "User already exists" });
      }

      res.json({ message: "User registered successfully" });
    }
  );
});

/* ---------------- LOGIN ---------------- */
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get(
    `SELECT * FROM users WHERE email = ?`,
    [email],
    (err, user) => {
      if (err || !user) {
        return res.json({ message: "Invalid credentials" });
      }

      const isValid = bcrypt.compareSync(password, user.password);

      if (!isValid) {
        return res.json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        token,
        role: user.role
      });
    }
  );
});

module.exports = { router };