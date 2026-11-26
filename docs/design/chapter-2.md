# Afterwish — Chapter 2, Act I: Lacuna

Copy of the design doc (claude.ai doc: https://claude.ai/artifact/LUtjeLny7XvXosJg5oFGC3), kept here so future
sessions read it beside the code. The claude.ai doc is the one to edit and comment on; update this copy when it
changes. Rewritten 26 Nov 2026 from Ko Ko's second round (the first draft, "Act IV: The Lacuna", a wish-land
beyond the keep's gate, was dropped). Status: proposed; engine phase may start; open questions below.

## Overview

A husk runs through a portal; the hero follows and wakes powerless, in a younger (young adult, ~18) body, in
Lacuna: a bright, living world with its own magic, politics and mysteries. Over the shoulder, one hero per
account, one seamless shared land full of people, story told through playable cutscenes. The feel: an open
adventure world (Roblox / Minecraft spirit) with Afterwish's classes and scaling. No ending: ongoing updates.
Opens after every Caelum boss is beaten; hard from the first fight even in full Eternal gear.

## Decisions (Ko Ko, 26 Nov 2026)

| Question | Decision |
| --- | --- |
| Who you play | One Lacuna hero per account; class chosen in Lacuna (8, from the 8 subclasses, rebuilt for first person) |
| View | Over the shoulder; true first-person aim where a class needs it (Sharpshooter scope) |
| World | One seamless land shared per server; quest bosses in the party's own copy |
| Power | Magic and mana; Dimension Link for players who owned Eternal gear |
| Crossing over | Eternal gear stays behind; large buffs scaling with Eternal gear levels instead (no starting gear to discard) |
| Difficulty | Enemies tuned for Eternal level 10 in every slot |
| Level | Lumen, per account |
| Opens | After every Caelum boss |
| Story | New: mystery, exploration, the new world's politics; no ending |
| Tone | More cheerful than Chapter 1, with mystery |

## The bridge

1. Prequel (told in Chapter 1): the Primordials grew over generations from desire and malice (proposed wording;
   "animus" clashes with the Mastery stat Animus), until they ruined the old world. A few profited most and made
   themselves gods: the Granted of Caelum.
2. End of Chapter 1: the hero (high affinity for wishes, the old world's magic) defeats the Granted, takes their
   power, becomes almighty and cares for those returned from the curse: the Wishkeep.
3. A portal opens; a husk runs through; the hero chases it into Lacuna.
4. Two timelines: the Wishkeep stays playable but the story treats it as the past (flashback); Lacuna is now.
Old world's name: open (Votum recommended; Optatum; Cupido).

## Lacuna, the world

Sunny, busy, magic is ordinary. Everyone's magic aptitude is fixed at birth (read by crystal); people only refine
technique; rank and work follow the number: the politics. Working factions: the Crown and council (aptitude as
law), the Adventurers' Guild (your first home), the secret service (recruits you at the end of Act I), a rising
movement to break the aptitude limit (feeding magic on desire and malice: the old tragedy beginning again).
The hero is an anomaly (crystal reads almost nothing, yet skills grow and get cheaper); the husk is somewhere here.

## Act I story

Opening: a MapleStory-style playable cutscene (prompts to dodge, struggle, reach); woken in a forest, attacked by
beasts, saved by a party of four adventurers (leader, healer, scout, mage).

| # | Quest | Goal | Beat |
| --- | --- | --- | --- |
| 1 | Waking Up | Survive; follow rescuers to town | Meet the party |
| 2 | The Crystal | Aptitude read at the Guild | Barely glows: pity and laughter |
| 3 | Choosing a Path | Train; pick a class | The world and its magic; class trial |
| 4 | When It Counts | A beast far beyond the party ambushes them | You unlock skills you should not have and save them |
| 5 | Word Gets Around | Bigger hunts across the land | Guild ranks; strange beasts point to the movement |
| 6 | An Invitation | A secret mission, watched | The secret service asks you to join. End of Act I |

## Power

Mana pays for skills (small pool). Technique = skill rank (all natives can raise). **Dimension Link** (owned
Eternal gear): a second resource; upgrading a skill with it raises power and lowers mana cost. **Crossing buffs**:
health, damage, mana, scaling with Eternal gear levels: each slot counts once at its highest level across all
classes (1–30); enemies balanced at 10 in every slot, diminishing returns above. **Lumen**: account-wide Lacuna level.

## Classes (working names)

Berserker (leaps where you look; harder when hurt), Bulwark (shield blocks the cone you face; taunts),
Sharpshooter (right-click scope to first person; snipe ultimate is main damage), Windrunner (shoots on the move;
dashes, wind jumps), Assassin (strikes from behind count; marks), Shadowdancer (blinks between shadows; decoys),
Pyromancer (aimed fireballs, burning ground), Frostbinder (ice walls where you aim; freezes). Slice: two classes
(proposed Sharpshooter + Berserker).

## A living world

Townsfolk on routines, travellers, adventurers, patrols; the party travels and talks with you through Act I;
in-engine skippable cutscenes with prompts; things to do between quests. Character art: bolder designs (fitted
outfits, cleavage, midriffs, shirtless fighters with abs, range of body types) — adults only (anyone who looks
under 18 dresses ordinarily; the hero's younger body is a young adult), stylish not explicit (gacha level, never
nudity); test Tripo's prompt limits and the store rating early.

## Technology

64 m chunks streamed (~150 m drawn, haze); spatial hash for collisions, path grids per chunk; enemies sleep away
from players; townsfolk crowds run client-side with distance LOD (only named NPCs in the sim); server interest
management and area splitting; a data-driven cutscene player; background loading. Flat ground first. Targets:
60 fps mid-range laptop, under 20 KB/s per player.

## Build order

1. Engine: 512 m test land, streaming, sleeping enemies, NPC crowds, sync. Gate: 60 fps, under 20 KB/s.
2. Opening slice: cutscene player, forest, first town, quests 1–4, 2 classes, mana, Link. Gate: testers find it fun.
3. All of Act I: 8 classes, quests 5–6, factions, more NPCs, Lumen and buffs tuned.
4. Live updates, ongoing: Act II and beyond, new regions, new combat systems, events.
Tripo: ~3,090 credits (topped up 26 Nov); Act I ~40–60 models; cost shown before each batch. Environment: CC0 packs.

## Open questions

- "Like Roblox or Minecraft": building/housing, gathering/crafting, minigames/social, or a free world to roam?
- One class or all eight on the shared hero (separate skill levels per class)?
- Character creator, or set looks per class?
- The old world's name; desire-and-malice wording; the slice's two classes.
- Names: the party, first town, kingdom, secret service, movement.
- Bold designs for NPCs only or player outfits too; a setting to tone them down?
