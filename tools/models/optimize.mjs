// Shrinks a Tripo model for the game: 1024px WebP texture, meshopt-compressed geometry and
// animation, nothing simplified (the skin weights must stay intact).
//   node tools/models/optimize.mjs <tripo model.glb> <name>   → assets/models/<name>.glb
import { execFileSync } from 'node:child_process';
const [src, name] = process.argv.slice(2);
if (!src || !name) {
  console.error('usage: node tools/models/optimize.mjs <model.glb> <name>');
  process.exit(2);
}
execFileSync('npx', ['--yes', '@gltf-transform/cli@4', 'optimize', src, `assets/models/${name}.glb`, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false', '--join', 'false', '--instance', 'false', '--flatten', 'false'], { stdio: 'inherit' });
