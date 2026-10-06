"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CABIN, heightAt } from "@/lib/world";
import { ENV } from "./env";
import { manageLight } from "./lights";
import { usePBR, useModel } from "./loaders";
import { weatherize } from "./Props";

const W = CABIN.w;
const D = CABIN.d;
const R = 0.17;
const STEP = 0.32;
const ROWS = 11;
const BASE = 0.55;
const TOP = BASE + ROWS * STEP;
const OVER = 0.45;
const RISE = 2.4;
const EAVE = 0.75;
const DOOR = { x0: -2.25, x1: -0.95, top: 2.3 };
const WIN = { x0: 0.9, x1: 2.7, y0: 1.2, y1: 2.3 };

type Log = { axis: "x" | "z"; len: number; pos: [number, number, number] };

/** Interlocking logs; the front wall is cut around the door and window. */
function layoutLogs(): Log[] {
  const logs: Log[] = [];
  for (let i = 0; i < ROWS; i++) {
    const y = BASE + R + i * STEP;
    for (const side of [-1, 1]) logs.push({ axis: "z", len: D + OVER * 2, pos: [(side * W) / 2, y + STEP / 2, 0] });
    logs.push({ axis: "x", len: W + OVER * 2, pos: [0, y, -D / 2] });
    // Front wall segments between the openings.
    let spans: [number, number][] = [[-W / 2 - OVER, W / 2 + OVER]];
    const cut = (a: number, b: number) => {
      spans = spans.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : ([[s, a], [b, e]] as [number, number][]).filter(([p, q]) => q - p > 0.2)));
    };
    if (y - R < DOOR.top) cut(DOOR.x0, DOOR.x1);
    if (y + R > WIN.y0 && y - R < WIN.y1) cut(WIN.x0, WIN.x1);
    for (const [s, e] of spans) logs.push({ axis: "x", len: e - s, pos: [(s + e) / 2, y, D / 2] });
  }
  return logs;
}

function logGeometry(len: number) {
  const g = new THREE.CylinderGeometry(R, R * 1.04, len, 18, 1);
  // Bark repeats every ~1.4 m along the log instead of stretching.
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 1.4));
  return g;
}

/** The triangles of the given material groups, as a standalone geometry. */
function subset(g: THREE.BufferGeometry, groups: number[]) {
  const src = g.index!.array;
  const idx: number[] = [];
  for (const gr of g.groups) if (groups.includes(gr.materialIndex ?? 0)) for (let i = gr.start; i < gr.start + gr.count; i++) idx.push(src[i]);
  const out = g.clone();
  out.setIndex(idx);
  out.clearGroups();
  return out;
}

export default function Cabin() {
  const bark = usePBR("pine_bark", [1, 1]);
  const roof = usePBR("roof_slates_02", [(W + 1.6) / 2.2, 2.4]);
  const stone = usePBR("stacked_stone_wall", [3, 0.6]);
  const chimneyStone = usePBR("stacked_stone_wall", [0.6, 3]);
  const planks = usePBR("weathered_planks", [1, 1]);
  const gablePlanks = usePBR("weathered_planks", [0.45, 0.45]);
  const lantern = useModel("Lantern_01");
  const windowMat = useRef<THREE.MeshStandardMaterial>(null!);
  const lamp = useRef<THREE.PointLight>(null!);

  const logs = useMemo(layoutLogs, []);
  const mats = useMemo(() => {
    const barkMat = weatherize(new THREE.MeshStandardMaterial({ ...bark, color: "#bfa98f", roughness: 1 }), { key: "ww-cabin" });
    const endGrain = new THREE.MeshStandardMaterial({ color: "#a07a52", roughness: 0.95 });
    return {
      log: [barkMat, endGrain, endGrain],
      roof: weatherize(new THREE.MeshStandardMaterial({ ...roof, color: "#8e8478", roughness: 1 }), { key: "ww-cabin" }),
      stone: weatherize(new THREE.MeshStandardMaterial({ ...stone, roughness: 1 }), { key: "ww-cabin" }),
      chimney: weatherize(new THREE.MeshStandardMaterial({ ...chimneyStone, roughness: 1 }), { key: "ww-cabin" }),
      planks: new THREE.MeshStandardMaterial({ ...planks, color: "#a89786", roughness: 1 }),
      gable: new THREE.MeshStandardMaterial({ ...gablePlanks, color: "#a89786", roughness: 1, side: THREE.DoubleSide }),
    };
  }, [bark, roof, stone, chimneyStone, planks, gablePlanks]);
  // Every log baked into two meshes (bark sides, end grain): 2 draw calls instead of ~200.
  const logGeo = useMemo(() => {
    const sides: THREE.BufferGeometry[] = [];
    const caps: THREE.BufferGeometry[] = [];
    for (const l of logs) {
      const g = logGeometry(l.len);
      if (l.axis === "z") g.rotateX(Math.PI / 2);
      else g.rotateZ(Math.PI / 2);
      g.translate(...l.pos);
      sides.push(subset(g, [0]));
      caps.push(subset(g, [1, 2]));
    }
    return { sides: mergeGeometries(sides), caps: mergeGeometries(caps) };
  }, [logs]);
  const gable = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-D / 2 - 0.1, 0);
    s.lineTo(D / 2 + 0.1, 0);
    s.lineTo(0, RISE);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  const lanternObj = useMemo(() => {
    const o = lantern.scene.clone(true);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    return o;
  }, [lantern]);

  useEffect(() => manageLight(lamp.current), []);
  useFrame(() => {
    const dark = 1 - ENV.uDay.value;
    windowMat.current.emissiveIntensity = 0.05 + dark * 2.6;
    lamp.current.intensity = dark > 0.15 ? dark * 7 : 0;
  });

  const y = Math.min(...[-1, 1].flatMap((a) => [-1, 1].map((b) => heightAt(CABIN.x + (a * W) / 2, CABIN.z + (b * D) / 2)))) + 0.05;
  const slabLen = Math.hypot(D / 2 + EAVE, RISE + 0.35);
  const pitch = Math.atan2(RISE + 0.35, D / 2 + EAVE);
  const ridgeY = TOP + RISE;

  return (
    <group position={[CABIN.x, y, CABIN.z]} rotation={[0, CABIN.rot, 0]}>
      {/* Stone footing hides the slope under the floor. */}
      <mesh material={mats.stone} position={[0, -0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[W + 0.35, 1.6, D + 0.35]} />
      </mesh>
      <mesh geometry={logGeo.sides} material={mats.log[0]} castShadow receiveShadow />
      <mesh geometry={logGeo.caps} material={mats.log[1]} castShadow receiveShadow />
      {/* Dark interior seen through the window. */}
      <mesh position={[0, TOP / 2 + 0.3, 0]}>
        <boxGeometry args={[W - 0.4, TOP - 0.2, D - 0.4]} />
        <meshStandardMaterial color="#1b130d" side={THREE.BackSide} roughness={1} />
      </mesh>
      {/* Gables */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={gable} material={mats.gable} position={[(s * W) / 2, TOP + STEP / 2, 0]} rotation={[0, (s * Math.PI) / 2, 0]} castShadow receiveShadow />
      ))}
      {/* Roof */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={mats.roof} position={[0, TOP + STEP / 2 - 0.35 + (RISE + 0.35) / 2 + 0.08, (s * (D / 2 + EAVE)) / 2]} rotation={[s * pitch, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[W + 1.6, 0.14, slabLen]} />
        </mesh>
      ))}
      <mesh position={[0, ridgeY + STEP / 2 + 0.12, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, W + 1.7, 10]} />
        <meshStandardMaterial color="#3b3029" roughness={0.9} />
      </mesh>
      {/* Chimney on the back slope */}
      <mesh material={mats.chimney} position={[2.6, (ridgeY + 1.1) / 2, -1.5]} castShadow receiveShadow>
        <boxGeometry args={[1.0, ridgeY + 1.1, 1.0]} />
      </mesh>
      {/* Door */}
      <mesh material={mats.planks} position={[(DOOR.x0 + DOOR.x1) / 2, BASE + (DOOR.top - BASE) / 2, D / 2 - 0.02]} castShadow>
        <boxGeometry args={[DOOR.x1 - DOOR.x0, DOOR.top - BASE, 0.08]} />
      </mesh>
      <mesh position={[DOOR.x1 - 0.2, BASE + 0.95, D / 2 + 0.05]}>
        <sphereGeometry args={[0.04, 10, 8]} />
        <meshStandardMaterial color="#2b2522" metalness={0.9} roughness={0.35} />
      </mesh>
      {/* Window: frame, mullions, and glass that glows when the lamp is lit inside. */}
      <mesh position={[(WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, D / 2 - 0.05]}>
        <planeGeometry args={[WIN.x1 - WIN.x0, WIN.y1 - WIN.y0]} />
        <meshStandardMaterial ref={windowMat} color="#0d1114" emissive="#ffae55" emissiveIntensity={0.05} roughness={0.08} metalness={0.4} />
      </mesh>
      {[
        [(WIN.x0 + WIN.x1) / 2, WIN.y1 + 0.05, WIN.x1 - WIN.x0 + 0.2, 0.1],
        [(WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.05, WIN.x1 - WIN.x0 + 0.2, 0.1],
        [(WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, 0.05, WIN.y1 - WIN.y0],
        [(WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, WIN.x1 - WIN.x0, 0.05],
        [WIN.x0 - 0.05, (WIN.y0 + WIN.y1) / 2, 0.1, WIN.y1 - WIN.y0 + 0.2],
        [WIN.x1 + 0.05, (WIN.y0 + WIN.y1) / 2, 0.1, WIN.y1 - WIN.y0 + 0.2],
      ].map(([x, yy, w, h], i) => (
        <mesh key={i} material={mats.planks} position={[x, yy, D / 2 + 0.02]} castShadow>
          <boxGeometry args={[w, h, 0.09]} />
        </mesh>
      ))}
      <pointLight ref={lamp} position={[0, 2.2, D / 2 + 1.4]} color="#ffad5c" distance={16} decay={1.7} intensity={0} />
      {/* Porch deck and steps */}
      <mesh material={mats.planks} position={[0, BASE - 0.08, D / 2 + 1.0]} castShadow receiveShadow>
        <boxGeometry args={[W + 0.4, 0.12, 1.8]} />
      </mesh>
      <mesh material={mats.planks} position={[(DOOR.x0 + DOOR.x1) / 2, BASE - 0.32, D / 2 + 2.1]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.1, 0.5]} />
      </mesh>
      {/* Brass lantern by the door */}
      <primitive object={lanternObj} position={[DOOR.x0 - 0.35, 2.05, D / 2 + 0.3]} scale={1.6} />
    </group>
  );
}
