// Rigged enemies, bosses and Haven's people (0.44), made with Tripo (tools/models/roster.json:
// the b_*, e_* and n_* entries). Each loads when first seen; until then, or if it cannot load,
// the hand-built body from models.js stays. Nothing about the game depends on these.
//
// A creature's clips are found by what they are (Tripo names them after its presets): idle,
// walk, slash, chop, cast, fire, hurt, fall, and a few gestures. Every attack in an enemy's kit
// plays one of them, timed so the blow lands when the game resolves it: the wind-up runs the clip
// up to its strike, and the follow-through plays out after.
import { DEEP } from '../sim/endgame.js';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RIGGED, loadRigged, loadWeapon } from './rigged.js';
import { addRim } from './environment.js';

/**
 * Which model each enemy type uses (types that share a body share a model). height: metres
 * in game (the hand-built body's height times its scale). strike: how far into each kind of
 * clip the blow falls (0..1). kinds: attack name -> clip kind, past the default by shape.
 */
export const CREATURES = {
  // bosses
  boss: { model: 'b_warden', height: 3.5, weapon: { cls: 'warrior', size: 2.3 } }, // Tripo left out his greatsword: he carries the warrior's blade, made huge
  boss2: { model: 'b_mycelord', height: 3.8 },
  boss3: { model: 'b_unmade', height: 4.3, kinds: { weep: 'sob', people: 'angry', cradle: 'cast', lullaby: 'cast' } },
  herald: { model: 'b_herald', height: 3.7, kinds: { present: 'bow', proclaim: 'cast', decree: 'cast' } },
  asker: { model: 'b_asker', height: 4.1, glow: [0.35, 0.27, 0.1], kinds: { granted: 'greet' } },
  // the Primordials (0.54)
  cinder: { model: 'b_cinder', height: 4.6 },
  undertow: { model: 'b_undertow', height: 4.4 },
  rootmother: { model: 'b_rootmother', height: 5.0 },
  choir: { model: 'b_choir', height: 4.2, glow: [0.18, 0.26, 0.36] },
  stillness: { model: 'b_stillness', height: 4.8 },
  // enemies
  grunt: { model: 'e_husk', height: 1.85 },
  spitter: { model: 'e_spitter', height: 1.9 },
  brute: { model: 'e_crusher', height: 2.7 },
  stalker: { model: 'e_stalker', height: 1.3, beast: true },
  wolf: { model: 'e_wolf', height: 1.3, beast: true },
  scarab: { model: 'e_scarab', height: 1.5, beast: true },
  imp: { model: 'e_imp', height: 1.25 },
  knight: { model: 'e_knight', height: 2.3 },
  oathshade: { model: 'e_oathshade', height: 2.3 }, // the Warden's men, called back as shades (0.53: their own)
  heraldguard: { model: 'e_heraldguard', height: 2.4 }, // the Herald's honour guard (0.53: their own)
  wishthief: { model: 'e_wishthief', height: 1.3 }, // (0.53)
  wishling: { model: 'p_wishling', height: 1.0, float: 0.9 }, // (0.53) a floating light: a prop, bobbing
  wishstar: { model: 'p_wishstar', height: 1.9, float: 1.0, spin: 0.6 }, // (0.53) the Unmade's wish-stars
  edric: { model: 'e_edric', height: 2.4 }, // (0.53) Edric of the Blue Trim (a knight, by name)
  courtguard: { model: 'e_courtguard', height: 2.4 },
  shaman: { model: 'e_shaman', height: 2.2 },
  golem: { model: 'e_golem', height: 3.3 },
  sporecap: { model: 'e_sporecap', height: 2.0 },
  wraith: { model: 'e_wraith', height: 2.5 },
  glassbound: { model: 'e_glassbound', height: 2.1 },
  // the Deep's own (0.54)
  ashwalker: { model: 'e_ashwalker', height: 2.0 },
  unnamed: { model: 'e_unnamed', height: 2.1 },
  rootbound: { model: 'e_rootbound', height: 2.3 },
  echo: { model: 'e_echo', height: 1.9 },
  hush: { model: 'e_hush', height: 2.2 },
};
/** Haven's people. */
export const PEOPLE = {
  wren: { model: 'n_wren', height: 1.7 },
  bram: { model: 'n_bram', height: 1.95 },
  odile: { model: 'n_odile', height: 1.75 },
  pip: { model: 'n_pip', height: 1.25 },
  tomashusk: { model: 'e_husk', height: 1.85, tint: 0x8a3a30 }, // (0.47) Pip's father on the road, the scarf gone to colour
  lark: { model: 'n_lark', height: 1.62 }, // Odile's apprentice (0.53: her own)
  tomas: { model: 'n_tomas', height: 1.85 }, // (0.53) Pip's father, home
  merchant: { model: 'n_merchant', height: 1.8 }, // (0.53) the travelling merchant
};

// The models that ship (assets/models/<id>.glb). A type whose model is not here yet keeps its
// hand-built body, without asking the server for a file that is not there.
export const SHIPPED = new Set(['b_warden', 'b_mycelord', 'b_unmade', 'b_herald', 'b_asker', 'n_wren', 'n_bram', 'n_odile', 'n_pip', 'e_husk', 'e_knight', 'e_wraith', 'e_golem', 'e_imp', 'e_shaman', 'e_sporecap', 'e_crusher', 'e_spitter', 'e_courtguard', 'e_glassbound', 'e_wolf', 'e_stalker', 'e_scarab', 'e_wishthief', 'e_oathshade', 'e_heraldguard', 'e_edric', 'p_wishling', 'p_wishstar', 'n_lark', 'n_tomas', 'n_merchant', 'b_cinder', 'b_undertow', 'b_rootmother', 'b_choir', 'b_stillness', 'e_ashwalker', 'e_unnamed', 'e_rootbound', 'e_echo', 'e_hush']);
for (const t of [CREATURES, PEOPLE]) for (const k in t) if (!SHIPPED.has(t[k].model)) delete t[k];
// Every model is a RIGGED entry (rigged.js loads and caches it); clips are matched by name below.
const ALL_MODELS = new Set([...Object.values(CREATURES), ...Object.values(PEOPLE)].map((c) => c.model));
for (const id of ALL_MODELS) {
  RIGGED[id] = { url: `models/${id}.glb`, height: 1, turn: -Math.PI / 2, recentre: '*', rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis', 'Hips'] };
}

/** Which clip in a loaded model plays each kind of thing (by Tripo's preset names). */
const CLIP_WORDS = {
  idle: ['idle', 'standing_relax', 'wait'],
  walk: ['walk', 'march', 'run'],
  slash: ['slash', 'chop', 'box', 'kick', 'stab', 'cleave', 'attack', 'shot'],
  chop: ['chop', 'smash', 'slash', 'lift_heavy', 'cleave', 'attack'],
  cast: ['cast', 'fire', 'shoot', 'power', 'volley', 'slash', 'attack'],
  fire: ['fire', 'shoot', 'shot', 'cast', 'slash', 'attack'],
  hurt: ['hit_to_body', 'hurt', 'hit'],
  fall: ['fall', 'defeat', 'death'],
  sob: ['sob', 'cry', 'depressed', 'cast'],
  angry: ['angry', 'cast', 'chop'],
  bow: ['bow', 'chop', 'cast'],
  greet: ['greet', 'cast'],
  look: ['look_around', 'idle'],
  agree: ['agree', 'idle'],
  relax: ['standing_relax', 'fold_arms', 'idle'],
};
function findClip(clips, kind) {
  const names = Object.keys(clips);
  for (const w of CLIP_WORDS[kind] || [kind]) {
    const hit = names.find((n) => n.toLowerCase().includes(w));
    if (hit) return clips[hit];
  }
  return null;
}
/** Where the blow falls in each kind of clip (share of its length). */
const STRIKE_AT = { slash: 0.42, chop: 0.5, cast: 0.55, fire: 0.45, sob: 0.4, angry: 0.5, bow: 0.5, greet: 0.5 };

/** The kind of clip an attack plays: by name (a creature's own), then by its shape. */
export function attackKind(type, atk) {
  const c = CREATURES[type];
  if (c && c.kinds && c.kinds[atk.name]) return c.kinds[atk.name];
  if (atk.shape === 'call') return 'angry';
  if (atk.shape === 'shot') return atk.around ? 'cast' : 'fire';
  if (atk.shape === 'rain' || atk.shape === 'beam') return 'cast';
  if (atk.shape === 'ring' || (atk.shape === 'circle' && !atk.leap)) return 'chop';
  return 'slash';
}

const DEEP_OWN = new Set(['ashwalker', 'unnamed', 'rootbound', 'echo', 'hush']); // the Deep's own enemies keep their colours
export function creatureSpec(type, e = null) {
  // New Game+ (0.45): the Unmade wears your old hero's face, huge and gone violet
  if (e && e.oldCls) return { model: 'hero_' + e.oldCls, height: 4.0, tint: 0x8a6ad8 };
  if (e && e.named && CREATURES[e.named]) return CREATURES[e.named]; // (0.53) Edric has his own body
  const c = CREATURES[type] || null;
  if (c && e && e.ember > 0 && !(e.def && e.def.primordial) && !DEEP_OWN.has(type)) {
    // (0.54) the mountain's own, changed by the Deep: darkened, in the Depth's colour
    const D = Object.values(DEEP.depths).find((d) => d.ember === e.ember);
    if (D) return { ...c, tint: D.color, dark: 0.55 };
  }
  return c;
}

/** Load the model for an enemy type or a person (null if there is none, or it cannot load). */
export function loadCreature(spec) {
  if (!spec) return Promise.resolve(null);
  return loadRigged(spec.model);
}

/**
 * A copy of a loaded creature with its own animation player. Call update(dt, state) every frame:
 * { dead, stunned, moving, speed, windup: { kind, k } (k = 0..1 of the wind-up), strike (seconds
 * since the blow fell, or -1), hurt (seconds since it was hit), gesture (a kind to play once) }.
 */
export function makeCreature(tpl, spec) {
  const root = SkeletonUtils.clone(tpl.scene);
  const mats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = addRim(o.material.clone(), spec.tint || 0x9fb8ff, spec.tint ? 0.6 : 0.3);
    if (spec.tint) o.material.color.lerp(new THREE.Color(spec.tint), 0.45);
    if (spec.dark) o.material.color.multiplyScalar(spec.dark); // (0.54) darkened in the Deep
    if (spec.glow) o.material.userData.glow = spec.glow; // a light of its own (the Asker)
    o.material.userData.cue = 0.4; // flashes and warnings, softer on a painted body than on a flat one
    mats.push(o.material);
  });
  const holder = new THREE.Group();
  holder.rotation.y = -Math.PI / 2;
  holder.scale.setScalar(tpl.scale * spec.height);
  holder.add(root);
  // A blade in the right hand (the Warden's: Tripo left his out). It is not parented to the hand
  // bone, whose scale changes with the pose and the rig's units, but placed by the hand each frame
  // in the creature's own space, at a fixed size, as the heroes hold theirs.
  let blade = null;
  if (spec.weapon) {
    loadWeapon(spec.weapon.cls, 1).then((w) => {
      if (!w || !root.getObjectByName('R_Hand')) return;
      blade = { w, hand: root.getObjectByName('R_Hand'), grip: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 4) };
      w.scale.setScalar(spec.weapon.size / holder.scale.x);
      holder.add(w);
      for (const m of w.userData.mats || []) mats.push(m);
    });
  }
  const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  const placeBlade = () => {
    if (!blade) return;
    holder.updateMatrixWorld(true);
    tmpM.copy(holder.matrixWorld).invert().multiply(blade.hand.matrixWorld);
    tmpM.decompose(tmpP, tmpQ, tmpS);
    blade.w.position.copy(tmpP);
    blade.w.quaternion.copy(tmpQ).multiply(blade.grip);
  };
  const mixer = new THREE.AnimationMixer(root);
  const cache = {};
  const action = (kind, once) => {
    if (cache[kind] !== undefined) return cache[kind];
    const clip = findClip(tpl.clips, kind);
    let a = null;
    if (clip) {
      a = mixer.clipAction(clip);
      if (once) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
    }
    return (cache[kind] = a);
  };
  let current = null;
  let posed = null; // an attack being posed by hand (its time set each frame)
  const fadeTo = (a, fade = 0.18) => {
    if (!a || a === current) return;
    a.reset().play();
    if (current) a.crossFadeFrom(current, fade, false);
    current = a;
  };
  fadeTo(action('idle'), 0);
  let follow = 0; // seconds of follow-through left after a blow
  let bob = Math.random() * 6;
  let gestureLeft = 0;
  return {
    group: holder,
    mats,
    /** Wind-ups, strikes and the rest. */
    update(dt, s) {
      this.pose(dt, s);
      placeBlade();
      if (spec.float != null) {
        // (0.53) a floating light: it bobs, and some turn slowly
        bob += dt;
        root.position.y = (spec.float + 0.12 * Math.sin(bob * 2.2)) / holder.scale.y;
        if (spec.spin) root.rotation.y += spec.spin * dt;
      }
    },
    pose(dt, s) {
      if (s.dead) {
        const a = action('fall', true);
        if (a && current !== a) {
          a.timeScale = 1.3;
          fadeTo(a, 0.12);
        }
        mixer.update(dt);
        return;
      }
      if (s.windup) {
        // The wind-up runs the clip up to its strike; the blow lands with the game's.
        const a = action(s.windup.kind, true) || action('slash', true);
        if (a) {
          if (posed !== a) {
            fadeTo(a, 0.1);
            posed = a;
          }
          const len = a.getClip().duration;
          a.paused = false;
          a.timeScale = 0;
          a.time = len * (STRIKE_AT[s.windup.kind] || 0.45) * Math.min(1, s.windup.k);
          follow = 0.5;
        }
        mixer.update(dt);
        return;
      }
      if (posed && follow > 0) {
        // after the blow: the rest of the swing, at its own pace
        follow -= dt;
        posed.timeScale = 1.2;
        if (follow <= 0) posed = null;
        mixer.update(dt);
        return;
      }
      posed = null;
      if (s.gesture && gestureLeft <= 0) {
        const g = action(s.gesture, true);
        if (g) {
          fadeTo(g, 0.25);
          gestureLeft = g.getClip().duration;
        }
      }
      if (gestureLeft > 0) {
        gestureLeft -= dt;
        mixer.update(dt);
        return;
      }
      if (s.stunned) {
        const h = action('hurt');
        if (h) {
          fadeTo(h, 0.12);
          h.timeScale = 0.35;
        }
      } else if (s.moving) {
        const w = action('walk');
        if (w) {
          fadeTo(w, 0.2);
          w.timeScale = Math.max(0.6, Math.min(2.2, (s.speed || 3) / (spec.beast ? 4 : 2.6)));
        }
      } else {
        const idle = action(s.idleKind || 'idle');
        if (idle) fadeTo(idle, 0.25);
        else if (current) current.timeScale = 0.12; // a beast with only a walk: nearly still, breathing
      }
      mixer.update(dt);
    },
  };
}
