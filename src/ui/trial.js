// The Weekly Echo screen: this week's rules, the build you bring, your last result and the boards.
import { CLASSES } from '../sim/classes.js';
import { SPECS, talentPointsAt } from '../sim/talents.js';
import { CONFIG } from '../config.js';
import { SLOT_NAMES } from '../sim/items.js';
import { validateBuild, defaultBuild, TRIAL_MAX_FLOOR } from '../sim/trial.js';
import * as api from '../net/trial-api.js';
import { loadTrialRuns } from '../hall.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const clock = (ticks) => {
  const s = Math.round(ticks * CONFIG.TICK);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function until(ms) {
  const h = Math.max(0, Math.floor((ms - Date.now()) / 3600000));
  return h >= 48 ? `${Math.floor(h / 24)} days` : h >= 1 ? `${h} hour${h === 1 ? '' : 's'}` : 'less than an hour';
}

export class TrialScreen {
  /**
   * @param {object} hooks { getBuild(cls), setBuild(cls, build), enter(build), back(), watch(runId), submitPending() }
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.view = 'board'; // or 'champions'
    this.boardData = null;
    this.champData = null;
    this.msg = '';
    $('trial-back').addEventListener('click', () => hooks.back());
    $('trial-enter').addEventListener('click', () => {
      const b = this.build();
      if (!validateBuild(this.week, b)) hooks.enter(b);
    });
    $('trial-reset').addEventListener('click', () => {
      this.hooks.setBuild(this.cls, defaultBuild(this.week, this.cls, this.build().spec));
      this.render();
    });
    $('trial-join').addEventListener('click', async () => {
      const name = $('trial-name').value.trim();
      $('trial-join').disabled = true;
      const r = api.identity() ? await api.rename(name) : await api.join(name);
      $('trial-join').disabled = false;
      this.msg = r.ok ? (api.identity() ? `You are on the boards as ${r.name}.` : '') : r.error || 'That did not work. Try again in a moment.';
      if (r.ok) await this.hooks.submitPending();
      this.render();
      this.refreshBoards();
    });
    $('trial-view-board').addEventListener('click', () => {
      this.view = 'board';
      this.render();
    });
    $('trial-view-champions').addEventListener('click', () => {
      this.view = 'champions';
      this.render();
      this.refreshBoards();
    });
  }

  build() {
    return this.hooks.getBuild(this.cls);
  }

  /** Open for this week and class; `result` = the run that just ended, if any. */
  open(week, cls, result = null) {
    const fresh = !this.week || this.week.index !== week.index || this.cls !== cls;
    this.week = week;
    this.cls = cls;
    this.result = result;
    if (fresh) {
      this.boardData = null;
      this.champData = null;
    }
    this.render();
    this.refreshBoards();
  }

  async refreshBoards() {
    if (!api.online()) return;
    const spec = this.build().spec;
    const [b, c] = await Promise.all([api.board(this.week.index, spec), this.view === 'champions' ? api.champions(this.week.index) : Promise.resolve(this.champData)]);
    this.boardData = b && b.ok ? Object.assign({ spec }, b) : { spec, error: (b && b.error) || 'The boards cannot be reached right now.' };
    if (c) this.champData = c;
    this.render();
  }

  render() {
    if (!this.week) return;
    const wk = this.week;
    const c = CLASSES[this.cls];
    const b = this.build();
    $('trial-week').textContent = `The Weekly Echo · week ${wk.index + 1}`;
    $('trial-title').textContent = `${SLOT_NAMES[wk.featured]} week, level ${wk.level}`;
    $('trial-rules').textContent = `Everyone who enters this week meets the same echo: level ${wk.level}, standard Epic gear, an Immortal ${SLOT_NAMES[wk.featured].toLowerCase()}, the same waves and the same augment offers, and the Standard parry window. Enter as often as you like; your best run counts. It ends at floor ${TRIAL_MAX_FLOOR} or after 40 minutes. The echo changes in ${until(wk.ends)}.`;

    // --- Result of the run that just ended
    const res = $('trial-result');
    if (this.result) {
      const r = this.result;
      res.classList.remove('hidden');
      res.innerHTML = `<div class="trial-score"><b>Floor ${r.floor}</b><span>${SPECS[r.spec].name} · cleared in ${clock(r.clearTick)}</span></div><p class="setting-desc">${esc(r.note || '')}</p>`;
    } else res.classList.add('hidden');

    // --- Build: subclass, talents, ranks
    const specs = Object.keys(SPECS).filter((k) => SPECS[k].cls === this.cls);
    const pick = $('trial-spec');
    pick.innerHTML = '';
    for (const k of specs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = SPECS[k].name;
      btn.setAttribute('aria-pressed', k === b.spec ? 'true' : 'false');
      btn.addEventListener('click', () => {
        if (k === b.spec) return;
        this.hooks.setBuild(this.cls, defaultBuild(wk, this.cls, k));
        this.boardData = null;
        this.render();
        this.refreshBoards();
      });
      pick.appendChild(btn);
    }
    const sp = SPECS[b.spec];
    const pts = talentPointsAt(wk.level);
    const spent = Object.values(b.talents).reduce((a, n) => a + n, 0);
    $('trial-points').textContent = `${c.name} · ${sp.name} · ${pts - spent} of ${pts} talent points left`;
    const list = $('trial-talents');
    list.innerHTML = '';
    for (const t of sp.talents) {
      const r = b.talents[t.id] || 0;
      const row = document.createElement('div');
      row.className = 'trial-talent';
      row.title = t.desc(Math.max(1, r));
      const plus = Object.assign({}, b, { talents: Object.assign({}, b.talents, { [t.id]: r + 1 }) });
      const minus = Object.assign({}, b, { talents: Object.assign({}, b.talents, { [t.id]: r - 1 }) });
      if (r - 1 <= 0) delete minus.talents[t.id];
      row.innerHTML = `<span class="tt-row">${t.row === 'minor' ? 'I' : t.row === 'major' ? 'II' : 'III'}</span><span class="tt-name">${t.name}</span><span class="tt-rank">${r}/${t.max}</span>`;
      row.appendChild(this.stepper(r > 0 && !validateBuild(wk, minus), r < t.max && !validateBuild(wk, plus), () => this.hooks.setBuild(this.cls, minus), () => this.hooks.setBuild(this.cls, plus)));
      list.appendChild(row);
    }
    const extra = ['q', 'w', 'e', 'r'].reduce((a, k) => a + b.ranks[k] - 1, 0);
    $('trial-rank-points').textContent = `Ability ranks: ${wk.level - 1 - extra} of ${wk.level - 1} points left`;
    const ranks = $('trial-ranks');
    ranks.innerHTML = '';
    for (const k of ['q', 'w', 'e', 'r']) {
      const def = (sp.kit && sp.kit[k]) || c.abilities[k];
      const r = b.ranks[k];
      const up = Object.assign({}, b, { ranks: Object.assign({}, b.ranks, { [k]: r + 1 }) });
      const down = Object.assign({}, b, { ranks: Object.assign({}, b.ranks, { [k]: r - 1 }) });
      const row = document.createElement('div');
      row.className = 'trial-talent';
      row.innerHTML = `<span class="tt-row">${k.toUpperCase()}</span><span class="tt-name">${def.name}</span><span class="tt-rank">${r}</span>`;
      row.appendChild(this.stepper(r > 1, r < CONFIG.MAX_RANK && !validateBuild(wk, up), () => this.hooks.setBuild(this.cls, down), () => this.hooks.setBuild(this.cls, up)));
      ranks.appendChild(row);
    }
    const bad = validateBuild(wk, b);
    $('trial-enter').disabled = !!bad;
    $('trial-enter').textContent = bad ? bad : `Enter the Weekly Echo as ${sp.name}`;
    const mine = (loadTrialRuns()[wk.index] || {})[b.spec];
    $('trial-mybest').textContent = mine ? `Your best ${sp.name} run this week: floor ${mine.floor} in ${clock(mine.clearTick)}${mine.sent ? '' : api.online() ? ' (not on the boards yet)' : ''}.` : `No ${sp.name} run yet this week.`;

    // --- Online: joining, the board, champions
    const me = api.identity();
    $('trial-online').classList.toggle('hidden', !api.online());
    $('trial-offline').classList.toggle('hidden', api.online());
    $('trial-name').value = $('trial-name').value || (me ? me.name : '');
    $('trial-join').textContent = me ? 'Change name' : 'Join the boards';
    $('trial-who').textContent = me ? `On the boards as ${me.name}. Your runs are sent when they finish.` : 'Pick a name to put your runs on the boards. No email or password: the name lives in this browser and in your save code.';
    $('trial-msg').textContent = this.msg;
    $('trial-view-board').setAttribute('aria-pressed', this.view === 'board' ? 'true' : 'false');
    $('trial-view-champions').setAttribute('aria-pressed', this.view === 'champions' ? 'true' : 'false');
    $('trial-view-board').textContent = `${sp.name} board`;
    const out = $('trial-board');
    if (this.view === 'champions') out.innerHTML = this.championsHtml();
    else out.innerHTML = this.boardHtml(sp);
    for (const btn of out.querySelectorAll('[data-watch]')) btn.addEventListener('click', () => this.hooks.watch(btn.dataset.watch));
  }

  stepper(canDown, canUp, down, up) {
    const box = document.createElement('span');
    box.className = 'tt-step';
    for (const [label, ok, fn] of [['−', canDown, down], ['+', canUp, up]]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost';
      btn.textContent = label;
      btn.disabled = !ok;
      btn.addEventListener('click', () => {
        fn();
        this.render();
      });
      box.appendChild(btn);
    }
    return box;
  }

  boardHtml(sp) {
    const d = this.boardData;
    if (!d || d.spec !== this.build().spec) return '<p class="setting-desc">Loading the board…</p>';
    if (d.error) return `<p class="setting-desc">${esc(d.error)}</p>`;
    const me = api.identity();
    const rows = (d.top || []).map((r) => this.rowHtml(r, me));
    if (d.me && d.me.rank > (d.top || []).length) {
      rows.push('<tr class="gap"><td colspan="4">…</td></tr>');
      for (const r of d.around || []) rows.push(this.rowHtml(r, me));
    }
    const head = d.total ? `${d.total} ${sp.name}${d.total === 1 ? '' : 's'} this week.` : `No ${sp.name} runs on the board yet this week. Be the first.`;
    const pct = d.me && d.total >= 20 ? ` You are better than ${d.me.better}% of them.` : d.me && d.total < 20 ? ' Percentiles appear once 20 have played.' : '';
    return `<p class="setting-desc">${head}${pct}</p>${rows.length ? `<table class="trial-table"><thead><tr><th>#</th><th>Name</th><th>Floor</th><th>Time</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : ''}`;
  }

  rowHtml(r, me) {
    const mine = me && r.player === me.id;
    const watch = r.rank <= 3 && r.id ? ` <button type="button" class="ghost tiny" data-watch="${esc(r.id)}">Watch</button>` : '';
    return `<tr class="${mine ? 'me' : ''}"><td>${r.rank}</td><td>${esc(r.name)}${watch}</td><td>${r.floor}</td><td>${clock(r.clearTick)}</td></tr>`;
  }

  championsHtml() {
    const d = this.champData;
    if (!d) return '<p class="setting-desc">Loading…</p>';
    if (!d.ok) return `<p class="setting-desc">${esc(d.error || 'The boards cannot be reached right now.')}</p>`;
    const cards = Object.keys(SPECS).map((k) => {
      const list = (d.specs && d.specs[k]) || [];
      const rows = list.length ? list.map((r) => `<li><b>${esc(r.name)}</b> · floor ${r.floor} · ${clock(r.clearTick)}</li>`).join('') : '<li class="muted">No runs yet</li>';
      return `<div class="champ"><h4>${SPECS[k].name}</h4><ol>${rows}</ol></div>`;
    });
    return `<p class="setting-desc">The top three of every subclass this week, side by side. There is no single ranking across subclasses.</p><div class="champ-grid">${cards.join('')}</div>`;
  }
}
