# The Lacuna story bot (1.1.4): plays the story from the first scene to the end of Act I, the way a player
# would (follows the quest marker, presses F at what can be used, reads every line, fights what fights it),
# and watches for what players notice. Writes report.json, report.md and report.html (with screenshots) to the
# out folder; exit code 1 if anything 'bad' was found.
#
#   python3 tools/playtest/lacuna_story.py [out-dir] [--from STAGE] [--until STAGE] [--minutes N]
#
# What it watches for:
#   error      an error on the page
#   stuck      the hero cannot get to where the quest leads (walking, and not moving), or a quest does not move on
#   unnamed    a line spoken with no name over it (or a name the cast does not know)
#   undefined  'undefined', 'null' or 'NaN' in what is on screen
#   intree     someone of the cast standing inside a tree, a rock or a house
#   overlap    two of the cast standing inside each other
#   offmap     the hero or the cast at an impossible place (NaN, far off the land, under the ground)
#   overlay    a window that will not close
import sys, os, json, time, math, urllib.parse, mimetypes, pathlib, html, argparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument('out', nargs='?', default=str(ROOT / 'tools/playtest/out/lacuna'))
ap.add_argument('--from', dest='start', default='new')
ap.add_argument('--until', default='act2')
ap.add_argument('--minutes', type=float, default=75)
ap.add_argument('--stage-minutes', type=float, default=9)
args = ap.parse_args()
OUT = pathlib.Path(args.out); OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob('*.png'): f.unlink()
DIST = ROOT / 'dist'
ORDER = ['new', 'stumble', 'rescued', 'waking', 'asking', 'days', 'crystal', 'path', 'ambush', 'hunt', 'mourning', 'contracts', 'report', 'invitation', 'tower', 'wards', 'act2']

findings, seen_keys, shots, timeline = [], set(), [], []
def finding(check, level, text, key=None, shot=True):
    key = key or (check, text)
    if key in seen_keys: return
    seen_keys.add(key)
    f = {'check': check, 'level': level, 'text': text, 'stage': state.get('stage') if state else None, 't': round(time.time() - T0, 1)}
    if shot: f['shot'] = snap(f'{check}')
    findings.append(f)
    print(f"  [{level}] {check}: {text}", flush=True)

def handle(route):
    p = urllib.parse.urlparse(route.request.url).path.lstrip('/') or 'lacuna.html'
    f = DIST / p
    try: route.fulfill(path=str(f), content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
    except Exception: route.fulfill(status=404, body='')

n_shot = [0]
def snap(tag):
    n_shot[0] += 1
    name = f'{n_shot[0]:04d}_{tag}.png'
    try: pg.screenshot(path=str(OUT / name))
    except Exception: return None
    return name

state = None
T0 = time.time()
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.on('pageerror', lambda e: finding('error', 'bad', str(e)[:300], key=('error', str(e)[:120])))
    pg.on('console', lambda m: finding('error', 'bad', 'console: ' + m.text[:300], key=('console', m.text[:120])) if m.type == 'error' and 'GL Driver' not in m.text and 'favicon' not in m.text else None)
    seed = {'stage': args.start}
    if ORDER.index(args.start) > ORDER.index('path'): seed.update({'path': 'warrior'})
    if ORDER.index(args.start) > ORDER.index('hunt'): seed.update({'linked': True, 'vesper': 'dead', 'ilse': 'gone'})
    pg.add_init_script("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('lacuna-story-v1', %s); }" % json.dumps(json.dumps(seed)))
    pg.route('http://game.local/**', handle)
    pg.goto('http://game.local/lacuna.html?timescale=3')
    pg.wait_for_function('() => window.land && window.land.__bot', timeout=180000)
    S = lambda: pg.evaluate('() => window.land.__bot.state()')
    bot = lambda code: pg.evaluate('() => window.land.__bot.' + code)
    key = lambda code: pg.evaluate('(c) => window.land.__bot.key(c)', code)
    stage_at, last_stage, last_goal, goal_at = time.time(), None, None, time.time()
    pos_hist = []
    lines_seen = set()
    last_line, line_at = None, 0
    unstick = 0
    fight_t = None
    detour = None
    while True:
        if time.time() - T0 > args.minutes * 60:
            finding('stuck', 'bad', f'out of time ({args.minutes} min) at stage {state and state["stage"]}', shot=True); break
        try: state = S()
        except Exception as e:
            finding('error', 'bad', f'the page stopped answering: {str(e)[:200]}'); break
        st = state['stage']
        if st != last_stage:
            timeline.append({'stage': st, 't': round(time.time() - T0, 1), 'shot': snap(f'stage_{st}')})
            print(f'stage {st} at {round(time.time() - T0)} s', flush=True)
            last_stage, stage_at = st, time.time()
        if ORDER.index(st) >= ORDER.index(args.until): break
        goal = tuple(state['quest'])
        if goal != last_goal: last_goal, goal_at = goal, time.time()
        if time.time() - goal_at > args.stage_minutes * 60:
            finding('stuck', 'bad', f'the quest did not move on in {args.stage_minutes} min: {goal[0]} / {goal[1][:120]}'); break
        me = state['me']
        if time.time() - globals().get('_beat', 0) > 45:
            globals()['_beat'] = time.time()
            print(f"  .. {round(time.time() - T0)} s {st} | {state['quest'][1][:70]} | at ({round(me['x'])}, {round(me['z'])}) lead {state['lead'] and (round(state['lead']['x']), round(state['lead']['z']))} use {state['use']} scene {bool(state['scene'])}", flush=True)
        # --- checks
        if not all(math.isfinite(v) for v in (me['x'], me['z'])) or abs(me['x']) > 300 or abs(me['z']) > 300:
            finding('offmap', 'bad', f'the hero is at an impossible place ({me["x"]}, {me["z"]})')
        txt = pg.evaluate("() => [document.getElementById('quest').innerText, document.getElementById('cs-box').innerText, document.getElementById('note').innerText, document.getElementById('side-quest').innerText].join(' | ')")
        for bad_word in ('undefined', 'NaN', 'null', '[object'):
            if bad_word in txt: finding('undefined', 'bad', f'"{bad_word}" on screen: {txt[:200]}', key=('undefined', st, bad_word))
        actors = bot('actors()')
        for a in actors:
            for o in pg.evaluate('([x, z]) => window.land.__bot.solids(x, z, 0.6)', [a['x'], a['z']]):
                inside = (abs(a['x'] - o['x']) < o['hw'] * 0.85 and abs(a['z'] - o['z']) < o['hd'] * 0.85) if o.get('hw') else math.hypot(a['x'] - o['x'], a['z'] - o['z']) < o['r'] * 0.7
                if inside: finding('intree', 'bad', f'{a["who"]} is standing inside a {o["kind"]} at ({round(o["x"])}, {round(o["z"])})', key=('intree', a['who'], o['kind'], round(o['x']), round(o['z'])))
        for i, a in enumerate(actors):
            for c in actors[i + 1:]:
                if math.hypot(a['x'] - c['x'], a['z'] - c['z']) < 0.3 and not state['scene']:
                    finding('overlap', 'warn', f'{a["who"]} and {c["who"]} stand inside each other', key=('overlap', a['who'], c['who'], st))
        if state['overlays']: key('Escape')
        # --- what a player would do
        sc = state['scene']
        if sc:
            bot('stop()')
            if sc['shown'] and sc['text'] and sc['text'] != last_line:
                last_line, line_at = sc['text'], time.time()
                if not sc.get('thought') and not sc['name']: finding('unnamed', 'bad', f'a line with no name over it: "{sc["text"][:100]}"', key=('unnamed', sc['text'][:60]))
                if sc['who']:
                    time.sleep(0.9)  # (the camera's move to the speaker)
                    vw = bot('view()')
                    if vw and vw.get('missing'): finding('camera', 'warn', f'{sc["name"]} speaks but is not in the scene: "{sc["text"][:80]}"', key=('nobody', sc['who'], st))
                    elif vw and not vw['onscreen']: finding('camera', 'warn', f'{sc["name"]} speaks off screen: "{sc["text"][:80]}"', key=('off', sc['text'][:50]))
                    elif vw and vw['hidden']: finding('camera', 'warn', f'{sc["name"]} speaks hidden behind a {vw["hidden"]}: "{sc["text"][:80]}"', key=('hid', sc['text'][:50]))
                    if vw and vw.get('camIn'): finding('camera', 'warn', f'the camera is inside a {vw["camIn"]} as {sc["name"]} speaks: "{sc["text"][:80]}"', key=('in', sc['text'][:50]))
                if sc['text'] not in lines_seen and len(shots) < 400:
                    lines_seen.add(sc['text'])
                    time.sleep(0.25)
                    shots.append({'stage': st, 'who': sc['name'], 'text': sc['text'], 'shot': snap('line')})
            if sc['prompt']: key(sc['prompt'] if sc['prompt'] != 'Click' else 'Space'); time.sleep(0.15)
            elif time.time() - line_at > 0.6: key('Space'); line_at = time.time()
            time.sleep(0.15); continue
        if state['choose']: key('Digit1'); time.sleep(0.5); continue
        if me['hp'] < me['maxHp'] * 0.8: pg.evaluate('() => { window.land.me.hp = window.land.me.maxHp; }')  # (the bot looks for bugs, not for a hard fight)
        if state['use'] and not any(w in state['use'] for w in ('board', 'Rift', 'bount')):
            bot('stop()'); key('KeyF'); time.sleep(0.4); continue
        foes = bot('foes()')
        # a story's foes are fought; a wild beast only by a hero with a path (a weaponless boy keeps to the road)
        near = [f for f in foes if (f['story'] or (f['chase'] and state['path'])) and math.hypot(f['x'] - me['x'], f['z'] - me['z']) < 14]
        if near:
            fight_t = fight_t or time.time()
            if time.time() - fight_t > 60 and not near[0]['story']: near = []  # a wild beast that will not die: move on (the story's own foes are fought to the end)
        else: fight_t = None
        if st == 'path' and state['trial'] == 'archer':
            # Juni's trial: from the line, at the targets (the far one first), every skill in turn
            lead = state['lead']
            if lead and math.hypot(lead['x'] - me['x'], lead['z'] - me['z']) > 1.2: bot(f'walk({lead["x"]}, {lead["z"]}, 0.8)'); time.sleep(0.3); continue
            bot('stop()')
            tg = sorted([d for d in bot('dummies()') if not d['ring']], key=lambda d: -math.hypot(d['x'] - me['x'], d['z'] - me['z']))
            for d in tg[:3]:
                for k in ('basic', 'Q', 'basic', 'R'): pg.evaluate('([k, x, z]) => window.land.__bot.act(k, x, z)', [k, d['x'], d['z']]); time.sleep(0.25)
            continue
        if st == 'path' and state['trial'] in ('warrior', 'archer'):
            dums = [d for d in bot('dummies()') if d['ring']] or bot('dummies()')
            d = min(dums, key=lambda d: math.hypot(d['x'] - me['x'], d['z'] - me['z']))
            if math.hypot(d['x'] - me['x'], d['z'] - me['z']) > 2.2: bot(f'walk({d["x"]}, {d["z"]})')
            else:
                bot('stop()')
                for k in ('basic', 'Q', 'E', 'basic', 'R', 'basic'): pg.evaluate('([k, x, z]) => window.land.__bot.act(k, x, z)', [k, d['x'], d['z']]); time.sleep(0.12)
            time.sleep(0.2); continue
        if near:
            f = near[0]
            if math.hypot(f['x'] - me['x'], f['z'] - me['z']) > 2.0: bot(f'walk({f["x"]}, {f["z"]})')
            else:
                bot('stop()')
                for k in ('basic', 'Q', 'basic', 'E', 'basic'): pg.evaluate('([k, x, z]) => window.land.__bot.act(k, x, z)', [k, f['x'], f['z']]); time.sleep(0.1)
            time.sleep(0.15); continue
        lead = state['lead']
        if lead:
            d = math.hypot(lead['x'] - me['x'], lead['z'] - me['z'])
            if d > 1.9:
                # walk at it; blocked (no nearer in 2 s), go round: a few steps to one side, then the other
                pos_hist.append((time.time(), d, lead['x'], lead['z']))
                pos_hist = [p for p in pos_hist if time.time() - p[0] < 25]
                recent = [p for p in pos_hist if time.time() - p[0] < 2.2]
                if detour and time.time() < detour[2]:
                    bot(f'walk({detour[0]}, {detour[1]})')
                elif len(recent) > 3 and recent[0][1] - d < 0.3:
                    side = 1 if (len(pos_hist) // 7) % 2 == 0 else -1
                    ux, uz = (lead['x'] - me['x']) / d, (lead['z'] - me['z']) / d
                    detour = (me['x'] - uz * 3.5 * side + ux * 1.0, me['z'] + ux * 3.5 * side + uz * 1.0, time.time() + 1.6)
                    bot(f'walk({detour[0]}, {detour[1]})')
                else:
                    detour = None
                    bot(f'walk({lead["x"]}, {lead["z"]}, 1.6)')
                moving_lead = math.hypot(pos_hist[0][2] - lead['x'], pos_hist[0][3] - lead['z']) > 2
                if moving_lead: pos_hist = pos_hist[-1:]
                if not moving_lead and time.time() - pos_hist[0][0] > 20 and pos_hist[0][1] - d < 1.0:
                    finding('stuck', 'warn', f'the hero could not get to where the quest leads ({goal[0]}: {goal[1][:80]}): at ({round(me["x"])}, {round(me["z"])}), {round(d)} m short, going round did not help', key=('stuck', st, round(lead['x']), round(lead['z'])))
                    pg.evaluate('([x, z]) => { const m = window.land.me; m.x += (x - m.x) * 0.5; m.z += (z - m.z) * 0.5; }', [lead['x'], lead['z']])
                    pos_hist = []
            else: bot('stop()')
        else: bot('stop()')
        time.sleep(0.2)
    b.close()

rank = {'bad': 0, 'warn': 1, 'info': 2}
findings.sort(key=lambda f: rank[f['level']])
report = {'reached': state and state['stage'], 'minutes': round((time.time() - T0) / 60, 1), 'findings': findings, 'timeline': timeline, 'lines': shots}
(OUT / 'report.json').write_text(json.dumps(report, indent=1))
bad = [f for f in findings if f['level'] == 'bad']
md = [f"# Lacuna story bot: reached `{report['reached']}` in {report['minutes']} min, {len(bad)} bad, {len(findings) - len(bad)} to look at", '']
md += [f"- **{f['level']}** {f['check']} ({f['stage']}): {f['text']}" for f in findings]
(OUT / 'report.md').write_text('\n'.join(md) + '\n')
# a page to look through: findings first, then every line of the story as it was on screen
h = ['<!doctype html><meta charset=utf-8><title>Lacuna story bot</title><style>body{font:14px system-ui;background:#111;color:#ddd;margin:20px}img{width:480px;border:1px solid #333}.f{margin:10px 0}.bad{color:#ff7a6a}.warn{color:#ffc45a}.g{display:grid;grid-template-columns:repeat(auto-fill,490px);gap:8px}figure{margin:0}figcaption{font-size:12px;color:#aaa}</style>']
h.append(f"<h1>{html.escape(md[0][2:])}</h1>")
for f in findings:
    h.append(f"<div class=f><b class={f['level']}>{f['level']}</b> {html.escape(f['check'])} ({f['stage']}): {html.escape(f['text'])}<br>" + (f"<img src='{f['shot']}'>" if f.get('shot') else '') + '</div>')
h.append('<h2>Stages</h2><div class=g>' + ''.join(f"<figure><img src='{t['shot']}'><figcaption>{t['stage']} at {t['t']} s</figcaption></figure>" for t in timeline) + '</div>')
h.append('<h2>Every line, as shown</h2><div class=g>' + ''.join(f"<figure><img src='{s['shot']}'><figcaption>[{s['stage']}] <b>{html.escape(s['who'] or '(thought)')}</b>: {html.escape(s['text'][:140])}</figcaption></figure>" for s in shots) + '</div>')
(OUT / 'report.html').write_text('\n'.join(h))
print('\n'.join(md[:60]))
sys.exit(1 if bad else 0)
