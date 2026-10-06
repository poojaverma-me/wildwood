"use client";

import { motion } from "framer-motion";
import { Check, Minus, X } from "lucide-react";
import { CATEGORIES } from "@/lib/commands";
import type { Logged } from "@/lib/voice";

/** The speculative fan-out for one utterance: five gates, five speculative picks, one status check. */
export default function Inspector({ d, large }: { d?: Logged | null; large?: boolean }) {
  if (!d)
    return (
      <div className={`hud-glass rounded-md p-5 ${large ? "" : "w-[400px]"}`}>
        <div className="hud-text text-[15px] font-bold uppercase text-jev">Jev brain</div>
        <p className="mt-2 text-[14px] text-ink-2">Say or type a command. Every phrase becomes one request with 19 typed questions, answered in parallel.</p>
      </div>
    );
  // A category is shown as suppressed only if none of its options ran.
  const suppressed = new Set(d.executed.filter((e) => e.suppressed && !d.executed.some((x) => x.id === e.id && !x.suppressed)).map((e) => e.id));
  return (
    <div className={`hud-glass thin-scroll overflow-y-auto rounded-md p-4 ${large ? "" : "max-h-[calc(100vh-160px)] w-[420px]"}`}>
      <div className="flex items-baseline justify-between">
        <div className="hud-text text-[15px] font-bold uppercase text-jev">Jev brain</div>
        <div className="font-mono text-[11px] text-ink-3">
          1 request · {d.questions} questions · {d.latencyMs} ms · {d.inputTokens.toLocaleString()} tok
        </div>
      </div>
      <div className="hud-text mt-2 text-[20px] font-semibold">“{d.text}”</div>
      <div className="mt-3 space-y-2">
        {d.gates.map((gate, i) => {
          const cat = CATEGORIES.find((c) => c.id === gate.id)!;
          const top = Object.entries(gate.probs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, gate.multi ? 5 : 3);
          const sup = suppressed.has(gate.id);
          const live = gate.fired && !sup;
          return (
            <motion.div key={gate.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className={`rounded-md p-3 ${live ? "bg-jev/15 ring-1 ring-jev/50" : "bg-white/[0.04]"}`}>
              <div className="flex items-center gap-2">
                <span className={`grid h-5 w-5 place-items-center rounded-full ${live ? "bg-jev text-black" : sup ? "bg-hunger/70 text-black" : "bg-white/10 text-ink-3"}`}>
                  {live ? <Check size={12} strokeWidth={3} /> : sup ? <Minus size={12} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                </span>
                <span className="hud-text text-[14px] font-bold uppercase">{gate.label}</span>
                <span className="ml-auto font-mono text-[11px] text-ink-3">gate p = {gate.p.toFixed(2)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full" style={{ background: gate.fired ? "var(--jev)" : "rgba(255,255,255,.35)" }} initial={{ width: 0 }} animate={{ width: `${gate.p * 100}%` }} />
              </div>
              <div className="mt-1 text-[11.5px] text-ink-3">noul · “{cat.ask}”</div>
              <div className={`mt-2 space-y-1 ${live ? "" : "opacity-45"}`}>
                <div className="text-[11.5px] text-ink-3">{gate.multi ? `speculative yes/no per option · “${cat.question}”` : `speculative choice · “${cat.question}”`}</div>
                {top.map(([label, p], k) => (
                  <div key={label} className="grid grid-cols-[1fr_90px_36px] items-center gap-2 text-[12.5px]">
                    <span className={k === 0 ? "font-semibold" : "text-ink-2"}>{label}</span>
                    <div className="h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-amber" style={{ width: `${p * 100}%` }} />
                    </div>
                    <span className="text-right font-mono text-[11px] text-ink-3">{Math.round(p * 100)}%</span>
                  </div>
                ))}
              </div>
              {sup && <div className="mt-1.5 text-[11.5px] text-hunger">Ignored by a game rule: another command fired.</div>}
            </motion.div>
          );
        })}
        <div className={`flex items-center gap-2 rounded-md p-3 ${d.status >= 0.5 ? "bg-jev/15 ring-1 ring-jev/50" : "bg-white/[0.04]"}`}>
          <span className="hud-text text-[14px] font-bold uppercase">Status check</span>
          <span className="ml-auto font-mono text-[11px] text-ink-3">p = {d.status.toFixed(2)}</span>
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
        Speculative fan-out: every category is asked at once, including ones that turn out irrelevant. Code runs each gate above 0.5. Supplies and
        world actions get one yes/no per option, so “a bandage and some water” uses both, with no splitting step.
      </p>
    </div>
  );
}
