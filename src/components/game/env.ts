import * as THREE from "three";

/**
 * Uniforms shared by every custom shader in the world. Atmosphere eases them toward the
 * current weather each frame; materials read them by reference, so nothing re-compiles.
 */
export const ENV = {
  uTime: { value: 0 },
  /** How much snow has settled (0..1). */
  uSnow: { value: 0 },
  /** How wet surfaces are (0..1). */
  uWet: { value: 0 },
  /** Wind strength (0.3 calm .. 2 storm). */
  uWind: { value: 0.5 },
  /** Daylight (0 night .. 1 noon), used by emissive bits. */
  uDay: { value: 1 },
  uCam: { value: new THREE.Vector3() },
};

/** Kept for code that predates the shared uniforms. */
export const snowRef = {
  get current() {
    return ENV.uSnow.value;
  },
  set current(v: number) {
    ENV.uSnow.value = v;
  },
};

/** Three's normal chunk without the back-face flip, for foliage lit as soft volumes. */
export const NORMAL_NO_FLIP = THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", "");

/** GLSL helpers shared by terrain, grass and foliage. */
export const GLSL_NOISE = /* glsl */ `
float wwHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wwNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wwHash(i), wwHash(i + vec2(1.0, 0.0)), u.x), mix(wwHash(i + vec2(0.0, 1.0)), wwHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float wwFbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * wwNoise(p); p *= 2.03; a *= 0.5; } return s; }
`;
