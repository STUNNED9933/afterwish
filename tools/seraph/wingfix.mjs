// Move the Seraph's wing vertices off the arm bones (onto that side's clavicle), so a raised arm does not drag
// a strip of wing with it. node wingfix.mjs in.glb [out.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, out] = process.argv.slice(2);
const doc = await io.read(inp);
const root = doc.getRoot(); const skin = root.listSkins()[0];
const J0 = skin.listJoints(); const names = J0.map((j) => j.getName());
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const ibm = skin.getInverseBindMatrices().getArray();
const M = mul(J0[0].getWorldMatrix(), Array.from(ibm.slice(0, 16))); // mesh -> model, in the bind pose
const tr = (v) => [0, 1, 2].map((r) => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r]);
const wpos = (n) => J0[names.indexOf(n)].getWorldTranslation();
const sh = wpos('R_Upperarm'), shL = wpos('L_Upperarm'), sp = wpos('Spine02');
const H = wpos('Head')[1] - wpos('L_Foot')[1];
const backX = Math.min(sh[0], shL[0]) - 0.035 * H; // behind the shoulders' line: wing
console.log('model height', H.toFixed(3), 'shoulder x', sh[0].toFixed(3), 'backX', backX.toFixed(3));
const ARM = new Set(names.map((n, i) => (/(Upperarm|Forearm|Hand)/.test(n) ? i : -1)).filter((i) => i >= 0));
const clav = { L: names.indexOf('L_Clavicle'), R: names.indexOf('R_Clavicle') };
const prim = root.listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION'), Jt = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
const v = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
let moved = 0, armVerts = 0;
for (let k = 0; k < P.getCount(); k++) {
  P.getElement(k, v); Jt.getElement(k, j); W.getElement(k, w);
  let a = 0; for (let q = 0; q < 4; q++) if (ARM.has(j[q])) a += w[q];
  if (a <= 0.001) continue;
  armVerts++;
  const m = tr(v);
  // a wing: behind the shoulders, or out past the hand's reach to the side above the waist
  if (m[0] > backX) continue;
  moved++;
  for (let q = 0; q < 4; q++) if (ARM.has(j[q])) j[q] = names[j[q]].startsWith('L_') ? clav.L : clav.R;
  const acc = new Map(); for (let q = 0; q < 4; q++) acc.set(j[q], (acc.get(j[q]) || 0) + w[q]);
  const ent = [...acc.entries()].sort((x, y) => y[1] - x[1]);
  for (let q = 0; q < 4; q++) { j[q] = ent[q] ? ent[q][0] : 0; w[q] = ent[q] ? ent[q][1] : 0; }
  Jt.setElement(k, j); W.setElement(k, w);
}
console.log('arm-weighted verts', armVerts, 'moved to the clavicles', moved);
if (out) { await io.write(out, doc); console.log('wrote', out); }
