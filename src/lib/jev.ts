import "server-only";

/** TypeSafe Jev — System One API client (https://docs.typesafe.ai/api). */
export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
/** Input tokens only; output tokens are free. https://docs.typesafe.ai/models */
export const JEV_USD_PER_MTOK = 0.042;

export type ChoiceQuestion = { type: "choice"; instructions: unknown; criteria: Record<string, unknown> };
export type ScoreQuestion = { type: "score"; instructions: unknown; criteria: unknown[] };
export type NoulQuestion = { type: "noul"; instructions: unknown; criteria?: { true?: unknown; false?: unknown } };
export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export type ChoiceAnswer = { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number };
export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};
export type NoulAnswer = { type: "noul"; noul: number };
export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export type JevResult = {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
  request: { model: string; state: unknown; questions: Record<string, Question> };
};

export function hasJevKey() {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

export async function askJev(state: unknown, questions: Record<string, Question>): Promise<JevResult> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY is not set");
  const request = { model: JEV_MODEL, state, questions };

  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    let res: Response;
    try {
      res = await fetch(JEV_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        // Jev normally answers in well under a second; a stuck request is retried rather than waited on.
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
    } catch (err) {
      if (attempt < 2) continue;
      throw err;
    }
    const latencyMs = Math.round(performance.now() - started);

    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Jev ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    return { ...json, latencyMs, request };
  }
}

export function costUsd(inputTokens: number) {
  return (inputTokens / 1_000_000) * JEV_USD_PER_MTOK;
}

export function choice(a: Answer | undefined): ChoiceAnswer {
  if (!a || a.type !== "choice") throw new Error("Expected a choice answer");
  return a;
}
export function score(a: Answer | undefined): ScoreAnswer {
  if (!a || a.type !== "score") throw new Error("Expected a score answer");
  return a;
}
export function noul(a: Answer | undefined): number {
  if (!a || a.type !== "noul") throw new Error("Expected a noul answer");
  return a.noul;
}
