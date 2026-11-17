# Two browsers join the server world (game-server/server.mjs, run locally with AFTERWISH_PASSCODE=stun
# on port 8787), meet in Haven, chat, form a party, and go to different maps, then the same one.
#   python3 test/server-world.py dist/index.html /tmp/out
import sys, pathlib
from playwright.sync_api import sync_playwright
url = 'file://' + str(pathlib.Path(sys.argv[1]).resolve()) + '?server=ws://127.0.0.1:8787'
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info else ''))
    if not ok: fails.append(name)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    errs = []
    def page(cls):
        ctx = b.new_context(viewport={'width': 960, 'height': 540})
        pg = ctx.new_page()
        pg.add_init_script("localStorage.getItem('stunned-arena-settings-v1') || localStorage.setItem('stunned-arena-settings-v1', JSON.stringify({graphics:'lowest', volume:0, muted:true, cls:'%s'}))" % cls)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(2500)
        return pg
    def join(pg, name, pw_='stun'):
        pg.click('#btn-mp'); pg.fill('#mp-name', name); pg.fill('#mp-pass', pw_); pg.click('#btn-server')
    a = page('archer')
    join(a, 'Ann', 'wrong')
    a.wait_for_function("() => /passcode/i.test(document.getElementById('mp-msg').textContent)", timeout=10000)
    check('a wrong passcode is refused, and says so', True, a.inner_text('#mp-msg'))
    a.fill('#mp-pass', 'stun'); a.click('#btn-server')
    a.wait_for_function("() => game.net && game.net.server && game.mode === 'play'", timeout=15000)
    check('the right passcode gets in, to Haven', a.evaluate("() => game.world.map.id") == 'town')
    w = page('warrior')
    join(w, 'Wes')
    w.wait_for_function("() => game.net && game.net.server && game.mode === 'play'", timeout=15000)
    w.wait_for_timeout(1500)
    check('both see each other in Haven', a.evaluate("() => game.world.allies().map(x => x.name).join()") == 'Wes' and w.evaluate("() => game.world.allies().map(x => x.name).join()") == 'Ann')
    check('the badge says server world and 2 online', '2 online' in a.inner_text('#room-badge'), a.inner_text('#room-badge'))
    # chat
    a.keyboard.press('Enter'); a.keyboard.type('hi wes'); a.keyboard.press('Enter')
    w.wait_for_timeout(800)
    check('chat reaches the other player', 'Ann: hi wes' in w.inner_text('#chat-log'), w.inner_text('#chat-log'))
    # players panel and a party
    a.keyboard.press('o'); a.wait_for_timeout(300)
    check('O opens the players panel', 'Wes' in a.inner_text('#players-panel'))
    a.click("#players-panel button[data-act='partyInvite']")
    w.wait_for_timeout(800)
    w.keyboard.press('o'); w.wait_for_timeout(300)
    w.click("#players-panel button[data-act='partyAccept']")
    w.wait_for_timeout(800)
    check('accepting puts both in a party', 'party' in a.inner_text('#players-panel') and a.evaluate("() => !!game.net.roster.party"))
    a.screenshot(path=str(out / '01-haven-party.png'))
    a.keyboard.press('o'); w.keyboard.press('o')
    # Ann goes to the Greenwood; Wes stays
    WALK_TO_GREENWOOD = "() => { const g = game.world.map.portals.find((p) => p.to === 'greenwood'); game.world.command({ type: 'move', x: g.x, z: g.z }); }"
    a.evaluate(WALK_TO_GREENWOOD)
    a.wait_for_function("() => game.world.map.id === 'greenwood' && game.renderer.mapId === 'greenwood'", timeout=30000)
    a.wait_for_timeout(1500)
    check('Ann can travel while Wes stays in Haven', w.evaluate("() => game.world.map.id") == 'town' and a.evaluate("() => game.world.enemies.length") > 3)
    # Wes walks over to her
    w.evaluate(WALK_TO_GREENWOOD)
    w.wait_for_function("() => game.world.map.id === 'greenwood'", timeout=30000)
    w.wait_for_timeout(1500)
    check('the party member arrives in the same copy', w.evaluate("() => game.world.allies().map(x => x.name).join()") == 'Ann' and a.evaluate("() => game.world.allies().map(x => x.name).join()") == 'Wes')
    # moving and fighting work
    x0 = w.evaluate("() => game.world.player.x")
    w.evaluate("() => game.world.command({ type: 'move', x: game.world.player.x + 5, z: game.world.player.z })")
    w.wait_for_timeout(2000)
    check('moving works on the server', w.evaluate("() => game.world.player.x") > x0 + 2)
    w.screenshot(path=str(out / '02-greenwood-together.png'))
    # Saves arrive in each browser
    w.wait_for_function("() => { const s = JSON.parse(localStorage.getItem('stunned-arena-save-v1') || 'null'); return s && s.visited && s.visited.includes('greenwood'); }", timeout=15000)
    check("progress is saved in each player's own browser", True)
    # Leaving
    w.evaluate("() => document.getElementById('btn-town') && 0")
    w.close()
    a.wait_for_timeout(1500)
    check('when one leaves, the other plays on', a.evaluate("() => game.world.allies().length") == 0 and a.evaluate("() => game.mode") == 'play')
    print('errors', errs[:5])
    check('no errors in the pages', not errs)
    b.close()
sys.exit(1 if fails else 0)
