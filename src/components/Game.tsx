"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { initAudio } from "@/lib/audio";
import { POWER, usePower } from "@/lib/power";
import { useGame } from "@/lib/store";
import { runCommand, startListening } from "@/lib/voice";
import Atmosphere from "./game/Atmosphere";
import Effects from "./game/Effects";
import FrameLimiter from "./game/FrameLimiter";
import Player, { controlsRef } from "./game/Player";
import ViewModel from "./game/ViewModel";
import World from "./game/World";
import HUD from "./hud/HUD";
import Inspector from "./hud/Inspector";
import StartScreen from "./hud/StartScreen";
import type { Logged } from "@/lib/voice";

/** Lets the DOM HUD (compass, map) read the camera without re-rendering the scene. */
function CameraBridge() {
  const { camera, gl, scene, advance } = useThree();
  useEffect(() => {
    (window as unknown as { __wwCamera?: THREE.Camera }).__wwCamera = camera;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __wwGl: gl, __wwScene: scene, __wwAdvance: advance });
  }, [camera, gl, scene, advance]);
  return null;
}

// `?fx=0` drops post-processing, `?ao=1` adds ambient occlusion, `?power=cool|balanced|smooth` picks a power mode.
const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
const FX = params.get("fx") !== "0";
const AO = params.get("ao") === "1";

export default function Game() {
  const power = POWER[usePower((s) => s.mode)];
  const started = useGame((s) => s.started);
  const inspector = useGame((s) => s.inspector);
  const last = useGame((s) => s.decisions[0]) as Logged | undefined;

  // Dev-only handles for automated testing (headless browsers can't take pointer lock).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __wwStore: useGame, __wwRun: runCommand });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = useGame.getState();
      if (!g.started || g.typing) return;
      if (e.code === "KeyT") {
        e.preventDefault();
        document.exitPointerLock();
        useGame.setState({ typing: true });
      } else if (e.code === "Tab") {
        e.preventDefault();
        useGame.setState({ inspector: !g.inspector });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = (voice: boolean) => {
    initAudio();
    useGame.setState({ started: true });
    controlsRef.current?.lock();
    if (voice) startListening();
    useGame.getState().toast("Dusk is coming. Light the fire before dark.", "info");
  };

  return (
    <div className="fixed inset-0">
      <div id="play-surface" className="absolute inset-0">
        <Canvas frameloop="never" shadows="soft" dpr={power.dpr} camera={{ fov: 72, near: 0.03, far: 1600 }} gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}>
          <Atmosphere />
          <World />
          <Player />
          <ViewModel />
          <CameraBridge />
          <FrameLimiter />
          {FX && power.fx && (
            <Suspense fallback={null}>
              <Effects ao={AO} />
            </Suspense>
          )}
        </Canvas>
      </div>
      {started && <HUD onResume={() => controlsRef.current?.lock()} />}
      <AnimatePresence>
        {started && inspector && (
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} className="absolute right-5 top-[140px] z-10">
            <Inspector d={last} />
          </motion.div>
        )}
      </AnimatePresence>
      {!started && <StartScreen onStart={start} />}
    </div>
  );
}
