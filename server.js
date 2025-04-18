const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {}; // { socket.id: { roomId, color, score } }
let rooms = {};   // { roomId: { inProgress, timeout, startTime, bonusTimer, bonuses: [] } }
let recentHits = []; // { shooterId, targetId, timestamp }

const MAP_SIZE = 1024;
const BONUS_INTERVAL = 30000;

function getRoomPlayers(roomId) {
  return Object.entries(players).filter(([_, p]) => p.roomId === roomId);
}

function getRandomBonusPosition(walls) {
  let tries = 0;
  while (tries++ < 100) {
    const x = Math.floor(Math.random() * (MAP_SIZE - 60)) + 30;
    const y = Math.floor(Math.random() * (MAP_SIZE - 60)) + 30;
    const collides = walls?.some(w => (
      x + 10 > w.x && x < w.x + w.w &&
      y + 10 > w.y && y < w.y + w.h
    ));
    if (!collides) return { x, y };
  }
  return null;
}

function startBonusSpawning(roomId) {
  if (!rooms[roomId]) return;

  // 🔒 Évite de créer plusieurs timers
  if (rooms[roomId].bonusTimer) return;

  rooms[roomId].bonuses = [];

  rooms[roomId].bonusTimer = setInterval(() => {
    const pos = getRandomBonusPosition([]);
    if (pos) {
      const bonus = { id: Date.now() + Math.random(), ...pos };
      rooms[roomId].bonuses.push(bonus);
      io.to(roomId).emit('bonusSpawn', bonus);
    }
  }, BONUS_INTERVAL);
}

function stopBonusSpawning(roomId) {
  if (rooms[roomId]?.bonusTimer) {
    clearInterval(rooms[roomId].bonusTimer);
    rooms[roomId].bonusTimer = null;
  }
  rooms[roomId].bonuses = [];
  io.to(roomId).emit('clearBonuses');
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

  // bonus spawn
  startBonusSpawning(roomId);

  // timer 2m30
  rooms[roomId].timeout = setTimeout(() => {
    endRound(roomId, getWinner(roomId));
  }, 2.5 * 60 * 1000);
}

function endRound(roomId, winnerColor) {
  if (!rooms[roomId]) return;
  rooms[roomId].inProgress = false;
  clearTimeout(rooms[roomId].timeout);

  stopBonusSpawning(roomId);

  io.to(roomId).emit('roundEnd', { winnerColor });

  setTimeout(() => {
    if (getRoomPlayers(roomId).length >= 2) {
      startRound(roomId);
    }
  }, 15000);
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
    // vérifier si couleur déjà prise
    const takenColors = Object.values(players)
      .filter(p => p.roomId === roomId)
      .map(p => p.color);

    let assignedColor = color;
    if (takenColors.includes(color)) {
      const fallback = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'cyan', 'magenta']
        .find(c => !takenColors.includes(c));
      assignedColor = fallback || 'gray';
    }

    players[socket.id] = { roomId, color: assignedColor, score: 0 };

    socket.to(roomId).emit('playerJoined', { id: socket.id, color: assignedColor });

    for (const [id, data] of Object.entries(players)) {
      if (id !== socket.id && data.roomId === roomId) {
        socket.emit('playerJoined', { id, color: data.color });
      }
    }
    socket.emit('colorAssigned', assignedColor);

    io.to(roomId).emit('updateScores', getScores(players, roomId));

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
      const now = Date.now();
      const duplicate = recentHits.find(h =>
        h.shooterId === shooterId &&
        h.targetId === targetId &&
        now - h.timestamp < 300
      );
      if (duplicate) return; // déjà compté récemment

      // Sinon, on compte ce hit
      recentHits.push({ shooterId, targetId, timestamp: now });

      // nettoyer les anciens hits
      recentHits = recentHits.filter(h => now - h.timestamp < 300);

      players[shooterId].score += 1;

      if (players[targetId].score > 0) {
        players[targetId].score = 0;
      }

      io.to(roomId).emit('playerRespawn', { id: targetId });
      io.to(roomId).emit('updateScores', getScores(players, roomId));

      if (players[shooterId].score >= 10) {
        endRound(roomId, players[shooterId].color);
      }
    }
  });

  socket.on('bonusCollected', ({ id, roomId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].bonuses = rooms[roomId].bonuses.filter(b => b.id !== id);
    io.to(roomId).emit('bonusRemove', id);
  });

  socket.on('colorChange', ({ roomId, color }) => {
    if (players[socket.id] && players[socket.id].roomId === roomId) {
      players[socket.id].color = color;
      io.to(roomId).emit('updateScores', getScores(players, roomId));
      socket.to(roomId).emit('playerColorUpdated', { id: socket.id, color });
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
          stopBonusSpawning(roomId);
        }
      }
    }
  });
  socket.on('dashEffect', (effect) => {
    const player = players[socket.id];
    if (!player || !player.roomId) return;

    io.to(player.roomId).emit('dashEffect', {
      ...effect,
      id: socket.id
    });
  });
});

server.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});
