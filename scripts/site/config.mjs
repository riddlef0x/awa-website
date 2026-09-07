// Site configuration + shared primitives (WP01 foundation extraction, 7 Sep 2026).
// Mechanical move from scripts/build.mjs — values and comments preserved byte-for-byte.
// Owner: WP01 (Jenny, integration) until the release merge. Consumers import; nobody edits concurrently.
import path from "node:path";
import { fileURLToPath } from "node:url";

// NOTE: this file lives in scripts/site/ — the repo root is TWO levels up
// (the old build.mjs constant used ONE level). Resolved from this module's URL.
export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const DIST = path.join(ROOT, "dist");

export const NAVY = "#0A1628";
export const NAVY_2 = "#111A2E";
export const NAVY_CARD = "#131E33";
export const LINE = "#22304A";
export const LIME = "#C8FF3D";
export const INK = "#F4F7FB";
export const MUTED = "#9AA7BA";

// LinkedIn company page URL — pending from Stephanie (Jenny flagged this 30 Aug).
// Placeholder only. Grep for LINKEDIN_URL_PENDING before treating any build as final.
export const LINKEDIN_URL = null; // e.g. "https://www.linkedin.com/company/..."
// Phase 0 quick win (audit roadmap, 31 Aug): the three "(link pending)" LinkedIn
// buttons are REMOVED from header/footer/strip until the company page exists —
// dead buttons don't ship. Re-add via markCTA({ href: LINKEDIN_URL }) when set.
export const YOUTUBE_CHANNEL = "https://www.youtube.com/@actwithoutaskingpod";
export const YOUTUBE_SUBSCRIBE = `${YOUTUBE_CHANNEL}?sub_confirmation=1`;

// ONE domain constant (Oksana arch v1 §2). Every absolute internal URL —
// canonical, sitemap, JSON-LD, OG — derives from SITE_URL. Domain switch =
// change this one line + rebuild + 301 map at the host.
export const SITE_URL = "https://awa-website.netlify.app"; // interim host until the real domain lands
// Hardcoded-host gate: hosts that must NEVER appear in emitted HTML except via
// SITE_URL. "actwithoutasking.com" is the expected real domain — if it shows up
// before the switch, someone hardcoded it; after the switch it IS SITE_URL and
// the old netlify host moves here, so any forgotten literal fails the build.
export const PLACEHOLDER_HOSTS = ["actwithoutasking.com", "awa-website.netlify.app"].filter(
  (h) => h !== new URL(SITE_URL).host
);

// Key-shaped literal detector (spec §4): catches a secret pasted into any
// emitted asset. OpenRouter (sk-or-v1-…), Anthropic (sk-ant-…), OpenAI
// (sk-proj-…/sk-svcacct-…), and generic 30+ char sk- tokens.
export const KEY_SHAPE = /sk-(?:ant|or-v1|proj|svcacct)-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{30,}/;

// Site availability (handoff §WP01.2 + §WP01.6): the ONE place recording what
// the site can honestly promise today. Recorded 7 Sep from code + assets:
//  - emailReady: subscribe form ships hard-disabled (build comment + disabled
//    inputs); no provider integration or delivery evidence exists. MailerLite
//    group still to be created (Stephanie owns).
//  - kitReady: The Harness Kit is promised in copy but no downloadable asset
//    exists (assets/ holds only favicon + og-card). WP06 removes/softens the
//    promise while this is false. Recorded separately by design — kitReady
//    alone never enables email (handoff §WP06).
export const SITE_AVAILABILITY = { emailReady: false, kitReady: false };

// Arch condition A (event 36f1e546): escape feed-derived strings (youtube.json
// titles/URLs) in every HTML context — the multi-page rewrite multiplies the
// interpolation surface, and one future feed title with a quote or & must not
// mangle every card it lands in.
export const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
// JSON-LD must never be able to close its own <script> tag — serialize with
// every literal < escaped to \u003c (valid JSON, inert in HTML).
export const jsonLdSafe = (o) => JSON.stringify(o, null, 2).replace(/</g, "\\u003c");
