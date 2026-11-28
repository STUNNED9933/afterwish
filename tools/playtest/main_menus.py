# The main game's menu bot (1.1.4): goes to every map, stands on every waystone, crossing and Waygate, talks to
# everyone, opens every window; flags a menu with nowhere to go, an empty conversation, a window that will not
# close, 'undefined' on screen, and any error. Writes report.json / report.md / report.html to the out folder.
#
#   python3 tools/playtest/main_menus.py [out-dir]
import sys, json, time, pathlib, urllib.parse, mimetypes, html
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'tools/playtest/out/main'); OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob('*.png'): f.unlink()
DIST = ROOT / 'dist'
findings, keys = [], set()
n = [0]
def snap(tag):
    n[0] += 1; name = f'{n[0]:04d}_{tag}.png'
    try: pg.screenshot(path=str(OUT / name))
    except Exception: return None
    return name
where = ['']
def finding(check, level, text, key=None, shot=True):
    key = key or (check, text)
    if key in keys: return
    keys.add(key)
    f = {'check': check, 'level': level, 'text': text, 'where': where[0]}
    if shot: f['shot'] = snap(check)
    findings.append(f); print(f'  [{level}] {check} @ {where[0]}: {text}', flush=True)
def handle(route):
    p = urllib.parse.urlparse(route.request.url).path.lstrip('/') or 'index.html'
    f = DIST / p
    try: route.fulfill(path=str(f), content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
    except Exception: route.fulfill(status=404, body='')
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1100, 'height': 650})
    pg.on('pageerror', lambda e: finding('error', 'bad', str(e)[:300], key=('error', str(e)[:120])))
    pg.on('console', lambda m: finding('error', 'bad', 'console: ' + m.text[:300], key=('console', m.text[:120])) if m.type == 'error' and 'GL Driver' not in m.text and 'favicon' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.add_init_script("localStorage.getItem('stunned-arena-settings-v1') || localStorage.setItem('stunned-arena-settings-v1', JSON.stringify({graphics:'lowest', volume:0, muted:true, cls:'warrior'}))")
    pg.route('http://game.local/**', handle)
    pg.goto('http://game.local/index.html'); pg.wait_for_timeout(2500)
    pg.click('#btn-explore'); pg.wait_for_timeout(4000)
    ev = pg.evaluate
    def screen_text(): return ev("() => [...document.querySelectorAll('section.screen:not(.hidden), #hud')].map((e) => e.innerText).join(' | ')")
    def check_text(ctx):
        t = screen_text()
        for w in ('undefined', 'NaN', '[object Object]', 'null'):
            if w in t: finding('undefined', 'bad', f'"{w}" on screen ({ctx}): ...{t[max(0, t.find(w) - 80): t.find(w) + 40]}...', key=('undefined', where[0], ctx, w))
    def stand(x, z, sec=6):  # (the sim counts its own time: at a few frames a second, 0.9 s on a stone takes several)
        for i in range(int(sec * 10)):
            ev(f"() => {{ const p = game.world.player; p.x = {x}; p.z = {z}; p.moveTarget = null; p.hp = p.stats.maxHp; for (const e of game.world.enemies || []) if (Math.hypot(e.x - p.x, e.z - p.z) < 14) e.hp = 0; }}"); pg.wait_for_timeout(100)  # (a level-1 hero on a level-90 map: kept alive, the bot looks at menus)
            if ev('() => game.mode') != 'play': return True
        return False
    def travel_menu(label):
        # what the travel window offers: enabled destinations, and its words
        info = ev("""() => { const s = document.getElementById('travel'); const btns = [...s.querySelectorAll('button')].filter((b) => b.id !== 'btn-travel-close');
            return { open: !s.classList.contains('hidden'), title: document.getElementById('travel-eyebrow').textContent, enabled: btns.filter((b) => !b.disabled).map((b) => b.innerText.split('\\n')[0]), all: btns.length, text: s.innerText.slice(0, 400) }; }""")
        if not info['open']: finding('menu', 'bad', f'{label}: standing on it opened nothing', key=('noopen', where[0], label)); return
        check_text(label)
        if not info['enabled']:
            finding('menu', 'bad' if 'shut' not in info['text'] and 'Opens' not in info['text'] and 'Finish' not in info['text'] and 'Not discovered' not in info['text'] else 'info', f'{label} ({info["title"]}) offers nowhere to go: {info["text"][:200]}', key=('menu', where[0], label))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        if ev('() => game.mode') != 'play': finding('overlay', 'bad', f'{label}: the travel window would not close with Esc', key=('close', where[0], label)); ev("() => game.panel('play')")
    maps = ev("() => game.maps || []")
    todo, done = list(dict.fromkeys(['town'] + maps)), set()
    while todo:
        m = todo.pop(0)
        if m in done: continue
        done.add(m); where[0] = m
        try: ev(f"() => game.world.goMap('{m}', null)"); pg.wait_for_timeout(1800)
        except Exception as e: finding('error', 'bad', f'going to {m}: {str(e)[:200]}'); continue
        mp = ev("() => { const m = game.world.map; return { id: m.id, name: m.name, portals: m.portals.map((p) => p.to), stones: (m.waystones || []).map((w) => [w.x, w.z, w.name]), crossings: (m.crossings || []).map((c) => [c.x, c.z, c.name]), gate: m.waygate || null, npcs: m.obstacles.filter((o) => o.kind === 'npc').map((o) => o.id) }; }")
        print(f"map {m}: {mp['name']} · {len(mp['stones'])} waystones · {len(mp['npcs'])} people", flush=True)
        if mp['id'] != m: finding('travel', 'bad', f'went to {m} but arrived in {mp["id"]}'); continue
        snap(f'map_{m}'); check_text('map')
        for p in mp['portals']:
            if p not in done and p not in todo: todo.append(p)
        if mp['gate']:
            ev("() => { const p = game.world.player; p.x = 0; p.z = 0; }"); pg.wait_for_timeout(300)
            if stand(mp['gate']['x'], mp['gate']['z']): travel_menu('the Waygate')
            else: finding('menu', 'warn', 'standing on the Waygate opened nothing', key=('gate', m))
        for x, z, nm in mp['stones']:
            # step off it first (a few metres toward the middle: not into the middle, where a boss may wake and seal the map)
            d = max(1e-3, (x * x + z * z) ** 0.5)
            stand(x - x / d * 5, z - z / d * 5, 0.6)
            ok = stand(x, z)
            if not ok:  # once more, longer (a slow frame or a passing enemy can take the moment)
                stand(x - x / d * 5, z - z / d * 5, 1.5); ok = stand(x, z, 12)
            if ok: travel_menu(nm or 'a waystone')
            else: finding('menu', 'warn', f'standing on {nm or "a waystone"} opened nothing', key=('stone', m, nm))
        for x, z, nm in mp['crossings']:
            stand(0, 0, 0.6)
            if stand(x, z): travel_menu(nm)
        for npc in mp['npcs']:
            ev(f"() => game.talk('{npc}')"); pg.wait_for_timeout(500)
            t = ev("() => ({ mode: game.mode, name: (document.getElementById('talk-name') || {}).textContent, line: (document.getElementById('talk-line') || {}).textContent, buttons: document.querySelectorAll('#talk button:not(.hidden)').length })")
            if t['mode'] != 'talk': finding('talk', 'bad', f'talking to {npc} opened nothing', key=('talk', npc)); continue
            if not (t['name'] or '').strip(): finding('talk', 'bad', f'{npc}: no name in the conversation', key=('talkname', npc))
            if not (t['line'] or '').strip(): finding('talk', 'warn', f'{npc}: says nothing', key=('talkline', npc))
            check_text(f'talking to {npc}')
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            if ev('() => game.mode') != 'play': finding('overlay', 'bad', f'the conversation with {npc} would not close with Esc', key=('talkclose', npc)); ev("() => game.panel('play')")
    # every window from the bar
    where[0] = 'town'
    ev("() => game.world.goMap('town', null)"); pg.wait_for_timeout(1500)
    for k, nm in (('KeyT', 'Talents'), ('KeyJ', 'Journal'), ('KeyB', 'Ex Voto'), ('Tab', 'Gear'), ('Escape', 'Menu')):
        pg.keyboard.press(k.replace('Key', '')); pg.wait_for_timeout(600)
        mode = ev('() => game.mode')
        if mode == 'play': finding('window', 'warn', f'{nm} ({k}) opened nothing', key=('win', nm))
        else:
            check_text(nm); snap(f'win_{nm}')
            pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
            if ev('() => game.mode') != 'play': finding('overlay', 'bad', f'{nm} would not close with Esc', key=('wclose', nm)); ev("() => game.panel('play')")
    b.close()
rank = {'bad': 0, 'warn': 1, 'info': 2}
findings.sort(key=lambda f: rank[f['level']])
bad = [f for f in findings if f['level'] == 'bad']
md = [f"# Main game menus: {len(done)} maps, {len(bad)} bad, {len(findings) - len(bad)} to look at", ''] + [f"- **{f['level']}** {f['check']} ({f['where']}): {f['text']}" for f in findings]
(OUT / 'report.json').write_text(json.dumps({'maps': sorted(done), 'findings': findings}, indent=1))
(OUT / 'report.md').write_text('\n'.join(md) + '\n')
(OUT / 'report.html').write_text('<!doctype html><meta charset=utf-8><style>body{font:14px system-ui;background:#111;color:#ddd;margin:20px}img{width:560px}.bad{color:#ff7a6a}.warn{color:#ffc45a}</style>' + f"<h1>{html.escape(md[0][2:])}</h1>" + ''.join(f"<p><b class={f['level']}>{f['level']}</b> {html.escape(f['check'])} ({html.escape(f['where'])}): {html.escape(f['text'])}<br>" + (f"<img src='{f['shot']}'>" if f.get('shot') else '') + '</p>' for f in findings))
print('\n'.join(md[:60]))
sys.exit(1 if bad else 0)
