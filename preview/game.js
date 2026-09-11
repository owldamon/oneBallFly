// 一球飞升 · v8 台面重做
// - 挡板：碰撞时给球冲量（静态拧角传不出抛力）
// - 台型：右封闭发射道 + \ 导流进主台 + 加长挡板
(function () {
  if (typeof Matter === 'undefined') {
    var el = document.getElementById('err');
    el.style.display = 'block';
    el.textContent = '物理库未加载';
    return;
  }

  const { Engine, Render, Runner, Bodies, Body, Composite, Events, Query } = Matter;
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
  engine.gravity.y = 0.9;
  const world = engine.world;

  const render = Render.create({
    canvas, engine,
    options: { width: W, height: H, wireframes: false, background: '#0e141d', pixelRatio: 1 },
  });

  function wall(x, y, w, h, color) {
    return Bodies.rectangle(x, y, w, h, {
      isStatic: true, friction: 0.06, restitution: 0.18,
      render: { fillStyle: color || '#2a3446' },
    });
  }

  const parts = [];
  // 外框
  parts.push(wall(6, H / 2, 12, H));
  parts.push(wall(W - 6, H / 2, 12, H));
  parts.push(wall(W / 2, 6, W, 12));

  // 底板：左右宽台，中间只留狭窄沟（更好打）
  parts.push(wall(78, H - 12, 132, 12));
  parts.push(wall(250, H - 12, 112, 12));

  // 发射道
  parts.push(wall(330, 618, 42, 10, '#3a465c')); // 托架
  parts.push(wall(306, 445, 12, 340, '#3a465c')); // 分隔，上沿约 275
  parts.push(wall(342, 38, 26, 48, '#3a465c'));

  // \ 导流进主台（正角）
  parts.push(Bodies.rectangle(328, 102, 92, 14, {
    isStatic: true, angle: 1.0, friction: 0, restitution: 0.8,
    render: { fillStyle: '#5b7196' },
  }));
  parts.push(Bodies.rectangle(276, 138, 86, 14, {
    isStatic: true, angle: 0.72, friction: 0, restitution: 0.6,
    render: { fillStyle: '#5b7196' },
  }));
  parts.push(Bodies.rectangle(222, 168, 78, 12, {
    isStatic: true, angle: 0.35, friction: 0.02, restitution: 0.45,
    render: { fillStyle: '#5b7196' },
  }));

  // 两侧内道（导向挡板）
  parts.push(Bodies.rectangle(72, 505, 118, 12, {
    isStatic: true, angle: 0.58, render: { fillStyle: '#3a465c' },
  }));
  parts.push(Bodies.rectangle(240, 505, 105, 12, {
    isStatic: true, angle: -0.58, render: { fillStyle: '#3a465c' },
  }));

  // 弹垫 / 缓冲柱（少而有效）
  function bumper(x, y, r, c) {
    return Bodies.circle(x, y, r, {
      isStatic: true, restitution: 1.25, friction: 0, label: 'bumper',
      render: { fillStyle: c || '#6ea8ff' },
    });
  }
  parts.push(bumper(96, 460, 15, '#8ec0ff'));
  parts.push(bumper(232, 460, 15, '#8ec0ff'));
  parts.push(bumper(125, 250, 20));
  parts.push(bumper(215, 250, 20));
  parts.push(bumper(170, 320, 17));
  parts.push(bumper(170, 150, 12, '#9ec8ff'));

  const drains = [
    Bodies.rectangle(164, H - 7, 56, 14, {
      isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#602030' },
    }),
    Bodies.rectangle(28, H - 12, 32, 18, {
      isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#602030' },
    }),
    Bodies.rectangle(W - 28, H - 12, 32, 18, {
      isStatic: true, isSensor: true, label: 'drain', render: { fillStyle: '#602030' },
    }),
  ];

  // —— 挡板 ——
  const FL = 92, FH = 18;
  function makeFlipper(pinX, pinY, isLeft) {
    const body = Bodies.rectangle(pinX, pinY, FL, FH, {
      isStatic: true, chamfer: { radius: 7 }, friction: 0.45, restitution: 0,
      label: isLeft ? 'flipL' : 'flipR',
      render: { fillStyle: '#f2c75c' },
    });
    body.plugin = {
      isLeft,
      pin: { x: pinX, y: pinY },
      rest: isLeft ? 0.52 : -0.52,
      up: isLeft ? -0.88 : 0.88,
      pressed: false,
      angle: isLeft ? 0.52 : -0.52,
    };
    applyFlip(body, body.plugin.angle);
    return body;
  }
  function applyFlip(body, angle) {
    const { pin, isLeft } = body.plugin;
    const along = isLeft ? FL * 0.4 : -FL * 0.4;
    Body.setPosition(body, pin);
    Body.setAngle(body, angle);
    Body.setPosition(body, {
      x: pin.x + Math.cos(angle) * along,
      y: pin.y + Math.sin(angle) * along,
    });
    body.plugin.angle = angle;
  }
  const flipL = makeFlipper(98, 535, true);
  const flipR = makeFlipper(230, 535, false);
  Composite.add(world, parts.concat(drains, [flipL, flipR]));

  let lives = MAX_LIVES;
  let ball = null;
  let immuneUntil = 0;
  let gameOver = false;
  let launchedAt = 0;
  let entered = false;
  let flipCoolL = 0;
  let flipCoolR = 0;

  function hud() { livesEl.textContent = '魂 ' + lives; }

  function spawnBall() {
    if (ball) { Composite.remove(world, ball); ball = null; }
    ball = Bodies.circle(330, 580, 10, {
      isStatic: true, density: 0.002, restitution: 0.28, friction: 0.04, frictionAir: 0.01,
      label: 'ball', render: { fillStyle: '#ffe08a' },
    });
    Composite.add(world, ball);
    entered = false;
    launchedAt = 0;
    btnFire.disabled = false;
    statusEl.textContent = '点「发射」';
  }

  function launch() {
    if (gameOver || !ball || !ball.isStatic) return;
    Body.setStatic(ball, false);
    Body.setPosition(ball, { x: 330, y: 560 });
    Body.setVelocity(ball, { x: 0, y: -28 });
    immuneUntil = performance.now() + 850;
    launchedAt = performance.now();
    entered = false;
    btnFire.disabled = true;
    statusEl.textContent = '发射中…';
  }

  function forceEnter() {
    if (!ball || ball.isStatic) return;
    Body.setPosition(ball, { x: 175, y: 150 });
    Body.setVelocity(ball, { x: -1.5, y: 2.5 });
    entered = true;
    statusEl.textContent = '按住挡板把球打上去';
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
    setTimeout(function () { if (!gameOver) spawnBall(); }, 400);
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
    if (!ball || gameOver) {
      // still update flipper visuals
    }

    // 1) 先按旧姿态检测碰撞并给冲量，再转动挡板
    if (ball && !ball.isStatic) {
      var now = performance.now();
      [[flipL, 'L'], [flipR, 'R']].forEach(function (pair) {
        var f = pair[0];
        if (!f.plugin.pressed) return;
        if (pair[1] === 'L' && now < flipCoolL) return;
        if (pair[1] === 'R' && now < flipCoolR) return;
        if (!Query.collides(ball, [f]).length) return;
        var dir = f.plugin.isLeft ? 1 : -1;
        // 核心：主动抛起
        Body.setVelocity(ball, {
          x: ball.velocity.x * 0.2 + dir * 5.5,
          y: -15.5,
        });
        if (pair[1] === 'L') flipCoolL = now + 90;
        else flipCoolR = now + 90;
      });
    }

    // 2) 转动挡板朝向目标角
    [flipL, flipR].forEach(function (f) {
      var target = f.plugin.pressed ? f.plugin.up : f.plugin.rest;
      applyFlip(f, f.plugin.angle + (target - f.plugin.angle) * 0.5);
    });

    if (!ball || ball.isStatic || gameOver) return;
    var p = ball.position, v = ball.velocity;

    if (p.x < 280 && p.y > 90 && p.y < 520) {
      if (!entered) {
        entered = true;
        statusEl.textContent = '按住挡板把球打上去';
      }
    }
    if (!entered && p.x > 300 && p.y < 175 && v.y > 0 && v.x > -2) {
      Body.setVelocity(ball, { x: -6, y: Math.min(v.y, 3) });
    }
    if (!entered && launchedAt && performance.now() - launchedAt > 1100) forceEnter();

    if (p.x < 10) Body.setVelocity(ball, { x: Math.abs(v.x) * 0.4 + 1, y: v.y });
    if (p.x > W - 10) Body.setVelocity(ball, { x: -(Math.abs(v.x) * 0.4 + 1), y: v.y });
    if (p.y > H + 40) loseLife();
  });

  function hold(btn, side) {
    function set(v) {
      if (side === 'L') flipL.plugin.pressed = v;
      else flipR.plugin.pressed = v;
    }
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
