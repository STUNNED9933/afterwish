// The town: where you spend what the arena gave you.
//   Arena gate   pick a checkpoint and start a run
//   Blacksmith   upgrade equipped gear with scrap and gold
//   Cache vault  loot caches, with their odds on display
//   Trainer      spend skill points on ability ranks, buy more with gold
// It is a menu screen for now. Every action is a command on the World, so the
// rules stay in sim/world.js and this file only draws buttons.
import { CONFIG } from '../config.js';
import { ABILITY_SLOTS } from '../sim/defs.js';
import { itemTypeName, SLOTS, SLOT_NAMES, RARITIES, CACHES, MAX_PLUS, itemName, itemScore, scrapValue, upgradeCost } from '../sim/items.js';
import { svg, abilityTooltip } from './hud.js';
import { itemCell } from './inventory.js';

const $ = (id) => document.getElementById(id);

function costText(cost) {
  const parts = [];
  if (cost.scrap) parts.push(`${cost.scrap} scrap`);
  if (cost.gold) parts.push(`${cost.gold} gold`);
  if (cost.keys) parts.push(`${cost.keys} Warden key`);
  return parts.join(' + ');
}

export class Town {
  /**
   * @param {object} tooltip   shared Tooltip
   * @param {function} send    send(command) -> applies a command to the world
   * @param {function} onEnter onEnter(startWave) -> start a run
   */
  constructor(tooltip, send, onEnter) {
    this.tooltip = tooltip;
    this.send = send;
    this.startWave = null;
    this.lastCache = null;
    $('btn-enter').addEventListener('click', () => onEnter(this.startWave));
    $('smith-scrap').addEventListener('click', () => this.send({ type: 'scrap' }));
    $('btn-tome').addEventListener('click', () => this.send({ type: 'buyTome' }));
  }

  /** Remember the item a cache just produced so render() can show it. */
  showCacheResult(item) {
    this.lastCache = item;
  }

  render(world) {
    const p = world.player;
    this.tooltip.hide();
    $('town-gold').textContent = p.gold;
    $('town-scrap').textContent = p.scrap;
    $('town-keys').textContent = p.keys;
    $('town-tickets').textContent = p.tickets;

    // --- Arena gate ------------------------------------------------------
    const max = world.maxCheckpoint;
    if (this.startWave == null || this.startWave > max) this.startWave = max;
    const gate = $('gate-waves');
    gate.innerHTML = '';
    for (let wv = 1; wv <= max; wv += CONFIG.BOSS_EVERY) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `Wave ${wv}`;
      b.setAttribute('aria-pressed', wv === this.startWave ? 'true' : 'false');
      b.addEventListener('click', () => {
        this.startWave = wv;
        this.render(world);
      });
      gate.appendChild(b);
    }
    $('gate-best').textContent = world.bestWave ? `Best wave cleared: ${world.bestWave}. A new checkpoint opens after every boss.` : 'A new checkpoint opens after every boss.';
    $('btn-enter').textContent = p.tickets > 0 ? `Enter at wave ${this.startWave} · 1 ticket (you have ${p.tickets})` : 'No arena tickets · earn them exploring';
    $('btn-enter').disabled = p.tickets <= 0;

    // --- Blacksmith ------------------------------------------------------
    const smith = $('smith-list');
    smith.innerHTML = '';
    for (const slot of SLOTS) {
      const item = p.equipped[slot];
      const row = document.createElement('div');
      row.className = 'town-row';
      const cell = itemCell(this.tooltip, item);
      if (!item) {
        cell.innerHTML = svg(slot);
        cell.style.opacity = 0.35;
      }
      const text = document.createElement('div');
      text.className = 'town-row-text';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost';
      if (!item) {
        text.innerHTML = `<div class="eq-name" style="color:var(--muted)">No ${SLOT_NAMES[slot].toLowerCase()} equipped</div>`;
        btn.textContent = 'Upgrade';
        btn.disabled = true;
      } else {
        const maxed = (item.plus || 0) >= MAX_PLUS;
        const cost = upgradeCost(item);
        text.innerHTML = `<div class="eq-name" style="color:${RARITIES[item.rarity].color}">${itemName(item)}</div><div class="eq-slot">${maxed ? 'Fully upgraded' : costText(cost)}</div>`;
        btn.textContent = maxed ? 'Max' : `Upgrade to +${(item.plus || 0) + 1}`;
        btn.disabled = maxed || p.scrap < cost.scrap || p.gold < cost.gold;
        btn.addEventListener('click', () => this.send({ type: 'upgrade', slot }));
      }
      row.append(cell, text, btn);
      smith.appendChild(row);
    }
    let scrapTotal = 0;
    for (const it of p.bag) if (itemScore(it) <= itemScore(p.equipped[it.slot])) scrapTotal += scrapValue(it);
    const scrapBtn = $('smith-scrap');
    scrapBtn.textContent = scrapTotal ? `Scrap bag items that are not upgrades (+${scrapTotal} scrap)` : 'Nothing in your bag to scrap';
    scrapBtn.disabled = !scrapTotal;

    // --- Cache vault -----------------------------------------------------
    const list = $('cache-list');
    list.innerHTML = '';
    const bagFull = p.bag.length >= CONFIG.BAG_SIZE;
    for (const tier in CACHES) {
      const def = CACHES[tier];
      const total = def.odds.reduce((a, b) => a + b, 0);
      const odds = def.odds
        .map((o, i) => (o > 0 ? `<span style="color:${RARITIES[i].color}">${RARITIES[i].name} ${+((o / total) * 100).toFixed(1)}%</span>` : ''))
        .filter(Boolean)
        .join(' · ');
      const row = document.createElement('div');
      row.className = 'town-row cache';
      const text = document.createElement('div');
      text.className = 'cache-name';
      text.textContent = def.name;
      const oddsEl = document.createElement('div');
      oddsEl.className = 'odds';
      oddsEl.innerHTML = odds;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost';
      const cost = world.cacheCost(tier);
      btn.textContent = `Open · ${costText(cost)}`;
      btn.disabled = bagFull || p.gold < cost.gold || p.keys < cost.keys;
      btn.addEventListener('click', () => this.send({ type: 'openCache', tier }));
      row.append(text, btn, oddsEl);
      list.appendChild(row);
    }
    const result = $('cache-result');
    const item = this.lastCache && p.bag.includes(this.lastCache) ? this.lastCache : null;
    result.classList.toggle('hidden', !this.lastCache);
    result.innerHTML = '';
    if (this.lastCache) {
      const it = this.lastCache;
      const current = p.equipped[it.slot];
      const better = itemScore(it) > itemScore(current);
      const cell = itemCell(this.tooltip, it, { compareTo: current, upgrade: better });
      const text = document.createElement('div');
      text.className = 'town-row-text';
      text.innerHTML = `<div class="eq-slot">You found</div><div class="eq-name" style="color:${RARITIES[it.rarity].color}">${itemName(it)}</div><div class="eq-slot">${RARITIES[it.rarity].name} ${itemTypeName(it)} · power ${Math.round(itemScore(it))}${better ? ' · upgrade' : ''}</div>`;
      result.append(cell, text);
      if (item) {
        const eq = document.createElement('button');
        eq.type = 'button';
        eq.className = 'ghost';
        eq.textContent = 'Equip';
        eq.addEventListener('click', () => this.send({ type: 'equip', index: p.bag.indexOf(it) }));
        result.appendChild(eq);
      }
    }
    if (bagFull) {
      const warn = document.createElement('p');
      warn.className = 'setting-desc';
      warn.textContent = 'Your bag is full. Scrap something before opening a cache.';
      list.appendChild(warn);
    }

    // --- Trainer ---------------------------------------------------------
    $('trainer-points').textContent = `Skill points to spend: ${p.skillPoints}. You earn one each level and one per boss. Each rank adds ${Math.round(CONFIG.RANK_DAMAGE * 100)}% damage and shortens the cooldown by ${Math.round(CONFIG.RANK_COOLDOWN * 100)}%.`;
    const tr = $('trainer-list');
    tr.innerHTML = '';
    for (const s of ABILITY_SLOTS) {
      const a = world.kit[s];
      const rank = p.ranks[s];
      const unlocked = world.abilityUnlocked(s);
      const row = document.createElement('div');
      row.className = 'town-row';
      const icon = document.createElement('div');
      icon.className = 'cell';
      icon.innerHTML = svg(a.icon || s);
      icon.addEventListener('mouseenter', () => this.tooltip.show(abilityTooltip(world, s), icon));
      icon.addEventListener('mouseleave', () => this.tooltip.hide());
      const text = document.createElement('div');
      text.className = 'town-row-text';
      let pips = '';
      for (let i = 0; i < CONFIG.MAX_RANK; i++) pips += `<i class="${i < rank ? 'on' : ''}"></i>`;
      text.innerHTML = `<div class="eq-name">${a.name} <kbd>${a.key}</kbd></div><div class="pips static">${pips}</div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost';
      btn.textContent = !unlocked ? `Level ${a.unlock}` : rank >= CONFIG.MAX_RANK ? 'Max' : 'Rank up';
      btn.disabled = !unlocked || rank >= CONFIG.MAX_RANK || p.skillPoints <= 0;
      btn.addEventListener('click', () => this.send({ type: 'rankUp', slot: s }));
      row.append(icon, text, btn);
      tr.appendChild(row);
    }
    const tome = $('btn-tome');
    const cost = world.tomeCost();
    const none = world.ranksLeft() <= 0;
    tome.textContent = none ? 'Every ability is covered' : `Buy a skill point · ${cost} gold`;
    tome.disabled = none || p.gold < cost;
  }
}
