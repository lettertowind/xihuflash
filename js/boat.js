/* 船：乌篷船第一视角、街机物理、氮气状态机、尾迹与水花 */
window.Boat = (function () {
  const B = {};

  B.create = function (scene, tier) {
    const C = CFG.boat, N = CFG.nitro;
    const group = new THREE.Group();
    const model = BoatModel.build('wupeng', 7, { headLamp: true });
    group.add(model.group);
    scene.add(group);
    const oar = model.oar;
    let oarPhase = 0;

    /* 主船大灯：唯一真实点光源（照亮沿岸景物便于观赏），随环境亮度自动开关 */
    const headLight = new THREE.PointLight(0xffcf96, 0, 85, 2);
    headLight.position.set(4.0, 1.6, 0.58);
    group.add(headLight);

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

    /* 水花 */
    const NP = 130;
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
      tank: N.tank, boosting: false, lock: false, fovK: 0,
      shake: 0, bob: 0, pitch: 0, roll: 0,
      lookYaw: 0, lookPitch: 0,
      collisions: 0, topSpeed: 0, distance: 0,
      wakeHist: [], wakeTimer: 0, count: 0, hitCool: 0
    };

    B.state = state;
    B.group = group;
    B.wake = wake;

    B.reset = function (x, z, heading) {
      state.x = x; state.z = z; state.heading = heading;
      state.speed = 0; state.tank = N.tank; state.boosting = false; state.lock = false; state.fovK = 0;
      state.shake = 0; state.collisions = 0; state.topSpeed = 0; state.distance = 0;
      state.wakeHist.length = 0; state.throttle = 0; state.steer = 0; state.hitCool = 0;
      state.lookYaw = 0; state.lookPitch = 0;
      group.position.set(x, 0, z); group.rotation.set(0, -heading, 0);
    };

    B.forward = function () { return [Math.cos(state.heading), Math.sin(state.heading)]; };

    B.update = function (dt, input, navigable) {
      /* --- 氮气状态机 --- */
      const wantBoost = !!(input.boost && input.throttle > 0.2);
      if (!state.boosting && wantBoost && !state.lock &&
          state.tank >= N.start && state.speed > 5) {
        state.boosting = true;
        state.speed = Math.min(C.boostSpeed, state.speed + N.kick);   // 踩下瞬间爆发
        state.fovK = Math.min(1, state.fovK + 0.55);
      }
      if (state.boosting) {
        state.tank -= dt / N.burn;
        state.speed = Math.min(C.boostSpeed, state.speed + dt * C.boostAccel);
        if (state.tank <= 0 || !input.boost) {
          state.tank = Math.max(0, state.tank);
          state.boosting = false; state.lock = true;
        }
      } else {
        state.tank = Math.min(N.tank, state.tank + dt / N.regen);
        if (state.lock && state.tank >= N.relock) state.lock = false;
      }
      state.fovK += ((state.boosting ? 1 : 0) - state.fovK) * Math.min(1, dt * 3.2);

      /* --- 油门与转向 --- */
      state.throttle += (input.throttle - state.throttle) * Math.min(1, dt * 7);
      state.steer += (input.steer - state.steer) * Math.min(1, dt * 9);

      const cap = state.boosting ? C.boostSpeed : C.maxSpeed;
      const target = state.throttle * cap;
      if (target > state.speed) {
        state.speed += (target - state.speed) * Math.min(1, dt * (C.accel / 22) * (0.5 + 0.5 * state.throttle) * 1.35);
      } else {
        state.speed += (target - state.speed) * Math.min(1, dt * 2.6);
      }
      if (state.boosting && state.speed < C.boostSpeed * 0.35) state.speed = C.boostSpeed * 0.35;
      state.speed = Math.max(C.reverse, state.speed);
      if (state.speed > state.topSpeed) state.topSpeed = state.speed;

      const sp = Math.abs(state.speed);
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
        if (!slid) { state.speed *= 0.22; }
        else { state.speed *= 0.55; }
        if (state.hitCool <= 0) {
          state.shake = Math.min(1.7, state.shake + 0.95);   // 剧烈震颤
          state.collisions++;
          state.hitCool = 0.5;
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
      group.position.set(state.x, bobY - 0.06, state.z);
      group.rotation.set(state.pitch, -state.heading, state.roll);

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

      /* --- 水花 --- */
      const sprayAmt = Math.min(1, sp / 38) + state.fovK * 0.35;
      if (sp > 11 && Math.random() < Math.min(1, sprayAmt)) {
        const p = parts[state.count % NP]; state.count++;
        const side = Math.random() < 0.5 ? 1 : -1;
        const rx = -Math.sin(state.heading), rz = Math.cos(state.heading);
        p.life = 0.45 + Math.random() * 0.5;
        p.x = state.x + Math.cos(state.heading) * 0.8 + rx * side * 1.6;
        p.z = state.z + Math.sin(state.heading) * 0.8 + rz * side * 1.6;
        p.y = 0.4;
        p.vx = Math.cos(state.heading) * state.speed * 0.32 + rx * side * (3 + Math.random() * 5);
        p.vz = Math.sin(state.heading) * state.speed * 0.32 + rz * side * (3 + Math.random() * 5);
        p.vy = 2.8 + Math.random() * 4 + sprayAmt * 3.2;
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

      state.shake = Math.max(0, state.shake - dt * 1.8);

      /* --- 船灯随昼夜自动开关（带烛火抖动） --- */
      if (window.Weather && Weather.lampK) {
        const k = Weather.lampK();
        const flick = 0.92 + 0.08 * Math.sin(state.bob * 9.7) * Math.sin(state.bob * 4.3 + 1.7);
        if (model.lamps) BoatModel.setLamps(model, k, flick);
        headLight.intensity = k * flick * 2.6;
      }
    };

    /* --- 第一人称相机（坐于敞开船头，支持环视观景） --- */
    const eye = C.eye;
    B.applyCamera = function (camera, dt) {
      const sp = Math.abs(state.speed);
      const speedK = Math.min(1, sp / C.boostSpeed);
      const fov = CFG.render.fovBase + speedK * 7 + state.fovK * N.fovKick;
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }

      const ch = Math.cos(state.heading), sh = Math.sin(state.heading);
      const yaw = state.lookYaw || 0, lk = state.lookPitch || 0;
      // 加速时眼位上浮，视线越过船头
      const eyeY = eye[1] + state.fovK * 0.18 + Math.min(0.07, sp * 0.0013);
      const ex = ch * eye[0] - sh * eye[2];
      const ez = sh * eye[0] + ch * eye[2];
      // 剧烈震颤：位置抖动有上限防穿模，叠加随机横滚
      const shake = Math.min(0.62, state.shake * 0.42) + speedK * 0.05 + state.fovK * 0.05;
      const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake * 0.7;
      const bob = Math.sin(state.bob * 1.9) * 0.034 + Math.sin(state.bob * 3.1) * 0.017;

      camera.position.set(
        state.x + ex + (-sh) * sx,
        eyeY + bob + sy + state.pitch * 1.2,
        state.z + ez + ch * sx
      );
      // 视向 = 船首方向旋转 yaw（环视），再叠加俯仰 pitch
      const cy = Math.cos(yaw), syaw = Math.sin(yaw);
      const fx = ch * cy - sh * syaw;
      const fz = sh * cy + ch * syaw;
      camera.up.set(0, 1, 0);
      camera.lookAt(
        state.x + fx * 42,
        eyeY + Math.sin(lk) * 26 + bob * 0.4 - state.pitch * 7,
        state.z + fz * 42
      );
      camera.rotation.z += state.roll * 0.5 * (1 - Math.min(1, Math.abs(yaw) * 1.6));
      if (state.shake > 0.2) camera.rotation.z += (Math.random() - 0.5) * state.shake * 0.05;
    };

    return B;
  };

  return B;
})();
