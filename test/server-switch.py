# (0.56.4) On the server world: a glimmer read is kept by the account, switching class from the menu
# saves and rejoins, and an update restart shows a pop-up that waits for the server, then reloads and
# rejoins. Starts its own local server (port 8787, passcode stun).  python3 test/server-switch.py /tmp/out
import sys, pathlib, subprocess, time, os, signal
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/server-switch'); OUT.mkdir(parents=True, exist_ok=True)
url = 'file://' + str(ROOT / 'dist' / 'index.html') + '?server=ws://127.0.0.1:8787'
env = dict(os.environ, AFTERWISH_PASSCODE='stun', PORT='8787')
def start():
    return subprocess.Popen(['node', 'game-server/server.mjs'], cwd=str(ROOT), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
srv = start(); time.sleep(1.5)
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info else ''))
    if not ok: fails.append(name)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    errs = []
    ctx = b.new_context(viewport={'width': 1100, 'height': 700})
    pg = ctx.new_page()
    pg.add_init_script("localStorage.getItem('stunned-arena-settings-v1') || localStorage.setItem('stunned-arena-settings-v1', JSON.stringify({graphics:'lowest', volume:0, muted:true, cls:'archer'}))")
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(2500)
    pg.click('#btn-mp'); pg.fill('#mp-name', 'Ann'); pg.fill('#mp-pass', 'stun'); pg.click('#btn-server')
    pg.wait_for_function("() => game.net && game.net.server && game.mode === 'play'", timeout=15000)
    # read a glimmer in Haven
    pg.evaluate("() => game.world.command({ type: 'readSign', id: 'haven2' })")
    pg.wait_for_timeout(3500)
    check('a glimmer read on the server is kept by the account', pg.evaluate("() => (JSON.parse(localStorage.getItem('stunned-account-v1') || '{}').signs || []).includes('haven2')"), str(pg.evaluate("() => game.account && game.account.signs")) + ' | ' + str(pg.evaluate("() => game.world.player.signs")))
    # switch class from the menu
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('the menu offers the other classes on a server', pg.is_visible('#pause-switch') and 'Mage' in pg.inner_text('#switch-classes'), pg.inner_text('#switch-classes') if pg.is_visible('#pause-switch') else 'hidden')
    pg.screenshot(path=str(OUT / 'switch-menu.png'))
    pg.click("#switch-classes button:has-text('Mage')")
    pg.wait_for_function("() => game.net && game.net.server && game.mode === 'play' && game.world.cls === 'mage'", timeout=20000)
    pg.wait_for_timeout(1500)
    check('rejoined the server as a Mage, still in the server world', pg.evaluate("() => game.world.cls") == 'mage' and pg.evaluate("() => !!game.net.server"))
    check('the archer was saved on the way out', pg.evaluate("() => !!localStorage.getItem('stunned-arena-save-v1-archer')"))
    check('the mage already knows the glimmer the archer found', pg.evaluate("() => game.world.player.signs.includes('haven2')"), pg.evaluate("() => game.world.player.signs.join()"))
    # the server restarts for an update
    srv.send_signal(signal.SIGTERM); srv.wait(timeout=5)
    pg.wait_for_function("() => !document.getElementById('notice').classList.contains('hidden')", timeout=10000)
    check('a pop-up explains the update and that progress is saved', 'updating' in pg.inner_text('#notice-title') and 'saved' in pg.inner_text('#notice-text'), pg.inner_text('#notice-title'))
    pg.screenshot(path=str(OUT / 'notice-down.png'))
    srv = start(); time.sleep(1.5)
    pg.wait_for_function("() => /It is back/.test(document.getElementById('notice-status').textContent)", timeout=20000)
    check('it notices when the server is back', True, pg.inner_text('#notice-status'))
    pg.screenshot(path=str(OUT / 'notice-back.png'))
    pg.click('#btn-notice-go')
    pg.wait_for_function("() => game.net && game.net.server && game.mode === 'play'", timeout=20000)
    check('Reload and rejoin: back in the server world, as the mage', pg.evaluate("() => game.world.cls") == 'mage')
    check('no page errors', not errs, errs[:3])
    b.close()
srv.terminate()
print('FAILED' if fails else 'ALL PASSED')
sys.exit(1 if fails else 0)
