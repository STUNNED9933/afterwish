// Tests for save safety (src/save.js): backups, restoring, and the double tab guard.
// Run with: node test/save.test.mjs (part of npm test).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
const listeners = [];
globalThis.window = { addEventListener: (t, fn) => listeners.push([t, fn]) };
const S = await import('../src/save.js');

let pass = 0, failed = 0;
const ok = (c, m, x = '') => { if (c) pass++; else failed++; console.log((c ? 'PASS ' : 'FAIL ') + m + (x ? '  ' + x : '')); };
const hero = (level) => ({ v: 2, cls: 'mage', level, exp: 0, gold: 10 });

console.log('--- save safety');
ok(S.backupNow('start') === false && S.loadBackups().recent.length === 0, 'no backup while there is no character yet');
S.storeSave(hero(40), 'mage');
S.storeSave(hero(12), 'warrior');
ok(S.backupNow('start', 1000) === true, 'a backup is made once there is a character');
ok(S.backupNow('start', 2000) === false, 'an unchanged save is not backed up twice');
const b1 = S.loadBackups();
ok(b1.recent.length === 1 && b1.best && b1.best.progress === 52, 'the backup records total levels as its progress', String(b1.best && b1.best.progress));
ok(!Object.keys(S.exportSaves().data).some((k) => k.includes('backups') || k.includes('session')), 'backups never travel in an exported save');

// The bad day: the Mage is deleted (or overwritten by an old tab) and play goes on.
S.clearSave('mage');
ok(S.loadSave('mage') === null, 'deleting a character removes it');
ok(S.loadBackups().recent[0].progress === 52, 'but a backup was taken just before');
S.storeSave(hero(2), 'mage');
for (let i = 0; i < 6; i++) { S.storeSave(hero(2 + i), 'mage'); S.backupNow('while playing', 3000 + i); }
const b2 = S.loadBackups();
ok(b2.recent.length === 4, 'only the 4 most recent backups are kept', String(b2.recent.length));
ok(b2.best.progress === 52, 'the backup with the most progress is always kept, however many come after it');
const lost = S.missingProgress();
ok(lost && lost.progress === 52, 'the title screen can tell that a backup has much more progress than now');
ok(S.restoreBackup(b2.best) && S.loadSave('mage').level === 40 && S.loadSave('warrior').level === 12, 'restoring the backup brings the Mage back at level 40');
ok(S.loadBackups().recent.some((x) => x.progress === 19), 'restoring keeps a backup of what was there before, so it can be undone');
ok(!S.missingProgress(), 'after restoring, nothing is reported missing');

// Two tabs: a newer tab announces itself; older tabs hear it and stop saving.
let taken = false;
S.onSessionTaken(() => (taken = true));
S.claimSession();
const fire = (key, newValue) => listeners.filter(([t]) => t === 'storage').forEach(([, fn]) => fn({ key, newValue }));
fire('stunned-arena-save-v1', '{}');
ok(!taken, 'ordinary saving in another tab does not stop this one');
fire('stunned-session-v1', 'abc');
ok(taken, 'a newer tab opening tells this one to stop saving');

// A full disk: the oldest recent copies are dropped so the backup still fits.
const real = localStorage.setItem;
let fails = 2;
localStorage.setItem = (k, v) => { if (k === 'stunned-backups-v1' && fails-- > 0) throw new Error('QuotaExceeded'); return real(k, v); };
S.storeSave(hero(41), 'mage');
ok(S.backupNow('while playing', 9000) === true && S.loadBackups().best.progress === 53, 'when storage is full, old copies make room and the newest best is still kept');
localStorage.setItem = real;

console.log(`\n${pass} passed, ${failed} failed`);
if (failed) process.exit(1);
