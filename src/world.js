import * as THREE from 'three';

export const ARENA = 44;

/* ---------- tiny deterministic noise ---------- */
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------- collision AABBs ---------- */
export const colliders = [];
export function addCollider(cx, cz, hx, hz, top = 4, tag = 'solid') {
  colliders.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, top, tag });
}

export function rayAABB(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT;
  const axes = [[ox, dx, b.minX, b.maxX], [oy, dy, 0, b.top], [oz, dz, b.minZ, b.maxZ]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-7) { if (o < lo || o > hi) return -1; }
    else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

export function rayHitWorld(origin, dir, maxDist = 200) {
  let best = maxDist, point = null;
  for (const c of colliders) {
    const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, c, best);
    if (t >= 0 && t < best) {
      best = t;
      point = new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    }
  }
  return point ? { dist: best, point } : null;
}

/* ---------- geometry helpers ---------- */
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x10464a, emissive: 0x0b5c58, emissiveIntensity: 0.4,
  metalness: 0.5, roughness: 0.1, transparent: true, opacity: 0.42,
  side: THREE.DoubleSide
});
const frameMat = new THREE.MeshStandardMaterial({ color: 0x10262b, emissive: 0x061d21, emissiveIntensity: 0.35, metalness: 0.62, roughness: 0.48 });
const glowTeal = new THREE.MeshBasicMaterial({ color: 0x6ef7dd });
const glowPink = new THREE.MeshBasicMaterial({ color: 0xff5f9d });
const glowAmber = new THREE.MeshBasicMaterial({ color: 0xffb066 });

const crateMat = new THREE.MeshStandardMaterial({ color: 0x1a3a40, emissive: 0x0a2a30, emissiveIntensity: 0.55, metalness: 0.45, roughness: 0.55 });
const crateTop = new THREE.MeshStandardMaterial({ color: 0x2b4d52, emissive: 0x0d3034, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.4 });
const paneMat = new THREE.MeshStandardMaterial({
  color: 0x103b3c, emissive: 0x0d5752, emissiveIntensity: 0.5,
  metalness: 0.4, roughness: 0.12, transparent: true, opacity: 0.45, side: THREE.DoubleSide
});

function makeCrate(scene, x, z, size, height, accent = 0x66f5da, rot = 0) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(size, height, size), crateMat);
  base.position.y = height / 2;
  base.castShadow = true; base.receiveShadow = true;
  g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(size * 0.94, 0.04, size * 0.94), crateTop);
  top.position.y = height + 0.01;
  g.add(top);
  const topPane = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.62, size * 0.62).rotateX(-Math.PI / 2), paneMat);
  topPane.position.y = height + 0.035;
  g.add(topPane);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.35, size * 1.35).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false })
  );
  ground.position.y = 0.015;
  g.add(ground);
  const mat = new THREE.MeshBasicMaterial({ color: accent });
  // glass panes on each face
  const paneGeo = new THREE.PlaneGeometry(size * 0.7, height * 0.56);
  for (let i = 0; i < 4; i++) {
    const pane = new THREE.Mesh(paneGeo, paneMat);
    const a = i * Math.PI / 2;
    pane.position.set(Math.sin(a) * (size / 2 + 0.012), height * 0.52, Math.cos(a) * (size / 2 + 0.012));
    pane.rotation.y = a;
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.045, height * 0.52, 0.025), frameMat);
    mull.position.z = 0.012;
    pane.add(mull);
    const mull2 = new THREE.Mesh(new THREE.BoxGeometry(size * 0.52, 0.045, 0.025), frameMat);
    mull2.position.z = 0.012;
    pane.add(mull2);
    const spark = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.03), mat);
    spark.position.set(0, height * 0.17, 0.022);
    pane.add(spark);
    g.add(pane);
  }
  // inner glowing core
  const inner = new THREE.Mesh(new THREE.BoxGeometry(size * 0.22, height * 0.2, size * 0.22), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8 }));
  inner.position.y = height * 0.52;
  g.add(inner);
  for (const sx of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, height * 0.62, 0.07), mat);
    strip.position.set(sx * size * 0.505, height * 0.52, 0);
    g.add(strip);
    const strip2 = strip.clone(); strip2.position.z = sx * size * 0.505; strip2.position.x = 0; g.add(strip2);
  }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(size * 0.4, 0.06, size * 0.4), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5 }));
  cap.position.y = height + 0.03;
  g.add(cap);
  for (const s of [-1, 1]) {
    const ex = new THREE.Mesh(new THREE.BoxGeometry(size, 0.035, 0.035), mat);
    ex.position.set(0, height - 0.05, s * size / 2); g.add(ex);
    const ez = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, size), mat);
    ez.position.set(s * size / 2, height - 0.05, 0); g.add(ez);
  }
  g.position.set(x, 0, z); g.rotation.y = rot;
  scene.add(g);
  addCollider(x, z, size / 2 + 0.15, size / 2 + 0.15, height, 'crate');
  return g;
}

function makePillar(scene, x, z, w, h, accent = 0x69f8e2) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), frameMat);
  body.position.y = h / 2; body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, h * 0.82, w * 0.62), glassMat);
  glass.position.y = h / 2; g.add(glass);
  const mat = new THREE.MeshBasicMaterial({ color: accent });
  for (let i = 0; i < 4; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, 0.05, 0.05), mat);
    strip.position.set(0, h * (0.2 + i * 0.19), w * 0.32); g.add(strip);
    const s2 = strip.clone(); s2.position.z = -w * 0.32; g.add(s2);
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(w * 0.85, 0.035, 6, 4), mat);
  halo.rotation.x = Math.PI / 2; halo.position.y = h + 0.2; g.add(halo);
  g.position.set(x, 0, z);
  scene.add(g);
  addCollider(x, z, w / 2 + 0.1, w / 2 + 0.1, h, 'pillar');
  return g;
}

/* ---------- shader sky ---------- */
function makeSky(scene) {
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=0.5;} return v; }
      void main(){
        vec3 d = normalize(vP);
        float y = d.y;
        vec3 top = vec3(0.006,0.026,0.043);
        vec3 mid = vec3(0.012,0.085,0.098);
        vec3 low = vec3(0.045,0.015,0.055);
        vec3 col = mix(low, mid, smoothstep(-0.45,0.12,y));
        col = mix(col, top, smoothstep(0.12,0.85,y));
        // aurora ribbons
        float band = fbm(vec2(atan(d.z,d.x)*1.7 + uTime*0.02, y*3.2));
        float aur = smoothstep(0.58,0.96,band) * smoothstep(-0.05,0.7,y) * 0.45;
        col += vec3(0.05,0.55,0.44)*aur;
        float band2 = fbm(vec2(atan(d.z,d.x)*2.6 - uTime*0.014 + 8.0, y*2.1+3.0));
        col += vec3(0.45,0.06,0.32)*smoothstep(0.62,0.98,band2)*smoothstep(-0.1,0.5,y)*0.3;
        // stars
        vec2 sp = d.xz / max(0.18, d.y + 0.45);
        float st = step(0.9985, h(floor(sp*260.0)));
        col += vec3(0.7,1.0,0.95)*st*smoothstep(0.0,0.35,y)*0.55;
        // horizon glow
        col += vec3(0.02,0.34,0.30)*pow(1.0-abs(y),22.0)*0.8;
        gl_FragColor = vec4(col,1.0);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 40, 24), mat);
  sky.renderOrder = -10;
  scene.add(sky);
  return { mesh: sky, uniforms };
}

/* ---------- floor shader ---------- */
function makeFloor(scene) {
  const uniforms = { uTime: { value: 0 }, uPulse: { value: 0 }, uPulsePos: { value: new THREE.Vector2(0, 0) } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, uniforms,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform float uTime; uniform float uPulse; uniform vec2 uPulsePos;
      varying vec2 vUv; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float grid(vec2 p, float w){ vec2 g=abs(fract(p-0.5)-0.5)/fwidth(p); return 1.0-min(min(g.x,g.y),1.0); }
      void main(){
        vec2 p = vW.xz;
        float r = length(p);
        float angular = atan(p.y,p.x);
        vec3 base = vec3(0.012,0.042,0.048);
        // large tile grid
        float g1 = grid(p*0.5, 1.0);
        float g2 = grid(p*0.125, 1.0);
        // rings
        float rings = smoothstep(0.965,1.0,sin(r*2.2 - uTime*0.55)*0.5+0.5);
        float ring2 = smoothstep(0.985,1.0,sin(r*0.55+uTime*0.2)*0.5+0.5);
        // energy pulse ring
        float d = distance(p, uPulsePos);
        float pulse = uPulse * smoothstep(0.9,0.0,abs(d - (1.0-uPulse)*70.0)) * 1.8;
        // fractured seams
        float n = hash(floor(p*0.9));
        float seam = smoothstep(0.04,0.0,abs(fract(p.x*0.19 + sin(p.y*0.21)*0.7)-0.5))*smoothstep(0.5,0.9,n);
        vec3 col = base;
        col += vec3(0.16,0.86,0.78) * (g1*0.18 + g2*0.12);
        col += vec3(0.15,0.72,0.75) * rings*0.38;
        col += vec3(0.5,0.16,0.52) * ring2*0.3;
        col += vec3(0.3,1.0,0.9) * seam*0.24;
        col += vec3(0.3,1.0,0.9) * pulse;
        col *= smoothstep(62.0, 26.0, r);
        float alpha = smoothstep(62.0, 30.0, r) * 0.98;
        gl_FragColor = vec4(col, alpha);
      }`
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(64, 96).rotateX(-Math.PI / 2), mat);
  floor.position.y = 0;
  scene.add(floor);
  // solid under-floor to mask the void
  const under = new THREE.Mesh(new THREE.CircleGeometry(120, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x02090c }));
  under.position.y = -0.06;
  scene.add(under);
  return { mesh: floor, uniforms };
}

/* ---------- animated shard field ---------- */
function makeShards(scene) {
  const count = 110;
  const geo = new THREE.OctahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a8f92, emissive: 0x1b8a86, emissiveIntensity: 1.4,
    metalness: 0.7, roughness: 0.2, transparent: true, opacity: 0.8,
    flatShading: true
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const data = [];
  const c = new THREE.Color();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 12 + Math.random() * 46;
    data.push({
      x: Math.cos(ang) * rad, z: Math.sin(ang) * rad,
      y: 9 + Math.random() * 30,
      speed: 0.15 + Math.random() * 0.5,
      rot: Math.random() * 6, rotSpeed: (Math.random() - 0.5) * 0.7,
      scale: 0.12 + Math.random() * 0.45
    });
    c.setHSL(Math.random() < 0.72 ? 0.47 + Math.random() * 0.06 : 0.9 + Math.random() * 0.05, 0.8, 0.55);
    inst.setColorAt(i, c);
  }
  scene.add(inst);
  const tmpC = new THREE.Color();
  return {
    update(t, dt) {
      for (let i = 0; i < count; i++) {
        const d = data[i];
        d.y += d.speed * dt;
        if (d.y > 46) { d.y = 8.5; }
        d.rot += d.rotSpeed * dt;
        p.set(d.x, d.y, d.z);
        e.set(d.rot * 0.7, d.rot, d.rot * 0.4);
        q.setFromEuler(e);
        s.setScalar(d.scale);
        m.compose(p, q, s);
        inst.setMatrixAt(i, m);
        tmpC.setHSL(0.48 + Math.sin(t * 0.5 + i) * 0.03, 0.8, 0.55);
        inst.setColorAt(i, tmpC);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  };
}

/* ---------- central prism obelisk ---------- */
function makeObelisk(scene) {
  const g = new THREE.Group();
  g.position.set(0, 14, 0);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x63d8c4, emissive: 0x1f9e8b, emissiveIntensity: 0.9,
    metalness: 0.35, roughness: 0.18, flatShading: true,
    transparent: true, opacity: 0.92
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 0), coreMat);
  g.add(core);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(4.4, 0), new THREE.MeshBasicMaterial({
    color: 0x55ffe0, wireframe: true, transparent: true, opacity: 0.3
  }));
  g.add(shell);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const rm = new THREE.MeshBasicMaterial({ color: i === 1 ? 0xff6e9e : 0x68f6dc, transparent: true, opacity: 0.55 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6 + i * 1.7, 0.05, 6, 96), rm);
    ring.rotation.x = Math.PI / 2 + i * 0.5;
    ring.rotation.z = i * 0.4;
    g.add(ring); rings.push(ring);
  }
  const light = new THREE.PointLight(0x54ffe0, 32, 55, 1.7);
  g.add(light);
  const light2 = new THREE.PointLight(0xff5fa2, 20, 40, 1.8);
  light2.position.set(6, -4, 3);
  g.add(light2);
  scene.add(g);
  return {
    update(t, dt, power = 1) {
      core.rotation.y += dt * 0.25; core.rotation.x += dt * 0.1;
      shell.rotation.y -= dt * 0.35; shell.rotation.z += dt * 0.12;
      rings[0].rotation.z += dt * 0.3;
      rings[1].rotation.y += dt * 0.5;
      rings[2].rotation.x += dt * 0.22;
      light.intensity = 26 + Math.sin(t * 2.1) * 7 * power;
      coreMat.emissiveIntensity = 0.8 + Math.sin(t * 1.4) * 0.2;
    }
  };
}

/* ---------- light ribbons ---------- */
function makeBeams(scene) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ float a = smoothstep(0.0,0.35,vUv.y)*(1.0-vUv.y); a *= 0.6+0.4*sin(vUv.y*12.0 - uTime*1.5 + vUv.x*3.0);
        vec3 c = mix(vec3(0.1,0.9,0.8), vec3(0.9,0.2,0.6), vUv.x);
        gl_FragColor = vec4(c, a*0.09); }`
  });
  for (let i = 0; i < 8; i++) {
    const ang = i / 8 * Math.PI * 2 + 0.3;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5 + Math.random() * 4, 48), mat);
    mesh.position.set(Math.cos(ang) * (26 + Math.random() * 14), 32, Math.sin(ang) * (26 + Math.random() * 14));
    mesh.rotation.y = -ang + Math.PI / 2;
    group.add(mesh);
  }
  scene.add(group);
  return { update(t) { mat.uniforms.uTime.value = t; } };
}

/* ---------- drifting motes ---------- */
function makeMotes(scene) {
  const n = 520;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 50;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 26;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0x9affe8, size: 0.09, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return {
    update(t, dt) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        p[i * 3 + 1] += (0.15 + seed[i] * 0.5) * dt;
        p[i * 3] += Math.sin(t * 0.4 + seed[i] * 20) * 0.05 * dt * 10;
        if (p[i * 3 + 1] > 27) p[i * 3 + 1] = 0.1;
      }
      geo.attributes.position.needsUpdate = true;
    }
  };
}

/* ---------- main ---------- */
export function buildWorld(scene) {
  scene.fog = new THREE.FogExp2(0x041318, 0.0125);
  const sky = makeSky(scene);
  const floor = makeFloor(scene);
  const shards = makeShards(scene);
  const obelisk = makeObelisk(scene);
  const beams = makeBeams(scene);
  const motes = makeMotes(scene);

  scene.add(new THREE.HemisphereLight(0x2a6b72, 0x04070a, 1.15));
  scene.add(new THREE.AmbientLight(0x2b616b, 0.55));
  const key = new THREE.DirectionalLight(0xa6fff0, 1.75);
  key.position.set(18, 32, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -55; key.shadow.camera.right = 55;
  key.shadow.camera.top = 55; key.shadow.camera.bottom = -55;
  key.shadow.camera.far = 130;
  key.shadow.bias = -0.0012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff4f95, 0.8);
  rim.position.set(-22, 16, -26);
  scene.add(rim);
  const fill = new THREE.PointLight(0x39d9ff, 30, 70, 1.6);
  fill.position.set(-20, 12, 16);
  scene.add(fill);

  /* --- perimeter --- */
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x071b20, metalness: 0.9, roughness: 0.4 });
  const wallGlass = new THREE.MeshStandardMaterial({
    color: 0x082a2e, emissive: 0x073f3c, emissiveIntensity: 0.3,
    metalness: 0.6, roughness: 0.15, transparent: true, opacity: 0.6
  });
  const wallH = 6.4;
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(ARENA * 2 + 4, wallH, 1.4), wallMat);
    wall.position.set(Math.sin(ang) * ARENA, wallH / 2, Math.cos(ang) * ARENA);
    wall.rotation.y = ang;
    wall.receiveShadow = true;
    scene.add(wall);
    // translucent upper band
    const band = new THREE.Mesh(new THREE.BoxGeometry(ARENA * 2, wallH * 0.5, 1.5), wallGlass);
    band.position.set(Math.sin(ang) * (ARENA - 0.1), wallH * 0.72, Math.cos(ang) * (ARENA - 0.1));
    band.rotation.y = ang;
    scene.add(band);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(ARENA * 2, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: 0x1d736c }));
    trim.position.set(Math.sin(ang) * (ARENA - 0.8), 1.1, Math.cos(ang) * (ARENA - 0.8));
    trim.rotation.y = ang;
    scene.add(trim);
    const trim2 = new THREE.Mesh(new THREE.BoxGeometry(ARENA * 2, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: 0x48e6ce }));
    trim2.position.set(Math.sin(ang) * (ARENA - 0.8), wallH - 0.15, Math.cos(ang) * (ARENA - 0.8));
    trim2.rotation.y = ang;
    scene.add(trim2);
    const along = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
    const inward = new THREE.Vector3(-Math.sin(ang), 0, -Math.cos(ang));
    const wallCenter = new THREE.Vector3(Math.sin(ang) * (ARENA - 0.75), 0, Math.cos(ang) * (ARENA - 0.75));
    // vertical mullions + buttresses
    for (let j = -3; j <= 3; j++) {
      const base = wallCenter.clone().addScaledVector(along, j * 12);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, wallH * 1.12, 0.55), frameMat);
      b.position.set(base.x + inward.x * -0.35, wallH * 0.56, base.z + inward.z * -0.35);
      scene.add(b);
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.07, wallH * 0.95, 0.06), new THREE.MeshBasicMaterial({ color: 0x63f2da }));
      g.position.set(base.x + inward.x * 0.55, wallH * 0.5, base.z + inward.z * 0.55);
      scene.add(g);
      if (j < 3) {
        const p = base.clone().addScaledVector(along, 6);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH * 0.6, 0.07), new THREE.MeshBasicMaterial({ color: j % 2 ? 0xff6f9f : 0x6ef7dd }));
        panel.position.set(p.x + inward.x * 0.58, wallH * 0.46, p.z + inward.z * 0.58);
        scene.add(panel);
      }
    }
    addCollider(Math.sin(ang) * (ARENA + 1), Math.cos(ang) * (ARENA + 1),
      ang === 0 || ang === Math.PI ? ARENA + 2 : 1, ang === 0 || ang === Math.PI ? 1 : ARENA + 2, wallH, 'wall');
  }

  // skyline monoliths beyond the arena for depth
  const cityCanvas = document.createElement('canvas');
  cityCanvas.width = 64; cityCanvas.height = 64;
  const cityCtx = cityCanvas.getContext('2d');
  cityCtx.fillStyle = '#040d12'; cityCtx.fillRect(0, 0, 64, 64);
  for (let yy = 2; yy < 62; yy += 7) {
    for (let xx = 2; xx < 62; xx += 6) {
      if (Math.random() < 0.68) {
        cityCtx.fillStyle = Math.random() < 0.24 ? 'rgba(255,120,170,0.95)' : 'rgba(90,240,220,0.9)';
        cityCtx.fillRect(xx, yy, 4, 3);
      } else if (Math.random() < 0.35) {
        cityCtx.fillStyle = 'rgba(30,100,110,0.5)';
        cityCtx.fillRect(xx, yy, 3, 3);
      }
    }
  }
  const cityTex = new THREE.CanvasTexture(cityCanvas);
  cityTex.colorSpace = THREE.SRGBColorSpace;
  cityTex.wrapS = cityTex.wrapT = THREE.RepeatWrapping;
  cityTex.repeat.set(2.5, 3.5);
  const skylineMat = new THREE.MeshStandardMaterial({
    color: 0x112c34, metalness: 0.5, roughness: 0.6,
    map: cityTex, emissive: 0xffffff, emissiveMap: cityTex, emissiveIntensity: 1.25
  });
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + 0.13;
    const r = 64 + (i % 4) * 7;
    const h = 18 + ((i * 37) % 40);
    const w = 3 + (i % 3) * 2.2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skylineMat);
    b.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    b.rotation.y = a;
    scene.add(b);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.08, w * 0.9), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff6f9f : 0x52e8d2 }));
    cap.position.set(b.position.x, h - 1.9, b.position.z);
    scene.add(cap);
    for (const s of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, h * 0.6, 0.06), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff6f9f : 0x2aa79e }));
      strip.position.set(b.position.x + s * w * 0.42, h * 0.5, b.position.z + w * 0.51);
      scene.add(strip);
    }
    if (i % 3 === 0) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, 0.06, w * 1.01), new THREE.MeshBasicMaterial({ color: 0x67e9d4 }));
      band.position.set(b.position.x, h * (0.35 + (i % 4) * 0.12), b.position.z);
      scene.add(band);
    }
  }

  /* --- corner towers --- */
  const corners = [[-31, -31], [31, -31], [-31, 31], [31, 31]];
  corners.forEach(([x, z], i) => {
    makePillar(scene, x, z, 6, 13, i % 2 ? 0xff74a8 : 0x62f5dc);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.06, 8, 32), i % 2 ? glowPink : glowTeal);
    halo.position.set(x, 13.6, z); halo.rotation.x = Math.PI / 2;
    scene.add(halo);
  });

  /* --- center dais --- */
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 11, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0x081e22, metalness: 0.85, roughness: 0.3 }));
  dais.position.y = 0.35; dais.receiveShadow = true;
  scene.add(dais);
  const daisRing = new THREE.Mesh(new THREE.TorusGeometry(9.8, 0.06, 6, 64), glowTeal);
  daisRing.position.y = 0.72; daisRing.rotation.x = Math.PI / 2;
  scene.add(daisRing);
  const daisRing2 = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.04, 6, 48), glowPink);
  daisRing2.position.y = 0.73; daisRing2.rotation.x = Math.PI / 2;
  scene.add(daisRing2);
  addCollider(0, 0, 6.2, 6.2, 1.0, 'dais');

  /* --- dais prism shrine --- */
  const shrine = new THREE.Group();
  shrine.position.y = 2.1;
  const prismCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), new THREE.MeshStandardMaterial({
    color: 0x8affea, emissive: 0x35e6c8, emissiveIntensity: 1.0, metalness: 0.3, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.95
  }));
  shrine.add(prismCore);
  const prismShell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), new THREE.MeshBasicMaterial({ color: 0x64ffe0, wireframe: true, transparent: true, opacity: 0.35 }));
  shrine.add(prismShell);
  const shrineRings = [];
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.35 + i * 0.5, 0.025, 4, 48), new THREE.MeshBasicMaterial({ color: i ? 0xff6fa7 : 0x6effe2, transparent: true, opacity: 0.6 }));
    r.rotation.x = Math.PI / 2 + i * 0.4;
    shrine.add(r); shrineRings.push(r);
  }
  const shrineLight = new THREE.PointLight(0x5affdf, 12, 16, 2);
  shrine.add(shrineLight);
  scene.add(shrine);

  /* --- cover layout (asymmetric but balanced) --- */
  makeCrate(scene, -15, -13, 3.6, 3.2, 0xff6f9f, 0.15);
  makeCrate(scene, -20, -8, 2.6, 4.1, 0x6ef7dd, -0.1);
  makeCrate(scene, 15, -14, 4.0, 2.6, 0x6ef7dd, 0.2);
  makeCrate(scene, 21, -7, 2.8, 3.6, 0xffb066, -0.25);
  makeCrate(scene, -16, 14, 4.4, 2.2, 0xffb066, -0.15);
  makeCrate(scene, -9, 19, 2.7, 3.8, 0xff6f9f, 0.3);
  makeCrate(scene, 16, 15, 3.4, 3.4, 0xff6f9f, 0.05);
  makeCrate(scene, 8, 20, 2.5, 2.7, 0x6ef7dd, -0.3);
  makePillar(scene, -8, -28, 3.4, 9, 0x67f4dc);
  makePillar(scene, 8, -28, 3.4, 9, 0xff74a8);
  makePillar(scene, -26, 4, 3.0, 7.5, 0xffb066);
  makePillar(scene, 27, 3, 3.0, 7.5, 0x67f4dc);
  makeCrate(scene, 0, -21, 5.5, 1.4, 0x6ef7dd, 0);
  makeCrate(scene, 0, 23, 5.5, 1.4, 0xff6f9f, 0);
  makeCrate(scene, -28, -16, 2.2, 2.2, 0xff6f9f, 0.4);
  makeCrate(scene, 28, 16, 2.2, 2.2, 0x6ef7dd, 0.4);

  /* --- broken ramps / glass fins --- */
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + 0.42;
    const r = 42;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4 + (i % 4) * 1.1, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x0e3b3e, emissive: 0x0c5552, emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.12, transparent: true, opacity: 0.34 }));
    fin.position.set(Math.cos(a) * r, 1.9, Math.sin(a) * r);
    fin.rotation.y = -a + Math.PI / 2;
    fin.rotation.z = 0.06 * (i % 2 ? 1 : -1);
    scene.add(fin);
  }

  /* --- floating rings above --- */
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(18 + i * 7, 0.04, 4, 96), new THREE.MeshBasicMaterial({ color: i === 1 ? 0xff6fa7 : 0x5ff4dd, transparent: true, opacity: 0.28 }));
    ring.rotation.x = Math.PI / 2 + 0.12 * i;
    ring.position.y = 24 + i * 5;
    scene.add(ring);
  }

  /* --- shattered crystal halo --- */
  const halo = new THREE.Group();
  halo.position.y = 50;
  const shardGeo = new THREE.OctahedronGeometry(1, 0);
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x2aa5a0, emissive: 0x1a7d78, emissiveIntensity: 1.2,
    metalness: 0.4, roughness: 0.15, transparent: true, opacity: 0.72, flatShading: true
  });
  const shardMat2 = new THREE.MeshStandardMaterial({
    color: 0xa03a76, emissive: 0x74244f, emissiveIntensity: 1.1,
    metalness: 0.4, roughness: 0.2, transparent: true, opacity: 0.65, flatShading: true
  });
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2;
    const r = 25 + (i % 4) * 3.5;
    const shard = new THREE.Mesh(shardGeo, i % 3 === 0 ? shardMat2 : shardMat);
    shard.position.set(Math.cos(a) * r, Math.sin(a * 3) * 3, Math.sin(a) * r);
    shard.scale.set(0.8 + (i % 3) * 0.5, 3 + (i % 5) * 1.7, 0.35);
    shard.rotation.set(Math.random() * 2, -a + Math.PI / 2, a * 0.7);
    halo.add(shard);
  }
  scene.add(halo);

  /* --- beacon column from the obelisk --- */
  const beaconMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ float a = smoothstep(0.0,0.3,vUv.y)*(1.0-smoothstep(0.75,1.0,vUv.y));
        a *= 0.35+0.25*sin(vUv.y*30.0-uTime*2.0);
        gl_FragColor = vec4(mix(vec3(0.2,1.0,0.9),vec3(1.0,0.35,0.75),vUv.x), a*0.14); }`
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.4, 46, 12, 1, true), beaconMat);
  beacon.position.y = 40;
  scene.add(beacon);

  const pulse = { active: 0, pos: new THREE.Vector2() };

  return {
    sky, floor, shards, obelisk, beams, motes, pulse,
    spawnPoints: [
      [-30, -24], [30, -24], [-32, 22], [32, 24], [-6, -34], [12, 4], [-38, 2], [38, -2]
    ],
    update(t, dt) {
      sky.uniforms.uTime.value = t;
      floor.uniforms.uTime.value = t;
      shards.update(t, dt);
      obelisk.update(t, dt);
      halo.rotation.y += dt * 0.035;
      halo.rotation.z = Math.sin(t * 0.12) * 0.06;
      shrine.position.y = 2.1 + Math.sin(t * 1.1) * 0.12;
      prismCore.rotation.y += dt * 0.6; prismCore.rotation.x += dt * 0.25;
      prismShell.rotation.y -= dt * 0.3;
      shrineRings[0].rotation.z += dt * 0.5;
      shrineRings[1].rotation.y += dt * 0.7;
      beaconMat.uniforms.uTime.value = t;
      beacon.rotation.y -= dt * 0.05;
      beams.update(t);
      motes.update(t, dt);
      if (pulse.active > 0) {
        pulse.active = Math.max(0, pulse.active - dt * 0.55);
        floor.uniforms.uPulse.value = pulse.active;
        floor.uniforms.uPulsePos.value.copy(pulse.pos);
      } else floor.uniforms.uPulse.value = 0;
    },
    triggerPulse(x, z, strength = 1) {
      pulse.active = strength;
      pulse.pos.set(x, z);
    }
  };
}

/* ---------- impact spark pool ---------- */
export function createSparks(scene) {
  const N = 240;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), alpha = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aAlpha; varying vec3 vC; varying float vA;
      void main(){ vC=color; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=clamp((1.0+vA*5.0)*(20.0/max(0.6,-mv.z)), 1.0, 24.0);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard; gl_FragColor=vec4(vC, (1.0-d*2.0)*vA); }`,
    vertexColors: true
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < N; i++) parts.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0, size: 0 });
  let cursor = 0;
  return {
    burst(x, y, z, n, color = [0.4, 1, 0.9], power = 1, gravity = 9) {
      const c = new THREE.Color(color[0], color[1], color[2]);
      for (let i = 0; i < n; i++) {
        const p = parts[cursor]; cursor = (cursor + 1) % N;
        p.x = x; p.y = y; p.z = z;
        const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
        const sp = (1.5 + Math.random() * 5) * power;
        p.vx = Math.cos(a) * Math.cos(b) * sp;
        p.vy = Math.sin(b) * sp + 1.5;
        p.vz = Math.sin(a) * Math.cos(b) * sp;
        p.life = 0.3 + Math.random() * 0.45;
        p.maxLife = p.life;
        p.r = c.r * (0.7 + Math.random() * 0.6);
        p.g = c.g * (0.7 + Math.random() * 0.6);
        p.b = c.b * (0.7 + Math.random() * 0.6);
        p.size = 0.7 + Math.random() * 1.6;
        p.gravity = gravity;
      }
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.vy -= p.gravity * dt;
          p.vx *= 0.97; p.vz *= 0.97;
          if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
        }
        const alive = p.life > 0 ? p.life / p.maxLife : 0;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
        alpha[i] = alive;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    }
  };
}
