// Cross-engine check for the Weekly Echo: the same recorded runs must give the same result in
// Node (V8, like the server), Chromium (V8), Firefox (SpiderMonkey) and Safari (JavaScriptCore).
// Run with: node test/determinism.mjs   (needs: npx playwright install chromium firefox webkit)
import { build } from 'esbuild';
import { runAll, CASES } from './determinism-entry.mjs';

const WEEKS = [0, 1, 2];
const SECONDS = Number(process.env.DET_SECONDS || 240);
const bundle = (await build({ entryPoints: [new URL('./determinism-entry.mjs', import.meta.url).pathname], bundle: true, format: 'iife', globalName: 'Det', write: false, define: { __TRIAL_API__: '""' } })).outputFiles[0].text;

const expected = {};
for (const w of WEEKS) expected[w] = runAll(w, SECONDS);
let bad = 0;
for (const w of WEEKS) for (const r of expected[w]) {
  if (r.hash !== r.replayHash) { bad++; console.log(`FAIL node week ${w} ${r.spec}: replay differs`); }
}
console.log(`node: ${WEEKS.length * CASES.length} runs, floors ${WEEKS.map((w) => expected[w].map((r) => r.floor).join('/')).join(' | ')}`);

const pw = await import('playwright');
for (const name of (process.env.DET_BROWSERS || 'chromium,firefox,webkit').split(',')) {
  const browser = await pw[name].launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>det</title>');
  await page.addScriptTag({ content: bundle });
  for (const w of WEEKS) {
    // What the Weekly Echo relies on: Node's recordings (as the server would replay them) give the same result here.
    const got = await page.evaluate(([wi, runs]) => globalThis.Det.replayAll(wi, runs), [w, expected[w].map((r) => ({ spec: r.spec, build: r.build, record: r.record, ticks: r.ticks }))]);
    got.forEach((r, i) => {
      const e = expected[w][i];
      const same = r.hash === e.hash && r.floor === e.floor && r.clearTick === e.clearTick;
      if (!same) { bad++; console.log(`FAIL ${name} week ${w} ${r.spec}: replay ${JSON.stringify(r)} vs node ${JSON.stringify({ floor: e.floor, clearTick: e.clearTick, hash: e.hash })}`); }
    });
    // Also play live, as a player would (informational: the bot's own choices can differ on near-ties).
    const live = await page.evaluate(([wi, s]) => globalThis.Det.runAll(wi, s).map((r) => ({ spec: r.spec, hash: r.hash, replayHash: r.replayHash })), [w, SECONDS]);
    live.forEach((r) => {
      if (r.hash !== r.replayHash) { bad++; console.log(`FAIL ${name} week ${w} ${r.spec}: its own live run and replay differ`); }
    });
  }
  console.log(`${name}: checked`);
  await browser.close();
}
console.log(bad ? `${bad} differences` : 'All engines agree.');
process.exit(bad ? 1 : 0);
