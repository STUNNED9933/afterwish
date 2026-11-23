// (0.82) The Armory: Hero gear for the Wishkeep's heroes, on its own tab of the gear window (as Eternal gear
// is). Every hero has three slots (Weapon, Armour, Charm); pieces come from the nights the keep holds and
// are kept here, apart from the player's own bag. Choose a hero, then a piece, then put it on.
import { RARITIES } from '../sim/items.js';
import { CLASSES } from '../sim/classes.js';
import { HERO_SLOTS, HERO_SLOT_NAMES, HERO_GEAR, HERO_RARITY, ARMORY_MAX, heroGearScore, troopStats, heroWorn, heroGearUpgrade, heroSalvageable } from '../sim/wishkeep.js';

// (0.82.5) the rarities Break down never takes, kept in this browser (Immortal by default, as for your own gear)
function loadKeepRar() {
  try {
    const v = JSON.parse(localStorage.getItem('afterwish.herokeep') || '[6]');
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : [6];
  } catch {
    return [6];
  }
}
function storeKeepRar(v) {
  try {
    localStorage.setItem('afterwish.herokeep', JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pc = (v) => `${Math.round(v * 1000) / 10}%`;
const SLOT_ICON = { weapon: '⚔', armor: '⛨', charm: '✦' };

/** One line of a piece, in words. */
export function heroLine(k, v) {
  if (k === 'dmg') return `+${pc(v)} damage`;
  if (k === 'hp') return `+${pc(v)} health`;
  const B = HERO_GEAR.bonus[k];
  if (!B) return '';
  if (k === 'leech') return `${pc(v)} lifesteal`;
  return `${B.less ? '−' : '+'}${pc(v)} ${B.name.toLowerCase()}`;
}
/** A piece, for its tooltip and the detail box. */
export function heroGearHtml(g, wornBy = null) {
  const R = RARITIES[g.r];
  const fx = g.r >= 6 ? HERO_GEAR.effects[g.slot] : null;
  return `<b style="color:${R.color}">${esc(g.name)}</b><br><small>${R.name} ${HERO_SLOT_NAMES[g.slot].toLowerCase()} · won on Night ${g.L}${g.locked ? ' · locked' : ''}${wornBy ? ` · worn by ${esc(wornBy)}` : ''}</small>`
    + `<div class="hg-main">${heroLine(g.main.k, g.main.v)}</div>`
    + g.lines.map((l) => `<div class="hg-line">${heroLine(l.k, l.v)}</div>`).join('')
    + (fx ? `<div class="hg-fx"><b>${fx.name}</b>: ${fx.desc}</div>` : '');
}

/**
 * Draw the Armory into `root`. `ui` keeps what is chosen between draws ({ hero, piece, slot }); `send`
 * sends a command; `tooltip` shows hover text; `redraw` draws again.
 */
export function renderArmory(root, world, ui, send, tooltip, redraw) {
  const k = world.player.keep;
  root.innerHTML = '';
  if (!k) {
    root.innerHTML = '<p class="setting-desc">The Armory is the Wishkeep\'s: open the keep first (by the Waygate, once a class has beaten the Quiet).</p>';
    return;
  }
  const busy = !!(world.tide && world.tide.state === 'on');
  const armory = k.armory || [];
  const byId = new Map(k.troops.map((t) => [t.id, t]));
  if (!k.troops.some((t) => t.id === ui.hero)) ui.hero = k.troops.length ? k.troops[0].id : null;
  const head = document.createElement('div');
  head.className = 'arm-head';
  head.innerHTML = `<span><b>The Armory</b> · ${armory.length} / ${ARMORY_MAX} pieces · ${k.sigils || 0} Ascension Sigils · ${k.stone} Wishstone</span><span class="setting-desc">Hero gear is for the keep's heroes only. The nights it holds give it, rarer the deeper the Night. Choose a hero, then a piece; shift-click a piece to break it down. A green ▲ marks one that would be an upgrade for a hero.${busy ? ' (Not while the night is on.)' : ''}</span>`;
  const btns = document.createElement('div');
  btns.className = 'arm-btns';
  const best = document.createElement('button');
  best.type = 'button';
  best.className = 'primary tiny';
  best.textContent = 'Equip the best on everyone';
  best.disabled = busy || !armory.length || !k.troops.length;
  best.title = 'Every hero gets the best piece left for each slot, the rarest heroes choosing first';
  best.addEventListener('click', () => send({ type: 'keepGearBest' }));
  // (0.82.5) Break down, as your own gear's Scrap: everything that is no hero's upgrade, never worn, locked
  // or of a rarity you keep
  const keepRar = loadKeepRar();
  const junk = heroSalvageable(k, keepRar);
  const sal = document.createElement('button');
  sal.type = 'button';
  sal.className = 'ghost tiny';
  sal.textContent = junk.length ? `Break down everything that is no hero's upgrade (${junk.length}) · +${junk.reduce((a, g) => a + HERO_GEAR.salvage(g), 0)} Wishstone` : 'Nothing to break down';
  sal.title = keepRar.length ? `Keeps ${keepRar.slice().sort().map((i) => RARITIES[i].name).join(', ')} pieces however they compare` : '';
  sal.disabled = !junk.length;
  sal.addEventListener('click', () => send({ type: 'keepSalvage', ids: junk.map((g) => g.id) }));
  btns.append(best, sal);
  head.appendChild(btns);
  const keepRow = document.createElement('div');
  keepRow.className = 'keep-row';
  keepRow.innerHTML = '<span>Never break down:</span>';
  const chips = document.createElement('span');
  chips.className = 'keep-chips';
  for (let r = 2; r <= 6; r++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'keep-chip';
    b.style.setProperty('--rc', RARITIES[r].color);
    b.textContent = RARITIES[r].name;
    b.setAttribute('aria-pressed', keepRar.includes(r) ? 'true' : 'false');
    b.addEventListener('click', () => {
      const next = keepRar.includes(r) ? keepRar.filter((x) => x !== r) : keepRar.concat(r);
      storeKeepRar(next);
      redraw();
    });
    chips.appendChild(b);
  }
  keepRow.appendChild(chips);
  head.appendChild(keepRow);
  const autoRow = document.createElement('label');
  autoRow.className = 'keep-row';
  autoRow.innerHTML = `<span>Auto-break down new Hero gear:</span>`;
  const asel = document.createElement('select');
  asel.className = 'arm-auto';
  asel.innerHTML = '<option value="">Off</option>' + RARITIES.slice(0, 6).map((r, i) => `<option value="${i}"${k.autoSalvageAt === i ? ' selected' : ''}>${i ? `${r.name} and below` : 'Common only'}</option>`).join('');
  if (k.autoSalvageAt == null) asel.value = '';
  asel.style.color = k.autoSalvageAt == null ? '' : RARITIES[k.autoSalvageAt].color;
  asel.title = 'Pieces a night gives at or below this rarity are broken down for Wishstone at once, unless one is an upgrade for a hero (a slot empty, or something worse worn there). Never an Immortal.';
  asel.addEventListener('change', () => {
    const v = asel.value === '' ? null : Number(asel.value);
    if (v != null) {
      const n = armory.filter((g) => g.hero == null && !g.locked && g.r <= v && !heroGearUpgrade(g, k)).length;
      if (n && !window.confirm(`Auto-break down ${RARITIES[v].name}${v ? ' and below' : ''}: this also breaks down the ${n} piece${n > 1 ? 's' : ''} like that in the Armory now (never worn or locked ones, or a hero's upgrade). Go ahead?`)) return redraw();
    }
    send({ type: 'keepAutoSalvage', to: v });
  });
  autoRow.appendChild(asel);
  head.appendChild(autoRow);
  root.appendChild(head);

  // the heroes, three slots each
  const heroes = document.createElement('div');
  heroes.className = 'arm-heroes';
  if (!k.troops.length) heroes.innerHTML = '<p class="setting-desc">No heroes yet: raise them at the Hearth.</p>';
  for (const t of k.troops) {
    const st = troopStats(t, armory);
    const R = RARITIES[t.rar || 0];
    const card = document.createElement('div');
    card.className = 'arm-hero' + (ui.hero === t.id ? ' on' : '');
    card.style.setProperty('--rc', R.color);
    card.innerHTML = `<div class="arm-hero-h"><b style="color:${R.color}">${esc(t.name)}</b> <small>${HERO_RARITY.names[t.rar || 0]} ${CLASSES[t.cls].name.toLowerCase()} · level ${t.lvl}</small><span class="arm-stats">${st.hp.toLocaleString()} health · ${st.dmg.toLocaleString()} damage</span></div>`;
    card.addEventListener('click', () => {
      ui.hero = t.id;
      ui.slot = null;
      redraw();
    });
    const slots = document.createElement('div');
    slots.className = 'arm-slots';
    const worn = heroWorn(t, armory);
    for (const sl of HERO_SLOTS) {
      const g = worn[sl];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arm-slot' + (g ? '' : ' empty');
      if (g) b.style.borderColor = RARITIES[g.r].color;
      b.innerHTML = `<i>${SLOT_ICON[sl]}</i><span>${g ? esc(g.name) : HERO_SLOT_NAMES[sl]}</span>`;
      b.title = g ? 'Click: show it in the Armory' : `Nothing worn: choose a ${HERO_SLOT_NAMES[sl].toLowerCase()} below`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        ui.hero = t.id;
        ui.slot = sl;
        ui.piece = g ? g.id : null;
        redraw();
      });
      if (g) {
        b.addEventListener('mouseenter', () => tooltip.show(heroGearHtml(g, t.name), b, RARITIES[g.r].color));
        b.addEventListener('mouseleave', () => tooltip.hide());
      }
      slots.appendChild(b);
    }
    card.appendChild(slots);
    heroes.appendChild(card);
  }
  root.appendChild(heroes);

  // the pieces
  const filt = document.createElement('div');
  filt.className = 'segmented arm-filter';
  for (const [id, name] of [[null, 'All'], ...HERO_SLOTS.map((s) => [s, HERO_SLOT_NAMES[s]])]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.setAttribute('aria-pressed', (ui.slot || null) === id ? 'true' : 'false');
    b.addEventListener('click', () => {
      ui.slot = id;
      redraw();
    });
    filt.appendChild(b);
  }
  root.appendChild(filt);
  const grid = document.createElement('div');
  grid.className = 'arm-grid';
  const shown = armory.filter((g) => !ui.slot || g.slot === ui.slot).sort((a, b) => HERO_SLOTS.indexOf(a.slot) - HERO_SLOTS.indexOf(b.slot) || heroGearScore(b) - heroGearScore(a));
  if (!shown.length) grid.innerHTML = `<p class="setting-desc">${armory.length ? 'None of that kind.' : 'Empty. Hold a night at the Hearth: each one held gives Hero gear.'}</p>`;
  for (const g of shown) {
    const R = RARITIES[g.r];
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'arm-piece' + (ui.piece === g.id ? ' on' : '') + (g.hero != null ? ' worn' : '');
    tile.style.setProperty('--rc', R.color);
    const who = g.hero != null && byId.get(g.hero);
    tile.innerHTML = `<i>${SLOT_ICON[g.slot]}</i><span class="arm-n">${heroLine(g.main.k, g.main.v)}</span>${who ? `<span class="arm-who">${esc(who.name.split(' ')[0])}</span>` : ''}${g.locked ? '<span class="arm-lock">🔒</span>' : ''}${g.r >= 6 ? '<span class="arm-imm">✦</span>' : ''}${g.hero == null && heroGearUpgrade(g, k) ? '<span class="arm-up">▲</span>' : ''}`;
    tile.title = g.hero == null && !g.locked ? 'Shift-click: break it down for Wishstone' : '';
    tile.addEventListener('click', (ev) => {
      if (ev.shiftKey && g.hero == null && !g.locked) return send({ type: 'keepSalvage', ids: [g.id] }); // (0.82.5) as your own gear
      ui.piece = ui.piece === g.id ? null : g.id;
      redraw();
    });
    tile.addEventListener('mouseenter', () => tooltip.show(heroGearHtml(g, who ? who.name : null), tile, R.color));
    tile.addEventListener('mouseleave', () => tooltip.hide());
    grid.appendChild(tile);
  }
  root.appendChild(grid);

  // the chosen piece
  const g = armory.find((x) => x.id === ui.piece);
  if (g) {
    const hero = byId.get(ui.hero);
    const who = g.hero != null ? byId.get(g.hero) : null;
    const box = document.createElement('div');
    box.className = 'arm-detail';
    box.style.borderColor = RARITIES[g.r].color;
    box.innerHTML = heroGearHtml(g, who ? who.name : null);
    const row = document.createElement('div');
    row.className = 'arm-btns';
    const mk = (label, cmd, { primary = false, disabled = false, title = '' } = {}) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = (primary ? 'primary' : 'ghost') + ' tiny';
      b.textContent = label;
      b.disabled = disabled;
      if (title) b.title = title;
      b.addEventListener('click', () => send(cmd));
      row.appendChild(b);
    };
    if (hero && g.hero !== hero.id) {
      const now = heroWorn(hero, armory)[g.slot];
      mk(`Put it on ${hero.name}`, { type: 'keepGearOn', gid: g.id, hero: hero.id }, { primary: true, disabled: busy, title: now ? `${now.name} goes back to the Armory` : '' });
    }
    if (g.hero != null) mk('Take it off', { type: 'keepGearOff', gid: g.id }, { disabled: busy });
    mk(g.locked ? 'Unlock' : 'Lock', { type: 'keepGearLock', gid: g.id }, { title: 'A locked piece is never broken down' });
    mk(`Break down · +${HERO_GEAR.salvage(g)} Wishstone`, { type: 'keepSalvage', ids: [g.id] }, { disabled: g.hero != null || g.locked, title: g.hero != null ? 'Take it off first' : g.locked ? 'Unlock it first' : 'Gone for good' });
    box.appendChild(row);
    root.appendChild(box);
  }
}
