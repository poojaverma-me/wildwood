"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { ENV, GLSL_NOISE } from "./env";

const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // Cylindrical billboard: the quad turns to face the camera around its own vertical axis.
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float sx = length(modelMatrix[0].xyz);
  float sy = length(modelMatrix[1].xyz);
  vec3 to = cameraPosition - center; to.y = 0.0; to = normalize(to);
  vec3 right = vec3(to.z, 0.0, -to.x);
  vec3 wp = center + right * position.x * sx + vec3(0.0, position.y * sy, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FLAME_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime, uSeed, uLevel;
${GLSL_NOISE}
void main() {
  float t = uTime * 1.9 + uSeed * 10.0;
  float n = wwFbm(vec2(vUv.x * 3.2 + uSeed * 7.0, vUv.y * 2.4 - t));
  float n2 = wwNoise(vec2(vUv.x * 7.0 - uSeed, vUv.y * 5.0 - t * 1.6));
  float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * vUv.y;
  float width = mix(0.8, 0.04, pow(vUv.y, 0.75));
  float body = 1.0 - smoothstep(width * 0.45, width, abs(x));
  float top = 1.0 - smoothstep(0.25, 0.95, vUv.y + (n - 0.5) * 0.7 + (n2 - 0.5) * 0.2);
  float f = clamp(body * top * smoothstep(0.0, 0.1, vUv.y), 0.0, 1.0) * uLevel;
  vec3 col = mix(vec3(0.9, 0.12, 0.01), vec3(1.0, 0.5, 0.08), smoothstep(0.05, 0.5, f));
  col = mix(col, vec3(1.0, 0.86, 0.55), smoothstep(0.55, 0.95, f));
  gl_FragColor = vec4(col * (1.2 + 4.0 * f) * f, f);
}
`;

/** A few noise-driven flame sheets. HDR output, so bloom makes them glow. */
export function Flames({ level, size = 1, sheets = 5, overlay = false }: { level: () => number; size?: number; sheets?: number; overlay?: boolean }) {
  const mats = useMemo(
    () =>
      Array.from(
        { length: sheets },
        (_, i) =>
          new THREE.ShaderMaterial({
            vertexShader: FLAME_VERT,
            fragmentShader: FLAME_FRAG,
            uniforms: { uTime: ENV.uTime, uSeed: { value: i * 1.37 + 0.2 }, uLevel: { value: 0 } },
            transparent: true,
            depthWrite: false,
            depthTest: !overlay,
            blending: THREE.AdditiveBlending,
          }),
      ),
    [sheets, overlay],
  );
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  useFrame(() => {
    const L = level();
    mats.forEach((m) => (m.uniforms.uLevel.value = L));
  });
  return (
    <group scale={size}>
      {mats.map((m, i) => {
        const a = (i / sheets) * Math.PI * 2;
        const r = i === 0 ? 0 : 0.16;
        const s = i === 0 ? 1 : 0.62 + ((i * 37) % 10) / 30;
        return <mesh key={i} geometry={geo} material={m} position={[Math.cos(a) * r, 0, Math.sin(a) * r]} scale={[0.95 * s, 1.5 * s, 1]} renderOrder={overlay ? 1001 : 10} frustumCulled={false} />;
      })}
    </group>
  );
}

const SMOKE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uWind;
varying vec2 vUv;
varying float vLife;
void main() {
  float life = fract(uTime * (0.09 + aSeed.y * 0.05) + aSeed.x);
  vLife = life;
  vUv = uv;
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 p = c + vec3((aSeed.z - 0.5) * 0.4 + life * (0.8 + uWind * 1.6), 0.6 + life * 7.0, (aSeed.w - 0.5) * 0.4 + life * 0.6 * uWind);
  float s = 0.6 + life * 3.2;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float a = aSeed.x * 6.28 + life * 1.5;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(p + (right * q.x + up * q.y) * s, 1.0);
}
`;

const SMOKE_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vLife;
uniform float uLevel, uDay;
${GLSL_NOISE}
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float n = wwFbm(vUv * 3.0 + vLife * 2.0);
  float a = (1.0 - smoothstep(0.2, 1.0, r + (n - 0.5) * 0.5)) * smoothstep(0.0, 0.12, vLife) * (1.0 - vLife);
  vec3 col = mix(vec3(0.06, 0.06, 0.07), vec3(0.55, 0.56, 0.58), uDay);
  gl_FragColor = vec4(col, a * 0.32 * uLevel);
}
`;

export function Smoke({ level, count = 22 }: { level: () => number; count?: number }) {
  const geo = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.attributes.position = base.attributes.position;
    g.attributes.uv = base.attributes.uv;
    const s = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) s.set([i / count, Math.random(), Math.random(), Math.random()], i * 4);
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(s, 4));
    g.instanceCount = count;
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SMOKE_VERT,
        fragmentShader: SMOKE_FRAG,
        uniforms: { uTime: ENV.uTime, uWind: ENV.uWind, uDay: ENV.uDay, uLevel: { value: 0 } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useFrame(() => (mat.uniforms.uLevel.value = level()));
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={11} />;
}

const EMBER_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uWind;
varying float vA;
void main() {
  float life = fract(uTime * (0.25 + aSeed.y * 0.3) + aSeed.x);
  vec3 p = vec3((aSeed.z - 0.5) * 0.8 + sin(uTime * 3.0 + aSeed.w * 20.0) * 0.15 * life + life * uWind * 0.8, 0.3 + life * (2.5 + aSeed.w * 2.5), (aSeed.w - 0.5) * 0.8);
  vA = (1.0 - life) * step(0.25, aSeed.y);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (2.5 + aSeed.z * 2.0) * (40.0 / -mv.z);
}
`;

const EMBER_FRAG = /* glsl */ `
varying float vA;
uniform float uLevel;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.1, 0.5, d)) * vA * uLevel;
  gl_FragColor = vec4(vec3(1.0, 0.45, 0.1) * 5.0 * a, a);
}
`;

export function Embers({ level, count = 70 }: { level: () => number; count?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const s = new Float32Array(count * 4);
    for (let i = 0; i < s.length; i++) s[i] = Math.random();
    g.setAttribute("aSeed", new THREE.BufferAttribute(s, 4));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: EMBER_VERT,
        fragmentShader: EMBER_FRAG,
        uniforms: { uTime: ENV.uTime, uWind: ENV.uWind, uLevel: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const ref = useRef<THREE.Points>(null!);
  useFrame(() => (mat.uniforms.uLevel.value = level()));
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}
