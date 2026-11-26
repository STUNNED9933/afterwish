// (0.99.3) Buildings from KayKit's Medieval Hexagon Pack (Kay Lousberg, CC0), packed by tools/models/kaykit.mjs
// into models/kk_<id>.glb. Each map's houses get their own mix (a tavern, a forge, a chapel, mills...) instead of
// one cottage repeated; the keep's halls each get a building of their own, and its mines a mine.
// The models face +z (their door); placed, they face the way the hand-built house they replace did (-z).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

/** { scene, size } for a building (its footprint centred, standing on y = 0), or null if it cannot load. */
export function loadBuilding(id) {
  if (typeof location !== 'undefined' && location.protocol === 'file:') return Promise.resolve(null);
  if (!cache.has(id)) {
    cache.set(
      id,
      loader.loadAsync(`models/kk_${id}.glb`).then(
        (gltf) => {
          const scene = gltf.scene;
          scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(scene);
          const size = box.getSize(new THREE.Vector3());
          const wrap = new THREE.Group();
          scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
          wrap.add(scene);
          scene.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = true;
            o.receiveShadow = true;
            const m = o.material;
            if (m) {
              m.roughness = Math.max(m.roughness ?? 1, 0.7);
              m.metalness = 0;
            }
          });
          return { scene: wrap, size };
        },
        () => null,
      ),
    );
  }
  return cache.get(id);
}

const tinted = new Map();
/** A material washed toward one colour (Asterfell's sandstone, the drowned city's green), shared per colour. */
function tintOf(mat, color) {
  const key = mat.uuid + ':' + color;
  if (!tinted.has(key)) {
    const m = mat.clone();
    const c = new THREE.Color(color);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTint = { value: c };
      sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, 0.22) * uTint * 1.35;');
    };
    m.customProgramCacheKey = () => 'tint' + color;
    tinted.set(key, m);
  }
  return tinted.get(key);
}

/**
 * A building in a footprint: `fw` by `fd` metres (along its local x and z), as large as fits inside it.
 * at: { x, z, rot } (rot: the same turn the hand-built house had, about y). Optional: tint, scale (extra), lift.
 * Resolves to the placed group (not yet added to anything), or null.
 */
export function placeBuilding(id, { x, z, rot = 0, fw, fd, tint = null, scale = 1, turn = Math.PI }) {
  return loadBuilding(id).then((b) => {
    if (!b) return null;
    const sx = turn % Math.PI ? b.size.z : b.size.x, sz = turn % Math.PI ? b.size.x : b.size.z;
    const k = Math.min(fw / sx, fd / sz) * scale;
    const inner = b.scene.clone(true);
    if (tint != null) inner.traverse((o) => { if (o.isMesh) o.material = tintOf(o.material, tint); });
    inner.rotation.y = turn;
    inner.scale.setScalar(k);
    const g = new THREE.Group();
    g.add(inner);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.userData.height = b.size.y * k;
    return g;
  });
}

// Which building each house becomes, map by map (cycled in order of the map's houses).
export const TOWN_SET = ['tavern_yellow', 'home_a_blue', 'church_blue', 'home_b_yellow', 'windmill_yellow', 'home_a_green'];
export const KEEP_HOMES = ['home_a_red', 'home_b_red', 'tavern_red', 'windmill_red', 'lumbermill_red', 'home_b_yellow', 'home_a_green', 'watermill_blue'];
export const KEEP_HALLS = { warrior: 'barracks_red', archer: 'archeryrange_green', mage: 'tower_b_blue', rogue: 'market_yellow' };
export const CITY_SET = ['home_a_blue', 'home_b_blue', 'tavern_yellow', 'church_blue', 'home_b_red', 'tower_a_yellow', 'home_a_green', 'market_red', 'watermill_blue', 'lumbermill_green', 'home_b_yellow', 'blacksmith_red'];
