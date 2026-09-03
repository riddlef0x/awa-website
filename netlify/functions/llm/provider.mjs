// Provider call seam — Twins Phase B prep (docs/AWA_TWINS_PHASE_B_ARCH_SPEC.md §3, §6).
// PRE-GATE PREP: zero keys, zero egress. Nothing here is called by ask.mjs yet;
// the real provider + key + budget word are flip-gated (spec §2).
//
// Egress contract (§3), enforced by construction: the request is constructed
// FRESH — no inbound header, IP, cookie, or session artifact is ever
// forwarded. Body carries exactly: system prompt (static, in the function),
// retrieved excerpts (repo corpus), visitor question verbatim (≤280).
// One function, one outbound call, one config-pinned host — auditable by grep.

const DEFAULT_TIMEOUT_MS = 20_000; // §6: 20s abort → graceful fallback

export async function callProvider({ url, payload, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch }) {
  if (!url) throw new Error("provider url not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`; // injected ONLY at flip time, from site-scoped env
    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`provider ${res.status}`);
    const data = await res.json();
    const answer = typeof data?.answer === "string" ? data.answer : null;
    if (answer == null) throw new Error("provider response missing answer");
    return { answer, usage: data?.usage ?? null };
  } finally {
    clearTimeout(timer);
  }
}
