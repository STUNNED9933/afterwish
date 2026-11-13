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

export function exportSaves() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
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

/** Replace this browser's saves with the bundle's. */
export function importSaves(obj) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
    for (const k in obj.data) if (k.startsWith(PREFIX) && typeof obj.data[k] === 'string') localStorage.setItem(k, obj.data[k]);
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
