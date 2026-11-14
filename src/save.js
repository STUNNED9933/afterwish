// Saving to the browser's localStorage. Each player's progress stays in their
// own browser. Storage can be unavailable (private windows, some embeds), so
// every access is wrapped and the game simply runs without saving if it fails.
const SAVE_KEY = 'stunned-arena-save-v1';
const SETTINGS_KEY = 'stunned-arena-settings-v1';

/** Every class has its own save. The Warrior keeps the original key so old saves still load. */
function keyFor(base, cls) {
  return !cls || cls === 'warrior' ? base : `${base}-${cls}`;
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadSave(cls) {
  let s = read(keyFor(SAVE_KEY, cls));
  s = s && (s.v === 1 || s.v === 2) && s.level >= 1 ? s : null;
  // Before 0.5 the explorer was a separate character. Fold it into the one save.
  const ex = read(keyFor('stunned-explore-save-v1', cls));
  if (ex && ex.level >= 1) {
    s = mergeSaves(s, ex);
    write(keyFor(SAVE_KEY, cls), s);
    try {
      localStorage.removeItem(keyFor('stunned-explore-save-v1', cls));
    } catch (err) {
      /* storage unavailable */
    }
  }
  return s;
}

/** Keep the higher-level character, the best arena record, and both sets of gear. */
function mergeSaves(arena, explore) {
  if (!arena) return explore;
  const main = explore.level > arena.level ? explore : arena;
  const other = main === arena ? explore : arena;
  const out = Object.assign({}, main);
  out.bestWave = Math.max(arena.bestWave || 0, explore.bestWave || 0);
  out.maxCheckpoint = out.checkpoint = Math.max(arena.maxCheckpoint || 1, explore.maxCheckpoint || 1);
  out.scrap = (arena.scrap || 0) + (explore.scrap || 0);
  out.keys = (arena.keys || 0) + (explore.keys || 0);
  out.tomes = Math.max(arena.tomes || 0, explore.tomes || 0);
  const spare = Object.values(other.equipped || {}).filter(Boolean).concat(other.bag || []);
  out.bag = (main.bag || []).concat(spare).slice(0, 24);
  return out;
}
export function storeSave(save, cls) {
  return write(keyFor(SAVE_KEY, cls), save);
}
export function clearSave(cls) {
  backupNow('before a character was deleted');
  try {
    localStorage.removeItem(keyFor(SAVE_KEY, cls));
  } catch (err) {
    /* nothing to clear */
  }
}
export function loadSettings() {
  return Object.assign({ parryPreset: null, volume: 0.6, muted: false, shadows: true }, read(SETTINGS_KEY) || {});
}
export function storeSettings(settings) {
  write(SETTINGS_KEY, settings);
}

// --- The account wallet every class shares --------------------------------
const ACCOUNT_KEY = 'stunned-account-v1';

/** { gold, tickets } */
export function loadAccount() {
  const a = read(ACCOUNT_KEY);
  return a && typeof a.gold === 'number' ? a : null;
}
export function storeAccount(account) {
  write(ACCOUNT_KEY, account);
}

// --- Moving saves between browsers -----------------------------------------
// Everything the game keeps is under keys starting with "stunned-". Export
// bundles them into one object; import writes them back, replacing what is here.
const PREFIX = 'stunned-';
const TAG = 'stunned-games-save';

// Keys that belong to this browser only and never travel in an export.
const LOCAL_ONLY = new Set(['stunned-backups-v1', 'stunned-session-v1']);

export function exportSaves() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !LOCAL_ONLY.has(k)) data[k] = localStorage.getItem(k);
    }
  } catch (err) {
    /* storage unavailable: export what we have (nothing) */
  }
  return { game: TAG, v: 1, exported: new Date().toISOString(), data };
}

/** The same bundle as text that is safe to copy and paste anywhere. */
export function exportCode() {
  return btoa(unescape(encodeURIComponent(JSON.stringify(exportSaves()))));
}

/** Read a bundle from a file's text or a pasted code. Returns it, or throws with a reason. */
export function parseSaves(text) {
  text = String(text || '').trim();
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch (err) {
    try {
      obj = JSON.parse(decodeURIComponent(escape(atob(text.replace(/\s+/g, '')))));
    } catch (err2) {
      throw new Error('That is not a STUNNED save file or code.');
    }
  }
  if (!obj || obj.game !== TAG || typeof obj.data !== 'object') throw new Error('That is not a STUNNED save file or code.');
  const keys = Object.keys(obj.data).filter((k) => k.startsWith(PREFIX) && typeof obj.data[k] === 'string');
  if (!keys.length) throw new Error('That save is empty.');
  return obj;
}

/** Replace this browser's saves with the bundle's (a backup of what was here is kept first). */
export function importSaves(obj) {
  backupNow('before an import');
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !LOCAL_ONLY.has(k)) localStorage.removeItem(k);
    }
    for (const k in obj.data) if (k.startsWith(PREFIX) && !LOCAL_ONLY.has(k) && typeof obj.data[k] === 'string') localStorage.setItem(k, obj.data[k]);
    return true;
  } catch (err) {
    return false;
  }
}

/** One line describing a bundle, for the "are you sure" step. */
export function describeSaves(obj) {
  const heroes = [];
  for (const k in obj.data) {
    if (!k.startsWith('stunned-arena-save-v1')) continue;
    try {
      const s = JSON.parse(obj.data[k]);
      const cls = k === 'stunned-arena-save-v1' ? 'warrior' : k.slice('stunned-arena-save-v1-'.length);
      if (s && s.level) heroes.push(`${cls[0].toUpperCase() + cls.slice(1)} level ${s.level}`);
    } catch (err) {
      /* skip a broken entry */
    }
  }
  return heroes.length ? heroes.join(', ') : 'settings only, no characters';
}

// --- Automatic backups -------------------------------------------------------
// Copies of every save, kept in this browser: when the game starts, every so often
// while playing, and before anything that deletes or replaces a save. Besides the
// most recent few, the backup with the most progress ever is always kept, so a
// lost or overwritten character can be brought back from the title screen.
const BACKUP_KEY = 'stunned-backups-v1';
const RECENT = 4;

/** Total character levels in a bundle's data: a simple measure of progress. */
export function progressOf(data) {
  let n = 0;
  for (const k in data) {
    if (!k.startsWith('stunned-arena-save-v1')) continue;
    try {
      n += JSON.parse(data[k]).level || 0;
    } catch (err) {
      /* skip a broken entry */
    }
  }
  return n;
}

/** { recent: [backup], best: backup|null }; a backup is { t, why, data, progress }. */
export function loadBackups() {
  const b = read(BACKUP_KEY);
  return { recent: Array.isArray(b?.recent) ? b.recent : [], best: b?.best && b.best.data ? b.best : null };
}

function storeBackups(b) {
  // If storage is full, drop the oldest recent copies until it fits (the best one stays).
  while (!write(BACKUP_KEY, b)) {
    if (!b.recent.length) return false;
    b.recent.pop();
  }
  return true;
}

/** Back up the current saves. Returns true if a new copy was kept. */
export function backupNow(why, now = Date.now()) {
  const data = exportSaves().data;
  const progress = progressOf(data);
  if (!progress) return false; // nothing worth keeping yet
  const b = loadBackups();
  const same = (x) => x && JSON.stringify(x.data) === JSON.stringify(data);
  let changed = false;
  if (!same(b.recent[0])) {
    b.recent.unshift({ t: now, why, data, progress });
    b.recent = b.recent.slice(0, RECENT);
    changed = true;
  }
  if (!b.best || progress >= b.best.progress) {
    if (!same(b.best)) {
      b.best = { t: now, why, data, progress };
      changed = true;
    }
  }
  return changed ? storeBackups(b) : false;
}

/** Put a backup back (keeping a backup of what is here now, so this can be undone too). */
export function restoreBackup(backup) {
  if (!backup || !backup.data) return false;
  return importSaves({ data: backup.data });
}

/** A newer-looking backup with clearly more progress than now, if there is one (for a hint on the title screen). */
export function missingProgress() {
  const now = progressOf(exportSaves().data);
  const b = loadBackups();
  return b.best && b.best.progress >= now + 3 ? b.best : null;
}

// --- One tab at a time -------------------------------------------------------
// Every time the game starts it writes a fresh id here. A tab that sees another id
// appear knows a newer tab has opened, and stops saving so it cannot overwrite it.
const SESSION_KEY = 'stunned-session-v1';
export function claimSession() {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch (err) {
    /* storage unavailable */
  }
  return id;
}
export function onSessionTaken(callback) {
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY && e.newValue) callback();
  });
}

/** Ask the browser to keep this site's storage even when the disk fills up. */
export function askPersistentStorage() {
  try {
    // Firefox asks the player with a pop-up; Chrome, Edge and Safari decide quietly.
    if (!navigator.storage || !navigator.storage.persist || /firefox/i.test(navigator.userAgent)) return;
    navigator.storage.persisted().then((yes) => {
      if (!yes) navigator.storage.persist();
    });
  } catch (err) {
    /* not supported */
  }
}
