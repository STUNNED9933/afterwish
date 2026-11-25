# The Seraph's own moves (0.98)

- `wingfix.mjs`: moves the wing vertices off the arm bones and onto the clavicles. In the Tripo auto-rig, part of each wing is skinned to the upper arm, so a raised arm stretched a strip of wing. Run it once on the raw model.
- `pose.js` + `pose.py`: author a clip from keyframes, using the model's own idle underneath. A keyframe can bend the spine, lift the shoulders (and wings), pitch the legs, and place the wrists by two-bone IK.
  - `pray.json` is `seraph_pray`, the basic attack: hands meet in prayer, then thrust forward to loose the light (about 65% of the way in).
  - `glide.json` is `seraph_glide`: leaning into the flight, wings raised and spread, arms swept back.
- To bake: run `node wingfix.mjs raw.glb w.glb`, then `pose.py` for each spec, then `add-clips-mo.mjs w.glb clips.json k_statue.glb`.
