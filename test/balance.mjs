// Balance report: a bot of the right level, in gear of that level, farms each map for a few minutes.
// Run with: node test/balance.mjs [class]
import { World } from '../src/sim/world.js';
import { CONFIG } from '../src/config.js';
import { MAPS, MAP_IDS } from '../src/sim/maps.js';
import { rollItem } from '../src/sim/items.js';
import { expToNext } from '../src/sim/defs.js';

export function geared(cls, level, rarity = 1, seed = 5) {
  let s = seed * 9301 + level;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const equipped = {};
  for (const slot of ['weapon', 'helm', 'chest', 'boots', 'ring']) equipped[slot] = rollItem(rng, level, { minRarity: rarity, weights: [0, 0, 0, 0, 0, 0, 0].map((_, i) => (i === rarity ? 1 : 0)), slot, cls });
  return { v: 2, cls, level, equipped, bag: [], skillPoints: level - 1 };
}

export function farm({ cls = 'warrior', map, level, minutes = 4, parrySkill = 0.5, seed = 3, boss = false, rarity = 1, save = null }) {
  const w = new World({ seed, mode: 'explore', cls, save: save || geared(cls, level, rarity) });
  const p = w.player;
  for (let i = 0; i < 200; i++) for (const k of ['q', 'w', 'e', 'r']) if (p.skillPoints > 0) w.command({ type: 'rankUp', slot: k });
  w.step(CONFIG.TICK);
  w.loadMap(map, MAPS[map].portals[0].to);
  let r = seed * 7 + 1;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = { kills: 0, downs: 0, exp: 0, bossKills: 0, minHp: 1 };
  const ranged = w.basic.range > 5;
  for (let tick = 0; tick < minutes * 3600; tick++) {
    if (w.map.id !== map) { if (!p.dead && p.hp >= p.stats.maxHp * 0.95) w.command({ type: 'travel', to: map }); w.step(CONFIG.TICK); for (const ev of w.events) if (ev.type === 'playerDown') out.downs++; w.events.length = 0; continue; }
    let near = null, nd = 1e9;
    for (const e of w.enemies) { if (boss !== !!e.def.boss && boss) continue; if (!boss && e.def.boss) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < nd) { nd = d; near = e; } }
    if (tick % 20 === 0 && near && p.targetId !== near.id) w.command({ type: 'attack', id: near.id });
    for (const e of w.enemies) {
      if (e.state !== 'windup') continue;
      const remain = e.dur - e.t;
      if (e.atk.parryable && e.atk.shape !== 'shot' && e.cue && p.parryT <= 0 && remain < 0.2 && rnd() < parrySkill) w.command({ type: 'parry' });
      if (!e.atk.parryable && remain < 0.3 && p.cd.e <= 0 && rnd() < parrySkill) w.command({ type: 'cast', slot: 'e', x: p.x - (e.x - p.x), z: p.z - (e.z - p.z) });
    }
    for (const pr of w.projectiles) if (pr.owner === 'enemy' && pr.parryable !== false && Math.hypot(pr.x - p.x, pr.z - p.z) < 2.2 && p.parryT <= 0 && rnd() < parrySkill) w.command({ type: 'parry' });
    if (near && nd < (ranged ? 12 : 4)) {
      for (const k of ['q', 'w', 'r']) if (p.cd[k] <= 0 && w.abilityUnlocked(k)) { w.command({ type: 'cast', slot: k, x: near.x, z: near.z }); break; }
    }
    if (p.hp < p.stats.maxHp * 0.4) w.command({ type: 'potion' });
    w.step(CONFIG.TICK);
    for (const ev of w.events) {
      if (ev.type === 'death') { out.kills++; if (ev.boss) out.bossKills++; }
      if (ev.type === 'playerDown') out.downs++;
    }
    w.events.length = 0;
    if (!p.dead) out.minHp = Math.min(out.minHp, p.hp / p.stats.maxHp);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.hp)) throw new Error('bad state');
  }
  // EXP earned, counted in levels gained
  let lv = level, gained = 0;
  out.level = p.level; out.expFrac = p.exp / expToNext(p.level);
  out.levels = p.level - level + out.expFrac;
  return out;
}

if (process.argv[1].endsWith('balance.mjs')) {
  const cls = process.argv[2] || 'warrior';
  console.log(`class ${cls}: 4 minutes in each map at its middle level, Uncommon gear of that level, bot parries half the time`);
  for (const id of MAP_IDS) {
    const m = MAPS[id];
    if (m.safe) continue;
    const level = Math.min(99, m.level + Math.round(m.levelSpan / 2));
    const o = farm({ cls, map: id, level });
    const perLevel = o.levels > 0 ? (4 / o.levels).toFixed(1) : '-';
    console.log(`${m.name.padEnd(18)} hero ${String(level).padStart(2)}  kills ${String(o.kills).padStart(3)}  knocked out ${o.downs}x  lowest hp ${(o.minHp * 100).toFixed(0).padStart(3)}%  minutes per level ${perLevel}`);
  }
}
