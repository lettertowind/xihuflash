/* 水面航线箭头：竞速模式用
   - 沿巡回航线等距铺一组贴合水面的箭头，三段错相闪烁形成"向前流动"的方向感
   - 全部实例化（3 个 InstancedMesh），零逐帧矩阵更新，只改材质透明度 */
window.Guide = (function () {
  const G = {};
  let scene = null, route = [], groups = [], glows = [], ready = false, visible = false, t = 0;

  function arrowGeo() {
    /* 贴水面箭头（本地 +X 为前进方向）：后端细柄 + 前端三角 */
    const s = new THREE.Shape();
    s.moveTo(-1.9, 0.34);
    s.lineTo(0.35, 0.34);
    s.lineTo(0.35, 0.98);
    s.lineTo(1.95, 0.0);
    s.lineTo(0.35, -0.98);
    s.lineTo(0.35, -0.34);
    s.lineTo(-1.9, -0.34);
    s.closePath();
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    return g;
  }

  function resample(pts, gap) {
    const out = [];
    if (!pts || pts.length < 2) return out;
    let acc = 0;
    out.push([pts[0][0], pts[0][1]]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      if (!L) continue;
      let d = gap - acc;
      while (d <= L) {
        out.push([a[0] + dx * (d / L), a[1] + dz * (d / L)]);
        d += gap;
      }
      acc = (acc + L) % gap;
    }
    return out;
  }

  G.build = function (sc, pts) {
    scene = sc;
    G.setRoute(pts);
  };

  G.setRoute = function (pts) {
    if (!scene || !pts || pts.length < 3) return;
    route = pts;
    /* 清掉旧箭头 */
    groups.forEach(im => { if (im.parent) im.parent.remove(im); im.geometry.dispose(); im.material.dispose(); });
    glows.forEach(im => { if (im.parent) im.parent.remove(im); im.geometry.dispose(); im.material.dispose(); });
    groups = [];
    glows = [];

    const gap = 26;
    const marks = resample(route, gap);
    const n = marks.length;
    if (n < 6) return;

    const geo = arrowGeo();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(),
      s3 = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
    const buckets = [[], [], []];
    for (let i = 0; i < n; i++) {
      const a = marks[i], b = marks[(i + 1) % n];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      buckets[i % 3].push({ x: a[0], z: a[1], ang });
    }
    for (let k = 0; k < 3; k++) {
      const list = buckets[k];
      if (!list.length) continue;
      /* v2.2：箭头改「黄色 + 闪烁黄光」——
         每段相位各出一层：实心黄箭头（本体）+ 放大的加色黄晕（光）。
         两层共用同一批矩阵，update 里只改 opacity / color，零额外矩阵开销。 */
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd23c, transparent: true, opacity: 0.72,
        blending: THREE.NormalBlending, depthWrite: false,
        side: THREE.DoubleSide, fog: false
      });
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.frustumCulled = false;
      im.renderOrder = 3;
      const gMat = new THREE.MeshBasicMaterial({
        color: 0xffbe2e, transparent: true, opacity: 0.0,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, fog: false
      });
      const gim = new THREE.InstancedMesh(geo, gMat, list.length);
      gim.frustumCulled = false;
      gim.renderOrder = 2;
      for (let i = 0; i < list.length; i++) {
        e.set(0, -list[i].ang, 0); q.setFromEuler(e);
        p3.set(list[i].x, 0.30, list[i].z);
        s3.set(2.4, 1, 2.4);
        m4.compose(p3, q, s3);
        im.setMatrixAt(i, m4);
        /* 光晕层：贴水更高一点、放大 1.7 倍，避免和本体 z-fighting */
        p3.set(list[i].x, 0.34, list[i].z);
        s3.set(4.1, 1, 4.1);
        m4.compose(p3, q, s3);
        gim.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
      gim.instanceMatrix.needsUpdate = true;
      im.visible = visible; gim.visible = visible;
      scene.add(gim);
      scene.add(im);
      groups.push(im);
      glows.push(gim);
    }
    ready = true;
  };

  G.setVisible = function (v) {
    visible = !!v;
    groups.forEach(im => { im.visible = visible; });
    glows.forEach(im => { im.visible = visible; });
  };

  G.visible = function () { return visible; };

  /* 调试：箭头本体的透明度/颜色与光晕透明度（验证"黄色 + 闪烁黄光"） */
  G.debug = function () {
    const c = groups[0], g0 = glows[0];
    return {
      n: groups.length, vis: visible,
      op: c ? +c.material.opacity.toFixed(3) : -1,
      hex: c ? c.material.color.getHexString() : '-',
      gop: g0 ? +g0.material.opacity.toFixed(3) : -1
    };
  };

  G.update = function (dt) {
    if (!ready || !visible) return;
    t += dt;
    /* 三段错相：0 → 0.33 → 0.66 相位，视觉上像一串箭头朝前追；
       每段再叠一层「快闪」（5.5rad/s）——整体是黄色呼吸 + 逐段闪黄光 */
    const flash = 0.5 + 0.5 * Math.sin(t * 5.5);
    for (let k = 0; k < groups.length; k++) {
      const ph = t * 2.2 - k * 1.05;
      const w = Math.pow(0.5 + 0.5 * Math.sin(ph), 2.2);
      const core = groups[k], glow = glows[k];
      if (core) {
        core.material.opacity = 0.55 + 0.45 * w;
        /* 黄 → 亮金：随相位在 #ffd23c 与 #fff0a0 之间呼吸 */
        core.material.color.setRGB(1.0, 0.72 + 0.20 * w, 0.10 + 0.22 * w);
      }
      if (glow) {
        glow.material.opacity = (0.10 + 0.30 * w) * (0.55 + 0.45 * flash);
        glow.material.color.setRGB(1.0, 0.74 + 0.16 * flash, 0.12 * (0.6 + 0.4 * w));
      }
    }
  };

  G.dispose = function () {
    groups.forEach(im => { if (im.parent) im.parent.remove(im); im.geometry.dispose(); im.material.dispose(); });
    glows.forEach(im => { if (im.parent) im.parent.remove(im); im.geometry.dispose(); im.material.dispose(); });
    groups = []; glows = []; ready = false;
  };

  return G;
})();
