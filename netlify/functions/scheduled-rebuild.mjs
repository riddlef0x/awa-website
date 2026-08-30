// Netlify scheduled function (see netlify.toml: every 6 hours).
// Triggers a fresh build so YouTube episode/short data stays current without
// a human pushing a commit. Per Oksana's ruling (AWA channel, 30 Aug 2026):
// "live" means current within hours via a scheduled rebuild, not build-time-once.
export async function handler() {
  const hook = process.env.BUILD_HOOK_URL;
  if (!hook) {
    console.error("[scheduled-rebuild] BUILD_HOOK_URL not set — cannot trigger rebuild");
    return { statusCode: 500, body: "BUILD_HOOK_URL not set" };
  }
  const res = await fetch(hook, { method: "POST" });
  console.log(`[scheduled-rebuild] triggered build hook — status ${res.status}`);
  return { statusCode: 200, body: `triggered build hook: ${res.status}` };
}
