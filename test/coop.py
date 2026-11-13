# Two browsers: one hosts a room, the other joins with the code; they explore together.
# Needs a local matchmaker: node /tmp/peersrv/srv.js  (PeerServer on 127.0.0.1:9000)
import sys, json, pathlib
from playwright.sync_api import sync_playwright
url = 'file://' + str(pathlib.Path(sys.argv[1]).resolve()) + '?peer=127.0.0.1:9000'
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info else ''))
    if not ok: fails.append(name)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'])
    errs = []
    def page():
        ctx = b.new_context(viewport={'width': 1280, 'height': 760})
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(url); pg.wait_for_timeout(2500)
        return pg
    host = page()
    # Host a warrior
    host.click('#btn-mp'); host.fill('#mp-name', 'Hosty'); host.click('#btn-host')
    host.wait_for_function("() => game.net && game.net.code", timeout=20000)
    code = host.evaluate("() => game.net.code")
    check('host gets a five-letter room code', len(code) == 5, code)
    check('host is exploring Haven', host.evaluate("() => game.mode") == 'play' and host.evaluate("() => game.world.map.id") == 'town')
    # Friend: a fresh mage
    friend = page()
    friend.evaluate("() => { document.querySelector('[data-cls=mage]').click(); }")
    friend.click('#btn-mp'); friend.fill('#mp-name', 'Frieda'); friend.fill('#mp-code', code.lower()); friend.click('#btn-join')
    try:
        friend.wait_for_function("() => game.net && game.net.role === 'client' && game.mode === 'play'", timeout=25000)
    except Exception:
        print('join message:', friend.inner_text('#mp-msg')); print('errors', errs[:8]); raise
    friend.wait_for_timeout(1500)
    check('the friend joins and the host sees two heroes', host.evaluate("() => game.world.heroes.length") == 2, host.evaluate("() => game.world.heroes.map(h => h.name + ' ' + h.cls)"))
    check('the friend sees the host next to them', friend.evaluate("() => game.world.allies().map(a => a.name + ' ' + a.cls).join()") == 'Hosty warrior')
    check('the friend is a mage, the host a warrior', friend.evaluate("() => game.world.cls") == 'mage' and host.evaluate("() => game.world.cls") == 'warrior')
    check('room badge shows the code and 2 players', code in friend.inner_text('#room-badge') and '2 players' in host.inner_text('#room-badge'), friend.inner_text('#room-badge'))
    host.screenshot(path=str(out / '01-host-haven.png')); friend.screenshot(path=str(out / '02-friend-haven.png'))
    # Friend walks: the command goes to the host and comes back in a snapshot.
    fx0 = friend.evaluate("() => game.world.player.x")
    friend.evaluate("() => game.world.command({ type: 'move', x: game.world.player.x + 6, z: game.world.player.z })")
    friend.wait_for_timeout(3000)
    hx = host.evaluate("() => game.world.heroByPid(1).player.x"); fx = friend.evaluate("() => game.world.player.x")
    check('the friend moves, and both screens agree where they are', fx > fx0 + 0.8 and abs(hx - fx) < 1.5, f'{fx0:.1f} -> {fx:.1f} (host says {hx:.1f})')
    # The host takes the portal: the whole party goes to the Greenwood.
    host.evaluate("() => { const w = game.world; w.loadMap('greenwood', 'town'); }")
    friend.wait_for_function("() => game.world.map.id === 'greenwood'", timeout=10000)
    friend.wait_for_timeout(2500)
    check('the party travels together', friend.evaluate("() => game.world.map.id") == 'greenwood' and friend.evaluate("() => game.world.enemies.length") > 5, friend.evaluate("() => game.world.enemies.length"))
    check("the friend's screen has the new map's scenery", friend.evaluate("() => game.renderer.mapId") == 'greenwood')
    # The friend kills an enemy (with help: make it one hit) and gets their own rewards.
    before = friend.evaluate("() => ({ exp: game.world.player.exp, gold: game.world.player.gold, lvl: game.world.player.level })")
    host.evaluate("""() => { const w = game.world; const f = w.heroByPid(1).player; const e = w.enemies.find(x => !x.def.boss);
        e.x = f.x + 2; e.z = f.z; e.hp = 1; e.aggro = true; }""")
    eid = host.evaluate("() => game.world.enemies.find(x => x.hp === 1).id")
    friend.wait_for_timeout(500)
    friend.evaluate(f"() => game.world.command({{ type: 'attack', id: {eid} }})")
    friend.wait_for_function(f"() => !game.world.enemies.some(e => e.id === {eid})", timeout=15000)
    friend.wait_for_timeout(1000)
    after = friend.evaluate("() => ({ exp: game.world.player.exp, gold: game.world.player.gold, lvl: game.world.player.level })")
    check('a kill pays the friend EXP and gold', (after['exp'] > before['exp'] or after['lvl'] > before['lvl']) and after['gold'] > before['gold'], f'{before} -> {after}')
    friend.screenshot(path=str(out / '03-friend-greenwood.png')); host.screenshot(path=str(out / '04-host-greenwood.png'))
    # Friend opens a menu and does something there: talents need level 15, so equip from the bag instead -> just check the gear screen works.
    friend.keyboard.press('Tab'); friend.wait_for_timeout(500)
    check("the friend's gear screen opens", friend.evaluate("() => game.mode") == 'gear')
    friend.keyboard.press('Tab'); friend.wait_for_timeout(300)
    # The host keeps running while it is in a menu.
    host.keyboard.press('Escape'); host.wait_for_timeout(300)
    t0 = host.evaluate("() => game.world.time"); host.wait_for_timeout(1000); t1 = host.evaluate("() => game.world.time")
    check('the host keeps the world running while paused', t1 > t0 + 0.1, f'{t0:.1f} -> {t1:.1f}')
    host.keyboard.press('Escape'); host.wait_for_timeout(200)
    # Saves reach the friend's own browser.
    friend.wait_for_function("() => { const s = JSON.parse(localStorage.getItem('stunned-arena-save-v1-mage') || 'null'); return s && s.visited && s.visited.includes('greenwood'); }", timeout=12000)
    check("the friend's progress is saved in the friend's browser", True)
    # The friend leaves; the host carries on alone.
    friend.keyboard.press('Escape'); friend.wait_for_timeout(300); friend.click('#btn-town'); friend.wait_for_timeout(2000)
    check('the friend can leave', friend.evaluate("() => game.mode") == 'title' and friend.evaluate("() => game.net") is None)
    host.wait_for_function("() => game.world.heroes.length === 1", timeout=10000)
    check('the host sees them go and plays on', host.evaluate("() => game.world.heroes.length") == 1)
    # A wrong code fails politely.
    friend.click('#btn-mp'); friend.fill('#mp-code', 'ZZZZZ'); friend.click('#btn-join')
    friend.wait_for_function("() => document.getElementById('mp-msg').classList.contains('bad')", timeout=25000)
    check('a wrong code says so', 'No room' in friend.inner_text('#mp-msg') or 'did not answer' in friend.inner_text('#mp-msg'), friend.inner_text('#mp-msg'))
    bad = [e for e in errs if 'favicon' not in e and 'WebGL' not in e and 'GPU' not in e]
    print('console errors:', bad[:6] or 'none')
    b.close()
print('FAILED:', fails) if fails else print('ALL PASSED')
sys.exit(1 if fails else 0)
