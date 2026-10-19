/* 全部可调参数：改这里就能整体调节手感、天气与画质 */
window.CFG = {
  version: '2.0',
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
    dayLength: 240,            // 一昼夜 = 现实 4 分钟
    dayStart: 0.16,            // 开局时刻（0=日出，0.25=正午，0.5=日落，0.75=午夜）
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
    rainHigh: 5000,
    rainLow: 1500,
    rainCpu: 600,
    mistHigh: 6,
    mistLow: 2
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
    width: 2.2
  },

  /* 三档速度：Shift 循环切换（1 慢 / 2 快 / 3 自动巡航）
     一档略低于原 W 速度（54），二档 = 原 W+Shift（82），三档沿环线自动驾驶 */
  gears: {
    slow: 46,
    fast: 82,
    cruiseSlow: 46,
    cruiseFast: 82,
    accelSlow: 14,
    accelFast: 27,
    lookAhead: 1.55,        // 巡航前视距离 = 速度 × 此系数（米）
    lookMin: 26,
    lookMax: 130,
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
      { name: 'low', dpr: 1.00, terrain: 192, trees: 500, treeNear: 120, reflect: false, shadow: false, rain: 1500, mist: 2, ai: 4, patchSeg: 64, aniso: 2,
        birds: { egret: 2, swallow: 8, duck: 6 }, figures: { boat: 2, walk: 42, visitPerMark: 7, armFrame: 3 }, villages: 44, waterside: 110 },
      { name: 'mid', dpr: 1.25, terrain: 224, trees: 750, treeNear: 260, reflect: true, shadow: false, rain: 3000, mist: 4, ai: 6, patchSeg: 80, aniso: 4,
        birds: { egret: 3, swallow: 12, duck: 12 }, figures: { boat: 3, walk: 72, visitPerMark: 10, armFrame: 2 }, villages: 64, waterside: 165 },
      { name: 'high', dpr: 1.50, terrain: 256, trees: 1000, treeNear: 400, reflect: true, shadow: true, rain: 5000, mist: 6, ai: 8, patchSeg: 96, aniso: 8,
        birds: { egret: 5, swallow: 16, duck: 18 }, figures: { boat: 4, walk: 110, visitPerMark: 14, armFrame: 1 }, villages: 84, waterside: 200 }
    ]
  }
};
