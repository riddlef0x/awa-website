// Shared-state rate limiter — Twins Phase B prep (docs/AWA_TWINS_PHASE_B_ARCH_SPEC.md §6).
// Moves the per-IP counter from ephemeral lambda memory (Phase A limitation)
// to Netlify Blobs so the 10/min floor stops being best-effort across
// instances. Floor unchanged: RATE_LIMIT per RATE_WINDOW_MS per IP.
//
// Privacy posture (spec §7): blob KEYS carry a truncated SHA-256 of the IP,
// never the raw IP, and each counter covers one 1-minute window and is swept
// (best-effort) once the window passes. Nothing here writes to the log layer.
//
// Consistency tradeoff, on the record: read-modify-write on a blob is not
// atomic, so concurrent same-window requests can undercount by one and allow
// a brief overage. The limit is a floor, not exact accounting; the global
// spend cap (spec §4) is the independent second brake.

import { createHash } from "node:crypto";

export const RATE_LIMIT = 10;
export const RATE_WINDOW_MS = 60_000;
const CLEANUP_HORIZON = 3; // sweep windows this many behind current
const CLEANUP_MAX_DELETES = 50; // cap per sweep, best-effort
const CLEANUP_EVERY = 20; // sweep on 1-in-N requests

// In-memory fallback: local dev, unit tests, and any deploy where the Blobs
// runtime is unavailable. Same floor, same per-instance caveat as Phase A.
function memoryLimited(state, ip) {
  const now = Date.now();
  const list = (state.hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  state.hits.set(ip, list);
  if (state.hits.size > 5000) state.hits.clear(); // crude memory bound
  return list.length > RATE_LIMIT;
}

export function createLimiter({ store: storeOverride } = {}) {
  const state = { hits: new Map(), calls: 0 };
  let storePromise = null;

  async function resolveStore() {
    if (storeOverride) return storeOverride;
    if (!storePromise) {
      storePromise = import("@netlify/blobs")
        .then(({ getStore }) => getStore({ name: "twins-rate", consistency: "strong" }))
        .catch((err) => {
          storePromise = null; // transient (e.g. local dev) — retry next call
          throw err;
        });
    }
    return storePromise;
  }

  async function sweep(store, currentWindow) {
    try {
      const target = String(currentWindow - CLEANUP_HORIZON);
      const { blobs } = await store.list({ prefix: `${target}/` });
      for (const b of blobs.slice(0, CLEANUP_MAX_DELETES)) {
        await store.delete(b.key).catch(() => {});
      }
    } catch {
      // best-effort: an unswept window is dead weight, never a correctness issue
    }
  }

  return async function limited(ip) {
    state.calls += 1;
    const windowId = Math.floor(Date.now() / RATE_WINDOW_MS);
    const ipHash = createHash("sha256").update(String(ip)).digest("hex").slice(0, 32);
    const key = `${windowId}/${ipHash}`;
    try {
      const store = await resolveStore();
      const current = parseInt((await store.get(key)) || "0", 10) || 0;
      const count = current + 1;
      await store.setJSON(key, count);
      // Awaited (not fire-and-forget): lambdas may kill background work after
      // the response returns. Bounded: 1-in-20 requests, capped deletes.
      if (state.calls % CLEANUP_EVERY === 0) await sweep(store, windowId);
      return count > RATE_LIMIT;
    } catch {
      return memoryLimited(state, ip);
    }
  };
}
