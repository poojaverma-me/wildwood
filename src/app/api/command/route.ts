import { CATEGORIES, commandQuestions, commandState, type Decision, type GameContext } from "@/lib/commands";
import { askJev, costUsd } from "@/lib/jev";

const GATE = 0.5;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.slice(0, 300).trim() : "";
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });
  const game: GameContext = {
    weather: body.game?.weather ?? "Clear & sunny",
    time: body.game?.time ?? "Sunset",
    holding: body.game?.holding ?? "Empty hands",
    campfire: !!body.game?.campfire,
    flashlightOn: !!body.game?.flashlightOn,
    health: Number(body.game?.health ?? 100),
  };
  try {
    const res = await askJev(commandState(text, game), commandQuestions());
    const a = res.answers;
    const gates = CATEGORIES.map((c) => {
      const gate = a[c.gate];
      const p = gate?.type === "noul" ? gate.noul : 0;
      if (c.multi) {
        const probs = Object.fromEntries(
          Object.keys(c.options).map((opt, i) => {
            const n = a[`${c.pick}_${i}`];
            return [opt, n?.type === "noul" ? n.noul : 0];
          }),
        );
        const ranked = Object.entries(probs).sort((x, y) => y[1] - x[1]);
        const yes = ranked.filter(([, v]) => v >= GATE).map(([k]) => k);
        const choices = yes.length ? yes : [ranked[0][0]];
        return { id: c.id, label: c.label, p, choice: choices[0], choices, multi: true, probs, confidence: ranked[0][1], fired: p >= GATE };
      }
      const pick = a[c.pick];
      const choice = pick?.type === "choice" ? pick : null;
      return { id: c.id, label: c.label, p, choice: choice?.choice ?? "", choices: choice ? [choice.choice] : [], multi: false, probs: choice?.probabilities ?? {}, confidence: choice?.confidence ?? 0, fired: p >= GATE };
    });
    const status = a.wantsStatus?.type === "noul" ? a.wantsStatus.noul : 0;
    const decision: Decision = { text, gates, status, questions: Object.keys(res.request.questions).length, latencyMs: res.latencyMs, inputTokens: res.usage.input_tokens, costUsd: costUsd(res.usage.input_tokens), request: res.request };
    return Response.json(decision);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
