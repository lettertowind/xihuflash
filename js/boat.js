/* 船：第一视角船头、街机物理、尾迹与水花 */
window.Boat = (function () {
  const B = {};

  B.create = function (scene) {
    const group = new THREE.Group();

    // 甲板
    const shape = new THREE.Shape();
    shape.moveTo(-3.3, -1.55);
    shape.lineTo(2.0, -1.55);
    shape.quadraticCurveTo(4.1, -1.15, 4.55, 0);
    shape.quadraticCurveTo(4.1, 1.15, 2.0, 1.55);
    shape.lineTo(-3.3, 1.55);
    shape.closePath();
    const deckGeo = new THREE.ShapeGeometry(shape, 12);
    deckGeo.rotateX(-Math.PI / 2);
    const wood = UTIL.wood(); wood.repeat.set(2.2, 2.2);
    const deck = new THREE.Mesh(deckGeo, new THREE.MeshLambertMaterial({ map: wood, color: 0xffe6c2 }));
    deck.position.y = 0.52;
    group.add(deck);

    // 舷墙
    const rim = new THREE.Mesh(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3.3, 0.62, -1.55), new THREE.Vector3(0.5, 0.62, -1.55),
        new THREE.Vector3(2.4, 0.62, -1.2), new THREE.Vector3(4.4, 0.62, 0),
        new THREE.Vector3(2.4, 0.62, 1.2), new THREE.Vector3(0.5, 0.62, 1.55),
        new THREE.Vector3(-3.3, 0.62, 1.55)
      ]), 90, 0.055, 6, false), new THREE.MeshStandardMaterial({ color: 0xcfd6d8, metalness: 0.55, roughness: 0.32 }));
    group.add(rim);

    // 船体侧板
    const hullMat = new THREE.MeshLambertMaterial({ color: 0x2a3138 });


    // 操控台
    const console3d = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.5), new THREE.MeshLambertMaterial({ color: 0x1f262c }));
    console3d.position.set(-1.35, 0.72, 0); console3d.scale.set(0.8,0.55,0.9); group.add(console3d);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ color: 0x4fd6c0 }));
    screen.position.set(-1.02, 0.86, 0); screen.rotation.y = Math.PI / 2; group.add(screen);


    // 小旗
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), new THREE.MeshLambertMaterial({ color: 0x9aa3a8 }));
    pole.position.set(-3.1, 1.3, -1.2); group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), new THREE.MeshLambertMaterial({ color: 0xc0392b, side: THREE.DoubleSide }));
    flag.position.set(-2.75, 1.85, -1.2); group.add(flag);

    scene.add(group);

    // 尾迹
    const MAXW = 260;
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
      vertexShader: `attribute float aA; varying float vA; varying vec2 vUv;
        void main(){ vA=aA; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying float vA; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0.0,0.22,vUv.x)*smoothstep(1.0,0.72,vUv.x);
          float a = vA*edge*0.62;
          gl_FragColor = vec4(vec3(0.93,0.96,0.95), a);
        }`
    });
    const wake = new THREE.Mesh(wg, wm);
    wake.frustumCulled = false; wake.renderOrder = 3;
    scene.add(wake);

    // 水花
    const N = 120;
    const sp = new Float32Array(N * 3), salpha = new Float32Array(N);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aA', new THREE.BufferAttribute(salpha, 1));
    const sprayMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `attribute float aA; varying float vA; void main(){ vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=52.0/max(1.0,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; float a=smoothstep(0.5,0.05,r)*vA; gl_FragColor=vec4(0.94,0.98,1.0,a*0.8); }`
    });
    const spray = new THREE.Points(sg, sprayMat);
    spray.frustumCulled = false; spray.renderOrder = 4;
    scene.add(spray);
    const parts = [];
    for (let i = 0; i < N; i++) parts.push({ life: 0, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0 });

    const state = {
      x: 0, z: 0, heading: 0, speed: 0,
      throttle: 0, steer: 0, boost: 0, boosting: false,
      shake: 0, bob: 0, pitch: 0, roll: 0,
      collisions: 0, topSpeed: 0, wakeHist: [], wakeTimer: 0, count: 0
    };

    B.state = state;
    B.group = group;
    B.wake = wake;

    B.reset = function (x, z, heading) {
      state.x = x; state.z = z; state.heading = heading;
      state.speed = 0; state.boost = 0; state.boosting = false;
      state.shake = 0; state.collisions = 0; state.topSpeed = 0;
      state.wakeHist.length = 0; state.throttle = 0; state.steer = 0;
      group.position.set(x, 0, z); group.rotation.set(0, -heading, 0);
    };

    const fwd = new THREE.Vector3();
    const tmpV = new THREE.Vector3();

    B.forward = function () { return [Math.cos(state.heading), Math.sin(state.heading)]; };

    B.update = function (dt, input, navigable) {
      const accel = 16, maxSpeed = 50.5, boostSpeed = 68;
      state.throttle += (input.throttle - state.throttle) * Math.min(1, dt * 8);
      state.steer += (input.steer - state.steer) * Math.min(1, dt * 9);

      const target = state.throttle * (input.boost && state.boost > 0.02 ? boostSpeed : maxSpeed);
      const rate = target > state.speed ? accel * (0.45 + 0.55 * state.throttle) : 26;
      state.speed += (target - state.speed) * Math.min(1, dt * (target > state.speed ? 0.9 : 2.2));
      state.speed = Math.max(-9, state.speed);

      if (input.boost && state.boost > 0.01 && state.speed > 8) {
        state.boost = Math.max(0, state.boost - dt * 0.30);
        state.boosting = true;
        state.speed = Math.min(boostSpeed, state.speed + dt * 26);
      } else {
        state.boosting = false;
        state.boost = Math.min(1, state.boost + dt * 0.035);
      }
      if (state.speed > state.topSpeed) state.topSpeed = state.speed;

      const sp = Math.abs(state.speed);
      const turn = (1.05 - 0.52 * Math.min(1, sp / maxSpeed)) * (state.speed >= 0 ? 1 : -1);
      state.heading += state.steer * turn * dt;

      const dx = Math.cos(state.heading) * state.speed * dt;
      const dz = Math.sin(state.heading) * state.speed * dt;
      let nx = state.x + dx, nz = state.z + dz;
      const okNow = navigable(nx, nz);
      const bowX = nx + Math.cos(state.heading) * 3.6;
      const bowZ = nz + Math.sin(state.heading) * 3.6;
      const okBow = navigable(bowX, bowZ);
      if (okNow && okBow) {
        state.x = nx; state.z = nz;
      } else {
        // 试着沿岸滑
        if (navigable(state.x + dx, state.z) && navigable(state.x + dx + Math.cos(state.heading) * 3.6, state.z)) state.x += dx;
        else if (navigable(state.x, state.z + dz) && navigable(state.x, state.z + dz + Math.sin(state.heading) * 3.6)) state.z += dz;
        state.speed *= 0.32;
        state.shake = Math.min(1, state.shake + 0.85);
        state.collisions++;
      }

      state.bob += dt * (1.6 + sp * 0.02);
      const bobY = Math.sin(state.bob * 1.7) * 0.055 + Math.sin(state.bob * 2.9) * 0.03;
      const targetPitch = -sp * 0.0016 + (state.boosting ? -0.02 : 0);
      const targetRoll = -state.steer * 0.055 * Math.min(1, sp / 30);
      state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 3);
      state.roll += (targetRoll - state.roll) * Math.min(1, dt * 4);

      group.position.set(state.x, bobY, state.z);
      group.rotation.set(state.pitch, -state.heading, state.roll);

      // 尾迹点
      state.wakeTimer += dt;
      const last = state.wakeHist[state.wakeHist.length - 1];
      if (!last || Math.hypot(state.x - last.x, state.z - last.z) > 2.4) {
        state.wakeHist.push({ x: state.x, z: state.z, t: 0 });
        if (state.wakeHist.length > MAXW - 2) state.wakeHist.shift();
      }
      for (const w of state.wakeHist) w.t += dt;
      while (state.wakeHist.length && state.wakeHist[0].t > 7.5) state.wakeHist.shift();

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
          const width = (1.4 + age * 2.2) * (state.boosting ? 1.18 : 1);
          const alpha = Math.max(0, 1 - age / 7.5) * Math.min(1, age * 3.5);
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

      // 水花
      const sprayAmt = Math.min(1, sp / 40);
      if (sp > 12 && Math.random() < sprayAmt * 0.9) {
        const p = parts[state.count % N]; state.count++;
        const side = Math.random() < .5 ? 1 : -1;
        const rx = -Math.sin(state.heading), rz = Math.cos(state.heading);
        p.life = 0.5 + Math.random() * 0.5;
        p.x = state.x + Math.cos(state.heading) * 1.4 + rx * side * 1.9;
        p.z = state.z + Math.sin(state.heading) * 1.4 + rz * side * 1.9;
        p.y = 0.45;
        p.vx = Math.cos(state.heading) * state.speed * 0.35 + rx * side * (3 + Math.random() * 5);
        p.vz = Math.sin(state.heading) * state.speed * 0.35 + rz * side * (3 + Math.random() * 5);
        p.vy = 3.2 + Math.random() * 4.5 + sprayAmt * 3.5;
      }
      for (let i = 0; i < N; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= 12 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0) { p.y = 0; p.vy = 0; p.vx *= .6; p.vz *= .6; }
          sp[i * 3] = p.x; sp[i * 3 + 1] = p.y; sp[i * 3 + 2] = p.z;
          salpha[i] = Math.max(0, Math.min(1, p.life * 1.6));
        } else {
          salpha[i] = 0;
        }
      }
      sg.attributes.position.needsUpdate = true;
      sg.attributes.aA.needsUpdate = true;

      state.shake = Math.max(0, state.shake - dt * 1.8);
    };

    // 相机
    B.applyCamera = function (camera, t) {
      const sp = Math.abs(state.speed);
      const speedK = Math.min(1, sp / 60);
      const fov = 70 + speedK * 18 + (state.boosting ? 5 : 0);
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }

      const fx = Math.cos(state.heading), fz = Math.sin(state.heading);
      const rx = -fz, rz = fx;
      const shake = state.shake * 0.9 + speedK * 0.06;
      const sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake * .7;
      const bob = Math.sin(state.bob * 1.9) * 0.035 + Math.sin(state.bob * 3.1) * 0.018;

      camera.position.set(
        state.x - fx * 0.5 + rx * sx,
        1.86 + bob + sy + state.pitch * 2,
        state.z - fz * 0.5 + rz * sx
      );
      const lookX = state.x + fx * 40 + rx * sx * 2;
      const lookZ = state.z + fz * 40 + rz * sx * 2;
      camera.up.set(0, 1, 0);
      camera.lookAt(lookX, 1.55 + bob * .5 - state.pitch * 12, lookZ);
      camera.rotation.z += state.roll * 0.55;
    };

    return B;
  };

  return B;
})();
