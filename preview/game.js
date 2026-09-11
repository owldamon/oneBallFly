// 一球飞升 · 浏览器物理沙盒（Matter.js）
// 验收：挡板不肉；3 魂；掉沟扣魂；阵停可重开

const { Engine, Render, Runner, Bodies, Body, Composite, Events, Query, Vector } = Matter;

const W = 720;
const H = 1280;
const GRAVITY = 1.35;
const MAX_LIVES = 3;

const stage = document.getElementById('stage');
const canvas = document.getElementById('c');
const livesEl = document.getElementById('lives');
const statusEl = document.getElementById('status');
const overlay = document.getElementById('overlay');
const restartBtn = document.getElementById('restart');

const engine = Engine.create({ gravity: { x: 0, y: GRAVITY } });
const world = engine.world;

const render = Render.create({
  canvas,
  engine,
  options: {
    width: W,
    height: H,
    wireframes: false,
    background: '#141a24',
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  },
});

function wall(x, y, w, h, opt = {}) {
  return Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    friction: 0.05,
    restitution: 0.2,
    render: { fillStyle: '#2c3648' },
    ...opt,
  });
}

// Table outline
const thickness = 28;
const walls = [
  wall(W / 2, thickness / 2, W, thickness), // top
  wall(thickness / 2, H / 2, thickness, H), // left
  wall(W - thickness / 2, H / 2, thickness, H), // right
  // bottom shelves leaving drain gaps near sides + plunger lane on right
  wall(150, H - 40, 220, 24),
  wall(420, H - 40, 180, 24),
];

// Slanted inlanes toward flippers
const leftGuide = Bodies.rectangle(120, 980, 220, 18, {
  isStatic: true,
  angle: 0.45,
  friction: 0.02,
  render: { fillStyle: '#3a465c' },
});
const rightGuide = Bodies.rectangle(520, 980, 220, 18, {
  isStatic: true,
  angle: -0.45,
  friction: 0.02,
  render: { fillStyle: '#3a465c' },
});

// Bumpers
function bumper(x, y) {
  return Bodies.circle(x, y, 36, {
    isStatic: true,
    restitution: 1.35,
    friction: 0,
    render: { fillStyle: '#6ea8ff' },
    label: 'bumper',
  });
}
const bumpers = [bumper(260, 420), bumper(460, 420), bumper(360, 560)];

// Flippers — kinematic via angularVelocity pulses
const FLIPPER_LEN = 110;
const FLIPPER_H = 22;
const LEFT_REST = 0.45;
const LEFT_UP = -0.55;
const RIGHT_REST = -0.45;
const RIGHT_UP = 0.55;

function makeFlipper(x, y, isLeft) {
  const body = Bodies.rectangle(x, y, FLIPPER_LEN, FLIPPER_H, {
    friction: 0.05,
    restitution: 0.1,
    density: 0.01,
    chamfer: { radius: 8 },
    render: { fillStyle: '#f0c674' },
    label: isLeft ? 'flipperL' : 'flipperR',
  });
  // pin near outer end
  const pin = isLeft
    ? { x: x - FLIPPER_LEN * 0.38, y }
    : { x: x + FLIPPER_LEN * 0.38, y };
  Body.set(body, { inertia: Infinity }); // we'll drive angle manually as kinematic-ish
  body.plugin = { isLeft, pin, target: isLeft ? LEFT_REST : RIGHT_REST, pressed: false };
  Body.setPosition(body, { x, y });
  Body.setAngle(body, body.plugin.target);
  // Convert to static and rotate each frame around pin (true kinematic feel)
  Body.setStatic(body, true);
  return body;
}

const flipperL = makeFlipper(210, 1080, true);
const flipperR = makeFlipper(430, 1080, false);

function setFlipperAngle(body, angle) {
  const { pin } = body.plugin;
  const dx = body.position.x - pin.x;
  const dy = body.position.y - pin.y;
  // reposition so hinge stays fixed: recreate transform from pin
  Body.setPosition(body, pin);
  Body.setAngle(body, angle);
  // offset center from pin along flipper axis
  const along = body.plugin.isLeft ? FLIPPER_LEN * 0.38 : -FLIPPER_LEN * 0.38;
  const ox = Math.cos(angle) * along;
  const oy = Math.sin(angle) * along;
  Body.setPosition(body, { x: pin.x + ox, y: pin.y + oy });
}

// Drain sensors
const drainL = Bodies.rectangle(55, H - 30, 70, 40, {
  isStatic: true,
  isSensor: true,
  render: { fillStyle: '#5a2030' },
  label: 'drain',
});
const drainR = Bodies.rectangle(W - 55, H - 30, 70, 40, {
  isStatic: true,
  isSensor: true,
  render: { fillStyle: '#5a2030' },
  label: 'drain',
});
// center bottom drain if ball slips between flippers
const drainMid = Bodies.rectangle(320, H - 10, 160, 20, {
  isStatic: true,
  isSensor: true,
  render: { fillStyle: '#5a2030' },
  label: 'drain',
});

// Plunger lane wall
const plungerWall = wall(620, 980, 16, 420);

Composite.add(world, [
  ...walls,
  leftGuide,
  rightGuide,
  ...bumpers,
  flipperL,
  flipperR,
  drainL,
  drainR,
  drainMid,
  plungerWall,
]);

let lives = MAX_LIVES;
let ball = null;
let drainImmuneUntil = 0;
let gameOver = false;
let charging = false;
let chargeStartY = 0;
let chargePower = 0;

function updateHud() {
  livesEl.textContent = `魂 ${lives}`;
}

function spawnBall(launched = false) {
  if (ball) Composite.remove(world, ball);
  ball = Bodies.circle(655, 1100, 16, {
    restitution: 0.55,
    friction: 0.02,
    frictionAir: 0.008,
    density: 0.002,
    render: { fillStyle: '#ffe08a' },
    label: 'ball',
  });
  Composite.add(world, ball);
  if (!launched) {
    Body.setStatic(ball, true);
    statusEl.textContent = '底部上拉发射';
  }
}

function launchBall(power) {
  if (!ball || gameOver) return;
  if (!ball.isStatic) return;
  Body.setStatic(ball, false);
  const p = Math.min(Math.max(power, 0.25), 1);
  Body.setVelocity(ball, { x: -2 - p * 2, y: -18 - p * 22 });
  drainImmuneUntil = performance.now() + 350;
  statusEl.textContent = '左右按住挡板';
}

function loseLife() {
  if (performance.now() < drainImmuneUntil) return;
  if (!ball) return;
  Composite.remove(world, ball);
  ball = null;
  lives -= 1;
  updateHud();
  if (lives <= 0) {
    gameOver = true;
    overlay.classList.add('show');
    statusEl.textContent = '阵停了';
    return;
  }
  statusEl.textContent = `走火。还剩 ${lives} 魂。`;
  setTimeout(() => {
    if (!gameOver) spawnBall(false);
  }, 500);
}

function restart() {
  overlay.classList.remove('show');
  gameOver = false;
  lives = MAX_LIVES;
  updateHud();
  spawnBall(false);
}

Events.on(engine, 'collisionStart', (ev) => {
  for (const pair of ev.pairs) {
    const labels = [pair.bodyA.label, pair.bodyB.label];
    if (labels.includes('ball') && labels.includes('drain')) loseLife();
  }
});

Events.on(engine, 'beforeUpdate', () => {
  for (const f of [flipperL, flipperR]) {
    const rest = f.plugin.isLeft ? LEFT_REST : RIGHT_REST;
    const up = f.plugin.isLeft ? LEFT_UP : RIGHT_UP;
    f.plugin.target = f.plugin.pressed ? up : rest;
    // snappy approach
    const cur = f.angle;
    const next = cur + (f.plugin.target - cur) * 0.55;
    setFlipperAngle(f, next);
  }
  if (ball && !ball.isStatic) {
    // soft fake perspective by Y
    const t = Math.min(Math.max(ball.position.y / H, 0), 1);
    const s = 0.85 + t * 0.25;
    ball.render.sprite = ball.render.sprite || {};
    // matter doesn't scale render easily; tint only — skip visual scale
  }
});

function pointerXRatio(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) / Math.max(rect.width, 1);
}
function pointerYInStage(clientY) {
  const rect = canvas.getBoundingClientRect();
  return ((clientY - rect.top) / Math.max(rect.height, 1)) * H;
}

// 多指：左半屏/右半屏可同时按；右下单独蓄力
const active = new Map(); // id -> 'L' | 'R' | 'charge'

function syncFlippers() {
  let L = false, R = false;
  for (const v of active.values()) {
    if (v === 'L') L = true;
    if (v === 'R') R = true;
  }
  flipperL.plugin.pressed = L;
  flipperR.plugin.pressed = R;
}

function onDown(id, clientX, clientY) {
  if (gameOver) return;
  const r = pointerXRatio(clientX);
  const y = pointerYInStage(clientY);
  // 发射道：右下区域
  if (ball && ball.isStatic && r > 0.68 && y > H * 0.55) {
    active.set(id, 'charge');
    charging = true;
    chargeStartY = y;
    chargePower = 0;
    statusEl.textContent = '蓄力中…上拉';
    return;
  }
  // 移动端放宽分区：左半 / 右半
  if (r < 0.5) active.set(id, 'L');
  else active.set(id, 'R');
  syncFlippers();
}

function onMove(id, clientX, clientY) {
  if (active.get(id) !== 'charge') return;
  const y = pointerYInStage(clientY);
  chargePower = Math.min(Math.max((chargeStartY - y) / 180, 0), 1);
  statusEl.textContent = `蓄力 ${Math.round(chargePower * 100)}%`;
}

function onUp(id) {
  const kind = active.get(id);
  active.delete(id);
  if (kind === 'charge') {
    charging = false;
    launchBall(chargePower || 0.5);
  }
  syncFlippers();
}

function bind(el) {
  const opts = { passive: false };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    onDown(e.pointerId, e.clientX, e.clientY);
  }, opts);
  el.addEventListener('pointermove', (e) => {
    e.preventDefault();
    onMove(e.pointerId, e.clientX, e.clientY);
  }, opts);
  el.addEventListener('pointerup', (e) => {
    e.preventDefault();
    onUp(e.pointerId);
  }, opts);
  el.addEventListener('pointercancel', (e) => onUp(e.pointerId), opts);
  // iOS Safari 兜底
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) onDown('t' + t.identifier, t.clientX, t.clientY);
  }, opts);
  el.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) onMove('t' + t.identifier, t.clientX, t.clientY);
  }, opts);
  el.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) onUp('t' + t.identifier);
  }, opts);
  el.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) onUp('t' + t.identifier);
  }, opts);
}
bind(canvas);
bind(stage);

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ShiftLeft') flipperL.plugin.pressed = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'ShiftRight') flipperR.plugin.pressed = true;
  if (e.code === 'Space' && ball && ball.isStatic) launchBall(0.75);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ShiftLeft') flipperL.plugin.pressed = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'ShiftRight') flipperR.plugin.pressed = false;
});

restartBtn.addEventListener('click', restart);

function fit() {
  // CSS sizes canvas; Matter render internal resolution fixed at WxH
  Render.setPixelRatio(render, Math.min(window.devicePixelRatio || 1, 2));
}
window.addEventListener('resize', fit);
fit();

Render.run(render);
Runner.run(Runner.create(), engine);
updateHud();
spawnBall(false);
statusEl.textContent = '准备好了 · 右下上拉发射';
