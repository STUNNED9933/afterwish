// Tests for Lacuna's engine, phase 1 (src/lacuna): the land, sleeping beasts, the crowd's streets, sync size.
// Run with: node test/lacuna.test.mjs (part of npm test).
import fs from 'node:fs';
import { Land, LAND, CHUNKS, TOWN, chunkOf, groundAt } from '../src/lacuna/land.js';
import { LandWorld, TICK, WAKE } from '../src/lacuna/sim.js';
import { Interest, apply, SEE, SEND_HZ, PLAYER_ID } from '../src/lacuna/net.js';
import { streets } from '../src/lacuna/crowd.js';
import { makeRng } from '../src/sim/rng.js';

let pass = 0, failed = 0;
function check(name, ok, info = '') {
  if (ok) pass++;
  else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  ' + info : ''));
}
const strip = (c) => JSON.stringify(c, (k, v) => (k === '_s' ? undefined : v));

// ---- the land
{
  const a = new Land(), b = new Land();
  b.chunk(5, 2); b.chunk(0, 7); // made in another order
  const same = [[5, 2], [0, 7], [3, 3]].every(([x, z]) => strip(a.chunk(x, z)) === strip(b.chunk(x, z)));
  check('Lacuna land: a chunk comes out the same whatever order chunks are made in', same);
  check('...another seed, another land', strip(new Land(99).chunk(1, 1).trees) !== strip(a.chunk(1, 1).trees));
  a.all();
  const solid = a.chunks.flatMap((c) => c.solid);
  check('...trees, rocks and Sunmere\'s houses on it', a.chunks.reduce((n, c) => n + c.trees.length, 0) > 2000 && a.chunks.reduce((n, c) => n + c.houses.length, 0) >= 12, `${solid.length} solid things`);
  check('...nothing solid on the roads or in the plaza', solid.every((o) => o.kind === 'house' ? true : !['road', 'street', 'plaza'].includes(groundAt(o.x, o.z))));
  const rng = makeRng(5);
  let ok = true;
  for (let i = 0; i < 400 && ok; i++) {
    const x = (rng() - 0.5) * 500, z = (rng() - 0.5) * 500, r = 1 + rng() * 6;
    const fast = new Set(a.near(x, z, r).filter((o) => o.shape !== 'box' && Math.hypot(o.x - x, o.z - z) < o.r + r));
    const slow = solid.filter((o) => o.shape !== 'box' && Math.hypot(o.x - x, o.z - z) < o.r + r);
    ok = slow.every((o) => fast.has(o));
  }
  check('...the spatial hash finds everything a look at the whole land would (400 random spots)', ok);
}

// ---- walking it: never inside anything, never off the edge
{
  const w = new LandWorld();
  const p = w.addPlayer(1);
  const rng = makeRng(11);
  let inside = 0, off = 0;
  for (let s = 0; s < 30 * 120; s++) {
    if (s % 45 === 0) { const a = rng() * 6.283; w.input(1, { mx: Math.cos(a), mz: Math.sin(a), pace: 'sprint' }); }
    w.step(TICK);
    if (Math.abs(p.x) > 256 || Math.abs(p.z) > 256) off++;
    const near = w.land.near(p.x, p.z, 2);
    if (near.some((o) => o.shape !== 'box' && Math.hypot(o.x - p.x, o.z - p.z) < o.r + 0.4 - 0.05)) inside++;
  }
  check('Lacuna walking: two minutes of sprinting about, never inside a tree, rock or the lake, never off the land', inside === 0 && off === 0, `${inside} inside, ${off} off`);
}

// ---- beasts sleep away from players
{
  const w = new LandWorld();
  const me = w.addPlayer(1);
  const far = w.beasts.filter((b) => Math.hypot(b.x - me.x, b.z - me.z) > 200);
  const before = far.map((b) => [b.x, b.z]);
  for (let s = 0; s < 30 * 20; s++) w.step(TICK);
  check('Lacuna beasts: far from every player they sleep where they are (none of the far ones moved in 20 s)', far.length > 300 && far.every((b, i) => b.x === before[i][0] && b.z === before[i][1] && !b.awake), `${far.length} far`);
  check('...and a step only looks at the beasts in the chunks round a player', w.stats.looked < w.beasts.length / 4, `${w.stats.looked} of ${w.beasts.length}`);
  // take the player to some wolves: they wake, notice, chase, and give up past their leash
  const wolf = w.beasts.find((b) => b.type === 'wolf' && Math.hypot(b.x, b.z) > 150);
  me.x = wolf.x + 6; me.z = wolf.z;
  w.events = [];
  for (let s = 0; s < 30 * 3; s++) w.step(TICK);
  check('...walk up to one and it wakes and comes for you', wolf.awake && (wolf.state === 'chase' || w.events.some((e) => e.type === 'aggro' && e.id === wolf.id)));
  for (let s = 0; s < 30 * 4; s++) w.step(TICK);
  check('...and swipes when it reaches you', w.events.some((e) => e.type === 'swipe'));
  w.input(1, { mx: -Math.sign(wolf.x) || 1, mz: 0, pace: 'sprint' });
  for (let s = 0; s < 30 * 12; s++) w.step(TICK);
  check('...run and it gives up (goes home, or falls asleep once you are past ' + WAKE + ' m)', wolf.state !== 'chase' || !wolf.awake, `${wolf.state} awake=${wolf.awake}`);
}

// ---- cost: nine players spread over the land
{
  const w = new LandWorld();
  for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.283; w.addPlayer(k + 1, { x: Math.cos(a) * 170, z: Math.sin(a) * 170 }); }
  const rng = makeRng(3);
  const t0 = performance.now();
  for (let s = 0; s < 30 * 30; s++) {
    if (s % 60 === 0) for (let k = 1; k <= 9; k++) { const a = rng() * 6.283; w.input(k, { mx: Math.cos(a), mz: Math.sin(a) }); }
    w.step(TICK);
  }
  const ms = (performance.now() - t0) / (30 * 30);
  check('Lacuna cost: nine players about the land, a step under 1.5 ms (it is a thirtieth of a second each)', ms < 1.5, `${ms.toFixed(3)} ms a step, ${w.stats.awake} awake`);
}

// ---- sync: what each player is told, and how much
{
  const w = new LandWorld();
  const rng = makeRng(8);
  const pids = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const k of pids) { const a = (k / 9) * 6.283, r = k === 1 ? 30 : 60 + (k % 3) * 60; w.addPlayer(k, { x: Math.cos(a) * r, z: Math.sin(a) * r }); }
  const wires = pids.map((k) => new Interest(k)), seen = pids.map(() => new Map());
  const every = Math.round(1 / TICK / SEND_HZ);
  const secs = 60;
  for (let s = 0; s < 30 * secs; s++) {
    if (s % 75 === 0) for (const k of pids) { const a = rng() * 6.283; w.input(k, { mx: Math.cos(a), mz: Math.sin(a), pace: rng() < 0.3 ? 'sprint' : 'run' }); }
    w.step(TICK);
    if (s % every === 0) wires.forEach((wire, i) => { const m = wire.delta(w); if (m) apply(m, seen[i]); });
  }
  const rates = wires.map((x) => (x.bytes + 6 * SEND_HZ * secs) / secs / 1024);
  const worst = Math.max(...rates);
  check(`Lacuna sync: nine players wandering for a minute, each told under 20 KB/s (the phase 1 goal)`, worst < 20, `worst ${worst.toFixed(2)} KB/s, average ${(rates.reduce((a, b) => a + b) / rates.length).toFixed(2)}`);
  // the copy each player has is the world within sight (to the wire's precision), as of the latest message
  wires.forEach((wire, i) => { const m = wire.delta(w); if (m) apply(m, seen[i]); });
  const me = w.players.get(1), mine = seen[0];
  const inSight = [...w.players.values()].map((p) => [PLAYER_ID + p.pid, p]).concat(w.beasts.map((b) => [b.id, b])).filter(([, e]) => Math.hypot(e.x - me.x, e.z - me.z) <= SEE);
  const match = inSight.every(([id, e]) => mine.has(id) && Math.abs(mine.get(id).x - e.x) < 0.02 && Math.abs(mine.get(id).z - e.z) < 0.02);
  check('...and what a player holds is everything within sight, where it is', match && [...mine.keys()].length <= inSight.length + 2, `${mine.size} held, ${inSight.length} in sight`);
  check('...a beast\'s kind and mood come through', [...mine.values()].filter((e) => !e.player).every((e) => ['wolf', 'hog', 'golem'].includes(e.type)));
}

// ---- the crowd's streets keep clear of houses
{
  const land = new Land();
  land.all();
  const nodes = streets();
  const houses = land.houses;
  const inHouse = (x, z) => houses.some((h) => { const dx = x - h.x, dz = z - h.z, c = Math.cos(h.rot), s = Math.sin(h.rot); const lx = dx * c + dz * s, lz = -dx * s + dz * c; return Math.abs(lx) < h.hw + 0.3 && Math.abs(lz) < h.hd + 0.3; });
  let bad = 0;
  for (const [i, n] of nodes.entries()) for (const j of n.links) { if (j < i) continue; const m = nodes[j]; for (let t = 0; t <= 1; t += 0.05) for (const side of [-1.1, 0, 1.1]) { const len = Math.hypot(m.x - n.x, m.z - n.z) || 1; const x = n.x + (m.x - n.x) * t - ((m.z - n.z) / len) * side, z = n.z + (m.z - n.z) * t + ((m.x - n.x) / len) * side; if (inHouse(x, z)) bad++; } }
  check('Lacuna crowd: Sunmere\'s streets (and either side of them) never run through a house', bad === 0, `${nodes.length} street corners, ${bad} points inside`);
  check('...every street corner can be walked to from every other', (() => { const seen = new Set([0]), q = [0]; while (q.length) for (const k of nodes[q.shift()].links) if (!seen.has(k)) { seen.add(k); q.push(k); } return seen.size === nodes.length; })());
}

// ---- (phase 2) combat
{
  const { KITS, linkPower, linkMult, linkFrom, GATE } = await import('../src/lacuna/sim.js');
  const all = (l) => ({ weapon: l, helm: l, chest: l, boots: l, ring: l });
  check('Lacuna Link: no Eternal gear x1, level 10 in every slot x3, 30 in every slot x4.4 (less and less past 10)', linkMult(linkPower({})) === 1 && Math.abs(linkMult(linkPower(all(10))) - 3) < 1e-9 && Math.abs(linkMult(linkPower(all(30))) - 4.4) < 1e-9 && linkMult(linkPower(all(20))) - 3 < 3 - 1);
  const saves = [{ equipped: { weapon: { eternal: true, level: 12 }, helm: { level: 30 } } }, { equipped: {}, eternals: { weapon: { eternal: true, level: 7 }, ring: { eternal: true, level: 22 } } }];
  const L = linkFrom(saves);
  check('...each slot counted once, at its best across every class (worn or put away; only Eternal pieces)', L.weapon === 12 && L.ring === 22 && !L.helm && !L.chest);
  // a clear spot on the meadow, a beast placed there by hand
  const setup = (cls, link = all(10)) => {
    const w = new LandWorld();
    const p = w.addPlayer(1, { x: 60, z: 60 }, { cls, link });
    p.x = 60; p.z = 60;
    for (const b of w.beasts) { b.dead = true; b.diedAt = 1e9; } // the land emptied for the test
    const put = (type, x, z) => { const b = w.beasts.find((q) => q.type === type && q.dead && q.diedAt === 1e9); b.dead = false; b.hp = b.maxHp; b.x = b.hx = x; b.z = b.hz = z; b.state = 'idle'; b.chunk = chunkOf(x, z).i; w.byChunk.forEach((l) => { const i = l.indexOf(b); if (i >= 0) l.splice(i, 1); }); w.byChunk[b.chunk].push(b); return b; };
    return { w, p, put };
  };
  const steps = (w, sec) => { for (let i = 0; i < Math.round(sec * 30); i++) w.step(TICK); };
  {
    const { w, p, put } = setup('archer');
    const hog = put('hog', 75, 60);
    w.act(1, 'basic', hog.x, hog.z);
    steps(w, 0.5);
    const hit = w.events.find((e) => e.type === 'hit');
    check('Lacuna combat: a Sharpshooter\'s arrow flies and lands, for her damage times the Link (20 x 3)', hit && hit.dmg === 60 && hog.hp === hog.maxHp - 60, hit && hit.dmg);
    check('...and the beast comes for whoever shot it', hog.state === 'chase' && hog.target === 1);
    const mp = p.mp;
    w.act(1, 'Q', hog.x, hog.z);
    w.step(TICK);
    check('...Volley: five arrows, its mana paid, and not again until its cooldown is done', w.shots.length === 5 && Math.abs(p.mp - (Math.min(p.maxMp, mp + 7 * TICK) - 20)) < 0.01 && !w.ready(p, 'Q'), `${w.shots.length} shots, mana ${mp} -> ${p.mp}`);
  }
  {
    const { w, p, put } = setup('archer');
    const a = put('wolf', 70, 60), b = put('wolf', 76, 60);
    w.act(1, 'R', 90, 60);
    steps(w, 0.4);
    check('...Deadeye: drawn first (nothing yet)', !w.events.some((e) => e.type === 'hit'));
    steps(w, 0.6);
    const hits = w.events.filter((e) => e.type === 'hit');
    check('...then one shot through both wolves, six times as hard', hits.length === 2 && hits.every((h) => h.dmg === 360) && hits.map((h) => h.id).sort().join() === [a.id, b.id].sort().join(), hits.map((h) => h.dmg).join());
  }
  {
    const { w, p, put } = setup('archer');
    const wolf = put('wolf', 61.5, 60);
    wolf.state = 'chase'; wolf.target = 1; wolf.swipeT = 0;
    w.input(1, { mx: -1, mz: 0 });
    w.act(1, 'E', 70, 60);
    w.step(TICK);
    const hp = p.hp;
    steps(w, 0.3);
    check('...Roll: away she goes, and a swipe while rolling misses', p.x < 58 && p.hp === hp && w.events.some((e) => e.type === 'swipe' && e.dmg === 0));
  }
  {
    const { w, p, put } = setup('warrior');
    const near = put('hog', 70, 60), far = put('hog', 70, 72);
    w.act(1, 'Q', 70, 60);
    steps(w, 0.7);
    const hits = w.events.filter((e) => e.type === 'hit');
    check('...a Berserker leaps where he looks (landing beside it, not inside) and smashes what is round him', Math.hypot(p.x - 70, p.z - 60) < 2 && hits.some((h) => h.id === near.id) && !hits.some((h) => h.id === far.id) && p.burst > 8);
    w.events.length = 0;
    w.act(1, 'E', 70, 60);
    steps(w, 1.8);
    check('...Whirlwind: cuts round him again and again', w.events.filter((e) => e.type === 'hit' && e.id === near.id).length >= 4 || near.dead);
  }
  {
    const { w, p, put } = setup('warrior');
    const g = put('golem', 62, 60);
    w.act(1, 'basic', 62, 60); w.step(TICK);
    const plain = w.events.find((e) => e.type === 'hit').dmg;
    p.hp = p.maxHp * 0.25; p.basicT = 0; w.events.length = 0;
    w.act(1, 'basic', 62, 60); w.step(TICK);
    const hurt = w.events.find((e) => e.type === 'hit').dmg;
    p.hp = p.maxHp * 0.5; p.basicT = 0; w.events.length = 0;
    w.act(1, 'R', 62, 60); w.step(TICK); p.basicT = 0;
    const before = p.hp;
    w.act(1, 'basic', 62, 60); w.step(TICK);
    const raged = w.events.filter((e) => e.type === 'hit').pop().dmg;
    check('...harder when hurt (a quarter health: +45%), harder still in Bloodrage, and its blows heal him', plain === 84 && hurt === Math.round(84 * 1.45) && raged > Math.round(84 * 1.3 * 1.4) - 2 && p.hp > before, `${plain} ${hurt} ${raged}`);
    void g;
  }
  {
    const { w, p, put } = setup('warrior', {});
    const wolf = put('wolf', 61.5, 60);
    wolf.state = 'chase'; wolf.target = 1;
    steps(w, 12);
    check('...with no Eternal gear a wolf is a real danger: it puts you down', w.events.some((e) => e.type === 'down' && e.pid === 1) && p.dead);
    steps(w, 7);
    check('...and you get up at Sunmere\'s gate, whole', !p.dead && p.hp === p.maxHp && Math.hypot(p.x - GATE.x, p.z - GATE.z) < 2);
  }
  {
    const { w, p, put } = setup('warrior');
    const hog = put('hog', 62, 60);
    hog.hp = 10;
    w.act(1, 'basic', 62, 60); w.step(TICK);
    check('...a beast struck down falls', hog.dead && w.events.some((e) => e.type === 'die' && e.id === hog.id), `${hog.dead} ${hog.hp} ${w.events.map((e) => e.type).join(',')}`);
    steps(w, 50);
    check('...and does not come back while someone stands on its ground', hog.dead);
    p.x = 20; p.z = 60;
    steps(w, 1);
    check('...but does once they step away', !hog.dead && hog.hp === hog.maxHp);
    void KITS;
  }
  {
    const { w } = setup('warrior');
    const b = w.beasts.find((q) => q.type === 'golem');
    b.dead = false; b.hp = b.maxHp * 0.4; b.x = 70; b.z = 60;
    const wire = new Interest(1), mirror = new Map();
    apply(wire.delta(w), mirror);
    const got = mirror.get(b.id);
    b.dead = true;
    apply(wire.delta(w), mirror);
    check('Lacuna sync: a beast\'s health comes through (to 1/255), and its fall', got && Math.abs(got.hp - 0.4) < 0.005 && mirror.get(b.id).dead);
  }
}

// ---- (phase 2) combat on the server
{
  const { LandRoom, LACUNA_NET } = await import('../src/lacuna/room.js');
  const box = new Map();
  const accounts = { good: { weapon: 15, helm: 10, chest: 10, boots: 10, ring: 10 } };
  const room = new LandRoom({ passcode: 'stun', send: (c, m) => box.get(c).push(JSON.parse(JSON.stringify(m))), sendBin() {}, linkOf: (s) => accounts[s] || null });
  const conn = () => { const c = {}; box.set(c, []); return c; };
  const run = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) room.tick(1 / 60); };
  const a = conn(), b = conn();
  room.message(a, { t: 'hello', v: LACUNA_NET, pass: 'stun', name: 'Signed', cls: 'archer', session: 'good', link: { weapon: 30, helm: 30, chest: 30, boots: 30, ring: 30 } });
  room.message(b, { t: 'hello', v: LACUNA_NET, pass: 'stun', name: 'Guest', cls: 'warrior', session: 'nope', link: { weapon: 99, helm: 'x' } });
  const wa = box.get(a).find((m) => m.t === 'welcome'), wb = box.get(b).find((m) => m.t === 'welcome');
  check('Lacuna server combat: signed in, the Link is your account\'s own Eternal gear (not what the page claims)', wa.linkFrom === 'account' && wa.link.weapon === 15 && room.world.players.get(wa.pid).mult > 3);
  check('...not signed in, the page\'s levels, kept to 0-30', wb.linkFrom === 'page' && wb.link.weapon === 30 && !wb.link.helm);
  run(0.2);
  const pa = room.world.players.get(wa.pid);
  const me0 = box.get(a).filter((m) => m.t === 'me').pop();
  check('...each player is told their own health, mana and cooldowns', me0 && me0.v[0] === pa.maxHp && me0.v[2] === Math.floor(pa.mp));
  const hog = room.world.beasts.find((q) => q.type === 'hog');
  pa.x = hog.x + 12; pa.z = hog.z; room.byConn.get(a).last = { x: pa.x, z: pa.z, t: room.world.time };
  const pb = room.world.players.get(wb.pid);
  pb.x = hog.x + 14; pb.z = hog.z + 3; room.byConn.get(b).last = { x: pb.x, z: pb.z, t: room.world.time };
  box.get(a).length = 0; box.get(b).length = 0;
  room.message(a, { t: 'act', k: 'basic', ax: hog.x, az: hog.z });
  room.message(a, { t: 'act', k: 'X', ax: 0, az: 0 });
  room.message(a, { t: 'act', k: 'Q', ax: 'far', az: 0 });
  run(0.6);
  const evs = (c) => box.get(c).filter((m) => m.t === 'evs').flatMap((m) => m.list);
  check('...a shot goes through the server: the hit is the server\'s, told to both of them', evs(a).some((e) => e.type === 'hit' && e.id === hog.id && e.pid === wa.pid) && evs(b).some((e) => e.type === 'hit' && e.id === hog.id));
  check('...the friend sees the shot fly; the shooter is not told of their own shot (their page drew it)', evs(b).some((e) => e.type === 'shot' && e.pid === wa.pid) && !evs(a).some((e) => e.type === 'shot' && e.pid === wa.pid));
  check('...nonsense actions are ignored', room.world.players.get(wa.pid).cd.Q <= 0);
  // a Berserker's leap carries him further than a sprint: allowed, once
  pb.cls === 'warrior' || room.world.setClass(wb.pid, 'warrior');
  room.message(b, { t: 'act', k: 'Q', ax: pb.x - 11, az: pb.z });
  run(0.1);
  const mb = room.byConn.get(b);
  box.get(b).length = 0;
  room.message(b, { t: 'pos', x: mb.last.x - 10, z: mb.last.z, f: 0, m: 1, p: 'run' });
  check('...a leap is allowed for (ten metres in an instant is not put back)', !box.get(b).some((m) => m.t === 'snap'));
  room.message(b, { t: 'pos', x: mb.last.x - 10, z: mb.last.z, f: 0, m: 1, p: 'run' });
  check('...but only once', box.get(b).some((m) => m.t === 'snap'));
}

// ---- jumping
{
  const w = new LandWorld();
  const p = w.addPlayer(1);
  const ok = w.jump(1);
  const again = w.jump(1);
  let top = 0, t = 0;
  for (; t < 60; t++) { w.step(TICK); top = Math.max(top, p.y); if (p.y === 0 && p.vy === 0) break; }
  check('Lacuna jump: Space hops about a metre and lands again in under a second (once: no jumping off the air)', ok && !again && top > 0.8 && top < 1.2 && t < 30 && p.y === 0, `${top.toFixed(2)} m, ${((t + 1) / 30).toFixed(2)} s`);
  check('...others are told (to draw the hop)', w.events.some((e) => e.type === 'cast' && e.skill === 'jump'));
  p.dead = true;
  check('...and nobody jumps while down', !w.jump(1));
  const { LandRoom, LACUNA_NET } = await import('../src/lacuna/room.js');
  const box = new Map();
  const room = new LandRoom({ passcode: 'stun', send: (c, m) => box.get(c).push(m), sendBin() {} });
  const a = {}, b = {};
  box.set(a, []); box.set(b, []);
  room.message(a, { t: 'hello', v: LACUNA_NET, pass: 'stun', name: 'A' });
  room.message(b, { t: 'hello', v: LACUNA_NET, pass: 'stun', name: 'B' });
  for (let i = 0; i < 10; i++) room.tick(1 / 60);
  room.message(a, { t: 'jump' });
  for (let i = 0; i < 12; i++) room.tick(1 / 60);
  check('...together: a friend sees you hop', box.get(b).some((m) => m.t === 'evs' && m.list.some((e) => e.type === 'cast' && e.skill === 'jump')));
}

// ---- (phase 2) the story: the Company walks you to Sunmere
{
  const { walkToTown, ROAD_IN } = await import('../src/lacuna/story.js');
  const { GLADE } = await import('../src/lacuna/land.js');
  const mk = (x, z) => ({ x, z, facing: 0, looping: 'idle', once: null, sync() {}, loop(w) { this.looping = w; }, face() {}, update() {}, play() {} });
  const actors = { rowan: mk(GLADE.x + 1, GLADE.z), ilse: mk(GLADE.x, GLADE.z + 1), juni: mk(GLADE.x + 2, GLADE.z), sorrel: mk(GLADE.x - 1, GLADE.z) };
  const me = { x: GLADE.x, z: GLADE.z + 2 };
  const lines = [];
  let done = false;
  const run = walkToTown(actors, (l) => lines.push(...l), () => { done = true; }, { x: me.x, z: me.z });
  // a hero who keeps three metres behind Rowan
  let t = 0;
  for (; t < 150 * 30 && !done; t++) {
    run.update(1 / 30, me);
    const r = actors.rowan, dx = r.x - me.x, dz = r.z - me.z, d = Math.hypot(dx, dz);
    if (d > 3) { me.x += (dx / d) * Math.min(d - 3, 6 / 30); me.z += (dz / d) * Math.min(d - 3, 6 / 30); }
  }
  check('Lacuna story: the Marigold Company walks you from the glade to Sunmere\'s plaza (Waking Up is done)', done && Math.hypot(me.x, me.z) < 25, `${(t / 30).toFixed(0)} s, ${lines.length} lines on the way`);
  check('...talking on the way (every exchange heard, in order)', lines.length >= 12 && lines[0][0] === 'juni' && lines.some((l) => l[1].includes('There she is')));
  // one who stops: the Company waits and calls back
  const a2 = { rowan: mk(GLADE.x + 1, GLADE.z), ilse: mk(GLADE.x, GLADE.z), juni: mk(GLADE.x, GLADE.z), sorrel: mk(GLADE.x, GLADE.z) };
  const lines2 = [];
  const run2 = walkToTown(a2, (l) => lines2.push(...l), () => {}, { x: GLADE.x, z: GLADE.z });
  const idle = { x: GLADE.x, z: GLADE.z };
  for (let i = 0; i < 30 * 30; i++) run2.update(1 / 30, idle);
  check('...stop, and they wait for you (and say so) instead of leaving you behind', Math.hypot(a2.rowan.x - idle.x, a2.rowan.z - idle.z) < 22 && lines2.some((l) => l[1].includes('Keep up')));
  void ROAD_IN;
}

// ---- deterministic maths only in the sim
{
  const bad = ['land.js', 'sim.js'].filter((f) => /Math\.(sin|cos|tan|atan2?|hypot|pow|exp|log|random)\(/.test(fs.readFileSync(new URL('../src/lacuna/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')));
  check('Lacuna sim: no Math.sin/cos/atan2/hypot/pow/random (the same numbers in every browser and on the server)', bad.length === 0, bad.join(', '));
}

// ---- the land on the server (room.js), with stand-in connections
{
  const { LandRoom, LACUNA_NET } = await import('../src/lacuna/room.js');
  const { decode } = await import('../src/lacuna/net.js');
  const box = new Map();
  const closed = new Set();
  const room = new LandRoom({ passcode: 'stun', send: (c, m) => box.get(c).json.push(JSON.parse(JSON.stringify(m))), sendBin: (c, b) => box.get(c).bin.push(b), close: (c) => closed.add(c) });
  const conn = (n) => { const c = { n }; box.set(c, { json: [], bin: [] }); return c; };
  const last = (c, t) => [...box.get(c).json].reverse().find((m) => m.t === t);
  const run = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) room.tick(1 / 60); };
  const x = conn('x');
  room.message(x, { t: 'hello', v: LACUNA_NET, pass: 'nope', name: 'Mallory' });
  check('Lacuna server: a wrong passcode is turned away', /passcode/.test((last(x, 'reject') || {}).reason || '') && closed.has(x) && room.size === 0);
  const old = conn('old');
  room.message(old, { t: 'hello', v: 'L0', pass: 'stun' });
  check('...so is an old page', /out of date/.test((last(old, 'reject') || {}).reason || ''));
  const a = conn('a'), b = conn('b');
  room.message(a, { t: 'hello', v: LACUNA_NET, pass: 'stun', name: 'Ko Ko', cls: 'archer' });
  room.message(b, { t: 'hello', v: LACUNA_NET, pass: 'stun', name: '<b>Friend</b>', cls: 'warrior' });
  const A = last(a, 'welcome'), B = last(b, 'welcome');
  check('...two friends get in, side by side at Sunmere\'s south gate', A && B && A.pid !== B.pid && Math.hypot(A.at.x - B.at.x, A.at.z - B.at.z) > 1 && Math.hypot(A.at.x - B.at.x, A.at.z - B.at.z) < 10);
  check('...names are cleaned, and everyone gets the list of who is here', last(b, 'roster').players.map((p) => p.name).join() === 'Ko Ko,bFriendb' && last(a, 'roster').players.length === 2);
  run(0.5);
  const seen = (c) => { const m = new Map(); for (const buf of box.get(c).bin) { const d = decode(buf); for (const e of d.ups) m.set(e.id, e); for (const id of d.gone) m.delete(id); } return m; };
  check('...each is sent what is in sight, the other player among it', seen(a).has(65000 + B.pid) && seen(b).has(65000 + A.pid) && [...seen(a).values()].some((e) => !e.player));
  // A walks north a few metres a tenth of a second at a time: taken, and B sees it
  let px = A.at.x, pz = A.at.z;
  for (let i = 0; i < 10; i++) { pz -= 0.5; room.message(a, { t: 'pos', x: px, z: pz, f: -1.57, m: 1, p: 'run' }); run(0.1); }
  const aOnB = seen(b).get(65000 + A.pid);
  check('...a player says where they walk, and the others see them there', Math.abs(aOnB.z - pz) < 0.05 && aOnB.moving);
  box.get(a).json.length = 0;
  room.message(a, { t: 'pos', x: px + 80, z: pz, f: 0, m: 1, p: 'sprint' });
  check('...a jump further than anyone can run is put back', last(a, 'snap') && Math.abs(last(a, 'snap').x - px) < 0.01);
  const land = room.world.land;
  const tree = land.chunk(1, 3).trees[0];
  room.world.players.get(A.pid).x = tree.x + 1.5; room.world.players.get(A.pid).z = tree.z;
  room.byConn.get(a).last = { x: tree.x + 1.5, z: tree.z, t: room.world.time - 1 };
  box.get(a).json.length = 0;
  room.message(a, { t: 'pos', x: tree.x, z: tree.z, f: 0, m: 1, p: 'run' });
  check('...so is walking into a tree', !!last(a, 'snap'));
  room.message(a, { t: 'pos', x: 'far', z: null });
  room.message(a, { t: 'cls', cls: 'mage' }); // not one of the opening's classes: ignored
  room.message(a, { t: 'cls', cls: 'warrior' });
  check('...nonsense is ignored; a class swap reaches everyone (and changes the hero)', last(b, 'roster').players.find((p) => p.pid === A.pid).cls === 'warrior' && room.world.players.get(A.pid).cls === 'warrior');
  room.message(a, { t: 'chat', text: 'hello\u0007 there' });
  check('...chat reaches everyone, cleaned', last(b, 'chat') && last(b, 'chat').text === 'hello there' && last(b, 'chat').name === 'Ko Ko');
  {
    // emotes and emoticons: B sees them, A is not sent their own back; unknown ones and spam are dropped
    { const pa = room.world.players.get(A.pid); pa.x = A.at.x; pa.z = A.at.z; } // beside B (A was off at a tree)
    box.get(a).json.length = 0; box.get(b).json.length = 0;
    room.message(a, { t: 'emote', id: 'wave' });
    room.message(a, { t: 'face', id: 'love' }); // too soon after the wave
    room.message(a, { t: 'emote', id: '<script>' });
    run(0.5);
    room.message(a, { t: 'face', id: 'love' });
    run(0.2);
    const evs = (c) => box.get(c).json.filter((m) => m.t === 'evs').flatMap((m) => m.list);
    const bs = evs(b).filter((e) => e.type === 'emote' || e.type === 'face');
    check('...emotes and emoticons reach the others (not too often, known ones only), not the sender', bs.length === 2 && bs[0].type === 'emote' && bs[0].id === 'wave' && bs[1].type === 'face' && bs[1].id === 'love' && bs.every((e) => e.pid === A.pid) && !evs(a).some((e) => e.type === 'emote' || e.type === 'face'));
  }
  // B goes to a wolf: the server's beasts notice B (and only B is told)
  { const pa = room.world.players.get(A.pid); pa.x = A.at.x; pa.z = A.at.z; room.byConn.get(a).last = { x: pa.x, z: pa.z, t: room.world.time }; } // A back in town
  const wolf = room.world.beasts.find((w) => w.type === 'wolf' && Math.hypot(w.x, w.z) > 150);
  const mb = room.byConn.get(b), pb = room.world.players.get(B.pid);
  pb.x = wolf.x + 5; pb.z = wolf.z; mb.last = { x: pb.x, z: pb.z, t: room.world.time };
  box.get(a).json.length = 0;
  for (let i = 0; i < 40; i++) { room.message(b, { t: 'pos', x: pb.x, z: pb.z, f: 0, m: 0, p: 'run' }); run(0.1); }
  const evsOf = (c) => box.get(c).json.filter((m) => m.t === 'evs').flatMap((m) => m.list);
  check('...beasts are the server\'s: B is told one noticed and swiped at B; nothing swiped at A', evsOf(b).some((e) => e.type === 'aggro' && e.pid === B.pid) && evsOf(b).some((e) => e.type === 'swipe' && e.pid === B.pid) && !evsOf(a).some((e) => e.type === 'swipe' && e.pid === A.pid));
  room.leave(b);
  run(0.3);
  check('...someone leaving is gone from the list and from sight', last(a, 'roster').players.length === 1 && !seen(a).has(65000 + B.pid));
  const idle = new LandRoom({ passcode: 'stun', send() {}, sendBin() {} });
  idle.tick(1);
  check('...an empty server makes no land at all (until someone comes)', idle.world === null);
}

{
  const { EMOTES, EMOTICONS, emoteClip, drawEmoticon } = await import('../src/lacuna/emotes.js');
  check('Emotes: a clip is found by exact name or by part of it', emoteClip(['ual_Yes', 'x|greet_02|y'], 'greet_02') === 'x|greet_02|y' && emoteClip(['ual_Yes'], 'ual_Yes') === 'ual_Yes' && emoteClip(['a'], 'bow') === null);
  check('...eight emotes and ten emoticons, each with its own id', new Set(EMOTES.map((e) => e.id)).size === 8 && new Set(EMOTICONS).size === 10);
  let calls = 0;
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => { calls++; }), set: (t, k, v) => { t[k] = v; return true; } });
  for (const id of EMOTICONS) drawEmoticon(g, id, 64);
  check('...every emoticon draws without error', calls > 100);
  const heroes = ['warrior', 'archer'].map((n) => fs.readFileSync(`assets/models/${n}.glb`).toString('latin1'));
  check('...both heroes carry the dance, sit, nod and head-shake clips', heroes.every((t) => ['ual_Dance_Loop', 'ual_Sitting_Enter', 'ual_Sitting_Idle_Loop', 'ual_Yes', 'ual_Idle_No_Loop'].every((c) => t.includes(c))));
}

console.log(`${pass} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
void LAND; void CHUNKS; void TOWN; void chunkOf;
