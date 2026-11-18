# (0.61.2) Deadeye is aimed while R is held: the line shows, nothing fires until R comes up, right-click
# puts it down, and the setting turns it back into a press-to-fire.  python3 test/deadeye-aim.py
import subprocess, time, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
srv = subprocess.Popen(['python3','-m','http.server','8773'], cwd=str(ROOT / 'dist'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
from playwright.sync_api import sync_playwright
fails=[]
def check(n, ok, info=''):
    print(('PASS ' if ok else 'FAIL ')+n+('  '+str(info) if info else ''))
    if not ok: fails.append(n)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); pg = b.new_page(viewport={'width':1300,'height':820})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8773/index.html?server=ws://127.0.0.1:1'); pg.wait_for_timeout(2000)
    pg.evaluate("() => localStorage.setItem('stunned-arena-settings-v1', JSON.stringify({ graphics: 'lowest', volume: 0, muted: true, cls: 'archer' }))")
    pg.reload(); pg.wait_for_timeout(2500)
    pg.evaluate("() => document.getElementById('btn-explore').click()"); pg.wait_for_timeout(4000)
    pg.evaluate("""() => { const w = game.world, p = w.player; p.level = 60; w.recalcStats(); game.act({ type: 'chooseSpec', id: 'sharpshooter' }); }""")
    pg.wait_for_timeout(300)
    # go to the Greenwood: the first portal out of Haven
    pg.evaluate("""() => { const w = game.world; w.loadMap('greenwood'); }""")
    pg.wait_for_timeout(2500)
    info = pg.evaluate("() => { const w = game.world; return { map: w.map && w.map.id, r: w.kit.r && w.kit.r.type, cd: w.player.cd.r, en: w.enemies.filter(e=>!e.dead).length, spec: w.player.spec } }")
    check('a level 60 Sharpshooter in the Greenwood has Deadeye on R', info['r'] == 'deadeye' and info['map'] == 'greenwood' and info['en'] > 2, info)
    # line three enemies up to the right of the hero, the last one off the screen up off to the right of the hero, far away
    pg.evaluate("""() => { const w = game.world, p = w.player; p.autoAttack = false; p.attackTarget = null; const live = w.enemies.filter(e => !e.dead).slice(0, 3);
      live.forEach((e, i) => { e.x = p.x + 7 + i * 6 + (i === 2 ? 12 : 0); e.z = p.z; e.aggro = false; w.stun(e, 8); }); }""")
    pg.wait_for_timeout(200)
    hero = pg.evaluate("() => { const p = game.world.player; return game.renderer.project(p.x, 0, p.z) }")
    aimAt = pg.evaluate("() => { const p = game.world.player; return game.renderer.project(p.x + 10, 0, p.z) }")
    pg.mouse.move(aimAt['x'], aimAt['y'])
    pg.keyboard.down('r'); pg.wait_for_timeout(500)
    st = pg.evaluate("() => ({ cd: game.world.player.cd.r, ch: !!game.world.player.channel })")
    check('holding R does not fire yet', st['cd'] == 0 and not st['ch'], st)
        # gets a marker at the edge of the screen', edge is not None, edge)
    hits = pg.evaluate("() => game.renderer.aim && game.renderer.aim.hits.length")
    check('the preview finds the enemies on the line', hits == 3, hits)
    edge = pg.evaluate("() => { const el = document.querySelector('.aim-edge'); return el && !el.classList.contains('hidden') ? el.textContent : null }")
    check('the target past the edge of the screen gets a marker there', edge is not None and 'hit 3 of 3' in edge, edge)
    check('the line and its marks are drawn', pg.evaluate("() => game.renderer.aimView.group.visible && game.renderer.aimView.marks.filter(m => m.ring.visible).length === 3"))
    pg.screenshot(path='/tmp/deadeye-aim.png')
    pg.keyboard.up('r'); pg.wait_for_timeout(900)
    st = pg.evaluate("() => ({ cd: game.world.player.cd.r })")
    check('letting go of R looses it', st['cd'] > 0, st)
    check('the aim is gone once loosed', pg.evaluate("() => !game.renderer.aim || !game.renderer.aimView.group.visible"))
    # cancel with right click
    pg.evaluate("() => { game.world.player.cd.r = 0 }")
    pg.keyboard.down('r'); pg.wait_for_timeout(200)
    pg.mouse.click(hero['x'] + 300, hero['y'], button='right'); pg.wait_for_timeout(100)
    pg.keyboard.up('r'); pg.wait_for_timeout(300)
    check('right-click puts it down without firing', pg.evaluate("() => game.world.player.cd.r") == 0)
    # setting off: fires on press
    pg.evaluate("() => { document.getElementById('held-aim').click() }")
    pg.keyboard.down('r'); pg.wait_for_timeout(150)
    check('with the setting off, R fires on the press', pg.evaluate("() => game.world.player.cd.r > 0 || !!game.world.player.channel"))
    pg.keyboard.up('r')
    print('errors', errs[:3]); b.close()
srv.terminate()
print('FAILED' if fails else 'ALL PASSED')
raise SystemExit(1 if fails else 0)
