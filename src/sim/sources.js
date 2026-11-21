// Where things come from (0.67): worked out from the game's own tables, never written out by hand, so a
// tooltip's "Where to find more" stays true when a number changes or a new source is added. Each source
// below reads the table that actually pays out (the same one world.js uses); quests, the merchant's stock
// and wares, chests and boss hoards are scanned, so a new quest or ware that pays something shows up here
// by itself.
import { CONFIG } from '../config.js';
import { QUESTS, BOSS_LOOT } from './story.js';
import { ENEMIES } from './defs.js';
import { MERCHANT, BOUNTY, FRAGMENTS, GLASS, SIGIL, THIEF, RARE, REMNANT, EVENTS, ELITE_SPOILS } from './surprises.js';
import { CHEST_TIERS, CACHES, RARITIES } from './items.js';
import { RING, ringCost } from './ring.js';
import { WEEKLY_REWARD } from './trial.js';

const pct = (x) => `${+(x * 100).toFixed(x < 0.01 ? 2 : x < 0.1 ? 1 : 0)}%`;
const range = (a, b) => (a === b ? `${a}` : `${a} to ${b}`);
const list = (names, n = 4) => (names.length <= n ? names.join(', ') : `${names.slice(0, n).join(', ')} and ${names.length - n} more`);

/** The quests that pay `key` (reading every tier's reward), as one line each: "Come Home (20 to 80, once on each world tier)". */
function questLines(key) {
  const out = [];
  for (const q of Object.values(QUESTS)) {
    const rewards = q.tiers ? Object.values(q.tiers) : [q.reward || {}];
    const give = q.give || {};
    const ns = rewards.map((r) => r[key] || 0).concat(give[key] ? [give[key]] : []).filter((n) => n > 0);
    if (!ns.length) continue;
    const when = q.perTier ? ', once on each world tier every life' : q.repeat ? ', again and again' : q.act3 ? ', once a hero' : '';
    out.push({ name: q.name, n: range(Math.min(...ns), Math.max(...ns)), when });
  }
  if (!out.length) return [];
  const show = (o) => `${o.name} (${o.n}${o.when})`;
  if (out.length <= 3) return [`${out.length === 1 ? 'The quest' : 'Quests:'} ${out.map(show).join(', ')}`];
  // many: name the ones you can do again, and count the rest
  const again = out.filter((o) => o.when.includes('again') || o.when.includes('each world tier'));
  const rest = out.length - again.length;
  return [...again.map((o) => `The quest ${show(o)}`), ...(rest ? [`${rest} ${again.length ? 'other ' : ''}quests along the story`] : [])];
}

/** What the travelling merchant sells of `kind` (his usual stock and the wares he brings some days). */
function merchantLines(kind, unit) {
  const out = [];
  for (const s of MERCHANT.stock) if (s.kind === kind) out.push(`${s.n ? `${s.n} ` : ''}for ${s.gold ? 'gold' : `${s.tickets} shards`}${s.chance ? ` (on ${pct(s.chance)} of his visits)` : ''}`);
  const total = MERCHANT.wares.reduce((a, w) => a + w.weight, 0);
  for (const w of MERCHANT.wares) {
    if (w.kind !== kind) continue;
    let none = 1;
    for (let i = 0; i < MERCHANT.wareSlots; i++) none *= 1 - w.weight / total;
    const each = 1 - none; // at least one slot of it
    out.push(`${w.n ? `${range(w.n[0], w.n[1])} ${unit} a pack` : 'one'} for ${w.goldEach ? 'gold' : `${w.tickets} shards`}, on ${pct(each)} of his visits`);
  }
  return out.length ? [`The travelling merchant: ${out.join('; ')}`] : [];
}

/** Boss hoards that pay `key` (keys or tickets), as a range. */
function bossLines(key, label) {
  const ns = Object.entries(BOSS_LOOT).filter(([, L]) => L[key] > 0);
  if (!ns.length) return [];
  const vals = ns.map(([, L]) => L[key]);
  return [`${label} (${range(Math.min(...vals), Math.max(...vals))} from each: ${list(ns.map(([id]) => ENEMIES[id] ? ENEMIES[id].name : id), 3)})`];
}

/** Every place `key` comes from: 'fragment', 'glass', 'sigil', 'keys', 'tickets', 'dust', 'gold', 'scrap', 'essence'. */
export function sourcesOf(key) {
  const L = [];
  const add = (...lines) => L.push(...lines.filter(Boolean));
  if (key === 'fragment') {
    add(`Bounties in Haven (${range(BOUNTY.fragments[0], BOUNTY.fragments[1])} each)`);
    add(`Remnants (${FRAGMENTS.remnant})`, `World events (${FRAGMENTS.event})`, `Storied enemies (${FRAGMENTS.storied})`, `Wishthieves (${FRAGMENTS.thief})`);
    add(`Elites (${pct(ELITE_SPOILS.fragment)} chance of 1)`);
    if (CHEST_TIERS.radiant && CHEST_TIERS.radiant.fragments) add(`Radiant chests (${range(FRAGMENTS.radiant[0], FRAGMENTS.radiant[1])})`);
    add(...questLines('fragments'), ...merchantLines('fragment', 'Fragments'));
    add(`An Echo Ring run for Immortal Fragments (about ${RING.fragment} a wave at the start, more the deeper you go)`);
    add(`The Weekly Echo (${WEEKLY_REWARD.fragments} for each week you place)`);
  } else if (key === 'glass') {
    add(...merchantLines('glass'), `Remnants (${pct(GLASS.remnant)})`, `Wishthieves (${pct(GLASS.thief)})`, `Storied enemies (${pct(GLASS.storied)})`);
    add(`Bounties in Haven (${pct(BOUNTY.glass)} with the reward)`, 'A Delve finished at a new tier (the first time)', ...questLines('glass'));
  } else if (key === 'sigil') {
    add(`World events (${pct(SIGIL.event)})`, `Storied enemies (${pct(SIGIL.storied)})`, `Bounties in Haven (once you have beaten a boss ${REMNANT.after} times)`, 'A Delve finished at a new tier (the first time)');
  } else if (key === 'keys') {
    add(...bossLines('keys', 'Bosses'), ...questLines('keys'), ...merchantLines('keys', 'keys'));
  } else if (key === 'tickets') {
    add(`A sliver in many enemies (${pct(CONFIG.TICKET_CHANCE)}), every big one`, ...bossLines('tickets', 'Bosses'));
    if (CHEST_TIERS.radiant && CHEST_TIERS.radiant.tickets) add(`Radiant chests (${CHEST_TIERS.radiant.tickets})`);
    add(`World event shrines (${EVENTS.shrine.tickets})`, ...questLines('tickets'), `Bounties in Haven (${range(BOUNTY.extra.tickets[0], BOUNTY.extra.tickets[1])}, some of them)`);
    add('Waves and bosses in the Echo Ring', `The Weekly Echo (${WEEKLY_REWARD.tickets} for each week you place)`);
  } else if (key === 'dust') {
    add('Scrapping Mythic and better gear');
    add(`Elites (${range(ELITE_SPOILS.dust[0], ELITE_SPOILS.dust[1])}), Storied enemies (${range(RARE.dust[0], RARE.dust[1])}), Remnants (${REMNANT.dust}) and Wishthieves (${THIEF.dust})`);
    add(`World event shrines (${EVENTS.shrine.dust})`, `Bounties in Haven (${range(BOUNTY.extra.dust[0], BOUNTY.extra.dust[1])}, some of them)`, ...questLines('dust'), ...merchantLines('dust', 'Wishdust'));
    add(`An Echo Ring run for Wishdust (about ${RING.dust} a wave at the start)`, `The Weekly Echo (${WEEKLY_REWARD.dust} for each week you place)`);
  } else if (key === 'gold') {
    add('Every enemy, chest and boss', 'Most quests', 'Bounties in Haven (some of them)', 'An Echo Ring run for gold');
  } else if (key === 'scrap') {
    add('Scrapping gear (Shift+click, or the scrap button)', ...questLines('scrap'));
  } else if (key === 'essence') {
    add('Rebirth: the gear you wear and carry, given up');
  }
  return L;
}

/** What a resource is spent on, from the same tables (the wallet's "What it is for"). */
export function usesOf(key) {
  const warden = CACHES.warden;
  const best = warden.odds.map((w, r) => [w, r]).filter(([w]) => w > 0);
  const lo = best[0][1], imm = warden.odds[6];
  switch (key) {
    case 'gold': return ['Blacksmith upgrades (+levels)', 'Rerolling and reforging lines', `Opening ${list(Object.values(CACHES).filter((c) => c.cost.gold).map((c) => c.name))}`, 'Skill points from the trainer, and respecs', 'The travelling merchant and Bounty Board swaps'];
    case 'tickets': return [`Waking the Echo Ring (${ringCost(1)} a run from wave 1, more further in)`, 'Echo Rifts at the Waygate (1)', 'The travelling merchant'];
    case 'scrap': return ['Blacksmith upgrades (+levels)', 'Rerolling lines'];
    case 'dust': return ['Reforging a line into a stat you choose'];
    case 'keys': return [`Opening ${warden.name}s at Bram's forge in Haven (${RARITIES[lo].name} or better${imm ? `, ${imm}% Immortal` : ''}); Shift+click opens 10`];
    case 'essence': return ['Recalling the best piece of a past life, in its prime', 'Rerolling lines instead of gold and scrap'];
    default: return [];
  }
}
