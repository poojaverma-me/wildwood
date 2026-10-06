import { planDecision } from "@/lib/apply";
import type { Decision } from "@/lib/commands";

export const applyRules = (d: Decision) => planDecision(d).map(({ id, category, label, suppressed }) => ({ id, category, label, suppressed }));
