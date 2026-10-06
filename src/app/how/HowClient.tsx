"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Inspector from "@/components/hud/Inspector";
import { applyRules } from "./rules";
import type { Decision } from "@/lib/commands";
import type { Logged } from "@/lib/voice";

const EXAMPLES = [
  "make it night and grab my flashlight",
  "let it pour",
  "use a bandage",
  "switch to the axe and make it snow",
  "it's too dark, I can't see anything",
  "how am I doing?",
  "what a beautiful view",
];

// LLM baseline: a function-calling round trip that writes ~60 tokens of JSON.
const LLM_MS = 600 + (60 / 75) * 1000 + 450;

export default function HowClient() {
  const [text, setText] = useState(EXAMPLES[0]);
  const [d, setD] = useState<Logged | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async (t = text) => {
    setBusy(true);
    setText(t);
    const res = await fetch("/api/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: t, game: { weather: "Clear & sunny", time: "Sunset", holding: "Empty hands", campfire: false, flashlightOn: false, health: 58 } }),
    });
    const data = (await res.json()) as Decision;
    if (!data.error) setD({ ...data, executed: applyRules(data), at: Date.now(), source: "typed" });
    setBusy(false);
  };

  const frames = d ? Math.max(1, Math.round(d.latencyMs / 16.7)) : 0;
  const llmFrames = Math.round(LLM_MS / 16.7);

  return (
    <div className="thin-scroll h-full overflow-y-auto bg-[radial-gradient(900px_500px_at_80%_-10%,rgba(167,139,250,.18),transparent),radial-gradient(800px_500px_at_0%_0%,rgba(245,181,68,.12),transparent)]">
      <div className="mx-auto max-w-[1100px] px-6 pb-24 pt-8">
        <Link href="/" className="hud-text inline-flex items-center gap-1.5 text-[14px] font-bold uppercase text-amber">
          <ArrowLeft size={15} /> Back to the valley
        </Link>
        <div className="hud-text mt-6 text-[14px] font-bold uppercase tracking-[0.3em] text-jev">How Jev hears you</div>
        <h1 className="font-title text-[clamp(3rem,7vw,5.5rem)] leading-[0.9] tracking-wide">One sentence. Nineteen questions. One request.</h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">
          Wildwood borrows the pattern from TypeSafe&apos;s smart-home demo: <b>speculative fan-out</b>. Every phrase is checked against every command
          category at once: a yes/no gate per category plus a speculative pick inside it. Plain code then runs whichever gates pass. Compound commands
          work for free, and nothing is generated or parsed.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
          className="hud-glass corner mt-8 flex items-center gap-3 rounded-md p-3"
        >
          <input value={text} onChange={(e) => setText(e.target.value)} className="hud-text min-w-0 flex-1 bg-transparent px-2 text-[20px] font-semibold outline-none" placeholder="Say something to the game…" />
          <button disabled={busy} className="hud-text flex items-center gap-2 rounded-sm bg-jev px-5 py-2.5 text-[16px] font-bold uppercase text-black disabled:opacity-60">
            <Send size={16} /> {busy ? "Asking…" : "Ask Jev"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => void ask(e)} className="hud-text rounded-sm bg-white/[0.07] px-2.5 py-1 text-[14px] font-semibold text-ink-2 hover:text-ink">
              “{e}”
            </button>
          ))}
        </div>

        {d && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
            <Inspector d={d} large />
            <div className="space-y-4">
              <div className="hud-glass corner rounded-md p-4">
                <div className="hud-text text-[13px] font-bold uppercase text-amber">What the game does</div>
                <div className="mt-3 space-y-2">
                  {d.executed.length === 0 && <div className="text-[14px] text-ink-3">Nothing: no gate passed, so the game ignores the phrase.</div>}
                  {d.executed.map((e) => (
                    <div key={e.category + e.label} className={`flex items-center gap-2 text-[15px] ${e.suppressed ? "text-ink-3 line-through" : ""}`}>
                      <ArrowRight size={14} className="text-jev" />
                      <span className="hud-text font-bold uppercase">{e.category}</span>
                      <span>{e.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="hud-glass corner rounded-md p-4">
                <div className="hud-text text-[13px] font-bold uppercase text-amber">Frame budget at 60 fps</div>
                <FrameStrip label={`Jev · ${d.latencyMs} ms`} frames={frames} color="var(--jev)" />
                <FrameStrip label={`LLM function call · ≈ ${(LLM_MS / 1000).toFixed(1)} s (est.)`} frames={llmFrames} color="rgba(245,241,232,.35)" />
                <p className="mt-3 text-[12.5px] text-ink-3">
                  Jev answers in about {frames} frame{frames === 1 ? "" : "s"}; a generated tool call would take roughly {llmFrames} frames, long enough for
                  the moment to pass. Jev also costs ${(d.costUsd * 1000).toFixed(3)} per thousand commands.
                </p>
              </div>
              <details className="hud-glass rounded-md p-4">
                <summary className="hud-text cursor-pointer text-[13px] font-bold uppercase text-amber">The exact request</summary>
                <pre className="thin-scroll mt-3 max-h-[420px] overflow-auto font-mono text-[11px] leading-relaxed text-ink-2">{JSON.stringify(d.request, null, 2)}</pre>
              </details>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function FrameStrip({ label, frames, color }: { label: string; frames: number; color: string }) {
  const shown = Math.min(frames, 120);
  return (
    <div className="mt-3">
      <div className="hud-text text-[13px] font-semibold">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-[2px]">
        {Array.from({ length: shown }, (_, i) => (
          <motion.span key={i} className="h-2.5 w-[5px] rounded-[1px]" style={{ background: color }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.008 }} />
        ))}
      </div>
    </div>
  );
}
