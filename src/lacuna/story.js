// Lacuna (Chapter 2), Act I: the opening, Quest 1 "Waking Up" and Quest 2 "The Crystal". Played in this browser (the scene and the
// Company walking you to town are yours alone, even on the shared land). Progress is kept in this browser for
// now (STORY_KEY); with accounts it moves to the server.
//
// The opening: the crack on the Verge opens, a husk runs into it, the hero follows; wakes in a glade in the
// Wakewood, powerless; wolves; the Iron Hounds (Rowan, Ilse, Juni, Sorrel) cut them down. Then they walk
// the hero along the road to Sunmere, talking on the way, waiting if the hero falls behind.
import { GLADE, TOWN, CRYSTAL, TRAINING, roadDist } from './land.js';
import { separate } from './actor.js';

export const STORY_KEY = 'lacuna-story-v1';
export const QUESTS = {
  stumble: { name: 'Waking Up', goal: 'Find a way out of the glade' },
  rescued: { name: 'Waking Up', goal: 'Sorrel is studying the crack. Go and see.' },
  waking: { name: 'Waking Up', goal: 'Follow the Iron Hounds to Sunmere' },
  crystal: { name: 'The Telling Glass', goal: 'Meet the Iron Hounds at the Adventurers\' Guild, on the north side of the plaza' },
  path: { name: 'Choosing a Path', goal: 'Meet the Iron Hounds at their training ground, outside Sunmere\'s east gate' },
  ambush: { name: 'When It Counts', goal: 'The Iron Hounds will take you on your first hunt (the next part of the story is coming)' },
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
  a.actor('sorrel', juniAt.x + 3, juniAt.z - 1);
  a.actor('ilse', juniAt.x + 1, juniAt.z - 1.5);
  a.camera([R.x - Math.cos(away) * 6 + 3, 2.6, R.z - Math.sin(away) * 6 + 3], [R.x, 1, R.z], 1.2);
  await a.walk('rowan', wolves[1].x + Math.cos(away) * 1.4, wolves[1].z + Math.sin(away) * 1.4, { run: true });
  a.actor('rowan').face(wolves[1].x, wolves[1].z);
  await a.anim('rowan', 'slash', { speed: 1.2 });
  fx.puff(wolves[1].x, wolves[1].z);
  a.remove('wolf2');
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
  await a.say('ilse', 'You\'re scraped up, but nothing\'s broken. And you\'re pale as milk. When did you last eat?', { cam: false });
  fx.ring(R.x, R.z, 1.4, 0x8fff9a, 1.2);
  a.ctx.heal();
  a.fog(0.5, 2);
  await a.say('', 'Warmth, from her hands. The fog draws back a little. Not all the way.');
  await a.say('ilse', '...There. Better?', { cam: false });
  a.loop('ilse', 'idle');
  ilse.stay = false;
  await a.walk('juni', R.x + 2.4, R.z + 1.2, { run: true });
  await a.say('juni', 'Did you see that? One arrow! From all the way up on the bank!');
  await a.say('rowan', 'We saw, Juni.', { to: 'juni' });
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
  await a.say('rowan', 'Leave it. Whoever you are, you\'re coming with us.');
  a.anim('rowan', 'wave');
  await a.say('rowan', 'We\'re the Iron Hounds. Sellswords, out of Sunmere. It\'s not far, and there\'s a hot meal at the end of it.');
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
    { at: total - 36, lines: [['rowan', 'There she is. Sunmere.'], ['rowan', 'We\'ll take you to the Guild in the morning. They\'ll want to read you.'], ['', 'Read you?'], ['juni', 'It doesn\'t hurt! Mostly.']] },
  ];
  let lead = 0, said = 0, waiting = false, finished = false;
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
      for (const who of order) {
        const a = actors[who];
        if (!a) continue;
        const p = at(lead - lag[who] - 3.5);
        const tx = p.x + p.nx * side[who], tz = p.z + p.nz * side[who];
        const d = Math.hypot(tx - a.x, tz - a.z);
        if (d > 0.25 && !waiting) {
          const sp = Math.min(d * 2.2, d > 3 ? 4.6 : 2.7);
          a.x += ((tx - a.x) / d) * Math.min(d, sp * dt);
          a.z += ((tz - a.z) / d) * Math.min(d, sp * dt);
          a.facing = Math.atan2(tz - a.z, tx - a.x);
          a.sync();
          if (a.looping !== (sp > 3.5 ? 'run' : 'walk') && !a.once) a.loop(sp > 3.5 ? 'run' : 'walk');
        } else if (a.looping !== 'idle' && !a.once) {
          a.loop('idle');
          a.face(me.x, me.z);
        }
        // near the hero, they look at them now and then (stopped, or waiting)
        a.lookTarget = Math.hypot(me.x - a.x, me.z - a.z) < 7 ? { x: me.x, z: me.z } : null;
        a.update(dt);
      }
      separate(order.map((w) => actors[w]).filter(Boolean), me, 1.0, land);
    },
  };
  return st;
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
  cr.mark(false);
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
  a.talkCam(true);
  await a.say('odile', 'Aptitude is set at birth, child. I am sorry. The Guild registers anyone, so you may take work here, but you will be rank F, and rank F does not change.');
  a.walk('juni', ...P(-2.7, -1.5));
  await a.say('juni', 'Say it again, Dace. Go on. To my face.', { to: 'dace' });
  await a.say('dace', 'Easy, Hound. Keep your stray on a leash.', { to: 'juni' });
  await a.say('rowan', 'Juni. Leave it.', { to: 'juni' });
  a.walk('dace', ...P(-1.2, 10));
  await a.say('wren', 'Good luck. I mean it.');
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
  // Sorrel, at the glass: the grains the hero stirred have turned black, and stand in a line
  a.walk('sorrel', ...P(-1.0, -0.9));
  a.talkCam(false);
  a.quiet();
  await a.camera(V(-2.6, -2.2, 1.9), V(0, 0, 1.75), 1.2);
  cr.mark(true);
  await a.wait(2.6);
  await a.say('sorrel', 'Rowan.', { to: 'rowan', cam: false });
  await a.camera(V(-1.5, 0.6, 1.85), V(0, 0, 1.75), 1.4);
  await a.say('', 'The grains you stirred have turned black. They have drawn themselves into a thin, upright line in the middle of the glass, and they are not moving.');
  await a.say('sorrel', 'Sand settles. That isn\'t settling. That\'s not an element.', { to: 'rowan', cam: false });
  a.talkCam(true);
  await a.say('rowan', 'Then what is it?', { to: 'sorrel' });
  await a.say('sorrel', 'It looks like the tear in the forest. And I don\'t like that I know that.', { to: 'rowan' });
  await a.say('odile', 'The glass is old. It does that, now and then. Off you go, all of you. Next!');
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
      { id: 'cleave', text: 'Cleave the posts in the ring', need: 6, done: 'Good. Feel that? Every post you hit gives you a little mana back. Battle Rhythm: the fight feeds you.' },
      { id: 'skyfall', text: 'Skyfall (Q) into the ring: two posts with one landing', need: 1, done: 'That\'s it. Land in the middle of them; they never see it coming.' },
      { id: 'blood', text: 'Hold Whirlwind (E) until your mana runs dry, and keep spinning on blood (Skyfall first burns mana faster)', need: 1, done: 'There. That\'s the Blood Price. Out of mana, you pay in blood, and under half you hit harder and heal by hitting. Mind you don\'t pay it all.' },
    ],
    start: [['rowan', 'Into the ring. Cut. Don\'t think, cut.']],
    end: [['rowan', 'Not bad for a three.'], ['juni', 'My turn! Bow\'s by the line. Come on!']],
  },
  archer: {
    teacher: 'juni',
    title: 'Juni\'s trial: the Sharpshooter',
    steps: [
      { id: 'far', text: 'From the line, hit the far target (25 m off)', need: 1, done: 'See how hard that one landed? The further an arrow flies, the harder it hits. Long Watch.' },
      { id: 'ricochet', text: 'One Ricochet (Q) through all three targets', need: 1, done: 'Ha! One arrow, three targets. That\'s how you clear a road.' },
      { id: 'deadeye', text: 'Hold Deadeye (R): pour in 30 mana or more, then let go at a target', need: 1, done: 'Now that\'s a shot. The longer you hold, the more you pour in. Stand still and breathe between, and your mana comes back faster.' },
    ],
    start: [['juni', 'Stand on the line. Bow up. The far one first.']],
    end: [['juni', 'You\'ve got good hands.'], ['rowan', 'Both ways, then. Now choose.']],
  },
};
