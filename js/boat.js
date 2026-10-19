/* 船：乌篷船第一视角、街机物理、氮气状态机、尾迹与水花 */
window.Boat = (function () {
  const B = {};

  B.create = function (scene, tier) {
    const C = CFG.boat, GR = CFG.gears, COL = CFG.collision;
    const group = new THREE.Group();
    const model = BoatModel.build('wupeng', 7, { headLamp: true });
    group.add(model.group);
    scene.add(group);
    const oar = model.oar;
    let oarPhase = 0;
    let bwT = 0;

    /* 船底不可入水约束用的甲板取样点（x,z 成对，取自船板轮廓） */
    const DECK_Y = 0.42, WATER_MARGIN = 0.09;
    const DECK_PTS = [4.42, -0.30, 4.42, 0.30, 0.55, -1.24, 0.55, 1.24, -4.40, -0.54, -4.40, 0.54];
    const _liftM = new THREE.Matrix4(), _liftE = new THREE.Euler(), _liftV = new THREE.Vector3();

    /* 玩家自身建模：古人装束（靛青交领长袍 + 束腰 + 蓑衣 + 斗笠），坐在船头
       第一视角：藏头与斗笠，只露出自己的肩背、双臂与双手（有"自己的身体"才像在船上） */
    const avatar = (window.PlayerModel && PlayerModel.avatar) ? PlayerModel.avatar({ robe: 0x35506b }) : null;
    if (avatar) {
      avatar.group.position.set(2.05, 0.42, -0.02);   // 船头甲板（y=0.4）上盘坐
      avatar.group.rotation.y = -Math.PI / 2;         // 人物前方 -Z → 船首 +X
      avatar.setFirstPerson(true);
      model.group.add(avatar.group);
    }

    /* 主船大灯：唯一真实点光源（照亮沿岸景物便于观赏），随环境亮度自动开关 */
    const headLight = new THREE.PointLight(0xffcf96, 0, 85, 2);
    headLight.position.set(4.0, 1.6, 0.58);
    group.add(headLight);

    /* ---------------- 船头探照灯：锥形光束 ----------------
       湖面用的是自定义 shader，不参与常规光照，所以单加 SpotLight 照不亮水面。这里三层叠：
         ① SpotLight —— 真实投射，照亮沿岸景物、别的船、船上人物
         ② 水面光斑（XZ 平面）—— 第一视角主要看到的"前方一片被照亮"，锥形展开、边缘高斯柔化
         ③ 竖直光带（XY 平面）—— 侧视/第三人称时的雾中光柱轮廓
       ②③ 用同一个 shader、十字交叉摆放。不用实心圆锥壳：相机在第一视角时位于锥体内部，
       从内部看锥壳会变成一个"甜甜圈"状的环，既不像光柱也不自然。
       强度统一乘 Weather.lampK()：白天为 0 整组不可见；雾越浓散射越强，光柱越实。 */
    const BEAM_LEN = 58, BEAM_HALF = 18;      // 半角约 0.30rad，58m 处半径 ≈ 17.9m
    const headSpot = new THREE.SpotLight(0xffd7a8, 0, 95, 0.30, 0.88, 1.45);
    headSpot.position.set(4.05, 1.72, 0.0);
    headSpot.target.position.set(64, 0.10, 0);       // target 也在 group 内，自动跟船首方向
    group.add(headSpot);
    group.add(headSpot.target);

    /* 光锥着色器：uv.x = 沿光束（0 船头 → 1 远端），uv.y = 横向
       横向用高斯核做"边缘柔和过渡"，轴向用幂次衰减做"随距离自然衰减"，
       再叠一层沿轴流动的细纹，避免整块光斑板结 */
    const beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffd9a6) },
        uStrength: { value: 0 },
        uTime: { value: 0 },
        uEdge: { value: 26.0 }                    // 波纹密度，竖直/水面两片可分别调
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uStrength; uniform float uTime; uniform float uEdge;',
        'varying vec2 vUv;',
        'void main() {',
        '  float t = clamp(vUv.x, 0.0, 1.0);',
        '  float lat = (vUv.y - 0.5) * 2.0;',
        '  float spread = 0.10 + 0.90 * t;',            // 锥形：越远越宽
        '  float d = abs(lat) / spread;',                // 0 = 中轴，1 = 锥边
        '  float lateral = exp(-d * d * 3.4);',          // 高斯横向：中心亮、边缘软
        '  float core = exp(-d * d * 15.0) * 0.55;',     // 中轴再加一道亮带，别糊成一团
        '  float cut = smoothstep(1.0, 0.82, d);',       // 锥边再切一刀，去掉硬角
        '  float axial = pow(1.0 - t, 1.30);',           // 距离衰减
        // 水面波纹 / 雾的密度起伏，把光斑打碎，别像一块塑料片
        '  float rip = 0.76 + 0.24 * sin(lat * 9.0 + uTime * 1.8)',
        '                         * sin(t * 30.0 - uTime * 2.4 + lat * 3.0);',
        '  float a = (lateral + core) * cut * axial * rip * uStrength;',
        '  gl_FragColor = vec4(uColor, a);',
        '}'
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });

    /* ② 水面光斑：贴水面的锥形亮区，第一视角的主力观感 */
    const waterSpot = new THREE.Mesh(new THREE.PlaneGeometry(BEAM_LEN, BEAM_HALF * 2), beamMat);
    waterSpot.rotation.x = -Math.PI / 2;
    waterSpot.position.set(BEAM_LEN / 2 + 3.9, 0.15, 0);
    waterSpot.frustumCulled = false;
    waterSpot.renderOrder = 5;
    const spotPivot = new THREE.Group();
    spotPivot.add(waterSpot);
    scene.add(spotPivot);

    /* ③ 竖直光带：侧视时看得到的雾中光柱（与水面那片交叉成十字） */
    const beamMatV = beamMat.clone();
    beamMatV.uniforms = THREE.UniformsUtils.clone(beamMat.uniforms);
    beamMatV.uniforms.uStrength.value = 0;
    beamMatV.uniforms.uEdge.value = 18.0;
    const beamWall = new THREE.Mesh(new THREE.PlaneGeometry(BEAM_LEN, BEAM_HALF * 2), beamMatV);
    beamWall.position.set(BEAM_LEN / 2 + 3.9, 1.72, 0);
    beamWall.frustumCulled = false;
    beamWall.renderOrder = 4;
    group.add(beamWall);

    /* 尾迹 */
    const MAXW = 240;
    const wpos = new Float32Array(MAXW * 2 * 3);
    const walpha = new Float32Array(MAXW * 2);
    const wuv = new Float32Array(MAXW * 2 * 2);
    const widx = [];
    for (let i = 0; i < MAXW - 1; i++) {
      const a = i * 2;
      widx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    wg.setAttribute('aA', new THREE.BufferAttribute(walpha, 1));
    wg.setAttribute('uv', new THREE.BufferAttribute(wuv, 2));
    wg.setIndex(widx);
    wg.setDrawRange(0, 0);
    const wm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'attribute float aA; varying float vA; varying vec2 vUv;' +
        'void main(){ vA=aA; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying float vA; varying vec2 vUv;' +
        'void main(){' +
        '  float edge = smoothstep(0.0,0.22,vUv.x)*smoothstep(1.0,0.72,vUv.x);' +
        '  float a = vA*edge*0.62;' +
        '  gl_FragColor = vec4(vec3(0.93,0.96,0.95), a); }'
    });
    const wake = new THREE.Mesh(wg, wm);
    wake.frustumCulled = false; wake.renderOrder = 3;
    scene.add(wake);

    /* ---------------- 船头分水（V 形水脊） ----------------
       两条从船首向左右张开、向后延伸的水脊带。顶点每帧按实际速度重算：
       速度越快 → 张角越大、越往后拖、越亮；停下即完全消失。
       挂在船体 group 上（随船姿态一起摇曳），零额外 draw call 之外的开销。 */
    const BWSEG = 14;                       // 每条水脊的分段
    const bwVerts = 2 * (BWSEG + 1) * 2;    // 两条 × 每段两端点
    const bwPos = new Float32Array(bwVerts * 3);
    const bwUv = new Float32Array(bwVerts * 2);
    const bwIdx = [];
    for (let s = 0; s < 2; s++) {
      const base = s * (BWSEG + 1) * 2;
      for (let k = 0; k < BWSEG; k++) {
        const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
        bwIdx.push(a, b, c, b, d, c);
      }
    }
    for (let i = 0; i < bwVerts; i++) { bwUv[i * 2] = (i % 2) ? 1 : 0; bwUv[i * 2 + 1] = 0; }
    const bwGeo = new THREE.BufferGeometry();
    bwGeo.setAttribute('position', new THREE.BufferAttribute(bwPos, 3));
    bwGeo.setAttribute('uv', new THREE.BufferAttribute(bwUv, 2));
    bwGeo.setIndex(bwIdx);
    const bwMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uT: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv;' +
        'void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float uA; uniform float uT; varying vec2 vUv;' +
        'void main(){' +
        '  float edge = smoothstep(0.0,0.34,vUv.x)*smoothstep(1.0,0.60,vUv.x);' +   // 横向两侧淡出
        '  float fade = smoothstep(1.0,0.42,vUv.y);' +                              // 越往后越淡
        '  float streak = 0.52+0.48*sin((vUv.y*6.0-uT*2.6)*6.2832);' +              // 流动水纹
        '  float a = uA*edge*fade*(0.48+0.62*streak);' +
        '  if(a<=0.001) discard;' +
        '  gl_FragColor = vec4(1.0,1.0,1.0, a); }'
    });
    const bowWave = new THREE.Mesh(bwGeo, bwMat);
    bowWave.name = 'bowwave';
    bowWave.frustumCulled = false; bowWave.renderOrder = 4;
    scene.add(bowWave);        // 贴水面：不跟船体俯仰/侧倾，否则船头下压时会沉进水里
    /* 写出某一帧的分水带顶点：k=0..1 为速度强度
       注意：第一视角眼位在 x≈2.7、船首水线在 x≈4.6，水面比眼低 1.4m，
       "船首正下方"其实落在视野下缘之外 —— 所以 V 的尖端要略微探到船首前方，
       两条水脊再向后张开，第一视角才看得见浪花从船头分开往后走。 */
    function updateBowWave(k, t) {
      const apex = 5.55 + k * 0.35;                      // V 尖端（船首前方约 1m）
      const len = 4.2 + 6.2 * k;                         // 往后拖的长度（到船尾即止，后面交给尾迹）
      const spread = 1.7 + 3.3 * k;                      // 向两侧张开的宽度
      const band = 0.46 + 0.75 * k;                      // 水脊本身的带宽
      const crest = 0.20 + 0.42 * k;                     // 脊高
      for (let s = 0; s < 2; s++) {
        const sg = s === 0 ? 1 : -1;
        const base = s * (BWSEG + 1) * 2;
        for (let i = 0; i <= BWSEG; i++) {
          const q = i / BWSEG;
          const x = apex - Math.pow(q, 1.7) * len;       // 尖端先探出去，再快速回收
          const zc = sg * (0.22 + q * spread);
          const y = 0.06 + Math.sin(Math.min(1, q * 1.28) * Math.PI) * crest;
          // 内缘（贴船身）/ 外缘（水脊外侧）
          const zi = zc - sg * band * (0.15 + 0.85 * q);
          const zo = zc + sg * band * 0.55;
          const a = base + i * 2;
          bwPos[a * 3] = x; bwPos[a * 3 + 1] = y; bwPos[a * 3 + 2] = zi;
          bwPos[(a + 1) * 3] = x; bwPos[(a + 1) * 3 + 1] = y * 0.42; bwPos[(a + 1) * 3 + 2] = zo;
          bwUv[a * 2 + 1] = q; bwUv[(a + 1) * 2 + 1] = q;
        }
      }
      bwGeo.attributes.position.needsUpdate = true;
      bwGeo.attributes.uv.needsUpdate = true;
      bwMat.uniforms.uA.value = 0.12 + 0.88 * k;
      bwMat.uniforms.uT.value = t;
    }
    updateBowWave(0, 0);

    /* 水花 */
    const NP = 190;
    const sp = new Float32Array(NP * 3), salpha = new Float32Array(NP);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aA', new THREE.BufferAttribute(salpha, 1));
    const sprayMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'attribute float aA; varying float vA;' +
        'void main(){ vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=54.0/max(1.0,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vA;' +
        'void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; float a=smoothstep(0.5,0.05,r)*vA; gl_FragColor=vec4(0.94,0.98,1.0,a*0.8); }'
    });
    const spray = new THREE.Points(sg, sprayMat);
    spray.frustumCulled = false; spray.renderOrder = 4;
    scene.add(spray);
    const parts = [];
    for (let i = 0; i < NP; i++) parts.push({ life: 0, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0 });

    const state = {
      x: 0, z: 0, heading: 0, speed: 0,
      throttle: 0, steer: 0,
      gear: 1, boostMix: 0, fovK: 0,      // gear 1/2/3；fovK = 实际速度归一（0..1，驱动全部速度特效）
      shake: 0, shakeAge: 0, bob: 0, pitch: 0, roll: 0,
      lookYaw: 0, lookPitch: 0,
      view: 'first', capRoll: 0, capsizeT: 0, capsizeDir: 1, panic: 0,
      collisions: 0, topSpeed: 0, distance: 0,
      wakeHist: [], wakeTimer: 0, count: 0, hitCool: 0, sprayAcc: 0, bounces: 0, float: 0
    };

    B.state = state;
    B.group = group;
    B.wake = wake;
    const CAPSIZE_DUR = 1.7;

    /* 视角切换：first（第一视角，默认）/ third（第三人称，可看清玩家建模与整船） */
    B.setView = function (v) {
      state.view = v === 'third' ? 'third' : 'first';
      if (avatar) avatar.setFirstPerson(state.view === 'first');
      return state.view;
    };
    B.toggleView = function () { return B.setView(state.view === 'first' ? 'third' : 'first'); };

    /* 撞击响应：k = 0..1.4（按撞击速度归一）。k 超过阈值触发"翻船"演出：
       大幅镜头震颤 + 侧倾翻覆 + 木裂落水 + 船客惊呼（AudioFX.capsize） */
    B.impact = function (k) {
      k = Math.max(0.1, Math.min(1.4, k || 0.3));
      state.shake = Math.min(2.8, state.shake + 0.5 + k * 1.05);
      state.shakeAge = 0;
      state.panic = Math.min(1, state.panic + 0.35 + k * 0.55);
      try { AudioFX.crash(); } catch (e) { }
      if (k >= 0.62 && state.capsizeT <= 0) {
        state.capsizeT = CAPSIZE_DUR;
        state.capsizeDir = Math.random() < 0.5 ? -1 : 1;
        try { AudioFX.capsize(); } catch (e) { }
      } else {
        try { AudioFX.scream(Math.random() < 0.5, k > 0.45); } catch (e) { }
      }
    };

    /* 弹性碰撞：未达速度阈值时只有"顶一下"的手感，不算事故（不出惊呼、不翻船） */
    B.bounce = function (k) {
      k = Math.max(0, Math.min(1, k || 0.4));
      state.shake = Math.min(1.2, state.shake + 0.12 + k * 0.22);
      state.shakeAge = 0;
      try { AudioFX.bump(k); } catch (e) { }
    };

    B.reset = function (x, z, heading) {
      state.x = x; state.z = z; state.heading = heading;
      state.speed = 0; state.gear = 1; state.boostMix = 0; state.fovK = 0;
      state.shake = 0; state.shakeAge = 0; state.collisions = 0; state.topSpeed = 0; state.distance = 0;
      state.wakeHist.length = 0; state.throttle = 0; state.steer = 0; state.hitCool = 0;
      state.lookYaw = 0; state.lookPitch = 0; state.sprayAcc = 0; state.bounces = 0; state.float = 0;
      state.capsizeT = 0; state.capRoll = 0; state.panic = 0;
      group.position.set(x, 0, z); group.rotation.set(0, -heading, 0);
    };

    /* 档位：1 慢 / 2 快 / 3 自动巡航 */
    B.setGear = function (g) {
      state.gear = Math.max(1, Math.min(3, g | 0)) || 1;
      return state.gear;
    };
    B.cycleGear = function (d) {
      const next = ((state.gear - 1 + (d === -1 ? -1 : 1)) % 3 + 3) % 3 + 1;
      return B.setGear(next);
    };
    B.gearName = g => (g === 3 ? '三档 · 自动巡航' : (g === 2 ? '二档 · 快船' : '一档 · 慢船'));

    B.forward = function () { return [Math.cos(state.heading), Math.sin(state.heading)]; };

    B.update = function (dt, input, navigable) {
      /* --- 三档速度：档位决定速度上限与动力，特效由实际速度决定 --- */
      const gear = state.gear;
      let cap, accel;
      if (gear === 3) {
        /* 三档：巡航默认走 cruiseSlow；input.cruiseCap 由 game.js 按平台给定上限——
           电脑按 W → cruiseFast(82)，手机前拉摇杆 → cruiseBoost(46)；
           两者都只是换一个"封顶值"，速度爬到上限后停住，不会越界。 */
        cap = input.cruiseCap != null ? input.cruiseCap : GR.cruiseSlow;
        accel = input.cruiseCap != null && input.cruiseCap > GR.cruiseSlow ? GR.accelCruise : GR.accelSlow;
      } else if (gear === 2) {
        cap = GR.fast; accel = GR.accelFast;
      } else {
        cap = GR.slow; accel = GR.accelSlow;
      }
      // 换档时动力爬升做一点平滑，避免瞬间"跳速"
      state.boostMix += ((gear === 2 ? 1 : 0) - state.boostMix) * Math.min(1, dt / GR.interp);

      /* --- 油门与转向 --- */
      state.throttle += (input.throttle - state.throttle) * Math.min(1, dt * 7);
      state.steer += (input.steer - state.steer) * Math.min(1, dt * 9);

      const target = state.throttle * cap;
      if (target > state.speed) {
        state.speed += (target - state.speed) * Math.min(1, dt * (accel / 22) * (0.5 + 0.5 * state.throttle) * 1.35);
      } else {
        state.speed += (target - state.speed) * Math.min(1, dt * 2.6);
      }
      state.speed = Math.max(C.reverse, state.speed);
      if (state.speed > state.topSpeed) state.topSpeed = state.speed;

      const sp = Math.abs(state.speed);
      /* 速度强度 0..1：一档跑满约 0.42、二档跑满 1.0 —— 决定 FOV、水花、尾迹、船头分水与眼位 */
      const spN = UTIL.clamp((sp - GR.slow * 0.45) / (GR.fast - GR.slow * 0.45), 0, 1);
      state.fovK += (spN - state.fovK) * Math.min(1, dt * 5.5);

      const turn = UTIL.lerp(C.turnLow, C.turnHigh, Math.min(1, sp / C.maxSpeed)) * (state.speed >= 0 ? 1 : -1);
      state.heading += state.steer * turn * dt;

      /* --- 位移与搁浅/碰撞 --- */
      const dx = Math.cos(state.heading) * state.speed * dt;
      const dz = Math.sin(state.heading) * state.speed * dt;
      const nx = state.x + dx, nz = state.z + dz;
      const bowX = nx + Math.cos(state.heading) * 3.4;
      const bowZ = nz + Math.sin(state.heading) * 3.4;
      if (navigable(nx, nz) && navigable(bowX, bowZ)) {
        state.x = nx; state.z = nz;
      } else {
        let slid = false;
        if (navigable(state.x + dx, state.z) && navigable(state.x + dx + Math.cos(state.heading) * 3.4, state.z)) { state.x += dx; slid = true; }
        if (navigable(state.x, state.z + dz) && navigable(state.x, state.z + dz + Math.sin(state.heading) * 3.4)) { state.z += dz; slid = true; }
        /* 撞墙同样按速度阈值分支：低于阈值只做弹性反弹，不算事故 */
        if (!slid) {
          if (sp < COL.threshold) {
            if (sp > 1.3) {
              state.speed = -state.speed * COL.bounce;          // 弹回
              state.shake = Math.min(1.1, state.shake + 0.16);  // 轻微一顿，不翻船
              state.shakeAge = 0;
            } else {
              state.speed *= 0.2;
            }
            if (state.hitCool <= 0) {
              state.hitCool = COL.bumpCool;
              state.bounces++;
              B.bounce(Math.min(1, sp / COL.threshold));        // 只出声，不算碰撞
            }
          } else {
            state.speed *= 0.22;
            if (state.hitCool <= 0) {
              state.collisions++;
              state.hitCool = 0.5;
              B.impact(UTIL.clamp(sp / 45, 0.15, 1.4));         // 高速触岸/撞堤 → 翻船级演出
            }
          }
        } else {
          state.speed *= 0.55;
          if (sp >= COL.threshold && state.hitCool <= 0) {
            state.collisions++;
            state.hitCool = 0.5;
            B.impact(UTIL.clamp(sp / 45, 0.15, 1.4));
          }
        }
      }
      state.hitCool = Math.max(0, state.hitCool - dt);
      state.distance += sp * dt;

      /* --- 姿态 --- */
      state.bob += dt * (1.6 + sp * 0.02);
      const bobY = Math.sin(state.bob * 1.7) * 0.05 + Math.sin(state.bob * 2.9) * 0.028;
      const targetPitch = -sp * 0.0013 - state.fovK * 0.024;
      const targetRoll = -state.steer * 0.06 * Math.min(1, sp / 28);
      state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 3);
      state.roll += (targetRoll - state.roll) * Math.min(1, dt * 4);

      /* --- 翻船演出：侧倾翻覆 → 短暂没入 → 自扶正 --- */
      state.shakeAge += dt;
      state.shake = Math.max(0, state.shake - dt * 1.05);
      state.panic = Math.max(0, state.panic - dt * 0.55);
      if (state.capsizeT > 0) {
        state.capsizeT = Math.max(0, state.capsizeT - dt);
        const c = 1 - state.capsizeT / CAPSIZE_DUR;
        const w = c < 0.2 ? c / 0.2 : (c > 0.78 ? Math.max(0, (1 - c) / 0.22) : 1);
        state.capRoll = state.capsizeDir * 1.24 * w;
        state.speed *= Math.pow(0.35, dt);                 // 倾覆失速
      } else {
        state.capRoll += (0 - state.capRoll) * Math.min(1, dt * 7);
      }

      /* --- 船底作为不可穿透边界 ---
         高速时船头下压会把甲板压到水面以下，水面就"穿过船底"切进舱里。
         这里按当前俯仰/横滚求出船板最低点，把整船顶高到水面之上（平滑跟随，不跳变）。
         翻船演出（capRoll）不参与该约束——那是故意让船侧翻没入水中的状态。

         轴向说明：船模局部 +X 是船首方向，所以
           横滚 = 绕局部 X（船长轴），俯仰 = 绕局部 Z（船宽轴）。
         Euler 必须用 YZX（RY·RZ·RX：先横滚、再俯仰、最后航向），三个轴才都在船体局部系里。
         旧的 XYZ 顺序把 RX 放到最后作用于世界系，heading 一变，pitch 就变成"世界 X 轴上的乱歪"，
         而 roll 又占到 Z 轴（实际是俯仰轴）——按 A 转向时船首被抬起 0.26m，
         这就是"W+A 船头抬高挡视野"的根因。 */
      const rotX = state.pitch + Math.sin(state.shakeAge * 30) * state.shake * 0.02;
      const rotRoll = state.roll + state.capRoll;
      _liftE.set(rotRoll, -state.heading, rotX, 'YZX');
      _liftM.makeRotationFromEuler(_liftE);
      let deckMin = 1e9;
      for (let i = 0; i < DECK_PTS.length; i += 2) {
        _liftV.set(DECK_PTS[i], DECK_Y, DECK_PTS[i + 1]).applyMatrix4(_liftM);
        if (_liftV.y < deckMin) deckMin = _liftV.y;
      }
      const needLift = Math.max(0, WATER_MARGIN - deckMin);
      state.float += (needLift - state.float) * Math.min(1, dt * 9);

      group.position.set(state.x, bobY - 0.06 - Math.abs(Math.sin(state.capRoll)) * 0.16 + state.float, state.z);
      group.rotation.set(rotRoll, -state.heading, rotX, 'YZX');

      /* --- 摇橹动画 --- */
      if (oar) {
        oarPhase += dt * (2.2 + sp * 0.12);
        oar.rotation.y = Math.sin(oarPhase) * (0.2 + Math.min(0.25, sp * 0.008)) + state.steer * 0.28;
        oar.rotation.x = Math.sin(oarPhase * 0.5) * 0.06;
      }

      /* --- 尾迹 --- */
      const last = state.wakeHist[state.wakeHist.length - 1];
      if (!last || Math.hypot(state.x - last.x, state.z - last.z) > 2.3) {
        state.wakeHist.push({ x: state.x, z: state.z, t: 0 });
        if (state.wakeHist.length > MAXW - 2) state.wakeHist.shift();
      }
      for (const w of state.wakeHist) w.t += dt;
      while (state.wakeHist.length && state.wakeHist[0].t > 7) state.wakeHist.shift();

      const hist = state.wakeHist;
      const n = hist.length;
      if (n >= 2) {
        let vi = 0;
        for (let i = 0; i < n; i++) {
          const p = hist[i];
          const prev = hist[Math.max(0, i - 1)], next = hist[Math.min(n - 1, i + 1)];
          const tx = next.x - prev.x, tz = next.z - prev.z;
          const tl = Math.hypot(tx, tz) || 1;
          const nxv = -tz / tl, nzv = tx / tl;
          const age = p.t;
          const width = (1.5 + age * 2.3) * (1 + state.fovK * 0.25);
          const alpha = Math.max(0, 1 - age / 7) * Math.min(1, age * 3.5);
          wpos[vi * 3] = p.x + nxv * width; wpos[vi * 3 + 1] = 0.05; wpos[vi * 3 + 2] = p.z + nzv * width;
          walpha[vi] = alpha;
          wuv[vi * 2] = 0; wuv[vi * 2 + 1] = i / n;
          vi++;
          wpos[vi * 3] = p.x - nxv * width; wpos[vi * 3 + 1] = 0.05; wpos[vi * 3 + 2] = p.z - nzv * width;
          walpha[vi] = alpha;
          wuv[vi * 2] = 1; wuv[vi * 2 + 1] = i / n;
          vi++;
        }
        wg.attributes.position.needsUpdate = true;
        wg.attributes.aA.needsUpdate = true;
        wg.attributes.uv.needsUpdate = true;
        wg.setDrawRange(0, (n - 1) * 6);
      } else {
        wg.setDrawRange(0, 0);
      }

      /* --- 船头分水：强度随实际速度实时增强/减弱（贴水面，独立于船体俯仰） --- */
      bwT += dt;
      bowWave.position.set(state.x, 0.06, state.z);
      bowWave.rotation.set(0, -state.heading, 0);
      updateBowWave(state.fovK, bwT);

      /* --- 船头水花：从船首两侧同时溅起（速度越快越密越高） --- */
      const sprayAmt = state.fovK;
      if (sp > 6) {
        state.sprayAcc += (10 + 66 * sprayAmt * sprayAmt) * dt;
        const rx = -Math.sin(state.heading), rz = Math.cos(state.heading);
        const bx = state.x + Math.cos(state.heading) * 4.1;
        const bz = state.z + Math.sin(state.heading) * 4.1;
        let guard = 6;
        while (state.sprayAcc >= 1 && guard-- > 0) {
          state.sprayAcc -= 1;
          const p = parts[state.count % NP]; state.count++;
          const side = Math.random() < 0.5 ? 1 : -1;
          p.life = 0.40 + Math.random() * 0.45;
          p.x = bx + rx * side * (0.9 + Math.random() * 0.5);
          p.z = bz + rz * side * (0.9 + Math.random() * 0.5);
          p.y = 0.32;
          p.vx = Math.cos(state.heading) * state.speed * 0.26 + rx * side * (2.2 + Math.random() * 3.4 + sprayAmt * 3.6);
          p.vz = Math.sin(state.heading) * state.speed * 0.26 + rz * side * (2.2 + Math.random() * 3.4 + sprayAmt * 3.6);
          p.vy = 1.5 + Math.random() * 2.4 + sprayAmt * 4.4;
        }
      } else {
        state.sprayAcc = 0;
      }
      for (let i = 0; i < NP; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= 12 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0) { p.y = 0; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; }
          sp[i * 3] = p.x; sp[i * 3 + 1] = p.y; sp[i * 3 + 2] = p.z;
          salpha[i] = Math.max(0, Math.min(1, p.life * 1.6));
        } else {
          salpha[i] = 0;
        }
      }
      sg.attributes.position.needsUpdate = true;
      sg.attributes.aA.needsUpdate = true;

      /* --- 船灯随昼夜自动开关（带烛火抖动） --- */
      if (window.Weather && Weather.lampK) {
        const k = Weather.lampK();
        const flick = 0.92 + 0.08 * Math.sin(state.bob * 9.7) * Math.sin(state.bob * 4.3 + 1.7);
        if (model.lamps) BoatModel.setLamps(model, k, flick);
        headLight.intensity = k * flick * 2.6;

        /* 探照灯：雾越浓，散射越强，光柱越"有形"（夜间雾密度本来就更高，所以夜里更明显）。
           强度全部乘 k，白天为 0，整组光束自然消失，不需要额外开关。 */
        const fogK = UTIL.clamp(Weather.fogDensity / 0.00078, 0.7, 2.2);
        headSpot.intensity = k * flick * 2.4;
        beamMat.uniforms.uStrength.value = k * flick * 0.46 * fogK;
        beamMat.uniforms.uTime.value = state.bob;
        beamMatV.uniforms.uStrength.value = k * flick * 0.24 * fogK;
        beamMatV.uniforms.uTime.value = state.bob;
        // 水面光斑固定贴在水面上，只跟船位和航向，不跟船的俯仰横滚（否则会插进水里）
        spotPivot.position.set(state.x, 0.15, state.z);
        spotPivot.rotation.y = -state.heading;
      }
    };

    /* --- 第一/第三人称相机（坐于敞开船头，支持环视观景） --- */
    const eye = C.eye;
    B.applyCamera = function (camera, dt) {
      const sp = Math.abs(state.speed);
      // FOV 完全由实际速度驱动（一档温和、二档张开，换档即时联动）
      const fov = CFG.render.fovBase + state.fovK * 17;
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }

      const ch = Math.cos(state.heading), sh = Math.sin(state.heading);
      const yaw = state.lookYaw || 0, lk = state.lookPitch || 0;
      // 加速时眼位上浮，视线越过船头
      const eyeY = eye[1] + state.fovK * 0.18 + Math.min(0.07, sp * 0.0013);
      const bob = Math.sin(state.bob * 1.9) * 0.034 + Math.sin(state.bob * 3.1) * 0.017;

      /* 撞击震颤：阻尼振荡（46rad/s ≈ 7.3Hz）+ 少量高频抖动，比逐帧纯随机的观感更像"被撞" */
      const sk = state.shake;
      const jt = Math.max(0, state.shakeAge);
      const env = sk > 0.001 ? Math.exp(-jt * 1.5) * sk : 0;
      const jolt = Math.sin(jt * 46) * env;
      const jit = (Math.random() - 0.5) * env * 0.22;
      const capK = Math.abs(state.capRoll) / 1.24;

      if (state.view === 'third') {
        /* 第三人称：船后上方跟拍（可看到玩家建模与整船姿态） */
        const back = 12.0, up = 5.2;
        camera.position.set(
          state.x - ch * back - sh * jolt * 0.7,
          eyeY + up + jolt * 0.35 - capK * 0.6,
          state.z - sh * back + ch * jolt * 0.7
        );
        camera.up.set(0, 1, 0);
        camera.lookAt(state.x + ch * 2.4, eyeY + 0.4, state.z + sh * 2.4);
        camera.rotation.z += state.capRoll * 0.45 + state.roll * 0.4;
        return;
      }

      const ex = ch * eye[0] - sh * eye[2];
      const ez = sh * eye[0] + ch * eye[2];
      // 大幅震颤：横向 ±0.6m、上下 ±0.18m；翻船时眼位压向水面
      camera.position.set(
        state.x + ex - sh * (jolt + jit) * 0.62,
        eyeY + bob + state.pitch * 1.2 + jolt * 0.16 + jit * 0.1 - capK * 1.05,
        state.z + ez + ch * (jolt + jit) * 0.62
      );
      // 视向 = 船首方向旋转 yaw（环视），再叠加俯仰 pitch
      const cy = Math.cos(yaw), syaw = Math.sin(yaw);
      const fx = ch * cy - sh * syaw;
      const fz = sh * cy + ch * syaw;
      camera.up.set(0, 1, 0);
      // 碰撞震颤：视线被撞得往上/侧向甩，幅度随 shake 放大
      const skyKick = env * 7.5 + Math.sin(jt * 31) * env * 3.2;
      camera.lookAt(
        state.x + fx * 42 + Math.sin(jt * 21) * env * 9,
        eyeY + Math.sin(lk) * 26 + bob * 0.4 - state.pitch * 7 + skyKick,
        state.z + fz * 42 + Math.cos(jt * 19) * env * 9
      );
      // 横滚：转向侧倾 + 翻船整体倾覆（几乎把地平线立起来）
      camera.rotation.z += state.roll * 0.5 * (1 - Math.min(1, Math.abs(yaw) * 1.6)) + state.capRoll * 0.92;
      if (state.shake > 0.2) camera.rotation.z += (Math.random() - 0.5) * state.shake * 0.12;
    };

    return B;
  };

  return B;
})();
