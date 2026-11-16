// node calib.mjs <glb> <kind: blade|staff>  -> { tip, butt, side }
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const [file, kind] = process.argv.slice(2);
await MeshoptDecoder.ready;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(file);
const pts = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const a = prim.getAttribute('POSITION'); const v = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v);
      pts.push([m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]);
    }
  }
}
// the long axis: the main direction the points spread in (power iteration on their covariance)
const n = pts.length, mean = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / n);
const C = [[0,0,0],[0,0,0],[0,0,0]];
for (const p of pts) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += (p[a] - mean[a]) * (p[b] - mean[b]);
const pc = (M, skip) => { let v = [0.3, 1, 0.2]; for (let it = 0; it < 80; it++) { let nv = [0,1,2].map((a) => M[a][0]*v[0] + M[a][1]*v[1] + M[a][2]*v[2]); if (skip) { const d = nv[0]*skip[0]+nv[1]*skip[1]+nv[2]*skip[2]; nv = nv.map((x, k) => x - d * skip[k]); } const l = Math.hypot(...nv) || 1; v = nv.map((x) => x / l); } return v; };
const axis = pc(C);
const t = pts.map((p) => (p[0]-mean[0])*axis[0] + (p[1]-mean[1])*axis[1] + (p[2]-mean[2])*axis[2]);
const tmin = Math.min(...t), tmax = Math.max(...t);
const N = 24, w = Array(N).fill(0), bins = Array.from({ length: N }, () => []);
pts.forEach((p, i) => {
  const b = Math.min(N - 1, Math.floor(((t[i] - tmin) / (tmax - tmin)) * N));
  const q = [0,1,2].map((k) => p[k] - mean[k] - axis[k] * t[i]);
  w[b] = Math.max(w[b], Math.hypot(...q)); bins[b].push(q);
});
const wide = w.indexOf(Math.max(...w));
const lowEnd = wide < N / 2;
const at = (tt) => [0,1,2].map((k) => +(mean[k] + axis[k] * tt).toFixed(3));
const tipAtLow = kind === 'staff' ? lowEnd : !lowEnd;
const tip = at(tipAtLow ? tmin : tmax), butt = at(tipAtLow ? tmax : tmin);
// the guard's direction: the widest spread across the axis at the widest part
const G = [[0,0,0],[0,0,0],[0,0,0]];
for (const q of bins[wide]) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) G[a][b] += q[a] * q[b];
const side = pc(G, axis).map((x) => +x.toFixed(3));
console.log(JSON.stringify({ tip, butt, side, wide }));
