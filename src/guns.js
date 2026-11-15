import * as THREE from 'three';

const IS_TOUCH = typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

export const WEAPONS = [
  {
    id: 'vandal', name: 'VANDAL', klass: 'ASSAULT RIFLE', mode: 'AUTO',
    damage: 38, head: 2.85, rate: 0.108, mag: 25, reserve: 75, reload: 2.15,
    spread: 0.006, moveSpread: 0.016, recoil: 0.022, kick: 0.085, range: 140,
    color: 0x5cf6dd, accent: 0xff7f5f, sound: 'rifle'
  },
  {
    id: 'ghost', name: 'GHOST', klass: 'SIDEARM', mode: 'SEMI',
    damage: 46, head: 3.1, rate: 0.17, mag: 12, reserve: 48, reload: 1.55,
    spread: 0.0025, moveSpread: 0.01, recoil: 0.03, kick: 0.1, range: 110,
    color: 0x8ab8ff, accent: 0xcfe6ff, sound: 'pistol'
  },
  {
    id: 'spectre', name: 'SPECTRE', klass: 'SUBMACHINE GUN', mode: 'AUTO',
    damage: 24, head: 2.15, rate: 0.073, mag: 30, reserve: 90, reload: 1.9,
    spread: 0.011, moveSpread: 0.02, recoil: 0.012, kick: 0.045, range: 95,
    color: 0xff86b7, accent: 0xffd166, sound: 'smg'
  }
];

const metal = new THREE.MeshStandardMaterial({ color: 0x5d737c, metalness: 0.4, roughness: 0.34, emissive: 0x08181c, emissiveIntensity: 0.8, envMapIntensity: 1.5 });
const dark = new THREE.MeshStandardMaterial({ color: 0x223037, metalness: 0.35, roughness: 0.6, envMapIntensity: 1.25 });
const grip = new THREE.MeshStandardMaterial({ color: 0x35474d, metalness: 0.18, roughness: 0.85, envMapIntensity: 1.1 });
const glove = new THREE.MeshStandardMaterial({ color: 0x182a32, metalness: 0.3, roughness: 0.7 });
const gloveTrim = new THREE.MeshStandardMaterial({ color: 0x2b6c6a, metalness: 0.5, roughness: 0.4, emissive: 0x0c302e, emissiveIntensity: 0.7 });

function box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  return m;
}
function cyl(r1, r2, h, mat, seg = 10) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
}

function glowMat(color, intensity = 2.6) {
  return new THREE.MeshStandardMaterial({
    color: 0x0a2325, emissive: color, emissiveIntensity: 0.55,
    metalness: 0.4, roughness: 0.35
  });
}

function addHands(g, color) {
  const r = box(0.09, 0.085, 0.24, glove, 0.02, -0.115, -0.1, 0.18, 0, 0);
  const l = box(0.082, 0.075, 0.2, glove, -0.03, -0.1, 0.16, -0.1, 0, 0);
  const trim = box(0.094, 0.022, 0.05, gloveTrim, 0.02, -0.085, -0.01, 0.18, 0, 0);
  const trim2 = box(0.088, 0.02, 0.045, gloveTrim, -0.03, -0.07, 0.22, -0.1, 0, 0);
  g.add(r, l, trim, trim2);
  // forearm sleeves
  const s1 = box(0.1, 0.1, 0.26, dark, 0.04, -0.16, 0.05, 0.35, -0.2, 0);
  const s2 = box(0.09, 0.09, 0.3, dark, -0.06, -0.14, 0.28, 0.55, 0.2, 0);
  const t1 = box(0.104, 0.014, 0.06, glowMat(color), 0.04, -0.11, 0.02, 0.35, -0.2, 0);
  const t2 = box(0.094, 0.014, 0.06, glowMat(color), -0.06, -0.09, 0.25, 0.55, 0.2, 0);
  g.add(s1, s2, t1, t2);
}

function buildRifle(color, accent) {
  const g = new THREE.Group();
  const trim = glowMat(color, 2.6);
  const hot = glowMat(accent, 3);
  // receiver
  g.add(box(0.085, 0.115, 0.46, metal, 0, 0, 0));
  g.add(box(0.07, 0.035, 0.3, dark, 0, 0.072, -0.02));
  // barrel + shroud
  const barrel = cyl(0.021, 0.021, 0.3, dark, 12);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.012, -0.36); g.add(barrel);
  const shroud = cyl(0.042, 0.048, 0.2, metal, 8);
  shroud.rotation.x = Math.PI / 2; shroud.position.set(0, 0.02, -0.24); g.add(shroud);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.006, 4, 8), trim);
    fin.position.set(0, 0.02, -0.18 - i * 0.055); g.add(fin);
  }
  // stock
  g.add(box(0.06, 0.09, 0.24, dark, 0, -0.012, 0.33, 0.06));
  g.add(box(0.075, 0.035, 0.2, metal, 0, 0.038, 0.3));
  // magazine
  g.add(box(0.055, 0.17, 0.1, dark, 0, -0.115, 0.0, 0.12));
  g.add(box(0.058, 0.02, 0.1, trim, 0, -0.2, 0.01, 0.12));
  // grip
  g.add(box(0.055, 0.15, 0.07, grip, 0, -0.118, 0.14, -0.2));
  // rail + scope
  g.add(box(0.05, 0.024, 0.2, metal, 0, 0.092, -0.03));
  const scope = cyl(0.035, 0.035, 0.12, dark, 12);
  scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.132, -0.04); g.add(scope);
  const lens = cyl(0.01, 0.01, 0.006, glowMat(0x2c7f7a), 12);
  lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.132, -0.102); g.add(lens);
  const backLens = lens.clone(); backLens.position.z = 0.022; backLens.scale.setScalar(0.7); g.add(backLens);
  // side energy cells (dashed light strip)
  for (let i = 0; i < 3; i++) {
    g.add(box(0.012, 0.032, 0.045, trim, 0.047, 0.012, -0.06 + i * 0.065));
    g.add(box(0.012, 0.032, 0.045, trim, -0.047, 0.012, -0.06 + i * 0.065));
  }
  g.add(box(0.006, 0.012, 0.34, trim, 0.043, 0.048, 0.02));
  g.add(box(0.006, 0.012, 0.34, trim, -0.043, 0.048, 0.02));
  g.add(box(0.006, 0.012, 0.3, trim, -0.045, -0.04, 0.02));
  g.add(box(0.05, 0.028, 0.12, trim, 0, 0.04, 0.27));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), glowMat(accent));
  core.position.set(0.05, -0.02, 0.11); g.add(core);
  const core2 = core.clone(); core2.position.x = -0.05; g.add(core2);
  // muzzle brake
  const brake = box(0.06, 0.06, 0.075, metal, 0, 0.012, -0.5);
  g.add(brake);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, -0.545); g.add(muzzle);
  addHands(g, color);
  return { group: g, muzzle };
}

function buildPistol(color, accent) {
  const g = new THREE.Group();
  const trim = glowMat(color, 2.8);
  const hot = glowMat(accent, 3);
  g.add(box(0.055, 0.075, 0.26, metal, 0, 0, -0.02));
  const slide = box(0.05, 0.035, 0.24, dark, 0, 0.055, -0.03); g.add(slide);
  const barrel = cyl(0.016, 0.016, 0.1, dark, 10);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.035, -0.16); g.add(barrel);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.035, -0.22); g.add(muzzle);
  // grip angled
  g.add(box(0.05, 0.17, 0.075, grip, 0, -0.105, 0.075, 0.22));
  g.add(box(0.054, 0.02, 0.075, trim, 0, -0.185, 0.095, 0.22));
  // sights
  g.add(box(0.012, 0.018, 0.02, hot, 0, 0.08, -0.13));
  g.add(box(0.02, 0.014, 0.018, dark, 0, 0.08, 0.05));
  // trigger guard
  g.add(box(0.018, 0.018, 0.06, dark, 0, -0.045, 0.02));
  // side lines
  g.add(box(0.006, 0.01, 0.18, trim, 0.029, 0.015, -0.03));
  g.add(box(0.006, 0.01, 0.18, trim, -0.029, 0.015, -0.03));
  const cell = box(0.016, 0.03, 0.045, hot, 0.031, -0.02, -0.02); g.add(cell);
  addHands(g, color);
  return { group: g, muzzle };
}

function buildSMG(color, accent) {
  const g = new THREE.Group();
  const trim = glowMat(color, 2.7);
  const hot = glowMat(accent, 3);
  g.add(box(0.075, 0.1, 0.3, metal, 0, 0, 0.02));
  const barrel = cyl(0.018, 0.018, 0.16, dark, 10);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.21); g.add(barrel);
  const shroud = cyl(0.036, 0.04, 0.11, metal, 8);
  shroud.rotation.x = Math.PI / 2; shroud.position.set(0, 0.012, -0.16); g.add(shroud);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, -0.3); g.add(muzzle);
  // drum magazine
  const drum = cyl(0.085, 0.085, 0.055, dark, 16);
  drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.105, 0.0); g.add(drum);
  const drumRing = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.008, 5, 20), trim);
  drumRing.rotation.y = Math.PI / 2; drumRing.position.set(0.029, -0.105, 0.0); g.add(drumRing);
  const drumRing2 = drumRing.clone(); drumRing2.position.x = -0.029; g.add(drumRing2);
  g.add(box(0.05, 0.13, 0.06, grip, 0, -0.1, 0.12, -0.18));
  // folding stock
  g.add(box(0.02, 0.02, 0.2, metal, 0, 0.05, 0.22, 0.16));
  g.add(box(0.06, 0.09, 0.025, dark, 0, 0.02, 0.31));
  // top rail + holo
  g.add(box(0.045, 0.02, 0.18, metal, 0, 0.064, -0.02));
  const holo = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 5, 16), trim);
  holo.position.set(0, 0.11, 0.01); g.add(holo);
  const holoGlass = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0xff86b7, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  holoGlass.position.copy(holo.position); g.add(holoGlass);
  g.add(box(0.01, 0.045, 0.14, hot, 0.039, -0.01, 0.0));
  g.add(box(0.01, 0.045, 0.14, hot, -0.039, -0.01, 0.0));
  addHands(g, color);
  return { group: g, muzzle };
}

export function createWeapons(camera) {
  const rig = new THREE.Group();
  camera.add(rig);
  // soft fill from the viewer side so the viewmodel never reads as a silhouette
  const rigFill = new THREE.PointLight(0xbfe9ff, 1.35, 3.2, 2);
  rigFill.position.set(-0.1, 0.32, 0.55);
  rig.add(rigFill);
  const rigRim = new THREE.PointLight(0x59f0d8, 0.75, 2.2, 2);
  rigRim.position.set(0.55, -0.25, -0.1);
  rig.add(rigRim);
  const rigSide = new THREE.PointLight(0xa9e8ff, 0.95, 2.6, 2);
  rigSide.position.set(-0.45, 0.05, 0.3);
  rig.add(rigSide);

  const built = [buildRifle(WEAPONS[0].color, WEAPONS[0].accent), buildPistol(WEAPONS[1].color, WEAPONS[1].accent), buildSMG(WEAPONS[2].color, WEAPONS[2].accent)];
  built.forEach((b, i) => {
    b.group.visible = i === 0;
    b.group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; o.renderOrder = 5; } });
    rig.add(b.group);
  });

  // muzzle flashes
  const flashMat = new THREE.SpriteMaterial({ color: 0xffe3bd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.setScalar(0.6);
  flash.visible = false;
  flash.renderOrder = 30;
  rig.add(flash);
  const flashCore = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x9bfff0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flashCore.scale.setScalar(0.32);
  flashCore.visible = false;
  flashCore.renderOrder = 31;
  rig.add(flashCore);

  built.forEach(b => b.group.scale.setScalar(0.66));
  const base = [
    { pos: new THREE.Vector3(0.36, -0.275, -0.74), rot: new THREE.Euler(0.03, -0.1, 0.015) },
    { pos: new THREE.Vector3(0.33, -0.255, -0.66), rot: new THREE.Euler(0.02, -0.075, 0) },
    { pos: new THREE.Vector3(0.37, -0.275, -0.72), rot: new THREE.Euler(0.03, -0.11, 0.015) }
  ];
  const ads = [
    { pos: new THREE.Vector3(0, -0.14, -0.5), rot: new THREE.Euler(0, 0, 0) },
    { pos: new THREE.Vector3(0, -0.122, -0.46), rot: new THREE.Euler(0, 0, 0) },
    { pos: new THREE.Vector3(0, -0.135, -0.48), rot: new THREE.Euler(0, 0, 0) }
  ];

  let active = 0, flashT = 0, recoil = 0, reloadT = 0, reloadDur = 1, swayX = 0, swayY = 0, bob = 0, adsT = 0;
  const state = { move: 0, grounded: true, aim: false };

  return {
    get active() { return active; },
    get rig() { return rig; },
    setVisible(v) { rig.visible = v; },
    setActive(i) {
      if (i === active) return;
      built[active].group.visible = false;
      active = i;
      built[i].group.visible = true;
      reloadT = 0; recoil = 0.12;
    },
    startReload(dur) { reloadT = dur; reloadDur = dur; },
    flash() { flashT = 0.055; },
    update(dt, t, aim, moveSpeed, grounded, mouseDX, mouseDY, sprinting) {
      adsT += ((aim ? 1 : 0) - adsT) * Math.min(1, dt * 18);
      recoil = Math.max(0, recoil - dt * 9);
      if (reloadT > 0) reloadT = Math.max(0, reloadT - dt * 1000);
      flashT = Math.max(0, flashT - dt);
      flashMat.opacity = flashT > 0 ? 1 : 0;
      flashCore.material.opacity = flashT > 0 ? 1 : 0;
      flash.visible = flashT > 0;
      flashCore.visible = flashT > 0;
      const b = built[active];
      const bp = base[active], ap = ads[active];
      if (flashT > 0) {
        const wp = b.muzzle.getWorldPosition(new THREE.Vector3());
        rig.worldToLocal(wp);
        flash.position.copy(wp); flashCore.position.copy(wp);
        const s = 0.42 + Math.random() * 0.4;
        flash.scale.setScalar(s);
        flashCore.scale.setScalar(s * 0.55);
        flashMat.rotation = Math.random() * 6;
      }
      swayX += (-mouseDX * 0.00018 - swayX) * Math.min(1, dt * 9);
      swayY += (-mouseDY * 0.00018 - swayY) * Math.min(1, dt * 9);
      const moveAmt = Math.min(1, moveSpeed / 7);
      bob += dt * (7 + moveAmt * 6) * (grounded ? 1 : 0.3);
      const bobX = Math.sin(bob) * 0.011 * (0.4 + moveAmt) * (1 - adsT * 0.75);
      const bobY = Math.abs(Math.cos(bob)) * 0.009 * (0.3 + moveAmt) * (1 - adsT * 0.75);
      const reloadDip = reloadT > 0 ? Math.sin((1 - reloadT / reloadDur) * Math.PI) : 0;
      const sprintTilt = sprinting ? 0.22 : 0;
      const airDip = grounded ? 0 : 0.045;

      const narrow = camera.aspect < 0.9;
      const touchWide = IS_TOUCH && camera.aspect > 1.15 && camera.aspect < 2.4;
      b.group.scale.setScalar(narrow ? 0.64 : (touchWide ? 0.56 : 0.62));
      b.group.position.lerpVectors(bp.pos, ap.pos, adsT);
      b.group.position.x *= narrow ? 0.62 : (touchWide ? 1.12 : 1);
      b.group.position.x += swayX + bobX + sprintTilt * 0.3;
      b.group.position.y += swayY + bobY - reloadDip * 0.22 + airDip + (narrow ? -0.045 : 0);
      b.group.position.z += recoil * 0.075;
      b.group.rotation.set(
        THREE.MathUtils.lerp(bp.rot.x, ap.rot.x, adsT) + swayY * 0.6 - recoil * 0.55 + reloadDip * -0.9 + sprintTilt * 0.5 + (narrow ? 0.03 : 0),
        THREE.MathUtils.lerp(bp.rot.y, ap.rot.y, adsT) + swayX * 0.7 + sprintTilt * 0.9 + (narrow ? 0.16 : 0),
        THREE.MathUtils.lerp(bp.rot.z, ap.rot.z, adsT) + swayX * 0.5 + reloadDip * 0.7 - sprintTilt * 0.35 + (narrow ? -0.05 : 0)
      );
    },
    kick(amount = 1) { recoil = Math.min(1, recoil + amount); },
    getMuzzle() {
      return built[active].muzzle.getWorldPosition(new THREE.Vector3());
    },
    getStats() { return WEAPONS[active]; }
  };
}
