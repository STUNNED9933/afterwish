// Buildings from KayKit's Medieval Hexagon Pack (Kay Lousberg, CC0: free for commercial use, credit optional).
// Packs the ones the game uses into assets/models/kk_<id>.glb (meshopt-compressed, texture embedded).
//
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/kaykit-medieval-hexagon-pack-1.0 <pack>
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   node tools/models/kaykit.mjs <pack>/addons/kaykit_medieval_hexagon_pack/Assets/gltf <repo>/assets/models
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, dedup, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const [src, out] = process.argv.slice(2);
// id -> path under gltf/
export const KAYKIT = {
  home_a_red: 'buildings/red/building_home_A_red',
  home_a_blue: 'buildings/blue/building_home_A_blue',
  home_a_green: 'buildings/green/building_home_A_green',
  home_b_yellow: 'buildings/yellow/building_home_B_yellow',
  home_b_red: 'buildings/red/building_home_B_red',
  home_b_blue: 'buildings/blue/building_home_B_blue',
  tavern_yellow: 'buildings/yellow/building_tavern_yellow',
  tavern_red: 'buildings/red/building_tavern_red',
  blacksmith_red: 'buildings/red/building_blacksmith_red',
  church_blue: 'buildings/blue/building_church_blue',
  market_red: 'buildings/red/building_market_red',
  market_yellow: 'buildings/yellow/building_market_yellow',
  windmill_yellow: 'buildings/yellow/building_windmill_yellow',
  windmill_red: 'buildings/red/building_windmill_red',
  watermill_blue: 'buildings/blue/building_watermill_blue',
  lumbermill_green: 'buildings/green/building_lumbermill_green',
  lumbermill_red: 'buildings/red/building_lumbermill_red',
  barracks_red: 'buildings/red/building_barracks_red',
  archeryrange_green: 'buildings/green/building_archeryrange_green',
  tower_b_blue: 'buildings/blue/building_tower_B_blue',
  tower_a_yellow: 'buildings/yellow/building_tower_A_yellow',
  mine_red: 'buildings/red/building_mine_red',
  well_blue: 'buildings/blue/building_well_blue',
  grain: 'buildings/neutral/building_grain',
};

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
let total = 0;
for (const [id, path] of Object.entries(KAYKIT)) {
  const doc = await io.read(`${src}/${path}.gltf`);
  await doc.transform(dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const bin = await io.writeBinary(doc);
  const fs = await import('node:fs');
  fs.writeFileSync(`${out}/kk_${id}.glb`, bin);
  total += bin.length;
  console.log(id, (bin.length / 1024).toFixed(0) + ' KB');
}
console.log('total', (total / 1024).toFixed(0) + ' KB');
