// Ask-consent record — checklist (b) C01 enable-day cargo (spec of record
// RESEARCH/AWA_TWINS_REENABLE_SPEC_OF_RECORD_20260917.md; armed gate 12298936).
// One record per accepted ask submission: state "pending" the moment a
// question enters processing, "confirmed" when an answer is served under it
// (pending and confirmed are DISTINCT keys, both timestamped).
//
// Privacy posture (spec §7 frozen schema; /privacy/ copy of record): records
// are event-shaped and TEXT-FREE — no question text, no IP, no UA, no
// identifiers. They live under the aggregate-counts disclosure ("nothing
// personal, kept indefinitely").
//
// Suppressible two ways, on the record: (1) env TWINS_CONSENT_RECORDING=off
// stops all writes at runtime, env-only, no code change; (2) any store
// failure fails open — recording never blocks or defers an answer.
import { randomBytes } from "node:crypto";

const suppressed = () =>
  String(process.env.TWINS_CONSENT_RECORDING || "").trim().toLowerCase() === "off";

export function createConsent({ store: storeOverride } = {}) {
  let storePromise = null;

  async function resolveStore() {
    if (storeOverride) return storeOverride;
    if (!storePromise) {
      storePromise = import("@netlify/blobs")
        .then(({ getStore }) => getStore({ name: "twins-consent", consistency: "strong" }))
        .catch((err) => {
          storePromise = null; // transient (e.g. local dev) — retry next call
          throw err;
        });
    }
    return storePromise;
  }

  async function write(key, value) {
    if (suppressed()) return false;
    try {
      const store = await resolveStore();
      await store.setJSON(key, value);
      return true;
    } catch {
      return false; // fail open: recording must never block an answer
    }
  }

  return {
    // state "pending": question accepted for processing. Returns the record
    // id (null if recording suppressed/unavailable — callers treat as no-op).
    async pending(source) {
      const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
      const ok = await write(`p/${id}`, {
        state: "pending",
        ts: new Date().toISOString(),
        source,
      });
      return ok ? id : null;
    },

    // state "confirmed": an answer was served under this consent.
    async confirm(id) {
      if (!id) return false;
      return write(`c/${id}`, {
        state: "confirmed",
        ts: new Date().toISOString(),
        ref: id,
      });
    },
  };
}
