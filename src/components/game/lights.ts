import type * as THREE from "three";

/**
 * Local lights (campfire, cabin lamp, torch/muzzle flash, flashlight) cost every lit pixel a
 * little even at zero intensity, so they only exist while lit. Turning a light on changes the
 * shader variant three.js needs; `warmLightVariants` compiles those variants up front so that
 * switching never stutters.
 */
const managed = new Set<THREE.Light>();
/** Hidden objects (held items) that should be compiled during warm-up too. */
const hidden = new Set<THREE.Object3D>();
export function warmAlso(o: THREE.Object3D) {
  hidden.add(o);
  return () => {
    hidden.delete(o);
  };
}
let warming = false;

export function manageLight(l: THREE.Light) {
  managed.add(l);
  return () => {
    managed.delete(l);
  };
}

/** Called once per frame: a light is visible only while it has intensity. */
export function syncLightVisibility() {
  if (warming) return;
  managed.forEach((l) => (l.visible = l.intensity > 0.001));
}

export async function warmLightVariants(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  if (warming) return;
  const points = [...managed].filter((l) => (l as THREE.PointLight).isPointLight);
  const spots = [...managed].filter((l) => (l as THREE.SpotLight).isSpotLight);
  warming = true;
  const wasVisible = [...hidden].map((o) => o.visible);
  hidden.forEach((o) => (o.visible = true));
  try {
    // The hand light (torch) and the beam (flashlight) are never lit together.
    for (let s = 0; s <= spots.length; s++)
      for (let p = 0; p <= points.length - s; p++) {
        points.forEach((l, i) => (l.visible = i < p));
        spots.forEach((l, i) => (l.visible = i < s));
        await gl.compileAsync(scene, camera);
      }
  } finally {
    [...hidden].forEach((o, i) => (o.visible = wasVisible[i]));
    warming = false;
    syncLightVisibility();
  }
}
