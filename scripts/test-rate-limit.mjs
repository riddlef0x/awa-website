// Test harness for netlify/functions/rate-limit.mjs (Phase B prep, spec §6).
// Run: node .scratch/awa_rate_limit_test.mjs
import assert from "node:assert";
import { createLimiter, RATE_LIMIT } from "../netlify/functions/rate-limit.mjs";

function fakeStore() {
  const kv = new Map();
  let listCalls = 0;
  return {
    kv,
    listCalls: () => listCalls,
    async get(k) { return kv.has(k) ? String(kv.get(k)) : null; },
    async setJSON(k, v) { kv.set(k, v); },
    async delete(k) { kv.delete(k); },
    async list({ prefix }) {
      listCalls += 1;
      return { blobs: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

let windowId = Math.floor(Date.now() / 60_000);
const realDateNow = Date.now;
const setWindow = (w) => { Date.now = () => w * 60_000 + 1000; };

// 1. Blobs path: floor is 10/min, 11th is limited, other IPs unaffected.
{
  const store = fakeStore();
  setWindow(windowId);
  const limited = createLimiter({ store });
  const results = [];
  for (let i = 0; i < RATE_LIMIT + 1; i++) results.push(await limited("1.2.3.4"));
  assert.deepStrictEqual(results, [...Array(10).fill(false), true], "11th same-window request must be limited");
  assert.strictEqual(await limited("5.6.7.8"), false, "different IP unaffected");
  const keys = [...store.kv.keys()];
  assert.ok(keys.every((k) => !k.includes("1.2.3.4") && !k.includes("5.6.7.8")), "no raw IP in any blob key: " + keys);
  assert.ok(keys.every((k) => /^[0-9]+\/[0-9a-f]{32}$/.test(k)), "key shape = window/hash32: " + keys);
  console.log("PASS 1: blobs path floor + IP hashing");
}

// 2. Window rollover resets the counter.
{
  const store = fakeStore();
  const limited = createLimiter({ store });
  setWindow(windowId);
  for (let i = 0; i < RATE_LIMIT; i++) await limited("9.9.9.9");
  assert.strictEqual(await limited("9.9.9.9"), true, "over floor in window");
  setWindow(windowId + 1);
  assert.strictEqual(await limited("9.9.9.9"), false, "fresh window resets");
  console.log("PASS 2: window rollover resets");
}

// 3. Sweep: fires on 1-in-20 and deletes the horizon window's keys.
{
  const store = fakeStore();
  const limited = createLimiter({ store });
  const old = windowId - 3;
  store.kv.set(`${old}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, 1);
  store.kv.set(`${old}/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, 1);
  setWindow(windowId);
  for (let i = 0; i < 20; i++) await limited("7.7.7.7"); // 20th call triggers sweep
  assert.strictEqual(store.listCalls(), 1, "sweep listed once");
  assert.strictEqual(store.kv.size, 1, "old-window keys swept, current remains");
  console.log("PASS 3: sweep deletes horizon window");
}

// 4. Fallback path: store that always throws → memory limiter, same floor.
{
  const failing = { async get() { throw new Error("no blobs"); }, async setJSON() { throw new Error("no blobs"); } };
  const limited = createLimiter({ store: failing });
  const results = [];
  for (let i = 0; i < RATE_LIMIT + 1; i++) results.push(await limited("4.4.4.4"));
  assert.deepStrictEqual(results, [...Array(10).fill(false), true], "memory fallback keeps the floor");
  console.log("PASS 4: graceful memory fallback");
}

// 5. Transient store failure between calls does not wedge the limiter.
{
  let fail = true;
  const flaky = { async get() { if (fail) throw new Error("down"); return null; }, async setJSON(k, v) { if (fail) throw new Error("down"); } };
  const limited = createLimiter({ store: flaky });
  setWindow(windowId);
  assert.strictEqual(await limited("8.8.8.8"), false, "fails open to memory path");
  fail = false;
  assert.strictEqual(await limited("8.8.8.8"), false, "recovers to blobs path");
  console.log("PASS 5: transient outage recovers");
}

Date.now = realDateNow;
console.log("ALL RATE-LIMIT TESTS PASS");
