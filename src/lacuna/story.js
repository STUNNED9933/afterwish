// Lacuna (Chapter 2), Act I: the opening and Quest 1, "Waking Up". Played in this browser (the scene and the
// Company walking you to town are yours alone, even on the shared land). Progress is kept in this browser for
// now (STORY_KEY); with accounts it moves to the server.
//
// The opening: the crack on the Verge opens, a husk runs into it, the hero follows; wakes in a glade in the
// Wakewood, powerless; wolves; the Marigold Company (Rowan, Ilse, Juni, Sorrel) cut them down. Then they walk
// the hero along the road to Sunmere, talking on the way, waiting if the hero falls behind.
import { GLADE, TOWN, roadDist } from './land.js';
import { buildCrack } from '../render/gates.js';

export const STORY_KEY = 'lacuna-story-v1';
export const QUESTS = {
  waking: { name: 'Waking Up', goal: 'Follow the Marigold Company to Sunmere' },
  crystal: { name: 'The Crystal', goal: 'The Adventurers\' Guild reads you in the morning (the next part of the story is coming)' },
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
      closing = Math.min(1, closing + 0.05);
      tear.group.scale.set(1.25 * (1 - closing), 1.25 * (1 + closing * 0.3), 1.25 * (1 - closing));
      if (closing >= 1) { scene.remove(tear.group); clearInterval(tearTick); }
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
  await a.say('', 'Something growls in the trees.');
  a.camera([H.x + 4, 2.4, H.z + 3], [GLADE.x - 9, 0.8, GLADE.z + 2], 1.6);
  await Promise.all([a.walk('wolf1', H.x - 6, H.z - 3), a.walk('wolf2', H.x - 5, H.z + 4), a.walk('wolf3', H.x - 7, H.z + 1)]);
  wolves.forEach((w) => w.face(H.x, H.z));
  await a.say('', 'You reach for a sword that isn\'t there. You reach for the Link, for the wish, for anything at all.');
  await a.say('', 'Nothing answers. Whatever you were in Votum, you are not it here.');
  // The first lunge: roll away
  a.walk('wolf1', H.x - 1.2, H.z - 0.8, { run: true });
  await a.wait(0.25);
  await a.prompt('KeyE', 'Roll away!', { label: 'E' });
  a.hero(H.x + 3, H.z + 1.5, Math.PI, 'hop');
  a.shake(0.1, 0.2);
  await a.wait(0.6);
  wolves[0].face(H.x + 3, H.z + 1.5);
  // The second: too slow
  a.walk('wolf2', H.x + 2, H.z + 2.6, { run: true });
  await a.wait(0.45);
  a.shake(0.35, 0.45);
  a.ctx.hurt();
  a.hero(undefined, undefined, undefined, 'land');
  await a.say('', 'Too slow.');
  await a.walk('wolf3', H.x + 1.4, H.z - 0.2, { run: true });
  // The Marigold Company
  const juniAt = { x: ROAD_IN.x - 3, z: ROAD_IN.z + 8 };
  a.actor('juni', juniAt.x, juniAt.z).face(H.x, H.z);
  fx.shot({ x: juniAt.x, z: juniAt.z, dx: (wolves[0].x - juniAt.x) / Math.hypot(wolves[0].x - juniAt.x, wolves[0].z - juniAt.z), dz: (wolves[0].z - juniAt.z) / Math.hypot(wolves[0].x - juniAt.x, wolves[0].z - juniAt.z), speed: 70, range: Math.hypot(wolves[0].x - juniAt.x, wolves[0].z - juniAt.z), kind: 'arrow' });
  await a.wait(0.35);
  fx.puff(wolves[0].x, wolves[0].z);
  a.remove('wolf1');
  await a.say('juni', 'Got one! Rowan, there\'s someone down here!');
  a.actor('rowan', ROAD_IN.x, ROAD_IN.z + 2);
  a.actor('sorrel', ROAD_IN.x + 2, ROAD_IN.z + 1);
  a.actor('ilse', ROAD_IN.x + 1, ROAD_IN.z);
  a.camera([H.x + 7, 2.6, H.z - 2], [H.x + 1, 1, H.z + 1.5], 1.2);
  await a.walk('rowan', wolves[1].x + 1.6, wolves[1].z - 0.6, { run: true });
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
  // Safe
  const r = a.actor('rowan');
  r.face(H.x + 3, H.z + 1.5);
  a.hero(undefined, undefined, Math.atan2(r.z - (H.z + 1.5), r.x - (H.x + 3)));
  await a.camera([H.x + 6.5, 2, H.z + 3.5], [H.x + 3.2, 1.3, H.z + 1], 1.2);
  await a.say('rowan', 'Easy. Easy, friend. You\'re all right now.');
  await a.walk('ilse', H.x + 3.9, H.z + 2.3, { run: true });
  a.actor('ilse').face(H.x + 3, H.z + 1.5);
  a.loop('ilse', 'kneel');
  await a.say('ilse', 'Hold still. You\'re scraped up, but nothing\'s broken.');
  fx.ring(H.x + 3, H.z + 1.5, 1.6, 0x8fff9a, 1.2);
  a.ctx.heal();
  await a.say('ilse', '...There. Better?');
  a.loop('ilse', 'idle');
  await a.walk('juni', H.x + 5.5, H.z - 0.5, { run: true });
  a.actor('juni').face(H.x + 3, H.z + 1.5);
  await a.say('juni', 'Did you see that? One arrow! From all the way up on the bank!');
  await a.say('rowan', 'We saw, Juni.');
  await a.walk('sorrel', TEAR.x + 0.8, TEAR.z + 0.6);
  a.actor('sorrel').face(TEAR.x, TEAR.z);
  await a.camera([TEAR.x + 4, 2.2, TEAR.z + 3], [TEAR.x, 1.8, TEAR.z], 1.2);
  await a.say('sorrel', 'Rowan. Come and look at this. The air here has been torn, and not long ago.');
  await a.say('rowan', 'Can it wait until we\'re out of the wolves\' woods?');
  await a.say('sorrel', 'It can wait. I\'m not sure it should.');
  await a.camera([H.x + 7, 2.1, H.z + 3.8], [H.x + 3.5, 1.3, H.z + 0.8], 1.2);
  await a.say('juni', 'So where did you come from? You weren\'t here when we came down the road. Then you were.');
  await a.say('', 'You open your mouth to explain, and realise you don\'t know how.');
  a.actor('rowan').face(H.x + 3, H.z + 1.5);
  await a.say('rowan', 'Leave it. Whoever you are, you\'re coming with us.');
  a.anim('rowan', 'wave');
  await a.say('rowan', 'We\'re the Marigold Company. Adventurers, out of Sunmere. It\'s not far, and there\'s a hot meal at the end of it.');
  await a.say('ilse', 'And a bath. Please, a bath.');
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
export function walkToTown(actors, bark, onDone, from = ROAD_IN) {
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
        a.update(dt);
      }
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

void roadDist;
