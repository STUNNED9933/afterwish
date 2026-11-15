// Post-processing for the High graphics setting (0.34): bloom on bright things (spells,
// lava, glows) and a colour grade with a vignette. Medium and Low skip all of this.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uSat: { value: 1.08 },
    uContrast: { value: 1.06 },
    uShadow: { value: new THREE.Vector3(0.94, 0.98, 1.08) }, // cool shadows
    uHigh: { value: new THREE.Vector3(1.06, 1.0, 0.92) }, // warm highlights
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette, uSat, uContrast; uniform vec3 uShadow, uHigh; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      float t = clamp(l / (l + 0.6), 0.0, 1.0);
      c.rgb *= mix(uShadow, uHigh, t);
      c.rgb = (c.rgb - 0.18) * uContrast + 0.18;
      vec2 d = vUv - 0.5; d.x *= 1.35;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(d));
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.setSize((w * pixelRatio) / 2, (h * pixelRatio) / 2);
  }
  render() {
    this.composer.render();
  }
  dispose() {
    this.composer.dispose();
  }
}
