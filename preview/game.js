// 一球飞升 · 手机优先物理沙盒
(function () {
  if (typeof Matter === 'undefined') {
    document.getElementById('err').style.display = 'block';
    document.getElementById('err').textContent = '物理库未加载';
    return;
  }

  const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

  const W = 360;
  const H = 640; // 更矮的逻辑分辨率，手机一屏装下
  const MAX_LIVES = 3;

  const canvas = document.getElementById('c');
  const stage = document.getElementById('stage-wrap');
  const livesEl = document.getElementById('lives');
  const statusEl = document.getElementById('status');
  const overlay = document.getElementById('overlay');
  const btnL = document.getElementById('btnL');
  const btnR = document.getElementById('btnR');
  const btnFire = document.getElementById('btnFire');
  const restartBtn = document.getElementById('restart');

  const engine = Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 1.2;
  const world = engine.world;

  const render = Render.create({
    canvas,
    engine,
    options: {
      width: W,
      height: H,
      wireframes: false,
      background: '#141a24',
      pixelRatio: 1,
    },
  });

  function wall(x, y, w, h, fill = '#2c3648') {
    return Bodies.rectangle(x, y, w, h, {
      isStatic: true,
      friction: 0.08,
      restitution: 0.15,
      render: { fillStyle: fill },
    });
  }

  const t = 16;
  const parts = [
    wall(W / 2, t / 2, W, t),
    wall(t / 2, H / 2, t, H),
    wall(W - t / 2, H / 2, t, H),
    // 底板两段，中间/两侧漏沟
    wall(90, H - 18, 140, 16),
    wall(230, H - 18, 100, 16),
    // 导轨
    Bodies.rectangle(70, 480, 130, 12, { isStatic: true, angle: 0.5, render: { fillStyle: '#3a465c' } }),
    Bodies.rectangle(250, 480, 130, 12, { isStatic: true, angle: -0.5, render: { fillStyle: '#3a465c' } }),
    // bumper
    Bodies.circle(130, 220, 22, { isStatic: true, restitution: 1.2, render: { fillStyle: '#6ea8ff' }, label: 'bumper' }),
    Bodies.circle(230, 220, 22, { isStatic: true, restitution: 1.2, render: { fillStyle: '#6ea8ff' }, label: 'bumper' }),
    Bodies.circle(180, 300, 20, { isStatic: true, restitution: 1.2, render: { fillStyle: '#6ea8ff' }, label: 'bumper' }),
    // 发射道右墙
    wall(320, 500, 12, 260, '#3a465c'),
  ];

  // drains
  const drains = [
    Bodies.rectangle(28, H - 12, 40, 28, { isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' } }),
    Bodies.rectangle(W - 28, H - 12, 40, 28, { isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' } }),
    Bodies.rectangle(170, H - 6, 90, 16, { isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' } }),
  ];

  const FL = 64;
  const FH = 14;
  function flipper(x, y, isLeft) {
    const body = Bodies.rectangle(x, y, FL, FH, {
      isStatic: true,
      chamfer: { radius: 6 },
      friction: 0.05,
      restitution: 0.05,
      render: { fillStyle: '#f0c674' },
      label: isLeft ? 'flipperL' : 'flipperR',
    });
    const pin = { x: isLeft ? x - FL * 0.36 : x + FL * 0.36, y };
    const rest = isLeft ? 0.5 : -0.5;
    const up = isLeft ? -0.55 : 0.55;
    body.plugin = { isLeft, pin, rest, up, pressed: false, angle: rest };
    applyFlipper(body, rest);
    return body;
  }

  function applyFlipper(body, angle) {
    const { pin, isLeft } = body.plugin;
    const along = isLeft ? FL * 0.36 : -FL * 0.36;
    Body.setPosition(body, pin);
    Body.setAngle(body, angle);
    Body.setPosition(body, {
      x: pin.x + Math.cos(angle) * along,
      y: pin.y + Math.sin(angle) * along,
    });
    body.plugin.angle = angle;
  }

  const flipperL = flipper(110, 545, true);
  const flipperR = flipper(230, 545, false);

  Composite.add(world, [...parts, ...drains, flipperL, flipperR]);

  let lives = MAX_LIVES;
  let ball = null;
  let immuneUntil = 0;
  let gameOver = false;

  function hud() {
    livesEl.textContent = '魂 ' + lives;
  }

  function spawnBall() {
    if (ball) {
      Composite.remove(world, ball);
      ball = null;
    }
    ball = Bodies.circle(330, 560, 11, {
      isStatic: true,
      restitution: 0.5,
      friction: 0.02,
      frictionAir: 0.01,
      density: 0.004,
      label: 'ball',
      render: { fillStyle: '#ffe08a' },
    });
    Composite.add(world, ball);
    btnFire.disabled = false;
    statusEl.textContent = '点「发射」出球';
  }

  function launch() {
    if (gameOver || !ball || !ball.isStatic) return;
    Body.setStatic(ball, false);
    Body.setVelocity(ball, { x: -3.5, y: -22 });
    immuneUntil = performance.now() + 400;
    btnFire.disabled = true;
    statusEl.textContent = '按住左右挡板';
  }

  function loseLife() {
    if (performance.now() < immuneUntil || !ball) return;
    Composite.remove(world, ball);
    ball = null;
    lives -= 1;
    hud();
    if (lives <= 0) {
      gameOver = true;
      overlay.classList.add('show');
      statusEl.textContent = '阵停了';
      return;
    }
    statusEl.textContent = '走火。还剩 ' + lives + ' 魂';
    setTimeout(function () {
      if (!gameOver) spawnBall();
    }, 450);
  }

  function restart() {
    overlay.classList.remove('show');
    gameOver = false;
    lives = MAX_LIVES;
    hud();
    spawnBall();
  }

  Events.on(engine, 'collisionStart', function (ev) {
    for (let i = 0; i < ev.pairs.length; i++) {
      const a = ev.pairs[i].bodyA.label;
      const b = ev.pairs[i].bodyB.label;
      if ((a === 'ball' && b === 'drain') || (b === 'ball' && a === 'drain')) loseLife();
    }
  });

  Events.on(engine, 'beforeUpdate', function () {
    [flipperL, flipperR].forEach(function (f) {
      const target = f.plugin.pressed ? f.plugin.up : f.plugin.rest;
      const next = f.plugin.angle + (target - f.plugin.angle) * 0.6;
      applyFlipper(f, next);
    });
  });

  function hold(btn, which) {
    const set = function (v) {
      if (which === 'L') flipperL.plugin.pressed = v;
      else flipperR.plugin.pressed = v;
    };
    const down = function (e) {
      e.preventDefault();
      set(true);
    };
    const up = function (e) {
      e.preventDefault();
      set(false);
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
  }

  hold(btnL, 'L');
  hold(btnR, 'R');
  btnFire.addEventListener('click', function (e) {
    e.preventDefault();
    launch();
  });
  restartBtn.addEventListener('click', function (e) {
    e.preventDefault();
    restart();
  });

  // 画布铺满 stage-wrap，完整显示 360x640 逻辑台
  function layout() {
    const rect = stage.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    // 保持比例塞进容器
    const scale = Math.min(cssW / W, cssH / H);
    const viewW = Math.floor(W * scale);
    const viewH = Math.floor(H * scale);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    canvas.style.margin = '0 auto';
    // 居中
    stage.style.display = 'flex';
    stage.style.alignItems = 'center';
    stage.style.justifyContent = 'center';
    render.options.width = W;
    render.options.height = H;
    Render.setPixelRatio(render, Math.min(window.devicePixelRatio || 1, 2));
  }

  window.addEventListener('resize', layout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', layout);
  }

  Render.run(render);
  Runner.run(Runner.create(), engine);
  hud();
  spawnBall();
  layout();
  statusEl.textContent = '点「发射」开始';
})();
