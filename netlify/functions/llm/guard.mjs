// Fallback-rate circuit — Twins Phase B wiring (docs/AWA_TWINS_PHASE_B_ARCH_SPEC.md §6).
// The fallback-rate KPI: if the LLM path falls back above 20% of requests in
// the trailing hour (minimum sample 10), the circuit trips for the rest of
// that hour and the endpoint serves scripted only. The site visibly degrades
// to v1 rather than silently degrading to junk.
//
// Privacy posture (spec §7): the counter key is the HOUR — no IP, no question
// text, nothing that identifies a visitor. Aggregate ok/fallback counts only.
// Shared state via Netlify Blobs (same posture as rate-limit.mjs, including
// the non-atomic read-modify-write tradeoff); in-memory fallback for local
// dev and tests. The guard is a cost/KPI brake, not a safety brake — every
// failure path still fails closed to the scripted fallback via the filters.
// tripped()/record() fail OPEN (false) on store errors: a broken guard never
// blocks the LLM path, and each individual failure still falls back safely.

export const FALLBACK_RATE_LIMIT = 0.2; // §6: 20% of requests in an hour
export const MIN_SAMPLE = 10;

const HOUR_MS = 3_600_000;

function rateIsTripped(counter) {
  const total = counter.ok + counter.fb;
  if (total < MIN_SAMPLE) return false;
  return counter.fb / total > FALLBACK_RATE_LIMIT;
}

export function createGuard({ store: storeOverride, now = () => Date.now() } = {}) {
  const mem = new Map(); // hourId -> {ok, fb}
  let storePromise = null;

  async function resolveStore() {
    if (storeOverride) return storeOverride;
    if (!storePromise) {
      storePromise = import("@netlify/blobs")
        .then(({ getStore }) => getStore({ name: "twins-guard", consistency: "strong" }))
        .catch((err) => {
          storePromise = null;
          throw err;
        });
    }
    return storePromise;
  }

  function hourId() {
    return String(Math.floor(now() / HOUR_MS));
  }

  function memCounter(id) {
    if (!mem.has(id)) mem.set(id, { ok: 0, fb: 0 });
    if (mem.size > 48) for (const k of [...mem.keys()].slice(0, 24)) mem.delete(k); // crude memory bound
    return mem.get(id);
  }

  return {
    // True once this hour's sample is large enough and the fallback rate
    // crossed the limit. Store error → false (fail open; see header).
    async tripped() {
      const id = hourId();
      try {
        const store = await resolveStore();
        const c = JSON.parse((await store.get(id)) || "null");
        return c ? rateIsTripped(c) : false;
      } catch {
        const c = memCounter(id);
        return c.ok + c.fb > 0 ? rateIsTripped(c) : false;
      }
    },

    // Increment the hourly counter with the outcome, then report whether the
    // circuit is now tripped (checked BEFORE the next provider call).
    async record(ok) {
      const id = hourId();
      try {
        const store = await resolveStore();
        const c = JSON.parse((await store.get(id)) || "null") || { ok: 0, fb: 0 };
        c[ok ? "ok" : "fb"] += 1;
        await store.setJSON(id, c);
        mem.set(id, c);
        return rateIsTripped(c);
      } catch {
        const c = memCounter(id);
        c[ok ? "ok" : "fb"] += 1;
        return rateIsTripped(c);
      }
    },
  };
}
