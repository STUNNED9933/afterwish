// The heads-up display: health and EXP bars, ability bar with ranks, wave and
// boss status, enemy health bars, floating combat text, banners and hints.
// Plain DOM on top of the 3D canvas.
import { itemIconInner } from './itemicons.js';
import { steadyRatings, signed } from '../power.js';
import { AFFIXES, wishNeed } from '../sim/endgame.js';
import { remnantName } from '../sim/surprises.js';
import { CONFIG } from '../config.js';
import { ABILITIES, ABILITY_SLOTS, expToNext } from '../sim/defs.js';
import { BORROW_SLOTS, OATH } from '../sim/borrowed.js';
import { SPECS } from '../sim/talents.js';
import { RARITIES, itemName } from '../sim/items.js';
import { AUGMENTS } from '../sim/augments.js';

import { QUESTS, NPCS, SIGNS } from '../sim/story.js';
import { ENEMIES } from '../sim/defs.js';
import { MAPS } from '../sim/maps.js';
import { TIERS, CAELUM } from '../sim/endgame.js';
import { ringWhole, ringText } from '../sim/ring.js';
import { wishWhere } from '../sim/wishwhere.js'; // (0.81.2)
import { SETTLERS, HALLS, wishGoal, MIRACLES, MIRACLE_IDS, INCARNATE } from '../sim/wishkeep.js';

const escT = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** (0.80.1) Which groups of the tracker are folded, kept in this browser. */
const TRACK_KEY = 'stunned-track-folded';
const trackFolded = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem(TRACK_KEY) || '[]'));
  } catch {
    return new Set();
  }
})();

/** A quest's goal in a few words: "Defeat 12 Husks on the Greenwood Trail". */
export function goalText(q, tier = 0) {
  const t = q.perTier && tier && TIERS[tier] ? ` on world tier ${TIERS[tier].numeral}` : ''; // (0.58)
  return goalWords(q) + t;
}
function goalWords(q) {
  const g = q.goal;
  if (g.reach) return `Travel to ${MAPS[g.reach].name}`;
  if (g.read) return `Find ${g.read} glimmers (on any map)`;
  if (g.sign) return `Find the glimmer: ${SIGNS[g.sign].title} (${MAPS[SIGNS[g.sign].map].name})`;
  if (g.signs) return `Find the ${g.signs.length} glimmers ${g.what || ''} in ${MAPS[SIGNS[g.signs[0]].map].name}`.replace('  ', ' ');
  if (g.wave) return `Clear wave ${g.wave} in the Echo Ring`;
  if (g.ending) return 'Press the Unwishing Glass into the Starwell, and choose';
  if (g.choose === 'scarf') return 'Find Tomas on the Greenwood road at dusk, and choose';
  if (g.meet === 'odile') return "Reach Odile at the heart of Gloomcap Hollow's garden";
  if (g.stories) return `Finish the side stories of Pip, Bram and Odile`;
  if (g.enemy === 'edric') return 'Find Edric of the Blue Trim in the Warden\'s Keep';
  if (g.boss) return `Defeat ${ENEMIES[g.boss].name}${whereIs(g.boss, 'in')}`;
  const who = g.enemy ? (g.kill > 1 ? plural(ENEMIES[g.enemy].name) : ENEMIES[g.enemy].name) : 'enemies';
  return `Defeat ${g.kill} ${who}${g.map ? ' in ' + MAPS[g.map].name : g.enemy ? whereIs(g.enemy, 'in') : ' (on any map)'}`;
}

const plural = (n) => (/us$/.test(n) ? n.slice(0, -2) + 'i' : /f$/.test(n) ? n.slice(0, -1) + 'ves' : /(s|sh|ch)$/.test(n) ? n + 'es' : n + 's');

/** (0.54.7) Where on the road an enemy or boss lives, for the quest text: " in Ashen Ridge or Spitter Fen". */
function whereIs(type, word) {
  const maps = Object.values(MAPS).filter((m) => !m.safe && (m.boss === type || (m.roster && m.roster[type])));
  maps.sort((a, b) => (a.boss === type ? -1 : 0) - (b.boss === type ? -1 : 0) || (a.level || 0) - (b.level || 0));
  if (!maps.length) return '';
  return ` ${word} ${maps.slice(0, 2).map((m) => m.name).join(' or ')}`;
}

const $ = (id) => document.getElementById(id);

export const ICONS = {
  borrow: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 2"/><path d="M12 8v8M8 12h8"/>', // (0.70) an empty borrowed slot
  parry: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  q: '<path d="M4 19C5 10 11 5 20 4"/><path d="M8 20c1-6 5-10 11-11"/>',
  w: '<path d="M12 12a1.5 1.5 0 1 0 3 0 4.5 4.5 0 1 0-9 0 7.5 7.5 0 1 0 15 0"/>',
  e: '<path d="M3 12h14"/><path d="M12 6l6 6-6 6"/><path d="M3 7h5M3 17h5"/>',
  r: '<path d="M12 2v12"/><path d="M7 9l5 5 5-5"/><path d="M4 20l3-2M20 20l-3-2M12 22v-3"/>',
  hero: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c0-4.5 3-7.5 7-7.5s7 3 7 7.5"/>',
  potion: '<path d="M9 3h6"/><path d="M10 3v5l-4 8a3 3 0 0 0 3 5h6a3 3 0 0 0 3-5l-4-8V3"/><path d="M7.5 15h9"/>',
  weapon: '<path d="M20 4l-10 10"/><path d="M20 4v3L11 16l-3-3 9-9z"/><path d="M6 14l4 4"/><path d="M4 20l3-3"/>',
  helm: '<path d="M5 18v-5a7 7 0 0 1 14 0v5z"/><path d="M12 6v12"/><path d="M5 14h14"/>',
  chest: '<path d="M7 4l5 2 5-2 3 4-3 2v10H7V10L4 8z"/>',
  boots: '<path d="M8 4h5v9l6 3v4H8z"/><path d="M8 16h11"/>',
  ring: '<circle cx="12" cy="14.5" r="5.5"/><path d="M9.5 6l2.5-3 2.5 3-2.5 3z"/>',
  barrage: '<path d="M3 15l9-9M6 19l9-9M10 22l9-9"/><path d="M8 6h4v4M11 10h4v4M15 13h4v4"/>',
  // class ability icons
  line: '<path d="M3 12h17"/><path d="M16 8l4 4-4 4"/><path d="M6 9l-3 3 3 3"/>',
  zone: '<circle cx="12" cy="16" r="5.5"/><path d="M8 3v6M12 2v8M16 3v6"/>',
  strike: '<path d="M21 3l-1 6-8 8-5-5 8-8z"/><path d="M6 13l5 5"/><path d="M3 21l4-4"/>',
  smoulder: '<path d="M12 21c-4 0-7-3-7-6.5C5 10 9 9 9 4c3 2 4 4 4 6 1-1 1.5-2.5 1.5-4C18 8 19 11 19 14.5 19 18 16 21 12 21z"/><path d="M12 21c-1.7 0-3-1.3-3-3 0-2 2-2.5 2-4.5 2 1 4 2.6 4 4.5 0 1.7-1.3 3-3 3z"/>',
  wall: '<path d="M3 20h18M4 20V10l3-3 3 3v10M10 20V8l2-3 2 3v12M14 20V10l3-3 3 3v10"/>',
  kunai: '<path d="M20 4l-9 4-3 3 5 5 3-3 4-9z"/><path d="M8 11l-1.5 1.5M13 16l-1.5 1.5M9.5 14.5L4 20"/><circle cx="3.5" cy="20.5" r="1.5"/>',
  orb: '<circle cx="12" cy="12" r="5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  bolt: '<path d="M12 3c4 4 6 7 6 11a6 6 0 0 1-12 0c0-2 1-4 2-5 0 2 1 3 2 3 0-3 0-6 2-9z"/>',
  hurricane: '<path d="M4 8c4-3 12-3 16 0"/><path d="M6 12c3-2 9-2 12 0"/><path d="M8 16c2-1.4 6-1.4 8 0"/><path d="M10 20h4"/>',
  deadeye: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  frenzy: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/><path d="M9 14l2 2 4-5"/>',
  bastion: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8 12h8M12 8v8"/>',
  veil: '<path d="M5 19c2-7 5-11 9-13"/><path d="M10 20c1.5-5 4-8 8-10" opacity="0.55"/><circle cx="16" cy="6" r="2"/><path d="M3 12h4M4 16h3" opacity="0.55"/>',
  icebolt: '<path d="M12 2l3 7-3 13-3-13z"/><path d="M5 7l3 3M19 7l-3 3M4 14h4M20 14h-4"/>',
};
// Gear icons, one set per class, so a bow looks like a bow and a mage's hat like a hat.
// Line art on a 24x24 grid, drawn with the same stroke style as the ability icons.
const GEAR_ICONS = {
  warrior: {
    weapon: ICONS.weapon, // sword
    helm: '<path d="M5 19v-6a7 7 0 0 1 14 0v6z"/><path d="M5 13h14"/><path d="M9 13v3M12 13v3M15 13v3"/><path d="M12 6V3"/>', // visored great helm
    chest: '<path d="M6 5l6 2 6-2 2 4-2 1v10H6V10L4 9z"/><path d="M6 12h12"/><path d="M12 7v13"/>', // plate cuirass
    boots: '<path d="M8 3h5v10l6 2v5H8z"/><path d="M8 9h5"/><path d="M8 17h11"/>', // armoured sabatons
    ring: '<circle cx="12" cy="15" r="5.5"/><rect x="9" y="3.5" width="6" height="5" rx="1"/>', // signet
  },
  archer: {
    weapon: '<path d="M7 3c7 3 7 15 0 18"/><path d="M7 3v18"/><path d="M4 12h15"/><path d="M16 9l3 3-3 3"/>', // bow with nocked arrow
    helm: '<path d="M4 20c0-9 3-16 8-16s8 7 8 16"/><path d="M8 20c0-5 2-8 4-8s4 3 4 8"/>', // hood
    chest: '<path d="M7 5l5 2 5-2 2 4-2 1v10H7V10L5 9z"/><path d="M8 9l8 9"/><path d="M17 3l3 3M18.5 2.5l-1 4"/>', // leather jerkin, quiver strap and fletching
    boots: '<path d="M9 5h5v9l6 2v4H9z"/><path d="M8 5h7"/><path d="M10 8l3 3M13 8l-3 3"/>', // cuffed, cross-laced boots
    ring: '<circle cx="12" cy="15" r="5.5"/><path d="M12 9.5c-3-1-4-4-2-6.5 3 1 4 4 2 6.5z"/>', // leaf ring
  },
  rogue: {
    weapon: '<path d="M4 20l9-9"/><path d="M13 11l4-6 1 1-5 5"/><path d="M20 20l-9-9"/><path d="M11 11L7 5 6 6l5 5"/><path d="M3 17l4 4M21 17l-4 4"/>', // crossed daggers
    helm: '<path d="M4 9c3-2 13-2 16 0-1 6-5 9-8 9s-7-3-8-9z"/><path d="M8 11h3M13 11h3"/>', // mask
    chest: '<path d="M12 3l7 4-2 14H7L5 7z"/><path d="M12 3v18"/><path d="M5 7c3 2 11 2 14 0"/>', // cloak
    boots: '<path d="M10 3h4v10c2 1 5 3 8 7H10z"/><path d="M10 8h4"/>', // soft boots with a pointed toe
    ring: '<circle cx="12" cy="15" r="5.5"/><path d="M14 3a3.3 3.3 0 1 0 0 6 2.6 2.6 0 0 1 0-6z"/>', // crescent-moon ring
  },
  mage: {
    weapon: '<path d="M5 22l9-12"/><path d="M12 11l-2.5-1M13 13l1 2.5"/><circle cx="16.5" cy="6.5" r="3.5"/><path d="M21 2l-1 1M22 6h-1.5M17 1v1.2"/>', // staff with a glowing orb
    helm: '<path d="M4 18h16"/><path d="M7 18l5-15 3 8 3 7"/><path d="M15 11l3-2"/>', // pointed hat
    chest: '<path d="M9 3h6l2 5-1 13H8L7 8z"/><path d="M12 3v18"/><path d="M8 13h8"/>', // robe
    boots: '<path d="M8 6c0-2 5-2 5 0v8c3 0 7 1 7 5H8z"/><path d="M20 19l1-2"/>', // curled slippers
    ring: '<circle cx="12" cy="15" r="5.5"/><path d="M12 3l3 3-3 3-3-3z"/>', // ring with a gem
  },
};
let gearClass = 'warrior';
/** Which class's gear icons to show (the character being played). */
export function setGearClass(cls) {
  if (GEAR_ICONS[cls]) gearClass = cls;
}
/** The icon for a gear slot, or for an item (its own class if it has one, else the player's). */
export function gearIcon(slotOrItem) {
  const item = typeof slotOrItem === 'object' && slotOrItem ? slotOrItem : null;
  const slot = item ? item.slot : slotOrItem;
  const own = item && itemIconInner(item); // (0.61.2) every named item has its own picture
  if (own) return `<svg viewBox="0 0 24 24" aria-hidden="true">${own}</svg>`;
  const set = GEAR_ICONS[(item && item.cls) || gearClass] || GEAR_ICONS.warrior;
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${set[slot] || ICONS[slot] || ICONS.hero}</svg>`;
}
// Quest markers over people's heads.
export const MARKS = {
  available: '<b class="mark avail" title="A quest to take">!</b>',
  progress: '<b class="mark progress" title="Quest in progress">?</b>',
  ready: '<b class="mark ready" title="Quest ready to hand in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5c3-1 6-1 9 1v14c-3-2-6-2-9-1z"/><path d="M21 5c-3-1-6-1-9 1v14c3-2 6-2 9-1z"/></svg></b>',
};

/** The class whose gear is being shown (armor effects depend on who wears them). */
export const gearClassNow = () => gearClass;
let gearSpec = null;
/** The subclass being played, for Immortal tooltips (0.32: an Immortal's effect follows it). */
export const gearSpecNow = () => gearSpec;
export const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.hero}</svg>`;

const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const pctN = (x) => `${Math.round(x * 100)}%`;
const numN = (x) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(2).replace(/0$/, ''));

/** What one number of a skill's damage is: per arrow, over the storm, to each enemy hit... (0.52) */
function damageUnit(world, def) {
  const m = world.mods;
  switch (def.type) {
    case 'barrage': return `per arrow, ${def.count + (m.wExtra || 0)} arrows`;
    case 'zone': return `over ${numN(def.duration + (m.rDuration || 0))} s, to everything inside`;
    case 'ricochet': return `to each of up to ${def.bounces + 1} enemies`;
    case 'kunai': return 'per kunai';
    case 'deadeye': return 'to the first enemy (70%, 50%, 35% to the next three)';
    case 'dash': return def.motes ? `per mote, ${def.motes.count} motes` : def.width > 0 ? 'to each enemy passed through' : '';
    case 'strike': case 'bolt': return '';
    default: return 'to each enemy hit';
  }
}

/** A skill that deals no damage itself: what it gives instead, Overflow included (0.52). */
function buffLines(world, def, slot, b) {
  const m = world.mods, out = [];
  if (def.rush) out.push(`+${pctN((def.rush.as + (m.eRush || 0)) * b.over)} attack speed for ${numN(def.rush.time + (m.eRushTime || 0))} s`);
  if (def.empower) out.push(`your next ability within ${numN(def.empower.time)} s deals +${pctN((def.empower.mult - 1 + (m[slot + 'Empower'] || 0)) * b.over)}`);
  if (def.quick) out.push(`your next ${def.quick.shots} shots leave the string at once, +${pctN((def.quick.mult - 1) * b.over)} damage`);
  if (def.type === 'focus') out.push(`your next ability within ${numN(def.time)} s deals +${pctN(def.mult - 1)} and always crits`);
  return out;
}

/**
 * Tooltip text for an ability (0.52, after LoL's): the damage it deals now, worked out with every
 * multiplier (rank, talents and augments, Overflow, class power), and with Shift held the calculation
 * itself: the flat part, the per-level part and the attack-damage ratio, then each multiplier, and how
 * the cooldown comes out.
 */
export function abilityTooltip(world, slot, detail = Tooltip.shift) {
  const a = world.kit[slot];
  const p = world.player;
  const rank = p.ranks[slot];
  const unlocked = world.abilityUnlocked(slot);
  const b = world.abilityBreakdown(slot);
  const unit = damageUnit(world, a);
  const adName = world.cls === 'mage' ? 'spell power' : 'attack damage';
  const augs = world.augments.filter((id) => AUGMENTS[id] && AUGMENTS[id].slot === slot).map((id) => `<div class="plus">${AUGMENTS[id].name}: ${AUGMENTS[id].desc}</div>`);
  let html = `<div class="tt-name">${a.name}</div><div class="tt-meta">Rank ${rank} of ${CONFIG.MAX_RANK} &middot; ${b.cd.final.toFixed(1)} s cooldown${a.range ? ` &middot; ${numN(a.range * (world.mods[slot + 'Range'] || 1))} m` : ''}`;
  html += unlocked ? '</div>' : ` &middot; unlocks at level ${a.unlock}</div>`;
  if (b.final > 0) html += `<div class="tt-dmg"><b>${fmtN(b.final)}</b> damage${unit ? ` <span>${unit}</span>` : ''}</div>`;
  for (const line of buffLines(world, a, slot, b)) html += `<div class="tt-dmg"><span>${line[0].toUpperCase() + line.slice(1)}</span></div>`;
  html += `<div>${a.desc}</div>`;
  if (detail) {
    if (b.final > 0) {
      const rows = [];
      if (b.exact) {
        rows.push(`<div><span>${fmtN(b.flat)}</span> base</div>`);
        if (b.perLevel) rows.push(`<div>+ <span>${numN(b.perLevel)}</span> per level <i>(level ${b.level}: ${fmtN(b.perLevel * b.level)})</i></div>`);
        if (b.adRatio) rows.push(`<div>+ <span class="r-ad">${pctN(b.adRatio)} ${adName}</span> <i>(${fmtN(b.ad)}${b.iron ? `, ${fmtN(b.iron)} of it from armor` : ''}: ${fmtN(b.adRatio * b.ad)})</i></div>`);
        if (b.asScales) rows.push(`<div>&times; <span class="r-as">your attacks per second</span> <i>(${b.as.toFixed(2)})</i></div>`);
        rows.push(`<div class="sum">= ${fmtN(b.formula)}</div>`);
      } else rows.push(`<div>${fmtN(b.formula)} from the skill itself</div>`);
      rows.push(`<div>&times; ${b.rank.toFixed(2)} <i>rank ${rank} (+${Math.round(CONFIG.RANK_DAMAGE * 100)}% a rank past the first)</i></div>`);
      if (Math.abs(b.mods - 1) > 1e-6) rows.push(`<div>&times; ${b.mods.toFixed(2)} <i>talents and augments</i></div>`);
      if (b.over > 1) rows.push(`<div>&times; <span class="r-haste">${b.over.toFixed(2)}</span> <i>Overflow: haste past the ${numN(b.cd.floor)} s floor</i></div>`);
      if (Math.abs(b.power - 1) > 1e-6) rows.push(`<div>&times; ${b.power.toFixed(2)} <i>class power</i></div>`);
      rows.push(`<div class="sum">= ${fmtN(b.final)}${unit ? ` ${unit}` : ''}</div>`);
      rows.push(`<div class="note">Crits: ${Math.round(b.crit)}% chance, ${pctN(b.critMult)} damage. Enemies above your level take less, below it more.</div>`);
      html += `<div class="tt-calc"><b>Damage</b>${rows.join('')}</div>`;
    }
    const c = b.cd;
    let cd = `${numN(c.base)} s`;
    if (Math.abs(c.mods - 1) > 1e-6) cd += ` &times; ${c.mods.toFixed(2)} <i>talents</i>`;
    if (Math.abs(c.rank - 1) > 1e-6) cd += ` &times; ${c.rank.toFixed(2)} <i>rank</i>`;
    cd += ` &divide; <span class="r-haste">${numN(1 + c.haste / 100)}</span> <i>(${fmtN(c.haste)} ability haste)</i> = ${c.raw.toFixed(2)} s`;
    if (c.raw < c.floor && c.base > c.floor) cd += `, held at the ${numN(c.floor)} s floor`;
    html += `<div class="tt-calc"><b>Cooldown</b><div>${cd}</div></div>`;
  }
  if (augs.length) html += `<div class="tt-diff"><b>Augments</b>${augs.join('')}</div>`;
  if (rank < CONFIG.MAX_RANK) html += `<div class="tt-desc">Next rank: +${Math.round(CONFIG.RANK_DAMAGE * 100)}% damage, ${Math.round(CONFIG.RANK_COOLDOWN * 100)}% shorter cooldown.</div>`;
  if (!detail) html += `<div class="tt-hint">Hold <kbd>Shift</kbd> for the calculation</div>`;
  return html;
}

/** (0.70) A borrowed skill on D or F: what it is, where it came from, and what it does. */
export function borrowedTooltip(world, slot) {
  const a = world.kit[slot];
  const key = slot.toUpperCase();
  if (!a) {
    return `<div class="tt-name">Borrowed skill (${key})</div><div>Beat the Quiet with another class and every class on your account may borrow a skill from each of its subclasses.</div><div class="tt-desc">Choose them in Talents, under Mastery.</div>`;
  }
  const from = SPECS[a.borrowed] ? SPECS[a.borrowed].name : a.borrowed;
  let html = `<div class="tt-name">${a.name}</div><div class="tt-meta">Borrowed from the ${from}${a.passive ? ' &middot; passive' : ` &middot; ${world.abilityCooldown(slot).toFixed(1)} s cooldown`}${a.range ? ` &middot; ${a.range} m` : ''}</div>`;
  if (!a.passive) {
    const d = world.abilityDamage(slot);
    if (d > 0) html += `<div class="tt-dmg"><b>${Math.round(d)}</b> damage</div>`;
  }
  html += `<div>${a.desc}</div>`;
  if (a.type === 'bloodoath') {
    const o = OATH[world.player.spec] || OATH.none;
    html += `<div class="tt-desc">${o.text}</div>`;
  }
  return html;
}

export class Hud {
  /**
   * @param {object} tooltip  shared Tooltip
   * @param {function} send   send(command) -> queues a command on the world
   */
  constructor(tooltip, send) {
    this.tooltip = tooltip;
    this.send = send;
    this.world = null;
    this.worldUi = $('world-ui');
    this.bars = new Map();
    this.floatCount = 0;
    this.hintTimer = 0;
    this.augmentKey = '';
    this.buildAbilityBar();
  }

  buildAbilityBar() {
    const root = $('abilities');
    this.slots = {};
    const add = (key, cls, label, icon, tipHtml) => {
      const el = document.createElement('div');
      el.className = 'slot ' + cls;
      el.innerHTML = `${svg(icon)}<div class="cd"></div><div class="num"></div><div class="lock"></div><kbd>${label}</kbd>`;
      el.addEventListener('mouseenter', () => this.tooltip.show(tipHtml, el)); // (0.52: a function, so Shift can rebuild it)
      el.addEventListener('mouseleave', () => this.tooltip.hide());
      root.appendChild(el);
      this.slots[key] = { el, cd: el.querySelector('.cd'), num: el.querySelector('.num'), lock: el.querySelector('.lock'), last: '' };
      return el;
    };
    add('parry', 'parry', 'Space', 'parry', () => {
      const w = this.world;
      const pr = CONFIG.PARRY_PRESETS[(w && w.parryPreset) || CONFIG.DEFAULT_PARRY_PRESET];
      const win = Math.round(pr.window * (w ? w.mods.parryWindow : 1) * 1000);
      const augs = w ? w.augments.filter((id) => AUGMENTS[id] && AUGMENTS[id].slot === 'parry').map((id) => `<div class="plus">${AUGMENTS[id].name}: ${AUGMENTS[id].desc}</div>`) : [];
      return `<div class="tt-name">Parry</div><div class="tt-meta">${win} ms window &middot; ${pr.label} timing</div>
        <div>Press when an enemy flashes white. A parried enemy is stunned and takes 50% more damage. Parried bolts fly back at the shooter.</div>
        <div class="tt-desc">A perfect parry also slows every enemy for ${CONFIG.PERFECT_SLOW}s. Red attacks cannot be parried.</div>
        ${augs.length ? `<div class="tt-diff"><b>Augments</b>${augs.join('')}</div>` : ''}`;
    });
    for (const s of ABILITY_SLOTS) {
      const el = add(s, '', ABILITIES[s].key, s, () => (this.world ? abilityTooltip(this.world, s) : ''));
      const pips = document.createElement('div');
      pips.className = 'pips';
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'rankup hidden';
      up.textContent = '+';
      up.setAttribute('aria-label', `Rank up ${ABILITIES[s].name}`);
      up.addEventListener('click', () => {
        this.send({ type: 'rankUp', slot: s });
        up.blur();
      });
      el.append(pips, up);
      this.slots[s].pips = pips;
      this.slots[s].up = up;
      this.slots[s].rank = -1;
    }
    for (const s of BORROW_SLOTS) add(s, 'borrowed', s.toUpperCase(), 'borrow', () => (this.world ? borrowedTooltip(this.world, s) : '')); // (0.70)
    const potion = add('potion', 'potion', '1', 'potion', () => `<div class="tt-name">Health potion</div><div class="tt-meta">${CONFIG.POTION_COOLDOWN}s cooldown</div><div>Restores ${Math.round(CONFIG.POTION_HEAL * 100)}% of your health. You get one back for every wave you clear.</div>`);
    const count = document.createElement('span');
    count.className = 'count';
    potion.appendChild(count);
    this.slots.potion.count = count;
  }

  setCooldown(slot, remaining, total) {
    const frac = total > 0 ? Math.min(1, remaining / total) : 0;
    slot.cd.style.setProperty('--cd', frac.toFixed(3));
    const text = remaining > 0.05 ? (remaining >= 1 ? Math.ceil(remaining) : remaining.toFixed(1)) : '';
    if (text !== slot.last) {
      slot.num.textContent = text;
      slot.last = text;
    }
    slot.el.classList.toggle('cooling', remaining > 0.05);
  }

  flashSlot(key) {
    const el = this.slots[key]?.el;
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  /** Called every frame. */
  update(world, renderer, dt) {
    this.world = world;
    this.drawAimMarker(world, renderer);
    const p = world.player;
    gearSpec = world.trial ? null : p.spec || null;

    // Health / EXP / gold
    const hpFrac = Math.max(0, p.hp / p.stats.maxHp);
    $('hp-fill').style.transform = `scaleX(${hpFrac})`;
    $('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.stats.maxHp}`;
    // Arcane Ward (Mage): drawn over the start of the bar, as a share of max health.
    const wardFrac = Math.min(1, (p.ward || 0) / p.stats.maxHp);
    if (wardFrac !== this.lastWard) {
      this.lastWard = wardFrac;
      $('ward-fill').style.transform = `scaleX(${wardFrac})`;
    }
    // Berserker: a mark at half health, and the bar burns red while Bloodied.
    const bar = $('hp-bar');
    const zerk = p.spec === 'berserker';
    bar.classList.toggle('berserk', zerk);
    bar.classList.toggle('bloodied', zerk && !p.dead && hpFrac < 0.5);
    const need = expToNext(p.level);
    const maxed = p.level >= CONFIG.MAX_LEVEL;
    // Past 100 the bar fills Wishborne levels instead (0.26).
    const wneed = maxed ? (world.wishNeedNow ? world.wishNeedNow(p) : wishNeed(p.wish || 0)) : 0;
    $('xp-fill').style.transform = `scaleX(${maxed ? Math.min(1, (p.wishExp || 0) / wneed) : p.exp / need})`;
    $('xp-text').textContent = maxed ? `Wishborne ${p.wish || 0} · ${p.wishExp || 0} / ${wneed}` : `${p.exp} / ${need} EXP`;
    $('level-badge').textContent = p.level;
    if (p.gold !== this.lastGold || p.tickets !== this.lastTickets) {
      this.lastGold = p.gold;
      this.lastTickets = p.tickets;
      $('hud-gold').textContent = p.gold;
      $('hud-tickets').textContent = p.tickets;
    }
    if ((p.streak || 0) !== this.lastStreak) {
      this.lastStreak = p.streak || 0;
      $('hud-streak').classList.toggle('hidden', !this.lastStreak);
      $('hud-streak-n').textContent = `+${Math.round(this.lastStreak * CONFIG.STREAK_LOOT * 100)}%`;
    }
    this.updatePower(world);
    this.drawMinimap(world);
    $('vignette').style.opacity = p.dead ? 0.9 : p.hurtT > 0 ? 0.8 : hpFrac < 0.3 ? 0.35 + Math.sin(performance.now() / 180) * 0.12 : 0;
    document.body.classList.toggle('slowmo', world.slowT > 0);

    // Abilities
    const kitKey = world.cls + ABILITY_SLOTS.concat(BORROW_SLOTS).map((s) => (world.kit[s] ? world.kit[s].name : '-')).join('|');
    if (kitKey !== this.kitKey) {
      // A different class (or a subclass that swaps an ability) is being played: swap the ability icons.
      this.kitKey = kitKey;
      this.cls = world.cls;
      for (const s of ABILITY_SLOTS) {
        this.slots[s].el.querySelector('svg').outerHTML = svg(world.kit[s].icon || s);
        this.slots[s].up.setAttribute('aria-label', `Rank up ${world.kit[s].name}`);
      }
      for (const s of BORROW_SLOTS) this.slots[s].el.querySelector('svg').outerHTML = svg((world.kit[s] && world.kit[s].icon) || 'borrow');
    }
    for (const s of BORROW_SLOTS) {
      // (0.70) the borrowed skills: hidden until there is something to borrow
      const slot = this.slots[s];
      const def = world.kit[s];
      const may = world.borrowable ? world.borrowable().length > 0 : false;
      slot.el.classList.toggle('hidden', !may && !def);
      slot.el.classList.toggle('empty', !def);
      slot.el.classList.toggle('passive', !!(def && def.passive));
      slot.el.classList.toggle('empowered', !!(def && def.type === 'bloodoath' && (p.oathOn || p.oathT > 0)));
      this.setCooldown(slot, def && !def.passive ? p.cd[s] || 0 : 0, def && !def.passive ? world.abilityCooldown(s) : 0);
    }
    let canRank = false;
    for (const s of ABILITY_SLOTS) {
      const slot = this.slots[s];
      const def = world.kit[s];
      const locked = !world.abilityUnlocked(s);
      slot.el.classList.toggle('locked', locked);
      slot.el.classList.toggle('passive', !!def.passive && !locked); // (0.60.2) always on: nothing to press
      if (locked) slot.lock.textContent = 'Lv ' + def.unlock;
      this.setCooldown(slot, locked ? 0 : p.cd[s], world.abilityCooldown(s));
      // Glows while pressing the key again does something (swap with a Shadow, shatter the orb).
      const me = p.id || 0;
      const again = (s === 'e' && world.mods.shadowStep && (world.shadows || []).some((x) => x.pid === me && x.src === 'e' && !x.swapped))
        || (def.type === 'orb' && world.projectiles.some((pr) => pr.kind === 'orb' && (pr.pid ?? 0) === me));
      slot.el.classList.toggle('recast', !!again);
      slot.el.classList.toggle('sealed', p.sealT > 0 && p.sealSlot === s); // (0.54) a Primordial took it for a while
      slot.el.classList.toggle('empowered', (p.empowerT > 0 && s !== 'e' && !locked) || (s === 'r' && !!p.frenzyOn)); // Nightstep: the next ability hits harder; (0.71.2) Crimson Oath on
      // Reckoning (Bulwark): stacks for the next Whirlwind, shown on W.
      const stacks = s === 'w' && p.reck > 0 ? String(p.reck) : '';
      if ((slot.el.dataset.stacks || '') !== stacks) {
        if (stacks) slot.el.dataset.stacks = stacks;
        else delete slot.el.dataset.stacks;
      }
      const rank = p.ranks[s];
      if (rank !== slot.rank) {
        slot.rank = rank;
        let html = '';
        for (let i = 0; i < CONFIG.MAX_RANK; i++) html += `<i class="${i < rank ? 'on' : ''}"></i>`;
        slot.pips.innerHTML = html;
      }
      const show = p.skillPoints > 0 && !locked && rank < CONFIG.MAX_RANK;
      slot.up.classList.toggle('hidden', !show);
      canRank = canRank || show;
    }
    const note = canRank ? `${p.skillPoints} skill point${p.skillPoints === 1 ? '' : 's'} · Alt or Ctrl + Q W E R` : '';
    if (note !== this.lastNote) {
      this.lastNote = note;
      $('sp-note').textContent = note;
      $('sp-note').classList.toggle('hidden', !note);
    }
    const ps = this.slots.parry;
    ps.el.classList.toggle('active', p.parryT > 0);
    this.setCooldown(ps, p.parryT > 0 ? 0 : p.parryCd, world.parry.cooldown);
    const pot = this.slots.potion;
    pot.count.textContent = p.potions;
    this.setCooldown(pot, p.potions > 0 ? p.potionCd : 0, CONFIG.POTION_COOLDOWN);
    pot.el.style.opacity = p.potions > 0 ? 1 : 0.4;

    // Augments taken this run
    const key = world.augments.join(',');
    if (key !== this.augmentKey) {
      this.augmentKey = key;
      const list = $('augment-list');
      list.innerHTML = '';
      for (const id of world.augments) {
        const a = AUGMENTS[id];
        if (!a) continue; // (0.61.1) one since retired
        const chip = document.createElement('div');
        chip.className = 'aug-chip' + (a.tier === 2 ? ' strong' : '');
        chip.innerHTML = `${svg(world.kit[a.slot]?.icon || a.slot)}<span>${a.name}</span>`;
        chip.addEventListener('mouseenter', () => this.tooltip.show(`<div class="tt-name">${a.name}</div><div>${a.desc}</div>`, chip));
        chip.addEventListener('mouseleave', () => this.tooltip.hide());
        list.appendChild(chip);
      }
    }

    // Wave status
    const w = world.wave;
    let sub = '';
    const zone = world.mode === 'explore' ? world.zone() : null;
    const label = zone ? zone.name : `Wave ${w.phase === 'intermission' ? w.n + 1 : w.n}`;
    if (label !== this.lastLabel) {
      $('wave-label').textContent = label;
      this.lastLabel = label;
    }
    if (zone) {
      sub = p.dead ? 'knocked out' : zone.sub;
    } else if (w.phase === 'intermission') {
      const nk = this.nextWaveKeyName || 'Enter'; // (0.62.2) the key chosen in the menu
      sub = world.offer ? 'choose an augment' : world.ring && world.ring.hold ? `H to take your spoils home, ${nk} to push on` : `starts in ${Math.max(0, Math.ceil(w.timer))}s · press ${nk} to skip the wait`;
    } else {
      const left = world.remaining;
      sub = `${left} ${left === 1 ? 'enemy' : 'enemies'} left`;
    }
    if (!zone && world.ring && world.mode === 'arena') {
      // (0.59) the run's spoils, and how much of them is safe
      const r = world.ring;
      sub += ` · spoils ${ringText(r, ringWhole(r.pot))}`; // (0.61.1) all of it comes home, however the run ends
    }
    if (sub !== this.lastSub) {
      $('wave-sub').textContent = sub;
      this.lastSub = sub;
    }

    // World events (0.31): what is going on and how long is left.
    const hv = world.mode === 'explore' ? world.happening : null;
    let et = '';
    let warnEv = false;
    if (hv && hv.kind === 'meteor') et = hv.state === 'falling' ? 'A meteor is falling: clear what crawls out for a radiant chest' : `Meteor pack: ${hv.left} left · ${Math.ceil(hv.t)} s`;
    else if (hv && hv.kind === 'shrine') {
      if (hv.state === 'waiting') et = `A shrine has woken: stand in its ring to start (${Math.ceil(hv.t)} s)`;
      else {
        warnEv = hv.grace < 5.9;
        et = warnEv ? `Shrine: get back in the ring! (${Math.ceil(hv.grace)} s)` : `Hold the shrine: ${Math.ceil(hv.t)} s`;
      }
    }
    if (world.mode === 'explore' && world.merchant && !et) et = `A travelling merchant is here for ${Math.ceil(world.merchant.left / 60)} more minute${world.merchant.left > 60 ? 's' : ''}`;
    if (et !== this.lastEvText) {
      this.lastEvText = et;
      $('event-text').textContent = et;
      $('event-box').classList.toggle('hidden', !et);
    }
    $('event-box').classList.toggle('warn', warnEv);

    // Echo Rift progress (0.26)
    const r = world.mode === 'explore' && world.map && world.map.id === 'rift' ? world.rift : null;
    $('rift-box').classList.toggle('hidden', !r);
    if (r) {
      $('rift-fill').style.transform = `scaleX(${r.state === 'guardian' || r.state === 'done' ? 1 : Math.min(1, r.progress / Math.max(1, r.need))})`;
      $('rift-box').classList.toggle('guardian', r.state === 'guardian');
      $('rift-box').classList.toggle('late', r.state === 'late');
    }

    // Boss bar
    const boss = world.enemies.find((e) => e.def.boss && !e.dead);
    $('boss-box').classList.toggle('hidden', !boss);
    if (boss) {
      const fin = !!boss.def.final;
      const phase = boss.phase || 1;
      const fk = fin + ':' + phase;
      if (fk !== this.lastFinal) {
        this.lastFinal = fk;
        const box = $('boss-box');
        box.classList.toggle('final', fin);
        box.classList.toggle('phase-2', fin && phase === 2);
        box.classList.toggle('phase-3', fin && phase === 3);
        $('boss-title').textContent = fin ? boss.def.title || '' : '';
        $('boss-phase').textContent = fin ? ['', 'Phase one', 'Phase two · stars fall', 'Phase three · it pulls you in'][phase] : '';
      }
      // (0.71) a Granted in Caelum: a hundred bars, counting down (x100 ... x1)
      const bars = boss.bars || (boss.def.granted && world.map && CAELUM.maps[world.map.id] ? CAELUM.bossBars : 0);
      let frac = Math.max(0, boss.hp / boss.maxHp);
      const box = $('boss-box');
      if (bars > 1) {
        const per = boss.maxHp / bars;
        const n = Math.max(1, Math.ceil(boss.hp / per - 1e-9));
        frac = Math.max(0, Math.min(1, (boss.hp - (n - 1) * per) / per));
        if (n !== this.lastBars) {
          this.lastBars = n;
          $('boss-bars').textContent = `×${n}`;
          box.dataset.bar = String(n % 4); // the colour turns each bar
        }
      } else if (this.lastBars) {
        this.lastBars = 0;
        $('boss-bars').textContent = '';
        delete box.dataset.bar;
      }
      box.classList.toggle('stacked', bars > 1);
      $('boss-fill').style.transform = `scaleX(${frac})`;
      const pk = boss.posture + ':' + boss.state;
      if (pk !== this.lastPosture) {
        this.lastPosture = pk;
        let html = '';
        for (let i = 0; i < boss.def.poise; i++) html += `<i class="${i < boss.posture || boss.state === 'stunned' ? 'on' : ''}"></i>`;
        $('boss-posture').innerHTML = html;
        const bname = boss.remnant ? remnantName(boss.def) : boss.def.name; // a Remnant (0.29)
        $('boss-name').textContent = boss.state === 'stunned' ? `${bname} — guard broken` : bname;
      }
    }

    this.updateEnemyBars(world, renderer);
    this.updateAllies(world, renderer);
    this.updatePortalLabels(world, renderer);
    this.updateMiracles(world);

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) $('hint').classList.add('hidden');
    }
  }

  updateEnemyBars(world, renderer) {
    const seen = new Set();
    for (const e of world.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const view = renderer.views.get(e.id);
      if (!view) continue;
      seen.add(e.id);
      let bar = this.bars.get(e.id);
      if (!bar) {
        const el = document.createElement('div');
        el.className = 'ebar';
        const width = e.def.boss ? 90 : Math.round(34 + e.radius * 28);
        el.style.width = width + 'px';
        el.innerHTML = '<div class="fill"></div><div class="tag"></div><div class="lvl"></div><div class="patience"><i></i></div><div class="shieldfill"></div><div class="affix"></div>';
        this.worldUi.appendChild(el);
        bar = { el, fill: el.firstChild, tag: el.children[1], lvl: el.children[2], pat: el.children[3], shieldEl: el.children[4], affix: el.children[5], width, hp: -1, status: null, gap: null, patience: 1, shield: -1 };
        // Elites: a gold frame and their modifiers by name.
        el.classList.toggle('elite', !!e.elite);
        bar.affix.textContent = e.elite ? e.elite.map((a) => AFFIXES[a].name).join(' · ') : '';
        // Exploration surprises (0.29): a Rare's name above its bar; the Wishthief glitters.
        if (e.rare) {
          el.classList.add('rare');
          const nm = document.createElement('div');
          nm.className = 'rarename';
          nm.textContent = e.rare;
          el.appendChild(nm);
        }
        if (e.def.thief) {
          el.classList.add('thief');
          bar.affix.textContent = 'Wishthief';
        }
        bar.affix.title = e.elite ? e.elite.map((a) => `${AFFIXES[a].name}: ${AFFIXES[a].desc}`).join('\n') : '';
        this.bars.set(e.id, bar);
      }
      const pos = view.model.group.position;
      const s = renderer.project(pos.x, e.def.height + 0.55, pos.z);
      bar.el.style.transform = `translate(${Math.round(s.x - bar.width / 2)}px, ${Math.round(s.y)}px)`;
      if (bar.hp !== e.hp) {
        bar.hp = e.hp;
        bar.fill.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp)})`;
      }
      const sh = e.shield > 0 && e.maxShield ? e.shield / e.maxShield : 0;
      if (sh !== bar.shield) {
        bar.shield = sh;
        bar.shieldEl.style.transform = `scaleX(${sh})`;
        bar.shieldEl.style.display = sh > 0 ? 'block' : 'none';
      }
      // Patience: shown only while it is running out (and while it walks home to heal).
      const pat = e.returning ? 0 : e.patience ?? 1;
      if (Math.abs(bar.patience - pat) > 0.005 || (pat >= 1) !== (bar.patience >= 1)) {
        bar.patience = pat;
        bar.el.classList.toggle('impatient', pat < 0.999);
        bar.el.classList.toggle('leashed', !!e.returning);
        bar.pat.firstChild.style.transform = `scaleX(${pat})`;
      }
      // The level, coloured by how dangerous the gap is.
      const gap = (e.level || world.player.level) - world.player.level;
      const short = e.ember > 0 && world.ember() < e.ember ? e.ember : 0; // (0.54) the Deep: its Ember requirement, in red, when you are short of it
      if (bar.gap !== gap || bar.short !== short) {
        bar.gap = gap;
        bar.short = short;
        bar.lvl.textContent = short ? `◆${short}` : e.level || '';
        bar.lvl.title = short ? `Ember ${short} needed (you have ${world.ember()})` : '';
        bar.lvl.className = 'lvl ' + (short ? 'skull' : gap >= 10 ? 'skull' : gap >= 5 ? 'red' : gap >= 2 ? 'orange' : gap <= -10 ? 'grey' : gap <= -3 ? 'green' : '');
      }
      // One status word above the bar: the most important one wins.
      // Burns and Hoarfrost show their stacks; a mage's Ignite is a burn, not a bleed.
      const burning = e.burnT > 0 || (e.bleedT > 0 && e.bleedFire);
      const frostMax = world.mods.frostMax || 6;
      const status = e.state === 'stunned' ? (e.frostLock > 0.3 ? 'frozen' : 'stunned')
        : e.vulnT > 0 ? (e.brittle ? 'brittle' : 'sundered')
        : e.exposedT > 0 ? 'exposed'
        : burning ? 'burning'
        : e.frostT > 0 && e.frostStacks > 0 ? 'hoarfrost'
        : e.bleedT > 0 ? 'bleeding'
        : e.slowT > 0 ? 'slowed' : '';
      const label = status === 'burning' && e.burnStacks > 1 ? `burning ×${e.burnStacks}` : status === 'hoarfrost' ? `hoarfrost ${e.frostStacks}/${frostMax}` : status;
      if (bar.status !== status) {
        bar.el.classList.remove('stunned', 'sundered', 'bleeding', 'slowed', 'burning', 'hoarfrost', 'brittle', 'frozen', 'exposed');
        if (status) bar.el.classList.add(status);
        bar.status = status;
      }
      if (bar.label !== label) {
        bar.tag.textContent = label.toUpperCase();
        bar.label = label;
      }
    }
    for (const [id, bar] of this.bars) {
      if (!seen.has(id)) {
        bar.el.remove();
        this.bars.delete(id);
      }
    }
  }

  /** Exploration only: a small map of where you are, with enemies and portals. */
  /** Combat Power in the purse line, with a little "+123" when it goes up. */
  updatePower(world) {
    this.cpFrame = (this.cpFrame || 0) + 1;
    if (this.cpFrame % 20 !== 1 && this.cpWorld === world) return;
    const r = steadyRatings(world);
    if (this.cpWorld === world && this.cpShown != null && r.cp > this.cpShown && !world.trial) {
      const pop = $('cp-pop');
      pop.classList.add('hidden');
      void pop.offsetWidth; // restart the animation
      pop.textContent = `Power ${signed(r.cp - this.cpShown)}`;
      pop.classList.remove('hidden');
      clearTimeout(this.cpPopT);
      this.cpPopT = setTimeout(() => pop.classList.add('hidden'), 1900);
    }
    if (r.cp !== this.cpShown) $('hud-cp').textContent = r.cp.toLocaleString();
    this.cpShown = r.cp;
    this.cpWorld = world;
  }

  drawMinimap(world) {
    const cv = $('minimap');
    const on = world.mode === 'explore';
    if (on !== this.mapOn) {
      this.mapOn = on;
      cv.classList.toggle('hidden', !on);
    }
    if (!on || ((this.mapTick = (this.mapTick || 0) + 1) % 4 && !this.aim && !this.aimWas)) return; // every frame while aiming
    this.aimWas = !!this.aim;
    const g = cv.getContext('2d');
    const S = cv.width;
    const k = (S / 2 - 6) / world.radius;
    const X = (x) => S / 2 + x * k;
    const Y = (z) => S / 2 + z * k;
    const dot = (x, z, r, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(X(x), Y(z), r, 0, 7);
      g.fill();
    };
    g.clearRect(0, 0, S, S);
    dot(0, 0, S / 2 - 2, 'rgba(10,13,22,0.85)');
    g.strokeStyle = '#363d53';
    g.stroke();
    for (const ob of world.map.obstacles) {
      if (ob.kind === 'house') dot(ob.x, ob.z, 4, '#b9a98c');
      else if (ob.kind === 'tree') dot(ob.x, ob.z, 1.3, 'rgba(88,201,139,0.45)');
      else if (ob.kind === 'rock') dot(ob.x, ob.z, 1.3, 'rgba(154,162,182,0.5)');
    }
    for (const ob of world.map.obstacles) {
      if (ob.kind === 'npc') dot(ob.x, ob.z, 2.6, '#ffd27a');
      else if (ob.kind === 'sign' && !world.player.signs.includes(ob.id)) dot(ob.x, ob.z, 2.2, '#ffe2a0'); // an unread glimmer (0.56.4)
    }
    for (const gate of world.map.portals) {
      dot(gate.x, gate.z, 5, '#6fb4ff');
      dot(gate.x, gate.z, 2.5, '#0a0d16');
    }
    if (world.map.waygate) dot(world.map.waygate.x, world.map.waygate.z, 4, '#ffd27a');
    for (const ob of world.map.obstacles) if (ob.kind === 'ring') dot(ob.x, ob.z, 4, '#9fe7ff'); // (0.61) the Echo Ring
    for (const ws of world.map.waystones || []) dot(ws.x, ws.z, 3.5, '#9fe6ff');
    for (const c of world.chests || []) dot(c.x, c.z, c.tier === 'radiant' ? 3.2 : 2.4, c.tier === 'radiant' ? '#7ff5e1' : c.tier === 'gilded' ? '#f0c45a' : '#c08a4e');
    if (world.happening) dot(world.happening.x, world.happening.z, 5, world.happening.kind === 'shrine' ? '#ffd27a' : '#ff8a3a');
    if (world.merchant) dot(world.merchant.x, world.merchant.z, 4, '#c8a26a');
    for (const e of world.enemies) if (!e.dead) dot(e.x, e.z, e.def.boss ? 4.5 : e.rare || e.def.thief ? 3.5 : 2, e.rare || e.def.thief ? '#ffd27a' : e.aggro ? '#ff4d5a' : '#b0525c');
    const p = world.player;
    if (world.allies) for (const a of world.allies()) dot(a.x, a.z, 3, a.dead ? '#8a8f9c' : '#7fd0ff');
    if (this.aim) {
      // (0.61.2) a held Deadeye: the whole shot, far past the edge of the screen, and what it would hit
      const A = this.aim;
      const ex = A.x + Math.cos(A.dir) * A.range, ez = A.z + Math.sin(A.dir) * A.range;
      g.save();
      g.lineCap = 'round';
      const on = A.hits.length > 0; // (0.62) red when an enemy is on the line, as on the ground
      g.strokeStyle = on ? 'rgba(255, 70, 60, 0.4)' : 'rgba(255, 200, 96, 0.35)';
      g.lineWidth = Math.max(3, A.width * k);
      g.beginPath(); g.moveTo(X(A.x), Y(A.z)); g.lineTo(X(ex), Y(ez)); g.stroke();
      g.strokeStyle = on ? '#ff8070' : '#ffe2a0';
      g.lineWidth = 1.5;
      g.stroke();
      g.beginPath(); g.arc(X(ex), Y(ez), 3, 0, 7); g.stroke();
      A.hits.forEach((h, i) => {
        g.strokeStyle = i === 0 ? '#ff5a4a' : 'rgba(255, 130, 110, 0.85)';
        g.lineWidth = i === 0 ? 2 : 1.3;
        g.beginPath(); g.arc(X(h.e.x), Y(h.e.z), i === 0 ? 5.5 : 4, 0, 7); g.stroke();
      });
      g.restore();
    }
    dot(p.x, p.z, 3.5, '#ffffff');
  }

  /**
   * (0.61.2) While Deadeye is held: a marker on the edge of the screen pointing at the nearest enemy on the
   * line that is past the edge, with how far away it is. If nothing is on the line, it points down it.
   */
  drawAimMarker(world, renderer) {
    let el = this.aimEl;
    if (!this.aim) {
      if (el) el.classList.add('hidden');
      return;
    }
    if (!el) {
      el = this.aimEl = document.createElement('div');
      el.className = 'aim-edge hidden';
      el.innerHTML = '<span class="aim-arrow">&#10148;</span><span class="aim-dist"></span>';
      this.worldUi.appendChild(el);
    }
    const A = this.aim;
    const W = renderer.width, H = renderer.height, M = 46;
    const off = (x, z) => {
      const q = renderer.project(x, 1, z);
      return !(q.visible && q.x > M && q.x < W - M && q.y > M && q.y < H - M);
    };
    // the nearest enemy on the line that is past the edge of the screen; with none on the line at all,
    // the end of the shot; with every one of them on screen, nothing
    const idx = A.hits.findIndex((h) => off(h.e.x, h.e.z));
    const first = idx >= 0 ? A.hits[idx] : null;
    const tx = first ? first.e.x : A.x + Math.cos(A.dir) * A.range;
    const tz = first ? first.e.z : A.z + Math.sin(A.dir) * A.range;
    if ((!first && A.hits.length) || !off(tx, tz)) {
      el.classList.add('hidden');
      return;
    }
    const s = renderer.project(tx, 1, tz);
    // clamp the point onto a box just inside the screen, along the line from the hero
    const h = renderer.project(A.x, 1, A.z);
    let dx = s.x - h.x, dy = s.y - h.y;
    if (!s.visible) { dx = -dx; dy = -dy; }
    const kx = dx > 0 ? (W - M - h.x) / dx : dx < 0 ? (M - h.x) / dx : Infinity;
    const ky = dy > 0 ? (H - M - h.y) / dy : dy < 0 ? (M - h.y) / dy : Infinity;
    const t = Math.max(0, Math.min(kx, ky));
    const x = h.x + dx * t, y = h.y + dy * t;
    el.classList.remove('hidden');
    el.classList.toggle('target', !!first);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
    el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    el.lastChild.textContent = first ? `${Math.round(first.along)} m${idx > 0 ? ` · hit ${idx + 1} of ${A.hits.length}` : A.hits.length > 1 ? ` · ${A.hits.length} hit` : ''}` : `${Math.round(A.range)} m`;
  }

  /** Exploration only: a name floating over each portal. */
  updatePortalLabels(world, renderer) {
    const id = world.mode === 'explore' ? world.map.id : null;
    if (id !== this.labelMap) {
      this.labelMap = id;
      for (const l of this.portalLabels || []) l.el.remove();
      this.portalLabels = [];
      if (id) {
        for (const gate of world.map.portals) {
          const el = document.createElement('div');
          el.className = 'plabel';
          el.textContent = 'To ' + gate.name;
          this.worldUi.appendChild(el);
          this.portalLabels.push({ el, gate });
        }
        if (world.map.waygate) {
          const el = document.createElement('div');
          el.className = 'plabel way';
          el.textContent = 'Waygate';
          this.worldUi.appendChild(el);
          this.portalLabels.push({ el, gate: world.map.waygate });
        }
        for (const ws of world.map.waystones || []) {
          const el = document.createElement('div');
          el.className = 'plabel way stone';
          el.textContent = 'Waystone';
          this.worldUi.appendChild(el);
          this.portalLabels.push({ el, gate: ws, stone: true });
        }
        for (const ob of world.map.obstacles) {
          if (ob.kind !== 'ring') continue;
          // (0.61) the Echo Ring's stones: say what they are and how to wake them
          const el = document.createElement('div');
          el.className = 'plabel way ring';
          el.innerHTML = 'The Echo Ring <kbd>G</kbd>';
          this.worldUi.appendChild(el);
          this.portalLabels.push({ el, gate: ob });
        }
        // People (with a quest marker) and signs you have not read yet.
        for (const ob of world.map.obstacles) {
          if (ob.kind !== 'npc' && ob.kind !== 'sign') continue;
          const el = document.createElement('div');
          el.className = 'plabel ' + ob.kind;
          this.worldUi.appendChild(el);
          this.portalLabels.push({ el, gate: ob, story: ob.kind });
        }
        this.storyStamp = -1;
      }
    }
    if (id && this.storyStamp !== world.questStamp) {
      this.storyStamp = world.questStamp;
      for (const l of this.portalLabels) {
        if (l.story === 'npc') {
          l.el.innerHTML = (MARKS[world.npcMarker(l.gate.id)] || '') + l.gate.name;
        } else if (l.story === 'sign') {
          const unread = !world.player.signs.includes(l.gate.id);
          l.el.textContent = unread ? 'A glimmer' : '';
          l.el.classList.toggle('hidden', !unread);
        }
      }
      this.drawQuestTracker(world);
    }
    // (0.80.1) bounty jobs and wishes change without a quest changing: look again a few times a second
    const now = performance.now();
    if ((!id && this.trackOn) || (id && now - (this.trackAt || 0) > 400)) {
      this.trackAt = now;
      this.drawQuestTracker(world);
    }
    this.updatePrompt(world);
    for (const l of this.portalLabels || []) {
      const s = renderer.project(l.gate.x, l.story ? 2.5 : l.gate === world.map.waygate || l.stone ? 2.8 : 4.4, l.gate.z);
      l.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -50%)`;
    }
  }

  /** "G  Talk to Elder Wren" while someone or something is in reach. */
  updatePrompt(world) {
    const near = world.interactable();
    const key = near ? near.id : '';
    if (key === this.promptKey) return;
    this.promptKey = key;
    const el = $('prompt');
    el.classList.toggle('hidden', !near);
    if (near) el.innerHTML = `<kbd>G</kbd> ${near.kind === 'npc' ? 'Talk to ' + near.name : near.kind === 'merchant' ? 'Trade with the ' + near.name : near.kind === 'board' ? (near.id === 'wishes' ? 'Read the Wishes' : 'Read the Bounty Board') : near.kind === 'keepaltar' ? 'Tend the Hearth' : near.kind === 'hall' ? 'Visit ' + ((HALLS[near.cls] && HALLS[near.cls].name) || 'the hall') : near.kind === 'altar' ? 'Approach ' + near.name : near.kind === 'delve' ? 'Go down ' + near.name : 'Touch the glimmer: ' + near.name}`;
  }

  /**
   * The list of what you are on, under the minimap: quests, then (0.80.1) the Bounty Board's jobs and the
   * Wishkeep's wishes. Each group can be folded by clicking its heading (kept in this browser).
   */
  drawQuestTracker(world) {
    const el = $('quest-track');
    // (0.81.1) always just under the server/room badge, however many lines it wraps to
    const badge = $('room-badge');
    const rect = badge && !badge.classList.contains('hidden') ? badge.getBoundingClientRect() : null;
    const below = rect && rect.height > 0 ? rect.bottom : 0; // (fixed, so no offsetParent: hidden means no size)
    const top = below > 0 ? Math.round(below + 8) : 0;
    if (top !== this.trackTop) {
      this.trackTop = top;
      el.style.top = top ? `${top}px` : '';
      el.style.maxHeight = top ? `calc(100vh - ${top}px - 190px)` : '';
    }
    const groups = [];
    const p = world.player;
    if (world.mode === 'explore' && !world.trial) {
      const quests = [];
      for (const id in p.quests) {
        const st = p.quests[id];
        const q = QUESTS[id];
        if (!q || st.s === 'done') continue;
        quests.push(st.s === 'ready'
          ? `<div class="qt ready"><b>${q.name}</b><span>Return to ${NPCS[world.questTaker(q.giver)].name} in Haven</span></div>`
          : `<div class="qt"><b>${q.name}</b><span>${goalText(q, st.tier)}${world.questNeed(q) > 1 ? ` · ${st.n}/${world.questNeed(q)}` : ''}</span></div>`);
      }
      if (quests.length) groups.push({ id: 'quests', name: 'Quests', rows: quests, ready: quests.filter((r) => r.includes('qt ready')).length });
      const jobs = (p.bounties || []).filter(Boolean).map((b) => b.done
        ? `<div class="qt ready bounty"><b>${escT(b.text)}</b><span>Done · claim it at the Bounty Board in Haven</span></div>`
        : `<div class="qt bounty"><b>${escT(b.text)}</b><span>${b.need > 1 ? `${b.n}/${b.need}` : 'Not yet'}</span></div>`);
      if (jobs.length) groups.push({ id: 'bounties', name: 'Bounty Board', rows: jobs, ready: (p.bounties || []).filter((b) => b && b.done).length });
      const k = p.keep;
      if (k && k.wishes.length) {
        const wishes = k.wishes.map((w) => {
          const who = SETTLERS[w.who] ? SETTLERS[w.who].name : '';
          if (w.done) return `<div class="qt ready keep"><b>${escT(who)}'s wish</b><span>Answered · tell the Wishes board in the Wishkeep</span></div>`;
          let how = '';
          if (w.kind === 'kill') how = `${w.n}/${w.need}`;
          else if (w.kind === 'offer') {
            const have = w.what === 'fragment' ? (p.misc && p.misc.fragment) || 0 : p[w.what] || 0;
            how = have >= w.need ? 'You have it: give it at the board' : `you have ${have.toLocaleString()}`;
          } else if (w.kind === 'tide') how = 'Call the night at the Hearth';
          else if (w.kind === 'tell') how = 'at the Wishes board';
          // (0.81.2) where to go, then how far along, then whose wish it is (a name, not a place)
          const where = wishWhere(w, true);
          return `<div class="qt keep"><b>${escT(w.kind === 'kill' ? `Defeat ${w.need} enemies` : wishGoal(w))}</b><span>${where ? `${escT(where)} · ` : ''}${how ? `${escT(how)} · ` : ''}for ${escT(who)}</span></div>`;
        });
        // (0.81.1) the keep's hurts at the top, with what to do about them
        const hurt = Object.keys(k.builds || {}).length;
        if (hurt) {
          const dark = k.builds.hearth != null && k.builds.hearth <= 0;
          const cost = world.keepRepairCost ? world.keepRepairCost() : 0;
          wishes.unshift(`<div class="qt keep${dark ? ' urgent' : ''}"><b>${dark ? 'The Hearth is dark' : 'Mend the keep'}</b><span>${dark ? 'No night until it is mended · ' : ''}${cost} Wishstone at the Hearth (you have ${k.stone})</span></div>`);
        }
        groups.push({ id: 'keep', name: 'The Wishkeep', rows: wishes, ready: k.wishes.filter((w) => w.done).length });
      }
    }
    const html = groups.map((g) => {
      const folded = trackFolded.has(g.id);
      const head = `<div class="qt-head${folded ? ' folded' : ''}" data-group="${g.id}" title="${folded ? 'Show' : 'Hide'} these">${g.name}${g.ready ? ` <i>${g.ready} done</i>` : ''}<span>${folded ? g.rows.length : '−'}</span></div>`;
      if (folded) return head;
      return head + g.rows.slice(0, 5).join('') + (g.rows.length > 5 ? `<div class="qt more">and ${g.rows.length - 5} more · <kbd>J</kbd></div>` : '');
    }).join('');
    this.trackOn = groups.length > 0;
    if (html === this.trackHtml) return; // (0.80.1) only when something changed: it runs every frame while there is anything to show
    this.trackHtml = html;
    el.classList.toggle('hidden', !groups.length);
    el.innerHTML = html;
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('click', (e) => {
        const h = e.target.closest('.qt-head');
        if (!h) return;
        const g = h.dataset.group;
        if (trackFolded.has(g)) trackFolded.delete(g);
        else trackFolded.add(g);
        try {
          localStorage.setItem(TRACK_KEY, JSON.stringify([...trackFolded]));
        } catch {}
        this.trackHtml = null;
        this.drawQuestTracker(world);
      });
    }
  }

  /** Text that pops up at a world position and drifts upward. */
  float(renderer, x, y, z, text, cls = '') {
    if (this.floatCount > 40) return;
    const s = renderer.project(x, y, z);
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    // (0.72.1) the text in its own span: a crit's pop scales the span, never the placed box (scaling the
    // box scaled its position too, so crits flew in from the right)
    const inner = document.createElement('span');
    inner.textContent = text;
    el.appendChild(inner);
    const jitter = cls.includes('word') ? 0 : (Math.random() - 0.5) * 36;
    el.style.transform = `translate(${Math.round(s.x + jitter)}px, ${Math.round(s.y)}px) translate(-50%, -50%)`;
    this.worldUi.appendChild(el);
    this.floatCount++;
    el.addEventListener('animationend', (e) => {
      if (e.target !== el) return; // (0.72.1) the crit's own pop ends first; only the float's rise removes it
      el.remove();
      this.floatCount--;
    });
  }

  banner(title, sub = '') {
    const el = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  hint(text, seconds = 6) {
    const el = $('hint');
    el.textContent = text;
    el.classList.remove('hidden');
    this.hintTimer = seconds;
  }

  screenFlash(strength) {
    const el = $('flash');
    el.style.transition = 'none';
    el.style.opacity = strength;
    void el.offsetWidth;
    el.style.transition = 'opacity 0.35s ease-out';
    el.style.opacity = 0;
  }

  feedItem(item, { equipped, upgrade }) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.style.color = RARITIES[item.rarity].color;
    el.textContent = itemName(item);
    if (equipped || upgrade) {
      const up = document.createElement('span');
      up.className = 'up';
      up.textContent = equipped ? 'equipped' : '▲ upgrade';
      el.appendChild(up);
    }
    this.feedPush(el);
  }
  feedText(text) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.textContent = text;
    this.feedPush(el);
  }
  feedPush(el) {
    const feed = $('feed');
    feed.appendChild(el);
    while (feed.children.length > 5) feed.firstChild.remove();
    el.addEventListener('animationend', () => el.remove());
  }

  setGearBadge(n) {
    for (const id of ['gear-badge', 'town-gear-badge']) {
      const b = $(id);
      b.textContent = n;
      b.classList.toggle('hidden', n <= 0);
    }
  }

  /** Name, level and health over each party member. */
  updateAllies(world, renderer) {
    if (!this.allyTags) this.allyTags = new Map();
    const list = world.mode === 'explore' && world.allies ? world.allies().slice() : [];
    // (0.81) the Wishkeep's heroes, and (when hurt or in a Tide) its buildings, with the same plates
    for (const tr of world.troops || []) list.push({ pid: 'troop:' + tr.id, name: tr.name, level: `level ${tr.lvl}`, dead: !!tr.dead, hp: tr.hp, maxHp: tr.maxHp, x: tr.x, z: tr.z, troop: true });
    const night = world.tide && world.tide.state === 'on';
    for (const b of world.keepBuilds || []) {
      if (!night && b.hp >= b.max) continue;
      list.push({ pid: 'build:' + b.id, name: b.id === 'hearth' ? 'The Hearth' : (HALLS[b.id] && HALLS[b.id].name) || b.id, level: b.hp <= 0 ? 'wrecked' : b.wardT > 0 ? 'warded' : `${Math.ceil((b.hp / b.max) * 100)}%`, dead: b.hp <= 0, hp: b.hp, maxHp: b.max, x: b.x, z: b.z, build: true, y: b.id === 'hearth' ? 4.2 : 5.6 });
    }
    const seen = new Set();
    for (const a of list) {
      let t = this.allyTags.get(a.pid);
      if (!t) {
        const el = document.createElement('div');
        el.className = 'ally-tag';
        el.innerHTML = '<b></b><div class="abar"><div class="afill"></div></div>';
        if (a.troop) el.classList.add('troop');
        if (a.build) el.classList.add('build');
        this.worldUi.appendChild(el);
        t = { el, name: el.firstChild, fill: el.querySelector('.afill'), key: '' };
        this.allyTags.set(a.pid, t);
      }
      seen.add(a.pid);
      const key = `${a.name} · ${a.level}${a.dead && !a.build ? ' · down' : ''}`;
      if (t.key !== key) {
        t.key = key;
        t.name.textContent = key;
        t.el.classList.toggle('down', a.dead);
      }
      t.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, a.hp / a.maxHp))})`;
      const s = renderer.project(a.x, a.y || 2.9, a.z);
      t.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
    }
    for (const [pid, t] of this.allyTags) {
      if (seen.has(pid)) continue;
      t.el.remove();
      this.allyTags.delete(pid);
    }
  }

  /** (0.81) In a Tide, the god's miracles over the hero's skills: what each costs, and when it is ready. */
  updateMiracles(world) {
    const el = $('miracles');
    const t = world.tide;
    const on = !!(t && t.state === 'on' && world.map && world.map.id === 'wishkeep');
    el.classList.toggle('hidden', !on);
    document.body.classList.toggle('god', on && !(t.inc > 0)); // (0.81.1) the hero's own skill bar dims while they are a god
    if (!on) return (this.mirKey = null);
    const faith = world.player.keep ? world.player.keep.faith : 0;
    const inc = t.inc > 0;
    const key = (inc ? `inc${Math.ceil(t.inc)}` : MIRACLE_IDS.map((m) => `${Math.ceil((t.mcd && t.mcd[m]) || 0)}`).join('|') + `|${Math.ceil(t.icd || 0)}`) + '|' + faith;
    if (key === this.mirKey) return;
    this.mirKey = key;
    const card = (k, name, cost, cd, max, desc, extra = '') => `<div class="mir${cd > 0 ? ' cool' : ''}${faith < cost ? ' poor' : ''}${extra}" title="${desc}"><kbd>${k.toUpperCase()}</kbd> <b>${name}</b>${cost} Faith${cd > 0 ? ` · ${Math.ceil(cd)}s` : ''}<i style="width:${cd > 0 ? Math.round((1 - cd / max) * 100) : 100}%"></i></div>`;
    el.innerHTML = inc
      ? `<div class="mir incarnate" title="${INCARNATE.desc}"><b>Incarnate</b>your own skills · ${Math.ceil(t.inc)}s<i style="width:${Math.round((t.inc / INCARNATE.dur) * 100)}%"></i></div>`
      : MIRACLE_IDS.map((m) => card(MIRACLES[m].key, MIRACLES[m].name, MIRACLES[m].faith, (t.mcd && t.mcd[m]) || 0, MIRACLES[m].cd, MIRACLES[m].desc)).join('') + card(INCARNATE.key, 'Incarnate', INCARNATE.faith, t.icd || 0, INCARNATE.cd, INCARNATE.desc, ' inc');
  }

  /** "Room K7QXM · 3 players", top of the screen, while in a room. */
  setRoom(info) {
    const el = $('room-badge');
    el.classList.toggle('hidden', !info);
    document.body.classList.toggle('in-room', !!info);
    if (!info) return;
    const ping = info.ping ? ` · <span class="ping ${info.ping > 120 ? 'bad' : info.ping > 50 ? 'meh' : 'good'}" title="Round trip to ${info.host ? 'your slowest friend' : 'the host'}${info.relay ? ', through a relay server (a direct connection could not be made)' : ''}">${info.ping} ms${info.relay ? ' · relay' : ''}</span>` : '';
    const html = info.alone
      ? `Playing alone · <b>online</b>${ping}` // (0.57.1) your online character, a Haven of your own
      : info.server
      ? `Server world <b>${info.code}</b> · ${info.players} online${ping} · <span class="rb-players" title="Everyone on this world (press O)"><kbd>O</kbd> players</span> · <kbd>Enter</kbd> chat`
      : `Room <b>${info.code}</b> · ${info.players} player${info.players === 1 ? '' : 's'}${info.host ? ' · hosting' : ''}${ping}`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  reset() {
    for (const bar of this.bars.values()) bar.el.remove();
    this.bars.clear();
    this.worldUi.querySelectorAll('.float').forEach((el) => el.remove());
    this.floatCount = 0;
    $('feed').innerHTML = '';
    $('hint').classList.add('hidden');
    this.lastPosture = null;
    document.body.classList.remove('slowmo');
  }
}

/** One shared tooltip element that follows whatever is hovered. */
export class Tooltip {
  /** Shift held: ability tooltips show their calculation (0.52). */
  static shift = false;
  constructor() {
    this.el = $('tooltip');
    this.last = null;
    const flip = (on) => {
      if (Tooltip.shift === on) return;
      Tooltip.shift = on;
      // a tooltip built from a function is built again, so it shows (or hides) the details at once
      if (this.last && !this.el.classList.contains('hidden')) this.show(...this.last);
    };
    window.addEventListener('keydown', (e) => e.key === 'Shift' && flip(true));
    window.addEventListener('keyup', (e) => e.key === 'Shift' && flip(false));
    window.addEventListener('blur', () => flip(false));
  }
  show(content, anchor, rarityColor, immortal = false) {
    this.last = typeof content === 'function' ? [content, anchor, rarityColor, immortal] : null;
    const html = typeof content === 'function' ? content() : content;
    if (!html) return;
    this.el.innerHTML = html;
    this.el.style.setProperty('--rarity', rarityColor || '');
    this.el.classList.toggle('immortal', immortal === true);
    this.el.classList.toggle('eternal', immortal === 'eternal'); // (0.71)
    this.el.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const tw = this.el.offsetWidth;
    const th = this.el.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    let y = r.top - th - 10;
    if (y < 8) y = r.bottom + 10;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    y = Math.max(8, Math.min(window.innerHeight - th - 8, y));
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  }
  hide() {
    this.el.classList.add('hidden');
  }
}
