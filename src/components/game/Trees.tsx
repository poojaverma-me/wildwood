"use client";

import { Tree as EzTree } from "@dgreenheck/ez-tree";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FAR_TREES, TREES, heightAt, type Tree } from "@/lib/world";
import { ENV, NORMAL_NO_FLIP } from "./env";

/**
 * Pines are grown procedurally with ez-tree (MIT, by Daniel Greenheck): real bark and needle
 * textures on generated branch geometry. Trees near the player are full meshes with shadows;
 * distant ones become camera-facing impostors baked from the same trees at startup.
 */
const PRESETS: [string, number][] = [
  ["Pine Medium", 13977],
  ["Pine Large", 4521],
  ["Pine Medium", 821],
];
const NEAR = 45;
/** World height of a tree with s = 1. */
const BASE_HEIGHT = 15;

type Variant = {
  bark: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  barkMat: THREE.MeshStandardMaterial;
  leafMat: THREE.MeshLambertMaterial;
  height: number;
  width: number;
};

const SNOW_HEAD = /* glsl */ `
uniform float uSnow;
varying float vUpN;
`;

function withSnow<M extends THREE.MeshStandardMaterial | THREE.MeshLambertMaterial>(m: M, key: string, extra?: (s: THREE.WebGLProgramParametersWithUniforms) => void) {
  m.onBeforeCompile = (s) => {
    s.uniforms.uSnow = ENV.uSnow;
    s.uniforms.uTime = ENV.uTime;
    s.uniforms.uWind = ENV.uWind;
    s.vertexShader = "uniform float uTime, uWind;\nvarying float vUpN;\n" + s.vertexShader.replace(
      "#include <defaultnormal_vertex>",
      `#include <defaultnormal_vertex>
      #ifdef USE_INSTANCING
        vUpN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;
      #else
        vUpN = normalize(mat3(modelMatrix) * objectNormal).y;
      #endif`,
    );
    s.fragmentShader = SNOW_HEAD + s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.93), uSnow * smoothstep(0.15, 0.65, vUpN) * 0.9);`,
    );
    extra?.(s);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

function grow(preset: string, seed: number): Variant {
  const t = new EzTree();
  t.loadPreset(preset);
  t.options.seed = seed;
  // Fewer rings and sides on the side branches: about half the triangles, same silhouette.
  t.options.branch.sections[1] = 6;
  t.options.branch.segments[1] = 4;
  t.options.branch.segments[0] = 7;
  // Fewer, larger needle cards: crowns look as full but stack far fewer layers per pixel.
  t.options.leaves.count = Math.round(t.options.leaves.count * 0.55);
  t.options.leaves.size *= 1.3;
  t.generate();
  const bark = t.branchesMesh.geometry;
  const leaves = t.leavesMesh.geometry;
  bark.computeBoundingBox();
  leaves.computeBoundingBox();
  const box = bark.boundingBox!.clone().union(leaves.boundingBox!);
  const height = box.max.y - Math.max(0, box.min.y);
  const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);

  // Foliage normals point out from the trunk and up, so each crown shades like a soft volume.
  const p = leaves.attributes.position as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    v.set(x, Math.hypot(x, z) * 0.55 + height * 0.06, z).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  leaves.setAttribute("normal", new THREE.BufferAttribute(n, 3));

  const src = t.branchesMesh.material as THREE.MeshPhongMaterial;
  const barkMat = withSnow(
    new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughnessMap: (src as unknown as THREE.MeshStandardMaterial).roughnessMap, aoMap: src.aoMap, roughness: 1, color: "#d9d2c8" }),
    "ww-bark",
  );
  const leafSrc = t.leavesMesh.material as THREE.MeshPhongMaterial;
  const leafMat = withSnow(
    new THREE.MeshLambertMaterial({ map: leafSrc.map, alphaTest: 0.42, side: THREE.DoubleSide, color: "#ffffff" }),
    "ww-leaves",
    (s) => {
      s.uniforms.uTreeH = { value: height };
      s.vertexShader = "uniform float uTreeH;\n" + s.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float tPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          float tPh = 0.0;
        #endif
        float tK = (position.y / uTreeH) * uv.y * uTreeH * 0.012 * uWind;
        transformed.x += (sin(uTime * 1.1 + tPh) * 0.6 + sin(uTime * 2.7 + tPh * 1.7 + position.y * 0.2) * 0.4) * tK;
        transformed.z += (cos(uTime * 0.9 + tPh * 1.3) * 0.6 + sin(uTime * 3.1 + position.x * 0.3) * 0.3) * tK;`,
      );
      s.fragmentShader = s.fragmentShader.replace("#include <normal_fragment_begin>", NORMAL_NO_FLIP);
    },
  );
  return { bark, leaves, barkMat, leafMat, height, width };
}

/** Renders each variant side-by-side into one texture with flat albedo, for the impostors. */
function bakeImpostors(gl: THREE.WebGLRenderer, variants: Variant[]) {
  const colW = Math.max(...variants.map((v) => v.width / v.height)) * 1.04;
  const scene = new THREE.Scene();
  variants.forEach((v, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(v.bark, new THREE.MeshBasicMaterial({ map: v.barkMat.map, color: "#8a7f74" })));
    g.add(new THREE.Mesh(v.leaves, new THREE.MeshBasicMaterial({ map: v.leafMat.map, alphaTest: 0.42, side: THREE.DoubleSide, color: "#b9c7a6" })));
    g.scale.setScalar(1 / v.height);
    g.position.set(colW * (i + 0.5), 0, 0);
    scene.add(g);
  });
  const W = 3 * 512;
  const rt = new THREE.WebGLRenderTarget(W, Math.round((W / (3 * colW)) * 1), {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const cam = new THREE.OrthographicCamera(0, colW * 3, 1, 0, -50, 50);
  cam.position.set(0, 0, 10);
  const prev = gl.getRenderTarget();
  const prevColor = gl.getClearColor(new THREE.Color());
  const prevAlpha = gl.getClearAlpha();
  gl.setRenderTarget(rt);
  gl.setClearColor("#1d2614", 0);
  gl.clear();
  gl.render(scene, cam);
  gl.setRenderTarget(prev);
  gl.setClearColor(prevColor, prevAlpha);
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) ((o as THREE.Mesh).material as THREE.Material).dispose();
  });
  return { texture: rt.texture, colW };
}

function impostorMaterial(map: THREE.Texture, cols: number) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.38, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uSnow = ENV.uSnow;
    s.vertexShader = "attribute float aVariant;\n" + s.vertexShader
      .replace(
        "#include <beginnormal_vertex>",
        `vec3 iPos = instanceMatrix[3].xyz;
        vec3 iTo = cameraPosition - iPos; iTo.y = 0.0; iTo = normalize(iTo);
        vec3 objectNormal = normalize(iTo * 0.75 + vec3(0.0, 0.65, 0.0));`,
      )
      .replace("#include <defaultnormal_vertex>", "vec3 transformedNormal = normalMatrix * objectNormal;")
      .replace(
        "#include <project_vertex>",
        `float iW = length(instanceMatrix[0].xyz);
        float iH = length(instanceMatrix[1].xyz);
        vec3 iRight = vec3(iTo.z, 0.0, -iTo.x);
        vec3 iWorld = iPos + iRight * position.x * iW + vec3(0.0, position.y * iH, 0.0);
        vec4 mvPosition = viewMatrix * vec4(iWorld, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #ifdef USE_MAP
          vMapUv.x = (vMapUv.x + aVariant) / ${cols.toFixed(1)};
        #endif`,
      );
    s.fragmentShader = "uniform float uSnow;\n" + s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.85, 0.9), uSnow * 0.55);`,
    );
  };
  m.customProgramCacheKey = () => "ww-impostor";
  return m;
}

function tint(t: Tree, c: THREE.Color) {
  return c.setHSL(0.24 + t.tint * 0.06, 0.32 + t.tint * 0.18, 0.4 + t.tint * 0.12);
}

export default function Trees() {
  const { gl, camera } = useThree();
  const variants = useMemo(() => PRESETS.map(([p, s]) => grow(p, s)), []);
  const impostor = useMemo(() => bakeImpostors(gl, variants), [gl, variants]);
  const all = useMemo(() => [...FAR_TREES, ...TREES], []);
  const impGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    g.setAttribute("aVariant", new THREE.InstancedBufferAttribute(new Float32Array(all.length), 1));
    return g;
  }, [all]);
  const impMat = useMemo(() => impostorMaterial(impostor.texture, variants.length), [impostor, variants]);

  const barkRefs = useRef<THREE.InstancedMesh[]>([]);
  const leafRefs = useRef<THREE.InstancedMesh[]>([]);
  const imp = useRef<THREE.InstancedMesh>(null!);
  const lastUpdate = useRef(-1);
  const lastPos = useRef(new THREE.Vector3(1e9, 0, 0));

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color(), up: new THREE.Vector3(0, 1, 0) }), []);

  // Instance transforms never change; only which bucket a tree lives in does.
  const placed = useMemo(
    () =>
      all.map((t) => {
        const v = variants[t.v];
        const k = (BASE_HEIGHT * t.s) / v.height;
        return { t, y: heightAt(t.x, t.z) - 0.3, k, h: BASE_HEIGHT * t.s, w: (BASE_HEIGHT * t.s * impostor.colW) };
      }),
    [all, variants, impostor],
  );

  // New meshes (first mount or hot reload) start empty and are re-bucketed on the next frame.
  useLayoutEffect(() => {
    lastUpdate.current = -1;
  }, [variants, impostor, impGeo]);

  useLayoutEffect(() => {
    const variantAttr = impGeo.attributes.aVariant as THREE.InstancedBufferAttribute;
    placed.forEach((p, i) => (variantAttr.array[i] = p.t.v));
    variantAttr.needsUpdate = true;
  }, [placed, impGeo]);

  const rebucket = () => {
    const { m, q, s, p, c, up } = tmp;
    const cam = camera.position;
    const counts = variants.map(() => 0);
    let ic = 0;
    const variantAttr = impGeo.attributes.aVariant as THREE.InstancedBufferAttribute;
    for (let i = 0; i < placed.length; i++) {
      const P = placed[i];
      const d = Math.hypot(P.t.x - cam.x, P.t.z - cam.z);
      tint(P.t, c);
      if (i >= FAR_TREES.length && d < NEAR) {
        const vi = P.t.v;
        q.setFromAxisAngle(up, P.t.rot);
        m.compose(p.set(P.t.x, P.y, P.t.z), q, s.setScalar(P.k));
        barkRefs.current[vi].setMatrixAt(counts[vi], m);
        leafRefs.current[vi].setMatrixAt(counts[vi], m);
        leafRefs.current[vi].setColorAt(counts[vi], c);
        counts[vi]++;
      } else {
        m.makeScale(P.w, P.h, 1).setPosition(P.t.x, P.y, P.t.z);
        imp.current.setMatrixAt(ic, m);
        imp.current.setColorAt(ic, c);
        variantAttr.array[ic] = P.t.v;
        ic++;
      }
    }
    variants.forEach((_, vi) => {
      for (const mesh of [barkRefs.current[vi], leafRefs.current[vi]]) {
        mesh.count = counts[vi];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    });
    imp.current.count = ic;
    imp.current.instanceMatrix.needsUpdate = true;
    if (imp.current.instanceColor) imp.current.instanceColor.needsUpdate = true;
    variantAttr.needsUpdate = true;
    imp.current.computeBoundingSphere();
  };

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t - lastUpdate.current < 0.3 && lastUpdate.current >= 0) return;
    if (camera.position.distanceTo(lastPos.current) < 4 && lastUpdate.current >= 0) return;
    lastUpdate.current = t;
    lastPos.current.copy(camera.position);
    rebucket();
  });

  return (
    <group>
      {variants.map((v, i) => (
        <group key={i}>
          <instancedMesh
            ref={(r) => {
              if (!r) return;
              if (barkRefs.current[i] !== r) r.count = 0;
              barkRefs.current[i] = r;
            }}
            args={[v.bark, v.barkMat, TREES.length]}
            castShadow
            receiveShadow
            frustumCulled={false}
          />
          <instancedMesh
            ref={(r) => {
              if (!r) return;
              if (leafRefs.current[i] !== r) r.count = 0;
              leafRefs.current[i] = r;
            }}
            args={[v.leaves, v.leafMat, TREES.length]}
            castShadow
            receiveShadow
            frustumCulled={false}
          />
        </group>
      ))}
      <instancedMesh ref={imp} args={[impGeo, impMat, all.length]} frustumCulled={false} />
    </group>
  );
}
