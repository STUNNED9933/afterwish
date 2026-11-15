// The gear drawer: equipped items, stats, and the bag.
import { CONFIG } from '../config.js';
import { itemTypeName, SLOTS, SLOT_NAMES, STAT_KEYS, STATS, RARITIES, EFFECTS, effectFor, itemScore, itemStats, itemName, scrapValue, formatStat, SETS, setCounts, enchantable, enchantCost, dustValue } from '../sim/items.js';
import { SPECS } from '../sim/talents.js';
import { GLOWS, GLOW_IDS } from '../sim/cosmetics.js';
import { svg, gearIcon, gearClassNow } from './hud.js';
import { steadyRatings, ratingsWith, signed } from '../power.js';

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
  keys.forEach((k, i) => {
    const ench = item.enchantKey === k ? ' <span class="tt-ench" title="Enchanted: only this line can be enchanted again">✦</span>' : '';
    html += `<div class="tt-stat${i === 0 ? ' main' : ''}">${formatStat(k, stats[k])}${ench}</div>`;
  });
  if (item.set && SETS[item.set]) {
    // A set piece (0.29): its set's bonuses, lit when enough pieces are worn.
    const set = SETS[item.set];
    const n = setsWorn[item.set] || 0;
    html += `<div class="tt-set"><b>${set.name} set</b> &middot; ${SPECS[set.spec] ? SPECS[set.spec].name : ''} &middot; ${n} of 4 worn<div class="${n >= 2 ? 'on' : ''}">(2) ${set.two.desc}</div><div class="${n >= 4 ? 'on' : ''}">(4) ${set.four.desc}</div></div>`;
  }
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
  const dust = dustValue(item);
  html += `<div class="tt-desc">Scraps for ${scrapValue(item)} scrap${dust ? ` and ${dust} Wishdust` : ''}</div>`;
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
  constructor(tooltip, send, keep, trade = {}) {
    this.trade = trade; // { offered(): Set of item ids | null, toggle(id), party(): bool } (0.25)
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
    $('inv-res').textContent = `Gold ${p.gold} · Scrap ${p.scrap} · Wishdust ${p.dust || 0} · Warden keys ${p.keys}`;
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
      text.innerHTML = `<div class="eq-slot">${SLOT_NAMES[slot]}${item ? ' · gear score ' + Math.round(itemScore(item)) : ''}${item && item.set ? ` · <span class="set-tag">${SETS[item.set].name} ${setsWorn[item.set] || 0}/4</span>` : ''}</div><div class="eq-name" style="color:${item ? RARITIES[item.rarity].color : 'var(--muted)'}">${item ? itemName(item) : 'Empty'}</div>`;
      row.append(cell, text);
      const btns = document.createElement('div');
      btns.className = 'eq-btns';
      if (item && item.rarity === RARITIES.length - 1 && item.effect && !world.trial && (item.stars || 0) < 5) {
        // Ascending (0.31): a duplicate Immortal in the bag can be fed into this one.
        const dupAt = p.bag.findIndex((b) => b.rarity === item.rarity && b.effect === item.effect);
        if (dupAt >= 0) {
          const a = document.createElement('button');
          a.type = 'button';
          a.className = 'ghost tiny ench-btn ascend';
          a.textContent = `Ascend ★${(item.stars || 0) + 1}`;
          a.title = `Feed the duplicate ${itemName(p.bag[dupAt])} in your bag into this one: +10% to every stat per star, up to 5 stars. The duplicate is used up.`;
          a.addEventListener('click', () => this.send({ type: 'ascend', slot, index: dupAt }));
          btns.appendChild(a);
        }
      }
      if (item && Object.keys(item.stats).length > 1 && !world.trial) {
        // Enchanting (0.29): reroll one bonus stat, for gold and Wishdust.
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost tiny ench-btn';
        b.textContent = this.enchantSlot === slot ? 'Close' : 'Enchant';
        b.title = 'Turn one bonus stat into a different one, for gold and Wishdust';
        b.addEventListener('click', () => {
          this.enchantSlot = this.enchantSlot === slot ? null : slot;
          this.render(world);
        });
        btns.appendChild(b);
      }
      if (btns.children.length) row.appendChild(btns);
      eq.appendChild(row);
      if (item && this.enchantSlot === slot) eq.appendChild(this.enchantPanel(world, slot, item));
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
      const offered = this.trade.offered ? this.trade.offered() : null;
      if (item && offered && offered.has(item.id)) el.classList.add('offered');
      if (item) {
        el.addEventListener('click', (ev) => {
          if (offered) return this.trade.toggle(item.id); // trading: a click puts it in (or takes it out of) your offer
          if ((ev.ctrlKey || ev.metaKey) && this.trade.party && this.trade.party()) return this.send({ type: 'dropItem', index: i });
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

  /** Enchanting (0.29): the bonus stats of one equipped item, each with a reroll button. */
  enchantPanel(world, slot, item) {
    const p = world.player;
    const box = document.createElement('div');
    box.className = 'ench-panel';
    const cost = enchantCost(item);
    const can = p.gold >= cost.gold && (p.dust || 0) >= cost.dust;
    const open = enchantable(item);
    box.innerHTML = `<p class="setting-desc">Turn one bonus stat into a different one, at a fresh roll. Once an item is enchanted, only that line can be enchanted again, and each time costs more. Cost: <b>${cost.gold} gold + ${cost.dust} Wishdust</b> (you have ${p.gold} and ${p.dust || 0}). Wishdust comes from Storied enemies, the Wishthief, Remnants and scrapping Mythic or better.</p>`;
    const stats = itemStats(item);
    Object.keys(item.stats).slice(1).forEach((k) => {
      const row = document.createElement('div');
      row.className = 'ench-row';
      const ok = open.includes(k);
      row.innerHTML = `<span>${formatStat(k, stats[k])}${item.enchantKey === k ? ' ✦' : ''}</span>`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost tiny';
      b.textContent = ok ? 'Reroll' : 'Locked';
      b.disabled = !ok || !can;
      b.title = ok ? `Becomes one of: ${['as', 'crit', 'lifesteal', 'haste', 'armor', 'hp'].filter((x) => !(x in item.stats)).map((x) => STATS[x].label).join(', ')}` : 'Only the enchanted line can be enchanted again';
      b.addEventListener('click', () => this.send({ type: 'enchant', slot, key: k }));
      row.appendChild(b);
      box.appendChild(row);
    });
    return box;
  }

  /** How many bag items are better than what is equipped (shown on the Gear button). */
  static upgradeCount(world) {
    const p = world.player;
    return p.bag.filter((it) => itemScore(it) > itemScore(p.equipped[it.slot])).length;
  }
}
