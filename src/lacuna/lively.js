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
      if (!l) {
        const got = this.take(w.spec);
        if (!got) continue;
        l = got;
        this.live.set(w.key, l);
        this.scene.add(l.body.outer);
      }
      const g = l.body.outer;
      g.position.set(w.x, w.y || 0, w.z);
      g.rotation.y = Math.PI / 2 - w.facing; // as the cheap shapes are turned (+Z to the facing)
      g.scale.setScalar(w.scale || 1);
      l.body.update(dt, w.state);
      drawn.add(w.key);
    }
    return drawn;
  }
}
