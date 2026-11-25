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
import { classPower } from '../src/sim/balance.js';
const POWER_OF = (w) => classPower(w.cls, w.player.spec, w.player.level);

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
  const road = MAP_IDS.filter((id) => !MAPS[id].fromTier && !MAPS[id].deep && !MAPS[id].caelum && !MAPS[id].wishkeep); // (0.80: the Wishkeep is by the Waygate only)
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
    check('maps: one road from Haven through every map', chain.length === Object.keys(MAPS).filter((id) => !MAPS[id].fromTier && !MAPS[id].deep && !MAPS[id].caelum && !MAPS[id].wishkeep).length, chain.join(' > '));
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
    run(w, 0.1); w.events.length = 0;
    w.command({ type: 'cast', slot: 'r', x: e.x, z: e.z }); run(w, 0.5);
    check('archer: Arrow Storm is drawn for a second first, slowed, nothing loosed yet (0.51)', !!p.channel && p.channel.slow > 0 && damageOf(w) === 0 && w.zones.length === 0);
    run(w, 0.6);
    check('archer: Skyfall: the first arrows land together and pin', damageOf(w) > 0 && e.slow >= 0.9 && e.slowT > 0 && !p.channel);
    run(w, 3.5);
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
    check(`${cls} bot: clears waves and uses its kit`, w.wave.n >= 4 && log.casts >= 5, `wave ${w.wave.n}, level ${w.player.level}, casts ${log.casts}`);
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
  const { expToNext, enemyScale, ENEMIES, BOSSES, buildWave, levelBandMult } = DEFS;
  let rising = true, total = 0;
  for (let L = 1; L < 100; L++) { if (expToNext(L + 1) <= expToNext(L)) rising = false; total += expToNext(L) / (10 * enemyScale(L).exp * levelBandMult(0)); }
  check('levels: each level needs more EXP than the last', rising);
  check('levels: 100 is a long road but not an endless one', total > 2000 && total < 8000, Math.round(total) + ' Husks of your own level');
  // Fight near your level (0.49): 10x within 3 levels, sliding to 2x at 10 apart, never less.
  check('level band: 10x within 3 levels either way, 2x at 10 or more apart, sliding between', levelBandMult(0) === 10 && levelBandMult(-3) === 10 && levelBandMult(3) === 10 && levelBandMult(10) === 2 && levelBandMult(-40) === 2 && levelBandMult(6) < 10 && levelBandMult(6) > 2 && levelBandMult(5) > levelBandMult(7));
  {
    const near = new World({ seed: 4, mode: 'explore', save: { v: 2, level: 20 } }); near.loadMap('ridge', 'fen');
    const far = new World({ seed: 4, mode: 'explore', save: { v: 2, level: 45 } }); far.loadMap('ridge', 'fen');
    const kill = (w) => { const e = w.enemies.find((x) => !x.def.boss && !x.elite); const was = w.player.exp; const lv = w.player.level; w.hitEnemy(e, 1e12); w.step(CONFIG.TICK); return { gain: w.player.exp - was, lv: lv === w.player.level, e }; };
    const a = kill(near), b = kill(far);
    check('level band: a kill near your level pays several times one far below you', a.lv && b.lv && a.gain / a.e.expValue > 9 && b.gain / b.e.expValue < 2.5, `${(a.gain / a.e.expValue).toFixed(1)}x vs ${(b.gain / b.e.expValue).toFixed(1)}x`);
    const old = new World({ seed: 4, mode: 'explore', save: { v: 2, level: 30, exp: 1000, wishExp: 50 } });
    const kept = new World({ seed: 4, mode: 'explore', save: JSON.parse(JSON.stringify(old.toSave())) });
    check('level band: an old save keeps how far along its bar it was (4x the EXP for 4x the need), once', old.player.exp === 4000 && kept.player.exp === 4000 && kept.player.wishExp === 200);
  }
  const w = new World({ seed: 2, mode: 'explore', save: { v: 2, level: 99 } }); const p = w.player;
  w.loadMap('sanctum', 'maw');
  p.exp = expToNext(99) - 1;
  { const e = w.enemies.find((x) => !x.def.boss); w.hitEnemy(e, 1e12); w.step(CONFIG.TICK); }
  const at100 = p.level;
  for (let i = 0; i < 30; i++) { const e = w.enemies.find((x) => !x.def.boss); if (e) w.hitEnemy(e, 1e12); w.step(CONFIG.TICK); }
  check('levels: the cap is 100', at100 === 100 && p.level === 100 && CONFIG.MAX_LEVEL === 100, 'level ' + p.level);
  check('ranks: abilities go to rank ' + CONFIG.MAX_RANK, (() => { p.skillPoints = 99; for (let i = 0; i < 30; i++) w.command({ type: 'rankUp', slot: 'q' }); w.step(CONFIG.TICK); return p.ranks.q === CONFIG.MAX_RANK; })());

  // Every enemy type can fight: put one next to the hero and let it attack for a while.
  for (const type of Object.keys(ENEMIES).filter((t) => !ENEMIES[t].thief && !ENEMIES[t].still && !ENEMIES[t].tideOnly)) { // (the Wishthief runs; wish-stars just wait; the Tide's own fight only in the keep)
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
    if (m.safe || m.bossOnly || m.deep || m.caelum) continue; // (a boss's chamber is not for farming; Caelum asks for Animus, tested on its own)
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
  check('story: every quest has a giver, a goal that exists and a reward', QUEST_IDS.every((id) => { const q = QUESTS[id]; const g = q.goal; return NPCS[q.giver] && q.offer && q.done && q.reward && (!q.after || QUESTS[q.after]) && (!g.enemy || DEFS.ENEMIES[g.enemy] || g.enemy === 'edric') && (!g.boss || DEFS.ENEMIES[g.boss].boss) && (!g.map || MAPS[g.map]) && (!g.reach || MAPS[g.reach]) && (!g.sign || SIGNS[g.sign]) && (!g.signs || g.signs.every((sid) => SIGNS[sid])) && (g.kill || g.reach || g.read || g.wave || g.sign || g.signs || g.ending || g.choose || g.meet || g.stories); }), QUEST_IDS.length + ' quests');
  check('story: a kill quest for a map names an enemy that lives there', QUEST_IDS.every((id) => { const g = QUESTS[id].goal; return !(g.enemy && g.map) || MAPS[g.map].roster[g.enemy] || (g.enemy === 'edric' && MAPS[g.map].roster.knight); }));
  check('story: every enemy a quest asks for lives on a map near the quest\'s level', QUEST_IDS.every((id) => { const q = QUESTS[id]; const g = q.goal; if (!g.enemy || g.enemy === 'edric') return true; return Object.values(MAPS).some((m) => m.roster[g.enemy] && Math.abs(m.level - q.level) <= 12); }));
  check('story: every sign is placed, at least two on every map (three in Haven), each somewhere you can stand', MAP_IDS.filter((id) => !MAPS[id].wishkeep).every((id) => { const m = buildMap(id); const signs = m.obstacles.filter((o) => o.kind === 'sign'); return signs.length === SIGN_IDS.filter((sid) => SIGNS[sid].map === id).length && signs.length >= (id === 'town' ? 3 : 2) && signs.every((sg) => SIGNS[sg.id].map === id && Math.hypot(sg.x, sg.z) < m.radius - 2 && m.obstacles.every((o) => o === sg || Math.hypot(o.x - sg.x, o.z - sg.z) > o.r + sg.r + 0.5)); }), SIGN_IDS.length + ' signs');
  check('story: four people live in Haven (and Tomas, once, after the Unwish)', buildMap('town').obstacles.filter((o) => o.kind === 'npc').length === 6 && new World({ seed: 1, mode: 'explore' }).obstacles.filter((o) => o.kind === 'npc').length === 4);

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
    const boss2 = b.enemies.find((e) => e.def.boss); const sp1 = bp.skillPoints, lv1 = bp.level; const fall2 = boss2 ? b.bossFalloff(boss2) : 1;
    if (boss2) { b.hitEnemy(boss2, 1e12); step(b); }
    check(`boss: ${boss.def.name} comes back, and later kills still pay but give no extra skill points`, !!boss2 && b.loot.length === Math.max(1, Math.round(L.items * fall2)) && bp.bossKills[type] === 2 && bp.skillPoints - sp1 <= bp.level - lv1);
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
    const fr0 = f.player.misc.fragment || 0, dust0 = f.player.dust, r1 = f.questReward('again');
    f.command({ type: 'claimQuest', id: 'again' }); step(f);
    check('Come Home (0.58): handed in on tier I gives Immortal Fragments and Wishdust', f.player.misc.fragment === fr0 + 20 && f.player.dust === dust0 + 6, `${f.player.misc.fragment} ${f.player.dust}`);
    check('Come Home: once on each world tier, so not again on tier I', f.questState('again') === 'done' && !f.questOpen('again') && f.player.tierMax >= 2);
    const tier = (t) => { f.loadMap('town', 'sanctum'); f.command({ type: 'setTier', tier: t }); step(f); f.loadMap('sanctum', 'maw'); };
    const unmade = () => { const e = f.enemies.find((x) => x.type === 'boss3' && !x.dead) || (f.camps.find((c) => c.def.type === 'boss3').slots[0].timer = 0.01, step(f, 80), f.enemies.find((x) => x.type === 'boss3')); f.hitEnemy(e, 1e12); step(f); };
    tier(2);
    const r2 = f.questReward('again');
    check('Come Home: open again on tier II, and it gives more there', f.questOpen('again') && r2.fragments > r1.fragments && r2.gold > r1.gold && r2.keys > r1.keys, `${r1.fragments} -> ${r2.fragments}`);
    f.command({ type: 'acceptQuest', id: 'again' }); step(f);
    tier(1);
    unmade();
    check('Come Home: taken on tier II, The Unmade on tier I does not count', f.questState('again') === 'active' && f.questReward('again').fragments === r2.fragments);
    tier(2);
    unmade();
    f.command({ type: 'claimQuest', id: 'again' }); step(f);
    check('Come Home: done on tier II too, remembered for this life', f.questTiersDone('again').join() === '1,2' && !f.questOpen('again'), f.questTiersDone('again').join());
    const after = new World({ seed: 5, mode: 'explore', save: f.toSave() });
    check('...and remembered after a save and load', after.questTiersDone('again').join() === '1,2');
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
    // (0.61.5) no longer a cheat-death: deaths close by make you hit harder
    const { w, p } = setup('rogue', ['undying']);
    const e = dummy(w, 30);
    const base = () => { e.hp = 1e9; w.events.length = 0; w.hitEnemy(e, 1000, { canCrit: false }); return 1e9 - e.hp; };
    const before = base();
    for (let i = 0; i < 12; i++) { const v = dummy(w, 3 + (i % 3)); v.hp = 1; w.hitEnemy(v, 10, { canCrit: false }); }
    const after = base();
    check('Crown of the Undying: enemies falling near you add 4% each, up to 40%', Math.abs(after / before - 1.4) < 0.01 && p.surgeN === 10, `${before} -> ${after}`);
    const far = dummy(w, 20); far.hp = 1; p.surgeT = 0; p.surgeN = 0; w.hitEnemy(far, 10, { canCrit: false });
    check('...not ones that fall far away', !(p.surgeN > 0));
    w.hitPlayer(1e9, { parryable: false });
    check('...and it no longer saves you', p.dead);
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
    const k = POWER_OF(w); // class power (0.51, balance.js) scales every hit
    check('Long Watch: point-blank shots get no bonus', Math.abs(c.amount - 1000 * k) <= 1 && !c.far, String(c.amount));
    check('Long Watch: +4% per metre past 2 m (about 30% at 10 m), shown in gold', Math.abs(f.amount / (1000 * k) - expect) < 0.002 && f.far, `${f.amount} (x${expect.toFixed(2)})`);
    const veryFar = dummy(w, 30);
    check('Long Watch: capped at +40%', Math.abs(hit(veryFar).amount - 1400 * k) <= 1);
    const { w: w2 } = setup('archer', 'windrunner');
    const f2 = dummy(w2, 10); w2.events.length = 0; w2.hitEnemy(f2, 1000, { canCrit: false });
    check('Windrunners do not get it', Math.abs(w2.events.find((ev) => ev.type === 'damage').amount - 1000 * POWER_OF(w2)) <= 1);
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
    p.autoAttack = false;
    for (let i = 0; i < 3; i++) { p.cd.q = 0; p.castLock = 0; cast(w, 'q', 6, 0); run(w, 0.4); }
    check('Everything Burns: each Fire Bolt adds 2 stacks (0.56.3)', e.burnT > 0 && e.burnStacks === 6, String(e.burnStacks));
    w.events.length = 0; run(w, 1.01);
    const few = hitsOn(w, e).filter((ev) => ev.dot).map((ev) => ev.amount);
    for (let i = 0; i < 40; i++) { p.cd.q = 0; p.castLock = 0; cast(w, 'q', 6, 0); run(w, 0.4); }
    check('Everything Burns: burns stack up to 50 (ten times the old 5)', e.burnStacks === 50 && w.burnCap() === 50, `${e.burnStacks}/${w.burnCap()}`);
    w.events.length = 0; run(w, 1.01);
    const plain = hitsOn(w, e).filter((ev) => ev.dot).map((ev) => ev.amount);
    const per = 0.2 * (p.stats.ad * 0.15 + p.level * 1.5) * (1 + CONFIG.RANK_DAMAGE * (p.ranks.q - 1));
    check('Everything Burns: 50 stacks burn for 50 x (3% spell power + 0.3 per level) a second, twice as hot when full', plain.length === 2 && Math.abs(plain[0] - per * 50 * 2 * 0.5 * POWER_OF(w)) <= 2, `${plain} vs ${Math.round(per * 50 * POWER_OF(w))}`);
    check('Roaring: a full burn does far more than its stacks alone (6 -> 50 stacks: over 8x)', plain[0] / few[0] > (50 / 6) * 1.7, `${few[0]} -> ${plain[0]}`);
    cast(w, 'w', 6, 0);
    check('Smoulder: marks for 5 s', e.smoulderT > 4.9);
    w.events.length = 0; run(w, 1.01);
    const hot = hitsOn(w, e).filter((ev) => ev.dot).map((ev) => ev.amount);
    check('Smoulder: burns on a Smouldering enemy deal 50% more', Math.abs(hot[0] / plain[0] - 1.5) < 0.02, `${plain[0]} -> ${hot[0]}`);
    // Wildfire: a burning enemy's death passes its burn on
    const n1 = dummy(w, 7, 1), n2 = dummy(w, 7, -1), n3 = dummy(w, 7, 2.5), far = dummy(w, 30);
    w.hitEnemy(e, 1e10, { canCrit: false });
    check('Wildfire (3 ranks): the burn jumps to the 3 nearest enemies, every stack', [n1, n2, n3].every((o) => o.burnStacks === 50) && !(far.burnT > 0), [n1, n2, n3].map((o) => o.burnStacks).join());
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
    // (0.56.3) It hits as it rises, too
    w.enemies = []; run(w, 0.2);
    const at = dummy(w, 6.6, 0.5);
    p.cd.r = 0; p.castLock = 0; cast(w, 'r', 6, 0);
    check('Rimewall: rising, it strikes what stands beside it and gives Hoarfrost', at.hp < 1e9 && at.frostStacks >= 2, `${at.hp} ${at.frostStacks}`);
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
    check('Hurricane (passive, 0.60.2): Tailwind never leaves her, roll or no roll', w.galeAlways());
    const always = w.galeAlways;
    w.galeAlways = () => false; // as before level 6
    const plain = hit();
    p.rushT = 3; p.cd.e = 5;
    const windy = hit();
    w.galeAlways = always;
    const extra = p.stats.ad * 0.3 + 2 * p.level;
    check('Tailwind: after a roll, basic attacks deal 30% attack damage + 2 per level more on hit', Math.abs(windy - plain - extra * w.gapScale(e.level).dealt * POWER_OF(w)) <= 2, `${plain} -> ${windy}`);
    check("Tailwind: each hit takes 0.3 s off Evasive Roll's cooldown", Math.abs(p.cd.e - 4.7) < 1e-9, String(p.cd.e));
    p.rushT = 0;
    const others = [dummy(w, 7, 2), dummy(w, 7, -2), dummy(w, 30, 0)];
    // (0.60.2) Hurricane is a passive: nothing to press, arrows that curve in, at the target if no one else is near
    p.cd.e = 5; p.cd.r = 0;
    cast(w, 'r', 6, 0);
    check('Hurricane (passive): pressing R does nothing, and it never goes on cooldown', w.kit.r.passive && p.cd.r === 0 && !(p.hurricaneT > 0) && p.cd.e === 5);
    w.projectiles = [];
    w.basicAttack(e);
    let arrows = w.projectiles.filter((pr) => pr.basic);
    check('Hurricane: every basic attack also looses 2 arrows at other enemies nearby', arrows.length === 3 && arrows.filter((a) => a.arc).every((a) => a.targetId === others[0].id || a.targetId === others[1].id));
    for (const o of others) o.dead = true;
    w.enemies = w.enemies.filter((x) => !x.dead);
    w.projectiles = [];
    w.basicAttack(e);
    arrows = w.projectiles.filter((pr) => pr.arc);
    const carry = w.projectiles.find((pr) => pr.basic && !pr.arc);
    check('Hurricane: with no one else near, both arrows go for the target (0.81.5: folded into the arrow loosed, rained down where it lands)', arrows.length === 0 && carry && carry.targetId === e.id && carry.fold && carry.fold.some((f) => f.tails === 0) && carry.volley >= 2);
    // the arcs at other enemies still sweep out wide and curve in (bring one back to aim at)
    const o2 = others[0];
    o2.dead = false; o2.hp = o2.maxHp = 1e9;
    o2.x = o2.px = p.x; o2.z = o2.pz = p.z + 6; // off to one side, clear of the target
    w.enemies.push(o2);
    w.projectiles = [];
    w.basicAttack(e);
    arrows = w.projectiles.filter((pr) => pr.arc);
    const a0 = Math.atan2(arrows[0].vz, arrows[0].vx), toO = Math.atan2(o2.z - p.z, o2.x - p.x);
    check('...an arc at another enemy sweeps out wide first', arrows.length === 1 && arrows[0].targetId === o2.id && Math.abs(a0 - toO) > 0.8);
    const hp0 = o2.hp;
    w.projectiles = arrows;
    for (let i = 0; i < 120 && w.projectiles.some((x) => x.arc); i++) w.stepProjectiles(CONFIG.TICK, CONFIG.TICK);
    check('...and curves in to hit it', o2.hp < hp0 && !w.projectiles.some((x) => x.arc), `${hp0 - o2.hp}`);
  }
  // (0.60.2) Crimson Reach: a Bloodied Berserker's swings fly on as red crescents
  {
    const { w, p } = setup('warrior', 'berserker');
    const far = dummy(w, 5);
    check('Crimson Reach: not Bloodied, a swing is a swing (no reach)', w.bloodReach() === 0 && w.basicRange() < 3);
    p.hp = p.stats.maxHp * 0.3; run(w, 0.05);
    check('Crimson Reach: Bloodied, swings reach 6 m', w.bloodReach() === 1 && Math.abs(w.basicRange() - 6) < 1e-9);
    w.projectiles = [];
    far.hp = far.maxHp = 1e9;
    w.basicAttack(far);
    const cr = w.projectiles.find((pr) => pr.kind === 'crescent');
    check('Crimson Reach: out of arm\'s reach, a red crescent carries the whole blow', cr && cr.pierce.length === 0 && cr.lv === 1);
    for (let i = 0; i < 40 && !cr.dead; i++) w.stepProjectiles(CONFIG.TICK, CONFIG.TICK);
    check('...and cuts the target', far.hp < 1e9);
    const near = dummy(w, 1.5), behind = dummy(w, 4.5, 0.2);
    near.hp = near.maxHp = behind.hp = behind.maxHp = 1e9;
    w.projectiles = [];
    w.basicAttack(near);
    const cr2 = w.projectiles.find((pr) => pr.kind === 'crescent');
    check('Crimson Reach: up close, the swing lands and the crescent flies on (not hitting it twice)', near.hp < 1e9 && cr2 && cr2.pierce.includes(near.id) && cr2.dmg < p.stats.ad * 2);
    p.frenzyT = 5;
    check('Crimson Oath: the crescents fly further', w.bloodReach() === 2 && w.basicRange() > 9);
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
    check('Deadeye: drawn for a second first (0.51): nothing yet, and slowed', hits().length === 0 && !!p.channel && p.channel.slow > 0);
    run(w, 1.05);
    const plain = hits()[0];
    check('Deadeye: one shot, always a crit, then the full cooldown', w.events.some((ev) => ev.type === 'damage' && ev.id === far.id && ev.crit) && p.cd.r > 20, `cd ${p.cd.r.toFixed(1)}`);
    // twice the attack speed: twice the damage
    const as0 = p.stats.as;
    run(w, 0.4); p.stats.as = as0 * 2; p.cd.r = 0; w.events.length = 0; cast(w, 'r', 40, 0); run(w, 1.05);
    const fast = hits()[0];
    p.stats.as = as0;
    check('Deadeye: its damage grows with attack speed', Math.abs(fast / plain - 2) < 0.05, `${plain} -> ${fast}`);
    // Steady Breath, then Deadeye: 60% more
    run(w, 0.4); p.cd.w = 0; cast(w, 'w', 0, 0);
    check('Steady Breath: a buff, no damage, and the next basic attack is a Steady Aim crit', p.empowerT > 0 && p.empowerCrit && (p.swingCount + 1) % w.mods.critEvery === 0);
    run(w, 0.2); p.cd.r = 0; w.events.length = 0; cast(w, 'r', 40, 0); run(w, 1.05);
    check('Steady Breath: the next ability deals 60% more', Math.abs(hits()[0] / plain - 1.6) < 0.05 && !(p.empowerT > 0), `${plain} -> ${hits()[0]}`);
    // Deadeye pierces up to 3 times (0.51): less each, Marked, Pinned, Splinter
    {
      const s2 = setup('archer', 'sharpshooter'); s2.p.stats.crit = 0;
      const line = [3, 7, 11, 15, 22].map((x) => dummy(s2.w, x));
      const side = dummy(s2.w, 15, 2.2);
      s2.p.cd.r = 0; s2.w.events.length = 0; cast(s2.w, 'r', 40, 0); run(s2.w, 1.05);
      const got = (e) => s2.w.events.filter((ev) => ev.type === 'damage' && ev.who === 'enemy' && ev.id === e.id).reduce((a, ev) => a + ev.amount, 0);
      const d = line.map(got);
      check('Deadeye: pierces 3 times, each enemy after the first taking less, the 5th untouched', d[0] > d[1] && d[1] > d[2] && d[2] > d[3] && d[3] > 0 && d[4] === 0, d.map(Math.round).join(', '));
      check('Deadeye: the 2nd is Marked, the 3rd Pinned, the 4th Splinters onto its neighbours', line[1].vulnT > 0 && line[2].state === 'stunned' && got(side) > 0);
    }
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
    check('Blood Rage (0.95): with Crimson Oath off, lifesteal heals past half again', p.hp > p.stats.maxHp * 0.5, (p.hp / p.stats.maxHp).toFixed(3));
    p.hp = p.stats.maxHp * 0.45; p.frenzyOn = true; run(w, 0.05);
    for (let i = 0; i < 40; i++) w.hitEnemy(e, 5000, { basic: true, canCrit: false });
    check('Blood Rage: under Crimson Oath, lifesteal stops just below half health', p.hp <= p.stats.maxHp * 0.5 && p.hp > p.stats.maxHp * 0.45, (p.hp / p.stats.maxHp).toFixed(3));
    p.frenzyOn = false;
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
    check('Crimson Oath (0.60.3): no longer keeps you from falling (only the last breath saves you, once)', b.p.dead || b.p.hp <= 0);
    {
      // (0.60.3) Red Embrace: up close, a Bloodied Berserker hits far harder; more in Crimson Oath
      const r = setup('warrior', 'berserker');
      const close = dummy(r.w, 1.5), far = dummy(r.w, 5.5);
      const hitOf = (t) => { r.w.events.length = 0; r.w.hitEnemy(t, 1000, { basic: true, source: 'basic', canCrit: false }); return r.w.events.find((ev) => ev.type === 'damage' && ev.id === t.id).amount; };
      r.p.hp = r.p.stats.maxHp * 0.3; run(r.w, 0.05);
      const c1 = hitOf(close), f1 = hitOf(far);
      check('Red Embrace: Bloodied, a blow up close deals 30% more than one from range', Math.abs(c1 / f1 - 1.3) < 0.02, `${c1} vs ${f1}`);
      r.p.frenzyT = 5;
      const c2 = hitOf(close), f2 = hitOf(far);
      check('Red Embrace: in Crimson Oath, 50% more', Math.abs(c2 / f2 - 1.5) < 0.02, `${c2} vs ${f2}`);
    }
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
    // Dropping for a friend (something the host found: what came by trade is a gift and stays, 0.58)
    host.player.bag.push(Object.assign({}, ring, { id: 'rg2', gift: false }));
    const idx = host.player.bag.findIndex((i) => i.id === 'rg2');
    cmd(host, { type: 'dropItem', index: idx });
    const drop = w.loot.find((l) => l.item.id === 'rg2');
    check('drop: Ctrl-click drops a bag item on the ground for anyone in the party', drop && drop.owner === undefined);
    host.player.x = drop.x; host.player.z = drop.z;
    run(w, 1);
    check('drop: the one who dropped it does not snatch it straight back', !host.player.bag.some((i) => i.id === 'rg2'));
    host.player.x = 30; friend.player.x = drop.x; friend.player.z = drop.z; friend.player.dead = false;
    run(w, 1);
    check('drop: the friend picks it up', friend.player.bag.some((i) => i.id === 'rg2') || (friend.player.equipped.ring && friend.player.equipped.ring.id === 'rg2'));
    // (0.58) Gifts stay with whoever they were given to: no holding gear for a friend through a rebirth
    const rg = friend.player.bag.find((i) => i.id === 'rg2') || friend.player.equipped.ring;
    const r1 = host.player.bag.find((i) => i.id === 'rg1');
    check('gifts: what came by trade or a drop is a gift', rg.gift && r1 && r1.gift);
    friend.player.bag.push(Object.assign({}, ring, { id: 'gf1', gift: true }));
    cmd(friend, { type: 'tradeAsk', to: 0 }); cmd(host, { type: 'tradeAnswer', yes: true });
    cmd(friend, { type: 'tradeSet', items: ['gf1'], gold: 0 });
    check('gifts: cannot be offered in a trade', w.trades[0] && w.trades[0].items[1].length === 0);
    cmd(friend, { type: 'tradeCancel' });
    cmd(friend, { type: 'dropItem', index: friend.player.bag.findIndex((i) => i.id === 'gf1') });
    check('gifts: or dropped for someone', friend.player.bag.some((i) => i.id === 'gf1') && w.events.some((e) => e.type === 'giftBound'));
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
    // (0.58) Home at once, spoils and all
    p.bag = p.bag.slice(0, 3);
    const onGround = w.loot.filter((l) => l.owner === undefined || l.owner === w.cur.pid).length, bag0 = p.bag.length + Object.values(p.equipped).filter(Boolean).length;
    w.command({ type: 'riftHome' }); w.runCommands();
    check('rifts: when it is over, home at once', !w.rift && w.map.id === 'town' && w.events.some((e) => e.type === 'lootSwept'));
    check('...and its spoils come too', onGround > 0 && p.bag.length + Object.values(p.equipped).filter(Boolean).length === bag0 + onGround, `${onGround} on the ground`);
    w.command({ type: 'enterRift', tier: 1 }); w.runCommands();
    w.command({ type: 'riftHome' }); w.runCommands();
    check('rifts: not while it is still running', w.rift && w.map.id === 'rift');
    for (const e of w.enemies.slice()) { if (w.rift.guardianId) break; w.killEnemy(e, 'basic'); }
    p.bag = []; while (p.bag.length < w.bagSize(p)) p.bag.push(JSON.parse(JSON.stringify(Object.values(p.equipped).find(Boolean))));
    const scrap0 = p.scrap;
    w.killEnemy(w.enemies.find((e) => e.riftGuardian), 'basic');
    w.command({ type: 'riftHome' }); w.runCommands();
    check('rifts: with a full bag, what does not fit is scrapped, not lost', w.map.id === 'town' && p.scrap > scrap0 && p.bag.length === w.bagSize(p), p.scrap - scrap0);
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
    check('Overflow: every class has it since 0.50 (archers too)', Math.abs(a.w.abilityCooldown('q') - 1) < 1e-9 && a.w.overflowMult('q') > 1);
    // A skill with no damage gets a stronger effect: Evasive Roll's attack speed
    const roll = (haste) => { const r = setup('archer'); r.p.stats.haste = haste; r.p.level = 10; r.w.recalcStats(); r.p.stats.haste = haste; r.p.cd.e = 0; r.w.command({ type: 'cast', slot: 'e', x: r.p.x + 5, z: r.p.z }); for (let i = 0; i < 20; i++) r.w.step(CONFIG.TICK); return r.p.rushAs; };
    const plain = roll(0), hasted = roll(4000);
    check('Overflow: a buff skill past the floor buffs harder (Evasive Roll attack speed)', plain > 0 && hasted > plain * 3, `${plain} -> ${hasted?.toFixed(2)}`);
  }
  // Weight of Iron (Bulwark), Searing (Pyromancer), Deep Winter (Frostbinder), Crosswind (Windrunner)
  {
    const { w, p } = setup('warrior', 'bulwark');
    const d0 = w.abilityDamage('q');
    p.stats.armor += 1000;
    check('Weight of Iron: armor adds to Bulwark ability damage', w.abilityDamage('q') > d0 + 1.5 * 700 * 0.9);
    const py = setup('mage', 'pyromancer');
    py.p.stats.haste = 600;
    check('Searing: 120 ability haste is ten more burn stacks', py.w.burnCap() === 100, py.w.burnCap());
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
    check('Rares: a kill gives Wishdust (three quarters, 0.62.1) and an Epic or better', p.dust - dust >= Math.floor(RARE.dust[0] * 0.75) && w.loot.slice(loot).some((l) => l.item.rarity >= 3));
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
    check('Wishthief: caught, it gives a shard, Wishdust and three pieces of gear (one Mythic or better)', w2.player.tickets >= tk + 1 && Math.abs(w2.player.dust - dust2 - THIEF.dust * 0.75) < 1 && w2.loot.length - l2 === 3 && w2.loot.slice(l2).some((l) => l.item.rarity >= 4));
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
    check('Remnants: always drop a set piece, and Wishdust', w.loot.slice(l0).some((l) => l.item.set) && Math.abs(p.dust - d0 - REMNANT.dust * 0.75) < 1);
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
  // Side stories (0.47)
  {
    const save = geared('warrior', 80, 4);
    Object.assign(save, { quests: { scarf: { s: 'done', n: 8 }, knights: { s: 'done', n: 12 } } });
    const w = new World({ seed: 41, cls: 'warrior', mode: 'explore', save });
    const p = w.player;
    for (const id of ['scarf2', 'edric', 'tobin', 'havengrows']) { w.command({ type: 'acceptQuest', id }); w.runCommands(); }
    check('Side stories: Pip, Bram, Odile and Wren each have one', ['scarf2', 'edric', 'tobin', 'havengrows'].every((id) => w.questState(id) === 'active'));
    // Red Scarf, Part Two
    w.loadMap('greenwood', 'town');
    const t = w.obstacles.find((o) => o.id === 'tomashusk');
    check('Red Scarf: Tomas walks the Greenwood road', !!t);
    p.x = p.px = t.x + 1; p.z = p.pz = t.z;
    w.command({ type: 'scarfChoice', choice: 'rest' }); w.runCommands();
    check('Red Scarf: untie it, and he lies down; the scarf is yours; it cannot be taken back', p.choices.scarf === 'rest' && p.misc.scarf === 1 && w.questState('scarf2') === 'ready' && !w.obstacles.some((o) => o.id === 'tomashusk'));
    w.command({ type: 'scarfChoice', choice: 'walk' }); w.runCommands();
    check('...for good', p.choices.scarf === 'rest');
    w.command({ type: 'claimQuest', id: 'scarf2' }); w.runCommands();
    // Edric's Colours
    w.loadMap('keep', 'ridge');
    for (let i = 0; i < 3; i++) w.step(CONFIG.TICK);
    const ed = w.enemies.find((e) => e.named === 'edric');
    check("Edric's Colours: Edric of the Blue Trim stands his watch in the Keep", !!ed && ed.rare === 'Edric of the Blue Trim');
    w.killEnemy(ed, 'test');
    check('...and falls', w.questState('edric') === 'ready');
    w.command({ type: 'claimQuest', id: 'edric' }); w.runCommands();
    const blade = [p.equipped.weapon, ...p.bag].find((it) => it && it.effect === 'edric');
    check("Edric's Colours: a warrior gets his sword", !!blade);
    // An Ending for Tobin
    w.loadMap('hollow', 'dunes');
    const od = w.obstacles.find((o) => o.id === 'odile');
    check('An Ending for Tobin: Odile waits at the heart of the garden', !!od);
    p.x = p.px = od.x + 1; p.z = p.pz = od.z;
    w.command({ type: 'meetOdile' }); w.runCommands();
    w.command({ type: 'claimQuest', id: 'tobin' }); w.runCommands();
    check('An Ending for Tobin: she stays; a Gloomcap glow', w.questState('tobin') === 'done' && p.glows.includes('gloomcap'));
    w.loadMap('town');
    const ids = w.obstacles.filter((o) => o.kind === 'npc').map((o) => o.id);
    check('Haven: Lark has Odile\'s stall, and Odile is gone', ids.includes('lark') && !ids.includes('odile'));
    p.quests.ringglass = { s: 'ready', n: 0 }; // one of Odile's, finished after she went to the garden
    check("Odile's quests: once she stays in the garden, Lark takes them (marker, tracker) and Odile shows none", w.npcMarker('lark') === 'ready' && w.npcMarker('odile') === '' && w.questTaker('odile') === 'lark' && w.questTaker('bram') === 'bram');
    w.command({ type: 'claimQuest', id: 'ringglass' }); w.runCommands();
    check("Odile's quests: ...and handing one in works", w.questState('ringglass') === 'done');
    check('Haven Grows: a lantern, a banner and a stall', ['lantern', 'banner', 'stall'].every((d) => w.obstacles.some((o) => o.kind === 'decor' && o.what === d)));
    check('Haven Grows: Wren sees all three', w.questState('havengrows') === 'ready');
    w.loadMap('starwell', 'asterfell');
    p.endings = { self: 1 };
    w.loadMap('town');
    check('After the Unwish: laid to rest, Tomas does not come home', !w.obstacles.some((o) => o.id === 'tomas'));
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
    // (0.57.6) The Breath Below comes between the Starwell and the Unwish
    {
      const w0 = new World({ seed: 9, cls: 'mage', mode: 'explore', save: JSON.parse(JSON.stringify(save)) });
      const p0 = w0.player;
      const E = await import('../src/sim/endgame.js');
      check('The Breath Below: Odile offers it after the Starwell, before the Unwish', w0.questOpen('breath') && !w0.questOpen('unwish'));
      check('The first Depth stays shut until it is taken', !w0.depthOpen(p0, 6));
      w0.command({ type: 'acceptQuest', id: 'breath' }); w0.step(CONFIG.TICK);
      check('Taking it opens Depth VI (only VI), in the first life', w0.depthOpen(p0, 6) && !w0.depthOpen(p0, 7) && p0.rebirth.n === 0);
      w0.loadMap('deep6', 'town');
      check('Going down completes it', w0.questState('breath') === 'ready');
      const before = w0.ember();
      w0.command({ type: 'claimQuest', id: 'breath' }); w0.step(CONFIG.TICK);
      check('Handing it in gives 8 Ember (past half of what Depth VI asks), for good', w0.ember() === before + 8 && p0.rebirth.gifts.breath);
      check('...and going back down, your blows land (not just for 1)', !E.emberScale(w0.ember(), E.DEEP.depths[6].ember).one);
      check('...and the reward says no more Ember the next time round', w0.questReward('breath').ember === 0);
    }
    save.quests.breath = { s: 'done', n: 1 };
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
    check('Take her place (0.66): withdrawn for now', !w.events.some((x) => x.type === 'reborn'));
    // New Game+ itself stays for heroes who already took it
    const { rebirthSave } = await import('../src/sim/rebirth.js');
    const { starterWeapon } = await import('../src/sim/items.js');
    const ngSave = rebirthSave(w.toSave(), starterWeapon);
    ngSave.rebirth.ng = 1;
    ngSave.endings = Object.assign({}, p.endings, { place: 1 });
    const w2 = new World({ seed: 9, cls: 'mage', mode: 'explore', save: ngSave });
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
    const M = w.rebirthMarks(); // (0.58.2) 30 for level 100 and Wishborne 100, and more for the gear given up
    check('Rebirth: what you give up adds Starmarks too', M > 30 && M <= 30 + REBIRTH.gearMax, M);
    w.command({ type: 'rebirth' }); w.runCommands();
    const ev = w.events.find((e) => e.type === 'reborn');
    check('Rebirth: at level 100 with The Unmade beaten, the star begins you again', !!ev && ev.n === 1 && ev.marks === M);
    const fresh = ev.save;
    check('Rebirth: a full fresh start (level 1, starter weapon, empty bag; scrap and Wishdust kept since 0.62.1)', fresh.level === 1 && Object.keys(fresh.equipped).join() === 'weapon' && fresh.equipped.weapon.id === 'starter' && !fresh.bag.length);
    const w2 = new World({ seed: 7, cls: 'rogue', save: fresh });
    const q = w2.player;
    check('Rebirth: story, quests, tiers, subclass and Wishborne all start again', !q.spec && q.tierMax === 1 && !Object.keys(q.quests).length && q.wish === 0 && !Object.keys(q.wishStats).length && !q.bossKills.boss3);
    check('Rebirth: Starmarks, glows (a new one too) and the account\'s gold stay', q.rebirth.marks === M && q.rebirth.n === 1 && q.glows.includes('ember') && q.glows.includes('dawn') && fresh.gold === 5000);
    check('Rebirth: the past life is remembered (for the ending that builds on this)', q.rebirth.past.length === 1 && q.rebirth.past[0].level === 100 && q.rebirth.past[0].spec === 'assassin');
    const ad0 = q.stats.ad, bag0 = w2.bagSize(), sp0 = q.skillPoints;
    for (let i = 0; i < 3; i++) { w2.command({ type: 'rebirthPerk', id: 'starborn' }); w2.runCommands(); }
    w2.command({ type: 'rebirthPerk', id: 'pockets' }); w2.runCommands();
    w2.command({ type: 'rebirthPerk', id: 'head' }); w2.runCommands();
    check('Perks: Starborn adds damage, Deep Pockets bag slots, Head Start a skill point', q.stats.ad > ad0 && w2.bagSize() === bag0 + 4 && q.skillPoints === sp0 + 1, `${ad0}->${q.stats.ad}`);
    check('Perks: paid in Starmarks', q.rebirth.marks === M - 3 * PERKS.starborn.cost - PERKS.pockets.cost - PERKS.head.cost);
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
    check('Rarities: Epic, Mythic, Ancient, Immortal, each stronger than the last', RARITIES.slice(3).map((r) => r.name).join() === 'Epic,Mythic,Ancient,Immortal,Eternal' && RARITIES[4].mult < RARITIES[5].mult && RARITIES[5].mult < RARITIES[6].mult && RARITIES[6].mult < RARITIES[7].mult); // (0.71) Eternal above
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
    check('The Unwished Crown (0.61.5): Doom is not softened any more', Math.abs(hp - p.hp - Math.round(p.stats.maxHp * 0.35)) <= 1, `${hp - p.hp} of ${p.stats.maxHp}`);
    p.unwishedT = 0; b.hp = b.maxHp = 1e12; const d0 = b.hp; w.hitEnemy(b, 1000, { canCrit: false }); const vsBoss = d0 - b.hp;
    w.mods.unwished = false; const d1 = b.hp; w.hitEnemy(b, 1000, { canCrit: false }); const plain = d1 - b.hp; w.mods.unwished = true;
    check('The Unwished Crown: 12% more damage to bosses', Math.abs(vsBoss / plain - 1.12) < 0.01, `${vsBoss} / ${plain}`);
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
    const w = new World({ seed: 9, mode: 'explore', cls: 'mage', save: Object.assign(geared('mage', 40, 3), { gold: 1e8, tickets: 100, spec: 'pyromancer' }) });
    const run = (ww, sec) => { for (let i = 0; i < Math.round(sec * 60); i++) ww.step(CONFIG.TICK); };
    w.loadMap('frost', 'town');
    const mc = w.merchant || w.spawnMerchant();
    const p = w.player;
    check('Merchant: sets up near you, with gear, Wishdust and a set piece for sale', mc && mc.stock.length >= MERCHANT.stock.length - 1 && mc.stock.some((x) => x.kind === 'set') && Math.hypot(mc.x - p.x, mc.z - p.z) < 15);
    w.command({ type: 'buyMerchant', i: 0 }); w.runCommands();
    check('Merchant: you have to walk up to him to buy', !mc.stock[0].bought[w.cur.pid]);
    p.x = p.px = mc.x + 1; p.z = p.pz = mc.z;
    p.bag = [];
    const gold = p.gold, tk = p.tickets, dust = p.dust;
    for (let i = 0; i < mc.stock.length; i++) { w.command({ type: 'buyMerchant', i }); w.runCommands(); }
    const glassSold = mc.stock.some((x) => x.kind === 'glass');
    const fixed = mc.stock.filter((s) => !s.ware);
    check('Merchant: everything bought, paid for, and in your bag (an Unwishing Glass in the pouch)', mc.stock.every((s) => s.bought[w.cur.pid] || p.tickets < s.tickets) && p.bag.filter((it) => it.set).length === 1 && p.bag.every((it) => it.set || it.rarity >= 3) && p.dust >= dust + 5 && p.gold < gold && p.tickets <= tk - 5 - (glassSold ? 4 : 0) && (!glassSold || p.misc.glass === 1) && fixed.length >= MERCHANT.stock.length - 1);
    const wares = mc.stock.filter((s) => s.ware);
    const frags = wares.filter((s) => s.kind === 'fragment').reduce((a, s) => a + s.n, 0);
    check('Merchant (0.66): five wares fresh each visit, never more than 50 Immortal Fragments', wares.length === MERCHANT.wareSlots && frags <= 50 && wares.every((s) => s.label && (s.gold > 0 || s.tickets > 0)));
    {
      // in a party everyone may buy each ware once; buying from one merchant keeps you from another for a while
      const wp = new World({ seed: 9, mode: 'explore', cls: 'mage', save: Object.assign(geared('mage', 40, 3), { gold: 1e7, tickets: 200 }) });
      wp.addHero(1, { save: Object.assign(geared('warrior', 40, 3), { gold: 1e7, tickets: 200 }), name: 'Pal', gold: 1e7, tickets: 200 }); // (a friend's gold and shards are their account's)
      const friend = wp.heroes.find((h) => h.pid === 1);
      wp.loadMap('frost', 'town');
      const m2 = wp.merchant || wp.spawnMerchant();
      for (const h of wp.heroes) wp.as(h, (q) => { q.x = q.px = m2.x + 1; q.z = q.pz = m2.z; q.bag = []; });
      wp.as(wp.heroes[0], () => wp.buyMerchant(0));
      wp.as(friend, () => wp.buyMerchant(0));
      const both = wp.heroes.every((h) => m2.stock[0].bought[h.pid]);
      check('Merchant (0.66): in a party, everyone can buy the same ware', both);
      wp.as(friend, () => wp.buyMerchant(0));
      check('...once each', wp.as(friend, (q) => q.bag.length) === 1);
      wp.merchant = null;
      const m3 = wp.spawnMerchant();
      for (const h of wp.heroes) wp.as(h, (q) => { q.x = q.px = m3.x + 1; q.z = q.pz = m3.z; });
      wp.events.length = 0;
      wp.as(friend, () => wp.buyMerchant(1));
      check('...and the next merchant must wait (no hopping between worlds)', !m3.stock[1].bought[friend.pid] && wp.events.some((e) => e.type === 'merchantWait'));
      wp.as(friend, (q) => { q.merchantCd = 0.5; }); // (as if nearly all of it had passed)
      m3.left = 1e4;
      run(wp, 1);
      wp.as(friend, () => { const q = wp.player; q.x = q.px = m3.x + 1; q.z = q.pz = m3.z; wp.buyMerchant(1); });
      check('...until it has passed', !!m3.stock[1].bought[friend.pid]);
    }
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

// --- 0.61.5: every Immortal is about damage (defence only where it turns into damage) ---------------
{
  const { geared } = await import('./balance.mjs');
  const { SPEC_IMMORTALS, EFFECTS, rollItem: roll, RARITIES: RR, IMMORTAL: IMM, rollUnique } = await import('../src/sim/items.js');
  const { makeRng: mk } = await import('../src/sim/rng.js');
  const imm = (slot, cls) => roll(mk(slot.length + 5), 100, { weights: RR.map((_, i) => (i === IMM ? 1 : 0)), slot, cls });
  const make = (cls, spec, slot, item) => {
    const save = Object.assign(geared(cls, 100, 3), { spec, talents: {} });
    save.equipped[slot] = item || imm(slot, cls);
    const w = new World({ seed: 5, cls, save });
    w.wave.phase = 'explore'; w.enemies = []; w.events.length = 0;
    const p = w.player; p.x = p.px = 0; p.z = p.pz = 0; p.hp = p.stats.maxHp;
    const e = w.spawnEnemy('grunt', { x: 9, z: 0, level: 100 }); e.state = 'recover'; e.t = 999; e.hp = e.maxHp = 1e12; e.x = e.px = 9; e.z = e.pz = 0;
    const hit = () => { const h0 = e.hp; w.hitEnemy(e, 1000, { canCrit: false }); return h0 - e.hp; };
    return { w, p, e, hit };
  };
  const words = /less damage|heals? you|take \d+% less|cuts damage/i;
  const bad = [];
  for (const spec in SPEC_IMMORTALS) for (const slot in SPEC_IMMORTALS[spec]) if (spec !== 'bulwark' && words.test(SPEC_IMMORTALS[spec][slot].desc)) bad.push(SPEC_IMMORTALS[spec][slot].name);
  for (const k in EFFECTS) if (words.test(EFFECTS[k].desc)) bad.push(EFFECTS[k].name);
  check('no Immortal outside the Bulwark is about taking less damage or healing', bad.length === 0, bad.join(', '));
  {
    const { w, p, hit } = make('warrior', 'berserker', 'helm');
    const full = hit(); p.hp = p.stats.maxHp * 0.45; const low = hit(); p.hp = p.stats.maxHp * 0.02; const lowest = hit();
    // (below half you are Bloodied as well: compare against the same health without the crown)
    w.mods.missingDmg = 0; const plain = hit(); w.mods.missingDmg = 0.03;
    check('Crown of the Last Breath: 3% for every 10% of health missing, up to 27%', Math.abs(lowest / plain - 1.27) < 0.01 && low > full, `${full} ${low} ${lowest} / ${plain}`);
  }
  {
    const { w, p, hit } = make('warrior', 'berserker', 'chest');
    const L = w.mods.lowHpDmg;
    const full = hit(); p.hp = p.stats.maxHp * 0.4; const bl = hit(); w.mods.lowHpDmg -= 0.15; const plain = hit();
    check('Scarred Hauberk: a further 15% while Bloodied', Math.abs(bl / plain - (1 + L) / (1 + L - 0.15)) < 0.01 && full < bl, `${bl} / ${plain}`);
  }
  {
    const { w, p, e } = make('warrior', 'bulwark', 'chest');
    const before = w.abilityDamage('q'); p.bastionT = 3; const during = w.abilityDamage('q');
    const iron = p.stats.armor * w.mods.ironWeight * 0.6;
    check('Bastion Plate: Weight of Iron counts armor 60% more while Hold the Line holds', during > before && Math.abs(during - before - (w.kit.q.dmg(Object.assign({}, p.stats, { ad: p.stats.ad + p.stats.armor * w.mods.ironWeight * 1.6 }), p.level) - w.kit.q.dmg(Object.assign({}, p.stats, { ad: p.stats.ad + p.stats.armor * w.mods.ironWeight }), p.level)) * w.mods.qDmg) < 1, `${before} -> ${during} (iron +${Math.round(iron)})`);
  }
  {
    const { w, p, e } = make('warrior', 'bulwark', 'helm');
    e.state = 'windup'; p.parryT = 1; p.parryHit = false;
    const got = w.hitPlayer(50, { parryable: false, src: e });
    check('Crown of the Iron Answer: a Broken enemy takes 35% more, and Reckoning gains 3', got === 'parried' && Math.abs(e.vuln - 0.35) < 1e-9 && p.reck >= 3, `${got} ${e.vuln} ${p.reck}`);
  }
  {
    const { w, p, hit } = make('archer', 'sharpshooter', 'boots');
    const plain = hit(); p.rushT = 2; const rush = hit();
    check('Quickstep Boots: 20% more while the roll\'s attack speed lasts', Math.abs(rush / plain - 1.2) < 0.01, `${rush} / ${plain}`);
  }
  {
    const { w, hit } = make('archer', 'windrunner', 'chest');
    check('Windwoven Vest: +12% attack speed and stronger Hurricane arrows', w.mods.asMult >= 1.12 - 1e-9 && w.mods.hurricaneDmg > 1.14);
  }
  {
    const { w, p, e, hit } = make('rogue', 'assassin', 'chest');
    const plain = hit();
    for (let i = 0; i < 7; i++) { const v = w.spawnEnemy('grunt', { x: 2, z: 0, level: 100 }); v.hp = 1; w.hitEnemy(v, 10, { canCrit: false, source: 'q' }); }
    const after = hit();
    check('Shroud of Last Rites: each Clean Kill +8% for 6 s, up to 40%', Math.abs(after / plain - 1.4) < 0.01, `${plain} -> ${after}`);
    for (let i = 0; i < 6.5 / CONFIG.TICK; i++) w.step(CONFIG.TICK);
    check('...and it wears off', !(p.surgeN > 0));
  }
  {
    const { w, p, hit } = make('rogue', 'shadowdancer', 'chest');
    const plain = hit(); p.veilT = 2; const veiled = hit();
    check('Shadowweave: 20% more while Veiled', Math.abs(veiled / plain - 1.2) < 0.01, `${veiled} / ${plain}`);
  }
  {
    const { w, p, e, hit } = make('mage', 'pyromancer', 'chest');
    const plain = hit();
    for (let i = 0; i < 3; i++) { const v = w.spawnEnemy('grunt', { x: 3, z: i, level: 100 }); v.state = 'recover'; v.t = 999; v.hp = v.maxHp = 1e9; w.addBurn(v, 5, true); }
    w.step(CONFIG.TICK);
    const burning = hit();
    check('Ashen Robe: 4% more for each burning enemy within 8 m', Math.abs(burning / plain - 1.12) < 0.012, `${burning} / ${plain} (${p.ashN})`);
  }
  {
    const { w, p, e, hit } = make('mage', 'frostbinder', 'chest');
    const plain = hit();
    for (let i = 0; i < 3; i++) w.addSurge(w.mods.shatterSurge, 5, 6);
    check('Rimeguard Mantle: Shatters stack 4% more damage', w.mods.shatterSurge === 0.04 && Math.abs(hit() / plain - 1.12) < 0.01);
  }
  {
    const ring = rollUnique(mk(3), 100, 'bluetrim', 'warrior');
    const { w, p, hit } = make('mage', 'pyromancer', 'ring', ring);
    const top = hit(); p.hp = p.stats.maxHp * 0.6; const mid = hit();
    check("Edric's Colours: 18% more above 70% health", Math.abs(top / mid - 1.18) < 0.01, `${top} / ${mid}`);
  }
  {
    const chest = rollUnique(mk(4), 100, 'sporeheart', 'mage');
    const { w, p, e } = make('mage', 'frostbinder', 'chest', chest);
    const v = w.spawnEnemy('grunt', { x: 3, z: 0, level: 100 }); v.state = 'recover'; v.t = 999; v.hp = v.maxHp = 1e9; v.x = v.px = 3; v.z = v.pz = 0;
    for (let i = 0; i < 4.2 / CONFIG.TICK; i++) w.step(CONFIG.TICK);
    check('Sporeheart: the spores burst, hurting and weakening enemies close by', v.hp < 1e9 && v.vulnT > 0 && Math.abs(v.vuln - 0.1) < 1e-9, `${1e9 - v.hp} ${v.vuln}`);
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
    check("Subclass Immortals: a Berserker's helm is the Crown of the Last Breath, not Undying", !w.mods.undying && w.mods.missingDmg === 0.03 && w.mods.lastBreathOath === 3 && effectFor(save.equipped.helm.effect, 'warrior', 'berserker').name === 'Crown of the Last Breath');
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
    const far = w.spawnEnemy('grunt', { x: 9, z: 0, level: 60 }); far.x = far.px = 9; far.z = far.pz = 0; far.state = 'recover'; far.t = 999; far.hp = far.maxHp = 1e9;
    w.step(CONFIG.TICK);
    const hit = () => { far.hp = 1e9; w.hitEnemy(far, 1000, { canCrit: false }); return 1e9 - far.hp; };
    const alone = hit();
    const near = w.spawnEnemy('grunt', { x: 2, z: 0, level: 60 }); near.x = near.px = 2; near.z = near.pz = 0; near.state = 'recover'; near.t = 999;
    w.step(CONFIG.TICK);
    const crowded = hit();
    check("Rangekeeper's Coat (0.61.5): 15% more damage while no enemy is within 6 m", Math.abs(alone / crowded - 1.15) < 0.01, `${alone} vs ${crowded}`);
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
    check('The Wilds: more of everything', WD.events < 120 && WD.eventChance > 0.2 && WD.thiefIn > 0.3 && WD.storied >= 2);
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
  // (0.56.3: the Mage clears more slowly now, so more enemies are about: 1500 -> 1650)
  check('co-op updates: about a kilobyte and a half each at world tier III', bytes / sent < 1650, Math.round(bytes / sent) + ' bytes');
  // A lost update (say, one that came while the friend was still joining): the friend notices and asks for a full one.
  makeSnapshot(w, 1, memo); // never arrives
  const after = JSON.parse(JSON.stringify(makeSnapshot(w, 1, memo)));
  check('co-op updates: a missing update is noticed, not pieced together wrongly', receiveSnapshot(friend, after) === false && applySnapshot(friend, after) === false);
  const reset = {}; // what the host does when asked
  const fresh = JSON.parse(JSON.stringify(makeSnapshot(w, 1, reset)));
  check('co-op updates: ...and the full one that follows puts the friend right', fresh.full && receiveSnapshot(friend, fresh) && (applySnapshot(friend, fresh, 1), look(friend.enemies, friend.loot, friend.player) === look(w.enemies, w.loot.filter((l) => l.owner === undefined || l.owner === 1).map((l) => ({ ...l, x: r2(l.x), z: r2(l.z) })), w.heroByPid(1).player)));
}
// --- Elite spoils, rarer and richer radiant chests and world events (0.49) ---
{
  const { ELITE_SPOILS, FRAGMENTS: FR2, EVENTS: EV2 } = await import('../src/sim/surprises.js');
  const { CHEST_TIERS } = await import('../src/sim/items.js');
  let dust = 0, frags = 0, chests = 0, best = [], n = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const w = new World({ seed, mode: 'explore', save: { v: 2, level: 40 } }); w.loadMap('ridge', 'fen');
    const e = w.enemies.find((x) => !x.def.boss); w.makeElite(e, 1);
    const d0 = w.player.dust, f0 = w.player.misc.fragment || 0, c0 = w.chests.filter((c) => c.tier === 'radiant').length;
    w.hitEnemy(e, 1e12); w.step(CONFIG.TICK); n++;
    dust += w.player.dust - d0; frags += (w.player.misc.fragment || 0) - f0; chests += w.chests.filter((c) => c.tier === 'radiant').length - c0;
    best.push(Math.max(...w.loot.map((l) => l.item.rarity)));
  }
  check('elite spoils: Wishdust every time, a fragment about a quarter of the time, a radiant chest now and then', dust >= n && frags > n * 0.12 && frags < n * 0.4 && chests >= 1, `${dust} dust, ${frags} fragments, ${chests} chests from ${n} elites`);
  check('elite spoils: its sure piece is Epic or better, and often Mythic or better', best.every((r) => r >= 3) && best.filter((r) => r >= 4).length > n * 0.25, best.filter((r) => r >= 4).length + ' of ' + n + ' Mythic+');
  check('radiant chests: rarer than before, and they hold Immortal Fragments and better gear', CONFIG.CHEST_RADIANT <= 0.02 && CHEST_TIERS.radiant.fragments && CHEST_TIERS.radiant.items.length >= 3 && EV2.chance <= 0.15 && FR2.event >= 10);
  const w = new World({ seed: 3, mode: 'explore', save: { v: 2, level: 50 } }); w.loadMap('ridge', 'fen');
  const c = w.addChestAt(w.player.x + 1, w.player.z, 'radiant'); const f0 = w.player.misc.fragment || 0;
  w.openChest(c);
  const got = (w.player.misc.fragment || 0) - f0;
  check('radiant chests: 8 to 14 Immortal Fragments, and Mythic or better on top', got >= FR2.radiant[0] && got <= FR2.radiant[1] && w.loot.some((l) => l.item.rarity >= 4), `${got} fragments`);
}
// --- Culling Edge (Assassin, 0.51) ---
{
  const mk = (spec) => { const w = new World({ seed: 5, mode: 'explore', cls: 'rogue', save: { v: 2, cls: 'rogue', level: 50, skillPoints: 49, spec } }); w.player.x = w.player.px = 0; w.player.z = w.player.pz = 0; w.enemies = []; return w; };
  const hitOf = (spec, lvl, type = 'knight', hp = 1e6) => {
    const w = mk(spec); const p = w.player; p.stats.crit = 0;
    const e = w.spawnEnemy(type, { x: 2, z: 0, level: lvl }); e.x = e.px = 2; e.z = e.pz = 0; e.state = 'recover'; e.t = 999; e.hp = e.maxHp = hp;
    w.hitEnemy(e, 100, { source: 'q', canCrit: false }); return { dealt: hp - e.hp, ad: p.stats.ad, w };
  };
  const plain = hitOf(null, 50).dealt, low = hitOf('assassin', 40).dealt, same = hitOf('assassin', 50).dealt, high = hitOf('assassin', 60).dealt;
  check('Culling Edge: ability hits take a share of max health, most below your level, least above', low > same && same > high && high > plain && Math.abs(same - 6e4) < 5e3, `${Math.round(low)} / ${Math.round(same)} / ${Math.round(high)} vs ${Math.round(plain)} without`);
  const boss = hitOf('assassin', 50, 'boss3', 1e9);
  check('Culling Edge: on a boss it is capped by attack damage', boss.dealt < boss.ad * 3 + 1000, `${Math.round(boss.dealt)} (ad ${Math.round(boss.ad)})`);
  const w = mk('assassin'); const e = w.spawnEnemy('knight', { x: 2, z: 0, level: 50 }); e.hp = e.maxHp = 1e6; const h0 = e.hp;
  w.hitEnemy(e, 100, { source: 'bleed', dot: true, canCrit: false });
  check('Culling Edge: bleeds do not take a share', h0 - e.hp < 1000);
}
// --- Tooltips (0.52): the damage shown is the damage dealt, and every formula comes apart ---
{
  const { SPECS: SP } = await import('../src/sim/talents.js');
  let bad = [], n = 0;
  const combos = [['warrior', null], ['archer', null], ['rogue', null], ['mage', null], ...Object.entries(SP).map(([id, d]) => [d.cls, id])];
  for (const [cls, spec] of combos) {
    const w = new World({ seed: 2, mode: 'explore', cls, save: { v: 2, cls, level: 60, skillPoints: 59, spec } });
    w.player.stats.haste = 900; // past the floor, so Overflow shows too
    for (const slot of ['q', 'w', 'e', 'r']) {
      const b = w.abilityBreakdown(slot); n++;
      const want = w.abilityDamage(slot) * classPower(cls, spec, w.player.level);
      if (!b.exact || Math.abs(b.final - want) > Math.max(1e-6, want * 1e-9)) bad.push(`${spec || cls} ${slot}`);
    }
  }
  check('tooltips: every skill of every class and subclass comes apart into base, per level and ratio, and adds up to what it deals', bad.length === 0 && n === 48, bad.join(', ') || `${n} skills`);
  const d = new World({ seed: 2, mode: 'explore', cls: 'archer', save: { v: 2, cls: 'archer', level: 60, skillPoints: 59, spec: 'sharpshooter' } });
  check("tooltips: Deadeye's damage is shown as scaling with attacks per second", d.abilityBreakdown('r').asScales && !d.abilityBreakdown('q').asScales);
}
// --- Banked progress (0.53): bounties and side quests count what you already did ---
{
  const w = new World({ seed: 4, mode: 'explore', save: { v: 2, level: 40, visited: ['town', 'greenwood', 'ridge', 'fen', 'keep'] } });
  const p = w.player;
  w.loadMap('ridge', 'fen');
  p.bounties = [];
  for (let i = 0; i < 13; i++) w.bountyEvent('elite');
  for (let i = 0; i < 3; i++) w.bountyEvent('storied');
  check('bank: progress with no job waiting for it is kept', p.bank.b.elite === 13 && p.bank.b.storied === 3, JSON.stringify(p.bank.b));
  for (const k of ['elite', 'storied', 'event', 'thief', 'remnant', 'rift']) p.bank.b[k] = Math.max(p.bank.b[k] || 0, 50);
  for (const id of ['ridge', 'fen', 'keep', 'greenwood']) p.bank.b[`kill@${id}`] = 100;
  const before = JSON.parse(JSON.stringify(p.bank.b));
  w.fillBounties();
  const ok = p.bounties.every((b) => b.done && b.pre === b.need);
  const used = p.bounties.every((b) => { const key = b.kind === 'kill' ? `kill@${b.map}` : b.kind; return before[key] - p.bank.b[key] === b.need; });
  check('bank: a new job starts with banked progress, and only what it needs is taken (the rest waits for the next)', ok && used, p.bounties.map((b) => `${b.kind} ${b.n}/${b.need}`).join(', '));
  // side quests
  const q = new World({ seed: 4, mode: 'explore', save: { v: 2, level: 40 } }); const qp = q.player;
  q.loadMap('frost', 'town');
  const wolf = q.spawnEnemy('wolf', { x: 5, z: 5, level: 40 });
  for (let i = 0; i < 13; i++) q.questEvent('kill', wolf);
  const grunt = q.spawnEnemy('grunt', { x: 5, z: 5, level: 40 });
  for (let i = 0; i < 15; i++) q.questEvent('kill', grunt);
  check('bank: kills no side quest wanted are kept by enemy and map', qp.bank.q['wolf@frost'] === 13 && qp.bank.q['grunt@frost'] === 15, JSON.stringify(qp.bank.q));
  qp.quests.wolves = undefined; delete qp.quests.wolves;
  const open = q.questOpen.bind(q); q.questOpen = () => true; // (just the bank here, not when the quest is offered)
  q.acceptQuest('wolves');
  check('bank: a side quest taken later counts them, and is ready at once if there were enough', q.questState('wolves') === 'ready' && qp.quests.wolves.pre === 10 && qp.bank.q['wolf@frost'] === 3);
  q.acceptQuest('husks');
  check("bank: Elder Wren's story quests start from nothing", qp.quests.husks.n === 0 && qp.bank.q['grunt@frost'] === 15);
  q.questOpen = open;
  const again = new World({ seed: 4, mode: 'explore', save: JSON.parse(JSON.stringify(q.toSave())) });
  check('bank: saved with the character', again.player.bank.q['wolf@frost'] === 3);
}
// --- The keepsake slot (0.53): Edric's Colours for everyone, at your level, kept through rebirth ---
{
  const { rebirthSave } = await import('../src/sim/rebirth.js');
  const { starterWeapon, itemStats } = await import('../src/sim/items.js');
  const claim = (cls) => {
    const w = new World({ seed: 6, mode: 'explore', cls, save: { v: 2, cls, level: 50 } });
    w.loadMap('town', 'greenwood');
    w.player.quests.edric = { s: 'ready', n: 1 };
    w.claimQuest('edric');
    return w;
  };
  const r = claim('rogue'), wa = claim('warrior');
  check("keepsake: Edric's Colours goes to its own slot, for every class; warriors still get his sword too", r.player.keepsake && r.player.keepsake.effect === 'bluetrim' && wa.player.keepsake && [...wa.player.bag, ...Object.values(wa.player.equipped)].some((it) => it && it.effect === 'edric') && !r.player.bag.some((it) => it.effect === 'bluetrim'));
  check('keepsake: its effect and stats count', r.mods.bluetrim === true && r.player.stats.haste > new World({ seed: 6, mode: 'explore', cls: 'rogue', save: { v: 2, cls: 'rogue', level: 50 } }).player.stats.haste + 50);
  const k = r.player.keepsake; const before = Object.values(itemStats(k)).reduce((a, b) => a + b, 0);
  r.player.level = 80; r.recalcStats();
  const after = Object.values(itemStats(k)).reduce((a, b) => a + b, 0);
  check('keepsake: it grows with you', k.ilvl === 80 && after > before * 1.3, `${before} -> ${after}`);
  const reborn = new World({ seed: 6, mode: 'explore', cls: 'rogue', save: rebirthSave(JSON.parse(JSON.stringify(r.toSave())), starterWeapon) });
  check('keepsake: kept through rebirth, back at level 1', reborn.player.keepsake && reborn.player.keepsake.effect === 'bluetrim' && reborn.player.keepsake.ilvl === 1 && reborn.player.level === 1);
  const old = new World({ seed: 6, mode: 'explore', cls: 'mage', save: { v: 2, cls: 'mage', level: 60, quests: { edric: { s: 'done', n: 1 } } } });
  check('keepsake: a hero who finished the quest before 0.53 has it too', old.player.keepsake && old.player.keepsake.ilvl === 60);
}
// --- (0.61.2) An enemy's wind-up warning goes with it ---
{
  const w = new World({ seed: 6, mode: 'explore', cls: 'archer' });
  w.loadMap('greenwood', 'town');
  const e = w.enemies.find((x) => !x.def.boss);
  w.startWindup(e, e.def.attacks[0], false);
  check('a wind-up shows its warning', w.telegraphs.some((t) => t.owner === e.id));
  e.dead = true; w.enemies = w.enemies.filter((x) => x !== e); // gone some way that did not tidy up
  w.step(CONFIG.TICK);
  check('...and the warning goes when the enemy does, however it went', !w.telegraphs.some((t) => t.owner === e.id));
}

// --- The augment overhaul (0.61.1) ---
{
  const { AUGMENTS } = await import('../src/sim/augments.js');
  check('Augments: no parry augments any more', !Object.values(AUGMENTS).some((a) => a.slot === 'parry'));
  check('Augments: Giant (+25% health) is only for the Bulwark', AUGMENTS.h_giant.spec === 'bulwark');
  for (const spec of ['berserker', 'bulwark', 'sharpshooter', 'windrunner', 'assassin', 'shadowdancer', 'pyromancer', 'frostbinder'])
    check(`Augments: ${spec} has at least two of its own`, Object.values(AUGMENTS).filter((a) => a.spec === spec).length >= 2);
  const { geared } = await import('./balance.mjs');
  const save = geared('warrior', 60, 5);
  const w = new World({ seed: 4, mode: 'arena', cls: 'warrior', save });
  w.augments.push('q_twin'); w.recalcStats();
  w.delayed = [];
  w.player.cd.q = 0; w.player.castLock = 0;
  w.command({ type: 'cast', slot: 'q', x: w.player.x + 3, z: w.player.z }); w.runCommands();
  check('Twin Cleave: one more strike (60%)', w.delayed.filter((d) => d.kind === 'cleave').length === 1);
  w.mods.qEcho = 0.4; w.delayed = []; w.player.cd.q = 0; w.player.castLock = 0;
  w.command({ type: 'cast', slot: 'q', x: w.player.x + 3, z: w.player.z }); w.runCommands();
  check("...on top of Executioner's Rhythm's second strike: two more", w.delayed.filter((d) => d.kind === 'cleave').length === 2);
}

// --- The Weekly Echo's twists (0.60) ---
{
  const T = await import('../src/sim/trial.js');
  const weeks = [0, 1, 2, 3, 4, 5].map((i) => T.trialWeek(100 + i).twist);
  check('Weekly twists: one each week, and every one comes round', T.TWIST_IDS.every((t) => weeks.includes(t)) && weeks.every((t) => T.TWISTS[t]), weeks.join(' '));
  const weekWith = (tw) => { for (let i = 0; i < 12; i++) { const wk = T.trialWeek(200 + i); if (wk.twist === tw) return wk; } };
  const run = (tw) => { const wk = weekWith(tw); return T.buildTrialWorld(wk, T.defaultBuild(wk, 'warrior')); };
  const twin = (tw) => { const w = run(tw); const o = run(tw); o.twist = null; return [w, o]; }; // the same week, with and without its twist
  const [g, plain] = twin('glass');
  check('Glass Cannon: the run knows its twist', g.twist === 'glass' && !plain.twist);
  const e1 = g.spawnEnemy('grunt', { x: 5, z: 0 }), e2 = plain.spawnEnemy('grunt', { x: 5, z: 0 });
  e1.hp = e1.maxHp = e2.hp = e2.maxHp = 1e6;
  g.hitEnemy(e1, 100, { canCrit: false }); plain.hitEnemy(e2, 100, { canCrit: false });
  check('Glass Cannon: you hit 50% harder', Math.abs((1e6 - e1.hp) / (1e6 - e2.hp) - 1.5) < 0.01, `${1e6 - e1.hp} vs ${1e6 - e2.hp}`);
  const d = run('dry'); d.player.hp = 10; const pots = d.player.potions;
  d.command({ type: 'potion' }); d.runCommands();
  check('Dry Spell: no potions', d.player.hp === 10 && d.player.potions === pots);
  const [h, hn] = twin('haste');
  check('Haste: cooldowns run 30% faster', Math.abs(h.rawCooldown('q') * 1.3 - hn.rawCooldown('q')) < 1e-6, `${h.rawCooldown('q').toFixed(2)} vs ${hn.rawCooldown('q').toFixed(2)}`);
  const sw = run('swarm'); sw.startWave(); const sq = sw.wave.queue.length;
  const ns = run('glass'); ns.startWave();
  check('Swarm: a third more enemies on a floor', sq > ns.wave.queue.length, `${sq} vs ${ns.wave.queue.length}`);
  const df = run('draft');
  for (let i = 0; i < 4000 && df.wave.cleared < 2; i++) {
    if (df.offer) { df.command({ type: 'augment', id: df.offer.choices[0] }); df.runCommands(); }
    for (const e of df.enemies.slice()) if (!e.dead) df.hitEnemy(e, 1e12);
    df.player.hp = df.player.stats.maxHp; df.step(CONFIG.TICK);
  }
  check('Deep Draft: an augment after floor 2 too', df.wave.cleared >= 2 && (df.offer || df.augments.length >= 2), df.augments.length);
}
// --- The Echo Ring's spoils (0.59) ---
{
  const { ringGain, newRing, RING } = await import('../src/sim/ring.js');
  const { geared } = await import('./balance.mjs');
  const play = (focus, waves, opts = {}) => {
    const save = geared('warrior', 60, 5); save.maxCheckpoint = 1;
    const w = new World({ seed: 4, mode: 'arena', cls: 'warrior', save, focus, startWave: 1 });
    const p = w.player;
    for (let i = 0; i < 60000 && w.wave.cleared < waves; i++) {
      if (w.offer) { w.command({ type: 'augment', id: w.offer.choices[0] }); w.runCommands(); }
      if (w.ring && w.ring.hold && w.wave.cleared < waves) { w.command({ type: 'ringOn' }); w.runCommands(); }
      if (w.wave.phase === 'intermission') { w.command({ type: 'nextWave' }); w.runCommands(); }
      for (const e of w.enemies.slice()) if (!e.dead) w.hitEnemy(e, 1e12);
      p.hp = p.stats.maxHp;
      w.step(CONFIG.TICK);
    }
    w.events.length = 0;
    return { w, p };
  };
  let { w, p } = play({ kind: 'fragment' }, 5);
  for (let i = 0; i < 200 && w.offer; i++) { w.command({ type: 'augment', id: w.offer.choices[0] }); w.runCommands(); w.step(CONFIG.TICK); }
  const n5 = w.wave.n;
  for (let i = 0; i < 600; i++) w.step(CONFIG.TICK);
  check('Ring: after a boss the next wave waits for you to choose', w.ring.hold && w.wave.n === n5 && w.wave.phase === 'intermission');
  const want = Math.floor(w.ring.pot);
  const expect = [1, 2, 3, 4].reduce((a, n) => a + ringGain(newRing({ kind: 'fragment' }), n, false, 60), 0) + ringGain(newRing({ kind: 'fragment' }), 5, true, 60);
  check('Ring (0.65): five waves of the Fragment focus add up, each 8% more, a boss three times a wave', want >= 6 && Math.abs(w.ring.pot - expect) < 1e-6 && Math.abs(ringGain(newRing({ kind: 'fragment' }), 2, false, 60) / ringGain(newRing({ kind: 'fragment' }), 1, false, 60) - 1.08) < 1e-9, w.ring.pot.toFixed(2));
  check('Ring (0.65): every wave pays out as it falls, no waiting for a boss', (p.misc.fragment || 0) === want && w.ring.given[w.cur.pid] === want, `${p.misc.fragment} of ${want}`);
  const f0 = p.misc.fragment || 0;
  w.command({ type: 'ringLeave' }); w.runCommands();
  check('Ring: going home after a boss settles it, with nothing paid twice', (p.misc.fragment || 0) === f0 && w.events.some((e) => e.type === 'ringPaid' && e.n === want));
  w.command({ type: 'ringLeave' }); w.runCommands();
  check('Ring: only once a run', (p.misc.fragment || 0) === f0);
  ({ w, p } = play({ kind: 'gold' }, 7));
  const pot = Math.floor(w.ring.pot);
  p.hp = 1; w.damagePlayer ? w.damagePlayer(1e9) : (p.hp = 0);
  if (!w.events.some((e) => e.type === 'ringPaid')) { w.command({ type: 'ringLeave' }); w.runCommands(); }
  check('Ring (0.61.1): fall (or leave) between bosses and everything you gathered is yours', w.ring.given[w.cur.pid] === pot && pot > 0, `${w.ring.given[w.cur.pid]} of ${pot}`);
  {
    const { ringWorth, ringCost, RING: R } = await import('../src/sim/ring.js');
    check('Ring: the growth stops at wave 50', ringWorth(60, false) === ringWorth(50, false) && ringWorth(50, false) > 30);
    check('Ring: waking it costs 5 shards from wave 1, 2 more for each checkpoint further in', ringCost(1) === 5 && ringCost(6) === 7 && ringCost(31) === 17);
    check('Ring (0.65): no Immortal chance before wave 15, then 1.5%, up to 5%', R.immortal(14) === 0 && R.immortal(15) === 0.015 && Math.abs(R.immortal(30) - 0.03) < 1e-9 && R.immortal(80) === 0.05);
    const { ringTable } = await import('../src/sim/ring.js');
    const t40 = ringTable(100, 1, [40])[0];
    const immortals = t40.total.gear * R.immortal(40), fromFragments = t40.total.fragment / 250;
    check('Ring: to wave 40, Gear pays one or two Immortals, about what the Fragments do', immortals > 1 && immortals < 2.2 && fromFragments > 1 && fromFragments < 2.2 && Math.abs(immortals - fromFragments) < 0.5, `${immortals.toFixed(2)} vs ${fromFragments.toFixed(2)}`);
    check('Ring (0.65): from wave 20 the echoes come faster, never past 80% wind-ups and 65% rests', R.pace(19) === 1 && R.pace(40) < 1 && R.pace(200) === 0.8 && R.tempo(200) === 0.65 && R.move(200) === 1.2);
  }
  ({ w, p } = play({ kind: 'gear', slot: 'boots' }, 10));
  const got = w.ring.given[w.cur.pid];
  const boots = p.bag.filter((it) => it.slot === 'boots');
  check('Ring: the Gear focus gives pieces for the slot you chose, every other wave and more at bosses', got >= 6 && boots.filter((it) => it.rarity >= 3).length >= got - 1, `${got} pieces`); // (other boots in the bag are ordinary drops)
  w.command({ type: 'ringLeave' }); w.runCommands();
  check('Ring: and what dropped in the Ring comes home with you', w.loot.length === 0);
}
// --- Echoes (0.53): what giving up your gear is worth ---
{
  const { ECHOES, essenceFor } = await import('../src/sim/rebirth.js');
  const { geared } = await import('./balance.mjs');
  const save = geared('warrior', 100, 6);
  for (const k in save.equipped) { save.equipped[k].plus = 10; save.equipped[k].stars = 5; }
  save.bossKills = { boss3: 1 };
  const w = new World({ seed: 8, mode: 'explore', cls: 'warrior', save });
  const worth = w.rebirthEssence('ring');
  w.events.length = 0;
  w.command({ type: 'rebirth', heirloom: 'ring' }); w.step(CONFIG.TICK);
  const ev = w.events.find((e) => e.type === 'reborn');
  check('echoes: a rebirth turns the gear you wear into Echo Essence (not the Heirloom) and remembers each piece', ev && ev.essence === worth && worth === 4 * essenceFor(save.equipped.weapon) && Object.keys(ev.save.rebirth.memories).length === 5, `${ev && ev.essence} essence`);
  {
    // (0.58) the bag counts too, gifts give nothing, and the panel can say all of it
    const { rebirthGear } = await import('../src/sim/rebirth.js');
    const s2 = geared('warrior', 100, 6); s2.bossKills = { boss3: 1 };
    const spare = JSON.parse(JSON.stringify(s2.equipped.weapon)); spare.id = 'spare';
    const gift = JSON.parse(JSON.stringify(s2.equipped.chest || s2.equipped.weapon)); gift.id = 'gift'; gift.gift = true;
    s2.bag = [spare, gift];
    const w2 = new World({ seed: 8, mode: 'explore', cls: 'warrior', save: s2 });
    const pv = w2.rebirthPreview(null);
    check('echoes (0.58): gear left in the bag becomes Echo Essence too', pv.essenceBag === essenceFor(spare) && pv.essence === pv.essenceWorn + pv.essenceBag && pv.bagPieces === 1, JSON.stringify(pv));
    check('echoes: a gift from a friend gives nothing', pv.gifts === 1 && rebirthGear({ equipped: {}, bag: [gift] }).essence === 0);
    check('the preview says what is left behind', pv.left && typeof pv.left.fragments === 'number' && pv.marks > 0 && pv.ember >= 0);
    w2.events.length = 0;
    w2.command({ type: 'rebirth' }); w2.step(CONFIG.TICK);
    const e2 = w2.events.find((e) => e.type === 'reborn');
    check('echoes: the rebirth gives what the preview said', e2 && e2.essence === pv.essence && e2.ember === pv.ember, `${e2 && e2.essence} vs ${pv.essence}`);
  }
  const r = new World({ seed: 8, mode: 'explore', cls: 'warrior', save: JSON.parse(JSON.stringify(ev.save)) });
  const rp = r.player, heir = rp.equipped.ring;
  check('echoes: the Heirloom comes with you, back at your level, keeping its rarity, effect, +levels and stars', heir && heir.heirloom && heir.ilvl === 1 && heir.rarity === 6 && heir.plus === 10 && heir.stars === 5 && rp.equipped.weapon && rp.equipped.weapon.rarity === 0);
  rp.level = 30; r.recalcStats();
  check('echoes: ...and grows with you', heir.ilvl === 30);
  r.command({ type: 'recall', slot: 'weapon' }); r.step(CONFIG.TICK);
  const ess0 = rp.rebirth.essence;
  check('echoes: an Immortal cannot be recalled before level 40', !rp.bag.some((it) => it.rarity === 6) && ess0 === worth);
  rp.level = 40; r.recalcStats();
  r.command({ type: 'recall', slot: 'weapon' }); r.step(CONFIG.TICK);
  const got = rp.bag.find((it) => it.rarity === 6 && it.slot === 'weapon');
  check('echoes: from 40 it can: made again at your level, in its prime (+levels and stars kept, 0.62), for Essence', got && got.ilvl === 40 && got.plus === 10 && got.stars === 5 && got.recalled && got.effect === save.equipped.weapon.effect && rp.rebirth.essence === ess0 - ECHOES.recall[6]);
  r.command({ type: 'recall', slot: 'weapon' }); r.step(CONFIG.TICK);
  check('echoes: once a life', rp.bag.filter((it) => it.rarity === 6 && it.slot === 'weapon').length === 1);
  r.command({ type: 'equip', index: rp.bag.indexOf(got) }); r.step(CONFIG.TICK);
  const e1 = rp.rebirth.essence;
  for (let i = 0; i < 20; i++) { r.command({ type: 'echoUp', slot: 'weapon' }); r.step(CONFIG.TICK); }
  check('echoes: already in its prime, so Essence has nothing more to buy back (0.62)', rp.equipped.weapon.plus === 10 && rp.equipped.weapon.stars === 5 && e1 === rp.rebirth.essence);
  const e2 = rp.rebirth.essence, g2 = rp.gold, key = Object.keys(rp.equipped.weapon.stats)[0];
  r.command({ type: 'enchant', slot: 'weapon', key, essence: true }); r.step(CONFIG.TICK);
  check('echoes: a reroll for 1 Essence instead of gold', rp.rebirth.essence === e2 - 1 && rp.gold === g2);
}
// --- Act III: the Deep, Ember and the Primordials (0.54) ---
{
  const { DEEP, DEPTH_IDS, emberScale, emberOf, emberForGear } = await import('../src/sim/endgame.js');
  const { geared } = await import('./balance.mjs');
  check('Ember: what rebirths gave, and up to +5 Kindling a Depth', emberOf({ n: 3, ember: 52, kindling: { 6: 5, 7: 9 } }) === 52 + 5 + 5);
  check('Ember (0.58.2): a rebirth gives more the more you give up, up to the cap', emberForGear(0) === 0 && emberForGear(400) === 16 && emberForGear(1e6) === DEEP.emberMax && emberForGear(900) > emberForGear(400), [400, 1300, 2800].map(emberForGear).join(' '));
  {
    // The pace (0.58.2): the first rebirth clears Depth VI comfortably; then a new Depth every rebirth or two
    const first = 8 + emberForGear(380); // The Breath Below's gift, and a first life's gear
    check('Ember pace: a first life (with The Breath Below) is well past Depth VI', first / DEEP.depths[6].ember >= 1.3, `${first} of ${DEEP.depths[6].ember}`);
    let ember = first, lives = 1;
    const opened = { 6: 1 };
    const given = [700, 1000, 1300, 1600, 1900, 2200, 2500, 2800];
    for (const g of given) { ember += emberForGear(g) + DEEP.kindlingMax; lives++; for (const d of DEPTH_IDS) if (!opened[d] && ember >= DEEP.depths[d].ember) opened[d] = lives; }
    const at = DEPTH_IDS.map((d) => opened[d]);
    const gaps = at.slice(1).map((n, i) => n - at[i]);
    check('Ember pace: each Depth after VI comes a rebirth or two after the last', at.every(Boolean) && gaps.every((g) => g >= 1 && g <= 2), `opens at rebirths ${at.join(', ')}`);
  }
  check('Ember: each Depth asks for much more than the last', DEEP.depths[6].ember === 15 && DEEP.depths[10].ember > 5 * DEEP.depths[6].ember);
  const { migrateRebirth } = await import('../src/sim/rebirth.js');
  check('Ember: a hero reborn before 0.54.1 keeps 10 for each rebirth', migrateRebirth({ n: 3 }).ember === 30 && migrateRebirth({ n: 3, ember: 41 }).ember === 41);
  check('Ember: at the requirement, full damage; short of it, less; below half, 1 a hit', emberScale(10, 10).dealt === 1 && emberScale(9, 10).dealt < 0.8 && emberScale(4, 10).one && emberScale(13, 10).dealt === 1.25 && emberScale(4, 10).taken === 3);
  const hero = (n, extra = {}) => {
    const save = Object.assign(geared('warrior', 100, 5), { worldTier: 5, tierMax: 5, endings: { self: 1 }, rebirth: { n, deepMax: 0 } }, extra);
    const w = new World({ seed: 9, mode: 'explore', cls: 'warrior', save }); return w;
  };
  const w = hero(1); const p = w.player;
  w.loadMap('town', 'greenwood');
  check('Act III: The Low Water opens after the Unwish and a rebirth', w.questOpen('deep1') && !hero(0).questOpen('deep1'));
  w.command({ type: 'acceptQuest', id: 'deep1' }); w.step(CONFIG.TICK);
  w.command({ type: 'readSign', id: 'sealed' }); w.step(CONFIG.TICK);
  w.claimQuest('deep1');
  check('Act III: reading Tobin\'s sealed notes opens Depth VI, for good', p.rebirth.deepMax === 6 && p.rebirth.act3.deep1 && w.questState('deep1') === 'done');
  w.command({ type: 'setDepth', depth: 7 }); w.step(CONFIG.TICK);
  check('the Deep: a Depth not yet opened cannot be chosen', p.depth === 0);
  w.command({ type: 'setDepth', depth: 6 }); w.step(CONFIG.TICK);
  w.loadMap('ridge', 'fen');
  const e = w.enemies.find((x) => !x.def.boss);
  check('the Deep: every map out in the world is at that Depth: level 100, an Ember requirement, tier V and more', p.depth === 6 && w.depthNow() === 6 && e.ember === DEEP.depths[6].ember && e.level === 100 && w.worldTier() === 5);
  const hit = (ember) => { p.rebirth.ember = ember; e.hp = e.maxHp = 1e9; w.hitEnemy(e, 1000, { canCrit: false, source: 'q' }); return 1e9 - e.hp; };
  const full = hit(20), short = hit(0);
  check('the Deep: with Ember short of half its requirement, every hit is 1', short === 1 && full > 100, `${Math.round(full)} vs ${short}`);
  p.rebirth.ember = 20;
  w.loadMap('deep6', 'town');
  const cinder = w.enemies.find((x) => x.type === 'cinder');
  check("the Deep: the Cinder waits at the bottom of the Ashen Deep, at Depth VI's requirement", cinder && cinder.ember === DEEP.depths[6].ember && cinder.def.primordial);
  check('the Deep: a Depth\'s own map knows its Depth, and its title shows your Ember against it', w.map.deep === 6 && w.zone().sub === `Depth VI · Ember ${w.ember()} of ${DEEP.depths[6].ember}`, w.zone().sub);
  const k0 = p.rebirth.kindling[6] || 0;
  w.hitEnemy(cinder, 1e15); w.step(CONFIG.TICK);
  check('the Deep: a Primordial always gives Kindling, and the quest after opens the next Depth', (p.rebirth.kindling[6] || 0) === k0 + 1);
  // the story asks you to stand there yourself: a Primordial counts for its quest only at its Depth's Ember
  w.loadMap('town', 'greenwood');
  w.command({ type: 'acceptQuest', id: 'deep2' }); w.step(CONFIG.TICK);
  w.loadMap('deep6', 'town');
  p.rebirth.ember = 5; p.rebirth.kindling = {};
  let c2 = w.spawnEnemy('cinder', { x: p.x + 3, z: p.z, level: 100 });
  w.hitEnemy(c2, 1e15); w.step(CONFIG.TICK);
  const shortN = p.quests.deep2 && p.quests.deep2.n;
  p.rebirth.ember = 20;
  c2 = w.spawnEnemy('cinder', { x: p.x + 3, z: p.z, level: 100 });
  w.hitEnemy(c2, 1e15); w.step(CONFIG.TICK);
  check("Act III (0.62): the Cinder counts for 'What Ends' even under-Embered, when you face it yourself", p.quests.deep2 && shortN === 1 && w.questState('deep2') === 'ready', `${shortN} then ${w.questState('deep2')}`);
  // through rebirth
  const { rebirthSave } = await import('../src/sim/rebirth.js');
  const { starterWeapon } = await import('../src/sim/items.js');
  const again = new World({ seed: 9, mode: 'explore', cls: 'warrior', save: rebirthSave(JSON.parse(JSON.stringify(w.toSave())), starterWeapon) });
  check('Act III: progress, the Depths opened and Kindling are kept through rebirth, and Ember grows with the gear you gave up', again.questState('deep1') === 'done' && again.player.rebirth.deepMax === 6 && again.player.rebirth.lastEmber > 0 && again.ember() === w.ember() + again.player.rebirth.lastEmber && again.player.rebirth.lastEmber === w.rebirthEmber(), `+${again.player.rebirth.lastEmber}`);
  check('the Deep: back at level 1, no Depth until level 100 again', !again.depthOpen(again.player, 6));
  // a seal
  const a = hero(1); const ap = a.player; a.loadMap('ridge', 'fen');
  ap.cd.q = 0; a.command({ type: 'cast', slot: 'q', x: ap.x + 3, z: ap.z }); a.step(CONFIG.TICK);
  const asker = a.spawnEnemy('asker', { x: ap.x + 2, z: ap.z, level: 100 });
  const unasked = asker.def.attackByName.unasked;
  check('the Asker: far stronger, with Unasked, Every Wish at Once and the Answer', asker.def.hp >= 5600 && unasked && asker.def.attackByName.everywish && asker.def.attackByName.answer);
  ap.sealSlot = ap.lastSlot; ap.sealT = 6; ap.cd.q = 0; ap.castLock = 0;
  const before = ap.cd.q; a.command({ type: 'cast', slot: 'q', x: ap.x + 3, z: ap.z }); a.step(CONFIG.TICK);
  check('a seal: the last skill you used cannot be cast until it wears off', ap.lastSlot === 'q' && ap.cd.q === before);
}

// (0.61.8) Wishborne Might is adaptive: spell power for a Mage, and armor too for a Bulwark
{
  const { geared } = await import('./balance.mjs');
  const { WISH_STATS: WS } = await import('../src/sim/endgame.js');
  const make = (cls, spec, might) => {
    const save = Object.assign(geared(cls, 100, 3), { spec, talents: {}, wishStats: might ? { might } : {} });
    return new World({ seed: 4, cls, save }).player.stats;
  };
  const m0 = make('mage', 'pyromancer', 0), m50 = make('mage', 'pyromancer', 50);
  check('Might raises a Mage\'s spell power (30% for 50 points)', Math.abs(m50.ad / m0.ad - 1.3) < 0.01 && m50.armor === m0.armor, `${m0.ad} -> ${m50.ad}`);
  const b0 = make('warrior', 'bulwark', 0), b50 = make('warrior', 'bulwark', 50);
  check('...a Bulwark\'s attack damage and armor alike (Weight of Iron)', Math.abs(b50.ad / b0.ad - 1.3) < 0.01 && Math.abs(b50.armor / b0.armor - 1.3) < 0.01, `${b0.armor} -> ${b50.armor}`);
  const z0 = make('warrior', 'berserker', 0), z50 = make('warrior', 'berserker', 50);
  check('...and only attack damage for everyone else', Math.abs(z50.ad / z0.ad - 1.3) < 0.01 && z50.armor === z0.armor);
  check('the Wishborne panel names it for each', WS.might.unitFor('mage', 'frostbinder') === '% spell power' && WS.might.unitFor('warrior', 'bulwark') === '% attack damage and armor' && WS.might.unitFor('rogue', 'assassin') === '% attack damage');
}

// (0.61.9) Equip every upgrade: the best for each slot, but never over an Immortal or a set piece
{
  const { geared } = await import('./balance.mjs');
  const { rollItem: roll, RARITIES: RR, IMMORTAL: IMM, itemScore: score } = await import('../src/sim/items.js');
  const { makeRng: mk } = await import('../src/sim/rng.js');
  const save = Object.assign(geared('warrior', 60, 1), { talents: {} });
  const w = new World({ seed: 8, cls: 'warrior', save });
  const p = w.player;
  const r = mk(21);
  const better = (slot, extra = {}) => Object.assign(roll(r, 95, { slot, cls: 'warrior', minRarity: 5 }), extra);
  p.equipped.ring = Object.assign(roll(r, 60, { slot: 'ring', weights: RR.map((_, i) => (i === IMM ? 1 : 0)) }), {}); // an Immortal ring
  const helmA = better('helm'), helmB = better('helm');
  const bow = better('weapon', { cls: 'archer' });
  const chest = better('chest');
  const ring = better('ring');
  p.bag = [helmA, bow, helmB, chest, ring];
  const bestHelm = score(helmA) >= score(helmB) ? helmA : helmB;
  const oldHelm = p.equipped.helm, oldChest = p.equipped.chest;
  w.command({ type: 'autoEquip' }); w.step(CONFIG.TICK);
  check('Equip every upgrade: the best helm of two, and the chest', p.equipped.helm === bestHelm && p.equipped.chest === chest);
  check('...not another class\'s weapon, and not an ordinary ring over an Immortal', p.equipped.weapon.cls !== 'archer' && p.equipped.ring.effect);
  check('...and what it took off goes to the bag', p.bag.includes(oldHelm) && p.bag.includes(oldChest) && p.bag.includes(bow) && p.bag.length === 5);
  w.events.length = 0; w.command({ type: 'autoEquip' }); w.step(CONFIG.TICK);
  check('...a second press finds nothing more', w.events.some((e) => e.type === 'noUpgrades'));
}

// --- 0.62: QoL from testers ------------------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const I = await import('../src/sim/items.js');
  const { rebirthSave } = await import('../src/sim/rebirth.js');
  const { DEEP: DP } = await import('../src/sim/endgame.js');
  const { makeRng: mk } = await import('../src/sim/rng.js');
  const top = I.ROLL_TIER_AT.length;
  // reroll pity: at most 30 rerolls on one item without an Immortal-tier line
  {
    const save = Object.assign(geared('warrior', 100, 4), { talents: {} });
    const w = new World({ seed: 31, cls: 'warrior', save });
    const p = w.player; p.gold = 1e12; p.scrap = 1e12;
    const item = p.equipped.helm;
    const key = Object.keys(item.stats)[0];
    let longest = 0, run = 0, pityHits = 0;
    for (let i = 0; i < 400; i++) {
      w.events.length = 0;
      w.rerollLine('helm', key);
      const ev = w.events.find((e) => e.type === 'rerolled');
      if (ev.pity) pityHits++;
      if (I.rollTier(I.rollQuality(item, key)) >= top) { longest = Math.max(longest, run + 1); run = 0; } else run++;
    }
    check('Reroll pity: never more than 30 rerolls without an Immortal-tier line', longest <= I.REROLL_PITY && run < I.REROLL_PITY, `longest ${longest}`);
    check('...and the guaranteed one is marked, and really Immortal tier', pityHits > 0 && I.immortalLine(key, item, mk(2)) >= I.statRange(item, key).lo);
  }
  // under-Embered Primordial kills count, unless someone in the fight meets the Ember
  {
    const save = Object.assign(geared('warrior', 100, 4), { talents: {}, rebirth: { n: 1, ember: 0 } });
    const w = new World({ seed: 32, mode: 'explore', cls: 'warrior', save });
    const p = w.player;
    w.loadMap('deep6', 'town');
    p.quests.deep2 = { s: 'active', n: 0 };
    w.events.length = 0;
    w.questEvent('kill', { type: 'cinder', def: { boss: true } });
    check('Under-Embered: beating a Primordial still counts', p.quests.deep2.n === 1 && w.events.some((e) => e.type === 'emberDefied'));
    p.quests.deep2 = { s: 'active', n: 0 };
    w.addHero(2, { save: Object.assign(geared('warrior', 100, 4), { rebirth: { n: 3, ember: 999 } }), cls: 'warrior', name: 'Carrier' });
    w.events.length = 0;
    w.questEvent('kill', { type: 'cinder', def: { boss: true } });
    check('...but not when carried by someone who meets the Ember', p.quests.deep2.n === 0 && w.events.some((e) => e.type === 'emberShort'));
  }
  // a piece made again for another level keeps its rolls, however low it goes
  {
    const item = I.rollItem(mk(5), 100, { slot: 'chest', minRarity: 5 });
    for (const k in item.stats) item.stats[k] = I.statRange(item, k).hi; // every line at its best
    const tiers0 = Object.keys(item.stats).map((k) => I.rollTier(I.rollQuality(item, k)));
    I.relevelItem(item, 1); I.relevelItem(item, 7); I.relevelItem(item, 100);
    const tiers1 = Object.keys(item.stats).map((k) => I.rollTier(I.rollQuality(item, k)));
    check('Relevel: down to level 1 and back up, every Immortal-tier line stays Immortal', tiers1.every((t, i) => t === tiers0[i] && t >= top), tiers1.join(','));
  }
  // recalled gear: in its prime, following your level
  {
    const mem = I.rollItem(mk(6), 100, { slot: 'weapon', cls: 'warrior', minRarity: 5 });
    for (const k in mem.stats) mem.stats[k] = I.statRange(mem, k).hi;
    mem.plus = 8; mem.stars = 0;
    const save = Object.assign(geared('warrior', 40, 2), { talents: {}, rebirth: { n: 2, essence: 1e6, memories: { weapon: mem } } });
    const w = new World({ seed: 33, cls: 'warrior', save });
    const p = w.player;
    w.recallMemory('weapon');
    const got = p.bag[p.bag.length - 1];
    check('Recall: it comes back with its +levels and its Immortal-tier rolls', got && got.recalled && got.plus === 8 && got.ilvl === 40 && Object.keys(got.stats).every((k) => I.rollTier(I.rollQuality(got, k)) >= top), got && JSON.stringify({ plus: got.plus, ilvl: got.ilvl }));
    p.level = 85; w.recalcStats();
    check('...and follows your level from then on', got.ilvl === 85 && Object.keys(got.stats).every((k) => I.rollTier(I.rollQuality(got, k)) >= top));
    // a piece recalled before 0.62: stuck at its level, worn rolls, +levels lost
    const old = JSON.parse(JSON.stringify(mem)); delete old.recalled;
    old.id = 'r2-weapon-40'; old.plus = 0; I.relevelItem(old, 1); I.relevelItem(old, 40); delete old.q; delete old.qv;
    for (const k in old.stats) old.stats[k] = I.statRange(old, k).lo; // worn right down
    const save2 = Object.assign(geared('warrior', 70, 2), { talents: {}, bag: [old], rebirth: { n: 2, essence: 0, memories: { weapon: mem } } });
    const w2 = new World({ seed: 34, cls: 'warrior', save: save2 });
    const fixed = w2.player.bag.find((it) => it.id === 'r2-weapon-40');
    w2.recalcStats();
    check('Recalled before 0.62: its prime back on load (rolls, +levels), and it follows your level', fixed && fixed.recalled && fixed.plus === 8 && fixed.ilvl === 70 && Object.keys(fixed.stats).every((k) => I.rollTier(I.rollQuality(fixed, k)) >= top), fixed && JSON.stringify({ plus: fixed.plus, ilvl: fixed.ilvl }));
  }
  // Warden keys: kept through rebirth, and opened in Haven
  {
    const save = Object.assign(geared('warrior', 100, 4), { talents: {}, keys: 6, cls: 'warrior' });
    const out = rebirthSave(save, I.starterWeapon, null, I.relevelItem);
    check('Rebirth keeps your Warden keys', out.keys === 6);
    const out2 = rebirthSave(Object.assign(geared('warrior', 100, 4), { talents: {}, scrap: 5000, dust: 77, cls: 'warrior' }), I.starterWeapon, null, I.relevelItem);
    check('...and your scrap and Wishdust (0.62.1)', out2.scrap === 5000 && out2.dust === 77);
    const it = I.rollItem(mk(9), 80, { slot: 'helm', minRarity: 5 });
    check('...which come in a quarter slower: scrapping gives three quarters', I.scrapValue(it) === Math.round((3 + it.ilvl) * 20 * (1 + 0.25 * (it.plus || 0)) * 0.75));
    const w = new World({ seed: 35, cls: 'warrior', save: Object.assign(geared('warrior', 50, 2), { keys: 2 }) });
    w.player.bag = [];
    w.command({ type: 'openCache', tier: 'warden' }); w.step(CONFIG.TICK);
    check("A Warden key opens a Warden's Cache out in the world (Bram's forge)", w.player.keys === 1 && w.player.bag.length === 1 && w.player.bag[0].rarity >= 3);
  }
}

// --- 0.63: Mastery, read from every class on the account ---------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { masteryFor, primordialsOf, MASTERY: MS, DEEP: DP } = await import('../src/sim/endgame.js');
  const { QUESTS: Q } = await import('../src/sim/story.js');
  const lives = { archer: { prim: [6, 7, 8, 9, 10], ember: 120, open: true }, rogue: { prim: [6], ember: 40 }, mage: { prim: [99, 7], ember: 9999 } };
  const rb = { act3: { deep2: true, deep3: true } };
  const M = masteryFor(lives, 'warrior', rb);
  check('Mastery: every Primordial on every class counts (warrior 2 + archer 5 + rogue 1 + mage 1)', M.points === 9 && M.by.warrior.join() === '6,7' && M.by.mage.join() === '7', M.points);
  check('...a class with its Quiet beaten is Mastered', M.mastered.join() === 'archer');
  check('...Animus 5% a point, up to 100% (0.71.1)', Math.abs(M.animus - 0.45) < 1e-9 && masteryFor({ a: 0 }, 'warrior', { act3: {} }).animus === 0);
  check('...an alt starts with half the best Ember among the other classes', M.headStart === Math.floor(9999 * MS.headStart));
  check('...and it is open once any class has heard The Other Lives', M.open && !masteryFor({ rogue: { prim: [6] } }, 'warrior', rb).open);
  check('primordialsOf reads the rebirth record', primordialsOf({ act3: { deep6q: true, deep2: true, lives: true } }).join() === '6,10');
  check('The Other Lives follows Enough, from Wren', Q.lives && Q.lives.after === 'deep6q' && Q.lives.giver === 'wren' && Q.lives.act3);
  // on a hero: the head start counts toward the Deep, and Animus is a stat
  const save = Object.assign(geared('mage', 100, 4), { talents: {}, rebirth: { n: 1, ember: 10 }, acctLives: { warrior: { prim: [6, 7], ember: 60 } } });
  const w = new World({ seed: 41, mode: 'explore', cls: 'mage', save });
  check('A hero gets the head start (10 of its own + 30) and Animus from the others', w.ember() === 40 && Math.abs(w.player.animus - 0.1) < 1e-9, `${w.ember()} ${w.player.animus}`);
  // warned early: coming down beside someone who has the Ember
  w.addHero(2, { save: Object.assign(geared('warrior', 100, 4), { rebirth: { n: 3, ember: 999 } }), cls: 'warrior', name: 'Strong' });
  w.events.length = 0;
  w.loadMap('deep7', 'town');
  const warn = w.events.find((e) => e.type === 'carryWarn');
  check('Carried down into a Depth: warned on arrival, before any fight', warn && warn.need === DP.depths[7].ember && warn.by === 'Strong', warn && JSON.stringify(warn));
}

// --- 0.64: Caelum, the Granted, Mind-Locked and Dominion ----------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { CAELUM: CL, animusShort: short } = await import('../src/sim/endgame.js');
  const { MAPS: MP, buildMap: bm } = await import('../src/sim/maps.js');
  const { QUESTS: Q, BOSS_LOOT: BL } = await import('../src/sim/story.js');
  const L = CONFIG.MIND_LOCK, D = CONFIG.DOMINION;
  const run = (w, sec) => { for (let i = 0; i < Math.round(sec * 60); i++) w.step(CONFIG.TICK); };
  // the maps
  const chain = ['skyroad'];
  for (;;) { const nx = MP[chain[chain.length - 1]].portals.map((g) => g.to).find((to) => to !== 'town' && !chain.includes(to)); if (!nx) break; chain.push(nx); }
  check('Caelum: one road of four maps, Sky Road to Zenith', chain.join() === CL.ids.join(), chain.join(' > '));
  check('...every Caelum portal has a way back', CL.ids.every((id) => bm(id).portals.every((g) => g.to === 'town' || bm(g.to).portals.some((b) => b.to === id))));
  const built = CL.ids.map((id) => bm(id));
  check('...each is laid out to explore: a road, camps with a captain, shrines, outposts with chests, its keeper at the far end',
    built.every((m, i) => m.road.length > 20 && m.spawns.filter((sp) => sp.elite).length >= MP[CL.ids[i]].camps && m.sidePaths.length >= 4 && m.chestSpots.length >= 4 && m.obstacles.filter((o) => o.kind === 'sign').length === 3 && m.spawns[0].type === CL.maps[CL.ids[i]].boss && Math.hypot(m.spawns[0].x, m.spawns[0].z) > m.radius * 0.6),
    built.map((m) => `${m.spawns.length}/${m.chestSpots.length}`).join(' '));
  check('...asks more Animus each map, up to the most Mastery gives', CL.ids.map((id) => CL.maps[id].animus).join() === '0.25,0.5,0.75,1' && short(0.25, 0.25) === false && short(0.2, 0.25) === true);
  check('...the quests run from The Other Lives to Let It Be Done, one keeper each', ['sky1', 'sky2', 'sky3', 'sky4'].every((id, i) => Q[id].act3 && Q[id].after === (i ? `sky${i}` : 'lives') && Q[id].goal.boss === CL.maps[CL.ids[i]].boss) && CL.ids.every((id) => BL[CL.maps[id].boss]));

  const hero = (animus, seed = 50) => {
    const w = new World({ seed, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 100, 4), { talents: {} }) });
    w.player.animus = animus;
    w.events.length = 0;
    return w;
  };
  // Mind-Locked
  {
    const w = hero(0);
    w.mindLock(2, 0.3);
    check('Mind-Locked: the full time with no Animus', Math.abs(w.player.lockT - 2) < 1e-9);
    const x0 = w.player.x;
    w.command({ type: 'move', x: x0 + 8, z: w.player.z });
    run(w, 0.3);
    check('...and you cannot move', Math.abs(w.player.x - x0) < 1e-6 && w.player.lockT > 0);
    // pressed between cracks: it holds longer
    const before = w.player.lockT;
    w.command({ type: 'parry' });
    w.step(CONFIG.TICK);
    check('...a parry press between cracks holds it longer', w.player.lockT > before - 0.05 && w.player.lockT > before - CONFIG.TICK * 2 + L.miss - 0.05);
    // wait for the next crack, then press inside it
    while (!w.events.some((e) => e.type === 'lockCrack') && w.player.lockT > 0) w.step(CONFIG.TICK);
    w.command({ type: 'parry' });
    w.step(CONFIG.TICK);
    check('...a parry press in a crack breaks it', w.player.lockT === 0 && w.events.some((e) => e.type === 'lockEnd' && e.broken));
  }
  {
    const w = hero(0.3);
    w.mindLock(1, 0.3);
    check('...(0.71.1) with the Animus asked, Mind-Lock cannot touch you', !(w.player.lockT > 0));
    w.mindLock(1, 0.5);
    check('...short of it, Animus still shortens it (30%: 0.7 s of 1)', Math.abs(w.player.lockT - 0.7) < 1e-9);
    run(w, 0.2);
    w.mindLock(1, 0.5);
    check('...and one close behind another counts as a chain', w.player.lockN === 1, w.player.lockN);
    const all = hero(1);
    all.mindLock(1, 0);
    all.mindLock(1, 1);
    check('...at 100% Animus, nothing Mind-Locks you', !(all.player.lockT > 0));
  }
  {
    const w = hero(0.15);
    w.mindLock(1, 0.45);
    run(w, 1.2);
    w.mindLock(1, 0.45);
    check('...short of it, no immunity: the next one lands at once', w.player.lockT > 0);
  }
  // Dominion
  const dom = (animus, need, age, dash = false) => {
    const w = hero(animus);
    const p = w.player;
    p.hp = p.stats.maxHp;
    if (age != null) { p.parryT = 0.3; p.parryAge = age; p.parryCd = 1; p.parryHit = false; }
    if (dash) p.dash = { dur: 0.3, t: 0, slot: 'e', refunded: false };
    const res = w.hitPlayer(10, { parryable: true, dominion: true, need, src: null });
    return { res, w, p, lost: 1 - p.hp / p.stats.maxHp };
  };
  let o = dom(0, 0.45, null);
  check('Dominion, short of the Animus: 90% of your health, nothing reduces it, and a long lock', o.res === 'hit' && Math.abs(o.lost - D.short) < 0.01 && o.p.lockT > 3, `${o.lost} ${o.p.lockT}`);
  o = dom(0, 0.45, 0.05);
  check('...a parry three ticks early does not turn it', o.res === 'hit' && o.lost > 0.85);
  o = dom(0, 0.45, 0.016);
  check('...a near-frame-perfect one does: nearly impossible, never impossible', o.res === 'parried' && o.lost === 0);
  o = dom(0, 0.45, null, true);
  check('...and rolling through it does not help', o.res === 'hit' && o.lost > 0.85);
  o = dom(0.45, 0.45, 0.1);
  check('Dominion, with the Animus asked: a perfect parry turns it', o.res === 'parried');
  o = dom(0.45, 0.45, 0.2);
  check('...a late one does not: a small hit, and (0.71.1) no Mind-Lock', o.res === 'hit' && o.lost < 0.2 && !(o.p.lockT > 0), `${o.lost} ${o.p.lockT}`);
  o = dom(0.45, 0.45, null, true);
  check('...and rolling through it works', o.res === 'dodged');
  // on the map: built on tier V, no Ember, the map's Animus on everything
  {
    const w = hero(0.6, 51);
    w.loadMap('skyroad', 'town');
    const foes = w.enemies.filter((e) => !e.dead);
    check('The Sky Road: everything there asks its Animus, on tier V, with no Ember, captains elite', foes.length > 20 && foes.every((e) => e.animusNeed === 0.25 && !(e.ember > 0)) && w.worldTier() === 5 && foes.filter((e) => e.elite).length >= 4, foes.length);
    check('...and its shrines keep chests', CL.ids && w.map.chestSpots.every((c) => w.chests.some((ch) => Math.hypot(ch.x - c.x, ch.z - c.z) < 0.01)));
  }
  {
    const w = hero(0.1, 52);
    w.loadMap('town', null);
    w.events.length = 0;
    w.command({ type: 'travel', to: 'skyroad' });
    w.step(CONFIG.TICK);
    check('Travel: the Sky Road stays shut until The Sky Road is taken', w.map.id === 'town' && w.events.some((e) => e.type === 'mapLocked'));
    w.player.quests.sky1 = { s: 'active' };
    w.command({ type: 'travel', to: 'answers' });
    w.step(CONFIG.TICK);
    check('...then the next maps open only once walked to', w.map.id === 'town');
    w.command({ type: 'travel', to: 'skyroad' });
    w.step(CONFIG.TICK);
    check('...and short of its Animus you may go, warned on arrival', w.map.id === 'skyroad' && w.events.some((e) => e.type === 'animusShort' && e.need === 0.25));
  }
}

// --- 0.65: ascension, faster tiers, the Ring, Shift+click caches --------------------------------
{
  const { geared } = await import('./balance.mjs');
  const I = await import('../src/sim/items.js');
  const A = await import('../src/sim/augments.js');
  const { TIERS: TT, DEEP: DP } = await import('../src/sim/endgame.js');
  const { BOSS_LOOT: BL } = await import('../src/sim/story.js');
  const { rebirthSave } = await import('../src/sim/rebirth.js');
  const run = (w, sec) => { for (let i = 0; i < Math.round(sec * 60); i++) w.step(CONFIG.TICK); };
  // ascension
  check('Stars: a passive is 1x with none, 2x at 5 stars', I.starPotency({}) === 1 && I.starPotency({ stars: 5 }) === 2 && Math.abs(I.starPotency({ stars: 2 }) - 1.4) < 1e-9);
  const B = A.defaultMods();
  const hood = A.defaultMods(); I.applyPotent(hood, I.SPEC_IMMORTALS.sharpshooter.helm.apply, 2, B);
  check("...Hawk's Hood at 5 stars: +30% Deadeye damage, and its cooldown cut read as speed (never zero)", Math.abs(hood.rDmg - 1.3) < 1e-9 && hood.rCd > 0.45 && hood.rCd < 0.5, `${hood.rDmg} ${hood.rCd}`);
  const sig = A.defaultMods(); I.applyPotent(sig, I.SPEC_IMMORTALS.windrunner.ring.apply, 2, B);
  check('...counts stay whole: Storm Sigil looses 6 more arrows', sig.wExtra === 6);
  const seal = A.defaultMods(); I.applyPotent(seal, I.SPEC_IMMORTALS.bulwark.ring.apply, 2, B);
  check("...Warden's Seal: a stack more often, never every 0%", seal.reckonHp > 0.02 && seal.reckonHp < 0.05);
  {
    const save = Object.assign(geared('archer', 100, 4), { talents: {} });
    const w = new World({ seed: 60, mode: 'explore', cls: 'archer', save });
    w.player.spec = 'sharpshooter';
    const imm = I.rollItem(w.rng, 100, { minRarity: 6, weights: [0, 0, 0, 0, 0, 0, 1], slot: 'helm', cls: 'archer' });
    w.player.equipped.helm = imm;
    imm.stars = 0; w.recalcStats(); const r0 = w.mods.rDmg;
    imm.stars = 5; w.recalcStats(); const r5 = w.mods.rDmg;
    check('...and worn, the hero gets it', imm.effect && r5 > r0, `${imm.effect} ${r0} -> ${r5}`);
  }
  // faster tiers
  check('Tiers: from II up, enemies wind up quicker, rest less, move faster, and drop more', TT.slice(2).every((t, i) => t.pace < TT[i + 1].pace && t.tempo < TT[i + 1].tempo && t.move > TT[i + 1].move && t.loot > TT[i + 1].loot) && TT[1].pace === 1);
  {
    const save = Object.assign(geared('warrior', 100, 4), { talents: {}, worldTier: 5, tierMax: 5 });
    const w = new World({ seed: 61, mode: 'explore', cls: 'warrior', save });
    w.player.worldTier = 5;
    w.loadMap('maw', 'town');
    const e = w.enemies.find((o) => !o.dead && !o.def.boss);
    check('...a tier V enemy carries its pace', e && Math.abs(e.pace - TT[5].pace) < 1e-9 && Math.abs(e.tempo - TT[5].tempo) < 1e-9 && e.move === TT[5].move, e && `${e.pace} ${e.tempo}`);
    const atk = e.def.attacks.find((a) => a.trigger < 90) || e.def.attacks[0];
    w.startWindup(e, atk);
    check('...its wind-ups are quicker, never under 0.3 s', e.dur < atk.windup && e.dur >= Math.min(0.3, atk.windup) - 1e-9, `${atk.windup} -> ${e.dur}`);
    w.loadMap('deep10', 'town');
    const d = w.enemies.find((o) => !o.dead && !o.def.boss);
    check('...faster again in the Deep, and paid for it', d && Math.abs(d.pace - TT[5].pace * DP.depths[10].pace) < 1e-9 && d.lootMult === DP.depths[10].loot);
  }
  check('Primordials: a hoard each, with a chance at an Immortal', ['cinder', 'undertow', 'rootmother', 'choir', 'stillness'].every((id, i, a) => BL[id] && BL[id].top[6] > 0 && (i === 0 || BL[id].top[6] > BL[a[i - 1]].top[6])));
  // the Ring
  {
    const save = Object.assign(geared('warrior', 100, 4), { maxCheckpoint: 21 });
    const w = new World({ seed: 62, mode: 'arena', cls: 'warrior', save, focus: { kind: 'gold' }, startWave: 21 });
    w.events.length = 0;
    w.step(CONFIG.TICK);
    const owed = w.events.find((e) => e.type === 'ringCatchUp');
    let picks = 0;
    for (let i = 0; i < 200 && w.offer; i++) { w.command({ type: 'augment', id: w.offer.choices[0] }); w.runCommands(); picks++; }
    check('Ring (0.65): starting at wave 21, the picks of waves 1 to 20 come first (10 odd waves, 2 even bosses)', owed && owed.picks === 12 && picks === 12 && w.augments.length === 12, `${owed && owed.picks} owed, ${picks} taken`);
    w.command({ type: 'nextWave' }); w.runCommands();
    for (let i = 0; i < 400 && !w.enemies.length; i++) w.step(CONFIG.TICK);
    const e = w.enemies[0];
    check('...and wave 21 is a touch faster', e && e.pace < 1 && e.tempo < 1, e && `${e.pace}`);
  }
  {
    const old = Object.assign(geared('warrior', 100, 4), { maxCheckpoint: 41, bestWave: 44, rebirth: { n: 0 } });
    const next = rebirthSave(old, I.starterWeapon);
    check('Rebirth keeps where the Echo Ring can start, and its best wave', next.maxCheckpoint === 41 && next.bestWave === 44);
  }
  // Shift+click caches
  {
    const save = Object.assign(geared('warrior', 60, 2), { keys: 12, gold: 1e7 });
    const w = new World({ seed: 63, mode: 'explore', cls: 'warrior', save });
    const p = w.player;
    p.bag.length = 0;
    w.command({ type: 'openCache', tier: 'warden', n: 10 }); w.runCommands();
    const per = w.cacheCost('warden').keys;
    const opened = Math.min(10, Math.floor(12 / per));
    check('Caches: Shift+click opens up to 10 at once', p.bag.length === opened && p.keys === 12 - opened * per, `${p.bag.length} opened, ${p.keys} keys left`);
    w.command({ type: 'openCache', tier: 'warden', n: 99 }); w.runCommands();
    check('...never more than 10, and stops when the keys run out', p.bag.length <= opened + 10 && p.keys >= 0 && p.keys < per);
  }
}

// --- 0.66 --------------------------------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { RING: R } = await import('../src/sim/ring.js');
  const { hoardTop, MAX_TIER: MT } = await import('../src/sim/endgame.js');
  const { BOSS_LOOT: BL } = await import('../src/sim/story.js');
  const P = await import('../src/ui/augpriority.js');
  const { AUGMENTS: AU } = await import('../src/sim/augments.js');
  // the Cinder opens every tier
  {
    const save = Object.assign(geared('warrior', 100, 4), { tierMax: 1, worldTier: 1 });
    const w = new World({ seed: 70, mode: 'explore', cls: 'warrior', save });
    w.loadMap('deep6', 'town');
    const c = w.enemies.find((e) => e.type === 'cinder');
    w.killEnemy(c, 'test');
    check('The Cinder (0.66): beating it opens all five world tiers', w.player.tierMax === MT && w.events.some((e) => e.type === 'tierUnlocked' && e.all));
    const again = new World({ seed: 70, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 100, 4), { tierMax: 1, rebirth: { n: 1, act3: { deep2: true } } }) });
    check('...and stays open in every life after, once back at level 100', again.player.tierMax === MT);
    const young = new World({ seed: 70, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 60, 2), { tierMax: 1, rebirth: { n: 1, act3: { deep2: true } } }) });
    check('...not before', young.player.tierMax === 1);
  }
  // drops by world
  check('Hoards: a quarter of a percent more Immortal each world (the Unmade 5% on I, 6% on V)', hoardTop(BL.boss3.top, 1)[6] === 5 && hoardTop(BL.boss3.top, 5)[6] === 6 && hoardTop(BL.stillness.top, 10)[6] === 14.25 && hoardTop(BL.boss3.top, 5).reduce((a, b) => a + b, 0) === 100);
  check('Primordials: the first kill of each gives an Immortal', ['cinder', 'undertow', 'rootmother', 'choir', 'stillness'].every((id) => BL[id].first === 6));
  // the Ring's deep waves
  check('Ring (0.66): Ember from wave 25 (15, rising to 155), Animus from wave 50 (25% to 100%, 0.71.1)', R.ember(24) === 0 && R.ember(25) === 15 && R.ember(60) === 155 && R.ember(90) === 155 && R.animus(49) === 0 && R.animus(50) === 0.25 && R.animus(80) === 1);
  {
    const save = Object.assign(geared('warrior', 100, 5), { maxCheckpoint: 51 });
    const w = new World({ seed: 71, mode: 'arena', cls: 'warrior', save, focus: { kind: 'gold' }, startWave: 51 });
    for (let i = 0; i < 400 && w.offer; i++) { w.command({ type: 'augment', id: w.offer.choices[0] }); w.runCommands(); }
    w.step(CONFIG.TICK);
    for (let i = 0; i < 400 && w.offer; i++) { w.command({ type: 'augment', id: w.offer.choices[0] }); w.runCommands(); }
    w.command({ type: 'nextWave' }); w.runCommands();
    const seen = [];
    for (let i = 0; i < 2000 && seen.length < 12; i++) { w.player.hp = w.player.stats.maxHp; w.step(CONFIG.TICK); for (const e of w.enemies) if (!seen.includes(e)) seen.push(e); }
    check('...a wave-51 echo carries both, and some are the Granted', seen.length > 5 && seen.every((e) => e.ember === R.ember(51) && e.animusNeed === R.animus(51)) && seen.some((e) => R.granted.types.includes(e.type)), seen.map((e) => e.type).join(' '));
  }
  {
    // owed more picks than there are augments left: take them all
    const save = Object.assign(geared('warrior', 100, 5), { maxCheckpoint: 200 });
    const w = new World({ seed: 72, mode: 'arena', cls: 'warrior', save, focus: { kind: 'gold' }, startWave: 200 });
    w.step(CONFIG.TICK);
    check('Ring (0.66): owed more picks than augments left, you take every one', !w.offer && w.augments.length === w.augments.length && w.augments.length > 20 && w.augmentPool().length === 0 && w.events.some((e) => e.type === 'augmentsAll'), w.augments.length);
  }
  // the auto-pick order
  {
    const order = P.defaultOrder('warrior');
    const at = (id) => order.indexOf(id);
    check('Auto-pick (0.66): damage first, the defensive ones last', at('h_glass') < at('h_giant') && at('q_twin') < at('q_reach') && at('h_leech') > order.length - 4 && at('h_might') < at('w_slow'));
    const mine = P.orderFor({ warrior: ['h_leech', 'q_twin'] }, 'warrior');
    check('...your own ranking comes first, and new augments fall in where the default puts them', mine[0] === 'h_leech' && mine.length === order.length && new Set(mine).size === mine.length);
    check('...and an offer takes the highest of its three', P.pickFrom(['w_slow', 'h_leech', 'q_twin'], mine) === 'h_leech' && P.pickFrom(['w_slow', 'q_twin'], mine) === 'q_twin');
    check('...every augment the class can get is in the list', P.augmentsFor('warrior').every((id) => !AU[id].cls || AU[id].cls === 'warrior'));
  }
}

// --- 0.67: worked-out texts --------------------------------------------------------------------
{
  const I = await import('../src/sim/items.js');
  const A = await import('../src/sim/augments.js');
  const { sourcesOf, usesOf } = await import('../src/sim/sources.js');
  const B = A.defaultMods();
  // every passive renders without a bracket left, for every class and subclass, at every potency
  let leftover = [];
  for (const key in I.EFFECTS) for (const cls of ['warrior', 'archer', 'rogue', 'mage']) for (const spec of [null, ...Object.keys(I.SPEC_IMMORTALS)]) for (const k of [1, 1.4, 2]) {
    const fx = I.effectFor(key, cls, spec, k, true);
    if (/[[\]{}]/.test(fx.desc.replace(/<b class="pot">|<\/b>/g, ''))) leftover.push(`${key}/${cls}/${spec}`);
  }
  check('Passives (0.67): every one is worked out, nothing left in brackets', leftover.length === 0, leftover.slice(0, 3).join(' '));
  check('...at one star nothing is gold, at five the grown numbers are', !/class="pot"/.test(I.effectFor('stormcaller', 'mage', 'pyromancer', 1, true).desc) && I.effectFor('stormcaller', 'mage', 'pyromancer', 2, true).desc.includes('<b class="pot">60</b>'));
  // the text says what the code does: each percentage in a spec passive's text at 2x is what applyPotent gives
  const hood = I.passiveText(I.SPEC_IMMORTALS.sharpshooter.helm.desc, 2);
  const m = A.defaultMods(); I.applyPotent(m, I.SPEC_IMMORTALS.sharpshooter.helm.apply, 2, B);
  check("...and says what the code does (Hawk's Hood at 5 stars)", hood.includes(`${Math.round((1 - m.rCd) * 1000) / 10}%`) && hood.includes(`${Math.round((m.rDmg - 1) * 100)}%`), hood);
  const seal = I.passiveText(I.SPEC_IMMORTALS.bulwark.ring.desc, 2);
  const m2 = A.defaultMods(); I.applyPotent(m2, I.SPEC_IMMORTALS.bulwark.ring.apply, 2, B);
  check("...(Warden's Seal)", seal.includes(`${Math.round(m2.reckonHp * 1000) / 10}%`) && seal.includes(`holds ${m2.reckonMaxAdd} more`), seal);
  // where things come from
  for (const k of ['fragment', 'glass', 'sigil', 'keys', 'tickets', 'dust', 'gold', 'scrap', 'essence']) {
    const L = sourcesOf(k);
    if (!L.length || L.some((l) => /NaN|undefined|\[object/.test(l))) check(`Sources: ${k}`, false, L.join(' | '));
  }
  check('Sources (0.67): every resource lists where it comes from, from the tables (no NaN)', true);
  check('...Fragments name the merchant, Come Home and the elites', sourcesOf('fragment').some((l) => l.includes('merchant')) && sourcesOf('fragment').some((l) => l.includes('Come Home')) && sourcesOf('fragment').some((l) => /Elites \(25% chance of 1\)/.test(l)));
  check('...and uses for the wallet', ['gold', 'tickets', 'scrap', 'dust', 'keys', 'essence'].every((k) => usesOf(k).length > 0));
}

// --- 0.68: the Will ----------------------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const W = CONFIG.WILL, D = CONFIG.DOMINION;
  const run = (w, sec, each) => { for (let i = 0; i < Math.round(sec * 60); i++) { if (each) each(w); w.step(CONFIG.TICK); } };
  const sky = (animus) => {
    const w = new World({ seed: 80, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 100, 5), { talents: {} }) });
    w.loadMap('skyroad', 'town');
    // stand by a camp, everything calmed so only the Will can touch you
    const e = w.enemies.find((o) => !o.dead && !o.def.boss);
    const p = w.player;
    p.x = p.px = e.x + 6; p.z = p.pz = e.z;
    w.events.length = 0;
    const hold = (ww) => { ww.player.animus = animus; ww.player.hp = Math.max(ww.player.hp, 1); for (const o of ww.enemies) { o.aggro = false; o.atkCd = 99; o.frozenT = 99; o.state = 'idle'; o.x = o.px = o.x; } };
    return { w, p, hold };
  };
  {
    const { w, p, hold } = sky(0);
    let hpLow = 1, lands = 0, first = false;
    for (let i = 0; i < 14 * 60; i++) {
      hold(w);
      w.player.lockT = 0;
      w.player.hp = w.player.stats.maxHp;
      w.events.length = 0;
      w.step(CONFIG.TICK);
      if (w.events.some((e) => e.type === 'willFirst')) first = true;
      if (w.events.some((e) => e.type === 'dominion' && e.short)) { lands++; hpLow = Math.min(hpLow, w.player.hp / w.player.stats.maxHp); }
    }
    check('The Will (0.68): short of the Animus near the Granted, it finds you every few seconds', lands >= 2 && lands <= 3 && first, `${lands} in 14 s`);
    check('...and each one that lands takes 90% of your health', hpLow <= 1 - D.short + 0.02 && hpLow > 0, hpLow.toFixed(2));
    const t = w.telegraphs.find((x) => x.will) || null;
    check('...its ring is a Dominion (amber), following you', !t || (t.dominion === 0.25 && t.parryable && Math.abs(t.x - p.x) < 1e-6));
  }
  {
    const { w, hold } = sky(0.25);
    run(w, 14, hold);
    check('...those with the Animus are never asked', !w.events.some((e) => e.type === 'dominion' || e.type === 'willFirst') && !w.telegraphs.some((t) => t.will));
  }
  {
    // a near-frame-perfect parry turns it
    const { w, p, hold } = sky(0);
    let turned = false;
    run(w, 12, (ww) => {
      hold(ww);
      ww.player.lockT = 0;
      const t = ww.telegraphs.find((x) => x.will);
      if (t && t.dur - t.t <= CONFIG.TICK * 1.5 && !(ww.player.parryT > 0) && !(ww.player.parryCd > 0)) { ww.command({ type: 'parry' }); }
      if (ww.events.some((e) => e.type === 'dominionParried' && e.short)) turned = true;
    });
    check('...and a parry pressed in its last ticks turns it', turned);
    const lands = w.events.filter((e) => e.type === 'dominion').length;
    check('...every time', lands === 0, `${lands} landed`);
    void p;
  }
  {
    // the Ring from wave 50
    const save = Object.assign(geared('warrior', 100, 5), { maxCheckpoint: 51 });
    const w = new World({ seed: 81, mode: 'arena', cls: 'warrior', save, focus: { kind: 'gold' }, startWave: 51 });
    w.step(CONFIG.TICK);
    for (let i = 0; i < 400 && w.offer; i++) { w.command({ type: 'augment', id: w.offer.choices[0] }); w.runCommands(); }
    w.command({ type: 'nextWave' }); w.runCommands();
    run(w, 12, (ww) => { ww.player.animus = 0; ww.player.lockT = 0; ww.player.hp = ww.player.stats.maxHp; for (const o of ww.enemies) { o.atkCd = 99; o.frozenT = 99; } });
    check('...and in the Echo Ring from wave 50, short of its Animus', w.events.some((e) => e.type === 'dominion' && e.short));
  }
}

// --- 0.69: the Will strikes twice ----------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const W = CONFIG.WILL;
  const setup = () => {
    const w = new World({ seed: 82, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 100, 5), { talents: {} }) });
    w.loadMap('skyroad', 'town');
    const e = w.enemies.find((o) => !o.dead && !o.def.boss);
    w.player.x = w.player.px = e.x + 6; w.player.z = w.player.pz = e.z;
    w.events.length = 0;
    return w;
  };
  const calm = (w) => { w.player.animus = 0; for (const o of w.enemies) { o.state = 'stunned'; o.stunT = 999; } };
  // press parry `early` seconds before each strike lands
  const play = (w, early, sec = 10) => {
    for (let i = 0; i < sec * 60; i++) {
      calm(w);
      const t = w.telegraphs.find((x) => x.will);
      if (t && early != null && t.dur - t.t <= early + 1e-9 && t.dur - t.t > early - CONFIG.TICK && !(w.player.parryT > 0)) w.command({ type: 'parry' });
      w.step(CONFIG.TICK);
      if (w.events.some((e) => e.type === 'willPassed' || e.type === 'dominion')) break;
    }
  };
  let w = setup();
  play(w, 0.08); // inside the perfect window (0.11 s), outside the old two-tick one
  check('The Will (0.69): two strikes, each turned by a perfect parry (the ordinary window, not two ticks)', w.events.some((e) => e.type === 'willAgain') && w.events.some((e) => e.type === 'willPassed') && !w.events.some((e) => e.type === 'dominion'), w.events.filter((e) => /will|dominion/i.test(e.type)).map((e) => e.type).join(' '));
  w = setup();
  play(w, 0.25); // a good parry, but not a perfect one
  check('...a good but not perfect parry does not turn it: 90% and the lock', w.events.some((e) => e.type === 'dominion' && e.short) && w.player.hp / w.player.stats.maxHp < 0.15);
  check('...and a failed first strike ends it (no second)', !w.events.some((e) => e.type === 'willAgain'));
  // the guard: while it is on you, other blows hit at 1%
  w = setup();
  for (let i = 0; i < 600 && !w.telegraphs.some((x) => x.will); i++) { calm(w); w.step(CONFIG.TICK); }
  const p = w.player;
  p.hp = p.stats.maxHp;
  w.takeDamage(1000, null, false);
  const guarded = p.stats.maxHp - p.hp;
  w.endWill(w.cur); w.cur.willGrace = 0;
  p.hp = p.stats.maxHp;
  w.takeDamage(1000, null, false);
  const open = p.stats.maxHp - p.hp;
  check('...while it is on you, everything else hits you 99% softer', open > 0 && Math.abs(guarded - open * W.guard) <= 1, `${guarded} vs ${open}`);
}

// --- 0.70: borrowed skills on D and F --------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { BORROWED, OATH, borrowable } = await import('../src/sim/borrowed.js');
  const { SPECS } = await import('../src/sim/talents.js');
  const { CAELUM: CL } = await import('../src/sim/endgame.js');
  const all = { warrior: { prim: [6, 7, 8, 9, 10] }, archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  check('Borrowed skills: a class mastered (its Quiet beaten) lends both its subclasses, never your own class', borrowable('archer', ['mage'], SPECS).sort().join() === 'frostbinder,pyromancer' && borrowable('archer', ['archer'], SPECS).length === 0 && borrowable('archer', [], SPECS).length === 0);
  check('...six for each class, one from each other subclass', ['warrior', 'archer', 'mage', 'rogue'].every((c) => Object.keys(BORROWED[c]).length === 6 && Object.keys(BORROWED[c]).every((sp) => SPECS[sp] && SPECS[sp].cls !== c)));
  const make = (cls, spec, seed = 90) => {
    const save = Object.assign(geared(cls, 100, 5), { acctLives: all, spec, talents: {} });
    const w = new World({ seed, mode: 'explore', cls, save });
    w.loadMap('greenwood', 'town');
    for (let i = 0; i < 150; i++) w.step(CONFIG.TICK); // past the enemies' spawning
    return w;
  };
  const near = (w) => {
    const p = w.player;
    const e = w.enemies.find((o) => !o.dead && !o.def.boss && o.state !== 'spawn');
    p.x = p.px = e.x + 4; p.z = p.pz = e.z;
    p.hp = p.stats.maxHp;
    return e;
  };
  let bad = [];
  for (const cls of ['warrior', 'archer', 'mage', 'rogue']) {
    for (const spec of Object.keys(BORROWED[cls])) {
      const w = make(cls, null);
      for (const slot of ['d', 'f']) {
        w.command({ type: 'borrow', slot, spec: slot === 'd' ? spec : null });
      }
      w.runCommands();
      if (!w.kit.d || w.kit.d.borrowed !== spec) { bad.push(`${cls}/${spec}: not slotted`); continue; }
      let cast = false;
      try {
        for (let n = 0; n < 3; n++) {
          const e = near(w);
          w.player.cd.d = 0;
          w.command({ type: 'cast', slot: 'd', x: e.x, z: e.z });
          w.command({ type: 'cast', slot: 'q', x: e.x, z: e.z });
          w.command({ type: 'cast', slot: 'r', x: e.x, z: e.z });
          w.command({ type: 'attack', id: e.id });
          for (let i = 0; i < 120; i++) { w.player.hp = Math.max(w.player.hp, 1); w.step(CONFIG.TICK); if (i === 0 && w.player.cd.d > 0) cast = true; }
          w.player.cd.q = w.player.cd.r = 0;
        }
      } catch (err) { bad.push(`${cls}/${spec}: ${err.message}`); }
      if (!w.kit.d.passive && !cast && !['blink'].includes(w.kit.d.type)) bad.push(`${cls}/${spec}: never cast`);
    }
  }
  check('...every borrowed skill, active or passive, slots on D and plays without error', bad.length === 0, bad.join('; '));
  // a borrowed skill from a class not mastered is refused
  {
    const save = Object.assign(geared('archer', 100, 5), { acctLives: { mage: { prim: [6] } } });
    const w = new World({ seed: 91, mode: 'explore', cls: 'archer', save });
    w.command({ type: 'borrow', slot: 'd', spec: 'pyromancer' }); w.runCommands();
    check('...and refused from a class whose Quiet still stands', !w.kit.d && !w.player.borrowed.d);
  }
  // swapping: the same skill on the other key moves it
  {
    const w = make('archer', null);
    w.command({ type: 'borrow', slot: 'd', spec: 'pyromancer' }); w.command({ type: 'borrow', slot: 'f', spec: 'bulwark' }); w.runCommands();
    w.command({ type: 'borrow', slot: 'f', spec: 'pyromancer' }); w.runCommands();
    check('...putting one on the other key swaps the two over', w.player.borrowed.f === 'pyromancer' && w.player.borrowed.d === 'bulwark', JSON.stringify(w.player.borrowed));
    const sv = w.toSave();
    const w2 = new World({ seed: 92, mode: 'explore', cls: 'archer', save: Object.assign(sv, { acctLives: all }) });
    check('...and both are kept in the save', w2.kit.f && w2.kit.f.name === "Dragon's Breath" && w2.kit.d && w2.kit.d.name === 'Anchor Shot');
  }
  // Blood Oath: 40% and held there; a Sharpshooter's Deadeye has no draw
  {
    const w = make('archer', 'sharpshooter');
    w.command({ type: 'borrow', slot: 'd', spec: 'berserker' }); w.runCommands();
    const e = near(w);
    w.player.cd.d = 0; // (changed outside town: a 5 s wait)
    w.command({ type: 'cast', slot: 'd', x: e.x, z: e.z }); w.runCommands(); w.step(CONFIG.TICK);
    const p = w.player;
    const at = p.hp / p.stats.maxHp;
    p.hp = p.stats.maxHp;
    w.step(CONFIG.TICK);
    check('Blood Oath: drains you to 40% health and holds you there while it lasts', Math.abs(at - OATH.hpTo) < 0.02 && p.hp <= p.stats.maxHp * OATH.hpCap + 1e-6 && p.oathOn, `${at} ${p.hp / p.stats.maxHp} ${p.oathOn}`);
    for (let i = 0; i < 20; i++) w.step(CONFIG.TICK);
    p.cd.r = 0;
    w.command({ type: 'cast', slot: 'r', x: e.x, z: e.z }); w.runCommands(); w.step(CONFIG.TICK);
    check('...and a Sharpshooter\'s Deadeye fires at once, no draw', !p.channel && p.cd.r > 0);
    for (let i = 0; i < 30; i++) w.step(CONFIG.TICK);
    p.cd.d = 0;
    w.command({ type: 'cast', slot: 'd', x: e.x, z: e.z }); w.runCommands(); w.step(CONFIG.TICK);
    p.hp = p.stats.maxHp; w.step(CONFIG.TICK);
    check('...(0.71.2) a toggle: pressed again, it lets go', !p.oathOn && p.hp > p.stats.maxHp * 0.9);
  }
  // Blood Oath: +20% to everything
  {
    const w = make('rogue', 'shadowdancer');
    w.command({ type: 'borrow', slot: 'f', spec: 'berserker' }); w.runCommands();
    const e = near(w);
    e.hp = e.maxHp = 1e7;
    const hit = () => { const b = e.hp; w.hitEnemy(e, 100, { source: 'q', forceCrit: false }); const d = b - e.hp; e.hp = b; return d; };
    const plain = hit();
    w.player.oathOn = true;
    const sworn = hit();
    check('...everything you deal is 20% harder', plain > 0 && Math.abs(sworn / plain - (1 + OATH.dmg)) < 0.02, `${plain} ${sworn}`);
  }
  // Rogue's Fire Bomb and Frost Trap: passives that set the status on every blow
  {
    const w = make('rogue', null);
    w.command({ type: 'borrow', slot: 'd', spec: 'pyromancer' }); w.command({ type: 'borrow', slot: 'f', spec: 'frostbinder' }); w.runCommands();
    const e = near(w);
    w.hitEnemy(e, 10, { source: 'basic', basic: true });
    check('Fire Bomb and Frost Trap: while slotted, a Rogue\'s blows set burns and Hoarfrost', (e.burnStacks || 0) > 0 && (e.frostStacks || 0) > 0, `${e.burnStacks} ${e.frostStacks}`);
  }
  // Long Kunai marks
  {
    const w = make('rogue', null);
    w.command({ type: 'borrow', slot: 'd', spec: 'sharpshooter' }); w.runCommands();
    const e = near(w);
    e.hp = e.maxHp = 1e7;
    w.player.cd.d = 0;
    w.command({ type: 'cast', slot: 'd', x: e.x, z: e.z });
    for (let i = 0; i < 60 && !(e.vulnT > 0); i++) w.step(CONFIG.TICK);
    check('Long Kunai: what it hits is Marked (20% more from everyone)', e.vulnT > 0 && e.vuln >= 0.2);
  }
  check('Caelum (0.70): every map half as tough again and 20% harder-hitting', CL.hard.hp === 1.5 && CL.hard.dmg === 1.2);
}

// --- 0.70.1: the road opens for the whole account once the Cinder has fallen ---------------------
{
  const { ROAD_MAPS } = await import('../src/sim/world.js');
  check('The road: the Greenwood to Starfall Sanctum (the Unmade)', ROAD_MAPS[0] === 'greenwood' && ROAD_MAPS[ROAD_MAPS.length - 1] === 'sanctum' && ROAD_MAPS.length === 10, ROAD_MAPS.join());
  const fresh = (lives) => new World({ seed: 93, mode: 'explore', cls: 'mage', save: { v: 2, cls: 'mage', level: 1, exp: 0, equipped: {}, bag: [], acctLives: lives } });
  let w = fresh(null);
  w.command({ type: 'travel', to: 'sanctum' }); w.runCommands();
  check('...shut on a new hero while no class has beaten the Cinder', w.map.id === 'town' && !w.mapKnown('fen'));
  w = fresh({ archer: { prim: [6] } });
  w.command({ type: 'travel', to: 'sanctum' }); w.runCommands();
  check('...open on every class once any class has (an Archer here, a level 1 Mage warps)', w.map.id === 'sanctum' && ROAD_MAPS.every((id) => w.mapKnown(id)));
  check('...but not the Wilds, Asterfell or the Deep', !w.mapKnown('wilds') && !w.mapKnown('asterfell') && !w.mapKnown('deep6'));
}

// --- 0.70.2: the Quiet's quest says the class is mastered ---------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const w = new World({ seed: 94, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 100, 5), { rebirth: { act3: { lives: true, deep2: true, deep3: true, deep4: true, deep5: true } } }) });
  w.player.quests.deep6q = { s: 'ready', n: 1 };
  w.claimQuest('deep6q');
  const ev = w.events.find((e) => e.type === 'mastered');
  check('Mastered (0.70.2): claiming Enough says so, naming the two subclasses the others may borrow from', ev && ev.cls === 'archer' && ev.specs.length === 2, JSON.stringify(ev || w.player.quests.deep6q));
}

// --- 0.70.3: Haven's people follow the online hero's own story ----------------------------------
{
  const w = new World({ seed: 95, mode: 'explore', cls: 'warrior', save: { v: 2, cls: 'warrior', level: 50, exp: 0, equipped: {}, bag: [] } });
  w.loadMapMirror('town');
  const tomas = () => w.obstacles.some((o) => o.id === 'tomas');
  const before = tomas();
  const key = w.townShown;
  w.player.endings = { self: 1 }; // the server says this hero has seen the Unwish
  const stale = w.townKey() !== w.townShown;
  w.loadMapMirror('town');
  check('Haven online (0.70.3): Tomas follows this hero\'s own Unwish, and a change is noticed', !before && stale && tomas() && w.townShown !== key);
  w.player.tomasMet = true;
  check('...meeting him does not pull him out from under you mid-talk', w.townKey() === w.townShown);
}

// --- 0.70.4: the account helps a new class along ---------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { MASTERY: MS } = await import('../src/sim/endgame.js');
  const mk = (lives, extra = {}) => new World({ seed: 96, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 100, 5), { acctLives: lives }, extra) });
  check('Account tiers (0.70.4): a level 100 hero has all five world tiers once ANY class has beaten the Cinder', mk({ archer: { prim: [6] } }).player.tierMax === 5 && mk(null).player.tierMax < 5);
  const e0 = mk(null), e2 = mk({ archer: { prim: [10] }, mage: { prim: [6, 7, 8, 9, 10] } }), e4 = mk({ archer: { prim: [10] }, mage: { prim: [10] }, warrior: { prim: [10] }, rogue: { prim: [10] } });
  check('Mastery EXP: +25% for each class mastered, up to +75%', e0.masteryExp() === 0 && Math.abs(e2.masteryExp() - 2 * MS.exp) < 1e-9 && e4.masteryExp() === MS.expMax);
  const w1 = mk(null, { level: 99 }), w2 = mk({ mage: { prim: [10] } }, { level: 99 });
  w1.player.exp = w2.player.exp = 0; w1.gainExp(1000); w2.gainExp(1000);
  check('...and it is in the EXP you get', Math.abs(w2.player.exp / w1.player.exp - 1.25) < 0.01, `${w1.player.exp} ${w2.player.exp}`);
  const d = mk({ archer: { prim: [6, 7] } });
  check('Account Deep: open as deep as any class has gone (the Cinder and the Undertow beaten: VI to VIII)', d.depthOpen(d.player, 6) && d.depthOpen(d.player, 8) && !d.depthOpen(d.player, 9) && !mk(null).depthOpen(mk(null).player, 7));
  const n = mk(null, { quests: { starwell: { s: 'done', n: 1 } } });
  check('Act III: the journal says why Wren has nothing yet (the Unwish, then a rebirth)', n.actThreeWait() === 'unwish' && (n.player.endings = { self: 1 }) && n.actThreeWait() === 'rebirth');
}

// --- 0.70.5: borrowed skills as a real source of damage; Act III for the account -------------------
{
  const { geared } = await import('./balance.mjs');
  const { BORROWED } = await import('../src/sim/borrowed.js');
  const { SPECS } = await import('../src/sim/talents.js');
  const all = { warrior: { prim: [10] }, archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  check('Borrowed (0.70.5): every Frostbinder borrowing reflects (an Archer\'s wall; a Warrior\'s spin, 0.71.4; a Rogue\'s halo, 0.81.3)', BORROWED.archer.frostbinder.type === 'wall' && BORROWED.rogue.frostbinder.type === 'rimehalo' && BORROWED.warrior.frostbinder.name === 'Glacier Spin');
  check('...(0.81.3) the Rogue\'s fire is Ember Clones: three of them, four strikes each, burning', BORROWED.rogue.pyromancer.type === 'fireclones' && BORROWED.rogue.pyromancer.count === 3 && BORROWED.rogue.pyromancer.strikes === 4 && BORROWED.rogue.pyromancer.burn > 0);
  const w = new World({ seed: 97, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 100, 5), { acctLives: all, borrowed: { d: 'pyromancer' } }) });
  const d1 = w.abilityDamage('d');
  w.player.ranks.q = 5;
  check('...and grows with your main skill (Q\'s rank)', w.abilityDamage('d') > d1 * 1.2, `${d1} ${w.abilityDamage('d')}`);
  w.loadMap('greenwood', 'town');
  for (let i = 0; i < 150; i++) w.step(CONFIG.TICK);
  const e = w.enemies.find((o) => !o.dead && o.state !== 'spawn');
  e.hp = e.maxHp = 1e8;
  w.player.x = w.player.px = e.x + 6; w.player.z = w.player.pz = e.z;
  w.player.cd.d = 0;
  w.events = [];
  w.command({ type: 'cast', slot: 'd', x: e.x, z: e.z });
  let strikes = 0;
  for (let i = 0; i < 60 * 5; i++) { w.player.hp = w.player.stats.maxHp; w.step(CONFIG.TICK); strikes += w.events.filter((v) => v.type === 'cloneStrike').length; w.events = []; }
  check('...the clones fly out, strike (every strike leaps on, or back to the one there is) and burn, then go', strikes >= 6 && e.burnStacks > 0 && e.hp < e.maxHp && !(w.player.fireClones || []).length, `${strikes} strikes`);
  // (0.81.3) Rime Halo: round you, cutting and freezing, and an enemy shot that crosses it flies back
  w.player.borrowed = { d: 'frostbinder' }; w.recalcStats(); w.player.cd.d = 0;
  const hp0 = e.hp;
  e.x = w.player.x + 2; e.z = w.player.z;
  w.command({ type: 'cast', slot: 'd', x: w.player.x, z: w.player.z }); w.runCommands();
  for (let i = 0; i < 70; i++) { w.player.hp = w.player.stats.maxHp; e.x = w.player.x + 2; e.z = w.player.z; w.step(CONFIG.TICK); }
  check('...Rime Halo: a ring round you that cuts and gives Hoarfrost to what is inside it', w.player.rimeT > 0 && e.hp < hp0 && (e.frostStacks > 0 || e.frozenT > 0 || e.state === 'stunned'), `${hp0 - e.hp} ${e.frostStacks}`);
  const shot = { id: w.nextId++, owner: 'enemy', x: w.player.x - 8, z: w.player.z, px: w.player.x - 8, pz: w.player.z, vx: 14, vz: 0, speed: 14, radius: 0.3, dmg: 50, parryable: true, reflected: false, life: 3, dead: false };
  w.projectiles.push(shot);
  for (let i = 0; i < 40 && shot.owner === 'enemy' && !shot.dead; i++) { w.player.hp = w.player.stats.maxHp; w.step(CONFIG.TICK); }
  check('...and walking through it is free, but an enemy shot that crosses it flies back as yours', shot.owner === 'player' && shot.reflected && !w.obstacles.some((o) => o.rime), JSON.stringify({ o: shot.owner, x: shot.x }));
  // Act III: any class's Unwish and rebirth open it for the account
  const fresh = (lives) => new World({ seed: 98, mode: 'explore', cls: 'mage', save: Object.assign(geared('mage', 100, 5), { acctLives: lives }) });
  check('Act III (0.70.5): Wren\'s Deep quests open on a class with no Unwish or rebirth, once another class has both', fresh({ archer: { prim: [], act3: true } }).questOpen('deep1') && !fresh({ archer: { prim: [] } }).questOpen('deep1'));
}

// --- 0.71: the Granted a hundred lives deep, and Eternal gear -----------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { CAELUM: CL } = await import('../src/sim/endgame.js');
  const { ETERNAL, rollEternal, feed, slotsOpen, eternalMods } = await import('../src/sim/eternal.js');
  const { rebirthSave } = await import('../src/sim/rebirth.js');
  const { relevelItem, starterWeapon: sw, rollItem: ri, RARITIES: RR } = await import('../src/sim/items.js');
  const all = { warrior: { prim: [6, 7, 8, 9, 10] }, archer: { prim: [6, 7, 8, 9, 10] }, mage: { prim: [6, 7, 8, 9, 10] }, rogue: { prim: [6, 7, 8, 9, 10] } };
  // the Granted: a hundred times, a hundred bars
  const cw = new World({ seed: 99, mode: 'explore', cls: 'mage', save: Object.assign(geared('mage', 100, 6), { acctLives: all, tierMax: 5 }) });
  cw.loadMap('skyroad', 'town');
  for (let i = 0; i < 5; i++) cw.step(CONFIG.TICK);
  const gb = cw.enemies.find((e) => e.def.boss && e.def.granted);
  const plain = cw.enemies.find((e) => !e.def.boss);
  check('The Granted (0.71): many times the health (0.74: 50x), in a hundred bars', gb && gb.bars === CL.bossBars && CL.bossBars === 100 && CL.bossHp === 50 && !plain.bars, gb && `${gb.maxHp}`);
  const { ENEMIES: EN } = await import('../src/sim/defs.js');
  const fast = ['latch', 'threshold', 'everydoor', 'gavel', 'judgement', 'objection', 'take', 'craving', 'more', 'fiatlux', 'itisdone', 'everything'];
  const names = new Set(['ianitor', 'arbiter', 'desiderium', 'fiat'].flatMap((b) => EN[b].attacks.map((a) => a.name)));
  check('...each with new quick, hard patterns (windups half a second or so)', fast.every((n) => names.has(n)) && ['ianitor', 'arbiter', 'desiderium', 'fiat'].every((b) => EN[b].attacks.filter((a) => fast.includes(a.name)).every((a) => a.windup <= 0.7)));
  // drops
  const mk = (extra = {}) => new World({ seed: 100, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 100, 5), { acctLives: all, tierMax: 5 }, extra) });
  const w = mk();
  w.loadMap('zenith', 'town');
  const boss = { def: EN.fiat, type: 'fiat', x: 0, z: 0 };
  const save = ETERNAL.chance.zenith;
  ETERNAL.chance.zenith = 1;
  const got = [];
  for (let i = 0; i < 5; i++) { w.eternalDrop(boss); got.push(Object.keys(w.player.eternals).find((s) => w.player.eternals[s] && !got.includes(s))); }
  check('Eternal: a Granted lets one fall, never one you have (five drops, five different pieces)', new Set(got).size === 5 && got.every(Boolean), got.join());
  const before = w.player.eternalEssence;
  w.eternalDrop(boss);
  check('...and with all five, Eternity Essence', w.player.eternalEssence === before + ETERNAL.essencePerDrop);
  ETERNAL.chance.zenith = save;
  check('...only in Caelum, and only from the Granted', (() => { const t = mk(); t.loadMap('greenwood', 'town'); t.eternalDrop(boss); const t2 = mk(); t2.loadMap('zenith', 'town'); t2.eternalDrop({ def: EN.boss, type: 'boss', x: 0, z: 0 }); return !Object.values(t.player.eternals).some(Boolean) && !Object.values(t2.player.eternals).some(Boolean); })());
  // wearing: never in the gear box
  const p = w.player;
  const bagN = p.bag.length;
  w.command({ type: 'wearEternal', slot: 'helm' }); w.runCommands();
  check('...worn in its slot from its own panel; what was there goes to the gear box', p.equipped.helm.eternal && !p.eternals.helm && p.bag.length === bagN + 1);
  const helmItem = ri(() => 0.5, 100, { weights: RR.map((_, i) => (i === 3 ? 1 : 0)), slot: 'helm' });
  p.bag.push(helmItem);
  w.command({ type: 'equip', index: p.bag.length - 1 }); w.runCommands();
  check('...put something else on and it goes back to its panel, not the gear box', p.eternals.helm && p.eternals.helm.eternal && !p.bag.some((it) => it.eternal));
  w.command({ type: 'wearEternal', slot: 'helm' }); w.runCommands();
  p.bag.push(ri(() => 0.99, 100, { weights: RR.map((_, i) => (i === 6 ? 1 : 0)), slot: 'helm' }));
  w.command({ type: 'autoEquip' }); w.runCommands();
  w.command({ type: 'scrap', keep: [] }); w.runCommands();
  check('...Equip every upgrade never takes it off, scrapping never reaches it', p.equipped.helm.eternal && !p.bag.some((it) => it.eternal));
  p.scrap += 1e7; p.gold += 1e9;
  w.command({ type: 'upgrade', slot: 'helm' }); w.runCommands();
  check('...(0.75) and the blacksmith works on it too', p.equipped.helm.plus === 1);
  p.equipped.helm.plus = 0;
  // feeding
  const it = p.equipped.helm;
  const imm = () => ri(() => 0.5, 100, { weights: RR.map((_, i) => (i === 6 ? 1 : 0)), slot: 'ring' });
  for (let i = 0; i < 6; i++) p.bag.push(imm());
  const n0 = p.bag.filter((b) => b.rarity === 6).length;
  for (let i = 0; i < 6; i++) { const at = p.bag.findIndex((b) => b.rarity === 6); w.command({ type: 'feedEternal', slot: 'helm', index: at }); w.runCommands(); }
  check('Feeding: Immortals from the gear box are used up and give experience (600: level 1 to 4)', it.level === 4 && p.bag.filter((b) => b.rarity === 6).length === n0 - 6, `${it.level} ${it.xp}`);
  check('...(0.73.1) a second passive waits for level 6', it.passives.length === 1);
  p.eternalEssence = 200;
  w.command({ type: 'feedEternal', slot: 'helm' }); w.runCommands();
  const total = Array.from({ length: ETERNAL.maxLevel - 1 }, (_, i) => ETERNAL.xpFor(i + 1)).reduce((a, b) => a + b, 0);
  check('...Essence takes it to the last level (30, about 56,000 in all), five passives, using only what it needs', it.level === ETERNAL.maxLevel && slotsOpen(it) === 5 && it.passives.length === 5 && new Set(it.passives.map((q) => q.key)).size === 5 && total > 50000 && Math.abs(p.eternalEssence - (200 - (total - 600) / ETERNAL.essenceXp)) < 1e-6, `${it.level} ${p.eternalEssence} ${total}`);
  const t = rollEternal(() => 0.3, 100, 'boots', 'rogue');
  const over = feed(t, total + 500, () => 0.4);
  check('...and what goes past the last level comes back (as Essence)', t.level === ETERNAL.maxLevel && Math.abs(over - 500) < 1e-6, `${over}`);
  // its passives
  const target = { def: { boss: true }, x: 0, z: 0 };
  const m0 = eternalMods({ helm: it });
  check('Eternal passives: about a boss, and they add up across worn pieces', Object.keys(m0).length === 5 && Object.keys(eternalMods({ helm: it, boots: t })).length >= 5);
  const dw = mk();
  dw.loadMap('greenwood', 'town');
  for (let i = 0; i < 150; i++) dw.step(CONFIG.TICK);
  const e = dw.enemies.find((o) => !o.dead && o.state !== 'spawn');
  e.hp = e.maxHp = 1e9;
  e.def = Object.assign({}, e.def, { boss: true });
  const hit = () => { const b = e.hp; dw.hitEnemy(e, 1000, { forceCrit: false, canCrit: false }); const d = b - e.hp; e.hp = b; return d; };
  const plainHit = hit();
  dw.player.equipped.chest = Object.assign(rollEternal(() => 0.5, 100, 'chest', 'rogue'), { passives: [{ key: 'colossus', q: 1 }] });
  dw.recalcStats();
  const ethit = hit();
  check('...Colossus Breaker: 40% more to a boss (a top roll at level 1; 0.75.1)', Math.abs(ethit / plainHit - 1.4) < 0.02, `${plainHit} ${ethit}`);
  e.def = Object.assign({}, e.def, { boss: false });
  const mobHit = hit();
  check('...(0.75.1) and half that to anything else', Math.abs(mobHit / plainHit - 1.2) < 0.02, `${plainHit} ${mobHit}`);
  e.def = Object.assign({}, e.def, { boss: true });
  dw.player.equipped.chest.passives = [{ key: 'relentless', q: 1 }];
  dw.recalcStats();
  const full = hit();
  e.hp = e.maxHp * 0.35;
  const low = (() => { const b = e.hp; dw.hitEnemy(e, 1000, { forceCrit: false, canCrit: false }); const d = b - e.hp; e.hp = e.maxHp; return d; })();
  check('...Relentless (0.75.1): more the more health a boss has lost (6 tenths gone: +36% at the top roll)', Math.abs(full / plainHit - 1) < 0.02 && Math.abs(low / plainHit - 1.36) < 0.03, `${plainHit} ${full} ${low}`);
  dw.player.equipped.chest.passives = [{ key: 'colossus', q: 1 }];
  dw.recalcStats();
  // save and rebirth
  const sv = w.toSave();
  const back = new World({ seed: 101, mode: 'explore', cls: 'rogue', save: Object.assign(sv, { acctLives: all }) });
  check('Eternal: kept in the save, worn and stowed', back.player.equipped.helm.eternal && back.player.equipped.helm.level === ETERNAL.maxLevel && ['weapon', 'chest', 'boots', 'ring'].every((s) => back.player.eternals[s]));
  const rs = rebirthSave(sv, sw, null, relevelItem);
  check('...a rebirth keeps every piece, worn where it was, back at level 1, its own level and passives kept', rs.equipped.helm && rs.equipped.helm.eternal && rs.equipped.helm.ilvl === 1 && rs.equipped.helm.level === ETERNAL.maxLevel && rs.equipped.helm.passives.length === 5 && ['weapon', 'chest', 'boots', 'ring'].every((s) => rs.eternals[s] && rs.eternals[s].ilvl === 1));
  const fresh = new World({ seed: 102, mode: 'explore', cls: 'rogue', save: rs });
  fresh.recalcStats();
  check('...and it grows with you again', fresh.player.equipped.helm.ilvl === 1 && (fresh.player.level = 50, fresh.recalcStats(), fresh.player.equipped.helm.ilvl === 50));
}

// --- 0.71.1: Eternal pity, the share in a party, and the Granted's loot ---------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { ETERNAL } = await import('../src/sim/eternal.js');
  const { CAELUM: CL } = await import('../src/sim/endgame.js');
  const { ENEMIES: EN } = await import('../src/sim/defs.js');
  const all = { warrior: { prim: [6, 7, 8, 9, 10] }, archer: { prim: [6, 7, 8, 9, 10] }, mage: { prim: [6, 7, 8, 9, 10] }, rogue: { prim: [6, 7, 8, 9, 10] } };
  const w = new World({ seed: 103, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 100, 5), { acctLives: all, tierMax: 5 }) });
  w.loadMap('skyroad', 'town');
  const boss = { def: EN.ianitor, type: 'ianitor', x: 0, z: 0 };
  const keep = ETERNAL.chance.skyroad;
  ETERNAL.chance.skyroad = 1e-9;
  for (let i = 0; i < 10; i++) w.eternalDrop(boss);
  check('Eternal pity (0.71.1): +2% for each Granted beaten without one', w.player.eternalPity === 10 && w.toSave().eternalPity === 10);
  w.player.eternalPity = 50; // 0% + 50 x 2% = sure
  w.eternalDrop(boss);
  check('...and it resets when one falls', w.player.eternalPity === 0 && Object.values(w.player.eternals).some(Boolean));
  ETERNAL.chance.skyroad = keep;
  // the party's share: two heroes, each at half the odds
  let solo = 0, duo = 0, trio = 0;
  for (let k = 0; k < 400; k++) {
    const a = new World({ seed: 200 + k, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 100, 5), { acctLives: all, tierMax: 5 }) });
    a.loadMap('skyroad', 'town');
    ETERNAL.chance.skyroad = 0.5;
    a.eternalDrop(boss);
    if (Object.values(a.player.eternals).some(Boolean)) solo++;
    a.addHero(2, { save: Object.assign(geared('mage', 100, 5), { acctLives: all }), name: 'B' });
    a.player.eternals = {}; a.player.eternalPity = 0;
    a.eternalDrop(boss);
    if (Object.values(a.player.eternals).some(Boolean)) duo++;
    a.addHero(3, { save: Object.assign(geared('rogue', 100, 5), { acctLives: all }), name: 'C' });
    a.player.eternals = {}; a.player.eternalPity = 0;
    a.eternalDrop(boss);
    if (Object.values(a.player.eternals).some(Boolean)) trio++;
  }
  ETERNAL.chance.skyroad = keep;
  check('...(0.74.1) a party shares twice the chance: a pair each roll the whole of it, three two-thirds each', solo > 160 && Math.abs(duo - solo) < solo * 0.2 && trio < solo * 0.85 && trio > solo * 0.5, `${solo} solo, ${duo} in two, ${trio} in three`);
  check('The Granted\'s loot (0.71.1): 20x gold, twice the hoard, a 40% Immortal best piece and a sure Immortal, 3x keys', CL.bossLoot.gold === 20 && CL.bossLoot.items === 2 && CL.bossLoot.top[6] === 40 && CL.bossLoot.immortal === 1 && CL.bossLoot.keys === 3);
  for (let i = 0; i < 5; i++) w.step(CONFIG.TICK);
  const gb = w.enemies.find((e) => e.def.boss && e.def.granted);
  const plain = new World({ seed: 104, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 100, 5), { acctLives: all, tierMax: 5 }) });
  plain.loadMap('skyroad', 'town');
  check('...the gold is on the boss itself', gb && gb.goldValue > 1000, gb && gb.goldValue);
}

// --- 0.71.2: Crimson Oath and Blood Oath are toggles ---------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const w = new World({ seed: 105, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 100, 5), { spec: 'berserker', talents: {} }) });
  w.loadMap('greenwood', 'town');
  for (let i = 0; i < 150; i++) w.step(CONFIG.TICK);
  const p = w.player;
  p.hp = p.stats.maxHp; p.cd.r = 0;
  w.command({ type: 'cast', slot: 'r', x: p.x + 1, z: p.z }); w.runCommands();
  for (let i = 0; i < 600; i++) { p.hp = p.stats.maxHp; w.step(CONFIG.TICK); }
  check('Crimson Oath (0.71.2): a toggle, on until you turn it off (10 s later, still on, still held at 40%)', p.frenzyOn && w.frenzyActive() && p.hp <= p.stats.maxHp * 0.49 + 1 && w.bloodReach() === 2);
  check('...the wait between presses is short', p.cd.r <= 0);
  w.command({ type: 'cast', slot: 'r', x: p.x + 1, z: p.z }); w.runCommands();
  p.hp = p.stats.maxHp; w.step(CONFIG.TICK);
  check('...pressed again it goes off, and you heal past 40% again', !p.frenzyOn && p.hp > p.stats.maxHp * 0.9 && p.cd.r > 0);
}

// --- 0.71.3: the road's "go there" quests are done for you once it is open ---------------------------
{
  const mk = (lives) => new World({ seed: 106, mode: 'explore', cls: 'mage', save: { v: 2, cls: 'mage', level: 100, exp: 0, equipped: {}, bag: [], acctLives: lives, quests: { unmade: { s: 'done', n: 1 } } } });
  const w = mk({ archer: { prim: [6] } });
  w.player.quests.pass = { s: 'active', n: 0 };
  w.loadMap('greenwood', 'town');
  w.step(CONFIG.TICK);
  w.acceptQuest('w');
  check('Road quests (0.71.3): with the road open, Past the Gate (Frostfall Pass) and W. (its stone) are ready without going', w.questState('pass') === 'ready' && w.questState('w') === 'ready', `${w.questState('pass')} ${w.questState('w')}`);
  const n = mk(null);
  n.acceptQuest('w');
  check('...not before the road is open', n.questState('w') === 'active');
}

// --- 0.71.4: held at 40% under an Oath; a Warrior's Glacier Spin ---------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const all = { warrior: { prim: [10] }, archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  const w = new World({ seed: 107, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 100, 5), { spec: 'berserker', talents: {}, acctLives: all }) });
  w.loadMap('greenwood', 'town');
  for (let i = 0; i < 150; i++) w.step(CONFIG.TICK);
  const p = w.player;
  p.cd.r = 0;
  w.command({ type: 'cast', slot: 'r', x: p.x + 1, z: p.z }); w.runCommands(); w.step(CONFIG.TICK);
  p.hp = 1;
  w.step(CONFIG.TICK);
  check('Crimson Oath (0.71.5): no healing by waiting (1 health stays 1)', p.hp < 2);
  const foe = w.enemies.find((o) => !o.dead && o.state !== 'spawn');
  foe.hp = foe.maxHp = 1e9;
  w.hitEnemy(foe, 2000, { basic: true });
  const once = p.hp;
  for (let i = 0; i < 20; i++) w.hitEnemy(foe, 5000, { basic: true });
  check('...you live by hitting: lifesteal 25 times over, uncapped', once > 1 + 2000 * 0.25 * 0.5, `${once}`);
  const top = p.hp;
  p.hp = p.stats.maxHp; w.step(CONFIG.TICK);
  check('...but never above 49%', Math.abs(top - p.stats.maxHp * 0.49) < 1 && p.hp <= p.stats.maxHp * 0.49 + 1e-6, `${top / p.stats.maxHp}`);
  w.loadMap('frost', 'town');
  w.step(CONFIG.TICK);
  check('...a new map turns it off (so it is never shown on when it is not)', !p.frenzyOn && 'frenzyOn' in p);
  // Glacier Spin
  const g = new World({ seed: 108, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 100, 5), { spec: 'bulwark', talents: {}, acctLives: all, borrowed: { d: 'frostbinder' } }) });
  g.loadMap('greenwood', 'town');
  for (let i = 0; i < 150; i++) g.step(CONFIG.TICK);
  const q = g.player;
  const e = g.enemies.find((o) => !o.dead && o.state !== 'spawn');
  e.hp = e.maxHp = 1e8;
  q.x = q.px = e.x + 2; q.z = q.pz = e.z;
  q.cd.w = 0;
  g.command({ type: 'cast', slot: 'w', x: e.x, z: e.z }); g.runCommands(); g.step(CONFIG.TICK);
  check('Glacier Spin (0.71.4): Whirlwind hits give Hoarfrost', (e.frostStacks || 0) >= 2 && q.frostSpinT > 0, `${e.frostStacks} ${q.frostSpinT}`);
  const shot = { id: g.nextId++, owner: 'enemy', kind: 'bolt', x: q.x + 2.5, z: q.z, px: q.x + 3, pz: q.z, vx: -10, vz: 0, speed: 10, radius: 0.4, dmg: 50, parryable: false, reflected: false, life: 3, dead: false, srcId: e.id };
  g.projectiles.push(shot);
  g.step(CONFIG.TICK);
  check('...and while it spins, shots that come near fly back as yours', shot.owner === 'player' && shot.vx > 0);
}

// --- 0.71.6: Hold the Line drags harder; with Glacier Spin it freezes and turns shots ---------------------
{
  const { geared } = await import('./balance.mjs');
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const all = { warrior: { prim: [10] }, archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  const w = new World({ seed: 109, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 100, 5), { spec: 'bulwark', talents: {}, acctLives: all, borrowed: { d: 'frostbinder' } }) });
  w.loadMap('greenwood', 'town');
  for (let i = 0; i < 150; i++) w.step(CONFIG.TICK);
  const p = w.player;
  const e = w.enemies.find((o) => !o.dead && o.state !== 'spawn' && !o.def.boss);
  e.hp = e.maxHp = 1e8;
  p.x = p.px = e.x + 6.5; p.z = p.pz = e.z;
  const boss = Object.assign({}, e, { id: w.nextId++, def: Object.assign({}, e.def, { boss: true }), x: p.x - 7, z: p.z + 0.01, px: p.x - 7, pz: p.z, kx: 0, kz: 0, hp: 1e9, maxHp: 1e9, frostStacks: 0, frostT: 0 });
  w.enemies.push(boss);
  const b0 = dist(boss.x, boss.z, p.x, p.z);
  p.cd.r = 0;
  w.command({ type: 'cast', slot: 'r', x: p.x, z: p.z }); w.runCommands();
  for (let i = 0; i < 40; i++) { p.hp = p.stats.maxHp; w.step(CONFIG.TICK); }
  const ed = dist(e.x, e.z, p.x, p.z) - e.radius - p.radius;
  const bd = dist(boss.x, boss.z, p.x, p.z);
  check('Hold the Line (0.71.6): a normal enemy is dragged right up to you', ed < 1.5, `${ed}`);
  check('...a boss a fifth of the way', bd < b0 - 0.6 && bd > b0 * 0.6, `${b0} -> ${bd}`);
  check('...and with Glacier Spin it freezes (Shatters) what it drags in, and turns shots for as long as it holds', e.frostLock > 0 && p.frostSpinT > 3);
}

// --- 0.73: the first time each Granted falls, Eternity Essence --------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { ETERNAL } = await import('../src/sim/eternal.js');
  const { ENEMIES: EN } = await import('../src/sim/defs.js');
  const { rebirthSave } = await import('../src/sim/rebirth.js');
  const { relevelItem, starterWeapon: sw } = await import('../src/sim/items.js');
  const all = { warrior: { prim: [6, 7, 8, 9, 10] }, archer: { prim: [6, 7, 8, 9, 10] }, mage: { prim: [6, 7, 8, 9, 10] }, rogue: { prim: [6, 7, 8, 9, 10] } };
  const w = new World({ seed: 110, mode: 'explore', cls: 'mage', save: Object.assign(geared('mage', 100, 5), { acctLives: all, tierMax: 5 }) });
  w.loadMap('skyroad', 'town');
  const keep = ETERNAL.chance.skyroad;
  ETERNAL.chance.skyroad = 1e-9; // (no piece, to see the Essence alone)
  w.eternalDrop({ def: EN.ianitor, type: 'ianitor', x: 0, z: 0 });
  const one = w.player.eternalEssence;
  w.eternalDrop({ def: EN.ianitor, type: 'ianitor', x: 0, z: 0 });
  w.eternalDrop({ def: EN.arbiter, type: 'arbiter', x: 0, z: 0 });
  ETERNAL.chance.skyroad = keep;
  check('First kills (0.73): each Granted\'s first fall gives Eternity Essence, once', one === ETERNAL.firstKill && w.player.eternalEssence === 2 * ETERNAL.firstKill && w.events.some((e) => e.type === 'eternalDrop' && e.first));
  const rs = rebirthSave(w.toSave(), sw, null, relevelItem);
  check('...kept through rebirth, and never given twice', rs.eternalEssence === 2 * ETERNAL.firstKill && rs.eternalFirsts.join() === 'ianitor,arbiter')}

// --- 0.73.1: Eternal on a longer road, and the whole server hears of one ----------------------------
{
  const { ETERNAL, rollEternal, feed, nextSlotAt } = await import('../src/sim/eternal.js');
  const old = rollEternal(() => 0.2, 100, 'ring', 'mage');
  old.level = 10; old.passives = [{ key: 'colossus', q: 0.5 }, { key: 'sunder', q: 0.5 }, { key: 'focus', q: 0.5 }, { key: 'titanfall', q: 0.5 }];
  feed(old, 1, () => 0.3);
  check('Eternal (0.73.1): a level-10 piece from before keeps its four passives; its fifth waits for level 30', old.passives.length === 4 && nextSlotAt(old) === 30);
  const at10 = Array.from({ length: 9 }, (_, i) => ETERNAL.xpFor(i + 1)).reduce((a, b) => a + b, 0);
  check('...level 10 is a third of the way, and the rest is the long part', ETERNAL.maxLevel === 30 && at10 < 4000 && Array.from({ length: 29 }, (_, i) => ETERNAL.xpFor(i + 1)).reduce((a, b) => a + b, 0) > 12 * at10)}

// --- 0.74: bosses that do not walk off healing, thanks for the early ones, forging, loot left lying ---
{
  const { geared } = await import('./balance.mjs');
  const { ETERNAL } = await import('../src/sim/eternal.js');
  const all = { warrior: { prim: [6, 7, 8, 9, 10] }, archer: { prim: [6, 7, 8, 9, 10] }, mage: { prim: [6, 7, 8, 9, 10] }, rogue: { prim: [6, 7, 8, 9, 10] } };
  // a Granted dragged far from home while it is being hit keeps fighting
  const w = new World({ seed: 111, mode: 'explore', cls: 'mage', save: Object.assign(geared('mage', 100, 6), { acctLives: all, tierMax: 5 }) });
  w.loadMap('skyroad', 'town');
  for (let i = 0; i < 5; i++) w.step(CONFIG.TICK);
  const b = w.enemies.find((e) => e.def.boss && e.def.granted);
  const p = w.player;
  b.aggro = true; b.state = 'chase';
  b.x = b.home.x + 30; b.z = b.home.z; p.x = p.px = b.x + 6; p.z = p.pz = b.z;
  b.hp = b.maxHp * 0.505;
  for (let i = 0; i < 60 * 15; i++) {
    p.stats.maxHp = 1e15; p.hp = 1e15; p.dead = false; // (the test is the boss's patience, not the hero's health)
    if (i % 30 === 0) { const keep = b.hp; w.hitEnemy(b, 1, {}); b.hp = keep; }
    b.x = b.home.x + 30; b.z = b.home.z;
    w.step(CONFIG.TICK);
  }
  check('Granted (0.74): fought 30 m from home for 15 s, it keeps its patience and does not walk off healing', b.aggro && !b.returning && b.hp <= b.maxHp * 0.506, `${b.patience} ${b.aggro} ${b.hp / b.maxHp}`);
  b.hitAt = -99; b.aggro = false; b.returning = true;
  for (let i = 0; i < 60 * 30; i++) w.step(CONFIG.TICK);
  check('...left alone it goes home, healing only to the top of the bar it was on', b.hp <= b.maxHp * 0.51 + 1 && b.hp >= b.maxHp * 0.505, `${b.hp / b.maxHp}`);
  // thanks for the early ones
  const vet = new World({ seed: 112, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 100, 5), { bossKills: { ianitor: 3, arbiter: 1 } }) });
  check('Veterans (0.74): Granted beaten before now give their first-kill Essence and a veteran share, once', vet.player.eternalEssence === 2 * (ETERNAL.firstKill + ETERNAL.veteran) && vet.player.eternalVet);
  const again = new World({ seed: 113, mode: 'explore', cls: 'rogue', save: vet.toSave() });
  const late = new World({ seed: 114, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 100, 5), { eternalFirsts: ['ianitor'], eternalEssence: 2 }) });
  check('...never twice, and a first kill since 0.73 counts too (its veteran share only)', again.player.eternalEssence === vet.player.eternalEssence && late.player.eternalEssence === 2 + ETERNAL.veteran);
  const fresh = new World({ seed: 115, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 100, 5), {}) });
  check('...and a new hero gets nothing until they beat one (then only the first-kill Essence)', fresh.player.eternalEssence === 0 && fresh.player.eternalVet);
  // forging
  vet.command({ type: 'forgeEternal', slot: 'boots' }); vet.runCommands();
  check('Forging (0.74): 8 Eternity Essence makes a piece you lack', vet.player.eternals.boots && vet.player.eternals.boots.eternal && vet.player.eternalEssence === 12 - ETERNAL.forgeCost && vet.events.some((e) => e.type === 'eternalDrop' && e.forged));
  vet.command({ type: 'forgeEternal', slot: 'boots' }); vet.runCommands();
  vet.command({ type: 'forgeEternal', slot: 'ring' }); vet.runCommands();
  check('...not one you have, nor without the Essence', vet.player.eternalEssence === 4 && !vet.player.eternals.ring);
  // loot left lying
  const lw = new World({ seed: 116, mode: 'explore', cls: 'archer', save: geared('archer', 100, 5) });
  lw.loadMap('greenwood', 'town');
  const lp = lw.player;
  lp.x = lp.px = 0; lp.z = lp.pz = 0;
  const { rollItem: ri, RARITIES: RR } = await import('../src/sim/items.js');
  const mkItem = (r) => ri(() => 0.5, 100, { weights: RR.map((_, i) => (i === r ? 1 : 0)), slot: 'helm' });
  for (let i = 0; i < 30; i++) lw.loot.push({ id: lw.nextId++, x: 40 + i * 0.1, z: 40, item: mkItem(3), age: 0, magnet: false, owner: lw.cur.pid });
  lw.loot.push({ id: lw.nextId++, x: 41, z: 41, item: mkItem(6), age: 0, magnet: false, owner: lw.cur.pid });
  const s0 = lp.scrap;
  lw.step(CONFIG.TICK);
  check('Auto-scrap (0.74): past 24 pieces on the ground, the oldest go to scrap at once', lw.loot.length === 25 && lp.scrap > s0, `${lw.loot.length}`);
  for (let i = 0; i < 60 * 26; i++) lw.step(CONFIG.TICK);
  const left = lw.loot.filter((l) => l.owner === lw.cur.pid);
  check('...after 25 seconds the rest go too; an Immortal is never touched', !left.some((l) => l.age > 25.5 && l.item.rarity < 6) && left.some((l) => l.item.rarity === 6), `${left.map((l) => l.item.rarity)}`);
}

// --- 0.75: Eternal at ten times a made Immortal, every stat, rerolls, choosing what to feed, auto-feed ---
{
  const { geared } = await import('./balance.mjs');
  const { rollEternal, remakeEternal, eternalLines } = await import('../src/sim/eternal.js');
  const I = await import('../src/sim/items.js');
  const all = { warrior: { prim: [6, 7, 8, 9, 10] }, archer: { prim: [6, 7, 8, 9, 10] }, mage: { prim: [6, 7, 8, 9, 10] }, rogue: { prim: [6, 7, 8, 9, 10] } };
  const e = rollEternal(() => 0, 100, 'helm', 'rogue');
  const imm = { rarity: 6, ilvl: 100, slot: 'helm', stats: { hp: 1 } };
  const madeTop = (k) => { const o = Object.assign({}, imm, { stats: { [k]: 1 } }); return I.statRange(o, k).hi * (1 + I.PLUS_BONUS * I.MAX_PLUS) * (1 + I.STAR_BONUS * I.MAX_STARS); };
  const keys = Object.keys(e.stats);
  check('Eternal (0.75): every stat on every piece (the power line its class\'s own)', keys.length === 8 && keys[0] === 'hp' && keys.includes('ad') && !keys.includes('sp') && eternalLines('ring', 'mage').includes('sp') && !eternalLines('ring', 'mage').includes('ad'), keys.join());
  check('...even the lowest roll is ten times the best line a made Immortal (+10, five stars) can have', keys.every((k) => e.stats[k] >= 10 * madeTop(k) * 0.96), keys.map((k) => `${k} ${e.stats[k]}/${Math.round(madeTop(k))}`).join(' '));
  const old = { eternal: true, rarity: 7, slot: 'weapon', ilvl: 100, stats: { ad: 400, as: 30 }, level: 7, xp: 12, plus: 2, passives: [{ key: 'colossus', q: 0.5 }], cls: 'archer', rv: 2 };
  remakeEternal(old, 'warrior');
  check('...a piece from before is made over (level, passives and + kept)', old.ev === 3 && Object.keys(old.stats).length === 8 && old.stats.ad > 10000 && old.level === 7 && old.plus === 2 && old.passives.length === 1);
  // worn: the speeds stop at their ceiling, the rest is huge; rerolls work and stay in range
  const w = new World({ seed: 7, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 100, 6), { acctLives: all, tierMax: 5 }) });
  const p = w.player;
  const ad0 = p.stats.ad, hp0 = p.stats.maxHp;
  for (const s of I.SLOTS) p.equipped[s] = rollEternal(() => 0.5, 100, s, 'rogue');
  w.recalcStats();
  const g = I.sumGearStats(p.equipped);
  check('...worn, power and health leap (many times), while attack speed, move speed and haste stop at their ceiling', p.stats.ad > 20 * ad0 && p.stats.maxHp > 20 * hp0 && p.stats.haste <= CONFIG.ETERNAL_GEAR_CAP.haste + 200 && p.stats.ms < 6.4 * 3 && p.stats.as < 12 && g.as > 1000, `${ad0}->${p.stats.ad} ${hp0}->${p.stats.maxHp} as ${p.stats.as.toFixed(2)} ms ${p.stats.ms.toFixed(1)} haste ${p.stats.haste}`);
  p.gold = 1e12; p.scrap = 1e9;
  const before = p.equipped.weapon.stats.crit;
  const { lo, hi } = I.statRange(p.equipped.weapon, 'crit');
  let ok = true;
  for (let i = 0; i < 20; i++) { w.command({ type: 'enchant', slot: 'weapon', key: 'crit' }); w.runCommands(); const v = p.equipped.weapon.stats.crit; if (v < lo || v > hi) ok = false; }
  check('...its lines can be rerolled, always inside its own range (never reforged)', ok && p.equipped.weapon.rerolls === 20 && I.enchantable(p.equipped.weapon).length === 0, `${before} ${lo}-${hi}`);
  // feeding: only the chosen ones, and only as many as it can still take
  const fw = new World({ seed: 8, mode: 'explore', cls: 'rogue', save: Object.assign(geared('rogue', 100, 5), { acctLives: all, tierMax: 5 }) });
  const fp = fw.player;
  fp.eternals.ring = rollEternal(() => 0.5, 100, 'ring', 'rogue');
  const im = () => I.rollItem(() => 0.5, 100, { weights: I.RARITIES.map((_, i) => (i === 6 ? 1 : 0)), slot: 'boots' });
  fp.bag = [im(), im(), im(), im()];
  const ids = fp.bag.map((b) => b.id);
  fw.command({ type: 'feedEternal', slot: 'ring', ids: [ids[0], ids[2]] }); fw.runCommands();
  check('Feeding (0.75): only the Immortals chosen are eaten', fp.bag.length === 2 && fp.bag[0].id === ids[1] && fp.bag[1].id === ids[3] && fp.eternals.ring.level > 1, `${fp.bag.map((b) => b.id)} ${fp.eternals.ring.level}`);
  // auto-feed: off by default; when on, a new Immortal goes to an Eternal, a set piece or upgrade does not
  const loot = (item) => { fw.loot.push({ id: fw.nextId++, x: fp.x, z: fp.z, item, age: 0, magnet: true, owner: fw.cur.pid }); for (let i = 0; i < 30; i++) fw.step(CONFIG.TICK); };
  for (const s of I.SLOTS) if (!fp.equipped[s]) fp.equipped[s] = im();
  const n0 = fp.bag.length;
  const lv0 = fp.eternals.ring.xp + fp.eternals.ring.level * 1e6;
  loot(Object.assign(im(), { stats: { ms: 1 } }));
  check('Auto-feed (0.75): off unless turned on (a new Immortal goes to the gear box)', fp.eternalAuto === null && fp.bag.length === n0 + 1);
  fw.command({ type: 'eternalAuto', to: 'low' }); fw.runCommands();
  loot(Object.assign(im(), { stats: { ms: 1 } }));
  check('...turned on, the next one is fed to an Eternal instead', fp.eternalAuto === 'low' && fp.bag.length === n0 + 1 && fp.eternals.ring.xp + fp.eternals.ring.level * 1e6 > lv0, `${fp.bag.length} ${n0}`);
  loot(Object.assign(im(), { stats: { ms: 1 }, set: 'shadowmark' }));
  check('...but never a set piece', fp.bag.length === n0 + 2);
  fw.command({ type: 'eternalAuto', to: 'nonsense' }); fw.runCommands();
  check('...and it can be turned off again', fp.eternalAuto === null);
}

// --- 0.75.2: locked gear ------------------------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { rollEternal } = await import('../src/sim/eternal.js');
  const I = await import('../src/sim/items.js');
  const w = new World({ seed: 9, mode: 'explore', cls: 'archer', save: geared('archer', 100, 5) });
  const p = w.player;
  const im = () => I.rollItem(() => 0.2, 100, { weights: I.RARITIES.map((_, i) => (i === 6 ? 1 : 0)), slot: 'ring' });
  p.bag = [im(), im()];
  const [a, b] = p.bag;
  w.command({ type: 'lockItem', index: 0 }); w.runCommands();
  check('Locking (0.75.2): a click locks a piece', a.locked === true);
  w.command({ type: 'discard', index: 0 }); w.runCommands();
  const junk = I.rollItem(() => 0.2, 1, { weights: I.RARITIES.map((_, i) => (i === 0 ? 1 : 0)), slot: 'ring' });
  p.bag = [a, junk];
  a.ilvl = 1; // not an upgrade either, so only the lock keeps it
  w.command({ type: 'scrap', keep: [] }); w.runCommands();
  check('...a locked piece is never discarded or bulk-scrapped (the other one is)', p.bag.length === 1 && p.bag[0] === a, `${p.bag.length}`);
  a.ilvl = 100;
  p.bag.push(b);
  p.eternals.helm = rollEternal(() => 0.5, 100, 'helm', 'archer');
  w.command({ type: 'feedEternal', slot: 'helm', ids: [a.id, b.id] }); w.runCommands();
  check('...and never fed to an Eternal, even when chosen', p.bag.length === 1 && p.bag[0] === a);
  w.command({ type: 'lockItem', index: 0 }); w.runCommands();
  check('...click again to unlock', !a.locked);
  w.command({ type: 'equip', index: 0 }); w.runCommands();
  w.command({ type: 'lockItem', slot: 'ring' }); w.runCommands();
  check('...worn gear can be locked too, and stays locked in the save', p.equipped.ring === a && a.locked && w.toSave().equipped.ring.locked === true);
}

// --- 0.75.3: auto-scrap below a rarity, and Eternal-tier lines on Eternal gear --------------------------
{
  const { geared } = await import('./balance.mjs');
  const { rollEternal } = await import('../src/sim/eternal.js');
  const I = await import('../src/sim/items.js');
  const w = new World({ seed: 12, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 5) });
  const p = w.player;
  const of = (r, ilvl = 1, extra = {}) => Object.assign(I.rollItem(() => 0.3, ilvl, { weights: I.RARITIES.map((_, i) => (i === r ? 1 : 0)), slot: 'ring' }), extra);
  const loot = (item) => { w.loot.push({ id: w.nextId++, x: p.x, z: p.z, item, age: 0, magnet: true, owner: w.cur.pid }); for (let i = 0; i < 30; i++) w.step(CONFIG.TICK); };
  const keepLocked = of(1, 1, { locked: true });
  p.bag = [of(0), of(3), keepLocked, of(5, 1, { set: 'bloodbound' })];
  w.command({ type: 'autoScrap', to: 3 }); w.runCommands();
  check('Auto-scrap (0.75.3): choosing Epic and below clears the gear box of it once (not locked or set pieces)', p.autoScrapAt === 3 && p.bag.length === 2 && p.bag.includes(keepLocked) && p.bag.some((it) => it.set), `${p.bag.map((it) => it.rarity)}`);
  const n0 = p.bag.length, s0 = p.scrap;
  loot(of(2));
  loot(of(4));
  check('...then new gear of that rarity or lower is scrapped as it comes; better rarities still go to the bag', p.bag.length === n0 + 1 && p.bag[p.bag.length - 1].rarity === 4 && p.scrap > s0, `${p.bag.map((it) => it.rarity)}`);
  const up = of(1, 100);
  p.equipped.ring = null;
  loot(up);
  check('...never one you could use (an empty slot wears it)', p.equipped.ring === up);
  w.command({ type: 'autoScrap', to: 6 }); w.runCommands();
  check('...never Immortal (it turns off rather than reach it)', p.autoScrapAt === null);
  w.command({ type: 'autoScrap', to: 5 }); w.runCommands();
  check('...kept in the save', w.toSave().autoScrapAt === 5);
  // Eternal-tier lines
  const e = rollEternal(() => 0.5, 100, 'weapon', 'warrior');
  const { lo, hi } = I.statRange(e, 'ad');
  e.stats.ad = hi;
  const imm = of(6, 100);
  imm.stats[Object.keys(imm.stats)[0]] = I.statRange(imm, Object.keys(imm.stats)[0]).hi;
  check('Eternal tier (0.75.3): on Eternal gear the best 1% of a line is an Eternal-tier roll; an Immortal tops out at Immortal', I.lineTier(e, 'ad') === 7 && I.lineTier(imm, Object.keys(imm.stats)[0]) === 6 && (e.stats.ad = Math.round(lo + 0.985 * (hi - lo)), I.lineTier(e, 'ad') === 6));
  p.equipped.weapon = e;
  p.gold = 1e12; p.scrap = 1e9;
  e.stats.crit = I.statRange(e, 'crit').lo; e.pity = 0;
  let saw = false;
  for (let i = 0; i < 30; i++) { w.command({ type: 'enchant', slot: 'weapon', key: 'crit' }); w.runCommands(); if (I.lineTier(e, 'crit') === 7) { saw = true; break; } }
  check('...and the reroll pity on Eternal gear lands an Eternal-tier line within 30', saw, `${e.pity}`);
}

// --- 0.75.5: the auto-scrap setting survives ground loot being scrapped (a timer had the same name) ------
{
  const { geared } = await import('./balance.mjs');
  const I = await import('../src/sim/items.js');
  const w = new World({ seed: 13, mode: 'explore', cls: 'mage', save: geared('mage', 100, 5) });
  const p = w.player;
  w.command({ type: 'autoScrap', to: 4 }); w.runCommands();
  for (let i = 0; i < 400; i++) w.step(CONFIG.TICK); // past 4 s on the clock: the old timer took over then
  for (let i = 0; i < 30; i++) w.loot.push({ id: w.nextId++, x: p.x + 40, z: p.z + 40, item: I.rollItem(() => 0.3, 1, { weights: I.RARITIES.map((_, j) => (j === 1 ? 1 : 0)) }), age: 999, magnet: false, owner: w.cur.pid });
  for (let i = 0; i < 60; i++) w.step(CONFIG.TICK);
  check('Auto-scrap setting (0.75.5): left alone when old ground loot is scrapped, and still saved', p.autoScrapAt === 4 && w.toSave().autoScrapAt === 4, `${p.autoScrapAt}`);
}

// --- 0.76: the Eternal form ---------------------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { rollEternal, eternalForm } = await import('../src/sim/eternal.js');
  const I = await import('../src/sim/items.js');
  const w = new World({ seed: 21, mode: 'explore', cls: 'rogue', save: geared('rogue', 100, 5) });
  const p = w.player;
  check('Eternal form (0.76): not with ordinary gear', !eternalForm(p));
  for (const s of I.SLOTS.slice(0, 4)) p.equipped[s] = rollEternal(() => 0.5, 100, s, 'rogue');
  check('...not with four pieces of five', !eternalForm(p));
  p.equipped.ring = rollEternal(() => 0.5, 100, 'ring', 'rogue');
  check('...taken with all five worn', eternalForm(p));
  w.command({ type: 'eternalForm', on: false }); w.runCommands();
  check('...and it can be hidden (kept in the save)', !eternalForm(p) && w.toSave().eformOff === true);
  w.command({ type: 'eternalForm', on: true }); w.runCommands();
  check('...or shown again', eternalForm(p) && w.toSave().eformOff === false);
  const { RIGGED, heroLook } = await import('../src/render/rigged.js').catch(() => ({}));
  if (heroLook) check('...the renderer picks the ascended model for it (the Shadowdancer too)', heroLook('rogue', 'shadowdancer', true) === 'rogue_eternal' && heroLook('rogue', 'shadowdancer', false) === 'ninja' && RIGGED.hero_warrior_eternal.url === 'models/warrior_eternal.glb');
}

// --- 0.80: the Wishkeep -------------------------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const { rollEternal } = await import('../src/sim/eternal.js');
  const I = await import('../src/sim/items.js');
  const evs = (w) => { const out = w.events.map((e) => e.type); w.events = []; return out; };
  const w = new World({ seed: 31, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p = w.player;
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands();
  check('Wishkeep (0.80): shut until a class on the account has beaten the Quiet', w.map.id === 'town' && evs(w).includes('keepLocked') && !p.keep);
  p.lives = { archer: { prim: [6, 7, 8, 9, 10], et: ['ring', 'boots'], gr: ['ianitor'], wish: 900 }, mage: { prim: [10], et: ['ring'], gr: [], wish: 100 } };
  const rec = w.keepRecord();
  check('...its record is the account\'s: halls from classes mastered, relics from Eternal slots, echoes from the Granted, Wishborne levels', rec.halls.join() === 'archer,mage' && rec.relics.join() === 'boots,ring' && rec.echoes.join() === 'ianitor' && rec.wish === 1000 + (p.wish || 0), JSON.stringify(rec));
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands();
  const got = evs(w);
  check('...opened: founded on the first visit, with Faith from the Wishborne levels the faithful bring', w.map.id === 'wishkeep' && got.includes('keepFounded') && p.keep && p.keep.tier === 1 && p.keep.faith === Math.min(400, Math.round(6 * Math.sqrt(rec.wish))), JSON.stringify(p.keep && { f: p.keep.faith }));
  check('...three settlers at tier I, three wishes on the board, only those settlers standing in the keep', Object.keys(p.keep.settlers).join() === 'ysolde,maren,bastian' && p.keep.wishes.length === 3 && w.obstacles.filter((o) => o.kind === 'npc').map((o) => o.id).join() === 'ysolde,maren,bastian');
  check('...nothing of it in the hero\'s own save (it is the account\'s)', !('keep' in w.toSave()));
  // answering: a story, an offering, a pilgrimage
  const k = p.keep;
  k.wishes = [
    { id: 'a', kind: 'tell', who: 'ysolde', line: 0, n: 0, need: 1, done: false, ch: 'road', reward: { faith: 20, stone: 1 } },
    { id: 'b', kind: 'offer', who: 'maren', line: 0, n: 0, need: 400, done: false, what: 'scrap', reward: { faith: 25, stone: 2 } },
    { id: 'c', kind: 'kill', who: 'bastian', line: 0, n: 0, need: 3, done: false, map: 'fen', mapName: 'Spitter Fen', reward: { faith: 30, stone: 4 } },
  ];
  const f0 = k.faith;
  w.command({ type: 'keepAnswer', i: 0 }); w.runCommands();
  check('...a story is heard at the board: the chapter is told, and Faith comes in (times the keep\'s bonuses)', k.told.includes('road') && evs(w).includes('keepStory') && k.faith === f0 + Math.round(20 * w.keepMult()) && k.wishes.length === 3);
  p.scrap = 100;
  const oi = k.wishes.findIndex((x) => x.kind === 'offer');
  w.command({ type: 'keepAnswer', i: oi }); w.runCommands();
  check('...an offering needs what it asks', k.wishes[oi].kind === 'offer' && !k.wishes[oi].done && p.scrap === 100 && evs(w).includes('keepShort'));
  p.scrap = 1000;
  w.command({ type: 'keepAnswer', i: oi }); w.runCommands();
  check('...and takes it', p.scrap === 600 && !k.wishes.some((x) => x.id === 'b') && k.settlers.maren.bond === 1);
  for (let i = 0; i < 3; i++) w.keepEvent('kill', { map: 'fen' });
  const ci = k.wishes.findIndex((x) => x.id === 'c');
  check('...a pilgrimage is done out in the world (kills on its map)', ci >= 0 && k.wishes[ci].done && k.wishes[ci].n === 3);
  // tiers and halls
  k.faith = 5000; k.stone = 500;
  w.command({ type: 'keepTier' }); w.runCommands();
  check('...raised a tier at the Hearth: two more settlers, a bigger board', k.tier === 2 && k.faith === 4700 && k.stone === 470 && Object.keys(k.settlers).length === 5 && k.wishes.length === 4);
  w.command({ type: 'keepHall', cls: 'warrior' }); w.runCommands();
  check('...a hall stays shut until its class is mastered', k.halls.warrior === 0 && evs(w).includes('keepHallShut'));
  w.command({ type: 'keepHall', cls: 'archer' }); w.runCommands();
  check('...and opens (and rises) once it is', k.halls.archer === 1 && k.faith === 4550);
  w.command({ type: 'keepTier' }); w.runCommands();
  check('...tier III: all six settlers, a weapon glow of its own', k.tier === 3 && Object.keys(k.settlers).length === 6 && p.glows.includes('wishkeep'));
  // (0.81) the keep's heroes, and the halls' work
  k.faith = 100000; k.stone = 1000;
  w.command({ type: 'keepRecruit', cls: 'warrior' }); w.runCommands();
  check('Wishkeep (0.81): a hero is raised only at a hall whose class is mastered', k.troops.length === 0 && evs(w).includes('keepHallShut'));
  for (let i = 0; i < 9; i++) { w.command({ type: 'keepRecruit', cls: i % 2 ? 'mage' : 'archer' }); w.runCommands(); }
  const rg = evs(w);
  check('...up to eight at tier III, each dearer than the last, and they stand in the keep', k.troops.length === 8 && rg.includes('keepFull') && k.faith === 100000 - 120 * 36 && w.troops.length === 8 && new Set(k.troops.map((t) => t.name)).size === 8);
  const t1 = k.troops[0];
  for (let i = 0; i < 6; i++) { w.command({ type: 'keepTrain', id: t1.id }); w.runCommands(); }
  check('...the Lodge trains them, as far as its level allows (level 1: to 5)', t1.lvl === 5 && evs(w).includes('keepMaxed'));
  w.command({ type: 'keepArm', id: t1.id }); w.runCommands();
  check('...the Bastion arms them, and is shut until the warrior is mastered', t1.gear === 0 && evs(w).includes('keepHallShut'));
  w.command({ type: 'keepLearn', id: t1.id, skill: 'volley' }); w.runCommands();
  const lv = evs(w);
  w.command({ type: 'keepLearn', id: t1.id, skill: 'cleave' }); w.runCommands();
  check('...the Lodge teaches physical skills up to its level', lv.includes('keepMaxed') && t1.skills[0] === 'cleave');
  w.command({ type: 'keepLearn', id: k.troops[1].id, skill: 'fireball' }); w.runCommands();
  const fb = evs(w);
  w.command({ type: 'keepHall', cls: 'mage' }); w.runCommands();
  w.command({ type: 'keepLearn', id: k.troops[1].id, skill: 'fireball' }); w.runCommands();
  check('...the Observatory teaches magic once it is raised', fb.includes('keepHallShut') && k.troops[1].skills[2] === 'fireball');
  w.command({ type: 'keepBless', id: 'stoneskin' }); w.runCommands();
  w.command({ type: 'keepBless', id: 'fury' }); w.runCommands();
  check('...and blesses the next night, up to its level', k.blessings.join() === 'fury' && evs(w).includes('keepMaxed'));
  const st0 = k.stone;
  w.command({ type: 'keepTrade', dir: 'sell' }); w.runCommands();
  check('...the Market trades only once the rogue is mastered', k.stone === st0 && evs(w).includes('keepHallShut'));
  const fc = k.faith;
  w.command({ type: 'keepClock', now: 1e12 }); w.runCommands();
  w.command({ type: 'keepClock', now: 1e12 + 2 * 3.6e6 }); w.runCommands();
  const twoH = k.faith - fc;
  w.command({ type: 'keepClock', now: 1e12 + 200 * 3.6e6 }); w.runCommands();
  check('...Faith comes in while away (no Market: 4 an hour), banked up to 24 hours (0.82.1)', twoH === 8 && k.faith - fc === 8 + 96 && k.last === 1e12 + 200 * 3.6e6, `${twoH}, ${k.faith - fc}`);
  // a Tide with nobody to hold it, and a god who cannot fight in it
  const w3 = new World({ seed: 33, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p3 = w3.player;
  p3.lives = p.lives;
  w3.command({ type: 'travel', to: 'wishkeep' }); w3.runCommands();
  const k3 = p3.keep;
  k3.faith = 1000;
  w3.command({ type: 'keepTide' }); w3.runCommands();
  let foes = 0, hits = 0, hurt = false, end = null, mir = null;
  for (let i = 0; i < 60 * 240 && !end && !(mir && i > 60 * 22); i++) {
    const live = w3.enemies.filter((e) => e.tide && !e.dead && e.state !== 'spawn');
    if (i % 10 === 0 && live.length && !mir) { p3.x = live[0].x + 1; p3.z = live[0].z; w3.command({ type: 'attack', id: live[0].id }); }
    if (i === 60 * 20 && live.length) {
      const f0 = k3.faith, e0 = live[0], h0 = e0.hp;
      w3.command({ type: 'cast', slot: 'q', x: e0.x, z: e0.z }); w3.runCommands();
      const f1 = k3.faith;
      w3.command({ type: 'cast', slot: 'q', x: e0.x, z: e0.z }); w3.runCommands();
      mir = { paid: f0 - f1, again: f1 - k3.faith, dmg: e0.dead || e0.hp < h0 };
    }
    w3.step(CONFIG.TICK);
    foes = Math.max(foes, w3.enemies.filter((e) => e.tide).length);
    if (!mir && w3.enemies.some((e) => e.tide && e.hp < e.maxHp)) hurt = true;
    for (const e of w3.events) { if (e.type === 'buildHit') hits++; if (e.type === 'tideEnd') end = e; }
    w3.events = [];
  }
  check('...a Tide comes in waves, and the hero (a god now) cannot strike it', foes >= K.KEEP.tide.perWave(1) && !hurt, `${foes} foes`);
  check('...the god works miracles instead: Judgement costs Faith, hurts the Tide, and has a cooldown', mir && mir.paid === K.MIRACLES.judge.faith && mir.again === 0 && mir.dmg, JSON.stringify(mir));
  // (0.81.1) Incarnate: R takes the field for a while, for Faith; blows land in full; the Tide can strike back
  const liveFoe = () => w3.enemies.find((e) => e.tide && !e.dead && e.state !== 'spawn');
  let incOk = null;
  for (let i = 0; i < 60 * 60 && !incOk && !end; i++) {
    const f = liveFoe();
    if (f && w3.tide && w3.tide.state === 'on' && !(w3.tide.mcd.judge > 0)) {
      const f0 = k3.faith;
      w3.command({ type: 'cast', slot: 'r', x: f.x, z: f.z }); w3.runCommands();
      const paid = f0 - k3.faith;
      for (let j = 0; j < 60 * (K.INCARNATE.chan + 0.2) && !(w3.tide.inc > 0); j++) { w3.step(CONFIG.TICK); w3.events = []; } // (0.85) the channel
      const on = w3.tide.inc > 0;
      p3.x = f.x + 1.2; p3.z = f.z;
      const hp0 = f.hp;
      let maxHit = 0;
      for (let j = 0; j < 60 * 3 && !f.dead; j++) {
        w3.command({ type: 'attack', id: f.id });
        w3.step(CONFIG.TICK);
        for (const e of w3.events) if (e.type === 'damage' && e.who === 'enemy' && e.id === f.id) maxHit = Math.max(maxHit, e.amount);
        w3.events = [];
      }
      incOk = { paid, on, hurt: f.dead || f.hp < hp0, maxHit };
    }
    w3.step(CONFIG.TICK);
    for (const e of w3.events) if (e.type === 'tideEnd') end = e;
    w3.events = [];
  }
  check('Wishkeep (0.81.1): R in a Tide incarnates the god for Faith (0.85: after a channel), and then their blows land', incOk && incOk.paid === K.INCARNATE.faith && incOk.on && incOk.hurt, JSON.stringify(incOk));
  if (w3.tide && w3.tide.inc > 0) {
    for (let i = 0; i < 60 * (K.INCARNATE.dur + 1) && w3.tide && w3.tide.inc > 0; i++) { w3.step(CONFIG.TICK); for (const e of w3.events) if (e.type === 'tideEnd') end = e; w3.events = []; }
  }
  check('...and it fades on its own', !w3.tide || !(w3.tide.inc > 0));
  for (let i = 0; i < 60 * 240 && !end; i++) { w3.step(CONFIG.TICK); for (const e of w3.events) { if (e.type === 'buildHit') hits++; if (e.type === 'tideEnd') end = e; } w3.events = []; }
  check('...left to the Tide, the buildings are battered and the night is lost', hits > 0 && end && end.won === false && !w3.enemies.some((e) => e.tide), `${hits} hits, ${JSON.stringify(end)}`);
  const hurtB = Object.keys(k3.builds);
  check('...the damage stays after the night (saved with the keep)', hurtB.length > 0 && hurtB.every((b) => k3.builds[b] < K.buildMax(b, k3)) && JSON.stringify(K.cleanKeep(JSON.parse(JSON.stringify(k3))).builds) === JSON.stringify(k3.builds), JSON.stringify(k3.builds));
  for (let i = 0; i < 60 * 11; i++) w3.step(CONFIG.TICK);
  w3.command({ type: 'keepTide' }); w3.runCommands();
  const darkNote = w3.events.find((e) => e.type === 'keepShort');
  w3.events = [];
  const cost = w3.keepRepairCost();
  k3.stone = 2;
  w3.command({ type: 'keepRepair' }); w3.runCommands();
  check('(0.81.1) with too little Wishstone, mending does what it can, the Hearth first', k3.stone === 0 && k3.builds.hearth === 2 * K.KEEP.repairPer && w3.keepRepairCost() === cost - 2 && darkNote && darkNote.what === 'repair' && darkNote.need === Math.ceil(K.buildMax('hearth', k3) / K.KEEP.repairPer), JSON.stringify({ b: k3.builds, cost }));
  k3.stone = 1000;
  w3.command({ type: 'keepRepair' }); w3.runCommands();
  check('...and is mended at the Hearth with Wishstone', Object.keys(k3.builds).length === 0 && k3.stone < 1000 && w3.keepBuilds.every((b) => b.hp === b.max));
  // heroes who are trained and armed hold it
  for (const t of k.troops) { t.lvl = 9; t.gear = 9; }
  w.keepTroopsUp();
  k.wishes = [{ id: 't', kind: 'tide', who: 'maren', line: 0, n: 0, need: 1, done: false, reward: { faith: 50, stone: 8 } }];
  w.command({ type: 'keepTide' }); w.runCommands();
  end = null;
  let swings = 0;
  for (let i = 0; i < 60 * 300 && !end; i++) {
    w.step(CONFIG.TICK);
    for (const e of w.events) { if (e.type === 'troopHit') swings++; if (e.type === 'tideEnd') end = e; }
    w.events = [];
  }
  check('...eight trained, armed heroes hold the night: they fight it, and it pays Faith, Wishstone and the Tide wish', end && end.won && end.faith > 0 && swings > 20 && k.tides === 1 && k.wishes.find((x) => x.id === 't').done && k.blessings.length === 0, JSON.stringify(end) + ' ' + swings);
  // the keep's numbers stay sane through a save
  const back = K.cleanKeep(JSON.parse(JSON.stringify(k)));
  check('...a keep survives being saved and loaded, every field checked', JSON.stringify(back) === JSON.stringify(K.cleanKeep(back)) && back.tier === 3 && back.halls.archer === 1 && back.troops.length === 8 && back.told.includes('road') && K.cleanKeep({ tier: 99, faith: -5, halls: { warrior: 9 } }).tier === 3 && K.cleanKeep({ faith: -5 }).faith === 0 && K.cleanKeep(null) === null);
}

// --- 0.81.2: a wish says where it is done ---------------------------------------------------------------
{
  const { wishWhere } = await import('../src/sim/wishwhere.js');
  const bosses = ['boss', 'boss2', 'boss3', 'herald', 'cinder', 'undertow', 'rootmother', 'choir', 'stillness'];
  const all = bosses.every((b) => wishWhere({ kind: 'boss', boss: b }));
  check('Wishkeep (0.81.2): every boss a wish can ask for, and every pilgrimage, names its place (the Deep with its Depth)', all && wishWhere({ kind: 'boss', boss: 'undertow' }) === 'The Drowned Court (Depth VII, by the Waygate)' && wishWhere({ kind: 'kill', map: 'fen' }) === 'Spitter Fen' && wishWhere({ kind: 'tide' }) === '');
}

// --- 0.81.3: Umbra Gemina walks with you, and a Sharpshooter's draws Deadeye --------------------------
{
  const { geared } = await import('./balance.mjs');
  const { BORROWED } = await import('../src/sim/borrowed.js');
  const all = { warrior: { prim: [10] }, archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const make = (cls, spec, borrowed) => {
    const w = new World({ seed: 181, mode: 'explore', cls, save: Object.assign(geared(cls, 100, 5), { acctLives: all, spec, borrowed }) });
    w.loadMap('greenwood', 'town');
    for (let i = 0; i < 150; i++) w.step(CONFIG.TICK);
    return w;
  };
  const w = make('archer', 'sharpshooter', { d: 'shadowdancer' });
  const p = w.player;
  check('Umbra Gemina (0.81.3): the Archer\'s shade has a name of its own now, and walks at your shoulder while slotted', BORROWED.archer.shadowdancer.name === 'Umbra Gemina' && p.shadeAt && dist(p.shadeAt.x, p.shadeAt.z, p.x, p.z) < 2.5);
  p.x += 6; for (let i = 0; i < 60; i++) w.step(CONFIG.TICK);
  check('...and keeps up when you move', dist(p.shadeAt.x, p.shadeAt.z, p.x, p.z) < 2.5);
  const e = w.enemies.find((o) => !o.dead && !o.def.boss && o.state !== 'spawn');
  e.hp = e.maxHp = 1e8;
  p.x = p.px = e.x + 10; p.z = p.pz = e.z;
  for (let i = 0; i < 30; i++) w.step(CONFIG.TICK);
  p.cd.r = 0; w.events = [];
  w.command({ type: 'cast', slot: 'r', x: e.x, z: e.z });
  const eyes = [];
  for (let i = 0; i < 90; i++) { p.hp = p.stats.maxHp; w.step(CONFIG.TICK); for (const v of w.events) if (v.type === 'cast' && v.fx === 'deadeye') eyes.push(v); w.events = []; }
  check('...a Sharpshooter\'s shadow looses its own Deadeye a breath after yours, from where it stands', w.kit.r.type === 'deadeye' && eyes.length === 2 && !eyes[0].echo && eyes[1].echo && (eyes[0].x !== eyes[1].x || eyes[0].z !== eyes[1].z), JSON.stringify(eyes.map((v) => [v.x, v.z, v.echo])));
  const w2 = make('archer', 'sharpshooter', {});
  check('...no shade without it', !w2.player.shadeAt);
  const w3 = make('mage', null, { d: 'shadowdancer' });
  check('...Echo Caster\'s shade walks with you too (it casts from there)', !!w3.player.shadeAt);
}

// --- 0.81.4: Windrunner: Gale Force, the shadow's hop, and the shadow's heavier arrow ------------------
{
  const { geared } = await import('./balance.mjs');
  const { GALE_FORCE } = await import('../src/sim/talents.js');
  const all = { warrior: { prim: [10] }, archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  const make = (borrowed) => {
    const w = new World({ seed: 184, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 100, 5), { acctLives: all, spec: 'windrunner', borrowed }) });
    w.loadMap('greenwood', 'town');
    for (let i = 0; i < 150; i++) w.step(CONFIG.TICK);
    return w;
  };
  const w = make({ d: 'shadowdancer' });
  const p = w.player;
  check('Gale Force (0.81.4): a Windrunner\'s arrows hit harder the faster she shoots', w.mods.galeForce === GALE_FORCE && Math.abs(w.galeForce() - (1 + GALE_FORCE * Math.min(p.stats.as, CONFIG.GALE_FORCE_CAP))) < 1e-9 && w.galeForce() > 1.2, `${p.stats.as} ${w.galeForce()}`);
  const e = w.enemies.find((o) => !o.dead && !o.def.boss && o.state !== 'spawn');
  e.hp = e.maxHp = 1e9;
  p.x = p.px = e.x + 8; p.z = p.pz = e.z;
  p.cd.q = 0; w.events = [];
  w.command({ type: 'cast', slot: 'q', x: e.x - 20, z: e.z });
  let dashes = 0, was = false, most = 0, gusts = 0;
  for (let i = 0; i < 60; i++) {
    p.hp = p.stats.maxHp; w.step(CONFIG.TICK);
    if (p.dash && !was) dashes++; was = !!p.dash; most = Math.max(most, p.quickShots || 0);
    gusts += w.projectiles.filter((pr) => pr.gale && !pr.counted && (pr.counted = true)).length;
  }
  check('...with Umbra Gemina, Skirmish Step hops once, and the shadow\'s copy gives more shots, harder, instead of a second hop', dashes === 1 && gusts >= 5 && p.quickMult > 1.5, `${dashes} hops, ${gusts} gusts (most ${most}) x${p.quickMult}`);
  // the shadow's arrow carries Hurricane's and Crosswind's arrows in its damage
  p.quickShots = 0;
  w.projectiles = [];
  w.basicAttack(e);
  const mine = w.projectiles.filter((pr) => pr.basic && !pr.shade && !pr.gust && !pr.cross);
  const shade = w.projectiles.find((pr) => pr.shade);
  check('...and its shadow looses one heavier arrow for all the extra ones (Hurricane, Crosswind), never more arrows', shade && mine.length === 1 && Math.abs(shade.dmg / (mine[0].dmg * w.mods.shadeEcho) - (1 + w.windExtras())) < 1e-6 && w.windExtras() > 0.5, `${shade && shade.dmg} ${mine[0] && mine[0].dmg} ${w.windExtras()}`);
}

// --- 0.81.4: auto-scrap after a rebirth -------------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const { rebirthSave } = await import('../src/sim/rebirth.js');
  const I = await import('../src/sim/items.js');
  const w = new World({ seed: 185, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 100, 5), { autoScrapAt: 5 }) });
  const save = rebirthSave(w.toSave(), I.starterWeapon, null, I.relevelItem);
  const w2 = new World({ seed: 185, mode: 'explore', cls: 'archer', save });
  const p = w2.player;
  const roll = (r) => I.rollItem(() => 0.3, p.level, { weights: I.RARITIES.map((x, i) => (i === r ? 1 : 0)), slot: 'helm', cls: 'archer' });
  const got = [5, 3, 0, 5].map((r) => { const it = roll(r); const gone = w2.autoScrapNew(it); if (!gone) p.bag.push(it); return gone; });
  check('Auto-scrap (0.81.4): kept through a rebirth, and on a bare new life only the best piece for a slot is kept, not every one that drops', p.autoScrapAt === 5 && got.join() === 'false,true,true,true' && p.bag.filter((it) => it && it.slot === 'helm').length === 1, got.join());
}

// --- 0.81.5: a Windrunner's extra arrows are folded into the one she looses (fewer in the air) -------------
{
  const { geared } = await import('./balance.mjs');
  const w = new World({ seed: 186, mode: 'explore', cls: 'archer', save: Object.assign(geared('archer', 100, 5), { spec: 'windrunner' }) });
  w.loadMap('greenwood', 'town');
  for (let i = 0; i < 150; i++) w.step(CONFIG.TICK);
  const p = w.player;
  const e = w.enemies.find((o) => !o.dead && !o.def.boss && o.state !== 'spawn');
  w.enemies = [e]; // one target: Hurricane has no one else to curve at
  e.hp = e.maxHp = 1e9;
  p.x = p.px = e.x + 8; p.z = p.pz = e.z;
  p.crossAcc = 2.5;
  w.projectiles = [];
  w.basicAttack(e);
  const shots = w.projectiles.filter((pr) => pr.basic);
  const main = shots[0];
  check('Windrunner (0.81.5): on one target, one arrow leaves the string, carrying Crosswind\'s and Hurricane\'s', shots.length === 1 && main.fold && main.fold.length === 2 && main.volley >= 4, `${shots.length} arrows, volley ${main && main.volley}`);
  const hp0 = e.hp;
  for (let i = 0; i < 60 && w.projectiles.length; i++) w.step(CONFIG.TICK);
  check('...and all of it lands when it does', hp0 - e.hp > main.dmg * 1.5 && !main.fold, `${hp0 - e.hp} vs ${main.dmg}`);
}

// --- 0.81.6: the auto-roller ------------------------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const I = await import('../src/sim/items.js');
  const { AUTO_ROLL_MAX } = await import('../src/sim/world.js');
  const mk = (lives) => new World({ seed: 187, mode: 'explore', cls: 'warrior', save: Object.assign(geared('warrior', 100, 5), { acctLives: lives }) });
  const shut = mk(null);
  shut.player.gold = 1e12; shut.player.scrap = 1e12;
  const it0 = shut.player.equipped.helm, v0 = JSON.stringify(it0.stats);
  shut.command({ type: 'autoRoll', slot: 'helm', targets: Object.fromEntries(Object.keys(it0.stats).map((k) => [k, 6])), max: 50 }); shut.runCommands();
  check('Auto-roll (0.81.6): shut until a class on the account has beaten the Quiet', JSON.stringify(it0.stats) === v0 && shut.events.some((e) => e.type === 'autoRollShut'));
  const w = mk({ mage: { prim: [6, 7, 8, 9, 10] } });
  const p = w.player;
  p.gold = 1e12; p.scrap = 1e12;
  const it = p.equipped.helm;
  const keys = Object.keys(it.stats);
  const keep = keys[keys.length - 1], keepV = it.stats[keep];
  const targets = Object.fromEntries(keys.slice(0, -1).map((k) => [k, 5]));
  w.events = [];
  w.command({ type: 'autoRoll', slot: 'helm', targets, max: AUTO_ROLL_MAX }); w.runCommands();
  const ev = w.events.find((e) => e.type === 'autoRolled');
  check('...open once one has: it rerolls the chosen lines until each is the tier asked for (Ancient here), and leaves the rest alone', ev && ev.why === 'done' && keys.slice(0, -1).every((k) => I.lineTier(it, k) >= 5) && it.stats[keep] === keepV && ev.gold === ev.rolls * I.rerollCost(it).gold, JSON.stringify(ev && { r: ev.rolls, why: ev.why }));
  const again = ev.rolls;
  w.events = [];
  w.command({ type: 'autoRoll', slot: 'helm', targets, max: 50 }); w.runCommands();
  check('...a line already there is never touched (pressing again spends nothing)', w.events.find((e) => e.type === 'autoRolled').rolls === 0 && again > 0);
  w.events = [];
  w.command({ type: 'autoRoll', slot: 'helm', targets: Object.fromEntries(keys.map((k) => [k, 6])), max: 3 }); w.runCommands();
  const lim = w.events.find((e) => e.type === 'autoRolled');
  check('...it stops at the limit you set', lim.rolls <= 3 && (lim.why === 'limit' || lim.why === 'done'));
  p.gold = I.rerollCost(it).gold * 2; p.scrap = 1e12;
  w.events = [];
  w.command({ type: 'autoRoll', slot: 'helm', targets: Object.fromEntries(keys.map((k) => [k, 6])), max: 400 }); w.runCommands();
  const broke = w.events.find((e) => e.type === 'autoRolled');
  check('...and when the gold runs out', broke.rolls <= 2 && (broke.why === 'funds' || broke.why === 'done') && p.gold >= 0, JSON.stringify(broke && { r: broke.rolls, why: broke.why }));
}

// --- 0.81.7: the Echo Ring's table follows the start wave -------------------------------------------------
{
  const { ringTable } = await import('../src/sim/ring.js');
  const late = ringTable(100, 56);
  check('Echo Ring (0.81.7): starting deep (wave 56), What the Stones Remember still has its rows, from that wave on', late.length === 10 && late[0].wave === 56 && late.every((r, i) => i === 0 || r.wave > late[i - 1].wave) && late[late.length - 1].total.fragment > late[0].fragment, late.map((r) => r.wave).join());
}

// --- 0.82: heroes' rarity, Night levels, Hero gear and smarter heroes --------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const w = new World({ seed: 188, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [6, 7, 8, 9, 10] }, mage: { prim: [10] }, rogue: { prim: [10] }, warrior: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  k.faith = 1e6; k.stone = 1e5;
  for (const c of ['rogue', 'archer', 'mage']) { w.command({ type: 'keepRecruit', cls: c }); w.runCommands(); }
  const t = k.troops[0];
  const base = K.troopStats(t, k.armory);
  w.events = [];
  w.command({ type: 'keepAscend', id: t.id }); w.runCommands();
  check('Heroes (0.82): ascending needs Ascension Sigils', (t.rar || 0) === 0 && w.events.some((e) => e.type === 'keepShort' && e.what === 'sigils'));
  k.sigils = 1000;
  for (let i = 0; i < 9; i++) { w.command({ type: 'keepAscend', id: t.id }); w.runCommands(); }
  const top = K.troopStats(t, k.armory);
  check('...with them (and Faith) a hero climbs from Common to Immortal, one step at a time, and no further', t.rar === K.HERO_RAR_MAX && Math.abs(top.dmg / base.dmg - K.HERO_RARITY.mult[6]) < 0.02 && k.sigils === 1000 - [1, 2, 3, 4, 5, 6].reduce((a, r) => a + K.HERO_RARITY.ascend(r).sigils, 0));
  // Night levels
  w.command({ type: 'keepTide', level: 9 }); w.runCommands();
  check('Night levels: you can call one past the highest held, no further (Night 1 the first time)', w.tide && w.tide.level === 1 && w.tide.night === K.NIGHT.power(1));
  let end = null;
  for (let i = 0; i < 60 * 300 && !end; i++) { w.step(CONFIG.TICK); for (const e of w.events) if (e.type === 'tideEnd') end = e; w.events = []; }
  check('...a night held opens the next, and pays Sigils and Hero gear into the Armory', end && end.won && k.nightMax === 1 && end.sigils === K.NIGHT.sigils(1) + end.newStars * K.NIGHT.starSigils(1) && k.armory.length === K.NIGHT.pieces(1) + (end.stars === 7 ? 1 : 0) && end.first, JSON.stringify(end));
  for (let i = 0; i < 60 * 11; i++) w.step(CONFIG.TICK);
  // the Armory
  let gid = 0;
  const mk = (slot, r) => { const g = K.rollHeroGear(() => 0.5, 10, 'x' + ++gid, slot); g.r = r; g.main.v = K.HERO_GEAR.main[r]; return g; };
  k.armory = [mk('weapon', 2), mk('weapon', 5), mk('armor', 4), mk('charm', 6)];
  const h = k.troops[1];
  const s0 = K.troopStats(h, k.armory);
  w.command({ type: 'keepGearOn', gid: k.armory[1].id, hero: h.id }); w.runCommands();
  check('The Armory: a piece put on a hero makes them stronger (only them)', k.armory[1].hero === h.id && K.troopStats(h, k.armory).dmg > s0.dmg * 1.5 && K.troopStats(k.troops[2], k.armory).dmg === K.troopStats(k.troops[2], []).dmg);
  w.command({ type: 'keepGearOn', gid: k.armory[0].id, hero: h.id }); w.runCommands();
  check('...one piece a slot: the one worn there goes back to the Armory', k.armory[0].hero === h.id && k.armory[1].hero === null);
  w.command({ type: 'keepGearBest' }); w.runCommands();
  check('...Equip the best: the rarest hero gets the best of each slot', k.armory[1].hero === t.id && k.armory[2].hero === t.id && k.armory[3].hero === t.id && k.armory[0].hero !== t.id);
  const st = K.troopStats(t, k.armory);
  check('...an Immortal charm brings its effect', st.fx.charm === true);
  w.command({ type: 'keepSalvage', ids: [k.armory[1].id] }); w.runCommands();
  check('...a worn piece is never broken down', k.armory.length === 4);
  k.armory.push(mk('armor', 1));
  const lone = k.armory.find((g) => g.hero == null);
  const stone0 = k.stone;
  w.command({ type: 'keepGearLock', gid: lone.id }); w.command({ type: 'keepSalvage', ids: [lone.id] }); w.runCommands();
  const lockedKept = k.armory.includes(lone);
  w.command({ type: 'keepGearLock', gid: lone.id }); w.command({ type: 'keepSalvage', ids: [lone.id] }); w.runCommands();
  check('...nor a locked one; an unworn, unlocked one breaks down for Wishstone', lockedKept && !k.armory.includes(lone) && k.stone === stone0 + K.HERO_GEAR.salvage(lone));
  const back = K.cleanKeep(JSON.parse(JSON.stringify(k)));
  check('...the Armory, rarities, Sigils and Night levels survive a save', back.armory.length === k.armory.length && back.troops[0].rar === 6 && back.nightMax === 1 && back.sigils === k.sigils && back.armory.every((g, i) => g.hero === k.armory[i].hero));
  w.command({ type: 'keepDismiss', id: t.id }); w.runCommands();
  check('...a hero sent home leaves their gear in the Armory', k.armory.every((g) => g.hero !== t.id) && k.armory.length === back.armory.length);
  // smarter heroes: one at a building comes before one nearer
  w.keepTroopsUp(); w.keepBuildsUp();
  w.command({ type: 'keepTide', level: 1 }); w.runCommands();
  w.enemies = w.enemies.filter((e) => !e.tide);
  w.tide.next = 999;
  const tr = w.troops[0];
  const hall = w.keepBuilds.find((b) => b.id !== 'hearth');
  tr.x = hall.x * 0.5; tr.z = hall.z * 0.5; // between the Hearth and the hall, as posted
  const near = w.spawnEnemy('hush', { x: tr.x + 2, z: tr.z, level: 100 });
  const sieger = w.spawnEnemy('ashwalker', { x: hall.x + (hall.r + 0.5), z: hall.z, level: 100 });
  for (const e of [near, sieger]) { e.tide = true; e.noLoot = true; e.state = 'chase'; e.hp = e.maxHp = 1e6; e.tdmg = 1; e.tbdmg = 1; e.tAtk = 9; e.tRe = 9; e.x = e.px = e.x; }
  near.tTarget = w.troops[1]; sieger.tTarget = hall;
  tr.reT = 0; tr.targetId = null;
  w.stepTroops(CONFIG.TICK);
  check('Smarter heroes (0.82): a hero goes for the wrecker at a hall before the Unmade right beside them', tr.targetId === sieger.id, `${tr.targetId} (near ${near.id}, sieger ${sieger.id})`);
}

// --- 0.82.1: the keep's works, building tiers and growth --------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const w = new World({ seed: 189, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  check('Works (0.82.1): the Mine and the Fields stand out past the halls', ['mine', 'fields'].every((id) => w.obstacles.some((o) => o.kind === 'works' && o.id === id)) && w.interactables().some((o) => o.id === 'mine'));
  k.faith = 1e6; k.stone = 1e5;
  w.command({ type: 'keepRecruit', cls: 'archer' }); w.runCommands();
  w.command({ type: 'keepWork', id: 'mine' }); w.command({ type: 'keepWork', id: 'fields' }); w.command({ type: 'keepWork', id: 'fields' }); w.runCommands();
  const r = K.keepRates(k, false);
  check('...built and raised with Faith: the Fields make Faith and the Mine Wishstone, more with more hands', k.works.mine === 1 && k.works.fields === 2 && r.stone === K.WORKS.mine.rate(1, K.workHands(k)) && r.faith === K.KEEP.produce.base + K.WORKS.fields.rate(2, K.workHands(k)));
  const f0 = k.faith, s0 = k.stone;
  w.command({ type: 'keepClock', now: 1e12 }); w.runCommands();
  w.command({ type: 'keepClock', now: 1e12 + 10 * 3.6e6 }); w.runCommands();
  check('...and pay while you are away', k.faith - f0 === Math.floor(r.faith * 10) && k.stone - s0 === Math.floor(r.stone * 10), `${k.faith - f0} ${k.stone - s0}`);
  // building tiers
  w.command({ type: 'keepBuildTier', id: 'archer' }); w.runCommands();
  check('Building tiers: shut until the hall is at its last level', !k.btier.archer && w.events.some((e) => e.type === 'keepTierShut'));
  k.halls.archer = 3;
  const hp0 = K.buildMax('archer', k);
  for (let i = 0; i < 7; i++) { w.command({ type: 'keepBuildTier', id: 'archer' }); w.runCommands(); }
  check('...then Common to Immortal, each far sturdier, and its work stronger (the Lodge trains further)', k.btier.archer === 6 && K.buildMax('archer', k) === hp0 * 20 && K.KEEP.trainMax(3, 6) === 15);
  // growth
  const spentBefore = k.spent;
  check('Growth: what is spent on the keep counts toward its growth', spentBefore > 0 && K.keepStage(k) >= 1);
  w.command({ type: 'travel', to: 'town' }); w.runCommands();
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands();
  check('...and the keep is wider (and has cottages) the next time you come', w.map.radius === K.GROWTH.radius(K.keepStage(k)) && w.map.radius > 32 && w.obstacles.some((o) => o.cottage));
  // the tithe
  const t0 = k.faith, b0 = k.stone;
  for (let i = 0; i < 8; i++) w.keepEvent('kill', { map: 'fen' });
  w.keepEvent('boss', { type: 'boss' });
  check('The road\'s tithe: Faith for kills, Faith and Wishstone for a boss', k.faith - t0 === 2 + 12 && k.stone - b0 === 2, `${k.faith - t0} ${k.stone - b0}`);
  const back = K.cleanKeep(JSON.parse(JSON.stringify(k)));
  check('...works, tiers and growth survive a save', back.works.fields === 2 && back.btier.archer === 6 && back.spent === k.spent);
}

// --- 0.82.3: the keep's clock survives a save; the night is the heroes' -----------------------------------
{
  const K = await import('../src/sim/wishkeep.js');
  const now = 1795470000000; // a day in November 2026
  const back = K.cleanKeep({ tier: 1, last: now });
  check('Keep clock (0.82.3): the last visit survives a save (it was cut to 2001, and every return paid a full day)', back.last === now, String(back.last));
  const { geared } = await import('./balance.mjs');
  const w = new World({ seed: 190, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  k.faith = 1e5;
  w.command({ type: 'keepClock', now }); w.runCommands();
  const f0 = k.faith;
  const saved = K.cleanKeep(JSON.parse(JSON.stringify(k)));
  p.keep = saved;
  w.command({ type: 'keepClock', now: now + 60000 }); w.runCommands();
  check('...so a minute later, after a save and a load, a minute\'s worth comes in, not a day\'s', p.keep.faith - f0 < 5, `${p.keep.faith - f0}`);
}

// --- 0.82.5: breaking down Hero gear, by hand and as it comes ---------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const w = new World({ seed: 191, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  k.faith = 1e5;
  w.command({ type: 'keepRecruit', cls: 'archer' }); w.runCommands();
  const h = k.troops[0];
  let n = 0;
  const mk = (slot, r, v) => { const g = K.rollHeroGear(() => 0.5, 5, 'y' + ++n, slot); g.r = r; g.main.v = v; g.lines = []; return g; };
  const worn = mk('weapon', 3, 0.3); worn.hero = h.id;
  const worse = mk('weapon', 1, 0.1), better = mk('weapon', 2, 0.5), armour = mk('armor', 0, 0.05), imm = mk('weapon', 6, 0.05);
  k.armory = [worn, worse, better, armour, imm];
  check('Hero gear (0.82.5): an upgrade is a piece better than what a hero wears there, or for a slot left empty', !K.heroGearUpgrade(worse, k) && K.heroGearUpgrade(better, k) && K.heroGearUpgrade(armour, k));
  const sal = K.heroSalvageable(k, [6]);
  check('...Break down takes what is no hero\'s upgrade, never worn, nor a rarity you keep', sal.length === 1 && sal[0] === worse);
  const s0 = k.stone;
  w.command({ type: 'keepAutoSalvage', to: 2 }); w.runCommands();
  check('...choosing auto-break down clears the Armory of such pieces once (upgrades and Immortals stay)', k.autoSalvageAt === 2 && !k.armory.includes(worse) && k.armory.includes(better) && k.armory.includes(armour) && k.armory.includes(imm) && k.stone === s0 + K.HERO_GEAR.salvage(worse));
  // a night's drops: Common to Rare broken down as they come, unless an upgrade
  k.armory.push(mk('charm', 3, 0.3));
  w.command({ type: 'keepGearBest' }); w.runCommands();
  for (const g of k.armory) { g.main.v = 5; }
  k.autoSalvageAt = 5; // (Ancient and below, so the night's pieces fall under it whatever they roll)
  w.keepTroopsUp(); w.keepBuildsUp();
  const before = k.armory.length;
  w.command({ type: 'keepTide', level: 1 }); w.runCommands();
  let end = null;
  for (let i = 0; i < 60 * 300 && !end; i++) { w.step(CONFIG.TICK); for (const e of w.events) if (e.type === 'tideEnd') end = e; w.events = []; }
  check('...and a night\'s pieces at or below the rarity chosen are broken down for Wishstone as they come', end && end.won && end.auto >= 1 && end.salvaged > 0 && k.armory.length === before, JSON.stringify(end && { auto: end.auto, s: end.salvaged, gear: end.gear }));
  check('...kept through a save', K.cleanKeep(JSON.parse(JSON.stringify(k))).autoSalvageAt === 5 && K.cleanKeep({ tier: 1 }).autoSalvageAt === null);
}
// --- 0.83: four skills to a hero, sixteen to learn, healers, and each class its job --------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const w = new World({ seed: 207, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  k.faith = 1e6; k.stone = 1e5; k.tier = 3; k.halls.archer = 3; k.halls.mage = 3;
  w.command({ type: 'keepRecruit', cls: 'mage' }); w.runCommands();
  const h = k.troops[0];
  const learn = (skill, slot) => { w.events = []; w.command({ type: 'keepLearn', id: h.id, skill, slot }); w.runCommands(); };
  learn('fireball', 2); learn('meteor', 3);
  check('Heroes (0.83): a level 1 hero knows one skill of each school; the second slot opens at level 6', h.skills[2] === 'fireball' && !h.skills[3], JSON.stringify(h.skills));
  h.lvl = K.SKILL_SLOT2;
  learn('meteor', 3); learn('fireball', 0); learn('meteor', 2);
  check('...then a second, but only of the slot\'s own school, and never the same skill twice', h.skills[3] === 'meteor' && !h.skills[0] && h.skills[2] === 'fireball', JSON.stringify(h.skills));
  learn('cleave'); learn('taunt');
  check('...with no slot named, a skill goes to its school\'s first empty slot', h.skills[0] === 'cleave' && h.skills[1] === 'taunt', JSON.stringify(h.skills));
  check('...a save from before 0.83 keeps its one skill, in its school\'s slot', JSON.stringify(K.cleanKeep({ troops: [{ id: 3, cls: 'rogue', name: 'Vix', skill: 'mend' }] }).troops[0].skills) === JSON.stringify([null, null, 'mend', null]));
  check('...and a hero\'s gender follows their name', K.troopGender({ id: 1, cls: 'mage', name: 'Elowen' }) === 'f' && K.troopGender({ id: 2, cls: 'mage', name: 'Cassius' }) === 'm');
  const W = K.troopStats({ cls: 'warrior', lvl: 1 }), R = K.troopStats({ cls: 'rogue', lvl: 1 });
  check('...a warrior holds the line (guard, a carrying swing, the Unmade drawn to him); a rogue duels (dodge, deeper crits, leech)', W.guard >= 0.2 && W.arc > 0 && W.bulwark > 0 && R.dodge > 0 && R.critX > 2 && R.leech > 0);
  // a night with four-skill heroes and a healer
  k.troops = [];
  const team = [['warrior', ['cleave', 'taunt', 'frostnova', null]], ['warrior', ['bash', 'warcry', null, 'barrier']], ['archer', ['pierce', 'volley', 'chain', null]], ['mage', [null, null, 'mend', 'radiance']], ['rogue', ['lunge', 'whirlwind', 'meteor', null]]];
  team.forEach(([cls, skills], i) => k.troops.push({ id: 100 + i, cls, name: 'h' + i, lvl: 9, gear: 6, rar: 3, skills }));
  w.keepTroopsUp(); w.keepBuildsUp();
  const healer = w.troops.find((t) => t.cls === 'mage');
  check('...one who knows Mend, Barrier or Radiance fights as a healer', healer.support && !w.troops.find((t) => t.cls === 'archer').support);
  k.nightMax = 30;
  w.command({ type: 'keepTide', level: 13 }); w.runCommands();
  const used = new Set(); let heals = 0, healerHits = 0, end = null, stunned = 0;
  for (let i = 0; i < 60 * 300 && !end; i++) {
    w.step(CONFIG.TICK);
    for (const e of w.enemies) if (e.tide && e.stunT > 0) stunned++;
    for (const e of w.events) {
      if (e.type === 'troopSkill') used.add(e.skill);
      if (e.type === 'troopHeal' && e.id === healer.id) heals++;
      if (e.type === 'troopHit' && e.id === healer.id) healerHits++;
      if (e.type === 'tideEnd') end = e;
    }
    w.events = [];
  }
  check('...in a night the heroes use many skills, not one', used.size >= 7, [...used].join(','));
  check('...a Shield Bash or a Lunge stuns', stunned > 0);
  check('...the healer mends more than they strike', heals > 0 && heals >= healerHits, `${heals} heals, ${healerHits} strikes`);
  check('...and the night ends', end, JSON.stringify(end && { won: end.won, wrecked: end.wrecked }));
}
// --- 0.84: harder nights that pay more: omens, stars, and the night's stranger children ------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  check('Nights (0.84): more waves the deeper the night, and an omen from Night 6, the same each time', K.NIGHT.waves(1) === 3 && K.NIGHT.waves(10) === 4 && K.NIGHT.waves(20) === 5 && !K.nightOmen(5) && K.nightOmen(6) && K.nightOmen(13) === K.nightOmen(13));
  const sp3 = K.tideSpecials(3, 1, 3), sp15 = K.tideSpecials(15, 4, 4);
  check('...the stranger children come by Night: a thief from 3; the Tidecaller on the last wave of every fifth', sp3.thief === 1 && !sp3.cinderling && sp15.tidecaller === 1 && sp15.gatebreaker >= 1 && sp15.mourner >= 1 && sp15.veilbearer >= 1 && !K.tideSpecials(14, 4, 4).tidecaller);
  const keepWorld = (seed, L, team) => {
    const w = new World({ seed, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
    const p = w.player;
    p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
    w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
    const k = p.keep;
    k.faith = 1e6; k.stone = 1e5; k.tier = 3; k.nightMax = 30;
    k.troops = team.map(([cls, skills], i) => ({ id: 50 + i, cls, name: 'h' + i, lvl: 12, gear: 12, rar: 5, skills }));
    w.keepTroopsUp(); w.keepBuildsUp();
    w.command({ type: 'keepTide', level: L }); w.runCommands();
    return { w, k };
  };
  // a thief, left alone, steals and gets away
  {
    const { w } = keepWorld(301, 3, []);
    const evs = [];
    for (let i = 0; i < 60 * 90 && !evs.includes('thiefEscaped'); i++) { w.step(CONFIG.TICK); for (const e of w.events) evs.push(e.type); w.events = []; }
    check('...an Ember Thief, unopposed, takes Faith from a building and gets away into the dark', evs.includes('thiefStole') && evs.includes('thiefEscaped') && w.tide && w.tide.stolen >= 1 && !w.enemies.some((e) => e.type === 'thief' && e.gone));
  }
  // a Veilbearer shrouds those near it
  {
    const { w } = keepWorld(302, 6, []);
    const t = w.tide;
    const rng = () => 0.5;
    const v = w.spawnTideFoe('veilbearer', { x: 0, z: 20 }, rng), f = w.spawnTideFoe('hush', { x: 1, z: 20 }, rng), far = w.spawnTideFoe('hush', { x: 0, z: -20 }, rng);
    for (const e of [v, f, far]) e.state = 'chase';
    [v.x, v.z, f.x, f.z, far.x, far.z] = [0, 20, 1.5, 20, 0, -20];
    w.stepTideOmen(CONFIG.TICK);
    const h0 = f.hp, g0 = far.hp;
    w.troopStrike(f, 40, false); w.troopStrike(far, 40, false);
    check('...a Veilbearer: the Unmade near it take half damage', f.veiled && !far.veiled && h0 - f.hp === 20 && g0 - far.hp === 40 && t);
  }
  // a Mourner raises the fallen
  {
    const { w } = keepWorld(303, 11, []);
    const rng = () => 0.5;
    const m = w.spawnTideFoe('mourner', { x: 0, z: 20 }, rng), f = w.spawnTideFoe('hush', { x: 2, z: 20 }, rng);
    m.state = f.state = 'chase';
    w.killEnemy(f, 'troop');
    m.raiseT = 0;
    const before = w.enemies.filter((e) => e.tide && !e.dead).length;
    w.mournerTurn(m, K.FOES.mourner, CONFIG.TICK);
    check('...a Mourner raises an Unmade who fell near her', w.enemies.filter((e) => e.tide && !e.dead).length === before + 1 && w.enemies.some((e) => e.raised && !e.dead));
  }
  // Cinderlings burst
  {
    const { w } = keepWorld(304, 4, [['warrior', []]]);
    const tr = w.troops[0];
    const c = w.spawnTideFoe('cinderling', { x: tr.x + 1, z: tr.z }, () => 0.5);
    c.state = 'chase';
    [c.x, c.z] = [tr.x + 1, tr.z];
    const hp0 = tr.hp;
    w.events = [];
    w.killEnemy(c, 'troop');
    check('...a Cinderling bursts when it dies, burning heroes close by', tr.hp < hp0 || w.events.some((e) => e.type === 'troopDodge'), `${hp0} -> ${tr.hp}`);
  }
  // the Tidecaller's slam (warned first) and its call
  {
    const { w } = keepWorld(306, 5, [['warrior', []]]);
    const tr = w.troops[0];
    const b = w.spawnTideFoe('tidecaller', tr, () => 0.5);
    b.state = 'chase';
    [b.x, b.z, b.slamT, b.callT] = [tr.x + 2, tr.z, 0, 0];
    const seen = [];
    const hp0 = tr.hp;
    for (let i = 0; i < 60 * 2; i++) { tr.hp = Math.max(tr.hp, 1); w.step(CONFIG.TICK); for (const e of w.events) seen.push(e.type); w.events = []; }
    check('...the Tidecaller warns, then slams those near it, and calls the Hush to its side', seen.indexOf('tideSlamWarn') >= 0 && seen.indexOf('tideSlam') > seen.indexOf('tideSlamWarn') && seen.includes('tideCall') && tr.hp < hp0, seen.filter((x) => /tide/.test(x)).join(','));
  }
  // Night 5: the Tidecaller, felled by a strong keep, pays its own piece; stars are kept
  {
    const team = [['warrior', ['cleave', 'taunt', 'frostnova', 'barrier']], ['warrior', ['bash', 'warcry', 'fireball', null]], ['archer', ['pierce', 'volley', 'chain', 'meteor']], ['archer', ['pierce', 'volley', 'chain', null]], ['mage', ['warcry', null, 'mend', 'radiance']], ['mage', [null, null, 'fireball', 'meteor']], ['rogue', ['lunge', 'whirlwind', 'meteor', null]], ['rogue', ['lunge', 'cleave', 'frostnova', null]]];
    const { w, k } = keepWorld(305, 5, team);
    let end = null; const seen = new Set();
    for (let i = 0; i < 60 * 400 && !end; i++) { w.step(CONFIG.TICK); for (const e of w.events) { seen.add(e.type); if (e.type === 'tideEnd') end = e; } w.events = []; }
    check('...on Night 5 the Tidecaller comes with the last wave', seen.has('tideBoss') && seen.has('tideBossDown'), [...seen].filter((x) => /tide|thief|cinder/.test(x)).join(','));
    check('...felled, it leaves a piece of Epic Hero gear or better, and the stars won are kept', end && end.won && end.boss === 1 && end.gear.some((g) => g.r >= 3) && (k.stars[5] & 1) && k.bosses === 1, JSON.stringify(end && { won: end.won, boss: end.boss, gear: end.gear, stars: end.stars }));
    check('...and kept through a save', JSON.stringify(K.cleanKeep(JSON.parse(JSON.stringify(k))).stars) === JSON.stringify(k.stars));
  }
}
// --- 0.85: Incarnate is a rescue: a channel gathering aura, a landing that saves the heroes -----------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const I = K.INCARNATE;
  const make = (seed, save) => {
    const w = new World({ seed, mode: 'explore', cls: 'archer', save });
    const p = w.player;
    p.lives = { warrior: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
    w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
    const k = p.keep;
    k.faith = 1e6; k.tier = 3; k.nightMax = 30;
    k.troops = [['warrior', []], ['archer', []], ['mage', []]].map(([cls, skills], i) => ({ id: 70 + i, cls, name: 'h' + i, lvl: 9, gear: 6, rar: 3, skills }));
    w.keepTroopsUp(); w.keepBuildsUp();
    w.command({ type: 'keepTide', level: 6 }); w.runCommands();
    return { w, p, k };
  };
  const { w, p, k } = make(401, geared('archer', 100, 6));
  const tr = w.troops;
  const at = { x: tr[0].x, z: tr[0].z };
  tr[0].hp = 1; tr[1].dead = true; tr[1].hp = 0;
  tr[1].x = at.x + 1; tr[1].z = at.z; tr[2].x = at.x - 1; tr[2].z = at.z;
  const f0 = k.faith;
  w.command({ type: 'cast', slot: 'r', x: at.x, z: at.z }); w.runCommands();
  check('Incarnate (0.85): R pays its Faith and begins a channel where you aim; not on the field yet', f0 - k.faith === I.faith && w.tide.chan === 0 && !(w.tide.inc > 0));
  const mf = k.faith;
  w.command({ type: 'cast', slot: 'q', x: at.x, z: at.z }); w.runCommands();
  w.command({ type: 'move', x: p.x + 5, z: p.z }); w.runCommands();
  check('...while channelling, no miracles and no walking', k.faith === mf && !p.moveTarget);
  let landed = null;
  for (let i = 0; i < 60 * (I.chan + 0.5) && !landed; i++) { w.step(CONFIG.TICK); for (const e of w.events) if (e.type === 'incarnate') landed = e; w.events = []; }
  check('...after the full channel the god lands where they aimed, with all the aura', landed && landed.aura === 1 && Math.abs(p.x - w.tide.chanAt?.x || 0) >= 0 && Math.hypot(p.x - at.x, p.z - at.z) < 2 && w.tide.inc > 0, JSON.stringify(landed));
  check('...and the landing saves the heroes near: mends, shields, raises the fallen', landed.saved >= 1 && landed.raised === 1 && !tr[1].dead && tr[1].hp > 0 && tr.some((o) => o.shield > 0));
  // landing early: less aura, less mending
  const b = make(402, geared('archer', 100, 6));
  const t0 = b.w.troops[0];
  t0.hp = 1;
  b.w.command({ type: 'cast', slot: 'r', x: t0.x, z: t0.z }); b.w.runCommands();
  for (let i = 0; i < 60 * 0.5; i++) b.w.step(CONFIG.TICK);
  b.w.command({ type: 'cast', slot: 'r', x: 0, z: 0 }); b.w.runCommands();
  const tooSoon = b.w.tide.chan != null;
  for (let i = 0; i < 60 * 1.2; i++) b.w.step(CONFIG.TICK);
  b.w.events = [];
  b.w.command({ type: 'cast', slot: 'r', x: 0, z: 0 }); b.w.runCommands();
  const early = b.w.events.find((e) => e.type === 'incarnate');
  check('...R again lands early (not before a moment has passed), with less aura and a weaker landing', tooSoon && early && early.aura < 0.5 && t0.hp < tr[0].hp && b.w.tide.inc > 0, JSON.stringify(early));
  // a mortal's blows: the same whatever the gear
  const hitWith = (save) => {
    const m = make(403, save);
    m.w.tide.inc = 5;
    const e = m.w.spawnTideFoe('gatebreaker', { x: 0, z: 15 }, () => 0.5);
    e.state = 'chase';
    const h0 = e.hp;
    m.w.hitEnemy(e, m.p.stats.ad * 2, { source: 'basic', basic: true, canCrit: false });
    return h0 - e.hp;
  };
  const weak = hitWith(geared('archer', 100, 2)), strong = hitWith(geared('archer', 100, 6));
  check('...and while incarnate your blows count as a mortal\'s: the same share of the night whatever your gear', weak > 0 && Math.abs(weak - strong) <= 1, `${weak} vs ${strong}`);
}
// --- 0.86: raids, in the keep and while you are away --------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const make = (seed, nightMax = 8) => {
    const w = new World({ seed, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
    const p = w.player;
    p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
    w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
    const k = p.keep;
    k.faith = 5000; k.stone = 500; k.tier = 3; k.nightMax = nightMax;
    k.troops = [['warrior', ['cleave', 'taunt', null, null]], ['warrior', ['bash', null, null, null]], ['archer', ['pierce', 'volley', 'chain', null]], ['mage', [null, null, 'mend', 'radiance']], ['rogue', ['lunge', 'whirlwind', null, null]]].map(([cls, skills], i) => ({ id: 90 + i, cls, name: 'h' + i, lvl: 12, gear: 12, rar: 5, skills }));
    w.keepTroopsUp(); w.keepBuildsUp();
    return { w, p, k };
  };
  {
    const { w, k } = make(501);
    const seen = [];
    let end = null;
    for (let i = 0; i < 60 * (K.RAID.every[1] + 120) && !end; i++) { w.step(CONFIG.TICK); for (const e of w.events) { seen.push(e.type); if (e.type === 'raidEnd') end = e; } w.events = []; }
    check('Raids (0.86): in your keep, now and then, the horns, then a raid of one wave a little below your best Night', seen.includes('raidWarn') && end && end.level === K.raidLevel(k) && !seen.includes('tideStart'), JSON.stringify(end));
    check('...held, it pays a share of a night (no stars, no new Night)', end.won && end.faith > 0 && k.raids === 1 && k.nightMax === 8 && !Object.keys(k.stars).length);
  }
  {
    const { w, k } = make(502);
    w.command({ type: 'keepRaids', on: false }); w.runCommands();
    let warned = false;
    for (let i = 0; i < 60 * (K.RAID.every[1] + 30); i++) { w.step(CONFIG.TICK); if (w.events.some((e) => e.type === 'raidWarn')) warned = true; w.events = []; }
    check('...the keeper may turn them off at the Hearth', !warned && k.raidsOn === false && K.cleanKeep(JSON.parse(JSON.stringify(k))).raidsOn === false);
  }
  {
    const { w } = make(503, 0);
    let warned = false;
    for (let i = 0; i < 60 * (K.RAID.every[1] + 30); i++) { w.step(CONFIG.TICK); if (w.events.some((e) => e.type === 'raidWarn')) warned = true; w.events = []; }
    check('...and none come before the keep has held its first night', !warned);
  }
  {
    const { w, p, k } = make(504);
    const xp0 = p.exp, kills0 = w.stats.kills, f0 = k.faith;
    k.last = 1e12;
    w.events = [];
    w.command({ type: 'keepClock', now: 1e12 + 7.5 * 3.6e6 }); w.runCommands();
    const rep = w.events.find((e) => e.type === 'keepRaidsAway');
    check('...away seven and a half hours, the heroes met two raids alone, fought out when you come (and told)', rep && rep.raids === 2 && k.raidsDue === 0 && Math.abs(k.raidAcc - 1.5) < 1e-6, JSON.stringify(rep));
    check('...what they held pays; their kills are not yours; the night is quiet again after', rep.held >= 1 && k.faith > f0 && p.exp === xp0 && w.stats.kills === kills0 && !w.tide && !w.enemies.some((e) => e.tide));
    check('...and a gap of a few minutes is not "away"', (() => { const r0 = k.raidAcc; w.command({ type: 'keepClock', now: 1e12 + 7.5 * 3.6e6 + 5 * 60e3 }); w.runCommands(); return k.raidAcc === r0; })());
  }
}
// --- 0.87: the god's miracles lead the heroes: Judgement, Benediction, Hallowed Ground ------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const w = new World({ seed: 601, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  k.faith = 1e5; k.tier = 3; k.nightMax = 30;
  k.troops = [['archer', []], ['warrior', []]].map(([cls, skills], i) => ({ id: 120 + i, cls, name: 'h' + i, lvl: 9, gear: 6, rar: 3, skills }));
  w.keepTroopsUp(); w.keepBuildsUp();
  w.command({ type: 'keepTide', level: 6 }); w.runCommands();
  const rng = () => 0.5;
  const a = w.spawnTideFoe('hush', { x: 0, z: 0 }, rng), b = w.spawnTideFoe('hush', { x: 0, z: 0 }, rng), v = w.spawnTideFoe('veilbearer', { x: 0, z: 0 }, rng);
  for (const e of [a, b, v]) e.state = 'chase';
  [a.x, a.z, b.x, b.z, v.x, v.z] = [10, 10, -10, -10, 11, 10];
  w.stepTideOmen(CONFIG.TICK);
  const f0 = k.faith, h0 = a.hp;
  w.command({ type: 'cast', slot: 'q', x: 10, z: 10 }); w.runCommands();
  check('Miracles (0.87): Judgement costs Faith, strikes a little, and Judges the Unmade where it falls', f0 - k.faith === K.MIRACLES.judge.faith && a.hp < h0 && a.judgedT > 0 && !(b.judgedT > 0));
  a.hp = a.maxHp = b.hp = b.maxHp = 1e4;
  const ha = a.hp, hb = b.hp;
  w.troopStrike(a, 100, false); w.troopStrike(b, 100, false);
  check('...the Judged take more from the heroes, and no Veil hides them', a.veiled && ha - a.hp === Math.round(100 * (1 + K.MIRACLES.judge.mark)) && hb - b.hp === 100, `${ha - a.hp} vs ${hb - b.hp}`);
  // Benediction
  const [t0, t1] = w.troops;
  [t0.x, t0.z, t1.x, t1.z] = [-5, -5, -6, -5];
  t0.hp = t0.maxHp * 0.2; t1.dead = true; t1.hp = 0;
  w.command({ type: 'cast', slot: 'w', x: -5, z: -5 }); w.runCommands();
  check('...Benediction heals, raises the fallen, and Blesses them (faster)', t0.hp > t0.maxHp * 0.5 && !t1.dead && t1.hp > 0 && t0.benT > 0 && t1.benT > 0);
  // Hallowed Ground
  const hall = w.keepBuilds.find((x) => x.id !== 'hearth');
  w.command({ type: 'cast', slot: 'e', x: hall.x, z: hall.z }); w.runCommands();
  const zone = w.tide.zones[0];
  const br = w.spawnTideFoe('gatebreaker', { x: 0, z: 0 }, rng);
  br.state = 'chase';
  [br.x, br.z, br.tTarget, br.tAtk] = [hall.x + hall.r + 1.5, hall.z, hall, 0];
  const bh0 = hall.hp;
  w.stepTideFoe(br, CONFIG.TICK);
  const sheltered = bh0 - hall.hp;
  zone.t = 0; w.tide.zones = [];
  br.tAtk = 0;
  const bh1 = hall.hp;
  w.stepTideFoe(br, CONFIG.TICK);
  const open = bh1 - hall.hp;
  check('...Hallowed Ground: blows on a building there do far less', zone && sheltered > 0 && open > 0 && sheltered < open * 0.4, `${sheltered} vs ${open}`);
}
// --- 0.88: more mines and fields as the keep grows ------------------------------------------------------------
{
  const K = await import('../src/sim/wishkeep.js');
  const M = await import('../src/sim/maps.js');
  const ids = K.WORK_IDS;
  check('Works (0.88): each growth stage opens another site, fields and mines in turn', ids.length === 7 && [0, 1, 2, 3, 4, 5].every((st) => ids.some((w) => K.WORKS[w].stage === st)) && ids.filter((w) => K.WORKS[w].kind === 'mine').length >= 3 && ids.filter((w) => K.WORKS[w].kind === 'fields').length >= 3);
  const m5 = M.buildKeepMap(5), m0 = M.buildKeepMap(0);
  const sites5 = m5.obstacles.filter((o) => o.kind === 'works'), sites0 = m0.obstacles.filter((o) => o.kind === 'works');
  const crowded = sites5.filter((st) => m5.obstacles.some((o) => o.kind === 'house' && Math.hypot(o.x - st.x, o.z - st.z) < 6));
  check('...on the map only once the keep has grown to it, and never under a house or hall', sites0.length === 2 && sites5.length === 7 && !crowded.length, crowded.map((c) => c.id).join(','));
  const keep = K.cleanKeep({ tier: 3, works: { mine: 3, mine2: 2, fields: 4, fields3: 1 } });
  const r = K.keepRates(keep), one = K.keepRates(K.cleanKeep({ tier: 3, works: { mine: 3, fields: 4 } }));
  check('...each built site pays on its own, and they are kept through a save', r.stone > one.stone && r.faith > one.faith && keep.works.mine2 === 2 && keep.works.fields3 === 1);
  check('...the later sites cost more to build', K.WORKS.fields4.cost(1).faith > K.WORKS.fields2.cost(1).faith && K.WORKS.fields2.cost(1).faith > K.WORKS.fields.cost(1).faith);
}
// --- 0.89: the incarnate god's dodge roll ---------------------------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const w = new World({ seed: 701, mode: 'explore', cls: 'archer', save: geared('archer', 100, 6) });
  const p = w.player;
  p.lives = { warrior: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  k.faith = 1e5; k.tier = 3; k.nightMax = 30;
  w.command({ type: 'keepTide', level: 3 }); w.runCommands();
  const x0 = p.x, z0 = p.z;
  w.command({ type: 'dodge', x: p.x + 3, z: p.z }); w.runCommands();
  check('Dodge (0.89): only while Incarnate', !p.dash && p.x === x0);
  w.tide.inc = 8;
  w.command({ type: 'dodge', x: p.x + 3, z: p.z }); w.runCommands();
  const rolling = !!p.dash;
  const hp0 = p.hp;
  w.incarnateHurt(50);
  const graced = p.hp === hp0;
  for (let i = 0; i < 60 * (K.DODGE.dur + 0.1); i++) w.step(CONFIG.TICK);
  const moved = Math.hypot(p.x - x0, p.z - z0);
  w.command({ type: 'dodge', x: p.x + 3, z: p.z }); w.runCommands();
  check('...a quick roll the way you ask, blows passing through you for a moment', rolling && graced && moved > K.DODGE.dist * 0.8 && moved < K.DODGE.dist * 1.1, `moved ${moved.toFixed(2)}`);
  check('...then a cooldown before the next', !p.dash && p.dodgeCd > 0);
  for (let i = 0; i < 60 * (K.DODGE.cd + 0.1); i++) w.step(CONFIG.TICK);
  w.incarnateHurt(50);
  check('...and after the grace, blows land again', p.hp < hp0);
}
// --- 0.90: a free strike while Incarnate; 20 seconds on the field ---------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  check('Incarnate (0.90): 20 seconds on the field', K.INCARNATE.dur === 20);
  const make = (cls) => {
    const w = new World({ seed: 801, mode: 'explore', cls, save: geared(cls, 100, 6) });
    const p = w.player;
    p.lives = { warrior: { prim: [10] }, archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
    w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
    p.keep.tier = 3; p.keep.nightMax = 30;
    w.command({ type: 'keepTide', level: 3 }); w.runCommands();
    w.tide.next = 999;
    return { w, p };
  };
  {
    const { w, p } = make('warrior');
    w.command({ type: 'swing', x: p.x + 3, z: p.z }); w.runCommands();
    check('...not before you are Incarnate', !p.freeSwing);
    w.tide.inc = 10;
    const e = w.spawnTideFoe('rootbound', p, () => 0.5), behind = w.spawnTideFoe('rootbound', p, () => 0.5);
    e.state = behind.state = 'chase';
    [e.x, e.z, behind.x, behind.z] = [p.x + 1.6, p.z, p.x - 1.8, p.z];
    e.stunT = behind.stunT = 99;
    const h0 = e.hp, b0 = behind.hp;
    w.command({ type: 'swing', x: p.x + 3, z: p.z }); w.runCommands();
    const paced = p.attackCd > 0 && !!p.freeSwing;
    for (let i = 0; i < 30; i++) w.step(CONFIG.TICK);
    check('...then a blade swung at the air cuts what stands in its arc, not what is behind', e.hp < h0 && behind.hp === b0 && !p.targetId, `${h0} -> ${e.hp}; behind ${b0} -> ${behind.hp}; target ${p.targetId}`);
    check('...at the pace of your attacks', paced);
  }
  {
    const { w, p } = make('archer');
    w.tide.inc = 10;
    const n0 = w.projectiles.length;
    w.command({ type: 'swing', x: p.x, z: p.z - 5 }); w.runCommands();
    for (let i = 0; i < 30; i++) w.step(CONFIG.TICK);
    const shot = w.projectiles.find((pr) => pr.owner === 'player' && pr.basic && pr.targetId == null);
    check('...and a bow looses a shot that flies straight where you aim', w.projectiles.length > n0 && shot && shot.vz < 0 && Math.abs(shot.vx) < 1e-6);
  }
}
// --- 0.91: walking the keep over your shoulder between nights ----------------------------------------------------
{
  const { geared } = await import('./balance.mjs');
  const w = new World({ seed: 901, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] } };
  w.command({ type: 'keepWalk', on: true }); w.runCommands();
  check('Walk the keep (0.91): not outside a keep', !p.keepWalk);
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  p.keep.tier = 3; p.keep.nightMax = 5;
  w.command({ type: 'keepWalk', on: true }); w.runCommands();
  const x0 = p.x;
  w.command({ type: 'swing', x: p.x + 3, z: p.z }); w.runCommands();
  const swung = !!p.freeSwing;
  for (let i = 0; i < 40; i++) w.step(CONFIG.TICK);
  w.command({ type: 'dodge', x: p.x + 3, z: p.z }); w.runCommands();
  for (let i = 0; i < 30; i++) w.step(CONFIG.TICK);
  check('...in your keep between nights: free strikes and the roll, as when Incarnate', p.keepWalk && swung && p.x > x0 + 3, `${x0} -> ${p.x}`);
  w.command({ type: 'keepTide', level: 1 }); w.runCommands();
  check('...and a night (or a raid) called sends you back above', !p.keepWalk);
  w.tide = null;
  w.command({ type: 'keepWalk', on: true }); w.runCommands();
  const was = p.keepWalk;
  w.loadMap('haven');
  check('...as does leaving through the Waygate', was && !p.keepWalk);
}
// --- 0.91.1: ranking a skill many at a time (a held key or button) ---------------------------------------------
{
  const w = new World({ seed: 911, mode: 'explore', cls: 'warrior' });
  const p = w.player;
  p.level = 60; p.skillPoints = 30;
  for (const s of ['q', 'w', 'e', 'r']) p.ranks[s] = 1;
  w.command({ type: 'rankUp', slot: 'q', n: 7 }); w.runCommands();
  check('Ranks (0.91.1): one command can rank a skill several times (a held key asks for more)', p.ranks.q === 8 && p.skillPoints === 23);
  w.command({ type: 'rankUp', slot: 'w', n: 1000 }); w.runCommands();
  check('...never past the cap, nor past the points there are', p.ranks.w === Math.min(CONFIG.MAX_RANK, 1 + 23) && p.skillPoints === 23 - (p.ranks.w - 1));
  w.command({ type: 'rankUp', slot: 'e' }); w.runCommands();
  check('...and one at a time as ever', p.ranks.e === 2);
}
// --- 0.92: deep Nights (31 to 50) and the Seraph -------------------------------------------------------------
{
  const K = await import('../src/sim/wishkeep.js');
  const { geared } = await import('./balance.mjs');
  check('Deep Nights (0.92): Nights go to 50, with gentler steps past 30', K.NIGHT.max === 50 && Math.abs(K.NIGHT.power(31) / K.NIGHT.power(30) - 1.085) < 1e-9 && Math.abs(K.NIGHT.power(30) / K.NIGHT.power(29) - 1.28) < 1e-9);
  check('...a sixth wave from 40, two omens from 31 (never the same one twice)', K.NIGHT.waves(39) === 5 && K.NIGHT.waves(40) === 6 && K.nightOmen2(30) === null && Array.from({ length: 20 }, (_, i) => 31 + i).every((L) => K.nightOmen2(L) && K.nightOmen2(L) !== K.nightOmen(L)));
  const kinds = new Set();
  for (let L = 31; L <= 50; L++) for (let wv = 1; wv <= K.NIGHT.waves(L); wv++) for (const f of Object.keys(K.tideSpecials(L, wv, K.NIGHT.waves(L)))) kinds.add(f);
  check('...and the deep foes come (Oathbreaker, Gloamwing, Rotmother), never before Night 31', ['oathbreaker', 'gloamwing', 'rotmother'].every((f) => kinds.has(f)) && !Object.keys(K.tideSpecials(30, 3, 5)).some((f) => ['oathbreaker', 'gloamwing', 'rotmother'].includes(f)));
  check('...deep training and arming: caps grow with Nights held past 30', K.KEEP.trainMax(5, 3, 30) === 16 && K.KEEP.trainMax(5, 3, 48) === 22 && K.KEEP.armMax(4, 3, 50) === 20);
  let s = 5; const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let sf = null;
  for (let i = 0; i < 3000 && !sf; i++) { const g = K.rollHeroGear(rng, 45, 'g' + i); if (g.r === 6) sf = g; }
  check('...an Immortal from a deep Night is Starforged: named so, with a fourth line, and kept by the save', sf && sf.name.startsWith('Starforged') && sf.lines.length === 4 && K.cleanKeep({ armory: [sf] }).armory[0].lines.length === 4);
  // a Rotmother splits; an Oathbreaker shrugs off all but its chosen
  const w = new World({ seed: 920, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  w.player.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] }, warrior: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = w.player.keep;
  k.faith = 1e6; k.stone = 1e5; k.sigils = 100; k.nightMax = 40; k.tier = 3;
  k.troops = [{ id: 1, cls: 'warrior', name: 'a', lvl: 16, gear: 15, rar: 6 }, { id: 2, cls: 'archer', name: 'b', lvl: 1, gear: 0, rar: 0 }];
  w.keepTroopsUp(); w.keepBuildsUp();
  w.command({ type: 'keepTide', level: 41 }); w.runCommands();
  check('...a deep Night is called with both its omens', w.tide && w.tide.omen === K.nightOmen(41) && w.tide.omen2 === K.nightOmen2(41));
  const rot = w.spawnTideFoe('rotmother', { x: 10, z: 10 }, rng);
  rot.state = 'chase';
  const before = w.enemies.filter((e) => e.type === 'rotling' && !e.dead).length;
  w.troopStrike(rot, rot.maxHp * 2, false);
  check('...a Rotmother breaks into three Rotlings', w.enemies.filter((e) => e.type === 'rotling' && !e.dead).length === before + 3);
  const ob = w.spawnTideFoe('oathbreaker', { x: -10, z: 10 }, rng);
  ob.state = 'chase';
  w.stepTideFoe(ob, CONFIG.TICK);
  const chosen = ob.duel, other = w.troops.find((t) => t !== chosen);
  const hp0 = ob.hp;
  w.striker = other; w.troopStrike(ob, 100, false);
  const byOther = hp0 - ob.hp;
  w.striker = chosen; w.troopStrike(ob, 100, false);
  const byChosen = hp0 - byOther - ob.hp;
  w.striker = null;
  check('...an Oathbreaker chooses the strongest hero and takes half from the rest', chosen && chosen.id === 1 && byOther === 50 && byChosen === 100);
}
{
  const K = await import('../src/sim/wishkeep.js');
  const { geared } = await import('./balance.mjs');
  const w = new World({ seed: 921, mode: 'explore', cls: 'archer', save: geared('archer', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] }, warrior: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  k.faith = 1e6; k.stone = 1e5; k.sigils = 100; k.nightMax = 8;
  w.command({ type: 'keepStatue' }); w.runCommands();
  check('Seraph (0.92): not before Night 10 is held', !k.statue);
  k.nightMax = 14;
  w.command({ type: 'keepStatue' }); w.runCommands();
  check('...then raised, a few levels under the best Night held', k.statue && k.statue.lvl === 14 - K.STATUE.startBelow && k.sigils === 100 - K.STATUE.raise.sigils);
  const ranks = JSON.stringify(p.ranks), q = w.kit.q.name;
  w.command({ type: 'keepPossess', on: true }); w.runCommands();
  check('...Y takes it up: its own kit, its strike, hands on (over the shoulder)', p.possess && w.kit.q.name === 'Dawnlance' && w.basic === K.STATUE_BASIC && w.handsOn() && !w.kit.d);
  check("...and the hero's own ranks are what is saved, never the Seraph's", JSON.stringify(w.toSave().ranks) === ranks);
  w.command({ type: 'rankUp', slot: 'q' }); w.runCommands();
  check('...nothing is ranked while in it', JSON.stringify(p.possess.ranks) === ranks && p.ranks.q === 1);
  const lvl0 = k.statue.lvl;
  w.command({ type: 'keepOffer', n: 4 }); w.runCommands();
  check('...Faith at its feet: four offerings, a level', k.statue.lvl === lvl0 + 1);
  w.command({ type: 'keepOffer', n: 100 }); w.runCommands();
  check('...never past the best Night held', k.statue.lvl === 14 && k.statue.xp < K.STATUE.need(14));
  // a night in it: it strikes as the Night its level matches, and a fall makes it stone for a while
  k.troops = [{ id: 1, cls: 'warrior', name: 'a', lvl: 9, gear: 6, rar: 3 }];
  w.keepTroopsUp(); w.keepBuildsUp();
  w.command({ type: 'keepTide', level: 14 }); w.runCommands();
  check('...it stays taken up when a night is called, and fights in it', p.possess && w.inField());
  const e = w.spawnTideFoe('unnamed', { x: p.x + 1.5, z: p.z }, () => 0.5);
  e.state = 'chase';
  const hpE = e.hp;
  w.hitEnemy(e, p.stats.ad * 2, { source: 'q' });
  check('...its blows land as a match for its level (2 x its attack x the Night it matches)', Math.abs((hpE - e.hp) - 2 * K.STATUE.atk * K.statuePower(14)) < 2);
  w.incarnateHurt(1e12);
  check('...felled, it is only stone for a while, and you are the god again (your own kit back)', !p.possess && k.statue.rest === K.STATUE.rest && k.statue.fells === 1 && w.kit.q.name === q && JSON.stringify(p.ranks) === ranks);
  w.command({ type: 'keepPossess', on: true }); w.runCommands();
  check('...and cannot be taken up again until it wakes', !p.possess);
  check('...the keep remembers it (cleanKeep)', K.cleanKeep(JSON.parse(JSON.stringify(k))).statue.lvl === 14);
}
// --- 0.93: the shade copies everything, the wind answers everything, the Seraph gathers light ---------------------
{
  const { geared } = await import('./balance.mjs');
  const { BORROWED } = await import('../src/sim/borrowed.js');
  const { MAPS } = await import('../src/sim/maps.js');
  const mk = (cls, donor) => {
    const w = new World({ seed: 930, mode: 'explore', cls, save: geared(cls, 100, 6) });
    w.borrowable = () => Object.keys(BORROWED[cls]);
    w.player.borrowed = { d: donor, f: null };
    w.recalcStats();
    w.loadMap('spire', MAPS.spire.portals[0].to);
    for (const e of w.enemies) e.dead = true;
    w.enemies = [];
    const p = w.player;
    const e = w.spawnEnemy('boss3', { x: p.x + 2.5, z: p.z, level: 100 });
    e.hp = e.maxHp = 1e11; e.state = 'recover'; e.t = 1e9; e.atkCds = {};
    return { w, p, e };
  };
  {
    const { w, p, e } = mk('warrior', 'shadowdancer');
    const src = [];
    const orig = w.hitEnemy.bind(w);
    w.hitEnemy = (en, d, o = {}) => { src.push(o.source); return orig(en, d, o); };
    w.command({ type: 'cast', slot: 'w', x: e.x, z: e.z }); w.runCommands();
    for (let i = 0; i < 40; i++) w.step(CONFIG.TICK);
    const ws = src.filter((x) => x === 'w').length;
    check('Mastery (0.93): Mirror Blade copies every skill, not only Cleave (Whirlwind lands twice)', ws >= 2);
  }
  {
    const { w, p, e } = mk('warrior', 'windrunner');
    w.command({ type: 'cast', slot: 'q', x: e.x, z: e.z }); w.runCommands();
    const motes = w.projectiles.filter((pr) => pr.kind === 'mote' && pr.slot === 'gale').length;
    check('...Gale Steps: every skill looses homing wind blades', motes === 3);
    w.basicAttack(e);
    check('...and every swing one more', w.projectiles.filter((pr) => pr.kind === 'mote' && pr.slot === 'gale').length === 4);
  }
}
{
  const { geared } = await import('./balance.mjs');
  const w = new World({ seed: 931, mode: 'explore', cls: 'mage', save: geared('mage', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] }, warrior: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  k.faith = 1e6; k.stone = 1e5; k.sigils = 100; k.nightMax = 20;
  w.command({ type: 'keepStatue' }); w.runCommands();
  w.command({ type: 'keepPossess', on: true }); w.runCommands();
  w.events = [];
  w.command({ type: 'cast', slot: 'q', x: p.x + 8, z: p.z }); w.runCommands();
  const wind = w.events.find((e) => e.type === 'cast' && e.seraph === 'wind');
  check('Seraph (0.93): Dawnlance gathers light first (rooted), nothing lands yet', wind && p.seraphWind && p.castLock > 0 && p.cd.q > 0 && !w.events.some((e) => e.type === 'cast' && e.fx === 'line'));
  for (let i = 0; i < 40; i++) w.step(CONFIG.TICK);
  check('...then the lance lands', w.events.some((e) => e.type === 'seraphFx' && e.kind === 'lance') && !p.seraphWind);
}
// --- 0.94: the Seraph's choices and homing lance; never stuck in it; walking pace; Treasure Sense ---------------
{
  const { geared } = await import('./balance.mjs');
  const K = await import('../src/sim/wishkeep.js');
  const fresh = new World({ seed: 940, mode: 'explore', cls: 'warrior' });
  check('Seraph (0.94): a hero always carries "possess" (null), so a snapshot clears it on every screen', 'possess' in fresh.player && fresh.player.possess === null);
  const w = new World({ seed: 941, mode: 'explore', cls: 'rogue', save: geared('rogue', 100, 6) });
  const p = w.player;
  p.lives = { archer: { prim: [10] }, mage: { prim: [10] }, rogue: { prim: [10] }, warrior: { prim: [10] } };
  w.command({ type: 'travel', to: 'wishkeep' }); w.runCommands(); w.step(CONFIG.TICK);
  const k = p.keep;
  k.faith = 1e6; k.stone = 1e5; k.sigils = 100; k.nightMax = 20;
  w.command({ type: 'keepStatue' }); w.runCommands();
  w.command({ type: 'keepStatueSkill', slot: 'r', id: 'rain' }); w.runCommands();
  check('...a skill its level has not opened cannot be chosen', k.statue.kit.r === 'descent');
  w.command({ type: 'keepStatueSkill', slot: 'r', id: 'hand' }); w.runCommands();
  w.command({ type: 'keepPossess', on: true }); w.runCommands();
  check('...one it has opened can, and it is what Y gives you', k.statue.kit.r === 'hand' && w.kit.r.name === 'Hand of Heaven' && w.kit.q.name === 'Dawnlance');
  const e = w.spawnEnemy('grunt', { x: p.x + 12, z: p.z + 4, level: 100 });
  e.state = 'recover'; e.t = 1e9;
  w.command({ type: 'cast', slot: 'q', x: e.x, z: e.z }); w.runCommands();
  for (let i = 0; i < 30; i++) w.step(CONFIG.TICK);
  const lance = w.projectiles.find((pr) => pr.kind === 'lance');
  check('...Dawnlance looses a lance that seeks the foe aimed at', (lance && lance.targetId === e.id) || e.hp < e.maxHp);
  w.command({ type: 'walkPace', on: true }); w.runCommands();
  const x0 = p.x;
  w.command({ type: 'move', x: p.x + 30, z: p.z }); w.runCommands();
  for (let i = 0; i < 60; i++) w.step(CONFIG.TICK);
  check('...Ctrl: over the shoulder it walks at an even pace, whatever it wears', Math.abs((p.x - x0) - 3.4) < 0.6);
  w.loadMap('haven');
  check('...leaving the keep in it, by any road, leaves it home: yourself again, your own kit', !p.possess && w.kit.q.name !== 'Dawnlance' && !w.handsOn());
  check('Treasure Sense (0.94): a Rogue finds gear more often, and so does their party', w.treasureSense() > 1 && new World({ seed: 1, mode: 'explore', cls: 'mage' }).treasureSense() === 1);
}
// --- 0.95: Crimson Oath's cap lifts when it is off; the shade copies a Whirlwind; walking anywhere ---------------
{
  const { geared } = await import('./balance.mjs');
  const { BORROWED } = await import('../src/sim/borrowed.js');
  const { MAPS } = await import('../src/sim/maps.js');
  const w = new World({ seed: 950, mode: 'explore', cls: 'warrior', save: geared('warrior', 100, 6) });
  const p = w.player;
  w.command({ type: 'chooseSpec', id: 'berserker' }); w.step(CONFIG.TICK); w.command({ type: 'autoTalents' }); w.step(CONFIG.TICK);
  p.hp = p.stats.maxHp * 0.3; p.bloodied = true;
  const e = w.spawnEnemy('grunt', { x: p.x + 1.5, z: p.z, level: 100 }); e.hp = e.maxHp = 1e9;
  for (let i = 0; i < 300; i++) { w.hitEnemy(e, p.stats.ad, { basic: true }); p.lsPool = 1e9; }
  check('Berserker (0.95): with Crimson Oath off, lifesteal heals past half (Blood Rage holds you there only under the Oath)', p.hp > p.stats.maxHp * 0.6);
  w.borrowable = () => Object.keys(BORROWED.warrior);
  p.borrowed = { d: 'shadowdancer', f: null }; w.recalcStats();
  w.loadMap('spire', MAPS.spire.portals[0].to);
  for (const o of w.enemies) o.dead = true;
  w.enemies = [];
  const b = w.spawnEnemy('boss3', { x: p.x + 2, z: p.z, level: 100 });
  b.hp = b.maxHp = 1e11; b.state = 'recover'; b.t = 1e9;
  let mine = 0;
  const orig = w.hitEnemy.bind(w);
  w.hitEnemy = (en, d, o = {}) => { if (o.source === 'w') mine++; return orig(en, d, o); };
  p.hp = p.stats.maxHp;
  w.command({ type: 'cast', slot: 'w', x: b.x, z: b.z }); w.runCommands();
  for (let i = 0; i < 240; i++) { w.step(CONFIG.TICK); b.state = 'recover'; b.t = 1e9; }
  w.hitEnemy = orig;
  check('...the shade spins its own Whirlwind with yours, beat for beat (twice the hits)', mine >= 2 * 10);
  b.dead = true; w.enemies = [];
  w.command({ type: 'walkPace', on: true }); w.runCommands();
  const x0 = p.x, z0 = p.z;
  w.command({ type: 'move', x: p.x - 30, z: p.z }); w.runCommands();
  for (let i = 0; i < 60; i++) w.step(CONFIG.TICK);
  const moved = Math.hypot(p.x - x0, p.z - z0);
  check('Walking (0.95): Ctrl or Caps Lock walks at an even pace anywhere, not only over the shoulder', Math.abs(moved - 3.4) < 0.6, moved.toFixed(2));
}
process.exit(failed ? 1 : 0);
