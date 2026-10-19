/* 地标：西湖实景重建 —— 17 景 + 六桥 + 三潭石塔 + 起点码头（配合 Buildings/terrain API） */
window.Landmarks = (function () {
  const L = {};

  /* ---------------- 三潭印月石塔（高约 2.3m，立于水中） ---------------- */
  function stoneLantern(m) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.12, 0.5, 12), m.stoneLight);
    base.position.y = 0.05; g.add(base);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), m.stoneLight);
    ball.position.y = 0.66; ball.scale.y = 0.92; g.add(ball);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + 0.3;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.13, 10), m.dark);
      hole.position.set(Math.cos(a) * 0.71, 0.68, Math.sin(a) * 0.71);
      hole.lookAt(Math.cos(a) * 3, 0.68, Math.sin(a) * 3);
      g.add(hole);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.36, 10), m.stoneLight);
    neck.position.y = 1.3; g.add(neck);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.64, 0.56, 12), m.stoneLight);
    cone.position.y = 1.72; g.add(cone);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), m.stoneLight);
    tip.position.y = 2.08; g.add(tip);
    return g;
  }

  /* 岸线辅助：朝湖法线 / 沿岸搜索落点 */
  function shoreNormal(terrain, x, z) {
    const e = 7;
    const gx = terrain.shoreDist(x + e, z) - terrain.shoreDist(x - e, z);
    const gz = terrain.shoreDist(x, z + e) - terrain.shoreDist(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [-gx / l, -gz / l];   // shoreDist 减小方向 = 指向湖面
  }
  function findShore(terrain, x0, z0, dMin, dMax) {
    for (let r = 0; r <= 280; r += 9) {
      for (let a = 0; a < Math.PI * 2; a += 0.21) {
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        const sd = terrain.exactShoreDist(x, z);
        if (sd >= dMin && sd <= dMax && !terrain.onCauseway(x, z) && terrain.heightAt(x, z) < 34) {
          return { x, z };
        }
      }
    }
    return null;
  }

  /* 新增景点（坐标自动吸附岸线） */
  const EXTRA = [
    { name: '岳王庙', sub: '北山街西端 · 岳武穆长眠之地', anchor: [-1250, -1080], kind: 'temple' },
    { name: '西泠印社', sub: '孤山西麓 · 天下第一名社', anchor: [-620, -850], kind: 'xiling' },
    { name: '慕才亭', sub: '西泠桥畔 · 苏小小墓', anchor: [-540, -950], kind: 'pav6' },
    { name: '涌金门', sub: '古杭城门 · 涌金池畔', anchor: [880, 160], kind: 'gate' },
    { name: '钱王祠', sub: '南山路 · 吴越王家祠', anchor: [830, 700], kind: 'qianwang' },
    { name: '长桥公园', sub: '南山路东端 · 传梁祝十八相送', anchor: [660, 1180], kind: 'corridor' }
  ];

  /* 最近堤岸（用于六桥命名与朝向） */
  function nearestCauseway(course, x, z) {
    const U = UTIL;
    let best = null, bd = 1e9, bseg = null;
    for (const nm in course.causeways) {
      for (const line of course.causeways[nm]) {
        for (let i = 1; i < line.length; i++) {
          const d = U.segDist(x, z, line[i - 1], line[i]);
          if (d < bd) { bd = d; best = nm; bseg = [line[i - 1], line[i]]; }
        }
      }
    }
    return { name: best, dist: bd, seg: bseg };
  }

  const SUDI_NAMES = ['跨虹桥', '东浦桥', '压堤桥', '望山桥', '锁澜桥', '映波桥'];
  const YANG_NAMES = ['环璧桥', '流金桥', '卧龙桥', '隐秀桥', '景行桥', '浚源桥'];

  /* ---------------- 新增景点建模 ---------------- */
  function buildExtra(kind, name, m) {
    const B = Buildings;
    const g = new THREE.Group();
    if (kind === 'temple') {
      g.add(B.hall({ w: 35, d: 21, h: 14 }));
      const side = B.hall({ w: 18, d: 10, h: 7.5 });
      side.position.set(-21, 0, -4); side.rotation.y = 0.2; g.add(side);
      g.add(B.wallRun([[-20, 0, -14], [20, 0, -14]], 2.6, 0.5));
      const sb = B.stele(name); sb.position.set(7.5, 0, 9); g.add(sb);
    } else if (kind === 'xiling') {
      g.add(B.paifang({ w: 8.5, h: 6.8 }));
      g.add(B.wallRun([[-5, 0, 2], [-19, 0, 3.5]], 2.4, 0.5));
      g.add(B.wallRun([[5, 0, 2], [19, 0, 3.5]], 2.4, 0.5));
      const s1 = stoneLantern(m); s1.position.set(6.5, 0, 1); s1.scale.setScalar(1.6); g.add(s1);
      const s2 = stoneLantern(m); s2.position.set(-6.5, 0, 1); s2.scale.setScalar(1.6); g.add(s2);
    } else if (kind === 'pav6') {
      g.add(B.pavilion({ w: 5.0, h: 3.8, sides: 6, plaque: name }));
      const sb = B.stele(name); sb.position.set(5.5, 0, 2); g.add(sb);
    } else if (kind === 'gate') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(12, 4.6, 6), m.brick);
      base.position.y = 2.3; g.add(base);
      const arch = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 6.3), m.dark);
      arch.position.y = 1.6; g.add(arch);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.35, 6.6), m.stoneLight);
      deck.position.y = 4.78; g.add(deck);
      const loft = B.hall({ w: 9, d: 5, h: 4.2 });
      loft.position.y = 4.95; g.add(loft);
      g.add(B.wallRun([[-6, 0, 0], [-21, 0, 0]], 3.4, 1.1));
      g.add(B.wallRun([[6, 0, 0], [21, 0, 0]], 3.4, 1.1));
    } else if (kind === 'qianwang') {
      g.add(B.paifang({ w: 16, h: 11.5 }));
      const rw1 = new THREE.Mesh(new THREE.BoxGeometry(14, 2.8, 0.5), m.red);
      rw1.position.set(-11, 1.4, 1.5); g.add(rw1);
      const rw2 = new THREE.Mesh(new THREE.BoxGeometry(14, 2.8, 0.5), m.red);
      rw2.position.set(11, 1.4, 1.5); g.add(rw2);
      const s1 = stoneLantern(m); s1.position.set(5.8, 0, 0.5); s1.scale.setScalar(1.5); g.add(s1);
      const s2 = stoneLantern(m); s2.position.set(-5.8, 0, 0.5); s2.scale.setScalar(1.5); g.add(s2);
    } else if (kind === 'corridor') {
      g.add(B.zigzag([[-14, 0, 3], [-7, 0, -2], [0, 0, 2], [7, 0, -2], [13, 0, 3]], 2.2));
      const pav = B.pavilion({ w: 4.6, h: 3.6, sides: 6 });
      pav.position.set(15, 0, 4); g.add(pav);
      const sb = B.stele(name); sb.position.set(-15, 0, 4.5); g.add(sb);
    }
    return g;
  }

  function buildExtras(course, terrain) {
    const B = Buildings, m = B.mats();
    let added = 0;
    for (const ex of EXTRA) {
      const p = findShore(terrain, ex.anchor[0], ex.anchor[1], 6, 30);
      if (!p) continue;
      const g = buildExtra(ex.kind, ex.name, m);
      const gy = Math.max(0, terrain.heightAt(p.x, p.z));
      const n = shoreNormal(terrain, p.x, p.z);
      g.position.set(p.x, gy, p.z);
      g.rotation.y = Math.atan2(n[0], n[1]) + (UTIL.rng((p.x * 7 + p.z) | 0)() - 0.5) * 0.5;
      L.group.add(g);
      L.list.push({
        name: ex.name, x: p.x, z: p.z, sub: ex.sub,
        gy, hy: gy + 11, visitR: 190, visited: false, extra: true
      });
      added++;
    }
    return added;
  }

  /* ---------------- 沿湖民居（白墙黛瓦衬托） ---------------- */
  function buildVillages(course, terrain, tier) {
    const B = Buildings, m = B.mats();
    const rr = UTIL.rng(987654);
    const cap = (tier && tier.villages) || 44;
    const spots = [];
    const imSpots = [];                                        // 超出 22 处的走合批 IM
    const step = Math.max(9, Math.floor(course.water.length / 95));
    let tries = 0;
    for (let i = 6; i < course.water.length && spots.length < cap && tries < 2000; i += step, tries++) {
      const p = course.water[i];
      let bn = [0, 1], bd = -1e9;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        const sd = terrain.exactShoreDist(p[0] + Math.cos(a) * 8, p[1] + Math.sin(a) * 8);
        if (sd > bd) { bd = sd; bn = [Math.cos(a), Math.sin(a)]; }
      }
      if (bd < 2) continue;
      const off = 22 + rr() * 45;
      const x = p[0] + bn[0] * off, z = p[1] + bn[1] * off;
      if (terrain.exactShoreDist(x, z) < 16) continue;
      const gy = terrain.heightAt(x, z);
      if (gy > 30 || gy < 1.0 || terrain.onCauseway(x, z)) continue;
      let ok = true;
      for (const lm of L.list) if (Math.hypot(x - lm.x, z - lm.z) < 42) { ok = false; break; }
      if (ok) for (const br of course.bridges) if (Math.hypot(x - br.x, z - br.z) < br.r + 22) { ok = false; break; }
      if (ok && L.dock && Math.hypot(x - L.dock.x, z - L.dock.z) < 60) ok = false;
      if (ok) for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < 34) { ok = false; break; }
      if (!ok) continue;
      spots.push({ x, z });
      if (spots.length > 22) { imSpots.push({ x, z, gy }); continue; }   // 超额村舍走合批
      const g = new THREE.Group();
      const nHouse = 1 + ((rr() * 2.4) | 0);
      for (let h2 = 0; h2 < nHouse; h2++) {
        const w = 7 + rr() * 6, d = 5.5 + rr() * 3.5, hh = 3.6 + rr() * 2.0;
        const bodyMat = rr() < 0.7 ? m.plaster : m.brick;
        const hall = B.hall({ w, d, h: hh, bodyMat });
        hall.position.set((rr() - 0.5) * 14, 0, (rr() - 0.5) * 12);
        hall.rotation.y = rr() * Math.PI * 2;
        g.add(hall);
      }
      const wl = 10 + rr() * 10;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wl, 2.2, 0.4), m.plaster);
      wall.position.set((rr() - 0.5) * 8, 1.1, 8 + rr() * 4);
      wall.rotation.y = rr() * Math.PI;
      g.add(wall);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(wl, 0.18, 0.62), m.dark);
      cap.position.set(wall.position.x, 2.28, wall.position.z);
      cap.rotation.y = wall.rotation.y;
      g.add(cap);
      const n = shoreNormal(terrain, x, z);
      g.position.set(x, gy - 0.15, z);
      g.rotation.y = Math.atan2(n[0], n[1]) + (rr() - 0.5) * 0.6;
      L.group.add(g);
    }
    buildInstHouses(imSpots);
    return spots.length;
  }

  /* ---------------- 合批民居 / 沿街商铺 / 旗杆（InstancedMesh，控 draw call） ---------------- */
  function houseGeos() {
    const bodyA = new THREE.BoxGeometry(4.6, 3.0, 3.6); bodyA.translate(0, 1.5, 0);
    const bodyB = new THREE.BoxGeometry(5.8, 3.6, 4.4); bodyB.translate(0, 1.8, 0);
    const roof = new THREE.ConeGeometry(3.3, 1.35, 4);
    roof.rotateY(Math.PI / 4); roof.scale(1.25, 1, 0.85); roof.translate(0, 4.1, 0);
    return { bodyA, bodyB, roof };
  }

  function buildInstHouses(list) {
    if (!list || !list.length) return;
    const rr = UTIL.rng(24680);
    const m = Buildings.mats();
    const g = houseGeos();
    const n = list.length;
    const imA = new THREE.InstancedMesh(g.bodyA, m.plaster, n);
    const imB = new THREE.InstancedMesh(g.bodyB, m.brick, Math.ceil(n / 2));
    const imR = new THREE.InstancedMesh(g.roof, m.roof, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), e = new THREE.Euler();
    let nb = 0;
    for (let i = 0; i < n; i++) {
      const s = list[i];
      const rot = rr() * Math.PI * 2;
      e.set(0, rot, 0); q.setFromEuler(e);
      p3.set(s.x, Math.max(0.5, s.gy) - 0.15, s.z);
      const sc = 0.9 + rr() * 0.5;
      s3.set(sc, sc, sc);
      m4.compose(p3, q, s3);
      if (i % 2 === 0) imA.setMatrixAt(i, m4); else { imB.setMatrixAt(nb++, m4); s3.set(sc * 1.1, sc, sc * 1.1); m4.compose(p3, q, s3); }
      imR.setMatrixAt(i, m4);
    }
    imB.count = nb;
    [imA, imB, imR].forEach(im => { im.frustumCulled = false; L.group.add(im); });
  }

  /* 沿街商铺：北山街 + 南山路两段弧 */
  L.planWaterfront = function (course, terrain) {
    if (course.shopSpots) return course.shopSpots;
    const spots = [];
    const ring = course.water;
    const byName = {};
    (course.landmarks || []).forEach(l => byName[l.name] = l);
    // EXTRA 景点（运行时才 build，此处用锚点表）
    EXTRA.forEach(x => { if (!byName[x.name]) byName[x.name] = { x: x.anchor[0], z: x.anchor[1] }; });
    function nearestIdx(pt) {
      let bi = 0, bd = 1e9;
      for (let i = 0; i < ring.length; i++) {
        const d = Math.hypot(ring[i][0] - pt.x, ring[i][1] - pt.z);
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    }
    const arcs = [];
    if (byName['岳王庙'] && byName['断桥残雪']) arcs.push([nearestIdx(byName['岳王庙']), nearestIdx(byName['断桥残雪'])]);
    if (byName['涌金门'] && byName['长桥公园']) arcs.push([nearestIdx(byName['涌金门']), nearestIdx(byName['长桥公园'])]);
    const rr = UTIL.rng(20260214);
    for (const arc of arcs) {
      const i0 = arc[0], n = ((arc[1] - arc[0]) + ring.length) % ring.length;
      let acc = 0;
      for (let k = 0; k < n && spots.length < 50; k++) {
        const p = ring[(i0 + k) % ring.length], p2 = ring[(i0 + k + 1) % ring.length];
        const dx = p2[0] - p[0], dz = p2[1] - p[1], dl = Math.hypot(dx, dz) || 1;
        acc += dl;
        if (acc < 11) continue; acc = 0;
        const nx = -dz / dl, nz = dx / dl;
        const sgn = terrain.shoreDist(p[0] + nx * 6, p[1] + nz * 6) > terrain.shoreDist(p[0] - nx * 6, p[1] - nz * 6) ? 1 : -1;
        const off = 7 + rr() * 8;
        const x = p[0] + nx * sgn * off, z = p[1] + nz * sgn * off;
        const sd = terrain.exactShoreDist(x, z);
        if (sd < 4 || sd > 18) continue;
        const gy = terrain.heightAt(x, z);
        if (gy < 1.2 || gy > 25 || terrain.onCauseway(x, z)) continue;
        let ok = true;
        for (const lm of course.landmarks) if (Math.hypot(x - lm.x, z - lm.z) < 26) { ok = false; break; }
        if (ok && course.start && Math.hypot(x - course.start.x, z - course.start.z) < 45) ok = false;
        if (ok) for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < 17) { ok = false; break; }
        if (!ok) continue;
        spots.push({ x, z, gy, yaw: Math.atan2(-nx * sgn, nz * sgn) + (rr() - 0.5) * 0.3 });
      }
    }
    course.shopSpots = spots;
    return spots;
  };

  function buildShops(course, terrain, tier) {
    const spots = course.shopSpots || [];
    if (!spots.length) return;
    const rr = UTIL.rng(13579);
    const m = Buildings.mats();
    const g = houseGeos();
    const n = spots.length;
    const bodyIM = new THREE.InstancedMesh(g.bodyA, m.plaster, n);
    const roofIM = new THREE.InstancedMesh(g.roof, m.roof, n);
    const poleGeo = new THREE.CylinderGeometry(0.045, 0.06, 3.4, 5); poleGeo.translate(0, 1.7, 0);
    const poleIM = new THREE.InstancedMesh(poleGeo, m.dark, n);
    const flagGeo = new THREE.PlaneGeometry(0.55, 1.7); flagGeo.translate(0.28, 0, 0); flagGeo.translate(0, 2.4, 0);
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xd8a23c, side: THREE.DoubleSide });
    const flagIM = new THREE.InstancedMesh(flagGeo, flagMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      e.set(0, s.yaw, 0); q.setFromEuler(e);
      const sc = 0.9 + rr() * 0.45;
      p3.set(s.x, Math.max(0.5, s.gy) - 0.1, s.z);
      s3.set(sc, sc, sc);
      m4.compose(p3, q, s3);
      bodyIM.setMatrixAt(i, m4);
      roofIM.setMatrixAt(i, m4);
      // 幌杆立在店侧
      const px = s.x + Math.cos(s.yaw) * 0, pz = s.z + Math.sin(s.yaw) * 0;
      p3.set(px + Math.cos(s.yaw + 1.57) * 2.6, Math.max(0.5, s.gy) - 0.1, pz + Math.sin(s.yaw + 1.57) * 2.6);
      s3.set(1, 1, 1);
      m4.compose(p3, q, s3);
      poleIM.setMatrixAt(i, m4);
      flagIM.setMatrixAt(i, m4);
    }
    [bodyIM, roofIM, poleIM, flagIM].forEach(im => { im.frustumCulled = false; L.group.add(im); });
  }

  /* 放大景旗杆（杏黄三角旗，合批 2 IM） */
  function buildFlags(course, terrain) {
    const list = L.list.filter(l => l.enlarged);
    if (!list.length) return;
    const m = Buildings.mats();
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 7.5, 6); poleGeo.translate(0, 3.75, 0);
    const poleIM = new THREE.InstancedMesh(poleGeo, m.dark, list.length);
    const flagGeo = new THREE.PlaneGeometry(1.15, 0.75); flagGeo.translate(0.58, 0, 0); flagGeo.translate(0, 6.8, 0);
    const flagIM = new THREE.InstancedMesh(flagGeo, new THREE.MeshLambertMaterial({ color: 0xd8a23c, side: THREE.DoubleSide }), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), e = new THREE.Euler();
    for (let i = 0; i < list.length; i++) {
      const lm = list[i];
      e.set(0, Math.random() * 6.28, 0); q.setFromEuler(e);
      p3.set(lm.x, Math.max(0.5, lm.gy || 1) + 0.1, lm.z);
      m4.compose(p3, q, s3);
      poleIM.setMatrixAt(i, m4);
      flagIM.setMatrixAt(i, m4);
    }
    [poleIM, flagIM].forEach(im => { im.frustumCulled = false; L.group.add(im); });
  }

  /* ---------------- 景点照壁（照片素材展示墙） ---------------- */
  function buildPhotoWalls(course, terrain) {
    // 湖心方向基准
    let cx = 0, cz = 0;
    for (let i = 0; i < course.water.length; i += 8) { cx += course.water[i][0]; cz += course.water[i][1]; }
    cx /= Math.ceil(course.water.length / 8); cz /= Math.ceil(course.water.length / 8);
    const WALLS = [
      ['保俶塔', 'baochu', '保俶塔'], ['雷峰塔', 'leifeng', '雷峰塔'], ['断桥残雪', 'duanqiao', '断桥残雪'],
      ['城隍阁', 'chenghuang', '城隍阁'], ['湖心亭', 'huxinting', '湖心亭'], ['岳王庙', 'yuewangmiao', '岳王庙'],
      ['西泠印社', 'xiling', '西泠印社'], ['三潭印月', 'santan', '三潭印月'], ['钱王祠', 'qianwang', '钱王祠'],
      ['苏堤春晓', 'sucauseway', '苏堤春晓']
    ];
    for (const [lmName, key, title] of WALLS) {
      const lm = L.list.find(l => l.name === lmName) || Landmarks_list_fallback(lmName);
      if (!lm) continue;
      const dx = cx - lm.x, dz = cz - lm.z;
      const dl = Math.hypot(dx, dz) || 1;
      const nx = dx / dl, nz = dz / dl;
      // 从景点向湖心推进，找近水窄带落点（岸距 2.5-9m）
      let px = null, pz = null;
      for (let t = 6; t <= 46; t += 2) {
        const x = lm.x + nx * t, z = lm.z + nz * t;
        const sd = terrain.exactShoreDist(x, z);
        if (sd >= 2.5 && sd <= 9 && terrain.heightAt(x, z) > 1.2) { px = x; pz = z; break; }
      }
      if (px === null) { px = lm.x + nx * 12; pz = lm.z + nz * 12; }
      const wall = Buildings.photoWall(key, 4.4, 2.9, title);
      wall.position.set(px, Math.max(0.6, terrain.heightAt(px, pz)) - 0.05, pz);
      wall.rotation.y = Math.atan2(nx, nz);   // 画面朝湖
      L.group.add(wall);
    }
    function Landmarks_list_fallback(nm) { return L.list.find(l => l.name.indexOf(nm.slice(0, 2)) >= 0) || null; }
  }

  /* ---------------- 游客（InstancedMesh 人形，沿岸漫步） ---------------- */
  let visitorMesh = null, visitorData = [], visitorTerrain = null;
  function buildVisitors(course, terrain, tier) {
    const VR = UTIL.rng(555777);
    visitorTerrain = terrain;
    const perMark = (tier && tier.trees >= 750) ? 10 : 6;
    const leg = new THREE.BoxGeometry(0.26, 0.5, 0.2); leg.translate(0, 0.25, 0);
    const torso = new THREE.BoxGeometry(0.38, 0.62, 0.24); torso.translate(0, 0.82, 0);
    const bodyGeo = UTIL.merge([leg, torso]);
    const headGeo = new THREE.SphereGeometry(0.115, 8, 6); headGeo.translate(0, 1.26, 0);
    const data = [];
    for (const lm of L.list) {
      const k = perMark + ((VR() * 4) | 0);
      for (let i = 0; i < k; i++) {
        for (let t2 = 0; t2 < 8; t2++) {
          const a = VR() * Math.PI * 2, r2 = 5 + VR() * 20;
          const x = lm.x + Math.cos(a) * r2, z = lm.z + Math.sin(a) * r2;
          if (terrain.exactShoreDist(x, z) < 3) continue;
          const gy = terrain.heightAt(x, z);
          if (gy < 1.4 || gy > 40) continue;
          data.push({
            cx: x, cz: z, r2: 3 + VR() * 9, a: VR() * Math.PI * 2,
            w: (0.1 + VR() * 0.22) * (VR() < 0.5 ? 1 : -1),
            y: gy, s: 0.9 + VR() * 0.22, pause: 0
          });
          break;
        }
      }
    }
    const N = data.length;
    if (!N) return;
    const im = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
    const imH = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xd8b394 }), N);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    imH.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    const coatCols = [0x8a3a2e, 0x3e5a72, 0x6a6f52, 0x7a5a86, 0xa8843c, 0x4e6e5a, 0x8a8a92, 0x364048];
    for (let i = 0; i < N; i++) {
      c.setHex(coatCols[(VR() * coatCols.length) | 0]).offsetHSL((VR() - 0.5) * 0.04, 0, (VR() - 0.5) * 0.08);
      im.setColorAt(i, c);
    }
    im.frustumCulled = false; imH.frustumCulled = false;
    im.renderOrder = 1; imH.renderOrder = 1;
    L.group.add(im); L.group.add(imH);
    visitorMesh = { im, imH };
    visitorData = data;
    L.update(0);
  }

  L.update = function (dt) {
    if (!visitorMesh || !visitorData.length) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < visitorData.length; i++) {
      const v = visitorData[i];
      if (dt > 0) {
        if (v.pause > 0) v.pause -= dt;
        else {
          v.a += v.w * dt;
          if (Math.random() < dt * 0.05) {
            v.pause = 1 + Math.random() * 2.5;
            if (Math.random() < 0.4) v.w *= -1;
          }
        }
      }
      const x = v.cx + Math.cos(v.a) * v.r2;
      const z = v.cz + Math.sin(v.a) * v.r2;
      const sgn = v.w >= 0 ? 1 : -1;
      p3.set(x, visitorTerrain ? visitorTerrain.heightAt(x, z) : v.y, z);
      q.setFromAxisAngle(up, Math.atan2(-Math.sin(v.a) * sgn, Math.cos(v.a) * sgn));
      s3.set(v.s, v.s, v.s);
      m4.compose(p3, q, s3);
      visitorMesh.im.setMatrixAt(i, m4);
      visitorMesh.imH.setMatrixAt(i, m4);
    }
    visitorMesh.im.instanceMatrix.needsUpdate = true;
    visitorMesh.imH.instanceMatrix.needsUpdate = true;
  };

  L.build = function (scene, course, terrain, tier) {
    const B = Buildings, T = Textures;
    const m = B.mats();
    const byName = {};
    course.landmarks.forEach(l => byName[l.name] = l);
    const root = new THREE.Group();
    L.group = root; L.list = []; L.obstacles = [];

    function place(name, obj, opt) {
      opt = opt || {};
      const lm = byName[name];
      if (!lm) return null;
      const gy = opt.y !== undefined ? opt.y : Math.max(0, terrain.heightAt(lm.x, lm.z));
      obj.position.set(lm.x, gy, lm.z);
      if (opt.rotY) obj.rotation.y = opt.rotY;
      root.add(obj);
      lm.gy = gy;
      lm.hy = gy + (opt.hy !== undefined ? opt.hy : (lm.h || 12));
      lm.visitR = opt.visitR || UTIL.clamp(lm.r * 0.42, 130, 260);
      if (opt.enlarged) lm.enlarged = true;
      lm.visited = false;
      L.list.push(lm);
      return lm;
    }

    /* 1. 湖滨·集贤亭（放大主体） */
    place('湖滨·集贤亭', B.pavilion({ w: 10.2, h: 7.2, sides: 8, plaque: '集贤亭' }), { rotY: -Math.PI / 2, hy: 13, visitR: 240, enlarged: true });

    /* 2. 断桥残雪（石碑，桥本体在六桥段） */
    place('断桥残雪', B.stele('断桥残雪'), { y: 1.78, hy: 12, visitR: 160 });

    /* 3. 保俶塔：宝石山巅七级砖塔（放大） */
    place('保俶塔', B.pagoda({
      tiers: 7, baseR: 5.4, tierHs: [8.4, 7.9, 7.4, 7.2, 7.0, 6.6, 6.4],
      shrink: 0.92, plain: true, bodyMat: m.brick, finialH: 8.0
    }), { hy: 70, visitR: 360, enlarged: true });

    /* 4. 平湖秋月：临水平台 + 八角亭 */
    const ph = new THREE.Group();
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 0.9, 24), m.stone);
    plat.position.y = 0.55; ph.add(plat);
    const pav4 = B.pavilion({ w: 5.8, h: 4.0, sides: 8, plaque: '平湖秋月' });
    pav4.position.y = 0.9; ph.add(pav4);
    const lan1 = B.lantern(1.6); lan1.position.set(6.5, 1.0, 3.5); ph.add(lan1);
    const lan2 = B.lantern(1.6); lan2.position.set(-6.5, 1.0, 3.5); ph.add(lan2);
    place('平湖秋月', ph, { hy: 13 });

    /* 5. 孤山·中山公园：牌坊 + 院墙 */
    const gs = new THREE.Group();
    const pf = B.paifang({ w: 9.5, h: 6.8 }); gs.add(pf);
    const wr1 = B.wallRun([[-6, 0, 2], [-22, 0, 2], [-34, 0, 6]], 2.5, 0.5); gs.add(wr1);
    const wr2 = B.wallRun([[6, 0, 2], [22, 0, 2], [34, 0, 6]], 2.5, 0.5); gs.add(wr2);
    place('孤山·中山公园', gs, { rotY: -Math.PI / 2, hy: 15 });

    /* 6. 曲院风荷：方亭 + 辅厅 */
    const qy = new THREE.Group();
    qy.add(B.pavilion({ w: 5.2, h: 3.8, sides: 4, plaque: '曲院风荷' }));
    const qh = B.hall({ w: 11, d: 7.5, h: 4.6 });
    qh.position.set(11, 0, -5); qh.rotation.y = 0.5; qy.add(qh);
    place('曲院风荷', qy, { hy: 12 });

    /* 7. 苏堤春晓：堤上亭 + 碑 */
    const sd = new THREE.Group();
    sd.add(B.pavilion({ w: 4.4, h: 3.4, sides: 4 }));
    const sdSt = B.stele('苏堤春晓'); sdSt.position.set(5.5, 0, 1.5); sd.add(sdSt);
    place('苏堤春晓', sd, { y: 1.78, hy: 11, visitR: 170 });

    /* 8. 郭庄：白墙 + 门楼 */
    const gz = new THREE.Group();
    const gw1 = B.wallRun([[-14, 0, 0], [0, 0, 0]], 2.8, 0.45); gz.add(gw1);
    const gw2 = B.wallRun([[0, 0, 0], [13, 0, 0]], 2.8, 0.45); gz.add(gw2);
    const gateW = 4.6, gateH = 3.4;
    const gp = new THREE.Mesh(new THREE.BoxGeometry(gateW, gateH, 0.6), m.plaster);
    gp.position.set(0, gateH / 2, 0); gz.add(gp);
    const gOpen = new THREE.Mesh(new THREE.BoxGeometry(2.2, gateH - 0.5, 0.7), m.dark);
    gOpen.position.set(0, (gateH - 0.5) / 2, 0); gz.add(gOpen);
    const cap = new THREE.Mesh(B.roofHipGeo(gateW + 1.2, 1.7, 0.9, 0.35, 0.3), m.roofDark);
    cap.position.y = gateH; gz.add(cap);
    place('郭庄', gz, { hy: 13 });

    /* 9. 茅家埠：水乡民居两座 */
    const mj = new THREE.Group();
    const mh1 = B.hall({ w: 12, d: 8, h: 5 }); mj.add(mh1);
    const mh2 = B.hall({ w: 9, d: 6.5, h: 4.2 });
    mh2.position.set(12, 0, 7); mh2.rotation.y = -0.4; mj.add(mh2);
    place('茅家埠', mj, { rotY: 0.8, hy: 14 });

    /* 10. 三潭印月：岛上亭 + 碑 + 湖中三塔（边长 62m 等边三角形，岛南） */
    const l3 = byName['三潭印月'];
    if (l3) {
      const isl = new THREE.Group();
      isl.add(B.pavilion({ w: 5.6, h: 4.0, sides: 6, plaque: '小瀛洲' }));
      const st3 = B.stele('三潭印月'); st3.position.set(7, 0, -4); isl.add(st3);
      const islGy = Math.max(0, terrain.heightAt(l3.x, l3.z));
      isl.position.set(l3.x, islGy, l3.z);
      root.add(isl);
      l3.gy = islGy; l3.hy = islGy + (l3.h || 14);
      l3.visitR = 300; l3.visited = false; L.list.push(l3);
      const s = 62, cs = s / Math.sqrt(3);
      const spots = [
        [l3.x, l3.z + 118 - cs],
        [l3.x + cs * Math.cos(Math.PI / 6), l3.z + 118 + cs * Math.sin(Math.PI / 6)],
        [l3.x - cs * Math.cos(Math.PI / 6), l3.z + 118 + cs * Math.sin(Math.PI / 6)]
      ];
      spots.forEach(p => {
        const st = stoneLantern(m);
        st.position.set(p[0], 0.02, p[1]);
        root.add(st);
        L.obstacles.push({ x: p[0], z: p[1], r: 3.2 });
      });
    }

    /* 11. 湖心亭：大八角亭 + 四角灯笼（放大） */
    const hx = new THREE.Group();
    hx.add(B.pavilion({ w: 11.8, h: 7.6, sides: 8, plaque: '湖心亭' }));
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const ln = B.lantern(1.9);
      ln.position.set(Math.cos(a) * 8.6, 0.7, Math.sin(a) * 8.6);
      hx.add(ln);
    }
    place('湖心亭', hx, { hy: 18, visitR: 270, enlarged: true });

    /* 12. 阮公墩：小六角亭 */
    place('阮公墩', B.pavilion({ w: 4.6, h: 3.4, sides: 6 }), { hy: 10, visitR: 150 });

    /* 13. 花港观鱼：亭 + 碑 */
    const hg = new THREE.Group();
    hg.add(B.pavilion({ w: 5.4, h: 3.8, sides: 8, plaque: '花港观鱼' }));
    const hgSt = B.stele('花港观鱼'); hgSt.position.set(7, 0, 3); hg.add(hgSt);
    place('花港观鱼', hg, { rotY: 0.3, hy: 12 });

    /* 14. 雷峰塔：五级大塔（放大） */
    place('雷峰塔', B.pagoda({
      tiers: 5, baseR: 24, tierHs: [19.2, 17.8, 16.8, 15.6, 14.3],
      shrink: 0.9, bodyMat: m.brick, roofMat: m.roofDark, finialH: 14.4
    }), { hy: 88, visitR: 400, enlarged: true });

    /* 15. 净慈寺：大殿 + 院墙（放大） */
    const jc = new THREE.Group();
    jc.add(B.hall({ w: 44, d: 25, h: 16.5 }));
    const cw1 = B.wallRun([[-26, 0, -17], [26, 0, -17]], 2.4, 0.5); jc.add(cw1);
    const cw2 = B.wallRun([[-26, 0, 17], [-26, 0, -17]], 2.4, 0.5); jc.add(cw2);
    const cw3 = B.wallRun([[26, 0, 17], [26, 0, -17]], 2.4, 0.5); jc.add(cw3);
    place('净慈寺', jc, { rotY: Math.PI, hy: 27, visitR: 300, enlarged: true });

    /* 16. 柳浪闻莺 */
    place('柳浪闻莺', B.pavilion({ w: 5.0, h: 3.6, sides: 6 }), { hy: 11 });

    /* 17. 城隍阁：吴山之巅三层楼阁（放大） */
    place('城隍阁', B.pagoda({
      tiers: 3, baseR: 21, tierHs: [16, 14.2, 12.3],
      shrink: 0.88, bodyMat: m.plaster, roofMat: m.roofDark, finialH: 10.5
    }), { hy: 42, visitR: 380, enlarged: true });

    /* ---------------- 六桥（按所属堤分类命名 + 拱桥建模） ---------------- */
    const groups = { '苏堤': [], '杨公堤': [], '白堤': [] };
    course.bridges.forEach(br => {
      const nc = nearestCauseway(course, br.x, br.z);
      const key = nc.name && groups[nc.name] ? nc.name : '苏堤';
      groups[key].push({ br, nc });
    });
    // 白堤：近断桥者 = 断桥，其余 = 锦带桥
    const dq = byName['断桥残雪'];
    groups['白堤'].sort((a, b) => (dq ? Math.hypot(a.br.x - dq.x, a.br.z - dq.z) : 0) - (dq ? Math.hypot(b.br.x - dq.x, b.br.z - dq.z) : 0));
    // 苏堤/杨公堤：按 z 升序（北→南）
    groups['苏堤'].sort((a, b) => a.br.z - b.br.z);
    groups['杨公堤'].sort((a, b) => a.br.z - b.br.z);

    function buildBridge(item, name, opt) {
      opt = opt || {};
      const br = item.br, seg = item.nc.seg || [[0, 0], [1, 0]];
      const dx = seg[1][0] - seg[0][0], dz = seg[1][1] - seg[0][1];
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len, pz = dx / len;              // 垂直于堤 = 桥轴
      const span = UTIL.clamp(br.r * 1.35, 15, 30);
      const g = B.archBridge({
        span, width: opt.width || 12,
        rise: opt.rise !== undefined ? opt.rise : Math.min(5.5, span * 0.24),
        plaque: name
      });
      g.position.set(br.x, opt.y !== undefined ? opt.y : 0.22, br.z);
      // local +X → (cos ry, -sin ry) 需等于 (px, pz)：ry = atan2(-pz, px)
      g.rotation.y = Math.atan2(-pz, px);
      root.add(g);
      L.obstacles.push({ x: br.x, z: br.z, r: span * 0.22, bridge: true });
    }

    groups['苏堤'].forEach((item, i) => {
      const idx = Math.round(i * (SUDI_NAMES.length - 1) / Math.max(1, groups['苏堤'].length - 1));
      buildBridge(item, SUDI_NAMES[idx], { width: 12 });
    });
    groups['杨公堤'].forEach((item, i) => {
      const idx = Math.round(i * (YANG_NAMES.length - 1) / Math.max(1, groups['杨公堤'].length - 1));
      buildBridge(item, YANG_NAMES[idx], { width: 12 });
    });
    groups['白堤'].forEach((item, i) => {
      buildBridge(item, i === 0 ? '断桥' : '锦带桥', { width: 14, rise: 2.4, y: 0.3 });
    });

    /* ---------------- 起点码头（螺旋搜索陆点） ---------------- */
    const st = course.start;
    let dock = null;
    outer:
    for (let r = 12; r <= 150; r += 6) {
      for (let a = 0; a < Math.PI * 2; a += 0.26) {
        const x = st.x + Math.cos(a) * r, z = st.z + Math.sin(a) * r;
        if (terrain.exactShoreDist(x, z) > 4.5 && !terrain.onCauseway(x, z) && terrain.heightAt(x, z) < 8) {
          dock = { x, z }; break outer;
        }
      }
    }
    if (!dock) dock = { x: st.x + 30, z: st.z + 30 };
    const dg = B.dock({ len: 14, wid: 4.5 });
    const ddx = st.x - dock.x, ddz = st.z - dock.z, dl = Math.hypot(ddx, ddz) || 1;
    dg.position.set(dock.x, 0.55, dock.z);
    dg.rotation.y = Math.atan2(-ddz / dl, ddx / dl);
    root.add(dg);
    L.dock = { x: dock.x, z: dock.z, ry: dg.rotation.y };

    /* 城市天际线（东侧远景） */
    root.add(B.city(course));

    /* 景点照壁/景墙（照片素材展示） */
    buildPhotoWalls(course, terrain);

    /* 扩展：新景点 + 沿湖民居（游客改由 figures.js 古装人物系统接管，见 world.js） */
    buildExtras(course, terrain);
    buildVillages(course, terrain, tier);
    buildShops(course, terrain, tier);
    buildFlags(course, terrain);

    scene.add(root);
    return L;
  };
  return L;
})();
