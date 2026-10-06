"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { POWER, usePower } from "@/lib/power";
import { useGame } from "@/lib/store";
import type { Logged } from "@/lib/voice";

const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"]);

/**
 * The canvas never renders by itself (frameloop="never"); this loop renders each frame directly,
 * which avoids the one-frame restart delay of on-demand mode. It decides how often. Full rate while you move or look around,
 * a lower rate when you stand still, a trickle behind menus, and nothing in a hidden tab.
 */
export default function FrameLimiter() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    let lastInput = performance.now();
    const held = new Set<string>();
    const poke = () => (lastInput = performance.now());
    const down = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) held.add(e.code);
      poke();
    };
    const up = (e: KeyboardEvent) => {
      held.delete(e.code);
      poke();
    };
    const blur = () => held.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", poke);
    window.addEventListener("mousedown", poke);
    window.addEventListener("blur", blur);

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      // `window.__wwFreeze = true` stops rendering entirely (used when profiling power draw).
      if (document.hidden || (window as unknown as { __wwFreeze?: boolean }).__wwFreeze) return;
      const p = POWER[usePower.getState().mode];
      const g = useGame.getState();
      const busy = Date.now() - g.swapAt < 600 || Date.now() - g.shotAt < 300 || Date.now() - g.swingAt < 500;
      // A command just changed the world (it may have come by voice while paused): show it smoothly.
      const lastCmd = g.decisions[0] as Logged | undefined;
      const recent = lastCmd ? Date.now() - lastCmd.at < 8000 : false;
      let fps: number;
      if (!g.started || (!g.locked && !g.typing)) fps = recent ? p.idle : p.menu;
      else if (held.size > 0 || t - lastInput < 1200 || busy) fps = p.active;
      else fps = p.idle;
      // Small tolerance so a 60 fps cap on a 60 Hz display never skips a beat.
      if (t - last >= 1000 / fps - 2) {
        last = t;
        advance((t - t0) / 1000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("mousedown", poke);
      window.removeEventListener("blur", blur);
    };
  }, [advance]);
  return null;
}
