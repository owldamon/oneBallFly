// 一球飞升 · 类微软三维弹球（Space Cadet）台型沙盒
// 右发射道上行 → 顶部拐进主台；左右挡板；掉沟丢魂
(function () {
  if (typeof Matter === 'undefined') {
    var err = document.getElementById('err');
    err.style.display = 'block';
    err.textContent = '物理库未加载';
    return;
  }

  const { Engine, Render, Runner, Bodies, Body, Composite, Events, Constraint } = Matter;

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

  const engine = Engine.create({ enableSleeping: false });
  engine.gravity.x = 0;
  engine.gravity.y = 1.05;
  const world = engine.world;

  const render = Render.create({
    canvas,
    engine,
    options: { width: W, height: H, wireframes: false, background: '#121821', pixelRatio: 1 },
  });

  function rect(x, y, w, h, opt) {
    return Bodies.rectangle(x, y, w, h, Object.assign({
      isStatic: true,
      friction: 0.05,
      restitution: 0.25,
      render: { fillStyle: '#2b3546' },
    }, opt || {}));
  }

  // —— 封闭台框（三维弹球感）：四周封死，只留底部挡板之间的沟 ——
  const wallT = 14;
  const parts = [];

  // 左边墙
  parts.push(rect(wallT / 2, H / 2, wallT, H));
  // 顶墙整段
  parts.push(rect(W / 2, wallT / 2, W, wallT));
  // 右边外墙整段（发射道在其内侧）
  parts.push(rect(W - wallT / 2, H / 2, wallT, H));

  // 发射道分隔墙：从底部到接近顶部，上端留「拐弯口」进主台
  // 道宽约 36px，球半径 9
  const laneX = 312; // 分隔墙中心
  parts.push(rect(laneX, 360, 10, 500)); // 主分隔，上沿大约 y=110

  // 顶部右侧弯角：把上行球挡回主台（向左下）
  // 斜板在右上角内侧
  parts.push(Bodies.rectangle(338, 48, 70, 12, {
    isStatic: true,
    angle: Math.PI / 4,
    friction: 0.02,
    restitution: 0.5,
    render: { fillStyle: '#4d5d78' },
  }));
  parts.push(Bodies.rectangle(300, 42, 55, 12, {
    isStatic: true,
    angle: -0.35,
    friction: 0.02,
    restitution: 0.45,
    render: { fillStyle: '#4d5d78' },
  }));

  // 分隔墙上端挡头，防止球从分隔墙顶飞到墙外缝里
  parts.push(rect(laneX - 18, 108, 40, 10, { render: { fillStyle: '#3a465c' } }));

  // 底板（左右两截，中间开口给沟；右侧底板不到发射道）
  parts.push(rect(100, H - 16, 160, 14));
  parts.push(rect(230, H - 16, 90, 14));

  // 入球坡（导到挡板）
  parts.push(Bodies.rectangle(78, 485, 130, 11, {
    isStatic: true, angle: 0.48, render: { fillStyle: '#3a465c' },
  }));
  parts.push(Bodies.rectangle(236, 485, 110, 11, {
    isStatic: true, angle: -0.48, render: { fillStyle: '#3a465c' },
  }));

  // 三角缓冲（类弹珠台）
  function bumper(x, y, r) {
    return Bodies.circle(x, y, r, {
      isStatic: true,
      restitution: 1.2,
      friction: 0,
      label: 'bumper',
      render: { fillStyle: '#6ea8ff' },
    });
  }
  parts.push(bumper(120, 200, 20));
  parts.push(bumper(210, 200, 20));
  parts.push(bumper(165, 270, 18));

  // 简易上方靶柱
  parts.push(Bodies.circle(100, 120, 10, { isStatic: true, restitution: 0.8, render: { fillStyle: '#8ab4ff' } }));
  parts.push(Bodies.circle(165, 110, 10, { isStatic: true, restitution: 0.8, render: { fillStyle: '#8ab4ff' } }));
  parts.push(Bodies.circle(230, 120, 10, { isStatic: true, restitution: 0.8, render: { fillStyle: '#8ab4ff' } }));

  // 浊沟传感器
  const drains = [
    Bodies.rectangle(36, H - 10, 48, 24, { isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' } }),
    Bodies.rectangle(W - 36, H - 10, 48, 24, { isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' } }),
    Bodies.rectangle(168, H - 6, 100, 14, { isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#5a2030' } }),
  ];

  // 挡板
  const FL = 62, FH = 13;
  function makeFlipper(x, y, isLeft) {
    const body = Bodies.rectangle(x, y, FL, FH, {
      isStatic: true,
      chamfer: { radius: 5 },
      friction: 0.04,
      restitution: 0.05,
      render: { fillStyle: '#f0c674' },
      label: isLeft ? 'flipperL' : 'flipperR',
    });
    const pin = { x: isLeft ? x - FL * 0.36 : x + FL * 0.36, y };
    body.plugin = {
      isLeft,
      pin,
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
    Body.setPosition(body, {
      x: pin.x + Math.cos(angle) * along,
      y: pin.y + Math.sin(angle) * along,
    });
    body.plugin.angle = angle;
  }
  const flipperL = makeFlipper(108, 548, true);
  const flipperR = makeFlipper(228, 548, false);

  Composite.add(world, parts.concat(drains, [flipperL, flipperR]));

  let lives = MAX_LIVES;
  let ball = null;
  let immuneUntil = 0;
  let gameOver = false;

  function hud() { livesEl.textContent = '魂 ' + lives; }

  function spawnBall() {
    if (ball) { Composite.remove(world, ball); ball = null; }
    // 发射道底部待命（分隔墙右侧）
    ball = Bodies.circle(334, 580, 9, {
      isStatic: true,
      restitution: 0.4,
      friction: 0.01,
      frictionAir: 0.006,
      density: 0.0035,
      label: 'ball',
      render: { fillStyle: '#ffe08a' },
    });
    Composite.add(world, ball);
    btnFire.disabled = false;
    statusEl.textContent = '点「发射」——像三维弹球一样冲上去';
  }

  function launch() {
    if (gameOver || !ball || !ball.isStatic) return;
    Body.setStatic(ball, false);
    Body.setPosition(ball, { x: 334, y: 540 });
    // 几乎竖直向上，靠顶角弹进主台（不要给向右速度）
    Body.setVelocity(ball, { x: -0.5, y: -28 });
    immuneUntil = performance.now() + 700;
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
    // 硬边界：球绝不能出屏幕外（防飞出）
    if (ball && !ball.isStatic) {
      var p = ball.position;
      var v = ball.velocity;
      if (p.x < 12) { Body.setPosition(ball, { x: 12, y: p.y }); Body.setVelocity(ball, { x: Math.abs(v.x) * 0.5, y: v.y }); }
      if (p.x > W - 12) { Body.setPosition(ball, { x: W - 12, y: p.y }); Body.setVelocity(ball, { x: -Math.abs(v.x) * 0.5, y: v.y }); }
      if (p.y < 12) { Body.setPosition(ball, { x: p.x, y: 12 }); Body.setVelocity(ball, { x: v.x - 2, y: Math.abs(v.y) * 0.4 }); }
      if (p.y > H + 30) loseLife();
    }
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
