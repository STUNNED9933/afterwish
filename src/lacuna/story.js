// Lacuna (Chapter 2), Act I: the opening, Quest 1 "Waking Up" and Quest 2 "The Crystal". Played in this browser (the scene and the
// Company walking you to town are yours alone, even on the shared land). Progress is kept in this browser for
// now (STORY_KEY); with accounts it moves to the server.
//
// The opening: the crack on the Verge opens, a husk runs into it, the hero follows; wakes in a glade in the
// Wakewood, powerless; wolves; the Iron Hounds (Rowan, Ilse, Juni, Sorrel) cut them down. Then they walk
// the hero along the road to Sunmere, talking on the way, waiting if the hero falls behind.
import { GLADE, TOWN, CRYSTAL, TRAINING, roadDist } from './land.js';
import { buildCrack } from '../render/gates.js';
import { separate } from './actor.js';

export const STORY_KEY = 'lacuna-story-v1';
export const QUESTS = {
  waking: { name: 'Waking Up', goal: 'Follow the Iron Hounds to Sunmere' },
  crystal: { name: 'The Crystal', goal: 'Meet the Iron Hounds at the Adventurers\' Guild, on the north side of the plaza' },
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

/** The opening scene. `a`: the cutscene api. */
export async function opening(a) {
  const { fx } = a;
  const scene = a.ctx.view.scene;
  a.bars(true);
  await a.fade(1, 0);
  a.hero(H.x, H.z, -Math.PI / 2 + 0.4, 'lie');
  const tear = buildCrack(TEAR);
  tear.group.scale.setScalar(1.25);
  scene.add(tear.group);
  let tearT = 0, closing = 0;
  const tearTick = setInterval(() => {
    tearT += 0.033;
    tear.anim(0.033, tearT);
    if (closing > 0) {
      // it closes to a thin, faint sliver: what is left of a door
      closing = Math.min(0.93, closing + 0.05);
      tear.group.scale.set(1.25 * (1 - closing), 1.25 * (1 - closing * 0.35), 1.25 * (1 - closing));
    }
  }, 33);
  a.ctx.onEnd(() => { clearInterval(tearTick); scene.remove(tear.group); });

  await a.card([
    'Votum. The Verge, where the keep\'s road ends.',
    'For weeks the crack in the air had only hummed. That night it opened, and a husk ran straight into it, as if something on the other side had called its name.',
    'You went after it.',
    'The light was very bright. Then it was nothing at all.',
  ]);
  // Waking: low in the grass, the world blurred
  a.blur(9);
  await a.camera([H.x + 1.4, 0.45, H.z + 0.9], [H.x - 0.2, 0.25, H.z], 0);
  await a.fade(0, 2.2);
  await a.say('', '...Grass. Warm grass.');
  a.blur(5, 2);
  await a.camera([H.x + 1.6, 0.7, H.z + 1.4], [TEAR.x, 2.6, TEAR.z], 3);
  await a.say('', 'The air smells of pine and something sweet. Not ash. Not the keep\'s smoke.');
  await a.say('', 'The crack. It\'s still there, right above you, and it\'s closing.');
  closing = 0.01;
  a.shake(0.2, 0.5);
  await a.wait(0.8);
  await a.prompt('Space', 'Get up', { times: 4, onTap: () => { a.shake(0.12, 0.2); } });
  a.blur(0, 1.2);
  a.hero(undefined, undefined, -Math.PI / 2 + 0.4, 'rise');
  await a.camera([H.x + 3.2, 1.9, H.z + 4.2], [H.x, 1.2, H.z], 1.8);
  await a.say('', 'No husk. No Verge. A forest you have never seen, and a sky so blue it looks painted.');
  // Wolves
  const wolves = [
    a.actor('wolf1', GLADE.x - 16, GLADE.z - 3), a.actor('wolf2', GLADE.x - 13, GLADE.z + 10), a.actor('wolf3', GLADE.x - 17, GLADE.z + 4),
  ];
  wolves.forEach((w) => w.face(H.x, H.z));
  a.hero(undefined, undefined, Math.atan2(wolves[2].z - H.z, wolves[2].x - H.x)); // toward the sound
  await a.say('', 'Something growls in the trees.');
  a.camera([H.x + 4, 2.4, H.z + 3], [GLADE.x - 9, 0.8, GLADE.z + 2], 1.6);
  await Promise.all([a.walk('wolf1', H.x - 6, H.z - 3), a.walk('wolf2', H.x - 5, H.z + 4), a.walk('wolf3', H.x - 7, H.z + 1)]);
  a.watch('wolf3'); // eyes on the wolves from here until help comes
  wolves.forEach((w) => w.face(H.x, H.z));
  await a.say('', 'You reach for a sword that isn\'t there. You reach for the Link, for the wish, for anything at all.');
  await a.say('', 'Nothing answers. Whatever you were in Votum, you are not it here.');
  // The first lunge: roll away
  a.walk('wolf1', H.x - 1.2, H.z - 0.8, { run: true });
  await a.wait(0.25);
  await a.prompt('KeyE', 'Roll away!', { label: 'E' });
  a.busy(true);
  a.hero(H.x + 3, H.z + 1.5, Math.PI, 'hop');
  a.shake(0.1, 0.2);
  await a.wait(0.6);
  wolves[0].face(H.x + 3, H.z + 1.5);
  // The second: too slow (seen from further off: the hero and the wolves in one shot)
  a.camera([H.x + 10, 2.6, H.z + 6.5], [H.x - 1.5, 0.8, H.z + 0.5], 0.5);
  a.walk('wolf2', H.x + 2, H.z + 2.6, { run: true });
  await a.wait(0.45);
  a.shake(0.35, 0.45);
  a.ctx.hurt();
  a.hero(undefined, undefined, undefined, 'land');
  await a.say('', 'Too slow.');
  await a.walk('wolf3', H.x + 1.4, H.z - 0.2, { run: true });
  // The Marigold Company
  const juniAt = { x: H.x + 7, z: H.z - 9 }; // at the edge of the glade, bow up
  a.actor('juni', juniAt.x, juniAt.z).face(H.x, H.z);
  a.watch(null);
  a.camera([H.x + 1.5, 2.2, H.z + 7], [juniAt.x - 1, 1.3, juniAt.z + 1], 0.4); // the hero down in front, Juni at the trees
  fx.shot({ x: juniAt.x, z: juniAt.z, dx: (wolves[0].x - juniAt.x) / Math.hypot(wolves[0].x - juniAt.x, wolves[0].z - juniAt.z), dz: (wolves[0].z - juniAt.z) / Math.hypot(wolves[0].x - juniAt.x, wolves[0].z - juniAt.z), speed: 70, range: Math.hypot(wolves[0].x - juniAt.x, wolves[0].z - juniAt.z), kind: 'arrow' });
  await a.wait(0.35);
  fx.puff(wolves[0].x, wolves[0].z);
  a.remove('wolf1');
  await a.say('juni', 'Got one! Rowan, there\'s someone down here!');
  a.actor('rowan', ROAD_IN.x, ROAD_IN.z + 2);
  a.actor('sorrel', ROAD_IN.x + 2, ROAD_IN.z + 1);
  a.actor('ilse', ROAD_IN.x + 1, ROAD_IN.z);
  a.camera([H.x + 7, 2.6, H.z - 2], [H.x + 1, 1, H.z + 1.5], 1.2);
  await a.walk('rowan', wolves[1].x - 1.4, wolves[1].z + 1.2, { run: true }); // to the wolf's far side from the hero
  a.actor('rowan').face(wolves[1].x, wolves[1].z);
  await a.anim('rowan', 'slash', { speed: 1.2 });
  fx.puff(wolves[1].x, wolves[1].z);
  a.remove('wolf2');
  a.walk('sorrel', ROAD_IN.x - 1, ROAD_IN.z + 7);
  await a.wait(0.9);
  a.actor('sorrel').face(wolves[2].x, wolves[2].z);
  a.anim('sorrel', 'cast');
  await a.wait(0.5);
  const s = a.actor('sorrel'), w3 = wolves[2];
  const d = Math.hypot(w3.x - s.x, w3.z - s.z) || 1;
  fx.shot({ x: s.x, z: s.z, dx: (w3.x - s.x) / d, dz: (w3.z - s.z) / d, speed: 30, range: d, kind: 'deadeye' });
  await a.wait(d / 30);
  fx.ring(w3.x, w3.z, 2.2, 0xff8a3a, 0.5);
  await a.walk('wolf3', GLADE.x - 24, GLADE.z + 6, { run: true, speed: 8 });
  a.remove('wolf3');
  // Safe. They gather round: Rowan in front, Ilse kneeling at your side, Juni a little off, Sorrel at the tear.
  const HR = { x: H.x + 3, z: H.z + 1.5 };
  a.busy(false);
  a.hero(undefined, undefined, Math.atan2(ROAD_IN.z - HR.z, ROAD_IN.x - HR.x));
  await a.walk('rowan', HR.x + 1.7, HR.z - 0.9);
  a.talkCam(true);
  await a.say('rowan', 'Easy. Easy, friend. You\'re all right now.');
  await a.walk('ilse', HR.x - 0.2, HR.z - 1.05, { run: true });
  const ilse = a.actor('ilse');
  ilse.stay = true;
  ilse.face(HR.x, HR.z);
  a.loop('ilse', 'kneel');
  // a two-shot from the side for the healing: both of them in view
  await a.camera([HR.x - 2.6, 1.25, HR.z + 1.4], [HR.x - 0.1, 0.75, HR.z - 0.5], 0.6);
  await a.say('ilse', 'Hold still. You\'re scraped up, but nothing\'s broken.', { cam: false });
  fx.ring(HR.x, HR.z, 1.4, 0x8fff9a, 1.2);
  a.ctx.heal();
  await a.say('ilse', '...There. Better?', { cam: false });
  a.loop('ilse', 'idle');
  ilse.stay = false;
  await a.walk('juni', HR.x + 2.6, HR.z + 1.4, { run: true });
  await a.say('juni', 'Did you see that? One arrow! From all the way up on the bank!');
  await a.say('rowan', 'We saw, Juni.', { to: 'juni' });
  // Sorrel, at the tear: he calls Rowan over without taking his eyes off it
  await a.walk('sorrel', TEAR.x + 1.1, TEAR.z + 0.9);
  const sorrel = a.actor('sorrel');
  sorrel.stay = true;
  sorrel.face(TEAR.x, TEAR.z);
  a.quiet();
  // from beyond the sliver, onto his face
  await a.camera([TEAR.x - 2.0, 1.75, TEAR.z - 1.5], [TEAR.x + 1.1, 1.55, TEAR.z + 0.9], 1.1);
  await a.say('sorrel', 'Rowan. Come and look at this. The air here has been torn, and not long ago.', { to: 'rowan', cam: false });
  await a.walk('rowan', TEAR.x + 2.5, TEAR.z + 2.3);
  await a.say('rowan', 'Can it wait until we\'re out of the wolves\' woods?', { to: 'sorrel' });
  sorrel.stay = false;
  await a.say('sorrel', 'It can wait. I\'m not sure it should.', { to: 'rowan' });
  a.quiet();
  await Promise.all([a.walk('sorrel', HR.x + 1.4, HR.z - 2.4), a.walk('rowan', HR.x + 1.7, HR.z - 0.9)]);
  await a.say('juni', 'So where did you come from? You weren\'t here when we came down the road. Then you were.');
  await a.say('', 'You open your mouth to explain, and realise you don\'t know how.');
  await a.say('rowan', 'Leave it. Whoever you are, you\'re coming with us.');
  a.anim('rowan', 'wave');
  await a.say('rowan', 'We\'re the Iron Hounds. Sellswords, out of Sunmere. It\'s not far, and there\'s a hot meal at the end of it.');
  await a.say('ilse', 'And a bath. Please, a bath.');
  a.talkCam(false);
  a.quiet();
  a.ctx.onEnd(null);
  clearInterval(tearTick);
  scene.remove(tear.group);
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
    { at: 62, lines: [['ilse', 'Sunmere\'s a good town. Loud, but good. Everyone there is busy being something.'], ['juni', 'Busy being whatever the crystal told them they are, you mean.'], ['rowan', 'Juni.']] },
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
/** The Company waits in the yard, facing the crystal; Odile by it. */
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

/** Quest 2, The Crystal: the hero's aptitude is read at the Guild. `a`: the cutscene api; a.ctx.crystal: the crystal. */
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
  cr.ember(false);
  await a.camera(V(-12, 3.4, 3.4), V(1.5, 0, 2.4), 0);
  await a.fade(0, 1.2);
  a.camera(V(-9, 2.2, 2.6), V(0.5, 0, 2.2), 5);
  await a.say('', 'The Adventurers\' Guild of Sunmere: a grey stone hall hung with red banners, a yard full of people, and in the middle of the yard a crystal taller than a man.');
  a.talkCam(true);
  await a.say('juni', 'Everyone who wants to be an adventurer starts here. One hand on the crystal, and it shows what you were born with.');
  await a.say('ilse', 'It doesn\'t hurt. It just... knows.');
  await a.say('sorrel', 'Aptitude is fixed at birth. Training sharpens technique, nothing more. The number is the number.');
  a.talkCam(false);
  a.quiet();
  // Dace first: the crystal blazes
  await a.camera(V(-0.4, 4.2, 1.8), V(-0.1, 0, 1.75), 0.9);
  await a.say('odile', 'Dace, of the Silver Sash. Your yearly reading. Your hand on the crystal, if you please.', { to: 'dace', cam: false });
  cr.read(0.95, 0xffe7a0);
  a.shake(0.04, 0.5);
  await a.camera(V(-3.4, 1.4, 1.3), V(0, 0, 2.6), 1.6);
  await a.wait(0.6);
  await a.say('odile', 'Eighty-one. The same as last year, and the year before. Well done.', { to: 'dace', cam: false });
  a.anim('dace', 'cheer');
  await a.say('', 'Applause round the yard. Somebody whistles.');
  cr.rest();
  a.talkCam(true);
  await a.say('dace', 'Just making sure it still likes me.', { to: 'wren' });
  a.walk('dace', ...P(-2.6, 2.9));
  await a.say('wren', 'It likes everyone over seventy, Dace. Move.', { to: 'dace' });
  await a.say('odile', 'Next. You, with the Iron Hounds. Your hand on the crystal.');
  await a.say('rowan', 'Go on. We\'re right behind you.');
  a.talkCam(false);
  a.quiet();
  // the hero walks up
  a.camera(V(-6.6, -1.8, 2.3), V(-1, 0, 1.6), 2.4);
  await a.heroWalk(...P(-1.2, 0), 2.4);
  a.hero(undefined, undefined, F);
  await a.camera(V(-2.7, 1.0, 1.8), V(0.2, -0.1, 1.95), 0.9);
  await a.say('', 'The crystal is cold. Colder than it looks.');
  await a.prompt('KeyE', 'Place your hand on the crystal', { label: 'E' });
  cr.read(0.03, 0x9fd0ff);
  await a.wait(1.8);
  await a.say('', 'For a moment, nothing at all. Then a flicker, faint as a candle across a field.');
  await a.camera(V(-0.4, 4.2, 1.8), V(-0.1, 0, 1.75), 0.8);
  await a.wait(0.8);
  await a.say('odile', 'Three.', { to: 'hero', cam: false });
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
  // Sorrel, at the crystal: it has not gone out
  a.walk('sorrel', ...P(-1.0, -0.9));
  a.talkCam(false);
  a.quiet();
  await a.camera(V(-2.6, -2.2, 1.9), V(0, 0, 2.05), 1.2);
  cr.ember(true);
  await a.wait(2.2);
  await a.say('sorrel', 'Rowan.', { to: 'rowan', cam: false });
  await a.camera(V(-1.9, 0.9, 2.2), V(0, 0, 2.05), 1.4);
  await a.say('sorrel', 'It\'s still glowing. A reading ends when the hand comes away. This one hasn\'t.', { to: 'rowan', cam: false });
  a.talkCam(true);
  await a.say('rowan', 'Meaning?', { to: 'sorrel' });
  await a.say('sorrel', 'Meaning I don\'t know. And I don\'t like not knowing.', { to: 'rowan' });
  await a.say('odile', 'The crystal is old. It does that, now and then. Off you go, all of you. Next!');
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
  await a.say('rowan', 'The crystal measures what you were born with. Out here we measure what you do with it.');
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
