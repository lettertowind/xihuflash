/* 音效：WebAudio 合成 —— 烟雨环境声、水声、橹声、氮气、提示音（全程异常保护） */
window.AudioFX = (function () {
  const A = { ready: false, muted: false, failed: false };
  let ctx = null, master = null;
  let rainGain, windGain, windFilter, waterGain, waterFilter, rumbleGain, rumbleOsc, boostGain, voiceBus, voiceGuard;
  let rainLevel = 0.16;
  /* 两条真人语音素材（WAV，离线已做响度最大化 + 统一到 VOICE_LUFS，长度 = 原录音长度）
     scream = 事故惊叫（js/scream-assets.js），accel = 换快档加速（js/accel-assets.js） */
  const screamBuf = { buf: null };
  const accelBuf = { buf: null };
  const VOICE_LUFS = -6.8;      // 素材对齐的积分响度目标（build-voice.py 的 --lufs）
  const VOICE_GAIN = 0.72;      // 单声播放增益（两条素材共用，保证听感音量一致）

  function mkNoise(seconds) {
    const len = Math.max(1, (ctx.sampleRate * seconds) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function b64buf(dataUri) {
    const s = atob(String(dataUri).split(',')[1] || '');
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a.buffer;
  }

  /* 采样解码：file:// 下 fetch/XHR 会被 CORS 拦，所以素材以 base64 内联在 js/*-assets.js。
     解码失败不抛错——A.scream 会自动退回旧的合成惊呼，A.accel 则静默不响。 */
  function decodeInto(slot, dataUri) {
    if (!dataUri || !ctx.decodeAudioData) return;
    try {
      const p = ctx.decodeAudioData(b64buf(dataUri), b => { slot.buf = b; }, () => { });
      if (p && p.then) p.then(b => { slot.buf = b; }).catch(() => { });
    } catch (e) { }
  }

  function loadVoice() {
    const S = window.SCREAM_ASSETS, A2 = window.ACCEL_ASSETS;
    if (S && S.s) decodeInto(screamBuf, S.s);
    if (A2 && A2.a) decodeInto(accelBuf, A2.a);
  }

  /* 响度补偿：素材在离线阶段已对齐到 VOICE_LUFS，这里按实测 LUFS 再做一次微调，
     两条素材即使重新生成、响度有零点几 dB 偏差，播放出来也严格一样响。 */
  function lufsTrim(info) {
    const L = info && typeof info.lufs === 'number' ? info.lufs : VOICE_LUFS;
    return Math.pow(10, (VOICE_LUFS - L) / 20);
  }

  /* 通用语音播放：完整播完采样（不做任何裁剪/拉伸），长度由 AudioBuffer.duration 决定。
     rate 只会往上取（只会更短，绝不超出原长），pan 用于左右错开声像。 */
  function playVoice(buf, opt) {
    const o = opt || {};
    const t = ctx.currentTime;
    const rate = o.rate || 1.0;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = o.gain === undefined ? VOICE_GAIN : o.gain;
    let tail = g;
    src.connect(g);
    if (ctx.createStereoPanner && o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p); tail = p;
    }
    tail.connect(voiceGuard || voiceBus || master);
    src.start(t);
    src.stop(t + buf.duration / rate + 0.02);   // 兜底，正常情况下 buffer 自然放完
    return buf.duration;
  }

  /* 采样式惊呼：翻船三连呼时三声重叠，单声增益压到 0.30 留混音余量 */
  function playScreamSample(buf, male, loud) {
    return playVoice(buf, {
      gain: (loud ? 0.30 : VOICE_GAIN) * lufsTrim(window.SCREAM_INFO),
      rate: 1.0 + Math.random() * 0.05,
      pan: (male ? -0.28 : 0.28) + (Math.random() - 0.5) * 0.16
    });
  }

  A.init = function () {
    if (A.ready || A.failed) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { A.failed = true; return; }
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      // 语音专用总线：惊叫与换档加速共用同一条 + 同一档增益，两条素材听感音量才一致
      voiceBus = ctx.createGain(); voiceBus.gain.value = 1.9;
      /* 限幅保险：素材本身已压到 -1dBFS，但翻船时三声惊呼会叠在一条总线上，
         叠加峰值可能越过 0dBFS。这里只在叠加时介入（阈值 -3dB、12:1、软拐点 6dB），
         单声语音（总线电平约 -6dBFS）完全不碰。 */
      try {
        voiceGuard = ctx.createDynamicsCompressor();
        voiceGuard.threshold.value = -3; voiceGuard.knee.value = 6;
        voiceGuard.ratio.value = 12; voiceGuard.attack.value = 0.003; voiceGuard.release.value = 0.12;
        voiceBus.connect(voiceGuard); voiceGuard.connect(master);
      } catch (e) {
        voiceGuard = null; voiceBus.connect(master);
      }

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
      loadVoice();                  // 素材解码是异步的，就绪前 A.scream 自动走合成兜底
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

  /* 轻碰（弹性碰撞）：短促闷响，不惊叫、不翻船 —— 未达速度阈值时用 */
  A.bump = function (k) {
    if (!A.ready || A.muted) return;
    try {
      const t = ctx.currentTime;
      const v = 0.10 + 0.14 * (k === undefined ? 0.5 : k);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(92, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.22);
      const src = ctx.createBufferSource(); src.buffer = mkNoise(0.2);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(v * 0.8, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      src.connect(lp); lp.connect(g2); g2.connect(master);
      src.start(t); src.stop(t + 0.15);
    } catch (e) { }
  };

  /* 惊呼声：事故（高速撞击 / 翻船）时播放
     loud=true 为"翻船级"——三声重叠，单声增益压到 0.30；false 为普通撞击（VOICE_GAIN）。
     音源优先用采样（js/scream-assets.js）；解码未就绪则退回原合成惊呼。
     时长以采样为准：惊叫时长 = 原录音长度（1.536s），不再压缩到旧的 0.64/1.02s 槽。 */
  A.scream = function (male, loud) {
    if (!A.ready) return;
    if (A.muted) return;
    const sampleDur = screamBuf.buf ? screamBuf.buf.duration : 0;
    const slot = sampleDur || (loud ? 1.02 : 0.64);   // 合成兜底仍用旧槽长
    if (screamBuf.buf) {
      try { playScreamSample(screamBuf.buf, male, loud); } catch (e) { }
      return;
    }
    try {
      const t = ctx.currentTime;
      const f0 = male ? 330 : 600;                 // 男低 / 女高
      const dur = slot;
      const vol = loud ? 0.55 : 0.30;              // 经 voiceBus（×1.9）后明显更响
      const voice = (base, gainK, bpA, bpB, vibF, delay) => {
        const t0 = t + (delay || 0);
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(base * 1.34, t0);
        o.frequency.exponentialRampToValueAtTime(base * 1.06, t0 + dur * 0.18);
        o.frequency.exponentialRampToValueAtTime(base * 0.70, t0 + dur);
        const vib = ctx.createOscillator(); vib.frequency.value = vibF;
        const vibG = ctx.createGain(); vibG.gain.value = base * 0.06;
        vib.connect(vibG); vibG.connect(o.frequency);
        const bp1 = ctx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = bpA; bp1.Q.value = 3.4;
        const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = bpB; bp2.Q.value = 4.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol * gainK, t0 + 0.05);
        g.gain.setValueAtTime(vol * gainK, t0 + dur * 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(bp1); bp1.connect(bp2); bp2.connect(g); g.connect(voiceBus || master);
        o.start(t0); o.stop(t0 + dur + 0.06);
        vib.start(t0); vib.stop(t0 + dur + 0.06);
      };
      voice(f0, 1.0, male ? 640 : 1000, male ? 1220 : 1950, male ? 6.2 : 7.8, 0);
      voice(f0 * (male ? 1.5 : 0.68), 0.62, male ? 900 : 1420, 1650, 5.4, 0.03);   // 齐呼声部
      if (loud) voice(f0 * 0.52, 0.5, 520, 900, 4.6, 0.11);                        // 低沉嘶喊
    } catch (e) { }
  };

  /* 换快档的"加速"呼喊：切到二档时整段播完（长度 = 原录音 1.109s，不裁剪不拉伸）。
     与 A.scream 走同一条 voiceBus、同一档增益、同一 LUFS 基准，听感音量严格一致。
     0.5s 内重复触发直接忽略，避免连按 Shift 把人声叠成一片。 */
  let lastAccelAt = -1e9;
  A.accel = function () {
    if (!A.ready || A.muted) return 0;
    const buf = accelBuf.buf;
    if (!buf) return 0;
    const now = ctx.currentTime;
    if (now - lastAccelAt < 0.5) return 0;
    lastAccelAt = now;
    try {
      return playVoice(buf, { gain: VOICE_GAIN * lufsTrim(window.ACCEL_INFO), pan: 0.08 });
    } catch (e) { return 0; }
  };

  /* 落水声：带通噪声下扫 */
  A.splash = function (vol) {
    if (!A.ready || A.muted) return;
    try {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = mkNoise(1.0);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
      bp.frequency.setValueAtTime(2400, t);
      bp.frequency.exponentialRampToValueAtTime(380, t + 0.55);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol === undefined ? 0.3 : vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t); src.stop(t + 0.65);
    } catch (e) { }
  };

  /* 木船断折：短促噪声爆 + 低频闷响 */
  A.woodCrack = function () {
    if (!A.ready || A.muted) return;
    try {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = mkNoise(0.4);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(hp); hp.connect(g); g.connect(master);
      src.start(t); src.stop(t + 0.2);
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
      g2.gain.setValueAtTime(0.28, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g2); g2.connect(master); o.start(); o.stop(t + 0.32);
    } catch (e) { }
  };

  /* 翻船事件：木裂 + 落水 + 数声惊呼（分轨错开，像船客一起喊） */
  A.capsize = function () {
    if (!A.ready || A.muted) return;
    A.woodCrack();
    A.splash(0.34);
    setTimeout(() => { try { A.scream(false, true); } catch (e) { } }, 90);
    setTimeout(() => { try { A.scream(true, true); } catch (e) { } }, 240);
    setTimeout(() => { try { A.scream(false, true); } catch (e) { } }, 430);
    setTimeout(() => { try { A.splash(0.22); } catch (e) { } }, 700);
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

  /* 调试：确认两条语音采样是否解码就绪（探针用）。
     同时给出各自的实际播放增益，用来验证"换档音效与惊呼等响" */
  A.voiceInfo = function () {
    const s = screamBuf.buf, a = accelBuf.buf;
    return {
      ready: A.ready,
      voiceLufs: VOICE_LUFS,
      gain: VOICE_GAIN,
      scream: {
        sample: !!s, dur: s ? +s.duration.toFixed(3) : 0, sr: s ? s.sampleRate : 0,
        lufs: window.SCREAM_INFO ? window.SCREAM_INFO.lufs : null,
        playGain: +(VOICE_GAIN * lufsTrim(window.SCREAM_INFO)).toFixed(4)
      },
      accel: {
        sample: !!a, dur: a ? +a.duration.toFixed(3) : 0, sr: a ? a.sampleRate : 0,
        lufs: window.ACCEL_INFO ? window.ACCEL_INFO.lufs : null,
        playGain: +(VOICE_GAIN * lufsTrim(window.ACCEL_INFO)).toFixed(4)
      }
    };
  };
  A.screamInfo = A.voiceInfo;      // 旧名保留，探针脚本不用改

  return A;
})();
