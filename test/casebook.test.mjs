// Tests for the Casebook (src/ui/casebook.js) and the rules that feed it.
// Run with: node test/casebook.test.mjs (part of npm test).
import * as C from '../src/ui/casebook.js';
import { ENEMIES } from '../src/sim/defs.js';
import { World } from '../src/sim/world.js';

let pass = 0, failed = 0;
function check(name, ok, info = '') {
  if (ok) pass++;
  else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  ' + info : ''));
}

// Every page exists, is complete, and draws without holes in both views.
const holes = [];
for (const id of C.CASE_IDS) {
  if (!ENEMIES[id]) { holes.push(id + ': no enemy'); continue; }
  const b = C.freshBook();
  b.kills[id] = C.KEPT;
  b.falls[id] = 9;
  b.rem[id] = 1;
  b.old = 1;
  for (const detail of [false, true]) {
    const html = C.pageHtml(b, id, detail, []);
    if (/undefined|NaN|\[object/.test(html)) holes.push(`${id} (${detail ? 'detailed' : 'simple'})`);
  }
  const seenOnly = C.freshBook();
  seenOnly.seen[id] = 1;
  seenOnly.falls[id] = 9;
  if (/undefined|NaN/.test(C.pageHtml(seenOnly, id, true, []))) holes.push(id + ' (seen)');
  if (/undefined/.test(C.pageHtml(C.freshBook(), id, true, ['greenwood']))) holes.push(id + ' (unknown)');
}
check('every page is written and draws cleanly', !holes.length, holes.join(', '));
check('every enemy on the road has a page', ['grunt', 'spitter', 'brute', 'stalker', 'imp', 'knight', 'wolf', 'shaman', 'scarab', 'golem', 'sporecap', 'wraith', 'glassbound', 'courtguard', 'wishling', 'ashwalker', 'unnamed', 'rootbound', 'echo', 'hush', 'boss', 'boss2', 'boss3', 'herald', 'asker', 'cinder', 'undertow', 'rootmother', 'choir', 'stillness'].every((t) => C.CASE_IDS.includes(t)));

// Unlocking
{
  const b = C.freshBook();
  check('an unknown enemy reads ???', /\?\?\?/.test(C.pageHtml(b, 'grunt', false, [])));
  check('the first kill opens a page', C.note(b, 'kill', 'grunt') !== '' && b.kills.grunt === 1 && /Villagers/.test(C.pageHtml(b, 'grunt', false, [])));
  check('a second kill says nothing new', C.note(b, 'kill', 'grunt') === '');
  check('the second note waits for KEPT kills', !/neighbour/.test(C.pageHtml(b, 'grunt', true, [])) && /2 of 25/.test(C.pageHtml(b, 'grunt', true, [])));
  for (let i = 2; i < C.KEPT - 1; i++) C.note(b, 'kill', 'grunt');
  check('...and says so when it opens', /more to say/.test(C.note(b, 'kill', 'grunt')) && /neighbour/.test(C.pageHtml(b, 'grunt', true, [])));
  check('the simple view leaves the second note and the moves out', !/neighbour|Its moves/.test(C.pageHtml(b, 'grunt', false, [])));
  check('the Herald\'s guards count as Court Guards', C.note(b, 'kill', 'heraldguard') !== '' && b.kills.courtguard === 1);
  check('things outside the book are ignored', C.note(b, 'kill', 'wishstar') === '' && !b.kills.wishstar);

  check('seeing a boss adds it', C.note(b, 'seen', 'asker') !== '' && /waiting a long time/.test(C.pageHtml(b, 'asker', false, [])));
  check('seeing it again does not', C.note(b, 'seen', 'asker') === '');
  check('no hint before it beats you', !/Odile's thoughts/.test(C.pageHtml(b, 'asker', true, [])));
  const lines = [1, 2, 3, 4, 5, 6, 7].map(() => C.note(b, 'fall', 'asker'));
  check('hints open after 1, 3 and 6 falls', lines.map((l) => (l ? 1 : 0)).join('') === '1010010', lines.join('|'));
  const simple = C.pageHtml(b, 'asker', false, []);
  const full = C.pageHtml(b, 'asker', true, []);
  check('the simple view shows only the newest hint', /remembers every wish/.test(simple) && !/nothing can hurt it/.test(simple));
  check('the detailed view shows every hint', /nothing can hurt it/.test(full) && /remembers every wish/.test(full));
  check('the trick stays hidden until it is beaten', !/8% harder|\+30% damage/.test(full));
  C.note(b, 'kill', 'asker');
  const won = C.pageHtml(b, 'asker', true, []);
  check('beating it opens the whole page', /8% harder/.test(won) && /Its moves/.test(won) && /Unasked/.test(won));
  check('falls after a win add no hints', C.note(b, 'fall', 'asker') === '' && b.falls.asker === 8);

  C.note(b, 'kill', 'boss');
  check('a Remnant note waits for a Remnant', !/Mirrored Oath/.test(C.pageHtml(b, 'boss', true, [])));
  check('...and opens with one', /Remnant/.test(C.note(b, 'kill', 'boss', { remnant: 1 })) && /Mirrored Oath/.test(C.pageHtml(b, 'boss', true, [])));
  check('unread pages are counted', b.unread > 5);
  const list = C.listHtml(b, 'asker', []);
  check('the list counts what is laid to rest', list.rested === 4 && list.total === C.CASE_IDS.length, `${list.rested}`);
  check('an old record is repaired', C.freshBook({ kills: { grunt: 3 } }).seen && C.freshBook(null).kills);
}

// The rules: a fallen hero says which boss it was fighting.
{
  const w = new World({ seed: 8, mode: 'explore' });
  w.loadMap('keep', 'ridge');
  const p = w.player;
  const boss = w.enemies.find((e) => e.type === 'boss');
  check('the Keep has its Warden', !!boss);
  if (boss) {
    p.x = boss.x + 3;
    p.z = boss.z;
    w.events = [];
    w.takeDamage(p.hp + 99999, boss, false);
    const ev = w.events.find((e) => e.type === 'playerDown');
    check('falling to the Warden names it', ev && ev.foe === 'boss', JSON.stringify(ev));
    const w2 = new World({ seed: 8, mode: 'explore' });
    w2.loadMap('greenwood', 'town');
    w2.events = [];
    w2.takeDamage(w2.player.hp + 99999, null, false);
    const ev2 = w2.events.find((e) => e.type === 'playerDown');
    check('falling with no boss about names none', ev2 && !ev2.foe, JSON.stringify(ev2));
  }
}

console.log(`\n${pass} passed, ${failed} failed`);
if (failed) process.exit(1);
