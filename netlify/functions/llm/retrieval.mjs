// Retrieval scoring — Twins Phase B wiring (docs/AWA_TWINS_PHASE_B_ARCH_SPEC.md §5).
// Pure function: question + excerpt index in, top-K excerpts out. Zero I/O,
// zero keys, fully unit-testable. Lexical matching only (same normalize /
// STOPWORDS discipline as the scripted matcher in ask.mjs) — no embeddings,
// no network, no second provider.
//
// Grounding discipline (§5): the LLM only ever sees excerpts from the repo
// corpus. If nothing in the corpus matches the question (score 0), we return
// an empty set and the wiring NEVER calls the provider — no grounding → no
// LLM answer, and no spend on questions the corpus cannot cover.

export const TOP_K = 4;
export const SCORE_THRESHOLD = 1; // distinct content-word matches required

const STOPWORDS = new Set(["the", "a", "an", "of", "to", "is", "are", "was", "were", "be", "been", "am", "it", "its", "in", "on", "at", "and", "or", "for", "with", "what", "how", "who", "whats", "do", "does", "did", "me", "my", "your", "you", "this", "that", "they", "them", "their", "we", "us", "our", "so", "if", "will", "can", "get", "got", "about", "like", "just", "really", "some", "any"]);

export function tokenize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Returns up to topK excerpts, highest score first, each annotated with its
// match score. Score = distinct content-word overlaps (+1 each). Threshold 1
// keeps short questions ("what is a harness?") workable; a zero-overlap
// question still yields an empty set, which the wiring treats as no-grounding.
export function retrieve(question, excerpts, { topK = TOP_K, threshold = SCORE_THRESHOLD } = {}) {
  const q = String(question).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = [...new Set(tokenize(q))];
  const scored = [];
  for (const e of excerpts) {
    const hay = `${e.section || ""} ${e.text || ""}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?\\b`);
      if (re.test(hay)) score += 1;
    }
    if (score === 0) continue;
    scored.push({ excerpt: e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score >= threshold).slice(0, topK).map((s) => s.excerpt);
}
