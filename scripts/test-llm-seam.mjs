// Test harness for the Phase B LLM seam (provider.mjs, filters.mjs,
// provider-mock.mjs, retrieval.mjs, guard.mjs). Zero keys, zero egress —
// fetch is stubbed.
// Run: node scripts/test-llm-seam.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { callProvider } from "../netlify/functions/llm/provider.mjs";
import { validateAnswer, MAX_ANSWER_CHARS, MAX_ANSWER_LINES, materialCitations, isHonestDecline, MATERIAL_TIE_MIN, buildIdf, splitClaims, claimVocabulary } from "../netlify/functions/llm/filters.mjs";
import { mockProvider, FIXTURES } from "../netlify/functions/llm/provider-mock.mjs";
import { retrieve } from "../netlify/functions/llm/retrieval.mjs";
import { createGuard } from "../netlify/functions/llm/guard.mjs";

const ALLOWED = [{ episode: 1, videoId: "abc123", timestamp: "12:34" }];
const EXCERPTS = [{ text: "We argued about whether agents need memory or just better notes.", citation: ALLOWED[0] }];

// 1. Mock "valid" fixture passes all filters.
{
  const { answer, citations } = mockProvider({ fixture: "valid", excerpts: EXCERPTS });
  const v = validateAnswer({ answer, citations, allowedCitations: ALLOWED });
  assert.strictEqual(v.ok, true, `valid fixture must pass: ${v.reason}`);
  console.log("PASS 1: valid answer passes filters");
}

// 2. Every failure fixture is rejected with the right reason.
const EXPECT = {
  "too-long": "answer-too-long",
  "too-many-lines": "too-many-lines",
  "no-citations": "no-citations",
  "uncited": "uncited-claim",
  "bio-fact": "bio-fact-without-source",
  "injection": "injection-artifact",
};
for (const [fx, reason] of Object.entries(EXPECT)) {
  const { answer, citations } = mockProvider({ fixture: fx, excerpts: EXCERPTS });
  const v = validateAnswer({ answer, citations, allowedCitations: ALLOWED });
  assert.strictEqual(v.ok, false, `${fx} must be rejected`);
  assert.strictEqual(v.reason, reason, `${fx}: expected ${reason}, got ${v.reason}`);
}
console.log("PASS 2: all failure fixtures rejected with correct reasons");

// 3. Contract constants match spec §1 (hard gate 640; prompt target stays 480).
assert.strictEqual(MAX_ANSWER_CHARS, 640);
assert.strictEqual(MAX_ANSWER_LINES, 3);
console.log("PASS 3: contract constants match spec (hard gate 640 chars / 3 lines)");

// 3b. Length-gate boundary (length-lottery ruling 2026-09-04): a grounded
// 2-line answer over the 480 prompt target but under the 640 hard gate must
// PASS; one char over the hard gate must still FAIL CLOSED.
{
  const filler = "Grounded banter about the memory wall from Episode 3. ";
  const okAnswer = `Robin-twin: ${filler.repeat(6).slice(0, 299)}\nTobi-twin: ${filler.repeat(6).slice(0, 299)}`; // 2 lines, ~600 chars
  assert.ok(okAnswer.length > 480 && okAnswer.length <= 640, `boundary setup: answer is ${okAnswer.length} chars, must be in (480, 640]`);
  assert.strictEqual(okAnswer.split("\n").length, 2);
  const vOk = validateAnswer({ answer: okAnswer, citations: ALLOWED, allowedCitations: ALLOWED });
  assert.strictEqual(vOk.ok, true, `600-class grounded 2-line answer must pass: ${vOk.reason}`);
  const vOver = validateAnswer({ answer: "x".repeat(641), citations: ALLOWED, allowedCitations: ALLOWED });
  assert.deepStrictEqual(vOver, { ok: false, reason: "answer-too-long" }, "641-char answer must fail closed");
  console.log(`PASS 3b: length gate boundary — ${okAnswer.length}-char grounded 2-line answer passes, 641-char answer fails closed`);
}

// 4. Provider call: aborts on timeout, throws on non-OK, no header leakage.
{
  // 4a. timeout abort (stub honors the AbortSignal like real fetch)
  await assert.rejects(
    callProvider({
      url: "https://pinned.example/v1/ask",
      payload: {},
      timeoutMs: 50,
      fetchImpl: (url, init) => new Promise((_, rej) => {
        init.signal.addEventListener("abort", () => rej(new Error("AbortError")));
      }),
    }),
    (e) => e.message === "AbortError",
    "must abort on timeout",
  );
  // 4b. non-OK
  await assert.rejects(
    callProvider({ url: "https://pinned.example/v1/ask", payload: {}, fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /provider 503/,
  );
  // 4c. fresh request: no inbound headers forwarded — only content-type (+ auth if key given)
  let seen = null;
  const okFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ answer: "ok", usage: null }) };
  };
  const out = await callProvider({ url: "https://pinned.example/v1/ask", payload: { q: "x" }, apiKey: null, fetchImpl: okFetch });
  assert.strictEqual(out.answer, "ok");
  assert.deepStrictEqual(Object.keys(seen.init.headers), ["content-type"], "no key: auth header absent");
  assert.ok(!("referer" in seen.init.headers) && !("user-agent" in seen.init.headers), "no header passthrough");
  assert.strictEqual(JSON.parse(seen.init.body).q, "x", "question verbatim in body");
  console.log("PASS 4: timeout aborts, non-OK throws, request constructed fresh");
}

// 5. Fixtures list is exactly the documented set.
assert.deepStrictEqual([...FIXTURES].sort(), ["bio-fact", "injection", "no-citations", "too-long", "too-many-lines", "uncited", "valid"]);
console.log("PASS 5: fixture registry complete");

// 6. Citation key-order tripwire (Oksana stamp, watch-item 1): citation
// traceability compares via JSON.stringify, so the SAME citation object with
// reordered keys must FAIL CLOSED to the scripted fallback — never a
// wrong-but-passing answer. Pinned here so the behavior cannot drift silently;
// the wiring normalizes key order only if the §8 shadow run shows mass fallback.
{
  const reordered = { timestamp: ALLOWED[0].timestamp, videoId: ALLOWED[0].videoId, episode: ALLOWED[0].episode };
  const { answer } = mockProvider({ fixture: "valid", excerpts: EXCERPTS });
  assert.deepStrictEqual([reordered], [ALLOWED[0]], "sanity: reordered citation carries identical DATA");
  assert.strictEqual(JSON.stringify(reordered) !== JSON.stringify(ALLOWED[0]), true, "sanity: byte-level comparison DOES differ on key order");
  // The real-world shape of this risk: composition code that re-serializes or
  // rebuilds a citation (e.g. provider output parsed back) — identical data,
  // different key order. In the wiring both sides are the same objects from
  // ask-retrieval.json, so exact match holds; this pins the filter's
  // fail-closed behavior if any future composition path rebuilds a citation.
  const v = validateAnswer({ answer, citations: [reordered], allowedCitations: ALLOWED });
  assert.strictEqual(v.ok, false, `key-order permutation must fail closed (got: ${v.ok}, reason ${v.reason})`);
  assert.strictEqual(v.reason, "uncited-claim");
  console.log("PASS 6: key-order permutation fails CLOSED to fallback (pinned)");
}

// 7. Retrieval: grounded question picks the right excerpt; zero overlap
// returns an EMPTY set (the wiring then never calls the provider).
{
  const corpus = [
    { section: "What is a harness", text: "A harness is the connector that connects your data, the agents and the platforms together.", citation: { episode: 1, timestamp: "10:20", videoId: "abc" }, handoff: { episode: 1 } },
    { section: "Local models", text: "Run an LLM locally on your own server for sensitive sovereign data.", citation: { episode: 1, timestamp: "16:36", videoId: "abc" }, handoff: { episode: 1 } },
    { section: "Multiplayer agents", text: "We argued about whether agents need memory or just better notes.", citation: { episode: 2, timestamp: "12:00", videoId: "def" }, handoff: { episode: 2 } },
  ];
  const grounded = retrieve("what is an AI harness for a business?", corpus);
  assert.strictEqual(grounded.length, 1);
  assert.strictEqual(grounded[0].section, "What is a harness");
  const ungrounded = retrieve("who won the football last night?", corpus);
  assert.deepStrictEqual(ungrounded, [], "no corpus overlap → empty set → no provider call");
  console.log("PASS 7: retrieval grounds matching sections; ungrounded questions get an empty set");
}

// 8. Guard (§6 fallback-rate KPI): below sample → never tripped; ≥10 samples
// with >20% fallbacks → tripped; recover-by-hour = new key resets.
{
  const kv = new Map();
  const store = { get: async (k) => kv.get(k) ?? null, setJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); } };
  let t = 1_000 * 3_600_000; // a fixed hour
  const guard = createGuard({ store, now: () => t });
  for (let i = 0; i < 9; i++) await guard.record(true);
  await guard.record(false);
  assert.strictEqual(await guard.tripped(), false, "1/10 fallbacks must not trip");
  await guard.record(false);
  await guard.record(false); // 9 ok / 3 fb = 25% > 20%, sample 12
  assert.strictEqual(await guard.tripped(), true, "25% fallback rate at ≥10 samples must trip");
  t += 3_600_000; // next hour → fresh window
  assert.strictEqual(await guard.tripped(), false, "circuit resets with the hour");
  console.log("PASS 8: fallback-rate circuit trips at the §6 threshold, resets each hour");
}

// 9. Citation-material tie filter — PER-CLAIM IDF MATERIAL TIE (F-NEW-2,
// Oksana consolidation `6150aced`, mechanism `c7ea6678` §3): a citation
// survives only if some CLAIM of the answer shares tokens with the excerpt
// whose BM25-idf sum clears MATERIAL_TIE_MIN. Supersedes the whole-answer
// >=2-token proxy, which admitted glue pads (Kaeo/Yoshi repros 17 Sep).
// Two layers here:
//   (a) REAL-CORPUS fixtures — the calibration of record, replayed against
//       the shipped index and the three real probe compositions every run
//       (Kaeo token-bill / Yoshi claim-opus / Kaeo horse-raising partial);
//   (b) synthetic unit shapes with an explicit small tieMin.
{
  // --- (a) Real-corpus fixtures of record ---
  const idx = JSON.parse(readFileSync(new URL("../netlify/functions/ask-retrieval.json", import.meta.url), "utf8"));
  const { idf, df } = buildIdf(idx.excerpts);
  const N = idx.excerpts.length;
  const UBIQ = new Set([...df].filter(([, n]) => n >= N * 0.1).map(([t]) => t));
  const byKey = new Map(idx.excerpts.map((e) => [`${e.episode} ${e.timestamp}`, e]));
  const citeOf = (key) => byKey.get(key).citation;

  // Fixture 1: Kaeo token-bill composition — pads 1 23:53 (dashboards) and
  // 4 9:13 (bots-in-thread) were served pre-fix; 1 19:54 is the grounded one.
  {
    const q = "How big was the token bill that month?";
    const answer = "Robin-twin: Tobi burnt through $800 on Opus in his first month with OpenClaw – that's the gnarly bill he mentioned before switching his thinking on Chinese models.\n\nTobi-twin: Hey, I learned my lesson fast! Now I'm comfortable with DeepSeek and GLM because the power-to-cost ratio is just better, and my privacy paranoia evened out.";
    const picked = retrieve(q, idx.excerpts, { topK: 4 });
    const citations = picked.map((e) => e.citation);
    const out = materialCitations({ answer, excerpts: picked, citations, ignoreTokens: UBIQ, idf });
    assert.deepStrictEqual(out, [citeOf("1 19:54")], "token-bill fixture: only the grounded $800/Opus excerpt survives; both red pads drop");
    // Determinism (replay leg): same inputs, byte-identical output.
    const out2 = materialCitations({ answer, excerpts: picked, citations, ignoreTokens: UBIQ, idf });
    assert.deepStrictEqual(out2, out, "token-bill fixture: replay is deterministic per (answer, index)");
  }
  // Fixture 2: Yoshi claim-opus composition — 2 9:55 and 1 12:04 are
  // corpus-walk-verified material; 1 23:53 is the red pad.
  {
    const q = "what was the $800 Opus month?";
    const answer = "Robin-twin: That's when I gave my agent Steve full access to Opus and let it rip for three weeks building websites and revamping my finances – burned through $800 because I was using the most expensive frontier model for absolutely everything like an idiot.\n\nTobi-twin: Classic move – you treated Opus like an all-you-can-eat buffet when it's actually Michelin-star pricing per bite. Should've saved it for the hard thinking and used Haiku for grunt work from day one.";
    const picked = retrieve(q, idx.excerpts, { topK: 4 });
    const citations = picked.map((e) => e.citation);
    const out = materialCitations({ answer, excerpts: picked, citations, ignoreTokens: UBIQ, idf });
    assert.deepStrictEqual(
      out,
      [citeOf("1 19:54"), citeOf("2 9:55"), citeOf("1 12:04")],
      "claim-opus fixture: all three grounded citations survive; the 23:53 dashboards pad drops",
    );
  }
  // Fixture 3: Kaeo horse/raising partial — the pivot excerpts survive; the
  // horse-tied candidate (single rare-token overlap with an EXCLUSION claim)
  // must stay out; exclusion-span suppression keeps the negative claim's
  // object from tying its own excerpt in.
  {
    const q = "What is your stance on betting on horse races – and how do you raise an AI agent?";
    const answer = "Robin-twin: We've never talked about actual horse gambling, but raising agents? You set up their identity files (agent.md, soul.md, user.md) so they know who they are and what they do – then you let them troubleshoot, iterate, and train themselves inside your harness.\n\nTobi-twin: Put guardrails in place, connect them to your data foundation first, and honestly they get smarter the longer you work with them – it's challenging at the start but that's the whole point of harnessing the power instead of fearing it.";
    const picked = retrieve(q, idx.excerpts, { topK: 4 });
    const citations = picked.map((e) => e.citation);
    const out = materialCitations({ answer, excerpts: picked, citations, ignoreTokens: UBIQ, idf });
    assert.deepStrictEqual(
      out,
      [citeOf("4 28:53"), citeOf("1 30:55")],
      "horse/raising fixture: both pivot excerpts survive; exclusion-claim-only candidates drop",
    );
    // No-grounded-trim regression: rerunning the SHIPPED pre-fix filter
    // shape is not re-checkable here, but the surviving set must be exactly
    // the ratified served set — nothing the old filter kept may vanish.
  }
  // Calibration sanity: the production threshold separates the recorded
  // score margins (keep-min 9.42 / pad-max 7.81) with room on both sides.
  assert.strictEqual(MATERIAL_TIE_MIN, 8.5, "tie floor of record stays at the calibrated 8.5");

  // --- (b) Synthetic unit shapes (explicit small tieMin — synthetic corpora
  // carry synthetic idf scales) ---
  const excMaterial = { text: "Originally, when I started this, I burned $800 on Opus in the first month. It was gnarly, absolutely gnarly." };
  const excStack = { text: "The way it landed, yeah – month after month of hosting arguments, on-prem versus cloud, and the data sovereignty questions every director should ask." };
  const citeMaterial = { episode: 1, videoId: "aaa111", timestamp: "19:54" };
  const citeStack = { episode: 4, videoId: "bbb222", timestamp: "9:13" };
  const { idf: miniIdf } = buildIdf([excMaterial, excStack]);
  const answer = "Robin-twin: Tobi torched $800 on Opus in his first month – absolutely gnarly, he called it.\nTobi-twin: The wallet never recovered. That's the tuition.";
  const out = materialCitations({ answer, excerpts: [excMaterial, excStack], citations: [citeMaterial, citeStack], idf: miniIdf, tieMin: 1.0 });
  assert.deepStrictEqual(out, [citeMaterial], "decorative ep-4-style citation must drop; material citation must stay");
  const outAll = materialCitations({ answer, excerpts: [excMaterial], citations: [citeMaterial], idf: miniIdf, tieMin: 1.0 });
  assert.deepStrictEqual(outAll, [citeMaterial], "fully-tied citation set passes through unchanged");
  const decline = "Robin-twin: We haven't covered that on the show yet – and we'd rather say so than invent it.\nTobi-twin: Ask us about the token bill instead. That one still stings.";
  const outNone = materialCitations({ answer: decline, excerpts: [excStack], citations: [citeStack], idf: miniIdf, tieMin: 0.1 });
  assert.deepStrictEqual(outNone, [], "decline class cites NOTHING regardless of string overlap (F-NEW-1 short-circuit first)");
  // A claim-bearing answer tied to nothing returns [] too — and the
  // DEGENERATE TIER of record (routing correction `f30b3047` §2): the empty
  // set is NOT rerouted to a decline shape; validateAnswer's claim-bearing
  // class rejects it and the handler throws to the scripted fallback.
  const outUntied = materialCitations({ answer: "Robin-twin: Something entirely new.\nTobi-twin: Fresh ground altogether.", excerpts: [excStack], citations: [citeStack], idf: miniIdf, tieMin: 0.1 });
  assert.deepStrictEqual(outUntied, [], "claim-bearing answer with no material tie must return empty");
  const vDegenerate = validateAnswer({ answer: "Robin-twin: Something entirely new.\nTobi-twin: Fresh ground altogether.", citations: outUntied, allowedCitations: [citeStack] });
  assert.deepStrictEqual(vDegenerate, { ok: false, reason: "no-citations" }, "degenerate leg: fully-stripped claim-bearing fails validateAnswer → scripted fallback tier (never decline chrome over ungrounded prose)");
  // idf is REQUIRED — a caller without the corpus primitive must fail loud,
  // not silently fall back to unweighted overlap.
  assert.throws(() => materialCitations({ answer, excerpts: [excMaterial], citations: [citeMaterial] }), /idf function required/, "missing idf fails loud (corpus-weighted tie is not optional)");
  // Exclusion-span mechanics: the negative claim's object tokens never enter
  // tie vocabulary; the pivot half of the same sentence keeps its own.
  const exclVocab = claimVocabulary("We've never talked about actual horse gambling, but raising agents is the real craft.", new Set());
  assert.ok(!exclVocab.includes("horse") && !exclVocab.includes("gambling"), "exclusion span strips the negative claim's object tokens");
  assert.ok(exclVocab.includes("raising"), "pivot half of the same sentence keeps its vocabulary");
  // Speaker prefixes are chrome, never claim vocabulary.
  const claims = splitClaims("Robin-twin: Tobi torched $800 on Opus.\nTobi-twin: The wallet never recovered.");
  assert.strictEqual(claims[0].startsWith("Robin-twin"), false, "speaker prefix stripped from claim text");
  console.log("PASS 9: per-claim idf material tie — real-corpus fixtures of record pass, pads drop, replay deterministic, degenerate tier fail-closed");
}

// 10. Decline-class polarity (F-NEW-1, joint Oksana/Zar ruling 17 Sep): the
// rendered answer's class decides the citation set — `citations empty ⟺
// DECLINE class`. Yoshi's Jupiter repro shape: an on-air "we haven't covered
// … yet" excerpt plus the decline's own phrasing must NOT fabricate a
// citation, and the validator must reject a decline that ships chrome.
{
  // Jupiter-shaped corpus: the corpus itself contains honest-coverage
  // phrasing (hosts saying it on air) — the exact overlap that fabricated
  // the decline's citations in the repro.
  const excCoverClaim = { text: "We haven't covered that yet on the show, and honestly we should do a whole episode on it." };
  const citeCoverClaim = { episode: 2, videoId: "ccc333", timestamp: "21:07" };
  const declineAnswer = "Robin-twin: We haven't covered that on the show yet – and we'd rather say so than invent it.\nTobi-twin: Ask us about the token bill instead. That one still stings.";
  assert.strictEqual(isHonestDecline(declineAnswer), true, "honest-coverage line must classify as DECLINE");
  assert.strictEqual(isHonestDecline("Robin-twin: We torched $800 on Opus in month one.\nTobi-twin: The wallet never recovered."), false, "claim-bearing answer must not classify as DECLINE");
  // Self-phrasing overlap (decline text ↔ on-air coverage phrasing) is zero
  // material: empty set regardless of string overlap.
  const outSelf = materialCitations({ answer: declineAnswer, excerpts: [excCoverClaim], citations: [citeCoverClaim], idf: buildIdf([excCoverClaim]).idf, tieMin: 0.1 });
  assert.deepStrictEqual(outSelf, [], "decline's own phrasing must never fabricate relevance (Jupiter repro)");
  // Validator polarity, DECLINE class: empty citations OK, non-empty rejected.
  const vDeclineClean = validateAnswer({ answer: declineAnswer, citations: [], allowedCitations: [citeCoverClaim] });
  assert.deepStrictEqual(vDeclineClean, { ok: true, reason: null }, "decline with citations [] must pass — the absence is the assertion");
  const vDeclineChrome = validateAnswer({ answer: declineAnswer, citations: [citeCoverClaim], allowedCitations: [citeCoverClaim] });
  assert.deepStrictEqual(vDeclineChrome, { ok: false, reason: "decline-with-citations" }, "decline with decorative citations must fail CLOSED (Jupiter defect)");
  // Validator polarity, CLAIM-BEARING class: non-empty grounded required.
  const claimAnswer = "Robin-twin: We argued about whether agents need memory or just better notes.\nTobi-twin: Still my favourite fight.";
  const citeClaim = { episode: 1, videoId: "abc123", timestamp: "12:34" };
  const vClaimOk = validateAnswer({ answer: claimAnswer, citations: [citeClaim], allowedCitations: [citeClaim] });
  assert.deepStrictEqual(vClaimOk, { ok: true, reason: null }, "claim-bearing with grounded citations must pass");
  const vClaimEmpty = validateAnswer({ answer: claimAnswer, citations: [], allowedCitations: [citeClaim] });
  assert.deepStrictEqual(vClaimEmpty, { ok: false, reason: "no-citations" }, "claim-bearing with empty citations must fail CLOSED (unchanged)");
  console.log("PASS 10: decline-class polarity — citations empty ⟺ DECLINE, chrome under a decline fails CLOSED");
}

console.log("ALL LLM-SEAM TESTS PASS");
