/* 主循环：输入、进度、检查点、计时、结算 */
(function () {
  const C = window.COURSE;
  let scene, camera, renderer, world, boat;
  let state = 'loading';
  let last = 0, t0 = 0, elapsed = 0, raceTime = 0;
  let progIdx = 0, nextGate = 0, gatesPassed = 0, collisions = 0;
  let splits = [], splitIdx = 0, topSpeed = 0;
  let finishAt = 0, lastS = 0, wrongTimer = 0;
  let raceToken = 0;
  let best = 0;
  try { best = parseFloat(localStorage.getItem('westlake_best_v1') || '0') || 0; } catch (e) { best = 0; }

  const keys = {};
  const input = { throttle: 0, steer: 0, boost: false };
  const touch = { steer: 0, throttle: false, boost: false };

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------------- 几何判定 ---------------- */
  function inRing(x, z, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
  }
  function segD(x, z, a, b) {
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const wx = x - a[0], wz = z - a[1];
    const L = vx * vx + vz * vz;
    let t = L ? (wx * vx + wz * vz) / L : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t));
  }
  function navigable(x, z) {
    if (!inRing(x, z, C.water)) return false;
    for (const r of C.islands) if (inRing(x, z, r)) return false;
    for (const isl of C.extraIslands) if (Math.hypot(x - isl.p[0], z - isl.p[1]) < isl.r + 2) return false;
    for (const b of C.bridges) if (Math.hypot(x - b.x, z - b.z) < b.r) return true;
    for (const nm in C.causeways) {
      const half = (nm === '杨公堤' ? 11 : 9.5) + 2.4;
      for (const line of C.causeways[nm]) {
        for (let i = 1; i < line.length; i++) if (segD(x, z, line[i - 1], line[i]) < half) return false;
      }
    }
    return true;
  }

  /* ---------------- 检查点模型 ---------------- */
  const gateMeshes = [];
  function buildGates() {
    const buoyMatRed = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    const buoyMatWhite = new THREE.MeshLambertMaterial({ color: 0xf2ede2 });
    const cyl = new THREE.CylinderGeometry(0.75, 0.9, 2.0, 10);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x7fd6c0, transparent: true, opacity: 0.10, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    C.gates.forEach((g, i) => {
      const grp = new THREE.Group();
      const dirx = Math.cos(g.a), dirz = Math.sin(g.a);
      const nx = -dirz, nz = dirx;
      for (const side of [-1, 1]) {
        const bx = g.x + nx * 24 * side, bz = g.z + nz * 24 * side;
        const b1 = new THREE.Mesh(cyl, buoyMatRed); b1.position.set(bx, 1.0, bz); grp.add(b1);
        const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.42, 10), buoyMatWhite);
        b2.position.set(bx, 1.85, bz); grp.add(b2);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), buoyMatRed);
        flag.position.set(bx, 2.5, bz); flag.rotation.y = -g.a; grp.add(flag);
      }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.1, 26, 6, 1, true), beamMat.clone());
      beam.position.set(g.x, 11, g.z); grp.add(beam);
      grp.userData.beam = beam;
      scene.add(grp);
      gateMeshes.push(grp);
    });
    // 起点浮标
    const startGrp = new THREE.Group();
    const fx = Math.cos(C.heading), fz = Math.sin(C.heading);
    for (const side of [-1, 1]) {
      const bx = C.start.x - fz * 26 * side, bz = C.start.z + fx * 26 * side;
      const b = new THREE.Mesh(cyl, buoyMatRed); b.position.set(bx, 1.0, bz); startGrp.add(b);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.42, 10), buoyMatWhite);
      b2.position.set(bx, 1.85, bz); startGrp.add(b2);
    }
    scene.add(startGrp);
  }

  /* ---------------- 初始化 ---------------- */
  async function boot() {
    const canvas = $('scene');
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 760;
    window.__LOW = isMobile;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
    renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    window.__scene = scene;
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.4, 9000);

    HUD.showLoading(true);
    HUD.loading('正在读取湖岸线…', 4);

    world = await World.build(scene, renderer, C, (msg, pct) => HUD.loading(msg, pct));
    HUD.loading('正在安放亭台楼阁…', 88);
    await new Promise(r => setTimeout(r, 30));
    Landmarks.build(scene, C);

    HUD.loading('正在推船下水…', 95);
    await new Promise(r => setTimeout(r, 30));
    boat = Boat.create(scene);
    boat.reset(C.start.x, C.start.z, C.heading);
    buildGates();

    window.__camera = camera;
    HUD.init(C);
    HUD.showHUD(false);
    const sk = document.getElementById('st-km'); if (sk) sk.textContent = (C.total / 1000).toFixed(2);
    HUD.setMute(true);
    AudioFX.setMuted(true);

    HUD.loading('准备就绪', 100);
    await new Promise(r => setTimeout(r, 260));
    HUD.showLoading(false);
    state = 'menu';
    camera.position.set(C.start.x, 3.2, C.start.z);
    camera.lookAt(C.start.x + Math.cos(C.heading) * 100, 3.0, C.start.z + Math.sin(C.heading) * 100);

    bindUI();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---------------- UI ---------------- */
  function bindUI() {
    HUD.onStart(() => {
      AudioFX.init(); AudioFX.resume(); AudioFX.setMuted(false);
      HUD.setMute(false);
      startRace();
    });
    HUD.onAgain(() => { startRace(); });
    HUD.onBack(() => {
      state = 'menu';
      HUD.showResult(null);
      HUD.showStart(true);
      HUD.showHUD(false);
      boat.reset(C.start.x, C.start.z, C.heading);
      HUD.hideLabels();
      progIdx = 0; nextGate = 0;
    });
    HUD.onMute(() => {
      const m = !AudioFX.muted;
      AudioFX.setMuted(m); HUD.setMute(m);
    });

    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyR' && (state === 'race' || state === 'done')) startRace();
      if (e.code === 'KeyM') { const m = !AudioFX.muted; AudioFX.setMuted(m); HUD.setMute(m); }
      if (e.code === 'Enter' && state === 'menu') { AudioFX.init(); AudioFX.resume(); startRace(); }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    const rb = document.getElementById('rotbtn');
    if (rb) rb.addEventListener('click', () => document.body.classList.add('rot-ok'));
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    // 触屏
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
    const stick = $('stick'), knob = stick.querySelector('.knob');
    let stickId = null;
    const setKnob = (dx, dy) => {
      const r = 42;
      const l = Math.min(r, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      knob.style.transform = 'translate(' + Math.cos(a) * l + 'px,' + Math.sin(a) * l + 'px)';
      touch.steer = clamp(dx / 40, -1, 1);
    };
    stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); setKnob(e.offsetX - 58, e.offsetY - 58); });
    stick.addEventListener('pointermove', e => { if (stickId === e.pointerId) setKnob(e.offsetX - 58, e.offsetY - 58); });
    const endStick = e => { if (stickId === e.pointerId) { stickId = null; touch.steer = 0; knob.style.transform = 'translate(0,0)'; } };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    const bindPedal = (el, on, off) => {
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); on(); });
      el.addEventListener('pointerup', e => { el.classList.remove('on'); off(); });
      el.addEventListener('pointercancel', e => { el.classList.remove('on'); off(); });
      el.addEventListener('pointerleave', e => { el.classList.remove('on'); off(); });
    };
    bindPedal($('pthrottle'), () => touch.throttle = true, () => touch.throttle = false);
    bindPedal($('pboost'), () => touch.boost = true, () => touch.boost = false);
  }

  /* ---------------- 比赛流程 ---------------- */
  function startRace() {
    HUD.showStart(false);
    HUD.showResult(null);
    HUD.showHUD(true);
    HUD.setWrong(false);
    boat.reset(C.start.x, C.start.z, C.heading);
    progIdx = 0; nextGate = 0; gatesPassed = 0; collisions = 0;
    splits = []; splitIdx = 0; topSpeed = 0; elapsed = 0; raceTime = 0;
    lastS = 0; wrongTimer = 0; finishAt = 0;
    HUD.setTime(0);
    HUD.setProgress(0, 0, C.total, C.sectors[0].name);
    HUD.setGate(0, C.gates.length);
    gateMeshes.forEach((g, i) => g.userData.beam.material.opacity = i === 0 ? 0.07 : 0.02);

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
        HUD.countdown('GO');
        AudioFX.start();
        state = 'race';
        t0 = performance.now();
      }
    };
    setTimeout(tick, 1000);
  }

  function finish() {
    state = 'done';
    HUD.hideLabels();
    finishAt = performance.now();
    const time = raceTime;
    AudioFX.finish();
    let newBest = false;
    if (!best || time < best) {
      best = time; newBest = true;
      try { localStorage.setItem('westlake_best_v1', String(time)); } catch (e) { }
    }
    const rank = time < 165 ? 'S' : time < 185 ? 'A' : time < 210 ? 'B' : 'C';
    if (splits.length < C.sectors.length) splits.push({ name: C.sectors[C.sectors.length - 1].name, time });
    HUD.showResult({
      time, rank, newBest,
      splits,
      top: Math.round(topSpeed * 3.6),
      gates: gatesPassed,
      collisions
    });
  }

  /* ---------------- 进度 ---------------- */
  function progress(s) {
    // 在当前索引附近找最近的中心线点
    let best = progIdx, bd = Infinity;
    const from = Math.max(0, progIdx - 40), to = Math.min(C.center.length, progIdx + 130);
    for (let i = from; i < to; i++) {
      const d = Math.hypot(boat.state.x - C.center[i][0], boat.state.z - C.center[i][1]);
      if (d < bd) { bd = d; best = i; }
    }
    // 终点：回到起点且已接近一圈
    const dStart = Math.hypot(boat.state.x - C.start.x, boat.state.z - C.start.z);
    const nearEnd = best > C.center.length - 140;
    if (nearEnd && dStart < 95 && C.cum[best] > C.total * 0.92) return { s: C.total, lateral: bd, done: true, idx: best };
    if (best > progIdx) progIdx = best;
    return { s: C.cum[progIdx], lateral: bd, done: false, idx: progIdx };
  }

  /* ---------------- 主循环 ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;

    if (state === 'menu') {
      const t = now * 0.00012;
      const hx = C.start.x + Math.cos(C.heading) * 0.6, hz = C.start.z + Math.sin(C.heading) * 0.6;
      camera.position.set(hx, 2.3 + Math.sin(now * 0.0006) * 0.10, hz);
      camera.fov = 68; camera.updateProjectionMatrix();
      const look = C.heading + Math.sin(t * 6) * 0.10;
      camera.lookAt(hx + Math.cos(look) * 120, 2.4, hz + Math.sin(look) * 120);
      boat.group.position.set(C.start.x, 0, C.start.z);
      boat.group.rotation.set(0, -C.heading, 0);
    }

    if (state === 'count') {
      boat.update(dt, { throttle: 0, steer: 0, boost: false }, navigable);
      boat.applyCamera(camera);
    }

    if (state === 'race') {
      const kThrottle = (keys['KeyW'] || keys['ArrowUp'] || touch.throttle) ? 1 : 0;
      const kBrake = (keys['KeyS'] || keys['ArrowDown']) ? 1 : 0;
      const kSteer = (keys['KeyA'] || keys['ArrowLeft'] ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
        input.throttle = kThrottle - kBrake * 0.45;
        input.steer = clamp(kSteer + touch.steer, -1, 1);
        input.boost = !!(keys['ShiftLeft'] || keys['ShiftRight'] || touch.boost);
      const before = boat.state.collisions;
      boat.update(dt, input, navigable);
      if (boat.state.collisions > before) { HUD.flash(); AudioFX.crash(); }
      boat.applyCamera(camera);

      // 下一个浮标的光柱按距离淡入淡出
      if (nextGate < gateMeshes.length) {
        const dgate = Math.hypot(boat.state.x - C.gates[nextGate].x, boat.state.z - C.gates[nextGate].z);
        gateMeshes[nextGate].userData.beam.material.opacity = 0.16 * Math.max(0.12, Math.min(1, dgate / 260));
      }

      const p = progress(0);
      const ratio = clamp(p.s / C.total, 0, 1);
      if (p.done) { raceTime = (now - t0) / 1000; finish(); }

      // 计时与 HUD
      if (state === 'race') {
        raceTime = (now - t0) / 1000;
        elapsed = raceTime;
        HUD.setTime(raceTime);
        HUD.setSpeed(boat.state.speed * 3.6, boat.state.boost);
        HUD.setProgress(ratio, p.s / 1000, C.total, C.sectors[Math.min(C.sectors.length - 1, splitIdx)].name);
        if (boat.state.speed > topSpeed) topSpeed = boat.state.speed;
        AudioFX.setSpeed(boat.state.speed * 3.6, boat.state.boosting);

        // 分段
        const bound = C.total * C.sectors[splitIdx].upto;
        if (p.s >= bound - 6 && splitIdx < C.sectors.length - 1) {
          splits.push({ name: C.sectors[splitIdx].name, time: raceTime });
          splitIdx++;
        }

        // 检查点
        if (nextGate < C.gates.length) {
          const g = C.gates[nextGate];
          const d = Math.hypot(boat.state.x - g.x, boat.state.z - g.z);
          if (d < 62 && p.s > g.s - 40) {
            gatesPassed++;
            boat.state.boost = Math.min(1, boat.state.boost + 0.17);
            AudioFX.gate();
            gateMeshes[nextGate].userData.beam.material.opacity = 0.04;
            nextGate++;
            if (nextGate < C.gates.length) gateMeshes[nextGate].userData.beam.material.opacity = 0.09;
            HUD.setGate(gatesPassed, C.gates.length);
          } else if (p.s > g.s + 90) {
            nextGate++;
            if (nextGate < C.gates.length) gateMeshes[nextGate].userData.beam.material.opacity = 0.24;
            HUD.setGate(gatesPassed, C.gates.length);
          }
        }

        // 逆行提示
        const tx = Math.cos(C.heading), tz = Math.sin(C.heading);
        if (p.s < lastS - 18) wrongTimer += dt; else wrongTimer = Math.max(0, wrongTimer - dt * 2);
        lastS = p.s;
        HUD.setWrong(wrongTimer > 0.7);
      }
      collisions = boat.state.collisions;
    }

    if (state === 'done') {
      boat.update(dt, { throttle: 0, steer: input.steer * 0.4, boost: false }, navigable);
      boat.applyCamera(camera);
      HUD.setSpeed(boat.state.speed * 3.6, boat.state.boost);
    }

    world.update(dt, camera);
    if (state === 'race' || state === 'count') HUD.updateLabels(camera, dt);
    HUD.drawMinimap({ x: boat.state.x, z: boat.state.z, heading: boat.state.heading }, C.gates[Math.min(nextGate, C.gates.length - 1)]);

    renderer.render(scene, camera);
  }

  // 调试用：瞬移到赛道某处（不影响正常游玩）
  window.__teleport = function (s) {
    let i = 0; while (i < C.cum.length - 1 && C.cum[i] < s) i++;
    const j = Math.min(C.center.length - 1, i + 10);
    boat.state.x = C.center[i][0]; boat.state.z = C.center[i][1];
    boat.state.heading = Math.atan2(C.center[j][1] - C.center[i][1], C.center[j][0] - C.center[i][0]);
    boat.state.speed = 40; boat.state.boost = 1; boat.state.wakeHist.length = 0;
    progIdx = i; lastS = C.cum[i];
    nextGate = 0; while (nextGate < C.gates.length && C.gates[nextGate].s < C.cum[i] - 30) nextGate++;
    boat.group.position.set(boat.state.x, 0, boat.state.z);
    boat.group.rotation.set(0, -boat.state.heading, 0);
  };

  window.addEventListener('resize', () => {
    if (!renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 防止触屏滚动与双击缩放
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.target.closest('#stick') || e.target.closest('.pedal')) e.preventDefault(); }, { passive: false });

  boot();
})();
