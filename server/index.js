const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const canvasState = {};

io.on('connection', (socket) => {
  console.log('user connected:', socket.id);

  socket.emit('canvas-state', canvasState);

  socket.on('place-pixel', ({ x, y, color }) => {
    canvasState[`${x},${y}`] = color;
    io.emit('pixel-placed', { x, y, color });
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});