// The heads-up display: health and EXP bars, ability bar with ranks, wave and
// boss status, enemy health bars, floating combat text, banners and hints.
// Plain DOM on top of the 3D canvas.
import { CONFIG } from '../config.js';
import { ABILITIES, ABILITY_SLOTS, expToNext } from '../sim/defs.js';
import { RARITIES, itemName } from '../sim/items.js';
import { AUGMENTS } from '../sim/augments.js';

import { QUESTS, NPCS } from '../sim/story.js';
import { ENEMIES } from '../sim/defs.js';
import { MAPS } from '../sim/maps.js';

/** A quest's goal in a few words: "Defeat 12 Husks on the Greenwood Trail". */
export function goalText(q) {
  const g = q.goal;
  if (g.reach) return `Travel to ${MAPS[g.reach].name}`;
  if (g.read) return `Read ${g.read} signs or notes`;
  if (g.wave) return `Clear wave ${g.wave} in the Echo Ring`;
  if (g.boss) return `Defeat ${ENEMIES[g.boss].name}`;
  const who = g.enemy ? ENEMIES[g.enemy].name + (g.kill > 1 ? 's' : '') : 'enemies';
  return `Defeat ${g.kill} ${who}${g.map ? ' in ' + MAPS[g.map].name : ''}`;
}

const $ = (id) => document.getElementById(id);

export const ICONS = {
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
  kunai: '<path d="M20 4l-9 4-3 3 5 5 3-3 4-9z"/><path d="M8 11l-1.5 1.5M13 16l-1.5 1.5M9.5 14.5L4 20"/><circle cx="3.5" cy="20.5" r="1.5"/>',
  orb: '<circle cx="12" cy="12" r="5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  bolt: '<path d="M12 3c4 4 6 7 6 11a6 6 0 0 1-12 0c0-2 1-4 2-5 0 2 1 3 2 3 0-3 0-6 2-9z"/>',
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
export const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.hero}</svg>`;

/** Tooltip text for an ability, including its rank and any augments changing it. */
export function abilityTooltip(world, slot) {
  const a = world.kit[slot];
  const p = world.player;
  const rank = p.ranks[slot];
  const unlocked = world.abilityUnlocked(slot);
  const augs = world.augments.filter((id) => AUGMENTS[id].slot === slot).map((id) => `<div class="plus">${AUGMENTS[id].name}: ${AUGMENTS[id].desc}</div>`);
  let html = `<div class="tt-name">${a.name}</div><div class="tt-meta">Rank ${rank} of ${CONFIG.MAX_RANK} &middot; ${world.abilityCooldown(slot).toFixed(1)}s cooldown`;
  html += unlocked ? ` &middot; ${Math.round(world.abilityDamage(slot))} damage</div>` : ` &middot; unlocks at level ${a.unlock}</div>`;
  html += `<div>${a.desc}</div>`;
  if (augs.length) html += `<div class="tt-diff"><b>Augments</b>${augs.join('')}</div>`;
  if (rank < CONFIG.MAX_RANK) html += `<div class="tt-desc">Next rank: +${Math.round(CONFIG.RANK_DAMAGE * 100)}% damage, ${Math.round(CONFIG.RANK_COOLDOWN * 100)}% shorter cooldown.</div>`;
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
      el.addEventListener('mouseenter', () => this.tooltip.show(tipHtml(), el));
      el.addEventListener('mouseleave', () => this.tooltip.hide());
      root.appendChild(el);
      this.slots[key] = { el, cd: el.querySelector('.cd'), num: el.querySelector('.num'), lock: el.querySelector('.lock'), last: '' };
      return el;
    };
    add('parry', 'parry', 'Space', 'parry', () => {
      const w = this.world;
      const pr = CONFIG.PARRY_PRESETS[(w && w.parryPreset) || CONFIG.DEFAULT_PARRY_PRESET];
      const win = Math.round(pr.window * (w ? w.mods.parryWindow : 1) * 1000);
      const augs = w ? w.augments.filter((id) => AUGMENTS[id].slot === 'parry').map((id) => `<div class="plus">${AUGMENTS[id].name}: ${AUGMENTS[id].desc}</div>`) : [];
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
    const p = world.player;

    // Health / EXP / gold
    const hpFrac = Math.max(0, p.hp / p.stats.maxHp);
    $('hp-fill').style.transform = `scaleX(${hpFrac})`;
    $('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.stats.maxHp}`;
    // Berserker: a mark at half health, and the bar burns red while Bloodied.
    const bar = $('hp-bar');
    const zerk = p.spec === 'berserker';
    bar.classList.toggle('berserk', zerk);
    bar.classList.toggle('bloodied', zerk && !p.dead && hpFrac < 0.5);
    const need = expToNext(p.level);
    const maxed = p.level >= CONFIG.MAX_LEVEL;
    $('xp-fill').style.transform = `scaleX(${maxed ? 1 : p.exp / need})`;
    $('xp-text').textContent = maxed ? 'MAX' : `${p.exp} / ${need} EXP`;
    $('level-badge').textContent = p.level;
    if (p.gold !== this.lastGold || p.tickets !== this.lastTickets) {
      this.lastGold = p.gold;
      this.lastTickets = p.tickets;
      $('hud-gold').textContent = p.gold;
      $('hud-tickets').textContent = p.tickets;
    }
    this.drawMinimap(world);
    $('vignette').style.opacity = p.dead ? 0.9 : p.hurtT > 0 ? 0.8 : hpFrac < 0.3 ? 0.35 + Math.sin(performance.now() / 180) * 0.12 : 0;
    document.body.classList.toggle('slowmo', world.slowT > 0);

    // Abilities
    const kitKey = world.cls + ABILITY_SLOTS.map((s) => world.kit[s].name).join('|');
    if (kitKey !== this.kitKey) {
      // A different class (or a subclass that swaps an ability) is being played: swap the ability icons.
      this.kitKey = kitKey;
      this.cls = world.cls;
      for (const s of ABILITY_SLOTS) {
        this.slots[s].el.querySelector('svg').outerHTML = svg(world.kit[s].icon || s);
        this.slots[s].up.setAttribute('aria-label', `Rank up ${world.kit[s].name}`);
      }
    }
    let canRank = false;
    for (const s of ABILITY_SLOTS) {
      const slot = this.slots[s];
      const def = world.kit[s];
      const locked = !world.abilityUnlocked(s);
      slot.el.classList.toggle('locked', locked);
      if (locked) slot.lock.textContent = 'Lv ' + def.unlock;
      this.setCooldown(slot, locked ? 0 : p.cd[s], world.abilityCooldown(s));
      // Glows while pressing the key again does something (swap with a Shadow, shatter the orb).
      const me = p.id || 0;
      const again = (s === 'e' && world.mods.shadowStep && (world.shadows || []).some((x) => x.pid === me && x.src === 'e' && !x.swapped))
        || (def.type === 'orb' && world.projectiles.some((pr) => pr.kind === 'orb' && (pr.pid ?? 0) === me));
      slot.el.classList.toggle('recast', !!again);
      slot.el.classList.toggle('empowered', p.empowerT > 0 && s !== 'e' && !locked); // Shadowstep: the next ability hits harder
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
    const note = canRank ? `${p.skillPoints} skill point${p.skillPoints === 1 ? '' : 's'} · Ctrl + Q W E R` : '';
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
      sub = world.offer ? 'choose an augment' : `starts in ${Math.max(0, Math.ceil(w.timer))}s · press Enter to start now`;
    } else {
      const left = world.remaining;
      sub = `${left} ${left === 1 ? 'enemy' : 'enemies'} left`;
    }
    if (sub !== this.lastSub) {
      $('wave-sub').textContent = sub;
      this.lastSub = sub;
    }

    // Boss bar
    const boss = world.enemies.find((e) => e.def.boss && !e.dead);
    $('boss-box').classList.toggle('hidden', !boss);
    if (boss) {
      $('boss-fill').style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
      const pk = boss.posture + ':' + boss.state;
      if (pk !== this.lastPosture) {
        this.lastPosture = pk;
        let html = '';
        for (let i = 0; i < boss.def.poise; i++) html += `<i class="${i < boss.posture || boss.state === 'stunned' ? 'on' : ''}"></i>`;
        $('boss-posture').innerHTML = html;
        $('boss-name').textContent = boss.state === 'stunned' ? `${boss.def.name} — guard broken` : boss.def.name;
      }
    }

    this.updateEnemyBars(world, renderer);
    this.updateAllies(world, renderer);
    this.updatePortalLabels(world, renderer);

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
        el.innerHTML = '<div class="fill"></div><div class="tag"></div><div class="lvl"></div>';
        this.worldUi.appendChild(el);
        bar = { el, fill: el.firstChild, tag: el.children[1], lvl: el.lastChild, width, hp: -1, status: null, gap: null };
        this.bars.set(e.id, bar);
      }
      const pos = view.model.group.position;
      const s = renderer.project(pos.x, e.def.height + 0.55, pos.z);
      bar.el.style.transform = `translate(${Math.round(s.x - bar.width / 2)}px, ${Math.round(s.y)}px)`;
      if (bar.hp !== e.hp) {
        bar.hp = e.hp;
        bar.fill.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp)})`;
      }
      // The level, coloured by how dangerous the gap is.
      const gap = (e.level || world.player.level) - world.player.level;
      if (bar.gap !== gap) {
        bar.gap = gap;
        bar.lvl.textContent = e.level || '';
        bar.lvl.className = 'lvl ' + (gap >= 10 ? 'skull' : gap >= 5 ? 'red' : gap >= 2 ? 'orange' : gap <= -10 ? 'grey' : gap <= -3 ? 'green' : '');
      }
      // One status word above the bar: the most important one wins.
      const status = e.state === 'stunned' ? 'stunned' : e.vulnT > 0 ? 'sundered' : e.bleedT > 0 ? 'bleeding' : e.slowT > 0 ? 'slowed' : '';
      if (bar.status !== status) {
        bar.el.classList.remove('stunned', 'sundered', 'bleeding', 'slowed');
        if (status) bar.el.classList.add(status);
        bar.tag.textContent = status.toUpperCase();
        bar.status = status;
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
  drawMinimap(world) {
    const cv = $('minimap');
    const on = world.mode === 'explore';
    if (on !== this.mapOn) {
      this.mapOn = on;
      cv.classList.toggle('hidden', !on);
    }
    if (!on || (this.mapTick = (this.mapTick || 0) + 1) % 4) return;
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
      else if (ob.kind === 'sign' && !world.player.signs.includes(ob.id)) dot(ob.x, ob.z, 2.2, '#e8e4dc');
    }
    for (const gate of world.map.portals) {
      dot(gate.x, gate.z, 5, '#6fb4ff');
      dot(gate.x, gate.z, 2.5, '#0a0d16');
    }
    if (world.map.waygate) dot(world.map.waygate.x, world.map.waygate.z, 4, '#ffd27a');
    for (const e of world.enemies) if (!e.dead) dot(e.x, e.z, e.def.boss ? 4.5 : 2, e.aggro ? '#ff4d5a' : '#b0525c');
    const p = world.player;
    if (world.allies) for (const a of world.allies()) dot(a.x, a.z, 3, a.dead ? '#8a8f9c' : '#7fd0ff');
    dot(p.x, p.z, 3.5, '#ffffff');
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
          l.el.textContent = unread ? 'Unread' : '';
          l.el.classList.toggle('hidden', !unread);
        }
      }
      this.drawQuestTracker(world);
    }
    if (!id && this.trackOn) this.drawQuestTracker(world);
    this.updatePrompt(world);
    for (const l of this.portalLabels || []) {
      const s = renderer.project(l.gate.x, l.story ? 2.5 : l.gate === world.map.waygate ? 2.8 : 4.4, l.gate.z);
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
    if (near) el.innerHTML = `<kbd>G</kbd> ${near.kind === 'npc' ? 'Talk to ' + near.name : 'Read: ' + near.name}`;
  }

  /** The list of quests you are on, under the minimap. */
  drawQuestTracker(world) {
    const el = $('quest-track');
    const rows = [];
    if (world.mode === 'explore') {
      for (const id in world.player.quests) {
        const st = world.player.quests[id];
        const q = QUESTS[id];
        if (!q || st.s === 'done') continue;
        rows.push(st.s === 'ready'
          ? `<div class="qt ready"><b>${q.name}</b><span>Return to ${NPCS[q.giver].name}</span></div>`
          : `<div class="qt"><b>${q.name}</b><span>${goalText(q)}${world.questNeed(q) > 1 ? ` · ${st.n}/${world.questNeed(q)}` : ''}</span></div>`);
      }
    }
    this.trackOn = rows.length > 0;
    el.classList.toggle('hidden', !rows.length);
    el.innerHTML = rows.slice(0, 5).join('') + (rows.length > 5 ? `<div class="qt more">and ${rows.length - 5} more · <kbd>J</kbd></div>` : '');
  }

  /** Text that pops up at a world position and drifts upward. */
  float(renderer, x, y, z, text, cls = '') {
    if (this.floatCount > 40) return;
    const s = renderer.project(x, y, z);
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    const jitter = cls.includes('word') ? 0 : (Math.random() - 0.5) * 36;
    el.style.transform = `translate(${Math.round(s.x + jitter)}px, ${Math.round(s.y)}px) translate(-50%, -50%)`;
    this.worldUi.appendChild(el);
    this.floatCount++;
    el.addEventListener('animationend', () => {
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
    const list = world.mode === 'explore' && world.allies ? world.allies() : [];
    const seen = new Set();
    for (const a of list) {
      let t = this.allyTags.get(a.pid);
      if (!t) {
        const el = document.createElement('div');
        el.className = 'ally-tag';
        el.innerHTML = '<b></b><div class="abar"><div class="afill"></div></div>';
        this.worldUi.appendChild(el);
        t = { el, name: el.firstChild, fill: el.querySelector('.afill'), key: '' };
        this.allyTags.set(a.pid, t);
      }
      seen.add(a.pid);
      const key = `${a.name} · ${a.level}${a.dead ? ' · down' : ''}`;
      if (t.key !== key) {
        t.key = key;
        t.name.textContent = key;
        t.el.classList.toggle('down', a.dead);
      }
      t.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, a.hp / a.maxHp))})`;
      const s = renderer.project(a.x, 2.9, a.z);
      t.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
    }
    for (const [pid, t] of this.allyTags) {
      if (seen.has(pid)) continue;
      t.el.remove();
      this.allyTags.delete(pid);
    }
  }

  /** "Room K7QXM · 3 players", top of the screen, while in a room. */
  setRoom(info) {
    const el = $('room-badge');
    el.classList.toggle('hidden', !info);
    document.body.classList.toggle('in-room', !!info);
    if (info) el.innerHTML = `Room <b>${info.code}</b> · ${info.players} player${info.players === 1 ? '' : 's'}${info.host ? ' · hosting' : ''}`;
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
  constructor() {
    this.el = $('tooltip');
  }
  show(html, anchor, rarityColor) {
    if (!html) return;
    this.el.innerHTML = html;
    this.el.style.setProperty('--rarity', rarityColor || '');
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
