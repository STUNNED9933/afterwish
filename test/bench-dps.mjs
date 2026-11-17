// Boss DPS bench (0.51): level 100, Immortals +10/5 stars, 120 Wish, world tier V.
// Single target: 60 s on The Unmade (frozen, huge health). Also packs (mob clearing), optional.
// node test/bench-dps.mjs [filter]   env MID=1: level 75 in Epic gear instead; MOBS=1: pack clear times too
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { World } = await import(repo + '/src/sim/world.js');
const { CONFIG } = await import(repo + '/src/config.js');
const { MAPS } = await import(repo + '/src/sim/maps.js');
const { geared } = await import(repo + '/test/balance.mjs');
function lateSave(cls) {
  const s = geared(cls, 100, 6);
  for (const k in s.equipped) { s.equipped[k].plus = 10; s.equipped[k].stars = 5; }
  s.wish = 120; s.wishPts = 0; s.wishStats = { might: 50, swift: 40, keen: 30 };
  s.tierMax = 5; s.worldTier = 5;
  return s;
}
const MID = process.env.MID === '1';
const LV = MID ? 75 : 100;
function hero(cls, spec) {
  const w = new World({ seed: 3, mode: 'explore', cls, save: MID ? geared(cls, 75, 3) : lateSave(cls) });
  const p = w.player;
  for (let i = 0; i < 200; i++) for (const k of ['q', 'w', 'e', 'r']) if (p.skillPoints > 0) w.command({ type: 'rankUp', slot: k });
  w.step(CONFIG.TICK);
  if (spec) { w.command({ type: 'chooseSpec', id: spec }); w.step(CONFIG.TICK); w.command({ type: 'autoTalents' }); w.step(CONFIG.TICK); }
  return w;
}
function bot(w, near, nd, ranged) {
  const p = w.player;
  if (near && p.targetId !== near.id) w.command({ type: 'attack', id: near.id });
  if (p.quickShots > 0 || p.barrage || p.channelT > 0) return;
  if (near && nd < (ranged ? 12 : 6)) for (const k of ['w', 'q', 'r', 'e']) if (p.cd[k] <= 0 && w.abilityUnlocked(k)) { w.command({ type: 'cast', slot: k, x: near.x, z: near.z }); break; }
}
function clear(w) { w.loadMap('spire', MAPS.spire.portals[0].to); for (const e of w.enemies) e.dead = true; w.enemies = []; }
function single(cls, spec) {
  const w = hero(cls, spec); const p = w.player; clear(w);
  const ranged = w.basic.range > 5;
  const e = w.spawnEnemy('boss3', { x: p.x + (ranged ? 9 : 2.5), z: p.z, level: LV });
  e.x = e.px = p.x + (ranged ? 9 : 2.5); e.z = e.pz = p.z;
  e.hp = e.maxHp = 1e11; e.state = 'recover'; e.t = 1e9; e.atkCds = {};
  const by = {}; const orig = w.hitEnemy.bind(w);
  w.hitEnemy = (en, dmg, opts = {}) => { const h0 = en.hp; const r = orig(en, dmg, opts); if (en === e) { const k = opts.basic ? 'basic' : opts.source || '?'; by[k] = (by[k] || 0) + (h0 - en.hp); } return r; };
  for (let t = 0; t < 60 * 60; t++) {
    e.state = 'recover'; e.t = 1e9; e.x = e.px = p.x + (ranged ? 9 : 2.5); e.z = e.pz = p.z;
    if (t % 10 === 0) bot(w, e, Math.hypot(e.x - p.x, e.z - p.z), ranged);
    p.hp = p.stats.maxHp;
    w.step(CONFIG.TICK); w.events.length = 0;
  }
  const tot = 1e11 - e.hp;
  single.last = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / tot)}%`).join(' ');
  return Math.round(tot / 60);
}
function mobs(cls, spec) {
  const w = hero(cls, spec); const p = w.player; clear(w);
  const ranged = w.basic.range > 5; let total = 0;
  for (let pack = 0; pack < 3; pack++) {
    const cx = p.x + (ranged ? 9 : 3), cz = p.z, list = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const e = w.spawnEnemy('knight', { x: cx + Math.cos(a) * 2.6, z: cz + Math.sin(a) * 2.6, level: LV });
      if (!MID) e.hp = e.maxHp = e.maxHp * 9.5; e.x = e.px = cx + Math.cos(a) * 2.6; e.z = e.pz = cz + Math.sin(a) * 2.6; list.push(e);
    }
    let t = 0;
    for (; t < 90 * 60 && list.some((e) => !e.dead); t++) {
      for (const e of list) { e.state = 'recover'; e.t = 1e9; }
      let near = null, nd = 1e9;
      for (const e of list) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < nd) { nd = d; near = e; } }
      if (t % 10 === 0) bot(w, near, nd, ranged);
      p.hp = p.stats.maxHp; w.step(CONFIG.TICK); w.events.length = 0;
    }
    total += t / 60; w.enemies = w.enemies.filter((e) => !e.dead);
  }
  return total.toFixed(1) + ' s';
}
const ALL = [['warrior', null], ['archer', null], ['rogue', null], ['mage', null], ['warrior','berserker'],['warrior','bulwark'],['mage','pyromancer'],['mage','frostbinder'],['archer','sharpshooter'],['archer','windrunner'],['rogue','assassin'],['rogue','shadowdancer']];
const f = process.argv[2] ? process.argv[2].split(',') : null;
const pick = f ? ALL.filter(([c, s]) => f.includes(s || c)) : ALL;
for (const [cls, spec] of pick) {
  const st = hero(cls, spec).player.stats;
  const d = single(cls, spec);
  console.log(`${(spec || cls + ' (base)').padEnd(15)} ad ${Math.round(st.ad)} as ${st.as.toFixed(2)} crit ${Math.round(st.crit)} haste ${Math.round(st.haste)} | boss dps ${String(d).padStart(9)}${process.env.MOBS ? ' | 3 packs ' + mobs(cls, spec) : ''} | ${single.last}`);
}
