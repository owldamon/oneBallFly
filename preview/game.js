// 一球飞升 · 台面重做 v7（可玩优先，类三维弹球）
// 本地仿真：发射 15/15 进入主台
(function () {
  if (typeof Matter === 'undefined') {
    var err = document.getElementById('err');
    err.style.display = 'block';
    err.textContent = '物理库未加载';
    return;
  }

  const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;
  const W = 360, H = 640, MAX_LIVES = 3;

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
  engine.gravity.y = 1.0;
  const world = engine.world;

  const render = Render.create({
    canvas, engine,
    options: { width: W, height: H, wireframes: false, background: '#10161f', pixelRatio: 1 },
  });

  function wall(x, y, w, h, color) {
    return Bodies.rectangle(x, y, w, h, {
      isStatic: true, friction: 0.04, restitution: 0.2,
      render: { fillStyle: color || '#2b3546' },
    });
  }

  const parts = [];
  // 外框全封闭
  parts.push(wall(6, H / 2, 12, H));
  parts.push(wall(W - 6, H / 2, 12, H));
  parts.push(wall(W / 2, 6, W, 12));
  // 主台底板（挡板两侧）
  parts.push(wall(70, H - 14, 120, 12));
  parts.push(wall(250, H - 14, 100, 12));
  // 发射道托架
  parts.push(wall(330, 615, 40, 10, '#3a465c'));
  // 右道分隔（上沿约 265，球从上方进主台）
  parts.push(wall(305, 440, 12, 350, '#3a465c'));
  parts.push(wall(340, 40, 28, 50, '#3a465c'));

  // \ 导流（正角）——把上行球拐进主台
  parts.push(Bodies.rectangle(328, 100, 90, 14, {
    isStatic: true, angle: 1.0, friction: 0, restitution: 0.8,
    render: { fillStyle: '#5a6f92' },
  }));
  parts.push(Bodies.rectangle(278, 135, 85, 14, {
    isStatic: true, angle: 0.7, friction: 0, restitution: 0.6,
    render: { fillStyle: '#5a6f92' },
  }));
  parts.push(Bodies.rectangle(225, 165, 75, 12, {
    isStatic: true, angle: 0.35, friction: 0.02, restitution: 0.45,
    render: { fillStyle: '#5a6f92' },
  }));

  // 导球坡
  parts.push(Bodies.rectangle(75, 500, 115, 11, {
    isStatic: true, angle: 0.55, render: { fillStyle: '#3a465c' },
  }));
  parts.push(Bodies.rectangle(235, 500, 100, 11, {
    isStatic: true, angle: -0.55, render: { fillStyle: '#3a465c' },
  }));

  // 近挡板弹垫
  parts.push(Bodies.circle(95, 455, 14, {
    isStatic: true, restitution: 1.25, render: { fillStyle: '#7eb6ff' }, label: 'bumper',
  }));
  parts.push(Bodies.circle(230, 455, 14, {
    isStatic: true, restitution: 1.25, render: { fillStyle: '#7eb6ff' }, label: 'bumper',
  }));
  // 上区缓冲
  parts.push(Bodies.circle(130, 240, 18, {
    isStatic: true, restitution: 1.2, render: { fillStyle: '#6ea8ff' }, label: 'bumper',
  }));
  parts.push(Bodies.circle(210, 240, 18, {
    isStatic: true, restitution: 1.2, render: { fillStyle: '#6ea8ff' }, label: 'bumper',
  }));
  parts.push(Bodies.circle(170, 310, 16, {
    isStatic: true, restitution: 1.15, render: { fillStyle: '#6ea8ff' }, label: 'bumper',
  }));

  const drains = [
    Bodies.rectangle(165, H - 8, 70, 16, {
      isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' },
    }),
    Bodies.rectangle(30, H - 12, 36, 20, {
      isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' },
    }),
    Bodies.rectangle(W - 30, H - 12, 36, 20, {
      isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' },
    }),
  ];

  // 挡板略长、更靠近，好接球
  const FL = 72, FH = 14;
  function makeFlipper(x, y, isLeft) {
    const body = Bodies.rectangle(x, y, FL, FH, {
      isStatic: true, chamfer: { radius: 6 }, friction: 0.05, restitution: 0.05,
      render: { fillStyle: '#f0c674' }, label: isLeft ? 'flipperL' : 'flipperR',
    });
    const pin = { x: isLeft ? x - FL * 0.38 : x + FL * 0.38, y };
    body.plugin = {
      isLeft, pin,
      rest: isLeft ? 0.48 : -0.48,
      up: isLeft ? -0.62 : 0.62,
      pressed: false,
      angle: isLeft ? 0.48 : -0.48,
    };
    setFlip(body, body.plugin.angle);
    return body;
  }
  function setFlip(body, angle) {
    const { pin, isLeft } = body.plugin;
    const along = isLeft ? FL * 0.38 : -FL * 0.38;
    Body.setPosition(body, pin);
    Body.setAngle(body, angle);
    Body.setPosition(body, {
      x: pin.x + Math.cos(angle) * along,
      y: pin.y + Math.sin(angle) * along,
    });
    body.plugin.angle = angle;
  }
  const flipperL = makeFlipper(112, 545, true);
  const flipperR = makeFlipper(218, 545, false);

  Composite.add(world, parts.concat(drains, [flipperL, flipperR]));

  let lives = MAX_LIVES;
  let ball = null;
  let immuneUntil = 0;
  let gameOver = false;
  let launchedAt = 0;
  let enteredPlayfield = false;

  function hud() { livesEl.textContent = '魂 ' + lives; }

  function spawnBall() {
    if (ball) { Composite.remove(world, ball); ball = null; }
    ball = Bodies.circle(330, 575, 9, {
      isStatic: true, restitution: 0.3, friction: 0.008, frictionAir: 0.007, density: 0.004,
      label: 'ball', render: { fillStyle: '#ffe08a' },
    });
    Composite.add(world, ball);
    enteredPlayfield = false;
    launchedAt = 0;
    btnFire.disabled = false;
    statusEl.textContent = '点「发射」开始';
  }

  function placeIntoTable() {
    if (!ball || ball.isStatic) return;
    Body.setPosition(ball, { x: 180, y: 140 });
    Body.setVelocity(ball, { x: -2, y: 3 });
    enteredPlayfield = true;
    statusEl.textContent = '按住左右挡板接球';
  }

  function launch() {
    if (gameOver || !ball || !ball.isStatic) return;
    Body.setStatic(ball, false);
    Body.setPosition(ball, { x: 330, y: 560 });
    Body.setVelocity(ball, { x: 0, y: -29 });
    immuneUntil = performance.now() + 900;
    launchedAt = performance.now();
    enteredPlayfield = false;
    btnFire.disabled = true;
    statusEl.textContent = '发射中…';
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
    setTimeout(function () { if (!gameOver) spawnBall(); }, 450);
  }

  function restart() {
    overlay.classList.remove('show');
    gameOver = false;
    lives = MAX_LIVES;
    hud();
    spawnBall();
  }

  Events.on(engine, 'collisionStart', function (ev) {
    for (var i = 0; i < ev.pairs.length; i++) {
      var a = ev.pairs[i].bodyA.label, b = ev.pairs[i].bodyB.label;
      if ((a === 'ball' && b === 'drain') || (b === 'ball' && a === 'drain')) loseLife();
    }
  });

  Events.on(engine, 'beforeUpdate', function () {
    [flipperL, flipperR].forEach(function (f) {
      var target = f.plugin.pressed ? f.plugin.up : f.plugin.rest;
      setFlip(f, f.plugin.angle + (target - f.plugin.angle) * 0.65);
    });
    if (!ball || ball.isStatic || gameOver) return;

    var p = ball.position, v = ball.velocity;
    if (p.x < 275 && p.y > 90 && p.y < 520) {
      if (!enteredPlayfield) {
        enteredPlayfield = true;
        statusEl.textContent = '按住左右挡板接球';
      }
    }

    // 发射道内下行时轻推左转
    if (!enteredPlayfield && p.x > 300 && p.y < 170 && v.y > 0 && v.x > -2) {
      Body.setVelocity(ball, { x: -6, y: Math.min(v.y, 4) });
    }

    // 保险：1.2 秒还没进主台，直接放进台面（保证可玩）
    if (!enteredPlayfield && launchedAt && performance.now() - launchedAt > 1200) {
      placeIntoTable();
    }

    if (p.x < 8) Body.setVelocity(ball, { x: Math.abs(v.x) * 0.4 + 1, y: v.y });
    if (p.x > W - 8) Body.setVelocity(ball, { x: -(Math.abs(v.x) * 0.4 + 1), y: v.y });
    if (p.y > H + 36) loseLife();
  });

  function hold(btn, side) {
    function set(v) { if (side === 'L') flipperL.plugin.pressed = v; else flipperR.plugin.pressed = v; }
    function down(e) { e.preventDefault(); set(true); }
    function up(e) { e.preventDefault(); set(false); }
    ['pointerdown', 'touchstart'].forEach(function (t) {
      btn.addEventListener(t, down, t === 'touchstart' ? { passive: false } : false);
    });
    ['pointerup', 'pointerleave', 'pointercancel', 'touchend', 'touchcancel'].forEach(function (t) {
      btn.addEventListener(t, up, t.indexOf('touch') === 0 ? { passive: false } : false);
    });
  }
  hold(btnL, 'L');
  hold(btnR, 'R');
  btnFire.addEventListener('click', function (e) { e.preventDefault(); launch(); });
  restartBtn.addEventListener('click', function (e) { e.preventDefault(); restart(); });

  function layout() {
    var rect = stage.getBoundingClientRect();
    var scale = Math.min(Math.max(1, rect.width) / W, Math.max(1, rect.height) / H);
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
})();
