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
// Exported (two-agent spec §S1.4): the same stack gates client-supplied
// thread history, both roles, per turn.
export const INJECTION_ARTIFACT_PATTERNS = [
  /ignore (all |any |the )?(previous|prior|above) (instructions|prompts?|rules?)/i,
  /system prompt/i,
  /you are now\b/i,
  /disregard .{0,20}(instructions|rules)/i,
];

// Citation-material tie filter — PER-CLAIM IDF MATERIAL TIE (F-NEW-2).
// History: 17 Sep Class B provenance ruling (whole-answer token overlap >= 2);
// polarity amended by the joint Oksana/Zar F-NEW-1 ruling (never-empty
// guarantee dead); F-NEW-1 added the decline short-circuit. Kaeo's battery +
// Yoshi's reproduction (17 Sep ~23:2xZ) proved the token-overlap proxy admits
// GLUE PADS: excerpts sharing generic vocabulary with the answer ("month",
// "twin", "before") enter top-K citations while carrying no material for any
// attributed claim — the same visitor-facing family as the ep-4 defect.
//
// RULING OF RECORD (Oksana consolidation `6150aced`, mechanism per her
// `c7ea6678` §3; Zar concurrence `8379caaf`-era standard): a citation
// survives only if it carries material for a claim the served answer
// attributes — the tie evaluated PER CLAIM against the claim's identifying
// vocabulary (entities, numbers, named models, domain nouns), weighted by
// BM25 idf over the live index so generic tokens cannot pile up into
// admission. Threshold raise alone was REJECTED; marking (generator-side)
// was considered and REJECTED — verification must be generator-independent.
// Mechanism picked over the marking shape because the filter tie is
// mechanical, deterministic, and replay-stable per (answer, index) pair.
//
// Shipped mechanics (implementation inside the ruled acceptance bar):
//   1. The answer splits into claims (sentence/line units; speaker prefixes
//      stripped — they are chrome, not claim vocabulary).
//   2. Exclusion spans ("we've never talked about X", "we haven't covered X")
//      are suppressed from a claim's vocabulary — the F-NEW-1 self-phrasing
//      principle (Jupiter defect) applied at claim level: a negative claim
//      attributes nothing, so the excluded topic's tokens must not tie its
//      own excerpt into the citations.
//   3. A citation survives iff SOME claim shares tokens with the excerpt
//      whose idf sum >= MATERIAL_TIE_MIN. Polarity is fail-CLOSED: strip on
//      doubt; fewer citations, never decorative chrome.
//   4. Fully-stripped claim-bearing compositions are NOT rerouted —
//      validateAnswer's claim-bearing class rejects the empty set and the
//      handler throws to the scripted fallback tier (Oksana routing
//      correction `f30b3047` §2; shipped fail-closed does the work).
//
// CALIBRATION (17 Sep, first-party against the live 81-excerpt index and the
// three real probe compositions of record — Kaeo token-bill, Yoshi claim-opus,
// Kaeo horse/raising partial): keep-set scores 9.42..29.91, pad-set scores
// 2.90..7.81. MATERIAL_TIE_MIN = 8.5 separates with ~0.7..1.6 idf units of
// margin on each side. This is a calibrated constant, not a derived one: the
// battery's stability legs (identical served sets across runs) and red
// fixtures police it; if a leg flakes, this ONE constant is the dial.
export const MATERIAL_TIE_MIN = 8.5;

// Exclusion spans: the negative-claim phrasings whose OBJECT tokens never
// enter tie vocabulary. Scoped to the span up to a clause break ("but",
// "however", sentence end) so the pivot half of a partial answer keeps its
// own vocabulary.
const EXCLUSION_SPANS = [
  /never\s+(?:talked|spoke)\s+about\s+[^.?!]*?(?=\s*,?\s*(?:but|however)\b|[.?!]|$)/gi,
  /haven'?t\s+covered\s+[^.?!]*?(?=\s*,?\s*(?:but|however)\b|[.?!]|$)/gi,
  /\bnot\s+covered\b[^.\n]*?\bon the show\b/gi,
];

const SPEAKER_PREFIX = /^(Robin|Tobi)-twin:\s*/;

// Splits a composed answer into claims: blank-line and sentence boundaries,
// speaker prefixes stripped. Exported for the seam tests.
export function splitClaims(answer) {
  return String(answer)
    .split(/\n\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(SPEAKER_PREFIX, "").trim())
    .filter(Boolean);
}

// A claim's tie vocabulary: tokens minus exclusion-span content minus glue.
export function claimVocabulary(claim, ignoreTokens) {
  let c = claim;
  for (const re of EXCLUSION_SPANS) c = c.replace(re, " ");
  return [...new Set(tokenize(c))].filter((t) => !(ignoreTokens && ignoreTokens.has(t)));
}

// BM25 idf over a corpus of excerpts — the retrieval side's own primitive,
// reused here so the tie weight and the ranking weight agree by construction
// (rare terms dominate; generic ones fade). Returns { idf, df } — ask.mjs
// derives its UBIQUITOUS glue set from the same df pass.
export function buildIdf(excerpts) {
  const df = new Map();
  for (const e of excerpts) {
    for (const t of new Set(tokenize((e && e.text) || ""))) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = excerpts.length;
  const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
  return { idf, df };
}

export function isHonestDecline(answer) {
  if (typeof answer !== "string") return false;
  return /\bhaven'?t\s+covered\b/i.test(answer) || /\bnot\s+covered\b[^.\n]*\bon the show\b/i.test(answer);
}

export function materialCitations({ answer, excerpts, citations, ignoreTokens, idf, tieMin = MATERIAL_TIE_MIN }) {
  if (isHonestDecline(answer)) return []; // decline class: zero, regardless of string overlap (self-phrasing never fabricates relevance)
  if (!Array.isArray(citations) || citations.length === 0) return [];
  if (typeof idf !== "function") {
    throw new Error("materialCitations: idf function required — the per-claim tie is corpus-weighted by ruling");
  }
  const claimVocabs = splitClaims(answer).map((c) => claimVocabulary(c, ignoreTokens));
  const kept = [];
  excerpts.forEach((e, i) => {
    if (!citations[i]) return;
    const exTokens = new Set(tokenize((e && e.text) || ""));
    const survives = claimVocabs.some((v) => {
      let score = 0;
      for (const t of v) if (exTokens.has(t)) score += idf(t);
      return score >= tieMin;
    });
    if (survives) kept.push(citations[i]);
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

// ---- P2-3 general-knowledge brain (build spec §A.3/§A.4, spec of record
// sha c1ca7c7f…) — ADDITIVE validator for the general path only. The grounded
// path's validateAnswer above is untouched (the §S2 snapshot legs hold).
// General-knowledge turns carry NO citations by construction (never attach
// episode provenance to non-grounded content), so the claim-bearing citation
// polarity does not apply; the mechanical rails it reuses are the SAME
// exported pattern sets the grounded gate runs. Em-dash ban is enforced
// MECHANICALLY here (prompt rule + hard gate) — the new surface is a larger
// attack and drift surface, and the standing em workstream's standard for
// LLM output is zero em dashes on the wire.
const EM_DASH_PATTERNS = [/—/, /&mdash;/i, /&#8212;/, /&#x2014;/i];

export function validateGeneralAnswer({ answer }) {
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
  for (const re of BIO_FACT_PATTERNS) {
    if (re.test(answer)) return { ok: false, reason: "bio-fact-without-source" };
  }
  for (const re of INJECTION_ARTIFACT_PATTERNS) {
    if (re.test(answer)) return { ok: false, reason: "injection-artifact" };
  }
  for (const re of EM_DASH_PATTERNS) {
    if (re.test(answer)) return { ok: false, reason: "em-dash" };
  }
  return { ok: true, reason: null };
}
