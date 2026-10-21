/* 植被：垂柳/香樟/桃/芦苇/荷花，实例化 + 风摆，保证全部种在陆地上 */
window.Trees = (function () {
  const T = {};
  const uTime = { value: 0 };

  function windify(mat, amp) {
    mat.onBeforeCompile = shader => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uWind = { value: amp };
      shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iw = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 iw = vec3(0.0);
        #endif
        float sway = sin(uTime*1.7 + iw.x*0.13 + iw.z*0.11)*0.6 + sin(uTime*2.9 + iw.z*0.23)*0.25;
        float wk = pow(clamp(uv.y,0.0,1.0), 2.0);
        transformed.x += sway * uWind * wk;
        transformed.z += sway * 0.6 * uWind * wk;`
      );
    };
    mat.customProgramCacheKey = () => 'wind' + amp;
    return mat;
  }

  function crossPlanes(n) {
    const geos = [];
    for (let i = 0; i < n; i++) {
      const p = new THREE.PlaneGeometry(1, 1);
      p.translate(0, 0.5, 0);
      p.rotateY(i / n * Math.PI);
      geos.push(p);
    }
    return UTIL.merge(geos);
  }

  T.build = function (scene, course, terrain, tier) {
    const U = UTIL;
    const rr = U.rng(20261019);
    const lists = { camphor: [], willow: [], peach: [] };
    const reeds = [];
    const lots = [];

    const nearBridge = (x, z, pad) => {
      for (const b of course.bridges) if (Math.hypot(x - b.x, z - b.z) < b.r + pad) return true;
      return false;
    };
    const nearMark = (x, z, pad) => {
      for (const l of course.landmarks) if (Math.hypot(x - l.x, z - l.z) < (l.enlarged ? pad + 10 : pad)) return true;
      return false;
    };
    const nearShop = (x, z) => {
      const sp = course.shopSpots;
      if (sp) for (let i = 0; i < sp.length; i++) if (Math.hypot(x - sp[i].x, z - sp[i].z) < 9) return true;
      return false;
    };
    const nearDock = (x, z) => Math.hypot(x - course.start.x, z - course.start.z) < 30;

    // ---- 湖岸树 ----
    function landNormal(ring, i) {
      const a = ring[(i - 1 + ring.length) % ring.length], b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      const n1 = [-dz / L, dx / L];
      const cx = ring[i][0], cz = ring[i][1];
      return terrain.shoreDist(cx + n1[0] * 4, cz + n1[1] * 4) > terrain.shoreDist(cx - n1[0] * 4, cz - n1[1] * 4) ? n1 : [-n1[0], -n1[1]];
    }
    const every = Math.max(9, Math.round(13 * 1500 / Math.max(400, tier.trees)));
    for (let i = 0; i < course.water.length; i += 2) {
      if (rr() > 0.9) continue;
      const p = course.water[i];
      const n1 = landNormal(course.water, i);
      for (const off of [7 + rr() * 4, 11 + rr() * 4, 15 + rr() * 5, 20 + rr() * 6]) {
        const x = p[0] + n1[0] * off, z = p[1] + n1[1] * off;
        const sd = terrain.exactShoreDist(x, z);
        if (sd < 4.5) continue;
        if (terrain.heightAt(x, z) < 0.5) continue;
        if (nearBridge(x, z, 12) || nearMark(x, z, 22) || nearShop(x, z) || nearDock(x, z)) continue;
        const kk = rr();
        // 临水树偏矮小，离岸越远越高大
        let s = 0.55 + rr() * 1.25;
        if (sd < 15) s *= 0.78;
        else if (sd > 60) s *= 1.18;
        lists[kk < 0.44 ? 'willow' : (kk < 0.94 ? 'camphor' : 'peach')].push({ x, z, s });
        break;
      }
    }
    // ---- 山坡林：直接覆盖陡峭坡面与裙边带（0-40m），消除裸坡黑墙 ----
    const slopeMax = Math.min(1200, Math.floor(tier.trees * 0.5));
    let slopeN = 0;
    for (let i = 0; i < course.water.length && slopeN < slopeMax; i += 2) {
      if (rr() > 0.75) continue;
      const p = course.water[i];
      const n1 = landNormal(course.water, i);
      const nTries = 1 + ((rr() * 3) | 0);
      for (let k2 = 0; k2 < nTries && slopeN < slopeMax; k2++) {
        const off = 10 + rr() * 28;
        const jit = (rr() - 0.5) * 30;
        const x = p[0] + n1[0] * off - n1[1] * jit, z = p[1] + n1[1] * off + n1[0] * jit;
        if (nearBridge(x, z, 12) || nearMark(x, z, 16) || nearShop(x, z) || nearDock(x, z)) continue;
        const h = terrain.heightAt(x, z);
        if (h < 3) continue;
        const s = (0.7 + rr() * 1.2) * (h > 15 ? 1.25 : 1.0);
        lists[rr() < 0.8 ? 'camphor' : 'willow'].push({ x, z, s });
        slopeN++;
      }
    }
    // ---- 岛树 ----
    for (const ring of course.islands) {
      for (let i = 0; i < ring.length; i += 3) {
        if (rr() > 0.55) continue;
        const p = ring[i];
        const n1 = landNormal(ring, i);
        for (const off of [3 + rr() * 3, 6 + rr() * 3, 9 + rr() * 4]) {
          const x = p[0] + n1[0] * off, z = p[1] + n1[1] * off;
          if (terrain.exactShoreDist(x, z) < 2.5) continue;
          if (nearMark(x, z, 14)) continue;
          lists[rr() < 0.5 ? 'willow' : 'camphor'].push({ x, z, s: 0.55 + rr() * 1.0 });
          break;
        }
      }
    }
    // ---- 堤树：一株杨柳一株桃 ----
    for (const nm in course.causeways) {
      for (const line of course.causeways[nm]) {
        let acc = 0, idx = 0;
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1], b = line[i];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          acc += L;
          if (acc < 15) continue;
          acc = 0;
          if (rr() < 0.2) { idx++; continue; }
          const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
          const side = idx % 2 ? 1 : -1;
          const off = 6.4 + rr() * 0.9;
          const x = a[0] + nx * off * side, z = a[1] + nz * off * side;
          if (nearBridge(x, z, 11)) { idx++; continue; }
          let kind = 'camphor';
          if (nm === '苏堤') kind = idx % 2 ? 'willow' : 'peach';
          else if (nm === '白堤') kind = idx % 3 === 0 ? 'camphor' : 'willow';
          lists[kind].push({ x, z, s: 0.6 + rr() * 0.95 });
          idx++;
        }
      }
    }
    // ---- 山林 ----
    const hillBudget = Math.max(0, tier.trees - (lists.camphor.length + lists.willow.length + lists.peach.length));
    let hills = 0;
    for (let tries = 0; tries < hillBudget * 6 && hills < hillBudget; tries++) {
      const x = CFG.terrain.minX + rr() * (CFG.terrain.maxX - CFG.terrain.minX);
      const z = CFG.terrain.minZ + rr() * (CFG.terrain.maxZ - CFG.terrain.minZ);
      if (terrain.shoreDist(x, z) < 26) continue;
      const h = terrain.heightAt(x, z);
      if (h < 4) continue;
      // 山上树更高大，低处偏矮
      const s = (0.55 + rr() * 1.25) * (h > 18 ? 1.3 : h > 9 ? 1.12 : 0.92);
      lists[rr() < 0.75 ? 'camphor' : 'willow'].push({ x, z, s });
      hills++;
    }

    // ---- 芦苇（浅水） ----
    const reedBudget = tier.name === 'cpu' ? 500 : (tier.name === 'low' ? 1200 : 3200);
    for (let i = 0; i < course.water.length && reeds.length < reedBudget; i += 2) {
      if (rr() > 0.28) continue;
      const p = course.water[i];
      const U2 = UTIL;
      const a = course.water[(i - 1 + course.water.length) % course.water.length];
      const b = course.water[(i + 1) % course.water.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      let n1 = [-dz / L, dx / L];
      if (terrain.shoreDist(p[0] + n1[0], p[1] + n1[1]) > 0) n1 = [-n1[0], -n1[1]];
      const off = 1.2 + rr() * 4.2;
      const x = p[0] + n1[0] * off, z = p[1] + n1[1] * off;
      const sd = terrain.exactShoreDist(x, z);
      if (sd > -0.3 || sd < -5) continue;
      if (Math.hypot(x - course.start.x, z - course.start.z) < 40) continue;
      reeds.push({ x, z, s: 0.7 + rr() * 0.8, r: rr() * 6.283 });
    }

    // ---- 荷花 ----
    const areas = [[-1180, -740, 210, 150], [-1420, -200, 180, 200], [-850, 1050, 170, 170]];
    const lotusBudget = tier.name === 'cpu' ? 120 : (tier.name === 'low' ? 320 : 700);
    for (const ar of areas) {
      let placed = 0;
      for (let tries = 0; tries < lotusBudget * 3 && placed < lotusBudget / 3; tries++) {
        const x = ar[0] + (rr() - 0.5) * ar[2] * 2, z = ar[1] + (rr() - 0.5) * ar[3] * 2;
        if (terrain.shoreDist(x, z) > -0.5) continue;
        let dmin = 1e9;
        for (let k = 0; k < course.center.length; k += 8) {
          dmin = Math.min(dmin, Math.hypot(course.center[k][0] - x, course.center[k][1] - z));
        }
        if (dmin < 26) continue;
        lots.push({ x, z, s: 1.3 + rr() * 1.9, flower: rr() < 0.12, r: rr() * 6.283 });
        placed++;
      }
    }

    // ---- 近/远分类（距航线 300m 内为近景） ----
    const centerStep = Math.max(1, Math.floor(course.center.length / 240));
    const nearDist = p => {
      let bd = 1e9;
      for (let k = 0; k < course.center.length; k += centerStep) {
        const d = Math.hypot(course.center[k][0] - p.x, course.center[k][1] - p.z);
        if (d < bd) bd = d;
      }
      return bd;
    };

    const texMap = { camphor: 'leafCamphor', willow: 'leafWillow', peach: 'leafPeach' };
    const scaleMap = {
      camphor: [9, 19, 6, 14],
      willow: [8, 15, 5, 12],
      peach: [4, 9, 3, 7]
    };

    /* 导出所有乔木的位置与尺度：供 walk.js 做树干碰撞与"别落在树冠底下"判定 */
    T.list = [];
    Object.keys(lists).forEach(kind => {
      for (const t of lists[kind]) T.list.push({ x: t.x, z: t.z, s: t.s, kind: kind });
    });

    function buildKind(kind) {
      const list = lists[kind];
      if (!list.length) return;
      // 近景限量
      const nearCap = tier.treeNear;
      const near = [], far = [];
      for (const t of list) (near.length < nearCap && nearDist(t) < 320 ? near : far).push(t);
      const tex = Textures.get(texMap[kind]);
      const mk = (sub, planes, withTrunk) => {
        if (!sub.length) return;
        const canopyMat = windify(new THREE.MeshLambertMaterial({
          map: tex, alphaTest: 0.30, side: THREE.DoubleSide
        }), kind === 'willow' ? 0.55 : 0.3);
        const im = new THREE.InstancedMesh(crossPlanes(planes), canopyMat, sub.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const c = new THREE.Color();
        sub.forEach((t, i) => {
          const sc = scaleMap[kind];
          const k01 = U.clamp((t.s - 0.55) / 1.2, 0, 1);
          const hh = 0.82 + rr() * 0.42;          // 每株独立高度抖动
          const w = U.lerp(sc[0], sc[1], k01);
          const h = U.lerp(sc[2], sc[3], k01) * hh;
          p.set(t.x, terrain.heightAt(t.x, t.z) - 0.25, t.z);
          q.setFromAxisAngle(up, rr() * 6.283);
          s.set(w * (planes === 3 ? 1.05 : 1), h, w);
          m.compose(p, q, s);
          im.setMatrixAt(i, m);
          c.setHSL(0.24 + rr() * 0.07, 0.26 + rr() * 0.16, 0.36 + rr() * 0.22);
          im.setColorAt(i, c);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.frustumCulled = false;
        scene.add(im);
        Water.markReflective(im);
        if (withTrunk) {
          const trunkGeo = new THREE.CylinderGeometry(0.09, 0.16, 1, 6);
          trunkGeo.translate(0, 0.5, 0);
          const tm = new THREE.MeshLambertMaterial({ map: Textures.get('bark'), color: 0x9a8871 });
          const tr = new THREE.InstancedMesh(trunkGeo, tm, sub.length);
          sub.forEach((t, i) => {
            const sc = scaleMap[kind];
            const k01 = U.clamp((t.s - 0.55) / 1.2, 0, 1);
            const hh = 0.82 + rr() * 0.42;
            const h = U.lerp(sc[2], sc[3], k01) * hh;
            const wv = U.lerp(sc[0], sc[1], k01);
            p.set(t.x, terrain.heightAt(t.x, t.z) - 0.25, t.z);
            q.setFromAxisAngle(up, rr() * 6.283);
            s.set(wv * 0.045 + 0.35, h * 0.55, wv * 0.045 + 0.35);
            m.compose(p, q, s);
            tr.setMatrixAt(i, m);
          });
          tr.instanceMatrix.needsUpdate = true;
          tr.frustumCulled = false;
          scene.add(tr);
          Water.markReflective(tr);
        }
      };
      mk(near, 3, true);
      mk(far, 2, false);
    }
    buildKind('camphor'); buildKind('willow'); buildKind('peach');

    // ---- 芦苇 ----
    if (reeds.length) {
      const reedMat = windify(new THREE.MeshLambertMaterial({ map: Textures.get('reed'), alphaTest: 0.3, side: THREE.DoubleSide }), 0.9);
      const im = new THREE.InstancedMesh(crossPlanes(3), reedMat, reeds.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      reeds.forEach((t, i) => {
        p.set(t.x, -0.15, t.z);
        q.setFromAxisAngle(up, t.r);
        s.set(2.4 * t.s, 3.2 * t.s, 2.4 * t.s);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      scene.add(im);
    }

    // ---- 荷叶与荷花 ----
    if (lots.length) {
      const padGeo = new THREE.PlaneGeometry(1, 1);
      padGeo.rotateX(-Math.PI / 2);
      const padMat = new THREE.MeshLambertMaterial({ map: Textures.get('lotus'), alphaTest: 0.3, side: THREE.DoubleSide });
      const pads = lots.filter(l => !l.flower);
      const flowers = lots.filter(l => l.flower);
      if (pads.length) {
        const im = new THREE.InstancedMesh(padGeo, padMat, pads.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        pads.forEach((t, i) => {
          p.set(t.x, 0.13, t.z);
          q.setFromAxisAngle(up, t.r);
          s.set(t.s, 1, t.s);
          m.compose(p, q, s);
          im.setMatrixAt(i, m);
        });
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        scene.add(im);
      }
      if (flowers.length) {
        const flGeo = crossPlanes(2);
        const flMat = windify(new THREE.MeshLambertMaterial({ map: Textures.get('lotusFlower'), alphaTest: 0.3, side: THREE.DoubleSide }), 0.2);
        const im2 = new THREE.InstancedMesh(flGeo, flMat, flowers.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        flowers.forEach((t, i) => {
          p.set(t.x, 0.42, t.z);
          q.setFromAxisAngle(up, t.r);
          s.set(0.9, 0.9, 0.9);
          m.compose(p, q, s);
          im2.setMatrixAt(i, m);
        });
        im2.instanceMatrix.needsUpdate = true;
        im2.frustumCulled = false;
        scene.add(im2);
      }
    }
  };

  T.update = function (dt) { uTime.value += dt; };

  return T;
})();
