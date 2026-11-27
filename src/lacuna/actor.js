// Lacuna (Chapter 2): someone in a scene (the Iron Hounds, the beasts of the opening). Not in the sim: the
// cutscene player and the story move them, in this browser only. A stand-in figure shows until the model loads.
//   a = new Actor(scene, 'l_rowan', { height: 1.86, weapon: 'warrior' })
//   a.place(x, z, facing); await a.walkTo(x, z, { run }); await a.play('ual_Fixing_Kneeling', { hold: true })
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RIGGED, loadRigged, loadWeapon } from '../render/rigged.js';

/** The Iron Hounds, the Guild's people and the opening's beasts: their models and how they look in the land. */
export const CAST = {
  rowan: { model: 'l_rowan', name: 'Rowan', height: 1.88, weapon: { cls: 'warrior', size: 1.15 }, colour: 0xc9783a },
  ilse: { model: 'l_ilse', name: 'Ilse', height: 1.7, colour: 0xf2e6c8 },
  juni: { model: 'l_juni', name: 'Juni', height: 1.66, colour: 0x4f7a3a },
  sorrel: { model: 'l_sorrel', name: 'Sorrel', height: 1.92, colour: 0x2f5a3a }, // (his staff waits for a grip of its own)
  // (0.99.20) the Adventurers' Guild: the crystal-reader, and the Silver Sash pair (rivals to come)
  odile: { model: 'l_odile', name: 'Magistra Odile', height: 1.68, colour: 0x2a3f7a },
  dace: { model: 'l_dace', name: 'Dace', height: 1.84, colour: 0xc8ccd6 },
  wren: { model: 'l_wren', name: 'Wren', height: 1.68, colour: 0x5a3a7a },
  wolf: { beast: 'wolf' },
};
for (const k in CAST) {
  const c = CAST[k];
  if (c.model && !RIGGED[c.model]) RIGGED[c.model] = { url: `models/${c.model}.glb`, height: 1, turn: -Math.PI / 2, recentre: '*', rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis', 'Hips'] };
}

/** Which clip plays each named thing, best first (Tripo's presets, the heroes' clips, the library's). */
const WORDS = {
  // (the library's idle, walk and jog first: Tripo's held the arms out, palms forward)
  idle: ['ual_idle_loop', 'standing_relax', 'idle'],
  walk: ['ual_walk_formal_loop', 'ual_walk_loop', 'walk', 'gait_walk'],
  stride: ['ual_walk_loop', 'ual_walk_formal_loop', 'walk'],
  run: ['ual_jog_fwd_loop', 'run', 'jog', 'sprint'],
  talk: ['ual_idle_talking_loop', 'standing_relax', 'idle'],
  kneel: ['ual_fixing_kneeling', 'ual_crouch_idle_loop'],
  crouch: ['ual_crouch_idle_loop', 'ual_fixing_kneeling'],
  arms: ['fold_arms', 'ual_idle_foldarms_loop', 'standing_relax'],
  wave: ['greet_02', 'greet_01', 'greet'],
  yes: ['ual_yes', 'agree'],
  no: ['ual_idle_no_loop'],
  look: ['look_around', 'ual_idle_loop', 'idle'],
  slash: ['ual_slasha', 'ual_sword_regular_a', 'ual_cleave', 'slash'],
  cast: ['cast_a_spell', 'ual_spell_simple_shoot', 'mag_bolt', 'mag_cast', 'cast'],
  shoot: ['arc_shot', 'shoot', 'fire'],
  jump: ['jump'],
  wait: ['wait', 'ual_idle_loop', 'standing_relax'],
  laugh: ['laugh_01', 'laugh_02', 'laugh'],
  clap: ['clap'],
  cheer: ['cheer', 'clap'],
  bow: ['bow'],
  sob: ['sob'],
  swagger: ['swagger'],
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

const UP = new THREE.Vector3(0, 1, 0);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _v = new THREE.Vector3();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _one = new THREE.Vector3(1, 1, 1), _gq = new THREE.Quaternion(), _id = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
/** The neck and head of a rig, to turn toward someone (after the clip has posed them, each frame). */
export function makeLook(root) {
  const head = root && root.getObjectByName('Head');
  return head ? { head, neck: root.getObjectByName('NeckTwist01'), yaw: 0, rest: [] } : null;
}
/** Put back what the last look turned (a clip that does not move these bones would keep it). */
export function lookRest(look) {
  if (!look) return;
  for (const [b, q] of look.rest) b.quaternion.copy(q);
  look.rest.length = 0;
}
/** Turn the head (60%) and neck (40%) toward (tx, tz), from a body at (x, z) facing `facing`; not past ~65 degrees. */
export function lookAt(look, x, z, facing, target, dt) {
  if (!look) return;
  let want = 0;
  if (target) {
    const d = wrap(Math.atan2(target.z - z, target.x - x) - facing);
    want = Math.abs(d) > 2.3 ? 0 : Math.max(-1.15, Math.min(1.15, d)); // behind them: they turn the body instead
  }
  look.yaw += (want - look.yaw) * Math.min(1, dt * 5);
  if (Math.abs(look.yaw) < 0.002) return;
  for (const [bone, share] of [[look.neck, 0.4], [look.head, 0.6]]) {
    if (!bone) continue;
    look.rest.push([bone, bone.quaternion.clone()]);
    bone.updateWorldMatrix(true, false);
    bone.getWorldQuaternion(_wq);
    bone.parent.getWorldQuaternion(_pq);
    _q.setFromAxisAngle(UP, -look.yaw * share); // facing grows toward +z, which is a turn the other way about +y
    _wq.premultiply(_q);
    bone.quaternion.copy(_pq.invert().multiply(_wq));
    bone.updateMatrixWorld(true);
  }
}
/** Nobody stands inside anybody: people closer than `gap` are eased apart (the hero, `fixed`, is not moved). */
export function separate(people, fixed, gap = 0.95, land = null) {
  for (let i = 0; i < people.length; i++) {
    const a = people[i];
    for (let j = i + 1; j < people.length; j++) {
      const b = people[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= gap) continue;
      const push = (gap - d) / 2, nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
    }
    if (fixed) {
      const dx = a.x - fixed.x, dz = a.z - fixed.z, d = Math.hypot(dx, dz);
      if (d < gap) { const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0; a.x = fixed.x + nx * gap; a.z = fixed.z + nz * gap; }
    }
    if (land && !a.spec.beast) land.pushOut(a, 0.4);
    a.sync();
  }
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
    this.want = null; // a facing to turn to (smoothly), or null
    this.lookTarget = null; // { x, z }: who they look at (head and neck)
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
      this.look = makeLook(root);
      // (0.99.22) the feet: where they rest in the model's own pose, so a clip that sinks them can be lifted back
      this.feet = ['L_Foot', 'R_Foot', 'L_ToeBase', 'R_ToeBase'].map((n) => root.getObjectByName(n)).filter(Boolean);
      this.group.updateMatrixWorld(true);
      this.footRest = this.feet.length ? Math.min(...this.feet.map((f) => f.getWorldPosition(_v).y)) : null;
      this.lift = 0;
      this.loop('idle', 0);
      if (this.spec.weapon) {
        loadWeapon(this.spec.weapon.cls, 1).then((w) => {
          const hand = root.getObjectByName('R_Hand');
          if (!w || !hand || !this.alive) return;
          w.scale.setScalar(this.spec.weapon.size / holder.scale.x);
          holder.add(w);
          this.blade = { w, hand, grip: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 4), upper: root.getObjectByName('R_Upperarm'), fore: root.getObjectByName('R_Forearm'), pelvis: root.getObjectByName('Pelvis') || root.getObjectByName('Hip') };
        });
      }
    });
  }

  /**
   * (0.99.25) The sword: at his left hip until he needs it. draw(): his right hand reaches across to the hilt and
   * brings it out; sheathe(): back it goes. Instantly when `now` (a scene starting with it drawn).
   */
  draw(now = false) {
    if (this.armed && !this.sheathing) return;
    this.armed = true;
    this.sheathing = false;
    this.swordT = now ? 1 : 0;
    if (this.asked === 'arms') this.loop('arms', 0.2); // arms unfold to draw
  }

  sheathe(now = false) {
    if (!this.armed) return;
    this.armed = false;
    this.sheathing = true;
    this.swordT = now ? 1 : 0;
  }

  place(x, z, facing = this.facing) {
    this.x = x; this.z = z; this.facing = facing;
    this.sync();
    return this;
  }

  /** Turn to face (x, z): at once (now) or over a moment, as a person turns. */
  face(x, z, now = true) {
    const f = Math.atan2(z - this.z, x - this.x);
    if (now) { this.facing = f; this.want = null; this.sync(); } else this.want = f;
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
    this.asked = what;
    if (what === 'arms' && this.armed) what = 'idle'; // (0.99.25) no folding his arms round a drawn sword
    this.looping = what;
    if (this.once) return;
    const a = this.action(what) || this.action('idle');
    if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = 1; this.fadeTo(a, fade); }
  }

  /** A clip once (a slash, a wave): resolves when it ends. hold: stay on its last pose. */
  play(what, { hold = false, speed = 1, fade = 0.15 } = {}) {
    if (what === 'slash' && this.spec.weapon && !this.armed) this.draw(true); // no cutting with a sheathed sword
    const a = this.action(what);
    if (!a) return new Promise((r) => setTimeout(r, 400));
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    this.current = null;
    this.fadeTo(a, fade);
    return new Promise((resolve) => { this.once = { action: a, resolve, hold, left: a.getClip().duration / speed }; });
  }

  /** (0.99.25) Walk a route, point after point (round buildings rather than through them). */
  async walkPath(points, opts = {}) {
    for (const p of points) {
      if (!this.alive) return;
      await this.walkTo(p.x, p.z, opts);
    }
  }

  /** Walk (or run) to a spot; resolves on arrival. */
  walkTo(x, z, { run = false, speed } = {}) {
    return new Promise((resolve) => {
      this.path = { x, z, speed: speed || (run ? 5.2 : 1.9), resolve, best: Infinity, still: 0 };
      this.loop(run ? 'run' : 'walk', 0.2);
    });
  }

  update(dt) {
    if (this.path) {
      const p = this.path, dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      // arrived, or as near as they can get (someone is standing there): not stuck walking on the spot
      if (d < p.best - 0.02) { p.best = d; p.still = 0; } else p.still += dt;
      if (d < 0.08 || (p.still > 0.5 && d < 1.5)) {
        this.path = null;
        this.loop('idle', 0.3);
        p.resolve();
      } else {
        const step = Math.min(d, p.speed * dt);
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        if (Actor.land && !this.spec.beast) Actor.land.pushOut(this, 0.35); // (0.99.25) never through a house
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
    if (!this.path && this.want !== null) {
      // turning on the spot, about a half turn a second
      const d = wrap(this.want - this.facing);
      const step = Math.sign(d) * Math.min(Math.abs(d), 5 * dt);
      this.facing += step;
      if (Math.abs(d) < 0.01) { this.facing = this.want; this.want = null; }
      this.sync();
    }
    lookRest(this.look);
    if (this.mixer) this.mixer.update(dt);
    if (this.look) { this.group.updateMatrixWorld(true); lookAt(this.look, this.x, this.z, this.facing, this.lookTarget, dt); }
    if (this.footRest !== null && this.feet && this.feet.length) {
      // never through the ground: if the lowest foot has sunk below where it rests, the body comes up by as much
      this.holder.position.y = 0;
      this.holder.updateMatrixWorld(true);
      const low = Math.min(...this.feet.map((f) => f.getWorldPosition(_v).y));
      const want = Math.max(0, this.footRest - low);
      this.lift += (want - this.lift) * Math.min(1, dt * 12);
      this.holder.position.y = this.lift;
    }
    if (this.blade) this.placeBlade(dt);
  }

  /** Where the sword hangs (world space): his left hip, hilt forward and up, blade down and back. */
  hipPose(pos, quat) {
    const B = this.blade;
    this.group.updateMatrixWorld(true);
    B.pelvis.getWorldPosition(pos);
    this.group.worldToLocal(pos);
    // the group's own frame: +Z forward, +X to his left
    pos.x += 0.24; pos.z += 0.06; pos.y -= 0.02;
    this.group.localToWorld(pos);
    const dir = _d.set(0.12, -0.78, -0.62).normalize(); // down and back
    quat.setFromUnitVectors(_z, dir).premultiply(this.group.getWorldQuaternion(_gq));
  }

  /** Where the hand holds the hilt (world space). */
  handPose(pos, quat) {
    const B = this.blade;
    B.hand.updateWorldMatrix(true, false);
    B.hand.getWorldPosition(pos);
    B.hand.getWorldQuaternion(quat).multiply(B.grip);
  }

  /** Put the right arm's hand at `target` (world), weight w (two bones: upper arm and forearm). */
  reach(target, w) {
    const B = this.blade;
    if (!B.upper || !B.fore || w <= 0.001) return;
    this.holder.updateMatrixWorld(true);
    const S = B.upper.getWorldPosition(new THREE.Vector3()), E = B.fore.getWorldPosition(new THREE.Vector3()), W = B.hand.getWorldPosition(new THREE.Vector3());
    const a = S.distanceTo(E), b = E.distanceTo(W);
    const toT = target.clone().sub(S);
    const d = Math.min(a + b - 0.001, Math.max(Math.abs(a - b) + 0.001, toT.length()));
    toT.normalize();
    // keep the elbow bending the way it already bends
    const pole = E.clone().sub(S).projectOnPlane(toT);
    if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0).projectOnPlane(toT);
    pole.normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const E2 = S.clone().addScaledVector(toT, a * cosA).addScaledVector(pole, a * sinA);
    const turn = (bone, from, to) => {
      const q = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
      q.slerp(_id, 1 - w);
      const wq = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      bone.quaternion.copy(pq.multiply(wq));
      bone.updateMatrixWorld(true);
    };
    turn(B.upper, E.clone().sub(S), E2.clone().sub(S));
    const E3 = B.fore.getWorldPosition(new THREE.Vector3()), W3 = B.hand.getWorldPosition(new THREE.Vector3());
    turn(B.fore, W3.sub(E3), target.clone().sub(E3));
  }

  /** Each frame: the sword in his hand, at his hip, or on its way between (a reach, then the blade moves with the hand). */
  placeBlade(dt) {
    const B = this.blade;
    if (this.armed === undefined) this.armed = !!this.spec.drawn;
    let inHand = this.armed;
    if (this.swordT < 1) {
      this.swordT = Math.min(1, this.swordT + dt / (this.swordDur || 0.6));
      const t = this.swordT;
      // the hand goes to the hip (t to 0.4), the blade changes hands there, the hand comes back (to 1)
      const w = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      const ease = w * w * (3 - 2 * w);
      this.hipPose(_p, _q);
      this.reach(_p, ease);
      inHand = this.armed ? t >= 0.4 : t < 0.4;
      if (t >= 1) { this.sheathing = false; if (!this.armed && this.asked === 'arms') this.loop('arms', 0.35); } // put away: arms folded again
    }
    this.holder.updateMatrixWorld(true);
    if (inHand) this.handPose(_p, _q);
    else this.hipPose(_p, _q);
    // into the holder's space (it is scaled and turned)
    const m = _m.copy(this.holder.matrixWorld).invert().multiply(_m2.compose(_p, _q, _one));
    m.decompose(_p, _q, _s);
    B.w.position.copy(_p);
    B.w.quaternion.copy(_q);
  }

  remove() {
    this.alive = false;
    this.scene.remove(this.group);
  }
}
