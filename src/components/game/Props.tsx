"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FERNS, ROCKS, SHRUBS, heightAt, type Plant } from "@/lib/world";
import { ENV, NORMAL_NO_FLIP } from "./env";
import { reflectionHidden } from "./reflections";
import { useModel } from "./loaders";

/** Adds settling snow (on up-facing surfaces) and optional foliage wind to a glTF material. */
export function weatherize(src: THREE.Material, opts: { foliage?: boolean; key: string }) {
  const std = src as THREE.MeshStandardMaterial;
  // Foliage gets cheap matte (Lambert) shading; solid props keep full PBR.
  const m: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial = opts.foliage
    ? new THREE.MeshLambertMaterial({ map: std.map, normalMap: std.normalMap, color: std.color, side: THREE.DoubleSide, alphaTest: Math.max(std.alphaTest, 0.4) })
    : std.clone();
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
    if (opts.foliage)
      s.vertexShader = s.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float fPh = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.5;
        #else
          float fPh = 0.0;
        #endif
        float fK = max(position.y, 0.0) * 0.06 * uWind;
        transformed.x += sin(uTime * 2.1 + fPh + position.z * 3.0) * fK;
        transformed.z += cos(uTime * 1.7 + fPh + position.x * 3.0) * fK;`,
      );
    s.fragmentShader = "uniform float uSnow;\nvarying float vUpN;\n" + s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.93), uSnow * smoothstep(0.35, 0.8, vUpN) * 0.92);`,
    );
    if (opts.foliage) s.fragmentShader = s.fragmentShader.replace("#include <normal_fragment_begin>", NORMAL_NO_FLIP);
  };
  m.customProgramCacheKey = () => opts.key + (opts.foliage ? "-f" : "");
  return m;
}

type Part = { geometry: THREE.BufferGeometry; material: THREE.Material };

/** Every mesh in a glTF, re-centred on its own origin, so each one can serve as a variant. */
function partsOf(scene: THREE.Object3D, key: string, foliage = false): Part[] {
  const out: Part[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry.clone();
    // Keep rotation and scale from the node, drop its layout offset.
    const m = mesh.matrixWorld.clone();
    m.setPosition(0, 0, 0);
    g.applyMatrix4(m);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    out.push({ geometry: g, material: weatherize(mesh.material as THREE.Material, { foliage, key }) });
  });
  return out;
}

type Placement = { x: number; z: number; s: number; rot: number; v: number; sink?: number; tilt?: number };

/**
 * Instanced placement of glTF parts. With `radius`, only instances near the player are drawn,
 * which keeps dense undergrowth cheap.
 */
function Scatter({ parts, items, radius, cast = true }: { parts: Part[]; items: Placement[]; radius?: number; cast?: boolean }) {
  const { camera } = useThree();
  const refs = useRef<THREE.InstancedMesh[]>([]);
  const byVariant = useMemo(() => parts.map((_, vi) => items.filter((it) => it.v % parts.length === vi)), [parts, items]);
  const matrices = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    return byVariant.map((list) =>
      list.map((it) => {
        e.set(it.tilt ?? 0, it.rot, (it.tilt ?? 0) * 0.6);
        q.setFromEuler(e);
        return m.compose(new THREE.Vector3(it.x, heightAt(it.x, it.z) - (it.sink ?? 0) * it.s, it.z), q, new THREE.Vector3(it.s, it.s, it.s)).clone();
      }),
    );
  }, [byVariant]);
  const last = useRef(new THREE.Vector3(1e9, 0, 0));

  const fill = () => {
    const cam = camera.position;
    byVariant.forEach((list, vi) => {
      const mesh = refs.current[vi];
      if (!mesh) return;
      let n = 0;
      list.forEach((it, i) => {
        if (radius && Math.hypot(it.x - cam.x, it.z - cam.z) > radius) return;
        mesh.setMatrixAt(n++, matrices[vi][i]);
      });
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  };

  useLayoutEffect(fill);
  useFrame(() => {
    if (!radius || camera.position.distanceTo(last.current) < 3) return;
    last.current.copy(camera.position);
    fill();
  });

  return (
    <>
      {parts.map((p, i) => (
        <instancedMesh
          key={i}
          ref={(r) => {
            if (!r) return;
            refs.current[i] = r;
            reflectionHidden.add(r);
          }}
          args={[p.geometry, p.material, Math.max(1, byVariant[i].length)]}
          castShadow={cast}
          receiveShadow
        />
      ))}
    </>
  );
}

export function Rocks() {
  const moss = useModel("rock_moss_set_02");
  const parts = useMemo(() => partsOf(moss.scene, "ww-rock"), [moss]);
  const items = useMemo(() => ROCKS.map((r) => ({ ...r, s: r.s * 0.85, sink: 0.12, tilt: (r.rot % 1) * 0.25 })), []);
  return <Scatter parts={parts} items={items} />;
}

export function Undergrowth() {
  const fern = useModel("fern_02");
  const shrub = useModel("shrub_02");
  const fernParts = useMemo(() => partsOf(fern.scene, "ww-fern", true), [fern]);
  const shrubParts = useMemo(() => partsOf(shrub.scene, "ww-shrub", true), [shrub]);
  const ferns = useMemo(() => FERNS.map((f: Plant) => ({ ...f, s: f.s * 2.4 })), []);
  return (
    <>
      <Scatter parts={fernParts} items={ferns} radius={45} cast={false} />
      <Scatter parts={shrubParts} items={SHRUBS} radius={65} cast={false} />
    </>
  );
}
