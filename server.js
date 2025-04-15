const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {}; // { socket.id: { roomId, color } }

io.on('connection', (socket) => {
  console.log('Un joueur est connecté :', socket.id);

  socket.on('join', ({ roomId, color }) => {
    socket.join(roomId);
    players[socket.id] = { roomId, color };
    console.log(`Joueur ${socket.id} a rejoint la salle ${roomId} avec la couleur ${color}`);

    socket.to(roomId).emit('playerJoined', { id: socket.id, color });

    for (const [id, data] of Object.entries(players)) {
      if (id !== socket.id && data.roomId === roomId) {
        socket.emit('playerJoined', { id, color: data.color });
      }
    }
  });

  socket.on('move', ({ roomId, position }) => {
    socket.to(roomId).emit('playerMoved', { id: socket.id, position });
  });

  socket.on('disconnect', () => {
    const data = players[socket.id];
    if (data) {
      io.to(data.roomId).emit('playerLeft', socket.id);
      delete players[socket.id];
    }
    console.log('Déconnecté :', socket.id);
  });
});

server.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});