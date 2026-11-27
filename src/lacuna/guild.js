// Lacuna: the Adventurers' Guild's reading crystal (Quest 2, The Crystal). A tall cut crystal on a stone plinth
// in the Guild's yard; a hand on it, and it shows the aptitude you were born with: a blaze for the gifted, a glow
// for most, and for the hero almost nothing (then, after everyone has gone, a pinprick that will not go out).
//   const c = buildCrystal(CRYSTAL); scene.add(c.group); c.read(0.9) / c.read(0.02); c.update(dt)
import * as THREE from 'three';

const WARM = new THREE.Color(0xffa040);

export function buildCrystal(at) {
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a948a, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.35, 8), stone);
  base.position.y = 0.175;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 8), stone);
  post.position.y = 0.7;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.38, 0.18, 8), new THREE.MeshLambertMaterial({ color: 0xb08a3a, flatShading: true }));
  cup.position.y = 1.14;
  // the crystal: a long eight-sided point, pale blue, a little see-through
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x6fb8ff, emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.82, flatShading: true });
  const geo = new THREE.OctahedronGeometry(0.42, 0);
  geo.scale(1, 2.3, 1);
  const gem = new THREE.Mesh(geo, glass);
  gem.position.y = 2.15;
  // its light: a soft glow round it (a sprite) and a point light on the ground and faces
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(180,220,255,0.55)');
    r.addColorStop(1, 'rgba(120,180,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.position.y = 2.15;
  // the hero's pinprick, deep inside: a solid amber core (drawn through the glass), not an additive glow, so it
  // reads against the pale crystal in daylight
  const ember = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a1a, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  ember.renderOrder = 5;
  ember.position.y = 2.05;
  ember.scale.setScalar(0.001);
  const light = new THREE.PointLight(0x9fd0ff, 0, 9, 1.6);
  light.position.y = 2.3;
  for (const m of [base, post, cup, gem]) { m.castShadow = true; m.receiveShadow = true; }
  group.add(base, post, cup, gem, glow, ember, light);

  let level = 0, want = 0, colour = new THREE.Color(0x9fd0ff), flick = 0, emberWant = 0, emberNow = 0, t = 0;
  return {
    group,
    gem,
    /** Show a reading: `power` 0 (nothing) to 1 (a blaze); `hue` an optional colour. */
    read(power, hue) {
      want = power;
      if (hue !== undefined) colour.set(hue);
      flick = power < 0.1 ? 1 : 0;
    },
    /** Back to resting (a faint shimmer). */
    rest() {
      want = 0;
      colour.set(0x9fd0ff);
      flick = 0;
    },
    /** The hero's ember: a small warm point inside that keeps burning (0 off, 1 on). */
    ember(on) {
      emberWant = on ? 1 : 0;
    },
    get level() {
      return level;
    },
    update(dt) {
      t += dt;
      emberNow += (emberWant - emberNow) * Math.min(1, dt * 0.8);
      level += (want - level) * Math.min(1, dt * (want > level ? 3 : 1.5));
      // a weak reading sputters: it catches, dies, catches again
      const sputter = flick ? 0.55 + 0.45 * Math.max(0, Math.sin(t * 13) * Math.sin(t * 5.3)) : 1;
      const k = level * sputter;
      const idle = 0.25 + Math.sin(t * 1.3) * 0.05;
      glass.emissive.copy(colour).lerp(WARM, emberNow * 0.45); // the ember warms the whole stone a little
      glass.emissiveIntensity = idle + k * 2.6;
      glow.material.color.copy(colour);
      glow.material.opacity = Math.min(0.8, k * 0.9);
      glow.scale.setScalar(0.6 + k * 2.6);
      light.color.copy(colour);
      light.intensity = k * 7;
      gem.rotation.y += dt * (0.15 + k * 1.2);
      ember.material.opacity = emberNow * (0.85 + Math.sin(t * 3.1) * 0.15);
      ember.scale.setScalar(0.001 + emberNow * (0.42 + Math.sin(t * 2.3) * 0.05));
    },
  };
}
