import type * as THREE from "three";

/** Objects skipped when the lake renders its mirror view (dense grass and weather are invisible there anyway). */
export const reflectionHidden = new Set<THREE.Object3D>();

export function hideInReflections(o: THREE.Object3D) {
  reflectionHidden.add(o);
  return () => {
    reflectionHidden.delete(o);
  };
}
