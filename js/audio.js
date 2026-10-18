/* 音效：WebAudio 实时合成引擎声、水声、氮气、提示音 */
window.AudioFX = (function () {
  const A = { ready: false, muted: false };
  let ctx, master;
  let engGain, engOsc1, engOsc2, engFilter, subOsc, subGain;
  let waterGain, waterFilter, noiseSrc;
  let boostGain;

  A.init = function () {
    if (A.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);

    // 引擎：锯齿 + 方波 + 低通
    engGain = ctx.createGain(); engGain.gain.value = 0.0;
    engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 500;
    engGain.connect(engFilter); engFilter.connect(master);
    engOsc1 = ctx.createOscillator(); engOsc1.type = 'sawtooth'; engOsc1.frequency.value = 60;
    engOsc2 = ctx.createOscillator(); engOsc2.type = 'square'; engOsc2.frequency.value = 90;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    engOsc1.connect(engGain); engOsc2.connect(g2); g2.connect(engGain);
    engOsc1.start(); engOsc2.start();

    subOsc = ctx.createOscillator(); subOsc.type = 'sine'; subOsc.frequency.value = 38;
    subGain = ctx.createGain(); subGain.gain.value = 0.0;
    subOsc.connect(subGain); subGain.connect(master); subOsc.start();

    // 水声：白噪声 + 带通
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = buf; noiseSrc.loop = true;
    waterFilter = ctx.createBiquadFilter(); waterFilter.type = 'bandpass'; waterFilter.frequency.value = 900; waterFilter.Q.value = 0.6;
    waterGain = ctx.createGain(); waterGain.gain.value = 0.0;
    noiseSrc.connect(waterFilter); waterFilter.connect(waterGain); waterGain.connect(master);
    noiseSrc.start();

    // 氮气：高频噪声
    const b2 = ctx.createBuffer(1, len, ctx.sampleRate);
    const d2 = b2.getChannelData(0);
    for (let i = 0; i < len; i++) d2[i] = Math.random() * 2 - 1;
    const ns2 = ctx.createBufferSource(); ns2.buffer = b2; ns2.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    boostGain = ctx.createGain(); boostGain.gain.value = 0;
    ns2.connect(hp); hp.connect(boostGain); boostGain.connect(master); ns2.start();

    A.ready = true;
  };

  A.resume = function () { if (ctx && ctx.state === 'suspended') ctx.resume(); };

  A.setSpeed = function (kmh, boosting) {
    if (!A.ready || A.muted) return;
    const k = Math.min(1, kmh / 245);
    const target = 0.05 + k * 0.20;
    engGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engOsc1.frequency.setTargetAtTime(52 + k * 120, ctx.currentTime, 0.08);
    engOsc2.frequency.setTargetAtTime(78 + k * 180, ctx.currentTime, 0.08);
    engFilter.frequency.setTargetAtTime(320 + k * 1900, ctx.currentTime, 0.08);
    subGain.gain.setTargetAtTime(k > 0.5 ? (k - 0.5) * 0.11 : 0, ctx.currentTime, 0.1);
    waterGain.gain.setTargetAtTime(0.02 + k * 0.16, ctx.currentTime, 0.12);
    waterFilter.frequency.setTargetAtTime(600 + k * 1400, ctx.currentTime, 0.1);
    boostGain.gain.setTargetAtTime(boosting ? 0.10 : 0, ctx.currentTime, 0.06);
  };

  A.blip = function (freq, dur, vol) {
    if (!A.ready || A.muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq || 880;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol || 0.12, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (dur || 0.35));
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + (dur || 0.35) + 0.05);
  };

  A.gate = function () { A.blip(1320, 0.18, 0.10); setTimeout(() => A.blip(1760, 0.22, 0.08), 70); };
  A.crash = function () {
    if (!A.ready || A.muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(180, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(46, ctx.currentTime + 0.3);
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.4);
  };
  A.finish = function () {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => A.blip(f, 0.6, 0.10), i * 110));
  };
  A.start = function () { [392, 523, 659].forEach((f, i) => setTimeout(() => A.blip(f, 0.4, 0.09), i * 130)); };

  A.setMuted = function (m) {
    A.muted = m;
    if (!A.ready) return;
    master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
  };

  return A;
})();
