// Renders dist/index.html from data/youtube.json + the article drafts below.
// Static output only — no client-side fetch to any third party (Oksana ruling,
// AWA channel, 30 Aug 2026: build-time static, not a runtime dependency).
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
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
const YOUTUBE_CHANNEL = "https://www.youtube.com/@actwithoutaskingpod";
const YOUTUBE_SUBSCRIBE = `${YOUTUBE_CHANNEL}?sub_confirmation=1`;

// One article per published episode. Verified facts only, sourced from episode
// transcripts / show notes / fact-checks in RESEARCH — never the raw recording.
// Every article is a draft: it renders with a visible "draft" badge and is not
// to be treated as final copy without a human voice pass (per Jenny's brief).
const ARTICLES = [
  {
    episodeNumber: 1,
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
    title: "We moved our business onto Buzz. Here's what actually happened.",
    dek: "Jack Dorsey's Block launched an agent-native chat platform for teams of people and agents. Robin and Tobi run their real company on it — and talk about what that's actually like.",
    body: [
      "Block launched Buzz on 21 July 2026 — an open-source, Nostr-based group chat platform built, in Dorsey's own words, \"for teams of people and agents of all sizes.\" Robin and Tobi didn't just review it — they moved their own business onto it, and this episode is the honest account of what that took.",
      "The setup pain is real and specific: keys, environment variables, access control — the unglamorous plumbing that comes before any of the upside shows up. Once it's running, auto-transcribing every voice note changes how a team actually talks to each other, and the hosts get into how agents end up spreading bottom-up inside larger companies, one team at a time, well before any formal rollout.",
      "They don't skip the hard part either: the prompt-injection risk that nobody in this space has fully solved yet. Robin's answer for why he stays on Buzz anyway comes down to one thing — sovereignty over his own data and AI infrastructure, even against easier, more polished closed alternatives.",
      "One correction worth noting here since the show is committed to getting numbers right: an on-air stat about companies listing AI agents on their org charts was corrected after broadcast — the accurate figure is 23%, roughly one in four, not the 25% said on air.",
    ],
  },
];

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

function episodeCard(ep) {
  const cleanTitle = ep.title.replace(/\s*\|\s*Episode\s+\d+\s*$/i, "").trim();
  const dateStr = new Date(ep.published).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `
    <a class="ep-card" href="${ep.url}" target="_blank" rel="noopener">
      <div class="ep-thumb"><img src="${ep.thumbnail}" alt="${cleanTitle} — Episode ${ep.episodeNumber}" loading="lazy"></div>
      <div class="ep-body">
        <span class="ep-num">Episode ${String(ep.episodeNumber).padStart(2, "0")}</span>
        <h3>${cleanTitle}</h3>
        <p>${dateStr} · Watch on YouTube</p>
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
    <a class="short-card" href="${s.url}" target="_blank" rel="noopener">
      <div class="short-thumb"><img src="${s.thumbnail}" alt="${s.title}" loading="lazy"></div>
      <p class="short-title">${s.title.replace(/#shorts/i, "").trim()}</p>
      <p class="short-date">${dateStr}</p>
    </a>`;
}

function articleBlock(article, episodesByNumber) {
  const ep = episodesByNumber.get(article.episodeNumber);
  const linked = ep ? `<a class="article-watch" href="${ep.url}" target="_blank" rel="noopener">Watch Episode ${article.episodeNumber} →</a>` : "";
  return `
    <article class="article" id="article-${article.episodeNumber}">
      <div class="article-head">
        <span class="ep-num">Episode ${String(article.episodeNumber).padStart(2, "0")}</span>
        <span class="draft-badge">Draft — pending human voice pass</span>
      </div>
      <h3>${article.title}</h3>
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

  const episodeCards = data.episodes.map(episodeCard).join("\n");
  const shortCards = data.shorts.length
    ? data.shorts.map(shortCard).join("\n")
    : `<p class="empty-note">No Shorts published yet — this section fills in automatically as they go live.</p>`;
  const articleBlocks = ARTICLES.filter((a) => episodesByNumber.has(a.episodeNumber))
    .map((a) => articleBlock(a, episodesByNumber))
    .join("\n");

  const headerCTAs = `
      ${markCTA({ label: "Subscribe on YouTube", href: YOUTUBE_SUBSCRIBE })}
      ${markCTA({ label: "Follow on LinkedIn", href: LINKEDIN_URL, kind: "ghost" })}`;

  const footerCTAs = `
        ${markCTA({ label: "Subscribe on YouTube", href: YOUTUBE_SUBSCRIBE })}
        ${markCTA({ label: "Follow on LinkedIn", href: LINKEDIN_URL, kind: "ghost" })}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Act Without Asking — The agentic AI podcast</title>
<meta name="description" content="Act Without Asking is a podcast about AI agents doing real work, and the moment you stop supervising them. Hosted by Robin Leonard and Tobi Webster.">
<meta property="og:title" content="Act Without Asking — The agentic AI podcast">
<meta property="og:description" content="AI agents doing real work — and the moment you stop supervising them. Hosted by Robin Leonard and Tobi Webster.">
<meta property="og:image" content="${data.episodes[0]?.thumbnail ?? ""}">
${isStale ? `<!-- BUILD WARNING: YouTube data source="${data.source}", fetchedAt=${data.fetchedAt} (${ageDays.toFixed(1)} days old). This build shipped with stale/fallback data rather than failing. -->` : ""}
<style>
  :root{
    --navy:${NAVY}; --navy2:${NAVY_2}; --lime:${LIME}; --ink:${INK};
    --muted:${MUTED}; --card:${NAVY_CARD}; --line:${LINE};
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
  .draft-badge{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--navy);background:var(--lime);padding:3px 9px;border-radius:4px}
  .article h3{font-size:22px;margin:6px 0 8px;line-height:1.3}
  .article-dek{color:var(--muted);font-size:15px;margin-bottom:16px}
  .article p{margin-bottom:14px;font-size:15px;color:#D6DCE8}
  .article-watch{display:inline-block;margin-top:6px;font-weight:600;font-size:14px}
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
  @media (max-width:820px){
    .hero{padding:72px 0 48px}
    .nav{height:auto;padding:12px 0}
  }
</style>
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

  await mkdir(DIST, { recursive: true });
  await writeFile(path.join(DIST, "index.html"), html);
  console.log(`[build] wrote dist/index.html (${data.episodes.length} episodes, ${data.shorts.length} shorts, ${ARTICLES.length} articles, stale=${isStale})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
