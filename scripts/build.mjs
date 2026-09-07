// Renders dist/ from data/youtube.json + the scripts/site modules.
// Static output only — no client-side fetch to any third party (Oksana ruling,
// AWA channel, 30 Aug 2026: build-time static, not a runtime dependency).
//
// WP01 foundation extraction (7 Sep 2026): config, content records, components,
// shared shell and page-body builders now live in scripts/site/ — this file is
// ORCHESTRATION ONLY: data load, twins + retrieval build, page assembly, gates,
// writes. Output is byte-identical to the pre-extraction build at c2829fa.
// Owner: WP01 (Jenny, integration) — shared-file requests go through WP01.
import { readFile, writeFile, mkdir, copyFile, cp } from "node:fs/promises";
import { buildTwins } from "./build-twins.mjs";
import { writeRetrievalIndex } from "./build-retrieval.mjs";
import path from "node:path";
import { DIST, ROOT, SITE_URL, PLACEHOLDER_HOSTS, KEY_SHAPE, YOUTUBE_SUBSCRIBE, YOUTUBE_CHANNEL } from "./site/config.mjs";
import { ARTICLES, episodeSlug, cleanEpTitle, epDek, ytUtm } from "./site/content.mjs";
import { createPageShell, MOTION_TILT_JS, SITE_CSS } from "./site/shell.mjs";
import {
  buildHomepage,
  innerCSS,
  privacyBody,
  subscribeBody,
  notFoundBody,
  aboutBody,
  episodesIndexBody,
  articlesIndexBody,
  episodeRoute,
  articleRoute,
  podcastSeriesRef,
} from "./site/pages.mjs";

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
  // og-card.png is copied to dist AFTER mkdir(DIST) below (4 Sep 2026, Oksana):
  // the copy previously ran before dist existed, ENOENTed on any clean build,
  // and the .catch(() => {}) silently dropped it — prod only kept serving the
  // card via a build-environment quirk (Jenny's flag, favicon PR 1f3a9a4).
  // No .catch: a missing committed asset must FAIL the build loudly.
  const DEFAULT_OG = BRAND_OG;

  const ageDays = (Date.now() - new Date(data.fetchedAt).getTime()) / 86400000;
  const isStale = data.source !== "live" || ageDays > 14;

  // P0 mobile (Robin, 5 Sep): the header carries nav links only — the hero
  // holds the ONE "Subscribe on YouTube" CTA and the listen-on block is the
  // persistent one.
  const headerCTAs = ``;

  // P0 mobile (Robin, 5 Sep + Yoshi gate #5): the hero holds the ONE
  // "Subscribe on YouTube" CTA; the footer listen-on block is the persistent
  // listen surface. No subscribe CTA in footer CTAs — the listen-on block
  // carries the YouTube link there on every page.
  const footerCTAs = ``;

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

  // Shared shell — one instance carries the homepage's og default, the inner
  // CSS block, the footer CTAs and the subscribe bar (the values pageShell
  // previously closed over inside main()).
  const pageShell = createPageShell({ defaultOg: DEFAULT_OG, innerCSS, footerCTAs, subscribeBar });

  const rawHomepage = buildHomepage({ data, latestEp, firstEp, isStale, headerCTAs, footerCTAs });

  // Twins Phase A: widget goes site-wide on the homepage (injected before the
  // gate loop below so the host/contact gates scan it too), /twins page ships
  // with its own embedded widget.
  const twins = await buildTwins(data, SITE_URL);
  // Retrieval corpus for the Phase B LLM path (spec §5): repo transcripts only,
  // build-generated. Episode without a videoId FAILS the build — an ungrounded
  // citation must never be possible.
  const retrieval = await writeRetrievalIndex({ episodes: data.episodes, writeFile });
  // P0 mobile (Robin, 5 Sep + Oksana reserved-space ruling): the widget is
  // injected INTO the flow (between the quote and the subscribe strip), not
  // before </body>. Desktop still renders it as the fixed pill (position:
  // fixed ignores DOM position); on ≤640px it is position:static, so it must
  // live in the document to be reachable without overlaying anything. The
  // twins-gate below still proves the injection happened.
  const homepageHtml = rawHomepage
    .replace('<section class="strip">', `${twins.widget}\n  <section class="strip">`)
    .replace("</body>", `${subscribeBar}\n${MOTION_TILT_JS}\n</body>`);
  if (!homepageHtml.includes("twinsWidget")) throw new Error("[twins-gate] widget injection into index.html failed");

  // ---- Phase 0 multi-page skeleton: shared shell, inner pages, SEO artifacts ----
  const REAL_DOMAIN_LANDED = !PLACEHOLDER_HOSTS.includes("actwithoutasking.com");

  const articleRoutes = ARTICLES.filter((a) => episodesByNumber.has(a.episodeNumber))
    .map((a) => articleRoute(a, { episodesByNumber, pageShell }));
  const pages = [
    ["index.html", homepageHtml],
    ["episodes/index.html", pageShell({ path: "/episodes/", title: "Episodes — Act Without Asking", desc: "Every episode of Act Without Asking: harnesses, multiplayer agents, agent memory, and Buzz — AI agents doing real work.", body: episodesIndexBody(data) })],
    ["articles/index.html", pageShell({ path: "/articles/", title: "Blog — Act Without Asking", desc: "Every episode of Act Without Asking in writing — harnesses, multiplayer agents, agent memory, and what moved us onto Buzz.", body: articlesIndexBody(data) })],
    ...data.episodes.map((ep) => episodeRoute(ep, { episodesByNumber, pageShell })),
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
  // favicon AFTER mkdir — an early copy here would ENOENT on a clean checkout
  // (DIST does not exist yet) and the .catch would silently drop the file.
  await copyFile(path.join(ROOT, "assets", "favicon.ico"), path.join(DIST, "favicon.ico"));
  await copyFile(path.join(ROOT, "assets", "og-card.png"), path.join(DIST, "og-card.png"));
  // WP02 redesign foundation: shared theme assets + brand fonts ship from
  // assets/web/ and assets/fonts/. awa-tokens.css references ../fonts/ so the
  // dist layout (web/ beside fonts/) must stay exactly this way.
  await cp(path.join(ROOT, "assets", "web"), path.join(DIST, "web"), { recursive: true });
  await cp(path.join(ROOT, "assets", "fonts"), path.join(DIST, "fonts"), { recursive: true });
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
