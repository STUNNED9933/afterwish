// The gear drawer: equipped items, stats, and the bag.
import { sourcesOf, usesOf } from '../sim/sources.js';
import { CONFIG } from '../config.js';
import { ECHOES } from '../sim/rebirth.js';
import { itemTypeName, SLOTS, SLOT_NAMES, STAT_KEYS, STATS, RARITIES, EFFECTS, effectFor, itemScore, itemStats, itemName, scrapValue, formatStat, SETS, setCounts, enchantable, enchantCost, dustValue, MISC, MISC_IDS, rerollCost, reforgeChoices, rollQuality, rollTier, lineTier, topTier, statRange, isMainStat, bestUpgrades, REROLL_PITY, ROLL_TIER_AT, starPotency } from '../sim/items.js';
import { SPECS } from '../sim/talents.js';
import { GLOWS, GLOW_IDS } from '../sim/cosmetics.js';
import { FRAGMENTS, SIGIL, GLASS, BOUNTY, MERCHANT } from '../sim/surprises.js';
import { svg, gearIcon, gearClassNow, gearSpecNow } from './hud.js';
import { steadyRatings, ratingsWith, signed } from '../power.js';
import { itemLore } from './lore.js';
import { emberOf, DEEP, DEPTH_IDS } from '../sim/endgame.js';
import { ETERNAL, ETERNAL_PASSIVES, passiveText, slotsOpen, xpToMax, feedValue, nextSlotAt, feed as feedPreview } from '../sim/eternal.js';

// Set while the gear drawer is open: Combat Power if an item were worn (for its tooltip).
let powerProbe = null;
// ...and how many pieces of each set are worn (0.29).
let setsWorn = {};

const $ = (id) => document.getElementById(id);

/** Tooltip for an item. `compareTo` adds the "if you equip this" section. */
export function itemTooltip(item, compareTo) {
  const rarity = RARITIES[item.rarity];
  const stats = itemStats(item);
  const keys = Object.keys(stats);
  let html = `<div class="tt-name">${itemName(item)}</div><div class="tt-meta">${rarity.name} ${itemTypeName(item)} &middot; item level ${item.ilvl} &middot; gear score ${Math.round(itemScore(item))}</div>`;
  if (item.eternal) html += eternalHead(item) + eternalPassives(item); // (0.75.1) its passives first, where they are seen
  keys.forEach((k, i) => {
    const ench = item.enchantKey === k ? ' <span class="tt-ench" title="Reforged: only this line can be reforged again">✦</span>' : '';
    html += `<div class="tt-stat${i === 0 ? ' main' : ''}${item.eternal ? ' et' : ''}${item.eternal && lineTier(item, k) === 7 ? ' et-top' : ''}">${rollPip(item, k)}${formatStat(k, stats[k])}${ench}</div>`;
  });
  if (item.eternal) {
    // (0.75) every stat, at ten times a made Immortal's; the speeds have a ceiling
    const cap = CONFIG.ETERNAL_GEAR_CAP;
    html += `<div class="tt-as">At least ten times a made Immortal's every line. Gear limits with Eternal on: Attack Speed +${cap.as}%, Move Speed +${cap.ms}%, Haste ${cap.haste}, Crit ${cap.crit}%.</div>`;
  }
  if (item.set && SETS[item.set]) {
    // A set piece (0.29): its set's bonuses, lit when enough pieces are worn.
    const set = SETS[item.set];
    const n = setsWorn[item.set] || 0;
    html += `<div class="tt-set"><b>${set.name} set</b> &middot; ${SPECS[set.spec] ? SPECS[set.spec].name : ''} &middot; ${n} of 4 worn<div class="${n >= 2 ? 'on' : ''}">(2) ${set.two.desc}</div><div class="${n >= 4 ? 'on' : ''}">(4) ${set.four.desc}</div></div>`;
  }
  if (item.effect && EFFECTS[item.effect]) {
    const k = starPotency(item); // (0.65) the passive grows with the stars; (0.67) its numbers worked out, the grown ones in gold
    const fx = effectFor(item.effect, item.cls || gearClassNow(), gearSpecNow(), k, true);
    const as = fx.spec && SPECS[fx.spec] ? `<div class="tt-as">As a ${SPECS[fx.spec].name}. An Immortal's effect follows the subclass you play.</div>` : !EFFECTS[item.effect].unique && !gearSpecNow() ? '<div class="tt-as">From level 15 its effect becomes your subclass\'s own.</div>' : '';
    const pot = k > 1 ? `<div class="tt-as pot-note">${'★'.repeat(item.stars)} The numbers in gold have grown with its stars (${Math.round(k * 100)}% of the passive at one).</div>` : '';
    html += `<div class="tt-effect"><b>${fx.name}</b> ${fx.desc}${pot}${as}</div>`;
  }
  // (0.61.2) what the item is, and for an Immortal, its story
  const lore = itemLore(item, item.effect && EFFECTS[item.effect] ? effectFor(item.effect, item.cls || gearClassNow(), gearSpecNow()) : null);
  if (lore.text) html += `<div class="tt-lore ${lore.kind}">${lore.text}</div>`;
  if (compareTo && compareTo !== item) {
    const other = itemStats(compareTo);
    let diff = '';
    for (const k of STAT_KEYS) {
      const d = (stats[k] || 0) - (other[k] || 0);
      if (d !== 0) diff += `<div class="${d > 0 ? 'plus' : 'minus'}">${formatStat(k, d)}</div>`;
    }
    if (compareTo.effect && compareTo.effect !== item.effect) diff += `<div class="minus">Loses ${effectFor(compareTo.effect, compareTo.cls || gearClassNow(), gearSpecNow()).name}</div>`;
    const dp = Math.round(itemScore(item) - itemScore(compareTo));
    html += `<div class="tt-diff"><b>Compared with what you are wearing</b>${diff || '<div>No change</div>'}<div class="${dp >= 0 ? 'plus' : 'minus'}">${dp >= 0 ? '+' : ''}${dp} gear score</div>${cpLine(item)}</div>`;
  } else if (!compareTo && powerProbe && powerProbe.empty(item)) {
    html += `<div class="tt-diff">${cpLine(item)}</div>`;
  }
  if (item.gift) html += '<div class="tt-gift">A gift from a friend: yours to use. It cannot be passed on, and gives the star nothing at a rebirth.</div>'; // (0.58)
  const dust = dustValue(item);
  if (item.locked) html += `<div class="tt-lock">${LOCK_SVG} Locked: never scrapped, fed, traded, dropped or used to ascend. Alt+click (or Lock mode) to unlock.</div>`; // (0.75.2)
  if (!item.eternal) html += `<div class="tt-desc">Scraps for ${scrapValue(item)} scrap${dust ? ` and ${dust} Wishdust` : ""}</div>`; // (0.71) an Eternal is never scrapped
  return html;
}

/** (0.71) An Eternal's level, its experience, and what it is. */
function eternalHead(item) {
  const lv = item.level || 1;
  const max = lv >= ETERNAL.maxLevel;
  const need = max ? 0 : ETERNAL.xpFor(lv);
  const pct = max ? 100 : Math.round(((item.xp || 0) / need) * 100);
  return `<div class="tt-eternal">Level <b>${lv}</b> of ${ETERNAL.maxLevel}${max ? '' : ` &middot; ${Math.round(item.xp || 0)} / ${need} to the next`}<div class="et-xp"><i style="width:${pct}%"></i></div><small>Soulbound: never traded, scrapped or lost. Kept through rebirth. Grows by Feeding.</small></div>`;
}
/** (0.71) An Eternal's passives, open and still to open. */
function eternalPassives(item) {
  let html = `<div class="tt-effect eternal"><div class="et-ptitle">Passives &middot; strongest on bosses, half on the rest</div>`;
  for (const ps of item.passives || []) html += `<div><b>${ETERNAL_PASSIVES[ps.key] ? ETERNAL_PASSIVES[ps.key].name : ps.key}</b> ${passiveText(ps, item, true)}</div>`;
  const next = nextSlotAt(item);
  if (next) html += `<div class="et-locked">Another passive at level ${next}.</div>`;
  return html + '</div>';
}

/** A small mark in the colour of how well a line rolled (0.43): Common for a low roll, Immortal for the best. */
export function rollPip(item, key) {
  const q = rollQuality(item, key);
  const tier = rollTier(q, !!item.eternal);
  const t = RARITIES[tier];
  // an Immortal roll shimmers like Immortal gear (0.43.1); (0.75.3) an Eternal one, on Eternal gear, burns white and red
  const cls = tier === 7 ? ' eter' : tier === 6 ? ' imm' : '';
  return `<span class="roll-pip${cls}" style="--tier:${t.color}" title="${t.name} roll: ${Math.round(q * 100)}% of the way to the best this line can be"></span>`;
}

/** "Combat Power +123 (Might +200, Resolve −77)" for wearing this item, when the gear drawer can work it out. */
function cpLine(item) {
  if (!powerProbe) return '';
  const r = powerProbe.with(item);
  if (!r) return '';
  const now = powerProbe.now;
  const d = r.cp - now.cp;
  return `<div class="tt-cp ${d >= 0 ? 'plus' : 'minus'}">Combat Power ${signed(d)} <span style="opacity:.75;font-weight:400">(Might ${signed(r.might - now.might)}, Resolve ${signed(r.resolve - now.resolve)})</span></div>`;
}

/** A square item tile. */
const pct = (x) => `${Math.round(x * 100)}%`;
/** Where each pouch keepsake comes from: worked out from the game's own tables (sim/sources.js). */
const miscSources = (id) => sourcesOf(id);
function miscTooltip(id, n) {
  const m = MISC[id];
  const use = id === 'fragment' ? `${m.desc} ${FRAGMENTS.craft} make one.` : m.desc;
  return `<div class="tt-name">${m.name}</div><div class="tt-meta">Keepsake · ${n} in the pouch</div><div class="tt-desc">${use}</div>` +
    `<div class="tt-from"><b>Where to find more</b><ul>${miscSources(id).map((s) => `<li>${s}</li>`).join('')}</ul></div>`;
}

// (0.62.1) What the gear window's wallet shows: each resource, its icon, what it is for, and where it comes from.
const WALLET = [
  { key: 'gold', name: 'Gold', color: '#ffd24a', shared: true,
    icon: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.5 9.5c.6-1 1.6-1.4 2.6-1.4 1.5 0 2.4.8 2.4 1.8 0 2.4-5 1.4-5 4 0 1 1 1.8 2.6 1.8 1 0 2-.5 2.6-1.4"/>', },
  { key: 'tickets', name: 'Shards', color: '#9fe8ff', shared: true,
    icon: '<path d="M12 3l5 6-5 12-5-12z"/><path d="M7 9h10M12 3v18"/>', },
  { key: 'scrap', name: 'Scrap', color: '#c9c4b0', kept: true,
    icon: '<path d="M12 4l1.6 2.8 3.2-.6.4 3.2 2.8 1.6-1.6 2.8 1.6 2.8-2.8 1.6-.4 3.2-3.2-.6L12 20l-1.6-2.8-3.2.6-.4-3.2-2.8-1.6L5.6 12 4 9.2l2.8-1.6.4-3.2 3.2.6z"/><circle cx="12" cy="12" r="3"/>', },
  { key: 'dust', name: 'Wishdust', color: '#e7c6ff', kept: true,
    icon: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><path d="M12 9.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/><circle cx="18.5" cy="5.5" r="1"/><circle cx="5.5" cy="18.5" r="1"/>', },
  { key: 'keys', name: 'Warden keys', color: '#ffb070', kept: true,
    icon: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>', },
  { key: 'essence', name: 'Echo Essence', color: '#b8a8ff', kept: true, rebirth: true,
    icon: '<path d="M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8"/><path d="M12 8c2.2 0 4 1.8 4 4s-1.8 4-4 4"/><circle cx="12" cy="12" r="1.2"/><path d="M12 4C7.6 4 4 7.6 4 12"/>', },
];
function walletTooltip(w, n) {
  const kept = w.shared ? 'Shared by every hero on the account' : w.kept ? 'Kept through a rebirth' : '';
  return `<div class="tt-name" style="color:${w.color}">${w.name}</div><div class="tt-meta">${n.toLocaleString()}${kept ? ` · ${kept}` : ''}</div>` +
    `<div class="tt-from"><b>What it is for</b><ul>${usesOf(w.key).map((u) => `<li>${u}</li>`).join('')}</ul></div>` +
    `<div class="tt-from"><b>Where to find more</b><ul>${sourcesOf(w.key).map((u) => `<li>${u}</li>`).join('')}</ul></div>`;
}

/** (0.62) Ask before rerolling an Immortal-tier line (on unless turned off; kept in this browser). */
function guardImmortal() {
  try {
    return localStorage.getItem('afterwish-guard-immortal') !== '0';
  } catch {
    return true;
  }
}
function setGuardImmortal(on) {
  try {
    localStorage.setItem('afterwish-guard-immortal', on ? '1' : '0');
  } catch {}
}

// (0.75.2) a small padlock for locked gear
export const LOCK_SVG = '<svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="4.5" y="10" width="15" height="11" rx="2" fill="currentColor"/></svg>';

export function itemCell(tooltip, item, { button = false, compareTo = null, upgrade = false } = {}) {
  const el = document.createElement(button ? 'button' : 'div');
  if (button) el.type = 'button';
  el.className = 'cell' + (item ? ' filled' : '') + (item && RARITIES[item.rarity].effect ? ' immortal' : '') + (item && item.eternal ? ' eternal' : '');
  if (item) {
    const color = RARITIES[item.rarity].color;
    el.style.setProperty('--rarity', color);
    const imm = item.eternal ? 'eternal' : !!RARITIES[item.rarity].effect;
    el.innerHTML = `${gearIcon(item)}<span class="lvl">${item.eternal ? `L${item.level || 1}` : item.ilvl}${item.plus ? `<small>+${item.plus}</small>` : ''}</span>${upgrade ? '<span class="arrow">▲</span>' : ''}${imm === true ? '<span class="imm-star" aria-hidden="true">✦</span>' : item.eternal ? '<span class="imm-star et" aria-hidden="true">✧</span>' : ''}${item.locked ? `<span class="lock-mark" aria-hidden="true">${LOCK_SVG}</span>` : ''}`;
    if (item.locked) el.classList.add('locked');
    el.addEventListener('mouseenter', () => tooltip.show(itemTooltip(item, compareTo), el, color, imm));
    el.addEventListener('mouseleave', () => tooltip.hide());
    if (button) el.setAttribute('aria-label', `${itemName(item)}, ${RARITIES[item.rarity].name} ${itemTypeName(item)}${upgrade ? ', upgrade' : ''}`);
  }
  return el;
}

export class Inventory {
  /**
   * @param {object} tooltip   shared Tooltip
   * @param {function} send    send(command) -> applies a command to the world
   */
  /**
   * @param {object} keep  { get: () => rarity indices never to bulk-scrap, set: (list) => void }
   */
  constructor(tooltip, send, keep, trade = {}) {
    this.trade = trade; // { offered(): Set of item ids | null, toggle(id), party(): bool } (0.25)
    this.tooltip = tooltip;
    this.send = send;
    this.keep = keep || { get: () => [], set: () => {} };
    $('btn-scrap').addEventListener('click', () => this.send({ type: 'scrap', keep: this.keep.get() }));
    $('btn-equip-all').addEventListener('click', () => this.send({ type: 'autoEquip' })); // (0.61.9)
    $('btn-lock-mode').addEventListener('click', () => {
      this.lockMode = !this.lockMode; // (0.75.2) while on, a click on a bag item locks or unlocks it
      if (this.world) this.render(this.world);
    });
    // (0.74.1) Eternal gear in a tab of its own
    this.tab = 'gear';
    for (const [id, tab] of [['tab-gear', 'gear'], ['tab-eternal', 'eternal']]) {
      $(id).addEventListener('click', () => {
        this.tab = tab;
        if (this.world) this.render(this.world);
      });
    }
    // (0.75.3) Auto-scrap new gear up to a rarity (Ancient at most), saved on the hero
    const as = $('auto-scrap');
    as.innerHTML = '<option value="">Off</option>' + RARITIES.slice(0, 6).map((r, i) => `<option value="${i}">${i ? `${r.name} and below` : 'Common only'}</option>`).join('');
    as.addEventListener('change', () => {
      const v = as.value === '' ? null : Number(as.value);
      if (v != null) {
        const n = this.world ? this.world.player.bag.filter((it) => it && !it.locked && !it.set && it.rarity <= v && itemScore(it) <= itemScore(this.world.player.equipped[it.slot])).length : 0;
        if (n && !window.confirm(`Auto-scrap ${RARITIES[v].name}${v ? ' and below' : ''}: this also scraps the ${n} piece${n > 1 ? 's' : ''} like that in your gear box now (not upgrades, set pieces or locked ones). Go ahead?`)) {
          if (this.world) this.render(this.world);
          return;
        }
      }
      this.send({ type: 'autoScrap', to: v });
    });
    // One toggle per rarity from Rare up: kept items stay in the bag even when they are worse.
    const root = $('keep-rarities');
    RARITIES.forEach((r, i) => {
      if (i < 2 || r.eternal) return; // (0.71) an Eternal is never in the gear box
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'keep-chip';
      b.dataset.rarity = i;
      b.textContent = r.name;
      b.style.setProperty('--rc', r.color);
      b.addEventListener('click', () => {
        const list = new Set(this.keep.get());
        if (list.has(i)) list.delete(i);
        else list.add(i);
        this.keep.set([...list].sort());
        if (this.world) this.render(this.world);
      });
      root.appendChild(b);
    });
  }

  /** Rebuild the whole drawer from the current world state. */
  render(world) {
    this.world = world;
    const p = world.player;
    const keep = new Set(this.keep.get());
    for (const b of $('keep-rarities').children) b.setAttribute('aria-pressed', keep.has(Number(b.dataset.rarity)) ? 'true' : 'false');
    this.tooltip.hide();
    this.wallet(world); // (0.62.1) gold, shards, scrap, Wishdust, keys and Echo Essence, each with an icon and its uses
    setsWorn = setCounts(p.equipped);

    const eq = $('equipped');
    eq.innerHTML = '';
    for (const slot of SLOTS) {
      const item = p.equipped[slot];
      const row = document.createElement('div');
      row.className = 'eq-row';
      const cell = itemCell(this.tooltip, item);
      if (!item) {
        cell.innerHTML = gearIcon(slot);
        cell.style.opacity = 0.35;
      }
      const text = document.createElement('div');
      text.innerHTML = `<div class="eq-slot">${SLOT_NAMES[slot]}${item ? ' · gear score ' + Math.round(itemScore(item)) : ''}${item && item.set ? ` · <span class="set-tag">${SETS[item.set].name} ${setsWorn[item.set] || 0}/4</span>` : ''}</div><div class="eq-name${item && RARITIES[item.rarity].effect ? ' immortal' : ''}${item && item.eternal ? ' eternal' : ''}" style="color:${item ? RARITIES[item.rarity].color : 'var(--muted)'}">${item ? itemName(item) : 'Empty'}</div>`;
      row.append(cell, text);
      const btns = document.createElement('div');
      btns.className = 'eq-btns';
      if (item && item.rarity === 6 && item.effect && !world.trial && (item.stars || 0) < 5) {
        // Ascending (0.31): a duplicate Immortal in the bag can be fed into this one.
        const dupAt = p.bag.findIndex((b) => b.rarity === item.rarity && b.effect === item.effect);
        if (dupAt >= 0) {
          const a = document.createElement('button');
          a.type = 'button';
          a.className = 'ghost tiny ench-btn ascend';
          a.textContent = `Ascend ★${(item.stars || 0) + 1}`;
          a.title = `Feed the duplicate ${itemName(p.bag[dupAt])} in your bag into this one: +10% to every stat and +20% to its passive per star, up to 5 stars (the passive twice as strong at 5). The duplicate is used up.`;
          a.addEventListener('click', () => this.send({ type: 'ascend', slot, index: dupAt }));
          btns.appendChild(a);
        }
      }
      const mem = p.rebirth && p.rebirth.memories && p.rebirth.memories[slot];
      if (item && mem && !world.trial && !item.eternal) {
        // Echoes (0.53): back up to the +level and stars you had in this slot, for Echo Essence
        const plusTo = Math.min(10, mem.plus || 0), starsTo = item.rarity === 6 && item.effect ? mem.stars || 0 : 0;
        const what = (item.plus || 0) < plusTo ? [ECHOES.plusCost, `+${(item.plus || 0) + 1}`] : (item.stars || 0) < starsTo ? [ECHOES.starCost, `★${(item.stars || 0) + 1}`] : null;
        if (what) {
          const a = document.createElement('button');
          a.type = 'button';
          a.className = 'ghost tiny ench-btn echo-btn';
          a.textContent = `Echo ${what[1]} · ${what[0]}`;
          a.disabled = p.rebirth.essence < what[0];
          a.title = `Your hands remember: you had this slot at +${mem.plus || 0}${mem.stars ? ` and ${mem.stars} stars` : ''} in a past life. Up to that, +levels cost ${ECHOES.plusCost} Echo Essence and stars ${ECHOES.starCost} (no duplicate needed). You have ${p.rebirth.essence}.`;
          a.addEventListener('click', () => this.send({ type: 'echoUp', slot }));
          btns.appendChild(a);
        }
      }
      if (item && item.eternal && !world.trial) {
        // (0.71) an Eternal comes off to its own place
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost tiny ench-btn';
        b.textContent = 'Take off';
        b.title = 'Back to the Eternal panel (it is never put in the gear box)';
        b.addEventListener('click', () => this.send({ type: 'stowEternal', slot }));
        btns.appendChild(b);
      }
      if (item && !world.trial) {
        // Rerolling and reforging (an Eternal since 0.75: rerolls only) (0.43; enchanting since 0.29)
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost tiny ench-btn';
        b.textContent = this.enchantSlot === slot ? 'Close' : 'Reroll';
        b.title = 'Reroll the numbers on this item (gold and scrap, as often as you like), or reforge a line into a stat you choose (Wishdust)';
        b.addEventListener('click', () => {
          this.enchantSlot = this.enchantSlot === slot ? null : slot;
          this.reforgeKey = null;
          this.render(world);
        });
        btns.appendChild(b);
      }
      if (item && !item.eternal && !world.trial) {
        // (0.75.2) lock what you wear, so it stays safe when it goes back to the gear box
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost tiny ench-btn lock-btn' + (item.locked ? ' on' : '');
        b.innerHTML = `${LOCK_SVG}${item.locked ? 'Unlock' : 'Lock'}`;
        b.title = item.locked ? 'Locked: never scrapped, fed, traded or dropped. Click to unlock.' : 'Lock it: never scrapped, fed to an Eternal, traded or dropped by accident';
        b.addEventListener('click', () => this.send({ type: 'lockItem', slot }));
        btns.appendChild(b);
      }
      if (btns.children.length) row.appendChild(btns);
      eq.appendChild(row);
      if (item && this.enchantSlot === slot) eq.appendChild(this.enchantPanel(world, slot, item));
    }
    if (p.keepsake) {
      // (0.53) the keepsake slot: Edric's Colours, always your level, kept through rebirth
      const row = document.createElement('div');
      row.className = 'eq-row keepsake';
      const cell = itemCell(this.tooltip, p.keepsake);
      const text = document.createElement('div');
      text.innerHTML = `<div class="eq-slot">Keepsake · always your level · kept through rebirth</div><div class="eq-name immortal" style="color:${RARITIES[p.keepsake.rarity].color}">${itemName(p.keepsake)}</div>`;
      row.append(cell, text);
      eq.appendChild(row);
    }
    this.renderEternal(world); // (0.71)
    const rb = p.rebirth;
    if (rb && !world.trial && (rb.essence > 0 || Object.keys(rb.memories || {}).length)) {
      // Echoes (0.53): the pieces the star remembers, to recall at your level
      const box = document.createElement('div');
      box.className = 'echoes';
      box.innerHTML = `<div class="eq-slot">Echoes · <b>${rb.essence}</b> Echo Essence</div><p class="setting-desc">The best piece you wore in each slot, in past lives. Recall one (once a life) and it is made again at your level: its rarity, effect, how good its rolls were and its enchant. It comes back in its prime: its +levels and stars too, and it follows your level from then on.</p>`;
      for (const slot of SLOTS) {
        const mem = rb.memories && rb.memories[slot];
        if (!mem) continue;
        const row = document.createElement('div');
        row.className = 'echo-row';
        const cost = ECHOES.recall[mem.rarity] || 0, from = ECHOES.recallFrom[mem.rarity] || 1;
        row.innerHTML = `<span class="eq-name" style="color:${RARITIES[mem.rarity].color}">${itemName(mem)}</span>`;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost tiny echo-btn';
        b.textContent = rb.recalled[slot] ? 'Recalled' : p.level < from ? `Recall from level ${from}` : `Recall · ${cost}`;
        b.disabled = !!rb.recalled[slot] || p.level < from || rb.essence < cost;
        b.title = `Make it again at level ${p.level} for ${cost} Echo Essence`;
        b.addEventListener('click', () => this.send({ type: 'recall', slot }));
        row.appendChild(b);
        box.appendChild(row);
      }
      eq.appendChild(box);
    }

    // Combat Power, worked out once per render; item tooltips compare against it.
    const now = steadyRatings(world);
    powerProbe = { now, with: (item) => (world.player === p ? ratingsWith(world, item) : null), empty: (item) => !p.equipped[item.slot] };
    $('power-card').innerHTML = `<div class="cp">${now.cp.toLocaleString()}<small>Combat Power</small></div><div class="sub">Might <b>${now.might.toLocaleString()}</b> · Resolve <b>${now.resolve.toLocaleString()}</b></div>`;

    // Weapon glows (0.31): the ones this character has earned, and which is shown.
    const glowRow = $('glow-row');
    if (glowRow) {
      const owned = (p.glows || []).filter((id) => GLOWS[id]);
      glowRow.innerHTML = `<span class="glow-label">Weapon glow</span>`;
      const chip = (id, label, color, title) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'keep-chip';
        b.textContent = label;
        b.title = title;
        if (color != null) b.style.borderColor = '#' + color.toString(16).padStart(6, '0');
        b.setAttribute('aria-pressed', (p.glow || null) === id ? 'true' : 'false');
        b.addEventListener('click', () => this.send({ type: 'setGlow', id }));
        glowRow.appendChild(b);
      };
      chip(null, 'None', null, 'No glow');
      for (const id of owned) chip(id, GLOWS[id].name, GLOWS[id].color, GLOWS[id].how);
      const locked = GLOW_IDS.filter((id) => !owned.includes(id));
      if (locked.length) {
        const hint = document.createElement('span');
        hint.className = 'glow-hint';
        hint.textContent = `${locked.length} more to find`;
        hint.title = locked.map((id) => `${GLOWS[id].name}: ${GLOWS[id].how}`).join('\n');
        glowRow.appendChild(hint);
      }
    }

    const s = p.stats;
    const reduction = Math.round((1 - 100 / (100 + s.armor)) * 100);
    const rows = [
      ['Level', p.level],
      ['Health', s.maxHp],
      [world.cls === 'mage' ? 'Spell Power' : 'Attack Damage', s.ad],
      ['Armor', `${s.armor} (${reduction}% less damage)`],
      ['Attack Speed', s.as.toFixed(2) + ' / s'],
      ['Move Speed', s.ms.toFixed(1)],
      ['Ability Haste', s.haste + (world.rawCooldown && world.overflowMult('q') > 1 ? ` (cooldowns at 1 s; ${world.kit.q.name} ${Math.round(world.overflowMult('q') * 100)}% power)` : '')],
      ['Crit Chance', Math.min(100, s.crit) + '%'],
      ['Crit Damage', Math.round(world.critMultiplier() * 100) + '%' + (s.crit > 100 ? ` (+${s.crit - 100}% from overflow)` : '')],
      ['Lifesteal', s.lifesteal > CONFIG.LIFESTEAL_CAP ? `${CONFIG.LIFESTEAL_CAP}% (${s.lifesteal}%, capped)` : s.lifesteal + '%'],
      ['Best wave', world.bestWave],
    ];
    if (p.rebirth && p.rebirth.n) {
      // (0.62.1) Ember, for the Deep: the Depth it is enough for
      const e = world.ember(p);
      const ok = DEPTH_IDS.filter((d) => e >= DEEP.depths[d].ember).pop();
      const next = DEPTH_IDS.find((d) => e < DEEP.depths[d].ember);
      const bits = [ok ? `up to Depth ${DEEP.depths[ok].numeral}` : '', next ? `Depth ${DEEP.depths[next].numeral} at ${DEEP.depths[next].ember}` : 'every Depth'].filter(Boolean);
      const head = p.headStart ? ` (${e - p.headStart} + ${p.headStart} from your other lives)` : '';
      rows.splice(1, 0, ['Ember', `${e}${head} · ${bits.join(' · ')}`]);
    }
    if (p.animus > 0) rows.splice(2, 0, ['Animus', p.animus >= 1 - 1e-6 ? '100%: never Mind-Locked' : `${Math.round(p.animus * 100)}%: no Mind-Lock where ${Math.round(p.animus * 100)}% or less is asked`]); // (0.63); (0.71.1)
    $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    const bag = $('bag');
    bag.innerHTML = '';
    let scrapTotal = 0;
    for (let i = 0; i < world.bagSize(); i++) {
      const item = p.bag[i] || null;
      const current = item ? p.equipped[item.slot] : null;
      const upgrade = item ? itemScore(item) > itemScore(current) : false;
      if (item && !upgrade && !keep.has(item.rarity) && !item.locked) scrapTotal += scrapValue(item);
      const el = itemCell(this.tooltip, item, { button: !!item, compareTo: current, upgrade });
      const offered = this.trade.offered ? this.trade.offered() : null;
      if (item && offered && offered.has(item.id)) el.classList.add('offered');
      if (item) {
        el.addEventListener('click', (ev) => {
          if (this.lockMode || ev.altKey) return this.send({ type: 'lockItem', index: i }); // (0.75.2)
          if (offered) return item.locked ? null : this.trade.toggle(item.id); // trading: a click puts it in (or takes it out of) your offer
          if ((ev.ctrlKey || ev.metaKey) && this.trade.party && this.trade.party()) return this.send({ type: 'dropItem', index: i });
          this.send({ type: ev.shiftKey ? 'discard' : 'equip', index: i });
        });
        el.addEventListener('contextmenu', (ev) => ev.preventDefault());
      }
      bag.appendChild(el);
    }
    $('bag-count').textContent = `${p.bag.length} / ${world.bagSize()}`;
    // The pouch (0.32): stackable things that do not take a bag slot.
    const pouch = $('pouch');
    if (pouch) {
      const have = MISC_IDS.filter((id) => (p.misc && p.misc[id]) > 0);
      pouch.innerHTML = `<span class="pouch-label">Pouch</span>` + (have.length
        ? have.map((id) => `<span class="pouch-item" data-misc="${id}" style="border-color:${MISC[id].color}"><b style="color:${MISC[id].color}">${p.misc[id]}×</b> ${MISC[id].name}</span>`).join('')
        : '<span class="pouch-empty">Empty. Unwishing Glass and other keepsakes go here, not in the bag.</span>');
      // the gear screen's own tooltip (it was the browser's plain white one), with where to find more
      for (const el of pouch.querySelectorAll('.pouch-item')) {
        const id = el.dataset.misc;
        el.addEventListener('mouseenter', () => this.tooltip.show(miscTooltip(id, p.misc[id]), el, MISC[id].color));
        el.addEventListener('mouseleave', () => this.tooltip.hide());
      }
    }
    // Immortal Fragments (0.33): enough of them craft an Immortal for the slot you choose.
    const craft = $('craft-row');
    if (craft) {
      const have = (p.misc && p.misc.fragment) || 0;
      craft.classList.toggle('hidden', !have && p.level < FRAGMENTS.craftLevel);
      const ready = have >= FRAGMENTS.craft && p.level >= FRAGMENTS.craftLevel && !world.trial;
      craft.innerHTML = `<span class="pouch-label">Craft an Immortal</span><span class="craft-note">${have} / ${FRAGMENTS.craft} fragments${p.level < FRAGMENTS.craftLevel ? ` · from level ${FRAGMENTS.craftLevel}` : ''}. Its special power fits your subclass.</span>`;
      for (const slot of SLOTS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = ready ? 'primary tiny' : 'ghost tiny';
        b.textContent = SLOT_NAMES[slot];
        b.disabled = !ready;
        b.addEventListener('click', () => this.send({ type: 'craftImmortal', slot }));
        craft.appendChild(b);
      }
    }
    const offeredIds = this.trade.offered ? this.trade.offered() : null;
    const ups = Object.keys(bestUpgrades(p.equipped, p.bag, world.cls, offeredIds || new Set())).length;
    const eqAll = $('btn-equip-all');
    eqAll.textContent = ups ? `Equip every upgrade (${ups})` : 'No upgrades to equip';
    eqAll.disabled = !ups || !!world.trial;
    const asel = $('auto-scrap'); // (0.75.3)
    if (asel) {
      asel.value = p.autoScrapAt == null ? '' : String(p.autoScrapAt);
      asel.disabled = !!world.trial;
      asel.style.color = p.autoScrapAt == null ? '' : RARITIES[p.autoScrapAt].color;
    }
    const lk = $('btn-lock-mode'); // (0.75.2)
    if (lk) {
      lk.classList.toggle('on', !!this.lockMode);
      lk.innerHTML = `${LOCK_SVG}${this.lockMode ? 'Done locking (click items to lock or unlock)' : `Lock items${p.bag.some((it) => it && it.locked) ? ` (${p.bag.filter((it) => it && it.locked).length} locked)` : ''}`}`;
      lk.disabled = !!world.trial;
    }
    $('bag').classList.toggle('lock-mode', !!this.lockMode);
    const btn = $('btn-scrap');
    btn.textContent = scrapTotal ? `Scrap everything that is not an upgrade (+${scrapTotal} scrap)` : 'Nothing to scrap';
    btn.title = keep.size ? `Keeps ${[...keep].sort().map((i) => RARITIES[i].name).join(', ')} items however they compare` : '';
    btn.disabled = !scrapTotal;
  }

  /**
   * (0.71) The Eternal panel: one row a slot, what this class has (worn or not), its level, and Feeding.
   * Hidden until the first piece or Essence.
   */
  renderEternal(world) {
    const p = world.player;
    const box = $('eternal-box');
    const owned = SLOTS.filter((s) => world.eternalAt && world.eternalAt(s));
    // (0.74) shown from level 100 (when Caelum is in reach), so it can be found before the first piece;
    // (0.74.1) in its own tab
    const shown = !world.trial && (owned.length || p.eternalEssence > 0 || p.level >= 100);
    if (!shown) this.tab = 'gear';
    $('tab-eternal').classList.toggle('hidden', !shown);
    $('tab-eternal').classList.toggle('glow', shown && (p.eternalEssence || 0) >= ETERNAL.forgeCost && owned.length < 5);
    for (const [id, tab] of [['tab-gear', 'gear'], ['tab-eternal', 'eternal']]) {
      $(id).classList.toggle('on', this.tab === tab);
      $(id).setAttribute('aria-selected', this.tab === tab ? 'true' : 'false');
    }
    $('inv-gear-body').classList.toggle('hidden', this.tab !== 'gear');
    $('inv-eternal-body').classList.toggle('hidden', this.tab !== 'eternal');
    if (!shown) return;
    $('eternal-ess').innerHTML = `${owned.length} of 5 &middot; <b>${(p.eternalEssence || 0).toFixed(1)}</b> Eternity Essence &middot; ${owned.length ? 'feed it, or forge a piece you lack' : 'from the Granted, in Caelum: forge a piece with it, or keep it to feed one'}`;
    const root = $('eternal');
    root.innerHTML = '';
    const immortals = p.bag.map((it, i) => [it, i]).filter(([it]) => it && it.rarity === 6);
    if (owned.length) {
      // (0.75) Auto-feed: off unless chosen. New Immortals (not set pieces, Heirlooms or upgrades) go to an Eternal.
      const auto = document.createElement('label');
      auto.className = 'et-auto setting-desc';
      const opts = [[null, 'Off'], ['low', 'The lowest-level piece'], ...SLOTS.filter((s) => world.eternalAt(s)).map((s) => [s, SLOT_NAMES[s]])];
      auto.innerHTML = `Auto-feed new Immortals to <select>${opts.map(([v, l]) => `<option value="${v || ''}"${(p.eternalAuto || null) === v ? ' selected' : ''}>${l}</option>`).join('')}</select> <small>(not set pieces, Heirlooms, or one that would be an upgrade for you; the ones in your gear box now are never touched)</small>`;
      auto.querySelector('select').addEventListener('change', (e) => this.send({ type: 'eternalAuto', to: e.target.value || null }));
      root.appendChild(auto);
      // (0.76) the Eternal form: with all five pieces worn the hero ascends (others see it too)
      const full = SLOTS.every((s) => p.equipped[s] && p.equipped[s].eternal);
      const form = document.createElement('label');
      form.className = 'et-auto setting-desc';
      form.innerHTML = `<input type="checkbox"${p.eformOff ? '' : ' checked'}> <b>Eternal form</b> <small>${full ? 'you wear all five pieces: your hero takes their ascended form, and everyone sees it' : `wear all five Eternal pieces to take your hero's ascended form (${SLOTS.filter((s) => p.equipped[s] && p.equipped[s].eternal).length}/5 worn)`}</small>`;
      form.querySelector('input').addEventListener('change', (e) => this.send({ type: 'eternalForm', on: e.target.checked }));
      root.appendChild(form);
    }
    for (const slot of SLOTS) {
      const it = world.eternalAt(slot);
      const row = document.createElement('div');
      row.className = 'eq-row et-row';
      const cell = itemCell(this.tooltip, it);
      if (!it) {
        cell.innerHTML = gearIcon(slot);
        cell.style.opacity = 0.25;
      }
      const text = document.createElement('div');
      const worn = it && p.equipped[slot] === it;
      const lv = it ? it.level || 1 : 0;
      const need = it && lv < ETERNAL.maxLevel ? ETERNAL.xpFor(lv) : 0;
      text.innerHTML = it
        ? `<div class="eq-slot">${SLOT_NAMES[slot]} &middot; level ${lv}/${ETERNAL.maxLevel} &middot; ${slotsOpen(it)} passive${slotsOpen(it) > 1 ? 's' : ''}${worn ? ' &middot; worn' : ''}</div><div class="eq-name eternal">${itemName(it)}</div><div class="et-xp"><i style="width:${need ? Math.round(((it.xp || 0) / need) * 100) : 100}%"></i></div><div class="et-passives">${(it.passives || []).map((ps) => `<div><b>${ETERNAL_PASSIVES[ps.key] ? ETERNAL_PASSIVES[ps.key].name : ps.key}</b> ${passiveText(ps, it, true)}</div>`).join('')}${nextSlotAt(it) ? `<div class="et-locked">Another passive at level ${nextSlotAt(it)}.</div>` : ''}</div>`
        : `<div class="eq-slot">${SLOT_NAMES[slot]}</div><div class="eq-name" style="color:var(--muted)">Not found yet: the Granted, in Caelum, or forge it (${ETERNAL.forgeCost} Essence)</div>`;
      row.append(cell, text);
      const btns = document.createElement('div');
      btns.className = 'eq-btns';
      const add = (label, title, cmd, off = false) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost tiny ench-btn';
        b.textContent = label;
        b.title = title;
        b.disabled = off;
        b.addEventListener('click', () => (typeof cmd === 'function' ? cmd() : this.send(cmd)));
        btns.appendChild(b);
      };
      if (!it) add(`Forge · ${ETERNAL.forgeCost}`, `Forge this piece from ${ETERNAL.forgeCost} Eternity Essence (you have ${(p.eternalEssence || 0).toFixed(1)})`, { type: 'forgeEternal', slot }, (p.eternalEssence || 0) < ETERNAL.forgeCost - 1e-9); // (0.74)
      if (it) {
        if (worn) add('Take off', 'Back here; the slot is left empty', { type: 'stowEternal', slot });
        else add('Wear', 'Put it on; what you wear there goes to the gear box', { type: 'wearEternal', slot });
        const full = xpToMax(it) <= 0;
        add(this.feedSlot === slot ? 'Close' : 'Feed', full ? 'At its last level' : 'Give it an Immortal from your gear box, or Eternity Essence', () => {
          this.feedSlot = this.feedSlot === slot ? null : slot;
          this.render(world);
        }, full);
      }
      row.appendChild(btns);
      root.appendChild(row);
      if (it && this.feedSlot === slot) {
        const fp = document.createElement('div');
        fp.className = 'ench-panel et-feed';
        const room = xpToMax(it);
        fp.innerHTML = `<div class="setting-desc">An Immortal gives ${ETERNAL.immortalXp} (+${ETERNAL.starXp} a star); one Essence ${ETERNAL.essenceXp}. ${Math.round(room)} more to its last level; anything past that comes back as Essence.</div>`;
        // (0.75) choose the Immortals first (click to pick, again to put back), then feed them with one button
        // that asks once more; nothing is eaten from a single click any more
        if (!this.feedPick || this.feedPick.slot !== slot) this.feedPick = { slot, ids: new Set(), armed: false };
        const pick = this.feedPick;
        for (const id of [...pick.ids]) if (!immortals.some(([f]) => String(f.id) === id)) pick.ids.delete(id);
        const list = document.createElement('div');
        list.className = 'et-food';
        for (const [food] of immortals) {
          const id = String(food.id);
          const c = itemCell(this.tooltip, food, { button: true });
          if (food.locked) {
            // (0.75.2) locked: shown, never chosen
            c.disabled = true;
            c.title = 'Locked: unlock it in the gear box (Alt+click) to feed it';
            list.appendChild(c);
            continue;
          }
          c.classList.toggle('picked', pick.ids.has(id));
          c.title = `${pick.ids.has(id) ? 'Chosen' : 'Choose it'} (+${feedValue(food)})`;
          c.addEventListener('click', () => {
            if (pick.ids.has(id)) pick.ids.delete(id);
            else pick.ids.add(id);
            pick.armed = false;
            this.render(world);
          });
          list.appendChild(c);
        }
        if (!immortals.length) list.innerHTML = '<span class="setting-desc">No Immortals in your gear box.</span>';
        fp.appendChild(list);
        if (immortals.length) {
          const bar = document.createElement('div');
          bar.className = 'et-feed-bar';
          const all = document.createElement('button');
          all.type = 'button';
          all.className = 'ghost tiny';
          const free = immortals.filter(([f]) => !f.locked);
          const every = free.length > 0 && pick.ids.size === free.length;
          all.textContent = every ? 'Choose none' : 'Choose all';
          all.addEventListener('click', () => {
            pick.ids = every ? new Set() : new Set(free.map(([f]) => String(f.id)));
            pick.armed = false;
            this.render(world);
          });
          let xp = 0;
          for (const [f] of immortals) if (pick.ids.has(String(f.id))) xp += feedValue(f);
          const copy = { level: it.level || 1, xp: it.xp || 0, passives: (it.passives || []).slice() };
          feedPreview(copy, Math.min(xp, room), () => 0);
          const go = document.createElement('button');
          go.type = 'button';
          go.className = pick.armed ? 'primary tiny danger' : 'primary tiny';
          go.disabled = !pick.ids.size;
          go.textContent = !pick.ids.size ? 'Choose Immortals to feed' : pick.armed ? `Click again: feed ${pick.ids.size} Immortal${pick.ids.size > 1 ? 's' : ''} (they are gone for good)` : `Feed ${pick.ids.size} chosen · +${xp.toLocaleString()} exp · level ${it.level || 1} → ${copy.level}${xp > room ? ' (the rest stay in your box)' : ''}`;
          go.addEventListener('click', () => {
            if (!pick.armed) {
              pick.armed = true;
              return this.render(world);
            }
            this.send({ type: 'feedEternal', slot, ids: [...pick.ids] });
            this.feedPick = null;
          });
          bar.append(all, go);
          fp.appendChild(bar);
        }
        const eb = document.createElement('button');
        eb.type = 'button';
        eb.className = 'primary tiny';
        const can = Math.min(p.eternalEssence || 0, room / ETERNAL.essenceXp);
        eb.textContent = can > 0 ? `Feed ${can.toFixed(1)} Essence` : 'No Essence';
        eb.disabled = !(can > 0);
        eb.addEventListener('click', () => this.send({ type: 'feedEternal', slot }));
        fp.appendChild(eb);
        root.appendChild(fp);
      }
    }
  }

  /** (0.62.1) The wallet in the gear window's head: big numbers with icons, and what each is for on hover. */
  wallet(world) {
    const p = world.player;
    const box = $('inv-res');
    const have = { gold: p.gold || 0, tickets: p.tickets || 0, scrap: p.scrap || 0, dust: p.dust || 0, keys: p.keys || 0, essence: (p.rebirth && p.rebirth.essence) || 0 };
    box.innerHTML = '';
    box.className = 'drawer-note wallet';
    for (const w of WALLET) {
      if (w.rebirth && !(p.rebirth && p.rebirth.n)) continue;
      const el = document.createElement('span');
      el.className = 'wallet-chip';
      el.style.setProperty('--c', w.color);
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${w.icon}</svg><b>${have[w.key].toLocaleString()}</b><span class="wallet-name">${w.name}</span>`;
      el.setAttribute('aria-label', `${w.name}: ${have[w.key]}`);
      el.addEventListener('mouseenter', () => this.tooltip.show(walletTooltip(w, have[w.key]), el, w.color));
      el.addEventListener('mouseleave', () => this.tooltip.hide());
      box.appendChild(el);
    }
  }

  /**
   * Rerolling (0.43): every line of one equipped item, with how good its roll is and a Reroll button
   * (gold and scrap, the same price every time). Reforging: turn one bonus line into a stat you choose.
   */
  enchantPanel(world, slot, item) {
    const p = world.player;
    const box = document.createElement('div');
    box.className = 'ench-panel';
    const rc = rerollCost(item);
    const canRoll = p.gold >= rc.gold && p.scrap >= rc.scrap;
    const fc = enchantCost(item);
    const canForge = p.gold >= fc.gold && (p.dust || 0) >= fc.dust;
    const open = enchantable(item);
    const choices = reforgeChoices(item);
    box.innerHTML = `<p class="setting-desc"><b>Reroll</b> a line for a fresh number of the same stat, as often as you like: <b>${rc.gold.toLocaleString()} gold + ${rc.scrap.toLocaleString()} scrap</b> a time. The mark beside each line shows how good its roll is, in the rarity colours, from Common up to Immortal for the very best. ${this.reforgeKey || item.eternal ? '' : `<b>Reforge</b> turns a bonus line into a stat you choose: ${fc.gold.toLocaleString()} gold + ${fc.dust} Wishdust; once reforged, only that line can be reforged again, and each time costs more.`}</p>`;
    // (0.62) the pity count, and a guard against rerolling an Immortal-tier line by accident
    const guard = guardImmortal();
    const left = REROLL_PITY - (item.pity || 0);
    const pity = document.createElement('div');
    pity.className = 'ench-pity';
    const topName = item.eternal ? 'Eternal' : 'Immortal'; // (0.75.3)
    pity.innerHTML = `<span>${topName}-tier line guaranteed within <b>${String(left).padStart(2, '\u2007')}</b> rerolls on this item</span><label><input type="checkbox"${guard ? ' checked' : ''}> Lock ${topName}-tier lines (no rerolling them)</label>`;
    pity.querySelector('input').addEventListener('change', (e) => {
      setGuardImmortal(e.target.checked);
      this.armed = null;
      this.render(world);
    });
    box.appendChild(pity);
    const stats = itemStats(item);
    Object.keys(item.stats).forEach((k) => {
      const row = document.createElement('div');
      row.className = 'ench-row';
      const isImm = lineTier(item, k) >= topTier(item); // (0.75.3) on Eternal gear the lock is for Eternal-tier lines
      // (0.65) A guarded Immortal-tier line is locked outright: its buttons go grey the moment it lands,
      // so spam-clicking Reroll can never take it away (the old 'Sure?' could be clicked through).
      const locked = guard && isImm;
      const reroll = (msg) => {
        if (!locked) this.send(msg);
      };
      const q = rollQuality(item, k);
      const t = RARITIES[lineTier(item, k)];
      const { lo, hi } = statRange(item, k);
      row.innerHTML = `<span class="ench-stat">${rollPip(item, k)}${formatStat(k, stats[k])}${item.enchantKey === k ? ' ✦' : ''}${isMainStat(item, k) ? ' <small>(main)</small>' : ''}</span><span class="ench-q" style="color:${t.color}" title="Rolls between ${lo} and ${hi} before upgrades">${t.name} · ${item.stats[k]} of ${lo}–${hi}</span>`;
      const btns = document.createElement('span');
      btns.className = 'ench-btns';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost tiny';
      b.textContent = locked ? 'Locked' : 'Reroll';
      b.disabled = locked || !canRoll || q >= 1;
      b.title = q >= 1 ? 'Already the best roll this line can have' : locked ? `${topName === 'Eternal' ? 'An Eternal' : 'An Immortal'}-tier line: untick the lock above to reroll it` : `A fresh roll between ${lo} and ${hi}`;
      b.addEventListener('click', () => reroll({ type: 'enchant', slot, key: k }));
      btns.appendChild(b);
      if (p.rebirth && p.rebirth.n) {
        // (0.62.1) always there once reborn (greyed out when short), so the buttons never shift
        // Echoes (0.53): the same reroll for Echo Essence
        const eb = document.createElement('button');
        eb.type = 'button';
        eb.className = 'ghost tiny echo-btn';
        eb.textContent = `${ECHOES.reroll} Ess.`;
        eb.title = `Reroll for ${ECHOES.reroll} Echo Essence instead of gold and scrap`;
        eb.disabled = locked || p.rebirth.essence < ECHOES.reroll || q >= 1;
        eb.addEventListener('click', () => reroll({ type: 'enchant', slot, key: k, essence: true }));
        btns.appendChild(eb);
      }
      if (!isMainStat(item, k) && open.includes(k) && choices.length) {
        const f = document.createElement('button');
        f.type = 'button';
        f.className = 'ghost tiny forge';
        f.textContent = this.reforgeKey === k ? 'Cancel' : 'Reforge';
        f.title = 'Turn this line into a stat you choose, for Wishdust';
        f.addEventListener('click', () => {
          this.reforgeKey = this.reforgeKey === k ? null : k;
          this.render(world);
        });
        btns.appendChild(f);
      }
      row.appendChild(btns);
      box.appendChild(row);
      if (this.reforgeKey === k && open.includes(k)) {
        const pick = document.createElement('div');
        pick.className = 'ench-pick';
        pick.innerHTML = `<span>Make ${STATS[k].label} into (${fc.gold.toLocaleString()} gold + ${fc.dust} Wishdust):</span>`;
        for (const to of choices) {
          const c = document.createElement('button');
          c.type = 'button';
          c.className = 'ghost tiny';
          c.textContent = STATS[to].label;
          c.disabled = !canForge;
          c.addEventListener('click', () => {
            this.reforgeKey = null;
            this.send({ type: 'reforge', slot, key: k, to });
          });
          pick.appendChild(c);
        }
        box.appendChild(pick);
      }
    });
    return box;
  }

  /** How many bag items are better than what is equipped (shown on the Gear button). */
  static upgradeCount(world) {
    const p = world.player;
    return p.bag.filter((it) => itemScore(it) > itemScore(p.equipped[it.slot])).length;
  }
}
