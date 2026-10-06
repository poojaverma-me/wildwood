"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ENV } from "./env";
import { hideInReflections } from "./reflections";

type Mix = { rain: number; snow: number; storm: number; fog: number; cloud: number };

const RAIN = 16000;
const SNOW = 12000;

/** Everything is animated on the GPU: drops live in a box that wraps around the camera. */
const RAIN_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uAmount, uWind;
uniform vec3 uCam;
varying vec2 vUv;
varying float vFade;
void main() {
  vec3 box = vec3(56.0, 34.0, 56.0);
  float speed = 17.0 + aSeed.w * 6.0;
  vec3 wind = vec3(1.0, 0.0, 0.45) * uWind * 2.2;
  vec3 p = aSeed.xyz * box + vec3(0.0, -uTime * speed, 0.0) + wind * uTime;
  p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
  vec3 vel = normalize(vec3(wind.x, -speed, wind.z));
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(vel, toCam));
  float keep = step(aSeed.w, uAmount);
  vec3 wp = p + side * position.x * 0.014 * keep + vel * position.y * (0.55 + aSeed.w * 0.25) * keep;
  vUv = uv;
  float d = length(p - cameraPosition);
  vFade = smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(18.0, 27.0, d));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const RAIN_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vFade;
uniform float uBright;
void main() {
  float a = (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.5, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
  gl_FragColor = vec4(vec3(0.72, 0.78, 0.86) * uBright, a * 0.42 * vFade);
}
`;

const SNOW_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uAmount, uWind;
uniform vec3 uCam;
varying float vFade;
void main() {
  vec3 box = vec3(50.0, 30.0, 50.0);
  float fall = 1.1 + aSeed.w * 0.9;
  vec3 p = aSeed.xyz * box + vec3(0.0, -uTime * fall, 0.0);
  p.x += sin(uTime * (0.6 + aSeed.w) + aSeed.y * 30.0) * 0.6 + uTime * uWind * 0.8;
  p.z += cos(uTime * (0.5 + aSeed.x) + aSeed.z * 30.0) * 0.6;
  p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float keep = step(aSeed.w, uAmount);
  float d = -mv.z;
  vFade = keep * (1.0 - smoothstep(16.0, 24.0, d));
  gl_Position = projectionMatrix * mv;
  gl_PointSize = keep * (0.035 + aSeed.x * 0.04) * 900.0 / max(d, 0.5);
}
`;

const SNOW_FRAG = /* glsl */ `
varying float vFade;
uniform float uBright;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.3, 1.0, r)) * vFade;
  gl_FragColor = vec4(vec3(0.95) * uBright, a * 0.9);
}
`;

function seeded(n: number) {
  const s = new Float32Array(n * 4);
  for (let i = 0; i < s.length; i++) s[i] = Math.random();
  return s;
}

export default function Precipitation({ mix, flash }: { mix: React.MutableRefObject<Mix>; flash: React.MutableRefObject<number> }) {
  const rain = useRef<THREE.Mesh>(null!);
  const snow = useRef<THREE.Points>(null!);
  const rainGeo = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.attributes.position = base.attributes.position;
    g.attributes.uv = base.attributes.uv;
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeded(RAIN), 4));
    g.instanceCount = RAIN;
    return g;
  }, []);
  const snowGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SNOW * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeded(SNOW), 4));
    return g;
  }, []);
  const uniforms = useMemo(
    () => ({
      rain: { uTime: ENV.uTime, uWind: ENV.uWind, uCam: ENV.uCam, uAmount: { value: 0 }, uBright: { value: 1 } },
      snow: { uTime: ENV.uTime, uWind: ENV.uWind, uCam: ENV.uCam, uAmount: { value: 0 }, uBright: { value: 1 } },
    }),
    [],
  );

  useEffect(() => {
    const a = hideInReflections(rain.current);
    const b = hideInReflections(snow.current);
    return () => {
      a();
      b();
    };
  }, []);

  useFrame(() => {
    const m = mix.current;
    const bright = 0.18 + ENV.uDay.value * 0.9 + flash.current * 2;
    uniforms.rain.uAmount.value = m.rain;
    uniforms.rain.uBright.value = bright;
    uniforms.snow.uAmount.value = m.snow;
    uniforms.snow.uBright.value = Math.min(1.1, bright);
    rain.current.visible = m.rain > 0.01;
    snow.current.visible = m.snow > 0.01;
  });

  return (
    <>
      <mesh ref={rain} geometry={rainGeo} frustumCulled={false} renderOrder={20}>
        <shaderMaterial vertexShader={RAIN_VERT} fragmentShader={RAIN_FRAG} uniforms={uniforms.rain} transparent depthWrite={false} />
      </mesh>
      <points ref={snow} geometry={snowGeo} frustumCulled={false} renderOrder={20}>
        <shaderMaterial vertexShader={SNOW_VERT} fragmentShader={SNOW_FRAG} uniforms={uniforms.snow} transparent depthWrite={false} />
      </points>
    </>
  );
}
