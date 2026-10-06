"use client";

import { Flame, Leaf, Zap } from "lucide-react";
import { POWER, usePower, type PowerMode } from "@/lib/power";

const ICON: Record<PowerMode, typeof Leaf> = { cool: Leaf, balanced: Zap, smooth: Flame };

/** Lets the player trade smoothness for a cooler, quieter laptop. Saved across visits. */
export default function PowerPicker() {
  const mode = usePower((s) => s.mode);
  const set = usePower((s) => s.set);
  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="hud-text text-[12px] font-bold uppercase tracking-[0.25em] text-ink-3">Power</div>
      <div role="radiogroup" aria-label="Power mode" className="hud-glass inline-flex gap-1 rounded-md p-1">
        {(Object.keys(POWER) as PowerMode[]).map((m) => {
          const Icon = ICON[m];
          const on = m === mode;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={on}
              onClick={() => set(m)}
              className={`hud-text flex items-center gap-1.5 rounded-sm px-3.5 py-1.5 text-[14px] font-bold uppercase transition ${on ? "bg-amber text-black" : "text-ink-2 hover:bg-white/10 hover:text-ink"}`}
            >
              <Icon size={14} /> {POWER[m].label}
            </button>
          );
        })}
      </div>
      <div className="text-[12.5px] text-ink-3">{POWER[mode].hint}</div>
    </div>
  );
}
