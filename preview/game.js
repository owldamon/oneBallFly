// 一球飞升 · 手机优先物理沙盒
(function () {
  if (typeof Matter === 'undefined') {
    document.getElementById('err').style.display = 'block';
    document.getElementById('err').textContent = '物理库未加载';
    return;
  }

  const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

  const W = 360;
  const H = 640;
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
  engine.gravity.y = 1.15;
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
      friction: 0.06,
      restitution: 0.2,
      render: { fillStyle: fill },
    });
  }

  const t = 16;
  // 关键道在右侧 x≈300–348；顶部左侧封顶，右上留出口让球进入主台
  const parts = [
    wall(140, t / 2, 280, t), // 顶墙只盖左~中，右边开口
    wall(t / 2, H / 2, t, H), // 左边
    // 右边外墙：上段留空（出口），中下才有墙
    wall(W - t / 2, 420, t, 400),
    // 发射道内壁（与右边形成滑道），上端低于出口
    wall(300, 400, 12, 360),
    // 出口导流：把上行球拨向左进主台
    Bodies.rectangle(318, 70, 90, 12, {
      isStatic: true,
      angle: -0.7,
      friction: 0.01,
      restitution: 0.4,
      render: { fillStyle: '#4a5a74' },
    }),
    // 底板
    wall(95, H - 18, 150, 16),
    wall(235, H - 18, 110, 16),
    // 导轨
    Bodies.rectangle(75, 470, 120, 12, { isStatic: true, angle: 0.5, render: { fillStyle: '#3a465c' } }),
    Bodies.rectangle(240, 470, 120, 12, { isStatic: true, angle: -0.5, render: { fillStyle: '#3a465c' } }),
    // bumper
    Bodies.circle(120, 210, 22, { isStatic: true, restitution: 1.15, render: { fillStyle: '#6ea8ff' }, label: 'bumper' }),
    Bodies.circle(220, 210, 22, { isStatic: true, restitution: 1.15, render: { fillStyle: '#6ea8ff' }, label: 'bumper' }),
    Bodies.circle(170, 290, 20, { isStatic: true, restitution: 1.15, render: { fillStyle: '#6ea8ff' }, label: 'bumper' }),
  ];

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
    // 发射道内待命
    ball = Bodies.circle(328, 560, 10, {
      isStatic: true,
      restitution: 0.45,
      friction: 0.01,
      frictionAir: 0.008,
      density: 0.003,
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
    // 先上再被导流板拨进主台
    Body.setVelocity(ball, { x: 0.2, y: -26 });
    Body.setPosition(ball, { x: 328, y: 520 });
    immuneUntil = performance.now() + 600;
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

  // 防卡死：出界或速度过久接近 0 时重置
  let stillFrames = 0;
  Events.on(engine, 'afterUpdate', function () {
    if (!ball || ball.isStatic || gameOver) {
      stillFrames = 0;
      return;
    }
    const p = ball.position;
    const v = ball.velocity;
    const speed = Math.hypot(v.x, v.y);
    if (p.x < -40 || p.x > W + 40 || p.y < -80 || p.y > H + 40) {
      loseLife();
      return;
    }
    // 卡在发射道顶（开口附近）太久
    if (p.x > 290 && p.y < 120 && speed < 0.35) {
      stillFrames += 1;
      if (stillFrames > 45) {
        Body.setVelocity(ball, { x: -8, y: 2 });
        stillFrames = 0;
      }
    } else if (speed < 0.15 && p.y > 100) {
      stillFrames += 1;
      if (stillFrames > 90) Body.setVelocity(ball, { x: (Math.random() - 0.5) * 4, y: -3 });
    } else {
      stillFrames = 0;
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

  function layout() {
    const rect = stage.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const scale = Math.min(cssW / W, cssH / H);
    canvas.style.width = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
    stage.style.display = 'flex';
    stage.style.alignItems = 'center';
    stage.style.justifyContent = 'center';
    Render.setPixelRatio(render, Math.min(window.devicePixelRatio || 1, 2));
  }

  window.addEventListener('resize', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);

  Render.run(render);
  Runner.run(Runner.create(), engine);
  hud();
  spawnBall();
  layout();
  statusEl.textContent = '点「发射」开始';
})();
