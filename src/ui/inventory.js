// The gear drawer: equipped items, stats, and the bag.
import { CONFIG } from '../config.js';
import { itemTypeName, SLOTS, SLOT_NAMES, STAT_KEYS, RARITIES, EFFECTS, effectFor, itemScore, itemStats, itemName, scrapValue, formatStat } from '../sim/items.js';
import { svg, gearIcon, gearClassNow } from './hud.js';
import { steadyRatings, ratingsWith, signed } from '../power.js';

// Set while the gear drawer is open: Combat Power if an item were worn (for its tooltip).
let powerProbe = null;

const $ = (id) => document.getElementById(id);

/** Tooltip for an item. `compareTo` adds the "if you equip this" section. */
export function itemTooltip(item, compareTo) {
  const rarity = RARITIES[item.rarity];
  const stats = itemStats(item);
  const keys = Object.keys(stats);
  let html = `<div class="tt-name">${itemName(item)}</div><div class="tt-meta">${rarity.name} ${itemTypeName(item)} &middot; item level ${item.ilvl} &middot; gear score ${Math.round(itemScore(item))}</div>`;
  keys.forEach((k, i) => {
    html += `<div class="tt-stat${i === 0 ? ' main' : ''}">${formatStat(k, stats[k])}</div>`;
  });
  if (item.effect && EFFECTS[item.effect]) {
    const fx = effectFor(item.effect, item.cls || gearClassNow());
    html += `<div class="tt-effect"><b>${fx.name}</b> ${fx.desc}</div>`;
  }
  if (compareTo && compareTo !== item) {
    const other = itemStats(compareTo);
    let diff = '';
    for (const k of STAT_KEYS) {
      const d = (stats[k] || 0) - (other[k] || 0);
      if (d !== 0) diff += `<div class="${d > 0 ? 'plus' : 'minus'}">${formatStat(k, d)}</div>`;
    }
    if (compareTo.effect && compareTo.effect !== item.effect) diff += `<div class="minus">Loses ${effectFor(compareTo.effect, compareTo.cls || gearClassNow()).name}</div>`;
    const dp = Math.round(itemScore(item) - itemScore(compareTo));
    html += `<div class="tt-diff"><b>Compared with what you are wearing</b>${diff || '<div>No change</div>'}<div class="${dp >= 0 ? 'plus' : 'minus'}">${dp >= 0 ? '+' : ''}${dp} gear score</div>${cpLine(item)}</div>`;
  } else if (!compareTo && powerProbe && powerProbe.empty(item)) {
    html += `<div class="tt-diff">${cpLine(item)}</div>`;
  }
  html += `<div class="tt-desc">Scraps for ${scrapValue(item)} scrap</div>`;
  return html;
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
export function itemCell(tooltip, item, { button = false, compareTo = null, upgrade = false } = {}) {
  const el = document.createElement(button ? 'button' : 'div');
  if (button) el.type = 'button';
  el.className = 'cell' + (item ? ' filled' : '') + (item && RARITIES[item.rarity].effect ? ' immortal' : '');
  if (item) {
    const color = RARITIES[item.rarity].color;
    el.style.setProperty('--rarity', color);
    el.innerHTML = `${gearIcon(item)}<span class="lvl">${item.ilvl}${item.plus ? `<small>+${item.plus}</small>` : ''}</span>${upgrade ? '<span class="arrow">▲</span>' : ''}`;
    el.addEventListener('mouseenter', () => tooltip.show(itemTooltip(item, compareTo), el, color));
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
  constructor(tooltip, send, keep) {
    this.tooltip = tooltip;
    this.send = send;
    this.keep = keep || { get: () => [], set: () => {} };
    $('btn-scrap').addEventListener('click', () => this.send({ type: 'scrap', keep: this.keep.get() }));
    // One toggle per rarity from Rare up: kept items stay in the bag even when they are worse.
    const root = $('keep-rarities');
    RARITIES.forEach((r, i) => {
      if (i < 2) return;
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
    $('inv-res').textContent = `Gold ${p.gold} · Scrap ${p.scrap} · Warden keys ${p.keys}`;

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
      text.innerHTML = `<div class="eq-slot">${SLOT_NAMES[slot]}${item ? ' · gear score ' + Math.round(itemScore(item)) : ''}</div><div class="eq-name" style="color:${item ? RARITIES[item.rarity].color : 'var(--muted)'}">${item ? itemName(item) : 'Empty'}</div>`;
      row.append(cell, text);
      eq.appendChild(row);
    }

    // Combat Power, worked out once per render; item tooltips compare against it.
    const now = steadyRatings(world);
    powerProbe = { now, with: (item) => (world.player === p ? ratingsWith(world, item) : null), empty: (item) => !p.equipped[item.slot] };
    $('power-card').innerHTML = `<div class="cp">${now.cp.toLocaleString()}<small>Combat Power</small></div><div class="sub">Might <b>${now.might.toLocaleString()}</b> · Resolve <b>${now.resolve.toLocaleString()}</b></div>`;

    const s = p.stats;
    const reduction = Math.round((1 - 100 / (100 + s.armor)) * 100);
    const rows = [
      ['Level', p.level],
      ['Health', s.maxHp],
      [world.cls === 'mage' ? 'Spell Power' : 'Attack Damage', s.ad],
      ['Armor', `${s.armor} (${reduction}% less damage)`],
      ['Attack Speed', s.as.toFixed(2) + ' / s'],
      ['Move Speed', s.ms.toFixed(1)],
      ['Ability Haste', s.haste],
      ['Crit Chance', Math.min(100, s.crit) + '%'],
      ['Crit Damage', Math.round(world.critMultiplier() * 100) + '%' + (s.crit > 100 ? ` (+${s.crit - 100}% from overflow)` : '')],
      ['Lifesteal', s.lifesteal > CONFIG.LIFESTEAL_CAP ? `${CONFIG.LIFESTEAL_CAP}% (${s.lifesteal}%, capped)` : s.lifesteal + '%'],
      ['Best wave', world.bestWave],
    ];
    $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    const bag = $('bag');
    bag.innerHTML = '';
    let scrapTotal = 0;
    for (let i = 0; i < CONFIG.BAG_SIZE; i++) {
      const item = p.bag[i] || null;
      const current = item ? p.equipped[item.slot] : null;
      const upgrade = item ? itemScore(item) > itemScore(current) : false;
      if (item && !upgrade && !keep.has(item.rarity)) scrapTotal += scrapValue(item);
      const el = itemCell(this.tooltip, item, { button: !!item, compareTo: current, upgrade });
      if (item) {
        el.addEventListener('click', (ev) => {
          this.send({ type: ev.shiftKey ? 'discard' : 'equip', index: i });
        });
        el.addEventListener('contextmenu', (ev) => ev.preventDefault());
      }
      bag.appendChild(el);
    }
    $('bag-count').textContent = `${p.bag.length} / ${CONFIG.BAG_SIZE}`;
    const btn = $('btn-scrap');
    btn.textContent = scrapTotal ? `Scrap everything that is not an upgrade (+${scrapTotal} scrap)` : 'Nothing to scrap';
    btn.title = keep.size ? `Keeps ${[...keep].sort().map((i) => RARITIES[i].name).join(', ')} items however they compare` : '';
    btn.disabled = !scrapTotal;
  }

  /** How many bag items are better than what is equipped (shown on the Gear button). */
  static upgradeCount(world) {
    const p = world.player;
    return p.bag.filter((it) => itemScore(it) > itemScore(p.equipped[it.slot])).length;
  }
}
