/* 风力系统：随机风向 / 强度 / 持续时间
   - 顺风提速、逆风减速、侧风把船横向吹偏（破坏航线）
   - 风向按气象习惯表述（"东南风"= 从东南方吹来），面板箭头指向风吹去的方向
   - 开关默认打开，F2 / 面板按钮可关；关闭后风逐渐平息，不再影响船速与航线 */
window.Wind = (function () {
  const W = {};
  const C = function () { return CFG.wind; };

  /* 16 方位（0=北，顺时针）——用于中文风名 */
  const NAMES = ['北', '北东北', '东北', '东东北', '东', '东东南', '东南', '南东南',
    '南', '南西南', '西南', '西西南', '西', '西西北', '西北', '北西北'];

  W.on = true;
  W.from = 0.6;            // 风向（弧度，从哪个方向吹来；世界坐标 0=+X 东，-Z 北）
  W.strength = 0;          // 当前实际风速 m/s
  W.target = 0;            // 目标风速
  W.targetFrom = 0.6;
  W.timer = 0;
  W.gust = 0;              // 长期阵风脉动系数（呼吸感）
  W.level = 0;
  W.burst = 0;             // v2.2 短促阵风强度 0..1（2 级以上每隔几秒来一股，船被明显推偏）

  let t = 0, seeded = false;
  let burstT = 0, burstAmp = 0, burstGap = 3.2;

  function randDur() {
    const c = C();
    return c.minDur + Math.random() * Math.max(1, c.maxDur - c.minDur);
  }

  /* 抽一阵新风：风向随机，强度在区间内随机（弱风概率更高） */
  function pick() {
    const c = C();
    W.targetFrom = Math.random() * Math.PI * 2;
    const u = Math.random();
    W.target = c.minStrength + (c.maxStrength - c.minStrength) * (u * u);
    W.timer = randDur();
    /* 风向取最短旋转路径，避免换风时指针绕一大圈 */
    let d = W.targetFrom - W.from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    W._turn = d;
  }

  W.init = function () {
    if (seeded) return;
    seeded = true;
    W.from = Math.random() * Math.PI * 2;
    pick();
    W.strength = W.target * 0.6;      // 开局留一点起风过程
    W.timer = randDur();
  };

  W.toggle = function (v) {
    W.on = (v === undefined) ? !W.on : !!v;
    if (W.on) pick();
    return W.on;
  };

  W.update = function (dt) {
    if (!seeded) W.init();
    if (!W.on) {
      /* 关风：风速平滑归零，风向保留（再次打开时从这里起风） */
      W.target = 0;
      W.strength += (0 - W.strength) * Math.min(1, dt * 1.4);
      W.gust *= 0.9;
      W.level = 0;
      W.burst *= 0.85;
      return;
    }
    W.timer -= dt;
    if (W.timer <= 0) pick();

    /* 换风过渡：台风向沿最短路径插值 */
    const k = Math.min(1, dt / Math.max(0.2, C().fade));
    W.from += (W._turn || 0) * k;
    W._turn = (W._turn || 0) * (1 - k);
    W.strength += (W.target - W.strength) * Math.min(1, dt * 1.2);

    /* 阵风：慢速脉动叠加，让"风"有呼吸感（0.86~1.14） */
    t += dt;
    W.gust = Math.sin(t * 0.55) * 0.09 + Math.sin(t * 1.31 + 1.7) * 0.05;
    W.level = Math.max(0, Math.min(6,
      W.strength < 0.4 ? 0 : Math.round(Math.pow(W.strength / 2.2, 0.62))));

    /* v2.2 短促阵风（gust burst）：
       风力 2 级以上时，每隔 2.4~6.2s 来一股 0.55~1.5s 的强推，
       船的横向漂移在这一瞬间放大 2~3 倍——"船会不时被风明显推一下"。
       包络用 sin 曲线（起、落都平滑），不会瞬移。 */
    const lvlMin = C().gustLevel === undefined ? 2 : C().gustLevel;
    if (W.level >= lvlMin) {
      burstGap -= dt;
      if (burstGap <= 0 && burstT <= 0) {
        const d = C().gustDur || [0.55, 1.5];
        burstT = d[0] + Math.random() * Math.max(0.05, d[1] - d[0]);
        burstAmp = 0.55 + Math.random() * 0.65;
        burstGap = (C().gustMin || 2.4) + Math.random() * Math.max(0.2, (C().gustMax || 6.2) - (C().gustMin || 2.4));
      }
    }
    if (burstT > 0) {
      burstT -= dt;
      const d = C().gustDur || [0.55, 1.5];
      const dur = Math.max(0.2, (d[0] + d[1]) * 0.5);
      const env = Math.sin(Math.PI * UTIL.clamp(1 - burstT / dur, 0, 1));
      W.burst += (burstAmp * env - W.burst) * Math.min(1, dt * 12);
    } else {
      W.burst += (0 - W.burst) * Math.min(1, dt * 3.2);
    }
  };

  /* 风的来向单位向量 */
  W.fromVec = function () { return { x: Math.cos(W.from), z: Math.sin(W.from) }; };
  /* 风吹去的方向单位向量（物理用） */
  W.blowVec = function () {
    const fx = Math.cos(W.from), fz = Math.sin(W.from);
    return { x: -fx, z: -fz };
  };

  /* 中文风名：按来向换算成 16 方位（北 = -Z） */
  W.name = function () {
    const f = W.fromVec();
    let brg = Math.atan2(f.x, -f.z);              // 0=北，π/2=东
    if (brg < 0) brg += Math.PI * 2;
    return NAMES[((Math.round(brg / (Math.PI / 8)) % 16) + 16) % 16];
  };

  /* 顺逆风航速系数：heading 为船头方向 → 返回 0.7 ~ 1.3 之间 */
  W.speedFactor = function (heading) {
    if (!W.on || W.strength < 0.2) return 1;
    const b = W.blowVec();
    const align = Math.cos(heading) * b.x + Math.sin(heading) * b.z;   // +1 顺风 / -1 逆风
    const g = 1 + W.gust;
    return 1 + align * (W.strength / C().maxStrength) * C().speedGain * g;
  };

  /* 横向吹偏速度（m/s 向量）：船越快受风越明显；2 级以上叠加阵风脉冲 */
  W.pushVec = function (speed) {
    if (!W.on || W.strength < 0.2) return { x: 0, z: 0 };
    const b = W.blowVec();
    const c = C();
    /* 基础横推：静止时也有 30% 推力（船会被风慢慢推走），全速时拉满 */
    const base = W.strength * c.drift * (0.30 + 0.70 * UTIL.clamp(Math.abs(speed) / 26, 0, 1));
    /* 阵风脉冲：2 级以上放大（gustAmp 倍），2 级以下只留一点余韵 */
    const amp = (c.gustAmp === undefined ? 2.1 : c.gustAmp);
    const gustK = 1 + W.burst * (W.level >= (c.gustLevel === undefined ? 2 : c.gustLevel) ? amp : amp * 0.35);
    const mag = base * (1 + W.gust) * gustK;
    return { x: b.x * mag, z: b.z * mag };
  };

  /* 面板显示用 */
  W.info = function () {
    return {
      on: W.on, name: W.name(), level: W.level,
      strength: W.strength, dir: Math.atan2(W.blowVec().z, W.blowVec().x),
      burst: W.burst
    };
  };

  return W;
})();
