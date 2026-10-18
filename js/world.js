/* 世界：天空、水面、岸线、堤、桥、植被、远山、城市 */
window.World = (function () {
  const W = {};
  const SUN_DIR = new THREE.Vector3(-0.62, 0.20, -0.76).normalize();
  const FOG_COLOR = new THREE.Color(0xcdbb9f);

  W.build = async function (scene, renderer, course, onProgress) {
    const step = async (msg, pct) => {
      if (onProgress) onProgress(msg, pct);
      await new Promise(r => setTimeout(r, 16));
    };

    scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.00033);
    scene.background = new THREE.Color(0x0d1418);

    // ---------------- 光照 ----------------
    const hemi = new THREE.HemisphereLight(0x9fbdd4, 0x3a3528, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffc98e, 2.35);
    sun.position.copy(SUN_DIR).multiplyScalar(900);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8fb0c8, 0.30);
    fill.position.set(600, 400, -600);
    scene.add(fill);

    await step('正在铺开天空…', 8);

    // ---------------- 天空 ----------------
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uSun: { value: SUN_DIR },
        uZenith: { value: new THREE.Color(0x27455f) },
        uMid: { value: new THREE.Color(0x7b96a8) },
        uHorizon: { value: new THREE.Color(0xe9c39a) },
        uSunColor: { value: new THREE.Color(0xfff0d2) }
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 uSun,uZenith,uMid,uHorizon,uSunColor;
        void main(){
          float h = clamp(vDir.y, -0.1, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.30, h));
          col = mix(col, uZenith, smoothstep(0.22, 0.85, h));
          float sd = max(dot(vDir, uSun), 0.0);
          col += uSunColor * pow(sd, 1400.0) * 2.6;
          col += vec3(1.0,0.72,0.42) * pow(sd, 22.0) * 0.26;
          col += vec3(1.0,0.80,0.56) * pow(sd, 5.0) * 0.10;
          float band = smoothstep(0.02, 0.20, h) * (1.0 - smoothstep(0.20, 0.55, h));
          col += vec3(1.0,0.86,0.66) * band * 0.035;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(4300, 48, 28), skyMat);
    sky.renderOrder = -100;
    scene.add(sky);

    // 云
    const cloudTex = UTIL.cloud();
    for (let i = 0; i < 10; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.42 + Math.random() * 0.24, fog: false });
      const s = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2, r = 1400 + Math.random() * 2200;
      s.position.set(Math.cos(a) * r, 360 + Math.random() * 420, Math.sin(a) * r);
      s.scale.set(900 + Math.random() * 700, 320 + Math.random() * 220, 1);
      scene.add(s);
    }

    await step('正在引水入湖…', 16);

    // ---------------- 水面 ----------------
    const waterShape = new THREE.Shape();
    course.water.forEach((p, i) => i ? waterShape.lineTo(p[0], -p[1]) : waterShape.moveTo(p[0], -p[1]));
    waterShape.closePath();
    const waterGeo = new THREE.ShapeGeometry(waterShape, 2);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.computeVertexNormals();

    const shore = UTIL.shoreMask(course);
    const nrm = UTIL.waterNormal(256);
    const RT = window.__LOW ? 256 : 512;
    const rt = new THREE.WebGLRenderTarget(RT, RT, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
    const texMatrix = new THREE.Matrix4();

    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uNormal: { value: nrm },
        uReflect: { value: rt.texture },
        uShore: { value: shore.tex },
        uTexMatrix: { value: texMatrix },
        uBounds: { value: new THREE.Vector4(shore.minX, shore.minZ, shore.span, shore.span) },
        uSun: { value: SUN_DIR },
        uSunColor: { value: new THREE.Color(0xffe2b8) },
        uDeep: { value: new THREE.Color(0x0b2027) },
        uShallow: { value: new THREE.Color(0x1b4042) },
        uFog: { value: FOG_COLOR.clone() },
        uFogDensity: { value: 0.00033 }
      },
      vertexShader: `
        varying vec3 vWorld;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime, uFogDensity;
        uniform sampler2D uNormal, uReflect, uShore;
        uniform mat4 uTexMatrix;
        uniform vec4 uBounds;
        uniform vec3 uSun, uSunColor, uDeep, uShallow, uFog;
        varying vec3 vWorld;
        void main(){
          vec2 p = vWorld.xz;
          vec3 n1 = texture2D(uNormal, p*0.016 + vec2(uTime*0.007, uTime*0.004)).xyz*2.0-1.0;
          vec3 n2 = texture2D(uNormal, p*0.041 - vec2(uTime*0.011, uTime*0.008)).xyz*2.0-1.0;
          vec3 n3 = texture2D(uNormal, p*0.10 + vec2(uTime*0.021, -uTime*0.017)).xyz*2.0-1.0;
          vec3 n = normalize(vec3(n1.x*0.55 + n2.x*0.32 + n3.x*0.26, 1.0, n1.y*0.55 + n2.y*0.32 + n3.y*0.26));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - clamp(dot(V, n), 0.0, 1.0), 4.0);
          fres = mix(0.02, 0.92, fres);
          vec4 uv4 = uTexMatrix * vec4(vWorld, 1.0);
          vec2 ruv = uv4.xy / uv4.w + n.xz * 0.030;
          vec3 refl = texture2D(uReflect, clamp(ruv, 0.002, 0.998)).rgb * 0.86;
          vec3 base = mix(uShallow, uDeep, clamp(0.52 + n.x * 0.16, 0.0, 1.0));
          vec3 col = mix(base, refl, clamp(fres*1.05, 0.0, 0.88));
          vec3 H = normalize(uSun + V);
          float spec = pow(max(dot(n, H), 0.0), 1100.0) * 1.15 + pow(max(dot(n, H), 0.0), 120.0) * 0.05;
          col += uSunColor * spec;
          vec2 suv = (p - uBounds.xy) / uBounds.zw;
          float m = texture2D(uShore, suv).r;
          float foam = smoothstep(0.44, 0.60, m) * (1.0 - smoothstep(0.66, 0.80, m));
          foam *= 0.55 + 0.45 * sin(uTime * 1.7 + p.x * 0.13 + p.y * 0.09);
          col = mix(col, vec3(0.86, 0.90, 0.88), clamp(foam, 0.0, 1.0) * 0.5);
          float d = length(cameraPosition - vWorld);
          float f = 1.0 - exp(-uFogDensity*uFogDensity*d*d);
          col = mix(col, uFog, clamp(f, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = 0;
    water.renderOrder = 1;
    scene.add(water);

    await step('正在堆岸造堤…', 28);

    // ---------------- 陆地 ----------------
    const landShape = new THREE.Shape();
    landShape.moveTo(-4200, -3400); landShape.lineTo(3400, -3400);
    landShape.lineTo(3400, 3200); landShape.lineTo(-4200, 3200); landShape.closePath();
    // 洞的绕向要与外框相反
    let holeArea = 0;
    for (let i = 1; i < course.water.length; i++) {
      const x0 = course.water[i - 1][0], y0 = -course.water[i - 1][1];
      const x1 = course.water[i][0], y1 = -course.water[i][1];
      holeArea += x0 * y1 - x1 * y0;
    }
    const holePts = holeArea > 0 ? course.water.slice().reverse() : course.water;
    const hole = new THREE.Path();
    holePts.forEach((p, i) => i ? hole.lineTo(p[0], -p[1]) : hole.moveTo(p[0], -p[1]));
    hole.closePath();
    landShape.holes.push(hole);
    const landGeo = new THREE.ShapeGeometry(landShape, 2);
    landGeo.rotateX(-Math.PI / 2);
    const grassTex = UTIL.grass(); grassTex.repeat.set(220, 220);
    const land = new THREE.Mesh(landGeo, new THREE.MeshLambertMaterial({ map: grassTex, color: 0x9aa87e, side: THREE.DoubleSide }));
    land.position.y = 1.05;
    scene.add(land);

    const stoneTex = UTIL.stone(); stoneTex.repeat.set(1, 1);

    // 岸墙
    function wall(ring, y0, y1, uScale) {
      const pos = [], uv = [], idx = [];
      let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
        uv.push(u, 0, u + seg * (uScale || .12), 0, u + seg * (uScale || .12), 1, u, 1);
        const n = i * 4;
        idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
        u += seg * (uScale || .12);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    }
    const bankMat = new THREE.MeshLambertMaterial({ map: stoneTex, color: 0xb9ae96, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(wall(course.water, -1.6, 1.06, .09), bankMat));
    course.islands.forEach(r => scene.add(new THREE.Mesh(wall(r, -1.6, 1.06, .09), bankMat)));

    // 小岛顶面
    const islandGrass = UTIL.grass(); islandGrass.repeat.set(7, 7);
    const islandMat = new THREE.MeshLambertMaterial({ map: islandGrass, color: 0x94a377, side: THREE.DoubleSide });
    course.islands.forEach(r => {
      const s = new THREE.Shape();
      r.forEach((p, i) => i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1]));
      s.closePath();
      const g = new THREE.ShapeGeometry(s, 2); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, islandMat); m.position.y = 1.06; scene.add(m);
    });
    // 湖心亭 / 阮公墩
    (course.extraIslands || []).forEach(o => {
      const g = new THREE.CircleGeometry(o.r, 32); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, islandMat); m.position.set(o.p[0], 1.06, o.p[1]); scene.add(m);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 2.6, 32, 1, true), bankMat);
      w.position.set(o.p[0], -0.26, o.p[1]); scene.add(w);
    });

    await step('正在架桥…', 40);

    // ---------------- 堤与桥 ----------------
    const causewayTopMat = new THREE.MeshLambertMaterial({ map: grassTex, color: 0x93a075 });
    const bridgeStore = [];
    for (const name in course.causeways) {
      const lines = course.causeways[name];
      const HALF = name === '杨公堤' ? 11 : 9.5;
      lines.forEach(line => {
        if (line.length < 2) return;
        const tp = [], tu = [], ti = [];
        let u = 0;
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1], b = line[i];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const L = Math.hypot(dx, dz) || 1;
          const nx = -dz / L * HALF, nz = dx / L * HALF;
          const base = tp.length / 3, y = 1.45;
          tp.push(a[0] + nx, y, a[1] + nz, a[0] - nx, y, a[1] - nz, b[0] - nx, y, b[1] - nz, b[0] + nx, y, b[1] + nz);
          tu.push(u, 0, u, 1, u + L * .05, 1, u + L * .05, 0);
          ti.push(base, base + 1, base + 2, base, base + 2, base + 3);
          u += L * .05;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2));
        g.setIndex(ti); g.computeVertexNormals();
        scene.add(new THREE.Mesh(g, causewayTopMat));

        for (const side of [HALF, -HALF]) {
          const wp = [], wu = [], wi = [];
          let uu = 0;
          for (let i = 1; i < line.length; i++) {
            const a = line[i - 1], b = line[i];
            const dx = b[0] - a[0], dz = b[1] - a[1];
            const L = Math.hypot(dx, dz) || 1;
            const nx = -dz / L * side, nz = dx / L * side;
            const base = wp.length / 3;
            wp.push(a[0] + nx, -1.4, a[1] + nz, b[0] + nx, -1.4, b[1] + nz, b[0] + nx, 1.45, b[1] + nz, a[0] + nx, 1.45, a[1] + nz);
            wu.push(uu, 0, uu + L * .07, 0, uu + L * .07, 1, uu, 1);
            wi.push(base, base + 1, base + 2, base, base + 2, base + 3);
            uu += L * .07;
          }
          const wg = new THREE.BufferGeometry();
          wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
          wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
          wg.setIndex(wi); wg.computeVertexNormals();
          scene.add(new THREE.Mesh(wg, bankMat));
        }
      });
      // 桥：相邻堤段的断口
      for (let i = 0; i < lines.length - 1; i++) {
        const A = lines[i], B = lines[i + 1];
        if (!A.length || !B.length) continue;
        let best = null, bd = 1e9;
        for (const pa of [A[0], A[A.length - 1]]) {
          for (const pb of [B[0], B[B.length - 1]]) {
            const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
            if (d < bd) { bd = d; best = [pa, pb]; }
          }
        }
        if (bd > 4 && bd < 70) {
          const mid = [(best[0][0] + best[1][0]) / 2, (best[0][1] + best[1][1]) / 2];
          const ang = Math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0]);
          bridgeStore.push({ x: mid[0], z: mid[1], ang, span: bd + 4, width: name === '杨公堤' ? 22 : 19 });
        }
      }
    }
    // 白堤两桥
    bridgeStore.push({ x: 228, z: -1827, ang: -0.6, span: 22, width: 12, name: '断桥' });
    bridgeStore.push({ x: -79, z: -1360, ang: -0.62, span: 18, width: 11, name: '锦带桥' });

    bridgeStore.forEach(b => scene.add(makeArchBridge(b)));

    await step('正在种树…', 54);

    // ---------------- 树 ----------------
    const treeGeo = crossedPlanes();
    const camphorTex = UTIL.tree('camphor');
    const willowTex = UTIL.tree('willow');
    const placements = { camphor: [], willow: [] };

    const outward = (ring, i, ccw) => {
      const a = ring[(i - 1 + ring.length) % ring.length], b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      return ccw ? [dz / L, -dx / L] : [-dz / L, dx / L];
    };
    const ccwRing = ring => {
      let s = 0;
      for (let i = 1; i < ring.length; i++) s += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
      return s > 0;
    };
    const sampleRing = (ring, stepM, cb) => {
      const ccw = ccwRing(ring);
      let acc = 0;
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc + L < stepM) { acc += L; continue; }
        acc = 0;
        const o = outward(ring, i, ccw);
        const t = 0.5;
        const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
        cb(px + o[0] * 0, pz + o[1] * 0, o[0], o[1]);
      }
    };

    sampleRing(course.water, 15, (x, z, ox, oz) => {
      const d = 8 + Math.random() * 14;
      const kind = Math.random() < 0.42 ? 'willow' : 'camphor';
      placements[kind].push([x + ox * d, z + oz * d, 0.85 + Math.random() * 0.55]);
    });
    course.islands.forEach(r => sampleRing(r, 18, (x, z, ox, oz) => {
      const d = 4 + Math.random() * 12;
      placements[Math.random() < .5 ? 'willow' : 'camphor'].push([x + ox * d, z + oz * d, 0.7 + Math.random() * 0.5]);
    }));
    for (const name in course.causeways) for (const line of course.causeways[name]) {
      let acc = 0;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        acc += L;
        if (acc < 17) continue;
        acc = 0;
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l, nz = dx / l;
        if (Math.random() < .25) continue;
        const side = Math.random() < .5 ? 1 : -1;
        const off = 10.5 + Math.random() * 2;
        placements[Math.random() < .45 ? 'willow' : 'camphor'].push([a[0] + nx * off * side, a[1] + nz * off * side, 0.75 + Math.random() * 0.45]);
      }
    }

    const makeForest = (list, tex) => {
      if (!list.length) return;
      const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.34, side: THREE.DoubleSide, color: 0xffffff });
      const mesh = new THREE.InstancedMesh(treeGeo, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      list.forEach((t, i) => {
        p.set(t[0], 1.0, t[1]);
        q.setFromAxisAngle(up, Math.random() * Math.PI);
        const k = t[2];
        s.set(13 * k, 10.5 * k, 13 * k);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
    };
    makeForest(placements.camphor, camphorTex);
    makeForest(placements.willow, willowTex);

    await step('正在铺开远山…', 70);

    // ---------------- 远山 ----------------
    const ridge = (radius, base, amp, color, seedA) => {
      const seg = 200, pos = [], idx = [], col = [];
      const c = new THREE.Color(color);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2;
        const east = Math.cos(a);
        const mask = 0.30 + 0.70 * Math.max(0, Math.min(1, (east + 0.55) * 1.1));
        const h = (base + amp * (0.5 + 0.5 * Math.sin(a * 3.1 + seedA)) + amp * 0.55 * Math.sin(a * 7.7 + seedA * 2.3)) * mask;
        const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        pos.push(x, -20, z, x, Math.max(30, h), z);
        col.push(c.r * .68, c.g * .68, c.b * .68, c.r, c.g, c.b);
      }
      for (let i = 0; i < seg; i++) {
        const n = i * 2;
        idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
    };
    scene.add(ridge(2050, 90, 130, 0x5d7166, 1.2));
    scene.add(ridge(2850, 130, 175, 0x6c7f83, 3.4));
    scene.add(ridge(3700, 170, 220, 0x8797a0, 5.1));


    // ---------------- 城市天际线 ----------------
    const winTex = UTIL.windows();
    const winMat = new THREE.MeshLambertMaterial({ map: winTex, color: 0x9fb0bb });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 46; i++) {
      const x = 1250 + Math.random() * 1500;
      const z = -1200 + Math.random() * 2300;
      const h = 24 + Math.random() * 78;
      const w = 26 + Math.random() * 44, d = 26 + Math.random() * 44;
      const b = new THREE.Mesh(boxGeo, winMat);
      b.position.set(x, h / 2, z); b.scale.set(w, h, d);
      scene.add(b);
    }
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(30, 40, 165, 16), winMat);
    tower.position.set(1980, 82, 260); scene.add(tower);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 8, 0, 6.3, 0, 1.1), new THREE.MeshLambertMaterial({ color: 0x6d7f8a }));
    cap.position.set(1980, 165, 260); scene.add(cap);

    await step('正在点缀荷叶…', 82);

    // ---------------- 荷叶 ----------------
    const lotusTex = UTIL.lotus();
    const lotusGeo = new THREE.PlaneGeometry(1, 1);
    lotusGeo.rotateX(-Math.PI / 2);
    const lotusMat = new THREE.MeshLambertMaterial({ map: lotusTex, transparent: true, alphaTest: .25, side: THREE.DoubleSide });
    const lotusSpots = [];
    const addLotus = (cx, cz, rx, rz, n) => {
      for (let i = 0; i < n; i++) {
        const x = cx + (Math.random() - .5) * rx, z = cz + (Math.random() - .5) * rz;
        let dmin = 1e9;
        for (let k = 0; k < course.center.length; k += 8) dmin = Math.min(dmin, Math.hypot(course.center[k][0] - x, course.center[k][1] - z));
        if (dmin < 26) continue;
        lotusSpots.push([x, 0.16, z, 1.6 + Math.random() * 2.2]);
      }
    };
    addLotus(-1180, -740, 260, 180, 520);   // 曲院风荷
    addLotus(-1420, -200, 220, 260, 380);   // 西里湖
    addLotus(-850, 1050, 200, 220, 260);    // 花港
    if (lotusSpots.length) {
      const im = new THREE.InstancedMesh(lotusGeo, lotusMat, lotusSpots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      lotusSpots.forEach((t, i) => {
        p.set(t[0], t[1], t[2]); q.setFromAxisAngle(up, Math.random() * 6.28); s.set(t[3], 1, t[3]);
        m.compose(p, q, s); im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
      scene.add(im);
    }

    // ---------------- 反射 ----------------
    const virtualCam = new THREE.PerspectiveCamera();
    const texMat = new THREE.Matrix4();
    const normal = new THREE.Vector3(0, 1, 0);
    const viewV = new THREE.Vector3(), targetV = new THREE.Vector3(), lookAt = new THREE.Vector3();
    const camPos = new THREE.Vector3(), origin = new THREE.Vector3(0, 0, 0);

    function updateReflection(camera) {
      camPos.setFromMatrixPosition(camera.matrixWorld);
      viewV.subVectors(origin, camPos); viewV.reflect(normal).negate(); viewV.add(origin);
      lookAt.set(0, 0, -1).applyQuaternion(camera.quaternion).add(camPos);
      targetV.subVectors(origin, lookAt); targetV.reflect(normal).negate(); targetV.add(origin);
      virtualCam.position.copy(viewV);
      virtualCam.up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(normal);
      virtualCam.lookAt(targetV);
      virtualCam.far = camera.far;
      virtualCam.updateMatrixWorld();
      virtualCam.projectionMatrix.copy(camera.projectionMatrix);
      texMat.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
      texMat.multiply(virtualCam.projectionMatrix);
      texMat.multiply(virtualCam.matrixWorldInverse);
      texMatrix.copy(texMat);

      water.visible = false;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, virtualCam);
      renderer.setRenderTarget(prev);
      water.visible = true;
    }

    W.update = function (dt, camera) {
      waterMat.uniforms.uTime.value += dt;
      updateReflection(camera);
    };
    W.water = water;
    W.sunDir = SUN_DIR;
    W.fogColor = FOG_COLOR;

    return W;
  };

  /* ---------- 交叉面片（一棵树） ---------- */
  function crossedPlanes() {
    const g = new THREE.BufferGeometry();
    const pos = [], uv = [], idx = [];
    const add = (ang) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      const base = pos.length / 3;
      const pts = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];
      pts.forEach(p => pos.push(p[0] * c, p[1], p[0] * s));
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    add(0); add(Math.PI / 2);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /* ---------- 石拱桥 ---------- */
  function makeArchBridge(b) {
    const g = new THREE.Group();
    const span = Math.min(30, b.span), width = b.width;
    const R = span / 2;
    const H = Math.min(6.6, Math.max(3.6, span * 0.24));
    const T = 0.9;

    const shape = new THREE.Shape();
    shape.moveTo(-R, 0);
    shape.absellipse(0, 0, R, H, Math.PI, 0, true);
    shape.lineTo(R + T, 0);
    shape.absellipse(0, 0, R + T, H + T * 0.8, 0, Math.PI, false);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 22 });
    geo.translate(0, 0, -width / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xcfc7b3 });
    const arch = new THREE.Mesh(geo, mat);
    g.add(arch);

    // 桥面
    const deck = new THREE.Mesh(new THREE.BoxGeometry(span + 3.5, 0.55, width), mat);
    deck.position.y = H + 0.75;
    g.add(deck);

    // 栏杆
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(span + 3.5, 0.95, 0.34), mat);
      rail.position.set(0, H + 1.5, side * (width / 2 - 0.24));
      g.add(rail);
    }
    g.position.set(b.x, 0, b.z);
    g.rotation.y = -b.ang;
    return g;
  }

  return W;
})();
