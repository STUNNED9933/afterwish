// Landmark models made with Tripo (0.41): Haven's cottages, Asterfell's houses, the stone
// arches over every portal and the Keep's ruined towers. Each loads once, is turned into one
// geometry standing on the ground (centred, its long side along x, its front toward -z), and
// is then drawn as instances. Until it arrives (or when it cannot load) the hand-built
// version stays.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// turn: radians about y to put the long side along x and the front toward -z.
export const PROPS = {
  cottage: { url: 'models/env_cottage.glb', turn: 0 },
  asterhouse: { url: 'models/env_asterhouse.glb', turn: Math.PI / 2 },
  waygate: { url: 'models/env_waygate.glb', turn: Math.PI / 2 },
  tower: { url: 'models/env_tower.glb', turn: 0 },
};

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

/** { geometry, material, size: Vector3 } for a prop, or null if it cannot load. */
export function loadProp(name) {
  const P = PROPS[name];
  if (!P) return Promise.resolve(null);
  if (typeof location !== 'undefined' && location.protocol === 'file:') return Promise.resolve(null);
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(P.url).then(
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          let mesh = null;
          gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
          if (!mesh) return null;
          const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          geometry.rotateY(P.turn);
          geometry.computeBoundingBox();
          const b = geometry.boundingBox;
          geometry.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          const size = new THREE.Vector3();
          geometry.boundingBox.getSize(size);
          const material = mesh.material;
          material.roughness = Math.max(material.roughness ?? 1, 0.75);
          material.metalness = 0;
          return { geometry, material, size };
        },
        () => null,
      ),
    );
  }
  return cache.get(name);
}

/**
 * Instances of a prop. list: [{ x, z, rot, sx, sy, sz }] where sx/sy/sz are the size wanted
 * in metres (sy optional: then height follows the footprint). Returns a Promise of the mesh.
 */
export function propInstances(name, list, { shadow = true } = {}) {
  return loadProp(name).then((p) => {
    if (!p || !list.length) return null;
    const mesh = new THREE.InstancedMesh(p.geometry, p.material, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((it, i) => {
      const kx = it.sx / p.size.x, kz = it.sz / p.size.z;
      const ky = it.sy ? it.sy / p.size.y : (kx + kz) / 2;
      m.compose(v.set(it.x, it.y || 0, it.z), q.setFromAxisAngle(up, it.rot || 0), s.set(kx, ky, kz));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  });
}
