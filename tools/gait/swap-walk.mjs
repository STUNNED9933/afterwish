// node swap-walk.mjs in.glb clips.json out.glb : adds the clips, drops ual_Walk, prunes what it left behind
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const [inp, json, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
const clips = JSON.parse(readFileSync(json, 'utf8'));
for (const a of root.listAnimations()) if (a.getName() === 'ual_Walk' || a.getName() in clips) { for (const s of a.listSamplers()) { s.getInput()?.dispose(); s.getOutput()?.dispose(); } a.dispose(); }
for (const [name, c] of Object.entries(clips)) {
  const anim = doc.createAnimation(name);
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(c.times)).setBuffer(buffer);
  const add = (node, path, type, arr) => {
    const output = doc.createAccessor().setType(type).setArray(new Float32Array(arr)).setBuffer(buffer);
    const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));
  };
  for (const [bone, q] of Object.entries(c.rot)) if (nodes.has(bone)) add(nodes.get(bone), 'rotation', 'VEC4', q);
  if (c.hipPos && nodes.has('Hip')) add(nodes.get('Hip'), 'translation', 'VEC3', c.hipPos);
}
await io.write(out, doc);
console.log(out, root.listAnimations().map((a) => a.getName()).join(','));
