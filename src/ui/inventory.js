// The gear drawer: equipped items, stats, and the bag.
import { CONFIG } from '../config.js';
import { itemTypeName, SLOTS, SLOT_NAMES, STAT_KEYS, RARITIES, EFFECTS, itemScore, itemStats, itemName, scrapValue, formatStat } from '../sim/items.js';
import { svg } from './hud.js';

const $ = (id) => document.getElementById(id);

/** Tooltip for an item. `compareTo` adds the "if you equip this" section. */
export function itemTooltip(item, compareTo) {
  const rarity = RARITIES[item.rarity];
  const stats = itemStats(item);
  const keys = Object.keys(stats);
  let html = `<div class="tt-name">${itemName(item)}</div><div class="tt-meta">${rarity.name} ${itemTypeName(item)} &middot; item level ${item.ilvl} &middot; power ${Math.round(itemScore(item))}</div>`;
  keys.forEach((k, i) => {
    html += `<div class="tt-stat${i === 0 ? ' main' : ''}">${formatStat(k, stats[k])}</div>`;
  });
  if (item.effect && EFFECTS[item.effect]) html += `<div class="tt-effect"><b>${EFFECTS[item.effect].name}</b> ${EFFECTS[item.effect].desc}</div>`;
  if (compareTo && compareTo !== item) {
    const other = itemStats(compareTo);
    let diff = '';
    for (const k of STAT_KEYS) {
      const d = (stats[k] || 0) - (other[k] || 0);
      if (d !== 0) diff += `<div class="${d > 0 ? 'plus' : 'minus'}">${formatStat(k, d)}</div>`;
    }
    if (compareTo.effect && compareTo.effect !== item.effect) diff += `<div class="minus">Loses ${EFFECTS[compareTo.effect].name}</div>`;
    const dp = Math.round(itemScore(item) - itemScore(compareTo));
    html += `<div class="tt-diff"><b>Compared with what you are wearing</b>${diff || '<div>No change</div>'}<div class="${dp >= 0 ? 'plus' : 'minus'}">${dp >= 0 ? '+' : ''}${dp} power overall</div></div>`;
  }
  html += `<div class="tt-desc">Scraps for ${scrapValue(item)} scrap</div>`;
  return html;
}

/** A square item tile. */
export function itemCell(tooltip, item, { button = false, compareTo = null, upgrade = false } = {}) {
  const el = document.createElement(button ? 'button' : 'div');
  if (button) el.type = 'button';
  el.className = 'cell' + (item ? ' filled' : '') + (item && RARITIES[item.rarity].effect ? ' immortal' : '');
  if (item) {
    const color = RARITIES[item.rarity].color;
    el.style.setProperty('--rarity', color);
    el.innerHTML = `${svg(item.slot)}<span class="lvl">${item.ilvl}${item.plus ? `<small>+${item.plus}</small>` : ''}</span>${upgrade ? '<span class="arrow">▲</span>' : ''}`;
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
  constructor(tooltip, send) {
    this.tooltip = tooltip;
    this.send = send;
    $('btn-scrap').addEventListener('click', () => this.send({ type: 'scrap' }));
  }

  /** Rebuild the whole drawer from the current world state. */
  render(world) {
    const p = world.player;
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
        cell.innerHTML = svg(slot);
        cell.style.opacity = 0.35;
      }
      const text = document.createElement('div');
      text.innerHTML = `<div class="eq-slot">${SLOT_NAMES[slot]}${item ? ' · power ' + Math.round(itemScore(item)) : ''}</div><div class="eq-name" style="color:${item ? RARITIES[item.rarity].color : 'var(--muted)'}">${item ? itemName(item) : 'Empty'}</div>`;
      row.append(cell, text);
      eq.appendChild(row);
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
      ['Ability Haste', s.haste],
      ['Crit Chance', Math.min(100, s.crit) + '%'],
      ['Crit Damage', Math.round(world.critMultiplier() * 100) + '%' + (s.crit > 100 ? ` (+${s.crit - 100}% from overflow)` : '')],
      ['Lifesteal', s.lifesteal + '%'],
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
      if (item && !upgrade) scrapTotal += scrapValue(item);
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
    btn.disabled = !scrapTotal;
  }

  /** How many bag items are better than what is equipped (shown on the Gear button). */
  static upgradeCount(world) {
    const p = world.player;
    return p.bag.filter((it) => itemScore(it) > itemScore(p.equipped[it.slot])).length;
  }
}
