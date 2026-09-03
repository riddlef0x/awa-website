// Test harness for the Phase B LLM seam prep (provider.mjs, filters.mjs,
// provider-mock.mjs). Zero keys, zero egress — fetch is stubbed.
// Run: node .scratch/awa_llm_seam_test.mjs
import assert from "node:assert";
import { callProvider } from "../netlify/functions/llm/provider.mjs";
import { validateAnswer, MAX_ANSWER_CHARS, MAX_ANSWER_LINES } from "../netlify/functions/llm/filters.mjs";
import { mockProvider, FIXTURES } from "../netlify/functions/llm/provider-mock.mjs";

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

// 3. Contract constants match spec §1.
assert.strictEqual(MAX_ANSWER_CHARS, 480);
assert.strictEqual(MAX_ANSWER_LINES, 3);
console.log("PASS 3: contract constants match spec (480 chars / 3 lines)");

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
console.log("ALL LLM-SEAM TESTS PASS");
