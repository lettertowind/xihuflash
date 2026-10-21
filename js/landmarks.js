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
      // 大建筑多点采样取最高地面，防坡地悬空；落差大时垫石砌台基
      let gy = 0, gyMin = 1e9, gyMinRaw = 1e9;
      for (let k = 0; k < 9; k++) {
        const sx = k === 0 ? 0 : Math.cos(k / 8 * 6.2832) * 14;
        const sz = k === 0 ? 0 : Math.sin(k / 8 * 6.2832) * 14;
        const hh = terrain.heightAt(p.x + sx, p.z + sz);
        gy = Math.max(gy, hh); gyMin = Math.min(gyMin, hh);
        gyMinRaw = Math.min(gyMinRaw, hh);
      }
      gy = Math.max(0, gy); gyMin = Math.max(0, gyMin);
      /* 与 place() 同一套限制：抬升最多比中心点高 6m，否则山脚的小祠会被抬到山顶上悬空 */
      const hC = terrain.heightAt(p.x, p.z);
      if (gy > hC + 6) gy = Math.max(1.0, hC + 6);
      if (gy - gyMin > 0.6) {
        const platH = (gyMinRaw < 0.3)
          ? Math.max(gy - gyMin + 1.2, gy + 2.6)     // 临水：台基沉到水面以下
          : (gy - gyMin + 1.2);
        const plat = new THREE.Mesh(new THREE.BoxGeometry(32, platH, 32), m.stone);
        plat.position.set(0, -platH / 2 + 0.6, 0);
        g.add(plat);
      }
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

  /* footprint 避让：中心 + 8 向外沿都不得压堤（防村舍/商铺穿堤穿桥） */
  function clearSpot(terrain, x, z, r) {
    if (terrain.onCauseway(x, z)) return false;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * 6.2832;
      if (terrain.onCauseway(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
    }
    return true;
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
      if (gy > 30 || gy < 1.0 || !clearSpot(terrain, x, z, 8)) continue;
      let ok = true;
      for (const lm of L.list) if (Math.hypot(x - lm.x, z - lm.z) < 42) { ok = false; break; }
      if (ok) for (const br of course.bridges) if (Math.hypot(x - br.x, z - br.z) < br.r + 26) { ok = false; break; }
      if (ok && L.dock && Math.hypot(x - L.dock.x, z - L.dock.z) < 60) ok = false;
      if (ok) for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < 34) { ok = false; break; }
      if (!ok) continue;
      spots.push({ x, z });
      if (spots.length > 22) { imSpots.push({ x, z, gy }); continue; }   // 超额村舍走合批
      const g = new THREE.Group();
      const halls = [];                                    // 收集主屋：落位后换算成世界坐标做碰撞圆
      const nHouse = 1 + ((rr() * 2.4) | 0);
      for (let h2 = 0; h2 < nHouse; h2++) {
        const w = 7 + rr() * 6, d = 5.5 + rr() * 3.5, hh = 3.6 + rr() * 2.0;
        const bodyMat = rr() < 0.7 ? m.plaster : m.brick;
        const hall = B.hall({ w, d, h: hh, bodyMat });
        hall.position.set((rr() - 0.5) * 14, 0, (rr() - 0.5) * 12);
        hall.rotation.y = rr() * Math.PI * 2;
        hall.userData.hr = 0.5 * Math.max(w, d) * 1.08 + 0.3;   // 半对角近似
        halls.push(hall);
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
      /* 房屋 / 院墙 → 世界坐标碰撞圆（v2.2 岸上不许穿屋） */
      const cR = Math.cos(g.rotation.y), sR = Math.sin(g.rotation.y);
      const toW = (lx, lz) => [x + lx * cR + lz * sR, z - lx * sR + lz * cR];
      for (let k = 0; k < halls.length; k++) {
        const p = toW(halls[k].position.x, halls[k].position.z);
        L.houses.push({ x: p[0], z: p[1], r: halls[k].userData.hr });
      }
      {
        const wa = wall.rotation.y, wc = Math.cos(wa), ws = Math.sin(wa);
        for (let k = -1; k <= 1; k++) {
          const t = k * wl * 0.38;
          const p = toW(wall.position.x + t * wc, wall.position.z - t * ws);
          L.houses.push({ x: p[0], z: p[1], r: 1.1 });
        }
      }
    }
    buildInstHouses(imSpots);
    return spots.length;
  }

  /* ---------------- 合批民居 / 沿街商铺 / 旗杆（InstancedMesh，控 draw call） ---------------- */
  /* 马头墙 / 观音兜轮廓（Extrude：白墙正面 + 黛瓦压顶侧边） */
  function gableGeo(style, rr) {
    const shape = new THREE.Shape();
    if (style === 'guanyin') {
      shape.moveTo(0, 0); shape.lineTo(0, 2.6);
      shape.quadraticCurveTo(1.4, 3.4, 2.8, 1.7);
      shape.lineTo(2.8, 0);
    } else {
      shape.moveTo(0, 0); shape.lineTo(0, 2.7); shape.lineTo(0.5, 2.7);
      shape.lineTo(0.5, 3.5); shape.lineTo(1.1, 3.5);
      shape.lineTo(1.1, 4.3); shape.lineTo(1.6, 4.3);
      shape.lineTo(1.6, 3.5); shape.lineTo(2.2, 3.5);
      shape.lineTo(2.2, 2.7); shape.lineTo(2.7, 2.7);
      shape.lineTo(2.7, 0);
    }
    shape.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
    g.translate(-1.35, 0, -0.28);
    return g;
  }

  function houseGeos() {
    const bodyA = new THREE.BoxGeometry(4.6, 3.0, 3.6); bodyA.translate(0, 1.5, 0);
    const bodyB = new THREE.BoxGeometry(5.8, 3.6, 4.4); bodyB.translate(0, 1.8, 0);
    const roofA = Buildings.roofGableGeo(4.6, 3.6, 1.35, 0.62); roofA.translate(0, 3.0, 0);
    const roofB = Buildings.roofGableGeo(5.8, 4.4, 1.6, 0.72); roofB.translate(0, 3.6, 0);
    const gable = gableGeo('matou');
    const win = new THREE.PlaneGeometry(1.7, 1.15);
    const door = new THREE.PlaneGeometry(1.25, 1.95);
    return { bodyA, bodyB, roofA, roofB, gable, win, door };
  }

  function buildInstHouses(list) {
    if (!list || !list.length) return;
    const rr = UTIL.rng(24680);
    const m = Buildings.mats();
    const g = houseGeos();
    const n = list.length;
    const imA = new THREE.InstancedMesh(g.bodyA, m.plaster, n);
    const imB = new THREE.InstancedMesh(g.bodyB, m.brick, Math.ceil(n / 2));
    const imRA = new THREE.InstancedMesh(g.roofA, m.roof, n);
    const imRB = new THREE.InstancedMesh(g.roofB, m.roof, Math.ceil(n / 2));
    const imG = new THREE.InstancedMesh(g.gable, [m.plaster, m.roofDark], n);
    const imW = new THREE.InstancedMesh(g.win, m.window, n);
    const imD = new THREE.InstancedMesh(g.door, m.woodDark, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), e = new THREE.Euler();
    const loc = new THREE.Matrix4(), out = new THREE.Matrix4();
    let ia = 0, ib = 0;
    for (let i = 0; i < n; i++) {
      const s = list[i];
      const rot = rr() * Math.PI * 2;
      e.set(0, rot, 0); q.setFromEuler(e);
      p3.set(s.x, Math.max(0.5, s.gy) - 0.15, s.z);
      const sc = 0.9 + rr() * 0.5;
      s3.set(sc, sc, sc);
      /* v2.2：合批村舍也要有碰撞（bodyA 4.6×3.6 / bodyB 5.8×4.4，取半对角 + 余量） */
      L.houses.push({ x: s.x, z: s.z, r: (i % 2 === 1 ? 3.75 : 3.05) * sc });
      m4.compose(p3, q, s3);
      const isB = i % 2 === 1;
      if (isB) { imB.setMatrixAt(ib, m4); imRB.setMatrixAt(ib, m4); ib++; }
      else { imA.setMatrixAt(ia, m4); imRA.setMatrixAt(ia, m4); ia++; }
      imG.setMatrixAt(i, m4);
      // 格扇窗：正面两扇
      loc.makeTranslation(0, 1.7, (isB ? 2.24 : 1.84));
      out.multiplyMatrices(m4, loc); imW.setMatrixAt(i, out);
      // 石库门（暗色双扇）：正面中央
      loc.makeTranslation(0, 0.98, (isB ? 2.26 : 1.86));
      out.multiplyMatrices(m4, loc); imD.setMatrixAt(i, out);
    }
    imA.count = ia; imRA.count = ia; imB.count = ib; imRB.count = ib;
    [imA, imB, imRA, imRB, imG, imW, imD].forEach(im => { im.frustumCulled = false; L.group.add(im); });
  }

  /* ---------------- 水路两侧人家：临水民居带（合批）+ 檐下灯笼指路 ----------------
     沿水域环线连续排布，正面朝水，檐口挂灯；夜间灯笼自发光 + 加色光晕连成两条灯链，
     既符合江南水乡实景，也给夜航指明航道边界。 */
  const ROUTE = { lan: [], glow: null, mat: null, pts: null, halo: null, haloMat: null };
  L.routeLanterns = [];

  const G0W = 5.4, G0D = 4.2, G0H = 3.05;      // 临水民居基准尺寸（落位采样用）

  function watersideGeos() {
    const w = G0W, d = G0D, h = G0H;
    const body = new THREE.BoxGeometry(w, h, d); body.translate(0, h / 2, 0);
    const roof = Buildings.roofGableGeo(w, d, 1.42, 0.76); roof.translate(0, h, 0);
    const gable = gableGeo('matou');                                   // 高约 4.3，宽 2.7
    const win = new THREE.PlaneGeometry(1.5, 1.05);
    const door = new THREE.PlaneGeometry(1.15, 1.9);
    const lanGeo = new THREE.SphereGeometry(0.26, 10, 8); lanGeo.scale(1, 1.2, 1);
    const capGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.05, 7);
    // 正脊瓦：屋脊上通长一道深色压条，两端略翘——江南民居的轮廓辨识度主要靠它
    const ridgeGeo = new THREE.BoxGeometry(w + 1.5, 0.13, 0.3); ridgeGeo.translate(0, h + 1.44, 0);
    const ridgeEndGeo = new THREE.BoxGeometry(0.34, 0.5, 0.34); ridgeEndGeo.translate(0, h + 1.66, 0);
    // 石砌墙基：顶面与墙体底面齐平，向下延伸 3.4m 埋进坡地，坡地落差由它填实
    const baseGeo = new THREE.BoxGeometry(w + 0.7, 3.4, d + 0.7);
    baseGeo.translate(0, -1.7, 0);
    return { w, d, h, body, roof, gable, win, door, lanGeo, capGeo, baseGeo, ridgeGeo, ridgeEndGeo };
  }

  function buildWaterside(course, terrain, tier) {
    const B = Buildings, m = B.mats();
    const cap = (tier && tier.waterside) || 190;
    const rr = UTIL.rng(778899);
    const ring = course.water;
    const spots = [];
    const avoid = [];
    L.list.forEach(l => avoid.push({ x: l.x, z: l.z, r: 40 }));
    (course.shopSpots || []).forEach(s => avoid.push({ x: s.x, z: s.z, r: 15 }));
    let acc = 0;
    for (let i = 2; i < ring.length && spots.length < cap; i++) {
      const p = ring[i], p2 = ring[i + 1 < ring.length ? i + 1 : 0];
      const dx = p2[0] - p[0], dz = p2[1] - p[1], dl = Math.hypot(dx, dz) || 1;
      acc += dl;
      if (acc < 26) continue;
      acc = 0;
      if (rr() < 0.18) continue;                                        // 留出空档（园林/山脚）
      const nx = -dz / dl, nz = dx / dl;
      const sgn = terrain.shoreDist(p[0] + nx * 6, p[1] + nz * 6) > terrain.shoreDist(p[0] - nx * 6, p[1] - nz * 6) ? 1 : -1;
      const off = 9 + rr() * 12;                                        // 距水边 9~21m，檐口临水
      const x = p[0] + nx * sgn * off, z = p[1] + nz * sgn * off;
      const sd = terrain.exactShoreDist(x, z);
      if (sd < 5 || sd > 42) continue;
      if (terrain.onCauseway(x, z) || !clearSpot(terrain, x, z, 6)) continue;
      const gy0 = terrain.heightAt(x, z);
      if (gy0 < 1.0 || gy0 > 20) continue;
      // 正面（局部 +Z）朝水
      const yaw = Math.atan2(-nx * sgn, -nz * sgn);
      /* 台基落位：房子不能再"用中心点高度拍上去"（坡地会半悬空）。
         取 footprint 9 点地形高度：以中心高度落位，下坡侧由石砌台基填到地面，
         上坡侧允许埋进坡体。两侧落差都超过台基深度才放弃。 */
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const hw = G0W / 2, hd = G0D / 2;
      let hmin = gy0, hmax = gy0;
      for (let k = 0; k < 9; k++) {
        const lx = ((k % 3) - 1) * hw, lz = (((k / 3) | 0) - 1) * hd;
        const hh = terrain.heightAt(x + lx * cs + lz * sn, z - lx * sn + lz * cs);
        if (hh < hmin) hmin = hh;
        if (hh > hmax) hmax = hh;
      }
      if (gy0 - hmin > 2.3 || hmax - gy0 > 2.3) continue;               // 台基/埋深兜不住
      const gy = gy0;
      let ok = true;
      for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r) { ok = false; break; }
      if (ok) for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < 12.5) { ok = false; break; }
      if (!ok) continue;
      spots.push({
        x, z, gy, yaw, sd,
        sc: 0.86 + rr() * 0.42,
        tall: 0.92 + rr() * 0.3,
        brick: rr() < 0.35
      });
    }
    if (!spots.length) return 0;

    const G = watersideGeos();
    const n = spots.length;
    const imBody = new THREE.InstancedMesh(G.body, m.plaster, n);
    const imBody2 = new THREE.InstancedMesh(G.body, m.brick, n);
    const imRoof = new THREE.InstancedMesh(G.roof, m.roof, n);
    const imGable = new THREE.InstancedMesh(G.gable, [m.plaster, m.roofDark], n * 2);
    const imWin = new THREE.InstancedMesh(G.win, m.window, n * 2);
    const imDoor = new THREE.InstancedMesh(G.door, m.woodDark, n);
    const imBase = new THREE.InstancedMesh(G.baseGeo, m.stone, n);
    const imLan = new THREE.InstancedMesh(G.lanGeo, m.nightLantern, n * 3);
    const imCap = new THREE.InstancedMesh(G.capGeo, m.dark, n * 3);
    const imRidge = new THREE.InstancedMesh(G.ridgeGeo, m.roofDark, n);
    const imRidgeEnd = new THREE.InstancedMesh(G.ridgeEndGeo, m.roofDark, n * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), e = new THREE.Euler();
    const loc = new THREE.Matrix4(), out = new THREE.Matrix4();
    let iA = 0, iB = 0;
    const lanPos = [];
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      e.set(0, s.yaw, 0); q.setFromEuler(e);
      p3.set(s.x, Math.max(0.6, s.gy) - 0.10, s.z);
      s3.set(s.sc, s.sc * s.tall, s.sc);
      m4.compose(p3, q, s3);
      imRoof.setMatrixAt(i, m4);
      imBase.setMatrixAt(i, m4);
      imRidge.setMatrixAt(i, m4);
      for (let k = 0; k < 2; k++) {
        loc.makeTranslation((k ? 1 : -1) * (G.w + 1.5) / 2, 0, 0);
        out.multiplyMatrices(m4, loc);
        imRidgeEnd.setMatrixAt(i * 2 + k, out);
      }
      if (s.brick) imBody2.setMatrixAt(iB++, m4); else imBody.setMatrixAt(iA++, m4);
      // 两端马头墙（旋转 90° 使其横跨进深方向）
      for (let k = 0; k < 2; k++) {
        loc.makeTranslation((k ? 1 : -1) * (G.w / 2 + 0.08) * s.sc, 0, 0);
        out.multiplyMatrices(m4, loc);
        const gq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.yaw + Math.PI / 2, 0));
        const gs = new THREE.Vector3((G.d + 1.4) / 2.7, (G.h + 1.5) / 4.3, 1);
        const gm = new THREE.Matrix4().compose(
          new THREE.Vector3(out.elements[12], out.elements[13], out.elements[14]), gq, gs);
        imGable.setMatrixAt(i * 2 + k, gm);
      }
      // 临水格扇窗 + 石库门
      for (let k = 0; k < 2; k++) {
        loc.makeTranslation((k ? 1 : -1) * 1.45 * s.sc, 1.72 * s.tall * s.sc, (G.d / 2 + 0.03) * s.sc);
        out.multiplyMatrices(m4, loc); imWin.setMatrixAt(i * 2 + k, out);
      }
      loc.makeTranslation(0, 0.96 * s.tall * s.sc, (G.d / 2 + 0.05) * s.sc);
      out.multiplyMatrices(m4, loc); imDoor.setMatrixAt(i, out);
      // 檐下三盏灯笼（正面两盏 + 侧面一盏）：夜里成串发亮
      const lant = [[-1.8, G.h - 0.1, G.d / 2 + 0.5], [1.8, G.h - 0.1, G.d / 2 + 0.5], [G.w / 2 + 0.4, G.h - 0.1, -0.6]];
      for (let k = 0; k < 3; k++) {
        loc.makeTranslation(lant[k][0] * s.sc, lant[k][1] * s.tall * s.sc, lant[k][2] * s.sc);
        out.multiplyMatrices(m4, loc);
        imLan.setMatrixAt(i * 3 + k, out);
        loc.makeTranslation(lant[k][0] * s.sc, (lant[k][1] + 0.2) * s.tall * s.sc, lant[k][2] * s.sc);
        out.multiplyMatrices(m4, loc);
        imCap.setMatrixAt(i * 3 + k, out);
        lanPos.push({ x: out.elements[12], y: out.elements[13] + 0.2, z: out.elements[14] });
      }
    }
    imBody.count = iA; imBody2.count = iB;
    [imBody, imBody2, imRoof, imGable, imWin, imDoor, imLan, imCap, imBase, imRidge, imRidgeEnd].forEach(im => {
      im.frustumCulled = false; L.group.add(im);
    });
    L.waterside = spots;
    /* v2.2：临水人家的碰撞脚印（柜体 5.4×4.2，按 sc 缩放，取半对角） */
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      L.houses.push({ x: s.x, z: s.z, r: 3.45 * s.sc });
    }

    /* ---- 灯杆补空：民居稀疏处立杆挂灯，保证整条航线两侧灯链不断 ---- */
    const rr2 = UTIL.rng(246810);
    const poles = [];
    for (let i = 0; i < ring.length; i += 3) {
      const p = ring[i], p2 = ring[(i + 3) % ring.length];
      const dx = p2[0] - p[0], dz = p2[1] - p[1], dl = Math.hypot(dx, dz) || 1;
      const nx = -dz / dl, nz = dx / dl;
      const sgn = terrain.shoreDist(p[0] + nx * 6, p[1] + nz * 6) > terrain.shoreDist(p[0] - nx * 6, p[1] - nz * 6) ? 1 : -1;
      const off = 5 + rr2() * 4;
      const x = p[0] + nx * sgn * off, z = p[1] + nz * sgn * off;
      const sd = terrain.exactShoreDist(x, z);
      if (sd < 1.5 || sd > 16) continue;
      if (terrain.onCauseway(x, z)) continue;
      let near = false;
      for (const lp of lanPos) {
        const ddx = lp.x - x, ddz = lp.z - z;
        if (ddx * ddx + ddz * ddz < 46 * 46) { near = true; break; }
      }
      if (near) continue;
      for (const pp of poles) if (Math.hypot(x - pp.x, z - pp.z) < 34) { near = true; break; }
      if (near) continue;
      poles.push({ x, z, gy: terrain.heightAt(x, z) });
      if (poles.length >= 132) break;
    }
    if (poles.length) {
      const postGeo = new THREE.CylinderGeometry(0.06, 0.09, 3.1, 6); postGeo.translate(0, 1.55, 0);
      const armGeo = new THREE.BoxGeometry(1.5, 0.09, 0.09); armGeo.translate(0.6, 3.0, 0);
      const imPost = new THREE.InstancedMesh(postGeo, m.woodDark, poles.length);
      const imArm = new THREE.InstancedMesh(armGeo, m.woodDark, poles.length);
      const imLan2 = new THREE.InstancedMesh(G.lanGeo, m.nightLantern, poles.length);
      const m5 = new THREE.Matrix4();
      const lq = new THREE.Quaternion();
      for (let i = 0; i < poles.length; i++) {
        const pp = poles[i];
        m5.compose(new THREE.Vector3(pp.x, Math.max(0.6, pp.gy) - 0.1, pp.z), lq, new THREE.Vector3(1, 1, 1));
        imPost.setMatrixAt(i, m5);
        imArm.setMatrixAt(i, m5);
        m5.compose(new THREE.Vector3(pp.x + 1.15, Math.max(0.6, pp.gy) + 2.72, pp.z), lq, new THREE.Vector3(1.15, 1.15, 1.15));
        imLan2.setMatrixAt(i, m5);
        lanPos.push({ x: pp.x + 1.15, y: Math.max(0.6, pp.gy) + 2.9, z: pp.z });
      }
      [imPost, imArm, imLan2].forEach(im => { im.frustumCulled = false; L.group.add(im); });
    }

    L.routeLanterns = lanPos;
    buildLanternGlow(lanPos);
    return spots.length;
  }

  /* 灯笼光晕：两层 Points（亮核 + 大范围晕圈，加色混合）。
     关键点：fog:false —— 否则远处灯笼会被雨雾色吞掉，夜航看不到灯链。
     深度测试保留，山体/民居挡住的灯笼不会穿透显示。零额外光源。 */
  function buildLanternGlow(list) {
    if (!list.length) return;
    const N = list.length;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = list[i].x; pos[i * 3 + 1] = list[i].y; pos[i * 3 + 2] = list[i].z; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = glowTexture();
    const mk = (size, color, order) => {
      const mat = new THREE.PointsMaterial({
        map: tex, size, sizeAttenuation: true, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
        color, fog: false
      });
      const pts = new THREE.Points(g, mat);
      pts.frustumCulled = false;
      pts.renderOrder = order;
      L.group.add(pts);
      return { pts, mat };
    };
    const core = mk(4.6, 0xffe2b4, 6);
    const halo = mk(15.5, 0xffa855, 5);
    ROUTE.glow = core.pts; ROUTE.mat = core.mat;
    ROUTE.halo = halo.pts; ROUTE.haloMat = halo.mat;
  }

  let _glowTex = null;
  function glowTexture() {
    if (_glowTex) return _glowTex;
    const c = UTIL.canvas(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,225,175,0.95)');
    gr.addColorStop(0.28, 'rgba(255,178,92,0.42)');
    gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    _glowTex = new THREE.CanvasTexture(c);
    return _glowTex;
  }

  /* ---------------- 沿街商铺：北山街 + 南山路两段弧 ---------------- */
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
    if (byName['岳王庙'] && byName['断桥残雪']) arcs.push([nearestIdx(byName['岳王庙']), nearestIdx(byName['断桥残雪']), 11]);
    if (byName['涌金门'] && byName['长桥公园']) arcs.push([nearestIdx(byName['涌金门']), nearestIdx(byName['长桥公园']), 11]);
    /* v2.2：西岸（曲院风荷—岳王庙）与南岸（花港观鱼—净慈寺）各补一段商铺街，间距略疏 */
    if (byName['曲院风荷'] && byName['岳王庙']) arcs.push([nearestIdx(byName['曲院风荷']), nearestIdx(byName['岳王庙']), 17]);
    if (byName['花港观鱼'] && byName['净慈寺']) arcs.push([nearestIdx(byName['花港观鱼']), nearestIdx(byName['净慈寺']), 17]);
    const rr = UTIL.rng(20260214);
    for (const arc of arcs) {
      const i0 = arc[0], n = ((arc[1] - arc[0]) + ring.length) % ring.length;
      const gap = arc[2] || 11;
      let acc = 0;
      for (let k = 0; k < n && spots.length < 72; k++) {
        const p = ring[(i0 + k) % ring.length], p2 = ring[(i0 + k + 1) % ring.length];
        const dx = p2[0] - p[0], dz = p2[1] - p[1], dl = Math.hypot(dx, dz) || 1;
        acc += dl;
        if (acc < gap) continue; acc = 0;
        const nx = -dz / dl, nz = dx / dl;
        const sgn = terrain.shoreDist(p[0] + nx * 6, p[1] + nz * 6) > terrain.shoreDist(p[0] - nx * 6, p[1] - nz * 6) ? 1 : -1;
        const off = 7 + rr() * 8;
        const x = p[0] + nx * sgn * off, z = p[1] + nz * sgn * off;
        const sd = terrain.exactShoreDist(x, z);
        if (sd < 4 || sd > 18) continue;
        const gy = terrain.heightAt(x, z);
        if (gy < 1.2 || gy > 25 || !clearSpot(terrain, x, z, 5)) continue;
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

  /* ---------------- 景点摊贩 / 街市集市（v2：让景点与街市真正"有人气"） ----------------
     摊子组成：木摊桌 + 条纹棚布 + 双立柱 + 两只货担 + 檐下小红灯笼 + 桌面货品。
     全部合批成 6 个 InstancedMesh（不随摊位数增加 draw call）；
     灯笼用 m.nightLantern，随 Weather.lampK 入夜自动点亮。 */
  function buildStalls(course, terrain, tier) {
    const m = Buildings.mats();
    const rr = UTIL.rng(24681357);
    L.stalls = [];
    L.market = [];
    const spots = [];
    const addSpot = (x, z, yaw) => {
      const gy = terrain.heightAt(x, z);
      spots.push({ x, z, gy, yaw });
      L.stalls.push({ x, z, gy, yaw, r: 1.7 });
    };
    /* 1) 景点周边：沿湖岸摆摊，正面朝水面（游客下船就能看到） */
    L.list.forEach(lm => {
      const n = lm.enlarged ? 6 : (3 + ((rr() * 2) | 0));
      let placed = 0;
      for (let t = 0; t < 44 && placed < n; t++) {
        const a = rr() * 6.2832, rad = 9 + rr() * 20;
        const x = lm.x + Math.cos(a) * rad, z = lm.z + Math.sin(a) * rad;
        const sd = terrain.exactShoreDist(x, z);
        if (sd < 3 || sd > 15 || terrain.onCauseway(x, z)) continue;
        const gy = terrain.heightAt(x, z);
        if (gy < 1.2 || gy > 16) continue;
        let ok = true;
        for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < 7) { ok = false; break; }
        if (!ok) continue;
        const nv = shoreNormal(terrain, x, z);
        addSpot(x, z, Math.atan2(nv[0], nv[1]) + (rr() - 0.5) * 0.5);
        placed++;
      }
    });
    /* 2) 沿街商铺门前：再支一排摊子，形成集市 */
    (course.shopSpots || []).forEach(s => {
      for (let k = 0; k < 2; k++) {
        const off = 7 + rr() * 5;
        const x = s.x + Math.cos(s.yaw) * off + (rr() - 0.5) * 4;
        const z = s.z + Math.sin(s.yaw) * off + (rr() - 0.5) * 4;
        const sd = terrain.exactShoreDist(x, z);
        if (sd < 2 || sd > 14 || terrain.onCauseway(x, z)) continue;
        const gy = terrain.heightAt(x, z);
        if (gy < 1.1 || gy > 12) continue;
        let ok = true;
        for (const q of spots) if (Math.hypot(x - q.x, z - q.z) < 6) { ok = false; break; }
        if (!ok) continue;
        const nv = shoreNormal(terrain, x, z);
        addSpot(x, z, Math.atan2(nv[0], nv[1]) + (rr() - 0.5) * 0.4);
      }
      /* 集市人群锚点（由 figures.js 生成走动的人） */
      for (let k = 0; k < 3; k++) {
        const a = rr() * 6.2832, r2 = 3 + rr() * 9;
        const mx = s.x + Math.cos(a) * r2, mz = s.z + Math.sin(a) * r2;
        if (terrain.exactShoreDist(mx, mz) > 1.4) L.market.push({ x: mx, z: mz });
      }
    });
    /* 3) 民居周边（v2.2）：村口、院墙外摆几只小摊，普通建筑周围也要有人气。
       只取村庄主屋（碰撞半径 ≥ 5 的那批），隔一个抽样，整体上限 26 个村口摊。 */
    const vill = (L.houses || []).filter(h => h.r >= 5);
    let vAdded = 0;
    for (let i = 0; i < vill.length && vAdded < 26; i += 2) {
      const h = vill[i];
      let placed = 0;
      for (let t = 0; t < 7 && placed < 2; t++) {
        const a = rr() * 6.2832, rad = h.r + 2.5 + rr() * 7;
        const x = h.x + Math.cos(a) * rad, z = h.z + Math.sin(a) * rad;
        const sd = terrain.exactShoreDist(x, z);
        if (sd < 3 || sd > 22 || !clearSpot(terrain, x, z, 3)) continue;
        const gy = terrain.heightAt(x, z);
        if (gy < 1.1 || gy > 18) continue;
        let ok = true;
        for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < 8) { ok = false; break; }
        if (!ok) continue;
        const nv = shoreNormal(terrain, x, z);
        addSpot(x, z, Math.atan2(nv[0], nv[1]) + (rr() - 0.5) * 1.4);
        L.market.push({ x: x + (rr() - 0.5) * 5, z: z + (rr() - 0.5) * 5 });   // 摊边人群
        placed++; vAdded++;
      }
    }

    /* 4) 码头集市（v2.2）：起点码头周围摆几只摊子 —— 玩家开局第一眼就该看到人气。
       这里放宽岸距限制（码头本身就是人工驳岸，exactShoreDist 偏小）。 */
    if (L.dock) {
      let placed = 0;
      for (let t = 0; t < 90 && placed < 7; t++) {
        const a = rr() * 6.2832, rad = 10 + rr() * 17;
        const x = L.dock.x + Math.cos(a) * rad, z = L.dock.z + Math.sin(a) * rad;
        const sd = terrain.exactShoreDist(x, z);
        if (sd < 2.2 || sd > 26 || terrain.onCauseway(x, z)) continue;
        const gy = terrain.heightAt(x, z);
        if (gy < 0.9 || gy > 16) continue;
        let ok = true;
        for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < 7.5) { ok = false; break; }
        if (!ok) continue;
        const nv = shoreNormal(terrain, x, z);
        addSpot(x, z, Math.atan2(nv[0], nv[1]) + (rr() - 0.5) * 0.5);
        L.market.push({ x: x + (rr() - 0.5) * 6, z: z + (rr() - 0.5) * 6 });
        placed++;
      }
    }

    const n = spots.length;
    if (!n) return;
    const tableGeo = new THREE.BoxGeometry(1.55, 0.72, 0.86); tableGeo.translate(0, 0.36, 0);
    const awnGeo = new THREE.BoxGeometry(2.72, 0.07, 2.02);
    awnGeo.rotateX(-0.15); awnGeo.translate(0, 2.34, 0.12);
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.062, 2.3, 5); poleGeo.translate(0, 1.15, 0);
    const basketGeo = new THREE.CylinderGeometry(0.25, 0.19, 0.26, 9); basketGeo.translate(0, 0.86, 0);
    const goodsGeo = new THREE.SphereGeometry(0.13, 7, 5); goodsGeo.scale(1.25, 0.8, 1); goodsGeo.translate(0, 0.82, 0);
    const lanGeo = new THREE.SphereGeometry(0.16, 9, 7); lanGeo.scale(1, 1.22, 1);

    const tableIM = new THREE.InstancedMesh(tableGeo, m.woodDark, n);
    const awnIM = new THREE.InstancedMesh(awnGeo, m.awning, n);
    const poleIM = new THREE.InstancedMesh(poleGeo, m.dark, n * 2);
    const basketIM = new THREE.InstancedMesh(basketGeo, m.wood, n * 2);
    const goodsIM = new THREE.InstancedMesh(goodsGeo, m.plaster, n * 3);
    const lanIM = new THREE.InstancedMesh(lanGeo, m.nightLantern, n * 2);

    const m4 = new THREE.Matrix4(), loc = new THREE.Matrix4(), out = new THREE.Matrix4();
    const q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    const cGoods = new THREE.Color();
    const GOODS = [0xc4552e, 0xd9a13c, 0x6f8a45, 0xb8845a, 0x9c5a74];
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      e.set(0, s.yaw, 0); q.setFromEuler(e);
      p3.set(s.x, Math.max(0.6, s.gy) - 0.06, s.z);
      s3.set(1, 1, 1);
      m4.compose(p3, q, s3);
      tableIM.setMatrixAt(i, m4);
      awnIM.setMatrixAt(i, m4);
      for (let k = 0; k < 2; k++) {
        loc.makeTranslation(k ? 1.18 : -1.18, 0, 0.55);
        out.multiplyMatrices(m4, loc); poleIM.setMatrixAt(i * 2 + k, out);
        loc.makeTranslation(k ? 0.55 : -0.5, 0, -0.24);
        out.multiplyMatrices(m4, loc); basketIM.setMatrixAt(i * 2 + k, out);
        /* 檐角双灯（夜里在摊子两侧亮起） */
        loc.makeTranslation(k ? 1.3 : -1.3, 2.16, 0.62);
        out.multiplyMatrices(m4, loc); lanIM.setMatrixAt(i * 2 + k, out);
      }
      for (let k = 0; k < 3; k++) {
        loc.makeTranslation((rr() - 0.5) * 1.05, 0, (rr() - 0.5) * 0.45);
        out.multiplyMatrices(m4, loc); goodsIM.setMatrixAt(i * 3 + k, out);
        cGoods.setHex(GOODS[(rr() * GOODS.length) | 0]);
        goodsIM.setColorAt(i * 3 + k, cGoods);
      }
    }
    if (goodsIM.instanceColor) goodsIM.instanceColor.needsUpdate = true;
    [tableIM, awnIM, poleIM, basketIM, goodsIM, lanIM].forEach(im => {
      im.frustumCulled = false;
      L.group.add(im);
    });
  }

  function buildShops(course, terrain, tier) {
    const spots = course.shopSpots || [];
    L.shops = spots;
    if (!spots.length) return;
    const rr = UTIL.rng(13579);
    const m = Buildings.mats();
    const g = houseGeos();
    const n = spots.length;
    const bodyIM = new THREE.InstancedMesh(g.bodyB, m.plaster, n);
    const roofIM = new THREE.InstancedMesh(g.roofB, m.roof, n);
    const gableIM = new THREE.InstancedMesh(g.gable, [m.plaster, m.roofDark], n);
    const winIM = new THREE.InstancedMesh(g.win, m.window, n * 2);
    // 夜市灯笼（挑檐下双灯，随 lampK 亮）
    const lanGeo = new THREE.SphereGeometry(0.19, 10, 8); lanGeo.scale(1, 1.25, 1);
    const lanIM = new THREE.InstancedMesh(lanGeo, m.nightLantern, n * 2);
    // 闹市摊棚（条纹棚布 + 摊桌）
    const awnGeo = new THREE.PlaneGeometry(3.4, 2.2); awnGeo.rotateX(-Math.PI / 2 + 0.28); awnGeo.translate(0, 2.9, 2.0);
    const awnIM = new THREE.InstancedMesh(awnGeo, m.awning, n);
    const tableGeo = new THREE.BoxGeometry(1.7, 0.78, 0.9); tableGeo.translate(0, 0.39, 0);
    const tableIM = new THREE.InstancedMesh(tableGeo, m.woodDark, n);
    const poleGeo = new THREE.CylinderGeometry(0.045, 0.06, 3.4, 5); poleGeo.translate(0, 1.7, 0);
    const poleIM = new THREE.InstancedMesh(poleGeo, m.dark, n);
    const flagGeo = new THREE.PlaneGeometry(0.55, 1.7); flagGeo.translate(0.28, 0, 0); flagGeo.translate(0, 2.4, 0);
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xd8a23c, side: THREE.DoubleSide });
    const flagIM = new THREE.InstancedMesh(flagGeo, flagMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), e = new THREE.Euler();
    const loc = new THREE.Matrix4(), out = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      e.set(0, s.yaw, 0); q.setFromEuler(e);
      const sc = 0.9 + rr() * 0.45;
      p3.set(s.x, Math.max(0.5, s.gy) - 0.1, s.z);
      s3.set(sc, sc, sc);
      m4.compose(p3, q, s3);
      bodyIM.setMatrixAt(i, m4);
      roofIM.setMatrixAt(i, m4);
      gableIM.setMatrixAt(i, m4);
      // 临街格扇窗 ×2
      for (let k = 0; k < 2; k++) {
        loc.makeTranslation(k ? 1.35 : -1.35, 2.05, 2.26);
        out.multiplyMatrices(m4, loc);
        winIM.setMatrixAt(i * 2 + k, out);
        // 挑檐灯笼 ×2
        loc.makeTranslation(k ? 1.9 : -1.9, 3.15, 2.1);
        out.multiplyMatrices(m4, loc);
        lanIM.setMatrixAt(i * 2 + k, out);
      }
      // 门前摊棚与摊桌（闹市）
      loc.makeTranslation(0, 0, 3.4);
      out.multiplyMatrices(m4, loc); awnIM.setMatrixAt(i, out);
      loc.makeTranslation((rr() - 0.5) * 1.6, 0, 3.2);
      out.multiplyMatrices(m4, loc); tableIM.setMatrixAt(i, out);
      // 幌杆立在店侧
      p3.set(s.x + Math.cos(s.yaw) * 0, s.z + Math.sin(s.yaw) * 0, 0);
      p3.set(s.x + Math.cos(s.yaw + 1.57) * 2.6, Math.max(0.5, s.gy) - 0.1, s.z + Math.sin(s.yaw + 1.57) * 2.6);
      s3.set(1, 1, 1);
      m4.compose(p3, q, s3);
      poleIM.setMatrixAt(i, m4);
      flagIM.setMatrixAt(i, m4);
    }
    [bodyIM, roofIM, gableIM, winIM, lanIM, awnIM, tableIM, poleIM, flagIM].forEach(im => { im.frustumCulled = false; L.group.add(im); });
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
    /* 夜市/闹市氛围：环境亮度低 → 灯笼与暖窗点亮（夜市），白天全灭（闹市靠棚布旗幌） */
    if (window.Weather && Weather.lampK) {
      const lampK = Weather.lampK();
      const m = Buildings.mats();
      const flick = 0.92 + 0.08 * Math.sin(performance.now() * 0.006);
      const k = lampK * flick;
      m.nightLantern.emissiveIntensity = k * 2.2;
      m.window.emissiveIntensity = k * 0.75;
      m.latticeIce.emissiveIntensity = k * 0.55;
      /* 水路两侧灯笼光晕：入夜渐亮，形成指引航线的一条条灯链 */
      if (ROUTE.mat) {
        const pulse = 0.88 + 0.12 * Math.sin(performance.now() * 0.004);
        ROUTE.mat.opacity = lampK * 0.95 * pulse;
        ROUTE.mat.size = 4.2 + lampK * 2.2;
      }
      if (ROUTE.haloMat) {
        ROUTE.haloMat.opacity = lampK * 0.34;
        ROUTE.haloMat.size = 13.5 + lampK * 7.5;
      }
    }
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
    /* v2.2 岸上碰撞：所有民居 / 临水人家 / 合批村舍的脚印圆（world 坐标 + 半径），
       供 Walk.refresh() 建空间网格，避免上坡后直接穿墙进屋 */
    L.houses = [];

    /* 湖心质心：判断"哪个方向是岸"的基准 */
    let _cx = 0, _cz = 0;
    if (course.center && course.center.length) {
      for (const p of course.center) { _cx += p[0]; _cz += p[1]; }
      _cx /= course.center.length; _cz /= course.center.length;
    }

    function place(name, obj, opt) {
      opt = opt || {};
      const lm = byName[name];
      if (!lm) return null;

      /* 显式指定坐标（个别数据点漂到湖心、需要放回它真正所在的山/岸时用） */
      if (opt.at) { lm.x = opt.at[0]; lm.z = opt.at[1]; }

      /* --- 落位纠偏：景点坐标落在湖面时，整组建筑会漂在水上 ---
         原逻辑把地形高度 Math.max(0, …) 钳到 0，水下 -4.5 变成 0，
         建筑就贴在水平面上、周围全是水（曲院风荷、保俶塔都这样）。
         这里先按"远离湖心"的方向找最近的岸线；实在找不到（窄堤之类）再原地垫石台。 */
      let shorePlat = false;
      if (opt.y === undefined && !opt.at && terrain.heightAt(lm.x, lm.z) < 0.9) {
        /* 12 个方向扫最近岸线（不限"远离湖心"——苏堤这类窄堤就在侧边，只朝外找会跳过它）。
           优先要"又近又平"的岸：山顶上的点虽然也是陆地，但落差大，台基会做成一座高台。
           先找 1.2~4.5m 的平缓岸边，实在没有才退而求其次。 */
        const scan = hi => {
          let best = null, bd = 1e9;
          for (let k = 0; k < 12; k++) {
            const a = k / 12 * Math.PI * 2;
            const ux = Math.cos(a), uz = Math.sin(a);
            for (let r = 6; r <= 200; r += 6) {
              if (r >= bd) break;
              const qx = lm.x + ux * r, qz = lm.z + uz * r;
              const hh = terrain.heightAt(qx, qz);
              if (hh > 1.2 && hh < hi) {
                if (r < bd) { bd = r; best = [qx, qz]; }
                break;
              }
            }
          }
          return best;
        };
        const found = scan(4.5) || scan(1e9);
        if (found) { lm.x = found[0]; lm.z = found[1]; }
        else shorePlat = true;                 // 四周皆水：垫一座水中石台
      }

      let gy, gyMin = 1e9;
      if (opt.y !== undefined) gy = opt.y;
      else if (shorePlat) {
        /* 原地垫台：从湖底一直砌到水面以上，建筑站在台顶，不再是"浮在水面" */
        const fw = opt.foot !== undefined ? opt.foot : Math.min(30, Math.max(6, (lm.r || 20) * 0.28));
        const platH = 8.0;
        const plat = new THREE.Mesh(new THREE.BoxGeometry(fw * 2.2, platH, fw * 2.2), Buildings.mats().stone);
        plat.position.set(0, -platH / 2 + 1.0, 0);
        obj.add(plat);
        gy = 1.0;
      } else {
        // 大建筑取 footprint 多点采样的最高地面：宁嵌入坡体，不悬空（防坡地错位）
        const fr = opt.foot !== undefined ? opt.foot : Math.min(30, Math.max(6, (lm.r || 20) * 0.28));
        gy = 0;
        let gyMinRaw = 1e9;
        for (let k = 0; k < 9; k++) {
          const sx = k === 0 ? 0 : Math.cos(k / 8 * 6.2832) * fr;
          const sz = k === 0 ? 0 : Math.sin(k / 8 * 6.2832) * fr;
          const hh = terrain.heightAt(lm.x + sx, lm.z + sz);
          gy = Math.max(gy, hh);
          gyMinRaw = Math.min(gyMinRaw, hh);
        }
        gy = Math.max(0, gy); gyMin = Math.max(0, gyMinRaw);
        /* 抬升上限：footprint 取最大值，是为了坡地上一侧不悬空；
           但山坡景点会被整体抬到山顶，中心点反而悬在几十米高空（郭庄差 32m）。
           限制最多比中心点高 6m——多一点就让它嵌进坡里，靠台基遮，比浮在半空强。 */
        const hCenter = terrain.heightAt(lm.x, lm.z);
        if (gy > hCenter + 6) gy = Math.max(1.0, hCenter + 6);
        /* 坡地/临岸落差大时垫石砌台基（依山台地做法）。
           只有 footprint 里真的碰到水面，台基才需要一直沉到水下——
           否则山上的塔会算出一座 80 多米高的石塔套在塔外面。 */
        if (gy - gyMin > 0.6) {
          const platH = (gyMinRaw < 0.3)
            ? Math.max(gy - gyMin + 1.2, gy + 2.6)
            : (gy - gyMin + 1.2);
          const plat = new THREE.Mesh(new THREE.BoxGeometry(fr * 2.3, platH, fr * 2.3), Buildings.mats().stone);
          plat.position.set(0, -platH / 2 + 0.6, 0);
          obj.add(plat);
        }
      }
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

    /* 3. 保俶塔：宝石山巅七级砖塔（放大）
       原数据坐标 (-10,-1636) 落在湖心里，塔直接从水面升起。
       这里锚到宝石山脊 (-300,-1772, 地形约 80m)，才是它真实所在的位置。 */
    place('保俶塔', B.pagoda({
      tiers: 7, baseR: 5.4, tierHs: [8.4, 7.9, 7.4, 7.2, 7.0, 6.6, 6.4],
      shrink: 0.92, plain: true, bodyMat: m.brick, finialH: 8.0
    }), { at: [-300, -1772], foot: 9, hy: 70, visitR: 360, enlarged: true });

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
    qh.position.set(11, 0, -5); qh.rotation.y = 0.5;
    /* 辅厅离开主亭 12m，place() 只按主建筑 footprint 定一次地面高度，
       坡地上辅厅必然一边悬空一边嵌进土里。给它自带一块向下埋 3.6m 的石基，
       无论落在坡的哪一侧都能踩实。 */
    const qhb = new THREE.Mesh(new THREE.BoxGeometry(12.6, 3.8, 9.2), m.stone);
    qhb.position.set(11, -1.7, -5);
    qy.add(qhb);
    qy.add(qh);
    place('曲院风荷', qy, { hy: 12, foot: 14 });

    /* 7. 苏堤春晓：堤上亭 + 碑（坐标落在堤西侧水面，交给 place 的落位纠偏贴回堤顶） */
    const sd = new THREE.Group();
    sd.add(B.pavilion({ w: 4.4, h: 3.4, sides: 4 }));
    const sdSt = B.stele('苏堤春晓'); sdSt.position.set(5.5, 0, 1.5); sd.add(sdSt);
    place('苏堤春晓', sd, { foot: 8, hy: 11, visitR: 170 });

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

    /* 堤身半宽（与 Terrain 里的 HALF 一致），桥宽取其两倍：桥面恰与堤面等宽 */
    const CW_HALF = { '苏堤': 9.5, '杨公堤': 11, '白堤': 9.5 };
    window.__BRIDGES = [];

    function buildBridge(item, name, opt) {
      opt = opt || {};
      const br = item.br;
      // 去重：数据里过近的重复桥只建一座（防拱桥重叠错位）
      if (!buildBridge._built) buildBridge._built = [];
      for (const pb of buildBridge._built) {
        if (Math.hypot(br.x - pb.x, br.z - pb.z) < 40) return;
      }
      buildBridge._built.push({ x: br.x, z: br.z });
      /* 收集全部堤线端点（含朝向线内的方向）——桥跨在堤断口上，桥轴 = 断口两端连线 */
      const ends = [];
      for (const nm in course.causeways) {
        for (const line of course.causeways[nm]) {
          if (!line || line.length < 2) continue;
          const n = line.length;
          ends.push({ x: line[0][0], z: line[0][1], dx: line[1][0] - line[0][0], dz: line[1][1] - line[0][1], line });
          ends.push({ x: line[n - 1][0], z: line[n - 1][1], dx: line[n - 2][0] - line[n - 1][0], dz: line[n - 2][1] - line[n - 1][1], line });
        }
      }
      const near = ends.map(e => ({ e, d: Math.hypot(e.x - br.x, e.z - br.z) }))
        .filter(o => o.d < 60).sort((a, b) => a.d - b.d);
      /* 注意：这里的断口端点命名用 eA / eB，切勿用 A / B —— 会遮蔽外层的 Buildings 别名 B */
      let eA = null, eB = null;
      if (near.length >= 2) {
        outer:
        for (let i = 0; i < near.length; i++) {
          for (let j = i + 1; j < near.length; j++) {
            const ei = near[i].e, ej = near[j].e;
            if (ei.line === ej.line) continue;
            const mx = (ei.x + ej.x) / 2, mz = (ei.z + ej.z) / 2;
            if (Math.hypot(br.x - mx, br.z - mz) > 40) continue;   // 桥点须在断口中间
            eA = ei; eB = ej; break outer;
          }
        }
      }
      let px, pz, cx = br.x, cz = br.z, span;
      if (eA && eB) {
        const dx = eB.x - eA.x, dz = eB.z - eA.z, Lg = Math.hypot(dx, dz) || 1;
        px = dx / Lg; pz = dz / Lg;                     // 桥跨方向 = 断口两端连线（顺堤）
        span = UTIL.clamp(Lg, 15, 34);                  // 拱跨 = 缺口净宽，不再额外放大（防压入堤端）
        cx = (eA.x + eB.x) / 2; cz = (eA.z + eB.z) / 2;
      } else if (near.length >= 1) {
        /* 堤端续接岸（如断桥：堤尽头接北山街岸） */
        const e = near[0].e;
        const Lg = Math.hypot(e.dx, e.dz) || 1;
        px = -e.dx / Lg; pz = -e.dz / Lg;             // 沿堤向外延伸
        span = UTIL.clamp(br.r * 1.5, 15, 30);
        cx = e.x + px * (span * 0.5 - 5); cz = e.z + pz * (span * 0.5 - 5);
      } else {
        /* 兜底：沿最近堤段方向 */
        const seg = item.nc.seg || [[0, 0], [1, 0]];
        const dx = seg[1][0] - seg[0][0], dz = seg[1][1] - seg[0][1], Lg = Math.hypot(dx, dz) || 1;
        px = dx / Lg; pz = dz / Lg;
        span = UTIL.clamp(br.r * 1.35, 15, 30);
      }
      const half = opt.half !== undefined ? opt.half : (CW_HALF[item.nc.name] || 9.5);
      const width = half * 2;                            // 桥宽 = 堤宽，隧道进深与堤身一致
      const rise = opt.rise !== undefined ? opt.rise : Math.min(4.4, span * 0.20);
      /* v2.2：单座拱桥可整体绕 Y 轴旋转 90°（桥轴跟着转）。
         桥轴线 px/pz 与几何体同转，__BRIDGES 里的 ux/uz（拱洞通行方向）也随之交换，
         这样"看起来怎么转，船就怎么过"，不会出现视觉与碰撞错位。 */
      if (opt.rot90) {
        const tx = px; px = -pz; pz = tx;
      }
      const g = B.archBridge({ span, width, rise, plaque: name });
      // archBridge 桥面两端局部 y = thick(1.02) → 基座 0.80 使桥面两端与堤顶 1.78 齐平（略高 4cm 防共面闪烁）
      g.position.set(cx, 0.80, cz);
      // local +X → (cos ry, -sin ry) 需等于 (px, pz)：ry = atan2(-pz, px)
      g.rotation.y = Math.atan2(-pz, px);
      root.add(g);
      L.obstacles.push({ x: cx, z: cz, r: span * 0.30, bridge: true });
      /* 供 Terrain.navigable 使用：只有拱洞正中可通过，两侧桥台/堤体不可穿
         ax=true 表示整座桥绕 Y 旋转过 90°（锦带桥），拱洞轴线改为沿堤方向，
         通行判定的两个轴要跟着交换，否则"看得见墙却能穿过去"。 */
      window.__BRIDGES.push({ x: cx, z: cz, ux: px, uz: pz, span, width, rise, ax: !!opt.rot90 });
    }

    groups['苏堤'].forEach((item, i) => {
      const idx = Math.round(i * (SUDI_NAMES.length - 1) / Math.max(1, groups['苏堤'].length - 1));
      buildBridge(item, SUDI_NAMES[idx], { half: CW_HALF['苏堤'] });
    });
    groups['杨公堤'].forEach((item, i) => {
      const idx = Math.round(i * (YANG_NAMES.length - 1) / Math.max(1, groups['杨公堤'].length - 1));
      buildBridge(item, YANG_NAMES[idx], { half: CW_HALF['杨公堤'] });
    });
    groups['白堤'].forEach((item, i) => {
      /* v2.2：锦带桥（白堤内侧那座）整体旋转 90°——桥身横跨堤身、拱洞顺着堤走，
         与断桥形成一横一纵的对照。该桥距环湖航线 380m，不影响竞速航道。 */
      buildBridge(item, i === 0 ? '断桥' : '锦带桥', { half: CW_HALF['白堤'], rise: 2.2, rot90: i !== 0 });
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

    /* （现代城市天际线已移除，东岸远景由民居群与塔影代替） */

    /* 景点照壁/景墙（照片素材展示） */
    buildPhotoWalls(course, terrain);

    /* 扩展：新景点 + 沿湖民居（游客改由 figures.js 古装人物系统接管，见 world.js） */
    buildExtras(course, terrain);
    buildVillages(course, terrain, tier);
    buildShops(course, terrain, tier);
    buildStalls(course, terrain, tier);         // 景点摊贩 + 街市集市（v2）
    buildWaterside(course, terrain, tier);      // 水路两侧人家 + 檐下灯笼（夜航指路）
    buildFlags(course, terrain);

    scene.add(root);
    return L;
  };
  return L;
})();
