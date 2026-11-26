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
  room.message(a, { t: 'cls', cls: 'mage' });
  check('...nonsense is ignored; a class swap reaches everyone', last(b, 'roster').players.find((p) => p.pid === A.pid).cls === 'mage');
  room.message(a, { t: 'chat', text: 'hello\u0007 there' });
  check('...chat reaches everyone, cleaned', last(b, 'chat') && last(b, 'chat').text === 'hello there' && last(b, 'chat').name === 'Ko Ko');
  // B goes to a wolf: the server's beasts notice B (and only B is told)
  { const pa = room.world.players.get(A.pid); pa.x = A.at.x; pa.z = A.at.z; room.byConn.get(a).last = { x: pa.x, z: pa.z, t: room.world.time }; } // A back in town
  const wolf = room.world.beasts.find((w) => w.type === 'wolf' && Math.hypot(w.x, w.z) > 150);
  const mb = room.byConn.get(b), pb = room.world.players.get(B.pid);
  pb.x = wolf.x + 5; pb.z = wolf.z; mb.last = { x: pb.x, z: pb.z, t: room.world.time };
  box.get(a).json.length = 0;
  for (let i = 0; i < 40; i++) { room.message(b, { t: 'pos', x: pb.x, z: pb.z, f: 0, m: 0, p: 'run' }); run(0.1); }
  check('...beasts are the server\'s: B is told one noticed and swiped, A is not', box.get(b).json.some((m) => m.t === 'ev' && m.type === 'aggro') && box.get(b).json.some((m) => m.t === 'ev' && m.type === 'swipe') && !box.get(a).json.some((m) => m.t === 'ev'));
  room.leave(b);
  run(0.3);
  check('...someone leaving is gone from the list and from sight', last(a, 'roster').players.length === 1 && !seen(a).has(65000 + B.pid));
  const idle = new LandRoom({ passcode: 'stun', send() {}, sendBin() {} });
  idle.tick(1);
  check('...an empty server makes no land at all (until someone comes)', idle.world === null);
}

console.log(`${pass} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
void LAND; void CHUNKS; void TOWN; void chunkOf;
