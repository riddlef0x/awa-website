// Test harness for the Phase B LLM seam (provider.mjs, filters.mjs,
// provider-mock.mjs, retrieval.mjs, guard.mjs). Zero keys, zero egress —
// fetch is stubbed.
// Run: node scripts/test-llm-seam.mjs
import assert from "node:assert";
import { callProvider } from "../netlify/functions/llm/provider.mjs";
import { validateAnswer, MAX_ANSWER_CHARS, MAX_ANSWER_LINES, materialCitations, isHonestDecline, MATERIAL_MIN_TOKENS } from "../netlify/functions/llm/filters.mjs";
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

// 9. Citation-material tie filter (17 Sep, Class B provenance ruling; polarity
// amended by the joint Oksana/Zar F-NEW-1 ruling): a retrieved excerpt the
// answer does not draw on is a decorative citation and must drop; true sources
// stay; the set MAY be empty — an honest empty is a valid return, not a
// defect (the old never-empty fallback was the defect's spec and is voided).
{
  const excMaterial = { text: "Originally, when I started this, I burned $800 on Opus in the first month. It was gnarly, absolutely gnarly." };
  const excStack = { text: "The way it landed, yeah – month after month of hosting arguments, on-prem versus cloud, and the data sovereignty questions every director should ask." };
  const citeMaterial = { episode: 1, videoId: "aaa111", timestamp: "19:54" };
  const citeStack = { episode: 4, videoId: "bbb222", timestamp: "9:13" };
  const answer = "Robin-twin: Tobi torched $800 on Opus in his first month – absolutely gnarly, he called it.\nTobi-twin: The wallet never recovered. That's the tuition.";
  const out = materialCitations({ answer, excerpts: [excMaterial, excStack], citations: [citeMaterial, citeStack] });
  assert.deepStrictEqual(out, [citeMaterial], "decorative ep-4-style citation must drop; material citation must stay");
  const outAll = materialCitations({ answer, excerpts: [excMaterial], citations: [citeMaterial] });
  assert.deepStrictEqual(outAll, [citeMaterial], "fully-tied citation set passes through unchanged");
  const decline = "Robin-twin: We haven't covered that on the show yet – and we'd rather say so than invent it.\nTobi-twin: Ask us about the token bill instead. That one still stings.";
  const outNone = materialCitations({ answer: decline, excerpts: [excStack], citations: [citeStack] });
  assert.deepStrictEqual(outNone, [], "decline class cites NOTHING regardless of string overlap (F-NEW-1)");
  // Corpus-glue exclusion: "way / yeah / month" in common must NOT tie the
  // stack excerpt to the answer; a single glue overlap is not material.
  const outGlue = materialCitations({
    answer,
    excerpts: [excMaterial, excStack],
    citations: [citeMaterial, citeStack],
    ignoreTokens: new Set(["way", "yeah", "month", "twin", "which", "through", "first"]),
  });
  assert.deepStrictEqual(outGlue, [citeMaterial], "glue-only overlap must not count as material");
  // A claim-bearing answer tied to nothing returns [] too — validateAnswer
  // then rejects it to the scripted fallback (no grounding → no LLM answer).
  const outUntied = materialCitations({ answer: "Robin-twin: Something entirely new.\nTobi-twin: Fresh ground altogether.", excerpts: [excStack], citations: [citeStack] });
  assert.deepStrictEqual(outUntied, [], "claim-bearing answer with no material tie must return empty, not keep a decorative top citation");
  assert.strictEqual(MATERIAL_MIN_TOKENS, 2, "tie floor stays at 2 shared tokens");
  console.log("PASS 9: materialCitations drops decorative citations; empty sets are honest returns (never-empty guarantee dead)");
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
  const outSelf = materialCitations({ answer: declineAnswer, excerpts: [excCoverClaim], citations: [citeCoverClaim] });
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
