import * as THREE from "three";

/** Where the sun (or moon) is and how bright, written by Atmosphere and read by the lake and fire. */
export const sunState = {
  dir: new THREE.Vector3(0.5, 0.6, -0.4).normalize(),
  color: new THREE.Color("#fff3df"),
  strength: 1,
};
