// Entry point: wires the simulation, renderer, HUD, input, audio and saving
// together, and runs the main loop.
import { TIERS, MAX_TIER, RIFT, WISH_STATS, WISH_IDS, DEEP, DEPTH_IDS, emberScale } from './sim/endgame.js';
import { CONFIG } from './config.js';
import { World } from './sim/world.js';
import { trialWeek, weekIndexAt, buildTrialWorld, defaultBuild, validateBuild, trialScore, trialFinished, cleanCommand } from './sim/trial.js';
import { SIM_VERSION } from './sim/version.js';
import { TrialScreen, clock as trialClock } from './ui/trial.js';
import { loadHall, recordWave, recordRift, keepTrialRun, markTrialSent, loadTrialRuns } from './hall.js';
import * as trialApi from './net/trial-api.js';
import { CLASSES, CLASS_IDS } from './sim/classes.js';
import { AUGMENTS } from './sim/augments.js';
import { Renderer } from './render/renderer.js';
import { Hud, Tooltip, svg } from './ui/hud.js';
import { Inventory, itemCell } from './ui/inventory.js';
import { Town } from './ui/town.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Music } from './music/player.js';
import { MAP_SONG, BOSS_SONG } from './music/songs.js';
import { MAPS, MAP_IDS } from './sim/maps.js';
import { BOSSES, ENEMIES } from './sim/defs.js';
import { QUESTS, QUEST_IDS, NPCS, SIGNS, SIGN_IDS, HERALD_LINES } from './sim/story.js';
import { SPECS, specsFor, ROW_NEED, talentPointsAt } from './sim/talents.js';
import { goalText, setGearClass } from './ui/hud.js';
import { RARITIES, itemName, STATS, formatStat, MISC, SLOTS } from './sim/items.js';
import { PERKS, PERK_IDS, REBIRTH, rebirthBlock, perkRank } from './sim/rebirth.js';
import { WELL, CREDITS } from './sim/story.js';
import { GLOWS } from './sim/cosmetics.js';
import { BOUNTY, FRAGMENTS, REMNANT } from './sim/surprises.js';
import { loadSave, storeSave, clearSave, loadSettings, storeSettings, loadAccount, storeAccount , exportSaves, exportCode, parseSaves, importSaves, describeSaves, backupNow, loadBackups, restoreBackup, missingProgress, claimSession, onSessionTaken, askPersistentStorage } from './save.js';
import { WEAPONS } from './sim/items.js';
import { HostRoom, JoinRoom, cleanCode } from './net/room.js';
import { ServerRoom } from './net/server-room.js';
import { SERVERS, serverHealth } from './net/servers.js';
import * as Casebook from './ui/casebook.js';
import { makeSnapshot, applySnapshot, receiveSnapshot, eventFor, ALLY_FX, compactEvents } from './net/sync.js';
import { FRIEND_CMDS } from './net/cmds.js';

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
  // Graphics quality (0.34). Auto starts on High and steps down once or twice if frames are slow.
  // (0.54.9) without the graphics chip, Auto starts at the bottom, and says why the game is slow
  const softGPU = renderer.softwareGPU();
  const GFX_STEPS = ['high', 'medium', 'low', 'lowest'];
  const GFX_NAMES = { high: 'High', medium: 'Medium', low: 'Low', lowest: 'Very low' };
  const gfx = { level: settings.graphics === 'auto' ? (softGPU ? 'lowest' : 'high') : settings.graphics, t: 0, frames: 0, warm: 3, drops: 0 };
  renderer.setQuality(gfx.level);
  if (softGPU) {
    const w = document.getElementById('gpu-warn');
    w.innerHTML = '<b>This browser is drawing the game without your graphics card</b>, so it will be slow. Turn on <b>hardware acceleration</b>: in Chrome, Settings → System → "Use graphics acceleration when available" (in Opera: Settings → Browser → System), then restart the browser. On a laptop, plug it in, and in Windows Settings → Display → Graphics, set the browser to High performance. (Until then, Auto graphics starts on Very low.)';
    w.classList.remove('hidden');
  }

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
  account.casebook = Casebook.freshBook(account.casebook); // The Casebook (0.56): the account's, every class and every life
  let caseSel = null; // the page open in the Casebook
  let caseShift = false; // Shift held: the other view, for as long as it is held
  let caseSaveT = null;
  let caseScanAt = 0;
  function makeWorld(opts) {
    const w = new World(Object.assign({ parryPreset: settings.parryPreset, cls: settings.cls }, opts));
    renderer.setHeroClass(w.cls);
    setGearClass(w.cls);
    w.player.autoAttack = settings.autoAttack !== false;
    w.player.gold = account.gold;
    w.player.tickets = account.tickets;
    w.player.acctRebirths = account.rebirths || 0; // Rebirth (0.43): every hero's EXP grows with the account's rebirths
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
  let trade = null; // the trade window's latest state (from 'trade' events), while one is open
  const inParty = () => !!(world.party || (net && net.role === 'client'));
  const inventory = new Inventory(tooltip, applyNow, {
    get: () => settings.keepRarities,
    set: (list) => {
      settings.keepRarities = list;
      storeSettings(settings);
    },
  }, {
    offered: () => (trade && trade.state === 'open' ? new Set(trade.mine.ids) : null),
    toggle: (id) => {
      const ids = new Set(trade.mine.ids);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      applyNow({ type: 'tradeSet', items: [...ids], gold: Number($('trade-gold').value) || 0 });
    },
    party: () => inParty(),
  });

  /** The trade part of the gear drawer: who you can trade with, and the open trade. */
  function renderTrade() {
    const allies = inParty() && world.mode === 'explore' ? world.allies() : [];
    const pt = $('party-trade');
    pt.classList.toggle('hidden', !allies.length || !!trade);
    if (allies.length && !trade) {
      pt.innerHTML = '<span>Trade with</span>';
      for (const a of allies) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost tiny';
        b.textContent = a.name;
        b.addEventListener('click', () => applyNow({ type: 'tradeAsk', to: a.pid }));
        pt.appendChild(b);
      }
    }
    $('inv-help').textContent = trade && trade.state === 'open'
      ? 'Click items in your bag to add them to your offer (or take them out). Both of you must press Accept; any change un-readies both.'
      : inParty()
        ? 'Click an item to equip it. Shift-click to scrap it. Ctrl-click to drop it on the ground for a friend. A green arrow marks an upgrade.'
        : 'Click an item to equip it. Shift-click to break it down into scrap for the blacksmith. A green arrow marks an upgrade. The fight is paused while this is open.';
    const panel = $('trade-panel');
    panel.classList.toggle('hidden', !trade || trade.state !== 'open');
    if (!trade || trade.state !== 'open') return;
    $('trade-title').textContent = `Trading with ${trade.with}`;
    $('trade-their-label').textContent = `${trade.with}'s offer`;
    const fill = (el, items) => {
      el.innerHTML = '';
      if (!items.length) el.innerHTML = '<span class="empty-note">Nothing yet</span>';
      for (const it of items) el.appendChild(itemCell(tooltip, it, { compareTo: world.player.equipped[it.slot] }));
    };
    fill($('trade-mine'), trade.mine.items);
    fill($('trade-theirs'), trade.theirs.items);
    const g = $('trade-gold');
    if (document.activeElement !== g) g.value = trade.mine.gold;
    g.max = world.player.gold;
    $('trade-their-gold').textContent = trade.theirs.gold ? `+ ${trade.theirs.gold.toLocaleString()} gold` : '';
    $('trade-mine').parentElement.classList.toggle('ok', trade.mine.ok);
    $('trade-theirs').parentElement.classList.toggle('ok', trade.theirs.ok);
    $('trade-status').textContent = trade.mine.ok && trade.theirs.ok ? 'Swapping…' : trade.mine.ok ? `Waiting for ${trade.with} to accept.` : trade.theirs.ok ? `${trade.with} has accepted. Accept to swap.` : 'Neither of you has accepted yet.';
    $('btn-trade-ok').disabled = trade.mine.ok;
  }
  $('trade-gold').addEventListener('change', () => trade && applyNow({ type: 'tradeSet', items: trade.mine.ids, gold: Number($('trade-gold').value) || 0 }));
  $('btn-trade-ok').addEventListener('click', () => applyNow({ type: 'tradeOk' }));
  $('btn-trade-cancel').addEventListener('click', () => applyNow({ type: 'tradeCancel' }));
  $('btn-trade-yes').addEventListener('click', () => {
    $('trade-ask').classList.add('hidden');
    applyNow({ type: 'tradeAnswer', yes: true });
  });
  $('btn-trade-no').addEventListener('click', () => {
    $('trade-ask').classList.add('hidden');
    applyNow({ type: 'tradeAnswer', yes: false });
  });
  const town = new Town(tooltip, applyNow, (startWave) => startRun(save, startWave));

  /** Pick the music for where the player is right now. */
  function tune() {
    let id;
    if (mode === 'defeat') id = null;
    else if (mode === 'title' || mode === 'town' || (mode === 'gear' && gearReturn === 'town')) id = 'haven';
    else if (world.mode === 'explore') {
      const guardian = world.rift && world.rift.state === 'guardian' ? world.enemies.find((e) => e.riftGuardian) : null;
      id = guardian ? BOSS_SONG[guardian.type] : world.map.song || MAP_SONG[world.map.theme]; // a rift's guardian brings its own theme; a map may have its own song
    }
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
    for (const id of ['title', 'town', 'pause', 'defeat', 'augment', 'travel', 'talk', 'read', 'journal', 'casebook', 'talents', 'transfer', 'mp', 'trial']) $(id).classList.toggle('hidden', mode !== id);
    $('watch-badge').classList.toggle('hidden', mode !== 'watch');
    $('inventory').classList.toggle('hidden', mode !== 'gear');
    tooltip.hide();
    if (mode === 'gear') inventory.render(world);
    if (mode === 'gear') renderTrade();
    if (mode === 'town') {
      town.render(world);
      renderHall();
    }
    if (mode === 'augment') renderOffer();
    if (mode === 'travel') renderTravel();
    if (mode === 'talk') renderTalk();
    if (mode === 'read') renderRead();
    if (mode === 'journal') renderJournal();
    if (mode === 'casebook') openCasebook();
    if (mode === 'talents') renderTalents();
    talentBadge();
    if (mode === 'title') refreshTitle();
    tune();
    // "ends this run" is only true of an Echo Ring run (exploring just saves; the Weekly Echo says so on its button).
    if (mode === 'pause') $('pause-run-note').classList.toggle('hidden', world.mode !== 'arena' || !!trialRun);
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
    // A brand-new character starts on the road: the Echo Ring button only shows once there are shards to spend.
    fresh.classList.toggle('hidden', !has && account.tickets < 1);
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
        d.innerHTML = `<span class="${cl}">${name}</span><b>${rec && rec.wave ? `wave ${rec.wave}` : '—'}${rec && rec.rift ? ` · rift ${rec.rift.tier}` : ''}</b>`;
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
  let travelStone = null; // the waystone the travel menu was opened from (null: the town Waygate)
  let riftPick = null; // the rift tier chosen at the Waygate
  /** The Waygate's endgame part (0.26): the world tier and Echo Rifts. */
  function renderEndgame(root) {
    const p = world.player;
    const lead = !(net && net.role === 'client') || !!(net && net.server); // (0.55.2) on the server, everyone leads themselves
    const sub = (text) => {
      const h = document.createElement('p');
      h.className = 'travel-sub';
      h.textContent = text;
      root.appendChild(h);
    };
    const note = (text) => {
      const d = document.createElement('p');
      d.className = 'setting-desc';
      d.textContent = text;
      root.appendChild(d);
    };
    if (p.tierMax >= 2) {
      sub('World tier');
      const row = document.createElement('div');
      row.className = 'tier-row';
      const cur = world.worldTier();
      for (let t = 1; t <= MAX_TIER; t++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost tiny' + (t === cur ? ' on' : '');
        b.textContent = `${TIERS[t].numeral} · ${TIERS[t].name}`;
        b.disabled = t > p.tierMax || !lead;
        b.title = t > p.tierMax ? 'Beat The Unmade on the tier before to open this one' : t === 1 ? 'The world as it was' : `Every map at level 100: enemies ${TIERS[t].hp}x health, ${TIERS[t].dmg}x damage; ${TIERS[t].exp}x EXP, more and better loot, more elites`;
        b.addEventListener('click', () => {
          applyNow({ type: 'setTier', tier: t });
          renderTravel();
        });
        row.appendChild(b);
      }
      root.appendChild(row);
      note(lead ? 'Every map out in the world uses this tier. Beat The Unmade on your highest tier to open the next.' : 'The party leader picks the world tier.');
    }
    // The Deep (0.54, Act III): not a world tier. Its own box, its own rule.
    const rb = p.rebirth || {};
    if ((rb.deepMax || 0) > 0 || (p.endings && p.endings.self > 0 && rb.n >= 1)) {
      const box = document.createElement('div');
      box.className = 'deep-box';
      const ember = world.ember();
      box.innerHTML = `<div class="deep-title">The Deep</div><p class="deep-warn">The Deep does not scale to you. Ember decides whether you can touch what lives there: short of what a Depth asks, your blows barely land; below half of it, every one is 1.</p><p class="deep-ember">Your Ember: <b>${ember}</b> <span>(up to +${DEEP.emberMax} a rebirth, by how built-up your gear is when you go; +${DEEP.kindlingMax} from each Depth's Kindling)</span></p>`;
      const row = document.createElement('div');
      row.className = 'deep-row';
      const above = document.createElement('button');
      above.type = 'button';
      above.className = 'ghost tiny' + (!p.depth ? ' on' : '');
      above.textContent = 'The world above';
      above.disabled = !lead;
      above.addEventListener('click', () => {
        applyNow({ type: 'setDepth', depth: 0 });
        renderTravel();
      });
      row.appendChild(above);
      for (const d of DEPTH_IDS) {
        const D = DEEP.depths[d];
        const open = world.depthOpen(p, d);
        const s = emberScale(ember, D.ember);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'deep-btn' + (p.depth === d ? ' on' : '') + (open && s.dealt < 1 ? ' short' : '');
        b.innerHTML = `<b>${D.numeral}</b> ${D.name}<span>Ember ${D.ember}${open ? (s.one ? ' · you cannot hurt anything' : s.dealt < 1 ? ` · ${Math.round(s.dealt * 100)}% damage` : '') : ''}</span>`;
        b.disabled = !open || !lead;
        b.title = open ? `Every map at Depth ${D.numeral}: enemies ${D.hp}x tier V health and ${D.dmg}x damage, ${D.exp}x EXP, an Ember requirement of ${D.ember}. ${D.name}, the domain of the Primordial of ${D.title}, is by the Waygate.` : p.level < DEEP.level ? 'Level 100 first, in this life' : 'Opened by the story (Elder Wren knows where it begins)';
        b.addEventListener('click', () => {
          applyNow({ type: 'setDepth', depth: d });
          renderTravel();
        });
        row.appendChild(b);
      }
      box.appendChild(row);
      root.appendChild(box);
    }
    sub('Echo Rift');
    if (!(p.bossKills.boss > 0)) {
      note('Rifts open once you have beaten The Warden out in the world.');
      return;
    }
    if (riftPick == null || riftPick > p.riftMax) riftPick = p.riftMax;
    const row = document.createElement('div');
    row.className = 'rift-row';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'ghost tiny';
    minus.textContent = '−';
    const label = document.createElement('span');
    label.className = 'rift-tier';
    label.textContent = `Tier ${riftPick}`;
    const plus = minus.cloneNode();
    plus.textContent = '+';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'primary';
    go.textContent = 'Enter · 1 shard';
    go.disabled = !lead || p.tickets < 1;
    minus.disabled = riftPick <= 1;
    plus.disabled = riftPick >= p.riftMax;
    minus.addEventListener('click', () => { riftPick--; renderTravel(); });
    plus.addEventListener('click', () => { riftPick++; renderTravel(); });
    go.addEventListener('click', () => {
      setMode('play');
      applyNow({ type: 'enterRift', tier: riftPick });
    });
    row.append(minus, label, plus, go);
    root.appendChild(row);
    note(`${Math.round(RIFT.time / 60)} minutes to clear enough of a random map to call its guardian, then beat it. In time, the next tier opens, you get your shard back and a pile of loot. Highest tier so far: ${p.riftMax - 1 > 0 ? p.riftMax - 1 : 'none yet'}${p.riftBest ? ` (best ${p.riftBest.tier} in ${Math.floor(p.riftBest.secs / 60)}:${String(p.riftBest.secs % 60).padStart(2, '0')})` : ''}.${lead ? '' : ' The party leader opens rifts.'}${p.tickets < 1 ? ' You have no shards.' : ''}`);
  }
  function renderTravel() {
    const list = $('travel-list');
    list.innerHTML = '';
    const p = world.player;
    // From a waystone: the other waystones on this map come first (only you go there).
    const here = $('travel-here');
    here.innerHTML = '';
    const stones = travelStone != null ? world.map.waystones || [] : [];
    $('travel-eyebrow').textContent = travelStone != null ? 'Waystone' : 'Waygate';
    $('travel-desc').textContent = travelStone != null
      ? (world.party || (net && net.role === 'client') ? 'Jump to another waystone on this map (just you), or take the whole party to another map.' : 'Jump to another waystone on this map, or travel to another map.')
      : 'The Waygate reaches any map you have walked into. Maps you have not found yet stay locked: get there on foot through the portals first.';
    if (stones.length) {
      const h = document.createElement('p');
      h.className = 'travel-sub';
      h.textContent = 'On this map';
      here.appendChild(h);
      stones.forEach((ws, i) => {
        if (i === travelStone) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'travel-row fit';
        btn.innerHTML = `<b>${esc(ws.name)}</b><span>${i === 0 ? 'By the way in, where fallen friends wake up' : 'On the far side of the map'}</span>`;
        btn.addEventListener('click', () => {
          setMode('play');
          applyNow({ type: 'warp', to: i });
        });
        here.appendChild(btn);
      });
      const h2 = document.createElement('p');
      h2.className = 'travel-sub';
      h2.textContent = 'Other maps';
      here.appendChild(h2);
      if (world.map.id !== 'town') {
        const home = document.createElement('button');
        home.type = 'button';
        home.className = 'travel-row';
        home.innerHTML = '<b>Haven</b><span>Back to town: heal, shop, and the Waygate</span>';
        home.addEventListener('click', () => {
          setMode('play');
          applyNow({ type: 'travel', to: 'town' });
        });
        here.appendChild(home);
      }
    }
    if (travelStone == null && world.map.safe) renderEndgame(here);
    for (const id of MAP_IDS) {
      const m = MAPS[id];
      if (m.safe || id === world.map.id) continue;
      if (m.fromTier) {
        // The Wilds (0.33), Asterfell (0.39): by the Waygate only, from world tier II; Asterfell
        // only once Wren has told you about it (unseen until her quest is taken).
        const told = !m.unlock || world.questState(m.unlock) === 'done';
        if (m.unlock && !world.questState(m.unlock)) continue;
        const open = told && world.worldTier() >= m.fromTier;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'travel-row' + (open ? ' fit' : '');
        btn.disabled = !open;
        const why = !told ? `Finish ${QUESTS[m.unlock].name} first` : `Opens on world tier ${['', 'I', 'II', 'III', 'IV', 'V'][m.fromTier] || m.fromTier}`;
        btn.innerHTML = `<b>${m.name}</b><span class="lv">World tier ${m.fromTier === 2 ? 'II' : m.fromTier}+</span><span>${open ? m.blurb : why}</span>`;
        btn.addEventListener('click', () => {
          setMode('play');
          applyNow({ type: 'travel', to: id });
        });
        list.appendChild(btn);
        continue;
      }
      if (m.deep) {
        // The Deep (0.54): each Primordial's domain, once its Depth is open
        if (!((p.rebirth && p.rebirth.deepMax) >= m.deep)) continue;
        const open = world.depthOpen(p, m.deep);
        const D = DEEP.depths[m.deep];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'travel-row deep-travel' + (open ? ' fit' : '');
        btn.disabled = !open;
        btn.innerHTML = `<b>${m.name}</b><span class="lv">Depth ${D.numeral} · Ember ${D.ember}</span><span>${open ? m.blurb : 'Level 100 first, in this life'}</span>`;
        btn.addEventListener('click', () => {
          setMode('play');
          applyNow({ type: 'travel', to: id });
        });
        list.appendChild(btn);
        continue;
      }
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
    const q = QUESTS[id];
    if (q.reward.unique && q.reward.unique[world.cls]) parts.push(`<span style="color:${RARITIES[6].color}">Edric's Sword (unique)</span>`);
    if (q.reward.keepsake) parts.push(`<span style="color:${RARITIES[6].color}">Edric's Colours: a keepsake ring in its own slot, always your level, kept through rebirth</span>`);
    if (q.reward.glow) parts.push(`${GLOWS[q.reward.glow].name} weapon glow`);
    if (id === 'scarf2') parts.push('a keepsake, maybe');
    return parts.join(' · ');
  }

  /** The travelling merchant's wares (0.31), in the conversation panel. */
  function renderMerchant() {
    const mc = world.merchant;
    const p = world.player;
    $('talk-role').textContent = 'Wanders the roads';
    $('talk-name').textContent = 'Travelling Merchant';
    const list = $('talk-quests');
    list.innerHTML = '';
    $('talk-keys').classList.add('hidden');
    if (!mc) {
      $('talk-line').textContent = 'He has packed up and gone.';
      return;
    }
    $('talk-line').textContent = talkNote || `"Wishes, mostly. Other people's. Don't ask what's in the bag; that's what you're paying for." (Leaves in ${Math.ceil(mc.left / 60)} minute${mc.left > 60 ? 's' : ''}. You have ${p.gold} gold and ${p.tickets} shard${p.tickets === 1 ? '' : 's'}.)`;
    mc.stock.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'quest';
      const price = s.gold ? `${s.gold.toLocaleString()} gold` : `${s.tickets} shard${s.tickets === 1 ? '' : 's'}`;
      el.innerHTML = `<h4>${esc(s.label)}<small>${price}</small></h4>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = s.sold ? 'ghost' : 'primary';
      btn.textContent = s.sold ? 'Sold' : `Buy · ${price}`;
      btn.disabled = s.sold || p.gold < s.gold || p.tickets < s.tickets;
      btn.addEventListener('click', () => { talkNote = ''; applyNow({ type: 'buyMerchant', i }); });
      el.appendChild(btn);
      list.appendChild(el);
    });
  }

  /** The bounty board in Haven (0.33): three jobs, each worth Immortal Fragments and something more. */
  function rewardLine(r) {
    const parts = [`${r.fragments} Immortal Fragments`];
    if (r.tickets) parts.push(`${r.tickets} starglass shard${r.tickets > 1 ? 's' : ''}`);
    if (r.dust) parts.push(`${r.dust} Wishdust`);
    if (r.gold) parts.push(`${r.gold.toLocaleString()} gold`);
    if (r.sigil) parts.push('a Remnant Sigil');
    if (r.glass) parts.push('an Unwishing Glass');
    return parts.join(' · ');
  }
  function renderBounties() {
    const p = world.player;
    $('talk-role').textContent = 'Jobs for anyone handy';
    $('talk-name').textContent = 'Bounty Board';
    const list = $('talk-quests');
    list.innerHTML = '';
    $('talk-keys').classList.add('hidden');
    const frags = (p.misc && p.misc.fragment) || 0;
    $('talk-line').textContent = talkNote || `Notes pinned three deep by the people of Haven. Finish one anywhere, then come back here for the reward. (You have ${frags} Immortal Fragment${frags === 1 ? '' : 's'}: ${FRAGMENTS.craft} craft an Immortal on the gear screen, from level ${FRAGMENTS.craftLevel}.)`;
    if (world.trial || !p.bounties || !p.bounties.length) {
      $('talk-line').textContent = 'The notes are all for people who live here. Come back on your own road.';
      return;
    }
    const swap = Math.round(BOUNTY.swapGold * (1 + p.level / 10));
    p.bounties.forEach((b, i) => {
      const el = document.createElement('div');
      el.className = 'quest' + (b.done ? ' ready done-bounty' : '');
      el.innerHTML = `<h4>${esc(b.text)}</h4><div class="bounty-prog">${b.done ? 'Done: take the reward' : b.need > 1 ? `${b.n} / ${b.need}` : 'Not yet'}${b.pre ? ` <span class="muted">(${b.pre} from what you had already done)</span>` : ''}</div><div class="rewards">Reward: ${rewardLine(b.reward)}</div>`;
      const row = document.createElement('div');
      row.className = 'bounty-btns';
      const btn = document.createElement('button');
      btn.type = 'button';
      if (b.done) {
        btn.className = 'primary';
        btn.textContent = 'Take the reward';
        btn.addEventListener('click', () => { talkNote = ''; applyNow({ type: 'claimBounty', i }); });
      } else {
        btn.className = 'ghost';
        btn.textContent = `Swap for another · ${swap} gold`;
        btn.disabled = p.gold < swap;
        btn.addEventListener('click', () => { talkNote = ''; applyNow({ type: 'swapBounty', i }); });
      }
      row.appendChild(btn);
      el.appendChild(row);
      list.appendChild(el);
    });
  }

  /** A boss's altar (0.33): press a Remnant Sigil in to call its Remnant now. */
  /** Red Scarf, Part Two (0.47): Tomas on the Greenwood road, and the choice. */
  function renderTomasHusk() {
    const npc = NPCS.tomashusk;
    $('talk-role').textContent = npc.role;
    $('talk-name').textContent = npc.name;
    $('talk-keys').classList.add('hidden');
    $('talk-line').textContent = talkNote || npc.greet;
    const list = $('talk-quests');
    list.innerHTML = '';
    const choose = (label, text, choice) => {
      const el = document.createElement('div');
      el.className = 'quest well-choice';
      el.innerHTML = `<p>${esc(text)}</p>`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = choice === 'rest' ? 'primary' : 'ghost';
      b.textContent = label;
      b.addEventListener('click', () => { setMode('play'); applyNow({ type: 'scarfChoice', choice }); });
      el.appendChild(b);
      list.appendChild(el);
    };
    choose('Untie the scarf', 'Unwind the red scarf, gently. Without it he stops, and stands, and lies down in the grass by the road as if he had only been waiting for someone to say he could. Pip will have his scarf, and will know.', 'rest');
    choose('Let him keep walking', 'Step aside. He goes on toward Haven, the way he always has, and does not get there. Pip will not know. Some day, maybe, he will get there after all.', 'walk');
    const note = document.createElement('p');
    note.className = 'setting-desc';
    note.textContent = 'You cannot take this back.';
    list.appendChild(note);
  }

  /** The palace stair (0.46): go down into an Asterfell delve, at any world tier you have reached. */
  function renderDelve() {
    const p = world.player;
    $('talk-role').textContent = 'Asterfell, under the palace';
    $('talk-name').textContent = 'The palace stair';
    $('talk-keys').classList.add('hidden');
    $('talk-line').textContent = talkNote || `A stair of starglass goes down under the palace, room after room, to the Throne Room. Every room must be cleared before the next one opens; something waits beside the empty throne. Higher tiers go deeper. The first clear of each tier gives a Remnant Sigil and an Unwishing Glass.${p.delveBest ? ` (Cleared up to tier ${TIERS[p.delveBest].numeral}.)` : ''}`;
    const list = $('talk-quests');
    list.innerHTML = '';
    const leader = !net || net.role === 'host' || !!net.server;
    for (let t = 1; t <= p.tierMax; t++) {
      const rooms = 3 + (t >= 3 ? 1 : 0) + (t >= 5 ? 1 : 0);
      const el = document.createElement('div');
      el.className = 'quest';
      el.innerHTML = `<h4>Tier ${TIERS[t].numeral} · ${TIERS[t].name}<small>${rooms} rooms</small></h4><div class="goal">${(p.delveBest || 0) >= t ? 'Cleared' : 'Not cleared yet: a Remnant Sigil and an Unwishing Glass the first time'}</div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'primary';
      btn.textContent = leader ? 'Go down' : 'The party leader leads the way';
      btn.disabled = !leader;
      btn.addEventListener('click', () => { setMode('play'); applyNow({ type: 'enterDelve', tier: t }); });
      el.appendChild(btn);
      list.appendChild(el);
    }
  }

  /** The Starwell after the Asker (0.45): the ending's choice. */
  function renderWell() {
    const p = world.player;
    const glass = (p.misc && p.misc.glass) || 0;
    const seen = p.endings && p.endings.self > 0;
    $('talk-role').textContent = 'Where the star came down';
    $('talk-name').textContent = 'The Starwell';
    $('talk-keys').classList.add('hidden');
    const list = $('talk-quests');
    list.innerHTML = '';
    $('talk-line').textContent = talkNote || (glass ? WELL.first : WELL.noGlass);
    const alone = !net || !!net.server; // (0.55.2) on the server, the Unwish is yours alone
    const add = (label, text, on, cls) => {
      const el = document.createElement('div');
      el.className = 'quest well-choice';
      el.innerHTML = `<p>${esc(text)}</p>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = cls;
      btn.textContent = label;
      btn.disabled = !on;
      el.appendChild(btn);
      list.appendChild(el);
      return btn;
    };
    const self = add(alone ? 'Unwish yourself' : 'Unwish yourself (alone only: leave the party first)', WELL.self, glass > 0 && alone, 'primary');
    self.addEventListener('click', () => { setMode('play'); applyNow({ type: 'unwish', choice: 'self' }); });
    const place = add(seen ? 'Take her place (New Game+)' : 'Take her place', seen ? WELL.place : WELL.placeLocked, seen && alone && world.player.level >= 100, 'ghost');
    let sure = false;
    place.addEventListener('click', () => {
      if (!sure) {
        sure = true;
        place.textContent = 'Are you sure? Click again: a full rebirth, into New Game+';
        return;
      }
      setMode('play');
      applyNow({ type: 'unwish', choice: 'place' });
    });
  }

  /** The credits (0.45): after the Unwish, then home. */
  function rollCredits(first) {
    const box = $('credits');
    const inner = $('credits-roll');
    inner.innerHTML = CREDITS.map(([h, t]) => (h ? `<h3>${esc(h)}</h3><p>${esc(t)}</p>` : `<p class="beat">${esc(t)}</p>`)).join('');
    box.classList.remove('hidden');
    inner.style.animation = 'none';
    void inner.offsetWidth;
    inner.style.animation = '';
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      box.classList.add('hidden');
      applyNow({ type: 'travel', to: 'town' });
      hud.banner(first ? 'After the wish' : 'Unwished, again', 'Haven is waiting. The world goes on.');
    };
    box.onclick = end;
    setTimeout(end, 44000);
  }

  function renderAltar() {
    if (world.map && world.map.id === 'starwell') return renderWell();
    const p = world.player;
    const alt = world.bossAltar();
    $('talk-role').textContent = 'Where the boss stood';
    $('talk-name').textContent = alt ? alt.name : 'The altar';
    const list = $('talk-quests');
    list.innerHTML = '';
    $('talk-keys').classList.add('hidden');
    if (!alt) {
      $('talk-line').textContent = 'Something already stands here.';
      return;
    }
    const sig = (p.misc && p.misc.sigil) || 0;
    const beaten = (world.heroes[0].player.bossKills[alt.type] || 0);
    const after = REMNANT.after;
    $('talk-line').textContent = talkNote || (beaten < after
      ? `The stones are cold. Its Remnant only answers once the boss has been beaten ${after} times (${beaten} so far${world.party ? ', by the party leader' : ''}).`
      : `The rune hums under your feet. A Remnant Sigil pressed in here would call up its Remnant now. You have ${sig}. Storied enemies and world events sometimes drop them.`);
    const el = document.createElement('div');
    el.className = 'quest';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = sig > 0 && beaten >= after ? 'primary' : 'ghost';
    btn.textContent = sig > 0 ? 'Press in a Remnant Sigil' : 'You have no Remnant Sigil';
    btn.disabled = !(sig > 0) || beaten < after;
    btn.addEventListener('click', () => { setMode('play'); applyNow({ type: 'summonRemnant' }); });
    el.appendChild(btn);
    list.appendChild(el);
  }

  function renderTalk() {
    if (talkTo === 'merchant') return renderMerchant();
    if (talkTo === 'bounties') return renderBounties();
    if (talkTo === 'altar') return renderAltar();
    if (talkTo === 'delve') return renderDelve();
    if (talkTo === 'tomashusk') return renderTomasHusk();
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
      if (q.giver !== (npc.as || talkTo)) continue; // (0.47) Lark keeps Odile's quests
      if (talkTo === 'odile' && world.map && world.map.id === 'hollow' && id !== 'tobin') continue; // in the garden, only her ending
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
      el.innerHTML = `<h4>${esc(q.name)}<small>level ${q.level}</small></h4><p>${esc(st === 'ready' ? (id === 'scarf2' && world.player.choices && world.player.choices.scarf === 'walk' ? q.doneAlt : q.done) : q.offer)}</p><div class="goal">${goalText(q)}${prog}</div><div class="rewards">Reward: ${rewardText(id)}</div>`;
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
    const after = world.afterWish() && npc.after; // (0.45) after the Unwish, Haven talks differently
    if (talkTo === 'odile' && world.map && world.map.id === 'hollow') {
      // An Ending for Tobin (0.47): she is at the heart of the garden
      if (world.questState('tobin') === 'active') {
        $('talk-line').textContent = 'She is kneeling in the moss beside what is left of him, holding his hand. She does not look up. "Sit with us a moment. Then go home."';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'primary';
        b.textContent = 'Sit with them';
        b.addEventListener('click', () => { applyNow({ type: 'meetOdile' }); renderTalk(); });
        $('talk-quests').prepend(b);
        return;
      }
      if (world.questState('tobin') === 'done') {
        const waitingHere = QUEST_IDS.some((id) => QUESTS[id].giver === 'odile' && world.questState(id) === 'ready');
        $('talk-line').textContent = npc.garden + (waitingHere ? ' Anything you did for me, take to Lark at my stall in Haven. She has my notes, and the rewards.' : '');
        return;
      }
    }
    const ch = world.player.choices && world.player.choices.scarf;
    if (talkTo === 'pip' && ch && !shown && !after) { $('talk-line').textContent = npc[ch]; return; }
    $('talk-line').textContent = talkTo === 'tomas' ? (world.player.tomasMet ? npc.idle : npc.greet) : talkNote || (after && !shown ? npc.after : shown ? npc.greet : npc.idle + (later !== null && world.player.level < later - 4 ? ` (More at level ${later - 4}.)` : ''));
    if (talkTo === 'tomas' && !world.player.tomasMet) applyNow({ type: 'metTomas' });
  }

  function renderRead() {
    const sg = SIGNS[reading];
    if (!sg) return;
    $('read-where').textContent = MAPS[sg.map].name;
    $('read-title').textContent = sg.title;
    $('read-text').textContent = sg.after && world.afterWish() ? sg.after : sg.text;
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
      qs.push(`<div class="quest ${st.s === 'ready' ? 'ready' : ''}"><h4>${esc(q.name)}<small>${NPCS[world.questTaker(q.giver)].name}</small></h4><div class="goal">${st.s === 'ready' ? 'Done. Return to ' + NPCS[world.questTaker(q.giver)].name + ' in Haven.' : goalText(q) + (need > 1 ? ` · ${st.n}/${need}` : '')}</div><div class="rewards">Reward: ${rewardText(id)}</div></div>`);
    }
    const waiting = ['wren', 'bram', 'odile', 'lark', 'pip'].filter((n) => world.npcMarker(n) === '!').map((n) => NPCS[n].name);
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

  // --------------------------------------------------------- the Casebook (0.56)
  const book = () => account.casebook;
  function openCasebook() {
    const b = book();
    b.unread = 0;
    caseBadge();
    saveBook();
    if (!caseSel) caseSel = Casebook.firstPage(b);
    renderCasebook();
  }
  function renderCasebook() {
    const b = book();
    const visited = world.player.visited || [];
    const detail = !!settings.caseDetail !== caseShift; // Shift flips whichever view is set
    const list = Casebook.listHtml(b, caseSel, visited);
    $('case-list').innerHTML = list.html;
    $('case-count').textContent = `${list.rested} of ${list.total} laid to rest`;
    $('case-detail').checked = !!settings.caseDetail;
    $('case-page').innerHTML = Casebook.pageHtml(b, caseSel, detail, visited);
    $('case-page').classList.toggle('detail', detail);
  }
  function caseBadge() {
    const n = book().unread || 0;
    const el = $('casebook-badge');
    el.textContent = n > 9 ? '9+' : n;
    el.classList.toggle('hidden', !n);
  }
  function saveBook() {
    // Written on its own (a friend in a room or on a server never runs persist), a moment after it changes.
    if (caseSaveT) return;
    caseSaveT = setTimeout(() => {
      caseSaveT = null;
      if (!stale) storeAccount(account);
    }, 1500);
  }
  /** Something worth a page happened: note it, and say so if it opened something. */
  function caseNote(kind, type, extra) {
    if (watching || !type) return; // a replay of someone else's run teaches you nothing
    const line = Casebook.note(book(), kind, type, extra);
    saveBook();
    if (!line) return;
    hud.feedText(`${line} (B)`);
    caseBadge();
    if (mode === 'casebook') renderCasebook();
  }
  /** Bosses and enemies close enough to see. A few times a second is plenty. */
  function caseScan(now) {
    if (now < caseScanAt || watching || !world.enemies) return;
    caseScanAt = now + 400;
    const p = world.player;
    if (!p || p.dead) return;
    for (const e of world.enemies) {
      if (e.dead || !e.type || book().seen[e.type]) continue;
      if (Casebook.near(p, e.x, e.z, Casebook.RANGES.seen)) caseNote('seen', e.type);
    }
  }

  // --------------------------------------------------------- subclasses and talents
  function talentBadge() {
    const p = world.player;
    // A Weekly Echo build is set on its own screen before the run, so nothing to spend here.
    const perkable = p.rebirth && PERK_IDS.some((id) => perkRank(p.rebirth, id) < PERKS[id].max && p.rebirth.marks >= PERKS[id].cost) ? 1 : 0; // Starmarks to spend (0.43)
    const n = world.trial ? 0 : !p.spec && p.level >= CONFIG.SPEC_LEVEL ? '!' : (p.spec ? world.talentPoints() : 0) + (p.wishPts || 0) + perkable;
    const b = $('talent-badge');
    b.textContent = n;
    b.classList.toggle('hidden', !n);
  }

  /** Wishborne (0.26): past level 100, Wish points go into small, endless bonuses. */
  function renderWish() {
    const p = world.player;
    const panel = $('wish-panel');
    const show = p.level >= CONFIG.MAX_LEVEL && !world.trial;
    panel.classList.toggle('hidden', !show);
    if (!show) return;
    panel.innerHTML = `<h3>Wishborne ${p.wish}</h3><p class="setting-desc">Past level 100, EXP fills Wishborne levels: each one is a Wish point for a small bonus with no limit. ${p.wishPts ? `<b>${p.wishPts} point${p.wishPts === 1 ? '' : 's'} to spend.</b> Shift-click adds 10.` : 'No points to spend right now.'}</p>`;
    for (const k of WISH_IDS) {
      const st = WISH_STATS[k];
      const n = (p.wishStats && p.wishStats[k]) || 0;
      const row = document.createElement('div');
      row.className = 'wish-row';
      row.innerHTML = `<span>${st.name}</span><span class="v">+${+(st.each * n).toFixed(1)}${st.unit}</span><span class="v">${n}</span>`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost tiny';
      b.textContent = '+';
      b.disabled = !p.wishPts;
      b.title = `+${st.each}${st.unit} per point`;
      b.addEventListener('click', (ev) => {
        applyNow({ type: 'wishSpend', stat: k, n: ev.shiftKey ? 10 : 1 });
        renderTalents();
      });
      row.appendChild(b);
      panel.appendChild(row);
    }
    // An Unwishing Glass (0.32) takes every spent point back.
    const spent = Object.values(p.wishStats || {}).reduce((a, b) => a + (b || 0), 0);
    const glass = (p.misc && p.misc.glass) || 0;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ghost tiny wish-reset';
    reset.textContent = glass ? `Reset with an Unwishing Glass (you have ${glass})` : 'Reset: needs an Unwishing Glass';
    reset.title = 'Takes back every Wish point you have spent, to spend again. Unwishing Glass comes from the travelling merchant, Remnants, the Wishthief and Storied enemies.';
    reset.disabled = !glass || !spent;
    reset.addEventListener('click', () => {
      applyNow({ type: 'wishReset' });
      renderTalents();
    });
    panel.appendChild(reset);
  }

  /** Rebirth (0.43): Starmarks, perks, and the choice to begin again. */
  let rebirthSure = false;
  let rebirthHeir = null; // (0.53) the slot kept as an Heirloom
  function renderRebirth() {
    const p = world.player;
    const panel = $('rebirth-panel');
    const rb = p.rebirth;
    const show = !world.trial && (p.level >= CONFIG.MAX_LEVEL || (rb && rb.n > 0));
    panel.classList.toggle('hidden', !show);
    if (!show) return;
    const block = rebirthBlock(p);
    const marks = world.rebirthMarks();
    const acct = Math.round(Math.min(REBIRTH.acctExpMax, REBIRTH.acctExp * (p.acctRebirths || 0)) * 100);
    panel.innerHTML = `<h3>Rebirth${rb.n ? ` · reborn ${rb.n} time${rb.n === 1 ? '' : 's'}` : ''}</h3>
      <p class="setting-desc rb-lore">The star grants exactly what is asked. Ask it to begin again and you will wake in Haven as if for the first time. It does not forget you.</p>
      <p class="setting-desc"><span class="rb-marks">${rb.marks} Starmark${rb.marks === 1 ? '' : 's'}</span> to spend${rb.earned ? ` (${rb.earned} earned in all)` : ''}. Perks last for every life after this one.${acct ? ` Every hero on this account gets +${acct}% EXP from your rebirths.` : ''}</p>`;
    for (const id of PERK_IDS) {
      const pk = PERKS[id];
      const r = perkRank(rb, id);
      const row = document.createElement('div');
      row.className = 'perk-row';
      row.innerHTML = `<span>${pk.name}</span><span class="v">${r ? pk.desc(r) : pk.each + ' a rank'}</span><span class="v">${r}/${pk.max}</span>`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost tiny';
      b.textContent = r >= pk.max ? 'Max' : `+ (${pk.cost})`;
      b.disabled = r >= pk.max || rb.marks < pk.cost;
      b.title = `${pk.each} a rank, for ${pk.cost} Starmark${pk.cost === 1 ? '' : 's'}`;
      b.addEventListener('click', () => {
        applyNow({ type: 'rebirthPerk', id });
        renderTalents();
      });
      row.appendChild(b);
      panel.appendChild(row);
    }
    // Echoes (0.53): one piece to keep as an Heirloom, and the Essence the rest turns into
    if (!block) {
      const heir = document.createElement('div');
      heir.className = 'perk-row heir-row';
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">No Heirloom</option>` + SLOTS.filter((s) => p.equipped[s]).map((s) => `<option value="${s}"${rebirthHeir === s ? ' selected' : ''}>${esc(itemName(p.equipped[s]))}</option>`).join('');
      sel.addEventListener('change', () => {
        rebirthHeir = sel.value || null;
        renderTalents();
      });
      heir.innerHTML = '<span>Heirloom</span><span class="v">kept, back at level 1, grows with you</span>';
      heir.appendChild(sel);
      panel.appendChild(heir);
      const ess = document.createElement('p');
      ess.className = 'setting-desc';
      ess.innerHTML = `The rest of your gear becomes <b>${world.rebirthEssence(rebirthHeir)} Echo Essence</b>, and the star remembers the best piece of each slot: in later lives, recall them at your level and bring them back up to what they were (gear screen).${p.rebirth.essence ? ` You have ${p.rebirth.essence} now.` : ''} Your gear, the Heirloom too, is worth <b>${world.rebirthEmber()} of ${DEEP.emberMax} Ember</b> for the Deep (rarity, +levels and stars).`;
      panel.appendChild(ess);
    }
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'ghost rb-go' + (rebirthSure ? ' sure' : '');
    const why = block || (net && !net.server ? 'Leave the room first: a rebirth is made alone.' : null);
    go.disabled = !!why;
    go.textContent = why ? `Begin again: ${why}` : rebirthSure
      ? `Are you sure? Click again to begin again with ${marks} Starmarks`
      : `Begin again · +${marks} Starmarks`;
    go.title = 'A full fresh start for this hero: level 1, no gear, scrap or Wishdust, the story, quests, world tiers, talents and Wishborne levels from the beginning. Gold is the account\'s and stays. Kept: Starmarks and perks, weapon glows. Starmarks: 10 for level 100, plus 2 x the square root of your Wishborne levels.';
    go.addEventListener('click', () => {
      if (!rebirthSure) {
        rebirthSure = true;
        renderTalents();
        return;
      }
      rebirthSure = false;
      applyNow({ type: 'rebirth', heirloom: rebirthHeir });
    });
    panel.appendChild(go);
    if (!block) {
      const note = document.createElement('p');
      note.className = 'setting-desc';
      note.textContent = `Begin again: level 1, a starter weapon (and your Heirloom, if you keep one). Your gear turns into Echo Essence; scrap, Wishdust, story, quests, world tiers, talents and ${p.wish || 0} Wishborne levels all go. Kept: Starmarks and perks, Echo Essence and the gear the star remembers, Edric's Colours, and your weapon glows (gold belongs to the account).`;
      panel.appendChild(note);
    }
  }

  function renderTalents() {
    renderWish();
    renderRebirth();
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
    if (pts > 0) {
      // 0.37.2: spend them all in one click (your last build in this subclass, if you had one)
      const auto = document.createElement('button');
      auto.type = 'button';
      auto.className = 'tal-auto';
      const kept = (p.talentBuilds && p.talentBuilds[p.spec]) || [];
      auto.textContent = kept.length ? `Spend ${pts} point${pts === 1 ? '' : 's'} like last time` : `Spend ${pts} point${pts === 1 ? '' : 's'} for me`;
      auto.title = kept.length
        ? `Puts your points back where you had them as ${sp.name} (in the order you spent them); any left over go to the deepest open row.`
        : 'Fills the deepest open row first, evening out the ranks. You can respec later for gold.';
      // a second click confirms (0.37.3), so a stray click cannot spend them
      auto.addEventListener('click', () => armThenRun(auto, `Click again to spend ${pts} point${pts === 1 ? '' : 's'}`, () => applyNow({ type: 'autoTalents' })));
      body.prepend(auto);
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
    // (0.54.8) the round trip: the friend's own, or the slowest friend's for the host
    let ping = 0, relay = false;
    if (net && net.role === 'client') {
      ping = net.ping || 0;
      relay = !!net.relay;
    }
    else if (net) for (const f of net.room.friends.values()) ping = Math.max(ping, f.rtt || 0);
    const players = net && net.server ? (net.roster ? net.roster.players.length : 1) : net && net.role === 'host' ? world.heroes.length : world.allies().length + 1;
    hud.setRoom(net ? { code: net.code, players, host: net.role === 'host', server: !!net.server, ping: Math.round(ping), relay } : null);
  }
  function openMp() {
    if (!settings.name) settings.name = 'Player ' + Math.floor(100 + Math.random() * 900);
    $('mp-name').value = settings.name;
    const c = CLASSES[settings.cls];
    $('mp-host-desc').textContent = `You play your ${c.name}${save ? ' (level ' + save.level + ')' : ''}; friends bring their own characters. Your browser runs the game for everyone, so keep this tab open.`;
    mpMsg('');
    setMode('mp');
  }

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
        // (0.54.8) A connection that is not keeping up gets no new update until it has caught up:
        // otherwise updates pile up in the send queue and everything that friend sees (and does)
        // falls further and further behind. The changes carry over, so nothing is lost.
        if (net.room.congested(pid)) {
          if (f.pending && f.pending.length > 400) f.pending.splice(0, f.pending.length - 400);
          continue;
        }
        const snap = makeSnapshot(world, pid, f.memo);
        if (!snap) continue;
        snap.ev = compactEvents(f.pending || []);
        f.pending = [];
        net.room.sendTo(pid, snap);
      }
    }
    if (net.tick % 300 === 0) {
      // every five seconds, only when something in it changed (0.54.8), and not into a backed-up connection
      for (const [pid, f] of net.room.friends) {
        const h = world.heroByPid(pid);
        if (!h || net.room.congested(pid)) continue;
        const sv = world.as(h, () => world.toSave());
        const gold = h === world.cur ? world.player.gold : h.player.gold;
        const key = JSON.stringify(sv) + gold + ':' + h.player.tickets;
        if (f.savedKey === key) continue;
        f.savedKey = key;
        net.room.sendTo(pid, { t: 'save', save: sv, gold, tickets: h.player.tickets });
      }
      persist();
    }
    if (net.tick % 120 === 0) updateRoomBadge();
  }

  async function joinGame() {
    const code = cleanCode($('mp-code').value);
    if (code.length !== 5) {
      mpMsg('A room code has five letters and numbers.', false);
      return;
    }
    mpMsg(`Joining room ${code}...`);
    return joinWith(new JoinRoom({ onMessage: onNetMessage, onClose: (why) => leaveRoom(why) }), code, code, $('btn-join'));
  }

  // (0.55) The server world: an always-on place on the game server, joined with its passcode.
  const DEFAULT_SERVER = (() => {
    try {
      const q = new URLSearchParams(location.search).get('server');
      if (q) return q;
    } catch (err) {
      /* no address bar */
    }
    return typeof __GAME_SERVER__ !== 'undefined' && __GAME_SERVER__ ? __GAME_SERVER__ : 'wss://play.stunnedgames.net';
  })();
  async function joinServer() {
    const url = $('mp-server').value.trim() || DEFAULT_SERVER;
    const pass = $('mp-pass').value;
    if (!pass) {
      mpMsg('Type the server world\'s passcode (ask whoever runs it).', false);
      return;
    }
    settings.serverUrl = url === DEFAULT_SERVER ? undefined : url;
    settings.serverPass = pass;
    storeSettings(settings);
    mpMsg('Joining the server world...');
    return joinWith(new ServerRoom({ onMessage: onNetMessage, onClose: (why) => leaveRoom(why) }), url, null, $('btn-server'), { pass });
  }

  async function joinWith(room, target, code, button, extra = {}) {
    const name = playerName();
    button.disabled = true;
    let welcome;
    try {
      welcome = await room.join(target, { name, save, cls: settings.cls, parry: settings.parryPreset, autoAttack: settings.autoAttack !== false, gold: account.gold, tickets: account.tickets, acctRebirths: account.rebirths || 0, ...extra });
    } catch (err) {
      button.disabled = false;
      mpMsg(err.message, false);
      return;
    }
    button.disabled = false;
    if (welcome.server) code = welcome.code;
    // This browser's world becomes a picture of the host's: it never steps, and commands go to the host.
    world = makeWorld({ save, mode: 'explore' });
    // Every command says which moment of the host's world this screen was showing (0.41.1), so the
    // host can judge a parry by what this player saw; moving and parrying also answer here at once.
    world.command = (cmd) => {
      const c = Object.assign({}, cmd, { seen: shownTick() });
      predictLocally(c);
      room.send({ t: 'cmd', cmd: c });
    };
    world.runCommands = () => {};
    world.step = () => {};
    world.cur.name = name;
    world.alliesList = [];
    net = { role: 'client', room, pid: welcome.pid, code, server: !!welcome.server, roster: null, snapAt: performance.now(), snapGap: 50, queue: [], nextAt: 0, lastTick: null, gapTicks: 3, intent: null, lagEst: 0.2, jitter: 0, ping: 0, dry: true };
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
      // Updates can arrive in bunches (the host's frame ran long, or the network hiccuped).
      // They wait here and are played back at the pace the host made them (see playSnapshots).
      if (!receiveSnapshot(world, msg)) {
        // One went missing (say, while joining): ask the host to start over with a full update.
        if (!net.resyncAt || performance.now() - net.resyncAt > 1000) {
          net.resyncAt = performance.now();
          net.room.send({ t: 'resync' });
        }
        return;
      }
      net.resyncAt = 0;
      // (0.54.8) how unevenly updates arrive: the playback stays that far behind, so it never runs dry
      const now = performance.now();
      if (net.arriveAt) {
        const late = Math.abs(now - net.arriveAt - (msg.tick != null && net.arriveTick != null ? (msg.tick - net.arriveTick) * CONFIG.TICK * 1000 : 50));
        net.jitter = net.jitter * 0.9 + Math.min(400, late) * 0.1;
      }
      net.arriveAt = now;
      net.arriveTick = msg.tick;
      net.queue.push(msg);
    } else if (msg.t === 'save') {
      save = msg.save;
      storeSave(save, world.cls);
      account.gold = msg.gold;
      account.tickets = msg.tickets;
      storeAccount(account);
    } else if (msg.t === 'chat') {
      chatLine(msg.from ? `${msg.from}: ${msg.text}` : msg.text, !msg.from);
    } else if (msg.t === 'roster') {
      net.roster = msg;
      updateRoomBadge();
      if (playersOpen) renderPlayers();
    } else if (msg.t === 'invite') {
      sfx.ui();
      hud.banner(`${msg.name} invites you`, 'to their party. Press O to see players and accept.');
      chatLine(`${msg.name} invites you to their party (O: Players).`, true);
    } else if (msg.t === 'pong') {
      const rtt = performance.now() - msg.at;
      net.ping = net.ping ? net.ping * 0.6 + rtt * 0.4 : rtt;
      updateRoomBadge();
    } else if (msg.t === 'closed') leaveRoom('The host closed the room.');
  }

  // (0.54.8) Friend: measure the round trip every two seconds (shown in the room badge), and whether
  // the connection goes straight between the two browsers or through a relay server.
  setInterval(() => {
    if (!net || net.role !== 'client') return;
    net.room.send({ t: 'ping', at: performance.now(), rtt: Math.round(net.ping || 0) });
    const pc = net.room.conn && net.room.conn.peerConnection;
    if (pc && pc.getStats && !net.relayChecked) {
      net.relayChecked = true;
      pc.getStats().then((stats) => {
        let pair = null;
        stats.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
        const local = pair && stats.get(pair.localCandidateId), remote = pair && stats.get(pair.remoteCandidateId);
        if (net) net.relay = !!((local && local.candidateType === 'relay') || (remote && remote.candidateType === 'relay'));
        updateRoomBadge();
      }).catch(() => {});
    }
  }, 2000);

  /** Friend side: play queued host updates back at an even pace, a little behind, so movement glides. */
  function playSnapshots(now) {
    const q = net.queue;
    // (0.54.8) keep a small cushion of updates in hand, sized to how unevenly they arrive; after
    // running dry, wait for it to refill rather than start and stop with every arrival
    // (0.55.1) sized in time: about twice the jitter, so 60 updates a second from a nearby server
    // keep one in hand (~17 ms), and 20 a second from a host across the city keep one or two
    const snapMs = Math.max(16, (net.gapTicks || 3) * CONFIG.TICK * 1000);
    const cushion = Math.max(1, Math.min(8, Math.ceil(Math.min(150, 8 + (net.jitter || 0) * 2) / snapMs)));
    net.cushion = cushion;
    if (!q.length) net.dry = true;
    if (net.dry && q.length < cushion) return;
    net.dry = false;
    if (!q.length || now < net.nextAt) return;
    // Running far behind (a long hitch): skip ahead, keeping the events of the skipped updates.
    while (q.length > cushion + 2) {
      const old = q.shift();
      for (const ev of old.ev || []) world.events.push(ev);
      if (old.heavy) q[0].heavy = { ...old.heavy, ...(q[0].heavy || {}) }; // heavy parts come one by one: keep every one
      if (old.map !== q[0].map) {
        q.unshift(old);
        break;
      }
    }
    const msg = q.shift();
    const alpha = Math.min(1, (now - net.snapAt) / net.snapGap);
    const gapTicks = net.lastTick == null || msg.tick == null ? 3 : Math.max(1, msg.tick - net.lastTick);
    net.lastTick = msg.tick;
    net.gapTicks = gapTicks;
    // Around the cushion, play at the host's pace; a little faster above it, a little slower below.
    const pace = q.length > cushion + 1 ? 0.8 : q.length > cushion ? 0.92 : q.length < cushion ? 1.1 : 1;
    // (0.54.11) Each glide lasts exactly until the next update is due, and keeps the beat it was due
    // on, not the frame that happened to notice it: before, a glide ended a frame early and the
    // picture stood still for one frame in four (the jerky movement).
    net.snapGap = Math.max(16, Math.min(250, gapTicks * CONFIG.TICK * 1000)) * pace;
    const due = net.nextAt && now - net.nextAt < 100 ? net.nextAt : now;
    net.snapAt = due;
    net.nextAt = due + net.snapGap;
    const allies = world.alliesList ? world.alliesList.length : 0;
    if (applySnapshot(world, msg, alpha)) world.events.push({ type: 'mapChange', id: world.map.id, name: world.map.name, from: null, hero: net.pid });
    for (const ev of msg.ev || []) world.events.push(ev);
    if (world.alliesList.length !== allies) updateRoomBadge();
    if (msg.heavy) refreshMenus();
  }

  /** Friend: the host tick this screen is showing right now (updates glide from one to the next). */
  function shownTick() {
    if (!net || net.lastTick == null) return null;
    const alpha = Math.min(1, (performance.now() - net.snapAt) / net.snapGap);
    return net.lastTick - net.gapTicks * (1 - alpha);
  }

  /**
   * Friend: what a command does here before the host answers (0.41.1). Moving starts at once
   * (drawn ahead of where the host has you, by about the round trip; see predictedOffset) and
   * the parry stance shows the moment it is pressed. The host's next updates take over.
   */
  function predictLocally(c) {
    const p = world.player;
    if (c.type === 'move' || (c.type === 'attackMove' && c.x != null)) {
      // (holding the button sends a new target every moment: the walk keeps going, so its lead does too)
      const prev = net.intent;
      net.intent = { x: c.x, z: c.z, t: prev ? prev.t : performance.now(), seenMove: prev ? prev.seenMove : false };
    }
    else if (c.type === 'stop' || c.type === 'attack' || c.type === 'cast' || c.type === 'warp' || c.type === 'travel') net.intent = null;
    if (c.type === 'parry' && !(p.parryT > 0) && !(p.parryCd > 0) && !p.dead) {
      const pre = CONFIG.PARRY_PRESETS[settings.parryPreset] || CONFIG.PARRY_PRESETS[CONFIG.DEFAULT_PARRY_PRESET];
      p.parryT = pre.window;
      p.parryAge = 0;
    }
  }

  /** Friend: how far ahead of the host's position to draw this player's own hero while it walks. */
  function predictedOffset(alpha) {
    const p = world.player;
    const it = net && net.intent;
    if (!it || p.dead || p.dash || p.leap) {
      if (net) net.intent = null;
      return null;
    }
    const now = performance.now();
    const ax = p.px + (p.x - p.px) * alpha, az = p.pz + (p.z - p.pz) * alpha;
    const dx = it.x - ax, dz = it.z - az;
    const d = Math.hypot(dx, dz);
    if (p.moving && !it.seenMove) {
      // the host has started the walk: how long that took is this connection's delay
      it.seenMove = true;
      net.lagEst = net.lagEst * 0.7 + Math.min(0.5, (now - it.t) / 1000) * 0.3;
    }
    if (d < 0.15 || now - it.t > 6000 || (it.seenMove && !p.moving && d < 1)) {
      net.intent = null;
      return null;
    }
    const speed = (p.stats && p.stats.ms) || 6;
    const lead = Math.min(d, speed * Math.min(net.lagEst, (now - it.t) / 1000));
    return { dx: (dx / d) * lead, dz: (dz / d) * lead, facing: Math.atan2(dz, dx) };
  }

  /**
   * (0.54.11) The drawn lead eases toward the predicted one instead of jumping to it: a new
   * direction, a stop or the host catching up used to move the hero a body-length in one frame.
   */
  function smoothPrediction(target, dt) {
    const s = net.predShown || (net.predShown = { dx: 0, dz: 0, facing: 0 });
    const tx = target ? target.dx : 0, tz = target ? target.dz : 0;
    const k = 1 - Math.exp(-dt * 9);
    s.dx += (tx - s.dx) * k;
    s.dz += (tz - s.dz) * k;
    if (target) s.facing = target.facing;
    if (!target && Math.hypot(s.dx, s.dz) < 0.02) return null;
    return { dx: s.dx, dz: s.dz, facing: target ? target.facing : world.player.facing };
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
    closePlayers();
    closeChat();
    save = loadSave(settings.cls);
    world = makeWorld({ save });
    resetViews();
    setMode('title');
    $('title-save').textContent = why;
  }

  function refreshMenus() {
    if (mode === 'gear') {
      inventory.render(world);
      renderTrade();
    }
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
  $('btn-server').addEventListener('click', joinServer);
  $('mp-server').value = settings.serverUrl || DEFAULT_SERVER;
  // (0.55.2) the list of server worlds, each with who is on right now; "Another address" for testing
  {
    const pick = $('mp-server-pick');
    const list = SERVERS.some((s) => s.url === DEFAULT_SERVER) ? SERVERS : [{ id: 'custom-default', name: 'This address', region: '', url: DEFAULT_SERVER }, ...SERVERS];
    pick.innerHTML = list.map((s) => `<option value="${esc(s.url)}">${esc(s.name)}${s.region ? ' · ' + esc(s.region) : ''}</option>`).join('') + '<option value="">Another address...</option>';
    const current = $('mp-server').value;
    pick.value = list.some((s) => s.url === current) ? current : '';
    const sync = () => {
      $('mp-server-row').classList.toggle('hidden', pick.value !== '');
      if (pick.value) $('mp-server').value = pick.value;
    };
    pick.addEventListener('change', sync);
    sync();
    let checked = false;
    $('btn-mp').addEventListener('click', () => {
      if (checked) return;
      checked = true;
      for (const s of list) serverHealth(s.url).then((h) => {
        const o = [...pick.options].find((x) => x.value === s.url);
        if (o) o.textContent = `${s.name}${s.region ? ' · ' + s.region : ''} · ${h ? (h.open ? `${h.players} of ${h.max} online` : 'closed') : 'not answering'}`;
      });
    });
  }
  $('mp-pass').value = settings.serverPass || '';
  for (const id of ['mp-server', 'mp-pass']) $(id).addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') joinServer();
  });

  // ---------------------------------------------------------------------------
  // The server world (0.55): chat (Enter) and the players panel (O)
  // ---------------------------------------------------------------------------
  const chatLog = document.createElement('div');
  chatLog.id = 'chat-log';
  document.body.appendChild(chatLog);
  const chatBox = document.createElement('input');
  chatBox.id = 'chat-input';
  chatBox.maxLength = 140;
  chatBox.placeholder = 'Say something to everyone (Enter to send, Esc to close)';
  chatBox.autocomplete = 'off';
  chatBox.className = 'hidden';
  document.body.appendChild(chatBox);
  function chatLine(text, note = false) {
    const el = document.createElement('div');
    el.className = 'chat-line' + (note ? ' note' : '');
    el.textContent = text;
    chatLog.appendChild(el);
    while (chatLog.children.length > 8) chatLog.firstChild.remove();
    setTimeout(() => el.classList.add('old'), 15000);
  }
  function openChat() {
    chatBox.classList.remove('hidden');
    chatLog.classList.add('open');
    chatBox.focus();
  }
  function closeChat() {
    chatBox.value = '';
    chatBox.classList.add('hidden');
    chatLog.classList.remove('open');
    chatBox.blur();
    if (!net) chatLog.textContent = '';
  }
  chatBox.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = chatBox.value.trim();
      if (text && net && net.server) net.room.send({ t: 'cmd', cmd: { type: 'chat', text } });
      closeChat();
    } else if (e.key === 'Escape') closeChat();
  });

  let playersOpen = false;
  const playersPanel = document.createElement('div');
  playersPanel.id = 'players-panel';
  playersPanel.className = 'hidden';
  document.body.appendChild(playersPanel);
  const MAP_NAME = (id) => (MAPS[id] ? MAPS[id].name : id === 'rift' ? 'an Echo Rift' : id === 'delve' ? 'a delve' : id);
  function renderPlayers() {
    const r = net && net.roster;
    if (!r) {
      playersPanel.innerHTML = '<p>Waiting for the server...</p>';
      return;
    }
    const me = net.pid;
    const party = r.party ? new Set(r.party.members) : new Set();
    const where = (pl) => (pl.map === 'town' && pl.haven ? `Haven ${pl.haven}` : MAP_NAME(pl.map));
    const rows = r.players.map((pl) => {
      const mine = pl.pid === me;
      const inParty = party.has(pl.pid);
      let btn = '';
      if (!mine && r.invites.includes(pl.pid)) btn = `<button type="button" data-act="partyAccept" data-pid="${pl.pid}" class="primary">Accept invite</button><button type="button" data-act="partyDecline" data-pid="${pl.pid}" class="ghost">No</button>`;
      else if (!mine && inParty) btn = `<button type="button" data-act="joinMember" data-pid="${pl.pid}" class="ghost" title="Travel to their map, into their copy of it (a map you have been to)">Go to them</button>`;
      else if (!mine && !(r.party && r.party.members.length >= 4)) btn = `<button type="button" data-act="partyInvite" data-pid="${pl.pid}" class="ghost">Invite</button>`;
      return `<tr class="${mine ? 'me' : ''}${inParty ? ' party' : ''}"><td>${esc(pl.name)}${mine ? ' (you)' : ''}${inParty ? ' <span class="tag">party</span>' : ''}</td><td>${pl.cls ? esc(CLASSES[pl.cls] ? CLASSES[pl.cls].name : pl.cls) : ''} ${pl.level || ''}</td><td>${esc(where(pl))}</td><td>${btn}</td></tr>`;
    });
    playersPanel.innerHTML = `<h3>${esc(r.world)} · ${r.players.length} online</h3><table>${rows.join('')}</table>` +
      `<p class="setting-desc">Haven is shared by everyone here. Out on the road, your party has its own copy of each map: invite friends to fight together. Enter: chat.</p>` +
      (r.party ? `<button type="button" data-act="partyLeave" class="ghost">Leave the party</button>` : '') + ` <button type="button" data-act="close" class="ghost">Close <kbd>O</kbd></button>`;
  }
  playersPanel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !net) return;
    if (b.dataset.act === 'close') return closePlayers();
    net.room.send({ t: 'cmd', cmd: { type: b.dataset.act, pid: Number(b.dataset.pid) || 0 } });
  });
  function closePlayers() {
    playersOpen = false;
    playersPanel.classList.add('hidden');
  }
  function togglePlayers() {
    playersOpen = !playersOpen;
    playersPanel.classList.toggle('hidden', !playersOpen);
    if (playersOpen) renderPlayers();
  }
  document.addEventListener('keydown', (e) => {
    if (!net || !net.server || mode !== 'play') return;
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      openChat();
    } else if ((e.key === 'o' || e.key === 'O') && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      togglePlayers();
    }
  }, true);
  $('mp-code').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') joinGame();
  });
  $('mp-name').addEventListener('keydown', (e) => e.stopPropagation());
  $('room-badge').addEventListener('click', async () => {
    if (!net) return;
    if (net.server) return togglePlayers(); // (0.55) the server world has no code to share: show who is on
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

  /** Right-clicked anything interactable (world.interactables): walk to it, and use it on arrival (see the frame loop). */
  function walkToInteract(o) {
    const p = world.player;
    const d = Math.hypot(p.x - o.x, p.z - o.z) || 1;
    const stand = o.r + 1.1;
    pendingTalk = { id: o.id, until: performance.now() + 9000 };
    if (d <= o.r + (o.reach ?? CONFIG.INTERACT_RANGE) - 0.2) return; // already close enough
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
      if (near.kind === 'sign') {
        reading = near.id;
        applyNow({ type: 'readSign', id: near.id });
        setMode('read');
      } else {
        // People, the board, an altar, the merchant: everything else opens the talk panel (renderTalk picks the view).
        talkTo = near.id;
        talkNote = '';
        setMode('talk');
      }
    },
    toggleJournal() {
      if (mode === 'play') setMode('journal');
      else if (mode === 'journal') setMode('play');
      else return;
      sfx.ui();
    },
    toggleCasebook() {
      if (mode === 'play' || mode === 'journal') setMode('casebook');
      else if (mode === 'casebook') setMode('play');
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
      else if (['pause', 'travel', 'talk', 'read', 'journal', 'casebook', 'talents'].includes(mode)) setMode('play');
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
      // The Asker's offer (0.40): 1 to 4 answer it (before the potion key gets them).
      if (!$('asker-offer').classList.contains('hidden') && /^[1-4]$/.test(key)) {
        answerAsker(['power', 'shield', 'speed', 'none'][Number(key) - 1]);
        return true;
      }
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
  for (const id of ['btn-talk-close', 'btn-read-close', 'btn-journal-close', 'btn-casebook-close', 'btn-talents-close']) $(id).addEventListener('click', () => setMode('play'));
  $('btn-casebook').addEventListener('click', () => actions.toggleCasebook());
  caseBadge();
  $('btn-journal-casebook').addEventListener('click', () => actions.toggleCasebook());
  $('case-detail').addEventListener('change', (e) => {
    settings.caseDetail = e.target.checked;
    storeSettings(settings);
    renderCasebook();
  });
  $('case-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-case]');
    if (!b) return;
    caseSel = b.dataset.case;
    renderCasebook();
  });
  // Holding Shift shows the detailed page while it is held (0.56).
  for (const kind of ['keydown', 'keyup']) {
    window.addEventListener(kind, (e) => {
      if (e.key !== 'Shift' || mode !== 'casebook' || e.repeat) return;
      caseShift = kind === 'keydown';
      renderCasebook();
    });
  }
  window.addEventListener('blur', () => {
    if (!caseShift) return;
    caseShift = false;
    if (mode === 'casebook') renderCasebook();
  });
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
  $('graphics').value = settings.graphics;
  $('graphics').addEventListener('change', (e) => {
    settings.graphics = e.target.value;
    gfx.level = settings.graphics === 'auto' ? (softGPU ? 'lowest' : 'high') : settings.graphics;
    gfx.t = gfx.frames = gfx.drops = 0;
    gfx.warm = 3;
    renderer.setQuality(gfx.level);
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

  // The Asker's offer panel (0.40)
  let askerTimer = null;
  function askerOffer(time) {
    const el = $('asker-offer');
    el.classList.remove('hidden');
    let left = Math.ceil(time);
    $('ask-time').textContent = `${left}s`;
    clearInterval(askerTimer);
    askerTimer = setInterval(() => {
      left--;
      $('ask-time').textContent = left > 0 ? `${left}s` : '';
      if (left <= 0) hideAsker();
    }, 1000);
  }
  function hideAsker() {
    clearInterval(askerTimer);
    $('asker-offer').classList.add('hidden');
  }
  function answerAsker(pick) {
    world.command({ type: 'askerAnswer', pick });
    hideAsker();
  }
  for (const b of document.querySelectorAll('#asker-offer button')) b.addEventListener('click', () => answerAsker(b.dataset.pick));

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
        const skill = [ev.flawless ? 'Flawless: double gold, a potion and an augment reroll' : '', ev.swift ? `Swift (${ev.secs}s, par ${ev.par}s): +50% gold` : ''].filter(Boolean).join(' · ');
        hud.banner(ev.flawless && ev.swift ? 'Flawless and Swift' : ev.flawless ? 'Flawless' : ev.swift ? 'Swift' : ev.boss ? 'The Warden falls' : 'Wave cleared', `+${ev.gold} gold${skill ? ' · ' + skill : ''}${ev.boss ? ' · checkpoint saved' : ''}${record ? ' · a new record in the Hall of Echoes' : ''}`);
        if (ev.flawless) sfx.levelUp();
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
        if (ev.fx === 'deadeye') {
          sfx.sniper();
          hud.screenFlash(0.25);
        } else if (ev.fx === 'focus') sfx.breath();
        else sfx.cast(ev.slot);
        if (!ev.echo) hud.flashSlot(ev.slot);
        break;
      case 'mirrorCrack':
        sfx.mirrorCrack();
        break;
      case 'mirrorBreak':
        sfx.shatter();
        hud.float(renderer, ev.x, 3, ev.z, 'Mirror shattered', 'word perfect');
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
        // The Casebook: a death close to your hero is one you helped with (in the Echo Ring, all of them).
        if (world.mode === 'arena' || Casebook.near(world.player, ev.x, ev.z, Casebook.RANGES.kill)) caseNote('kill', ev.enemyType, { remnant: ev.remnant, old: ev.old });
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
      case 'tierUnlocked':
        hud.banner(`World tier ${ev.numeral} unlocked`, `${ev.name} · choose it at the Waygate in Haven`);
        sfx.levelUp();
        break;
      case 'tierSet':
        hud.feedText(`World tier ${ev.numeral}: ${ev.name}`);
        sfx.ui();
        break;
      case 'riftStart':
        hud.banner(`Echo Rift · Tier ${ev.tier}`, `An echo of ${ev.name}. Clear enough of it to call the guardian`);
        sfx.wave(false);
        tune();
        break;
      case 'riftGuardian':
        hud.banner(`${ev.name} answers`, 'The rift guardian has come');
        sfx.wave(true);
        tune();
        break;
      case 'riftLate':
        hud.banner('Out of time', 'You can still finish the rift, but the next tier will not open');
        sfx.denied();
        break;
      case 'riftDone': {
        const clock = `${Math.floor(ev.secs / 60)}:${String(ev.secs % 60).padStart(2, '0')}`;
        const record = ev.won && !net && recordRift(ev.cls, ev.spec, ev.tier, ev.secs);
        hud.banner(ev.won ? `Rift tier ${ev.tier} cleared` : 'Rift finished', ev.won ? `${clock}${ev.opened ? ` · tier ${ev.opened} opened` : ''} · your shard back${record ? ' · a new record in the Hall of Echoes' : ''}` : 'Too late for the next tier this time');
        if (ev.won) sfx.levelUp();
        tune();
        persist();
        break;
      }
      case 'riftEnd':
        hud.feedText('You left the rift.');
        break;
      case 'riftNoShard':
        hud.feedText('A rift costs a starglass shard. The things on the road carry them.');
        sfx.denied();
        break;
      case 'riftLocked':
        hud.feedText('Rifts open once you have beaten The Warden out in the world.');
        sfx.denied();
        break;
      case 'reborn': {
        // Rebirth (0.43): keep a backup, store the new life, and wake in Haven.
        backupNow('before a rebirth');
        account.rebirths = (account.rebirths || 0) + 1;
        storeAccount(account);
        save = Object.assign(ev.save, { acctRebirths: account.rebirths });
        storeSave(save, world.cls);
        if (!(net && net.server)) startExplore(true); // (0.55.2) on the server, the server wakes the new life in Haven
        sfx.levelUp();
        if (ev.ng) hud.banner(`You took her place · New Game+ ${ev.ng}`, `The wish begins again, stronger. At the top of the mountain, the Unmade wears your face. +${ev.marks} Starmarks.`);
        else hud.banner(`Reborn · ${ev.n}`, `+${ev.marks} Starmarks${ev.essence ? `, +${ev.essence} Echo Essence` : ''}${ev.ember ? `, +${ev.ember} Ember` : ''}${ev.heirloom ? `. ${ev.heirloom} came with you` : ''}. Spend Starmarks in Talents (T), Essence on the gear screen.`);
        hintOnce('reborn', `You are reborn. ${ev.marks} Starmarks are yours to spend on perks in Talents (T)${ev.glow ? ', and a new weapon glow is on the gear screen' : ''}.`, 12);
        break;
      }
      case 'perkBought':
        sfx.ui();
        talentBadge();
        break;
      case 'wishUp':
        hud.float(renderer, ev.x, 3.2, ev.z, `Wishborne ${ev.wish}`, 'word perfect');
        sfx.levelUp();
        talentBadge();
        hintOnce('wish', 'Past level 100, EXP fills Wishborne levels. Each one is a Wish point: spend them in Talents (T).', 8);
        break;
      case 'wishSpent':
        talentBadge();
        break;
      case 'shieldBreak':
        hud.float(renderer, ev.x, 2.6, ev.z, 'Shield broken', 'word');
        sfx.shatter();
        break;
      case 'trade': {
        const why = { declined: `${ev.with} said no to the trade.`, cancelled: 'The trade was called off.', changed: 'Something on offer changed hands, so the trade was called off.', full: 'A bag was too full for the swap, so the trade was called off.', gone: `${ev.with} left, so the trade was called off.` };
        const redraw = () => {
          if (mode !== 'gear') return;
          inventory.render(world);
          renderTrade();
        };
        if (ev.state === 'asked') {
          trade = null;
          if (ev.asker) hud.feedText(`Asked ${ev.with} to trade…`);
          else {
            $('trade-ask-text').textContent = `${ev.with} wants to trade`;
            $('trade-ask').classList.remove('hidden');
            sfx.ui();
          }
        } else if (ev.state === 'open') {
          const first = !trade;
          trade = ev;
          $('trade-ask').classList.add('hidden');
          if (first && mode === 'play') setMode('gear'); // open the drawer when the trade starts, not on every change
          else redraw();
          if (!first && mode !== 'gear') hud.feedText(`${ev.with} changed the trade · open Gear (Tab) to see it`);
        } else if (ev.state === 'closed') {
          trade = null;
          $('trade-ask').classList.add('hidden');
          hud.feedText(why[ev.reason] || 'The trade was called off.');
          redraw();
        } else if (ev.state === 'done') {
          trade = null;
          sfx.upgrade();
          const parts = [ev.got.length ? `got ${ev.got.join(', ')}` : '', ev.gave.length ? `gave ${ev.gave.join(', ')}` : '', ev.gold ? `${ev.gold > 0 ? 'got' : 'paid'} ${Math.abs(ev.gold).toLocaleString()} gold` : ''].filter(Boolean);
          hud.banner('Traded', `With ${ev.with}${parts.length ? ': ' + parts.join(' · ') : ''}`);
          redraw();
        }
        break;
      }
      case 'tradeBusy':
        hud.feedText(`${ev.name} is already in a trade.`);
        sfx.denied();
        break;
      case 'itemDropped':
        hud.float(renderer, ev.x, 2.2, ev.z, ev.name, 'word');
        if (ev.hero !== (net ? net.pid : world.cur.pid)) hud.feedText(`${ev.by} dropped ${ev.name} for the party`);
        break;
      case 'chestOpen': {
        const name = { wooden: 'Chest', gilded: 'Gilded chest', radiant: 'Radiant chest' }[ev.tier] || 'Chest';
        hud.float(renderer, ev.x, 2.6, ev.z, name, ev.tier === 'radiant' ? 'word perfect' : 'word');
        sfx.pickup(ev.tier === 'radiant' ? 6 : ev.tier === 'gilded' ? 4 : 2);
        if (ev.tier === 'radiant') hud.screenFlash(0.35);
        if (ev.gold) hud.feedText(`${name}: ${ev.gold.toLocaleString()} gold${ev.tickets ? `, ${ev.tickets} starglass shard${ev.tickets > 1 ? 's' : ''}` : ''}${ev.frags ? `, ${ev.frags} Immortal Fragments` : ''}${ev.tier !== 'wooden' ? ', potions refilled' : ''}`);
        if (ev.tier === 'radiant') hud.banner('Radiant chest', ev.best >= 6 ? 'An Immortal!' : `${ev.frags || 0} Immortal Fragments inside`);
        if (world.mode === 'explore') persist();
        break;
      }
      case 'bossFall':
        hud.banner(`${ev.name} falls`, ev.first ? 'First victory: a guaranteed prize, and 2 skill points' : 'It will rise again in two minutes');
        hud.feedText(`${ev.name}: ${ev.gold.toLocaleString()} gold, ${ev.keys} Warden key${ev.keys === 1 ? '' : 's'}, ${ev.items} piece${ev.items === 1 ? '' : 's'} of gear`);
        if (ev.falloff < 100) hud.feedText(`You have outgrown ${ev.name}: it pays ${ev.falloff}% (10% less for every level you are above it).`);
        hud.screenFlash(0.6);
        persist();
        break;
      case 'quest':
        if (ev.what === 'accepted') hud.feedText(`Quest accepted: ${ev.name}${ev.pre ? ` (${ev.pre} already done from before${ev.state === 'ready' ? ': ready to hand in' : ''})` : ''}`);
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
      case 'talentsAuto':
        sfx.ui();
        hud.feedText(`${ev.n} talent point${ev.n === 1 ? '' : 's'} spent${ev.remembered ? ', as you had them before' : ''}.`);
        break;
      case 'respec':
        hud.feedText('Talents reset. Choose a path again.');
        break;
      case 'bossReward':
        hud.feedText('Warden key and a skill point earned');
        break;
      case 'enrage':
        hud.banner('Enraged', `${world.enemies.find((e) => e.id === ev.id)?.def.name || 'The boss'} attacks faster`);
        break;
      case 'npcGone':
        // (0.47) Tomas lies down, or walks on
        renderer.setMap(world.map);
        hud.banner(ev.choice === 'rest' ? 'He lies down' : 'He keeps walking', ev.choice === 'rest' ? 'You have the red scarf. Take it to Pip.' : 'Tell Pip.');
        break;
      case 'delveRoom':
        hud.banner(`${ev.name} · room ${ev.n} of ${ev.of}`, ev.line);
        sfx.wave(ev.n === ev.of);
        break;
      case 'delveClear':
        hud.hint('The room falls quiet. The way down opens...', 3);
        break;
      case 'delveDone':
        hud.banner(`The Throne Room is still · tier ${TIERS[ev.tier].numeral}`, ev.first ? 'A radiant chest, a Remnant Sigil and an Unwishing Glass. The stair goes back up to the city.' : 'A radiant chest by the empty throne. The stair goes back up to the city.');
        sfx.levelUp();
        break;
      case 'ending':
        sfx.levelUp();
        hud.screenFlash(0.9);
        if (ev.kind === 'primordial') {
          // Act III's end (0.54): you carry Ending now; the fever is over, and your name holds still
          hud.banner('Enough', 'The fever is over, for good. Your name holds still. The Deep stays open.');
          break;
        }
        rollCredits(ev.first); // the Unwish (0.45)
        break;
      case 'bossLine': {
        // a boss speaks (0.44): over its head, and in the hint line so it is not missed
        const be = world.enemyById(ev.id);
        if (be) hud.float(renderer, be.x, (be.def.height || 3) + 1.2, be.z, ev.text, 'word speech');
        hud.hint(`${ev.name}: "${ev.text}"`, ev.key === 'death' ? 6 : 4);
        break;
      }
      case 'proclaim':
        hud.hint(`The Herald: "${HERALD_LINES[(ev.line - 1) % HERALD_LINES.length]}"`, 4);
        sfx.wave(false);
        break;
      case 'askerOffer':
        if (ev.to && !ev.to.includes(net ? net.pid : 0)) break; // (fallen when it asked)
        askerOffer(ev.time);
        hud.screenFlash(0.35);
        break;
      case 'askerGranted':
        if (!net || ev.pid === net.pid) {
          hideAsker();
          hud.feedText({ power: 'It gives you power, exactly as asked.', shield: 'It gives you safety, exactly as asked.', speed: 'It gives you speed, exactly as asked.' }[ev.pick]);
        }
        break;
      case 'askerRefused':
        if (!net || ev.pid === net.pid) {
          hideAsker();
          hud.feedText('You want nothing. It presses harder.');
        }
        break;
      case 'askerResume':
        hideAsker();
        break;
      case 'askerLast':
        hud.banner('The Asker grows', ev.grown ? `From everything that was wanted of it (${ev.grown})` : 'Nothing was wanted of it: it is only light now');
        break;
      case 'bossPhase':
        hud.banner(ev.phase === 2 ? `${ev.name} unravels` : `${ev.name} collapses inward`, ev.phase === 2 ? 'Stars begin to fall: keep moving' : 'It drags you in before it bursts: dash away');
        hud.screenFlash(0.5);
        sfx.wave(true);
        break;
      case 'starfall':
        sfx.cast('r');
        break;
      case 'starImpact':
        sfx.impact();
        break;
      case 'doomCast': {
        // Doom (0.28): violet means nothing you wear or do will soften it; only moving does.
        const mine = (ev.hero ?? 0) === (net ? net.pid : 0);
        sfx.denied();
        if (!mine) break;
        hud.float(renderer, ev.x, 3, ev.z, ev.idle ? 'Doom · you stood idle' : 'Doom', 'word warn');
        if (ev.idle) hintOnce('doomIdle', `${ev.name || 'The boss'} noticed you standing idle. Bosses Doom anyone who stands near them without doing anything for a few seconds: move!`, 8);
        else hintOnce('doom', `Violet circle: Doom. It takes ${Math.round(ev.pct * 100)}% of your health whatever your armor, and cannot be parried or blocked. Walk out, or dash through it.`, 9);
        break;
      }
      // --- Exploration surprises (0.29) ---------------------------------------------
      case 'rareSpawn':
        sfx.ui();
        hud.feedText(`A Storied enemy roams ${ev.map}: ${ev.name}.`);
        hintOnce('rare', 'A Storied enemy: a gold name, tougher than any elite, and worth it: good gear, Wishdust for enchanting, and sometimes a set piece. Look for the gold dot on the minimap.', 9);
        break;
      case 'farLevel':
        hintOnce('levelband', ev.gap < 0 ? 'These enemies are well below your level: they pay little EXP. Enemies within 3 levels of you pay ten times as much; head somewhere tougher.' : 'These enemies are well above your level: they pay less EXP than ones within 3 levels of you, which pay ten times as much.', 10);
        break;
      case 'keepsake':
        hud.banner(ev.name, 'A keepsake: its own slot, always your level, and it stays with you through rebirth');
        break;
      case 'depthSet':
        if (ev.depth) hud.banner(`Depth ${ev.numeral} · ${ev.name}`, ev.ember < ev.need ? `Ember ${ev.ember} of ${ev.need}. You are not ready. Go anyway, if you must.` : `Ember ${ev.ember} of ${ev.need}. Every map out in the world is the Deep now.`);
        else hud.feedText('Back to the world above.');
        break;
      case 'depthOpened':
        hud.banner(`Depth ${ev.numeral} is open`, `${ev.name}: Ember ${ev.need} needed (you have ${ev.ember}). Choose it at the Waygate.`);
        sfx.levelUp();
        break;
      case 'depthLocked':
        hud.feedText(`${ev.name} is not open to you yet (level 100, and the story first).`);
        break;
      case 'kindling':
        hud.float(renderer, ev.x, 3, ev.z, `Kindling ${ev.n}/${ev.max} · Ember ${ev.ember}`, 'word perfect');
        sfx.pickup(5);
        break;
      case 'emberShort':
        if (!ev.self || ev.self === world.player) hud.banner('It does not count', `${ev.name} needs you to stand there with Ember ${ev.need} of your own (you have ${ev.have}). Being carried down is not the same.`);
        break;
      case 'sealed':
        hud.banner(`${ev.name} is sealed`, `${ev.by} took it for ${ev.time} seconds. Use something else.`);
        break;
      case 'eliteSpoils':
        hintOnce('elite', 'Elites are worth hunting: Wishdust every time, often an Immortal Fragment, a piece that leans Mythic, and once in a while the radiant chest they were guarding.', 9);
        // (0.49) an elite pays out where it falls
        hud.float(renderer, ev.x, 2.9, ev.z, ev.chest ? 'It was guarding a radiant chest!' : ev.frag ? '+1 Immortal Fragment' : `+${ev.dust} Wishdust`, 'word perfect');
        if (ev.chest) {
          hud.screenFlash(0.3);
          sfx.levelUp();
        } else sfx.pickup(ev.frag ? 5 : 3);
        break;
      case 'rareSlain':
        hud.banner(`${ev.name} falls`, `Storied · +${ev.dust} Wishdust`);
        sfx.levelUp();
        break;
      case 'thiefSpawn':
        sfx.pickup(3);
        hud.feedText(`Something glitters on ${ev.map}: a Wishthief is hiding here.`);
        hintOnce('thief', 'A Wishthief (the gold dot on the minimap): it runs when you come near and gets away after 25 seconds. Every hit spills gold; catch it for a burst of loot, a shard and Wishdust.', 10);
        break;
      case 'thiefFlee':
        hud.float(renderer, ev.x, 2.6, ev.z, 'It bolts!', 'word perfect');
        break;
      case 'thiefCoins':
        sfx.pickup(1);
        hud.float(renderer, ev.x, 2.2, ev.z, `+${ev.gold} gold`, 'word perfect');
        break;
      case 'thiefStumble':
        hud.float(renderer, ev.x, 2.4, ev.z, 'Stumbles!', 'word stun');
        break;
      case 'thiefEscape':
        hud.feedText('The Wishthief got away.');
        break;
      case 'thiefCaught':
        hud.banner('Wishthief caught!', `+1 shard · +${ev.dust} Wishdust · and everything it stole`);
        sfx.levelUp();
        break;
      case 'remnantRise':
        hud.banner(`${ev.name} has risen`, `Tougher, with a new attack (${ev.attack}). It always drops a set piece.`);
        sfx.wave(true);
        break;
      case 'remnantCast':
        hud.float(renderer, ev.x, 3.2, ev.z, ev.name, 'word warn');
        break;
      case 'remnantSlain':
        hud.feedText(`${ev.name}: +${ev.dust} Wishdust`);
        break;
      // --- 0.31: Remnants, world events, the merchant, ascending, glows ----------
      case 'starFeeds':
        hud.float(renderer, ev.bx, 4.5, ev.bz, 'A wish-star feeds it', 'word warn');
        break;
      case 'unwishedBoon':
        if ((ev.hero ?? 0) === (net ? net.pid : 0)) hud.float(renderer, ev.x, 3, ev.z, 'Unwished: +20% damage', 'word perfect');
        break;
      case 'eventStart':
        sfx.wave(false);
        if (ev.kind === 'meteor') {
          hud.banner('A meteor is falling', `On ${ev.map}: something will crawl out of it. Clear the crater for a radiant chest.`);
          hintOnce('meteor', 'World event: a meteor. Follow the orange pillar of light (and the orange dot on the minimap); clear the pack that comes out for a radiant chest.', 9);
        } else {
          hud.banner('A shrine has woken', `On ${ev.map}: stand in its ring to start, then hold it for 60 seconds.`);
          hintOnce('shrine', 'World event: a shrine. Follow the gold pillar of light; stand in its ring and hold it for 60 seconds while waves come at you. Leave it empty for 6 seconds and it goes dark.', 10);
        }
        break;
      case 'meteorLands':
        sfx.slam();
        break;
      case 'shrineStart':
        hud.banner('Hold the shrine', `${ev.secs} seconds. Stay in the ring.`);
        break;
      case 'eventDone':
        sfx.levelUp();
        hud.banner(ev.kind === 'meteor' ? 'The crater is quiet' : 'The shrine holds', ev.kind === 'meteor' ? 'A radiant chest waits in it' : `A radiant chest · +${ev.dust} Wishdust · +${ev.tickets} shards`);
        break;
      case 'eventFail':
        hud.feedText(ev.kind === 'meteor' ? 'The meteor pack scattered.' : ev.faded ? 'The shrine went dark again.' : 'The shrine went dark: no one held it.');
        break;
      case 'merchantArrive':
        sfx.pickup(3);
        hud.feedText(`A travelling merchant has set up on ${ev.map}, for 3 minutes.`);
        hintOnce('merchant', 'A travelling merchant (the brown dot on the minimap): walk up and press G to see his wares. Mystery gear, Wishdust and set pieces, for gold or shards.', 9);
        break;
      case 'merchantLeave':
        hud.feedText('The travelling merchant has moved on.');
        if (mode === 'talk' && talkTo === 'merchant') setMode('play');
        break;
      case 'bountyDone':
        sfx.pickup(3);
        hud.feedText(`Bounty done: ${ev.text}. Claim it at the board in Haven.`);
        break;
      case 'bountyClaimed':
        sfx.upgrade();
        talkNote = `Claimed: ${rewardLine(ev.reward)}.`;
        if (mode === 'talk') renderTalk();
        refreshMenus();
        break;
      case 'bountySwapped':
        sfx.ui();
        if (mode === 'talk') renderTalk();
        break;
      case 'crafted':
        sfx.levelUp();
        hud.banner('Immortal crafted', `${itemName(ev.item)} · its power fits your subclass`);
        refreshMenus();
        break;
      case 'remnantSummoned':
        sfx.slam();
        hud.banner(ev.name, 'called up by your Remnant Sigil');
        break;
      case 'altarLocked':
        hud.hint(`${ev.name}'s Remnant only answers once you have beaten it three times.`, 4);
        break;
      case 'wildsLocked':
        hud.hint(`${ev.name || 'The Shattered Wilds'} opens from world tier ${['', 'I', 'II', 'III', 'IV', 'V'][ev.tier] || ev.tier}. Raise the world tier at the Waygate.`, 5);
        break;
      case 'mapLocked':
        hud.hint(`${ev.name}: finish ${ev.quest} first.`, 5);
        break;
      case 'merchantSold':
        sfx.pickup(4);
        talkNote = ev.item ? `Bought: ${itemName(ev.item)} (${RARITIES[ev.item.rarity].name}).` : `Bought: ${ev.label}.`;
        if (mode === 'talk') renderTalk();
        refreshMenus();
        break;
      case 'ascended':
        sfx.upgrade();
        hud.banner(`${ev.name} ascends`, `${'★'.repeat(ev.stars)} · every stat +${ev.stars * 10}%`);
        refreshMenus();
        break;
      case 'glowUnlocked':
        sfx.levelUp();
        hud.banner('A new weapon glow', `${ev.name} · choose it on the gear screen (Tab)`);
        refreshMenus();
        break;
      case 'idleNoReward':
        hud.banner('Away from the keys?', `After ${ev.secs} seconds without any input, kills give no EXP, gold or loot until you act again.`);
        break;
      case 'miscGot':
        sfx.pickup(4);
        hud.feedText(`Found: ${MISC[ev.id] ? MISC[ev.id].name : ev.id} (you have ${ev.total}).`);
        break;
      case 'wishReset':
        sfx.upgrade();
        hud.banner('Unwished', `${ev.points} Wish points to spend again`);
        break;
      case 'streak':
        hud.feedText(`Streak ${ev.n}: +${ev.pct}% loot on this tier until you are knocked out.`);
        break;
      case 'streakLost':
        hud.feedText(`Streak of ${ev.n} lost.`);
        break;
      case 'doomImpact':
        sfx.slam();
        break;
      case 'wardBreak':
        if ((ev.hero ?? 0) === (net ? net.pid : 0)) sfx.whiff();
        break;
      case 'reckoning':
        sfx.slam();
        hud.float(renderer, ev.x, 3.2, ev.z, `Reckoning ×${ev.stacks}`, 'word perfect');
        break;
      case 'bossLeap':
        sfx.slam();
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
        hud.feedText(`+${ev.scrap} scrap${ev.dust ? ` · +${ev.dust} Wishdust` : ''}`);
        break;
      case 'enchanted':
        sfx.upgrade();
        hud.feedText(`Reforged ${ev.name}: ${STATS[ev.from].label} became ${formatStat(ev.to, ev.value)}.`);
        refreshMenus();
        break;
      case 'rerolled': {
        sfx.upgrade();
        const tier = RARITIES[ev.tier];
        hud.feedText(`${ev.name}: ${STATS[ev.key].label} ${ev.from} → ${ev.value} (${tier.name} roll)`);
        refreshMenus();
        break;
      }
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
          travelStone = null;
          setMode('travel');
        }
        break;
      case 'waystone':
        if (mode === 'play') {
          sfx.ui();
          travelStone = ev.index;
          setMode('travel');
        }
        break;
      case 'warp':
        sfx.portal?.();
        hud.feedText(`To the ${ev.name.toLowerCase()}`);
        break;
      case 'discovered':
        if (ev.id !== 'town') hud.feedText(`Discovered ${ev.name}. The Waygate in Haven can take you back here.`);
        break;
      case 'mapChange':
        // Arrived on another exploration map: swap the scenery and forget the old map's enemies.
        // (the same map object already built only needs showing: building scenery is not free)
        if (renderer.mapRef !== world.map || renderer.mapId !== world.map.id) renderer.setMap(world.map);
        else if (!renderer.exploreGroup.visible) renderer.setEnvironment('explore');
        renderer.reset();
        renderer.camTarget.set(p.x, 0, p.z);
        tune();
        hud.reset();
        hud.banner(ev.name, world.zone().sub);
        hud.screenFlash(0.5);
        sfx.cast('e');
        if (ev.from === 'town') hintOnce('maps', 'Each map is ten levels tougher than the last, and enemies get stronger the deeper in you go. Stand in a portal to travel on.', 9);
        else if (world.chests && world.chests.length) hintOnce('chests', 'Treasure chests lie around every map (gold dots on the minimap). Walk over one to open it. Gilded chests hold better gear. Radiant ones are rare: Immortal Fragments, Mythic or Ancient gear, and once in a long while an Immortal.', 9);
        persist();
        break;
      case 'playerDown':
        caseNote('fall', ev.foe);
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
        caseNote('fall', ev.foe);
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
      if ((net || world.party) && ALLY_FX.has(ev.type) && (ev.hero ?? 0) !== me) {
        renderer.onEvent(Object.assign({}, ev, { ally: true }), world); // a friend's attack or skill: their model plays it (0.41.1)
        continue;
      }
      if ((net || world.party) && !(eventFor(ev, me) || ((!net || net.role === 'host') && ev.type === 'mapChange'))) continue; // in a party: only this player's own events, and everyone's public ones
      handleEvent(ev);
    }
  }

  // ------------------------------------------------------------- main loop
  // (0.54.10) F3: a small readout of how the game is running (frame rate, where the time goes, the
  // graphics chip), so a slow computer can be told apart from a slow game.
  const perf = { on: false, el: null, frames: 0, js: 0, worst: 0, since: 0, gpu: null };
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F3') return;
    e.preventDefault();
    perf.on = !perf.on;
    if (!perf.el) {
      perf.el = document.createElement('div');
      perf.el.id = 'perf-meter';
      document.body.appendChild(perf.el);
      try {
        const gl = renderer.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        perf.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).replace(/^ANGLE \((.*)\)$/, '$1');
      } catch (err) {
        perf.gpu = 'unknown';
      }
    }
    perf.el.classList.toggle('hidden', !perf.on);
    perf.frames = perf.js = perf.worst = 0;
    perf.since = performance.now();
  });
  function perfTick(now, frameMs, jsMs) {
    if (!perf.on) return;
    perf.frames++;
    perf.js += jsMs;
    perf.worst = Math.max(perf.worst, frameMs);
    if (now - perf.since < 500) return;
    const secs = (now - perf.since) / 1000;
    const info = renderer.renderer.info.render;
    perf.el.textContent = `${Math.round(perf.frames / secs)} fps · worst frame ${Math.round(perf.worst)} ms · game code ${(perf.js / perf.frames).toFixed(1)} ms a frame\n` +
      `graphics ${GFX_NAMES[gfx.level] || gfx.level}${settings.graphics === 'auto' ? ' (auto)' : ''} · ${renderer.renderer.getPixelRatio().toFixed(2)}x · ${renderer.renderer.domElement.width}×${renderer.renderer.domElement.height} · ${info.calls} draws, ${Math.round(info.triangles / 1000)}k triangles\n` +
      `${perf.gpu}${softGPU ? ' (SOFTWARE: no graphics card)' : ''} · ${world.enemies ? world.enemies.filter((e) => !e.dead).length : 0} enemies · version ${typeof __VERSION__ !== 'undefined' ? __VERSION__ : ''}` +
      (net && net.role === 'client' ? `\n${netLine()}` : '');
    perf.frames = perf.js = perf.worst = 0;
    perf.since = now;
  }

  /**
   * (0.55.1) For F3 when joined to someone: the round trip, how often updates come, and roughly how
   * long a click takes to show (half the round trip there, a step, the wait for an update, half back,
   * then the cushion and the glide on this screen).
   */
  function netLine() {
    const gapMs = Math.max(16, (net.gapTicks || 3) * CONFIG.TICK * 1000);
    const ping = net.ping || 0;
    const click = ping + CONFIG.TICK * 500 + gapMs / 2 + (net.cushion || 1) * gapMs + gapMs / 2;
    return `ping ${Math.round(ping)} ms · ${Math.round(1000 / gapMs)} updates a second · a click shows after about ${Math.round(click)} ms · jitter ${Math.round(net.jitter || 0)} ms${net.relay ? ' · via relay' : ''}`;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const jsStart = performance.now();
    const rawDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.1, rawDt);
    last = now;
    if (settings.graphics === 'auto' && gfx.drops < 3 && mode === 'play' && !document.hidden && rawDt < 3) {
      // (frames up to 3 s long still count: a very slow machine must step down too; longer is a tab switch)
      // Auto graphics: after a few seconds of play, average the frame rate over six seconds.
      if (gfx.warm > 0) gfx.warm -= rawDt;
      else {
        gfx.t += rawDt;
        gfx.frames++;
        if (gfx.t >= 6) {
          const fps = gfx.frames / gfx.t;
          gfx.t = gfx.frames = 0;
          if (fps < 45 && gfx.level !== 'lowest') {
            gfx.level = GFX_STEPS[Math.min(GFX_STEPS.length - 1, GFX_STEPS.indexOf(gfx.level) + 1)];
            gfx.drops++;
            gfx.warm = 3;
            renderer.setQuality(gfx.level);
            hud.hint(`Graphics stepped down to ${GFX_NAMES[gfx.level]} for a smoother game (${Math.round(fps)} frames a second). Change it any time in the Menu.`, 6);
          } else gfx.drops = 3; // fast enough: stop checking
        }
      }
    }
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
      playSnapshots(now);
      drainEvents();
      alpha = Math.min(1, (now - net.snapAt) / net.snapGap);
      world.player.predicted = smoothPrediction(predictedOffset(alpha), dt);
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

    caseScan(now);
    input.update(now);
    if (!net && mode === 'play') alpha = Math.min(1, acc / CONFIG.TICK);
    renderer.render(world, alpha, dt);
    hud.update(world, renderer, dt);
    perfTick(now, rawDt * 1000, performance.now() - jsStart);
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
