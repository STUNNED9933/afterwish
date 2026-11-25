# usage: pose.py <model in /tmp/viewer/models> <height> <spec.json> <clip name> <out.json>
import subprocess, time, json, sys
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8791', '--directory', '/tmp/viewer'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
errs = []
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(); page = b.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto('http://localhost:8791/pose.html'); page.wait_for_timeout(300)
        r = page.evaluate("([u, h, s]) => window.pose('models/' + u, h, s)", [sys.argv[1], float(sys.argv[2]), json.load(open(sys.argv[3]))])
        b.close()
finally: srv.terminate()
if errs: print(errs); sys.exit(1)
json.dump({sys.argv[4]: r['clip']}, open(sys.argv[5], 'w')); print(r['info'])
