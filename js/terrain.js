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
    /* 拱桥优先判定：拱洞正中可过（必须早于岛屿/堤身判定——岛屿多边形在断口处有方形端头，
       会把拱洞下半截算成陆地，船就被"看不见的岸"挡住） */
    const brs = window.__BRIDGES;
    if (brs && brs.length) {
      for (let i = 0; i < brs.length; i++) {
        const b = brs[i];
        const dx = x - b.x, dz = z - b.z;
        const rr = b.span;                              // 捕获半径放大到整个拱跨
        if (dx * dx + dz * dz > rr * rr) continue;
        const u = dx * b.ux + dz * b.uz;                 // 沿堤方向
        const v = -dx * b.uz + dz * b.ux;                // 穿桥方向
        /* v2：拱洞通道加宽 + 进出口延长
           拱洞净宽取 0.46 倍拱跨（原 0.38 太窄，船头前探 3.4m 一歪就蹭桥台），
           进出口沿桥轴延长到堤身进深 + 14m，让"接近—穿洞—出洞"整段都在通道里，
           这样过桥既不需要限速，也不会被桥台判定成撞墙。 */
        const halfClear = b.span * 0.46;
        if (b.ax) {
          /* 旋转 90° 的桥：拱洞轴线沿 u（顺堤），净宽沿 v —— 两个轴对调判定 */
          const uIn = Math.abs(u) < b.width * 0.5 + 14;
          if (Math.abs(v) < halfClear && uIn) return true;
          if (Math.abs(v) >= halfClear && Math.abs(v) < halfClear + 2.2 && uIn) return false;
        } else {
          const vIn = Math.abs(v) < b.width * 0.5 + 14;
          if (Math.abs(u) < halfClear && vIn) return true; // 拱洞正中：可穿
          // 桥台一带（拱洞两侧、桥身进深内）不可穿；注意不能连带封住隧道进出口
          if (Math.abs(u) >= halfClear && Math.abs(u) < halfClear + 2.2 && vIn) return false;
        }
      }
    }
    for (let i = 0; i < course.islands.length; i++) if (U.pointInRing(x, z, course.islands[i])) return false;
    const ex = course.extraIslands || [];
    for (let i = 0; i < ex.length; i++) if (Math.hypot(x - ex[i].p[0], z - ex[i].p[1]) < ex[i].r + 2) return false;
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
      tmpC.copy(cGrass).lerp(cGrass2, U.fbm(x * 0.014, z * 0.014, 3));   // 平滑色变（逐格 hash 会产生大块三角色斑）
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

    /* ---------------- 近景地面细节贴片（v2.2 岸上建模修复） ----------------
       基础地形 20m 一格，第一人称上岸低头看是几个巨大三角面，且脚踩的是
       heightAt 的解析高程、与"眼睛看到的网格插值面"不是同一个面（会浮空/陷地）。
       这里：
         1) T.meshHeightAt() —— 按网格两三角面精确插值，给出"看到的那个面"的高度；
         2) 玩家脚下 66m×66m、1.5m 一格的高密度贴片，高度取解析高程并叠一点起伏，
            最外一圈渐混到 meshHeightAt，保证与外围地形严丝合缝不裂缝。 */
    T.meshHeightAt = function (x, z) {
      const fx = (x - X0) / stepX, fz = (z - Z0) / stepZ;
      const i = UTIL.clamp(Math.floor(fx), 0, nx - 2), j = UTIL.clamp(Math.floor(fz), 0, nz - 2);
      const u = UTIL.clamp(fx - i, 0, 1), v = UTIL.clamp(fz - j, 0, 1);
      const h00 = H[j * nx + i], h10 = H[j * nx + i + 1];
      const h01 = H[(j + 1) * nx + i], h11 = H[(j + 1) * nx + i + 1];
      /* 与索引顺序一致：三角 (a,c,b) 与 (b,c,d)，沿 b—c 对角线切分 */
      if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
      return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
    };

    const DN = 45, DSZ = 66, DCELL = DSZ / (DN - 1);
    const dPos = new Float32Array(DN * DN * 3);
    const dCol = new Float32Array(DN * DN * 3);
    const dUv = new Float32Array(DN * DN * 2);
    const dIdx = [];
    for (let j = 0; j < DN - 1; j++) {
      for (let i = 0; i < DN - 1; i++) {
        const a = j * DN + i, b = a + 1, c5 = a + DN, d5 = c5 + 1;
        dIdx.push(a, c5, b, b, c5, d5);
      }
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
    dGeo.setAttribute('uv', new THREE.BufferAttribute(dUv, 2));
    dGeo.setIndex(dIdx);
    const dMesh = new THREE.Mesh(dGeo, new THREE.MeshLambertMaterial({
      vertexColors: true, map: groundTex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
    }));
    dMesh.frustumCulled = false;
    dMesh.visible = false;
    dMesh.renderOrder = 1;
    dMesh.receiveShadow = !!tier.shadow;
    dMesh.layers.enable(1);
    scene.add(dMesh);
    T.detailMesh = dMesh;
    let dAt = { x: 1e9, z: 1e9 };

    T.detailVisible = function (on) {
      dMesh.visible = !!on;
      if (!on) dAt.x = 1e9;
    };
    /* 以 (x,z) 为中心重建贴片顶点；移动不足 2.5m 时直接跳过（避免每帧重算） */
    T.updateDetail = function (x, z, force) {
      if (!dMesh.visible) return;
      const dx = x - dAt.x, dz = z - dAt.z;
      if (!force && dx * dx + dz * dz < 6.25) return;
      dAt.x = x; dAt.z = z;
      const half = DSZ / 2;
      const edge = DN * 0.20;
      const tmp = new THREE.Color();
      for (let j = 0; j < DN; j++) {
        for (let i = 0; i < DN; i++) {
          const wx = x - half + i * DCELL, wz = z - half + j * DCELL;
          const k = j * DN + i;
          const e = UTIL.smoothstep(0, 1, UTIL.clamp(Math.min(Math.min(i, DN - 1 - i), Math.min(j, DN - 1 - j)) / edge, 0, 1));
          const hm = T.meshHeightAt(wx, wz);
          const hd = T.heightAt(wx, wz) + (U.noise2(wx * 0.31, wz * 0.31) - 0.5) * 0.055;
          const h = hm + (hd - hm) * e + 0.022;
          dPos[k * 3] = wx; dPos[k * 3 + 1] = h; dPos[k * 3 + 2] = wz;
          dUv[k * 2] = wx / 42; dUv[k * 2 + 1] = wz / 42;
          tmp.copy(cGrass).lerp(cGrass2, U.fbm(wx * 0.014, wz * 0.014, 3));
          tmp.lerp(cRock, UTIL.smoothstep(12, 60, h) * 0.35);
          tmp.multiplyScalar((0.9 + U.noise2(wx * 0.02, wz * 0.02) * 0.2) * (0.94 + U.noise2(wx * 0.09, wz * 0.09) * 0.12));
          dCol[k * 3] = tmp.r; dCol[k * 3 + 1] = tmp.g; dCol[k * 3 + 2] = tmp.b;
        }
      }
      dGeo.attributes.position.needsUpdate = true;
      dGeo.attributes.uv.needsUpdate = true;
      dGeo.attributes.color.needsUpdate = true;
      dGeo.computeVertexNormals();
      dGeo.computeBoundingSphere();
    };

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
      /* v2.2：裙边只保留水线到岸内 7m 的石驳岸带。
         原来铺到 40m 内，与地形大面片几乎共面 → 大面积 z-fighting，
         上岸后是一整片忽明忽暗的暗色三角（"地面建模坏了"的元凶）。
         现在收窄 + 正方偏移（让地形在共面处胜出），只留水边一道石砌驳岸。 */
      const offs = [0, 3.5, 7];
      const ringsP = offs.map(o => pts.map(p => ({ x: p.x + p.nx * o, z: p.z + p.nz * o })));
      const ringsY = ringsP.map((rp, k) => rp.map(p => k === 0 ? 1.42 : T.heightAt(p.x, p.z)));
      const layerShade = [0.58, 0.76, 0.96];   // 立面明暗：水线暗、坡顶亮
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
      const skirtMesh = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({
        map: groundTex, vertexColors: true, side: THREE.DoubleSide, color: 0xbcc4a0,
        polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4
      }));
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
