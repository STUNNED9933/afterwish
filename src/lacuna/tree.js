// (0.99.37) The talent web: one great web of passive talents shared by both paths (after Path of Exile's passive
// tree), the Berserker starting on its west side, the Sharpshooter on its east. Small nodes are a little of
// something; notables (named) are more, or change a skill; keystones (at the edge) change the rules. A node can be
// taken when it touches one you have; one point each, a point a level. The web is generated here, the same for
// everyone (no randomness but a fixed seed), and `compile` turns a set of nodes into the numbers the sim uses: the
// browser and the server both call it, and the server checks a set is honest (`valid`).
import { makeRng } from '../sim/rng.js';
import { pointsAt } from './levels.js';

/**
 * What a talent can give (the sim reads these; all additive, 0.1 = 10%):
 *   hp mana regen life dmg melee proj area crit critMult aspd cdr leech armour move jump air hopCap kicks
 *   cleaveArc skyStun whirlCost oathLeech fork bounce rollFar pour markLen pierce stillDmg bloodDmg
 * and keystones' flags: key.<name>
 */
export const STAT_TEXT = {
  hp: (v) => `${pct(v)} maximum health`,
  mana: (v) => `${pct(v)} maximum mana`,
  regen: (v) => `${pct(v)} mana regeneration`,
  life: (v) => `${pct(v)} health regained while out of combat`,
  dmg: (v) => `${pct(v)} damage`,
  melee: (v) => `${pct(v)} damage with sword and fists (Cleave, Skyfall, Whirlwind)`,
  proj: (v) => `${pct(v)} damage with arrows`,
  area: (v) => `${pct(v)} area of Cleave, Skyfall and Whirlwind`,
  crit: (v) => `${pct(v)} chance to strike critically (x1.5)`,
  critMult: (v) => `${pct(v)} critical damage`,
  aspd: (v) => `${pct(v)} attack speed`,
  cdr: (v) => `${pct(v)} faster cooldowns`,
  leech: (v) => `${pct(v)} of damage dealt regained as health`,
  armour: (v) => `${pct(v)} less damage taken`,
  move: (v) => `${pct(v)} movement speed`,
  jump: (v) => `${pct(v)} jump height`,
  air: (v) => `${pct(v)} damage while in the air`,
  hopCap: (v) => `bunny hops build to ${pct(v)} more speed`,
  kicks: (v) => `+${v} wall kick before landing`,
  cleaveArc: (v) => `Cleave sweeps ${pct(v)} wider`,
  skyStun: (v) => `Skyfall stuns ${pct(v)} longer`,
  whirlCost: (v) => `Whirlwind's beats cost ${pct(v)} less`,
  oathLeech: (v) => `Crimson Oath heals ${pct(v)} more of its damage`,
  fork: (v) => `your Shots split: +${v} arrow${v > 1 ? 's' : ''} either side (each a third as strong)`,
  bounce: (v) => `Ricochet glances +${v} more time${v > 1 ? 's' : ''}`,
  rollFar: (v) => `Evasive Roll goes ${pct(v)} further`,
  pour: (v) => `Deadeye takes in mana ${pct(v)} faster`,
  markLen: (v) => `Deadeye's Mark lasts ${pct(v)} longer`,
  pierce: (v) => `${pct(v)} chance for an arrow to fly on through what it hits`,
  stillDmg: (v) => `${pct(v)} damage when you have stood still a moment`,
  bloodDmg: (v) => `${pct(v)} damage while Bloodied`,
};
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

/** The keystones: rules that change how you play. */
export const KEYSTONES = {
  featherfall: { name: 'Featherfall', text: ['A third jump in the air', '-12% maximum health'], mods: { hp: -0.12 } },
  momentum: { name: 'Momentum', text: ['+1% damage for every 2% you move faster than a run (up to +40%)', 'Bunny hops lose their speed half as fast', '-20% damage standing still'] },
  skyborn: { name: 'Skyborn', text: ['+35% damage while in the air', '-15% damage on the ground'] },
  glass: { name: 'Glass Cannon', text: ['+40% damage', '-35% maximum health'], mods: { dmg: 0.4, hp: -0.35 } },
  unbreakable: { name: 'Unbreakable', text: ['25% less damage taken', '-12% movement speed', 'Cannot bunny hop'], mods: { armour: 0.25, move: -0.12 } },
  bloodMagic: { name: 'Blood Magic', text: ['Skills cost health, not mana (the same amount)', 'No mana'] },
  vampire: { name: 'Vampiric', text: ['Regain 5% of all damage dealt as health', 'No health back out of combat'], mods: { leech: 0.05 } },
  eagleEye: { name: 'Eagle Eye', text: ['Arrows fly 50% further', 'Long Watch twice as strong', '-20% attack speed'], mods: { aspd: -0.2 } },
  dervish: { name: 'Dervish', text: ['Whirlwind\'s first second is free', 'You can jump and slide while whirling'] },
  patience: { name: 'Patience', text: ['Every third Shot is no longer a crit', 'Instead, any Shot after a second of not shooting is a crit'] },
};

// ---- themes: what a region's small nodes give, and its notables (name: mods)
const THEMES = {
  // Berserker (west)
  blood: { side: 'w', small: [['hp', 0.04], ['leech', 0.004], ['bloodDmg', 0.04]], notables: { 'Open Veins': { bloodDmg: 0.15, leech: 0.01 }, 'Red Tide': { hp: 0.08, oathLeech: 0.25 }, 'Taste of Iron': { leech: 0.015, melee: 0.06 } } },
  fury: { side: 'w', small: [['melee', 0.05], ['aspd', 0.03]], notables: { 'Rage Unbound': { melee: 0.14, aspd: 0.05 }, 'Wide Arc': { cleaveArc: 0.35, melee: 0.05 }, 'Relentless': { aspd: 0.1 } } },
  quake: { side: 'w', small: [['area', 0.05], ['melee', 0.03]], notables: { 'Earthshaker': { area: 0.15, skyStun: 0.4 }, 'Falling Star': { cdr: 0.1, area: 0.06 }, 'Cratermaker': { melee: 0.1, area: 0.08 } } },
  tempest: { side: 'w', small: [['area', 0.04], ['aspd', 0.03], ['whirlCost', 0.05]], notables: { 'Eye of the Storm': { whirlCost: 0.25, area: 0.06 }, 'Spinning Steel': { melee: 0.1, whirlCost: 0.1 } } },
  iron: { side: 'w', small: [['armour', 0.02], ['hp', 0.04]], notables: { 'Iron Skin': { armour: 0.07, hp: 0.06 }, 'Stand Fast': { armour: 0.05, life: 0.3 } } },
  // Sharpshooter (east)
  precision: { side: 'e', small: [['crit', 0.02], ['critMult', 0.06]], notables: { 'Dead Centre': { crit: 0.06, critMult: 0.15 }, 'Killing Blow': { critMult: 0.3 }, 'Calm Hands': { crit: 0.04, stillDmg: 0.1 } } },
  fletching: { side: 'e', small: [['proj', 0.05], ['pierce', 0.04]], notables: { 'Split Shaft': { fork: 1 }, 'Barbed Heads': { proj: 0.14, pierce: 0.08 }, 'Long Shafts': { proj: 0.08, pierce: 0.12 } } },
  windrunner: { side: 'e', small: [['move', 0.02], ['aspd', 0.03]], notables: { 'Light Feet': { move: 0.06, rollFar: 0.3 }, 'Quickdraw': { aspd: 0.12 } } },
  hunt: { side: 'e', small: [['proj', 0.04], ['pour', 0.06]], notables: { 'Hunter\'s Mark': { markLen: 0.5, proj: 0.06 }, 'Deep Breath': { pour: 0.3, mana: 0.06 }, 'Bank Shot': { bounce: 1 } } },
  stillness: { side: 'e', small: [['regen', 0.06], ['stillDmg', 0.04]], notables: { 'Patient Hunter': { stillDmg: 0.15, regen: 0.1 }, 'Settle': { regen: 0.2, mana: 0.05 } } },
  // shared
  acrobat: { side: 'n', small: [['jump', 0.03], ['air', 0.04], ['move', 0.02]], notables: { 'Wall Runner': { kicks: 1, jump: 0.04 }, 'Slipstream': { hopCap: 0.15, move: 0.03 }, 'Death from Above': { air: 0.15 }, 'Spring Heels': { jump: 0.12 } } },
  vitality: { side: 's', small: [['hp', 0.05], ['life', 0.1]], notables: { 'Hale': { hp: 0.1 }, 'Second Wind': { life: 0.6, hp: 0.04 } } },
  mind: { side: 's', small: [['mana', 0.05], ['regen', 0.05], ['cdr', 0.02]], notables: { 'Clear Mind': { cdr: 0.08, regen: 0.1 }, 'Deep Well': { mana: 0.15 } } },
  ferocity: { side: 'c', small: [['dmg', 0.04]], notables: { 'Ferocity': { dmg: 0.1 }, 'Bloodlust': { dmg: 0.06, leech: 0.008 } } },
  focus: { side: 'c', small: [['cdr', 0.025], ['dmg', 0.02]], notables: { 'Focus': { cdr: 0.1 } } },
};

/** Which themes sit where: by the angle of a region round the middle (west the Berserker's, east the Sharpshooter's). */
function themeAt(angle, ring) {
  // angle: 0 east, PI/2 south (screen y down), PI west, -PI/2 north
  const a = Math.atan2(Math.sin(angle), Math.cos(angle));
  const deg = (a * 180) / Math.PI;
  const w = ['blood', 'fury', 'quake', 'tempest', 'iron'], e = ['precision', 'fletching', 'windrunner', 'hunt', 'stillness'];
  if (deg > -55 && deg < 55) return e[(ring * 2 + Math.round((deg + 55) / 22)) % e.length];
  if (deg > 125 || deg < -125) return w[(ring * 2 + Math.round(((deg + 360) % 360 - 125) / 22)) % w.length];
  if (deg <= -55 && deg >= -125) return ring === 1 ? 'ferocity' : ring === 2 ? 'acrobat' : (deg < -90 ? 'acrobat' : 'focus');
  return ring === 1 ? 'focus' : ring === 2 ? 'vitality' : (deg > 90 ? 'mind' : 'vitality');
}

/** The web: nodes { id, x, y, kind, name, mods, key, side, theme, links:Set } and starts { warrior, archer }. */
function build() {
  const rng = makeRng(0x7a1e57);
  const nodes = [];
  const add = (n) => { n.id = nodes.length; n.links = new Set(); nodes.push(n); return n; };
  const link = (a, b) => { if (a !== b) { a.links.add(b.id); b.links.add(a.id); } };
  const smallOf = (theme) => {
    const t = THEMES[theme], [k, v] = t.small[Math.floor(rng() * t.small.length)];
    return { kind: 'small', mods: { [k]: v }, theme, side: t.side };
  };
  // the starts
  const sW = add({ kind: 'start', x: -3.4, y: 0, name: 'The Berserker', mods: {}, side: 'w', cls: 'warrior' });
  const sE = add({ kind: 'start', x: 3.4, y: 0, name: 'The Sharpshooter', mods: {}, side: 'e', cls: 'archer' });
  // regions on three rings round the middle
  const RINGS = [{ r: 8.6, n: 8 }, { r: 15.4, n: 14 }, { r: 22.4, n: 18 }];
  const regions = [];
  RINGS.forEach((R, ri) => {
    for (let i = 0; i < R.n; i++) {
      const ang = (i / R.n) * Math.PI * 2 + (ri % 2 ? Math.PI / R.n : 0);
      const cx = Math.cos(ang) * R.r, cy = Math.sin(ang) * R.r * 0.86;
      const theme = themeAt(ang, ri + 1);
      const T = THEMES[theme];
      const size = 6 + Math.floor(rng() * 3) + (ri === 2 ? 1 : 0);
      const ring = [];
      const rad = 1.55 + size * 0.08;
      for (let k = 0; k < size; k++) {
        const a = (k / size) * Math.PI * 2 + rng() * 0.3;
        ring.push(add({ ...smallOf(theme), x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad }));
      }
      for (let k = 0; k < size; k++) if (k < size - 1 || size > 6) link(ring[k], ring[(k + 1) % size]);
      // its notable(s): in the middle, reached from two sides
      const names = Object.keys(T.notables);
      const which = names[(i + ri) % names.length];
      const nb = add({ kind: 'notable', x: cx, y: cy, name: which, mods: T.notables[which], theme, side: T.side });
      link(nb, ring[0]); link(nb, ring[Math.floor(size / 2)]);
      if (ri > 0 && names.length > 1 && rng() < 0.55) {
        const other = names[(i + ri + 1) % names.length];
        const a = Math.atan2(cy, cx);
        const nb2 = add({ kind: 'notable', x: cx + Math.cos(a) * (rad + 1.1), y: cy + Math.sin(a) * (rad + 1.1), name: other, mods: T.notables[other], theme, side: T.side });
        const out = ring.reduce((p, q) => (Math.hypot(q.x - nb2.x, q.y - nb2.y) < Math.hypot(p.x - nb2.x, p.y - nb2.y) ? q : p));
        link(nb2, out);
      }
      regions.push({ ri, i, ang, cx, cy, ring, theme });
    }
  });
  // paths between regions: neighbours on a ring, and each to the nearest on the next ring in (through a node or two)
  const bridge = (A, B) => {
    let best = null, bd = Infinity;
    for (const a of A.ring) for (const b of B.ring) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < bd) { bd = d; best = [a, b]; } }
    const [a, b] = best;
    const steps = Math.max(1, Math.min(3, Math.round(bd / 1.9) - 1));
    let prev = a;
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 1);
      const theme = rng() < 0.5 ? A.theme : B.theme;
      const n = add({ ...smallOf(theme), kind: 'small', x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      link(prev, n);
      prev = n;
    }
    link(prev, b);
  };
  for (let ri = 0; ri < RINGS.length; ri++) {
    const here = regions.filter((g) => g.ri === ri);
    for (let k = 0; k < here.length; k++) bridge(here[k], here[(k + 1) % here.length]);
    if (ri > 0) {
      const inner = regions.filter((g) => g.ri === ri - 1);
      for (const g of here) {
        const near = inner.reduce((p, q) => (Math.abs(Math.atan2(Math.sin(q.ang - g.ang), Math.cos(q.ang - g.ang))) < Math.abs(Math.atan2(Math.sin(p.ang - g.ang), Math.cos(p.ang - g.ang))) ? q : p));
        bridge(near, g);
      }
    }
  }
  // the starts reach into the first ring: the two regions on their side
  for (const [s, side] of [[sW, Math.PI], [sE, 0]]) {
    const first = regions.filter((g) => g.ri === 0).sort((p, q) => Math.abs(Math.atan2(Math.sin(p.ang - side), Math.cos(p.ang - side))) - Math.abs(Math.atan2(Math.sin(q.ang - side), Math.cos(q.ang - side)))).slice(0, 3);
    for (const g of first) {
      const b = g.ring.reduce((p, q) => (Math.hypot(q.x - s.x, q.y - s.y) < Math.hypot(p.x - s.x, p.y - s.y) ? q : p));
      const mid = add({ ...smallOf(g.theme), x: (s.x + b.x) / 2, y: (s.y + b.y) / 2 });
      link(s, mid); link(mid, b);
    }
  }
  // keystones: past the outer ring, each off one region
  const KEYS = [['featherfall', -Math.PI / 2], ['skyborn', -Math.PI / 2 - 0.55], ['momentum', -Math.PI / 2 + 0.55], ['glass', Math.PI / 2 - 0.4], ['unbreakable', Math.PI / 2 + 0.4], ['bloodMagic', Math.PI - 0.45], ['dervish', Math.PI + 0.45], ['vampire', Math.PI], ['eagleEye', 0.45], ['patience', -0.45]];
  for (const [key, ang] of KEYS) {
    const outer = regions.filter((g) => g.ri === 2).reduce((p, q) => (Math.abs(Math.atan2(Math.sin(q.ang - ang), Math.cos(q.ang - ang))) < Math.abs(Math.atan2(Math.sin(p.ang - ang), Math.cos(p.ang - ang))) ? q : p));
    const K = KEYSTONES[key];
    const kx = Math.cos(ang) * 27.6, ky = Math.sin(ang) * 27.6 * 0.86;
    const kn = add({ kind: 'keystone', x: kx, y: ky, name: K.name, key, mods: { ...(K.mods || {}) }, side: 'k' });
    const from = outer.ring.reduce((p, q) => (Math.hypot(q.x - kx, q.y - ky) < Math.hypot(p.x - kx, p.y - ky) ? q : p));
    const mid = add({ ...smallOf(outer.theme), x: (from.x + kx) / 2, y: (from.y + ky) / 2 });
    link(from, mid); link(mid, kn);
  }
  // nothing on top of anything else: nudge apart any two too close (a few passes)
  const room = (n) => (n.kind === 'small' ? 0.36 : n.kind === 'notable' ? 0.62 : 0.85);
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-3, want = room(a) + room(b);
      if (d >= want) continue;
      const push = (want - d) / 2, ux = dx / d, uy = dy / d;
      const fa = a.kind === 'start' ? 0 : 1, fb = b.kind === 'start' ? 0 : 1;
      a.x -= ux * push * fa * (fb ? 1 : 2); a.y -= uy * push * fa * (fb ? 1 : 2);
      b.x += ux * push * fb * (fa ? 1 : 2); b.y += uy * push * fb * (fa ? 1 : 2);
      moved = true;
    }
    if (!moved) break;
  }
  return { nodes, starts: { warrior: sW.id, archer: sE.id } };
}

export const WEB = build();

/** Everything a node gives, written out (for its tooltip). */
export function describe(n) {
  if (n.kind === 'keystone') return KEYSTONES[n.key].text;
  if (n.kind === 'start') return [n.cls === 'warrior' ? 'Where the Berserker begins' : 'Where the Sharpshooter begins'];
  return Object.entries(n.mods).map(([k, v]) => (STAT_TEXT[k] ? STAT_TEXT[k](v) : `${k} ${v}`));
}

/** Can `ids` (allocated, without the start) be a hero's at `level` on `cls`'s start: few enough, and all joined up? */
export function valid(ids, cls, level) {
  const start = WEB.starts[cls];
  if (start === undefined) return ids.length === 0;
  if (ids.length > pointsAt(level)) return false;
  const have = new Set(ids);
  if (have.has(start) || ids.some((i) => !WEB.nodes[i] || WEB.nodes[i].kind === 'start')) return false;
  const seen = new Set([start]), todo = [start];
  while (todo.length) for (const l of WEB.nodes[todo.pop()].links) if (have.has(l) && !seen.has(l)) { seen.add(l); todo.push(l); }
  return seen.size === have.size + 1;
}

/** The sum of what `ids` give: { mods, keys: Set }. */
export function compile(ids) {
  const mods = {}, keys = new Set();
  for (const i of ids) {
    const n = WEB.nodes[i];
    if (!n) continue;
    if (n.key) keys.add(n.key);
    for (const [k, v] of Object.entries(n.mods)) mods[k] = (mods[k] || 0) + v;
  }
  return { mods, keys };
}

/** The shortest way from what you have to node `to` (the nodes you would need to take), or null. */
export function pathTo(have, cls, to) {
  const start = WEB.starts[cls];
  const owned = new Set([start, ...have]);
  if (owned.has(to)) return [];
  const from = new Map(), todo = [...owned];
  const seen = new Set(owned);
  while (todo.length) {
    const c = todo.shift();
    for (const l of WEB.nodes[c].links) {
      if (seen.has(l) || WEB.nodes[l].kind === 'start') continue;
      seen.add(l);
      from.set(l, c);
      if (l === to) {
        const path = [];
        for (let x = to; !owned.has(x); x = from.get(x)) path.unshift(x);
        return path;
      }
      todo.push(l);
    }
  }
  return null;
}

/** Whether `id` can be given back: what is left must still be joined to the start. */
export function canRefund(have, cls, id) {
  const rest = have.filter((i) => i !== id);
  return valid(rest, cls, 999);
}
