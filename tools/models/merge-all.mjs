// Merges every animation clip from a Tripo run's batches (4-anim-1, 4-anim-2, ...) into one GLB,
// each clip named after its preset (idle, walk, slash, cast_a_spell, ...), for the creatures (0.44).
//   node tools/models/merge-all.mjs out.glb batch1.glb [batch2.glb ...]
// Run from a folder where @gltf-transform/core is installed (see optimize.mjs).
import { NodeIO } from '@gltf-transform/core';

const [out, first, ...more] = process.argv.slice(2);
const io = new NodeIO();
const clean = (n) => String(n).replace(/^.*preset[:_]/i, '').replace(/^biped[:_]/i, '').replace(/^(quadruped|hexapod)[:_]/i, '').toLowerCase() || 'clip';
const base = await io.read(first);
const root = base.getRoot();
const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];
const names = new Set();
const name = (n) => { let k = clean(n), i = 2; while (names.has(k)) k = clean(n) + '_' + i++; names.add(k); return k; };
for (const a of root.listAnimations()) a.setName(name(a.getName()));
for (const file of more) {
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) {
    const anim = base.createAnimation(name(a.getName()));
    for (const ch of a.listChannels()) {
      const target = nodes.get(ch.getTargetNode().getName());
      if (!target) continue;
      const s = ch.getSampler();
      const copy = (acc) => base.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buffer);
      const sampler = base.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
  }
}
await io.write(out, base);
console.log('clips:', root.listAnimations().map((a) => a.getName()).join(', '));
