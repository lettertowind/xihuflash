/* birds.js — 湖上飞鸟：白鹭 / 家燕 / 野鸭（扑翅顶点动画 + 环线飞行） */
window.Birds = (function () {
  const B = {};
  const U = UTIL;
  let species = [];          // {bodyIM, wingIM, birds:[], cfg}
  let built = false;
  const uTime = { value: 0 };

  /* 扑翅顶点动画：翅根 uv.x=0，翅尖 1 */
  function flapify(mat, amp, freq) {
    mat.onBeforeCompile = shader => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uFlap = { value: amp };
      shader.uniforms.uFreq = { value: freq };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;uniform float uFlap;uniform float uFreq;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 iw = instanceMatrix[3];
          float flap = sin(uTime * uFreq + iw.x * 0.31 + iw.z * 0.17);
          float fk = pow(abs(uv.x), 1.5);
          transformed.y += flap * uFlap * fk;
        #endif`);
    };
    mat.customProgramCacheKey = () => 'flap' + amp + '_' + freq;
    return mat;
  }

  function wingPair(span, chord) {
    const r = new THREE.PlaneGeometry(span, chord);
    r.translate(span / 2, 0, 0);
    const l = r.clone();
    l.rotateY(Math.PI);
    return U.merge([r, l]);
  }

  function bodyGeo(len) {
    const parts = [];
    const trunk = new THREE.SphereGeometry(1, 8, 6);
    trunk.scale(len, len * 0.32, len * 0.28);
    parts.push(trunk);
    const head = new THREE.SphereGeometry(len * 0.32, 7, 5);
    head.translate(len * 0.92, len * 0.28, 0);
    parts.push(head);
    const neck = new THREE.CylinderGeometry(len * 0.1, len * 0.16, len * 0.5, 6);
    neck.rotateZ(Math.PI / 2 - 0.5);
    neck.translate(len * 0.68, len * 0.12, 0);
    parts.push(neck);
    const tail = new THREE.BoxGeometry(len * 0.7, len * 0.05, len * 0.4);
    tail.translate(-len * 1.1, len * 0.06, 0);
    parts.push(tail);
    return U.merge(parts);
  }

  /* 环线生成 */
  function loop(cx, cz, r, n, jit) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const rr = r * (1 + (Math.random() - 0.5) * jit);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr * 0.8));
    }
    return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.6);
  }

  const CFG = {
    egret: { color: 0xf2f4ee, wing: 1.05, chord: 0.24, amp: 0.34, freq: 5.2, size: 1.0 },
    swallow: { color: 0x333a44, wing: 0.5, chord: 0.16, amp: 0.5, freq: 9.5, size: 0.45 },
    duck: { color: 0x6b4a33, wing: 0.62, chord: 0.2, amp: 0.26, freq: 6.5, size: 0.55 }
  };

  function addSpecies(name, count, curves, hMin, hMax, spMin, spMax, course) {
    if (count <= 0 || !curves.length) return;
    const c = CFG[name];
    const bodyMat = new THREE.MeshLambertMaterial({ color: c.color });
    const wingMat = flapify(new THREE.MeshLambertMaterial({ color: c.color, side: THREE.DoubleSide }), c.amp, c.freq);
    const imB = new THREE.InstancedMesh(bodyGeo(c.size), bodyMat, count);
    const imW = new THREE.InstancedMesh(wingPair(c.wing, c.chord), wingMat, count);
    imB.frustumCulled = false; imW.frustumCulled = false;
    imB.renderOrder = 2; imW.renderOrder = 2;
    scene.add(imB); scene.add(imW);
    const birds = [];
    for (let i = 0; i < count; i++) {
      const curve = curves[i % curves.length];
      birds.push({
        curve,
        t: Math.random(),
        speed: (spMin + Math.random() * (spMax - spMin)),
        dir: Math.random() < 0.85 ? 1 : -1,
        h: hMin + Math.random() * (hMax - hMin),
        lat: (Math.random() - 0.5) * 5,
        back: Math.random() * 4,
        boost: 0
      });
    }
    species.push({ imB, imW, birds, name });
  }

  B.build = function (sc, course, terrain, tier) {
    scene = sc;
    if (built) return;
    built = true;
    const bc = tier.birds || { egret: 3, swallow: 12, duck: 12 };

    /* 白鹭：沿岸大环缓飞 */
    (function () {
      const curves = [];
      const nE = Math.max(1, Math.round(bc.egret / 2));
      for (let k = 0; k < nE; k++) {
        const p = course.water[(k * 97) % course.water.length];
        curves.push(loop(p[0], p[1], 90 + Math.random() * 160, 14, 0.5));
      }
      addSpecies('egret', bc.egret, curves, 8, 20, 6, 9);
    })();

    /* 家燕：湖心群飞掠水 */
    (function () {
      const curves = [];
      const c0 = course.center[Math.floor(course.center.length / 2)];
      const nS = Math.max(1, Math.round(bc.swallow / 7));
      for (let k = 0; k < nS; k++) {
        const cx = c0[0] + (Math.random() - 0.5) * 500, cz = c0[1] + (Math.random() - 0.5) * 500;
        curves.push(loop(cx, cz, 60 + Math.random() * 130, 16, 0.7));
      }
      addSpecies('swallow', bc.swallow, curves, 1.5, 6, 14, 19);
    })();

    /* 野鸭：贴水小环（湖心亭/三潭一带） */
    (function () {
      const curves = [];
      const centers = [];
      const st = L2L('三潭印月');
      if (st) centers.push([st.x, st.z]);
      (course.extraIslands || []).forEach(o => centers.push(o.p));
      if (!centers.length) centers.push([course.center[0][0], course.center[0][1]]);
      const nD = Math.max(1, Math.round(bc.duck / 6));
      for (let k = 0; k < nD; k++) {
        const c0 = centers[k % centers.length];
        curves.push(loop(c0[0] + (Math.random() - 0.5) * 120, c0[1] + (Math.random() - 0.5) * 120, 40 + Math.random() * 60, 12, 0.5));
      }
      addSpecies('duck', bc.duck, curves, 0.4, 1.4, 6, 8.5);
    })();

    function L2L(nm) { return (window.Landmarks && Landmarks.list) ? Landmarks.list.find(l => l.name === nm) : null; }
  };

  let scene = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const eul = new THREE.Euler();

  B.update = function (dt, player) {
    if (!built) return;
    uTime.value += dt;
    const px = player ? player.x : 0, pz = player ? player.z : 0;
    for (const sp of species) {
      for (let i = 0; i < sp.birds.length; i++) {
        const b = sp.birds[i];
        const len = b.curve.getLength();
        b.t = (b.t + b.speed * (1 + b.boost) * b.dir * dt / len + 1) % 1;
        b.boost = Math.max(0, b.boost - dt * 0.6);
        const pos = b.curve.getPointAt(b.t);
        const tan = b.curve.getTangentAt(b.t);
        // 侧向编队偏移（垂直于切线）
        const lx = -tan.z, lz = tan.x;
        let x = pos.x + lx * b.lat + tan.x * -b.back;
        let z = pos.z + lz * b.lat + tan.z * -b.back;
        let y = b.h + Math.sin(uTime.value * 0.7 + i * 2.1) * 0.5;
        const dx = x - px, dz = z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < 625) { b.boost = 1.2; y += 2.5; }        // 靠近玩家时抬升
        if (d2 > 2250000) {                                // >1500m 隐藏（缩放归零）
          m4.makeScale(0, 0, 0);
          sp.imB.setMatrixAt(i, m4);
          sp.imW.setMatrixAt(i, m4);
          continue;
        }
        const yaw = Math.atan2(-tan.x, tan.z) + (b.dir < 0 ? Math.PI : 0);
        const ahead = b.curve.getPointAt((b.t + 0.01 * b.dir + 1) % 1);
        const pitch = U.clamp((ahead.y - pos.y), -0.35, 0.35) * 0.5;
        eul.set(pitch, yaw, 0, 'YXZ');
        q.setFromEuler(eul);
        p3.set(x, y, z);
        m4.compose(p3, q, s3);
        sp.imB.setMatrixAt(i, m4);
        sp.imW.setMatrixAt(i, m4);
      }
      sp.imB.instanceMatrix.needsUpdate = true;
      sp.imW.instanceMatrix.needsUpdate = true;
    }
  };

  B.stats = function () { return species.map(s => ({ name: s.name, n: s.birds.length })); };
  return B;
})();
