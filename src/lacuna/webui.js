// (0.99.37) The talent web, drawn: a great map to pan (drag) and zoom (wheel), each node lit when taken. Hover a
// node to see what it gives (and the way to it, if it is not joined to yours); click to take it and the way there;
// right-click to give one back (if what is left stays joined up). Search lights up the nodes whose words match.
import { WEB, describe, pathTo, canRefund } from './tree.js';

const SIDE = { w: '#e0574a', e: '#5ccf7a', n: '#6ec8ff', s: '#7d9cff', c: '#e8c060', k: '#ffcf4a' };
const R = { small: 7, notable: 13, keystone: 19, start: 22 };

export class WebUI {
  /**
   * el: the overlay element (with a canvas, #web-info, #web-tip, #web-search inside);
   * hooks: { cls() (the path whose start is yours), have() (ids taken), points() (in all), set(ids) }
   */
  constructor(el, hooks) {
    this.el = el;
    this.h = hooks;
    this.cv = el.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    this.tip = el.querySelector('#web-tip');
    this.info = el.querySelector('#web-info');
    this.search = el.querySelector('#web-search');
    this.scale = 26;
    this.ox = 0; this.oy = 0;
    this.hover = null;
    this.drag = null;
    this.match = new Set();
    this.cv.addEventListener('mousedown', (e) => { this.drag = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy, moved: false, button: e.button }; });
    addEventListener('mouseup', (e) => {
      if (!this.drag || !this.open) return;
      const d = this.drag;
      this.drag = null;
      if (d.moved) return;
      if (d.button === 2) this.refund(); else if (d.button === 0) this.take();
    });
    addEventListener('mousemove', (e) => {
      if (!this.open) return;
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
        if (this.drag.moved) { this.ox = this.drag.ox + dx; this.oy = this.drag.oy + dy; this.draw(); }
      }
      this.mx = e.clientX; this.my = e.clientY;
      this.pick();
    });
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = Math.exp(-e.deltaY * 0.0015), ns = Math.max(8, Math.min(70, this.scale * k));
      // zoom about the mouse
      const wx = (e.clientX - this.cx() - this.ox) / this.scale, wy = (e.clientY - this.cy() - this.oy) / this.scale;
      this.scale = ns;
      this.ox = e.clientX - this.cx() - wx * ns;
      this.oy = e.clientY - this.cy() - wy * ns;
      this.draw();
    }, { passive: false });
    this.search.addEventListener('input', () => {
      const q = this.search.value.trim().toLowerCase();
      this.match = new Set(q.length < 2 ? [] : WEB.nodes.filter((n) => (n.name || '').toLowerCase().includes(q) || describe(n).some((t) => t.toLowerCase().includes(q))).map((n) => n.id));
      this.draw();
    });
    addEventListener('resize', () => { if (this.open) this.draw(); });
  }

  webNodes() { return WEB.nodes; } // (for tests)
  cx() { return innerWidth / 2; }
  cy() { return innerHeight / 2; }
  at(n) { return [this.cx() + this.ox + n.x * this.scale, this.cy() + this.oy + n.y * this.scale]; }

  show() {
    this.open = true;
    this.el.classList.remove('hidden');
    const s = WEB.nodes[WEB.starts[this.h.cls()]];
    if (s && !this.placed) { this.ox = -s.x * this.scale; this.oy = -s.y * this.scale; this.placed = true; }
    this.draw();
  }

  hide() {
    this.open = false;
    this.el.classList.add('hidden');
    this.tip.style.display = 'none';
  }

  left() { return this.h.points() - this.h.have().length; }

  pick() {
    let best = null, bd = 1e9;
    for (const n of WEB.nodes) {
      const [x, y] = this.at(n);
      const d = Math.hypot(x - this.mx, y - this.my);
      const r = Math.max(6, R[n.kind] * Math.min(1.4, this.scale / 26));
      if (d < r + 3 && d < bd) { bd = d; best = n; }
    }
    if (best !== this.hover) { this.hover = best; this.draw(); }
    this.showTip();
  }

  showTip() {
    const n = this.hover;
    if (!n) { this.tip.style.display = 'none'; return; }
    const have = this.h.have(), cls = this.h.cls();
    const owned = have.includes(n.id) || WEB.starts[cls] === n.id;
    const way = owned ? [] : pathTo(have, cls, n.id);
    const kind = n.kind === 'keystone' ? 'Keystone' : n.kind === 'notable' ? 'Notable' : n.kind === 'start' ? '' : '';
    let foot = '';
    if (n.kind === 'start') foot = WEB.starts[cls] === n.id ? 'Your start' : 'Another path\'s start';
    else if (owned) foot = canRefund(have, cls, n.id) ? 'Right-click to give it back' : 'Taken (others hang from it)';
    else if (way) foot = way.length <= this.left() ? `Click to take${way.length > 1 ? ` (and the way there: ${way.length} points)` : ' (1 point)'}` : `Needs ${way.length} points (you have ${this.left()})`;
    this.tip.innerHTML = `<b class="${n.kind}">${n.name || (n.kind === 'small' ? '' : '')}${kind ? ` <small>${kind}</small>` : ''}</b>${describe(n).map((t) => `<span>${t}</span>`).join('')}<em>${foot}</em>`;
    this.tip.style.display = 'block';
    this.tip.style.left = `${Math.min(innerWidth - 300, this.mx + 16)}px`;
    this.tip.style.top = `${Math.min(innerHeight - 160, this.my + 12)}px`;
  }

  take() {
    const n = this.hover;
    if (!n) return;
    const have = this.h.have(), cls = this.h.cls();
    const way = pathTo(have, cls, n.id);
    if (!way || !way.length || way.length > this.left()) return;
    this.h.set([...have, ...way]);
    this.draw();
    this.showTip();
  }

  refund() {
    const n = this.hover;
    if (!n) return;
    const have = this.h.have(), cls = this.h.cls();
    if (!have.includes(n.id) || !canRefund(have, cls, n.id)) return;
    this.h.set(have.filter((i) => i !== n.id));
    this.draw();
    this.showTip();
  }

  draw() {
    if (!this.open) return;
    const cv = this.cv, c = this.ctx, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0b0f1a';
    c.fillRect(0, 0, innerWidth, innerHeight);
    const cls = this.h.cls(), have = new Set([...this.h.have(), WEB.starts[cls]]);
    const way = this.hover && !have.has(this.hover.id) ? new Set(pathTo([...have].filter((i) => i !== WEB.starts[cls]), cls, this.hover.id) || []) : new Set();
    const z = Math.min(1.4, this.scale / 26);
    // links
    c.lineCap = 'round';
    for (const n of WEB.nodes) {
      const [x, y] = this.at(n);
      for (const l of n.links) {
        if (l < n.id) continue;
        const m = WEB.nodes[l], [x2, y2] = this.at(m);
        if (Math.max(x, x2) < -50 || Math.min(x, x2) > innerWidth + 50 || Math.max(y, y2) < -50 || Math.min(y, y2) > innerHeight + 50) continue;
        const lit = have.has(n.id) && have.has(l), path = (way.has(n.id) || have.has(n.id)) && (way.has(l) || have.has(l)) && (way.has(n.id) || way.has(l));
        c.strokeStyle = lit ? '#f0c060' : path ? '#8fd0ff' : 'rgba(120, 132, 160, 0.35)';
        c.lineWidth = (lit ? 4 : path ? 3 : 2) * z;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
      }
    }
    // nodes
    for (const n of WEB.nodes) {
      const [x, y] = this.at(n);
      if (x < -40 || x > innerWidth + 40 || y < -40 || y > innerHeight + 40) continue;
      const r = R[n.kind] * z, lit = have.has(n.id), col = SIDE[n.side] || '#aab';
      c.beginPath();
      if (n.kind === 'keystone') { for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }
      else c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = lit ? col : way.has(n.id) ? '#1d3550' : '#161c2c';
      c.fill();
      c.lineWidth = (n.kind === 'small' ? 2 : 3) * z;
      c.strokeStyle = this.match.has(n.id) ? '#ffffff' : lit ? '#fff2c0' : col;
      c.globalAlpha = lit || way.has(n.id) || this.match.has(n.id) ? 1 : 0.6;
      c.stroke();
      c.globalAlpha = 1;
      if (this.match.has(n.id)) { c.beginPath(); c.arc(x, y, r + 6 * z, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2; c.stroke(); }
      if ((n.kind === 'notable' || n.kind === 'keystone' || n.kind === 'start') && this.scale >= 18) {
        c.fillStyle = lit ? '#fff4d0' : '#aeb8d0';
        c.font = `${n.kind === 'small' ? 10 : 11 + (n.kind === 'keystone' ? 2 : 0)}px system-ui`;
        c.textAlign = 'center';
        c.fillText(n.name, x, y + r + 13);
      }
      if (this.hover === n) { c.beginPath(); c.arc(x, y, r + 4, 0, Math.PI * 2); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    }
    this.info.innerHTML = `<b>${this.left()}</b> point${this.left() === 1 ? '' : 's'} to spend · ${this.h.have().length} taken of ${this.h.points()} · drag to move, wheel to zoom, click to take, right-click to give back`;
  }
}
