/* 上岸步行：第一人称自由行走 + 碰撞体积 + 跳跃 + 体力冲刺
   - 碰撞：湖岸（不许下水）/ 景点主体 / 摊位 / 商铺 / 民居 / 树干 / 陡坡 / 地图边界空气墙
   - 站立面高度取 Terrain.heightAt（含堤面 1.78m），并做平滑跟随
   - 第一视角自带身体：低头能看到自己的双腿交替迈步、两只手臂轮流向前摆（v2.2）
   - 视角完全由鼠标 / 滑屏控制，不再"松手自动回正"（v2.2）
   - 只负责"人"，上下船、体力、模式切换由 game.js 调度 */
window.Walk = (function () {
  const W = {};

  const P = {
    x: 0, z: 0, y: 0, yaw: 0, pitch: 0,
    speed: 0, bob: 0, sway: 0, step: 0, active: false, sprint: 0,
    vy: 0, air: false, airT: 0, landK: 0
  };
  W.pos = P;

  let terrain = null, scene = null;
  let body = null;               // 第一视角可见的身体（站立姿态）
  let lastWallT = 0;

  const C = () => CFG.walk;

  /* 是否可站立：陆地或堤面 */
  function isLand(x, z) {
    if (!terrain) return false;
    if (terrain.onCauseway(x, z)) return true;
    return terrain.exactShoreDist(x, z) > C().shoreLimit;
  }

  function groundAt(x, z) {
    if (!terrain) return 0;
    /* v2.2：脚下高度必须与"看得见的地面"一致。
       上岸时脚下铺的是高密度细节贴片（高度 = heightAt + 3.5cm），就按解析高程站；
       其余情况按基础网格的插值高度站，避免 20m 大格子上脚浮空/陷地。 */
    if (terrain.detailMesh && terrain.detailMesh.visible) return terrain.heightAt(x, z) + 0.03;
    return terrain.meshHeightAt ? terrain.meshHeightAt(x, z) : terrain.heightAt(x, z);
  }

  /* 碰撞体：先看圆形障碍，再看岸线
     障碍数量大（景点 + 摊位 + 上千棵树 + 民居），用 16m 空间网格做邻域查询，避免逐帧全量扫描 */
  const CELLW = 16;
  let grid = new Map();
  let canopy = new Map();
  const gkey = (cx, cz) => (cx + 512) * 1024 + (cz + 512);

  function gridAdd(map, c) {
    const k = gkey(Math.floor(c.x / CELLW), Math.floor(c.z / CELLW));
    let a = map.get(k);
    if (!a) { a = []; map.set(k, a); }
    a.push(c);
  }
  function gridNear(map, x, z) {
    const cx = Math.floor(x / CELLW), cz = Math.floor(z / CELLW);
    const out = [];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const a = map.get(gkey(cx + i, cz + j));
        if (a) for (let k = 0; k < a.length; k++) out.push(a[k]);
      }
    }
    return out;
  }

  /* 空气墙：离岸超过 inland 米就是地图边界，不许再往内陆走 */
  function outsideWorld(x, z) {
    if (!terrain) return false;
    return terrain.shoreDist(x, z) > C().inland;
  }

  /* 碰撞体：圆形障碍 + 岸线 + 边界 */
  function blocked(x, z, fromY) {
    if (!isLand(x, z)) return true;
    if (outsideWorld(x, z)) return true;
    const r = C().radius;
    const list = gridNear(grid, x, z);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const dx = x - c.x, dz = z - c.z;
      const rr = c.r + r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    /* 陡坡：一步爬升超过 stepUp 就上不去（山体、石砌台基） */
    const h = groundAt(x, z);
    if (fromY !== undefined && h - fromY > C().stepUp) return true;
    return false;
  }

  /* 头顶是不是有树冠（落点最好别选在树荫正中，否则一上岸眼前全黑） */
  function underCanopy(x, z) {
    const list = gridNear(canopy, x, z);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const dx = x - c.x, dz = z - c.z;
      const rr = c.r + C().radius;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  /* 收集碰撞体（在 Landmarks / Trees 建好之后调用） */
  W.refresh = function () {
    grid = new Map();
    canopy = new Map();
    const L = window.Landmarks;
    if (L) {
      (L.list || []).forEach(lm => {
        const r = UTIL.clamp((lm.r || 18) * 0.26, 3.2, 12);
        gridAdd(grid, { x: lm.x, z: lm.z, r: r });
      });
      (L.stalls || []).forEach(s => gridAdd(grid, { x: s.x, z: s.z, r: s.r || 1.5 }));
      if (L.dock) gridAdd(grid, { x: L.dock.x, z: L.dock.z, r: 3.0 });
      (L.shops || []).forEach(s => gridAdd(grid, { x: s.x, z: s.z, r: 3.4 }));
      /* v2.2 岸上建筑碰撞：民居 / 临水人家 / 商铺立面（否则能直接穿墙进屋） */
      (L.houses || []).forEach(h => gridAdd(grid, { x: h.x, z: h.z, r: h.r || 4.4 }));
    }
    /* 树干：撞上去有实体感；树冠：落点避让 */
    const tr = (window.Trees && Trees.list) || [];
    for (let i = 0; i < tr.length; i++) {
      const t = tr[i];
      gridAdd(grid, { x: t.x, z: t.z, r: 0.45 + t.s * 0.32 });
      gridAdd(canopy, { x: t.x, z: t.z, r: 1.6 + t.s * 1.5 });
    }
  };

  /* 找船边最近的可站立点（下船落点）：优先挑头顶没树的空地 */
  W.findLandNear = function (x, z, maxR) {
    const lim = maxR || 30;
    let fallback = null;
    for (let r = 3; r <= lim; r += 1.6) {
      const steps = Math.max(12, Math.round(r * 1.6));
      for (let k = 0; k < steps; k++) {
        const a = k / steps * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (blocked(px, pz)) continue;
        const p = { x: px, z: pz, y: groundAt(px, pz) };
        if (!underCanopy(px, pz)) return p;
        if (!fallback) fallback = p;
      }
    }
    return fallback;
  };

  W.build = function (sc, terr) {
    scene = sc; terrain = terr;
    W.refresh();
    /* 第一视角自身：站立姿态（前方 = 局部 -Z）。
       build() 时相机在头内，所以不建头；腿与手臂留在画面下缘，低头可见。 */
    body = (window.PlayerModel && PlayerModel.walker) ? PlayerModel.walker({ robe: 0x2f4a62 }) : null;
    if (body) {
      body.setFirstPerson(true);          // 藏掉上身，只留双腿与双臂
      body.group.visible = false;
      scene.add(body.group);
    }
  };

  W.enter = function (x, z, yaw) {
    P.x = x; P.z = z; P.y = groundAt(x, z);
    P.yaw = yaw || 0; P.pitch = 0; P.speed = 0; P.bob = 0; P.sway = 0; P.step = 0;
    P.vy = 0; P.air = false; P.airT = 0; P.landK = 0;
    P.active = true;
    if (terrain && terrain.detailVisible) {
      terrain.detailVisible(true);
      terrain.updateDetail(x, z, true);
    }
    if (body) {
      body.group.visible = true;
      body.group.position.set(x + Math.cos(P.yaw) * 0.42, P.y, z + Math.sin(P.yaw) * 0.42);
      body.group.rotation.y = -P.yaw - Math.PI / 2;
    }
  };

  W.exit = function () {
    P.active = false; P.speed = 0; P.air = false; P.vy = 0;
    if (body) body.group.visible = false;
    if (terrain && terrain.detailVisible) terrain.detailVisible(false);
  };

  W.look = function (dyaw, dpitch) {
    P.yaw += dyaw;
    /* 上仰/下俯范围放宽：低头要能看到自己的腿 */
    P.pitch = UTIL.clamp(P.pitch + dpitch, -1.45, 1.28);
  };

  /* 跳跃：只在落地时生效 */
  W.jump = function () {
    if (!P.active) return false;
    if (P.air) return false;
    P.vy = C().jumpV;
    P.air = true;
    P.airT = 0;
    return true;
  };

  W.onGround = function () { return !P.air; };

  /* inp: { forward(-1..1), strafe(-1..1), turn(-1..1), sprint(bool) } */
  W.update = function (dt, inp) {
    if (!P.active || !terrain) return;
    inp = inp || {};
    const c = C();
    if (inp.turn) P.yaw -= inp.turn * dt * 1.9;
    const want = (inp.sprint ? c.sprint : c.speed);
    let vx = 0, vz = 0;
    const f = UTIL.clamp(inp.forward || 0, -1, 1);
    const s = UTIL.clamp(inp.strafe || 0, -1, 1);
    if (f || s) {
      const ch = Math.cos(P.yaw), sh = Math.sin(P.yaw);
      vx = ch * f - sh * s;                    // 前方 + 右方
      vz = sh * f + ch * s;
      const l = Math.hypot(vx, vz) || 1;
      vx /= l; vz /= l;
    }
    const moving = (f !== 0 || s !== 0);
    P.speed += ((moving ? want : 0) - P.speed) * Math.min(1, dt * 9);
    P.sprint = moving && inp.sprint ? 1 : 0;

    let nx = P.x + vx * P.speed * dt;
    let nz = P.z + vz * P.speed * dt;
    const y0 = groundAt(P.x, P.z);
    if (!blocked(nx, nz, y0)) {
      P.x = nx; P.z = nz;
    } else if (!blocked(nx, P.z, y0)) {
      P.x = nx;                                // 沿墙滑动（X 向）
    } else if (!blocked(P.x, nz, y0)) {
      P.z = nz;
    } else {
      P.speed *= 0.35;
      /* 撞到"空气墙"时给个提示（0.35s 节流，避免刷屏） */
      const now = performance.now();
      if (outsideWorld(nx, nz) && now - lastWallT > 1600) {
        lastWallT = now;
        if (W.onWall) W.onWall();
      }
    }

    /* 贴地 / 跳跃：
       落地时高度平滑跟随地形（避免石阶一跳一跳）；
       起跳后按重力积分，落地做一个很短的缓冲（landK 驱动相机下沉）。 */
    const h = groundAt(P.x, P.z);
    if (P.air) {
      P.airT += dt;
      P.vy -= c.gravity * dt;
      P.y += P.vy * dt;
      if (P.y <= h && P.vy <= 0) {
        P.y = h; P.vy = 0; P.air = false;
        P.landK = Math.min(1, P.airT * 2.2);
        if (W.onLand) W.onLand(P.landK);
      }
    } else {
      /* 走坡时用更快的跟随，防止上坡把脚埋进地里 */
      P.y += (h - P.y) * Math.min(1, dt * 16);
      if (Math.abs(P.y - h) < 0.02) P.y = h;
    }
    P.landK = Math.max(0, P.landK - dt * 3.4);

    /* 步态：速度越快步频越高、摆幅越大；腾空时腿收起 */
    const spN = UTIL.clamp(P.speed / c.speed, 0, 1.6);
    if (P.speed > 0.4) {
      P.step += dt * P.speed * 2.4;
      const amp = c.bobAmp * (0.55 + 0.45 * Math.min(1, spN));
      P.bob = Math.sin(P.step * 2) * amp;                       // 每步一次起伏
      P.sway = Math.cos(P.step) * c.swayAmp * Math.min(1, spN);  // 左右换重心
    } else {
      P.bob *= 0.86;
      P.sway *= 0.86;
      P.step += dt * 0.6 * (P.air ? 0 : 1);
    }

    if (body) {
      /* 身体比碰撞中心往前放 0.42m：相机在"后脑勺"位置，低头才看得到完整的
         大腿—小腿—脚（贴着身体拍只能看到两个截断面）。纯观感偏移，不参与碰撞。 */
      const fx = Math.cos(P.yaw), fz = Math.sin(P.yaw);
      body.group.position.set(P.x + fx * 0.42, P.y, P.z + fz * 0.42);
      body.group.rotation.y = -P.yaw - Math.PI / 2;   // 人物前方 -Z → 世界朝向
      body.pose(P.step, spN, P.air, P.vy);
    }
    /* 近景地面贴片跟随（移动 >2.5m 才重算，避免每帧开销） */
    if (terrain && terrain.updateDetail) terrain.updateDetail(P.x, P.z);
  };

  W.applyCamera = function (camera) {
    if (!P.active) return;
    const c = C();
    const eyeY = P.y + c.eye + P.bob - P.landK * 0.09;
    const cp = Math.cos(P.pitch), sp = Math.sin(P.pitch);
    const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
    /* 相机比身体中心略靠后 10cm：低头时双腿才落在画面下缘（贴着拍会看不见脚） */
    const bx = P.x, bz = P.z;
    /* 左右摇摆：沿着"右方向"平移（-sy, cy）——走路时视点真的在晃，不只是上下抖 */
    const rx = -sy * P.sway, rz = cy * P.sway;
    camera.position.set(bx + rx, eyeY, bz + rz);
    camera.up.set(0, 1, 0);
    camera.lookAt(bx + rx + cy * cp * 30, eyeY + sp * 30, bz + rz + sy * cp * 30);
    /* 轻微侧倾（走路的重心转移）：lookAt 之后再绕视线滚一点 */
    if (Math.abs(P.sway) > 0.0005) camera.rotation.z -= P.sway * 0.55;
    /* 注意：不要再写 camera.rotation.z = 0。
       Three.js 默认 XYZ 欧拉序无法无歧义表示"偏航+俯仰"，lookAt 后强行清零 z 会
       重新构造出另一个朝向，俯视时甚至会把相机掀翻（视线朝天上）。 */
  };

  W.active = function () { return P.active; };
  W.eyeY = function () { return P.y + C().eye; };
  W.sprinting = function () { return !!P.sprint; };
  /* 调试：拿到第一视角身体（核对站姿/摆臂用） */
  W.body = function () { return body; };

  return W;
})();
