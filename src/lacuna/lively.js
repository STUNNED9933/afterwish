// (0.99.29) Lacuna's crowd and beasts, close up: the nearest few are drawn as real animated bodies (the models the
// main game already ships: its villagers, its wolf, its golem), the rest stay the cheap instanced shapes. Bodies
// are pooled by model and handed from one person (or beast) to the next as the hero moves; a body still loading
// leaves its owner drawn the cheap way until it arrives.
import * as THREE from 'three';
import { loadRigged } from '../render/rigged.js';
import { makeCreature } from '../render/creatures.js';

export class Lively {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map(); // owner key -> { body, model }
    this.pool = new Map(); // model -> [body]
    this.tpl = new Map(); // model -> template (or null: none), once loaded
    this.loading = new Set();
  }

  /** A free body for `spec` (from the pool, or a new copy), or null while its model loads. */
  take(spec) {
    const key = spec.model + (spec.tint ? ':' + spec.tint : '') + (spec.vary ? ':' + spec.vary : '');
    const free = this.pool.get(key);
    if (free && free.length) return { body: free.pop(), key };
    if (!this.tpl.has(spec.model)) {
      if (!this.loading.has(spec.model)) {
        this.loading.add(spec.model);
        loadRigged(spec.model).then((t) => this.tpl.set(spec.model, t || null)).catch(() => this.tpl.set(spec.model, null));
      }
      return null;
    }
    const t = this.tpl.get(spec.model);
    if (!t) return null;
    const body = makeCreature(t, spec);
    body.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    body.outer = new THREE.Group(); // (the creature's own group turns its model to face +Z: this one turns and sizes it)
    body.outer.add(body.group);
    // (0.99.30) a long body (a boar, a wolf) set back so its snout, not its middle, is at the edge of its reach:
    // otherwise it stands with its head inside whoever it is biting
    if (spec.back) body.group.position.z = -spec.back;
    return { body, key };
  }

  /**
   * Each frame. `want`: [{ key, spec, x, z, facing, scale, state }], the ones to draw as bodies (nearest first;
   * the caller has chosen them). Returns the set of keys that are drawn as bodies this frame (the caller hides
   * their cheap shapes).
   */
  frame(dt, want) {
    const drawn = new Set();
    const keep = new Set(want.map((w) => w.key));
    for (const [k, l] of this.live) {
      if (keep.has(k)) continue;
      this.scene.remove(l.body.outer);
      if (!this.pool.has(l.key)) this.pool.set(l.key, []);
      this.pool.get(l.key).push(l.body);
      this.live.delete(k);
    }
    for (const w of want) {
      let l = this.live.get(w.key);
      // (1.1) the same owner in another body now (an elite where an ordinary beast was): give the old one back
      if (l && l.key !== w.spec.model + (w.spec.tint ? ':' + w.spec.tint : '') + (w.spec.vary ? ':' + w.spec.vary : '')) {
        this.scene.remove(l.body.outer);
        if (!this.pool.has(l.key)) this.pool.set(l.key, []);
        this.pool.get(l.key).push(l.body);
        this.live.delete(w.key);
        l = null;
      }
      if (!l) {
        const got = this.take(w.spec);
        if (!got) continue;
        l = got;
        this.live.set(w.key, l);
        this.scene.add(l.body.outer);
      }
      const g = l.body.outer;
      g.position.set(w.x, w.y || 0, w.z);
      // as the cheap shapes are turned (+Z to the facing), (0.99.32) eased: a body never snaps round in a frame
      const want = Math.PI / 2 - w.facing;
      if (l.yaw === undefined || dt <= 0) l.yaw = want;
      else { const d = Math.atan2(Math.sin(want - l.yaw), Math.cos(want - l.yaw)); l.yaw += d * Math.min(1, dt * 12); }
      g.rotation.y = l.yaw;
      g.scale.setScalar(w.scale || 1);
      // (1.1.2) a blow: a four-legged body lunges (forward, a little up, nose down, then back); one with an attack of
      // its own plays it (see creatures.js)
      const sw = w.state && w.state.swung, wd = w.state && w.state.wind;
      if (w.spec.beast && !w.spec.attack && wd >= 0 && !(sw >= 0)) {
        // the wind-up: drawing back and down, head up, haunches set
        const k = Math.min(1, wd / 0.4), s = (w.scale || 1) * (w.spec.height || 1), e = k * k * (3 - 2 * k);
        g.position.x -= Math.cos(w.facing) * 0.28 * s * e;
        g.position.z -= Math.sin(w.facing) * 0.28 * s * e;
        g.position.y -= 0.05 * s * e;
        g.rotation.order = 'YXZ';
        g.rotation.x = -0.3 * e;
        l.body.update(dt, { ...w.state, moving: false });
        drawn.add(w.key);
        continue;
      }
      if (w.spec.beast && !w.spec.attack && sw >= 0 && sw < 0.55) {
        const k = sw < 0.16 ? sw / 0.16 : Math.max(0, 1 - (sw - 0.16) / 0.39), s = (w.scale || 1) * (w.spec.height || 1);
        const ease = k * k * (3 - 2 * k);
        g.position.x += Math.cos(w.facing) * 0.85 * s * ease;
        g.position.z += Math.sin(w.facing) * 0.85 * s * ease;
        g.position.y += 0.12 * s * Math.sin(Math.PI * Math.min(1, sw / 0.32));
        g.rotation.order = 'YXZ';
        g.rotation.x = (sw < 0.16 ? 0.38 : 0.38 * ease) * (w.spec.lungeDip || 1);
        l.body.update(dt, { ...w.state, moving: true, speed: 14 });
        drawn.add(w.key);
        continue;
      }
      g.rotation.x = 0;
      // a swing: wound up (from its start to the strike, as the sim winds up), then followed through after the blow
      const A = w.spec.attack;
      const at = A && wd >= 0 && !(sw >= 0) ? Math.min(1, wd / 0.4) * 0.5 : A && sw >= 0 && sw < 0.5 ? 0.5 + 0.5 * (sw / 0.5) : -1;
      l.body.update(dt, at >= 0 ? { ...w.state, attack: A, attackK: at } : w.state);
      drawn.add(w.key);
    }
    return drawn;
  }
}
