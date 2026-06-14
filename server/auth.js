const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const SECRET = "instantfix_secret_key_change_me";

// In-memory users (we will later move to SQLite)
const users = [];

// REGISTER
function register(req, res) {
    const { email, password, role } = req.body;

    const existing = users.find(u => u.email === email);
    if (existing) {
        return res.status(400).json({ error: "User exists" });
    }

    const hashed = bcrypt.hashSync(password, 10);

    const user = {
        id: Date.now().toString(),
        email,
        password: hashed,
        role: role || "client"
    };

    users.push(user);

    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        SECRET,
        { expiresIn: "7d" }
    );

    res.json({ token, user });
}

// LOGIN
function login(req, res) {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);
    if (!user) {
        return res.status(400).json({ error: "Invalid credentials" });
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
        return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        SECRET,
        { expiresIn: "7d" }
    );

    res.json({ token, user });
}

// AUTH MIDDLEWARE
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;

    if (!header) {
        return res.status(401).json({ error: "No token" });
    }

    try {
        const token = header.split(" ")[1];
        const decoded = jwt.verify(token, SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
}

module.exports = {
    register,
    login,
    authMiddleware
};