# (0.57.8) An outdated page (a browser's cached copy) loads the newest once, in any browser, without
# looping while the website catches up.  Serves a copy of dist/ on port 8790.  python3 test/fresh-page.py
import json, time, shutil, subprocess, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
shutil.rmtree('/tmp/fresh', ignore_errors=True); shutil.copytree(ROOT / 'dist', '/tmp/fresh')
srv = subprocess.Popen(['python3', '-m', 'http.server', '8790'], cwd='/tmp/fresh', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
from playwright.sync_api import sync_playwright
fails=[]
def check(n, ok, info=''):
    print(('PASS ' if ok else 'FAIL ')+n+('  '+str(info) if info else ''))
    if not ok: fails.append(n)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    ctx = b.new_context(); pg = ctx.new_page(); navs=[]
    pg.add_init_script("localStorage.setItem('stunned-arena-settings-v1', JSON.stringify({graphics:'lowest', volume:0, muted:true}))")
    pg.on('load', lambda p: navs.append(p.url))
    pg.goto('http://127.0.0.1:8790/index.html?server=ws://127.0.0.1:1'); pg.wait_for_timeout(3000)
    check('same version: no reload, address untouched', len(navs) == 1 and pg.url.endswith('?server=ws://127.0.0.1:1'), navs)
    open('/tmp/fresh/version.json','w').write(json.dumps({'version':'9.9.9'}))
    navs.clear(); pg.goto('http://127.0.0.1:8790/index.html?server=ws://127.0.0.1:1'); pg.wait_for_timeout(5000)
    check('an older page loads the newest once, keeping its address', len(navs) == 2 and 'nv=9.9.9' in navs[-1] and 'server=' in pg.url and '&r=' not in pg.url, navs)
    check('...and does not loop when the website has not caught up', len(navs) == 2)
    check('the game is running', pg.evaluate("() => typeof game !== 'undefined' && game.mode") == 'title')
    b.close()
srv.terminate()
print('FAILED' if fails else 'ALL PASSED')
raise SystemExit(1 if fails else 0)
