// (0.61.1) "What the Ring pays": the Echo Ring's rewards wave by wave for the chosen focus, and what a
// run from the chosen checkpoint adds up to, so a player knows what to expect (gear: rarity and the
// chance of an Immortal). Used by the camp (town.js) and the Ring's stones in Haven (main.js).
import { RING, RING_FOCUS, ringTable } from '../sim/ring.js';
import { RARITIES, SLOT_NAMES } from '../sim/items.js';

const fmt = (x, dp = 0) => (dp ? (Math.round(x * 10) / 10).toFixed(1) : Math.round(x).toLocaleString('en-US'));

export function ringInfoHtml(level, from, focus) {
  const kind = focus && RING_FOCUS[focus.kind] ? focus.kind : 'gold';
  const rows = ringTable(level, from);
  const unit = { gold: 'gold', fragment: 'Fragments', dust: 'Wishdust', gear: 'pieces' }[kind];
  const head = kind === 'gear'
    ? '<tr><th>Wave</th><th>This wave</th><th>Run total</th><th>Rarity</th><th>Immortal chance</th></tr>'
    : `<tr><th>Wave</th><th>This wave</th><th>Run total (${unit})</th></tr>`;
  const body = rows.map((r) => {
    const dp = kind === 'fragment' || kind === 'gear' ? 1 : 0;
    const cells = `<td>${r.wave}${r.boss ? ' <span class="ri-boss">boss</span>' : ''}</td><td>${fmt(r[kind], dp)}</td><td>${fmt(r.total[kind], dp)}</td>`;
    if (kind !== 'gear') return `<tr>${cells}</tr>`;
    const rar = RARITIES[r.rarity];
    return `<tr>${cells}<td style="color:${rar.color}">${rar.name}</td><td>${r.immortal ? `${Math.round(r.immortal * 100)}% a piece` : '·'}</td></tr>`;
  }).join('');
  const gear = kind === 'gear'
    ? ` Pieces are for your ${SLOT_NAMES[focus.slot || 'weapon'].toLowerCase()} slot, at your level; their rarity and the chance that each is an Immortal follow the deepest wave you clear (none before wave 20, then ${Math.round(RING.immortal(20) * 100)}%, rising to ${Math.round(RING.immortal(60) * 100)}% from wave 50).`
    : kind === 'fragment' ? ' 250 Fragments craft an Immortal of your choice.' : '';
  return `<p>Every wave is worth ${Math.round((RING.growth - 1) * 100)}% more than the one before, up to wave ${RING.cap}; a boss (every 5th wave) three times a wave. Everything you gather comes home with you, however the run ends.${gear}</p>`
    + `<table class="ri-table">${head}${body}</table>`
    + `<p class="ri-note">Run totals are from wave ${from}. Shards to wake it: ${RING.shards.base} from wave 1, ${RING.shards.per} more for each checkpoint further in.</p>`;
}
