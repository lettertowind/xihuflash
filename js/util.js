/* 程序化贴图与通用工具：不依赖任何外部图片，file:// 直接可用 */
(function () {
  const U = {};

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = t => t * t * (3 - 2 * t);

  let seed = 20261018;
  U.rand = function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  U.canvas = function (w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  };

  U.tex = function (canvas, repeat, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.encoding = srgb === false ? THREE.LinearEncoding : THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
    return t;
  };

  /* ---------- 水面法线（可平铺） ---------- */
  U.waterNormal = function (size) {
    size = size || 256;
    const c = U.canvas(size, size), ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const waves = [];
    for (let i = 0; i < 9; i++) {
      waves.push({
        fx: 1 + Math.floor(U.rand() * 5),
        fy: 1 + Math.floor(U.rand() * 5),
        p: U.rand() * 6.28,
        a: 0.55 / (1 + i * 0.55)
      });
    }
    const H = (u, v) => {
      let h = 0;
      for (const w of waves) h += Math.sin((u * w.fx + v * w.fy) * 6.283 + w.p) * w.a;
      return h;
    };
    const S = 0.55;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, e = 1 / size;
        const dx = (H(u + e, v) - H(u - e, v)) * S;
        const dy = (H(u, v + e) - H(u, v - e)) * S;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return U.tex(c, null, false);
  };

  /* ---------- 石岸 ---------- */
  U.stone = function () {
    const s = 256, c = U.canvas(s, s), ctx = c.getContext('2d');
    ctx.fillStyle = '#8d8474'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const g = 120 + U.rand() * 70;
      ctx.fillStyle = 'rgba(' + (g * 1.03) + ',' + g + ',' + (g * 0.9) + ',' + (0.05 + U.rand() * 0.16) + ')';
      const r = 1 + U.rand() * 3.5;
      ctx.beginPath(); ctx.arc(U.rand() * s, U.rand() * s, r, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(70,64,54,.35)'; ctx.lineWidth = 1.4;
    for (let y = 32; y < s; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y + U.rand() * 2); ctx.lineTo(s, y + U.rand() * 2); ctx.stroke();
      for (let x = 0; x < s; x += 44) {
        ctx.beginPath(); ctx.moveTo(x + U.rand() * 6, y); ctx.lineTo(x + U.rand() * 6, y + 32); ctx.stroke();
      }
    }
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,250,235,.10)'); g.addColorStop(1, 'rgba(30,40,30,.16)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    return U.tex(c);
  };

  /* ---------- 草地 ---------- */
  U.grass = function () {
    const s = 256, c = U.canvas(s, s), ctx = c.getContext('2d');
    ctx.fillStyle = '#4e5f3a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5200; i++) {
      const t = U.rand();
      ctx.fillStyle = 'rgba(' + (58 + t * 52) + ',' + (76 + t * 54) + ',' + (40 + t * 26) + ',' + (0.10 + U.rand() * 0.3) + ')';
      ctx.fillRect(U.rand() * s, U.rand() * s, 1 + U.rand() * 2, 2 + U.rand() * 5);
    }
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = 'rgba(' + (96 + U.rand() * 40) + ',' + (90 + U.rand() * 30) + ',' + (52 + U.rand() * 20) + ',.28)';
      ctx.beginPath(); ctx.arc(U.rand() * s, U.rand() * s, 2 + U.rand() * 8, 0, 7); ctx.fill();
    }
    return U.tex(c);
  };

  /* ---------- 树（带 alpha） ---------- */
  U.tree = function (kind) {
    const S = 256, c = U.canvas(S, S), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    // 树干
    ctx.strokeStyle = '#3b2c1e'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(S * .5, S);
    ctx.quadraticCurveTo(S * .49, S * .74, S * .5, S * .56);
    ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = 'rgba(74,58,40,.9)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(S * .5, S * .58); ctx.lineTo(S * .36, S * .46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S * .5, S * .58); ctx.lineTo(S * .65, S * .48); ctx.stroke();

    if (kind === 'willow') {
      // 柳条
      for (let i = 0; i < 150; i++) {
        const x0 = S * .5 + (U.rand() - .5) * 120;
        const y0 = S * .22 + U.rand() * 70;
        const x1 = x0 + (U.rand() - .5) * 90;
        const y1 = y0 + 60 + U.rand() * 110;
        ctx.strokeStyle = 'rgba(' + (86 + U.rand() * 34) + ',' + (116 + U.rand() * 32) + ',' + (54 + U.rand() * 20) + ',' + (.35 + U.rand() * .35) + ')';
        ctx.lineWidth = .7 + U.rand() * .9;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + (U.rand() - .5) * 26, (y0 + y1) / 2, x1, y1);
        ctx.stroke();
      }
      // 叶点
      for (let i = 0; i < 320; i++) {
        const a = U.rand() * 6.283, r = Math.pow(U.rand(), .6) * 92;
        const x = S * .5 + Math.cos(a) * r * 1.1;
        const y = S * .34 + Math.sin(a) * r * .7;
        const g = 78 + U.rand() * 48;
        ctx.fillStyle = 'rgba(' + (g * .72) + ',' + g + ',' + (g * .52) + ',' + (.30 + U.rand() * .45) + ')';
        ctx.beginPath(); ctx.ellipse(x, y, 1.4 + U.rand() * 2.6, 1 + U.rand() * 1.8, U.rand() * 3, 0, 7); ctx.fill();
      }
    } else {
      // 香樟：密集小叶团
      for (let i = 0; i < 520; i++) {
        const a = U.rand() * 6.283;
        const r = Math.pow(U.rand(), .55) * 94;
        const x = S * .5 + Math.cos(a) * r * 1.08;
        const y = S * .36 + Math.sin(a) * r * .74;
        const g = 54 + U.rand() * 54;
        const rr = g * (.52 + U.rand() * .18);
        ctx.fillStyle = 'rgba(' + rr + ',' + g + ',' + (rr * .78) + ',' + (.32 + U.rand() * .5) + ')';
        ctx.beginPath(); ctx.arc(x, y, 2 + U.rand() * 5.5, 0, 7); ctx.fill();
      }
      // 受光面
      for (let i = 0; i < 120; i++) {
        const a = -0.9 + U.rand() * 1.8, r = Math.pow(U.rand(), .7) * 80;
        const x = S * .5 + Math.cos(a) * r, y = S * .34 + Math.sin(a) * r * .7;
        ctx.fillStyle = 'rgba(' + (96 + U.rand() * 40) + ',' + (128 + U.rand() * 34) + ',' + (62 + U.rand() * 20) + ',.35)';
        ctx.beginPath(); ctx.arc(x, y, 2 + U.rand() * 5, 0, 7); ctx.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4; t.encoding = THREE.sRGBEncoding;
    return t;
  };

  /* ---------- 荷叶 ---------- */
  U.lotus = function () {
    const s = 128, c = U.canvas(s, s), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 9; i++) {
      const x = 10 + U.rand() * 108, y = 10 + U.rand() * 108, r = 12 + U.rand() * 20;
      ctx.fillStyle = 'rgba(' + (46 + U.rand() * 30) + ',' + (86 + U.rand() * 34) + ',' + (52 + U.rand() * 20) + ',.92)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(30,58,34,.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r * .82, 0, 7); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.encoding = THREE.sRGBEncoding;
    return t;
  };

  /* ---------- 云 ---------- */
  U.cloud = function () {
    const s = 256, c = U.canvas(s, s), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 34; i++) {
      const x = s * .18 + U.rand() * s * .64;
      const y = s * .38 + U.rand() * s * .26;
      const r = 18 + U.rand() * 52;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(255,248,236,.34)');
      g.addColorStop(.6, 'rgba(255,242,226,.15)');
      g.addColorStop(1, 'rgba(255,240,225,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return t;
  };

  /* ---------- 楼窗 ---------- */
  U.windows = function () {
    const s = 128, c = U.canvas(s, s), ctx = c.getContext('2d');
    ctx.fillStyle = '#5d6b75'; ctx.fillRect(0, 0, s, s);
    for (let y = 4; y < s; y += 9) for (let x = 4; x < s; x += 8) {
      const on = U.rand() > .45;
      ctx.fillStyle = on ? 'rgba(255,214,150,' + (.35 + U.rand() * .5) + ')' : 'rgba(40,52,62,.75)';
      ctx.fillRect(x, y, 4, 5);
    }
    return U.tex(c);
  };

  /* ---------- 木甲板 ---------- */
  U.wood = function () {
    const s = 256, c = U.canvas(s, s), ctx = c.getContext('2d');
    ctx.fillStyle = '#7a5231'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) {
      const y = i * 32;
      ctx.fillStyle = 'rgba(' + (92 + U.rand() * 26) + ',' + (62 + U.rand() * 20) + ',' + (36 + U.rand() * 12) + ',.5)';
      ctx.fillRect(0, y + 1, s, 30);
      ctx.strokeStyle = 'rgba(40,26,16,.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
      for (let k = 0; k < 26; k++) {
        ctx.strokeStyle = 'rgba(60,38,22,' + (.05 + U.rand() * .13) + ')';
        ctx.beginPath();
        const yy = y + 4 + U.rand() * 24;
        ctx.moveTo(0, yy); ctx.bezierCurveTo(s * .3, yy + 2, s * .6, yy - 2, s, yy); ctx.stroke();
      }
    }
    return U.tex(c);
  };

  /* ---------- 水花 ---------- */
  U.spray = function () {
    const s = 64, c = U.canvas(s, s), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(.35, 'rgba(240,250,255,.55)');
    g.addColorStop(1, 'rgba(230,245,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c); return t;
  };

  /* ---------- 岸边遮罩（给水面浪花用） ---------- */
  U.shoreMask = function (course) {
    const N = 1024;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    course.water.forEach(p => {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
    });
    const pad = 200;
    minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
    const span = Math.max(maxX - minX, maxZ - minZ);
    const sx = (maxX - minX) / span * N, sz = (maxZ - minZ) / span * N;

    const c = U.canvas(N, N), ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, N, N);
    const X = x => (x - minX) / span * N;
    const Y = z => (z - minZ) / span * N;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    course.water.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])));
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#000';
    const punch = ring => {
      ctx.beginPath();
      ring.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])));
      ctx.closePath(); ctx.fill();
    };
    course.islands.forEach(punch);

    const blur = U.canvas(N, N), bctx = blur.getContext('2d');
    bctx.filter = 'blur(7px)';
    bctx.drawImage(c, 0, 0);
    bctx.filter = 'none';
    const t = new THREE.CanvasTexture(blur);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return { tex: t, minX, minZ, span };
  };

  window.UTIL = U;
})();
