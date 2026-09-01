// Renders dist/index.html from data/youtube.json + the article drafts below.
// Static output only — no client-side fetch to any third party (Oksana ruling,
// AWA channel, 30 Aug 2026: build-time static, not a runtime dependency).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildTwins } from "./build-twins.mjs";
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
  body{background:var(--navy);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:var(--lime)}
  .wrap{max-width:1100px;margin:0 auto;padding:0 20px}
  header{position:sticky;top:0;background:rgba(10,22,40,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);z-index:10}
  .nav{display:flex;align-items:center;justify-content:space-between;height:64px;gap:16px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-weight:700;letter-spacing:.02em}
  .nav-ctas{display:flex;gap:10px}
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
  .hero .byline{margin-top:20px;color:#5A6478;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.02em}
  section{padding:72px 0}
  .kicker{color:var(--lime);font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-family:'JetBrains Mono',monospace;margin-bottom:8px;text-align:center}
  h2{font-size:clamp(26px,4vw,36px);letter-spacing:-.01em;margin-bottom:8px;text-align:center;font-weight:600}
  .section-head{margin-bottom:44px}
  .eps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
  .ep-card{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;text-decoration:none;color:var(--ink);display:block;transition:transform .15s ease,border-color .15s ease}
  .ep-card:hover{transform:translateY(-3px);border-color:var(--lime)}
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

// Transcript + show-notes slots per episode. GATED (arch rule: transcripts
// precede episode-page content): Kate's four passes land Wed 2 Sept midday ICT.
// Until then this stays EMPTY and episode pages render an honest "coming soon"
// slot — fill ONLY with Kate's passed copy, keyed by episodeNumber:
//   { 1: { transcriptHtml, showNotesHtml }, ... }
const EPISODE_EXTRAS = {};

function markCTA({ label, href, kind = "primary" }) {
  const isPending = href == null;
  const finalHref = isPending ? "#" : href;
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
      <div class="ep-thumb"><img src="${escapeHtml(ep.thumbnail)}" alt="${escapeHtml(`${cleanTitle} — Episode ${ep.episodeNumber}`)}" loading="lazy"></div>
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
    <a class="short-card" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">
      <div class="short-thumb"><img src="${escapeHtml(s.thumbnail)}" alt="${escapeHtml(s.title)}" loading="lazy"></div>
      <p class="short-title">${escapeHtml(s.title.replace(/#shorts/i, "").trim())}</p>
      <p class="short-date">${dateStr}</p>
    </a>`;
}

function articleBlock(article, episodesByNumber) {
  const ep = episodesByNumber.get(article.episodeNumber);
  const linked = ep ? `<a class="article-watch" href="${escapeHtml(ep.url)}" target="_blank" rel="noopener">Watch Episode ${article.episodeNumber} →</a>` : "";
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
      ${markCTA({ label: "Subscribe on YouTube", href: YOUTUBE_SUBSCRIBE })}`;

  const footerCTAs = `
        ${markCTA({ label: "Subscribe on YouTube", href: YOUTUBE_SUBSCRIBE })}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Act Without Asking — The agentic AI podcast</title>
<meta name="description" content="Act Without Asking is a podcast about AI agents doing real work, and the moment you stop supervising them. Hosted by Robin Leonard and Tobi Webster.">
<meta property="og:title" content="Act Without Asking — The agentic AI podcast">
<meta property="og:description" content="AI agents doing real work — and the moment you stop supervising them. Hosted by Robin Leonard and Tobi Webster.">
<meta property="og:image" content="${escapeHtml(data.episodes[0]?.thumbnail ?? "")}">
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
    <div class="nav-ctas">${headerCTAs}</div>
  </div>
</header>

<main id="top">
  <div class="hero">
    <p class="kicker">The Agentic AI Podcast</p>
    <h1>ACT WITHOUT<br>ASKING</h1>
    <p class="sub">AI agents doing real work — and the moment you stop supervising them.</p>
    <a class="btn" href="${YOUTUBE_SUBSCRIBE}">Subscribe now</a>
    <p class="byline">Robin Leonard, with Tobi Webster</p>
  </div>

  <section id="episodes">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Now Playing</p>
        <h2>Episodes</h2>
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
        <h2>One article per episode</h2>
      </div>
      <div class="articles">
${articleBlocks}
      </div>
    </div>
  </section>

  <section class="quote">
    <div class="wrap">
      <blockquote>"The show about AI agents that actually get things done — not the demos, the real work."</blockquote>
      <p>No hype, no scripts. Just two hosts figuring out — live, in public — what it actually looks like to hand an agent the keys.</p>
    </div>
  </section>

  <section class="strip">
    <div class="wrap">
      <h2>New episodes, straight to your feed.</h2>
      <div class="strip-ctas">${footerCTAs}</div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <span>© 2026 Act Without Asking · A show from Axela</span>
    <div class="foot-ctas">${footerCTAs}</div>
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
    <span>New episodes weekly — no hype, just the real work.</span>
    <div class="sb-actions">
      <a class="sb-btn" href="/subscribe/">Get the Harness Kit</a>
      <a class="sb-ghost" href="${YOUTUBE_SUBSCRIBE}" target="_blank" rel="noopener">YouTube</a>
    </div>
  </div>
</div>`;

  const innerCSS = `
  .wrap.narrow{max-width:720px}
  .legal{padding:64px 0 96px}
  .legal h2{text-align:left;margin-bottom:6px}
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
  .article-page h2{text-align:left}
  .article-page .dek{color:var(--muted);font-size:16px;margin-bottom:20px}
  .article-page p{color:#D6DCE8;margin-bottom:14px;font-size:15px}
  .about h2{text-align:left}
  .about p{color:#D6DCE8;margin-bottom:14px;font-size:15px}
  .about .host{margin-bottom:22px}
  .about .host strong{display:block;font-size:17px;margin-bottom:4px}
  .about .host span{color:var(--muted);font-size:14px}
  `;

  function pageShell({ path: pagePath, title, desc, body, jsonLd = null }) {
    const abs = SITE_URL + pagePath;
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
      <a class="cta-btn ghost" href="/about/">About</a>
      ${markCTA({ label: "Subscribe on YouTube", href: YOUTUBE_SUBSCRIBE })}
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
  </div>
</footer>
${subscribeBar}
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
      <h2>Everything we collect, and why.</h2>
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
      <p>The site runs self-hosted, first-party analytics (Umami). No Google Analytics, no ad trackers, no third-party cookies. We see page counts and referrers — not you.</p>

      <h3>The twins (when live)</h3>
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
      <h2>New episodes, straight to your inbox.</h2>
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
      <p class="alt">Not into email? <a href="${YOUTUBE_SUBSCRIBE}" target="_blank" rel="noopener">Subscribe on YouTube</a> instead.</p>
    </div>
  </section>`;

  const notFoundBody = `
  <section class="nf">
    <div class="wrap">
      <p class="kicker">404</p>
      <h2>That page doesn't exist.</h2>
      <p>The episode you're after is probably on the homepage.</p>
      <a class="btn" href="/">Back to the show</a>
    </div>
  </section>`;

  // Twins Phase A: widget goes site-wide on the homepage (injected before the
  // gate loop below so the host/contact gates scan it too), /twins page ships
  // with its own embedded widget.
  const twins = await buildTwins(data, SITE_URL);
  const homepageHtml = html.replace("</body>", `${twins.widget}\n${subscribeBar}\n</body>`);
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
      <h2>${escapeHtml(cleanEpTitle(ep))}</h2>
      <p class="ep-meta">${fmtDate(ep.published)} · Hosted by Robin Leonard, with Tobi Webster</p>
      <img class="ep-hero" src="${escapeHtml(ep.thumbnail)}" alt="${escapeHtml(`${cleanEpTitle(ep)} — Episode ${ep.episodeNumber} thumbnail`)}">
      <p class="dek">${escapeHtml(epDek(ep))}</p>
      <a class="btn" href="${escapeHtml(ep.url)}" target="_blank" rel="noopener">Watch on YouTube</a>
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
        title: `${cleanEpTitle(ep)} — Act Without Asking, Episode ${ep.episodeNumber}`,
        desc: epDek(ep),
        body,
        jsonLd,
      }),
    ];
  }

  function articleRoute(article) {
    const ep = episodesByNumber.get(article.episodeNumber);
    const watch = ep
      ? `<p><a class="article-watch" href="${escapeHtml(ep.url)}" target="_blank" rel="noopener">Watch Episode ${article.episodeNumber} →</a></p>`
      : "";
    const body = `
  <section class="article-page legal">
    <div class="wrap narrow">
      <p class="crumb"><a href="/episodes/${ep ? episodeSlug(ep) : ""}/">← ${ep ? `Episode ${article.episodeNumber}` : "All episodes"}</a></p>
      <p class="kicker">Read · Episode ${String(article.episodeNumber).padStart(2, "0")}</p>
      <h2>${article.title}</h2>
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
        title: `${article.title} — Act Without Asking`,
        desc: article.dek,
        body,
        jsonLd,
      }),
    ];
  }

  const episodesIndexBody = `
  <section class="legal">
    <div class="wrap">
      <p class="kicker">Episodes</p>
      <h2>Every episode, in order.</h2>
      <div class="eps" style="margin-top:32px">
${data.episodes.map((e) => episodeCard(e, { internal: true })).join("\n")}
      </div>
    </div>
  </section>`;

  const aboutBody = `
  <section class="about legal">
    <div class="wrap narrow">
      <p class="kicker">About</p>
      <h2>Act Without Asking.</h2>
      <p>AI agents doing real work — and the moment you stop supervising them. No hype, no scripts. Just two hosts figuring out — live, in public — what it actually looks like to hand an agent the keys.</p>
      <p>The name is the ethos: bias toward action. Stop waiting for permission. Just do the thing.</p>
      <div class="host">
        <strong>Robin Leonard — host</strong>
        <span>Serial builder and consultant. Runs real businesses on AI agents, and shows the unglamorous plumbing on the show — the keys, the memory limits, the prompt-injection risks nobody has solved yet.</span>
      </div>
      <div class="host">
        <strong>Tobi Webster — co-host</strong>
        <span>Robin's consulting partner at Axela, an AI-first consulting practice. Brings the operational and business-building side of every conversation.</span>
      </div>
      <p>A show from Axela. New episodes on <a href="${YOUTUBE_CHANNEL}" target="_blank" rel="noopener">YouTube</a> — and in your inbox if you <a href="/subscribe/">subscribe</a>.</p>
    </div>
  </section>`;

  const articleRoutes = ARTICLES.filter((a) => episodesByNumber.has(a.episodeNumber))
    .map(articleRoute);
  const pages = [
    ["index.html", homepageHtml],
    ["episodes/index.html", pageShell({ path: "/episodes/", title: "Episodes — Act Without Asking", desc: "Every episode of Act Without Asking: harnesses, multiplayer agents, agent memory, and Buzz — AI agents doing real work.", body: episodesIndexBody })],
    ...data.episodes.map(episodeRoute),
    ...articleRoutes,
    ["about/index.html", pageShell({ path: "/about/", title: "About — Act Without Asking", desc: "Act Without Asking: the agentic AI podcast hosted by Robin Leonard, with Tobi Webster. Bias toward action — no hype, no scripts.", body: aboutBody })],
    ["subscribe/index.html", pageShell({ path: "/subscribe/", title: "Subscribe — Act Without Asking", desc: "Get new episodes and The Harness Kit — checklists and templates from the show. Double opt-in, unsubscribe any time.", body: subscribeBody })],
    ["privacy/index.html", pageShell({ path: "/privacy/", title: "Privacy — Act Without Asking", desc: "Everything Act Without Asking collects and why: email list, analytics, and nothing hidden.", body: privacyBody })],
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
  }

  // Arch condition B (event 36f1e546): sitemap lastmod must be content-true.
  // Derive from youtube.json fetchedAt — changes only when the feed data
  // changes, not on every rebuild. A missing lastmod is honest; a build-date
  // one lies.
  const contentDate = data.fetchedAt.slice(0, 10);
  const sitemapPaths = [
    "/",
    "/episodes/",
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
  console.log(`[build] wrote ${pages.length} pages + site.css + dist/twins/index.html (routes: /, /episodes, ${data.episodes.length} episode pages, ${articleRoutes.length} article pages, /about, /subscribe, /privacy, 404, robots, sitemap; twins gates passed; stale=${isStale})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
