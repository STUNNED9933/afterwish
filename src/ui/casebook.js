// Ex Voto (0.56; the code calls it the casebook): Sister Odile's notes on everything the wish made, kept
// by the account, so every class and every life adds to the same book. An ex-voto is what is left at a
// shrine once a wish has been granted: every one of these is what a granted wish left behind. To Odile,
// a physician's apprentice, each was a patient once. "To give it rest" is how to beat it.
//
// What unlocks what:
//   ordinary enemies  first time you lay one to rest: who it was and how to fight it. At KEPT kills,
//                     one more thing Odile noticed (detailed view).
//   bosses            seen: a line about what you saw. Falling to it (HINTS falls) gives a hint each
//                     time, gentle first. Beating it opens the whole entry: who it was, every move, and
//                     the trick of it. The fun parts stay hidden until you have found them yourself.
//   Remnants, and the Unmade wearing your old face, add a note once one of them is laid to rest.
//
// The record lives on the account (account.casebook): { seen, kills, falls, rem, old, unread }.

import { ENEMIES } from '../sim/defs.js';
import { MAPS } from '../sim/maps.js';
import { CONFIG } from '../config.js';
import { RARITIES, REMNANT_UNIQUE, EFFECTS } from '../sim/items.js';
import { TIERS, ELITE_FROM_LEVEL, DEEP } from '../sim/endgame.js';
import { BOSS_LOOT } from '../sim/story.js';
import { RARE, THIEF, REMNANT, GLASS, FRAGMENTS, SIGIL, ELITE_SPOILS } from '../sim/surprises.js';

export const BOOK = 'Ex Voto'; // the name players see
export const KEPT = 25; // kills of an ordinary enemy before Odile's second note
export const HINTS = [1, 3, 6]; // falls to a boss that unlock each hint
const SEEN_RANGE = 26; // m: close enough to say you have seen it
const KILL_RANGE = 30; // m: a death this close to your hero counts as yours (a party shares the work)
const SAME = { heraldguard: 'courtguard' }; // the Herald's guards are Court Guards

// ---------------------------------------------------------------- the entries
// lore: the first page. more: Odile's second note (ordinary enemies, at KEPT kills).
// rest: the one line that matters most (simple view). tips: everything (detailed view).
// Bosses: seen, hints (by HINTS), lore, rest, tips; remnant (after a Remnant is laid to rest).
const CASES = {
  // ------------------------------------------------------------- the road
  grunt: {
    lore: `Villagers of the Greenwood, the first the wish would not let die. They did not die. They wore out, and emptied, and they get back up every time they fall.`,
    more: `Some of them still walk the way they used to walk home at dusk. If you stand still on the road, they go around you, as if you were a neighbour's gate.`,
    rest: `Parry the swipe when it flashes white. If it hunches from a few steps away, it lurches straight at you: step sideways.`,
    tips: [`Its swipe can be parried; its lurch (red) cannot.`, `They are slow to turn. Fight them one at a time from the side.`],
  },
  spitter: {
    lore: `The low-water fever, carried and coughed up. Brother Tobin wrote that there was no cure. These are what it does when nothing is allowed to finish.`,
    more: `They keep their distance the way the sick were told to: eight paces, never closer. Somebody taught them that, and they remembered it.`,
    rest: `Parry its bolt. When it rears back, the sickness lands where you stand: move, and do not fight in green.`,
    tips: [`Its bolt can be parried.`, `Retching (red) leaves sick ground for a few seconds. Step out of it.`, `It backs away to keep its distance. Corner it, or let it come to you.`],
  },
  stalker: {
    lore: `Starved things that hunt by sound. Nobody in Haven agrees on what they were before. Odile thinks they were the Fen's ferry dogs, waiting at the water for someone to come back down.`,
    more: `Whistle on the Fen road and one of them will stop, ears up, before it remembers what it is now.`,
    rest: `It waits at a distance, then charges or pounces. Sidestep, then hit it while it recovers.`,
    tips: [`Neither the charge nor the pounce can be parried.`, `Both leave it standing still for a breath afterwards: that is your opening.`],
  },
  imp: {
    lore: `On the Ashen Ridge the whole wood burned in one breath when the star passed over. The imps are what was left burning, and never went out.`,
    more: `Their embers are warm, not hot. Bram swears the ones from the Ridge make the best charcoal he has ever had.`,
    rest: `Parry the claw. When it crouches and glows, it bursts: step back and stay out of the embers.`,
    tips: [`Fast and weak. Fight them in the open, not in their own fire.`, `The burst (red) leaves burning ground behind.`],
  },
  brute: {
    lore: `Quarry hands from below the Keep, still in their shackles. The chain was meant to keep them working. It still does.`,
    more: `They stop at the end of their chain's old length, even though it is broken now. You can see the worn ring in the ground where each one used to stand.`,
    rest: `Its slam can be parried, and a parried Crusher is stunned a long time. The stomp misses anyone hugging it: step in, not out.`,
    tips: [`Slam and chain swing can both be parried.`, `The stomp (red) is a ring: the only safe place is right next to it.`],
  },
  knight: {
    lore: `The Warden's men. When the Captain barred the gate, they stayed on his side of it, by choice. They are still keeping it.`,
    more: `One of them turns his head toward the low road whenever the wind brings forge-smoke up the mountain. A letter in the Ridge names a soldier who asked his brother to keep the forge lit.`,
    rest: `Two cuts, the second faster than the first: parry both. Two parries break its guard.`,
    tips: [`The shield rush (red) closes distance in a straight line.`, `The oath thrust is a line, and it can be parried.`],
  },
  wolf: {
    lore: `The wolves of Frostfall Pass. Tobin's garden ledger has a line about them: "Trial 31: the wolves. No." Whatever he tried, it did not take.`,
    more: `They still hunt in a pack of the size the pass could feed, nineteen winters ago. There is nothing left to feed them. They hunt anyway.`,
    rest: `Parry the bite: it leaves you cold and slow. When one backs off, it is about to pounce.`,
    tips: [`Bites and pounces chill you: two in a row is how a pack wins.`, `The pounce (red) lands where you stood, not where you are going.`],
  },
  shaman: {
    lore: `The priests of the pass. The Queen carried her child up past their shrine, and they prayed with her. The prayer on every flag up there is hers.`,
    more: `If you listen at the end of a fight, the last thing a Rime Caller says is a word of that prayer. Never the same word twice.`,
    rest: `Parry a shard or slip between them. Frost grows up under you: leave it before it slows you.`,
    tips: [`Shards come three at a time, in a fan.`, `The rime (red) leaves frozen ground that slows you.`],
  },
  scarab: {
    lore: `Beetles of Asterfell's old fields, which turned to dust and glass where the star came down. The city is under them now.`,
    more: `What they carry back into the sand is always glass, never food. Odile found a nest lined with pieces of a stained-glass window.`,
    rest: `When it charges, sidestep. When it dives into the sand, keep moving: it comes up where you were.`,
    tips: [`Neither the charge nor the burrow can be parried.`, `It is open for a moment after either one.`],
  },
  golem: {
    lore: `The Queen's guard in sandstone, raised by a grateful city. When the star woke everything on the mountain, it woke them too, and they remembered their orders.`,
    more: `Every one of them faces the same way when it is standing still: toward the peak, where she is.`,
    rest: `Parry the fist. When it raises its arms, get out of the circle. When it leans, it is about to fall on you: step aside, then hit it while it gets up.`,
    tips: [`The quake (red) is a wide circle around it.`, `After it topples it lies there for two seconds: your best opening.`, `Two parries break its guard.`],
  },
  sporecap: {
    lore: `Brother Tobin's garden, walking. He grew gloomcap because it was the only thing on the mountain that still rotted. It grew through him, and then it grew legs.`,
    more: `They tend each other. A Sporecap will stop to clear dead leaves from another one's cap, even in a fight.`,
    rest: `Its spores are slow and red: walk out of their way, never try to parry them. Do not chase it into its own cloud.`,
    tips: [`Every spore that lands leaves spores on the ground.`, `Up close it bursts into a cloud. Fight it at the edge of its reach.`],
  },
  wraith: {
    lore: `The air on Stormspire, which split the stair marker the night the Queen went up. Odile thinks they are not anyone at all. That frightens her more than the Husks do.`,
    more: `They step through the air to stand beside you. They always step to your left. Nobody knows why.`,
    rest: `Its bolt is fast: parry early. Lightning walks toward you in a line: step off the line, not back along it.`,
    tips: [`It steps beside you before its cut. The cut can be parried.`, `Bolts can be parried; walking lightning (red) cannot.`],
  },
  // ------------------------------------------------------------- Asterfell
  glassbound: {
    lore: `Asterfell's people, held in glass on their happiest day: the naming of the Queen's child. They were raising a toast when it happened. They are still raising it.`,
    more: `The toast they are drinking is to the child, by name. You have heard the name. It is yours.`,
    rest: `When it falls, step away: the glass bursts a moment later. Its toast throws glass in every direction.`,
    tips: [`The smash and the toast's glass can both be parried.`, `It bursts after it falls. Never finish one standing next to it.`],
  },
  courtguard: {
    lore: `The court guard, still on parade. The Herald calls more of them each time he reads a line of the proclamation.`,
    more: `Their halberds have never been used. The edges are still wrapped in ceremony silk.`,
    rest: `Parry first: one parry shatters its shield, which is worth half its health.`,
    tips: [`Bash, thrust and sweep can all be parried.`, `Without a parry you have to break through the shield the slow way.`],
  },
  wishling: {
    lore: `Little wishes. Every wish ever made at the star is still in the air near it, and these are the smallest ones.`,
    more: `Odile caught one in a jar. It asked her what she wanted. She said "nothing", and it went out like a candle.`,
    rest: `Kill wishlings first: now and then one gives a nearby enemy what it wants, and that enemy hits a third harder for a while.`,
    tips: [`Their motes can be parried.`, `A glowing enemy near a wishling has been given something. Back off from it until the glow fades.`],
  },
  // ------------------------------------------------------------- the Deep
  ashwalker: {
    lore: `The mountain's oldest dead, walked through the Cinder's heat until they were mostly ash. They fight like Crushers, because they carried the same stone.`,
    more: `Under the ash, some of them still have shackles. Some of them have crowns.`,
    rest: `Like a Crusher: parry the slam, hug it when it stomps.`,
    tips: [`Same moves as a Crusher, with much more behind them.`],
    deep: true,
  },
  unnamed: {
    lore: `People of a city older than Asterfell, built on the same rock. The Undertow took their names. They reach for you the way Husks do, for the same reason.`,
    more: `If you say a name out loud near one, any name, it stops for a moment to listen.`,
    rest: `Like a Husk: parry the swipe, sidestep the lurch. They come in numbers: keep your back clear.`,
    tips: [`Same moves as a Husk.`, `The Undertow calls them three at a time.`],
    deep: true,
  },
  rootbound: {
    lore: `Oathbound who went further down than the gate. The Rootmother grew through them, gently. They still keep a watch, over nothing.`,
    more: `Flowers grow out of the joints of their armour. They are the same flowers that grow on the graves in Haven.`,
    rest: `Like an Oathbound knight: parry both cuts, sidestep the shield rush.`,
    tips: [`Same moves as an Oathbound Knight.`, `The Rootmother mends herself when she calls them. Do not leave them standing.`],
    deep: true,
  },
  echo: {
    lore: `It fights like a knight, but faster, and its stance is one you know. You have stood like that, in a life you let go of.`,
    more: `Each one is a little different. Look closely at the way it holds its weapon. It holds it the way you did, once.`,
    rest: `Like an Oathbound knight, only quicker: parry earlier than feels right.`,
    tips: [`Same moves as an Oathbound Knight, at a faster pace.`],
    deep: true,
  },
  hush: {
    lore: `What is left of the Storm Wraiths when the weather goes out of them. The Quiet is full of them, and they make no sound.`,
    more: `They do not attack someone standing perfectly still. They do not wait long, either.`,
    rest: `Like a Storm Wraith: parry the bolt early, step off the line of lightning.`,
    tips: [`Same moves as a Storm Wraith.`, `The Stillness calls them three at a time.`],
    deep: true,
  },
  // ------------------------------------------------------------- strays
  wishthief: {
    where: `Anywhere on the road, now and then`,
    lore: `A little thing made of every coin anyone ever wished for. It is not wicked. It just wants to keep them.`,
    more: `Catch one and it hands over what it was carrying, then sits down and looks at its empty hands for a long time.`,
    rest: `It bolts when you come close and gets away after 25 seconds. It stops to catch its breath every few seconds: that is when to strike.`,
    tips: [`Every hit spills gold.`, `Ranged attacks and skills that reach far are best when it stumbles.`],
  },
  oathshade: {
    where: `Called up by the Warden and his Remnant`,
    lore: `The Warden's own shape, cast off. When he cannot hold the line alone, he becomes the line.`,
    more: `They count under their breath, like he does. They are always one number behind him.`,
    rest: `They fall when he falls. Keep hitting the Warden; parry the shades' combos when they come.`,
    tips: [`They fight with the Warden's three-blow combo, every blow parryable.`],
  },
  // ------------------------------------------------------------- bosses
  boss: {
    seen: `A captain in front of a barred gate, counting under his breath. He has not lost count once.`,
    hints: [
      `Red cannot be parried. His keys sweep wide; barring the gate is a long red line: step off it.`,
      `Parry him, again and again. His guard gives way after three parries (a perfect one counts twice), and then he is open.`,
      `Below about 60% health he calls two shades of himself. They fall when he falls: keep hitting the Warden.`,
    ],
    lore: `Captain Aldric, of the Queen's Shield. He barred the Keep's gate from the inside so the unmaking would not reach the low road, and stayed on the wrong side of it with his men. He is still guarding it. He still counts it.`,
    rest: `Parry the three-blow combo to break his guard; walk out of every red circle and line.`,
    tips: [
      `Three parries (a perfect one counts twice) break his guard and stun him.`,
      `The slam is a big red circle around him: walk out, then come back in.`,
      `The count is a line of blows walking toward you: step off it sideways.`,
      `If you run, he lunges and leaps after you. Fighting close is safer than kiting.`,
      `Stand idle near any boss and it Dooms you (violet). Keep moving.`,
    ],
    remnant: `His Remnant (Mirrored Oath) calls two shades every 18 seconds, and drops a ring of blows around you every few seconds. Keep moving through the ring; the shades go when he goes.`,
  },
  boss2: {
    seen: `A gardener in robes grown over with caps. The spores come off him like breath. He looks at you the way a physician does.`,
    hints: [
      `Green ground hurts. Do not fight standing in it.`,
      `His rot is a ring: the only safe place is close to him, not far away.`,
      `Below about 70% his medicine drags you in before it bursts: dash out early. When he tends his garden, kill what grows.`,
    ],
    lore: `Brother Tobin, the royal physician. He tried to teach the mountain's bodies to rot again, so they could rest, with the gloomcap from his garden. It worked on him, a little. He can feel the garden thinking.`,
    rest: `Fight close: his worst attacks reach far but leave the ground at his feet safe. Never stand in spores.`,
    tips: [
      `His slam and garden leave spores behind. Move the fight out of them.`,
      `Remedy's three shots can be parried, but they still leave sickness where they land.`,
      `Medicine (below 70%) drags you in, then bursts: dash away when his hands come up.`,
      `Below half he calls Sporecaps and mends himself a little. Thin them quickly.`,
    ],
    remnant: `His Remnant (Spore Bloom) grows pools of spores under your feet. They hurt while you stand in them and keep growing: keep the fight moving.`,
  },
  boss3: {
    seen: `Something sits beside the star at the top of the mountain, rocking a cradle. It sings.`,
    hints: [
      `Her cradle is a ring: safe close in. Her lullaby's lights follow you slowly: parry them, or outrun them.`,
      `When she unravels, stars fall on you and on where you are going. Change direction while they fall.`,
      `At the end she draws you in before she bursts, and lays a cross of light where you stood. Dash away from the pull; never stop where the cross was aimed.`,
    ],
    lore: `Queen Maren. Nineteen years ago she carried her dying child up to the star and asked, "Let nothing I love be taken from me." It granted exactly that. She loved her whole kingdom. Nothing she loved could die, and she cannot stop loving them.`,
    rest: `Three faces, each worse than the last. Learn to keep moving in the second, and to dash out of the pull in the third.`,
    tips: [
      `She changes at two thirds and one third of her health.`,
      `Second face (the mother): stars fall on you and ahead of you; she holds on and calls her people.`,
      `Third face (the wish): the collapse drags you in, then bursts. Weeping leaves water that slows you. The empty cradle is a cross aimed early: walk off its lines.`,
      `She Dooms twice in a row: the second circle lands wherever you went.`,
      `Out on the road she rises again a while after she falls. The wish holds for as long as there is something left that she loves.`,
    ],
    remnant: `Her Remnant (Unwishing) sets three wish-stars around the fight. Break each one inside 10 seconds, or it heals her and makes her hit harder.`,
    old: `After you take her place, the Unmade at the top of the mountain wears your old face, and fights with your old class's moves until it unravels. Then the wish takes over, the same as hers.`,
  },
  herald: {
    seen: `A man in court colours, reading from a scroll that never ends. He is very glad to see you.`,
    hints: [
      `Every line he reads calls guards to the court. A parry breaks their shields.`,
      `The proclamation's light falls along your path: keep turning, do not run in a straight line.`,
      `Below three quarters he tries to present you: a circle that drags you to him. Dash out before it closes.`,
    ],
    lore: `The Queen's chamberlain, still reading your naming-day proclamation to a city held in glass. Nineteen years, and he never reached the end of it. He is waiting to say your name.`,
    rest: `Deal with his guards with a parry each, then go back to him. Keep turning while the light falls.`,
    tips: [
      `Every 12 seconds he calls two Court Guards, never more than four at once. A parry shatters a guard's shield.`,
      `Proclaim falls along where you are heading. Change direction.`,
      `Decree is one long red line. The fanfare's twelve notes can be parried.`,
      `Present (below 75%) pulls you in, then bursts: dash away when he raises the scroll.`,
    ],
  },
  asker: {
    seen: `Light at the bottom of the well, in the shape of whoever is looking at it. It has been waiting a long time for someone to want something.`,
    hints: [
      `Three times it stops and asks what you want. While it waits for your answer, nothing can hurt it.`,
      `"The star grants exactly." Tobin wrote that. Odile has underlined "exactly" three times.`,
      `What it gives, it does not give away. Near the end it remembers every wish it granted in the fight, yours and your friends'.`,
    ],
    lore: `Wanting. The only one of the six that came from above, and the only one that asks. Tobin's sealed notes say the star did not fall by chance: something below was waking, and something above answered. Odile has written one line under that and crossed it out so many times that the page has worn through.`,
    rest: `A wish makes the middle of the fight easier and the end harder. Refusing makes the middle harder and the end clean. Either way, save your strongest skills for its last fifth.`,
    tips: [
      `It asks at 75%, 50% and 25% health. You have 10 seconds; no answer counts as refusing.`,
      `Power: +40% damage. Safety: a ward worth 30% of your health. Speed: +20% move and attack speed. Each lasts the rest of the fight.`,
      `Each refusal: it hits 8% harder, until its last fifth. Then refusals stop counting.`,
      `At 20% health it grows from everything wanted of it: +30% damage and a shield worth 8% of its health, for every wish granted to anyone in the fight.`,
      `Asking for nothing every time: the fight is hardest from 75% down to 20%, then easiest at the end.`,
      `Unasked lands under you and seals the last skill you used for 6 seconds. Do not open with your escape.`,
      `Below half: the Answer is a ring, safe close in; Granted, again sends twenty-two lights after you.`,
    ],
  },
  // ------------------------------------------------------------- the Six
  cinder: {
    seen: `Heat at the bottom of the Ashen Deep, moving the way breath moves. Around it, the ash falls upward.`,
    hints: [
      `Its fever is slow lights that drift after you. Parry them, or keep moving.`,
      `Banked fire is four lines in a cross, aimed where you stood a moment ago. Move while it glows.`,
      `Below half, its last breath drags you in and burns. Dash out early.`,
    ],
    lore: `Ending. The miners at Asterfell's root counted its breathing for forty days, in and out, until the star fell and it held its breath. It has held it for nineteen years. Odile asked Bram what a fire wants. He thought for a long time, and said: to finish.`,
    rest: `Keep moving and keep out of the ash. Leave the pull the moment it starts.`,
    tips: [`Ashfall and its slam leave ash on the ground.`, `From three quarters it calls Ashwalkers.`, `Down here your Ember counts: below what a Depth needs, you hit softer and take more.`],
  },
  undertow: {
    seen: `Water standing where no water should be, deep enough to hold a city. Something under it says your name, and then forgets it.`,
    hints: [
      `The low water is a ring. Stand close to it. It leaves water that slows you.`,
      `Below 60%, Forget lands under you: if it catches you, the last skill you used is sealed for a while. Do not lead with your escape.`,
      `Drown drags you in. The tide is a wide line. Its Unnamed come three at a time: thin them fast.`,
    ],
    lore: `Forgetting. There was a city on this rock before Asterfell, and it took that one first. All that is left of it is a plaque that reads HERE STOOD. Since she went down there, Odile reads aloud every name she has ever known, each night, before she sleeps.`,
    rest: `Stay close, keep your escape for the pull, and never stand in its water.`,
    tips: [`Forget seals your last skill: use a lesser one when it lands.`, `Down here your Ember counts: below what a Depth needs, you hit softer and take more.`],
  },
  rootmother: {
    seen: `Roots, all the way down, and in the middle of them something being very patient.`,
    hints: [
      `Roots come up in a line toward you. Step off the line.`,
      `From 70% she calls Rootbound and mends herself each time. Do not leave them standing.`,
      `Her embrace (below 60%) drags you in. The thicket is safe only close to her.`,
    ],
    lore: `Growing. Tobin went down to her once and came back with a label in his own hand: "Not a cure. A kindness. She lets things finish." Everything that grows is growing toward her, a little. Odile has stopped keeping cut flowers.`,
    rest: `Kill what she grows, fight close, and keep out of her blooms.`,
    tips: [`Bloom scatters spores that stay on the ground.`, `Down here your Ember counts: below what a Depth needs, you hit softer and take more.`],
  },
  choir: {
    seen: `Glass that sings. Somewhere in the third row, a voice you have heard before.`,
    hints: [
      `The chorus is twenty notes in every direction. Find a gap or parry one.`,
      `The requiem is a ring: safe within a few paces of it.`,
      `Below 60%, Recall drops stars on you one after another. Keep moving one way, then turn.`,
    ],
    lore: `Remembering. Every voice the mountain ever lost is in it, and some it has not lost yet. Odile went down once to listen for Tobin. She will not say whether she heard him. She only says the Choir is never out of tune.`,
    rest: `Parry through the chorus, stay close for the requiem, and keep moving under the recall.`,
    tips: [`The refrain is a cross of four lines aimed early: walk off its lines.`, `It calls Echoes. They look like you, once.`, `Down here your Ember counts: below what a Depth needs, you hit softer and take more.`],
  },
  stillness: {
    seen: `At the very bottom, nothing. You can feel it noticing you.`,
    hints: [
      `Hush is a huge pull and burst with two seconds' warning. Start running the moment everything goes quiet.`,
      `Quiet is a ring twelve paces wide. The safe place is close, inside four.`,
      `Below half, Enough lands under you and seals your last skill. Its Hush come three at a time.`,
    ],
    lore: `Enough. The stone above it is blank, and everyone who reads it reads something different. Odile's page for it is blank too, but for one line at the foot, very small: "It asked me what I could do without. I am still answering."`,
    rest: `Respect the hush: leave the moment it pulls. Stay close for the quiet.`,
    tips: [`Nothing is a cross of four long lines, aimed early.`, `Down here your Ember counts: below what a Depth needs, you hit softer and take more.`],
  },
};

export const GROUPS = [
  { title: 'The road', ids: ['grunt', 'spitter', 'stalker', 'imp', 'brute', 'knight', 'wolf', 'shaman', 'scarab', 'golem', 'sporecap', 'wraith'] },
  { title: 'Asterfell', ids: ['glassbound', 'courtguard', 'wishling'] },
  { title: 'The Deep', ids: ['ashwalker', 'unnamed', 'rootbound', 'echo', 'hush'] },
  { title: 'Strays', ids: ['wishthief', 'oathshade'] },
  { title: 'Those who wait', ids: ['boss', 'boss2', 'boss3', 'herald'] },
  // The six Primordials. The note under the name shows once one of the five below the Starwell is met.
  { title: 'Arcana Mundi', sub: 'the secrets of the world', ids: ['asker', 'cinder', 'undertow', 'rootmother', 'choir', 'stillness'],
    note: 'Six of them. The star was only the one that fell.', noteAfter: ['cinder', 'undertow', 'rootmother', 'choir', 'stillness'] },
];
export const CASE_IDS = GROUPS.flatMap((g) => g.ids);
const isBoss = (id) => !!(ENEMIES[id] && ENEMIES[id].boss);

// ---------------------------------------------------------------- the record
export function freshBook(b) {
  b = b && typeof b === 'object' ? b : {};
  for (const k of ['seen', 'kills', 'falls', 'rem']) if (!b[k] || typeof b[k] !== 'object') b[k] = {};
  b.old = b.old || 0;
  b.unread = b.unread || 0;
  return b;
}

/** How far an entry has opened: 0 unknown, 1 seen, 2 laid to rest. Plus which boss hints are open. */
export function stage(b, id) {
  const kills = b.kills[id] || 0;
  return { kills, falls: b.falls[id] || 0, seen: !!b.seen[id] || kills > 0, rested: kills > 0, hints: HINTS.filter((n) => (b.falls[id] || 0) >= n).length, kept: kills >= KEPT };
}

/**
 * Note something that happened. Returns a line to show when it opens a page ('' if nothing new).
 *   kind 'seen' | 'kill' | 'fall', plus { remnant, old } on kills
 */
export function note(b, kind, type, extra = {}) {
  const id = SAME[type] || type;
  if (!CASES[id]) return '';
  const name = ENEMIES[id].name;
  if (kind === 'seen') {
    if (b.seen[id]) return '';
    b.seen[id] = 1;
    if (!isBoss(id)) return '';
    b.unread++;
    return `${BOOK}: ${name}`;
  }
  if (kind === 'kill') {
    const was = b.kills[id] || 0;
    b.kills[id] = was + 1;
    b.seen[id] = 1;
    let line = '';
    if (extra.remnant && !b.rem[id] && CASES[id].remnant) {
      b.rem[id] = 1;
      line = `${BOOK}: a note on ${name}'s Remnant`;
    }
    if (extra.old && !b.old && id === 'boss3') {
      b.old = 1;
      line = `${BOOK}: a note on the face the Unmade wears`;
    }
    if (was === 0) line = isBoss(id) ? `${BOOK}: ${name}'s page is complete` : `${BOOK}: ${name}`;
    else if (was + 1 === KEPT && !isBoss(id)) line = `${BOOK}: Odile has more to say about the ${name}`;
    if (line) b.unread++;
    return line;
  }
  if (kind === 'fall') {
    if (!isBoss(id)) return '';
    b.seen[id] = 1;
    const n = (b.falls[id] = (b.falls[id] || 0) + 1);
    if (!b.kills[id] && HINTS.includes(n)) {
      b.unread++;
      return `Odile has a thought about ${name}`;
    }
  }
  return '';
}

/** Which page each nearby enemy or death belongs to, measured from your hero. */
export function near(p, x, z, r) {
  return (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) <= r * r;
}
export const RANGES = { seen: SEEN_RANGE, kill: KILL_RANGE };

// ---------------------------------------------------------------- where they live
const WHERE = {};
for (const id in MAPS) {
  const m = MAPS[id];
  if (!m || !m.name) continue;
  const types = new Set([...Object.keys(m.roster || {}), m.boss].filter(Boolean));
  for (const t of types) (WHERE[t] = WHERE[t] || []).push(id);
}
function whereText(id) {
  if (CASES[id].where) return CASES[id].where;
  const maps = (WHERE[id] || []).filter((m) => m !== 'wilds');
  if (!maps.length) return '';
  const names = maps.slice(0, 3).map((m) => MAPS[m].name);
  return names.join(', ') + (maps.length > 3 ? ' and further' : '');
}
function whereHint(id, visited) {
  if (CASES[id].where) return CASES[id].where;
  const m = (WHERE[id] || []).find((k) => visited.includes(k));
  return m ? `Somewhere on ${MAPS[m].name}` : 'Somewhere further on';
}

// ---------------------------------------------------------------- moves, in words
const MOVE_NAME = {
  combo1: 'Three blows', combo2: '', combo3: '', cut1: 'Two cuts', cut2: '', bash: 'Bash, then thrust', thrust: '',
  fan: 'Fan of shots', chain: 'Chain swing', shieldrush: 'Shield rush', oath: 'Oath thrust', arc: 'Walking lightning', stepcut: 'Step and cut',
  toast: 'The toast', sweep: 'Halberd sweep', bargate: 'Bar the gate', count: 'The count', holdon: 'Hold on', people: 'Her people',
  emptycradle: 'The empty cradle', everywish: 'Every wish at once', answer: 'The Answer', granted2: 'Granted, again', lastbreath: 'Last breath',
  lowwater: 'Low water', stillmore: 'Be still', cloud: 'Spore cloud',
};
const POOL_WORD = { fever: 'sickness', ember: 'embers', frost: 'frost', spore: 'spores', ash: 'ash', tears: 'water', rot: 'rot' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function moveText(a) {
  let what;
  const n = a.count || 1;
  switch (a.shape) {
    case 'arc': what = a.angle >= 3 ? 'a wide sweep in front' : 'a swing in front'; break;
    case 'circle':
      what = a.leap ? 'leaps onto you' : a.at === 'target' ? 'a circle under you' : a.offset > 0 ? 'a blow on the ground ahead' : 'a burst all around it';
      if (a.pull) what = 'drags you in, then bursts';
      break;
    case 'rect': what = 'a charge in a straight line'; break;
    case 'shot': what = a.around ? `${n} shots in every direction` : n > 1 ? `a fan of ${n} shots` : 'a shot'; if (a.seek) what += ' that follow you'; break;
    case 'rain': what = a.line ? 'strikes walking toward you in a line' : a.scatter ? `${n} strikes scattered around` : n > 1 ? `${n} strikes falling on and ahead of you` : 'lands where you stand'; break;
    case 'ring': what = `a ring; safe within ${+a.inner.toFixed(1)} m of it`; break;
    case 'beam': what = a.cross ? 'four lines in a cross, aimed early' : 'one long line'; break;
    case 'call': what = a.summon ? `calls ${a.summon.count} ${ENEMIES[a.summon.type].name}${a.summon.count > 1 ? 's' : ''}` : 'calls for help'; if (a.heal) what += ' and mends itself'; break;
    default: what = '';
  }
  const bits = [what];
  if (a.blink) bits.push('steps beside you first');
  if (a.chain) bits.push('more follow at once');
  if (a.pool) bits.push(`leaves ${POOL_WORD[a.pool.kind] || 'something'} on the ground${a.pool.slow ? ' that slows you' : ''}`);
  if (a.chill) bits.push('chills you');
  if (a.seal) bits.push(`seals your last skill for ${a.seal} s`);
  const when = a.phase ? `face ${a.phase}` : a.hpBelow ? `below ${Math.round(a.hpBelow * 100)}%` : '';
  return { what: bits.filter(Boolean).join('; '), when };
}
function movesOf(id) {
  const out = [];
  for (const a of ENEMIES[id].attacks || []) {
    if (a.name === 'none' || a.name === 'lunge' || a.name === 'leap') continue;
    const label = a.name in MOVE_NAME ? MOVE_NAME[a.name] : cap(a.name);
    if (!label) continue;
    const t = moveText(a);
    out.push({ label, parry: a.shape !== 'call' && a.parryable, call: a.shape === 'call', warn: a.windup, ...t });
  }
  return out;
}


// ---------------------------------------------------------------- what it leaves (0.61.2)
// Worked out from the same tables the game rolls with (dropLoot and killEnemy in sim/world.js), for the
// world tier you are on, so the page never drifts from the game.
const pct = (x) => {
  const v = x * 100;
  if (v >= 99.95) return '100%';
  if (v >= 10) return Math.round(v) + '%';
  if (v >= 1) return (Math.round(v * 10) / 10) + '%';
  return (Math.round(v * 100) / 100) + '%';
};
const rname = (i) => RARITIES[i].name;
const rchip = (i, txt) => `<span class="case-r" style="--r:${RARITIES[i].color}">${txt}</span>`;

/** Chance of each rarity for one roll, as rollItem does it (and Lucky Star after it). */
export function rarityOdds({ minRarity = 0, weights = null, ilvl = 1, luck = 0 }) {
  const w = weights || RARITIES.map((r, i) => (i < minRarity ? 0 : r.weight * (1 + Math.min(ilvl, 30) * 0.035 * i)));
  const sum = w.reduce((a, b) => a + b, 0);
  let p = sum > 0 ? w.map((x) => x / sum) : RARITIES.map((_, i) => (i === minRarity ? 1 : 0));
  if (luck > 0) {
    // Lucky Star: below Ancient, a chance to be one rarity higher
    const q = p.map((x, i) => (i < 5 ? x * (1 - luck) : x));
    for (let i = 0; i < 5; i++) q[i + 1] += p[i] * luck;
    p = q;
  }
  return p;
}
function oddsRow(odds) {
  return odds.map((x, i) => (x >= 0.00005 ? rchip(i, `${rname(i)} ${pct(x)}`) : '')).filter(Boolean).join(' ');
}
const orBetter = (i) => (i >= RARITIES.length - 1 ? rname(i) : `${rname(i)} or better`);

/** The level its gear drops at: 100 from world tier II, else the middle of the first map it lives on. */
function dropLevel(id, tier) {
  if (tier >= 2) return CONFIG.MAX_LEVEL;
  const m = (WHERE[id] || []).filter((k) => k !== 'wilds').map((k) => MAPS[k])[0];
  return m ? Math.max(1, (m.level || 1) + Math.round((m.levelSpan || 0) * 0.5)) : 30;
}

/**
 * The drops part of a detailed page.
 * @param {object} b     the book (a Remnant's Immortal is named only once you have met the Remnant)
 * @param {string} id
 * @param {{ tier?: number, luck?: number }} [ctx]  the world tier you are on, and Lucky Star's chance
 */
export function spoilsHtml(b, id, ctx = {}) {
  const def = ENEMIES[id];
  // the Deep and the five Primordials below the Starwell are only ever met on world tier V
  const deep = GROUPS.find((g) => g.title === 'The Deep').ids.includes(id) || (def.boss && GROUPS[GROUPS.length - 1].ids.includes(id) && id !== 'asker');
  const tier = deep ? TIERS.length - 1 : Math.max(1, Math.min(TIERS.length - 1, ctx.tier || 1));
  const T = TIERS[tier];
  const luck = ctx.luck || 0;
  const floor = T.minRarity;
  const ilvl = dropLevel(id, tier);
  const rows = [];
  const row = (label, body) => rows.push(`<tr><th>${label}</th><td>${body}</td></tr>`);
  const K = DEEP.kindling;

  if (def.summon) {
    rows.push(`<tr><td colspan="2">Nothing. It is only a shade of something else.</td></tr>`);
  } else if (def.thief) {
    row('When caught', `${THIEF.items} pieces of gear, a shard, ${THIEF.dust} Wishdust and ${FRAGMENTS.thief} Immortal Fragments`);
    row('First piece', oddsRow(rarityOdds({ minRarity: Math.max(floor, 4), ilvl })));
    row('The others', oddsRow(rarityOdds({ minRarity: Math.max(floor, 2), ilvl })));
    row('Also', `${pct(GLASS.thief)} an Unwishing Glass`);
  } else if (def.boss) {
    const L = BOSS_LOOT[id];
    if (L) {
      row('First kill', `${L.items} pieces, the first one ${rchip(L.first, rname(L.first))} for certain; and 2 skill points`);
      row('Its best piece', oddsRow(rarityOdds({ weights: L.top, luck })));
      row('The rest', `${L.items - 1} more: ${orBetter(L.min)}${L.better ? `, ${L.better === 1 ? 'one' : L.better} of them ${orBetter(L.min + 1)}` : ''}`);
      row('Also', `${L.keys} Warden key${L.keys > 1 ? 's' : ''} and ${L.tickets} shard${L.tickets > 1 ? 's' : ''}`);
      if (REMNANT_UNIQUE[id]) {
        const imm = b && b.rem && b.rem[id] && EFFECTS[REMNANT_UNIQUE[id]] ? EFFECTS[REMNANT_UNIQUE[id]].itemName : 'its own Immortal';
        row('Its Remnant', `(after ${REMNANT.after} kills, ${pct(REMNANT.chance)} of its returns) one more piece, a set piece, ${FRAGMENTS.remnant} Immortal Fragments and ${REMNANT.dust} Wishdust; ${pct(REMNANT.unique)} ${esc(imm)}, ${pct(REMNANT.glow)} its weapon glow, ${pct(GLASS.remnant)} an Unwishing Glass`);
      }
      rows.push(`<tr><td colspan="2" class="note">A boss far below your level pays less. ${tier >= 2 ? `A streak (bosses beaten without falling) adds ${Math.round(CONFIG.STREAK_LOOT * 100)}% more gear each.` : 'From world tier II, a streak of bosses beaten without falling adds more.'}</td></tr>`);
    } else {
      row('Gear', `2 pieces`);
      row('Each', oddsRow(rarityOdds({ minRarity: Math.max(floor, 2), ilvl, luck })));
      if (deep) row('Kindling', `always, until its Depth has given you ${DEEP.kindlingMax}`);
    }
  } else {
    const chance = Math.min(1, (def.drop || 0) * T.loot);
    row('Gear', chance > 0 ? `${pct(chance)} of kills` : 'none');
    if (chance > 0) row('Its rarity', oddsRow(rarityOdds({ minRarity: floor, ilvl, luck })));
    row('Shards', def.heavy ? 'one every kill' : `${pct(CONFIG.TICKET_CHANCE)} of kills`);
    if (deep) row('Kindling', `${pct(K.normal)} of kills, ${pct(K.elite)} from an elite or a Storied one (up to ${DEEP.kindlingMax} from each Depth)`);
    if (tier > 1 || ilvl >= ELITE_FROM_LEVEL) {
      const ew = ELITE_SPOILS.weights.map((w, r) => (r < floor ? 0 : w));
      row('As an elite', `one more piece (${oddsRow(rarityOdds({ weights: ew, luck }))}), ${ELITE_SPOILS.dust[0]} to ${ELITE_SPOILS.dust[1]} Wishdust, ${pct(ELITE_SPOILS.fragment)} an Immortal Fragment, ${pct(ELITE_SPOILS.chest)} a radiant chest`);
    }
    row('If Storied', `a piece ${orBetter(Math.max(floor, 3))} (${pct(RARE.better)} ${orBetter(Math.max(floor, 4))}), ${pct(RARE.set)} a set piece, ${FRAGMENTS.storied} Immortal Fragments, ${RARE.dust[0]} to ${RARE.dust[1]} Wishdust, ${pct(SIGIL.storied)} a Remnant Sigil, ${pct(GLASS.storied)} an Unwishing Glass`);
  }
  const at = def.summon ? '' : `<p class="setting-desc">${deep ? 'In the Deep, which is always' : 'On'} world tier ${T.numeral}${floor ? ` (nothing below ${rname(floor)})` : ''}, for gear of level ${ilvl}${luck ? `, with Lucky Star (${pct(luck)} a step higher)` : ''}.</p>`;
  return `<h4>What it leaves</h4><table class="case-spoils"><tbody>${rows.join('')}</tbody></table>${at}`;
}

// ---------------------------------------------------------------- drawing
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The list on the left. */
export function listHtml(b, sel, visited) {
  let rested = 0;
  const parts = [];
  for (const g of GROUPS) {
    parts.push(`<h3>${g.title}${g.sub ? `<small>${g.sub}</small>` : ''}</h3>`);
    if (g.note && g.noteAfter.some((id) => stage(b, id).seen)) parts.push(`<p class="case-group-note">${g.note}</p>`);
    for (const id of g.ids) {
      const s = stage(b, id);
      if (s.rested) rested++;
      const label = s.seen ? ENEMIES[id].name : '???';
      const mark = s.rested ? `<small>${s.kills}</small>` : isBoss(id) && s.falls ? `<small class="falls">${s.falls} ✕</small>` : '';
      parts.push(`<button type="button" class="case-item ${id === sel ? 'on' : ''} ${s.rested ? '' : s.seen ? 'seen' : 'unknown'}" data-case="${id}">${esc(label)}${mark}</button>`);
    }
  }
  return { html: parts.join(''), rested, total: CASE_IDS.length, hint: visited };
}

/** The page on the right. `detail`: the detailed view. `ctx`: { tier, luck } for the drop rates. */
export function pageHtml(b, id, detail, visited, ctx = {}) {
  const c = CASES[id];
  const def = ENEMIES[id];
  const s = stage(b, id);
  const boss = isBoss(id);
  const h = [];
  if (!s.seen) {
    h.push(`<h3 class="case-name">???</h3><p class="case-where">${esc(whereHint(id, visited))}</p>`);
    h.push(`<p class="setting-desc">${boss ? 'Not met yet.' : 'Not yet laid to rest. Its page opens the first time you do.'}</p>`);
    return h.join('');
  }
  h.push(`<h3 class="case-name">${esc(def.name)}${def.title ? `<small>${esc(def.title)}</small>` : ''}</h3>`);
  h.push(`<p class="case-where">${esc(whereText(id) || '')}</p>`);
  if (detail) {
    const counts = [`Laid to rest: ${s.kills}`];
    if (boss) counts.push(`Fell to it: ${s.falls}`);
    h.push(`<p class="case-counts">${counts.join(' · ')}</p>`);
  }
  if (!s.rested) {
    if (!boss) {
      h.push(`<p class="setting-desc">Seen, but not yet laid to rest. Its page opens the first time you do.</p>`);
      return h.join('');
    }
    h.push(`<p class="case-lore">${esc(c.seen)}</p>`);
    const open = c.hints.slice(0, s.hints);
    if (open.length) {
      const shown = detail ? open : open.slice(-1);
      h.push(`<h4>Odile's thoughts</h4>`);
      for (const t of shown) h.push(`<p class="case-hint">${esc(t)}</p>`);
    }
    const next = HINTS.find((n) => n > s.falls);
    h.push(`<p class="setting-desc">${next ? `Each time it beats you, Odile writes a little more (next after ${next} fall${next === 1 ? '' : 's'}).` : 'Odile has told you all she can guess.'} Lay it to rest to complete the page.</p>`);
    return h.join('');
  }
  h.push(`<p class="case-lore">${esc(c.lore)}</p>`);
  if (detail && c.more) {
    h.push(s.kept ? `<p class="case-lore more">${esc(c.more)}</p>` : `<p class="setting-desc">Odile has more to say after ${KEPT} laid to rest (${s.kills} of ${KEPT}).</p>`);
  }
  h.push(`<h4>To give it rest</h4><p class="case-rest">${esc(c.rest)}</p>`);
  if (detail) {
    if (c.tips && c.tips.length) h.push(`<ul class="case-tips">${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
    if (c.remnant) h.push(b.rem[id] ? `<h4>Its Remnant</h4><p class="case-hint">${esc(c.remnant)}</p>` : `<p class="setting-desc">Its Remnant has a page too, once you lay one to rest.</p>`);
    if (c.old && b.old) h.push(`<h4>The face it wears</h4><p class="case-hint">${esc(c.old)}</p>`);
    const mv = movesOf(id);
    if (mv.length) {
      h.push(`<h4>Its moves</h4><table class="case-moves"><tbody>`);
      for (const m of mv) {
        const tag = m.call ? '<span class="tag call">Call</span>' : m.parry ? '<span class="tag parry">Parry</span>' : '<span class="tag red">Red</span>';
        h.push(`<tr><td>${tag}</td><td><b>${esc(m.label)}</b>${m.when ? ` <small>${esc(m.when)}</small>` : ''}<br><span>${esc(cap(m.what))}</span></td><td class="warn">${m.call ? '' : m.warn.toFixed(1) + ' s'}</td></tr>`);
      }
      h.push(`</tbody></table><p class="setting-desc">Parry: press parry as it flashes white. Red: cannot be parried; walk out or dash through. The last column is how long it warns you.</p>`);
    }
    h.push(spoilsHtml(b, id, ctx)); // (0.61.2) its drop rates
  } else if (c.tips && c.tips.length) {
    h.push(`<p class="setting-desc">More in the detailed view.</p>`);
  }
  return h.join('');
}

/** The first page worth opening: the newest thing, or the first one met. */
export function firstPage(b) {
  return CASE_IDS.find((id) => stage(b, id).seen) || CASE_IDS[0];
}
