const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const router = express.Router();

const JWT_SECRET = "instantfix_secret_key_change_this";

/*
REGISTER
*/
router.post("/register", (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.json({ message: "Missing fields" });
  }

  const hash = bcrypt.hashSync(password, 10);

  const query = `
    INSERT INTO users (email, password, role)
    VALUES (?, ?, ?)
  `;

  db.run(query, [email, hash, role], function (err) {
    if (err) {
      return res.json({ message: "User already exists" });
    }

    return res.json({
      message: "User created",
      userId: this.lastID
    });
  });
});

/*
LOGIN
*/
router.post("/login", (req, res) => {
  const { email, password, role } = req.body;

  const query = `SELECT * FROM users WHERE email = ?`;

  db.get(query, [email], (err, user) => {
    if (err || !user) {
      return res.json({ message: "Invalid credentials" });
    }

    const valid = bcrypt.compareSync(password, user.password);

    if (!valid) {
      return res.json({ message: "Invalid credentials" });
    }

    if (role && user.role !== role) {
      return res.json({
        message: `This account is registered as ${user.role}`
      });
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

    res.json({ token, role: user.role });
  });
});

module.exports = { router, JWT_SECRET };