// Headless playtest: a simple bot plays the simulation with no graphics.
// Run with: npm test
import { World } from '../src/sim/world.js';
import { CONFIG } from '../src/config.js';
import * as DEFS from '../src/sim/defs.js';
import { MAPS } from '../src/sim/maps.js';

function runBot({ seed, parrySkill, maxSeconds = 900, preset = 'relaxed', save = null, cls = undefined }) {
  const w = new World({ seed, parryPreset: preset, save, cls });
  const p = w.player;
  const log = { parries: 0, perfects: 0, hitsTaken: 0, levelUps: 0, pickups: 0, staggers: 0, reflects: 0, dodges: 0, casts: 0 };
  let botRng = seed * 7 + 1;
  const rnd = () => ((botRng = (botRng * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let tick = 0; tick < maxSeconds * 60 && !w.gameOver; tick++) {
    // target nearest enemy
    let near = null, nd = 1e9;
    for (const e of w.enemies) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < nd) { nd = d; near = e; } }
    if (near && p.targetId !== near.id && tick % 20 === 0) w.command({ type: 'attack', id: near.id });
    // parry when an attack that will reach us is in its cue phase
    for (const e of w.enemies) {
      if (e.state === 'windup' && e.atk.parryable && e.atk.shape !== 'shot' && e.cue && p.parryT <= 0 && rnd() < parrySkill) {
        const remain = e.dur - e.t;
        if (remain < 0.2) w.command({ type: 'parry' });
      }
      if (e.state === 'windup' && !e.atk.parryable && e.dur - e.t < 0.25 && p.level >= 3 && p.cd.e <= 0) {
        w.command({ type: 'cast', slot: 'e', x: p.x - (e.x - p.x) + 3, z: p.z - (e.z - p.z) + 3 });
      }
    }
    for (const pr of w.projectiles) {
      if (pr.owner === 'enemy' && Math.hypot(pr.x - p.x, pr.z - p.z) < 2.2 && p.parryT <= 0 && rnd() < parrySkill) w.command({ type: 'parry' });
    }
    if (near && nd < 4) {
      if (p.cd.q <= 0) w.command({ type: 'cast', slot: 'q', x: near.x, z: near.z });
      if (p.cd.w <= 0 && p.level >= 2 && w.enemies.length > 2) w.command({ type: 'cast', slot: 'w', x: near.x, z: near.z });
    }
    if (near && p.level >= 6 && p.cd.r <= 0) w.command({ type: 'cast', slot: 'r', x: near.x, z: near.z });
    if (p.hp < p.stats.maxHp * 0.4) w.command({ type: 'potion' });
    // equip upgrades between waves
    if (w.wave.phase === 'intermission' && tick % 30 === 0) {
      for (let i = 0; i < p.bag.length; i++) {
        const it = p.bag[i]; const cur = p.equipped[it.slot];
        const sc = (x) => Object.values(x.stats).reduce((a, b) => a + b, 0);
        if (!cur || sc(it) > sc(cur)) { w.command({ type: 'equip', index: i }); break; }
      }
      w.command({ type: 'scrap' });
      w.command({ type: 'nextWave' });
    }
    if (w.offer) w.command({ type: 'augment', id: w.offer.choices[Math.floor(rnd() * w.offer.choices.length)] });
    for (const k of ['q', 'w', 'e', 'r']) if (p.skillPoints > 0) w.command({ type: 'rankUp', slot: k });
    w.step(CONFIG.TICK);
    for (const ev of w.events) {
      if (ev.type === 'parry') { log.parries++; if (ev.perfect) log.perfects++; }
      if (ev.type === 'damage' && ev.who === 'player') log.hitsTaken++;
      if (ev.type === 'levelUp') log.levelUps++;
      if (ev.type === 'pickup') log.pickups++;
      if (ev.type === 'stagger') log.staggers++;
      if (ev.type === 'reflect') log.reflects++;
      if (ev.type === 'dodge') log.dodges++;
      if (ev.type === 'cast') log.casts++;
    }
    w.events.length = 0;
    // sanity: nothing may ever become NaN or leave the arena
    const all = [p, ...w.enemies, ...w.projectiles, ...w.loot];
    for (const o of all) {
      if (!Number.isFinite(o.x) || !Number.isFinite(o.z)) throw new Error('NaN position on ' + (o.type || 'object') + ' at tick ' + tick);
    }
    if (Math.hypot(p.x, p.z) > CONFIG.ARENA_RADIUS + 0.01) throw new Error('player left arena');
    if (!Number.isFinite(p.hp)) throw new Error('NaN hp');
  }
  return { w, log };
}

let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };

for (const [label, skill] of [['no parry', 0], ['average', 0.6], ['good', 0.95]]) {
  const waves = [], levels = [];
  let agg = null;
  for (let seed = 1; seed <= 6; seed++) {
    const { w, log } = runBot({ seed, parrySkill: skill });
    waves.push(w.wave.n + (w.gameOver ? '' : '+')); levels.push(w.player.level); globalThis.times = (globalThis.times||[]); times.push(Math.round(w.time));
    agg = agg || log; if (agg !== log) for (const k in log) agg[k] += log[k];
  }
  console.log('  seconds', times.join(',')); globalThis.times=[]; console.log(`bot(${label}): died on waves ${waves.join(',')}  levels ${levels.join(',')}  ${JSON.stringify(agg)}`);
  if (skill === 0) globalThis.noParry = waves; if (skill === 0.95) globalThis.good = waves;
  if (skill > 0) { check(label + ' bot parries', agg.parries > 5); check(label + ' bot staggers enemies', agg.staggers > 3); }
  check(label + ' bot levels up', agg.levelUps > 3);
  check(label + ' bot picks up loot', agg.pickups > 0);
}
const avg = (a) => a.reduce((x, y) => x + parseInt(y), 0) / a.length;
check('parrying gets you further than not parrying', avg(globalThis.good) > avg(globalThis.noParry), `${avg(globalThis.good).toFixed(1)} vs ${avg(globalThis.noParry).toFixed(1)}`);

// save / load round trip
{
  const { w } = runBot({ seed: 3, parrySkill: 0.9 });
  const save = JSON.parse(JSON.stringify(w.toSave()));
  const w2 = new World({ seed: 9, save });
  check('save keeps level', w2.player.level === w.player.level);
  check('save keeps gear', JSON.stringify(w2.player.equipped) === JSON.stringify(w.player.equipped));
  check('restart at checkpoint', w2.wave.n + 1 === save.checkpoint && (save.checkpoint - 1) % 5 === 0, 'checkpoint ' + save.checkpoint);
}
// determinism: same seed + same commands = same result
{
  const a = runBot({ seed: 5, parrySkill: 0.7 }).w, b = runBot({ seed: 5, parrySkill: 0.7 }).w;
  check('deterministic', a.time === b.time && a.player.level === b.player.level && a.wave.n === b.wave.n);
}
// strict preset is harder than relaxed for a slightly-late presser
{
  const r = CONFIG.PARRY_PRESETS;
  check('presets ordered', r.relaxed.window > r.standard.window && r.standard.window > r.strict.window);
}

// ---------------------------------------------------------------- new systems
import { rollItem, itemScore, itemStats, RARITIES, CACHES, upgradeCost, scrapValue } from '../src/sim/items.js';
import { AUGMENTS, AUGMENT_IDS, defaultMods } from '../src/sim/augments.js';
import { makeRng } from '../src/sim/rng.js';

// Gear: at the same item level and slot, a higher rarity always beats a lower one.
{
  const rng = makeRng(42);
  let bad = 0, checked = 0;
  for (const slot of ['weapon', 'helm', 'chest', 'boots', 'ring']) for (const ilvl of [1, 4, 9, 20]) {
    const range = RARITIES.map((_, ri) => {
      let lo = Infinity, hi = -Infinity;
      const w = RARITIES.map((__, i) => (i === ri ? 1 : 0));
      for (let n = 0; n < 150; n++) { const sc = itemScore(rollItem(rng, ilvl, { weights: w, slot })); lo = Math.min(lo, sc); hi = Math.max(hi, sc); }
      return { lo, hi };
    });
    for (let i = 1; i < range.length; i++) { checked++; if (range[i].lo <= range[i - 1].hi) bad++; }
  }
  check('higher rarity always beats lower at the same item level', bad === 0, `${checked} comparisons, ${bad} overlaps`);
  const it = rollItem(rng, 5, { weights: [0, 0, 0, 0, 0, 0, 1] });
  check('immortal items carry a special effect', !!it.effect && it.rarity === 6, it.name + ' / ' + it.effect);
  check('no item has a negative stat', Object.values(it.stats).every((v) => v > 0));
}
// Perfect parry slows enemies; the player keeps full speed.
{
  const w = new World({ seed: 2 });
  for (let i = 0; i < 60 * 5; i++) w.step(CONFIG.TICK);
  const e = w.enemies[0]; const p = w.player;
  e.x = p.x + 1.5; e.z = p.z; e.state = 'chase'; e.atkCd = 0; e.t = 0;
  let slowed = false;
  for (let i = 0; i < 400 && !slowed; i++) {
    if (e.state === 'windup' && e.dur - e.t < 0.03 && p.parryT <= 0) w.command({ type: 'parry' });
    w.step(CONFIG.TICK);
    if (w.events.some((ev) => ev.type === 'slowStart')) slowed = true;
    w.events.length = 0;
  }
  check('perfect parry starts slow time', slowed && w.slowT > 0.5, 'slowT ' + w.slowT.toFixed(2));
  const other = w.enemies.find((o) => o !== e && o.state === 'chase');
  if (other) {
    const before = Math.hypot(other.x - p.x, other.z - p.z); other.kx = other.kz = 0;
    const ox = other.x, oz = other.z;
    w.step(CONFIG.TICK);
    const moved = Math.hypot(other.x - ox, other.z - oz);
    check('enemies move at 30% speed during slow time', moved < other.def.speed * CONFIG.TICK * 0.5 && before > 0, 'moved ' + moved.toFixed(4));
  }
}
// Perfect dodge refunds Lunge.
{
  const w = new World({ seed: 3 }); const p = w.player;
  p.level = 3; w.recalcStats();
  w.command({ type: 'cast', slot: 'e', x: 5, z: 0 }); w.step(CONFIG.TICK);
  const full = p.cd.e;
  const res = w.hitPlayer(50, { parryable: false });
  check('dash dodges and refunds Lunge', res === 'dodged' && p.cd.e <= CONFIG.DODGE_REFUND_CD && full > 8, `cd ${full.toFixed(1)} -> ${p.cd.e.toFixed(1)}`);
}
// Augments change abilities; ranks raise damage and cut cooldowns.
{
  const w = new World({ seed: 4 }); const p = w.player;
  const d0 = w.abilityDamage('q'), c0 = w.abilityCooldown('q');
  p.skillPoints = 2; w.command({ type: 'rankUp', slot: 'q' }); w.step(CONFIG.TICK);
  check('rank up raises damage and lowers cooldown', w.abilityDamage('q') > d0 && w.abilityCooldown('q') < c0 && p.ranks.q === 2 && p.skillPoints === 1);
  w.offer = { choices: ['q_reach', 'h_giant', 'q_reset'], boss: false };
  const hp0 = p.stats.maxHp;
  w.command({ type: 'augment', id: 'h_giant' }); w.step(CONFIG.TICK);
  check('Giant augment adds health', p.stats.maxHp > hp0 * 1.2 && w.offer === null);
  w.augments.push('q_reset'); w.recalcStats();
  for (let i = 0; i < 60 * 5; i++) w.step(CONFIG.TICK);
  const e = w.enemies[0]; e.x = p.x + 2; e.z = p.z; e.hp = 1;
  p.cd.q = 0; w.command({ type: 'cast', slot: 'q', x: e.x, z: e.z }); w.step(CONFIG.TICK);
  check('Executioner resets Cleave on kill', e.dead && p.cd.q === 0);
  const m = defaultMods(); let okAll = true;
  for (const id of AUGMENT_IDS) { try { AUGMENTS[id].apply(m); } catch (err) { okAll = false; } }
  check('every augment applies cleanly', okAll && Object.values(m).every((v) => typeof v === 'boolean' || Number.isFinite(v)), AUGMENT_IDS.length + ' augments');
}
// Town: scrap, blacksmith, caches, trainer, save v2.
{
  const w = new World({ seed: 5 }); const p = w.player;
  p.bag.push(rollItem(w.rng, 3, { weights: [1, 0, 0, 0, 0, 0, 0], slot: 'ring' }), rollItem(w.rng, 3, { weights: [0, 0, 1, 0, 0, 0, 0], slot: 'ring' }));
  const worth = scrapValue(p.bag[0]);
  w.command({ type: 'discard', index: 0 }); w.runCommands();
  check('scrapping an item gives scrap', p.scrap === worth && p.bag.length === 1);
  p.gold = 5000; p.scrap = 500;
  const ad0 = p.stats.ad; const cost = upgradeCost(p.equipped.weapon);
  w.command({ type: 'upgrade', slot: 'weapon' }); w.runCommands();
  check('blacksmith upgrade costs resources and adds stats', p.equipped.weapon.plus === 1 && p.gold === 5000 - cost.gold && p.scrap === 500 - cost.scrap && itemStats(p.equipped.weapon).ad >= 5 && p.stats.ad >= ad0);
  const bag0 = p.bag.length, g0 = p.gold;
  w.command({ type: 'openCache', tier: 'gilded' }); w.runCommands();
  check('opening a cache costs gold and adds an item', p.bag.length === bag0 + 1 && p.gold === g0 - CACHES.gilded.cost.gold && p.bag[p.bag.length - 1].rarity >= 2);
  w.command({ type: 'openCache', tier: 'warden' }); w.runCommands();
  check('warden cache needs a key', p.bag.length === bag0 + 1);
  for (const key in CACHES) check(`${key} cache odds add up to 100%`, Math.abs(CACHES[key].odds.reduce((a, b) => a + b, 0) - 100) < 0.01);
  const sp = p.skillPoints; w.command({ type: 'buyTome' }); w.runCommands();
  check('trainer sells a skill point', p.skillPoints === sp + 1 && p.tomes === 1);
  const save = JSON.parse(JSON.stringify(w.toSave()));
  const w2 = new World({ seed: 1, save });
  check('save v2 keeps gold, scrap, ranks and upgrades', save.v === 2 && w2.player.gold === p.gold && w2.player.scrap === p.scrap && w2.player.equipped.weapon.plus === 1 && w2.player.tomes === 1);
  const old = new World({ seed: 1, save: { v: 1, level: 7, exp: 3, equipped: { weapon: { id: 'x', name: 'Old Sword', slot: 'weapon', rarity: 1, ilvl: 2, stats: { ad: 9 } } }, bag: [], bestWave: 6, checkpoint: 6 } });
  check('old v1 saves still load', old.player.level === 7 && old.player.skillPoints === 6 && old.player.gold === 0 && old.wave.n === 5 && old.player.stats.ad > 20);
  const pick = new World({ seed: 1, save, startWave: 1 });
  check('a run can start from an earlier checkpoint', pick.wave.n === 0);
}

// ---- Exploration: maps, portals, solid obstacles ------------------------------
{
  const { MAPS, MAP_IDS, buildMap } = await import('../src/sim/maps.js');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  /** True if a round body overlaps anything solid on the map (with a hair of tolerance). */
  const inside = (w, o, rad) => { const c = { x: o.x, z: o.z }; w.pushOut(c, rad - 0.02); return Math.hypot(c.x - o.x, c.z - o.z) > 1e-6; };

  // The map chain
  const seen = new Set(['town']); const queue = ['town'];
  while (queue.length) for (const g of buildMap(queue.shift()).portals) if (!seen.has(g.to)) { seen.add(g.to); queue.push(g.to); }
  check('maps: every map can be reached from town', seen.size === MAP_IDS.length, [...seen].join(' > '));
  check('maps: every portal has a way back', MAP_IDS.every((id) => buildMap(id).portals.every((g) => buildMap(g.to).portals.some((b) => b.to === id))));
  for (const id of MAP_IDS) {
    const m = buildMap(id);
    const types = new Set(m.spawns.map((sp) => sp.type));
    const ok = [...types].every((t) => DEFS.ENEMIES[t].boss || MAPS[id].roster[t]) && m.spawns.every((sp) => sp.level >= m.level && sp.level <= m.levelMax + (DEFS.ENEMIES[sp.type].boss ? 1 : 0));
    const open = m.spawns.every((sp) => !m.obstacles.some((ob) => Math.hypot(ob.x - sp.x, ob.z - sp.z) < ob.r + 1)) && m.portals.every((g) => !m.obstacles.some((ob) => Math.hypot(ob.x - g.x, ob.z - g.z) < ob.r + 3));
    check(`${m.name}: its own enemies, at its own level, with room to stand`, ok && open && (m.safe ? m.spawns.length === 0 : m.spawns.length >= 15), `${m.spawns.length} enemies: ${[...types].join(', ') || 'none'}; ${m.obstacles.length} solid objects`);
  }
  check('maps: same layout every time', JSON.stringify(buildMap('fen')) === JSON.stringify(buildMap('fen')));
  {
    // Follow the portals from Haven to the end: every map is reachable and each is ten levels above the last.
    const chain = ['town'];
    for (;;) { const next = MAPS[chain[chain.length - 1]].portals.map((g) => g.to).find((to) => !chain.includes(to)); if (!next) break; chain.push(next); }
    const fields = chain.slice(1).map((id) => MAPS[id]);
    check('maps: one road from Haven through every map', chain.length === Object.keys(MAPS).length, chain.join(' > '));
    check('maps: each map picks up where the last one ended, up to level 100', fields.every((m, i) => m.level === (i === 0 ? 1 : fields[i - 1].level + fields[i - 1].levelSpan + 1)) && buildMap(chain[chain.length - 1]).spawns.some((sp) => sp.level === 100));
    check('maps: three bosses, each in its own map', ['keep', 'hollow', 'sanctum'].map((id) => buildMap(id).spawns.find((sp) => DEFS.ENEMIES[sp.type].boss).type).join() === 'boss,boss2,boss3');
    check('maps: enemies get tougher the deeper in you go', (() => { const m = buildMap('frost'); const near = m.spawns.filter((sp) => Math.hypot(sp.x - m.portals[0].x, sp.z - m.portals[0].z) < 30); const far = m.spawns.filter((sp) => Math.hypot(sp.x - m.portals[0].x, sp.z - m.portals[0].z) > 60); const av = (l) => l.reduce((a, sp) => a + sp.level, 0) / l.length; return near.length && far.length && av(far) > av(near) + 2; })());
  }
  check("maps: The Warden lives in the Keep", buildMap('keep').spawns.filter((sp) => sp.type === 'boss').length === 1);

  // Town
  const w = new World({ seed: 4, mode: 'explore' });
  const p = w.player;
  run(w, 1);
  check('explore: you start in Haven, which is safe and empty of enemies', w.map.id === 'town' && w.inTown() && w.enemies.length === 0 && w.zone().name === 'Haven');
  // Solid buildings: walk straight at a house.
  const house = w.map.obstacles.find((o) => o.kind === 'house');
  let entered = false;
  w.command({ type: 'move', x: house.x, z: house.z });
  for (let i = 0; i < 60 * 6; i++) { w.step(CONFIG.TICK); if (inside(w, p, p.radius)) entered = true; }
  check('collision: you cannot walk into a house', !entered && Math.hypot(p.x - house.x, p.z - house.z) < 6, `stopped ${Math.hypot(p.x - house.x, p.z - house.z).toFixed(1)} from its centre`);
  check('collision: a move order into something solid is dropped', p.moveTarget === null);
  // ... but a spot BEHIND the house is reached by walking around it.
  { const ha = Math.atan2(house.z, house.x); p.x = Math.cos(ha) * 9; p.z = Math.sin(ha) * 9; const tx = Math.cos(ha) * 21, tz = Math.sin(ha) * 21;
    w.command({ type: 'move', x: tx, z: tz }); let hit = false; for (let i = 0; i < 60 * 8; i++) { w.step(CONFIG.TICK); if (inside(w, p, p.radius)) hit = true; }
    check('collision: you walk around a house to a spot behind it', !hit && Math.hypot(p.x - tx, p.z - tz) < 0.5, `ended ${Math.hypot(p.x - tx, p.z - tz).toFixed(1)} from the spot`); }
  // A dash aimed through the house does not end inside it either.
  p.level = 6; w.recalcStats();
  w.command({ type: 'cast', slot: 'e', x: house.x * 2, z: house.z * 2 }); run(w, 0.6);
  check('collision: a dash does not end inside a house', !inside(w, p, p.radius));
  // Walk to the portal: it takes you to the Greenwood Trail.
  const gate = w.map.portals[0];
  w.command({ type: 'move', x: gate.x, z: gate.z });
  let changes = 0;
  w.events.length = 0;
  for (let i = 0; i < 60 * 12; i++) { w.step(CONFIG.TICK); for (const ev of w.events) if (ev.type === 'mapChange') changes++; w.events.length = 0; }
  check('portal: walking into it takes you to the next map', w.map.id === 'greenwood' && changes === 1, `${w.map.id} after ${changes} trips`);
  const back = w.map.portals.find((g) => g.to === 'town');
  check('portal: you arrive beside the way back, but are not sent straight back', Math.hypot(p.x - back.x, p.z - back.z) < 8 && w.map.id === 'greenwood');
  check('explore: the new map has its own enemies, each with a home spot', w.enemies.length >= 13 && w.enemies.every((e) => e.home), w.enemies.length + ' alive');

  // Solid trees: walk through the middle of one. You go around it.
  const lone = (t) => w.map.obstacles.every((o) => o === t || Math.hypot(o.x - t.x, o.z - t.z) > 6.5); // nothing else in the way
  const tree = w.map.obstacles.filter((o) => o.kind === 'tree' && Math.hypot(o.x, o.z) < 30 && lone(o))[0];
  w.enemies = []; w.camps = []; // nobody to interrupt the walk
  p.x = tree.x - 4; p.z = tree.z + 0.2; p.targetId = null;
  w.command({ type: 'move', x: tree.x + 4, z: tree.z + 0.2 });
  let closest = 99;
  for (let i = 0; i < 60 * 3; i++) { w.step(CONFIG.TICK); closest = Math.min(closest, Math.hypot(p.x - tree.x, p.z - tree.z)); }
  check('collision: you walk around a tree, never through it', closest >= tree.r + p.radius - 0.03 && Math.abs(p.x - (tree.x + 4)) < 0.6, `closest ${closest.toFixed(2)}, tree + hero ${(tree.r + p.radius).toFixed(2)}`);

  // Enemies: wander near home, wake when you come close, come back after dying.
  const w2 = new World({ seed: 6, mode: 'explore' }); w2.loadMap('greenwood', 'town'); const p2 = w2.player;
  const homes = w2.enemies.map((e) => [e.x, e.z]);
  run(w2, 25);
  const moved = w2.enemies.filter((e, i) => Math.hypot(e.x - homes[i][0], e.z - homes[i][1]) > 0.5).length;
  check('explore: idle enemies wander, but stay near where they live', moved >= 5 && w2.enemies.every((e) => Math.hypot(e.x - e.home.x, e.z - e.home.z) < 8), moved + ' moved');
  check('collision: enemies do not stand inside trees or rocks', w2.enemies.every((e) => !inside(w2, e, e.radius)));
  const target = w2.enemies.slice().sort((a, b) => Math.hypot(a.x - p2.x, a.z - p2.z) - Math.hypot(b.x - p2.x, b.z - p2.z))[0];
  w2.command({ type: 'move', x: target.home.x - 4, z: target.home.z });
  let woke = false;
  for (let i = 0; i < 60 * 12; i++) { p2.hp = p2.stats.maxHp; w2.step(CONFIG.TICK); if (w2.enemies.some((e) => e.aggro)) woke = true; } // kept standing: this checks waking, not fighting
  check('explore: enemies wake when you come close', woke);
  const n = w2.enemies.length; const gold = p2.gold;
  w2.hitEnemy(w2.enemies.find((e) => e.aggro) || w2.enemies[0], 999999); run(w2, 0.1);
  check('explore: kills pay gold', p2.gold > gold && w2.enemies.length === n - 1);
  p2.x = back.x * 0.8; p2.z = back.z * 0.8; p2.moveTarget = null; w2.enemies.forEach((e) => { e.hp = e.maxHp; });
  for (let i = 0; i < 60 * (CONFIG.RESPAWN_TIME + 3); i++) { p2.hp = p2.stats.maxHp; w2.step(CONFIG.TICK); }
  check('explore: enemies come back after a while', w2.enemies.length >= n, `${w2.enemies.length} of ${n}`);

  // The Keep's boss, tickets, and being knocked out.
  const w3 = new World({ seed: 8, mode: 'explore' }); w3.loadMap('keep', 'ridge'); const p3 = w3.player;
  const boss = w3.enemies.find((e) => e.def.boss);
  const before = { keys: p3.keys, tickets: p3.tickets, sp: p3.skillPoints + p3.level };
  w3.hitEnemy(boss, 99999999);
  check("Keep: The Warden drops a key and tickets", p3.keys === before.keys + 1 && p3.tickets > before.tickets);
  w3.hitPlayer(9999999, { parryable: false });
  check('explore: lethal damage knocks you out, the game is not over', p3.dead && !w3.gameOver);
  run(w3, CONFIG.EXPLORE_RESPAWN_DELAY + 1);
  check('explore: you wake up in Haven at full health', !p3.dead && w3.map.id === 'town' && p3.hp === p3.stats.maxHp);
  const save = JSON.parse(JSON.stringify(w3.toSave()));
  const w4 = new World({ seed: 1, mode: 'explore', save });
  check('explore: save keeps level, gear and tickets', w4.player.level === p3.level && w4.player.tickets === p3.tickets && w4.map.id === 'town');
  const arena = new World({ seed: 1 });
  check('arena is unchanged by exploration', arena.mode === 'arena' && arena.radius === CONFIG.ARENA_RADIUS && arena.obstacles.length === 0 && !arena.map);
}
// A bot walks out of town through the portal and farms the Greenwood Trail for 5 minutes.
{
  const w = new World({ seed: 9, mode: 'explore' });
  const p = w.player;
  let downs = 0, trips = 0, overlaps = 0;
  for (let tick = 0; tick < 60 * 300; tick++) {
    if (tick % 30 === 0 && !p.dead) {
      if (w.map.safe) {
        if (p.hp >= p.stats.maxHp * 0.95) w.command({ type: 'move', x: w.map.portals[0].x, z: w.map.portals[0].z });
      } else {
        let near = null, nd = 1e9;
        for (const e of w.enemies) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < nd) { nd = d; near = e; } }
        if (near && p.targetId !== near.id) w.command({ type: 'attack', id: near.id });
        if (near && nd < 4 && p.cd.q <= 0) w.command({ type: 'cast', slot: 'q', x: near.x, z: near.z });
        if (p.hp < p.stats.maxHp * 0.4) w.command({ type: 'potion' });
        if (p.skillPoints > 0) w.command({ type: 'rankUp', slot: 'q' });
      }
    }
    for (const e of w.enemies) if (e.state === 'windup' && e.atk.parryable && e.atk.shape !== 'shot' && e.dur - e.t < 0.15 && p.parryT <= 0) w.command({ type: 'parry' });
    w.step(CONFIG.TICK);
    for (const ev of w.events) { if (ev.type === 'playerDown') downs++; if (ev.type === 'mapChange') trips++; }
    w.events.length = 0;
    if (!Number.isFinite(p.x) || Math.hypot(p.x, p.z) > w.radius + 0.01) throw new Error('explore: bad player position');
    for (const e of w.enemies) if (!Number.isFinite(e.x)) throw new Error('explore: bad enemy position');
    if (tick % 20 === 0 && !p.dead && !p.leap) { const c = { x: p.x, z: p.z }; w.pushOut(c, p.radius - 0.05); if (Math.hypot(c.x - p.x, c.z - p.z) > 1e-6) overlaps++; }
  }
  check('explore bot: travels by portal and levels up on the Greenwood Trail', p.level >= 3 && trips >= 2, `level ${p.level}, kills ${w.stats.kills}, tickets ${p.tickets}, knocked out ${downs}x, portal trips ${trips}`);
  check('explore bot: never ended a step inside something solid', overlaps === 0, overlaps + ' overlaps');
}
// --- Classes -----------------------------------------------------------------
{
  const { CLASSES, CLASS_IDS } = await import('../src/sim/classes.js');
  const { AUGMENTS } = await import('../src/sim/augments.js');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  /** A world with one enemy standing still `gap` units from the hero. */
  const duel = (cls, gap, level = 6) => {
    const w = new World({ seed: 7, cls });
    const p = w.player; p.level = level; w.recalcStats(); p.hp = p.stats.maxHp;
    w.wave.phase = 'explore'; // no waves: just the two of them
    const e = w.spawnEnemy('brute'); e.state = 'recover'; e.t = 999; e.x = gap; e.z = 0; e.hp = e.maxHp = 100000;
    e.facing = Math.PI; // looking at the hero
    p.x = 0; p.z = 0; w.events.length = 0;
    return { w, p, e };
  };
  const damageOf = (w) => w.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy').reduce((a, ev) => a + ev.amount, 0);

  check('four classes exist', CLASS_IDS.join() === 'warrior,archer,rogue,mage');
  for (const cls of CLASS_IDS) {
    const w = new World({ seed: 2, cls });
    const again = new World({ seed: 2, save: JSON.parse(JSON.stringify(w.toSave())) });
    check(`${cls}: a save remembers its class`, again.cls === cls && again.kit.q.name === CLASSES[cls].abilities.q.name);
  }
  check('an old save with no class is a warrior', new World({ save: { v: 2, level: 3 } }).cls === 'warrior');
  const hp = (cls) => new World({ cls }).player.stats.maxHp;
  check('warrior is the toughest class', CLASS_IDS.every((c) => c === 'warrior' || hp(c) < hp('warrior')), CLASS_IDS.map((c) => c + ' ' + hp(c)).join(', '));

  // Archer: basic attacks from range, every third one a crit.
  {
    const { w, p, e } = duel('archer', 8);
    w.command({ type: 'attack', id: e.id }); run(w, 4);
    const hits = w.events.filter((ev) => ev.type === 'damage' && ev.basic);
    check('archer: basic attacks hit from range', hits.length >= 4 && Math.hypot(p.x - e.x, p.z - e.z) > 6, `${hits.length} hits from ${Math.hypot(p.x - e.x, p.z - e.z).toFixed(1)} away`);
    check('archer: every third basic attack crits', hits.slice(0, 6).filter((h) => h.crit).length >= 2);
  }
  {
    const { w, p, e } = duel('warrior', 8);
    w.command({ type: 'attack', id: e.id }); run(w, 4);
    check('warrior: still walks into melee', Math.hypot(p.x - e.x, p.z - e.z) < 4.5 && damageOf(w) > 0);
  }
  {
    const { w, p, e } = duel('archer', 8);
    w.command({ type: 'cast', slot: 'q', x: e.x, z: e.z }); run(w, 0.1);
    check('archer: Piercing Shot hits down the line', damageOf(w) > 0);
    w.events.length = 0;
    w.command({ type: 'cast', slot: 'r', x: e.x, z: e.z }); run(w, 3.5);
    const ticks = w.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy').length;
    check('archer: Arrow Storm ticks over time', ticks >= 5, ticks + ' ticks');
    check('archer: Arrow Storm ends', w.zones.length === 0 && w.telegraphs.length === 0);
    {
      // Barrage: five arrows, each a basic attack (so one of them is Steady Aim's crit).
      const b = duel('archer', 8);
      b.e.maxHp = b.e.hp = 1e9;
      b.p.swingCount = 0;
      b.w.command({ type: 'cast', slot: 'w', x: b.e.x, z: b.e.z }); run(b.w, 1.2);
      const hits = b.w.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy' && ev.basic);
      check('archer: Barrage looses five arrows that count as basic attacks', b.p.swingCount >= 5 && hits.length >= 5 && hits.some((h) => h.crit), `${hits.length} arrow hits, ${hits.filter((h) => h.crit).length} crits`);
      const c = duel('archer', 8);
      c.e.x = 40; c.e.z = 0;
      c.w.command({ type: 'cast', slot: 'w', x: 40, z: 0 }); run(c.w, 0.1);
      check('archer: Barrage needs a target in range', c.p.cd.w === 0);
    }
    {
      // Steady Aim: +100% crit chance on the third shot; anything over 100% becomes crit damage.
      const s = duel('archer', 8);
      const base = s.w.critMultiplier();
      s.p.stats.crit = 30;
      check('archer: Steady Aim turns spare crit chance into crit damage', Math.abs(s.w.critMultiplier(100) - (base + 0.3)) < 1e-9 && s.w.critMultiplier(0) === base);
      const r0 = s.w.basicRange();
      s.w.mods.rangePct = 0.25;
      check('archer: range bonuses stretch basic attack range', Math.abs(s.w.basicRange() - r0 * 1.25) < 1e-9, `${r0} -> ${s.w.basicRange()}`);
    }
    const x0 = p.x; w.events.length = 0;
    const as0 = p.stats.as;
    w.command({ type: 'cast', slot: 'e', x: -10, z: 0 }); run(w, 0.4);
    check('archer: Tumble moves, then attacks 50% faster for a while', p.x < x0 - 2 && p.rushT > 3 && Math.abs(p.stats.as / as0 - (1 + 0.015 * (p.level - 1) + 0.5) / (1 + 0.015 * (p.level - 1))) < 0.05, `${as0.toFixed(2)} -> ${p.stats.as.toFixed(2)} attacks per second`);
    run(w, 4.5);
    check('archer: ...and the bonus wears off', p.rushT === 0 && Math.abs(p.stats.as - as0) < 1e-9);
  }
  // Rogue: Backstab is far stronger on an exposed enemy; Death Mark closes the gap.
  {
    const a = duel('rogue', 2.5); a.w.command({ type: 'cast', slot: 'q', x: a.e.x, z: a.e.z }); run(a.w, 0.1);
    const front = damageOf(a.w);
    const b = duel('rogue', 2.5); b.e.facing = 0; // its back is to the hero
    b.w.command({ type: 'cast', slot: 'q', x: b.e.x, z: b.e.z }); run(b.w, 0.1);
    const behind = damageOf(b.w);
    check('rogue: Backstab hits harder from behind', front > 0 && behind > front * 1.3, `${front} from the front, ${behind} from behind`);
    const c = duel('rogue', 30); c.w.command({ type: 'cast', slot: 'q', x: 30, z: 0 }); run(c.w, 0.1);
    check('rogue: Backstab with nobody in reach does not go on cooldown', c.p.cd.q === 0);
    const d = duel('rogue', 8); d.w.command({ type: 'cast', slot: 'r', x: d.e.x, z: d.e.z }); run(d.w, 0.4);
    check('rogue: Death Mark jumps to the target and strikes', Math.hypot(d.p.x - d.e.x, d.p.z - d.e.z) < 3.2 && damageOf(d.w) > 0);
  }
  // Mage: weak basics, strong spells.
  {
    const { w, p, e } = duel('mage', 8);
    w.command({ type: 'cast', slot: 'q', x: e.x, z: e.z }); run(w, 0.05);
    check('mage: Fire Bolt is a projectile', w.projectiles.some((pr) => pr.kind === 'bolt'));
    run(w, 0.6);
    const bolt = damageOf(w); w.events.length = 0;
    w.command({ type: 'attack', id: e.id }); run(w, 2.2);
    const basics = w.events.filter((ev) => ev.type === 'damage' && ev.basic);
    check('mage: one Fire Bolt beats a basic attack by a lot', bolt > 0 && basics.length > 0 && bolt > basics[0].amount * 2.5, `bolt ${bolt}, basic ${basics[0] && basics[0].amount}`);
    w.events.length = 0;
    w.command({ type: 'cast', slot: 'r', x: e.x, z: e.z }); run(w, 0.5);
    check('mage: Meteor has not landed yet', damageOf(w) === 0 && w.telegraphs.length === 1);
    run(w, 0.6);
    check('mage: Meteor lands', damageOf(w) > 0 && w.telegraphs.length === 0);
    const x0 = p.x; w.command({ type: 'cast', slot: 'e', x: -10, z: 0 }); run(w, 0.3);
    check('mage: Blink teleports', p.x < x0 - 4);
  }
  // Augment offers only ever contain the class's own augments.
  for (const cls of CLASS_IDS) {
    const w = new World({ seed: 9, cls }); w.player.level = 10; w.recalcStats();
    let ok = true, n = 0;
    for (let i = 0; i < 40; i++) { w.offer = null; w.makeOffer(i % 5 === 0); for (const id of w.offer.choices) { n++; if (AUGMENTS[id].cls && AUGMENTS[id].cls !== cls) ok = false; } }
    check(`${cls}: only offered its own augments`, ok && n === 120);
  }
  // Each class can fight through the first waves without errors.
  for (const cls of CLASS_IDS) {
    const { w, log } = runBot({ seed: 3, parrySkill: 0.9, maxSeconds: 240, cls });
    check(`${cls} bot: clears waves and uses its kit`, w.wave.n >= 4 && log.casts > 10, `wave ${w.wave.n}, level ${w.player.level}, casts ${log.casts}`);
  }
}
// --- 0.5: class weapons, hand-written class augments, anti-kiting, arena scaling ---
{
  const { rollItem, WEAPONS, itemTypeName, starterWeapon } = await import('../src/sim/items.js');
  const { AUGMENTS } = await import('../src/sim/augments.js');
  const { makeRng } = await import('../src/sim/rng.js');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  const rng = makeRng(5);
  const withAug = (cls, id, gap = 6) => {
    const w = new World({ seed: 7, cls }); const p = w.player; p.level = 8; w.augments.push(id); w.recalcStats(); p.hp = p.stats.maxHp;
    w.wave.phase = 'explore';
    const e = w.spawnEnemy('grunt'); e.state = 'recover'; e.t = 999; e.x = gap; e.z = 0; e.hp = e.maxHp = 100000; e.facing = Math.PI;
    p.x = 0; p.z = 0; w.events.length = 0;
    return { w, p, e };
  };
  const hits = (w) => w.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy');

  // Weapons
  for (const cls of ['warrior', 'archer', 'rogue', 'mage']) {
    const it = rollItem(rng, 5, { slot: 'weapon', cls });
    check(`${cls}: weapon drops are a ${WEAPONS[cls].type}`, it.cls === cls && itemTypeName(it) === WEAPONS[cls].type && it.stats[WEAPONS[cls].main] > 0 && it.stats[WEAPONS[cls].bonus[0]] > 0, it.name + ' ' + JSON.stringify(it.stats));
    check(`${cls}: starts with a ${WEAPONS[cls].starter}`, new World({ cls }).player.equipped.weapon.name === WEAPONS[cls].starter);
  }
  {
    const w = new World({ cls: 'mage' }); const before = w.player.stats.ad;
    const staff = rollItem(rng, 6, { slot: 'weapon', cls: 'mage', minRarity: 2 });
    w.player.bag.push(staff); w.command({ type: 'equip', index: 0 }); w.runCommands();
    check('mage: Spell Power on a staff raises spell damage', staff.stats.sp > 0 && w.player.stats.ad > before, `${before} -> ${w.player.stats.ad}`);
    const bow = rollItem(rng, 6, { slot: 'weapon', cls: 'archer' });
    w.player.bag.push(bow); w.command({ type: 'equip', index: w.player.bag.indexOf(bow) }); w.runCommands();
    check('a mage cannot equip a bow', w.player.equipped.weapon === staff && w.player.bag.includes(bow));
    const old = { id: 'x', name: 'Iron Sword', slot: 'weapon', rarity: 1, ilvl: 3, stats: { ad: 9 }, plus: 0 };
    w.player.bag.push(old); w.command({ type: 'equip', index: w.player.bag.indexOf(old) }); w.runCommands();
    check('weapons from before 0.5 can still be equipped by anyone', w.player.equipped.weapon === old);
  }
  for (const cls of ['archer', 'mage']) {
    const w = new World({ seed: 11, cls, mode: 'explore' });
    let ok = true, n = 0;
    for (let i = 0; i < 300; i++) { const e = w.spawnEnemy('brute', { x: 30, z: 0, level: 3 }); w.killEnemy(e); }
    for (const l of w.loot) if (l.item.slot === 'weapon') { n++; if (l.item.cls !== cls) ok = false; }
    check(`${cls}: every weapon that drops is for your class`, ok && n > 5, n + ' weapons');
  }

  // Hand-written class augments
  for (const cls of ['archer', 'rogue', 'mage']) {
    const own = Object.values(AUGMENTS).filter((a) => a.cls === cls);
    check(`${cls}: has hand-written augments`, own.length >= 15 && own.some((a) => a.tier === 2), own.length + ' augments');
  }
  {
    const a = withAug('mage', 'mage_q_twin'); a.w.command({ type: 'cast', slot: 'q', x: 6, z: 0 }); run(a.w, 0.05);
    check('mage Twin Bolt: two bolts', a.w.projectiles.filter((pr) => pr.kind === 'bolt').length === 2);
    const b = withAug('mage', 'mage_w_freeze', 3); b.e.state = 'chase'; b.w.command({ type: 'cast', slot: 'w', x: 3, z: 0 }); run(b.w, 0.5);
    check("mage Deep Freeze: Frozen Orb's shatter stuns", b.e.state === 'stunned');
    const c = withAug('mage', 'mage_r_twin'); c.w.command({ type: 'cast', slot: 'r', x: 6, z: 0 }); run(c.w, 2.3);
    const spell = hits(c.w).filter((h) => !h.basic);
    check('mage Second Impact: Meteor hits twice', spell.length === 2 && c.w.telegraphs.length === 0, spell.length + ' hits');
    const d = withAug('mage', 'mage_e_rift', 2); d.w.command({ type: 'cast', slot: 'e', x: -8, z: 0 }); run(d.w, 0.05);
    check('mage Rift: Blink blasts where you stood', hits(d.w).length === 1);
  }
  {
    const a = withAug('rogue', 'rogue_r_chain', 6); a.e.hp = 1; a.w.command({ type: 'cast', slot: 'r', x: 6, z: 0 }); run(a.w, 0.4);
    check('rogue Chain Kill: a Death Mark kill resets it', a.e.dead && a.p.cd.r === 0, 'cd ' + a.p.cd.r);
    const b = withAug('rogue', 'rogue_q_bleed', 2.5); b.w.command({ type: 'cast', slot: 'q', x: 2.5, z: 0 }); run(b.w, 2);
    check('rogue Serrated Blade: Backstab bleeds', hits(b.w).some((h) => h.dot));
    const c = withAug('rogue', 'rogue_r_daze', 6); c.e.state = 'chase'; c.w.command({ type: 'cast', slot: 'r', x: 6, z: 0 }); run(c.w, 0.4);
    check('rogue Dazing Mark: Death Mark stuns', c.e.state === 'stunned');
  }
  {
    const a = withAug('archer', 'archer_rapid', 8); a.w.command({ type: 'attack', id: a.e.id }); run(a.w, 4);
    const basics = hits(a.w).filter((h) => h.basic).slice(0, 6);
    check('archer Rapid Aim: every second shot crits', basics.filter((h) => h.crit).length >= 3, basics.map((h) => (h.crit ? 'C' : '-')).join(''));
    const plain = withAug('archer', 'h_giant', 8); plain.w.command({ type: 'cast', slot: 'r', x: 8, z: 0 }); run(plain.w, 6);
    const more = withAug('archer', 'archer_r_rain', 8); more.w.command({ type: 'cast', slot: 'r', x: 8, z: 0 }); run(more.w, 6);
    check('archer Endless Rain: more ticks', hits(more.w).length >= hits(plain.w).length + 3, `${hits(plain.w).length} -> ${hits(more.w).length}`);
  }

  // Melee enemies speed up when they cannot catch a hero who keeps running.
  {
    const w = new World({ seed: 3, cls: 'archer' }); const p = w.player; w.wave.phase = 'explore';
    const e = w.spawnEnemy('grunt'); e.state = 'chase'; e.x = 8; e.z = 0; p.x = 0; p.z = 0;
    let dist3 = 0;
    for (let i = 0; i < 60 * 9; i++) {
      const a = Math.atan2(p.z - e.z, p.x - e.x) + 0.35; // keep running away in a wide circle
      w.command({ type: 'move', x: p.x + Math.cos(a) * 5, z: p.z + Math.sin(a) * 5 });
      w.step(CONFIG.TICK);
      if (i === 60 * 3) dist3 = Math.hypot(p.x - e.x, p.z - e.z);
    }
    const end = Math.hypot(p.x - e.x, p.z - e.z);
    check('a kited melee enemy speeds up and closes in', e.chaseT === 0 || end < dist3, `gap ${dist3.toFixed(1)} after 3s, ${end.toFixed(1)} after 9s, chaseT ${e.chaseT.toFixed(1)}`);
  }
  // Arena enemies scale up for a hero who out-levelled the wave, and not otherwise.
  {
    const foe = (level, wave = 1) => { const w = new World({ seed: 1, save: { v: 2, level } }); w.wave.n = wave; return w.spawnEnemy('grunt'); };
    check('arena: enemies are about the hero\'s level', foe(40).level >= 34 && foe(40).level <= 40 && foe(3).level <= 3, `level ${foe(3).level} for a level 3 hero, ${foe(40).level} for level 40`);
    check('arena: later waves are tougher at the same hero level', foe(20, 10).maxHp > foe(20, 1).maxHp * 1.5 && foe(20, 10).dmgMult > foe(20, 1).dmgMult, `${foe(20, 1).maxHp} hp on wave 1, ${foe(20, 10).maxHp} on wave 10`);
    const ex = new World({ seed: 1, mode: 'explore', save: { v: 2, level: 20 } }); ex.loadMap('ridge', 'fen');
    const same = ex.enemies.find((e) => e.type === 'grunt');
    const ar = foe(same.level + 2, 1);
    check('arena: pays less EXP than exploration, which is where you level', ar.expValue < same.expValue * 0.6, `${Math.round(ar.expValue)} vs ${Math.round(same.expValue)}`);
  }
}
// --- Levels 1 to 100 ---
{
  const { expToNext, enemyScale, ENEMIES, BOSSES, buildWave } = DEFS;
  let rising = true, total = 0;
  for (let L = 1; L < 100; L++) { if (expToNext(L + 1) <= expToNext(L)) rising = false; total += expToNext(L) / (10 * enemyScale(L).exp); }
  check('levels: each level needs more EXP than the last', rising);
  check('levels: 100 is a long road but not an endless one', total > 4000 && total < 20000, Math.round(total) + ' Husks of your own level');
  const w = new World({ seed: 2, mode: 'explore', save: { v: 2, level: 99 } }); const p = w.player;
  w.loadMap('sanctum', 'maw');
  p.exp = expToNext(99) - 1;
  { const e = w.enemies.find((x) => !x.def.boss); w.hitEnemy(e, 1e12); w.step(CONFIG.TICK); }
  const at100 = p.level;
  for (let i = 0; i < 30; i++) { const e = w.enemies.find((x) => !x.def.boss); if (e) w.hitEnemy(e, 1e12); w.step(CONFIG.TICK); }
  check('levels: the cap is 100', at100 === 100 && p.level === 100 && CONFIG.MAX_LEVEL === 100, 'level ' + p.level);
  check('ranks: abilities go to rank ' + CONFIG.MAX_RANK, (() => { p.skillPoints = 99; for (let i = 0; i < 30; i++) w.command({ type: 'rankUp', slot: 'q' }); w.step(CONFIG.TICK); return p.ranks.q === CONFIG.MAX_RANK; })());

  // Every enemy type can fight: put one next to the hero and let it attack for a while.
  for (const type of Object.keys(ENEMIES)) {
    const a = new World({ seed: 5, save: { v: 2, level: 30 } }); a.wave.phase = 'explore';
    const e = a.spawnEnemy(type); e.state = 'chase'; e.x = 5; e.z = 0; a.player.x = 0; a.player.z = 0;
    let windups = 0, bad = false;
    for (let i = 0; i < 60 * 14; i++) {
      a.player.hp = a.player.stats.maxHp;
      e.hp = e.maxHp; // the hero fights back; keep the enemy alive for the test
      a.step(CONFIG.TICK);
      for (const ev of a.events) if (ev.type === 'windup') windups++;
      a.events.length = 0;
      if (![a.player, ...a.enemies, ...a.projectiles].every((o) => Number.isFinite(o.x) && Number.isFinite(o.z))) bad = true;
    }
    check(`enemy: ${ENEMIES[type].name} attacks`, windups >= 2 && !bad, windups + ' attacks in 14s');
  }
  check('arena: the three bosses take turns', [5, 10, 15, 20].map((n) => buildWave(n, () => 0.5)[0]).join() === [BOSSES[0], BOSSES[1], BOSSES[2], BOSSES[0]].join());
  check('arena: enemies from the later maps join deep waves', (() => { let s = 1; const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647); const seen = new Set(); for (let i = 0; i < 40; i++) for (const t of buildWave(22, rng)) seen.add(t); return seen.has('knight') && seen.has('golem') && seen.has('wolf'); })());

  // The Waygate
  const g = new World({ seed: 3, mode: 'explore' }); const gp = g.player;
  check('waygate: a new character has only discovered Haven', gp.visited.join() === 'town' && !!g.map.waygate);
  g.command({ type: 'travel', to: 'frost' }); g.step(CONFIG.TICK);
  check('waygate: cannot travel to a map you have not reached', g.map.id === 'town');
  g.loadMap('greenwood', 'town'); g.loadMap('fen', 'greenwood'); g.loadMap('town', 'greenwood');
  let opened = 0;
  gp.x = 0; gp.z = 0; g.command({ type: 'move', x: g.map.waygate.x, z: g.map.waygate.z });
  for (let i = 0; i < 60 * 5; i++) { g.step(CONFIG.TICK); for (const ev of g.events) if (ev.type === 'waygate') opened++; g.events.length = 0; }
  check('waygate: standing on it opens the travel list, once', opened === 1, opened + ' times');
  g.command({ type: 'travel', to: 'fen' }); g.step(CONFIG.TICK);
  const entry = g.map.portals[0];
  check('waygate: takes you to the entrance of a map you have reached', g.map.id === 'fen' && Math.hypot(gp.x - entry.x, gp.z - entry.z) < 8);
  const again = new World({ seed: 1, mode: 'explore', save: JSON.parse(JSON.stringify(g.toSave())) });
  check('waygate: discovered maps are saved', again.player.visited.includes('fen') && again.player.visited.includes('greenwood') && !again.player.visited.includes('ridge'));

  // A hero of the right level in ordinary gear can farm every map (a bot plays 90 seconds in each).
  const { farm } = await import('./balance.mjs');
  for (const id of Object.keys(MAPS)) {
    const m = MAPS[id];
    if (m.safe) continue;
    const level = Math.min(99, m.level + Math.round(m.levelSpan / 2));
    const o = farm({ cls: 'warrior', map: id, level, minutes: 1.5, rarity: 2, parrySkill: 0.6 });
    check(`balance: a level ${level} warrior can farm ${m.name}`, o.kills >= 8 && o.downs <= 1, `${o.kills} kills, knocked out ${o.downs}x, lowest health ${Math.round(o.minHp * 100)}%`);
  }
}
// --- Story: quests, signs, boss rewards -----------------------------------------
{
  const { QUESTS, QUEST_IDS, SIGNS, SIGN_IDS, NPCS, BOSS_LOOT } = await import('../src/sim/story.js');
  const { buildMap, MAP_IDS } = await import('../src/sim/maps.js');
  const step = (w, n = 1) => { for (let i = 0; i < n; i++) w.step(CONFIG.TICK); };
  // The data hangs together.
  check('story: every quest has a giver, a goal that exists and a reward', QUEST_IDS.every((id) => { const q = QUESTS[id]; const g = q.goal; return NPCS[q.giver] && q.offer && q.done && q.reward && (!q.after || QUESTS[q.after]) && (!g.enemy || DEFS.ENEMIES[g.enemy]) && (!g.boss || DEFS.ENEMIES[g.boss].boss) && (!g.map || MAPS[g.map]) && (!g.reach || MAPS[g.reach]) && (g.kill || g.reach || g.read || g.wave); }), QUEST_IDS.length + ' quests');
  check('story: a kill quest for a map names an enemy that lives there', QUEST_IDS.every((id) => { const g = QUESTS[id].goal; return !(g.enemy && g.map) || MAPS[g.map].roster[g.enemy]; }));
  check('story: every enemy a quest asks for lives on a map near the quest\'s level', QUEST_IDS.every((id) => { const q = QUESTS[id]; const g = q.goal; if (!g.enemy) return true; return Object.values(MAPS).some((m) => m.roster[g.enemy] && Math.abs(m.level - q.level) <= 12); }));
  check('story: two signs on every map (three in Haven), each somewhere you can stand', MAP_IDS.every((id) => { const m = buildMap(id); const signs = m.obstacles.filter((o) => o.kind === 'sign'); return signs.length === (id === 'town' ? 3 : 2) && signs.every((sg) => SIGNS[sg.id].map === id && Math.hypot(sg.x, sg.z) < m.radius - 2 && m.obstacles.every((o) => o === sg || Math.hypot(o.x - sg.x, o.z - sg.z) > o.r + sg.r + 0.5)); }), SIGN_IDS.length + ' signs');
  check('story: four people live in Haven', buildMap('town').obstacles.filter((o) => o.kind === 'npc').length === 4);

  const w = new World({ seed: 12, mode: 'explore' }); const p = w.player;
  check('quests: a new hero has work waiting with Elder Wren and nothing from the others yet at their level', w.npcMarker('wren') === 'available' && w.questOpen('road') && !w.questOpen('husks') && !w.questOpen('gate'));
  // Walk up to Wren and take the first quest.
  const wren = w.map.obstacles.find((o) => o.id === 'wren');
  check('talk: nobody is in reach from the middle of the plaza', w.interactable() === null);
  p.x = wren.x + 1.6; p.z = wren.z; step(w);
  check('talk: standing next to someone puts them in reach, and you cannot walk through them', w.interactable() && w.interactable().id === 'wren' && Math.hypot(p.x - wren.x, p.z - wren.z) >= wren.r + p.radius - 0.06);
  w.command({ type: 'acceptQuest', id: 'road' }); step(w);
  check('quests: accepted, and Wren shows a ? while it is in progress', w.questState('road') === 'active' && w.npcMarker('wren') === 'progress');
  w.loadMap('greenwood', 'town'); step(w);
  check('quests: walking into the map completes "The Road Out"', w.questState('road') === 'ready' && w.npcMarker('wren') === 'ready');
  const gold0 = p.gold, lvl0 = p.level, exp0 = p.exp;
  w.command({ type: 'claimQuest', id: 'road' }); step(w);
  check('quests: handing it in pays gold, EXP and gear', w.questState('road') === 'done' && p.gold > gold0 && (p.level > lvl0 || p.exp > exp0) && !!p.equipped.boots, `+${p.gold - gold0} gold, boots: ${p.equipped.boots && p.equipped.boots.name}`);
  w.command({ type: 'claimQuest', id: 'road' }); step(w);
  check('quests: a reward cannot be taken twice', p.quests.road.s === 'done' && w.questOpen('road') === false);
  check('quests: finishing one opens the next in the chain', w.questOpen('husks') && w.questOpen('scarf'));
  w.command({ type: 'acceptQuest', id: 'husks' }); w.command({ type: 'acceptQuest', id: 'scarf' }); step(w);
  let k = 0;
  for (let i = 0; i < 4000 && k < 12; i++) { const e = w.enemies.find((x) => x.type === 'grunt' && !x.dead); if (e) { w.hitEnemy(e, 1e9); k++; } step(w); }
  check('quests: kills count, only for the right enemy, and several quests at once', w.questState('husks') === 'ready' && w.questState('scarf') === 'ready', `${p.quests.husks.n}/12 and ${p.quests.scarf.n}/8`);
  const sp = w.enemies.find((x) => x.type === 'spitter'); const n0 = p.quests.husks.n; if (sp) w.hitEnemy(sp, 1e9); step(w);
  check('quests: other enemies do not count', p.quests.husks.n === n0);
  // Signs
  const sign = w.map.obstacles.find((o) => o.kind === 'sign');
  p.x = sign.x + 1.2; p.z = sign.z; step(w);
  check('signs: a sign in reach can be read once, and goes in the journal', (() => { const near = w.interactable(); w.command({ type: 'readSign', id: near.id }); step(w); w.command({ type: 'readSign', id: near.id }); step(w); return near.kind === 'sign' && p.signs.length === 1; })());
  w.command({ type: 'claimQuest', id: 'husks' }); step(w); w.command({ type: 'acceptQuest', id: 'stones' }); step(w);
  check('quests: "read 4 signs" starts with the ones already read', p.quests.stones.n === 1);
  for (const id of ['green2', 'fen1', 'fen2']) w.command({ type: 'readSign', id }); step(w);
  check('quests: reading enough signs completes it', w.questState('stones') === 'ready');
  const again = new World({ seed: 1, mode: 'explore', save: JSON.parse(JSON.stringify(w.toSave())) });
  check('story: quests and signs are saved', again.questState('road') === 'done' && again.questState('stones') === 'ready' && again.player.signs.length === 4 && again.questState('scarf') === 'ready');

  // Bosses out in the world pay for the time they take.
  for (const [map, type, lvl] of [['keep', 'boss', 40], ['hollow', 'boss2', 70], ['sanctum', 'boss3', 99]]) {
    const b = new World({ seed: 21, mode: 'explore', save: { v: 2, level: lvl } }); const bp = b.player;
    b.loadMap(map, MAPS[map].portals[0].to);
    const boss = b.enemies.find((e) => e.def.boss); const mob = b.enemies.find((e) => !e.def.boss);
    const before = { keys: bp.keys, gold: bp.gold, sp: bp.skillPoints, lv: bp.level };
    b.hitEnemy(boss, 1e12); step(b);
    const drops = b.loot.map((l) => l.item.rarity).sort((x, y) => y - x);
    const L = BOSS_LOOT[type];
    check(`boss: ${boss.def.name} drops ${L.items} items, ${L.keys} key(s) and a hoard of gold; first kill guarantees the top prize`, drops.length === L.items && drops[0] >= L.first && drops.every((r) => r >= L.min) && bp.keys === before.keys + L.keys && bp.gold - before.gold > mob.goldValue * 20 && bp.skillPoints >= before.sp + 2 && boss.expValue > mob.expValue * 15, `rarities ${drops.join(',')}; ${bp.gold - before.gold} gold vs ${mob.goldValue} from a ${mob.def.name}`);
    b.loot = []; const camp = b.camps.find((c) => c.def.type === type); camp.slots[0].timer = 0.01; step(b, 80);
    const boss2 = b.enemies.find((e) => e.def.boss); const sp1 = bp.skillPoints;
    if (boss2) { b.hitEnemy(boss2, 1e12); step(b); }
    check(`boss: ${boss.def.name} comes back, and later kills still pay but give no extra skill points`, !!boss2 && b.loot.length === L.items && bp.bossKills[type] === 2 && bp.skillPoints - sp1 <= (bp.level > before.lv ? 3 : 0));
  }
  {
    // The final quest: only the boss out in the world counts.
    const f = new World({ seed: 5, mode: 'explore', save: { v: 2, level: 100, quests: { stair: { s: 'done', n: 1 } } } });
    f.command({ type: 'acceptQuest', id: 'unmade' }); step(f);
    f.loadMap('sanctum', 'maw');
    f.hitEnemy(f.enemies.find((e) => e.type === 'boss3'), 1e12); step(f);
    const bag0 = f.player.bag.length + Object.values(f.player.equipped).filter(Boolean).length;
    f.command({ type: 'claimQuest', id: 'unmade' }); step(f);
    const got = [...f.player.bag, ...Object.values(f.player.equipped).filter(Boolean)].some((it) => it.rarity === 6);
    check('story: "Let Her Rest" pays an Immortal item, and "Come Home" can then be repeated', got && f.questState('unmade') === 'done' && f.questOpen('again') && f.player.bag.length + Object.values(f.player.equipped).filter(Boolean).length === bag0 + 1);
    f.command({ type: 'acceptQuest', id: 'again' }); step(f);
    const camp = f.camps.find((c) => c.def.type === 'boss3'); camp.slots[0].timer = 0.01; step(f, 80);
    f.hitEnemy(f.enemies.find((e) => e.type === 'boss3'), 1e12); step(f);
    f.command({ type: 'claimQuest', id: 'again' }); step(f);
    check('quests: a repeatable quest can be taken again after it is handed in', f.questState('again') === 'done' && f.questOpen('again'));
  }
}
{
  // The Echo Ring quests: taken in Haven, finished by clearing waves in the arena.
  const t = new World({ seed: 7, mode: 'explore', save: { v: 2, level: 8 } });
  t.command({ type: 'acceptQuest', id: 'ringglass' }); t.step(CONFIG.TICK);
  const carried = t.toSave();
  check('ring: Odile asks you to clear five waves in the Echo Ring', t.questState('ringglass') === 'active');
  const a = new World({ seed: 7, save: JSON.parse(JSON.stringify(carried)) });
  let ready = false;
  for (let n = 1; n <= 5; n++) { a.wave.n = n; a.questEvent('wave', n); if (n === 4) ready = a.questState('ringglass') === 'ready'; }
  check('ring: clearing wave 5 in the arena completes it (not wave 4)', !ready && a.questState('ringglass') === 'ready');
  const back = new World({ seed: 7, mode: 'explore', save: JSON.parse(JSON.stringify(a.toSave())) });
  const t0 = back.player.tickets;
  back.command({ type: 'claimQuest', id: 'ringglass' }); back.step(CONFIG.TICK);
  check('ring: handed in back in Haven, paying starglass shards', back.questState('ringglass') === 'done' && back.player.tickets === t0 + 2);
  const deep = new World({ seed: 7, mode: 'explore', save: { v: 2, level: 40, bestWave: 20, quests: { ringglass: { s: 'done', n: 1 } } } });
  deep.command({ type: 'acceptQuest', id: 'ringlast' }); deep.step(CONFIG.TICK);
  check('ring: a wave you already reached counts straight away', deep.questState('ringlast') === 'ready');
}
// --- Subclasses and talents -------------------------------------------------------
{
  const { SPECS, SPEC_IDS, specsFor, talentPointsAt, ROW_NEED } = await import('../src/sim/talents.js');
  const { defaultMods } = await import('../src/sim/augments.js');
  const { CLASS_IDS } = await import('../src/sim/classes.js');
  const { geared, farm } = await import('./balance.mjs');
  check('talents: every class has two subclasses', CLASS_IDS.every((c) => specsFor(c).length === 2), SPEC_IDS.join(', '));
  check('talents: every tree costs exactly the 22 points a level 100 hero has', SPEC_IDS.every((id) => SPECS[id].talents.reduce((n, t) => n + t.max, 0) === 22) && talentPointsAt(100) === 22 && talentPointsAt(15) === 0 && talentPointsAt(16) === 1);
  check('talents: every talent only touches modifiers that exist', SPEC_IDS.every((id) => SPECS[id].talents.every((t) => { const m = defaultMods(); const keys = Object.keys(m).length; t.apply(m, t.max); return Object.keys(m).length === keys && Object.values(m).every((v) => typeof v === 'boolean' || Number.isFinite(v)) && typeof t.desc(1) === 'string'; })));
  const w = new World({ seed: 3, cls: 'warrior', save: { v: 2, level: 14 } }); const p = w.player;
  w.command({ type: 'chooseSpec', id: 'berserker' }); w.step(CONFIG.TICK);
  check('talents: no subclass before level 15', p.spec === null);
  p.level = 40; w.recalcStats();
  w.command({ type: 'chooseSpec', id: 'assassin' }); w.step(CONFIG.TICK);
  check("talents: you cannot take another class's subclass", p.spec === null);
  w.command({ type: 'chooseSpec', id: 'berserker' }); w.step(CONFIG.TICK);
  check('talents: a level 40 warrior becomes a Berserker with 7 points', p.spec === 'berserker' && w.talentPoints() === 7);
  w.command({ type: 'talent', id: 'bz_cap' }); w.command({ type: 'talent', id: 'bz_whirl' }); w.step(CONFIG.TICK);
  check('talents: later rows are locked until enough points are spent', !p.talents.bz_cap && !p.talents.bz_whirl);
  const as0 = p.stats.as;
  for (let i = 0; i < 6; i++) w.command({ type: 'talent', id: 'bz_haste' }); w.step(CONFIG.TICK);
  check('talents: ranks stop at the maximum and change the hero', p.talents.bz_haste === 5 && p.stats.as > as0 * 1.1 && w.talentPoints() === 2, `${as0.toFixed(2)} -> ${p.stats.as.toFixed(2)} attacks per second`);
  const cd0 = w.abilityCooldown('w');
  w.command({ type: 'talent', id: 'bz_whirl' }); w.command({ type: 'talent', id: 'bz_whirl' }); w.command({ type: 'talent', id: 'bz_whirl' }); w.step(CONFIG.TICK);
  check('talents: the second row opens after 5 points; you cannot overspend', p.talents.bz_whirl === 2 && w.talentPoints() === 0 && w.abilityCooldown('w') < cd0);
  const again = new World({ seed: 1, cls: 'warrior', save: JSON.parse(JSON.stringify(w.toSave())) });
  check('talents: saved with the character', again.player.spec === 'berserker' && again.player.talents.bz_haste === 5 && Math.abs(again.player.stats.as - p.stats.as) < 1e-9);
  p.gold = 0; w.command({ type: 'respec' }); w.step(CONFIG.TICK);
  const broke = p.spec === 'berserker';
  p.gold = 1e6; w.command({ type: 'respec' }); w.step(CONFIG.TICK);
  check('talents: starting over costs gold and gives every point back', broke && p.spec === null && w.talentsSpent() === 0 && p.gold === 1e6 - w.respecCost() && Math.abs(p.stats.as - as0) < 1e-9);
  // A full tree makes a hero stronger, but not out of all proportion; and both trees of a class are worth having.
  for (const cls of CLASS_IDS) {
    const base = farm({ cls, map: 'spire', level: 75, minutes: 3, rarity: 2, parrySkill: 0.6 });
    const out = [`none ${base.kills}`];
    let ok = true;
    for (const id of specsFor(cls)) {
      const save = geared(cls, 100, 2); save.level = 75; save.spec = id; save.talents = {};
      for (const t of SPECS[id].talents) save.talents[t.id] = t.max; // a level 75 hero with a level 100 tree: the most a tree can do
      const o = farm({ cls, map: 'spire', level: 75, minutes: 3, rarity: 2, parrySkill: 0.6, save });
      out.push(`${SPECS[id].name} ${o.kills}`);
      if (o.kills < base.kills * 0.9 || o.kills > base.kills * 2) ok = false;
    }
    check(`talents: ${cls} subclasses help without breaking the game (kills in 3 minutes)`, ok, out.join(', '));
  }
}
// --- Level gap and crit overflow ---------------------------------------------------
{
  const w = new World({ seed: 4, save: { v: 2, level: 30 } }); const p = w.player;
  const g = (lv) => w.gapScale(lv);
  check('gap: an enemy of your level is normal', g(30).taken === 1 && g(30).dealt === 1);
  check('gap: enemies above you hit harder and take less', g(40).taken > 1.6 && g(40).dealt < 0.6 && g(60).taken === 1 + CONFIG.GAP_DMG_TAKEN_UP_MAX && g(60).dealt === CONFIG.GAP_DMG_DEALT_UP_MIN, JSON.stringify(g(40)));
  check('gap: enemies below you hit softer and take more', g(20).taken < 0.7 && g(20).dealt > 1.15 && g(1).taken === CONFIG.GAP_DMG_TAKEN_DOWN_MIN && g(1).dealt === CONFIG.GAP_DMG_DEALT_DOWN_MAX, JSON.stringify(g(20)));
  w.wave.phase = 'explore';
  const e = w.spawnEnemy('grunt', { x: 5, z: 0, level: 40 }); e.maxHp = e.hp = 1e9;
  const hp0 = e.hp; w.hitEnemy(e, 1000, { canCrit: false });
  check('gap: hitting a level 40 enemy at level 30 does half damage', Math.round(hp0 - e.hp) === 500, String(hp0 - e.hp));
  p.hp = p.stats.maxHp; const before = p.hp; w.hitPlayer(100, { parryable: false, src: e });
  const plain = Math.round(100 * CONFIG.ENEMY_DMG * (100 / (100 + p.stats.armor)));
  check('gap: and it hits about twice as hard (2.05x at +10)', Math.abs(before - p.hp - Math.round(plain * 2.05)) <= 1, `${before - p.hp} vs ${plain}`);
  check('gap: +20 levels is close to 4x, and it tops out at 5x', Math.abs(g(50).taken - 3.8) < 0.01 && g(57).taken === 5, JSON.stringify([g(50), g(57)]));
  const base = w.critMultiplier();
  p.stats.crit = 140;
  check('crit: chance over 100% becomes crit damage', p.stats.crit === 140 && Math.abs(w.critMultiplier() - base - 0.4) < 1e-9, `${base} -> ${w.critMultiplier()}`);
}
// --- Party (co-op exploration) -----------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const w = new World({ seed: 3, mode: 'explore', save: geared('warrior', 25, 2) });
  const solo = w.player;
  w.addHero(1, { save: geared('mage', 24, 2), name: 'Mia' });
  w.addHero(2, { cls: 'rogue', name: 'Rex' }); // a brand-new character
  check('party: friends join with their own heroes', w.heroes.length === 3 && w.party && w.heroByPid(1).cls === 'mage' && w.heroByPid(2).player.level === 1 && !!w.heroByPid(2).player.equipped.weapon);
  check('party: the host is still the acting hero afterwards', w.player === solo && w.cls === 'warrior');
  w.loadMap('ridge', 'fen');
  check('party: a map change takes everyone, arriving together', w.heroes.every((h) => Math.hypot(h.player.x - solo.x, h.player.z - solo.z) < 4) && w.heroes.every((h) => h.player.visited.includes('ridge')));
  // A friend's command moves only that friend.
  const mia = w.heroByPid(1).player;
  const x0 = mia.x, sx = solo.x;
  w.command({ type: 'move', x: mia.x + 5, z: mia.z, pid: 1 });
  for (let i = 0; i < 60; i++) w.step(CONFIG.TICK);
  check("party: commands move only the hero they belong to", mia.x > x0 + 2 && Math.abs(solo.x - sx) < 0.5);
  // A kill near everyone pays everyone, each with their own loot.
  const e = w.enemies.find((x) => !x.def.boss);
  e.x = solo.x + 2; e.z = solo.z;
  for (const h of w.heroes) { h.player.x = solo.x; h.player.z = solo.z + h.pid; }
  const before = w.heroes.map((h) => ({ exp: h.player.exp, gold: h.player.gold, lv: h.player.level }));
  const drops0 = w.loot.length;
  w.as(w.heroByPid(1), () => w.hitEnemy(e, 1e12));
  const paid = w.heroes.every((h, i) => h.player.gold > before[i].gold && (h.player.exp > before[i].exp || h.player.level > before[i].lv));
  check('party: everyone nearby gets gold and EXP for a kill', paid);
  check('party: loot belongs to one hero and only they can take it', w.loot.slice(drops0).every((l) => l.owner !== undefined));
  // Projectiles and damage are owned.
  w.projectiles = [];
  w.heroByPid(1).player.cd.q = 0;
  w.command({ type: 'cast', slot: 'q', x: mia.x + 5, z: mia.z, pid: 1 });
  w.runCommands();
  const mine = w.projectiles.filter((pr) => pr.owner !== 'enemy');
  check('party: a friend\'s spell is marked as theirs', mine.length > 0 && mine.every((pr) => pr.pid === 1), mine.length + ' shots');
  // Knocked out in a party: back at the entrance, not in town.
  w.as(w.heroByPid(2), (p) => w.hitPlayer(1e9, { parryable: false }));
  check('party: a knocked-out friend is down', w.heroByPid(2).player.dead);
  for (let i = 0; i < 60 * 8; i++) { for (const h of w.heroes) if (h.pid !== 2) h.player.hp = h.player.stats.maxHp; w.step(CONFIG.TICK); }
  check('party: ...and gets back up on the same map', !w.heroByPid(2).player.dead && w.map.id === 'ridge');
  // Everyone down: the party wakes up in Haven.
  for (const h of w.heroes) w.as(h, () => w.hitPlayer(1e9, { parryable: false }));
  for (let i = 0; i < 60 * 10; i++) w.step(CONFIG.TICK);
  check('party: if everyone falls, the party wakes up in Haven', w.map.id === 'town' && w.heroes.every((h) => !h.player.dead));
  // Leaving
  w.removeHero(1);
  check('party: a friend can leave', w.heroes.length === 2 && !w.heroByPid(1));
  const save1 = w.as(w.heroByPid(2), () => w.toSave());
  check('party: a friend\'s save is their own character', save1.cls === 'rogue' && save1.visited.includes('ridge'));
  // 30 seconds of three bots fighting together never breaks the world.
  const w2 = new World({ seed: 9, mode: 'explore', save: geared('archer', 45, 2) });
  w2.addHero(1, { save: geared('warrior', 45, 2), name: 'A' });
  w2.addHero(2, { save: geared('mage', 45, 2), name: 'B' });
  w2.loadMap('frost', 'keep');
  let ok = true;
  for (let i = 0; i < 60 * 30; i++) {
    for (const h of w2.heroes) {
      const p = h.player;
      const near = w2.enemies.reduce((b, x) => (!b || Math.hypot(x.x - p.x, x.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? x : b), null);
      if (near && i % 30 === h.pid) w2.command({ type: 'attack', id: near.id, pid: h.pid });
      if (near && i % 120 === h.pid * 5) w2.command({ type: 'cast', slot: ['q', 'w', 'e', 'r'][(i / 120) % 4 | 0], x: near.x, z: near.z, pid: h.pid });
    }
    w2.step(CONFIG.TICK);
    w2.events.length = 0;
    if (!w2.heroes.every((h) => Number.isFinite(h.player.x) && Number.isFinite(h.player.hp)) || w2.cur !== w2.heroes[0]) ok = false;
  }
  check('party: half a minute of three heroes fighting stays sound', ok && w2.player === w2.heroes[0].player);
}
// --- 0.17: lifesteal rules, Frozen Orb, Battle Rhythm, Berserker, Bulwark ----------
{
  const { geared } = await import('./balance.mjs');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  const setup = (cls, spec = null, talents = {}) => {
    const w = new World({ seed: 11, cls, save: Object.assign(geared(cls, 30, 2), { spec, talents }) });
    const p = w.player; w.wave.phase = 'explore';
    w.recalcStats(); p.hp = p.stats.maxHp; p.x = p.px = 0; p.z = p.pz = 0;
    for (const k of ['q', 'w', 'e', 'r']) p.cd[k] = 0;
    w.enemies = []; w.events.length = 0;
    return { w, p };
  };
  const dummy = (w, x, z = 0, type = 'grunt') => { const e = w.spawnEnemy(type, { x, z, level: w.player.level }); e.state = 'recover'; e.t = 999; e.hp = e.maxHp = 1e9; e.x = e.px = x; e.z = e.pz = z; return e; };

  // Lifesteal: capped, full from basic attacks, a third from abilities, none from damage over time.
  {
    const { w, p } = setup('warrior');
    const e = dummy(w, 3);
    p.stats.lifesteal = 60;
    const heal = (opts) => { p.hp = 1; w.hitEnemy(e, 1000, Object.assign({ canCrit: false }, opts)); return Math.round(p.hp - 1); };
    check('lifesteal: capped at 25%', heal({ basic: true }) === 250, String(heal({ basic: true })));
    check('lifesteal: abilities heal a third as much', Math.abs(heal({}) - 250 * CONFIG.ABILITY_LIFESTEAL) <= 1, String(heal({})));
    check('lifesteal: damage over time does not heal', heal({ dot: true }) === 0);
  }
  // Frozen Orb
  {
    const { w, p } = setup('mage');
    const mid = dummy(w, 4, 0.5), end = dummy(w, 8.4), off = dummy(w, 4, 6);
    w.command({ type: 'cast', slot: 'w', x: 8, z: 0 }); w.runCommands();
    const orb = w.projectiles.find((pr) => pr.kind === 'orb');
    check('Frozen Orb: casting sends out a slow orb', !!orb && orb.speed < 10);
    run(w, 0.55);
    check('Frozen Orb: shards cut and chill what it passes', mid.hp < 1e9 && mid.slowT > 0 && off.hp === 1e9 && end.hp === 1e9);
    run(w, 0.6);
    const shattered = w.events.some((ev) => ev.type === 'shatter' && Math.abs(ev.x - 8) < 0.6);
    check('Frozen Orb: it shatters at the cursor, hitting what is there', shattered && !w.projectiles.some((pr) => pr.kind === 'orb') && end.hp < 1e9 && end.slowT > 2);
    const big = 1e9 - end.hp, small = (1e9 - mid.hp);
    check('Frozen Orb: the shatter is the big hit', big > w.abilityDamage('w') * 0.5, `${Math.round(big)} vs shards ${Math.round(small)}`);
    p.cd.w = 0; w.events.length = 0;
    w.command({ type: 'cast', slot: 'w', x: 12, z: 0 }); w.runCommands(); run(w, 0.2);
    w.command({ type: 'cast', slot: 'w', x: 12, z: 0 }); w.runCommands();
    const early = w.events.find((ev) => ev.type === 'shatter');
    check('Frozen Orb: casting again shatters it early, where it is', !!early && early.x < 4 && p.cd.w > 2, early ? early.x.toFixed(1) : 'no shatter');
  }
  // Warrior passive: Battle Rhythm
  {
    const { w, p } = setup('warrior');
    for (let i = 0; i < 6; i++) dummy(w, 2, -1 + i * 0.4);
    p.cd.r = 30; p.cd.e = 5;
    w.command({ type: 'cast', slot: 'q', x: 3, z: 0 }); w.runCommands();
    check('Battle Rhythm: a Cleave into a crowd takes 1.5 s off the other cooldowns', Math.abs(p.cd.r - 28.5) < 0.01 && Math.abs(p.cd.e - 3.5) < 0.01, `${p.cd.r} ${p.cd.e}`);
    const { w: w1, p: p1 } = setup('warrior');
    dummy(w1, 2); p1.cd.r = 30;
    w1.command({ type: 'cast', slot: 'q', x: 3, z: 0 }); w1.runCommands();
    check('Battle Rhythm: one enemy, 0.3 s', Math.abs(p1.cd.r - 29.7) < 0.01, String(p1.cd.r));
  }
  // Berserker: Blood Rage
  {
    const { w, p } = setup('warrior', 'berserker');
    dummy(w, 2);
    const max = p.stats.maxHp;
    w.command({ type: 'cast', slot: 'q', x: 3, z: 0 }); w.runCommands();
    const cost = w.events.find((ev) => ev.type === 'bloodCost');
    check('Berserker: Cleave costs 4% of maximum health', !!cost && Math.abs(cost.amount - max * 0.04) <= 1, cost ? String(cost.amount) : 'none');
    const as0 = p.stats.as;
    p.hp = max * 0.45; w.step(CONFIG.TICK);
    check('Berserker: below half health you are Bloodied, attacking 20% faster', p.bloodied && Math.abs(p.stats.as / as0 - (1 + 0.2 / (as0 / (1.05 * 1.2) - 0))) < 1 || (p.bloodied && p.stats.as > as0 * 1.1), `${as0.toFixed(2)} -> ${p.stats.as.toFixed(2)}`);
    const e = dummy(w, 2.5);
    const dealt = (hp) => { p.hp = hp; e.hp = 1e9; w.hitEnemy(e, 1000, { canCrit: false }); return 1e9 - e.hp; };
    check('Berserker: and deal 15% more damage', dealt(max * 0.45) === Math.round(dealt(max) * 1.15), `${dealt(max * 0.45)} vs ${dealt(max)}`);
    p.hp = max * 0.11; p.cd.q = 0;
    w.command({ type: 'cast', slot: 'q', x: 3, z: 0 }); w.runCommands();
    check('Berserker: the health cost never takes you below 10%', p.hp >= max * 0.1 - 0.01 && !p.dead);
    p.hp = max; w.step(CONFIG.TICK);
    check('Berserker: healing back over half ends Bloodied', !p.bloodied && Math.abs(p.stats.as - as0) < 1e-9);
    const { w: w2, p: p2 } = setup('warrior', 'bulwark');
    dummy(w2, 2); const hp2 = p2.hp;
    w2.command({ type: 'cast', slot: 'q', x: 3, z: 0 }); w2.runCommands();
    check('Bulwark pays nothing for Cleave', p2.hp === hp2);
  }
  // Bulwark: Undertow, Gravity Well, Shield Wall, Bastion
  {
    const { w, p } = setup('warrior', 'bulwark');
    const e = dummy(w, 4), brute = dummy(w, -3.9, 0, 'brute');
    w.command({ type: 'cast', slot: 'w', x: 0, z: 0 }); w.runCommands();
    check('Bulwark: Whirlwind stuns normal enemies and taunts what it hits', e.state === 'stunned' && e.tauntT > 2 && brute.tauntT > 2 && brute.state !== 'stunned');
    run(w, 0.4);
    check('Bulwark: ...and drags them to you instead of pushing them away', e.x < 2.4 && e.x > 0.5, e.x.toFixed(2));
    check('Bulwark: heavy enemies stay put without Gravity Well', Math.abs(brute.x + 3.9) < 0.3, brute.x.toFixed(2));
    const { w: w2 } = setup('warrior', 'bulwark', { bw_armor: 5, bw_tide: 1 });
    const b2 = dummy(w2, -4.2, 0, 'brute');
    w2.command({ type: 'cast', slot: 'w', x: 0, z: 0 }); w2.runCommands();
    run(w2, 0.4);
    check('Bulwark Gravity Well: drags and stuns heavy enemies too', b2.x > -3.4 && b2.stunT > 0, b2.x.toFixed(2));
    const old = new World({ seed: 2, cls: 'warrior', save: Object.assign(geared('warrior', 40, 1), { spec: 'bulwark', talents: { bw_riposte: 2, bw_mirror: 1 } }) });
    check('talents from before the Bulwark rework keep their points', old.player.talents.bw_wall === 2 && old.player.talents.bw_tide === 1 && old.talentsSpent() === 3);
    // In a party: the Bulwark parries for a friend standing close, and taunted enemies go for it.
    const pw = new World({ seed: 5, mode: 'explore', save: Object.assign(geared('warrior', 40, 2), { spec: 'bulwark', talents: { bw_armor: 5, bw_wall: 3, bw_vigor: 5, bw_guard: 2, bw_cap: 1 } }) });
    pw.addHero(1, { save: geared('mage', 40, 2), name: 'Mia' });
    const host = pw.player, mia = pw.heroByPid(1).player;
    host.x = 0; host.z = 0; mia.x = 3; mia.z = 0;
    const foe = pw.spawnEnemy('grunt', { x: 6, z: 0, level: 40 });
    const hit = () => { mia.hp = mia.stats.maxHp; return pw.as(pw.heroByPid(1), () => pw.hitPlayer(200, { parryable: true, src: foe })); };
    host.parryT = 0;
    const r0 = hit(), lost0 = mia.stats.maxHp - mia.hp;
    host.parryT = 0.3; host.parryAge = 0;
    const r1 = hit(), lost1 = mia.stats.maxHp - mia.hp;
    check('Bulwark Shield Wall: a parry also catches hits aimed at a friend close by', r0 === 'hit' && lost0 > 0 && r1 === 'parried' && lost1 === 0, `${r0}/${lost0} ${r1}/${lost1}`);
    mia.x = 9; host.parryT = 0.3;
    check('Bulwark Shield Wall: ...but not one too far away', hit() === 'hit');
    mia.x = 3; mia.hp = mia.stats.maxHp * 0.5; host.parryT = 0.3; host.parryAge = 0;
    pw.as(pw.heroByPid(1), () => pw.hitPlayer(200, { parryable: true, src: foe }));
    check('Bulwark Bastion: a perfect parry heals friends nearby too', mia.hp > mia.stats.maxHp * 0.5 + 1);
    foe.tauntT = 3; foe.tauntPid = 1; foe.x = 0.5;
    check('a taunted enemy goes for whoever taunted it', pw.targetFor(foe).pid === 1);
    foe.tauntT = 0;
    check('...and back to the nearest hero when it wears off', pw.targetFor(foe).pid === 0);
  }
}
// --- 0.18: Shadowdancer (shadows, Razor Shuriken, Death Mark) ------------------------
{
  const { geared } = await import('./balance.mjs');
  const { CLASSES } = await import('../src/sim/classes.js');
  const { makeSnapshot } = await import('../src/net/sync.js');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  const setup = (talents = {}, spec = 'shadowdancer') => {
    const w = new World({ seed: 12, cls: 'rogue', save: Object.assign(geared('rogue', 60, 2), { spec, talents }) });
    const p = w.player; w.wave.phase = 'explore';
    w.recalcStats(); p.hp = p.stats.maxHp; p.x = p.px = 0; p.z = p.pz = 0;
    for (const k of ['q', 'w', 'e', 'r']) p.cd[k] = 0;
    w.enemies = []; w.events.length = 0;
    return { w, p };
  };
  const dummy = (w, x, z = 0) => { const e = w.spawnEnemy('grunt', { x, z, level: w.player.level }); e.state = 'recover'; e.t = 999; e.hp = e.maxHp = 1e9; e.x = e.px = x; e.z = e.pz = z; e.facing = Math.PI; return e; };
  const cast = (w, slot, x, z) => { w.command({ type: 'cast', slot, x, z }); w.runCommands(); };

  const { w, p } = setup();
  check('Shadowdancer: W becomes Starglass Kunai', w.kit.w.name === 'Starglass Kunai' && CLASSES.rogue.abilities.w.name === 'Fan of Knives');
  check('Last Rites (no more League names on the Rogue R)', CLASSES.rogue.abilities.r.name === 'Last Rites');
  check('Assassin keeps Fan of Knives', setup({}, 'assassin').w.kit.w.name === 'Fan of Knives');
  // Shadowstep leaves a Shadow; E again swaps with it, once.
  cast(w, 'e', 7, 0); run(w, 0.3);
  const sh = w.shadows.find((x) => x.src === 'e');
  check('Shadowstep leaves a Shadow where you stood', !!sh && Math.hypot(sh.x, sh.z) < 0.5 && p.x > 5, sh ? `${sh.x.toFixed(1)}, hero at ${p.x.toFixed(1)}` : 'none');
  const hx = p.x;
  cast(w, 'e', 7, 0);
  check('E again swaps places with the Shadow', Math.hypot(p.x, p.z) < 0.5 && Math.abs(sh.x - hx) < 0.01 && sh.swapped && w.events.some((ev) => ev.type === 'shadowSwap'));
  cast(w, 'e', 7, 0);
  check('...only once per Shadow (then E is just on cooldown)', Math.hypot(p.x, p.z) < 0.5 && !p.dash);
  // Kunai: one from you, one from the afterimage, both at the cursor. Each stops in the first enemy;
  // a second kunai on the same enemy deals 60%.
  const a = dummy(w, 3, 0), b = dummy(w, 6, 0);
  sh.x = 4.5; sh.z = 6; // an afterimage off to the side, so its throw comes at b from another angle
  w.events.length = 0;
  p.stats.crit = 0; // no crits, so the numbers can be compared
  cast(w, 'w', 6, 0);
  const ku = w.projectiles.filter((pr) => pr.kind === 'kunai');
  check('Starglass Kunai: one from you and one from each afterimage', ku.length === 2, String(ku.length));
  run(w, 0.8);
  // (only the kunai hits: the rogue also auto-attacks the dummy next to it)
  const dmgs = (e) => w.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy' && ev.id === e.id && !ev.basic).map((ev) => ev.amount);
  check('Starglass Kunai: yours stops in the first enemy in its path', dmgs(a).length === 1 && dmgs(b).length === 1, `${dmgs(a)} / ${dmgs(b)}`);
  a.x = a.px = 40; w.events.length = 0; p.cd.w = 0;
  run(w, 0.2);
  cast(w, 'w', 6, 0); run(w, 0.8);
  const db = dmgs(b);
  check('Starglass Kunai: with the way clear, both land and the second deals 60%', db.length === 2 && Math.abs(db[1] / db[0] - 0.6) < 0.01, `${db}`);
  run(w, 5);
  check('Shadows fade after 5 seconds', w.shadows.length === 0);
  // Marked for Death
  {
    const { w: w2, p: p2 } = setup({ sd_fleet: 5, sd_bleed: 3 });
    const e = dummy(w2, 3);
    cast(w2, 'r', 3, 0); run(w2, 0.3);
    check('Marked for Death: Death Mark marks its target', e.markT > 2 && e.markAcc > 0);
    for (let i = 0; i < 5; i++) w2.hitEnemy(e, 1000, { canCrit: false, source: 'basic', basic: true });
    w2.events.length = 0;
    let acc = 0, pop = null;
    for (let i = 0; i < 200 && !pop; i++) { acc = e.markAcc; w2.step(CONFIG.TICK); pop = w2.events.find((ev) => ev.type === 'markPop'); }
    check('Marked for Death: 3 seconds later it takes 35% of everything again', !!pop && Math.abs(pop.amount - acc * 0.35) <= 2 && e.markT <= 0, pop ? `${pop.amount} of ${Math.round(acc)}` : 'no pop');
  }
  // Shadow Slash and Lord of Shadows
  {
    const { w: w3, p: p3 } = setup({ sd_fleet: 5, sd_fan: 3, sd_bleed: 3, sd_hands: 1, sd_cap: 1 });
    const e1 = dummy(w3, 2), e2 = dummy(w3, -8, 5);
    w3.addShadow('e', -7, 4, 0);
    w3.events.length = 0;
    cast(w3, 'q', 2, 0);
    check('Shadow Slash: a Backstab is copied by your Shadow on the enemy nearest it', e2.hp < 1e9 && w3.events.some((ev) => ev.type === 'shadowSlash'));
    run(w3, 0.2); // let Backstab's cast finish
    p3.x = -3; p3.z = 0;
    cast(w3, 'r', 2, 0);
    check('Lord of Shadows: Death Mark leaves a Shadow where you leapt from', w3.shadows.some((x) => x.src === 'r' && Math.abs(x.x + 3) < 0.5));
    check('Lord of Shadows: the mark repeats 50%, and Shadowstep comes back sooner', Math.abs(w3.mods.rMark - 0.5) < 1e-9 && w3.mods.eCd < 1);
    const w4 = new World({ seed: 3, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 30, 2), { spec: 'shadowdancer' }) });
    w4.addShadow('e', 1, 1, 0);
    const snap = makeSnapshot(w4, 0, {});
    check('Shadows are sent to friends in co-op', snap.shadows.length === 1 && snap.shadows[0].src === 'e');
  }
}
// --- 0.19: Shadowstep empowers abilities, Immortal effects that fit each class ----------
{
  const { geared } = await import('./balance.mjs');
  const { effectFor, itemName } = await import('../src/sim/items.js');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  const setup = (cls, effects = [], spec = null) => {
    const save = Object.assign(geared(cls, 40, 2), spec ? { spec } : {});
    for (const fx of effects) save.equipped[effectFor(fx).slot] = { id: 'imm-' + fx, name: 'x', slot: effectFor(fx).slot, rarity: 6, ilvl: 40, stats: { ad: 1 }, plus: 0, effect: fx, cls: effectFor(fx).slot === 'weapon' ? cls : undefined };
    const w = new World({ seed: 21, cls, save });
    const p = w.player; w.wave.phase = 'explore';
    w.recalcStats(); p.hp = p.stats.maxHp; p.x = p.px = 0; p.z = p.pz = 0;
    for (const k of ['q', 'w', 'e', 'r']) p.cd[k] = 0;
    w.enemies = []; w.events.length = 0;
    return { w, p };
  };
  const dummy = (w, x, z = 0, type = 'grunt') => { const e = w.spawnEnemy(type, { x, z, level: w.player.level }); e.state = 'recover'; e.t = 999; e.hp = e.maxHp = 1e9; e.x = e.px = x; e.z = e.pz = z; e.facing = 0; return e; };
  const cast = (w, slot, x, z) => { w.command({ type: 'cast', slot, x, z }); w.runCommands(); };
  const dealt = (w, id, src) => w.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy' && ev.id === id && !ev.basic).map((ev) => ev.amount);

  // Shadowstep: the next ability, not the next basic attack.
  {
    const { w, p } = setup('rogue');
    p.stats.crit = 0;
    const e = dummy(w, 2);
    cast(w, 'q', 2, 0); const plain = dealt(w, e.id)[0];
    run(w, 0.3); w.events.length = 0; p.cd.q = 0; p.stats.crit = 0;
    cast(w, 'e', -6, 0); run(w, 0.3); p.x = 0; p.z = 0;
    check('Shadowstep empowers the next ability (the button bar glows)', p.empowerT > 0);
    p.stats.crit = 0; e.facing = 0; // (the dummy turned to watch the rogue; face it away again, as for the first stab)
    cast(w, 'q', 2, 0);
    const boosted = dealt(w, e.id)[0];
    check('Shadowstep: that ability deals 35% more', Math.abs(boosted / plain - 1.35) < 0.02 && p.empowerT === 0, `${plain} -> ${boosted}`);
  }
  // Names follow the class.
  {
    const names = ['warrior', 'archer', 'rogue', 'mage'].map((c) => effectFor('stormcaller', c).itemName);
    check('Immortal weapons have a name per class', new Set(names).size === 4 && names.includes('Nightfang') && names.includes('Wishfall'), names.join(', '));
    check('an old Stormcaller dagger is called Nightfang now', itemName({ name: 'Stormcaller', effect: 'stormcaller', cls: 'rogue', plus: 2 }) === 'Nightfang +2');
  }
  // Weapons
  {
    const { w, p } = setup('warrior', ['stormcaller']);
    for (let i = 0; i < 3; i++) dummy(w, 2, -0.8 + i * 0.8);
    const t = w.enemies[0];
    for (let i = 0; i < 8; i++) w.basicAttack(t);
    check('Stormcaller (Warrior): basic attacks no longer call lightning', !w.events.some((ev) => ev.type === 'lightning'));
    cast(w, 'q', 3, 0);
    check('Stormcaller (Warrior): Cleave calls lightning on every enemy it hits', w.events.filter((ev) => ev.type === 'lightning' && ev.small).length === 3);
  }
  {
    const { w } = setup('archer', ['stormcaller']);
    const t = dummy(w, 6);
    for (let i = 0; i < 4; i++) w.basicAttack(t);
    check('Stormstring (Archer): every 4th basic attack still calls lightning', w.events.filter((ev) => ev.type === 'lightning').length === 1);
  }
  {
    const { w, p } = setup('rogue', ['stormcaller']);
    const e = dummy(w, 2);
    p.cd.e = 5;
    const plainCrit = Math.round(w.abilityDamage('q') * w.critMultiplier() * w.gapScale(e.level).dealt);
    w.hitEnemy(e, w.abilityDamage('q'), { source: 'q', forceCrit: true });
    const got = dealt(w, e.id)[0];
    check('Nightfang (Rogue): ability crits deal 40% more and take 1 s off Shadowstep', Math.abs(got / plainCrit - 1.4) < 0.01 && Math.abs(p.cd.e - 4) < 1e-9, `${plainCrit} -> ${got}, E ${p.cd.e}`);
    w.events.length = 0;
    w.hitEnemy(e, 100, { basic: true, source: 'basic', forceCrit: true });
    check('Nightfang: basic attack crits are not boosted', Math.abs(w.events.find((ev) => ev.type === 'damage').amount - Math.round(100 * w.critMultiplier())) <= 1);
  }
  {
    const { w, p } = setup('mage', ['stormcaller']);
    dummy(w, 6);
    for (const k of ['q', 'q', 'q']) { p.cd.q = 0; p.castLock = 0; cast(w, k, 6, 0); }
    const star = w.delayed.find((d) => d.fx === 'starfall');
    run(w, 0.6);
    check('Wishfall (Mage): every third ability calls down a star shard on the cursor', !!star && Math.abs(star.x - 6) < 0.5 && w.events.some((ev) => ev.type === 'impact' && ev.kind === 'starfall'));
  }
  // Helm, chest, boots, ring
  {
    const { w, p } = setup('rogue', ['undying']);
    p.cd.e = 9;
    w.hitPlayer(1e9, { parryable: false });
    check('Crown of the Undying: saves you and readies your escape', !p.dead && p.cd.e === 0 && p.undyingUsed);
    run(w, 121);
    check('Crown of the Undying: ready again 2 minutes later', !p.undyingUsed);
  }
  {
    const { w, p } = setup('mage', ['retribution']);
    const e = dummy(w, 9);
    p.parryT = 0.3; p.parryAge = 0;
    w.hitPlayer(50, { parryable: true, src: e });
    check('Aegis of Retribution (ranged): a parry shoots starlight at the nearest enemy', w.events.some((ev) => ev.type === 'starBolt') && e.hp < 1e9);
    const { w: w2, p: p2 } = setup('warrior', ['retribution']);
    const e2 = dummy(w2, 2);
    p2.parryT = 0.3; p2.parryAge = 0;
    w2.hitPlayer(50, { parryable: true, src: e2 });
    check('Aegis of Retribution (melee): still a shockwave around you', w2.events.some((ev) => ev.type === 'impact' && ev.kind === 'retribution'));
  }
  {
    const { w, p } = setup('rogue', ['slipstream']);
    const as0 = p.stats.as;
    w.triggerSlipstream();
    p.cd.q = 4; run(w, 1);
    check('Slipstream (Rogue): cooldowns run 60% faster instead of attack speed', Math.abs(p.cd.q - (4 - 1.6)) < 0.05 && Math.abs(p.stats.as - as0) < 1e-9, `${p.cd.q.toFixed(2)} as ${as0.toFixed(2)}->${p.stats.as.toFixed(2)}`);
    const { w: w2, p: p2 } = setup('archer', ['slipstream']);
    const a0 = p2.stats.as; w2.triggerSlipstream();
    check('Slipstream (Archer): still attack speed', p2.stats.as > a0 * 1.1, `${a0.toFixed(2)} -> ${p2.stats.as.toFixed(2)}`);
  }
  {
    const { w, p } = setup('rogue', ['timekeeper']);
    const boss = dummy(w, 3, 0, 'boss'); boss.hp = boss.maxHp = 10000;
    p.cd.r = 20;
    w.hitEnemy(boss, 800 / w.gapScale(boss.level).dealt, { canCrit: false, source: 'q' });
    check('The Timekeeper: every 4% of a boss\'s health takes 0.5 s off cooldowns', Math.abs(p.cd.r - 19) < 0.01, String(p.cd.r));
  }
}
// --- Music: the songs are data, so check every bar adds up and every note is playable ---
{
  const { SONGS, MAP_SONG, arrange, parseBar, BAR } = await import('../src/music/songs.js');
  const { MAPS } = await import('../src/sim/maps.js');
  const known = new Set(['flute', 'oboe', 'brass', 'square', 'strings', 'organ', 'harp', 'bell', 'stab', 'bass', 'kick', 'snare', 'hat', 'timp']);
  for (const id in SONGS) {
    const song = SONGS[id];
    let ok = true, why = '';
    try {
      const a = arrange(song);
      const lead = a.events.filter((ev) => ev.inst === song.style.lead);
      if (a.steps !== song.melody.length * BAR) { ok = false; why = 'wrong length'; }
      if (a.events.some((ev) => !known.has(ev.inst))) { ok = false; why = 'unknown instrument'; }
      if (lead.some((ev) => ev.midi < 55 || ev.midi > 90)) { ok = false; why = 'melody out of range'; }
      if (a.events.some((ev) => ev.midi && (ev.midi < 24 || ev.midi > 96))) { ok = false; why = 'a note is out of range'; }
      if (a.events.some((ev) => ev.step < 0 || ev.step >= a.steps || !(ev.dur > 0))) { ok = false; why = 'a note is off the grid'; }
      why = why || `${song.melody.length} bars at ${song.bpm} bpm, ${a.events.length} notes, loops every ${Math.round(a.steps * a.stepSeconds)}s`;
    } catch (err) { ok = false; why = err.message; }
    check(`music: "${song.name}" is well formed`, ok, why);
  }
  check('music: every map has a theme', Object.values(MAPS).every((m) => SONGS[MAP_SONG[m.theme]]) && !!SONGS.arena);
  const tunes = Object.values(SONGS).map((sg) => sg.melody.join(' '));
  check('music: every theme has its own melody', new Set(tunes).size === tunes.length);
  let threw = false; try { parseBar('C5:4 D5:4'); } catch (err) { threw = true; }
  check('music: a bar that does not add up is caught', threw);
}
process.exit(failed ? 1 : 0);
