# Afterwish — Act II design: The Asker

Copy of the Act II design doc (claude.ai doc: https://claude.ai/artifact/XCN4jwAMT4hniCppxrVh4j),
kept here so future sessions read it beside the code. The claude.ai doc is the one to edit and
comment on; update this copy when it changes. Written 16 Nov 2026.

## Overview

Act II begins after the player defeats the Unmade: the wish does not end, because the thing Queen
Maren loved most, the player, is still alive. It runs from level 100 into the world tiers and ends
with the player choosing to unwish themselves, or to take Maren's place.

The theme stays the same as Act I: grief, and the cost of refusing to let go. The new antagonist is
the star itself, the Asker, which is not evil but helpful, and grants exactly what is asked.

## Lore so far (already in the game; Act II contradicts none of it)

| Thread | What the game already says | Where |
| --- | --- | --- |
| The star | Grants exactly what is asked: "Ask that nothing die, and nothing dies. It was not asked to let them stay themselves." | Dunes survey stone (Tobin) |
| The wish | "Let nothing I love be taken from me" | Frost pass flags, Sanctum |
| The child | Maren carried a feverish child up the pass and the Sanctum stair; the nurse came down with it at dawn, alone | Frost cairn, Spire marker |
| The player | The cradle's name "will not hold still… until you notice that they are yours" | Sanctum cradle |
| The nurse | The cairn is signed "W.": "I followed as far as these stones" | Frost cairn |
| Aldric | Barred the gate so the curse stayed up the mountain; still counts the gate | Keep, boss 1 (the Warden) |
| Tobin | Royal physician; tried to teach bodies to rot so they could rest; tested on himself | Fen, Hollow, boss 2 (the Gardener) |
| Odile | Tobin told her to leave and not come back | Hollow last page |
| Edric | Bram's brother; stayed behind the gate by choice | Ridge letter |
| Tomas | Pip's father; walks past Haven's door every dusk and will not come in | Greenwood note |
| The Wilds | The wish is still growing; "try not to want anything" | Wilds signs |
| Haven | "Do not go back up for the ones you left. They will not know you." | Haven notice board |

## Main quest: The Asker (Wren; Tobin's Survey from Odile; level 100, gated by world tier)

| # | Quest | Opens | Goal | Story beat |
| --- | --- | --- | --- | --- |
| 1 | W. | After Let Her Rest | Read the letter buried under the cairn on the frost pass | Act I already told you who you are. Now Wren confesses she buried Tobin's letter: the wish can be let go, and the one who has to let it go is you. |
| 2 | Under the Sand | After W., world tier II | Reach Asterfell by the Waygate (it opens once Wren has told you) | The capital is buried, not gone; the star's glass holds its streets up. |
| 3 | Tobin's Survey | After Under the Sand | Read Tobin's four survey stones in Asterfell | Tobin worked out that the wish is anchored to one person: the child. |
| 4 | The Frozen Court | After Tobin's Survey | Defeat the Herald, Maren's chamberlain, frozen mid-ceremony | The court is still holding the child's naming day. Your name is on every banner. |
| 5 | The Starwell | After The Frozen Court | Reach the Starwell under Asterfell and defeat the Asker | The star speaks. It is not cruel. It asks what you want, and means it. |
| 6 | Unwish | After The Starwell | Press an Unwishing Glass into the Starwell | The ending choice. |

**The Asker fight.** Three times the Asker offers a wish: more damage, a shield, or speed for the
rest of the fight. Each one accepted makes its last phase harder. Refusing everything makes the
early fight hardest and the end fair. Accepted wishes show as debuffs on the bar.

**Ending choice** at the Starwell:
- **Unwish yourself.** The wish loses its anchor; husks lie down; Haven's notice board changes;
  Pip's father comes home one last time. Credits, then world tiers carry on "after the wish".
- **Take her place.** You wish to keep them all; you become the next Unmade: New Game+ with
  harder enemies and your old hero as the final boss. Offered only once the first ending is seen.
  (0.43: built on Rebirth: a special rebirth that also gives Starmarks.)

Draft signs: Asterfell gate "ASTERFELL. The Queen's city. Population: all of it, still." ·
Tobin's survey "A wish needs something to hold on to. Hers holds on to the child. Find the child
and the wish can be let go. I hope I am wrong." · Starwell "Stand close and it will ask what you
want. Answer carefully. It is listening to everything you have ever wanted."

## Side stories (each ends with someone letting go; choices can't be undone)

| Story | Giver, level | What happens | Reward |
| --- | --- | --- | --- |
| Red Scarf, Part Two | Pip, 25 | Tomas is a named husk on the Greenwood road at dusk. Bring Pip his scarf (Pip learns he is gone) or leave him walking. | Keepsake; Pip's lines change for good |
| Edric's Colours | Bram, 45 | Edric stands watch among the Keep's knights (Storied). Bring his colours and sword home. | Unique Warrior weapon (own model); unique ring for others |
| An Ending for Tobin | Odile, 75 | Escort Odile to the garden's heart; she gives Tobin his ending and stays. | Her shop passes to an apprentice; a Gloomcap glow |
| Haven Grows | Wren, ongoing | Each finished side story brings someone down: a house, a lantern, a stall in Haven. | Haven fills up as you play |

## New region: Asterfell (two maps under the Dunes, by Haven's Waygate after quest 1; level 100, scales with world tier)

| Map | Look and mood | Enemies | Boss |
| --- | --- | --- | --- |
| Asterfell, the buried city | Streets held up by star-glass; amber light through the sand. Bright: a city frozen on its happiest day, banners up. | Glassbound citizens (slow, shatter into shards); Court Guards (shield block that parries back); Wishlings (buff a nearby enemy) | The Herald (Frozen Court) |
| The Starwell | Round chamber around the crater's heart; glass floor over light. | The Asker only | The Asker |

Herald (boss 4): reads the naming-day proclamation, summons Court Guards on each line, big attack
a telegraphed, parryable wave of light along the banner lines. Asker (boss 5): copies the player's
class kit at half speed, three wish offers; Remnant after three wins. Music: Asterfell a slow,
slightly out-of-tune choral waltz; the Starwell the same melody on one voice. Models: Herald and
Asker are the first enemies made with Tripo.

## Content beyond the story (Tripo credits; 385 left on 16 Nov 2026)

| Feature | What it is | Size | Credits |
| --- | --- | --- | --- |
| Asterfell delves | 3–5 room instanced dungeons, one per world tier; co-op friendly | Medium | ~60 per new enemy model |
| Weapon looks by rarity | Plain steel at Common up to a glowing Immortal blade, per class | Small | ~30 per design per class |
| Character customisation | Male and female model per class; hair and colour tints in code | Medium | ~85 per model |
| Enemy models | Bosses first, then wolves, golems, wraiths (creature rig) | Medium | 55–85 each |
| Echo-caller class | Summoner fighting beside echoes of the dead; two subclasses | Large | ~85 |
| Lore codex | Journal collects signs, enemies, NPC pages | Small | 0 |
| The Star's Echo | Co-op world boss in the Wilds; phases need several players parrying | Medium | ~85 |
| Skill animations in co-op | Friends see each other's skill animations | Small | 0 |

## Build order and status

Story first; delves next (reuse Asterfell); then side stories; a new class last (balance risk).

| # | Piece | Release | Status |
| --- | --- | --- | --- |
| 1 | Quest 1, W.: Wren's confession and the frost-pass scene | 0.39 | Done |
| 2 | Asterfell map, enemies, Waygate entry (quest 2) | 0.39 | Done |
| 3 | Tobin's survey stones and Asterfell signs (quest 3) | 0.39 | Done |
| 4 | The Herald, boss 4 (quest 4) | 0.40 | Done |
| 5 | The Starwell, the Asker and its wish offers (quest 5) | 0.40 | Done |
| 5d | Late-game balance, gear rolls, Rebirth (added) | 0.43 | Done |
| 5e | Enemies and bosses remade: kits, boss lines, Tripo models (added) | 0.44 | Done |
| 6 | Unwish: the ending choice (quest 6); Take her place as a special rebirth | 0.45 | Done |
| 7 | Asterfell delves | 0.46 | Done |
| 8 | Side stories: Tomas, Edric, Tobin, Haven grows | 0.47 | Not started |
| 9 | Weapon looks by rarity, customisation, enemy models | Later | Not started |
| 10 | Echo-caller class, the Star's Echo | Later | Not started |

## Implementation notes (for future sessions)

- 0.39: quests `w`, `sand`, `survey` (src/sim/story.js); signs `frost3`, `aster1`–`aster6`;
  map `asterfell` (src/sim/maps.js: `fromTier: 2`, `unlock: 'w'`, houses on two street rings);
  enemies `glassbound` (`shatter`), `courtguard` (`shield`), `wishling` (`grants`) in
  src/sim/defs.js, handled in src/sim/world.js; theme `glass` (environment.js, renderer.js
  MAP_THEMES, mood `amber`), song `asterfell` (src/music/songs.js). Quest goals `{ sign }` and
  `{ signs, what }` added. Tests: "Act II" block in test/sim.test.mjs.
- 0.40: quests `court` and `starwell`; boss `herald` in Asterfell (`herald: {every, guards, max,
  hp, dmg}`: `stepHerald` in world.js, called from `stepDoom`, summons `heraldguard`, emits
  `proclaim` with a line from HERALD_LINES; guards die with him). Map `starwell` (`bossOnly`,
  `unlock: 'court'`, song `starwell`) with boss `asker` (`asker: {at, time, last}`): `askerCheck`
  opens offers (invulnerable while `offerT > 0`), `askerAnswer` / command `askerAnswer` applies
  `p.wished` (power, shield as ward, speed in recalcStats) or a refusal (`refuseMult`); silence
  at the timeout counts as a refusal; `clearWishes` on its death and on loadMap. UI: `#asker-offer`
  panel in index.html, keys 1–4 in main.js.
- 0.41 (not in the original plan): the world rebuilt. Each theme's species, edge, pools and
  ground cover are in src/render/biomes.js (BIOMES), the shapes in src/render/species.js, the
  ground mask (paths, pools, the Wilds' seams) in environment.js `groundMask`, Tripo landmarks
  in src/render/props.js. The Wilds draw as their own look, `shattered` (`lookOf`).
- 0.42 (added): Archer and Rogue rework (Sharpshooter Ricochet / Steady Breath / one-shot
  Deadeye, Windrunner Skirmish Step, Reflective mirrors, Assassin numbers, the ninja model).
- 0.43 (added): Overflow for Warrior and Mage (`passive.overflow`, `rawCooldown`/`overflowMult`
  in world.js), subclass hooks (`spinTempo`, `ironWeight`, `burnCrit`/`burnHaste`, `frostHaste`,
  `crosswind`), value-only rerolls with roll quality (`rerollCost`, `statRange`, `rollQuality`,
  `rollTier` in items.js), reforging by choice, and Rebirth (src/sim/rebirth.js: Starmarks,
  `PERKS`, `rebirthSave`; `p.rebirth.past` keeps each life for the second ending).
- Rebirth and the ending: Rebirth unlocks after The Unmade (Act I's end), so it never needs Act II.
  A reborn hero replays the story, and Act II quests are gated on level 100 as before. *Take her
  place* (0.44) should be a rebirth with extras: call `rebirthSave` and add the NG+ flags, and
  use `rebirth.past` (level, spec, Wishborne) for the old hero as the final boss.
- 0.44 (added): enemy kits in src/sim/defs.js (KITS; bosses below it), picked by `pickFromKit` in
  world.js; shapes ring / beam (cross) / call; extras pool, seek, around, blink, chill, summon, heal.
  Boss lines: BOSS_LINES in story.js (`bossLine`). Rigged creatures: src/render/creatures.js
  (CREATURES, PEOPLE, SHIPPED), models from tools/models/roster.json (b_*, e_*, n_*), clips merged by
  tools/models/merge-all.mjs.
- 0.45: quest `unwish` (goal `{ ending: 1 }`, `give: { glass: 1 }`), command `unwish` (`self` / `place`),
  `p.endings`, NPC `tomas` (`onlyAfter`), NPC and sign `after` text, CREDITS and WELL in story.js.
  New Game+: `rebirth.ng`, enemies x(1 + 0.33 ng) health and x(1 + 0.2 ng) damage, the Unmade's
  `oldCls` / `kitDef` from OLD_SELVES (defs.js), drawn with your old hero's model.
- 0.46: delves. `enterDelve` / `delveSpawn` / `stepDelve` in world.js, rooms from `buildDelveRoom` and
  DELVE_ROOMS / `delveRoute` in maps.js; the stair is an obstacle of kind `delve` in Asterfell; `instanced()`
  keeps world events, chests and altars out of rifts and delves; friends rebuild the room from the snapshot.
- Next (0.47): side stories (Red Scarf Part Two, Edric's Colours, An Ending for Tobin, Haven Grows).
