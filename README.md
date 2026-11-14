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
| Q W E R | Cleave, Whirlwind (level 2), Breakthrough (level 3), Skyfall (level 6) |
| Ctrl or Shift + Q/W/E/R | Spend a skill point to rank that ability up (or click the + above it) |
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
  pieces and refill your potions; **radiant** ones (about 1 in 20) a
  Legendary or better, with a 12% chance of an **Immortal**, plus a starglass
  shard. An opened chest comes back somewhere else on the map after 2.5
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
