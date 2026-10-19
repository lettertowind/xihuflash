/* 湖面交通船：乌篷船/画舫/快艇/保洁船沿环线航行，桥梁减速、避让与碰撞 */
window.Traffic = (function () {
  const TR = {};
  let boats = [];
  let curves = [];
  let nearCd = 0;

  const KINDS = [
    { kind: 'wupeng', speed: 3.6, r: 2.3, w: 0.8 },
    { kind: 'huafang', speed: 4.4, r: 3.1, w: 1.0 },
    { kind: 'speed', speed: 11.5, r: 2.4, w: 0.7 },
    { kind: 'clean', speed: 3.0, r: 1.9, w: 0.55 }
  ];

  TR.build = function (scene, course, terrain, tier, landmarks) {
    boats = []; curves = [];
    const n = Math.max(6, (tier.ai || 6) + 6);
    const offsets = [-70, 60, -135, 125, -40, 30, 95, -100];
    const rr = UTIL.rng(20260214);

    // 由中心环线构造 4 条偏移环线
    const base = course.center;
    const cnt = base.length;
    for (let li = 0; li < 4; li++) {
      const off = offsets[li];
      const pts = [];
      for (let i = 0; i < cnt; i++) {
        const p = base[i], pn = base[(i + 1) % cnt], pp = base[(i - 1 + cnt) % cnt];
        const tx = pn[0] - pp[0], tz = pn[1] - pp[1];
        const tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl, nz = tx / tl;
        let x = p[0] + nx * off, z = p[1] + nz * off;
        // 回退到可航水域
        if (!terrain.navigable(x, z)) {
          const half = off * 0.5;
          x = p[0] + nx * half; z = p[1] + nz * half;
          if (!terrain.navigable(x, z)) { x = p[0]; z = p[1]; }
        }
        pts.push(new THREE.Vector3(x, 0, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
      curve.getLength();
      curves.push(curve);
    }

    const obs = (landmarks && landmarks.obstacles) || [];
    for (let i = 0; i < n; i++) {
      const kd = KINDS[i % 4];
      const mdl = BoatModel.build(kd.kind, 101 + i * 37);
      const grp = mdl.group;
      scene.add(grp);
      const ci = i % curves.length;
      const dir = (ci % 2 === 0) ? 1 : -1;
      // 环线均匀分布 + 小抖动；避开起点
      let t0 = (i / n + rr() * 0.05) % 1;
      const start = course.start;
      for (let tries = 0; tries < 12; tries++) {
        const p = curves[ci].getPointAt(t0);
        if (Math.hypot(p.x - start.x, p.z - start.z) > CFG.traffic.clearStart) break;
        t0 = (t0 + 0.09) % 1;
      }
      boats.push({
        grp, t: t0, ci, dir, kind: kd.kind, r: kd.r, w: kd.w,
        speed: kd.speed * (0.8 + rr() * 0.45),
        x: 0, z: 0, heading: 0, bob: Math.random() * 7,
        slow: 1, oar: mdl.oar, phase: Math.random() * 6, hidden: false,
        lamps: mdl.lamps || null,
        dead: false, deadT: 0, flyX: 0, flyZ: 0, rollV: 0, deadRoll: 0, yawSpin: 0, sinkY: 0
      });
    }

    // 码头边系泊的两条乌篷船（静态障碍）
    if (landmarks && landmarks.dock) {
      const d = landmarks.dock;
      for (let k = 0; k < 2; k++) {
        const mdl = BoatModel.build('wupeng');
        const ang = d.ry + (k ? 1.9 : -1.9);
        const x = d.x + Math.cos(ang) * 9, z = d.z + Math.sin(ang) * 9;
        mdl.group.position.set(x, 0, z);
        mdl.group.rotation.y = ang + 0.4;
        scene.add(mdl.group);
        boats.push({
          grp: mdl.group, static: true, x, z,
          heading: ang + 0.4, r: 2.3, w: 0, speed: 0, bob: Math.random() * 7,
          slow: 1, oar: null, phase: 0, hidden: false
        });
      }
    }

    // 宋装船客 + 摇橹人（figures.js 部位级实例）
    if (window.Figures) Figures.addBoatPassengers(boats, terrain, tier);
  };

  /* 碰撞检测 + 推挤；返回撞击强度（供音效/镜头） */
  TR.update = function (dt, player, obstacles) {
    let impact = 0;
    const obs = obstacles || [];

    // 近场补位：视野内没船时立刻把远船调到玩家前方
    nearCd -= dt;
    if (nearCd <= 0) {
      let dmin = 1e9;
      for (const b of boats) {
        if (b.static || b.hidden) continue;
        const d = Math.hypot(b.x - player.x, b.z - player.z);
        if (d < dmin) dmin = d;
      }
      if (dmin > 850) {
        nearCd = 4;
        const fx = Math.cos(player.heading), fz = Math.sin(player.heading);
        for (const b of boats) {
          if (b.static || b.dead) continue;
          const d = Math.hypot(b.x - player.x, b.z - player.z);
          if (d > 0 && d < 2600) continue;
          const curve = curves[b.ci];
          let bestT = -1, bestScore = 1e9;
          for (let s2 = 0; s2 < 240; s2++) {
            const tt = s2 / 240;
            const p = curve.getPoint(tt);
            const dx = p.x - player.x, dz = p.z - player.z;
            const dd = Math.hypot(dx, dz);
            if (dd < 380 || dd > 720) continue;
            const ahead = (dx * fx + dz * fz) / (dd || 1);
            if (ahead < 0.3) continue;
            const score = Math.abs(dd - 500) + (1 - ahead) * 260;
            if (score < bestScore) { bestScore = score; bestT = tt; }
          }
          if (bestT >= 0) { b.t = bestT; b.slow = 0.25; }
        }
      }
    }

    for (const b of boats) {
      if (!b.static && !b.dead) {
        // 前进
        const curve = curves[b.ci];
        const len = curve.getLength();
        // 桥梁/石塔附近减速
        const p0 = curve.getPointAt(b.t);
        let slowTarget = 1;
        for (const o of obs) {
          const rr = o.bridge ? 24 : 7;
          const dx = p0.x - o.x, dz = p0.z - o.z;
          if (dx * dx + dz * dz < rr * rr) { slowTarget = o.bridge ? 0.35 : 0.15; break; }
        }
        // 玩家在前方则减速
        const pdx = player.x - p0.x, pdz = player.z - p0.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd < 34) {
          const tan = curve.getTangentAt(b.t);
          const tx = tan.x * b.dir, tz = tan.z * b.dir;
          if ((pdx * tx + pdz * tz) / (pd || 1) > 0.72) slowTarget = Math.min(slowTarget, 0.3);
        }
        b.slow += (slowTarget - b.slow) * Math.min(1, dt * 2.5);
        const v = b.speed * b.slow * b.dir;
        b.t = (b.t + v * dt / len + 1) % 1;
        const p = curve.getPointAt(b.t);
        const tan = curve.getTangentAt(b.t);
        b.heading = Math.atan2(tan.z * b.dir, tan.x * b.dir);
        b.x = p.x; b.z = p.z;
        if (b.oar) {
          b.phase += dt * 2.4;
          b.oar.rotation.y = Math.sin(b.phase) * 0.24;
        }
      } else if (b.dead) {
        /* 被撞翻：夸张飞出 + 侧倾倾覆 + 下沉，数秒后复位重生 */
        b.deadT += dt;
        b.x += b.flyX * dt; b.z += b.flyZ * dt;
        const dec = Math.exp(-dt * 1.5);
        b.flyX *= dec; b.flyZ *= dec; b.yawSpin *= dec;
        b.deadRoll += b.rollV * dt;
        const maxRoll = 1.95;                       // ≈112° 倾覆
        if (b.deadRoll > maxRoll) { b.deadRoll = maxRoll; b.rollV *= 0.35; }
        if (b.deadRoll < -maxRoll) { b.deadRoll = -maxRoll; b.rollV *= 0.35; }
        b.heading += b.yawSpin * dt;
        b.sinkY = Math.min(2.3, Math.max(0, (b.deadT - 1.1) * 0.95));
        if (b.deadT > 6.5) {                        // 重生：回到环线随机点
          b.dead = false; b.deadT = 0; b.deadRoll = 0; b.sinkY = 0; b.rollV = 0; b.yawSpin = 0;
          b.t = Math.random();
        }
      }
      // 距离剔除
      const dP = Math.hypot(b.x - player.x, b.z - player.z);
      const hide = dP > 1100;
      if (hide !== b.hidden) { b.hidden = hide; b.grp.visible = !hide; }
      if (!hide) {
        b.bob += dt;
        const bobY = Math.sin(b.bob * 1.4 + b.phase) * 0.035;
        if (b.dead) {
          b.grp.position.set(b.x, bobY - b.sinkY, b.z);
          b.grp.rotation.set(-0.14, -b.heading, b.deadRoll);
        } else {
          b.grp.position.set(b.x, bobY, b.z);
          b.grp.rotation.set(Math.sin(b.bob * 1.1) * 0.012, -b.heading, Math.sin(b.bob * 0.9) * 0.015);
        }
        // 船灯随昼夜
        if (b.lamps && window.Weather && Weather.lampK) {
          const k = Weather.lampK();
          if (k > 0) BoatModel.setLamps(b, k, 0.9 + 0.1 * Math.sin(b.bob * 8.1 + b.phase));
        }
      }
      // 与玩家碰撞
      if (dP < b.r + 2.7 && !b.dead) {
        const COL = CFG.collision;
        const nx = (player.x - b.x) / (dP || 1), nz = (player.z - b.z) / (dP || 1);
        const push = (b.r + 2.7 - dP);
        player.x += nx * push * 0.85;
        player.z += nz * push * 0.85;
        // 速度损失与转向偏移
        const relSp = Math.abs(player.speed);
        if (relSp < COL.threshold) {
          /* 未达速度阈值：只做弹性碰撞（弹开 + 轻响），不算事故、不惊呼、不翻船 */
          player.speed = -player.speed * COL.bounce;
          if (player.hitCool <= 0) {
            player.hitCool = COL.bumpCool;
            if (window.Boat && Boat.bounce) Boat.bounce(Math.min(1, relSp / COL.threshold));
          }
        } else {
          const damp = 0.25 + 0.4 * Math.min(1, relSp / 40);
          player.speed *= (1 - damp * 0.75);
          if (player.hitCool <= 0) {
            player.collisions++;
            player.hitCool = 0.5;
            const hitK = UTIL.clamp(relSp / 45, 0.12, 1.4);
            /* 高速撞击：主船大幅震颤（可能翻船），对方夸张飞出倾覆沉没 + 惊呼 */
            if (window.Boat && Boat.impact) Boat.impact(hitK); else player.shake = Math.min(1.7, player.shake + 0.9);
            impact = 1;
            if (!b.static) {
              b.dead = true; b.deadT = 0; b.deadRoll = 0; b.sinkY = 0;
              const pw = 3.2 + relSp * 0.3;
              b.flyX = -nx * pw; b.flyZ = -nz * pw;
              b.rollV = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 1.2);
              b.yawSpin = (Math.random() - 0.5) * 3.2;
            }
          }
        }
        if (!b.static && b.speed && !b.dead) b.t = (b.t - Math.sign(b.dir) * 0.0015 + 1) % 1;
      }
    }
    return impact;
  };

  TR.list = function () {
    return boats.filter(b => !b.hidden).map(b => ({ x: b.x, z: b.z, heading: b.heading, w: b.w, kind: b.kind, static: !!b.static }));
  };

  return TR;
})();
