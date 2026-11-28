// Entry point: wires the simulation, renderer, HUD, input, audio and saving
// together, and runs the main loop.
import { aimPreview, skillPreview } from './ui/aim.js';
import { TIERS, MAX_TIER, RIFT, WISH_STATS, WISH_IDS, DEEP, DEPTH_IDS, emberScale, primordialsOf, emberOf, MASTERY, CAELUM, animusShort } from './sim/endgame.js';
import { CONFIG } from './config.js';
import { World } from './sim/world.js';
import { trialWeek, weekIndexAt, buildTrialWorld, defaultBuild, validateBuild, trialScore, trialFinished, cleanCommand, TWISTS, WEEKLY_REWARD, bestTitle } from './sim/trial.js';
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
import { Voice } from './voice.js'; // (0.99)
import { Music } from './music/player.js';
import { MAP_SONG, BOSS_SONG, MAP_ID_SONG, fightSong } from './music/songs.js';
import { MAPS, MAP_IDS } from './sim/maps.js';
import { BOSSES, ENEMIES } from './sim/defs.js';
import { QUESTS, QUEST_IDS, NPCS, SIGNS, SIGN_IDS, HERALD_LINES, QUEST_CATS } from './sim/story.js';
import { SPECS, specsFor, ROW_NEED, talentPointsAt } from './sim/talents.js';
import { BORROWED, BORROW_SLOTS, OATH } from './sim/borrowed.js';
import { goalText, setGearClass } from './ui/hud.js';
import { RARITIES, itemName, STATS, formatStat, MISC, SLOTS, SLOT_NAMES, CACHES, upgradeCost, MAX_PLUS } from './sim/items.js';
import { wishWhere } from './sim/wishwhere.js'; // (0.81.2)
import { KEEP, HALLS, HALL_IDS, SETTLERS, CHAPTERS, RELIC_NAMES, cleanKeep, settlerLevel, wishText, wishGoal, lifeOfSave, troopStats, SKILLS, SKILL_IDS, SKILL_SLOT2, skillSlotSchool, skillSlotOpen, troopSupport, BLESSINGS, BLESSING_IDS, MIRACLES, MIRACLE_IDS, INCARNATE, STATUE, STATUE_KIT, STATUE_SKILLS, statueKit, statueCap, STATUE_TIERS, statueSkillOpen, TRIAL, troopGender, BUILD_IDS, buildMax, HERO_RARITY, HERO_RAR_MAX, NIGHT, FOES, OMENS, nightOmen, nightOmens, tideSpecials, RAID, raidLevel, HERO_SLOTS, HERO_SLOT_NAMES, heroWorn, WORKS, WORK_IDS, workHands, keepRates, BUILD_TIER, GROWTH, keepStage } from './sim/wishkeep.js';
import { steadyRatings } from './power.js';
import { PERKS, PERK_IDS, REBIRTH, rebirthBlock, perkRank } from './sim/rebirth.js';
import { WELL, CREDITS } from './sim/story.js';
import { GLOWS } from './sim/cosmetics.js';
import { RING_FOCUS, ringText, ringCost } from './sim/ring.js';
import { ringInfoHtml } from './ui/ringinfo.js';
import { BOUNTY, FRAGMENTS, REMNANT } from './sim/surprises.js';
import { clearAllOffline, loadSave, storeSave, clearSave, loadSettings, storeSettings, loadAccount, storeAccount , exportSaves, exportCode, parseSaves, importSaves, describeSaves, backupNow, loadBackups, restoreBackup, missingProgress, claimSession, onSessionTaken, askPersistentStorage } from './save.js';
import { WEAPONS } from './sim/items.js';
import { HostRoom, JoinRoom, cleanCode } from './net/room.js';
import { ServerRoom } from './net/server-room.js';
import { SERVERS, serverHealth } from './net/servers.js';
import * as Online from './net/online.js';
import * as Casebook from './ui/casebook.js';
import * as AugPri from './ui/augpriority.js'; // (0.66) auto-pick augments
import { makeSnapshot, applySnapshot, receiveSnapshot, eventFor, ALLY_FX, compactEvents } from './net/sync.js';
import { FRIEND_CMDS } from './net/cmds.js';

const $ = (id) => document.getElementById(id);
const SLOT_LABEL = { q: 'Cleave', w: 'Whirlwind', e: 'Breakthrough', r: 'Skyfall', parry: 'Parry', hero: 'Hero' };

// (0.57.8) The address the page opened with, before anything tidies it.
const BOOT_SEARCH = typeof location !== 'undefined' ? location.search : '';
const BUILT = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '';
/**
 * (0.57.8) Some browsers (Firefox, Safari) may hand back their cached copy of the page on a reload,
 * so the game stays on the old version. Going to a changed address always fetches the page again.
 * `extra` adds to the address; `drop` takes away.
 */
function loadFresh(extra = {}, from = location.search) {
  const q = new URLSearchParams(from);
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === undefined || v === false) q.delete(k);
    else q.set(k, String(v));
  }
  q.set('r', Date.now().toString(36));
  location.replace(location.pathname + '?' + q.toString() + location.hash);
}
/** (0.57.8) Take our own markers back out of the address once they have done their job. */
function tidyAddress(keys) {
  try {
    const q = new URLSearchParams(location.search);
    let changed = false;
    for (const k of keys) if (q.has(k)) (q.delete(k), (changed = true));
    if (changed) history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash);
  } catch (err) {
    /* (no history: leave it) */
  }
}
/**
 * (0.57.8) On opening, ask the site (past every cache) which version is newest. If this page is
 * older, load the newest at once, in any browser. `nv` remembers that we already tried for that
 * version, so a website still publishing it cannot cause a loop.
 */
async function checkNewest() {
  tidyAddress(['r']);
  if (!/^https?:$/.test(location.protocol) || !BUILT) return;
  let latest = null;
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    latest = res.ok ? (await res.json()).version : null;
  } catch (err) {
    return; // (offline: play this one)
  }
  const tried = new URLSearchParams(BOOT_SEARCH).get('nv');
  if (latest && latest !== BUILT && tried !== latest) return loadFresh({ nv: latest }, BOOT_SEARCH);
  tidyAddress(['nv']);
}
checkNewest();

function start(hot = {}) {
  const canvas = $('game');
  let renderer;
  try {
    renderer = new Renderer(canvas);
    renderer.keepTier = () => (world && world.player && world.player.keep ? world.player.keep.tier : 1); // (0.81) people walking about the keep
    renderer.keepStage = () => (world && world.player && world.player.keep ? keepStage(world.player.keep) : 0); // (0.82.1) and more as it grows
  } catch (err) {
    $('title-save').textContent = 'This game needs WebGL, which this browser or device has turned off. Try a current version of Chrome, Edge or Firefox.';
    $('btn-explore').disabled = true;
    console.error(err);
    return;
  }
  // (0.56.2) Models load ahead of time, a couple at once, so nothing appears as blocks first: the
  // heroes and the Echo Ring's roster shortly after the page opens; each map's own when you arrive.
  setTimeout(() => {
    renderer.preloadHeroes();
    renderer.preloadArena();
  }, 800);

  const sfx = new Sfx();
  const tooltip = new Tooltip();

  const settings = Object.assign(loadSettings(), hot.settings || {});
  settings.parryPreset = CONFIG.DEFAULT_PARRY_PRESET; // (0.61) Standard for everyone
  sfx.setVolume(settings.volume);
  sfx.setMuted(settings.muted);
  const voice = new Voice(); // (0.99) the game's people, out loud
  voice.volume = settings.voiceVolume ?? 0.8;
  voice.muted = !!settings.muted;
  // Background music: one original theme per map, plus the arena's battle theme.
  const music = new Music();
  music.setVolume(settings.musicVolume ?? 0.25);
  music.setMuted(settings.muted);
  // Browsers only allow sound after a click, so the first click anywhere switches audio on.
  window.addEventListener('pointerdown', () => {
    sfx.unlock();
    if (!music.ctx && sfx.sampler) music.sampler = sfx.sampler; // (1.2) one set of recorded instruments for both
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
  $('btn-stale-reload').addEventListener('click', () => loadFresh());
  backupNow('when the game started');
  let lastBackup = Date.now();
  let save = hot.save || loadSave(settings.cls);
  if (save) askPersistentStorage();
  // Gold and arena tickets belong to the account, so both characters share them.
  const account = hot.account || loadAccount() || { gold: save?.gold || 0, tickets: CONFIG.START_TICKETS };
  account.casebook = Casebook.freshBook(account.casebook); // The Casebook (0.56): the account's, every class and every life
  // (0.56.4) Signs are read once per account: everything any class has read counts for all of them.
  if (!Array.isArray(account.signs)) {
    const seen = new Set();
    for (const c of Object.keys(CLASSES)) for (const id of (loadSave(c) || {}).signs || []) seen.add(id);
    account.signs = [...seen];
  }
  let caseSel = null; // the page open in the Casebook
  let caseShift = false; // Shift held: the other view, for as long as it is held
  let caseSaveT = null;
  let caseScanAt = 0;
  function makeWorld(opts) {
    const w = new World(Object.assign({ parryPreset: settings.parryPreset, cls: settings.cls, signs: account.signs }, opts));
    renderer.setHeroClass(w.cls);
    setGearClass(w.cls);
    w.player.autoAttack = settings.autoAttack !== false;
    w.player.gold = account.gold;
    w.player.tickets = account.tickets;
    w.player.acctRebirths = account.rebirths || 0; // Rebirth (0.43): every hero's EXP grows with the account's rebirths
    w.player.lives = browserLives(); // (0.63) Mastery: this browser's other classes
    w.player.keep = cleanKeep(account.keep); // (0.80) the account's Wishkeep
    w.recalcStats();
    return w;
  }
  /** (0.63) What this browser's characters have done in the Deep, class by class, and their Ember. */
  function browserLives() {
    const out = {};
    for (const c of Object.keys(CLASSES)) {
      const s = loadSave(c);
      if (s && s.rebirth) out[c] = { prim: primordialsOf(s.rebirth), ember: emberOf(s.rebirth), open: !!(s.rebirth.act3 && s.rebirth.act3[MASTERY.quest]), act3: !!(s.endings && s.endings.self > 0 && s.rebirth.n >= 1), ...lifeOfSave(s) }; // (0.70.5); (0.80) what it gives the Wishkeep
    }
    return out;
  }
  let world = makeWorld({ save });

  // mode: 'title' | 'town' | 'play' | 'pause' | 'gear' | 'augment' | 'defeat'
  let mode = 'title';
  let rebirthSure = false; // the rebirth button's "Are you sure?" (0.66: reset by setMode and after 6 s)
  let rebirthSureT = 0;
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
  let autoWaveAt = 0; // (0.62) when to start the next Ring wave by itself (0: not due)
  const hints = {};

  // ---------------------------------------------------------------- saving
  function persist() {
    if (stale) return; // a newer tab of the game is open: it does the saving now
    if (net && net.role === 'client') return; // the host sends this player's save (see onNetMessage)
    if (world.trial) return; // a Weekly Echo (or a replay of one) never touches the character's save
    account.gold = world.player.gold;
    account.tickets = world.player.tickets;
    if (world.player.keep) account.keep = world.player.keep; // (0.80)
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
      const it = world.player.bag.find((x) => x.id === id);
      if (it && it.gift) return hud.feedText('A gift stays with you: it cannot be passed on.');
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
  // (0.59) What the Echo Ring's spoils are, kept with the settings
  const ringFocus = () => (settings.ringFocus && RING_FOCUS[settings.ringFocus.kind] ? settings.ringFocus : { kind: 'gold', slot: 'weapon' });
  const town = new Town(tooltip, applyNow, (startWave) => startRun(save, startWave), {
    get: ringFocus,
    set: (f) => {
      settings.ringFocus = f;
      storeSettings(settings);
    },
  });

  /**
   * (0.72.1) Whether to show this damage number (the Damage numbers setting). "Fewer in boss fights":
   * while a boss is fighting you, no damage over time and no hit smaller than a fifth of your biggest
   * lately, so the boss's own warnings stay readable.
   */
  let bigHit = 0;
  function showNumber(ev) {
    const how = settings.dmgNumbers || 'fewer';
    if (how === 'off') return false;
    if (how === 'crits') return !!ev.crit && !ev.dot;
    bigHit = Math.max(ev.amount || 0, bigHit * 0.995);
    if (how === 'all' || !fightNow()) return true;
    if (ev.dot) return false;
    return ev.crit || (ev.amount || 0) >= bigHit * 0.2;
  }

  /** (0.72) A damage number short enough to read at a glance: 9,400 / 125K / 13.7M / 2.1B. */
  function shortNum(n) {
    n = Math.round(Number(n) || 0);
    const a = Math.abs(n);
    if (a < 1e5) return n.toLocaleString('en-US');
    if (a < 1e6) return Math.round(n / 1e3) + 'K';
    if (a < 1e9) return (n / 1e6).toFixed(a < 1e7 ? 2 : 1) + 'M';
    return (n / 1e9).toFixed(a < 1e10 ? 2 : 1) + 'B';
  }

  /** Pick the music for where the player is right now. */
  function tune() {
    let id;
    if (mode === 'defeat') id = null;
    else if (mode === 'title' || mode === 'town' || (mode === 'gear' && gearReturn === 'town')) id = 'haven';
    else if (world.mode === 'explore') {
      const guardian = world.rift && world.rift.state === 'guardian' ? world.enemies.find((e) => e.riftGuardian) : null;
      const foe = fightNow(); // (0.72) a boss fight on the map has its own theme
      id = guardian ? BOSS_SONG[guardian.type] : (foe && fightSong(foe.def, foe.type)) || MAP_ID_SONG[world.map.id] || world.map.song || MAP_SONG[world.map.theme]; // a rift's guardian brings its own theme; a map may have its own song
    }
    else if (world.wave.phase === 'active' && world.wave.n % CONFIG.BOSS_EVERY === 0) id = BOSS_SONG[BOSSES[(world.wave.n / CONFIG.BOSS_EVERY - 1) % BOSSES.length]]; // each boss brings its own theme
    else id = world.ring ? 'ring' : 'arena'; // (0.72) the Echo Ring has its own
    music.play(id);
  }

  /** (0.72) The boss you are fighting right now (awake, and within 30 m), if any. */
  function fightNow() {
    const p = world.player;
    if (!p) return null;
    return world.enemies.find((e) => e.def.boss && !e.dead && e.aggro && Math.hypot(e.x - p.x, e.z - p.z) < 30) || null;
  }

  /** (0.72) Twice a second: the right song, how hard it pushes, and whether a menu is over it. */
  function musicMood() {
    music.setDucked(!['play', 'title', 'defeat'].includes(mode));
    if (mode !== 'play') {
      music.setIntensity(mode === 'town' || mode === 'title' ? 0.15 : 0.4);
      return;
    }
    tune();
    const p = world.player;
    if (!p) return;
    if (fightNow()) return music.setIntensity(1);
    let near = 0;
    for (const e of world.enemies) if (!e.dead && e.aggro && Math.hypot(e.x - p.x, e.z - p.z) < 16) near++;
    music.setIntensity(world.map && world.map.id === 'town' ? 0.15 : Math.min(1, 0.3 + 0.12 * near));
  }

  // ----------------------------------------------------------------- modes
  function setMode(next) {
    if (next !== mode) rebirthSure = false; // (0.66) closing the panel takes the "Are you sure?" back
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
    if (mode === 'play' && net && net.server && !net.alone && !settings.knowsPlayers) hintOnce('players', 'Press O (or click the server badge on the right) to see everyone on this world: look at their gear, invite them to a party, or go to them. Enter chats.', 10); // (0.75.4)
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
    else if (mode === 'pause' && net && net.server && world.mode === 'arena') $('btn-town').textContent = 'Leave the Ring (with your spoils)';
    else if (mode === 'pause') $('btn-town').textContent = net ? (net.role === 'host' ? 'Close the room and go to the title screen' : 'Leave the room') : world.mode === 'explore' ? 'Save and go to the title screen' : 'Back to camp';
    if (mode === 'pause') $('btn-wipe').classList.toggle('hidden', !!net);
    if (mode === 'pause') renderSwitch();
    last = performance.now();
  }

  function refreshTitle() {
    const has = !!save;
    const c = CLASSES[settings.cls];
    for (const b of $('class-picker').children) b.setAttribute('aria-pressed', b.dataset.cls === settings.cls ? 'true' : 'false');
    $('class-desc').textContent = `${c.role}. ${c.blurb}`;
    // (0.57.2) Signed in on the server world: online is the main way to play, offline a quiet option.
    let online = null, who = '';
    try {
      const base = Online.baseOf(DEFAULT_SERVER);
      if (Online.sessionFor(base)) {
        online = Online.cachedChars(base)[settings.cls] || { level: 0 };
        who = Online.cachedName(base);
      }
    } catch (err) {
      online = null; // (before the server list is set up, at the very start)
    }
    $('title-in').classList.toggle('hidden', !online);
    $('title-out').classList.toggle('hidden', !!online);
    if (online) {
      $('title-name').textContent = who || 'you';
      $('btn-online').textContent = online.level ? `Explore online · ${c.name} level ${online.level}` : `Explore online as ${c.name}`;
      $('btn-explore-offline').textContent = has ? `Explore offline instead · level ${save.level}` : 'Explore offline instead';
    }
    $('btn-explore').textContent = has ? `Explore · ${c.name} level ${save.level}` : `Explore as ${c.name}`;
    // The Echo Ring runs in this browser: an offline hero's (wake it with a shard if this class has none yet)
    const ring = $('btn-continue');
    ring.classList.toggle('hidden', !has && account.tickets < 1);
    ring.textContent = (has ? 'The Echo Ring' : 'Wake the Echo Ring · 1 shard') + (online ? ' · offline' : '');
    $('btn-transfer').textContent = online ? 'Move offline saves to another browser' : 'Move saves to another browser';
    $('btn-fresh').dataset.armed = '';
    $('btn-fresh').textContent = 'Start fresh';
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
    $('title-save').textContent = online
      ? `Offline, in this browser: ${account.gold.toLocaleString()} gold · ${account.tickets} starglass shard${account.tickets === 1 ? '' : 's'}.`
      : `${account.gold.toLocaleString()} gold · ${account.tickets} starglass shard${account.tickets === 1 ? '' : 's'}, shared by every class. Each class is one hero, on the road and in the Echo Ring.`;
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
    const cost = ringCost(startWave || (fromSave && fromSave.maxCheckpoint) || 1); // (0.61.1) more than one shard, more the further in
    if (account.tickets < cost) {
      $('title-save').textContent = `Waking the Ring takes ${cost} starglass shards; you have ${account.tickets}. The things on the road above Haven carry them.`;
      return;
    }
    account.tickets -= cost;
    storeAccount(account);
    world = makeWorld({ save: fromSave, startWave, focus: ringFocus() });
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
    $('ring-bank').classList.add('hidden');
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
    refreshAwards();
  }

  /**
   * (0.60) What the Weekly Echo has earned: a reward for each week taken part in (once a week, for this
   * browser's characters; an online character gets its own from the server world), and titles for
   * placing high. Shown on the Weekly Echo screen.
   */
  async function refreshAwards() {
    const box = $('trial-awards');
    const how = `Taking part each week earns +${WEEKLY_REWARD.fragments} Immortal Fragments, +${WEEKLY_REWARD.dust} Wishdust and +${WEEKLY_REWARD.tickets} starglass shards. When a week ends, first on a subclass's board is its <b>Champion</b> (and earns the Echo Champion weapon glow), and the top three and the top tenth earn titles too.`;
    if (!trialApi.online()) return (box.innerHTML = how);
    const me = trialApi.identity();
    if (!me) return (box.innerHTML = `${how} Put a run on the boards to take part.`);
    box.innerHTML = `${how} Checking your placings…`;
    const aw = await trialApi.awards(me.id);
    if (mode !== 'trial') return;
    if (!aw.ok) return (box.innerHTML = how);
    const places = Array.isArray(aw.places) ? aw.places : [];
    const title = bestTitle(places);
    const claimed = Array.isArray(account.weeklyClaimed) ? account.weeklyClaimed : [];
    const fresh = (aw.played || []).filter((w) => Number.isInteger(w) && !claimed.includes(w));
    const champion = places.some((x) => x.title === 'champion');
    const newGlow = champion && !(world.player.glows || []).includes('echoed');
    box.innerHTML = `${how}${title ? ` Your best title: <b>${esc(title)}</b>.` : ''} Weeks taken part in: ${(aw.played || []).length}.`;
    if ((fresh.length || newGlow) && !net && world.mode !== 'arena') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'primary';
      b.textContent = `Claim for ${CLASSES[world.cls].name}: ${fresh.length ? `+${WEEKLY_REWARD.fragments * fresh.length} Fragments, +${WEEKLY_REWARD.dust * fresh.length} Wishdust, +${WEEKLY_REWARD.tickets * fresh.length} shards` : ''}${newGlow ? `${fresh.length ? ' and ' : ''}the Echo Champion glow` : ''}`;
      b.addEventListener('click', () => {
        world.weeklyReward(fresh.length, champion);
        drainEvents();
        account.weeklyClaimed = [...claimed, ...fresh].slice(-60);
        storeAccount(account);
        persist();
        refreshAwards();
      });
      box.appendChild(b);
    }
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
    hud.banner('The Weekly Echo', `Week ${wk.index + 1} · level ${wk.level}${TWISTS[wk.twist] ? ` · ${TWISTS[wk.twist].name}: ${TWISTS[wk.twist].desc}` : ''}`);
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
    // (1.0) once the Wishkeep is open, the day starts there (Haven is a walk or the Waygate away)
    if (world.keepOpen && world.keepOpen()) world.command({ type: 'travel', to: KEEP.map });
    else hintOnce('explore', 'Haven is safe and heals you. Stand in the blue portal to travel to the Greenwood Trail.', 10);
  }

  // --------------------------------------------------------------- augments
  // (0.66) Auto-pick: take the offered augment that ranks highest in your own priority list (ui/augpriority.js).
  let autoSent = '';
  function augOrder() {
    return AugPri.orderFor(settings.augOrder, world.cls);
  }
  function autoAugment() {
    const offer = world.offer;
    if (!settings.autoAug || !offer || trialRun) return false;
    const key = `${world.wave.cleared}:${offer.choices.join()}`;
    if (autoSent === key) return true; // sent, waiting to hear back (online)
    autoSent = key;
    applyNow({ type: 'augment', id: AugPri.pickFrom(offer.choices, augOrder()) });
    return true;
  }
  /** The priority list: drag a row, or nudge it with the arrows. */
  function renderAugPriority() {
    const box = $('augpri-list');
    const order = augOrder();
    box.innerHTML = '';
    $('augpri-auto').checked = !!settings.autoAug;
    order.forEach((id, i) => {
      const a = AUGMENTS[id];
      const row = document.createElement('li');
      row.className = 'augpri-row' + (a.tier === 2 ? ' strong' : '') + (a.spec ? ' spec' : '');
      row.draggable = true;
      row.dataset.id = id;
      row.innerHTML = `<span class="augpri-n">${i + 1}</span><span class="augpri-what"><b>${esc(a.name)}</b>${a.spec ? `<small>${esc(SPECS[a.spec] ? SPECS[a.spec].name : a.spec)}</small>` : ''}<em>${esc(a.desc)}</em></span><span class="augpri-move"><button type="button" data-up="${id}" aria-label="Higher">▲</button><button type="button" data-down="${id}" aria-label="Lower">▼</button></span>`;
      box.appendChild(row);
    });
  }
  function moveAug(id, to) {
    const order = augOrder();
    const from = order.indexOf(id);
    if (from < 0) return;
    order.splice(from, 1);
    order.splice(Math.max(0, Math.min(order.length, to)), 0, id);
    settings.augOrder = Object.assign({}, settings.augOrder, { [world.cls]: order });
    storeSettings(settings);
    renderAugPriority();
  }

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
  let travelGate = null; // (1.0) the Verge crossing it was opened from ('deep' or 'caelum'; null: not a crossing)
  let riftPick = null; // the rift tier chosen at the Waygate
  /**
   * (0.61.3) The world tier you are on, for the Waygate. In Haven your own choice counts at once (on the server
   * world the copy's tier only catches up with the next update, so the picker showed the old one).
   */
  function myTier() {
    const p = world.player;
    const lead = !(net && net.role === 'client') || !!(net && net.server);
    if (lead && world.map && world.map.safe && p && p.worldTier) return Math.max(1, Math.min(MAX_TIER, p.worldTier));
    return world.worldTier();
  }
  /** (0.62) The Ring's next-wave key: X unless chosen otherwise ('enter' means Enter only). */
  function nextWaveKey() {
    const k = settings.nextWaveKey === undefined ? 'x' : settings.nextWaveKey;
    return k === 'enter' ? null : k;
  }
  function nextWaveLabel() {
    const k = nextWaveKey();
    return k ? `${k.toUpperCase()} or Enter` : 'Enter';
  }
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
      const cur = myTier();
      for (let t = 1; t <= MAX_TIER; t++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost tiny' + (t === cur ? ' on' : '');
        b.textContent = `${TIERS[t].numeral} · ${TIERS[t].name}`;
        b.disabled = t > p.tierMax || !lead;
        b.title = t > p.tierMax ? 'Beat The Unmade on the tier before to open this one' : t === 1 ? 'The world as it was' : `Every map at level 100: enemies ${TIERS[t].hp}x health, ${TIERS[t].dmg}x damage; ${TIERS[t].exp}x EXP, more and better loot, more elites`;
        b.addEventListener('click', () => {
          applyNow({ type: 'setTier', tier: t });
          if (net && net.server && t <= p.tierMax) p.worldTier = t; // (0.61.3) shown at once; the server's next update agrees
          renderTravel();
        });
        row.appendChild(b);
      }
      root.appendChild(row);
      note(lead ? 'Every map out in the world uses this tier. Beat The Unmade on your highest tier to open the next.' : 'The party leader picks the world tier.');
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
  /**
   * The Deep (0.54; its own panel, 0.57.2): not a world tier and not part of the world above. Each Depth
   * asks for Ember, which is what you let go of in your rebirths and stays with you through them.
   * Drawn as a stair going down: Ember against each Depth's need, which ones you can hurt, and the way
   * into each Primordial's domain.
   */
  function renderDeep() {
    const root = $('travel-deep');
    root.innerHTML = '';
    const p = world.player;
    const rb = p.rebirth || {};
    if (travelStone != null || !world.map.safe || !(world.deepKnown(p) || (p.endings && p.endings.self > 0 && rb.n >= 1))) return;
    const lead = !(net && net.role === 'client') || !!(net && net.server);
    const ember = world.ember();
    const top = DEEP.depths[DEPTH_IDS[DEPTH_IDS.length - 1]].ember;
    const box = document.createElement('section');
    box.className = 'deep';
    box.setAttribute('aria-label', 'The Deep');
    const marks = DEPTH_IDS.map((d) => `<i style="left:${(DEEP.depths[d].ember / top) * 100}%" title="Depth ${DEEP.depths[d].numeral}: Ember ${DEEP.depths[d].ember}"></i>`).join('');
    box.innerHTML = `<p class="deep-eyebrow">Below the Starwell</p>
      <h3 class="deep-name">The Deep</h3>
      <p class="deep-lede">It does not scale to you, and it is not a world tier. What lives down here answers only to Ember: short of what a Depth asks, your blows barely land; below half of it, every one is 1.</p>
      <p class="deep-note">A Primordial counts for you (its quest, and Mastery) only if you have its Depth's Ember yourself, or nobody beside you does. Being carried down does not count.</p>
      <div class="deep-ember">
        <div class="deep-ember-n"><b>${ember}</b><span>Ember</span></div>
        <div class="deep-gauge"><div class="deep-fill" style="width:${Math.min(100, (ember / top) * 100)}%"></div>${marks}</div>
      </div>
      <p class="deep-note">Ember is what you let go of, and it stays with you through every rebirth: up to +${DEEP.emberMax} each time you are reborn, by everything you give up (what you wear and what is in your bag), and +${DEEP.kindlingMax} from each Depth's Kindling.</p>`;
    const stair = document.createElement('div');
    stair.className = 'deep-stair';
    const above = document.createElement('button');
    above.type = 'button';
    above.className = 'deep-above' + (!p.depth ? ' on' : '');
    above.textContent = p.depth ? 'Climb back to the world above' : 'You are in the world above';
    above.disabled = !lead || !p.depth;
    above.addEventListener('click', () => {
      applyNow({ type: 'setDepth', depth: 0 });
      renderTravel();
    });
    stair.appendChild(above);
    DEPTH_IDS.forEach((d, i) => {
      const D = DEEP.depths[d];
      const open = world.depthOpen(p, d);
      const seen = (rb.deepMax || 0) >= d || open; // (0.57.6) the first Depth's domain opens in the main story
      const s = emberScale(ember, D.ember);
      const row = document.createElement('div');
      row.className = 'deep-step' + (p.depth === d ? ' on' : '') + (open ? '' : ' sealed') + (open && s.one ? ' futile' : open && s.dealt < 1 ? ' short' : '');
      row.style.setProperty('--step', i);
      const state = !open ? (p.level < DEEP.level ? 'Sealed · level 100 first, in this life' : 'Sealed · the story opens it') : s.one ? 'You cannot hurt anything here' : s.dealt < 1 ? `Your blows land at ${Math.round(s.dealt * 100)}%` : 'You are ready';
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'deep-pick';
      pick.disabled = !open || !lead || p.depth === d;
      pick.title = open ? `Every map at Depth ${D.numeral}: enemies ${D.hp}x tier V health and ${D.dmg}x damage, ${D.exp}x EXP.` : '';
      pick.innerHTML = `<span class="deep-num">${D.numeral}</span><span class="deep-what"><b>${D.name}</b><small>${D.title} · Ember ${D.ember}</small><em>${p.depth === d ? 'You are here · ' : ''}${state}</em></span>`;
      pick.addEventListener('click', () => {
        applyNow({ type: 'setDepth', depth: d });
        renderTravel();
      });
      row.appendChild(pick);
      const dom = DEEP.depths[d].map;
      if (seen && MAPS[dom]) {
        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'deep-go';
        go.textContent = 'Descend';
        go.title = `Travel to ${MAPS[dom].name}, where the Primordial of ${D.title} waits`;
        go.disabled = !open || world.map.id === dom;
        go.addEventListener('click', () => {
          setMode('play');
          applyNow({ type: 'travel', to: dom });
        });
        row.appendChild(go);
      }
      stair.appendChild(row);
    });
    box.appendChild(stair);
    if (!lead) {
      const n = document.createElement('p');
      n.className = 'deep-note';
      n.textContent = 'The party leader chooses the Depth.';
      box.appendChild(n);
    }
    root.appendChild(box);
  }

  // (0.64) Mind-Locked: a ring in the middle of the screen that empties as the lock runs out and flashes
  // white for each crack (the moment a parry press breaks it). Driven by events, so it works online too.
  const lockUi = { el: null, end: 0, total: 1, raf: 0 };
  function mindLockEl() {
    if (lockUi.el) return lockUi.el;
    const el = document.createElement('div');
    el.id = 'mindlock';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="ml-ring"><svg viewBox="0 0 100 100"><circle class="ml-track" cx="50" cy="50" r="44"/><circle class="ml-left" cx="50" cy="50" r="44" pathLength="100"/></svg><b>Mind-Locked</b><span>Parry when it cracks</span></div>';
    document.body.appendChild(el);
    return (lockUi.el = el);
  }
  function mindLockTick() {
    const el = lockUi.el;
    if (!el || !el.classList.contains('on')) return;
    const left = Math.max(0, lockUi.end - performance.now() / 1000);
    el.querySelector('.ml-left').style.strokeDashoffset = String(100 - (left / lockUi.total) * 100);
    if (left <= 0) return mindLockHide();
    lockUi.raf = requestAnimationFrame(mindLockTick);
  }
  function mindLockShow(time, short) {
    const el = mindLockEl();
    const now = performance.now() / 1000;
    lockUi.end = Math.max(lockUi.end, now + time);
    lockUi.total = Math.max(0.1, lockUi.end - now);
    el.classList.toggle('short', !!short);
    el.classList.add('on');
    cancelAnimationFrame(lockUi.raf);
    mindLockTick();
  }
  function mindLockHide() {
    if (!lockUi.el) return;
    lockUi.el.classList.remove('on', 'crack', 'slip');
    lockUi.end = 0;
    cancelAnimationFrame(lockUi.raf);
  }
  function mindLockCrack() {
    const el = lockUi.el;
    if (!el || !el.classList.contains('on')) return;
    el.classList.add('crack');
    setTimeout(() => el.classList.remove('crack'), CONFIG.MIND_LOCK.crack * 1000);
    sfx.ui();
  }
  function mindLockSlip() {
    const el = lockUi.el;
    if (!el) return;
    lockUi.end += CONFIG.MIND_LOCK.miss;
    el.classList.remove('slip');
    void el.offsetWidth;
    el.classList.add('slip');
  }

  /** Caelum (0.64): the Granted's four maps, above the Starwell, each asking for an Animus. */
  function renderCaelum() {
    const root = $('travel-deep');
    const p = world.player;
    if (travelStone != null || !world.map.safe || !world.questState('lives')) return;
    const taken = !!world.questState(CAELUM.quest);
    const animus = p.animus || 0;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const box = document.createElement('section');
    box.className = 'deep caelum';
    box.setAttribute('aria-label', 'Caelum');
    const marks = CAELUM.ids.map((id) => `<i style="left:${(CAELUM.maps[id].animus / MASTERY.animusMax) * 100}%" title="${CAELUM.maps[id].name}: Animus ${pct(CAELUM.maps[id].animus)}"></i>`).join('');
    box.innerHTML = `<p class="deep-eyebrow">Above the Starwell</p>
      <h3 class="deep-name">Caelum</h3>
      <p class="deep-lede">Where the Granted live. They do not care how strong you are; they ask for Animus, which only Mastery gives. Short of what a map asks, their Dominions (the amber warnings) take most of your health and lock your mind, the ground flickers, and only a near-perfect parry turns them. Nearly impossible. Never quite.</p>
      <div class="deep-ember">
        <div class="deep-ember-n"><b>${pct(animus)}</b><span>Animus</span></div>
        <div class="deep-gauge"><div class="deep-fill" style="width:${Math.min(100, (animus / MASTERY.animusMax) * 100)}%"></div>${marks}</div>
      </div>
      <p class="deep-note">${taken ? 'Walk the maps in order: each one\'s far portal leads to the next, and the Waygate remembers every one you reach.' : `Wren's quest ${QUESTS[CAELUM.quest].name} opens the way.`}</p>`;
    const stair = document.createElement('div');
    stair.className = 'deep-stair';
    CAELUM.ids.forEach((id, i) => {
      const C = CAELUM.maps[id];
      const open = taken && (i === 0 || p.visited.includes(id));
      const short = animusShort(animus, C.animus);
      const row = document.createElement('div');
      row.className = 'deep-step' + (world.map.id === id ? ' on' : '') + (open ? '' : ' sealed') + (open && short ? ' futile' : '');
      row.style.setProperty('--step', i);
      const state = !taken ? 'Sealed · the story opens it' : !open ? 'Not reached yet · walk on from the last map' : short ? `Short of its Animus: nearly impossible` : 'You are ready';
      const info = document.createElement('div');
      info.className = 'deep-pick';
      info.innerHTML = `<span class="deep-num">${C.numeral}</span><span class="deep-what"><b>${C.name}</b><small>Animus ${pct(C.animus)} · ${C.points} Mastery</small><em>${state}</em></span>`;
      row.appendChild(info);
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'deep-go';
      go.textContent = 'Ascend';
      go.title = open ? `Travel to ${C.name}${short ? `. You have ${pct(animus)} of the ${pct(C.animus)} Animus it asks: you may go, but it will not be fair.` : ''}` : '';
      go.disabled = !open || world.map.id === id;
      go.addEventListener('click', () => {
        setMode('play');
        applyNow({ type: 'travel', to: id });
      });
      row.appendChild(go);
      stair.appendChild(row);
    });
    box.appendChild(stair);
    root.appendChild(box);
  }

  function renderTravel() {
    if (travelGate) return renderCrossing(travelGate);
    renderDeep();
    renderCaelum();
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
    if (world.map.id !== KEEP.map && world.keepOpen && world.keepOpen()) {
      // (0.80) the Wishkeep: the account's, by the Waygate, once any class has beaten the Quiet
      const kb = document.createElement('button');
      kb.type = 'button';
      kb.className = 'travel-row fit keep-row';
      const k = world.player.keep;
      kb.innerHTML = `<b>The Wishkeep</b><span class="lv">${k ? `Tier ${KEEP.tiers[k.tier].numeral}` : 'New'}</span><span>${k ? `${k.wishes.filter((w) => w.done).length ? 'Wishes answered and waiting · ' : ''}${MAPS[KEEP.map].blurb}` : 'Someone has lit a fire for you. Go and see'}</span>`;
      kb.addEventListener('click', () => {
        setMode('play');
        applyNow({ type: 'travel', to: KEEP.map });
      });
      here.prepend(kb);
    } else if (world.map.id === KEEP.map) {
      const home = document.createElement('button');
      home.type = 'button';
      home.className = 'travel-row';
      home.innerHTML = '<b>Haven</b><span>Back to town: friends, the shops, the board</span>';
      home.addEventListener('click', () => {
        setMode('play');
        applyNow({ type: 'travel', to: 'town' });
      });
      here.prepend(home);
    }
    if (world.map.id !== 'verge' && world.keepOpen && world.keepOpen()) {
      // (0.99.10) the Verge by the Waygate (arriving in its middle), once the keep is open
      const vb = document.createElement('button');
      vb.type = 'button';
      vb.className = 'travel-row fit';
      vb.innerHTML = `<b>The Verge</b><span>${MAPS.verge.blurb}</span>`;
      vb.addEventListener('click', () => {
        setMode('play');
        applyNow({ type: 'travel', to: 'verge' });
      });
      here.appendChild(vb);
    }
    for (const id of MAP_IDS) {
      const m = MAPS[id];
      if (m.safe || id === world.map.id) continue;
      if (m.fromTier) {
        // The Wilds (0.33), Asterfell (0.39): by the Waygate only, from world tier II; Asterfell
        // only once Wren has told you about it (unseen until her quest is taken).
        const told = !m.unlock || world.questState(m.unlock) === 'done';
        if (m.unlock && !world.questState(m.unlock)) continue;
        const open = told && myTier() >= m.fromTier;
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
      if (m.deep || CAELUM.maps[id]) continue; // (0.57.2) the Primordials' domains are in the Deep's own panel (renderDeep); (0.64) Caelum in its own
      const known = world.mapKnown ? world.mapKnown(id) : p.visited.includes(id); // (0.70.1) the whole road, once the Cinder has fallen on any class
      const top = m.level + m.levelSpan + (m.boss ? 1 : 0);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'travel-row' + (known && p.level >= m.level - 2 && p.level <= top ? ' fit' : '');
      btn.disabled = !known;
      btn.innerHTML = `<b>${known ? m.name : '???'}</b><span class="lv">Levels ${m.level} to ${top}</span><span>${known ? (p.level > top ? 'You have outgrown this map' : p.level < m.level - 2 ? 'Dangerous at your level' : 'A good match for your level') + (m.boss ? ' · a boss waits in the middle' : '') + (p.visited.includes(id) ? '' : ' · open: the Cinder has fallen') : 'Not discovered yet'}</span>`;
      btn.addEventListener('click', () => {
        setMode('play');
        applyNow({ type: 'travel', to: id });
      });
      list.appendChild(btn);
    }
  }

  /** (1.0) A crossing on the Verge: only where it goes (the Deep's Depths, or Caelum's maps). */
  function renderCrossing(kind) {
    $('travel-here').innerHTML = '';
    $('travel-list').innerHTML = '';
    $('travel-deep').innerHTML = '';
    $('travel-eyebrow').textContent = kind === 'deep' ? 'The Way Down' : 'The Way Up';
    $('travel-desc').textContent = kind === 'deep' ? 'Down through the rock, past the Starwell, to the Deep.' : 'Up the white stair, past the Starwell, to Caelum.';
    if (kind === 'deep') renderDeep();
    else renderCaelum();
    if (!$('travel-deep').children.length) {
      const p = document.createElement('p');
      p.className = 'setting-desc';
      p.textContent = kind === 'deep' ? 'The way down is shut to you: the Deep opens after the Starwell, through rebirth.' : 'The way up is shut to you: Caelum opens with the quest More Than One Life.';
      $('travel-deep').appendChild(p);
    }
  }

  /** (1.0) The crack in the air on the Verge. Lacuna is through it, one day (docs/design/chapter-2.md). */
  function renderCrack() {
    const p = world.player;
    const granted = ['ianitor', 'arbiter', 'desiderium', 'fiat'].every((t) => p.bossKills && p.bossKills[t] > 0);
    $('talk-role').textContent = 'The Verge';
    $('talk-name').textContent = 'A crack in the air';
    $('talk-keys').classList.add('hidden');
    $('talk-quests').innerHTML = '';
    $('talk-line').textContent = granted
      ? 'Since the Granted fell, the crack has widened. Light comes through it: sunlight, from a sky that is not this one, and the sound of a market. It still will not let you through. Not yet.'
      : 'A thin crack hangs in the air, taller than a door, its edges bright. It hums when you come close and pushes you gently back. Something is on the other side. The Granted, up in Caelum, would know what.';
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
    if (r.fragments) parts.push(`<span style="color:${RARITIES[6].color}">${r.fragments} Immortal Fragments</span>`);
    if (r.dust) parts.push(`${r.dust} Wishdust`);
    const q = QUESTS[id];
    if (q.reward.unique && q.reward.unique[world.cls]) parts.push(`<span style="color:${RARITIES[6].color}">Edric's Sword (unique)</span>`);
    if (r.ember) parts.push(`<span style="color:#ff8a4a">+${r.ember} Ember, kept through every rebirth</span>`);
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
    const me = net ? net.pid : world.cur.pid;
    if (p.merchantCd > 0 && p.merchantId !== mc.id && mc.id != null) {
      const w = document.createElement('p');
      w.className = 'setting-desc';
      w.textContent = `You bought from another merchant not long ago: you can buy here again in ${Math.ceil(p.merchantCd / 60)} minute${p.merchantCd > 60 ? 's' : ''}.`;
      list.appendChild(w);
    }
    mc.stock.forEach((s, i) => {
      s = Object.assign({}, s, { sold: !!(s.sold || (s.bought && s.bought[me])) });
      const el = document.createElement('div');
      el.className = 'quest' + (s.ware ? ' ware' : '') + (s.kind === 'fragment' || s.kind === 'immortal' ? ' ware-gold' : '');
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
  // ---------------------------------------------------------------- the Wishkeep (0.80)
  const keepCost = (c) => `${c.faith.toLocaleString()} Faith${c.stone ? ` and ${c.stone} Wishstone` : ''}`;
  const keepHave = (k) => `<span class="keep-have">${k.faith.toLocaleString()} Faith · ${k.stone} Wishstone${k.sigils || k.nightMax ? ` · ${k.sigils} Sigils` : ''}</span>`;
  /** The wishes board: what the settlers want, and the reward for each. */
  function renderKeepBoard() {
    const p = world.player, k = p.keep;
    $('talk-role').textContent = 'What the keep is wishing for';
    $('talk-name').textContent = 'The Wishes';
    $('talk-keys').classList.add('hidden');
    const list = $('talk-quests');
    list.innerHTML = '';
    if (!k) return ($('talk-line').textContent = 'Nobody has pinned anything here yet.');
    $('talk-line').innerHTML = talkNote ? esc(talkNote) : `Each note is in someone's hand. Answer one and the keep grows: Faith raises its tiers and halls, Wishstone builds them. ${keepHave(k)}`;
    k.wishes.forEach((w, i) => {
      const who = SETTLERS[w.who];
      const el = document.createElement('div');
      el.className = 'quest keep-wish' + (w.done ? ' ready' : '');
      const prog = w.kind === 'kill' ? `${w.n} / ${w.need}` : w.kind === 'offer' || w.kind === 'tell' ? '' : w.done ? '' : 'Not yet';
      el.innerHTML = `<h4>${esc(who.name)}<small>${esc(who.role)}</small></h4><p>"${esc(wishText(w))}"</p><div class="goal">${esc(wishGoal(w))}${prog ? ` · ${prog}` : ''}</div>${wishWhere(w) && wishWhere(w) !== w.mapName ? `<div class="where">Where: ${esc(wishWhere(w))}</div>` : ''}<div class="rewards">Answered: ${Math.round(w.reward.faith * world.keepMult())} Faith${w.reward.stone ? `, ${w.reward.stone} Wishstone` : ''}, and ${esc(who.name)} grows closer</div>`;
      const row = document.createElement('div');
      row.className = 'bounty-btns';
      const go = document.createElement('button');
      go.type = 'button';
      if (w.done) {
        go.className = 'primary';
        go.textContent = 'Answer it';
      } else if (w.kind === 'offer') {
        const have = w.what === 'fragment' ? (p.misc && p.misc.fragment) || 0 : p[w.what] || 0;
        go.className = 'primary no-quick';
        go.textContent = `Give it (you have ${have.toLocaleString()})`;
        go.disabled = have < w.need;
      } else if (w.kind === 'tell') {
        go.className = 'primary';
        go.textContent = 'Sit and listen';
      } else if (w.kind === 'tide') {
        go.className = 'ghost';
        go.textContent = world.tide && world.tide.state === 'on' ? 'The Tide is coming' : 'Call the night (at the Hearth)';
        go.disabled = true;
      } else {
        go.className = 'ghost';
        go.textContent = 'Out in the world';
        go.disabled = true;
      }
      go.addEventListener('click', () => {
        talkNote = '';
        applyNow({ type: 'keepAnswer', i });
      });
      row.appendChild(go);
      if (!w.done) {
        const sk = document.createElement('button');
        sk.type = 'button';
        sk.className = 'ghost';
        sk.textContent = `Ask for another · ${KEEP.skip} Faith`;
        sk.disabled = k.faith < KEEP.skip;
        sk.addEventListener('click', () => { talkNote = ''; applyNow({ type: 'keepSkip', i }); });
        row.appendChild(sk);
      }
      el.appendChild(row);
      list.appendChild(el);
    });
  }

  // (0.81) small helpers for the keep's panels
  const keepBtn = (label, onClick, { primary = false, disabled = false, quick = false, title = '' } = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = (primary ? 'primary' : 'ghost') + (quick ? '' : ' no-quick') + ' tiny';
    b.textContent = label;
    b.disabled = disabled;
    if (title) b.title = title;
    b.addEventListener('click', () => {
      talkNote = '';
      onClick();
    });
    return b;
  };
  const keepCard = (title, small, html = '') => {
    const el = document.createElement('div');
    el.className = 'quest';
    el.innerHTML = `<h4>${title}${small ? `<small>${small}</small>` : ''}</h4>${html}`;
    return el;
  };
  const troopLine = (t) => {
    const k = world.player.keep;
    const st = troopStats(t, k && k.armory);
    const R = RARITIES[t.rar || 0];
    const worn = heroWorn(t, k && k.armory);
    const pips = HERO_SLOTS.map((sl) => (worn[sl] ? `<i class="hg-pip" style="background:${RARITIES[worn[sl].r].color}" title="${HERO_SLOT_NAMES[sl]}: ${esc(worn[sl].name)}"></i>` : `<i class="hg-pip empty" title="${HERO_SLOT_NAMES[sl]}: empty"></i>`)).join('');
    return `<b style="color:${R.color}">${esc(t.name)}</b> <small style="color:${R.color}">${HERO_RARITY.names[t.rar || 0]}</small> · ${CLASSES[t.cls].name} · level ${t.lvl} · arms ${t.gear} · ${st.hp.toLocaleString()} health, ${st.dmg.toLocaleString()} damage${(t.skills || []).some(Boolean) ? ` · ${(t.skills || []).filter(Boolean).map((sk) => esc(SKILLS[sk].name)).join(', ')}` : ''}${troopSupport(t) ? ' <small class="hg-heal">healer</small>' : ''} <span class="hg-pips">${pips}</span>`;
  };
  const hallNote = (cls) => {
    const k = world.player.keep;
    if (!world.keepRecord().halls.includes(cls)) return `Shut: it opens once a ${CLASSES[cls].name} on your account has beaten the Quiet.`;
    if (world.wrecked(cls)) return 'Wrecked in a Tide: mend it at the Hearth (Wishstone) to use it again.';
    if (!(k.halls[cls] >= 1)) return 'Derelict: raise it to level 1 below to put it to work.';
    return '';
  };

  /** (0.82.1) The Mine or the Fields: what it makes, who works it, and raising it. */
  /** (0.92) The Seraph's plinth: raise it, lay Faith at its feet, take it up. */
  function renderSeraph() {
    const k = world.player.keep, s = k && k.statue;
    $('talk-role').textContent = 'By the Hearth';
    $('talk-name').textContent = STATUE.name;
    $('talk-keys').classList.add('hidden');
    const list = $('talk-quests');
    list.innerHTML = '';
    if (!k) return ($('talk-line').textContent = 'An empty plinth.');
    if (!s) {
      $('talk-line').innerHTML = talkNote ? esc(talkNote) : `An empty plinth of white stone. The faithful say an angel should stand here, and that they could carve one, if the keep were known to hold back the deep nights. ${keepHave(k)}`;
      const c = STATUE.raise;
      const ready = (k.nightMax || 0) >= STATUE.needNight;
      const card = keepCard('Raise the Seraph', ready ? `${keepCost(c)} and ${c.sigils} Sigils` : `once Night ${STATUE.needNight} is held (best so far: ${k.nightMax || 0})`, `<p>An angel of stone for the whole account. <b>Possess</b> it (<kbd>Y</kbd>) anywhere in your keep, at any time, a night or a raid included, with no Faith and no time limit, and fight over your shoulder with its own skills: <b>Dawnlance</b> (<kbd>Q</kbd>), <b>Wingbeat</b> (<kbd>E</kbd>, which also mends your heroes), <b>Glide</b> (<kbd>Shift</kbd>) and <b>Descent</b> (<kbd>R</kbd>, from level 5).</p><p class="setting-desc">It is as strong as the Night its level matches, and it starts ${STATUE.startBelow} levels below your best Night. It grows from what it fells, from the nights it fights in, and from Faith laid at its feet, never past your best Night. Felled, it is stone for ${STATUE.rest} seconds.</p>`);
      card.appendChild(keepBtn(ready ? `Raise it · ${keepCost(c)}, ${c.sigils} Sigils` : `Hold Night ${STATUE.needNight} first`, () => applyNow({ type: 'keepStatue' }), { primary: true, disabled: !ready || k.faith < c.faith || k.stone < c.stone || k.sigils < c.sigils }));
      list.appendChild(card);
      return;
    }
    const cap = statueCap(k), need = STATUE.need(s.lvl);
    const pos = !!world.player.possess;
    $('talk-line').innerHTML = talkNote ? esc(talkNote) : `${s.rest > 0 ? `Only stone for now: it wakes in ${Math.ceil(s.rest)} seconds.` : 'White stone, warm to the touch. The faithful leave candles at its feet.'} ${keepHave(k)}`;
    const card = keepCard(`The Seraph, level ${s.lvl}`, s.lvl >= cap ? `as high as your best Night (${cap})` : `${s.xp} of ${need} toward level ${s.lvl + 1} · up to ${cap}`, `<p>A match for <b>Night ${s.lvl}</b>. It has fought in ${s.nights} night${s.nights === 1 ? '' : 's'} and raid${s.nights === 1 ? '' : 's'}${s.fells ? ` and been felled ${s.fells} time${s.fells === 1 ? '' : 's'}` : ''}.${s.hp < 1 ? ` Its stone is ${Math.round(s.hp * 100)}% whole (it mends by itself).` : ''}</p><p class="setting-desc">It grows from what it fells (less on Nights more than two below its level) and from every night or raid it fights in and holds. <kbd>Y</kbd> takes it up anywhere in your keep, and leaves it again.</p>`);
    card.appendChild(keepBtn(pos ? 'Leave the Seraph (Y)' : s.rest > 0 ? `Stone for ${Math.ceil(s.rest)}s` : 'Possess it (Y)', () => {
      setMode('play');
      input.togglePossess();
    }, { primary: true, disabled: !pos && s.rest > 0 }));
    if (s.lvl < cap) {
      const o = STATUE.offer(s.lvl);
      card.appendChild(keepBtn(`Lay Faith at its feet · ${o.faith.toLocaleString()} Faith → a quarter of a level`, () => applyNow({ type: 'keepOffer', n: 1 }), { disabled: k.faith < o.faith }));
      const toNext = Math.ceil((need - s.xp) / (need * STATUE.offerShare));
      if (toNext > 1) card.appendChild(keepBtn(`To level ${s.lvl + 1} · ${(toNext * o.faith).toLocaleString()} Faith`, () => applyNow({ type: 'keepOffer', n: toNext }), { disabled: k.faith < toNext * o.faith }));
    }
    list.appendChild(card);
    // (0.98) its rarity: an offering raises it once its level reaches the gate; Eternal is won in the trial
    {
      const t = s.tier || 0, T = STATUE_TIERS[t], N = STATUE_TIERS[t + 1];
      const col = RARITIES[Math.min(t, RARITIES.length - 1)].color;
      const opens = N ? ['q', 'w', 'e', 'r'].flatMap((c) => Object.values(STATUE_SKILLS[c]).filter((d) => d.tier === t + 1).map((d) => d.name)) : [];
      const tc = keepCard(`Rarity: <span style="color:${col}">${T.name}</span>`, N ? (N.trial ? `Eternal: win the trial` : `next: ${N.name} at level ${N.lvl}`) : 'as high as it goes', `<p>Its blows land and its stone stands <b>${T.mult}×</b> as hard as a Common Seraph's.${N ? ` <span style="color:${RARITIES[Math.min(t + 1, RARITIES.length - 1)].color}">${N.name}</span>: <b>${N.mult}×</b>${opens.length ? `, and it learns <b>${opens.join(', ')}</b>` : ''}.` : ''}</p>`);
      if (N && !N.trial) {
        const c = N.cost, ok = s.lvl >= N.lvl && k.faith >= c.faith && k.stone >= c.stone && (k.sigils || 0) >= c.sigils;
        tc.appendChild(keepBtn(s.lvl < N.lvl ? `${N.name} opens at level ${N.lvl}` : `Raise it to ${N.name} · ${c.faith.toLocaleString()} Faith, ${c.stone.toLocaleString()} Wishstone, ${c.sigils} Sigils`, () => applyNow({ type: 'keepStatueTier' }), { primary: s.lvl >= N.lvl, disabled: !ok }));
      } else if (N && N.trial) {
        const open = s.lvl >= TRIAL.lvl;
        tc.insertAdjacentHTML('beforeend', `<p class="setting-desc"><b>The Eternal trial.</b> The Seraph alone, against <b>Omnividens, the All-Seeing Truth</b>: a great eye from the far sky in a wheel of lesser ones. Its stares fall where you stand and where you are going, its gaze burns a line along the ground, it closes round itself in a burst when you are close, and its Vigils swoop at you (each one you put out mends 5% of your stone). It mends nothing else. Win, and the Seraph is <b style="color:${RARITIES[7].color}">Eternal</b> (<b>${N.mult}×</b>), and learns <b>Ascension</b>.</p>`);
        const busy = world.tide && world.tide.state === 'on';
        tc.appendChild(keepBtn(world.eternalTrial ? 'The trial is on' : !open ? `Opens at level ${TRIAL.lvl}` : busy ? 'Not during a night' : 'Face the Eternal trial', () => { setMode('play'); applyNow({ type: 'keepTrial' }); }, { primary: open, disabled: !open || busy || !!world.eternalTrial || s.rest > 0 }));
      }
      list.appendChild(tc);
    }
    // (0.94) its skills: one for each key, chosen here from those its level has opened
    const KEYS = { q: 'Q', w: 'E', e: 'Shift', r: 'R' };
    const chosen = statueKit(s);
    const kit = keepCard('Its skills', 'more open as it grows', '<p class="setting-desc">One skill for each key, over your shoulder. Swap them here whenever you like.</p>');
    for (const c of ['q', 'w', 'e', 'r']) {
      for (const id of Object.keys(STATUE_SKILLS[c])) {
        const d = STATUE_SKILLS[c][id];
        const on = chosen[c].seraphSkill === id, open = statueSkillOpen(s, d);
        const tierLock = d.tier && (s.tier || 0) < d.tier ? STATUE_TIERS[d.tier].name : null;
        const row = document.createElement('div');
        row.className = 'keep-troop' + (open ? '' : ' locked');
        row.innerHTML = `<span><span class="seraph-ico">${svg(d.icon)}</span><kbd>${KEYS[c]}</kbd> <b${d.tier ? ` style="color:${RARITIES[Math.min(d.tier, RARITIES.length - 1)].color}"` : ''}>${esc(d.name)}</b>${d.wind ? ` <i>(gathers ${d.wind}s)</i>` : ''}${open ? '' : tierLock ? ` <i>· opens at ${tierLock}</i>` : ` <i>· opens at level ${d.lvl}</i>`}<br><small>${esc(d.desc)}</small></span>`;
        row.appendChild(keepBtn(on ? 'In use' : open ? 'Use' : tierLock || `Level ${d.lvl}`, () => applyNow({ type: 'keepStatueSkill', slot: c, id }), { primary: on, disabled: on || !open }));
        kit.appendChild(row);
      }
    }
    kit.insertAdjacentHTML('beforeend', '<p class="setting-desc"><b>Strike</b> (left click: a bolt of holy light from its prayer, seeking the foe you aim at, 22 m) and <b>roll</b> (double-tap a direction) are always its own.</p>');
    list.appendChild(kit);
  }
  function renderKeepWorks(id) {
    const k = world.player.keep, W = WORKS[id];
    $('talk-role').textContent = W.kind === 'mine' ? 'Under the keep' : 'Beyond the halls';
    $('talk-name').textContent = W.name;
    $('talk-keys').classList.add('hidden');
    const list = $('talk-quests');
    list.innerHTML = '';
    if (!k) return ($('talk-line').textContent = 'Nobody to work it yet.');
    const lvl = k.works[id] || 0, hands = workHands(k);
    const rate = lvl ? W.rate(lvl, hands) : 0;
    $('talk-line').innerHTML = talkNote ? esc(talkNote) : `${esc(W.desc)} ${keepHave(k)}`;
    const card = keepCard(lvl ? `${W.name}, level ${lvl} of ${W.max}` : `${W.name}: not yet built`, lvl ? `${Math.round(rate * 10) / 10} ${W.what} an hour` : '', `<p class="setting-desc">Worked between nights by your heroes (each one a hand, a quarter more for each step of rarity) and your settlers (half a hand each): ${hands.toFixed(1)} hands now. It pays while you are here, a minute at a time, and while you are away (up to ${KEEP.produce.capHours} hours banked).</p>`);
    if (lvl < W.max) {
      const c = W.cost(lvl + 1);
      const next = W.rate(lvl + 1, hands);
      card.appendChild(keepBtn(`${lvl ? 'Raise it' : 'Build it'} · ${keepCost(c)} → ${Math.round(next * 10) / 10} ${W.what} an hour`, () => applyNow({ type: 'keepWork', id }), { primary: true, disabled: k.faith < c.faith || k.stone < (c.stone || 0) }));
    }
    list.appendChild(card);
    const r = keepRates(k, world.hallWorks('rogue'));
    list.appendChild(keepCard('All the keep makes', 'an hour', `<p>${Math.round(r.faith * 10) / 10} Faith (the Hearth's faithful ${KEEP.produce.base}, the Market, the fields) and ${Math.round(r.stone * 10) / 10} Wishstone (the mines). ${(() => { const st = keepStage(k); const next = WORK_IDS.find((w) => WORKS[w].stage > st); return next ? `As the keep grows to ${GROWTH.names[WORKS[next].stage]}, ${WORKS[next].name} opens.` : 'Every site the keep can hold is open.'; })()} The road pays a tithe too: a little Faith for every kill, and Faith and Wishstone for every boss.</p>`));
  }
  /** (0.82.1) A building's tier card: Common to Immortal once its hall is at its last level. */
  function tierCard(id, list) {
    const k = world.player.keep;
    const t = k.btier[id] || 0;
    const ready = id === 'hearth' ? k.tier >= 3 : (k.halls[id] || 0) >= KEEP.hallMax;
    const R = RARITIES[t];
    const card = keepCard(`Tier: <span style="color:${R.color}">${R.name}</span>`, ready ? (t < BUILD_TIER.max ? `next: ${RARITIES[t + 1].name}` : 'the last') : id === 'hearth' ? 'opens at keep tier III' : 'opens at its last level', `<p class="setting-desc">${t ? esc(BUILD_TIER.perk[id](t)) + ' ' : ''}Each tier makes it far sturdier (×${BUILD_TIER.hp[t]} health now) and its work stronger.${t < BUILD_TIER.max ? ` Next: ${esc(BUILD_TIER.perk[id](t + 1))}` : ''}</p>`);
    if (ready && t < BUILD_TIER.max) {
      const c = BUILD_TIER.cost(t + 1);
      const b = keepBtn(`Raise it to ${RARITIES[t + 1].name} · ${keepCost(c)}`, () => applyNow({ type: 'keepBuildTier', id }), { primary: true, disabled: k.faith < c.faith || k.stone < c.stone || (world.tide && world.tide.state === 'on') });
      b.style.borderColor = RARITIES[t + 1].color;
      card.appendChild(b);
    }
    list.appendChild(card);
  }

  /** The Hearth: the keep's tier, its heroes, mending, its Altar (what the account has done), and the night. */
  function renderKeepHearth() {
    const p = world.player, k = p.keep;
    $('talk-role').textContent = 'The middle of everything';
    $('talk-name').textContent = 'The Hearth';
    $('talk-keys').classList.add('hidden');
    const list = $('talk-quests');
    list.innerHTML = '';
    if (!k) return ($('talk-line').textContent = 'A fire, and nobody tending it yet.');
    const rec = world.keepRecord();
    const T = KEEP.tiers[k.tier], next = KEEP.tiers[k.tier + 1];
    const on = world.tide && world.tide.state === 'on';
    $('talk-line').innerHTML = talkNote ? esc(talkNote) : `Tier ${T.numeral}: ${esc(T.name)}. ${keepHave(k)}`;
    // (0.81.1) mending first when anything is hurt: what is hurt, what it costs, where Wishstone comes from
    const hurt = [];
    for (const b of BUILD_IDS) if (k.builds[b] != null) hurt.push(`${b === 'hearth' ? 'the Hearth' : HALLS[b].name} ${k.builds[b] <= 0 ? '(wrecked)' : `${Math.round((k.builds[b] / buildMax(b, k)) * 100)}%`}`);
    const need = world.keepRepairCost();
    if (need > 0) {
      const dark = world.wrecked('hearth');
      const fix = keepCard(dark ? 'The Hearth is dark: mend it' : 'Mend the keep', `${need} Wishstone for all of it`, `<p>${dark ? 'The last night put the fire out. <b>No night can be called until the Hearth is mended.</b> ' : ''}Hurt: ${hurt.join(', ')}. A wrecked hall does no work until it is mended.</p>
        <p class="setting-desc">Each Wishstone mends ${KEEP.repairPer} health, the Hearth first. You have ${k.stone}. Wishstone comes from answering wishes on the board, from every night the keep holds, and from the Market (it trades Faith for Wishstone once it is raised).</p>`);
      if (dark) fix.classList.add('urgent');
      const all = k.stone >= need;
      fix.appendChild(keepBtn(all ? `Mend everything · ${need} Wishstone` : k.stone > 0 ? `Mend what you can · ${k.stone} of ${need} Wishstone` : 'No Wishstone yet: answer wishes on the board', () => applyNow({ type: 'keepRepair' }), { primary: true, disabled: k.stone <= 0 || on }));
      list.appendChild(fix);
    }
    // the night
    // (0.82) the Night level
    const top = Math.min(NIGHT.max, (k.nightMax || 0) + 1);
    const lvl = Math.max(1, Math.min(top, k.night || keepNight || top)); // (0.99.4) the keep's own choice first
    const night = keepCard('Call the night', `Night ${lvl} · held up to ${k.nightMax || 0}`, `<p>Waves of the Unmade (three, four from Night 10, five from 20, six from 40) come from four ways in, for the keep's buildings. Your heroes fight them; you are the keep's god, not its soldier: in a Tide your <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> are miracles, paid in Faith (${MIRACLE_IDS.map((m) => `${MIRACLES[m].name} ${MIRACLES[m].faith}`).join(', ')}), and <kbd>R</kbd> <b>Incarnates</b> you (${INCARNATE.faith} Faith, once a minute): you gather aura where you aim for up to ${INCARNATE.chan} seconds, land in a blast that mends, shields and raises the heroes near, and fight beside them for ${INCARNATE.dur} seconds, seen over your shoulder as in an action game (<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move, the mouse looks and locks on to the enemy before you, hold the left button to strike (it, or the air where you aim), <kbd>Tab</kbd> for the next target, your skills on <kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd> and your dash on <kbd>Shift</kbd>, a direction tapped twice to roll). Each Night level is stronger than the last and pays more: Faith, Wishstone, <b>Ascension Sigils</b> to raise your heroes' rarity, and <b>Hero gear</b> for the Armory, rarer the deeper you go (Immortal from Night 10). Hold one to open the next. A wrecked hall stops working until it is mended; if the Hearth goes dark, the night is lost.${k.blessings.length ? ` Blessed for it: ${k.blessings.map((b) => BLESSINGS[b].name).join(', ')}.` : ''}</p>`);
    const pick = document.createElement('div');
    pick.className = 'night-pick';
    const lvSel = document.createElement('select');
    for (let L = 1; L <= top; L++) lvSel.innerHTML += `<option value="${L}"${L === lvl ? ' selected' : ''}>Night ${L}${L > (k.nightMax || 0) ? ' (new)' : ''}</option>`;
    for (const o of lvSel.options) {
      const os = (k.stars || {})[o.value] || 0;
      if (os) o.textContent += ` ${'★'.repeat(((os & 1) ? 1 : 0) + ((os & 2) ? 1 : 0) + ((os & 4) ? 1 : 0))}`;
    }
    lvSel.addEventListener('change', () => {
      keepNight = Number(lvSel.value);
      applyNow({ type: 'keepNightPick', level: keepNight }); // (0.99.4) what holding N calls, too
      renderTalk();
    });
    const pw = NIGHT.power(lvl), R = NIGHT.reward(lvl);
    const info = document.createElement('span');
    info.className = 'setting-desc';
    info.innerHTML = `The Unmade ×${pw < 10 ? pw.toFixed(1) : Math.round(pw)} · ${KEEP.tide.perWave(k.tier) + NIGHT.extra(lvl)} a wave · held: ${Math.round((40 + 10 * k.tier) * world.keepMult() * R).toLocaleString()} Faith, ${Math.round((6 + 2 * k.tier) * R)} Wishstone, ${NIGHT.sigils(lvl)} Sigil${NIGHT.sigils(lvl) > 1 ? 's' : ''}, ${NIGHT.pieces(lvl)} piece${NIGHT.pieces(lvl) > 1 ? 's' : ''} of Hero gear`;
    pick.append(lvSel, info);
    night.appendChild(pick);
    // (0.84) what this Night brings: its omen, its stranger children, and its stars
    const oms = nightOmens(lvl); // (0.92) two on a deep Night
    const W = NIGHT.waves(lvl);
    const kinds = new Set();
    for (let w = 1; w <= W; w++) for (const f of Object.keys(tideSpecials(lvl, w, W))) kinds.add(f);
    const nst = (k.stars || {})[lvl] || 0;
    const star = (bit, what) => `<span class="night-star${nst & bit ? ' got' : ''}">${nst & bit ? '★' : '☆'} ${what}</span>`;
    const brief = document.createElement('div');
    brief.className = 'night-brief';
    // (0.86) raids
    const raidRow = document.createElement('div');
    raidRow.className = 'keep-troop';
    raidRow.innerHTML = `<span><b>Raids</b>: ${k.nightMax ? `smaller than a night (Night ${raidLevel(k)}, one wave), they come every ${RAID.every[0] / 60}–${RAID.every[1] / 60} minutes while you are here, and every ${RAID.awayEvery} hours you are away your heroes meet one alone. Each held pays about a third of a night, and sometimes Hero gear.` : 'once you have held a night, the Unmade will raid the keep now and then.'}${k.raids ? ` Held so far: ${k.raids}.` : ''}</span>`;
    raidRow.appendChild(keepBtn(k.raidsOn !== false ? 'Raids on' : 'Raids off', () => applyNow({ type: 'keepRaids', on: k.raidsOn === false }), { primary: k.raidsOn !== false, title: k.raidsOn !== false ? 'Turn raids off (in the keep and while away)' : 'Turn raids on' }));
    night.appendChild(raidRow);
    const deepNote = lvl > NIGHT.deep ? `<p><b>A deep Night.</b> Past Night ${NIGHT.deep} the Unmade grow slowly but bring new kinds, two omens and (from 40) a sixth wave. Each Night held past ${NIGHT.deep} teaches the Lodge and the Bastion more: a level of training per three, a point of arming per four. Immortal gear won here is <b>Starforged</b>: a fifth stronger, with a fourth line.</p>` : '';
    brief.innerHTML = `${deepNote}${oms.map((om) => `<p><b class="omen">Omen: ${OMENS[om].name}</b> (+${Math.round(OMENS[om].pay * 100)}% pay). ${OMENS[om].desc}</p>`).join('')}${kinds.size ? `<p>${[...kinds].map((f) => `<b>${FOES[f].name}</b>: ${FOES[f].desc}`).join('<br>')}</p>` : ''}<p>${star(1, 'Hold the keep')} ${star(2, 'No hall wrecked')} ${star(4, 'No hero falls')}<br><small>Each star won for the first time pays ${NIGHT.starSigils(lvl)} Sigils; all three in one night, an extra piece of Hero gear.</small></p>`;
    night.appendChild(brief);
    night.appendChild(keepBtn(on ? 'The Tide is coming' : world.wrecked('hearth') ? 'Mend the Hearth first' : `Call Night ${lvl} (${k.troops.length} hero${k.troops.length === 1 ? '' : 'es'})`, () => {
      applyNow({ type: 'keepTide', level: lvl });
      setMode('play');
    }, { primary: true, disabled: on || world.wrecked('hearth') }));
    list.appendChild(night);
    // the heroes
    const cap = KEEP.heroCap[k.tier];
    const heroes = keepCard('Your heroes', `${k.troops.length} of ${cap} at tier ${T.numeral}`, `<p class="setting-desc">Few, and good. Arm them at the Bastion, train and teach them at the Lodge and the Observatory. A hero of a class comes from that class's hall, once it is open.</p>`);
    for (const t of k.troops) {
      const row = document.createElement('div');
      row.className = 'keep-troop';
      row.innerHTML = `<span>${troopLine(t)}</span>`;
      const to = (t.rar || 0) + 1;
      if (to <= HERO_RAR_MAX) {
        const c = HERO_RARITY.ascend(to);
        const can = k.faith >= c.faith && (k.sigils || 0) >= c.sigils;
        const b = keepBtn(`Ascend to ${HERO_RARITY.names[to]} · ${c.faith.toLocaleString()} Faith, ${c.sigils} Sigils`, () => applyNow({ type: 'keepAscend', id: t.id }), { primary: can, disabled: on || !can, title: `Health and damage ×${(HERO_RARITY.mult[to] / HERO_RARITY.mult[to - 1]).toFixed(2)}${HERO_RARITY.perk[to] ? '. ' + HERO_RARITY.perk[to] : ''}` });
        b.style.borderColor = RARITIES[to].color;
        row.appendChild(b);
      }
      row.appendChild(keepBtn('Send home', () => applyNow({ type: 'keepDismiss', id: t.id }), { disabled: on, title: 'They leave the keep (what was spent on them is not returned; their Hero gear goes back to the Armory)' }));
      heroes.appendChild(row);
    }
    if (k.troops.length < cap) {
      const cost = KEEP.recruit(k.troops.length);
      const row = document.createElement('div');
      row.className = 'keep-troop';
      row.innerHTML = `<span>A new hero: ${keepCost(cost)}</span>`;
      for (const cls of HALL_IDS) {
        const open = rec.halls.includes(cls);
        row.appendChild(keepBtn(CLASSES[cls].name, () => applyNow({ type: 'keepRecruit', cls }), { disabled: !open || on || k.faith < cost.faith, title: open ? `A ${CLASSES[cls].name.toLowerCase()} from ${HALLS[cls].name}` : `${HALLS[cls].name} is shut: master the ${CLASSES[cls].name} first` }));
      }
      heroes.appendChild(row);
    }
    if (k.troops.length) {
      const arm = keepBtn(`Open the Armory (${(k.armory || []).length} piece${(k.armory || []).length === 1 ? '' : 's'} of Hero gear)`, () => openArmory(), { primary: true, title: 'Hero gear: put it on your heroes, three pieces each' });
      heroes.appendChild(arm);
    }
    list.appendChild(heroes);
    // the tier
    if (next) {
      const tier = keepCard(`Raise the keep: tier ${next.numeral}`, esc(next.name), `<p>A bigger board (${next.board} wishes), more people come to live here, and room for ${KEEP.heroCap[k.tier + 1]} heroes.${k.tier + 1 >= 3 ? ' And a weapon glow of your own: Kept.' : ''} The nights grow stronger with it.</p><div class="rewards">Costs ${keepCost(next.cost)}</div>`);
      tier.appendChild(keepBtn(`Raise it · ${keepCost(next.cost)}`, () => applyNow({ type: 'keepTier' }), { primary: true, disabled: k.faith < next.cost.faith || k.stone < next.cost.stone }));
      list.appendChild(tier);
    }
    // (0.82.1) the Hearth's own tier, and how far the keep has grown
    tierCard('hearth', list);
    const st = keepStage(k), nextAt = GROWTH.at[st + 1];
    list.appendChild(keepCard(`The keep: ${esc(GROWTH.names[st])}`, `stage ${st + 1} of ${GROWTH.at.length}`, `<p class="setting-desc">The keep grows with what you spend on it (Faith, and Wishstone counted ten times): a wider ground, more cottages, more people. ${nextAt ? `${(k.spent || 0).toLocaleString()} of ${nextAt.toLocaleString()} spent toward ${esc(GROWTH.names[st + 1])}.` : 'It has grown as far as it can.'} The works out past the halls make Faith and Wishstone for you, and each stage opens another: ${WORK_IDS.map((w) => `<span${WORKS[w].stage > st ? ' style="opacity:0.55"' : ''}>${esc(WORKS[w].name)}${WORKS[w].stage > st ? ` (${esc(GROWTH.names[WORKS[w].stage])})` : (k.works[w] ? ` (level ${k.works[w]})` : ' (to build)')}</span>`).join(', ')}.</p>`));
    // the Altar: what the account has done
    const relic = (sl) => `<span class="relic${rec.relics.includes(sl) ? ' lit' : ''}" title="${rec.relics.includes(sl) ? `An Eternal ${SLOT_NAMES[sl].toLowerCase()}: ${RELIC_NAMES[sl]}` : `No Eternal ${SLOT_NAMES[sl].toLowerCase()} yet`}">${esc(RELIC_NAMES[sl].replace(/^the /, ''))}</span>`;
    const alt = keepCard('The Altar', 'what you have done, on every class', `<div class="relics">${SLOTS.map(relic).join('')}</div>
      <p class="setting-desc">${rec.relics.length} of 5 Eternal relics (each +${Math.round(KEEP.faithPerRelic * 100)}% Faith) · ${rec.halls.length} of 4 classes mastered (each opens its hall, and its heroes) · ${rec.echoes.length} of 4 Granted beaten (each sends an echo to stand behind your heroes: +10% damage in a Tide) · ${rec.wish.toLocaleString()} Wishborne levels.</p>
      <p class="setting-desc">Faith from each answered wish: ×${world.keepMult().toFixed(2)}. ${k.answered} wish${k.answered === 1 ? '' : 'es'} answered, ${k.tides} Tide${k.tides === 1 ? '' : 's'} held. The keep makes ${Math.round(keepRates(k, world.hallWorks('rogue')).faith)} Faith and ${Math.round(keepRates(k, world.hallWorks('rogue')).stone * 10) / 10} Wishstone an hour, here and away.</p>`);
    list.appendChild(alt);
  }

  /** A class's hall: shut until that class is mastered; raised with Faith and Wishstone; then its work. */
  function renderKeepHall(cls) {
    const k = world.player.keep, H = HALLS[cls];
    if (!H) return;
    $('talk-role').textContent = `${H.what}`;
    $('talk-name').textContent = H.name;
    $('talk-keys').classList.add('hidden');
    const list = $('talk-quests');
    list.innerHTML = '';
    const open = world.keepRecord().halls.includes(cls);
    const lvl = (k && k.halls[cls]) || 0;
    const note = hallNote(cls);
    $('talk-line').innerHTML = talkNote ? esc(talkNote) : `${esc(H.per)} ${open ? `Level ${lvl} of ${KEEP.hallMax}.` : ''} ${note ? `<b>${esc(note)}</b>` : ''} ${k ? keepHave(k) : ''}`;
    if (!open || !k) return;
    if (lvl < KEEP.hallMax) {
      const c = KEEP.hallCost(lvl + 1);
      const up = keepCard(`Raise ${esc(H.name)} to level ${lvl + 1}`, '', `<div class="rewards">Costs ${keepCost(c)}</div>`);
      up.appendChild(keepBtn(`Raise it · ${keepCost(c)}`, () => applyNow({ type: 'keepHall', cls }), { primary: true, disabled: k.faith < c.faith || k.stone < c.stone }));
      list.appendChild(up);
    }
    if (lvl >= KEEP.hallMax) tierCard(cls, list); // (0.82.1)
    if (!world.hallWorks(cls)) return;
    const on = world.tide && world.tide.state === 'on';
    if (cls === 'warrior' && k.troops.length) list.appendChild(keepBtn(`Open the Armory: Hero gear (${(k.armory || []).length})`, () => openArmory(), { primary: true })); // (0.82)
    if (cls === 'warrior') {
      const max = KEEP.armMax(lvl, k.btier.warrior || 0, k.nightMax); // (0.92: deep Nights held raise it)
      const card = keepCard('Arm your heroes', `arms up to ${max}`, `<p class="setting-desc">Each point of arms (the Bastion's, apart from Hero gear): +${Math.round(KEEP.perGear * 100)}% health and damage. Every building in the keep is ${Math.round(KEEP.perBastionHp * lvl * 100)}% sturdier for the Bastion.</p>`);
      for (const t of k.troops) {
        const row = document.createElement('div');
        row.className = 'keep-troop';
        row.innerHTML = `<span>${troopLine(t)}</span>`;
        const c = KEEP.arm(t.gear);
        row.appendChild(keepBtn(t.gear >= max ? 'Fully armed' : `Arm · ${keepCost(c)}`, () => applyNow({ type: 'keepArm', id: t.id }), { primary: true, disabled: t.gear >= max || k.faith < c.faith || k.stone < c.stone }));
        card.appendChild(row);
      }
      if (!k.troops.length) card.innerHTML += '<p>No heroes yet: raise one at the Hearth.</p>';
      list.appendChild(card);
    }
    if (cls === 'archer' || cls === 'mage') {
      const school = cls === 'archer' ? 'phys' : 'magic';
      if (cls === 'archer') {
        const max = KEEP.trainMax(lvl, k.btier.archer || 0, k.nightMax); // (0.92: deep Nights held raise it)
        const card = keepCard('Train your heroes', `levels up to ${max}`, `<p class="setting-desc">Each level: +${Math.round(KEEP.perLvl * 100)}% health and damage.</p>`);
        for (const t of k.troops) {
          const row = document.createElement('div');
          row.className = 'keep-troop';
          row.innerHTML = `<span>${troopLine(t)}</span>`;
          const c = KEEP.train(t.lvl);
          row.appendChild(keepBtn(t.lvl >= max ? 'As far as the Lodge can take them' : `Train · ${keepCost(c)}`, () => applyNow({ type: 'keepTrain', id: t.id }), { primary: true, disabled: t.lvl >= max || k.faith < c.faith }));
          card.appendChild(row);
        }
        if (!k.troops.length) card.innerHTML += '<p>No heroes yet: raise one at the Hearth.</p>';
        list.appendChild(card);
      }
      const skills = SKILL_IDS.filter((sk) => SKILLS[sk].school === school);
      // (0.83) four skills to a hero: two physical (taught at the Lodge), two magic (the Observatory)
      const slots = [0, 1, 2, 3].filter((i) => skillSlotSchool(i) === school);
      const card = keepCard(school === 'phys' ? 'Physical skills' : 'Magic', `rank ${lvl} of 3 taught here`, `<p class="setting-desc">${skills.map((sk) => `<b>${SKILLS[sk].name}</b> (rank ${SKILLS[sk].rank}${SKILLS[sk].support ? ', a healer\'s' : ''}): ${esc(SKILLS[sk].desc)}`).join('<br>')}<br>Each hero knows two ${school === 'phys' ? 'physical skills' : 'magic skills'} (the second from level ${SKILL_SLOT2}); teaching one into a slot replaces what was there (${keepCost(KEEP.learn)}).${school === 'magic' ? ' A hero who knows Mend, Barrier or Radiance fights as a healer: they stay by whoever is hurt worst, and their own strikes mend.' : ''}</p>`);
      for (const t of k.troops) {
        const row = document.createElement('div');
        row.className = 'keep-troop';
        row.innerHTML = `<span>${troopLine(t)}</span>`;
        const pick = document.createElement('div');
        pick.className = 'keep-skills';
        row.appendChild(pick);
        for (const i of slots) {
          const sel = document.createElement('select');
          sel.className = 'keep-skill';
          const open = skillSlotOpen(t, i);
          const cur = (t.skills || [])[i];
          sel.innerHTML = `<option value="">${open ? (cur ? '' : 'Teach a skill…') : `Opens at level ${SKILL_SLOT2}`}</option>` + skills.map((sk) => `<option value="${sk}"${sk === cur ? ' selected' : ''}${lvl < SKILLS[sk].rank || (sk !== cur && (t.skills || []).includes(sk)) ? ' disabled' : ''}>${esc(SKILLS[sk].name)}${lvl < SKILLS[sk].rank ? ` (needs ${H.name} ${SKILLS[sk].rank})` : ''}</option>`).join('');
          sel.disabled = !open || k.faith < KEEP.learn.faith;
          sel.title = cur ? SKILLS[cur].desc : open ? `Teach a skill here (${KEEP.learn.faith} Faith)` : `A second ${school === 'phys' ? 'physical' : 'magic'} skill from level ${SKILL_SLOT2}`;
          sel.onchange = () => {
            if (sel.value && sel.value !== cur) applyNow({ type: 'keepLearn', id: t.id, skill: sel.value, slot: i });
          };
          pick.appendChild(sel);
        }
        card.appendChild(row);
      }
      list.appendChild(card);
      if (cls === 'mage') {
        const bl = keepCard('Bless the next night', 'for one Tide', '<p class="setting-desc">Tick <b>Auto</b> and that blessing is bought by itself each time you call a Night, while you have the Faith.</p>');
        for (const id of BLESSING_IDS) {
          const B = BLESSINGS[id];
          const row = document.createElement('div');
          row.className = 'keep-troop';
          row.innerHTML = `<span><b>${B.name}</b> (rank ${B.rank}): ${esc(B.desc)}</span>`;
          row.appendChild(keepBtn(k.blessings.includes(id) ? 'Blessed' : `${B.faith} Faith`, () => applyNow({ type: 'keepBless', id }), { primary: true, disabled: k.blessings.includes(id) || lvl < B.rank || k.faith < B.faith || on }));
          // (0.99.4) or bought by itself before every Night
          const auto = document.createElement('label');
          auto.className = 'bless-auto';
          auto.title = lvl < B.rank ? `Opens at rank ${B.rank}` : `Buy ${B.name} by itself each time you call a Night (if you have the Faith)`;
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = (k.autoBless || []).includes(id);
          cb.disabled = lvl < B.rank;
          cb.addEventListener('change', () => applyNow({ type: 'keepAutoBless', id, on: cb.checked }));
          auto.append(cb, document.createTextNode(' Auto'));
          row.appendChild(auto);
          bl.appendChild(row);
        }
        list.appendChild(bl);
      }
    }
    if (cls === 'rogue') {
      const T = KEEP.trade;
      const card = keepCard('Trade', '', `<p class="setting-desc">Faith comes in while you are away: ${KEEP.produce.base + KEEP.produce.perMarket * lvl} an hour with the Market at level ${lvl} (up to ${KEEP.produce.capHours} hours banked).</p>`);
      // (0.96) in bulk: an amount of your own, a few steps, or everything (asked first)
      const sellLots = Math.floor(k.stone / 10), buyLots = Math.floor(k.faith / T.faithPer);
      const row = (label, unit, have, lotSize, dir, rate) => {
        const r = document.createElement('div');
        r.className = 'keep-trade';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.min = String(lotSize);
        inp.step = String(lotSize);
        inp.value = String(Math.min(have, lotSize * 100) || lotSize);
        inp.title = `${unit} to trade (in steps of ${lotSize})`;
        const out = document.createElement('span');
        out.className = 'setting-desc';
        const lotsOf = () => Math.max(0, Math.floor((Number(inp.value) || 0) / lotSize));
        const say = () => (out.textContent = `= ${rate(lotsOf()).toLocaleString()}`);
        inp.addEventListener('input', say);
        say();
        r.append(document.createTextNode(label), inp, out);
        r.appendChild(keepBtn('Trade', () => applyNow({ type: 'keepTrade', dir, n: lotsOf() }), { primary: true, disabled: have < lotSize }));
        for (const m of [10, 100]) if (have >= lotSize * m) r.appendChild(keepBtn(`${(lotSize * m).toLocaleString()}`, () => applyNow({ type: 'keepTrade', dir, n: m }), { quick: true }));
        const all = Math.floor(have / lotSize);
        r.appendChild(keepBtn('All', () => confirmModal({
          title: dir === 'sell' ? 'Sell all your Wishstone?' : 'Spend all your Faith on Wishstone?',
          html: `<p>${dir === 'sell' ? `Sell <b>${(all * 10).toLocaleString()} Wishstone</b> for <b>${rate(all).toLocaleString()} Faith</b>?` : `Spend <b>${(all * T.faithPer).toLocaleString()} Faith</b> for <b>${rate(all).toLocaleString()} Wishstone</b>?`}</p><p class="setting-desc">There is no undoing a trade (only trading back, at the Market's rate).</p>`,
          ok: dir === 'sell' ? 'Sell it all' : 'Spend it all',
          onOk: () => applyNow({ type: 'keepTrade', dir, n: all }),
        }), { disabled: all < 1, title: 'Everything, after you confirm' }));
        card.appendChild(r);
      };
      row('Sell Wishstone ', 'Wishstone', k.stone, 10, 'sell', (lots) => lots * T.stoneFor(lvl));
      card.insertAdjacentHTML('beforeend', `<p class="setting-desc">10 Wishstone sells for ${T.stoneFor(lvl)} Faith; ${T.faithPer} Faith buys ${T.stoneOut(lvl)} Wishstone.${sellLots || buyLots ? '' : ''}</p>`);
      row('Buy Wishstone with Faith ', 'Faith', k.faith, T.faithPer, 'buy', (lots) => lots * T.stoneOut(lvl));
      list.appendChild(card);
    }
  }

  /** A settler: who they are, how close you are, and the story Ysolde tells. */
  function renderSettler(id) {
    const S = SETTLERS[id], k = world.player.keep;
    const s = k && k.settlers[id];
    $('talk-role').textContent = `${S.role} · level ${settlerLevel(s)} of ${KEEP.settlerMax}`;
    $('talk-name').textContent = S.name;
    $('talk-keys').classList.add('hidden');
    $('talk-line').textContent = talkNote || S.greet;
    const list = $('talk-quests');
    list.innerHTML = '';
    if (!k) return;
    const mine = k.wishes.filter((w) => w.who === id);
    for (const w of mine) {
      const el = document.createElement('div');
      el.className = 'quest' + (w.done ? ' ready' : '');
      el.innerHTML = `<h4>${w.done ? 'Answered: tell the board' : 'Their wish'}</h4><p>"${esc(wishText(w))}"</p><div class="goal">${esc(wishGoal(w))}</div>`;
      list.appendChild(el);
    }
    if (id === 'ysolde' && k.told.length) {
      // the chapters heard so far, to hear again
      const el = document.createElement('div');
      el.className = 'quest';
      el.innerHTML = `<h4>The story so far<small>${k.told.length} of ${CHAPTERS.length} chapters</small></h4>`;
      for (const ch of CHAPTERS.filter((c) => k.told.includes(c.id))) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost';
        b.textContent = ch.name;
        b.addEventListener('click', () => showChapter(ch.id));
        el.appendChild(b);
      }
      list.appendChild(el);
    }
  }

  /** A chapter of the keep's story, read in the talk panel. */
  function showChapter(chId) {
    if (!CHAPTERS.some((c) => c.id === chId)) return;
    talkTo = 'chapter:' + chId;
    talkNote = '';
    setMode('talk');
  }
  function renderChapter(chId) {
    const ch = CHAPTERS.find((c) => c.id === chId);
    if (!ch) return;
    $('talk-keys').classList.add('hidden');
    $('talk-role').textContent = `The story, as the keep tells it · ${CHAPTERS.indexOf(ch) + 1} of ${CHAPTERS.length}`;
    $('talk-name').textContent = ch.name;
    $('talk-line').textContent = 'Old Ysolde settles by the fire. The children are already listening.';
    const list = $('talk-quests');
    list.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'quest keep-chapter';
    el.innerHTML = ch.text.map((t) => `<p>${esc(t)}</p>`).join('');
    list.appendChild(el);
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

  /**
   * (0.59) The Echo Ring's stones in Haven. On the server world: choose what you are here for and a
   * checkpoint, and wake it (a run of your own, on the server). In the browser: up to the camp.
   */
  function renderRingStones() {
    const p = world.player;
    $('talk-role').textContent = 'On the west side of Haven';
    $('talk-name').textContent = 'The Echo Ring';
    $('talk-keys').classList.add('hidden');
    const list = $('talk-quests');
    list.innerHTML = '';
    $('talk-line').textContent = talkNote || 'Seven stones set with star-glass. Press a shard into them and they call up what the mountain remembers, wave after wave. Every wave pays out in what you came for the moment it falls, more the deeper you go, and from wave 20 the echoes come faster. Start further in and you are offered the augments the waves before would have given. After every boss, go home or push on.';
    if (!net) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'primary';
      b.textContent = 'Go up to the Ring (its camp)';
      b.addEventListener('click', () => {
        persist();
        enterTown();
      });
      list.appendChild(b);
      return;
    }
    if (!net.server) {
      const el = document.createElement('p');
      el.className = 'setting-desc';
      el.textContent = 'The Ring is woken alone, or on the server world. Leave the room to go up.';
      list.appendChild(el);
      return;
    }
    const f = ringFocus();
    const box = document.createElement('div');
    box.className = 'quest ring-pick';
    const row = (label, items, on, wrap = false) => {
      const h = document.createElement('div');
      h.className = 'gate-focus-h';
      h.textContent = label;
      const seg = document.createElement('div');
      seg.className = wrap ? 'segmented wrap' : 'segmented'; // (0.81.7) many checkpoints: rows of them, all in reach
      for (const [id, text, pressed] of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        b.addEventListener('click', () => on(id));
        seg.appendChild(b);
      }
      box.append(h, seg);
    };
    row('What you are here for', Object.keys(RING_FOCUS).map((id) => [id, RING_FOCUS[id].name, f.kind === id]), (id) => {
      settings.ringFocus = { kind: id, slot: f.slot || 'weapon' };
      storeSettings(settings);
      renderTalk();
    });
    if (f.kind === 'gear') row('Which slot', SLOTS.map((sl) => [sl, SLOT_NAMES[sl], (f.slot || 'weapon') === sl]), (sl) => {
      settings.ringFocus = { kind: 'gear', slot: sl };
      storeSettings(settings);
      renderTalk();
    });
    const max = Math.max(1, world.maxCheckpoint || 1); // (0.61.1) from the server's snapshots (a save could be another class's, or stale)
    if (!ringStart || ringStart > max) ringStart = max;
    const waves = [];
    for (let wv = 1; wv <= max; wv += CONFIG.BOSS_EVERY) waves.push([wv, `Wave ${wv}`, wv === ringStart]);
    row('Start from', waves, (wv) => {
      ringStart = wv;
      renderTalk();
    }, waves.length > 6);
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'primary';
    const cost = ringCost(ringStart); // (0.61.1)
    go.textContent = p.tickets >= cost ? `Wake it at wave ${ringStart} · ${cost} shards (you have ${p.tickets})` : `Not enough starglass shards (${cost} needed, you have ${p.tickets})`;
    go.disabled = p.tickets < cost;
    go.addEventListener('click', () => {
      setMode('play');
      applyNow({ type: 'enterRing', startWave: ringStart, focus: ringFocus() });
    });
    box.appendChild(go);
    const info = document.createElement('details'); // (0.61.1) what the Ring pays
    info.className = 'ring-info';
    info.open = !!ringInfoOpen;
    info.addEventListener('toggle', () => (ringInfoOpen = info.open));
    info.innerHTML = `<summary>What the Stones Remember</summary>${ringInfoHtml(p.level, ringStart, f)}`;
    box.appendChild(info);
    list.appendChild(box);
  }
  let ringStart = 0;
  let keepNight = 0; // (0.82) the Night level picked at the Hearth (0.99.4: kept in the keep, k.night, so holding N calls the same)
  /**
   * (0.85) Over the shoulder while you are incarnate in your own keep's night: the view, the crosshair, the
   * keys, and the channel's bar before it. The mouse is let go when it ends.
   */
  let shoulderUi = null;
  let shoulderTipT = 0;
  let rankSfxAt = 0; // (0.91.1)
  let shoulderPos = false; // (0.92)
  let shoulderWas = false; // (0.94)
  let shoulderSince = 0, helpHeld = false, helpPos = false; // (0.99) hold H for the controls, over the shoulder
  addEventListener('keydown', (e) => { if ((e.key === 'h' || e.key === 'H') && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) helpHeld = true; });
  addEventListener('keyup', (e) => { if (e.key === 'h' || e.key === 'H') helpHeld = false; });
  addEventListener('blur', () => (helpHeld = false));
  const DIR_SVG = '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9"/><path d="M10 3.2l4.6 7.2h-3v6.2h-3.2v-6.2h-3z"/></svg>';
  // ---------------------------------------------------------------------------------------------------------
  // (0.99) Voices: the people of Haven and the keep greet you, chat as you pass, and call out in the night.
  // ---------------------------------------------------------------------------------------------------------
  const npcSpot = (id) => {
    const ob = world && world.map && world.map.obstacles && world.map.obstacles.find((o) => o.kind === 'npc' && o.id === id);
    if (!ob) return null;
    const look = (NPCS[id] && NPCS[id].look) || {};
    return { x: ob.x, y: 2.45 * (look.scale || 1) + 0.2, z: ob.z };
  };
  const speakerName = (who) => (NPCS[who] && NPCS[who].name) || who;
  /** Someone says a line of theirs: out loud, with a bubble over them (or, out of sight, in the feed). */
  function speak(who, moment, pri = 0, at = null, name = null) {
    if (!voice.has(who, moment)) return null;
    if (!who.startsWith('hero_') && world && world.tide && world.tide.state === 'on' && world.map && world.map.id === 'wishkeep') return null; // (0.99.4) the keep's people are indoors in the night
    const line = voice.say(who, moment, pri);
    if (!line) return null;
    const spot = at || npcSpot(who);
    if (spot) hud.say(renderer, spot, name || speakerName(who), line.t, line.d);
    else hud.feedText(`${name || speakerName(who)}: "${line.t}"`);
    return line;
  }
  /** One of the keep's own (a settler living there), at random. */
  const settlerHere = () => {
    const ids = ((world.map && world.map.obstacles) || []).filter((o) => o.kind === 'npc' && SETTLERS[o.id]).map((o) => o.id);
    return ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
  };
  /** One of the keep's heroes standing in the night, and their voice. */
  const heroHere = () => {
    const live = (world.troops || []).filter((t) => !t.dead);
    if (!live.length) return null;
    const t = live[Math.floor(Math.random() * live.length)];
    return { t, who: troopGender(t) === 'f' ? 'hero_f' : 'hero_m' };
  };
  function heroSays(moment, pri = 1, pick = null) {
    const h = pick || heroHere();
    if (!h) return null;
    const id = h.t.id;
    return speak(h.who, moment, pri, () => { const tr = (world.troops || []).find((o) => o.id === id); return tr && !tr.dead ? { x: tr.x, y: 2.7, z: tr.z } : null; }, h.t.name);
  }
  const later = (ms, fn) => setTimeout(fn, ms);
  let hearthSaidAt = 0, fellSaidAt = 0;
  const hurtSaid = new Set();
  function voiceEvent(ev) {
    if (ev.ally || !world) return;
    const inKeep = world.map && world.map.id === KEEP.map;
    switch (ev.type) {
      case 'quest':
        if (ev.what === 'claimed' && talkTo && voice.has(talkTo, 'questDone')) { const who = talkTo; later(500, () => speak(who, 'questDone', 2)); }
        break;
      case 'tideStart':
        hurtSaid.clear();
        hud.clearBubbles(); // (0.99.4) the keep's people go indoors, and what they were saying with them
        break;
      case 'tideWave': {
        const s = settlerHere();
        if (s) speak(s, 'night', 1);
        later(2600, () => heroSays('wave'));
        break;
      }
      case 'tideBoss':
        later(1200, () => heroSays('boss', 2));
        break;
      case 'troopFall':
        if (performance.now() - fellSaidAt > 8000) {
          fellSaidAt = performance.now();
          const s = settlerHere();
          if (s) speak(s, 'heroDown', 1);
        }
        break;
      case 'buildHit':
        if (ev.id === 'hearth' && performance.now() - hearthSaidAt > 25000) {
          hearthSaidAt = performance.now();
          const s = settlerHere();
          if (s) speak(s, 'hearthHit', 1);
        }
        break;
      case 'tideBossDown': {
        const s = settlerHere();
        if (s) speak(s, 'bossDown', 2);
        break;
      }
      case 'tideEnd': {
        const s = settlerHere();
        const l = s ? speak(s, ev.won ? 'nightHeld' : 'nightLost', 2) : null;
        if (ev.won) later(((l ? l.d : 0) + 0.6) * 1000, () => heroSays('cheer', 2));
        break;
      }
      case 'statueRaised':
      case 'statueTier':
      case 'trialEnd':
        if (inKeep && (ev.type !== 'trialEnd' || ev.won)) later(1800, () => { const s = settlerHere(); if (s) speak(s, 'seraph', 2); });
        break;
    }
  }
  let voiceCheckAt = 0;
  function voiceFrame(now) {
    if (now < voiceCheckAt || !world || world.mode !== 'explore' || mode !== 'play') return;
    voiceCheckAt = now + 500;
    const p = world.player, t = world.tide;
    if (t && t.state === 'on') {
      // a hero badly hurt calls for help, once a night each
      for (const tr of world.troops || []) {
        if (tr.dead || hurtSaid.has(tr.id) || tr.hp > tr.maxHp * 0.3) continue;
        hurtSaid.add(tr.id);
        heroSays('hurt', 1, { t: tr, who: troopGender(tr) === 'f' ? 'hero_f' : 'hero_m' });
        break;
      }
      return;
    }
    // walking past someone: now and then they say something
    let best = null, bd = 3.8;
    for (const o of (world.map && world.map.obstacles) || []) {
      if (o.kind !== 'npc' || !voice.has(o.id, 'near')) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) [best, bd] = [o, d];
    }
    if (best && voice.mayChat(best.id, 45000)) speak(best.id, 'near', 0);
  }

  /**
   * (0.98) Over the shoulder: a compass along the top (north is up on the map) with your heroes, the night's
   * king and the Hearth on it, and a list of your heroes down the side: their health, how far, and which way.
   */
  const COMPASS_SPAN = Math.PI * 0.62; // half the strip, either side of straight ahead
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let compassBuilt = false;
  function compassFrame() {
    const strip = shoulderUi.querySelector('.sh-cstrip'), marks = shoulderUi.querySelector('.sh-cmark'), list = shoulderUi.querySelector('.sh-heroes');
    const W = 560, yaw = renderer.shoulder.yaw || 0;
    const xOf = (bearing) => { const rel = wrapA(bearing - yaw); return Math.abs(rel) > COMPASS_SPAN ? null : W / 2 + (rel / COMPASS_SPAN) * (W / 2); };
    if (!compassBuilt) {
      compassBuilt = true;
      let h = '';
      for (let d = 0; d < 360; d += 15) {
        const name = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[d];
        h += `<i data-d="${d}" class="${name ? (name.length === 1 ? 'card' : 'mid') : 'tick'}">${name || ''}</i>`;
      }
      strip.innerHTML = h;
    }
    // north is -z (up on the map), east +x: a heading d degrees clockwise from north is the world angle d - 90
    for (const el of strip.children) {
      const x = xOf(((+el.dataset.d - 90) * Math.PI) / 180);
      el.style.display = x == null ? 'none' : '';
      if (x != null) el.style.transform = `translateX(${Math.round(x)}px)`;
    }
    const p0 = world.player, hg = renderer.hero && renderer.hero.group, p = hg ? { x: hg.position.x, z: hg.position.z } : p0; // (0.99.1) from you as drawn
    const heroes = [];
    const drawn = (pid, o) => { const v = renderer.allyViews && renderer.allyViews.get(pid), g = v && v.model && v.model.group; return g ? { x: g.position.x, z: g.position.z } : o; }; // (0.99.1) where they are seen, as their name plates are
    for (const tr of world.troops || []) heroes.push({ id: 'troop:' + tr.id, name: tr.name, ...drawn('troop:' + tr.id, { x: tr.x, z: tr.z }), hp: tr.hp, max: tr.maxHp, dead: !!tr.dead, color: tr.rar ? RARITIES[tr.rar].color : '#e8f4ff' });
    if (world.allies) for (const a of world.allies()) heroes.push({ id: 'ally:' + a.pid, name: a.name, ...drawn(a.pid, { x: a.x, z: a.z }), hp: a.hp, max: a.maxHp, dead: a.dead, color: '#7fd0ff' });
    const pins = [];
    for (const h of heroes) {
      const f = Math.max(0, Math.min(1, h.hp / Math.max(1, h.max)));
      pins.push({ x: xOf(Math.atan2(h.z - p.z, h.x - p.x)), cls: `hero${h.dead ? ' down' : f < 0.35 ? ' low' : ''}`, tip: h.name, edge: true, bearing: Math.atan2(h.z - p.z, h.x - p.x) });
    }
    const boss = world.enemies.find((e) => !e.dead && ((e.def && e.def.boss) || e.type === 'tidecaller'));
    if (boss) pins.push({ x: xOf(Math.atan2(boss.z - p.z, boss.x - p.x)), cls: 'boss', tip: boss.def.name, edge: true, bearing: Math.atan2(boss.z - p.z, boss.x - p.x) });
    const hearth = (world.keepBuilds || []).find((b) => b.id === 'hearth');
    if (hearth) pins.push({ x: xOf(Math.atan2(hearth.z - p.z, hearth.x - p.x)), cls: 'hearth', tip: 'The Hearth' });
    let mh = '';
    for (const pin of pins) {
      let x = pin.x, edge = '';
      if (x == null) {
        if (!pin.edge) continue;
        const rel = wrapA(pin.bearing - yaw);
        x = rel > 0 ? W - 6 : 6; // off the strip: at its edge, pointing the way
        edge = rel > 0 ? ' right' : ' left';
      }
      mh += `<b class="${pin.cls}${edge}" style="transform:translateX(${Math.round(x)}px)"></b>`;
    }
    marks.innerHTML = mh;
    // the heroes, down the side
    list.classList.toggle('hidden', !heroes.length);
    if (heroes.length) {
      let lh = '<h5>Your heroes</h5>';
      for (const h of heroes) {
        const f = Math.max(0, Math.min(1, h.hp / Math.max(1, h.max)));
        const d = Math.hypot(h.x - p.x, h.z - p.z);
        const rel = wrapA(Math.atan2(h.z - p.z, h.x - p.x) - yaw); // 0: ahead, +: to the right
        lh += `<div class="shh${h.dead ? ' down' : f < 0.35 ? ' low' : ''}"><span class="shh-dir" title="${rel > 2.4 || rel < -2.4 ? 'behind you' : Math.abs(rel) < 0.7 ? 'ahead' : rel > 0 ? 'to your right' : 'to your left'}" style="transform:rotate(${Math.round((rel * 180) / Math.PI)}deg)">${DIR_SVG}</span><span class="shh-name" style="color:${h.color}">${esc(h.name)}</span><span class="shh-d">${h.dead ? 'down' : `${Math.round(d)} m`}</span><i><u style="width:${Math.round(f * 100)}%"></u></i></div>`;
      }
      list.innerHTML = lh;
    }
  }
  function shoulderFrame() {
    const t = world && world.tide;
    const mine = !!(t && t.state === 'on' && !world.keepVisit);
    const inKeep = !!(world && world.map && world.map.id === 'wishkeep');
    const walk = inKeep && !!(world.player && world.player.keepWalk) && !(t && t.state === 'on'); // (0.91) walking the keep (V)
    const pos = inKeep && !world.keepVisit && !!(world.player && world.player.possess); // (0.92) in the Seraph
    const on = ((mine && t.inc > 0) || walk || pos) && mode === 'play';
    if (pos !== shoulderPos) {
      // (0.92) the Seraph's kit on the bar (a friend's screen learns of it from the snapshot), its body on screen
      shoulderPos = pos;
      if (world.recalcMods) world.recalcMods();
    }
    const chan = mine && t.chan != null;
    renderer.shoulder.on = on;
    if (!shoulderUi) {
      shoulderUi = document.createElement('div');
      shoulderUi.id = 'shoulder-ui';
      shoulderUi.innerHTML = '<div class="xhair"></div><button class="sh-walk" type="button">Walk the keep <kbd>V</kbd></button><button class="sh-pos" type="button">Possess the Seraph <kbd>Y</kbd></button><div class="sh-target"><b></b><i><u></u></i></div><div class="sh-tip"></div><div class="sh-pill"><span class="sh-pillk">Hold <kbd>H</kbd> for controls</span><span class="sh-altk">The mouse is yours: let go of <kbd>Alt</kbd> to look again</span></div><div class="sh-keys"><h5>Controls <small>(hold <kbd>H</kbd>)</small></h5><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · mouse looks</div><div><b>Hold left click</b> strike · <kbd>Tab</kbd> next target</div><div><kbd>Q</kbd><kbd>E</kbd><kbd>R</kbd> skills · <kbd>Shift</kbd> dash</div><div>Double-tap a direction: <span class="sh-dodge">roll</span> · <kbd>Space</kbd> parry</div><div><kbd>Ctrl</kbd> or <kbd>Caps</kbd> <span class="sh-pace">walk</span></div><div>Hold <kbd>Alt</kbd> for the mouse</div><div class="sh-posk"><kbd>Y</kbd> leave the Seraph</div><div class="sh-posin"><kbd>Y</kbd> take up the Seraph</div><div class="sh-nightk">Hold <kbd>N</kbd> to call the night · <kbd>[</kbd> <kbd>]</kbd> its level</div><div class="sh-stop"><kbd>V</kbd> back above</div></div><div class="sh-night"><b></b><i><u></u></i><small>keep holding <kbd>N</kbd> · let go to stop</small></div><div class="sh-chan"><b>Gathering aura</b><span class="sh-pct"></span><i><u></u></i><small><kbd>R</kbd> again to land now (less aura)</small></div><div class="sh-compass"><div class="sh-cstrip"></div><div class="sh-cmark"></div></div><div class="sh-heroes"></div>';
      document.body.appendChild(shoulderUi);
      shoulderUi.querySelector('.sh-walk').addEventListener('click', () => input.toggleWalk());
      shoulderUi.querySelector('.sh-pos').addEventListener('click', () => input.togglePossess()); // (0.92)
    }
    document.body.classList.toggle('shoulder-on', on);
    shoulderUi.classList.toggle('on', on);
    shoulderUi.classList.toggle('walk', walk);
    shoulderUi.classList.toggle('pos', pos);
    const canPos = inKeep && !world.keepVisit && !pos && !!(world.player && world.player.keep && world.player.keep.statue) && mode === 'play';
    shoulderUi.classList.toggle('can-pos', canPos && !(t && t.state === 'on'));
    // (0.91) between nights in a keep: the offer to walk it over your shoulder
    shoulderUi.classList.toggle('can-walk', inKeep && !walk && !pos && !(t && t.state === 'on') && mode === 'play'); // (0.98: not from inside the Seraph)
    shoulderUi.classList.toggle('chan', chan);
    shoulderUi.classList.toggle('free', on && !input.locked());
    // (0.89) the soft lock: its frame at the top, and the crosshair turns gold
    const lockOn = on && input.softId != null ? world.enemies.find((e) => e.id === input.softId && !e.dead) : null;
    shoulderUi.classList.toggle('locked', !!lockOn);
    shoulderUi.classList.toggle('boss-lock', !!(lockOn && lockOn.def && lockOn.def.boss && !$('boss-box').classList.contains('hidden'))); // (0.98)
    if (on) {
      const dc = world.player.dodgeCd || 0; // (0.89) the roll's cooldown
      const dEl = shoulderUi.querySelector('.sh-dodge');
      dEl.textContent = dc > 0 ? `roll ${dc.toFixed(1)}s` : 'roll';
      dEl.classList.toggle('cool', dc > 0);
    }
    if (lockOn) {
      shoulderUi.querySelector('.sh-target b').textContent = (lockOn.def && lockOn.def.name) || 'The Unmade';
      shoulderUi.querySelector('.sh-target u').style.width = `${Math.max(0, Math.round((lockOn.hp / lockOn.maxHp) * 100))}%`;
    }
    if (chan) {
      const a = Math.min(1, t.chan / INCARNATE.chan);
      shoulderUi.querySelector('.sh-pct').textContent = ` ${Math.round(a * 100)}%`;
      shoulderUi.querySelector('.sh-chan u').style.width = `${Math.round(a * 100)}%`;
      shoulderUi.querySelector('.sh-chan small').style.visibility = t.chan >= INCARNATE.chanMin ? 'visible' : 'hidden';
    }
    // (0.94) over the shoulder the mouse is caught at once (no click needed), and let go when it ends (not in
    // the moment between a key and the world answering it)
    if (on && !shoulderWas && !input.locked() && !input.altFree) input.lock();
    if (on && (!shoulderWas || pos !== helpPos)) shoulderSince = performance.now(); // (0.99) the controls show a moment (again on taking up the Seraph or leaving it), then fold away
    helpPos = pos;
    shoulderUi.classList.toggle('help', on && (helpHeld || performance.now() - shoulderSince < 7000));
    shoulderWas = on;
    if (!on && !chan && input.locked() && performance.now() - (input.lockAt || 0) > 500) input.unlock();
    shoulderUi.classList.toggle('alt', on && !!input.altFree);
    document.body.classList.toggle('sh-alt', on && !!input.altFree);
    const kp = world.player && world.player.keep;
    shoulderUi.classList.toggle('has-seraph', inKeep && !world.keepVisit && !!(kp && kp.statue) && !pos);
    shoulderUi.classList.toggle('can-night', inKeep && !world.keepVisit && !!kp && !(t && t.state === 'on'));
    // (0.94) a held N: the night, filling
    const nk = on ? input.nightHoldK() : null;
    const nEl = shoulderUi.querySelector('.sh-night');
    nEl.classList.toggle('on', nk != null);
    if (nk != null) {
      const k = world.player.keep;
      nEl.querySelector('b').textContent = `Calling Night ${k ? k.night || Math.min(NIGHT.max, (k.nightMax || 0) + 1) : ''}…`;
      nEl.querySelector('u').style.width = `${Math.round(nk * 100)}%`;
    }
    if (on) compassFrame();
    const walkEl = shoulderUi.querySelector('.sh-pace');
    if (walkEl) walkEl.textContent = world.player && world.player.walkPace ? 'run' : 'walk';
  }
  let keepClockAt = 0; // (0.82.1)
  /** (0.82) The Armory: the gear window, on its Heroes tab. */
  function openArmory() {
    inventory.tab = 'heroes';
    setMode('gear');
  }
  let ringInfoOpen = false;

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
    // (0.66) "Take her place" (New Game+) is withdrawn for now: it pulled the story somewhere it should
    // not go yet. Heroes who already took it keep their New Game+.
    void seen;
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
    if (talkTo === 'ringstones') return renderRingStones();
    if (talkTo === 'tomashusk') return renderTomasHusk();
    if (talkTo === 'crack') return renderCrack(); // (1.0) the Verge
    if (world.keepVisit && (talkTo === 'keepaltar' || talkTo === 'seraph' || talkTo === 'wishes' || String(talkTo).startsWith('hall_') || WORKS[talkTo] || SETTLERS[talkTo])) {
      // (0.82.2) a friend's keep: theirs to tend
      $('talk-role').textContent = "A friend's keep";
      $('talk-name').textContent = `${world.keepVisitOf || 'A friend'}'s Wishkeep`;
      $('talk-keys').classList.add('hidden');
      $('talk-quests').innerHTML = '';
      $('talk-line').textContent = `This keep is ${world.keepVisitOf || 'theirs'}: only they can tend it, raise it and call its night. If they call the night while you are here, you can watch their heroes hold it: in a friend's keep your skills and blows do nothing (no walls, freezes or pulls in their night; it is theirs to win). Your own keep is through the Waygate.`;
      return;
    }
    if (talkTo === 'wishes') return renderKeepBoard(); // (0.80) the Wishkeep
    if (talkTo === 'keepaltar') return renderKeepHearth();
    if (talkTo === 'seraph') return renderSeraph(); // (0.92)
    if (WORKS[talkTo]) return renderKeepWorks(talkTo); // (0.82.1)
    if (String(talkTo).startsWith('hall_')) return renderKeepHall(String(talkTo).slice(5));
    if (SETTLERS[talkTo]) return renderSettler(talkTo);
    if (String(talkTo).startsWith('chapter:')) return renderChapter(String(talkTo).slice(8));
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
      el.innerHTML = `${catBadge(q)}<h4>${esc(q.name)}<small>level ${q.level}</small></h4><p>${esc(st === 'ready' ? (id === 'scarf2' && world.player.choices && world.player.choices.scarf === 'walk' ? q.doneAlt : q.done) : q.offer)}</p><div class="goal">${goalText(q, q.perTier ? world.questTier(id) : 0)}${prog}</div><div class="rewards">Reward: ${rewardText(id)}</div>`;
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
    if (talkTo === 'bram' && world.mode === 'explore') {
      renderSmith(list); // (0.75) the blacksmith's +1 to +10 again, here in Haven
      renderVault(list); // (0.62) the Warden's caches, opened at the forge
    }
    $('talk-line').textContent = talkTo === 'tomas' ? (world.player.tomasMet ? npc.idle : npc.greet) : talkNote || (after && !shown ? npc.after : shown ? npc.greet : npc.idle + (later !== null && world.player.level < later - 4 ? ` (More at level ${later - 4}.)` : ''));
    if (talkTo === 'tomas' && !world.player.tomasMet) {
      // (0.70.3) once, and marked here at once: online the command goes to the server, and the flag only
      // came back with its next update, so applyNow -> renderTalk -> applyNow sent it again and again
      // (thousands in a moment) until the server closed the connection for flooding.
      world.player.tomasMet = true;
      applyNow({ type: 'metTomas' });
    }
  }

  /**
   * (0.75) Bram's anvil: the blacksmith's upgrades (+8% to every stat on a piece a time, up to +10), for
   * scrap and gold, on what you wear. It was only on the Ring's hub screen; now it is beside the caches.
   */
  function renderSmith(list) {
    const p = world.player;
    const box = document.createElement('div');
    box.className = 'quest vault';
    box.innerHTML = `<h4>Bram's anvil<small>${(p.scrap || 0).toLocaleString()} scrap &middot; ${(p.gold || 0).toLocaleString()} gold</small></h4><p>"Leave it with me a minute. Every pass on the anvil and it's that bit better, up to ten."</p><p class="setting-desc">Each upgrade adds 8% to every stat on the piece, up to +10. Hold Shift and click to go as far as your scrap and gold allow.</p>`;
    for (const slot of SLOTS) {
      const item = p.equipped[slot];
      const row = document.createElement('div');
      row.className = 'vault-row';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost';
      if (!item) {
        row.innerHTML = `<div><b style="color:var(--muted)">No ${SLOT_NAMES[slot].toLowerCase()} worn</b></div>`;
        b.textContent = 'Upgrade';
        b.disabled = true;
      } else {
        const plus = item.plus || 0;
        const cost = upgradeCost(item);
        row.innerHTML = `<div><b style="color:${RARITIES[item.rarity].color}">${esc(itemName(item))}</b><div class="odds">${SLOT_NAMES[slot]}${plus >= MAX_PLUS ? ' &middot; fully upgraded' : ` &middot; ${cost.scrap.toLocaleString()} scrap + ${cost.gold.toLocaleString()} gold`}</div></div>`;
        b.textContent = plus >= MAX_PLUS ? 'Max' : `Upgrade to +${plus + 1}`;
        b.disabled = plus >= MAX_PLUS || p.scrap < cost.scrap || p.gold < cost.gold;
        b.title = 'Shift+click: as many upgrades as you can afford, up to +10';
        b.addEventListener('click', (ev) => {
          // Shift: work out how many it can afford from here, and send that many
          let n = 1;
          if (ev.shiftKey) {
            let scrap = p.scrap, gold = p.gold;
            n = 0;
            for (let k = plus; k < MAX_PLUS; k++) {
              const c = upgradeCost(Object.assign({}, item, { plus: k }));
              if (scrap < c.scrap || gold < c.gold) break;
              scrap -= c.scrap;
              gold -= c.gold;
              n++;
            }
          }
          for (let i = 0; i < Math.max(1, n); i++) applyNow({ type: 'upgrade', slot });
          renderTalk();
        });
      }
      row.appendChild(b);
      box.appendChild(row);
    }
    list.appendChild(box);
  }

  /**
   * (0.62) Bram's vault: Warden keys (and gold) open caches right here in Haven, so they are worth having
   * on the server world too. The same caches, odds and prices as the cache vault on the Ring's hub.
   */
  function renderVault(list) {
    const p = world.player;
    const box = document.createElement('div');
    box.className = 'quest vault';
    const bagFull = p.bag.length >= world.bagSize();
    box.innerHTML = `<h4>The Warden's caches<small>${p.keys || 0} Warden key${p.keys === 1 ? '' : 's'}</small></h4><p>"Bring me what you take off the wardens up there and I'll crack it open. Gold works on the plainer ones."</p><p class="setting-desc">Hold Shift and click to open 10 at once.</p>`;
    for (const tier in CACHES) {
      const def = CACHES[tier];
      const cost = world.cacheCost(tier);
      const total = def.odds.reduce((a, b) => a + b, 0);
      const odds = def.odds.map((o, i) => (o > 0 ? `<span style="color:${RARITIES[i].color}">${RARITIES[i].name} ${+((o / total) * 100).toFixed(1)}%</span>` : '')).filter(Boolean).join(' · ');
      const row = document.createElement('div');
      row.className = 'vault-row';
      const price = [cost.keys ? `${cost.keys} Warden key${cost.keys > 1 ? 's' : ''}` : '', cost.gold ? `${cost.gold.toLocaleString()} gold` : ''].filter(Boolean).join(' + ');
      row.innerHTML = `<div><b>${esc(def.name)}</b><div class="odds">${odds}</div></div>`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = tier === 'warden' ? 'primary' : 'ghost';
      b.textContent = `Open · ${price}`;
      b.disabled = bagFull || p.gold < cost.gold || (p.keys || 0) < cost.keys;
      b.title = bagFull ? 'Your bag is full' : 'Shift+click opens 10 at once (as many as your keys, gold and bag room allow)';
      b.addEventListener('click', (ev) => applyNow({ type: 'openCache', tier, n: ev.shiftKey ? 10 : 1 }));
      row.appendChild(b);
      box.appendChild(row);
    }
    list.appendChild(box);
  }

  function renderRead() {
    const sg = SIGNS[reading];
    if (!sg) return;
    $('read-where').textContent = `A glimmer · ${MAPS[sg.map].name}`;
    $('read-title').textContent = sg.title;
    $('read-text').textContent = sg.after && world.afterWish() ? sg.after : sg.text;
    $('read-note').textContent = `A sliver of the fallen star, and it remembers what it saw. Kept in your journal for every class and every life (${world.player.signs.length} of ${SIGN_IDS.length} found). Press J to see them again.`;
  }

  /** (1.0) A quest's kind, as a small coloured tag (Main Story, New Content, Side Story, Side Quest, Repeatable). */
  function catBadge(q) {
    const c = QUEST_CATS[q.cat] || QUEST_CATS.side;
    return `<span class="qcat qcat-${q.cat}" title="${esc(c.note)}">${c.icon} ${c.name}</span>`;
  }
  /**
   * (1.0) What you could take up now, by kind (the main story first), who gives it and where; and when the main
   * story next goes on, if it is waiting for a level.
   */
  function renderAvailable() {
    const p = world.player;
    const groups = {};
    for (const id of QUEST_IDS) {
      const q = QUESTS[id];
      const st = p.quests[id];
      if (st && !(q.repeat && st.s === 'done')) continue;
      if (!world.questOpen(id)) continue;
      (groups[q.cat] = groups[q.cat] || []).push(q);
    }
    // the main story's next step, if it waits for a level
    let next = null;
    for (const id of QUEST_IDS) {
      const q = QUESTS[id];
      if (q.cat !== 'main' || p.quests[id] || q.act3) continue;
      if (q.after && world.questState(q.after) !== 'done') continue;
      if (!world.questOpen(id)) { next = q; break; }
    }
    const order = ['main', 'feature', 'story', 'side', 'repeat'];
    const html = [];
    for (const cat of order) {
      const list = groups[cat] || [];
      if (!list.length && !(cat === 'main' && next)) continue;
      const c = QUEST_CATS[cat];
      html.push(`<div class="avail-head qcat-${cat}">${c.icon} ${c.name}<small>${esc(c.note)}</small></div>`);
      for (const q of list) html.push(`<div class="avail"><b>${esc(q.name)}</b><small>level ${q.level} · ${esc(NPCS[world.questTaker(q.giver)].name)}, in Haven</small></div>`);
      if (cat === 'main' && next && !list.length) html.push(`<div class="avail locked"><b>${esc(next.name)}</b><small>The main story goes on at level ${next.level - 4} (you are ${p.level}) · ${esc(NPCS[world.questTaker(next.giver)].name)}</small></div>`);
    }
    $('journal-avail').innerHTML = html.join('') || '<p class="setting-desc">Nothing new to take up just now. Look again after your next level, or the next part of the main story.</p>';
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
      qs.push(`<div class="quest ${st.s === 'ready' ? 'ready' : ''}">${catBadge(q)}<h4>${esc(q.name)}<small>${NPCS[world.questTaker(q.giver)].name}</small></h4><div class="goal">${st.s === 'ready' ? 'Done. Return to ' + NPCS[world.questTaker(q.giver)].name + ' in Haven.' : goalText(q, st.tier) + (need > 1 ? ` · ${st.n}/${need}` : '')}</div><div class="rewards">Reward: ${rewardText(id)}</div></div>`);
    }
    const waiting = ['wren', 'bram', 'odile', 'lark', 'pip'].filter((n) => world.npcMarker(n) === '!').map((n) => NPCS[n].name);
    const wait = world.actThreeWait ? world.actThreeWait() : null; // (0.70.4) why Wren has nothing yet
    const waitText = {
      unwish: "Wren's last story begins after the Unwish: at the Starwell, with the Asker gone, press in an Unwishing Glass and want nothing.",
      rebirth: 'Wren has more to tell, but only to one who has begun again: rebirth once (Talents, under Rebirth), then come back to her at level 100. The Deep stays open to you.',
      level: 'Wren has more to tell you at level 100.',
    }[wait];
    $('journal-quests').innerHTML = (waitText ? `<div class="quest next"><h4>What comes next<small>Wren</small></h4><div class="goal">${esc(waitText)}</div></div>` : '') + (qs.join('') || '<p class="setting-desc">No quests in hand.</p>')
      + (waiting.length ? `<p class="setting-desc">Work waiting in Haven: ${waiting.join(', ')}.</p>` : '')
      + `<p class="setting-desc">${done} quest${done === 1 ? '' : 's'} completed.</p>`;
    renderAvailable();
    $('journal-lore-head').textContent = `What the road remembers · ${p.signs.length} of ${SIGN_IDS.length}`;
    $('journal-lore').innerHTML = SIGN_IDS.map((id) => {
      const sg = SIGNS[id];
      return p.signs.includes(id)
        ? `<div class="lore"><b>${esc(sg.title)}</b><small>${MAPS[sg.map].name}</small><p>${esc(sg.text)}</p></div>`
        : `<div class="lore missing"><b>A glimmer not yet found</b><small>${p.visited.includes(sg.map) ? MAPS[sg.map].name : 'Somewhere further up the road'}</small></div>`;
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
  let caseWorld = 0; // (0.66) the world Ex Voto shows drop rates for (0: yours)
  function renderCasebook() {
    const b = book();
    const visited = world.player.visited || [];
    const detail = !!settings.caseDetail !== caseShift; // Shift flips whichever view is set
    const list = Casebook.listHtml(b, caseSel, visited);
    $('case-list').innerHTML = list.html;
    $('case-count').textContent = `${list.rested} of ${list.total} laid to rest`;
    $('case-detail').checked = !!settings.caseDetail;
    const p = world.player;
    const here = world.depthNow && world.depthNow() ? world.depthNow() : world.worldTier ? world.worldTier() : 1;
    const ctx = { tier: Math.min(5, here), world: caseWorld || here, chosen: !!caseWorld, luck: p && p.rebirth ? 0.04 * perkRank(p.rebirth, 'luck') : 0 }; // (0.61.2) for its drop rates; (0.66) any world I to X
    $('case-page').innerHTML = Casebook.pageHtml(b, caseSel, detail, visited, ctx);
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
  /** (0.70.2) Is there something to borrow and a D or F slot still empty? */
  function borrowWaiting() {
    const p = world.player;
    if (world.trial || !world.borrowable || !p.borrowed) return false;
    return world.borrowable().length > 0 && (!p.borrowed.d || !p.borrowed.f);
  }
  function talentBadge() {
    const p = world.player;
    // A Weekly Echo build is set on its own screen before the run, so nothing to spend here.
    const perkable = p.rebirth && PERK_IDS.some((id) => perkRank(p.rebirth, id) < PERKS[id].max && p.rebirth.marks >= PERKS[id].cost) ? 1 : 0; // Starmarks to spend (0.43)
    const borrow = borrowWaiting() ? 1 : 0; // (0.70.2) a borrowed skill slot still empty
    const n = world.trial ? 0 : !p.spec && p.level >= CONFIG.SPEC_LEVEL ? '!' : (p.spec ? world.talentPoints() : 0) + (p.wishPts || 0) + perkable + borrow;
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
    panel.innerHTML = `<h3>Wishborne ${p.wish}</h3><p class="setting-desc">Past level 100, EXP fills Wishborne levels: each one is a Wish point for a small bonus with no limit. ${p.wishPts ? `<b>${p.wishPts} point${p.wishPts === 1 ? '' : 's'} to spend.</b>` : 'No points to spend right now.'} <b>Hold Shift and click</b> to place 10 at a time.</p>`;
    for (const k of WISH_IDS) {
      const st = WISH_STATS[k];
      const unit = st.unitFor ? st.unitFor(world.cls, p.spec) : st.unit; // (0.61.8) Might names what it raises for you
      const n = (p.wishStats && p.wishStats[k]) || 0;
      const row = document.createElement('div');
      row.className = 'wish-row';
      row.innerHTML = `<span>${st.name}</span><span class="v">+${+(st.each * n).toFixed(1)}${unit}</span><span class="v">${n}</span>`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost tiny';
      b.textContent = '+';
      b.disabled = !p.wishPts;
      b.title = `+${st.each}${unit} per point · Shift+click: 10 points`;
      b.addEventListener('click', (ev) => {
        applyNow({ type: 'wishSpend', stat: k, n: ev.shiftKey ? 10 : 1 });
        renderTalents();
      });
      row.appendChild(b);
      // (0.75.4) All in: every point on this one stat, after a check in the middle of the screen
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'ghost tiny wish-all';
      all.textContent = 'All in';
      all.disabled = !p.wishPts;
      all.title = `Put all ${p.wishPts || 0} points into ${st.name} (asks first)`;
      all.addEventListener('click', () => {
        const pts = world.player.wishPts || 0;
        if (!pts) return;
        const now = +(st.each * n).toFixed(1), after = +(st.each * (n + pts)).toFixed(1);
        confirmModal({
          title: `All in on ${st.name}?`,
          html: `<p>Put <b>all ${pts.toLocaleString()} Wish point${pts === 1 ? '' : 's'}</b> into <b>${esc(st.name)}</b>.</p>
            <div class="cm-change"><span>${esc(st.name)}</span><b>+${now}${unit}</b><span class="cm-arrow">→</span><b class="cm-new">+${after}${unit}</b></div>
            <p class="setting-desc">${n.toLocaleString()} → ${(n + pts).toLocaleString()} points on it. Nothing is left for the other stats; only an Unwishing Glass takes spent points back.</p>`,
          ok: `Put all ${pts.toLocaleString()} into ${st.name}`,
          onOk: () => {
            applyNow({ type: 'wishSpend', stat: k, n: pts });
            renderTalents();
          },
        });
      });
      row.appendChild(all);
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
  let rebirthHeir = null; // (0.53) the slot kept as an Heirloom
  function renderRebirth() {
    const p = world.player;
    const panel = $('rebirth-panel');
    const rb = p.rebirth;
    const show = !world.trial && (p.level >= CONFIG.MAX_LEVEL || (rb && rb.n > 0));
    panel.classList.toggle('hidden', !show);
    if (!show) return;
    const block = rebirthBlock(p);
    const marks = world.rebirthMarks(rebirthHeir);
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
      b.title = `${pk.each} a rank, for ${pk.cost} Starmark${pk.cost === 1 ? '' : 's'} (Shift + click: up to 10 ranks)`;
      b.addEventListener('click', (e) => {
        applyNow({ type: 'rebirthPerk', id, n: e.shiftKey ? 10 : 1 }); // (0.71.7)
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
      sel.innerHTML = `<option value="">No Heirloom</option>` + SLOTS.filter((s) => p.equipped[s] && !p.equipped[s].eternal).map((s) => `<option value="${s}"${rebirthHeir === s ? ' selected' : ''}>${esc(itemName(p.equipped[s]))}</option>`).join('');
      sel.addEventListener('change', () => {
        rebirthHeir = sel.value || null;
        renderTalents();
      });
      heir.innerHTML = '<span>Heirloom</span><span class="v">kept, back at level 1, grows with you</span>';
      heir.appendChild(sel);
      panel.appendChild(heir);
      // (0.58) Everything it gives, and what stays behind
      const pv = world.rebirthPreview(rebirthHeir);
      const gains = [`<li><b class="rb-marks">+${pv.marks} Starmarks</b> <span>for perks that last every life (${REBIRTH.base} for level ${REBIRTH.level}${pv.marksWish ? `, +${pv.marksWish} for your Wishborne levels` : ''}${pv.marksGear ? `, +${pv.marksGear} for what you give up` : ''})</span></li>`];
      gains.push(`<li><b>+${pv.essence} Echo Essence</b> <span>(${pv.essenceWorn} from what you wear${rebirthHeir ? ', the Heirloom aside' : ''}, ${pv.essenceBag} from ${pv.bagPieces} piece${pv.bagPieces === 1 ? '' : 's'} in your bag)${rb.essence ? `; you have ${rb.essence}` : ''}. Spend it on the gear screen to recall what the star remembers.</span></li>`);
      gains.push(`<li><b style="color:#ff8a4a">+${pv.ember} Ember</b> <span>(up to ${DEEP.emberMax}, by everything you give up: rarer pieces, +levels and stars are worth more), kept for good: ${pv.emberNow} now, ${pv.emberNow + pv.ember} after</span></li>`);
      if (pv.remembered) gains.push(`<li><b>${pv.remembered} piece${pv.remembered === 1 ? '' : 's'} remembered</b> <span>(the best you have worn in ${pv.remembered === 1 ? 'that slot' : 'those slots'}), to recall in later lives</span></li>`);
      if (SLOTS.some((s) => world.eternalAt(s))) gains.push(`<li><b>Every Eternal piece</b> <span>comes with you, worn where you wore it, back at level 1 (it grows with you; its own level and passives stay)</span></li>`); // (0.71)
      if (rebirthHeir && p.equipped[rebirthHeir]) gains.push(`<li><b>${esc(itemName(p.equipped[rebirthHeir]))}</b> <span>comes with you as your Heirloom, back at level 1</span></li>`);
      if (pv.glow && GLOWS[pv.glow]) gains.push(`<li><b>${GLOWS[pv.glow].name}</b> <span>weapon glow</span></li>`);
      if (pv.acctExp) gains.push(`<li><b>+${pv.acctExp}% EXP</b> <span>for every hero on this account</span></li>`);
      const L = pv.left;
      const lost = [L.fragments && `${L.fragments} Immortal Fragments`, L.dust && `${L.dust} Wishdust`, L.scrap && `${L.scrap.toLocaleString()} scrap`, L.keys && `${L.keys} Warden key${L.keys === 1 ? '' : 's'}`, L.sigils && `${L.sigils} Remnant Sigil${L.sigils === 1 ? '' : 's'}`].filter(Boolean);
      const box = document.createElement('div');
      box.className = 'rb-gains';
      box.innerHTML = `<div class="rb-gains-h">Begin again now and the star gives you</div><ul>${gains.join('')}</ul>` +
        (lost.length ? `<p class="rb-lose">Left behind (spend them first): ${lost.join(', ')}.</p>` : '') +
        (pv.gifts ? `<p class="rb-lose">${pv.gifts} gift${pv.gifts === 1 ? '' : 's'} from friends give${pv.gifts === 1 ? 's' : ''} the star nothing.</p>` : '');
      panel.appendChild(box);
    }
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'ghost rb-go' + (rebirthSure ? ' sure' : '');
    const why = block || (net && !net.server ? 'Leave the room first: a rebirth is made alone.' : null);
    go.disabled = !!why;
    go.textContent = why ? `Begin again: ${why}` : rebirthSure
      ? `Are you sure? Click again to begin again with ${marks} Starmarks`
      : `Begin again · +${marks} Starmarks${block ? '' : ` · +${world.rebirthEssence(rebirthHeir)} Essence · +${world.rebirthEmber(rebirthHeir)} Ember`}`;
    go.title = 'A fresh start for this hero: level 1 and a starter weapon (plus your Heirloom, if you keep one); your gear becomes Echo Essence, and the story, quests, world tiers, talents and Wishborne levels begin again. Kept: Starmarks and perks, Echo Essence and the gear the star remembers, Ember, scrap, Wishdust and Warden keys, your Echo Ring start, Edric\'s Colours and weapon glows. Gold and shards are the account\'s and stay. Starmarks: 10 for level 100, plus 2 x the square root of your Wishborne levels, plus more the more you give up.';
    go.addEventListener('click', () => {
      if (!rebirthSure) {
        rebirthSure = true;
        renderTalents();
        clearTimeout(rebirthSureT);
        rebirthSureT = setTimeout(() => { if (rebirthSure) { rebirthSure = false; if (mode === 'talents') renderTalents(); } }, 6000); // and so do 6 seconds
        return;
      }
      rebirthSure = false;
      applyNow({ type: 'rebirth', heirloom: rebirthHeir });
    });
    panel.appendChild(go);
    if (!block) {
      const note = document.createElement('p');
      note.className = 'setting-desc';
      note.textContent = `Begin again: level 1, a starter weapon (and your Heirloom, if you keep one). Your gear, worn and in the bag, turns into Echo Essence; story, quests, world tiers, talents and ${p.wish || 0} Wishborne levels all go. Kept: Starmarks and perks, Echo Essence and the gear the star remembers, Ember, scrap, Wishdust and Warden keys, your Echo Ring start, Edric's Colours, and your weapon glows (gold and shards belong to the account).`;
      panel.appendChild(note);
    }
  }

  /** (0.63) Mastery: every Primordial beaten on every class of the account, Animus, and the head start. */
  function renderMastery() {
    const panel = $('mastery-panel');
    const p = world.player;
    const M = world.mastery ? world.mastery() : null;
    if (!M || !M.open || world.trial) return panel.classList.add('hidden');
    panel.classList.remove('hidden');
    const rows = MASTERY.classes.map((c) => {
      const got = new Set(M.by[c]);
      const pips = DEPTH_IDS.map((d) => `<span class="m-pip${got.has(d) ? ' on' : ''}" title="${esc(DEEP.depths[d].name)}: ${got.has(d) ? 'beaten' : 'not yet'} as a ${esc(CLASSES[c].name)}">${DEEP.depths[d].numeral}</span>`).join('');
      const tag = got.has(10) ? '<span class="m-tag">Mastered</span>' : '';
      return `<div class="m-row${c === world.cls ? ' me' : ''}"><span class="m-cls">${esc(CLASSES[c].name)}${c === world.cls ? ' (you)' : ''}</span><span class="m-pips">${pips}</span>${tag}</div>`;
    }).join('');
    const others = M.mastered.filter((c) => c !== world.cls).map((c) => CLASSES[c].name);
    panel.innerHTML = `<h3>Mastery · the other lives <small>${M.points} of 20</small></h3>
      <p class="setting-desc">Every Primordial beaten as each of your classes, on this account. Each one is a point of Mastery for every hero you play. It only counts when you meet its Depth's Ember yourself, or nobody beside you does.</p>
      ${rows}
      <div class="m-sum"><span><b>${Math.round(M.animus * 100)}%</b> Animus: ${M.animus >= 1 - 1e-6 ? 'nothing can Mind-Lock you' : `Mind-Lock cannot touch you where ${Math.round(M.animus * 100)}% or less is asked (Caelum I to IV ask 25, 50, 75 and 100%)`}</span>${M.mastered.length ? `<span><b>+${Math.round(world.masteryExp() * 100)}%</b> EXP for every hero (${M.mastered.length} mastered)</span>` : ''}${M.headStart ? `<span><b>+${M.headStart}</b> Ember from your other lives</span>` : ''}</div>
      ${borrowHtml(others)}`;
    // (0.70) borrowed skills: a press puts one on D or F (again takes it off)
    for (const b of panel.querySelectorAll('[data-borrow]')) {
      b.addEventListener('click', () => {
        const [slot, spec] = b.dataset.borrow.split(':');
        applyNow({ type: 'borrow', slot, spec: p.borrowed && p.borrowed[slot] === spec ? null : spec });
        setTimeout(() => { if (mode === 'talents') renderMastery(); }, 60);
      });
    }
  }
  /** (0.70) The borrowed-skill picker: every subclass of a mastered class, its skill, and D / F. */
  function borrowHtml(others) {
    const p = world.player;
    const may = world.borrowable ? world.borrowable() : [];
    if (!may.length) {
      return `<p class="setting-desc">Beat the Quiet with another class (it is then Mastered) and this ${esc(CLASSES[world.cls].name)} may borrow a skill from each of its two subclasses, on <kbd>D</kbd> and <kbd>F</kbd>.</p>`;
    }
    const cards = may.map((spec) => {
      const k = BORROWED[world.cls][spec];
      const on = BORROW_SLOTS.filter((s) => p.borrowed && p.borrowed[s] === spec);
      const btns = BORROW_SLOTS.map((s) => `<button type="button" class="ghost b-key${on.includes(s) ? ' on' : ''}" data-borrow="${s}:${spec}" title="${on.includes(s) ? 'Take it off' : 'Put it on'} ${s.toUpperCase()}">${s.toUpperCase()}</button>`).join('');
      const oath = k.type === 'bloodoath' ? ` <i>${esc((OATH[p.spec] || OATH.none).text)}</i>` : '';
      return `<div class="b-card${on.length ? ' on' : ''}"><div class="b-top"><b>${esc(k.name)}</b><small>${esc(SPECS[spec].name)}${k.passive ? ' · passive' : ''}</small><span class="b-keys">${btns}</span></div><div class="b-desc">${esc(k.desc)}${oath}</div></div>`;
    }).join('');
    return `<h3 class="b-h">Borrowed skills <small>D and F</small></h3>
      <p class="setting-desc">Mastered: ${others.map(esc).join(', ')}. Choose any two (both from one class if you like). Changing one outside town puts it on a 5 s cooldown.</p>
      <div class="b-list">${cards}</div>`;
  }
  function renderTalents() {
    renderWish();
    renderRebirth();
    renderMastery();
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
    hud.setRoom(net ? { code: net.code, players, host: net.role === 'host', server: !!net.server, alone: !!net.alone, ping: Math.round(ping), relay } : null);
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
    return joinWith(new ServerRoom({ onMessage: onNetMessage, onClose: (why, code) => serverDropped(why, code) }), url, null, $('btn-server'), { pass });
  }

  async function joinWith(room, target, code, button, extra = {}) {
    const name = playerName();
    button.disabled = true;
    let welcome;
    try {
      const session = room.server ? Online.sessionFor(Online.baseOf(target)) : ''; // (0.57) an online character, if signed in
      welcome = await room.join(target, { name, save: save && Object.assign({}, save, { acctLives: browserLives() }), cls: settings.cls, parry: settings.parryPreset, autoAttack: settings.autoAttack !== false, gold: account.gold, tickets: account.tickets, keep: account.keep || null, acctRebirths: account.rebirths || 0, signs: account.signs, ...(session ? { session } : {}), ...extra });
    } catch (err) {
      button.disabled = false;
      mpMsg(err.message, false);
      // (0.57.8) This page is older than the server: load the newest and join by yourself.
      if (room.server && !rejoining && /different versions/.test(err.message)) {
        mpMsg('A new version of the game is out. Loading it, then joining you...', true);
        setTimeout(() => reloadToRejoin(target, !!extra.alone, Date.now(), 0), 1200);
      }
      return false;
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
    net = { role: 'client', room, pid: welcome.pid, code, server: !!welcome.server, online: !!welcome.online, alone: !!welcome.alone, base: Online.baseOf(target), url: target, pass: extra.pass, roster: null, snapAt: performance.now(), snapGap: 50, queue: [], nextAt: 0, lastTick: null, gapTicks: 3, intent: null, lagEst: 0.2, jitter: 0, ping: 0, dry: true };
    if (welcome.server && welcome.online) {
      // (0.60) the Weekly Echo: this browser's board name, so the server can reward this online character
      const me = trialApi.identity();
      if (me && me.token) room.send({ t: 'weekly', token: me.token });
    }
    renderer.setMap(world.map);
    resetViews();
    sfx.unlock();
    setMode('play');
    updateRoomBadge();
    if (welcome.alone) hud.banner('Playing alone', `Your online ${CLASSES[settings.cls].name}, a Haven of your own`);
    else hud.banner(welcome.server ? 'The server world' : `Room ${code}`, welcome.server ? `Joined as ${CLASSES[settings.cls].name}${welcome.online ? ' · your online character' : ''}` : 'Joined the party');
    return true;
  }

  /**
   * (0.56.4) Leaving the server world politely: ask for this hero's latest save and wait for it (up to
   * 2 s), so nothing from the last few seconds is lost. The server sends it, then lets the hero go.
   */
  function finalSave(was) {
    return new Promise((resolve) => {
      if (!was || !was.server) return resolve(false);
      was.onSave = () => resolve(true);
      was.room.send({ t: 'bye' });
      setTimeout(() => resolve(false), 2000);
    });
  }

  let switching = false;
  /** (0.56.4) On the server world: save this hero, then rejoin the same server as another class. */
  async function switchServerClass(cls) {
    if (!net || !net.server || switching || cls === settings.cls || !CLASSES[cls]) return;
    switching = true;
    const was = net;
    setMode('play');
    hud.banner(`Becoming your ${CLASSES[cls].name}`, 'Saving this hero, then rejoining the server world');
    await finalSave(was);
    net = null;
    was.room.close();
    hud.setRoom(null);
    closePlayers();
    closeChat();
    settings.cls = cls;
    storeSettings(settings);
    save = loadSave(cls);
    world = makeWorld({ save });
    resetViews();
    const ok = await joinWith(new ServerRoom({ onMessage: onNetMessage, onClose: (why, code) => serverDropped(why, code) }), was.url, null, $('btn-server'), { pass: was.pass, ...(was.alone ? { alone: true } : {}) });
    switching = false;
    if (!ok) {
      const why = $('mp-msg').textContent;
      openMp();
      mpMsg(`Your ${CLASSES[cls].name} could not rejoin: ${why} Your progress is saved.`, false);
    }
  }
  function renderSwitch() {
    const box = $('pause-switch');
    const show = !!(net && net.server);
    box.classList.toggle('hidden', !show);
    if (!show) return;
    const row = $('switch-classes');
    row.innerHTML = '';
    for (const c of CLASS_IDS) {
      const b = document.createElement('button');
      b.type = 'button';
      const sv = c === settings.cls ? null : net.online ? Online.cachedChars(net.base)[c] : loadSave(c);
      b.textContent = c === settings.cls ? `${CLASSES[c].name} (now)` : sv ? `${CLASSES[c].name} · ${sv.level}` : `${CLASSES[c].name} · new`;
      b.disabled = c === settings.cls || switching;
      b.setAttribute('aria-pressed', c === settings.cls ? 'true' : 'false');
      b.addEventListener('click', () => switchServerClass(c));
      row.appendChild(b);
    }
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
    if (msg.t === 'weekly') {
      if (msg.error) hud.feedText(msg.error);
      else if (msg.title && !msg.weeks) hud.feedText(`Your Weekly Echo title: ${msg.title}`);
      return;
    }
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
      net.lastSave = msg.save; // (0.59) e.g. how far this hero has reached in the Echo Ring
      if (msg.online) {
        // (0.57) an online character: the server keeps it; this browser's own characters stay as they were
        Online.cacheChar(net.base, world.cls, msg.save);
      } else {
        save = msg.save;
        storeSave(save, world.cls);
        account.gold = msg.gold;
        account.tickets = msg.tickets;
        if (msg.keep) account.keep = msg.keep; // (0.80)
        storeAccount(account);
      }
      if (net.onSave) {
        const done = net.onSave;
        net.onSave = null;
        done();
      }
    } else if (msg.t === 'chat') {
      chatLine(msg.from ? `${msg.from}: ${msg.text}` : msg.text, !msg.from);
    } else if (msg.t === 'announce') {
      // (0.73.1) for the whole server: an Eternal found
      chatLine(`✧ ${msg.text}`, true);
      hud.banner('✧ Server', msg.text);
      sfx.eternal();
    } else if (msg.t === 'inspect') {
      showInspect(msg); // (0.62)
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
    if (applySnapshot(world, msg, alpha)) world.events.push({ type: 'mapChange', id: world.map ? world.map.id : 'ring', name: world.map ? world.map.name : 'The Echo Ring', from: null, hero: net.pid });
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
  const WALK_PACE = 1.8; // (0.96.1) as the sim's
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
    const speed = p.walkPace ? WALK_PACE : (p.stats && p.stats.ms) || 6; // (0.96) walking: lead at a walk (a run's lead was the spike on every turn)
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

  // ------------------------------------------------- (0.56.4) when the server world lets you go
  /**
   * The server world closed the connection. Its last save has already arrived (it is sent first), so
   * say so plainly. On an update (code 1012), watch for it to come back and offer to reload into the
   * new version and rejoin in one click.
   */
  function serverDropped(why, code) {
    const was = net;
    const url = was && was.url;
    const pass = was && was.pass;
    const alone = !!(was && was.alone);
    leaveRoom(why);
    const update = code === 1012;
    showNotice({
      title: update ? 'The server world is updating' : 'Disconnected from the server world',
      text: update
        ? 'The server restarts with the new version of the game each time the game is updated. Your hero was saved just before it closed, so nothing is lost. It is usually back within a minute; reloading the page gets you the new version, and you will rejoin by yourself.'
        : `${why} Your hero is saved up to the last few seconds.`,
      go: update ? 'Reload and rejoin' : 'Rejoin',
      onGo: () => {
        if (update) reloadToRejoin(url, alone, Date.now(), 0);
        else if (url) {
          hideNotice();
          joinWith(new ServerRoom({ onMessage: onNetMessage, onClose: (w, c) => serverDropped(w, c) }), url, null, $('btn-server'), { pass, ...(alone ? { alone: true } : {}) }).then((ok) => {
            if (!ok) {
              const msg = $('mp-msg').textContent;
              openMp();
              mpMsg(msg, false);
            }
          });
        }
      },
      watch: url,
    });
  }
  let noticeWatch = null;
  function showNotice({ title, text, go, onGo, watch }) {
    $('notice-title').textContent = title;
    $('notice-text').textContent = text;
    const btn = $('btn-notice-go');
    btn.textContent = go;
    btn.onclick = onGo;
    const st = $('notice-status');
    st.textContent = '';
    st.className = 'setting-desc';
    $('notice').classList.remove('hidden');
    clearInterval(noticeWatch);
    if (watch) {
      // is it back yet?
      st.textContent = 'Waiting for the server world to come back...';
      const check = async () => {
        const h = await serverHealth(watch, 2500);
        if ($('notice').classList.contains('hidden')) return clearInterval(noticeWatch);
        if (h && h.open) {
          st.textContent = 'It is back.';
          st.className = 'setting-desc ok';
          clearInterval(noticeWatch);
        }
      };
      noticeWatch = setInterval(check, 4000);
      setTimeout(check, 1500);
    }
  }
  function hideNotice() {
    $('notice').classList.add('hidden');
    clearInterval(noticeWatch);
  }
  $('btn-notice-ok').addEventListener('click', hideNotice);
  // (0.59) After an Echo Ring boss: the spoils are safe. Take them home, or push on.
  let lastRingPaid = null;
  function showRingBank(ev) {
    if (!world.ring || (net && !net.server)) return;
    $('ring-bank-text').textContent = `Wave ${ev.n} cleared. This run has given you ${ringText(world.ring, ev.pot)} so far.`;
    $('btn-ring-on').innerHTML = `Push on <kbd>${esc((nextWaveKey() || 'Enter').toUpperCase())}</kbd>`; // (0.62.2) the key that pushes on
    $('ring-bank').classList.remove('hidden');
  }
  function ringLeave() {
    if ($('ring-bank').classList.contains('hidden') || !world.ring || world.mode !== 'arena') return false;
    $('ring-bank').classList.add('hidden');
    applyNow({ type: 'ringLeave' });
    if (net && net.server) return true; // (0.59) the server takes you home, spoils and all
    enterTown();
    if (lastRingPaid) hud.banner('Home from the Ring', `${lastRingPaid.got}, after wave ${lastRingPaid.wave}`);
    return true;
  }
  $('btn-ring-leave').addEventListener('click', ringLeave);
  $('btn-ring-on').addEventListener('click', () => {
    $('ring-bank').classList.add('hidden');
    applyNow({ type: 'ringOn' });
  });
  // (0.58) A rift that is over: home at once (its spoils come too), or stay and walk out when ready
  function showRiftHome(won) {
    const host = !net || net.server || net.role === 'host';
    $('rift-home-text').textContent = won ? 'Rift cleared. Your spoils come with you.' : 'The rift is over. Your spoils come with you.';
    $('btn-rift-home').disabled = !host;
    $('btn-rift-home').title = host ? '' : 'The host takes everyone home';
    $('rift-home').classList.remove('hidden');
  }
  function riftHome() {
    if ($('rift-home').classList.contains('hidden') || $('btn-rift-home').disabled) return false;
    $('rift-home').classList.add('hidden');
    applyNow({ type: 'riftHome' });
    return true;
  }
  $('btn-rift-home').addEventListener('click', riftHome);
  $('btn-rift-stay').addEventListener('click', () => {
    $('rift-home').classList.add('hidden');
    hud.feedText('Stay as long as you like. Step into the portal, or press H, to go home.');
  });
  /**
   * (0.57.8) Reload into the newest page and rejoin by yourself. What to rejoin rides in the address
   * (not sessionStorage, which Firefox can refuse when the site's storage is full, so the page came
   * back without rejoining), and the changed address also means the newest page is fetched.
   */
  function reloadToRejoin(url, alone, at, tries) {
    loadFresh({ rejoin: `${Math.floor(at / 1000).toString(36)}.${tries}`, rjalone: alone ? '1' : null, rjserver: url && url !== DEFAULT_SERVER ? url : null });
  }
  // Back from "Reload and rejoin": straight into the server world (the passcode is remembered).
  let rejoining = false;
  (() => {
    let rj = null;
    try {
      const q = new URLSearchParams(location.search);
      const tag = q.get('rejoin');
      if (tag) {
        const [at, tries] = tag.split('.');
        rj = { url: q.get('rjserver') || DEFAULT_SERVER, at: parseInt(at, 36) * 1000, tries: Number(tries) || 0, alone: q.get('rjalone') === '1' };
        tidyAddress(['rejoin', 'rjalone', 'rjserver']);
        rejoining = true;
      }
    } catch (err) {
      rj = null; // (nothing to rejoin)
    }
    if (!rj || !(Date.now() - rj.at < 10 * 60 * 1000)) return;
    setTimeout(async () => {
      openMp();
      if (!settings.serverPass) return mpMsg('Type the server world\'s passcode once, then join again.', false);
      mpMsg('Rejoining the server world...');
      const ok = await joinWith(new ServerRoom({ onMessage: onNetMessage, onClose: (w, c) => serverDropped(w, c) }), rj.url, null, $('btn-server'), { pass: settings.serverPass, ...(rj.alone ? { alone: true } : {}) });
      rejoining = false;
      const tries = rj.tries + 1;
      if (!ok && tries < 8 && /different versions|did not answer|Could not reach|closed the connection/.test($('mp-msg').textContent)) {
        // The server came back before the website finished publishing the new version (or is still
        // starting): wait a little, then reload and try again.
        mpMsg('The new version of the game is still on its way. Trying again in 20 seconds...');
        setTimeout(() => reloadToRejoin(rj.url, rj.alone, rj.at, tries), 20000);
      }
    }, 600);
  })();

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
  // (0.57.2) Hold the eye to see the passcode; it hides again the moment you let go.
  {
    const peek = $('btn-peek');
    const show = (on) => {
      $('mp-pass').type = on ? 'text' : 'password';
      peek.classList.toggle('on', on);
    };
    peek.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      peek.setPointerCapture(e.pointerId);
      show(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) peek.addEventListener(ev, () => show(false));
    peek.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        show(true);
      }
    });
    peek.addEventListener('keyup', () => show(false));
  }

  // ---------------------------------------------------------------------------
  // (0.57) Your account on the server world: Google first, Discord as well, and the one-time import
  // ---------------------------------------------------------------------------
  const acct = { base: '', cfg: null, info: null, googleMode: 'login', busy: false };
  const acctMsg = (text, ok) => {
    const el = $('acct-msg');
    el.textContent = text || '';
    el.className = 'setting-desc' + (ok === undefined ? '' : ok ? ' ok' : ' bad');
  };
  async function refreshAccount() {
    const base = Online.baseOf($('mp-server').value.trim() || DEFAULT_SERVER);
    acct.base = base;
    let cfg = null;
    try {
      cfg = await Online.call(base, '/auth/config', { auth: false });
    } catch (err) {
      cfg = null; // (no accounts on this server: it takes characters from this browser, as before)
    }
    if (acct.base !== base) return;
    acct.cfg = cfg && (cfg.google || cfg.discord) ? cfg : null;
    acct.info = null;
    if (acct.cfg && Online.sessionFor(base)) {
      try {
        acct.info = (await Online.call(base, '/account')).account;
      } catch (err) {
        if (err.status === 401) Online.setSession(base, '');
      }
    }
    renderAccount();
  }
  function localChars() {
    const out = [];
    for (const c of CLASS_IDS) {
      const sv = loadSave(c);
      if (sv) out.push(`${CLASSES[c].name} level ${sv.level}${sv.rebirth && sv.rebirth.n ? ` (${sv.rebirth.n} rebirth${sv.rebirth.n === 1 ? '' : 's'})` : ''}`);
    }
    return out;
  }
  function renderAccount() {
    const box = $('acct');
    box.classList.toggle('hidden', !acct.cfg);
    if (!acct.cfg) return;
    const inn = !!acct.info;
    $('acct-tag').textContent = inn ? 'Signed in' : 'Signed out';
    $('acct-tag').classList.toggle('in', inn);
    if (inn) Online.cacheName(acct.base, acct.info.name);
    if (mode === 'title') refreshTitle();
    $('acct-out').classList.toggle('hidden', inn);
    $('acct-in').classList.toggle('hidden', !inn);
    $('btn-acct-discord').classList.toggle('hidden', !acct.cfg.discord);
    if (!inn) {
      acct.googleMode = 'login';
      drawGoogle($('acct-google'), 'signin_with');
      return;
    }
    const a = acct.info;
    $('acct-name').textContent = a.name;
    $('acct-ways').textContent = '· ' + [a.google && 'Google', a.discord && 'Discord'].filter(Boolean).join(' and ');
    // add the other way to sign in, or take one away (only while another remains)
    const link = $('acct-link');
    link.innerHTML = '';
    if (!a.google && acct.cfg.google) {
      const g = document.createElement('div');
      link.appendChild(g);
      acct.googleMode = 'link';
      drawGoogle(g, 'continue_with');
      const note = document.createElement('span');
      note.className = 'setting-desc';
      note.textContent = 'Add Google, to sign in with either.';
      link.appendChild(note);
    }
    if (!a.discord && acct.cfg.discord) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'acct-discord';
      b.textContent = 'Add Discord';
      b.addEventListener('click', () => discordSignIn('link'));
      link.appendChild(b);
    }
    if (a.google && a.discord) {
      for (const pv of ['google', 'discord']) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link-btn';
        b.textContent = `Remove ${pv === 'google' ? 'Google' : 'Discord'}`;
        b.addEventListener('click', (e) => armThenRun(e.currentTarget, `Click again: stop signing in with ${pv === 'google' ? 'Google' : 'Discord'}`, () => acctDo('/account/unlink', { provider: pv }, 'Removed.')));
        link.appendChild(b);
      }
    }
    // the one-time import
    const here = localChars();
    const canImport = !a.imported && here.length > 0;
    $('acct-import').classList.toggle('hidden', !canImport);
    if (canImport) {
      $('acct-import-desc').textContent = `Once only, so do it from the browser with your most progress. This browser has: ${here.join(', ')}; ${account.gold} gold and ${account.tickets} shards. They become your online characters (any you have started online are replaced), and copies stay in this browser for playing offline.`;
    }
    const online = Object.entries(a.chars || {}).map(([c, v]) => `${CLASSES[c] ? CLASSES[c].name : c} ${v.level}`);
    $('acct-chars').textContent = online.length ? `Your online characters: ${online.join(' · ')} · ${a.wallet.gold} gold, ${a.wallet.tickets} shards.` : 'No online characters yet. Join to start one, or bring yours from this browser.';
    for (const c in a.chars || {}) Online.cacheChar(acct.base, c, a.chars[c]);
  }
  function drawGoogle(el, text) {
    if (!acct.cfg || !acct.cfg.google) return;
    el.innerHTML = '';
    Online.loadGoogle()
      .then((gid) => {
        gid.initialize({ client_id: acct.cfg.google, callback: (r) => googleSignIn(r.credential), ux_mode: 'popup', auto_select: false });
        gid.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text });
      })
      .catch((err) => acctMsg(err.message, false));
  }
  async function googleSignIn(credential) {
    const mode = acct.googleMode;
    try {
      const r = await Online.call(acct.base, '/auth/google', { method: 'POST', body: { credential, mode }, auth: mode === 'link' });
      if (r.session) Online.setSession(acct.base, r.session);
      acct.info = r.account;
      acctMsg(mode === 'link' ? 'Google added: you can sign in with either now.' : `Signed in. Welcome, ${r.account.name}.`, true);
      renderAccount();
    } catch (err) {
      acctMsg(err.message, false);
    }
  }
  async function discordSignIn(mode) {
    try {
      const d = await Online.discordPopup(acct.base, mode);
      if (d.session) Online.setSession(acct.base, d.session);
      if (d.ticket) await Online.call(acct.base, '/auth/discord/link', { method: 'POST', body: { ticket: d.ticket } });
      acctMsg(mode === 'link' ? 'Discord added: you can sign in with either now.' : 'Signed in with Discord.', true);
      await refreshAccount();
    } catch (err) {
      acctMsg(err.message, false);
    }
  }
  async function acctDo(path, body, okText) {
    try {
      const r = await Online.call(acct.base, path, { method: 'POST', body });
      if (r.account) acct.info = r.account;
      acctMsg(okText, true);
      renderAccount();
      return r;
    } catch (err) {
      acctMsg(err.message, false);
      return null;
    }
  }
  $('btn-acct-discord').addEventListener('click', () => discordSignIn('login'));
  /**
   * (0.57.1) Play alone: your online character on the server world, in a Haven of your own, so a
   * signed-in player has one character everywhere (playing alone in the browser keeps its own).
   */
  async function playAlone(url, button) {
    const pass = ($('mp-pass').value || settings.serverPass || '').trim();
    if (!pass) {
      openMp();
      mpMsg('Type the server world\'s passcode once (ask whoever runs it), then Play alone.', false);
      return;
    }
    settings.serverPass = pass;
    storeSettings(settings);
    if (mode !== 'mp') openMp();
    mpMsg('Going online...');
    const ok = await joinWith(new ServerRoom({ onMessage: onNetMessage, onClose: (w, c) => serverDropped(w, c) }), url, null, button, { pass, alone: true });
    if (!ok && mode !== 'mp') openMp();
  }
  $('btn-acct-alone').addEventListener('click', (e) => playAlone($('mp-server').value.trim() || DEFAULT_SERVER, e.currentTarget));
  $('btn-online').addEventListener('click', async (e) => {
    // (0.57.2) Explore online: the server world with everyone, as your online character
    const pass = (settings.serverPass || '').trim();
    if (!pass) {
      openMp();
      mpMsg('Type the server world\'s passcode once (ask whoever runs it), then join.', false);
      return;
    }
    mpMsg('Joining the server world...');
    const ok = await joinWith(new ServerRoom({ onMessage: onNetMessage, onClose: (w, c) => serverDropped(w, c) }), DEFAULT_SERVER, null, e.currentTarget, { pass });
    if (!ok) {
      const why = $('mp-msg').textContent;
      openMp();
      mpMsg(why, false);
    }
  });
  $('btn-acct-out').addEventListener('click', async () => {
    try {
      await Online.call(acct.base, '/auth/logout', { method: 'POST', body: {} });
    } catch (err) {
      /* signed out here either way */
    }
    Online.setSession(acct.base, '');
    Online.cacheName(acct.base, '');
    acct.info = null;
    acctMsg('Signed out.');
    renderAccount();
  });
  $('btn-acct-import').addEventListener('click', (e) => armThenRun(e.currentTarget, 'Click again: bring them (once only)', async () => {
    const saves = {};
    for (const c of CLASS_IDS) {
      const sv = loadSave(c);
      if (sv) saves[c] = sv;
    }
    const r = await acctDo('/account/import', { saves, wallet: { gold: account.gold, tickets: account.tickets, rebirths: account.rebirths || 0 } }, 'Your characters are online now. Join the server world to play them.');
    if (r) acctMsg(`Brought over: ${r.classes.map((c) => CLASSES[c].name).join(', ')}. Join the server world to play them.`, true);
  }));
  $('mp-server-pick').addEventListener('change', () => refreshAccount());
  $('mp-server').addEventListener('change', () => refreshAccount());
  $('btn-mp').addEventListener('click', () => refreshAccount());
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
  const MAP_NAME = (id) => (MAPS[id] ? MAPS[id].name : id === 'rift' ? 'an Echo Rift' : id === 'delve' ? 'a delve' : id === 'ring' ? 'the Echo Ring' : id);
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
      if (!mine) btn = `<button type="button" data-act="inspect" data-pid="${pl.pid}" class="ghost" title="Their gear, combat power and talents">Inspect</button>`; // (0.62)
      if (!mine && r.invites.includes(pl.pid)) btn += `<button type="button" data-act="partyAccept" data-pid="${pl.pid}" class="primary">Accept invite</button><button type="button" data-act="partyDecline" data-pid="${pl.pid}" class="ghost">No</button>`;
      else if (!mine && inParty) btn += `<button type="button" data-act="joinMember" data-pid="${pl.pid}" class="ghost" title="Travel to their map, into their copy of it (a map you have been to)">Go to them</button>`;
      else if (!mine && !(r.party && r.party.members.length >= 4)) btn += `<button type="button" data-act="partyInvite" data-pid="${pl.pid}" class="ghost">Invite</button>`;
      return `<tr class="${mine ? 'me' : ''}${inParty ? ' party' : ''}"><td>${esc(pl.name)}${pl.title ? ` <span class="title-tag">${esc(pl.title)}</span>` : ''}${mine ? ' (you)' : ''}${inParty ? ' <span class="tag">party</span>' : ''}</td><td>${pl.cls ? esc(CLASSES[pl.cls] ? CLASSES[pl.cls].name : pl.cls) : ''} ${pl.level || ''}</td><td>${esc(where(pl))}</td><td>${btn}</td></tr>`;
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
  /** (0.62) Another player's gear, combat power and talents, from the server. */
  function showInspect(msg) {
    let box = $('inspect-panel');
    if (!box) {
      box = document.createElement('div');
      box.id = 'inspect-panel';
      box.className = 'hidden';
      document.body.appendChild(box);
      box.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="close"]')) {
          box.classList.add('hidden');
          tooltip.hide();
        }
      });
    }
    if (msg.gone || !msg.who) {
      box.innerHTML = '<p>They are not here any more.</p><button type="button" data-act="close" class="ghost">Close</button>';
      box.classList.remove('hidden');
      return;
    }
    const w = msg.who;
    const spec = w.spec && SPECS[w.spec];
    const tree = spec ? spec.talents : [];
    const picked = tree.filter((t) => w.talents && w.talents[t.id] > 0);
    const rows = { minor: 'Minor', major: 'Major', capstone: 'Capstone' };
    const talents = picked.length
      ? Object.keys(rows).map((row) => {
          const ts = picked.filter((t) => t.row === row);
          return ts.length ? `<div class="insp-row"><span class="insp-rowname">${rows[row]}</span>${ts.map((t) => `<span class="insp-tal" title="${esc(typeof t.desc === 'function' ? t.desc(w.talents[t.id]) : t.desc)}">${esc(t.name)} <b>${w.talents[t.id]}/${t.max}</b></span>`).join('')}</div>` : '';
        }).join('')
      : '<p class="setting-desc">No talents taken yet.</p>';
    box.innerHTML = `<div class="insp-head"><div><h3>${esc(w.name)}${w.title ? ` <span class="title-tag">${esc(w.title)}</span>` : ''}</h3>
      <div class="setting-desc">${esc(CLASSES[w.cls] ? CLASSES[w.cls].name : w.cls)}${spec ? ` · ${esc(spec.name)}` : ''} · level ${w.level}${w.wish ? ` · Wishborne ${w.wish}` : ''}${w.rebirths ? ` · reborn ${w.rebirths}×` : ''}</div></div>
      <div class="insp-cp"><b>${Math.round(w.cp).toLocaleString()}</b><span>Combat power</span><small>Might ${Math.round(w.might).toLocaleString()} · Resolve ${Math.round(w.resolve).toLocaleString()}</small></div></div>
      <h4>Gear</h4><div class="insp-gear"></div><h4>Talents</h4>${talents}
      <button type="button" data-act="close" class="ghost">Close</button>`;
    const gear = box.querySelector('.insp-gear');
    for (const slot of [...SLOTS, 'keepsake']) {
      const it = slot === 'keepsake' ? w.keepsake : w.equipped[slot];
      if (slot === 'keepsake' && !it) continue;
      const cell = itemCell(tooltip, it || null, {});
      const wrap = document.createElement('div');
      wrap.className = 'insp-slot';
      wrap.appendChild(cell);
      const lab = document.createElement('span');
      lab.textContent = slot === 'keepsake' ? 'Keepsake' : SLOT_NAMES[slot];
      wrap.appendChild(lab);
      gear.appendChild(wrap);
    }
    box.classList.remove('hidden');
  }
  function closePlayers() {
    playersOpen = false;
    playersPanel.classList.add('hidden');
  }
  function togglePlayers() {
    playersOpen = !playersOpen;
    playersPanel.classList.toggle('hidden', !playersOpen);
    if (playersOpen) renderPlayers();
    if (playersOpen && !settings.knowsPlayers) {
      settings.knowsPlayers = true; // (0.75.4) they have found it: no more reminders
      storeSettings(settings);
    }
  }

  /**
   * (0.75.4) A check in the middle of the screen before something that cannot be taken back. Its button
   * ignores clicks for a moment after it opens, so a double-click on what opened it does not go through.
   */
  function confirmModal({ title, html, ok = 'Confirm', cancel = 'Cancel', onOk }) {
    let box = $('confirm-modal');
    if (!box) {
      box = document.createElement('div');
      box.id = 'confirm-modal';
      box.className = 'hidden';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      document.body.appendChild(box);
    }
    box.innerHTML = `<div class="cm-card"><h3>${esc(title)}</h3><div class="cm-body">${html}</div><div class="cm-btns"><button type="button" class="ghost" data-act="no">${esc(cancel)} <kbd>Esc</kbd></button><button type="button" class="primary" data-act="yes" disabled>${esc(ok)}</button></div></div>`;
    box.classList.remove('hidden');
    tooltip.hide();
    const yes = box.querySelector('[data-act="yes"]');
    setTimeout(() => (yes.disabled = false), 450);
    box.onclick = (e) => {
      const b = e.target.closest('button');
      if (e.target === box || (b && b.dataset.act === 'no')) return closeConfirm();
      if (b && b.dataset.act === 'yes' && !b.disabled) {
        closeConfirm();
        onOk();
      }
    };
  }
  function closeConfirm() {
    const box = $('confirm-modal');
    if (box) box.classList.add('hidden');
  }

  /**
   * (0.75.4) Escape closes the pop-up on top first (a check, a player's gear, the players list, augment
   * priority), and only then pauses or leaves a screen. True if it closed one.
   */
  function closeTopOverlay() {
    const open = (id) => $(id) && !$(id).classList.contains('hidden');
    if (open('confirm-modal')) return closeConfirm(), true;
    if (open('inspect-panel')) {
      $('inspect-panel').classList.add('hidden');
      tooltip.hide();
      return true;
    }
    if (open('augpri')) return $('augpri').classList.add('hidden'), true;
    if (playersOpen) return closePlayers(), true;
    return false;
  }
  document.addEventListener('keydown', (e) => {
    if (!net || !net.server || mode !== 'play') return;
    if (net.alone) return; // (0.57.1) playing alone: no chat, no players panel
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing) return;
    if (e.key === 'Enter' && world.mode === 'arena' && world.wave && world.wave.phase === 'intermission') return; // (0.59) in the Ring, Enter starts the next wave
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
    const btns = [...document.querySelectorAll('#talk-quests .quest button.primary:not([disabled]):not(.no-quick)')]; // (0.80) never a spend or a Tide by G
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
    interact(target = null) {
      if (mode === 'talk') return quickQuest(null);
      if (mode === 'read') return setMode('play');
      if (mode !== 'play') return;
      pendingTalk = null;
      const near = target || world.interactable();
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
        if (near.kind === 'npc') speak(near.id, 'greet', 1); // (0.99) they greet you out loud
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
      if (closeTopOverlay()) return; // (0.75.4) a pop-up first
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
      voice.muted = !!settings.muted;
      storeSettings(settings);
      hud.feedText(settings.muted ? 'Sound off' : 'Sound on');
    },
    attackMoveNear: () => (settings.attackMoveNear === 'hero' ? 'hero' : 'cursor'),
    heldAim: () => settings.heldAim !== false, // (0.61.2) Deadeye aims while R is held
    skillPreview: () => settings.skillPreview !== false, // (0.99.4) every skill shows where it lands while held
    shoulderTip: (text) => { // (0.89) a word over the shoulder (right-click does not walk)
      if (!shoulderUi) return;
      const tip = shoulderUi.querySelector('.sh-tip');
      tip.textContent = text;
      tip.classList.add('show');
      clearTimeout(shoulderTipT);
      shoulderTipT = setTimeout(() => tip.classList.remove('show'), 2200);
    },
    nextWaveKey: () => nextWaveKey(), // (0.62) the Ring's next-wave key, chosen in the menu
    /** Keys that belong to an open menu. Returns true if the key was used. */
    menuKey(key) {
      if (key === 'h' && mode === 'play' && world.ring && !$('ring-bank').classList.contains('hidden')) return ringLeave() || true; // (0.59)
      // (0.58) H: home from a rift that is over
      if (key === 'h' && mode === 'play' && world.rift && world.rift.state === 'done' && world.map.id === 'rift') {
        $('rift-home').classList.remove('hidden');
        return riftHome() || true;
      }
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
  function startFresh() {
    backupNow('before starting fresh');
    clearAllOffline();
    for (const k of Object.keys(account)) delete account[k];
    Object.assign(account, { gold: 0, tickets: CONFIG.START_TICKETS, signs: [] });
    account.casebook = Casebook.freshBook(null);
    storeAccount(account);
    settings.backupSeen = (loadBackups().best || {}).t; // a deliberate fresh start: no "missing progress?" note
    storeSettings(settings);
    save = null;
    world = makeWorld({ save });
    resetViews();
    caseBadge();
    refreshTitle();
    $('title-save').textContent = 'Everything offline in this browser is gone: a fresh start. (A backup was kept, under Move saves, in case you change your mind.)';
  }
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
  $('btn-continue').addEventListener('click', () => (save ? enterTown() : startRun(null)));
  $('btn-title-weekly').addEventListener('click', () => {
    // (0.60) straight to the Weekly Echo from the title screen
    if (!save) save = loadSave(settings.cls);
    world = makeWorld({ save });
    openTrial();
  });
  $('btn-explore-offline').addEventListener('click', () => startExplore());
  $('btn-online-alone').addEventListener('click', (e) => playAlone(DEFAULT_SERVER, e.currentTarget));
  $('btn-signin').addEventListener('click', () => {
    openMp();
    refreshAccount().then(() => $('acct').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  });
  // (0.57.2) Start fresh: every offline hero, gold, shards, rebirths and Ex Voto in this browser go
  // (a backup is kept first). Online characters, settings and the sign-in are not touched.
  $('btn-fresh').addEventListener('click', (e) => armThenRun(e.currentTarget, 'Click again: delete every offline hero, gold and rebirth in this browser', startFresh));
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
  // (1.0) the journal's right side: the quests you could take up, or what the road remembers
  for (const [btn, show] of [['jt-avail', 'journal-avail'], ['jt-lore', 'journal-lore-wrap']]) $(btn).addEventListener('click', () => {
    for (const [b, el] of [['jt-avail', 'journal-avail'], ['jt-lore', 'journal-lore-wrap']]) { $(b).classList.toggle('on', b === btn); $(el).classList.toggle('hidden', el !== show); }
  });
  $('btn-casebook').addEventListener('click', () => actions.toggleCasebook());
  caseBadge();
  $('btn-journal-casebook').addEventListener('click', () => actions.toggleCasebook());
  $('case-world').addEventListener('change', (e) => {
    caseWorld = Number(e.target.value) || 0; // (0.66) 0: wherever you are
    renderCasebook();
  });
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
      if (net.server && world.mode === 'arena') {
        // (0.59) leave an Echo Ring run: home to Haven with the spoils
        applyNow({ type: 'ringLeave' });
        setMode('play');
        return;
      }
      if (net.server) {
        // (0.56.4) wait for the server's last save first
        const was = net;
        $('btn-town').disabled = true;
        finalSave(was).then(() => {
          $('btn-town').disabled = false;
          if (net === was) leaveRoom('You left the server world. Your progress is saved.');
        });
        return;
      }
      leaveRoom(net.role === 'host' ? 'You closed the room.' : 'You left the room.');
      return;
    }
    if (world.mode === 'explore') {
      persist();
      setMode('title');
    } else {
      if (world.ring && !world.gameOver) applyNow({ type: 'ringLeave' }); // (0.59) the spoils come home
      enterTown();
    }
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
  $('volume').value = Math.round(settings.volume * 100);
  $('volume').addEventListener('input', (e) => {
    settings.volume = e.target.value / 100;
    sfx.setVolume(settings.volume);
    storeSettings(settings);
  });
  $('volume').addEventListener('change', () => sfx.parry(false));
  $('voice-volume').value = Math.round((settings.voiceVolume ?? 0.8) * 100); // (0.99)
  $('voice-volume').addEventListener('input', (e) => {
    settings.voiceVolume = e.target.value / 100;
    voice.volume = settings.voiceVolume;
    storeSettings(settings);
  });
  $('voice-volume').addEventListener('change', () => voice.say(['wren', 'bram', 'pip', 'bastian'][Math.floor(Math.random() * 4)], 'greet', 2));
  $('music-volume').value = Math.round((settings.musicVolume ?? 0.25) * 100);
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
  // (0.62) the Ring's next-wave key, and starting the next wave by itself
  const nwk = $('next-wave-key');
  nwk.value = nextWaveKey() || 'enter';
  nwk.addEventListener('change', (e) => {
    settings.nextWaveKey = e.target.value;
    storeSettings(settings);
    hud.nextWaveLabel = nextWaveLabel();
    hud.nextWaveKeyName = (nextWaveKey() || 'Enter').toUpperCase();
  });
  // (0.66) augment priority
  const openAugPri = () => { renderAugPriority(); $('augpri').classList.remove('hidden'); };
  $('btn-augpri').addEventListener('click', openAugPri);
  $('btn-augpri-set').addEventListener('click', openAugPri);
  $('btn-augpri-close').addEventListener('click', () => $('augpri').classList.add('hidden'));
  $('augpri-auto').addEventListener('change', (e) => {
    settings.autoAug = e.target.checked;
    storeSettings(settings);
    if (settings.autoAug && mode === 'augment') { autoSent = ''; if (autoAugment()) { $('augpri').classList.add('hidden'); } }
  });
  $('btn-augpri-reset').addEventListener('click', () => {
    settings.augOrder = Object.assign({}, settings.augOrder, { [world.cls]: undefined });
    storeSettings(settings);
    renderAugPriority();
  });
  $('augpri-list').addEventListener('click', (e) => {
    const up = e.target.closest('[data-up]'), down = e.target.closest('[data-down]');
    const order = augOrder();
    if (up) moveAug(up.dataset.up, order.indexOf(up.dataset.up) - 1);
    if (down) moveAug(down.dataset.down, order.indexOf(down.dataset.down) + 1);
  });
  let augDrag = null;
  $('augpri-list').addEventListener('dragstart', (e) => { const r = e.target.closest('.augpri-row'); augDrag = r && r.dataset.id; if (r) r.classList.add('dragging'); });
  $('augpri-list').addEventListener('dragover', (e) => e.preventDefault());
  $('augpri-list').addEventListener('drop', (e) => {
    e.preventDefault();
    const r = e.target.closest('.augpri-row');
    if (augDrag && r && r.dataset.id !== augDrag) moveAug(augDrag, augOrder().indexOf(r.dataset.id));
    augDrag = null;
  });
  $('augpri-list').addEventListener('dragend', () => { augDrag = null; });
  $('auto-wave').checked = !!settings.autoWave;
  $('auto-wave').addEventListener('change', (e) => {
    settings.autoWave = e.target.checked;
    storeSettings(settings);
  });
  hud.nextWaveLabel = nextWaveLabel();
  hud.nextWaveKeyName = (nextWaveKey() || 'Enter').toUpperCase();
  // (0.89) how fast the view turns over the shoulder
  input.sens = Number(settings.lookSens) || 1;
  $('look-sens').value = String(input.sens);
  $('look-sens-val').textContent = `${input.sens.toFixed(1)}×`;
  $('look-sens').addEventListener('input', (e) => {
    input.sens = Number(e.target.value) || 1;
    settings.lookSens = input.sens;
    $('look-sens-val').textContent = `${input.sens.toFixed(1)}×`;
    storeSettings(settings);
  });
  $('skill-preview').checked = settings.skillPreview !== false; // (0.99.4)
  $('skill-preview').addEventListener('change', (e) => {
    settings.skillPreview = e.target.checked;
    storeSettings(settings);
  });
  $('held-aim').checked = settings.heldAim !== false; // (0.61.2)
  $('held-aim').addEventListener('change', (e) => {
    settings.heldAim = e.target.checked;
    storeSettings(settings);
  });
  $('auto-attack').checked = settings.autoAttack !== false;
  $('auto-attack').addEventListener('change', (e) => {
    settings.autoAttack = e.target.checked;
    storeSettings(settings);
    if (!net || net.role === 'host') world.player.autoAttack = settings.autoAttack; // a joiner's goes to the host below
    world.command({ type: 'setAutoAttack', on: settings.autoAttack });
  });
  $('dmg-numbers').value = settings.dmgNumbers || 'fewer'; // (0.72.1)
  $('dmg-numbers').addEventListener('change', (e) => {
    settings.dmgNumbers = e.target.value;
    storeSettings(settings);
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
  /**
   * (0.61.1) Gear changes where you can see them (above the gear panel), with the Combat Power they
   * gained or lost. `cpSeen` is the Combat Power last shown or measured.
   */
  let cpSeen = null, cpCheckAt = 0;
  const gearToastLines = [];
  function measureCp() {
    try {
      return steadyRatings(world).cp;
    } catch (err) {
      return null;
    }
  }
  let autoScrapSum = null; // (0.75.3) auto-scrapped gear, added up for one line
  function gearToast(html, color = null) {
    if (!world || world.trial) return;
    const cp = measureCp();
    const d = cp != null && cpSeen != null ? cp - cpSeen : 0;
    if (cp != null) cpSeen = cp;
    const box = $('gear-toast');
    const el = document.createElement('div');
    el.className = 'gt-line';
    el.innerHTML = `<span${color ? ` style="color:${color}"` : ''}>${html}</span>${d ? `<b class="${d > 0 ? 'up' : 'down'}">Combat Power ${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString()}</b>` : ''}`;
    box.appendChild(el);
    gearToastLines.push(el);
    while (gearToastLines.length > 4) gearToastLines.shift().remove();
    setTimeout(() => el.classList.add('fade'), 3200);
    setTimeout(() => {
      el.remove();
      const i = gearToastLines.indexOf(el);
      if (i >= 0) gearToastLines.splice(i, 1);
    }, 4000);
  }
  let lastGapNote = 0; // (0.61) when the level-gap reminder last showed
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
    voiceEvent(ev); // (0.99)
    const p = world.player;
    switch (ev.type) {
      case 'waveStart':
        $('ring-bank').classList.add('hidden'); // (0.59) pushed on
        tune();
        hud.banner(`Wave ${ev.n}`, ev.boss ? `An echo of ${ev.bossName} rises` : ev.n === 1 ? 'The stones remember' : '');
        if (ev.n === 1) hintOnce('ring', 'The Echo Ring calls up what the mountain remembers. Echoes fall like anything else; they just keep coming.', 9);
        sfx.wave(ev.boss);
        if (ev.n === 1) hintOnce('move', 'Right-click the ground to move. Right-click an enemy to attack it.', 7);
        if (ev.boss) hintOnce('boss', 'Parry the boss three times to break its guard. Get clear of the red slam.', 9);
        break;
      case 'waveClear': {
        tune();
        if (settings.autoWave && world.mode === 'arena') autoWaveAt = performance.now() + 900; // (0.62) push on by itself
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
      case 'augmentsAll':
        hud.banner(`All ${ev.n} augments are yours`, 'You were owed more picks than there are augments left to take, so you have every one.');
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
        sfx.ping(); // (0.72)
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
          if (showNumber(ev)) hud.float(renderer, ev.x, 2.3, ev.z, shortNum(ev.amount), (ev.crit ? 'crit' : ev.dot ? 'dot' : '') + (ev.far ? ' far' : '') + (ev.amount >= 1e5 ? ' huge' : ''));
        } else {
          sfx.hurt();
          hud.float(renderer, ev.x, 2.6, ev.z, '-' + shortNum(ev.amount), 'hurt');
        }
        break;
      case 'heal':
        hud.float(renderer, ev.x, 2.8, ev.z, '+' + ev.amount, 'heal');
        break;
      case 'bloodOath':
        sfx.oathOn(); // (0.72)
        hud.screenFlash(0.15);
        break;
      case 'deathMark':
        sfx.deathMark();
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
      case 'iceGuard':
        sfx.iceWall(); // (0.72) Glacier Spin
        break;
      case 'buffEnd':
        if (/Oath/.test(ev.name || '')) sfx.oathOff(); // (0.72)
        break;
      case 'shadowSwap':
        sfx.cast('e');
        break;
      case 'wallShatter':
        sfx.impact();
        break;
      case 'wallRise':
        sfx.slam();
        sfx.iceWall(); // (0.72) and the ice in it
        break;
      case 'swing':
        sfx.swing();
        break;
      case 'cast':
        if (ev.slot === 'dodge') {
          sfx.cast('e'); // (0.89) the incarnate god's roll (no slot on the bar)
          break;
        }
        if (ev.seraph) sfx.seraph(ev.seraph); // (0.93) the Seraph's own
        else if (ev.seraphRel) {
          /* (0.93) the gathered skill landing: seraphFx sounds it */
        } else if (world.player && world.player.possess && !ev.echo && ev.slot === 'e' && ev.fx === 'dash') sfx.seraph('glide');
        else if (ev.fx === 'deadeye') {
          sfx.sniper(!!ev.echo); // (0.93: the shadow's copy quieter)
          if (!ev.echo) hud.screenFlash(0.25); // (0.81.3) the twin shadow's copy is quieter
        } else if (ev.fx === 'focus') sfx.breath();
        else if (ev.fire) sfx.fireBreath(); // (0.72)
        else if (ev.pull) sfx.pullIn();
        else if (ev.fx === 'frenzy') sfx.oathOn();
        else if ((ev.slot === 'd' || ev.slot === 'f') && ev.fx === 'meteor') sfx.lob();
        else if (ev.echo || ev.shade) sfx.skill(ev.fx, 'q'); // (0.93) a shade's copy: never an ultimate's boom
        else sfx.skill(ev.fx, ev.slot); // (0.93) each kind of skill its own sound, an ultimate heavier
        if (!ev.echo) hud.flashSlot(ev.slot);
        break;
      case 'seraphFx':
        // (0.93) the Seraph's skills landing, and its strike
        sfx.seraph({ descent: 'rise', choir: 'lance', halo: 'wings', hand: 'wind', rain: 'wind', ray: 'strike' }[ev.kind] || ev.kind); // (0.94: the new skills)
        if (ev.kind === 'lance' || ev.kind === 'wings') hud.flashSlot(ev.slot);
        break;
      case 'cloneStrike':
        if (ev.last) sfx.impact(); else sfx.hit(); // (0.81.3) Ember Clones
        break;
      case 'mirrorCrack':
        sfx.mirrorCrack();
        break;
      case 'mirrorBreak':
        sfx.shatter();
        hud.float(renderer, ev.x, 3, ev.z, 'Mirror shattered', 'word perfect');
        break;
      case 'impact':
        if (ev.seraph || ev.kind === 'hand') {
          sfx.seraph('descent'); // (0.93) the Seraph's Descent lands
          break;
        }
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
        // Ex Voto: a death close to your hero is one you helped with (in the Echo Ring, all of them).
        if (world.mode === 'arena' || Casebook.near(world.player, ev.x, ev.z, Casebook.RANGES.kill)) caseNote('kill', ev.enemyType, { remnant: ev.remnant, old: ev.old });
        break;
      case 'partyJoin':
        sfx.ui();
        hud.feedText(`${ev.name} joined the party`);
        if (world.treasureSense && world.treasureSense() > 1) hud.feedText(`Treasure Sense: with a Rogue in the party, gear drops ${Math.round((world.treasureSense() - 1) * 100)}% more often for everyone.`); // (0.94)
        updateRoomBadge();
        break;
      case 'partyLeave':
        hud.feedText(`${ev.name} left the party`);
        updateRoomBadge();
        break;
      case 'mastered': {
        // (0.70.2) after the ending's own banner: what it means for the other classes
        const text = `Your other classes may now borrow a skill from the ${ev.specs.join(' and the ')}, on D and F. Choose them in Talents, under Mastery.`;
        hud.feedText(`The ${ev.name} is mastered`);
        setTimeout(() => hud.banner(`The ${ev.name} is mastered`, text), 6000);
        break;
      }
      case 'tierUnlocked':
        if (ev.all) hud.banner('Every world tier is open', 'The Cinder has fallen: tiers I to V are yours to choose at the Waygate in Haven, in this life and every one after.');
        else hud.banner(`World tier ${ev.numeral} unlocked`, `${ev.name} · choose it at the Waygate in Haven`);
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
        showRiftHome(ev.won);
        break;
      }
      case 'riftEnd':
        hud.feedText('You left the rift.');
        break;
      case 'autoScrapNew': {
        // (0.75.3) gear auto-scrapped as it came: added up, one quiet line a moment
        const A = (autoScrapSum = autoScrapSum || { n: 0, scrap: 0, dust: 0, t: null });
        A.n++;
        A.scrap += ev.scrap;
        A.dust += ev.dust;
        if (!A.t) A.t = setTimeout(() => {
          hud.feedText(`Auto-scrapped ${A.n} piece${A.n > 1 ? 's' : ''}: +${A.scrap.toLocaleString()} scrap${A.dust ? `, +${A.dust} Wishdust` : ''}`);
          if (mode === 'gear') refreshMenus();
          autoScrapSum = null;
        }, 1500);
        break;
      }
      case 'itemLocked':
        // (0.75.2); (0.75.3) shown over the gear screen as well, where it is done, not only behind it
        hud.feedText(`${ev.name} ${ev.locked ? 'locked: nothing can use it up now' : 'unlocked'}`);
        gearToast(`<b>${esc(ev.name)}</b> ${ev.locked ? 'locked: nothing can scrap, feed, trade or drop it now' : 'unlocked'}`, ev.locked ? '#ffd24a' : '#9aa3b5');
        sfx.upgrade();
        break;
      case 'itemIsLocked':
        hud.feedText(`${ev.name} is locked. Unlock it first (Alt+click, or Lock items).`);
        gearToast(`<b>${esc(ev.name)}</b> is locked, so it was kept. Unlock it first (Alt+click, or Lock items).`, '#ffd24a');
        sfx.denied();
        break;
      case 'giftBound':
        hud.feedText(`${ev.name} was a gift: it stays with you.`);
        sfx.denied();
        break;
      case 'weeklyReward':
        hud.banner('The Weekly Echo', `${ev.weeks ? `For taking part${ev.weeks > 1 ? ` (${ev.weeks} weeks)` : ''}: +${ev.fragments} Immortal Fragments, +${ev.dust} Wishdust, +${ev.tickets} starglass shards` : ''}${ev.champion ? `${ev.weeks ? '. ' : ''}A Champion: the Echo Champion glow is yours` : ''}`);
        sfx.levelUp();
        break;
      case 'ringGain':
        if (ev.boss) showRingBank(ev);
        break;
      case 'ringDrop': {
        // (0.65) every wave pays as it falls
        const r = { kind: ev.kind, slot: ev.slot };
        hud.feedText(`Wave ${ev.wave}: +${ringText(r, ev.n)}${ev.immortals ? `, ${ev.immortals} of them Immortal` : ''}${ev.scrapped ? ` (${ev.scrapped} scrapped for want of room)` : ''}.`);
        if (ev.immortals) hud.banner('An Immortal from the Ring', `${ev.immortals} Immortal ${r.slot === 'chest' ? 'armor' : r.slot}${ev.immortals > 1 ? 's' : ''}`);
        sfx.pickup(ev.immortals ? 6 : 3);
        break;
      }
      case 'ringDeep': {
        // (0.66) the deep waves ask for Ember, then Animus
        const p = world.player;
        const myE = world.ember ? Math.round(world.ember(p)) : 0;
        if (ev.animus) hud.banner(`Wave ${ev.n}: the Granted come`, `Echoes now carry Ember ${ev.ember} (you have ${myE}) and ask for ${Math.round(ev.animus * 100)}% Animus (you have ${Math.round((p.animus || 0) * 100)}%). Short of either, they hit harder and you hit softer; short of Animus, their Dominions are nearly impossible.`);
        else hud.banner(`Wave ${ev.n}: Ember ${ev.ember}`, `From here the echoes carry Ember, as in the Deep (you have ${myE}). It rises every wave: give gear up at rebirth for more.`);
        break;
      }
      case 'ringCatchUp':
        hud.banner(`${ev.picks} augment${ev.picks === 1 ? '' : 's'} to choose`, `Starting at wave ${ev.from} costs you nothing: pick what waves 1 to ${ev.from - 1} would have offered.`);
        break;
      case 'ringPaid': {
        const r = { kind: ev.kind, slot: ev.slot };
        const got = ev.n ? ringText(r, ev.n) : 'nothing yet';
        hud.feedText(`In all, the Ring gave you ${got}${ev.immortals ? ` (the last ${ev.immortals} Immortal)` : ''}${ev.scrapped ? ` (${ev.scrapped} scrapped for want of room)` : ''}.`);
        if (ev.immortals) hud.banner('An Immortal from the Ring', `${ev.immortals} Immortal ${r.slot === 'chest' ? 'armor' : r.slot}${ev.immortals > 1 ? 's' : ''}`);
        lastRingPaid = { got, wave: ev.wave };
        break;
      }
      case 'lootSwept':
        hud.feedText(`The rift's spoils came with you: ${ev.got} piece${ev.got === 1 ? '' : 's'}${ev.scrapped ? `, and ${ev.scrapped} scrapped for want of room` : ''}.`);
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
        if (net && net.online) {
          // (0.57) an online character's new life is kept by the server
          sfx.levelUp();
          hud.banner('Reborn', 'Your online character wakes in Haven, a new life.');
          break;
        }
        // Rebirth (0.43): keep a backup, store the new life, and wake in Haven.
        backupNow('before a rebirth');
        account.rebirths = (account.rebirths || 0) + 1;
        if (world.player.keep) account.keep = world.player.keep; // (0.80) the keep is the account's: it waits for the new life
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
        if (mode === 'talents') renderTalents(); // (0.75.5) online the points arrive after the click: show them
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
        hud.feedText(`A glimmer remembers: "${ev.title}" (${ev.found} of ${SIGN_IDS.length})`);
        if (!account.signs.includes(ev.id)) {
          account.signs.push(ev.id); // (0.56.4) read once, for every class and every life
          saveBook();
        }
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
        // (0.47) Tomas lies down, or walks on ((0.58.1) on the server this game's own copy lets him go too)
        world.map.obstacles = world.obstacles = world.obstacles.filter((o) => o.id !== ev.id);
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
      case 'partyEchoes':
        // (0.61) the lore of sharing a map
        hintOnce('partyEchoes', 'Wishes answered together. Where more than one of you walks a road, its echoes wake sooner, enough for each of you to hold a stretch of it. But the great ones feel every wish raised against them, and grow to meet it: a boss gains health and steadiness for each hero beside you. Together you still bring it down faster than alone.', 14);
        break;
      case 'partyBoss':
        hud.feedText(`${ev.name} feels ${ev.n} wishes against it: ${Math.round(ev.hp * 100)}% health, and harder to stagger.`);
        hintOnce('partyEchoes', 'Wishes answered together. Where more than one of you walks a road, its echoes wake sooner, enough for each of you to hold a stretch of it. But the great ones feel every wish raised against them, and grow to meet it: a boss gains health and steadiness for each hero beside you. Together you still bring it down faster than alone.', 14);
        break;
      case 'farLevel': {
        // (0.61) the first time a longer word; after that, a reminder at most every 30 seconds, for 5
        const text = ev.gap < 0 ? 'These enemies are well below your level: they pay little EXP. Enemies within 3 levels of you pay ten times as much; head somewhere tougher.' : 'These enemies are well above your level: they pay less EXP than ones within 3 levels of you, which pay ten times as much.';
        const now = performance.now();
        if (!hints.levelband) {
          hintOnce('levelband', text, 10);
          lastGapNote = now;
        } else if (now - lastGapNote >= 30000) {
          lastGapNote = now;
          hud.hint(ev.gap < 0 ? `Still ${-ev.gap} levels below you: little EXP here. Enemies within 3 levels pay ten times as much.` : `${ev.gap} levels above you: less EXP than enemies within 3 levels of you.`, 5);
        }
        break;
      }
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
      case 'emberGift':
        sfx.levelUp();
        hud.banner(`+${ev.amount} Ember`, `What you have let go of protects you in the Deep. Your Ember is ${ev.ember}, and it stays with you through every rebirth.`);
        break;
      case 'emberShort':
        if (!ev.self || ev.self === world.player) hud.banner('It does not count', `Someone here met the Ember ${ev.need} that ${ev.name} asks (you have ${ev.have}). Being carried down is not the same: beat it on your own terms to count it.`);
        break;
      case 'carryWarn': // (0.63) told early, before the fight, so nobody wastes a night on it
        if (ev.id == null || ev.id === world.player.id) hud.banner(`Depth ${ev.depth} will not count for you`, `You have Ember ${ev.have} of the ${ev.need} it asks, and ${ev.by} has it. Beaten beside them, its Primordial gives you no quest and no Mastery. Come down on your own, or with others short of it too.`);
        break;
      case 'emberDefied': // (0.62) under-Embered, and it still counts
        if (!ev.self || ev.self === world.player) hud.banner('Beaten under-Embered', `${ev.name} counts: Ember ${ev.have} of the ${ev.need} it asks. The Deep will remember that.`);
        break;
      // Mind-Locked and Dominion (0.64, the Granted)
      case 'mindLock':
        mindLockShow(ev.time, ev.short);
        sfx.slam();
        hud.screenFlash(ev.short ? 0.45 : 0.18);
        hintOnce('mindlock', 'Mind-Locked: you cannot move or act. Watch the ring: when it cracks, press parry to break free. Press too soon and it holds longer. Animus (from Mastery) shortens every lock.', 9);
        break;
      case 'lockCrack':
        mindLockCrack();
        break;
      case 'lockSlip':
        mindLockSlip();
        sfx.denied();
        break;
      case 'lockEnd':
        mindLockHide();
        if (ev.broken) {
          sfx.parry(true);
          hud.float(renderer, ev.x, 3.1, ev.z, 'Broke free', 'word perfect');
        }
        break;
      case 'dominion':
        hud.float(renderer, ev.x, 3.4, ev.z, ev.short ? 'Dominion' : 'Dominion', ev.short ? 'word crit' : 'word');
        if (ev.short) hud.screenFlash(0.6);
        hintOnce('dominion', 'Amber warnings are Dominions. With the Animus a map asks, a perfect parry turns them. Short of it, only a near-frame-perfect one does, and a Dominion that lands takes nearly all your health.', 9);
        break;
      case 'willFirst': {
        const pc = (v) => `${Math.round(v * 100)}%`;
        hud.banner('The Will of the Granted', `You have ${pc(ev.have)} Animus; here they ask ${pc(ev.need)}. Every few seconds an amber ring finds you and strikes ${ev.strikes} times: perfectly parry each one (the moment it flashes white). While it is on you, nothing else can hurt you much. Those with the Animus are never asked.`);
        break;
      }
      case 'willAgain':
        hud.float(renderer, ev.x, 3.2, ev.z, `${ev.n} of ${ev.of}: again!`, 'word perfect');
        break;
      case 'willPassed':
        hud.float(renderer, ev.x, 3.4, ev.z, 'Will defied', 'word perfect');
        sfx.parry(true);
        break;
      case 'dominionParried':
        hud.float(renderer, ev.x, 3.4, ev.z, ev.short ? 'Dominion defied!' : 'Dominion turned', 'word perfect');
        if (ev.short) hud.screenFlash(0.35);
        break;
      case 'animusShort': {
        const pc = (v) => `${Math.round(v * 100)}%`;
        hud.banner(`${ev.name} asks for ${pc(ev.need)} Animus`, `You have ${pc(ev.have)}. You may stay, but it will not be fair: its warnings flicker, its Dominions take nearly all your health and lock your mind, and only a near-frame-perfect parry turns them. Mastery raises Animus.`);
        break;
      }
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
        if (ev.immortal || ev.fragments) hud.banner('A travelling merchant', ev.immortal ? `He has an Immortal for sale${ev.fragments ? `, and ${ev.fragments} Immortal Fragments` : ''}. Follow the brown dot.` : `He has ${ev.fragments} Immortal Fragments for sale. Follow the brown dot.`);
        hintOnce('merchant', 'A travelling merchant (the brown dot on the minimap): walk up and press G to see his wares. Mystery gear, Wishdust and set pieces, for gold or shards.', 9);
        break;
      case 'merchantLeave':
        hud.feedText('The travelling merchant has moved on.');
        if (mode === 'talk' && talkTo === 'merchant') setMode('play');
        break;
      // (0.80) the Wishkeep
      case 'keepFounded':
        sfx.levelUp();
        hud.banner('The Wishkeep', `People have come looking for the one who ended the Quiet. They brought what they had: ${ev.faith} Faith. Read the Wishes board, and speak to them.`);
        hintOnce('keep', 'The Wishkeep: answer wishes at the board for Faith and Wishstone, raise the keep and its halls at the Hearth, and call the night there when you are ready.', 12);
        break;
      case 'keepLocked':
        hud.feedText('The Wishkeep opens once any class on your account has beaten the Quiet.');
        sfx.denied();
        break;
      case 'keepAlone':
        hud.feedText('The Wishkeep is your own: go there alone, or from the server world, where it is a copy of your own.');
        sfx.denied();
        break;
      case 'keepWishDone':
        sfx.pickup(3);
        hud.feedText(`${ev.who}'s wish is done. Answer it at the Wishes board in the Wishkeep.`);
        break;
      case 'keepShort':
        sfx.denied();
        talkNote = ev.what === 'repair' ? `The Hearth is dark, so no night can be called. Mend it here at the Hearth: "Mend the keep" below (${ev.need} Wishstone for the Hearth; you have ${ev.have}).` : ev.what === 'night' ? `The faithful will raise it once Night ${ev.need} is held (your best: ${ev.have}).` : ev.what === 'sigils' ? `Not enough Ascension Sigils: ${ev.need} needed, you have ${ev.have}. Hold nights to earn them (more the deeper the night).` : ev.what === 'stone' && ev.mend ? 'No Wishstone to mend with. Answer wishes on the board (most pay Wishstone), or trade Faith for it at the Market.' : ev.what === 'stone' ? 'Not enough Wishstone.' : ev.what === 'faith' || ev.what === 'tier' || ev.what === 'hall' ? `Not enough yet: ${ev.need.toLocaleString()} Faith needed, you have ${ev.have.toLocaleString()}${ev.stone ? `, and ${ev.stone} Wishstone` : ''}.` : `Not enough: ${ev.need.toLocaleString()} needed, you have ${ev.have.toLocaleString()}.`;
        if (mode === 'play') hud.feedText(talkNote);
        if (mode === 'talk') renderTalk();
        break;
      case 'keepStory':
        sfx.ui();
        showChapter(ev.ch);
        break;
      case 'keepAnswered':
        sfx.questDone ? sfx.questDone() : sfx.pickup(3);
        hud.feedText(`${ev.who} is grateful: +${ev.faith} Faith${ev.stone ? `, +${ev.stone} Wishstone` : ''}${ev.level ? `. ${ev.who} is now level ${ev.level}` : ''}.`);
        if (mode === 'talk' && talkTo === 'wishes') renderTalk();
        break;
      case 'keepTier':
        sfx.levelUp();
        hud.banner(`The Wishkeep · tier ${ev.numeral}`, `${ev.name}.${ev.came.length ? ` ${ev.came.join(' and ')} will be waiting by the fire next time you come home.` : ''}`);
        if (mode === 'talk') renderTalk();
        break;
      case 'keepHallShut':
        sfx.denied();
        talkNote = ev.down ? `${ev.name} is wrecked: mend it at the Hearth first.` : `${ev.name} opens once a ${CLASSES[ev.cls].name} on your account has beaten the Quiet, and works once it is raised to level 1.`;
        if (mode === 'talk') renderTalk();
        break;
      case 'keepHallUp':
        sfx.upgrade();
        hud.feedText(`${ev.name} is level ${ev.level} now.`);
        if (mode === 'talk') renderTalk();
        break;
      case 'tideStart':
        sfx.levelUp();
        hud.banner(ev.omen ? `The night is coming · ${[ev.omen, ev.omen2].filter(Boolean).map((o) => OMENS[o].name).join(' and ')}` : 'The night is coming', ev.heroes ? `${ev.heroes} hero${ev.heroes > 1 ? 'es' : ''} at their posts. You are the keep's god tonight: Q Judgement (what they strike), W Benediction (keep them fighting), E Hallowed Ground (where they hold), R to Incarnate. Hover a card to see what it does.` : 'Nobody stands at the posts. Your miracles (Q, W, E) and R, to Incarnate and fight, are all that keep the night off. Raise heroes at the Hearth.');
        break;
      case 'keepAscended':
        sfx.levelUp();
        hud.banner(`${ev.name} ascends`, `${HERO_RARITY.names[ev.rar]}: stronger in every way.${HERO_RARITY.perk[ev.rar] ? ' ' + HERO_RARITY.perk[ev.rar] : ''}`);
        if (ev.rar >= HERO_RAR_MAX) sfx.eternal();
        if (mode === 'talk') renderTalk();
        break;
      case 'keepGeared':
        sfx.ui();
        if (ev.all) hud.feedText('Every hero wears the best the Armory has.');
        refreshMenus();
        if (mode === 'talk') renderTalk();
        break;
      case 'keepSalvaged':
        sfx.ui();
        hud.feedText(`Broke down ${ev.n} piece${ev.n > 1 ? 's' : ''} of Hero gear: +${ev.stone} Wishstone.`);
        refreshMenus();
        break;
      case 'troopUnbroken':
        hud.feedText('Unbroken: a hero refuses to fall.');
        renderer.keepFx({ type: 'troopFall', x: ev.x, z: ev.z });
        break;
      case 'possess':
        // (0.92) into the Seraph, or out of it
        if (ev.on) {
          sfx.levelUp();
          renderer.shoulder.yaw = Math.atan2(-ev.z, -ev.x);
          renderer.shoulder.pitch = 0.4;
          renderer.keepFx({ type: 'possessFx', x: ev.x, z: ev.z, on: true });
          hud.feedText(`You take up the Seraph (level ${ev.lvl}): left click looses holy light; Q, E, Shift and R are its skills. Y to leave it.`);
        } else {
          renderer.keepFx({ type: 'possessFx', x: ev.x, z: ev.z, on: false });
          if (ev.fell) {
            sfx.denied();
            hud.banner('The Seraph is felled', `It is only stone for ${ev.rest} seconds. You are the keep's god again.`);
          } else hud.feedText('You leave the Seraph; it stands on its plinth again.');
        }
        if (mode === 'talk') renderTalk();
        break;
      case 'statueRaised':
        sfx.levelUp();
        hud.banner('The Seraph is raised', `The faithful have carved an angel by the Hearth (level ${ev.lvl}). Press Y anywhere in your keep to take it up.`);
        renderer.keepFx({ type: 'possessFx', x: ev.x, z: ev.z, on: true });
        if (mode === 'talk') renderTalk();
        break;
      case 'statueLevel':
        sfx.levelUp();
        hud.feedText(`The Seraph grows: level ${ev.lvl}${ev.lvl >= ev.cap ? ' (as high as your best Night)' : ''}.${ev.unlocked && ev.unlocked.length ? ` It learns ${ev.unlocked.join(', ')}.` : ''}`);
        if (mode === 'talk') renderTalk();
        break;
      case 'statueXp': {
        // (0.94) the Seraph learns from what it fells: a little gold number, and the bar flashes
        const pp = world.player;
        if (pp && pp.possess) {
          hud.float(renderer, pp.x, 3.4, pp.z, `+${ev.n} Seraph`, 'word perfect');
          const xf = $('xp-fill');
          xf.classList.remove('pulse');
          void xf.offsetWidth;
          xf.classList.add('pulse');
        }
        break;
      }
      case 'lootDrop':
        // (0.96) the rarest drops are heard and seen: an Immortal chimes; an Eternal stops the world a moment
        if (ev.ally) break;
        if (ev.rarity >= 7) {
          sfx.eternal();
          hud.screenFlash(0.35);
          hud.banner('An Eternal has fallen', 'White and crimson, on the ground: an Eternal. Take it before you go.');
        } else if (ev.rarity >= 6) sfx.pickup(6);
        break;
      case 'walkPace':
        hud.feedText(ev.on ? 'Walking at an even pace. Ctrl or Caps Lock to run again.' : 'Running. Ctrl or Caps Lock to walk.'); // (0.94)
        break;
      case 'statueTier':
        sfx.levelUp();
        hud.banner(`The Seraph is ${ev.name}`, `Its light grows: it strikes harder and stands longer.${ev.opened && ev.opened.length ? ` It learns ${ev.opened.join(', ')}.` : ''}`);
        if (mode === 'talk') renderTalk();
        break;
      case 'trialStart':
        sfx.levelUp();
        hud.banner('The Eternal trial', `${ev.name} opens its eyes. Keep moving: its stares fall where you are going.`);
        break;
      case 'trialEnd':
        if (ev.won) {
          sfx.eternal();
          hud.screenFlash(0.4);
          hud.banner('The Seraph is Eternal', `Omnividens closes its eyes (${ev.t} seconds). White and crimson light: the Seraph has learnt Ascension.`);
        } else {
          sfx.denied();
          hud.banner('The trial is lost', 'The eyes close and the sky shuts. Mend the Seraph and try again, from its plinth.');
        }
        if (mode === 'talk') renderTalk();
        break;
      case 'seraphMend':
        hud.float(renderer, ev.x, 3.2, ev.z, `+${ev.n}`, 'heal');
        break;
      case 'statueSkill':
        sfx.ui();
        hud.feedText(`The Seraph's ${{ q: 'Q', w: 'E', e: 'Shift', r: 'R' }[ev.slot]} is now ${ev.name}.`);
        if (mode === 'talk') renderTalk();
        break;
      case 'statueOffered':
        sfx.pickup(2);
        if (mode === 'talk') renderTalk();
        break;
      case 'statueResting':
        sfx.denied();
        hud.feedText(`The Seraph is only stone for now: it wakes in ${ev.t} seconds.`);
        break;
      case 'statueNone':
        sfx.denied();
        hud.feedText(`No Seraph stands by the Hearth yet. Hold Night ${ev.need} and the faithful can raise one (at its plinth, beside the Hearth).`);
        break;
      case 'statueWakes':
        hud.feedText('The Seraph wakes: Y to take it up.');
        break;
      case 'keepWalk':
        if (ev.on) {
          renderer.shoulder.yaw = -Math.PI / 2;
          renderer.shoulder.pitch = 0.45;
          hud.feedText('Walking your keep over your shoulder: W A S D to move, the mouse to look. V to go back above.');
        }
        break;
      case 'incarnateChannel':
        sfx.ui();
        renderer.shoulder.yaw = -Math.PI / 2; // (0.85) facing up the screen, as the view from above did
        renderer.shoulder.pitch = 0.45;
        hud.feedText('Gathering aura where you will land…');
        renderer.keepFx(ev);
        break;
      case 'incarnate':
        sfx.levelUp();
        hud.banner('Incarnate', `${ev.saved || ev.raised ? `Your landing ${ev.raised ? `raised ${ev.raised} and ` : ''}shielded ${ev.saved} hero${ev.saved === 1 ? '' : 'es'}. ` : ''}${ev.dur} seconds on the field, over your shoulder.`);
        renderer.keepFx(ev);
        break;
      case 'incarnateEnd':
        if (ev.fell) sfx.denied();
        hud.feedText(ev.fell ? 'Struck down: you rise again as the keep\'s god (miracles on Q, W, E).' : 'The incarnation fades: miracles on Q, W, E again.');
        renderer.keepFx(ev);
        break;
      case 'tideWave':
        hud.feedText(`Wave ${ev.wave} of ${ev.of}: ${ev.n} of them, from four ways in.${(ev.specials || []).filter((f) => f !== 'tidecaller').length ? ` Among them: ${ev.specials.filter((f) => f !== 'tidecaller').map((f) => FOES[f].name).join(', ')}.` : ''}`);
        break;
      // (0.84) the night's stranger children
      // (0.86) raids
      case 'nightBusy': // (0.99.4)
        sfx.denied();
        hud.banner(ev.raid ? 'A raid is at the gates' : 'The night is already here', ev.raid ? `Hold this raid (Night ${ev.level}) first; then call your Night.` : `Night ${ev.level} is under way.`);
        break;
      case 'nightPick': // (0.99.4)
        keepNight = ev.level;
        break;
      case 'raidWarn':
        sfx.denied();
        hud.banner('Horns at the gates', `A raid, in ${ev.in} seconds: one wave of the Unmade (Night ${ev.level}). Your heroes will meet it; R to Incarnate if they need you.`);
        break;
      case 'raidEnd':
        if (ev.away) break;
        if (ev.won) {
          sfx.levelUp();
          const gear = (ev.gear || []).map((g) => `<span style="color:${RARITIES[g.r].color}">${RARITIES[g.r].name} ${esc(g.name)}</span>`).join(', ');
          hud.banner('The raid is beaten', `+${ev.faith.toLocaleString()} Faith, +${ev.stone} Wishstone.${ev.wrecked.length ? ` Wrecked: ${ev.wrecked.join(', ')}.` : ''}`);
          if (gear) gearToast(`Hero gear for the Armory: ${gear}`);
        } else {
          sfx.denied();
          hud.banner('The raid broke through', `The Hearth went dark.${ev.wrecked.length ? ` Wrecked: ${ev.wrecked.join(', ')}.` : ''} Mend the keep at the Hearth (Wishstone).`);
        }
        if (mode === 'talk') renderTalk();
        break;
      case 'keepRaidsAway': {
        const lost = ev.raids - ev.held;
        const gear = (ev.gear || []).map((g) => `<span style="color:${RARITIES[g.r].color}">${RARITIES[g.r].name} ${esc(g.name)}</span>`).join(', ');
        hud.banner('While you were away', `The Unmade raided ${ev.raids} time${ev.raids > 1 ? 's' : ''}. Your heroes held ${ev.held}${lost ? `, and ${lost} broke through` : ''}. +${ev.faith.toLocaleString()} Faith, +${ev.stone} Wishstone.${ev.wrecked.length ? ` Wrecked: ${ev.wrecked.join(', ')} (mend them at the Hearth).` : ''}`);
        if (gear) gearToast(`Your heroes won Hero gear: ${gear}`);
        if (mode === 'talk') renderTalk();
        break;
      }
      case 'keepRaidsSet':
        hud.feedText(ev.on ? 'Raids on: the Unmade will come now and then.' : 'Raids off.');
        if (mode === 'talk') renderTalk();
        break;
      case 'tideBoss':
        sfx.denied();
        hud.banner(ev.name, 'The night\'s king comes with the last wave. Keep your heroes out of its slam.');
        break;
      case 'tideBossRage':
        hud.feedText('The Tidecaller rages: faster, and calling more often.');
        renderer.keepFx(ev);
        break;
      case 'tideBossDown':
        sfx.levelUp();
        hud.banner('The Tidecaller falls', 'Its own Hero gear waits for you at morning.');
        renderer.keepFx(ev);
        break;
      case 'thiefStole':
        hud.feedText(`An Ember Thief took Faith from ${ev.from}: catch it before it reaches the dark!`);
        renderer.keepFx(ev);
        break;
      case 'thiefEscaped':
        sfx.denied();
        hud.feedText('A thief got away with the Faith: this night pays less.');
        renderer.keepFx(ev);
        break;
      case 'thiefCaught':
        hud.feedText('Thief caught: the Faith comes back, and more.');
        renderer.keepFx(ev);
        break;
      case 'rotSplit':
        hud.feedText('The Rotmother breaks apart: three Rotlings crawl from her.');
        renderer.keepFx({ ...ev, type: 'cinderBurst', r: 2.5 });
        break;
      case 'mournerRaise':
      case 'cinderBurst':
      case 'tideCall':
      case 'tideSlamWarn':
      case 'tideSlam':
      case 'starWarn':
      case 'starFall':
        renderer.keepFx(ev);
        break;
      case 'tideEnd':
        if (ev.won) {
          sfx.levelUp();
          const gear = (ev.gear || []).map((g) => `<span style="color:${RARITIES[g.r].color}">${RARITIES[g.r].name} ${esc(g.name)}</span>`).join(', ');
          const stars = ev.stars ? ' ' + '★'.repeat(((ev.stars & 1) ? 1 : 0) + ((ev.stars & 2) ? 1 : 0) + ((ev.stars & 4) ? 1 : 0)) : '';
          hud.banner((ev.first ? `Night ${ev.level} held` : 'Morning') + stars, `The keep held.${ev.newStars ? ` ${ev.newStars} new star${ev.newStars > 1 ? 's' : ''}!` : ''}${ev.boss ? ' The Tidecaller fell.' : ''}${ev.stolen ? ` ${ev.stolen} thie${ev.stolen > 1 ? 'ves' : 'f'} got away.` : ''} +${ev.faith.toLocaleString()} Faith, +${ev.stone} Wishstone, +${ev.sigils} Sigil${ev.sigils > 1 ? 's' : ''}.${ev.wrecked.length ? ` Wrecked: ${ev.wrecked.join(', ')} (mend at the Hearth).` : ''}${ev.first && ev.level < NIGHT.max ? ` Night ${ev.level + 1} is open.` : ''}`);
          if (gear || ev.salvaged) gearToast(`${gear ? `Hero gear for the Armory: ${gear}` : 'No Hero gear kept'}${ev.salvaged ? ` (${ev.auto ? `${ev.auto} broken down as you chose` : 'the Armory was full'}: +${ev.salvaged} Wishstone)` : ''}`);
          if ((ev.gear || []).some((g) => g.r >= 6)) sfx.eternal();
        } else {
          sfx.denied();
          hud.banner('The Hearth went dark', `The night is lost.${ev.wrecked.length ? ` Wrecked: ${ev.wrecked.join(', ')}.` : ''} Nobody was taken. Walk to the Hearth and choose "Mend the keep" (Wishstone) before the next night; the board's wishes pay Wishstone.`);
        }
        if (mode === 'talk') renderTalk();
        break;
      // (0.81) the keep's heroes, halls and miracles
      case 'troopHit':
      case 'troopSkill':
      case 'troopHeal':
      case 'troopMeteor':
      case 'troopDodge':
      case 'foeHit':
      case 'buildHit':
      case 'miracle':
        renderer.keepFx(ev);
        if (ev.type === 'miracle') sfx.ui();
        break;
      case 'troopFall':
        hud.feedText(`${ev.name} has fallen. Mend (W) where they lie raises them.`);
        renderer.keepFx(ev);
        break;
      case 'troopRaised':
        hud.feedText(`${ev.name} rises again.`);
        renderer.keepFx(ev);
        break;
      case 'buildWrecked':
        sfx.denied();
        if (ev.id === 'hearth') hud.banner('The Hearth is wrecked', '');
        else hud.feedText(`${ev.name} is wrecked: it does no work until it is mended at the Hearth (Wishstone).`);
        renderer.keepFx(ev);
        break;
      case 'miracleMiss':
        hud.feedText('Ward needs a building near where you aim.');
        sfx.denied();
        break;
      case 'keepRecruited':
        sfx.levelUp();
        hud.feedText(`${ev.name}, a ${CLASSES[ev.cls].name.toLowerCase()}, joins the keep.`);
        if (mode === 'talk') renderTalk();
        break;
      case 'keepAutoBless': // (0.99.4)
        if (mode === 'talk') renderTalk();
        break;
      case 'keepBlessAuto': // (0.99.4) bought by themselves as the night was called
        if (ev.got.length) hud.feedText(`Blessed for this night: ${ev.got.join(', ')}.`);
        if (ev.short.length) hud.feedText(`Not enough Faith to bless with ${ev.short.join(', ')}.`);
        break;
      case 'keepDismissed':
        hud.feedText(`${ev.name} goes home.`);
        if (mode === 'talk') renderTalk();
        break;
      case 'keepTrained':
      case 'keepArmed':
      case 'keepLearned':
      case 'keepBlessed':
      case 'keepTraded':
      case 'keepRepaired':
        sfx.upgrade();
        hud.feedText(ev.type === 'keepTrained' ? `${ev.name} is level ${ev.lvl} now.` : ev.type === 'keepArmed' ? `${ev.name}: gear ${ev.gear}.` : ev.type === 'keepLearned' ? `${ev.name} learned ${ev.skill}.` : ev.type === 'keepBlessed' ? `${ev.name}, for the next night.` : ev.type === 'keepRepaired' ? (ev.left ? `Mended with ${ev.stone} Wishstone${ev.hearth ? ' (the Hearth is lit again)' : ''}; ${ev.left} more mends the rest.` : `The keep is mended (${ev.stone} Wishstone).`) : ev.dir === 'sell' ? `Sold ${(ev.stone || 10).toLocaleString()} Wishstone for ${(ev.faith || 0).toLocaleString()} Faith.` : `Bought ${(ev.stone || 0).toLocaleString()} Wishstone for ${(ev.faith || 0).toLocaleString()} Faith.`);
        if (mode === 'talk') renderTalk();
        break;
      case 'keepFull':
        sfx.denied();
        talkNote = `The keep has room for ${ev.cap} heroes at this tier. Raise it at the Hearth for more.`;
        if (mode === 'talk') renderTalk();
        break;
      case 'keepMaxed':
        sfx.denied();
        talkNote = ev.what === 'rank' ? `${ev.name} needs ${ev.hall} at level ${ev.rank}.` : ev.what === 'stage' ? `${ev.name} opens when the keep grows to ${GROWTH.names[ev.stage]}.` : ev.what === 'seraphLvl' ? `${ev.name} opens when the Seraph reaches level ${ev.lvl}.` : ev.what === 'seraphTier' ? `${ev.name} opens when the Seraph is ${ev.tier}.` : ev.what === 'seraphTierLvl' ? `The Seraph can be raised to ${ev.tier} at level ${ev.lvl}.` : ev.what === 'seraphTrial' ? 'Eternal is won in the trial, not bought.' : ev.what === 'seraphTrialLocked' ? `The Eternal trial opens to an Immortal Seraph at level ${ev.lvl}.` : ev.what === 'level' ? `${ev.name} is as high as it goes.` : `${ev.name} is as far as this hall can take them: raise the hall.`;
        if (mode === 'talk') renderTalk();
        break;
      case 'keepProduced':
        hud.feedText(`While you were away (${ev.hours} hours): +${ev.faith.toLocaleString()} Faith${ev.stone ? `, +${ev.stone.toLocaleString()} Wishstone` : ''} from the keep's works.`);
        break;
      case 'keepGrew':
        sfx.levelUp();
        hud.banner(`The keep grows: ${ev.name}`, 'More room, more roofs, more people. You will see it the next time you come through the Waygate.');
        break;
      case 'keepWorkUp':
        sfx.upgrade();
        hud.feedText(`${ev.name} is level ${ev.level} now.`);
        if (mode === 'talk') renderTalk();
        break;
      case 'keepBuildTier':
        sfx.upgrade();
        if (ev.tier >= 6) sfx.eternal();
        hud.banner(`${ev.name}: ${RARITIES[ev.tier].name}`, BUILD_TIER.perk[ev.id](ev.tier));
        if (mode === 'talk') renderTalk();
        break;
      case 'keepTierShut':
        sfx.denied();
        hud.feedText(ev.id === 'hearth' ? 'The Hearth can be raised through the tiers once the keep is at tier III.' : 'A building can be raised through the tiers once its hall is at its last level.');
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
      case 'merchantWait':
        talkNote = `"You've been shopping with my cousin, I can tell." Come back in ${Math.ceil(ev.left / 60)} minute${ev.left > 60 ? 's' : ''}.`;
        if (mode === 'talk') renderTalk();
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
        if (performance.now() - (rankSfxAt || 0) > 140) sfx.rankUp(); // (0.91.1) a held rank-up: not a sound every tick
        rankSfxAt = performance.now();
        hud.flashSlot(ev.slot);
        if (mode === 'play') hud.float(renderer, p.x, 3.0, p.z, `${world.kit[ev.slot].name} rank ${ev.rank}${ev.n > 1 ? ` (+${ev.n})` : ''}`, 'word stun');
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
      case 'eternalDrop':
        // (0.71) the tier above Immortal
        sfx.eternal(); // (0.72)
        hud.screenFlash(0.35);
        if (ev.forged) hud.banner(`Forged: ${ev.name}`, 'An Eternal piece, from Eternity Essence · wear and feed it in the Eternal panel (Tab)');
        else if (ev.first) hud.banner(`${ev.boss} falls for the first time`, `+${ev.essence} Eternity Essence · food for Eternal gear, kept in the Eternal panel (Tab) through every rebirth, waiting for your first piece`);
        else if (ev.essence) hud.banner('Eternity Essence', `+${ev.essence} · every Eternal piece is yours: feed it to them (Tab)`);
        else hud.banner(`An Eternal falls: ${ev.name}`, 'Soulbound, kept through every rebirth · wear and feed it in the Eternal panel (Tab)');
        refreshMenus();
        break;
      case 'eternalFed':
        sfx.upgrade();
        if (ev.level > ev.from) hud.banner(`${ev.name} · level ${ev.level}`, `${ev.slots} passive${ev.slots > 1 ? 's' : ''} open${ev.back > 0 ? ` · ${ev.back.toFixed(1)} Essence back` : ''}`);
        else hud.feedText(`${ev.auto ? `Auto-fed ${ev.food} to ` : ''}${ev.name}${ev.auto ? '' : ` fed${ev.eaten > 1 ? ` ${ev.eaten} Immortals` : ''}`}${ev.back > 0 ? ` · ${ev.back.toFixed(1)} Essence back` : ''}`);
        if (!ev.auto) gearToast(`<b>${esc(ev.name)}</b> fed${ev.eaten > 1 ? ` ${ev.eaten} Immortals` : ''}: level ${ev.level}${ev.back > 0 ? ` · ${ev.back.toFixed(1)} Essence back` : ''}`, '#ff3d4f'); // (0.75.3) seen on the gear screen
        refreshMenus();
        break;
      case 'autoScrap':
        hud.feedText(`${ev.count} piece${ev.count > 1 ? 's' : ''} left on the ground scrapped: +${ev.scrap} scrap${ev.dust ? `, +${ev.dust} Wishdust` : ''}`); // (0.74)
        break;
      case 'vetGift':
        // (0.74) thanks for beating the Granted at their hardest
        sfx.eternal();
        hud.banner(`+${ev.essence} Eternity Essence`, `For the ${ev.beat} Granted you had already beaten at their hardest · forge or feed Eternal gear in the Eternal panel (Tab)`);
        break;
      case 'eternalShort':
        hud.feedText(`Forging needs ${ev.need} Eternity Essence.`);
        break;
      case 'eternalFull':
        hud.feedText('That Eternal is at its last level.');
        break;
      case 'bagFull':
        hud.feedText('Bag is full. Press TAB and scrap some items.');
        break;
      case 'equip':
        sfx.pickup(ev.item.rarity);
        gearToast(`Equipped ${itemName(ev.item)}`, RARITIES[ev.item.rarity] && RARITIES[ev.item.rarity].color);
        break;
      case 'discard':
        sfx.ui();
        hud.feedText(`+${ev.scrap} scrap${ev.dust ? ` · +${ev.dust} Wishdust` : ''}`);
        break;
      case 'enchanted':
        sfx.upgrade();
        hud.feedText(`Reforged ${ev.name}: ${STATS[ev.from].label} became ${formatStat(ev.to, ev.value)}.`);
        gearToast(`Reforged ${ev.name}: ${STATS[ev.from].label} became ${formatStat(ev.to, ev.value)}`);
        refreshMenus();
        break;
      case 'autoRolled': {
        // (0.81.6) the auto-roller's report, all at once
        const up = ev.lines.filter((l) => l.tier > l.fromTier);
        const best = Math.max(...ev.lines.map((l) => l.tier));
        if (ev.rolls) sfx.upgrade();
        if (ev.lines.some((l) => l.tier === 7 && l.fromTier < 7)) sfx.eternal();
        const paid = ev.essence ? `${ev.essence} Echo Essence` : `${ev.gold.toLocaleString()} gold + ${ev.scrap.toLocaleString()} scrap`;
        const why = ev.why === 'done' ? 'every chosen line is there' : ev.why === 'limit' ? 'stopped at the reroll limit' : 'stopped: not enough to reroll again';
        const msg = `${ev.name}: ${ev.rolls} reroll${ev.rolls === 1 ? '' : 's'}${ev.rolls ? ` (${paid})` : ''}, ${why}.${up.length ? ' ' + up.map((l) => `${STATS[l.key].label} <span style="color:${RARITIES[l.tier].color}">${RARITIES[l.tier].name}</span>`).join(', ') : ''}`;
        gearToast(msg);
        hud.feedText(msg.replace(/<[^>]+>/g, ''));
        if (ev.why === 'done' && ev.rolls) hud.banner('Auto-roll done', `${ev.name}: ${ev.rolls} rerolls, best line ${RARITIES[best].name}`);
        refreshMenus();
        break;
      }
      case 'autoRollShut':
        sfx.denied();
        hud.feedText('Auto-roll opens once a class on your account has beaten the Quiet.');
        break;
      case 'rerolled': {
        sfx.upgrade();
        const tier = RARITIES[ev.tier];
        if (ev.tier === 7) {
          // (0.75.3) an Eternal-tier line, past Immortal: only on Eternal gear
          sfx.eternal();
          hud.banner(`Eternal roll · ${STATS[ev.key].label}`, `${ev.name}: ${ev.value.toLocaleString()}, the best 1% it can be`);
        }
        hud.feedText(`${ev.name}: ${STATS[ev.key].label} ${ev.from} → ${ev.value} (${tier.name} roll)`);
        gearToast(`${ev.name}: ${STATS[ev.key].label} ${ev.from} → ${ev.value} <span style="color:${tier.color}">(${tier.name} roll${ev.pity ? ', guaranteed' : ''})</span>`);
        refreshMenus();
        break;
      }
      case 'upgrade':
        sfx.upgrade();
        if (mode === 'talk') renderTalk(); // (0.75) Bram's anvil
        break;
      case 'cacheOpened':
        sfx.pickup(ev.item.rarity);
        if (mode === 'town') town.showCacheResult(ev.item);
        else {
          // (0.62) opened at Bram's forge: say what came out, and keep the vault open
          if (ev.items) gearToast(`${ev.items.length} × ${CACHES[ev.tier].name}: ${ev.items.map((it) => `<span style="color:${RARITIES[it.rarity].color}">${itemName(it)}</span>`).join(', ')}`, RARITIES[ev.item.rarity].color);
          else gearToast(`${CACHES[ev.tier].name}: <span style="color:${RARITIES[ev.item.rarity].color}">${itemName(ev.item)}</span>`, RARITIES[ev.item.rarity].color);
          if (mode === 'talk') renderTalk();
        }
        break;
      case 'noUpgrades':
        sfx.denied();
        hud.feedText('Nothing in your bag beats what you are wearing');
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
          travelGate = null;
          setMode('travel');
        }
        break;
      case 'crossing': // (1.0) the Verge: the way down or the way up
        if (mode === 'play') {
          sfx.ui();
          travelStone = null;
          travelGate = ev.kind;
          setMode('travel');
        }
        break;
      case 'waystone':
        if (mode === 'play') {
          sfx.ui();
          travelStone = ev.index;
          travelGate = null; // (1.1.3) not still the Verge's crossing from before: that showed the Way Up's 'shut' page at every waystone since
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
        if (world.map && world.map.id === KEEP.map) applyNow({ type: 'keepClock', now: Date.now() }); // (0.81) Faith that came in while away (online, the server's clock)
        $('rift-home').classList.add('hidden'); // (0.58)
        $('ring-bank').classList.add('hidden');
        if (world.mode === 'arena') {
          // (0.59) an Echo Ring run on the server world
          renderer.setEnvironment('arena');
          renderer.reset();
          renderer.camTarget.set(p.x, 0, p.z);
          tune();
          hud.reset();
          hud.banner('The Echo Ring', world.ring ? `Here for ${RING_FOCUS[world.ring.kind].name.toLowerCase()}${world.ring.kind === 'gear' ? ` (${world.ring.slot})` : ''}` : '');
          break;
        }
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
        {
          // (0.57.6) The first time in the Deep: what Ember does, measured against this Depth
          const D = DEEP.depths[(world.map && world.map.deep) || world.depthNow()];
          if (D) {
            const ember = world.ember();
            const sc = emberScale(ember, D.ember);
            hintOnce('deepEmber', `Depth ${D.numeral} asks for ${D.ember} Ember, and you have ${ember}. ${sc.one ? 'Below half of what it asks, every blow you land is 1: nothing here can be hurt by you yet.' : sc.dealt < 1 ? `Short of it, your blows land at ${Math.round(sc.dealt * 100)}% and you take more.` : 'You have enough: you fight here at full strength.'} Ember is what you let go of: every rebirth adds up to ${DEEP.emberMax}, by everything you give up, and it stays with you.`, 16);
          }
        }
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
        if (net && net.server) {
          // (0.59) the Ring on the server world: home to Haven in a moment, spoils and all
          hud.banner(`You fell on wave ${ev.wave}`, 'Back to Haven, with everything you gathered');
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

  let moodT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const jsStart = performance.now();
    const rawDt = Math.max(0, (now - last) / 1000);
    if ((moodT -= rawDt) <= 0) {
      moodT = 0.5;
      musicMood(); // (0.72)
    }
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
      // (0.80.2) the thing you clicked, once it is in reach, even when someone else is standing nearer
      // (the Wishes board beside Maren took a second click)
      const p = world.player;
      const want = mode === 'play' ? world.interactables().find((o) => o.id === pendingTalk.id) : null;
      const inReach = want && Math.hypot(p.x - want.x, p.z - want.z) - want.r <= (want.reach ?? CONFIG.INTERACT_RANGE);
      if (mode !== 'play' || now > pendingTalk.until || p.dead) pendingTalk = null;
      else if (inReach) actions.interact(want);
    }
    if (mode === 'play' && world.mode === 'explore' && ((frameNo = (frameNo + 1) % 6) === 0)) {
      canvas.classList.toggle('hover-talk', !!renderer.pickInteractable(input.mouse.x, input.mouse.y, world));
    }

    let alpha = Math.min(1, acc / CONFIG.TICK);
    if (net && net.role === 'client') {
      // A joiner never runs the rules: it shows what the host sends, gliding between updates.
      playSnapshots(now);
      drainEvents();
      if (mode === 'play' && world.mode === 'arena' && world.offer && !world.gameOver && now >= offerAt && !autoAugment()) setMode('augment'); // (0.59) the Ring online
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
        if (!autoAugment()) setMode('augment');
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
    // (0.61.2) a held skill shot: where it would go, on the ground and on the minimap
    let aim = null;
    if (input.held && mode === 'play' && world && world.player) {
      const g = input.ground();
      if (g && !input.held.preview) aim = aimPreview(world, input.held.slot, g.x, g.z);
    }
    renderer.aim = aim && !input.held.preview ? aim : null;
    hud.aim = aim && !input.held.preview ? aim : null;
    // (0.99.4) any other skill held: its range and the ground it will cover
    let sk = null;
    if (input.held && input.held.preview && mode === 'play' && world && world.player) {
      const g = input.held.shoulder ? input.shoulderAim(input.held.slot, world) : input.ground();
      const hp = renderer.hero && renderer.hero.group ? renderer.hero.group.position : world.player;
      if (g) sk = skillPreview(world, input.held.slot, g.x, g.z, hp.x, hp.z);
    }
    renderer.skillAim = sk;
    // (0.62) Auto-start: once the floor is cleared (and any augment picked), start the next wave. Never past a
    // boss's spoils: taking them home or pushing on stays your call.
    if (autoWaveAt && now >= autoWaveAt && mode === 'play' && world.mode === 'arena' && world.wave) {
      if (world.wave.phase !== 'intermission') autoWaveAt = 0;
      else if (!world.offer && !(world.ring && world.ring.hold)) {
        autoWaveAt = 0;
        applyNow({ type: 'nextWave' });
      }
    }
    shoulderFrame();
    renderer.render(world, alpha, dt);
    hud.update(world, renderer, dt);
    voiceFrame(now); // (0.99) chatter as you pass, a hurt hero's cry
    if (world && world.map && world.map.id === KEEP.map && now >= keepClockAt) {
      keepClockAt = now + 60000; // (0.82.1) the works pay while you are in the keep too, a minute at a time
      applyNow({ type: 'keepClock', now: Date.now() });
    }
    if (now >= cpCheckAt && world && !world.trial && world.player && world.player.stats) {
      // (0.61.1) keep the Combat Power the next gear change is measured against up to date
      cpCheckAt = now + 2000;
      cpSeen = measureCp();
    }
    perfTick(now, rawDt * 1000, performance.now() - jsStart);
  }

  // Handy in the browser console while developing: game.world.player etc.
  window.game = {
    get world() {
      return world;
    },
    get input() {
      return input;
    },
    get net() {
      return net;
    },
    get mode() {
      return mode;
    },
    renderer,
    sfx, // (0.93) for tests
    act: (c) => applyNow(c), // (0.61.1) a command as the game's own buttons send it (tests, the console)
    talk: (id) => { talkTo = id; talkNote = ''; setMode('talk'); }, // (0.62) open someone's panel (tests)
    panel: (m) => setMode(m), // (0.64) open a window by its mode (tests): 'travel', 'play', ...
    maps: MAP_IDS, // (1.1.4) every map (the menu bot)
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
