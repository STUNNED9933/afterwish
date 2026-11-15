// Rigged, animated character models (0.35), made with the Tripo API (tools/models).
// Each model is loaded once, when first needed, and copied for every character that uses it.
// Until it has loaded, or if it cannot load (opening the game from a file, no network), the
// hand-built model from models.js stays: nothing about the game depends on these.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { addRim } from './environment.js';

/**
 * What each model is and how its clips map to what the character is doing.
 * height: metres in game; turn: rotation so the model faces +Z like the hand-built ones;
 * hand: the bone a weapon is held by (the blade along the bone's +Z);
 * attack: the part of a clip that is the swing itself (seconds), played fast for each attack.
 */
export const RIGGED = {
  hero_warrior: {
    url: 'models/warrior.glb',
    height: 2.05,
    turn: -Math.PI / 2,
    hand: 'R_Hand',
    weaponScale: 0.82,
    // The blade runs between the hand bone's +Y and +Z: lowered at rest, overhead in the
    // wind-up, forward and down at the strike. While running it trails back and low instead
    // (the pumping arm would flip it up and down). trail: blade direction in model space.
    gripTilt: -Math.PI / 4,
    trail: [-0.55, -0.83, 0.1],
    idle: 'idle',
    run: 'run',
    death: 'ual_Death',
    deathFrom: 0.45, // skip the stagger at the start: he drops when the blow lands
    hit: 'hit',
    attack: { clip: 'attack', from: 1.6, to: 2.7 },
    // Skills (0.36): sword moves from Quaternius' Universal Animation Library (CC0), moved onto
    // this skeleton by tools/models/retarget.js. Those clips hold the blade along the hand's +Z.
    // keys: [seconds since the cast, clip time] (the clip is played through these, so a move can
    // wind up quickly, strike on time and recover slowly). land: the key that must line up with
    // the end of a dash or leap (keys up to it stretch with its duration). stop: a short freeze
    // at the moment of impact. slash: when the blade leaves a glowing trail.
    libraryGrip: /^ual_/,
    moves: {
      cone: { clip: 'ual_Cleave', keys: [[0, 0.85], [0.12, 1.1], [0.22, 1.3], [0.5, 1.45]], stop: [0.2, 0.05], slash: [0.06, 0.3], fade: 0.3 },
      dash: { clip: 'ual_Lunge', keys: [[0, 0.02], [0.12, 0.27], [0.2, 0.42], [0.5, 0.95], [0.8, 1.42]], land: 2, slash: [0.1, 0.3], fade: 0.3 },
      leap: { clip: 'ual_Smash', keys: [[0, 2.1], [0.42, 2.5], [0.5, 2.64], [0.85, 3.2], [1.3, 3.98]], land: 2, stop: [0.5, 0.08], slash: [0.36, 0.62], fade: 0.35 },
    },
    // Whirlwind: crouched, blade held out flat, while the game turns the whole model.
    spin: { clip: 'ual_Spin', at: 0.57 },
    rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis'],
  },
};

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map(); // id -> Promise<template | null>

/** Load a model once (null if it cannot be loaded here). */
export function loadRigged(id) {
  const spec = RIGGED[id];
  if (!spec) return Promise.resolve(null);
  if (typeof location !== 'undefined' && location.protocol === 'file:') return Promise.resolve(null); // browsers block loading files from file://
  if (!cache.has(id)) {
    cache.set(
      id,
      loader
        .loadAsync(spec.url)
        .then((gltf) => prepare(spec, gltf))
        .catch((err) => {
          console.warn(`Model ${id} did not load; keeping the hand-built one.`, err && err.message);
          return null;
        }),
    );
  }
  return cache.get(id);
}

/** One-time work on a loaded model: size, clips cut and cleaned, shared things marked. */
function prepare(spec, gltf) {
  const scene = gltf.scene;
  const box = new THREE.Box3().setFromObject(scene);
  const scale = spec.height / Math.max(0.01, box.max.y - box.min.y);
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds do not follow the animation
      o.geometry.userData.keep = true; // shared by every copy
      const m = o.material;
      if (m && m.map) m.map.userData.keep = true;
    }
  });
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  if (clips[spec.run]) {
    stripDrift(clips[spec.run], spec.rootBones);
    recentre(clips[spec.run], spec.rootBones, scene);
  }
  if (spec.attack && clips[spec.attack.clip]) {
    const src = clips[spec.attack.clip];
    const fps = 30;
    clips.__attack = THREE.AnimationUtils.subclip(src, 'attack', Math.round(spec.attack.from * fps), Math.round(spec.attack.to * fps), fps);
  }
  return { spec, scene, scale, clips };
}

/** Remove forward travel from a run cycle, keeping its bob and sway (the game moves the character). */
function stripDrift(clip, rootBones) {
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.');
    if (prop !== 'position' || !rootBones.includes(bone)) continue;
    const v = t.values;
    const n = v.length / 3;
    if (n < 2) continue;
    const dx = v[(n - 1) * 3] - v[0], dy = v[(n - 1) * 3 + 1] - v[1], dz = v[(n - 1) * 3 + 2] - v[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) continue;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    for (let i = 0; i < n; i++) {
      const ox = v[i * 3] - v[0], oy = v[i * 3 + 1] - v[1], oz = v[i * 3 + 2] - v[2];
      const along = ox * ux + oy * uy + oz * uz;
      v[i * 3] -= along * ux;
      v[i * 3 + 1] -= along * uy;
      v[i * 3 + 2] -= along * uz;
    }
  }
}

/**
 * Some "in place" cycles sit off to one side of where the character stands (a Tripo run had
 * its hips over half a body-height forward). Move any root track component that is far from
 * the rest pose back over it; small differences (the bob, a lower stance) stay.
 */
function recentre(clip, rootBones, scene) {
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.');
    if (prop !== 'position' || !rootBones.includes(bone)) continue;
    const node = scene.getObjectByName(bone);
    if (!node) continue;
    const rest = node.position;
    const v = t.values;
    const n = v.length / 3;
    for (let k = 0; k < 3; k++) {
      let mean = 0;
      for (let i = 0; i < n; i++) mean += v[i * 3 + k] / n;
      const off = rest.getComponent(k) - mean;
      if (Math.abs(off) > 0.15) for (let i = 0; i < n; i++) v[i * 3 + k] += off;
    }
  }
}

/**
 * A copy of a loaded model with its own animation player. state() picks the clip each frame:
 * { dead, attackStart (true on the frame an attack begins), attackDur, moving, speed }.
 */
export function instantiate(tpl) {
  const { spec, clips } = tpl;
  const root = SkeletonUtils.clone(tpl.scene);
  const mats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = addRim(o.material.clone(), 0x9fb8ff, 0.3);
    mats.push(o.material);
  });
  const holder = new THREE.Group();
  holder.rotation.y = spec.turn || 0;
  holder.scale.setScalar(tpl.scale);
  holder.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const act = (name, once) => {
    const c = clips[name];
    if (!c) return null;
    const a = mixer.clipAction(c);
    if (once) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    return a;
  };
  const actions = { idle: act(spec.idle), run: act(spec.run), attack: act('__attack', true), death: act(spec.death, true), hit: act(spec.hit, true) };
  // Skill moves and the spin pose are posed by hand each frame (time set, not played).
  const moves = {};
  for (const [k, m] of Object.entries(spec.moves || {})) {
    const a = act(m.clip, true);
    if (a) moves[k] = { ...m, action: a };
  }
  if (spec.spin) {
    actions.spin = act(spec.spin.clip);
    if (actions.spin) actions.spin.timeScale = 0;
  }
  const library = Object.values(actions).concat(Object.values(moves).map((m) => m.action)).filter((a) => a && spec.libraryGrip && spec.libraryGrip.test(a.getClip().name));
  let move = null; // { def, t, keys, stop, end }
  let endFade = 0; // how slowly to leave the move that just ended
  let current = null;
  let attackLeft = 0;
  let attackLen = 0;
  let hitLeft = 0;
  let slash = 0; // how strongly the blade trails light (0..1)
  let weapon = null;
  let bladeLen = 1;
  const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const tripoGrip = new THREE.Quaternion().setFromAxisAngle(xAxis, spec.gripTilt || 0);
  const libraryGrip = new THREE.Quaternion();
  const gripQ = new THREE.Quaternion();
  const trailQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...(spec.trail || [0, -1, 0])).normalize());
  // Cross-fade to an action (restart: play it again from the start if it is already on).
  const fadeTo = (a, fade = 0.15, restart = false) => {
    if (!a) return;
    if (a === current) {
      if (restart) a.reset().play();
      return;
    }
    a.reset().play();
    if (current) a.crossFadeFrom(current, fade, false);
    current = a;
  };
  fadeTo(actions.idle, 0);
  const hand = spec.hand ? root.getObjectByName(spec.hand) : null;
  return {
    group: holder,
    mats,
    hand,
    /** Hold a weapon (an Object3D whose blade runs along +Z from its grip at the origin). */
    holdWeapon(w) {
      if (!hand) return;
      weapon = w;
      bladeLen = Math.max(0.5, new THREE.Box3().setFromObject(w).max.z || 1); // (not yet scaled or placed)
      weapon.scale.setScalar((spec.weaponScale || 1) / tpl.scale); // the model is scaled by tpl.scale
      root.add(weapon); // placed at the hand every frame (see update)
    },
    /** How strongly the blade should trail light this frame (0 = not at all). */
    get slash() {
      return weapon ? slash : 0;
    },
    /** The blade's world position: a point part-way up it, and its tip. */
    blade(base, tip) {
      if (!weapon) return false;
      weapon.updateMatrixWorld(true);
      base.set(0, 0, bladeLen * 0.6).applyMatrix4(weapon.matrixWorld);
      tip.set(0, 0, bladeLen * 1.08).applyMatrix4(weapon.matrixWorld);
      return true;
    },
    update(dt, s) {
      slash = 0;
      if (s.dead) {
        move = null;
        if (actions.death && current !== actions.death) {
          fadeTo(actions.death, 0.1);
          actions.death.time = spec.deathFrom || 0;
        } else fadeTo(actions.death || actions.idle, 0.1);
      } else {
        if (s.move && moves[s.move]) {
          // A skill: its keys, stretched so the strike lands as the dash or leap ends.
          const def = moves[s.move];
          let keys = def.keys.map((k) => k.slice());
          if (def.land != null && s.moveDur > 0) {
            const at = keys[def.land][0];
            const shift = s.moveDur - at;
            keys = keys.map(([t, c], i) => [i <= def.land ? (t * s.moveDur) / at : t + shift, c]);
          }
          const stop = def.stop ? [def.stop[0] + (def.land != null && s.moveDur > 0 ? s.moveDur - def.keys[def.land][0] : 0), def.stop[1]] : null;
          move = { def, t: 0, keys, stop, end: keys[keys.length - 1][0] + (stop ? stop[1] : 0) };
          def.action.timeScale = 0;
          attackLeft = 0;
          hitLeft = 0;
          fadeTo(def.action, 0.05, true);
        }
        if (move) {
          move.t += dt;
          if (move.t >= move.end) {
            endFade = move.def.fade || 0.25;
            move = null;
          }
        }
        if (s.attackStart && actions.attack && !move && !s.move) {
          const len = actions.attack.getClip().duration;
          attackLeft = Math.max(0.35, s.attackDur * 1.8);
          attackLen = attackLeft;
          actions.attack.timeScale = len / attackLeft;
          fadeTo(actions.attack, 0.06, true); // from the start, even if already swinging
        }
        if (s.hitStart && actions.hit && attackLeft <= 0 && !move && !s.spinning && !s.moving) {
          // A flinch, when standing (running and attacking carry on).
          hitLeft = 0.55;
          actions.hit.timeScale = actions.hit.getClip().duration / 0.75;
          fadeTo(actions.hit, 0.06, true);
        }
        if (hitLeft > 0) hitLeft -= dt;
        const flinching = hitLeft > 0 && !s.moving;
        if (attackLeft > 0) attackLeft -= dt;
        if (move) {
          // Pose the move at its clip time (held still for a moment at the impact).
          const m = move;
          let t = m.t;
          if (m.stop) t = t < m.stop[0] ? t : t < m.stop[0] + m.stop[1] ? m.stop[0] : t - m.stop[1];
          m.def.action.time = warp(m.keys, t);
          const [a, b] = m.def.slash || [0, 0];
          const sh = m.def.land != null && s.moveDur > 0 ? m.keys[m.def.land][0] - m.def.keys[m.def.land][0] : 0;
          if (m.t >= a + sh && m.t <= b + sh) slash = 1;
        } else if (s.spinning && actions.spin) {
          actions.spin.time = spec.spin.at;
          fadeTo(actions.spin, 0.08);
          slash = 1;
        } else if (attackLeft > 0) {
          const k = 1 - attackLeft / attackLen;
          if (k > 0.3 && k < 0.7) slash = 0.55;
        } else if (flinching) {
          // let the flinch play out
        } else if (s.moving && actions.run) {
          actions.run.timeScale = Math.max(0.6, Math.min(1.8, (s.speed || 6) / 6.5));
          fadeTo(actions.run, endFade || 0.2);
        } else fadeTo(actions.idle, endFade || (current === actions.run ? 0.35 : current === actions.spin ? 0.2 : 0.25)); // ease into a stop
        if (!move) endFade = 0;
      }
      mixer.update(dt);
      if (weapon) {
        // In the hand, at the grip angle, blending to the trailing pose while the run plays.
        root.updateMatrixWorld(true);
        tmpM.copy(root.matrixWorld).invert().multiply(hand.matrixWorld).decompose(tmpP, tmpQ, tmpS);
        weapon.position.copy(tmpP);
        // The two clip sets hold the blade differently; blend by how much each is playing.
        // (an action that has never played still reports full weight, so ask if it is running)
        let libW = 0;
        for (const a of library) if (a.isRunning() || a === current) libW += a.getEffectiveWeight();
        gripQ.copy(tripoGrip).slerp(libraryGrip, Math.min(1, libW));
        weapon.quaternion.copy(tmpQ).multiply(gripQ);
        const runW = actions.run && actions.run.isRunning() && !s.dead && !s.spinning && !move && attackLeft <= 0 ? actions.run.getEffectiveWeight() : 0;
        if (runW > 0.01) weapon.quaternion.slerp(trailQ, runW);
      }
    },
  };
}

/** Clip time at time t along keys [[t, clipTime], ...] (straight lines between keys). */
function warp(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, c1] = keys[i];
    if (t <= t1) {
      const [t0, c0] = keys[i - 1];
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      return c0 + (c1 - c0) * k;
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * Swap a hand-built hero's look for its rigged model once that has loaded. The hand-built
 * model's group stays (so position, facing, glow and the parry guard work as before); its body
 * is hidden and its weapon moves into the rigged model's hand.
 */
export function upgradeHero(model, cls) {
  const id = `hero_${cls}`;
  if (!RIGGED[id]) return;
  loadRigged(id).then((tpl) => {
    if (!tpl || model.disposed || model.rig) return;
    const rig = instantiate(tpl);
    const arm = model.parts.arm;
    const weapon = new THREE.Group();
    // The arm's first child is the sleeve; the rest is the weapon, held along +Z from z≈0.6.
    for (const c of arm.children.slice(1)) weapon.add(c);
    weapon.children.forEach((c) => (c.position.z -= 0.6));
    rig.holdWeapon(weapon);
    model.parts.body.visible = false;
    model.group.add(rig.group);
    model.mats.push(...rig.mats);
    rig.baseTurn = rig.group.rotation.y;
    model.rig = rig;
  });
}
