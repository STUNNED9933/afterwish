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
| Space (or F) | Parry. Press it when an enemy flashes white |
| Q W E R | Cleave, Whirlwind (level 2), Lunge (level 3), Skyfall (level 6) |
| Shift + Q/W/E/R | Spend a skill point to rank that ability up (or click the + above it) |
| 1 2 3 | Pick an augment when three are offered |
| 1 (or D) | Health potion |
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
  the bottom of its range and those by the far portal at the top. EXP per kill
  and EXP per level both grow, so fighting enemies around your own level is
  always the quickest way up. `EXP_PACE` in `src/config.js` makes the whole
  climb longer or shorter.
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

- **Talk and read with G.** Stand next to a person or a sign and a prompt
  appears. `!` over someone's head means they have a quest for you, `?` means
  you can hand one in. Unread signs are marked on the map and minimap.
- **Elder Wren** gives the main story, ten quests from the first step outside
  to The Unmade. **Bram** the smith, **Sister Odile** and **Pip** have side
  quests tied to the map you are on; each of them lost someone up the mountain.
- **Rewards** are sized to the quest's level: EXP (most side quests pay about
  a level's worth), gold, scrap, keys, skill points and a piece of gear of a
  stated rarity. The story quests for the three bosses pay Legendary, Mythic
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
| The Warden (40) | 3, Rare or better | Epic+, 12% Mythic or better | 1 | guaranteed Legendary |
| The Mycelord (70) | 4, Epic or better | Legendary+, 38% Mythic or better | 2 | guaranteed Mythic |
| The Unmade (100) | 6, Epic or better | Legendary+, 15% Immortal | 3 | guaranteed Immortal |

They also drop six times a normal enemy's gold for their level, two and a half
times the EXP, arena tickets, and two skill points the first time. The numbers
are `BOSS_LOOT` in `src/sim/story.js` and `BOSS_GOLD` / `BOSS_EXP` in
`src/config.js`.

### Subclasses and talents (added in 0.9)

At level 15 press **T** and choose one of two subclasses for your class:

| Class | Subclass | Plays like |
| --- | --- | --- |
| Warrior | **Berserker** | Fast swings, lifesteal, more damage below half health, a Cleave that resets on kills |
| Warrior | **Bulwark** | Longer parry window, riposte, armor, heals on perfect parries |
| Archer | **Sharpshooter** | Crit chance and crit damage, a harder Piercing Shot that marks targets |
| Archer | **Windrunner** | Move and attack speed, shorter Tumble, longer Arrow Storm |
| Rogue | **Assassin** | Crits, brutal Backstabs, a Death Mark that resets on a kill |
| Rogue | **Shadowdancer** | Speed, lifesteal, bleeds, a Shadowstep that is nearly always ready |
| Mage | **Pyromancer** | Bigger burning Fire Bolts, a Meteor that erupts twice |
| Mage | **Frostbinder** | Health, armor, a Frost Nova that freezes, damage reduction |

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
| Warrior | Melee, the toughest | Cleave | Whirlwind | Lunge | Skyfall |
| Archer | Ranged basic attacks; every third one crits | Piercing Shot | Volley | Tumble | Arrow Storm |
| Rogue | Fast melee burst; Backstab hits 60% harder from behind or on a stunned enemy | Backstab | Fan of Knives | Shadowstep | Death Mark |
| Mage | Weak basics, strong ranged spells, +20 ability haste | Fire Bolt | Frost Nova | Blink | Meteor |

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
leap, line, bolt, strike, zone, meteor) plus numbers, so a new ability or a
whole new class is mostly data. The Warrior has hand-written augments; the
other classes get a generated set (more damage and shorter cooldown per
ability) plus the shared parry and hero augments.

### The loop (added in 0.2)

- **Perfect parry** slows every enemy and enemy projectile to 30% speed for
  1.2 seconds. You keep full speed.
- **Perfect dodge**: Lunge through an attack and its cooldown drops to half a
  second. Lunge's base cooldown is 9 seconds, so dodging well is what makes it
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

## Share it with friends

Two options, neither of which triggers a virus warning:

1. Send them the two files in `dist/` (`index.html` and `game.js`, keep them
   together in one folder). They double-click `index.html`.
2. Put the `dist/` folder on any static web host (GitHub Pages and itch.io are
   both free) and send the link.

Saves live in each player's own browser.

## Change the game

You need [Node.js](https://nodejs.org) 18 or newer.

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
