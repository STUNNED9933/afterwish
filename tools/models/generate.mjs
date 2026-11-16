// Makes animated character models with the Tripo API, through the official tripo-cli.
// Runs in GitHub Actions (see .github/workflows/models.yml) with the TRIPO_API_KEY secret;
// the key is never printed or written anywhere.
//
//   node tools/models/generate.mjs warrior [archer ...]          # spends credits
//   node tools/models/generate.mjs --dry-run warrior             # free, offline: shows the plan and estimate
//
// For each character: text → 3D (H3.1, smart low-poly, face limit) → rig-check → rig → animations.
// Everything lands in out/models/<id>/ with a manifest.json (task ids, files, credits used).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const ids = args.filter((a) => !a.startsWith('--'));
const roster = JSON.parse(readFileSync(new URL('./roster.json', import.meta.url), 'utf8'));
if (!ids.length) {
  console.error('Name at least one character from roster.json:', Object.keys(roster.characters).join(', '));
  process.exit(2);
}

/** Run one tripo command; return its single JSON line. */
function tripo(cmdArgs, { allowFail = false } = {}) {
  console.error(`$ tripo ${cmdArgs.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
  try {
    const out = execFileSync('tripo', [...cmdArgs, '--json', '--yes', '--no-open'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 });
    const line = out.trim().split('\n').filter(Boolean).pop();
    return JSON.parse(line);
  } catch (err) {
    const line = String(err.stdout || '').trim().split('\n').filter(Boolean).pop();
    const parsed = line ? (() => { try { return JSON.parse(line); } catch { return { raw: line }; } })() : {};
    if (allowFail) return { failed: true, exit: err.status, ...parsed };
    console.error(`tripo failed (exit ${err.status}):`, JSON.stringify(parsed));
    throw err;
  }
}
const taskId = (r) => r.task_id || r.id || (r.task && (r.task.task_id || r.task.id)) || (r.data && r.data.task_id);
const credits = () => {
  const b = tripo(['balance'], { allowFail: true });
  const n = b.balance ?? b.available ?? (b.data && (b.data.balance ?? b.data.available)) ?? null;
  console.error(`credits: ${n ?? JSON.stringify(b)}`);
  return n;
};
function listFiles(dir) {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p)); } };
  try { walk(dir); } catch { /* none */ }
  return out;
}

let failures = 0;
for (const id of ids) {
  const c = roster.characters[id];
  if (!c) {
    console.error(`No character "${id}" in roster.json`);
    failures++;
    continue;
  }
  const prompt = `${c.prompt}. ${c.style || roster.style}`.slice(0, 1000); // style: props (weapons) have their own
  const gen = ['generate', 'text-to-model', prompt, '--model', 'tripo-v3.1', '-p', `face_limit=${c.faceLimit || roster.faceLimit}`, '-p', 'smart_low_poly=true'];
  if (dry) {
    console.log(JSON.stringify({ id, plan: tripo(['make', prompt, '--for', 'anim', '--model', 'tripo-v3.1', '-p', `face_limit=${c.faceLimit || roster.faceLimit}`, '-p', 'smart_low_poly=true', '--dry-run']) }));
    continue;
  }
  const dir = join('out', 'models', id);
  mkdirSync(dir, { recursive: true });
  if (c.fetchAnims) {
    // Download animation tasks that already ran (a lost result): no credits spent.
    c.fetchAnims.forEach((t, i) => tripo(['task', 'get', t, '--download', '-o', join(dir, `4-anim-${i + 1}`)]));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id, fetched: c.fetchAnims, files: listFiles(dir) }, null, 2));
    console.log(JSON.stringify({ id, ok: true, fetched: true, files: listFiles(dir) }));
    continue;
  }
  const manifest = { id, prompt, started: new Date().toISOString(), creditsBefore: credits(), steps: {} };
  const save = () => writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, files: listFiles(dir) }, null, 2));
  try {
    // fromTask: reuse a model already generated (e.g. to re-rig it with another rig model).
    const model = c.fromTask || c.fromRig ? { task_id: c.fromTask } : tripo([...gen, '-o', join(dir, '1-model')]);
    manifest.steps.model = { task: taskId(model), result: model };
    save();
    // rig: false — a prop (a weapon): the model is all there is.
    if (c.rig === false) throw Object.assign(new Error('done'), { done: true });
    // fromRig: add animations to a model already rigged (no new rig).
    let rig;
    if (c.fromRig) rig = { task_id: c.fromRig };
    else {
      const check = tripo(['anim', 'check', taskId(model), '-o', join(dir, '2-check')]);
      manifest.steps.check = { task: taskId(check), result: check };
      const riggable = check.riggable ?? (check.output && check.output.riggable);
      const rigType = c.rigType || check.rig_type || (check.output && check.output.rig_type);
      save();
      if (riggable === false) throw new Error(`rig-check says ${id} cannot be rigged`);
      rig = tripo(['anim', 'rig', taskId(model), ...(rigType ? ['--rig-type', rigType] : []), ...(c.rigModel ? ['--model', c.rigModel] : []), '--out-format', 'glb', '-o', join(dir, '3-rig')]);
      manifest.steps.rig = { task: taskId(rig), rigType, result: rig };
      save();
    }
    // Animations, at most 5 per request (each request returns the model with its clips).
    const anims = c.animations || [];
    manifest.steps.animations = [];
    for (let i = 0; i < anims.length; i += 5) {
      const batch = anims.slice(i, i + 5);
      const anim = tripo(['anim', 'retarget', taskId(rig), '--animation', ...batch, '--out-format', 'glb', '--animate-in-place', '-o', join(dir, `4-anim-${i / 5 + 1}`)]);
      manifest.steps.animations.push({ task: taskId(anim), presets: batch, result: anim });
      save();
    }
  } catch (err) {
    if (!err.done) {
      manifest.error = String(err.message || err);
      failures++;
    }
  }
  manifest.creditsAfter = credits();
  if (manifest.creditsBefore != null && manifest.creditsAfter != null) manifest.creditsUsed = manifest.creditsBefore - manifest.creditsAfter;
  manifest.finished = new Date().toISOString();
  save();
  console.log(JSON.stringify({ id, ok: !manifest.error, error: manifest.error, creditsUsed: manifest.creditsUsed, files: listFiles(dir) }));
}
process.exit(failures ? 1 : 0);
