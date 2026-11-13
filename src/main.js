// Entry point: wires the simulation, renderer, HUD, input, audio and saving
// together, and runs the main loop.
import { CONFIG } from './config.js';
import { World } from './sim/world.js';
import { CLASSES, CLASS_IDS } from './sim/classes.js';
import { AUGMENTS } from './sim/augments.js';
import { Renderer } from './render/renderer.js';
import { Hud, Tooltip, svg } from './ui/hud.js';
import { Inventory } from './ui/inventory.js';
import { Town } from './ui/town.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Music } from './music/player.js';
import { MAP_SONG, BOSS_SONG } from './music/songs.js';
import { MAPS, MAP_IDS } from './sim/maps.js';
import { BOSSES, ENEMIES } from './sim/defs.js';
import { QUESTS, QUEST_IDS, NPCS, SIGNS, SIGN_IDS } from './sim/story.js';
import { SPECS, specsFor, ROW_NEED, talentPointsAt } from './sim/talents.js';
import { goalText } from './ui/hud.js';
import { RARITIES, itemName } from './sim/items.js';
import { loadSave, storeSave, clearSave, loadSettings, storeSettings, loadAccount, storeAccount , exportSaves, exportCode, parseSaves, importSaves, describeSaves } from './save.js';
import { WEAPONS } from './sim/items.js';
import { HostRoom, JoinRoom, cleanCode } from './net/room.js';
import { makeSnapshot, applySnapshot, eventFor } from './net/sync.js';

const $ = (id) => document.getElementById(id);
const SLOT_LABEL = { q: 'Cleave', w: 'Whirlwind', e: 'Lunge', r: 'Skyfall', parry: 'Parry', hero: 'Hero' };

function start(hot = {}) {
  const canvas = $('game');
  let renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (err) {
    $('title-save').textContent = 'This game needs WebGL, which this browser or device has turned off. Try a current version of Chrome, Edge or Firefox.';
    $('btn-new').disabled = true;
    console.error(err);
    return;
  }

  const sfx = new Sfx();
  const tooltip = new Tooltip();

  const settings = Object.assign(loadSettings(), hot.settings || {});
  if (!CONFIG.PARRY_PRESETS[settings.parryPreset]) settings.parryPreset = CONFIG.DEFAULT_PARRY_PRESET;
  sfx.setVolume(settings.volume);
  sfx.setMuted(settings.muted);
  // Background music: one original theme per map, plus the arena's battle theme.
  const music = new Music();
  music.setVolume(settings.musicVolume ?? 0.45);
  music.setMuted(settings.muted);
  // Browsers only allow sound after a click, so the first click anywhere switches audio on.
  window.addEventListener('pointerdown', () => {
    sfx.unlock();
    music.attach(sfx.ctx);
  });
  renderer.setShadows(settings.shadows);

  // One character per class, used in both exploration and the arena.
  if (!CLASSES[settings.cls]) settings.cls = 'warrior';
  let save = hot.save || loadSave(settings.cls);
  // Gold and arena tickets belong to the account, so both characters share them.
  const account = hot.account || loadAccount() || { gold: save?.gold || 0, tickets: CONFIG.START_TICKETS };
  function makeWorld(opts) {
    const w = new World(Object.assign({ parryPreset: settings.parryPreset, cls: settings.cls }, opts));
    renderer.setHeroClass(w.cls);
    w.player.gold = account.gold;
    w.player.tickets = account.tickets;
    return w;
  }
  let world = makeWorld({ save });

  // mode: 'title' | 'town' | 'play' | 'pause' | 'gear' | 'augment' | 'defeat'
  let mode = 'title';
  let gearReturn = 'play';
  let talkTo = null; // the person being talked to
  let reading = null; // the sign being read
  let talkNote = ''; // what they say after you hand a quest in
  let freeze = 0; // brief hit-stop after a parry
  // Multiplayer: null alone; { role: 'host' | 'client', room, pid, code, ... } in a room.
  let net = null;
  let acc = 0;
  let last = performance.now();
  let defeatTimer = null;
  let offerAt = 0; // when to show a waiting augment offer
  const hints = {};

  // ---------------------------------------------------------------- saving
  function persist() {
    if (net && net.role === 'client') return; // the host sends this player's save (see onNetMessage)
    account.gold = world.player.gold;
    account.tickets = world.player.tickets;
    storeAccount(account);
    save = world.toSave();
    storeSave(save, world.cls);
  }
  window.claude?.hot?.snapshot?.(() => {
    if (mode !== 'title') persist();
    return { save, account, settings };
  });

  /**
   * Apply a command straight away. Used by menus (gear, town, augment pick),
   * where the fight is not stepping, so a queued command would never run.
   */
  function applyNow(cmd) {
    world.command(cmd);
    world.runCommands();
    drainEvents();
    persist();
    if (mode === 'gear') inventory.render(world);
    else if (mode === 'town') town.render(world);
    else if (mode === 'augment') renderOffer();
    else if (mode === 'talk') renderTalk();
    else if (mode === 'talents') renderTalents();
    hud.setGearBadge(Inventory.upgradeCount(world));
    talentBadge();
  }

  const hud = new Hud(tooltip, (cmd) => world.command(cmd));
  const inventory = new Inventory(tooltip, applyNow);
  const town = new Town(tooltip, applyNow, (startWave) => startRun(save, startWave));

  /** Pick the music for where the player is right now. */
  function tune() {
    let id;
    if (mode === 'defeat') id = null;
    else if (mode === 'title' || mode === 'town' || (mode === 'gear' && gearReturn === 'town')) id = 'haven';
    else if (world.mode === 'explore') id = MAP_SONG[world.map.theme];
    else if (world.wave.phase === 'active' && world.wave.n % CONFIG.BOSS_EVERY === 0) id = BOSS_SONG[BOSSES[(world.wave.n / CONFIG.BOSS_EVERY - 1) % BOSSES.length]]; // each boss brings its own theme
    else id = 'arena';
    music.play(id);
  }

  // ----------------------------------------------------------------- modes
  function setMode(next) {
    mode = next;
    document.body.dataset.mode = mode;
    document.body.dataset.from = mode === 'gear' ? gearReturn : '';
    // Drop keyboard focus from buttons so Space parries instead of re-clicking one.
    if (mode === 'play' && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    for (const id of ['title', 'town', 'pause', 'defeat', 'augment', 'travel', 'talk', 'read', 'journal', 'talents', 'transfer', 'mp']) $(id).classList.toggle('hidden', mode !== id);
    $('inventory').classList.toggle('hidden', mode !== 'gear');
    tooltip.hide();
    if (mode === 'gear') inventory.render(world);
    if (mode === 'town') town.render(world);
    if (mode === 'augment') renderOffer();
    if (mode === 'travel') renderTravel();
    if (mode === 'talk') renderTalk();
    if (mode === 'read') renderRead();
    if (mode === 'journal') renderJournal();
    if (mode === 'talents') renderTalents();
    talentBadge();
    if (mode === 'title') refreshTitle();
    tune();
    if (mode === 'pause') $('btn-town').textContent = net ? (net.role === 'host' ? 'Close the room and go to the title screen' : 'Leave the room') : world.mode === 'explore' ? 'Save and go to the title screen' : 'Return to town';
    if (mode === 'pause') $('btn-wipe').classList.toggle('hidden', !!net);
    last = performance.now();
  }

  function refreshTitle() {
    const has = !!save;
    const c = CLASSES[settings.cls];
    for (const b of $('class-picker').children) b.setAttribute('aria-pressed', b.dataset.cls === settings.cls ? 'true' : 'false');
    $('class-desc').textContent = `${c.role}. ${c.blurb}`;
    $('btn-explore').textContent = has ? `Explore · ${c.name} level ${save.level}` : `Explore as ${c.name}`;
    $('btn-continue').classList.toggle('hidden', !has);
    if (has) $('btn-continue').textContent = 'Arena town';
    const fresh = $('btn-new');
    fresh.textContent = has ? `Start a new ${c.name}` : 'Enter the arena · 1 ticket';
    fresh.dataset.armed = '';
    $('title-save').textContent = `${account.gold} gold · ${account.tickets} arena ticket${account.tickets === 1 ? '' : 's'}. Each class is one character, used in both exploration and the arena. Gold and tickets are shared by every class. Progress is saved in this browser.`;
  }

  function resetViews() {
    clearTimeout(defeatTimer);
    renderer.reset();
    hud.reset();
    hud.setGearBadge(Inventory.upgradeCount(world));
    acc = 0;
    freeze = 0;
    offerAt = 0;
  }

  /** Start a run in the arena. `startWave` must be a checkpoint the save has reached. */
  function startRun(fromSave, startWave) {
    if (account.tickets <= 0) {
      $('title-save').textContent = 'You have no arena tickets. Enemies in Explore drop them.';
      return;
    }
    account.tickets--; // every arena run costs one ticket
    storeAccount(account);
    world = makeWorld({ save: fromSave, startWave });
    renderer.setEnvironment('arena');
    resetViews();
    sfx.unlock();
    setMode('play');
  }

  /** Go to town. The world there is the saved character standing in an empty arena. */
  function enterTown() {
    if (mode !== 'title') persist();
    world = makeWorld({ save });
    renderer.setEnvironment('arena');
    resetViews();
    sfx.unlock();
    town.lastCache = null;
    setMode('town');
  }

  /** Exploration: the open map, played by the explorer character. */
  function startExplore(fresh) {
    if (mode !== 'title' && !fresh) persist();
    world = makeWorld({ save, mode: 'explore' });
    renderer.setMap(world.map);
    resetViews();
    sfx.unlock();
    setMode('play');
    
    hintOnce('explore', 'Haven is safe and heals you. Stand in the blue portal to travel to the Greenwood Trail.', 10);
  }

  // --------------------------------------------------------------- augments
  function renderOffer() {
    const offer = world.offer;
    const root = $('augment-cards');
    root.innerHTML = '';
    if (!offer) return;
    $('augment-eyebrow').textContent = offer.boss ? 'Boss defeated · stronger augments' : `Wave ${world.wave.cleared} cleared`;
    offer.choices.forEach((id, i) => {
      const a = AUGMENTS[id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'aug-card' + (a.tier === 2 ? ' strong' : '');
      card.innerHTML = `<span class="aug-key"><kbd>${i + 1}</kbd></span>${svg(world.kit[a.slot]?.icon || a.slot)}<span class="aug-slot">${world.kit[a.slot]?.name || SLOT_LABEL[a.slot]}${a.tier === 2 ? ' · rare' : ''}</span><span class="aug-name">${a.name}</span><span class="aug-desc">${a.desc}</span>`;
      card.addEventListener('click', () => applyNow({ type: 'augment', id }));
      root.appendChild(card);
    });
    const reroll = $('btn-reroll');
    reroll.textContent = world.rerolls > 0 ? `Reroll these three (${world.rerolls} left this run)` : 'No rerolls left this run';
    reroll.disabled = world.rerolls <= 0;
  }

  /** The Waygate's list: every map in order, with the ones not yet reached locked. */
  function renderTravel() {
    const list = $('travel-list');
    list.innerHTML = '';
    const p = world.player;
    for (const id of MAP_IDS) {
      const m = MAPS[id];
      if (m.safe) continue;
      const known = p.visited.includes(id);
      const top = m.level + m.levelSpan + (m.boss ? 1 : 0);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'travel-row' + (known && p.level >= m.level - 2 && p.level <= top ? ' fit' : '');
      btn.disabled = !known;
      btn.innerHTML = `<b>${known ? m.name : '???'}</b><span class="lv">Levels ${m.level} to ${top}</span><span>${known ? (p.level > top ? 'You have outgrown this map' : p.level < m.level - 2 ? 'Dangerous at your level' : 'A good match for your level') + (m.boss ? ' · a boss waits in the middle' : '') : 'Not discovered yet'}</span>`;
      btn.addEventListener('click', () => {
        setMode('play');
        applyNow({ type: 'travel', to: id });
      });
      list.appendChild(btn);
    }
  }

  // ------------------------------------------------- story: people, signs, journal
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function rewardText(id) {
    const r = world.questReward(id);
    const parts = [];
    if (r.item !== null) parts.push(`<span style="color:${RARITIES[r.item].color}">${RARITIES[r.item].name} ${r.slot ? (r.slot === 'weapon' ? 'weapon' : r.slot) : 'gear'}</span>`);
    if (r.exp) parts.push(`${r.exp.toLocaleString()} EXP`);
    if (r.gold) parts.push(`${r.gold.toLocaleString()} gold`);
    if (r.scrap) parts.push(`${r.scrap} scrap`);
    if (r.keys) parts.push(`${r.keys} Warden key${r.keys > 1 ? 's' : ''}`);
    if (r.tickets) parts.push(`${r.tickets} arena ticket`);
    if (r.skill) parts.push(`${r.skill} skill points`);
    return parts.join(' · ');
  }

  function renderTalk() {
    const npc = NPCS[talkTo];
    if (!npc) return;
    $('talk-role').textContent = npc.role;
    $('talk-name').textContent = npc.name;
    const list = $('talk-quests');
    list.innerHTML = '';
    let shown = 0, later = null;
    for (const id of QUEST_IDS) {
      const q = QUESTS[id];
      if (q.giver !== talkTo) continue;
      const st = world.questState(id);
      const open = world.questOpen(id);
      if (!open && !(st === 'active' || st === 'ready')) {
        // Not on offer yet. Remember the next one that only needs more levels.
        if (!st && (!q.after || world.questState(q.after) === 'done') && (later === null || q.level < later)) later = q.level;
        continue;
      }
      shown++;
      const el = document.createElement('div');
      el.className = 'quest' + (st === 'ready' ? ' ready' : '');
      const need = world.questNeed(q);
      const prog = st === 'active' && need > 1 ? ` · ${world.player.quests[id].n}/${need}` : '';
      el.innerHTML = `<h4>${esc(q.name)}<small>level ${q.level}</small></h4><p>${esc(st === 'ready' ? q.done : q.offer)}</p><div class="goal">${goalText(q)}${prog}</div><div class="rewards">Reward: ${rewardText(id)}</div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      if (st === 'ready') {
        btn.className = 'primary';
        btn.textContent = 'Take the reward';
        btn.addEventListener('click', () => { talkNote = ''; applyNow({ type: 'claimQuest', id }); });
      } else if (st === 'active') {
        btn.className = 'ghost';
        btn.textContent = 'In progress';
        btn.disabled = true;
      } else {
        btn.className = 'primary';
        btn.textContent = 'Accept';
        btn.addEventListener('click', () => applyNow({ type: 'acceptQuest', id }));
      }
      el.appendChild(btn);
      list.appendChild(el);
    }
    $('talk-line').textContent = talkNote || (shown ? npc.greet : npc.idle + (later !== null && world.player.level < later - 4 ? ` (More at level ${later - 4}.)` : ''));
  }

  function renderRead() {
    const sg = SIGNS[reading];
    if (!sg) return;
    $('read-where').textContent = MAPS[sg.map].name;
    $('read-title').textContent = sg.title;
    $('read-text').textContent = sg.text;
    $('read-note').textContent = `Added to your journal (${world.player.signs.length} of ${SIGN_IDS.length} found). Press J to read them again.`;
  }

  function renderJournal() {
    const p = world.player;
    const qs = [];
    let done = 0;
    for (const id of QUEST_IDS) {
      const st = p.quests[id];
      const q = QUESTS[id];
      if (!st) continue;
      if (st.s === 'done') { done++; continue; }
      const need = world.questNeed(q);
      qs.push(`<div class="quest ${st.s === 'ready' ? 'ready' : ''}"><h4>${esc(q.name)}<small>${NPCS[q.giver].name}</small></h4><div class="goal">${st.s === 'ready' ? 'Done. Return to ' + NPCS[q.giver].name + ' in Haven.' : goalText(q) + (need > 1 ? ` · ${st.n}/${need}` : '')}</div><div class="rewards">Reward: ${rewardText(id)}</div></div>`);
    }
    const waiting = ['wren', 'bram', 'odile', 'pip'].filter((n) => world.npcMarker(n) === '!').map((n) => NPCS[n].name);
    $('journal-quests').innerHTML = (qs.join('') || '<p class="setting-desc">No quests in hand.</p>')
      + (waiting.length ? `<p class="setting-desc">Work waiting in Haven: ${waiting.join(', ')}.</p>` : '')
      + `<p class="setting-desc">${done} quest${done === 1 ? '' : 's'} completed.</p>`;
    $('journal-lore-head').textContent = `What the road remembers · ${p.signs.length} of ${SIGN_IDS.length}`;
    $('journal-lore').innerHTML = SIGN_IDS.map((id) => {
      const sg = SIGNS[id];
      return p.signs.includes(id)
        ? `<div class="lore"><b>${esc(sg.title)}</b><small>${MAPS[sg.map].name}</small><p>${esc(sg.text)}</p></div>`
        : `<div class="lore missing"><b>Not found yet</b><small>${p.visited.includes(sg.map) ? MAPS[sg.map].name : 'Somewhere further up the road'}</small></div>`;
    }).join('');
  }

  // --------------------------------------------------------- subclasses and talents
  function talentBadge() {
    const p = world.player;
    const n = !p.spec && p.level >= CONFIG.SPEC_LEVEL ? '!' : p.spec ? world.talentPoints() : 0;
    const b = $('talent-badge');
    b.textContent = n;
    b.classList.toggle('hidden', !n);
  }

  function renderTalents() {
    const p = world.player;
    const body = $('talents-body');
    const respec = $('btn-respec');
    body.innerHTML = '';
    respec.classList.add('hidden');
    const clsName = CLASSES[world.cls].name;
    if (!p.spec) {
      $('talents-title').textContent = 'Choose a subclass';
      $('talents-sub').textContent = p.level < CONFIG.SPEC_LEVEL
        ? `At level ${CONFIG.SPEC_LEVEL} your ${clsName} picks one of these two paths. You are level ${p.level}.`
        : `Your ${clsName} is ready to specialise. From level ${CONFIG.TALENT_LEVEL} you earn a talent point every ${CONFIG.TALENT_EVERY} levels. You can change your mind later for gold.`;
      const wrap = document.createElement('div');
      wrap.className = 'spec-pick';
      for (const id of specsFor(world.cls)) {
        const sp = SPECS[id];
        const card = document.createElement('div');
        card.className = 'spec-card';
        card.innerHTML = `<h3>${sp.name}</h3><p>${sp.blurb}</p><ul>${sp.talents.map((t) => `<li><b>${t.name}</b>: ${t.desc(t.max)}</li>`).join('')}</ul>`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'primary';
        btn.textContent = `Become ${/^[AEIOU]/.test(sp.name) ? 'an' : 'a'} ${sp.name}`;
        btn.disabled = p.level < CONFIG.SPEC_LEVEL;
        btn.addEventListener('click', () => applyNow({ type: 'chooseSpec', id }));
        card.appendChild(btn);
        wrap.appendChild(card);
      }
      body.appendChild(wrap);
      return;
    }
    const sp = SPECS[p.spec];
    const spent = world.talentsSpent();
    const pts = world.talentPoints();
    $('talents-title').textContent = sp.name;
    const nextAt = p.level < CONFIG.TALENT_LEVEL ? CONFIG.TALENT_LEVEL : p.level + CONFIG.TALENT_EVERY - ((p.level - CONFIG.TALENT_LEVEL) % CONFIG.TALENT_EVERY);
    $('talents-sub').textContent = `${sp.blurb}  ${pts} point${pts === 1 ? '' : 's'} to spend, ${spent} spent.` + (nextAt <= CONFIG.MAX_LEVEL ? ` Next point at level ${nextAt}.` : '');
    for (const [row, title] of [['minor', 'Foundations'], ['major', `Techniques · opens after ${ROW_NEED.major} points`], ['capstone', `Mastery · opens after ${ROW_NEED.capstone} points`]]) {
      const sec = document.createElement('div');
      sec.className = 'tal-row' + (spent < ROW_NEED[row] ? ' locked' : '');
      sec.innerHTML = `<h3>${title}</h3>`;
      const grid = document.createElement('div');
      grid.className = 'tal-grid';
      for (const t of sp.talents.filter((x) => x.row === row)) {
        const r = p.talents[t.id] || 0;
        const el = document.createElement('div');
        el.className = 'tal' + (r >= t.max ? ' full' : '');
        el.innerHTML = `<b>${t.name}<small>${r}/${t.max}</small></b>` + (r > 0 ? `<span>${t.desc(r)}</span>` : '') + (r < t.max ? `<span class="next">${r > 0 ? 'Next: ' : ''}${t.desc(r + 1)}</span>` : '');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ghost';
        const block = world.talentBlock(t.id);
        btn.textContent = block === 'max' ? 'Max' : '+1';
        btn.disabled = !!block;
        btn.addEventListener('click', () => applyNow({ type: 'talent', id: t.id }));
        el.appendChild(btn);
        grid.appendChild(el);
      }
      sec.appendChild(grid);
      body.appendChild(sec);
    }
    respec.classList.remove('hidden');
    respec.textContent = `Forget this path and choose again · ${world.respecCost().toLocaleString()} gold`;
    respec.disabled = p.gold < world.respecCost();
  }

  // ================================================================ multiplayer
  const mpMsg = (text, ok) => {
    const el = $('mp-msg');
    el.textContent = text;
    el.className = 'setting-desc ' + (ok === undefined ? '' : ok ? 'ok' : 'bad');
  };
  function playerName() {
    const n = ($('mp-name').value || '').trim().slice(0, 16) || settings.name || 'Player';
    settings.name = n;
    storeSettings(settings);
    return n;
  }
  function updateRoomBadge() {
    hud.setRoom(net ? { code: net.code, players: net.role === 'host' ? world.heroes.length : (world.allies().length + 1), host: net.role === 'host' } : null);
  }
  function openMp() {
    if (!settings.name) settings.name = 'Player ' + Math.floor(100 + Math.random() * 900);
    $('mp-name').value = settings.name;
    const c = CLASSES[settings.cls];
    $('mp-host-desc').textContent = `You play your ${c.name}${save ? ' (level ' + save.level + ')' : ''}; friends bring their own characters. Your browser runs the game for everyone, so keep this tab open.`;
    mpMsg('');
    setMode('mp');
  }

  /** Commands a joiner may send: everything a hero can do out in the world. */
  const FRIEND_CMDS = new Set(['move', 'attack', 'stop', 'cast', 'parry', 'potion', 'equip', 'discard', 'scrap', 'upgrade', 'rankUp', 'acceptQuest', 'claimQuest', 'readSign', 'chooseSpec', 'talent', 'respec', 'travel']);

  async function hostGame() {
    const name = playerName();
    mpMsg('Opening a room...');
    $('btn-host').disabled = true;
    const room = new HostRoom({
      onJoin(pid, hello) {
        if (!net || world.mode !== 'explore') return 'The host is not exploring right now.';
        world.addHero(pid, hello);
        return true;
      },
      onCmd(pid, cmd) {
        if (FRIEND_CMDS.has(cmd.type) && world.heroByPid(pid)) world.command(Object.assign({}, cmd, { pid }));
      },
      onLeave(pid) {
        world.removeHero(pid);
      },
      onError(why) {
        hud.feedText(why);
      },
    });
    let code;
    try {
      code = await room.open();
    } catch (err) {
      $('btn-host').disabled = false;
      mpMsg(err.message, false);
      return;
    }
    $('btn-host').disabled = false;
    startExplore();
    world.cur.name = name;
    net = { role: 'host', room, pid: 0, code, tick: 0 };
    updateRoomBadge();
    hud.banner(`Room ${code}`, 'Tell your friends this code. They join from "Play with friends".');
    hud.feedText(`Hosting room ${code}. Click the room code at the top to copy it.`);
  }

  /** Host: after every step, queue events for each friend; send snapshots 20 times a second and saves every few seconds. */
  function hostTick() {
    if (!net || net.role !== 'host') return;
    net.tick++;
    const events = world.events;
    for (const [pid, f] of net.room.friends) {
      if (!f.pending) f.pending = [];
      for (const ev of events) if (eventFor(ev, pid) && ev.type !== 'mapChange') f.pending.push(ev);
    }
    if (net.tick % 3 === 0) {
      for (const [pid, f] of net.room.friends) {
        const snap = makeSnapshot(world, pid, f.memo);
        if (!snap) continue;
        snap.ev = f.pending || [];
        f.pending = [];
        net.room.sendTo(pid, snap);
      }
    }
    if (net.tick % 300 === 0) {
      for (const pid of net.room.friends.keys()) {
        const h = world.heroByPid(pid);
        if (h) net.room.sendTo(pid, { t: 'save', save: world.as(h, () => world.toSave()), gold: h === world.cur ? world.player.gold : h.player.gold, tickets: h.player.tickets });
      }
      persist();
    }
  }

  async function joinGame() {
    const code = cleanCode($('mp-code').value);
    if (code.length !== 5) {
      mpMsg('A room code has five letters and numbers.', false);
      return;
    }
    const name = playerName();
    mpMsg(`Joining room ${code}...`);
    $('btn-join').disabled = true;
    const room = new JoinRoom({ onMessage: onNetMessage, onClose: (why) => leaveRoom(why) });
    let welcome;
    try {
      welcome = await room.join(code, { name, save, cls: settings.cls, parry: settings.parryPreset, gold: account.gold, tickets: account.tickets });
    } catch (err) {
      $('btn-join').disabled = false;
      mpMsg(err.message, false);
      return;
    }
    $('btn-join').disabled = false;
    // This browser's world becomes a picture of the host's: it never steps, and commands go to the host.
    world = makeWorld({ save, mode: 'explore' });
    world.command = (cmd) => room.send({ t: 'cmd', cmd });
    world.runCommands = () => {};
    world.step = () => {};
    world.cur.name = name;
    world.alliesList = [];
    net = { role: 'client', room, pid: welcome.pid, code, snapAt: performance.now(), snapGap: 50 };
    renderer.setMap(world.map);
    resetViews();
    sfx.unlock();
    setMode('play');
    updateRoomBadge();
    hud.banner(`Room ${code}`, 'Joined the party');
  }

  /** Hosting: the world keeps running for everyone, even while this player is in a menu. */
  function hostAdvance(dt) {
    acc += dt;
    let steps = 0;
    while (acc >= CONFIG.TICK && steps < 15) {
      world.step(CONFIG.TICK);
      acc -= CONFIG.TICK;
      steps++;
      hostTick();
      drainEvents();
    }
    if (steps >= 15) acc = 0;
    freeze = 0;
  }
  // Browsers stop drawing a hidden tab, which would freeze the game for the whole party
  // if the host switched windows. While hidden, a timer keeps the world running instead.
  setInterval(() => {
    if (!net || net.role !== 'host' || !document.hidden || mode === 'title' || mode === 'mp') return;
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    hostAdvance(dt);
  }, 50);

  function onNetMessage(msg) {
    if (!net || net.role !== 'client') return;
    if (msg.t === 'snap') {
      const now = performance.now();
      net.snapGap = Math.max(30, Math.min(200, net.snapGap * 0.8 + (now - net.snapAt) * 0.2));
      net.snapAt = now;
      const allies = world.alliesList ? world.alliesList.length : 0;
      if (applySnapshot(world, msg)) world.events.push({ type: 'mapChange', id: world.map.id, name: world.map.name, from: null, hero: net.pid });
      for (const ev of msg.ev || []) world.events.push(ev);
      if (world.alliesList.length !== allies) updateRoomBadge();
      if (msg.heavy) refreshMenus();
    } else if (msg.t === 'save') {
      save = msg.save;
      storeSave(save, world.cls);
      account.gold = msg.gold;
      account.tickets = msg.tickets;
      storeAccount(account);
    } else if (msg.t === 'closed') leaveRoom('The host closed the room.');
  }

  /** Leave (or close) the room. Progress is already saved. */
  function leaveRoom(why) {
    if (!net) return;
    const was = net;
    net = null;
    if (was.role === 'host') {
      for (const pid of was.room.friends.keys()) {
        const h = world.heroByPid(pid);
        if (h) was.room.sendTo(pid, { t: 'save', save: world.as(h, () => world.toSave()), gold: h.player.gold, tickets: h.player.tickets });
      }
      persist();
    }
    was.room.close();
    hud.setRoom(null);
    save = loadSave(settings.cls);
    world = makeWorld({ save });
    resetViews();
    setMode('title');
    $('title-save').textContent = why;
  }

  function refreshMenus() {
    if (mode === 'gear') inventory.render(world);
    else if (mode === 'talk') renderTalk();
    else if (mode === 'talents') renderTalents();
    else if (mode === 'journal') renderJournal();
    hud.setGearBadge(Inventory.upgradeCount(world));
    talentBadge();
  }

  $('btn-mp').addEventListener('click', openMp);
  $('btn-mp-close').addEventListener('click', () => setMode('title'));
  $('btn-host').addEventListener('click', hostGame);
  $('btn-join').addEventListener('click', joinGame);
  $('mp-code').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') joinGame();
  });
  $('mp-name').addEventListener('keydown', (e) => e.stopPropagation());
  $('room-badge').addEventListener('click', async () => {
    if (!net) return;
    try {
      await navigator.clipboard.writeText(net.code);
      hud.feedText(`Room code ${net.code} copied`);
    } catch (err) {
      hud.feedText(`Room code: ${net.code}`);
    }
  });
  window.addEventListener('beforeunload', () => {
    if (net) net.room.close();
  });

  const actions = {
    /** G: talk to the person, or read the sign, you are standing next to. */
    interact() {
      if (mode !== 'play') return;
      const near = world.interactable();
      if (!near) return;
      world.command({ type: 'stop' });
      sfx.ui();
      if (near.kind === 'npc') {
        talkTo = near.id;
        talkNote = '';
        setMode('talk');
      } else {
        reading = near.id;
        applyNow({ type: 'readSign', id: near.id });
        setMode('read');
      }
    },
    toggleJournal() {
      if (mode === 'play') setMode('journal');
      else if (mode === 'journal') setMode('play');
      else return;
      sfx.ui();
    },
    toggleTalents() {
      if (mode === 'play') setMode('talents');
      else if (mode === 'talents') setMode('play');
      else return;
      sfx.ui();
    },
    toggleInventory() {
      if (mode === 'play' || mode === 'defeat' || mode === 'town') {
        gearReturn = mode;
        setMode('gear');
        sfx.ui();
      } else if (mode === 'gear') {
        setMode(gearReturn);
        sfx.ui();
      }
    },
    togglePause() {
      if (mode === 'play') setMode('pause');
      else if (['pause', 'travel', 'talk', 'read', 'journal', 'talents'].includes(mode)) setMode('play');
      else if (mode === 'transfer' || mode === 'mp') setMode('title');
      else if (mode === 'gear') setMode(gearReturn);
    },
    toggleMute() {
      settings.muted = !settings.muted;
      sfx.setMuted(settings.muted);
      music.setMuted(settings.muted);
      storeSettings(settings);
      hud.feedText(settings.muted ? 'Sound off' : 'Sound on');
    },
    /** Keys that belong to an open menu. Returns true if the key was used. */
    menuKey(key) {
      if (mode !== 'augment' || !world.offer) return false;
      const i = ['1', '2', '3'].indexOf(key);
      if (i >= 0 && world.offer.choices[i]) {
        applyNow({ type: 'augment', id: world.offer.choices[i] });
        return true;
      }
      return false;
    },
  };

  const input = new Input({
    canvas,
    renderer,
    getWorld: () => world,
    isPlaying: () => mode === 'play',
    actions,
  });

  // --------------------------------------------------------------- buttons
  const armThenRun = (btn, armedText, run) => {
    if (btn.dataset.armed === '1') {
      btn.dataset.armed = '';
      run();
    } else {
      btn.dataset.armed = '1';
      btn.dataset.label = btn.textContent;
      btn.textContent = armedText;
      setTimeout(() => {
        if (btn.dataset.armed === '1') {
          btn.dataset.armed = '';
          btn.textContent = btn.dataset.label;
        }
      }, 4000);
    }
  };
  const wipe = () => {
    const exploring = world.mode === 'explore' && mode !== 'title';
    clearSave(world.cls);
    save = null;
    if (exploring) startExplore(true);
    else startRun(null);
  };

  // Class picker on the title screen. Each class is a separate character.
  function selectClass(id) {
    settings.cls = id;
    storeSettings(settings);
    save = loadSave(id);
    world = makeWorld({ save });
    resetViews();
    refreshTitle();
  }
  for (const id of CLASS_IDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.cls = id;
    b.textContent = CLASSES[id].name;
    b.addEventListener('click', () => selectClass(id));
    $('class-picker').appendChild(b);
  }

  $('btn-explore').addEventListener('click', () => startExplore());
  $('btn-continue').addEventListener('click', () => enterTown());
  $('btn-new').addEventListener('click', (e) => {
    if (!save) startRun(null);
    else armThenRun(e.currentTarget, 'Click again to delete your saved character', wipe);
  });
  $('btn-resume').addEventListener('click', () => setMode('play'));
  $('btn-travel-close').addEventListener('click', () => setMode('play'));

  // --------------------------------------------- moving saves between browsers
  const transferMsg = (text, ok) => {
    const el = $('transfer-msg');
    el.textContent = text;
    el.className = 'setting-desc ' + (ok ? 'ok' : 'bad');
  };
  $('btn-transfer').addEventListener('click', () => {
    persist();
    transferMsg('', true);
    $('import-code').value = '';
    setMode('transfer');
  });
  $('btn-transfer-close').addEventListener('click', () => setMode('title'));
  $('btn-export-file').addEventListener('click', () => {
    persist();
    const blob = new Blob([JSON.stringify(exportSaves(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stunned-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    transferMsg('Save file downloaded. If nothing appeared, use "Copy save code" instead.', true);
  });
  $('btn-export-code').addEventListener('click', async () => {
    persist();
    const code = exportCode();
    $('import-code').value = code;
    try {
      await navigator.clipboard.writeText(code);
      transferMsg('Save code copied. Paste it into the box on the other browser and press "Import pasted code".', true);
    } catch (err) {
      $('import-code').select();
      transferMsg('Your browser blocked copying, so the code is in the box below: select it all and copy it.', true);
    }
  });
  let pending = null; // a save checked and waiting for the second click
  const tryImport = (text, btn) => {
    let obj;
    try {
      obj = parseSaves(text);
    } catch (err) {
      transferMsg(err.message, false);
      return;
    }
    if (pending !== text) {
      pending = text;
      transferMsg(`Found: ${describeSaves(obj)}. Press "Import pasted code" to replace this browser's saves with it.`, true);
      return;
    }
    pending = null;
    if (!importSaves(obj)) {
      transferMsg('This browser would not let the game save (private window?). Nothing was changed.', false);
      return;
    }
    Object.assign(settings, loadSettings());
    const acc = loadAccount();
    if (acc) Object.assign(account, acc);
    if (!CLASS_IDS.includes(settings.cls)) settings.cls = 'warrior';
    save = loadSave(settings.cls);
    world = makeWorld({ save });
    resetViews();
    transferMsg(`Imported: ${describeSaves(obj)}.`, true);
    refreshTitle();
  };
  $('btn-import-code').addEventListener('click', (e) => tryImport($('import-code').value, e.currentTarget));
  $('btn-import-file').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const text = await f.text();
    pending = null;
    $('import-code').value = text;
    tryImport(text); // checks it and asks for one more click on "Import pasted code" to confirm
  });
  for (const id of ['btn-talk-close', 'btn-read-close', 'btn-journal-close', 'btn-talents-close']) $(id).addEventListener('click', () => setMode('play'));
  $('btn-journal').addEventListener('click', () => actions.toggleJournal());
  $('btn-talents').addEventListener('click', () => actions.toggleTalents());
  $('btn-respec').addEventListener('click', (e) => armThenRun(e.currentTarget, 'Click again to reset your talents', () => applyNow({ type: 'respec' })));
  $('btn-town').addEventListener('click', () => {
    if (net) {
      leaveRoom(net.role === 'host' ? 'You closed the room.' : 'You left the room.');
      return;
    }
    if (world.mode === 'explore') {
      persist();
      setMode('title');
    } else enterTown();
  });
  $('btn-wipe').addEventListener('click', (e) => armThenRun(e.currentTarget, 'Click again to delete everything', wipe));
  $('btn-retry').addEventListener('click', () => startRun(save));
  $('btn-defeat-town').addEventListener('click', () => enterTown());
  $('btn-defeat-gear').addEventListener('click', () => actions.toggleInventory());
  $('btn-gear').addEventListener('click', () => actions.toggleInventory());
  $('btn-menu').addEventListener('click', () => actions.togglePause());
  $('inv-close').addEventListener('click', () => actions.toggleInventory());
  $('town-gear').addEventListener('click', () => actions.toggleInventory());
  $('town-title').addEventListener('click', () => {
    persist();
    setMode('title');
  });
  $('btn-reroll').addEventListener('click', () => applyNow({ type: 'reroll' }));

  // Settings controls
  const presetRoot = $('parry-presets');
  const refreshPresets = () => {
    for (const b of presetRoot.children) b.setAttribute('aria-pressed', b.dataset.key === settings.parryPreset ? 'true' : 'false');
    const pr = CONFIG.PARRY_PRESETS[settings.parryPreset];
    $('parry-desc').textContent = `You have ${Math.round(pr.window * 1000)} ms to catch a hit after pressing Space. A missed parry locks you out for ${pr.cooldown.toFixed(2)} s.`;
  };
  for (const key in CONFIG.PARRY_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.key = key;
    b.textContent = CONFIG.PARRY_PRESETS[key].label;
    b.addEventListener('click', () => {
      settings.parryPreset = key;
      world.parryPreset = key;
      storeSettings(settings);
      refreshPresets();
    });
    presetRoot.appendChild(b);
  }
  refreshPresets();
  $('volume').value = Math.round(settings.volume * 100);
  $('volume').addEventListener('input', (e) => {
    settings.volume = e.target.value / 100;
    sfx.setVolume(settings.volume);
    storeSettings(settings);
  });
  $('volume').addEventListener('change', () => sfx.parry(false));
  $('music-volume').value = Math.round((settings.musicVolume ?? 0.45) * 100);
  $('music-volume').addEventListener('input', (e) => {
    settings.musicVolume = e.target.value / 100;
    music.setVolume(settings.musicVolume);
    storeSettings(settings);
  });
  $('shadows').checked = settings.shadows;
  $('shadows').addEventListener('change', (e) => {
    settings.shadows = e.target.checked;
    renderer.setShadows(settings.shadows);
    storeSettings(settings);
  });

  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'play') setMode('pause');
    music.setPaused(document.hidden);
  });
  window.addEventListener('pagehide', () => {
    if (mode !== 'title') persist();
  });
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) {
    $('touch-note').classList.remove('hidden');
  }

  // ---------------------------------------------------------------- events
  function hintOnce(key, text, seconds) {
    if (hints[key]) return;
    hints[key] = true;
    hud.hint(text, seconds);
  }

  function handleEvent(ev) {
    renderer.onEvent(ev, world);
    const p = world.player;
    switch (ev.type) {
      case 'waveStart':
        tune();
        hud.banner(`Wave ${ev.n}`, ev.boss ? `${ev.bossName} enters the ring` : '');
        sfx.wave(ev.boss);
        if (ev.n === 1) hintOnce('move', 'Right-click the ground to move. Right-click an enemy to attack it.', 7);
        if (ev.boss) hintOnce('boss', 'Parry the boss three times to break its guard. Get clear of the red slam.', 9);
        break;
      case 'waveClear':
        tune();
        hud.banner(ev.boss ? 'The Warden falls' : 'Wave cleared', `+${ev.gold} gold${ev.boss ? ' · checkpoint saved' : ''}`);
        sfx.clear();
        persist();
        break;
      case 'noTarget':
        sfx.denied();
        hud.float(renderer, ev.x, 3.0, ev.z, 'No enemy in reach', 'word warn');
        break;
      case 'augmentOffer':
        offerAt = performance.now() + 1100; // let the "wave cleared" banner land first
        break;
      case 'augmentTaken':
        sfx.augment();
        hud.banner(AUGMENTS[ev.id].name, AUGMENTS[ev.id].desc);
        if (mode === 'augment') setMode('play');
        break;
      case 'windup':
        if (ev.parryable) hintOnce('parry', 'When an enemy flashes white, press SPACE to parry.', 8);
        else hintOnce('red', 'Red attacks cannot be parried. Walk out of the red area, or dash through with E.', 8);
        break;
      case 'parryStart':
        sfx.parryStart();
        break;
      case 'parry':
        sfx.parry(ev.perfect);
        hud.float(renderer, ev.x, 3.1, ev.z, ev.perfect ? 'Perfect parry' : 'Parry', ev.perfect ? 'word perfect' : 'word');
        hud.screenFlash(ev.perfect ? 0.3 : 0.12);
        hud.flashSlot('parry');
        freeze = 0.06;
        break;
      case 'slowStart':
        sfx.slow();
        hintOnce('slow', 'A perfect parry slows every enemy. You still move at full speed.', 5);
        break;
      case 'parryWhiff':
        sfx.whiff();
        break;
      case 'parryNotReady':
        sfx.denied();
        break;
      case 'unparryable':
        hud.float(renderer, ev.x, 3.1, ev.z, "Can't parry red", 'word warn');
        break;
      case 'stagger':
        sfx.stagger();
        hud.float(renderer, ev.x, 3.4, ev.z, 'Stunned', 'word stun');
        hintOnce('stun', 'Stunned enemies take 50% more damage. Strike now.', 5);
        break;
      case 'postureHit':
        hud.float(renderer, ev.x, 4.2, ev.z, 'Guard cracked', 'word stun');
        break;
      case 'reflect':
        hud.float(renderer, ev.x, 2.6, ev.z, 'Returned', 'word');
        break;
      case 'perfectDodge':
        sfx.dodge();
        hud.float(renderer, ev.x, 3.0, ev.z, 'Perfect dodge', 'word perfect');
        hud.flashSlot('e');
        hintOnce('dodge', 'Dodging an attack with Lunge gives you Lunge back almost at once.', 5);
        break;
      case 'dodge':
        hud.float(renderer, ev.x, 2.8, ev.z, 'Dodged', 'word');
        break;
      case 'cdReset':
        hud.flashSlot(ev.slot);
        break;
      case 'lightning':
        sfx.lightning();
        break;
      case 'undying':
        sfx.levelUp();
        hud.screenFlash(0.4);
        hud.float(renderer, ev.x, 3.2, ev.z, 'Undying', 'word perfect');
        break;
      case 'damage':
        if (ev.who === 'enemy') {
          if (!ev.dot) sfx.hit(ev.crit);
          hud.float(renderer, ev.x, 2.3, ev.z, ev.amount, ev.crit ? 'crit' : ev.dot ? 'dot' : '');
        } else {
          sfx.hurt();
          hud.float(renderer, ev.x, 2.6, ev.z, '-' + ev.amount, 'hurt');
        }
        break;
      case 'heal':
        hud.float(renderer, ev.x, 2.8, ev.z, '+' + ev.amount, 'heal');
        break;
      case 'swing':
        sfx.swing();
        break;
      case 'cast':
        sfx.cast(ev.slot);
        if (!ev.echo) hud.flashSlot(ev.slot);
        break;
      case 'impact':
        if (ev.kind === 'skyfall' || ev.kind === 'aftershock') sfx.impact();
        else sfx.slam();
        break;
      case 'strike':
        if (ev.shape === 'circle') sfx.slam();
        else if (ev.shape === 'shot') sfx.shoot();
        else sfx.swing();
        break;
      case 'death':
        sfx.death(ev.boss);
        break;
      case 'partyJoin':
        sfx.ui();
        hud.feedText(`${ev.name} joined the party`);
        updateRoomBadge();
        break;
      case 'partyLeave':
        hud.feedText(`${ev.name} left the party`);
        updateRoomBadge();
        break;
      case 'bossFall':
        hud.banner(`${ev.name} falls`, ev.first ? 'First victory: a guaranteed prize, and 2 skill points' : 'It will rise again in two minutes');
        hud.feedText(`${ev.name}: ${ev.gold.toLocaleString()} gold, ${ev.keys} Warden key${ev.keys > 1 ? 's' : ''}, ${ev.items} pieces of gear`);
        hud.screenFlash(0.6);
        persist();
        break;
      case 'quest':
        if (ev.what === 'accepted') hud.feedText(`Quest accepted: ${ev.name}`);
        else if (ev.what === 'ready') {
          sfx.pickup(4);
          hud.banner(ev.name, `Done. Return to ${ev.giver} in Haven`);
        } else if (ev.what === 'claimed') {
          sfx.pickup(5);
          talkNote = QUESTS[ev.id].done;
          hud.feedText(`Quest complete: ${ev.name}` + (ev.item ? ` · received ${itemName(ev.item)}` : ''));
        }
        persist();
        break;
      case 'lore':
        hud.feedText(`Journal: "${ev.title}" (${ev.found} of ${SIGN_IDS.length})`);
        break;
      case 'spec':
        sfx.pickup(5);
        hud.banner(ev.name, 'Subclass chosen');
        break;
      case 'talent':
        sfx.ui();
        break;
      case 'respec':
        hud.feedText('Talents reset. Choose a path again.');
        break;
      case 'bossReward':
        hud.feedText('Warden key and a skill point earned');
        break;
      case 'enrage':
        hud.banner('Enraged', 'The Warden attacks faster');
        break;
      case 'levelUp': {
        const unlocked = ev.unlocked.map((k) => `${world.kit[k].name} unlocked · press ${world.kit[k].key}`);
        hud.banner(`Level ${ev.level}`, unlocked[0] || '+1 skill point');
        sfx.levelUp();
        if (world.mode === 'explore') persist();
        hintOnce('rank', 'You have a skill point. Hold Shift and press Q, W, E or R to rank that ability up.', 8);
        if (ev.level === CONFIG.SPEC_LEVEL && !p.spec) hud.hint('You can choose a subclass. Press T.', 10);
        else if (p.spec && world.talentPoints() > 0 && talentPointsAt(ev.level) > talentPointsAt(ev.level - 1)) hud.feedText('Talent point earned · press T');
        talentBadge();
        break;
      }
      case 'rankUp':
        sfx.rankUp();
        hud.flashSlot(ev.slot);
        if (mode === 'play') hud.float(renderer, p.x, 3.0, p.z, `${world.kit[ev.slot].name} rank ${ev.rank}`, 'word stun');
        break;
      case 'tome':
        sfx.rankUp();
        break;
      case 'potion':
        sfx.potion();
        hud.flashSlot('potion');
        break;
      case 'pickup':
        sfx.pickup(ev.item.rarity);
        hud.feedItem(ev.item, ev);
        hud.setGearBadge(Inventory.upgradeCount(world));
        if (ev.upgrade && !ev.equipped) hintOnce('gear', 'You picked up an upgrade. Press TAB to open your gear.', 7);
        break;
      case 'bagFull':
        hud.feedText('Bag is full. Press TAB and scrap some items.');
        break;
      case 'equip':
        sfx.pickup(ev.item.rarity);
        break;
      case 'discard':
        sfx.ui();
        hud.feedText(`+${ev.scrap} scrap`);
        break;
      case 'upgrade':
        sfx.upgrade();
        break;
      case 'cacheOpened':
        sfx.pickup(ev.item.rarity);
        town.showCacheResult(ev.item);
        break;
      case 'cantEquip':
        sfx.denied();
        hud.feedText(`Only a ${CLASSES[ev.item.cls].name} can use a ${WEAPONS[ev.item.cls].type.toLowerCase()}`);
        break;
      case 'cantAfford':
        sfx.denied();
        break;
      case 'waygate':
        if (mode === 'play') {
          sfx.ui();
          setMode('travel');
        }
        break;
      case 'discovered':
        if (ev.id !== 'town') hud.feedText(`Discovered ${ev.name}. The Waygate in Haven can take you back here.`);
        break;
      case 'mapChange':
        // Arrived on another exploration map: swap the scenery and forget the old map's enemies.
        if (renderer.mapId !== world.map.id || !renderer.exploreGroup.visible) renderer.setMap(world.map);
        renderer.reset();
        renderer.camTarget.set(p.x, 0, p.z);
        tune();
        hud.reset();
        hud.banner(ev.name, world.zone().sub);
        hud.screenFlash(0.5);
        sfx.cast('e');
        if (ev.from === 'town') hintOnce('maps', 'Each map is ten levels tougher than the last, and enemies get stronger the deeper in you go. Stand in a portal to travel on.', 9);
        persist();
        break;
      case 'playerDown':
        sfx.defeat();
        persist();
        hud.banner('Knocked out', world.party || (net && net.role === 'client') ? 'Back on your feet at the entrance soon, unless the whole party falls' : 'You wake up in town');
        break;
      case 'ticket':
        sfx.pickup(4);
        hud.feedText('Arena ticket found');
        hud.float(renderer, ev.x, 2.6, ev.z, '+1 ticket', 'word stun');
        break;
      case 'playerDeath':
        sfx.defeat();
        persist();
        defeatTimer = setTimeout(() => {
          $('defeat-title').textContent = `You fell on wave ${ev.wave}`;
          $('defeat-stats').innerHTML = [
            ['Parries', world.stats.parries],
            ['Perfect', world.stats.perfects],
            ['Kills', world.stats.kills],
          ]
            .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
            .join('');
          $('btn-retry').textContent = account.tickets > 0 ? `Retry from wave ${save.checkpoint} · 1 ticket (${account.tickets} left)` : 'No arena tickets left';
          $('btn-retry').disabled = account.tickets <= 0;
          gearReturn = 'defeat';
          setMode('defeat');
        }, 1400);
        break;
    }
  }

  function drainEvents() {
    if (!world.events.length) return;
    const events = world.events;
    world.events = [];
    const me = net ? net.pid : 0;
    for (const ev of events) {
      if (net && !(eventFor(ev, me) || (net.role === 'host' && ev.type === 'mapChange'))) continue;
      handleEvent(ev);
    }
  }

  // ------------------------------------------------------------- main loop
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;

    let alpha = Math.min(1, acc / CONFIG.TICK);
    if (net && net.role === 'client') {
      // A joiner never runs the rules: it shows what the host sends, gliding between updates.
      drainEvents();
      alpha = Math.min(1, (now - net.snapAt) / net.snapGap);
    } else if (net && mode !== 'title' && mode !== 'mp') {
      hostAdvance(dt);
      alpha = Math.min(1, acc / CONFIG.TICK);
    } else if (mode === 'play') {
      if (world.offer && !world.gameOver && now >= offerAt) {
        setMode('augment');
      } else if (freeze > 0) {
        freeze -= dt;
      } else {
        // The simulation always advances in fixed steps, whatever the frame rate.
        acc += dt;
        let steps = 0;
        while (acc >= CONFIG.TICK && steps < 6) {
          world.step(CONFIG.TICK);
          acc -= CONFIG.TICK;
          steps++;
          drainEvents();
          if (freeze > 0) break;
        }
        if (steps >= 6) acc = 0; // fell too far behind (tab was in the background)
      }
    }

    input.update(now);
    if (!net && mode === 'play') alpha = Math.min(1, acc / CONFIG.TICK);
    renderer.render(world, alpha, dt);
    hud.update(world, renderer, dt);
  }

  // Handy in the browser console while developing: game.world.player etc.
  window.game = {
    get world() {
      return world;
    },
    get net() {
      return net;
    },
    get mode() {
      return mode;
    },
    renderer,
    startRun,
    enterTown,
    startExplore,
    selectClass,
    music,
    Music,
    account,
    CONFIG,
  };

  setMode('title');
  requestAnimationFrame(frame);
}

// Inside the Claude artifact viewer, `hot` restores state across a republish.
// Everywhere else it does not exist and the game simply starts.
if (window.claude?.hot?.ready) window.claude.hot.ready((data) => start(data || {}));
else start(window.claude?.hot?.data ?? {});
