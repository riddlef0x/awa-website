// Fallback-honesty unit tests (17 Sep ruling, Oksana §1–§3 / Stephanie's probes):
//  (a) the fallback tier NEVER ships a citation — a scripted line was never
//      spoken, so any citation there is fabricated provenance;
//  (b) greeting-class inputs get the scripted router, not the worst tier —
//      zero LLM spend, no citations, topics the pool genuinely answers.
// Run: node scripts/test-greeting-fallback.mjs  (run `npm run build` first for
// the ask-data.json gates — greetingTopics / fallbackHandoff shape)
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { createConsent } from "../netlify/functions/consent.mjs";
import { createAskHandler } from "../netlify/functions/ask.mjs";

const noopLimiter = async () => false;
const neverLimiter = async () => true;
const noopGuard = { tripped: async () => false, record: async () => {} };

function memoryStore() {
  const kv = new Map();
  return {
    _kv: kv,
    get: async (k) => (kv.has(k) ? kv.get(k) : null),
    setJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  };
}

function post(handler, payload) {
  return handler(new Request("https://site/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

const EM = /[\u2014]|&mdash;|&#8212;|&#x2014;/;

// 1. Greetings route to the scripted router — never the fallback tier.
{
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent: createConsent({ store: memoryStore() }) });
  for (const g of ["yo", "hi", "hello", "hey!", "g'day", "good morning", "hi there", "Hello twins"]) {
    const res = await post(handler, { question: g });
    const b = await res.json();
    assert.strictEqual(res.status, 200, `greeting "${g}" must be 200`);
    assert.strictEqual(b.mode, "greeting", `"${g}" must route to the greeting router, got ${b.mode}`);
    assert.strictEqual(b.fallbackUsed, false, `"${g}" must not count as a fallback`);
    assert.strictEqual(b.poolId, "greeting");
    assert.deepStrictEqual(b.citations, [], "greeting must carry NO citations (scripted lines were never spoken)");
    assert.ok(!EM.test(b.answer), `greeting answer must be em-dash free: "${g}"`);
    assert.ok(!("handoff" in b), "greeting must not push the visitor off-site");
    assert.ok(b.answer.includes("Robin-twin:") && b.answer.includes("Tobi-twin:"), "greeting keeps the two-twin shape");
  }
  console.log("PASS 1: greetings route to the scripted router (no fallback, no citations, no em-dash)");
}

// 2. The router only promises topics the pool answers: every promised label
//    must contain a pool keyword anchor (phrase match = +3 = threshold).
{
  const askData = JSON.parse(await readFile(new URL("../netlify/functions/ask-data.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(askData.greetingTopics) && askData.greetingTopics.length >= 3, "build must emit greetingTopics");
  for (const label of askData.greetingTopics) {
    const anchor = askData.entries.find((e) => e.keywords.some((k) => label.toLowerCase().includes(k.toLowerCase())));
    assert.ok(anchor, `greeting topic "${label}" must anchor to a pool entry's keyword`);
  }
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent: createConsent({ store: memoryStore() }) });
  const res = await post(handler, { question: "yo" });
  const b = await res.json();
  for (const label of askData.greetingTopics) {
    assert.ok(b.answer.includes(label), `greeting copy must name promised topic "${label}"`);
  }
  console.log("PASS 2: greeting topics are pool-anchored (router cannot over-promise)");
}

// 3. A real question is never swallowed by the greeting router.
{
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent: createConsent({ store: memoryStore() }) });
  const res = await post(handler, { question: "hey what's the deal with the sovereign ai thing" });
  const b = await res.json();
  assert.strictEqual(b.mode, "pool", "question containing a greeting word must fall through to matching");
  assert.ok(b.citations.length > 0, "pool answers keep their citations");
  console.log("PASS 3: questions with greeting words still match the pool");
}

// 4. THE RULING LEG: the fallback tier carries ZERO citations, handoff stays.
{
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent: createConsent({ store: memoryStore() }) });
  const res = await post(handler, { question: "zzz qqq xyzzy plugh flurb" });
  const b = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(b.mode, "fallback");
  assert.strictEqual(b.fallbackUsed, true);
  assert.deepStrictEqual(b.citations, [], "fallback must NOT cite anything (fabricated provenance killed)");
  assert.ok(b.handoff && b.handoff.url, "fallback keeps the honest handoff pointer");
  assert.ok(b.handoff.label, "fallback handoff keeps its label");
  assert.ok(!EM.test(b.answer), "fallback answer must be em-dash free");
  console.log("PASS 4: fallback tier = citations empty, handoff intact");
}

// 5. Every scripted error path is a fallback tier: no citations anywhere.
{
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent: createConsent({ store: memoryStore() }) });
  const over = "x".repeat(281);
  for (const [payload, status] of [[{ question: over }, 400], [{ question: "" }, 400], [{ method: "GET" }, 405]]) {
    if (payload.method === "GET") {
      const res = await handler(new Request("https://site/api/ask", { method: "GET" }));
      const b = await res.json();
      assert.strictEqual(res.status, 405);
      assert.deepStrictEqual(b.citations, [], "405 line must carry no citations");
    } else {
      const res = await post(handler, payload);
      const b = await res.json();
      assert.strictEqual(res.status, status);
      assert.deepStrictEqual(b.citations, [], `scripted ${status} line must carry no citations`);
    }
  }
  const limited = createAskHandler({ limiter: neverLimiter, guard: noopGuard, consent: createConsent({ store: memoryStore() }) });
  const res429 = await post(limited, { question: "what is the token bill" });
  const b429 = await res429.json();
  assert.strictEqual(res429.status, 429);
  assert.deepStrictEqual(b429.citations, [], "429 line must carry no citations");
  console.log("PASS 5: 400/405/429 scripted lines all citation-free");
}

// 6. Greetings still record consent (pending + confirmed), text-free.
{
  const store = memoryStore();
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent: createConsent({ store }) });
  await post(handler, { question: "hello", source: "widget" });
  const recs = [...store._kv.values()].map((v) => JSON.parse(v));
  assert.strictEqual(recs.filter((r) => r.state === "pending").length, 1, "greeting writes one pending record");
  assert.strictEqual(recs.filter((r) => r.state === "confirmed").length, 1, "greeting confirms on serve");
  assert.ok(!JSON.stringify(recs).includes("hello"), "consent records carry no question text");
  console.log("PASS 6: greeting consent records pending+confirmed, text-free");
}

// 7. Generated ask-data no longer carries the fabricated fallback citation.
{
  const askData = JSON.parse(await readFile(new URL("../netlify/functions/ask-data.json", import.meta.url), "utf8"));
  assert.ok(askData.fallbackHandoff, "fallbackHandoff must exist");
  assert.ok(!("citations" in askData.fallbackHandoff), "fallbackHandoff must not ship citations at all");
  assert.ok(askData.fallbackHandoff.url && askData.fallbackHandoff.label, "handoff keeps url + label");
  console.log("PASS 7: build no longer generates the fabricated fallback citation");
}

console.log("ALL PASS: fallback-honesty unit (greeting router + citation strip)");
