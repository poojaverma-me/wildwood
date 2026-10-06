"use client";

import { useProgress } from "@react-three/drei";
import { motion } from "framer-motion";
import { Mic, MousePointer2 } from "lucide-react";
import Link from "next/link";
import { speechSupported } from "@/lib/voice";
import PowerPicker from "./PowerPicker";

const EXAMPLES = ["Make it rain", "Bring out my pistol", "Use a bandage", "Make it night and grab my flashlight", "Light the campfire", "Start a thunderstorm", "I'm thirsty", "Show me the map"];

export default function StartScreen({ onStart }: { onStart: (voice: boolean) => void }) {
  const voice = speechSupported();
  const { progress, active } = useProgress();
  const loading = active && progress < 100;
  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-gradient-to-b from-black/70 via-black/40 to-black/80 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="w-full max-w-[880px] text-center">
        <div className="hud-text text-[14px] font-bold uppercase tracking-[0.4em] text-amber">A voice-controlled survival sandbox</div>
        <h1 className="font-title text-[clamp(5rem,14vw,10rem)] leading-[0.85] tracking-wide text-ink" style={{ textShadow: "0 10px 60px rgba(0,0,0,.6)" }}>
          Wildwood
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[16px] leading-relaxed text-ink-2">
          Walk the valley with your keyboard. Change the world with your voice. Every sentence you say is understood by <b className="text-jev">Jev</b> in about a
          tenth of a second, no menus and no hotkeys.
        </p>

        <div className="mx-auto mt-6 h-1 max-w-xs overflow-hidden rounded-full bg-white/15" aria-label="Loading the valley">
          <div className="h-full rounded-full bg-amber transition-[width] duration-300" style={{ width: `${loading ? progress : 100}%` }} />
        </div>
        <div className="hud-text mt-2 text-[12px] font-semibold uppercase tracking-[0.25em] text-ink-3">
          {loading ? `Streaming photoscanned assets · ${Math.round(progress)}%` : "Valley ready"}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => onStart(voice)} className="hud-text flex items-center gap-2 rounded-sm bg-amber px-8 py-3.5 text-[20px] font-bold uppercase text-black shadow-[0_10px_40px_-10px_var(--amber)] transition hover:brightness-110 active:scale-95">
            {voice ? <Mic size={20} /> : <MousePointer2 size={20} />} {voice ? "Enter the valley with voice" : "Enter the valley"}
          </button>
          {voice && (
            <button onClick={() => onStart(false)} className="hud-text rounded-sm border border-white/25 px-6 py-3.5 text-[18px] font-bold uppercase text-ink hover:bg-white/10">
              Keyboard only
            </button>
          )}
        </div>
        {!voice && <p className="mt-3 text-[13px] text-ink-3">Speech recognition isn&apos;t available in this browser. Open in Chrome for voice, or press T in game to type commands.</p>}

        <div className="mx-auto mt-10 grid max-w-[760px] gap-4 text-left sm:grid-cols-2">
          <div className="hud-glass corner rounded-md p-4">
            <div className="hud-text text-[13px] font-bold uppercase text-amber">Controls</div>
            <ul className="hud-text mt-2 grid grid-cols-2 gap-y-1 text-[15px] font-semibold">
              <li>WASD / Arrows</li>
              <li className="text-ink-2">Move</li>
              <li>Mouse</li>
              <li className="text-ink-2">Look</li>
              <li>Shift · Space</li>
              <li className="text-ink-2">Sprint · Jump</li>
              <li>Left click</li>
              <li className="text-ink-2">Shoot · Chop</li>
              <li>T · Tab · Esc</li>
              <li className="text-ink-2">Type · Jev brain · Pause</li>
            </ul>
          </div>
          <div className="hud-glass corner rounded-md p-4">
            <div className="hud-text text-[13px] font-bold uppercase text-jev">Try saying</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <span key={e} className="hud-text rounded-sm bg-white/[0.07] px-2 py-1 text-[14px] font-semibold">
                  “{e}”
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6">
          <PowerPicker />
        </div>
        <Link href="/how" className="hud-text mt-6 inline-block text-[14px] font-bold uppercase tracking-wider text-jev underline-offset-4 hover:underline">
          How Jev hears you →
        </Link>
      </motion.div>
    </div>
  );
}
