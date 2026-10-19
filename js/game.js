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
  const input = { throttle: 0, steer: 0, cruiseFast: false, cruiseCap: null };
  /* 触屏输入：
       steer   —— 摇杆水平分量（转向）
       throttle—— 摇杆总幅度（0=只转向，>0=前进）
       forward —— 摇杆纵向"前推"分量（0..1），三档巡航时单独用它提速 */
  const touch = { steer: 0, throttle: 0, forward: 0 };
  const isTouchUI = () => document.body.classList.contains('touch');

  /* 三档巡航的"顶住"自愈计时：船贴住桥台/岸边时速度会被反复清零，
     靠倒车脱困，避免自动驾驶在同一个地方永远顶着 */
  let stuckT = 0, unstickT = 0;

  /* ---------------- 三档速度：Shift 循环 1→2→3 ---------------- */
  let routeIdx = 0;

  /* ================= 巡航路线的重规划 =================
     原航线是沿航道中心线采样的 4m 密集折线，两个问题：
       ① 弯道是由一串小折角拼出来的，曲率半径常常只有 40~80m；
          195km/h 的转弯半径需要 ~112m，船根本转不过来，只能靠限速硬压速度
          （上一版就是这么干的，结果 185 秒只跑了 6.1km，一圈都跑不完）。
       ② 有的路段贴着航道一侧走，另一侧明明还有 30m 余量没用上。
     所以这里在加载时对航线做一次"重规划"，生成 SAFE 航线：
       ① 逐点算曲率，挑出急弯点（|Δθ| > 0.055 rad / 4m ≈ R < 72m）；
       ② 对急弯点测 8 方向净空，朝"最宽敞的一侧"外推，把弯道半径撑开；
       ③ 拉普拉斯平滑 6 轮，消掉残余折角（每步都校验可航行，宁可不动也不上岸）；
       ④ 桥洞附近不外推——桥洞净宽是硬的，那里本来就该减速穿过去。
     自动驾驶之后走 SAFE，弯道限速只作为兜底，不再是主要手段。 */
  const SAFE = [];
  let safeReady = false;

  function buildSafeRoute() {
    const src = C.center, n = src.length;
    if (!src || !n || !window.Terrain) return;
    const T = window.Terrain;
    const pts = src.map(p => [p[0], p[1]]);

    /* 桥洞 70m 内不动：桥洞是硬约束，外推只会把船推到堤上 */
    const nearBridge = (x, z) => {
      const brs = window.__BRIDGES;
      if (!brs) return false;
      for (let i = 0; i < brs.length; i++) {
        if (Math.hypot(brs[i].x - x, brs[i].z - z) < 70) return true;
      }
      return false;
    };

    /* ② 移动平均平滑：原航线的弯是 4m 折线拼出来的，相邻三点方向差会被采样噪声放大
          （实测最大 1.55rad，纯属锯齿），猛打方向自然冲出去。
          这里用半径 3 的加权窗口抹平锯齿；弯道本身的地理曲率保留。
          分两段：先纯数学平滑 10 轮（很快），再带可航行校验平滑 4 轮。 */
    const smooth = (iter, guard) => {
      for (let it = 0; it < iter; it++) {
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
          let sx = 0, sz = 0, sw = 0;
          for (let k = -3; k <= 3; k++) {
            const q = pts[(i + k + n) % n];
            const w = 1 / (1 + Math.abs(k));
            sx += q[0] * w; sz += q[1] * w; sw += w;
          }
          const nx = sx / sw, nz = sz / sw;
          if (guard && !T.navigable(nx, nz)) { out[i] = [pts[i][0], pts[i][1]]; }
          else out[i] = [nx, nz];
        }
        for (let i = 0; i < n; i++) { pts[i][0] = out[i][0]; pts[i][1] = out[i][1]; }
      }
    };
    smooth(10, false);
    smooth(4, true);

    /* ③ 桥洞附近回拉：平滑会把航线拉直，可能把桥洞那一段带偏，这里按原坐标校正 */
    for (let i = 0; i < n; i++) {
      const src0 = src[i];
      if (!nearBridge(src0[0], src0[1])) continue;
      pts[i][0] = src0[0]; pts[i][1] = src0[1];
    }

    SAFE.length = 0;
    for (let i = 0; i < n; i++) SAFE.push([pts[i][0], pts[i][1]]);
    safeReady = true;
    window.__SAFE = SAFE;
    if (window.__log) window.__log('SAFE_ROUTE ready: ' + SAFE.length + ' pts');
  }

  const routeLine = () => (safeReady && SAFE.length ? SAFE : C.center);

  /* 环线上离船最近的节点（先在上一帧位置附近开窗搜，离得太远再全量搜） */
  function nearestRouteIdx(x, z, hint) {
    const R = routeLine(), n = R.length;
    let best = ((hint | 0) % n + n) % n, bd = Infinity;
    for (let k = -90; k <= 90; k++) {
      const i = ((best + k) % n + n) % n;
      const dx = R[i][0] - x, dz = R[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    if (bd > 300 * 300) {
      for (let i = 0; i < n; i += 2) {
        const dx = R[i][0] - x, dz = R[i][1] - z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  /* 自动巡航：纯追踪（pure pursuit）——朝环线前方 look 米处的点打舵 */
  function autopilotSteer() {
    const R = routeLine();
    const b = boat.state, n = R.length, G = CFG.gears;
    routeIdx = nearestRouteIdx(b.x, b.z, routeIdx);

    /* 航线曲率（前瞻 96m）：把航线分成前后两段 48m，比较两段的方向差。
       "航向误差"只反映船现在歪多少，看不到前方是个急弯；
       (-326,220) 三潭印月那一带就是这样——err 不大，但弯很急，
       195km/h 冲进去照样擦岸。曲率必须提前 90m 就拿到手。 */
    const p1 = R[routeIdx];
    const p2 = R[(routeIdx + 12) % n];
    const p3 = R[(routeIdx + 24) % n];
    let curve = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]) - Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    while (curve > Math.PI) curve -= Math.PI * 2;
    while (curve < -Math.PI) curve += Math.PI * 2;
    curve = Math.abs(curve);

    /* 桥洞对中：纯追踪的前视点在 40m 外，桥洞净宽只有 5-13m，
       前视点很容易落在桥台/堤身上，船就一头撞死在桥口（轻则原地顶住、重则卡进堤里）。
       离桥 65m 内直接朝桥洞中心打舵，出了桥再交还给航线追踪。

       但只能对"航线真的要从桥洞穿过去"的桥生效：
       锦带桥的航线是从堤北侧 54m 绕行的，硬把船拽向桥心等于往堤上撞。 */
    const brs = window.__BRIDGES;
    if (brs && brs.length) {
      let near = null, nd = 1e9;
      for (let i = 0; i < brs.length; i++) {
        const br = brs[i];
        const d = Math.hypot(br.x - b.x, br.z - b.z);
        if (d >= 90 || d <= 3 || d >= nd) continue;
        if (br._routeCross === undefined) {
          const vx = -br.uz, vz = br.ux;
          const ci = nearestRouteIdx(br.x, br.z, routeIdx);
          let pos = 0, neg = 0;
          for (let k = -15; k <= 15; k++) {
            const p = R[(ci + k + n) % n];
            const v = (p[0] - br.x) * vx + (p[1] - br.z) * vz;
            if (v > 2) pos++; else if (v < -2) neg++;
          }
          br._routeCross = pos > 0 && neg > 0;      // 航线前后分居桥两侧 = 真穿桥
        }
        if (br._routeCross) { near = br; nd = d; }
      }
      /* 桥必须在船头前方才追——否则刚穿过去就会被"拉回来"，在桥口来回荡 */
      if (near) {
        const fwd = (near.x - b.x) * Math.cos(b.heading) + (near.z - b.z) * Math.sin(b.heading);
        if (fwd > 0) {
          const want = Math.atan2(near.z - b.z, near.x - b.x);
          let err = want - b.heading;
          while (err > Math.PI) err -= Math.PI * 2;
          while (err < -Math.PI) err += Math.PI * 2;
          return { steer: clamp(err * 2.7, -1, 1), err: Math.abs(err), curve: curve };
        }
      }
    }

    const sp = Math.abs(b.speed);
    const look = clamp(sp * G.lookAhead, G.lookMin, G.lookMax);
    let j = routeIdx, acc = 0, guard = 0;
    while (acc < look && guard++ < 240) {
      const k = (j + 1) % n;
      acc += Math.hypot(R[k][0] - R[j][0], R[k][1] - R[j][1]);
      j = k;
    }
    const want = Math.atan2(R[j][1] - b.z, R[j][0] - b.x);
    let err = want - b.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    return { steer: clamp(err * G.cruiseTurn, -1, 1), err: Math.abs(err), curve: curve };
  }

  function cycleGear(dir) {
    if (!boat) return;
    const g = boat.cycleGear(dir || 1);
    HUD.setGear(g);
    let sub;
    if (g === 3) {
      /* 三档两端提速手段不同：电脑按 W 到快档速度，手机只能前拉摇杆且上限低一截 */
      sub = isTouchUI()
        ? '自动沿湖航行 · 基础 71km/h，前拉摇杆提速至 195km/h 封顶'
        : '自动沿湖航行 · 基础 71km/h，按 W 提速至 195km/h';
    } else {
      sub = g === 2 ? '全速快船 · 速度与船头分水拉满' : '慢速摇橹 · 更接近真实乌篷船';
    }
    HUD.toast(Boat.gearName(g), sub);
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

    /* 视角：桌面鼠标移动即环视；触屏在摇杆/按钮之外拖动屏幕即环视 */
    const cvs = $('scene');
    let lastPX = 0, lastPY = 0, touchViewId = null, tX = 0, tY = 0;
    /* 这些元素自己吃手指（摇杆、换档、音效、按钮），落在它们身上不算"拖屏幕看景" */
    const VIEW_BLOCK = '#stick, #pedals, .pedal, #pgear, #mute, #rotbtn, button, input, a';
    if (cvs) {
      cvs.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch' && e.button === 0) snapBack = true;   // 桌面：左键点击立即回正
      });
    }
    /* 拖动视角挂 window 而不是 canvas：手指从 HUD 上按下再滑到画面上也要能接住，
       并且 pointercancel 必须一起复位——否则一次系统手势（下拉通知、侧滑返回）就能让
       touchViewId 永远停在旧 id 上，之后所有拖动都失效，这是"拖屏不能转视角"的根因。 */
    function viewGrab(e) {
      if (e.pointerType !== 'touch') return;
      if (touchViewId !== null) return;                       // 已有手指在控制视角，第二根不抢
      const t = e.target;
      if (t && t.closest && t.closest(VIEW_BLOCK)) return;
      touchViewId = e.pointerId;
      tX = e.clientX; tY = e.clientY;
      snapBack = false;
      lookT = performance.now();
    }
    function viewRelease(e) {
      if (e.pointerType !== 'touch' || touchViewId !== e.pointerId) return;
      touchViewId = null;
      snapBack = true;                                        // 松手立即回正
      lookT = performance.now();
    }
    window.addEventListener('pointerdown', viewGrab, { passive: true });
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
    window.addEventListener('pointerup', viewRelease);
    window.addEventListener('pointercancel', viewRelease);      // 系统手势/来电打断，一定要复位
    window.addEventListener('blur', () => { touchViewId = null; });
    window.addEventListener('contextmenu', e => e.preventDefault());

    // 触屏
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
    const stick = $('stick');
    if (stick) {
      /* 摇杆两段式：
           小幅（内圈以内）→ 只转向，油门为 0，用来"对方向"；
           推过虚线阈值   → 转向照旧，同时给油，推到底就是当前档位满速。
         阈值带迟滞（进 0.58 / 出 0.48），避免手指停在临界点上来回抖。 */
      const knob = stick.querySelector('.knob');
      const R = 52;                 // knob 最大位移（px），与 #stick 半径 62 留 10px 余量
      const ZONE_IN = 0.58, ZONE_OUT = 0.48;
      let stickId = null, running = false;

      const applyStick = (dx, dy) => {
        const len = Math.hypot(dx, dy);
        const t = Math.min(1, len / R);
        // knob 跟手（只画到 R 处，防止拖出圆外）
        if (knob) {
          if (len > 0.5) {
            const l = Math.min(R, len), a = Math.atan2(dy, dx);
            knob.style.transform = 'translate(' + (Math.cos(a) * l).toFixed(1) + 'px,' + (Math.sin(a) * l).toFixed(1) + 'px)';
          } else {
            knob.style.transform = 'translate(0,0)';
          }
        }
        // 转向只看水平分量：满舵在 0.6R 处，小幅也能明显打舵
        touch.steer = clamp(dx / (R * 0.6), -1, 1);
        // 前进看总幅度：跨过阈值才给油，迟滞防止临界抖动
        if (t >= ZONE_IN) running = true;
        else if (t <= ZONE_OUT) running = false;
        touch.throttle = running ? clamp(0.28 + ((t - ZONE_OUT) / 0.40) * 0.72, 0.28, 1) : 0;
        // 三档巡航只在"向前拉"时提速，所以纵向分量单独留一份
        touch.forward = Math.max(0, -dy / R);
        stick.classList.toggle('run', running);
      };

      const stickCenter = e => {
        const rc = stick.getBoundingClientRect();
        return [e.clientX - rc.left - rc.width / 2, e.clientY - rc.top - rc.height / 2];
      };
      stick.addEventListener('pointerdown', e => {
        e.preventDefault();
        stickId = e.pointerId;
        try { stick.setPointerCapture(e.pointerId); } catch (err) { }
        const c = stickCenter(e); applyStick(c[0], c[1]);
      });
      stick.addEventListener('pointermove', e => {
        if (stickId !== e.pointerId) return;
        const c = stickCenter(e); applyStick(c[0], c[1]);
      });
      const endStick = e => {
        if (stickId !== e.pointerId) return;
        stickId = null; running = false;
        touch.steer = 0; touch.throttle = 0; touch.forward = 0;
        stick.classList.remove('run');
        if (knob) knob.style.transform = 'translate(0,0)';
      };
      stick.addEventListener('pointerup', endStick);
      stick.addEventListener('pointercancel', endStick);
      stick.addEventListener('lostpointercapture', endStick);
    }
    /* 换档踏板（油门踏板已并入摇杆，不再单独占一个控件） */
    const gb = $('pgear');
    if (gb) {
      gb.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (state === 'cruise' || state === 'count') {
          cycleGear(1);
          gb.classList.add('on');
          setTimeout(() => gb.classList.remove('on'), 180);
        }
      });
    }
  }

  /* ---------------- 开始 ---------------- */
  function startRun() {
    /* 首次开局时把航线重规划一次（一次性，之后复用）。放在这里而不是 loading，
       是因为需要 Terrain 和 __BRIDGES 都就绪。 */
    if (!safeReady) {
      const t0b = performance.now();
      try { buildSafeRoute(); } catch (e) { if (window.__log) window.__log('SAFE_ROUTE fail: ' + e.message); }
      if (window.__log) window.__log('SAFE_ROUTE cost ' + Math.round(performance.now() - t0b) + 'ms');
    }
    try { AudioFX.init(); AudioFX.resume(); AudioFX.setMuted(false); HUD.setMute(false); } catch (e) { }
    HUD.showStart(false);
    HUD.showResult(null);
    HUD.showHUD(true);
    boat.reset(C.start.x, C.start.z, C.heading);
    boat.setView('first');            // 进入游戏回到第一人称
    visitedCount = 0; topSpeed = 0; raceTime = 0; armed = false;
    stuckT = 0; unstickT = 0;
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
      const keyThr = (keys['KeyW'] || keys['ArrowUp']) ? 1 : 0;
      // 键盘油门与摇杆油门取较大者：谁推得深听谁的
      const thr = Math.max(keyThr, touch.throttle);
      if (gear === 3) {
        /* 三档：自动沿环线航行，转向全交给自动驾驶，玩家只管提速。
           基础速度 = cruiseSlow(19.67 ≈ 71km/h)；
           提速上限两端统一 = 195km/h（电脑按 W / 手机前拉摇杆）。
           都是改 cap，速度爬到上限就封顶，继续拉也不会超过。 */
        const ap = autopilotSteer();
        input.steer = ap.steer;
        input.throttle = ap.err > 0.85 ? 0.55 : 1;      // 大角度修正时收一点油
        input.cruiseFast = false;

        /* 顶住自愈：满油却连续 0.8s 几乎不动，说明船头顶在桥台/岸壁上。
           倒车 1.2s 并反打舵退出来，再交还给自动驾驶——比单纯"卡在那里"稳得多。 */
        if (Math.abs(boat.state.speed) < 1.5) stuckT += dt;
        else stuckT = Math.max(0, stuckT - dt * 2.5);
        if (stuckT > 0.8 && unstickT <= 0) { unstickT = 1.2; stuckT = 0; }
        if (unstickT > 0) {
          unstickT -= dt;
          input.throttle = -1;                          // 倒车（boat 里最低到 CFG.boat.reverse）
          input.steer = (routeIdx % 2 === 0 ? 1 : -1);
        }
        if (isTouchUI()) {
          input.cruiseCap = (touch.forward > 0.32) ? CFG.gears.cruiseBoost : CFG.gears.cruiseSlow;
        } else {
          input.cruiseCap = keyThr ? CFG.gears.cruiseFast : CFG.gears.cruiseSlow;
        }
        /* 弯道兜底限速：路线重规划之后曲率已经平缓了很多，这里只做极端情况的保险。
           基础 70.8km/h 不受影响（阈值都在它之上或只在很急的弯才触发）。 */
        if (ap.err > 0.45) input.cruiseCap = Math.min(input.cruiseCap, 25);   // 90km/h
        if (ap.err > 0.90) input.cruiseCap = Math.min(input.cruiseCap, 15);   // 54km/h
        if (ap.curve > 0.30) input.cruiseCap = Math.min(input.cruiseCap, 30); // 108km/h
        if (ap.curve > 0.55) input.cruiseCap = Math.min(input.cruiseCap, 18); // 65km/h

        /* 前方障碍探测：只看航向误差还不够——有些窄口是直的，err 很小但正前方 20m 就是岸。
           按船头前方 45m / 25m 两个探针提前收速，让 195km/h 的提速不至于一头怼上去。 */
        const hx = Math.cos(boat.state.heading), hz = Math.sin(boat.state.heading);
        const bx0 = boat.state.x, bz0 = boat.state.z;
        if (!Terrain.navigable(bx0 + hx * 45, bz0 + hz * 45)) input.cruiseCap = Math.min(input.cruiseCap, 25);
        if (!Terrain.navigable(bx0 + hx * 25, bz0 + hz * 25)) input.cruiseCap = Math.min(input.cruiseCap, 14);

        /* 过桥减速：桥洞净宽只有 10-13m，19.7m/s 冲进去时船头（前探 3.4m）
           很容易蹭到桥台。距桥 45m 内把上限压到 13m/s（约 47km/h），
           与真实行船一样"减速过桥"，出桥再恢复。 */
        const brs2 = window.__BRIDGES;
        if (brs2) {
          for (let i = 0; i < brs2.length; i++) {
            const br = brs2[i];
            if (Math.hypot(br.x - boat.state.x, br.z - boat.state.z) < 45) {
              input.cruiseCap = Math.min(input.cruiseCap, 13);
              break;
            }
          }
        }
      } else {
        const kBrake = (keys['KeyS'] || keys['ArrowDown']) ? 1 : 0;
        const kSteer = (keys['KeyA'] || keys['ArrowLeft'] ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
        input.throttle = thr - kBrake * 0.5;
        input.steer = clamp(kSteer + touch.steer, -1, 1);
        input.cruiseFast = false;
        input.cruiseCap = null;                          // 一二档不看巡航上限
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
