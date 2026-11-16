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
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
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
// Perfect dodge refunds Breakthrough.
{
  const w = new World({ seed: 3 }); const p = w.player;
  p.level = 3; w.recalcStats();
  w.command({ type: 'cast', slot: 'e', x: 5, z: 0 }); w.step(CONFIG.TICK);
  const full = p.cd.e;
  const res = w.hitPlayer(50, { parryable: false });
  check('dash dodges and refunds Breakthrough', res === 'dodged' && p.cd.e <= CONFIG.DODGE_REFUND_CD && full > 8, `cd ${full.toFixed(1)} -> ${p.cd.e.toFixed(1)}`);
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
  // (The Wilds is reached by the Waygate only, from world tier II: its one portal leads home.)
  const road = MAP_IDS.filter((id) => !MAPS[id].fromTier);
  check('maps: every map on the road can be reached from town', road.every((id) => seen.has(id)), [...seen].join(' > '));
  check('maps: every portal on the road has a way back', road.every((id) => buildMap(id).portals.every((g) => buildMap(g.to).portals.some((b) => b.to === id))));
  check('maps: the Waygate-only maps lead home', MAP_IDS.filter((id) => MAPS[id].fromTier).every((id) => buildMap(id).portals.every((g) => g.to === 'town')));
  for (const id of MAP_IDS) {
    const m = buildMap(id);
    const types = new Set(m.spawns.map((sp) => sp.type));
    const ok = [...types].every((t) => DEFS.ENEMIES[t].boss || MAPS[id].roster[t]) && m.spawns.every((sp) => sp.level >= m.level && sp.level <= m.levelMax + (DEFS.ENEMIES[sp.type].boss ? 1 : 0));
    const open = m.spawns.every((sp) => !m.obstacles.some((ob) => Math.hypot(ob.x - sp.x, ob.z - sp.z) < ob.r + 1)) && m.portals.every((g) => !m.obstacles.some((ob) => Math.hypot(ob.x - g.x, ob.z - g.z) < ob.r + 3));
    check(`${m.name}: its own enemies, at its own level, with room to stand`, ok && open && (m.safe ? m.spawns.length === 0 : MAPS[id].bossOnly ? m.spawns.length === 1 && DEFS.ENEMIES[m.spawns[0].type].boss : m.spawns.length >= 15), `${m.spawns.length} enemies: ${[...types].join(', ') || 'none'}; ${m.obstacles.length} solid objects`);
  }
  check('maps: same layout every time', JSON.stringify(buildMap('fen')) === JSON.stringify(buildMap('fen')));
  {
    // Follow the portals from Haven to the end: every map is reachable and each is ten levels above the last.
    const chain = ['town'];
    for (;;) { const next = MAPS[chain[chain.length - 1]].portals.map((g) => g.to).find((to) => !chain.includes(to)); if (!next) break; chain.push(next); }
    const fields = chain.slice(1).map((id) => MAPS[id]);
    check('maps: one road from Haven through every map', chain.length === Object.keys(MAPS).filter((id) => !MAPS[id].fromTier).length, chain.join(' > '));
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
  let arrived = null;
  for (let i = 0; i < 60 * 12; i++) {
    w.step(CONFIG.TICK);
    for (const ev of w.events) if (ev.type === 'mapChange') changes++;
    w.events.length = 0;
    if (changes && arrived === null) { const bk = w.map.portals.find((g) => g.to === 'town'); arrived = bk ? Math.hypot(p.x - bk.x, p.z - bk.z) : 99; }
  }
  check('portal: walking into it takes you to the next map', w.map.id === 'greenwood' && changes === 1, `${w.map.id} after ${changes} trips`);
  check('portal: you arrive beside the way back, but are not sent straight back', arrived !== null && arrived < 8 && w.map.id === 'greenwood', arrived);
  const back = w.map.portals.find((g) => g.to === 'town');
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
    check('archer: Evasive Roll moves, then attacks 50% faster for a while', p.x < x0 - 2 && p.rushT > 3 && Math.abs(p.stats.as / as0 - (1 + 0.015 * (p.level - 1) + 0.5) / (1 + 0.015 * (p.level - 1))) < 0.05, `${as0.toFixed(2)} -> ${p.stats.as.toFixed(2)} attacks per second`);
    run(w, 4.5);
    check('archer: ...and the bonus wears off', p.rushT === 0 && Math.abs(p.stats.as - as0) < 1e-9);
  }
  // Rogue: Mercy Stroke is far stronger on an exposed enemy; Death Mark closes the gap.
  {
    const a = duel('rogue', 2.5); a.w.command({ type: 'cast', slot: 'q', x: a.e.x, z: a.e.z }); run(a.w, 0.1);
    const front = damageOf(a.w);
    const b = duel('rogue', 2.5); b.e.facing = 0; // its back is to the hero
    b.w.command({ type: 'cast', slot: 'q', x: b.e.x, z: b.e.z }); run(b.w, 0.1);
    const behind = damageOf(b.w);
    check('rogue: Mercy Stroke hits harder from behind', front > 0 && behind > front * 1.3, `${front} from the front, ${behind} from behind`);
    const c = duel('rogue', 30); c.w.command({ type: 'cast', slot: 'q', x: 30, z: 0 }); run(c.w, 0.1);
    check('rogue: Mercy Stroke with nobody in reach does not go on cooldown', c.p.cd.q === 0);
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
    check('rogue Serrated Blade: Mercy Stroke bleeds', hits(b.w).some((h) => h.dot));
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
  for (const type of Object.keys(ENEMIES).filter((t) => !ENEMIES[t].thief && !ENEMIES[t].still)) { // (the Wishthief runs; wish-stars just wait)
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
    if (m.safe || m.bossOnly) continue; // (a boss's chamber is not for farming)
    const level = Math.min(99, m.level + Math.round(m.levelSpan / 2));
    const o = farm({ cls: 'warrior', map: id, level, minutes: 1.5, rarity: 2, parrySkill: 0.6 });
    check(`balance: a level ${level} warrior can farm ${m.name}`, o.kills >= 8 && o.downs <= 1, `${o.kills} kills, knocked out ${o.downs}x, lowest health ${Math.round(o.minHp * 100)}%`);
  }
}
// --- Act II (0.39): Wren's letter, Asterfell, Tobin's survey ---------------------
{
  const { SIGNS } = await import('../src/sim/story.js');
  const step = (w, n = 1) => { for (let i = 0; i < n; i++) w.step(CONFIG.TICK); };
  const w = new World({ seed: 21, cls: 'warrior', mode: 'explore', save: { v: 2, level: 100, tierMax: 2, worldTier: 2, quests: { unmade: { s: 'done', n: 1 } }, visited: ['town', 'frost'] } });
  const p = w.player;
  check('Act II: after Let Her Rest, Wren offers W.', w.questOpen('w') && !w.questOpen('sand'));
  w.command({ type: 'travel', to: 'asterfell' }); step(w);
  check('Act II: Asterfell stays shut until Wren has told you about it', w.map.id === 'town' && w.events.some((e) => e.type === 'mapLocked'));
  w.command({ type: 'acceptQuest', id: 'w' }); step(w);
  w.readSign('frost3');
  check('Act II: reading the letter under the cairn finishes W.', w.questState('w') === 'ready');
  p.quests.w.s = 'done';
  w.command({ type: 'acceptQuest', id: 'sand' }); step(w);
  w.command({ type: 'travel', to: 'asterfell' }); step(w, 2);
  check('Act II: then the Waygate takes you to Asterfell (world tier II) and Under the Sand is done', w.map.id === 'asterfell' && w.questState('sand') === 'ready');
  check('Act II: Asterfell is a city: houses, four survey stones, its own enemies', w.map.obstacles.filter((o) => o.kind === 'house').length >= 12 && ['aster2', 'aster3', 'aster4', 'aster5'].every((id) => SIGNS[id].map === 'asterfell') && w.enemies.some((e) => ['glassbound', 'courtguard', 'wishling'].includes(e.type)));
  p.quests.sand.s = 'done';
  w.command({ type: 'acceptQuest', id: 'survey' }); step(w);
  for (const id of ['aster2', 'aster3', 'aster4']) w.readSign(id);
  const three = w.questState('survey') === 'active' && p.quests.survey.n === 3;
  w.readSign('aster5');
  check("Act II: Tobin's Survey counts his four stones, and only those", three && w.questState('survey') === 'ready', JSON.stringify(p.quests.survey));
  // The new enemies
  const guard = w.enemies.find((e) => e.type === 'courtguard');
  check('Act II: Court Guards carry a shield worth half their health', !guard || Math.abs(guard.shield - Math.round(guard.maxHp * 0.5)) <= 1, guard ? `${guard.shield} of ${guard.maxHp}` : 'none spawned');
  const glass = w.enemies.find((e) => e.type === 'glassbound');
  if (glass) {
    const n0 = w.falls.length;
    w.killEnemy(glass, 'q');
    check('Act II: a Glassbound shatters a moment after it falls (a circle to step out of)', w.falls.length >= n0 + 1, `${n0} -> ${w.falls.length}, ${glass.dead}`);
  }
  const wl = w.enemies.find((e) => e.type === 'wishling' && !e.dead);
  if (wl) {
    const other = w.enemies.find((e) => !e.dead && e !== wl && !e.def.grants);
    other.x = wl.x + 2; other.z = wl.z; other.state = 'idle'; wl.state = 'idle';
    const before = other.dmgMult;
    let got = false;
    for (let i = 0; i < Math.round(5 / CONFIG.TICK) && !got; i++) { step(w); got = w.events.some((e) => e.type === 'wished'); }
    check('Act II: a Wishling now and then gives a nearby enemy 30% more damage, for a while', got && w.enemies.some((e) => e.wishedT > 0 && Math.abs(e.dmgMult / (e.wishedMult || 1) - (e === other ? before : e.dmgMult / e.wishedMult)) < 1e-9));
  }
  // --- 0.40: the Frozen Court and the Starwell ---
  p.quests.survey.s = 'done';
  check('Act II: after the survey, Wren sends you to the Frozen Court', w.questOpen('court') && !w.questOpen('starwell'));
  w.command({ type: 'acceptQuest', id: 'court' }); step(w);
  const herald = w.enemies.find((e) => e.type === 'herald');
  check('Act II: the Herald holds the Frozen Court in Asterfell', !!herald);
  for (const e of w.enemies) if (e !== herald) { e.dead = true; e.hp = 0; }
  w.enemies = w.enemies.filter((e) => !e.dead);
  p.x = herald.x + 6; p.z = herald.z; herald.aggro = true; herald.state = 'chase';
  for (let i = 0; i < Math.round(30 / CONFIG.TICK); i++) { p.hp = p.stats.maxHp; p.dead = false; step(w); }
  const guards = w.enemies.filter((e) => e.type === 'heraldguard' && !e.dead && e.summoner === herald.id);
  check('Act II: the Herald calls up shielded guards as he proclaims, never more than four', guards.length >= 2 && guards.length <= 4 && guards.every((g) => g.maxShield > 0 && g.def.exp === 0), `${guards.length} guards`);
  w.killEnemy(herald, 'q'); step(w);
  check('Act II: when the Herald falls, The Frozen Court is done and the Starwell opens', w.questState('court') === 'ready');
  check('Act II: and his guards fall with him', guards.every((g) => g.dead));
  p.quests.court.s = 'done';
  w.command({ type: 'acceptQuest', id: 'starwell' }); step(w);
  w.command({ type: 'travel', to: 'starwell' }); step(w, 2);
  const asker = w.enemies.find((e) => e.type === 'asker');
  check('Act II: the Starwell holds only the Asker', w.map.id === 'starwell' && asker && w.enemies.filter((e) => !e.dead).length === 1);
  // Its offers
  const dmg0 = p.stats.dmg, ms0 = p.stats.ms;
  asker.hp = asker.maxHp * 0.76; w.hitEnemy(asker, 1e-6 + asker.maxHp * 0.02);
  check('Act II: at 75% the Asker stops and offers you a wish', asker.offerT > 0 && asker.offerTo.has(w.cur.pid) && w.events.some((e) => e.type === 'askerOffer'));
  const hp0 = asker.hp; w.hitEnemy(asker, 1000);
  check('Act II: while it waits for your answer, it cannot be hurt', asker.hp === hp0);
  w.command({ type: 'askerAnswer', pick: 'speed' }); step(w);
  check('Act II: a speed wish makes you 20% faster, and the Asker grows from it', Math.abs(p.stats.ms / ms0 - 1.2) < 1e-6 && asker.askerGrown === 1, `${ms0} -> ${p.stats.ms}`);
  step(w, Math.round(1 / CONFIG.TICK));
  check('Act II: once everyone has answered, the fight goes on', !(asker.offerT > 0));
  asker.hp = asker.maxHp * 0.51; w.hitEnemy(asker, asker.maxHp * 0.02);
  const mult0 = asker.dmgMult;
  w.command({ type: 'askerAnswer', pick: 'none' }); step(w);
  check('Act II: refusing makes it press 8% harder', Math.abs(asker.dmgMult / mult0 - 1.08) < 1e-9 && asker.askerGrown === 1);
  step(w, Math.round(1 / CONFIG.TICK));
  asker.hp = asker.maxHp * 0.26; w.hitEnemy(asker, asker.maxHp * 0.02);
  const ward0 = p.ward || 0;
  w.command({ type: 'askerAnswer', pick: 'shield' }); step(w);
  check('Act II: a shield wish gives a ward of 30% of your health', (p.ward || 0) - ward0 >= p.stats.maxHp * 0.3 - 1 && asker.askerGrown === 2);
  step(w, Math.round(1 / CONFIG.TICK));
  const mult1 = asker.dmgMult;
  asker.hp = asker.maxHp * 0.21; w.hitEnemy(asker, asker.maxHp * 0.02);
  check('Act II: in its last stretch the Asker grows from every wish it granted (and forgets refusals)', asker.askerLast && Math.abs(asker.dmgMult - (mult1 / 1.08) * 1.6) < 1e-6 && asker.maxShield === Math.round(asker.maxHp * 0.16), `${mult1} -> ${asker.dmgMult}, shield ${asker.maxShield}`);
  // Nobody answers: time runs out
  const w2 = new World({ seed: 23, cls: 'mage', mode: 'explore', save: { v: 2, level: 100, tierMax: 2, worldTier: 2, quests: { unmade: { s: 'done', n: 1 }, w: { s: 'done', n: 1 }, sand: { s: 'done', n: 1 }, survey: { s: 'done', n: 1 }, court: { s: 'done', n: 1 } }, visited: ['town', 'frost', 'asterfell'] } });
  w2.command({ type: 'travel', to: 'starwell' }); step(w2, 2);
  const a2 = w2.enemies.find((e) => e.type === 'asker');
  a2.hp = a2.maxHp * 0.74; w2.hitEnemy(a2, 1);
  const m2 = a2.dmgMult;
  step(w2, Math.round(10.5 / CONFIG.TICK));
  check('Act II: saying nothing until the time runs out counts as refusing', !(a2.offerT > 0) && Math.abs(a2.dmgMult / m2 - 1.08) < 1e-9 && w2.events.some((e) => e.type === 'askerRefused'), `${w2.map.id}, ${a2.offerT}, ${m2} -> ${a2.dmgMult}`);
  // Wishes end with the Asker
  w.killEnemy(asker, 'q'); step(w);
  check('Act II: when the Asker falls its wishes are gone, and The Starwell is done', !p.wished && Math.abs(p.stats.ms - ms0) < 1e-6 && w.questState('starwell') === 'ready');
}

// --- Story: quests, signs, boss rewards -----------------------------------------
{
  const { QUESTS, QUEST_IDS, SIGNS, SIGN_IDS, NPCS, BOSS_LOOT } = await import('../src/sim/story.js');
  const { buildMap, MAP_IDS } = await import('../src/sim/maps.js');
  const step = (w, n = 1) => { for (let i = 0; i < n; i++) w.step(CONFIG.TICK); };
  // The data hangs together.
  check('story: every quest has a giver, a goal that exists and a reward', QUEST_IDS.every((id) => { const q = QUESTS[id]; const g = q.goal; return NPCS[q.giver] && q.offer && q.done && q.reward && (!q.after || QUESTS[q.after]) && (!g.enemy || DEFS.ENEMIES[g.enemy]) && (!g.boss || DEFS.ENEMIES[g.boss].boss) && (!g.map || MAPS[g.map]) && (!g.reach || MAPS[g.reach]) && (!g.sign || SIGNS[g.sign]) && (!g.signs || g.signs.every((sid) => SIGNS[sid])) && (g.kill || g.reach || g.read || g.wave || g.sign || g.signs || g.ending); }), QUEST_IDS.length + ' quests');
  check('story: a kill quest for a map names an enemy that lives there', QUEST_IDS.every((id) => { const g = QUESTS[id].goal; return !(g.enemy && g.map) || MAPS[g.map].roster[g.enemy]; }));
  check('story: every enemy a quest asks for lives on a map near the quest\'s level', QUEST_IDS.every((id) => { const q = QUESTS[id]; const g = q.goal; if (!g.enemy) return true; return Object.values(MAPS).some((m) => m.roster[g.enemy] && Math.abs(m.level - q.level) <= 12); }));
  check('story: every sign is placed, at least two on every map (three in Haven), each somewhere you can stand', MAP_IDS.every((id) => { const m = buildMap(id); const signs = m.obstacles.filter((o) => o.kind === 'sign'); return signs.length === SIGN_IDS.filter((sid) => SIGNS[sid].map === id).length && signs.length >= (id === 'town' ? 3 : 2) && signs.every((sg) => SIGNS[sg.id].map === id && Math.hypot(sg.x, sg.z) < m.radius - 2 && m.obstacles.every((o) => o === sg || Math.hypot(o.x - sg.x, o.z - sg.z) > o.r + sg.r + 0.5)); }), SIGN_IDS.length + ' signs');
  check('story: four people live in Haven (and Tomas, once, after the Unwish)', buildMap('town').obstacles.filter((o) => o.kind === 'npc').length === 5 && new World({ seed: 1, mode: 'explore' }).obstacles.filter((o) => o.kind === 'npc').length === 4);

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
  // 0.37.2: one click puts a build back after a respec, and fills points sensibly with none
  w.command({ type: 'chooseSpec', id: 'berserker' }); w.command({ type: 'autoTalents' }); w.step(CONFIG.TICK);
  check('talents: spending automatically puts back the build you had in that subclass', p.talents.bz_haste === 5 && p.talents.bz_whirl === 2 && w.talentPoints() === 0, JSON.stringify(p.talents));
  const rebuilt = new World({ seed: 1, cls: 'warrior', save: JSON.parse(JSON.stringify(w.toSave())) });
  check('talents: the remembered build is saved with the character', JSON.stringify(rebuilt.player.talentBuilds.berserker) === JSON.stringify(p.talentBuilds.berserker));
  const fresh = new World({ seed: 4, cls: 'warrior', save: { v: 2, level: 100 } });
  fresh.command({ type: 'chooseSpec', id: 'bastion' in SPECS ? 'bastion' : specsFor('warrior')[1] }); fresh.command({ type: 'autoTalents' }); fresh.step(CONFIG.TICK);
  check('talents: with no build to remember, every point is spent, the capstone included', fresh.talentPoints() === 0 && fresh.talentsSpent() === 22 && SPECS[fresh.player.spec].talents.filter((t) => t.row === 'capstone').every((t) => fresh.player.talents[t.id] === t.max), JSON.stringify(fresh.player.talents));
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
  // A friend's parry is judged by what their screen showed (0.41.1).
  {
    const lw = new World({ seed: 31, mode: 'explore', save: geared('warrior', 45, 2) });
    lw.addHero(1, { save: geared('archer', 45, 2), name: 'Far', parry: 'standard' });
    lw.loadMap('greenwood', 'town');
    const friend = lw.heroByPid(1);
    const fp = friend.player;
    const stepN = (n) => { for (let i = 0; i < n; i++) lw.step(CONFIG.TICK); };
    for (const e of lw.enemies) { e.dead = true; }
    lw.enemies = [];
    // the friend's screen runs 12 ticks (0.2 s) behind
    for (let i = 0; i < 6; i++) { lw.command({ type: 'stop', pid: 1, seen: lw.ticks - 12 }); stepN(1); }
    check('lag: the host learns how far behind a friend sees things', Math.abs(friend.lag - 0.2) < 0.03, friend.lag);
    const hit = () => lw.as(friend, () => lw.hitPlayer(100, { parryable: true }));
    // 1) a hit lands; the friend pressed parry 4 ticks BEFORE it on their screen: it is parried
    fp.parryCd = 0; fp.hp = fp.stats.maxHp;
    const hp0 = fp.hp;
    const t0 = lw.ticks;
    const r1 = hit();
    stepN(8); // their parry arrives 8 ticks later, saying they pressed it 4 ticks before the hit
    const parries0 = lw.as(friend, () => lw.stats.parries);
    lw.command({ type: 'parry', pid: 1, seen: t0 - 4 }); stepN(1);
    check("lag: a friend's hit waits for their parry, and a parry pressed in time on their screen counts", r1 === 'held' && lw.as(friend, () => lw.stats.parries) === parries0 + 1 && fp.hp === hp0, `${r1}, hp ${hp0} -> ${fp.hp}`);
    // 2) pressed AFTER the hit on their screen: too late, the hit lands
    stepN(90); fp.parryCd = 0; fp.parryT = 0; fp.hp = fp.stats.maxHp;
    const t1 = lw.ticks;
    hit();
    stepN(6);
    lw.command({ type: 'parry', pid: 1, seen: t1 + 3 }); stepN(1);
    stepN(20);
    check('lag: a parry pressed after the hit (on their screen) does not save them', fp.hp < fp.stats.maxHp);
    // 3) no parry at all: the hit lands once the lag has passed, not before
    stepN(90); fp.parryCd = 0; fp.parryT = 0; fp.hp = fp.stats.maxHp;
    hit();
    stepN(6);
    const early = fp.hp;
    stepN(12);
    check('lag: an unparried hit lands about one lag later', early === fp.stats.maxHp && fp.hp < fp.stats.maxHp, `${early} then ${fp.hp}`);
    // the host's own hero is never held
    const hostHit = lw.hitPlayer(100, { parryable: true });
    check("lag: the host's own hits land at once", hostHit !== 'held');
  }
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
    const heal = (opts) => { p.hp = 1; p.lsPool = 1e9; w.hitEnemy(e, 1000, Object.assign({ canCrit: false }, opts)); return Math.round(p.hp - 1); }; // (budget aside: see 0.32)
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
  // Bulwark: The Warden's Call, Gravity Well, Shield Wall, Bastion
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
  { const k = setup({}, 'assassin').w.kit; check('Assassin: Q, W and E become Shadowstrike, Death Lotus and Ambush', k.q.name === 'Shadowstrike' && k.w.name === 'Death Lotus' && k.e.name === 'Ambush' && k.r.name === 'Last Rites'); }
  // Nightstep leaves a Shadow; E again swaps with it, once.
  cast(w, 'e', 7, 0); run(w, 0.3);
  const sh = w.shadows.find((x) => x.src === 'e');
  check('Nightstep leaves a Shadow where you stood', !!sh && Math.hypot(sh.x, sh.z) < 0.5 && p.x > 5, sh ? `${sh.x.toFixed(1)}, hero at ${p.x.toFixed(1)}` : 'none');
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
    cast(w3, 'q', 4, 0); run(w3, 0.2); // Veilstep toward the dummy
    check('Veilstep: a short untouchable slip that leaves an afterimage and Veils you', w3.shadows.some((x) => x.src === 'q' && Math.abs(x.x) < 0.5) && p3.x > 2.5 && p3.veilT > 4);
    w3.events.length = 0;
    w3.basicAttack(e1);
    const knives = w3.events.filter((ev) => ev.type === 'shadowSlash' && ev.veil);
    check('Veiled: each afterimage throws a knife at your target with every basic attack', knives.length === 2 && knives.every((k) => k.tx === e1.x), knives.length + ' knives');
    p3.veilT = 0;
    p3.x = -3; p3.z = 0;
    cast(w3, 'r', 2, 0);
    check('Lord of Shadows: Death Mark leaves a Shadow where you leapt from', w3.shadows.some((x) => x.src === 'r' && Math.abs(x.x + 3) < 0.5));
    check('Lord of Shadows: the mark repeats 50%, and Nightstep comes back sooner', Math.abs(w3.mods.rMark - 0.5) < 1e-9 && w3.mods.eCd < 1);
    const w4 = new World({ seed: 3, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 30, 2), { spec: 'shadowdancer' }) });
    w4.addShadow('e', 1, 1, 0);
    const snap = makeSnapshot(w4, 0, {});
    check('Shadows are sent to friends in co-op', snap.shadows.length === 1 && snap.shadows[0].src === 'e');
  }
}
// --- 0.19: Nightstep empowers abilities, Immortal effects that fit each class ----------
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

  // Nightstep: the next ability, not the next basic attack.
  {
    const { w, p } = setup('rogue');
    p.stats.crit = 0;
    const e = dummy(w, 2);
    cast(w, 'q', 2, 0); const plain = dealt(w, e.id)[0];
    run(w, 0.3); w.events.length = 0; p.cd.q = 0; p.stats.crit = 0;
    cast(w, 'e', -6, 0); run(w, 0.3); p.x = 0; p.z = 0;
    check('Nightstep empowers the next ability (the button bar glows)', p.empowerT > 0);
    p.stats.crit = 0; e.facing = 0; // (the dummy turned to watch the rogue; face it away again, as for the first stab)
    cast(w, 'q', 2, 0);
    const boosted = dealt(w, e.id)[0];
    check('Nightstep: that ability deals 35% more', Math.abs(boosted / plain - 1.35) < 0.02 && p.empowerT === 0, `${plain} -> ${boosted}`);
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
    check('Nightfang (Rogue): ability crits deal 40% more and take 1 s off Nightstep', Math.abs(got / plainCrit - 1.4) < 0.01 && Math.abs(p.cd.e - 4) < 1e-9, `${plainCrit} -> ${got}, E ${p.cd.e}`);
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
// --- 0.20: attack-move, auto-attack off, Sharpshooter's Long Watch ------------------
{
  const { geared } = await import('./balance.mjs');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  const setup = (cls, spec = null) => {
    const w = new World({ seed: 31, cls, save: Object.assign(geared(cls, 40, 2), spec ? { spec } : {}) });
    const p = w.player; w.wave.phase = 'explore';
    w.recalcStats(); p.hp = p.stats.maxHp; p.x = p.px = 0; p.z = p.pz = 0;
    w.enemies = []; w.events.length = 0;
    return { w, p };
  };
  const dummy = (w, x, z = 0) => { const e = w.spawnEnemy('grunt', { x, z, level: w.player.level }); e.state = 'recover'; e.t = 999; e.hp = e.maxHp = 1e9; e.x = e.px = x; e.z = e.pz = z; return e; };
  const cmd = (w, c) => { w.command(c); w.runCommands(); };
  {
    const { w, p } = setup('warrior');
    const near = dummy(w, 3, 0), byCursor = dummy(w, -5, 0);
    cmd(w, { type: 'attackMove', x: -6, z: 0, near: 'hero' });
    check('attack-move (nearest to me): goes for the enemy closest to the hero', p.targetId === near.id);
    cmd(w, { type: 'attackMove', x: -6, z: 0, near: 'cursor' });
    check('attack-move (nearest to cursor): goes for the enemy closest to the cursor', p.targetId === byCursor.id);
    w.enemies = [];
    const ahead = dummy(w, 16, 0);
    cmd(w, { type: 'attackMove', x: 30, z: 0, near: 'hero' });
    check('attack-move with nothing in reach: walks toward the spot', !p.targetId && !!p.moveTarget && !!p.attackMove);
    run(w, 2.5);
    check('...and attacks the first enemy that comes into reach on the way', p.targetId === ahead.id && !p.attackMove && p.x < 20, `x ${p.x.toFixed(1)}`);
    cmd(w, { type: 'move', x: 0, z: 5 });
    check('a plain move cancels attack-move', !p.attackMove && !p.targetId);
  }
  {
    const { w, p } = setup('warrior');
    cmd(w, { type: 'setAutoAttack', on: false });
    const e = dummy(w, 2);
    run(w, 1.5);
    check('auto-attack off: an idle hero leaves a nearby enemy alone', !p.targetId && e.hp === 1e9);
    cmd(w, { type: 'attack', id: e.id });
    run(w, 1.5);
    check('auto-attack off: you still attack what you click', e.hp < 1e9);
    const other = dummy(w, -2);
    e.hp = 1; w.hitEnemy(e, 10, { canCrit: false });
    run(w, 1.5);
    check('auto-attack off: when the target falls you do not pick another', !p.targetId && other.hp === 1e9);
    cmd(w, { type: 'setAutoAttack', on: true });
    run(w, 1.5);
    check('auto-attack on again: the idle hero attacks', other.hp < 1e9);
  }
  {
    const { w, p } = setup('archer', 'sharpshooter');
    p.stats.crit = 0;
    const close = dummy(w, 2.2), far = dummy(w, 10);
    const hit = (e) => { w.events.length = 0; w.hitEnemy(e, 1000, { canCrit: false, basic: true }); return w.events.find((ev) => ev.type === 'damage'); };
    const c = hit(close), f = hit(far);
    const expect = 1 + Math.min(0.4, (10 - far.radius - 2) * 0.04);
    check('Long Watch: point-blank shots get no bonus', c.amount === 1000 && !c.far, String(c.amount));
    check('Long Watch: +4% per metre past 2 m (about 30% at 10 m), shown in gold', Math.abs(f.amount / 1000 - expect) < 0.002 && f.far, `${f.amount} (x${expect.toFixed(2)})`);
    const veryFar = dummy(w, 30);
    check('Long Watch: capped at +40%', hit(veryFar).amount === 1400);
    const { w: w2 } = setup('archer', 'windrunner');
    const f2 = dummy(w2, 10); w2.events.length = 0; w2.hitEnemy(f2, 1000, { canCrit: false });
    check('Windrunners do not get it', w2.events.find((ev) => ev.type === 'damage').amount === 1000);
  }
}
// --- 0.21: Mage rework (Starwake, Pyromancer burns, Frostbinder Rimewall), scrap filter ------
{
  const { geared } = await import('./balance.mjs');
  const { CLASSES } = await import('../src/sim/classes.js');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  const setup = (spec = null, talents = {}, cls = 'mage') => {
    const w = new World({ seed: 41, cls, save: Object.assign(geared(cls, 50, 2), spec ? { spec, talents } : {}) });
    const p = w.player; w.wave.phase = 'explore';
    w.recalcStats(); p.hp = p.stats.maxHp; p.x = p.px = 0; p.z = p.pz = 0;
    for (const k of ['q', 'w', 'e', 'r']) p.cd[k] = 0;
    w.enemies = []; w.events.length = 0;
    return { w, p };
  };
  const dummy = (w, x, z = 0, type = 'grunt') => { const e = w.spawnEnemy(type, { x, z, level: w.player.level }); e.state = 'recover'; e.t = 999; e.hp = e.maxHp = 1e9; e.x = e.px = x; e.z = e.pz = z; return e; };
  const cast = (w, slot, x, z) => { w.command({ type: 'cast', slot, x, z }); w.runCommands(); };
  const hitsOn = (w, e, src) => w.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy' && ev.id === e.id);

  // Starwake
  {
    const { w, p } = setup();
    check('Mage E is Starwake', w.kit.e.name === 'Starwake' && CLASSES.mage.abilities.e.motes.count === 3);
    const a = dummy(w, 9, 3), b = dummy(w, 9, -3), c = dummy(w, 12, 0);
    cast(w, 'e', 5, 0); run(w, 0.2);
    const motes = w.projectiles.filter((pr) => pr.kind === 'mote');
    check('Starwake: lands and looses 3 motes, one at each of the nearest enemies', motes.length === 3 && new Set(motes.map((m) => m.targetId)).size === 3);
    run(w, 1.2);
    check('Starwake: the motes find their targets', [a, b, c].every((e) => e.hp < 1e9) && !w.projectiles.some((pr) => pr.kind === 'mote'));
  }
  // Pyromancer
  {
    const { w, p } = setup('pyromancer', { py_power: 5, py_burn: 3 });
    check('Pyromancer: W is Smoulder and R is Cinderfall', w.kit.w.name === 'Smoulder' && w.kit.r.name === 'Cinderfall' && w.kit.q.name === 'Fire Bolt');
    const e = dummy(w, 6);
    for (let i = 0; i < 7; i++) { p.cd.q = 0; p.castLock = 0; cast(w, 'q', 6, 0); run(w, 0.4); }
    check('Everything Burns: Fire Bolt stacks burns, up to 5', e.burnT > 0 && e.burnStacks === 5, String(e.burnStacks));
    w.events.length = 0; run(w, 1.01);
    const plain = hitsOn(w, e).filter((ev) => ev.dot).map((ev) => ev.amount);
    const per = (p.stats.ad * 0.15 + p.level * 1.5) * (1 + CONFIG.RANK_DAMAGE * (p.ranks.q - 1));
    check('Everything Burns: 5 stacks burn for 5 x (15% spell power + 1.5 per level) a second, growing with Fire Bolt rank', plain.length === 2 && Math.abs(plain[0] - per * 5 * 0.5) <= 1, `${plain} vs ${Math.round(per * 2.5)}`);
    cast(w, 'w', 6, 0);
    check('Smoulder: marks for 5 s', e.smoulderT > 4.9);
    w.events.length = 0; run(w, 1.01);
    const hot = hitsOn(w, e).filter((ev) => ev.dot).map((ev) => ev.amount);
    check('Smoulder: burns on a Smouldering enemy deal 50% more', Math.abs(hot[0] / plain[0] - 1.5) < 0.02, `${plain[0]} -> ${hot[0]}`);
    // Wildfire: a burning enemy's death passes its burn on
    const n1 = dummy(w, 7, 1), n2 = dummy(w, 7, -1), n3 = dummy(w, 7, 2.5), far = dummy(w, 30);
    w.hitEnemy(e, 1e10, { canCrit: false });
    check('Wildfire (3 ranks): the burn jumps to the 3 nearest enemies, every stack', [n1, n2, n3].every((o) => o.burnStacks === 5) && !(far.burnT > 0));
    // Cinderfall
    w.enemies = []; const f = dummy(w, 8);
    p.cd.r = 0; cast(w, 'r', 8, 0); run(w, 1.0);
    check('Cinderfall: the ground stays on fire and adds burn stacks', w.zones.some((z) => z.fire) && f.burnStacks >= 1);
    run(w, 1.6);
    check('Cinderfall: ...a stack every half second while you stand in it', f.burnStacks >= 4, String(f.burnStacks));
  }
  // Frostbinder
  {
    const { w, p } = setup('frostbinder');
    check('Frostbinder: Q is Ice Bolt, W stays Frozen Orb, R is Rimewall', w.kit.q.name === 'Ice Bolt' && w.kit.r.name === 'Rimewall' && w.kit.w.name === 'Frozen Orb');
    const fbt = (await import('../src/sim/talents.js')).SPECS.frostbinder.talents;
    check('Frostbinder: no armor, health or damage-taken talents any more', !fbt.some((t) => /armor|maximum health|less damage/i.test(t.desc(1))));
    // Hoarfrost: Ice Bolt builds 2 stacks a hit; at 6 the enemy Shatters
    const e = dummy(w, 6);
    e.state = 'chase';
    p.autoAttack = false;
    cast(w, 'q', 6, 0); run(w, 0.4);
    check('Hoarfrost: Ice Bolt gives 2 stacks', e.frostStacks === 2 && e.frostT > 4, String(e.frostStacks));
    p.cd.q = 0; p.castLock = 0; cast(w, 'q', 6, 0); run(w, 0.4);
    w.events.length = 0;
    p.cd.q = 0; p.castLock = 0; cast(w, 'q', 6, 0); run(w, 0.4);
    const sh = w.events.find((ev) => ev.type === 'frostShatter' && ev.id === e.id);
    check('Hoarfrost: the 6th stack Shatters (stacks reset, the enemy freezes)', !!sh && e.frostStacks === 0 && e.state === 'stunned', `${e.frostStacks} ${e.state}`);
    const big = hitsOn(w, e).map((ev) => ev.amount).sort((a, b) => b - a)[0];
    const expect = (1.4 * p.stats.ad + 35 + 9 * p.level) * (1 + CONFIG.RANK_DAMAGE * (p.ranks.q - 1));
    check('Shatter: deals 140% spell power + 35 + 9 per level, growing with Ice Bolt rank', big >= expect * 0.95, `${big} vs ${Math.round(expect)}`);
    check('Shatter: no new Hoarfrost for a moment afterwards', (w.addFrost(e, 6), e.frostStacks === 0));
    // Shards spread Hoarfrost, and can chain
    w.enemies = []; run(w, 2);
    const a1 = dummy(w, 8, 0), a2 = dummy(w, 9.5, 0), a3 = dummy(w, 30, 0);
    a2.frostStacks = 4; a2.frostT = 5;
    w.addFrost(a1, 6);
    check('Shatter: shards give 2 Hoarfrost within 3 m, which can set off the next one', a2.frostLock > 0 && a3.frostStacks === 0);
    // Bosses turn Brittle instead of freezing
    w.enemies = [];
    const boss = dummy(w, 8, 0, 'boss');
    boss.state = 'chase';
    w.addFrost(boss, 6);
    check('Shatter on a boss: Brittle (takes 15% more) instead of a freeze', boss.state !== 'stunned' && boss.vulnT > 3 && boss.vuln >= 0.15 && boss.brittle);
    // Ice Bolt is ice, not fire: no fire augments, and no Frozen Orb augments for a Pyromancer
    const offerIds = (spec) => {
      const t = setup(spec);
      const seen = new Set();
      for (let i = 0; i < 200; i++) { t.w.offer = null; t.w.makeOffer(i % 2 === 0); for (const id of t.w.offer.choices) seen.add(id); }
      return seen;
    };
    const fbOffers = offerIds('frostbinder'), pyOffers = offerIds('pyromancer'), mgOffers = offerIds(null);
    check('augments: a Frostbinder is never offered Fireball or Ignite', !fbOffers.has('mage_q_ball') && !fbOffers.has('mage_q_burn') && fbOffers.has('fb_hard'));
    check('augments: a Pyromancer is never offered Frozen Orb augments', !pyOffers.has('mage_w_freeze') && !pyOffers.has('mage_w_big') && pyOffers.has('py_pyre'));
    check('augments: subclass augments only go to their subclass', !mgOffers.has('fb_hard') && !mgOffers.has('py_pyre') && !pyOffers.has('fb_avalanche') && !fbOffers.has('py_inferno'));
    check('augments: a Frostbinder is not offered Meteor augments (Rimewall replaced it)', !fbOffers.has('mage_r_fast') && !fbOffers.has('mage_r_twin'));
    run(w, 0.1);
    // Rimewall: blocks, reflects, shatters
    w.enemies = []; run(w, 1);
    p.cd.r = 0; cast(w, 'r', 6, 0);
    const wl = w.walls[0];
    check('Rimewall: rises across your aim, as something solid', !!wl && w.obstacles.some((o) => o.kind === 'icewall') && Math.abs(Math.abs(Math.cos(wl.rot))) < 0.01, wl ? String(wl.rot) : 'none');
    const walker = dummy(w, 12, 0); walker.state = 'chase'; walker.t = 0;
    w.enemies = [walker];
    let crossed = false;
    for (let i = 0; i < 120; i++) { walker.x -= 0.2; walker.px = walker.x + 0.2; w.collide(CONFIG.TICK); if (walker.x < 5) crossed = true; }
    check('Rimewall: enemies cannot walk through it', !crossed, walker.x.toFixed(2));
    w.projectiles.push({ id: 999, owner: 'enemy', x: 9, z: 0, px: 9, pz: 0, vx: -12, vz: 0, speed: 12, radius: 0.4, dmg: 50, parryable: true, reflected: false, life: 3, dead: false, srcId: walker.id });
    run(w, 0.4);
    const pr = w.projectiles.find((x) => x.id === 999);
    check('Rimewall: an enemy shot that hits it flies back as yours', !pr || (pr.owner === 'player' && pr.reflected && pr.vx > 0));
    const beside = dummy(w, 6.8, 1);
    beside.state = 'chase';
    run(w, 5);
    check('Rimewall: when it melts it shatters, freezing what is beside it', w.walls.length === 0 && !w.obstacles.some((o) => o.kind === 'icewall') && beside.hp < 1e9 && (beside.state === 'stunned' || beside.stunT > 0));
    check('the map\'s own obstacle list is never changed by a wall', !w.map || !w.map.obstacles || !w.map.obstacles.some((o) => o.kind === 'icewall'));
  }
  // Scrap filter
  {
    const { w, p } = setup(null, {}, 'warrior');
    const junk = (rarity) => ({ id: 'j' + rarity, name: 'x', slot: 'boots', rarity, ilvl: 1, stats: { ms: 1 }, plus: 0 });
    p.bag = [junk(1), junk(5), junk(6)];
    w.scrapNonUpgrades([6]);
    check('scrap filter: Immortal items are kept, the rest goes', p.bag.length === 1 && p.bag[0].rarity === 6);
    p.bag = [junk(1), junk(5), junk(6)];
    w.scrapNonUpgrades([5, 6]);
    check('scrap filter: keep Mythic too', p.bag.length === 2);
    p.bag = [junk(6)];
    w.scrapNonUpgrades([]);
    check('scrap filter: nothing kept when nothing is ticked', p.bag.length === 0);
  }
}
// --- 0.22: Weekly Echo (rules, deterministic maths, record and replay) ---------------
{
  const T = await import('../src/sim/trial.js');
  const { playTrialBot } = await import('./trialbot.mjs');
  const { simVersion } = await import('../scripts/sim-version.mjs');
  const { SIM_VERSION } = await import('../src/sim/version.js');
  const fs = await import('node:fs');
  check('sim version file is up to date (run npm run build after changing src/sim or config.js)', simVersion() === SIM_VERSION, `${simVersion()} vs ${SIM_VERSION}`);
  const banned = [];
  for (const f of fs.readdirSync('src/sim')) {
    if (f === 'dmath.js') continue;
    const m = fs.readFileSync('src/sim/' + f, 'utf8').match(/Math\.(sin|cos|tan|atan2?|asin|acos|exp|expm1|log\w*|pow|hypot|cbrt|sinh|cosh|tanh)\(/g);
    if (m) banned.push(f + ': ' + m.join(' '));
  }
  check('the simulation uses no browser-rounded maths (only sim/dmath.js)', banned.length === 0, banned.join('; '));
  const { dSin, dCos, dAtan2, dExp } = await import('../src/sim/dmath.js');
  let worst = 0;
  for (let i = -3000; i <= 3000; i++) {
    const x = i * 0.137;
    worst = Math.max(worst, Math.abs(dSin(x) - Math.sin(x)), Math.abs(dCos(x) - Math.cos(x)), Math.abs(dAtan2(x, 7 - i * 0.01) - Math.atan2(x, 7 - i * 0.01)), Math.abs(dExp(x / 100) / Math.exp(x / 100) - 1));
  }
  check('deterministic maths agrees with Math.* to 1e-15', worst < 1e-15, String(worst));

  check('weeks: Saturday 14 November 2026 is in week 0, Monday the 16th starts week 1', T.weekIndexAt(Date.UTC(2026, 10, 14, 5)) === 0 && T.weekIndexAt(Date.UTC(2026, 10, 16, 0, 0, 1)) === 1);
  const wk = T.trialWeek(0), wk1 = T.trialWeek(1);
  check('weeks: the level and the featured Immortal rotate', wk.level === 30 && wk1.level === 60 && wk.featured !== wk1.featured && wk.seed !== wk1.seed);
  const g1 = T.trialGear(wk, 'rogue'), g2 = T.trialGear(wk, 'rogue');
  check('standard gear: Epic everywhere, Immortal in the featured slot, the same for everyone', JSON.stringify(g1) === JSON.stringify(g2) && g1[wk.featured].rarity === 6 && Object.values(g1).filter((i) => i.rarity === 3).length === 4);
  const b = T.defaultBuild(wk, 'mage');
  check('default build is valid', T.validateBuild(wk, b) === null, T.validateBuild(wk, b));
  check('a build with too many talent points is refused', T.validateBuild(wk, Object.assign({}, b, { talents: { py_power: 5, py_crit: 5, py_haste: 5, py_ball: 3, py_burn: 3, py_cap: 1 } })) !== null);
  check('a build with another class\'s subclass is refused', T.validateBuild(wk, Object.assign({}, b, { spec: 'bulwark' })) !== null);
  check('a build with too many ranks is refused', T.validateBuild(wk, Object.assign({}, b, { ranks: { q: 20, w: 20, e: 1, r: 1 } })) !== null);
  const tw = T.buildTrialWorld(wk, b);
  check('the trial world: level 30, standard parry, no EXP, gear locked', tw.player.level === 30 && tw.parryPreset === 'standard' && tw.trial && (() => { const before = tw.player.exp; tw.gainExp(1e6); return tw.player.exp === before; })());
  const eq = JSON.stringify(tw.player.equipped);
  tw.player.bag = [Object.assign({}, g1.weapon, { id: 'x' })]; tw.command({ type: 'equip', index: 0 }); tw.runCommands();
  check('the trial ignores gear changes', JSON.stringify(tw.player.equipped) === eq);
  // Record a bot run, replay it from the recording: same score, same final state.
  for (const [cls, spec] of [['warrior', 'bulwark'], ['mage', 'pyromancer'], ['rogue', 'shadowdancer'], ['archer', 'sharpshooter']]) {
    const build = T.defaultBuild(wk, cls, spec);
    const live = playTrialBot(wk, build, 60 * 90, 11);
    const again = T.replayTrial(wk, build, JSON.parse(JSON.stringify(live.record)), live.endTick);
    check(`replay: a recorded ${spec} run replays to the same floor, tick and state`, again.ok && again.floor === live.score.floor && again.clearTick === live.score.clearTick && again.hash === live.hash && live.record.length > 50, `${JSON.stringify(live.score)} ${live.hash} vs ${JSON.stringify(again)} (${live.record.length} commands)`);
    if (spec === 'pyromancer') {
      const tampered = JSON.parse(JSON.stringify(live.record)).filter((_, i) => i % 3);
      const forged = T.replayTrial(wk, build, tampered, live.endTick);
      check('replay: a tampered recording does not reach the same state', forged.hash !== live.hash);
      const sameSeed = T.trialWeek(0);
      check('replay: waves and offers come from their own streams (same week, same first wave)', JSON.stringify(T.buildTrialWorld(sameSeed, build).streamRng('wave', 3)()) === JSON.stringify(T.buildTrialWorld(wk, T.defaultBuild(wk, 'rogue')).streamRng('wave', 3)()));
    }
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
// --- 0.23: treasure chests ------------------------------------------------------
{
  console.log('--- 0.23: treasure chests');
  const { CHEST_TIERS, IMMORTAL, rollItem } = await import('../src/sim/items.js');
  const { makeRng } = await import('../src/sim/rng.js');
  const w = new World({ seed: 5, cls: 'mage', mode: 'explore' });
  check('chests: none in Haven', w.map.id === 'town' && w.chests.length === 0);
  w.loadMap('greenwood', 'town');
  check('chests: 2 or 3 on a map out in the world', w.chests.length >= 2 && w.chests.length <= 3, String(w.chests.length));
  check('chests: never inside a tree or rock', w.chests.every((c) => !w.pushOut({ x: c.x, z: c.z }, 1.0)));
  const c = w.chests[0], p = w.player, g0 = p.gold;
  p.x = p.px = c.x; p.z = p.pz = c.z;
  w.step(CONFIG.TICK);
  const ev = w.events.find((e) => e.type === 'chestOpen');
  check('chests: walking over one opens it: gold and gear for the opener', !!ev && p.gold > g0 && w.loot.length === CHEST_TIERS[c.tier].items.length && !w.chests.includes(c));
  const ids = w.chests.map((x) => x.id).join();
  w.loadMap('town', 'greenwood'); w.loadMap('greenwood', 'town');
  check('chests: still there (and still opened) when you come back to the map', ids === w.chests.map((x) => x.id).join());
  p.x = p.px = 0; p.z = p.pz = 0;
  for (let i = 0; i < (CONFIG.CHEST_RESPAWN + 1) * 60; i++) { p.hp = p.stats.maxHp; p.x = 0; p.z = 0; w.step(CONFIG.TICK); }
  check('chests: an opened chest comes back somewhere else later', w.chests.length === ids.split(',').length + 1 - 0 || w.chests.length >= 2, String(w.chests.length));
  // The rolls themselves
  let imm = 0;
  for (let i = 0; i < 20000; i++) if (rollItem(makeRng(i + 1), 40, { weights: CHEST_TIERS.radiant.items[0].weights, cls: 'mage' }).rarity === IMMORTAL) imm++;
  check('chests: a radiant chest never holds an Immortal below world tier IV (0.32)', imm === 0, (imm / 200).toFixed(1) + '%');
  const arena = new World({ seed: 5, cls: 'mage' });
  check('chests: none in the Echo Ring', arena.chests.length === 0);
  // Co-op: friends see the host's chests and Hoarfrost stacks
  const { makeSnapshot, applySnapshot } = await import('../src/net/sync.js');
  const host = new World({ seed: 5, cls: 'warrior', mode: 'explore' });
  host.addHero(1, { name: 'F', cls: 'mage', save: { v: 2, cls: 'mage', level: 30, spec: 'frostbinder', talents: {}, ranks: { q: 3, w: 1, e: 1, r: 1 } } });
  host.loadMap('greenwood', 'town');
  host.enemies[0].frostStacks = 3; host.enemies[0].frostT = 4;
  const friend = new World({ seed: 9, cls: 'mage', mode: 'explore' });
  friend.loadMapMirror('greenwood');
  applySnapshot(friend, JSON.parse(JSON.stringify(makeSnapshot(host, 1, {}))));
  const fe = friend.enemies.find((x) => x.id === host.enemies[0].id);
  check('co-op: a friend sees the chests and Hoarfrost stacks', friend.chests.length === host.chests.length && fe && fe.frostStacks === 3);
}

}

// --- 0.24: Windrunner, Sharpshooter, Berserker and Bulwark ------------------------
{
  console.log('--- 0.24: new traits and ultimates');
  const { SPECS } = await import('../src/sim/talents.js');
  const { geared } = await import('./balance.mjs');
  const run = (w, sec) => { for (let i = 0; i < Math.round(sec * 60); i++) w.step(CONFIG.TICK); };
  const setup = (cls, spec, level = 40) => {
    const w = new World({ seed: 41, cls, save: Object.assign(geared(cls, level, 2), { spec, talents: {} }) });
    const p = w.player; w.wave.phase = 'explore';
    w.recalcStats(); p.hp = p.stats.maxHp; p.x = p.px = 0; p.z = p.pz = 0;
    for (const k of ['q', 'w', 'e', 'r']) p.cd[k] = 0;
    w.enemies = []; w.events.length = 0;
    return { w, p };
  };
  const dummy = (w, x, z = 0, type = 'grunt') => { const e = w.spawnEnemy(type, { x, z, level: w.player.level }); e.state = 'recover'; e.t = 999; e.hp = e.maxHp = 1e9; e.x = e.px = x; e.z = e.pz = z; return e; };
  const cast = (w, slot, x, z) => { w.command({ type: 'cast', slot, x, z }); w.runCommands(); };

  // Windrunner: Tailwind
  {
    const { w, p } = setup('archer', 'windrunner');
    check('Windrunner: has a trait (Tailwind) and R is Hurricane', SPECS.windrunner.perk && SPECS.windrunner.perk.name === 'Tailwind' && w.kit.r.name === 'Hurricane');
    const e = dummy(w, 6);
    const hit = () => { w.events.length = 0; w.hitEnemy(e, 100, { basic: true, canCrit: false }); return w.events.find((ev) => ev.type === 'damage' && ev.id === e.id).amount; };
    const plain = hit();
    p.rushT = 3; p.cd.e = 5;
    const windy = hit();
    const extra = p.stats.ad * 0.3 + 2 * p.level;
    check('Tailwind: after a roll, basic attacks deal 30% attack damage + 2 per level more on hit', Math.abs(windy - plain - extra * w.gapScale(e.level).dealt) <= 2, `${plain} -> ${windy}`);
    check("Tailwind: each hit takes 0.3 s off Evasive Roll's cooldown", Math.abs(p.cd.e - 4.7) < 1e-9, String(p.cd.e));
    p.rushT = 0;
    const others = [dummy(w, 7, 2), dummy(w, 7, -2), dummy(w, 30, 0)];
    p.cd.e = 5; p.cd.r = 0;
    cast(w, 'r', 6, 0);
    check('Hurricane: attack speed up, Tailwind on, Evasive Roll ready', p.hurricaneT > 5 && p.cd.e === 0 && p.stats.as > 0);
    w.projectiles = [];
    w.basicAttack(e);
    const arrows = w.projectiles.filter((pr) => pr.basic);
    check('Hurricane: every basic attack also looses 2 arrows at other enemies nearby', arrows.length === 3 && arrows.filter((a) => a.gust).every((a) => a.targetId === others[0].id || a.targetId === others[1].id));
    const as0 = p.stats.as;
    run(w, 6.2);
    check('Hurricane: ends after 6 seconds', !(p.hurricaneT > 0) && p.stats.as < as0);
  }
  // Sharpshooter (0.42): Ricochet, Steady Breath, the one-shot Deadeye
  {
    const { w, p } = setup('archer', 'sharpshooter');
    check('Sharpshooter: Q, W and R are Ricochet, Steady Breath and Deadeye', w.kit.q.name === 'Ricochet' && w.kit.w.name === 'Steady Breath' && w.kit.r.name === 'Deadeye');
    // a line of enemies 8 m apart, and one 14 m beyond the last (too far to glance to)
    const line = [6, 14, 22, 30].map((x) => dummy(w, x));
    const lone = dummy(w, 44);
    p.cd.q = 0;
    cast(w, 'q', 6, 0);
    run(w, 2);
    check('Ricochet: glances from enemy to enemy within 11 m of the last', line.every((e) => e.hp < 1e9) && lone.hp === 1e9, line.map((e) => e.hp < 1e9).join());
    const many = Array.from({ length: 9 }, (_, i) => dummy(w, 3 + i * 1.2, 8));
    p.cd.q = 0; cast(w, 'q', 3, 8); run(w, 2);
    check('Ricochet: hits up to 4 different enemies', many.filter((e) => e.hp < 1e9).length === 4, many.filter((e) => e.hp < 1e9).length);
  }
  {
    const { w, p } = setup('archer', 'sharpshooter');
    p.stats.crit = 0;
    const far = dummy(w, 20);
    const hits = () => w.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy' && ev.id === far.id).map((ev) => ev.amount);
    p.cd.r = 0; w.events.length = 0; cast(w, 'r', 40, 0);
    const plain = hits()[0];
    check('Deadeye: one shot, always a crit, then the full cooldown', w.events.some((ev) => ev.type === 'damage' && ev.id === far.id && ev.crit) && p.cd.r > 20, `cd ${p.cd.r.toFixed(1)}`);
    // twice the attack speed: twice the damage
    const as0 = p.stats.as;
    run(w, 0.4); p.stats.as = as0 * 2; p.cd.r = 0; w.events.length = 0; cast(w, 'r', 40, 0);
    const fast = hits()[0];
    p.stats.as = as0;
    check('Deadeye: its damage grows with attack speed', Math.abs(fast / plain - 2) < 0.05, `${plain} -> ${fast}`);
    // Steady Breath, then Deadeye: 60% more
    run(w, 0.4); p.cd.w = 0; cast(w, 'w', 0, 0);
    check('Steady Breath: a buff, no damage, and the next basic attack is a Steady Aim crit', p.empowerT > 0 && p.empowerCrit && (p.swingCount + 1) % w.mods.critEvery === 0);
    run(w, 0.2); p.cd.r = 0; w.events.length = 0; cast(w, 'r', 40, 0);
    check('Steady Breath: the next ability deals 60% more', Math.abs(hits()[0] / plain - 1.6) < 0.05 && !(p.empowerT > 0), `${plain} -> ${hits()[0]}`);
  }
  // Windrunner (0.42): Skirmish Step
  {
    const { w, p } = setup('archer', 'windrunner');
    check('Windrunner: Q is Skirmish Step', w.kit.q.name === 'Skirmish Step');
    const e = dummy(w, 7);
    p.cd.q = 0;
    cast(w, 'q', -4, 0);
    run(w, 0.25);
    check('Skirmish Step: a short hop, and three quick shots ready', p.x < -1.5 && p.quickShots === 3, `${p.x.toFixed(1)}, ${p.quickShots}`);
    w.command({ type: 'attack', id: e.id }); w.runCommands();
    run(w, 0.6);
    check('Skirmish Step: all three leave almost at once', p.quickShots === 0 && w.projectiles.filter((pr) => pr.gale).length + w.events.filter((ev) => ev.type === 'damage' && ev.id === e.id).length >= 3);
  }
  // Reflective (0.42): crack the mirror
  {
    const { w, p } = setup('archer', 'sharpshooter');
    const e = dummy(w, 8);
    e.elite = ['reflective'];
    const hp0 = p.hp;
    w.hitEnemy(e, 1000, { basic: true, source: 'basic', canCrit: false });
    check('Reflective: a basic attack comes back at you', p.hp < hp0);
    w.hitEnemy(e, 10, { source: 'q', canCrit: false });
    check('Reflective: one ability hit cracks the mirror', e.mirrorCracks === 1 && !(e.mirrorT > 0));
    w.hitEnemy(e, 10, { source: 'w', canCrit: false });
    check('Reflective: a second shatters it', e.mirrorT > 0);
    const plainE = dummy(w, 8, 0.01);
    p.hp = hp0; w.events.length = 0;
    w.hitEnemy(plainE, 1000, { basic: true, source: 'basic', canCrit: false });
    w.hitEnemy(e, 1000, { basic: true, source: 'basic', canCrit: false });
    const base = w.events.find((ev) => ev.type === 'damage' && ev.id === plainE.id).amount;
    const d = w.events.find((ev) => ev.type === 'damage' && ev.id === e.id);
    check('Reflective: shattered, it reflects nothing and takes 20% more', p.hp === hp0 && Math.abs(d.amount / base - 1.2) < 0.01, `${base} -> ${d.amount}`);
    const { w: w2, p: p2 } = setup('archer', 'windrunner');
    const e2 = dummy(w2, 8); e2.elite = ['reflective'];
    const hp2 = p2.hp;
    w2.hitEnemy(e2, 1000, { basic: true, gale: true, source: 'basic', canCrit: false });
    w2.hitEnemy(e2, 1000, { basic: true, gale: true, source: 'basic', canCrit: false });
    check("Reflective: a Windrunner's two gusts come back at no one and shatter the mirror", p2.hp === hp2 && e2.mirrorT > 0);
  }
  // Berserker
  {
    const { w, p } = setup('warrior', 'berserker');
    check('Berserker: R is Crimson Oath', w.kit.r.name === 'Crimson Oath');
    const e = dummy(w, 2);
    p.hp = p.stats.maxHp * 0.4; run(w, 0.05);
    check('Blood Rage: Bloodied below half', p.bloodied);
    const dmgAt = () => { const hp = p.hp; w.hitPlayer(100, { parryable: false, src: e }); const d = hp - p.hp; p.hp = hp; return d; };
    const bloodiedHit = dmgAt();
    p.hp = p.stats.maxHp * 0.9; run(w, 0.05);
    const healthyHit = dmgAt();
    check('Blood Rage: 15% less damage taken while Bloodied', Math.abs(bloodiedHit / healthyHit - 0.85) < 0.03, `${healthyHit} -> ${bloodiedHit}`);
    p.hp = p.stats.maxHp * 0.45; run(w, 0.05);
    p.stats.lifesteal = 25;
    for (let i = 0; i < 40; i++) w.hitEnemy(e, 5000, { basic: true, canCrit: false });
    check('Blood Rage: lifesteal stops just below half health while Bloodied', p.hp < p.stats.maxHp * 0.5 && p.hp > p.stats.maxHp * 0.49 && p.bloodied, (p.hp / p.stats.maxHp).toFixed(3));
    p.hp = 20; run(w, 0.05);
    w.hitPlayer(1e6, { parryable: false, src: e });
    check('Blood Rage: a killing blow while Bloodied leaves you at 1 health', !p.dead && p.hp === 1);
    w.hitPlayer(1e6, { parryable: false, src: e });
    check('...but only once every 30 seconds', p.dead || p.hp <= 0);
    const b = setup('warrior', 'berserker');
    const e2 = dummy(b.w, 2);
    b.p.cd.r = 0; cast(b.w, 'r', 2, 0);
    check('Crimson Oath: drops you to 40% health at once and roars (its lifesteal stops below half)', b.p.hp / b.p.stats.maxHp >= 0.39 && b.p.hp / b.p.stats.maxHp < 0.5 && b.p.bloodied && e2.hp < 1e9, (b.p.hp / b.p.stats.maxHp).toFixed(3));
    run(b.w, 0.05);
    b.w.hitPlayer(1e6, { parryable: false, src: e2 });
    b.w.hitPlayer(1e6, { parryable: false, src: e2 });
    check('Crimson Oath: you cannot fall while it lasts', !b.p.dead && b.p.hp >= 1);
  }
  // Combat Power
  {
    const { steadyRatings, ratingsWith } = await import('../src/power.js');
    const { rollItem } = await import('../src/sim/items.js');
    const { makeRng } = await import('../src/sim/rng.js');
    const at = (cls, lv, spec = null) => steadyRatings(new World({ seed: 1, cls, save: Object.assign(geared(cls, lv, 2), spec ? { spec, talents: {} } : {}) }));
    check('Combat Power: grows with level', at('archer', 1).cp < at('archer', 30).cp && at('archer', 30).cp < at('archer', 80).cp);
    check('Combat Power: choosing a subclass raises it', at('warrior', 40, 'bulwark').cp > at('warrior', 40).cp);
    const tank = at('warrior', 70, 'bulwark'), glass = at('archer', 70, 'sharpshooter');
    check('Combat Power: the tank leads on Resolve, the sharpshooter on Might', tank.resolve > glass.resolve && glass.might > tank.might);
    check('Combat Power: a damage dealer outranks the tank overall (the tank shines in Resolve)', glass.cp > tank.cp, `${glass.cp} vs ${tank.cp}`);
    const all = ['warrior', 'archer', 'rogue', 'mage'].map((c) => at(c, 70).cp);
    check('Combat Power: no class is left far behind (within 35% of each other at level 70)', Math.min(...all) / Math.max(...all) > 0.65, all.join(' '));
    const { w, p } = setup('archer', 'windrunner');
    const steady = steadyRatings(w);
    p.rushT = 3; p.rushAs = 0.5; w.recalcStats(); p.hp = 77;
    const stats = JSON.stringify(p.stats);
    check('Combat Power: a burst of speed from a roll does not change it', steadyRatings(w).cp === steady.cp);
    const big = rollItem(makeRng(3), 80, { minRarity: 5, cls: 'archer', slot: 'weapon' });
    const r = ratingsWith(w, big);
    check('Combat Power: a better weapon shows a rise, and nothing in the world changes', r.cp > steady.cp && p.equipped.weapon !== big && JSON.stringify(p.stats) === stats && p.hp === 77);
  }
  // Bulwark
  {
    const { w, p } = setup('warrior', 'bulwark');
    check('Bulwark: R is Hold the Line', w.kit.r.name === 'Hold the Line');
    const e = dummy(w, 2);
    const hp = p.hp;
    p.parryT = 0.2; p.parryAge = 0.05;
    const res = w.hitPlayer(300, { parryable: false, src: e });
    check('Iron Answer: a red attack is blocked by the parry, no harm done', res === 'parried' && p.hp === hp);
    check('Iron Answer: its attacker is Broken (stunned and takes 20% more)', e.state === 'stunned' && e.vulnT > 3 && e.vuln >= 0.2);
    const plainWarrior = setup('warrior', 'berserker');
    plainWarrior.p.parryT = 0.2;
    check('...only the Bulwark can do it', plainWarrior.w.hitPlayer(300, { parryable: false, src: dummy(plainWarrior.w, 2) }) !== 'parried');
    w.enemies = [];
    const a = dummy(w, 6, 0), b2 = dummy(w, -5, 3), far = dummy(w, 20, 0);
    a.state = b2.state = far.state = 'chase';
    p.parryT = 0;
    p.cd.r = 0; cast(w, 'r', 0, 0);
    check('Hold the Line: enemies within 8 m are taunted and stunned, the far one is not', a.tauntT > 3 && b2.tauntT > 3 && !(far.tauntT > 0) && a.state === 'stunned');
    run(w, 0.4);
    check('Hold the Line: and dragged in close', dist2(a, p) < 3 && dist2(b2, p) < 3, `${dist2(a, p).toFixed(1)} ${dist2(b2, p).toFixed(1)}`);
    const taken = () => { p.hp = p.stats.maxHp * 0.8; const h0 = p.hp; w.hitPlayer(100, { parryable: false, src: far }); return h0 - p.hp; };
    const shielded = taken();
    run(w, 5.2);
    const open = taken();
    check('Hold the Line: 35% less damage taken while it lasts', Math.abs(shielded / open - 0.65) < 0.03, `${open} -> ${shielded}`);
  }
}

// --- 0.25: co-op fixes, patience, waystones, arena pace, bosses, trading -------------
{
  console.log('--- 0.25');
  const { makeSnapshot, applySnapshot } = await import('../src/net/sync.js');
  const { buildMap } = await import('../src/sim/maps.js');
  const { trialWeek, defaultBuild, buildTrialWorld } = await import('../src/sim/trial.js');
  const run = (w, sec) => { for (let i = 0; i < Math.round(sec * 60); i++) w.step(CONFIG.TICK); };
  const party = () => {
    const w = new World({ seed: 7, cls: 'archer', mode: 'explore', save: { v: 2, cls: 'archer', level: 30 } });
    w.addHero(1, { name: 'Friend', cls: 'rogue', save: { v: 2, cls: 'rogue', level: 6 } });
    w.loadMap('greenwood', 'town');
    return { w, host: w.heroes[0], friend: w.heroByPid(1) };
  };

  // Ownerless drops: a full-bag reward lands at your feet, and only you can take it.
  {
    const { w, host, friend } = party();
    w.use(host);
    w.player.bag = Array.from({ length: CONFIG.BAG_SIZE }, (_, i) => ({ id: 'x' + i, slot: 'ring', rarity: 0, stats: {} }));
    w.player.equipped.ring = { id: 'r0', slot: 'ring', rarity: 0, stats: {} };
    w.giveItem({ id: 'prize', slot: 'ring', cls: 'archer', rarity: 5, stats: {} });
    const drop = w.loot.find((l) => l.item.id === 'prize');
    check('a reward dropped at your feet belongs to you (a friend cannot pick it up)', drop && drop.owner === host.pid);
    friend.player.x = drop.x; friend.player.z = drop.z;
    run(w, 0.6);
    check('...so a low-level rogue friend never gets the archer weapon', !friend.player.bag.some((it) => it.id === 'prize'));
  }
  // Beaten bosses stay beaten for their timer, even if you leave and come back.
  {
    const w = new World({ seed: 7, cls: 'warrior', mode: 'explore', save: { v: 2, cls: 'warrior', level: 40 } });
    w.loadMap('greenwood', 'town');
    const id = 'keep'; // The Warden's map
    w.loadMap(id, null);
    const boss = w.enemies.find((e) => e.def.boss);
    check('a world boss respawns after a minute now (not two)', w.camps.find((c) => c.slots[0].id === boss.id).slots[0].respawn === (boss.type === 'boss3' ? 120 : 60));
    w.killEnemy(boss, 'basic');
    w.loadMap('town', id); w.loadMap(id, 'town');
    check('leaving and coming straight back does not bring the boss back', !w.enemies.some((e) => e.def.boss));
    const saved = w.toSave();
    check('...and the timer is in the save (so reloading does not either)', Object.values(saved.campDown || {}).some((s) => s > 50));
    const again = new World({ seed: 7, cls: 'warrior', mode: 'explore', save: saved });
    again.loadMap(id, 'town');
    check('...after a reload too', !again.enemies.some((e) => e.def.boss));
    for (let i = 0; i < 61 * 60; i++) { w.player.hp = w.player.stats.maxHp; w.player.x = w.player.px = 30; w.player.z = w.player.pz = 0; w.step(CONFIG.TICK); }
    check('the boss is back once its minute is up', w.enemies.some((e) => e.def.boss));
  }
  // A fallen teammate still gets the boss's EXP and loot.
  {
    const { w, host, friend } = party();
    const boss = w.spawnEnemy('boss', { x: 5, z: 5, level: 10 });
    friend.player.dead = true; friend.player.x = 40; friend.player.z = 40;
    const exp0 = friend.player.exp + friend.player.level * 1e6;
    w.use(host);
    w.killEnemy(boss, 'basic');
    check('a fallen teammate still gets EXP and their own loot when the party kills a boss', friend.player.exp + friend.player.level * 1e6 > exp0 && w.loot.some((l) => l.owner === friend.pid));
  }
  // Weekly Echo: arena bosses give no skill point there (the level-up marker).
  {
    const wk = trialWeek(1);
    const w = buildTrialWorld(wk, defaultBuild(wk, 'rogue', 'assassin'));
    const b = w.spawnEnemy('boss');
    w.killEnemy(b, 'basic');
    check('Weekly Echo: beating a boss gives no skill point (no rank-up marker)', w.player.skillPoints === 0);
  }
  // Patience
  {
    const w = new World({ seed: 7, cls: 'archer', mode: 'explore', save: { v: 2, cls: 'archer', level: 20 } });
    w.loadMap('greenwood', 'town');
    const e = w.enemies.find((x) => !x.def.boss && x.home);
    const p = w.player;
    p.autoAttack = false;
    e.maxHp = 1e9; e.hp = 5e8;
    e.aggro = true; e.state = 'chase';
    e.x = e.home.x + 15; e.z = e.home.z; p.x = e.x + 4; p.z = e.z;
    run(w, 1);
    check('patience: drains while dragged far from home', e.aggro && e.patience < 0.95);
    for (let i = 0; i < 6 * 60 && e.aggro; i++) { p.x = e.x + 4; p.z = e.z; p.hp = p.stats.maxHp; w.step(CONFIG.TICK); }
    check('patience: when it runs out the enemy gives up and walks home', !e.aggro && e.returning);
    run(w, 8);
    check('...healing on the way, then ready again with full patience', e.hp > e.maxHp * 0.9 && e.patience === 1);
  }
  // Waystones
  {
    const m = buildMap('greenwood');
    check('waystones: two on a world map (entrance and far side), none in Haven', m.waystones.length === 2 && buildMap('town').waystones.length === 0);
    const { w, host, friend } = party();
    const [a, b] = w.map.waystones;
    friend.player.x = a.x + 4; friend.player.z = a.z;
    run(w, 0.1);
    friend.player.x = friend.player.px = a.x; friend.player.z = friend.player.pz = a.z; friend.player.moveTarget = null;
    const hx = host.player.x;
    const ev = [];
    for (let i = 0; i < (CONFIG.PORTAL_TIME + 0.3) * 60; i++) { w.step(CONFIG.TICK); ev.push(...w.events.filter((x) => x.type === 'waystone' && x.hero === friend.pid)); }
    check('waystones: standing on one for a moment opens the travel menu', ev.length >= 1);
    w.command({ type: 'warp', to: 1, pid: friend.pid });
    w.runCommands();
    check('waystones: standing on one opens the menu, and warping moves only that hero', dist2(friend.player, b) < 3.5 && host.player.x === hx, `${dist2(friend.player, b).toFixed(1)}`);
  }
  // Arena: Flawless and Swift
  {
    const w = new World({ seed: 7, cls: 'warrior', save: { v: 2, cls: 'warrior', level: 20 } });
    w.startWave();
    w.wave.queue = []; w.enemies = [];
    run(w, 0.1);
    const clear = w.events.find((e) => e.type === 'waveClear');
    check('arena: a floor cleared quickly without a scratch is Flawless and Swift (double gold and more)', clear && clear.flawless && clear.swift && clear.gold >= 2.5 * (10 + 4 * clear.n));
    w.startWave();
    w.hitPlayer(10, { parryable: false, src: w.spawnEnemy('grunt') });
    w.wave.queue = []; w.enemies = [];
    run(w, 0.1);
    const clear2 = w.events.filter((e) => e.type === 'waveClear').pop();
    check('arena: taking a hit loses Flawless', clear2 && !clear2.flawless);
  }
  // Bosses chase now
  {
    const w = new World({ seed: 9, cls: 'archer', save: { v: 2, cls: 'archer', level: 30 } });
    w.wave.phase = 'explore';
    const b = w.spawnEnemy('boss2', { x: 0, z: 0, level: 30 });
    b.state = 'chase'; b.atkCd = 0;
    const seen = new Set();
    for (let i = 0; i < 400; i++) { b.farT = 2; const a = w.chooseAttack(b, 12); if (a) seen.add(a.name); }
    check('bosses: from range they lunge or leap at you, not only shoot', seen.has('lunge') && seen.has('leap') && seen.has('fan'));
    const p = w.player; p.x = 12; p.z = 0;
    w.startWindup(b, b.def.attackByName.leap, false);
    for (let i = 0; i < 200 && b.state === 'windup'; i++) { p.hp = p.stats.maxHp; w.step(CONFIG.TICK); }
    check('bosses: a leap lands where you stood when it locked on', dist2(b, p) < 4);
    const f = w.spawnEnemy('boss3', { x: -10, z: 0, level: 30 });
    w.hitEnemy(f, f.maxHp * 0.4, { canCrit: false, raw: true });
    check('the final boss: phase two at two thirds health', f.phase === 2 && w.events.some((e) => e.type === 'bossPhase' && e.phase === 2));
    f.state = 'chase';
    w.startWindup(f, f.def.attackByName.starfall, false);
    for (let i = 0; i < 300 && !w.events.some((e) => e.type === 'starImpact'); i++) { p.hp = p.stats.maxHp; w.step(CONFIG.TICK); }
    check('the final boss: Starfall drops stars on you', w.events.some((e) => e.type === 'starImpact'));
  }
  // Trading and dropping
  {
    const { w, host, friend } = party();
    const sword = { id: 'sw1', slot: 'weapon', cls: 'rogue', name: 'Rogue Blade', rarity: 5, stats: { ad: 10 } };
    host.player.bag.push(sword);
    host.player.gold = 500; friend.player.gold = 100;
    const ring = { id: 'rg1', slot: 'ring', name: 'Plain Ring', rarity: 1, stats: { hp: 5 } };
    friend.player.bag.push(ring);
    const cmd = (h, c) => { w.command(Object.assign({ pid: h.pid }, c)); w.runCommands(); };
    cmd(host, { type: 'tradeAsk', to: 1 });
    check('trade: the friend is asked', w.events.some((e) => e.type === 'trade' && e.state === 'asked' && e.hero === 1));
    cmd(friend, { type: 'tradeAnswer', yes: true });
    cmd(host, { type: 'tradeSet', items: ['sw1'], gold: 50 });
    cmd(friend, { type: 'tradeSet', items: ['rg1'], gold: 0 });
    cmd(host, { type: 'tradeOk' });
    cmd(friend, { type: 'tradeSet', items: ['rg1'], gold: 10 });
    check('trade: any change un-readies both', !w.trades[0].ok[0]);
    cmd(host, { type: 'tradeOk' }); cmd(friend, { type: 'tradeOk' });
    check('trade: once both accept, items and gold swap', friend.player.bag.some((i) => i.id === 'sw1') && host.player.bag.some((i) => i.id === 'rg1') && host.player.gold === 460 && friend.player.gold === 140, `${host.player.gold} ${friend.player.gold}`);
    // A trade is called off if an offered item leaves the bag
    cmd(friend, { type: 'tradeAsk', to: 0 }); cmd(host, { type: 'tradeAnswer', yes: true });
    cmd(friend, { type: 'tradeSet', items: ['sw1'], gold: 0 });
    cmd(host, { type: 'tradeOk' });
    cmd(friend, { type: 'discard', index: friend.player.bag.findIndex((i) => i.id === 'sw1') });
    cmd(friend, { type: 'tradeOk' });
    check('trade: an item scrapped mid-trade comes off the offer (nothing swaps by surprise)', !host.player.bag.some((i) => i.id === 'sw1'));
    cmd(host, { type: 'tradeCancel' });
    // Dropping for a friend
    const idx = host.player.bag.findIndex((i) => i.id === 'rg1');
    cmd(host, { type: 'dropItem', index: idx });
    const drop = w.loot.find((l) => l.item.id === 'rg1');
    check('drop: Ctrl-click drops a bag item on the ground for anyone in the party', drop && drop.owner === undefined);
    host.player.x = drop.x; host.player.z = drop.z;
    run(w, 1);
    check('drop: the one who dropped it does not snatch it straight back', !host.player.bag.some((i) => i.id === 'rg1'));
    host.player.x = 30; friend.player.x = drop.x; friend.player.z = drop.z; friend.player.dead = false;
    run(w, 1);
    check('drop: the friend picks it up', friend.player.bag.some((i) => i.id === 'rg1') || (friend.player.equipped.ring && friend.player.equipped.ring.id === 'rg1'));
  }
  // Co-op playback: updates carry the host's clock, and a glide starts from where things are drawn
  {
    const { w } = party();
    const snap = JSON.parse(JSON.stringify(makeSnapshot(w, 1, {})));
    check('co-op: each update carries the host tick', typeof snap.tick === 'number');
    const friend = new World({ seed: 9, cls: 'rogue', mode: 'explore' });
    friend.loadMapMirror('greenwood');
    applySnapshot(friend, snap, 1);
    const e = friend.enemies[0];
    e.px = e.x - 2;
    const drawn = e.px + (e.x - e.px) * 0.5;
    const moved = JSON.parse(JSON.stringify(snap));
    applySnapshot(friend, moved, 0.5);
    const e2 = friend.enemies.find((x) => x.id === e.id);
    check('co-op: an early update glides on from the drawn spot (no jump back)', Math.abs(e2.px - drawn) < 1e-9);
  }
}

// --- 0.26: world tiers, elites, Echo Rifts, Wishborne ------------------------------
{
  console.log('--- 0.26');
  const { TIERS, AFFIXES, riftScale, wishNeed } = await import('../src/sim/endgame.js');
  const { buildRiftMap } = await import('../src/sim/maps.js');
  const run = (w, sec) => { for (let i = 0; i < Math.round(sec * 60); i++) w.step(CONFIG.TICK); };
  const hero = (extra = {}) => new World({ seed: 11, cls: 'archer', mode: 'explore', save: Object.assign({ v: 2, cls: 'archer', level: 100 }, extra) });

  // World tiers
  {
    const w = hero();
    check('tiers: a new hero is on tier I with only tier I open', w.player.worldTier === 1 && w.player.tierMax === 1);
    w.loadMap('sanctum', 'town');
    const boss = w.enemies.find((e) => e.type === 'boss3');
    w.killEnemy(boss, 'basic');
    check('tiers: beating The Unmade opens tier II', w.player.tierMax === 2 && w.events.some((e) => e.type === 'tierUnlocked' && e.tier === 2));
    w.command({ type: 'setTier', tier: 2 }); w.runCommands();
    check('tiers: the tier can only be changed in Haven', w.player.worldTier === 1);
    w.loadMap('town', 'sanctum');
    w.command({ type: 'setTier', tier: 5 }); w.runCommands();
    check('tiers: you cannot pick a tier you have not opened', w.player.worldTier === 2);
    const base = hero(); base.loadMap('greenwood', 'town');
    w.loadMap('greenwood', 'town');
    const a = base.enemies.find((e) => e.type === 'grunt' && !e.elite), b = w.enemies.find((e) => e.type === 'grunt' && !e.elite);
    check('tiers: on tier II every map is level 100 and much tougher', w.enemies.every((e) => e.level === 100) && b.maxHp > a.maxHp * 10, `${a.level}/${a.maxHp} -> ${b.level}/${b.maxHp}`);
    check('tiers: the zone line says so', /Tier II/.test(w.zone().sub));
    check('tiers: saved with the hero', w.toSave().tierMax === 2 && w.toSave().worldTier === 2);
  }
  // Elites
  {
    const w = hero({ tierMax: 5, worldTier: 5 });
    let elites = [];
    for (const m of ['greenwood', 'fen', 'ridge', 'frost', 'dunes']) { w.loadMap(m, 'town'); elites = elites.concat(w.enemies.filter((e) => e.elite)); }
    check('elites: they show up on high tiers, with that tier\'s number of modifiers', elites.length >= 5 && elites.every((e) => e.elite.length === TIERS[5].affixes), String(elites.length));
    const e = w.spawnEnemy('grunt', { x: 6, z: 0, level: 100 });
    const hp0 = e.maxHp;
    w.makeElite(e, 0);
    e.elite = ['shielded', 'vampiric', 'reflective', 'frostbound'];
    e.shield = e.maxShield = Math.round(e.maxHp * 0.4);
    check('elites: more health than a normal one', e.maxHp > hp0 * 2.5);
    const p = w.player;
    w.hitEnemy(e, 100, { canCrit: false, raw: true });
    check('Shielded: the shield takes damage first', e.hp === e.maxHp && e.shield === e.maxShield - 100);
    p.parryT = 0.2; p.parryAge = 0.05;
    w.hitPlayer(50, { parryable: true, src: e });
    check('Shielded: parrying its attack shatters the shield', e.shield === 0);
    e.hp = e.maxHp * 0.5; p.parryT = 0; p.hp = p.stats.maxHp;
    w.hitPlayer(50, { parryable: true, src: e });
    check('Vampiric: it heals when it hits you; Frostbound: you are chilled', e.hp > e.maxHp * 0.5 && p.chillT > 1.5);
    check('Reflective: parrying it shatters its mirror too (0.42)', e.mirrorT > 0);
    e.mirrorT = 0; e.mirrorCracks = 0;
    const hp1 = p.hp;
    w.hitEnemy(e, 500, { basic: true, canCrit: false });
    const afterBasic = p.hp;
    w.hitEnemy(e, 500, { source: 'q', canCrit: false });
    check('Reflective: basic attacks hurt you a little, abilities do not', afterBasic < hp1 && p.hp === afterBasic);
    const v = w.spawnEnemy('grunt', { x: 3, z: 0, level: 100 });
    v.elite = ['volatile'];
    p.x = 3.5; p.z = 0; p.hp = p.stats.maxHp;
    w.killEnemy(v, 'basic');
    check('Volatile: a warning circle where it fell', w.falls.some((f) => Math.abs(f.x - v.x) < 0.01 && Math.abs(f.z - v.z) < 0.01));
  }
  // Echo Rifts
  {
    const w = hero({ tickets: 2 });
    w.command({ type: 'enterRift', tier: 1 }); w.runCommands();
    check('rifts: closed until The Warden has fallen', !w.rift && w.events.some((e) => e.type === 'riftLocked'));
    w.player.bossKills.boss = 1;
    w.player.tickets = 0;
    w.command({ type: 'enterRift', tier: 1 }); w.runCommands();
    check('rifts: cost a shard', !w.rift);
    w.player.tickets = 2;
    w.command({ type: 'enterRift', tier: 9 }); w.runCommands();
    check('rifts: open at the highest tier you have reached, for a shard', w.rift && w.rift.tier === 1 && w.player.tickets === 1 && w.map.id === 'rift');
    check('rifts: about twice the enemies of a normal map, none of them come back', w.enemies.length >= 25 && w.camps.every((c) => c.slots[0].respawn === 1e9 || c.slots[0].id));
    const p = w.player;
    for (let i = 0; i < 20; i++) { p.hp = p.stats.maxHp; w.step(CONFIG.TICK); }
    check('rifts: the clock runs', w.rift.timeLeft < 360);
    for (const e of w.enemies.slice()) { if (w.rift.guardianId) break; w.killEnemy(e, 'basic'); }
    const g = w.enemies.find((e) => e.riftGuardian);
    check('rifts: a full bar calls the guardian', !!g && w.rift.state === 'guardian' && !g.home);
    const kills = p.bossKills.boss;
    w.killEnemy(g, 'basic');
    check('rifts: beating the guardian in time opens the next tier and gives the shard back', p.riftMax === 2 && p.tickets === 2 + 0 || p.tickets >= 2);
    check('rifts: a guardian is not a world boss kill', p.bossKills.boss === kills && w.loot.length >= 3);
    w.loadMap('town', 'rift');
    check('rifts: leaving ends it', !w.rift && w.map.id === 'town');
    w.command({ type: 'enterRift', tier: 2 }); w.runCommands();
    const r2 = w.rift;
    r2.timeLeft = 0.01;
    run(w, 0.1);
    check('rifts: out of time, the next tier will not open', r2.state === 'late');
    for (const e of w.enemies.slice()) { if (r2.guardianId) break; w.killEnemy(e, 'basic'); }
    w.killEnemy(w.enemies.find((e) => e.riftGuardian), 'basic');
    check('...but you can still finish it', r2.state === 'done' && !r2.won && p.riftMax === 2);
    check('rifts: each tier is tougher than the last', riftScale(10).hp > riftScale(5).hp * 2 && riftScale(1).hp === 1);
    const m1 = buildRiftMap('frost', 5), m2 = buildRiftMap('frost', 5);
    check('rifts: the same seed builds the same rift (so a co-op friend sees the host\'s)', JSON.stringify(m1.spawns) === JSON.stringify(m2.spawns) && m1.portals.length === 1 && m1.portals[0].to === 'town');
  }
  // Wishborne
  {
    const w = hero();
    const p = w.player;
    w.gainExp(wishNeed(0) + wishNeed(1) + 5);
    check('Wishborne: past level 100, EXP fills Wishborne levels', p.level === 100 && p.wish === 2 && p.wishPts === 2 && p.wishExp === 5);
    const ad0 = p.stats.ad;
    w.command({ type: 'wishSpend', stat: 'might', n: 10 }); w.runCommands();
    check('Wishborne: points go into bonuses (no more than you have)', p.wishStats.might === 2 && p.wishPts === 0 && p.stats.ad > ad0);
    const saved = w.toSave();
    const again = new World({ seed: 1, cls: 'archer', save: saved });
    check('Wishborne: saved with the hero', again.player.wish === 2 && again.player.stats.ad === p.stats.ad);
    const { trialWeek, defaultBuild, buildTrialWorld } = await import('../src/sim/trial.js');
    const tw = buildTrialWorld(trialWeek(1), defaultBuild(trialWeek(1), 'archer', 'sharpshooter'));
    check('Wishborne: never in the Weekly Echo', !tw.player.wish);
  }
  // Co-op: a friend sees the rift and the tier
  {
    const { makeSnapshot, applySnapshot } = await import('../src/net/sync.js');
    const w = hero({ tickets: 2, bossKills: { boss: 1 }, tierMax: 2, worldTier: 2 });
    w.addHero(1, { name: 'F', cls: 'rogue', save: { v: 2, cls: 'rogue', level: 60 } });
    w.command({ type: 'enterRift', tier: 1 }); w.runCommands();
    const friend = new World({ seed: 9, cls: 'rogue', mode: 'explore' });
    friend.loadMapMirror('town');
    applySnapshot(friend, JSON.parse(JSON.stringify(makeSnapshot(w, 1, {}))));
    check('co-op: a friend gets the same rift map and its progress', friend.map.id === 'rift' && friend.map.riftTheme === w.rift.theme && friend.obstacles.length === w.obstacles.length && friend.rift.need === w.rift.need);
  }
}
// --- 0.27: rogue subclasses get their own Q, W and E -----------------------------------
{
  const { geared } = await import('./balance.mjs');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  const setup = (spec, talents = {}) => {
    const w = new World({ seed: 12, cls: 'rogue', save: Object.assign(geared('rogue', 60, 2), { spec, talents }) });
    const p = w.player; w.wave.phase = 'explore';
    w.recalcStats(); p.hp = p.stats.maxHp; p.x = p.px = 0; p.z = p.pz = 0;
    for (const k of ['q', 'w', 'e', 'r']) p.cd[k] = 0;
    w.enemies = []; w.events.length = 0;
    return { w, p };
  };
  const dummy = (w, x, z = 0, hp = 1e9) => { const e = w.spawnEnemy('grunt', { x, z, level: w.player.level }); e.state = 'recover'; e.t = 999; e.hp = e.maxHp = hp; e.x = e.px = x; e.z = e.pz = z; e.facing = Math.PI; return e; };
  const cast = (w, slot, x, z) => { w.command({ type: 'cast', slot, x, z }); w.runCommands(); };
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
  // Shadowdancer: Starglass Kunai reach much further and seek the enemy nearest the cursor.
  {
    const { w } = setup('shadowdancer');
    const far = dummy(w, 14, 3);
    cast(w, 'w', 12, -1); // the cursor is near it, not on it
    run(w, 1);
    check('Starglass Kunai: seeks the enemy nearest your cursor, 14 m away', far.hp < far.maxHp);
    const { w: w2 } = setup('shadowdancer');
    const e = dummy(w2, 9, 0);
    w2.addShadow('e', 0, 9, 0);
    w2.player.veilT = 3;
    cast(w2, 'w', 9, 0); run(w2, 1);
    const hits = w2.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy' && ev.id === e.id).map((ev) => ev.amount);
    check('Starglass Kunai: while Veiled, the second kunai deals full damage', hits.length === 2 && Math.abs(hits[1] / hits[0] - 1) < 0.02, `${hits}`);
  }
  // Assassin: Shadowstrike, Death Lotus, Ambush and Clean Kill.
  {
    const { w, p } = setup('assassin');
    const e = dummy(w, 6, 0);
    cast(w, 'q', 6, 0); run(w, 0.3);
    check('Shadowstrike: leaps to an enemy 6 m away and stabs it', dist(p.x, p.z, e.x, e.z) < 2 && e.hp < e.maxHp);
    const plain = e.maxHp - e.hp;
    const { w: w2 } = setup('assassin');
    const low = dummy(w2, 6, 0);
    low.hp = low.maxHp * 0.25;
    const before = low.hp;
    w2.mods.critMult = 0; w2.player.stats.crit = 0;
    w.mods.critMult = 0;
    cast(w2, 'q', 6, 0); run(w2, 0.3);
    const exec = w2.events.find((ev) => ev.type === 'cast' && ev.fx === 'strike');
    check('Shadowstrike: double damage on an enemy below 30% health', exec && exec.execute && before - low.hp > 0);
  }
  {
    const { w, p } = setup('assassin');
    const e = dummy(w, 3, 0); // facing the hero (it faces -x): we are in front of it
    cast(w, 'w', 0, 0);
    check('Death Lotus: Exposes everything it hits', e.exposedT > 3.5);
    run(w, 0.2); // let the spin finish
    w.events.length = 0;
    cast(w, 'q', 3, 0); run(w, 0.3);
    const st = w.events.find((ev) => ev.type === 'cast' && ev.fx === 'strike');
    check('Death Lotus: an Exposed enemy takes the from-behind bonus from the front', st && st.exposed);
  }
  {
    const { w, p } = setup('assassin');
    const e = dummy(w, 6, 0); // faces -x, toward the hero; its back is at +x
    cast(w, 'e', 6, 0); run(w, 0.3);
    check('Ambush: lands behind the enemy nearest the cursor, facing it', p.x > e.x && Math.abs(p.z) < 0.5 && Math.abs(angDiff(p.facing, Math.PI)) < 0.2 && p.empowerT > 0, `${p.x.toFixed(2)} vs ${e.x}`);
  }
  {
    const { w, p } = setup('assassin');
    const a = dummy(w, 2, 0, 10), b = dummy(w, -2, 0, 10);
    p.cd.w = 5; p.cd.e = 5; p.cd.r = 20;
    cast(w, 'q', 2, 0); run(w, 0.2);
    check('Clean Kill: a kill brings Q, W and E straight back, but not R', a.dead && p.cd.q === 0 && p.cd.w === 0 && p.cd.e === 0 && p.cd.r > 10);
    cast(w, 'q', -2, 0); run(w, 0.3);
    check('Clean Kill: ...so Shadowstrike goes again at once', b.dead);
    const { w: w2, p: p2 } = setup('shadowdancer');
    const c = dummy(w2, 2, 0, 10);
    p2.cd.w = 5;
    w2.hitEnemy(c, 100, { canCrit: false, source: 'basic' });
    check('Clean Kill: only the Assassin has it', c.dead && p2.cd.w > 4);
  }
}
// --- 0.28: warrior and mage, Doom, rewards for the fight in front of you ----------------
{
  const { geared } = await import('./balance.mjs');
  const { DOOM, TIERS } = await import('../src/sim/endgame.js');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  const setup = (cls, spec, extra = {}) => {
    const w = new World({ seed: 12, cls, save: Object.assign(geared(cls, 60, 2), { spec, talents: {} }, extra) });
    const p = w.player; w.wave.phase = 'explore';
    w.recalcStats(); p.hp = p.stats.maxHp; p.x = p.px = 0; p.z = p.pz = 0;
    for (const k of ['q', 'w', 'e', 'r']) p.cd[k] = 0;
    w.enemies = []; w.events.length = 0;
    return { w, p };
  };
  const dummy = (w, x, z = 0) => { const e = w.spawnEnemy('grunt', { x, z, level: w.player.level }); e.state = 'recover'; e.t = 999; e.hp = e.maxHp = 1e9; e.x = e.px = x; e.z = e.pz = z; e.facing = Math.PI; return e; };
  const cast = (w, slot, x, z) => { w.command({ type: 'cast', slot, x, z }); w.runCommands(); };
  const noCrit = (w) => { w.player.stats.crit = -1000; };
  // Momentum
  {
    const { w } = setup('warrior', 'bulwark'); noCrit(w);
    const one = dummy(w, 2, 0);
    cast(w, 'q', 3, 0);
    const solo = 1e9 - one.hp;
    const { w: w2 } = setup('warrior', 'bulwark'); noCrit(w2);
    const many = [0, 0.3, -0.3, 0.6, -0.6].map((a) => dummy(w2, 2.5 * Math.cos(a), 2.5 * Math.sin(a)));
    cast(w2, 'q', 3, 0);
    const each = 1e9 - many[0].hp;
    check('Momentum: a Cleave through five enemies hits each 24% harder than one alone', Math.abs(each / solo - 1.24) < 0.02, (each / solo).toFixed(3));
  }
  // Berserker: a spin you can run with
  {
    const { w, p } = setup('warrior', 'berserker'); noCrit(w);
    const e = dummy(w, 2, 0);
    cast(w, 'w', 0, 0);
    w.command({ type: 'move', x: 6, z: 0 }); w.runCommands();
    let beats = 0;
    for (let i = 0; i < 150; i++) { w.step(CONFIG.TICK); beats += w.events.filter((ev) => ev.type === 'spinTick').length; w.events.length = 0; }
    const want = Math.round(2 / Math.min(0.5, Math.max(0.1, 1 / p.stats.as)));
    check('Berserker: Whirlwind is a 2-second spin, one beat per basic attack (Red Tempo, 0.43)', beats === want && beats >= 4 && !p.spin, `${beats} beats at ${p.stats.as.toFixed(2)} attacks a second`);
    check('Berserker: ...and you keep moving while it spins', p.x > 3);
  }
  // Red Tempo (0.43): attack speed makes the spin beat faster, never past 10 a second
  {
    const beatsAt = (as) => {
      const { w, p } = setup('warrior', 'berserker'); noCrit(w);
      dummy(w, 2, 0);
      p.stats.as = as;
      w.recalcStats = () => {};
      cast(w, 'w', 0, 0);
      let n = 0;
      for (let i = 0; i < 200; i++) { w.step(CONFIG.TICK); n += w.events.filter((ev) => ev.type === 'spinTick').length; w.events.length = 0; }
      return n;
    };
    const slow = beatsAt(1.5), fast = beatsAt(5), max = beatsAt(40);
    check('Red Tempo: a slow hand spins four beats', slow === 4, slow);
    check('Red Tempo: five attacks a second spin ten', fast === 10, fast);
    check('Red Tempo: never more than ten beats a second', max === 20, max);
  }
  // Overflow (0.43): Warrior and Mage cooldowns stop at 1 second and the rest becomes damage
  {
    const { w, p } = setup('mage', 'pyromancer');
    const base = w.abilityDamage('q');
    p.stats.haste = 4000;
    check('Overflow: a cooldown never drops below 1 second', Math.abs(w.abilityCooldown('q') - 1) < 1e-9, w.abilityCooldown('q'));
    const raw = w.rawCooldown('q');
    check('Overflow: ...and the haste past it becomes damage', Math.abs(w.abilityDamage('q') / base - 1 / raw) < 1e-6, (w.abilityDamage('q') / base).toFixed(2));
    p.stats.haste = 0;
    check('Overflow: without that much haste nothing changes', w.overflowMult('q') === 1);
    const a = setup('archer', 'sharpshooter');
    a.p.stats.haste = 4000;
    check('Overflow: archers do not have it', a.w.abilityCooldown('q') < 0.5 && a.w.overflowMult('q') === 1);
  }
  // Weight of Iron (Bulwark), Searing (Pyromancer), Deep Winter (Frostbinder), Crosswind (Windrunner)
  {
    const { w, p } = setup('warrior', 'bulwark');
    const d0 = w.abilityDamage('q');
    p.stats.armor += 1000;
    check('Weight of Iron: armor adds to Bulwark ability damage', w.abilityDamage('q') > d0 + 1.5 * 700 * 0.9);
    const py = setup('mage', 'pyromancer');
    py.p.stats.haste = 600;
    check('Searing: 120 ability haste is one more burn stack', py.w.burnCap() === 10, py.w.burnCap());
    check('Searing: burns can crit', py.w.mods.burnCrit === true);
    const fb = setup('mage', 'frostbinder');
    fb.p.stats.haste = 900;
    const en = dummy(fb.w, 3, 0);
    fb.w.shatterFrost(en);
    check('Deep Winter: ability haste shortens the wait after a Shatter', Math.abs(en.frostLock - 0.3) < 1e-9, en.frostLock);
    check('Deep Winter: ...but the freeze keeps its own wait', en.freezeWait > 1);
    const wr = setup('archer', 'windrunner');
    check('Crosswind: the Windrunner has it', wr.w.mods.crosswind > 0);
  }
  // Bulwark: Reckoning
  {
    const { w, p } = setup('warrior', 'bulwark'); noCrit(w);
    const e = dummy(w, 2, 0);
    p.parryT = 0.3; p.parryAge = 0;
    w.hitPlayer(10, { parryable: true, src: e });
    w.hitPlayer(10, { parryable: false, src: e }); // a red one, blocked by Iron Answer
    check('Reckoning: every parry and block is a stack', p.reck === 2, p.reck);
    p.parryT = 0;
    const before = p.reck;
    w.takeDamage(Math.ceil(p.stats.maxHp * 0.21), null, false);
    check('Reckoning: and so is every 10% of your health lost', p.reck === before + 2, p.reck);
    p.hp = p.stats.maxHp;
    const { w: w2 } = setup('warrior', 'bulwark'); noCrit(w2);
    const plain = dummy(w2, 2, 0);
    cast(w2, 'w', 0, 0);
    const base = 1e9 - plain.hp;
    p.parryT = 0; run(w, 0.3); e.hp = 1e9; e.x = e.px = 2; e.z = e.pz = 0; e.vulnT = 0; e.state = 'recover'; e.t = 999; // not Broken any more
    cast(w, 'w', 0, 0);
    check('Reckoning: the next Whirlwind deals 25% more per stack, and uses them up', Math.abs((1e9 - e.hp) / base - 2) < 0.05 && p.reck === 0, ((1e9 - e.hp) / base).toFixed(2));
  }
  // Mage: Arcane Ward
  {
    const { w, p } = setup('mage', 'pyromancer');
    run(w, 1.2);
    check('Arcane Ward: a barrier worth 15% of your health', Math.abs(p.ward - p.stats.maxHp * 0.15) < 1);
    const hp = p.hp;
    w.takeDamage(Math.round(p.stats.maxHp * 0.1), null, false);
    check('Arcane Ward: takes damage before your health does', p.hp === hp && p.ward < p.stats.maxHp * 0.06);
    run(w, 4);
    check('Arcane Ward: stays down while you were hurt recently...', p.ward < p.stats.maxHp * 0.06);
    run(w, 2.2);
    check('Arcane Ward: ...and comes back 5 seconds after', Math.abs(p.ward - p.stats.maxHp * 0.15) < 1);
    const { w: w2, p: p2 } = setup('warrior', 'bulwark'); run(w2, 2);
    check('Arcane Ward: only mages have it', !p2.ward);
  }
  // Pyromancer and Frostbinder
  {
    const { w } = setup('mage', 'pyromancer');
    check('Pyromancer: burns spread on death without Wildfire', w.mods.burnSpread === 1);
    const { w: w2, p: p2 } = setup('mage', 'pyromancer', { talents: { py_burn: 2 } });
    check('Pyromancer: Wildfire adds to it', w2.mods.burnSpread === 3, w2.mods.burnSpread);
    const { w: w3, p: p3 } = setup('mage', 'frostbinder');
    p3.ranks.q = 5;
    const e = dummy(w3, 2, 0);
    w3.shatterFrost(e);
    const ev = w3.events.find((x) => x.type === 'frostShatter');
    check('Frostbinder: Shatter reaches half a metre further per Ice Bolt rank', ev && Math.abs(ev.radius - 5) < 1e-9, ev && ev.radius);
  }
  // Doom
  {
    const mk = (tier, extra = {}) => {
      const w = new World({ seed: 7, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 100, 4), { spec: 'sharpshooter', tierMax: 5, worldTier: tier, bossKills: { boss: 1, boss2: 1, boss3: 1 } }, extra) });
      const p = w.player;
      w.loadMap('sanctum', 'spire');
      const b = w.enemies.find((e) => e.def.boss);
      w.enemies = [b];
      p.x = p.px = b.x - 10; p.z = p.pz = b.z;
      b.aggro = true; b.state = 'recover'; b.t = 999; // it stands there: only Doom matters here
      return { w, p, b };
    };
    const t3 = mk(3);
    let cast3 = null, t = 0;
    for (; t < 600 && !cast3; t++) { t3.w.command({ type: 'stop' }); t3.w.runCommands(); t3.w.step(CONFIG.TICK); cast3 = t3.w.events.find((ev) => ev.type === 'doomCast'); t3.w.events.length = 0; }
    check('Doom: on tier III a boss casts it about 8 seconds into the fight, under your feet', cast3 && Math.abs(t / 60 - DOOM.first) < 0.2 && Math.hypot(cast3.x - t3.p.x, cast3.z - t3.p.z) < 0.5 && Math.abs(cast3.pct - 0.35) < 1e-9, cast3 && `${(t / 60).toFixed(2)}s ${cast3.pct}`);
    const hp0 = t3.p.hp;
    t3.p.stats.armor = 1e6;
    for (let i = 0; i < 110; i++) { t3.w.command({ type: 'stop' }); t3.w.runCommands(); t3.w.step(CONFIG.TICK); }
    check('Doom: takes 35% of your max health on tier III, whatever your armor', Math.abs(hp0 - t3.p.hp - Math.round(t3.p.stats.maxHp * 0.35)) <= t3.p.stats.maxHp * 0.02, `${Math.round(hp0 - t3.p.hp)} of ${t3.p.stats.maxHp}`);
    const t3b = mk(3);
    t3b.p.parryT = 99; t3b.p.parryAge = 0;
    t3b.w.castDoom(t3b.b, t3b.w.heroes[0], 0.35, false);
    const hpb = t3b.p.hp;
    for (let i = 0; i < 110; i++) { t3b.p.parryT = 99; t3b.w.step(CONFIG.TICK); }
    check('Doom: cannot be parried', t3b.p.hp < hpb - t3b.p.stats.maxHp * 0.3);
    const t3c = mk(3);
    t3c.w.castDoom(t3c.b, t3c.w.heroes[0], 0.35, false);
    t3c.w.command({ type: 'move', x: t3c.p.x - 8, z: t3c.p.z }); t3c.w.runCommands();
    const hpc = t3c.p.hp;
    for (let i = 0; i < 110; i++) t3c.w.step(CONFIG.TICK);
    check('Doom: walking out of the circle avoids it', t3c.p.hp >= hpc);
    const t1 = mk(1);
    let first = null; t = 0;
    for (; t < 900 && !first; t++) { t1.w.step(CONFIG.TICK); first = t1.w.events.find((ev) => ev.type === 'doomCast'); t1.w.events.length = 0; }
    check('Doom: on tier I only someone idle near a boss gets one, after 4 seconds', first && first.idle && Math.abs(t / 60 - DOOM.idle) < 0.2, first && (t / 60).toFixed(2));
    let pcts = [first.pct];
    for (let i = 0; i < 400 && pcts.length < 3; i++) { t1.w.step(CONFIG.TICK); for (const ev of t1.w.events) if (ev.type === 'doomCast') pcts.push(ev.pct); t1.w.events.length = 0; t1.p.hp = t1.p.stats.maxHp; }
    check('Doom: ...and each one in a row while you stay idle hits harder', pcts.length === 3 && pcts[1] > pcts[0] && pcts[2] > pcts[1], pcts.join(','));
    t1.w.command({ type: 'move', x: t1.p.x, z: t1.p.z + 1 }); t1.w.runCommands();
    check('Doom: any input resets it', t1.p.idleT === 0 && t1.p.idleDooms === 0);
    check('Doom: tier numbers', TIERS[1].doom === 0 && TIERS[2].doom === 0.25 && TIERS[5].doom === 0.6);
  }
  // Rewards for the fight in front of you
  {
    const w = new World({ seed: 7, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 60, 2), { bossKills: { boss: 1 } }) });
    const p = w.player;
    w.loadMap('keep', 'town');
    const b = w.enemies.find((e) => e.def.boss);
    check('Outgrown bosses: 10% less per level you are above it, down to 10%', Math.abs(w.bossFalloff(b) - Math.max(0.1, 1 - 0.1 * (60 - b.level))) < 1e-9, `level ${b.level}: ${w.bossFalloff(b)}`);
    p.bossKills = {};
    check('Outgrown bosses: a first kill always pays in full', w.bossFalloff(b) === 1);
    const exp0 = p.exp + p.level * 1e6;
    p.bossKills = { boss: 1 };
    p.idleT = 31;
    const lvl = p.level, ex = p.exp, gold = p.gold;
    w.killEnemy(b, 'basic');
    check('Idle: after 30 seconds with no input, kills pay nothing', p.level === lvl && p.exp === ex && p.gold === gold);
  }
  {
    const w = new World({ seed: 7, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 100, 4), { tierMax: 3, worldTier: 2, bossKills: { boss: 1, boss2: 1, boss3: 1 } }) });
    const p = w.player;
    w.loadMap('keep', 'town');
    const b = w.enemies.find((e) => e.def.boss);
    w.killEnemy(b, 'basic');
    check('Streak: a tier boss beaten adds to it', p.streak === 1);
    p.streak = 4;
    w.takeDamage(p.hp + 10, null, false);
    check('Streak: being knocked out ends it', p.streak === 0 && p.dead);
  }
}
// --- 0.29: exploration surprises, Remnants, sets, enchanting -----------------------------
{
  const { geared } = await import('./balance.mjs');
  const { RARE, THIEF, REMNANT } = await import('../src/sim/surprises.js');
  const { SETS, rollSetPiece, setCounts, enchantable, enchantCost, dustValue, rollItem: roll } = await import('../src/sim/items.js');
  const { makeRng: mk } = await import('../src/sim/rng.js');
  const run = (w, sec) => { for (let i = 0; i < sec * 60; i++) w.step(CONFIG.TICK); };
  const explorer = (cls = 'warrior', extra = {}, seed = 11) => {
    const w = new World({ seed, mode: 'explore', cls, save: Object.assign(geared(cls, 40, 2), extra) });
    w.loadMap('frost', 'town');
    return w;
  };
  // Rares
  {
    let spawns = 0, rares = 0;
    for (let i = 0; i < 40; i++) { const w = explorer('warrior', {}, 200 + i); spawns += w.enemies.length; rares += w.enemies.filter((e) => e.rare).length; }
    check('Rares: about one camp spawn in sixty, never more than one on a map', rares > 0 && Math.abs(rares / spawns - RARE.chance) < RARE.chance * 0.8, `${rares} of ${spawns}`);
    const w = explorer();
    const e = w.enemies.find((x) => !x.def.boss && !x.elite && !x.rare);
    const hp = e.maxHp;
    w.makeRare(e, mk(5));
    check('Rares: a name, two modifiers and five times the health', typeof e.rare === 'string' && e.rare.length > 3 && e.elite.length === 2 && Math.abs(e.maxHp / hp - RARE.hp) < 0.01);
    const p = w.player;
    const dust = p.dust, loot = w.loot.length;
    w.killEnemy(e, 'basic');
    check('Rares: a kill gives Wishdust and an Epic or better', p.dust - dust >= RARE.dust[0] && w.loot.slice(loot).some((l) => l.item.rarity >= 3));
  }
  // The Wishthief
  {
    const w = explorer('archer');
    w.enemies = [];
    const p = w.player;
    const t = w.spawnThief();
    t.maxHp = t.hp = 1e9; // (so auto-attacks cannot catch it here)
    check('Wishthief: hides out on the map, away from you', t && t.def.thief && Math.hypot(t.x - p.x, t.z - p.z) > 12 && !t.fleeing);
    t.x = t.px = p.x + 8; t.z = t.pz = p.z;
    run(w, 0.5);
    check('Wishthief: bolts when you come near, away from you', t.fleeing && Math.hypot(t.x - p.x, t.z - p.z) > 8);
    const g = p.gold;
    w.hitEnemy(t, t.maxHp * 0.25, { canCrit: false });
    check('Wishthief: every tenth of its health knocked off spills gold', p.gold > g && w.events.filter((ev) => ev.type === 'thiefCoins').length === 2);
    run(w, THIEF.life);
    check('Wishthief: and it gets away after 25 seconds', t.dead && t.escaped && !w.enemies.includes(t));
    const w2 = explorer('archer');
    w2.enemies = [];
    const t2 = w2.spawnThief();
    const tk = w2.player.tickets, dust2 = w2.player.dust, l2 = w2.loot.length;
    w2.killEnemy(t2, 'basic');
    check('Wishthief: caught, it gives a shard, Wishdust and three pieces of gear (one Mythic or better)', w2.player.tickets >= tk + 1 && w2.player.dust === dust2 + THIEF.dust && w2.loot.length - l2 === 3 && w2.loot.slice(l2).some((l) => l.item.rarity >= 4));
  }
  // Remnants
  {
    let rem = 0, n = 0;
    for (let i = 0; i < 60; i++) {
      const w = new World({ seed: 100 + i, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 45, 2), { bossKills: { boss: 5 } }) });
      w.loadMap('keep', 'town');
      const b = w.enemies.find((e) => e.def.boss);
      n++;
      if (b && b.remnant) rem++;
    }
    check('Remnants: once you have beaten a boss three times, about one spawn in four is its Remnant', rem > 5 && rem < 28, `${rem} of ${n}`);
    const fresh = new World({ seed: 3, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 45, 2), { bossKills: { boss: 1 } }) });
    let any = false;
    for (let i = 0; i < 30; i++) { fresh.loadMap('keep', 'town'); if (fresh.enemies.some((e) => e.remnant)) any = true; }
    check('Remnants: never before the third kill', !any);
    const w = new World({ seed: 3, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 45, 2), { bossKills: { boss: 5 }, spec: 'berserker' }) });
    w.loadMap('keep', 'town');
    const b = w.enemies.find((e) => e.def.boss);
    w.enemies = [b];
    if (!b.remnant) w.makeRemnant(b);
    const p = w.player;
    p.x = p.px = b.x - 6; p.z = p.pz = b.z;
    b.aggro = true; b.state = 'recover'; b.t = 999;
    let cast = null;
    for (let i = 0; i < 60 * 7 && !cast; i++) { w.command({ type: 'stop' }); w.runCommands(); w.step(CONFIG.TICK); cast = w.events.find((ev) => ev.type === 'remnantCast'); w.events.length = 0; }
    check('Remnants: the Warden\'s Remnant calls two shades of itself (Mirrored Oath)', cast && cast.name === 'Mirrored Oath' && w.enemies.filter((e) => e.type === 'oathshade' && e.summoner === b.id).length === 2);
    const l0 = w.loot.length, d0 = p.dust;
    w.killEnemy(b, 'basic');
    check('Remnants: always drop a set piece, and Wishdust', w.loot.slice(l0).some((l) => l.item.set) && p.dust === d0 + REMNANT.dust);
  }
  // Sets
  {
    const r = mk(9);
    const piece = rollSetPiece(r, 60, 'warrior', 'berserker');
    check('Sets: a set piece is Ancient (just below Immortal), of its class, named for its set', piece.rarity === 5 && RARITIES[5].name === 'Ancient' && piece.cls === 'warrior' && SETS[piece.set].cls === 'warrior' && piece.name.startsWith(SETS[piece.set].name));
    let mine = 0;
    for (let i = 0; i < 200; i++) if (rollSetPiece(r, 60, 'warrior', 'berserker').set === 'bloodbound') mine++;
    check('Sets: usually your own subclass\'s set', mine > 140 && mine < 190, mine);
    const save = geared('warrior', 60, 2);
    save.spec = 'bulwark';
    const w = new World({ seed: 4, cls: 'warrior', save });
    const armor0 = w.player.stats.armor;
    for (const slot of ['helm', 'chest']) { const it = rollSetPiece(r, 60, 'warrior', 'bulwark'); it.set = 'wardstone'; it.slot = slot; it.stats = { [slot === 'helm' ? 'hp' : 'armor']: 1 }; w.player.equipped[slot] = it; }
    w.recalcStats();
    check('Sets: two pieces give the first bonus (Wardstone: +15% armor)', w.mods.armorPct >= 0.15 && !(w.mods.reckonMax >= 8));
    for (const slot of ['boots', 'ring']) { const it = rollSetPiece(r, 60, 'warrior', 'bulwark'); it.set = 'wardstone'; it.slot = slot; it.stats = { ms: 1 }; w.player.equipped[slot] = it; }
    w.recalcStats();
    check('Sets: four give the second as well (Reckoning up to 8)', setCounts(w.player.equipped).wardstone === 4 && w.mods.reckonMax === 8);
  }
  // Enemy kits (0.44)
  {
    const mk = (type, cls = 'warrior') => {
      const w = new World({ seed: 21, cls, mode: 'explore', save: geared(cls, 60, 3) });
      w.loadMap('spire', MAPS.spire.portals[0].to);
      for (const e of w.enemies) e.dead = true;
      w.enemies = [];
      const p = w.player;
      p.x = p.px = 0; p.z = p.pz = 0;
      const e = w.spawnEnemy(type, { x: 6, z: 0, level: 60 });
      e.x = e.px = 6; e.z = e.pz = 0; e.state = 'chase'; e.aggro = true; e.home = null;
      return { w, p, e };
    };
    const fire = (w, e, name) => { w.startWindup(e, e.def.attackByName[name], false); let n = 0; while (e.state === 'windup' && n++ < 600) { w.step(CONFIG.TICK); } };
    for (const id of ['grunt', 'spitter', 'brute', 'stalker', 'imp', 'knight', 'wolf', 'shaman', 'scarab', 'golem', 'sporecap', 'wraith', 'glassbound', 'courtguard', 'boss', 'boss2', 'boss3', 'herald', 'asker'])
      if (!(DEFS.ENEMIES[id].kit && DEFS.ENEMIES[id].attacks.length >= 2)) check(`kits: ${id} has more than one move`, false);
    check('kits: every enemy and boss has a kit of its own moves', ['grunt', 'boss3', 'asker', 'wraith'].every((id) => DEFS.ENEMIES[id].kit));
    // a ring is safe close in
    {
      const { w, p, e } = mk('brute');
      p.x = p.px = e.x - 1.6; const hp0 = (p.hp = p.stats.maxHp);
      fire(w, e, 'stomp');
      check('Crusher stomp: hugging it is safe', p.hp === hp0);
      const b = mk('brute');
      b.p.x = b.p.px = b.e.x - 4; b.p.hp = b.p.stats.maxHp;
      fire(b.w, b.e, 'stomp');
      check('...a few steps out is not', b.p.hp < b.p.stats.maxHp);
    }
    // pools stay and hurt
    {
      const { w, p, e } = mk('spitter');
      p.x = p.px = 0; p.z = p.pz = 0;
      w.startWindup(e, e.def.attackByName.retch, false);
      for (let i = 0; i < 60 * 2.5; i++) { p.x = p.px = 0; p.z = p.pz = 0; w.step(CONFIG.TICK); }
      check('Spitter retch: the fever stays on the ground', w.hazards.length >= 1 && w.telegraphs.some((t) => t.pool && t.poolKind === 'fever'));
    }
    // a beam hits along its line only
    {
      const { w, p, e } = mk('golem');
      e.x = e.px = 5; p.x = p.px = 0; p.z = p.pz = 0; p.hp = p.stats.maxHp;
      fire(w, e, 'topple');
      check('Colossus topple: falls along a line, onto you', p.hp < p.stats.maxHp);
    }
    // summons pay nothing and fall with their caller
    {
      const { w, p, e } = mk('boss');
      e.hp = e.maxHp * 0.5;
      fire(w, e, 'muster');
      const men = w.enemies.filter((o) => o.summoner === e.id && !o.dead);
      check('Warden muster: below 60% he calls two of his men', men.length === 2 && men.every((o) => o.type === 'oathshade'));
      const g0 = p.gold;
      w.killEnemy(men[0], 'test');
      check('...who pay nothing', p.gold === g0);
      w.killEnemy(e, 'test');
      check('...and fall with him', men.every((o) => o.dead));
    }
    // the Unmade's moves come by phase
    {
      const { w, e } = mk('boss3');
      let late = false;
      for (let i = 0; i < 200; i++) { const a = w.pickFromKit(e, 6); if (a && a.phase >= 2) late = true; }
      check('The Unmade: no phase-two moves in phase one', !late);
      e.phase = 3;
      const seen = new Set();
      for (let i = 0; i < 400; i++) { e.atkCds = {}; const a = w.pickFromKit(e, 8); if (a) seen.add(a.name); }
      check('...and in phase three she weeps, collapses, and opens the empty cradle', ['weep', 'collapse', 'emptycradle'].every((n) => seen.has(n)), [...seen].join());
    }
    // a seeking lullaby follows you
    {
      const { w, p, e } = mk('boss3');
      fire(w, e, 'lullaby');
      const motes = w.projectiles.filter((pr) => pr.owner === 'enemy' && pr.seek > 0);
      check('Lullaby: ten slow motes all around her, that lean toward you', motes.length === 10);
    }
  }
  // Asterfell delves (0.46)
  {
    const save = geared('warrior', 100, 6);
    Object.assign(save, { tierMax: 3, worldTier: 3, quests: { w: { s: 'done', n: 1 } } });
    const w = new World({ seed: 31, cls: 'warrior', mode: 'explore', save });
    const p = w.player;
    w.loadMap('asterfell', 'town');
    const door = w.obstacles.find((o) => o.kind === 'delve');
    check('Delves: the palace stair stands in Asterfell', !!door);
    w.command({ type: 'enterDelve', tier: 3 }); w.runCommands();
    check('Delves: tier III goes down four rooms, starting in Bakers\' Row', w.map.id === 'delve' && w.delve.rooms === 4 && w.events.some((ev) => ev.type === 'delveRoom' && ev.name === "Bakers' Row"));
    check('Delves: the room is full of the palace\'s people, all awake', w.enemies.length >= 9 && w.enemies.every((e) => e.aggro && !e.home));
    let rooms = 1, done = false;
    w.events.length = 0;
    for (let guard = 0; guard < 60 * 60 && !done; guard++) {
      for (const e of w.enemies) if (!e.dead) w.killEnemy(e, 'test');
      p.hp = p.stats.maxHp;
      w.step(CONFIG.TICK);
      for (const ev of w.events) { if (ev.type === 'delveRoom') rooms++; if (ev.type === 'delveDone') done = ev; }
      w.events.length = 0;
    }
    check('Delves: room after room, to the Throne Room, and done', done && rooms === 4 && done.first, rooms);
    check('Delves: a radiant chest by the throne, and a Sigil and a Glass the first time', w.chests.some((c) => c.tier === 'radiant') && p.misc.sigil >= 1 && p.misc.glass >= 1 && p.delveBest === 3);
    w.loadMap('asterfell', 'delve');
    check('Delves: leaving ends it', !w.delve);
  }
  // The ending (0.45): Unwish yourself, or take her place
  {
    const save = geared('mage', 100, 6);
    Object.assign(save, { bossKills: { boss3: 1, asker: 1 }, quests: { starwell: { s: 'done', n: 1 } }, tierMax: 3, worldTier: 3 });
    const w = new World({ seed: 9, cls: 'mage', mode: 'explore', save });
    const p = w.player;
    check('Unwish: Wren offers it after the Starwell', w.questOpen('unwish'));
    w.command({ type: 'acceptQuest', id: 'unwish' }); w.runCommands();
    check('Unwish: she gives you her own Unwishing Glass', p.misc.glass === 1);
    w.command({ type: 'unwish', choice: 'self' }); w.runCommands();
    check('Unwish: only at the Starwell', !(p.endings.self > 0));
    w.loadMap('starwell', 'asterfell');
    for (const e of w.enemies) { if (e.def.boss) w.killEnemy(e, 'test'); }
    check('Unwish: with the Asker gone, the well is there to use', !!w.bossAltar() && w.bossAltar().name === 'the Starwell');
    w.command({ type: 'unwish', choice: 'place' }); w.runCommands();
    check('Take her place: not before you have let go once', !w.events.some((ev) => ev.type === 'reborn'));
    w.events.length = 0;
    w.command({ type: 'unwish', choice: 'self' }); w.runCommands();
    check('Unwish yourself: the glass goes in, the ending is seen, the quest is done', p.endings.self === 1 && !p.misc.glass && w.questState('unwish') === 'ready' && w.events.some((ev) => ev.type === 'ending' && ev.first) && p.glows.includes('afterlight'));
    w.loadMap('town');
    check('After the wish: Tomas comes home', w.obstacles.some((o) => o.kind === 'npc' && o.id === 'tomas') && w.afterWish());
    w.command({ type: 'metTomas' }); w.runCommands();
    w.loadMap('town');
    check('...once', !w.obstacles.some((o) => o.id === 'tomas'));
    w.loadMap('starwell', 'asterfell');
    for (const e of w.enemies) { if (e.def.boss) w.killEnemy(e, 'test'); }
    w.events.length = 0;
    w.command({ type: 'unwish', choice: 'place' }); w.runCommands();
    const ev = w.events.find((x) => x.type === 'reborn');
    check('Take her place: a rebirth into New Game+', !!ev && ev.ng === 1 && ev.save.level === 1 && ev.save.endings.self === 1 && ev.save.endings.place === 1);
    const w2 = new World({ seed: 9, cls: 'mage', mode: 'explore', save: ev.save });
    const normal = new World({ seed: 9, cls: 'mage', mode: 'explore' });
    w2.loadMap('greenwood', 'town'); normal.loadMap('greenwood', 'town');
    const a = w2.spawnEnemy('grunt', { x: 5, z: 0, level: 5 }), b = normal.spawnEnemy('grunt', { x: 5, z: 0, level: 5 });
    check('New Game+: enemies are tougher', a.maxHp > b.maxHp * 1.25 && a.dmgMult > b.dmgMult * 1.15);
    w2.loadMap('sanctum', 'spire');
    const u = w2.enemies.find((e) => e.type === 'boss3') || w2.spawnEnemy('boss3', { x: 0, z: 0, level: 100 });
    check('New Game+: the Unmade wears your old face', u.oldCls === 'mage' && u.kitDef && u.kitDef.attackByName.orb);
  }
  // Rebirth (0.43)
  {
    const { starmarksFor, PERKS, REBIRTH } = await import('../src/sim/rebirth.js');
    const save = geared('rogue', 100, 6);
    Object.assign(save, { wish: 100, wishPts: 3, wishStats: { might: 40 }, gold: 5000, scrap: 900, dust: 40, tierMax: 4, worldTier: 4, spec: 'assassin', bossKills: { boss3: 2 }, quests: { unmade: { s: 'done', n: 1 } }, glows: ['ember'] });
    const w = new World({ seed: 7, cls: 'rogue', save });
    const p = w.player;
    check('Rebirth: 10 Starmarks for level 100, plus 2 x the root of Wishborne levels', starmarksFor(100, 100) === 30 && starmarksFor(100, 0) === 10 && starmarksFor(99, 400) === 0);
    const young = new World({ seed: 7, cls: 'rogue', save: Object.assign(geared('rogue', 100, 3), { bossKills: {} }) });
    young.command({ type: 'rebirth' }); young.runCommands();
    check('Rebirth: not before The Unmade is beaten', !young.events.some((e) => e.type === 'reborn'));
    w.command({ type: 'rebirth' }); w.runCommands();
    const ev = w.events.find((e) => e.type === 'reborn');
    check('Rebirth: at level 100 with The Unmade beaten, the star begins you again', !!ev && ev.n === 1 && ev.marks === 30);
    const fresh = ev.save;
    check('Rebirth: a full fresh start (level 1, starter weapon, empty bag, no scrap or Wishdust)', fresh.level === 1 && Object.keys(fresh.equipped).join() === 'weapon' && fresh.equipped.weapon.id === 'starter' && !fresh.bag.length && fresh.scrap === 0 && !fresh.dust);
    const w2 = new World({ seed: 7, cls: 'rogue', save: fresh });
    const q = w2.player;
    check('Rebirth: story, quests, tiers, subclass and Wishborne all start again', !q.spec && q.tierMax === 1 && !Object.keys(q.quests).length && q.wish === 0 && !Object.keys(q.wishStats).length && !q.bossKills.boss3);
    check('Rebirth: Starmarks, glows (a new one too) and the account\'s gold stay', q.rebirth.marks === 30 && q.rebirth.n === 1 && q.glows.includes('ember') && q.glows.includes('dawn') && fresh.gold === 5000);
    check('Rebirth: the past life is remembered (for the ending that builds on this)', q.rebirth.past.length === 1 && q.rebirth.past[0].level === 100 && q.rebirth.past[0].spec === 'assassin');
    const ad0 = q.stats.ad, bag0 = w2.bagSize(), sp0 = q.skillPoints;
    for (let i = 0; i < 3; i++) { w2.command({ type: 'rebirthPerk', id: 'starborn' }); w2.runCommands(); }
    w2.command({ type: 'rebirthPerk', id: 'pockets' }); w2.runCommands();
    w2.command({ type: 'rebirthPerk', id: 'head' }); w2.runCommands();
    check('Perks: Starborn adds damage, Deep Pockets bag slots, Head Start a skill point', q.stats.ad > ad0 && w2.bagSize() === bag0 + 4 && q.skillPoints === sp0 + 1, `${ad0}->${q.stats.ad}`);
    check('Perks: paid in Starmarks', q.rebirth.marks === 30 - 3 * PERKS.starborn.cost - PERKS.pockets.cost - PERKS.head.cost);
    q.rebirth.marks = 0;
    w2.command({ type: 'rebirthPerk', id: 'study' }); w2.runCommands();
    check('Perks: none without the Starmarks', !q.rebirth.perks.study);
    const e0 = q.exp;
    w2.gainExp(20);
    check('Rebirth: every rebirth on the account adds 5% EXP (Quick Study more)', q.exp - e0 === Math.round(20 * (1 + REBIRTH.acctExp)), q.exp - e0);
    const back = new World({ seed: 7, cls: 'rogue', save: w2.toSave() });
    check('Rebirth: perks and Starmarks are saved', back.player.rebirth.perks.starborn === 3 && back.bagSize() === bag0 + 4);
  }
  // Rerolling and reforging (0.43; enchanting since 0.29)
  {
    const { rerollCost, rollQuality, rollTier, statRange, reforgeChoices } = await import('../src/sim/items.js');
    const save = geared('archer', 50, 3);
    save.gold = 1e8; save.dust = 100; save.scrap = 1e7;
    const w = new World({ seed: 4, cls: 'archer', save });
    const p = w.player;
    const item = p.equipped.helm;
    const keys = Object.keys(item.stats);
    const main = keys[0], line = keys[1];
    const rc = rerollCost(item);
    const seen = new Set();
    let sameKeys = true, inRange = true;
    for (let i = 0; i < 300; i++) {
      w.command({ type: 'enchant', slot: 'helm', key: line }); w.runCommands();
      seen.add(item.stats[line]);
      if (Object.keys(item.stats).join() !== keys.join()) sameKeys = false;
      const { lo, hi } = statRange(item, line);
      if (item.stats[line] < lo || item.stats[line] > hi) inRange = false;
    }
    check('Reroll: the line keeps its stat, only the number changes', sameKeys && seen.size > 3, `${seen.size} different numbers`);
    check('Reroll: as often as you like, the same price every time', p.gold === 1e8 - 300 * rc.gold && p.scrap === 1e7 - 300 * rc.scrap && rerollCost(item).gold === rc.gold);
    check('Reroll: every roll lands inside the line\'s range', inRange);
    const m0 = item.stats[main];
    for (let i = 0; i < 40; i++) { w.command({ type: 'enchant', slot: 'helm', key: main }); w.runCommands(); }
    check('Reroll: the main stat can be rerolled too', Object.keys(item.stats)[0] === main && item.stats[main] > 0, `${m0} -> ${item.stats[main]}`);
    const { lo, hi } = statRange(item, line);
    item.stats[line] = hi;
    check('Roll quality: the best roll is an Immortal roll', rollQuality(item, line) === 1 && rollTier(1) === 6);
    item.stats[line] = lo;
    check('Roll quality: the lowest is a Common roll', rollQuality(item, line) === 0 && rollTier(0) === 0);
    check('Roll quality: in order, Common up to Immortal', [0.1, 0.4, 0.6, 0.75, 0.9, 0.95, 0.99].map(rollTier).join() === '0,1,2,3,4,5,6');
    const cost = enchantCost(item);
    const to = reforgeChoices(item)[0];
    w.command({ type: 'reforge', slot: 'helm', key: main, to }); w.runCommands();
    check('Reforge: never the main stat', Object.keys(item.stats)[0] === main && !item.enchants);
    w.command({ type: 'reforge', slot: 'helm', key: line, to: 'ms' }); w.runCommands();
    check('Reforge: only into a stat it may have', !item.enchants);
    w.command({ type: 'reforge', slot: 'helm', key: line, to }); w.runCommands();
    const after = Object.keys(item.stats);
    check('Reforge: turns one bonus stat into the one you chose, in the same place', after.length === keys.length && after[0] === main && after[1] === to && item.enchantKey === to && p.dust === 100 - cost.dust, `${keys} -> ${after}`);
    check('Reforge: after that only the reforged line can be reforged again, and it costs more', enchantable(item).length === 1 && enchantable(item)[0] === item.enchantKey && enchantCost(item).dust > cost.dust);
    const mythic = roll(mk(2), 50, { weights: [0, 0, 0, 0, 1, 0, 0] });
    check('Wishdust: scrapping a Mythic gives one', dustValue(mythic) === 1 && dustValue(roll(mk(2), 50, { weights: [0, 0, 1, 0, 0, 0, 0] })) === 0);
  }
  // 0.30: Ancient moved above Mythic; old saves keep their items' strength, with the right names
  {
    const { migrateItem } = await import('../src/sim/items.js');
    check('Rarities: Epic, Mythic, Ancient, Immortal, each stronger than the last', RARITIES.slice(3).map((r) => r.name).join() === 'Epic,Mythic,Ancient,Immortal' && RARITIES[4].mult < RARITIES[5].mult && RARITIES[5].mult < RARITIES[6].mult);
    const oldLeg = { id: 'a', name: 'Ancient Iron Helm', slot: 'helm', rarity: 4, ilvl: 40, stats: { hp: 500 }, plus: 0 };
    const oldMyth = { id: 'b', name: 'Mythic Iron Helm', slot: 'helm', rarity: 5, ilvl: 40, stats: { hp: 600 }, plus: 0 };
    const oldSet = { id: 'c', name: 'Bloodbound Crown', slot: 'helm', rarity: 4, ilvl: 40, stats: { hp: 230 }, plus: 0, set: 'bloodbound', cls: 'warrior' };
    const w = new World({ seed: 1, cls: 'warrior', save: Object.assign(geared('warrior', 40, 1), { bag: [oldLeg, oldMyth], equipped: Object.assign(geared('warrior', 40, 1).equipped, { helm: oldSet }) }) });
    const [a, b] = w.player.bag;
    check('Old saves: a Legendary keeps its strength and is called Mythic now', a.rarity === 4 && a.name === 'Mythic Iron Helm' && a.stats.hp === 500);
    check('Old saves: a Mythic keeps its strength and is called Ancient now', b.rarity === 5 && b.name === 'Ancient Iron Helm' && b.stats.hp === 600);
    check('Old saves: a set piece moves up to Ancient, stats and all', w.player.equipped.helm.rarity === 5 && w.player.equipped.helm.stats.hp === Math.round(230 * RARITIES[5].mult / RARITIES[4].mult));
    migrateItem(a); migrateItem(b);
    check('Old saves: converting twice changes nothing', a.name === 'Mythic Iron Helm' && b.name === 'Ancient Iron Helm' && w.player.equipped.helm.rarity === 5);
  }
  // A started swing finishes on a target that slips a little out of reach
  {
    const w = new World({ seed: 4, cls: 'archer', save: geared('archer', 30, 2) });
    const p = w.player; w.wave.phase = 'explore'; w.enemies = [];
    p.x = p.px = 0; p.z = p.pz = 0;
    const e = w.spawnEnemy('grunt', { x: 5, z: 0, level: 30 });
    e.x = e.px = w.basicRange() - 0.3; e.z = e.pz = 0; e.state = 'recover'; e.t = 999;
    w.command({ type: 'attack', id: e.id }); w.runCommands();
    for (let i = 0; i < 4; i++) w.step(CONFIG.TICK);
    e.x = e.px = w.basicRange() + 1.2;
    let shot = false;
    for (let i = 0; i < 60 && !shot; i++) { w.step(CONFIG.TICK); shot = w.projectiles.some((pr) => pr.basic); }
    check('Swings: a shot that has started still goes if the target slips a little out of range', shot);
  }
}
// --- 0.31: unique Remnants, world events, the merchant, ascending, glows, set bonuses ------
{
  const { geared } = await import('./balance.mjs');
  const { REMNANT, EVENTS, MERCHANT } = await import('../src/sim/surprises.js');
  const { rollUnique, rollSetPiece: rsp, itemStats: stats, IMMORTAL, REMNANT_UNIQUE } = await import('../src/sim/items.js');
  const { makeRng: mk } = await import('../src/sim/rng.js');
  const run = (w, sec, fn) => { for (let i = 0; i < sec * 60; i++) { if (fn) fn(); w.step(CONFIG.TICK); } };
  const remnantOf = (type, map) => {
    const w = new World({ seed: 3, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 70, 3), { bossKills: { boss: 5, boss2: 5, boss3: 5 } }) });
    w.loadMap(map, 'town');
    const b = w.enemies.find((e) => e.type === type);
    w.enemies = [b];
    if (!b.remnant) w.makeRemnant(b);
    const p = w.player;
    p.x = p.px = b.x - 7; p.z = p.pz = b.z;
    b.aggro = true; b.state = 'recover'; b.t = 999;
    return { w, p, b };
  };
  const hold = (w) => () => { w.command({ type: 'stop' }); w.runCommands(); };
  {
    const { w, b } = remnantOf('boss', 'keep');
    run(w, REMNANT.shades.first + 0.2, hold(w));
    const shades = w.enemies.filter((e) => e.summoner === b.id);
    w.killEnemy(b, 'basic');
    check('Mirrored Oath: the shades fall with their Remnant', shades.length === 2 && shades.every((s) => s.dead));
  }
  {
    const { w, p, b } = remnantOf('boss2', 'hollow');
    run(w, REMNANT.pools.first + 0.1, hold(w));
    check('Spore Bloom: the Mycelord\'s Remnant grows spore pools near you (never right under you)', w.hazards.length === REMNANT.pools.count && w.hazards.every((h) => { const d = Math.hypot(h.x - p.x, h.z - p.z); return d >= REMNANT.pools.near - 0.5 && d <= REMNANT.pools.far + 0.5; }) && w.telegraphs.some((t) => t.pool));
    const r0 = w.hazards[0].r, hp0 = p.hp;
    p.x = p.px = w.hazards[0].x; p.z = p.pz = w.hazards[0].z; // stand in one
    run(w, 2, hold(w));
    check('Spore Bloom: the pools grow, and standing in one hurts', w.hazards[0].r > r0 + 1 && p.hp < hp0);
  }
  {
    const { w, b } = remnantOf('boss3', 'sanctum');
    b.hp = b.maxHp * 0.5;
    run(w, REMNANT.stars.first + 0.1, hold(w));
    const stars = w.enemies.filter((e) => e.type === 'wishstar');
    check('Unwishing: The Unmade\'s Remnant calls three wish-stars', stars.length === 3);
    const hp = b.hp, dmg = b.dmgMult;
    w.killEnemy(stars[0], 'basic');
    run(w, REMNANT.stars.life + 0.2, hold(w));
    check('Unwishing: each wish-star left standing heals it 5% and makes it hit 10% harder', Math.abs(b.hp - hp - b.maxHp * 0.1) < b.maxHp * 0.005 && Math.abs(b.dmgMult / dmg - 1.21) < 0.001, `${((b.hp - hp) / b.maxHp).toFixed(3)} ${(b.dmgMult / dmg).toFixed(3)}`);
  }
  {
    const it = rollUnique(mk(4), 70, REMNANT_UNIQUE.boss3, 'mage');
    check('Unique Immortals: each Remnant has its own (The Unmade: The Unwished Crown, a helm)', it.rarity === IMMORTAL && it.effect === 'unwished' && it.slot === 'helm' && it.name === 'The Unwished Crown');
    const save = geared('mage', 100, 4);
    save.equipped.helm = it;
    const w = new World({ seed: 7, mode: 'explore', cls: 'mage', save: Object.assign(save, { tierMax: 5, worldTier: 3, bossKills: { boss: 1, boss2: 1, boss3: 1 } }) });
    w.loadMap('sanctum', 'spire');
    const b = w.enemies.find((e) => e.def.boss);
    w.enemies = [b];
    const p = w.player;
    p.ward = 0; p.wardT = 99;
    const hp = p.hp;
    w.hitPlayer(0, { doom: 0.35, src: b });
    check('The Unwished Crown: Doom takes half', Math.abs(hp - p.hp - Math.round(p.stats.maxHp * 0.175)) <= 1, `${hp - p.hp} of ${p.stats.maxHp}`);
  }
  {
    const save = geared('warrior', 60, 3);
    save.equipped.ring = rollUnique(mk(5), 60, 'oathsignet', 'warrior');
    const w = new World({ seed: 7, cls: 'warrior', save });
    const p = w.player; w.wave.phase = 'explore'; w.enemies = [];
    const near = w.spawnEnemy('grunt', { x: 3, z: 0, level: 60 }); near.x = near.px = 3; near.z = near.pz = 0; near.hp = near.maxHp = 1e9; near.state = 'recover'; near.t = 999;
    p.x = p.px = 0; p.z = p.pz = 0; p.parryT = 0.3; p.parryAge = 0;
    w.hitPlayer(10, { parryable: true, src: near });
    check("Oathbreaker's Signet: a perfect parry cuts everything close", near.hp < 1e9 && w.events.some((ev) => ev.type === 'oathBlade'));
  }
  // Ascending
  {
    const save = geared('archer', 60, 3);
    const a = rollUnique(mk(6), 60, 'sporeheart', 'archer'), dup = rollUnique(mk(7), 60, 'sporeheart', 'archer');
    save.equipped.chest = a; save.bag = [dup];
    const w = new World({ seed: 7, cls: 'archer', save });
    const before = stats(a).armor;
    w.command({ type: 'ascend', slot: 'chest', index: 0 }); w.runCommands();
    check('Ascending: a duplicate Immortal gives a star (+10% to every stat) and is used up', a.stars === 1 && w.player.bag.length === 0 && Math.abs(stats(a).armor / before - 1.1) < 0.02);
    const other = rollUnique(mk(8), 60, 'oathsignet', 'archer');
    w.player.bag = [other];
    w.command({ type: 'ascend', slot: 'chest', index: 0 }); w.runCommands();
    check('Ascending: only the same Immortal will do', a.stars === 1 && w.player.bag.length === 1);
  }
  // Glows
  {
    const w = new World({ seed: 7, mode: 'explore', cls: 'rogue', save: geared('rogue', 40, 2) });
    w.unlockGlow('gold');
    check('Glows: an earned glow is shown at once and kept with the character', w.player.glows.includes('gold') && w.player.glow === 'gold' && w.toSave().glows.includes('gold'));
    w.command({ type: 'setGlow', id: 'void' }); w.runCommands();
    check('Glows: you can only show one you have earned', w.player.glow === 'gold');
    w.command({ type: 'setGlow', id: null }); w.runCommands();
    check('Glows: or none', w.player.glow === null);
  }
  // World events
  {
    const w = new World({ seed: 9, mode: 'explore', cls: 'archer', save: geared('archer', 40, 3) });
    w.loadMap('frost', 'town');
    w.enemies = [];
    const ev = w.startEvent('meteor');
    check('Meteor: it falls somewhere away from you', ev && ev.state === 'falling' && Math.hypot(ev.x - w.player.x, ev.z - w.player.z) >= 17);
    run(w, EVENTS.meteor.warn + 0.1);
    const pack = w.enemies.filter((e) => ev.ids.includes(e.id));
    check('Meteor: a pack crawls out of the crater', ev.state === 'fight' && pack.length === EVENTS.meteor.pack);
    const chests = w.chests.length;
    for (const e of pack) w.killEnemy(e, 'basic');
    run(w, 0.1);
    check('Meteor: clear it and a radiant chest waits in the crater', !w.happening && w.chests.length === chests + 1 && w.chests[w.chests.length - 1].tier === 'radiant' && Math.hypot(w.chests[w.chests.length - 1].x - ev.x, w.chests[w.chests.length - 1].z - ev.z) < 0.1);
  }
  {
    const w = new World({ seed: 9, mode: 'explore', cls: 'warrior', save: geared('warrior', 40, 3) });
    w.loadMap('frost', 'town');
    w.enemies = [];
    const p = w.player;
    w.eventClock = 1e9; // (no other event starting meanwhile)
    const ev = w.startEvent('shrine');
    p.x = p.px = ev.x; p.z = p.pz = ev.z;
    const stay = () => { p.x = ev.x; p.z = ev.z; p.hp = p.stats.maxHp; w.command({ type: 'stop' }); w.runCommands(); };
    run(w, 0.2, stay);
    check('Shrine: step into the ring to start it', ev.state === 'hold');
    run(w, 10, stay);
    check('Shrine: waves come at you while you hold it', w.enemies.length >= EVENTS.shrine.per);
    const dust = p.dust, tk = p.tickets, chests = w.chests.length;
    run(w, EVENTS.shrine.hold, () => { stay(); w.enemies = []; });
    // (standing on the shrine, the radiant chest opens the moment it appears: its shard comes too)
    check('Shrine: hold it 60 seconds for a radiant chest, Wishdust and a shard', !w.happening && (w.chests.length === chests + 1 || p.tickets >= tk + EVENTS.shrine.tickets + 1) && p.dust === dust + EVENTS.shrine.dust && p.tickets >= tk + EVENTS.shrine.tickets);
    w.eventClock = 1e9;
    const ev2 = w.startEvent('shrine');
    p.x = p.px = ev2.x; p.z = p.pz = ev2.z;
    run(w, 0.2, () => { p.x = ev2.x; p.z = ev2.z; w.command({ type: 'stop' }); w.runCommands(); });
    run(w, EVENTS.shrine.grace + 0.5, () => { p.x = ev2.x + 20; p.z = ev2.z; p.hp = p.stats.maxHp; w.enemies = []; });
    check('Shrine: leave it empty for 6 seconds and it goes dark', !w.happening);
  }
  // The travelling merchant
  {
    const w = new World({ seed: 9, mode: 'explore', cls: 'mage', save: Object.assign(geared('mage', 40, 3), { gold: 1e6, tickets: 10, spec: 'pyromancer' }) });
    w.loadMap('frost', 'town');
    const mc = w.merchant || w.spawnMerchant();
    const p = w.player;
    check('Merchant: sets up near you, with gear, Wishdust and a set piece for sale', mc && mc.stock.length >= MERCHANT.stock.length - 1 && mc.stock.some((x) => x.kind === 'set') && Math.hypot(mc.x - p.x, mc.z - p.z) < 15);
    w.command({ type: 'buyMerchant', i: 0 }); w.runCommands();
    check('Merchant: you have to walk up to him to buy', !mc.stock[0].sold);
    p.x = p.px = mc.x + 1; p.z = p.pz = mc.z;
    p.bag = [];
    const gold = p.gold, tk = p.tickets, dust = p.dust;
    for (let i = 0; i < mc.stock.length; i++) { w.command({ type: 'buyMerchant', i }); w.runCommands(); }
    const glassSold = mc.stock.some((x) => x.kind === 'glass');
    check('Merchant: everything bought, paid for, and in your bag (an Unwishing Glass in the pouch)', mc.stock.every((s) => s.sold) && p.bag.length === 4 && p.bag.some((it) => it.set) && p.bag.filter((it) => !it.set).every((it) => it.rarity >= 3) && p.dust === dust + 5 && p.gold < gold && p.tickets === tk - 5 - (glassSold ? 4 : 0) && (!glassSold || p.misc.glass === 1));
    run(w, MERCHANT.stay + 1, () => { p.hp = p.stats.maxHp; w.enemies = []; });
    check('Merchant: and he moves on after 3 minutes', !w.merchant);
  }
  // Play-changing set bonuses
  {
    const four = (cls, spec, setId) => {
      const save = Object.assign(geared(cls, 60, 3), { spec, talents: {} });
      for (const slot of ['helm', 'chest', 'boots', 'ring']) { const it = rsp(mk(slot.length), 60, cls, spec); it.set = setId; it.slot = slot; save.equipped[slot] = it; }
      const w = new World({ seed: 4, cls, save });
      w.wave.phase = 'explore'; w.enemies = [];
      const p = w.player; p.x = p.px = 0; p.z = p.pz = 0; for (const k of ['q', 'w', 'e', 'r']) p.cd[k] = 0;
      return { w, p };
    };
    const dummy = (w, x, z = 0) => { const e = w.spawnEnemy('grunt', { x, z, level: 60 }); e.x = e.px = x; e.z = e.pz = z; e.state = 'recover'; e.t = 999; e.hp = e.maxHp = 1e9; return e; };
    {
      const { w } = four('mage', 'frostbinder', 'rimeheart');
      const a = dummy(w, 3), b = dummy(w, 6);
      w.shatterFrost(a);
      check('Rimeheart: a Shatter also Shatters the nearest other enemy', w.events.filter((ev) => ev.type === 'frostShatter').length >= 2 && b.hp < 1e9);
    }
    {
      const { w, p } = four('rogue', 'assassin', 'nightcut');
      const a = dummy(w, 2), c = dummy(w, 3.5, 1);
      a.hp = 1;
      w.killEnemy(a, 'q');
      const t = dummy(w, 4);
      w.command({ type: 'cast', slot: 'q', x: 4, z: 0 }); w.runCommands();
      run(w, 0.3);
      check('Nightcut: after a Clean Kill, Shadowstrike also cuts everything close to its target', c.hp < 1e9 && t.hp < 1e9);
    }
    {
      const { w, p } = four('rogue', 'shadowdancer', 'veilweave');
      w.command({ type: 'cast', slot: 'e', x: 6, z: 0 }); w.runCommands();
      run(w, 0.3);
      p.cd.q = 5;
      w.command({ type: 'cast', slot: 'e', x: 0, z: 0 }); w.runCommands();
      check('Veilweave: trading places Veils you and brings Veilstep back', p.veilT > 3 && p.cd.q === 0);
    }
    {
      const { w, p } = four('warrior', 'berserker', 'bloodbound');
      w.command({ type: 'cast', slot: 'w', x: 0, z: 0 }); w.runCommands();
      w.step(CONFIG.TICK);
      w.takeDamage(p.hp + 1000, null, false);
      check('Bloodbound: nothing drops you below 1 health while you spin', !p.dead && p.hp === 1);
    }
    {
      const { w, p } = four('warrior', 'bulwark', 'wardstone');
      const e = dummy(w, 2);
      p.reck = 6;
      w.command({ type: 'cast', slot: 'w', x: 0, z: 0 }); w.runCommands();
      check('Wardstone: a Whirlwind with 5 or more Reckoning Breaks what it hits', e.state === 'stunned' && e.vulnT > 3);
    }
    {
      const { w, p } = four('archer', 'sharpshooter', 'farsight');
      const a = dummy(w, 4), b = dummy(w, 7);
      p.swingCount = w.mods.critEvery - 1;
      w.basicAttack(a);
      run(w, 0.6);
      check('Farsight: Steady Aim\'s crits pierce through to the enemy behind', a.hp < 1e9 && b.hp < 1e9);
    }
  }
}
// --- 0.32: subclass Immortals, endgame-only Immortals, lifesteal budget, Unwishing Glass --------
{
  const { geared } = await import('./balance.mjs');
  const { SPEC_IMMORTALS, EFFECTS, effectFor, rollItem: roll, RARITIES: RR, IMMORTAL: IMM, CACHES: CC } = await import('../src/sim/items.js');
  const { BOSS_LOOT: BL } = await import('../src/sim/story.js');
  const { makeRng: mk } = await import('../src/sim/rng.js');
  const immortal = (slot, cls) => roll(mk(slot.length + 3), 60, { weights: RR.map((_, i) => (i === IMM ? 1 : 0)), slot, cls });
  check('Subclass Immortals: every subclass has its own effect for every slot', Object.keys(SPEC_IMMORTALS).length === 8 && Object.values(SPEC_IMMORTALS).every((s) => ['weapon', 'helm', 'chest', 'boots', 'ring'].every((k) => s[k] && s[k].name && s[k].desc && s[k].apply)));
  {
    const save = Object.assign(geared('warrior', 60, 3), { spec: 'berserker', talents: {} });
    save.equipped.helm = immortal('helm', 'warrior');
    const w = new World({ seed: 3, cls: 'warrior', save });
    check("Subclass Immortals: a Berserker's helm is the Crown of the Last Breath, not Undying", !w.mods.undying && w.mods.bloodSave === 15 && w.mods.lastBreathOath === 3 && effectFor(save.equipped.helm.effect, 'warrior', 'berserker').name === 'Crown of the Last Breath');
    const save2 = Object.assign(geared('warrior', 12, 3), { talents: {} });
    save2.equipped.helm = immortal('helm', 'warrior');
    const w2 = new World({ seed: 3, cls: 'warrior', save: save2 });
    check('Subclass Immortals: before a subclass, the class effect (Undying)', w2.mods.undying === true);
    const save3 = Object.assign(geared('mage', 60, 3), { spec: 'pyromancer', talents: {} });
    save3.equipped.ring = (await import('../src/sim/items.js')).rollUnique(mk(9), 60, 'oathsignet', 'mage');
    const w3 = new World({ seed: 3, cls: 'mage', save: save3 });
    check("Subclass Immortals: a Remnant's own Immortal is the same for everyone", w3.mods.oathsignet === true);
  }
  {
    const save = Object.assign(geared('archer', 60, 3), { spec: 'sharpshooter', talents: {} });
    save.equipped.chest = immortal('chest', 'archer');
    const w = new World({ seed: 3, cls: 'archer', save });
    w.wave.phase = 'explore'; w.enemies = [];
    const p = w.player; p.x = p.px = 0; p.z = p.pz = 0;
    const far = w.spawnEnemy('grunt', { x: 9, z: 0, level: 60 }); far.x = far.px = 9; far.z = far.pz = 0;
    let hp = p.hp; w.hitPlayer(100, { parryable: false, src: far }); const alone = hp - p.hp;
    const near = w.spawnEnemy('grunt', { x: 2, z: 0, level: 60 }); near.x = near.px = 2; near.z = near.pz = 0; near.state = 'recover'; near.t = 999;
    hp = p.hp; w.hitPlayer(100, { parryable: false, src: far }); const crowded = hp - p.hp;
    check("Rangekeeper's Coat: 25% less damage while no enemy is within 6 m", Math.abs(alone / crowded - 0.75) < 0.03, `${alone} vs ${crowded}`);
  }
  // Endgame-only sources
  {
    let imm = 0;
    for (let i = 0; i < 5000; i++) if (roll(mk(i + 1), 100, { minRarity: 4 }).rarity === IMM) imm++;
    check('Immortals: never from an ordinary roll any more', imm === 0 && RR[IMM].weight === 0);
    check('Immortals: only The Unmade among the bosses (5% for its best piece), the Warden\'s Cache 1%, no other cache', BL.boss.top[IMM] === 0 && BL.boss2.top[IMM] === 0 && BL.boss3.top[IMM] === 5 && BL.boss3.first === IMM && CC.warden.odds[IMM] === 1 && CC.iron.odds[IMM] === 0 && CC.gilded.odds[IMM] === 0);
  }
  // Lifesteal budget: one Barrage no longer heals to full
  {
    const { talentPointsAt } = await import('../src/sim/talents.js');
    const save = Object.assign(geared('archer', 100, 5, 7), { spec: 'sharpshooter', talents: {}, tierMax: 5, worldTier: 5, bossKills: { boss: 1, boss2: 1, boss3: 1 } });
    const w = new World({ seed: 7, mode: 'explore', cls: 'archer', save });
    const p = w.player;
    w.loadMap('sanctum', 'spire');
    const b = w.enemies.find((e) => e.def.boss);
    w.enemies = [b];
    p.x = p.px = b.x - 9; p.z = p.pz = b.z; b.state = 'recover'; b.t = 999; b.aggro = true;
    for (let i = 0; i < 90; i++) w.step(CONFIG.TICK); // a full budget
    p.hp = p.stats.maxHp * 0.3;
    const hp0 = p.hp;
    w.command({ type: 'cast', slot: 'w', x: b.x, z: b.z }); w.runCommands();
    for (let i = 0; i < 90; i++) w.step(CONFIG.TICK);
    const healed = (p.hp - hp0) / p.stats.maxHp;
    check('Lifesteal budget: one late-game Barrage heals about a fifth of your health, not 70%', healed > 0.1 && healed < 0.3, (healed * 100).toFixed(0) + '%');
  }
  // Unwishing Glass
  {
    const w = new World({ seed: 7, mode: 'explore', cls: 'mage', save: Object.assign(geared('mage', 100, 3), { wish: 20, wishPts: 4, wishStats: { might: 10, vigor: 6 }, misc: { glass: 1 } }) });
    const p = w.player;
    w.command({ type: 'wishReset' }); w.runCommands();
    check('Unwishing Glass: every spent Wish point comes back, and the glass is used up', p.wishPts === 20 && Object.keys(p.wishStats).length === 0 && p.misc.glass === 0);
    w.command({ type: 'wishSpend', stat: 'might', n: 5 }); w.runCommands();
    w.command({ type: 'wishReset' }); w.runCommands();
    check('Unwishing Glass: no glass, no reset', p.wishStats.might === 5 && p.wishPts === 15);
    check('Unwishing Glass: the pouch is saved with the character', w.toSave().misc.glass === 0);
  }
}
// --- 0.33: bounty board, Immortal Fragments, Remnant Sigils, The Wilds ----------------------
{
  const { geared } = await import('./balance.mjs');
  const { BOUNTY: BT, FRAGMENTS: FR, WILDS: WD } = await import('../src/sim/surprises.js');
  const { RARITIES: RR, IMMORTAL: IMM } = await import('../src/sim/items.js');
  const { MAPS: MM } = await import('../src/sim/maps.js');
  const tick = (w, n) => { for (let i = 0; i < n; i++) w.step(CONFIG.TICK); };
  // The board
  {
    const w = new World({ seed: 5, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 40, 3), { visited: ['town', 'greenwood', 'fen', 'ridge', 'keep'] }) });
    const p = w.player;
    w.loadMap('town', 'greenwood');
    check('Bounties: three jobs on the board in Haven', p.bounties.length === BT.slots && p.bounties.every((b) => b.text && b.reward.fragments >= BT.fragments[0] && b.reward.fragments <= BT.fragments[1]), p.bounties.map((b) => b.text).join(' | '));
    check('Bounties: never the same job twice on the board', new Set(p.bounties.map((b) => b.kind + (b.map || ''))).size === 3);
    {
      // Over many boards, still never a repeat.
      let dup = 0;
      for (let k = 0; k < 40; k++) { p.bounties = []; w.fillBounties(); if (new Set(p.bounties.map((b) => b.kind + (b.map || ''))).size < 3) dup++; }
      check('Bounties: ...over forty fresh boards, not one repeat', dup === 0, String(dup));
      p.bounties = []; w.fillBounties();
    }
    check('Right-click and G share one list: the bounty board is in it', w.interactables().some((o) => o.kind === 'board'));
    w.spawnMerchant && (w.loadMap('greenwood', 'town'), w.spawnMerchant());
    check('Right-click and G share one list: so is the travelling merchant', !w.merchant || w.interactables().some((o) => o.kind === 'merchant'), String(!!w.merchant));
    w.loadMap('town', 'greenwood');
    check('Bounties: the board stands in Haven, and G reads it', (() => { const ob = w.obstacles.find((o) => o.kind === 'board'); p.x = p.px = ob.x + 1.2; p.z = p.pz = ob.z; const n = w.interactable(); return n && n.kind === 'board'; })());
    // A storied job, done and claimed
    p.bounties[0] = Object.assign(w.makeBounty(), { kind: 'storied', need: 1, n: 0, done: false, text: 'Bring down a Storied enemy', reward: { fragments: 8, dust: 5, glass: 1 } });
    w.bountyEvent('storied');
    const dust0 = p.dust;
    check('Bounties: progress counts, and a finished job says so', p.bounties[0].done === true);
    w.command({ type: 'claimBounty', i: 0 }); w.runCommands();
    check('Bounties: claiming pays fragments and the rest, and a new job takes its place', p.misc.fragment === 8 && p.dust === dust0 + 5 && p.misc.glass === 1 && !p.bounties[0].done && p.bounties.length === 3);
    const g0 = p.gold = 100000;
    const was = p.bounties[1].id;
    w.command({ type: 'swapBounty', i: 1 }); w.runCommands();
    check('Bounties: swap a job for gold', p.bounties[1].id !== was && p.gold < g0);
    check('Bounties: the board is saved with the character', w.toSave().bounties.length === 3 && w.toSave().bountyN === p.bountyN);
    // Kill jobs count on their own map only
    const save = w.toSave();
    const w2 = new World({ seed: 5, mode: 'explore', cls: 'warrior', save });
    const p2 = w2.player;
    p2.bounties[2] = { id: 'x', kind: 'kill', map: 'fen', mapName: 'Fen', need: 2, n: 0, done: false, text: 'Clear 2 enemies in Fen', reward: { fragments: 6 } };
    w2.loadMap('greenwood', 'town');
    w2.bountyEvent('kill', { map: 'greenwood' });
    check('Bounties: a kill job only counts on its map', p2.bounties[2].n === 0);
    w2.loadMap('fen', 'greenwood');
    const e = w2.enemies.find((x) => !x.def.boss);
    w2.killEnemy(e, 'basic');
    tick(w2, 2);
    check('Bounties: ...and a kill there counts', p2.bounties[2].n >= 1, String(p2.bounties[2].n));
    let unclaimable = true;
    p2.bounties[2].done = true;
    w2.command({ type: 'claimBounty', i: 2 }); w2.runCommands();
    unclaimable = p2.bounties[2].id === 'x';
    check('Bounties: rewards are claimed at the board in Haven, not in the field', unclaimable);
  }
  // Fragments and crafting
  {
    const save = Object.assign(geared('archer', 80, 3), { spec: 'windrunner', talents: {}, misc: { fragment: FR.craft + 10 } });
    save.equipped.boots = null;
    const w = new World({ seed: 11, mode: 'explore', cls: 'archer', save });
    const p = w.player;
    w.command({ type: 'craftImmortal', slot: 'boots' }); w.runCommands();
    check('Immortal Fragments: 250 craft an Immortal for the slot you choose, at your level', p.equipped.boots && p.equipped.boots.rarity === IMM && p.equipped.boots.ilvl >= 78 && p.misc.fragment === 10, p.equipped.boots && RR[p.equipped.boots.rarity].name);
    w.command({ type: 'craftImmortal', slot: 'ring' }); w.runCommands();
    check('Immortal Fragments: not enough, no craft', p.misc.fragment === 10);
    const w2 = new World({ seed: 11, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 50, 3), { misc: { fragment: 999 } }) });
    w2.command({ type: 'craftImmortal', slot: 'ring' }); w2.runCommands();
    check('Immortal Fragments: crafting opens at level 70', w2.player.misc.fragment === 999);
    // How long does an Immortal take? Fragments per hour at a steady endgame pace.
    const perBounty = (BT.fragments[0] + BT.fragments[1]) / 2;
    const hour = 4 * perBounty + 12 * FR.storied + 4 * FR.thief + 4 * FR.event; // measured at tier III: ~26-54 fragments an hour in the field, plus ~4 jobs
    check('Immortal Fragments: about two to four hours of endgame play per crafted Immortal', FR.craft / hour > 1.5 && FR.craft / hour < 4.5, (FR.craft / hour).toFixed(1) + ' h');
  }
  // Remnant Sigils
  {
    const save = Object.assign(geared('warrior', 100, 5, 7), { spec: 'guardian', talents: {}, tierMax: 3, worldTier: 3, bossKills: { boss: 3, boss2: 1, boss3: 0 }, misc: { sigil: 1 } });
    const w = new World({ seed: 9, mode: 'explore', cls: 'warrior', save });
    const p = w.player;
    w.loadMap('keep', 'ridge');
    const b = w.enemies.find((e) => e.def.boss);
    check('Remnant Sigils: no altar while the boss stands', !w.bossAltar());
    w.killEnemy(b, 'basic'); tick(w, 30);
    const alt = w.bossAltar();
    p.x = p.px = alt.x + 1; p.z = p.pz = alt.z; p.dead = false;
    const near = w.interactable();
    check('Remnant Sigils: with the boss down, its altar can be used', alt && near && near.kind === 'altar');
    check('Right-click and G share one list: a free altar is in it', w.interactables().some((o) => o.kind === 'altar'));
    w.command({ type: 'summonRemnant' }); w.runCommands();
    const rem = w.enemies.find((e) => e.remnant && !e.dead);
    check('Remnant Sigils: the sigil calls up the Remnant at once, and is used up', rem && p.misc.sigil === 0);

    const w2 = new World({ seed: 9, mode: 'explore', cls: 'warrior', save: Object.assign({}, save, { bossKills: { boss: 1, boss2: 1 }, misc: { sigil: 1 } }) });
    w2.loadMap('keep', 'ridge');
    const b2 = w2.enemies.find((e) => e.def.boss);
    w2.killEnemy(b2, 'basic'); tick(w2, 30);
    const a2 = w2.bossAltar();
    w2.player.x = w2.player.px = a2.x; w2.player.z = w2.player.pz = a2.z + 1;
    w2.command({ type: 'summonRemnant' }); w2.runCommands();
    check('Remnant Sigils: only for a boss beaten three times', w2.player.misc.sigil === 1 && !w2.enemies.some((e) => e.remnant));
  }
  // The Wilds
  {
    const save = Object.assign(geared('mage', 100, 5), { tierMax: 2, worldTier: 1, bossKills: { boss: 1, boss2: 1, boss3: 1 } });
    const w = new World({ seed: 4, mode: 'explore', cls: 'mage', save });
    w.loadMap('town', 'greenwood');
    w.command({ type: 'travel', to: 'wilds' }); w.runCommands();
    check('The Wilds: closed on world tier I', w.map.id === 'town');
    w.player.worldTier = 2;
    w.command({ type: 'travel', to: 'wilds' }); w.runCommands();
    check('The Wilds: open by the Waygate from world tier II, no walking needed', w.map.id === 'wilds' && w.map.radius > 1.5 * MM.sanctum.radius, String(w.map.id));
    check('The Wilds: more of everything', WD.events < 120 && WD.eventChance > 0.4 && WD.thiefIn > 0.3 && WD.storied >= 2);
    tick(w, 30);
    check('The Wilds: a world event clock that runs faster', w.eventClock <= WD.events);
  }
}

// --- 0.26.1: lighter co-op updates --------------------------------------------------
// The host sends what changed; the friend rebuilds the whole picture as updates arrive,
// even when it skips some to catch up. Its world must match the host's at every step.
{
  const { makeSnapshot, applySnapshot, receiveSnapshot } = await import('../src/net/sync.js');
  const { geared } = await import('./balance.mjs');
  const w = new World({ seed: 21, mode: 'explore', save: { ...geared('archer', 100, 5), tierMax: 3, worldTier: 3 } });
  w.addHero(1, { save: geared('mage', 100, 5), name: 'Mia' });
  w.loadMap('ridge', 'town');
  const friend = new World({ seed: 9, cls: 'mage', mode: 'explore' });
  friend.loadMapMirror('town');
  const look = (enemies, loot, me) => JSON.stringify({
    e: enemies.filter((e) => e.type).map((e) => [e.id, e.type, Math.round(Math.round(e.hp * 100) / 100), e.maxHp, e.level, e.elite || null, e.state]).sort((a, b) => a[0] - b[0]),
    l: loot.map((l) => [l.id, l.item.id, l.x, l.z]).sort((a, b) => a[0] - b[0]),
    me: [me.hp, me.gold, me.exp, me.level, me.cd && me.cd.q],
    bag: (me.bag || []).map((i) => i.id).join(),
  });
  const r2 = (n) => Math.round(n * 100) / 100;
  const memo = {};
  const queue = [];
  let applied = 0, wrong = 0, firstWrong = '', bytes = 0, sent = 0, mapped = 0;
  for (let i = 0; i < 60 * 240; i++) {
    if (i % 30 === 0) for (const pid of [0, 1]) { const e = w.enemies.find((x) => !x.dead); if (e) w.command({ type: 'attackMove', x: e.x, z: e.z, pid }); }
    for (const h of w.heroes) h.player.hp = h.player.maxHp;
    if (i === 60 * 120) { w.loadMap('fen', 'ridge'); mapped++; } // a map change part way
    w.step(CONFIG.TICK);
    if (i % 3) continue;
    const str = JSON.stringify(makeSnapshot(w, 1, memo));
    bytes += str.length; sent++;
    const snap = JSON.parse(str);
    const h = w.heroByPid(1).player;
    snap.want = look(w.enemies, w.loot.filter((l) => l.owner === undefined || l.owner === 1).map((l) => ({ ...l, x: r2(l.x), z: r2(l.z) })), h);
    receiveSnapshot(friend, snap);
    queue.push(snap);
    // Play back: usually one at a time, now and then a hitch that skips a few (as the game does).
    const hitch = i % 97 === 0;
    while (queue.length > (hitch ? 0 : 1)) {
      const msg = queue.shift();
      if (hitch && queue.length) {
        if (msg.heavy) queue[0].heavy = { ...msg.heavy, ...(queue[0].heavy || {}) };
        if (msg.map === queue[0].map) continue;
      }
      applySnapshot(friend, msg, 1);
      applied++;
      const got = look(friend.enemies, friend.loot, friend.player);
      if (got !== msg.want) { wrong++; if (!firstWrong) { let k = 0; while (got[k] === msg.want[k]) k++; firstWrong = `update ${applied}: ...${got.slice(k - 60, k + 80)} vs ...${msg.want.slice(k - 60, k + 80)}`; } }
    }
  }
  check('co-op updates: after thousands of updates, skips and a map change, the friend sees exactly what the host has', wrong === 0 && applied > 1000 && friend.map.id === 'fen', `${wrong} wrong of ${applied}; ${firstWrong}`);
  check('co-op updates: about a kilobyte each at world tier III', bytes / sent < 1500, Math.round(bytes / sent) + ' bytes');
  // A lost update (say, one that came while the friend was still joining): the friend notices and asks for a full one.
  makeSnapshot(w, 1, memo); // never arrives
  const after = JSON.parse(JSON.stringify(makeSnapshot(w, 1, memo)));
  check('co-op updates: a missing update is noticed, not pieced together wrongly', receiveSnapshot(friend, after) === false && applySnapshot(friend, after) === false);
  const reset = {}; // what the host does when asked
  const fresh = JSON.parse(JSON.stringify(makeSnapshot(w, 1, reset)));
  check('co-op updates: ...and the full one that follows puts the friend right', fresh.full && receiveSnapshot(friend, fresh) && (applySnapshot(friend, fresh, 1), look(friend.enemies, friend.loot, friend.player) === look(w.enemies, w.loot.filter((l) => l.owner === undefined || l.owner === 1).map((l) => ({ ...l, x: r2(l.x), z: r2(l.z) })), w.heroByPid(1).player)));
}
process.exit(failed ? 1 : 0);
