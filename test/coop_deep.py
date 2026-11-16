# A deeper co-op check (0.41.1): a host and two friends on different classes play together
# over real WebRTC, with the game served over HTTP (so models load), at Low graphics.
#   python3 test/coop_deep.py http://127.0.0.1:8765/index.html /tmp/coopdeep [delay_ms] [jitter_ms]
# Needs a local matchmaker on 127.0.0.1:9000 (see test/coop.py). delay/jitter: added one way to
# every message each browser sends (both directions), in order, like a slower connection.
import sys, json, time, pathlib
from playwright.sync_api import sync_playwright

base = sys.argv[1]
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
DELAY = int(sys.argv[3]) if len(sys.argv) > 3 else 0
JITTER = int(sys.argv[4]) if len(sys.argv) > 4 else 0
url = base + ('&' if '?' in base else '?') + 'peer=127.0.0.1:9000'
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info else ''), flush=True)
    if not ok: fails.append(name)

# Count bytes sent over data channels; optionally hold every message back (in order) to fake a slower network.
NETSHIM = """
(() => {
  const D = %d, J = %d;
  window.__net = { bytes: 0, msgs: 0 };
  const send = RTCDataChannel.prototype.send;
  RTCDataChannel.prototype.send = function (data) {
    const n = typeof data === 'string' ? data.length : (data.byteLength || data.size || 0);
    window.__net.bytes += n; window.__net.msgs++;
    if (!D && !J) return send.call(this, data);
    const now = performance.now();
    const at = Math.max(this.__last || 0, now + D + Math.random() * J);
    this.__last = at;
    setTimeout(() => { try { send.call(this, data); } catch (e) {} }, at - now);
  };
})();
""" % (DELAY, JITTER)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
                                 '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'])
    errs = {}
    def page(label, cls):
        ctx = b.new_context(viewport={'width': 480, 'height': 270})
        pg = ctx.new_page()
        errs[label] = []
        pg.on('pageerror', lambda e: errs[label].append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs[label].append(m.text) if m.type == 'error' else None)
        pg.add_init_script("localStorage.getItem('stunned-arena-settings-v1') || localStorage.setItem('stunned-arena-settings-v1', JSON.stringify({graphics:'low', volume:0, muted:true, cls:'%s'}))" % cls)
        pg.add_init_script(NETSHIM)
        pg.goto(url); pg.wait_for_timeout(2500)
        # Software rendering here manages only a few frames a second per page; three pages drawing
        # at once starve the network code. Draw only when a screenshot is wanted (see shot()).
        pg.evaluate("() => { const r = game.renderer.renderer; r.__render = r.render.bind(r); r.render = () => {}; }")
        return pg
    def shot(pg, path):
        pg.evaluate("() => { const r = game.renderer.renderer; r.render = r.__render; }")
        pg.wait_for_timeout(1500)
        pg.screenshot(path=path)
        pg.evaluate("() => { const r = game.renderer.renderer; r.render = () => {}; }")
    t_start = time.time()
    host = page('host', 'warrior')
    host.click('#btn-mp'); host.fill('#mp-name', 'Hosty'); host.click('#btn-host')
    host.wait_for_function("() => game.net && game.net.code", timeout=30000)
    code = host.evaluate("() => game.net.code")
    friends = []
    for label, cls in [('archer', 'archer'), ('rogue', 'rogue')]:
        f = page(label, cls)
        f.click('#btn-mp'); f.fill('#mp-name', label.title()); f.fill('#mp-code', code); f.click('#btn-join')
        try:
            f.wait_for_function("() => game.net && game.net.role === 'client' && game.mode === 'play'", timeout=40000)
        except Exception:
            print('join message:', f.inner_text('#mp-msg'))
            raise
        friends.append(f)
    archer, rogue = friends
    host.wait_for_timeout(3000)
    check('three players in one room', host.evaluate("() => game.world.heroes.map((h) => h.cls).join()") == 'warrior,archer,rogue', host.evaluate("() => game.world.heroes.map((h) => h.name + ':' + h.cls)"))
    check('each friend sees the other two', archer.evaluate("() => game.world.allies().map((a) => a.cls).sort().join()") == 'rogue,warrior' and rogue.evaluate("() => game.world.allies().map((a) => a.cls).sort().join()") == 'archer,warrior')

    # --- Lag: how long from pressing "move" until your own hero starts moving on your own screen
    def input_lag(pg, n=5):
        res = []
        for i in range(n):
            ms = pg.evaluate("""() => new Promise((done) => {
                const g = game.renderer.hero.group.position; const x0 = g.x, z0 = g.z; const p = game.world.player; const t0 = performance.now(); let drawn = -1;
                game.world.command({ type: 'move', x: p.x + (Math.random() < 0.5 ? 4 : -4), z: p.z + 3 });
                const px0 = p.x, pz0 = p.z;
                const tick = () => { const q = game.world.player; const now = performance.now() - t0;
                  if (drawn < 0 && Math.hypot(g.x - x0, g.z - z0) > 0.05) drawn = Math.round(now);
                  if (Math.hypot(q.x - px0, q.z - pz0) > 0.05) done([drawn, Math.round(now)]); else if (now > 5000) done([drawn, -1]); else requestAnimationFrame(tick); };
                requestAnimationFrame(tick); })""")
            res.append(ms)
            pg.wait_for_timeout(900)
        return res
    host_lag = input_lag(host, 3)
    a_lag = input_lag(archer, 6)
    fps = archer.evaluate("() => new Promise((d) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) d(Math.round(n / ((performance.now() - t0) / 1000))); else requestAnimationFrame(f); }; requestAnimationFrame(f); })")
    print(f'LAG [drawn, host confirms] host own move: {host_lag} ms; archer (friend): {a_lag} ms; friend frame rate here ~{fps} fps', flush=True)
    check("a friend's own hero starts moving on their screen at once (under 100 ms)", all(0 <= x[0] < 100 for x in a_lag), a_lag)

    # --- Bandwidth: bytes the host sends per second (to two friends)
    b0 = host.evaluate("() => window.__net.bytes"); host.wait_for_timeout(4000); b1 = host.evaluate("() => window.__net.bytes")
    print(f'BANDWIDTH host -> 2 friends in Haven: {round((b1 - b0) / 4 / 1024, 1)} KB/s', flush=True)

    # --- Off to the Greenwood together
    host.evaluate("() => game.world.loadMap('greenwood', 'town')")
    for f in friends: f.wait_for_function("() => game.world.map.id === 'greenwood' && game.renderer.mapId === 'greenwood'", timeout=30000)
    host.wait_for_timeout(2000)
    check('the party travels together, scenery and all', all(f.evaluate("() => game.world.enemies.length") > 5 for f in friends))
    b0 = host.evaluate("() => window.__net.bytes"); host.wait_for_timeout(4000); b1 = host.evaluate("() => window.__net.bytes")
    print(f'BANDWIDTH host -> 2 friends in the Greenwood (enemies about): {round((b1 - b0) / 4 / 1024, 1)} KB/s', flush=True)

    # --- Seeing each other fight: the archer attacks; do the host and the rogue see her do it?
    host.evaluate("""() => { const w = game.world; const a = w.heroByPid(1).player; const e = w.enemies.find((x) => !x.def.boss && !x.dead);
        e.x = a.x + 6; e.z = a.z; e.hp = e.maxHp; e.aggro = false; e.state = 'idle'; window.__target = e.id; }""")
    tid = host.evaluate("() => window.__target")
    for pg in [host, archer, rogue]:
        pg.evaluate("() => { window.__ally = {}; const r = game.renderer; const o = r.onEvent.bind(r); r.onEvent = (ev, w) => { if (ev.ally) window.__ally[ev.hero + ':' + ev.type] = (window.__ally[ev.hero + ':' + ev.type] || 0) + 1; return o(ev, w); }; }")
    archer.evaluate(f"() => game.world.command({{ type: 'attack', id: {tid} }})")
    archer.wait_for_timeout(2500)
    archer.evaluate("() => game.world.command({ type: 'stop' })")
    seen_host = host.evaluate("() => window.__ally['1:swing'] || 0")
    seen_rogue = rogue.evaluate("() => window.__ally['1:swing'] || 0")
    check("the others see the archer's attacks (her model plays them)", seen_host > 0 and seen_rogue > 0, f'host saw {seen_host}, rogue saw {seen_rogue}')
    shot(host, str(out / '01-host-sees-archer.png')); shot(rogue, str(out / '02-rogue-sees-archer.png'))
    host.evaluate(f"""() => {{ const w = game.world; const r = w.heroByPid(2).player; const e = w.enemies.find((x) => x.id === {tid} && !x.dead) || w.enemies.find((x) => !x.dead && !x.def.boss); e.x = r.x + 3; e.z = r.z; e.hp = e.maxHp; window.__target = e.id; }}""")
    tid = host.evaluate("() => window.__target")
    rogue.wait_for_timeout(500)
    rogue.evaluate(f"() => {{ const e = game.world.enemies.find((x) => x.id === {tid}); game.world.command({{ type: 'cast', slot: 'q', x: e ? e.x : 0, z: e ? e.z : 0, id: {tid} }}); }}")
    rogue.wait_for_timeout(1500)
    seen = archer.evaluate("() => window.__ally['2:cast'] || 0")
    check("the others see the rogue's skills", seen > 0, seen)
    check("a friend's own attacks are not drawn twice on their own screen", archer.evaluate("() => window.__ally['1:swing'] || 0") == 0)

    # --- A friend parries an enemy's swing (judged on the host, where it lands after the trip)
    # on the host: what became of every hit on the archer (held for her parry, parried, or landed)
    host.evaluate("""() => { const w = game.world; window.__hits = []; const hp = w.hitPlayer.bind(w); w.hitPlayer = (d, o = {}) => { const r = hp(d, o); if (w.cur.pid === 1 && o.parryable !== false) window.__hits.push(r); return r; }; }""")
    res = []
    for k in range(8):
        host.evaluate("""() => { const w = game.world; const a = w.heroByPid(1).player; a.hp = a.stats.maxHp; a.parryCd = 0; a.parryT = 0;
            const e = w.enemies.find((x) => !x.def.boss && !x.dead && x.state !== 'spawn' && x.def.attacks.every((t) => t.parryable));
            for (const o of w.enemies) if (o !== e && Math.hypot(o.x - a.x, o.z - a.z) < 16) { o.x = a.x + 40; o.z = a.z + 40; o.aggro = false; }
            a.autoAttack = false; a.target = null;
            e.maxHp = e.hp = 1e7; e.x = e.px = a.x + 1.6; e.z = e.pz = a.z; e.home = null; e.returning = false; e.aggro = true; e.targetPid = 1; e.state = 'chase'; e.t = 0; window.__parries0 = w.as(w.heroByPid(1), () => w.stats.parries); }""")
        seen = archer.evaluate("""() => new Promise((done) => { const t0 = performance.now(); const tick = () => {
            const e = game.world.enemies.find((x) => x.state === 'windup' && Math.hypot(x.x - game.world.player.x, x.z - game.world.player.z) < 5);
            if (e && e.t >= Math.max(0, e.dur - 0.25)) { game.world.command({ type: 'parry' }); done(true); }
            else if (performance.now() - t0 > 8000) done(false); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })""")
        archer.wait_for_timeout(1800)
        hits = host.evaluate("() => window.__hits.splice(0)")
        if not seen or not hits:  # the swing never reached her: not a parry test
            print('  (round skipped:', 'no swing seen' if not seen else 'the swing missed', ')', flush=True)
            continue
        res.append(host.evaluate("() => game.world.as(game.world.heroByPid(1), () => game.world.stats.parries) - window.__parries0") > 0)
    print(f'PARRY by the friend, pressing 0.25 s before the hit lands on their screen: {sum(res)}/{len(res)} counted on the host', flush=True)
    check("a friend's parry, pressed in time on their own screen, counts", len(res) >= 2 and sum(res) >= len(res) - (1 if JITTER >= 40 else 0), f'{sum(res)}/{len(res)}')

    # --- Knocked out in a party: back up at the entrance; the screen says so
    host.evaluate("() => { const w = game.world; w.as(w.heroByPid(2), (p) => { p.hp = 1; p.invulnT = 0; w.takeDamage(1e9, null); }); }")
    rogue.wait_for_function("() => game.world.player.dead", timeout=15000)
    check("a friend who falls sees it on their screen", rogue.evaluate("() => game.world.player.dead"))
    rogue.wait_for_function("() => !game.world.player.dead", timeout=30000)
    check('and gets back up at the entrance', not rogue.evaluate("() => game.world.player.dead"))

    # --- The Waygate from a friend: travel to a map only the friend has found
    host.evaluate("() => { const w = game.world; w.as(w.heroByPid(1), (p) => { if (!p.visited.includes('fen')) p.visited.push('fen'); }); }")
    host.evaluate("() => game.world.loadMap('town', 'greenwood')")
    archer.wait_for_function("() => game.world.map.id === 'town'", timeout=20000)
    archer.evaluate("() => game.world.command({ type: 'travel', to: 'fen' })")
    for pg in [host, archer, rogue]: pg.wait_for_function("() => game.world.map.id === 'fen'", timeout=30000)
    check("a friend's Waygate trip takes the whole party", True)

    # --- Trade between the two friends
    rogue.evaluate("() => game.world.command({ type: 'tradeAsk', to: 1 })")
    try:
        archer.wait_for_function("() => !document.getElementById('trade-ask') || !document.getElementById('trade-ask').classList.contains('hidden')", timeout=8000)
    except Exception:
        pass
    archer.evaluate("() => game.world.command({ type: 'tradeAnswer', yes: true })")
    host.wait_for_timeout(1500)
    check('two friends can open a trade with each other', host.evaluate("() => !!game.world.tradeFor(1)"), host.evaluate("() => JSON.stringify(game.world.tradeFor ? game.world.tradeFor(1) && Object.keys(game.world.tradeFor(1)) : null)"))
    rogue.evaluate("() => game.world.command({ type: 'tradeCancel' })")

    # --- The Starwell: the Asker's offer reaches every friend, and their answers count
    host.evaluate("""() => { const w = game.world; for (const h of w.heroes) w.as(h, (p) => { p.level = 100; for (const q of ['unmade','w','sand','survey','court']) p.quests[q] = { s: 'done', n: 1 }; w.recalcStats(); p.hp = p.stats.maxHp; }); w.loadMap('starwell'); }""")
    for pg in friends: pg.wait_for_function("() => game.world.map.id === 'starwell'", timeout=30000)
    host.wait_for_timeout(1500)
    host.evaluate("() => { const w = game.world; const a = w.enemies.find((e) => e.type === 'asker'); a.hp = a.maxHp * 0.76; w.hitEnemy(a, a.maxHp * 0.02); }")
    t_offer = time.time()
    for pg in friends: pg.wait_for_function("() => !document.getElementById('asker-offer').classList.contains('hidden')", timeout=15000)
    check("the Asker's offer opens on both friends' screens", True, f'{round(time.time() - t_offer, 1)} s after the hit')
    archer.keyboard.press('3'); rogue.keyboard.press('4')
    host.wait_for_timeout(2000)
    print('offer time left on the host:', host.evaluate("() => { const a = game.world.enemies.find((e) => e.type === 'asker'); return a && a.offerT; }"))
    w = host.evaluate("() => game.world.heroes.map((h) => JSON.stringify(h.player.wished || null))")
    check("each friend's own answer counts (archer: speed, rogue: nothing)", '"speed":1' in w[1] and w[2] == 'null', w)
    check("the panel closes for the friends once answered", all(pg.evaluate("() => document.getElementById('asker-offer').classList.contains('hidden')") for pg in friends))

    # --- A friend leaves and comes back
    def to_pause(pg):
        for _ in range(3):
            if pg.evaluate("() => game.mode") == 'pause': break
            pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    to_pause(rogue); rogue.click('#btn-town'); rogue.wait_for_timeout(2500)
    host.wait_for_function("() => game.world.heroes.length === 2", timeout=15000)
    check('the host sees a friend leave', True)
    rogue.click('#btn-mp'); rogue.fill('#mp-code', code); rogue.click('#btn-join')
    rogue.wait_for_function("() => game.net && game.net.role === 'client' && game.mode === 'play'", timeout=40000)
    host.wait_for_function("() => game.world.heroes.length === 3", timeout=15000)
    hm = host.evaluate("() => game.world.map.id")
    try:
        rogue.wait_for_function(f"() => game.world.map.id === '{hm}' && game.renderer.mapId === '{hm}'", timeout=15000)
    except Exception:
        pass
    check('and can join again, on the same map as everyone', rogue.evaluate("() => game.world.map.id") == hm, f"{rogue.evaluate('() => game.world.map.id')} vs {hm}")

    # --- The host closes the room: everyone is told and goes back to the title screen with progress kept
    to_pause(host); host.click('#btn-town')
    for pg in friends: pg.wait_for_function("() => game.mode === 'title' && !game.net", timeout=20000)
    check("closing the room sends everyone home", True)
    check("the friends' levels stayed in their own browsers", all(json.loads(pg.evaluate("() => localStorage.getItem('stunned-arena-save-v1-' + JSON.parse(localStorage.getItem('stunned-arena-settings-v1')).cls)") or '{}').get('visited', []).count('greenwood') for pg in friends))

    for k, v in errs.items():
        bad = [e for e in v if 'favicon' not in e and 'WebGL' not in e and 'GPU' not in e and 'fonts.googleapis' not in e and 'net::ERR' not in e]
        check(f'no errors on the {k} screen', not bad, bad[:4])
    print(f'took {round(time.time() - t_start)} s')
    b.close()
print('FAILED:', fails) if fails else print('ALL PASSED')
sys.exit(1 if fails else 0)
