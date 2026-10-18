/* 地标：程序化建模（三潭印月石塔、湖心亭、雷峰塔、保俶塔等） */
window.Landmarks = (function () {
  const L = {};

  const MAT = {
    stone: new THREE.MeshLambertMaterial({ color: 0xd6cfbe }),
    wall: new THREE.MeshLambertMaterial({ color: 0xefe7d6 }),
    red: new THREE.MeshLambertMaterial({ color: 0x8d3a2c }),
    roof: new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
    roofJade: new THREE.MeshLambertMaterial({ color: 0x39484a }),
    gold: new THREE.MeshLambertMaterial({ color: 0xd9a441, emissive: 0x2a1c05 }),
    brick: new THREE.MeshLambertMaterial({ color: 0xb99b76 }),
    wood: new THREE.MeshLambertMaterial({ color: 0x6b4a30 }),
    yellow: new THREE.MeshLambertMaterial({ color: 0xc9a24b })
  };

  function roof(radius, height, mat, seg) {
    const pts = [
      new THREE.Vector2(0.02, height),
      new THREE.Vector2(radius * 0.42, height * 0.74),
      new THREE.Vector2(radius * 0.78, height * 0.34),
      new THREE.Vector2(radius * 0.97, height * 0.10),
      new THREE.Vector2(radius * 1.04, 0.0)
    ];
    const g = new THREE.LatheGeometry(pts, seg || 8);
    const m = new THREE.Mesh(g, mat);
    m.material.side = THREE.DoubleSide;
    return m;
  }

  function pavilion(o) {
    o = o || {};
    const g = new THREE.Group();
    const w = o.w || 7, h = o.h || 4.4, sq = o.round ? 8 : 4;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.86, w * 0.9, 0.7, sq), MAT.stone);
    base.position.y = 0.35; g.add(base);
    const cols = sq;
    for (let i = 0; i < cols; i++) {
      const a = i / cols * Math.PI * 2 + Math.PI / cols;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, h, 6), MAT.red);
      c.position.set(Math.cos(a) * w * 0.62, 0.7 + h / 2, Math.sin(a) * w * 0.62);
      g.add(c);
    }
    if (!o.open) {
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.42, h * 0.82, sq), MAT.wall);
      wall.position.y = 0.7 + h * 0.41; g.add(wall);
    }
    const r = roof(w * 1.02, h * 0.82, o.roofMat || MAT.roof, o.round ? 16 : 4);
    r.position.y = 0.7 + h; g.add(r);
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), MAT.gold);
    fin.position.y = 0.7 + h + h * 0.82; g.add(fin);
    return g;
  }

  function pagoda(tiers, baseR, tierH, opts) {
    opts = opts || {};
    const g = new THREE.Group();
    let y = 0;
    for (let t = 0; t < tiers; t++) {
      const k = 1 - t * (opts.shrink || 0.11);
      const r = baseR * k;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.03, tierH, 8), opts.bodyMat || MAT.wall);
      body.position.y = y + tierH / 2; g.add(body);
      if (!opts.plain) {
        const r2 = roof(r * 1.55, tierH * 0.34, opts.roofMat || MAT.roof, 8);
        r2.position.y = y + tierH * 0.94; g.add(r2);
      } else {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.5, 8), MAT.stone);
        band.position.y = y + tierH * 0.96; g.add(band);
      }
      y += tierH;
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, baseR * 1.5, 8), MAT.gold);
    spire.position.y = y + baseR * 0.7; g.add(spire);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(baseR * 0.26, 10, 8), MAT.gold);
    ball.position.y = y + baseR * 1.5; g.add(ball);
    return g;
  }

  function hall(w, d, h) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.yellow);
    body.position.y = h / 2 + 0.8; g.add(body);
    const r = roof(Math.max(w, d) * 0.72, h * 0.55, MAT.roof, 4);
    r.position.y = h + 0.8; r.scale.z = d / w; g.add(r);
    return g;
  }

  function stele(text) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.9), MAT.stone);
    b.position.y = 0.25; g.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.6, 0.32), MAT.stone);
    s.position.y = 1.7; g.add(s);
    return g;
  }

  L.build = function (scene, course) {
    const byName = {};
    course.landmarks.forEach(l => byName[l.name] = l);
    const put = (name, obj, y, rot) => {
      const l = byName[name];
      if (!l) return null;
      obj.position.set(l.x, y === undefined ? 1.0 : y, l.z);
      if (rot) obj.rotation.y = rot;
      scene.add(obj);
      return obj;
    };

    // 湖滨集贤亭
    const jixian = pavilion({ w: 6, h: 4.2, round: true, open: true });
    jixian.scale.set(0.9, 0.9, 0.9);
    put('湖滨·集贤亭', jixian, 1.2, 0.4);

    // 断桥：白堤东端（世界里的石桥已建，这里加一对石狮）
    put('断桥残雪', stele(), 1.6, 0.5);

    // 保俶塔：细长砖塔
    const baochu = pagoda(7, 2.6, 5.0, { plain: true, bodyMat: MAT.brick, shrink: 0.06 });
    baochu.scale.set(1.3, 1.5, 1.3);
    const bl = byName['保俶塔'];
    if (bl) {
      baochu.position.set(bl.x, 1.2, bl.z); scene.add(baochu);
    }

    // 平湖秋月：临湖平台 + 亭
    const ph = new THREE.Group();
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.8, 24), MAT.stone);
    plat.position.y = 0.4; ph.add(plat);
    const pav = pavilion({ w: 5.2, h: 3.8, round: true, open: true });
    pav.position.set(0, 0.8, 0); ph.add(pav);
    put('平湖秋月', ph, 1.0);

    // 孤山·中山公园：牌坊
    const gate = new THREE.Group();
    for (const x of [-4.5, 4.5]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 6, 8), MAT.red);
      c.position.set(x, 3, 0); gate.add(c);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 0.7), MAT.red);
    beam.position.y = 5.6; gate.add(beam);
    const gr = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.45, 2.2), MAT.roof);
    gr.position.y = 6.3; gate.add(gr);
    put('孤山·中山公园', gate, 1.2, 0.1);

    // 曲院风荷：临水牌坊 + 荷塘（荷叶已铺）
    const quyuan = new THREE.Group();
    const qg = pavilion({ w: 4.6, h: 3.6, round: false, open: true });
    qg.position.set(0, 1.2, 0); quyuan.add(qg);
    quyuan.scale.set(1.2, 1.1, 1.2);
    put('曲院风荷', quyuan, 1.0, -0.3);

    // 苏堤春晓：堤上亭 + 石碑
    const sudi = pavilion({ w: 3.6, h: 3.2, round: false, open: true });
    const sl = byName['苏堤春晓'];
    if (sl) { sudi.position.set(sl.x + 12, 1.5, sl.z); scene.add(sudi); }

    // 郭庄：白墙院门
    const guo = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(26, 2.6, 1.0), MAT.wall);
    wall.position.y = 1.3; guo.add(wall);
    const gr2 = new THREE.Mesh(new THREE.BoxGeometry(5, 3.6, 1.2), MAT.stone);
    gr2.position.set(0, 1.8, 0); guo.add(gr2);
    const gr3 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.5, 2.2), MAT.roof);
    gr3.position.y = 3.9; guo.add(gr3);
    put('郭庄', guo, 1.0, 0.2);

    // 茅家埠：水乡小亭
    const mao = pavilion({ w: 4.0, h: 3.0, round: false, open: true });
    put('茅家埠', mao, 1.0, 0.8);

    // 三潭印月：三座石塔（在水里）+ 岛上亭
    const l3 = byName['三潭印月'];
    if (l3) {
      const spots = [[-34, 78], [34, 78], [0, 22]];
      spots.forEach(([dx, dz], i) => {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 1.2, 12), MAT.stone);
        base.position.y = 0.3; g.add(base);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 3.4, 12), MAT.stone);
        stem.position.y = 2.4; g.add(stem);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(2.1, 14, 10), MAT.stone);
        ball.position.y = 5.0; g.add(ball);
        const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 12), MAT.stone);
        top.position.y = 7.0; g.add(top);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), MAT.stone);
        tip.position.y = 7.9; g.add(tip);
        g.position.set(l3.x + dx, 0.1, l3.z + dz + 150);
        scene.add(g);
      });
      const isl = pavilion({ w: 5.0, h: 3.6, round: true, open: true });
      isl.position.set(l3.x, 1.1, l3.z);
      scene.add(isl);
      const st = stele(); st.position.set(l3.x + 30, 1.1, l3.z - 40); scene.add(st);
    }

    // 湖心亭
    const hx = pavilion({ w: 6.4, h: 4.6, round: true, open: true });
    const hl = byName['湖心亭'];
    if (hl) { hx.position.set(hl.x, 1.1, hl.z); scene.add(hx); }

    // 阮公墩
    const rg = pavilion({ w: 4.2, h: 3.2, round: false, open: true });
    const rl = byName['阮公墩'];
    if (rl) { rg.position.set(rl.x, 1.1, rl.z); scene.add(rg); }

    // 花港观鱼：亭 + 石碑
    const hg = new THREE.Group();
    const hp = pavilion({ w: 5.4, h: 3.6, round: true, open: true });
    hg.add(hp);
    const st2 = stele(); st2.position.set(8, 0, 4); st2.scale.set(1.4, 1.4, 1.4); hg.add(st2);
    put('花港观鱼', hg, 1.0, 0.3);

    // 雷峰塔
    const lf = pagoda(5, 12, 8.4, { shrink: 0.10, roofMat: MAT.roofJade, bodyMat: new THREE.MeshLambertMaterial({ color: 0xd8b184 }) });
    lf.scale.set(1.25, 1.05, 1.25);
    const lfl = byName['雷峰塔'];
    if (lfl) { lf.position.set(lfl.x, 1.0, lfl.z); scene.add(lf); }

    // 净慈寺
    const jc = hall(30, 20, 10);
    put('净慈寺', jc, 1.0, -0.1);

    // 柳浪闻莺
    const lw = pavilion({ w: 5.0, h: 3.4, round: true, open: true });
    put('柳浪闻莺', lw, 1.0, 0.6);

    // 城隍阁：三层楼阁，远山之上
    const ch = new THREE.Group();
    let yy = 0;
    for (let i = 0; i < 3; i++) {
      const r = 15 - i * 3;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 6, 12), MAT.wall);
      b.position.y = yy + 3; ch.add(b);
      const rf = roof(r * 1.5, 3.4, MAT.roof, 12);
      rf.position.y = yy + 5.8; ch.add(rf);
      yy += 6.4;
    }
    ch.position.set(byName['城隍阁'] ? byName['城隍阁'].x : 2000, 40, byName['城隍阁'] ? byName['城隍阁'].z : 700);
    scene.add(ch);

    // 湖滨城市侧的小亭点缀
    for (let i = 0; i < 3; i++) {
      const p = pavilion({ w: 3.4, h: 2.8, round: true, open: true });
      p.position.set(1200 - i * 60, 1.0, 900 + i * 130);
      scene.add(p);
    }
  };

  return L;
})();
