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

    // informe les autres
    socket.to(roomId).emit('playerJoined', { id: socket.id, color });

    // envoie tous les joueurs à ce nouveau
    for (const [id, data] of Object.entries(players)) {
      if (id !== socket.id && data.roomId === roomId) {
        socket.emit('playerJoined', { id, color: data.color });
      }
    }

    io.to(roomId).emit('updateScores', getScores(players, roomId));
  });

  socket.on('move', ({ roomId, position }) => {
    socket.to(roomId).emit('playerMoved', { id: socket.id, position });
  });

  socket.on('shoot', ({ roomId, projectile }) => {
    socket.to(roomId).emit('projectileFired', projectile);
  });

  socket.on('hit', ({ targetId, shooterId }) => {
    if (players[targetId] && players[shooterId]) {
      const roomId = players[shooterId].roomId;

      // évite de tricher en touchant plusieurs fois très vite
      players[shooterId].score += 1;

      // reset le score du joueur touché s’il avait des points
      if (players[targetId].score > 0) {
        players[targetId].score = 0;
      }

      // respawn le joueur touché
      io.to(roomId).emit('playerRespawn', { id: targetId });

      // met à jour les scores
      io.to(roomId).emit('updateScores', getScores(players, roomId));
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
