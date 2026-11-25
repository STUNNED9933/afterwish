// (0.91) The Wishkeep's daily life, as drawn: the villagers go about their work (farmers in the fields,
// the miner at the mine, the old folk on the benches, the children at play), walking paths round what is
// in the way; and the keep's heroes, between nights, stroll about their halls and practise. None of this
// is part of the game: it is only drawn, so it is free to use Math.random.

/** What each of the six villagers does with their day. */
const ROLE = { v_farmer_m: 'farm', v_farmer_f: 'farm', v_miner_m: 'mine', v_elder_m: 'elder', v_elder_f: 'elder', v_child: 'play' };
const C = (n) => 'ual_' + n.toLowerCase();
const FARM = [C('Farm_Harvest'), C('Farm_PlantSeed'), C('Farm_Watering')];
const MINE = [C('TreeChopping_Loop'), C('TreeChopping_Loop'), C('Fixing_Kneeling')];
const CHAT = [C('Idle_Talking_Loop'), C('Idle_FoldArms_Loop'), C('Idle_Talking_Loop'), C('Yes')];
const PLAY = [C('Dance_Loop'), C('Crouch_Idle_Loop')];
const SIT = [C('Sitting_Idle_Loop'), C('Sitting_Talking_Loop')];
const CARRY = C('Walk_Carry_Loop'), JOG = C('Jog_Fwd_Loop');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

/** Benches round the plaza, where the free ground allows. */
export function benchSpots(world) {
  const out = [];
  for (let i = 0; i < 10 && out.length < 4; i++) {
    const a = 0.4 + i * (Math.PI * 2 / 10), r = 9.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!world.navFree || !world.navFree(x, z) || !world.navFree(x + Math.cos(a) * 1.5, z + Math.sin(a) * 1.5)) continue;
    if (out.some((b) => Math.hypot(b.x - x, b.z - z) < 5)) continue;
    out.push({ x, z, face: a + Math.PI, used: null }); // facing in, toward the Hearth
  }
  return out;
}

/** A villager's role, from their model. */
export function villagerRole(model) {
  return ROLE[model] || 'wander';
}

/** The next thing a villager does, when the last is done. */
function nextTask(w, world, ctx) {
  const sites = (k) => (world.obstacles || []).filter((o) => o.kind === 'works' && o.work === k);
  const plaza = () => {
    const a = Math.random() * Math.PI * 2, r = rnd(4, 9);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  };
  const near = (o, r) => {
    const a = Math.random() * Math.PI * 2, d = rnd(r * 0.4, r);
    return { x: o.x + Math.cos(a) * d, z: o.z + Math.sin(a) * d };
  };
  const role = w.role;
  if (role === 'farm' || role === 'mine') {
    const at = sites(role === 'farm' ? 'fields' : 'mine');
    if (w.carry) {
      // the harvest to the plaza, then a word with whoever is there
      w.carry = false;
      return { go: plaza(), walk: CARRY, then: { idle: pick(CHAT), t: rnd(3, 7) } };
    }
    if (at.length && Math.random() < 0.8) {
      const s = pick(at);
      w.carry = Math.random() < 0.5;
      return { go: near(s, role === 'farm' ? 3 : 2), face: s, then: { idle: pick(role === 'farm' ? FARM : MINE), t: rnd(8, 16), shift: role === 'farm' ? FARM : MINE } };
    }
    return { go: plaza(), then: { idle: pick(CHAT), t: rnd(3, 6) } };
  }
  if (role === 'elder') {
    const free = ctx.benches.filter((b) => !b.used);
    if (free.length && Math.random() < 0.7) {
      const b = pick(free);
      b.used = w;
      w.bench = b;
      return { go: b, then: { idle: pick(SIT), t: rnd(18, 35), sit: b } };
    }
    return { go: plaza(), then: { idle: pick(CHAT), t: rnd(5, 10) } };
  }
  if (role === 'play') {
    const mates = ctx.walkers.filter((o) => o !== w && o.role === 'play');
    if (mates.length && Math.random() < 0.6) {
      // tag: run after a friend for a while
      return { chase: pick(mates), t: rnd(5, 9) };
    }
    if (Math.random() < 0.45) return { go: plaza(), walk: JOG, speed: 3, then: { idle: pick(PLAY), t: rnd(3, 6) } };
    return { go: plaza(), walk: JOG, speed: 3, then: { idle: 'idle', t: rnd(1, 2) } };
  }
  return { go: plaza(), then: { idle: Math.random() < 0.5 ? pick(CHAT) : 'idle', t: rnd(2, 5) } };
}

/** A path from where they stand to (x, z), round what is in the way (null if there is none). */
function pathTo(world, from, to) {
  if (!world.navPath) return [{ x: to.x, z: to.z }];
  if (world.navClear && world.navClear(from.x, from.z, to.x, to.z)) return [{ x: to.x, z: to.z }];
  const p = world.navPath(from.x, from.z, to.x, to.z);
  return p && p.length ? p : null;
}

/** One villager's moment. Returns { moving, speed, walkKind, idleKind } for its rig. */
export function stepVillager(w, world, ctx, dt) {
  const g = w.g.position;
  if (!w.task) {
    if (w.bench) {
      w.bench.used = null;
      w.bench = null;
    }
    w.task = nextTask(w, world, ctx);
    w.path = w.task.go ? pathTo(world, g, w.task.go) : null;
    if (w.task.go && !w.path) w.task = { then: { idle: 'idle', t: rnd(1, 3) } }; // nowhere to go from here: a moment's pause
  }
  const T = w.task;
  // running after a friend
  if (T.chase) {
    T.t -= dt;
    const m = T.chase.g.position;
    const dx = m.x - g.x, dz = m.z - g.z, d = Math.hypot(dx, dz);
    if (T.t <= 0 || d < 0.9) {
      if (d < 0.9 && T.chase.task) T.chase.task = { chase: w, t: rnd(5, 9) }; // tagged: now you are it
      w.task = { then: { idle: 'idle', t: 0.6 } };
      return { moving: false };
    }
    if (!world.navClear || world.navClear(g.x, g.z, m.x, m.z)) moveToward(w, m.x, m.z, 3.1, dt);
    else {
      w.task = null;
      return { moving: false };
    }
    return { moving: true, speed: 3.1, walkKind: JOG };
  }
  // walking a path
  if (w.path && w.path.length) {
    const tgt = w.path[0];
    const sp = T.speed || w.speed * 1.35;
    if (moveToward(w, tgt.x, tgt.z, sp, dt)) w.path.shift();
    return { moving: true, speed: sp, walkKind: T.walk || null };
  }
  // there: the work, the seat, the chat
  const th = T.then || { idle: 'idle', t: 1 };
  if (th.t === undefined) th.t = 1;
  if (!th.started) {
    th.started = true;
    if (th.sit) {
      g.x = th.sit.x;
      g.z = th.sit.z;
      w.g.rotation.y = Math.PI / 2 - th.sit.face;
    } else if (T.face) w.g.rotation.y = Math.atan2(T.face.x - g.x, T.face.z - g.z);
    th.shiftT = rnd(3, 6);
  }
  th.t -= dt;
  if (th.shift && (th.shiftT -= dt) <= 0) {
    th.idle = pick(th.shift); // a farmer moves on from sowing to watering, a miner from striking to fixing
    th.shiftT = rnd(3, 6);
  }
  if (th.t <= 0) w.task = null;
  return { moving: false, idleKind: th.idle };
}

/** Step toward (x, z) at `speed`, turning to face it. True once there. */
function moveToward(w, x, z, speed, dt) {
  const g = w.g.position;
  const dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return true;
  const step = Math.min(d, speed * dt);
  g.x += (dx / d) * step;
  g.z += (dz / d) * step;
  const want = Math.atan2(dx, dz);
  let da = want - w.g.rotation.y;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  w.g.rotation.y += da * Math.min(1, 10 * dt);
  return d <= step + 0.05;
}

/**
 * (0.91) The keep's heroes between nights: a stroll about their hall, a pause, now and then a few practice
 * swings. `life` keeps each hero's own; returns where to draw them and what they are doing.
 */
export function heroDay(life, t, world, dt) {
  let L = life.get(t.id);
  if (!L) life.set(t.id, (L = { x: t.x, z: t.z, facing: t.facing, wait: rnd(1, 5), tx: t.x, tz: t.z, practice: 0 }));
  const post = t.post || { x: t.x, z: t.z };
  let moving = false, swing = false;
  if (L.wait > 0) {
    L.wait -= dt;
    if (L.practice > 0 && (L.practiceT = (L.practiceT || 0) - dt) <= 0) {
      L.practiceT = rnd(0.7, 1.3);
      L.practice--;
      swing = true;
    }
  } else {
    const dx = L.tx - L.x, dz = L.tz - L.z, d = Math.hypot(dx, dz);
    if (d < 0.12) {
      // there: stand a while, and sometimes practise
      L.wait = rnd(3, 9);
      L.practice = Math.random() < 0.45 ? 2 + Math.floor(Math.random() * 3) : 0;
      L.practiceT = 0.4;
      // the next spot, near their post, on free ground with a clear way to it
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, r = rnd(0.8, 3.4);
        const x = post.x + Math.cos(a) * r, z = post.z + Math.sin(a) * r;
        if ((!world.navFree || world.navFree(x, z)) && (!world.navClear || world.navClear(L.x, L.z, x, z))) {
          [L.tx, L.tz] = [x, z];
          break;
        }
      }
    } else {
      const step = Math.min(d, 1.5 * dt);
      L.x += (dx / d) * step;
      L.z += (dz / d) * step;
      let da = Math.atan2(dz, dx) - L.facing;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      L.facing += da * Math.min(1, 8 * dt);
      moving = true;
    }
  }
  return { x: L.x, z: L.z, facing: L.facing, moving, swing };
}
