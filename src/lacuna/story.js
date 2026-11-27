// Lacuna (Chapter 2), Act I: the opening, Quest 1 "Waking Up" and Quest 2 "The Crystal". Played in this browser (the scene and the
// Company walking you to town are yours alone, even on the shared land). Progress is kept in this browser for
// now (STORY_KEY); with accounts it moves to the server.
//
// The opening: the crack on the Verge opens, a husk runs into it, the hero follows; wakes in a glade in the
// Wakewood, powerless; wolves; the Iron Hounds (Rowan, Ilse, Juni, Sorrel) cut them down. Then they walk
// the hero along the road to Sunmere, talking on the way, waiting if the hero falls behind.
import { GLADE, TOWN, CRYSTAL, TRAINING, WELL, townHouses, roadDist } from './land.js';
import { separate } from './actor.js';

export const STORY_KEY = 'lacuna-story-v1';
export const QUESTS = {
  stumble: { name: 'Waking Up', goal: 'Find a way out of the glade' },
  rescued: { name: 'Waking Up', goal: 'Sorrel is studying the crack. Go and see.' },
  waking: { name: 'Waking Up', goal: 'Follow the Iron Hounds to Sunmere' },
  asking: { name: 'Someone Must Be Looking', goal: 'The Iron Hounds are asking round Sunmere for your family' },
  days: { name: 'Days with the Hounds', goal: 'Get your strength back' },
  crystal: { name: 'The Telling Glass', goal: 'Meet the Iron Hounds at the Adventurers\' Guild, on the north side of the plaza' },
  path: { name: 'Choosing a Path', goal: 'Meet the Iron Hounds at their training ground, outside Sunmere\'s east gate' },
  ambush: { name: 'When It Counts', goal: 'Rowan wants a word (the training ground)' },
  hunt: { name: 'When It Counts', goal: 'Hunt the ashen wolves in the Wakewood, near the glade where they found you' },
  mourning: { name: 'Word Gets Around', goal: 'The Iron Hounds go on, three of them now. (the next part of the story is coming)' },
};
export function loadStory() {
  try { return JSON.parse(localStorage.getItem(STORY_KEY) || 'null') || { stage: 'new' }; } catch (err) { return { stage: 'new' }; }
}
export function saveStory(s) {
  try { localStorage.setItem(STORY_KEY, JSON.stringify(s)); } catch (err) { /* private window: kept for this visit */ }
}

const H = { x: GLADE.x, z: GLADE.z + 2 }; // where the hero lies
const TEAR = { x: GLADE.x + 1.2, z: GLADE.z - 2.5 };
const roadZ = (x) => 7 * Math.sin(x / 37);
export const ROAD_IN = { x: GLADE.x + 6, z: roadZ(GLADE.x + 6) }; // where the Company comes down from the road

// ---- the opening (0.99.22): three short scenes, with walking in between
// The hero did not chase anything through: the crack pulled him in, and tore what he was out of him on the way.
// He wakes with most of his memory gone and a white fog at the edge of everything (it thins as the days go by).
export const KEEPSAKE = { x: H.x + 3.6, z: H.z - 2.2 }; // something in the grass by where he woke
const toRoad = Math.atan2(ROAD_IN.z - H.z, ROAD_IN.x - H.x);
export const GLADE_EDGE = { x: H.x + Math.cos(toRoad) * 10, z: H.z + Math.sin(toRoad) * 10 }; // where the trees begin, toward the road
export { TEAR };

/** Scene 1, the pull: the cards, then waking in the fog, and getting up. a.ctx.rift: the tear (close(), its state). */
export async function openingPull(a) {
  a.bars(true);
  await a.fade(1, 0);
  a.fog(0.95, 0);
  a.hero(H.x, H.z, -Math.PI / 2 + 0.4, 'lie');
  a.ctx.rift.open();
  await a.card([
    'Votum. The Verge, where the keep\'s road ends.',
    'For weeks the crack in the air had only whispered.',
    'That night it pulled. Not at your arm, or your clothes: at something underneath them, like a hook set behind the ribs.',
    'You walked into it. You don\'t remember deciding to.',
    'Then it took hold of everything you were, and pulled.',
  ]);
  // waking: low in the grass, everything white at the edges
  a.blur(9);
  await a.camera([H.x + 1.4, 0.45, H.z + 0.9], [H.x - 0.2, 0.25, H.z], 0);
  await a.fade(0, 2.6);
  await a.say('', '...Grass. Warm grass.');
  await a.flash('A keep of white stone. Someone calling a name, over and over. Yours?');
  await a.say('', 'You had a name a moment ago. You can feel the shape of where it was.');
  a.blur(5, 2);
  a.fog(0.8, 3);
  await a.camera([H.x + 1.6, 0.7, H.z + 1.4], [TEAR.x, 2.6, TEAR.z], 3);
  await a.say('', 'Above you the air is split open: black, and crawling with pale light. And it is closing.');
  a.ctx.rift.close();
  a.shake(0.2, 0.5);
  await a.wait(0.8);
  await a.prompt('Space', 'Get up', { times: 4, onTap: () => { a.shake(0.12, 0.2); } });
  a.blur(0, 1.6);
  a.hero(undefined, undefined, -Math.PI / 2 + 0.4, 'rise');
  await a.camera([H.x + 3.2, 1.9, H.z + 4.2], [H.x, 1.2, H.z], 1.8);
  await a.say('', 'Your legs barely hold you. A forest you have never seen; a sky so blue it looks painted; and a white fog at the edge of everything that will not clear.');
  a.fog(0.7, 2);
  await a.fade(1, 0.5);
  a.bars(false);
}

/** Scene 2, the wolves and the rescue, wherever the hero has got to (`at`). */
export async function openingWolves(a, at) {
  const { fx } = a;
  const W = { x: at.x, z: at.z };
  a.bars(true);
  a.fog(0.7, 0);
  // the wolves come from the deep wood, the side away from the road
  const away = Math.atan2(W.z - ROAD_IN.z, W.x - ROAD_IN.x);
  const out = (d, side) => [W.x + Math.cos(away) * d - Math.sin(away) * side, W.z + Math.sin(away) * d + Math.cos(away) * side];
  const wolves = [a.actor('wolf1', ...out(14, -4)), a.actor('wolf2', ...out(13, 6)), a.actor('wolf3', ...out(16, 1))];
  wolves.forEach((w) => w.face(W.x, W.z));
  a.hero(W.x, W.z, away);
  await a.camera([W.x - Math.cos(away) * 4 + 1, 2.2, W.z - Math.sin(away) * 4 + 1], [W.x + Math.cos(away) * 6, 0.9, W.z + Math.sin(away) * 6], 0);
  await a.fade(0, 0.8);
  await a.say('', 'Something growls in the trees.');
  await Promise.all([a.walk('wolf1', ...out(6, -3)), a.walk('wolf2', ...out(5, 4)), a.walk('wolf3', ...out(7, 1))]);
  a.watch('wolf3');
  wolves.forEach((w) => w.face(W.x, W.z));
  await a.say('', 'You reach for something: a blade, a word, a power you are sure you had. Whatever it was, it was torn out of you on the way here.');
  await a.say('', 'Your hands are empty. They\'re shaking.');
  // the first lunge: roll away
  a.walk('wolf1', ...out(1.2, -0.8), { run: true });
  await a.wait(0.25);
  await a.prompt('KeyE', 'Roll away!', { label: 'E' });
  a.busy(true);
  const R = { x: W.x - Math.cos(away) * 3 + Math.sin(away) * 1.5, z: W.z - Math.sin(away) * 3 - Math.cos(away) * 1.5 };
  a.hero(R.x, R.z, away, 'hop');
  a.shake(0.1, 0.2);
  await a.wait(0.6);
  wolves[0].face(R.x, R.z);
  // the second: too slow
  a.camera([R.x - Math.cos(away) * 8 + 4, 2.6, R.z - Math.sin(away) * 8 + 4], [R.x + Math.cos(away) * 2, 0.8, R.z + Math.sin(away) * 2], 0.5);
  a.walk('wolf2', R.x + Math.cos(away) * 1.2, R.z + Math.sin(away) * 1.2, { run: true });
  await a.wait(0.45);
  a.shake(0.35, 0.45);
  a.ctx.hurt();
  a.fog(0.95, 0.2);
  a.hero(undefined, undefined, undefined, 'land');
  await a.say('', 'Too slow. The fog rushes in.');
  a.fog(0.8, 1.5);
  await a.walk('wolf3', R.x + Math.cos(away) * 1.4, R.z + Math.sin(away) * 1.4 + 0.6, { run: true });
  // the Iron Hounds
  const juniAt = { x: R.x - Math.cos(away) * 9 + 6, z: R.z - Math.sin(away) * 9 - 4 };
  a.actor('juni', juniAt.x, juniAt.z).face(R.x, R.z);
  a.watch(null);
  a.camera([R.x - Math.cos(away) * 2 + 1.5, 2.0, R.z - Math.sin(away) * 2 + 1.5], [juniAt.x, 1.3, juniAt.z], 0.4);
  const shoot = (from, to, speed, kind) => { const d = Math.hypot(to.x - from.x, to.z - from.z) || 1; fx.shot({ x: from.x, z: from.z, dx: (to.x - from.x) / d, dz: (to.z - from.z) / d, speed, range: d, kind }); return d / speed; };
  shoot(juniAt, wolves[0], 70, 'arrow');
  await a.wait(0.35);
  fx.puff(wolves[0].x, wolves[0].z);
  a.remove('wolf1');
  await a.say('juni', 'Got one! Rowan, there\'s someone down here! A little one!');
  a.actor('rowan', juniAt.x + 2, juniAt.z + 1);
  a.draw('rowan'); // (0.99.25) drawn as he comes
  a.actor('sorrel', juniAt.x + 3, juniAt.z - 1);
  a.actor('ilse', juniAt.x + 1, juniAt.z - 1.5);
  a.camera([R.x - Math.cos(away) * 6 + 3, 2.6, R.z - Math.sin(away) * 6 + 3], [R.x, 1, R.z], 1.2);
  await a.walk('rowan', wolves[1].x + Math.cos(away) * 1.4, wolves[1].z + Math.sin(away) * 1.4, { run: true });
  a.actor('rowan').face(wolves[1].x, wolves[1].z);
  await a.anim('rowan', 'slash', { speed: 1.2 });
  fx.puff(wolves[1].x, wolves[1].z);
  a.remove('wolf2');
  a.sheathe('rowan'); // (0.99.25) put away as soon as it is done
  await a.walk('sorrel', R.x - Math.cos(away) * 5, R.z - Math.sin(away) * 5 + 2);
  a.actor('sorrel').face(wolves[2].x, wolves[2].z);
  a.anim('sorrel', 'cast');
  await a.wait(0.5);
  await a.wait(shoot(a.actor('sorrel'), wolves[2], 30, 'deadeye'));
  fx.ring(wolves[2].x, wolves[2].z, 2.2, 0xff8a3a, 0.5);
  await a.walk('wolf3', ...out(22, 2), { run: true, speed: 8 });
  a.remove('wolf3');
  // safe: Ilse at his side
  a.busy(false);
  a.hero(undefined, undefined, Math.atan2(juniAt.z - R.z, juniAt.x - R.x));
  await a.walk('rowan', R.x + 1.4, R.z - 1.2);
  a.talkCam(true);
  await a.say('rowan', 'Easy. Easy. You\'re all right now.');
  await a.walk('ilse', R.x - 0.4, R.z - 1.0, { run: true });
  const ilse = a.actor('ilse');
  ilse.stay = true;
  ilse.face(R.x, R.z);
  a.loop('ilse', 'kneel');
  await a.camera([R.x - 2.6, 1.25, R.z + 1.4], [R.x - 0.2, 0.75, R.z - 0.5], 0.6);
  await a.say('ilse', 'Hey. Hey, look at me. Stay with me.', { cam: false });
  await a.say('ilse', 'Scraped up. Nothing broken, I think. ...You\'re cold as a stone, though. How long have you been out here?', { cam: false });
  fx.ring(R.x, R.z, 1.4, 0x8fff9a, 1.2);
  a.ctx.heal();
  a.fog(0.5, 2);
  await a.say('', 'Warmth, from her hands. The fog draws back a little. Not all the way.');
  await a.say('ilse', '...There. Better?', { cam: false });
  await a.say('ilse', 'That should have closed in a breath. It\'s taking its time. Odd.', { to: 'rowan', cam: false });
  a.loop('ilse', 'idle');
  ilse.stay = false;
  await a.walk('juni', R.x + 2.4, R.z + 1.2, { run: true });
  await a.say('juni', 'Did you see that? One arrow! From all the way up on the bank!');
  await a.say('rowan', 'We saw, Juni.', { to: 'juni' });
  await a.say('juni', 'And you! You rolled clear of a wolf. Grown men freeze when they do that.', { to: 'hero' });
  await a.say('rowan', 'Sit a moment. Then we move.');
  a.talkCam(false);
  a.quiet();
  await a.fade(1, 0.5);
  a.bars(false);
}

/** Scene 3, the tear: Sorrel studying what is left of it, a memory, a name. */
export async function openingTear(a) {
  const me = a.ctx.me;
  a.bars(true);
  a.talkCam(false);
  const sorrel = a.actor('sorrel');
  sorrel.stay = true;
  sorrel.face(TEAR.x, TEAR.z);
  for (const who of ['rowan', 'ilse', 'juni']) a.actor(who);
  a.fog(0.95, 0.8);
  await a.camera([TEAR.x - 2.0, 1.75, TEAR.z - 1.5], [TEAR.x + 0.5, 1.8, TEAR.z + 0.4], 0.8);
  await a.flash('Light, everywhere. A voice, very far away: "...keep it safe. Whatever happens, keep it—"');
  a.fog(0.5, 1.5);
  a.quiet();
  await a.say('sorrel', 'Not too close. The air here has been torn, and not long ago.', { to: 'hero', cam: false });
  sorrel.stay = false;
  a.talkCam(true);
  await a.say('sorrel', 'Things don\'t tear by themselves. Something did this. Or someone came through it.');
  await a.say('', 'It pulled you here. You are sure of that, and of almost nothing else.');
  await a.walk('rowan', TEAR.x + 2.5, TEAR.z + 2.3);
  await a.say('rowan', 'Can it wait until we\'re out of the wolves\' woods?', { to: 'sorrel' });
  await a.say('sorrel', 'It can wait. I\'m not sure it should.', { to: 'rowan' });
  a.walk('juni', me.x + 1.8, me.z + 1.4);
  await a.say('juni', 'So. Where did you come from? And what do we call you?', { to: 'hero' });
  await a.say('', 'You open your mouth. Nothing comes. Not the place, not the name.');
  await a.say('juni', 'No name? Then you\'re Sprout. Until you remember. Or until I think of something worse.', { to: 'hero' });
  await a.say('ilse', 'Juni.');
  await a.say('juni', 'What? Look at him. It suits him.', { to: 'ilse' });
  await a.say('rowan', 'Leave it, Juni. Whoever you are, you\'re not staying out here.');
  a.anim('rowan', 'wave');
  await a.say('rowan', 'We\'re the Iron Hounds. Sellswords, out of Sunmere. If somebody\'s missing a boy your size, Sunmere\'s where they\'ll come asking.');
  await a.say('ilse', 'And a bath. Please, a bath.');
  a.talkCam(false);
  a.quiet();
  await a.fade(1, 0.6);
  a.bars(false);
}

/**
 * The Company walking you to Sunmere (Quest 1), after the opening: they follow the road east, a little ahead of
 * you, stopping if you fall behind, talking on the way. Returns { update(dt, me), done }.
 */
export function walkToTown(actors, bark, onDone, from = ROAD_IN, land = null) {
  // from where the hero stands, up to the road, along it into town, then to the plaza's west side
  const path = [{ x: from.x, z: from.z }, { x: ROAD_IN.x, z: ROAD_IN.z }];
  for (let x = ROAD_IN.x + 10; x < -TOWN.r + 2; x += 10) path.push({ x, z: roadZ(x) });
  path.push({ x: -TOWN.r + 4, z: roadZ(-TOWN.r + 4) }, { x: -18, z: roadZ(-18) }, { x: -9, z: -2 });
  const order = ['juni', 'rowan', 'ilse', 'sorrel'];
  const lag = { juni: -3.5, rowan: 0, ilse: 2.4, sorrel: 4.2 }; // metres behind the lead point
  const side = { juni: 0.8, rowan: -0.9, ilse: 0.9, sorrel: -0.6 };
  // where along the path, in metres
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  const total = lens[lens.length - 1];
  const at = (m) => {
    m = Math.max(0, Math.min(total, m));
    let i = 1;
    while (i < lens.length - 1 && lens[i] < m) i++;
    const k = (m - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    const a = path[i - 1], b = path[i];
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
    return { x: a.x + dx * k, z: a.z + dz * k, nx: -dz / d, nz: dx / d };
  };
  const talk = [
    { at: lens[1] + 6, lines: [['juni', 'Wolves don\'t come this close to the road. Not usually.'], ['rowan', 'Nothing\'s been usual this week.']] },
    { at: 34, lines: [['sorrel', 'You went at them with your bare hands. Or tried to.'], ['sorrel', 'Either you\'re very brave, or you didn\'t know you couldn\'t win.'], ['ilse', 'Sorrel.'], ['sorrel', 'It was a compliment.']] },
    { at: 62, lines: [['ilse', 'Sunmere\'s a good town. Loud, but good. Everyone there is busy being something.'], ['juni', 'Busy being whatever the sand told them they are, you mean.'], ['rowan', 'Juni.']] },
    { at: total - 36, lines: [['rowan', 'There she is. Sunmere.'], ['rowan', 'First thing, we ask around. The watch keeps a roll of lost children, and the temple hears everything.'], ['juni', 'Someone\'s turning the town upside down for you right now. Bet you anything.'], ['', 'You hope she\'s right. You can\'t remember anyone to hope for.']] },
  ];
  let lead = 0, said = 0, waiting = false, finished = false;
  if (actors.rowan && actors.rowan.sheathe) actors.rowan.sheathe(); // (0.99.25) on the road, the sword at his hip
  const st = {
    get done() {
      return finished;
    },
    /** Where the Company's leader is (for the marker). */
    get leader() {
      return actors.rowan;
    },
    update(dt, me) {
      // the leader point keeps a little ahead of the hero, and never further than 14 m ahead
      const here = at(lead);
      const behind = Math.hypot(me.x - here.x, me.z - here.z);
      if (!finished) {
        if (behind < 14) {
          lead = Math.min(total, lead + 2.7 * dt);
          if (waiting) waiting = false;
        } else if (!waiting) {
          waiting = true;
          bark([['rowan', 'Over here! Keep up, the woods aren\'t safe after dark.']]);
          actors.rowan.play('wave');
        }
        if (said < talk.length && lead >= talk[said].at) bark(talk[said++].lines);
        if (lead >= total && Math.hypot(me.x - here.x, me.z - here.z) < 9) { finished = true; onDone(); }
      }
      const from = {};
      for (const who of order) {
        const a = actors[who];
        if (!a) continue;
        from[who] = { x: a.x, z: a.z };
        const p = at(lead - lag[who] - 3.5);
        const tx = p.x + p.nx * side[who], tz = p.z + p.nz * side[who];
        const d = Math.hypot(tx - a.x, tz - a.z);
        if (d > 0.25 && !waiting) {
          const sp = Math.min(d * 2.2, d > 3 ? 4.6 : 2.7);
          a.x += ((tx - a.x) / d) * Math.min(d, sp * dt);
          a.z += ((tz - a.z) / d) * Math.min(d, sp * dt);
          a.facing = Math.atan2(tz - a.z, tx - a.x);
          a.sync();
        }
      }
      separate(order.map((w) => actors[w]).filter(Boolean), me, 1.0, land);
      for (const who of order) {
        const a = actors[who];
        if (!a) continue;
        // (0.99.25) the clip follows how fast they really went: held back (by the hero standing on their spot, or
        // each other), they stand, not run on the spot
        // (0.99.27) the actor picks walk, run or idle itself from this; here only: stopped, they turn to the hero
        const stopped = (a.vel || 0) < 0.35;
        if (a.looping !== 'idle' && !a.once && !a.held) a.loop('idle');
        if (stopped && !a.wasStopped) a.face(me.x, me.z, false);
        a.wasStopped = stopped;
        // near the hero, they look at them now and then (stopped, or waiting)
        a.lookTarget = Math.hypot(me.x - a.x, me.z - a.z) < 7 ? { x: me.x, z: me.z } : null;
        a.update(dt);
      }
    },
  };
  return st;
}

/**
 * (0.99.27) Before they take him in: a few days of asking. The watch, the temple, the Guild's board, the records hall.
 * Nobody is sure of anything (what is wrong with him, whether anyone is looking); only after nobody comes do they
 * decide, and then he is one of them, and does the chores like one.
 */
export async function askingScene(a) {
  const me = a.ctx.me;
  const D = HOME.door, I = Math.atan2(TOWN.z - HOME.z, TOWN.x - HOME.x), S = I + Math.PI / 2;
  const at = (out, across) => [D.x + Math.cos(I) * out + Math.cos(S) * across, D.z + Math.sin(I) * out + Math.sin(S) * across];
  // (framed from out in the street, looking back at the door: never from inside the house)
  const view = (o1, c1, o2, c2, dur = 0) => { const p = at(o1, c1), q = at(o2, c2); return a.camera([p[0], 1.55, p[1]], [q[0], 0.95, q[1]], dur); };
  a.bars(true);
  await a.fade(1, 0.5);
  a.actor('rowan', ...at(1.6, -1.2)); a.actor('ilse', ...at(1.4, 1.3)); a.actor('juni', ...at(2.9, 0.9)); a.actor('sorrel', ...at(2.6, -2.2));
  a.hero(...at(2.4, -0.1), I + Math.PI);
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) a.actor(who).face(me.x, me.z);
  a.sheathe('rowan', true);
  await a.fade(0, 0.8);
  await view(6.2, -1.6, 1.8, -0.2);
  await a.say('rowan', 'Right. Ilse, the temple. Juni, the Guild\'s board. I\'ll take the watch-house.', { cam: false });
  await a.say('sorrel', 'The records hall. If a boy your age was born within a week\'s ride, there\'s ink on it somewhere.', { to: 'hero', cam: false });
  await a.say('rowan', 'You stay with us until we find your people. The spare room\'s small, but it\'s dry.', { to: 'hero', cam: false });
  await a.say('juni', 'And it has a window. You can watch for them.', { to: 'hero', cam: false });
  a.talkCam(false);
  a.quiet();
  await a.fade(1, 0.8);
  await a.card([
    'You spent the first days at that window, watching the street for anyone who looked as if they had lost something.',
    'Plenty of people did. None of them looked up.',
  ]);
  // the first night: Ilse, and what she cannot explain
  a.hero(...at(0.9, 0.2), I + Math.PI);
  a.actor('ilse').place(...at(0.4, 0.9)).face(me.x, me.z);
  for (const who of ['rowan', 'juni', 'sorrel']) a.actor(who).place(...at(40, 0)); // (out on their errands)
  await a.fade(0, 0.8);
  await view(4.2, 2.6, 0.6, 0.4);
  await a.say('ilse', 'Still no fever. Good.', { to: 'hero', cam: false });
  await a.say('ilse', 'If it were a knock on the head, your memory would be coming back in pieces by now. A face. A street. Is anything?', { to: 'hero', cam: false });
  await a.say('', 'Only the fog. And a keep of white stone you cannot place.');
  await a.say('ilse', 'Then I don\'t think it\'s a knock on the head. I don\'t know what it is.', { to: 'hero', cam: false });
  await a.say('ilse', 'I\'m sorry. I wish I did. ...But you\'re eating, and you\'re sleeping, and you\'re a little stronger every morning. That I do know.', { to: 'hero', cam: false });
  a.talkCam(false);
  a.quiet();
  await a.fade(1, 0.8);
  await a.card([
    'Day three. Juni\'s notice on the Guild board went unanswered: FOUND, ONE BOY, SMALL, NO NAME. ASK FOR THE IRON HOUNDS.',
    'Somebody had added, in pencil: HAVE YOU TRIED THE WELL?',
  ]);
  // what they found (and did not)
  for (const [who, o, c] of [['rowan', 1.6, -1.2], ['sorrel', 2.6, -2.2], ['juni', 2.9, 0.9]]) a.actor(who).place(...at(o, c));
  a.hero(...at(2.4, -0.1), I + Math.PI);
  for (const who of ['rowan', 'sorrel', 'juni']) a.actor(who).face(me.x, me.z);
  await a.fade(0, 0.8);
  await view(6.0, 1.4, 2.0, -0.6);
  await a.say('rowan', 'The watch has four children on its roll. None of them fits. Two have been found already.', { cam: false });
  await a.say('sorrel', 'Nothing in the records hall either. Which proves less than it sounds: half the villages out east don\'t keep any.', { cam: false });
  await a.say('juni', 'Somebody must be missing you. People don\'t just... turn up.', { to: 'hero', cam: false });
  await a.say('sorrel', 'No. They don\'t, usually.', { to: 'juni', cam: false });
  await a.say('', 'He says it lightly. He is looking at you the way he looked at the tear.');
  a.talkCam(false);
  a.quiet();
  await a.fade(1, 0.8);
  await a.card(['Day five. Nobody came.']);
  // the fifth night: voices through the door (they think he is asleep)
  a.hero(...at(-0.2, 0.3), I);
  for (const [who, o, c] of [['rowan', 1.5, -0.9], ['ilse', 1.2, 1.1], ['juni', 2.4, 0.4], ['sorrel', 2.3, -1.6]]) a.actor(who).place(...at(o, c));
  for (const who of ['rowan', 'ilse', 'sorrel']) a.actor(who).face(...at(2.4, 0.4));
  a.actor('juni').face(...at(1.4, 0));
  a.loop('rowan', 'arms');
  const c1 = at(4.6, 3.4), c2 = at(1.4, -0.2);
  await a.camera([c1[0], 1.7, c1[1]], [c2[0], 1.0, c2[1]], 0);
  await a.fade(0, 1.0);
  await a.say('', 'Voices on the step outside. They think you\'re asleep. From the dark of the doorway, you can hear every word.');
  await a.say('juni', 'Five days. If he had people, they\'d have come by now.', { cam: false });
  await a.say('rowan', 'Or they\'re somewhere he can\'t tell us about. We don\'t know, Juni.', { cam: false });
  await a.say('ilse', 'Then we don\'t hand him to the orphan house on a guess.', { cam: false });
  await a.say('sorrel', 'I\'d rather he stayed where I can see him.', { cam: false });
  await a.say('ilse', 'Sorrel.', { cam: false });
  await a.say('sorrel', 'Not like that. I\'m curious, that\'s all. No name, no village, hardly a spark of mana, and he rolled clear of a wolf with his legs shaking. Something about him doesn\'t add up.', { cam: false });
  await a.say('rowan', 'Then it\'s settled. He stays. If someone comes for him one day, we\'ll be glad for him.', { cam: false });
  await a.say('juni', 'And until then he carries water like the rest of us.', { cam: false });
  await a.say('ilse', 'Juni.', { cam: false });
  await a.say('juni', 'What? He\'ll want to. You watch.', { cam: false });
  await a.fade(1, 1.0);
  a.loop('rowan', 'idle');
  a.bars(false);
}

/** After Quest 1: the Company waits by the plaza (until the Guild opens in the next part). */
export function inTown(actors) {
  const spots = { rowan: [-8, -3, 'arms'], ilse: [-9.5, -1.2, 'talk'], juni: [-7.2, -0.6, 'look'], sorrel: [-10.4, -3.4, 'wait'] };
  for (const [who, [x, z, what]] of Object.entries(spots)) {
    const a = actors[who];
    if (!a) continue;
    a.place(x, z);
    a.face(0, 0);
    a.loop(what);
  }
  return { update(dt) { for (const a of Object.values(actors)) a.update(dt); } };
}

/**
 * Places round the Guild's crystal: `back` metres from it toward the Guild (negative: toward the plaza), `side`
 * metres across. Returns [x, z].
 */
export function atCrystal(back, side) {
  const ux = Math.cos(CRYSTAL.a), uz = Math.sin(CRYSTAL.a);
  return [CRYSTAL.x + ux * back - uz * side, CRYSTAL.z + uz * back + ux * side];
}
/** Where the Company waits in the Guild's yard (Quest 2), and where Magistra Odile stands by her crystal. */
export const YARD = { rowan: atCrystal(-4.6, -1.3), ilse: atCrystal(-5.3, -0.1), juni: atCrystal(-4.2, -2.6), sorrel: atCrystal(-5.7, -2.2) };
export const ODILE = atCrystal(1.45, 0);
/** The Company waits in the yard, facing the Telling Glass; Odile by it. */
export function atGuild(actors, { walk = false } = {}) {
  if (actors.rowan && actors.rowan.sheathe) actors.rowan.sheathe(true); // (0.99.25) in town his sword stays at his hip
  const what = { rowan: 'arms', ilse: 'idle', juni: 'look', sorrel: 'wait', odile: 'idle' };
  for (const [who, a] of Object.entries(actors)) {
    if (!a) continue;
    const at = who === 'odile' ? ODILE : YARD[who];
    const f = who === 'odile' ? CRYSTAL.a + Math.PI : CRYSTAL.a;
    const settle = () => { a.face(Math.cos(f) + a.x, Math.sin(f) + a.z); a.loop(what[who] || 'idle'); };
    // (after Quest 1) they walk up from the plaza; otherwise they are simply there
    if (walk && at && who !== 'odile' && Math.hypot(a.x - at[0], a.z - at[1]) > 1) a.walkTo(at[0], at[1]).then(settle);
    else { if (at) a.place(at[0], at[1], f); a.loop(what[who] || 'idle'); }
  }
  return { update(dt) { for (const a of Object.values(actors)) if (a) a.update(dt); } };
}

/** Quest 2, The Telling Glass: the hero's element and aptitude are read at the Guild. a.ctx.crystal: the glass. */
export async function crystalScene(a) {
  const P = atCrystal;
  const V = (back, side, y) => { const [x, z] = P(back, side); return [x, y, z]; };
  const F = CRYSTAL.a; // facing the crystal (and the Guild) from the plaza
  const cr = a.ctx.crystal;
  a.bars(true);
  a.talkCam(false);
  a.busy(false);
  await a.fade(1, 0.6);
  a.actor('odile', ...ODILE, F + Math.PI);
  a.actor('dace', ...P(-1.2, 0.1), F);
  a.actor('wren', ...P(-2.6, 1.7), F);
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) a.actor(who, ...YARD[who], F);
  a.hero(...P(-4.3, 0.8), F);
  a.loop('rowan', 'arms');
  a.loop('wren', 'arms');
  a.loop('odile', 'idle');
  cr.rest();
  cr.spend(false);
  cr.crack(false);
  await a.camera(V(-12, 3.4, 3.4), V(1.5, 0, 2.4), 0);
  await a.fade(0, 1.2);
  a.camera(V(-9, 2.2, 2.6), V(0.5, 0, 2.2), 5);
  await a.say('', 'The Adventurers\' Guild of Sunmere: a grey stone hall hung with red banners, a yard full of people, and in the middle of the yard a tall glass of pale sand on a stone stand.');
  a.talkCam(true);
  await a.say('juni', 'The Telling Glass. Both hands on it, and the sand tells everyone what you are. Spins for wind, burns for fire, frosts over for ice.');
  await a.say('ilse', 'And how much of it moves is how much you\'ve got. It doesn\'t hurt. It just... tells.');
  await a.say('sorrel', 'Element and aptitude, both fixed at birth. Training sharpens technique, nothing more. The sand is the sand.');
  a.talkCam(false);
  a.quiet();
  // Dace first: the sand rises into a spinning column
  await a.camera(V(-0.4, 4.2, 1.8), V(-0.1, 0, 1.75), 0.9);
  await a.say('odile', 'Dace, of the Silver Sash. Your yearly telling. Both hands on the glass, if you please.', { to: 'dace', cam: false });
  cr.read('wind', 0.85);
  a.shake(0.03, 0.4);
  await a.camera(V(-2.2, 1.0, 1.6), V(0, 0, 1.9), 1.6);
  await a.wait(1.2);
  await a.say('odile', 'Wind. Eighty-one. The same as last year, and the year before. Well done.', { to: 'dace', cam: false });
  a.anim('dace', 'cheer');
  await a.say('', 'Applause round the yard. Somebody whistles.');
  cr.rest();
  a.talkCam(true);
  await a.say('dace', 'Just making sure it still likes me.', { to: 'wren' });
  a.walk('dace', ...P(-2.6, 2.9));
  await a.say('wren', 'It likes everyone over seventy, Dace. Move.', { to: 'dace' });
  await a.say('odile', 'Next. You, with the Iron Hounds. Both hands on the glass.');
  await a.say('rowan', 'Go on. We\'re right behind you.');
  a.talkCam(false);
  a.quiet();
  // the hero walks up
  a.camera(V(-6.6, -1.8, 2.3), V(-1, 0, 1.6), 2.4);
  await a.heroWalk(...P(-1.2, 0), 2.4);
  a.hero(undefined, undefined, F);
  await a.camera(V(-2.7, 1.0, 1.8), V(0.2, -0.1, 1.95), 0.9);
  await a.say('', 'The glass is cold. Colder than it looks.');
  await a.prompt('KeyE', 'Both hands on the glass', { label: 'E' });
  cr.read('none', 0.035);
  await a.wait(2.0);
  await a.say('', 'For a moment, nothing at all. Then a few grains stir, as if someone breathed on them.');
  await a.camera(V(-0.4, 4.2, 1.8), V(-0.1, 0, 1.75), 0.8);
  await a.wait(0.8);
  await a.say('odile', 'Three.', { to: 'hero', cam: false });
  await a.say('odile', 'And no element I can see.', { to: 'hero', cam: false });
  a.talkCam(true);
  await a.say('dace', 'Three? My boots have more magic than that!', { to: 'hero' });
  a.talkCam(false);
  a.quiet();
  a.anim('dace', 'laugh');
  a.anim('wren', 'laugh');
  await a.camera(V(-0.6, 1.0, 1.65), V(-2.6, 2.3, 1.35), 0.7);
  await a.say('', 'Laughter goes round the yard. Not all of it is unkind, and somehow that is worse.');
  cr.rest();
  cr.spend(true); // (nobody looks: the sand settles a shade greyer than it was)
  a.talkCam(true);
  await a.say('odile', 'Aptitude is set at birth, child. I am sorry. The Guild registers anyone, so you may take work here, but you will be rank F, and rank F does not change.');
  a.walk('juni', ...P(-2.7, -1.5));
  await a.say('juni', 'Say it again, Dace. Go on. To my face.', { to: 'dace' });
  await a.say('dace', 'Easy, Hound. Keep your stray on a leash.', { to: 'juni' });
  // Rowan steps up, and his hand goes to his sword
  a.walk('rowan', ...P(-2.4, 1.0));
  await a.wait(0.4);
  a.draw('rowan');
  await a.say('rowan', 'Walk away, Dace.', { to: 'dace' });
  await a.say('dace', '...Touchy.', { to: 'rowan' });
  a.walk('dace', ...P(-2.8, 3.6));
  await a.say('rowan', 'Juni. Leave it.', { to: 'juni' });
  a.sheathe('rowan');
  a.quiet();
  // Wren next: and the glass gives her nothing at all
  a.talkCam(true);
  await a.say('odile', 'Wren, of the Silver Sash. You may as well go now, while we are all here.', { to: 'wren' });
  a.talkCam(false);
  a.quiet();
  await a.walk('wren', ...P(-1.2, 0.1));
  a.actor('wren').face(CRYSTAL.x, CRYSTAL.z);
  await a.camera(V(-0.4, 4.2, 1.8), V(-0.1, 0, 1.75), 0.8);
  cr.read('frost', 0);
  await a.wait(2.2);
  await a.say('', 'Nothing. Not a grain moves.');
  await a.say('wren', '...That\'s not right. Last year it frosted to the brim.', { to: 'odile', cam: false });
  a.shake(0.08, 0.3);
  cr.crack(true);
  await a.camera(V(-1.6, 0.7, 1.7), V(0, 0, 1.7), 0.5);
  await a.say('', 'A small, sharp sound, like ice on a pond. A hairline crack runs up the side of the glass.');
  await a.camera(V(-0.4, 4.2, 1.8), V(-0.1, 0, 1.75), 0.8);
  await a.say('wren', 'I didn\'t... I didn\'t do that.', { to: 'odile', cam: false });
  a.anim('odile', 'no');
  await a.say('odile', 'No. No, you didn\'t.', { to: 'wren', cam: false });
  await a.say('odile', 'The telling is closed for today. The glass is old; it wants seeing to. Come back tomorrow, all of you.', { cam: false });
  a.talkCam(true);
  await a.say('dace', 'Brilliant. Thanks a lot, stray.', { to: 'hero' });
  a.walk('dace', ...P(-1.2, 10));
  a.walk('wren', ...P(-0.3, 10.6));
  a.quiet();
  // the Company closes round the hero
  a.walk('ilse', ...P(-2.5, 1.3));
  a.walk('rowan', ...P(-2.9, -0.4));
  await a.heroWalk(...P(-2.0, 0.35), 0.9);
  await a.say('ilse', 'Three or three hundred, you\'re still the one who got up off that grass with wolves all round.');
  await a.say('rowan', 'The number tells you where you start. Not where you stop. We\'ll train you ourselves.');
  a.remove('dace');
  a.remove('wren');
  // Sorrel lingers at the glass
  a.walk('sorrel', ...P(-1.0, -0.9));
  a.talkCam(false);
  a.quiet();
  await a.camera(V(-2.4, -1.8, 1.8), V(0, -0.4, 1.6), 1.2);
  await a.say('', 'Sorrel is the last to leave. He takes a pinch of sand from the top of the glass and rubs it between his fingers.');
  await a.say('', 'It doesn\'t run like sand any more. It clings, like ash.');
  await a.say('rowan', 'Sorrel.', { to: 'sorrel', cam: false });
  await a.say('sorrel', '...Coming.', { to: 'rowan', cam: false });
  a.talkCam(false);
  a.quiet();
  await a.fade(1, 0.8);
  a.bars(false);
}

// ---- Quest 3, Choosing a Path (0.99.21): the Hounds' training ground outside the east gate
/** Where each of the Company stands at the training ground (Rowan by his ring, Juni at her line, the others watching). */
export const DRILL = {
  rowan: [TRAINING.ring.x + 1.2, TRAINING.ring.z - 3.6],
  juni: [TRAINING.line.x - 0.8, TRAINING.line.z - 2.2],
  ilse: [TRAINING.ring.x + 6.5, TRAINING.ring.z + 3.2],
  sorrel: [TRAINING.ring.x + 8, TRAINING.ring.z + 2.2],
};
/** The Company at the training ground; Magistra Odile back at her crystal. */
export function atTraining(actors) {
  const what = { rowan: 'arms', ilse: 'idle', juni: 'look', sorrel: 'wait', odile: 'idle' };
  if (actors.rowan && actors.rowan.draw) actors.rowan.draw(true); // (0.99.25) on the training ground his sword is out
  for (const [who, a] of Object.entries(actors)) {
    if (!a) continue;
    const at = who === 'odile' ? ODILE : DRILL[who];
    if (!at) continue;
    const f = who === 'odile' ? CRYSTAL.a + Math.PI : Math.atan2(TRAINING.ring.z - at[1], TRAINING.ring.x - at[0]);
    a.place(at[0], at[1], f);
    a.loop(what[who] || 'idle');
  }
  return { update(dt) { for (const a of Object.values(actors)) if (a) a.update(dt); } };
}

/** The scene at the training ground, before the trials. */
export async function trainingScene(a) {
  const R = TRAINING.ring;
  a.bars(true);
  a.talkCam(false);
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) a.actor(who, ...DRILL[who]);
  const me = a.ctx.me;
  a.camera([R.x - 9, 3.2, R.z - 7], [R.x + 2, 1.2, R.z - 1], 0);
  a.camera([R.x - 6, 2.4, R.z - 5.5], [R.x + 1, 1.3, R.z - 1.5], 4);
  await a.say('', 'Packed earth, a ring of straw posts, and a row of painted targets running off toward the hills: the Iron Hounds\' training ground.');
  a.talkCam(true);
  a.watch('rowan');
  await a.say('rowan', 'The glass measures what you were born with. Out here we measure what you do with it.');
  await a.say('juni', 'The Hounds fight two ways. His way: get close, get hurt, win anyway. Mine: stay far, breathe, one arrow.', { to: 'hero' });
  await a.say('sorrel', 'Your mana will always be small. So spend it the way that suits you. He pays the difference in blood. She pays in patience.');
  await a.say('ilse', 'And whichever you try, I\'m right here if it goes wrong.');
  await a.say('rowan', 'Try both, then choose. Me first. Take a blade, and come into the ring.');
  a.talkCam(false);
  a.quiet();
  a.watch(null);
  void me;
  await a.fade(1, 0.5);
  a.bars(false);
}

/** The two trials: what to do, step by step, and what the teacher says. */
export const TRIALS = {
  warrior: {
    teacher: 'rowan',
    title: 'Rowan\'s trial: the Berserker',
    steps: [
      { id: 'cleave', text: 'Cleave the posts in the ring', need: 6, done: 'Wait. Where did you learn to turn your hips like that? ...You watched me do it once. Huh. Feel that? Every post you hit gives you a little mana back. Battle Rhythm: the fight feeds you.' },
      { id: 'skyfall', text: 'Skyfall (Q) into the ring: two posts with one landing', need: 1, done: 'First try. It took me a month to land that without falling over. Land in the middle of them; they never see it coming.' },
      { id: 'blood', text: 'Hold Whirlwind (E) until your mana runs dry, and keep spinning on blood (Skyfall first burns mana faster)', need: 1, done: 'There. That\'s the Blood Price. Out of mana, you pay in blood, and under half you hit harder and heal by hitting. Mind you don\'t pay it all.' },
    ],
    start: [['rowan', 'Watch once. Then you do it.'], ['rowan', 'Into the ring. Cut. Don\'t think, cut.']],
    end: [['rowan', 'Rank F, my foot. I\'ve trained grown men who took a season to get that far.'], ['sorrel', 'Three, the glass said. I\'m starting to wonder what it was measuring.'], ['juni', 'My turn! Bow\'s by the line. Come on!']],
  },
  archer: {
    teacher: 'juni',
    title: 'Juni\'s trial: the Sharpshooter',
    steps: [
      { id: 'far', text: 'From the line, hit the far target (25 m off)', need: 1, done: 'You held the string exactly like I did. Exactly. ...See how hard that one landed? The further an arrow flies, the harder it hits. Long Watch.' },
      { id: 'ricochet', text: 'One Ricochet (Q) through all three targets', need: 1, done: 'Ha! One arrow, three targets. That\'s how you clear a road.' },
      { id: 'deadeye', text: 'Hold Deadeye (R): pour in 30 mana or more, then let go at a target', need: 1, done: 'Now that\'s a shot. The longer you hold, the more you pour in. Stand still and breathe between, and your mana comes back faster.' },
    ],
    start: [['juni', 'Watch me. Once. Apparently that\'s all you need.'], ['juni', 'Stand on the line. Bow up. The far one first.']],
    end: [['juni', 'It took me two summers to shoot like that. Two!'], ['ilse', 'Then be proud of him, Juni, not cross.'], ['juni', 'I can be both.'], ['rowan', 'Both ways, then. Now choose.']],
  },
};

// ---- (0.99.24) Days with the Hounds: between the walk into town and the Telling Glass
// Their lodging: the house on the west side of the plaza (its door toward the plaza)
const lodging = townHouses().filter((h) => !h.guild).sort((a, b) => Math.hypot(a.x + 18, a.z - 10.8) - Math.hypot(b.x + 18, b.z - 10.8))[0];
const inward = Math.atan2(TOWN.z - lodging.z, TOWN.x - lodging.x);
export const HOME = { x: lodging.x, z: lodging.z, door: { x: lodging.x + Math.cos(inward) * (Math.max(lodging.hw, lodging.hd) + 1.4), z: lodging.z + Math.sin(inward) * (Math.max(lodging.hw, lodging.hd) + 1.4) } };
const side = inward + Math.PI / 2;
export const WOODPILE = { x: lodging.x + Math.cos(side) * (lodging.hw + 2.2) + Math.cos(inward) * 1.2, z: lodging.z + Math.sin(side) * (lodging.hw + 2.2) + Math.sin(inward) * 1.2 };
export const WELL_AT = { x: WELL.x - 1.4, z: WELL.z - 0.4 };
export const HERBS = [{ x: 9, z: -54 }, { x: -5, z: -58 }, { x: 5, z: -64 }]; // in the meadow past the north gate
/** Rowan's morning run: twice round the plaza (a ring of points), from the lodging's door. */
export const RUN_ROUTE = (() => {
  const out = [];
  const a0 = Math.atan2(HOME.door.z, HOME.door.x);
  for (let lap = 0; lap < 2; lap++) for (let i = 1; i <= 10; i++) { const a = a0 + (i / 10) * Math.PI * 2; out.push({ x: Math.cos(a) * 11, z: Math.sin(a) * 11 }); }
  out.push({ x: HOME.door.x, z: HOME.door.z });
  return out;
})();
/** Where each of the Hounds is through the days (by the lodging, each about their own business). */
export const HOME_SPOTS = {
  ilse: [HOME.door.x + Math.cos(side) * 1.2, HOME.door.z + Math.sin(side) * 1.2],
  rowan: [HOME.door.x - Math.cos(side) * 1.4 + Math.cos(inward) * 0.8, HOME.door.z - Math.sin(side) * 1.4 + Math.sin(inward) * 0.8],
  juni: [WOODPILE.x + Math.cos(inward) * 1.4, WOODPILE.z + Math.sin(inward) * 1.4],
  sorrel: [WELL.x + 1.6, WELL.z + 1.2],
};
/** How strong he is (0.5 just through the tear) and how thick the fog, by day. */
export const VIGOUR = [0.55, 0.7, 0.85, 1];
export const DAY_FOG = [0.34, 0.26, 0.18, 0.12];
/**
 * The days. Each task: fetch (go to `from`, F to pick up, carry it to `to`, F to hand over; `need` times), follow
 * (keep up with Rowan round his route), gather (F at each of `at`), lesson (F by Sorrel: a short scene), sleep (F at
 * the lodging's door: night, and the next morning).
 */
export const DAYS = [
  {
    title: 'Day 1: Getting your legs back',
    morning: ['Sunmere. The Iron Hounds\' lodging, the small room over the street.', 'Your first morning as one of them. The fog was still there when you woke.'],
    tasks: [
      { id: 'water', kind: 'fetch', text: 'Fetch a bucket of water from the plaza\'s well for Ilse', from: 'well', to: 'ilse', need: 1, carry: true,
        start: [['ilse', 'You\'re up! Good. Feel like being useful? The well\'s in the middle of the plaza. One bucket. Half full is fine.']],
        got: [['', 'It is heavier than it looks. Your arms shake all the way back.']],
        done: [['ilse', 'That\'s full to the brim. Rowan, he carried it full. At his size I\'d have spilled half.'], ['rowan', 'Huh. So he did.'], ['juni', 'One bucket and he\'s finished! ...Fine. One full bucket. We\'ll make a Hound of you yet.']] },
      { id: 'sleep', kind: 'sleep', text: 'Sleep (the Hounds\' door)', start: [['rowan', 'Bed. All of you. We\'re up early.']] },
    ],
    night: { text: 'That night: the same dream. White stone, and a voice, and a door you are not allowed to open.', flash: 'A door of white stone. A hand on it, small, like yours. "Not this one."' },
  },
  {
    title: 'Day 2: Rowan\'s morning',
    morning: ['Day 2.', 'The fog is a little thinner this morning. Rowan is already outside, stretching.'],
    tasks: [
      { id: 'run', kind: 'follow', text: 'Keep up with Rowan: twice round the plaza',
        start: [['rowan', 'Morning. Twice round the plaza, with me. Don\'t stop, and don\'t fall over.']],
        wait: [['rowan', 'Come on. I\'m not even running yet.'], ['rowan', 'Breathe. Then catch up.']],
        done: [['rowan', 'Twice round, and you never stopped. Most boys your size don\'t make it once.'], ['juni', 'He was wheezing.'], ['rowan', 'He was. And he kept going. That\'s the part that counts.']] },
      { id: 'wood', kind: 'fetch', text: 'Carry firewood from the pile to Juni', from: 'wood', to: 'juni', need: 3, carry: true,
        start: [['juni', 'Sprout! Firewood. Three armfuls, pile to me. I\'ll supervise.']],
        got: [['', 'An armful of split logs. You can see over it, just.']],
        each: [['juni', 'Two more. You\'re slower than Sorrel, and Sorrel is a hundred.'], ['sorrel', 'I am thirty-four.'], ['juni', 'One more! Then you can rest your tiny arms.']],
        done: [['juni', 'Done! Look at that. A whole fire\'s worth.'], ['ilse', 'Juni, he\'s about to fall over.'], ['juni', 'He is not. Are you? ...Sit down, Sprout.']] },
      { id: 'sleep', kind: 'sleep', text: 'Sleep (the Hounds\' door)', start: [['ilse', 'Early night. You\'ve earned it.']] },
    ],
    night: { text: 'You wake once in the dark. For a moment you know your own name. Then it is gone again.', flash: 'Someone laughing, kneeling to your height. A gold thread on a white sleeve.' },
  },
  {
    title: 'Day 3: Herbs and a lesson',
    morning: ['Day 3.', 'The fog has thinned to the very edges. Your legs feel like your own.'],
    tasks: [
      { id: 'herbs', kind: 'gather', text: 'Gather herbs in the meadow past the north gate', at: 'herbs',
        start: [['ilse', 'Come with me today. Silverleaf grows past the north gate; I\'ll show you which. Three bunches.']],
        each: [['ilse', 'That\'s it, silverleaf. See the white underneath?'], ['ilse', 'You found that one before I did. Good eyes.']],
        done: [['ilse', 'Perfect. And I only showed you once. My apprentices took a week to tell silverleaf from nettle.'], ['ilse', 'You\'re steadier than you were, too. Much.']] },
      { id: 'lesson', kind: 'lesson', text: 'Sorrel wants a word (by the well)', start: [['sorrel', 'When you have a moment. By the well.']] },
      { id: 'sleep', kind: 'sleep', text: 'Sleep (the Hounds\' door)', start: [['rowan', 'Tomorrow, the Guild. Get some sleep.']] },
    ],
    night: { text: 'You sleep without dreaming, for once.' },
  },
];

/** Sorrel's lesson (Day 3): mana, the Telling Glass, and the thing he will not say out loud. */
export async function lessonScene(a) {
  const me = a.ctx.me;
  a.bars(true);
  a.talkCam(true);
  a.actor('sorrel');
  a.walk('sorrel', me.x + 1.6, me.z + 0.4);
  await a.say('sorrel', 'Sit. You\'re going to the Guild tomorrow, and nobody has told you what happens there.');
  await a.say('sorrel', 'Everyone has mana. Some a cupful, some a lake. You spend it, it comes back. Training makes you spend it better, never have more.');
  await a.say('sorrel', 'And everyone has an element, the shape their mana takes. Fire, ice, wind, earth. A few rarer ones.');
  await a.say('sorrel', 'At the Guild there\'s a glass of sand. You put your hands on it, and it tells everyone both. Your element, and how much you\'ve got. It\'s never wrong.');
  await a.say('', 'Something in the way he says "never" sounds like a question.');
  await a.say('sorrel', 'That tear in the forest. When I found it, the air round it was cold. Not winter cold. Empty.', { to: 'hero' });
  await a.say('sorrel', 'You feel like that, sometimes. When I look at you.', { to: 'hero' });
  await a.say('sorrel', '...Never mind. Get some sleep.');
  a.talkCam(false);
  a.quiet();
  a.bars(false);
}

/** A night: dark, a line, perhaps a memory, then the next morning's cards. */
export async function nightScene(a, night, morning) {
  a.bars(true);
  await a.fade(1, 1.0);
  await a.card([night.text]);
  if (night.flash) await a.flash(night.flash, 2.6);
  if (morning) await a.card(morning);
  a.bars(false);
}

// ---- (0.99.26) Quest 4, When It Counts: a year on; the ashen wolves; Vesper of the Unbound; Ilse; the Link wakes
export const ASHEN_AT = [{ x: GLADE.x + 30, z: GLADE.z - 14 }, { x: GLADE.x + 24, z: GLADE.z + 16 }, { x: GLADE.x + 12, z: GLADE.z - 24 }, { x: GLADE.x + 6, z: GLADE.z + 22 }];
export const VESPER_FROM = { x: GLADE.x - 10, z: GLADE.z + 3 };
/** Vesper's own numbers (laid on one of the land's golems, drawn as a man). */
export const VESPER = { name: 'Vesper of the Unbound', speed: 3.4, aggro: 40, leash: 80, r: 0.55, hp: 2600, dmg: 30, every: 1.5, xp: 0 };

/** A year on, at the training ground: the doorframe that does not change, and a contract. */
export async function yearScene(a) {
  a.bars(true);
  await a.fade(1, 0.6);
  await a.card([
    'The days became weeks.',
    'Every morning, the training ground. Every evening, the lodging, loud and warm. You learned the streets, the Guild\'s board, how each of the Hounds takes their tea.',
    'Whatever they showed you, you only ever needed to see once. Rowan stopped saying "again" in the first month. Juni stopped grumbling about it in the second.',
    'The fog never quite left. Neither did the name Sprout.',
    'A year.',
  ]);
  const me = a.ctx.me;
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) a.actor(who);
  a.walk('ilse', me.x + 1.0, me.z + 0.3);
  await a.fade(0, 1);
  a.talkCam(true);
  await a.say('ilse', 'Stand still. Back straight. Let me look at you.');
  await a.say('ilse', '...', { auto: 1.2 });
  await a.say('ilse', 'That\'s odd. You haven\'t grown. Not a hair, since last spring.');
  await a.say('juni', 'Sprout doesn\'t sprout. I said that a year ago and nobody laughed.');
  await a.say('ilse', 'Maybe it\'s the food. Maybe it\'s whatever happened in that forest. I honestly don\'t know.', { to: 'juni' });
  await a.say('rowan', 'Small or not, he took me off my feet this morning. Rank F, the glass says. I\'ve had rank Cs who couldn\'t do what he did today.');
  await a.say('', 'Sorrel says nothing. He is watching you the way he watched the tear.');
  await a.say('rowan', 'Enough. Work. The Guild\'s posted a contract: wolves in the Wakewood again. The wrong kind. Ash in their fur, and eyes like coals.');
  await a.say('sorrel', 'Where?');
  await a.say('rowan', 'Near the glade. Where we found him.', { to: 'sorrel' });
  await a.say('sorrel', 'Near the tear, then.', { to: 'rowan' });
  await a.say('ilse', 'Stay close to me out there, Sprout. I mean it.');
  a.talkCam(false);
  a.quiet();
  await a.fade(1, 0.5);
  a.bars(false);
}

/** At the glade: the tear stirs, and Vesper steps out of the trees. Ends when he turns to the hero. */
export async function vesperScene(a) {
  const { fx } = a;
  const me = a.ctx.me;
  const G = { x: GLADE.x, z: GLADE.z };
  a.bars(true);
  a.ctx.rift.stir(true);
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) a.actor(who);
  a.hero(G.x + 4, G.z, Math.PI);
  a.actor('rowan', G.x + 3, G.z - 1.8, Math.PI); a.actor('ilse', G.x + 5.2, G.z + 1.2, Math.PI);
  a.actor('juni', G.x + 4.6, G.z - 3.0, Math.PI); a.actor('sorrel', G.x + 2.2, G.z + 1.8, Math.PI);
  await a.camera([TEAR.x + 6, 2.2, TEAR.z + 5], [TEAR.x, 2.2, TEAR.z], 0);
  await a.fade(0, 1);
  await a.say('', 'The sliver of the tear is moving. Breathing, almost. Ash drifts out of it and settles on the grass.');
  a.fog(0.45, 2);
  await a.flash('Cold. The same cold as that night. Something on the other side, pressing.', 2.2);
  a.fog(0.15, 1.5);
  await a.say('sorrel', 'It\'s open. Not much. But it\'s open.');
  // he walks out of the trees as if he owned them
  const v = a.actor('vesper', VESPER_FROM.x - 8, VESPER_FROM.z, 0);
  a.camera([VESPER_FROM.x + 3, 1.7, VESPER_FROM.z + 3.5], [VESPER_FROM.x - 2, 1.5, VESPER_FROM.z], 1.2);
  await a.walk('vesper', VESPER_FROM.x, VESPER_FROM.z);
  v.face(me.x, me.z);
  a.talkCam(true);
  await a.say('vesper', 'Is it you? ...It might be you.', { to: 'hero' });
  await a.say('vesper', 'A year I\'ve watched this little scar in the air, wondering what came through it. A beast, I thought. A weapon. Something worth the wait.', { to: 'hero' });
  await a.say('vesper', 'And here is a child who doesn\'t grow, who broke a Telling Glass by touching it. How very interesting.', { to: 'hero' });
  a.draw('rowan');
  await a.say('rowan', 'That\'s far enough. Who are you?', { to: 'vesper' });
  await a.say('vesper', 'Vesper. Of the Unbound. Not that it will matter to you for long.', { to: 'rowan' });
  await a.say('sorrel', 'The ash on the wolves. That was you.', { to: 'vesper' });
  await a.say('vesper', 'A little desire, a little malice. They take to it so well. I wanted to see if the tear would answer. It did. It gave me him.', { to: 'sorrel' });
  await a.say('vesper', 'I don\'t know what you are, little one. I\'d like to. I\'d like to open you up and find out.', { to: 'hero' });
  await a.say('ilse', 'You\'ll not lay a finger on him.', { to: 'vesper' });
  await a.say('rowan', 'Hounds!', { to: 'vesper' });
  a.talkCam(false);
  a.quiet();
  // they go at him, and it is nothing to him
  await a.camera([me.x + 2, 2.4, me.z + 4], [VESPER_FROM.x, 1.2, VESPER_FROM.z], 0.5);
  const shoot = (from, to, speed, kind) => { const d = Math.hypot(to.x - from.x, to.z - from.z) || 1; fx.shot({ x: from.x, z: from.z, dx: (to.x - from.x) / d, dz: (to.z - from.z) / d, speed, range: Math.max(0, d - 1.2), kind }); return d / speed; };
  a.anim('juni', 'shoot');
  await a.wait(shoot(a.actor('juni'), v, 60, 'arrow'));
  fx.puff(v.x + 0.6, v.z);
  await a.say('', 'Juni\'s arrow stops a hand\'s breadth from him and falls apart into ash.');
  a.anim('sorrel', 'cast');
  await a.wait(0.4);
  await a.wait(shoot(a.actor('sorrel'), v, 30, 'deadeye'));
  fx.ring(v.x, v.z, 1.4, 0x3a1a4a, 0.5);
  await a.walk('rowan', v.x + 1.4, v.z + 0.3, { run: true });
  await a.anim('rowan', 'slash', { speed: 1.2 });
  await a.say('', 'Sorrel\'s fire goes out against him like a candle in a cellar. Rowan\'s blade stops in the air, as if it struck stone.');
  await a.say('vesper', 'Rank C adventurers. All of you? How sweet. There is nothing in this world that can touch me.', { to: 'rowan' });
  // and then he only lifts a hand
  a.anim('vesper', 'cast');
  await a.wait(0.4);
  a.shake(0.35, 0.5);
  fx.ring(v.x, v.z, 9, 0x2a0a3a, 0.6);
  for (const who of ['rowan', 'juni', 'sorrel', 'ilse']) a.anim(who, 'knock', { hold: true });
  await a.wait(1.0);
  await a.say('', 'The air folds. All four of them are thrown down into the grass like dolls.');
  v.face(me.x, me.z);
  await a.camera([me.x - 1.8, 1.05, me.z + 1.2], [v.x, 1.6, v.z], 0.8);
  await a.say('vesper', 'Now. Just you and me.', { to: 'hero', cam: false });
  await a.prompt(me.cls === 'archer' ? 'Space' : 'Space', 'Fight', { label: 'Space' });
  a.bars(false);
}

/** Ilse steps in front of the blow meant for him; she dies; and something torn out of him a year ago remembers. */
export async function deathScene(a) {
  const { fx } = a;
  const me = a.ctx.me;
  a.bars(true);
  for (const who of ['rowan', 'juni', 'sorrel', 'ilse', 'vesper']) a.actor(who);
  const v = a.actor('vesper');
  v.face(me.x, me.z);
  for (const who of ['rowan', 'juni', 'sorrel']) a.loop(who, 'idle');
  await a.camera([me.x + 3, 1.6, me.z + 3], [v.x, 1.4, v.z], 0.5);
  await a.say('vesper', 'Enough. I\'ve seen what you do alive. Let\'s see what you\'re made of.', { to: 'hero', cam: false });
  await a.say('vesper', 'Hold still. The body is all I need, and I\'d rather it in one piece.', { to: 'hero', cam: false });
  a.anim('vesper', 'cast', { hold: true });
  fx.ring(v.x, v.z, 0.8, 0x1a0a2a, 0.6);
  await a.say('', 'Black light gathers in his hand, narrow as a needle, aimed at your heart. It isn\'t meant to stop you. It\'s meant to kill you.', { auto: 2.6 });
  // Ilse runs between them
  const mid = { x: me.x + (v.x - me.x) * 0.25, z: me.z + (v.z - me.z) * 0.25 };
  await a.walk('ilse', mid.x, mid.z, { run: true });
  a.actor('ilse').face(v.x, v.z);
  const d = Math.hypot(mid.x - v.x, mid.z - v.z) || 1;
  fx.shot({ x: v.x, z: v.z, dx: (mid.x - v.x) / d, dz: (mid.z - v.z) / d, speed: 40, range: d, kind: 'deadeye' });
  await a.wait(d / 40);
  a.shake(0.4, 0.5);
  fx.ring(mid.x, mid.z, 1.2, 0x1a0a2a, 0.6);
  a.anim('ilse', 'die', { hold: true });
  a.actor('ilse').dead = true;
  a.fog(0.95, 0.3);
  await a.say('', 'She is between you before you see her move. It was meant for you. It goes through her instead.');
  a.fog(0.5, 2);
  // from the side away from Vesper (he is not in this shot)
  const ax = mid.x - v.x, az = mid.z - v.z, al = Math.hypot(ax, az) || 1;
  await a.camera([mid.x + (ax / al) * 2.6 - (az / al) * 1.4, 1.6, mid.z + (az / al) * 2.6 + (ax / al) * 1.4], [mid.x, 0.35, mid.z], 1.0);
  await a.heroWalk(mid.x + 0.6, mid.z + 0.4, 0.8);
  a.loop('rowan', 'idle');
  await a.say('juni', 'ILSE!', { cam: false });
  await a.say('ilse', 'Hey. Hey, look at me.', { to: 'hero', cam: false });
  await a.say('ilse', 'You\'re all right. You\'re all right now.', { to: 'hero', cam: false });
  await a.say('ilse', 'Don\'t let that fog take you. Promise me. Stay...', { to: 'hero', cam: false });
  await a.wait(1.2);
  await a.say('', 'She doesn\'t finish.');
  await a.wait(1.4);
  // the Link
  a.fog(1, 1.5);
  await a.wait(1.2);
  await a.flash('A keep of white stone. A gold thread on a white sleeve. "Keep it safe. Whatever happens, keep it—"', 2.4);
  await a.flash('Everything you were, a year ago, on the other side of the dark. It was never gone. It was waiting.', 2.4);
  a.ctx.wakeLink();
  a.fog(0, 0.6);
  a.shake(0.5, 0.8);
  fx.ring(me.x, me.z, 2.5, 0xffd24a, 0.8);
  fx.ring(me.x, me.z, 6, 0xffe9a0, 1.0);
  await a.camera([me.x + 2.2, 1.1, me.z - 1.6], [me.x, 0.9, me.z], 0.6);
  await a.say('', 'A thread pulls tight, somewhere behind your ribs: the same place the tear once hooked you. On the other end of it, something vast turns to look at you.');
  await a.say('', 'The Dimension Link wakes.');
  a.talkCam(true);
  await a.say('vesper', '...Oh.', { to: 'hero' });
  await a.say('vesper', 'There. That\'s what I came for. Show me more.', { to: 'hero' });
  await a.say('vesper', 'Come on, then. You can\'t hurt me. Nothing here can.', { to: 'hero' });
  a.talkCam(false);
  a.quiet();
  await a.prompt('Space', 'Fight', { label: 'Space' });
  a.bars(false);
}

/**
 * (0.99.27) The end of Vesper: sure to the last that nothing in this world can touch him, he does not run (the tear
 * is no door: it tore everything out of the hero once, and it would do the same to him). The hero ends it, for her.
 * Then the Hounds, round Ilse.
 */
export async function afterScene(a) {
  const { fx } = a;
  const me = a.ctx.me;
  a.bars(true);
  for (const who of ['rowan', 'juni', 'sorrel', 'ilse', 'vesper']) a.actor(who);
  const v = a.actor('vesper');
  v.face(me.x, me.z);
  a.anim('vesper', 'knock', { hold: true });
  a.shake(0.25, 0.4);
  await a.wait(0.8);
  a.talkCam(true);
  await a.say('vesper', 'No. No, that isn\'t... Nothing in this world can—', { to: 'hero' });
  await a.say('vesper', 'What are you? Tell me what you are.', { to: 'hero' });
  a.talkCam(false);
  a.quiet();
  await a.prompt('Space', 'For Ilse', { label: 'Space' });
  const d = Math.hypot(v.x - me.x, v.z - me.z) || 1;
  await a.heroWalk(v.x - ((v.x - me.x) / d) * 1.1, v.z - ((v.z - me.z) / d) * 1.1, 0.35);
  a.hero(undefined, undefined, Math.atan2(v.z - me.z, v.x - me.x));
  if (a.ctx.heroStrike) a.ctx.heroStrike();
  await a.wait(0.25);
  a.fog(0.6, 0.1);
  a.shake(0.5, 0.6);
  fx.ring(v.x, v.z, 3, 0xffd24a, 0.6);
  fx.ring(v.x, v.z, 1.4, 0xffe9a0, 0.5);
  a.anim('vesper', 'die', { hold: true });
  await a.camera([v.x + 2.6, 1.2, v.z + 2.2], [v.x, 0.5, v.z], 0.5);
  a.fog(0.2, 1.2);
  await a.say('vesper', '...So small.', { auto: 1.6, cam: false });
  await a.wait(0.6);
  fx.puff(v.x, v.z, 0x6a6470);
  a.remove('vesper');
  a.ctx.rift.stir(false);
  await a.say('', 'He comes apart into ash, the way Juni\'s arrow did. The wind takes him. The tear behind you is a sliver again, and quiet.');
  // the Hounds, round her
  const ilse = a.actor('ilse');
  a.loop('rowan', 'idle'); a.loop('juni', 'idle'); a.loop('sorrel', 'idle');
  await Promise.all([a.walk('rowan', ilse.x + 1.0, ilse.z - 0.8, { run: true }), a.walk('juni', ilse.x - 0.9, ilse.z - 0.7, { run: true }), a.walk('sorrel', ilse.x + 0.4, ilse.z + 1.1)]);
  a.loop('rowan', 'kneel'); a.loop('juni', 'crouch');
  a.sheathe('rowan');
  await a.heroWalk(ilse.x - 0.3, ilse.z + 0.9, 1.2);
  await a.camera([ilse.x + 2.6, 1.3, ilse.z + 2.2], [ilse.x, 0.3, ilse.z], 1.4);
  await a.say('', 'Nobody says anything for a long time.');
  await a.say('juni', 'She said she\'d be right there if it went wrong. She said that. Every time.', { cam: false });
  await a.say('sorrel', 'Your eyes. When you went for him. They were gold.', { to: 'hero', cam: false });
  await a.say('rowan', 'Later, Sorrel.', { to: 'sorrel', cam: false });
  await a.say('rowan', 'You did what none of us could. She\'d have... she\'d be so...', { to: 'hero', cam: false });
  await a.say('rowan', '...We take her home.', { cam: false });
  await a.fade(1, 1.6);
  await a.card([
    'They buried Ilse on the hill above Sunmere, where the silverleaf grows.',
    'Juni didn\'t speak for three days. Rowan kept setting out five cups every morning, and every morning it took him a long moment to put one back.',
    'Nobody called you Sprout that winter.',
  ], { hold: 3.6 });
  a.bars(false);
}

/**
 * (0.99.27) A few weeks on, at the training ground: Thessaly, of the Ninth Hand (the crown's hand that is in no
 * ledger). What Vesper was, as far as anyone knows; what the Unbound want. Nobody is certain of much.
 */
export async function thessalyScene(a) {
  const me = a.ctx.me;
  const R = TRAINING.ring;
  a.bars(true);
  await a.fade(1, 0);
  for (const who of ['rowan', 'juni', 'sorrel']) a.actor(who);
  a.actor('rowan').place(R.x + 1.0, R.z - 2.2).face(R.x, R.z);
  a.actor('juni').place(R.x - 1.6, R.z - 2.6).face(R.x, R.z);
  a.actor('sorrel').place(R.x + 2.6, R.z - 0.4).face(R.x, R.z);
  a.sheathe('rowan', true);
  a.hero(R.x - 0.2, R.z - 0.6, -Math.PI / 2);
  const T = { x: R.x - 0.7, z: R.z + 2.6 };
  a.actor('thessaly', T.x - 1, T.z + 9).face(me.x, me.z);
  await a.card(['Weeks went by. You trained, because Rowan said to, and because it was easier than not.']);
  await a.camera([R.x + 4, 2.2, R.z - 4], [R.x - 0.4, 1.0, R.z + 2], 0);
  await a.fade(0, 1.0);
  await a.walk('thessaly', T.x, T.z);
  a.actor('thessaly').face(me.x, me.z);
  for (const who of ['rowan', 'juni', 'sorrel']) a.actor(who).face(T.x, T.z);
  a.hero(undefined, undefined, Math.atan2(T.z - me.z, T.x - me.x));
  a.talkCam(true);
  await a.say('rowan', 'Training ground\'s closed.', { to: 'thessaly' });
  await a.say('thessaly', 'I won\'t keep you long. My name is Thessaly. I\'m with the Ninth Hand.', { to: 'rowan' });
  await a.say('juni', 'There\'s no such thing as the Ninth Hand. Everyone knows that.', { to: 'thessaly' });
  await a.say('thessaly', 'Good. That\'s rather the idea.', { to: 'juni' });
  await a.say('thessaly', 'The man in the Wakewood. We believe his name was Vesper Ashgrave. We think he was an officer of the Unbound, and not a junior one. A captain, perhaps. Possibly higher.', { to: 'hero' });
  await a.say('sorrel', 'You believe. You think. You don\'t sound very sure of anything.', { to: 'thessaly' });
  await a.say('thessaly', 'We aren\'t. The Unbound leave very little behind. Ash, mostly.', { to: 'sorrel' });
  await a.say('thessaly', 'What we have is pieces. They are searching for the Primordials: old powers, from a world before this one, grown out of everything people ever wanted badly enough.', { to: 'sorrel' });
  await a.say('thessaly', 'In that world, a few who drank from them were gifted beyond anything the sand allows. The Granted, their old texts say. The Unbound want to call the Primordials here, so their own can rise the same way.', { to: 'sorrel' });
  await a.say('rowan', 'And if they manage it?', { to: 'thessaly' });
  await a.say('thessaly', 'Then I expect Lacuna burns. Though I would very much like to be wrong.', { to: 'rowan' });
  await a.say('thessaly', 'He came a long way for you. We don\'t know why. I\'d like to.', { to: 'hero' });
  await a.say('thessaly', 'I\'m not here to take you anywhere. Only to say this: if they sent one, they may send another. When you\'re ready to ask questions, find me.', { to: 'hero' });
  await a.say('', 'She sets something on the fence post: a silver clasp shaped like a closed eye. Then she is gone, as if she was never there.');
  await a.say('juni', '...I still say there\'s no such thing.', { to: 'rowan' });
  await a.say('rowan', 'Then put it somewhere safe, Juni. For nothing.', { to: 'juni' });
  a.talkCam(false);
  a.quiet();
  a.remove('thessaly');
  await a.fade(1, 0.8);
  a.bars(false);
}

/** The Hounds follow the hero (on the hunt): each a few steps behind and to one side, walking or running to keep up. */
export function follow(actors, land) {
  const slot = { rowan: [-2.2, -1.4], ilse: [-2.6, 1.3], juni: [-1.2, 2.4], sorrel: [-3.6, 0.2] };
  return {
    update(dt, me) {
      const fx = Math.cos(me.facing), fz = Math.sin(me.facing);
      for (const [who, [back, side]] of Object.entries(slot)) {
        const a = actors[who];
        if (!a) continue;
        const tx = me.x + fx * back - fz * side, tz = me.z + fz * back + fx * side;
        const d = Math.hypot(tx - a.x, tz - a.z);
        if (d > 0.6) {
          const sp = d > 5 ? 5.4 : d > 2 ? 3.2 : 1.6;
          a.x += ((tx - a.x) / d) * Math.min(d, sp * dt);
          a.z += ((tz - a.z) / d) * Math.min(d, sp * dt);
          a.facing = Math.atan2(tz - a.z, tx - a.x);
          a.sync();
        }
      }
      separate(Object.keys(slot).map((w) => actors[w]).filter(Boolean), me, 1.0, land);
      for (const who of Object.keys(slot)) {
        const a = actors[who];
        if (!a) continue;
        if (a.looping !== 'idle' && !a.once && !a.held) a.loop('idle'); // (0.99.27) walk or run: the actor's own feet decide
        a.update(dt);
      }
    },
  };
}
