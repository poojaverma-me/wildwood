"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { POWER, usePower } from "@/lib/power";
import { LAKE, WATER_Y } from "@/lib/world";
import { ENV } from "./env";
import { reflectionHidden } from "./reflections";
import { sunState } from "./sun";

const NORMALS = "https://threejs.org/examples/textures/waternormals.jpg";

/** A mirror-like mountain lake: real planar reflections, wind ripples and sun glints. */
export default function Lake() {
  const normals = useLoader(THREE.TextureLoader, NORMALS);
  const water = useMemo(() => {
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    const w = new Water(new THREE.CircleGeometry(LAKE.r + 10, 96), {
      textureWidth: 384,
      textureHeight: 384,
      waterNormals: normals,
      sunDirection: new THREE.Vector3(0.5, 0.6, -0.4).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x0c2528,
      distortionScale: 1.4,
      fog: true,
    });
    w.rotation.x = -Math.PI / 2;
    w.position.set(LAKE.x, WATER_Y, LAKE.z);
    (w.material as THREE.ShaderMaterial).uniforms.size.value = 2.6;
    // Skip dense grass and rain in the mirror pass; they cost a lot and barely show.
    // The mirror is a second full render of the valley, so it refreshes only every Nth frame
    // (per power mode); between refreshes the lake reuses the last reflection.
    const render = w.onBeforeRender;
    let frame = 0;
    w.onBeforeRender = (...args) => {
      if (frame++ % POWER[usePower.getState().mode].mirrorEvery !== 0) return;
      const hidden: THREE.Object3D[] = [];
      reflectionHidden.forEach((o) => {
        if (o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      });
      render.apply(w, args);
      hidden.forEach((o) => (o.visible = true));
    };
    return w;
  }, [normals]);

  useFrame((_, dt) => {
    const u = (water.material as THREE.ShaderMaterial).uniforms;
    u.time.value += dt * (0.35 + ENV.uWind.value * 0.35);
    u.sunDirection.value.copy(sunState.dir);
    u.sunColor.value.copy(sunState.color).multiplyScalar(sunState.strength);
    u.distortionScale.value = 1.2 + ENV.uWet.value * 2.5 + ENV.uWind.value * 0.6;
    u.waterColor.value.setRGB(0.03 + 0.04 * ENV.uDay.value, 0.09 + 0.08 * ENV.uDay.value, 0.1 + 0.07 * ENV.uDay.value);
  });

  return <primitive object={water} />;
}
