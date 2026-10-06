"use client";

import { create } from "zustand";

/**
 * How hard the game is allowed to work. Frame caps matter most for heat: the GPU sleeps between
 * frames, so halving the frame rate roughly halves its power draw.
 */
export type PowerMode = "cool" | "balanced" | "smooth";

export const POWER: Record<PowerMode, { label: string; hint: string; active: number; idle: number; menu: number; dpr: number; fx: boolean; grass: number; mirrorEvery: number }> = {
  cool: { label: "Cool", hint: "30 fps, lighter scene. Best on battery.", active: 30, idle: 15, menu: 2, dpr: 0.85, fx: false, grass: 0.55, mirrorEvery: 4 },
  balanced: { label: "Balanced", hint: "60 fps while moving, 30 when still.", active: 60, idle: 30, menu: 3, dpr: 1, fx: true, grass: 0.8, mirrorEvery: 2 },
  smooth: { label: "Smooth", hint: "Full frame rate and sharper image. Runs warm.", active: 120, idle: 60, menu: 6, dpr: 1.25, fx: true, grass: 1, mirrorEvery: 1 },
};

const KEY = "wildwood-power";

function initial(): PowerMode {
  if (typeof window === "undefined") return "balanced";
  const url = new URLSearchParams(window.location.search).get("power");
  if (url && url in POWER) return url as PowerMode;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved in POWER) return saved as PowerMode;
  } catch {}
  return "balanced";
}

export const usePower = create<{ mode: PowerMode; set: (m: PowerMode) => void }>((set) => ({
  mode: initial(),
  set: (mode) => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {}
    set({ mode });
  },
}));
