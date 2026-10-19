/* 程序化贴图：全部本地生成，file:// 离线可用，不依赖外部图片 */
window.Textures = (function () {
  const T = {};
  const cache = {};
  const R = UTIL.rng(20261019);

  function get(key, make) {
    if (!cache[key]) cache[key] = make();
    return cache[key];
  }

  /* ---------- 木纹 ---------- */
  function makeWood(light) {
    const S = 512, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = light ? '#6b4a2e' : '#3a2617';
    g.fillRect(0, 0, S, S);
    const plank = 64;
    for (let y = 0; y < S; y += plank) {
      const tone = 0.82 + R() * 0.35;
      g.fillStyle = light
        ? 'rgba(' + Math.round(120 * tone) + ',' + Math.round(82 * tone) + ',' + Math.round(48 * tone) + ',1)'
        : 'rgba(' + Math.round(62 * tone) + ',' + Math.round(40 * tone) + ',' + Math.round(25 * tone) + ',1)';
      g.fillRect(0, y, S, plank - 2);
      g.fillStyle = 'rgba(18,10,5,.55)';
      g.fillRect(0, y + plank - 2, S, 2);
      // 木纹
      for (let i = 0; i < 22; i++) {
        const yy = y + 4 + R() * (plank - 10);
        g.strokeStyle = 'rgba(' + (light ? '80,55,32' : '30,18,10') + ',' + (0.08 + R() * 0.16) + ')';
        g.lineWidth = 0.6 + R() * 1.3;
        g.beginPath();
        g.moveTo(0, yy);
        for (let x = 0; x <= S; x += 32) {
          g.lineTo(x, yy + Math.sin(x * 0.018 + i * 2.1) * (1.5 + R() * 2.5));
        }
        g.stroke();
      }
      // 节疤
      if (R() < 0.45) {
        const kx = R() * S, ky = y + plank * 0.5;
        g.strokeStyle = 'rgba(25,14,8,.35)';
        for (let k = 1; k <= 4; k++) {
          g.beginPath();
          g.ellipse(kx, ky, 3 + k * 2.2, 1.6 + k * 1.6, 0.3, 0, 6.283);
          g.stroke();
        }
      }
    }
    // 水渍
    for (let i = 0; i < 24; i++) {
      const x = R() * S, y = R() * S, rr = 10 + R() * 46;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(0,0,0,.10)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    return c;
  }

  /* ---------- 屋瓦 ---------- */
  function makeRoof() {
    const S = 512, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#3c4245';
    g.fillRect(0, 0, S, S);
    const rows = 12, cols = 20;
    const rh = S / rows, cw = S / cols;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cw, y = r * rh;
        const tone = 0.78 + R() * 0.3;
        g.fillStyle = 'rgb(' + Math.round(62 * tone) + ',' + Math.round(70 * tone) + ',' + Math.round(73 * tone) + ')';
        g.beginPath();
        g.roundRect ? g.roundRect(x + 1, y + 1, cw - 2, rh - 1, [cw * 0.45, cw * 0.45, 2, 2]) : g.rect(x + 1, y + 1, cw - 2, rh - 1);
        g.fill();
        // 瓦垄高光
        g.strokeStyle = 'rgba(180,192,194,.22)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + cw * 0.5, y + 2);
        g.lineTo(x + cw * 0.5, y + rh - 2);
        g.stroke();
        // 搭接阴影
        g.fillStyle = 'rgba(10,14,15,.28)';
        g.fillRect(x, y + rh - 2, cw, 2);
      }
    }
    // 青苔
    for (let i = 0; i < 260; i++) {
      const x = R() * S, y = R() * S;
      g.fillStyle = 'rgba(' + (70 + R() * 40) + ',' + (88 + R() * 40) + ',' + (54 + R() * 26) + ',' + (0.05 + R() * 0.13) + ')';
      g.beginPath(); g.arc(x, y, 2 + R() * 7, 0, 6.283); g.fill();
    }
    return c;
  }

  /* ---------- 石材 ---------- */
  function makeStone() {
    const S = 512, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#7d7b70';
    g.fillRect(0, 0, S, S);
    let y = 0;
    while (y < S) {
      const h = 34 + R() * 30;
      let x = -R() * 60;
      while (x < S) {
        const w = 54 + R() * 80;
        const tone = 0.75 + R() * 0.38;
        g.fillStyle = 'rgb(' + Math.round(126 * tone) + ',' + Math.round(123 * tone) + ',' + Math.round(110 * tone) + ')';
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        g.strokeStyle = 'rgba(40,38,32,.42)';
        g.lineWidth = 2;
        g.strokeRect(x + 2, y + 2, w - 4, h - 4);
        // 石面颗粒
        for (let i = 0; i < 60; i++) {
          const px = x + R() * w, py = y + R() * h;
          g.fillStyle = 'rgba(' + (R() < .5 ? '210,208,196' : '48,46,40') + ',' + (0.03 + R() * 0.09) + ')';
          g.beginPath(); g.arc(px, py, 0.6 + R() * 2.2, 0, 6.283); g.fill();
        }
        x += w;
      }
      y += h;
    }
    // 湿痕与青苔
    for (let i = 0; i < 90; i++) {
      const x = R() * S, yy = S * 0.55 + R() * S * 0.45;
      g.fillStyle = 'rgba(' + (52 + R() * 30) + ',' + (70 + R() * 34) + ',' + (42 + R() * 22) + ',' + (0.05 + R() * 0.16) + ')';
      g.beginPath(); g.ellipse(x, yy, 6 + R() * 18, 3 + R() * 10, R() * 3, 0, 6.283); g.fill();
    }
    return c;
  }

  /* ---------- 白墙 / 砖 ---------- */
  function makePlaster() {
    const S = 512, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#d9d6c9';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) {
      const x = R() * S, y = R() * S, rr = 2 + R() * 28;
      g.fillStyle = 'rgba(' + (150 + R() * 50) + ',' + (148 + R() * 46) + ',' + (132 + R() * 40) + ',' + (0.02 + R() * 0.06) + ')';
      g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.fill();
    }
    for (let i = 0; i < 22; i++) {
      const x = R() * S, y = R() * S;
      g.strokeStyle = 'rgba(90,86,74,.10)';
      g.lineWidth = 1 + R() * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 90, y + 30 + R() * 90); g.stroke();
    }
    return c;
  }

  function makeBrick() {
    const S = 512, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#5c5a50';
    g.fillRect(0, 0, S, S);
    const bh = 32, bw = 82;
    for (let y = 0, row = 0; y < S; y += bh, row++) {
      for (let x = -bw; x < S; x += bw) {
        const xx = x + (row % 2 ? bw / 2 : 0);
        const tone = 0.8 + R() * 0.3;
        g.fillStyle = 'rgb(' + Math.round(118 * tone) + ',' + Math.round(112 * tone) + ',' + Math.round(98 * tone) + ')';
        g.fillRect(xx + 2, y + 2, bw - 4, bh - 4);
        g.strokeStyle = 'rgba(40,38,32,.4)';
        g.strokeRect(xx + 2, y + 2, bw - 4, bh - 4);
      }
    }
    return c;
  }

  /* ---------- 竹席乌篷 ---------- */
  function makeBamboo() {
    const S = 512, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#171a1b';
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 18) {
      g.fillStyle = 'rgba(' + (28 + R() * 14) + ',' + (31 + R() * 14) + ',' + (30 + R() * 12) + ',.85)';
      g.fillRect(0, y, S, 15);
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(0, y + 15, S, 3);
    }
    for (let x = 0; x < S; x += 7) {
      g.strokeStyle = 'rgba(90,92,84,' + (0.04 + R() * 0.07) + ')';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
    }
    for (let i = 0; i < 90; i++) {
      const x = R() * S, y = R() * S;
      g.fillStyle = 'rgba(200,205,190,' + (0.02 + R() * 0.05) + ')';
      g.beginPath(); g.arc(x, y, 1 + R() * 3, 0, 6.283); g.fill();
    }
    return c;
  }

  /* ---------- 树冠 ---------- */
  function leafCluster(g, x, y, r, col, alpha) {
    for (let i = 0; i < 5; i++) {
      const a = R() * 6.283, rr = R() * r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
      const s = r * (0.35 + R() * 0.55);
      g.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha * (0.55 + R() * 0.45)) + ')';
      g.beginPath();
      g.ellipse(px, py, s, s * (0.55 + R() * 0.4), R() * 3, 0, 6.283);
      g.fill();
    }
  }

  function makeCanopy(kind) {
    const S = 512, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    if (kind === 'willow') {
      // 主枝
      g.strokeStyle = '#4a3b26'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(S * .5, S); g.quadraticCurveTo(S * .48, S * .55, S * .5, S * .16); g.stroke();
      for (let i = 0; i < 10; i++) {
        const a = -2.4 + i / 9 * 2.2;
        g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(S * .5, S * .34);
        g.quadraticCurveTo(S * .5 + Math.cos(a) * 100, S * .22, S * .5 + Math.cos(a) * 170, S * .30 + Math.sin(a) * 30);
        g.stroke();
      }
      // 柳条
      for (let i = 0; i < 210; i++) {
        const x0 = S * .5 + (R() - .5) * 260;
        const y0 = S * .10 + R() * 120;
        const len = 110 + R() * 240;
        const sway = (R() - .5) * 42;
        g.strokeStyle = 'rgba(' + (74 + R() * 40) + ',' + (104 + R() * 42) + ',' + (52 + R() * 24) + ',' + (0.3 + R() * 0.4) + ')';
        g.lineWidth = 0.7 + R() * 1.1;
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(x0 + sway * 0.4, y0 + len * 0.5, x0 + sway, y0 + len);
        g.stroke();
        // 叶点
        for (let k = 0; k < 3; k++) {
          const t = 0.45 + R() * 0.55;
          g.fillStyle = 'rgba(' + (92 + R() * 40) + ',' + (124 + R() * 40) + ',' + (60 + R() * 22) + ',' + (0.35 + R() * 0.45) + ')';
          g.beginPath();
          g.ellipse(x0 + sway * t, y0 + len * t, 1.4 + R() * 2.2, 0.9 + R() * 1.4, R() * 3, 0, 6.283);
          g.fill();
        }
      }
    } else if (kind === 'peach') {
      g.strokeStyle = '#4b3524'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(S * .5, S); g.quadraticCurveTo(S * .46, S * .62, S * .5, S * .34); g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = -2.6 + i / 7 * 2.5;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(S * .5, S * .42);
        g.quadraticCurveTo(S * .5 + Math.cos(a) * 80, S * .28, S * .5 + Math.cos(a) * 150, S * .26 + Math.sin(a) * 22);
        g.stroke();
      }
      for (let i = 0; i < 420; i++) {
        const a = R() * 6.283, rr = Math.pow(R(), .55) * 150;
        const x = S * .5 + Math.cos(a) * rr * 1.05;
        const y = S * .30 + Math.sin(a) * rr * .62;
        const p = R();
        g.fillStyle = p < .55
          ? 'rgba(' + (226 + R() * 24) + ',' + (150 + R() * 40) + ',' + (168 + R() * 30) + ',' + (0.35 + R() * 0.45) + ')'
          : 'rgba(' + (88 + R() * 40) + ',' + (122 + R() * 36) + ',' + (62 + R() * 22) + ',' + (0.28 + R() * 0.35) + ')';
        g.beginPath(); g.arc(x, y, 1.4 + R() * 3.6, 0, 6.283); g.fill();
      }
    } else {
      // 香樟
      g.strokeStyle = '#443724'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(S * .5, S); g.quadraticCurveTo(S * .47, S * .64, S * .5, S * .38); g.stroke();
      for (let i = 0; i < 9; i++) {
        const a = -2.7 + i / 8 * 2.7;
        g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(S * .5, S * .44);
        g.quadraticCurveTo(S * .5 + Math.cos(a) * 90, S * .32, S * .5 + Math.cos(a) * 165, S * .28 + Math.sin(a) * 20);
        g.stroke();
      }
      for (let i = 0; i < 170; i++) {
        const a = R() * 6.283, rr = Math.pow(R(), .58) * 160;
        const x = S * .5 + Math.cos(a) * rr * 1.06;
        const y = S * .30 + Math.sin(a) * rr * .62;
        const g0 = 48 + R() * 62;
        leafCluster(g, x, y, 9 + R() * 22, [g0 * .55, g0, g0 * .42], 0.55);
      }
      for (let i = 0; i < 70; i++) {
        const a = -1.2 + R() * 2.4, rr = Math.pow(R(), .7) * 140;
        const x = S * .5 + Math.cos(a) * rr, y = S * .26 + Math.sin(a) * rr * .6;
        g.fillStyle = 'rgba(' + (104 + R() * 44) + ',' + (136 + R() * 42) + ',' + (60 + R() * 26) + ',' + (0.18 + R() * 0.24) + ')';
        g.beginPath(); g.arc(x, y, 5 + R() * 14, 0, 6.283); g.fill();
      }
    }
    return c;
  }

  function makeReed() {
    const S = 256, H = 512, c = UTIL.canvas(S, H), g = c.getContext('2d');
    g.clearRect(0, 0, S, H);
    for (let i = 0; i < 90; i++) {
      const x = S * .5 + (R() - .5) * 190;
      const y0 = H * .55 + R() * H * .35;
      const h = 120 + R() * 300;
      g.strokeStyle = 'rgba(' + (96 + R() * 42) + ',' + (112 + R() * 38) + ',' + (66 + R() * 26) + ',' + (0.45 + R() * 0.4) + ')';
      g.lineWidth = 1 + R() * 1.8;
      g.beginPath(); g.moveTo(x, y0);
      g.quadraticCurveTo(x + (R() - .5) * 30, y0 - h * .55, x + (R() - .5) * 46, y0 - h);
      g.stroke();
      if (R() < .3) {
        g.fillStyle = 'rgba(' + (150 + R() * 40) + ',' + (142 + R() * 36) + ',' + (100 + R() * 20) + ',.55)';
        g.beginPath(); g.ellipse(x + (R() - .5) * 40, y0 - h, 2 + R() * 4, 9 + R() * 10, 0.1, 0, 6.283); g.fill();
      }
    }
    return c;
  }

  function makeLotusLeaf() {
    const S = 256, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2, R0 = S * 0.46;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R0, -2.9, 2.9, false);
    g.closePath();
    const gr = g.createRadialGradient(cx, cy, 4, cx, cy, R0);
    gr.addColorStop(0, '#5f7d46');
    gr.addColorStop(0.55, '#4c6b3c');
    gr.addColorStop(1, '#3b5732');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(140,170,110,.45)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 18; i++) {
      const a = -2.9 + i / 18 * 5.8;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0); g.stroke();
    }
    g.strokeStyle = 'rgba(30,50,24,.45)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, R0 - 2, -2.9, 2.9); g.stroke();
    return c;
  }

  function makeLotusFlower() {
    const S = 128, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    for (let i = 0; i < 10; i++) {
      g.rotate(0.628);
      const gr = g.createLinearGradient(0, -46, 0, 6);
      gr.addColorStop(0, 'rgba(248,206,214,.95)');
      gr.addColorStop(1, 'rgba(206,126,150,.9)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -4);
      g.quadraticCurveTo(-13, -26, 0, -46);
      g.quadraticCurveTo(13, -26, 0, -4);
      g.fill();
    }
    g.fillStyle = '#e8c46a';
    g.beginPath(); g.arc(0, 0, 8, 0, 6.283); g.fill();
    return c;
  }

  /* ---------- 地面 ---------- */
  function makeGround() {
    const S = 512, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#4b5a3c';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4200; i++) {
      const x = R() * S, y = R() * S;
      const tone = 0.5 + R() * 0.8;
      g.strokeStyle = 'rgba(' + Math.round(58 * tone) + ',' + Math.round(84 * tone) + ',' + Math.round(42 * tone) + ',' + (0.2 + R() * 0.4) + ')';
      g.lineWidth = 0.7 + R() * 1.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 4, y - 3 - R() * 9); g.stroke();
    }
    for (let i = 0; i < 160; i++) {
      const x = R() * S, y = R() * S, rr = 6 + R() * 40;
      g.fillStyle = 'rgba(' + (40 + R() * 30) + ',' + (54 + R() * 30) + ',' + (30 + R() * 18) + ',' + (0.04 + R() * 0.1) + ')';
      g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.fill();
    }
    // 落叶
    for (let i = 0; i < 200; i++) {
      const x = R() * S, y = R() * S;
      g.fillStyle = 'rgba(' + (90 + R() * 50) + ',' + (70 + R() * 40) + ',' + (34 + R() * 20) + ',' + (0.15 + R() * 0.25) + ')';
      g.beginPath(); g.ellipse(x, y, 1.5 + R() * 3, 0.8 + R() * 1.4, R() * 3, 0, 6.283); g.fill();
    }
    return c;
  }

  /* ---------- 水面法线 ---------- */
  function makeWaterNormal(seed) {
    const S = 256;
    const height = new Float32Array(S * S);
    const rr = UTIL.rng(seed);
    const waves = [];
    for (let i = 0; i < 8; i++) {
      waves.push({
        fx: 1 + Math.floor(rr() * 5),
        fy: 1 + Math.floor(rr() * 5),
        amp: 0.5 / (1 + i * 0.6),
        ph: rr() * 6.283
      });
    }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let h = 0;
        const u = x / S, v = y / S;
        for (const w of waves) h += Math.sin((u * w.fx + v * w.fy) * 6.283 + w.ph) * w.amp;
        h += (UTIL.fbm(x * 0.045, y * 0.045, 3) - 0.5) * 0.75;
        height[y * S + x] = h;
      }
    }
    const c = UTIL.canvas(S, S), g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const k = 2.8;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const l = height[y * S + ((x - 1 + S) % S)], r = height[y * S + ((x + 1) % S)];
        const u = height[((y - 1 + S) % S) * S + x], d = height[((y + 1) % S) * S + x];
        let nx = (l - r) * k, ny = (u - d) * k, nz = 1;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const i = (y * S + x) * 4;
        img.data[i] = (nx * .5 + .5) * 255;
        img.data[i + 1] = (ny * .5 + .5) * 255;
        img.data[i + 2] = (nz * .5 + .5) * 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ---------- 泡沫 / 雾 / 雨 ---------- */
  function makeFoam() {
    const S = 256, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const x = R() * S, y = R() * S, rr = 1 + R() * 9;
      g.fillStyle = 'rgba(255,255,255,' + (0.05 + R() * 0.35) + ')';
      g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.fill();
    }
    for (let i = 0; i < 60; i++) {
      const x = R() * S, y = R() * S;
      g.strokeStyle = 'rgba(255,255,255,' + (0.05 + R() * 0.18) + ')';
      g.lineWidth = 1 + R() * 2;
      g.beginPath(); g.arc(x, y, 8 + R() * 26, 0, 6.283); g.stroke();
    }
    return c;
  }

  function makeMist() {
    const S = 256, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) {
      const x = R() * S, y = R() * S, rr = 20 + R() * 80;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(228,234,232,' + (0.02 + R() * 0.07) + ')');
      gr.addColorStop(1, 'rgba(228,234,232,0)');
      g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    return c;
  }

  function makeRain() {
    const W = 16, H = 128, c = UTIL.canvas(W, H), g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(210,224,226,0)');
    gr.addColorStop(0.35, 'rgba(220,232,234,.55)');
    gr.addColorStop(1, 'rgba(240,248,248,.9)');
    g.fillStyle = gr;
    g.fillRect(W * .45, 0, W * .1, H);
    return c;
  }

  function makeBlob() {
    const S = 128, c = UTIL.canvas(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.55)');
    gr.addColorStop(0.55, 'rgba(0,0,0,.22)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return c;
  }

  /* ---------- 建筑立面 ---------- */
  function makeWindows() {
    const S = 256, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#6b767c';
    g.fillRect(0, 0, S, S);
    const cw = 18, ch = 22;
    for (let y = 6; y < S; y += ch) {
      for (let x = 6; x < S; x += cw) {
        const lit = R() < 0.16;
        g.fillStyle = lit ? 'rgba(255,206,148,.75)' : 'rgba(40,50,56,.55)';
        g.fillRect(x, y, cw - 6, ch - 8);
        g.strokeStyle = 'rgba(20,26,30,.4)';
        g.strokeRect(x, y, cw - 6, ch - 8);
      }
    }
    return c;
  }

  function makePlaque(text) {
    const W = 256, H = 96, c = UTIL.canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#161a1b';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(198,160,92,.9)';
    g.lineWidth = 3;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = '#d9b46a';
    g.font = 'bold 40px "Songti SC","SimSun",serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text || '湖心亭', W / 2, H / 2 + 2);
    return c;
  }

  function makeBark() {
    const S = 256, c = UTIL.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#4a3a28';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = R() * S;
      g.strokeStyle = 'rgba(' + (30 + R() * 36) + ',' + (22 + R() * 26) + ',' + (14 + R() * 18) + ',' + (0.25 + R() * 0.4) + ')';
      g.lineWidth = 1 + R() * 4;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= S; y += 24) g.lineTo(x + Math.sin(y * 0.03 + i) * (3 + R() * 6), y);
      g.stroke();
    }
    for (let i = 0; i < 80; i++) {
      const x = R() * S, y = R() * S;
      g.fillStyle = 'rgba(120,130,90,.08)';
      g.beginPath(); g.arc(x, y, 2 + R() * 7, 0, 6.283); g.fill();
    }
    return c;
  }

  /* ---------- 对外接口 ---------- */
  const roofCanvas = () => get('roofCanvas', makeRoof);
  const stoneCanvas = () => get('stoneCanvas', makeStone);

  T.get = function (name) {
    switch (name) {
      case 'wood': return get('wood', () => UTIL.tex(makeWood(false), { repeat: [1, 1], aniso: 8 }));
      case 'woodLight': return get('woodLight', () => UTIL.tex(makeWood(true), { repeat: [1, 1], aniso: 8 }));
      case 'roof': return get('roof', () => UTIL.tex(roofCanvas(), { repeat: [1, 1], aniso: 8 }));
      case 'roofNormal': return get('roofNormal', () => UTIL.tex(UTIL.normalFromCanvas(roofCanvas(), 1.1), { srgb: false, aniso: 4 }));
      case 'stone': return get('stone', () => UTIL.tex(stoneCanvas(), { repeat: [1, 1], aniso: 8 }));
      case 'stoneNormal': return get('stoneNormal', () => UTIL.tex(UTIL.normalFromCanvas(stoneCanvas(), 1.2), { srgb: false, aniso: 4 }));
      case 'plaster': return get('plaster', () => UTIL.tex(makePlaster(), { repeat: [1, 1], aniso: 4 }));
      case 'brick': return get('brick', () => UTIL.tex(makeBrick(), { repeat: [1, 1], aniso: 4 }));
      case 'bamboo': return get('bamboo', () => UTIL.tex(makeBamboo(), { repeat: [1, 1], aniso: 4 }));
      case 'leafCamphor': return get('leafCamphor', () => UTIL.tex(makeCanopy('camphor'), { wrap: 'clamp', aniso: 4 }));
      case 'leafWillow': return get('leafWillow', () => UTIL.tex(makeCanopy('willow'), { wrap: 'clamp', aniso: 4 }));
      case 'leafPeach': return get('leafPeach', () => UTIL.tex(makeCanopy('peach'), { wrap: 'clamp', aniso: 4 }));
      case 'reed': return get('reed', () => UTIL.tex(makeReed(), { wrap: 'clamp', aniso: 2 }));
      case 'lotus': return get('lotus', () => UTIL.tex(makeLotusLeaf(), { wrap: 'clamp', aniso: 2 }));
      case 'lotusFlower': return get('lotusFlower', () => UTIL.tex(makeLotusFlower(), { wrap: 'clamp', aniso: 2 }));
      case 'ground': return get('ground', () => UTIL.tex(makeGround(), { repeat: [1, 1], aniso: 8 }));
      case 'waterA': return get('waterA', () => UTIL.tex(makeWaterNormal(7), { srgb: false, aniso: 4 }));
      case 'waterB': return get('waterB', () => UTIL.tex(makeWaterNormal(19), { srgb: false, aniso: 4 }));
      case 'foam': return get('foam', () => UTIL.tex(makeFoam(), { wrap: 'clamp', aniso: 2 }));
      case 'mist': return get('mist', () => UTIL.tex(makeMist(), { wrap: 'clamp', aniso: 2 }));
      case 'rain': return get('rain', () => UTIL.tex(makeRain(), { wrap: 'clamp', aniso: 1 }));
      case 'blob': return get('blob', () => UTIL.tex(makeBlob(), { wrap: 'clamp', aniso: 1 }));
      case 'windows': return get('windows', () => UTIL.tex(makeWindows(), { repeat: [2, 2], aniso: 2 }));
      case 'bark': return get('bark', () => UTIL.tex(makeBark(), { repeat: [1, 1], aniso: 4 }));
      default: return null;
    }
  };

  T.plaque = function (text) {
    const key = 'plaque:' + text;
    return get(key, () => UTIL.tex(makePlaque(text), { wrap: 'clamp', aniso: 2 }));
  };

  /* ---------- 景点照片（photo-assets.js base64；缺失时程序化降级） ---------- */
  function makePhotoFallback(key, title) {
    const W = 512, H = 384, c = UTIL.canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, W, H);           // 宣纸底
    g.fillStyle = 'rgba(120,130,120,0.16)';                    // 远山剪影
    for (let k = 0; k < 3; k++) {
      g.beginPath(); g.moveTo(0, H * (0.52 + k * 0.1));
      for (let x = 0; x <= W; x += 24) g.lineTo(x, H * (0.52 + k * 0.1) - 30 * Math.abs(Math.sin(x * 0.013 + k * 2.1)) - k * 8);
      g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(70,60,45,0.75)';                       // 塔形剪影
    const px = W * 0.68, pw = 26;
    for (let t = 0; t < 5; t++) {
      const ty = H * 0.58 - t * 26, tw = pw * (1 - t * 0.14);
      g.fillRect(px - tw / 2, ty - 24, tw, 24);
    }
    g.fillStyle = '#2f2a20';
    g.font = '34px "KaiTi","STKaiti",serif'; g.textAlign = 'center';
    g.fillText(title || '西湖勝景', W / 2, H * 0.3);
    g.strokeStyle = 'rgba(90,70,40,0.8)'; g.lineWidth = 5; g.strokeRect(8, 8, W - 16, H - 16);
    return c;
  }

  T.photo = function (key, title) {
    const key2 = 'photo:' + key + ':' + (title || '');
    return get(key2, () => {
      const rec = (window.PHOTO_ASSETS && window.PHOTO_ASSETS[key]) ? window.PHOTO_ASSETS[key] : null;
      const c = UTIL.canvas(768, 576), g = c.getContext('2d');
      g.fillStyle = '#ddd6c4'; g.fillRect(0, 0, 768, 576);      // 加载前占位
      const tex = UTIL.tex(c, { wrap: 'clamp', aniso: 8 });
      const src = rec ? rec.uri : makePhotoFallback(key, title).toDataURL();
      const img = new Image();
      img.onload = () => {
        g.drawImage(img, 0, 0, 768, 576);
        if (!rec) {                                             // 降级图直接带题字
          const fc = makePhotoFallback(key, title);
          g.drawImage(fc, 0, 0, 768, 576);
        }
        tex.needsUpdate = true;
      };
      img.src = src;                                            // dataURI 在 file:// 下无 CORS
      return tex;
    });
  };

  T.warmLantern = function () {
    return get('warmLantern', () => UTIL.tex((() => {
      const S = 128, c = UTIL.canvas(S, S), g = c.getContext('2d');
      const gr = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,238,196,1)');
      gr.addColorStop(0.35, 'rgba(255,184,96,.95)');
      gr.addColorStop(1, 'rgba(190,60,30,.15)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      return c;
    })(), { wrap: 'clamp', aniso: 2 }));
  };

  return T;
})();
