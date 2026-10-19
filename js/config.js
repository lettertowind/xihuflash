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
    zenith: 0x5f7178,
    mid: 0x93a3a3,
    horizon: 0xc7cfc8,
    cloudLight: 0xbcc5c1,
    cloudDark: 0x7c898b,
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

  nitro: {
    tank: 1.0,
    burn: 2.8,
    regen: 7.0,
    start: 0.08,
    relock: 0.25,
    kick: 4.5,
    fovKick: 12
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
        birds: { egret: 0, swallow: 4, duck: 0 }, figures: { boat: 1, walk: 8, visitPerMark: 3, armFrame: 4 }, villages: 18 },
      { name: 'low', dpr: 1.00, terrain: 192, trees: 500, treeNear: 120, reflect: false, shadow: false, rain: 1500, mist: 2, ai: 4, patchSeg: 64, aniso: 2,
        birds: { egret: 2, swallow: 8, duck: 6 }, figures: { boat: 2, walk: 24, visitPerMark: 5, armFrame: 3 }, villages: 30 },
      { name: 'mid', dpr: 1.25, terrain: 224, trees: 750, treeNear: 260, reflect: true, shadow: false, rain: 3000, mist: 4, ai: 6, patchSeg: 80, aniso: 4,
        birds: { egret: 3, swallow: 12, duck: 12 }, figures: { boat: 3, walk: 40, visitPerMark: 7, armFrame: 2 }, villages: 44 },
      { name: 'high', dpr: 1.50, terrain: 256, trees: 1000, treeNear: 400, reflect: true, shadow: true, rain: 5000, mist: 6, ai: 8, patchSeg: 96, aniso: 8,
        birds: { egret: 5, swallow: 16, duck: 18 }, figures: { boat: 4, walk: 60, visitPerMark: 10, armFrame: 1 }, villages: 48 }
    ]
  }
};
