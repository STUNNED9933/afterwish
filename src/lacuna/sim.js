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
import { Land, LAND, CHUNKS, BEASTS, chunkOf, TOWN , trainingPosts } from './land.js';

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
// (0.99.21) Each keeps the feel of its class before Lacuna (Afterwish's Warrior and Archer, their Berserker and
// Sharpshooter paths), rebuilt round mana. The Berserker has little and pays the rest in blood; his blows win it
// back. The Sharpshooter has plenty, breathes it back standing still, and pours it into one shot.
export const KITS = {
  // (0.99.23) before he has a weapon: a small boy's fists, and nothing else
  novice: {
    name: 'Unarmed', hp: 150, dmg: 8, mp: 30, regen: 3,
    passive: 'No weapon yet, and no skills: only your fists. (Rowan will hand you a blade.)',
    basic: { name: 'Punch', every: 0.55, range: 1.7, arc: 1.6, mult: 1.0 },
  },
  warrior: {
    name: 'Berserker', hp: 340, dmg: 20, mp: 60, regen: 2.5,
    passive: 'Blood Price: short of mana, a skill takes the rest from your health (never below a tenth). Battle Rhythm: every beast your Cleave hits gives back 3 mana. Bloodied (under half health): +25% damage, 20% faster blows, and your hits heal you.',
    blood: { perMana: 0.006, floor: 0.1 }, // one mana short costs 0.6% of your health
    rhythm: { mana: 3, most: 9 },
    bloodied: { below: 0.5, dmg: 0.25, haste: 0.2, leech: 0.08 },
    basic: { name: 'Cleave', every: 0.72, range: 2.9, arc: 1.9, mult: 1.4 },
    Q: { id: 'skyfall', name: 'Skyfall', mana: 25, cd: 8, range: 12, radius: 3.6, mult: 2.2, time: 0.55, stun: 1, text: 'Leap where you look and crash down, stunning what is under you for a second.' },
    E: { id: 'whirl', name: 'Whirlwind', mana: 10, beat: 6, cd: 6, radius: 3.2, every: 0.3, most: 4, mult: 0.6, manaText: '10, then 6 a beat', text: 'Hold to spin, cutting everything round you every beat; you can keep running. Each beat costs mana (or blood). Let go to stop.' },
    R: { id: 'oath', name: 'Crimson Oath', mana: 0, cd: 3, to: 0.4, cap: 0.49, leech: 0.25, roar: 3.6, mult: 1.5, manaText: 'a toggle: costs blood', text: 'A toggle. Cut yourself down to 40% health with a roar that hurts everything near: the blood you lose becomes mana. While it lasts you are always Bloodied, your hits heal a quarter of what they deal, and nothing lifts you above 49%. Press again to end it.' },
  },
  archer: {
    name: 'Sharpshooter', hp: 260, dmg: 20, mp: 120, regen: 6,
    passive: 'Long Watch: +4% damage for every metre past the first two (up to +40%). Steady Aim: every third Shot is a crit (double damage) and gives back 5 mana. Steady breath: standing still, mana comes back two and a half times as fast. Hold right-click to look down the scope.',
    longWatch: { per: 0.04, from: 2, most: 0.4 },
    steadyAim: { every: 3, mult: 2, mana: 5 },
    still: { after: 0.8, regen: 2.5 },
    basic: { name: 'Shot', every: 0.55, speed: 70, range: 45, mult: 1.0 },
    Q: { id: 'ricochet', name: 'Ricochet', mana: 18, cd: 5, speed: 55, range: 40, mult: 1.0, bounces: 3, reach: 10, text: 'An arrow that glances from the beast it hits to the next within 10 m, and the next: up to four beasts.' },
    E: { id: 'roll', name: 'Evasive Roll', mana: 12, cd: 6, dist: 6.5, time: 0.36, haste: 0.5, hasteFor: 3, text: 'Roll away (the way you move, or back): nothing can hit you mid-roll. Then shoot 50% faster for 3 s.' },
    R: { id: 'deadeye', name: 'Deadeye', mana: 30, cd: 16, draw: 0.5, pour: 40, pourFor: 1.5, mult: 5, perMana: 0.1, speed: 140, range: 80, falloff: [1, 0.7, 0.5], mark: 0.2, markFor: 5, pin: 1.5, manaText: '30, and more while you hold', text: 'Hold to draw: the longer you hold (up to 2 s), the more mana you pour into the arrow, each point +10% damage. Let go to loose it through up to three beasts: the second is Marked (takes 20% more for 5 s), the third Pinned (stunned 1.5 s).' },
  },
};
export const LACUNA_CLASSES = Object.keys(KITS);
const CALM = 6; // seconds without a fight before health comes back
const RESPAWN = 45; // a beast comes back this long after it falls (if nobody is standing on its home)
const DOWN = 6; // seconds a hero is down
export const JUMP = { up: 6.4, gravity: 21 }; // about a metre high, two thirds of a second in the air

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
    // (0.99.21) the training ground's posts: beasts that stand still, never strike back and never fall
    for (const t of trainingPosts()) {
      const { cx, cz } = chunkOf(t.x, t.z);
      const b = { id: this.beasts.length + 1, type: 'dummy', x: t.x, z: t.z, hx: t.x, hz: t.z, facing: Math.PI, state: 'idle', t: 0, tx: t.x, tz: t.z, swipeT: 0, awake: false, hp: BEASTS.dummy.hp, maxHp: BEASTS.dummy.hp, dead: false, diedAt: 0, target: 0, chunk: cz * CHUNKS + cx, ring: t.ring, hitAt: -99 };
      this.beasts.push(b);
      this.byChunk[b.chunk].push(b);
    }
  }

  /**
   * (0.99.26) A story beast: one of the land's own (of `type`) taken from wherever it is and set down at (x, z), whole,
   * with `extra` laid on it (story: a name for the quest to count it by; def: its own numbers; ward; hidden).
   */
  borrowBeast(type, x, z, extra = {}) {
    const b = this.beasts.filter((q) => q.type === type && !q.story).sort((p, q) => dHypot(q.x - x, q.z - z) - dHypot(p.x - x, p.z - z))[0];
    if (!b) return null;
    const list = this.byChunk[b.chunk];
    list.splice(list.indexOf(b), 1);
    Object.assign(b, { dead: false, x, z, hx: x, hz: z, state: 'idle', target: 0, awake: false, swipeT: 1, stunUntil: 0, markUntil: 0 }, extra);
    b.maxHp = b.hp = (extra.def && extra.def.hp) || BEASTS[type].hp;
    b.chunk = chunkOf(x, z).i;
    this.byChunk[b.chunk].push(b);
    return b;
  }

  /** A player arrives (by default at Sunmere's south gate). */
  addPlayer(pid, at = GATE, { cls = 'warrior', link = null, linked = false, vigour = 1 } = {}) {
    const p = { pid, x: at.x, z: at.z, facing: -Math.PI / 2, mx: 0, mz: 0, pace: 'run', moving: false, speed: 0, cls: KITS[cls] ? cls : 'warrior', link: link || {}, linked: !!linked, vigour: Math.max(0.5, Math.min(1, vigour)), acts: [], y: 0, vy: 0, cd: { Q: 0, E: 0, R: 0 }, basicT: 0, dead: false, downT: 0, oath: false, guard: 0, calm: 99, burst: 0, leap: null, roll: null, whirl: null, draw: null, shotN: 0, still: 0, hasteT: 0 };
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
    // (0.99.22) the Link sleeps until the story wakes it: until then Eternal gear lends nothing here
    const kit = KITS[p.cls], power = p.linked ? linkPower(p.link) : 0;
    const hpK = full || !p.maxHp ? 1 : p.hp / p.maxHp, mpK = full || !p.maxMp ? 1 : p.mp / p.maxMp;
    p.mult = linkMult(power);
    p.maxHp = Math.round(kit.hp * p.mult * (p.vigour ?? 1)); // (0.99.24) weak when he arrives; stronger day by day
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
    p.oath = false;
    p.hasteT = 0;
    p.shotN = 0;
    this.refit(p);
  }

  /** (0.99.24) How strong the hero has grown (0.5 just through the tear, 1 once he has his strength back). */
  setVigour(pid, v) {
    const p = this.players.get(pid);
    if (!p) return;
    p.vigour = Math.max(0.5, Math.min(1, +v || 1));
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

  /**
   * A blow or a skill (k: 'basic', 'Q', 'E', 'R'), aimed at the point (ax, az) on the ground. `up`: the key was
   * let go (a held skill, Whirlwind or Deadeye, ends or looses).
   */
  act(pid, k, ax, az, up = false) {
    const p = this.players.get(pid);
    if (!p || p.acts.length >= 6 || !(k === 'basic' || k === 'Q' || k === 'E' || k === 'R')) return;
    p.acts.push({ k, ax, az, up: !!up });
  }

  /** (0.99.25) Where a drawn Deadeye points now: it follows the aim (the scope, the crosshair) until it is loosed. */
  aim(pid, ax, az) {
    const p = this.players.get(pid);
    if (!p || !p.draw || !Number.isFinite(ax) || !Number.isFinite(az)) return;
    const dx = ax - p.x, dz = az - p.z, d = dHypot(dx, dz);
    if (!(d > 0.01)) return;
    p.draw.dx = dx / d;
    p.draw.dz = dz / d;
    p.facing = dAtan2(dz, dx);
  }

  /** Could this hero pay `cost` mana now (a Berserker may pay what he lacks in blood)? */
  canPay(p, cost) {
    if (p.mp >= cost) return true;
    if (p.cls !== 'warrior') return false;
    const B = KITS.warrior.blood;
    return p.hp - (cost - p.mp) * B.perMana * p.maxHp >= p.maxHp * B.floor;
  }

  /** Pay `cost` mana (or, for a Berserker, what he lacks in blood). False if it cannot be paid. */
  pay(p, cost) {
    if (!this.canPay(p, cost)) return false;
    if (p.mp >= cost) { p.mp -= cost; return true; }
    const blood = Math.round((cost - p.mp) * KITS.warrior.blood.perMana * p.maxHp);
    p.mp = 0;
    p.hp -= blood;
    this.emit('blood', { pid: p.pid, n: blood, x: p.x, z: p.z });
    return true;
  }

  /** Bloodied (a Berserker under half health, or under his Oath). */
  bloodied(p) {
    return p.cls === 'warrior' && (p.oath || p.hp < p.maxHp * KITS.warrior.bloodied.below);
  }

  /** The most health a hero may have now (a Berserker under his Oath: 49%). */
  hpCap(p) {
    return p.oath ? Math.floor(p.maxHp * KITS.warrior.R.cap) : p.maxHp;
  }

  /** A hop (Space): only from the ground, not while leaping, rolling or down. Nothing can be dodged by it. */
  jump(pid) {
    const p = this.players.get(pid);
    if (!p || p.dead || p.y > 0 || p.vy > 0 || p.leap || p.roll) return false;
    p.vy = JUMP.up;
    this.emit('cast', { pid: p.pid, skill: 'jump', x: p.x, z: p.z });
    return true;
  }

  /** Could this blow or skill go now (for the browser, to show it ready, and not to send what would be refused)? */
  ready(p, k) {
    if (!p || p.dead || p.leap || p.roll || p.draw) return false;
    if (k === 'basic') return p.basicT <= 0 && !p.whirl;
    const s = KITS[p.cls][k];
    return !!s && p.cd[k] <= 0 && this.canPay(p, s.mana) && !p.whirl;
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
    p.hasteT -= dt;
    if (p.dead) {
      p.downT -= dt;
      p.acts.length = 0;
      if (p.downT <= 0) {
        p.dead = false;
        p.y = p.vy = 0;
        p.hp = p.maxHp;
        p.mp = p.maxMp;
        p.x = GATE.x; p.z = GATE.z;
        p.leap = p.roll = p.whirl = p.draw = null;
        p.oath = false;
        this.land.pushOut(p, PLAYER_R);
        this.emit('up', { pid: p.pid, x: p.x, z: p.z });
      }
      return;
    }
    // mana back: the Berserker little (his blows win it), the Sharpshooter more, and more again standing still
    const kit = KITS[p.cls];
    p.still = p.moving || p.leap || p.roll || p.whirl ? 0 : p.still + dt;
    const breath = kit.still && p.still >= kit.still.after ? kit.still.regen : 1;
    p.mp = Math.min(p.maxMp, p.mp + kit.regen * breath * dt);
    if (p.y > 0 || p.vy > 0) {
      p.vy -= JUMP.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
    if (p.calm > CALM && p.hp < this.hpCap(p)) p.hp = Math.min(this.hpCap(p), p.hp + p.maxHp * 0.05 * dt);
    // Walking (moves made by the browser itself, on the server, are taken as they come: see room.js)
    if (!p.driven && !p.leap && !p.roll) {
      const len = dHypot(p.mx, p.mz);
      // (0.99.21) a Whirlwind keeps running, a drawn bow creeps; (0.99.24) and a weak boy is slower
      const slow = (p.draw ? 0.45 : p.whirl ? 0.8 : 1) * (0.7 + 0.3 * (p.vigour ?? 1));
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
        this.area(p, L.tx, L.tz, s.radius, s.mult, s.stun);
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
      // (0.99.21) held: a beat every 0.3 s, each after the first paid for (mana or blood), until let go (two beats
      // at least), three seconds, or nothing left to pay with
      const W = p.whirl, s = KITS.warrior.E;
      W.t += dt;
      W.next -= dt;
      if (W.next <= 0) {
        const done = (!W.held && W.beats >= 2) || W.t > s.most;
        if (done || (W.beats > 0 && !this.pay(p, s.beat))) this.endWhirl(p);
        else {
          W.next += s.every;
          W.beats++;
          this.area(p, p.x, p.z, s.radius, s.mult); // (Whirlwind spends; only Cleave wins mana back)
        }
      }
    }
    if (p.draw) {
      // (0.99.21) drawn for half a second, then every moment held pours more mana in (up to 1.5 s more)
      const D = p.draw, s = KITS.archer.R;
      D.t += dt;
      if (D.t > s.draw && D.held && D.t <= s.draw + s.pourFor) {
        const more = Math.min(p.mp, s.pour * dt);
        p.mp -= more;
        D.poured += more;
      }
      if ((D.t >= s.draw && !D.held) || D.t >= s.draw + s.pourFor) {
        this.shoot(p, D.dx, D.dz, s.speed, s.range, s.mult + s.perMana * D.poured, true, 'deadeye');
        this.emit('cast', { pid: p.pid, skill: 'loose', x: p.x, z: p.z, poured: Math.round(D.poured) });
        p.draw = null;
      }
    }
  }

  endWhirl(p) {
    p.whirl = null;
    p.cd.E = KITS.warrior.E.cd;
    this.emit('cast', { pid: p.pid, skill: 'whirlEnd', x: p.x, z: p.z });
  }

  /** Battle Rhythm: mana back for the beasts a Cleave hit. */
  rhythm(p, hits) {
    if (p.cls !== 'warrior' || !hits) return;
    const R = KITS.warrior.rhythm;
    p.mp = Math.min(p.maxMp, p.mp + Math.min(R.most, hits * R.mana));
  }

  doAct(p, { k, ax, az, up }) {
    if (up) {
      // a held skill let go: the spin winds down, the arrow flies (once drawn)
      if (k === 'E' && p.whirl) p.whirl.held = false;
      if (k === 'R' && p.draw) { p.draw.held = false; if (ax || az) this.aim(p.pid, ax, az); } // loosed where it points now
      return;
    }
    if (k === 'R' && p.cls === 'warrior' && p.oath && p.cd.R <= 0 && !p.dead) {
      // the Oath ended (a toggle)
      p.oath = false;
      p.cd.R = KITS.warrior.R.cd;
      this.emit('cast', { pid: p.pid, skill: 'oathEnd', x: p.x, z: p.z });
      return;
    }
    if (!this.ready(p, k)) return;
    let dx = ax - p.x, dz = az - p.z;
    const d = dHypot(dx, dz);
    if (!(d > 0.01)) { dx = dCos(p.facing); dz = dSin(p.facing); } else { dx /= d; dz /= d; }
    const kit = KITS[p.cls];
    p.calm = 0;
    if (k === 'basic') {
      // faster when Bloodied (Berserker) or just after a roll (Sharpshooter)
      const haste = 1 + (this.bloodied(p) ? KITS.warrior.bloodied.haste : 0) + (p.hasteT > 0 ? KITS.archer.E.haste : 0);
      const every = kit.basic.every / haste;
      p.basicT = every;
      p.facing = dAtan2(dz, dx);
      this.emit('cast', { pid: p.pid, skill: 'basic', x: p.x, z: p.z, every });
      if (p.cls === 'warrior') this.rhythm(p, this.cleave(p, dx, dz));
      else if (p.cls === 'novice') this.cleave(p, dx, dz);
      else {
        // Steady Aim: every third Shot a crit, and a little mana back
        const A = kit.steadyAim;
        p.shotN++;
        const crit = p.shotN % A.every === 0;
        if (crit) p.mp = Math.min(p.maxMp, p.mp + A.mana);
        this.shoot(p, dx, dz, kit.basic.speed, kit.basic.range, kit.basic.mult * (crit ? A.mult : 1), false, 'arrow', { crit });
      }
      return;
    }
    const s = kit[k];
    if (!this.pay(p, s.mana)) return;
    if (s.id !== 'whirl') p.cd[k] = s.cd; // (a Whirlwind's cooldown starts when it ends)
    if (s.id !== 'roll') p.facing = dAtan2(dz, dx);
    if (s.id === 'skyfall') {
      const far = Math.min(s.range, d);
      const t = { x: p.x + dx * far, z: p.z + dz * far };
      this.land.pushOut(t, PLAYER_R);
      p.leap = { fx: p.x, fz: p.z, tx: t.x, tz: t.z, t: 0, dur: s.time };
      p.burst += dHypot(t.x - p.x, t.z - p.z) + 2;
      this.emit('cast', { pid: p.pid, skill: 'leap', x: p.x, z: p.z, tx: t.x, tz: t.z, dur: s.time });
    } else if (s.id === 'whirl') {
      p.whirl = { next: 0.05, beats: 0, t: 0, held: true };
      this.emit('cast', { pid: p.pid, skill: 'whirl', x: p.x, z: p.z, dur: s.most });
    } else if (s.id === 'oath') {
      // cut down to 40%: the blood becomes mana; a roar round him
      const to = Math.floor(p.maxHp * s.to);
      const lost = Math.max(0, p.hp - to);
      p.hp = Math.min(p.hp, to);
      p.mp = Math.min(p.maxMp, p.mp + lost / (KITS.warrior.blood.perMana * p.maxHp));
      p.oath = true;
      if (lost > 0) this.emit('blood', { pid: p.pid, n: lost, x: p.x, z: p.z });
      this.emit('cast', { pid: p.pid, skill: 'oath', x: p.x, z: p.z });
      this.area(p, p.x, p.z, s.roar, s.mult);
    } else if (s.id === 'ricochet') {
      this.shoot(p, dx, dz, s.speed, s.range, s.mult, false, 'arrow', { bounce: s.bounces });
      this.emit('cast', { pid: p.pid, skill: 'ricochet', x: p.x, z: p.z });
    } else if (s.id === 'roll') {
      // the way you are moving; standing still, back away from where you look
      let rx = p.mx, rz = p.mz;
      const m = dHypot(rx, rz);
      if (m > 0.1) { rx /= m; rz /= m; } else { rx = -dx; rz = -dz; }
      const t = { x: p.x + rx * s.dist, z: p.z + rz * s.dist };
      this.land.pushOut(t, PLAYER_R);
      p.roll = { fx: p.x, fz: p.z, tx: t.x, tz: t.z, t: 0, dur: s.time };
      p.guard = s.time;
      p.hasteT = s.time + s.hasteFor;
      p.burst += s.dist + 1;
      this.emit('cast', { pid: p.pid, skill: 'roll', x: p.x, z: p.z, tx: t.x, tz: t.z, dur: s.time });
    } else if (s.id === 'deadeye') {
      p.draw = { t: 0, dx, dz, poured: 0, held: true };
      this.emit('cast', { pid: p.pid, skill: 'deadeye', x: p.x, z: p.z, dur: s.draw + s.pourFor });
    }
  }

  /** How hard this hero hits now: the Link, and (Berserker) Bloodied. */
  might(p) {
    let m = KITS[p.cls].dmg * p.mult * (p.surge || 1); // (0.99.26) the Link's first waking, in the story
    if (this.bloodied(p)) m *= 1 + KITS.warrior.bloodied.dmg;
    return m;
  }

  cleave(p, dx, dz) {
    const s = KITS[p.cls].basic; // a sword's cut, or (unarmed) a punch
    const cosHalf = dCos(s.arc / 2);
    let n = 0;
    for (const b of this.beastsNear(p.x, p.z, s.range + 1.2)) {
      const ex = b.x - p.x, ez = b.z - p.z, d = dHypot(ex, ez);
      if (d > s.range + BEASTS[b.type].r) continue;
      if (d > 0.5 && (ex * dx + ez * dz) / d < cosHalf) continue;
      this.hurt(b, p, this.might(p) * s.mult);
      n++;
    }
    return n;
  }

  /** Everything within r of (x, z) is hurt (and stunned for `stun` seconds); how many. */
  area(p, x, z, r, mult, stun = 0) {
    let n = 0;
    for (const b of this.beastsNear(x, z, r + 1.2)) {
      if (dHypot(b.x - x, b.z - z) > r + BEASTS[b.type].r) continue;
      this.hurt(b, p, this.might(p) * mult);
      if (stun && !b.dead) b.stunUntil = Math.max(b.stunUntil || 0, this.time + stun);
      n++;
    }
    return n;
  }

  /** An arrow. extra: { crit, bounce (glances on that many times) }. Its damage grows with the distance flown (Long Watch). */
  shoot(p, dx, dz, speed, range, mult, pierce, kind, extra = {}, from = null) {
    const id = ++this.shotId;
    const ox = from ? from.x : p.x + dx * 0.7, oz = from ? from.z : p.z + dz * 0.7;
    const sh = { id, by: p.pid, x: ox, z: oz, ox: p.x, oz: p.z, dx, dz, speed, left: range, dmg: (extra.dmg ?? this.might(p) * mult), pierce, hit: pierce || extra.bounce ? [...(extra.hit || [])] : null, kind, crit: !!extra.crit, bounce: extra.bounce || 0, n: 0 };
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
          const p = this.players.get(s.by) || { pid: s.by, cls: 'archer', hp: 1, maxHp: 1, calm: 0, mult: 1 };
          // Long Watch: further flown, harder it lands
          const L = KITS.archer.longWatch;
          const far = dHypot(best.x - s.ox, best.z - s.oz);
          let dmg = s.dmg * (1 + Math.min(L.most, L.per * Math.max(0, far - L.from)));
          if (s.kind === 'deadeye') dmg *= KITS.archer.R.falloff[s.n] || 0; // through up to three: full, 70%, 50%
          this.hurt(best, p, dmg, s.id, s.crit);
          if (s.kind === 'deadeye' && !best.dead) {
            // the second is Marked (20% more from everything after), the third Pinned
            const R = KITS.archer.R;
            if (s.n === 1) best.markUntil = this.time + R.markFor;
            if (s.n === 2) best.stunUntil = Math.max(best.stunUntil || 0, this.time + R.pin);
          }
          s.n++;
          if (s.pierce) { s.hit.push(best.id); if (s.kind === 'deadeye' && s.n >= KITS.archer.R.falloff.length) stop = true; }
          else stop = true;
          if (s.bounce > 0) {
            // Ricochet: on to the nearest beast within reach it has not hit yet
            s.hit.push(best.id);
            const reach = KITS.archer.Q.reach;
            let next = null, nd = reach;
            for (const b of this.beastsNear(best.x, best.z, reach)) {
              if (b === best || s.hit.includes(b.id)) continue;
              const d = dHypot(b.x - best.x, b.z - best.z);
              if (d < nd) { nd = d; next = b; }
            }
            if (next && this.players.has(s.by)) {
              const ex = (next.x - best.x) / nd, ez = (next.z - best.z) / nd;
              this.shoot(p, ex, ez, s.speed, reach + 2, 0, false, 'arrow', { dmg: s.dmg, bounce: s.bounce - 1, hit: s.hit }, { x: best.x + ex * (BEASTS[best.type].r + 0.3), z: best.z + ez * (BEASTS[best.type].r + 0.3) });
            }
          }
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

  hurt(b, p, dmg, shot = 0, crit = false) {
    if (b.dead) return;
    if (b.markUntil > this.time) dmg *= 1 + KITS.archer.R.mark; // Marked by a Deadeye
    if (b.ward) dmg *= b.ward; // (0.99.26) a foe far beyond you: your blows barely mark him
    const n = Math.max(1, Math.round(dmg));
    b.hp -= n;
    p.calm = 0;
    if (BEASTS[b.type].post) b.hp = Math.max(1, b.hp); // a training post takes any blow, and stands
    b.hitAt = this.time;
    this.emit('hit', { id: b.id, pid: p.pid, dmg: n, x: b.x, z: b.z, shot, hp: Math.max(0, b.hp) / b.maxHp, crit: crit ? 1 : 0 });
    // a Bloodied Berserker heals by hitting (a quarter under his Oath, never above 49% then)
    if (this.players.has(p.pid) && this.bloodied(p) && !p.dead) {
      const leech = p.oath ? KITS.warrior.R.leech : KITS.warrior.bloodied.leech;
      const cap = this.hpCap(p);
      if (p.hp < cap) p.hp = Math.min(cap, p.hp + n * leech);
    }
    if (b.hp <= 0) {
      b.dead = true;
      b.awake = false;
      b.moving = false;
      b.diedAt = this.time;
      this.emit('die', { id: b.id, pid: p.pid, x: b.x, z: b.z, kind: b.type, xp: BEASTS[b.type].xp, story: b.story || '' });
      return;
    }
    // struck from afar, it comes for whoever struck it
    if (b.state !== 'chase' && this.players.has(p.pid) && !BEASTS[b.type].post) {
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
    const def = b.def || BEASTS[b.type]; // (0.99.26) a story beast may carry its own numbers
    if (b.stunUntil > this.time) { b.moving = false; return; } // (0.99.21) stunned (Skyfall) or Pinned (Deadeye)
    if (def.post) {
      // a training post: still; whole again a few seconds after the last blow
      b.moving = false;
      if (this.time - b.hitAt > 3) b.hp = b.maxHp;
      return;
    }
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
