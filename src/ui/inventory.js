// The gear drawer: equipped items, stats, and the bag.
import { CONFIG } from '../config.js';
import { ECHOES } from '../sim/rebirth.js';
import { itemTypeName, SLOTS, SLOT_NAMES, STAT_KEYS, STATS, RARITIES, EFFECTS, effectFor, itemScore, itemStats, itemName, scrapValue, formatStat, SETS, setCounts, enchantable, enchantCost, dustValue, MISC, MISC_IDS, rerollCost, reforgeChoices, rollQuality, rollTier, statRange, isMainStat } from '../sim/items.js';
import { SPECS } from '../sim/talents.js';
import { GLOWS, GLOW_IDS } from '../sim/cosmetics.js';
import { FRAGMENTS, SIGIL, GLASS, BOUNTY, MERCHANT } from '../sim/surprises.js';
import { svg, gearIcon, gearClassNow, gearSpecNow } from './hud.js';
import { steadyRatings, ratingsWith, signed } from '../power.js';
import { itemLore } from './lore.js';

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
    const ench = item.enchantKey === k ? ' <span class="tt-ench" title="Reforged: only this line can be reforged again">✦</span>' : '';
    html += `<div class="tt-stat${i === 0 ? ' main' : ''}">${rollPip(item, k)}${formatStat(k, stats[k])}${ench}</div>`;
  });
  if (item.set && SETS[item.set]) {
    // A set piece (0.29): its set's bonuses, lit when enough pieces are worn.
    const set = SETS[item.set];
    const n = setsWorn[item.set] || 0;
    html += `<div class="tt-set"><b>${set.name} set</b> &middot; ${SPECS[set.spec] ? SPECS[set.spec].name : ''} &middot; ${n} of 4 worn<div class="${n >= 2 ? 'on' : ''}">(2) ${set.two.desc}</div><div class="${n >= 4 ? 'on' : ''}">(4) ${set.four.desc}</div></div>`;
  }
  if (item.effect && EFFECTS[item.effect]) {
    const fx = effectFor(item.effect, item.cls || gearClassNow(), gearSpecNow());
    const as = fx.spec && SPECS[fx.spec] ? `<div class="tt-as">As a ${SPECS[fx.spec].name}. An Immortal's effect follows the subclass you play.</div>` : !EFFECTS[item.effect].unique && !gearSpecNow() ? '<div class="tt-as">From level 15 its effect becomes your subclass\'s own.</div>' : '';
    html += `<div class="tt-effect"><b>${fx.name}</b> ${fx.desc}${as}</div>`;
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
  html += `<div class="tt-desc">Scraps for ${scrapValue(item)} scrap${dust ? ` and ${dust} Wishdust` : ''}</div>`;
  return html;
}

/** A small mark in the colour of how well a line rolled (0.43): Common for a low roll, Immortal for the best. */
export function rollPip(item, key) {
  const q = rollQuality(item, key);
  const t = RARITIES[rollTier(q)];
  const top = rollTier(q) === RARITIES.length - 1; // an Immortal roll shimmers like Immortal gear (0.43.1)
  return `<span class="roll-pip${top ? ' imm' : ''}" style="--tier:${t.color}" title="${t.name} roll: ${Math.round(q * 100)}% of the way to the best this line can be"></span>`;
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
/** Where each pouch keepsake comes from (worked out from the game's own numbers). */
function miscSources(id) {
  const glassAtMerchant = (MERCHANT && MERCHANT.stock || []).find((s) => s.kind === 'glass');
  if (id === 'glass')
    return [
      glassAtMerchant ? `The travelling merchant, for ${glassAtMerchant.tickets} shards (on ${pct(glassAtMerchant.chance)} of his visits)` : 'The travelling merchant, sometimes',
      `Remnants (${pct(GLASS.remnant)})`,
      `Wishthieves (${pct(GLASS.thief)})`,
      `Storied enemies (${pct(GLASS.storied)})`,
      `Bounties in Haven (${pct(BOUNTY.glass)} with the reward)`,
    ];
  if (id === 'fragment')
    return [
      `Bounties in Haven (${BOUNTY.fragments[0]} to ${BOUNTY.fragments[1]})`,
      `Remnants (${FRAGMENTS.remnant})`,
      `World events (${FRAGMENTS.event})`,
      `Storied enemies (${FRAGMENTS.storied})`,
      `Wishthieves (${FRAGMENTS.thief})`,
      `Elites on world tier IV and up (${pct(FRAGMENTS.elite)} chance of 1)`,
      'Come Home, once on each world tier every life (20 to 80)',
    ];
  if (id === 'sigil') return [`World events (${pct(SIGIL.event)})`, `Storied enemies (${pct(SIGIL.storied)})`, 'Some bounties in Haven'];
  return [];
}
function miscTooltip(id, n) {
  const m = MISC[id];
  const use = id === 'fragment' ? `${m.desc} ${FRAGMENTS.craft} make one.` : m.desc;
  return `<div class="tt-name">${m.name}</div><div class="tt-meta">Keepsake · ${n} in the pouch</div><div class="tt-desc">${use}</div>` +
    `<div class="tt-from"><b>Where to find more</b><ul>${miscSources(id).map((s) => `<li>${s}</li>`).join('')}</ul></div>`;
}

export function itemCell(tooltip, item, { button = false, compareTo = null, upgrade = false } = {}) {
  const el = document.createElement(button ? 'button' : 'div');
  if (button) el.type = 'button';
  el.className = 'cell' + (item ? ' filled' : '') + (item && RARITIES[item.rarity].effect ? ' immortal' : '');
  if (item) {
    const color = RARITIES[item.rarity].color;
    el.style.setProperty('--rarity', color);
    const imm = !!RARITIES[item.rarity].effect;
    el.innerHTML = `${gearIcon(item)}<span class="lvl">${item.ilvl}${item.plus ? `<small>+${item.plus}</small>` : ''}</span>${upgrade ? '<span class="arrow">▲</span>' : ''}${imm ? '<span class="imm-star" aria-hidden="true">✦</span>' : ''}`;
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
      text.innerHTML = `<div class="eq-slot">${SLOT_NAMES[slot]}${item ? ' · gear score ' + Math.round(itemScore(item)) : ''}${item && item.set ? ` · <span class="set-tag">${SETS[item.set].name} ${setsWorn[item.set] || 0}/4</span>` : ''}</div><div class="eq-name${item && RARITIES[item.rarity].effect ? ' immortal' : ''}" style="color:${item ? RARITIES[item.rarity].color : 'var(--muted)'}">${item ? itemName(item) : 'Empty'}</div>`;
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
      const mem = p.rebirth && p.rebirth.memories && p.rebirth.memories[slot];
      if (item && mem && !world.trial) {
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
      if (item && !world.trial) {
        // Rerolling and reforging (0.43; enchanting since 0.29)
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
    const rb = p.rebirth;
    if (rb && !world.trial && (rb.essence > 0 || Object.keys(rb.memories || {}).length)) {
      // Echoes (0.53): the pieces the star remembers, to recall at your level
      const box = document.createElement('div');
      box.className = 'echoes';
      box.innerHTML = `<div class="eq-slot">Echoes · <b>${rb.essence}</b> Echo Essence</div><p class="setting-desc">The best piece you wore in each slot, in past lives. Recall one (once a life) and it is made again at your level: its rarity, effect, how good its rolls were and its enchant. +levels and stars start again, but Essence brings them back to what you had.</p>`;
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
    $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    const bag = $('bag');
    bag.innerHTML = '';
    let scrapTotal = 0;
    for (let i = 0; i < world.bagSize(); i++) {
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
    const btn = $('btn-scrap');
    btn.textContent = scrapTotal ? `Scrap everything that is not an upgrade (+${scrapTotal} scrap)` : 'Nothing to scrap';
    btn.title = keep.size ? `Keeps ${[...keep].sort().map((i) => RARITIES[i].name).join(', ')} items however they compare` : '';
    btn.disabled = !scrapTotal;
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
    box.innerHTML = `<p class="setting-desc"><b>Reroll</b> a line for a fresh number of the same stat, as often as you like: <b>${rc.gold.toLocaleString()} gold + ${rc.scrap.toLocaleString()} scrap</b> a time (you have ${p.gold.toLocaleString()} and ${p.scrap.toLocaleString()}). The mark beside each line shows how good its roll is, in the rarity colours, from Common up to Immortal for the very best. ${this.reforgeKey ? '' : `<b>Reforge</b> turns a bonus line into a stat you choose: ${fc.gold.toLocaleString()} gold + ${fc.dust} Wishdust (you have ${p.dust || 0}); once reforged, only that line can be reforged again, and each time costs more.`}</p>`;
    const stats = itemStats(item);
    Object.keys(item.stats).forEach((k) => {
      const row = document.createElement('div');
      row.className = 'ench-row';
      const q = rollQuality(item, k);
      const t = RARITIES[rollTier(q)];
      const { lo, hi } = statRange(item, k);
      row.innerHTML = `<span class="ench-stat">${rollPip(item, k)}${formatStat(k, stats[k])}${item.enchantKey === k ? ' ✦' : ''}${isMainStat(item, k) ? ' <small>(main)</small>' : ''}</span><span class="ench-q" style="color:${t.color}" title="Rolls between ${lo} and ${hi} before upgrades">${t.name} · ${item.stats[k]} of ${lo}–${hi}</span>`;
      const btns = document.createElement('span');
      btns.className = 'ench-btns';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost tiny';
      b.textContent = 'Reroll';
      b.disabled = !canRoll || q >= 1;
      b.title = q >= 1 ? 'Already the best roll this line can have' : `A fresh roll between ${lo} and ${hi}`;
      b.addEventListener('click', () => this.send({ type: 'enchant', slot, key: k }));
      btns.appendChild(b);
      if (p.rebirth && p.rebirth.essence >= ECHOES.reroll && q < 1) {
        // Echoes (0.53): the same reroll for Echo Essence
        const eb = document.createElement('button');
        eb.type = 'button';
        eb.className = 'ghost tiny echo-btn';
        eb.textContent = `${ECHOES.reroll} Essence`;
        eb.title = `Reroll for ${ECHOES.reroll} Echo Essence instead of gold and scrap (you have ${p.rebirth.essence})`;
        eb.addEventListener('click', () => this.send({ type: 'enchant', slot, key: k, essence: true }));
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
