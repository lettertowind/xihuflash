/* 乌篷船与交通船建模：放样船体、乌篷拱段、橹动画、画舫/快艇/保洁船 */
window.BoatModel = (function () {
  const M = {};
  const U = UTIL;

  /* 通用放样船体：站位于局部 +X（船头朝 +X） */
  function loftHull(L, W, o) {
    o = o || {};
    const NS = o.stations || 11, depth = o.depth || 0.36;
    const rings = [];
    for (let i = 0; i < NS; i++) {
      const t = i / (NS - 1);
      const x = -L / 2 + L * t;
      const bump = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.8);
      const w = W * (0.24 + 0.76 * bump) * (i === NS - 1 ? 0.08 : 1);
      const bowK = Math.max(0, (t - 0.72) / 0.28);
      const sternK = Math.pow(1 - t, 3);
      const gunY = 0.5 + 0.42 * bowK * bowK + 0.14 * sternK;
      const keelY = -depth + 0.24 * Math.pow(bowK, 1.6) + 0.16 * sternK;
      rings.push([
        [x, gunY, -w],
        [x, gunY - (gunY - keelY) * 0.42, -w * 0.97],
        [x, keelY + (gunY - keelY) * 0.2, -w * 0.66],
        [x, keelY, 0],
        [x, keelY + (gunY - keelY) * 0.2, w * 0.66],
        [x, gunY - (gunY - keelY) * 0.42, w * 0.97],
        [x, gunY, w]
      ]);
    }
    return U.loft(rings);
  }

  function wupengMats() {
    const T = Textures;
    return {
      hull: new THREE.MeshStandardMaterial({ map: T.get('wood'), color: 0x5e4a34, roughness: 0.66, metalness: 0.04, envMapIntensity: 0.38, side: THREE.DoubleSide }),
      trim: new THREE.MeshStandardMaterial({ map: T.get('woodLight'), color: 0x7a5f42, roughness: 0.6, envMapIntensity: 0.32 }),
      awning: new THREE.MeshStandardMaterial({ map: T.get('bamboo'), color: 0x56524a, roughness: 0.76, metalness: 0.02, envMapIntensity: 0.34, side: THREE.DoubleSide }),
      oar: new THREE.MeshStandardMaterial({ map: T.get('wood'), color: 0x5a4530, roughness: 0.62 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.6 }),
      redDark: new THREE.MeshStandardMaterial({ map: T.get('wood'), color: 0x7c3226, roughness: 0.58, envMapIntensity: 0.3 }),
      lantern: new THREE.MeshStandardMaterial({ color: 0x8a2a1a, emissive: 0xff7a33, emissiveIntensity: 0.85, roughness: 0.4 })
    };
  }

  /* ---------------- 乌篷船（玩家 + 交通摇橹船；seed 产生个体差异） ---------------- */
  function wupeng(seed) {
    const rr = UTIL.rng(seed || 7);
    const m = wupengMats();
    // 个体差异：船体深浅、篷色、篷段数、整体大小
    const hullShade = 0.82 + rr() * 0.45;
    m.hull.color.setHSL(0.07 + rr() * 0.03, 0.32, 0.30 * hullShade);
    m.awning.color.setHSL(0.10, 0.10 + rr() * 0.08, 0.30 + rr() * 0.12);
    const g = new THREE.Group();
    const L = 9.2 * (0.86 + rr() * 0.28), W = 2.16;
    const hull = new THREE.Mesh(loftHull(L, W), m.hull);
    g.add(hull);
    // 舷缘木条
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(U.tube([
        [-L / 2 + 0.15, 0.52, s * W * 0.24],
        [-1.6, 0.52, s * W * 0.95],
        [1.6, 0.52, s * W * 0.97],
        [3.4, 0.72, s * W * 0.7],
        [L / 2 - 0.05, 0.94, s * W * 0.12]
      ], 0.05, 40, 6), m.trim);
      g.add(rim);
    }
    // 乌篷（2/3 段竹拱，中后部）
    const twoSeg = rr() < 0.45;
    const awnGeo = new THREE.CylinderGeometry(0.88, 0.95, twoSeg ? 1.85 : 1.42, 14, 1, true, 0, Math.PI);
    awnGeo.rotateZ(Math.PI / 2);
    (twoSeg ? [-2.45, -0.55] : [-2.55, -1.08, 0.39]).forEach((x, i) => {
      const a = new THREE.Mesh(awnGeo, m.awning);
      a.position.set(x, 0.5, 0);
      a.scale.setScalar(1 - i * 0.03);
      g.add(a);
    });
    // 篷内座板
    [-2.0, -0.5].forEach(x => {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 1.2), m.trim);
      bench.position.set(x, 0.56, 0); g.add(bench);
    });
    // 船头甲板（盖住内舱，木纹面）
    const dsh = new THREE.Shape();
    dsh.moveTo(0.55, -1.28); dsh.lineTo(4.42, -0.30);
    dsh.lineTo(4.42, 0.30); dsh.lineTo(0.55, 1.28);
    dsh.closePath();
    const dGeo = new THREE.ShapeGeometry(dsh);
    dGeo.rotateX(-Math.PI / 2);
    const deck = new THREE.Mesh(dGeo, new THREE.MeshStandardMaterial({ map: Textures.get('woodLight'), color: 0x8a6c4c, roughness: 0.58, envMapIntensity: 0.35 }));
    deck.position.y = 0.4; g.add(deck);
    // 备用船桨（搭在船头右舷）
    const spare = new THREE.Group();
    const spShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 2.9, 7), m.oar);
    spShaft.rotation.z = Math.PI / 2 - 0.06;
    spare.add(spShaft);
    const spBlade = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.035, 0.17), m.oar);
    spBlade.position.set(1.62, -0.13, 0);
    spBlade.rotation.z = -0.06;
    spare.add(spBlade);
    const spGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.3, 7), m.oar);
    spGrip.rotation.z = Math.PI / 2 - 0.06;
    spGrip.position.set(-1.45, 0.1, 0);
    spare.add(spGrip);
    spare.position.set(3.0, 0.58, 0.5);
    spare.rotation.y = 0.22;
    g.add(spare);
    // 橹（可动画）+ 橹床
    const pivot = new THREE.Group();
    pivot.position.set(-L / 2 + 0.35, 0.6, 0.15);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.048, 4.3, 7), m.oar);
    shaft.rotation.z = -0.5;
    shaft.position.set(-1.95, -0.85, 0);
    pivot.add(shaft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.045, 0.3), m.oar);
    blade.position.set(-3.7, -1.72, 0);
    blade.rotation.z = -0.5;
    pivot.add(blade);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.5, 6), m.oar);
    handle.rotation.z = -0.5;
    handle.position.set(-0.15, -0.12, 0);
    pivot.add(handle);
    g.add(pivot);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.5), m.dark);
    bed.position.set(-L / 2 + 0.3, 0.5, 0.15); g.add(bed);
    return { group: g, oar: pivot, kind: 'wupeng' };
  }

  /* ---------------- 画舫（seed 差异：柱色/顶色/大小） ---------------- */
  function huafang(seed) {
    const rr = UTIL.rng(seed || 13);
    const m = wupengMats();
    const T = Textures;
    const g = new THREE.Group();
    const L = 11.5 * (0.9 + rr() * 0.24), W = 3.1;
    const colMat = rr() < 0.55 ? m.trim : m.redDark;
    g.add(new THREE.Mesh(loftHull(L, W, { depth: 0.5 }), m.hull));
    // 甲板
    const deck = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.09, W * 1.55), new THREE.MeshStandardMaterial({ map: T.get('woodLight'), color: 0x8a6c48, roughness: 0.6 }));
    deck.position.y = 0.55; g.add(deck);
    // 舱体：木柱 + 窗板 + 平顶
    const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.75, 7);
    for (let i = 0; i < 6; i++) {
      const x = -L * 0.36 + i * L * 0.145;
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(postGeo, colMat);
        p.position.set(x, 1.45, s * W * 0.72); g.add(p);
      }
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(L * 0.78, 1.0, W * 1.46), new THREE.MeshStandardMaterial({ map: T.get('windows'), color: 0x9a8468, roughness: 0.55, envMapIntensity: 0.3 }));
    wall.position.y = 1.42; g.add(wall);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L * 0.88, 0.1, W * 1.62), new THREE.MeshStandardMaterial({ map: T.get('bamboo'), color: rr() < 0.5 ? 0x4c463c : 0x5a5344, roughness: 0.75 }));
    roof.position.y = 2.42; g.add(roof);
    const roofEdge = new THREE.Mesh(new THREE.BoxGeometry(L * 0.94, 0.07, W * 1.7), m.trim);
    roofEdge.position.y = 2.36; g.add(roofEdge);
    // 尾部橹
    const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 3.6, 6), m.oar);
    oar.rotation.z = -0.55; oar.position.set(-L / 2 - 1.4, 0.1, 0); g.add(oar);
    return { group: g, oar: null, kind: 'huafang' };
  }

  /* ---------------- 快艇（seed 决定船体配色） ---------------- */
  function speedboat(seed) {
    const rr = UTIL.rng(seed || 11);
    const T = Textures;
    const g = new THREE.Group();
    const L = 7.6 * (0.92 + rr() * 0.2), W = 2.3;
    const hullCols = [0xd8d2c4, 0x9fb2b8, 0x8f4038, 0x4a5e66];
    const hull = new THREE.Mesh(loftHull(L, W, { depth: 0.42, stations: 9 }), new THREE.MeshStandardMaterial({ map: T.get('wood'), color: hullCols[(rr() * hullCols.length) | 0], roughness: 0.42, metalness: 0.08, envMapIntensity: 0.5, side: THREE.DoubleSide }));
    g.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.86, 0.1, W * 1.9), new THREE.MeshStandardMaterial({ color: 0x9c3b2e, roughness: 0.45 }));
    stripe.position.y = 0.42; stripe.scale.z = 0.995; g.add(stripe);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 0.07, W * 1.5), new THREE.MeshStandardMaterial({ map: T.get('woodLight'), color: 0xa88a60, roughness: 0.55 }));
    deck.position.y = 0.5; g.add(deck);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, W * 1.2), new THREE.MeshStandardMaterial({ color: 0x31434a, roughness: 0.15, metalness: 0.4, envMapIntensity: 0.9, transparent: true, opacity: 0.82 }));
    ws.position.set(0.7, 0.85, 0); ws.rotation.z = -0.25; g.add(ws);
    for (const s of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.28, 0.55), new THREE.MeshStandardMaterial({ color: 0x35424a, roughness: 0.7 }));
      seat.position.set(-0.7, 0.68, s * 0.55); g.add(seat);
    }
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.36), new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: 0.5, metalness: 0.3 }));
    motor.position.set(-L / 2 - 0.15, 0.35, 0); g.add(motor);
    return { group: g, oar: null, kind: 'speed' };
  }

  /* ---------------- 保洁船 ---------------- */
  function cleaner() {
    const m = wupengMats();
    const g = new THREE.Group();
    const L = 5.6, W = 1.7;
    g.add(new THREE.Mesh(loftHull(L, W, { depth: 0.3, stations: 8 }), m.hull));
    const deck = new THREE.Mesh(new THREE.BoxGeometry(L * 0.82, 0.07, W * 1.5), new THREE.MeshStandardMaterial({ map: Textures.get('woodLight'), color: 0x7a6248, roughness: 0.65 }));
    deck.position.y = 0.42; g.add(deck);
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x3f6b4a, roughness: 0.6 }));
    bin.position.set(-0.6, 0.75, 0); g.add(bin);
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 5), m.oar);
    fork.position.set(0.9, 0.9, 0.3); fork.rotation.z = 0.5; g.add(fork);
    const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 3.0, 6), m.oar);
    oar.rotation.z = -0.55; oar.position.set(-L / 2 - 0.9, 0.05, 0); g.add(oar);
    return { group: g, oar: null, kind: 'clean' };
  }

  M.build = function (kind, seed) {
    if (kind === 'huafang') return huafang(seed);
    if (kind === 'speed') return speedboat(seed);
    if (kind === 'clean') return cleaner();
    return wupeng(seed);
  };
  return M;
})();
