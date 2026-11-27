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
| Who you play | One Lacuna hero per account; one class at a time, swapped freely like FFXIV, each class levelling on its own (8, from the 8 subclasses, rebuilt for first person) |
| Hero's look | Young (a teenager); character creator from free modular parts; Tripo only where nothing free will do |
| Feel | Above all a free world to roam with friends, with plenty of gameplay |
| Old world | Votum; the Primordials grew from desire and malice (Animus stays the resisting will) |
| Names | Chosen by Claude (working): kingdom Solenne, first town Sunmere, rescuers the Iron Hounds (renamed from the Marigold Company in 0.99.19: gunmetal and crimson, a hound's-head badge; Rowan, leader; Ilse, healer; Juni, scout; Sorrel, mage; all adults), secret service the Gloamwatch, movement the Unbound |
| View | Over the shoulder; true first-person aim where a class needs it (Sharpshooter scope) |
| World | One seamless land shared per server; quest bosses in the party's own copy |
| Power | Magic and mana; Dimension Link for players who owned Eternal gear |
| Crossing over | Eternal gear stays behind; large buffs scaling with Eternal gear levels instead (no starting gear to discard) |
| Difficulty | Enemies tuned for Eternal level 10 in every slot |
| Level | Lumen, per account |
| Opens | After every Caelum boss |
| Story | New: mystery, exploration, the new world's politics; no ending |
| Tone | More cheerful than Chapter 1, with mystery |

## The fall of Votum (prequel, agreed 26 Nov 2026)

Rule: in Votum, what people want hard enough comes true, good or bad. Wish magic comes from the fallen star; a few
can ask it directly.
1. Generations of desire and malice grow the Primordials; a few drink from them and become the Granted.
2. Queen Maren, who loves all her people and has the greatest wish aptitude ever born, protects the last bright
   kingdom from the Granted, beasts and other kingdoms; years of peace.
3. The Granted feed her officials' greed and jealousy on purpose; the officials want the succession, and their
   wanting, aimed at the heir, makes the child sick (common people's small ingratitude adds; the poison is the court's).
4. Maren's wish to the star: "Let nothing I love be taken from me." The child becomes the pinnacle of wishes,
   growing without limit by living several timelines at once unknowingly (the four classes).
5. The child, sick with malice, cannot hold the power; it bursts out. It would kill everyone, but the wish forbids
   anyone she loves being taken; she loved all of them, so they become husks.
6. The wish keeps the child as they were (nothing taken, not even time): the hero wakes years later, young, knowing nothing.
7. Chapter 1 to its end: across their lives the hero breaks the wish, goes down to the Primordials, up to the
   Granted who poisoned the court, takes their power, keeps the Wishkeep.
Split rules: each life grows on its own (classes); lives feel each other (borrowed skills); the portal hero is one
more life (Dimension Link = the pull between them). Told in Ysolde's chapters and one flashback cutscene in Lacuna.

## The bridge

1. Prequel (told in Chapter 1): the Primordials grew over generations from desire and malice (proposed wording;
   "animus" clashes with the Mastery stat Animus), until they ruined the old world. A few profited most and made
   themselves gods: the Granted of Caelum.
2. End of Chapter 1: the hero (high affinity for wishes, the old world's magic) defeats the Granted, takes their
   power, becomes almighty and cares for those returned from the curse: the Wishkeep.
3. (revised 27 Nov) A crack opens on the Verge. For weeks it only whispers; one night it pulls, like a hook behind the
   ribs, and the hero walks into it without deciding to. Nothing is chased. The crossing tears his power out of him.
4. Two timelines: the Wishkeep stays playable but the story treats it as the past (flashback); Lacuna is now.
Old world: Votum.

## Lacuna, the world

Sunny, busy, magic is ordinary. Everyone's element and magic aptitude are fixed at birth (read by the Guild's Telling Glass); people only refine
technique; rank and work follow the number: the politics. Working factions: the Crown and council (aptitude as
law), the Adventurers' Guild (your first home), the secret service (recruits you at the end of Act I), a rising
movement to break the aptitude limit (feeding magic on desire and malice: the old tragedy beginning again).
The hero is an anomaly (the glass reads almost nothing, yet skills grow and get cheaper).

## Act I story

Opening: a MapleStory-style playable cutscene (prompts to dodge, struggle, reach); woken in a forest, attacked by
beasts, saved by a party of four adventurers (leader, healer, scout, mage). (0.99.22) Split into short scenes with
play between: the pull and waking; stumbling out of the glade; the wolves and the rescue; the tear and a name.

### Story decisions (Ko Ko, 27 Nov 2026)

- **The hero arrives small and broken.** A young child (about 1 m in game; the wish kept him as he was), in rags,
  no weapon: fists until Rowan hands him a blade at the trial. Small on purpose: vulnerable, someone to look after.
  The older hero models are kept for later.
- **Partial amnesia.** The crossing ripped his power out of him and most of his memory with it. A white fog at the
  edge of sight is its sign; it thins as the days go by. Memories surface as brief white flashes (a keep of white
  stone, a name being called, "keep it safe"). The struggle to remember is a thread through the story.
- **Weak, then stronger.** He starts fragile (walks, cannot run at first) and grows stronger physically in the days
  with the Hounds before the Telling.
- **Slower pacing.** Days with the Iron Hounds between the rescue and the Guild: chores while they look after him
  (water, firewood, herbs with Ilse, Rowan's morning run, a lesson with Sorrel), teasing, growing attached. Juni names
  him Sprout until he remembers his own name. Each scene short, play in between.
- **Mysteries to keep adding.** So far: the torn air Sorrel studies; the sliver of the tear that never quite closes;
  a scrap of white cloth threaded with gold, burned at one edge, in the grass where he woke (whose?); the Telling
  Glass's black line; the memory flashes.
- **The Telling Glass, not a crystal** (inspired by Hunter x Hunter's water divination, in sand): both hands on a
  tall glass of pale sand; the sand answers your element (a spiral for wind, embers for fire, frost climbing the
  glass for ice, a heaving column for earth) and how much answers is your aptitude. The hero: three, and no
  element. Afterwards the grains he stirred turn black and stand in a thin upright line, like the tear.
- **The Link sleeps.** No Dimension Link at the start (beasts tuned for an unlinked hero). About a year after the
  Telling, one of the Iron Hounds is killed by an enemy far beyond them; the hero's grief and determination ionise
  the wish magic of Votum still in him, and it forms the Link: the door to far stronger skills. The Hounds grieve.
  (0.99.26, decided by Claude while Ko Ko was away; easy to change: **Ilse** dies, shielding him from Vesper's blow.
  Her rescue words come back as her last.) The enemy: **Vesper of the Unbound**, who had watched the tear for a year,
  put the ash in the wolves, and wants the boy who 'broke the sand'.
  (0.99.27, agreed with Ko Ko 27 Nov) Vesper is **curious, not certain**: he does not know what came through, and he
  wants the body to study, not the boy. His blow is meant to kill; Ilse takes it, so it must not be for nothing:
  **the hero kills Vesper** in the awakening fight. Arrogant to the end ("nothing in this world can touch me"), he
  does not run. **The tear is no door**: it tore the hero's prime out of him, and no villain uses it as a way out.
  Weeks later **Thessaly of the Ninth Hand** (the crown's hand that is in no ledger: a shadow arm of the government,
  fantasy dress, not a modern agency) tells them, hedged, what little is known: Vesper (Ashgrave) was probably a
  high-ranking officer of the Unbound, who want to call the Primordials into this world so their members rise as the
  gifted (the Granted) did in Votum, bringing chaos to Lacuna. Names kept apart: no more Marens.
- **Nobody is sure, and everyone is curious.** The Hounds hedge (Ilse cannot explain his memory, his slow healing,
  why he does not grow). They do not take him in at once: they ask the watch, the temple, the records hall and the
  Guild's board for his family for five days first. Then they keep him, and the chores begin. They are proud of him:
  he is strong for his size, and he copies any technique after seeing it once (the trials show it).

| # | Quest | Goal | Beat |
| --- | --- | --- | --- |
| 1 | Waking Up | Survive; follow rescuers to town | Meet the party |
| 1a | Someone Must Be Looking | Five days asking after his family | Nobody comes; they keep him (0.99.27) |
| 1b | Days with the Hounds | Three days of chores while they look after you | Growing stronger; teasing; attachment; Sorrel's lesson (0.99.24) |
| 2 | The Telling Glass | Element and aptitude read at the Guild | Three, no element: pity and laughter; the black line |
| 3 | Choosing a Path | Train; pick a class | The world and its magic; class trial |
| 4 | When It Counts | A year on: ashen wolves; Vesper of the Unbound | Ilse dies taking the blow meant to kill him; grief wakes the Link; the hero kills Vesper; Thessaly of the Ninth Hand (0.99.27) |
| 5 | Word Gets Around | Three contracts across the land (a walking cairn, Brightwater's thornhogs, the east road's wolves) | All ashen; the ash sites ring Sunmere; Guild rank E by deeds, not the glass; Thessaly watching (0.99.29) |
| 6 | An Invitation | A secret mission, watched | The Ninth Hand asks you to join. End of Act I |

## Power

Mana pays for skills (small pool). Technique = skill rank (all natives can raise). **Dimension Link** (owned
Eternal gear): a second resource; upgrading a skill with it raises power and lowers mana cost. **Crossing buffs**:
health, damage, mana, scaling with Eternal gear levels: each slot counts once at its highest level across all
classes (1–30); enemies balanced at 10 in every slot, diminishing returns above. **Lumen**: account-wide Lacuna level.

## Classes (working names)

Berserker (leaps where you look; harder when hurt), Bulwark (shield blocks the cone you face; taunts),
Sharpshooter (right-click scope to first person; snipe ultimate is main damage), Windrunner (shoots on the move;
dashes, wind jumps), Assassin (strikes from behind count; marks), Shadowdancer (blinks between shadows; decoys),
Pyromancer (aimed fireballs, burning ground), Frostbinder (ice walls where you aim; freezes). Slice: two classes,
Sharpshooter + Berserker (decided 26 Nov 2026).

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
   Status (0.99.11): built as a test page, `lacuna.html` (src/lacuna). Sync measured at ~2–3 KB/s per player (nine players); fps to be checked on Ko Ko's laptop. (0.99.12) The server world runs the land (`/lacuna`, room.js): one shared land, players move in their own browser and the server checks them, beasts run on the server, chat. Still to do: area splitting when one land is not enough.
2. Opening slice: cutscene player, forest, first town, quests 1–4, 2 classes, mana, Link. Gate: testers find it fun.
   Status (0.99.13): combat in: health, mana, Berserker and Sharpshooter kits, beasts that fight and respawn, going down, the Dimension Link (server reads the account's Eternal gear). (0.99.17) The cutscene player, the opening scene, the Marigold Company (Tripo, 380 credits) and Quest 1 (Waking Up) are in. (0.99.19) The Company remade as the Iron Hounds; emotes and emoticons. (0.99.20) Quest 2 The Crystal: the Guild hall and its crystal on Sunmere's plaza, Magistra Odile, the Silver Sash rivals Dace and Wren; the hero reads three, and an ember stays in the crystal (the anomaly, seeded). (0.99.21) The two classes rebuilt round mana, keeping their Afterwish feel: the Berserker small-pooled, Battle Rhythm on Cleave, the Blood Price (health pays what mana lacks), Bloodied, held Whirlwind, Skyfall, Crimson Oath (blood to mana); the Sharpshooter deep-pooled, steady breath (still: faster mana), Long Watch, Steady Aim, Ricochet, Evasive Roll, held Deadeye (mana poured in, Mark and Pin). Quest 3: the Hounds' training ground east of town, Rowan's and Juni's trials, the path chosen. Next: Quest 4 (the ambush: the Link wakes), Lumen.
3. All of Act I: 8 classes, quests 5–6, factions, more NPCs, Lumen and buffs tuned.
4. Live updates, ongoing: Act II and beyond, new regions, new combat systems, events.
Tripo: ~3,090 credits (topped up 26 Nov); kept small: ~15–25 models for Act I (beasts, bosses, key characters); hero looks and townsfolk from a modular character creator (free parts); cost shown before each batch. Environment: CC0 packs.

## Entrance

The crack in the air on the Verge (off the Wishkeep): it hums now; it widens once all four Granted have fallen;
it opens into Lacuna when Chapter 2 is ready. (Its cause, likely the Granted's fall, is for later content.)

## Open questions

- None open. (Slice classes: Sharpshooter + Berserker, decided 26 Nov.)
- Answered 26 Nov: free roam with friends first; one class at a time, FFXIV-style swap; creator from free parts, minimal Tripo; names by Claude; Votum; desire and malice; younger hero (no bold designs on the hero or player outfits).
