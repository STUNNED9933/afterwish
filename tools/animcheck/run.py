# The animation checker (1.1.4): python3 tools/animcheck/run.py [out-dir] [model ids...]
# Bundles animcheck.js, opens it in headless Chromium with the game's models, checks every model and clip, and
# writes report.json, report.md and a strip of frames for each finding worth a look. Exit code 1 if any 'bad'.
import sys, os, json, subprocess, urllib.parse, mimetypes, base64, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'tools/animcheck/out'); out.mkdir(parents=True, exist_ok=True)
only = sys.argv[2:] or None
bundle = out / 'animcheck.bundle.js'
subprocess.run(['npx', 'esbuild', str(ROOT / 'tools/animcheck/animcheck.js'), '--bundle', '--format=iife', '--log-level=warning', f'--outfile={bundle}'], cwd=ROOT, check=True)
page = '<!doctype html><meta charset=utf-8><body><script src="animcheck.bundle.js"></script>'
def handle(route):
    p = urllib.parse.urlparse(route.request.url).path
    if p in ('/', '/check.html'): return route.fulfill(body=page, content_type='text/html')
    if p == '/animcheck.bundle.js': return route.fulfill(path=str(bundle), content_type='text/javascript')
    f = ROOT / 'assets' / p.lstrip('/')
    if f.exists(): return route.fulfill(path=str(f), content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
    route.fulfill(status=404, body='')
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 400, 'height': 300})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('http://check.local/**', handle)
    pg.goto('http://check.local/check.html')
    pg.wait_for_function('() => window.animcheck', timeout=30000)
    pg.set_default_timeout(0)
    report = pg.evaluate('(only) => window.animcheck.runAll(only)', only)
    # known.json: findings looked at and accepted (or waiting on a new model): listed, not counted
    known = json.loads((ROOT / 'tools/animcheck/known.json').read_text()) if (ROOT / 'tools/animcheck/known.json').exists() else []
    for f in report['findings']:
        for k in known:
            if k['model'] == f['model'] and k.get('clip', f['clip']) in (f['clip'], '*') and k.get('check', f['check']) == f['check']:
                f['level'] = 'info'; f['text'] += f" [known: {k['why']}]"
    rank = {'bad': 0, 'warn': 1, 'info': 2}
    report['findings'].sort(key=lambda f: (rank[f['level']], f['model'], f['clip']))
    # strips: one per (model, clip) worth a look
    shown = set()
    for f in report['findings']:
        if f['level'] == 'info' or not f['clip'] or (f['model'], f['clip']) in shown or len(shown) >= 60: continue
        shown.add((f['model'], f['clip']))
        url = pg.evaluate('''async ([id, c]) => { const ts = []; const d = await window.animcheck.duration(id, c); for (let i = 0; i < 8; i++) ts.push(d * i / 8); return window.animcheck.strip(id, c, ts, true); }''', [f['model'], f['clip']])
        if url:
            name = f"{f['model']}__{f['clip']}.png".replace('/', '_')
            (out / name).write_bytes(base64.b64decode(url.split(',')[1]))
            f['strip'] = name
    b.close()
report['errors'] = errs
(out / 'report.json').write_text(json.dumps(report, indent=1))
bad = [f for f in report['findings'] if f['level'] == 'bad']
warn = [f for f in report['findings'] if f['level'] == 'warn']
lines = [f"# Animation check: {len(report['models'])} models, {len(bad)} bad, {len(warn)} to look at", '']
for f in report['findings']:
    if f['level'] == 'info': continue
    lines.append(f"- **{f['level']}** `{f['model']}` {('`' + f['clip'] + '`') if f['clip'] else ''} {f['check']}: {f['text']}" + (f" (at {f['at']} s)" if f['at'] is not None else '') + (f" ![]({f['strip']})" if f.get('strip') else ''))
(out / 'report.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines[:80]))
if errs: print('page errors:', errs[:5])
sys.exit(1 if bad else 0)
