"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/lib/store";
import { CAMPFIRE, heightAt } from "@/lib/world";
import { Embers, Flames, Smoke } from "./Fire";
import { manageLight } from "./lights";
import { useModel } from "./loaders";
import { weatherize } from "./Props";

function useWeathered(id: Parameters<typeof useModel>[0]) {
  const g = useModel(id);
  return useMemo(() => {
    const s = g.scene.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = weatherize(m.material as THREE.Material, { key: "ww-prop" });
      m.castShadow = true;
      m.receiveShadow = true;
    });
    return s;
  }, [g]);
}

/** Stone fire pit, a stack of dry branches, a log bench, and a fire that lights the clearing. */
export default function Campfire() {
  const pit = useWeathered("stone_fire_pit");
  const branches = useWeathered("dry_branches_medium_01");
  const bench = useWeathered("dead_tree_trunk");
  const sticks = useMemo(() => [0, 1, 2, 3].map((i) => (i === 0 ? branches : branches.clone(true))), [branches]);
  const light = useRef<THREE.PointLight>(null!);
  const coals = useRef<THREE.MeshStandardMaterial>(null!);
  const level = useRef(0);
  const y = heightAt(CAMPFIRE.x, CAMPFIRE.z);

  useFrame(({ clock }, dt) => {
    const lit = useGame.getState().campfire;
    level.current += ((lit ? 1 : 0) - level.current) * Math.min(1, dt * 1.2);
    const t = clock.elapsedTime;
    const L = level.current;
    const flicker = 1 + Math.sin(t * 17) * 0.08 + Math.sin(t * 7.3) * 0.12 + Math.sin(t * 31) * 0.05;
    light.current.intensity = L * 38 * flicker;
    coals.current.emissiveIntensity = 0.2 + L * 3.5 * flicker;
  });
  useEffect(() => manageLight(light.current), []);
  const lvl = () => level.current;

  return (
    <group position={[CAMPFIRE.x, y, CAMPFIRE.z]}>
      <primitive object={pit} position={[0, 0.02, 0]} scale={1.15} />
      {/* A teepee of branches over glowing coals. */}
      <group position={[0, 0.12, 0]}>
        {sticks.map((obj, i) => (
          <primitive key={i} object={obj} rotation={[0.9, (i / 4) * Math.PI * 2, 0]} position={[Math.cos((i / 4) * Math.PI * 2) * 0.12, 0.25, Math.sin((i / 4) * Math.PI * 2) * 0.12]} scale={0.75} />
        ))}
      </group>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 24]} />
        <meshStandardMaterial ref={coals} color="#1a0f0a" emissive="#ff4a0e" emissiveIntensity={0.2} roughness={1} />
      </mesh>
      <group position={[0, 0.12, 0]}>
        <Flames level={lvl} size={1.25} sheets={6} />
        <Embers level={lvl} />
        <Smoke level={lvl} />
      </group>
      <pointLight ref={light} position={[0, 1.3, 0]} color="#ff8a3a" distance={34} decay={1.6} intensity={0} />
      <primitive object={bench} position={[-0.6, heightAt(CAMPFIRE.x - 0.6, CAMPFIRE.z + 3.3) - y, 3.3]} rotation={[0, 0.15, 0]} scale={1.05} />
    </group>
  );
}
