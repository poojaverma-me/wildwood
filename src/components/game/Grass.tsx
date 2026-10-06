"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { POWER, usePower } from "@/lib/power";
import { ENV, GLSL_NOISE, NORMAL_NO_FLIP } from "./env";
import { hideInReflections } from "./reflections";
import { MASK_UNIFORMS, getMaskTexture } from "./Terrain";

/**
 * GPU grass: a fixed set of blades that wraps around the player, so the meadow looks
 * endless without storing a blade for every square metre. Height and density come from
 * the baked ground mask, so trails, the fire ring and the lake shore stay bare.
 */
/** A dense layer at your feet and a sparser, wider-bladed one that carries the meadow to ~65 m. */
const LAYERS = [
  { count: 120_000, patch: 40, inner: 0, width: 0.034, ahead: 13 },
  { count: 70_000, patch: 120, inner: 19, width: 0.06, ahead: 40 },
];

function bladeGeometry(COUNT: number) {
  // Four tapered segments and a tip: 9 vertices, 7 triangles.
  const rows = [0, 0.3, 0.55, 0.8];
  const pos: number[] = [];
  for (const y of rows) {
    const w = 0.5 * (1 - Math.pow(y, 1.4) * 0.85);
    pos.push(-w, y, 0, w, y, 0);
  }
  pos.push(0, 1, 0);
  const idx: number[] = [];
  for (let r = 0; r < rows.length - 1; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  idx.push(6, 7, 8);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const seeds = new Float32Array(COUNT * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = COUNT;
  return g;
}

const VERT_HEAD = /* glsl */ `
attribute vec4 aSeed;
uniform sampler2D tMask;
uniform float uMaskMin, uMaskSize, uPatch, uInner, uBladeW, uTime, uSnow, uWind;
uniform vec3 uCam;
uniform vec2 uCenter;
varying vec4 vGrass;
${GLSL_NOISE}
`;

const VERT_NORMAL = /* glsl */ `
// The patch is centred ahead of the camera, so few blades are spent behind the player.
vec2 gW = uCenter + mod(aSeed.xy * uPatch - uCenter + 0.5 * uPatch, uPatch) - 0.5 * uPatch;
vec2 gRel = gW - uCam.xz;
vec4 gM = texture2D(tMask, (gW - uMaskMin) / uMaskSize);
float gDist = length(gRel);
float gFade = (1.0 - smoothstep(uPatch * 0.3, uPatch * 0.49, gDist)) * (uInner > 0.0 ? smoothstep(uInner * 0.62, uInner, gDist) : 1.0);
float gKeep = step(aSeed.z, gM.g * 1.4 + 0.08) * gFade;
float gAng = aSeed.w * 6.2831;
vec2 gDir = vec2(cos(gAng), sin(gAng));
float gTall = fract(aSeed.z * 7.13);
float gH = (0.2 + gTall * gTall * 0.45) * (0.55 + 0.45 * gM.g) * gKeep * (1.0 - uSnow * 0.65);
float gGust = wwNoise(gW * 0.06 + uTime * vec2(0.45, 0.25));
float gWind = (gGust - 0.35) * uWind + sin(uTime * 2.6 + gW.x * 0.7 + gW.y * 0.4) * 0.06 * uWind;
vec3 objectNormal = normalize(vec3(gDir.x * 0.35, 1.0, gDir.y * 0.35));
`;

const VERT_POS = /* glsl */ `
float gy = position.y;
vec3 gSide = vec3(-gDir.y, 0.0, gDir.x);
float gWidth = uBladeW * (1.0 + gDist * 0.03) * gKeep;
float gLean = 0.12 + fract(aSeed.w * 13.7) * 0.32;
vec3 transformed = vec3(gW.x, gM.r - 0.02, gW.y) + gSide * position.x * gWidth;
transformed += vec3(gDir.x * gLean + 0.9 * gWind, 0.0, gDir.y * gLean + 0.55 * gWind) * gy * gy * gH;
transformed.y += gy * gH * (1.0 - 0.3 * gLean);
vGrass = vec4(gy, fract(aSeed.z * 31.7), gM.g, gDist);
`;

const FRAG_HEAD = /* glsl */ `
varying vec4 vGrass;
uniform float uSnow, uWet;
`;

const FRAG_COLOR = /* glsl */ `
vec3 gBase = vec3(0.035, 0.06, 0.015);
vec3 gTipA = vec3(0.13, 0.22, 0.045);
vec3 gTipB = vec3(0.26, 0.29, 0.09);
vec3 gTip = mix(gTipA, gTipB, smoothstep(0.55, 1.0, vGrass.y));
gTip = mix(gTip, vec3(0.78, 0.82, 0.86), uSnow * 0.85);
diffuseColor.rgb = mix(gBase, gTip, smoothstep(0.0, 0.95, vGrass.x)) * (1.0 - uWet * 0.25);
`;

export default function Grass() {
  const k = POWER[usePower((s) => s.mode)].grass;
  return (
    <>
      {LAYERS.map((l, i) => (
        <GrassLayer key={`${i}-${k}`} {...l} count={Math.round(l.count * k)} />
      ))}
    </>
  );
}

function GrassLayer({ count, patch, inner, width, ahead }: { count: number; patch: number; inner: number; width: number; ahead: number }) {
  const { camera } = useThree();
  const mesh = useRef<THREE.Mesh>(null!);
  const geo = useMemo(() => bladeGeometry(count), [count]);
  const uniforms = useMemo(() => ({ uPatch: { value: patch }, uInner: { value: inner }, uBladeW: { value: width }, uCenter: { value: new THREE.Vector2() } }), [patch, inner, width]);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const mat = useMemo(() => {
    // Lambert: grass is matte, and the cheaper lighting matters across ~2M blade triangles.
    const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { tMask: { value: getMaskTexture() }, uTime: ENV.uTime, uSnow: ENV.uSnow, uWet: ENV.uWet, uWind: ENV.uWind, uCam: ENV.uCam, ...MASK_UNIFORMS, ...uniforms });
      s.vertexShader = VERT_HEAD + s.vertexShader.replace("#include <beginnormal_vertex>", VERT_NORMAL).replace("#include <begin_vertex>", VERT_POS);
      s.fragmentShader = FRAG_HEAD + s.fragmentShader.replace("#include <color_fragment>", FRAG_COLOR).replace("#include <normal_fragment_begin>", NORMAL_NO_FLIP);
    };
    m.customProgramCacheKey = () => "ww-grass";
    return m;
  }, [uniforms]);

  useEffect(() => hideInReflections(mesh.current), []);
  useFrame(() => {
    ENV.uCam.value.copy(camera.position);
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    uniforms.uCenter.value.set(camera.position.x + fwd.x * ahead, camera.position.z + fwd.z * ahead);
  });

  return <mesh ref={mesh} geometry={geo} material={mat} frustumCulled={false} receiveShadow />;
}
