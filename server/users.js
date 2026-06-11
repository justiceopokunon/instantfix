const bcrypt = require("bcryptjs");

const users = [];

// CREATE USER
function createUser(email, password, role) {
  const hashed = bcrypt.hashSync(password, 10);

  const user = {
    id: Date.now().toString(),
    email,
    password: hashed,
    role
  };

  users.push(user);
  return user;
}

// FIND USER
function findUser(email) {
  return users.find(u => u.email === email);
}

// VERIFY PASSWORD
function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password);
}

module.exports = {
  users,
  createUser,
  findUser,
  verifyPassword
};