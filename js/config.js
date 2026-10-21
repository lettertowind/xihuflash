/* 全部可调参数：改这里就能整体调节手感、天气与画质 */
window.CFG = {
  version: '2.2',
  render: {
    maxDPR: 1.5,
    exposure: 0.84,
    fovBase: 72,
    near: 0.08,
    far: 12000
  },

  weather: {
    fog: 0xaeb9b5,
    fogDensity: 0.00078,
    dayLength: 300,            // 一昼夜 = 现实 5 分钟（v2：拉开日出/正午/日落/夜晚四段）
    dayStart: 0.028,           // 开局时刻（0=日出，0.25=正午，0.5=日落，0.75=午夜）——开局即清晨日出
    lampOn: 0.5,               // 昼光低于此阈值时船灯点亮
    nightFogDensity: 0.00105,
    zenith: 0x5f7178,
    mid: 0x93a3a3,
    horizon: 0xc7cfc8,
    cloudLight: 0xbcc5c1,
    cloudDark: 0x7c898b,
    night: {
      fog: 0x2c3540,
      zenith: 0x131a26,
      mid: 0x1f2933,
      horizon: 0x37414d,
      cloudLight: 0x2a323d,
      cloudDark: 0x171d26,
      hemiSky: 0x2b3541,
      hemiGround: 0x1b2018,
      sunColor: 0x93a7c8,      // 月色
      fogColor: 0x2c3540
    },
    hemiSky: 0xa9b8ba,
    hemiGround: 0x55604f,
    hemiIntensity: 1.4,
    sunColor: 0xdfe7e2,
    sunIntensity: 1.05,
    sunDir: [-0.35, 0.42, -0.84],
    fillColor: 0x9db3ae,
    fillIntensity: 0.6,
    /* 黄金时刻（日出/日落低太阳角）暖色板：天空、雾、云、日光一起转暖 */
    golden: {
      fog: 0xd6ad86,
      zenith: 0x4a6c8c,
      mid: 0x9c8b86,
      horizon: 0xf2b878,
      cloudLight: 0xffd2a4,
      cloudDark: 0x8a6558,
      sunColor: 0xffa864,
      hemiSky: 0xc9a98e,
      hemiGround: 0x5b5140
    },
    rainHigh: 5000,
    rainLow: 1500,
    rainCpu: 600,
    mistHigh: 6,
    mistLow: 2
  },

  /* 风力：随机风向 / 强度 / 持续时间；顺风提速、逆风减速、侧风把船吹偏 */
  wind: {
    enabled: true,
    minDur: 13,              // 一阵风最短持续（秒）
    maxDur: 34,              // 最长持续
    minStrength: 2.2,        // m/s
    maxStrength: 13.0,       // m/s（≈6 级强风）
    speedGain: 0.30,         // 顺风最多 +30% 航速，逆风同比例
    drift: 0.44,             // 侧风横推系数（× 风速 → m/s 漂移）——v2.2 由 0.20 上调
    fade: 1.6,               // 换风时的过渡时间（秒）
    /* v2.2 阵风：风力 ≥2 级时每隔几秒来一股，船会被明显推偏（"不时产生明显位移"） */
    gustMin: 2.4,            // 两股阵风的最小间隔（秒）
    gustMax: 6.2,            // 最大间隔
    gustDur: [0.55, 1.5],    // 单股阵风持续（秒）
    gustAmp: 2.1,            // 阵风叠加倍数（× 常规横推）
    gustLevel: 2             // 达到此风力等级才开始打阵风
  },

  /* 上岸步行 */
  walk: {
    speed: 4.4,              // 常速 m/s
    sprint: 7.4,             // 冲刺 m/s（消耗体力，与竞速模式同一套体力）
    eye: 1.68,               // 眼高（人物身高约 1.78m，低着头能看到自己的腿）
    radius: 0.44,            // 碰撞半径
    boardDist: 24,           // 离船多近可「上船」（要 >= berthRange，否则下了船回不去）
    berthRange: 14,          // 船离岸小于此距离才出现「下船」
    shoreLimit: 0.9,         // 岸距小于此值算落水，禁止行走
    stepUp: 1.15,            // 单步可跨越高差（米）
    jumpV: 4.6,              // 起跳初速（m/s）
    gravity: 13.5,           // 重力（m/s²）
    bobAmp: 0.055,           // 行走时相机上下颠簸幅度
    swayAmp: 0.032,          // 行走时相机左右摇摆幅度
    sprintTouch: 0.72,       // 手机：摇杆前推超过该比例算冲刺
    inland: 320              // 空气墙：离岸超过此距离（米）不可再往内陆走
  },

  /* 竞速模式：固定快档 + 体力加速 */
  race: {
    staminaMax: 100,
    regen: 8.5,              // 每秒回复
    drain: 26,               // 每秒消耗
    minBoost: 8,             // 低于此值无法起步加速
    boostSpeed: 104,         // 加速极速 ≈374km/h
    boostAccel: 62
  },

  terrain: {
    sdfSize: 1024,
    gridHigh: 256,
    gridMid: 192,
    gridLow: 128,
    minX: -4200, maxX: 3400,
    minZ: -3400, maxZ: 3200
  },

  water: {
    reflectSize: 512,
    reflectHz: 30,
    foam: 3.0,
    patch: 240,
    patchSeg: 96,
    deep: 0x223437,
    shallow: 0x4b5f57,
    silt: 0x5e6353
  },

  boat: {
    maxSpeed: 54,
    boostSpeed: 82,
    accel: 18,
    boostAccel: 34,
    turnLow: 0.95,
    turnHigh: 0.48,
    lateralDamp: 3.5,
    reverse: -9,
    eye: [2.70, 1.46, 0],
    length: 9.2,
    width: 2.2,
    /* v2 惯性：起步/收油都更"沉"，转向有舵重（航向角速度做一阶跟随） */
    inertia: {
      accel: 0.62,           // 加速跟随系数（1 = 旧版手感，越小越沉）
      decel: 0.34,           // 收油/刹车跟随系数（越小滑行越远）
      yaw: 3.4,              // 舵响应速度（越大越跟手）
      steer: 6.0             // 摇舵平滑（原来 9，降低后打舵有过程）
    },
    bridgeAssist: 1.9        // 过桥自动回中强度（0 = 关）
  },

  /* 三档速度：Shift 循环切换（1 慢 / 2 快 / 3 自动巡航）
     本轮按需求调参：
       一档 速度值减半     28 → 14 m/s（166 → 50.4 km/h）
       巡航 基础速度 -30km/h 100.8 → 70.8 km/h（19.67 m/s）
       二档 -20km/h        295.2 → 275.2 km/h（76.44 m/s）
       巡航提速上限 cruiseBoost 是上一轮定下的历史值（旧慢档 46），保持不变，
       它仍落在"巡航基础 19.67"与"快档 76.44"之间，作为手机端前拉提速的上限依然合理。

     慢档速度的两个数值各有用途，别混：
       slow = 14  —— 现役一档满速
       cruiseSlow = 19.67 —— 三档巡航的【基础速度】（比手动慢档略高，因为不用掌舵） */
  gears: {
    slow: 14,               // 一档 ~50km/h
    fast: 76.44,            // 二档 ~275km/h（原 82 / 295km/h，-20km/h）
    cruiseSlow: 19.67,      // 三档基础 ~71km/h（原 28 / 100.8km/h，-30km/h）
    // 巡航提速上限：在原来 275km/h（76.44m/s）的基础上下调 80km/h → 195.2km/h
    // 两端统一用同一个上限：电脑按 W、手机前拉摇杆，都是 195km/h 封顶
    cruiseFast: 54.22,      // ≈195.2 km/h
    cruiseBoost: 54.22,     // 与电脑端一致
    accelSlow: 11,          // 慢档起步也要慢，别让"慢船"两秒就窜到满速
    accelFast: 27,
    accelCruise: 16,        // 三档提速（19.67→46）的加速度
    lookAhead: 2.2,         // 巡航前视距离 = 速度 × 此系数（米）——转向有惯性，前视要留够
    lookMin: 42,
    lookMax: 170,
    cruiseTurn: 2.05,       // 巡航转向增益
    interp: 0.35             // 换档后动力爬升的平滑时间（秒）
  },

  /* 碰撞：低于阈值只做弹性反弹（不算事故，不惊呼不翻船），撞墙同理 */
  collision: {
    threshold: 19,          // m/s（≈68 km/h）
    bounce: 0.36,           // 弹性回弹系数
    bumpCool: 0.45
  },

  traffic: {
    high: 8,
    mid: 6,
    low: 4,
    cpu: 2,
    clearStart: 150
  },

  explore: {
    dockRadius: 70,
    minTime: 120,
    minDistance: 2500,
    leftStart: 300
  },

  quality: {
    tiers: [
      { name: 'cpu', dpr: 0.75, terrain: 128, trees: 180, treeNear: 40, reflect: false, shadow: false, rain: 600, mist: 1, ai: 2, patchSeg: 48, aniso: 1,
        birds: { egret: 0, swallow: 4, duck: 0 }, figures: { boat: 1, walk: 14, visitPerMark: 4, armFrame: 4 }, villages: 26, waterside: 60 },
      { name: 'low', dpr: 1.40, terrain: 192, trees: 700, treeNear: 280, reflect: true, shadow: false, rain: 3200, mist: 4, ai: 5, patchSeg: 64, aniso: 4,
        birds: { egret: 3, swallow: 10, duck: 8 }, figures: { boat: 2, walk: 78, visitPerMark: 10, armFrame: 2 }, villages: 56, waterside: 160 },
      { name: 'mid', dpr: 1.25, terrain: 224, trees: 750, treeNear: 260, reflect: true, shadow: false, rain: 3000, mist: 4, ai: 6, patchSeg: 80, aniso: 4,
        birds: { egret: 3, swallow: 12, duck: 12 }, figures: { boat: 3, walk: 72, visitPerMark: 10, armFrame: 2 }, villages: 64, waterside: 165 },
      { name: 'high', dpr: 1.50, terrain: 256, trees: 1000, treeNear: 400, reflect: true, shadow: true, rain: 5000, mist: 6, ai: 8, patchSeg: 96, aniso: 8,
        birds: { egret: 5, swallow: 16, duck: 18 }, figures: { boat: 4, walk: 110, visitPerMark: 14, armFrame: 1 }, villages: 84, waterside: 200 }
    ]
  }
};
