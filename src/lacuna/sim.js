// Lacuna (Chapter 2): the land's simulation.
//
// Players walk the land; beasts live in its chunks. A beast only thinks when a player is near (within WAKE):
// everywhere else it sleeps, where it stands, and costs nothing. Each step only looks at the beasts whose home
// chunk is next to a player's, so a land with a thousand beasts and one player steps a handful of them.
//
// (phase 2) Combat: health and mana, the two classes of the opening (Berserker, Sharpshooter), arrows, beasts
// that fight back, die and come back, heroes who go down and get up again at Sunmere's gate. A hero's strength
// comes from the Dimension Link: the Eternal gear they owned in Votum (each slot counted once, at its highest
// level across their classes), which multiplies their health and damage; beasts are tuned for level 10 in
// every slot. Deterministic (sim/dmath.js only, one seeded rng): the server and a browser agree.
import { makeRng } from '../sim/rng.js';
import { dHypot, dAtan2, dCos, dSin } from '../sim/dmath.js';
import { Land, LAND, CHUNKS, BEASTS, chunkOf, TOWN } from './land.js';

export const TICK = 1 / 30;
export const WAKE = 48; // a beast this close to a player is awake
export const SPEED = { walk: 1.8, run: 5.6, sprint: 8.2 };
const PLAYER_R = 0.4;
const SWIPE_REACH = 1.9;
export const GATE = { x: TOWN.x + 2, z: TOWN.z + TOWN.r + 6 }; // Sunmere's south gate: where heroes arrive and get up again

// ---- the Dimension Link: Eternal levels -> strength
export const LINK_SLOTS = ['weapon', 'helm', 'chest', 'boots', 'ring'];
/** How much the Link gives: each slot up to level 10 in full, past it a third as much (0 to 85). */
export function linkPower(levels) {
  let s = 0;
  for (const slot of LINK_SLOTS) {
    const l = Math.max(0, Math.min(30, Math.floor((levels && levels[slot]) || 0)));
    s += l <= 10 ? l : 10 + (l - 10) * 0.35;
  }
  return s;
}
/** Health and damage multiplier: 1 with no Eternal gear, 3 at level 10 in every slot, 4.4 at 30. */
export const linkMult = (power) => 1 + power * 0.04;
/** The levels a hero brings, from the saves of every class they have played (best of each slot). */
export function linkFrom(saves) {
  const out = {};
  for (const s of saves || []) {
    if (!s) continue;
    for (const slot of LINK_SLOTS) {
      const it = (s.equipped && s.equipped[slot] && s.equipped[slot].eternal && s.equipped[slot]) || (s.eternals && s.eternals[slot]);
      if (it && it.eternal) out[slot] = Math.max(out[slot] || 0, Math.min(30, it.level || 1));
    }
  }
  return out;
}

// ---- the two classes of the opening (working names; numbers to be tuned by playing)
export const KITS = {
  warrior: {
    name: 'Berserker', hp: 320, dmg: 20, mp: 100,
    passive: 'Harder when hurt: up to +60% damage as your health falls.',
    basic: { name: 'Cleave', every: 0.72, range: 2.9, arc: 1.9, mult: 1.4 },
    Q: { id: 'leap', name: 'Leap', mana: 20, cd: 7, range: 12, radius: 3.6, mult: 2.2, time: 0.55, text: 'Leap where you look and smash the ground.' },
    E: { id: 'whirl', name: 'Whirlwind', mana: 25, cd: 9, radius: 3.2, every: 0.3, hits: 5, mult: 0.75, text: 'Spin, cutting everything round you.' },
    R: { id: 'rage', name: 'Bloodrage', mana: 40, cd: 30, dur: 8, more: 0.4, leech: 0.15, text: 'For 8 s: +40% damage, and blows heal you.' },
  },
  archer: {
    name: 'Sharpshooter', hp: 260, dmg: 20, mp: 100,
    passive: 'Hold right-click to look down the scope (first person).',
    basic: { name: 'Shot', every: 0.55, speed: 70, range: 45, mult: 1.0 },
    Q: { id: 'volley', name: 'Volley', mana: 20, cd: 6, arrows: 5, spread: 0.55, mult: 0.8, text: 'Five arrows in a fan.' },
    E: { id: 'roll', name: 'Roll', mana: 10, cd: 5, dist: 6.5, time: 0.36, text: 'Roll away (the way you move, or back).' },
    R: { id: 'deadeye', name: 'Deadeye', mana: 45, cd: 18, draw: 0.6, mult: 6, speed: 140, range: 80, text: 'Draw, then loose a shot that goes through everything.' },
  },
};
export const LACUNA_CLASSES = Object.keys(KITS);
const MP_REGEN = 7; // a second
const CALM = 6; // seconds without a fight before health comes back
const RESPAWN = 45; // a beast comes back this long after it falls (if nobody is standing on its home)
const DOWN = 6; // seconds a hero is down

export class LandWorld {
  constructor({ seed = LAND.seed } = {}) {
    this.seed = seed;
    this.land = new Land(seed);
    this.rng = makeRng(seed ^ 0x5bd1e995);
    this.time = 0;
    this.players = new Map(); // pid -> player
    this.beasts = [];
    this.byChunk = Array.from({ length: CHUNKS * CHUNKS }, () => []); // beasts by home chunk
    this.shots = []; // arrows in the air
    this.shotId = 0;
    this.events = [];
    this.stats = { awake: 0, looked: 0, active: 0 };
    this.land.all(); // 64 chunks: a few milliseconds, and every beast's home is known from the start
    for (const ch of this.land.chunks) {
      for (const s of ch.spawns) {
        const def = BEASTS[s.type];
        const b = { id: this.beasts.length + 1, type: s.type, x: s.x, z: s.z, hx: s.x, hz: s.z, facing: this.rng() * 6.283, state: 'idle', t: this.rng() * 4, tx: s.x, tz: s.z, swipeT: 0, awake: false, hp: def.hp, maxHp: def.hp, dead: false, diedAt: 0, target: 0, chunk: ch.cz * CHUNKS + ch.cx };
        this.beasts.push(b);
        this.byChunk[b.chunk].push(b);
      }
    }
  }

  /** A player arrives (by default at Sunmere's south gate). */
  addPlayer(pid, at = GATE, { cls = 'warrior', link = null } = {}) {
    const p = { pid, x: at.x, z: at.z, facing: -Math.PI / 2, mx: 0, mz: 0, pace: 'run', moving: false, speed: 0, cls: KITS[cls] ? cls : 'warrior', link: link || {}, acts: [], cd: { Q: 0, E: 0, R: 0 }, basicT: 0, dead: false, downT: 0, rage: 0, guard: 0, calm: 99, burst: 0, leap: null, roll: null, whirl: null, draw: null };
    this.land.pushOut(p, PLAYER_R);
    this.players.set(pid, p);
    this.refit(p, true);
    return p;
  }

  removePlayer(pid) {
    this.players.delete(pid);
  }

  /** Health, mana and damage from class and Link (keeping how full they were). */
  refit(p, full = false) {
    const kit = KITS[p.cls], power = linkPower(p.link);
    const hpK = full || !p.maxHp ? 1 : p.hp / p.maxHp, mpK = full || !p.maxMp ? 1 : p.mp / p.maxMp;
    p.mult = linkMult(power);
    p.maxHp = Math.round(kit.hp * p.mult);
    p.maxMp = Math.round(kit.mp + power * 0.6);
    p.hp = Math.max(1, Math.round(p.maxHp * hpK));
    p.mp = p.maxMp * mpK;
  }

  setClass(pid, cls) {
    const p = this.players.get(pid);
    if (!p || !KITS[cls] || p.cls === cls) return;
    p.cls = cls;
    p.cd = { Q: 0, E: 0, R: 0 };
    p.leap = p.roll = p.whirl = p.draw = null;
    p.rage = 0;
    this.refit(p);
  }

  setLink(pid, link) {
    const p = this.players.get(pid);
    if (!p) return;
    p.link = link || {};
    this.refit(p);
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

  /** A blow or a skill (k: 'basic', 'Q', 'E', 'R'), aimed at the point (ax, az) on the ground. */
  act(pid, k, ax, az) {
    const p = this.players.get(pid);
    if (!p || p.acts.length >= 4 || !(k === 'basic' || k === 'Q' || k === 'E' || k === 'R')) return;
    p.acts.push({ k, ax, az });
  }

  /** Could this blow or skill go now (for the browser, to show it ready, and not to send what would be refused)? */
  ready(p, k) {
    if (!p || p.dead || p.leap || p.roll || p.draw) return false;
    if (k === 'basic') return p.basicT <= 0 && !p.whirl;
    const s = KITS[p.cls][k];
    return !!s && p.cd[k] <= 0 && p.mp >= s.mana && !p.whirl;
  }

  step(dt = TICK) {
    this.time += dt;
    for (const p of this.players.values()) this.stepPlayer(p, dt);
    this.stepShots(dt);
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
        if (b.dead) {
          if (this.time - b.diedAt >= RESPAWN && !this.someoneNear(b.hx, b.hz, 25)) this.revive(b);
          continue;
        }
        const near = this.nearest(b);
        b.awake = !!near && near.d < WAKE;
        if (!b.awake) continue;
        awake++;
        this.think(b, near, dt);
      }
    }
    this.stats = { awake, looked, active: live.size };
  }

  stepPlayer(p, dt) {
    p.basicT -= dt;
    p.cd.Q -= dt; p.cd.E -= dt; p.cd.R -= dt;
    p.guard -= dt;
    p.calm += dt;
    if (p.rage > 0) p.rage -= dt;
    if (p.dead) {
      p.downT -= dt;
      p.acts.length = 0;
      if (p.downT <= 0) {
        p.dead = false;
        p.hp = p.maxHp;
        p.mp = p.maxMp;
        p.x = GATE.x; p.z = GATE.z;
        p.leap = p.roll = p.whirl = p.draw = null;
        this.land.pushOut(p, PLAYER_R);
        this.emit('up', { pid: p.pid, x: p.x, z: p.z });
      }
      return;
    }
    p.mp = Math.min(p.maxMp, p.mp + MP_REGEN * dt);
    if (p.calm > CALM && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.05 * dt);
    // Walking (moves made by the browser itself, on the server, are taken as they come: see room.js)
    if (!p.driven && !p.leap && !p.roll) {
      const len = dHypot(p.mx, p.mz);
      const slow = p.draw || p.whirl ? 0.45 : 1;
      p.moving = len > 0.05;
      p.speed = p.moving ? SPEED[p.pace] * len * slow : 0;
      if (p.moving) {
        p.x += p.mx * SPEED[p.pace] * slow * dt;
        p.z += p.mz * SPEED[p.pace] * slow * dt;
        if (!p.draw) p.facing = dAtan2(p.mz, p.mx);
        this.land.pushOut(p, PLAYER_R);
      }
    }
    for (const a of p.acts.splice(0)) this.doAct(p, a);
    // What is under way
    if (p.leap) {
      const L = p.leap;
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      if (!p.driven) { p.x = L.fx + (L.tx - L.fx) * k; p.z = L.fz + (L.tz - L.fz) * k; }
      if (k >= 1) {
        p.leap = null;
        if (!p.driven) { p.x = L.tx; p.z = L.tz; this.land.pushOut(p, PLAYER_R); }
        const s = KITS.warrior.Q;
        this.emit('slam', { pid: p.pid, x: L.tx, z: L.tz, r: s.radius });
        this.area(p, L.tx, L.tz, s.radius, s.mult);
      }
    }
    if (p.roll) {
      const R = p.roll;
      R.t += dt;
      const k = Math.min(1, R.t / R.dur);
      if (!p.driven) { p.x = R.fx + (R.tx - R.fx) * k; p.z = R.fz + (R.tz - R.fz) * k; this.land.pushOut(p, PLAYER_R); }
      if (k >= 1) p.roll = null;
    }
    if (p.whirl) {
      const W = p.whirl, s = KITS.warrior.E;
      W.next -= dt;
      if (W.next <= 0) {
        W.next += s.every;
        W.left--;
        this.area(p, p.x, p.z, s.radius, s.mult);
        if (W.left <= 0) p.whirl = null;
      }
    }
    if (p.draw) {
      p.draw.t += dt;
      if (p.draw.t >= KITS.archer.R.draw) {
        const s = KITS.archer.R;
        this.shoot(p, p.draw.dx, p.draw.dz, s.speed, s.range, s.mult, true, 'deadeye');
        p.draw = null;
      }
    }
  }

  doAct(p, { k, ax, az }) {
    if (!this.ready(p, k)) return;
    let dx = ax - p.x, dz = az - p.z;
    const d = dHypot(dx, dz);
    if (!(d > 0.01)) { dx = dCos(p.facing); dz = dSin(p.facing); } else { dx /= d; dz /= d; }
    const kit = KITS[p.cls];
    p.calm = 0;
    if (k === 'basic') {
      p.basicT = kit.basic.every;
      p.facing = dAtan2(dz, dx);
      this.emit('cast', { pid: p.pid, skill: 'basic', x: p.x, z: p.z, every: kit.basic.every });
      if (p.cls === 'warrior') this.cleave(p, dx, dz);
      else this.shoot(p, dx, dz, kit.basic.speed, kit.basic.range, kit.basic.mult, false, 'arrow');
      return;
    }
    const s = kit[k];
    p.mp -= s.mana;
    p.cd[k] = s.cd;
    if (s.id !== 'roll') p.facing = dAtan2(dz, dx);
    if (s.id === 'leap') {
      const far = Math.min(s.range, d);
      const t = { x: p.x + dx * far, z: p.z + dz * far };
      this.land.pushOut(t, PLAYER_R);
      p.leap = { fx: p.x, fz: p.z, tx: t.x, tz: t.z, t: 0, dur: s.time };
      p.burst += dHypot(t.x - p.x, t.z - p.z) + 2;
      this.emit('cast', { pid: p.pid, skill: 'leap', x: p.x, z: p.z, tx: t.x, tz: t.z, dur: s.time });
    } else if (s.id === 'whirl') {
      p.whirl = { next: 0.05, left: s.hits };
      this.emit('cast', { pid: p.pid, skill: 'whirl', x: p.x, z: p.z, dur: s.every * s.hits });
    } else if (s.id === 'rage') {
      p.rage = s.dur;
      this.emit('cast', { pid: p.pid, skill: 'rage', x: p.x, z: p.z, dur: s.dur });
    } else if (s.id === 'volley') {
      const base = dAtan2(dz, dx);
      for (let i = 0; i < s.arrows; i++) {
        const a = base + (i / (s.arrows - 1) - 0.5) * s.spread;
        this.shoot(p, dCos(a), dSin(a), kit.basic.speed, kit.basic.range, s.mult, false, 'arrow');
      }
      this.emit('cast', { pid: p.pid, skill: 'volley', x: p.x, z: p.z });
    } else if (s.id === 'roll') {
      // the way you are moving; standing still, back away from where you look
      let rx = p.mx, rz = p.mz;
      const m = dHypot(rx, rz);
      if (m > 0.1) { rx /= m; rz /= m; } else { rx = -dx; rz = -dz; }
      const t = { x: p.x + rx * s.dist, z: p.z + rz * s.dist };
      this.land.pushOut(t, PLAYER_R);
      p.roll = { fx: p.x, fz: p.z, tx: t.x, tz: t.z, t: 0, dur: s.time };
      p.guard = s.time;
      p.burst += s.dist + 1;
      this.emit('cast', { pid: p.pid, skill: 'roll', x: p.x, z: p.z, tx: t.x, tz: t.z, dur: s.time });
    } else if (s.id === 'deadeye') {
      p.draw = { t: 0, dx, dz };
      this.emit('cast', { pid: p.pid, skill: 'deadeye', x: p.x, z: p.z, dur: s.draw });
    }
  }

  /** How hard this hero hits now: Link, Bloodrage, and (Berserker) how hurt they are. */
  might(p) {
    let m = KITS[p.cls].dmg * p.mult;
    if (p.rage > 0) m *= 1 + KITS.warrior.R.more;
    if (p.cls === 'warrior') m *= 1 + 0.6 * (1 - p.hp / p.maxHp);
    return m;
  }

  cleave(p, dx, dz) {
    const s = KITS.warrior.basic;
    const cosHalf = dCos(s.arc / 2);
    for (const b of this.beastsNear(p.x, p.z, s.range + 1.2)) {
      const ex = b.x - p.x, ez = b.z - p.z, d = dHypot(ex, ez);
      if (d > s.range + BEASTS[b.type].r) continue;
      if (d > 0.5 && (ex * dx + ez * dz) / d < cosHalf) continue;
      this.hurt(b, p, this.might(p) * s.mult);
    }
  }

  area(p, x, z, r, mult) {
    for (const b of this.beastsNear(x, z, r + 1.2)) if (dHypot(b.x - x, b.z - z) <= r + BEASTS[b.type].r) this.hurt(b, p, this.might(p) * mult);
  }

  shoot(p, dx, dz, speed, range, mult, pierce, kind) {
    const id = ++this.shotId;
    const sh = { id, by: p.pid, x: p.x + dx * 0.7, z: p.z + dz * 0.7, dx, dz, speed, left: range, dmg: this.might(p) * mult, pierce, hit: pierce ? [] : null, kind };
    this.shots.push(sh);
    this.emit('shot', { id, pid: p.pid, x: sh.x, z: sh.z, dx, dz, speed, range, kind });
  }

  stepShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const step = Math.min(s.left, s.speed * dt);
      const x1 = s.x + s.dx * step, z1 = s.z + s.dz * step;
      let stop = false;
      if (!this.noBeasts) {
        // the first beast the arrow's path crosses this step (a deadeye goes on through)
        let best = null, bt = 2;
        for (const b of this.beastsNear((s.x + x1) / 2, (s.z + z1) / 2, step / 2 + 2)) {
          if (s.hit && s.hit.includes(b.id)) continue;
          const t = segHit(s.x, s.z, x1, z1, b.x, b.z, BEASTS[b.type].r + 0.25);
          if (t !== null && t < bt) { bt = t; best = b; }
        }
        if (best) {
          const p = this.players.get(s.by);
          this.hurt(best, p || { pid: s.by, cls: 'archer', hp: 1, maxHp: 1, calm: 0 }, s.dmg, s.id);
          if (s.pierce) s.hit.push(best.id);
          else stop = true;
        }
      }
      // trees and rocks stop arrows (houses do not, yet)
      if (!stop) for (const o of this.land.near((s.x + x1) / 2, (s.z + z1) / 2, step / 2 + 1.5)) if (o.shape === 'circle' && o.kind !== 'water' && segHit(s.x, s.z, x1, z1, o.x, o.z, o.r) !== null) { stop = true; break; }
      s.x = x1; s.z = z1; s.left -= step;
      if (stop || s.left <= 0) this.shots.splice(i, 1);
    }
  }

  /** Living beasts whose home chunk is near (x, z) (they never stray more than a leash from home). */
  beastsNear(x, z, r) {
    const out = [];
    const k0 = chunkOf(x - r - 32, z - r - 32), k1 = chunkOf(x + r + 32, z + r + 32);
    for (let cz = k0.cz; cz <= k1.cz; cz++)
      for (let cx = k0.cx; cx <= k1.cx; cx++)
        for (const b of this.byChunk[cz * CHUNKS + cx]) if (!b.dead && Math.abs(b.x - x) <= r + 1 && Math.abs(b.z - z) <= r + 1) out.push(b);
    return out;
  }

  hurt(b, p, dmg, shot = 0) {
    if (b.dead) return;
    const n = Math.max(1, Math.round(dmg));
    b.hp -= n;
    p.calm = 0;
    this.emit('hit', { id: b.id, pid: p.pid, dmg: n, x: b.x, z: b.z, shot, hp: Math.max(0, b.hp) / b.maxHp });
    if (p.rage > 0 && this.players.has(p.pid)) p.hp = Math.min(p.maxHp, p.hp + n * KITS.warrior.R.leech);
    if (b.hp <= 0) {
      b.dead = true;
      b.awake = false;
      b.moving = false;
      b.diedAt = this.time;
      this.emit('die', { id: b.id, pid: p.pid, x: b.x, z: b.z, kind: b.type, xp: BEASTS[b.type].xp });
      return;
    }
    // struck from afar, it comes for whoever struck it
    if (b.state !== 'chase' && this.players.has(p.pid)) {
      b.state = 'chase';
      b.target = p.pid;
      this.emit('aggro', { id: b.id, pid: p.pid, x: b.x, z: b.z });
    }
  }

  revive(b) {
    b.dead = false;
    b.hp = b.maxHp;
    b.x = b.hx; b.z = b.hz;
    b.state = 'idle';
    b.target = 0;
    this.emit('back', { id: b.id, x: b.x, z: b.z });
  }

  someoneNear(x, z, r) {
    for (const p of this.players.values()) if (dHypot(p.x - x, p.z - z) < r) return true;
    return false;
  }

  /** The nearest standing player to a beast, and how far. */
  nearest(b) {
    let best = null, bd = Infinity;
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const d = dHypot(p.x - b.x, p.z - b.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { p: best, d: bd } : null;
  }

  think(b, near, dt) {
    const def = BEASTS[b.type];
    // whoever it is after (struck by them), else the nearest
    let p = near.p, d = near.d;
    const t = b.target && this.players.get(b.target);
    if (b.state === 'chase' && t && !t.dead) { p = t; d = dHypot(t.x - b.x, t.z - b.z); }
    const fromHome = dHypot(b.x - b.hx, b.z - b.hz);
    if (b.state === 'chase' && (fromHome > def.leash || d > def.aggro * 2.2 || p.dead)) { b.state = 'return'; b.target = 0; }
    if (b.state === 'return' && fromHome < 2) { b.state = 'idle'; b.t = 1 + this.rng() * 3; b.hp = b.maxHp; }
    if (b.state === 'idle' && d < def.aggro && fromHome < def.leash * 0.8) {
      b.state = 'chase';
      b.target = p.pid;
      this.emit('aggro', { id: b.id, pid: p.pid, x: b.x, z: b.z });
    }
    let tx = b.x, tz = b.z, speed = 0;
    if (b.state === 'chase') {
      tx = p.x; tz = p.z; speed = def.speed;
      b.swipeT -= dt;
      if (d < SWIPE_REACH + def.r) {
        speed = 0;
        b.facing = dAtan2(p.z - b.z, p.x - b.x);
        if (b.swipeT <= 0) {
          b.swipeT = def.every;
          const dodged = p.guard > 0;
          if (!dodged) {
            p.hp -= def.dmg;
            p.calm = 0;
          }
          this.emit('swipe', { id: b.id, pid: p.pid, dmg: dodged ? 0 : def.dmg, x: b.x, z: b.z });
          if (p.hp <= 0 && !p.dead) {
            p.hp = 0;
            p.dead = true;
            p.downT = DOWN;
            p.leap = p.roll = p.whirl = p.draw = null;
            this.emit('down', { pid: p.pid, x: p.x, z: p.z, by: b.id });
          }
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
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }
}

/** Where along the segment (x0, z0)-(x1, z1) (0 to 1) it first comes within r of (cx, cz), or null. */
export function segHit(x0, z0, x1, z1, cx, cz, r) {
  const dx = x1 - x0, dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((cx - x0) * dx + (cz - z0) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + dx * t - cx, pz = z0 + dz * t - cz;
  return px * px + pz * pz <= r * r ? t : null;
}
