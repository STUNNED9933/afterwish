// (0.61.2) Every item has a picture and a description of its own.
// Run with: node test/items-ui.test.mjs (part of npm test).
import { WEAPONS, BASE_NAMES, EFFECTS, SPEC_IMMORTALS, SETS, RARITIES, effectFor, rollItem, rollSetPiece } from '../src/sim/items.js';
import { itemIconInner, baseName } from '../src/ui/itemicons.js';
import { itemLore, IMMORTAL_LORE } from '../src/ui/lore.js';

let pass = 0, failed = 0;
function check(name, ok, info = '') {
  if (ok) pass++;
  else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  ' + info : ''));
}
const CLASSES = Object.keys(WEAPONS);
const ARMOUR = ['helm', 'chest', 'boots', 'ring'];

// every named weapon and armour piece: its own picture, its own line
const pics = new Map(), noPic = [], noLine = [], lines = new Set();
const add = (item, label) => {
  const s = itemIconInner(item);
  if (!s || !s.includes('<path')) noPic.push(label);
  else if (!item.rarity) pics.set(s, (pics.get(s) || []).concat(label));
  const t = itemLore(item).text;
  if (!t) noLine.push(label);
  else lines.add(t);
};
for (const cls of CLASSES) WEAPONS[cls].names.forEach((n, i) => add({ slot: 'weapon', cls, name: n, rarity: 0, ilvl: i * 10 + 1 }, n));
for (const cls of CLASSES) add({ slot: 'weapon', cls, name: WEAPONS[cls].starter, rarity: 0, ilvl: 1 }, WEAPONS[cls].starter);
for (const slot of ARMOUR) BASE_NAMES[slot].forEach((n, i) => add({ slot, name: n, rarity: 0, ilvl: i * 10 + 1 }, slot + ' ' + n));
check('every weapon and armour name has a picture', noPic.length === 0, noPic.join(', '));
check('every weapon and armour name has a description', noLine.length === 0, noLine.join(', '));
const shared = [...pics.values()].filter((l) => l.length > 1 && !l.some((x) => x.startsWith('Training')));
check('no two named items share a picture', shared.length === 0, JSON.stringify(shared));
check('no two named items share a description', lines.size === 4 * 11 + 40, lines.size);

// low rarities stay short; from Epic up there is a second line, the same one every time for one item
const low = itemLore({ slot: 'weapon', cls: 'warrior', name: 'Superior Frostbrand', rarity: 2, id: 'x1' }).text;
const epic = itemLore({ slot: 'weapon', cls: 'warrior', name: 'Exalted Frostbrand', rarity: 3, id: 'x1' }).text;
check('a Rare item has just its one line', low === 'Cold in the hand, even by the forge.', low);
check('an Epic item says more, and the prefix does not hide its name', epic.startsWith('Cold in the hand') && epic.length > low.length + 20, epic);
check('...and says the same thing every time', epic === itemLore({ slot: 'weapon', cls: 'warrior', name: 'Exalted Frostbrand', rarity: 3, id: 'x1' }).text);
check('baseName strips a rarity prefix', baseName('Ancient Obsidian Cuirass') === 'Obsidian Cuirass' && baseName('Signet') === 'Signet');

// every Immortal, as every class and every subclass, has its story, and a picture of its own
const noStory = [];
for (const key in EFFECTS)
  for (const cls of CLASSES) {
    const fx = effectFor(key, cls);
    const item = { slot: EFFECTS[key].slot, cls, effect: key, name: fx.itemName, rarity: 6, ilvl: 100 };
    if (!itemLore(item, fx).text) noStory.push(fx.name);
    for (const spec in SPEC_IMMORTALS) {
      const sfx = effectFor(key, cls, spec);
      if (!itemLore(item, sfx).text) noStory.push(sfx.name);
    }
  }
check('every Immortal has its story, whatever subclass wears it', noStory.length === 0, [...new Set(noStory)].join(', '));
const immPics = new Set();
for (const key in EFFECTS) immPics.add(itemIconInner({ slot: EFFECTS[key].slot, cls: 'warrior', effect: key, rarity: 6, ilvl: 100 }));
for (const cls of CLASSES) immPics.add(itemIconInner({ slot: 'weapon', cls, effect: 'stormcaller', rarity: 6, ilvl: 100 }));
check('every Immortal has a picture of its own', immPics.size === Object.keys(EFFECTS).length + CLASSES.length - 1, immPics.size);
const longest = Math.max(...Object.values(IMMORTAL_LORE).map((t) => t.split(' ').length));
check('Immortal stories have some flavour, and still fit a tooltip', Math.min(...Object.values(IMMORTAL_LORE).map((t) => t.split(' ').length)) >= 25 && longest <= 75, longest);

// what actually drops: rolled items and set pieces all get a picture and a description
let rolledOk = true, seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 400; i++) {
  const it = rollItem(rng, 1 + (i % 100), { cls: CLASSES[i % 4], minRarity: i % 6 });
  if (!itemIconInner(it) || !itemLore(it).text) { rolledOk = false; console.log('  ', it.name); break; }
}
check('400 rolled items all have pictures and descriptions', rolledOk);
let setOk = true;
for (const cls of CLASSES) for (let i = 0; i < 20; i++) {
  const it = rollSetPiece(rng, 90, cls);
  if (!itemIconInner(it) || !itemLore(it).text.startsWith(SETS[it.set].name)) setOk = false;
}
check('set pieces show their set\'s story', setOk);
check('an item from an older save (a name no longer used) still gets a picture', !!itemIconInner({ slot: 'chest', name: 'Old Forgotten Thing', rarity: 0, ilvl: 33 }));
check('Immortals are not drawn in the rarity colour alone', itemIconInner({ slot: 'helm', effect: 'undying', rarity: 6, ilvl: 100 }).includes(RARITIES[6].color));

console.log(`\n${pass} passed, ${failed} failed`);
if (failed) process.exit(1);
