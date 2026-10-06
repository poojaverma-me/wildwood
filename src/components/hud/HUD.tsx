"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Axe, Backpack, CheckSquare, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, Flame, Flashlight, Heart, Keyboard, Map as MapIcon, Mic, MicOff, Moon, Square, Sun, Sunrise, Sunset, Utensils, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Item, Weather } from "@/lib/commands";
import { OBJECTIVES, useGame } from "@/lib/store";
import { runCommand, speechSupported, startListening, stopListening, timeLabel, type Logged } from "@/lib/voice";
import { CAMPFIRE, CABIN, LAKE } from "@/lib/world";
import PowerPicker from "./PowerPicker";

const WEATHER_ICON: Record<Weather, React.ReactNode> = {
  "Clear & sunny": <CloudSun size={18} />,
  "Light rain": <CloudRain size={18} />,
  "Heavy rain": <CloudRain size={18} />,
  Thunderstorm: <CloudLightning size={18} />,
  Snow: <CloudSnow size={18} />,
  Fog: <CloudFog size={18} />,
};

const ITEM_ICON: Record<Item, React.ReactNode> = {
  Pistol: <span className="font-title text-2xl leading-none">⌐╦</span>,
  Axe: <Axe size={22} />,
  Flashlight: <Flashlight size={22} />,
  Torch: <Flame size={22} />,
  Map: <MapIcon size={22} />,
  "Empty hands": <Backpack size={22} />,
};

/** A coarse clock for time-based HUD effects, so render stays pure. */
function useNow(ms: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export default function HUD({ onResume }: { onResume: () => void }) {
  const g = useGame();
  const now = useNow(150);
  const last = g.decisions[0] as Logged | undefined;
  const h = ((g.hour % 24) + 24) % 24;
  const clock = `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
  const tod = timeLabel(g.hour);
  const healing = now - g.healAt < 900;
  const statusPulse = now - g.statusAt < 3000;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Screen effects */}
      <AnimatePresence>
        {healing && <motion.div key="heal" className="absolute inset-0" initial={{ opacity: 0.6 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} style={{ boxShadow: "inset 0 0 160px 40px rgba(74,222,128,.55)" }} />}
      </AnimatePresence>
      {g.health < 35 && <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 ${200 - g.health * 3}px ${50 - g.health}px rgba(239,68,68,.45)` }} />}

      {/* Crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {g.holding === "Pistol" ? (
          <div className="relative h-7 w-7">
            {[0, 90, 180, 270].map((r) => (
              <span key={r} className="absolute left-1/2 top-0 h-2 w-[2px] -translate-x-1/2 bg-white/85" style={{ transform: `rotate(${r}deg)`, transformOrigin: "50% 14px" }} />
            ))}
          </div>
        ) : (
          <span className="block h-1.5 w-1.5 rounded-full bg-white/80 shadow" />
        )}
      </div>

      {/* Top-left: objectives */}
      <div className="hud-glass corner absolute left-5 top-5 w-[290px] rounded-md px-4 py-3">
        <div className="hud-text text-[13px] font-bold uppercase text-amber">Survive the night</div>
        <ul className="mt-2 space-y-1">
          {OBJECTIVES.map((o) => (
            <li key={o.id} className={`hud-text flex items-center gap-2 text-[14px] font-semibold ${g.objectives[o.id] ? "text-ink-3 line-through" : "text-ink"}`}>
              {g.objectives[o.id] ? <CheckSquare size={14} className="text-stamina" /> : <Square size={14} className="text-ink-3" />}
              {o.label}
            </li>
          ))}
        </ul>
      </div>

      {/* Top-right: clock, weather, compass */}
      <div className="absolute right-5 top-5 flex flex-col items-end gap-2">
        <div className="hud-glass corner flex items-center gap-3 rounded-md px-4 py-2">
          <span className="text-amber">{tod === "Night" ? <Moon size={18} /> : tod === "Sunrise" ? <Sunrise size={18} /> : tod === "Sunset" ? <Sunset size={18} /> : <Sun size={18} />}</span>
          <span className="hud-text text-[26px] font-bold leading-none tabular-nums">{clock}</span>
          <span className="h-6 w-px bg-white/15" />
          <span className="text-ink-2">{WEATHER_ICON[g.weather]}</span>
          <span className="hud-text text-[15px] font-semibold uppercase">{g.weather === "Clear & sunny" && tod === "Night" ? "Clear night" : g.weather}</span>
        </div>
        <Compass />
      </div>

      {/* Bottom-left: vitals */}
      <div className={`hud-glass corner absolute bottom-5 left-5 w-[300px] rounded-md px-4 py-3 transition ${statusPulse ? "ring-2 ring-amber" : ""}`}>
        <Bar icon={<Heart size={14} />} label="Health" value={g.health} color="var(--health)" />
        <Bar icon={<Zap size={14} />} label="Stamina" value={g.stamina} color="var(--stamina)" boosted={g.boostUntil > now} />
        <Bar icon={<Utensils size={14} />} label="Hunger" value={g.hunger} color="var(--hunger)" />
        <Bar icon={<Droplets size={14} />} label="Thirst" value={g.thirst} color="var(--thirst)" />
      </div>

      {/* Bottom-right: item + supplies */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
        <div className="hud-glass flex gap-1.5 rounded-md p-1.5">
          {Object.entries(g.inventory).map(([k, n]) => (
            <div key={k} className={`hud-text flex w-[62px] flex-col items-center rounded px-1 py-1 text-center ${n ? "bg-white/[0.06]" : "opacity-40"}`}>
              <span className="text-[17px] font-bold leading-none">{n}</span>
              <span className="text-[10px] font-semibold uppercase leading-tight text-ink-2">{k.replace("Canned ", "").replace(" bottle", "").replace("Energy ", "")}</span>
            </div>
          ))}
          <div className="hud-text flex w-[54px] flex-col items-center rounded bg-white/[0.06] px-1 py-1">
            <span className="text-[17px] font-bold leading-none">{g.wood}</span>
            <span className="text-[10px] font-semibold uppercase text-ink-2">Wood</span>
          </div>
        </div>
        <div className="hud-glass corner flex min-w-[260px] items-center gap-4 rounded-md px-4 py-3">
          <span className="text-amber">{ITEM_ICON[g.holding]}</span>
          <div className="flex-1">
            <div className="hud-text text-[11px] font-bold uppercase text-ink-3">In hand</div>
            <div className="hud-text text-[22px] font-bold uppercase leading-none">{g.holding}</div>
          </div>
          {g.holding === "Pistol" && (
            <div className="hud-text text-right leading-none">
              <span className={`text-[34px] font-bold tabular-nums ${g.mag === 0 ? "text-health" : ""}`}>{g.mag}</span>
              <span className="text-[18px] text-ink-3"> / {g.reserve}</span>
            </div>
          )}
          {g.holding === "Flashlight" && <span className={`hud-text text-[14px] font-bold uppercase ${g.flashlightOn ? "text-amber" : "text-ink-3"}`}>{g.flashlightOn ? "On" : "Off"}</span>}
        </div>
      </div>

      <Toasts />
      <VoiceBar last={last} />
      {g.holding === "Map" && <MapOverlay />}
      {!g.locked && g.started && !g.typing && <Paused onResume={onResume} />}
    </div>
  );
}

function Bar({ icon, label, value, color, boosted }: { icon: React.ReactNode; label: string; value: number; color: string; boosted?: boolean }) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="hud-text flex items-center gap-1.5 text-[12px] font-bold uppercase">
        <span style={{ color }}>{icon}</span>
        <span className="text-ink-2">{label}</span>
        {boosted && <span className="text-[10px] text-stamina">Boost</span>}
        <span className="ml-auto tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="mt-0.5 flex h-[7px] gap-[2px]">
        {Array.from({ length: 20 }, (_, i) => (
          <span key={i} className="flex-1 rounded-[1px] transition-colors duration-500" style={{ background: i < Math.round(value / 5) ? color : "rgba(255,255,255,.1)", opacity: i < Math.round(value / 5) ? 0.55 + (i / 20) * 0.45 : 1 }} />
        ))}
      </div>
    </div>
  );
}

const dir = new THREE.Vector3();

function Compass() {
  const [yaw, setYaw] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cam = (window as unknown as { __wwCamera?: THREE.Camera }).__wwCamera;
      if (cam) {
        cam.getWorldDirection(dir);
        setYaw((Math.atan2(dir.x, -dir.z) * 180) / Math.PI);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const marks = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return (
    <div className="hud-glass relative h-8 w-[300px] overflow-hidden rounded-md">
      <div className="absolute inset-y-0 left-1/2 w-px bg-amber" />
      {Array.from({ length: 24 }, (_, i) => {
        const deg = i * 45 - 360;
        let d = deg - yaw;
        d = ((d + 540) % 360) - 180;
        if (Math.abs(d) > 80) return null;
        return (
          <span key={i} className={`hud-text absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] font-bold ${marks[((i % 8) + 8) % 8].length === 1 ? "text-ink" : "text-ink-3"}`} style={{ left: `${50 + (d / 160) * 100}%` }}>
            {marks[((i % 8) + 8) % 8]}
          </span>
        );
      })}
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const tone = { info: "border-white/25", good: "border-stamina", warn: "border-hunger", jev: "border-jev" };
  return (
    <div className="absolute right-5 top-[150px] flex w-[320px] flex-col items-end gap-1.5">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className={`hud-glass hud-text rounded-sm border-l-[3px] px-3 py-1.5 text-[15px] font-semibold ${tone[t.tone]}`}>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function VoiceBar({ last }: { last?: Logged }) {
  const { listening, interim, thinking, typing } = useGame();
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (typing) input.current?.focus();
  }, [typing]);
  const fired = last?.executed.filter((e) => !e.suppressed) ?? [];

  return (
    <div className="absolute bottom-6 left-1/2 w-[min(640px,calc(100vw-700px))] min-w-[360px] -translate-x-1/2">
      <div className="hud-glass corner pointer-events-auto rounded-md px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (listening ? stopListening() : startListening())}
            disabled={!speechSupported()}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${listening ? "bg-ember text-white" : "bg-white/10 text-ink-2"} disabled:opacity-40`}
            aria-label={listening ? "Stop listening" : "Start listening"}
          >
            {listening ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <div className="min-w-0 flex-1">
            {typing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runCommand(draft, "typed");
                  setDraft("");
                  useGame.setState({ typing: false });
                }}
              >
                <input
                  ref={input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && useGame.setState({ typing: false })}
                  placeholder="Type a command, e.g. “make it night and bring out my torch”"
                  className="hud-text w-full bg-transparent text-[18px] font-semibold text-ink outline-none placeholder:text-ink-3"
                />
              </form>
            ) : (
              <div className="hud-text truncate text-[18px] font-semibold">
                {interim ? (
                  <span>“{interim}”</span>
                ) : last ? (
                  <span className="text-ink-2">“{last.text}”</span>
                ) : (
                  <span className="text-ink-3">{speechSupported() ? (listening ? "Listening… try “make it rain”" : "Click the mic, or press T to type") : "Press T to type a command (speech needs Chrome)"}</span>
                )}
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {thinking ? (
                <span className="hud-text flex items-center gap-1.5 text-[13px] font-bold uppercase text-jev">
                  <span className="eq flex h-3 items-end gap-[2px]">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="w-[3px] rounded-full bg-jev" style={{ height: 12, animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </span>
                  Jev is thinking
                </span>
              ) : last ? (
                <>
                  <span className="hud-text text-[12px] font-bold uppercase text-jev">Jev · {last.latencyMs} ms</span>
                  {fired.length ? (
                    fired.map((e) => (
                      <span key={e.category + e.label} className="hud-text rounded-sm bg-jev/20 px-1.5 py-0.5 text-[12.5px] font-bold uppercase text-ink">
                        {e.category}: {e.label}
                      </span>
                    ))
                  ) : (
                    <span className="hud-text text-[12.5px] font-semibold text-ink-3">no command</span>
                  )}
                </>
              ) : (
                <span className="hud-text flex items-center gap-1.5 text-[12px] font-semibold uppercase text-ink-3">
                  <Keyboard size={12} /> T type · Tab Jev brain · Esc pause
                </span>
              )}
            </div>
          </div>
          {listening && (
            <span className="eq flex h-6 items-end gap-[3px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="w-[3px] rounded-full bg-ember" style={{ height: 24, animationDelay: `${i * 0.1}s` }} />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MapOverlay() {
  const [pos, setPos] = useState({ x: 0, z: 0, yaw: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const cam = (window as unknown as { __wwCamera?: THREE.Camera }).__wwCamera;
      if (!cam) return;
      cam.getWorldDirection(dir);
      setPos({ x: cam.position.x, z: cam.position.z, yaw: Math.atan2(dir.x, -dir.z) });
    }, 100);
    return () => clearInterval(id);
  }, []);
  const S = 1.4; // px per metre
  const P = (x: number) => 210 + x * S;
  return (
    <motion.div initial={{ opacity: 0, y: 30, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -1 }} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[58%]">
      <svg width="420" height="420" viewBox="0 0 420 420" className="rounded-md shadow-2xl" style={{ background: "#d9c79a" }}>
        <defs>
          <pattern id="paper" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill="#b9a273" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="420" height="420" fill="url(#paper)" />
        {Array.from({ length: 9 }, (_, i) => (
          <circle key={i} cx={210} cy={210} r={40 + i * 22} fill="none" stroke="#a88e5c" strokeWidth={0.8} opacity={0.5} />
        ))}
        <circle cx={P(LAKE.x)} cy={P(LAKE.z)} r={LAKE.r * S} fill="#5d8aa0" opacity={0.85} />
        <text x={P(LAKE.x)} y={P(LAKE.z)} textAnchor="middle" fontSize={12} fill="#1e3a4a" fontFamily="serif" fontStyle="italic">
          Stillwater
        </text>
        <rect x={P(CABIN.x) - 7} y={P(CABIN.z) - 5} width={14} height={10} fill="#6b4a2f" />
        <text x={P(CABIN.x)} y={P(CABIN.z) - 9} textAnchor="middle" fontSize={11} fill="#3b2a1a" fontFamily="serif">
          Cabin
        </text>
        <circle cx={P(CAMPFIRE.x)} cy={P(CAMPFIRE.z)} r={4} fill="#c2410c" />
        <text x={P(CAMPFIRE.x) + 8} y={P(CAMPFIRE.z) + 4} fontSize={11} fill="#7c2d12" fontFamily="serif">
          Camp
        </text>
        <g transform={`translate(${P(pos.x)} ${P(pos.z)}) rotate(${(pos.yaw * 180) / Math.PI})`}>
          <path d="M0 -9 L6 7 L0 3 L-6 7 Z" fill="#b91c1c" stroke="#fff" strokeWidth={1} />
        </g>
        <text x={14} y={24} fontSize={18} fill="#3b2a1a" fontFamily="serif" fontWeight="bold">
          Wildwood Valley
        </text>
        <text x={398} y={404} textAnchor="end" fontSize={10} fill="#5b4630" fontFamily="serif">
          Say “put the map away”
        </text>
      </svg>
    </motion.div>
  );
}

function Paused({ onResume }: { onResume: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px]">
      <div className="text-center">
        <div className="font-title text-[64px] leading-none tracking-wide text-amber">Paused</div>
        <button onClick={onResume} className="hud-text mt-5 rounded-sm bg-amber px-8 py-3 text-[18px] font-bold uppercase text-black hover:brightness-110">
          Resume
        </button>
        <div className="hud-text mt-4 text-[15px] font-semibold text-ink-2">Voice keeps working while paused. Press T to type a command.</div>
        <div className="mt-8">
          <PowerPicker />
        </div>
      </div>
    </div>
  );
}
