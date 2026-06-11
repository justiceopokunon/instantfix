const jwt = require("jsonwebtoken");

const SECRET = "instantfix_secret_key_change_later";

// CREATE TOKEN
function createToken(user) {
  return jwt.sign(user, SECRET, { expiresIn: "7d" });
}

// VERIFY TOKEN
function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  createToken,
  verifyToken
};