const socket = io();
let roomId = '';
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const GRAVITY = 0.5;
const JUMP_STRENGTH = -10;
const FLOOR_Y = canvas.height - 40;

let players = {}; // id: { x, y, color }
let myPos = { x: 100, y: FLOOR_Y, vy: 0, grounded: true, jumping: false };
let keys = {};
let myColor = 'lime';
let joined = false;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#444';
  ctx.fillRect(0, FLOOR_Y + 20, canvas.width, 10);

  for (const id in players) {
    const p = players[id];
    ctx.fillStyle = p.color || 'red';
    ctx.fillRect(p.x, p.y, 20, 20);
  }

  requestAnimationFrame(draw);
}

function update() {
  const speed = 3;

  if (keys['a']) myPos.x -= speed;
  if (keys['d']) myPos.x += speed;

  if (keys[' '] && myPos.grounded && !myPos.jumping) {
    myPos.vy = JUMP_STRENGTH;
    myPos.grounded = false;
    myPos.jumping = true;
  }

  if (!keys[' ']) {
    myPos.jumping = false;
  }

  myPos.vy += GRAVITY;
  myPos.y += myPos.vy;

  if (myPos.y >= FLOOR_Y) {
    myPos.y = FLOOR_Y;
    myPos.vy = 0;
    myPos.grounded = true;
  }

  players[socket.id] = { x: myPos.x, y: myPos.y, color: myColor };
  socket.emit('move', { roomId, position: { x: myPos.x, y: myPos.y } });
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
    socket.emit('join', { roomId, color: myColor });
    players[socket.id] = { x: myPos.x, y: myPos.y, color: myColor };
    draw();
    gameLoop();
  }
}

socket.on('playerJoined', ({ id, color }) => {
  players[id] = { x: 100, y: FLOOR_Y, color };
});

socket.on('playerMoved', ({ id, position }) => {
  if (players[id]) {
    players[id].x = position.x;
    players[id].y = position.y;
  }
});

socket.on('playerLeft', (id) => {
  delete players[id];
});

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
  }
  keys[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});