// Adds retargeted clips (JSON from the retargeter: { name: { times, rot: { bone: [x,y,z,w,...] }, hipPos } })
// to a rigged GLB, each named "<prefix><name>".
//   node tools/models/add-clips.mjs in.glb clips.json out.glb [prefix]
// Run from a folder where @gltf-transform/core is installed.
import { NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'node:fs';
const [inp, json, out, prefix = ''] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(inp);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
const clips = JSON.parse(readFileSync(json, 'utf8'));
for (const [name, c] of Object.entries(clips)) {
  const anim = doc.createAnimation(prefix + name);
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
console.log('clips:', root.listAnimations().map((a) => a.getName()).join(', '));
