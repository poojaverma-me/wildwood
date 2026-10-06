import * as THREE from "three";

type Entry = { ref: { current: THREE.Object3D | null }; onHit: () => void; hit: boolean };
const targets = new Map<number, Entry>();

export function registerTarget(id: number, ref: { current: THREE.Object3D | null }, onHit: () => void) {
  targets.set(id, { ref, onHit, hit: false });
  return () => {
    targets.delete(id);
  };
}

const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

/** Fire a ray from the centre of the screen; returns true if a bottle was hit. */
export function shootTargets(camera: THREE.Camera) {
  ray.setFromCamera(center, camera);
  ray.far = 60;
  let best: { d: number; e: Entry } | null = null;
  for (const e of targets.values()) {
    if (e.hit || !e.ref.current) continue;
    const hits = ray.intersectObject(e.ref.current, true);
    if (hits.length && (!best || hits[0].distance < best.d)) best = { d: hits[0].distance, e };
  }
  if (!best) return false;
  best.e.hit = true;
  best.e.onHit();
  return true;
}

export const remainingTargets = () => [...targets.values()].filter((e) => !e.hit).length;
