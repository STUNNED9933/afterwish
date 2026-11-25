# Hero walk (0.96.1)

`gait.js` writes a walk cycle straight onto a Tripo hero skeleton. No mocap is involved.

- **Feet:** planted by IK. Each foot runs heel strike, flat foot, ball, then toe-off, followed by an arcing swing. A planted foot stays put, so nothing slides at the speed the cycle is timed for (1.8 m/s).
- **Hips:** they drop only as far as the legs need to reach, so the bob comes out of the stride itself.
- **Arms:** they hang as in the model's own `idle` clip, so each model's elbows, wrists and grip look right. The walk then swings them against the legs.
- **Styles:**
  - `m`: wider base, more shoulder and arm swing.
  - `f`: feet near one line, more hip turn and sway, arms closer in, quicker cadence.

To rebuild every model:

1. Bundle `gait.js` with three.js (esbuild).
2. Serve it with `gait.html`.
3. Run `python3 gait.py "$(cat jobs.json)"`. This writes one JSON per model.
4. For each model, run `node swap-walk.mjs in.glb clip.json out.glb`. This replaces the walk with `gait_Walk`.
