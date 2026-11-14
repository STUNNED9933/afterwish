// Entry point: wires the simulation, renderer, HUD, input, audio and saving
// together, and runs the main loop.
import { CONFIG } from './config.js';
import { World } from './sim/world.js';
import { trialWeek, weekIndexAt, buildTrialWorld, defaultBuild, validateBuild, trialScore, trialFinished, cleanCommand } from './sim/trial.js';
import { SIM_VERSION } from './sim/version.js';
import { TrialScreen, clock as trialClock } from './ui/trial.js';
import { loadHall, recordWave, keepTrialRun, markTrialSent, loadTrialRuns } from './hall.js';
import * as trialApi from './net/trial-api.js';
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
import { goalText, setGearClass } from './ui/hud.js';
import { RARITIES, itemName } from './sim/items.js';
import { loadSave, storeSave, clearSave, loadSettings, storeSettings, loadAccount, storeAccount , exportSaves, exportCode, parseSaves, importSaves, describeSaves, backupNow, loadBackups, restoreBackup, missingProgress, claimSession, onSessionTaken, askPersistentStorage } from './save.js';
import { WEAPONS } from './sim/items.js';
import { HostRoom, JoinRoom, cleanCode } from './net/room.js';
import { makeSnapshot, applySnapshot, eventFor } from './net/sync.js';

const $ = (id) => document.getElementById(id);
const SLOT_LABEL = { q: 'Cleave', w: 'Whirlwind', e: 'Breakthrough', r: 'Skyfall', parry: 'Parry', hero: 'Hero' };

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
  // Only the newest tab saves. An older tab left open (say, from before an update) would
  // otherwise write its out-of-date progress over everything when it is closed or hidden.
  claimSession();
  let stale = false;
  onSessionTaken(() => {
    stale = true;
    if (mode === 'play') setMode('pause');
    $('stale-tab').classList.remove('hidden');
  });
  $('btn-stale-reload').addEventListener('click', () => location.reload());
  backupNow('when the game started');
  let lastBackup = Date.now();
  let save = hot.save || loadSave(settings.cls);
  if (save) askPersistentStorage();
  // Gold and arena tickets belong to the account, so both characters share them.
  const account = hot.account || loadAccount() || { gold: save?.gold || 0, tickets: CONFIG.START_TICKETS };
  function makeWorld(opts) {
    const w = new World(Object.assign({ parryPreset: settings.parryPreset, cls: settings.cls }, opts));
    renderer.setHeroClass(w.cls);
    setGearClass(w.cls);
    w.player.autoAttack = settings.autoAttack !== false;
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
  let pendingTalk = null; // { id, until }: a person or sign you right-clicked and are walking to
  let frameNo = 0; // counts frames, to check what the mouse is over only every few
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
    if (stale) return; // a newer tab of the game is open: it does the saving now
    if (net && net.role === 'client') return; // the host sends this player's save (see onNetMessage)
    if (world.trial) return; // a Weekly Echo (or a replay of one) never touches the character's save
    account.gold = world.player.gold;
    account.tickets = world.player.tickets;
    storeAccount(account);
    save = world.toSave();
    storeSave(save, world.cls);
    if (Date.now() - lastBackup > 10 * 60 * 1000) {
      lastBackup = Date.now();
      backupNow('while playing');
    }
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
  if (!Array.isArray(settings.keepRarities)) settings.keepRarities = [6]; // Immortal items are safe from bulk scrapping unless you say so
  const inventory = new Inventory(tooltip, applyNow, {
    get: () => settings.keepRarities,
    set: (list) => {
      settings.keepRarities = list;
      storeSettings(settings);
    },
  });
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
    for (const id of ['title', 'town', 'pause', 'defeat', 'augment', 'travel', 'talk', 'read', 'journal', 'talents', 'transfer', 'mp', 'trial']) $(id).classList.toggle('hidden', mode !== id);
    $('watch-badge').classList.toggle('hidden', mode !== 'watch');
    $('inventory').classList.toggle('hidden', mode !== 'gear');
    tooltip.hide();
    if (mode === 'gear') inventory.render(world);
    if (mode === 'town') {
      town.render(world);
      renderHall();
    }
    if (mode === 'augment') renderOffer();
    if (mode === 'travel') renderTravel();
    if (mode === 'talk') renderTalk();
    if (mode === 'read') renderRead();
    if (mode === 'journal') renderJournal();
    if (mode === 'talents') renderTalents();
    talentBadge();
    if (mode === 'title') refreshTitle();
    tune();
    if (mode === 'pause' && trialRun) $('btn-town').textContent = 'End this Weekly Echo run';
    else if (mode === 'pause') $('btn-town').textContent = net ? (net.role === 'host' ? 'Close the room and go to the title screen' : 'Leave the room') : world.mode === 'explore' ? 'Save and go to the title screen' : 'Back to camp';
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
    if (has) $('btn-continue').textContent = 'The Echo Ring';
    const fresh = $('btn-new');
    fresh.textContent = has ? `Start a new ${c.name}` : 'Wake the Echo Ring · 1 shard';
    fresh.dataset.armed = '';
    const found = missingProgress();
    const lost = found && found.t !== settings.backupSeen ? found : null; // not after a deliberate fresh start
    const hint = $('title-restore');
    hint.classList.toggle('hidden', !lost);
    if (lost) {
      hint.innerHTML = '';
      hint.append(`Missing progress? A backup from ${new Date(lost.t).toLocaleDateString()} has ${describeSaves(lost)}.`);
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'link-btn';
      go.textContent = 'See backups';
      go.addEventListener('click', openTransfer);
      const hide = document.createElement('button');
      hide.type = 'button';
      hide.className = 'link-btn';
      hide.textContent = 'Hide';
      hide.addEventListener('click', () => {
        settings.backupSeen = lost.t;
        storeSettings(settings);
        refreshTitle();
      });
      hint.append(go, hide);
    }
    $('title-save').textContent = `${account.gold} gold · ${account.tickets} starglass shard${account.tickets === 1 ? '' : 's'}. Each class is one character, used both on the road and in the Echo Ring. Gold and shards are shared by every class. Progress is saved in this browser.`;
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
      $('title-save').textContent = 'You have no starglass shards. The things on the road above Haven carry them.';
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

  // ------------------------------------------------------- the Weekly Echo
  let trialRun = null; // { week, build, done } while a Weekly Echo run is being played
  let watching = null; // { inputs, i, endTick, name } while a top run is being watched
  const currentWeek = () => trialWeek(weekIndexAt(Date.now()));
  if (!settings.trialBuilds || typeof settings.trialBuilds !== 'object') settings.trialBuilds = {};
  const trialScreen = new TrialScreen({
    getBuild(cls) {
      const wk = currentWeek();
      const b = settings.trialBuilds[cls];
      return b && b.week === wk.index && !validateBuild(wk, b) ? b : Object.assign(defaultBuild(wk, cls), { week: wk.index });
    },
    setBuild(cls, b) {
      settings.trialBuilds[cls] = Object.assign({}, b, { week: currentWeek().index });
      storeSettings(settings);
    },
    enter: (b) => enterTrial(b),
    back: () => enterTown(),
    watch: (id) => watchRun(id),
    submitPending: () => submitPending(),
  });

  function openTrial(result = null) {
    trialScreen.open(currentWeek(), world.cls, result);
    setMode('trial');
    submitPending();
  }

  function enterTrial(build) {
    const wk = currentWeek();
    const b = { cls: build.cls, spec: build.spec, talents: build.talents, ranks: build.ranks, autoAttack: settings.autoAttack !== false };
    world = buildTrialWorld(wk, b);
    world.recorder = [];
    renderer.setHeroClass(world.cls);
    setGearClass(world.cls);
    trialRun = { week: wk, build: b, done: false };
    renderer.setEnvironment('arena');
    resetViews();
    sfx.unlock();
    setMode('play');
    hud.banner('The Weekly Echo', `Week ${wk.index + 1} · level ${wk.level}`);
  }

  /** The run is over (fell, finished, out of time, or ended from the menu): keep it, send it, show it. */
  async function finishTrial() {
    if (!trialRun || trialRun.done) return;
    clearTimeout(defeatTimer);
    trialRun.done = true;
    const run = trialRun;
    const score = trialScore(world);
    const packed = await trialApi.packInputs(world.recorder || []);
    const payload = { week: run.week.index, version: SIM_VERSION, build: run.build, endTick: score.ticks, claim: { floor: score.floor, clearTick: score.clearTick }, inputs: packed };
    const best = !stale && keepTrialRun(run.week.index, run.build.spec, score, payload);
    trialRun = null;
    enterTown();
    const result = { floor: score.floor, clearTick: score.clearTick, spec: run.build.spec, note: best ? 'Your best run with this subclass this week.' : 'Not better than your best this week.' };
    if (best && trialApi.online() && trialApi.identity()) {
      result.note = 'Checking your run…';
      openTrial(result);
      const r = await trialApi.submitRun(payload);
      result.note = submitNote(r);
      if (r.ok || [400, 409, 413, 422].includes(r.http)) markTrialSent(run.week.index, run.build.spec);
      trialScreen.render();
      trialScreen.refreshBoards();
    } else {
      if (best && trialApi.online()) result.note += ' Join the boards to put it on them.';
      openTrial(result);
    }
  }

  function submitNote(r) {
    if (!r.ok) return r.error || 'The boards could not be reached. Your run is kept here and will be sent next time.';
    if (r.status === 'verified') return `Checked and on the board: ${r.rank} of ${r.total}${r.total >= 20 ? `, better than ${r.better}% of them` : ''}.`;
    if (r.status === 'pending') return 'Received. It is queued to be checked and will appear on the board soon.';
    if (r.status === 'not-better') return 'Your best run this week is already on the board.';
    return r.message || 'Sent.';
  }

  /** Send any best runs that did not reach the boards yet (offline, or before joining). */
  let sending = false;
  async function submitPending() {
    if (sending || !trialApi.online() || !trialApi.identity()) return;
    sending = true;
    const wk = currentWeek().index;
    const runs = loadTrialRuns()[wk] || {};
    for (const spec of Object.keys(runs)) {
      const r = runs[spec];
      if (r.sent || !r.payload) continue;
      const res = await trialApi.submitRun(r.payload);
      if (res.ok || [400, 409, 413, 422].includes(res.http)) markTrialSent(wk, spec); // sent, or never acceptable: stop retrying
    }
    sending = false;
    if (mode === 'trial') {
      trialScreen.render();
      trialScreen.refreshBoards();
    }
  }

  /** Watch one of the week's top runs, replayed from its recording. */
  async function watchRun(id) {
    const r = await trialApi.fetchReplay(id);
    if (!r.ok) {
      hud.feedText(r.error || 'That run cannot be watched right now.');
      return;
    }
    const inputs = await trialApi.unpackInputs(r.inputs);
    world = buildTrialWorld(trialWeek(r.week), r.build);
    renderer.setHeroClass(world.cls);
    setGearClass(world.cls);
    watching = { inputs, i: 0, endTick: r.endTick, name: r.name, ended: false };
    $('watch-badge').textContent = `Watching ${r.name}: floor ${r.floor} · Esc to stop · 2 to change speed`;
    renderer.setEnvironment('arena');
    resetViews();
    setMode('watch');
  }

  function stepWatch(dt) {
    const speed = watching.fast ? 2 : 1;
    acc += dt * speed;
    let steps = 0;
    while (acc >= CONFIG.TICK && steps < 12) {
      const w = watching;
      while (w.i < w.inputs.length && w.inputs[w.i][0] <= world.ticks) {
        const c = w.inputs[w.i][0] === world.ticks ? cleanCommand(w.inputs[w.i][1]) : null;
        if (c) world.command(c);
        w.i++;
      }
      world.step(CONFIG.TICK);
      acc -= CONFIG.TICK;
      steps++;
      drainEvents();
      if (!w.ended && (trialFinished(world) || world.ticks >= w.endTick)) {
        w.ended = true;
        hud.banner(`${w.name}: floor ${world.wave.cleared || 0}`, 'End of the run');
        setTimeout(() => mode === 'watch' && stopWatch(), 2500);
        break;
      }
    }
    if (steps >= 12) acc = 0;
  }

  function stopWatch() {
    watching = null;
    enterTown();
    openTrial();
  }

  /** The Hall of Echoes card in the Ring camp: best waves per class and subclass. */
  function renderHall() {
    const hall = loadHall();
    const root = $('hall-list');
    root.innerHTML = '';
    for (const cls of Object.keys(CLASSES)) {
      const rows = [[cls, CLASSES[cls].name, 'hall-cls']];
      for (const k of Object.keys(SPECS)) if (SPECS[k].cls === cls) rows.push([`${cls}/${k}`, SPECS[k].name, 'hall-sub']);
      for (const [key, name, cl] of rows) {
        const rec = hall[key];
        const d = document.createElement('div');
        d.className = 'hall-row';
        d.innerHTML = `<span class="${cl}">${name}</span><b>${rec ? `wave ${rec.wave}` : '—'}</b>`;
        if (rec) d.title = `Set ${rec.at}`;
        root.appendChild(d);
      }
    }
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
    if (r.tickets) parts.push(`${r.tickets} starglass shard${r.tickets > 1 ? 's' : ''}`);
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
    let keyNo = 0;
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
        btn.innerHTML = `Take the reward <kbd>${++keyNo}</kbd>`;
        btn.dataset.key = keyNo;
        btn.addEventListener('click', () => { talkNote = ''; applyNow({ type: 'claimQuest', id }); });
      } else if (st === 'active') {
        btn.className = 'ghost';
        btn.textContent = 'In progress';
        btn.disabled = true;
      } else {
        btn.className = 'primary';
        btn.innerHTML = `Accept <kbd>${++keyNo}</kbd>`;
        btn.dataset.key = keyNo;
        btn.addEventListener('click', () => applyNow({ type: 'acceptQuest', id }));
      }
      el.appendChild(btn);
      list.appendChild(el);
    }
    $('talk-keys').classList.toggle('hidden', !keyNo);
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
    // A Weekly Echo build is set on its own screen before the run, so nothing to spend here.
    const n = world.trial ? 0 : !p.spec && p.level >= CONFIG.SPEC_LEVEL ? '!' : p.spec ? world.talentPoints() : 0;
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
        const trait = sp.perk ? `<p class="spec-trait"><b>Trait · ${sp.perk.name}</b> (from the start): ${sp.perk.desc}</p>` : '';
        card.innerHTML = `<h3>${sp.name}</h3><p>${sp.blurb}</p>${trait}<ul>${sp.talents.map((t) => `<li><b>${t.name}</b>: ${t.desc(t.max)}</li>`).join('')}</ul>`;
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
    if (sp.perk) {
      const tr = document.createElement('div');
      tr.className = 'spec-trait';
      tr.innerHTML = `<b>Trait · ${sp.perk.name}</b> ${sp.perk.desc}`;
      body.appendChild(tr);
    }
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
  const FRIEND_CMDS = new Set(['move', 'attack', 'stop', 'cast', 'parry', 'potion', 'equip', 'discard', 'scrap', 'upgrade', 'rankUp', 'acceptQuest', 'claimQuest', 'readSign', 'chooseSpec', 'talent', 'respec', 'travel', 'attackMove', 'setAutoAttack']);

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
      welcome = await room.join(code, { name, save, cls: settings.cls, parry: settings.parryPreset, autoAttack: settings.autoAttack !== false, gold: account.gold, tickets: account.tickets });
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
  // Ctrl + W ranks up W (as in League), but in Chrome it also closes the tab and a page
  // cannot stop that. So once you are in the game, leaving asks first.
  window.addEventListener('beforeunload', (e) => {
    if (mode === 'title' || stale) return;
    e.preventDefault();
    e.returnValue = '';
  });
  window.addEventListener('pagehide', () => {
    if (net) net.room.close();
  });

  /**
   * Quest shortcut in a conversation. n = 1..9 presses that quest's button; null does the
   * most useful thing: hand in a finished quest first, else accept the next one, else close.
   */
  function quickQuest(n) {
    const btns = [...document.querySelectorAll('#talk-quests .quest button.primary:not([disabled])')];
    if (n) {
      const b = btns.find((x) => Number(x.dataset.key) === n);
      if (!b) return false;
      b.click();
      return true;
    }
    const ready = btns.find((x) => x.closest('.quest').classList.contains('ready'));
    const b = ready || btns[0];
    if (b) b.click();
    else setMode('play');
    return true;
  }

  /** Right-clicked a person or sign: walk to them, and talk/read on arrival (see the frame loop). */
  function walkToInteract(o) {
    const p = world.player;
    const d = Math.hypot(p.x - o.x, p.z - o.z) || 1;
    const stand = o.r + 1.1;
    pendingTalk = { id: o.id, until: performance.now() + 9000 };
    if (d <= o.r + CONFIG.INTERACT_RANGE - 0.2) return; // already close enough
    world.command({ type: 'move', x: o.x + ((p.x - o.x) / d) * stand, z: o.z + ((p.z - o.z) / d) * stand });
  }

  const actions = {
    walkToInteract,
    cancelInteract() {
      pendingTalk = null;
    },
    /** G: talk to the person, or read the sign, you are standing next to. */
    /** G: in a conversation, do the obvious thing (hand in, else accept); on a sign, step away. */
    interact() {
      if (mode === 'talk') return quickQuest(null);
      if (mode === 'read') return setMode('play');
      if (mode !== 'play') return;
      pendingTalk = null;
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
      if (mode === 'play' && world.trial) {
        hud.hint('Your Weekly Echo build is set before the run, on the Weekly Echo screen.', 4);
        return;
      }
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
      if (mode === 'watch') return stopWatch();
      if (mode === 'trial') return enterTown();
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
    attackMoveNear: () => (settings.attackMoveNear === 'hero' ? 'hero' : 'cursor'),
    /** Keys that belong to an open menu. Returns true if the key was used. */
    menuKey(key) {
      if (mode === 'watch' && watching && key === '2') {
        watching.fast = !watching.fast;
        return true;
      }
      if (mode === 'talk') {
        if (key === 'enter') return quickQuest(null) || true;
        if (/^[1-9]$/.test(key)) return quickQuest(Number(key));
        return false;
      }
      if (mode === 'read' && key === 'enter') {
        setMode('play');
        return true;
      }
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

  // The browser's own right-click menu never opens over the game, dialogs included.
  // Text boxes keep it so a room code or save code can still be pasted with the mouse.
  window.addEventListener('contextmenu', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
  });
  // Right-click outside an open window closes it. The margin around the window means a
  // right-click that only just misses it does not throw the player out by accident.
  const CLOSE_MARGIN = 56;
  const CLOSABLE = {
    talk: '#talk .menu-card',
    read: '#read .menu-card',
    journal: '#journal .menu-card',
    talents: '#talents .menu-card',
    travel: '#travel .menu-card',
    gear: '#inventory',
  };
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    const card = CLOSABLE[mode] && document.querySelector(CLOSABLE[mode]);
    if (!card) return;
    const r = card.getBoundingClientRect();
    const m = CLOSE_MARGIN;
    if (e.clientX >= r.left - m && e.clientX <= r.right + m && e.clientY >= r.top - m && e.clientY <= r.bottom + m) return;
    e.preventDefault();
    if (mode === 'gear') actions.toggleInventory();
    else {
      setMode('play');
      sfx.ui();
    }
  });

  // --------------------------------------------------------------- buttons
  const armThenRun = (btn, armedText, run) => {
    if (btn.dataset.armed === '1') {
      // A double-click must never count as "yes, delete": the second click has to come a moment later.
      if (performance.now() - (btn._armedAt || 0) < 700) return;
      btn.dataset.armed = '';
      run();
    } else {
      btn.dataset.armed = '1';
      btn._armedAt = performance.now();
      btn.dataset.label = btn.textContent;
      btn.textContent = armedText;
      // One timer per button, so an old one cannot cancel a fresh confirmation early.
      clearTimeout(btn._disarm);
      btn._disarm = setTimeout(() => {
        if (btn.dataset.armed === '1') {
          btn.dataset.armed = '';
          btn.textContent = btn.dataset.label;
        }
      }, 4000);
    }
  };
  // A new character always starts at the beginning of the story, in Haven.
  const wipe = () => {
    clearSave(world.cls); // keeps a backup first
    settings.backupSeen = (loadBackups().best || {}).t; // a deliberate fresh start: no "missing progress?" note for it
    storeSettings(settings);
    save = null;
    startExplore(true);
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
    else armThenRun(e.currentTarget, `Click again to delete your ${CLASSES[settings.cls].name} and start over`, wipe);
  });
  $('btn-resume').addEventListener('click', () => setMode('play'));
  $('btn-travel-close').addEventListener('click', () => setMode('play'));

  // --------------------------------------------- moving saves between browsers
  const transferMsg = (text, ok) => {
    const el = $('transfer-msg');
    el.textContent = text;
    el.className = 'setting-desc ' + (ok ? 'ok' : 'bad');
  };
  const whenText = (t) => {
    const d = new Date(t);
    const today = new Date().toDateString() === d.toDateString();
    return (today ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  function renderBackups() {
    const list = $('backup-list');
    list.innerHTML = '';
    const b = loadBackups();
    const rows = b.recent.map((x) => ({ x, best: false }));
    if (b.best && !b.recent.some((x) => x.t === b.best.t)) rows.push({ x: b.best, best: true });
    if (!rows.length) {
      list.innerHTML = '<p class="setting-desc">No backups yet. One is made once you have a character.</p>';
      return;
    }
    for (const { x, best } of rows) {
      const row = document.createElement('div');
      row.className = 'backup-row' + (best || (b.best && x.t === b.best.t) ? ' best' : '');
      const info = document.createElement('div');
      info.innerHTML = `<div></div><div class="when"></div>`;
      info.firstChild.textContent = describeSaves(x);
      info.lastChild.textContent = `${whenText(x.t)} · ${x.why}${b.best && x.t === b.best.t ? ' · most progress' : ''}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost tiny';
      btn.textContent = 'Restore';
      btn.addEventListener('click', () => armThenRun(btn, 'Click again to restore', () => restoreFrom(x)));
      row.append(info, btn);
      list.appendChild(row);
    }
  }
  function restoreFrom(backup) {
    persist();
    if (!restoreBackup(backup)) {
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
    transferMsg(`Restored: ${describeSaves(backup)}. What was here before is in the backup list, in case you want it back.`, true);
    renderBackups();
    refreshTitle();
  }
  function openTransfer() {
    persist();
    transferMsg('', true);
    $('import-code').value = '';
    renderBackups();
    setMode('transfer');
  }
  $('btn-transfer').addEventListener('click', openTransfer);
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
    if (trialRun) {
      finishTrial();
      return;
    }
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
  $('btn-weekly').addEventListener('click', () => openTrial());
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
  // Attack-move target and auto-attack
  const amRoot = $('am-near');
  const refreshAm = () => {
    for (const b of amRoot.children) b.setAttribute('aria-pressed', b.dataset.key === actions.attackMoveNear() ? 'true' : 'false');
  };
  for (const b of amRoot.children) {
    b.addEventListener('click', () => {
      settings.attackMoveNear = b.dataset.key;
      storeSettings(settings);
      refreshAm();
    });
  }
  refreshAm();
  $('auto-attack').checked = settings.autoAttack !== false;
  $('auto-attack').addEventListener('change', (e) => {
    settings.autoAttack = e.target.checked;
    storeSettings(settings);
    if (!net || net.role === 'host') world.player.autoAttack = settings.autoAttack; // a joiner's goes to the host below
    world.command({ type: 'setAutoAttack', on: settings.autoAttack });
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
        hud.banner(`Wave ${ev.n}`, ev.boss ? `An echo of ${ev.bossName} rises` : ev.n === 1 ? 'The stones remember' : '');
        if (ev.n === 1) hintOnce('ring', 'The Echo Ring calls up what the mountain remembers. Echoes fall like anything else; they just keep coming.', 9);
        sfx.wave(ev.boss);
        if (ev.n === 1) hintOnce('move', 'Right-click the ground to move. Right-click an enemy to attack it.', 7);
        if (ev.boss) hintOnce('boss', 'Parry the boss three times to break its guard. Get clear of the red slam.', 9);
        break;
      case 'waveClear': {
        tune();
        if (world.trial) {
          hud.banner(`Floor ${ev.n} cleared`, watching ? `${watching.name}'s run` : `The Weekly Echo · ${trialClock(world.ticks)}`);
          sfx.clear();
          break;
        }
        const record = world.mode === 'arena' && !net && !stale && recordWave(world.cls, world.player.spec, ev.n);
        hud.banner(ev.boss ? 'The Warden falls' : 'Wave cleared', `+${ev.gold} gold${ev.boss ? ' · checkpoint saved' : ''}${record ? ' · a new record in the Hall of Echoes' : ''}`);
        sfx.clear();
        persist();
        break;
      }
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
      case 'buff':
        hud.float(renderer, ev.x, 3.2, ev.z, ev.name, 'word perfect');
        sfx.cast('r');
        break;
      case 'ironAnswer':
        hud.float(renderer, ev.x, 3.0, ev.z, 'Iron Answer', 'word perfect');
        sfx.parry(true);
        hud.screenFlash(0.3);
        freeze = Math.max(freeze, 0.08);
        break;
      case 'lastBreath':
        hud.float(renderer, ev.x, 3.0, ev.z, 'Last Breath', 'word perfect');
        sfx.levelUp();
        hud.screenFlash(0.45);
        break;
      case 'frostShatter':
        hud.float(renderer, ev.x, 3.0, ev.z, 'Shatter', 'word');
        sfx.shatter();
        break;
      case 'reflect':
        hud.float(renderer, ev.x, 2.6, ev.z, 'Returned', 'word');
        break;
      case 'perfectDodge':
        sfx.dodge();
        hud.float(renderer, ev.x, 3.0, ev.z, 'Perfect dodge', 'word perfect');
        hud.flashSlot('e');
        hintOnce('dodge', `Dodging an attack with ${world.kit.e.name} gives you ${world.kit.e.name} back almost at once.`, 5);
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
          hud.float(renderer, ev.x, 2.3, ev.z, ev.amount, (ev.crit ? 'crit' : ev.dot ? 'dot' : '') + (ev.far ? ' far' : ''));
        } else {
          sfx.hurt();
          hud.float(renderer, ev.x, 2.6, ev.z, '-' + ev.amount, 'hurt');
        }
        break;
      case 'heal':
        hud.float(renderer, ev.x, 2.8, ev.z, '+' + ev.amount, 'heal');
        break;
      case 'bloodCost':
        hud.float(renderer, ev.x, 2.6, ev.z, '-' + ev.amount, 'blood');
        break;
      case 'bloodied':
        if (ev.on) hud.float(renderer, ev.x, 3.2, ev.z, 'Bloodied', 'word blood');
        break;
      case 'shatter':
        sfx.cast('w');
        break;
      case 'markPop':
        sfx.impact();
        hud.float(renderer, ev.x, 3.0, ev.z, ev.amount, 'crit mark');
        break;
      case 'mark':
        hud.float(renderer, ev.x, 3.4, ev.z, 'Marked', 'word mark');
        break;
      case 'shadowSwap':
        sfx.cast('e');
        break;
      case 'wallShatter':
        sfx.impact();
        break;
      case 'wallRise':
        sfx.slam();
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
      case 'chestOpen': {
        const name = { wooden: 'Chest', gilded: 'Gilded chest', radiant: 'Radiant chest' }[ev.tier] || 'Chest';
        hud.float(renderer, ev.x, 2.6, ev.z, name, ev.tier === 'radiant' ? 'word perfect' : 'word');
        sfx.pickup(ev.tier === 'radiant' ? 6 : ev.tier === 'gilded' ? 4 : 2);
        if (ev.tier === 'radiant') hud.screenFlash(0.35);
        if (ev.gold) hud.feedText(`${name}: ${ev.gold.toLocaleString()} gold${ev.tickets ? `, ${ev.tickets} starglass shard` : ''}${ev.tier !== 'wooden' ? ', potions refilled' : ''}`);
        if (world.mode === 'explore') persist();
        break;
      }
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
        else if (world.chests && world.chests.length) hintOnce('chests', 'Treasure chests lie around every map (gold dots on the minimap). Walk over one to open it. Gilded and radiant chests hold better gear, and a radiant one can even hold an Immortal.', 9);
        persist();
        break;
      case 'playerDown':
        sfx.defeat();
        persist();
        hud.banner('Knocked out', world.party || (net && net.role === 'client') ? 'Back on your feet at the entrance soon, unless the whole party falls' : 'You wake up in town');
        break;
      case 'ticket':
        sfx.pickup(4);
        hud.feedText('A sliver of starglass, still warm');
        hud.float(renderer, ev.x, 2.6, ev.z, '+1 shard', 'word stun');
        break;
      case 'playerDeath':
        sfx.defeat();
        if (world.trial) {
          // A Weekly Echo run (or a replay being watched) ends here; nothing is saved to the character.
          if (trialRun && !trialRun.done) defeatTimer = setTimeout(finishTrial, 1600);
          break;
        }
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
          $('btn-retry').textContent = account.tickets > 0 ? `Wake it again from wave ${save.checkpoint} · 1 shard (${account.tickets} left)` : 'No starglass shards left';
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
    if (pendingTalk) {
      // Walking to someone you right-clicked: open the conversation when they are in reach.
      const near = mode === 'play' ? world.interactable() : null;
      if (mode !== 'play' || now > pendingTalk.until || world.player.dead) pendingTalk = null;
      else if (near && near.id === pendingTalk.id) actions.interact();
    }
    if (mode === 'play' && world.mode === 'explore' && ((frameNo = (frameNo + 1) % 6) === 0)) {
      canvas.classList.toggle('hover-talk', !!renderer.pickInteractable(input.mouse.x, input.mouse.y, world));
    }

    let alpha = Math.min(1, acc / CONFIG.TICK);
    if (net && net.role === 'client') {
      // A joiner never runs the rules: it shows what the host sends, gliding between updates.
      drainEvents();
      alpha = Math.min(1, (now - net.snapAt) / net.snapGap);
    } else if (net && mode !== 'title' && mode !== 'mp') {
      hostAdvance(dt);
      alpha = Math.min(1, acc / CONFIG.TICK);
    } else if (mode === 'watch' && watching) {
      stepWatch(dt);
      alpha = Math.min(1, acc / CONFIG.TICK);
    } else if (mode === 'play') {
      if (trialRun && !trialRun.done && trialFinished(world) && !world.gameOver) {
        finishTrial(); // last floor, or out of time
      } else if (world.offer && !world.gameOver && now >= offerAt) {
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
