/* 烟雨天气：阴雨天空、雾、柔光、雨丝、湖面雾带 */
window.Weather = (function () {
  const W = {};
  const uTime = { value: 0 };
  let rain = null, rainCount = 0, rainMat = null;
  const mists = [];

  W.sunDir = null;

  W.build = function (scene, renderer, tier) {
    const C = CFG.weather;

    scene.fog = new THREE.FogExp2(C.fog, C.fogDensity);
    scene.background = new THREE.Color(C.fog);

    // ---- 光照 ----
    const hemi = new THREE.HemisphereLight(C.hemiSky, C.hemiGround, C.hemiIntensity);
    scene.add(hemi);
    const sunDir = new THREE.Vector3(C.sunDir[0], C.sunDir[1], C.sunDir[2]).normalize();
    W.sunDir = sunDir;
    const sun = new THREE.DirectionalLight(C.sunColor, C.sunIntensity);
    sun.position.copy(sunDir).multiplyScalar(1000);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(C.fillColor, C.fillIntensity);
    fill.position.set(500, 380, 700);
    scene.add(fill);
    const amb = new THREE.AmbientLight(0x85908c, 0.55);        // 背光坡面兜底，杜绝纯黑
    scene.add(amb);

    // ---- 天空球 ----
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(C.zenith) },
        uMid: { value: new THREE.Color(C.mid) },
        uHorizon: { value: new THREE.Color(C.horizon) },
        uCloudLight: { value: new THREE.Color(C.cloudLight) },
        uCloudDark: { value: new THREE.Color(C.cloudDark) },
        uTime: uTime
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uZenith,uMid,uHorizon,uCloudLight,uCloudDark; uniform float uTime;
        float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float vn(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),u.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),u.x),u.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=vn(p)*a; p*=2.03; a*=0.5; } return s; }
        void main(){
          float h=clamp(vDir.y,-0.05,1.0);
          vec3 col=mix(uHorizon,uMid,smoothstep(0.0,0.28,h));
          col=mix(col,uZenith,smoothstep(0.20,0.85,h));
          vec2 cp=vDir.xz/max(vDir.y+0.18,0.06);
          float n=fbm(cp*0.40+vec2(uTime*0.0045,uTime*0.003));
          float cov=smoothstep(0.40,0.72,n);
          float n2=fbm(cp*0.85+vec2(uTime*0.007,-uTime*0.004));
          vec3 cloud=mix(uCloudLight,uCloudDark,clamp(n2*1.15,0.0,1.0));
          float k=smoothstep(0.02,0.20,h)*cov;
          col=mix(col,cloud,k*0.94);
          col=mix(col,uHorizon,exp(-max(h,0.0)*8.0)*0.30);
          gl_FragColor=vec4(col,1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 30), skyMat);
    sky.renderOrder = -100;
    scene.add(sky);
    W.sky = sky;

    // ---- 环境贴图（供湿面反光） ----
    try {
      const ec = UTIL.canvas(128, 64), eg = ec.getContext('2d');
      const gr = eg.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, '#5f7178'); gr.addColorStop(0.55, '#93a3a3'); gr.addColorStop(1, '#c7cfc8');
      eg.fillStyle = gr; eg.fillRect(0, 0, 128, 64);
      const et = new THREE.CanvasTexture(ec);
      et.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(et).texture;
      pm.dispose(); et.dispose();
    } catch (e) { /* 环境贴图失败不致命 */ }

    // ---- 雨 ----
    rainCount = tier.rain;
    if (rainCount > 0) {
      const n = rainCount;
      const pos = new Float32Array(n * 6);
      const aEnd = new Float32Array(n * 2);
      const aSpeed = new Float32Array(n * 2);
      const rr = UTIL.rng(77);
      for (let i = 0; i < n; i++) {
        const x = (rr() - 0.5) * 64, y = rr() * 30, z = (rr() - 0.5) * 64;
        const sp = 19 + rr() * 11, len = 0.5 + rr() * 0.6;
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z;
        aEnd[i * 2] = 0; aEnd[i * 2 + 1] = len;
        aSpeed[i * 2] = aSpeed[i * 2 + 1] = sp;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 1));
      g.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
      rainMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: uTime },
        vertexShader: `
          uniform float uTime; attribute float aEnd, aSpeed; varying float vA;
          void main(){
            float yy = mod(position.y - uTime*aSpeed, 30.0);
            vec3 p = vec3(position.x + yy*0.30, yy, position.z);
            p.x += aEnd*0.30; p.y += aEnd;
            vec4 mv = modelViewMatrix * vec4(p,1.0);
            vA = smoothstep(55.0, 8.0, -mv.z) * 0.5 + 0.06;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying float vA;
          void main(){ gl_FragColor = vec4(0.82,0.88,0.89, vA*0.36); }`
      });
      rain = new THREE.LineSegments(g, rainMat);
      rain.frustumCulled = false;
      rain.renderOrder = 7;
      scene.add(rain);
    }

    // ---- 湖面雾带 ----
    const mistTex = Textures.get('mist');
    const nm = tier.mist;
    const rr2 = UTIL.rng(913);
    for (let i = 0; i < nm; i++) {
      const m = new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.10 + rr2() * 0.10, fog: false });
      const s = new THREE.Sprite(m);
      const a = rr2() * 6.283, r = 300 + rr2() * 1500;
      s.position.set(Math.cos(a) * r, 8 + rr2() * 30, Math.sin(a) * r);
      s.scale.set(600 + rr2() * 700, 90 + rr2() * 110, 1);
      s.renderOrder = 6;
      scene.add(s);
      mists.push({ s, vx: (rr2() - 0.5) * 1.4, vy: (rr2() - 0.5) * 0.4, a, r });
    }
  };

  W.update = function (dt, camera) {
    uTime.value += dt;
    if (rain && camera) {
      const cx = Math.round(camera.position.x / 10) * 10;
      const cz = Math.round(camera.position.z / 10) * 10;
      rain.position.set(cx, 0, cz);
    }
    for (const m of mists) {
      m.a += m.vx * dt * 0.0004;
      m.s.position.x += Math.cos(m.a) * m.vx * dt * 0.4;
      m.s.position.z += Math.sin(m.a) * m.vx * dt * 0.4;
      m.s.position.y += m.vy * dt;
      if (m.s.position.y > 44) m.s.position.y = 8;
      if (m.s.position.y < 6) m.s.position.y = 40;
    }
  };

  W.setRainCount = function (n) {
    if (!rain) return;
    // 简化：直接整体隐藏/显示，重建代价高
    rain.visible = n > 0;
  };

  return W;
})();
