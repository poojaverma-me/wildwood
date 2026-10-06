"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Item } from "@/lib/commands";
import { useGame } from "@/lib/store";
import { CABIN, CAMPFIRE, LAKE, TRAILS } from "@/lib/world";
import { Flames } from "./Fire";
import { manageLight, warmAlso } from "./lights";
import { preloadModels, usePBR, useModel } from "./loaders";

preloadModels(["service_pistol", "wooden_axe_02", "vintage_flashlight"]);

/** Clones a glTF scene for first-person use: no shadow casting, full environment reflections. */
function useHeld(id: "service_pistol" | "wooden_axe_02" | "vintage_flashlight", keep?: (name: string) => boolean) {
  const g = useModel(id);
  return useMemo(() => {
    const root = new THREE.Group();
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (keep && !keep(m.name))) return;
      const c = new THREE.Mesh(m.geometry, (m.material as THREE.Material).clone());
      c.applyMatrix4(m.matrixWorld);
      c.receiveShadow = true;
      root.add(c);
    });
    return root;
  }, [g, keep]);
}

const ASSEMBLED = (name: string) => name.endsWith("_a");

function Pistol() {
  const model = useHeld("service_pistol", ASSEMBLED);
  const flash = useRef<THREE.Group>(null!);
  useFrame(() => {
    const on = Date.now() - useGame.getState().shotAt < 60;
    flash.current.visible = on;
    flash.current.rotation.z = Math.random() * Math.PI;
  });
  return (
    <group>
      {/* Barrel points down -Z; the grip hangs below the origin. */}
      <primitive object={model} rotation={[0, Math.PI / 2, 0]} position={[0, -0.03, 0.06]} />
      <group ref={flash} position={[0, 0.03, -0.13]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.03, 0.12, 8, 1, true]} />
          <meshBasicMaterial color={new THREE.Color(6, 3.6, 1.2)} transparent opacity={0.9} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <planeGeometry args={[0.12, 0.12]} />
          <meshBasicMaterial color={new THREE.Color(7, 4, 1.4)} transparent opacity={0.6} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Axe() {
  const model = useHeld("wooden_axe_02");
  // Grip near the bottom of the handle; head up and blade facing away from the player.
  return (
    <group rotation={[-0.25, 0.25, 0.32]}>
      <primitive object={model} rotation={[0, Math.PI, 0]} position={[0, 0.22, 0]} />
    </group>
  );
}

function Flashlight() {
  const g = useModel("vintage_flashlight");
  const lens = useRef<THREE.MeshStandardMaterial>(null!);
  // Find which end the glass is on so the beam always comes out of the lens.
  const { model, lensZ } = useMemo(() => {
    const root = new THREE.Group();
    let lz = 0;
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const c = new THREE.Mesh(m.geometry, mats.map((x) => x.clone()));
      c.applyMatrix4(m.matrixWorld);
      root.add(c);
      m.geometry.groups.forEach((gr) => {
        const mat = mats[gr.materialIndex ?? 0];
        if (!mat?.name.includes("glass")) return;
        const pos = m.geometry.attributes.position as THREE.BufferAttribute;
        const idx = m.geometry.index!;
        let sum = 0;
        for (let i = gr.start; i < gr.start + gr.count; i += 3) sum += pos.getZ(idx.getX(i));
        lz = sum / (gr.count / 3);
      });
    });
    return { model: root, lensZ: lz };
  }, [g]);
  const flip = lensZ > 0 ? Math.PI : 0;
  useFrame(() => {
    lens.current.opacity = useGame.getState().flashlightOn ? 0.9 : 0;
  });
  return (
    <group>
      <primitive object={model} rotation={[0, flip, 0]} position={[0, -0.07, 0.02]} />
      <mesh position={[0, -0.0, -0.135]}>
        <circleGeometry args={[0.04, 20]} />
        <meshBasicMaterial ref={lens as never} color={new THREE.Color(5, 4.6, 3.6)} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

function Torch() {
  const bark = usePBR("pine_bark", [0.5, 1]);
  return (
    <group rotation={[-0.35, 0, -0.18]}>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.022, 0.03, 0.6, 12]} />
        <meshStandardMaterial {...bark} color="#a08770" roughness={1} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.042, 0.032, 0.12, 12]} />
        <meshStandardMaterial color="#1e140c" roughness={1} emissive="#ff4a10" emissiveIntensity={0.18} />
      </mesh>
      <group position={[0, 0.3, 0]}>
        <Flames level={() => 1} size={0.24} sheets={4} />
      </group>
    </group>
  );
}

/** A hand-drawn map of the valley, painted onto a canvas once. */
function useMapTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 720;
    const x = c.getContext("2d")!;
    x.fillStyle = "#d9c79c";
    x.fillRect(0, 0, 1024, 720);
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},40,${Math.random() * 0.06})`;
      x.fillRect(Math.random() * 1024, Math.random() * 720, 2 + Math.random() * 30, 2 + Math.random() * 30);
    }
    const map = (wx: number, wz: number): [number, number] => [512 + wx * 3, 360 + wz * 2.4];
    // Forest
    x.fillStyle = "rgba(60,90,50,0.35)";
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 45 + Math.random() * 110;
      const [px, py] = map(Math.cos(a) * r, Math.sin(a) * r);
      x.beginPath();
      x.arc(px, py, 5 + Math.random() * 8, 0, Math.PI * 2);
      x.fill();
    }
    // Lake
    const [lx, ly] = map(LAKE.x, LAKE.z);
    x.fillStyle = "#6f97a6";
    x.beginPath();
    x.ellipse(lx, ly, LAKE.r * 3, LAKE.r * 2.4, 0, 0, Math.PI * 2);
    x.fill();
    // Trails
    x.strokeStyle = "#7a5230";
    x.setLineDash([10, 8]);
    x.lineWidth = 4;
    for (const t of TRAILS) {
      x.beginPath();
      t.forEach(([wx, wz], i) => (i ? x.lineTo(...map(wx, wz)) : x.moveTo(...map(wx, wz))));
      x.stroke();
    }
    x.setLineDash([]);
    // Cabin and fire
    const [cx, cy] = map(CABIN.x, CABIN.z);
    x.fillStyle = "#5a3a20";
    x.fillRect(cx - 14, cy - 10, 28, 20);
    const [fx, fy] = map(CAMPFIRE.x, CAMPFIRE.z);
    x.fillStyle = "#c2481c";
    x.beginPath();
    x.arc(fx, fy, 8, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#3b2a1a";
    x.font = "italic 34px Georgia, serif";
    x.fillText("Wildwood Valley", 40, 60);
    x.font = "22px Georgia, serif";
    x.fillText("cabin", cx + 18, cy + 6);
    x.fillText("camp", fx + 14, fy + 6);
    x.fillText("lake", lx - 20, ly + 6);
    x.strokeStyle = "#3b2a1a";
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(940, 120);
    x.lineTo(940, 50);
    x.stroke();
    x.fillText("N", 931, 40);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, []);
}

function MapItem() {
  const tex = useMapTexture();
  return (
    <group rotation={[-1.0, 0, 0]}>
      <mesh>
        <planeGeometry args={[0.36, 0.25, 8, 1]} />
        <meshStandardMaterial map={tex} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

const MODELS: Record<Item, (() => React.JSX.Element) | null> = {
  Pistol,
  Axe,
  Flashlight,
  Torch,
  Map: MapItem,
  "Empty hands": null,
};
/** Rest positions in metres, in camera space. */
const REST: Record<Item, [number, number, number]> = {
  Pistol: [0.13, -0.135, -0.46],
  Axe: [0.24, -0.33, -0.44],
  Flashlight: [0.16, -0.15, -0.44],
  Torch: [0.38, -0.44, -0.72],
  Map: [0, -0.2, -0.32],
  "Empty hands": [0.26, -0.26, -0.5],
};

const ITEMS = (Object.keys(MODELS) as Item[]).filter((k) => MODELS[k]);

function HeldSlot({ item, shown }: { item: Item; shown: Item }) {
  const ref = useRef<THREE.Group>(null!);
  useEffect(() => warmAlso(ref.current), []);
  const Model = MODELS[item]!;
  return (
    <group ref={ref} visible={item === shown}>
      <Suspense fallback={null}>
        <Model />
      </Suspense>
    </group>
  );
}

export default function ViewModel() {
  const { camera } = useThree();
  const root = useRef<THREE.Group>(null!);
  const inner = useRef<THREE.Group>(null!);
  const holding = useGame((s) => s.holding);
  const [shown, setShown] = useState<Item>(holding);
  const sway = useRef(0);
  const lastCam = useRef(new THREE.Vector3());
  const handLight = useRef<THREE.PointLight>(null!);
  const beam = useRef<THREE.SpotLight>(null!);
  const beamTarget = useRef<THREE.Object3D>(null!);
  useEffect(() => {
    beam.current.target = beamTarget.current;
    const a = manageLight(handLight.current);
    const b = manageLight(beam.current);
    return () => {
      a();
      b();
    };
  }, []);

  useFrame((_, dt) => {
    const g = useGame.getState();
    root.current.position.copy(camera.position);
    root.current.quaternion.copy(camera.quaternion);
    const swapAge = (Date.now() - g.swapAt) / 1000;
    if (swapAge > 0.22 && shown !== g.holding) setShown(g.holding);
    const lower = swapAge < 0.22 ? swapAge / 0.22 : swapAge < 0.5 ? 1 - (swapAge - 0.22) / 0.28 : 0;
    const rest = REST[shown];
    // Walking bob scales with how far the camera moved this frame.
    const moved = Math.min(1, camera.position.distanceTo(lastCam.current) / Math.max(dt, 1e-3) / 6);
    lastCam.current.copy(camera.position);
    sway.current += dt * (1 + moved * 5);
    const recoil = Math.max(0, 1 - (Date.now() - g.shotAt) / 140);
    const swing = Date.now() - g.swingAt < 380 ? Math.sin(((Date.now() - g.swingAt) / 380) * Math.PI) : 0;
    const bob = 0.003 + moved * 0.008;
    inner.current.position.set(rest[0] + Math.sin(sway.current * 1.3) * bob, rest[1] - lower * 0.3 + Math.abs(Math.sin(sway.current * 2)) * bob, rest[2] + recoil * 0.05);
    inner.current.rotation.set(recoil * 0.3 - swing * 1.4, swing * 0.4, swing * 0.5);

    // One point light (torch flame or muzzle flash) and one spot (flashlight beam) serve every item.
    const t = performance.now() / 1000;
    const muzzle = shown === "Pistol" && Date.now() - g.shotAt < 60;
    const torch = shown === "Torch" && lower < 0.5;
    handLight.current.intensity = muzzle ? 30 : torch ? 16 + Math.sin(t * 17) * 2.5 + Math.sin(t * 6.1) * 2.5 : 0;
    handLight.current.color.set(muzzle ? "#ffb347" : "#ff9d4a");
    beam.current.intensity = shown === "Flashlight" && g.flashlightOn && lower < 0.5 ? 120 : 0;
  });

  // Every item stays mounted (hidden when not held) so equipping never loads or compiles anything.
  return (
    <group ref={root}>
      <group ref={inner}>
        {ITEMS.map((item) => (
          <HeldSlot key={item} item={item} shown={shown} />
        ))}
      </group>
      <pointLight ref={handLight} position={[0.2, 0.1, -0.6]} distance={22} decay={1.6} intensity={0} />
      <spotLight ref={beam} position={[0.16, -0.15, -0.6]} angle={0.4} penumbra={0.6} distance={60} decay={1.3} color="#fff1d0" intensity={0} />
      <object3D ref={beamTarget} position={[-0.2, -0.05, -20]} />
    </group>
  );
}
