"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { MASK, WATER_Y, buildMask, heightAt } from "@/lib/world";
import { ENV, GLSL_NOISE } from "./env";
import { useRawTextures } from "./loaders";

let maskTex: THREE.DataTexture | null = null;
/** Ground data baked once and shared by the terrain and grass shaders. */
export function getMaskTexture() {
  if (maskTex) return maskTex;
  const f = buildMask();
  const half = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) half[i] = THREE.DataUtils.toHalfFloat(f[i]);
  maskTex = new THREE.DataTexture(half, MASK.res, MASK.res, THREE.RGBAFormat, THREE.HalfFloatType);
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.minFilter = THREE.LinearFilter;
  maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
  maskTex.needsUpdate = true;
  return maskTex;
}

export const MASK_UNIFORMS = {
  uMaskMin: { value: MASK.min },
  uMaskSize: { value: MASK.size },
};

// The grid is dense near camp (~0.8 m) and stretches toward the horizon (~9 m).
const HALF = 800;
const SEG = 320;
const warp = (u: number) => HALF * (0.17 * u + 0.83 * u * u * u);

function buildGeometry() {
  const n = SEG + 1;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = warp((i / SEG) * 2 - 1);
      const z = warp((j / SEG) * 2 - 1);
      const o = (j * n + i) * 3;
      pos[o] = x;
      pos[o + 1] = heightAt(x, z);
      pos[o + 2] = z;
    }
  const idx = new Uint32Array(SEG * SEG * 6);
  let k = 0;
  for (let j = 0; j < SEG; j++)
    for (let i = 0; i < SEG; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.set([a, c, b, b, c, d], k);
      k += 6;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const VERT_HEAD = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNormal;
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNormal;
uniform sampler2D tGrass, tGrassN, tDirt, tDirtN, tRock, tRockN, tSnow, tSnowN, tMask;
uniform float uMaskMin, uMaskSize, uSnow, uWet, uWater;
${GLSL_NOISE}
float tW_dirt, tW_rock, tW_snow, tW_wet, tW_flat;
`;

const FRAG_ALBEDO = /* glsl */ `
vec3 wp = vWPos;
vec3 gn = normalize(vWNormal);
float slope = 1.0 - gn.y;
vec2 muv = (wp.xz - uMaskMin) / uMaskSize;
float inMask = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
vec4 mask = inMask > 0.5 ? texture2D(tMask, muv) : vec4(0.0, 0.5, 0.0, 0.0);
float macro = wwFbm(wp.xz * 0.012);
float micro = wwNoise(wp.xz * 0.35);
float camDist = length(wp - cameraPosition);

// Two scales of every texture hide the tiling grid.
vec2 uvA = wp.xz / 3.2;
vec2 uvB = wp.xz / 21.0;
vec3 grassC = mix(texture2D(tGrass, uvA).rgb, texture2D(tGrass, uvB).rgb, 0.4);
grassC *= mix(vec3(0.78, 0.95, 0.55), vec3(1.05, 1.0, 0.78), macro);
grassC = mix(grassC, grassC * vec3(0.75, 1.05, 0.6), smoothstep(25.0, 120.0, camDist) * 0.8);
vec3 dirtC = mix(texture2D(tDirt, uvA * 1.3).rgb, texture2D(tDirt, uvB).rgb, 0.35) * vec3(0.72, 0.66, 0.58);
// Under the pines the floor is a darker bed of needles.
dirtC = mix(dirtC, dirtC * vec3(0.62, 0.52, 0.42), mask.a * (1.0 - mask.b));
vec3 snowC = texture2D(tSnow, wp.xz / 4.0).rgb * 1.05;
vec3 tw = pow(abs(gn), vec3(4.0));
tw /= (tw.x + tw.y + tw.z);
float rs = 1.0 / 16.0;
vec3 rockC = texture2D(tRock, wp.zy * rs).rgb * tw.x + texture2D(tRock, wp.xz * rs).rgb * tw.y + texture2D(tRock, wp.xy * rs).rgb * tw.z;
rockC = mix(rockC, rockC * vec3(0.85, 0.88, 0.95), macro);

tW_flat = 1.0 - smoothstep(0.12, 0.45, slope);
tW_dirt = clamp(max(mask.b, mask.a * 0.85) + (micro - 0.5) * 0.25 * mask.a, 0.0, 1.0);
float shore = 1.0 - smoothstep(uWater + 0.25, uWater + 1.1, wp.y);
tW_dirt = max(tW_dirt, shore);
tW_rock = smoothstep(0.3, 0.52, slope + (macro - 0.5) * 0.25);
tW_rock = max(tW_rock, smoothstep(38.0, 80.0, wp.y + (macro - 0.5) * 30.0) * (1.0 - inMask));
float alpine = smoothstep(56.0, 78.0, wp.y + (macro - 0.5) * 26.0) * (1.0 - smoothstep(0.55, 0.85, slope));
tW_snow = max(alpine, uSnow * smoothstep(0.0, 0.6, tW_flat + 0.15) * (1.0 - shore * 0.7));
tW_wet = uWet * (1.0 - tW_snow);

vec3 col = mix(grassC, dirtC, tW_dirt);
col = mix(col, rockC, tW_rock);
col = mix(col, snowC, tW_snow);
col *= 1.0 - tW_wet * 0.38;
diffuseColor.rgb *= col;
`;

const FRAG_ROUGH = /* glsl */ `
float roughnessFactor = mix(0.96, 0.9, tW_rock);
roughnessFactor = mix(roughnessFactor, 0.62, tW_snow);
roughnessFactor = mix(roughnessFactor, 0.32, tW_wet * tW_flat);
`;

const FRAG_NORMAL = /* glsl */ `
{
  float k = mix(1.0, 0.35, smoothstep(30.0, 220.0, camDist));
  vec3 nG = texture2D(tGrassN, uvA).xyz * 2.0 - 1.0;
  vec3 nD = texture2D(tDirtN, uvA * 1.3).xyz * 2.0 - 1.0;
  vec3 nS = texture2D(tSnowN, wp.xz / 4.0).xyz * 2.0 - 1.0;
  vec3 tn = mix(mix(nG, nD, tW_dirt), nS, tW_snow) * k;
  vec3 groundN = normalize(vec3(tn.x + gn.x, gn.y, tn.y + gn.z));
  vec3 rx = texture2D(tRockN, wp.zy * rs).xyz * 2.0 - 1.0;
  vec3 ry = texture2D(tRockN, wp.xz * rs).xyz * 2.0 - 1.0;
  vec3 rz = texture2D(tRockN, wp.xy * rs).xyz * 2.0 - 1.0;
  vec3 rockN = normalize(
    vec3(gn.x, rx.y * k + gn.y, rx.x * k + gn.z) * tw.x +
    vec3(ry.x * k + gn.x, gn.y, ry.y * k + gn.z) * tw.y +
    vec3(rz.x * k + gn.x, rz.y * k + gn.y, gn.z) * tw.z);
  vec3 wn = normalize(mix(groundN, rockN, tW_rock));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`;

export default function Terrain() {
  const [grass, dirt, rock, snow] = useRawTextures(["forrest_ground_01", "forest_ground_04", "aerial_rocks_02", "snow_02"]);
  const geo = useMemo(buildGeometry, []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0 });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, {
        tGrass: { value: grass.map },
        tGrassN: { value: grass.normalMap },
        tDirt: { value: dirt.map },
        tDirtN: { value: dirt.normalMap },
        tRock: { value: rock.map },
        tRockN: { value: rock.normalMap },
        tSnow: { value: snow.map },
        tSnowN: { value: snow.normalMap },
        tMask: { value: getMaskTexture() },
        uWater: { value: WATER_Y },
        uSnow: ENV.uSnow,
        uWet: ENV.uWet,
        ...MASK_UNIFORMS,
      });
      s.vertexShader = VERT_HEAD + s.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);",
      );
      s.fragmentShader = FRAG_HEAD + s.fragmentShader
        .replace("#include <map_fragment>", FRAG_ALBEDO)
        .replace("#include <roughnessmap_fragment>", FRAG_ROUGH)
        .replace("#include <normal_fragment_maps>", FRAG_NORMAL);
    };
    m.customProgramCacheKey = () => "ww-terrain";
    return m;
  }, [grass, dirt, rock, snow]);

  return <mesh geometry={geo} material={mat} receiveShadow />;
}
