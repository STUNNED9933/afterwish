// The story, told the way the player finds it: people in Haven who give quests,
// and signs, notes and carvings left along the road. Everything here is data;
// sim/world.js tracks progress and pays rewards, and the UI just shows the text.
//
// THE STORY (spoilers, kept here so the pieces below stay consistent)
// Nineteen years ago the ash-fever was killing the mountain kingdom of
// Asterfell, and Queen Maren's newborn child with it. A star fell on the peak.
// The Queen carried the child up to it and asked: "Let nothing I love be taken
// from me." The star grants exactly what is asked. Nothing she loved could die
// any more, and she loved her whole kingdom. They did not die; they wore out
// and emptied, and they get back up every time they fall. Those are the Husks.
//   - Captain Aldric barred the Keep's gate from the inside so the unmaking
//     would not reach the low road. He is still guarding it: The Warden.
//   - Brother Tobin, the royal physician, tried to grow a cure that would let
//     people die, from the one thing that still rots. It grew through him:
//     The Mycelord.
//   - The Queen is still at the top, beside the star: The Unmade.
//   - Her nurse, Wren, carried the child down to Haven and never told it.
// The child is the hero. That is why the hero wakes up in Haven after every
// defeat, and why The Unmade rises again two minutes after she falls: the wish
// holds for as long as there is something left that she loves.
//
// THE ECHO RING (the arena)
// Before he went up the mountain for good, Tobin set shards of the fallen star
// into a ring of standing stones on the hill behind Haven, to study it. The
// glass remembers. Press a shard into the stones and they call up echoes of
// what the mountain has made, wave after wave, and at the deepest waves the
// echoes of the three who became bosses. Echoes fall like anything else and
// keep coming. Every unmade creature carries a sliver of the star inside it,
// which is why the things on the road drop starglass shards (the "tickets" in
// the code), and why the Ring needs one to wake. Sister Odile, Tobin's
// apprentice, is the one who knows what the stones are.

/** People in Haven. `at` is where they stand; `look` is how they are drawn. */
export const NPCS = {
  wren: {
    name: 'Elder Wren', role: 'Elder of Haven', at: [-3.4, -2.0],
    look: { robe: 0x6a5a7a, trim: 0xd8cfc0, hair: 0xe8e4dc, scale: 0.95 },
    greet: 'Sit, child. You have your mother\'s way of standing in a doorway. ... Never mind. What do you need?',
    idle: 'Go and see what there is to see. I will be here. I am always here.',
  },
  bram: {
    name: 'Bram', role: 'Smith', at: [6.4, -2.8],
    look: { robe: 0x5a3a2a, trim: 0x2a2a30, hair: 0x3a2a20, scale: 1.1 },
    greet: 'Forge is hot. If it came off the mountain, I can use it. If it came off the Keep, don\'t tell me whose it was.',
    idle: 'Nothing I need just now. Come back when you have a few more levels on you.',
  },
  odile: {
    name: 'Sister Odile', role: 'Herbalist', at: [-6.4, 1.8],
    look: { robe: 0x3a6a5a, trim: 0xe8e4dc, hair: 0x8a5a3a, scale: 1 },
    greet: 'I was a physician\'s apprentice once, up the mountain. I left. I am still deciding whether that was the right thing.',
    idle: 'I have what I need for now. Thank you for asking. Few do.',
  },
  pip: {
    name: 'Pip', role: 'Orphan of the Greenwood road', at: [3.2, 3.6],
    look: { robe: 0xb0522e, trim: 0xd8b060, hair: 0x5a3a20, scale: 0.68 },
    greet: 'Are you going out the gate? You always come back. Nobody else always comes back.',
    idle: 'I\'m all right. I\'m watching the gate. Somebody should.',
  },
};

/**
 * Things you can read. Two per map; `spot` says where the map builder puts it:
 * 'in' = just inside the entrance, 'out' = by the far side, or [x, z] in Haven.
 */
export const SIGNS = {
  haven1: { map: 'town', spot: [9.4, 2.7], title: 'Town notice board', text: 'HAVEN. All who come down the mountain are welcome here.\n\nDo not go back up for the ones you left. They will not know you.\n\n— Elder Wren' },
  haven3: { map: 'town', spot: [-9.6, 3.6], title: 'Path marker on the hill road', text: 'TO THE STONES.\n\nScratched underneath, in a careful hand: The glass remembers. Bring a shard, and do not go in looking for anyone you lost.\n\n— O.' },
  haven2: { map: 'town', spot: [2.0, -5.9], title: 'The well stone', text: 'Nineteen names are cut into the rim: the dead of the first winter, before the star.\n\nThey are the last names anyone in Haven has had to carve.' },

  green1: { map: 'greenwood', spot: 'in', title: 'Milestone', text: 'ASTERFELL, 9 leagues. By order of Queen Maren this road is kept safe for all who travel it.\n\nBelow, scratched with a knife: TURN BACK.' },
  green2: { map: 'greenwood', spot: 'out', title: 'A note nailed to a tree', text: 'Tomas. If you can read this, I have taken Pip down to Haven.\n\nWe waited four days. You walked past the door every dusk, the way you always came home, but you would not come in.\n\n— H.' },

  fen1: { map: 'fen', spot: 'in', title: 'Flood marker', text: 'The fever came up with the low water in the year of the ash. Burn the bedding. Boil the water. Keep the children apart.\n\nThere is no cure. I am sorry.\n\n— Brother Tobin, Royal Physician' },
  fen2: { map: 'fen', spot: 'out', title: "Ferryman's tally", text: 'Carried up to the Keep for the Queen\'s blessing: 40. Then 112. Then 300.\n\nThe last line, in a different hand: None come back down. None are buried, either.' },

  ridge1: { map: 'ridge', spot: 'in', title: 'Scorched shrine', text: 'Here the star passed over. The whole wood burned in one breath.\n\nWe thought it was the end of the world. It was only the start of it not ending.' },
  ridge2: { map: 'ridge', spot: 'out', title: "A soldier's letter, never sent", text: 'Bram. The Captain says the gate shuts tonight and we stay on this side of it. He says it is the only way to keep this off the low road.\n\nTell mother I chose it. Keep the forge lit.\n\n— Edric' },

  keep1: { map: 'keep', spot: 'in', title: 'Order posted on the gate', text: 'By my hand this gate is barred. None pass down the mountain. Not the sick, not the well, not me.\n\nIf I forget why, let the oath remember for me.\n\n— Aldric, Captain of the Queen\'s Shield' },
  keep2: { map: 'keep', spot: 'out', title: 'Scratched inside the wall', text: 'Tally marks, thousands of them. Then:\n\nI do not sleep. I do not hunger. Men I buried stand their watch again. I have stopped counting days.\n\nI still count the gate.' },

  frost1: { map: 'frost', spot: 'in', title: 'Cairn', text: 'The Queen carried the child up this pass on foot, in the snow, with the fever on it. She would not let anyone else hold it.\n\nI followed as far as these stones.\n\n— W.' },
  frost2: { map: 'frost', spot: 'out', title: 'Frozen prayer flags', text: 'The same words on every flag, in the same hand, smaller each time:\n\nLet nothing I love be taken from me.' },

  dunes1: { map: 'dunes', spot: 'in', title: 'Half-buried statue', text: 'MAREN, who loved her people as her own children. Raised by the grateful city of Asterfell.\n\nThe city is under the sand now. Where the star came down, the fields turned to dust and glass.' },
  dunes2: { map: 'dunes', spot: 'out', title: 'Survey stone', text: 'What the star grants, it grants exactly. Ask it for bread and there is bread. Ask that nothing die, and nothing dies.\n\nIt was not asked to let them stay themselves.\n\n— Tobin' },

  hollow1: { map: 'hollow', spot: 'in', title: 'Garden ledger', text: 'Gloomcap is the only thing on this mountain that still rots. If a body can be taught to rot again, they could rest.\n\nTrial 31: the wolves. No.\nTrial 32: myself.\n\n— T.' },
  hollow2: { map: 'hollow', spot: 'out', title: 'The last page', text: 'Odile, do not come back. It worked on me, a little. I can feel the garden thinking.\n\nI am so glad you left. Tell them I was only trying to give them an ending.' },

  spire1: { map: 'spire', spot: 'in', title: 'Stair marker, split by lightning', text: 'The Sanctum stair. The Queen went up with the child in her arms.\n\nThe nurse came down with it at dawn, alone, and would not say what she had seen.' },
  spire2: { map: 'spire', spot: 'out', title: "A knight's last entry", text: 'The Captain sends us up one at a time to beg her to unsay it. None of us can find the words once we see her face.\n\nShe asks each of us the same thing: is the child safe?' },

  maw1: { map: 'maw', spot: 'in', title: 'The crater\'s edge', text: 'Here the star struck. It is not a stone.\n\nStand close and you can hear it asking what you want.' },
  maw2: { map: 'maw', spot: 'out', title: 'Written in the glass with a fingertip', text: 'I only wanted my baby to live. I only wanted them all to live.\n\nIs that so much. Is that so much. Is that' },

  sanctum1: { map: 'sanctum', spot: 'in', title: 'The cradle', text: 'An empty cradle of star-glass, still warm.\n\nA name is set into the headboard. The letters will not hold still when you look at them, until you notice that they are yours.' },
  sanctum2: { map: 'sanctum', spot: 'out', title: 'The wish, written in light', text: 'LET NOTHING I LOVE BE TAKEN FROM ME.\n\nBelow it, newer, unsteady:\n\nI cannot stop loving them. I have tried. Forgive me. Come home.' },
};
for (const id in SIGNS) SIGNS[id].id = id;
export const SIGN_IDS = Object.keys(SIGNS);

// Quests.
//   giver   who offers it and pays it out
//   level   what level it is meant for (sets the size of the rewards, and it is
//           not offered until you are within 4 levels of it)
//   after   a quest that must be finished first
//   goal    { kill: n, enemy?, map?, boss? }  kill n enemies (of a type / on a map / a boss)
//           { reach: mapId }                  walk into a map
//           { read: n }                       have read n signs in total
//           { wave: n }                       clear wave n in the Echo Ring (the arena)
//   reward  exp:   fraction of the level's EXP bar
//           gold, scrap: base amounts, scaled up by the quest's level
//           item:  minimum rarity of a piece of gear (0 common .. 6 immortal), slot optional
//           keys, tickets, skill (skill points)
//   repeat  can be taken again after it is handed in
export const QUESTS = {
  // --- Elder Wren: the main story ---------------------------------------------
  road: {
    giver: 'wren', level: 1, name: 'The Road Out', goal: { reach: 'greenwood' },
    offer: 'Every year you ask me where you came from, and every year I say "the mountain" and find something to do with my hands. Walk the Greenwood road first. See what is on it. Then ask me again.',
    done: 'You saw them. They were farmers once, and carters, and somebody\'s da. Do not hate them. They do not know what they are doing.',
    reward: { exp: 0.6, gold: 40, item: 1, slot: 'boots' },
  },
  husks: {
    giver: 'wren', level: 2, after: 'road', name: 'They Get Back Up', goal: { kill: 12, enemy: 'grunt' },
    offer: 'Put twelve of the Husks down. Then stay a moment and watch what happens after. I need you to understand what we are living next to.',
    done: 'They stood up again, did they not. Nothing on that mountain can die. It sounds like a blessing until you have watched it for nineteen years.',
    reward: { exp: 0.8, gold: 60, item: 1 },
  },
  stones: {
    giver: 'wren', level: 5, after: 'husks', name: "Other People's Words", goal: { read: 4 },
    offer: 'I am a coward about this story. Others wrote parts of it down as it happened: milestones, notes, things nailed to trees. Read four of them and spare me the telling.',
    done: 'So you know there was a queen, and a fever, and a star. Her name was Maren. I was her nurse. That is as much as I can say today.',
    reward: { exp: 0.7, gold: 80, tickets: 1 },
  },
  gate: {
    giver: 'wren', level: 30, after: 'stones', name: 'The Locked Gate', goal: { reach: 'keep' },
    offer: 'The Keep\'s gate has been barred for nineteen years. The man who barred it did it to protect us, down here. Go and look at what that cost him.',
    done: 'Aldric. He was the best of them. He shut that gate so nothing unmade would reach the low road, and he has stood behind it ever since, long after he forgot what it was for.',
    reward: { exp: 0.5, gold: 120, item: 2 },
  },
  warden: {
    giver: 'wren', level: 40, after: 'gate', name: 'Captain Aldric', goal: { kill: 1, boss: 'boss' },
    offer: 'There is no reasoning with him. I tried, years ago. If you mean to go higher you must go through him. Be quick about it. He was kind to me.',
    done: 'He will be on his feet again by now. But for a moment he was allowed to stop. Thank you for that.',
    reward: { exp: 1.2, gold: 400, item: 4, keys: 1, skill: 2 },
  },
  pass: {
    giver: 'wren', level: 42, after: 'warden', name: 'Past the Gate', goal: { reach: 'frost' },
    offer: 'Above the Keep is the pass the Queen climbed with her child in her arms. I walked behind her. There is a cairn where I stopped. Find it.',
    done: 'I should have carried you— carried the child myself. She would not let go. She had not let go of it in three days.',
    reward: { exp: 0.5, gold: 160, item: 3 },
  },
  gardener: {
    giver: 'wren', level: 70, after: 'pass', name: 'The Gardener', goal: { kill: 1, boss: 'boss2' },
    offer: 'Brother Tobin was the gentlest man in Asterfell. He spent his last years looking for a way to let people die. Sister Odile will not speak of what he became. Give him the ending he wanted, even if it does not last.',
    done: 'He wanted so badly to fix it. They all did. Not one of them was wicked, child. I need you to remember that when you reach the top.',
    reward: { exp: 1.2, gold: 700, item: 5, keys: 2, skill: 2 },
  },
  stair: {
    giver: 'wren', level: 90, after: 'gardener', name: 'The Last Stair', goal: { reach: 'sanctum' },
    offer: 'There is a cradle at the top of the stair. I want you to read the name on it before you hear it from me.',
    done: 'Yes. It is yours. You were dying, and she climbed to the star and asked that nothing she loved be taken from her. You were the first thing it saved.\n\nHave you never wondered why you always wake up here?',
    reward: { exp: 0.5, gold: 300, item: 4 },
  },
  unmade: {
    giver: 'wren', level: 100, after: 'stair', name: 'Let Her Rest', goal: { kill: 1, boss: 'boss3' },
    offer: 'The thing in the Sanctum is your mother. She loved a whole kingdom, so the wish took the whole kingdom. Put her down, child. There is no one else I can ask.',
    done: 'She will rise again. The wish holds for as long as there is something left that she loves, and she will never stop loving you, and you cannot die.\n\nSo there is no ending. There is only the kindness of letting her sleep, two minutes at a time.\n\nI am sorry. I should have told you when you were small.',
    reward: { exp: 0, gold: 2000, item: 6, keys: 3, skill: 3 },
  },
  again: {
    giver: 'wren', level: 100, after: 'unmade', repeat: true, name: 'Come Home', goal: { kill: 1, boss: 'boss3' },
    offer: 'She asks every knight who reaches her whether the child is safe. Go up and let her see that you are. Then let her sleep.',
    done: 'Two minutes of quiet on the mountain. It is not nothing. It is all any of us have managed in nineteen years.',
    reward: { exp: 0, gold: 900, item: 4, keys: 1 },
  },

  // --- Bram the smith ---------------------------------------------------------
  spit: {
    giver: 'bram', level: 10, name: 'Scrap for the Forge', goal: { kill: 10, enemy: 'spitter' },
    offer: 'Spitters carry good wire in them, don\'t ask me why. Ten of them and I can re-string every bow in Haven.',
    done: 'That\'ll do. Funny thing: this wire is the Queen\'s make. Fence wire, from the royal orchards. They were orchard hands.',
    reward: { exp: 0.7, gold: 70, scrap: 14, item: 2, slot: 'weapon' },
  },
  imps: {
    giver: 'bram', level: 22, name: 'Cinders', goal: { kill: 15, enemy: 'imp' },
    offer: 'The little burning ones on the Ridge. Fifteen. They are what is left of the charcoal-burners\' children, people say. I say put them out.',
    done: 'Quiet up there for an hour or so, then. Take this. I made it the night my brother didn\'t come down.',
    reward: { exp: 0.8, gold: 110, scrap: 20, item: 2, slot: 'helm' },
  },
  knights: {
    giver: 'bram', level: 32, name: "My Brother's Colours", goal: { kill: 12, enemy: 'knight' },
    offer: 'My brother Edric stayed behind the gate with the Captain. Blue trim on the pauldron; he was proud of that. If you see blue trim... no. Don\'t tell me. Just put twelve of them down so they can rest a minute.',
    done: 'Twelve. Was one of them... no. I said don\'t tell me. Here. I kept the forge lit, like he asked. It should be for something.',
    reward: { exp: 1, gold: 180, scrap: 30, item: 3, slot: 'chest' },
  },
  stone: {
    giver: 'bram', level: 52, name: 'Stone Breaker', goal: { kill: 8, enemy: 'golem' },
    offer: 'Those walking statues in the Dunes are the city\'s own masonry. Asterfell is trying to stand back up. Eight of them, and bring me what the hammers are made of.',
    done: 'Good stone. They built that city to last. Nobody meant for it to last like this.',
    reward: { exp: 1, gold: 260, scrap: 45, item: 3, slot: 'weapon' },
  },
  glass: {
    giver: 'bram', level: 82, name: 'Black Glass', goal: { kill: 20, map: 'maw' },
    offer: 'The crater glass takes an edge like nothing I\'ve worked. Clear twenty of whatever lives in the Maw and I will make you something worth carrying to the top.',
    done: 'There. Best thing I have ever made. I hope you never need to use it on anyone you know.',
    reward: { exp: 1, gold: 500, scrap: 80, item: 5, slot: 'weapon' },
  },

  // --- Sister Odile -----------------------------------------------------------
  stalk: {
    giver: 'odile', level: 12, name: 'Bitter Roots', goal: { kill: 10, enemy: 'stalker' },
    offer: 'The Stalkers in the Fen were the ferrymen\'s hounds. They still run the same banks. Ten of them, please. I need the fen-root they keep trampling.',
    done: 'Thank you. This will keep a fever down. It would not have kept that fever down. Nothing did.',
    reward: { exp: 0.7, gold: 80, item: 2, slot: 'ring' },
  },
  rime: {
    giver: 'odile', level: 42, name: 'Cold Hands', goal: { kill: 12, enemy: 'shaman' },
    offer: 'The Rime Callers on the pass were the Queen\'s chaplains. They went up to pray with her and came down like that. Twelve. I knew some of their names.',
    done: 'I used to bring them tea in the winter. Take this. Please be careful up there; the pass takes people who stop to think.',
    reward: { exp: 0.9, gold: 220, item: 3, slot: 'ring' },
  },
  spore: {
    giver: 'odile', level: 62, name: 'What He Grew', goal: { kill: 15, enemy: 'sporecap' },
    offer: 'The Hollow was my master\'s garden. Every Sporecap in it is one of his trials. Fifteen of them. I should have stayed and stopped him. I should have stayed and helped him. I do not know which.',
    done: 'He wrote me a last page, did he? ... He was glad I left. I have waited nineteen years for someone to tell me that.',
    reward: { exp: 1, gold: 320, item: 4, slot: 'helm' },
  },
  ringglass: {
    giver: 'odile', level: 6, name: 'What the Glass Remembers', goal: { wave: 5 },
    offer: 'There is a ring of standing stones on the hill behind Haven. My master set starglass into them, years ago, to study the star. Now the glass remembers things. Press a shard into the stones and they will show you. Clear five waves of whatever they show, and tell me if you saw anything you recognised.',
    done: 'Husks, and spitters, and at the end something that wore a captain\'s armour. Brother Tobin wanted the stones to show him the star. They show us everything it took instead.\n\nKeep the shards you find on the road. Every one of those poor things carries a sliver of it inside.',
    reward: { exp: 0.6, gold: 80, tickets: 2 },
  },
  ringlast: {
    giver: 'odile', level: 40, after: 'ringglass', name: 'The Oldest Echo', goal: { wave: 15 },
    offer: 'The deeper you go in the Ring, the older the echoes. Some of the hill folk say the fifteenth is not an echo of a monster at all, but of someone the mountain cannot stop remembering. Go and see. Then come back and tell me. Slowly.',
    done: 'It spoke to you? ... It asked whether the child was safe.\n\nThe stones carried that question all the way down the mountain. I think it is the only thing the mountain still says. I do not know whose child she means. I am not sure I want to.',
    reward: { exp: 1, gold: 300, item: 4, tickets: 3 },
  },
  wraith: {
    giver: 'odile', level: 72, name: 'Storm Glass', goal: { kill: 15, enemy: 'wraith' },
    offer: 'The Wraiths on the Cliffs are the ones who tried to climb past the Keep to reach her. They never arrived and they never stopped. Fifteen. Let them stop for a while.',
    done: 'There is a calm that comes over the cliffs for a few minutes when enough of them are down. You can see Haven from there. I wonder if they can.',
    reward: { exp: 1, gold: 380, item: 4, slot: 'boots' },
  },
  star: {
    giver: 'odile', level: 92, name: 'Star Dust', goal: { kill: 20, map: 'sanctum' },
    offer: 'I have one idea left. If the star grants exactly what is asked, perhaps it can be asked something else. Clear twenty from the Sanctum and bring me the dust that falls from them.',
    done: 'It is not dust. It is the same thing as the star, in very small pieces. It asked me what I wanted.\n\nI did not answer. I have seen what answers cost.',
    reward: { exp: 1, gold: 600, item: 5, slot: 'ring' },
  },

  // --- Pip --------------------------------------------------------------------
  scarf: {
    giver: 'pip', level: 3, name: 'Red Scarf', goal: { kill: 8, enemy: 'grunt', map: 'greenwood' },
    offer: 'My da is on the Greenwood road. He has a red scarf. He doesn\'t know me any more. Can you... make him lie down for a bit? He looks so tired.',
    done: 'Did he look peaceful? ... Okay. Thank you. I\'ll go and wave at him tomorrow. From far away. Here, I found this. You can have it.',
    reward: { exp: 0.8, gold: 30, item: 2, slot: 'ring' },
  },
  wolves: {
    giver: 'pip', level: 44, name: 'Something Howling', goal: { kill: 10, enemy: 'wolf' },
    offer: 'I can hear them at night, from the pass. Da used to say wolves only howl when they have lost someone. They\'ve been howling since before I was born.',
    done: 'It was quiet last night. I didn\'t like it as much as I thought I would. Is that strange?',
    reward: { exp: 0.9, gold: 150, item: 3, slot: 'boots' },
  },
};
for (const id in QUESTS) QUESTS[id].id = id;
export const QUEST_IDS = Object.keys(QUESTS);

/** What a boss gives when it falls out in the world (see World.bossRewards). */
export const BOSS_LOOT = {
  //        items dropped, their minimum rarity, how many are a step better, odds for the best one
  boss: { items: 3, min: 2, better: 1, top: [0, 0, 0, 55, 33, 10, 2], keys: 1, tickets: 1, first: 4 },
  boss2: { items: 4, min: 3, better: 1, top: [0, 0, 0, 0, 62, 30, 8], keys: 2, tickets: 1, first: 5 },
  boss3: { items: 6, min: 3, better: 2, top: [0, 0, 0, 0, 50, 35, 15], keys: 3, tickets: 2, first: 6 },
};
