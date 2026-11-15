// Merges animation clips from several Tripo GLBs of the same rig into one file (they come back
// in batches of up to 5), keeping only the clips the game uses, renamed as it expects.
//   node tools/models/merge.mjs out.glb base.glb "idle=idle,chop=attack" extra.glb "run=run" ...
// Run from a folder where @gltf-transform/core is installed (see optimize.mjs).
import { NodeIO } from '@gltf-transform/core';

const [out, ...rest] = process.argv.slice(2);
const io = new NodeIO();
const pairs = [];
for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], Object.fromEntries(rest[i + 1].split(',').map((kv) => kv.split('=')))]);
const base = await io.read(pairs[0][0]);
const root = base.getRoot();
const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];
const keep = new Set();
// Clips from the base file: rename the wanted ones, drop the rest.
for (const a of root.listAnimations()) {
  const want = pairs[0][1][a.getName()];
  if (want) {
    a.setName(want);
    keep.add(a);
  }
}
for (const [file, map] of pairs.slice(1)) {
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) {
    const want = map[a.getName()];
    if (!want) continue;
    const anim = base.createAnimation(want);
    for (const ch of a.listChannels()) {
      const target = nodes.get(ch.getTargetNode().getName());
      if (!target) continue;
      const s = ch.getSampler();
      const copy = (acc) => base.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buffer);
      const sampler = base.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
    keep.add(anim);
  }
}
for (const a of root.listAnimations()) if (!keep.has(a)) a.dispose();
await io.write(out, base);
console.log('clips:', root.listAnimations().map((a) => a.getName()).join(', '));
