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

  /* 档位指示：1 慢 / 2 快 / 3 自动巡航 */
  H.setGear = function (g) {
    const el = $('gear');
    if (el) {
      el.textContent = g === 3 ? '三档 · 巡航' : (g === 2 ? '二档 · 快船' : '一档 · 慢船');
      el.className = 'gchip g' + g;
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
    const b = document.body;
    if (b) { b.classList.toggle('gear3', g === 3); }
  };
  H.setVisit = (n, total) => { const el = $('visit'); if (el) el.textContent = '探访 ' + n + ' / ' + total; };
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
      if (d > (l.visitR || 500) * 1.1) continue;
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
  function buildRoutePts() {
    routePts.length = 0;
    routeReady = false;
    const c = course && course.center;
    if (!c || !mapBounds) return;
    const step = Math.max(1, Math.round(c.length / 420));
    for (let i = 0; i < c.length; i += step) routePts.push([mapBounds.X(c[i][0]), mapBounds.Y(c[i][1])]);
    routeReady = routePts.length > 8;
  }
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
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 296, 296);
    g.drawImage(staticMap, 0, 0);
    const X = mapBounds.X, Y = mapBounds.Y;
    drawRoute(g, (opt && opt.gear) || 1, (opt && opt.t) || 0);
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
