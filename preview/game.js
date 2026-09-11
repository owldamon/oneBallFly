// 一球飞升 · 类三维弹球台型（发射道封闭，顶上 \ 板拨进主台）
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
  engine.gravity.x = 0;
  engine.gravity.y = 1.0;
  const world = engine.world;

  const render = Render.create({
    canvas, engine,
    options: { width: W, height: H, wireframes: false, background: '#121821', pixelRatio: 1 },
  });

  function R(x, y, w, h, fill) {
    return Bodies.rectangle(x, y, w, h, {
      isStatic: true, friction: 0.03, restitution: 0.25,
      render: { fillStyle: fill || '#2b3546' },
    });
  }

  const parts = [];
  // 封闭外框
  parts.push(R(7, H / 2, 14, H));
  parts.push(R(W - 7, H / 2, 14, H));
  parts.push(R(W / 2, 7, W, 14));
  // 主台底板（不含发射道）
  parts.push(R(135, H - 16, 250, 14));
  // 发射道底部托架
  parts.push(R(332, 608, 42, 12, '#3a465c'));
  // 分隔墙：上沿约 y=250，球从上方拐进主台
  parts.push(R(304, 430, 14, 360, '#3a465c'));
  // 关键角顶死，防穿模
  parts.push(R(345, 35, 22, 36, '#3a465c'));

  // 关键：必须用正角「\」把上行球拨向左进主台（负角「/」会把球打到右边飞出）
  parts.push(Bodies.rectangle(330, 95, 85, 16, {
    isStatic: true, angle: 0.95, friction: 0, restitution: 0.75,
    render: { fillStyle: '#5a6f92' },
  }));
  parts.push(Bodies.rectangle(285, 125, 80, 14, {
    isStatic: true, angle: 0.65, friction: 0, restitution: 0.55,
    render: { fillStyle: '#5a6f92' },
  }));
  parts.push(Bodies.rectangle(235, 150, 70, 12, {
    isStatic: true, angle: 0.35, friction: 0.02, restitution: 0.4,
    render: { fillStyle: '#5a6f92' },
  }));

  // 入板坡
  parts.push(Bodies.rectangle(80, 490, 120, 12, { isStatic: true, angle: 0.5, render: { fillStyle: '#3a465c' } }));
  parts.push(Bodies.rectangle(230, 490, 110, 12, { isStatic: true, angle: -0.5, render: { fillStyle: '#3a465c' } }));

  // 柱
  function bumper(x, y, rad) {
    return Bodies.circle(x, y, rad, {
      isStatic: true, restitution: 1.15, friction: 0, label: 'bumper',
      render: { fillStyle: '#6ea8ff' },
    });
  }
  parts.push(bumper(140, 230, 18), bumper(220, 230, 18), bumper(180, 300, 16));
  parts.push(Bodies.circle(110, 130, 9, { isStatic: true, restitution: 0.85, render: { fillStyle: '#8ab4ff' } }));
  parts.push(Bodies.circle(175, 118, 9, { isStatic: true, restitution: 0.85, render: { fillStyle: '#8ab4ff' } }));
  parts.push(Bodies.circle(240, 130, 9, { isStatic: true, restitution: 0.85, render: { fillStyle: '#8ab4ff' } }));

  const drains = [
    Bodies.rectangle(36, H - 10, 48, 24, { isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' } }),
    Bodies.rectangle(W - 36, H - 10, 48, 24, { isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' } }),
    Bodies.rectangle(168, H - 6, 100, 14, { isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' } }),
  ];

  const FL = 62, FH = 13;
  function makeFlipper(x, y, isLeft) {
    const body = Bodies.rectangle(x, y, FL, FH, {
      isStatic: true, chamfer: { radius: 5 }, friction: 0.04, restitution: 0.05,
      render: { fillStyle: '#f0c674' }, label: isLeft ? 'flipperL' : 'flipperR',
    });
    const pin = { x: isLeft ? x - FL * 0.36 : x + FL * 0.36, y };
    body.plugin = {
      isLeft, pin,
      rest: isLeft ? 0.52 : -0.52,
      up: isLeft ? -0.58 : 0.58,
      pressed: false,
      angle: isLeft ? 0.52 : -0.52,
    };
    setFlip(body, body.plugin.angle);
    return body;
  }
  function setFlip(body, angle) {
    const { pin, isLeft } = body.plugin;
    const along = isLeft ? FL * 0.36 : -FL * 0.36;
    Body.setPosition(body, pin);
    Body.setAngle(body, angle);
    Body.setPosition(body, { x: pin.x + Math.cos(angle) * along, y: pin.y + Math.sin(angle) * along });
    body.plugin.angle = angle;
  }
  const flipperL = makeFlipper(108, 548, true);
  const flipperR = makeFlipper(228, 548, false);

  Composite.add(world, parts.concat(drains, [flipperL, flipperR]));

  let lives = MAX_LIVES, ball = null, immuneUntil = 0, gameOver = false;

  function hud() { livesEl.textContent = '魂 ' + lives; }

  function spawnBall() {
    if (ball) { Composite.remove(world, ball); ball = null; }
    ball = Bodies.circle(332, 575, 9, {
      isStatic: true, restitution: 0.25, friction: 0.005, frictionAir: 0.006, density: 0.004,
      label: 'ball', render: { fillStyle: '#ffe08a' },
    });
    Composite.add(world, ball);
    btnFire.disabled = false;
    statusEl.textContent = '点「发射」冲上右道拐进台';
  }

  function launch() {
    if (gameOver || !ball || !ball.isStatic) return;
    Body.setStatic(ball, false);
    Body.setPosition(ball, { x: 332, y: 520 });
    // 必须近似竖直向上；左右速度会破坏进台
    Body.setVelocity(ball, { x: 0, y: -29 });
    immuneUntil = performance.now() + 800;
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
      setFlip(f, f.plugin.angle + (target - f.plugin.angle) * 0.62);
    });
    if (!ball || ball.isStatic || gameOver) return;
    var p = ball.position, v = ball.velocity;
    // 若还在发射道高位却往下掉，轻推向左帮进台（容错）
    if (p.x > 300 && p.y < 160 && v.y > 0 && v.x > -2) {
      Body.setVelocity(ball, { x: -6, y: Math.min(v.y, 4) });
    }
    if (p.x < 10) Body.setVelocity(ball, { x: Math.abs(v.x) * 0.5, y: v.y });
    if (p.x > W - 10) Body.setVelocity(ball, { x: -Math.abs(v.x) * 0.5, y: v.y });
    if (p.y > H + 40) loseLife();
  });

  function hold(btn, side) {
    function set(v) { if (side === 'L') flipperL.plugin.pressed = v; else flipperR.plugin.pressed = v; }
    function down(e) { e.preventDefault(); set(true); }
    function up(e) { e.preventDefault(); set(false); }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
  }
  hold(btnL, 'L'); hold(btnR, 'R');
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
  hud(); spawnBall(); layout();
})();
