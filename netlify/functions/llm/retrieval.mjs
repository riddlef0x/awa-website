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
//
// LAUNCH-GATE AMENDMENT (4 Sep 2026, Oksana — ep3-memory defect, event
// 585083c3 + diagnosis 0ebf7ebc): flat +1 word-overlap let generic words
// ("agent", "when", "out") outrank the exact topic word. For "runs out of
// memory" the corpus's own answer (ep3 @19:25, "you can't increase that
// persistent memory — it's like a limit, and it's hard") scored below four
// generic excerpts and never reached the model, which then honestly denied
// covering the episode it was citing. Scoring is now rare-word weighted:
//   - BM25 idf over the live index: a "memory" hit (df 5/87) outweighs an
//     "agent" hit (df 45/87) by ~4x by design;
//   - shallow stem tolerance (running→run, memories→memory, runs→run);
//   - a small PINNED synonym map for visitor words the show never uses
//     (context→memory). Matching only — the model still answers exclusively
//     from excerpt text. Extending the map = reviewed commit, never runtime.
export const TOP_K = 4;
// BM25-scored: 0.5 ≈ the old "any single content-word overlap grounds"
// semantics (a lone average-term match scores ~0.5-1.1); zero overlap is
// still 0 → empty → no-grounding.
export const SCORE_THRESHOLD = 0.5;

// BM25 constants (4 Sep 2026, ep3-memory launch gate amendment).
// Standard graded idf — corpus-ubiquitous terms ("agent" df 45/87) shrink to
// ~0.66 while topical ones ("memory" df 5/87) reach ~2.8 — a hard skip was
// tried and rejected: at ratio 0.25 it killed "harness" (df 26) and emptied
// G1 "What is an AI harness?", the shadow set's flagship grounded question.
const K1 = 1.2; // term-frequency saturation
const B = 0.75; // length normalization strength

// "when/happens/out" added 4 Sep 2026 (ep3-memory gate): bare function words
// the original set missed — "when" sat in 33% of the corpus and out-scored
// topical terms by pile-up on long excerpts.
const STOPWORDS = new Set(["the", "a", "an", "of", "to", "is", "are", "was", "were", "be", "been", "am", "it", "its", "in", "on", "at", "and", "or", "for", "with", "what", "how", "who", "whats", "when", "happens", "happen", "out", "do", "does", "did", "me", "my", "your", "you", "this", "that", "they", "them", "their", "we", "us", "our", "so", "if", "will", "can", "get", "got", "about", "like", "just", "really", "some", "any"]);

export function tokenize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Shallow, deterministic stems. No lexicon beyond the suffix rules below —
// predictability beats coverage (a wrong stem can only widen matching, and
// the model still answers from the excerpts themselves).
function stemVariants(t) {
  const v = [t];
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) v.push(t.slice(0, -1));
  if (t.length > 5 && t.endsWith("ing")) {
    const base = t.slice(0, -3);
    v.push(base.length > 2 && base[base.length - 1] === base[base.length - 2] ? base.slice(0, -1) : base);
  }
  if (t.length > 4 && t.endsWith("ies")) v.push(t.slice(0, -3) + "y");
  return v;
}

// Pinned vocabulary map (v1, hand-audited 4 Sep 2026 against the shadow set):
// values are corpus words that mean the same thing to a visitor.
const SYNONYMS = {
  context: ["memory"],
  forget: ["memory", "decay"],
  forgets: ["memory", "decay"],
  forgetting: ["memory", "decay"],
  forgetful: ["memory", "decay"],
  remembers: ["memory"],
  remembering: ["memory"],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Returns up to topK excerpts, highest score first. Score per excerpt =
// sum over question tokens of the weight of the RAREST corpus term the token
// matched (stem/synonym variants collapse to one contribution — no
// double-counting). Threshold 1 keeps short questions ("what is a harness?")
// workable; a zero-overlap question still yields an empty set, which the
// wiring treats as no-grounding.
export function retrieve(question, excerpts, { topK = TOP_K, threshold = SCORE_THRESHOLD } = {}) {
  const q = String(question).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const rawTokens = [...new Set(tokenize(q))];
  if (!rawTokens.length || !excerpts.length) return [];

  const tokenTerms = rawTokens.map((t) => {
    const terms = new Set();
    for (const v of stemVariants(t)) {
      terms.add(v);
      for (const s of SYNONYMS[v] || []) terms.add(s);
    }
    return [...terms];
  });
  const allTerms = [...new Set(tokenTerms.flat())];
  const regexes = new Map(allTerms.map((t) => [t, new RegExp(`\\b${escapeRe(t)}\\b`)]));

  const hays = excerpts.map((e) => `${e.section || ""} ${e.text || ""}`.toLowerCase());

  // df + term frequency over THIS index (the corpus is small and
  // build-pinned, so recomputing per call is cheap and keeps the function
  // pure — no cached state).
  const df = new Map(allTerms.map((t) => [t, 0]));
  const tf = new Map(allTerms.map((t) => [t, []])); // tf[t][excerptIndex]
  hays.forEach((hay, i) => {
    for (const t of allTerms) {
      const m = hay.match(new RegExp(`\\b${escapeRe(t)}\\b`, "g"));
      const n = m ? m.length : 0;
      if (n > 0) {
        df.set(t, df.get(t) + 1);
        tf.get(t)[i] = n;
      }
    }
  });

  // Standard BM25 idf: graded, never zero — rare terms dominate, generic
  // ones fade instead of vanishing (the hard-skip lesson above).
  const N = excerpts.length;
  const idf = (t) => Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));

  // tf-saturation + length normalization (BM25-shaped): a long excerpt must
  // not out-score a precise one by matching generic words at sheer length.
  // The ep3-memory defect: after the excerpt cap rose, a 3.1K-char section
  // beat the 2.7K-char wall section on generic "when/agent/out" pile-ups.
  const wordCount = hays.map((h) => h.split(/\s+/).length);
  const avgLen = wordCount.reduce((a, b) => a + b, 0) / N;

  const scored = [];
  for (let i = 0; i < excerpts.length; i++) {
    let score = 0;
    for (const terms of tokenTerms) {
      let best = 0;
      for (const t of terms) {
        const f = tf.get(t)[i];
        if (!f) continue;
        const sat = (f * (K1 + 1)) / (f + K1 * (1 - B + B * (wordCount[i] / avgLen)));
        best = Math.max(best, idf(t) * sat);
      }
      score += best;
    }
    if (score < threshold) continue;
    scored.push({ excerpt: excerpts[i], score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.excerpt);
}
