// (1.1) Lacuna's gear screen (I): what you wear, your bag, and the anvil (salvage into ash shards; reroll an affix
// or add a star with them). Plain DOM; the page hands it the gear and is told when it changes.
import { GEAR_SLOTS, GEAR_SLOT_NAMES, gradeOf, itemLines, itemName, itemScore, salvageValue, rerollCost, starCost, reroll, addStar, MAX_STARS, UNIQUE, UNIQUES, gearMods } from './loot.js';
import { STAT_TEXT } from './tree.js';

export const BAG_MOST = 80;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** An item's card (for the tooltip and the selected pane). */
export function itemCard(it, level, worn = null) {
  const g = gradeOf(it);
  const stars = it.stars ? ` <span class="gstars">${'★'.repeat(it.stars)}</span>` : '';
  const lines = itemLines(it).map((l) => `<li class="${l.kind}">${esc(l.text)}</li>`).join('');
  const lore = it.r === UNIQUE ? `<p class="glore">${esc(UNIQUES[it.u].lore)}</p>` : '';
  const need = it.ilvl > level ? `<p class="gneed">Needs level ${it.ilvl}</p>` : '';
  let cmp = '';
  if (worn && worn.id !== it.id) {
    const d = itemScore(it) - itemScore(worn);
    cmp = `<p class="gcmp ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} vs. what you wear (${esc(itemName(worn))})</p>`;
  }
  return `<div class="gcard" style="--g:${g.color}"><b>${esc(itemName(it))}${stars}</b><small>${g.name} ${GEAR_SLOT_NAMES[it.slot].toLowerCase()} · item level ${it.ilvl}</small><ul>${lines}</ul>${lore}${need}${cmp}</div>`;
}

export class GearUI {
  /** gear: { worn, bag, shards }; opts: { level(), rng, changed(), toast(t, s) } */
  constructor(root, opts) {
    this.root = root;
    this.o = opts;
    this.sel = null; // an item id
    this.open = false;
    root.addEventListener('click', (e) => this.click(e));
    root.addEventListener('mouseover', (e) => this.hover(e));
    root.addEventListener('mouseout', (e) => { if (e.target.closest('[data-id]')) this.root.querySelector('.gtip').classList.add('hidden'); });
    root.addEventListener('mousemove', (e) => { const t = this.root.querySelector('.gtip'); t.style.left = `${Math.min(innerWidth - 300, e.clientX + 16)}px`; t.style.top = `${Math.min(innerHeight - 260, e.clientY + 12)}px`; });
  }

  get gear() { return this.o.gear(); }
  find(id) { const g = this.gear; return g.bag.find((i) => i.id === id) || Object.values(g.worn).find((i) => i && i.id === id) || null; }

  draw() {
    const g = this.gear, L = this.o.level();
    const tile = (it, where) => {
      if (!it) return '';
      const gr = gradeOf(it);
      return `<button class="gtile ${this.sel === it.id ? 'sel' : ''} ${it.ilvl > L ? 'high' : ''}" data-id="${it.id}" data-where="${where}" style="--g:${gr.color}"><span>${GEAR_SLOT_NAMES[it.slot][0]}</span>${it.stars ? `<i>${it.stars}★</i>` : ''}${it.r === UNIQUE ? '<em>U</em>' : ''}</button>`;
    };
    const worn = GEAR_SLOTS.map((s) => `<div class="gslot"><small>${GEAR_SLOT_NAMES[s]}</small>${g.worn[s] ? tile(g.worn[s], 'worn') : '<div class="gtile empty"></div>'}</div>`).join('');
    const mods = gearMods(g.worn).mods;
    const sum = Object.entries(mods).filter(([k]) => STAT_TEXT[k]).map(([k, v]) => `<li>${esc(STAT_TEXT[k](Math.abs(v) >= 1 ? Math.round(v) : Math.round(v * 1000) / 1000))}</li>`).join('') || '<li>Nothing worn yet.</li>';
    const bag = g.bag.slice().sort((p, q) => (q.r - p.r) || (q.ilvl - p.ilvl));
    const it = this.sel && this.find(this.sel);
    let pane = '<p class="ghelp">Click an item to see it. Beasts drop gear now and then; <b>elites</b> (Ash-touched, glowing) always do; <b>rare named beasts</b>, <b>world bosses</b> and the <b>Ash Rift</b> (the circle at the old watchtower) drop the best.</p>';
    if (it) {
      const isWorn = g.worn[it.slot] && g.worn[it.slot].id === it.id;
      const rr = it.r !== UNIQUE && (it.aff || []).length ? it.aff.map(([s], k) => `<button data-act="reroll" data-k="${k}" ${g.shards < rerollCost(it) ? 'disabled' : ''}>Reroll "${esc(STAT_TEXT[s] ? STAT_TEXT[s](0).replace(/^[+-]?0%\s*/, '') : s)}" (${rerollCost(it)})</button>`).join('') : '';
      pane = itemCard(it, L, isWorn ? null : g.worn[it.slot]) + `<div class="gacts">
        ${isWorn ? '<button data-act="off">Take off</button>' : `<button data-act="wear" ${it.ilvl > L ? 'disabled' : ''}>Wear</button>`}
        ${isWorn ? '' : `<button data-act="salvage">Salvage (+${salvageValue(it)} shards)</button>`}
        <button data-act="star" ${(it.stars || 0) >= MAX_STARS || g.shards < starCost(it) ? 'disabled' : ''}>${(it.stars || 0) >= MAX_STARS ? 'Five stars' : `Add a star (${starCost(it)})`}</button>
        ${rr}</div>`;
    }
    this.root.innerHTML = `<div class="jcard gearcard">
      <div class="jhead"><b>Gear</b><span class="jkeys"><span class="gshards">◆ ${g.shards} ash shards</span> · <kbd>I</kbd> to close</span></div>
      <div class="gcols">
        <div><h4>Worn</h4><div class="gworn">${worn}</div><h4>All together</h4><ul class="gsum">${sum}</ul></div>
        <div><h4>Bag (${g.bag.length}/${BAG_MOST})</h4><div class="gbag">${bag.map((i) => tile(i, 'bag')).join('') || '<p class="ghelp">Empty.</p>'}</div>
          <div class="gbulk"><button data-act="bulk" data-r="1">Salvage all Common</button><button data-act="bulk" data-r="2">… and Uncommon</button><button data-act="bulk" data-r="3">… and Rare</button></div></div>
        <div class="gpane">${pane}</div>
      </div><div class="gtip hidden"></div></div>`;
  }

  hover(e) {
    const el = e.target.closest('[data-id]');
    if (!el) return;
    const it = this.find(el.dataset.id), t = this.root.querySelector('.gtip');
    if (!it) return;
    const g = this.gear;
    t.innerHTML = itemCard(it, this.o.level(), g.worn[it.slot] && g.worn[it.slot].id !== it.id ? g.worn[it.slot] : null);
    t.classList.remove('hidden');
  }

  click(e) {
    const tile = e.target.closest('[data-id]');
    if (tile) { this.sel = tile.dataset.id; this.draw(); return; }
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const g = this.gear, it = this.sel && this.find(this.sel), act = b.dataset.act;
    if (act === 'bulk') {
      const below = +b.dataset.r;
      const go = g.bag.filter((i) => i.r !== UNIQUE && i.r < below && !(i.stars > 0));
      if (!go.length) return;
      const got = go.reduce((a, i) => a + salvageValue(i), 0);
      g.bag = g.bag.filter((i) => !go.includes(i));
      g.shards += got;
      this.o.toast('Salvaged', `${go.length} item${go.length > 1 ? 's' : ''} · +${got} ash shards`);
    } else if (!it) return;
    else if (act === 'wear') {
      if (it.ilvl > this.o.level()) return;
      const was = g.worn[it.slot];
      g.bag = g.bag.filter((i) => i.id !== it.id);
      if (was) g.bag.push(was);
      g.worn[it.slot] = it;
    } else if (act === 'off') {
      if (g.bag.length >= BAG_MOST) return this.o.toast('Your bag is full', 'Salvage something first');
      delete g.worn[it.slot];
      g.bag.push(it);
    } else if (act === 'salvage') {
      g.bag = g.bag.filter((i) => i.id !== it.id);
      g.shards += salvageValue(it);
      this.sel = null;
    } else if (act === 'star') {
      const up = addStar(it);
      if (!up || g.shards < starCost(it)) return;
      g.shards -= starCost(it);
      this.replace(it, up);
    } else if (act === 'reroll') {
      const nu = reroll(this.o.rng, it, +b.dataset.k);
      if (!nu || g.shards < rerollCost(it)) return;
      g.shards -= rerollCost(it);
      this.replace(it, nu);
    }
    this.o.changed();
    this.draw();
  }

  replace(old, nu) {
    const g = this.gear;
    if (g.worn[old.slot] && g.worn[old.slot].id === old.id) g.worn[old.slot] = nu;
    else g.bag = g.bag.map((i) => (i.id === old.id ? nu : i));
  }
}
