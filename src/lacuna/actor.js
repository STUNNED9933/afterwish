// Lacuna (Chapter 2): someone in a scene (the Marigold Company, the beasts of the opening). Not in the sim: the
// cutscene player and the story move them, in this browser only. A stand-in figure shows until the model loads.
//   a = new Actor(scene, 'l_rowan', { height: 1.86, weapon: 'warrior' })
//   a.place(x, z, facing); await a.walkTo(x, z, { run }); await a.play('ual_Fixing_Kneeling', { hold: true })
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RIGGED, loadRigged, loadWeapon } from '../render/rigged.js';

/** The Marigold Company and the opening's beasts: their models and how they look in the land. */
export const CAST = {
  rowan: { model: 'l_rowan', name: 'Rowan', height: 1.88, weapon: { cls: 'warrior', size: 1.15 }, colour: 0xc9783a },
  ilse: { model: 'l_ilse', name: 'Ilse', height: 1.7, colour: 0xf2e6c8 },
  juni: { model: 'l_juni', name: 'Juni', height: 1.66, colour: 0x4f7a3a },
  sorrel: { model: 'l_sorrel', name: 'Sorrel', height: 1.92, colour: 0x2f5a3a }, // (his staff waits for a grip of its own)
  wolf: { beast: 'wolf' },
};
for (const k in CAST) {
  const c = CAST[k];
  if (c.model && !RIGGED[c.model]) RIGGED[c.model] = { url: `models/${c.model}.glb`, height: 1, turn: -Math.PI / 2, recentre: '*', rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis', 'Hips'] };
}

/** Which clip plays each named thing, best first (Tripo's presets, the heroes' clips, the library's). */
const WORDS = {
  idle: ['standing_relax', 'idle'],
  walk: ['walk', 'gait_walk'],
  run: ['run', 'jog', 'sprint'],
  talk: ['ual_idle_talking_loop', 'standing_relax', 'idle'],
  kneel: ['ual_fixing_kneeling', 'ual_crouch_idle_loop'],
  crouch: ['ual_crouch_idle_loop', 'ual_fixing_kneeling'],
  arms: ['fold_arms', 'ual_idle_foldarms_loop', 'standing_relax'],
  wave: ['greet_02', 'greet_01', 'greet'],
  yes: ['ual_yes', 'agree'],
  no: ['ual_idle_no_loop'],
  look: ['look_around', 'idle'],
  slash: ['ual_slasha', 'ual_sword_regular_a', 'ual_cleave', 'slash'],
  cast: ['cast_a_spell', 'ual_spell_simple_shoot', 'mag_bolt', 'mag_cast', 'cast'],
  shoot: ['arc_shot', 'shoot', 'fire'],
  jump: ['jump'],
  wait: ['wait', 'standing_relax'],
};
function findClip(clips, what) {
  const names = Object.keys(clips);
  const exact = names.find((n) => n.toLowerCase() === String(what).toLowerCase());
  if (exact) return clips[exact];
  for (const w of WORDS[what] || [what]) {
    const hit = names.find((n) => n.toLowerCase().includes(w));
    if (hit) return clips[hit];
  }
  return null;
}

export class Actor {
  /** beastMesh(type) -> a mesh for a beast (the land's own creature shapes). */
  constructor(scene, who, { beastMesh } = {}) {
    this.scene = scene;
    this.who = who;
    this.spec = CAST[who] || CAST[String(who).replace(/\d+$/, '')] || { model: who, height: 1.75 }; // (wolf1, wolf2...: wolves)
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    scene.add(this.group);
    this.x = 0; this.z = 0; this.facing = 0;
    this.path = null; // walking: { x, z, speed, resolve }
    this.mixer = null;
    this.current = null;
    this.once = null; // a clip playing once: { action, resolve, hold }
    this.alive = true;
    if (this.spec.beast) {
      this.body.add(beastMesh(this.spec.beast));
      this.ready = Promise.resolve();
      return;
    }
    const stand = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, this.spec.height - 0.6, 4, 8).translate(0, this.spec.height / 2, 0), new THREE.MeshLambertMaterial({ color: this.spec.colour || 0xcccccc }));
    stand.castShadow = true;
    this.body.add(stand);
    this.ready = loadRigged(this.spec.model).then((tpl) => {
      if (!tpl || !this.alive) return;
      const root = SkeletonUtils.clone(tpl.scene);
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); } });
      const holder = new THREE.Group();
      holder.rotation.y = -Math.PI / 2;
      holder.scale.setScalar(tpl.scale * this.spec.height);
      holder.add(root);
      this.body.remove(stand);
      this.body.add(holder);
      this.holder = holder;
      this.root = root;
      this.clips = tpl.clips;
      this.mixer = new THREE.AnimationMixer(root);
      this.loop('idle', 0);
      if (this.spec.weapon) {
        loadWeapon(this.spec.weapon.cls, 1).then((w) => {
          const hand = root.getObjectByName('R_Hand');
          if (!w || !hand || !this.alive) return;
          w.scale.setScalar(this.spec.weapon.size / holder.scale.x);
          holder.add(w);
          this.blade = { w, hand, grip: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 4) };
        });
      }
    });
  }

  place(x, z, facing = this.facing) {
    this.x = x; this.z = z; this.facing = facing;
    this.sync();
    return this;
  }

  face(x, z) {
    this.facing = Math.atan2(z - this.z, x - this.x);
    this.sync();
    return this;
  }

  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = Math.PI / 2 - this.facing;
  }

  action(what) {
    if (!this.mixer) return null;
    const c = findClip(this.clips, what);
    return c ? this.mixer.clipAction(c) : null;
  }

  fadeTo(a, fade = 0.25) {
    if (!a || a === this.current) return;
    a.reset().play();
    if (this.current) a.crossFadeFrom(this.current, fade, false);
    this.current = a;
  }

  /** A looping clip (idle, walk, talk, kneel...). */
  loop(what, fade = 0.25) {
    this.looping = what;
    if (this.once) return;
    const a = this.action(what) || this.action('idle');
    if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = 1; this.fadeTo(a, fade); }
  }

  /** A clip once (a slash, a wave): resolves when it ends. hold: stay on its last pose. */
  play(what, { hold = false, speed = 1, fade = 0.15 } = {}) {
    const a = this.action(what);
    if (!a) return new Promise((r) => setTimeout(r, 400));
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    this.current = null;
    this.fadeTo(a, fade);
    return new Promise((resolve) => { this.once = { action: a, resolve, hold, left: a.getClip().duration / speed }; });
  }

  /** Walk (or run) to a spot; resolves on arrival. */
  walkTo(x, z, { run = false, speed } = {}) {
    return new Promise((resolve) => {
      this.path = { x, z, speed: speed || (run ? 5.2 : 1.9), resolve };
      this.loop(run ? 'run' : 'walk', 0.2);
    });
  }

  update(dt) {
    if (this.path) {
      const p = this.path, dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.08) {
        this.path = null;
        this.loop('idle', 0.3);
        p.resolve();
      } else {
        const step = Math.min(d, p.speed * dt);
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        this.facing = Math.atan2(dz, dx);
        if (this.spec.beast) this.body.position.y = Math.abs(Math.sin(performance.now() / 70)) * 0.08;
        this.sync();
      }
    }
    if (this.once) {
      this.once.left -= dt;
      if (this.once.left <= 0) {
        const o = this.once;
        this.once = null;
        if (!o.hold) this.loop(this.path ? (this.path.speed > 3 ? 'run' : 'walk') : this.looping || 'idle', 0.25);
        o.resolve();
      }
    }
    if (this.mixer) this.mixer.update(dt);
    if (this.blade) {
      // in the hand each frame, at a fixed size (the hand bone's own scale changes with the pose)
      this.holder.updateMatrixWorld(true);
      const m = new THREE.Matrix4().copy(this.holder.matrixWorld).invert().multiply(this.blade.hand.matrixWorld);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      m.decompose(p, q, s);
      this.blade.w.position.copy(p);
      this.blade.w.quaternion.copy(q).multiply(this.blade.grip);
    }
  }

  remove() {
    this.alive = false;
    this.scene.remove(this.group);
  }
}
