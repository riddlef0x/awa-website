// Response filters — Twins Phase B prep (docs/AWA_TWINS_PHASE_B_ARCH_SPEC.md §5).
// PRE-GATE PREP: pure functions, zero keys, zero egress, fully unit-testable.
// Every LLM answer passes these BEFORE it may reach a visitor; any rejection
// routes to the scripted fallback (no grounding → no answer from the LLM).
import { tokenize } from "./retrieval.mjs";

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

// Citation-material tie filter (17 Sep, Oksana Class B provenance ruling;
// polarity amended by the joint Oksana/Zar F-NEW-1 ruling, 17 Sep 22:5xZ):
// a retrieved excerpt the composed answer does not draw on is a DECORATIVE
// citation — true claim, wrong provenance ("cite the segments that carry the
// material you retell"). Keep only excerpts sharing answer material, using
// the same tokenize discipline as retrieval (stopwords out, stems NOT applied
// here — direct lexical tie only).
//
// Ruled (joint F-NEW-1 ruling, Oksana `626fcdb8` / Zar `97aafdca`): the
// never-empty guarantee is DEAD — an honest empty is a valid return, not a
// defect to hack around. "Citations render ⟺ at least one tie carries
// material for a claim the answer attributes; otherwise zero." Two
// consequences: (1) an HONEST DECLINE attributes nothing to the corpus, so it
// returns [] regardless of string overlap — the decline's own phrasing
// ("we haven't covered … on the show") must never tie-match itself into a
// citation (the Jupiter defect); (2) a claim-bearing answer tied to nothing
// returns [] too, and validateAnswer then rejects it to the scripted
// fallback — no grounding → no LLM answer, fail-closed as always.
export const MATERIAL_MIN_TOKENS = 2;

// F-NEW-1 (Yoshi re-verify finding; RULED — joint Oksana/Zar ruling 17 Sep,
// Oksana `626fcdb8`, Zar `97aafdca`): an llm-tier HONEST DECLINE asserts the
// show never covered the topic. Provenance chrome (citations, "This answer
// comes from Episode N") under that sentence contradicts it — the same
// visitor-facing harm as the ep-4 ruling, one degree starker: the chrome
// asserts exactly what the text denies. Detection is mechanical: the system
// prompt's honest-coverage line is a fixed seam ("we haven't covered that on
// the show yet"). Ruled output shape: decline → citations [] + NO
// episode-attributed handoff; the neutral non-attributing pointer MAY ride
// ("The real version lives in the episodes" — recycled copy, register
// pre-cleared, no voice pass owed); anything naming an episode as the source
// of a decline may not. The general test of record: does the rendered answer
// ATTRIBUTE ANY CLAIM to the corpus? Claims → cite carrying segments only;
// no claims → cite nothing, hand off nothing episode-specific.
export function isHonestDecline(answer) {
  if (typeof answer !== "string") return false;
  return /\bhaven'?t\s+covered\b/i.test(answer) || /\bnot\s+covered\b[^.\n]*\bon the show\b/i.test(answer);
}

export function materialCitations({ answer, excerpts, citations, minTokens = MATERIAL_MIN_TOKENS, ignoreTokens }) {
  if (isHonestDecline(answer)) return []; // decline class: zero, regardless of string overlap (self-phrasing never fabricates relevance)
  if (!Array.isArray(citations) || citations.length === 0) return [];
  const answerTokens = new Set(tokenize(answer));
  const kept = [];
  excerpts.forEach((e, i) => {
    if (!citations[i]) return;
    let shared = 0;
    for (const t of new Set(tokenize((e && e.text) || ""))) {
      if (ignoreTokens && ignoreTokens.has(t)) continue; // corpus glue never decorates a citation
      if (answerTokens.has(t)) shared += 1;
    }
    if (shared >= minTokens) kept.push(citations[i]);
  });
  return kept; // MAY be empty — validateAnswer's class-conditional polarity decides serve vs fallback
}

// validateAnswer polarity is CLASS-CONDITIONAL (joint F-NEW-1 ruling):
//   DECLINE class      → citations MUST be empty (the absence is the assertion)
//   CLAIM-BEARING class → citations MUST be non-empty and every one traces to
//                         a retrieved excerpt (no grounding → no LLM answer)
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
  const decline = isHonestDecline(answer);
  if (decline) {
    if (Array.isArray(citations) && citations.length > 0) {
      return { ok: false, reason: "decline-with-citations" }; // chrome must not assert what the text denies
    }
  } else if (!Array.isArray(citations) || citations.length === 0) {
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
