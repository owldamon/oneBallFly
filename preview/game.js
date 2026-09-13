// 一球飞升 · v9 水墨胶囊台（按用户风格参考）
(function () {
  if (typeof Matter === 'undefined') {
    var err = document.getElementById('err');
    err.style.display = 'block';
    err.textContent = '物理库未加载';
    return;
  }

  const { Engine, Render, Runner, Bodies, Body, Composite, Events, Query } = Matter;

  // 逻辑坐标：竖胶囊
  const W = 360, H = 640, MAX_LIVES = 3;
  const CX = W / 2;
  const TABLE_W = 300;
  const TABLE_LEFT = (W - TABLE_W) / 2;
  const TABLE_RIGHT = TABLE_LEFT + TABLE_W;
  const TABLE_TOP = 40;
  const TABLE_BOTTOM = 600;
  const RADIUS = TABLE_W / 2; // 上下半圆半径

  const canvas = document.getElementById('c');
  const stage = document.getElementById('stage-wrap');
  const scoreEl = document.getElementById('score');
  const multEl = document.getElementById('mult');
  const livesEl = document.getElementById('lives');
  const overlay = document.getElementById('overlay');
  const btnL = document.getElementById('btnL');
  const btnR = document.getElementById('btnR');
  const btnFire = document.getElementById('btnFire');
  const restartBtn = document.getElementById('restart');

  const engine = Engine.create();
  engine.gravity.y = 0.88;
  const world = engine.world;

  const render = Render.create({
    canvas, engine,
    options: {
      width: W, height: H, wireframes: false, background: 'transparent', pixelRatio: 1,
    },
  });

  // —— 背景图 ——
  const bg = new Image();
  bg.src = './style-ref.png';
  let bgReady = false;
  bg.onload = function () { bgReady = true; };

  function segmentWall(x1, y1, x2, y2, thick) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    return Bodies.rectangle(cx, cy, len, thick || 14, {
      isStatic: true,
      angle: Math.atan2(dy, dx),
      friction: 0.05,
      restitution: 0.2,
      render: { visible: false },
    });
  }

  // 胶囊边界：左右直壁 + 上下半圆折线近似
  const walls = [];
  const leftX = TABLE_LEFT + 8;
  const rightX = TABLE_RIGHT - 8;
  const straightTop = TABLE_TOP + RADIUS;
  const straightBot = TABLE_BOTTOM - RADIUS;
  walls.push(segmentWall(leftX, straightTop, leftX, straightBot, 16));
  walls.push(segmentWall(rightX, straightTop, rightX, straightBot, 16));

  const arcSteps = 12;
  // top semicircle
  for (let i = 0; i < arcSteps; i++) {
    const a0 = Math.PI + (i / arcSteps) * Math.PI;
    const a1 = Math.PI + ((i + 1) / arcSteps) * Math.PI;
    const x0 = CX + Math.cos(a0) * (RADIUS - 8);
    const y0 = straightTop + Math.sin(a0) * (RADIUS - 8);
    const x1 = CX + Math.cos(a1) * (RADIUS - 8);
    const y1 = straightTop + Math.sin(a1) * (RADIUS - 8);
    walls.push(segmentWall(x0, y0, x1, y1, 16));
  }
  // bottom semicircle (opening in center for drain — skip middle segments)
  for (let i = 0; i < arcSteps; i++) {
    // bottom arc: angle 0 → PI, but skip center gap for drain
    const t0 = i / arcSteps;
    const t1 = (i + 1) / arcSteps;
    // skip roughly center 20%
    if (t0 > 0.38 && t1 < 0.62) continue;
    const a0 = (i / arcSteps) * Math.PI;
    const a1 = ((i + 1) / arcSteps) * Math.PI;
    const x0 = CX + Math.cos(a0) * (RADIUS - 8);
    const y0 = straightBot + Math.sin(a0) * (RADIUS - 8);
    const x1 = CX + Math.cos(a1) * (RADIUS - 8);
    const y1 = straightBot + Math.sin(a1) * (RADIUS - 8);
    walls.push(segmentWall(x0, y0, x1, y1, 16));
  }

  // 底部托台左右（挡板外侧）
  walls.push(Bodies.rectangle(CX - 78, TABLE_BOTTOM - 18, 90, 12, {
    isStatic: true, friction: 0.08, restitution: 0.15, render: { visible: false },
  }));
  walls.push(Bodies.rectangle(CX + 78, TABLE_BOTTOM - 18, 90, 12, {
    isStatic: true, friction: 0.08, restitution: 0.15, render: { visible: false },
  }));

  function jadeBumper(x, y, r) {
    return Bodies.circle(x, y, r, {
      isStatic: true, restitution: 1.22, friction: 0, label: 'bumper',
      render: { visible: false },
      plugin: { kind: 'bumper', r: r },
    });
  }
  const bumpers = [
    jadeBumper(CX - 48, 210, 22),
    jadeBumper(CX + 48, 210, 22),
    jadeBumper(CX, 275, 20),
  ];

  const drain = Bodies.rectangle(CX, TABLE_BOTTOM - 6, 54, 16, {
    isStatic: true, isSensor: true, label: 'drain', render: { visible: false },
  });

  // 挡板
  const FL = 88, FH = 18;
  function makeFlipper(pinX, pinY, isLeft) {
    const body = Bodies.rectangle(pinX, pinY, FL, FH, {
      isStatic: true, chamfer: { radius: 8 }, friction: 0.5, restitution: 0,
      label: isLeft ? 'flipL' : 'flipR',
      render: { visible: false },
    });
    body.plugin = {
      isLeft,
      pin: { x: pinX, y: pinY },
      rest: isLeft ? 0.5 : -0.5,
      up: isLeft ? -0.9 : 0.9,
      pressed: false,
      angle: isLeft ? 0.5 : -0.5,
      kind: 'flipper',
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
  const flipL = makeFlipper(CX - 72, TABLE_BOTTOM - 55, true);
  const flipR = makeFlipper(CX + 72, TABLE_BOTTOM - 55, false);

  Composite.add(world, walls.concat(bumpers, [drain, flipL, flipR]));

  let lives = MAX_LIVES;
  let ball = null;
  let score = 0;
  let mult = 1;
  let immuneUntil = 0;
  let gameOver = false;
  let coolL = 0, coolR = 0;

  function renderLives() {
    livesEl.innerHTML = '';
    for (var i = 0; i < MAX_LIVES; i++) {
      var d = document.createElement('i');
      if (i < lives) d.className = 'on';
      livesEl.appendChild(d);
    }
  }
  function hud() {
    scoreEl.textContent = String(score);
    multEl.textContent = '× ' + mult;
    renderLives();
  }

  function spawnBallReady() {
    if (ball) { Composite.remove(world, ball); ball = null; }
    // 珠在台顶内侧待命（静态）
    ball = Bodies.circle(CX, TABLE_TOP + RADIUS - 28, 11, {
      isStatic: true, density: 0.002, restitution: 0.35, friction: 0.03, frictionAir: 0.01,
      label: 'ball', render: { visible: false },
    });
    Composite.add(world, ball);
    btnFire.disabled = false;
  }

  function launch() {
    if (gameOver || !ball || !ball.isStatic) return;
    Body.setStatic(ball, false);
    Body.setPosition(ball, { x: CX + (Math.random() * 10 - 5), y: TABLE_TOP + RADIUS - 20 });
    Body.setVelocity(ball, { x: (Math.random() * 2 - 1), y: 2.5 });
    immuneUntil = performance.now() + 500;
    btnFire.disabled = true;
  }

  function loseLife() {
    if (performance.now() < immuneUntil || !ball) return;
    Composite.remove(world, ball);
    ball = null;
    lives -= 1;
    mult = 1;
    hud();
    if (lives <= 0) {
      gameOver = true;
      overlay.classList.add('show');
      return;
    }
    setTimeout(function () { if (!gameOver) spawnBallReady(); }, 400);
  }

  function restart() {
    overlay.classList.remove('show');
    gameOver = false;
    lives = MAX_LIVES;
    score = 0;
    mult = 1;
    hud();
    spawnBallReady();
  }

  Events.on(engine, 'collisionStart', function (ev) {
    for (var i = 0; i < ev.pairs.length; i++) {
      var a = ev.pairs[i].bodyA, b = ev.pairs[i].bodyB;
      var labels = [a.label, b.label];
      if (labels.indexOf('ball') >= 0 && labels.indexOf('drain') >= 0) loseLife();
      if (labels.indexOf('ball') >= 0 && labels.indexOf('bumper') >= 0) {
        score += 100 * mult;
        if (score > 0 && score % 800 === 0) mult = Math.min(8, mult + 1);
        hud();
      }
    }
  });

  Events.on(engine, 'beforeUpdate', function () {
    if (ball && !ball.isStatic && !gameOver) {
      var now = performance.now();
      [[flipL, 'L'], [flipR, 'R']].forEach(function (pair) {
        var f = pair[0];
        if (!f.plugin.pressed) return;
        if (pair[1] === 'L' && now < coolL) return;
        if (pair[1] === 'R' && now < coolR) return;
        if (!Query.collides(ball, [f]).length) return;
        var dir = f.plugin.isLeft ? 1 : -1;
        Body.setVelocity(ball, {
          x: ball.velocity.x * 0.15 + dir * 5.2,
          y: -16,
        });
        score += 10 * mult;
        hud();
        if (pair[1] === 'L') coolL = now + 85;
        else coolR = now + 85;
      });
    }
    [flipL, flipR].forEach(function (f) {
      var target = f.plugin.pressed ? f.plugin.up : f.plugin.rest;
      applyFlip(f, f.plugin.angle + (target - f.plugin.angle) * 0.5);
    });
    if (ball && !ball.isStatic && ball.position.y > H + 40) loseLife();
  });

  // —— 自定义绘制（玉石 / 金边 / 背景）——
  Events.on(render, 'afterRender', function () {
    var ctx = render.context;
    // 背景：优先风格参考图，铺满台区
    ctx.save();
    // 圆角裁剪胶囊
    roundCapsulePath(ctx, TABLE_LEFT, TABLE_TOP, TABLE_W, TABLE_BOTTOM - TABLE_TOP, RADIUS);
    ctx.clip();
    if (bgReady) {
      // 裁剪参考图的台面区域大致铺满
      ctx.drawImage(bg, 0, 0, bg.width, bg.height, TABLE_LEFT - 10, TABLE_TOP - 20, TABLE_W + 20, TABLE_BOTTOM - TABLE_TOP + 40);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(TABLE_LEFT, TABLE_TOP, TABLE_W, TABLE_BOTTOM - TABLE_TOP);
    } else {
      var g = ctx.createLinearGradient(0, TABLE_TOP, 0, TABLE_BOTTOM);
      g.addColorStop(0, '#c5d0c4');
      g.addColorStop(1, '#dfe5dc');
      ctx.fillStyle = g;
      ctx.fillRect(TABLE_LEFT, TABLE_TOP, TABLE_W, TABLE_BOTTOM - TABLE_TOP);
    }
    ctx.restore();

    // 金边
    ctx.save();
    ctx.strokeStyle = '#d0b15c';
    ctx.lineWidth = 3;
    roundCapsulePath(ctx, TABLE_LEFT, TABLE_TOP, TABLE_W, TABLE_BOTTOM - TABLE_TOP, RADIUS);
    ctx.stroke();
    ctx.restore();

    // bumpers
    bumpers.forEach(function (b) {
      drawJadeDisc(ctx, b.position.x, b.position.y, b.circleRadius);
    });

    // flippers
    [flipL, flipR].forEach(function (f) {
      drawJadeFlipper(ctx, f);
    });

    // ball
    if (ball) {
      drawBall(ctx, ball.position.x, ball.position.y, ball.circleRadius);
    }
  });

  function roundCapsulePath(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
    ctx.lineTo(x + rr, y + h);
    ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + rr);
    ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }

  function drawJadeDisc(ctx, x, y, r) {
    ctx.save();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    g.addColorStop(0, '#dff0e2');
    g.addColorStop(0.55, '#b7d4bc');
    g.addColorStop(1, '#8fb89a');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d0b15c';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#d0b15c';
    ctx.fill();
    ctx.restore();
  }

  function drawJadeFlipper(ctx, f) {
    ctx.save();
    ctx.translate(f.position.x, f.position.y);
    ctx.rotate(f.angle);
    var hw = FL / 2, hh = FH / 2;
    var g = ctx.createLinearGradient(-hw, 0, hw, 0);
    g.addColorStop(0, '#cfe3d2');
    g.addColorStop(1, '#9fc3a8');
    roundRect(ctx, -hw, -hh, FL, FH, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#d0b15c';
    ctx.lineWidth = 2;
    ctx.stroke();
    // pivot cap roughly at inner end
    var px = f.plugin.isLeft ? -hw * 0.75 : hw * 0.75;
    ctx.beginPath();
    ctx.arc(px, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#d0b15c';
    ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBall(ctx, x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 1, y + 2, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#e8edf2');
    g.addColorStop(1, '#9aa3ad');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

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

  // hide default matter body rendering (we draw custom)
  render.options.wireframes = false;

  Render.run(render);
  Runner.run(Runner.create(), engine);
  hud();
  spawnBallReady();
  layout();
})();
