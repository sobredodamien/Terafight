// === Frontend JS ===
// Fichier : public/game.js

const socket = io();
let roomId = '';
let effects = []; // pour stocker les explosions
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const MAP_SIZE = 1024;
const PLAYER_SIZE = 20;
const SPEED = 3;
const DASH_SPEED = 100;
const DASH_COOLDOWN = 2000;
const PROJECTILE_SPEED = 7;
const INVINCIBLE_TIME = 3000;
const SHOOT_COOLDOWN = 1000;

let players = {}; // id: { x, y, color, invincibleUntil, hits }
let projectiles = [];
let walls = [
  // zone centrale
  { x: 490, y: 470, w: 40, h: 40 },

  // haut gauche
  { x: 100, y: 100, w: 60, h: 20 },
  { x: 180, y: 180, w: 20, h: 80 },
  { x: 250, y: 120, w: 80, h: 20 },

  // haut droit
  { x: 820, y: 100, w: 60, h: 20 },
  { x: 780, y: 200, w: 20, h: 80 },
  { x: 670, y: 150, w: 80, h: 20 },

  // bas gauche
  { x: 120, y: 820, w: 60, h: 20 },
  { x: 200, y: 700, w: 20, h: 100 },
  { x: 300, y: 880, w: 100, h: 20 },

  // bas droit
  { x: 820, y: 820, w: 60, h: 20 },
  { x: 700, y: 750, w: 20, h: 100 },
  { x: 580, y: 880, w: 100, h: 20 },

  // couloirs / obstacles
  { x: 300, y: 300, w: 20, h: 100 },
  { x: 400, y: 200, w: 100, h: 20 },
  { x: 600, y: 300, w: 20, h: 100 },
  { x: 500, y: 700, w: 100, h: 20 },
  { x: 400, y: 600, w: 20, h: 100 },
  { x: 600, y: 600, w: 20, h: 100 },

  // léger contour
  { x: 0, y: 500, w: 100, h: 20 },
  { x: 924, y: 500, w: 100, h: 20 },
  { x: 500, y: 0, w: 20, h: 100 },
  { x: 500, y: 924, w: 20, h: 100 }
];

let scores = [];
let myColor = 'lime';
let joined = false;
let keys = {}
let mouse = { x: 0, y: 0 };
let mouseDown = false;
let lastShotTime = 0;

let myPos = {
  x: MAP_SIZE / 2,
  y: MAP_SIZE / 2,
  dashReady: true,
  lastDash: 0,
  invincibleUntil: 0
};

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

function drawCooldown() {
  const now = Date.now();
  const delta = Math.max(0, DASH_COOLDOWN - (now - myPos.lastDash));
  const seconds = (delta / 1000).toFixed(1);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.fillText(delta === 0 ? 'Dash prêt' : `Dash : ${seconds}s`, canvas.width - 120, canvas.height - 20);
}

function drawScores() {
  ctx.font = '14px sans-serif';
  let y = 20;
  scores.forEach(({ color, score }) => {
    ctx.fillStyle = color;
    ctx.fillText(`${color}: ${score}`, canvas.width - 120, y);
    y += 18;
  });
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const offsetX = canvas.width / 2 - myPos.x;
  const offsetY = canvas.height / 2 - myPos.y;

  ctx.strokeStyle = '#555';
  ctx.lineWidth = 4;
  ctx.strokeRect(offsetX, offsetY, MAP_SIZE, MAP_SIZE);

  ctx.fillStyle = '#666';
  for (const wall of walls) {
    ctx.fillRect(wall.x + offsetX, wall.y + offsetY, wall.w, wall.h);
  }

  for (const id in players) {
    const p = players[id];
    ctx.fillStyle = p.invincibleUntil && Date.now() < p.invincibleUntil ? 'gray' : p.color || 'red';
    ctx.fillRect(p.x + offsetX, p.y + offsetY, PLAYER_SIZE, PLAYER_SIZE);

    const scoreData = scores.find(s => s.id === id);
    const displayScore = scoreData ? scoreData.score : 0;

    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Touche: ${displayScore}`, p.x + PLAYER_SIZE / 2 + offsetX, p.y - 5 + offsetY);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 + PLAYER_SIZE / 2, canvas.height / 2 + PLAYER_SIZE / 2);
  ctx.lineTo(mouse.x, mouse.y);
  ctx.stroke();

  ctx.fillStyle = '#fff';
  for (const p of projectiles) {
    ctx.fillStyle = p.color || '#fff';
    ctx.beginPath();
    ctx.arc(p.x + offsetX, p.y + offsetY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // effets visuels
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    ctx.beginPath();
    ctx.arc(e.x + offsetX, e.y + offsetY, e.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${e.alpha})`;
    ctx.stroke();
    e.radius += 1.5;
    e.alpha -= 0.03;
    if (e.radius > e.max || e.alpha <= 0) {
      effects.splice(i, 1);
    }
  }

  drawCooldown();
  drawScores();
  requestAnimationFrame(draw);
}

function collidesWall(x, y, size = PLAYER_SIZE) {
  return walls.some(w => x + size > w.x && x < w.x + w.w && y + size > w.y && y < w.y + w.h);
}

function update() {
  let nextX = myPos.x;
  let nextY = myPos.y;
  if (keys['w']) nextY -= SPEED;
  if (keys['s']) nextY += SPEED;
  if (keys['a']) nextX -= SPEED;
  if (keys['d']) nextX += SPEED;

  // bordures map + murs
  if (nextX >= 0 && nextX + PLAYER_SIZE <= MAP_SIZE && !collidesWall(nextX, myPos.y)) myPos.x = nextX;
  if (nextY >= 0 && nextY + PLAYER_SIZE <= MAP_SIZE && !collidesWall(myPos.x, nextY)) myPos.y = nextY;

  players[socket.id].x = myPos.x;
  players[socket.id].y = myPos.y;

  const now = Date.now();
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.dx;
    p.y += p.dy;

    if (p.x < 0 || p.x > MAP_SIZE || p.y < 0 || p.y > MAP_SIZE || collidesWall(p.x, p.y, 4)) {
      projectiles.splice(i, 1);
      continue;
    }

    for (const id in players) {
      const target = players[id];
      const now = Date.now();
      if (id !== p.from && (!target.invincibleUntil || now > target.invincibleUntil)) {
        const dist = Math.hypot(p.x - target.x, p.y - target.y);
        if (dist < PLAYER_SIZE && !p.hit) {
          p.hit = true;
          socket.emit('hit', { targetId: id, shooterId: p.from });
          projectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  socket.emit('move', { roomId, position: { x: myPos.x, y: myPos.y } });

  if (mouseDown && now - lastShotTime > SHOOT_COOLDOWN) {
    shootProjectile();
    lastShotTime = now;
  }
}

function gameLoop() {
  update();
  setTimeout(gameLoop, 1000 / 60);
}

function joinRoom() {
  roomId = document.getElementById('roomInput').value;
  myColor = window.getSelectedColor();
  if (roomId && !joined) {
    joined = true;
    myPos.x = MAP_SIZE / 2;
    myPos.y = MAP_SIZE / 2;
    myPos.invincibleUntil = Date.now() + INVINCIBLE_TIME;
    players[socket.id] = { x: myPos.x, y: myPos.y, color: myColor, invincibleUntil: myPos.invincibleUntil, hits: 0 };
    socket.emit('join', { roomId, color: myColor });
    draw();
    gameLoop();
  }
}

function shootProjectile() {
  const offsetX = canvas.width / 2 - myPos.x;
  const offsetY = canvas.height / 2 - myPos.y;
  const targetX = mouse.x - offsetX;
  const targetY = mouse.y - offsetY;
  const dx = targetX - (myPos.x + PLAYER_SIZE / 2);
  const dy = targetY - (myPos.y + PLAYER_SIZE / 2);
  const len = Math.sqrt(dx * dx + dy * dy);
  const unitX = (dx / len) * PROJECTILE_SPEED;
  const unitY = (dy / len) * PROJECTILE_SPEED;
  const projectile = {
    x: myPos.x + PLAYER_SIZE / 2,
    y: myPos.y + PLAYER_SIZE / 2,
    dx: unitX,
    dy: unitY,
    color: myColor,
    from: socket.id
  };
  projectiles.push(projectile);
  socket.emit('shoot', { roomId, projectile });
}

socket.on('projectileFired', (projectile) => {
  projectiles.push(projectile);
});

socket.on('updateScores', (data) => {
  scores = data;
});

socket.on('playerJoined', ({ id, color }) => {
  players[id] = { x: MAP_SIZE / 2, y: MAP_SIZE / 2, color, invincibleUntil: 0, hits: 0 };
});

socket.on('playerMoved', ({ id, position }) => {
  if (!players[id]) return;
  players[id].x = position.x;
  players[id].y = position.y;
});

socket.on('playerRespawn', ({ id }) => {
  if (!players[id]) return;
  players[id].invincibleUntil = Date.now() + INVINCIBLE_TIME;
  effects.push({
    x: players[id].x + PLAYER_SIZE / 2,
    y: players[id].y + PLAYER_SIZE / 2,
    radius: 5,
    max: 30,
    alpha: 1
  });
});

socket.on('projectileFired', (projectile) => {
  projectiles.push(projectile);
});

socket.on('updateScores', (data) => {
  scores = data;
});

socket.on('playerLeft', (id) => {
  delete players[id];
});

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
  keys[e.key.toLowerCase()] = true;

  if (e.key === ' ' && myPos.dashReady) {
    let dx = 0, dy = 0;
    if (keys['w']) dy = -1;
    if (keys['s']) dy = 1;
    if (keys['a']) dx = -1;
    if (keys['d']) dx = 1;
    const nextX = myPos.x + dx * DASH_SPEED;
    const nextY = myPos.y + dy * DASH_SPEED;
    if (!collidesWall(nextX, myPos.y)) myPos.x = Math.max(0, Math.min(MAP_SIZE - PLAYER_SIZE, nextX));
    if (!collidesWall(myPos.x, nextY)) myPos.y = Math.max(0, Math.min(MAP_SIZE - PLAYER_SIZE, nextY));
    myPos.dashReady = false;
    myPos.lastDash = Date.now();
    setTimeout(() => {
      myPos.dashReady = true;
    }, DASH_COOLDOWN);
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

canvas.addEventListener('mousedown', () => {
  mouseDown = true;
});

canvas.addEventListener('mouseup', () => {
  mouseDown = false;
});
