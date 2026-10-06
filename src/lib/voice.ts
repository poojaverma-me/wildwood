"use client";

import { applyDecision, type Executed } from "./apply";
import { sfx } from "./audio";
import type { Decision } from "./commands";
import { useGame } from "./store";

export type Logged = Decision & { executed: Executed[]; at: number; source: "voice" | "typed" };

/** Send what the player said to Jev, then let code apply the typed answers. */
export async function runCommand(text: string, source: "voice" | "typed") {
  const g = useGame.getState();
  const clean = text.trim();
  if (!clean) return;
  sfx.voice();
  g.set({ thinking: true, interim: clean });
  try {
    const res = await fetch("/api/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: clean,
        game: { weather: g.weather, time: timeLabel(g.hour), holding: g.holding, campfire: g.campfire, flashlightOn: g.flashlightOn, health: g.health },
      }),
    });
    const d = (await res.json()) as Decision;
    if (d.error) throw new Error(d.error);
    const executed = applyDecision(d);
    const logged: Logged = { ...d, executed, at: Date.now(), source };
    useGame.setState((s) => ({ decisions: [logged, ...s.decisions].slice(0, 30) }));
  } catch (err) {
    g.toast(`Jev unavailable: ${err instanceof Error ? err.message : err}`, "warn");
  } finally {
    useGame.setState({ thinking: false });
    setTimeout(() => useGame.getState().interim === clean && useGame.setState({ interim: "" }), 2500);
  }
}

export function timeLabel(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 9) return "Sunrise";
  if (h >= 9 && h < 17) return "Midday";
  if (h >= 17 && h < 20) return "Sunset";
  return "Night";
}

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function speechSupported() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

let rec: Rec | null = null;
let wanted = false;

/** Always-on listening while the mic is enabled; each finished phrase becomes a command. */
export function startListening() {
  if (!speechSupported() || rec) return;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const R = (w.SpeechRecognition ?? w.webkitSpeechRecognition)!;
  rec = new R();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  wanted = true;
  rec.onresult = (e) => {
    let live = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) void runCommand(r[0].transcript, "voice");
      else live += r[0].transcript;
    }
    if (live) useGame.setState({ interim: live });
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed") {
      wanted = false;
      useGame.getState().toast("Microphone blocked. Press T to type commands instead.", "warn");
    }
  };
  rec.onend = () => {
    // Chrome stops after silence; keep listening while the mic is on.
    if (wanted && rec) {
      try {
        rec.start();
        return;
      } catch {}
    }
    rec = null;
    useGame.setState({ listening: false });
  };
  try {
    rec.start();
    useGame.setState({ listening: true });
  } catch {
    rec = null;
  }
}

export function stopListening() {
  wanted = false;
  rec?.stop();
  rec = null;
  useGame.setState({ listening: false, interim: "" });
}
