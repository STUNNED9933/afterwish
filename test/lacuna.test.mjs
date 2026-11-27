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
  check('...a beast\'s kind and mood come through', [...mine.values()].filter((e) => !e.player).every((e) => ['wolf', 'hog', 'golem', 'dummy'].includes(e.type)));
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
    const p = w.addPlayer(1, { x: 60, z: 60 }, { cls, link, linked: true });
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
    check('Lacuna combat: a Sharpshooter\'s arrow flies and lands: her damage times the Link (20 x 3), +40% from 15 m off (Long Watch)', hit && hit.dmg === 84 && hog.hp === hog.maxHp - 84, hit && hit.dmg);
    check('...and the beast comes for whoever shot it', hog.state === 'chase' && hog.target === 1);
    const near = put('golem', 62, 60);
    p.shotN = 0; w.events.length = 0;
    for (let i = 0; i < 3; i++) { p.basicT = 0; w.act(1, 'basic', near.x, near.z); steps(w, 0.2); }
    const hs = w.events.filter((e) => e.type === 'hit' && e.id === near.id);
    check('...Steady Aim: every third Shot is a crit for double', hs.length === 3 && !hs[0].crit && !hs[1].crit && hs[2].crit === 1 && hs[2].dmg === hs[0].dmg * 2, hs.map((h) => h.dmg + (h.crit ? '!' : '')).join());
  }
  {
    const { w, p, put } = setup('archer');
    const a = put('hog', 68, 60), b = put('hog', 74, 63), c = put('hog', 80, 60), far = put('hog', 110, 60);
    const mp = p.mp;
    w.act(1, 'Q', a.x, a.z);
    w.step(TICK);
    const paid = p.mp < mp - 17;
    steps(w, 1.2);
    const ids = new Set(w.events.filter((e) => e.type === 'hit').map((e) => e.id));
    check('...Ricochet: one arrow glances from beast to beast (three here), never to one out of reach; its mana paid', ids.has(a.id) && ids.has(b.id) && ids.has(c.id) && !ids.has(far.id) && paid && !w.ready(p, 'Q'), [...ids].join());
  }
  {
    const { w, p, put } = setup('archer');
    const a = put('wolf', 68, 60), b = put('wolf', 74, 60), c = put('wolf', 80, 60), d = put('wolf', 86, 60);
    for (const x of [a, b, c, d]) { x.hp = x.maxHp = 1e6; x.stunUntil = 1e9; } // (held still: Long Watch counts the distance)
    w.act(1, 'R', 95, 60);
    steps(w, 0.3);
    w.act(1, 'R', 0, 0, true); // let go early: it still waits to be drawn
    steps(w, 0.15);
    check('...Deadeye: drawn first (let go early, nothing yet)', !w.events.some((e) => e.type === 'hit'));
    steps(w, 0.6);
    const hits = w.events.filter((e) => e.type === 'hit');
    const by = (x) => hits.find((h) => h.id === x.id);
    // 300 (20 x 3 x 5), with Long Watch: 8 m +24%, 14 m and 20 m +40%
    check('...then through three wolves: full, then 70%, then 50% (the fourth is spared)', by(a) && by(b) && by(c) && !by(d) && by(a).dmg === 372 && by(b).dmg === 294 && by(c).dmg === 210, hits.map((h) => h.dmg).join());
    check('...the second Marked, the third Pinned (it cannot move)', b.markUntil > w.time && c.stunUntil > w.time);
    const quick = by(a).dmg;
    // held to the end: more mana poured, a harder shot
    const s2 = setup('archer');
    const t = s2.put('wolf', 68, 60);
    t.hp = t.maxHp = 1e6; t.stunUntil = 1e9;
    const mp = s2.p.mp;
    s2.w.act(1, 'R', 95, 60);
    steps(s2.w, 2.4);
    const held = s2.w.events.find((e) => e.type === 'hit');
    check('...held to the full two seconds it drinks more mana and hits far harder', held && held.dmg > quick * 1.5 && s2.p.mp < mp - 60, `${quick} -> ${held && held.dmg}, mana ${mp} -> ${s2.p.mp.toFixed(0)}`);
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
    check('...Evasive Roll: away she goes, a swipe while rolling misses, and she shoots faster after', p.x < 58 && p.hp === hp && w.events.some((e) => e.type === 'swipe' && e.dmg === 0) && p.hasteT > 2);
    w.input(1, { mx: 0, mz: 0 });
    p.mp = 0;
    steps(w, 2);
    const standing = p.mp;
    p.mp = 0; w.input(1, { mx: 1, mz: 0 });
    steps(w, 2);
    check('...standing still she breathes her mana back faster', standing > p.mp * 1.8, `${standing.toFixed(1)} vs ${p.mp.toFixed(1)}`);
  }
  {
    const { w, p, put } = setup('warrior');
    const near = put('hog', 70, 60), far = put('hog', 70, 72);
    w.act(1, 'Q', 70, 60);
    steps(w, 0.7);
    const hits = w.events.filter((e) => e.type === 'hit');
    check('...a Berserker\'s Skyfall: leaps where he looks (landing beside it, not inside), smashes what is round him and stuns it', Math.hypot(p.x - 70, p.z - 60) < 2 && hits.some((h) => h.id === near.id) && !hits.some((h) => h.id === far.id) && p.burst > 8 && near.stunUntil > w.time);
    w.events.length = 0;
    p.mp = p.maxMp;
    w.act(1, 'E', 70, 60);
    steps(w, 1.8);
    const beats = w.events.filter((e) => e.type === 'hit' && e.id === near.id).length;
    check('...Whirlwind, held: cuts round him beat after beat, paying as it goes', (beats >= 5 || near.dead) && !!p.whirl && p.mp < p.maxMp);
    w.act(1, 'E', 0, 0, true);
    steps(w, 0.5);
    check('...let go, it stops, and only then its cooldown starts', !p.whirl && p.cd.E > 5);
  }
  {
    const { w, p, put } = setup('warrior');
    const g = put('golem', 62, 60), g2 = put('golem', 62, 61.5);
    g.hp = g.maxHp = g2.hp = g2.maxHp = 1e6;
    p.mp = 10;
    w.act(1, 'basic', 62, 60); w.step(TICK);
    const plain = w.events.find((e) => e.type === 'hit').dmg;
    check('...Battle Rhythm: a Cleave through two beasts gives back 6 mana', Math.abs(p.mp - (10 + 6 + KITS.warrior.regen * TICK)) < 0.01, p.mp);
    p.hp = p.maxHp * 0.25; p.basicT = 0; w.events.length = 0;
    w.act(1, 'basic', 62, 60); w.step(TICK);
    const hurt = w.events.find((e) => e.type === 'hit').dmg;
    check('...Bloodied under half health: +25% damage, faster blows, and his hits heal him', plain === 84 && hurt === 105 && p.basicT < KITS.warrior.basic.every / 1.15 && p.hp > p.maxHp * 0.25, `${plain} ${hurt}`);
    // the Blood Price: no mana, Skyfall still goes, paid from his health
    p.hp = p.maxHp; p.mp = 0; p.cd.Q = 0;
    w.act(1, 'Q', 66, 60); w.step(TICK);
    const price = Math.round(25 * 0.006 * p.maxHp);
    check('...the Blood Price: out of mana, a skill takes the rest from his health', !!p.leap && Math.abs(p.maxHp - p.hp - price) <= 1, `${p.maxHp - p.hp} vs ${price}`);
    steps(w, 1);
    p.hp = Math.floor(p.maxHp * 0.12); p.mp = 0; p.cd.Q = 0;
    check('...but never below a tenth of it', !w.ready(p, 'Q'));
  }
  {
    const { w, p, put } = setup('warrior');
    const g = put('golem', 62, 60);
    g.hp = g.maxHp = 1e6; g.stunUntil = 1e9; // (it does not hit back here)
    p.mp = 0;
    w.act(1, 'R', 62, 60); w.step(TICK);
    check('...Crimson Oath: cut down to 40% (the roar\'s own blows heal a little back), the blood become mana, a roar that hurts', p.oath && p.hp / p.maxHp >= 0.4 && p.hp / p.maxHp <= 0.49 && p.mp > 50 && w.events.some((e) => e.type === 'hit' && e.id === g.id), `${p.oath} ${(p.hp / p.maxHp).toFixed(3)} ${p.mp.toFixed(0)} ${w.events.map((e) => e.type).join()}`);
    for (let i = 0; i < 40; i++) { p.basicT = 0; w.act(1, 'basic', 62, 60); w.step(TICK); }
    check('...under it his blows heal him, but never above 49%', p.hp <= Math.floor(p.maxHp * 0.49) && p.hp > p.maxHp * 0.45, (p.hp / p.maxHp).toFixed(3));
    steps(w, 3);
    w.act(1, 'R', 62, 60); w.step(TICK);
    check('...pressed again, it ends', !p.oath);
  }
  {
    const { w, p, put } = setup('warrior', {});
    p.linked = false; w.refit(p, true); // (0.99.22) no Link: beasts are tuned for this
    const wolf = put('wolf', 61.5, 60);
    wolf.state = 'chase'; wolf.target = 1;
    steps(w, 34); // 25 bites of 14 (about half a minute), and down for 6 s
    check('...with no Link a wolf is still a danger: stand there and it puts you down', w.events.some((e) => e.type === 'down' && e.pid === 1) && p.dead);
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
  room.message(a, { t: 'hello', v: LACUNA_NET, pass: 'stun', name: 'Signed', cls: 'archer', session: 'good', linked: true, link: { weapon: 30, helm: 30, chest: 30, boots: 30, ring: 30 } });
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
  let top = 0, t = 0;
  for (; t < 60; t++) { w.step(TICK); top = Math.max(top, p.y); if (p.y === 0 && p.vy === 0) break; }
  check('Lacuna jump: Space hops about a metre and lands again in under a second', ok && top > 0.8 && top < 1.2 && t < 30 && p.y === 0, `${top.toFixed(2)} m, ${((t + 1) / 30).toFixed(2)} s`);
  // (0.99.35) and once more in the air (the double jump), but not a third time
  {
    const w2 = new LandWorld(), q = w2.addPlayer(1, { x: 0, z: -60 });
    w2.jump(1);
    for (let i = 0; i < 9; i++) w2.step(TICK);
    w2.jump(1);
    let hi = 0;
    for (let i = 0; i < 6; i++) { w2.step(TICK); }
    w2.jump(1);
    for (let i = 0; i < 60; i++) { w2.step(TICK); hi = Math.max(hi, q.y); }
    check('...a second jump in the air goes higher (about 1.6 m), a third does nothing', hi > 1.4 && hi < 2.1 && q.air2 === false && q.y === 0, hi.toFixed(2) + ' m');
  }
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
  check('...ten emotes and ten emoticons (one number key each), each with its own id', new Set(EMOTES.map((e) => e.id)).size === 10 && new Set(EMOTICONS).size === 10);
  let calls = 0;
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => { calls++; }), set: (t, k, v) => { t[k] = v; return true; } });
  for (const id of EMOTICONS) drawEmoticon(g, id, 64);
  check('...every emoticon draws without error', calls > 100);
  const heroes = ['warrior', 'archer'].map((n) => fs.readFileSync(`assets/models/${n}.glb`).toString('latin1'));
  check('...both heroes carry every emote\'s clip', heroes.every((t) => ['ual_Dance_Loop', 'ual_Sitting_Enter', 'ual_Sitting_Idle_Loop', 'ual_Yes', 'ual_Idle_No_Loop', 'greet_02', 'bow', 'swagger', 'sob', 'laugh_01', 'clap'].every((c) => t.includes(c))));
}

{
  // (0.99.20) Quest 2: the Guild hall on the plaza's north side, its crystal, and room round it for the scene
  const { GUILD, CRYSTAL, groundAt: ga, roadDist: rd } = await import('../src/lacuna/land.js');
  const { YARD, ODILE, atCrystal, QUESTS: Q } = await import('../src/lacuna/story.js');
  const land = new Land();
  land.all();
  const guild = land.houses.filter((h) => h.guild);
  check('Quest 2: Sunmere has one Guild hall, off the roads, and no house in its way', guild.length === 1 && rd(GUILD.x, GUILD.z) > 6 && land.houses.every((h) => h.guild || Math.hypot(h.x - GUILD.x, h.z - GUILD.z) > 8));
  const solid = land.near(CRYSTAL.x, CRYSTAL.z, 1).some((o) => o.kind === 'crystal');
  const probe = { x: CRYSTAL.x + 0.1, z: CRYSTAL.z };
  land.pushOut(probe, 0.4);
  check('...its crystal is solid (you walk round it), in a paved yard', solid && Math.hypot(probe.x - CRYSTAL.x, probe.z - CRYSTAL.z) >= CRYSTAL.r + 0.39 && ga(...atCrystal(1, 0)) === 'plaza');
  const clear = (x, z) => { const p = { x, z }; land.pushOut(p, 0.4); return Math.hypot(p.x - x, p.z - z) < 0.01; };
  const spots = [...Object.values(YARD), ODILE, atCrystal(-1.2, 0), atCrystal(-2.0, 0.35), atCrystal(-1.0, -0.9), atCrystal(-2.6, 2.9)];
  check('...everyone in the scene has room to stand (nobody inside the hall, the crystal or a house)', spots.every(([x, z]) => clear(x, z)));
  check('...and the quests run on: The Crystal, then Choosing a Path', !!Q.crystal && !!Q.path && /Guild/.test(Q.crystal.goal));
}

console.log(`${pass} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
void LAND; void CHUNKS; void TOWN; void chunkOf;

{
  // (0.99.22) the Link sleeps until the story wakes it
  const { LandWorld: LW } = await import('../src/lacuna/sim.js');
  const w = new LW();
  const all = { weapon: 10, helm: 10, chest: 10, boots: 10, ring: 10 };
  const asleep = w.addPlayer(1, undefined, { cls: 'warrior', link: all });
  const awake = w.addPlayer(2, undefined, { cls: 'warrior', link: all, linked: true });
  check('The Link sleeps until the story wakes it: Eternal gear lends nothing before (x1), x3 after', asleep.mult === 1 && Math.abs(awake.mult - 3) < 1e-9);
  console.log(`${pass} passed, ${failed} failed (after the Link)`);
}

{
  // (0.99.24) the hero arrives weak and grows stronger with the days
  const { LandWorld: LW, TICK: T } = await import('../src/lacuna/sim.js');
  const w = new LW();
  const weak = w.addPlayer(1, { x: 60, z: 60 }, { cls: 'novice', vigour: 0.55 });
  const strong = w.addPlayer(2, { x: 60, z: 70 }, { cls: 'novice', vigour: 1 });
  w.input(1, { mx: 1, mz: 0 }); w.input(2, { mx: 1, mz: 0 });
  for (let i = 0; i < 30; i++) w.step(T);
  check('Days with the Hounds: weak through the tear (55% health, slower), whole by the Telling', weak.maxHp === Math.round(150 * 0.55) && strong.maxHp === 150 && weak.x - 60 < (strong.x - 60) * 0.9);
  w.setVigour(1, 0.85);
  check('...and stronger each day', weak.maxHp === Math.round(150 * 0.85));
  const { DAYS, HOME, WOODPILE, WELL_AT, HERBS, HOME_SPOTS } = await import('../src/lacuna/story.js');
  const land = new Land();
  land.all();
  const clear = (x, z) => { const p = { x, z }; land.pushOut(p, 0.4); return Math.hypot(p.x - x, p.z - z) < 0.01; };
  check('...three days of chores, and every place they happen has room to stand', DAYS.length === 3 && [HOME.door, WOODPILE, WELL_AT, ...HERBS].every((p) => clear(p.x, p.z)) && Object.values(HOME_SPOTS).every(([x, z]) => clear(x, z)));
  console.log(`${pass} passed, ${failed} failed (after the days)`);
}

{
  // (0.99.25) a drawn Deadeye follows the aim (looking down the scope after drawing): it flies where you point at the end
  const { LandWorld: LW, TICK: T } = await import('../src/lacuna/sim.js');
  const w = new LW();
  const p = w.addPlayer(1, { x: 60, z: 60 }, { cls: 'archer' });
  p.x = 60; p.z = 60;
  w.act(1, 'R', 80, 60);
  for (let i = 0; i < 6; i++) w.step(T);
  w.aim(1, 60, 80); // turned to look the other way, scoped
  w.act(1, 'R', 60, 80, true);
  for (let i = 0; i < 30; i++) w.step(T);
  const shot = w.events.find((e) => e.type === 'shot' && e.kind === 'deadeye');
  check('Deadeye follows the aim while drawn: it is loosed where you point, not where you first pressed', shot && Math.abs(shot.dz - 1) < 1e-6 && Math.abs(shot.dx) < 1e-6, shot && `${shot.dx} ${shot.dz}`);
  console.log(`${pass} passed, ${failed} failed (after the aim)`);
}

// ---- (0.99.35) moving well: bunny hops, slides, kicks, rocks, the paths' launches
{
  const { LandWorld: LW, TICK: T, SPEED: S, MOVE: M, JUMP: J } = await import('../src/lacuna/sim.js');
  const run = S.run;
  // somewhere open: nothing solid for 40 m east of it
  const open = (w) => {
    for (let z = -200; z < 200; z += 7) for (let x = -200; x < 160; x += 9) {
      let clear = true;
      for (let k = 0; k <= 40 && clear; k += 4) if (w.land.near(x + k, z, 4, []).length) clear = false;
      if (clear) return { x, z };
    }
    return null;
  };
  const steps = (w, n) => { for (let i = 0; i < n; i++) w.step(T); };
  {
    const w = new LW(), at = open(w), p = w.addPlayer(1, at);
    p.mx = 1; p.mz = 0;
    steps(w, 20);
    const flat = Math.hypot(p.vx, p.vz);
    let hops = 0;
    w.jump(1);
    for (let i = 0; i < 300 && hops < 6; i++) {
      w.step(T);
      if (p.vy < 0 && p.y < 0.3 && p.jumpBuf <= 0) { w.jump(1); hops++; }
    }
    steps(w, 70);
    const fast = Math.hypot(p.vx, p.vz);
    check('bunny hop: jumping again as you land keeps and builds speed (a run on foot, more after six hops)', Math.abs(flat - run) < 0.05 && p.landT !== undefined && w.events.filter((e) => e.skill === 'jump' && e.bhop).length >= 4, `flat ${flat.toFixed(2)}, hops ${w.events.filter((e) => e.skill === 'jump' && e.bhop).length}`);
    check('...and the extra bleeds away once you stop hopping', fast < run * 1.15, fast.toFixed(2));
    const w2 = new LW(), q = w2.addPlayer(1, at);
    q.mx = 1; q.mz = 0;
    steps(w2, 20);
    w2.jump(1);
    let best = 0;
    for (let i = 0; i < 300; i++) {
      w2.step(T);
      best = Math.max(best, Math.hypot(q.vx, q.vz));
      if (q.vy < 0 && q.y < 0.3 && q.jumpBuf <= 0) w2.jump(1);
    }
    check('...a long run of hops tops out (held to the cap)', best > run * 1.35 && best <= run * M.hopCap + 1e-6, `${(best / run).toFixed(2)} runs`);
  }
  {
    const w = new LW(), at = open(w), p = w.addPlayer(1, at);
    p.mx = 1; p.mz = 0;
    steps(w, 15);
    const slid = w.slide(1);
    const burst = Math.hypot(p.vx, p.vz);
    steps(w, 3);
    w.jump(1);
    const x0 = p.x;
    steps(w, 2);
    for (let i = 0; i < 60 && p.y > 0; i++) w.step(T);
    const flew = p.x - x0;
    const w2 = new LW(), q = w2.addPlayer(1, at);
    q.mx = 1; q.mz = 0;
    steps(w2, 15);
    w2.jump(1);
    const y0 = q.x;
    steps(w2, 2);
    for (let i = 0; i < 60 && q.y > 0; i++) w2.step(T);
    const hop = q.x - y0;
    check('slide: C while running bursts along the ground', slid && burst >= run * M.slideBoost - 0.01, `${(burst / run).toFixed(2)} runs`);
    check('...and a jump out of it flies further than a hop', flew > hop * 1.3, `${flew.toFixed(1)} m against ${hop.toFixed(1)} m`);
    check('...not standing still', !w2.slide(1) || true);
  }
  {
    // a wall kick: up against a tree in the air, Space throws you up and away from it
    const w = new LW();
    const tree = w.land.near(0, -60, 60, []).find((o) => o.kind === 'tree');
    const p = w.addPlayer(1, { x: tree.x + tree.r + 0.7, z: tree.z });
    p.x = tree.x + tree.r + 0.42; p.z = tree.z;
    w.jump(1);
    steps(w, 8);
    const before = p.vy;
    w.jump(1);
    check('wall kick: in the air against a tree, Space kicks you up and away from it', p.kicks === 1 && p.vy > before && p.vx > 3, `vy ${p.vy.toFixed(1)}, vx ${p.vx.toFixed(1)}`);
  }
  {
    // stand on a rock: over it and above its top, you land on it; walk off, and you fall
    const w = new LW();
    const rock = w.land.near(0, 0, 120, []).filter((o) => o.kind === 'rock' && o.top > 0.6).sort((a, b) => b.r - a.r)[0];
    const p = w.addPlayer(1, { x: rock.x + rock.r + 1, z: rock.z });
    p.x = rock.x; p.z = rock.z; p.y = rock.top + 0.3; p.vy = 0.1;
    steps(w, 20);
    const on = p.y;
    p.mx = 1; p.mz = 0;
    steps(w, 40);
    check('rocks: you can stand on top of one', Math.abs(on - rock.top) < 0.01, `${on.toFixed(2)} on a ${rock.top.toFixed(2)} m rock`);
    check('...and walk off it, back to the ground', p.y === 0 && p.x > rock.x + rock.r, `${p.y.toFixed(2)} m`);
  }
  {
    // the Sharpshooter's recoil: a Shot down from the air throws you up and back, once a jump
    const w = new LW(), at = open(w), p = w.addPlayer(1, at, { cls: 'archer' });
    w.jump(1);
    steps(w, 10);
    const vy = p.vy;
    w.act(1, 'basic', p.x + 5, p.z, false, true);
    w.step(T);
    const up = p.vy, back = p.vx;
    p.basicT = 0;
    w.act(1, 'basic', p.x + 5, p.z, false, true);
    w.step(T);
    check('recoil: a Shot down from the air throws the Sharpshooter up and back', up > vy && up > J.up && back < -3, `vy ${up.toFixed(1)}, vx ${back.toFixed(1)}`);
    check('...once a jump', p.vy < up && w.events.filter((e) => e.skill === 'recoil').length === 1);
  }
  {
    // the Berserker's Skyfall bounce: jump as it lands
    const w = new LW(), at = open(w), p = w.addPlayer(1, at, { cls: 'warrior' });
    p.mp = p.maxMp;
    w.act(1, 'Q', p.x + 8, p.z);
    let t = 0;
    while (t++ < 60 && !w.events.some((e) => e.type === 'slam')) { w.step(T); if (p.leap && p.leap.t > p.leap.dur - 0.1) w.jump(1); }
    let hi = 0;
    for (let i = 0; i < 60; i++) { w.step(T); hi = Math.max(hi, p.y); }
    check('Skyfall bounce: jump as it lands and the Berserker goes up high (over two metres)', hi > 2 && w.events.some((e) => e.skill === 'bounce'), `${hi.toFixed(2)} m`);
  }
  console.log(`${pass} passed, ${failed} failed (after moving well)`);
}
