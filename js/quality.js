/* 画质分档与动态降级 */
window.Quality = (function () {
  const Q = {
    tier: 3,          // 0 cpu / 1 low / 2 mid / 3 high
    ema: 16,
    gpu: '',
    software: false
  };

  Q.cfg = function () { return CFG.quality.tiers[Q.tier]; };
  Q.name = function () { return CFG.quality.tiers[Q.tier].name; };

  Q.detect = function (renderer) {
    const url = new URLSearchParams(location.search);
    const safe = url.get('safe') === '1';
    let gpu = '';
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : (gl.getParameter(gl.RENDERER) || '');
    } catch (e) { gpu = ''; }
    Q.gpu = gpu;
    Q.software = /SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu);
    const vw = window.innerWidth || window.screen.availWidth || 1280;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || vw < 760;
    const weakIGPU = /Intel/i.test(gpu) && !/Arc/i.test(gpu);
    if (safe || Q.software) Q.tier = 0;
    else if (mobile) Q.tier = 1;
    else if (weakIGPU) Q.tier = 2;
    else Q.tier = 3;
    Q.apply();
    return Q.tier;
  };

  Q.apply = function () {
    const t = Q.cfg();
    document.body.classList.toggle('lowfx', Q.tier <= 1);
    return t;
  };

  /* 每帧采样帧耗时，必要时降/升档；返回是否发生变更 */
  let slowFast = 0, slow = 0, fast = 0;
  Q.sample = function (frameMs, onChange) {
    Q.ema = Q.ema * 0.92 + frameMs * 0.08;
    let changed = false;
    if (Q.ema > 34) { slowFast++; slow = 0; } else slowFast = 0;
    if (Q.ema > 26) { slow++; } else slow = 0;
    if (Q.ema < 14) { fast++; slow = 0; slowFast = 0; } else fast = 0;
    if (slowFast > 55 && Q.tier > 1) { Q.tier = 1; changed = true; }
    else if (slow > 90 && Q.tier > 0) { Q.tier = Math.max(0, Q.tier - 1); changed = true; }
    else if (fast > 600 && Q.tier < 3 && !Q.software) { Q.tier = Math.min(3, Q.tier + 1); changed = true; }
    if (changed) Q.apply();
    return changed;
  };

  return Q;
})();
