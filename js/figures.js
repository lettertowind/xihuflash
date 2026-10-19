/* figures.js — 宋风古装人物系统（部位级 InstancedMesh + 动作状态机）
   场景：景点游客 / 岸边行人 / 湖上船客（含摇橹人）
   部位桶：5 身体 + 4 头 + 2 臂 + 1 持物 = 12 个 InstancedMesh；槽位建册时固定 */
window.Figures = (function () {
  const F = {};
  const U = UTIL;
  let terrain = null, tier = null, scene = null;
  let persons = [];
  let buckets = {};
  let finalized = false;
  let distAcc = 0, distIdx = 0, frame = 0;

  /* ---------------- 几何 ---------------- */
  function bake(geo, color) {
    const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  function bodyGeo(kind) {
    const parts = [];
    if (kind === 'child') {
      const robe = new THREE.CylinderGeometry(0.10, 0.20, 0.62, 8);
      robe.translate(0, 0.34, 0); parts.push(robe);
      const torso = new THREE.SphereGeometry(0.13, 7, 5);
      torso.scale(1.15, 0.9, 0.9); torso.translate(0, 0.72, 0); parts.push(torso);
    } else {
      const fem = kind === 'femA' || kind === 'femB';
      const robe = new THREE.CylinderGeometry(fem ? 0.115 : 0.135, fem ? 0.24 : 0.30, 0.92, 9);
      robe.translate(0, 0.50, 0); parts.push(robe);
      const torso = new THREE.CylinderGeometry(fem ? 0.12 : 0.15, fem ? 0.135 : 0.16, 0.42, 8);
      torso.translate(0, 1.16, 0); parts.push(torso);
      const sh = new THREE.SphereGeometry(fem ? 0.15 : 0.18, 7, 5);
      sh.scale(1.25, 0.55, 0.85); sh.translate(0, 1.38, 0); parts.push(sh);
      if (kind === 'gown') {
        const hem = new THREE.CylinderGeometry(0.24, 0.34, 0.3, 9, 1, true);
        hem.translate(0, 0.16, 0); parts.push(hem);
      }
      if (kind === 'femA') {                                    // 披帛
        const s1 = new THREE.BoxGeometry(0.05, 0.62, 0.02);
        s1.translate(0.16, 1.0, -0.14); parts.push(s1);
        const s2 = new THREE.BoxGeometry(0.05, 0.48, 0.02);
        s2.translate(-0.17, 1.06, -0.14); parts.push(s2);
      }
    }
    return U.merge(parts);
  }

  function headGeo(kind) {
    const parts = [];
    const skin = new THREE.Color(0xe6c09a);        // 江南人肤色（此处为线性空间前的 sRGB 值）
    const face = new THREE.SphereGeometry(0.136, 10, 7);
    face.scale(0.95, 1.07, 1.0);
    face.translate(0, -0.004, -0.004);
    bake(face, skin); parts.push(face);
    const hairC = new THREE.Color(0x241d18);
    /* 后脑与顶发：只盖到耳际，正面留出脸（旧版只有一小块顶发，远看像光头/黑块） */
    const hair = new THREE.SphereGeometry(0.1425, 11, 7, 0, Math.PI * 2, 0, Math.PI * 0.56);
    hair.scale(0.97, 1.04, 1.03);
    hair.translate(0, 0.008, 0.014);
    bake(hair, hairC); parts.push(hair);
    if (kind === 'putou') {
      const cap = new THREE.BoxGeometry(0.21, 0.1, 0.2); cap.translate(0, 0.125, 0.008); bake(cap, hairC); parts.push(cap);
      const wl = new THREE.BoxGeometry(0.1, 0.022, 0.045); wl.translate(-0.155, 0.14, 0.008); bake(wl, hairC); parts.push(wl);
      const wr = new THREE.BoxGeometry(0.1, 0.022, 0.045); wr.translate(0.155, 0.14, 0.008); bake(wr, hairC); parts.push(wr);
    } else if (kind === 'dongpo') {
      const c1 = new THREE.BoxGeometry(0.18, 0.17, 0.18); c1.translate(0, 0.15, 0); bake(c1, hairC); parts.push(c1);
      const c2 = new THREE.BoxGeometry(0.21, 0.05, 0.21); c2.translate(0, 0.06, 0); bake(c2, hairC); parts.push(c2);
    } else if (kind === 'hat') {
      const cone = new THREE.ConeGeometry(0.25, 0.11, 10);
      cone.translate(0, 0.15, 0);
      bake(cone, new THREE.Color(0x9a8152)); parts.push(cone);
    } else {
      const b1 = new THREE.SphereGeometry(0.078, 8, 6); b1.translate(0, 0.16, 0.02); bake(b1, hairC); parts.push(b1);
      const b2 = new THREE.SphereGeometry(0.052, 6, 5); b2.translate(0.075, 0.13, 0.06); bake(b2, hairC); parts.push(b2);
    }
    return U.merge(parts);
  }

  function armGeo() {                                          // 衣袖（颜色随袍色实例化）
    const arm = new THREE.CylinderGeometry(0.044, 0.055, 0.48, 6);
    arm.translate(0, -0.24, 0);
    return U.merge([arm]);
  }

  function handGeo() {                                         // 手（肤色，单独一桶）
    const palm = new THREE.SphereGeometry(0.055, 7, 5);
    palm.scale(0.82, 1.32, 0.70);
    palm.translate(0, -0.545, 0);
    return U.merge([palm]);
  }

  function propGeo() {                                          // 拐杖（老者）
    const stick = new THREE.CylinderGeometry(0.02, 0.026, 0.9, 5);
    stick.translate(0, 0.45, 0);
    const knob = new THREE.SphereGeometry(0.035, 6, 4);
    knob.translate(0, 0.92, 0);
    return U.merge([stick, knob]);
  }

  /* ---------------- 桶 ---------------- */
  const BODY_KEYS = ['robe', 'gown', 'femA', 'femB', 'child'];
  const HEAD_KEYS = ['putou', 'dongpo', 'hat', 'bun'];
  const SONG_PALETTE = [
    0x3a5a6e, 0x6e5a3a, 0x8c6a76, 0xc9c4b4, 0x8a3a34, 0x7a7a44, 0x2f3440, 0x4e6e5a, 0x9a6a4a,
    0xb0885a, 0x5d4a66, 0x93343f, 0x34545a, 0xc2a25a, 0x845833, 0x6a7a52, 0x734d6a, 0x43554e
  ];

  function mkBucket(key, geo, mat) {
    buckets[key] = { im: null, mat, geo, list: [] };
  }

  /* 肤色（宋人偏暖黄，随机微差） */
  const SKIN_TONES = [0xe8c6a0, 0xe2bb92, 0xd9ac82, 0xeccfab, 0xdcb28c];
  function pickSkin() { return SKIN_TONES[(Math.random() * SKIN_TONES.length) | 0]; }

  function finalizeBuckets() {
    const dyn = THREE.DynamicDrawUsage;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const k in buckets) {
      const bk = buckets[k];
      const n = Math.max(1, bk.list.length);
      const im = new THREE.InstancedMesh(bk.geo, bk.mat, n);
      im.instanceMatrix.setUsage(dyn);
      im.frustumCulled = false;
      im.renderOrder = 3;
      im.count = bk.list.length;
      for (let i = 0; i < n; i++) im.setMatrixAt(i, z);
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
      bk.im = im;
    }
    // 染色：身体与手臂用宋色谱
    for (const k of BODY_KEYS) {
      const bk = buckets['b:' + k];
      bk.list.forEach((pi, slot) => colorAt(bk, slot, persons[pi].colorHex));
      if (bk.im.instanceColor) bk.im.instanceColor.needsUpdate = true;
    }
    ['arms', 'arms2'].forEach(k => {
      const bk = buckets[k];
      bk.list.forEach((pi, slot) => colorAt(bk, slot, persons[pi].colorHex));
      if (bk.im.instanceColor) bk.im.instanceColor.needsUpdate = true;
    });
    // 双手：肤色（原先是和袖子同色，远看像"黑手"）
    const bh = buckets.hands;
    bh.list.forEach((pi, slot) => {
      const c = new THREE.Color(persons[pi].skinHex);
      c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
      bh.im.setColorAt(slot, c);
    });
    if (bh.im.instanceColor) bh.im.instanceColor.needsUpdate = true;
  }

  function colorAt(bk, slot, hex) {
    const c = new THREE.Color(hex);
    c.offsetHSL((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.14);
    bk.im.setColorAt(slot, c);
  }

  /* ---------------- 注册 ---------------- */
  function pickOutfit(isFem) {
    const fem = isFem;
    const ageRoll = Math.random();
    let age = 'mid';
    if (ageRoll < 0.12) age = 'elder';
    else if (ageRoll < 0.28) age = 'young';
    const child = ageRoll >= 0.94;
    let body, head, prop = null;
    if (child) { body = 'child'; head = 'bun'; }
    else if (fem) { body = Math.random() < 0.5 ? 'femA' : 'femB'; head = 'bun'; }
    else {
      body = Math.random() < 0.5 ? 'robe' : 'gown';
      const hr = Math.random();
      head = hr < 0.42 ? 'putou' : (hr < 0.72 ? 'dongpo' : 'hat');
      if (age === 'elder' && Math.random() < 0.6) prop = 'staff';
    }
    return { body, head, prop, age };
  }

  function addPerson(def, mover, extra) {
    const base = def.age === 'elder' ? 0.94 : def.age === 'young' ? 0.97 : 1.0;
    const p = Object.assign({
      bi: def.body, hi: def.head, prop: def.prop,
      mode: 'WALK', t: Math.random() * 8, phase: Math.random() * 7,
      /* 高矮胖瘦：整体缩放 + 横向胖瘦 + 纵向高矮三轴独立抖动 */
      scale: base * (0.88 + Math.random() * 0.28),
      fat: 0.88 + Math.random() * 0.30,
      tall: 0.93 + Math.random() * 0.16,
      speed: 0.55 + Math.random() * 0.5,
      /* 步态个性：摆臂幅度 / 上下起伏 / 身体左右摇摆各自独立取值，
         同一批人里既有大摇大摆也有小步快走，避免整条街同步摆臂 */
      armAmp: 0.34 + Math.random() * 0.30,
      bobAmp: 0.032 + Math.random() * 0.024,
      swayAmp: 0.018 + Math.random() * 0.026,
      colorHex: SONG_PALETTE[(Math.random() * SONG_PALETTE.length) | 0],
      skinHex: pickSkin(),
      next: 4 + Math.random() * 12, partner: -1, dist2: 0,
      gT: 0, gy: undefined, wet: false, wetT: 0, safe: null
    }, mover, extra || {});
    p.idx = persons.length;
    p.slotB = buckets['b:' + p.bi].list.length;
    buckets['b:' + p.bi].list.push(p.idx);
    p.slotH = buckets['h:' + p.hi].list.length;
    buckets['h:' + p.hi].list.push(p.idx);
    p.slotA = buckets.arms.list.length;
    buckets.arms.list.push(p.idx);
    buckets.arms2.list.push(p.idx);
    buckets.hands.list.push(p.idx);
    p.slotHand = p.slotA;
    p.slotP = p.prop ? buckets.props.list.length : -1;
    if (p.prop) buckets.props.list.push(p.idx);
    persons.push(p);
    return p;
  }

  /* 场景1：景点游客 */
  /* 找一处整圈都在陆上的环形巡游半径（防止沿岸环行时踩到水面） */
  function fitRing(terr, cx, cz, r2) {
    for (let r = r2; r >= 1.4; r *= 0.78) {
      let ok = true;
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * Math.PI * 2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (terr.heightAt(x, z) < 1.15 || terr.exactShoreDist(x, z) < 0.8) { ok = false; break; }
      }
      if (ok) return r;
    }
    return 0;
  }

  F.registerVisitors = function (lmList, terr, tr) {
    terrain = terr; tier = tr;
    const fc = (tr && tr.figures) || { visitPerMark: 6 };
    const VR = U.rng(555777);
    let prevTalk = -1;
    for (const lm of lmList) {
      const k = fc.visitPerMark + ((VR() * 4) | 0);
      for (let i = 0; i < k; i++) {
        for (let t2 = 0; t2 < 10; t2++) {
          const a = VR() * Math.PI * 2, r2 = 5 + VR() * 20;
          const x = lm.x + Math.cos(a) * r2, z = lm.z + Math.sin(a) * r2;
          if (terrain.exactShoreDist(x, z) < 3) continue;
          const gy = terrain.heightAt(x, z);
          if (gy < 1.4 || gy > 40) continue;
          const ringR = fitRing(terrain, x, z, 3 + VR() * 9);     // 整圈在陆上才用
          if (!ringR) continue;
          const def = pickOutfit(VR() < 0.46);
          const ring = { cx: x, cz: z, r2: ringR, a: VR() * 6.283, w: (0.1 + VR() * 0.22) * (VR() < 0.5 ? 1 : -1) };
          const r3 = VR();
          let mode = 'WALK';
          if (r3 < 0.18) mode = 'IDLE';
          else if (r3 < 0.3 && prevTalk >= 0) mode = 'TALK';
          else if (r3 < 0.4) mode = 'LEAN';
          else if (r3 < 0.48) mode = 'WAVE';
          const p = addPerson(def, { ring, y: gy, scene: 'visit', safe: { x, z } }, { mode });
          if (mode === 'TALK' && prevTalk >= 0) {
            persons[prevTalk].mode = 'TALK'; persons[prevTalk].partner = p.idx; p.partner = prevTalk;
            prevTalk = -1;
          } else if (mode === 'TALK') prevTalk = p.idx;
          break;
        }
      }
    }
  };

  /* 场景2：岸边行人 */
  F.registerWalkers = function (course, terr, tr) {
    terrain = terr; tier = tr;
    const fc = (tr && tr.figures) || { walk: 30 };
    function polyLen(line) {
      let L = 0;
      for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      return Math.max(L, 1);
    }
    function cumLen(line) {
      const cum = [0];
      for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      return cum;
    }
    let total = 0;
    for (const nm in course.causeways) {
      for (const line of course.causeways[nm]) {
        const L2 = polyLen(line);
        const n = Math.max(2, Math.round(L2 / 170));
        for (let i = 0; i < n && total < fc.walk; i++) {
          const def = pickOutfit(Math.random() < 0.44);
          addPerson(def, { path: line, cum: cumLen(line), s: Math.random() * L2, dir: Math.random() < 0.5 ? 1 : -1, y: 1.78, scene: 'causeway' }, { mode: Math.random() < 0.8 ? 'WALK' : 'IDLE' });
          total++;
        }
      }
    }
    let placed = 0;
    const left = fc.walk - total;
    for (let i = 0; i < course.water.length && placed < left; i += 2) {
      if (Math.random() > 0.34) continue;
      const p0 = course.water[i], p1 = course.water[(i + 1) % course.water.length];
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], dl = Math.hypot(dx, dz) || 1;
      const nx = -dz / dl, nz = dx / dl;
      const sgn = terrain.shoreDist(p0[0] + nx * 6, p0[1] + nz * 6) > terrain.shoreDist(p0[0] - nx * 6, p0[1] - nz * 6) ? 1 : -1;
      const off = 8 + Math.random() * 6;
      const x = p0[0] + nx * sgn * off, z = p0[1] + nz * sgn * off;
      if (terrain.exactShoreDist(x, z) < 6) continue;
      const gy = terrain.heightAt(x, z);
      if (gy < 1.4 || gy > 30) continue;
      /* 巡游段必须整段在陆上：从 24m 逐步缩短到 6m，找不到就换点
         （旧版随机取 48m 直段，跨过湖湾时人物就"走在水面上"） */
      const ux = dx / dl, uz = dz / dl;
      let half = 0;
      for (const h of [24, 20, 16, 12, 9, 6]) {
        let ok = true;
        for (let k = -3; k <= 3; k++) {
          const t = h * k / 3;
          const sx = x + ux * t, sz = z + uz * t;
          if (terrain.heightAt(sx, sz) < 1.15 || terrain.exactShoreDist(sx, sz) < 1.2) { ok = false; break; }
        }
        if (ok) { half = h; break; }
      }
      if (!half) continue;
      const seg = [[x - ux * half, z - uz * half], [x + ux * half, z + uz * half]];
      const def = pickOutfit(Math.random() < 0.44);
      addPerson(def, { path: seg, cum: cumLen(seg), s: Math.random() * half * 2, dir: Math.random() < 0.5 ? 1 : -1, y: gy, scene: 'shore', safe: { x, z } }, { mode: Math.random() < 0.75 ? 'WALK' : 'IDLE' });
      placed++;
    }
  };

  /* 场景3：船乘客（Traffic.build 后调用，finalize 前均可注册） */
  F.addBoatPassengers = function (boatRecs, terr, tr) {
    terrain = terr; tier = tr;
    const fc = (tr && tr.figures) || { boat: 3 };
    const SEATS = {
      wupeng: [[0.95, 0.42, 0.42], [0.95, 0.42, -0.42], [2.3, 0.42, 0.38], [3.3, 0.42, -0.38]],
      huafang: [[4.6, 0.55, 0.55], [4.6, 0.55, -0.55], [3.6, 0.55, 0]],
      speed: [[1.4, 0.5, 0.5], [1.4, 0.5, -0.5], [2.3, 0.5, 0]],
      clean: [[0.8, 0.45, 0]]
    };
    for (const b of boatRecs) {
      if (b.static) continue;
      const seats = SEATS[b.kind] || SEATS.wupeng;
      const n = Math.min(seats.length, 1 + ((Math.random() * fc.boat) | 0));
      for (let i = 0; i < n; i++) {
        const def = pickOutfit(Math.random() < 0.44);
        addPerson(def, { boat: b, seat: seats[i], scene: 'boat' }, { mode: Math.random() < 0.7 ? 'IDLE' : (Math.random() < 0.5 ? 'NOD' : 'WAVE') });
      }
      if (b.kind === 'wupeng') {
        addPerson({ body: 'robe', head: 'hat', prop: null, age: 'mid' },
          { boat: b, seat: [-3.55, 0.55, 0], rower: true, scene: 'boat' }, { mode: 'ROW' });
      }
    }
  };

  /* ---------------- 更新 ---------------- */
  const mBody = new THREE.Matrix4(), mPart = new THREE.Matrix4(), tmpM = new THREE.Matrix4();
  const SEAT_FACE = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  const q = new THREE.Quaternion(), eul = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const ZEROM = new THREE.Matrix4().makeScale(0, 0, 0);

  function pathPos(p, out) {
    const line = p.path, cum = p.cum, total = cum[cum.length - 1];
    let s = ((p.s % total) + total) % total;
    if (p.dir < 0) s = total - s;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const segL = cum[i] - cum[i - 1] || 1;
    const k = (s - cum[i - 1]) / segL;
    const a = line[i - 1], b2 = line[i];
    out.x = a[0] + (b2[0] - a[0]) * k;
    out.z = a[1] + (b2[1] - a[1]) * k;
    // 人物前方 = 局部 -Z：朝向须使 -Z 映射到行进方向
    const dx = b2[0] - a[0], dz = b2[1] - a[1];
    out.yaw = p.dir > 0 ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
  }
  const pout = { x: 0, z: 0, yaw: 0 };

  F.update = function (dt, player) {
    if (!persons.length) return;
    if (!finalized) { finalizeBuckets(); finalized = true; }
    frame++;
    const px = player ? player.x : 0, pz = player ? player.z : 0;
    const armEvery = (tier && tier.figures && tier.figures.armFrame) || 2;

    /* 距离分层：每 0.25s 重算 1/15 */
    distAcc += dt;
    if (distAcc > 0.25) {
      distAcc = 0;
      const per = Math.ceil(persons.length / 15) || 1;
      for (let n = 0; n < per; n++) {
        const p = persons[(distIdx + n) % persons.length];
        const bx = p.ring ? p.ring.cx : (p.boat ? p.boat.x : (p._lx || 0));
        const bz = p.ring ? p.ring.cz : (p.boat ? p.boat.z : (p._lz || 0));
        p.dist2 = (bx - px) * (bx - px) + (bz - pz) * (bz - pz);
      }
      distIdx = (distIdx + per) % persons.length;
    }

    /* 船世界矩阵每帧刷新（乘客随船不滞后） */
    for (let i = 0; i < persons.length; i++) {
      const b = persons[i].boat;
      if (b) { b.grp.updateMatrixWorld(); }
    }
    // 去重不划算（≤14 船），直接整轮刷

    for (let i = 0; i < persons.length; i++) {
      const p = persons[i];
      p.t += dt;
      p.next -= dt;
      const lod = p.dist2 < 32400 ? 0 : (p.dist2 < 202500 ? 1 : 2);   // <180 / <450 / 远

      let x, z, yaw;
      if (p.boat) {
        if (!p.boat.grp.visible) { writeZero(p); continue; }
        tmpM.makeTranslation(p.seat[0], p.seat[1], p.seat[2]);
        tmpM.multiply(SEAT_FACE);            // 人物前方 -Z → 船首 +X
        if (p.rower) tmpM.elements[12] += Math.sin((p.boat.phase || 0) * 2.2) * 0.06;
        mBody.copy(p.boat.grp.matrixWorld).multiply(tmpM);
        eul.setFromRotationMatrix(mBody, 'YXZ');
        x = mBody.elements[12]; z = mBody.elements[14]; yaw = eul.y;
      } else if (p.ring) {
        if (lod === 2) { if (p.frozen) continue; p.frozen = 1e9; }
        if (p.mode === 'WALK') { p.ring.a += p.ring.w * dt; p.phase += p.speed * dt * 5.2; }
        else p.ring.a += p.ring.w * dt * 0.12;
        x = p.ring.cx + Math.cos(p.ring.a) * p.ring.r2;
        z = p.ring.cz + Math.sin(p.ring.a) * p.ring.r2;
        const sgn = p.ring.w >= 0 ? 1 : -1;
        // 环行切向 = (±-sin a, ±cos a)，人物前方 -Z 映射到切向
        yaw = sgn > 0 ? Math.PI - p.ring.a : -p.ring.a;
        if (p.mode === 'TALK' && p.partner >= 0) {
          const pr = persons[p.partner];
          if (pr && pr.ring) yaw = Math.atan2(x - pr.ring.cx, z - pr.ring.cz);
        }
      } else if (p.path) {
        if (lod === 2) { if (p.frozen) continue; p.frozen = 1e9; }
        if (p.mode === 'WALK') p.s += p.speed * 1.4 * dt;
        pathPos(p, pout);
        x = pout.x; z = pout.z; yaw = pout.yaw;
        p._lx = x; p._lz = z;
      } else continue;

      /* 落地校验：周期采样脚下地面——在水面上的人物隐去（防水上漂），并跟随地形起伏
         注意：船客站在船上，坐标本就落在水面，不能参与此校验（旧版因此把所有船客都隐藏了） */
      if (!p.boat) {
        p.gT -= dt;
        if (p.gT <= 0) {
          p.gT = 0.3 + Math.random() * 0.25;
          p.gy = terrain ? terrain.heightAt(x, z) : p.y;
          p.wet = p.gy < 1.15;
        }
        if (p.wet) {
          writeZero(p);
          p.wetT += dt;
          if (p.wetT > 0.8) {
            /* 兜底：拉回已验证过的陆地位置，绝不在水面上行走 */
            p.wetT = 0; p.wet = false;
            if (p.ring && p.safe) {
              p.ring.cx = p.safe.x; p.ring.cz = p.safe.z;
              p.ring.r2 = Math.max(1.5, p.ring.r2 * 0.55);
            } else if (p.path) {
              p.s = 0; p.dir *= -1;
            }
          }
          continue;
        }
        p.wetT = 0;
      }

      /* 动作切换（船客只做 NOD/WAVE/IDLE 微动作） */
      if (p.next <= 0 && p.scene !== 'boat') {
        p.next = 6 + Math.random() * 14;
        const r3 = Math.random();
        if (r3 < 0.5) p.mode = 'WALK';
        else if (r3 < 0.66) p.mode = 'IDLE';
        else if (r3 < 0.76) p.mode = 'NOD';
        else if (r3 < 0.86) p.mode = 'WAVE';
        else if (r3 < 0.93 && p.bi === 'child') p.mode = 'JUMP';
        else p.mode = 'LEAN';
      }

      let bob = 0, roll = 0, nodA = 0, armL = 0, armR = 0, lean = 0, jumpY = 0;
      if (p.mode === 'WALK') {
        bob = Math.abs(Math.sin(p.phase)) * (p.bobAmp || 0.045);
        roll = Math.sin(p.phase) * (p.swayAmp || 0.03);
        // 两只胳膊不完全对称：行进时一侧摆动略小，像提物/扶袖
        armL = Math.sin(p.phase) * (p.armAmp || 0.5);
        armR = -armL * (0.72 + 0.28 * (p.fat || 1));
      } else if (p.mode === 'IDLE') {
        bob = Math.sin(p.t * 1.4 + p.phase) * 0.012;
        armL = Math.sin(p.t * 1.1) * 0.05; armR = -armL;
      } else if (p.mode === 'NOD') {
        nodA = Math.sin(p.t * 4.2) * 0.16; armL = armR = 0.04;
        if (p.next < 4) p.mode = 'IDLE';
      } else if (p.mode === 'WAVE') {
        armR = 2.35 + Math.sin(p.t * 6) * 0.35; armL = 0.06; roll = 0.02;
        if (p.next < 4) p.mode = 'IDLE';
      } else if (p.mode === 'JUMP') {
        const jk = (p.t % 1.1) / 1.1;
        if (jk < 0.35) jumpY = Math.sin(jk / 0.35 * Math.PI) * 0.22;
        armL = armR = -0.4;
      } else if (p.mode === 'LEAN') {
        lean = 0.16; armL = 0.1; armR = 0.1;
      } else if (p.mode === 'ROW') {
        armL = 0.9 + Math.sin((p.boat.phase || 0) * 2.2) * 0.28; armR = armL;
      }

      /* 身体矩阵 */
      if (p.boat) {
        if (lean) { tmpM.makeRotationZ(lean); mBody.multiply(tmpM); }
      } else {
        eul.set(0, yaw, roll + lean, 'YXZ');
        q.setFromEuler(eul);
        pv.set(x, (p.gy !== undefined ? p.gy : p.y) + bob + jumpY, z);
        sv.set(p.scale * p.fat, p.scale * p.tall, p.scale * p.fat);
        mBody.compose(pv, q, sv);
      }

      const bkB = buckets['b:' + p.bi], bkH = buckets['h:' + p.hi];
      bkB.im.setMatrixAt(p.slotB, mBody);

      /* 头 */
      mPart.copy(mBody);
      tmpM.makeTranslation(0, p.bi === 'child' ? 0.86 : 1.56, 0);
      mPart.multiply(tmpM);
      if (nodA) { tmpM.makeRotationX(nodA); mPart.multiply(tmpM); }
      bkH.im.setMatrixAt(p.slotH, mPart);

      /* 臂 + 持物（远端分帧） */
      if (lod < 2 || frame % armEvery === 0) {
        const shY = p.bi === 'child' ? 0.72 : 1.38, shW = p.bi === 'child' ? 0.13 : 0.19;
        mPart.copy(mBody); tmpM.makeTranslation(-shW, shY, 0); mPart.multiply(tmpM); tmpM.makeRotationX(armL); mPart.multiply(tmpM);
        buckets.arms.im.setMatrixAt(p.slotA, mPart);
        buckets.hands.im.setMatrixAt(p.slotHand, mPart);          // hands 几何自带腕端偏移
        mPart.copy(mBody); tmpM.makeTranslation(shW, shY, 0); mPart.multiply(tmpM); tmpM.makeRotationX(armR); mPart.multiply(tmpM);
        buckets.arms2.im.setMatrixAt(p.slotA, mPart);
        if (p.prop) {
          const bkP = buckets.props;
          mPart.copy(mBody); tmpM.makeTranslation(0.24, p.bi === 'child' ? 0.7 : 1.3, 0.05); mPart.multiply(tmpM); tmpM.makeRotationX(0.08); mPart.multiply(tmpM);
          bkP.im.setMatrixAt(p.slotP, mPart);
        }
      }
    }

    for (const k in buckets) {
      const bk = buckets[k];
      if (bk.im) {
        bk.im.instanceMatrix.needsUpdate = true;
        if (bk.im.instanceColor) bk.im.instanceColor.needsUpdate = true;
      }
    }
  };

  function writeZero(p) {
    buckets['b:' + p.bi].im.setMatrixAt(p.slotB, ZEROM);
    buckets['h:' + p.hi].im.setMatrixAt(p.slotH, ZEROM);
    buckets.arms.im.setMatrixAt(p.slotA, ZEROM);
    buckets.arms2.im.setMatrixAt(p.slotA, ZEROM);
    buckets.hands.im.setMatrixAt(p.slotHand, ZEROM);
    if (p.prop) buckets.props.im.setMatrixAt(p.slotP, ZEROM);
  }

  F.stats = function () {
    const out = { persons: persons.length, buckets: {} };
    for (const k in buckets) out.buckets[k] = buckets[k].list.length;
    return out;
  };

  /* 调试取样：返回若干人物的世界坐标（验收截图定位用） */
  F.sample = function (n) {
    const out = [];
    for (let i = 0; i < persons.length && out.length < (n || 6); i++) {
      const p = persons[i];
      if (p.scene === 'boat' || p.wet) continue;
      const x = p.ring ? p.ring.cx + Math.cos(p.ring.a) * p.ring.r2 : (p._lx || 0);
      const z = p.ring ? p.ring.cz + Math.sin(p.ring.a) * p.ring.r2 : (p._lz || 0);
      out.push({ x, z, y: p.gy || 1.8, scene: p.scene, head: p.bi });
    }
    return out;
  };

  /* ---------------- 构建（游客 + 行人；乘客由 Traffic 追加注册） ---------------- */
  F.build = function (sc, course, lmList, terr, tr) {
    if (scene) return;
    scene = sc;
    BODY_KEYS.forEach(k => mkBucket('b:' + k, bodyGeo(k), new THREE.MeshLambertMaterial({})));
    HEAD_KEYS.forEach(k => mkBucket('h:' + k, headGeo(k), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const ag = armGeo();
    mkBucket('arms', ag, new THREE.MeshLambertMaterial({}));
    mkBucket('arms2', ag.clone(), new THREE.MeshLambertMaterial({}));
    mkBucket('hands', handGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    mkBucket('props', propGeo(), new THREE.MeshLambertMaterial({ color: 0x6a4a2c }));
    F.registerVisitors(lmList, terr, tr);
    F.registerWalkers(course, terr, tr);
    // finalize 延迟到首次 update（让 Traffic 乘客也能注册）
  };

  /* ---------------- 单体人物建模（非实例化；玩家自身等，以后可复用） ----------------
     返回 { group, body, head, armL, armR }；人物前方 = 局部 -Z，身高约 1.75*scale */
  F.makeFigure = function (opt) {
    opt = opt || {};
    const color = opt.color || 0x4a6e8c;
    const skin = opt.skin || 0xe6c09a;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(bodyGeo(opt.body || 'gown'), bodyMat);
    g.add(body);
    const head = new THREE.Mesh(headGeo(opt.head || 'dongpo'), new THREE.MeshLambertMaterial({ vertexColors: true }));
    head.position.y = 1.56;
    g.add(head);
    const armMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.86) });
    const handMat = new THREE.MeshLambertMaterial({ color: skin });
    const hg = new THREE.SphereGeometry(0.048, 8, 6);
    const armL = new THREE.Mesh(armGeo(), armMat);
    armL.position.set(-0.19, 1.38, 0);
    const armR = new THREE.Mesh(armGeo(), armMat);
    armR.position.set(0.19, 1.38, 0);
    const handL = new THREE.Mesh(hg, handMat); handL.position.set(-0.19, 0.855, 0);
    const handR = new THREE.Mesh(hg, handMat); handR.position.set(0.19, 0.855, 0);
    g.add(armL); g.add(armR); g.add(handL); g.add(handR);
    const s = opt.scale || 1;
    g.scale.set(s, s, s);
    return { group: g, body, head, armL, armR, handL, handR, bodyMat, armMat };
  };

  /* ---------------- 玩家自身（第一视角可见的身体 / 第三人称完整人物） ----------------
     古人装束：交领右衽长袍 + 束腰 + 蓑衣 + 斗笠（烟雨江南的船家打扮）。
     局部坐标：前方 = -Z；y=0 为甲板面。返回 { group, head, hat, hands, setFirstPerson } */
  function playerAvatar(opt) {
    opt = opt || {};
    const skin = 0xe6c09a;
    const robeC = opt.robe === undefined ? 0x35506b : opt.robe;       // 靛青
    const innerC = 0xe8e4d6;                                           // 中衣月白
    const strawC = 0x9a8152;                                           // 蓑衣/斗笠
    const mRobe = new THREE.MeshLambertMaterial({ color: robeC });
    const mInner = new THREE.MeshLambertMaterial({ color: innerC });
    const mStraw = new THREE.MeshLambertMaterial({ color: strawC, side: THREE.DoubleSide });
    const mSkin = new THREE.MeshLambertMaterial({ color: skin });
    const mHair = new THREE.MeshLambertMaterial({ color: 0x241d18 });
    const mBelt = new THREE.MeshLambertMaterial({ color: 0x2f2b26 });
    const g = new THREE.Group();

    /* 盘坐的袍摆（下盘） */
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.26, 12), mRobe);
    skirt.position.y = 0.12; g.add(skirt);
    /* 双膝（袍下顶起） */
    for (const s of [-1, 1]) {
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.135, 9, 7), mRobe);
      knee.scale.set(1.05, 0.85, 1.15);
      knee.position.set(s * 0.145, 0.16, -0.24);
      g.add(knee);
    }
    /* 上身 */
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.215, 0.54, 10), mRobe);
    torso.position.y = 0.45; g.add(torso);
    /* 交领右衽（胸前白色 V 形衣襟） */
    for (const s of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.4, 0.03), mInner);
      lapel.position.set(s * 0.06, 0.56, -0.16);
      lapel.rotation.z = s * 0.34;
      lapel.rotation.x = -0.1;
      g.add(lapel);
    }
    /* 束腰 */
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.205, 0.09, 10), mBelt);
    belt.position.y = 0.28; g.add(belt);
    /* 肩 */
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 7), mRobe);
    shoulder.scale.set(1.3, 0.62, 0.95);
    shoulder.position.y = 0.70; g.add(shoulder);
    /* 蓑衣（草编披肩，开口朝前） */
    const cape = new THREE.Mesh(new THREE.ConeGeometry(0.43, 0.52, 14, 1, true, Math.PI * 0.18, Math.PI * 1.64), mStraw);
    cape.position.y = 0.60;
    g.add(cape);
    /* 颈 + 头 */
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.1, 8), mSkin);
    neck.position.y = 0.80; g.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.118, 12, 9), mSkin);
    head.scale.set(0.94, 1.06, 0.98);
    head.position.y = 0.905; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.124, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), mHair);
    hair.position.set(0, 0.915, 0.012); g.add(hair);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), mHair);
    bun.position.set(0, 1.03, 0.035); g.add(bun);
    /* 斗笠 */
    const hat = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.17, 14), mStraw);
    brim.position.y = 0.02; hat.add(brim);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mStraw);
    knob.position.y = 0.1; hat.add(knob);
    hat.position.y = 0.99;
    g.add(hat);
    /* 双臂：衣袖（管状） + 肤色双手，落在膝上 */
    const hands = [];
    for (const s of [-1, 1]) {
      const pts = [
        [s * 0.19, 0.68, 0.0],
        [s * 0.245, 0.50, -0.14],
        [s * 0.235, 0.30, -0.30],
        [s * 0.215, 0.20, -0.38]
      ];
      const sleeve = new THREE.Mesh(U.tube(pts, 0.062, 14, 6), mRobe);
      g.add(sleeve);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.06, 8), mInner);
      cuff.position.set(s * 0.215, 0.215, -0.375);
      cuff.rotation.x = 0.9;
      g.add(cuff);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mSkin);
      hand.scale.set(0.9, 0.8, 1.25);
      hand.position.set(s * 0.2, 0.185, -0.42);
      g.add(hand);
      hands.push(hand);
    }
    const api = {
      group: g, head, hair, bun, hat, hands, cape,
      /* 第一视角：藏头与斗笠（相机在头内），其余留作"自己的身体" */
      setFirstPerson: function (on) {
        head.visible = !on; hair.visible = !on; bun.visible = !on; hat.visible = !on;
      }
    };
    return api;
  }

  window.PlayerModel = {
    build: F.makeFigure,
    avatar: playerAvatar,
    /* 坐姿人物（旧接口保留） */
    seated: function (opt) {
      const a = playerAvatar(opt);
      a.setFirstPerson(false);
      return a;
    }
  };

  return F;
})();
