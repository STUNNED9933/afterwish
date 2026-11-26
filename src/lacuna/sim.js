// Lacuna (Chapter 2), engine phase 1: the land's simulation.
//
// Players walk the land; beasts live in its chunks. A beast only thinks when a player is near (within WAKE):
// everywhere else it sleeps, where it stands, and costs nothing. Each step only looks at the beasts whose home
// chunk is next to a player's, so a land with a thousand beasts and one player steps a handful of them.
//
// Combat comes in phase 2: here a beast that reaches you only swipes (an event), so the waking, chasing,
// giving up and going home can be seen and measured. Deterministic (sim/dmath.js only, one seeded rng).
import { makeRng } from '../sim/rng.js';
import { dHypot, dAtan2, dCos, dSin } from '../sim/dmath.js';
import { Land, LAND, CHUNKS, BEASTS, chunkOf, TOWN } from './land.js';

export const TICK = 1 / 30;
export const WAKE = 48; // a beast this close to a player is awake
export const SPEED = { walk: 1.8, run: 5.6, sprint: 8.2 };
const PLAYER_R = 0.4;
const SWIPE = { reach: 1.9, every: 1.4 };

export class LandWorld {
  constructor({ seed = LAND.seed } = {}) {
    this.seed = seed;
    this.land = new Land(seed);
    this.rng = makeRng(seed ^ 0x5bd1e995);
    this.time = 0;
    this.players = new Map(); // pid -> player
    this.beasts = [];
    this.byChunk = Array.from({ length: CHUNKS * CHUNKS }, () => []); // beasts by home chunk
    this.events = [];
    this.stats = { awake: 0, looked: 0, active: 0 };
    this.land.all(); // 64 chunks: a few milliseconds, and every beast's home is known from the start
    for (const ch of this.land.chunks) {
      for (const s of ch.spawns) {
        const b = { id: this.beasts.length + 1, type: s.type, x: s.x, z: s.z, hx: s.x, hz: s.z, facing: this.rng() * 6.283, state: 'idle', t: this.rng() * 4, tx: s.x, tz: s.z, swipeT: 0, awake: false, chunk: ch.cz * CHUNKS + ch.cx };
        this.beasts.push(b);
        this.byChunk[b.chunk].push(b);
      }
    }
  }

  /** A player arrives (by default at Sunmere's south gate). */
  addPlayer(pid, at = { x: TOWN.x + 2, z: TOWN.z + TOWN.r + 6 }) {
    const p = { pid, x: at.x, z: at.z, facing: -Math.PI / 2, mx: 0, mz: 0, pace: 'run', moving: false, speed: 0 };
    this.land.pushOut(p, PLAYER_R);
    this.players.set(pid, p);
    return p;
  }

  removePlayer(pid) {
    this.players.delete(pid);
  }

  /** What a player wants: a direction on the ground (mx, mz; length up to 1) and a pace. */
  input(pid, { mx = 0, mz = 0, pace = 'run' } = {}) {
    const p = this.players.get(pid);
    if (!p) return;
    const len = dHypot(mx, mz);
    p.mx = len > 1 ? mx / len : mx;
    p.mz = len > 1 ? mz / len : mz;
    p.pace = SPEED[pace] ? pace : 'run';
  }

  step(dt = TICK) {
    this.time += dt;
    for (const p of this.players.values()) {
      if (p.driven) continue; // (online) moved by its own browser, checked by the server (room.js)
      const len = dHypot(p.mx, p.mz);
      p.moving = len > 0.05;
      p.speed = p.moving ? SPEED[p.pace] * len : 0;
      if (p.moving) {
        p.x += p.mx * SPEED[p.pace] * dt;
        p.z += p.mz * SPEED[p.pace] * dt;
        p.facing = dAtan2(p.mz, p.mx);
        this.land.pushOut(p, PLAYER_R);
      }
    }
    if (this.noBeasts) return; // (online, in a browser) the server runs the beasts
    // Which chunks are live: each player's and the ones round it (WAKE is under a chunk across).
    const live = new Set();
    for (const p of this.players.values()) {
      const { cx, cz } = chunkOf(p.x, p.z);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, z = cz + dz;
          if (x >= 0 && z >= 0 && x < CHUNKS && z < CHUNKS) live.add(z * CHUNKS + x);
        }
    }
    let awake = 0, looked = 0;
    for (const i of live) {
      for (const b of this.byChunk[i]) {
        looked++;
        const near = this.nearest(b);
        b.awake = !!near && near.d < WAKE;
        if (!b.awake) continue;
        awake++;
        this.think(b, near, dt);
      }
    }
    this.stats = { awake, looked, active: live.size };
  }

  /** The nearest player to a beast, and how far. */
  nearest(b) {
    let best = null, bd = Infinity;
    for (const p of this.players.values()) {
      const d = dHypot(p.x - b.x, p.z - b.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { p: best, d: bd } : null;
  }

  think(b, { p, d }, dt) {
    const def = BEASTS[b.type];
    const fromHome = dHypot(b.x - b.hx, b.z - b.hz);
    if (b.state === 'chase' && (fromHome > def.leash || d > def.aggro * 1.8)) b.state = 'return';
    if (b.state === 'return' && fromHome < 2) { b.state = 'idle'; b.t = 1 + this.rng() * 3; }
    if (b.state === 'idle' && d < def.aggro && fromHome < def.leash * 0.8) {
      b.state = 'chase';
      this.emit('aggro', { id: b.id, pid: p.pid });
    }
    let tx = b.x, tz = b.z, speed = 0;
    if (b.state === 'chase') {
      tx = p.x; tz = p.z; speed = def.speed;
      b.swipeT -= dt;
      if (d < SWIPE.reach + def.r) {
        speed = 0;
        b.facing = dAtan2(p.z - b.z, p.x - b.x);
        if (b.swipeT <= 0) {
          b.swipeT = SWIPE.every;
          this.emit('swipe', { id: b.id, pid: p.pid });
        }
      }
    } else if (b.state === 'return') {
      tx = b.hx; tz = b.hz; speed = def.speed * 0.8;
    } else {
      // Idle: stand a while, then amble to somewhere near home.
      b.t -= dt;
      if (b.t <= 0) {
        const a = this.rng() * 6.283, r = 1 + this.rng() * 6;
        b.tx = b.hx + dCos(a) * r;
        b.tz = b.hz + dSin(a) * r;
        b.t = 3 + this.rng() * 5;
      }
      tx = b.tx; tz = b.tz; speed = 1.3;
    }
    const dx = tx - b.x, dz = tz - b.z, len = dHypot(dx, dz);
    b.moving = speed > 0 && len > 0.3;
    if (b.moving) {
      const step = Math.min(len, speed * dt);
      b.x += (dx / len) * step;
      b.z += (dz / len) * step;
      b.facing = dAtan2(dz, dx);
      this.land.pushOut(b, def.r);
    }
  }

  emit(type, data) {
    this.events.push({ type, t: this.time, ...data });
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
  }
}
