# (0.57) The account panel in a real browser, against a local server world with accounts on:
# signed in (a session made directly in the store: Google itself cannot be reached from a test), the
# one-time import, joining as the online character, and a tampered browser save being ignored.
#   python3 test/online-ui.py /tmp/out
import sys, pathlib, subprocess, time, os, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/online-ui'); OUT.mkdir(parents=True, exist_ok=True)
data = tempfile.mkdtemp()
token = subprocess.check_output(['node', '-e', f"""
import('{ROOT}/game-server/accounts.mjs').then(({{ AccountStore }}) => {{
  const st = new AccountStore('{data}'); const a = st.signIn('google', 'g-test', 'Ko'); const t = st.newSession(a.id); st.flush(); console.log(t);
}});"""]).decode().strip()
env = dict(os.environ, AFTERWISH_PASSCODE='stun', PORT='8787', GOOGLE_CLIENT_ID='test-client.apps.googleusercontent.com', DATA_DIR=data)
srv = subprocess.Popen(['node', 'game-server/server.mjs'], cwd=str(ROOT), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
web = subprocess.Popen(['python3', '-m', 'http.server', '8771', '--directory', str(ROOT / 'dist')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info else ''))
    if not ok: fails.append(name)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        pg = b.new_page(viewport={'width': 1100, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8771/index.html?server=ws://127.0.0.1:8787'); pg.wait_for_timeout(1500)
        # a level 45 mage in this browser, and a signed-in session for the local server
        pg.evaluate("""(tok) => {
          localStorage.setItem('stunned-arena-settings-v1', JSON.stringify({ graphics: 'lowest', volume: 0, muted: true, cls: 'mage', name: 'Ko' }));
          localStorage.setItem('stunned-account-v1', JSON.stringify({ gold: 4321, tickets: 6 }));
          localStorage.setItem('stunned-online-v1', JSON.stringify({ 'http://127.0.0.1:8787': tok }));
        }""", token)
        pg.evaluate("() => localStorage.setItem('stunned-arena-save-v1-mage', JSON.stringify({ v: 2, cls: 'mage', level: 45, exp: 0, pace4: true, equipped: {}, bag: [] }))")
        pg.reload(); pg.wait_for_timeout(1500)
        pg.click('#btn-mp'); pg.wait_for_timeout(1500)
        check('the account panel shows, signed in', pg.is_visible('#acct') and 'Ko' in pg.inner_text('#acct-name'), pg.inner_text('#acct') if pg.is_visible('#acct') else 'hidden')
        check('it offers the one-time import, naming what this browser has', pg.is_visible('#acct-import') and 'Mage level 45' in pg.inner_text('#acct-import-desc'))
        pg.screenshot(path=str(OUT / 'account.png'))
        pg.click('#btn-acct-import'); pg.wait_for_timeout(200); pg.click('#btn-acct-import'); pg.wait_for_timeout(1500)
        check('the import works, once', 'Brought over: Mage' in pg.inner_text('#acct-msg') and not pg.is_visible('#acct-import') and 'Mage 45' in pg.inner_text('#acct-chars'), pg.inner_text('#acct-msg'))
        pg.screenshot(path=str(OUT / 'imported.png'))
        # now tamper with this browser's mage: the server must not care
        # (set before the game starts: the page saves itself as it unloads, which would write over an edit)
        pg.add_init_script("sessionStorage.getItem('tampered') || (sessionStorage.setItem('tampered', '1'), localStorage.setItem('stunned-arena-save-v1-mage', JSON.stringify({ v: 2, cls: 'mage', level: 100, exp: 0, pace4: true, equipped: {}, bag: [] })))")
        pg.reload(); pg.wait_for_timeout(1500)
        check('this browser\'s mage now claims level 100', json.loads(pg.evaluate("() => localStorage.getItem('stunned-arena-save-v1-mage')"))['level'] == 100)
        pg.click('#btn-mp'); pg.wait_for_timeout(800)
        pg.fill('#mp-pass', 'stun'); pg.click('#btn-server')
        pg.wait_for_function("() => game.net && game.net.server && game.mode === 'play'", timeout=15000)
        pg.wait_for_timeout(1500)
        check('joined as the online character', pg.evaluate("() => game.net.online") is True)
        check('the server plays the online level 45, not the edited 100', pg.evaluate("() => game.world.player.level") == 45, pg.evaluate("() => game.world.player.level"))
        pg.wait_for_timeout(6000)
        check('the browser keeps its own characters untouched', json.loads(pg.evaluate("() => localStorage.getItem('stunned-arena-save-v1-mage')"))['level'] == 100)
        # (0.57.1) back to the title: "Play online" takes the online character into a Haven of its own
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.click('#btn-town'); pg.wait_for_function("() => game.mode === 'title'", timeout=8000); pg.wait_for_timeout(500)
        check('signed in, the title leads with Explore online, with the online level', pg.is_visible('#btn-online') and 'level 45' in pg.inner_text('#btn-online').lower() and not pg.is_visible('#btn-explore'), pg.inner_text('#btn-online') if pg.is_visible('#btn-online') else 'hidden')
        check('and says who is signed in, with offline as a quiet option', 'Ko' in pg.inner_text('#title-name') and pg.is_visible('#btn-explore-offline'))
        pg.screenshot(path=str(OUT / 'title-signed-in.png'))
        pg.click('#btn-online-alone')
        pg.wait_for_function("() => game.net && game.net.server && game.mode === 'play'", timeout=15000)
        pg.wait_for_timeout(1000)
        check('playing alone online: the badge says so, and it is the online character', 'Playing alone' in pg.inner_text('#room-badge') and pg.evaluate("() => game.net.alone && game.net.online && game.world.player.level") == 45, pg.inner_text('#room-badge'))
        pg.screenshot(path=str(OUT / 'alone.png'))
        check('no page errors', not errs, errs[:3])
        b.close()
finally:
    srv.terminate(); web.terminate()
print('FAILED' if fails else 'ALL PASSED')
sys.exit(1 if fails else 0)
