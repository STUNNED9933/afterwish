# Afterwish

*What falls here does not stay down.*

A 3D action RPG by STUNNED Games that runs in the browser. League-style controls
(right-click to move, QWER aimed at the cursor), a parry at the heart of the
combat, and MMO-style progression: EXP, levels and randomised gear that carry
over between runs.

It runs in a web browser. There is nothing to install and no `.exe`, so
Windows never shows a SmartScreen or antivirus warning.

## Play

Double-click `dist/index.html`. It opens in your browser and works offline.

| Key | Action |
| --- | --- |
| Right-click | Move. Right-click an enemy to attack it (left-click on an enemy works too) |
| Space | Parry. Press it when an enemy flashes white |
| Q W E R | Cleave, Whirlwind (level 2), Breakthrough (level 3), Skyfall (level 6) |
| Ctrl or Shift + Q/W/E/R | Spend a skill point to rank that ability up (or click the + above it) |
| 1 2 3 | Pick an augment when three are offered |
| 1 | Health potion |
| D F | Borrowed skills, once another class has beaten the Quiet (choose them in Talents, under Mastery) |
| Tab (or I) | Gear and stats. The fight pauses while it is open |
| Esc (or P) | Pause, settings (including parry timing), return to town |
| S / Enter / M | Stop / start the next wave now / mute |

Pale gold attacks can be parried. Red attacks cannot: walk out or dash through
with E. A parried enemy is stunned and takes 50% more damage. The boss on every
fifth wave needs three parries to break its guard (a perfect parry counts as
two). Dying keeps your level, gear, gold and scrap.

### Exploration (levels 1 to 100 since 0.8)

**Explore** on the title screen starts you in Haven, a safe town. A blue
portal leads out. Beyond it is a chain of ten maps, each ten levels tougher
than the last, each with its own look, music and enemies:

| Map | Enemy levels | Who lives there |
| --- | --- | --- |
| Haven | none | Safe. Heals you and refills potions. Home of the Waygate |
| Greenwood Trail | 1 to 9 | Husks, a few Spitters |
| Spitter Fen | 10 to 19 | Spitters, Stalkers |
| Ashen Ridge | 20 to 29 | Cinder Imps, Husks, Crushers, Stalkers |
| Warden's Keep | 30 to 39 | Oathbound Knights, Crushers. **The Warden** (40) in the middle |
| Frostfall Pass | 40 to 49 | Frost Wolves, Rime Callers |
| Sunscar Dunes | 50 to 59 | Dune Scarabs, Stone Colossi, Cinder Imps |
| Gloomcap Hollow | 60 to 69 | Sporecaps, Frost Wolves. **The Mycelord** (70) in the middle |
| Stormspire Cliffs | 70 to 79 | Storm Wraiths, Oathbound Knights |
| Obsidian Maw | 80 to 89 | Cinder Imps, Stone Colossi, Knights, Wraiths |
| Starfall Sanctum | 90 to 99 | A mix of the worst. **The Unmade** (100) in the middle |

The eight enemies added in 0.8:

| Enemy | What it does | How to deal with it |
| --- | --- | --- |
| Cinder Imp | Small, fast, weak claw | Parry or just kill it |
| Oathbound Knight | Two cuts in a row | Parry both; two parries stagger it |
| Frost Wolf | Fast bite with a short wind-up | Parry early |
| Rime Caller | Fan of three ice shards | Parry one back or sidestep |
| Dune Scarab | Long red charge | Cannot be parried: step aside |
| Stone Colossus | Huge red ground slam | Cannot be parried: walk out of the circle |
| Sporecap | Slow red spore | Cannot be parried: sidestep |
| Storm Wraith | Very fast bolt | Parry on reaction, or keep moving |

- **Levels.** The cap is 100. Inside a map, enemies near the entrance are at
  the bottom of its range and those by the far portal at the top. A kill pays
  **10x EXP** when the enemy is within 3 levels of you, sliding down to **2x**
  at 10 or more levels apart (above or below), never less (0.49,
  `levelBandMult` in `src/sim/defs.js`). `EXP_PACE` in `src/config.js` (4 since
  0.49) makes the whole climb longer or shorter.
- **Enemy strength** is one formula, `enemyScale` in `src/sim/defs.js`. It
  keeps pace with a hero in ordinary gear of the same level, then adds a ramp:
  by level 100 an enemy takes about three times as long to kill and hits about
  twice as hard as at level 1, which is what gear upgrades, ability ranks and
  parrying are for.
- **The Waygate** is the gold ring in Haven. Stand on it to jump to the
  entrance of any map you have already walked into.
- **Ability ranks** now go to 20 (+6% damage and 1.5% shorter cooldown each).
- Gear names change every ten levels, and caches hold gear of your own level
  (and cost more gold as you level).
- Stand in a portal for a moment to travel. You arrive beside the portal that
  leads back.
- Enemies are spread over the whole map. They wander near their own spot,
  ignore you until you come close, give up if dragged too far, and return 25
  seconds after you kill them (The Warden takes two minutes).
- Houses, trees, rocks, braziers and the well are solid. You and the enemies
  walk around them; a move order to a spot you cannot reach is dropped.
  Arrows and spells still fly over them.
- Being knocked out only sends you back to Haven. You lose nothing.
- **The arena is the Echo Ring** (since 0.13): a ring of standing stones on the
  hill behind Haven, set with star-glass, that calls up echoes of what the
  mountain remembers. In the code it is still called the arena, and shards are
  still called tickets. Sister Odile has two quests there. You fight there with
  the same character. Waking the Ring costs one starglass shard; enemies out here drop them (always from Crushers
  and bosses).
- The arena follows your level: its enemies are about as strong as you are,
  and each wave adds health and damage on top. It pays half the EXP of
  exploration, so level up outside and come to the arena for gold, keys and
  augment runs. Its boss waves rotate through the three bosses, and enemies
  from the later maps join from wave 6.
- The minimap shows the map you are on: enemies in red, portals in blue.

Maps live in `MAPS` in `src/sim/maps.js`. A map is a handful of numbers (size,
enemy level, which enemies and how many, how many trees and rocks, where its
portals go); the layout is generated from its name, the same every time. To
add a map, add an entry and point a portal at it from a neighbour. Map colours
and tree shapes are in `MAP_THEMES` in `src/render/renderer.js`.

### Multiplayer: co-op exploration (added in 0.11)

Up to 4 players explore together. On the title screen choose **Play with
friends**:

- **Host a room** and you get a five-letter code (it also sits under the
  minimap; click it to copy). Your browser runs the game for everyone, so keep
  the tab open. It keeps running if you switch to another window.
- Friends type the code and press **Join**. Each brings their own character
  (whichever class they have selected) and it saves in their own browser.

How it plays:

- The party shares one map. When anyone takes a portal or the Waygate,
  everyone travels.
- Every party member within 30 steps of a kill gets their own gold, their own
  loot roll (only they can see and pick it up), quest credit and 75% of the
  EXP. Bosses give each of you a full hoard.
- Enemies go for whoever is closest, and a swing or slam hits everyone
  standing in it. Each of you can parry.
- Knocked out in a party, you get back up at the map's entrance. If everyone
  falls, the party wakes up in Haven.
- Friends see what the host's game sends, about 20 times a second, so their
  own movement lags by their connection's delay.

How it connects: players find each other through PeerJS's free public
matchmaking server, then the browsers connect directly (WebRTC). Nobody runs a
server. Some school and work networks block direct connections; home internet
and phone hotspots usually work. To test on one computer, run your own
matchmaker (`npm install peer`, then a two-line PeerServer script on port
9000) and open the game with `?peer=127.0.0.1:9000` at the end of the
address. `test/coop.py` does this with two browsers.

The code: `src/net/room.js` (rooms and codes), `src/net/sync.js` (what is
sent), and the party parts of `src/sim/world.js` (`heroes`, `use`, `addHero`).

### Moving saves to another browser

Saves live in the browser you play in. On the title screen, **Move saves to
another browser** lets you download a save file (or copy a save code), then
load it in another browser. It carries every character, the shared gold and
tickets, and your settings, and replaces whatever was there.

### Smooth movement for friends (0.54.11)

A friend's own hero is drawn a little ahead of the host's word while it walks, so it answers at once.
That lead used to jump: turning, stopping or the host catching up moved the hero up to a body-length in a
single frame, a few times a second. It now eases into place. Measured on a test room: the friend's walk
went from 120% speed wobble with a jump in 1 frame of 36, to 20% and almost none. Each update's glide
also keeps its own beat instead of the frame that noticed it.

### Lacuna: levels (0.99.36)

- **Experience and levels, 1 to 60.** A gold bar under your mana. Beasts give experience (a wolf 12, a Thornhog 14, a Cairn Golem 30; a story's beast, ashen or a contract's quarry, twice that), each part of the story gives some once as you finish it, and each trick learned gives 40.
- **A level** is 4% more health and 2% more might (the Link multiplies them again), and a talent point for the talent web (coming next). Levels come quickly at first (a few wolves) and slow down.
- A save from before levels is given the experience for the story so far: Quest 5 done is about level 8.
- In a server world your level comes with you (for now, as the page says; with accounts, the server will keep it).

### Lacuna: moving well (0.99.35)

Tricks for those who want them, none of them needed (walk and jump as before and nothing changes). **H** shows the list, ticked off as you do each one.

- **Bunny hop:** press Space again the moment you land (or just before: it is remembered for a moment) and you keep your speed, a little more each hop, up to 1.7 times a run. Stop hopping and the extra bleeds away.
- **Slide:** **C** while running bursts you along the ground; **Space** out of a slide is a long, fast leap (about half as far again as a hop). C still walks or runs when you are standing or walking.
- **Double jump:** Space again in the air (about 1.6 m up all told).
- **Wall kicks:** in the air beside a tree, a rock or a wall, Space kicks you up and away from it, keeping your speed along it, and gives your double jump back (three kicks before you land).
- **Rocks can be stood on**, so the height is worth something: jump, double jump or kick your way up; walk off the edge and you fall.
- **The paths' launches:** the Berserker presses Space as Skyfall lands and bounces over two metres up; the Sharpshooter looks down in mid-air and shoots, and the recoil throws her up and back (once a jump).
- Speed is held to twice a run; the server's check allows for exactly that much, and takes your height, so standing on a rock in a shared world is not mistaken for standing inside it. Others see you up there too.

### Lacuna: the opening lies you down, even from a server world (0.99.34)

- **Lying in the grass, every time.** Started from a server world, the opening re-dressed the hero (as the boy in rags) after he had already been laid down, and the new model stood up; a landing could also get him up early. Now he is laid down again on whatever model arrives, and nothing but the scene's own "rise" gets him up.

### Lacuna: the real cause of the shaking (0.99.33)

- **A beast that stopped next to you kept shuddering.** Beasts are drawn eased between the sim's last two steps, and that pair only moved on when the beast did: one that had stopped was drawn sliding from where it stood a step ago to where it stands, again and again, thirty times a second (about 8 cm each way). Now it moves on every step, moved or not: a beast standing still is drawn standing still.
- **Beasts go round trees and rocks** instead of pressing into them (and being pushed straight back, which also looked like being stuck and shaking): held up, a beast veers off to one side for a moment, then comes on.

### Lacuna: beasts no longer shake as they come at you (0.99.32)

- **The shaking.** A beast at the edge of its reach stepped in and stopped on alternate beats as you moved about (an archer backing off made it worst), and each change restarted its walk or its stand: a violent shudder. Now a beast in reach stays put until you are clearly out of it (in a test of a wolf chasing a backing-off hero: 54 stop-starts in 13 seconds, now 12), its body only changes between walking and standing once the change has lasted a moment, and it turns smoothly instead of snapping round.

### Lacuna: the contracts can be finished in any order (0.99.31)

- **A contract's beasts no longer come back as its quarry.** When a hunted beast fell, the land brought it back after a while still marked as the hunt's, and the marker led you to it (a boar at Brightwater, long after that contract was done) instead of the contract still open. Fallen story beasts now come back as ordinary ones, and the marker names what it points at (the Ashen Cairn, an Ashen Thornhog...).

### Lacuna: fixes from playing (0.99.30)

- **Boars and wolves no longer bite from inside you.** Their bodies are longer than their reach, so they stood with their heads in whoever they attacked; each is now set back so its snout is at the edge of its reach, and the Thornhog is a little smaller.
- **Vesper's first fight ends on hits, too.** It used to end only when he had hurt you badly (or after a while), so an archer keeping her distance had to wait it out; now it also ends once you have landed eight blows on him. His cast is slower and blends in instead of snapping.

### Lacuna: Quest 5, Word Gets Around; real townsfolk and beasts (0.99.29)

- **Quest 5, Word Gets Around.** Spring, after the winter without Ilse. Rowan has three contracts from the Guild's board, posted for the Hounds by name ("Half of Sunmere thinks you killed a dragon"): a **cairn golem walking** in the stony north, **Thornhogs at Brightwater** that don't run, and **wolves howling past the east gate** in daylight. Do them in any order; the tracker and the marker show what's left. Every one of the beasts is grey with the same ash. Back at the Guild, Sorrel lays ash on four places on a map (the three, and the glade) and they make a ring with Sunmere in the middle. Odile won't rank you by the glass any more: **rank E, provisional**, a first in her years there. Dace manages "Don't let it go to your head, stray" and says Wren hasn't been well since the glass. Across the plaza a woman in a grey cape is watching; when you look again, she's gone. Next: Quest 6, An Invitation.
- **The Hounds fight beside you** on hunts (the ash wolves, the contracts): Rowan cuts, Juni shoots, Sorrel burns. Their blows are smaller than yours, and Rowan says why: "The kill's yours, Sprout: that's how you learn."
- **Real townsfolk.** The nearest dozen or so people in Sunmere are drawn as the main game's villagers (farmers, elders, a miner, children), each in their own clothes' colour, walking and standing with real animations. Further off they're the simple figures, as before.
- **Real beasts.** Close up, wolves are the main game's wolf, golems its golem, and **Thornhogs have a model of their own** (new, made with Tripo). Ashen beasts are the same bodies, greyed and darkened. The wolves in the opening are real wolves too.
- **Vesper has his own model**: slicked-back black hair with a streak of grey, a black and violet officer's coat. He used to be the old mage model darkened, and looked like Sorrel.
- **Choose your path from the keyboard**: 1 for the Berserker, 2 for the Sharpshooter (the mouse belongs to the camera until Alt is held).
- "A year." is now "A year passed in what felt like a single breath."

### Lacuna: hands, blades and arrows (0.99.28)

- **Palms face the body.** Every story character stood and walked with their palms turned forward, like a statue. Tripo makes its models with the palms forward; the animation library's are down, and the difference was carried into every clip. The animation tool now reads which way each hand faces from the hand itself and turns the forearm to match before moving the clips across. Everyone was rebuilt: the Hounds, Odile, Dace, Wren, Vesper (from his original model) and Thessaly.
- **Rowan stands with his hand on his hilt** instead of folding his arms (the fold didn't sit right on him). In the Guild's yard, Wren steps out of the way before he draws on Dace, and he stops clear of everyone: no more blade through a friend.
- **The boy's sword stays out of the dirt** when he runs. It's carried back and only a little down (the grown hero's angle put the tip in the ground).
- **Your arrows fly into the crosshair.** They used to fly level at bow height, so scoped they went in under the reticle. Now they rise onto the crosshair's line within a few metres. (Where they can hit is unchanged.)
- **Thessaly remade.** The first model's long open cloak hung between her legs like a third leg. She now wears a short grey cape over a leather jerkin, trousers and riding boots. The first model is kept for a future enemy. And she really does vanish: she presses the clasp into your hand, you look down at it, and when you look up she's gone.
- **Ilse's last moments are clearer.** You speak now, as Sprout: "Ilse?", then "Heal it, like you always do!" She answers "Not this one, Sprout." Rowan's line afterwards is finished: "She'd have been so proud of you."
- **Vesper walks out of the trees by a clear way** instead of straight into one.

### Lacuna: the story reworked, and fixes from playing (0.99.27)

- **The Hounds don't take you in straight away.** In Sunmere they ask around first: Rowan at the watch-house, Ilse at the temple, Juni's notice on the Guild board (someone has pencilled under it HAVE YOU TRIED THE WELL?), Sorrel in the records hall. Five days, and nobody comes. On the fifth night you overhear them on the step and they decide: you stay, and if someone comes for you one day they'll be glad for you. Then the chores begin. New short quest: **Someone Must Be Looking**.
- **Nobody is certain about you, and everyone is curious.** Ilse can't explain why your memory isn't coming back or why your scrapes heal so slowly ("I don't know what it is. I wish I did"). Sorrel thinks something about you doesn't add up. They're also proud of you: a full bucket at your size, two laps without stopping, and any technique copied after seeing it **once**. Rowan and Juni now show a move before each trial, and both are a little stunned when you get it first time. Lines that rang false were rewritten.
- **Quest 4 reworked.** Vesper is curious, not certain ("Is it you? ...It might be you"). He wants your body to study, and the blow he throws is meant to kill you. Ilse takes it. When the Link wakes you can hurt him, and he's sure to the end that nothing in this world can touch him. He doesn't run: the tear is no door. Bring him low, press Space ("For Ilse"), and **you end him**. The Hounds gather round Ilse; Rowan can't finish his sentence. In the cards afterwards, Rowan keeps setting out five cups every morning, and every morning it takes him a long moment to put one back.
- **Thessaly, of the Ninth Hand.** Weeks later a woman in a grey hooded cloak walks onto the training ground: the crown's hand that's in no ledger. She hedges everything she says. They think Vesper was a high-ranking officer of the Unbound, who want to call the Primordials into this world so their own can rise the way the gifted (the Granted) once did, which would bring chaos to Lacuna. She leaves a silver clasp shaped like a closed eye. (New model, new name: no more Marens.)
- **Nobody runs on the spot any more.** Every character now picks walking, running or standing from how fast they're really moving, every frame, with their steps matched to the ground covered. A walk that gets no closer for most of a second stops. A model that finishes loading late picks up what it was asked to do. So nobody slides in cutscenes with frozen legs, together or alone. Vesper gained a fall and a knock-back.
- **Arrows leave your bow, not the air above your head** (they were at a grown man's height), even mid-jump. **An arrow that visibly misses doesn't hit**: the hit check is tighter, and an arrow stops in a beast only when it really struck it.
- **Cuts land where you swing.** Looking down from close behind, the aim point could land on the ground *behind* you, so the swing went ahead and the damage went back. Attacks now never aim behind you. You turn to face the cut and hold that facing while it lands, and a pale fan on the ground shows its true reach and width.

### Lacuna: Quest 4, When It Counts (0.99.26)

- **After you choose your path, Rowan wants a word.** A year passes in a few cards (the training ground every morning, the lodging every evening, the fog never quite gone, nor the name Sprout). Ilse measures you: you **haven't grown at all** since last spring. Then a contract: **ashen wolves** in the Wakewood, ash in their fur, near the glade where they found you. Near the tear.
- **The hunt:** the Hounds set out with you along the west road and **follow you** (each a few steps behind, walking or running to keep up). Four ashen wolves; the marker shows the nearest. This part is played alone (like the opening).
- **At the glade the tear is stirring,** and a smiling man walks out of the trees: **Vesper, of the Unbound** ("We take the limits the sand puts on people, and we break them. And this one broke the sand."). The ash on the wolves was his. The Hounds go at him and it is nothing to him: Juni's arrow crumbles to ash, Sorrel's fire goes out, Rowan's blade stops in the air, and a lift of his hand throws all four of them down.
- **You fight him, and you cannot hurt him** (your blows barely mark him; Ilse keeps healing you). Then **Ilse steps in front of the blow meant for you**, and dies: "Hey, look at me. You're all right. You're all right now. Don't let that fog take you."
- **The Link wakes.** The fog floods in; the memories come all at once (the white keep, the gold thread, "keep it safe"), and a thread pulls tight behind your ribs where the tear once hooked you. From now on your Eternal gear lends you its strength in Lacuna (the Link was asleep until now), and for this fight you are three times as strong.
- **The second fight:** now you can hurt him. Bring him low and he steps back through the tear ("We'll meet again, little one. Grieve well."). The Hounds kneel round Ilse; Sorrel saw your eyes turn gold. They bury her on the hill above Sunmere, where the silverleaf grows. Nobody called you Sprout that winter.
- **Gestures look like themselves now.** Every one-off move a story character made (a wave, a cut, a cast, a laugh, a fall) was blending half-and-half with the idle still running underneath it; it now cross-fades properly. Falls and knockbacks also keep their drop to the ground. The Hounds gained a fall, a flinch and a knockback.
- Quest 5, Word Gets Around, is next. Vesper is the first Company's old mage model (the one that always smiled), darkened: no new credits.

### Lacuna: fixes from playing (0.99.25)

- **Deadeye follows your aim while you hold it.** Its direction was fixed when you pressed R, so scoping in mid-draw changed nothing; now the arrow flies wherever you point when you let go (or when it looses itself at full draw), scoped or not. (The server is told where you aim ten times a second while you draw.)
- **Rowan keeps his sword at his left hip** in town, on the road and in the Guild's yard, so he can fold his arms. He **draws it when it is needed**, his right hand reaching across to the hilt and pulling it out: coming at the wolves, on the training ground, and in the Guild's yard when Dace calls the hero a stray ("Walk away, Dace."). Then back it goes.
- **The Telling Glass's secret is quieter.** No black line: the sand the hero stirred just settles a shade greyer. Then **Wren** puts her hands on the glass and gets nothing at all, not a grain, and a hairline crack runs up it. Odile closes the telling for the day. Dace blames the stray. Only Sorrel, last to leave, rubs a pinch of the sand between his fingers: it clings, like ash. The glass stays cracked.
- **Ilse no longer walks on hooves.** Her model was made with her feet pointing up and a knee bent; the animation tools now straighten a bent knee and set an upturned foot flat before measuring (as they already did for arms). Juni, Dace, Wren and the hero, a little bent at the knee too, were rebuilt the same way.
- **Nobody walks through houses.** People in the story are kept out of walls and trees everywhere now (not only in the scenes), and Ilse goes to the meadow by the north road.
- **The Hounds no longer run on the spot** on the walk into town: held back (by the hero standing where they want to be), they stand instead.

### Lacuna: Days with the Hounds (0.99.24)

- **Between the walk into town and the Guild, three days with the Iron Hounds** at their lodging on the west side of the plaza. Each day a few chores (press **F** at the right place; the marker and the tracker show what is next), then **sleep** at their door: night, sometimes a memory, and the next morning.
  - **Day 1:** fetch a bucket of water from the plaza's new well for Ilse (he can only walk carrying it, arms shaking).
  - **Day 2:** keep up with Rowan's morning run, twice round the plaza (he waits, and calls, if you fall behind); then carry three armfuls of firewood to Juni, who supervises and teases.
  - **Day 3:** gather silverleaf with Ilse in the meadow past the north gate; then a lesson with Sorrel by the well: mana, elements, the Telling Glass, and the cold, empty air round the tear ("You feel like that, sometimes. When I look at you.").
  - The morning after: the Guild.
- **He gets stronger day by day:** 55% of his health and slower through the tear and on Day 1, 70% on Day 2, 85% on Day 3, whole by the Telling. The fog thins each morning.

### Lacuna: the hero arrives small, in rags (0.99.23)

- **A new hero for Lacuna** (Tripo, run 45966236093): a small boy, about a metre tall, in an oversized torn linen shirt, a rope belt, patched trousers and cloth-wrapped feet. Next to the Iron Hounds he is tiny, and he is meant to be. The older hero models are kept for later.
- **He starts with his fists** (Unarmed: a jab and a cross, 150 health, no skills). Rowan hands him a blade at the trial, Juni a bow; the path he chooses is the weapon he keeps. 1 and 2 only swap weapons once he has chosen.
- His clips: the library's idle, walk, jog, punches, flinch and fall, and the Berserker's and Sharpshooter's own moves and every emote, moved onto him. A smaller blade and bow (a bow can now be sized to whoever holds it).
- **The camera sits at his height** (closer, lower), and in the scenes a grown-up speaking to him is framed from low over his shoulder, looking up at them.

### Lacuna: a darker rift, a new opening, the Telling Glass, the Link asleep (0.99.22)

- **The rift is sinister now** (Lacuna's tear and the crack on the Verge): a black wound in the air with a thin pale-violet rim, lightning crawling off it, dark tendrils clawing out of its edges, scorched ground and ash rising.
- **A new opening, in three short scenes with play between.** No husk: the crack had whispered for weeks, and one night it *pulled*, and the hero walked in. He wakes with most of his memory gone: a **white fog** at the edge of sight (it thins as the story goes on) and **memories** that flash up white for a moment and are gone. Then: get up; **stumble out of the glade** yourself (walking only, he is too weak to run); the wolves and the rescue; then **go and see what Sorrel has found at the tear**, a memory, and a name: Juni calls him **Sprout** until he remembers his own.
- **A mystery in the grass** where he wakes: something glints. **F** to pick it up.
- **The Telling Glass replaces the crystal.** Both hands on a tall glass of pale sand: it answers your element (Dace's spirals up into a whirlwind: wind) and how much of it answers is your aptitude. The hero's: a few grains stir. Three, and no element. Then the grains he stirred turn black and draw themselves into a thin upright line, like the tear, and stay that way.
- **The Dimension Link is asleep** until the story wakes it (later: a Hound's death). Eternal gear lends nothing in Lacuna for now, and the beasts are a third as strong to match (a lone wolf: 140 health, bites for 14). Testing: add `?link=1` to the address to wake it.
- **Ilse's arms are back.** She (and Dace) were made in an A-pose, arms angled down, and every clip pushed them down again, into the body: only her hands showed, flat on her skirt. The animation tools now level the arms of a model made that way before measuring; all seven story characters were rebuilt. And nobody's feet sink into the ground any more (a clip that would sink them lifts the body back up).

### Lacuna: the classes rebuilt round mana, and Quest 3, Choosing a Path (0.99.21)

Both classes keep the feel of their Afterwish versions (the Warrior's Berserker and the Archer's Sharpshooter) but are rebuilt round Lacuna's mana: one has little and pays in blood, the other has plenty and pours it into one shot.

- **Berserker:** a small pool of mana (60, plus the Link) that barely refills on its own. **Battle Rhythm:** every beast a Cleave hits gives back 3 mana. **Blood Price:** short of mana, a skill takes the rest from your health (never below a tenth; the skill bar turns red when it would). **Bloodied** under half health: +25% damage, 20% faster blows, and your hits heal you (8%).
  - **Skyfall** (Q): leap where you look, crash down, stun what is under you for a second.
  - **Whirlwind** (E): *hold* to spin, cutting everything round you every 0.3 s while you keep running; 10 mana, then 6 a beat (or blood), up to 4 s. Let go to stop; the cooldown starts then.
  - **Crimson Oath** (R): a toggle. Cut yourself to 40% health with a roar that hurts everything near; the blood becomes mana. While it lasts you are always Bloodied, your hits heal a quarter of what they deal, and nothing lifts you above 49%. Press again to end it.
- **Sharpshooter:** a deep pool (120, plus the Link). **Steady breath:** standing still, mana comes back two and a half times as fast. **Long Watch:** +4% damage for every metre past the first two (up to +40%). **Steady Aim:** every third Shot is a crit for double and gives back 5 mana.
  - **Ricochet** (Q): an arrow that glances from beast to beast within 10 m: up to four.
  - **Evasive Roll** (E): roll away, untouchable, then shoot 50% faster for 3 s.
  - **Deadeye** (R): *hold* to draw. After half a second every moment held pours more mana in (up to 1.5 s more, 40 a second), each point +10% damage. Let go to loose it through up to three beasts: full, then 70% and **Marked** (+20% damage taken for 5 s), then 50% and **Pinned** (stunned 1.5 s).
- **The Iron Hounds' training ground**, outside Sunmere's east gate: a ring of straw posts and three painted targets at 8, 16 and 25 m. The posts are on the shared land: anyone can practise on them (they never fall and heal a few seconds after the last blow).
- **Quest 3, Choosing a Path:** after the crystal the Hounds go on ahead to the training ground. A short scene, then **Rowan's trial** (Cleave the posts; Skyfall into the ring; Whirlwind until the mana runs dry and spin on blood) and **Juni's trial** (the far target from the line; one Ricochet through all three; a Deadeye with 30+ mana poured in). The tracker ticks each step off. Then **choose your path**. It is where you start: 1 and 2 still change it any time.
- Quest 4, When It Counts, is next.

### Lacuna: Quest 2, The Crystal (0.99.20)

- **The Adventurers' Guild** now stands on the north side of Sunmere's plaza (a stone hall with red banners), with a paved yard and a **reading crystal** taller than a man. Walk round it; townsfolk walk round it too.
- **Quest 2, The Crystal:** after the walk into town the Iron Hounds go up to the Guild's yard and wait (the marker shows the way). Walk up to the crystal for the scene: Magistra Odile reads Dace of the Silver Sash (eighty-one: the crystal blazes), then you put your hand on it (press E) and it barely flickers. Three. Dace and Wren laugh; Juni nearly starts a fight; Rowan says they will train you themselves. And Sorrel notices the crystal has not gone out: a small amber ember still burns inside it, and stays there for you afterwards.
- **New characters** made with Tripo (run 45953668692): Magistra Odile, the Guild's crystal-reader; Dace and Wren of the Silver Sash, a high-aptitude pair who will be back as rivals. Dace's and Wren's laughing, clapping and cheering are Tripo's.
- **Quest 3, Choosing a Path** is next (the tracker says so).
- **Two more emotes:** Laugh and Clap (from Dace's clips), so the T wheel has ten, one for each number key.
- The cutscene player can walk the hero to a spot, and a scene can clear the townsfolk out of its shots.

### Lacuna: the Iron Hounds, emotes and emoticons (0.99.19)

- **The Company is remade and renamed: the Iron Hounds** (gunmetal and crimson, a hound's-head badge): Rowan (leader, sword), Ilse (healer), Juni (scout), Sorrel (mage), in a Korean-manhwa look, with calm, neutral faces instead of the old fixed smiles. Made with Tripo (Iron Hounds run 45939994405, and Sorrel remade standing straight in run 45941171305). The Marigold models are kept, unshipped, for enemies later (`assets/models/archive/`).
- **Emotes:** hold **T** for the emote wheel and let go on one (or press its number): Wave, Bow, Nod, No, Dance, Sit, Show off, Cry. Moving, attacking or casting ends it; Sit stays seated until you move. Players near you see it.
- **Emoticons:** hold **Y** for the emoticon wheel: a little face or sign pops up in a bubble over your head for three seconds (Happy, Laugh, Love, Wow, Sad, Angry, Sweat, ?, !, Music). Drawn in code, so they look the same on every computer.
- The server passes emotes and emoticons on to players within sight (at most one every 0.4 s each, known ones only), never back to the sender.
- The heroes gained the dance, sit, nod and head-shake clips (Universal Animation Library) and the wave, bow, show-off and cry clips (Tripo, from Juni).

### Lacuna: the opening, reworked (0.99.18)

- **People face each other now:** whoever speaks turns to whoever they are speaking to, the others turn their heads to the speaker, and the hero turns to them too (turning smoothly, not snapping). During the wolves the hero keeps facing them.
- **A conversation camera:** each line is framed over the listener's shoulder onto the speaker, so you see faces, not backs. Rowan walks over to Sorrel before answering him; Ilse's healing is a two-shot from the side; a faint sliver of the tear stays for Sorrel to study.
- **Nobody walks through anybody:** the Company, the hero and the wolves keep apart (and step round trees), in the scene and on the walk to town. (A walk that could never arrive now ends where it is blocked: the scene used to hang there.)
- **A natural walk and idle for the Company** (from the Universal Animation Library): Tripo's held the arms out with the palms forward. Brisk walk and jog too.

### Lacuna: the opening, the Marigold Company, and Quest 1 (0.99.17)

- **The opening cutscene** (first visit to [lacuna.html](https://afterwish.stunnedgames.net/lacuna.html); **Play the opening again** in the corner panel): the crack on the Verge opens, a husk runs into it, you follow; you wake in a glade in the Wakewood (tap Space to get up), powerless; wolves; roll away (E); the **Marigold Company** cut them down. Esc (or the button) skips: everything ends where it would have.
- **Quest 1, Waking Up:** the Company walks you along the road to Sunmere, talking on the way (Rowan's marker shows where they are). Fall behind and they wait and call you. They stay by the plaza afterwards (Quest 2, The Crystal, comes next).
- **The Marigold Company** made with Tripo (380 credits): Rowan (leader, sword), Ilse (healer), Juni (scout), Sorrel (mage). Their walking, talking, kneeling, nodding and fighting are from Tripo, the heroes' own clips and the Universal Animation Library (free).
- **A cutscene player** (`src/lacuna/cutscene.js`) for every scene to come: cards, lines of dialogue (Space or click), camera moves, actors, prompts (tap a key), blur, shake, letterbox bars.
- **The heroes jump properly now** (a push-off and a landing, from the Universal Animation Library), in Lacuna.
- The glade and the roads are kept clear of beasts. Story progress is kept in this browser for now.

### Lacuna: jump (0.99.15)

- **Space jumps** (about a metre, two thirds of a second; from the ground only). Friends see you hop. It does not dodge anything (that is the Sharpshooter's Roll). The models have no jump animation yet: they hop with a little lean.

### Lacuna: kinder controls (0.99.14)

- **Ctrl (or C) toggles walking** instead of being held (holding Ctrl set off the browser's own shortcuts).
- **Coming back from another tab or window:** any game key (or a click) takes the mouse back for looking round; the click no longer goes to waste.
- **Hold Alt to use the mouse:** hover over a skill for what it does, its mana and cooldown, or over a beast for its name, health and how hard it hits; let go and it looks around again (0.99.16: a hold, not a toggle). After chatting, the mouse comes back by itself.

### Lacuna, phase 2 begins: combat (0.99.13)

On [lacuna.html](https://afterwish.stunnedgames.net/lacuna.html), alone or together:
- **Health, mana and two classes** (the opening's two, working names). **Left click** attacks (hold it), **Q E R** are skills, **1 / 2** swap class:
  - **Berserker:** Cleave; **Leap** where you look and smash the ground; **Whirlwind**; **Bloodrage** (+40% damage, blows heal you). Hits harder the more hurt he is.
  - **Sharpshooter:** Shot; **Volley** (five arrows); **Roll** (a swipe mid-roll misses); **Deadeye** (drawn, then one shot through everything, six times as hard). **Hold right click** to look down the scope (first person).
- **Beasts fight back**, fall, and come back 45 s later (not while someone stands on their ground). Go down and you get up at Sunmere's gate.
- **The Dimension Link:** your Eternal gear (each slot once, at its best level across your classes) multiplies your health and damage: x1 with none, x3 at level 10 in every slot (what beasts are tuned for), x4.4 at 30. Together and signed in, the server reads your own account's gear; alone it reads this browser's saves. **L** tries levels 0 / 10 / 20 / 30 (alone).
- Damage numbers, health bars over hurt beasts, arrows in flight, rings for the slam and whirlwind; trees between the camera and you step aside.
- On the server every blow is the server's: your page shows your own at once and the server confirms them.

### Lacuna: walk the test land together (0.99.12)

- **The server world now runs Lacuna's land too**, at its own address (`/lacuna`, the same passcode as Haven). On [lacuna.html](https://afterwish.stunnedgames.net/lacuna.html), **Walk together** (bottom right): type your name and the passcode, and you are on one shared land with whoever else joins. The game's own server world is untouched.
- You move in your own browser (no delay); the server checks every step (nobody faster than a sprint, nobody through a tree) and puts you back if not. It runs the beasts for everyone; each player is sent only what is near them.
- Other players appear as their class's real model with their name over them; swapping class (1 to 4) shows for everyone. **Enter** to chat.
- The overlay shows ping and the real data coming in (two players: about 3 to 4 KB/s while beasts stream in, much less once they settle).
- `src/lacuna/room.js` (the server's half), tests in `test/lacuna.test.mjs` (passcode, cheating checks, chat, who sees what).

### Lacuna, engine phase 1: the test land (0.99.11)

Chapter 2's engine, built apart from the game on its own page: **[lacuna.html](https://afterwish.stunnedgames.net/lacuna.html)** (not linked from the game; nothing in it is final art).
- **A 512 m land in 64 m chunks** (`src/lacuna/land.js`): Sunmere (the first town) in the middle, the Wakewood to the west, meadows, a lake, stony ground to the north. Made from a seed, chunk by chunk, the same everywhere; collisions through a spatial hash.
- **Streaming** (`view.js`): only chunks within 150 m are drawn (one built per frame, far ones taken down) under a haze; trees, rocks and beasts are instanced, so it stays around 25 to 80 draws.
- **Sleeping beasts** (`sim.js`): 656 beasts; only the ones near a player think. One player: under 0.05 ms a step. Nine across the land: about 0.1 ms.
- **Townsfolk** (`crowd.js`): 150 people on Sunmere's streets, run in each browser only, with distance level of detail.
- **Sync** (`net.js`): each player is told only what is within 150 m and only what changed, 8 bytes a thing, 10 times a second. Measured with nine players wandering: about 2 to 3 KB/s each (goal: under 20).
- Over the shoulder (mouse look), your real hero, **1 to 4 to swap class**, **B** to add test players, **F3** for the numbers (fps is the one to check on your own machine: goal 60).

### Arrive in the middle of the keep (0.99.10)

- Logging in, or taking the Waygate to the Wishkeep, now puts you in the middle of the keep between the Hearth and the Waygate, facing the Hearth (it used to be by the road to Haven). Walking in through a beacon still puts you by that beacon.
- **The Verge is on the Waygate** once your keep is open, arriving in the middle of the Verge facing the crack.

### The Verge is shared (0.99.9)

- On the server world the Verge now works like Haven: everyone on it is in the same place, so you see whoever else is heading down to the Deep or up to Caelum. Parties stay together, a second Verge opens if one fills up (16 players), and playing alone still gets you one of your own.
- The Deep, Caelum and the rest of the maps stay one copy per party, as before.

### Beacons between Haven, the Wishkeep and the Verge (0.99.8)

- **Haven has two new beacons:** one home to your Wishkeep and one to the Verge, each at the end of its own road out of the plaza. Until your keep is open they stay shut and say why.
- **The Verge has a beacon down to Haven**, so you can go Haven to Verge to keep (and back) on foot, without the Waygate.
- On the server each beacon goes to your own keep, as the Waygate does.

### Fix: black blocks over the screen (0.99.7)

- The new exit beacons from 0.99.6 could black out large parts of the screen on some graphics cards. A rounding slip gave a few points of each beacon's light column an invalid brightness, and the glow (bloom) effect spread it across the screen. Fixed, with a test that checks every point of the new gates.

### The Verge: home at the keep, the ways up and down, and a crack in the air (0.99.6)

- **Once your Wishkeep is open, you start every session there instead of Haven** (on your own and on the server world). The keep's own Waygate, just south of the Hearth, still goes anywhere.
- **A new map off the keep, the Verge** (through the second beacon out of the keep). It's safe, and it holds two gates you walk into:
  - **The Way Down:** the old stone arch, now with a dark violet veil. Standing in it opens the Deep's list.
  - **The Way Up:** floating white steps under a gold halo. Standing in it opens Caelum's list.
  - Coming back from the Deep or Caelum takes a keep owner to the Verge, beside the gate they used. Without a keep, it's still Haven.
- **The crack:** a tear in the air at the back of the Verge. Look at it with G or right-click. For now it only hums, and it reads differently once all four Granted have fallen. It will be the way into Lacuna (Chapter 2).
- **Map exits are now beacons:** a soft column of light with rising rings and motes, which brightens while you stand in it, instead of the old swirling portal.
- Fixed: Asterfell had a second copy of its houses stacked on the first.

### The hero, younger (0.99.5)

- **All four heroes and their Eternal forms are remade younger:** teenagers now, slimmer and about a head shorter than before, with the same outfits and colours (Tripo, 8 models, 495 credits). Every animation carries over unchanged: idle, walk, run, attacks, skills, the sheathing (copied onto the new bodies with `tools/models/copy-clips.mjs`).
- The story behind it: the queen's wish kept her child as they were, so the hero wakes years later still young (see `docs/design/chapter-2.md`, *The fall of Votum*).
- The old adult heroes are kept in `assets/models/archive/` (not shipped) for future enemies.

### See where skills land, the Night from anywhere, blessings by themselves (0.99.4)

- **Skill previews:** hold a skill key to see its reach and the ground it will cover: a ring at its range, plus a circle where a leap, meteor or zone lands, the line of a shot, the path of a dash, the cone of a cleave, or the circle round you of a nova. Let go to cast it there; a quick tap casts as before. Right-click or Esc puts it down. Over the shoulder it shows where the crosshair is, with a low wall of light round the landing circle so it reads from eye height; the Seraph's skills (Descent, Hand of Heaven, Lux Aeterna, Wingbeat and the rest) and the god's miracles in a Night (in gold) show too. It can be turned off in the settings ("Show where skills land while held").
- **The next Night, from anywhere in your keep:** `[` and `]` change its level, and the top of the screen shows it ("next: Night 32 (new)"). Holding N calls that one, and the Hearth's picker is the same setting, so they always agree.
- **Wrong Night at the top, fixed:** if a raid's horns were already sounding (raids come two Nights under your best), a Night you called was quietly ignored and you fought the raid, so the top read "Night 29" when you had called 32. A Night you call now takes the raid's place while it is still only horns; once a raid is fighting, you are told to hold it first. Holding N also used the last Night you called, not the one picked at the Hearth.
- **Blessings by themselves:** each blessing at the Observatory has an **Auto** tick. Ticked ones are bought as you call each Night, if you have the Faith (and you are told if you don't). Tick only the ones you want.
- **The keep's people go indoors at night:** settlers no longer speak (their bubbles went with them) or get in the way during a Night; any bubble showing when the Night starts goes. Your heroes still shout.
- **Press G, over the shoulder too:** the "G Talk to…" / "G Read the Wishes" tip now pops up just under the crosshair in first person (it was hidden there).

### Every building its own, and solid (0.99.3)

- **Buildings:** the same cottage no longer stands everywhere. Each house is now a building of its own, from KayKit's Medieval Hexagon Pack (free, CC0; see `ASSETS.md`):
  - **Haven:** a tavern, a chapel, a windmill, two different homes, and Bram's forge beside Bram. The plaza well is a proper well with a roof and bucket.
  - **The Wishkeep's halls:** the Bastion is a small castle, the Lodge an archery range with targets, the Observatory a tall blue tower, and the Market a market. The cottages that come as the keep grows are all different: homes, a tavern, a windmill, a lumbermill, a watermill.
  - **The Mine** (and the Deep Seam and the Star Quarry) is a rocky hill with timbers and rails, its star-glass still glinting. **The Fields** are standing wheat.
  - **Asterfell's buried city:** many shapes of house, washed to sandstone (green under the water in the Drowned Court).
- **Solid:** the Mine's rock can no longer be walked through. Neither can the keep's settlers (Old Ysolde, Maren, Bastian, Liesl, Corwin, Hesper). The villagers who wander the keep step aside as you come through. Haven's townsfolk were already solid. Story characters that only some players see (Tomas on the road, Sister Odile when she first appears) stay passable on the shared server, so nobody bumps into someone they cannot see.

### Lines that sound like people, and a truer heroes list (0.99.2)

- **Spoken audio is off for now.** The synthetic voices sounded flat and robotic, and could not do age (elders, children) or real emotion. The speech bubbles stay. The audio tools stay in `tools/voice/` for when better voices are available, and the Voice volume setting is hidden until then.
- **Every NPC line rewritten** to sound like a person talking rather than a fortune cookie: contractions, trailing off, small talk and everyday detail, and clearer voices for each age. Elders say "love" and "dear" and fuss over you; the children ramble and ask three questions at once.
- **Bubbles from someone out of sight** (a hero behind you, a settler across the keep) now show low in the middle of the screen, not over the compass.
- **Your heroes (0.99.1):** between Nights, heroes wander their halls only on screen, and that wander could get stuck far from where the game had them (online it was not even told their post). The list measured one place while you saw them in another. A stuck hero now starts again where they really are, and the list and compass measure where you see each hero.

### The game's people speak (0.99)

- **Voiced NPCs.** About 150 short lines, each character with their own voice, shown in a speech bubble over them as they speak.
  - Haven's townsfolk (Elder Wren, Bram, Sister Odile, Pip, Lark, and Tomas both on the road and at home) and the keep's settlers (Old Ysolde, Maren, Bastian, Liesl, Corwin, Hesper) greet you when you talk to them.
  - They now and then say something as you walk past, and they thank you when you hand in their quest.
  - During **Call the Night**, the settlers call out from the halls: when a wave comes, a hero falls, the Hearth is hit, the night's king falls, and when the night is held or lost. The Seraph rising gets a line too.
  - The keep's heroes shout as each wave comes, cry out when badly hurt, warn of the Tidecaller, and cheer at dawn.
  - The lines were voiced with Kokoro, an open text-to-speech model that is fine for commercial use. They come to about 2 MB of small MP3 files, loaded only when spoken.
  - There is a new **Voice volume** setting, and mute (M) silences voices too.
- **Names:** Choir of Eyes is now **Choir of Veritas**, Rain of Eyes is now **Lux Aeterna**, the Eternal trial's boss is **Omnividens, the All-Seeing Truth**, and its minions are **Vigils**.
- **Controls over the shoulder:** the full list of keys no longer runs across the top of the screen. It shows in a panel at the top left for a few seconds after you enter the view (and after you take up or leave the Seraph), then folds into a small "Hold H for controls" tag. Hold H to see it again. The compass moves up into the space this frees.
- **Your heroes:** each hero's direction is now an arrow inside a small dial, pointing the way to them from where you are looking. Hovering over it says "ahead", "to your left", "to your right" or "behind you".

### The Seraph rises: a flashier kit, rarities, the Eternal trial, a compass (0.98)

- **Strike:** the Seraph's left click is now a ranged attack. It brings its hands together in prayer and releases a bolt of holy light that homes in on the foe you aim at (22 m), with a small splash.
- **Glide:** a new, graceful animation. The Seraph leans into the flight with its wings raised and spread, instead of slamming its hands down.
- **The base kit is stronger and flashier:**
  - **Dawnlance (Q)** fires a laser that bounces from the foe you aim at to four more.
  - **Wingbeat (E)** first blinks the Seraph beside the foe or hero nearest your aim (16 m), then bursts there. Halo of Mercy blinks the same way.
  - **Descent and Hand of Heaven (R)** track the foe you aim at while they gather, so they no longer miss a moving target. The fist follows its foe all the way down. Lux Aeterna (renamed from Rain of Eyes) is bigger.
  - Every skill hits harder, and its kills give half again as much experience.
- **Rarity:** at its plinth, the Seraph can be raised from Common up to Immortal. Each step opens at a level (8, 15, 22, 30, 38, 46) and costs an offering of Faith, Wishstone and Sigils. Each step multiplies its damage and toughness (up to 2.4× at Immortal) and opens a new, more offensive skill:
  - Uncommon: **Radiant Wake** (a glide that leaves a burning trail of light).
  - Rare: **Seraphic Barrage** (six homing bolts at one foe).
  - Epic: **Wrath of Wings** (blink, then three bursts).
  - Mythic: **Sunfall** (a sunbeam that hunts its foe for three seconds).
  - Ancient: **Prism Lance** (a beam through a whole line that splits into bouncing rays).
  - Immortal: **Judgement of the Choir** (thirty stunning rays).
- **The Eternal trial:** an Immortal Seraph at level 50 can face **Omnividens, the All-Seeing Truth**, alone. It is a great eye in a crown of gold blades, ringed by wheels of lesser eyes, and it fights from range:
  - Its stares land where you stand and where you are heading.
  - Its gaze burns a straight line along the ground.
  - Its lid slams down around it when you get close.
  - Its Vigils swoop in; each one you destroy restores 5% of your health.
  - Winning makes the Seraph **Eternal** (3× power) and unlocks **Ascension**: for 10 seconds the Seraph blazes with light, fires three bolts per strike, recovers its skills twice as fast, and hits 40% harder.
- **No healing mid-fight:** during a Night or the trial, the Seraph no longer regenerates or heals from resting by the Hearth.
- **Wings:** they no longer stretch when the Seraph raises its arms. They are now attached to its shoulders.
- **Skill icons:** each Seraph skill has its own icon, on the skill bar and at its plinth.
- **Over the shoulder (Seraph or Incarnate):**
  - A **compass** runs along the top, with north up as on the map. It shows your heroes (red and pulsing when hurt), the boss and the Hearth. Anyone outside its view waits at the edge on the side to turn toward.
  - **Your heroes** are listed down the left side, each with their health, distance, and an arrow pointing to them.
  - The keep's heroes now appear on the minimap, coloured green, gold or red by their health.

### The mage holds her staff her own way (0.97.2)

- **Standing:** she holds the staff upright at her right side, its foot on the ground by her foot and her left hand on her hip. It no longer sticks out from her hand.
- **Running:** she carries the staff out ahead of her, its head high and forward and its foot slanting back past her legs (0.97.3). (0.97.4) Her staff arm now keeps time with the run, swinging forward and back with each stride (about 15 cm, with the staff tipping up to 14°; doubled in 0.97.5) and bobbing with each step. I checked every frame of the run: the staff stays at least 15 cm clear of her legs, body and other arm.
- **Casting:** still swings the staff as before.

### Sheathing (0.97.1)

- Heroes now put their weapon away with a motion instead of it jumping into place. This happens when you start walking, or when an attack or skill ends while you're walking.
  - **Warrior:** brings his sword across to his left hip, turns it to line up with the scabbard, slides it in, then lets go.
  - **Rogue:** slides a dagger into each hip sheath.
  - **Archer and mage:** reach up over the shoulder and settle the bow or staff onto their back.
- After that the arm goes back to the walk. Drawing stays instant, so a blow is never held back.

### Weapons put away while walking (0.97)

- While walking (Ctrl or Caps Lock), every hero puts their weapon away. It comes straight back into their hand the moment they attack or use a skill.
  - **Warrior:** sheathes his sword in a scabbard on his left hip, with the hilt forward.
  - **Rogue:** sheathes his daggers on his belt, one on each hip.
  - **Archer:** slings her bow across her back, crossing her quiver.
  - **Mage:** slings her staff across her back, with its head over her right shoulder.
- The scabbards stay on the hip at all times. Each one is shaped to the blade in it, so the finer, Ancient, Immortal and Edric's blades get one that fits them.
- A scabbard hangs from the belt. It turns with the hips but doesn't tip when the hero leans into a run.

### Weapons clear of the body when walking (0.96.2)

- The walk's arm swing no longer sweeps weapons through the body. Arm and hand motion are unchanged; only how the weapon sits in the hand has changed.
  - **Warrior:** carries his sword forward and low, the way he holds it standing, so it no longer cuts through his legs.
  - **Rogue:** holds both daggers reversed along his forearms.
  - Both weapons still sway a little with the hand.
- I checked this against the walk frame by frame in game. Each weapon now stays as far from the body as the hand holding it does.

### A natural walk for every hero (0.96.1)

- **New walk, made for each model.** The old walk came from an animation library and was transferred onto heroes whose rest poses didn't match it, so elbows bent up and knees lifted like a march. The new walk is built directly on each hero's skeleton:
  - Feet are planted with IK: heel strike, roll onto the ball, then toe-off. A planted foot stays put on the ground.
  - The hips bob only as much as the stride needs.
  - The arms hang the way they do in that hero's own idle, then swing against the legs.
- **A man's walk and a woman's walk.**
  - Men (warrior, rogue, ninja, male keep heroes): a wider stance, more shoulder and arm swing.
  - Women (archer, mage, female keep heroes): feet close to one line, more hip turn and sway, arms closer in, a slightly quicker step.
- **Walking pace is now 1.8 m/s** (was 2.0). That gives a natural stride and step rate for a two-metre hero, and the animation is timed to it so the feet don't slide.

### Falling arrows, a 1:1 shade, Eternal drops, bulk trades (0.96)

- **Windrunner mastery** no longer fires homing shots. Every attack and skill now calls arrows of wind down onto nearby enemies (within 13 m). The damage is the same, and there is far less on screen to draw, so the lag is gone.
- **Shadowdancer's shade** now copies your skills 1:1, subclass skills included. It spins the Berserker's W itself, at your full radius (Crimson Reach growth included), and plays the animation. It dashes and leaps from where it stands, and it plays each skill's own motion.
- **Eternal drops** now stand apart from Immortal ones. They have twin crimson helix strands, a crown of blades, a second sun, a pulsing shockwave, an "An Eternal has fallen" banner and their own sound.
- **Walking** now moves at 2 m/s, the pace the walk animation was made for, so it looks natural. Online, turning quickly no longer spikes you to run speed for a moment.
- **Ctrl** toggles walking the moment you press it. **Ctrl + skill no longer ranks skills up**; use Shift or Alt + Q W E R.
- **Call the Night:** the keep's people go indoors, so you can no longer open Corwin's or Bastian's dialog by mistake mid-fight.
- **Market:** you can trade Wishstone and Faith in bulk. Type an amount, or use the 10× and 100× buttons. **All** trades everything you hold, after a confirmation.

### Walking, a truer shade, Immortal drops, fixes (0.95)

**Walking.** Every hero now has a real walk cycle (Quaternius' Universal Animation Library, CC0, retargeted onto each model). The Warrior, the Rogue and the keep's men walk sturdily; the Archer, the Mage and the keep's women walk more upright. This covers the four classes, the ninja, every Eternal form and all eight keep heroes. A walking hero now walks instead of playing a slowed run. **Ctrl (a tap) or Caps Lock** switches to walking anywhere, not only over the shoulder, at a steady pace that gear does not change. Friends see you walk too.

**The Shadowdancer's shade copies everything.** That includes every class's and every subclass's skills:
- Spins: it does a Whirlwind of its own, beat for beat, so a Berserker's main damage is copied.
- Dashes: it follows down the same line.
- Leaps: it lands where yours lands, stunning.
- Channelled fields such as Arrow Storm: it looses its own.
- Deadeye-type beams: it fires its own from where it stands.
- Frozen Orb: it throws an orb of its own, which never shatters yours.
- Barrage: it looses its own volley.
- Blinks, snares, Hold the Line and halos: it bursts where they happen.
- Toggles and buffs of your own are not copied.

**Windrunner mastery lag fixed.** Gale Steps, Gale Motes and Tailwind Daggers fire half as many homing shots, each twice as strong, so the damage is the same. Every shot of a colour now shares one material instead of making a new one each time, and their trails are lighter.

**Immortal drops look like Immortals.** A larger gem with a white-hot heart, a tall double beam (a white core in gold) that breathes, three gold rings turning, a turning sun on the ground, a halo, a warm light and rising sparks. Next to an Ancient's single orange beam it is unmistakable. Eternal drops look the same in white and crimson.

**Fixed: Berserker stuck at half health.** Blood Rage's trait stopped lifesteal just below half health while Bloodied, even with Crimson Oath turned off, so the hero could never heal past half by hitting. It now applies only while the Oath is on.

### No more "click to take hold", Caps Lock walks, the Seraph's light (0.94.1)

**Over the shoulder, the view is never lost.** The browser always lets go of the mouse on Esc. Now the view keeps following the mouse anyway, with no cursor showing. The next key or click captures it again, and a click that re-captures still strikes. The "click to take hold of the view" step is gone. Only **holding Alt** frees the mouse for the screen.

**Caps Lock** switches between walking and running, like a Ctrl tap. On a Mac, every press counts. The hint bar at the top lists both keys.

**The Seraph's shots and eyes.**
- Dawnlance flies as a spear of light: a white core in a gold sheath, a point, and a turning halo, with a gold wake.
- Choir of Eyes now looses shards of light in their own glow. The eyes stay in the crown that opens over her head and no longer fly.
- Every eye is redrawn: an amber iris with fine streaks, a deep pupil with two points of light, the lid's shadow, a white rim and a soft gold glow. Eyes open with a small spring, breathe while they hold, and blink shut.

### The Seraph's choices, easier controls, Treasure Sense (0.94)

**Fixed: stuck in the Seraph.** Online and in rooms, leaving the Wishkeep as the Seraph and coming back could leave your screen stuck in it, with Y doing nothing and your class's skills on the bar. A hero now always carries the Seraph state, so every screen clears it when you change maps. Leaving the keep by any route ends possession.

**Skills that land.**
- Dawnlance (Q) is now a lance of light that homes in on the enemy you aim at (26 m) and bursts on it. Its gather time is shorter (0.35 s).
- Descent (R) now goes where you look, never sideways to a locked-on enemy, and reaches 14 m. It pulls everything within 8 m into its landing before it strikes, so it no longer misses.
- Any skill that lands on the ground (leaps, blasts from the sky) aims where you look, not at your locked target.

**Skill choices.** Choose the Seraph's skills at its plinth, one per key. New ones open as it levels:
- **Choir of Eyes** (Q, level 10): six flying eyes, each homing in on its own enemy.
- **Hand of Heaven** (R, level 15): a fist of light comes down out of the clouds where you aim (24 m), stunning everything under it. The Seraph stays where it is.
- **Halo of Mercy** (E, level 20): a 5-second ring of light that slows and burns the Unmade and heals your heroes by 30%.
- **Shower of Feathers** (Shift, level 25): a glide that ends in six homing feathers.
- **Rain of Eyes** (R, level 30): ten rays of light fall on the enemies around where you aim.

**The Seraph's growth on screen.** While you are in it, the experience bar shows its level and XP in pale gold. Every kill pops a "+XP" number and flashes the bar.

**Over-the-shoulder controls.**
- The mouse is captured as soon as you possess the Seraph or start walking, with no click needed.
- **Hold Alt** to free the mouse for the screen; let go to look around again.
- **Tap Ctrl** to switch between walking and running. Walking is a steady pace that gear does not change.
- **Hold N** for about a second to call the Night from the Seraph (or while walking), at the level last chosen at the Hearth. Because you have to hold it, a stray press does nothing.
- Every key is listed in the two-line hint bar at the top, showing only the ones that apply right now.

**Treasure Sense (Rogue).** A Rogue makes gear drop 35% more often, for themselves and for everyone in their party on the same map. Several Rogues do not stack. The party is told when it is active.

### A celestial Seraph, louder skills, stronger masteries (0.93)

**The Seraph floats.** She hovers above the ground and glides instead of running, leaning into the movement with a little light trailing behind. Her stone glows faintly gold from within.

**Celestial skills with wind-ups.** Dawnlance, Wingbeat and Descent now gather light first. She is rooted while she gathers, then the skill lands much harder.
- **Dawnlance** (0.45 s, 3.4× her strike, was 2.0×): a crown of eyes opens over her head, then a beam of dawn fires down the line with eyes blinking open along it.
- **Wingbeat** (0.3 s, 2.4×, was 1.4×): clouds are drawn in around her, then thrown out in a ring with feathers. It still heals heroes in reach by 15%.
- **Descent** (0.9 s, 6.5×, was 3.5×, wider, longer stun): a cloud gathers over the target and its eyes open on what is beneath. She rises and lands as a pillar of light with a ring of cloud.
- **Glide** leaves a trail of cloud and hits harder (1.2×, was 0.8×).
- **Basic strike:** slower but 1.6× as hard, with a wider sweep (others caught take 70%, not 50%). Each hit draws a crescent of light and an eye at the target.

**Sounds.** Every kind of skill now has its own synthesised sound instead of four shared ones (blade sweeps, bursts, rushes of air, piercing shots, fire, frost, falling stars, volleys). Ultimates (R) add a deep boom and reverb. Deadeye, the Sharpshooter's ultimate, is much heavier: a supersonic crack, a falling sub-bass, torn air and a long echo. The Seraph has her own bells and choir, and Skyfall-style landings boom harder. A shade's copy of a skill plays quieter, with no ultimate boom.

**Mastery skills.** Measured as single-target damage added by one borrowed skill, at level 100.
- **The Shadowdancer's shade** copies everything you do: every basic attack and every skill. A skill that would move you (a dash, leap, blink or spin) hits where you aimed instead.
  - Mirror Blade (Warrior): 50%. Echo Caster (Mage): 70%. Umbra Gemina (Archer): 60%, and still draws Deadeye.
- **The Windrunner's wind** answers every attack and every skill with homing shots:
  - Gale Steps (Warrior): +25% attack speed and the Whirlwind tornado as before, plus one wind blade per swing (80%) and five per skill (130% each). Was +4% damage, now +24%.
  - Gale Motes (Mage): two motes per attack (90%) and six per skill (180% each). Was +4%, now +25%.
  - Tailwind Daggers (Rogue): a dagger per attack, three more every second attack, six per skill. Was +5%, now +35%.
- **Weak borrowings raised:**
  - Archer's Shadow Shot, Mirror Ice, Anchor Shot and Dragon's Breath. These were −7% to +6% for the Archer; now +12% to +23%.
  - Mage's Elemental Lance and Blink Strike.
  - Warrior's Javelin and Ember Brand. Ember Brand now sets 4 burn stacks that burn harder, and Whirlwind deals double damage to burning enemies.

### Deep Nights and the Seraph (0.92)

**Call the Night now goes to Night 50.** Past Night 30, each level is 8.5% stronger instead of 28%, but the deep Nights bring more than bigger numbers:
- **Two omens a Night.** Two new omens appear only as the second one: Eclipse (heroes' skills recharge a third slower) and Siegefire (buildings take 50% more).
- **A sixth wave** from Night 40, and two Tidecallers on Night 50.
- **Three new foes:**
  - **Oathbreaker** (from 31) duels your strongest hero and takes half damage from everyone else.
  - **Gloamwing** (from 34, in pairs) dives past the front line onto archers and mages; its first hit on each lands 2.5 times as hard.
  - **Rotmother** (from 38) halves healing on heroes near her and splits into three Rotlings when she falls.
  - All three reuse existing models, recoloured, so they cost no Tripo credits.
- **Rewards.** Every three Nights held past 30 raises the Lodge's training cap by one level (up to 22), and every four raises the Bastion's arming cap by one point (up to 20). An Immortal piece won past Night 30 is **Starforged**: its main stat is a fifth stronger and it has a fourth bonus line. From Night 37, no piece is below Ancient, and the Immortal chance climbs to 30% by Night 50. A fifth gear piece drops from Night 40.
- **Balance check.** Fully trained, fully armed heroes with Starforged gear hold every Night through 47 alone and lose Night 50. With a matching Seraph fighting beside them, they win Night 50.

**Possess: the Seraph.** Once Night 10 is held, the keep's worshippers can raise an angel of stone on a new plinth beside the Hearth. It costs 1,200 Faith, 120 Wishstone and 10 Sigils.
- **One per account.** It is saved with the Wishkeep, so every class shares it.
- **Taking it up.** Press **Y** anywhere in your own keep, at any time, including during raids and Call the Night. It costs no Faith and has no time limit. Press Y again to leave it.
- **Controls.** You fight in the over-the-shoulder combat system with its own kit: **Dawnlance** (Q, a piercing line), **Wingbeat** (E, a knockback burst that also heals your heroes by 15%), **Glide** (Shift, an untouchable dash) and **Descent** (R, a stunning leap, from level 5). Free strikes, Tab targeting and the dodge roll work as they do for Incarnate.
- **Strength.** None of the hero's gear, talents, class power or level affects it. Its level is the Night it is a match for: a level-30 Seraph hits and takes hits like a fighter of Night 30.
- **Growth.** It starts four levels below your best Night and can never pass it. It gains XP from what it kills, from Nights and raids it fights in and holds, and from Faith laid at its feet (each offering is a quarter of a level). Fighting on Nights far below its level earns little.
- **Falling.** If it is felled, it turns back to stone for 60 seconds and you return to being the keep's god.
- **Model.** It is a new Tripo model (105 credits; about 590 remain).

### Quick ranks (0.91.1)

Ranking a skill no longer takes one press per rank. Hold Ctrl, Alt or Shift with Q, W, E or R and the skill keeps ranking: one rank at first, then faster the longer it's held. A skill reaches its cap in about two seconds. The + on the skill bar and the town's Rank up buttons work the same way when held, and Shift-click spends every point the skill can take. The sim takes a count with each `rankUp` command, so a held key sends a few batched commands rather than a hundred single ones. The rank-up sound and floating text appear once per batch, with the count shown.

### A living keep, and walking it (0.91)

- **The villagers have their days**, with animations of their own (Quaternius' Universal Animation Library, CC0, moved onto their rigs):
  - Farmers harvest, sow and water in the fields, then carry the harvest to the plaza.
  - The miner swings at the rock and kneels to fix things.
  - The old folk sit on the new benches round the plaza and talk, or stand with their arms folded.
  - The children play tag, dance, and crouch to look at things in the grass.
- **Everyone walks real paths** round the halls, houses and works instead of through them.
- **The keep's heroes, between nights**, stroll about their halls and now and then practise a few swings.
- **The settlers** (Ysolde, Maren, Bastian, Liesl, Corwin, Hesper) have proper bodies too, each tinted for their trade.
- **Walk the keep (V)**: between nights, walk your keep (or a friend's) over your shoulder with the Incarnate controls: W A S D, mouse look, free strikes, Shift to dash, double-tap to roll. V (or the button) takes you back above; a night or a raid does too.
- Over your shoulder, the camera now comes in front of a wall or a pillar instead of sitting inside it.

### Incarnate: freer strikes, longer stays, and the dash on Shift (0.90)

- **Left click strikes even with nothing locked**: a blade cuts whatever is in its arc where you aim (the nearest in full, the rest by half); a bow's or a staff's shot flies straight where you aim. All at the pace of your attacks.
- While Incarnate your hero only strikes when you say so: no more turning on an enemy by itself, and letting go of the button stops the strikes.
- **Incarnate lasts 20 seconds** (up from 12).
- **New keys over the shoulder**: <kbd>Q</kbd> and <kbd>R</kbd> as ever, your W skill on <kbd>E</kbd>, your class's dash (its E: Breakthrough, Evasive Roll, Nightstep, Starwake, Ambush) on <kbd>Shift</kbd>, the way you are moving (or looking). The skill bar shows them while you are Incarnate.
- **The roll moved to a double-tap**: tap a direction twice quickly to roll that way (blows pass through you for a moment; every 2.5 seconds).

### Incarnate fights like an action game (0.89)

- **Soft lock**: over your shoulder, the enemy before you nearest your crosshair is locked on its own (the crosshair turns gold, the enemy is highlighted, and its name and health show at the top).
- **Hold the left button to strike it.** Let go to stop. While you hold the strike on a foe you stand and fight; with nothing locked you keep moving. When one falls, the next is locked for you.
- **Skills fly at the locked enemy**, or where you look if nothing is locked.
- **Right-click no longer walks** while Incarnate; it reminds you to move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>.
- Standing still, your hero turns to face where you look. A **Look sensitivity** slider is in the settings, and big mouse jumps are smoothed out.
- (0.89.1) **Tab picks the next enemy** before you, nearest first, each once before going round again (the bag is still on I and C). It stays your target until it falls or you leave it far behind; clicking straight on an enemy picks it too.
- (0.89.1) **Shift rolls**: 4.5 m the way you are moving (backward if you are standing still), and blows pass through you for 0.4 seconds. Once every 2.5 seconds; the key hint shows the cooldown.

### A growing village (0.88)

- **More works as the keep grows**: each growth stage opens another site out past the halls, each built and raised on its own: The East Fields (A Few Roofs), The Deep Seam (A Hamlet), The Orchard (A Village), The Star Quarry (A Market Town), The Pilgrim Farms (The Wishkeep Entire). Later sites cost more. The keep's growth card lists them all, and each works panel says what opens next.
- **The keep's villagers have models of their own** (six, made with Tripo): a farmer, a farm woman, an old man, an old woman, a miner and a child. Each is drawn a little taller or shorter, with their clothes tinted a little differently, so a crowd doesn't look cloned.

### The god's miracles, remade (0.87)

The miracles now lead your heroes rather than fight for them. Hover a card for what it does.

- **Q · Judgement** (20 Faith, 7 s): a blow of light where you aim (8% of each one's health), then the Unmade there are Judged for 8 seconds. Your heroes deal 40% more to them and go for them first, and no Veil hides them.
- **W · Benediction** (25 Faith, 12 s): your heroes where you aim heal 40%, the fallen there rise, and all are Blessed for 6 seconds (30% faster to strike and to move).
- **E · Hallowed Ground** (30 Faith, 15 s): a 6 m circle for 8 seconds. The Unmade in it are slowed by 40% and their blows on buildings do 70% less. Your heroes in it heal 3% a second, and those with nothing to fight gather there.

### Raids (0.86)

- **Surprise raids in your keep**: every 6–10 minutes between nights, horns sound and a raid comes 8 seconds later. It's one wave of the Unmade, two Night levels below your best, with the night's stranger children but never the Tidecaller. Your heroes meet it; miracles and Incarnate work as in a night.
- **Raids while you're away**: every 3 hours away (3 at most), your heroes meet a raid alone. It's really fought out, with your heroes and halls as they are, when you next come to the keep, and you get a report: held or lost, Faith and Wishstone won, Hero gear, halls wrecked.
- A raid held pays about a third of a night and sometimes a piece of Hero gear; no stars and no new Night. A raid that breaks through leaves its damage until you mend it.
- Raids start only once you have held your first night, and **Raids on/off** at the Hearth turns them off (in the keep and away).

### Incarnate: a rescue, over your shoulder (0.85)

- **R in a Tide now begins a channel** where you aim. For up to 5 seconds you gather aura: you rise in a swirl of light while a pillar grows where you will land. R again lands early, with less aura.
- **The landing saves your heroes**: within 7 m it mends them, shields them and raises the fallen, then staggers the Unmade and throws them back. All of it is stronger the more aura you gathered.
- **Then 12 seconds on the field, seen from over your shoulder**:
  - <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk; the mouse turns the view (click to take hold of it).
  - Click strikes what is under the crosshair. Your skills stay by your left hand: <kbd>Q</kbd>, <kbd>E</kbd> and <kbd>R</kbd> as ever, the W skill on <kbd>F</kbd> (0.85.1); the borrowed ones on <kbd>Z</kbd> and <kbd>X</kbd>; <kbd>1</kbd> a potion and <kbd>Space</kbd> a parry as ever. The skill bar shows the keys while you are incarnate.
  - Skills land where you look. The view swoops back above when it ends.
- **A rescue, not a sweep**: 40 Faith, once a minute. While incarnate your blows count as a mortal's, the same share of the night whatever your gear, just as your health already did. The Unmade can still be cut down; the god can't sweep a wave alone.
- In the night the keep's people shelter indoors.

### Harder nights that pay more (0.84)

- **New enemies of the Tide**, each with its own Tripo model and its own way of fighting:
  - **Ember Thief** (Night 3): ignores your heroes, takes Faith from a building and runs for the dark. Catch it and the Faith comes back with interest.
  - **Cinderlings** (Night 4): come in packs and burst when they die, burning heroes nearby.
  - **Veilbearer** (Night 6): the Unmade near it take half damage.
  - **Gatebreaker** (Night 8): a siege giant that walks straight for the halls, can't be Challenged, and shrugs off half a stun.
  - **Mourner** (Night 11): hangs back and raises the Unmade who fell near her.
  - **The Tidecaller** (Nights 5, 10, 15…): a boss on the last wave. It slams (with a warning ring), calls the Hush and rages at half health. Felling it pays its own Epic-or-better piece of Hero gear.
- Your heroes go for the dangerous ones first: a thief with Faith, Veilbearers, Mourners.
- **Omens** from Night 6, the same for each Night level every time, so you can plan your heroes' skills: Blood Moon, Fog, Hunger, Starfall, Legion, Iron Hide. Each makes the night harder and pays 20–30% more.
- **More waves**: four from Night 10, five from Night 20. The Unmade grow a little faster per Night.
- **Stars**: hold the keep, no hall wrecked, no hero falls. Each star won for the first time on a Night pays Sigils, and all three in one night add a piece of Hero gear. The Night picker shows your stars, the omen and which foes come.
- Rewards climb faster with each Night (40% per level, up from 30%).
- The Tide's foes now swing when they strike.

### The keep's heroes, remade (0.83)

- **Four skills to a hero**: two physical (the Lodge) and two magic (the Observatory); the second of each opens at level 6. Old saves keep their one skill.
- **Sixteen skills.** Physical: Cleave, Shield Bash (stuns), Piercing Shot (a line), Volley, War Cry (the heroes around hit harder and faster), Challenge (enemies turn on this hero), Lunge, Whirlwind. Magic: Fireball, Frost Nova (slows), Mend, Chain Lightning, Barrier (a shield on the hero in most danger), Meteor, Ward, Radiance (heals everyone near and raises one who fell).
- **Healers**: a hero who knows Mend, Barrier or Radiance fights as one. They go to whoever is hurt worst and their strikes mend; when every hero is whole they mend hurt halls.
- **Each class has its job.** Warriors hold the line: the Unmade would rather fight them, they take a fifth less damage, and their swings carry into whatever stands beside. Rogues duel: they slip a quarter of blows, crit for 2.5 times, and drink a little of what they deal. Archers and mages are a little sturdier.
- **Their own models**: a man and a woman of each class in the keep's crimson, white and gold (Tripo), animated with their class's moves. A hero's model follows their name. Skills play their class's moves too.

### Incarnate at full strength; smooth heroes online (0.82.6)

- **Incarnate** no longer caps your blows: a Sharpshooter's Deadeye lands in full on a Tide foe. Visitors still can't touch the night.
- **The keep's heroes glide** between server updates like every other player and foe. They used to stand still, then jump, with their name plates running a step ahead. Name plates now sit over the model as it is drawn, for party members too.

### Breaking down Hero gear; guests cast nothing (0.82.5)

- **Break down Hero gear like your own gear.** In the Armory:
  - **Break down everything that is no hero's upgrade.** Never a worn or locked piece, or one better than what a hero wears in that slot (or for a slot left empty).
  - **"Never break down" chips** for the rarities to keep, Immortal by default.
  - **Shift-click** a piece to break it down.
  - A green ▲ marks a piece that would be an upgrade for one of your heroes.
- **Auto-break down new Hero gear:** Off, or Common up to Ancient and below. A held night's pieces at or below it go straight to Wishstone unless one is a hero's upgrade; the night's report says how many. Choosing it also clears the Armory of such pieces once (with a check first). Saved with the keep.
- **A visitor casts nothing in a friend's keep:** no walls, freezes, pulls or burns in the keeper's night, and no attacks on it. Their skill bar greys out while they're there.

### The keep's clock; a friend's night is theirs (0.82.4)

- **Fixed: "While you were away" paid a full day on every visit.** The keep's save capped its numbers at 10¹², and today's clock (in milliseconds) is past that, so every save rewound the last visit to 2001. The time is kept as it is now, so only the real time away counts (still banked up to 24 hours).
- **A visiting friend's blows don't land on the keeper's night.** They can watch the keeper's heroes hold it. The keeper's own Incarnate fights as before (its blows land, at most a fifth of an Unmade's health each).
- (0.82.3 briefly took Incarnate's blows away too, and made it a buff to nearby heroes instead. That's undone: Incarnate is as it was.)

### Visiting a friend's keep (0.82.2)

- **Go to them** (the players list, O) now works for a party member who is in their Wishkeep. It takes you into their keep, laid out as theirs has grown, with their heroes, buildings and settlers.
- **It stays theirs.** You can't tend it, raise it, answer its wishes or call its night; speaking to the Hearth, a hall or a settler says so. You can't spend your own keep there either.
- **If they call the night while you're there,** you fight beside their heroes with your own skills. Your blows land as a mortal's, at most a fifth of an Unmade's health a blow, as the incarnate god's do. The miracle bar stays the keeper's.
- When the keeper leaves, visitors walk back to Haven.

### The keep's works, tiers and growth; heroes who find their way (0.82.1)

- **More Faith and Wishstone.**
  - **The Mine** (Wishstone) and **the Fields** (Faith) stand out past the halls. Build them and raise them to level 5 with Faith. They're worked between nights by your heroes (each a hand, a quarter more for each step of rarity) and your settlers (half a hand each). They pay while you're in the keep, a minute at a time, and while you're away, banked up to 24 hours (was 16).
  - **The road's tithe:** a little Faith for every kill anywhere (a quarter each), and 12 Faith and 2 Wishstone for every boss.
  - **Wishes pay half as much again.**
- **Cheaper mending.** A Wishstone mends 120 health (was 40), and after every night held the keep's people mend a quarter of every building free.
- **Building tiers.** Once a hall is at its last level (the Hearth: once the keep is at tier III), it can be raised Common to Immortal with Faith and Wishstone. Each tier makes it far sturdier (×20 health at Immortal) and its work stronger:
  - the Bastion: more arms
  - the Lodge: heroes trained further, up to level 16
  - the Observatory: stronger blessings
  - the Market: more Faith
  - the Hearth: every hero deals more, every wish gives more Faith
  
  A hall's tier shows in the cap of its banner and a ring at its foot, in the tier's colour.
- **The keep grows** with what you spend on it (Faith, and Wishstone counted ten times), through six stages from "A Fire in the Dark" to "The Wishkeep Entire". Each stage is a wider ground (32 m to 47 m across the radius), more trees, a pair of cottages, and more people walking about. The Hearth shows how far it has come.
- **Heroes who find their way.** The keep has a walking grid. Heroes and the Unmade alike take paths round the halls, cottages, trees and rocks instead of pressing into them, and walk straight when the way is clear. Heroes also count a detour as further than it looks, and finish off one of the Unmade that is nearly down. In test nights, Nights 12 and 18 were held with every building whole; before, halls fell.

### Heroes worth the name (0.82)

The keep's heroes can now hold the night on their own.

- **Hero rarity.** Every hero has a rarity, Common to Immortal, in gear's colours: on their name, their plate and (from Epic) a ring at their feet. Ascend a hero one step at a time at the Hearth, with Faith and **Ascension Sigils**.
  - Each step multiplies health and damage: ×9 at Immortal against Common.
  - From Epic, their skill comes round sooner. An Immortal hero's skill comes twice as often, and every hero deals 10% more while they stand (up to three Immortals).
- **Night levels.** Call the night at a level from 1 to one past the highest you've held (up to 30). Each level makes the Unmade 27% stronger, with more of them from Night 5. A held night pays more Faith and Wishstone, Sigils, and Hero gear.
- **Hero gear and the Armory.** Gear for the keep's heroes only, in a new ⚔ Heroes tab of the gear window (also opened from the Hearth and the Bastion), kept apart from your own bag. Up to 80 pieces.
  - Three slots a hero: Weapon (damage), Armour (health) and Charm (either).
  - Bonus lines by rarity: critical chance, attack speed, less damage taken, lifesteal, skill cooldown, and more damage to wreckers and to the Unmade at a building.
  - Immortal pieces add an effect: Hearthflame (every fourth strike bursts), Unbroken (once a night a fatal blow leaves them at 30%) or Warden's Oath (they run to defend buildings and hit what's attacking them 40% harder).
  - Each held night gives 1 to 4 pieces, rarer the deeper it is (Immortal from Night 10). The Night it was won on makes a piece stronger.
  - "Equip the best on everyone", lock, and break down for Wishstone.
- **Smarter heroes.** Each of the Unmade is weighed by how much it threatens the keep: one at a building (worse at the Hearth or at one already hurt) and the wreckers (Ashwalkers, Rootbound) come first. Heroes spread over the threats instead of all chasing the nearest. They stand guard between the Hearth and the halls, not in a huddle at the middle, and archers and mages don't chase far, except to save the Hearth.
- Buildings feel deep nights less than heroes do (about the 0.6 power of the night's strength). Building tiers in 0.82.1 will make them sturdier still.

### The Echo Ring, all the way down (0.81.7)

- **Start from:** past wave 55, the starting waves ran off the side of the window and couldn't be picked. They now wrap into rows (scrolling if there are very many), so every checkpoint you've reached is in reach.
- **What the Stones Remember:** its table only listed waves 1 to 50, so a run starting deeper showed nothing. The rows now follow where you start: that wave, then the boss waves after it (every 5 for the first 20, then every 10), with each wave's worth and the run's total.

### The auto-roller (0.81.6)

- **Auto-roll**, in every equipped piece's Reroll panel. It opens once any class on the account has beaten the Quiet, like the world tiers do.
  - Choose how good each line should be: Epic, Mythic or Ancient or better, Immortal, or Eternal on Eternal gear. Use "Set every line…" to set them all at once.
  - Set how many rerolls one press may spend (up to 500). Once reborn, you can pay with Echo Essence instead of gold and scrap.
  - One press rerolls the lines that fall short until each is there, the limit is reached, or you can't pay for another. It never touches a line that's already good enough.
  - It costs the same as rerolling by hand, and the 30-reroll pity still counts.
  - The result arrives as one report (rerolls, what was paid, which lines rose and to what), not a message per reroll.
- Your choices for each slot are remembered in this browser.

### Fewer arrows, the same rain (0.81.5)

- A Windrunner's Crosswind arrows, and Hurricane's arrows when there's no one else to curve at, are now folded into the arrow she looses. They land with it at full damage: each kind is its own hit with its own crit roll, and carries the Tailwind of every arrow in it. Hurricane still curves up to two arrows at other enemies nearby.
- So the feel stays, the arrows that landed rain down from the sky onto the target: thin golden streaks from one instanced mesh, which costs one draw call however many there are.
- Every shot now shares one shape instead of building a new one, and arrows leave fewer sparks.
- Arrows in the air per second, for the same damage:

  | Gear | Before | Now |
  |---|---|---|
  | Immortal gear | 176 a second (about 46 at once) | 26 a second (about 5 at once) |
  | Eternal gear with Umbra Gemina | 58 a second | 19 a second |

### The Windrunner's wind (0.81.4)

- **Gale Force** (new, part of the Windrunner's perk). Every arrow she looses deals 6% more for each attack a second, counted up to 20 a second (+120%). Crosswind already looses more arrows the faster she shoots, so attack speed now counts twice: more arrows, and harder ones.
- **No more double hop.** With Umbra Gemina slotted, the shadow's copy of Skirmish Step no longer hops you a second time. It adds two more of the next shots at once instead, and makes every one of them hit harder.
- **The Windrunner's shadow keeps up.** Umbra Gemina's arrow now carries everything her bow looses: Hurricane's extra arrows and Crosswind's (on average, at her attack speed) are folded into its damage as one heavier arrow, never extra arrows in the air. It also carries a Skirmish Step shot's strength.
- **Auto-scrap after a rebirth.** The setting always came through a rebirth, but on a new life every slot is bare, so every drop counted as "an upgrade" and was kept. Now a piece is kept only if it beats both what you wear and anything already in your bag for that slot (one per slot). Choosing a rarity clears the bag the same way.
- Boss damage in full level-30 Eternal gear, before and after this patch:

  | | Windrunner | Sharpshooter |
  |---|---|---|
  | Before | about 36 billion a second | about 47 to 62 billion |
  | Now | about 53 billion | about 47 to 62 billion (unchanged) |
  | Both with Umbra Gemina | about 87 billion | about 95 to 127 billion |

### Umbra Gemina, Ember Clones and Rime Halo (0.81.3)

- **Umbra Gemina** (Latin for "the twin shadow"; the Archer's Shadowdancer borrowing, formerly Shade Partner). A see-through twin of your hero walks at your shoulder for as long as the skill is slotted. It wears whatever model you wear, Eternal forms included. Its copies of your basic attacks and Q now come from where it stands. A Sharpshooter's twin also looses its own Deadeye a moment after yours, from its position, for 60%. The Mage's Echo Caster and the Warrior's Mirror Blade shades walk with you too, and cast from where they stand.
- **Ember Clones** (the Rogue's Pyromancer borrowing, formerly Fire Bomb). Three fire copies of you fly out at the nearest enemies. Each strikes four times, leaping to a new enemy after every blow and setting 2 burns each time, and its last blow bursts. It hits about half as hard again as Fire Bomb on a single target.
- **Rime Halo** (the Rogue's Frostbinder borrowing, formerly Glass Ward). A 4.5 m ring of rime surrounds you and each of your Shadows for 6 seconds. You walk through it freely, but enemy shots that cross it fly back, faster, as yours. It bursts when it forms (2 Hoarfrost) and cuts everything inside twice a second (1 Hoarfrost each time).
- Both Rogue borrowings keep their passives while slotted: your blows set burns and give Hoarfrost.

### Wishes say where to go (0.81.2)

- Every wish that sends you somewhere names the place. Boss wishes say where the boss lives, for example "The Drowned Court · Depth VII" for the Undertow. Pilgrimages in the Deep give their Depth too.
- On the board, a "Where:" line adds the Depth and that it's reached by the Waygate.
- In the tracker, the settler's name now reads "for Bastian", so it can't be mistaken for a place such as the Bastion.

### Incarnate, and the keep's own people (0.81.1)

- **Incarnate.** In a Tide, press **R** (30 Faith) to step down and fight beside your heroes for 20 seconds with your own skills. You fight as a mortal: one blow takes at most a fifth of an Unmade's health, and the Tide can strike you back. Falling only ends the incarnation, and you are a god again with miracles on Q, W and E. It can be used again 45 seconds after it starts. The miracle bar shows it, and the hero's skill bar dims while you are a god.
- **The keep's own heroes and folk.** Heroes are no longer copies of player heroes:
  - Shieldbearer: kettle helm, round crimson shield and spear.
  - Warden: hood, quiver and a longbow they draw.
  - Lanternkeeper: robe, cowl and a crooked staff with a lantern of the Hearth's fire.
  - Nightwatch: masked and hooded, with a hooked knife in each hand.
  
  All of them wear the keep's crimson and bone, and they walk, strike and fall. Farmers, a baker, elders, children (some with wooden swords), a smith, a washerwoman, a pilgrim and a lamplighter walk the plaza and step around things.
- **Clearer mending.** When anything is hurt, the Hearth's panel opens with a card saying what is hurt, what it costs, and where Wishstone comes from. Mending now uses whatever Wishstone you have, the Hearth first. A dark Hearth shows at the top of the tracker until it is lit again, and the messages say where to go.
- **Fixed:** the server world tag no longer covers the quest tracker. The tracker now sits just under it, however many lines the tag takes.

### The Wishkeep's heroes hold the night (0.81)

The keep is now something to defend, and the Tide is a fight you watch and steer rather than one you stand in.

- **Heroes.** Raise up to 3, 5 or 8 heroes (by keep tier) at the Hearth, each of a class whose hall is open: warriors, archers, mages and rogues, each with a name. They stand around the Hearth and fight every Tide where you can see it, with their own swings, arrows, bolts and skills.
- **The halls work.** The **Bastion** arms heroes (gear, +15% each) and makes every building 25% sturdier per level. The **Lodge** trains them (+12% health and damage a level, two more levels per Lodge level) and teaches physical skills: Cleave, Volley, Lunge. The **Observatory** teaches magic (Fireball, Mend, Ward) and sells blessings for the next night: Fury, Stoneskin, Swiftness. The **Market** makes Faith while you are away (4 an hour, 15 more per Market level, banked up to 16 hours, counted on the server's clock) and trades Wishstone and Faith.
- **Buildings take damage.** The Tide's five kinds of Unmade (Hush, Echo, Unnamed, Ashwalker, Rootbound; the last two are wreckers) go for the heroes in reach, else the nearest building. A wrecked hall stops working until it is mended; if the Hearth goes dark, the night is lost. Damage stays after the night and is mended at the Hearth with Wishstone (one mends 40). Nothing is lost for good.
- **A god, not a soldier.** In a Tide your hero cannot strike. Q, W and E become miracles, paid in Faith: **Smite** (20) strikes a crowd, **Mend** (25) heals and raises fallen heroes, **Ward** (20) shields a building for 6 seconds. A bar over your skills shows their costs and cooldowns.
- **People walk about.** The keep's folk wander the plaza (more as the keep grows), and heroes and hurt buildings carry health plates.
- A held night pays Faith, Wishstone and the Tide wish. Its foes drop no loot, so the night can't be farmed for gear.
- **Fixed:** the wishes board (or anyone behind something) now opens in one click.

### The tracker follows the board and the keep (0.80.1)

- **The quest tracker** (under the minimap) now has three groups: your **Quests**, the **Bounty Board**'s
  jobs (progress, and "done: claim it in Haven"), and the **Wishkeep**'s wishes (pilgrimage counts, what an
  offering still needs, where a Tide or a story waits, and which are answered). It keeps up as you play.
- **Click a group's heading to fold it** (it then shows how many are in it, and how many are done); the
  choice is kept in this browser. The tracker never runs down over the buttons below it.
- The prompt over the Wishkeep's things names them: Read the Wishes, Tend the Hearth, Visit the Bastion.
- The board never asks for the same offering twice at once.

### The Wishkeep (0.80)

A new kind of play for heroes who have reached the end of their growth: a sanctuary for the people the
Unmade took from, one for the whole account. Nothing in it makes a hero stronger; it grows, and gives back
story, looks and ease. (Design: the "Afterwish: the next mode" doc.)

- **Opening it:** once any class on the account has beaten the Quiet, the Waygate shows **the Wishkeep**.
  It is always a copy of your own (on the server too, even in a party), with a Waygate of its own home.
- **Built on what you did:** the Altar shows your record across every class. Each class mastered opens its
  hall (the Bastion, the Lodge, the Observatory, the Market), each Eternal slot filled lights a relic (+5%
  Faith), each Granted beaten sends an echo to guard the fires in a Tide, and Wishborne levels and rebirths
  set the Faith the faithful bring on the first day.
- **The Wishes board:** 3 to 5 wishes at a time, each from a named settler: pilgrimages (defeat enemies on
  a map you know), a boss brought down, offerings (scrap, Wishdust, gold, wish fragments), a Tide, and the
  story. Answered wishes bring **Faith** and **Wishstone**, and bring that settler closer (their level
  raises Faith a little). A wish can be swapped for 10 Faith.
- **The story, told by the keep:** Old Ysolde tells how the one they keep came to be, six chapters that
  open with your record (the road, the star, the Quiet, more than one life, the Granted, the five things
  that do not end). Hear them again from her.
- **The Hearth:** raise the keep to tier II (A Village) and III (the Wishkeep): a bigger board, six
  settlers in all (Ysolde, Maren, Bastian, Liesl, Corwin, Hesper), and at III a weapon glow, **Kept**. Raise
  each opened hall (three levels): more warmth in Tides, shorter pilgrimages, more Faith, cheaper offerings.
- **Tides:** call the night at the Hearth. Three waves of the Unmade come from four ways in, each going for
  the keep's fire nearest it; every bite takes warmth. Damage is not the test, being where they are is.
  Hold until morning for Faith and Wishstone; if the fires go out, nobody is lost and you can try again.
- The keep is the account's, like gold: kept in this browser, and on the server for online characters.
- Fixed on the server: a browser character's record of its other classes (Mastery, Animus) was lost when
  it moved from one map copy to another.

### The Eternal forms (0.76)

- **Wear all five Eternal pieces and your hero ascends:** a new model for each class, the same hero in
  white-and-crimson armour with gold filigree, glowing red runes, a crimson gem and a white-gold circlet.
  It bursts in white and crimson the moment you take it, and friends and everyone on the server see it.
- **Every move is kept:** the Warrior's swings, spin and leaps, the Archer's shots, the Mage's spells and
  the Rogue's blades are the same animations, moved onto the new skeletons
  (`tools/models/copy-clips.mjs`). The Shadowdancer and Assassin take the Eternal form too.
- **"Eternal form"** in the Eternal tab shows or hides it, kept in your save.
- Made with Tripo: 320 credits for the four models, and 65 more to re-rig the Warrior on his old
  skeleton so his moves fit.

### Two fixes: Wishborne points after All in, and auto-scrap turning itself off (0.75.5)

- **Wishborne:** online, the panel now shows your points as soon as they are spent (after All in it
  still said you had points left until you closed and opened it).
- **Auto-scrap new gear no longer resets:** the timer for the "left on the ground, scrapped" message
  had the same name as the setting and overwrote it a few seconds into play, the next time old loot was
  scrapped; the next map change or save then dropped it. If yours shows Off, choose it once more.

### All in on a Wishborne stat, and Esc closes pop-ups (0.75.4)

- **All in** beside each Wishborne stat puts every Wish point into it, after a check in the middle of
  the screen showing the points and the bonus before and after. Its button waits a moment before it
  can be pressed, so a double-click cannot go straight through.
- **Esc closes the pop-up on top first:** that check, someone's gear (Inspect), the players list (O),
  and augment priority. With none open it pauses, as before.
- **The players list is easier to find:** the first time you play on a server world you are told about
  O (until you have opened it once), and O and Esc are in the controls list.

### Auto-scrap, Eternal-tier rolls, and notices you can see on the gear screen (0.75.3)

- **Auto-scrap new gear** (under the bag): choose a rarity, from Common only up to Ancient and below, and
  new pieces of it are broken down for scrap and Wishdust as they come (picked up, from caches, the
  Ring), with one line adding them up. Never an upgrade for you, a set piece, a locked piece, or an
  Immortal or better. Choosing it also clears the gear box of such pieces once (it asks first). Kept on
  the hero, and through rebirth.
- **Eternal-tier lines:** on Eternal gear a line can now roll past Immortal. The best 1% of its range is
  an Eternal-tier roll, marked by a new white-and-red diamond that turns, pulses and glints, with the
  line itself lit. Landing one gets a banner. The reroll pity on Eternal gear (30 rerolls) guarantees an
  Eternal-tier line, and "Lock Eternal-tier lines" keeps them safe.
- **Lock, unlock, "it is locked" and feeding notices now show over the gear screen** (as rerolls do),
  not only in the corner behind it.

### Lock the gear you want to keep (0.75.2)

- **Lock items** under the bag (or Alt+click any item, or the Lock button beside worn gear). A locked
  piece shows a gold padlock and can never be scrapped (one at a time or in bulk), fed to an Eternal
  (by hand or by auto-feed), traded, dropped for a friend, or used up to ascend another. Click again to
  unlock. The lock stays on the piece when you take it off and through saves. A rebirth still turns
  gear into Echo Essence as before; keep a piece through one as your Heirloom.

### Eternal passives you can see, and all of them damage (0.75.1)

- **Each piece's passives are listed on its row** in the Eternal tab, with their numbers worked out, and
  at the top of its tooltip (they were at the bottom and could fall off the screen).
- **Every passive is now damage, strongest on bosses and half as strong on everything else:**
  Colossus Breaker 25 to 40% more; Sunder up to 30 stacks on a boss, 10 on others; Fixed Gaze up to 30
  hits on a boss; Titanfall 200 to 300% of your attack damage; Open Wound 50 to 80% on crits;
  Guardbreaker on stunned or slowed enemies; Duelist ignores a boss's lesser enemies; Death Mark on
  anything. **Relentless** now deals 4 to 6% more for each tenth of health the enemy has lost (up to
  ten times that at the end), instead of cutting cooldowns. Pieces keep their rolls; the numbers follow.

### Eternal at ten times a made Immortal, rerolls, choosing what to feed, and Bram's anvil (0.75)

- **Eternal pieces carry every stat** (Attack Damage, or Spell Power for the Mage, Health, Armor, Attack
  Speed, Move Speed, Ability Haste, Crit Chance and Lifesteal), each line **at least ten times** the best a
  fully made Immortal line can be (top roll, +10, five stars), up to about 11.7 times, and still growing
  2% a level as it is fed. Pieces from before are made over at a good roll (70%) on every line, keeping
  their level, passives and blacksmith work.
- **The speeds have a ceiling:** with Eternal gear on, your gear's Attack Speed counts up to +400%, Move
  Speed +100%, Ability Haste 700 and Crit Chance 250% (a full set of made Immortals is about 300%, 80%,
  590 and 190%), so attacks and running stay playable. Power, Health and Armor have none.
- **Eternal lines can be rerolled** (gold and scrap, with the usual pity), and the blacksmith works on
  them. They are never reforged: they already have every stat.
- **Feeding is your choice now:** click Immortals to choose them, see the experience and the level it
  will reach, then press Feed (twice, to be sure). Nothing is eaten from one click. Once a piece is full
  the rest stay in your gear box.
- **Auto-feed (off unless you turn it on):** new Immortals you pick up, open or win go to the piece you
  choose (or the lowest-level one). Never a set piece, an Heirloom, or one that would be an upgrade on
  you, and never what is already in your gear box.
- **Bram's anvil is back in Haven:** talk to Bram for the blacksmith's +1 to +10 (8% to every stat on a
  piece each time), beside the Warden's caches. Shift+click goes as far as your scrap and gold allow.

### Eternal in its own tab; a party shares twice the chance (0.74.1)

- **Eternal gear has its own tab** in the gear drawer (Tab, then ✧ Eternal), shown from level 100, so the
  gear screen stays as it was. The tab glows while you have Essence enough to forge a piece you lack.
- **A party shares twice the Eternal chance:** alone you roll it all; a pair each roll the whole of it;
  three roll two-thirds each; four, half each.

### Fair fights with the Granted, forging, and loot that tidies itself (0.74)

- **Bosses no longer walk off healing mid-fight.** A boss someone has hit in the last 6 seconds keeps
  its patience and its leash, wherever the fight has drifted. (A long fight dragged it past its patience,
  it gave up and walked home healing 30% a second, back to full.) A boss of many bars that does give up
  heals only to the top of the bar it was on.
- **The Granted's health is halved** (50 times, still a hundred bars, each half as long).
- **Forge an Eternal piece** you lack from 8 Eternity Essence (the Forge button in the Eternal panel).
- **Thanks for the early ones:** a hero who had beaten Granted before this gets each one's first-kill
  Essence if they missed it (kills before 0.73), and 4 more for each, once.
- **The Eternal panel** now shows from level 100.
- **Loot left lying is scrapped for you:** after 25 seconds, or at once past 24 pieces on the ground,
  you get its scrap and Wishdust. Immortals, Eternals, set pieces and anything a friend dropped for you
  are never touched. (Piles of loot around a boss fight made every update heavy.)

### Eternal: a longer road, and the whole server hears (0.73.1)

- **An Eternal piece found is announced to the whole server**: a banner and a chat line for everyone
  (the finder has their own banner, and the chat line).
- **Eternal gear takes far longer to max:** 30 levels instead of 10, on a rising curve (about 56,000
  experience, some 560 Immortals, to the top; level 10 is reached about as soon as before). Each level
  adds +2% to its stats and +2.5% to its passives (+58% and +72.5% at 30), and its five passive slots open
  at levels 1, 6, 12, 20 and 30. A piece from before keeps the passives it already has.

### A taste of Eternity (0.73)

- The first time each of the Granted (Caelum's four bosses) falls to a hero, it gives **2 Eternity
  Essence**, 8 in all: enough to take a piece most of the way to level 10. It waits in the Eternal panel
  (Tab), kept through every rebirth, so the first Eternal piece can be fed the moment it falls.

### Damage numbers, clearer (0.72.1)

- Critical hits no longer fly in from the right: they pop where they land (the pop scaled the number's
  position as well as its size).
- A new **Damage numbers** setting (Menu): **Fewer in boss fights** (the default) leaves out burns and
  other damage over time, and small hits, while a boss is fighting you; or All, Critical hits only, Off.
- Crits on a boss no longer flash a ring and shake the camera, and big numbers are a little smaller,
  so a long boss fight stays readable.

### Music and polish (0.72)

- **Fourteen new themes**, written for this game in the spirit of the classic JRPGs and MMOs (harp
  preludes, heroic brass, bright bouncing field tunes): one for each Caelum map (Above the Clouds, The
  Decided Court, Everything You Asked For, Let There Be), one for each Depth (Embers Under Everything,
  Fathoms, What Grows Down, Many Voices None, Enough), and fight themes for the Granted (A Hundred
  Lives Deep), the Primordials (Older Than the Wish), the Quiet's Stillness (Wanting Nothing), the
  Herald and the Asker (The Asking), and the Echo Ring (Echoes Without End).
- **Music that follows the play:** songs crossfade; a boss fight brings in its own theme; the drums and
  string stabs swell when enemies close in and settle when it is calm; a menu softens and muffles the
  music behind it.
- **Combat feel:** a crit lands with a flash and a pop; very big numbers read as 125K / 13.7M / 2.1B.
- **New skill effects and sounds:** Dragon's Breath is a cone of real fire; pulls draw violet rings
  inwards; a red ring pulses under you while an Oath is on, and an ice ring turns while Glacier Spin
  guards you; Death Mark and Eternal drops have their own light and sound; walls of ice chime.
- **UI:** panels and menus ease in, buttons answer a press, tooltips fade in, badges pop.

### Rebirth perks, much higher caps (0.71.7)

| Perk | Was | Now (at the cap) |
| --- | --- | --- |
| Starborn | 25 (+50%) | 100 (+200% damage and health) |
| Deep Pockets | 3 (+12 slots) | 12 (+48 slots, 72 in all) |
| Quick Study | 10 | 30 (+300% EXP) |
| Fortune | 10 | 30 (+300% gold) |
| Lucky Star | 5 | 12 (48% of drops a rarity higher) |
| Head Start | 5 | 15 skill points |
| Old Wishes | 6 | 12 (60% less EXP a Wishborne level) |

Costs are unchanged. Shift + click a perk's button to buy up to 10 ranks at once.

### Hold the Line, harder (0.71.6)

- The Bulwark's **Hold the Line** drags everything within 8 m right up to you, and now drags bosses
  too, a fifth of the way.
- With **Glacier Spin** borrowed, Hold the Line also freezes (Shatters) everything it drags in at once,
  and turns enemy shots back as yours for as long as it holds (5 seconds), like the spin does.

### Live by hitting (0.71.5)

- Under **Crimson Oath** or **Blood Oath** (every class that borrows it), your **lifesteal is 25 times
  over** with no cap and no per-second budget (at least 2%, so a hero with none still heals), and
  nothing takes you above **49%**. There is no healing back on its own: keep hitting to stay alive.
  (This replaces 0.71.4's hold at 40%.)
- Entering another map turns an Oath off, offline as online, so it is never shown as on when it is not.

### Held at 40%, and a Warrior's Glacier Spin (0.71.4)

- While **Crimson Oath** or **Blood Oath** is on you are **held** at 40% health: never above it, and
  anything short of a killing blow is made good at once (1 health a moment ago, 40% now). The risk is
  a single hit for more than 40%: that still kills.
- A Warrior's Frostbinder borrowing is now **Glacier Spin** (a passive, was Glacier Wall): while you
  spin, and for 1.5 seconds after any Whirlwind, every enemy shot that comes near flies back, faster,
  as yours, and every Whirlwind hit gives 2 Hoarfrost, freezing what fills up, as a Frostbinder does.

### The road's errands, done for you (0.71.3)

- Once the road is open (any class has beaten the Cinder), the story's "go there" steps on it are done
  for you as soon as you take them: The Road Out, The Locked Gate, Past the Gate (Frostfall Pass) and
  The Last Stair, and W. (the stone at Frostfall Pass). Hand them in without walking back after a rebirth.

### Crimson Oath and Blood Oath are toggles (0.71.2)

- **Crimson Oath** (the Berserker's R) and **Blood Oath** (the Berserker borrowed on D or F) are now
  toggles: press to turn on (drained to 40% health, with Crimson Oath's roar), press again to turn
  off, 3 seconds between presses. While on, nothing heals you above 40% (that is the price), and every
  effect holds for as long as you keep it on. They go off when you fall.
- What made the old one last longer now works with the toggle: **Oathsworn** (augment): while it is on,
  12% less damage taken and 8% more dealt. **Oathblood Signet** (Immortal ring): while it is on, 15%
  more damage, and its roar deals twice as much.

### Animus, pity and the Granted's pay (0.71.1)

- **Animus** is now 5% for each Primordial point: 25% for a class mastered, 100% with all four.
  Caelum asks 25%, 50%, 75% and 100% (the Sky Road to the Zenith); the Echo Ring 25% from wave 50, up to
  100% at wave 80. **Where you have what is asked, nothing can Mind-Lock you; at 100%, nothing anywhere
  can.** Short of it, Mind-Lock still lands (shorter by your Animus), and the Will still finds you.
- **Eternal pity:** +2% for each Granted beaten without an Eternal, reset when one falls. In a party the
  chance is shared out: each hero rolls their own at a share of it (half each for two).
- **The Granted's loot:** 20 times the gold, twice the hoard, its best piece Immortal 40% of the time,
  a sure Immortal every kill (food for an Eternal), and three times the keys and shards.

### Eternal gear, and the Granted a hundred lives deep (0.71)

- **The Granted** (Caelum's four bosses) have **100 times** the health, shown as a hundred bars counting
  down (x100 to x1), and new quick, hard-hitting patterns with windups of about half a second, more of
  them as the bars go: Ianitor's Latch (three blows) and Every Door, the Arbiter's Gavel and Judgement,
  Desiderium's Take and Devour, Fiat's Let There Be Light (two crossing beams) and It Is Done.
- **Eternal gear**, the tier above Immortal (white and red, with a turning border), falls only from the
  Granted: 5% a kill on the Sky Road, up to 8% on the Zenith.
  - Each class gathers its own five pieces, one a slot. A piece that falls is always one you lack; with
    all five it falls as **Eternity Essence**.
  - **Soulbound:** never in the gear box (its own **Eternal** panel on the gear screen), never traded,
    scrapped, sold or thrown away. Worn in its slot like anything else.
  - **Kept through every rebirth**, worn where it was, back at level 1 like an Heirloom, and always
    your level. Its own level and passives stay.
  - **Feeding:** an Immortal from the gear box (100, +25 a star) or Essence (600 each) gives it
    experience. Ten levels, each +4% to its stats and +5% to its passives; levels 4, 7 and 10 open
    another passive. What would go past level 10 comes back as Essence.
  - **Its passives** are their own pool, all about bosses: Colossus Breaker, Sunder, Fixed Gaze,
    Titanfall, Open Wound, Relentless, Guardbreaker, Duelist, Death Mark.

### Borrowed skills, a real second weapon (0.70.5)

- Every borrowed active now hits like a big ability on a short cooldown, over a wide area, and grows with
  your **main skill** (Q's rank, and what talents and augments give Q). Ranges and areas are much
  larger. Passives are about half as strong again or more.
- Every **Frostbinder** borrowing is its **reflecting wall** (Mirror Ice, Glacier Wall, Glass Ward):
  enemy shots fly back as yours, it rises hard, and it shatters at the end, freezing what is beside it.
  Casting it again shatters the last one.
- The Rogue's **Fire Bomb** is lobbed up to 15 m and bursts over 7 m (wider than Cinderfall) with
  Cinderfall's blast, a stun, and burning ground for 5 seconds.
- Ember Brand now burns with Whirlwind too; Gravity Anchor pulls on W as well as R, and what it drags
  takes 25% more; Blink Strike bursts where you land.
- **Act III for the account:** once any class has seen the Unwish and been reborn, Wren's Deep quests
  open for every class at level 100.

### The account helps a new class along (0.70.4)

- **World tiers:** once any class has beaten the Cinder, every class has tiers I to V at level 100.
- **Mastery EXP:** +25% EXP for every hero for each class mastered (its Quiet beaten), up to +75%.
- **The Deep:** open as deep as any class of the account has gone (the Depth past its deepest
  Primordial). The Primordial quests still have to be done on each class: they are its Mastery.
- **The journal** says why Wren's Deep quests have not begun yet: the Unwish first, then one rebirth,
  at level 100.

### Tomas in Haven, online (0.70.3)

- Online, talking to Tomas in Haven sent the server the same message thousands of times in a moment,
  and the server closed the connection as a flood. It is sent once now.
- Online, who stands in Haven followed this browser's own offline save, not your online character, so
  Tomas could be there for a hero who had not seen the Unwish. Haven is now set by your online hero.

### Telling you about it (0.70.2)

- Handing in *Enough* (the Quiet) now says the class is mastered, and which two subclasses your other
  classes may now borrow from.
- While there is something to borrow and D or F is still empty, the Talents button counts it and the
  empty slot on the skill bar glows.

### The road stays open (0.70.1)

- Once **any class** on the account has beaten the Cinder (in any life), every map from the Greenwood to
  Starfall Sanctum (the Unmade) is open on the Waygate for **every** class, from the start of every life.
  No walking the road again after each rebirth. Asterfell and the Starwell still need their quests, the
  Wilds their world tier, and the Deep and Caelum their own gates.

### Borrowed skills (0.70)

- **Beat the Quiet** with a class and every other class on your account may **borrow** a skill from each
  of its two subclasses, on **D** and **F** (two in all, both from one class if you like). Choose them in
  Talents, under Mastery. Each class has six to choose from, one per subclass of the other three, made
  to fit the borrower: an Archer's Shade Partner and Dragon's Breath, a Mage's Elemental Lance (a held
  beam like Deadeye that sets burns or Hoarfrost), a Warrior's Javelin and Glacier Slam, a Rogue's Long
  Kunai and Smoke Snare, and so on. Some are passives (nothing to press).
- Borrowing from the **Berserker** is a **Blood Oath**: it drains you to 40% health and holds you there
  for 8 seconds, you deal 20% more, and your *own* subclass's signature goes past its limits: a
  Sharpshooter's Deadeye fires with no draw, 2.2 times as wide, through everything; a Windrunner's
  Hurricane looses 3 more arrows; an Assassin's Shadowstrike reaches 60% further and heals for 15% of
  what you deal; a Shadowdancer's afterimages hit twice as hard; Cinderfall lands at once; Rimewall is
  longer and stuns longer.
- A Rogue's Fire Bomb and Frost Trap also set burns or Hoarfrost on every blow while slotted.
- Burns and Hoarfrost borrowed by a class without them work as a Pyromancer's or Frostbinder's do.
- The keys: **D** and **F** are now the borrowed skills. The potion is on **1** only and parry on
  **Space** only.
- **Caelum** is 1.5 times as tough and hits 20% harder, on every map.

### The Will, kinder (0.69)

- The Will now strikes **twice**, about 0.8 s apart, and each strike is turned by an ordinary **perfect
  parry** (not the two-tick window). Fail one and it takes 90% of your health and locks you (the second
  does not come). While the Will is on you, and half a second after, everything else hits you 99%
  softer: the test is the parries. It comes every 6 to 8 seconds.

### The Will (0.68)

- **The Will of the Granted** filters out those short of the Animus. While you are short of it and
  within 24 m of anything that asks for it (Caelum, and the Echo Ring from wave 50), an amber ring
  follows you and lands every 5 to 7 seconds. It is a Dominion: only a parry in its last two ticks (the
  moment it flashes white) turns it, rolling does not help, and one that lands takes 90% of your health
  and Mind-Locks you (break it at a crack as before). Those with the Animus are never asked, so in a
  party only the one short of it is tested.
- Fixed: Dominion warnings now show amber for friends on the server world too (the telegraph's
  Dominion mark was not being sent).

### Worked-out texts (0.67)

- **Ascended passives show their real numbers**: an Immortal's passive text is worked out for its stars,
  and every number the stars have grown is in gold (Emberheart at 5 stars: "Burns stack **60** higher,
  and every stack burns **40%** more"). Passive texts are written as templates (`src/sim/items.js`
  passiveText) that grow each number the way the game does.
- **"Where to find more" is worked out from the game's tables** (`src/sim/sources.js`): quests, the
  merchant's stock and wares, bounties, chests, boss hoards, the Ring and the Weekly Echo are read, so a
  new source or a changed number shows up by itself. Also the wallet's "What it is for" and "Where to find
  more". Fixes the Fragment tooltip's "NaN% chance of 1" (elites: 25%).

### Auto-pick, deep waves, richer merchants (0.66)

- **Auto-pick augments**: rank every augment your class can get (drag, or the arrows; damage starts at
  the top, defensive ones at the bottom) and turn on auto-pick: each Ring offer takes the highest of its
  three. From the augment screen or the menu. Starting so far in that you are owed more picks than there
  are augments left gives you all of them.
- **The Ring's deep waves**: from wave 25 the echoes carry Ember (15, rising 4 a wave to 155 by wave 60);
  from wave 50 the Granted join them and every echo asks for Animus (15%, rising to 60% by wave 80).
- **Ex Voto**: choose which world's drop rates to see, I to V and Depths VI to X. Boss hoards' Immortal
  chance grows a quarter of a percent each world (the Unmade: 5% on I, 6% on V).
- **Primordials**: the first kill of each now gives a random Immortal (was an Ancient).
- **The Cinder opens every world tier**: once it has fallen, in this life or one before, a level-100
  hero has tiers I to V to choose.
- **Merchants**: five more wares each visit, fresh every time: Immortal Fragments in packs of 5 to 10
  (never more than 50 a visit), Warden keys, Ancient-or-better gear, Wishdust, and now and then an
  Immortal. A banner says when one has Fragments or an Immortal. In a party everyone can buy every ware
  once; buying from one merchant keeps you from buying from another for 5 minutes.
- **Take her place** (New Game+) is withdrawn for now; heroes already in New Game+ keep it.
- Fixed: the rebirth button's "Are you sure?" now goes back when you close the panel, or after 6 seconds.

### Harder, faster, better paid (0.65)

- **Faster from world tier II up**: enemies wind up quicker (down to 80% on tier V, never under 0.3 s
  so the parry flash still comes in time), rest less between attacks (66% on V) and move faster (+20%
  on V). Faster again in the Deep (Depth VI to X) and in Caelum. **Drops rose with it**: tier loot
  II 1.75 (was 1.5), III 2.45 (2), IV 3.2 (2.6), V 4 (3.2), and the Deep's and Caelum's own loot share
  now counts.
- **The Primordials drop a hoard**: 5 or 6 pieces, Mythic or better, with a 5% (the Cinder) to 12% (the
  Stillness) chance of an Immortal; an Ancient piece for certain the first time.
- **Ascension hits harder**: every star also adds 20% to an Immortal's passive, twice as strong at 5
  stars (cooldown cuts grow as speed, so never to zero). The tooltip shows the potency.
- **The Echo Ring**: every wave pays out as it falls (no waiting for the boss); waves grow 8% each up
  to wave 50 (was 7% to 40); gear about every other wave and Immortals from wave 15 (1.5% rising to 5%);
  from wave 20 the echoes attack faster. **Starting further in costs no augments**: the picks waves 1
  onward would have given are offered before the first wave. **Rebirth keeps** your Ring start and best wave.
- **Reroll lock**: the guard now locks Immortal-tier lines (the button greys out), so spam-clicking can
  never reroll one by accident. Untick it to reroll them.
- **Shift+click** opens 10 Warden's caches at Bram's at once (as many as keys, gold and bag room allow);
  the Wishborne panel says Shift+click places 10 points again.
- The rebirth button's description says what is kept now (scrap, Wishdust, keys, Ember, the Ring start).

### Models for Caelum (0.64.1)

The Granted, their four keepers and a landmark for each Caelum map, made with Tripo: the Answered, Cantors,
Thurifers, Gilded Colossi, the Veiled and wish-motes; Ianitor (two faces and a great key), the Arbiter
(blindfold, scale and sword), Desiderium (many arms, hollow and glowing) and Fiat (a sun mask, six wings
and rings of script); the Sky Road's gate, the Court's scale, the Hall's altar of offerings and the
Zenith's spire. The keepers' altars are gold-white stone in Caelum.

### Mastery, phase 2: Caelum and the Granted (0.64)

Above the Starwell, where the Granted live (design: `docs/design/mastery.md`). Wren's **The Sky Road**
follows The Other Lives and opens it on the Waygate; four quests take you to the top.
- **Four maps to explore**, walked in order: The Sky Road, The Court of Answers, The Hall of Wants and
  The Zenith. Each has a winding road to its keeper at the far end, camps off to either side (each with
  an elite captain), side paths to shrines (a stone to read and a chest), and outposts in the far
  corners (a harder camp and a chest).
- **The Granted**: the Answered, Cantors, Thurifers, Gilded Colossi, the Veiled and wish-motes, and four
  keepers: Ianitor, the Arbiter, Desiderium and Fiat. All in Ex Voto.
- **Animus gates it, not stats**: each map asks for 15%, 30%, 45% or 60% (5, 10, 15 or 20 Mastery). The
  Waygate's Caelum panel shows what each asks and what you have; arriving short of it, you are warned.
- **Dominions** (amber warnings): with the Animus asked, a perfect parry turns one, a roll avoids it,
  and one that lands is a small hit and a short lock. Short of it, only a near-frame-perfect parry (two
  ticks) turns it, rolling does not help, and it takes 90% of your health and locks you for about 4 s.
- **Mind-Locked**: no moving or acting. Every lock cracks now and then (a white flash on the ring in
  the middle of the screen): press parry in a crack to break free, too soon and it holds longer.
  Animus shortens every lock; locks close together are shorter, and with the Animus asked you are
  immune for a moment after one. Short of it, nothing protects you but your timing.
- **Clouded sight**: short of a map's Animus, its ground warnings flicker.
- Nearly impossible under-prepared, never impossible: there is no lock you cannot break and no blow
  you cannot parry.

### Mastery, phase 1: the other lives (0.63)

The first part of the Mastery system (design: `docs/design/mastery.md`).
- **The Other Lives**: after *Enough*, Wren sends you back to the Glass Choir to listen. It opens
  **Mastery** for the whole account.
- **Mastery**: every Primordial beaten on each class is a point for every hero on the account (5 a
  class, 20 in all), read from each class's save, so kills from before count at once. Shown in the
  Talents window; a class whose Quiet is beaten is *Mastered*.
- **Animus**: 3% shorter **Mind-Locked** a point (up to 60%), ready for the Granted.
- **Ember head start**: an alt gets half the best Ember among your other classes.
- **Being carried does not count**, and the game now says so early: on the Deep's panel at the
  Waygate, in The Other Lives, and with a banner the moment you come down into a Depth beside someone
  who has its Ember when you do not.

### A wallet, steadier rerolls, and what rebirth keeps (0.62.1)

- **The gear window's wallet**: gold, shards, scrap, Wishdust, Warden keys and Echo Essence, each a large
  number with an icon; hover one for what it is for, where to find more, and whether it is kept.
- **Rerolling** no longer moves under the mouse: each line's buttons sit on their own row, the Reroll
  button keeps one size, the Essence button is always there once reborn (greyed when short), and the
  panel no longer repeats how much you have (the wallet does).
- **Ember** is in the gear window's stats, with the Depth it reaches and the next one's need.
- **Rebirth keeps scrap and Wishdust** (with Warden keys), and both come in a quarter slower: scrapping
  gives three quarters of the scrap and Wishdust, and so do Wishdust drops from enemies.

### Testers' quality of life (0.62)

- **Deadeye** turns red the moment an enemy is on its line (ground, minimap and edge marker).
- **Echo Ring**: a closer next-wave key (**X** by default; Z, V, N, 2 to 5 or Enter only in the menu;
  Enter always works), an option to start the next wave by itself once a floor is cleared (never past a
  boss's spoils), and enemies stream in faster (one every 0.35 s instead of 0.55 s).
- **Alt + Q/W/E/R** ranks abilities up (Ctrl and Shift too), read by key position so it works in
  Firefox and on a Mac.
- **Rerolling**: the 30th reroll on an item without an Immortal-tier line lands one (the count is shown),
  and a guard (on by default) asks for a second click before rerolling a line that is already Immortal.
- **Server updates** no longer lose an Echo Ring run: it is paid out before the saves are written.
- **Inspect** anyone on the server world from the players list: gear (with tooltips), combat power,
  subclass and talents.
- **The Deep**: beating a Primordial under-Embered now counts for its quest (unless someone in the fight
  meets the Ember, so being carried still does not).
- **Recalled gear** comes back in its prime: its rolls, +levels and stars as they were, and it follows
  your level like an Heirloom. Pieces recalled before 0.62 are restored on load. Releveled items (Heirlooms
  too) now keep their roll quality exactly, instead of losing it to rounding at low levels.
- **Warden keys** open caches at **Bram's forge** in Haven (on the server world too), and a rebirth keeps them.

### Equip every upgrade (0.61.9)

- A button beside "Scrap everything that is not an upgrade": it puts on the best green-arrow item for
  each slot at once, and says how many there are. It never takes off an Immortal or a set piece for an
  ordinary item, never picks another class's weapon, and leaves anything on offer in a trade alone.
  Press it, then scrap, to tidy a full bag in two clicks.

### Wishborne Might adapts to your class (0.61.8)

- **Might** raises whatever your damage comes from: attack damage, **spell power** for a Mage (the
  panel now says so; it always did raise it), and for a **Bulwark** armor as well, which Weight of
  Iron turns into damage, so each point is worth the same 0.6% to every subclass.

### Link previews (0.61.7)

- Sharing the link on Discord, WhatsApp and the like shows a **1200 x 630 card**: the icon, the name
  and "Nothing you cut down stays down." over the starglass of the Sanctum, with what the game is and
  that it is free in the browser. Discord's embed stripe is the icon's gold. The card is
  `assets/icon/share.jpg` (85 KB, inside WhatsApp's limit); the tags are in the head of `src/index.html`.

### A game icon (0.61.6)

- **The Cut Wish**: a gold four-pointed star, the wish, split by a steel parry stroke, its two halves
  pushed apart. It is the browser tab icon (a bolder version for 16 to 32 pixels), the home screen icon
  on phones (the page now has a web manifest), and the picture shown when a link to the game is shared.
  The sources are `assets/icon/`; the build copies them next to the game.

### Every Immortal is about damage (0.61.5)

Immortal effects now raise your damage; only the Bulwark's turn its defence into damage.
- **Crown of the Undying**: every enemy that falls within 8 m: +4% damage for 6 s, up to 40% (no
  longer a second life).
- **Sporeheart**: every 4 s the spores burst for 120% of attack damage or spell power on everything
  within 6 m, and they take 10% more for 4 s (no longer a heal).
- **The Unwished Crown**: 12% more to bosses, and a dodged Doom gives 25% for 6 s (Doom is no longer
  halved). **Edric's Colours**: 18% more above 70% health (no heal on parry).
- **Berserker**: Crown of the Last Breath, 3% per 10% of health missing (up to 27%); Scarred Hauberk,
  a further 15% while Bloodied; Red Stride, Bloodied Cleave and Whirlwind 15% more.
- **Bulwark**: Bastion Plate, Weight of Iron counts armor 60% more while Hold the Line holds (and it
  lasts 3 s longer); Crown of the Iron Answer, 3 Reckoning per block and Broken foes take 35%.
- **Sharpshooter**: Rangekeeper's Coat, 15% more with no enemy within 6 m; Quickstep Boots, 20% more
  while the roll's attack speed lasts. **Windrunner**: Windwoven Vest, +12% attack speed and stronger
  Hurricane arrows; Zephyr Treads, Tailwind 25% stronger.
- **Assassin**: Shroud of Last Rites, +8% per Clean Kill for 6 s (up to 40%); Silent Step, Shadowstrike
  20% more. **Shadowdancer**: Shadowweave, 20% more while Veiled.
- **Pyromancer**: Ashen Robe, 4% more per burning enemy within 8 m (up to 24%); Cinderwalk, Fire Bolt
  25% more. **Frostbinder**: Rimeguard Mantle, +4% per Shatter for 6 s (up to 20%).
- Boss damage with full Immortals (bench): every subclass up, by 6% (Assassin, whose new chest pays
  in packs) to about 20% (Bulwark, Frostbinder, Shadowdancer); a Bloodied Berserker by about 40%.

### Fixed: the world tier picker on the server world (0.61.4)

- In Haven on the server world, the Waygate's tier picker lit up the tier of whoever had come into
  Haven first, not your own, and the Wilds and Asterfell could stay locked on a tier that opens them.
  Haven is shared by everyone, so each hero's tier there is now their own; the picker also lights your
  choice at once instead of after the next update.

### Ex Voto shows what each enemy leaves (0.61.3)

- **Drop rates in the detailed view**: every page you have completed now ends with *What it leaves*,
  worked out from the game's own loot tables for the world tier you are on: how often it drops gear
  and at what rarity odds, shards, Kindling in the Deep, what it gives as an elite or a Storied enemy,
  and for bosses the first-kill prize, the odds for the best piece, keys and shards, and what its
  Remnant can drop (its Immortal is named once you have met it). Lucky Star is counted in.

### Every item has a face and a story; Deadeye is aimed (0.61.2)

- **Item pictures**: every one of the ten names per weapon and armour slot has its own icon (40
  weapons, 40 armour pieces), tinted with what it is made of: rust, iron, steel, runes, frost, the
  Dunes' sun, gloom, storm, obsidian and starmetal. Immortals have pictures of their own (Stormcaller's
  lightning, the Timekeeper's hourglass, Edric's blue grip), and set pieces wear their set's colours.
- **Item descriptions**: a line for every item in its tooltip. Common to Rare stay short; from Epic up
  a second line says where the piece has been. **Every Immortal has its story**, for every subclass:
  Hesper Hale, the Queen's smith and Bram and Edric's mother, still at her anvil under the sand;
  Corran and Bloodreaver, the blade of grudge; Aldric's seal, Tobin's Sporeheart, the Unwished Crown.
- **Deadeye is aimed while R is held**: the whole line on the ground, with every enemy it would hit
  marked in order; the same line on the minimap, far past the edge of the screen; and a marker on the
  screen's edge for a target out of sight, with its distance. Let go to loose it (or left-click);
  right-click or Esc puts it down. Other abilities still work while aiming. A setting turns it back to
  fire-on-press.
- **What the Stones Remember**: the Ring's reward table has a name from the story.
- Fixed: an enemy that died while winding up left its warning on the ground. The eye on the server
  password box sits in the middle of it.

### The Ring pays clearly, augments for every subclass (0.61.1)

- **The Echo Ring**: every wave is worth 7% more than the one before (a boss three times a wave), up
  to wave 40. **Everything you gather comes home, however the run ends** (a fall too).
  - Gear focus: Epic, Mythic from wave 10, Ancient from 20, and from wave 20 a chance that each piece
    is an Immortal (1%, rising half a percent every 5 waves to 4% from wave 50). A run to wave 40
    pays about one Immortal either way: Gear (about 30 pieces at 3%) or Fragments (about 220).
  - **What the Ring pays** (since 0.61.2, *What the Stones Remember*): a table on the camp and at the stones in Haven, wave by wave for the
    chosen focus, with run totals from your starting wave, gear rarity and the Immortal chance.
  - **Waking it costs 5 shards** from wave 1, 2 more for each checkpoint further in.
  - Fixed: at the stones in Haven, the checkpoints could be another class's (after switching class);
    they now come from the server with every snapshot.
- **Augments**: the parry ones are gone (few took them); in their place Quickening (+40 ability
  haste), Fervor (+12% attack speed and damage) and Deadly (+40% crit damage). Giant (+25% health) is
  for the Bulwark only. Twin Cleave now adds one more strike (on top of any second strike). New for
  each subclass: Crimson Arc, Blood Embrace, Oathsworn (Berserker); Long Memory, Answer the Call
  (Bulwark); Dead Centre, Glancing Volley (Sharpshooter); Gale Force, Strong Tailwind (Windrunner);
  Executioner, Contract Killer (Assassin); Deeper Veil, Lingering Shades (Shadowdancer); Embers
  (Pyromancer); Glacial Spite (Frostbinder).
- **Gear changes where you can see them**: rerolls, reforges and equips show at the top of the
  screen, over the gear panel, with the Combat Power they gained or lost.

### Sharing a map, reminders, Standard parry, and new gates (0.61)

- **Sharing a map** (the server world, or friends in a room): for each hero beyond the first in the
  same copy, enemies come back 90% faster (not bosses), so each can farm a stretch of it. A **boss**
  gains 70% health and 50% poise (harder to stagger) per extra hero, taken again whenever someone
  arrives or leaves (keeping its share of health); together you still win faster (two heroes: twice
  the damage against 1.7 times the health). The lore, once: the great ones feel every wish raised
  against them. Numbers: `PARTY_RESPAWN`, `PARTY_BOSS_HP`, `PARTY_BOSS_POISE` in `src/config.js`.
- **Level-gap reminders**: after the first explanation, a short reminder at most every 30 seconds
  (for 5) while you fight enemies far from your level.
- **Parry timing is gone**: everyone parries on Standard (the server too).
- **The Echo Ring's stones** moved to the west side of Haven, away from the Waygate: a circle of
  seven standing stones with star-glass and a swirling gate you walk into (G), with a label and a
  minimap mark. **The Waygate** is a dais with four obelisks and rings of light that turn (faster
  and lower as it carries you); **Waystones** have a turning crystal and a band of runes rising up
  the pillar.

### Berserker: the risk pays (0.60.3)

- **Red Embrace**: while Bloodied, his basic attacks, Cleave and Whirlwind deal 30% more to enemies
  within 3 m (50% in Crimson Oath). The crescents keep him hitting from range; staying in a boss's
  face is where he out-damages everyone.
- **Crimson Oath no longer stops you falling.** It still drops you to 40% with a roar, doubles your
  lifesteal, and grows Crimson Reach and Red Embrace. Blood Rage's last breath (once every 30 s)
  is the only thing between him and death.
- Power: Berserker mid 1.52 -> 1.33, late 1.79 -> 1.58, so up close he is the top on the boss bench
  (2.60M at level 100, ahead of Pyromancer's 2.51M; 23.5k at level 75); from range a little weaker
  than before. Bulwark (late) 1.08 -> 1.1 and Assassin (mid) 0.89 -> 0.91 stay within 70% of him.

### Berserker and Windrunner, easier to play well (0.60.2)

- **Berserker, Crimson Reach**: while Bloodied, every swing flies on as a red crescent up to 6 m,
  cutting everything in its path. Up close the swing lands as before and the crescent cuts those
  behind for 60%; further off, the crescent carries the whole blow. So he can keep hitting while he
  steps out of a boss's attack. Cleave reaches 35% further and 20% wider, Whirlwind spins 35% wider.
  Crimson Oath makes it all bigger: crescents fly 9.5 m and cut wider (80% behind), Cleave +75%
  reach and +40% arc, Whirlwind +75% wide. His single-target damage up close is unchanged.
- **Windrunner, Hurricane is a passive** (from level 6, nothing to press, no more stopping to cast):
  Tailwind never leaves her, and every basic attack looses 2 arrows that sweep out wide and curve in,
  at other enemies nearby or at her target when no one else is near (30% damage each, +3% per rank
  after the first; Tailwind does not add to them). Eye of the Gale: a third arrow and +25%. Eye of
  the Storm: +20% arrow damage. Galeborn's four pieces: a perfect roll whips up a 3-second gale
  (+40% attack speed, Tailwind). Power retuned (mid 1.06 -> 1.09, late 1.1 -> 0.645): on the boss
  bench she goes from 2.10M to 2.45M at level 100 (below Pyromancer and Shadowdancer) and 19.4k to
  21.0k at level 75, and clears packs faster (3 packs: 5.0 s -> 3.9 s).

### The Weekly Echo: a twist each week, and something for taking part (0.60)

- **A twist each week**, the same for everyone (and for the boards' replay check): Glass Cannon
  (+50% damage dealt and taken), Dry Spell (no potions; a floor heals you fully), Riposte (a perfect
  parry heals 10%), Deep Draft (an augment after every floor), Swarm (a third more enemies, a
  quarter less health each), Haste (cooldowns 30% faster, enemies hit 30% harder). Shown on the
  Weekly Echo screen and when a run starts. Everyone still meets the same waves and the same offers.
- **Taking part** (a run on the week's boards) earns +25 Immortal Fragments, +10 Wishdust and +2
  starglass shards, once a week. In this browser: claim it on the Weekly Echo screen, for the
  character you choose. Online: your character gets it from the server world when you join (it asks
  the boards with this browser's board name, which then belongs to that account and no other).
- **Titles**: when a week ends, first on a subclass's board is its Champion (and earns the Echo
  Champion weapon glow); the top three and the top tenth earn titles too. Your best title shows
  by your name in the server world's player list.
- The Weekly Echo has its own button on the title screen.
- Boards server: `GET /me` (whose token this is) and `GET /awards?player=` (weeks played, places and
  titles). The deploy passes the boards' address (`TRIAL_API_URL`) to the server world's env file.

### The Echo Ring, reworked and online (0.59)

- **Choose what you are here for** before waking the Ring: gold, Immortal Fragments, Wishdust, or
  gear for one slot. Every wave you clear adds to the run's spoils in that, more the deeper the
  wave (each wave is worth 25% more than the first, a boss three times a wave). Gear comes Epic,
  Mythic from wave 10, Ancient from wave 20.
- **After every boss the spoils are safe**, and the Ring waits: *Take them home* (H) or *Push on*
  (Enter). Fall, or leave between bosses, and you keep what was safe at the last boss.
- **Whatever drops in the Ring comes home with you** (what does not fit is scrapped).
- **Online characters**: the Ring's stones stand in Haven, on the rise behind the well. Press G
  there to choose and wake it: a run of your own on the server world, augments and all. Leave from
  the menu, take the spoils home after a boss, or fall: you are back in Haven with what was safe
  (even if you disconnect mid-run). Offline, the stones lead up to the Ring's camp as before.

### A rebirth pays for what you give up (0.58.2)

- **Ember, Starmarks and Echo Essence all follow what you give up**: everything you wear (not the
  Heirloom, which you keep) and everything in your bag, by its Echo value (rarity, +levels, stars).
- **Ember** = 0.8 x the square root of that, up to 45 a rebirth. A first life gives up about 400
  (about 16 Ember), so with The Breath Below's 8 the first rebirth clears Depth VI comfortably;
  a built set (about 1,300) gives about 28 and a maxed one about 42. With each Depth's Kindling,
  a new Depth opens every rebirth or two: VII by the third, X by about the sixth.
- **Starmarks**: 10 for level 100, plus 2 x the root of Wishborne levels, plus the root of what you
  give up / 4 (up to +15).

### Everyone's own story in a shared world (0.58.1)

- On the server world, Haven and party maps are shared, but the story's people were placed by
  whoever got there first: a friend further along could stop you untying Tomas's scarf or reaching
  Odile in the garden, and Edric only came for the first one into the Keep. Now each hero's story
  is their own: your game shows the people and things your story has (Tomas home, Lark's stall,
  the lantern, the banner), what you do with them is checked against your own story, and Edric
  comes for anyone with his quest. People who are there for some and not others block nobody.

### Time well spent (0.58)

- **Come Home** is once on each world tier, every life (it starts again after a rebirth), and pays far
  more the higher the tier: Immortal Fragments (20 on tier I up to 80 on tier V, about one Immortal a
  life in all), Wishdust, keys, starglass shards, gold and Mythic or Ancient gear. It counts only on
  the tier it was taken on.
- **Echo Rifts**: once a rift is over, *Return to Haven* (or H) takes you straight home with its
  spoils (worn if the slot is empty, else in the bag; what does not fit is scrapped), or *Stay*.
  On the server each hero goes alone; in a room the host takes everyone.
- **Rebirth** shows everything a new life gives: Starmarks, Echo Essence (from what you wear and,
  now, everything in your bag), Ember, the pieces the star will remember, the Heirloom, a weapon
  glow, the account's EXP bonus, and what is left behind (Immortal Fragments, Wishdust, scrap, keys).
- **Gifts**: gear that came from a friend (a trade or a drop) stays with you. It cannot be passed on
  again and gives the star nothing at a rebirth, so a friend cannot hold your gear through a rebirth
  and hand it back, or pour theirs into your Echo Essence.

### Always the newest version, in every browser (0.57.9)

- Some browsers (Firefox, Safari) can hand back their cached copy of the page, even on a reload,
  leaving a player on the old version ("different versions" when joining). Now:
  - on opening, the page asks the site for `version.json` past every cache, and if it is older it
    loads the newest at once (once only, so a website still publishing cannot cause a loop);
  - joining the server world with an outdated page loads the newest and joins by itself;
  - every reload the game does goes to a changed address, so the browser must fetch it again.

### Rejoining after an update, in every browser (0.57.8)

- "Reload and rejoin" now carries what to rejoin in the page address instead of the browser's
  session storage. In Firefox the page could come back to the title without rejoining (Firefox
  can refuse session storage when the site's saved data is large); the fresh address also makes
  sure the newest page is loaded. If rejoining fails, the reason is shown.

### A first look at the Deep (0.57.6, gift raised to 8 Ember in 0.57.7)

- **The Breath Below**, a new main-story quest from Odile between the Starwell and the Unwish: a crack
  has opened under the Starwell. Taking it opens Depth VI in your first life (at level 100), so you
  go down, find you can barely touch what lives there, and learn why: Ember. Handing it in gives
  +8 Ember, just past half of what Depth VI asks, so going back down your blows finally land (once per hero, kept through every rebirth). The first time in the Deep, a hint explains
  your Ember against what the Depth asks.

### Quests worth handing in (0.57.5)

- Quest EXP is four times what it was, and measured at your own level (up to 10 above the quest), so a
  quest handed in late pays as well as one on time: about 2 to 4.5 levels each. Quests now carry about
  60% of the climb to 100; the rest is still earned in fights.

### Side-story choices work online (0.57.4)

- Tomas's scarf (Red Scarf, Part Two) and meeting Odile in the garden (An Ending for Tobin) now work on
  the server world and in friends' rooms; before, the choice was dropped and the dialog just closed. A
  test now checks that every action the game sends is one the server accepts.

### Updates load cleanly (0.57.3)

- Each build's game script carries a tag of its own, so a browser can no longer pair a new page with
  an old cached script after an update (which left the title screen half-built, with no music).

### A new title screen, and the Deep on its own (0.57.2)

- **Title screen:** signed out, Explore is marked **Offline** (saved in this browser only), with an
  invitation to sign in and play online. Signed in, **Explore online** is the main button (the server
  world, with everyone), with Play alone online and a quiet "Explore offline instead" beside it.
  Clearer buttons for the Echo Ring, Play with friends and moving saves; **Start fresh** (two clicks)
  deletes every offline hero, gold and rebirth in this browser, keeping a backup first. "Start a new
  <class>" is gone (rebirth covers it).
- **Sign-in box:** fits the game (no white box around Google's button, a proper Discord button), and
  the passcode has an eye to hold for a look.
- **The Deep** has its own panel at the bottom of the Waygate, apart from world tiers and rifts: the
  Depths go down like a stair, with your Ember against what each asks, whether you can hurt anything
  there, and the way into each Primordial's domain. Ember stays with you through every rebirth.

### Play alone, online (0.57.1)

- **One character everywhere:** signed-in players can play their online character alone: "Play
  online" on the title screen (or "Play alone" under Your account). It runs on the server world, in a
  Haven of their own: off the player list, no chat or invites, saved to the account like any online
  play. Browser characters stay for playing offline.
- The Echo Ring and the Weekly Echo's rewards work for online characters (0.59, 0.60).

### Accounts and online characters (0.57.0)

- **Sign in on the server world** with Google (or Discord), under Play with friends → Server world →
  Your account. Add the other one later to sign in with either. Playing alone or in a friend's room
  never needs an account.
- **Your characters live on the server:** bring them over **once** from the browser with your most
  progress; after that the server keeps them (safe from a cleared browser, the same on any computer).
  A server world with sign-in on never trusts a browser's save, so edited characters cannot get in.
- Setting it up (Google and Discord consoles, the server's settings): docs/ops/server-runbook.md, 4a.

### Glimmers, and smoother server worlds (0.56.4)

- **Signs are now glimmers:** slivers of the fallen star that remember what they saw, floating and
  turning where the signs stood. Unread ones shine and sparkle; once read they dim to a faint glow.
- **Read once per account:** every class and every life remembers every glimmer the account has seen
  (and quests that ask for one count it straight away). Glimmers already read by any class count now.
- **Switch class on the server world:** Menu → Play as another class saves this hero and rejoins the
  same server as the other one in a few seconds. Leaving the server world now waits for its last save.
- **When the server updates:** a pop-up says why you were disconnected and that your hero is saved,
  watches for the server to come back, and "Reload and rejoin" brings you back on the new version.

### The Mage, reworked (0.56.3)

- **Reach:** basic attacks 8.5 -> 10 m; Fire/Ice Bolt 14 -> 16 m and faster; Frozen Orb 15 m, faster and
  bigger; Starwake's blink and motes reach further; Meteor and Cinderfall 16 m and wider; Smoulder 15 m;
  Rimewall 14 m away and 10 m long.
- **Weight:** a flare at the hands on every spell, bigger bolts with burning trails, impacts with a ring
  and a jolt, a star falling onto each Meteor, a hard eruption of ice when Rimewall rises, and burning
  enemies that blaze hotter the more stacks they carry.
- **Pyromancer:** ten times the stacks (50, plus 10 for every 120 haste), each hit adds 2, each stack a
  fifth as hot, and **Roaring**: a burn gets hotter as it piles up, every stack twice as hot when full.
  It takes about 8 seconds to build on a boss, then it leads the table.
- **Frostbinder:** Rimewall strikes as it rises (60%, 2 Hoarfrost, a stagger), not only when it melts.
- **Balance:** the boss bench no longer lets a blink carry the fight off the map (it undercounted the
  Mage, whose power had been raised to make up for it). Measured fairly, the Mage was far ahead; its
  power is now set so Pyromancer leads once burning, Frostbinder is close behind, and the base Mage is
  just ahead of the other base classes. Assassin +5% on bosses.

### No more blocks (0.56.2)

- Heroes, enemies, bosses and Haven's people no longer flash up as the old block shapes while their
  models load: the old shapes stay hidden until the model is in (they only appear if a model cannot
  load at all, or takes over 10 seconds).
- Models load ahead of time: every hero and the Echo Ring's roster just after the page opens, and on
  arriving at a map, its enemies, boss and people, then those of the maps its portals lead to.

### Ex Voto, the bestiary (0.56.0)

- **Ex Voto** (B, or from the Journal; *ex voto*: what is left behind once a wish is granted): Sister Odile's notes on all 32 kinds of enemy, kept by the
  account, so every class and every life fills the same book.
- Ordinary enemies get a page the first time you lay one to rest: who they were, and how to give them
  rest. At 25, Odile has one more thing to say.
- Bosses: seeing one adds it. Each time one beats you (1, 3 and 6 falls) Odile has a hint, gentle first.
  Beating it completes the page, with the trick of the fight (the Asker's wishes, the Unmade's faces).
  Remnants, and the Unmade wearing your old face, add a note of their own.
- **Simple or detailed:** the simple page is a few lines; tick Detailed (or hold Shift) for every move,
  whether it can be parried, how long it warns you, and the second notes.
- A kill counts if it happens near your hero, so a party fills its books together.

### Everything on the server world (0.55.2)

- **Rebirth and the Unwish work on the server world**, as in single player (each hero's own, even with
  others around): the new life wakes in Haven, and the account's rebirth bonus counts there too.
- **A server list** in Play with friends → Server world, with each server's players online right now.
- **Capacity:** each server has a player limit (`MAX_PLAYERS`, 24 by default: "This server is full"
  past it), and Haven splits at 16 (`HAVEN_MAX`) so a crowd never costs anyone frames; party members
  are put in the same Haven. The players panel says which Haven.
- Adding servers: **docs/ops/server-runbook.md** (capacity measurements, the exact steps, what must
  exist before a server can go public). The update workflow now updates every server in `VPS_HOST`.

### Quicker clicks on the server world (0.55.1)

The server sends updates every step (60 a second) while 8 or fewer are on (30 a second up to 16,
then 20), and a friend's screen keeps a cushion sized in time (about twice the network's jitter)
instead of in updates. On a nearby server a click now shows after roughly 40–60 ms, not ~160.
**F3** now also shows the ping, updates a second, the jitter and about how long a click takes to
show; the room badge's ping is green up to 50 ms, amber to 120, red above.

### The server world (0.55)

An always-on world on a rented server, beside host-run rooms (which still work as before): join
with a passcode, meet everyone in Haven, chat with **Enter**, see who is on with **O**, invite
friends to a party, and play on different maps at once; each party has its own copy of a map
outside Haven, and rifts, delves and the Deep take just the party. Setup: "Server world" below.

### Help for slow computers (0.54.9, 0.54.10)

- **F3** shows how the game is running: frame rate, the worst recent frame, how long the game's own code
  takes a frame, the graphics level, resolution, draws and triangles, and the graphics chip.
- A browser drawing without the graphics card is detected and told how to turn hardware acceleration on.
- **Very low** graphics: Low at a lower resolution. Auto steps High, Medium, Low, Very low.

### Smoother multiplayer between homes (0.54.8)

- **No more pile-ups.** When a friend's connection cannot keep up, the host now waits for it to catch up
  instead of queueing more updates behind it. Before, the queue could grow to megabytes, so that friend's
  screen and controls fell further and further behind the longer you played.
- **A cushion against hiccups.** A friend's screen now keeps a small buffer of updates, sized to how
  unevenly they arrive, so movement keeps gliding through a network hiccup instead of stopping and starting.
- **Lighter updates.** Event numbers are rounded before sending, and saves only go out when they change.
- **Ping in the room badge.** The round trip (yours, or the slowest friend's for the host), green, amber
  or red, and "relay" when the browsers could not connect directly and go through a relay server.
- For testing: `?lag=150&jitter=60` in the address delays every message, as a connection between two homes would.

### A faster middle of the climb (0.54.3)

The 40s felt stagnant. Levels 38 to 48 now need 40% less EXP, easing in from level 28 and back out by 66:
about 30% less EXP across the 30s, 40% less across the 40s, 26% less across the 50s. The start and the end
of the climb are unchanged (the whole climb to 100 is about 3% shorter).

### Act III: The Deep (0.54; Ember by investment 0.54.1; models 0.54.2)

An optional extreme mode for heroes at level 100 who have rebirthed. It sits beside the world tiers on the
Waygate, in a box of its own, and it does not scale to you.

- **Five Depths, VI to X**, each a map of its own with a Primordial waiting at the bottom: the Ashen Deep
  (the Cinder, *Ending*), the Drowned Court (the Undertow, *Forgetting*), the Undergrowth (the Rootmother,
  *Growing*), the Glass Choir (the Choir, *Remembering*) and the Quiet (the Stillness, *Enough*). Each
  Depth has its own ground, light, plants and landmarks, its own enemies (Ashwalkers, the Unnamed,
  Rootbound, Echoes, Hushes), and the mountain's usual dead come down darkened in its colour.
- **Ember** decides whether you can touch what lives there. Each rebirth gives Ember by what you put into
  that life: the gear you wear when you go (rarity, +levels and stars, the Heirloom too), from about 6 for
  plain Ancients to **30** for a full set of +10 five-star Immortals; the rebirth screen shows what yours
  is worth. Each Depth also gives up to 5 **Kindling** (bosses always drop one; elites sometimes; others
  rarely). The Depths ask for 15, 50, 85, 120 and 155. Short of it, your blows barely land and theirs land
  harder; below half of it, every hit you make does 1 damage. Enemies show the Ember they need (◆) in red
  when you are short, and the map title shows your Ember against the Depth's.
- **Pace:** Depth VI opens after your first rebirth, as a taste. With a fully built set every life, one
  rebirth (and that Depth's Kindling) takes you to each next Depth; with less, it takes more.
- **The story gates each Depth:** Wren, Odile and Bram's quests open them one by one, and a Primordial
  only counts for its quest if you meet its Depth's Ember yourself (a friend cannot carry you down).
- **The story (Act III):** six Primordials, older than the mountain and neither good nor evil, Wanting
  (the wish granter, the Asker) among them, equal to the other five. Elder Wren, Odile and Bram send you
  down Depth by Depth; quests open each one and stay done through rebirth. Ending it wins the
  **Sixfold** glow.
- **Models** (0.54.2, made with Tripo): the five Primordials, their five kinds of enemy, and a landmark for
  each Depth, standing in a ring beyond its edge (a spire of cracked charcoal, a sunken arch, a knot of
  roots, a pillar of star-glass, a holed grey stone).
- **Seals:** some Primordial blows take the last skill you used away for a few seconds (shown crossed out
  on your skill bar).
- **The Asker, much harder:** more health, and new attacks (*Unasked*, which seals a skill; *Everywish*,
  which calls wishlings; *Answer*, a ring when she is low; a stronger *Granted*).

### Banked progress, Edric's keepsake, Echoes of past lives (0.53)

- **Models for the last of them** (0.53.1, made with Tripo): the Wishthief (a hunched thief with a sack
  of stolen wishes), the travelling merchant, Tomas come home, Lark, Edric of the Blue Trim, the Warden's
  Oath Shades, the Herald's honour guard, and two floating lights (the Wishling and the Unmade's
  wish-stars), which bob and turn. Every enemy and person in the game now has a model of its own.

- **Banked progress.** Kills and deeds no bounty was waiting for are kept: a new bounty starts with what
  it needs from the bank (12 elites banked, a 10-elite job is done at once, and the next one needs 8
  more). The same for side quests (Bram's, Odile's, Pip's): kills of their enemies, on their maps, made
  before you took the quest count. Elder Wren's story quests start from nothing.
- **Edric's Colours** is now a keepsake for every class: a ring in a slot of its own (beside your five),
  always your level (each line keeps how good its roll was, at your level's numbers), kept through
  rebirth. Warriors still get Edric's Sword as well. Heroes who finished the quest before have it now.
- **Echoes** (rebirth): the gear you wear turns into **Echo Essence** (1 to 30 a piece by rarity, times
  1 + 25% a +level and 1 + 50% a star: a full set of +10 five-star Immortals is about 1,800), and the star
  remembers the best piece you ever wore in each slot. In later lives, on the gear screen:
  - **Recall** a remembered piece, once a life: made again at your level, with its rarity, effect, roll
    quality and enchant (+levels and stars start again). 300 Essence for an Immortal (from level 40),
    150 for an Ancient (from 30), less for the rest.
  - **Echo** any piece in that slot back up to the +level and stars you once had there: 4 Essence a
    +level, 40 a star (no duplicate Immortal needed).
  - **Reroll** a line for 1 Essence instead of gold and scrap.
- **Heirloom** (rebirth): choose one piece you wear to keep. It comes back at level 1 and grows with you,
  with its rarity, effect, +levels and stars.

### Skill tooltips with the numbers, Deadeye drawn faster (0.52)

- **Skill tooltips** show the damage the skill deals now, with everything counted: rank, talents and
  augments, Overflow and class power (what lands on an enemy of your level, before crits). Hold
  **Shift** for the calculation, like LoL's: the flat part, the per-level part and the attack-damage (or
  spell-power) ratio, Deadeye's attacks-per-second multiplier, each multiplier on top, and how the
  cooldown comes out of your ability haste. Buff skills show what they give, Overflow included.
  (`abilityBreakdown` in `src/sim/world.js`; a test checks every skill's numbers add up to what it deals.)
- **Deadeye** is drawn in half a second (was 1 s); its class power is lowered to match (2.34M late, 21.5k
  at level 75 on the boss bench).
- The arrow shows on the string again whenever her hand is drawing, after a shot too (0.50 had hidden it).

### Archer channels, Deadeye pierces, Culling Edge, class power (0.51)

- **Arrow Storm** is drawn for a full second (you can walk, 60% slower; no attacks or other skills), and
  only then loosed. **Skyfall:** the first arrows land together for half the storm's damage again and
  pin everything inside (90% slower for 1.2 s), then the rain. Her animation holds the full draw and,
  after the release, holds the follow-through still until she settles (no reaching about).
- **Deadeye** (Sharpshooter) is drawn the same way, with a gold sightline, and **pierces up to 3 times**:
  the 2nd enemy takes 70% and is Marked (20% more damage for 5 s), the 3rd 50% and Pinned (stunned
  1.5 s; bosses less), the 4th 35% and Splinters (shards hit everything within 3 m for 35%).
- **Culling Edge** (Assassin): every ability hit also deals a share of the enemy's maximum health, 10% on
  enemies 10 or more levels below you, 6% at your level, 2% on enemies 10 or more above; on bosses,
  Storied enemies and Remnants at most 3 times your attack damage a hit. Bleeds do not.
- **Class power** (`src/sim/balance.js`): one damage multiplier per class and per subclass, tuned on the
  boss bench (`node test/bench-dps.mjs`; `MID=1` for level 75, `MOBS=1` for pack clearing). Two tables,
  level 75 and level 100, blended between. Boss damage per second after tuning:

  | | Level 75 (Epic gear) | Level 100 (Immortals, tier V) |
  |---|---|---|
  | Warrior / Archer / Rogue / Mage | 9.6k / 9.0k / 9.1k / 8.8k | 0.63M / 0.60M / 0.74M / 0.60M |
  | Berserker / Bulwark | 20.8k / 16.5k | 2.10M / 1.81M |
  | Sharpshooter / Windrunner | 21.6k / 20.5k | 2.29M / 2.10M |
  | Assassin / Shadowdancer | 16.7k / 22.5k | 1.75M / 2.46M |
  | Pyromancer / Frostbinder | 20.4k / 20.0k | 2.10M / 2.00M |

  Every subclass is within 70% of the strongest; the Assassin and Bulwark sit lowest and clear packs
  fastest (the Assassin clears three packs in 0.9 s at level 75, 0.4 s at 100).

### Cooldowns stop at 1 second, Arrow Storm is drawn first (0.50)

- **Overflow for every class.** No ability's cooldown goes below 1 second (`CD_FLOOR` in `src/config.js`).
  Haste past that is not wasted: damage skills hit harder by the same factor (a cooldown that would be a
  quarter of a second hits 4 times as hard), and skills that deal no damage get a stronger effect:
  Evasive Roll's attack speed, Nightstep's and Ambush's empower, Skirmish Step's quick shots. The
  stats panel shows the power when it applies. (0.43 gave this to the Warrior and Mage only.)
- **Arrow Storm** has a 0.6 s cast: she stands, reaches over her shoulder for an arrow, draws to full aimed at
  the sky and looses, and the storm begins as the arrows leave (a sheaf of light climbs from her). Its new
  animation is `arc_storm` in `tools/models/archer-moves.js`. After any shot the string stays empty until
  her hand comes back to the bow, so no ghost arrow appears as the hand returns.
- **Fixed:** the Mage's staff hand could twist into a stretched shape when she stopped running (the wrist
  bend that closes her fist round the staff piled up while the run faded into the idle).

### Fight near your level, and rarer, richer finds (0.49)

- **EXP by level band.** Enemies within 3 levels of you pay 10x EXP, sliding to 2x at 10 or more levels
  apart. Levels need 4x the EXP they did, so fighting at your level is about 2.5x faster than before and
  fighting far below (or far above) you about 2x slower. Quests and bosses keep their share. Saves made
  before 0.49 keep how far along their bar they were. Wishborne levels past 100 follow the same pace.
- **Elite spoils.** Every elite gives 1 or 2 Wishdust, a 25% chance of an Immortal Fragment (on any world
  tier), a sure piece that leans Mythic (Epic 55%, Mythic 37%, Ancient 8%), and a 3% chance it was guarding
  a radiant chest, which appears where it falls.
- **Radiant chests** are about 3x rarer and much richer (see *Treasure chests*). **World events** come
  less than half as often and pay 12 Immortal Fragments, a Remnant Sigil half the time and a richer chest.

### Weapon looks (0.48)

What you hold shows what you found. Swords, daggers and staves have four looks, each a model made with Tripo:
plain (Common and Uncommon), **fine** (Rare and Epic: polished steel with a blue gem), **ancient** (Mythic: old
gold and bronze) and **radiant** (Immortal: white gold that gives off its own light). The Rogue's second dagger
matches the first. The Archer's bow changes its wood: dark lacquer, old gold, then radiant gold. *Edric's
Sword* has a model of its own, steel and his blue, and shines that blue.

New weapon props are measured by `tools/models/calib.mjs` (where the tip, grip and guard are) and listed in
`WEAPON_MODELS` in `src/render/rigged.js` under `<class>_<look>`.

### Side stories (0.47)

Each ends with someone letting go; the choices cannot be undone.

- **Red Scarf, Part Two** (Pip, level 25): Tomas walks the Greenwood road as a husk, the red scarf twice round
  his neck. Untie it and he lies down (Pip gets his scarf, and knows), or let him keep walking (and after the
  Unwish he comes home, once; laid to rest, he does not). Pip's words change for good either way.
- **Edric's Colours** (Bram, level 45): Edric of the Blue Trim, a Storied Oathbound, still stands his watch in
  the Warden's Keep. Bram gets his colours; you get *Edric's Sword* (warriors: perfect parries strike back for
  150% and stack +12% damage for 8 s, up to 3; it shines his blue) or *Edric's Colours* (a ring for anyone:
  +15% damage above 80% health, parries heal 4%).
- **An Ending for Tobin** (Odile, level 75): she goes ahead to the heart of Gloomcap Hollow; find her there and
  sit with them. She stays. Her apprentice Lark takes her stall and her quests in Haven. A Gloomcap glow.
- **Haven Grows** (Wren): each finished story leaves something in Haven: a lantern for Tomas by the Waygate,
  Edric's blue banner by the forge, Lark's herb stall. With all three, a Hearthlight glow.

### Asterfell delves (0.46)

- **The palace stair**, beside Asterfell's gate, goes down into the palace: 3 rooms on tiers I and II, 4 on
  III and IV, 5 on V (Bakers' Row, the Guard Hall, the Ballroom, the Royal Nursery, the Throne Room), each
  with its own people and a line of what is left there. Every room must be cleared before the next opens.
- Beside the empty throne waits a boss for the tier (the Warden, the Mycelord, the Herald, the Unmade, the
  Asker). A radiant chest at the end; the first clear of each tier also gives a Remnant Sigil and an
  Unwishing Glass. Co-op: the party leader leads the way down, and the party goes too.

### Unwish: the ending (0.45)

- **Quest 6, Unwish** (Elder Wren, after The Starwell): she gives you the Unwishing Glass she kept for
  nineteen years. With the Asker gone, the Starwell offers the choice:
  - **Unwish yourself.** Want nothing at all. The credits roll; the husks lie down; Haven's notice board,
    Wren, Bram, Odile and Pip all have new words; Pip's father Tomas comes home, once. The world tiers
    carry on, after the wish. A weapon glow, Afterlight.
  - **Take her place** (once you have unwished yourself). Wish to keep them all, as she did: a full
    rebirth into **New Game+**. Enemies have a third more health and a fifth more damage for each time,
    and at the top of the mountain the Unmade wears your old hero's face and fights with your old
    class's moves, then with the wish's own.

### Enemies and bosses, remade (0.44)

- **Every enemy has a kit of its own**, fitted to where it lives and what it was before the wish:
  Husks lurch, Spitters cough fever that stays on the ground, Crushers swing their chains and stomp (hug
  them), Oathbound Knights rush with their shields and thrust their oath, Frost Wolves pounce and chill,
  Rime Callers grow frost under you, Scarabs burrow, Colossi topple, Sporecaps leave spores, Storm
  Wraiths step through the air and walk lightning toward you, the Glassbound raise a toast that breaks
  outward, Court Guards sweep their halberds.
- **Bosses fight like who they were**, and say so:
  - *The Warden (Aldric)* swings his ring of keys, bars the gate across your path, counts the gate stone by
    stone toward you, and below 60% musters his men.
  - *The Mycelord (Tobin)* hands out remedies that sicken the ground, plants a spore garden, rots the
    ground in a ring, drags you in for your medicine, and tends his garden.
  - *The Unmade (Maren)* sings a lullaby of slow seeking motes, holds you close (safe only near her), and
    in her later phases calls her people back, holds on, weeps the sky down, opens the empty cradle (four
    beams) and spreads her broken wings.
  - *The Herald* sounds a fanfare, reads a decree in a line, and wants to present you to the city.
  - *The Asker* asks if this is what you wanted, grants every wish at once, and crosses light.
- New attack shapes: rings with a safe middle, still beams (and crosses), lingering pools, rings of shots,
  seeking shots, a pull, steps through the air, and calls for help (summons pay nothing and fall with
  their caller).
- **Models made with Tripo** for the five bosses, Haven's people and the common enemies, with their own
  animations: wind-ups are timed so the blow lands with the game's. A model that has not loaded yet (or
  cannot) keeps the hand-built body.

### Late-game balance, gear rolls and Rebirth (0.43)

- **Attack-move: A, or Shift + click.** Firefox always opens its own menu on
  Shift + right-click, so the A key (as in League) and Shift + left-click now
  attack-move too. Shift + right-click still works in other browsers.
- **Why Warriors and Mages fell behind.** Late gear brings ability cooldowns to
  0.3–0.7 s, faster than anyone presses keys, while basic attacks keep pace with
  attack speed on their own. So a class built on abilities stopped growing.
  - **Overflow (Warrior and Mage):** ability haste never takes a cooldown below
    1 second; the haste left over becomes damage (a would-be 0.25 s cooldown hits
    4 times as hard).
  - **Berserker, Red Tempo:** Whirlwind beats once per basic attack you could
    make (2 to 10 a second), so attack speed makes it spin faster.
  - **Bulwark, Weight of Iron:** 70% of armor counts as attack damage for his
    abilities.
  - **Pyromancer, Searing:** burns can crit, and an enemy carries one more burn
    stack for every 120 ability haste.
  - **Frostbinder, Deep Winter:** ability haste shortens the wait after a
    Shatter (1.5 s down to 0.3 s); the freeze keeps its own wait.
  - **Windrunner, Crosswind:** extra arrows on every shot, growing with attack
    speed squared (half an arrow at 4 a second, 2 at 8, 4.5 at 12).
  - **Assassin:** Shadowstrike 15 s (8× attack damage), Death Lotus 20 s,
    Ambush 16 s and +120% to the next ability.
  - Measured with a bot, single target, late (level 100, five +10 five-star
    Immortals, 120 Wishborne points) and at level 75: Berserker 1.75M / 19k,
    Shadowdancer 1.72M / 23k, Assassin 1.54M / 24k, Pyromancer 1.36M / 20k,
    Bulwark 1.32M / 12k, Frostbinder 1.16M / 18k, Windrunner 1.02M / 18k,
    Sharpshooter 3.08M / 19k (before: Warriors and Mages 0.29–0.6M late).
- **Immortal gear is radiant gold** (it was pale teal, easy to mistake for
  Common) with a border of light that runs round it, on the gear screen and in
  its tooltip.
- **Rerolling.** Reroll any line of an equipped item (the main stat too) for a
  fresh number of the same stat, as often as you like, for gold and scrap at the
  same price every time. Rolls now spread ±8% (was ±6%), so it is worth it.
  Every line shows its **roll quality** as a diamond in the rarity colours, from
  Common (a low roll) to Immortal (the very top of its range).
- **Reforging** (the old enchanting) turns a bonus line into a stat *you
  choose*, never a random one, for gold and Wishdust.
- **Rebirth.** At level 100 with The Unmade beaten, ask the star to begin again
  (Talents, T). A full fresh start for that hero; kept are Starmarks (10 for
  level 100 plus 2 × the root of your Wishborne levels), the perks bought with
  them (Starborn, Quick Study, Fortune, Lucky Star, Head Start, Deep Pockets,
  Old Wishes), and weapon glows, with new ones at rebirths 1, 3, 5 and 10. Every
  rebirth on the account also gives every hero +5% EXP (up to +50%). Alone
  only. The planned second ending, *Take her place*, will build on this.

### The world, rebuilt (0.41)

Every map is now its own place instead of one disc with recoloured cones and blobs.
Nothing you bump into moved or changed size: the same obstacles, drawn as each land's own
trees and stones (`src/render/species.js`, `src/render/biomes.js`).

| Map | What grows and stands there | Its edge | Ground and weather |
| --- | --- | --- | --- |
| Haven | oaks, an autumn oak, pines, birches; flowers, berry bushes; Tripo cottages with thatched roofs | woods | dirt paths to the gates |
| Greenwood Trail | oaks, birches, pines; ferns, bushes, fallen logs, mossy boulders, stumps | woods | dirt paths |
| Spitter Fen | weeping willows, dead snags; reeds, lily pads | willows | still water with ripples, mud paths |
| Ashen Ridge | burnt trees with glowing splits; ash-dusted boulders, cinders | ash cliffs | grey ash, falling ash |
| Warden's Keep | broken columns, dead trees; ruined walls, graves | a ruined wall with Tripo towers | flagstones under moonlight |
| Frostfall Pass | snow-laden pines, ice spikes; ice-crusted boulders | ice cliffs | frozen ponds, snowfall |
| Sunscar Dunes | saguaros, bleached dead trees; layered sandstone outcrops, bones, pots | sandstone cliffs | blowing dust |
| Gloomcap Hollow | giant mushrooms with glowing gills; fungus-grown rocks | giant mushrooms | glowing mycelium threads, spore pools |
| Stormspire Cliffs | basalt columns; wind-carved rocks | basalt | rain and lightning |
| Obsidian Maw | obsidian shards, burnt trees; lava rocks | obsidian over a sea of lava | lava cracks |
| Starfall Sanctum | crystal clusters; stones floating over their bases | the ground ends in stars | holes into the stars |
| The Shattered Wilds | **new look:** pieces of four lands (green, frozen, sand, ember), each with its own plants, split by glowing violet seams | broken cliffs and crystals | a torn violet dusk |
| Asterfell | gold glass spires, palms; sandstone ruins; Tripo sandstone houses with amber windows | city walls | paving stones with star-glass in the joints |

- Every portal now stands under a stone arch with glowing runes (Tripo).
- The four Tripo landmarks are about 120–230 KB each; until one arrives (or if it cannot
  load) the old hand-built version stands in.
- Lower graphics settings draw fewer far edge trees and less ground cover.

### Archer and Rogue rework (0.42)

**Sharpshooter: the boss killer.** Less about holding down the attack button, more about
the one shot that matters.
- *Ricochet* (Q, was Piercing Shot): an arrow that glances from enemy to enemy, each within
  11 m of the last, hitting up to 4. Enough to clear a road.
- *Steady Breath* (W, was Barrage): no damage of its own. Your next ability within 6 s deals
  60% more and always crits, and your next basic attack is a Steady Aim crit.
- *Deadeye* (R): one shot across the map, always a crit, its damage multiplied by your
  attacks per second, with a heavy crack-and-boom of its own. Breathe, then fire.
- Talents: *Glancing Blow* (Ricochet hits harder and further along), *Marked Prey* (Ricochet
  makes everything it hits take more, bosses too), capstone *One Shot* (Deadeye +25%, and
  every Steady Breath takes 5 s off its cooldown). *Hawk's Hood* and *Bullseye Loop* changed
  to match.

**Windrunner: Skirmish Step** (Q, was Piercing Shot): hop a few steps without breaking
stride, and your next 3 basic attacks leave the string at once for 50% more. They are gusts:
they blow through every enemy in their path. Hop, shoot shoot shoot, hop. *Light Step*
shortens it too.

**Reflective enemies can be broken.** Two ability hits crack and shatter the mirror (a
Windrunner's gusts count), and parrying one shatters it at once. For 6 seconds it reflects
nothing and takes 20% more damage. The ring around it goes dim while it is broken.

**Assassin: rarer, heavier blows.** Shadowstrike's cooldown is 2.5 times longer (10 s) and it
hits 2.4 times harder; Death Lotus 2 times longer (14 s) and 2 times harder (and bleeds
twice as much); Ambush 12 s, and its empowered ability deals 75% more. A kill still brings
them all back at once.

Measured by a bot at level 75 (three packs of 8 knights, and 60 s on one big target):

| | packs cleared | one target (damage per second) |
| --- | --- | --- |
| Sharpshooter | 21.5 s (was 22.0) | 18.8k (was 14.1k) |
| Windrunner | 20.1 s (was 21.0) | 12.4k (was 12.5k) |
| Assassin | 1.9 s (was 4.8) | 22.2k (was 18.1k) |
| Shadowdancer | 22.8 s | 22.5k |

**The rogue's look and moves.**
- Once he picks a subclass, the rogue becomes a hooded ninja in a steel mask with red eye
  slits (a new Tripo model), on every screen, friends' too.
- A new, serious run: low and driven, blades trailing behind him.
- Nightstep, Ambush and Veilstep: a sudden coil, then a long flat lunge with both blades
  swept back.
- Starglass Kunai: a real throw, wind-up and whip.
- Fixed: the Shadowdancer's afterimages were the old hand-built figure and never threw.
  They are now his own model, blades and all, and throw when he does.

**The mage's run** is upright and composed now: a shorter stride, little bounce, her staff
held steady.

### Co-op, tested and tuned (0.41.1)

A host and two friends (warrior, archer, rogue) played through real browser
connections at three network qualities (`test/coop_deep.py`). What changed:

- **A friend's parry counts when they pressed it in time on their own screen.**
  Friends see the world a little late and their button press reaches the host a
  little late. The host now knows each friend's delay (every command says which
  moment that friend's screen was showing) and holds a parryable hit on that
  friend for as long as the delay (up to half a second) before it lands. A parry
  pressed before the hit appeared on their screen still counts, perfect timing
  included. Measured: every parry counted, up to about 0.55 s round trips.
- **Friends' own hero answers at once.** Walking starts on their screen the
  moment they click (it was about 0.2 s on a perfect connection, and 0.3 to 0.6 s
  over the internet), drawn a little ahead of where the host has them until the
  host catches up. The parry stance shows the moment it is pressed.
- **Everyone sees everyone fight.** Friends' attacks, skills, rolls, leaps and
  spins play on their models on every screen, with their skill effects. Before,
  other players only ever walked or stood.
- **The Asker asks everyone.** Its offers reached only whoever landed the hit
  that set them off (the others were counted as refusing). The Herald's lines
  and the Wishlings' threads now show for everyone too.
- **No more mismatched versions.** The room check now includes a fingerprint of
  the game's rules, so a friend with an old tab open is asked to reload instead
  of joining and breaking.

Measured on the host with two friends: about 16 KB/s to each friend in town and
25 KB/s in a fight.

### Act II: the Frozen Court and the Starwell (0.40)

- **The Frozen Court** (from Wren, after Tobin's Survey): the **Herald** stands
  at the heart of Asterfell, still reading the proclamation for your naming day.
  Every few seconds he reaches a new line (you can read them over his head) and
  calls up two shielded guards, never more than four at once; they fall with
  him. Between lines, light rains down on the court. Let him finish.
- **The Starwell** opens on the Waygate after the Herald: a small, quiet chamber
  under the court with nothing in it but the **Asker**, and its own music (the
  naming-day tune on one bell, breaking off every other line).
- **The Asker's offers.** At 75%, 50% and 25% health it stops, cannot be hurt,
  and offers everyone a wish for the rest of the fight (keys 1 to 4, or click):
  - *Power*: 40% more damage.
  - *A shield*: a ward worth 30% of your health.
  - *Speed*: 20% faster movement and attacks.
  - *Nothing*: it presses 8% harder. Saying nothing for ten seconds counts as
    this.
  At 20% it grows from every wish it granted (30% more damage and a shield for
  each), and the refusals stop counting against you. Wanting nothing is harder
  at first and easier at the end. The wishes are gone when it falls.

### Act II begins: Asterfell (0.39)

The story goes on after The Unmade (the plan: `docs/design/act-ii.md`).

- **W.** Wren has one more thing to confess: what she buried under the cairn on
  the frost pass the night she carried you down. Read it.
- **Under the Sand.** The Queen's city is not gone. **Asterfell** opens on the
  Waygate once Wren has told you, from world tier II: a sandstone city held up
  by star-glass that glows gold in the cracks of its streets, houses along two
  rings of roads, spires of glass, warm amber light and its own music ("The
  Naming Day"). It is still celebrating.
- **Tobin's Survey** (from Sister Odile): find his four survey stones in the
  city and learn what he knew.
- **Three new enemies:**
  - *Glassbound*: slow citizens in glass that shatter a moment after they fall
    (step out of the circle).
  - *Court Guards*: shielded; a parry shatters the shield, then a bash and a
    thrust.
  - *Wishlings*: small lights that now and then give a nearby enemy what it
    wants (30% more damage for a few seconds, a gold thread shows who).
- Quests can now ask for one particular sign, or a set of them.

### Real weapons (0.38.1)

- **The Warrior's sword, the Rogue's daggers and the Mage's staff are 3D models
  now** (made with Tripo as props, 30 credits each, about 100 KB each), in place
  of the block weapons: a steel arming sword with a blue-gemmed guard, curved
  daggers with dark leather grips (one in each hand), and a dark wooden staff
  curling round a pale blue crystal. Your weapon glow tints their metal.
- The Archer keeps her bow made in the game, because its string has to follow her
  drawing hand (the generated bow came with its string baked in).
- `tools/models`: props in the roster (`rig: false`, with their own style
  line); `optimize.mjs` takes `TEX=512` for smaller textures.

### Every class has its model; a Warrior combo (0.38)

- **The Rogue and the Mage are rigged 3D characters now** (Tripo, 85 credits
  each): a lean rogue in a charcoal leather jacket with a dagger in each hand,
  and a silver-haired mage in a blue coat with her staff.
  - Rogue: jab and cross stabs that alternate hands (from the animation
    library); our own run, Mercy Stroke and Last Rites (both blades driven
    down together), Fan of Knives (crouched, arms flung wide as he spins),
    Nightstep (a long low lunge) and fall.
  - Mage: our own run, spark cast (the free hand snaps forward), Fire Bolt (a
    two-handed thrust), Starwake, Meteor (staff raised high, then brought down
    as it falls) and fall; Frozen Orb is an overhand throw from the library. Her
    staff stays upright, leaning the way her forearm points.
- **No limb moves as a mirror of another.** Every hero's run gives each arm and
  leg its own reach, timing and a small rhythm of its own, and the head and
  shoulders follow a beat late; the Archer's bow arm answers each release a
  moment after the string is let go. (Enemies meant to look mechanical can
  still move in lockstep.)
- **The Warrior's basic attack is a two-slash combo**: up and across, then down
  and back, flowing into each other; it starts again after a pause.
- **The talent button is easy to spot** (a glowing gold bar at the top of the
  talents screen) and asks for a second click before it spends anything.
- `tools/models`: `common-moves.js` (the shared run and fall), `rogue-moves.js`,
  `mage-moves.js`.

### Talents in one click, a tidier gear screen, a smoother Archer (0.37.2)

- **Spend talent points in one click.** The talents screen has a button that
  spends every free point. If you have played that subclass before, it puts your
  points back exactly as you had them (in the order you spent them), so swapping
  subclasses no longer means clicking every talent again. With no build to go
  on, it fills the deepest open row first and evens out the ranks.
- **Gear screen:** "Scrap everything", "Never scrap" and the help text sit right
  under the bag again; the pouch and Immortal crafting moved below them.
- **Pouch tooltips** match the gear screen's dark tooltips, and say where to find
  more of each keepsake (with the chances).
- **The Archer:** her arms swing from the shoulder with bent elbows as she runs
  (no more marching), and she carries the bow slanting forward. Her drawing hand
  anchors at the outside of her jaw and goes round her head to the quiver, so it
  never passes through her head. When she falls, one knee gives before the other.

### The Archer, with more weight behind her (0.37.1)

- **She shoots from a kneel**: right knee down, left foot planted toward the
  target, so her legs drive every shot. Barrage fires from the kneel too;
  Piercing Shot and Arrow Storm use a wide, low split stance.
- **Her drawing hand no longer passes through her body**: it reaches over her
  shoulder to the quiver, brings the arrow round in front of her chest to the
  bow, and draws back to her chin along the arrow.
- **A more urgent run**: quicker strides, leaning in, knees driving and the free
  arm pumping.
- **A new fall**: her knees give, she pitches forward with her hands out to
  catch herself, the arms fold and she goes down on her front.

### The Archer gets her model (0.37)

- **The Archer is now a rigged 3D character**: a young ranger in green leather
  with a braid and a quiver, made with the Tripo API (125 credits).
- **Her animations are our own**, posed in code rather than taken from a library
  (`tools/models/author.js` and `archer-moves.js`): a light, upright run with
  the bow held low, a full draw-and-loose cycle for every shot (timed so the
  arrow leaves as the game fires it, then she reaches back to her quiver and
  nocks the next one), Piercing Shot (a deep draw that rocks her back a step),
  Barrage (five quick pulls), Arrow Storm (aimed high), a forward roll and a
  fall. Her idle and flinch come from Tripo.
- **A real bow**: its string follows her drawing hand, an arrow sits on it while
  she draws, and it snaps straight on the release. The string glows with your
  weapon glow.
- **Evasive Roll lasts 0.3 seconds instead of 0.18** so the roll can be seen;
  it covers the same distance and you are untouchable for longer.
- Ranged shots no longer flash a sword swipe in front of the Archer and Mage.

### Clearer Cleave (0.36.1)

- Cleave shows one shape, flat on the ground with a bright edge, exactly the
  area it hits. It used to draw a raised copy (which looked shifted) and a
  wider sweep that went past where it actually hits.
- The blade's trail is now a thin, curved swoosh near the Warrior, so it can't
  be mistaken for an area that hits.

### Warrior skills that hit hard (0.36)

- **Every Warrior skill has its own animation now**, made from motion-captured
  sword moves (Quaternius' Universal Animation Library, CC0) moved onto his rig:
  - **Cleave (Q):** a wind-up over the shoulder, a lunging sweep across the
    front and a follow-through, with a split-second freeze as it connects.
  - **Whirlwind (W):** crouched low, blade held out flat, spinning (for the
    whole channel when a Berserker).
  - **Breakthrough (E):** a low lunge that slashes as he arrives, then holds
    the stance before recovering.
  - **Skyfall (R):** the sword comes up overhead in the air and is driven into
    the ground as he lands, with a freeze on impact; he rises from a crouch.
  - **Falling:** he staggers back and collapses.
- **The blade leaves a glowing trail** on every swing and spin.
- **Bigger impacts:** sparks along Cleave's arc, a second shockwave and dust for
  Whirlwind, a bright core and burst for Breakthrough, a wide shockwave and a
  column of light where Skyfall lands, and more screen shake.
- How it was done (`tools/models`): `retarget.js` copies library clips onto a
  Tripo skeleton bone by bone; `add-clips.mjs` writes them into the model. The
  same moves can go on any future Tripo character. The model grew by 55 KB.

### Warrior animation fixes (0.35.1)

- **The sword is held properly.** It sat flat in the hand, so the idle looked
  stiff and the overhead swing read as a sideways sweep. Now it rests lowered
  in front, rises behind the head in the wind-up and comes down at the strike.
  While running it trails back and low instead of flipping with the arms.
- **Smoother stops:** the run eases into the idle over a third of a second.
- **A flinch when hit** while standing (a new animation), on top of the red flash.
- **Whirlwind** spins smoothly for its whole length (it used to turn once per
  damage beat and stop), arms out and blade sweeping, and finishes its turn
  when it ends.
- The Warrior moved to Tripo's larger animation set (the same run); the run
  is centred under him (it sat off to one side) and the file is smaller (630 KB).

### The first real character model (0.35)

The Warrior is now a rigged, animated 3D model made with the Tripo API: idle, a
run cycle, a sword swing timed to every attack, and a fall when knocked out. It
holds the game's own sword (so weapons can still change), keeps the parry guard
and weapon glow, and gets the soft edge light. Friends playing a Warrior in co-op
see it too. The model is loaded when first needed (about 0.85 MB) and the
hand-built one stays if it cannot load, so nothing depends on it.

How models are made (`tools/models`): `roster.json` lists each character's
prompt and animations; the "Make character models" workflow (run by hand, with
the `TRIPO_API_KEY` secret) generates, rigs and animates them through tripo-cli
and saves the results to the `tripo-models` branch; `optimize.mjs` shrinks a
model for the game into `assets/models/`. The Warrior cost 105 credits ($1.05).

### Brighter days (0.34.1)

Each map now has a mood. Haven, the Greenwood, Frostfall Pass and the Sunscar
Dunes are in bright daylight, with a strong sun and a light haze; the Fen,
Ashen Ridge, Warden's Keep and Stormspire Cliffs are at dusk; only Gloomcap
Hollow, Obsidian Maw, the Starfall Sanctum and the Wilds stay dark, lit mostly
by your own light. Vignette and glow follow the mood too.

### A new look for the world (0.34)

Drawing only: the rules, collisions and what co-op sends are unchanged.

- **Painted ground.** Every map's ground is worked out per pixel: large light
  and dark patches, worn dirt, fine grain and small bumps that catch the light.
  The Fen has wet, shiny puddles; Warden's Keep has flagstones; the Dunes have
  ripples; Ashen Ridge, Gloomcap Hollow, Stormspire Cliffs, Obsidian Maw, the
  Sanctum and the Wilds have glowing seams in cracked earth.
- **Moodier light.** Darker sky light tinted by each map, and a warm light you
  carry, so the world is lit around you. Snow and sand get less light, so they
  don't glare.
- **Smoother scenery.** Lumpy, smooth boulders with moss, snow or ash settled
  on top; layered pines, mushroom caps, crystal clusters and cacti; a wall of
  boulders at the edge of each map; timber-framed houses in Haven.
- **Ground cover.** Swaying grass, reeds, ice shards, crystals or little
  glowing mushrooms, and pebbles or rubble, by the thousand, drawn in one go
  each. Attack telegraphs always show through them.
- **Drifting motes:** pollen, embers, snow, spores.
- **Characters** have rounded, smoothly shaded parts and a soft edge light, so
  they read against dark ground.
- **Glow and colour.** On High: bloom on spells, lava and glows, and a colour
  grade with a vignette.
- **Graphics setting** (Menu): Auto, High, Medium or Low. Auto starts on High
  and steps down if the game runs below 45 frames a second. Low turns off
  shadows, grass and glow, and costs about what the old look did. It replaces
  the Shadows switch (shadows off becomes Low).

### Bounty board, Immortal Fragments, Remnant Sigils, The Shattered Wilds (0.33)

- **Bounty board.** A board by the Waygate in Haven holds three jobs fitted to
  where you are: clear 40 enemies on a map, bring down 10 elites, a Storied
  enemy, a world event, a Wishthief, a Remnant or an Echo Rift. Finish one
  anywhere, then hand it in at the board for 6 to 10 Immortal Fragments plus
  shards, Wishdust, gold or a Remnant Sigil (and a 10% chance of an Unwishing
  Glass). Swap a job you do not want for a little gold.
- **Immortal Fragments.** From bounties, Storied enemies (2), Wishthieves (2),
  world events (3), Remnants (4) and, on tier IV and up, the odd elite. 250 of
  them craft an Immortal for the slot you choose on the gear screen, from level
  70; its power fits your subclass like any other. At a steady endgame pace,
  about three hours each.
- **Remnant Sigils.** From Storied enemies (10%), world events (25%) and some
  bounties. While a boss is down, a rune ring marks its altar; press a sigil in
  (G) to call up its Remnant at once, for a boss beaten three times. No more
  waiting on the respawn.
- **The Shattered Wilds.** A map nearly twice the width of any other, reached
  by the Waygate from world tier II. Every enemy type of the late road, world
  events every 45 seconds (60% each time), Wishthieves and the merchant far
  more often, twice the Storied enemies and a few more elites. Two new signs to
  find.

### Subclass Immortals, rarer Immortals, lifesteal budget, Unwishing Glass (0.32)

- **Immortals follow your subclass.** From level 15 every Immortal's effect is
  the one made for the subclass you play (8 subclasses x 5 slots; before that,
  the old class effect). The item keeps its slot and name; switch subclass and
  its effect switches too. A few: Berserker helm *Crown of the Last Breath*
  (last breath every 15 s, with 3 s of Crimson Oath); Bulwark helm *Crown of
  the Iron Answer* (a blocked red attack heals 10% and gives 2 Reckoning);
  Sharpshooter chest *Rangekeeper's Coat* (25% less damage while no enemy is
  within 6 m); Windrunner ring *Storm Sigil* (Barrage +3 arrows); Assassin chest
  *Shroud of Last Rites* (each Clean Kill heals 5%); Shadowdancer weapon
  *Starglass Edge* (Veiled kunai +40%, two from each afterimage); Pyromancer
  chest *Ashen Robe* (4% less damage per burning enemy near you); Frostbinder
  chest *Rimeguard Mantle* (each Shatter restores 30% of the Arcane Ward). Each
  tooltip shows the version for your subclass. A Remnant's own Immortal is the
  same for everyone.
- **Immortals are endgame only.** No more from ordinary drops or the Iron and
  Gilded caches. They come from The Unmade (guaranteed the first time, then 5%
  for its best piece), the Remnants' own Immortals, the Warden's Cache (1%) and
  radiant chests (0.49: 1.5%, 4% on world tier IV and up).
- **Lifesteal budget.** Lifesteal heals at most 15% of your max health a second
  (it holds one second's worth; double during Crimson Oath). Late in the game a
  single hit deals hundreds of times your health, so one Barrage used to heal
  70% of it; now about a fifth. Simulated against The Unmade, a bot that plays
  (parries half the time, walks out of Doom) wins 12 of 16 fights on tier III
  and 9 of 16 on tier V (it won them all before); idle, everyone loses.
- **The pouch and the Unwishing Glass.** Stackable keepsakes go in a pouch
  under the bag, not in a bag slot. An Unwishing Glass (Wishborne panel, T)
  takes back every Wish point you have spent to spend again. From the
  travelling merchant (4 shards, on 40% of his visits), Remnants (15%), the
  Wishthief (10%) and Storied enemies (4%).
- The pause screen's "returning to town ends this run" only shows in Echo Ring
  runs now.

### Unique Remnants, world events, the travelling merchant, ascending Immortals, glows (0.31)

- **Each Remnant fights its own way** (instead of 0.29's shared ring of blows):
  - **Remnant of The Warden: Mirrored Oath.** Every 18 s it calls two Oath
    Shades, copies of itself that fight with its own three-hit combo (parry
    them like it). They fall with it.
  - **Remnant of The Mycelord: Spore Bloom.** Every 14 s two spore pools rise
    near you (never right under you) and grow for 14 s; standing in one hurts.
  - **Remnant of The Unmade: Unwishing.** Every 20 s three wish-stars appear
    around it. Break them inside 10 s: each one left heals it 5% and makes it
    hit 10% harder, for the rest of the fight.
  - Simulated with a bot that plays the mechanic, every subclass wins, in
    about twice the time of the normal boss.
- **Their own Immortals** (20% from each Remnant, any class can wear them):
  *Oathbreaker's Signet* (ring: a perfect parry strikes everything within 6 m
  for 250%), *Sporeheart* (armor: every 4 s, heal 1.5% of max health per enemy
  within 6 m, up to 9%), *The Unwished Crown* (helm: Doom takes half, and
  avoiding one gives 20% more damage for 5 s). And 30% of the time, a weapon
  glow.
- **World events.** After 45 s on a map, and every 90 s after, a 12% chance (0.49: rarer, better paid: 12 Immortal Fragments and a Remnant Sigil half the time) of:
  - **a meteor**: it lands somewhere near (an orange pillar of light and an
    orange minimap dot), a pack crawls out; clear it within 2 minutes for a
    radiant chest in the crater.
  - **a shrine**: step into its ring (a gold pillar) and hold it 60 seconds
    while waves come at you; leave it empty 6 s and it goes dark. Holding it
    gives a radiant chest, 10 Wishdust and 2 shards (not to anyone idle).
- **The travelling merchant.** On 15% of the maps you arrive at (at most once
  every 6 minutes) he sets up for 3 minutes (a brown minimap dot). Walk up and
  press G: two pieces of Epic-or-better mystery gear and 5 Wishdust for gold, a
  Mythic-or-better piece for 2 shards, a set piece for 3. In a party the stock
  is shared.
- **Ascending Immortals** (Gear, Tab): with a duplicate of an Immortal you wear
  (same effect) in your bag, *Ascend* feeds it in: a star, +10% to every stat,
  up to 5 stars.
- **Weapon glows**, chosen on the gear screen and seen by friends in co-op:
  Oathfire, Sporelight and Voidlight (sometimes from each Remnant), Riftfire
  (clear rift tier 10), Thief's Gold (catch 10 Wishthieves), Afterwish (beat The
  Unmade on world tier V).
- **Set bonuses that change how you play** (the 4-piece ones): Bloodbound,
  nothing drops you below 1 health while Whirlwind spins (and it spins 1 s
  longer); Wardstone, a Whirlwind with 5+ Reckoning Breaks everything it hits;
  Farsight, Steady Aim crits pierce; Galeborn, a perfect dodge whips up 3 s of
  Hurricane; Nightcut, after a Clean Kill the next Shadowstrike cuts everything
  within 3 m of its target; Veilweave, trading places with your afterimage
  Veils you and readies Veilstep; Ashen, a burning enemy that dies bursts its
  burn onto everything within 5 m; Rimeheart, each Shatter also Shatters the
  nearest other enemy.

### Rarity names: Ancient above Mythic, Storied enemies (0.30)

- The order is now Common, Uncommon, Rare, Epic, **Mythic**, **Ancient**,
  Immortal. Ancient (orange) sits just below Immortal; set pieces are Ancient,
  so a set competes with Immortal effects for the same slots.
- Each step keeps its strength and drop rates; only the names moved. Old saves
  convert on load: an old Legendary ("Ancient ...") is a Mythic now, an old
  Mythic is Ancient now, and set pieces move up to Ancient, stats and all.
- The named enemies from 0.29 are **Storied** enemies now, so "Rare" only ever
  means the gear rarity.

### Exploration surprises, Remnant bosses, sets and enchanting (0.29)

- **Storied enemies.** About one camp spawn in sixty (never in a rift, at most one
  on a map) is a named, Storied enemy, like *Brand Twice-Promised*: a gold name and a gold
  dot on the minimap, at least two modifiers (never fewer than an elite of its
  tier), five times the health, six times the EXP and gold. It always drops an
  Epic or better (30%: Mythic or better), 3 to 5 Wishdust, and 12% of the
  time a set piece. Farming one map you meet about three every ten minutes.
- **The Wishthief.** 25% of the time a map you arrive on has one hiding (and
  every two minutes there, a 20% chance of another): a glittering little thief
  and a gold dot on the minimap. It bolts when you come within 12 m or hit it,
  running at 90% of your speed, stumbling to catch its breath every 3 seconds,
  and gets away after 25 seconds. Every tenth of its health knocked off spills
  gold; caught, it gives a shard, 5 Wishdust and three pieces of gear (one
  Mythic or better). Simulated, every subclass catches it, in about 5 to 15
  seconds.
- **Remnant bosses.** Once you have beaten a boss three times, each time it
  comes back there is a 25% chance it is its Remnant: 1.8x health, 1.25x damage,
  1.5x rewards, and a new attack every 9 seconds, a ring of falling blows around
  you (Iron Rain, Spore Bloom, Unwishing). It always drops a set piece and 10
  Wishdust.
- **Sets.** One per subclass (Bloodbound, Wardstone, Farsight, Galeborn,
  Nightcut, Veilweave, Ashen, Rimeheart). Set pieces are Ancient items (just below Immortal) of
  their class with a green glow on the ground; two worn give the first bonus,
  four the second (see each piece's tooltip). From Remnants (always), Storied
  enemies (12%) and radiant chests (20%); usually your own subclass's set.
- **Enchanting** (Gear, Tab: *Enchant* on an equipped item). Turn one bonus stat
  into a different one at a fresh roll, for gold and Wishdust. After the first
  enchant only that line can be enchanted again, and each time costs more.
  **Wishdust** comes from Storied enemies, the Wishthief, Remnants and scrapping
  Mythic (1), Ancient (2) or Immortal (4) gear.
- **Fix:** a basic attack that has started now finishes if its target only
  slips a little out of reach (25% plus 1 m), and one that is cancelled refunds
  its cooldown, so a running target can no longer dance on the edge of your
  range and never be hit.

### High stakes: Doom, warriors and mages, rewards for the fight in front of you (0.28)

- **Doom.** A violet circle under your feet that takes a share of your *max*
  health: no armor, parry or block reduces it (not even Iron Answer). Walk out
  or dash through. From tier II every boss casts one now and then (25% / 35% /
  45% / 60% on tiers II to V; The Unmade casts two, the second wherever you
  went). On every tier, a boss Dooms anyone who stands near it for 4 seconds
  without any input, and each one in a row takes 15% more until you touch the
  keys. Rift guardians: 20% plus 2% a rift tier, up to 60%.
- **Away from the keys:** out in the world, after 30 seconds with no input,
  kills give no EXP, gold or loot until you act again.
- **Outgrown bosses** pay 10% less for every level you are above them, down to
  10% (EXP, gold, gear; keys and shards only some of the time). First kills
  always pay in full.
- **Streak:** every tier boss (tier II and up) beaten without being knocked out
  in between adds 10% loot on that tier, up to +50%. Being knocked out ends it.
- **Bosses fight over more ground** now that Doom keeps you moving: patience
  starts draining 22 m from home (was 12) over 8 seconds, hard leash 45 m.
- **Warrior: Momentum.** Cleave and Whirlwind deal 6% more for every enemy hit
  after the first, up to 48% more.
  - **Berserker:** Whirlwind is a 2-second spin you can run with: four beats of
    45% (180% in all), the first interrupts.
  - **Bulwark: Reckoning.** Every parry or block, and every 10% of your health
    lost, is a stack (up to 5); the next Whirlwind deals 25% more per stack.
- **Mage: Arcane Ward.** A barrier worth 15% of your health soaks damage first
  and comes back 5 seconds after you were last hurt.
  - **Pyromancer:** a dying enemy's burn always jumps to the nearest enemy;
    Wildfire adds more.
  - **Frostbinder:** Shatter's shards reach half a metre further per Ice Bolt
    rank (5 m at rank 5).
- Checked in simulation (level 100, Immortal gear, The Unmade, no input at
  all): before, every subclass won on tiers I to III and warriors and archers
  on tier V; now every subclass is knocked out on tiers II to V (only a tier I
  Sharpshooter or Windrunner still wins, killing it in 20 seconds). A bot that
  plays (parries half the time, walks out of Doom) beats it with every
  subclass on tiers III and V, and is almost never hit by Doom.

### Rogue subclasses get their own Q, W and E (0.27)

- **Shadowdancer** (the boss killer, never standing still):
  - **Veilstep** (Q, replaces Mercy Stroke): slip 3 to 5 m toward the cursor,
    untouchable, cutting whatever you pass through, and leave an afterimage.
    For 4 seconds you are **Veiled**: every basic attack you land makes each
    afterimage throw a knife at your target for 50% of it, and Starglass
    Kunai lose their 60% limit on a second hit.
  - **Starglass Kunai** reach 16 m (was 11), fly faster, and seek the enemy
    nearest your cursor; your afterimages' kunai go for the same enemy.
  - **Mirrored Cut** now adds 10% per rank to the afterimages' knives and
    half a second of Veil.
- **Assassin** (the farmer, enemy to enemy):
  - **Clean Kill** (trait): a kill resets Q, W and E (not R).
  - **Shadowstrike** (Q): leap up to 7.5 m to the enemy nearest the cursor;
    60% more from behind, on a stunned or Exposed enemy; double damage below
    30% health (not bosses).
  - **Death Lotus** (W): bleed and Expose everything around you for 4 s:
    +15% damage from you, and every side counts as its back (bosses keep
    their guard: only the 15%).
  - **Ambush** (E): blink behind the enemy nearest the cursor, facing its
    back; the next ability deals 35% more.
- Balance (simulated, level 40 to 100, bosses with 6x health): boss kill
  times are within about 10% of 0.26 for both; Shadowdancer still kills
  bosses about a quarter faster, and the Assassin now farms about 15%
  faster than before (a bot that does not even chase resets).

### After The Unmade: world tiers, elites, Echo Rifts, Wishborne (0.26)

- **0.26.1, smoother co-op:** the host now sends each friend only what changed
  (enemy details and loot items once, then just moves and health), about
  0.8 KB per update instead of 3 to 6 KB. Updates are numbered; if one goes
  missing, the friend asks for a full one. Host and friends must both be on 0.26.1.

- **World tiers.** Beating The Unmade opens tier II; beating it again on your
  highest tier opens the next, up to tier V. Pick the tier at the Waygate in
  Haven (the party leader's tier applies to everyone). From tier II every map
  out in the world is level 100, with tougher enemies and more, better loot:

  | Tier | Name | Enemy health | Enemy damage | EXP | Loot | Elites | Least rarity |
  |---|---|---|---|---|---|---|---|
  | I | The Road | 1x | 1x | 1x | 1x | 3% (maps from level 20) | Common |
  | II | The Unwished | 2.2x | 1.5x | 1.6x | 1.5x | 10%, 1 modifier | Uncommon |
  | III | Hollow Stars | 3.6x | 1.9x | 2.4x | 2x | 14%, 2 modifiers | Rare |
  | IV | The Unmaking | 6x | 2.5x | 3.4x | 2.6x | 18%, 2 modifiers | Epic |
  | V | Afterwish | 9.5x | 3.2x | 4.6x | 3.2x | 22%, 3 modifiers | Epic |

- **Elites:** bigger, a gold frame and a coloured ring, 2.6x health, three
  times the EXP and gold, and always an extra Epic-or-better drop. Their
  modifiers show under the health bar: **Vampiric** (heals when it hits you),
  **Frostbound** (its hits slow you), **Reflective** (a fifth of your basic
  attack damage comes back; abilities are safe), **Swift** (faster, quicker
  windups), **Shielded** (a shield takes damage first; parry one of its
  attacks to shatter it), **Volatile** (bursts a moment after it dies).
- **Echo Rifts** (Waygate in Haven, once The Warden has fallen; 1 shard): a
  random map with about twice the enemies, none of which come back. Clear
  enough of it (elites count three) to call its guardian, then beat it within
  6 minutes: the next rift tier opens, you get your shard back and a pile of
  loot. Each tier has 17% more enemy health and 7.5% more damage than the
  last; enemies are the party leader's level. Out of time, you can still
  finish, but the next tier stays shut. Best rift per subclass is kept in the
  Hall of Echoes. In a party, the leader opens it and everyone goes.
- **Wishborne levels:** past level 100, EXP fills endless Wishborne levels.
  Each is a Wish point for a small bonus with no limit (Talents, T): Might
  +0.6% attack damage, Vigor +0.8% health, Swiftness +0.4% attack speed,
  Focus +0.4 ability haste, Keen Eye +0.3% crit. Never in the Weekly Echo.

### Co-op fixes, trading, waystones, shorter arena runs, boss rework (0.25)

- **Co-op:**
  - Smoother for friends: host updates are played back at an even pace
    (bunched-up updates no longer make things jump), and each glide starts
    from where things are drawn.
  - The host only sees their own drops (and anything dropped for the party).
  - Rewards dropped at your feet (full bag) are yours only. This was how a
    rogue could pick up an archer's weapon.
  - A teammate who fell still gets EXP and their own loot from kills nearby,
    and from a boss anywhere on the map.
  - A beaten world boss stays beaten for its timer even if the party leaves
    and comes back (the timer is saved, so reloading does not reset it
    either). World bosses now return after 1 minute (the final boss: 2).
- **Trading** (in a party): in Gear, press **Trade with <friend>**. Both of
  you put in items (click them in your bag) and gold, and both press Accept;
  any change un-readies both, and everything is checked again at the swap.
  Or **Ctrl-click** a bag item to drop it on the ground for anyone in the
  party (you cannot pick it straight back up).
- **Patience:** an enemy dragged more than 12 m from home loses patience
  (a thin amber bar under its health bar) and after about 5 seconds walks
  home and heals. The bar shows only while it is running out.
- **Waystones:** every map out in the world has one by the entrance (where
  fallen teammates wake up) and one on the far side. Stand on one to jump to
  the other (just you), go back to Haven, or travel on like the Waygate.
- **Arena: shorter, harder runs.** Floors ramp about twice as fast, are
  denser, every enemy type shows up by floor 10, and the break between
  floors is 5 seconds. **Flawless** (nobody hurt): double gold, a potion and
  an augment reroll. **Swift** (under par time): +50% gold.
- **Bosses no longer let you kite them:** from range they **lunge** at you or
  **leap** onto where you stand. **The Unmade**, the final boss, has its own
  bar (title, phase marks) and three phases: **Starfall** (stars fall on you
  and where you are heading) from two thirds health, and **Collapse** (it
  drags you in, then bursts: dash out) from one third. It fights alone in
  the arena, and its ground in Starfall Sanctum is clear of small fry.
- **Combat Power** leans toward damage now (Might^0.85 x Resolve^0.15), so
  damage dealers top it while tanks shine in Resolve.
- **Fix:** the Weekly Echo no longer gives a skill point (and a rank-up
  marker) for beating a boss.
- A new account starts with **no starglass shards**, so new players begin on
  the road; the Echo Ring button appears once you have found a shard.

### New traits and ultimates, Combat Power (0.24)

- **Windrunner** gets a trait, **Tailwind**: after Evasive Roll, for as long as
  its attack speed bonus lasts, every basic attack (Barrage arrows too) deals
  extra damage on hit (30% attack damage + 2 per level) and takes 0.3 s off
  Evasive Roll's cooldown: attack fast, roll often. New R, **Hurricane**
  (cooldown 55 s): 6 seconds of +40% attack speed and Tailwind, every basic
  attack looses 2 more arrows at enemies nearby for 45%, and Evasive Roll is
  ready at once. Capstone is now Eye of the Storm.
- **Sharpshooter** new R, **Deadeye**: for 8 seconds, R fires a shot across
  the whole map at your cursor, up to 3 times. Each stops in the first enemy
  it meets and always crits; the third deals 50% more. Long Watch makes the
  far ones hurt most. The cooldown starts after the last shot.
- **Berserker**, Blood Rage now also gives 15% less damage taken while
  Bloodied; lifesteal stops just below half health so it keeps you Bloodied;
  and once every 30 seconds a killing blow while Bloodied leaves you at
  1 health (Last Breath). New R, **Crimson Oath**: drop to 40% health at once
  with a roar, then for 6 seconds you cannot fall below 1 health and your
  lifesteal is doubled.
- **Bulwark**, **Iron Answer**: your parry also blocks red attacks no one else
  can parry. A blocked red attack does no harm, and its attacker is Broken:
  stunned 1.5 s (bosses take two posture hits) and 20% more damage taken for
  4 s. With Shield Wall it covers friends too. New R, **Hold the Line**: drag
  everything within 8 m to you, stun it for a moment (not bosses) and make it
  fight you for 4 seconds; for 5 seconds you and friends within 8 m take 35%
  less damage.
- **Combat Power** (HUD, gear screen, item tooltips): a number to watch grow
  with levels, gear, talents, a subclass and Immortal effects. It combines
  **Might** (how hard you hit) and **Resolve** (how much you can take); see
  0.25 for the current weighting. Item tooltips show how much
  Combat Power, Might and Resolve change if you wear the item. It is only
  shown: nothing in the game asks for it, and the Weekly Echo boards still
  rank by floor. ("power" on items is now called gear score.)

### Safer saves, Frostbinder rework, treasure chests (0.23)

- **Your progress is much harder to lose.**
  - **One tab saves at a time.** Opening the game in a new tab (say, after an
    update) tells any older tab to stop saving, so an old tab can no longer
    write out-of-date progress over the new one when it is closed or hidden.
    This was the most likely way progress went missing.
  - **Automatic backups** in this browser: when the game starts, every ten
    minutes of play, and before anything deletes or replaces a save. The four
    most recent are kept, plus the backup with the most progress ever. Restore
    one from **Move saves to another browser**; restoring backs up what is
    there first, so it can be undone. If a backup has clearly more progress
    than you have now, the title screen says so.
  - **A double-click never deletes a character:** the second click of "Start
    a new ..." must come a moment after the first.
  - The game asks the browser to keep its storage even when the disk fills up
    (Chrome, Edge, Safari; Firefox would show a pop-up, so it is not asked).
- **Frostbinder rework: Hoarfrost.** Fire Bolt becomes **Ice Bolt**. Ice Bolt,
  Frozen Orb, Starwake's motes and basic attacks build **Hoarfrost**; at 6
  stacks the enemy **Shatters**: heavy damage (grows with Ice Bolt's rank), a
  1 second freeze (0.4 s for heavy enemies; bosses turn **Brittle** and take
  15% more for 4 s), and shards that give 2 Hoarfrost to enemies within 3 m,
  which can chain through a pack. Rimewall's thrown-back shots Shatter what
  they hit, and its melt gives 3 Hoarfrost. The tanky talents are gone (no
  more damage reduction or health): Bitter Cold, Biting Wind, Splintering
  Cold, and Heart of Frostfall now Shatters at 5 stacks.
- **Subclass augments:** Pyre and Inferno (Pyromancer), Hard Frost and
  Avalanche (Frostbinder). Augments for an ability your subclass replaced are
  no longer offered (no Frozen Orb augments for a Pyromancer, no Fireball or
  Ignite for a Frostbinder).
- **Treasure chests** on every map out in the world (not in Haven): 2 or 3
  per map, gold dots on the minimap. Walk over one to open it. Plain chests
  hold gold and a piece of gear; **gilded** ones (about 1 in 4) two better
  pieces and refill your potions; **radiant** ones (about 1 in 70 since 0.49)
  hold 8 to 14 **Immortal Fragments**, a Mythic or Ancient piece and two more
  good ones, two starglass shards, and a 1.5% chance of an **Immortal** (4% on
  world tier IV and up). An opened chest comes back somewhere else on the map after 2.5
  minutes. In a party, the opener gets the gear.
- **Fixes:** burns show as BURNING ×stacks (not "bleeding"), with Hoarfrost,
  Brittle and Frozen shown too; the Weekly Echo no longer shows a talent
  point badge, and T explains that the build is set before the run.

### Weekly Echo, boards and the Hall of Echoes (0.22)

- **Weekly Echo** (the Weekly Echo card at camp): once a week, everyone plays
  the same arena run with the same seed, at a fixed level (30, 60 or 90,
  rotating), with the same Epic gear plus one Immortal in a featured slot. You
  pick a subclass and spend that level's talent and rank points however you
  like. No experience or loot drops during a run, and your character's save is
  never touched. The trial uses the Standard parry window.
- **Score:** the highest floor cleared, then the game time it took (not the
  clock, so a slow computer or a pause does not cost you). Play as often as you
  like; your best run per subclass counts.
- **Boards per subclass,** never one overall ranking, plus a **Champions** view
  with the top three of every subclass side by side. Watch the top three runs
  of any board in the game (press 2 to speed up). Percentiles appear once 20
  people have played a board.
- **Honest scores:** the game records only your commands. The server plays
  the run again from them and only puts it on the board if it reaches the same
  floor at the same moment.
- **Offline first:** without the server (or before you join the boards with a
  display name), runs are kept in this browser and sent later.
- **Hall of Echoes** (camp): your own best arena waves per class and subclass,
  in this browser only.

### Mage rework and a scrap filter (0.21)

- **Mage E is now Starwake:** blink, then loose 3 homing motes of starlight
  at the nearest enemies (a different one each when there are three). They
  cannot be parried or sent back. Cooldown 8 s. New arena augment
  Constellation adds 2 motes.
- **Mage base:** more spell power and a little more move speed.
- **Pyromancer, Everything Burns:** Fire Bolt and basic attacks set enemies
  burning. Burns stack to 5, last 4 s and renew on each new stack; each stack
  burns for 15% spell power + 1.5 per level a second and grows with Fire
  Bolt's rank. **W becomes Smoulder** (2 stacks in an area, and burns on a
  Smouldering enemy deal 50% more for 5 s). **R becomes Cinderfall** (a
  burning star that leaves the ground on fire for 4 s, a stack every half
  second). Talents: Slow Burn (longer, stronger burns), Wildfire (a burning
  enemy's death passes all its stacks to the nearest enemies), Second Sun.
- **Frostbinder, Deep Winter:** no more armor. Enemies you chill or freeze
  deal 20% less damage (Numbing Cold adds more); Frozen Orb hits 40% harder,
  comes back 20% sooner, and its shatter freezes normal enemies. **R becomes
  Rimewall:** a wall of ice across your aim for 5 s that nothing can walk
  through; enemy shots that hit it fly back at them and freeze what they
  hit, and when it melts it shatters, damaging and freezing everything
  beside it. Capstone Heart of Frostfall: a longer wall that stands longer,
  and 10% less damage taken.
- **Never scrap:** under the bag, tick rarities (Rare to Immortal) that
  "Scrap everything that is not an upgrade" must leave alone, however their
  stats compare. Immortal is ticked by default. Shift-click still scraps one
  item on purpose.
- Balance (bot tests, rare gear): final boss in Pyromancer 21 s,
  Shadowdancer 20 s, Sharpshooter 22 s, Frostbinder 25 s. Farming kills over
  three maps: Pyromancer 221, Sharpshooter 222, Assassin 213, Frostbinder
  183, Bulwark 190; unspecced mage 186, archer 191, rogue 192, warrior 181.

### Attack-move, auto-attack switch, Long Watch, new names (0.20)

- **Attack-move: Shift + right-click.** Attacks the enemy nearest you or
  nearest your cursor (choose in the pause menu). If none is in reach, you
  walk to the spot and attack the first enemy you meet on the way.
- **Auto-attack can be switched off** in the pause menu. Then you only attack
  what you click or attack-move onto, and stop when it falls: ready for
  enemies that punish every hit. In co-op the setting goes to the host.
- **Sharpshooter trait, Long Watch:** +4% damage for every metre between you
  and the target past the first 2 (about +30% at normal range, at most +40%),
  with gold damage numbers at long range. Strongest behind a front line.
- **No more League ability names.** Backstab is **Mercy Stroke**, Shadowstep
  **Nightstep**, Tumble **Evasive Roll**, Lunge **Breakthrough**, Undertow
  **The Warden's Call**, Riposte **Counterstroke**, Savagery **Ash Fever**,
  Bloodlust **Red Haze**, Absolute Zero **Heart of Frostfall**.
- The pause menu scrolls on short screens instead of cutting off its top.

### Immortals that fit your class, kunai, new names (0.19)

- **Every Immortal effect now plays to the class wearing it.**

  | Slot | Warrior | Archer | Rogue | Mage |
  | --- | --- | --- | --- | --- |
  | Weapon | **Stormcaller**: Cleave and Whirlwind call lightning on every enemy hit (up to 6) | **Stormstring**: every 4th basic attack calls lightning | **Nightfang**: ability crits deal 40% more and take 1 s off Nightstep | **Wishfall**: every 3rd ability drops a star shard on the cursor |
  | Helm | Crown of the Undying: survive a killing blow at 35%, and your escape (Breakthrough, Evasive Roll, Nightstep, Starwake) is ready at once. Recharges each wave, in Haven, or after 2 minutes | same | same | same |
  | Chest | Aegis of Retribution: parries send a shockwave around you | parries shoot starlight at the nearest enemy | shockwave | starlight |
  | Boots | Slipstream: +move and attack speed after a perfect parry or dodge | same | +move speed, cooldowns run 60% faster | same as Rogue |
  | Ring | The Timekeeper: kills, and every 4% of a boss's health, take 0.5 s off cooldowns | same | same | same |

  Old Stormcaller daggers and staves take their new names automatically.
- **Nightstep empowers your next ability** (35% more within 3 s; the
  ability buttons glow gold) instead of your next basic attack. From Nowhere
  (was Ambush) makes it 100%.
- **Shadowdancer:** the shurikens are now **Starglass Kunai**, which stop in
  the first enemy they hit (cooldown 7 s). Names that matched League kits are
  gone: Living Shadow is **Afterimage**, Shadow Slash is **Mirrored Cut**,
  Marked for Death is **Second Death**, Lord of Shadows is **Crowd of One**,
  Long Shadow is **Slow to Fade**, and the Rogue's R, Death Mark, is now
  **Last Rites**.
- Boss test (level 100, The Unmade, rare gear): Shadowdancer 20 s,
  Sharpshooter 23 s, Assassin 28 s. Farming (three maps): Assassin 213 kills,
  Shadowdancer 199, no subclass 192.

### Shadowdancer rework: the boss killer (0.18)

The Rogue's two subclasses split the work: the **Assassin** chains kills and
farms fastest, the **Shadowdancer** fights from two places at once and kills
bosses fastest (see 0.19 for the current names: afterimages, Starglass Kunai,
Last Rites, Second Death).

### Higher stakes, Frozen Orb, warrior subclasses (0.17)

- **Lifesteal no longer refills you.** It heals in full only from basic
  attacks; ability hits heal a third as much (one Whirlwind into ten enemies
  used to top you up), damage over time heals nothing, and lifesteal above
  **25%** does nothing (the gear screen shows when you are capped). Lifesteal
  on new gear also grows half as fast with item level.
- **Enemies hit harder**: 1.5x instead of 1.3x at your own level, and the
  level gap now grows with the square of the gap: about 1.4x at +5, 2x at +10,
  **3.8x at +20** (two hits from most enemies, one from a heavy attack), and
  at most 5x.
- **Warrior passive, Battle Rhythm**: every enemy Cleave or Whirlwind hits
  takes 0.3 s off the other cooldowns (up to 1.5 s a swing). The warrior also
  moves faster and hits harder (+10 ability haste).
- **Mage W is now Frozen Orb**: a slow orb that drifts to the cursor, cutting
  and chilling everything it passes, then shatters for the big hit, slowing
  and interrupting. Press W again to shatter it early.
- **Subclass traits.** Warrior subclasses now change the class the moment you
  pick them:
  - **Berserker, Blood Rage**: below half health you are *Bloodied* (+15%
    damage, +20% attack speed; the health bar burns red, with a mark at
    half). Cleave and Whirlwind cost 4% of your maximum health (never below
    10%), so you can choose to drop into it, then stay there. Red Thirst now
    gives lifesteal only while Bloodied; Reckless adds attack speed too.
  - **Bulwark, The Warden's Call**: Whirlwind drags enemies to you, stuns normal ones
    for a moment and taunts everything it hits for 3 s. New talents: Gravity
    Well (wider, longer stun, drags heavy enemies too), Shield Wall (your
    parry also catches hits aimed at friends within 3 to 5 m, plus riposte)
    and Bastion (a perfect parry heals nearby friends too). Points in the old
    Counterstroke and Mirror Guard talents move over by themselves.
- **Ctrl + Q/W/E/R ranks up an ability**, as in League (Shift still works).
  Chrome closes the tab on Ctrl+W and pages cannot stop that, so leaving the
  page mid-game now asks first.

### Difficulty and the level gap (0.10)

- Every enemy hits 30% harder than before (`ENEMY_DMG`).
- **Level gap, like MapleStory.** An enemy above your level hits +7% harder
  per level (up to 2.5x) and takes 5% less from you per level (down to 20%).
  One below you hits 4% softer per level (down to 40%) and takes 2% more (up
  to +30%). Enemy levels are shown by their health bars: white is your level,
  green below, orange 2+ above, red 5+, a skull 10+. All numbers are the
  `GAP_` settings in `src/config.js`.
- **Crit overflow.** Crit chance over 100% is not wasted: each extra 1% adds
  1% crit damage. The gear screen shows both.
- **Class buffs.** Warrior, Archer and Mage hit harder (Warrior also swings
  faster and has a little more health) to close the gap on the Rogue.

### Story, people and quests (added in 0.9)

The game now has a backstory, and it is not a happy one. It is never told in
one piece: you put it together from **23 signs, notes and carvings** (two on
every map) and from what four people in Haven say when they give you work.
No spoilers here; the whole thing is written out at the top of
`src/sim/story.js` if you want to read or change it.

- **Close windows with a right-click** anywhere outside them (a near-miss just
  beside the window does nothing). The browser's own right-click menu never
  opens over the game.
- **Talk and read with a right-click** on a person or a sign: your hero walks
  over and opens it (or press G when you are next to one). Over people's heads,
  a gold `!` means a quest to take, a grey `?` a quest you are still on, and a
  green book a quest ready to hand in. In a conversation, G or Enter hands in a
  finished quest or accepts the next one, and the number keys pick a quest.
  Unread signs are marked on the map and minimap.
- **Gear icons match your class**: bows, daggers and staves, hoods, masks and
  wizard hats, and so on.
- **Elder Wren** gives the main story, ten quests from the first step outside
  to The Unmade. **Bram** the smith, **Sister Odile** and **Pip** have side
  quests tied to the map you are on; each of them lost someone up the mountain.
- **Rewards** are sized to the quest's level: EXP (most side quests pay about
  a level's worth), gold, scrap, keys, skill points and a piece of gear of a
  stated rarity. The story quests for the three bosses pay Mythic, Ancient
  and Immortal gear.
- **J opens the journal:** quests in hand, and every sign you have read.
- Quests you are on are listed under the minimap.

Adding a quest or a sign is one entry in `QUESTS` or `SIGNS` in
`src/sim/story.js`. Goals can be "kill n (of an enemy / on a map / a boss)",
"reach a map", "read n signs" or "clear wave n in the Echo Ring".

### Boss rewards (reworked in 0.9)

A boss out in the world now pays for the time it takes:

| Boss | Gear dropped | Best piece | Keys | First kill |
| --- | --- | --- | --- | --- |
| The Warden (40) | 3, Rare or better | Epic+, 12% Ancient or better | 1 | guaranteed Mythic |
| The Mycelord (70) | 4, Epic or better | Mythic+, 38% Ancient or better | 2 | guaranteed Ancient |
| The Unmade (100) | 6, Epic or better | Mythic+, 15% Immortal | 3 | guaranteed Immortal |

They also drop six times a normal enemy's gold for their level, two and a half
times the EXP, arena tickets, and two skill points the first time. The numbers
are `BOSS_LOOT` in `src/sim/story.js` and `BOSS_GOLD` / `BOSS_EXP` in
`src/config.js`.

### Subclasses and talents (added in 0.9)

At level 15 press **T** and choose one of two subclasses for your class:

| Class | Subclass | Plays like |
| --- | --- | --- |
| Warrior | **Berserker** | Bloodied below half health (more damage and attack speed), Cleave and Whirlwind cost health, a Cleave that resets on kills |
| Warrior | **Bulwark** | Whirlwind drags, stuns and taunts; parries that cover friends; heals the party on perfect parries |
| Archer | **Sharpshooter** | Longer attack range, crit chance and crit damage, a harder Piercing Shot that marks targets |
| Archer | **Windrunner** | Move and attack speed, a bigger Barrage, a longer and faster Evasive Roll flurry, longer Arrow Storm |
| Rogue | **Assassin** | Farming: crits, brutal Mercy Strokes, Last Rites that resets on a kill |
| Rogue | **Shadowdancer** | Boss killer: afterimages to trade places with, Starglass Kunai thrown from every afterimage, Last Rites that makes the target die twice |
| Mage | **Pyromancer** | Stacking burns, Smoulder to make them bite harder, Cinderfall that leaves the ground on fire |
| Mage | **Frostbinder** | Chilled enemies hit softer, Frozen Orb freezes, Rimewall blocks enemies and throws their shots back |

From level 16 you earn a talent point every 4 levels: 22 by level 100, which
is exactly one full tree. Each tree has three rows: three small stat talents
(5 ranks), two that change an ability (3 ranks, open after 5 points) and one
capstone (opens after 12). You can forget your path and choose again for gold.

Balance: a tree is tuned to be worth roughly a fifth to a half more killing
speed, with the tougher trees at the low end of that and paying the rest in
survival. `npm test` has a bot farm the same map with no tree and with each
full tree, and fails if a tree makes it slower or more than twice as fast.
The trees are in `src/sim/talents.js`; like augments, a talent only changes
numbers in `mods`.

### Music (added in 0.7, six more in 0.8)

Twelve original themes, one per place, written for this game and synthesised in
the browser like the sound effects, so there are still no audio files:

| Where | Theme | Feel |
| --- | --- | --- |
| Haven, title screen, arena town | Hearth of Haven | Warm, unhurried; flute over harp |
| Greenwood Trail | The Road Out | Bright travelling march; brass and snare |
| Spitter Fen | Still Water | Slow and uneasy; oboe over harp |
| Ashen Ridge | Cinder March | Tense and driving; brass and timpani |
| Warden's Keep, The Warden in the arena | The Warden Waits | Heavy and solemn; organ and low brass |
| Frostfall Pass | Snowblind | Sparse and cold; flute over bells |
| Sunscar Dunes | Sunscar | Caravan tune over hand drums; oboe |
| Gloomcap Hollow | Gloomcap Lullaby | A music box in the dark; bells and organ |
| Stormspire Cliffs, The Unmade in the arena | Thunderhead | Fast and stormy; brass and racing harp |
| Obsidian Maw, The Mycelord in the arena | Black Glass | Slow and heavy; oboe, organ, timpani |
| Starfall Sanctum | Where Stars Fall | Wide and strange; flute over bell arpeggios |
| Arena | Steel on Steel | Fast battle theme |

Music volume is in the pause menu; M mutes everything. Each song is a melody
and a chord per bar in `src/music/songs.js`, with a `style` that picks the
instruments and rhythm. Change the notes, or add a song and point a map at it
in `MAP_SONG`. The instruments themselves are in `src/music/player.js`.

### Classes (added in 0.4)

Pick a class on the title screen. Each class is one character with its own
level, gear, ability ranks and save, used in both exploration and the arena
(merged in 0.5; older arena and explorer saves are folded together on first
load). Gold and arena tickets are shared by every class. Everyone can parry.

| Class | Plays like | Q | W | E | R |
| --- | --- | --- | --- | --- | --- |
| Warrior | Melee, the toughest; every enemy Cleave or Whirlwind hits takes time off the other cooldowns | Cleave | Whirlwind | Breakthrough | Skyfall |
| Archer | Ranged basic attacks; every third gets +100% crit chance, the overflow becoming crit damage | Piercing Shot | Barrage (5 arrows that count as basic attacks) | Evasive Roll (then +50% attack speed for 4 s) | Arrow Storm |
| Rogue | Fast melee burst; Mercy Stroke hits 60% harder from behind or on a stunned enemy | Mercy Stroke | Fan of Knives | Nightstep (next ability +35%) | Last Rites |
| Mage | Weak basics, strong ranged spells, +25 ability haste | Fire Bolt | Frozen Orb (recast to shatter early) | Starwake (blink + 3 homing motes) | Meteor |

Changes in 0.5:

- **Class weapons.** Swords, bows, daggers and staves. Only their class can
  equip them, and every weapon that drops is for the class you are playing.
  Each type always carries its signature stat (bows attack speed, daggers
  crit, staves ability haste, swords attack speed). Staves give Spell Power,
  which powers the Mage the way Attack Damage powers the others.
- **Class augments.** Archer, Rogue and Mage each have seven hand-written
  augments that change how an ability behaves (Twin Bolt, Chain Kill, Endless
  Rain ...), on top of the plain damage and cooldown ones.
- **No endless kiting.** A melee enemy that is close but cannot catch you
  speeds up after 3 seconds, to nearly double speed. It resets when it attacks.
- **Arena scales up.** If your level is ahead of the arena wave (because you
  levelled in exploration), arena enemies are stronger, and pay more EXP and
  gold. It never makes them weaker.

Classes live in `src/sim/classes.js`. An ability is a `type` (cone, nova, dash,
leap, line, bolt, strike, zone, meteor, orb, barrage) plus numbers, so a new ability or a
whole new class is mostly data. The Warrior has hand-written augments; the
other classes get a generated set (more damage and shorter cooldown per
ability) plus the shared parry and hero augments.

### The loop (added in 0.2)

- **Perfect parry** slows every enemy and enemy projectile to 30% speed for
  1.2 seconds. You keep full speed.
- **Perfect dodge**: Breakthrough through an attack and its cooldown drops to half a
  second. Breakthrough's base cooldown is 9 seconds, so dodging well is what makes it
  frequent.
- **Ability ranks**: one skill point per level and per boss. Each rank is +15%
  damage and 5% less cooldown, up to rank 5.
- **Augments**: after every odd wave and every boss, pick one of three. They
  change an ability (Cleave resets on kill, Whirlwind pulls enemies in, Skyfall
  erupts twice ...) and last until the run ends. One free reroll per run.
- **Gear**: seven rarities. At the same item level and slot, a higher rarity
  is never worse in any stat. Mythic and Immortal sit above Legendary; every
  Immortal item carries a special effect. No item has a negative stat.
- **Town**: Continue takes you there. Arena gate (start from any checkpoint
  you have reached), blacksmith (upgrade equipped gear with scrap and gold),
  cache vault (loot caches with their odds shown), trainer (ability ranks and
  extra skill points for gold).

## Play online

The game is published with GitHub Pages: every push to `main` runs the tests,
builds the game and puts it live (see `.github/workflows/pages.yml`). Share
the link and friends play in their browser with nothing to download. Saves
belong to the site's address, so use **Move saves to another browser** to bring
progress from a downloaded copy.

## Weekly Echo server

The boards run on a small Cloudflare Worker with a D1 database, in `server/`.
`.github/workflows/trial-api.yml` deploys it whenever the server or the game
rules change, so the server always replays runs with the same rules as the
live game. Until it is set up, the game simply keeps runs in the browser.

**API:** `GET /trial/current`, `POST /players`, `POST /players/rename`,
`POST /runs`, `GET /boards/:week/:spec?me=`, `GET /champions/:week`,
`GET /runs/:id/replay`. Players get a random secret token when they join;
only its hash is stored. Only a display name is kept, no email or account.

**Spending safety.** Replaying runs is the only real cost, and it is capped:

- A run is replayed at most once, and only when it beats that player's best.
- 20 runs an hour per player; 5 new names an hour per network address.
- A daily budget (`CHECKS_PER_DAY`, `TICKS_PER_DAY` in `server/wrangler.toml`)
  keeps CPU inside the 30 million CPU milliseconds the Workers Paid plan
  includes. Runs over the budget are not lost: they wait as "pending" and the
  hourly scheduled job checks them once the next day's budget opens.
- Old recordings are pruned after four weeks (the top 10 of each board stay).

**Test it:** `npm test` includes `test/server.test.mjs`, which runs the server
against SQLite in Node. `node test/determinism.mjs` plays the same runs in
Chromium, Firefox and WebKit and compares them with Node (the
`determinism.yml` workflow does this on every rules change).

## Server world

An always-on place to play with friends, run on a small server you rent instead of one player's
browser (0.55). It stays open with nobody hosting: friends join any time with a passcode, meet in
Haven (shared by everyone, with chat), and each party gets its own copy of every map outside, so
parties can be on different maps at once. Rifts, delves and the Deep take just your party. Each
player's progress still saves in their own browser, as in a host's room. In the game: Play with
friends → Server world. **Enter** chats, **O** shows who is on (invite, accept, go to a party member).

**Setting it up (once, about 15 minutes):**

1. Rent a small Linux server in **Singapore** (for the lowest ping): for example DigitalOcean
   ("Basic" droplet, Ubuntu 24.04, 1 GB) or Vultr ("Cloud Compute", 1 GB). About US$5 a month.
   Choose SSH-key login when it asks.
2. In your domain's DNS (stunnedgames.net), add an **A record**: name `play`, value = the server's
   IP address. If your DNS is on Cloudflare, leave it **grey (DNS only)** for now.
3. Log in to the server (`ssh root@<its IP>`) and run:
   `curl -fsSL https://raw.githubusercontent.com/STUNNED9933/afterwish/main/game-server/deploy/setup.sh | bash -s -- play.stunnedgames.net`
   It asks for the passcode your friends will type. Then `https://play.stunnedgames.net/health`
   should show `"open":true`.
4. **DDoS protection (recommended, free):** put Cloudflare's proxy in front, so nobody sees the
   server's real address: in Cloudflare, switch the `play` record to **orange (Proxied)**, and set
   SSL/TLS to **Full (strict)**. WebSockets pass through; ping barely changes (Cloudflare is in Singapore).
5. **Automatic updates:** in GitHub → the repo → Settings → Secrets and variables → Actions, add
   `VPS_HOST` (the server's IP) and `VPS_SSH_KEY` (a private key whose public half is in the
   server's `~/.ssh/authorized_keys`). After that, every change to the game rules updates the server
   (players get their save and a "restarting" message, and rejoin a few seconds later).

**Change the passcode:** on the server, edit `/etc/afterwish.env`, then `systemctl restart afterwish`.
**Is it running?** `systemctl status afterwish`, or open `/health`.

Safety: only people with the passcode get in; each address may open 4 connections; messages are
size- and rate-limited (a flood closes the connection); the game runs as its own locked-down user;
the firewall opens only SSH and the web. Measured: 24 players across 17 map copies use about 3 ms of
each 16.7 ms step on one core, so a 1 GB server has plenty of room.

## Share it with friends

Two options, neither of which triggers a virus warning:

1. Send them the two files in `dist/` (`index.html` and `game.js`, keep them
   together in one folder). They double-click `index.html`.
2. Put the `dist/` folder on any static web host (GitHub Pages and itch.io are
   both free) and send the link.

Saves live in each player's own browser.

## Change the game

You need [Node.js](https://nodejs.org) 22 or newer (the server tests use its built-in SQLite).

```
npm install       # once
npm run build     # rebuild dist/ after editing anything in src/
npm run watch     # or: rebuild automatically on every save
npm test          # bots play the game with no graphics and check the rules
```

Where things are:

```
src/
  config.js         parry windows, cooldowns, wave pacing: start here to tune
  sim/              the game rules. No graphics or input in here
    world.js        player, enemies, parry, projectiles, loot, waves
    defs.js         abilities, enemy types and their attacks, wave recipes
    classes.js      the four playable classes and their Q W E R kits
    maps.js         exploration maps: enemies, portals, and everything solid
    story.js        the backstory, people, signs, quests and boss rewards
    talents.js      subclasses and their talent trees
  net/
    room.js         hosting and joining rooms by code (PeerJS)
    sync.js         the snapshots the host sends and the friends apply
    augments.js     the augments you pick during a run
    items.js        gear slots, rarities, stat rolls, upgrades, loot caches
    rng.js          seeded random numbers
  render/
    renderer.js     Three.js scene, camera, telegraphs, particles
    models.js       characters built from boxes and cones
  ui/               HUD, gear drawer, town
  input.js          mouse + keyboard -> commands
  audio.js          synthesised sound effects
  music/            the soundtrack: songs.js (the notes) and player.js (the instruments)
  save.js           localStorage save
  main.js           wires it all together, main loop
test/
  sim.test.mjs      headless bot playtest
  balance.mjs       report: a bot farms every map at the right level
  browser.py        optional: plays the built game in headless Chromium
```

Easy first edits:

- Parry feel: `PARRY_PRESETS` in `src/config.js`.
- A new enemy: add an entry to `ENEMIES` in `src/sim/defs.js`. Give it
  `model` (one of the five body shapes) and `look` (size and colours), or
  build a new shape in `src/render/models.js`. Then put it in a map's
  `roster` and in `buildWave`.
- How fast you level and how hard enemies get: `EXP_PACE` in
  `src/config.js`, `enemyScale` and `expToNext` in `src/sim/defs.js`.
  `node test/balance.mjs mage` prints how a bot of each class fares in every map.
- Ability numbers: `ABILITIES` in `src/sim/defs.js`.
- A new augment: add an entry to `AUGMENTS` in `src/sim/augments.js`.
- Drop odds, cache odds and prices: `RARITIES` and `CACHES` in `src/sim/items.js`.

## How it is built, and the road to multiplayer

The simulation (`src/sim/`) is separate from everything you see and press:

```
input.js --commands--> World.step(1/60) --events--> renderer, HUD, audio
```

- The player never changes the world directly. Input becomes commands such as
  `{ type: 'move', x, z }` or `{ type: 'parry' }`.
- The world advances in fixed 1/60 s steps and uses a seeded random number
  generator, so the same seed and commands always give the same result
  (`npm test` checks this).
- The world has no dependency on the browser. It runs under Node as it is.

That is the shape multiplayer needs. The likely path:

1. Turn `player` into a list of players, each with an id on its commands.
2. Run `World` on a small Node server with WebSockets. Clients send commands
   and receive state snapshots.
3. Keep running the local world for instant response (client prediction) and
   correct it from the server. Parry timing should be judged on the client
   that parried and then confirmed by the server, so lag does not eat parries.

## Ideas for next steps

- Real art and animation in place of the shape-built characters.
- More heroes with their own QWER kits.
- A walkable 3D town in place of the menu screen.
- Enemy variety: shielded enemies, feints (a delayed swing to bait early parries).
- New body shapes for the 0.8 enemies, which are recoloured versions of the first five.
- A third row of story: more side quests, and people who move or react as the story goes on.
- Quests in the field (an injured scout on a map, an escort), and daily bounties.
- Multiplayer: party members on different maps, trading, the arena in co-op, and a server that owns characters (so saves cannot be edited to cheat).
- Things to do in Haven (the town buildings are still scenery).
