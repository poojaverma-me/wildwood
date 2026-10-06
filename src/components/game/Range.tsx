"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FENCE, TARGETS, heightAt } from "@/lib/world";
import { usePBR } from "./loaders";
import { registerTarget } from "./targets";

/** A glass bottle silhouette, turned on a lathe. */
function bottleGeometry() {
  const pts = [
    [0, 0],
    [0.085, 0],
    [0.095, 0.02],
    [0.095, 0.26],
    [0.075, 0.32],
    [0.032, 0.37],
    [0.028, 0.47],
    [0.034, 0.49],
    [0.03, 0.5],
    [0, 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 24);
}

export default function Range() {
  const wood = usePBR("weathered_planks", [2, 0.2]);
  const post = usePBR("weathered_planks", [0.2, 1]);
  const y = heightAt(FENCE.x, FENCE.z);
  const geo = useMemo(bottleGeometry, []);
  return (
    <group>
      <group position={[FENCE.x, y, FENCE.z]}>
        <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
          <boxGeometry args={[FENCE.w, 0.12, 0.28]} />
          <meshStandardMaterial {...wood} color="#b3a08c" roughness={1} />
        </mesh>
        <mesh position={[0, 0.55, 0.02]} castShadow receiveShadow>
          <boxGeometry args={[FENCE.w, 0.1, 0.06]} />
          <meshStandardMaterial {...wood} color="#9d8a76" roughness={1} />
        </mesh>
        {[-FENCE.w / 2 + 0.2, 0, FENCE.w / 2 - 0.2].map((x) => (
          <mesh key={x} position={[x, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.16, 1.3, 0.16]} />
            <meshStandardMaterial {...post} color="#8f7d6b" roughness={1} />
          </mesh>
        ))}
      </group>
      {TARGETS.map((t) => (
        <Bottle key={t.id} id={t.id} x={t.x} z={t.z} y={y + 1.06} geo={geo} />
      ))}
    </group>
  );
}

const GLASS = ["#1f5a2a", "#6b3a12", "#2c5a3a", "#5a3110", "#22552f", "#704016"];

function Bottle({ id, x, z, y, geo }: { id: number; x: number; z: number; y: number; geo: THREE.BufferGeometry }) {
  const ref = useRef<THREE.Group>(null!);
  const hitAt = useRef(0);
  useEffect(() => registerTarget(id, ref, () => (hitAt.current = performance.now())), [id]);
  useFrame(() => {
    if (!hitAt.current) return;
    const t = (performance.now() - hitAt.current) / 1000;
    ref.current.position.set(x + t * 1.8, y + t * 2.5 - t * t * 9, z - t * 2);
    ref.current.rotation.set(t * 9, 0, t * 6);
    ref.current.visible = t < 0.9;
  });
  return (
    <group ref={ref} position={[x, y, z]}>
      <mesh geometry={geo} userData={{ targetId: id }} castShadow>
        <meshPhysicalMaterial color={GLASS[id]} roughness={0.06} metalness={0} clearcoat={1} transparent opacity={0.78} envMapIntensity={1.6} />
      </mesh>
    </group>
  );
}
