# (0.59) The Echo Ring on the server world, in a browser: walk to the stones in Haven, choose what you
# are here for, wake it, fight in a Ring of your own, and leave with what was safe. Starts its own
# local server (port 8787, passcode stun).  python3 test/ring-online.py /tmp/out
import sys, pathlib, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/ring-online'); OUT.mkdir(parents=True, exist_ok=True)
url = 'file://' + str(ROOT / 'dist' / 'index.html') + '?server=ws://127.0.0.1:8787'
env = dict(os.environ, AFTERWISH_PASSCODE='stun', PORT='8787')
srv = subprocess.Popen(['node', 'game-server/server.mjs'], cwd=str(ROOT), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.5)
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info else ''))
    if not ok: fails.append(name)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        pg = b.new_page(viewport={'width': 1200, 'height': 800}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("localStorage.getItem('stunned-arena-settings-v1') || localStorage.setItem('stunned-arena-settings-v1', JSON.stringify({graphics:'lowest', volume:0, muted:true, cls:'warrior', ringFocus:{kind:'dust'}})); localStorage.setItem('stunned-account-v1', JSON.stringify({gold: 100, tickets: 20}))")
        pg.goto(url); pg.wait_for_timeout(2500)
        pg.click('#btn-mp'); pg.fill('#mp-name', 'Ringo'); pg.fill('#mp-pass', 'stun'); pg.click('#btn-server')
        pg.wait_for_function("() => game.net && game.net.server && game.mode === 'play'", timeout=15000)
        pg.wait_for_timeout(800)
        st = pg.evaluate("() => { const o = game.world.obstacles.find((x) => x.id === 'ringstones'); return o && { x: o.x, z: o.z }; }")
        check('Haven has the Echo Ring stones', bool(st))
        pg.evaluate("(s) => game.world.command({ type: 'move', x: s.x + 1.6, z: s.z - 1.2 })", st)
        pg.wait_for_function("(s) => Math.hypot(game.world.player.x - s.x, game.world.player.z - s.z) < 2.6", arg=st, timeout=10000)
        pg.keyboard.press('g'); pg.wait_for_timeout(600)
        check('pressing G at the stones opens the Ring', game_mode := pg.evaluate("() => game.mode") == 'talk' and 'Echo Ring' in pg.inner_text('#talk-name'), pg.evaluate("() => game.mode"))
        pg.screenshot(path=str(OUT / 'stones.png'))
        check('...with what you are here for, a checkpoint, and the shard it costs', 'wishdust' in pg.inner_text('#talk-quests').lower() and 'wake it at wave 1' in pg.inner_text('#talk-quests').lower())
        pg.click("#talk-quests button:has-text('Wake it')")
        pg.wait_for_function("() => game.world.mode === 'arena'", timeout=10000)
        pg.wait_for_timeout(2500)
        check('waking it takes you into the Ring, on the server', pg.evaluate("() => game.world.mode") == 'arena' and pg.evaluate("() => game.world.ring && game.world.ring.kind") == 'dust')
        check('the HUD shows the wave and the spoils', 'Wave' in pg.inner_text('#wave-label') and 'spoils' in pg.inner_text('#wave-sub'), pg.inner_text('#wave-label') + ' / ' + pg.inner_text('#wave-sub'))
        pg.wait_for_function("() => game.world.wave.phase === 'intermission' || game.world.wave.n >= 1", timeout=10000)
        pg.wait_for_timeout(4000)
        pg.screenshot(path=str(OUT / 'ring.png'))
        check('enemies come', pg.evaluate("() => game.world.enemies.length") > 0 or pg.evaluate("() => game.world.wave.n") >= 1)
        try:
            pg.wait_for_function("() => game.mode === 'augment'", timeout=90000)
            pg.screenshot(path=str(OUT / 'offer.png'))
            n0 = pg.evaluate("() => game.world.augments.length")
            pg.keyboard.press('1'); pg.wait_for_timeout(1500)
            check('an augment offer comes after wave 1, and picking one works on the server', pg.evaluate("() => game.world.augments.length") == n0 + 1 and pg.evaluate("() => game.mode") == 'play', pg.evaluate("() => game.world.augments"))
        except Exception as ex:
            check('an augment offer comes after wave 1, and picking one works on the server', False, str(ex)[:120])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        check('the menu offers to leave the Ring', 'Leave the Ring' in pg.inner_text('#btn-town'))
        pg.click('#btn-town')
        pg.wait_for_function("() => game.world.mode === 'explore' && game.world.map && game.world.map.id === 'town'", timeout=10000)
        pg.wait_for_timeout(1500)
        check('leaving brings you home to Haven, still on the server', pg.evaluate("() => !!(game.net && game.net.server)") and pg.evaluate("() => game.mode") == 'play')
        pg.screenshot(path=str(OUT / 'home.png'))
        check('no page errors', not errs, errs[:3])
        b.close()
finally:
    srv.terminate()
print('FAILED' if fails else 'ALL PASSED')
sys.exit(1 if fails else 0)
