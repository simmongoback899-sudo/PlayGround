import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, createSparks, colliders, rayHitWorld, ARENA } from './world.js';
import { createWeapons, WEAPONS } from './guns.js';
import { initAudio, sfx } from './audio.js';

/* ============================================================
   PRISM//BREACH — a neon tactical FPS
   ============================================================ */

const root = document.getElementById('game-root');
const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const lowPower = isTouch || (navigator.hardwareConcurrency || 8) < 5;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// procedural environment for crisp, colorful metal reflections
(function makeEnv() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#02080d');
  grd.addColorStop(0.38, '#073037');
  grd.addColorStop(0.52, '#0a6a66');
  grd.addColorStop(0.62, '#0b2a38');
  grd.addColorStop(1, '#160916');
  x.fillStyle = grd; x.fillRect(0, 0, 512, 256);
  const glow = (cx, cy, r, col) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  };
  glow(120, 130, 90, 'rgba(90,255,225,0.9)');
  glow(360, 120, 100, 'rgba(255,90,160,0.55)');
  glow(260, 150, 150, 'rgba(60,120,255,0.3)');
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = tex;
  scene.environmentIntensity = 0.62;
})();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.045, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = buildWorld(scene);
const sparks = createSparks(scene);
const weapons = createWeapons(camera);

/* ---------------- post processing ---------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5), 0.82, 0.6, 0.8);
composer.addPass(bloom);

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uUlt: { value: 0 },
    uDash: { value: 0 },
    uReveal: { value: 0 }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime,uDamage,uUlt,uDash,uReveal; varying vec2 vUv;
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5; float r = length(c);
      uv += c * uUlt * 0.013 * sin(r*26.0 - uTime*6.0);
      float ab = (0.0009 + uUlt*0.0055 + uDamage*0.0035 + uDash*0.006) * smoothstep(0.08,0.85,r);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c*ab*1.2).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c*ab*1.2).b;
      float vig = smoothstep(1.02,0.28,r);
      col *= mix(0.52,1.0,vig);
      col += vec3(0.42,0.015,0.05) * uDamage * pow(r*1.45,2.1);
      col = mix(col, col*vec3(0.84,0.99,1.1)+vec3(0.022,0.0,0.05), uUlt*0.42);
      col += vec3(0.05,0.6,0.56) * uReveal * 0.05 * (0.5+0.5*sin(r*30.0-uTime*4.0));
      col *= 1.0 - 0.028*step(0.5, fract(uv.y*640.0));
      float gr = fract(sin(dot(uv*vec2(12.9898,78.233)+uTime*0.013,vec2(1.0)))*43758.5453);
      col += (gr-0.5)*0.018;
      gl_FragColor = vec4(col,1.0);
    }`
};
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
composer.addPass(new OutputPass());

/* ---------------- state ---------------- */
const phase = { mode: 'menu', time: 90, elapsed: 0, kills: 0, shots: 0, hits: 0, started: false, endScheduled: 0 };
const player = {
  pos: new THREE.Vector3(0, 0, 26),
  vel: new THREE.Vector3(),
  yaw: Math.PI, pitch: 0,
  health: 100, armor: 50,
  onGround: true, sprinting: false, crouch: false,
  dashT: 0, dashCD: 0, scanCD: 0, ult: 40, ultActive: 0, ultWave: null,
  invuln: 0, lastDamage: -99, bob: 0, moveSpeed: 0,
  ammo: [25, 12, 30], reserve: [75, 48, 90], reloadT: 0
};
const input = {
  keys: {}, firing: false, aim: false, mouseDX: 0, mouseDY: 0,
  touchMove: { x: 0, y: 0 }, touchFire: false, autoFire: false
};
const enemies = [];
const pickups = [];
const tracers = [];
const waves = [];
let shake = 0, damageFlash = 0, dashFlash = 0, revealFlash = 0;
let timeScale = 1;
let activeCamera = 'player';
let menuT = 0, clockT = 0;
let lastFrame = performance.now();
let footstepT = 0;

/* ============================================================
   ENEMY VISUALS
   ============================================================ */
const enemyConfigs = {
  sentinel: { hp: 140, speed: 2.3, color: 0xff6d9d, accent: 0xffc2d6, bodyY: 1.2, bodyR: 0.62, headY: 1.85, headR: 0.36, height: 2.15, burst: 3, interval: 1.15, dmg: 9, spread: 0.045, range: 36, name: 'SENTINEL' },
  stalker: { hp: 85, speed: 4.4, color: 0xffb066, accent: 0xffe2b8, bodyY: 1.0, bodyR: 0.44, headY: 1.55, headR: 0.3, height: 1.8, burst: 4, interval: 0.95, dmg: 6, spread: 0.06, range: 27, name: 'STALKER' },
  warden: { hp: 120, speed: 2.0, color: 0x7fa9ff, accent: 0xcfe0ff, bodyY: 1.25, bodyR: 0.5, headY: 1.95, headR: 0.32, height: 2.25, burst: 1, interval: 2.0, dmg: 19, spread: 0.012, range: 58, name: 'WARDEN' },
  weaver: { hp: 95, speed: 3.5, color: 0xc78cff, accent: 0xf0d9ff, bodyY: 1.15, bodyR: 0.5, headY: 1.8, headR: 0.3, height: 2.0, burst: 2, interval: 1.3, dmg: 8, spread: 0.05, range: 34, name: 'WEAVER' },
};

const enemyMat = (c, e = 0.22) => new THREE.MeshStandardMaterial({ color: 0x18242b, metalness: 0.85, roughness: 0.35, emissive: c, emissiveIntensity: e });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0a1419, metalness: 0.9, roughness: 0.4 });
const boneMat = new THREE.MeshStandardMaterial({ color: 0x24333a, metalness: 0.5, roughness: 0.6 });

function buildEnemyMesh(type) {
  const cfg = enemyConfigs[type];
  const g = new THREE.Group();
  const armor = enemyMat(cfg.color, 0.12);
  const trim = new THREE.MeshBasicMaterial({ color: cfg.color });
  const coreMat = new THREE.MeshBasicMaterial({ color: cfg.accent });
  const parts = { legs: [], arms: [], fins: [] };

  if (type === 'sentinel') {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.92, 0.55), armor);
    torso.position.y = 1.35; torso.castShadow = true; g.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.14), darkMetal);
    chest.position.set(0, 1.4, 0.31); g.add(chest);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), coreMat);
    core.position.set(0, 1.4, 0.4); g.add(core); parts.core = core;
    const shoulderGeo = new THREE.BoxGeometry(0.42, 0.5, 0.62);
    for (const s of [-1, 1]) {
      const sh = new THREE.Mesh(shoulderGeo, armor);
      sh.position.set(s * 0.66, 1.62, 0); g.add(sh);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.5), trim);
      st.position.set(s * 0.87, 1.66, 0); g.add(st);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), boneMat);
      arm.position.set(s * 0.67, 1.15, 0.08); g.add(arm); parts.arms.push(arm);
    }
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.29, 0), armor);
    head.position.y = 1.98; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.12), trim);
    visor.position.set(0, 1.99, 0.24); g.add(visor);
    parts.head = head;
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.34), darkMetal);
      leg.position.set(s * 0.25, 0.5, 0); g.add(leg); parts.legs.push(leg);
      const shinTrim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.36), trim);
      shinTrim.position.set(s * 0.25 + s * 0.16, 0.5, 0); g.add(shinTrim);
    }
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.7, 8), darkMetal);
    cannon.rotation.x = Math.PI / 2; cannon.position.set(0.45, 1.15, 0.5); g.add(cannon);
    const cannonGlow = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 4, 10), trim);
    cannonGlow.position.set(0.45, 1.15, 0.82); g.add(cannonGlow);
    // shield plates
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.06, 6, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: cfg.color, transparent: true, opacity: 0.28, emissive: cfg.color, emissiveIntensity: 1.1, side: THREE.DoubleSide }));
    shield.rotation.set(Math.PI / 2, 0, Math.PI / 2); shield.position.set(-0.66, 1.25, 0.22); g.add(shield);
    const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.014, 4, 24, Math.PI), trim);
    shieldRim.rotation.set(Math.PI / 2, 0, Math.PI / 2); shieldRim.position.copy(shield.position); g.add(shieldRim);
    // glowing panel seams
    for (const s of [-1, 1]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.56, 0.05), trim);
      seam.position.set(s * 0.3, 1.35, 0.29); g.add(seam);
      const legSeam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.03), trim);
      legSeam.position.set(s * 0.42, 0.5, 0.18); g.add(legSeam);
      const shoulderEdge = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.045, 0.58), trim);
      shoulderEdge.position.set(s * 0.66, 1.86, 0); g.add(shoulderEdge);
    }
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), trim);
    crest.position.set(0, 2.24, 0.02); g.add(crest);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.24), darkMetal);
    pack.position.set(0, 1.42, -0.35); g.add(pack);
    const packGlow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.05), trim);
    packGlow.position.set(0, 1.48, -0.48); g.add(packGlow);
  } else if (type === 'stalker') {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.44, 4, 8), armor);
    torso.position.y = 1.24; torso.rotation.x = 0.12; torso.castShadow = true; g.add(torso);
    const chest = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.44, 4), armor);
    chest.position.set(0, 1.32, 0.13); chest.rotation.x = Math.PI / 2 + 0.1; chest.rotation.y = Math.PI / 4; g.add(chest);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.09), trim);
    spine.position.set(0, 1.3, -0.27); g.add(spine);
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), trim);
      seg.position.set(0, 1.12 + i * 0.18, -0.26);
      g.add(seg);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), coreMat);
    core.position.set(0, 1.3, 0.27); g.add(core); parts.core = core;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 5), armor);
    head.position.y = 1.68; head.rotation.y = Math.PI / 5; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.045, 0.1), trim);
    visor.position.set(0, 1.71, 0.15); g.add(visor);
    parts.head = head;
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 4), trim);
      horn.position.set(s * 0.17, 1.78, -0.02); horn.rotation.z = -s * 0.5; g.add(horn);
      const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), armor);
      sh.position.set(s * 0.33, 1.44, 0); sh.scale.set(1, 0.7, 1); g.add(sh);
      const shTrim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.2), trim);
      shTrim.position.set(s * 0.4, 1.46, 0); g.add(shTrim);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.54, 0.13), boneMat);
      arm.position.set(s * 0.35, 1.13, 0.04); arm.rotation.z = s * 0.14; g.add(arm); parts.arms.push(arm);
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.62, 4), trim);
      blade.position.set(s * 0.4, 0.86, 0.14); blade.rotation.x = Math.PI; g.add(blade);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.18), armor);
      upper.position.set(s * 0.17, 0.74, 0.02); g.add(upper);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.12), darkMetal);
      lower.position.set(s * 0.19, 0.3, 0.07); lower.rotation.x = -0.18; g.add(lower);
      const knee = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), trim);
      knee.position.set(s * 0.18, 0.52, 0.09); g.add(knee);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.32), darkMetal);
      foot.position.set(s * 0.19, 0.06, 0.1); g.add(foot);
      parts.legs.push(upper);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.62), trim);
    tail.position.set(0, 1.16, -0.5); tail.rotation.x = -0.5; g.add(tail);
    const tailTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), coreMat);
    tailTip.position.set(0, 1.02, -0.78); g.add(tailTip);
  } else if (type === 'warden') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.5, 6), armor);
    robe.position.y = 1.0; robe.castShadow = true; g.add(robe);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.34), darkMetal);
    torso.position.y = 1.62; g.add(torso);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), coreMat);
    core.position.set(0, 1.62, 0.24); g.add(core); parts.core = core;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 4), armor);
    head.position.y = 2.06; head.rotation.y = Math.PI / 4; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.1), trim);
    visor.position.set(0, 2.08, 0.17); g.add(visor);
    parts.head = head;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.015, 4, 24), new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.8 }));
    halo.position.y = 2.28; halo.rotation.x = Math.PI / 2; g.add(halo); parts.fins.push(halo);
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.25), darkMetal);
    rifle.position.set(0.36, 1.4, 0.42); rifle.rotation.x = -0.12; g.add(rifle);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.52, 0.14), boneMat);
      arm.position.set(s * 0.32, 1.5, 0.12); g.add(arm); parts.arms.push(arm);
    }
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), trim);
    tip.position.set(0.36, 1.47, 1.08); g.add(tip);
  } else {
    // weaver — floating prismancer
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), coreMat);
    core.position.y = 1.3; g.add(core); parts.core = core;
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 0), new THREE.MeshBasicMaterial({ color: cfg.color, wireframe: true, transparent: true, opacity: 0.55 }));
    shell.position.y = 1.3; g.add(shell); parts.shell = shell;
    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), armor);
    head.position.y = 1.98; g.add(head); parts.head = head;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.1), trim);
    visor.position.set(0, 1.98, 0.16); g.add(visor);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72 + i * 0.16, 0.018, 4, 28), trim);
      ring.position.y = 1.1 + i * 0.24;
      ring.rotation.x = 0.5 + i * 0.6;
      g.add(ring); parts.fins.push(ring);
    }
    for (const s of [-1, 1]) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), armor);
      shard.position.set(s * 0.68, 1.3, 0.1); g.add(shard);
      const spear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 4), trim);
      spear.position.set(s * 0.82, 1.05, 0.2); spear.rotation.x = Math.PI; g.add(spear);
    }
  }
  // contact shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.bodyR * 1.9, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false })
  );
  shadow.position.y = type === 'weaver' ? -0.33 : 0.02;
  shadow.renderOrder = 1;
  g.add(shadow);

  // health bar
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.11), new THREE.MeshBasicMaterial({ color: 0x02100f, transparent: true, opacity: 0.92, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.06), new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95, depthTest: false }));
  fill.position.z = 0.001;
  bar.add(bg, fill);
  bar.position.y = cfg.height + 0.38;
  bar.renderOrder = 20;
  g.add(bar);
  // reveal marker
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.95, depthTest: false }));
  marker.position.y = cfg.height + 0.66;
  marker.renderOrder = 21;
  marker.visible = false;
  g.add(marker);
  return { group: g, parts, bar, fill, marker };
}

function spawnEnemies() {
  const types = ['stalker', 'sentinel', 'warden', 'stalker', 'weaver', 'sentinel', 'warden', 'stalker'];
  const spots = world.spawnPoints.slice();
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const cfg = enemyConfigs[type];
    const sp = spots[i % spots.length];
    const mesh = buildEnemyMesh(type);
    const x = sp[0] + (Math.random() - 0.5) * 3;
    const z = sp[1] + (Math.random() - 0.5) * 3;
    mesh.group.position.set(x, 0, z);
    scene.add(mesh.group);
    enemies.push({
      type, cfg, ...mesh,
      pos: new THREE.Vector3(x, 0, z),
      home: new THREE.Vector3(x, 0, z),
      hp: cfg.hp, maxHp: cfg.hp,
      alive: true, alert: 0, lastSeen: new THREE.Vector3(),
      cooldown: 1.5 + Math.random() * 1.5,
      burstLeft: 0, burstTimer: 0,
      revealUntil: 0, hitFlash: 0, walkPhase: Math.random() * 10,
      deathT: 0, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
      teleT: 0, barVisibleT: 0
    });
  }
}

/* ============================================================
   PICKUPS
   ============================================================ */
function addPickup(x, z) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0x8affe0, emissive: 0x42ffcf, emissiveIntensity: 3, metalness: 0.3, roughness: 0.1 }));
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 5, 32), new THREE.MeshBasicMaterial({ color: 0x6fffe4 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const ring2 = ring.clone(); ring2.rotation.set(Math.PI / 2, 0, 0); ring2.scale.setScalar(0.7); g.add(ring2);
  g.position.set(x, 1.1, z);
  scene.add(g);
  pickups.push({ group: g, core, ring, ring2, x, z, active: true, respawn: 0 });
}
addPickup(-11, 8);
addPickup(12, -9);
addPickup(0, -30);

/* ============================================================
   TRACERS / WAVES
   ============================================================ */
const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
for (let i = 0; i < 28; i++) {
  const mat = new THREE.LineBasicMaterial({ color: 0xbafff1, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(tracerGeo.clone(), mat);
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0, maxLife: 0.1 });
}
function tracer(a, b, color = 0xa8fff0, life = 0.09, width = 1) {
  let t = tracers.find(x => x.life <= 0) || tracers[0];
  const arr = t.line.geometry.attributes.position.array;
  arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
  arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.material.color.set(color);
  t.line.material.opacity = 0.9;
  t.life = life; t.maxLife = life;
}

/* ---------- prismatic shatter pool ---------- */
const shardPool = [];
{
  const geo = new THREE.TetrahedronGeometry(0.17, 0);
  for (let i = 0; i < 44; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9fffea, emissive: 0x3fffe0, emissiveIntensity: 0.9,
      metalness: 0.5, roughness: 0.2, transparent: true, opacity: 1, flatShading: true
    });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    scene.add(m);
    shardPool.push({ mesh: m, life: 0, maxLife: 1, v: new THREE.Vector3(), spin: new THREE.Vector3() });
  }
}
function shatterBurst(pos, color) {
  const col = new THREE.Color(color);
  for (let i = 0; i < 10; i++) {
    const s = shardPool.find(x => x.life <= 0);
    if (!s) break;
    s.life = s.maxLife = 0.7 + Math.random() * 0.5;
    s.mesh.visible = true;
    s.mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 1.4, (Math.random() - 0.5) * 0.6));
    s.mesh.scale.setScalar(0.5 + Math.random() * 1.4);
    s.mesh.material.color.copy(col);
    s.mesh.material.emissive.copy(col);
    const a = Math.random() * Math.PI * 2;
    s.v.set(Math.cos(a) * (2 + Math.random() * 4), 3 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 4));
    s.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
  }
}
function updateShatter(dt) {
  for (const s of shardPool) {
    if (s.life <= 0) continue;
    s.life -= dt;
    const p = s.mesh.position;
    p.addScaledVector(s.v, dt);
    s.v.y -= 14 * dt;
    if (p.y < 0.08) { p.y = 0.08; s.v.y *= -0.42; s.v.x *= 0.7; s.v.z *= 0.7; }
    s.mesh.rotation.x += s.spin.x * dt;
    s.mesh.rotation.y += s.spin.y * dt;
    s.mesh.rotation.z += s.spin.z * dt;
    s.mesh.material.opacity = Math.max(0, s.life / s.maxLife);
    if (s.life <= 0) s.mesh.visible = false;
  }
}

const waveMat = (c1, c2) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { uFade: { value: 1 }, uColorA: { value: new THREE.Color(c1) }, uColorB: { value: new THREE.Color(c2) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform float uFade; uniform vec3 uColorA,uColorB; varying vec2 vUv;
    void main(){ float a = sin(vUv.y*3.14159); a *= 0.55 + 0.45*sin(vUv.x*40.0 + vUv.y*6.0);
      vec3 c = mix(uColorA,uColorB,vUv.x);
      gl_FragColor = vec4(c, a*uFade*0.055); }`
});

function spawnWave(x, z, opts = {}) {
  const radius = opts.radius || 1;
  const h = Math.min(1.1, opts.height || 0.9);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, 64, 1, true), waveMat(opts.colorA || 0x5cffe0, opts.colorB || 0xff6fb2));
  mesh.position.set(x, h / 2 + 0.08, z);
  mesh.scale.set(radius, 1, radius);
  mesh.material.uniforms.uFade.value = 0.7;
  scene.add(mesh);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.022, 4, 72), new THREE.MeshBasicMaterial({ color: opts.colorA || 0x8affea, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.14, z); ring.scale.setScalar(radius);
  scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 4, 64), new THREE.MeshBasicMaterial({ color: opts.colorB || 0xff6fb2, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring2.rotation.x = Math.PI / 2; ring2.position.set(x, 2.6, z); ring2.scale.setScalar(radius);
  scene.add(ring2);
  waves.push({
    mesh, ring, ring2, r: radius, max: opts.max || 55, speed: opts.speed || 42, fade: 1,
    dmg: opts.dmg || 0, hit: new Set(), origin: new THREE.Vector2(x, z), shock: !!opts.shock
  });
}

/* ============================================================
   RAY HELPERS
   ============================================================ */
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _dir = new THREE.Vector3();
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}
function hasLOS(from, to) {
  const d = _dir.copy(to).sub(from);
  const dist = d.length(); d.divideScalar(dist);
  const hit = rayHitWorld(from, d, dist);
  return !hit || hit.dist >= dist - 0.2;
}

/* ============================================================
   SHOOTING
   ============================================================ */
const stats = { w: 0 };
function currentWeapon() { return WEAPONS[stats.w]; }

function reload() {
  const w = currentWeapon();
  if (player.reloadT > 0 || player.ammo[stats.w] >= w.mag || player.reserve[stats.w] <= 0) return;
  player.reloadT = w.reload * 1000;
  $('reload').classList.add('show');
  sfx.reload();
}

function fire() {
  const w = currentWeapon();
  if (player.reloadT > 0 || phase.mode !== 'playing' || player.fireT > 0) return;
  if (player.ammo[stats.w] <= 0) { sfx.empty(); reload(); player.fireT = 0.25; return; }
  player.fireT = w.rate;
  player.ammo[stats.w]--;
  phase.shots++;
  weapons.kick(1);
  weapons.flash();
  sfx.shoot(w.sound);

  const moving = player.moveSpeed > 1.2;
  let spread = w.spread * (input.aim ? 0.4 : 1) + (moving ? w.moveSpread : 0) + (player.onGround ? 0 : 0.03);
  if (player.sprinting) spread += 0.02;
  // aim assist on touch
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  if (isTouch) spread *= 0.7;
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * spread;
  dir.addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();

  const origin = camera.getWorldPosition(new THREE.Vector3());
  let bestT = 160, hitEnemy = null, hitHead = false, hitPoint = null;
  for (const e of enemies) {
    if (!e.alive) continue;
    const body = _v.set(e.pos.x, e.pos.y + e.cfg.bodyY, e.pos.z);
    const tB = raySphere(origin, dir, body, e.cfg.bodyR);
    const head = _v2.set(e.pos.x, e.pos.y + e.cfg.headY, e.pos.z);
    const tH = raySphere(origin, dir, head, e.cfg.headR);
    if (tH > 0 && tH < bestT) { bestT = tH; hitEnemy = e; hitHead = true; }
    if (tB > 0 && tB < bestT) { bestT = tB; hitEnemy = e; hitHead = false; }
  }
  const wh = rayHitWorld(origin, dir, bestT);
  if (wh && (!hitEnemy || wh.dist < bestT)) { bestT = wh.dist; hitEnemy = null; hitPoint = wh.point; }
  if (hitEnemy) hitPoint = origin.clone().addScaledVector(dir, bestT);

  const muzzle = weapons.getMuzzle();
  if (hitEnemy) {
    phase.hits++;
    let dmg = w.damage * (hitHead ? w.head : 1);
    if (hitEnemy.type === 'sentinel' && !hitHead) dmg *= 0.8;
    damageEnemy(hitEnemy, Math.round(dmg), hitHead, hitPoint, dir);
    tracer(muzzle, hitPoint, hitHead ? 0xffe6a8 : 0xa8fff0, 0.07);
    sparks.burst(hitPoint.x, hitPoint.y, hitPoint.z, 7, hitHead ? [1, 0.8, 0.35] : [0.35, 1, 0.9], 0.55, 6);
  } else {
    tracer(muzzle, hitPoint || origin.clone().addScaledVector(dir, 60), 0x8be6dc, 0.06);
    if (hitPoint) sparks.burst(hitPoint.x, hitPoint.y, hitPoint.z, 5, [0.4, 0.85, 0.8], 0.5, 7);
  }
  // shell casing
  const side = _v.copy(origin).addScaledVector(right, 0.3 + Math.random() * 0.2);
  sparks.burst(side.x, side.y - 0.15, side.z, 1, [1, 0.62, 0.22], 0.5, 8);

  player.pitch += w.recoil * (input.aim ? 0.7 : 1) * (0.6 + Math.random() * 0.8);
  player.yaw += (Math.random() - 0.5) * w.recoil * 0.7;
  shake = Math.max(shake, w.kick * 2.2);
  if (player.ammo[stats.w] <= 0) reload();
  updateAmmoHud();
}

function damageEnemy(e, dmg, head, point, dir) {
  e.hp -= dmg;
  e.hitFlash = 0.16;
  e.alert = Math.max(e.alert, 1);
  e.lastSeen.copy(player.pos);
  e.barVisibleT = 4;
  if (e.type === 'weaver' && e.hp > 0 && Math.random() < 0.22) weaverBlink(e);
  sfx.hit(head);
  const hm = $('hit-marker');
  hm.style.color = head ? '#ffd36a' : '#d8fff6';
  hm.classList.add('show');
  setTimeout(() => hm.classList.remove('show'), 90);
  if (head && stats.w === 1) player.ult = Math.min(100, player.ult + 4);
  if (e.hp <= 0) {
    if (stats.w === 2) player.ult = Math.min(100, player.ult + 3);
    killEnemy(e, point, dir);
  }
}

function killEnemy(e, point, dir) {
  e.alive = false;
  e.deathT = 0.001;
  phase.kills++;
  sfx.kill();
  const c = new THREE.Color(e.cfg.color);
  sparks.burst(e.pos.x, e.pos.y + 1.1, e.pos.z, 34, [c.r, c.g, c.b], 1.5, 5);
  sparks.burst(e.pos.x, e.pos.y + 1.2, e.pos.z, 12, [1, 1, 1], 1.1, 4);
  shatterBurst(new THREE.Vector3(e.pos.x, e.pos.y + 1.0, e.pos.z), e.cfg.color);
  const mid = e.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
  world.triggerPulse(e.pos.x, e.pos.z, 0.6);
  tracer(mid, mid.clone().add(new THREE.Vector3(0, 3, 0)), e.cfg.color, 0.2);
  player.ult = Math.min(100, player.ult + 14);
  addFeed(e.cfg.name, point && point.y > e.pos.y + e.cfg.headY - 0.25 ? 'HEADSHOT' : 'ELIMINATED');
  updateMissionHud();
  if (phase.kills >= 8) {
    phase.endScheduled = 1.1;
  }
}

function addFeed(name, tag) {
  const feed = $('kill-feed');
  const el = document.createElement('div');
  el.className = 'feed-item';
  el.innerHTML = `<span>◆</span> YOU → ${name} <b style="color:#7fe9d4;font-weight:400">${tag}</b>`;
  feed.appendChild(el);
  setTimeout(() => el.classList.add('fade'), 3200);
  setTimeout(() => el.remove(), 3900);
  while (feed.children.length > 4) feed.firstChild.remove();
}

/* ============================================================
   ENEMY BEHAVIOUR
   ============================================================ */
function weaverBlink(e) {
  const old = e.group.position.clone();
  const ang = Math.random() * Math.PI * 2;
  for (let attempt = 0; attempt < 8; attempt++) {
    const nx = e.pos.x + Math.cos(ang + attempt) * 5.5;
    const nz = e.pos.z + Math.sin(ang + attempt) * 5.5;
    if (Math.abs(nx) < ARENA - 3 && Math.abs(nz) < ARENA - 3) {
      e.pos.set(nx, 0, nz);
      e.group.position.copy(e.pos);
      sparks.burst(old.x, 1.2, old.z, 16, [0.76, 0.5, 1], 0.9, 2);
      sparks.burst(nx, 1.2, nz, 16, [0.76, 0.5, 1], 0.9, 2);
      tracer(old.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(nx, 1.2, nz), 0xc78cff, 0.15);
      break;
    }
  }
}

function enemyShoot(e) {
  const cfg = e.cfg;
  const eye = _v2.set(e.pos.x, e.pos.y + cfg.headY, e.pos.z);
  const target = new THREE.Vector3(player.pos.x, player.pos.y + 1.55, player.pos.z);
  const dir = target.clone().sub(eye).normalize();
  const dist = target.distanceTo(eye);
  const spread = cfg.spread * (1 + dist / 80);
  dir.x += (Math.random() - 0.5) * spread;
  dir.y += (Math.random() - 0.5) * spread;
  dir.z += (Math.random() - 0.5) * spread;
  dir.normalize();
  const muzzle = new THREE.Vector3(e.pos.x, e.pos.y + 1.4, e.pos.z).addScaledVector(dir, 0.7);
  if (e.type === 'warden') {
    tracer(new THREE.Vector3(e.pos.x, e.pos.y + 1.47, e.pos.z), muzzle.clone().addScaledVector(dir, 60), cfg.color, 0.11);
    sfx.enemyShot(4);
  } else {
    tracer(muzzle, muzzle.clone().addScaledVector(dir, 55), cfg.color, 0.07);
    sfx.enemyShot(dist);
  }
  sparks.burst(muzzle.x, muzzle.y, muzzle.z, 4, [1, 0.55, 0.3], 0.5, 0);
  // hit check against player capsule
  const t = raySphere(eye, dir, new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), 0.52);
  if (t > 0 && t < dist + 2) {
    const occl = rayHitWorld(eye, dir, t);
    if (!occl) {
      const dmg = Math.max(3, Math.round(cfg.dmg * (1 - Math.min(0.35, dist / 160))));
      hurtPlayer(dmg, e);
    }
  }
}

function hurtPlayer(dmg, e) {
  if (player.invuln > 0 || phase.mode !== 'playing') return;
  const armorAbsorb = Math.min(player.armor, Math.round(dmg * 0.55));
  player.armor -= armorAbsorb;
  player.health -= dmg - armorAbsorb;
  damageFlash = Math.min(0.62, damageFlash + 0.26 + dmg * 0.012);
  shake = Math.max(shake, 0.05 + dmg * 0.004);
  sfx.hurt();
  updateHealthHud();
  if (player.health <= 0) {
    player.health = 0;
    endGame(false, 'SIGNAL LOST', 'The Glasshouse claims another runner. Regroup and breach again.');
  }
}

function updateEnemies(dt, t) {
  const edt = player.ultActive > 0 ? dt * 0.22 : dt;
  const playerEye = _v.set(player.pos.x, player.pos.y + 1.55, player.pos.z);
  for (const e of enemies) {
    if (!e.alive) {
      e.deathT += dt;
      const k = Math.min(1, e.deathT / 0.75);
      e.group.scale.setScalar(1 - k * 0.85);
      e.group.position.y = -k * 1.4;
      e.group.rotation.z = k * 0.8;
      e.bar.visible = false;
      if (e.deathT > 0.8) e.group.visible = false;
      continue;
    }
    const cfg = e.cfg;
    const toPlayer = _v2.set(player.pos.x - e.pos.x, 0, player.pos.z - e.pos.z);
    const dist = toPlayer.length();
    const eye = new THREE.Vector3(e.pos.x, e.pos.y + cfg.headY, e.pos.z);
    const los = dist < 60 && hasLOS(eye, playerEye);
    const canSee = los && dist < cfg.range;
    if (canSee) {
      e.alert = 1;
      e.lastSeen.copy(player.pos);
      e.barVisibleT = 3;
    } else if (e.alert > 0) {
      e.alert -= dt / 9;
      if (e.alert < 0) e.alert = 0;
    }
    if (phase.mode !== 'playing') { e.alert = 0; }
    const reveal = t < e.revealUntil;
    e.marker.visible = reveal && !canSee;
    e.bar.visible = e.barVisibleT > 0 || reveal;
    e.barVisibleT = Math.max(0, e.barVisibleT - dt);
    // face + billboard bars
    if (e.bar.visible) {
      e.bar.quaternion.copy(e.group.quaternion).invert().multiply(camera.quaternion);
      const frac = Math.max(0, e.hp / e.maxHp);
      e.fill.scale.x = frac;
      e.fill.position.x = -(1 - frac) * 0.62;
      e.bar.position.y = cfg.height + 0.38 + Math.sin(t * 2 + e.walkPhase) * 0.02;
    }
    if (reveal) {
      e.marker.rotation.y += dt * 2.4;
      e.marker.position.y = cfg.height + 0.66 + Math.sin(t * 3 + e.walkPhase) * 0.06;
    }
    // hit flash / warden charge tell
    if (e.hitFlash > 0) {
      e.hitFlash -= dt;
      e.parts.core.scale.setScalar(1 + Math.sin(e.hitFlash * 60) * 0.4);
    } else if (e.type === 'warden' && e.alert > 0 && e.cooldown > 0 && e.cooldown < 0.55) {
      e.parts.core.scale.setScalar(1.6 + Math.sin(t * 24) * 0.35);
    } else e.parts.core.scale.setScalar(1);

    // movement
    e.walkPhase += dt * (2 + cfg.speed * 0.9);
    const speed = cfg.speed * (e.alert > 0 ? 1 : 0.42) * (timeScale < 1 && phase.ultActive > 0 ? 0.3 : 1);
    let mx = 0, mz = 0;
    if (e.alert > 0) {
      const desired = e.type === 'warden' ? 22 : e.type === 'sentinel' ? 12 : 9;
      const dirToPlayer = toPlayer.clone().normalize();
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeT = 1.4 + Math.random() * 1.8; e.strafeDir *= Math.random() < 0.35 ? -1 : 1; }
      const strafe = new THREE.Vector3(-dirToPlayer.z, 0, dirToPlayer.x).multiplyScalar(e.strafeDir * 0.62);
      if (dist > desired + 3) { mx = dirToPlayer.x + strafe.x; mz = dirToPlayer.z + strafe.z; }
      else if (dist < desired - 4) { mx = -dirToPlayer.x + strafe.x * 0.6; mz = -dirToPlayer.z + strafe.z * 0.6; }
      else { mx = strafe.x; mz = strafe.z; }
      if (!los) { mx = dirToPlayer.x; mz = dirToPlayer.z; }
    } else {
      const wander = Math.sin(t * 0.5 + e.walkPhase * 0.2);
      mx = Math.cos(e.walkPhase * 0.22) * 0.4 + (e.home.x - e.pos.x) * 0.02;
      mz = Math.sin(e.walkPhase * 0.22) * 0.4 + (e.home.z - e.pos.z) * 0.02;
      if (dist < 14) { e.alert = 0.7; }
    }
    // separation
    for (const o of enemies) {
      if (o === e || !o.alive) continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 4 && d2 > 0.001) { const d = Math.sqrt(d2); mx += dx / d * 0.7; mz += dz / d * 0.7; }
    }
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      const step = speed * dt;
      moveWithCollision(e.pos, mx * step, mz * step, 0.55);
      e.pos.x = THREE.MathUtils.clamp(e.pos.x, -ARENA + 2, ARENA - 2);
      e.pos.z = THREE.MathUtils.clamp(e.pos.z, -ARENA + 2, ARENA - 2);
    }
    // animate
    const bob = e.type === 'weaver' ? Math.sin(t * 2 + e.walkPhase) * 0.16 : Math.abs(Math.sin(e.walkPhase)) * 0.06;
    const floating = e.type === 'weaver';
    e.group.position.set(e.pos.x, e.pos.y + bob + (floating ? 0.35 : 0), e.pos.z);
    e.group.rotation.y = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
    if (e.type === 'weaver') {
      e.group.rotation.y += Math.sin(t * 0.7) * 0.25;
      e.parts.fins?.forEach((f, i) => { f.rotation.z += dt * (0.4 + i * 0.2); f.rotation.y += dt * 0.2; });
      e.parts.shell.rotation.y -= dt * 0.5;
    } else {
      const stride = Math.min(1, len) * (e.alert > 0 ? 1 : 0.4);
      e.parts.legs?.forEach((leg, i) => { leg.rotation.x = Math.sin(e.walkPhase + i * Math.PI) * 0.55 * stride; });
      e.parts.arms?.forEach((arm, i) => {
        arm.rotation.x = -0.25 + Math.sin(e.walkPhase + i * Math.PI) * 0.15 * stride;
      });
      e.parts.head.rotation.x = (player.pitch || 0) * 0.1;
    }
    // aim animation / firing
    if (canSee && phase.mode === 'playing' && phase.grace <= 0) {
      e.cooldown -= edt;
      if (e.cooldown <= 0) {
        e.burstLeft = cfg.burst;
        e.burstTimer = 0;
        e.cooldown = cfg.interval + (e.burstLeft > 1 ? 0.02 : 0) + Math.random() * 0.35;
        if (e.type === 'warden') e.cooldown = 1.9;
      }
      if (e.burstLeft > 0) {
        e.burstTimer -= edt;
        if (e.burstTimer <= 0) {
          e.burstTimer = e.type === 'warden' ? 0.75 : 0.09;
          e.burstLeft--;
          if (hasLOS(new THREE.Vector3(e.pos.x, e.pos.y + cfg.headY, e.pos.z), new THREE.Vector3(player.pos.x, player.pos.y + 1.5, player.pos.z))) {
            enemyShoot(e);
          }
        }
      }
      e.parts.arms?.forEach(arm => { arm.rotation.x = -0.9; });
    } else {
      e.cooldown = Math.min(e.cooldown, 1.2);
    }
  }
}

/* collision slide for entities */
function moveWithCollision(pos, dx, dz, radius) {
  pos.x += dx;
  for (const c of colliders) {
    if (c.top < 0.6) continue;
    if (pos.x + radius > c.minX && pos.x - radius < c.maxX && pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
      pos.x = dx > 0 ? c.minX - radius : c.maxX + radius;
    }
  }
  pos.z += dz;
  for (const c of colliders) {
    if (c.top < 0.6) continue;
    if (pos.x + radius > c.minX && pos.x - radius < c.maxX && pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
      pos.z = dz > 0 ? c.minZ - radius : c.maxZ + radius;
    }
  }
}

/* ============================================================
   PLAYER ACTIONS
   ============================================================ */
function doDash() {
  if (phase.mode !== 'playing' || player.dashCD > 0) return;
  let dx = 0, dz = 0;
  if (input.touchMove.x || input.touchMove.y) { dx = input.touchMove.x; dz = input.touchMove.y; }
  else {
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3(f.z, 0, -f.x);
    const kx = (input.keys.KeyD ? 1 : 0) - (input.keys.KeyA ? 1 : 0);
    const kz = (input.keys.KeyW ? 1 : 0) - (input.keys.KeyS ? 1 : 0);
    dx = f.x * kz + r.x * kx; dz = f.z * kz + r.z * kx;
  }
  const l = Math.hypot(dx, dz);
  if (l < 0.1) { const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize(); dx = f.x; dz = f.z; }
  else { dx /= l; dz /= l; }
  player.dashDir = new THREE.Vector3(dx, 0, dz);
  player.dashT = 0.19;
  player.dashCD = 8;
  player.invuln = 0.35;
  dashFlash = 1;
  sfx.dash();
  sparks.burst(player.pos.x, 1.0, player.pos.z, 18, [0.45, 1, 0.95], 1.1, 2);
  world.triggerPulse(player.pos.x, player.pos.z, 0.4);
  toast('PHASE SHIFT // DASH');
}

function doScan() {
  if (phase.mode !== 'playing' || player.scanCD > 0) return;
  player.scanCD = 14;
  revealFlash = 1;
  sfx.pulse();
  spawnWave(player.pos.x, player.pos.z, { speed: 34, max: 46, colorA: 0x6fffe2, colorB: 0x6f9dff, height: 3 });
  world.triggerPulse(player.pos.x, player.pos.z, 0.9);
  for (const e of enemies) if (e.alive) e.revealUntil = clockT + 6;
  toast('SONAR PULSE // HOSTILES REVEALED');
  $('ability-scan').classList.add('cooling');
}

function doUlt() {
  if (phase.mode !== 'playing' || player.ult < 100 || player.ultActive > 0) return;
  player.ult = 0;
  player.ultActive = 7.5;
  player.invuln = 0.9;
  player.fovPunch = 1;
  sfx.ult();
  shake = 0.5;
  const fx = $('ult-fx');
  fx.classList.remove('on');
  void fx.offsetWidth;
  fx.classList.add('on');
  setTimeout(() => fx.classList.remove('on'), 1050);
  world.triggerPulse(player.pos.x, player.pos.z, 1.4);
  spawnWave(player.pos.x, player.pos.z, { speed: 38, max: 60, dmg: 75, colorA: 0xff8ac4, colorB: 0x6effe0, height: 7, shock: true });
  spawnWave(player.pos.x, player.pos.z, { speed: 26, max: 46, colorA: 0x6effe0, colorB: 0xff8ac4, height: 3 });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    sparks.burst(player.pos.x + Math.cos(a) * 1.4, 0.7 + Math.random() * 1.2, player.pos.z + Math.sin(a) * 1.4, 18, i % 2 ? [1, 0.45, 0.75] : [0.35, 1, 0.9], 1.6, 3);
  }
  for (const e of enemies) if (e.alive) e.revealUntil = clockT + 10;
  toast('PRISMATIC BREACH // TIME FRACTURE');
  $('ability-ult').classList.add('charged');
  setTimeout(() => $('ability-ult').classList.remove('charged'), 400);
}

function alertEnemies(radius = 24) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.pos.distanceTo(player.pos) < radius) { e.alert = 1; e.lastSeen.copy(player.pos); }
  }
}

/* ============================================================
   HUD
   ============================================================ */
function updateAmmoHud() {
  $('ammo').textContent = player.ammo[stats.w];
  $('reserve').textContent = player.reserve[stats.w];
  $('weapon-name').textContent = currentWeapon().name;
  document.querySelectorAll('.weapon-slot').forEach((el, i) => el.classList.toggle('active', i === stats.w));
  $('weapon-name').nextElementSibling.innerHTML = `${currentWeapon().klass} <b>•</b> ${currentWeapon().mode}`;
}
function updateHealthHud() {
  $('health').textContent = Math.max(0, Math.ceil(player.health));
  $('health-bar').style.width = Math.max(0, player.health) + '%';
  $('health-bar').style.background = player.health < 35 ? '#ff6b5b' : 'var(--teal)';
  document.querySelector('.armor-badge b').textContent = Math.max(0, Math.ceil(player.armor));
}
function updateMissionHud() {
  $('progress').textContent = `${phase.kills} / 8`;
  $('progress-bar').style.width = (phase.kills / 8 * 100) + '%';
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 2200);
}
function setWeapon(i) {
  if (i === stats.w) return;
  stats.w = i;
  weapons.setActive(i);
  player.reloadT = 0;
  $('reload').classList.remove('show');
  updateAmmoHud();
}

/* ============================================================
   MINIMAP
   ============================================================ */
const mini = $('minimap');
const mctx = mini.getContext('2d');
function drawMinimap() {
  const w = mini.width, h = mini.height;
  const s = w / (ARENA * 2 + 8);
  const cx = w / 2, cy = h / 2;
  mctx.clearRect(0, 0, w, h);
  mctx.fillStyle = 'rgba(4,18,20,0.92)';
  mctx.fillRect(0, 0, w, h);
  // rings
  mctx.strokeStyle = 'rgba(100,240,220,0.10)';
  mctx.lineWidth = 1;
  for (let r = 12; r < 46; r += 12) {
    mctx.beginPath(); mctx.arc(cx, cy, r * s, 0, Math.PI * 2); mctx.stroke();
  }
  // boundary
  mctx.strokeStyle = 'rgba(120,245,225,0.32)';
  mctx.strokeRect(cx - ARENA * s, cy - ARENA * s, ARENA * 2 * s, ARENA * 2 * s);
  // obstacles
  for (const c of colliders) {
    if (c.tag === 'wall') continue;
    mctx.fillStyle = c.tag === 'dais' ? 'rgba(80,220,200,0.1)' : 'rgba(120,235,215,0.16)';
    mctx.fillRect(cx + c.minX * s, cy + c.minZ * s, (c.maxX - c.minX) * s, (c.maxZ - c.minZ) * s);
    mctx.strokeStyle = 'rgba(120,245,225,0.22)';
    mctx.lineWidth = 0.6;
    mctx.strokeRect(cx + c.minX * s, cy + c.minZ * s, (c.maxX - c.minX) * s, (c.maxZ - c.minZ) * s);
  }
  // player triangle
  const px = cx + player.pos.x * s, pz = cy + player.pos.z * s;
  mctx.save();
  mctx.translate(px, pz);
  mctx.rotate(-player.yaw + Math.PI);
  mctx.fillStyle = '#b9fff2';
  mctx.beginPath(); mctx.moveTo(0, -5); mctx.lineTo(3.5, 4); mctx.lineTo(0, 2.2); mctx.lineTo(-3.5, 4); mctx.closePath(); mctx.fill();
  mctx.restore();
  // sonar sweep
  const sweep = (clockT * 1.2) % (Math.PI * 2);
  mctx.strokeStyle = 'rgba(104,246,220,0.13)';
  mctx.beginPath(); mctx.moveTo(px, pz); mctx.arc(px, pz, 40 * s, sweep, sweep + 0.5); mctx.closePath(); mctx.fillStyle = 'rgba(104,246,220,0.045)'; mctx.fill();
  // enemies
  for (const e of enemies) {
    if (!e.alive) continue;
    const near = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 17;
    const visible = e.alert > 0 || clockT < e.revealUntil || near;
    if (!visible) continue;
    const x = cx + e.pos.x * s, y = cy + e.pos.z * s;
    mctx.fillStyle = clockT < e.revealUntil ? '#ffb066' : near && e.alert <= 0 ? 'rgba(255,109,157,0.6)' : '#ff6d9d';
    mctx.beginPath(); mctx.arc(x, y, 2.3, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = clockT < e.revealUntil ? 'rgba(255,176,102,0.45)' : 'rgba(255,109,157,0.35)';
    mctx.beginPath(); mctx.arc(x, y, 5, 0, Math.PI * 2); mctx.stroke();
  }
  // pickups
  for (const p of pickups) {
    if (!p.active) continue;
    mctx.fillStyle = '#6effd8';
    mctx.fillRect(cx + p.x * s - 1.4, cy + p.z * s - 1.4, 2.8, 2.8);
  }
  $('coords').textContent = `${'ABCDEFG'[Math.min(6, Math.floor((player.pos.x + ARENA) / 13))]}-${String(Math.min(9, Math.max(1, Math.floor((player.pos.z + ARENA) / 9)))).padStart(2, '0')}`;
}

/* ============================================================
   GAME FLOW
   ============================================================ */
function resetGame() {
  for (const e of enemies) scene.remove(e.group);
  enemies.length = 0;
  for (const p of pickups) { p.active = true; p.group.visible = true; }
  spawnEnemies();
  player.pos.set(13, 0, 33);
  player.vel.set(0, 0, 0);
  player.yaw = 0.38; player.pitch = -0.03;
  player.health = 100; player.armor = 50;
  player.dashCD = 0; player.scanCD = 0; player.ult = 40; player.ultActive = 0;
  player.ammo = [25, 12, 30]; player.reserve = [75, 48, 90];
  player.reloadT = 0; player.invuln = 2;
  phase.mode = 'playing'; phase.time = 90; phase.elapsed = 0; phase.kills = 0; phase.shots = 0; phase.hits = 0; phase.endScheduled = 0; phase.grace = 2.4;
  stats.w = 0; weapons.setActive(0);
  for (const w of waves) { scene.remove(w.mesh); scene.remove(w.ring); scene.remove(w.ring2); }
  waves.length = 0;
  for (const s of shardPool) { s.life = 0; s.mesh.visible = false; }
  for (const tr of tracers) { tr.life = 0; tr.line.material.opacity = 0; }
  $('kill-feed').innerHTML = '';
  $('result-overlay').classList.add('hidden');
  $('pause-overlay').classList.add('hidden');
  $('round-banner').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('round-banner').style.display = 'none';
  $('hud').classList.remove('ended');
  weapons.setVisible(true);
  timeScale = 1;
  updateAmmoHud(); updateHealthHud(); updateMissionHud();
  lastFrame = performance.now();
}

function startGame() {
  initAudio();
  sfx.start();
  document.body.classList.remove('menu-mode');
  resetGame();
  document.body.requestPointerLock?.();
  toast('MISSION LIVE // ELIMINATE 8 HOSTILES');
}

function endGame(won, title, copy) {
  if (phase.mode === 'over') return;
  phase.mode = 'over';
  phase.overT = 0;
  document.exitPointerLock?.();
  const ov = $('result-overlay');
  ov.classList.remove('hidden');
  $('result-title').innerHTML = won ? 'SECTOR<br/><em>SECURED.</em>' : `${title.split(' ')[0]}<br/><em>${title.split(' ').slice(1).join(' ') || 'LOST.'}</em>`;
  $('result-kicker').textContent = won ? 'SIMULATION COMPLETE' : 'SIMULATION TERMINATED';
  $('result-copy').textContent = copy;
  $('final-kills').textContent = phase.kills;
  $('final-time').textContent = formatTime(phase.elapsed);
  $('final-accuracy').textContent = (phase.shots ? Math.round(phase.hits / phase.shots * 100) : 0) + '%';
  $('hud').classList.add('ended');
  weapons.setVisible(false);
  if (won) sfx.win(); else sfx.lose();
}

function formatTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pauseGame() {
  if (phase.mode !== 'playing') return;
  phase.mode = 'paused';
  document.exitPointerLock?.();
  $('pause-overlay').classList.remove('hidden');
}
function resumeGame() {
  if (phase.mode !== 'paused') return;
  phase.mode = 'playing';
  $('pause-overlay').classList.add('hidden');
  lastFrame = performance.now();
  document.body.requestPointerLock?.();
}

/* ============================================================
   INPUT
   ============================================================ */
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  input.keys[e.code] = true;
  if (e.code === 'Escape') {
    if (phase.mode === 'playing') pauseGame();
    else if (phase.mode === 'paused') resumeGame();
  }
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyQ') doUlt();
  if (e.code === 'KeyE') doDash();
  if (e.code === 'KeyC') doScan();
  if (e.code === 'Digit1') setWeapon(0);
  if (e.code === 'Digit2') setWeapon(1);
  if (e.code === 'Digit3') setWeapon(2);
});
window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });

window.addEventListener('mousedown', (e) => {
  if (phase.mode !== 'playing') return;
  if (e.button === 0) { input.firing = true; player.weaponReady = true; if (currentWeapon().mode === 'SEMI') fire(); }
  if (e.button === 2) { input.aim = true; e.preventDefault(); }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) { input.firing = false; player.weaponReady = false; }
  if (e.button === 2) input.aim = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
const MOUSE_SENS = 0.0021;
window.addEventListener('mousemove', (e) => {
  if (phase.mode !== 'playing') return;
  if (document.pointerLockElement !== document.body) return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  player.yaw -= dx * MOUSE_SENS;
  player.pitch -= dy * MOUSE_SENS;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.45, 1.45);
  input.mouseDX += dx; input.mouseDY += dy;
});
document.addEventListener('pointerlockchange', () => {
  if (phase.mode === 'playing' && document.pointerLockElement === null && player.everLocked) pauseGame();
});
document.addEventListener('pointerlockerror', () => { /* headless / unsupported: keep playing */ });
// track lock success
const lockCheck = setInterval(() => { if (document.pointerLockElement === document.body) player.everLocked = true; }, 400);

$('start-btn').addEventListener('click', startGame);
$('restart-btn').addEventListener('click', startGame);
$('resume-btn').addEventListener('click', resumeGame);
document.querySelector('.menu-chip').addEventListener('click', () => {
  if (phase.mode === 'playing') pauseGame();
  else if (phase.mode === 'paused') resumeGame();
});

/* touch */
const stick = $('touch-stick');
const stickKnob = stick?.querySelector('i');
let stickId = null, stickOrigin = { x: 0, y: 0 };
function touchStart(e) {
  const t = e.changedTouches[0];
  stickId = t.identifier;
  const r = stick.getBoundingClientRect();
  stickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  touchMove(e);
}
function touchMove(e) {
  if (stickId === null) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== stickId) continue;
    let dx = t.clientX - stickOrigin.x, dy = t.clientY - stickOrigin.y;
    const max = 40, l = Math.hypot(dx, dy);
    if (l > max) { dx *= max / l; dy *= max / l; }
    input.touchMove.x = dx / max;
    input.touchMove.y = -dy / max;
    if (stickKnob) { stickKnob.style.transform = `translate(${dx}px,${dy}px)`; }
  }
}
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === stickId) { stickId = null; input.touchMove.x = 0; input.touchMove.y = 0; if (stickKnob) stickKnob.style.transform = ''; }
  }
}
if (stick) {
  stick.addEventListener('touchstart', (e) => { e.preventDefault(); touchStart(e); }, { passive: false });
  stick.addEventListener('touchmove', (e) => { e.preventDefault(); touchMove(e); }, { passive: false });
  stick.addEventListener('touchend', touchEnd);
  stick.addEventListener('touchcancel', touchEnd);
}
function bindTouch(el, down, up) {
  if (!el) return;
  el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
  el.addEventListener('touchend', (e) => { e.preventDefault(); up?.(); }, { passive: false });
  el.addEventListener('touchcancel', () => up?.());
}
bindTouch($('touch-fire'), () => { input.firing = true; input.touchFire = true; fire(); }, () => { input.firing = false; input.touchFire = false; });
bindTouch($('touch-jump'), () => { if (player.onGround) { player.vel.y = 7.2; player.onGround = false; } });
bindTouch($('touch-dash'), doDash);
bindTouch($('touch-scan'), doScan);
bindTouch($('touch-ult'), doUlt);
bindTouch($('touch-reload'), reload);
bindTouch($('touch-weapon'), () => setWeapon((stats.w + 1) % 3));

// touch look: swipe on right half of screen
let lookId = null, lookLast = { x: 0, y: 0 };
renderer.domElement.addEventListener('touchstart', (e) => {
  if (phase.mode !== 'playing') return;
  for (const t of e.changedTouches) {
    if (t.clientX > window.innerWidth * 0.42 && t.clientY < window.innerHeight * 0.75) {
      lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY };
    }
  }
}, { passive: true });
renderer.domElement.addEventListener('touchmove', (e) => {
  if (lookId === null) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== lookId) continue;
    const dx = t.clientX - lookLast.x, dy = t.clientY - lookLast.y;
    lookLast = { x: t.clientX, y: t.clientY };
    player.yaw -= dx * 0.004;
    player.pitch = THREE.MathUtils.clamp(player.pitch - dy * 0.004, -1.4, 1.4);
    input.mouseDX += dx; input.mouseDY += dy;
  }
}, { passive: true });
renderer.domElement.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
});

/* ============================================================
   UPDATE
   ============================================================ */
function updatePlayer(dt, t) {
  const hasTouch = isTouch && (input.touchMove.x || input.touchMove.y);
  let forward = 0, right = 0;
  if (phase.mode === 'playing') {
    forward = (input.keys.KeyW || input.keys.ArrowUp ? 1 : 0) - (input.keys.KeyS || input.keys.ArrowDown ? 1 : 0);
    right = (input.keys.KeyD || input.keys.ArrowRight ? 1 : 0) - (input.keys.KeyA || input.keys.ArrowLeft ? 1 : 0);
    if (hasTouch) { forward = input.touchMove.y; right = input.touchMove.x; }
    if (input.keys.Space && player.onGround) { player.vel.y = 7.2; player.onGround = false; }
  }
  player.sprinting = (input.keys.ShiftLeft || input.keys.ShiftRight) && forward > 0.2 && !input.aim;
  const baseSpeed = input.aim ? 3.3 : player.sprinting ? 8.4 : 5.6;
  const dir = new THREE.Vector3();
  const yawDir = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const rightDir = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  dir.addScaledVector(yawDir, forward).addScaledVector(rightDir, right);
  if (dir.lengthSq() > 1) dir.normalize();

  if (player.dashT > 0) {
    player.dashT -= dt;
    player.vel.x = player.dashDir.x * 31;
    player.vel.z = player.dashDir.z * 31;
    if (Math.random() < 0.55) sparks.burst(player.pos.x, 1 + Math.random() * 0.6, player.pos.z, 2, [0.4, 1, 0.95], 0.4, 1);
  } else {
    const targetX = dir.x * baseSpeed, targetZ = dir.z * baseSpeed;
    const accel = player.onGround ? 16 : 5;
    player.vel.x += (targetX - player.vel.x) * Math.min(1, dt * accel);
    player.vel.z += (targetZ - player.vel.z) * Math.min(1, dt * accel);
  }
  // gravity
  player.vel.y -= 23 * dt;
  player.pos.y += player.vel.y * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.vel.y = 0; player.onGround = true; }
  // horizontal with collision
  const beforeX = player.pos.x, beforeZ = player.pos.z;
  moveWithCollision(player.pos, player.vel.x * dt, player.vel.z * dt, 0.43);
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -ARENA + 2, ARENA - 2);
  player.pos.z = THREE.MathUtils.clamp(player.pos.z, -ARENA + 2, ARENA - 2);
  const moved = Math.hypot(player.pos.x - beforeX, player.pos.z - beforeZ) / Math.max(dt, 0.0001);
  player.moveSpeed = Math.min(moved, 12);

  // footsteps
  if (player.onGround && player.moveSpeed > 2) {
    footstepT -= dt * player.moveSpeed;
    if (footstepT <= 0) { footstepT = 4.5; sfx.step(); }
  }

  // cooldowns
  player.dashCD = Math.max(0, player.dashCD - dt);
  player.scanCD = Math.max(0, player.scanCD - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.reloadT > 0) {
    player.reloadT -= dt * 1000;
    if (player.reloadT <= 0) {
      const w = currentWeapon();
      const need = w.mag - player.ammo[stats.w];
      const take = Math.min(need, player.reserve[stats.w]);
      player.ammo[stats.w] += take;
      player.reserve[stats.w] -= take;
      $('reload').classList.remove('show');
      updateAmmoHud();
    }
  }
  // firing
  if (phase.mode === 'playing' && input.firing) {
    const w = currentWeapon();
    if (!player.fireT || player.fireT <= 0) {
      if (w.mode === 'AUTO' || input.touchFire) { fire(); player.fireT = w.rate; }
    }
  }
  if (player.fireT > 0) player.fireT -= dt;

  // camera
  const bobAmt = player.onGround ? Math.min(1, player.moveSpeed / 6) : 0;
  player.bob += dt * (6 + player.moveSpeed * 1.1);
  const bobY = Math.sin(player.bob * 2) * 0.022 * bobAmt;
  const bobX = Math.cos(player.bob) * 0.018 * bobAmt;
  const eye = 1.66 + bobY - (player.sprinting ? 0.04 : 0);
  camera.position.set(player.pos.x + bobX, player.pos.y + eye, player.pos.z);
  camera.rotation.set(player.pitch + cameraShakeX(), player.yaw + cameraShakeY(), dashFlash * 0.06);

  // FOV
  const baseFov = isTouch ? (camera.aspect > 1.15 ? 68 : 84) : 74;
  player.fovPunch = Math.max(0, (player.fovPunch || 0) - dt * 1.5);
  const targetFov = (input.aim ? (isTouch ? 56 : 49) : (player.sprinting ? baseFov + 6 : baseFov)) + player.fovPunch * 9;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();

  // weapon view
  weapons.update(dt, t, input.aim, player.moveSpeed, player.onGround, input.mouseDX, input.mouseDY, player.sprinting && player.moveSpeed > 4);
  input.mouseDX *= 0.82; input.mouseDY *= 0.82;

  // hud ability states
  $('ability-dash').classList.toggle('cooling', player.dashCD > 0);
  $('ability-dash').querySelector('.cooldown').style.transform = `scaleX(${player.dashCD / 8})`;
  $('ability-scan').classList.toggle('cooling', player.scanCD > 0);
  $('ability-scan').querySelector('.cooldown').style.transform = `scaleX(${player.scanCD / 14})`;
  $('ult-bar').style.width = Math.min(100, player.ult) + '%';
  $('ability-ult').classList.toggle('charged', player.ult >= 100);
  if (isTouch) {
    const ub = $('touch-ult');
    ub.classList.toggle('charged', player.ult >= 100);
    ub.textContent = player.ult >= 100 ? 'Q!' : 'Q';
  }
  $('reticle').classList.toggle('wide', player.moveSpeed > 4 || player.fireT > 0.02);
}

function cameraShakeX() { return (Math.random() - 0.5) * shake * 0.16; }
function cameraShakeY() { return (Math.random() - 0.5) * shake * 0.16; }

function updatePickups(dt, t) {
  for (const p of pickups) {
    if (!p.active) { p.respawn -= dt; if (p.respawn <= 0) { p.active = true; p.group.visible = true; } continue; }
    p.core.rotation.y += dt * 1.5;
    p.core.rotation.x += dt * 0.7;
    p.ring.rotation.z += dt * 0.8;
    p.ring2.rotation.z -= dt * 1.2;
    p.group.position.y = 1.1 + Math.sin(t * 2 + p.x) * 0.14;
    if (phase.mode === 'playing' && player.health < 100) {
      const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
      if (dx * dx + dz * dz < 2.6) {
        player.health = Math.min(100, player.health + 38);
        p.active = false; p.group.visible = false; p.respawn = 24;
        sparks.burst(p.x, 1.2, p.z, 22, [0.4, 1, 0.85], 1, 3);
        sfx.pulse();
        toast('REPAIR NODE // +38 HEALTH');
        updateHealthHud();
      }
    }
  }
}

function updateWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    w.r += w.speed * dt;
    const k = w.r;
    w.mesh.scale.set(k, 1, k);
    w.ring.scale.setScalar(k);
    w.ring2.scale.setScalar(k);
    w.mesh.material.uniforms.uFade.value = Math.max(0, 1 - w.r / w.max);
    w.ring.material.opacity = Math.max(0, 0.9 * (1 - w.r / w.max));
    w.ring2.material.opacity = Math.max(0, 0.22 * (1 - w.r / w.max));
    if (w.dmg) {
      for (const e of enemies) {
        if (!e.alive || w.hit.has(e)) continue;
        const d = Math.hypot(e.pos.x - w.origin.x, e.pos.z - w.origin.y);
        if (Math.abs(d - w.r) < 2.5) {
          w.hit.add(e);
          e.revealUntil = Math.max(e.revealUntil, clockT + 8);
          damageEnemy(e, w.dmg, false, new THREE.Vector3(e.pos.x, 1.2, e.pos.z), new THREE.Vector3(0, 0, 0));
          sparks.burst(e.pos.x, 1.2, e.pos.z, 16, [1, 0.5, 0.75], 1.2, 3);
        }
      }
    }
    if (w.r >= w.max) {
      scene.remove(w.mesh); scene.remove(w.ring); scene.remove(w.ring2);
      w.mesh.geometry.dispose(); w.ring.geometry.dispose(); w.ring2.geometry.dispose();
      waves.splice(i, 1);
    }
  }
}

function updateTracers(dt) {
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, (t.life / t.maxLife) * 0.9);
    } else t.line.material.opacity = 0;
  }
}

/* ============================================================
   LOOP
   ============================================================ */
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  clockT += rawDt;
  const dt = rawDt;

  if (phase.mode === 'playing') {
    phase.time -= rawDt;
    phase.elapsed += rawDt;
    phase.grace = Math.max(0, (phase.grace || 0) - rawDt);
    if (phase.time <= 0) {
      phase.time = 0;
      endGame(false, 'TIME EXPIRED', phase.kills > 5 ? 'So close. The Glasshouse held — but only barely.' : 'The window closed. Sharpen the angles and run it again.');
    }
    if (phase.endScheduled > 0) {
      phase.endScheduled -= rawDt;
      if (phase.endScheduled <= 0) endGame(true, '', 'All eight sentinels neutralized. Extraction is yours, runner.');
    }
    if (phase.mode === 'playing') updatePlayer(dt, clockT);
    // ult slow-mo
    const slow = player.ultActive > 0;
    if (slow) {
      player.ultActive -= dt;
      if (player.ultActive <= 0) { timeScale = 1; toast('TIME FRACTURE COLLAPSED'); }
    }
    updateEnemies(dt, clockT);
    updatePickups(dt, clockT);
    updateWaves(dt);
    updateTracers(dt);
    sparks.update(dt);
    updateShatter(dt);
    world.update(clockT, slow ? dt * 0.55 : dt);
    // alert nearby enemies when firing
    if (player.fireT > 0.09) alertEnemies(30);

    // hud
    $('timer').textContent = formatTime(phase.time);
    $('timer').style.color = phase.time < 15 ? '#ff806a' : '';
  } else if (phase.mode === 'paused' || phase.mode === 'over') {
    updateTracers(dt * 0.4);
    sparks.update(dt * 0.25);
    updateShatter(dt * 0.25);
    world.update(clockT, dt * 0.18);
    updatePickups(dt * 0.2, clockT);
    updateEnemies(0, clockT);
    $('timer').textContent = formatTime(phase.time);
    if (phase.mode === 'over') {
      phase.overT = (phase.overT || 0) + rawDt;
      const a = phase.overT * 0.055 + 1.2;
      camera.position.set(Math.cos(a) * 31, 17 + Math.sin(phase.overT * 0.2) * 2, Math.sin(a) * 31);
      camera.lookAt(0, 11, 0);
      camera.fov = 62;
      camera.updateProjectionMatrix();
    }
  } else {
    // menu cinematic
    menuT += dt;
    const r = 35;
    const a = menuT * 0.065;
    camera.position.set(Math.cos(a) * r, 14 + Math.sin(menuT * 0.25) * 2.2, Math.sin(a) * r);
    camera.lookAt(0, 6.5, 0);
    camera.fov = 62;
    camera.updateProjectionMatrix();
    world.update(clockT, dt);
    sparks.update(dt);
    for (const e of enemies) {
      if (!e.alive) continue;
      e.group.rotation.y = Math.atan2(camera.position.x - e.pos.x, camera.position.z - e.pos.z);
      e.parts.core.rotation.y += dt * 1.5;
      e.group.position.y = (e.type === 'weaver' ? 0.35 : 0) + Math.sin(clockT * 1.5 + e.walkPhase) * 0.05;
      e.bar.visible = false;
      e.marker.visible = false;
    }
    updateWaves(dt); updateTracers(dt); updatePickups(dt, clockT); updateShatter(dt);
    drawMinimap();
  }

  // global FX decay
  shake = Math.max(0, shake - dt * 2.4);
  damageFlash = Math.max(0, damageFlash - dt * 2.6);
  dashFlash = Math.max(0, dashFlash - dt * 4);
  revealFlash = Math.max(0, revealFlash - dt * 1.2);
  grade.uniforms.uTime.value = clockT;
  grade.uniforms.uDamage.value = damageFlash;
  grade.uniforms.uUlt.value = player.ultActive > 0 ? Math.min(1, player.ultActive) * (0.72 + Math.sin(clockT * 7) * 0.1) : 0;
  grade.uniforms.uDash.value = dashFlash;
  grade.uniforms.uReveal.value = revealFlash;
  bloom.strength = 0.82 + (player.ultActive > 0 ? 0.25 : 0) + damageFlash * 0.16;

  if (phase.mode === 'playing') drawMinimap();
  composer.render();
}
requestAnimationFrame(frame);

/* resize */
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w * 0.5, h * 0.5);
});

/* pre-warm one enemy set for the menu silhouette */
spawnEnemies();
weapons.setVisible(false);
document.body.classList.add('menu-mode');
if (isTouch) document.body.classList.add('is-touch');
if (isTouch) {
  const bc = document.querySelector('.banner-controls');
  if (bc) bc.innerHTML = '<span>◉ STICK · MOVE</span><span>◉ SWIPE · AIM</span><span>◉ TAP · FIRE</span><span>◉ Q · ULT</span>';
  document.querySelector('.menu-chip').innerHTML = 'II PAUSE';
  const pc = document.querySelector('.pause-card small');
  if (pc) pc.textContent = 'TAP RESUME TO RETURN';
}

/* dev/testing hook */
window.__prism = {
  player, phase, enemies, weapons, input,
  start: startGame,
  fire, doDash, doScan, doUlt, reload,
  setWeapon,
  look(yaw, pitch = 0) { player.yaw = yaw; player.pitch = pitch; },
  hurt: (n) => hurtPlayer(n),
  damage: (e, n) => damageEnemy(e, n, false, null, null),
  end: endGame
};
updateAmmoHud();
updateHealthHud();
updateMissionHud();
