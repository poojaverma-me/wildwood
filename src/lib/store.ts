"use client";

import { create } from "zustand";
import type { Consumable, Decision, Item, TimeOfDay, Weather } from "./commands";

export const TIME_HOURS: Record<TimeOfDay, number> = { Sunrise: 6.4, Midday: 12.5, Sunset: 18.3, Night: 22.8 };

export type Toast = { id: number; text: string; tone: "info" | "good" | "warn" | "jev" };

type State = {
  started: boolean;
  locked: boolean;
  typing: boolean;
  inspector: boolean;
  mapOpen: boolean;

  weather: Weather;
  hour: number;
  targetHour: number;
  holding: Item;
  swapAt: number;
  flashlightOn: boolean;
  campfire: boolean;

  health: number;
  stamina: number;
  hunger: number;
  thirst: number;
  boostUntil: number;
  inventory: Record<Consumable, number>;
  wood: number;
  mag: number;
  reserve: number;

  shotAt: number;
  swingAt: number;
  lightningAt: number;
  healAt: number;
  hits: number;
  statusAt: number;

  listening: boolean;
  interim: string;
  thinking: boolean;
  decisions: Decision[];
  toasts: Toast[];
  objectives: Record<string, boolean>;
};

type Actions = {
  set: (p: Partial<State>) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  complete: (id: string) => void;
};

let toastId = 0;

export const useGame = create<State & Actions>((set) => ({
  started: false,
  locked: false,
  typing: false,
  inspector: false,
  mapOpen: false,

  weather: "Clear & sunny",
  hour: 17.4,
  targetHour: 17.4,
  holding: "Empty hands",
  swapAt: 0,
  flashlightOn: true,
  campfire: false,

  health: 58,
  stamina: 100,
  hunger: 46,
  thirst: 38,
  boostUntil: 0,
  inventory: { Bandage: 3, Medkit: 1, "Canned food": 2, "Water bottle": 2, "Energy drink": 1 },
  wood: 0,
  mag: 4,
  reserve: 24,

  shotAt: 0,
  swingAt: 0,
  lightningAt: 0,
  healAt: 0,
  hits: 0,
  statusAt: 0,

  listening: false,
  interim: "",
  thinking: false,
  decisions: [],
  toasts: [],
  objectives: {},

  set: (p) => set(p),
  toast: (text, tone = "info") => {
    const t = { id: ++toastId, text, tone };
    set((s) => ({ toasts: [...s.toasts.slice(-4), t] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), 4200);
  },
  complete: (id) => set((s) => (s.objectives[id] ? s : { objectives: { ...s.objectives, [id]: true } })),
}));

export const OBJECTIVES = [
  { id: "weather", label: "Change the weather with your voice" },
  { id: "equip", label: "Bring out a weapon or tool" },
  { id: "heal", label: "Treat your wound" },
  { id: "fire", label: "Light the campfire before nightfall" },
  { id: "targets", label: "Shoot all six bottles by the cabin" },
  { id: "combo", label: "Give a two-part command in one sentence" },
];
