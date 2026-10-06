"use client";

import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PointerLockControls as PLC } from "three-stdlib";
import { sfx } from "@/lib/audio";
import { useGame } from "@/lib/store";
import { CABIN, CAMPFIRE, COLLIDERS, SPAWN, TREES, WATER_Y, heightAt, type Collider } from "@/lib/world";
import { remainingTargets, shootTargets } from "./targets";

const EYE = 1.7;
const UP = new THREE.Vector3(0, 1, 0);
const CELL = 8;

function grid() {
  const g = new Map<string, Collider[]>();
  for (const c of COLLIDERS) {
    const k = `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(c);
  }
  return g;
}

export const controlsRef: { current: PLC | null } = { current: null };

export default function Player() {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const vy = useRef(0);
  const grounded = useRef(true);
  const bob = useRef(0);
  const acc = useRef(0);
  const cells = useMemo(grid, []);

  useEffect(() => {
    camera.position.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z) + EYE, SPAWN.z);
    camera.lookAt(CAMPFIRE.x - 4, heightAt(CAMPFIRE.x, CAMPFIRE.z) + 1.2, CAMPFIRE.z - 6);
  }, [camera]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (useGame.getState().typing) return;
      keys.current[e.code] = true;
      if (e.code === "Space" && grounded.current) {
        vy.current = 5.2;
        grounded.current = false;
      }
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || !document.pointerLockElement) return;
      act(camera);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("mousedown", click);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("mousedown", click);
    };
  }, [camera]);

  const fwd = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const move = useMemo(() => new THREE.Vector3(), []);
  const local = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const g = useGame.getState();
    const k = keys.current;
    const active = g.locked && !g.typing;

    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.crossVectors(fwd, camera.up).normalize();
    move.set(0, 0, 0);
    if (active) {
      if (k.KeyW || k.ArrowUp) move.add(fwd);
      if (k.KeyS || k.ArrowDown) move.sub(fwd);
      if (k.KeyD || k.ArrowRight) move.add(right);
      if (k.KeyA || k.ArrowLeft) move.sub(right);
    }
    const moving = move.lengthSq() > 0;
    const boosted = g.boostUntil > Date.now();
    const sprint = moving && (k.ShiftLeft || k.ShiftRight) && g.stamina > 2;
    const wading = heightAt(camera.position.x, camera.position.z) < WATER_Y - 0.4;
    const speed = (sprint ? 10.5 : 5.2) * (boosted ? 1.3 : 1) * (wading ? 0.45 : 1);
    if (moving) move.normalize().multiplyScalar(speed * dt);

    const p = camera.position;
    p.x += move.x;
    p.z += move.z;

    // Push out of trees, rocks and the fire pit.
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const c of cells.get(`${cx + i},${cz + j}`) ?? []) {
          const dx = p.x - c.x;
          const dz = p.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + 0.35;
          if (d < min && d > 0.0001) {
            p.x = c.x + (dx / d) * min;
            p.z = c.z + (dz / d) * min;
          }
        }
    // Cabin walls: a rectangle in the cabin's own (rotated) frame.
    local.set(p.x - CABIN.x, 0, p.z - CABIN.z).applyAxisAngle(UP, -CABIN.rot);
    const hx = CABIN.w / 2 + 0.4;
    const hz = CABIN.d / 2 + 0.4;
    if (Math.abs(local.x) < hx && Math.abs(local.z) < hz) {
      if (hx - Math.abs(local.x) < hz - Math.abs(local.z)) local.x = Math.sign(local.x) * hx;
      else local.z = Math.sign(local.z) * hz;
      local.applyAxisAngle(UP, CABIN.rot);
      p.x = CABIN.x + local.x;
      p.z = CABIN.z + local.z;
    }
    p.x = THREE.MathUtils.clamp(p.x, -150, 150);
    p.z = THREE.MathUtils.clamp(p.z, -150, 150);

    // Gravity, ground and a little head bob.
    const ground = Math.max(heightAt(p.x, p.z), WATER_Y - 0.9) + EYE;
    vy.current -= 14 * dt;
    let y = p.y + vy.current * dt;
    if (y <= ground) {
      y = ground;
      vy.current = 0;
      grounded.current = true;
    }
    bob.current += moving && grounded.current ? dt * (sprint ? 13 : 8.5) : 0;
    p.y = y + (moving && grounded.current ? Math.sin(bob.current) * 0.05 : 0);

    // Vitals tick a few times a second.
    acc.current += dt;
    if (acc.current > 0.25) {
      const t = acc.current;
      acc.current = 0;
      const nearFire = g.campfire && Math.hypot(p.x - CAMPFIRE.x, p.z - CAMPFIRE.z) < 7;
      let health = g.health;
      if (nearFire) health += 1.4 * t;
      if (g.hunger <= 0 || g.thirst <= 0) health -= 0.6 * t;
      useGame.setState({
        stamina: THREE.MathUtils.clamp(g.stamina + (sprint ? -16 : boosted ? 30 : 11) * t, 0, 100),
        hunger: Math.max(0, g.hunger - 0.12 * t),
        thirst: Math.max(0, g.thirst - 0.16 * t),
        health: THREE.MathUtils.clamp(health, 1, 100),
      });
    }
  });

  return (
    <PointerLockControls
      ref={(c) => {
        controlsRef.current = c as unknown as PLC | null;
      }}
      selector="#play-surface"
      onLock={() => useGame.setState({ locked: true })}
      onUnlock={() => useGame.setState({ locked: false })}
    />
  );
}

/** Left click: shoot, chop, or nothing, depending on what's in hand. */
function act(camera: THREE.Camera) {
  const g = useGame.getState();
  if (g.holding === "Pistol") {
    if (g.mag <= 0) {
      sfx.empty();
      g.toast("Click. Out of ammo. Say “reload”.", "warn");
      return;
    }
    useGame.setState({ mag: g.mag - 1, shotAt: Date.now() });
    sfx.shot();
    if (shootTargets(camera)) {
      sfx.glass();
      const hits = g.hits + 1;
      useGame.setState({ hits });
      if (remainingTargets() === 0) {
        g.complete("targets");
        g.toast("All six bottles down. Nice shooting!", "good");
      }
    }
  } else if (g.holding === "Axe") {
    useGame.setState({ swingAt: Date.now() });
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const near = TREES.find((t) => {
      const dx = t.x - camera.position.x;
      const dz = t.z - camera.position.z;
      const d = Math.hypot(dx, dz);
      return d < 2.8 && (dx * dir.x + dz * dir.z) / d > 0.55;
    });
    setTimeout(() => {
      if (near) {
        sfx.chop();
        useGame.setState({ wood: useGame.getState().wood + 1 });
        useGame.getState().toast("+1 firewood", "good");
      }
    }, 180);
  }
}
