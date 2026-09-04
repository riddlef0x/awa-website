// Response filters — Twins Phase B prep (docs/AWA_TWINS_PHASE_B_ARCH_SPEC.md §5).
// PRE-GATE PREP: pure functions, zero keys, zero egress, fully unit-testable.
// Every LLM answer passes these BEFORE it may reach a visitor; any rejection
// routes to the scripted fallback (no grounding → no answer from the LLM).

export const MAX_ANSWER_CHARS = 640; // §1 contract — hard gate sits ABOVE the 480-char prompt target (length-lottery ruling 2026-09-04)
export const MAX_ANSWER_LINES = 3;   // §1 contract

// Starter bio-fact patterns (§5 biographical-facts rule, response-filter half;
// the prompt-instruction half lives in the system prompt). Kaeo's QA battery
// extends this list — additions are data, not code changes.
const BIO_FACT_PATTERNS = [
  /\b(i|we)\s+(was|were|am|are)\s+(born|from|based in|living in|living at)\b/i,
  /\bmy (wife|husband|partner|age|birthday|address|phone)\b/i,
  /\b(i|we)\s+(was|were|am|are)\s+\d+\s+years? old\b/i,
];

// Visitor-question-is-DATA output filter (§5): the answer must never look like
// it executed an instruction. Starter patterns; Kaeo's probes extend these.
const INJECTION_ARTIFACT_PATTERNS = [
  /ignore (all |any |the )?(previous|prior|above) (instructions|prompts?|rules?)/i,
  /system prompt/i,
  /you are now\b/i,
  /disregard .{0,20}(instructions|rules)/i,
];

export function validateAnswer({ answer, citations, allowedCitations }) {
  if (typeof answer !== "string" || !answer.trim()) {
    return { ok: false, reason: "empty-answer" };
  }
  if (answer.length > MAX_ANSWER_CHARS) {
    return { ok: false, reason: "answer-too-long" };
  }
  const lines = answer.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length > MAX_ANSWER_LINES) {
    return { ok: false, reason: "too-many-lines" };
  }
  if (!Array.isArray(citations) || citations.length === 0) {
    return { ok: false, reason: "no-citations" }; // §5: no grounding → no LLM answer
  }
  const allowed = new Set(allowedCitations.map((c) => JSON.stringify(c)));
  for (const c of citations) {
    if (!allowed.has(JSON.stringify(c))) {
      return { ok: false, reason: "uncited-claim" }; // citation must trace to a retrieved excerpt
    }
  }
  for (const re of BIO_FACT_PATTERNS) {
    if (re.test(answer)) return { ok: false, reason: "bio-fact-without-source" };
  }
  for (const re of INJECTION_ARTIFACT_PATTERNS) {
    if (re.test(answer)) return { ok: false, reason: "injection-artifact" };
  }
  return { ok: true, reason: null };
}
