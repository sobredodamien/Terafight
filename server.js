const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {}; // { socket.id: { roomId, color, score } }

io.on('connection', (socket) => {
  console.log('Un joueur est connecté :', socket.id);

  socket.on('join', ({ roomId, color }) => {
    socket.join(roomId);
    players[socket.id] = { roomId, color, score: 0 };
    console.log(`Joueur ${socket.id} a rejoint la salle ${roomId} avec la couleur ${color}`);

    socket.to(roomId).emit('playerJoined', { id: socket.id, color });
    io.to(roomId).emit('updateScores', getScores(players, roomId));

    for (const [id, data] of Object.entries(players)) {
      if (id !== socket.id && data.roomId === roomId) {
        socket.emit('playerJoined', { id, color: data.color });
      }
    }
  });

  socket.on('move', ({ roomId, position }) => {
    socket.to(roomId).emit('playerMoved', { id: socket.id, position });
  });

  socket.on('shoot', ({ roomId, projectile }) => {
    socket.to(roomId).emit('projectileFired', projectile);
  });

  socket.on('hit', ({ targetId, shooterId }) => {
    if (players[targetId] && players[shooterId]) {
      players[shooterId].score++;
      io.to(players[shooterId].roomId).emit('playerRespawn', { id: targetId });
      io.to(players[shooterId].roomId).emit('updateScores', getScores(players, players[shooterId].roomId));
    }
  });

  socket.on('disconnect', () => {
    const data = players[socket.id];
    if (data) {
      io.to(data.roomId).emit('playerLeft', socket.id);
      delete players[socket.id];
      io.to(data.roomId).emit('updateScores', getScores(players, data.roomId));
    }
    console.log('Déconnecté :', socket.id);
  });
});

function getScores(players, roomId) {
  return Object.entries(players)
    .filter(([_, p]) => p.roomId === roomId)
    .map(([id, p]) => ({ id, color: p.color, score: p.score }));
}

server.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});