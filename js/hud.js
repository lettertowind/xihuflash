/* HUD：地标浮标与引线、计时、速度、氮气、探访进度、toast、小地图（自由探索） */
window.HUD = (function () {
  const H = {};
  let course, labels = [], staticMap = null, mapBounds = null;
  const active = new Map();
  const proj = new THREE.Vector3();
  const camSpace = new THREE.Vector3();
  const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

  const $ = id => document.getElementById(id);
  const fmt = t => {
    const m = Math.floor(t / 60), s = Math.floor(t % 60), ms = Math.floor((t % 1) * 100);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(2, '0');
  };
  H.fmt = fmt;

  H.init = function (c, lmList) {
    course = c;
    H._mode = H._mode || 'free';
    H._lms = (lmList && lmList.length) ? lmList : c.landmarks;
    // 地标浮标
    const layer = $('labels');
    if (layer) {
      H._lms.forEach(l => {
        const el = document.createElement('div');
        el.className = 'lm';
        el.innerHTML = '<div class="card"><span class="k">西湖</span><div class="n">' + l.name + '</div><div class="d">' + l.sub + '</div></div>';
        layer.appendChild(el);
        labels.push({ l, el, card: el.querySelector('.card'), on: false, k: el.querySelector('.k') });
      });
      const svg = $('leaders');
      labels.forEach(it => {
        const ln = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        ln.setAttribute('fill', 'none');
        ln.setAttribute('stroke', 'rgba(244,246,242,.75)');
        ln.setAttribute('stroke-width', '1');
        ln.style.opacity = '0';
        ln.style.transition = 'opacity .4s';
        svg.appendChild(ln);
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '2.6');
        dot.setAttribute('fill', '#eef2ec');
        dot.style.opacity = '0';
        dot.style.transition = 'opacity .4s';
        svg.appendChild(dot);
        it.line = ln; it.dot = dot;
      });
    }
    buildStaticMap();
  };

  function buildStaticMap() {
    const N = 296;
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const g = c.getContext('2d');
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    course.water.forEach(p => {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
    });
    const pad = 12;
    const sc = (N - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (N - (maxX - minX) * sc) / 2, oz = (N - (maxZ - minZ) * sc) / 2;
    const X = x => ox + (x - minX) * sc;
    const Y = z => oz + (z - minZ) * sc;
    mapBounds = { X, Y };

    g.beginPath();
    course.water.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.closePath();
    g.fillStyle = 'rgba(96,128,130,.5)'; g.fill();
    g.strokeStyle = 'rgba(206,220,214,.75)'; g.lineWidth = 1.2; g.stroke();

    g.fillStyle = 'rgba(112,122,102,.9)';
    course.islands.forEach(r => {
      g.beginPath();
      r.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
      g.closePath(); g.fill();
    });

    g.strokeStyle = 'rgba(226,220,196,.8)'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (const nm in course.causeways) {
      for (const line of course.causeways[nm]) {
        g.beginPath();
        line.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
        g.stroke();
      }
    }

    H._lms.forEach(l => {
      g.fillStyle = l.visited ? '#ffd23c' : 'rgba(240,214,140,.75)';
      g.beginPath(); g.arc(X(l.x), Y(l.z), l.visited ? 2.6 : 1.9, 0, 7); g.fill();
    });

    staticMap = c;
    buildRoutePts();
  }
  H.refreshMap = buildStaticMap;

  /* ---------- 顶部信息 ---------- */
  H.setTime = t => { const el = $('tval'); if (el) el.textContent = fmt(t); };

  /* speed：km/h；heat：0..1 速度强度（驱动条长）；gear：1/2/3 */
  H.setSpeed = (kmh, heat, gear) => {
    const el = $('speedval'); if (el) el.textContent = Math.round(kmh);
    const h = Math.max(0, Math.min(1, heat || 0));
    const bf = $('boostfill');
    if (bf) {
      bf.style.width = Math.round(h * 100) + '%';
      bf.style.background = gear === 3
        ? 'linear-gradient(90deg,#8f7bff,#c7b6ff)'
        : (gear === 2 ? 'linear-gradient(90deg,#ffb03c,#ffd94c)' : 'linear-gradient(90deg,#3f9fb4,#63ccc0)');
    }
    const bw = $('boostwrap');
    if (bw) bw.classList.toggle('hot', h > 0.74);
  };

  /* 档位指示：1 慢 / 2 快 / 3 自动巡航（竞速模式固定显示快船） */
  H.setGear = function (g) {
    const el = $('gear');
    const race = H._mode === 'race';
    if (el) {
      el.textContent = race ? '竞速 · 快船' : (g === 3 ? '三档 · 巡航' : (g === 2 ? '二档 · 快船' : '一档 · 慢船'));
      el.className = 'gchip g' + (race ? 2 : g);
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
    const b = document.body;
    if (b) { b.classList.toggle('gear3', g === 3 && !race); }
  };
  H.setVisit = (n, total) => { const el = $('visit'); if (el) el.textContent = '探访 ' + n + ' / ' + total; };

  /* ---------- v2：模式 / 体力 / 风向 / 上下船 ---------- */
  H.setMode = function (mode) {
    document.body.classList.toggle('race', mode === 'race');
    H._mode = mode;
    const g = $('gear');
    if (g && mode === 'race') { g.textContent = '竞速 · 快船'; g.className = 'gchip g2'; }
  };

  /* 体力条：v 0..1 */
  H.setStamina = function (v) {
    const f = $('staminafill');
    const w = Math.max(0, Math.min(1, v || 0));
    if (f) f.style.width = Math.round(w * 100) + '%';
    const s = $('stamina');
    if (s) s.classList.toggle('low', w < 0.26);
  };
  H.setStaminaLabel = function (txt) {
    const l = $('staminalabel');
    if (l && txt) l.textContent = txt;
  };

  /* 风向：info = { on, name, level, strength, dir, burst } */
  H.setWind = function (info) {
    if (!info) return;
    const box = $('windbox'), txt = $('windtxt'), ar = $('windarrow');
    if (box) {
      box.classList.toggle('off', !info.on);
      box.classList.toggle('gust', !!info.on && (info.burst || 0) > 0.3);
    }
    if (txt) {
      txt.textContent = info.on
        ? (info.level > 0 ? info.name + '风 · ' + info.level + '级' : '微风')
        : '无风';
    }
    if (ar) ar.style.transform = 'rotate(' + (info.dir * 180 / Math.PI) + 'deg)';
    const tg = $('windtog');
    if (tg) tg.textContent = '风力 ' + (info.on ? '开' : '关');
  };

  H.onWindTog = fn => { const el = $('windtog'); if (el) el.addEventListener('click', fn); };

  H.showBoatBtn = function (which) {
    const box = $('boatbtns'), d = $('disembark'), b = $('board');
    if (!box) return;
    if (d) d.classList.toggle('on', which === 'disembark');
    if (b) b.classList.toggle('on', which === 'board');
    box.classList.toggle('show', !!which);
  };
  H.onDisembark = fn => { const el = $('disembark'); if (el) el.addEventListener('click', fn); };
  H.onBoard = fn => { const el = $('board'); if (el) el.addEventListener('click', fn); };
  H.onMode = function (fn) {
    const box = $('modesel');
    if (!box) return;
    box.querySelectorAll('.mode').forEach(btn => {
      btn.addEventListener('click', () => {
        box.querySelectorAll('.mode').forEach(b2 => b2.classList.toggle('on', b2 === btn));
        fn(btn.getAttribute('data-mode') || 'free');
      });
    });
  };
  H.setModeChoice = function (m) {
    const box = $('modesel');
    if (!box) return;
    box.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', b.getAttribute('data-mode') === m));
  };

  H.setCompass = h => {
    const el = $('compass'); if (!el) return;
    const fx = Math.cos(h), fz = Math.sin(h);
    const ang = Math.atan2(fx, -fz);
    el.textContent = DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
  };
  H.setWrong = on => { const el = $('wrong'); if (el) el.classList.toggle('on', on); };
  H.flash = () => {
    const f = $('flash'); if (!f) return;
    f.style.opacity = '1';
    setTimeout(() => { f.style.opacity = '0'; }, 120);
  };
  H.showHUD = on => { const el = $('hud'); if (el) el.classList.toggle('on', on); document.body.classList.toggle('playing', !!on); };
  H.hideLabels = () => labels.forEach(it => setLabel(it, false));

  H.countdown = txt => {
    const el = $('countdown'); if (!el) return;
    el.textContent = txt;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  };

  /* ---------- toast（探访提示） ---------- */
  let toastTimer = 0;
  H.toast = function (title, sub) {
    const el = $('toast'); if (!el) return;
    $('toastTitle').textContent = title;
    $('toastSub').textContent = sub || '';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    toastTimer = 3.4;
  };
  H.updateToast = function (dt) {
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) { const el = $('toast'); if (el) el.classList.remove('show'); }
    }
  };

  /* ---------- 面板 ---------- */
  H.showStart = on => { const el = $('start'); if (el) el.classList.toggle('hide', !on); document.body.classList.toggle('uiopen', !!on); };
  H.showResult = function (data) {
    const el = $('result'); if (!el) return;
    if (!data) { el.classList.add('hide'); document.body.classList.remove('uiopen'); return; }
    $('rtime').textContent = fmt(data.time);
    $('rvisit').textContent = data.visited + ' / ' + data.total;
    $('rdist').textContent = (data.distance / 1000).toFixed(2) + ' km';
    $('rtop').textContent = Math.round(data.top * 3.6) + ' km/h';
    $('rcoll').textContent = data.collisions;
    const rm = $('rmode');
    if (rm) rm.textContent = data.mode === 'race'
      ? '竞速模式 · 全湖 ' + data.total + ' 景'
      : '自由模式 · 不计时';
    const nb = $('rnew');
    if (nb) nb.textContent = data.newBest ? '最 佳 纪 录' : '';
    el.classList.remove('hide');
    document.body.classList.add('uiopen');
  };

  /* ---------- 地标浮标 ---------- */
  H.updateLabels = function (camera, dt) {
    if (!camera || !labels.length) return;
    const w = window.innerWidth, h = window.innerHeight;
    const cands = [];
    const camPos = camera.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const fx = fwd.x, fz = fwd.z;
    for (const it of labels) {
      const l = it.l;
      const dx = l.x - camPos.x, dz = l.z - camPos.z;
      const d = Math.hypot(dx, dz);
      if (d > Math.max(l.visitR || 0, 420) * 1.1) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.18) continue;
      cands.push({ it, d });
    }
    cands.sort((a, b) => a.d - b.d);
    /* 手机屏小：只留最近的一个标签，且整体往内收，避免压住右上角小地图 */
    const touchUI = document.body.classList.contains('touch');
    const narrow = touchUI || w < 900;
    const show = new Set(cands.slice(0, narrow ? 1 : 2).map(c => c.it));
    const used = [];

    camera.updateMatrixWorld();
    for (const it of labels) {
      const l = it.l;
      if (!show.has(it)) { setLabel(it, false); continue; }
      proj.set(l.x, l.hy || l.h || 10, l.z);
      camSpace.copy(proj).applyMatrix4(camera.matrixWorldInverse);
      if (camSpace.z > -4) { setLabel(it, false); continue; }
      proj.project(camera);
      const sx = (proj.x * 0.5 + 0.5) * w;
      const sy = (-proj.y * 0.5 + 0.5) * h;
      if (sx < 36 || sx > w - 36 || sy < 40 || sy > h - 20) { setLabel(it, false); continue; }

      const side = sx < w * 0.5 ? -1 : 1;
      let ox = sx + side * (narrow ? 74 : 96);
      let oy = sy - (narrow ? 62 : 78);
      for (const u of used) {
        if (Math.abs(u.x - ox) < 190 && Math.abs(u.y - oy) < 70) oy -= 74;
      }
      used.push({ x: ox, y: oy });
      /* 右侧留出小地图的地盘（触屏小地图贴右上角），否则卡片会骑在地图上 */
      const rightLimit = w - (touchUI ? 200 : 110);
      ox = Math.max(110, Math.min(rightLimit, ox));
      oy = Math.max(86, oy);

      const cardW = it.card.offsetWidth || 140;
      const cardH = it.card.offsetHeight || 52;
      const left = ox - cardW / 2, top = oy - cardH;
      it.el.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
      it._d = Math.hypot(l.x - camPos.x, l.z - camPos.z);
      it.k.textContent = Math.round(it._d) + ' M' + (l.visited ? ' · 已访' : '');

      const sx2 = Math.max(left + 12, Math.min(left + cardW - 12, ox));
      const y2 = top + cardH;
      it.line.setAttribute('points', sx2 + ',' + y2 + ' ' + (sx2 + side * 14) + ',' + (y2 + 24) + ' ' + sx + ',' + sy);
      it.dot.setAttribute('cx', sx); it.dot.setAttribute('cy', sy);
      setLabel(it, true);
    }
  };

  function setLabel(it, on) {
    if (it.on === on) return;
    it.on = on;
    it.el.classList.toggle('in', on);
    it.line.style.opacity = on ? '1' : '0';
    it.dot.style.opacity = on ? '1' : '0';
  }

  /* ---------- 小地图 ---------- */
  /* 环线抽稀点（一次性，避免每帧遍历 2000+ 点） */
  const routePts = [];
  let routeReady = false;
  /* v2.2：航线上 23 处「泊靠点」= 船的停靠位置，画到小地图上 */
  let berthPts = [];
  function buildRoutePts() {
    routePts.length = 0;
    routeReady = false;
    /* 优先画 v2 的全湖巡回航线（自动巡航 / 竞速箭头共用的那条） */
    const c = (window.__TOUR && window.__TOUR.length > 8) ? window.__TOUR : (course && course.center);
    if (!c || !mapBounds) return;
    const step = Math.max(1, Math.round(c.length / 420));
    for (let i = 0; i < c.length; i += step) routePts.push([mapBounds.X(c[i][0]), mapBounds.Y(c[i][1])]);
    routeReady = routePts.length > 8;
    /* 泊靠点（l.ax / l.az 由 game.js 的航线规划写入） */
    const lm = (window.Landmarks && Landmarks.list) || H._lms || [];
    berthPts = [];
    for (let i = 0; i < lm.length; i++) {
      const l = lm[i];
      if (l.ax === undefined || l.az === undefined) continue;
      berthPts.push({ x: l.ax, z: l.az, visited: !!l.visited });
    }
  }
  H.refreshRoute = buildRoutePts;
  function routePath(g) {
    g.beginPath();
    for (let i = 0; i < routePts.length; i++) {
      const p = routePts[i];
      if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
    }
    g.closePath();
  }
  /* 环形航线高亮：
     gear 3（自动巡航）→ 常亮 + 流光线（不闪）
     gear 1/2          → 明暗交替闪烁 + 虚线行进，提示"这是主航线" */
  function drawRoute(g, gear, tsec) {
    if (!routeReady) return;
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (gear === 3) {
      g.strokeStyle = 'rgba(186,166,255,.30)'; g.lineWidth = 7; routePath(g); g.stroke();
      g.strokeStyle = 'rgba(214,200,255,.95)'; g.lineWidth = 2.2;
      g.setLineDash([10, 7]); g.lineDashOffset = -tsec * 30; routePath(g); g.stroke();
    } else {
      const blink = 0.5 + 0.5 * Math.sin(tsec * 5.2);         // 明暗交替
      g.globalAlpha = 0.22 + 0.42 * blink;
      g.strokeStyle = 'rgba(255,214,120,.9)'; g.lineWidth = 6.5; routePath(g); g.stroke();
      g.globalAlpha = 0.42 + 0.55 * blink;
      g.strokeStyle = 'rgba(255,236,180,1)'; g.lineWidth = 2;
      g.setLineDash([8, 8]); g.lineDashOffset = -tsec * 24; routePath(g); g.stroke();
    }
    g.restore();
  }

  H.drawMinimap = function (boat, traffic, dock, opt) {
    const cv = $('minimap');
    if (!cv || !staticMap) return;
    opt = opt || {};
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 296, 296);
    g.drawImage(staticMap, 0, 0);
    const X = mapBounds.X, Y = mapBounds.Y;
    drawRoute(g, opt.gear || 1, opt.t || 0);

    /* ---- 船的停靠点（v2.2 需求 13）----
       航线上的 23 处泊靠点画成空心小圈（已探访的变金色），
       当前系泊位置再画一个实心锚点 + 脉冲圈，一眼看出"船停在哪"。 */
    if (berthPts.length) {
      for (let i = 0; i < berthPts.length; i++) {
        const b = berthPts[i];
        const x = X(b.x), y = Y(b.z);
        g.beginPath(); g.arc(x, y, 2.2, 0, 7);
        g.lineWidth = 1.1;
        g.strokeStyle = b.visited ? 'rgba(255,210,60,.95)' : 'rgba(206,236,216,.72)';
        g.stroke();
        g.beginPath();
        g.moveTo(x - 3.6, y); g.lineTo(x + 3.6, y);
        g.strokeStyle = b.visited ? 'rgba(255,210,60,.35)' : 'rgba(206,236,216,.30)';
        g.lineWidth = 0.8; g.stroke();
      }
    }
    /* 当前系泊点：锚 */
    if (opt.moored) {
      const mx = X(opt.moored.x), my = Y(opt.moored.z);
      const pulse = 3.6 + Math.sin((opt.t || 0) * 3.4) * 1.6;
      g.beginPath(); g.arc(mx, my, pulse + 2.2, 0, 7);
      g.strokeStyle = 'rgba(255,214,120,.55)'; g.lineWidth = 1; g.stroke();
      g.save();
      g.translate(mx, my);
      g.strokeStyle = '#ffd86a'; g.fillStyle = '#ffd86a'; g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 4.2); g.stroke();          // 锚杆
      g.beginPath(); g.arc(0, -5, 1.6, 0, 7); g.stroke();                    // 锚环
      g.beginPath(); g.moveTo(-3.6, 1.2); g.quadraticCurveTo(0, 5.6, 3.6, 1.2); g.stroke(); // 锚爪
      g.restore();
    }
    if (dock) {
      g.fillStyle = '#e8c86a';
      g.fillRect(X(dock.x) - 2.5, Y(dock.z) - 2.5, 5, 5);
    }
    if (traffic) {
      g.fillStyle = 'rgba(244,248,244,.8)';
      for (const t of traffic) {
        g.beginPath(); g.arc(X(t.x), Y(t.z), 1.7, 0, 7); g.fill();
      }
    }
    if (boat) {
      const x = X(boat.x), y = Y(boat.z);
      g.save();
      g.translate(x, y);
      g.rotate(boat.heading + Math.PI / 2);
      g.fillStyle = 'rgba(246,241,231,.12)';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-13, -30); g.lineTo(13, -30); g.closePath(); g.fill();
      g.fillStyle = '#f6f1e7';
      g.beginPath(); g.moveTo(0, -8); g.lineTo(5.2, 6); g.lineTo(0, 3); g.lineTo(-5.2, 6); g.closePath(); g.fill();
      g.restore();
    }
    /* 上岸时：玩家自己画成一个小圆点（船仍以锚标在原地） */
    if (opt.player) {
      const px = X(opt.player.x), py = Y(opt.player.z);
      g.beginPath(); g.arc(px, py, 2.4, 0, 7);
      g.fillStyle = '#eaf6ee'; g.fill();
      g.beginPath(); g.arc(px, py, 4.4, 0, 7);
      g.strokeStyle = 'rgba(234,246,238,.45)'; g.lineWidth = 1; g.stroke();
    }
  };

  /* ---------- 加载与按钮 ---------- */
  H.showLoading = function (show) { const el = $('loading'); if (el) el.classList.toggle('hide', !show); };
  H.loading = function (msg, pct) {
    const a = $('lmsg'), b = $('lbar');
    if (a) a.textContent = msg;
    if (b) b.style.width = pct + '%';
  };

  H.onStart = fn => { const el = $('startbtn'); if (el) el.addEventListener('click', fn); };
  H.onAgain = fn => { const el = $('againbtn'); if (el) el.addEventListener('click', fn); };
  H.onBack = fn => { const el = $('backbtn'); if (el) el.addEventListener('click', fn); };
  H.onMute = fn => { const el = $('mute'); if (el) el.addEventListener('click', fn); };
  H.setMute = muted => { const el = $('mute'); if (el) el.textContent = muted ? '音效 关' : '音效 开'; };

  return H;
})();
