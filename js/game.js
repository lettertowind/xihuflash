/* 主控：输入、自由探索、探访判定、计时结算（Windows 启动修复版） */
(function () {
  const C = window.COURSE;
  let scene, camera, renderer, world, boat;
  let state = 'loading';
  let last = 0, t0 = 0, raceTime = 0;
  let topSpeed = 0, visitedCount = 0, armed = false;
  let raceToken = 0;
  let tier = null, frameMs = 16, emaMs = 16, lookT = 0, snapBack = false;
  let bestVisited = 0;
  try { bestVisited = parseInt(localStorage.getItem('westlake_visited_v2') || '0', 10) || 0; } catch (e) { bestVisited = 0; }

  const keys = {};
  const input = { throttle: 0, steer: 0, cruiseFast: false };
  const touch = { steer: 0, throttle: false };

  /* ---------------- 三档速度：Shift 循环 1→2→3 ---------------- */
  let routeIdx = 0;

  /* 环线上离船最近的节点（先在上一帧位置附近开窗搜，离得太远再全量搜） */
  function nearestRouteIdx(x, z, hint) {
    const n = C.center.length;
    let best = ((hint | 0) % n + n) % n, bd = Infinity;
    for (let k = -90; k <= 90; k++) {
      const i = ((best + k) % n + n) % n;
      const dx = C.center[i][0] - x, dz = C.center[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    if (bd > 300 * 300) {
      for (let i = 0; i < n; i += 2) {
        const dx = C.center[i][0] - x, dz = C.center[i][1] - z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  /* 自动巡航：纯追踪（pure pursuit）——朝环线前方 look 米处的点打舵 */
  function autopilotSteer() {
    const b = boat.state, n = C.center.length, G = CFG.gears;
    routeIdx = nearestRouteIdx(b.x, b.z, routeIdx);
    const sp = Math.abs(b.speed);
    const look = clamp(sp * G.lookAhead, G.lookMin, G.lookMax);
    let j = routeIdx, acc = 0, guard = 0;
    while (acc < look && guard++ < 240) {
      const k = (j + 1) % n;
      acc += Math.hypot(C.center[k][0] - C.center[j][0], C.center[k][1] - C.center[j][1]);
      j = k;
    }
    const want = Math.atan2(C.center[j][1] - b.z, C.center[j][0] - b.x);
    let err = want - b.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    return { steer: clamp(err * G.cruiseTurn, -1, 1), err: Math.abs(err) };
  }

  function cycleGear(dir) {
    if (!boat) return;
    const g = boat.cycleGear(dir || 1);
    HUD.setGear(g);
    HUD.toast(Boat.gearName(g), g === 3 ? '自动沿湖航行 · 按 W 提速，再按 Shift 换档'
      : (g === 2 ? '全速快船 · 速度与船头分水拉满' : '慢速摇橹 · 更接近真实乌篷船'));
    if (g === 3) routeIdx = nearestRouteIdx(boat.state.x, boat.state.z, routeIdx);
    try {
      // 切到二档（快速档）时整段播放"加速"录音，与事故惊呼同一条语音总线、同一响度基准
      if (g === 2) { AudioFX.accel(); AudioFX.whoosh(); }
      AudioFX.blip(g === 3 ? 604 : (g === 2 ? 784 : 880), 0.2, 0.10);
    } catch (e) { }
  }

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------------- 渲染器三级回退 ---------------- */
  function makeRenderer(canvas) {
    const opts = [
      { antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: true },
      { antialias: false, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: true },
      { antialias: false, alpha: false, preserveDrawingBuffer: true }
    ];
    let lastErr = null;
    for (const o of opts) {
      try { return new THREE.WebGLRenderer(Object.assign({ canvas }, o)); }
      catch (e) { lastErr = e; }
    }
    throw (lastErr || new Error('WebGL 不可用'));
  }

  function fatal(msg) {
    const f = $('fatal');
    if (!f) { alert(msg); return; }
    $('fatalMsg').textContent = msg;
    f.style.display = 'flex';
    HUD.showLoading(false);
  }

  /* ---------------- 应用画质档位 ---------------- */
  function applyTier(t) {
    if (!renderer) return;
    try {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.dpr));
      Weather.setRainCount(t.rain);
      Water.setReflect(!!t.reflect);
    } catch (e) { }
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    const canvas = $('scene');
    HUD.showLoading(true);
    HUD.loading('正在点亮画布…', 2);

    try {
      renderer = makeRenderer(canvas);
    } catch (e) {
      fatal('无法创建 WebGL 上下文：' + e.message + '（请检查显卡驱动或改用 Chrome/Edge）');
      return;
    }
    renderer.setSize(Math.max(2, window.innerWidth), Math.max(2, window.innerHeight));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = CFG.render.exposure;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = false;

    // 画布尺寸兜底：boot 时窗口可能尚未布局（尺寸 0），用 ResizeObserver 跟随
    const ro = new ResizeObserver(entries => {
      for (const en of entries) {
        const w = Math.max(2, Math.round(en.contentRect.width));
        const h = Math.max(2, Math.round(en.contentRect.height));
        if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) {
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      }
    });
    ro.observe(canvas);

    const tierIdx = Quality.detect(renderer);
    tier = CFG.quality.tiers[tierIdx];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.dpr) || 1);
    Quality.apply(tier);

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      fatal('显卡上下文丢失，页面即将刷新…');
      setTimeout(() => location.reload(), 1600);
    }, false);

    scene = new THREE.Scene();
    window.__scene = scene;
    window.__renderer = renderer;
    camera = new THREE.PerspectiveCamera(CFG.render.fovBase, window.innerWidth / window.innerHeight, CFG.render.near, CFG.render.far);
    window.__camera = camera;

    // 绑定 UI 必须在耗时构建之前（Windows 修复：点按钮无反应的根因）
    bindUI();

    // 加载看门狗
    const wd = setTimeout(() => {
      if (state === 'loading') fatal('加载超时：世界构建未完成。可尝试加参数 ?safe=1 以低配模式启动。');
    }, 45000);

    try {
      world = await World.build(scene, renderer, C, (msg, pct) => { HUD.loading(msg, pct); window.__prog = { msg, pct, at: performance.now() }; }, { tier });
    } catch (e) {
      clearTimeout(wd);
      fatal('世界构建失败：' + (e && e.message ? e.message : e));
      if (window.__log) window.__log('world build: ' + (e && e.stack || e));
      return;
    }

    HUD.loading('正在推船下水…', 96);
    await new Promise(r => setTimeout(r, 30));
    try {
      boat = Boat.create(scene, tier);
      boat.reset(C.start.x, C.start.z, C.heading);
      boat.setView('third');            // 菜单为第三人称环绕（可看到玩家自身建模）
    } catch (e) {
      clearTimeout(wd);
      fatal('船只初始化失败：' + (e && e.message ? e.message : e));
      return;
    }

    HUD.init(C, Landmarks.list);
    HUD.showHUD(false);
    HUD.setMute(true);
    HUD.setGear(1);
    try { AudioFX.setMuted(true); } catch (e) { }
    const stv = $('st-visit'); if (stv) stv.textContent = Landmarks.list.length;
    const stk = $('st-km'); if (stk) stk.textContent = (C.total / 1000).toFixed(1);
    const sbv = $('st-best'); if (sbv) sbv.textContent = bestVisited || '—';

    clearTimeout(wd);
    HUD.loading('准备就绪', 100);
    await new Promise(r => setTimeout(r, 240));
    HUD.showLoading(false);
    state = 'menu';
    last = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---------------- UI 绑定 ---------------- */
  function bindUI() {
    HUD.onStart(() => { startRun(); });
    HUD.onAgain(() => { startRun(); });
    HUD.onBack(() => {
      state = 'menu';
      HUD.showResult(null);
      HUD.showStart(true);
      HUD.showHUD(false);
      HUD.hideLabels();
      boat.reset(C.start.x, C.start.z, C.heading);
      boat.setView('third');
    });
    HUD.onMute(() => {
      try {
        AudioFX.init(); AudioFX.resume();
        const m = !AudioFX.muted;
        AudioFX.setMuted(m); HUD.setMute(m);
      } catch (e) { }
    });

    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyR' && (state === 'cruise' || state === 'done')) startRun();
      if (e.code === 'KeyF' && state === 'cruise') finish(true);
      if (e.code === 'KeyM') {
        try {
          AudioFX.init(); AudioFX.resume();
          const m = !AudioFX.muted;
          AudioFX.setMuted(m); HUD.setMute(m);
        } catch (err) { }
      }
      if (e.code === 'Enter' && state === 'menu') startRun();
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat &&
          (state === 'cruise' || state === 'count')) {
        e.preventDefault();
        cycleGear(1);
      }
      if (e.code === 'KeyV' && (state === 'cruise' || state === 'count' || state === 'done')) {
        const v = boat.toggleView();
        HUD.toast(v === 'third' ? '第三人称' : '第一人称', v === 'third' ? '可看清自己的船家装扮 · 再按 V 切回' : '坐回船头 · 摇橹前行');
      }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    const rb = $('rotbtn');
    if (rb) rb.addEventListener('click', () => document.body.classList.add('rot-ok'));

    /* 视角：桌面鼠标移动即环视（无需按键）；触屏单指拖动转视角 */
    const cvs = $('scene');
    let lastPX = 0, lastPY = 0, touchViewId = null, tX = 0, tY = 0;
    if (cvs) {
      cvs.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') {
          if (touchViewId === null) { touchViewId = e.pointerId; tX = e.clientX; tY = e.clientY; }
        } else if (e.button === 0) { snapBack = true; }        // 桌面：左键点击立即回正
      });
    }
    window.addEventListener('pointermove', e => {
      if (!boat) return;
      if (e.pointerType === 'touch') {
        // 手机：向左滑动屏幕，视角向左转（与桌面鼠标同向）
        if (touchViewId === e.pointerId) {
          snapBack = false;
          boat.state.lookYaw = UTIL.clamp(boat.state.lookYaw + (e.clientX - tX) * 0.0052, -2.6, 2.6);
          boat.state.lookPitch = UTIL.clamp(boat.state.lookPitch + (e.clientY - tY) * 0.0036, -0.62, 0.62);
          tX = e.clientX; tY = e.clientY;
          lookT = performance.now();
        }
        return;
      }
      // 桌面：鼠标移动即转视角
      const dx = e.movementX !== undefined ? e.movementX : (lastPX ? e.clientX - lastPX : 0);
      const dy = e.movementY !== undefined ? e.movementY : (lastPY ? e.clientY - lastPY : 0);
      if (dx || dy) snapBack = false;
      boat.state.lookYaw = UTIL.clamp(boat.state.lookYaw + dx * 0.0026, -2.6, 2.6);
      boat.state.lookPitch = UTIL.clamp(boat.state.lookPitch - dy * 0.0022, -0.62, 0.62);
      lastPX = e.clientX; lastPY = e.clientY;
      lookT = performance.now();
    });
    window.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch' && touchViewId === e.pointerId) {
        touchViewId = null;
        snapBack = true;                                       // 手机：手指离开屏幕立即回正
      }
    });
    window.addEventListener('contextmenu', e => e.preventDefault());

    // 触屏
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
    const stick = $('stick');
    if (stick) {
      const knob = stick.querySelector('.knob');
      let stickId = null;
      const setKnob = (dx, dy) => {
        const r = 52;
        const l = Math.min(r, Math.hypot(dx, dy));
        const a = Math.atan2(dy, dx);
        if (knob) knob.style.transform = 'translate(' + Math.cos(a) * l + 'px,' + Math.sin(a) * l + 'px)';
        touch.steer = clamp(dx / 44, -1, 1);
      };
      const stickCenter = e => {
        const rc = stick.getBoundingClientRect();
        return [e.clientX - rc.left - rc.width / 2, e.clientY - rc.top - rc.height / 2];
      };
      stick.addEventListener('pointerdown', e => { stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch (err) { } const c = stickCenter(e); setKnob(c[0], c[1]); });
      stick.addEventListener('pointermove', e => { if (stickId === e.pointerId) { const c = stickCenter(e); setKnob(c[0], c[1]); } });
      const endStick = e => { if (stickId === e.pointerId) { stickId = null; touch.steer = 0; if (knob) knob.style.transform = 'translate(0,0)'; } };
      stick.addEventListener('pointerup', endStick);
      stick.addEventListener('pointercancel', endStick);
    }
    const bindPedal = (el, on, off) => {
      if (!el) return;
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); on(); });
      el.addEventListener('pointerup', e => { el.classList.remove('on'); off(); });
      el.addEventListener('pointercancel', e => { el.classList.remove('on'); off(); });
      el.addEventListener('pointerleave', e => { el.classList.remove('on'); off(); });
    };
    bindPedal($('pthrottle'), () => touch.throttle = true, () => touch.throttle = false);
    const gb = $('pgear');
    if (gb) {
      gb.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (state === 'cruise' || state === 'count') cycleGear(1);
      });
    }
  }

  /* ---------------- 开始 ---------------- */
  function startRun() {
    try { AudioFX.init(); AudioFX.resume(); AudioFX.setMuted(false); HUD.setMute(false); } catch (e) { }
    HUD.showStart(false);
    HUD.showResult(null);
    HUD.showHUD(true);
    boat.reset(C.start.x, C.start.z, C.heading);
    boat.setView('first');            // 进入游戏回到第一人称
    visitedCount = 0; topSpeed = 0; raceTime = 0; armed = false;
    Landmarks.list.forEach(l => { l.visited = false; });
    HUD.refreshMap();
    HUD.setTime(0);
    HUD.setVisit(0, Landmarks.list.length);
    HUD.setGear(1);                 // 每局默认一档（慢档）
    HUD.setSpeed(0, 0, 1);

    state = 'count';
    const myToken = ++raceToken;
    let n = 3;
    HUD.countdown('3');
    AudioFX.blip(660, 0.2, 0.1);
    const tick = () => {
      if (myToken !== raceToken) return;
      n--;
      if (n > 0) {
        HUD.countdown(String(n));
        AudioFX.blip(660, 0.2, 0.1);
        setTimeout(tick, 1000);
      } else {
        if (myToken !== raceToken) return;
        HUD.countdown('启 航');
        AudioFX.start();
        state = 'cruise';
        t0 = performance.now();
        HUD.toast('自由探索', '环湖探访十七景 · 回到起点码头自动结算（F 提前结束）');
      }
    };
    setTimeout(tick, 1000);
  }

  /* ---------------- 结算 ---------------- */
  function finish(manual) {
    if (state !== 'cruise') return;
    state = 'done';
    HUD.hideLabels();
    AudioFX.finish();
    if (manual) HUD.toast('行程结束', '本段探索已结算');
    const visited = Landmarks.list.filter(l => l.visited).length;
    let newBest = false;
    if (visited > bestVisited) {
      bestVisited = visited; newBest = true;
      try { localStorage.setItem('westlake_visited_v2', String(visited)); } catch (e) { }
    }
    HUD.showResult({
      time: raceTime,
      visited, total: Landmarks.list.length,
      distance: boat.state.distance,
      top: topSpeed,
      collisions: boat.state.collisions,
      newBest
    });
  }

  /* ---------------- 主循环 ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const fStart = performance.now();

    if (state === 'menu') {
      const t = now * 0.0001;
      const bx = C.start.x, bz = C.start.z;
      const r = 17.5;
      camera.position.set(bx + Math.cos(t) * r, 4.6 + Math.sin(now * 0.0005) * 0.5, bz + Math.sin(t) * r);
      camera.fov = 50; camera.updateProjectionMatrix();
      camera.lookAt(bx, 0.9, bz);
      boat.group.position.set(bx, Math.sin(now * 0.0012) * 0.04, bz);
      boat.group.rotation.set(0, -C.heading + Math.sin(t * 0.7) * 0.05, 0);
    }

    // 环视视角（count/cruise/done 通用）
    if (boat && state !== 'menu' && state !== 'loading') {
      const kQ = keys['KeyQ'], kE = keys['KeyE'];
      if (kQ || kE) {
        boat.state.lookYaw = UTIL.clamp(boat.state.lookYaw + (kE ? 1 : -1) * dt * 1.5, -2.6, 2.6);
        lookT = performance.now();
      } else if (snapBack || performance.now() - lookT > 2600) {
        const k = Math.exp(-dt * (snapBack ? 5.5 : 1.7));
        boat.state.lookYaw *= k;
        boat.state.lookPitch *= k;
        if (Math.abs(boat.state.lookYaw) < 0.001 && Math.abs(boat.state.lookPitch) < 0.001) {
          boat.state.lookYaw = 0;
          boat.state.lookPitch = 0;
          snapBack = false;
        }
      }
    }

    if (state === 'count') {
      boat.update(dt, { throttle: 0, steer: 0, cruiseFast: false }, Terrain.navigable);
      boat.applyCamera(camera, dt);
    }

    if (state === 'cruise') {
      const gear = boat.state.gear;
      const wThr = !!(keys['KeyW'] || keys['ArrowUp'] || touch.throttle);
      if (gear === 3) {
        /* 三档：自动沿环线航行，不按 W 走慢档速度，按住 W 走快档速度 */
        const ap = autopilotSteer();
        input.steer = ap.steer;
        input.throttle = ap.err > 0.85 ? 0.55 : 1;      // 大角度修正时收一点油
        input.cruiseFast = wThr;
      } else {
        const kBrake = (keys['KeyS'] || keys['ArrowDown']) ? 1 : 0;
        const kSteer = (keys['KeyA'] || keys['ArrowLeft'] ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
        input.throttle = (wThr ? 1 : 0) - kBrake * 0.5;
        input.steer = clamp(kSteer + touch.steer, -1, 1);
        input.cruiseFast = false;
      }
      const before = boat.state.collisions;
      boat.update(dt, input, Terrain.navigable);
      if (boat.state.collisions > before) { HUD.flash(); }   // 音效由 Boat.impact 统一触发
      boat.applyCamera(camera, dt);

      raceTime = (now - t0) / 1000;
      if (boat.state.speed > topSpeed) topSpeed = boat.state.speed;
      AudioFX.setSpeed(Math.abs(boat.state.speed) * 3.6, boat.state.fovK);

      // 交通船 + 碰撞
      const impact = Traffic.update(dt, boat.state, world.obstacles);
      if (impact > 0) { HUD.flash(); }

      // 探访景点
      const b = boat.state;
      for (const lm of Landmarks.list) {
        if (lm.visited) continue;
        const d = Math.hypot(b.x - lm.x, b.z - lm.z);
        if (d < (lm.visitR || 260)) {
          lm.visited = true;
          visitedCount++;
          HUD.toast('抵达 · ' + lm.name, lm.sub || '');
          AudioFX.visit();
          HUD.refreshMap();
        }
      }
      HUD.setVisit(visitedCount, Landmarks.list.length);

      // 自动结算：离开起点后，绕行足够远再回码头
      const dStart = Math.hypot(b.x - C.start.x, b.z - C.start.z);
      if (!armed && dStart > CFG.explore.leftStart) armed = true;
      if (world.dock) {
        const dDock = Math.hypot(b.x - world.dock.x, b.z - world.dock.z);
        if (armed && raceTime > CFG.explore.minTime && b.distance > CFG.explore.minDistance && dDock < CFG.explore.dockRadius) {
          HUD.toast('回到码头', '行程结算中…');
          finish(false);
        }
      }

      HUD.setTime(raceTime);
      HUD.setSpeed(Math.abs(b.speed) * 3.6, b.fovK, b.gear);
      HUD.setGear(b.gear);
      HUD.setCompass(b.heading);
    }

    if (state === 'done') {
      boat.update(dt, { throttle: 0, steer: 0, cruiseFast: false }, Terrain.navigable);
      boat.applyCamera(camera, dt);
      HUD.setSpeed(Math.abs(boat.state.speed) * 3.6, boat.state.fovK, boat.state.gear);
    }

    // 水面倒影与天气
    const boats = [{ x: boat.state.x, z: boat.state.z, heading: boat.state.heading, w: 1.0 }].concat(Traffic.list());
    Water.setBoats(boats);
    world.update(dt, camera, boats, boat.state);
    Landmarks.update(dt);

    if (state === 'cruise' || state === 'count') {
      HUD.updateLabels(camera, dt);
      HUD.updateToast(dt);
    }
    if (boat) HUD.drawMinimap({ x: boat.state.x, z: boat.state.z, heading: boat.state.heading }, [], world.dock,
      { gear: boat.state.gear, t: now / 1000 });

    if (camLock) {                       // 固定机位覆盖（调试）
      camera.fov = camLock.fov; camera.updateProjectionMatrix();
      camera.position.set(camLock.p[0], camLock.p[1], camLock.p[2]);
      camera.lookAt(camLock.t[0], camLock.t[1], camLock.t[2]);
    }

    renderer.render(scene, camera);

    // 动态降档
    const fms = performance.now() - fStart;
    frameMs = fms;
    emaMs = emaMs * 0.95 + fms * 0.05;
    if (state === 'cruise') {
      if (Quality.sample(frameMs)) applyTier(Quality.cfg());
    }
  }

  /* ---------------- 调试 ---------------- */
  let camLock = null;              // 固定机位（验收截图用）
  window.__cam = function (px, py, pz, tx, ty, tz, fov) {
    camLock = { p: [px, py, pz], t: [tx, ty, tz], fov: fov || 60 };
  };
  window.__camOff = function () { camLock = null; };
  window.__teleport = function (s) {
    let i = 0; while (i < C.cum.length - 1 && C.cum[i] < s) i++;
    const j = Math.min(C.center.length - 1, i + 10);
    boat.state.x = C.center[i][0]; boat.state.z = C.center[i][1];
    boat.state.heading = Math.atan2(C.center[j][1] - C.center[i][1], C.center[j][0] - C.center[i][0]);
    boat.state.speed = 30;
    boat.state.wakeHist.length = 0;
    boat.group.position.set(boat.state.x, 0, boat.state.z);
    boat.group.rotation.set(0, -boat.state.heading, 0);
  };
  window.__tp = function (x, z, h) {
    boat.state.x = x; boat.state.z = z;
    if (h !== undefined) boat.state.heading = h;
    boat.state.speed = 0; boat.state.wakeHist.length = 0;
    boat.group.position.set(x, 0, z);
    boat.group.rotation.set(0, -boat.state.heading, 0);
  };
  window.__state = () => ({ state, time: raceTime, boat: boat && boat.state, visited: visitedCount, tier: tier && tier.name });
  window.__course = C;

  window.addEventListener('resize', () => {
    if (!renderer) return;
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.target.closest && (e.target.closest('#stick') || e.target.closest('.pedal'))) e.preventDefault(); }, { passive: false });

  // 启动（boot 内部已有完整 try/catch 与 fatal 面板）
  boot();
})();
