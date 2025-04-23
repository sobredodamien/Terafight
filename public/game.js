// === Frontend JS ===
// Fichier : public/game.js

let roundActive = false;
let roundEnding = false;
let nextRoundCountdown = 0;
let winnerColor = null;

let lastConeShot = 0;
const CONE_COOLDOWN = 2000;

let bonuses = []; // liste des bonus visibles sur la map
let hasBonus = false; // est-ce que le joueur a un tir spécial ?

let rightMouseDown = false;
let lastConeShotTime = 0;

const socket = io();
let roomId = '';
let effects = []; // pour stocker les explosions
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let dashEffects = []; // [{ x, y, dx, dy, radius, life }]

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

let roundStartTime = null;
let roundEnded = false;
let roundWinner = '';
let nextRoundIn = null;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const soundNormal = document.getElementById('soundNormal');
const soundTriple = document.getElementById('soundTriple');
const soundSniper = document.getElementById('soundSniper');
const soundDash = document.getElementById('soundDash');
const soundRespawn = document.getElementById('soundRespawn');
const soundHit = document.getElementById('soundHit');

  function translateColor(color) {
    const map = {
      red: 'Rouge',
      blue: 'Bleu',
      green: 'Vert',
      yellow: 'Jaune',
      orange: 'Orange',
      purple: 'Violet',
      cyan: 'Cyan',
      magenta: 'Rose'
    };
    return map[color] || color;
  }

function drawCooldown() {
  const now = Date.now();
  const delta = Math.max(0, DASH_COOLDOWN - (now - myPos.lastDash));
  const seconds = (delta / 1000).toFixed(1);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.fillText(delta === 0 ? 'Dash prêt' : `Dash : ${seconds}s`, canvas.width - 120, canvas.height - 20);
}

function drawScores() {
  const scoreboard = document.getElementById('scoreboard');
  if (!scoreboard) return;

  const sorted = [...scores].sort((a, b) => b.score - a.score);

  const existingTimer = document.getElementById('roundTimer');
  scoreboard.innerHTML = '';
  if (existingTimer) scoreboard.appendChild(existingTimer);

  const title = document.createElement('div');
  title.innerHTML = '<strong style="font-size: 16px;">Scores</strong></br>';
  title.style.marginTop = '8px';
  scoreboard.appendChild(title);

  sorted.forEach(({ color, score }, i) => {
    const label = translateColor(color);
    scoreboard.innerHTML += `
      <div class="score-entry" style="margin-top: ${i === 0 ? '8px' : '0'};">
        <div style="display: flex; align-items: center;">
          <div class="score-color" style="background: ${color}"></div>
          <span>${label}</span>
        </div>
        <span style="margin-left: 6px;">${score}</span>
      </div>
    `;
  });
}
function drawBonuses(offsetX, offsetY) {
  for (const b of bonuses) {
    ctx.fillStyle = 'yellow';
    ctx.beginPath();
    ctx.arc(b.x + offsetX, b.y + offsetY, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRoundTimer() {
  if (!roundStartTime || roundEnded) return;
  const now = Date.now();
  const elapsed = Math.floor((now - roundStartTime) / 1000);
  const remaining = Math.max(0, 150 - elapsed);
  const min = Math.floor(remaining / 60);
  const sec = String(remaining % 60).padStart(2, '0');
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`Temps : ${min}:${sec}`, canvas.width - 20, 40);
  ctx.textAlign = 'left'; 
  const timerDiv = document.getElementById('roundTimer');
  if (timerDiv) {
    timerDiv.textContent = `Temps : ${min}:${sec}`;
    timerDiv.style.display = 'inline';
  }
}
function cssColorToRGB(color) {
  const temp = document.createElement('div');
  temp.style.color = color;
  document.body.appendChild(temp);
  const rgb = getComputedStyle(temp).color;
  document.body.removeChild(temp);
  return rgb.match(/\d+/g).slice(0, 3).join(','); // "255,0,0"
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
  if (roundEnding) {
    const boxWidth = 420;
    const boxHeight = 280;
    const centerX = canvas.width / 2 - boxWidth / 2;
    const centerY = canvas.height / 3 - boxHeight / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(centerX, centerY, boxWidth, boxHeight);

    ctx.textAlign = 'center';
    ctx.font = '30px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    const textY = canvas.height / 3 + 5; 
    ctx.fillText(`Fin du round !`, canvas.width / 2, textY);

    ctx.font = '22px sans-serif';
    ctx.fillStyle = winnerColor || '#ccc';
    ctx.fillText(`Gagnant : ${winnerColor || '-'}`, canvas.width / 2, textY + 25);

    ctx.fillStyle = '#fff';
    if (nextRoundCountdown > 0) {
      ctx.font = '18px sans-serif';
      ctx.fillText(`Prochain round dans ${nextRoundCountdown}s`, canvas.width / 2, textY + 50);
    }

    ctx.shadowBlur = 0;
  }

  drawCooldown();
  drawScores();
  drawBonuses(offsetX, offsetY);
  drawRoundTimer();
  requestAnimationFrame(draw);
  dashEffects.forEach(e => {
    const alpha = e.life / 300;
    const color = e.color || 'white'; // ← ajoute cette ligne
    ctx.strokeStyle = color.startsWith('#')
  ? color + Math.floor(alpha * 255).toString(16).padStart(2, '0')  // exemple : 'ff' → '00'
  : `rgba(${cssColorToRGB(color)}, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(e.fromX + offsetX, e.fromY + offsetY);
    ctx.lineTo(e.toX + offsetX, e.toY + offsetY);
    ctx.stroke();
  });
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
  let alreadyHit = new Set();
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (!p.from) {
      projectiles.splice(i, 1);
      continue;
    }
    // si la vitesse est nulle = bug
    if (p.dx === 0 && p.dy === 0) {
      projectiles.splice(i, 1);
      continue;
    }
    if (!p.spawnTime) p.spawnTime = Date.now();
    if (Date.now() - p.spawnTime > (p.lifespan || 999999)) {
      projectiles.splice(i, 1);
      continue;
    }
    p.x += p.dx;
    p.y += p.dy;

    if (p.x < 0 || p.x > MAP_SIZE || p.y < 0 || p.y > MAP_SIZE || (!p.bonus && collidesWall(p.x, p.y, p.radius))) {
      projectiles.splice(i, 1);
      continue;
    }

    for (const id in players) {
      const target = players[id];
      const now = Date.now();
      if (p.from && id !== p.from && (!target.invincibleUntil || now > target.invincibleUntil)) {
        const dist = Math.hypot(p.x - (target.x + PLAYER_SIZE / 2), p.y - (target.y + PLAYER_SIZE / 2));
        if (dist < PLAYER_SIZE / 2 + p.radius && !p.hit) {
          p.hit = true;
          soundHit.currentTime = 0;
          soundHit.play().catch(() => {});

          if (!alreadyHit.has(p.from)) {
            socket.emit('hit', { targetId: id, shooterId: p.from });
            alreadyHit.add(p.from);
          }
          projectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  socket.emit('move', { roomId, position: { x: myPos.x, y: myPos.y } });

  if (
    mouseDown &&
    !rightMouseDown && // ← Empêche de tirer si clic droit maintenu
    now - lastShotTime > SHOOT_COOLDOWN &&
    (!myPos.invincibleUntil || Date.now() >= myPos.invincibleUntil)
  ) {
    shootProjectile();
    lastShotTime = now;
  }
  if (
    rightMouseDown &&
    Date.now() - lastConeShotTime > CONE_COOLDOWN &&
    (!myPos.invincibleUntil || Date.now() >= myPos.invincibleUntil)
  ) {
    shootCone();
    lastConeShotTime = Date.now();
  }
  for (let i = bonuses.length - 1; i >= 0; i--) {
    const b = bonuses[i];
    const dist = Math.hypot(myPos.x + PLAYER_SIZE / 2 - b.x, myPos.y + PLAYER_SIZE / 2 - b.y);
    if (dist < PLAYER_SIZE / 2 + 10) {
      hasBonus = true;
      socket.emit('bonusCollected', { id: b.id, roomId });
      bonuses.splice(i, 1);
    }
  }
  for (let i = dashEffects.length - 1; i >= 0; i--) {
    const e = dashEffects[i];
    e.x += e.dx;
    e.y += e.dy;
    e.radius += 1;
    e.life -= 16;
    if (e.life <= 0) dashEffects.splice(i, 1);
  }
}

function gameLoop() {
  update();
  setTimeout(gameLoop, 1000 / 60);
}

function joinRoom() {
  document.getElementById('roomInput')?.blur();
  roomId = document.getElementById('roomInput').value;
    if (!roomId) return;

    let selectedColor = window.getSelectedColor();
    myColor = selectedColor;

    if (!joined) {
      joined = true;
      myPos.x = MAP_SIZE / 2;
      myPos.y = MAP_SIZE / 2;
      myPos.invincibleUntil = Date.now() + INVINCIBLE_TIME;
      players[socket.id] = {
        x: myPos.x,
        y: myPos.y,
        color: myColor,
        invincibleUntil: myPos.invincibleUntil,
        hits: 0
      };
      socket.emit('join', { roomId, color: myColor });
      soundRespawn.currentTime = 0;
      soundRespawn.play().catch(() => {});
      draw();
      gameLoop();
    } else {
      // déjà dans la partie → juste mettre à jour la couleur
      myColor = selectedColor;
      if (players[socket.id]) {
        players[socket.id].color = myColor;
      }
      socket.emit('colorChange', { roomId, color: myColor });
    }
}

function shootProjectile() {
  if (lastConeShot && Date.now() - lastConeShot < 50) return;

  // 🛡️ Ne pas tirer pendant l'invincibilité
  if (myPos.invincibleUntil && Date.now() < myPos.invincibleUntil) return;
  const offsetX = canvas.width / 2 - myPos.x;
  const offsetY = canvas.height / 2 - myPos.y;
  const targetX = mouse.x - offsetX;
  const targetY = mouse.y - offsetY;
  const dx = targetX - (myPos.x + PLAYER_SIZE / 2);
  const dy = targetY - (myPos.y + PLAYER_SIZE / 2);
  const len = Math.sqrt(dx * dx + dy * dy);
  const speed = hasBonus ? 20 : PROJECTILE_SPEED;
  const radius = hasBonus ? 10 : 4;
  const unitX = (dx / len) * speed;
  const unitY = (dy / len) * speed;
  const projectile = {
    x: myPos.x + PLAYER_SIZE / 2,
    y: myPos.y + PLAYER_SIZE / 2,
    dx: unitX,
    dy: unitY,
    color: myColor,
    from: socket.id,
    radius: radius,
    bonus: hasBonus
  };
  if (len === 0) return; // évite les tirs immobiles (vers soi-même)
  hasBonus = false;
  projectiles.push(projectile);

  if (projectile.bonus) {
    soundSniper.currentTime = 0;
    soundSniper.play().catch(() => {});
  } else {
    soundNormal.currentTime = 0;
    soundNormal.play().catch(() => {});
  }
  socket.emit('shoot', { roomId, projectile });
}

function shootCone() {
  const now = Date.now();
  // 🛡️ Ne pas tirer pendant l'invincibilité
  if (myPos.invincibleUntil && Date.now() < myPos.invincibleUntil) return;

  const offsetX = canvas.width / 2 - myPos.x;
  const offsetY = canvas.height / 2 - myPos.y;
  const targetX = mouse.x - offsetX;
  const targetY = mouse.y - offsetY;

  const dx = targetX - (myPos.x + PLAYER_SIZE / 2);
  const dy = targetY - (myPos.y + PLAYER_SIZE / 2);
  const baseAngle = Math.atan2(dy, dx);

  const angles = [-0.2, 0, 0.2]; // cône de 3 tirs
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return; // évite le cône dans le vide
  for (const a of angles) {
    const angle = baseAngle + a;
    const speed = 10; // vitesse augmentée
    const lifetime = 240; // durée réduite (même distance que 6px x 400ms)
    const projectile = {
      x: myPos.x + PLAYER_SIZE / 2,
      y: myPos.y + PLAYER_SIZE / 2,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      color: myColor,
      from: socket.id,
      radius: 4,
      bonus: false,
      lifespan: lifetime
    };
    soundTriple.currentTime = 0;
    soundTriple.play().catch(() => {});
    projectiles.push(projectile);
    socket.emit('shoot', { roomId, projectile });
  }
}

function updateVolumeSliderStyle(slider) {
  const value = parseFloat(slider.value) * 100;
  slider.style.background = `linear-gradient(to right, #08c ${value}%, #444 ${value}%)`;
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
  if (id === socket.id) {
    myPos.invincibleUntil = Date.now() + INVINCIBLE_TIME;
  }
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
    const dashStartX = myPos.x + PLAYER_SIZE / 2;
    const dashStartY = myPos.y + PLAYER_SIZE / 2;
    const nextX = myPos.x + dx * DASH_SPEED;
    const nextY = myPos.y + dy * DASH_SPEED;
    if (!collidesWall(nextX, myPos.y)) myPos.x = Math.max(0, Math.min(MAP_SIZE - PLAYER_SIZE, nextX));
    if (!collidesWall(myPos.x, nextY)) myPos.y = Math.max(0, Math.min(MAP_SIZE - PLAYER_SIZE, nextY));
    
    // 🛠️ mise à jour immédiate du modèle du joueur
    players[socket.id].x = myPos.x;
    players[socket.id].y = myPos.y;

    myPos.dashReady = false;
    myPos.lastDash = Date.now();
    setTimeout(() => {
      myPos.dashReady = true;
    }, DASH_COOLDOWN);
    const dashEndX = myPos.x + PLAYER_SIZE / 2;
    const dashEndY = myPos.y + PLAYER_SIZE / 2;

    dashEffects.push({
      fromX: dashStartX,
      fromY: dashStartY,
      toX: dashEndX,
      toY: dashEndY,
      color: myColor,
      life: 300
    });
    soundDash.currentTime = 0;
    soundDash.play().catch(() => {});
    socket.emit('dashEffect', {
      fromX: dashStartX,
      fromY: dashStartY,
      toX: dashEndX,
      toY: dashEndY,
      color: myColor
    });
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

canvas.addEventListener('contextmenu', e => e.preventDefault()); // bloque clic droit

canvas.addEventListener('mousedown', (e) => {
  if (!joined) return;

  if (e.button === 2) {
    rightMouseDown = true;
  } else if (e.button === 0) {
    mouseDown = true;
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 2) rightMouseDown = false;
  if (e.button === 0) mouseDown = false;
});


canvas.addEventListener('mouseup', () => {
  mouseDown = false;
});

socket.on('roundEnd', ({ winnerColor: color }) => {
  roundActive = false;
  roundEnding = true;
  winnerColor = color;
  nextRoundCountdown = 15;
  const timerDiv = document.getElementById('roundTimer');
  if (timerDiv) timerDiv.style.display = 'none';
  const countdownInterval = setInterval(() => {
    nextRoundCountdown--;
    if (nextRoundCountdown <= 0) {
      clearInterval(countdownInterval);
      roundEnding = false;
    }
  }, 1000);
  const music = document.getElementById('bgMusic');
  if (music) music.pause();
});

socket.on('roundStart', () => {
  roundStartTime = Date.now();
  roundEnded = false;
  roundWinner = '';
  nextRoundIn = null;
  const music = document.getElementById('bgMusic');
  if (music && music.paused) {
    music.currentTime = 0;
    music.play().catch(() => {}); // ignore l'erreur si autoplay est bloqué
  }
});

socket.on('bonusSpawn', (bonus) => {
  bonuses.push(bonus);
});

socket.on('bonusRemove', (id) => {
  bonuses = bonuses.filter(b => b.id !== id);
});

socket.on('clearBonuses', () => {
  bonuses = [];
});
socket.on('colorAssigned', (assignedColor) => {
  myColor = assignedColor;

  // met à jour visuellement la sélection
  document.querySelectorAll('.color').forEach(div => {
    if (div.dataset.color === assignedColor) div.classList.add('selected');
    else div.classList.remove('selected');
  });

  // 🔧 met aussi à jour la couleur de ton propre joueur dans players
  if (players[socket.id]) {
    players[socket.id].color = assignedColor;
  }
});

socket.on('playerColorUpdated', ({ id, color }) => {
  if (players[id]) {
    players[id].color = color;
  }
});

socket.on('dashEffect', ({ fromX, fromY, toX, toY, color, id }) => {
  // ignore ton propre dash (déjà affiché localement)
  if (id === socket.id) return;

  dashEffects.push({
    fromX,
    fromY,
    toX,
    toY,
    color,
    life: 300
  });
});

socket.on('playerJoinedSound', () => {
  soundRespawn.currentTime = 0;
  soundRespawn.play().catch(() => {});
});
socket.on('playerDashed', () => {
  soundDash.currentTime = 0;
  soundDash.play().catch(() => {});
});

socket.on('sniperFired', () => {
  soundSniper.currentTime = 0;
  soundSniper.play().catch(() => {});
});
socket.on('youGotHit', () => {
  soundHit.currentTime = 0;
  soundHit.play().catch(() => {});
});
