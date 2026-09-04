// Provider call seam — Twins Phase B (docs/AWA_TWINS_PHASE_B_ARCH_SPEC.md §3, §6).
// Wired by ask.mjs behind ASK_BACKEND=llm; without the env var this module is
// never reached. Egress contract (§3): this wrapper constructs the request
// FRESH — headers are content-type plus the caller-injected key ONLY; no
// inbound header, IP, cookie, or session artifact is ever forwarded, and the
// module reads no environment. NOTE (Oksana re-stamp, wiring PR): the §3
// contract is NOT enforced by construction here — this file takes an
// arbitrary `payload` from its caller. It is enforced at the COMPOSITION
// SITE in ask.mjs (payload built adjacent to this one call, carrying exactly
// the static system prompt, retrieved repo excerpts, and the question).
// One function, one outbound call, one config-pinned host — auditable by grep
// across ask.mjs + this file.

const DEFAULT_TIMEOUT_MS = 20_000; // §6: 20s abort → graceful fallback

export async function callProvider({ url, payload, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch, extract = (data) => (data?.answer == null ? null : data.answer) }) {
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
    const answer = extract(data);
    if (answer == null) throw new Error("provider response missing answer");
    return { answer, usage: data?.usage ?? null };
  } finally {
    clearTimeout(timer);
  }
}
