# Automated playtests (1.1.4)

Three checks that play or inspect the game in headless Chromium, so the bugs players notice are caught before
they do. They run on GitHub after every push (the quick two) and every night (all three): see
`.github/workflows/playtest.yml`. Each run keeps its reports and screenshots as the `playtest-report` artifact,
writes its findings to the run's summary, and (nightly or from the Actions tab) posts anything bad to the
**Playtest report** issue.

Every check writes `report.md` (the findings), `report.json` and, where it has screenshots, `report.html`
(open it to look through them). The exit code is 1 when anything is `bad`.

## The animation checker: `python3 tools/animcheck/run.py [out] [model ids...]`

Loads every rigged model the games use and plays every clip at a fixed step (so a slow machine sees what a fast
one does). It flags:

| check | what a player sees |
|---|---|
| `missing` | an enemy with no idle, walk, attack, hurt or fall clip |
| `sink` / `float` | feet in the ground, or a walk that hovers |
| `slide` | a walk played at the game's speed whose planted feet glide or skid |
| `seam` | a looping clip that pops each time it loops |
| `cross` | legs passing through each other |
| `bend` | a joint folded back on itself (a paw curled the wrong way) |
| `still` | a walk whose legs barely move |
| `tear` | the skin bursting off its bones (shards, spikes: broken skin weights) |
| `nan` | a bone gone to NaN (the body vanishes) |

Each finding worth a look gets a strip of eight frames from the side, with the ground drawn in.
Findings looked at and accepted go in `tools/animcheck/known.json` (`{ "model", "clip" (or "*"), "check", "why" }`):
still listed, no longer counted.

## The Lacuna story bot: `python3 tools/playtest/lacuna_story.py [out] [--from STAGE] [--until STAGE]`

Plays Lacuna's story from the first scene to the end of Act I as a player would: follows the quest marker, presses
F at what can be used, reads every line (and screenshots it), fights what the story sends at it. It flags errors,
a quest that does not move on, the hero unable to walk on toward the quest, a line with no speaker's name,
`undefined`/`NaN` on screen, one of the cast inside a tree or a rock or a house, two of the cast inside each other,
and windows that will not close. `report.html` shows every line of the story as it was on screen.

## The main game's menu bot: `python3 tools/playtest/main_menus.py [out]`

Goes to every map, stands on every Waygate, waystone and crossing, talks to everyone and opens every window. It
flags a menu with nowhere to go, an empty conversation, a window that will not close, `undefined` on screen, and
any error.

## The quadruped gait generator: `node tools/models/gait.mjs in.glb out.glb`

Not a check, but it fixes what the checker found worst: Tripo's four-legged walks. It writes a natural `walk`
(lateral sequence) and `trot` (diagonal pairs) onto a Tripo quadruped rig with planted feet and inverse
kinematics; the game plays them at exactly the speed the body moves (see `stepSpeed` in `src/render/rigged.js`).
Used for the wolf and the thornhog. Since 1.1.5 it also writes an `idle`, an `attack_bite` (strike at 45%) and a
`fall` for them, the same way.

## What the checker cannot fix by itself

Torn skin (`tear`) is in the model's own skin weights: a cape or a gown weighted to the legs stretches into shards.
Copying the weights of the nearest good vertex was tried (1.1.5) and made the Mourner worse, so these need the model
re-rigged or remade (Tripo, or by hand in Blender). A walk too short in stride for its speed (`slide`, "it glides")
needs a run clip (Tripo can add a preset run to a model already rigged: `fromRig` in tools/models/roster.json).
