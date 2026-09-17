// C01 enable-day cargo tests — checklist item (b) (spec of record
// RESEARCH/AWA_TWINS_REENABLE_SPEC_OF_RECORD_20260917.md; armed gate 12298936).
// Covers: honeypot sender-blind skip, ask-consent pending/confirmed records
// (text-free, timestamped, suppressible), fail-open recording, and the
// honest-kit line + honeypot markup on both built ask surfaces.
// Run: node scripts/test-c01-cargo.mjs  (run `npm run build` first for markup gates)
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { createConsent } from "../netlify/functions/consent.mjs";
import { createAskHandler } from "../netlify/functions/ask.mjs";

const noopLimiter = async () => false;
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

function consentKeys(store) {
  return [...store._kv.entries()].map(([k, v]) => ({ key: k, value: JSON.parse(v) }));
}

// 1. Honeypot: filled decoy → sender-blind 200 fallback, NO consent record.
{
  const store = memoryStore();
  const consent = createConsent({ store });
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent });
  const res = await post(handler, { question: "hello there", website: "http://spam.example" });
  const body = await res.json();
  assert.strictEqual(res.status, 200, "honeypot hit must be sender-blind 200");
  assert.strictEqual(body.mode, "fallback");
  assert.strictEqual(body.fallbackUsed, true);
  assert.strictEqual(store._kv.size, 0, "no consent record for a bot hit");
  console.log("PASS 1: honeypot hit = sender-blind 200 fallback, zero consent records");
}

// 2. Clean ask: pending written, then confirmed on serve; TEXT-FREE payload.
{
  const store = memoryStore();
  const consent = createConsent({ store });
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent });
  const q = "what did the twins say about agent memory on the show";
  const res = await post(handler, { question: q, source: "widget" });
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.ok(body.answer, "clean ask must be answered");
  const recs = consentKeys(store);
  const pending = recs.filter((r) => r.key.startsWith("p/"));
  const confirmed = recs.filter((r) => r.key.startsWith("c/"));
  assert.strictEqual(pending.length, 1, "exactly one pending record");
  assert.strictEqual(confirmed.length, 1, "exactly one confirmed record");
  assert.deepStrictEqual(
    { state: pending[0].value.state, ts: !!pending[0].value.ts, source: pending[0].value.source },
    { state: "pending", ts: true, source: "widget" },
  );
  assert.strictEqual(confirmed[0].value.state, "confirmed");
  assert.ok(confirmed[0].value.ts, "confirmed record is timestamped");
  assert.strictEqual(confirmed[0].value.ref, pending[0].key.slice(2), "confirmed ref links the pending id");
  const blob = JSON.stringify([...store._kv.values()]);
  assert.ok(!blob.includes(q), "consent records must carry NO question text (spec §7)");
  assert.ok(!/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/.test(blob), "no addresses in consent records");
  console.log("PASS 2: pending + confirmed distinct, timestamped, ref-linked, text-free");
}

// 3. Source allowlist: junk source records as "unknown".
{
  const store = memoryStore();
  const consent = createConsent({ store });
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent });
  await post(handler, { question: "who are you two", source: "evil<script>" });
  const recs = consentKeys(store).filter((r) => r.key.startsWith("p/"));
  assert.strictEqual(recs[0].value.source, "unknown");
  console.log("PASS 3: junk source recorded as 'unknown' (allowlist)");
}

// 4. Suppression: TWINS_CONSENT_RECORDING=off stops writes, answers unaffected.
{
  process.env.TWINS_CONSENT_RECORDING = "off";
  const store = memoryStore();
  const consent = createConsent({ store });
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent });
  const res = await post(handler, { question: "who are you two" });
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.ok(body.answer, "suppressed recording must not affect answers");
  assert.strictEqual(store._kv.size, 0, "suppressed = zero records");
  delete process.env.TWINS_CONSENT_RECORDING;
  console.log("PASS 4: env suppression stops writes, answers unaffected");
}

// 5. Fail open: a throwing consent store never blocks an answer.
{
  const broken = { get: async () => { throw new Error("blobs down"); }, setJSON: async () => { throw new Error("blobs down"); } };
  const consent = createConsent({ store: broken });
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent });
  const res = await post(handler, { question: "who are you two" });
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.ok(body.answer, "consent outage must never block an answer");
  console.log("PASS 5: consent store failure = answer still served (fail open)");
}

// 6. Rate-limited request: 429 and NO consent record (never accepted).
{
  const store = memoryStore();
  const consent = createConsent({ store });
  const handler = createAskHandler({ limiter: async () => true, guard: noopGuard, consent });
  const res = await post(handler, { question: "who are you two" });
  assert.strictEqual(res.status, 429);
  assert.strictEqual(store._kv.size, 0, "rate-limited asks write no consent record");
  console.log("PASS 6: rate-limited ask = 429, zero consent records");
}

// 7. Handoff-click beacon still 204 (existing contract untouched).
{
  const store = memoryStore();
  const consent = createConsent({ store });
  const handler = createAskHandler({ limiter: noopLimiter, guard: noopGuard, consent });
  const res = await post(handler, { kind: "handoff-click", poolId: "seed-01" });
  assert.strictEqual(res.status, 204);
  console.log("PASS 7: handoff-click beacon contract unchanged (204)");
}

// 8. Markup gates on the BUILT site (run npm run build first):
//    honeypot present + inert on BOTH ask surfaces; honest-kit line on the
//    widget; /twins page keeps its fuller t-note with NO duplicate.
{
  const [widget, twinsPage] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/twins/index.html", import.meta.url), "utf8"),
  ]);
  const HP = /<input class="twins-hp" name="website" type="text" tabindex="-1" aria-hidden="true" autocomplete="off">/;
  assert.ok(HP.test(widget), "widget markup carries the inert honeypot");
  assert.ok(HP.test(twinsPage), "/twins markup carries the inert honeypot");
  assert.ok(/\.twins-hp\{position:absolute;left:-9999px[^}]*font-size:16px\}/.test(widget), "honeypot CSS is off-screen + 16px (iOS zoom lesson)");
  const widgetPanel = widget.slice(widget.indexOf('id="twinsPanel"'));
  assert.ok(widgetPanel.includes('class="twins-note"'), "honest-kit line present on the widget surface");
  assert.ok(widgetPanel.includes('href="/privacy/"'), "honest-kit line links the privacy page");
  const pageAskSection = twinsPage.slice(twinsPage.indexOf('<section class="t-ask">'), twinsPage.indexOf("</section>", twinsPage.indexOf('<section class="t-ask">')));
  assert.ok(!/class="twins-note"/.test(pageAskSection), "/twins ask box must NOT duplicate the note (t-note is its line of record)");
  assert.ok(pageAskSection.includes('class="t-note"'), "/twins page keeps the fuller t-note");
  for (const [name, html] of [["widget", widgetPanel], ["twins", twinsPage.slice(twinsPage.indexOf("twins-ask"))]]) {
    const note = html.match(/twins-note">([^<]*)</);
    if (note) assert.ok(!note[1].includes("\u2014"), `${name} honest-kit line carries no em-dash`);
  }
  const script = widget.slice(widget.indexOf("function initAsk"), widget.indexOf("</script>", widget.indexOf("function initAsk")));
  assert.ok(script.includes('root.closest("#twinsWidget")?"widget":"twins"'), "ask payload carries the surface source");
  assert.ok(script.includes("payload.website=hp.value"), "honeypot value is echoed to the server only when filled");
  console.log("PASS 8: honeypot + honest-kit line correct on both built surfaces, register-clean");
}

console.log("ALL C01-CARGO TESTS PASS");
