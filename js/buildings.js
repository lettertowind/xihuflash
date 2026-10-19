/* 中式建筑生成器：曲线屋顶、亭、塔、桥、码头、院墙 */
window.Buildings = (function () {
  const B = {};
  let M = null;

  B.mats = function () {
    if (M) return M;
    const T = Textures;
    M = {
      roof: new THREE.MeshStandardMaterial({ map: T.get('roof'), normalMap: T.get('roofNormal'), color: 0xaeb4b8, roughness: 0.55, metalness: 0.03, envMapIntensity: 0.55, side: THREE.DoubleSide }),
      roofDark: new THREE.MeshStandardMaterial({ map: T.get('roof'), normalMap: T.get('roofNormal'), color: 0x7e8489, roughness: 0.6, metalness: 0.03, envMapIntensity: 0.5, side: THREE.DoubleSide }),
      stone: new THREE.MeshStandardMaterial({ map: T.get('stone'), normalMap: T.get('stoneNormal'), color: 0xa6a496, roughness: 0.58, metalness: 0.02, envMapIntensity: 0.5 }),
      stoneLight: new THREE.MeshStandardMaterial({ map: T.get('stone'), normalMap: T.get('stoneNormal'), color: 0xc9c7ba, roughness: 0.5, metalness: 0.02, envMapIntensity: 0.55 }),
      wood: new THREE.MeshStandardMaterial({ map: T.get('wood'), color: 0x8a6a48, roughness: 0.55, metalness: 0.02, envMapIntensity: 0.4 }),
      woodDark: new THREE.MeshStandardMaterial({ map: T.get('wood'), color: 0x4c3624, roughness: 0.6, envMapIntensity: 0.35 }),
      red: new THREE.MeshStandardMaterial({ color: 0x8d3a2c, roughness: 0.5, envMapIntensity: 0.4 }),
      redDark: new THREE.MeshStandardMaterial({ color: 0x6e2c22, roughness: 0.55 }),
      plaster: new THREE.MeshStandardMaterial({ map: T.get('plaster'), color: 0xd9d6c9, roughness: 0.72, envMapIntensity: 0.3 }),
      brick: new THREE.MeshStandardMaterial({ map: T.get('brick'), color: 0xa79d8b, roughness: 0.62, envMapIntensity: 0.4 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc9973f, roughness: 0.35, metalness: 0.65, envMapIntensity: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x232729, roughness: 0.5 }),
      bamboo: new THREE.MeshStandardMaterial({ map: T.get('bamboo'), color: 0x8f9598, roughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.45 }),
      window: new THREE.MeshStandardMaterial({ map: T.get('windows'), color: 0xcfc4a8, roughness: 0.65, envMapIntensity: 0.3, emissive: 0xffb45e, emissiveMap: T.get('windows'), emissiveIntensity: 0 }),
      latticeIce: new THREE.MeshStandardMaterial({ map: T.get('icelattice'), color: 0xcfc4a8, roughness: 0.7, side: THREE.DoubleSide, emissive: 0xffb45e, emissiveMap: T.get('icelattice'), emissiveIntensity: 0 }),
      awning: new THREE.MeshStandardMaterial({ map: T.get('awning'), color: 0xd8d4c8, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.25 }),
      lantern: new THREE.MeshStandardMaterial({ color: 0x7a2d18, emissive: 0xff9a4a, emissiveIntensity: 1.5, roughness: 0.4 }),
      nightLantern: new THREE.MeshStandardMaterial({ color: 0x8a2c16, emissive: 0xff7a2a, emissiveIntensity: 0, roughness: 0.45 })
    };
    return M;
  };

  /* ---------------- 屋顶几何 ---------------- */
  function roofHipGeo(w, d, h, over, lift) {
    const a = w / 2 + over, b = d / 2 + over;
    const r = Math.max(0.001, (w - d) / 2);
    const pos = [], uv = [], idx = [];
    const N = 10, Mg = 6;
    function addGrid(fn) {
      const base = pos.length / 3;
      for (let j = 0; j <= Mg; j++) {
        for (let i = 0; i <= N; i++) {
          const u = i / N, v = j / Mg;
          const p = fn(u, v);
          pos.push(p[0], p[1], p[2]);
          uv.push(u * w * 0.13, v * h * 0.55);
        }
      }
      for (let j = 0; j < Mg; j++) {
        for (let i = 0; i < N; i++) {
          const A = base + j * (N + 1) + i, Bm = A + 1, C = A + N + 1, D = C + 1;
          idx.push(A, Bm, C, Bm, D, C);
        }
      }
    }
    const cl = (u, v) => lift * Math.pow(Math.abs(2 * u - 1), 6) * Math.pow(1 - v, 4);
    addGrid((u, v) => [UTIL.lerp(UTIL.lerp(-a, a, u), UTIL.lerp(-r, r, u), v), h * Math.pow(v, 1.45) + cl(u, v), b * (1 - v)]);
    addGrid((u, v) => [UTIL.lerp(UTIL.lerp(-a, a, u), UTIL.lerp(-r, r, u), v), h * Math.pow(v, 1.45) + cl(u, v), -b * (1 - v)]);
    addGrid((u, v) => [UTIL.lerp(a, r, v), h * Math.pow(v, 1.45) + cl(u, v), UTIL.lerp(UTIL.lerp(-b, b, u), 0, v)]);
    addGrid((u, v) => [UTIL.lerp(-a, -r, v), h * Math.pow(v, 1.45) + cl(u, v), UTIL.lerp(UTIL.lerp(-b, b, u), 0, v)]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function roofRoundGeo(r, h, sides, lift) {
    const N = Math.max(16, sides * 5), Mg = 7;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= Mg; j++) {
      for (let i = 0; i <= N; i++) {
        const u = i / N, v = j / Mg;
        const th = u * 6.2832;
        const rr = r * (1 - v);
        const y = h * Math.pow(v, 1.45) + lift * Math.pow(Math.abs(Math.cos(sides / 2 * th)), 8) * Math.pow(1 - v, 6);
        pos.push(Math.cos(th) * rr, y, Math.sin(th) * rr);
        uv.push(u * r * 0.25, v * h * 0.55);
      }
    }
    for (let j = 0; j < Mg; j++) {
      for (let i = 0; i < N; i++) {
        const A = j * (N + 1) + i, Bm = A + 1, C = A + N + 1, D = C + 1;
        idx.push(A, Bm, C, Bm, D, C);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function ridgesForHip(w, d, h, over, lift, mat) {
    const a = w / 2 + over, b = d / 2 + over;
    const r = Math.max(0.001, (w - d) / 2);
    const rad = Math.min(0.17, w * 0.03 + 0.05);
    const grp = new THREE.Group();
    const pts = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = UTIL.lerp(-r, r, t);
      const y = h - Math.sin(t * Math.PI) * 0.06;
      pts.push([x, y, 0]);
    }
    if (r > 0.05) {
      grp.add(new THREE.Mesh(UTIL.tube(pts, rad, 16, 5), mat));
      // 鸱吻
      for (const s of [-1, 1]) {
        const hook = new THREE.Mesh(UTIL.tube([[s * r, h, 0], [s * (r + 0.22), h + 0.30, 0], [s * (r + 0.30), h + 0.52, 0]], rad * 0.8, 8, 5), mat);
        grp.add(hook);
      }
    }
    // 垂脊
    const ends = r > 0.05 ? [[r, 0], [r, 0], [-r, 0], [-r, 0]] : [[0, 0], [0, 0], [0, 0], [0, 0]];
    const corners = [[a, b], [a, -b], [-a, b], [-a, -b]];
    corners.forEach((c, i) => {
      const e = ends[i];
      const seg = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        seg.push([
          UTIL.lerp(e[0], c[0], t),
          UTIL.lerp(h, lift, Math.pow(t, 1.25)) + 0.02,
          UTIL.lerp(e[1], c[1], t)
        ]);
      }
      seg[seg.length - 1][1] += 0.18;
      grp.add(new THREE.Mesh(UTIL.tube(seg, rad * 0.72, 10, 5), mat));
    });
    return grp;
  }

  /* ---------------- 硬山顶（江南民居主流屋顶：两坡 + 曲屋面） ---------------- */
  function roofGableGeo(w, d, h, over) {
    const a = w / 2 + over, b = d / 2 + over;
    const pos = [], uv = [], idx = [];
    const N = 9, Mg = 4;
    function addGrid(fn) {
      const base = pos.length / 3;
      for (let j = 0; j <= Mg; j++) {
        for (let i = 0; i <= N; i++) {
          const u = i / N, v = j / Mg;
          const p = fn(u, v);
          pos.push(p[0], p[1], p[2]);
          uv.push(u * w * 0.14, v * h * 0.6);
        }
      }
      for (let j = 0; j < Mg; j++) {
        for (let i = 0; i < N; i++) {
          const A = base + j * (N + 1) + i, Bm = A + 1, C = A + N + 1, D = C + 1;
          idx.push(A, Bm, C, Bm, D, C);
        }
      }
    }
    // 两坡：v 沿进深，屋面中段微微下垂（举折）
    const sag = t => 1 - Math.sin(t * Math.PI) * 0.06;
    for (const s of [1, -1]) {
      addGrid((u, v) => [
        UTIL.lerp(-a, a, u),
        h * (1 - v) * sag(v),
        s * UTIL.lerp(0, b, v)
      ]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* 马头墙 / 观音兜（style: 'matou' 阶梯 | 'guanyin' 弧兜） */
  B.gableWall = function (o) {
    const m = B.mats();
    o = o || {};
    const w = o.w || 1.0;                  // 墙厚方向
    const h = o.h || 3.0;                  // 基准墙高
    const style = o.style || 'matou';
    const g = new THREE.Group();
    if (style === 'matou') {
      // 2~3 级阶梯，每级一块 plaster 体 + 黛瓦压顶
      const steps = o.steps || 2 + (o.rand ? (o.rand() * 2) | 0 : 0);
      for (let s = 0; s < steps; s++) {
        const hh = h * (1 - s * 0.28);
        const ww = w * (1 - s * 0.1);
        const blk = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, w * 0.62), m.plaster);
        blk.position.set(0, hh / 2, 0);
        g.add(blk);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.1, 0.16, w * 0.78), m.roofDark);
        cap.position.set(0, hh + 0.08, 0);
        g.add(cap);
        g.position.x += w * 0.62;
      }
    } else {
      // 观音兜：拉高弧形（用楔形盒堆叠近似圆弧）
      const n = 6;
      for (let s = 0; s < n; s++) {
        const t = s / n;
        const hh = h * (0.35 + 0.65 * Math.sin((1 - t) * Math.PI * 0.5));
        const blk = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, hh, w * 0.66), m.plaster);
        blk.position.set(t * w * 0.6, hh / 2, 0);
        g.add(blk);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, 0.15, w * 0.8), m.roofDark);
        cap.position.set(t * w * 0.6, hh + 0.075, 0);
        g.add(cap);
      }
    }
    return g;
  };

  /* 石库门（石门框 + 实榻门 + 门罩） */
  B.shikumen = function (o) {
    const m = B.mats();
    o = o || {};
    const w = o.w || 1.9, h = o.h || 2.6;
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, h, 0.26), m.stoneLight);
      post.position.set(s * (w / 2 + 0.12), h / 2, 0);
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.72, 0.3, 0.34), m.stoneLight);
    lintel.position.y = h + 0.15;
    g.add(lintel);
    // 门罩小披檐
    const canopy = new THREE.Mesh(roofGableGeo(w + 1.1, 0.9, 0.32, 0.22), m.roofDark);
    canopy.position.y = h + 0.42;
    g.add(canopy);
    // 双扇实榻门（荸荠色）
    const doorMat = m.woodDark;
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.02, h - 0.06, 0.08), doorMat);
      leaf.position.set(s * w / 4, (h - 0.06) / 2 + 0.03, 0);
      g.add(leaf);
    }
    // 门环
    const ringGeo = new THREE.TorusGeometry(0.07, 0.016, 6, 10);
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(ringGeo, m.gold);
      ring.position.set(s * w / 4, h * 0.55, 0.07);
      g.add(ring);
    }
    return g;
  };

  /* ---------------- 亭 ---------------- */
  B.pavilion = function (o) {
    const m = B.mats();
    o = o || {};
    const w = o.w || 6, h = o.h || 4.4;
    const sides = o.sides || 4;
    const round = sides !== 4;
    const g = new THREE.Group();
    // 台基
    const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.66, w * 0.74, 0.72, round ? sides : 4), m.stone);
    base.position.y = 0.36;
    if (!round) base.rotation.y = Math.PI / 4;
    g.add(base);
    // 台阶
    const step = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.18, 1.1), m.stone);
    step.position.set(0, 0.09, w * 0.72);
    g.add(step);
    // 柱
    const colH = h;
    const colR = Math.max(0.09, w * 0.032);
    const colGeo = new THREE.CylinderGeometry(colR, colR * 1.08, colH, 8);
    for (let i = 0; i < sides; i++) {
      const a = i / sides * 6.2832 + (round ? 0.39 : Math.PI / 4);
      const rr = w * 0.5 - 0.3;
      const c = new THREE.Mesh(colGeo, o.pillarMat || m.red);
      c.position.set(Math.cos(a) * rr, 0.72 + colH / 2, Math.sin(a) * rr);
      g.add(c);
    }
    // 额枋
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5 - 0.12, w * 0.5 - 0.12, 0.24, round ? sides : 4, 1, true), o.pillarMat || m.red);
    beam.position.y = 0.72 + colH;
    if (!round) beam.rotation.y = Math.PI / 4;
    g.add(beam);
    // 挂落
    const fall = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.47, w * 0.47, 0.1, round ? sides : 4, 1, true), m.woodDark);
    fall.position.y = 0.72 + colH * 0.66;
    if (!round) fall.rotation.y = Math.PI / 4;
    g.add(fall);
    // 屋顶
    const over = w * 0.20;
    const lift = w * 0.10;
    let roof;
    if (round) {
      roof = new THREE.Mesh(roofRoundGeo(w * 0.5 + over * 0.6, h * 0.62, sides, lift * 0.8), m.roof);
    } else {
      roof = new THREE.Mesh(roofHipGeo(w * 1.04, w * 1.04, h * 0.58, over, lift), m.roof);
    }
    roof.position.y = 0.72 + colH + 0.08;
    g.add(roof);
    g.add(ridgesForHip(round ? w * 1.12 : w * 1.04, round ? w * 1.12 : w * 1.04, h * 0.58, over * (round ? 0.6 : 1), lift, m.dark));
    // 宝顶
    const fin = new THREE.Group();
    const fs = new THREE.Mesh(new THREE.SphereGeometry(w * 0.055, 10, 8), m.gold);
    fs.position.y = 0.16;
    const fc = new THREE.Mesh(new THREE.ConeGeometry(w * 0.035, w * 0.14, 8), m.gold);
    fc.position.y = w * 0.075;
    fin.add(fs, fc);
    fin.position.y = 0.72 + colH + h * 0.58 + 0.06;
    g.add(fin);
    // 匾额
    if (o.plaque) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.34, w * 0.13), new THREE.MeshStandardMaterial({ map: Textures.plaque(o.plaque), roughness: 0.6 }));
      pl.position.set(0, 0.72 + colH * 0.8, w * 0.5 - 0.05);
      g.add(pl);
    }
    return g;
  };

  /* ---------------- 塔 ---------------- */
  B.pagoda = function (o) {
    const m = B.mats();
    o = o || {};
    const tiers = o.tiers || 5;
    const baseR = o.baseR || 14;
    const th = o.tierH || (Array.isArray(o.tierHs) ? o.tierHs : 9);
    const tierHs = Array.isArray(th) ? th : new Array(tiers).fill(th);
    const shrink = o.shrink || 0.9;
    const bodyMat = o.bodyMat || m.brick;
    const roofMat = o.plain ? null : (o.roofMat || m.roofDark);
    const plain = !!o.plain;
    const lift = o.lift || baseR * 0.09;
    const g = new THREE.Group();
    // 石台
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 1.42, baseR * 1.6, 2.6, 8), m.stone);
    plat.position.y = 1.3;
    g.add(plat);
    const plat2 = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 1.18, baseR * 1.32, 1.4, 8), m.stone);
    plat2.position.y = 3.2;
    g.add(plat2);
    let y = 3.9, r = baseR;
    for (let t = 0; t < tiers; t++) {
      const hh = tierHs[t % tierHs.length];
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, hh, 8), bodyMat);
      body.position.y = y + hh / 2;
      g.add(body);
      if (plain) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.09, r * 1.09, 0.42, 8), m.stone);
        band.position.y = y + hh;
        g.add(band);
      } else {
        const balc = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.16, r * 1.16, 0.5, 8), m.woodDark);
        balc.position.y = y + hh * 0.12;
        g.add(balc);
        const roof = new THREE.Mesh(roofRoundGeo(r * 1.52, hh * 0.52, 8, lift), roofMat);
        roof.position.y = y + hh + 0.1;
        g.add(roof);
        // 塔檐宝顶衔接
        const ringM = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.3, 8), m.woodDark);
        ringM.position.y = y + hh + 0.05;
        g.add(ringM);
      }
      y += hh * (plain ? 1 : 0.98);
      r *= shrink;
    }
    // 塔刹
    const finH = o.finialH || baseR * 0.7;
    const fin = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, finH, 6), m.gold);
    pole.position.y = finH / 2;
    fin.add(pole);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(baseR * 0.09 * (1 - i * 0.22), 10, 8), m.gold);
      s.position.y = finH * (0.18 + i * 0.3);
      fin.add(s);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(baseR * 0.07, finH * 0.3, 8), m.gold);
    tip.position.y = finH * 1.12;
    fin.add(tip);
    fin.position.y = y;
    g.add(fin);
    return g;
  };

  /* ---------------- 殿堂/民居（石库门 + 格扇窗 + 额枋） ---------------- */
  B.hall = function (o) {
    const m = B.mats();
    o = o || {};
    const w = o.w || 24, d = o.d || 16, h = o.h || 9;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.9, d * 1.1), m.stone);
    base.position.y = 0.45;
    g.add(base);
    // 侧塘石墙裙（石砌基底，江南民居特征）
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.55, d + 0.12), m.stone);
    skirt.position.y = 1.12;
    g.add(skirt);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.3, d), o.bodyMat || m.plaster);
    body.position.y = 0.9 + (h - 0.3) / 2;
    g.add(body);
    const colGeo = new THREE.CylinderGeometry(0.22, 0.24, h - 0.3, 10);
    const nx = Math.max(2, Math.round(w / 4)), nz = 2;
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j < nz; j++) {
        const c = new THREE.Mesh(colGeo, o.pillarMat || m.red);
        c.position.set(-w / 2 + i * (w / nx), 0.9 + (h - 0.3) / 2, (j ? 1 : -1) * (d / 2 - 0.15));
        g.add(c);
      }
    }
    // 额枋（檐下枋带）
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, 0.34, d + 0.24), m.woodDark);
    beam.position.y = 0.9 + h - 0.44;
    g.add(beam);
    const small = w < 9 && d < 8;                           // 小民居用石库门
    if (small) {
      const sk = B.shikumen({ w: Math.min(1.8, w * 0.3), h: Math.min(2.3, h * 0.62) });
      sk.position.set(0, 0.9, d / 2 + 0.1);
      g.add(sk);
    } else {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, h * 0.62), m.dark);
      door.position.set(0, 0.9 + h * 0.34, d / 2 + 0.02);
      g.add(door);
      // 格扇窗（前檐两侧，落地长窗比例）
      const winW = Math.max(0.9, w * 0.11), winH = h * 0.52;
      for (const s of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), m.window);
        win.position.set(s * w * 0.32, 0.9 + h * 0.42, d / 2 + 0.03);
        g.add(win);
      }
      // 山面冰纹窗
      const ice = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.16, 2.2), Math.min(h * 0.3, 1.6)), m.latticeIce);
      ice.rotation.y = Math.PI / 2;
      ice.position.set(w / 2 + 0.03, 0.9 + h * 0.5, 0);
      g.add(ice);
    }
    const roof = new THREE.Mesh(roofHipGeo(w * 1.1, d * 1.18, h * 0.55, 1.0, 0.6), o.roofMat || m.roof);
    roof.position.y = 0.9 + h - 0.2;
    g.add(roof);
    g.add(ridgesForHip(w * 1.1, d * 1.18, h * 0.55, 1.0, 0.6, m.dark));
    return g;
  };

  /* ---------------- 石拱桥 ----------------
     局部坐标约定：+X = 桥跨方向（顺着堤身/桥面走向），±Z = 桥宽方向（水流穿过方向）。
     · 拱洞为半圆筒，桥面沿拱矢涨落；两端平接堤顶（不悬空、不压入堤体）
     · 拱肩侧立面上沿贴桥面曲线（经典石拱桥立面），不再是"一堵墙 + 一个洞"
     · 桥台嵌入两端堤体，杜绝桥头透空 */
  B.archBridge = function (o) {
    const m = B.mats();
    o = o || {};
    const span = o.span || 22;                                  // 拱跨 = 水道缺口宽
    const width = o.width || 9.5;                               // 桥宽 = 堤宽（隧道进深）
    const rise = o.rise !== undefined ? o.rise : Math.min(4.4, span * 0.20);
    const over = o.over !== undefined ? o.over : 1.9;           // 桥面搭接进堤端的长度
    const thick = o.thick !== undefined ? o.thick : 1.02;       // 拱顶石厚（桥面 - 拱腹）
    const R = span / 2, W2 = width / 2;
    const g = new THREE.Group();
    const prof = x => rise * Math.cos(UTIL.clamp(x / R, -1, 1) * Math.PI / 2);
    const deckY = x => prof(x) + thick;

    // 拱券（拱洞内壁）
    const NS = 16;
    const rings = [];
    for (const z of [-W2, W2]) {
      const ring = [];
      for (let i = 0; i <= NS; i++) {
        const ph = i / NS * Math.PI;
        ring.push([Math.cos(ph) * R, Math.sin(ph) * rise, z]);
      }
      rings.push(ring);
    }
    g.add(new THREE.Mesh(UTIL.loft(rings, { capStart: false, capEnd: false }), m.stone));

    // 拱肩侧墙：下沿贴拱腹，上沿贴桥面
    for (const s of [1, -1]) {
      const pos = [], uv = [], idx = [];
      const N2 = 20;
      for (let i = 0; i <= N2; i++) {
        const x = -R + i / N2 * span;
        pos.push(x, prof(x) * 0.995, s * W2, x, deckY(x) - 0.02, s * W2);
        uv.push(i / N2 * span * 0.09, 0, i / N2 * span * 0.09, 1);
      }
      for (let i = 0; i < N2; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      wg.setIndex(idx);
      wg.computeVertexNormals();
      g.add(new THREE.Mesh(wg, m.stoneLight));
      // 券脸石（拱洞边缘一圈压边）
      const ringPts = [];
      for (let i = 0; i <= NS; i++) {
        const ph = i / NS * Math.PI;
        ringPts.push([Math.cos(ph) * (R + 0.02), Math.sin(ph) * (rise + 0.02), s * (W2 + 0.03)]);
      }
      g.add(new THREE.Mesh(UTIL.tube(ringPts, 0.13, 26, 5), m.stone));
    }

    // 桥面（随拱起伏；两端 +over 平接堤顶）
    const dpos = [], duv = [], didx = [];
    const ND = 26;
    const x0 = -R - over, x1 = R + over;
    for (let i = 0; i <= ND; i++) {
      const x = x0 + (x1 - x0) * i / ND;
      const y = deckY(x);
      dpos.push(x, y, -W2, x, y, W2);
      duv.push(i / ND * (span + over * 2) * 0.06, 0, i / ND * (span + over * 2) * 0.06, 1);
    }
    for (let i = 0; i < ND; i++) {
      const a = i * 2;
      didx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3));
    dg.setAttribute('uv', new THREE.Float32BufferAttribute(duv, 2));
    dg.setIndex(didx);
    dg.computeVertexNormals();
    g.add(new THREE.Mesh(dg, m.stoneLight));

    // 栏板 + 望柱（随拱起伏，落在桥面上）
    const postGeo = new THREE.BoxGeometry(0.2, 0.66, 0.2);
    for (const s of [1, -1]) {
      const railPts = [], midPts = [];
      const NP = 16;
      for (let i = 0; i <= NP; i++) {
        const x = x0 + (x1 - x0) * i / NP;
        const y = deckY(x);
        railPts.push([x, y + 0.66, s * (W2 - 0.18)]);
        midPts.push([x, y + 0.36, s * (W2 - 0.18)]);
      }
      g.add(new THREE.Mesh(UTIL.tube(railPts, 0.065, 40, 5), m.stoneLight));
      g.add(new THREE.Mesh(UTIL.tube(midPts, 0.042, 40, 5), m.stoneLight));
      const npost = Math.max(2, Math.floor((span + over * 2) / 2.2));
      for (let i = 0; i <= npost; i++) {
        const x = x0 + (x1 - x0) * i / npost;
        const post = new THREE.Mesh(postGeo, m.stoneLight);
        post.position.set(x, deckY(x) + 0.33, s * (W2 - 0.18));
        g.add(post);
      }
    }

    // 桥台：两端驳岸石，向下没入水下/堤体，避免桥头透空
    for (const s of [1, -1]) {
      const hAb = thick + 2.6;
      const abut = new THREE.Mesh(new THREE.BoxGeometry(2.6, hAb, width + 0.5), m.stone);
      abut.position.set(s * (R + 0.5), thick - 0.02 - hAb / 2, 0);
      g.add(abut);
      // 翼墙：向外随堤身渐低，和堤岸石墙咬合
      const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, width + 0.2), m.stone);
      wing.position.set(s * (R + 2.6), thick - 1.0, 0);
      g.add(wing);
    }

    if (o.plaque) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.72), new THREE.MeshStandardMaterial({ map: Textures.plaque(o.plaque), roughness: 0.6, side: THREE.DoubleSide }));
      pl.position.set(0, deckY(0) - 0.62, W2 + 0.06);
      g.add(pl);
    }
    return g;
  };

  /* ---------------- 码头 ---------------- */
  B.dock = function (o) {
    const m = B.mats();
    const g = new THREE.Group();
    const L = o.len || 12, Wd = o.wid || 4;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 0.16, Wd), new THREE.MeshStandardMaterial({ map: Textures.get('woodLight'), color: 0x9a7a52, roughness: 0.6, envMapIntensity: 0.4 }));
    deck.position.y = 0.62;
    g.add(deck);
    // 木桩
    const pileGeo = new THREE.CylinderGeometry(0.14, 0.16, 3.2, 7);
    const pileMat = new THREE.MeshStandardMaterial({ map: Textures.get('bark'), color: 0x6a563e, roughness: 0.7 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(pileGeo, pileMat);
      p.position.set(sx * (L / 2 - 0.5), -0.7, sz * (Wd / 2 - 0.4));
      g.add(p);
    }
    // 系缆桩
    for (const sx of [-1, 1]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 7), m.woodDark);
      bollard.position.set(sx * (L / 2 - 1.2), 0.95, 0);
      g.add(bollard);
    }
    // 灯笼柱
    const lamp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.3, 6), m.woodDark);
    post.position.y = 1.15;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), m.lantern);
    bulb.position.y = 2.35;
    lamp.add(post, bulb);
    lamp.position.set(-L / 2 + 0.8, 0.7, -Wd / 2 + 0.5);
    g.add(lamp);
    const light = new THREE.PointLight(0xffb066, 0.9, 22, 2);
    light.position.set(-L / 2 + 0.8, 3.1, -Wd / 2 + 0.5);
    g.add(light);
    // 木牌
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.12), m.woodDark);
    sign.position.set(L / 2 - 1.6, 1.6, -Wd / 2 + 0.4);
    g.add(sign);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.6), new THREE.MeshStandardMaterial({ map: Textures.plaque('湖滨码头'), roughness: 0.6 }));
    face.position.set(L / 2 - 1.6, 1.6, -Wd / 2 + 0.47);
    g.add(face);
    return g;
  };

  /* ---------------- 九曲桥 ---------------- */
  B.zigzag = function (pts, width) {
    const m = B.mats();
    const g = new THREE.Group();
    const W2 = (width || 2.4) / 2;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(L + 0.3, 0.18, W2 * 2), m.stoneLight);
      seg.position.set((a[0] + b[0]) / 2, 0.75, (a[1] + b[1]) / 2);
      seg.rotation.y = -Math.atan2(dz, dx);
      g.add(seg);
      for (const s of [1, -1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.06), m.stoneLight);
        rail.position.set((a[0] + b[0]) / 2, 1.32, (a[1] + b[1]) / 2);
        rail.rotation.y = -Math.atan2(dz, dx);
        rail.translateZ(s * W2);
        rail.translateY(0);
        g.add(rail);
      }
    }
    return g;
  };

  /* ---------------- 院墙 ---------------- */
  B.wallRun = function (pts, h, thick) {
    const m = B.mats();
    const g = new THREE.Group();
    const tk = thick || 0.5;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(L, h, tk), m.plaster);
      seg.position.set((a[0] + b[0]) / 2, h / 2, (a[1] + b[1]) / 2);
      seg.rotation.y = -Math.atan2(dz, dx);
      g.add(seg);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(L + 0.1, 0.16, tk + 0.22), m.roofDark);
      cap.position.copy(seg.position);
      cap.position.y = h + 0.08;
      cap.rotation.y = seg.rotation.y;
      g.add(cap);
    }
    return g;
  };

  /* ---------------- 牌坊 / 石碑 / 灯笼 ---------------- */
  B.paifang = function (o) {
    const m = B.mats();
    o = o || {};
    const w = o.w || 10, h = o.h || 7;
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, h, 10), m.red);
      col.position.set(s * w / 2, h / 2, 0);
      g.add(col);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.5, 0.6), m.woodDark);
    beam.position.y = h - 0.5;
    g.add(beam);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 2.2, 0.35, 1.6), m.woodDark);
    top.position.y = h - 0.05;
    g.add(top);
    const roof = new THREE.Mesh(roofHipGeo(w + 2.0, 1.8, 1.4, 0.5, 0.35), m.roof);
    roof.position.y = h + 0.12;
    g.add(roof);
    if (o.plaque) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshStandardMaterial({ map: Textures.plaque(o.plaque), roughness: 0.6, side: THREE.DoubleSide }));
      pl.position.set(0, h - 1.15, 0.32);
      g.add(pl);
    }
    return g;
  };

  B.stele = function (text) {
    const m = B.mats();
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 1.1), m.stone);
    base.position.y = 0.3;
    g.add(base);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.9, 0.3), m.stoneLight);
    slab.position.y = 2.0;
    g.add(slab);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.3, 0.5), m.roofDark);
    cap.position.y = 3.6;
    g.add(cap);
    if (text) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.4), new THREE.MeshStandardMaterial({ map: Textures.plaque(text), roughness: 0.6 }));
      face.position.set(0, 2.0, 0.17);
      g.add(face);
    }
    return g;
  };

  B.lantern = function (scale) {
    const m = B.mats();
    const g = new THREE.Group();
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2 * (scale || 1), 10, 8), m.lantern);
    g.add(bulb);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 8), m.dark);
    cap.position.y = 0.24 * (scale || 1);
    g.add(cap);
    return g;
  };

  /* （现代城市天际线已按需求移除，环湖保持纯古风景观） */

  B.roofHipGeo = roofHipGeo;
  B.roofRoundGeo = roofRoundGeo;
  B.roofGableGeo = roofGableGeo;

  /* ---------- 照壁/景墙（景点照片展示墙） ---------- */
  B.photoWall = function (key, w, h, title) {
    const m = B.mats();
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, 0.85), m.stone);
    base.position.y = 0.25; g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, h + 0.35, 0.16), m.stoneLight);
    back.position.y = 0.5 + (h + 0.35) / 2; g.add(back);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: Textures.photo(key, title), roughness: 0.82, metalness: 0.0, envMapIntensity: 0.35 })
    );
    face.position.set(0, 0.5 + h / 2, 0.1); g.add(face);
    const cap = new THREE.Mesh(roofHipGeo(w * 0.28, w + 0.9, 0.28, 0.28, 0.3), m.roof);
    cap.position.y = 0.5 + h + 0.32; g.add(cap);
    if (title) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.5, 2.6), 0.42), new THREE.MeshBasicMaterial({ map: Textures.plaque(title), transparent: false }));
      plate.position.set(0, 0.5 + h + 0.08, 0.14); g.add(plate);
    }
    return g;
  };

  return B;
})();
