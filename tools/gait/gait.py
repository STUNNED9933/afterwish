# usage: gait.py '[[model, style, height, out.json], ...]'
import subprocess, time, json, sys
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8787', '--directory', '<viewer dir>'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errs = []
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(); page = b.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto('http://localhost:8787/gait.html'); page.wait_for_timeout(300)
        for m, st, h, out, *over in json.loads(sys.argv[1]):
            r = page.evaluate("([u, s, h, o]) => window.gait('models/' + u, s, h, 1.8, 30, o)", [m, st, h, over[0] if over else {}])
            json.dump({'gait_Walk': r['clip']}, open(out, 'w')); print(m, st, r['info'])
        b.close()
finally: srv.terminate()
if errs: print(errs); sys.exit(1)
