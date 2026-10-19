/* 基础工具：数学、噪声、几何、画布 */
window.UTIL = (function () {
  const U = {};

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (a, b, x) => {
    const t = U.clamp((x - a) / (b - a || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.easeOut = t => 1 - Math.pow(1 - t, 3);
  U.deg = r => r * 180 / Math.PI;

  /* 确定性随机 */
  U.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  /* 2D 值噪声 + fbm */
  function hash2(ix, iz) {
    let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  }
  U.hash2 = hash2;
  U.noise2 = function (x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    return U.lerp(U.lerp(a, b, ux), U.lerp(c, d, ux), uz);
  };
  U.fbm = function (x, z, oct) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    const n = oct || 4;
    for (let i = 0; i < n; i++) {
      sum += U.noise2(x * f, z * f) * amp;
      norm += amp;
      amp *= 0.5; f *= 2.03;
    }
    return sum / (norm || 1);
  };

  /* 画布 */
  U.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };
  U.tex = function (canvas, opts) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = (opts && opts.aniso) || 4;
    t.encoding = (opts && opts.srgb === false) ? THREE.LinearEncoding : THREE.sRGBEncoding;
    if (opts && opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    if (opts && opts.wrap === 'clamp') { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
    t.needsUpdate = true;
    return t;
  };

  /* 由灰度图生成法线贴图 */
  U.normalFromCanvas = function (src, strength) {
    const w = src.width, h = src.height;
    const sctx = src.getContext('2d');
    const sd = sctx.getImageData(0, 0, w, h).data;
    const out = U.canvas(w, h);
    const octx = out.getContext('2d');
    const od = octx.createImageData(w, h);
    const k = strength || 1.6;
    const lum = (x, y) => {
      const i = (((y + h) % h) * w + ((x + w) % w)) * 4;
      return (sd[i] * 0.299 + sd[i + 1] * 0.587 + sd[i + 2] * 0.114) / 255;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (lum(x + 1, y) - lum(x - 1, y)) * k;
        const dy = (lum(x, y - 1) - lum(x, y + 1)) * k;
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        const i = (y * w + x) * 4;
        od.data[i] = (nx * 0.5 + 0.5) * 255;
        od.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        od.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        od.data[i + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  };

  /* 多边形 */
  U.pointInRing = function (x, z, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
  };
  U.segDist = function (x, z, a, b) {
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const wx = x - a[0], wz = z - a[1];
    const L = vx * vx + vz * vz;
    let t = L ? (wx * vx + wz * vz) / L : 0;
    t = U.clamp(t, 0, 1);
    return Math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t));
  };
  U.ringDist = function (x, z, ring) {
    let d = Infinity;
    for (let i = 1; i < ring.length; i++) {
      d = Math.min(d, U.segDist(x, z, ring[i - 1], ring[i]));
    }
    return d;
  };
  U.ringLength = function (ring) {
    let s = 0;
    for (let i = 1; i < ring.length; i++) s += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
    return s;
  };
  U.ringArea = function (ring) {
    let s = 0;
    for (let i = 1; i < ring.length; i++) s += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
    return s * 0.5;
  };
  U.nearestOnPolyline = function (x, z, line) {
    let best = null, bd = Infinity;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const vx = b[0] - a[0], vz = b[1] - a[1];
      const L = vx * vx + vz * vz;
      let t = L ? ((x - a[0]) * vx + (z - a[1]) * vz) / L : 0;
      t = U.clamp(t, 0, 1);
      const px = a[0] + vx * t, pz = a[1] + vz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; best = { x: px, z: pz, d, t, a, b }; }
    }
    return best;
  };

  /* 放样：rings 为若干等长截面点数组，每点 [x,y,z] */
  U.loft = function (rings, opts) {
    opts = opts || {};
    const m = rings.length, n = rings[0].length;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        const p = rings[i][j];
        pos.push(p[0], p[1], p[2]);
        uv.push(j / (n - 1), i / (m - 1));
      }
    }
    for (let i = 0; i < m - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // 封口
    const addCap = (ri, reverse) => {
      const ring = rings[ri];
      let cx = 0, cy = 0, cz = 0;
      for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
      cx /= n; cy /= n; cz /= n;
      const base = pos.length / 3;
      pos.push(cx, cy, cz);
      uv.push(0.5, 0.5);
      for (let j = 0; j < n; j++) {
        const p = ring[j];
        pos.push(p[0], p[1], p[2]);
        uv.push(0.5 + Math.cos(j / n * 6.283) * 0.5, 0.5 + Math.sin(j / n * 6.283) * 0.5);
      }
      for (let j = 0; j < n - 1; j++) {
        if (reverse) idx.push(base, base + j + 2, base + j + 1);
        else idx.push(base, base + j + 1, base + j + 2);
      }
    };
    if (opts.capStart !== false) addCap(0, true);
    if (opts.capEnd !== false) addCap(m - 1, false);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  /* 合并同材质几何体（自动转非索引） */
  U.merge = function (geoms) {
    const attr = ['position', 'normal', 'uv'];
    const out = { position: [], normal: [], uv: [] };
    // 预扫：任一子几何带 color 顶点色则合并之（缺省填 1=白，不影响原色）
    let useColor = false;
    for (let gi = 0; gi < geoms.length; gi++) {
      const g0 = geoms[gi];
      if (!g0 || !g0.getAttribute) continue;
      const c0 = g0.index ? g0.toNonIndexed() : g0;
      if (c0.getAttribute('color')) { useColor = true; break; }
    }
    if (useColor) out.color = [];
    const attrs = useColor ? attr.concat(['color']) : attr;
    for (let gi = 0; gi < geoms.length; gi++) {
      let g = geoms[gi];
      if (!g) continue;
      if (g.index) g = g.toNonIndexed();
      const posAttr = g.getAttribute('position');
      if (!posAttr) continue;
      const count = posAttr.count;
      for (const k of attrs) {
        const comp = k === 'uv' ? 2 : 3;
        const a = g.getAttribute(k);
        if (a) {
          const arr = a.array;
          for (let i = 0; i < count * comp; i++) out[k].push(arr[i]);
        } else {
          const fill = k === 'uv' ? 0 : (k === 'color' ? 1 : 0);
          for (let i = 0; i < count * comp; i++) out[k].push(fill);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
    if (useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(out.color, 3));
    return g;
  };

  U.tube = function (points, radius, tubular, radial) {
    const pts = points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, tubular || 24, radius, radial || 5, false);
  };

  U.box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  U.cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 12);

  U.mulColor = function (hex, k) {
    const c = new THREE.Color(hex);
    c.multiplyScalar(k);
    return c;
  };

  return U;
})();
