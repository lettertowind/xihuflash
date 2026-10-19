/* 音效：WebAudio 合成 —— 烟雨环境声、水声、橹声、氮气、提示音（全程异常保护） */
window.AudioFX = (function () {
  const A = { ready: false, muted: false, failed: false };
  let ctx = null, master = null;
  let rainGain, windGain, windFilter, waterGain, waterFilter, rumbleGain, rumbleOsc, boostGain;
  let rainLevel = 0.16;

  function mkNoise(seconds) {
    const len = Math.max(1, (ctx.sampleRate * seconds) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  A.init = function () {
    if (A.ready || A.failed) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { A.failed = true; return; }
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);

      // 雨声：白噪声 + 低通（恒定轻响）
      const rainSrc = ctx.createBufferSource(); rainSrc.buffer = mkNoise(2); rainSrc.loop = true;
      const rainLP = ctx.createBiquadFilter(); rainLP.type = 'lowpass'; rainLP.frequency.value = 2600;
      rainGain = ctx.createGain(); rainGain.gain.value = rainLevel;
      rainSrc.connect(rainLP); rainLP.connect(rainGain); rainGain.connect(master);
      rainSrc.start();

      // 风声：带通噪声 + 慢LFO
      const windSrc = ctx.createBufferSource(); windSrc.buffer = mkNoise(3); windSrc.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass';
      windFilter.frequency.value = 420; windFilter.Q.value = 0.8;
      windGain = ctx.createGain(); windGain.gain.value = 0.05;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.028;
      lfo.connect(lfoG); lfoG.connect(windGain.gain);
      windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
      windSrc.start(); lfo.start();

      // 行船水声：带通噪声（随速度）
      const wSrc = ctx.createBufferSource(); wSrc.buffer = mkNoise(2); wSrc.loop = true;
      waterFilter = ctx.createBiquadFilter(); waterFilter.type = 'bandpass';
      waterFilter.frequency.value = 800; waterFilter.Q.value = 0.55;
      waterGain = ctx.createGain(); waterGain.gain.value = 0;
      wSrc.connect(waterFilter); waterFilter.connect(waterGain); waterGain.connect(master);
      wSrc.start();

      // 船体低鸣：低频振荡（随速度）
      rumbleOsc = ctx.createOscillator(); rumbleOsc.type = 'sine'; rumbleOsc.frequency.value = 42;
      rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0;
      rumbleOsc.connect(rumbleGain); rumbleGain.connect(master);
      rumbleOsc.start();

      // 氮气：高频噪声
      const bSrc = ctx.createBufferSource(); bSrc.buffer = mkNoise(2); bSrc.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1900;
      boostGain = ctx.createGain(); boostGain.gain.value = 0;
      bSrc.connect(hp); hp.connect(boostGain); boostGain.connect(master);
      bSrc.start();

      A.ready = true;
    } catch (e) {
      A.failed = true; A.ready = false;
      if (window.__log) window.__log('audio init failed: ' + e.message);
    }
  };

  A.resume = function () {
    try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) { }
  };

  A.setSpeed = function (kmh, boosting) {
    if (!A.ready || A.muted) return;
    try {
      const k = Math.min(1, kmh / 300);
      waterGain.gain.setTargetAtTime(0.02 + k * 0.20, ctx.currentTime, 0.10);
      waterFilter.frequency.setTargetAtTime(520 + k * 1500, ctx.currentTime, 0.10);
      rumbleGain.gain.setTargetAtTime(k * 0.05, ctx.currentTime, 0.14);
      rumbleOsc.frequency.setTargetAtTime(36 + k * 34, ctx.currentTime, 0.14);
      windGain.gain.setTargetAtTime(0.04 + k * 0.05, ctx.currentTime, 0.2);
      boostGain.gain.setTargetAtTime(boosting ? 0.09 : 0, ctx.currentTime, 0.07);
    } catch (e) { }
  };

  A.blip = function (freq, dur, vol) {
    if (!A.ready || A.muted) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq || 880;
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(vol || 0.12, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (dur || 0.35));
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + (dur || 0.35) + 0.05);
    } catch (e) { }
  };

  /* 磬声（抵达景点）：双音泛音 */
  A.visit = function () {
    A.blip(784, 0.9, 0.09);
    setTimeout(() => A.blip(1175, 1.1, 0.06), 130);
  };
  A.gate = function () { A.visit(); };
  A.crash = function () {
    if (!A.ready || A.muted) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(150, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(44, ctx.currentTime + 0.28);
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.38);
    } catch (e) { }
  };

  /* 惊呼声：男女声各一（基频滑落 + 颤音 + 共鸣滤波），翻船时随机播放 */
  A.scream = function (male) {
    if (!A.ready || A.muted) return;
    try {
      const t = ctx.currentTime;
      const f0 = male ? 340 : 620;                 // 男低 / 女高
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 1.28, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.72, t + 0.55);
      // 颤音
      const vib = ctx.createOscillator(); vib.frequency.value = male ? 6.2 : 7.8;
      const vibG = ctx.createGain(); vibG.gain.value = f0 * 0.055;
      vib.connect(vibG); vibG.connect(o.frequency);
      // 共鸣（近似口腔：双带通）
      const bp1 = ctx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = male ? 620 : 980; bp1.Q.value = 3.2;
      const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = male ? 1180 : 1900; bp2.Q.value = 4.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      o.connect(bp1); bp1.connect(bp2); bp2.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.68);
      vib.start(t); vib.stop(t + 0.68);
    } catch (e) { }
  };
  A.whoosh = function () {
    if (!A.ready || A.muted || !boostGain) return;
    try {
      boostGain.gain.cancelScheduledValues(ctx.currentTime);
      boostGain.gain.setValueAtTime(0.0, ctx.currentTime);
      boostGain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.06);
      boostGain.gain.setTargetAtTime(0.07, ctx.currentTime + 0.1, 0.3);
    } catch (e) { }
  };
  A.finish = function () {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => A.blip(f, 0.6, 0.10), i * 120));
  };
  A.start = function () { [392, 523, 659].forEach((f, i) => setTimeout(() => A.blip(f, 0.4, 0.09), i * 130)); };

  A.setMuted = function (m) {
    A.muted = m;
    if (!A.ready) return;
    try { master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05); } catch (e) { }
  };
  A.setRain = function (level) {
    rainLevel = level;
    if (!A.ready) return;
    try { rainGain.gain.setTargetAtTime(level, ctx.currentTime, 0.5); } catch (e) { }
  };

  return A;
})();
