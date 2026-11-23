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
import { SETTLERS } from './wishkeep.js';

export const NPCS = {
  wren: {
    name: 'Elder Wren', role: 'Elder of Haven', at: [-3.4, -2.0],
    look: { robe: 0x6a5a7a, trim: 0xd8cfc0, hair: 0xe8e4dc, scale: 0.95 },
    greet: 'Sit, child. You have your mother\'s way of standing in a doorway. ... Never mind. What do you need?',
    idle: 'Go and see what there is to see. I will be here. I am always here.',
    after: 'The husks on the road lay down in the night, all of them, the way people lie down when they are finally tired. I carried you down that mountain. I would do it again.',
  },
  bram: {
    name: 'Bram', role: 'Smith', at: [6.4, -2.8],
    look: { robe: 0x5a3a2a, trim: 0x2a2a30, hair: 0x3a2a20, scale: 1.1 },
    greet: 'Forge is hot. If it came off the mountain, I can use it. If it came off the Keep, don\'t tell me whose it was.',
    idle: 'Nothing I need just now. Come back when you have a few more levels on you.',
    after: 'Forge went cold this morning for the first time in nineteen years. I just stood there and let it. Then I lit it again. Some things you keep.',
  },
  odile: {
    name: 'Sister Odile', role: 'Herbalist', at: [-6.4, 1.8],
    look: { robe: 0x3a6a5a, trim: 0xe8e4dc, hair: 0x8a5a3a, scale: 1 },
    greet: 'I was a physician\'s apprentice once, up the mountain. I left. I am still deciding whether that was the right thing.',
    idle: 'I have what I need for now. Thank you for asking. Few do.',
    after: 'Things rot now. The herbs I picked yesterday are wilting. I have never been so glad to see something die. He would have laughed. Tobin, I mean.',
    garden: 'It is quieter here than you would think. He is nearly done. I will tell him you came.',
  },
  pip: {
    name: 'Pip', role: 'Orphan of the Greenwood road', at: [3.2, 3.6],
    look: { robe: 0xb0522e, trim: 0xd8b060, hair: 0x5a3a20, scale: 0.68 },
    greet: 'Are you going out the gate? You always come back. Nobody else always comes back.',
    idle: 'I\'m all right. I\'m watching the gate. Somebody should.',
    after: 'He came in. Dad came in, and sat by the fire, and he knew me. Then he went to sleep. Wren says that is all right now. I think it is.',
    rest: "I wear the scarf every day. Wren says it's too big for me. I'll grow into it.",
    walk: 'I walked next to Da today, as far as the bridge. He didn\'t know me. He slowed down a bit, though. I think he slowed down for me.',
  },
  // Red Scarf, Part Two (0.47): Pip's father on the Greenwood road, still walking home.
  tomashusk: {
    name: 'Tomas', role: 'a husk with a red scarf', where: 'greenwood', husk: true,
    look: { robe: 0x5a5a4a, trim: 0xb02a2a, hair: 0x2a2a2a, scale: 1 },
    greet: "He does not look at you. He is walking, slowly, toward Haven, the way he has walked every evening for nineteen years. The red scarf is wound twice round his neck. His lips move: a name, over and over. Pip's name.",
    idle: 'He keeps walking.',
  },
  // An Ending for Tobin (0.47): Odile's apprentice, at her stall once she has gone to the garden.
  lark: {
    name: 'Lark', role: "Odile's apprentice, at her stall", at: [-6.4, 1.8], as: 'odile', onlyFlag: 'tobin',
    look: { robe: 0x6a8a5a, trim: 0xd8c8a0, hair: 0xc89a4a, scale: 0.92 },
    greet: "Sister Odile's in the garden now, with Brother Tobin. She left me her notes and her stall. And her opinions about the thyme.\n\nWhat can I get you?",
    idle: "Sister Odile's notes say you're not to buy anything you don't need. I'm ignoring that bit.",
  },
  // Pip's father (0.45): after the Unwish he comes home, once. onlyAfter: only in Haven then, until spoken to.
  tomas: {
    name: 'Tomas', role: "Pip's father, home", at: [4.6, 4.9], onlyAfter: true,
    look: { robe: 0x4a5a3a, trim: 0x8a7a5a, hair: 0x3a2a1a, scale: 1.02 },
    greet: 'I walked past this door every dusk for nineteen years. I could never remember why I should not come in. Tonight I remembered I could.\n\nWhere is my boy? No, do not tell me. I can hear him. I will just sit with him a while.',
    idle: 'I will just sit with him a while.',
  },
};
// (0.80) The Wishkeep's settlers (sim/wishkeep.js) talk like anyone else; they are not in Haven (no `at`).
for (const id in SETTLERS) NPCS[id] = { name: SETTLERS[id].name, role: SETTLERS[id].role, look: SETTLERS[id].look, greet: SETTLERS[id].greet, idle: SETTLERS[id].greet, keep: true };


/**
 * Things you can read. Two per map; `spot` says where the map builder puts it:
 * 'in' = just inside the entrance, 'out' = by the far side, or [x, z] in Haven.
 */
export const SIGNS = {
  haven1: { map: 'town', spot: [9.4, 2.7], title: 'Town notice board', text: 'HAVEN. All who come down the mountain are welcome here.\n\nDo not go back up for the ones you left. They will not know you.\n\n— Elder Wren', after: 'HAVEN. All who come down the mountain are welcome here.\n\nThe old notice is gone. Under where it hung, in the same hand:\n\nYou may go back up for the ones you left now. Go gently. Bury them.\n\n— Elder Wren' },
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
  // The Shattered Wilds (0.33): what the wish broke, after.
  // Act II (0.39): what Wren buried, and the city under the sand.
  frost3: { map: 'frost', spot: [-29.4, 20.2], title: 'Under the cairn, a letter in oilcloth', text: 'Wren. If the child lives, the wish lives: it holds on to what she loved most.\n\nIt cannot be broken, but it can be let go, at the well the star made under Asterfell. It needs the child to want nothing at all. I cannot ask that of a baby. Perhaps one day someone can ask it of them grown.\n\nBurn this if you love them.\n\n— Tobin' },
  aster1: { map: 'asterfell', spot: 'in', title: 'The city gate', text: "ASTERFELL. The Queen's city.\n\nCut underneath, fresh as if it were yesterday: POPULATION: ALL OF IT, STILL." },
  aster2: { map: 'asterfell', spot: [34, 10], title: "Tobin's survey stone, I", text: 'The glass that holds up these streets was poured in the moment the star struck. Nothing here has aged a day since. The bread in the ovens is still warm.\n\n— T.' },
  aster3: { map: 'asterfell', spot: [-12, 33], title: "Tobin's survey stone, II", text: 'A wish needs something to hold on to. Hers holds on to the child. For as long as the child lives and is loved, the wish holds.\n\n— T.' },
  aster4: { map: 'asterfell', spot: [-34, -12], title: "Tobin's survey stone, III", text: 'Fire, iron, prayer, and at last the rot from my own garden: none of it breaks the wish. But at the well where the star came down, the one it holds on to can let it go.\n\n— T.' },
  // Act III (0.54): Tobin's sealed notes, and a stone at the top of each Depth
  sealed: { map: 'asterfell', spot: [0, 22], title: "Tobin's sealed notes", text: 'Sealed with wax and buried under the court steps. Not meant for the Queen.\n\nThe fever did not come from the low town. It came from below the low water, from below the mountain, from below everything. I went down the old mine at Asterfell\'s root and found the heat coming up through the stone like breath.\n\nSomething down there was waking. Not sick. Not angry. Only waking, the way the sea comes in.\n\nThen the star fell, and the breathing stopped. I do not think the star was the answer. I think it was another one of them.\n\n— T.' },
  deep6: { map: 'deep6', spot: 'in', title: 'Scratched on a coal', text: 'There are six of them. The star was only the one that fell.\n\nWanting. Ending. Forgetting. Growing. Remembering. Enough.\n\nThey are not gods. They are what the world does.' },
  deep7: { map: 'deep7', spot: 'in', title: 'A name stone, worn blank', text: 'There was a name carved here. The water took it. Under the water, the shape of a city older than Asterfell, built on the same rock, by people who also thought they would be remembered.' },
  deep8: { map: 'deep8', spot: 'in', title: "A gardener's label", text: "In Tobin's hand, pushed into the roots: 'NOT A CURE. A KINDNESS. SHE LETS THINGS FINISH.'" },
  deep9: { map: 'deep9', spot: 'in', title: 'A glass pane', text: 'Pressed to it, you can hear them: the Queen humming, Edric counting, Tomas saying a name. Your own voice is in there too, from lives you have let go.' },
  deep10: { map: 'deep10', spot: 'in', title: 'Nothing', text: 'The stone is blank. You read it anyway.' },
  deep6b: { map: 'deep6', spot: [16, -18], title: 'A miner\'s tally', text: 'Day 40. The heat comes up through the floor like breath. In, and out. In, and out.\n\nDay 41. It stopped. The whole mountain held its breath. Something fell on the peak.' },
  deep7b: { map: 'deep7', spot: [-18, 14], title: 'A drowned plaque', text: '"HERE STOOD", and nothing else. The rest is water.' },
  deep8b: { map: 'deep8', spot: [18, 16], title: 'A root, carved', text: 'A heart, and two letters inside it, grown over. The tree kept them. It keeps everything that grows into it.' },
  deep9b: { map: 'deep9', spot: [-16, -18], title: 'Your own handwriting', text: 'It is your hand, from a life you let go of: "If you read this, I made it this far. Keep going. You will be someone else by the time you get to the bottom, and that is all right."' },
  // Caelum (0.64): a stone by each way in, and one at each shrine at the end of a side path
  skyroad: { map: 'skyroad', spot: 'in', title: 'Above the Starwell', text: 'Every wish ever made on the mountain went up. Some of them were caught.\n\nThe road is white because nothing here has ever been walked on by anyone who wanted to leave.' },
  skyroad1: { map: 'skyroad', spot: 'shrine1', title: 'A door', text: 'A door with no wall around it. On the step, someone has scratched: I wished to be let in. I was.' },
  skyroad2: { map: 'skyroad', spot: 'shrine2', title: 'Two faces', text: 'The Doorkeeper looks both ways at once. Coming and going are the same to it. You should not be.' },
  answers: { map: 'answers', spot: 'in', title: 'The Court of Answers', text: 'Every question asked on the mountain is filed here, with its answer. None of the answers are kind. All of them are true.' },
  answers1: { map: 'answers', spot: 'shrine1', title: 'Case closed', text: 'A scale, perfectly level, with nothing in either pan. A plaque: It was asked to be fair.' },
  answers2: { map: 'answers', spot: 'shrine2', title: 'The blindfold', text: 'It wears the blindfold so it cannot see who is asking. It was a mercy, once.' },
  wants: { map: 'wants', spot: 'in', title: 'The Hall of Wants', text: 'Gold, crowns, rings, small wooden horses. Everything anyone ever wanted, given, and kept here, because having it was not the same.' },
  wants1: { map: 'wants', spot: 'shrine1', title: 'An offering', text: 'A child\'s shoe on top of a pile of crowns. Someone wanted to go home. They were given a house.' },
  wants2: { map: 'wants', spot: 'shrine2', title: 'Still hungry', text: 'The want at the end of this hall was never answered, because it was the asking itself. It will not stop. Do not try to fill it.' },
  zenith: { map: 'zenith', spot: 'in', title: 'The Zenith', text: 'The top of the sky. The air is very still and very bright, and the light does not come from anywhere.' },
  zenith1: { map: 'zenith', spot: 'shrine1', title: 'Let it be done', text: 'Carved small, near the ground, in a hand you almost know: Every wish is a little bit of no. It has never learned that.' },
  zenith2: { map: 'zenith', spot: 'shrine2', title: 'The last answer', text: 'It answered the Queen. It answered the star. It will answer you, if you ask. Think about what you want first.' },
  deep10b: { map: 'deep10', spot: [14, 14], title: 'The last stone', text: 'Six of them. Wanting asked what you wanted. Enough will ask what you can do without.\n\nIt will wait as long as you need.' },
  aster5: { map: 'asterfell', spot: [8, -34], title: "Tobin's survey stone, IV", text: 'Letting go means wanting nothing. Not to live, not to be saved, not even for the rest of them to be freed. I do not know that anyone could do it.\n\nI hope I am wrong about what it costs.\n\n— T.' },
  aster6: { map: 'asterfell', spot: 'out', title: 'A banner over the court doors', text: "BLESSED BE THE QUEEN'S CHILD ON THE DAY OF THEIR NAMING.\n\nThe name stitched below it is yours. The thread is still bright." },
  star1: { map: 'starwell', spot: 'in', title: 'The rim of the well', text: 'Stand close and it will ask what you want.\n\nAnswer carefully. It is listening to everything you have ever wanted.' },
  star2: { map: 'starwell', spot: 'out', title: "Written round the rim, in the Queen's hand", text: 'I asked it for too much.\n\nIt gave me exactly that.' },
  wilds1: { map: 'wilds', spot: 'in', title: 'A map, drawn twice', text: 'Two maps of the same road on one sheet, the second drawn over the first.\n\nOn the first, the Greenwood ends at the Fen, the Fen at the Ridge, the Ridge at the Keep. On the second, nothing ends anywhere. Every road runs into this place.\n\nSomeone has written across both: SHE WANTED THEM ALL IN ONE PLACE. SO NOBODY COULD LEAVE.' },
  wilds2: { map: 'wilds', spot: 'out', title: 'Scratched into a shard of sky', text: 'To whoever comes next. I made it further than the others. It just keeps going.\n\nI think the wish is still growing. I think it grows a little every time somebody wants something here.\n\nSo try not to want anything. Not even to go home.' },
};
for (const id in SIGNS) SIGNS[id].id = id;
export const SIGN_IDS = Object.keys(SIGNS);

/**
 * What the bosses say as they fight (0.44): who they were, coming through. Keyed by boss type, then by
 * the move that says it; `phase2` / `phase3` when the Unmade changes, `low` once at a quarter health,
 * `death` as they fall.
 */
export const BOSS_LINES = {
  boss: {
    keys: 'Every key accounted for. Every one.',
    bargate: 'The gate stays shut. Those are my orders.',
    count: '...ninety-eight. Ninety-nine. Start again.',
    muster: 'To me! Hold the line, lads! Hold the line!',
    slam: 'Nothing comes down this mountain.',
    low: 'What was on the other side? I had it a moment ago.',
    death: 'Is it... done, then? Tell the Queen I held it.',
  },
  boss2: {
    remedy: 'Drink. It will help. It always almost helps.',
    garden: 'Lie down here. Let it take you gently.',
    rot: 'The body wants to go. Let it.',
    medicine: 'Hold still. This is for your own good.',
    tend: 'Grow. Please. Grow quiet.',
    low: 'Still nothing rots. Not even me.',
    death: 'Tell Odile she was right to leave.',
  },
  boss3: {
    lullaby: 'Hush now. Hush. Mother is here.',
    cradle: 'Come here. Let me hold you.',
    holdon: "Don't go. Don't you go too.",
    people: 'Rise. All of you. No one leaves me.',
    weep: 'I asked for so little. I asked for everything.',
    emptycradle: 'Where is my child? Where is my child?',
    collapse: 'Let nothing I love be taken from me!',
    phase2: 'Stay. Everyone stays.',
    phase3: 'Is that you? No. My baby is small. My baby is—',
    death: 'There you are. Oh. There you are.',
  },
  herald: {
    fanfare: 'Ring the bells! Ring every one!',
    decree: 'By order of the Queen!',
    present: 'Come, come! The whole city is waiting to see you!',
    low: 'The ceremony cannot end. It has not finished.',
    death: 'And the child... shall be named...',
  },
  asker: {
    halo: 'Is this what you wanted?',
    granted: 'Granted. Granted. Granted.',
    crosslight: 'Ask. I am listening.',
    starfall: 'Every wish falls somewhere.',
    low: 'You could still ask me to stop.',
    death: 'Then want nothing. I will wait.',
    unasked: 'You did not ask for that. I took it anyway.',
    everywish: 'Every wish at once. Do you see how many there are?',
    answer: 'I am the first of six. Did you think I was alone?',
  },
  // Act III (0.54): the other five Primordials. None of them is angry. That is the frightening part.
  cinder: {
    fever: 'This was my breath. I am sorry it was so long.',
    ashfall: 'Everything ends. I only come to help it.',
    banked: 'I was held back nineteen years. I am very hungry.',
    lastbreath: 'Breathe out. All the way.',
    kindle: 'They were mine before they were hers.',
    low: 'You have ended before. I can smell it on you.',
    death: 'Then carry me. Someone has to.',
  },
  undertow: {
    tide: 'There was a city here. Do you remember it? Nor do I.',
    lowwater: 'The low water. The fever rode it up the mountain.',
    drown: 'Let go of your name. It is heavy.',
    forget: 'What was that? Never mind.',
    nameless: 'They had names once. I keep them now.',
    low: 'You are still holding on to yours.',
    death: 'Keep it, then. Someone should remember.',
  },
  rootmother: {
    roots: 'Everything grows. Even this.',
    thicket: 'Rot is only growing in the other direction.',
    bloom: 'Your physician understood me. He grew into me.',
    embrace: 'Hold still. You are not finished.',
    grow: 'Up. Up again. Always up again.',
    low: 'You have grown. Every life, a little more.',
    death: 'Go on, then. Grow somewhere else.',
  },
  choir: {
    chorus: 'We sing everyone the mountain lost.',
    refrain: 'Do you hear your father? He is in the third row.',
    requiem: 'Every life you let go, we kept.',
    recall: 'Remember them. All of them. At once.',
    echoes: 'You have been so many people.',
    low: 'Sing with us. You know the words.',
    death: 'We will keep singing. Listen for us.',
  },
  // Caelum (0.64)
  ianitor: { turnkey: 'In, or out?', shut: 'Closed.', doors: 'Every door is open. Choose.', keepers: 'Let them in.', low: 'You came the wrong way. Everyone does.', death: 'Go on, then. Through.' },
  arbiter: { verdict: 'Answered.', sentence: 'So be it.', scales: 'Weighed.', chorus: 'Witness.', low: 'You are asking a question. I will answer it.', death: 'No further questions.' },
  desiderium: { grasp: 'Mine.', reach: 'More.', covet: 'All of it.', hunger: 'Give.', wanting: 'Want with me.', low: 'You want too. I can feel it.', death: 'Still... wanting...' },
  fiat: { letitbe: 'Let it be done.', decree: 'Granted.', amen: 'So be it.', granted: 'Everything you asked for.', answered: 'Rise.', low: 'I have never said no. Do not make me learn.', death: 'No. ...No. So that is what it is.' },
  stillness: {
    hush: 'Hush.',
    quiet: 'You do not have to want anything here.',
    nothing: 'This is what is left when everything has been asked for.',
    enough: 'Is that enough?',
    stillmore: 'Be still.',
    low: 'The star asked what you wanted. I am asking what you do not.',
    death: 'Enough. Yes. Enough.',
  },
};

// The Unmade in New Game+ (0.45): you, after you took her place.
BOSS_LINES.oldself = {
  combo1: 'I kept them. I kept every one of them.',
  slam: 'Nothing I love will be taken from me.',
  people: 'Stay. All of you. Stay.',
  holdon: 'You look like someone I used to be.',
  weep: 'I asked for so little.',
  collapse: 'Let nothing I love be taken from me!',
  phase2: 'You walked down the same road. Turn back.',
  phase3: 'I said yes. Why did I say yes?',
  low: 'You could let go. I never could.',
  death: 'There. Now someone else can rest.',
};

/** What the well says when you stand at it with the Asker gone (0.45). */
export const WELL = {
  first: 'The well is quiet now. Starglass all the way down, and at the bottom, very far away, a light that is waiting.\n\nIt is listening to everything you have ever wanted.',
  noGlass: 'The well is quiet now. You have no Unwishing Glass to give it. (Elder Wren has one for you: the quest Unwish.)',
  self: 'Unwish yourself. Want nothing at all: not to live, not to be saved, not even for them to be freed. The wish lets go of the one it was holding, and everyone it held lies down.',
  place: 'Take her place. Wish to keep them all, the way she did. You will begin again, and the wish will begin again with you, stronger, and at the top of the mountain the Unmade will wear your face.',
  placeLocked: 'Take her place. (Only once you have seen what it means to let go.)',
};

/** The credits after the Unwish (0.45). */
export const CREDITS = [
  ['', 'The husks on the Greenwood road lay down in the night.'],
  ['', 'Aldric opened the gate, and counted no more.'],
  ['', 'Brother Tobin\'s garden began, at last, to rot.'],
  ['', 'In Asterfell the bread went cold in the ovens, and the banners faded.'],
  ['', 'Tomas came home, once.'],
  ['', 'And Queen Maren, who asked for too much, was given rest.'],
  ['AFTERWISH', 'a game by STUNNED Games'],
  ['Design, story and direction', 'Ko Ko'],
  ['Built with', 'Claude'],
  ['Models', 'made with Tripo'],
  ['Animations', "Tripo, and Quaternius' Universal Animation Library (CC0)"],
  ['', 'The world goes on after the wish. So do you.'],
];

// The Herald's proclamation (0.40): one line each time he calls the Court Guards.
export const HERALD_LINES = [
  'Hear me, Asterfell! On this day the Queen presents her child to the city!',
  'Let every bell be rung and every door stand open!',
  'Let the child be blessed with long life, and every gift the star can give!',
  'Let nothing the Queen loves ever be taken from her!',
  'And let the child be named, before all of you, as...',
];

// Quests.
//   giver   who offers it and pays it out
//   level   what level it is meant for (sets the size of the rewards, and it is
//           not offered until you are within 4 levels of it)
//   after   a quest that must be finished first
//   goal    { kill: n, enemy?, map?, boss? }  kill n enemies (of a type / on a map / a boss)
//           { reach: mapId }                  walk into a map
//           { read: n }                       have read n signs in total
//           { sign: id } / { signs: [ids] }   read that sign / all of those signs
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
  // (0.58) Once on each world tier, every life: the higher the tier, the more she has kept for you.
  again: {
    giver: 'wren', level: 100, after: 'unmade', repeat: true, perTier: true, name: 'Come Home', goal: { kill: 1, boss: 'boss3' },
    offer: 'She asks every knight who reaches her whether the child is safe. Go up and let her see that you are. Then let her sleep. On a harder road she will have more to give you; she keeps what the knights before you left behind.',
    done: 'Two minutes of quiet on the mountain. It is not nothing. It is all any of us have managed in nineteen years. Take these. They were left for whoever came home.',
    reward: { exp: 0, gold: 900, item: 4, keys: 2 },
    tiers: {
      1: { exp: 0, gold: 900, item: 4, keys: 2, tickets: 1, fragments: 20, dust: 6 },
      2: { exp: 0, gold: 1300, item: 4, keys: 3, tickets: 2, fragments: 30, dust: 9 },
      3: { exp: 0, gold: 1800, item: 5, keys: 4, tickets: 2, fragments: 45, dust: 12 },
      4: { exp: 0, gold: 2400, item: 5, keys: 5, tickets: 3, fragments: 60, dust: 16 },
      5: { exp: 0, gold: 3000, item: 5, keys: 6, tickets: 4, fragments: 80, dust: 20 },
    },
  },

  // --- Act II: The Asker (0.39; see docs/design/act-ii.md) ----------------------
  w: {
    giver: 'wren', level: 100, after: 'unmade', name: 'W.', goal: { sign: 'frost3' },
    offer: 'I told you there is no ending. That was a lie, and I have told it for nineteen years.\n\nThere is something under the cairn on the pass, where I stopped following her. I put it there the night I carried you down. Go and read it. Then come back and be angry with me.',
    done: 'I did not burn it. I could not even do that. I buried it, and I raised you, and I told myself there was no ending, because the ending was you.\n\nThe Waygate will find the city now that you know it is there. I will not stop you. I could never stop any of you.',
    reward: { exp: 0, gold: 1500, item: 5, keys: 2, tickets: 2 },
  },
  sand: {
    giver: 'wren', level: 100, after: 'w', name: 'Under the Sand', goal: { reach: 'asterfell' },
    offer: 'Asterfell is not gone. It is under the Dunes, held up by the glass the star made, and everyone who was in it is still in it. The Waygate will take you there from world tier II.\n\nGo carefully. They are celebrating.',
    done: 'Banners. Of course there are banners. It was your naming day, child. The whole city came out for it, and then the star came down, and the day never ended.',
    reward: { exp: 0, gold: 1200, item: 5, tickets: 2 },
  },
  survey: {
    giver: 'odile', level: 100, after: 'sand', name: "Tobin's Survey", goal: { signs: ['aster2', 'aster3', 'aster4', 'aster5'], what: "of Tobin's survey stones" },
    offer: 'Wren told me what was under the cairn. So he found it after all.\n\nTobin surveyed everything. He would have surveyed the end of the world. Find his stones in Asterfell, all four. I need to know what he knew.',
    done: 'He knew. All those years in the garden he knew, and he kept looking for another way, so that no one would ever have to ask it of you.\n\nThe court is at the heart of the city. Whatever keeps that day from ending, it starts there.',
    reward: { exp: 0, gold: 1400, item: 5, keys: 2 },
  },

  court: {
    giver: 'wren', level: 100, after: 'survey', name: 'The Frozen Court', goal: { kill: 1, boss: 'herald' },
    offer: 'Odile says the court is still holding your naming day. The Herald is still reading the proclamation. Nineteen years, and he never reached the end of it.\n\nLet him finish, child. Then whatever lies under the court will have to answer to you.',
    done: 'He finished it? Then you have been named, nineteen years late, and the whole city heard it.\n\nUnder the court is the well where the star came down. It will speak to you. Whatever it offers, remember Tobin\'s last stone: wanting nothing is the only way out.',
    reward: { exp: 0, gold: 2400, item: 6, keys: 3, tickets: 3 },
  },
  starwell: {
    giver: 'wren', level: 100, after: 'court', name: 'The Starwell', goal: { kill: 1, boss: 'asker' },
    offer: 'Go down to the well. It will ask you what you want. It asked her, and she answered with her whole heart.\n\nAnswer it with nothing, if you can. The Waygate knows the way now.',
    done: 'You came back. Did it offer you everything? It offered her everything too.\n\nThere is one thing left to do down there, and I cannot ask it of you yet. Rest first. Come home for a little while.',
    reward: { exp: 0, gold: 3000, item: 6, keys: 4, tickets: 4 },
  },

  // --- Act III: the Primordials (0.54; the Act III design doc) -------------------------------------
  // Opened once you have seen the Unwish ending and been reborn at least once; each quest done opens the
  // next Depth, and stays done through every rebirth after (the rebirth record keeps it).
  deep1: {
    giver: 'wren', level: 100, act3: true, name: 'The Low Water', goal: { sign: 'sealed' }, deep: 6,
    offer: 'You have come back again. New face, same eyes. Every time you begin again I think: this time the mountain will leave you alone.\n\nIt will not. Something under the Starwell is breathing. Tobin wrote about it once, and sealed the page so the Queen would never read it. It is under the court steps in Asterfell.\n\nRead it. Then decide whether to go down.',
    done: 'So the fever was never a fever. And the star was never the only one.\n\nThere is a crack under the Starwell now, where it struck. The Waygate will take you down. Be careful, child: down there, only what you have let go of will protect you.',
    reward: { exp: 0, gold: 6000, keys: 4, tickets: 4 },
  },
  deep2: {
    giver: 'wren', level: 100, act3: true, after: 'deep1', name: 'What Ends', goal: { kill: 1, boss: 'cinder' }, deep: 7,
    offer: 'The thing at the bottom of the ash. Tobin called it a breath. It killed half the kingdom without ever meaning to.\n\nI do not know if it can be beaten. I know you have died a great many times and come back. Perhaps that is what it needs to see.',
    done: 'It let you go? It told you that? That it was held back, and hungry, and sorry.\n\nThen the star did not save us from the fever. It only stopped the clock. Go and rest. There is more under the water. There is always more under the water.',
    reward: { exp: 0, gold: 7000, item: 6, keys: 4, tickets: 4 },
  },
  deep3: {
    giver: 'odile', level: 100, act3: true, after: 'deep2', name: 'The First City', goal: { kill: 1, boss: 'undertow' }, deep: 8,
    offer: 'Wren told me what you found. The low water. Tobin wrote that the fever rode it up the mountain.\n\nThere is a city under Asterfell. Older. Forgotten on purpose, I think. If you meet what lives in that water, bring me back anything with a name on it.',
    done: 'Blank. Every stone, blank. Not worn: washed. Something took the name out of it.\n\nAnd it wanted yours. You still have it? Good. Hold on to it. I think that is the only thing down there it cannot take unless you give it.',
    reward: { exp: 0, gold: 8000, item: 6, keys: 5, tickets: 4 },
  },
  deep4: {
    giver: 'odile', level: 100, act3: true, after: 'deep3', name: 'The Root of It', goal: { kill: 1, boss: 'rootmother' }, deep: 9,
    offer: "Tobin's cure. The rot from his garden, the one thing that still rotted while nothing died. I always wondered why it still worked.\n\nIt was never his. Something was growing it for him. Go down to the roots and ask her.",
    done: "'Not a cure. A kindness. She lets things finish.' He knew. He went to her at the end, didn't he. Into the garden.\n\nI'm glad. I'm glad someone was kind to him.",
    reward: { exp: 0, gold: 9000, item: 6, keys: 5, tickets: 5 },
  },
  deep5: {
    giver: 'bram', level: 100, act3: true, after: 'deep4', name: 'Every Voice', goal: { kill: 1, boss: 'choir' }, deep: 10,
    offer: "You've been hearing him, haven't you. In the glass. Don't lie to me, I can see it on you.\n\nEdric. Counting the gate, like he always did. Go down there and make it stop, or make it sing properly. One or the other.",
    done: "He's in there. And Tomas, and the Queen, and you. All your yous. Every one you let go of.\n\nThey're not suffering. They're singing. I thought that would be worse. It isn't. Go on. Wren says there's one more.",
    reward: { exp: 0, gold: 10000, item: 6, keys: 6, tickets: 5 },
  },
  deep6q: {
    giver: 'wren', level: 100, act3: true, after: 'deep5', name: 'Enough', goal: { kill: 1, boss: 'stillness' },
    offer: 'Six of them. Wanting, Ending, Forgetting, Growing, Remembering, and the last one at the very bottom.\n\nThe star asked her what she wanted. The last one will ask you something else. Answer it honestly. You are the only one on this mountain who has ended and begun again enough times to know.',
    done: 'You told it you would carry it. Ending. So the Cinder never has to break out of the mountain again.\n\nThe fever is over, then. Truly over.\n\nYour name. I have known it the whole time. I am going to tell you now, and it is going to hold still.',
    reward: { exp: 0, gold: 15000, item: 6, keys: 8, tickets: 8, glow: 'primordial' },
  },
  // (0.63) After Enough: Mastery. The Choir sings every life the wish kept of you; learn from the others.
  lives: {
    giver: 'wren', level: 100, act3: true, after: 'deep6q', name: 'The Other Lives', goal: { reach: 'deep9' },
    offer: "There is something I have not told you, because I did not understand it until you came back from the bottom.\n\nThe Choir sings every voice the star took. Every one. Yours too: all your yous, it said to you. I thought it meant the lives before this one. It does not. It means every shape the wish kept of you. The one who held a sword. The one who held a bow. The one in the shadows, and the one who called the fire down.\n\nGo back to the Glass Choir. Do not fight. Listen.",
    done: "So you heard them. Four of you, and each one learned something the others never had to.\n\nThis is what it means, as far as I can follow it: every one of the old powers you face as one of yourselves, all of you remember. Face the Cinder with a bow and the swordsman in you knows it too.\n\nOne thing, and listen, because it matters. It only counts if you stand there with the Ember yourself, or if nobody beside you has it either. Being carried down by someone stronger teaches you nothing, and the Choir will not sing it. Do not waste your nights on that.\n\nThere are others on the mountain now. The ones whose wishes the star granted completely. They are not husks. They are something more. To stand in front of them you will need every one of you.",
    reward: { exp: 0, gold: 20000, keys: 4, tickets: 6 },
  },
  // Caelum (0.64, docs/design/mastery.md): the Granted, above the Starwell. The Sky Road opens on the
  // Waygate when sky1 is taken; the rest are walked to, map by map. Each map asks for an Animus.
  sky1: {
    giver: 'wren', level: 100, act3: true, after: 'lives', name: 'The Sky Road', goal: { kill: 1, boss: 'ianitor' },
    offer: "Look up. No, past the clouds.\n\nEvery wish made on this mountain went somewhere. Most of them came down as the fever. Some of them went up, and were answered, completely, and the ones who made them went up after them. The Granted. They are not husks. They do not hunger. They have everything they ever asked for, and it made them into something that cannot be told no.\n\nThe Waygate will take you to the road. Something keeps the door at the end of it. A warning: up there, what you have learned from your other lives is all that stands between you and their will. They call it Animus. If you do not have enough of it, they will simply decide that you stop.",
    done: "You came back down. Good. That is not something the Granted do.\n\nThe road goes on past the door. There is a court up there, the old stories say, where every question is answered.",
    reward: { exp: 0, gold: 25000, keys: 4, tickets: 6, dust: 20 },
  },
  sky2: {
    giver: 'wren', level: 100, act3: true, after: 'sky1', name: 'The Court of Answers', goal: { kill: 1, boss: 'arbiter' },
    offer: 'Past the Doorkeeper there is a court. Everything anyone ever asked on this mountain was answered there, and the answers were kept.\n\nIt will try to answer you too. Do not let it.',
    done: 'No further questions. I have not heard anyone say that and mean it in a long time.',
    reward: { exp: 0, gold: 30000, keys: 5, tickets: 7, dust: 25 },
  },
  sky3: {
    giver: 'wren', level: 100, act3: true, after: 'sky2', name: 'The Hall of Wants', goal: { kill: 1, boss: 'desiderium' },
    offer: 'Beyond the court, a hall full of everything anyone ever wanted. And at the end of it, the want itself. It was never answered, because it was the asking.\n\nYou cannot fill it. Nobody can. Only end it.',
    done: 'You look tired. Not in the arms. Somewhere else.\n\nThere is one more. At the top of the sky. The one that answered all of them.',
    reward: { exp: 0, gold: 35000, keys: 6, tickets: 8, dust: 30 },
  },
  sky4: {
    giver: 'wren', level: 100, act3: true, after: 'sky3', name: 'Let It Be Done', goal: { kill: 1, boss: 'fiat' },
    offer: 'Fiat. Let it be done. It answered the Queen. It answered the star. It has answered every wish that ever reached it, and it has never once said no.\n\nYou are going to have to say it for it.',
    done: 'You told it no.\n\nI do not know what happens to a wish nobody grants. Maybe it just stays a wish. Maybe that is all it was ever supposed to be.',
    reward: { exp: 0, gold: 50000, item: 6, keys: 8, tickets: 10, dust: 40 },
  },
  // (0.57.6) A first look at the Deep, in the first life: you cannot touch what lives there, and learn why.
  breath: {
    giver: 'odile', level: 100, after: 'starwell', name: 'The Breath Below', goal: { reach: 'deep6' },
    offer: "Something changed when the star's light went quiet. There is a crack under the Starwell now, and heat comes up out of it, slow, like breathing. Tobin's notes talk about a breath under the mountain. I always thought he meant the fever.\n\nGo down, just far enough to see. Do not try to win anything. The Waygate will take you to the edge of it.",
    done: "You could not touch them. I know. Your blade went through them like smoke, and they did not even turn around.\n\nTobin wrote one line in the margin that I never understood: down there, only what you have let go of will protect you. He left this with it. A coal that never goes out. I think it was always meant for you.",
    reward: { exp: 0, gold: 4000, keys: 3, tickets: 3, ember: 8 },
  },
  unwish: {
    giver: 'wren', level: 100, after: 'breath', name: 'Unwish', goal: { ending: 1 }, give: { glass: 1 },
    offer: 'I kept one of these for nineteen years. An Unwishing Glass. I never had the courage to use it, and it was never mine to use.\n\nIt is yours. Take it down to the well, where the star fell. Press it in, and want nothing. Or... no. I will not tell you what else you could ask. You will know.',
    done: 'You came back. I did not think you would. I am so glad you did.\n\nSit. The fire is warm, and for the first time in a long time, it is only a fire.',
    reward: { exp: 0, gold: 5000, keys: 5, tickets: 5 },
  },

  edric: {
    giver: 'bram', level: 45, after: 'knights', name: "Edric's Colours", side: true, goal: { kill: 1, enemy: 'edric', map: 'keep' },
    offer: "I lied to you. I said don't tell me. I've changed my mind.\n\nThere's one in the Keep who still stands his watch. Blue trim on the pauldron. He'll not have moved from his post in nineteen years; Edric never could stand to be relieved early.\n\nBring me his colours. And his sword. I made that sword.",
    done: "That's my work on the hilt. That's his blue.\n\nI'll hang the colours by the forge, where he can see the fire. Wear a bit of his blue, too. Not on your finger with the rest: somewhere it'll stay, whatever comes. He'd want someone still standing the watch.\n\nAnd the sword. He'd want it used, not hung on a wall. He hated walls. He was a gate-guard. Go figure.",
    reward: { exp: 1, gold: 900, scrap: 120, unique: { warrior: 'edric' }, keepsake: 'bluetrim' }, // (0.53) the ring for everyone, in its own slot
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

  tobin: {
    giver: 'odile', level: 75, name: 'An Ending for Tobin', side: true, goal: { meet: 'odile' },
    offer: "I was his apprentice. Did Wren tell you? I was the one he sent away, the day he went into the garden. He said someone had to keep the herbs.\n\nI have kept them nineteen years. I am going to him now. I will go ahead; you come behind, through Gloomcap Hollow, to the heart of the garden. Do not let anything follow me in.",
    done: "He knew me. Under all of it, he knew me. He said I had let the thyme go woody.\n\nI am staying. Somebody should sit with him while it finishes; it was always going to be me. Lark has my stall in Haven, and my notes, and she is better with the pestle than I ever was. Go on. Go home.",
    reward: { exp: 1, gold: 1500, glow: 'gloomcap' },
  },
  havengrows: {
    giver: 'wren', level: 25, name: 'Haven Grows', side: true, goal: { stories: 3 },
    offer: "Do you know what Haven was, before? A waystation. A fire and a roof for people who had to keep going.\n\nEvery time you help one of them let go, something changes here. Someone stays. Someone builds. Help Pip, and Bram, and Odile finish what they are carrying, and come and tell me. I want to see what Haven becomes.",
    done: "Look at it. A lantern on the gate for Tomas. Edric's blue over the forge. Lark at Odile's stall, singing out of tune.\n\nIt is not a waystation any more. It is a town. Thank you, child.",
    reward: { exp: 1, gold: 3000, keys: 5, glow: 'hearth' },
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

  // --- Side stories (0.47): each ends with someone letting go. Choices cannot be undone. ---
  scarf2: {
    giver: 'pip', level: 25, after: 'scarf', name: 'Red Scarf, Part Two', side: true, goal: { choose: 'scarf' },
    offer: "The others lay down. Da didn't. He walks the Greenwood road every evening, the same way, like he's coming home and forgets the last bit.\n\nHe's still got the scarf. Mam knitted it. Could you... I don't know what I'm asking. You'll know when you see him.",
    done: "You brought it. It still smells like the fire at home. That's... that's him, then. That's all of him.\n\nI'm going to keep it on. Even in summer. Don't tell Wren.",
    doneAlt: "You let him walk. Good. I mean... good. As long as he's walking, he's going somewhere.\n\nI'll stop waving from far away. Tomorrow I'm going to walk next to him for a bit.",
    reward: { exp: 0.9, gold: 400, keys: 2 },
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
  // (0.32: Immortals only from The Unmade: guaranteed the first time, then 5% for its best piece)
  boss: { items: 3, min: 2, better: 1, top: [0, 0, 0, 55, 35, 10, 0], keys: 1, tickets: 1, first: 4 },
  boss2: { items: 4, min: 3, better: 1, top: [0, 0, 0, 0, 66, 34, 0], keys: 2, tickets: 1, first: 5 },
  boss3: { items: 6, min: 3, better: 2, top: [0, 0, 0, 0, 55, 40, 5], keys: 3, tickets: 2, first: 6 },
  // Act II (0.40): the Herald and the Asker pay like the Unmade, the Asker a little more
  herald: { items: 5, min: 4, better: 2, top: [0, 0, 0, 0, 45, 50, 5], keys: 3, tickets: 2, first: 5 },
  asker: { items: 6, min: 4, better: 2, top: [0, 0, 0, 0, 35, 55, 10], keys: 4, tickets: 3, first: 6 },
  // The Primordials (0.65): a hoard of their own, with a chance at an Immortal (5% at the Cinder, up to 12%);
  // (0.66) the first kill of each gives a random Immortal
  cinder: { items: 5, min: 4, better: 2, top: [0, 0, 0, 0, 45, 50, 5], keys: 3, tickets: 2, first: 6 },
  undertow: { items: 5, min: 4, better: 2, top: [0, 0, 0, 0, 42, 51, 7], keys: 3, tickets: 2, first: 6 },
  rootmother: { items: 6, min: 4, better: 2, top: [0, 0, 0, 0, 38, 53, 9], keys: 4, tickets: 3, first: 6 },
  choir: { items: 6, min: 4, better: 2, top: [0, 0, 0, 0, 35, 55, 10], keys: 4, tickets: 3, first: 6 },
  stillness: { items: 6, min: 4, better: 3, top: [0, 0, 0, 0, 30, 58, 12], keys: 5, tickets: 3, first: 6 },
  // Caelum (0.64): each keeper pays more than the last
  ianitor: { items: 6, min: 4, better: 2, top: [0, 0, 0, 0, 30, 58, 12], keys: 4, tickets: 3, first: 6 },
  arbiter: { items: 6, min: 4, better: 3, top: [0, 0, 0, 0, 25, 60, 15], keys: 4, tickets: 4, first: 6 },
  desiderium: { items: 7, min: 4, better: 3, top: [0, 0, 0, 0, 20, 62, 18], keys: 5, tickets: 4, first: 6 },
  fiat: { items: 8, min: 5, better: 3, top: [0, 0, 0, 0, 0, 75, 25], keys: 6, tickets: 5, first: 6 },
};
