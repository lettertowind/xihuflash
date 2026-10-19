/* 水面：浑绿水色、平面反射、雨点涟漪、岸线泡沫、船迹 */
window.Water = (function () {
  const W = {};
  let scene, renderer, course, terrain, tier;
  let base, patch, baseMat, patchMat;
  let rt = null, virtualCam = null, texMatrix = new THREE.Matrix4();
  let uTime = { value: 0 };
  let reflectAcc = 0;
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.12);
  const boatsU = [];
  for (let i = 0; i < 8; i++) boatsU.push(new THREE.Vector4(0, 0, 0, 0));

  const FRAG = `
    uniform float uTime,uFogDensity,uFoamW,uRain,uHasRefl,uIsPatch,uShoreSpan;
    uniform vec3 uDeep,uShallow,uSilt,uFog,uSunDir,uZenith,uHorizon;
    uniform vec2 uShoreXY;
    uniform sampler2D uNormalA,uNormalB,uFoamSDF,uFoamTex,uReflect;
    uniform vec4 uBoats[8]; uniform int uBoatCount;
    uniform mat4 uTexMatrix;
    varying vec3 vWorld; varying float vEdge;
    float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    vec2 ripple(vec2 p, float t){
      vec2 acc=vec2(0.0);
      for(int k=0;k<2;k++){
        vec2 q=p*(0.85+float(k)*0.75)+float(k)*31.7;
        vec2 cell=floor(q); vec2 f=fract(q)-0.5;
        float h=hash21(cell);
        float ph=fract(t*0.65+h*7.0);
        float r=length(f);
        float ring=smoothstep(0.40,0.0,abs(r-ph*0.45))*(1.0-ph);
        acc+=(f/max(r,1e-4))*ring;
      }
      return acc;
    }
    float wakeFoam(vec2 p){
      float s=0.0;
      for(int i=0;i<8;i++){
        if(i>=uBoatCount) break;
        vec4 b=uBoats[i];
        vec2 rel=p-b.xy;
        vec2 fwd=vec2(cos(b.z),sin(b.z));
        float along=dot(rel,fwd);
        float lat=dot(rel,vec2(-fwd.y,fwd.x));
        float behind=clamp(-along/(24.0+22.0*b.w),0.0,1.0);
        if(behind<=0.0) continue;
        float w=(0.9+behind*3.6)*(0.8+0.7*b.w);
        float fo=exp(-pow(abs(lat)/w,1.6))*behind*b.w;
        s+=fo*(0.55+0.45*sin(uTime*2.2+along*0.5));
      }
      return s;
    }
    void main(){
      vec2 p=vWorld.xz;
      vec2 suv=(p-uShoreXY)/uShoreSpan;
      float sd=(texture2D(uFoamSDF,clamp(suv,0.001,0.999)).r-0.5)*48.0;
      if(uIsPatch>0.5 && sd<0.45) discard;
      float distToCam=length(cameraPosition-vWorld);
      float hi=exp(-distToCam*0.0045);
      vec3 n1=texture2D(uNormalA,p*0.012+vec2(uTime*0.010,uTime*0.006)).xyz*2.0-1.0;
      vec3 n2=texture2D(uNormalB,p*0.035-vec2(uTime*0.013,uTime*0.009)).xyz*2.0-1.0;
      vec3 n3=texture2D(uNormalA,p*0.085+vec2(uTime*0.022,-uTime*0.018)).xyz*2.0-1.0;
      vec2 rp=ripple(p,uTime)*(0.30+0.70*uRain);
      vec3 n=normalize(vec3(
        (n1.x*0.50+n2.x*0.33+n3.x*0.22)*hi+rp.x, 1.0,
        (n1.y*0.50+n2.y*0.33+n3.y*0.22)*hi+rp.y));
      vec3 V=normalize(cameraPosition-vWorld);
      float fres=pow(1.0-clamp(dot(V,n),0.0,1.0),4.0);
      fres=mix(0.03,0.75,fres);
      vec3 refl;
      if(uHasRefl>0.5){
        vec4 uv4=uTexMatrix*vec4(vWorld,1.0);
        vec2 ruv=uv4.xy/uv4.w+n.xz*0.028;
        vec3 r0=texture2D(uReflect,clamp(ruv,0.002,0.998)).rgb;
        vec3 r1=texture2D(uReflect,clamp(ruv+vec2(0.004,0.0),0.002,0.998)).rgb;
        vec3 r2=texture2D(uReflect,clamp(ruv-vec2(0.0,0.004),0.002,0.998)).rgb;
        refl=(r0+r1+r2)*0.31;
      } else {
        refl=mix(uHorizon,uZenith,clamp(0.35+n.y*0.28,0.0,1.0))*0.9;
      }
      vec3 baseC=mix(uShallow,uDeep,clamp(0.45+n.x*0.18,0.0,1.0));
      baseC=mix(baseC,uSilt,1.0-smoothstep(0.5,7.0,abs(sd)));
      vec3 col=mix(baseC,refl,clamp(fres,0.0,0.85));
      vec3 Hv=normalize(uSunDir+V);
      col+=vec3(0.88,0.93,0.95)*pow(max(dot(n,Hv),0.0),60.0)*0.10;
      float foamN=texture2D(uFoamTex,p*0.045+vec2(uTime*0.012,uTime*0.007)).r;
      float shoreFoam=(1.0-smoothstep(0.4,uFoamW,abs(sd)))*(0.40+0.60*foamN)*(0.55+0.45*sin(uTime*1.4+sd*2.2+p.x*0.045));
      float wf=wakeFoam(p);
      float foam=clamp(shoreFoam*0.75+wf*1.25,0.0,1.0);
      col=mix(col,vec3(0.87,0.91,0.91),foam*0.72);
      float f=1.0-exp(-uFogDensity*uFogDensity*distToCam*distToCam);
      col=mix(col,uFog,clamp(f,0.0,1.0));
      gl_FragColor=vec4(col,vEdge);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;

  function makeUniforms() {
    const C = CFG.water, Wt = CFG.weather;
    return {
      uTime: uTime,
      uFogDensity: { value: Wt.fogDensity },
      uFoamW: { value: C.foam },
      uRain: { value: 1 },
      uHasRefl: { value: 0 },
      uIsPatch: { value: 0 },
      uDeep: { value: new THREE.Color(C.deep) },
      uShallow: { value: new THREE.Color(C.shallow) },
      uSilt: { value: new THREE.Color(C.silt) },
      uFog: { value: new THREE.Color(Wt.fog) },
      uSunDir: { value: Weather.sunDir.clone() },
      uZenith: { value: new THREE.Color(Wt.zenith) },
      uHorizon: { value: new THREE.Color(Wt.horizon) },
      uNormalA: { value: Textures.get('waterA') },
      uNormalB: { value: Textures.get('waterB') },
      uFoamSDF: { value: null },
      uFoamTex: { value: Textures.get('foam') },
      uReflect: { value: null },
      uBoats: { value: boatsU },
      uBoatCount: { value: 0 },
      uTexMatrix: { value: texMatrix },
      uShoreXY: { value: new THREE.Vector2(0, 0) },
      uShoreSpan: { value: 1 }
    };
  }

  W.build = function (sc, rd, c, ter, tr) {
    scene = sc; renderer = rd; course = c; terrain = ter; tier = tr;
    const U = UTIL;

    // ---- 泡沫/登陆判定用窄范围 SDF 贴图 ----
    const grid = terrain.sdfGrid();
    const S = grid.size;
    const fc = UTIL.canvas(S, S), fg = fc.getContext('2d');
    const img = fg.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = UTIL.clamp((grid.data[i] + 24) / 48, 0, 1);
      img.data[i * 4] = v * 255; img.data[i * 4 + 1] = v * 255; img.data[i * 4 + 2] = v * 255; img.data[i * 4 + 3] = 255;
    }
    fg.putImageData(img, 0, 0);
    const foamSDF = UTIL.tex(fc, { srgb: false, wrap: 'clamp', aniso: 1 });

    // ---- 基础水面（精确岸线） ----
    const shape = new THREE.Shape();
    course.water.forEach((p, i) => i ? shape.lineTo(p[0], -p[1]) : shape.moveTo(p[0], -p[1]));
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape, 2);
    geo.rotateX(-Math.PI / 2);
    baseMat = new THREE.ShaderMaterial({
      uniforms: makeUniforms(),
      vertexShader: `varying vec3 vWorld; varying float vEdge;
        void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vWorld=wp.xyz; vEdge=1.0;
        gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: FRAG
    });
    baseMat.uniforms.uFoamSDF.value = foamSDF;
    baseMat.uniforms.uShoreXY.value.set(grid.x0, grid.z0);
    baseMat.uniforms.uShoreSpan.value = grid.span;
    base = new THREE.Mesh(geo, baseMat);
    base.renderOrder = 1;
    scene.add(base);

    // ---- 近场波面 ----
    if (tier.patchSeg > 0) {
      const pg = new THREE.PlaneGeometry(CFG.water.patch, CFG.water.patch, tier.patchSeg, tier.patchSeg);
      pg.rotateX(-Math.PI / 2);
      patchMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: makeUniforms(),
        vertexShader: `
          uniform float uTime; uniform vec3 uCenter;
          varying vec3 vWorld; varying float vEdge;
          void main(){
            vec4 wp=modelMatrix*vec4(position,1.0);
            float r=distance(wp.xz,uCenter.xz);
            float edge=1.0-smoothstep(68.0,112.0,r);
            vec2 p=wp.xz;
            float w=sin(p.x*0.13+uTime*1.5)*0.045+sin(p.y*0.11-uTime*1.2)*0.04+sin((p.x+p.y)*0.055+uTime*0.8)*0.05;
            wp.y+=w*edge;
            vWorld=wp.xyz; vEdge=edge;
            gl_Position=projectionMatrix*viewMatrix*wp;
          }`,
        fragmentShader: FRAG
      });
      patchMat.uniforms.uFoamSDF.value = foamSDF;
      patchMat.uniforms.uShoreXY.value.set(grid.x0, grid.z0);
      patchMat.uniforms.uShoreSpan.value = grid.span;
      patchMat.uniforms.uIsPatch.value = 1;
      patchMat.uniforms.uCenter = { value: new THREE.Vector3() };
      patch = new THREE.Mesh(pg, patchMat);
      patch.renderOrder = 2;
      patch.frustumCulled = false;
      scene.add(patch);
    }

    // ---- 反射 ----
    if (tier.reflect) {
      const RS = CFG.water.reflectSize;
      rt = new THREE.WebGLRenderTarget(RS, RS, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
      baseMat.uniforms.uReflect.value = rt.texture;
      if (patchMat) patchMat.uniforms.uReflect.value = rt.texture;
      baseMat.uniforms.uHasRefl.value = 1;
      if (patchMat) patchMat.uniforms.uHasRefl.value = 1;
      virtualCam = new THREE.PerspectiveCamera();
    }

    W.water = base;
    return W;
  };

  W.markReflective = function (obj) {
    obj.traverse(o => { o.layers.enable(1); });
  };

  function updateReflection(camera) {
    const normal = new THREE.Vector3(0, 1, 0);
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const viewV = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), camPos).reflect(normal).negate().add(new THREE.Vector3(0, 0, 0));
    const lookAt = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camPos);
    const targetV = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), lookAt).reflect(normal).negate().add(new THREE.Vector3(0, 0, 0));
    virtualCam.position.copy(viewV);
    virtualCam.up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(normal);
    virtualCam.lookAt(targetV);
    virtualCam.far = camera.far;
    virtualCam.fov = camera.fov;
    virtualCam.aspect = camera.aspect;
    virtualCam.updateProjectionMatrix();
    virtualCam.updateMatrixWorld();
    virtualCam.layers.set(1);
    const tm = new THREE.Matrix4().set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1
    );
    tm.multiply(virtualCam.projectionMatrix);
    tm.multiply(virtualCam.matrixWorldInverse);
    texMatrix.copy(tm);

    base.visible = false;
    if (patch) patch.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.clippingPlanes = [clipPlane];
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, virtualCam);
    renderer.setRenderTarget(prev);
    renderer.clippingPlanes = [];
    base.visible = true;
    if (patch) patch.visible = true;
  }

  W.setBoats = function (list) {
    const mats = [baseMat, patchMat];
    let n = 0;
    for (let i = 0; i < list.length && n < 8; i++) {
      const b = list[i];
      if (!b || b.w <= 0) continue;
      boatsU[n].set(b.x, b.z, b.heading, b.w);
      n++;
    }
    for (const m of mats) if (m) m.uniforms.uBoatCount.value = n;
  };

  W.update = function (dt, camera, boats) {
    uTime.value += dt;
    if (boats) W.setBoats(boats);
    if (patch) {
      const b = boats && boats[0];
      if (b) {
        patch.position.set(Math.round(b.x / 4) * 4, 0.035, Math.round(b.z / 4) * 4);
        patchMat.uniforms.uCenter.value.set(patch.position.x, 0, patch.position.z);
      }
    }
    if (rt && virtualCam) {
      reflectAcc += dt;
      const hz = 1 / CFG.water.reflectHz;
      if (reflectAcc >= hz) { reflectAcc = 0; updateReflection(camera); }
    }
  };

  W.rebuildTargets = function () {
    if (!tier.reflect) return;
    if (rt) rt.dispose();
    const RS = CFG.water.reflectSize;
    rt = new THREE.WebGLRenderTarget(RS, RS, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
    baseMat.uniforms.uReflect.value = rt.texture;
    if (patchMat) patchMat.uniforms.uReflect.value = rt.texture;
  };

  W.setReflect = function (on) {
    if (baseMat) baseMat.uniforms.uHasRefl.value = on ? 1 : 0;
    if (patchMat) patchMat.uniforms.uHasRefl.value = on ? 1 : 0;
  };

  return W;
})();
