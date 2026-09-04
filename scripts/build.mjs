// Renders dist/index.html from data/youtube.json + the article drafts below.
// Static output only — no client-side fetch to any third party (Oksana ruling,
// AWA channel, 30 Aug 2026: build-time static, not a runtime dependency).
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { buildTwins } from "./build-twins.mjs";
import { writeRetrievalIndex } from "./build-retrieval.mjs";
import { EPISODE_TRANSCRIPTS } from "./episode-transcripts.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const NAVY = "#0A1628";
const NAVY_2 = "#111A2E";
const NAVY_CARD = "#131E33";
const LINE = "#22304A";
const LIME = "#C8FF3D";
const INK = "#F4F7FB";
const MUTED = "#9AA7BA";

// LinkedIn company page URL — pending from Stephanie (Jenny flagged this 30 Aug).
// Placeholder only. Grep for LINKEDIN_URL_PENDING before treating any build as final.
const LINKEDIN_URL = null; // e.g. "https://www.linkedin.com/company/..."
// Phase 0 quick win (audit roadmap, 31 Aug): the three "(link pending)" LinkedIn
// buttons are REMOVED from header/footer/strip until the company page exists —
// dead buttons don't ship. Re-add via markCTA({ href: LINKEDIN_URL }) when set.
const YOUTUBE_CHANNEL = "https://www.youtube.com/@actwithoutaskingpod";
const YOUTUBE_SUBSCRIBE = `${YOUTUBE_CHANNEL}?sub_confirmation=1`;

// Tracking-links pass (2 Sept): rendered outbound YouTube links carry UTM
// params so YouTube analytics attributes site-driven traffic. Mirrors the
// twins citation convention already in this build: utm_source=awa_site,
// utm_medium=surface, utm_campaign=intent, utm_content=locator. Rendered
// <a href> only — JSON-LD/canonical/sitemap URLs stay clean, and the twins
// seed citations arrive pre-tagged. Internal links are never tagged.
function ytUtm(url, { medium, campaign, content = null }) {
  if (!url) return url;
  const u = new URL(url);
  u.searchParams.set("utm_source", "awa_site");
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  if (content) u.searchParams.set("utm_content", content);
  return u.toString();
}

// A2 "Listen on" block (DoD v2): YouTube ONLY tonight — show is not on
// Apple/Spotify (verified via iTunes Search API, 1 Sep 2026). Data-driven so
// platform deep links slot in on distribution day without touching markup:
// push a { name, url } entry and every placement picks it up.
const LISTEN_PLATFORMS = [
  { name: "YouTube", url: YOUTUBE_CHANNEL },
];
function listenOnBlock({ compact = false } = {}) {
  const links = LISTEN_PLATFORMS.map(
    (p) => `<a class="cta-btn ${compact ? "ghost" : "primary"}" href="${escapeHtml(ytUtm(p.url, { medium: "listen", campaign: "channel" }))}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`
  ).join("\n      ");
  return `<div class="listen-on${compact ? " compact" : ""}">
      <span class="listen-label">Listen on</span>
      ${links}
    </div>`;
}

// ONE domain constant (Oksana arch v1 §2). Every absolute internal URL —
// canonical, sitemap, JSON-LD, OG — derives from SITE_URL. Domain switch =
// change this one line + rebuild + 301 map at the host.
const SITE_URL = "https://awa-website.netlify.app"; // interim host until the real domain lands
// Hardcoded-host gate: hosts that must NEVER appear in emitted HTML except via
// SITE_URL. "actwithoutasking.com" is the expected real domain — if it shows up
// before the switch, someone hardcoded it; after the switch it IS SITE_URL and
// the old netlify host moves here, so any forgotten literal fails the build.
const PLACEHOLDER_HOSTS = ["actwithoutasking.com", "awa-website.netlify.app"].filter(
  (h) => h !== new URL(SITE_URL).host
);

// Key-shaped literal detector (spec §4): catches a secret pasted into any
// emitted asset. OpenRouter (sk-or-v1-…), Anthropic (sk-ant-…), OpenAI
// (sk-proj-…/sk-svcacct-…), and generic 30+ char sk- tokens.
const KEY_SHAPE = /sk-(?:ant|or-v1|proj|svcacct)-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{30,}/;

// Arch condition A (event 36f1e546): escape feed-derived strings (youtube.json
// titles/URLs) in every HTML context — the multi-page rewrite multiplies the
// interpolation surface, and one future feed title with a quote or & must not
// mangle every card it lands in.
const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
// JSON-LD must never be able to close its own <script> tag — serialize with
// every literal < escaped to \u003c (valid JSON, inert in HTML).
const jsonLdSafe = (o) => JSON.stringify(o, null, 2).replace(/</g, "\\u003c");

const SITE_CSS = `
  :root{
    --navy:#0A1628; --navy2:#111A2E; --lime:#C8FF3D; --ink:#F4F7FB;
    --muted:#9AA7BA; --card:#131E33; --line:#22304A;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  @media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}
  a:focus-visible,button:focus-visible,input:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--lime);outline-offset:2px;border-radius:2px}
  .strip a:focus-visible{outline-color:var(--navy)}
  body{background:var(--navy);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:var(--lime)}
  .wrap{max-width:1100px;margin:0 auto;padding:0 20px}
  header{position:sticky;top:0;background:rgba(10,22,40,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);z-index:10}
  .nav{display:flex;align-items:center;justify-content:space-between;height:64px;gap:16px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-weight:700;letter-spacing:.02em}
  .nav-ctas{display:flex;gap:10px;flex-wrap:wrap}
  .cta-btn{display:inline-block;font-weight:700;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;white-space:nowrap}
  .cta-btn.primary{background:var(--lime);color:var(--navy)}
  .cta-btn.primary:hover{filter:brightness(1.08)}
  .cta-btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
  .cta-btn.ghost:hover{border-color:var(--lime);color:var(--lime)}
  .cta-btn[data-pending]{opacity:.55;cursor:not-allowed}
  .hero{padding:96px 0 64px;text-align:center;background:radial-gradient(600px 300px at 50% -50px, rgba(200,255,61,.10), transparent 70%),linear-gradient(180deg, var(--navy2), var(--navy));position:relative;overflow:hidden}
  .hero .kicker{color:var(--lime);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.18em;font-family:'JetBrains Mono',monospace}
  .hero h1{font-size:clamp(40px,7vw,84px);line-height:1.02;letter-spacing:-.02em;margin:20px 0;font-weight:700}
  .hero .sub{color:var(--muted);max-width:600px;margin:0 auto 28px;font-size:18px}
  .hero .btn{display:inline-block;background:var(--lime);color:var(--navy);font-weight:700;text-decoration:none;padding:15px 30px;border-radius:8px;font-size:15px}
  .hero .btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
  .hero .btn.ghost:hover{border-color:var(--lime);color:var(--lime)}
  .hero-ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:0 0 8px}
  .featured{max-width:760px;margin:32px auto 0;aspect-ratio:16/9;position:relative}
  .featured.playing{border-radius:12px;overflow:hidden;border:1px solid var(--line)}
  .featured-facade{position:absolute;inset:0;width:100%;height:100%;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--navy2);cursor:pointer;overflow:hidden;display:block}
  .featured-facade img{width:100%;height:100%;object-fit:cover;display:block;opacity:.55;transition:opacity .15s ease}
  .featured-facade:hover img{opacity:.75}
  .featured-facade::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,22,40,.05),rgba(10,22,40,.65))}
  .featured-label{position:absolute;left:16px;right:64px;bottom:12px;z-index:2;color:var(--ink);font-size:14px;font-weight:600;text-align:left;line-height:1.35}
  .featured-label .ep-num{display:block;margin-bottom:2px}
  .featured-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;width:64px;height:64px;border-radius:50%;background:var(--lime);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 6px rgba(200,255,61,.18);transition:transform .15s ease}
  .featured-facade:hover .featured-play{transform:translate(-50%,-50%) scale(1.06)}
  .featured-facade .featured-play svg{margin-left:3px}
  .hero .byline{margin-top:20px;color:#8B97AB;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.02em}
  section{padding:72px 0}
  .kicker{color:var(--lime);font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-family:'JetBrains Mono',monospace;margin-bottom:8px;text-align:center}
  h2{font-size:clamp(26px,4vw,36px);letter-spacing:-.01em;margin-bottom:8px;text-align:center;font-weight:600}
  .section-head{margin-bottom:44px}
  .eps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
  .ep-card{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;text-decoration:none;color:var(--ink);display:block;transition:transform .15s ease,border-color .15s ease}
  .ep-card:hover{transform:translateY(-3px);border-color:var(--lime)}
  /* ---- Motion layer v1 (arch V1 §1 hover polish). Compositor-only:
     transform/opacity keyframes, no layout properties animated. The global
     prefers-reduced-motion kill switch above disables every rule here;
     the tilt script also self-guards (pointer:fine + reduced-motion). ---- */
  .hero-motes{position:absolute;inset:0;pointer-events:none}
  .hero-motes i{position:absolute;bottom:-8px;width:3px;height:3px;border-radius:50%;background:rgba(200,255,61,.35);opacity:0;animation:moteDrift 9s linear infinite;will-change:transform,opacity}
  .hero-motes i:nth-child(1){left:5%;animation-duration:11s;animation-delay:0s}
  .hero-motes i:nth-child(2){left:13%;animation-duration:13s;animation-delay:2.1s}
  .hero-motes i:nth-child(3){left:22%;animation-duration:9s;animation-delay:4.4s}
  .hero-motes i:nth-child(4){left:31%;animation-duration:12s;animation-delay:.8s}
  .hero-motes i:nth-child(5){left:39%;animation-duration:10s;animation-delay:3.2s}
  .hero-motes i:nth-child(6){left:47%;animation-duration:14s;animation-delay:5.5s}
  .hero-motes i:nth-child(7){left:55%;animation-duration:9.5s;animation-delay:1.6s}
  .hero-motes i:nth-child(8){left:63%;animation-duration:12.5s;animation-delay:3.9s}
  .hero-motes i:nth-child(9){left:71%;animation-duration:10.5s;animation-delay:6.2s}
  .hero-motes i:nth-child(10){left:79%;animation-duration:13.5s;animation-delay:.4s}
  .hero-motes i:nth-child(11){left:86%;animation-duration:9.8s;animation-delay:4.9s}
  .hero-motes i:nth-child(12){left:92%;animation-duration:11.5s;animation-delay:2.7s}
  .hero-motes i:nth-child(13){left:9%;animation-duration:12.2s;animation-delay:7s}
  .hero-motes i:nth-child(14){left:76%;animation-duration:10.8s;animation-delay:5.1s}
  @keyframes moteDrift{0%{transform:translate3d(0,0,0);opacity:0}12%{opacity:.65}82%{opacity:.18}100%{transform:translate3d(26px,-520px,0);opacity:0}}
  @media (max-width:640px){.hero-motes i:nth-child(n+8){display:none}.hero-motes i{animation-duration:14s}}
  .ep-thumb{position:relative}
  .wave{position:absolute;right:10px;bottom:10px;display:flex;gap:3px;align-items:flex-end;height:16px;opacity:.85}
  .wave i{width:3px;height:16px;background:var(--lime);border-radius:1px;transform:scaleY(.3);transform-origin:bottom;transition:transform .2s ease}
  .ep-card:hover .wave i{animation:wavebar 1s ease-in-out infinite}
  .ep-card:hover .wave i:nth-child(2){animation-delay:.15s}
  .ep-card:hover .wave i:nth-child(3){animation-delay:.3s}
  .ep-card:hover .wave i:nth-child(4){animation-delay:.45s}
  .ep-card:hover .wave i:nth-child(5){animation-delay:.6s}
  @keyframes wavebar{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}
  .ep-thumb img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--navy2)}
  .ep-body{padding:18px}
  .ep-num{color:var(--lime);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-family:'JetBrains Mono',monospace}
  .ep-body h3{font-size:17px;margin:8px 0 4px;line-height:1.3}
  .ep-body p{color:var(--muted);font-size:13px}
  .shorts-wall{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;max-width:800px;margin:0 auto}
  .short-card{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;text-decoration:none;color:var(--ink);display:block}
  .short-card:hover{border-color:var(--lime)}
  .short-thumb img{width:100%;aspect-ratio:9/16;object-fit:cover;display:block;background:var(--navy2)}
  .short-title{font-size:12px;padding:10px 10px 2px;color:var(--ink)}
  .short-date{font-size:11px;padding:0 10px 10px;color:var(--muted)}
  .empty-note{text-align:center;color:var(--muted);font-size:14px}
  .articles{display:flex;flex-direction:column;gap:36px;max-width:760px;margin:0 auto}
  .article{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:32px}
  .article-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap}
  .article h3{font-size:22px;margin:6px 0 8px;line-height:1.3}
  .article-dek{color:var(--muted);font-size:15px;margin-bottom:16px}
  .article p{margin-bottom:14px;font-size:15px;color:#D6DCE8}
  .article-watch{display:inline-block;margin-top:6px;font-weight:600;font-size:14px}
  .article h3 a.article-title-link{color:inherit;text-decoration:none}
  .article h3 a.article-title-link:hover{color:var(--lime)}
  .quote{text-align:center;max-width:700px;margin:0 auto}
  .quote blockquote{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-weight:500;font-size:clamp(22px,3vw,30px);margin-bottom:20px}
  .quote p{color:var(--muted);font-size:16px}
  .strip{text-align:center;background:var(--lime)}
  .strip h2{color:var(--navy)}
  .strip-ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:20px}
  .strip .cta-btn.primary{background:var(--navy);color:var(--lime)}
  .strip .cta-btn.ghost{border-color:var(--navy);color:var(--navy)}
  .strip-sub{color:var(--navy);max-width:560px;margin:8px auto 0;font-size:15px}
  .listen-on{display:flex;align-items:center;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px}
  .listen-label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.14em;font-family:'JetBrains Mono',monospace}
  .listen-on .cta-btn{font-size:13px;padding:8px 16px}
  footer .listen-on{justify-content:flex-start;margin-top:12px}
  .start-here{color:var(--muted);font-size:15px;margin-top:12px}
  .start-here a{color:var(--lime)}
  footer{border-top:1px solid var(--line);padding:32px 0;color:var(--muted);font-size:13px}
  footer .wrap{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
  footer .foot-ctas{display:flex;gap:10px}
  .subscribe-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(10,22,40,.96);backdrop-filter:blur(8px);border-top:1px solid var(--line);z-index:20}
  .sb-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 20px;flex-wrap:wrap}
  .sb-inner span{color:var(--muted);font-size:13px}
  .sb-actions{display:flex;gap:10px;flex-wrap:wrap}
  .sb-btn{display:inline-block;background:var(--lime);color:var(--navy);font-weight:700;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;white-space:nowrap}
  .sb-btn:hover{filter:brightness(1.08)}
  .sb-ghost{display:inline-block;background:transparent;color:var(--ink);border:1px solid var(--line);font-weight:700;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;white-space:nowrap}
  .sb-ghost:hover{border-color:var(--lime);color:var(--lime)}
  body{padding-bottom:58px}
  @media (max-width:820px){
    .hero{padding:72px 0 48px}
    .nav{height:auto;padding:12px 0}
  }
`;

// One article per published episode. Verified facts only, sourced from episode
// transcripts / show notes / fact-checks in RESEARCH — never the raw recording.
// Cleared for publish 30 Aug 2026: fact pass (Jenny/Oksana) and voice pass
// (Stephanie) both done, Robin waived further approval gates — draft badges
// removed accordingly. See WORK_LOGS for the QA trail if any article changes.
const ARTICLES = [
  {
    episodeNumber: 1,
    slug: "ai-harness-over-model",
    title: "What is an AI harness — and why does it matter more than picking a model?",
    dek: "Robin Leonard and Tobi Webster open Act Without Asking on the shift companies keep missing.",
    body: [
      "Every AI conversation right now starts with the model. Robin and Tobi's opening argument is that the model is the least interesting decision left to make — it's a commodity, and everyone has access to the same handful of frontier options. The decision that actually determines whether AI does anything useful inside a business is the harness: the scaffolding that connects a model to your data, your tools, and the permission to act.",
      "The episode traces the shift from \"AI-enabled\" (a chatbot bolted onto existing workflows) to \"AI-native\" (a business rebuilt around agents that can actually do the work). That distinction sets up the rest of the show — later episodes about multiplayer agents and agent memory both build on the harness idea introduced here.",
      "They also get into cloud vs on-prem hosting and data sovereignty — questions Robin and Tobi argue every director should already be asking before an agent touches customer data, not after.",
    ],
  },
  {
    episodeNumber: 2,
    slug: "multiplayer-agents",
    title: "Multiplayer agents: what changes when AI works as a teammate, not a chat window",
    dek: "One agent answering questions is a demo. A team of named agents working alongside you — and your colleagues — is a different operating model.",
    body: [
      "\"The LLM models, they're a commodity. Everyone's got access to them. No one has more access than anyone else right now. The actual moat is having the harness work with the intelligence APIs.\" That's the frame Robin opens with, and it's the thread that runs through the whole episode: multiplayer agents aren't a bigger chatbot, they're agents with names, profiles, and tasks, living inside the same WhatsApp, Slack, or Teams thread your team already uses — talking to your colleagues, not just to you.",
      "Tobi and Robin also dig into who can actually afford to take that risk. Their read: small, nimble companies have a real advantage here — a \"David and Goliath\" dynamic where larger, more risk-averse organisations move slower precisely because they have more to protect. Solopreneurs and SMBs can install, test, and iterate on multiplayer agent platforms in a way most enterprise teams can't yet.",
      "It's an early, honest look at where the two hosts see this heading — closer to something like a genuinely present digital teammate than the clunky first-generation version most people are using today.",
    ],
  },
  {
    episodeNumber: 3,
    slug: "agent-memory",
    title: "The Brain: what happens when an agent runs out of memory",
    dek: "Robin's own agent started producing garbled output when it hit a hard memory limit — this episode is the story of building it a real memory system.",
    body: [
      "This episode opens somewhere unexpected — Robin's trip to a blockchain and AI conference in Manila, and a discussion of how differently AI adoption is moving across the US, Europe, Asia, and Australia — before landing on its real subject: what it actually takes to give an AI agent a working memory.",
      "The story: Robin's own Hermes-based agent hit a hard 2,000-character limit on its persistent memory and started producing garbled text. The fix he walks through on the show is a proper memory architecture — a vector-database \"world model,\" a wiki-style knowledge base, and a nightly processing job (he calls it \"REM sleep\") that consolidates what the agent learned that day. On top of that sits a four-tier classification for what the agent is allowed to remember, from public information through to strictly personal.",
      "It's a rare look at the unglamorous infrastructure problem behind every AI agent that seems to \"know\" you — memory doesn't happen for free, and this episode is the most concrete build-log the show has done so far.",
    ],
  },
  {
    episodeNumber: 4,
    slug: "we-moved-onto-buzz",
    title: "We moved our business onto Buzz. Here's what actually happened.",
    dek: "Jack Dorsey's Block launched an agent-native chat platform for teams of people and agents. Robin and Tobi run their real company on it — and talk about what that's actually like.",
    body: [
      "Block launched Buzz on 21 July 2026 — an open-source, Nostr-based group chat platform built, in Dorsey's own words, \"for teams of people and agents of all sizes.\" Robin and Tobi didn't just review it — they moved their own business onto it, and this episode is the honest account of what that took. <a href=\"https://block.xyz/inside/introducing-buzz-where-humans-and-agents-work-together\" target=\"_blank\" rel=\"noopener\">Source: Block's launch announcement, 21 July 2026</a>.",
      "The setup pain is real and specific: keys, environment variables, access control — the unglamorous plumbing that comes before any of the upside shows up. Once it's running, auto-transcribing every voice note changes how a team actually talks to each other, and the hosts get into how agents end up spreading bottom-up inside larger companies, one team at a time, well before any formal rollout.",
      "They don't skip the hard part either: the prompt-injection risk that nobody in this space has fully solved yet. Robin's answer for why he stays on Buzz anyway comes down to one thing — sovereignty over his own data and AI infrastructure, even against easier, more polished closed alternatives.",
      "One correction worth noting here since the show is committed to getting numbers right: an on-air stat about companies listing AI agents on their org charts was corrected after broadcast — the accurate figure is 23%, roughly one in four, not the 25% said on air.",
    ],
  },
];

// Transcript + show-notes slots per episode. Arch gate condition satisfied
// (Kate's four passes landed 3 Sept): transcripts filled data-only from
// scripts/episode-transcripts.mjs (GENERATED from Kate's site-pass files;
// conversion rules in its header — trims applied, cut annotations and inline
// flag markers never render, "Host" labels kept, spoken claims kept).
// Show notes stay per-episode gated (Ep 2's HELD until that episode
// publishes) and nothing renders showNotesHtml yet, so transcripts only:
const EPISODE_EXTRAS = Object.fromEntries(
  Object.entries(EPISODE_TRANSCRIPTS).map(([n, t]) => [n, { transcriptHtml: t.transcriptHtml }])
);

function markCTA({ label, href, kind = "primary", utm = null }) {
  const isPending = href == null;
  const finalHref = isPending ? "#" : (utm ? ytUtm(href, utm) : href);
  const bg = kind === "primary" ? LIME : "transparent";
  const color = kind === "primary" ? NAVY : INK;
  const border = kind === "primary" ? "none" : `1px solid ${LINE}`;
  const pendingAttr = isPending ? ` data-pending="true" aria-disabled="true" title="LinkedIn page URL pending — placeholder"` : "";
  return `<a class="cta-btn ${kind}" href="${finalHref}"${pendingAttr}>${label}${isPending ? " (link pending)" : ""}</a>`;
}

function chevronMark({ w = 26, h = 20, opacity = 1 } = {}) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 60 40" aria-hidden="true" style="opacity:${opacity}"><g fill="${LIME}"><path d="M0 0 L16 20 L0 40 L12 40 L28 20 L12 0 Z"/><path d="M20 0 L36 20 L20 40 L32 40 L48 20 L32 0 Z"/><path d="M40 0 L56 20 L40 40 L52 40 L60 28 L60 12 Z" opacity=".55"/></g></svg>`;
}

function episodeSlug(ep) {
  const clean = ep.title.replace(/\s*\|\s*Episode\s+\d+\s*$/i, "").trim();
  return clean
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// DoD #1: latest episode playable above the fold. Click-to-play facade — the
// page ships only the thumbnail (fast, no third-party runtime dependency on
// load); the YouTube iframe (privacy-enhanced nocookie domain) is injected on
// click. Consistent with the arch ruling: static build output, no runtime
// fetch until the visitor asks to play.
function youtubeId(ep) {
  const m = String(ep.url).match(/[?&]v=([\w-]+)/);
  return m ? m[1] : null;
}

function featuredPlayer(ep) {
  const videoId = youtubeId(ep);
  if (!videoId) return "";
  const cleanTitle = ep.title.replace(/\s*\|\s*Episode\s+\d+\s*$/i, "").trim();
  const label = `Play the latest episode — Episode ${ep.episodeNumber}: ${cleanTitle}`;
  return `<div class="featured">
  <button class="featured-facade" type="button" data-yt="${escapeHtml(videoId)}" aria-label="${escapeHtml(label)}">
    <img src="${escapeHtml(ep.thumbnail)}" alt="" loading="lazy">
    <span class="featured-label"><span class="ep-num">Latest — Episode ${String(ep.episodeNumber).padStart(2, "0")}</span> ${escapeHtml(cleanTitle)}</span>
    <span class="featured-play" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="${NAVY}"><path d="M8 5v14l11-7z"/></svg></span>
  </button>
</div>
<script>
document.querySelectorAll(".featured-facade").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var wrap = btn.parentElement;
    var iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube-nocookie.com/embed/" + btn.getAttribute("data-yt") + "?autoplay=1&rel=0";
    iframe.title = btn.getAttribute("aria-label");
    iframe.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    wrap.classList.add("playing");
    wrap.replaceChildren(iframe);
  });
});
</script>`;
}

function episodeCard(ep, { internal = false } = {}) {
  const cleanTitle = ep.title.replace(/\s*\|\s*Episode\s+\d+\s*$/i, "").trim();
  const dateStr = new Date(ep.published).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const href = internal ? `/episodes/${episodeSlug(ep)}/` : ep.url;
  const external = internal ? "" : ` target="_blank" rel="noopener"`;
  const cta = internal ? "Episode page" : "Watch on YouTube";
  return `
    <a class="ep-card" href="${escapeHtml(href)}"${external}>
      <div class="ep-thumb"><img src="${escapeHtml(ep.thumbnail)}" alt="${escapeHtml(`${cleanTitle} — Episode ${ep.episodeNumber}`)}" loading="lazy"><span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div>
      <div class="ep-body">
        <span class="ep-num">Episode ${String(ep.episodeNumber).padStart(2, "0")}</span>
        <h3>${escapeHtml(cleanTitle)}</h3>
        <p>${dateStr} · ${cta}</p>
      </div>
    </a>`;
}

function shortCard(s) {
  const dateStr = new Date(s.published).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `
    <a class="short-card" href="${escapeHtml(ytUtm(s.url, { medium: "shorts_wall", campaign: "watch", content: (String(s.url).match(/shorts\/([\w-]+)/) || [])[1] }))}" target="_blank" rel="noopener">
      <div class="short-thumb"><img src="${escapeHtml(s.thumbnail)}" alt="${escapeHtml(s.title)}" loading="lazy"></div>
      <p class="short-title">${escapeHtml(s.title.replace(/#shorts/i, "").trim())}</p>
      <p class="short-date">${dateStr}</p>
    </a>`;
}

function articleBlock(article, episodesByNumber) {
  const ep = episodesByNumber.get(article.episodeNumber);
  const linked = ep ? `<a class="article-watch" href="${escapeHtml(ytUtm(ep.url, { medium: "article", campaign: "watch", content: article.slug }))}" target="_blank" rel="noopener">Watch Episode ${article.episodeNumber} →</a>` : "";
  return `
    <article class="article" id="article-${article.episodeNumber}">
      <div class="article-head">
        <span class="ep-num">Episode ${String(article.episodeNumber).padStart(2, "0")}</span>
      </div>
      <h3><a class="article-title-link" href="/articles/${article.slug}/">${article.title}</a></h3>
      <p class="article-dek">${article.dek}</p>
      ${article.body.map((p) => `<p>${p}</p>`).join("\n      ")}
      ${linked}
    </article>`;
}

async function main() {
  const dataRaw = await readFile(path.join(ROOT, "data", "youtube.json"), "utf8");
  const data = JSON.parse(dataRaw);
  const episodesByNumber = new Map(data.episodes.map((e) => [e.episodeNumber, e]));
  // Feed runs Ep 1→N in order, so the latest episode is the LAST element —
  // not episodes[0] (Kate's flag: the homepage og:image was sharing Ep 1).
  // Latest = newest by PUBLISHED DATE (DoD v1.1), not array position — an
  // out-of-order publish must not silently share/link the wrong episode
  // (QA Low, Yoshi 1 Sep). Today the last element wins anyway.
  const latestEp = data.episodes.length
    ? data.episodes.reduce((a, b) => (new Date(b.published) > new Date(a.published) ? b : a))
    : null;
  // A4 "Start here" anchor: Episode 1, lowest episodeNumber (not array order).
  const firstEp = [...data.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)[0] ?? null;
  // P2 branded share card (assets/og-card.png, committed — Netlify builds have
  // no renderer; regenerate with assets/og-card-source.html + headless Chrome).
  // Default for pages with no natural image (episodes index, about, subscribe,
  // privacy, 404). Homepage/episodes/articles/twins keep real episode
  // thumbnails per the DoD v2 ruling.
  const BRAND_OG = `${SITE_URL}/og-card.png`;
  await copyFile(path.join(ROOT, "assets", "og-card.png"), path.join(DIST, "og-card.png")).catch(() => {});
  const DEFAULT_OG = BRAND_OG;

  const ageDays = (Date.now() - new Date(data.fetchedAt).getTime()) / 86400000;
  const isStale = data.source !== "live" || ageDays > 14;

  const episodeCards = data.episodes.map((e) => episodeCard(e, { internal: true })).join("\n");
  const shortCards = data.shorts.length
    ? data.shorts.map(shortCard).join("\n")
    : `<p class="empty-note">No Shorts published yet — this section fills in automatically as they go live.</p>`;
  const articleBlocks = ARTICLES.filter((a) => episodesByNumber.has(a.episodeNumber))
    .map((a) => articleBlock(a, episodesByNumber))
    .join("\n");

  const headerCTAs = `
      ${markCTA({ label: "Subscribe on YouTube", href: YOUTUBE_SUBSCRIBE, utm: { medium: "nav", campaign: "subscribe" } })}`;

  const footerCTAs = `
        ${markCTA({ label: "Subscribe on YouTube", href: YOUTUBE_SUBSCRIBE, utm: { medium: "footer", campaign: "subscribe" } })}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Act Without Asking — The agentic AI podcast</title>
<meta name="description" content="AI agents doing real work — and the moment you stop supervising them. Hosted by Robin Leonard and Tobi Webster.">
<meta property="og:title" content="Act Without Asking — The agentic AI podcast">
<meta property="og:description" content="AI agents doing real work — and the moment you stop supervising them. Hosted by Robin Leonard and Tobi Webster.">
<meta property="og:image" content="${escapeHtml(latestEp?.thumbnail ?? "")}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Act Without Asking — The agentic AI podcast">
<meta name="twitter:description" content="AI agents doing real work — and the moment you stop supervising them. Hosted by Robin Leonard and Tobi Webster.">
<meta name="twitter:image" content="${escapeHtml(latestEp?.thumbnail ?? "")}">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:type" content="website">
<link rel="canonical" href="${SITE_URL}/">
<script type="application/ld+json">
${jsonLdSafe({
  "@context": "https://schema.org",
  "@type": "PodcastSeries",
  name: "Act Without Asking",
  url: SITE_URL,
  description: "AI agents doing real work — and the moment you stop supervising them. Hosted by Robin Leonard and Tobi Webster.",
  author: [
    { "@type": "Person", name: "Robin Leonard" },
    { "@type": "Person", name: "Tobi Webster" },
  ],
}, null, 2)}
</script>
${isStale ? `<!-- BUILD WARNING: YouTube data source="${data.source}", fetchedAt=${data.fetchedAt} (${ageDays.toFixed(1)} days old). This build shipped with stale/fallback data rather than failing. -->` : ""}
<link rel="stylesheet" href="/site.css">
</head>
<body>

<header>
  <div class="wrap nav">
    <a class="brand" href="#top">${chevronMark()} Act Without Asking</a>
    <div class="nav-ctas"><a class="cta-btn ghost" href="/articles/">Blog</a>${headerCTAs}</div>
  </div>
</header>

<main id="top">
  <div class="hero">
    <div class="hero-motes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <p class="kicker">The Agentic AI Podcast</p>
    <h1>ACT WITHOUT<br>ASKING</h1>
    <p class="sub">AI agents doing real work — and the moment you stop supervising them.</p>
    <p class="hero-ctas">${latestEp
      ? `<a class="btn" href="/episodes/${episodeSlug(latestEp)}/">Watch the latest episode</a><a class="btn ghost" href="${ytUtm(YOUTUBE_SUBSCRIBE, { medium: "hero", campaign: "subscribe" })}" target="_blank" rel="noopener">Subscribe on YouTube</a>`
      : `<a class="btn" href="${ytUtm(YOUTUBE_SUBSCRIBE, { medium: "hero", campaign: "subscribe" })}">Watch on YouTube</a>`}</p>
    <p class="byline">Hosted by Robin Leonard and Tobi Webster — two operators who run real businesses on AI agents.</p>
    ${listenOnBlock({ compact: true })}
${latestEp ? featuredPlayer(latestEp) : ""}
  </div>

  <section id="episodes">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Full episodes</p>
        <h2>Episodes</h2>
        <p class="start-here">New here? <a href="/episodes/${firstEp ? episodeSlug(firstEp) : ""}/">Start with Episode 1</a> — the opening argument.</p>
      </div>
      <div class="eps">
${episodeCards}
      </div>
    </div>
  </section>

  <section id="shorts">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">On the feed</p>
        <h2>Shorts</h2>
      </div>
      <div class="shorts-wall">
${shortCards}
      </div>
    </div>
  </section>

  <section id="articles">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Read</p>
        <h2>Every episode, in writing.</h2>
      </div>
      <div class="articles">
${articleBlocks}
      </div>
    </div>
  </section>

  <section class="quote">
    <div class="wrap">
      <blockquote>We hand real agents real responsibility — and tell you exactly what happens next.</blockquote>
      <p>No hype, no scripts. Just two hosts figuring out — live, in public — what it actually looks like to hand an agent the keys.</p>
    </div>
  </section>

  <section class="strip">
    <div class="wrap">
      <h2>New episodes as they land.</h2>
      <p class="strip-sub">Get The Harness Kit — the checklists and templates we use on the show, free after you confirm.</p>
      <div class="strip-ctas">
        <a class="cta-btn primary" href="/subscribe/">Get the Harness Kit</a>
        <a class="cta-btn ghost" href="${ytUtm(YOUTUBE_SUBSCRIBE, { medium: "subscribe_bar", campaign: "subscribe" })}" target="_blank" rel="noopener">Subscribe on YouTube</a>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <span>© 2026 Act Without Asking · A show from Axela</span>
    <div class="foot-ctas">${footerCTAs}</div>
    ${listenOnBlock({ compact: true })}
  </div>
</footer>

</body>
</html>
`;

  // ---- Phase 0 multi-page skeleton: shared shell, inner pages, SEO artifacts ----
  const REAL_DOMAIN_LANDED = !PLACEHOLDER_HOSTS.includes("actwithoutasking.com");

  const subscribeBar = `
<div class="subscribe-bar">
  <div class="wrap sb-inner">
    <span>New episodes as they land — no hype, just the real work.</span>
    <div class="sb-actions">
      <a class="sb-btn" href="/subscribe/">Get the Harness Kit</a>
      <a class="sb-ghost" href="${ytUtm(YOUTUBE_SUBSCRIBE, { medium: "subscribe_bar", campaign: "subscribe" })}" target="_blank" rel="noopener">YouTube</a>
    </div>
  </div>
</div>`;

  const innerCSS = `
  .wrap.narrow{max-width:720px}
  .legal{padding:64px 0 96px}
  .legal h2{text-align:left;margin-bottom:6px}
  h1.legal-title{font-size:clamp(26px,4vw,36px);letter-spacing:-.01em;margin-bottom:6px;font-weight:600;text-align:left}
  .ep-page h1.legal-title,.article-page h1.legal-title,.about h1.legal-title,.nf h1.legal-title{margin-bottom:12px}
  .nf h1.legal-title{text-align:center}
  .legal .kicker,.ep-page .kicker,.article-page .kicker,.about .kicker{text-align:left}
  .legal h3{margin:28px 0 8px;font-size:19px}
  .legal p{color:#D6DCE8;margin-bottom:12px;font-size:15px}
  .legal ul{margin:0 0 14px 20px;color:#D6DCE8;font-size:15px}
  .legal li{margin-bottom:8px}
  .legal .updated{color:var(--muted);font-size:13px;font-family:'JetBrains Mono',monospace}
  .sub-left{color:var(--muted);max-width:560px}
  .kit-list{margin:0 0 24px 20px;color:#D6DCE8;font-size:15px}
  .kit-list li{margin-bottom:8px}
  .subscribe-form{display:flex;flex-direction:column;gap:10px;max-width:420px;margin:24px 0}
  .subscribe-form label{font-size:14px;font-weight:600}
  .subscribe-form input{background:var(--navy2);border:1px solid var(--line);border-radius:6px;padding:12px;color:var(--ink);font-size:15px}
  .subscribe-form button{background:var(--lime);color:var(--navy);border:none;border-radius:6px;padding:12px;font-weight:700;font-size:15px;cursor:pointer}
  .subscribe-form input:disabled,.subscribe-form button:disabled{opacity:.5;cursor:not-allowed}
  .form-note{color:var(--muted);font-size:13px}
  .alt{color:var(--muted);font-size:14px}
  .nf{padding:120px 0;text-align:center}
  .nf h2{margin-bottom:12px}
  .nf p{color:var(--muted);margin-bottom:24px}
  code{font-family:'JetBrains Mono',monospace;background:var(--navy2);padding:2px 6px;border-radius:4px;font-size:13px}
  .crumb{color:var(--muted);font-size:13px;margin-bottom:18px}
  .crumb a{color:var(--muted)}
  .crumb a:hover{color:var(--lime)}
  .ep-page h2{text-align:left}
  .ep-meta{color:var(--muted);font-size:14px;margin:6px 0 20px}
  .ep-hero{width:100%;border-radius:10px;border:1px solid var(--line);display:block;margin-bottom:24px;background:var(--navy2)}
  .ep-page .dek{color:var(--muted);font-size:16px;margin-bottom:20px}
  .transcript-slot{margin-top:36px;border-top:1px solid var(--line);padding-top:24px}
  .transcript-slot h3{font-size:19px;margin-bottom:10px}
  .articles-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
  .article-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:22px;text-decoration:none;color:var(--ink);display:block;transition:transform .15s ease,border-color .15s ease}
  .article-card:hover{transform:translateY(-3px);border-color:var(--lime)}
  .article-card h3{font-size:17px;margin:8px 0 6px;line-height:1.35}
  .article-card p{color:var(--muted);font-size:13px}
  .article-card .article-date{font-size:12px;margin-top:10px;font-family:'JetBrains Mono',monospace;letter-spacing:.04em}
  .article-page h2{text-align:left}
  .article-page .dek{color:var(--muted);font-size:16px;margin-bottom:20px}
  .article-page p{color:#D6DCE8;margin-bottom:14px;font-size:15px}
  .about h2{text-align:left}
  .about p{color:#D6DCE8;margin-bottom:14px;font-size:15px}
  .about .host{margin-bottom:22px}
  .about .host strong{display:block;font-size:17px;margin-bottom:4px}
  .about .host span{color:var(--muted);font-size:14px}
  `;

  const MOTION_TILT_JS = `<script>
/* Motion layer v1 - card tilt. Self-guarding: pointer-fine devices only,
   disabled under prefers-reduced-motion. Compositor-only transform; the
   inline transform preserves the CSS hover lift while tilting. */
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  var MAX = 3;
  document.querySelectorAll(".ep-card").forEach(function (card) {
    card.addEventListener("mousemove", function (e) {
      var r = card.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5;
      var dy = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = "translateY(-3px) perspective(600px) rotateX(" + (-dy * MAX).toFixed(2) + "deg) rotateY(" + (dx * MAX).toFixed(2) + "deg)";
    });
    card.addEventListener("mouseleave", function () { card.style.transform = ""; });
  });
})();
</scr` + `ipt>`;

  function pageShell({ path: pagePath, title, desc, body, jsonLd = null, ogImage = null }) {
    const abs = SITE_URL + pagePath;
    // DoD #5: every page shares a real og:image. Per-page where the page has a
    // natural image (episode/article thumbnails); everywhere else the latest
    // episode thumbnail as the branded default. Twitter card follows the same
    // image — summary_large_image for big episode art, summary fallback if no
    // image exists.
    const image = ogImage ?? DEFAULT_OG;
    const ogImageTags = image
      ? `<meta property="og:image" content="${escapeHtml(image)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${escapeHtml(title)}">\n<meta name="twitter:description" content="${escapeHtml(desc)}">\n<meta name="twitter:image" content="${escapeHtml(image)}">`
      : `<meta name="twitter:card" content="summary">`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${abs}">
<meta property="og:type" content="website">
${ogImageTags}
<link rel="canonical" href="${abs}">
${jsonLd ? `<script type="application/ld+json">\n${jsonLdSafe(jsonLd)}\n</script>\n` : ""}<link rel="stylesheet" href="/site.css">
<style>${innerCSS}</style>
</head>
<body>

<header>
  <div class="wrap nav">
    <a class="brand" href="/">${chevronMark({ w: 22, h: 17 })} Act Without Asking</a>
    <div class="nav-ctas">
      <a class="cta-btn ghost" href="/episodes/">Episodes</a>
      <a class="cta-btn ghost" href="/articles/">Blog</a>
      <a class="cta-btn ghost" href="/about/">About</a>
      ${markCTA({ label: "Subscribe on YouTube", href: YOUTUBE_SUBSCRIBE, utm: { medium: "nav", campaign: "subscribe" } })}
    </div>
  </div>
</header>

<main id="top">
${body}
</main>

<footer>
  <div class="wrap">
    <span>© 2026 Act Without Asking · A show from Axela</span>
    <div class="foot-ctas">${footerCTAs}</div>
    ${listenOnBlock({ compact: true })}
  </div>
</footer>
${subscribeBar}
${MOTION_TILT_JS}
</body>
</html>
`;
  }

  // Privacy page — copy passed by Stephanie's proxy review 31 Aug (gate cleared).
  // The contact address is a marked placeholder until the domain lands; once the
  // real domain is set, a leftover placeholder FAILS the build (domain-gate).
  const privacyBody = `
  <section class="legal">
    <div class="wrap narrow">
      <p class="kicker">Privacy</p>
      <h1 class="legal-title">Everything we collect, and why.</h1>
      <p class="updated">Last updated: 31 August 2026.</p>

      <h3>Who we are</h3>
      <p>Act Without Asking is a podcast hosted by Robin Leonard and Tobi Webster. For any privacy request — access, correction, or deletion of your data — email <code>CONTACT_ADDRESS_PENDING_DOMAIN</code>. A human reads it.</p>

      <h3>The email list</h3>
      <p>When you subscribe, we collect your email address. That's it — no name required, no other fields.</p>
      <ul>
        <li><strong>What you get:</strong> new episodes, and "The Harness Kit" (checklists and templates from the show) after you confirm.</li>
        <li><strong>Double opt-in:</strong> you subscribe, we send a confirmation email, you're on the list only after you click it. No confirmation, no emails — we never add anyone who didn't ask.</li>
        <li><strong>Who sends the emails:</strong> our newsletter is handled by MailerLite, an email service. They send our emails and store the list on our instructions. They don't get to use your address for anything else.</li>
        <li><strong>Consent record:</strong> when you confirm, we store your email address, the time, and the page you subscribed from. Nothing else. This is our proof you asked.</li>
        <li><strong>Unsubscribe:</strong> every email has an unsubscribe link. One click, immediate, no "are you sure" games.</li>
      </ul>
      <p><strong>We do not sell, rent, or share your email address. Ever.</strong></p>

      <h3>Analytics</h3>
      <p>No Google Analytics, no ad trackers, no third-party cookies. If we ever add analytics, it will be self-hosted and first-party — and this page will say exactly what we collect before it turns on.</p>

      <h3>The twins</h3>
      <p>If you chat with the Robin and Tobi twins on this site, we do not store your questions or their answers — nothing you type is kept. We log aggregate counts only (how many questions are asked, which handoff links get clicked) so we can make the twins better. No question text, nothing that identifies you. The twins page says the same thing: no question text is stored.</p>

      <h3>YouTube</h3>
      <p>The site embeds YouTube videos. YouTube's own privacy policy applies to what they see when a video plays.</p>

      <h3>Changes</h3>
      <p>If this page changes, we date the change at the top. Material changes to how we handle your email get emailed to the list.</p>
    </div>
  </section>`;

  // Subscribe page — form ships DISABLED until the MailerLite group exists
  // (Stephanie owns). Nothing collects before the privacy page is live and the
  // vendor is wired; the disabled state is the honest interim.
  const subscribeBody = `
  <section class="legal">
    <div class="wrap narrow">
      <p class="kicker">Subscribe</p>
      <h1 class="legal-title">New episodes, straight to your inbox.</h1>
      <p class="sub-left">Get every episode and <strong>The Harness Kit</strong> — the checklists and templates we use on the show — free, after you confirm.</p>
      <ul class="kit-list">
        <li>New episode alerts — nothing else, no filler</li>
        <li>The Harness Kit: checklists and templates from the show</li>
        <li>One click to unsubscribe, any time</li>
      </ul>
      <form class="subscribe-form" data-pending="true" aria-disabled="true" onsubmit="return false">
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" placeholder="you@example.com" disabled>
        <button type="submit" disabled>Subscribe</button>
        <p class="form-note">Email capture opens with our list provider this week — the form switches on the moment it does. Double opt-in: you're only on the list after you click the confirmation email. See the <a href="/privacy/">privacy page</a> for exactly what we store.</p>
      </form>
      <p class="alt">Not into email? <a href="${ytUtm(YOUTUBE_SUBSCRIBE, { medium: "subscribe_page", campaign: "subscribe" })}" target="_blank" rel="noopener">Subscribe on YouTube</a> instead.</p>
      ${listenOnBlock({ compact: true })}
    </div>
  </section>`;

  const notFoundBody = `
  <section class="nf">
    <div class="wrap">
      <p class="kicker">404</p>
      <h1 class="legal-title">That page doesn't exist.</h1>
      <p>The episode you're after is probably on the homepage.</p>
      <a class="btn" href="/">Back to the show</a>
    </div>
  </section>`;

  // Twins Phase A: widget goes site-wide on the homepage (injected before the
  // gate loop below so the host/contact gates scan it too), /twins page ships
  // with its own embedded widget.
  const twins = await buildTwins(data, SITE_URL);
  // Retrieval corpus for the Phase B LLM path (spec §5): repo transcripts only,
  // build-generated. Episode without a videoId FAILS the build — an ungrounded
  // citation must never be possible.
  const retrieval = await writeRetrievalIndex({ episodes: data.episodes, writeFile });
  const homepageHtml = html.replace("</body>", `${twins.widget}\n${subscribeBar}\n${MOTION_TILT_JS}\n</body>`);
  if (!homepageHtml.includes("twinsWidget")) throw new Error("[twins-gate] widget injection into index.html failed");

  // ---- Multi-page routes (arch v1: /episodes, /episodes/[slug],
  // /articles/[slug], /about). Transcript slots stay gated until Kate's four
  // passes land Wed 2 Sept midday — episode pages ship with an honest
  // "coming soon" slot until then, same pass fills them, no second merge. ----
  const articlesByEpisode = new Map(ARTICLES.map((a) => [a.episodeNumber, a]));
  const podcastSeriesRef = { "@type": "PodcastSeries", name: "Act Without Asking", url: SITE_URL };
  const cleanEpTitle = (ep) => ep.title.replace(/\s*\|\s*Episode\s+\d+\s*$/i, "").trim();
  const epDek = (ep) =>
    articlesByEpisode.get(ep.episodeNumber)?.dek ??
    `Episode ${ep.episodeNumber} of Act Without Asking — AI agents doing real work.`;
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  // Page <title>: keep the full brand suffix when the base headline is short
  // enough; drop to "— Episode N", then to the bare headline, as length grows
  // (QA Low: Google truncates >~60-char titles — don't lose the words to the
  // suffix). Wording untouched, length only (Jane ruling, 1 Sep).
  const pageTitle = (base, epNum) => {
    const full = epNum
      ? `${base} — Act Without Asking, Episode ${epNum}`
      : `${base} — Act Without Asking`;
    if (full.length <= 60) return full;
    const short = epNum ? `${base} — Episode ${epNum}` : base;
    return short.length <= 60 ? short : base;
  };

  function episodeRoute(ep) {
    const slug = episodeSlug(ep);
    const article = articlesByEpisode.get(ep.episodeNumber);
    const extras = EPISODE_EXTRAS[ep.episodeNumber] ?? {};
    const articleSection = article
      ? `
      <div class="transcript-slot">
        <h3>What this episode covers</h3>
        ${article.body.map((p) => `<p>${p}</p>`).join("\n        ")}
        <p><a href="/articles/${article.slug}/">Read the full article →</a></p>
      </div>`
      : "";
    const transcriptSlot = `
      <div class="transcript-slot">
        <h3>Transcript</h3>
        ${extras.transcriptHtml ?? `<p class="empty-note">The full transcript is coming soon.</p>`}
      </div>`;
    const body = `
  <section class="ep-page legal">
    <div class="wrap narrow">
      <p class="crumb"><a href="/episodes/">← All episodes</a></p>
      <p class="kicker">Episode ${String(ep.episodeNumber).padStart(2, "0")}</p>
      <h1 class="legal-title">${escapeHtml(cleanEpTitle(ep))}</h1>
      <p class="ep-meta">${fmtDate(ep.published)} · Robin Leonard and Tobi Webster</p>
      <img class="ep-hero" src="${escapeHtml(ep.thumbnail)}" alt="${escapeHtml(`${cleanEpTitle(ep)} — Episode ${ep.episodeNumber} thumbnail`)}">
      <p class="dek">${escapeHtml(epDek(ep))}</p>
      <a class="btn" href="${escapeHtml(ytUtm(ep.url, { medium: "episode_page", campaign: "watch", content: slug }))}" target="_blank" rel="noopener">Watch on YouTube</a>
      ${articleSection}
      ${transcriptSlot}
    </div>
  </section>`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "PodcastEpisode",
      url: `${SITE_URL}/episodes/${slug}/`,
      name: cleanEpTitle(ep),
      description: epDek(ep),
      datePublished: ep.published,
      episodeNumber: ep.episodeNumber,
      image: ep.thumbnail,
      associatedMedia: {
        "@type": "VideoObject",
        name: ep.title,
        url: ep.url,
        thumbnailUrl: ep.thumbnail,
        uploadDate: ep.published,
      },
      partOfSeries: podcastSeriesRef,
    };
    return [
      `episodes/${slug}/index.html`,
      pageShell({
        path: `/episodes/${slug}/`,
        title: pageTitle(cleanEpTitle(ep), ep.episodeNumber),
        desc: epDek(ep),
        body,
        jsonLd,
        ogImage: ep.thumbnail,
      }),
    ];
  }

  function articleRoute(article) {
    const ep = episodesByNumber.get(article.episodeNumber);
    const watch = ep
      ? `<p><a class="article-watch" href="${escapeHtml(ytUtm(ep.url, { medium: "article", campaign: "watch", content: article.slug }))}" target="_blank" rel="noopener">Watch Episode ${article.episodeNumber} →</a></p>`
      : "";
    const body = `
  <section class="article-page legal">
    <div class="wrap narrow">
      <p class="crumb"><a href="/episodes/${ep ? episodeSlug(ep) : ""}/">← ${ep ? `Episode ${article.episodeNumber}` : "All episodes"}</a></p>
      <p class="kicker">Read · Episode ${String(article.episodeNumber).padStart(2, "0")}</p>
      <h1 class="legal-title">${article.title}</h1>
      <p class="dek">${article.dek}</p>
      ${article.body.map((p) => `<p>${p}</p>`).join("\n      ")}
      ${watch}
    </div>
  </section>`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.dek,
      image: ep?.thumbnail,
      datePublished: ep?.published,
      author: [
        { "@type": "Person", name: "Robin Leonard" },
        { "@type": "Person", name: "Tobi Webster" },
      ],
      publisher: { "@type": "Organization", name: "Act Without Asking" },
      mainEntityOfPage: `${SITE_URL}/articles/${article.slug}/`,
      isPartOf: podcastSeriesRef,
    };
    return [
      `articles/${article.slug}/index.html`,
      pageShell({
        path: `/articles/${article.slug}/`,
        title: pageTitle(article.title, null),
        desc: article.dek,
        body,
        jsonLd,
        ogImage: ep?.thumbnail ?? null,
      }),
    ];
  }

  const episodesIndexBody = `
  <section class="legal">
    <div class="wrap">
      <p class="kicker">Episodes</p>
      <h1 class="legal-title">Every episode, in order.</h1>
      <div class="eps" style="margin-top:32px">
${data.episodes.map((e) => episodeCard(e, { internal: true })).join("\n")}
      </div>
    </div>
  </section>`;

  const aboutBody = `
  <section class="about legal">
    <div class="wrap narrow">
      <p class="kicker">About</p>
      <h1 class="legal-title">Two operators. No demos.</h1>
      <p>Act Without Asking is hosted by Robin Leonard and Tobi Webster — two operators who run AI agents inside real businesses every day. Not demos, not slide decks: keys handed over, inboxes connected, decisions made without us in the room.</p>
      <p>The name is the ethos: bias toward action. Stop waiting for permission. Just do the thing. But the moment you hand an agent real work, acting without asking stops being a slogan and becomes a decision: how much rope do you give it? What is it allowed to do on its own — and when it gets it wrong, whose fault is it? We don't have final answers. We have the experiment: run it on ourselves, live, in public, and tell you what actually happened.</p>
      <div class="host">
        <strong>Robin Leonard — host</strong>
        <span>Serial builder. Runs real businesses on AI agents, and shows the plumbing on the show — the access keys, the memory limits, the prompt-injection risks nobody has fully solved yet.</span>
      </div>
      <div class="host">
        <strong>Tobi Webster — co-host</strong>
        <span>Robin's consulting partner at Axela, their AI-first consulting practice. Brings the business and operations side of every conversation.</span>
      </div>
      <p>New episodes on <a href="${ytUtm(YOUTUBE_CHANNEL, { medium: "about_page", campaign: "channel" })}" target="_blank" rel="noopener">YouTube</a> — and in your inbox if you <a href="/subscribe/">subscribe</a>.</p>
    </div>
  </section>`;

  const articlesIndexBody = `
  <section class="legal">
    <div class="wrap">
      <p class="kicker">Blog</p>
      <h1 class="legal-title">Every episode, in writing.</h1>
      <div class="articles-list" style="margin-top:32px">
${ARTICLES.filter((a) => episodesByNumber.has(a.episodeNumber)).map((a) => {
  const ep = episodesByNumber.get(a.episodeNumber);
  const date = ep?.published
    ? new Date(ep.published).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
    : "";
  return `        <a class="article-card" href="/articles/${a.slug}/">
          <span class="ep-num">Episode ${String(a.episodeNumber).padStart(2, "0")}</span>
          <h3>${a.title}</h3>
          <p>${a.dek}</p>${date ? `\n          <p class="article-date">${date}</p>` : ""}
        </a>`;
}).join("\n")}
      </div>
    </div>
  </section>`;

  const articleRoutes = ARTICLES.filter((a) => episodesByNumber.has(a.episodeNumber))
    .map(articleRoute);
  const pages = [
    ["index.html", homepageHtml],
    ["episodes/index.html", pageShell({ path: "/episodes/", title: "Episodes — Act Without Asking", desc: "Every episode of Act Without Asking: harnesses, multiplayer agents, agent memory, and Buzz — AI agents doing real work.", body: episodesIndexBody })],
    ["articles/index.html", pageShell({ path: "/articles/", title: "Blog — Act Without Asking", desc: "Every episode of Act Without Asking in writing — harnesses, multiplayer agents, agent memory, and what moved us onto Buzz.", body: articlesIndexBody })],
    ...data.episodes.map(episodeRoute),
    ...articleRoutes,
    ["about/index.html", pageShell({ path: "/about/", title: "About — Act Without Asking", desc: "Act Without Asking: the agentic AI podcast hosted by Robin Leonard, with Tobi Webster. Bias toward action — no hype, no scripts.", body: aboutBody, jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Person", name: "Robin Leonard", jobTitle: "Host", url: SITE_URL, sameAs: [YOUTUBE_CHANNEL] },
        { "@type": "Person", name: "Tobi Webster", jobTitle: "Co-host", url: SITE_URL, sameAs: [YOUTUBE_CHANNEL] },
        podcastSeriesRef,
      ],
    } })],
    ["subscribe/index.html", pageShell({ path: "/subscribe/", title: "Subscribe — Act Without Asking", desc: "Get new episodes and The Harness Kit — checklists and templates from the show. Double opt-in, unsubscribe any time.", body: subscribeBody })],
    ["privacy/index.html", pageShell({ path: "/privacy/", title: "Privacy — Act Without Asking", desc: "Everything Act Without Asking collects and why: your email if you subscribe, aggregate twins counts, and nothing hidden.", body: privacyBody })],
    ["404.html", pageShell({ path: "/404.html", title: "Page not found — Act Without Asking", desc: "That page doesn't exist.", body: notFoundBody })],
    ["robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`],
  ];

  // Hardcoded-host gate (arch v1 §2): no absolute URL to a placeholder host may
  // appear in any emitted page — internal absolutes derive from SITE_URL only.
  for (const [name, content] of pages) {
    for (const host of PLACEHOLDER_HOSTS) {
      if (content.includes(host)) throw new Error(`[host-gate] ${name} hardcodes ${host} — derive from SITE_URL`);
    }
    if (REAL_DOMAIN_LANDED && content.includes("CONTACT_ADDRESS_PENDING_DOMAIN")) {
      throw new Error(`[domain-gate] ${name} still carries the contact placeholder after the domain landed — set the real address`);
    }
    // Key-custody gate (spec §4, flip day): no key-shaped literal and no
    // twins-LLM env var name may reach emitted assets — the key lives in
    // site-scoped env only, never the repo, never build output.
    if (KEY_SHAPE.test(content)) {
      throw new Error(`[key-gate] ${name} carries a key-shaped literal`);
    }
    if (/TWINS_LLM_(KEY|MODEL)/.test(content)) {
      throw new Error(`[key-gate] ${name} carries a twins LLM env var name — env vars live in site-scoped config, never in build output`);
    }
  }

  // Arch condition B (event 36f1e546): sitemap lastmod must be content-true.
  // Derive from youtube.json fetchedAt — changes only when the feed data
  // changes, not on every rebuild. A missing lastmod is honest; a build-date
  // one lies.
  const contentDate = data.fetchedAt.slice(0, 10);
  const sitemapPaths = [
    "/",
    "/episodes/",
    "/articles/",
    "/twins/",
    "/about/",
    "/subscribe/",
    "/privacy/",
    ...data.episodes.map((ep) => `/episodes/${episodeSlug(ep)}/`),
    ...articleRoutes.map(([name]) => `/${name.replace(/index\.html$/, "")}`),
  ];
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPaths.map((p) => `  <url><loc>${SITE_URL}${p}</loc><lastmod>${contentDate}</lastmod></url>`).join("\n")}
</urlset>
`;
  pages.push(["sitemap.xml", sitemapXml]);

  // llms.txt (Jane ruling, 1 Sep): the machine-readable signpost — the site is
  // server-rendered precisely so machines can read it; this tells them where
  // to look. Generated from the same feed data as the pages.
  const llmsTxt = `# Act Without Asking

> AI agents doing real work — and the moment you stop supervising them. Hosted by Robin Leonard and Tobi Webster. New episodes as they land on YouTube.

Act Without Asking is a podcast where two operators hand real AI agents real responsibility inside real businesses — and report exactly what happened. Every episode has a server-rendered page with the full write-up; transcripts are added as they are completed.

## Episodes

${data.episodes.map((ep) => `- [${cleanEpTitle(ep)} (Episode ${ep.episodeNumber})](${SITE_URL}/episodes/${episodeSlug(ep)}/): ${epDek(ep)}`).join("\n")}

## Articles

${ARTICLES.filter((a) => episodesByNumber.has(a.episodeNumber)).map((a) => `- [${a.title}](${SITE_URL}/articles/${a.slug}/): ${a.dek}`).join("\n")}

## Site

- [About the show and hosts](${SITE_URL}/about/)
- [Subscribe — The Harness Kit](${SITE_URL}/subscribe/)
- [Privacy](${SITE_URL}/privacy/)
- [The twins — ask the show's AI twins](${SITE_URL}/twins/)

## Listen

- YouTube: ${YOUTUBE_CHANNEL}
`;
  pages.push(["llms.txt", llmsTxt]);

  await mkdir(DIST, { recursive: true });
  await mkdir(path.join(DIST, "subscribe"), { recursive: true });
  await mkdir(path.join(DIST, "privacy"), { recursive: true });
  await mkdir(path.join(DIST, "episodes"), { recursive: true });
  await mkdir(path.join(DIST, "articles"), { recursive: true });
  for (const [name, content] of pages) {
    const out = path.join(DIST, name);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, content);
  }
  await writeFile(path.join(DIST, "site.css"), SITE_CSS);
  await mkdir(path.join(DIST, "twins"), { recursive: true });
  await writeFile(path.join(DIST, "twins", "index.html"), twins.twinsPage);
  // Redirects ship in the publish dir, not via netlify.toml. The 01 Sep 2026
  // deploys proved the toml [[redirects]] rule never reached the deploy's
  // redirect table: prod /api/ask fell through to dist/404.html (the twins
  // widget calls /api/ask, so the feature was dead for users even with the
  // function itself healthy). A _redirects file in the publish dir is
  // processed on every deploy type, so the rewrite cannot be lost again.
  await writeFile(path.join(DIST, "_redirects"), "/api/ask  /.netlify/functions/ask  200\n");
  console.log(`[build] wrote ${pages.length} pages + site.css + dist/twins/index.html + _redirects (routes: /, /episodes, ${data.episodes.length} episode pages, ${articleRoutes.length} article pages, /about, /subscribe, /privacy, 404, robots, sitemap; twins gates passed; retrieval=${retrieval.excerpts.length} excerpts; stale=${isStale})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
