/* HUD：计时、速度、小地图、地标标签、开始/结算 */
window.HUD = (function () {
  const H = {};
  let course, labels = [], staticMap = null, mapBounds = null;
  const active = new Map();
  const proj = new THREE.Vector3();
  const camSpace = new THREE.Vector3();

  const $ = id => document.getElementById(id);
  const fmt = t => {
    const m = Math.floor(t / 60), s = Math.floor(t % 60), ms = Math.floor((t % 1) * 1000);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
  };
  H.fmt = fmt;

  H.init = function (c) {
    course = c;
    // 地标标签
    const layer = $('labels');
    course.landmarks.forEach((l, i) => {
      const el = document.createElement('div');
      el.className = 'lm';
      el.innerHTML = '<div class="card"><span class="k">西湖</span><div class="n">' + l.name + '</div><div class="d">' + l.sub + '</div></div>';
      layer.appendChild(el);
      labels.push({ l, el, card: el.querySelector('.card'), on: false, k: el.querySelector('.k') });
    });
    // 引线
    const svg = $('leaders');
    labels.forEach((it, i) => {
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      ln.setAttribute('fill', 'none');
      ln.setAttribute('stroke', 'rgba(250,244,230,.82)');
      ln.setAttribute('stroke-width', '1');
      ln.style.opacity = '0';
      ln.style.transition = 'opacity .4s';
      svg.appendChild(ln);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '2.6');
      dot.setAttribute('fill', '#f7efdd');
      dot.style.opacity = '0';
      dot.style.transition = 'opacity .4s';
      svg.appendChild(dot);
      it.line = ln; it.dot = dot;
    });

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

    g.fillStyle = 'rgba(10,18,22,.0)'; g.fillRect(0, 0, N, N);
    g.beginPath();
    course.water.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.closePath();
    g.fillStyle = 'rgba(150,196,214,.42)'; g.fill();
    g.strokeStyle = 'rgba(224,240,246,.8)'; g.lineWidth = 1.2; g.stroke();

    g.fillStyle = 'rgba(8,14,18,.72)';
    course.islands.forEach(r => {
      g.beginPath();
      r.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
      g.closePath(); g.fill();
    });

    g.strokeStyle = 'rgba(239,227,204,.55)'; g.lineWidth = 1.4;
    g.beginPath();
    course.center.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.stroke();

    course.landmarks.forEach(l => {
      g.fillStyle = 'rgba(232,180,106,.9)';
      g.beginPath(); g.arc(X(l.x), Y(l.z), 1.8, 0, 7); g.fill();
    });

    staticMap = c;
  }

  H.setTime = t => { $('tval').textContent = fmt(t); };
  H.setSpeed = (kmh, boost) => {
    $('speedval').textContent = Math.round(kmh);
    $('boostfill').style.width = Math.round(boost * 100) + '%';
  };
  H.setProgress = (ratio, km, total, sector) => {
    $('progfill').style.width = (ratio * 100).toFixed(2) + '%';
    $('progkm').textContent = km.toFixed(2) + ' / ' + (total / 1000).toFixed(2) + ' km';
    $('sectorname').textContent = sector;
  };
  H.setGate = (n, total) => { $('minicap').textContent = n + ' / ' + total; };
  H.setWrong = on => $('wrong').classList.toggle('on', on);
  H.flash = () => {
    const f = $('flash'); f.style.opacity = '1';
    setTimeout(() => f.style.opacity = '0', 120);
  };
  H.showHUD = on => $('hud').classList.toggle('on', on);
  H.hideLabels = () => { if (labels.length) labels.forEach(it => setLabel(it, false)); };

  H.countdown = txt => {
    const el = $('countdown');
    el.textContent = txt;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  };

  H.showStart = on => $('start').classList.toggle('hide', !on);
  H.showResult = data => {
    if (!data) { $('result').classList.add('hide'); return; }
    $('rtime').innerHTML = fmt(data.time);
    $('rrank').textContent = data.rank;
    $('rnew').textContent = data.newBest ? 'NEW BEST' : '';
    $('rsplits').innerHTML = data.splits.map(s =>
      '<div class="split"><span>' + s.name + '</span><span>' + fmt(s.time) + '</span></div>').join('');
    $('rstats').innerHTML =
      '<div class="stat"><b>' + data.top + '</b><span>最高 KM/H</span></div>' +
      '<div class="stat"><b>' + data.gates + '</b><span>通过浮标</span></div>' +
      '<div class="stat"><b>' + data.collisions + '</b><span>碰撞次数</span></div>';
    $('result').classList.remove('hide');
  };

  /* ---------- 地标标签 ---------- */
  H.updateLabels = function (camera, dt) {
    if (!camera) return;
    const w = window.innerWidth, h = window.innerHeight;
    const cands = [];
    const camPos = camera.position;
    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const fx = fwd.x, fz = fwd.z;
    for (const it of labels) {
      const l = it.l;
      const dx = l.x - camPos.x, dz = l.z - camPos.z;
      const d = Math.hypot(dx, dz);
      if (d > l.r) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.18) continue;
      cands.push({ it, d });
    }
    cands.sort((a, b) => a.d - b.d);
    const show = new Set(cands.slice(0, 2).map(c => c.it));
    const used = [];

    camera.updateMatrixWorld();
    for (const it of labels) {
      const l = it.l;
      if (!show.has(it)) { setLabel(it, false); continue; }
      proj.set(l.x, l.h * 0.82, l.z);
      camSpace.copy(proj).applyMatrix4(camera.matrixWorldInverse);
      if (camSpace.z > -4) { setLabel(it, false); continue; }
      proj.project(camera);
      let sx = (proj.x * .5 + .5) * w;
      let sy = (-proj.y * .5 + .5) * h;
      if (sx < 36 || sx > w - 36 || sy < 40 || sy > h - 20) { setLabel(it, false); continue; }

      const side = sx < w * 0.5 ? -1 : 1;
      let ox = sx + side * 96;
      let oy = sy - 78;
      // 简单避让
      for (const u of used) {
        if (Math.abs(u.x - ox) < 190 && Math.abs(u.y - oy) < 70) oy -= 74;
      }
      used.push({ x: ox, y: oy });
      ox = Math.max(110, Math.min(w - 110, ox));
      oy = Math.max(86, oy);

      const cardW = it.card.offsetWidth || 140;
      const cardH = it.card.offsetHeight || 52;
      const left = ox - cardW / 2, top = oy - cardH;
      it.el.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
      it.k.textContent = Math.round(it._d || 0) + ' M';
      it._d = Math.hypot(l.x - camPos.x, l.z - camPos.z);
      it.k.textContent = Math.round(it._d) + ' M';

      // 引线从卡片底边指向地标锚点
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
  H.drawMinimap = function (boat, nextGate) {
    const cv = $('minimap');
    if (!cv || !staticMap) return;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 296, 296);
    g.drawImage(staticMap, 0, 0);
    if (nextGate && mapBounds) {
      const X = mapBounds.X, Y = mapBounds.Y;
      g.strokeStyle = 'rgba(232,180,106,.9)'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(X(nextGate.x), Y(nextGate.z), 6, 0, 7); g.stroke();
    }
    if (boat && mapBounds) {
      const X = mapBounds.X, Y = mapBounds.Y;
      const x = X(boat.x), y = Y(boat.z);
      // 视锥
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

  H.showLoading = function (show) { $('loading').classList.toggle('hide', !show); };
  H.loading = function (msg, pct) {
    $('lmsg').textContent = msg;
    $('lbar').style.width = pct + '%';
  };

  H.onStart = fn => $('startbtn').addEventListener('click', fn);
  H.onAgain = fn => $('againbtn').addEventListener('click', fn);
  H.onBack = fn => $('backbtn').addEventListener('click', fn);
  H.onMute = fn => $('mute').addEventListener('click', fn);
  H.setMute = muted => $('mute').textContent = muted ? '音效 关' : '音效 开';

  return H;
})();
