/* 地形：湖岸 SDF、真实山体高度场、岸线裙边、石驳岸、堤坝 */
window.Terrain = (function () {
  const T = {};
  const CFGT = CFG.terrain;
  const X0 = CFGT.minX, X1 = CFGT.maxX, Z0 = CFGT.minZ, Z1 = CFGT.maxZ;

  let course = null;
  let sdf = null, sdfSize = 1024, sdfX0 = -3400, sdfZ0 = -3200, sdfSpan = 6400, sdfCell = 6.25;
  let cwMask = null;

  const PEAKS = [
    { x: -40, z: -1720, h: 88, rx: 420, rz: 260, a: 0.26 },    // 宝石山
    { x: -300, z: -1080, h: 38, rx: 380, rz: 220, a: 0 },      // 孤山
    { x: -2450, z: -1350, h: 300, rx: 1100, rz: 800, a: 0.44 },// 北高峰
    { x: -1750, z: 1550, h: 240, rx: 900, rz: 700, a: -0.35 }, // 南高峰
    { x: 0, z: 1230, h: 48, rx: 380, rz: 300, a: 0 },          // 夕照山
    { x: 2020, z: 780, h: 92, rx: 700, rz: 480, a: 0.17 },     // 吴山
    { x: 650, z: 2150, h: 190, rx: 900, rz: 650, a: -0.26 },   // 玉皇山
    { x: -1200, z: 2700, h: 280, rx: 1200, rz: 900, a: 0 }     // 五云山
  ];
  const FLATS = [
    { x: -10, z: -1636, h: 72, r: 30, blend: 46 },   // 保俶塔平台
    { x: 1, z: 1229, h: 46, r: 36, blend: 56 },      // 雷峰塔平台
    { x: 2020, z: 774, h: 90, r: 46, blend: 64 },    // 城隍阁平台
    { x: -508, z: -395, h: 2.6, r: 40, blend: 26 },  // 湖心亭岛
    { x: -790, z: -421, h: 2.2, r: 30, blend: 22 },  // 阮公墩
    { x: -432, z: 418, h: 2.4, r: 62, blend: 44 },   // 小瀛洲
    { x: -289, z: -1083, h: 4.5, r: 40, blend: 40 }  // 孤山南麓平台
  ];
  T.peaks = PEAKS;

  /* ---------------- SDF ---------------- */
  function buildSDF() {
    sdfSize = CFGT.sdfSize;
    sdfCell = sdfSpan / sdfSize;
    const c = UTIL.canvas(sdfSize, sdfSize), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, sdfSize, sdfSize);
    const px = x => (x - sdfX0) / sdfCell, pz = z => (z - sdfZ0) / sdfCell;
    const poly = ring => {
      g.beginPath();
      ring.forEach((p, i) => i ? g.lineTo(px(p[0]), pz(p[1])) : g.moveTo(px(p[0]), pz(p[1])));
      g.closePath(); g.fill();
    };
    g.fillStyle = '#fff';
    poly(course.water);
    g.fillStyle = '#000';
    course.islands.forEach(poly);
    (course.extraIslands || []).forEach(o => {
      g.beginPath();
      g.arc(px(o.p[0]), pz(o.p[1]), o.r / sdfCell, 0, 6.283);
      g.fill();
    });

    // 堤坝掩码（高度场用：堤顶视为陆地平台）
    const cwm = UTIL.canvas(sdfSize, sdfSize), wg = cwm.getContext('2d');
    wg.fillStyle = '#000'; wg.fillRect(0, 0, sdfSize, sdfSize);
    wg.strokeStyle = '#fff';
    wg.lineCap = 'round';
    for (const nm in course.causeways) {
      const half = (nm === '杨公堤' ? 11 : 9.5);
      wg.lineWidth = half * 2 / sdfCell;
      for (const line of course.causeways[nm]) {
        wg.beginPath();
        line.forEach((p, i) => i ? wg.lineTo(px(p[0]), pz(p[1])) : wg.moveTo(px(p[0]), pz(p[1])));
        wg.stroke();
      }
    }
    const wimg = wg.getImageData(0, 0, sdfSize, sdfSize).data;
    cwMask = new Uint8Array(sdfSize * sdfSize);
    for (let i = 0; i < cwMask.length; i++) cwMask[i] = wimg[i * 4] > 127 ? 1 : 0;
    const img = g.getImageData(0, 0, sdfSize, sdfSize).data;
    const inside = new Uint8Array(sdfSize * sdfSize);
    for (let i = 0; i < inside.length; i++) inside[i] = img[i * 4] > 127 ? 1 : 0;

    const N = sdfSize * sdfSize;
    const dist = new Float32Array(N);
    const INF = 1e7;
    for (let i = 0; i < N; i++) dist[i] = INF;
    for (let y = 0; y < sdfSize; y++) {
      for (let x = 0; x < sdfSize; x++) {
        const i = y * sdfSize + x, a = inside[i];
        if ((x < sdfSize - 1 && inside[i + 1] !== a) || (y < sdfSize - 1 && inside[i + sdfSize] !== a)) dist[i] = 0;
      }
    }
    for (let y = 0; y < sdfSize; y++) {
      for (let x = 0; x < sdfSize; x++) {
        const i = y * sdfSize + x;
        let d = dist[i];
        if (d === 0) continue;
        if (x > 0) d = Math.min(d, dist[i - 1] + 1);
        if (y > 0) {
          d = Math.min(d, dist[i - sdfSize] + 1);
          if (x > 0) d = Math.min(d, dist[i - sdfSize - 1] + 1.4142);
          if (x < sdfSize - 1) d = Math.min(d, dist[i - sdfSize + 1] + 1.4142);
        }
        dist[i] = d;
      }
    }
    for (let y = sdfSize - 1; y >= 0; y--) {
      for (let x = sdfSize - 1; x >= 0; x--) {
        const i = y * sdfSize + x;
        let d = dist[i];
        if (x < sdfSize - 1) d = Math.min(d, dist[i + 1] + 1);
        if (y < sdfSize - 1) {
          d = Math.min(d, dist[i + sdfSize] + 1);
          if (x < sdfSize - 1) d = Math.min(d, dist[i + sdfSize + 1] + 1.4142);
          if (x > 0) d = Math.min(d, dist[i + sdfSize - 1] + 1.4142);
        }
        dist[i] = d;
      }
    }
    sdf = new Float32Array(N);
    for (let i = 0; i < N; i++) sdf[i] = (inside[i] ? -1 : 1) * Math.min(dist[i], 400) * sdfCell;
  }

  T.shoreDist = function (x, z) {
    if (!sdf) return 100;
    const gx = (x - sdfX0) / sdfCell, gz = (z - sdfZ0) / sdfCell;
    if (gx < 0 || gz < 0 || gx >= sdfSize - 1 || gz >= sdfSize - 1) return 600;
    const ix = gx | 0, iz = gz | 0;
    const fx = gx - ix, fz = gz - iz;
    const i = iz * sdfSize + ix;
    const a = sdf[i], b = sdf[i + 1], c2 = sdf[i + sdfSize], d = sdf[i + sdfSize + 1];
    return UTIL.lerp(UTIL.lerp(a, b, fx), UTIL.lerp(c2, d, fx), fz);
  };

  T.isLand = function (x, z) { return T.shoreDist(x, z) > 0; };

  /* 精确（多边形级）岸距：陆地正、水面负。远离岸线时走 SDF 快速路径 */
  T.exactShoreDist = function (x, z) {
    const U = UTIL;
    const approx = T.shoreDist(x, z);
    if (Math.abs(approx) > 9) return approx;
    if (!U.pointInRing(x, z, course.water)) return U.ringDist(x, z, course.water);
    for (const r of course.islands) if (U.pointInRing(x, z, r)) return U.ringDist(x, z, r);
    for (const isl of (course.extraIslands || [])) {
      const d = Math.hypot(x - isl.p[0], z - isl.p[1]) - isl.r;
      if (d < 0) return -d;
    }
    return -U.ringDist(x, z, course.water);
  };

  /* ---------------- 高度场 ---------------- */
  T.onCauseway = function (x, z) {
    if (!cwMask) return false;
    const gx = (x - sdfX0) / sdfCell | 0, gz = (z - sdfZ0) / sdfCell | 0;
    if (gx < 0 || gz < 0 || gx >= sdfSize || gz >= sdfSize) return false;
    return cwMask[gz * sdfSize + gx] === 1;
  };
  T.heightAt = function (x, z) {
    if (T.onCauseway(x, z)) return 1.78;
    const d = T.shoreDist(x, z);
    if (d < 0.5) return -4.5;
    let h = d < 130 ? 1.5 + UTIL.smoothstep(0, 20, d) * 2.4 : 3.9;
    const inland = UTIL.smoothstep(30, 260, d);
    if (inland > 0) h += (UTIL.fbm(x * 0.0035, z * 0.0035, 4) - 0.5) * 7.5 * inland;
    const ramp = UTIL.smoothstep(0, 85, d);   // 离岸渐升：山峰从水边缓缓起坡，杜绝崖壁
    for (let k = 0; k < PEAKS.length; k++) {
      const p = PEAKS[k];
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > (p.rx * p.rx + p.rz * p.rz) * 2.6) continue;
      const ca = Math.cos(p.a), sa = Math.sin(p.a);
      const u = (dx * ca + dz * sa) / p.rx, v = (-dx * sa + dz * ca) / p.rz;
      const g = Math.exp(-(u * u + v * v) * 0.5);
      if (g > 0.004) h += p.h * g * ramp * (0.82 + 0.18 * (UTIL.fbm(x * 0.004 + k * 17.3, z * 0.004 - k * 9.1, 3) * 2 - 1));
    }
    for (let k = 0; k < FLATS.length; k++) {
      const f = FLATS[k];
      const dd = Math.hypot(x - f.x, z - f.z);
      if (dd > f.r + f.blend) continue;
      let kk = 1 - UTIL.smoothstep(f.r, f.r + f.blend, dd);
      if (f.h > 6) kk *= ramp;   // 高台（塔/阁）同样从岸边渐升
      h = UTIL.lerp(h, f.h, kk);
    }
    return Math.max(-4.5, h);
  };

  /* ---------------- 可航行判定 ---------------- */
  T.navigable = function (x, z) {
    const U = UTIL;
    if (!U.pointInRing(x, z, course.water)) return false;
    for (let i = 0; i < course.islands.length; i++) if (U.pointInRing(x, z, course.islands[i])) return false;
    const ex = course.extraIslands || [];
    for (let i = 0; i < ex.length; i++) if (Math.hypot(x - ex[i].p[0], z - ex[i].p[1]) < ex[i].r + 2) return false;
    const br = course.bridges;
    for (let i = 0; i < br.length; i++) if (Math.hypot(x - br[i].x, z - br[i].z) < br[i].r) return true;
    for (const nm in course.causeways) {
      const half = (nm === '杨公堤' ? 11 : 9.5) + 2.4;
      const lines = course.causeways[nm];
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        for (let i = 1; i < line.length; i++) if (U.segDist(x, z, line[i - 1], line[i]) < half) return false;
      }
    }
    return true;
  };

  /* ---------------- 场景构建 ---------------- */
  T.build = function (scene, c, tier) {
    course = c;
    const U = UTIL;
    buildSDF();

    const n = tier.terrain;
    const stepX = (X1 - X0) / n, stepZ = (Z1 - Z0) / n;
    const nx = n + 1, nz = n + 1;
    const H = new Float32Array(nx * nz);
    const D = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = X0 + i * stepX, z = Z0 + j * stepZ;
        const idx = j * nx + i;
        D[idx] = T.shoreDist(x, z);
        H[idx] = D[idx] < 0.5 ? -4.5 : T.heightAt(x, z);
      }
    }
    const groundTex = Textures.get('ground');
    const pos = [], uv = [], col = [], idx = [];
    const cGrass = new THREE.Color(0x5d7050), cGrass2 = new THREE.Color(0x6d7d58);
    const cRock = new THREE.Color(0x84887e), cDark = new THREE.Color(0x44523d), cBed = new THREE.Color(0x2c3a33);
    const tmpC = new THREE.Color();
    function vertColor(i, x, z) {
      const h = H[i];
      if (h < -1) return tmpC.copy(cBed);
      const gx = ((i + 1 < H.length ? H[i + 1] : h) - (i - 1 >= 0 ? H[i - 1] : h)) / (2 * stepX);
      const gz = ((i + nx < H.length ? H[i + nx] : h) - (i - nx >= 0 ? H[i - nx] : h)) / (2 * stepZ);
      const slope = Math.min(1, Math.hypot(gx, gz) * 1.4);
      tmpC.copy(cGrass).lerp(cGrass2, U.hash2(x * 0.13 | 0, z * 0.13 | 0));
      tmpC.lerp(cRock, UTIL.smoothstep(12, 60, h) * (0.35 + 0.65 * slope));
      tmpC.lerp(cDark, UTIL.smoothstep(150, 320, h) * 0.5);
      tmpC.multiplyScalar((0.9 + U.noise2(x * 0.02, z * 0.02) * 0.2) * (0.92 + U.noise2(x * 0.09, z * 0.09) * 0.16));
      return tmpC;
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const idx2 = j * nx + i;
        const x = X0 + i * stepX, z = Z0 + j * stepZ;
        pos.push(x, H[idx2], z);
        uv.push(x / 42, z / 42);
        const cc = vertColor(idx2, x, z);
        col.push(cc.r, cc.g, cc.b);
      }
    }
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c3 = a + nx, d3 = c3 + 1;
        // 全格渲染（水密，杜绝岸边带破洞）；湖床深处与陆地同样保留
        idx.push(a, c3, b, b, c3, d3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex }));
    terrain.receiveShadow = !!tier.shadow;
    terrain.layers.enable(1);
    scene.add(terrain);
    T.mesh = terrain;

    /* ---- 岸线裙边 + 石驳岸 ---- */
    const stoneTex = Textures.get('stone');
    function resample(ring, step) {
      const out = [];
      let acc = 0;
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-6) continue;
        const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
        let t = step - acc;
        while (t <= L) {
          out.push({ x: a[0] + ux * t, z: a[1] + uz * t, tx: ux, tz: uz });
          acc = 0;
          t += step;
        }
        acc += L - (t - step);
      }
      return out;
    }
    function skirt(ring) {
      const pts = resample(ring, 7);
      if (pts.length < 4) return;
      // 法线指向陆地
      for (const p of pts) {
        const nx = -p.tz, nz = p.tx;
        const dPlus = T.shoreDist(p.x + nx * 4, p.z + nz * 4);
        const dMinus = T.shoreDist(p.x - nx * 4, p.z - nz * 4);
        if (dPlus < dMinus) { p.nx = -nx; p.nz = -nz; } else { p.nx = nx; p.nz = nz; }
      }
      const offs = [0, 4, 9, 16, 26, 40];
      const ringsP = offs.map(o => pts.map(p => ({ x: p.x + p.nx * o, z: p.z + p.nz * o })));
      const ringsY = ringsP.map((rp, k) => rp.map(p => k === 0 ? 1.42 : T.heightAt(p.x, p.z)));
      const layerShade = [0.5, 0.63, 0.75, 0.85, 0.93, 1.0];   // 立面明暗：水线暗、坡顶亮
      const vpos = [], vcol = [], vuv = [], vidx = [];
      for (let k = 0; k < offs.length - 1; k++) {
        const base = vpos.length / 3;
        for (let i = 0; i < pts.length; i++) {
          vpos.push(ringsP[k][i].x, ringsY[k][i], ringsP[k][i].z);
          {
            const y = ringsY[k][i];
            const hk = UTIL.clamp((y - 2) / 30, 0, 1);      // 低处草绿 → 高处林绿
            const nzv = 0.82 + U.noise2(ringsP[k][i].x * 0.06, ringsP[k][i].z * 0.06) * 0.36;
            const sh = layerShade[k] * (0.9 + 0.1 * hk) * nzv;
            vcol.push(sh * (0.72 - 0.16 * hk), sh * (0.84 - 0.08 * hk), sh * (0.58 - 0.12 * hk));
          }
          vpos.push(ringsP[k + 1][i].x, ringsY[k + 1][i], ringsP[k + 1][i].z);
          {
            const y = ringsY[k + 1][i];
            const hk = UTIL.clamp((y - 2) / 30, 0, 1);
            const nzv = 0.82 + U.noise2(ringsP[k + 1][i].x * 0.06, ringsP[k + 1][i].z * 0.06) * 0.36;
            const sh = layerShade[k + 1] * (0.9 + 0.1 * hk) * nzv;
            vcol.push(sh * (0.72 - 0.16 * hk), sh * (0.84 - 0.08 * hk), sh * (0.58 - 0.12 * hk));
          }
          vuv.push(i * 0.08, k * 0.4, i * 0.08, k * 0.4 + 0.4);
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const a = base + i * 2, b = a + 1, c4 = a + 2, d4 = a + 3;
          vidx.push(a, b, c4, b, d4, c4);
        }
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(vpos, 3));
      sg.setAttribute('color', new THREE.Float32BufferAttribute(vcol, 3));
      sg.setAttribute('uv', new THREE.Float32BufferAttribute(vuv, 2));
      sg.setIndex(vidx);
      sg.computeVertexNormals();
      const skirtMesh = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true, side: THREE.DoubleSide, color: 0xbcc4a0 }));
      skirtMesh.layers.enable(1);
      scene.add(skirtMesh);
    }
    skirt(course.water);
    course.islands.forEach(skirt);

    function bankWall(ring) {
      const pts = resample(ring, 7);
      if (pts.length < 4) return;
      const wpos = [], wuv = [], widx = [];
      let u = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (i > 0) u += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) * 0.12;
        wpos.push(p.x, -1.6, p.z, p.x, 1.42, p.z);
        wuv.push(u, 0, u, 1);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = i * 2, b = a + 1, c6 = a + 2, d6 = a + 3;
        widx.push(a, b, c6, b, d6, c6);
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
      wg.setIndex(widx);
      wg.computeVertexNormals();
      const wm = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: stoneTex, normalMap: Textures.get('stoneNormal'), color: 0x9d9b8e, roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
      wm.layers.enable(1);
      scene.add(wm);
    }
    bankWall(course.water);
    course.islands.forEach(bankWall);
    (course.extraIslands || []).forEach(o => {
      const ring = [];
      for (let i = 0; i < 44; i++) {
        const a = i / 44 * 6.2832;
        ring.push([o.p[0] + Math.cos(a) * o.r, o.p[1] + Math.sin(a) * o.r]);
      }
      ring.push(ring[0]);
      skirt(ring);
      bankWall(ring);
    });

    /* ---- 堤坝 ---- */
    const HALF = { '苏堤': 9.5, '杨公堤': 11, '白堤': 9.5 };
    for (const nm in course.causeways) {
      const half = HALF[nm] || 9.5;
      for (const line of course.causeways[nm]) {
        if (line.length < 2) continue;
        const tpos = [], tuv = [], tidx = [];
        const wpos2 = [], wuv2 = [], widx2 = [];
        let acc = 0;
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1], b = line[i];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const L = Math.hypot(dx, dz) || 1;
          const nx2 = -dz / L * half, nz2 = dx / L * half;
          const base = tpos.length / 3;
          tpos.push(a[0] + nx2, 1.78, a[1] + nz2, a[0] - nx2, 1.78, a[1] - nz2, b[0] - nx2, 1.78, b[1] - nz2, b[0] + nx2, 1.78, b[1] + nz2);
          tuv.push(acc, 0, acc, half / 21, acc + L * 0.05, half / 21, acc + L * 0.05, 0);
          tidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          acc += L * 0.05;
          // 侧墙
          for (const s of [1, -1]) {
            const wb = wpos2.length / 3;
            wpos2.push(a[0] + nx2 * s, -1.5, a[1] + nz2 * s, b[0] + nx2 * s, -1.5, b[1] + nz2 * s, b[0] + nx2 * s, 1.78, b[1] + nz2 * s, a[0] + nx2 * s, 1.78, a[1] + nz2 * s);
            const uu = acc;
            wuv2.push(uu, 0, uu + L * 0.09, 0, uu + L * 0.09, 1, uu, 1);
            widx2.push(wb, wb + 1, wb + 2, wb, wb + 2, wb + 3);
          }
        }
        const tg = new THREE.BufferGeometry();
        tg.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
        tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
        tg.setIndex(tidx); tg.computeVertexNormals();
        const top = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ map: groundTex, color: 0x8fa075 }));
        top.layers.enable(1); scene.add(top);

        const wg2 = new THREE.BufferGeometry();
        wg2.setAttribute('position', new THREE.Float32BufferAttribute(wpos2, 3));
        wg2.setAttribute('uv', new THREE.Float32BufferAttribute(wuv2, 2));
        wg2.setIndex(widx2); wg2.computeVertexNormals();
        const wm2 = new THREE.Mesh(wg2, new THREE.MeshStandardMaterial({ map: stoneTex, normalMap: Textures.get('stoneNormal'), color: 0x9d9b8e, roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
        wm2.layers.enable(1); scene.add(wm2);
      }
    }

    return T;
  };

  T.sdfGrid = function () {
    return { data: sdf, size: sdfSize, x0: sdfX0, z0: sdfZ0, span: sdfSpan, cell: sdfCell };
  };

  return T;
})();
