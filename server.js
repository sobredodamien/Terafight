const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {}; // { socket.id: { roomId, color, score } }
let rooms = {}; // { roomId: { inProgress, timeout, startTime } }

function getRoomPlayers(roomId) {
  return Object.entries(players).filter(([_, p]) => p.roomId === roomId);
}

function startRound(roomId) {
  if (!rooms[roomId]) rooms[roomId] = {};
  rooms[roomId].inProgress = true;
  rooms[roomId].startTime = Date.now();

  for (const [id, player] of getRoomPlayers(roomId)) {
    player.score = 0;
  }

  io.to(roomId).emit('updateScores', getScores(players, roomId));
  io.to(roomId).emit('roundStart');

  // timer 5 min
  rooms[roomId].timeout = setTimeout(() => {
    endRound(roomId, getWinner(roomId));
  },2.5 * 60 * 1000);
}

function endRound(roomId, winnerColor) {
  if (!rooms[roomId]) return;
  rooms[roomId].inProgress = false;
  clearTimeout(rooms[roomId].timeout);

  io.to(roomId).emit('roundEnd', { winnerColor });

  // reset après 15 sec
  setTimeout(() => {
    if (getRoomPlayers(roomId).length >= 2) {
      startRound(roomId);
    }
  }, 15 * 1000);
}

function getWinner(roomId) {
  const playersInRoom = getRoomPlayers(roomId);
  const sorted = playersInRoom.sort((a, b) => b[1].score - a[1].score);
  return sorted[0]?.[1]?.color || null;
}

function getScores(players, roomId) {
  return Object.entries(players)
    .filter(([_, p]) => p.roomId === roomId)
    .map(([id, p]) => ({ id, color: p.color, score: p.score }));
}

io.on('connection', (socket) => {
  console.log('Connecté :', socket.id);

  socket.on('join', ({ roomId, color }) => {
    socket.join(roomId);
    players[socket.id] = { roomId, color, score: 0 };

    socket.to(roomId).emit('playerJoined', { id: socket.id, color });

    for (const [id, data] of Object.entries(players)) {
      if (id !== socket.id && data.roomId === roomId) {
        socket.emit('playerJoined', { id, color: data.color });
      }
    }

    io.to(roomId).emit('updateScores', getScores(players, roomId));

    // check démarrage round
    const nbPlayers = getRoomPlayers(roomId).length;
    if (nbPlayers >= 2 && (!rooms[roomId] || !rooms[roomId].inProgress)) {
      startRound(roomId);
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
      const roomId = players[shooterId].roomId;
      if (!rooms[roomId]?.inProgress) return;

      players[shooterId].score += 1;

      if (players[targetId].score > 0) {
        players[targetId].score = 0;
      }

      io.to(roomId).emit('playerRespawn', { id: targetId });
      io.to(roomId).emit('updateScores', getScores(players, roomId));

      if (players[shooterId].score >= 3) {
        endRound(roomId, players[shooterId].color);
      }
    }
  });

  socket.on('disconnect', () => {
    const data = players[socket.id];
    if (data) {
      const roomId = data.roomId;
      io.to(roomId).emit('playerLeft', socket.id);
      delete players[socket.id];
      io.to(roomId).emit('updateScores', getScores(players, roomId));

      if (getRoomPlayers(roomId).length < 2) {
        if (rooms[roomId]) {
          rooms[roomId].inProgress = false;
          clearTimeout(rooms[roomId].timeout);
        }
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});
