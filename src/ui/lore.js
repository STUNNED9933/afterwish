// Item descriptions (0.61.2).
//
// Every named item has a line of its own. Common to Rare gear gets just that: short, a little vague, the
// kind of thing you would say about a sword you found in a ditch. From Epic up, a second line says where
// the piece has been. Immortals have their whole story, and much of it is new: who made them, who wore
// them, and what the star did to both.
//
// Some names that turn up below:
//   Hesper Hale   the Queen's smith in Asterfell, and Bram and Edric's mother. Her mark is a running hare.
//                 She was at her anvil in the city when the star came down, and she is still there, under
//                 the sand, working the same piece of iron. Bram does not talk about it.
//   Corran        a soldier of the gate garrison whose family was on the low road when Aldric shut it. The
//                 star grants exactly: he swore never to forgive, so he never has. His is the blade of grudge.
//   the six       Wanting, Ending, Forgetting, Growing, Remembering, Enough (from the sealed letter).
import { RARITIES } from '../sim/items.js';
import { baseName } from './itemicons.js';

// --- the everyday names: one line each --------------------------------------
const BASE = {
  // swords
  'Training Sword': 'Wood, wrapped in leather. Elder Wren keeps a rack of them by the gate.',
  'Rusted Blade': 'Pulled out of the mud on the Greenwood road. It has been somebody\'s before.',
  'Iron Sword': 'Plain iron, honestly made. Bram would approve.',
  'Steel Saber': 'A cavalry blade. The horse is long gone.',
  'Runed Longsword': 'The runes down the fuller are asking for something. Nobody can read what.',
  'Frostbrand': 'Cold in the hand, even by the forge.',
  'Sunscar Scimitar': 'Sand from the Dunes still sifts out of the hilt.',
  'Gloomthorn Blade': 'Grown more than forged. Do not leave it near the garden.',
  'Stormcleaver': 'The air smells of rain when it is drawn.',
  'Obsidian Greatsword': 'Black glass from the Maw, heavy as a decision.',
  'Starforged Edge': 'Hammered from metal that came down with the star. It hums when you want something.',
  // bows
  'Training Bow': 'Pip has been practising with one just like it. Mostly on the fence.',
  'Bent Shortbow': 'It pulls a little to the left. So did its last owner.',
  'Hunter Bow': 'Made for putting food on the table.',
  'Recurve Bow': 'Shorter than it looks. Harder than it looks.',
  'Runed Longbow': 'Somebody carved a prayer for a straight flight into the limb.',
  'Frostwood Bow': 'Cut from a tree that has been frozen since the first winter.',
  'Sunscar Greatbow': 'Desert-made, and it still wants the heat.',
  'Gloomthorn Bow': 'The thorns along the limb are new every morning.',
  'Stormcall Bow': 'Loose it at the sky and the sky looks back.',
  'Obsidian Warbow': 'Black glass limbs. It does not bend so much as decide.',
  'Starstring Bow': 'The string is a single thread of starlight. It does not fray.',
  // daggers
  'Training Daggers': 'Blunted. Mostly.',
  'Rusted Shivs': 'Two bits of sharp iron and a bad attitude.',
  'Iron Daggers': 'A matched pair, if you do not look closely.',
  'Steel Stilettos': 'Made to go between things: ribs, words, people.',
  'Runed Fangs': 'The runes spell a name. You are not meant to say it.',
  'Frostbite Knives': 'Wounds from these do not bleed. They frost.',
  'Sunscar Kris': 'Wavy blades from the Dunes, for wavy sorts of work.',
  'Gloomthorn Needles': 'Dipped in something that grew in Tobin\'s garden.',
  'Stormcut Blades': 'They leave a crackle in the air behind them.',
  'Obsidian Claws': 'Black glass in the shape of something\'s hand.',
  'Starforged Fangs': 'Star metal, honed until it is almost not there.',
  // staves
  'Training Staff': 'A walking stick with ambitions.',
  'Cracked Wand': 'It still works. Mostly.',
  'Oak Staff': 'It walked a lot of miles before anyone put a spell in it.',
  'Iron-shod Staff': 'For when the spell runs out and you still need to hit something.',
  'Runed Staff': 'The runes glow when nobody is looking.',
  'Rimewood Staff': 'Frost creeps up your sleeve while you hold it.',
  'Sunscar Rod': 'Warm as a Dunes noon, in any weather.',
  'Gloomcap Staff': 'Topped with a fungus that thinks, slowly.',
  'Stormcall Staff': 'The prongs never quite stop sparking.',
  'Obsidian Scepter': 'Black glass, cut from where the Maw opens.',
  'Starcall Staff': 'Lay it down and it turns to point at the sky.',
};
// armour shares its names between slots, so it is looked up by slot
const ARMOUR = {
  helm: {
    'Leather Cap': 'Keeps the rain off, and very little else.',
    'Iron Helm': 'Dented in all the right places.',
    'Visored Helm': 'You can see out. They cannot see in.',
    'Duelist Mask': 'For fights with rules.',
    'Rimeguard Helm': 'Lined with fur from the high pass.',
    'Dune Veil': 'Keeps the sand out of everything except your boots.',
    'Gloomcap Hood': 'Smells faintly of mushrooms. It always will.',
    'Stormcrest Helm': 'The crest stands up on its own before a storm.',
    'Obsidian Visage': 'A face of black glass. It never changes its expression.',
    'Crown of Dusk': 'A crown for the end of a long day.',
  },
  chest: {
    'Padded Vest': 'Quilted by someone patient.',
    'Chain Hauberk': 'Ten thousand little rings, all keeping their promise.',
    'Plate Cuirass': 'Heavy enough to argue with.',
    'Runed Aegis': 'The runes are a ward. They are tired, but they hold.',
    'Rimeguard Plate': 'Frost forms on the outside, never the inside.',
    'Dune Wraps': 'Light layers for heavy heat.',
    'Gloomweave Coat': 'The cloth grows darker the longer you wear it.',
    'Stormplate': 'Lightning likes it. You will learn to as well.',
    'Obsidian Cuirass': 'Plates of black glass, overlapping like scales.',
    'Titan Carapace': 'Made for someone a great deal bigger. It adjusts.',
  },
  boots: {
    'Worn Boots': 'Somebody walked a long way in these.',
    'Traveler Boots': 'Made for the road down the mountain.',
    'Striders': 'Long steps, light heels.',
    'Windrunners': 'The wind pushes from behind, politely.',
    'Frostwalkers': 'Studded for the ice of the high pass.',
    'Dune Sandals': 'Sand runs off them like water.',
    'Gloomstep Boots': 'Your footprints fill with moss behind you.',
    'Stormstriders': 'Every step sounds like distant thunder.',
    'Obsidian Greaves': 'Black glass shins. Kicking is encouraged.',
    'Phase Treads': 'They land a moment before you do.',
  },
  ring: {
    'Copper Band': 'Green at the edges, warm in the hand.',
    'Silver Ring': 'A promise ring. Whose promise, it does not say.',
    'Signet': 'A family seal. The family is not around to object.',
    'Arcane Loop': 'It turns on your finger when you are not looking.',
    'Rime Band': 'It leaves a cold ring on whatever you hold.',
    'Sunscar Seal': 'Stamped with the sun as it looks over the Dunes.',
    'Gloom Ring': 'Something grows on it. Polishing does not help.',
    'Storm Loop': 'It crackles when you shake hands.',
    'Obsidian Band': 'Black glass, cool and heavy.',
    'Eternity Band': 'No join, no start, no end. Rather like the mountain.',
  },
};

// --- a second line from Epic up: where the piece has been -------------------
const PAST = {
  epic: [
    'It carries the running-hare mark of Hesper Hale\'s smithy, worn almost smooth.',
    'Made in the royal armoury of Asterfell, for someone who was expected to come back.',
    'Somebody loved this enough to keep it sharp for nineteen years.',
    'There is a name scratched near the grip, over an older name.',
  ],
  mythic: [
    'It was in Asterfell when the star came down, and it has not been quite ordinary since.',
    'Hold it near the Starwell and it leans, very slightly, toward the light.',
    'It does not age and it does not tarnish. It is very patient about both.',
    'The star touched it in passing, and some of what it heard stayed in the metal.',
  ],
  ancient: [
    'Older than Asterfell. It was found under the Low Water, among the stones of the first city.',
    'Made by people who also thought they would be remembered.',
    'The marks worked into it are not letters anyone still uses.',
    'It has outlived three kingdoms on this mountain. It is in no hurry about the fourth.',
  ],
};

// --- set pieces: the company that wore them ----------------------------------
const SET_LORE = {
  bloodbound: 'Bloodbound: the kit of Corran\'s company, the soldiers who never forgave the gate. Every piece is stamped with the same oath, and none of them has ever been allowed to forget it.',
  wardstone: 'Wardstone: cut from the first wall of the Keep, which was old before the Keep was built on it. Stone remembers being stood behind.',
  farsight: 'Farsight: the gear of the Queen\'s huntresses, who watched the borders from the high places and saw everything coming. Including, in the end, the star.',
  galeborn: 'Galeborn: made by the wind-singers of the pass, who could tell you the weather three days off and the mood of the mountain a week ahead.',
  nightcut: 'Nightcut: the working kit of the Queen\'s quiet servants. None of it was ever written into the armoury rolls, which is why it is still around.',
  veilweave: 'Veilweave: stitched by the dancers of the Asterfell court, for dances that happened mostly in the dark and ended mostly in somebody else\'s room.',
  ashen: 'Ashen: robes of the Ember Court, who kept the fires of Asterfell burning, and, as it turned out, something below them burning too.',
  rimeheart: 'Rimeheart: worn by the wardens of the high pass, who kept the cold the way other people keep a dog: fed, loyal, and never quite tame.',
};

// --- Immortals: by the name of the effect they carry (it follows your subclass) ---
const IMMORTAL = {
  // class weapons
  Stormcaller: 'Hesper Hale, the Queen\'s smith and Bram\'s mother, quenched this blade in the rain on the night the star fell, because the rain was the only thing still falling the right way. The sky has answered it ever since. Bram says his mother never made anything she could not account for. He will not say what this one was for.',
  Stormstring: 'Strung with a thread of storm glass taken from the high wraiths, which Odile says are what is left of a wish once it forgets who made it. The string hums before bad weather. Draw it under a clear sky and the sky will argue.',
  Nightfang: 'Two teeth from something that hunted the Greenwood before there was a Greenwood. They do not cut so much as remember being bitten. A contract was paid in them once, long ago. Nobody remembers who took the job, only that it was done.',
  Wishfall: 'A splinter of the falling star, set into a staff by someone who wanted it to stop falling. It never has. Speak through it often enough and it remembers the sky and comes down again, exactly where you were looking.',
  // class armour
  'Crown of the Undying': 'The Queen had it made for the Captain of her guard on the day the child was blessed, so that he would always come home. When the star heard her wish, it made the crown mean it: every life that ends near its wearer comes home to him, as strength. He has had nineteen years of practice.',
  'Aegis of Retribution': 'Hesper Hale\'s last commission for the Keep: armour for a knight who wanted to hit back. She made it, and cut one line inside the plate where only the wearer would see it. Answer. Do not keep answering.',
  'Slipstream Treads': 'Cut for the Queen\'s runners, who carried word from Asterfell to the Keep in a single day. The last of them is still running the pass, nineteen years late, with a letter nobody alive can read.',
  'The Timekeeper': 'A clockmaker in Asterfell wished, in the same breath as the Queen, for just a little more time. The star gave the whole city all of it. He made this from the hands of his own clock so he would know when it was finally over. It still ticks. It slows down near anything that is dying.',
  // uniques
  "Oathbreaker's Signet": 'Captain Aldric\'s seal, pressed into the wax of every order that kept the gate shut. The oath outlived his memory of why, and the ring has outlived the oath. Break it on a perfect parry and the oath comes down one last time, wanting only to be finished.',
  Sporeheart: 'Brother Tobin grew it in his own chest. Trial thirty-two. It was meant to teach a body to rot, so that it could rest. Instead it learned to spread. Whatever stands too close to it begins, very gently, to rot. Odile cannot bear to look at it. She asks you to wear it anyway.',
  'The Unwished Crown': 'Maren\'s crown, with the wish taken out of it. It weighs almost nothing now. The Doom that falls across the Sanctum floor was only ever the crown remembering what it was asked for. Worn by her child, it flinches from the memory, and it remembers who climbed the mountain to take it from her: it bites hardest at the things that wait at the tops of roads.',
  "Edric's Sword": 'Bram made it when he was fifteen, badly, and Edric would not carry anything else. The hare on the guard, their mother\'s mark, is crooked. Edric wore it on the far side of the gate for nineteen years, counting. It is the only thing Bram ever made that he will not take back to the forge.',
  "Edric's Colours": 'A strip of the Keep\'s blue, knotted round a band of gate iron. Edric tied it on before the gate shut, so that somebody below would know which one was him. Bram knew. He kept the forge lit.',

  // --- Berserker: the blade of grudge, and the men who carried it ---
  Bloodreaver: 'The blade of grudge. Corran of the gate garrison had a wife and two daughters on the low road the night Captain Aldric shut the gate. He swore he would never forgive it, and the star, which grants exactly, made sure he never could. He forged this from one of the gate\'s own bars, by hand, for years, badly. It drinks because he is still thirsty.',
  'Crown of the Last Breath': 'Worn by the gate guard who took the last breath anyone on the mountain needed. He breathed out as the star fell and never had to breathe in again. The crown is still waiting for the other half.',
  'Scarred Hauberk': 'Every scar in this mail is a killing blow that did not take. Hesper Hale stopped mending it after the first year. It closes on its own now, and the worse you are hurt, the harder the arm inside it swings.',
  'Red Stride': 'The boots of a soldier who ran toward the fighting every time and was never once allowed to fall. The soles are worn through to red. They never get tired. That is what frightens people about them.',
  'Oathblood Signet': 'Corran\'s second oath, cut with the same knife as the first: I will not stop. The star took him at his word. If you let it, so will the ring.',
  // --- Bulwark ---
  Wardbreaker: 'A gate-breaker\'s maul, ground down into a blade by a smith who thought there had been enough breaking. It still remembers being a door\'s worst day, and whatever it marks remembers it too.',
  'Crown of the Iron Answer': 'Hesper Hale beat it out of the lock of the Keep\'s first gate, the one that held. The answer to everything that came up that road was always the same, and the iron learned it by heart: no.',
  'Bastion Plate': 'Plate for whoever stands in the narrow place. Eleven captains of the Keep wore it, one after another, and each stood a little longer than the one before. You are the twelfth.',
  'Unyielding Greaves': 'Hesper made these for a man who asked never to have to take a step back. He never did. He is still standing on the same flagstone of the Keep wall, and the greaves he left behind miss him.',
  "Warden's Seal": 'The seal of the Warden of the Keep, who counted every blow the wall took and gave each one back. The count is still running. Wear it and it keeps yours too.',
  // --- Sharpshooter ---
  Farstring: 'Strung with gut from a white hart that ran the Greenwood for a hundred years without being caught. It wants to reach things that are very far away, and it is extremely patient about it.',
  "Hawk's Hood": 'The hood of the Queen\'s own huntress, who could see a sparrow land on the far side of the valley. She saw the star coming a full minute before anyone else. She did not look away.',
  "Rangekeeper's Coat": 'The rangekeepers walked the edges of the kingdom and never let anything get close enough to ask them a question. The coat was cut to keep that distance, and to make every arrow loosed across it count.',
  'Quickstep Boots': 'Light enough to forget you are wearing them. A huntress\'s boots, made to roll out of reach and be somewhere else by the time anything arrives.',
  'Bullseye Loop': 'The prize at the last midsummer contest in Asterfell, the year before the star. The winner put three arrows through the same hole at two hundred paces. The fourth is still in the air.',
  // --- Windrunner ---
  Galestring: 'Strung with a thread of the west wind, plucked off the rocks of the Frost Pass where it snags. It does not like being still, and it will not let its arrows be still either.',
  'Eye of the Gale': 'There is a quiet place at the middle of every storm. The woman who wore this learned to stand in it. Odile says she is standing there still, somewhere over the pass, and the storm goes round and round her.',
  'Windwoven Vest': 'Woven on a loom left out in a gale for a whole winter. The wind got into the weave and never found its way out. It hurries every arrow you loose, the way a gale hurries rain.',
  'Zephyr Treads': 'Hesper Hale\'s lightest work. There is no iron in them at all, only grey felt and a single gull\'s feather sewn into each heel. She said the wind would do the rest, and it has.',
  'Storm Sigil': 'Cut in storm glass during the last thunder before the star. Lightning has not struck the mountain since. It is all in here, waiting for a bowstring.',
  // --- Assassin ---
  'Mask of the Unseen': 'A face for people who were not supposed to have one. The Queen\'s quiet servants wore it for the work that kept the kingdom safe and was never written down. Nobody remembers their names. That was the point.',
  'Shroud of Last Rites': 'A burial shroud from a kingdom where nobody can be buried. The order that wove it gave the last rites anyway, over the dead that kept getting up. The rite still works. What it takes from the fallen, it gives to you.',
  'Silent Step': 'Felt soles, stitched with hair from a cat in the Keep\'s kitchens that was never once heard to land. The cat is still there. It has been after the same mouse for nineteen years.',
  'Contract Seal': 'The seal on a contract signed in Asterfell the night before the star. The job was never done, and the client stopped ageing, and so did the deadline. The seal still wants it finished. Every life you end brings it a little closer.',
  // --- Shadowdancer ---
  'Starglass Edge': 'Cut from the starglass that holds up the streets of Asterfell, by a thief who wanted to steal something from a city where nothing ever changes. Your reflection in it moves half a heartbeat late. Use the gap.',
  'Mirror Veil': 'A veil of mirrored glass. Look at the wearer and you see yourself, which is the last thing anyone expects. The afterimages it leaves are never quite gone when they go.',
  Shadowweave: 'Woven at dusk from the shadows the husks cast, which never quite keep up with them. It hides you in the half step between where you are and where you were, and a blade from there lands before anyone sees it coming.',
  Twinstep: 'Two pairs of boots that were once one pair, cut apart and sewn back together the wrong way round. Neither of them is sure which one is wearing you.',
  'Loop of the Second Death': 'Nobody on the mountain stays dead, so the dancers of the Keep\'s court made dying into a step you take twice. This ring keeps count of the second one.',
  // --- Pyromancer ---
  Emberheart: 'A coal from the hearth of Asterfell\'s great bakery, still burning after nineteen years, because the bread in its ovens is still warm. It remembers every fire it has ever touched, and it wants them all back.',
  'Crown of Cinders': 'The crown of the Ember Court, who served what ends before anyone in Asterfell had a name for it. When the star fell, no fire on the mountain was allowed to go out. The crown has been hungry ever since.',
  'Ashen Robe': 'Woven from the ash of the Greenwood, which burned in a single breath when the star passed over. The ash remembers the fire fondly. The more that burns around you, the brighter it glows, and so do you.',
  Cinderwalk: 'Hesper Hale shod these in iron she heated nineteen times, once for each name on the well. They leave footprints that smoke. The ground does not seem to mind.',
  'Seal of the Second Sun': 'For one moment, as the star came down, there were two suns over Asterfell. This seal was struck in that moment, by someone who was already looking up. It calls the second sun back, briefly.',
  // --- Frostbinder ---
  Rimecaller: 'Carved from the heart of a tree on the Frost Pass that froze solid in the first winter and never thawed. Odile says it is still alive in there, very slowly. It calls the cold the way a lost child calls for its mother.',
  'Glacial Crown': 'The ice it is cut from fell as snow on the night the Queen carried the child up the pass. It has not melted since. It holds still whatever it touches, the way she held on.',
  'Rimeguard Mantle': 'Worn by the wardens of the high pass, where the cold is the only thing that keeps the husks slow. The mantle learned to make a weapon of it. Everything that shatters feeds it, and it hits harder for every one.',
  Frostwalkers: 'Someone wore boots like these up the pass behind the Queen, as far as the cairn, and no further. Where they turned back, frost grew in their footprints in the shape of stars. Elder Wren will not say whose they were.',
  "Winter's Loop": 'A ring of ice around a single snowflake from the first winter, the winter of the nineteen names. It has never melted, because nothing on the mountain is allowed to. It is very, very cold.',
};

// a fixed pick for an item, so its second line never changes
function pick(list, item) {
  const s = String(item.id || item.name || '');
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

/**
 * An item's description, as HTML-safe plain text, or ''.
 * @param {object} item
 * @param {object} [fx]  for an Immortal, its effect as the wearer gets it (effectFor), whose name picks the story
 * @returns {{ text: string, kind: 'immortal'|'set'|'plain' }}
 */
export function itemLore(item, fx = null) {
  if (!item) return { text: '', kind: 'plain' };
  if (item.effect) {
    const text = (fx && IMMORTAL[fx.name]) || IMMORTAL[fx && fx.itemName] || IMMORTAL[item.name] || '';
    return { text, kind: 'immortal' };
  }
  if (item.set && SET_LORE[item.set]) return { text: SET_LORE[item.set], kind: 'set' };
  const base = baseName(item.name);
  let text = item.slot === 'weapon' ? BASE[base] || '' : (ARMOUR[item.slot] && ARMOUR[item.slot][base]) || '';
  const past = PAST[RARITIES[item.rarity] && RARITIES[item.rarity].key];
  if (text && past) text += ' ' + pick(past, item);
  return { text, kind: 'plain' };
}

/** Every Immortal story, by effect name (for tests). */
export const IMMORTAL_LORE = IMMORTAL;
