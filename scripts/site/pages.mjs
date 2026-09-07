// Page body builders (WP01 foundation extraction, 7 Sep 2026).
// Mechanical move from scripts/build.mjs main() — markup byte-identical.
// WP03 owns home/episode-library surfaces, WP04 reading/about surfaces, from
// dispatch; this file is the mechanical baseline they redesign from.
import { SITE_URL, YOUTUBE_CHANNEL, YOUTUBE_SUBSCRIBE, escapeHtml, jsonLdSafe } from "./config.mjs";
import { ytUtm, ARTICLES, EPISODE_EXTRAS, articlesByEpisode, cleanEpTitle, epDek, fmtDate, episodeSlug, youtubeId } from "./content.mjs";
import { FACADE_SCRIPT, videoFacade, episodeCard, shortCard, listenOnBlock, chevronMark, featuredPlayer } from "./components.mjs";

export const podcastSeriesRef = { "@type": "PodcastSeries", name: "Act Without Asking", url: SITE_URL };

// Homepage (pre-twins-injection). Returns the raw html string; main() performs
// the twins widget + subscribe bar injection and the twins-gate check.
export function buildHomepage({ data, latestEp, firstEp, isStale, headerCTAs, footerCTAs }) {
  const episodeCards = data.episodes.map((e) => episodeCard(e, { internal: true })).join("\n");
  const shortCards = data.shorts.length
    ? data.shorts.map(shortCard).join("\n")
    : `<p class="empty-note">No Shorts published yet — this section fills in automatically as they go live.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="icon" href="/favicon.ico">
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
    <div class="nav-ctas"><a class="cta-btn ghost" href="/episodes/">Episodes</a><a class="cta-btn ghost" href="/articles/">Blog</a><a class="cta-btn ghost" href="/about/">About</a>${headerCTAs}</div>
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
${latestEp ? featuredPlayer(latestEp) : ""}
  </div>

  <section id="episodes">
    <div class="wrap">
      <div class="section-head">
        <p class="kicker">Full episodes</p>
        <h2>Episodes</h2>
        <p class="start-here">New here? <a href="/episodes/${firstEp ? episodeSlug(firstEp) : ""}/">Start with Episode 1</a> — the opening argument. Prefer reading? <a href="/articles/">Every episode, in writing.</a></p>
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
${FACADE_SCRIPT}

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
}

export const innerCSS = `
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
  .ep-player{position:relative;aspect-ratio:16/9;width:100%;border-radius:10px;border:1px solid var(--line);display:block;margin-bottom:24px;background:var(--navy2);overflow:hidden}
  .ep-player.playing{border-radius:10px}
  .ep-facade{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:var(--navy2);cursor:pointer;display:block}
  .ep-facade img{width:100%;height:100%;object-fit:cover;display:block}
  .ep-hero{width:100%;border-radius:10px;border:1px solid var(--line);display:block;background:var(--navy2);aspect-ratio:16/9;object-fit:cover}
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

  // Page <title>: keep the full brand suffix when the base headline is short
  // enough; drop to "— Episode N", then to the bare headline, as length grows
  // (QA Low: Google truncates >~60-char titles — don't lose the words to the
  // suffix). Wording untouched, length only (Jane ruling, 1 Sep).
export const pageTitle = (base, epNum) => {
    const full = epNum
      ? `${base} — Act Without Asking, Episode ${epNum}`
      : `${base} — Act Without Asking`;
    if (full.length <= 60) return full;
    const short = epNum ? `${base} — Episode ${epNum}` : base;
    return short.length <= 60 ? short : base;
  };

export function episodeRoute(ep, { episodesByNumber, pageShell }) {
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
      <div class="ep-player">${videoFacade({ videoId: youtubeId(ep), thumbnail: ep.thumbnail, ariaLabel: `Play Episode ${ep.episodeNumber}: ${cleanEpTitle(ep)}`, className: "ep-facade" }) || `<img class="ep-hero" src="${escapeHtml(ep.thumbnail)}" alt="${escapeHtml(`${cleanEpTitle(ep)} — Episode ${ep.episodeNumber} thumbnail`)}">`}</div>
      <p class="dek">${escapeHtml(epDek(ep))}</p>
      <a class="btn" href="${escapeHtml(ytUtm(ep.url, { medium: "episode_page", campaign: "watch", content: slug }))}" target="_blank" rel="noopener">Watch on YouTube</a>
      ${FACADE_SCRIPT}
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

export function articleRoute(article, { episodesByNumber, pageShell }) {
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

  // Privacy page — copy passed by Stephanie's proxy review 31 Aug (gate cleared).
  // The contact address is a marked placeholder until the domain lands; once the
  // real domain is set, a leftover placeholder FAILS the build (domain-gate).
export const privacyBody = `
  <section class="legal">
    <div class="wrap narrow">
      <p class="kicker">Privacy</p>
      <h1 class="legal-title">Everything we collect, and why.</h1>
      <p class="updated">Last updated: 4 September 2026.</p>

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
      <p>When you ask the twins a question, here is exactly what happens to it.
      Your question — and nothing else about you — is sent to an AI service that
      helps write the answer. We never send your name, email, or IP address to
      the AI service. Our server sees the bare technical data every website
      sees and uses it only to stop abuse — it is never stored with your
      question. The AI service processes your question to
      do its job and keeps its own records under its own privacy policy; this
      site does not store your questions or the answers on our side.</p>
      <p>Every answer is grounded in the show itself: it points to the episode
      and moment it comes from. If the show doesn't back an answer, the twins
      say so and hand you an episode instead of making something up. If the AI
      service is unavailable, the twins automatically fall back to pre-written
      answers — same behaviour, different engine.</p>
      <p>The twins are AI impressions of Robin and Tobi, not Robin and Tobi.
      They may be wrong — check anything that matters against the actual
      episodes.</p>
      <p>We log aggregate counts only — how many questions are asked, which
      episode links get clicked, and coarse timing and size buckets. No question
      text, no IP, nothing that identifies you or reconstructs what you asked.
      These counts contain nothing personal, so we keep them indefinitely —
      there is nothing in them to delete. The twins page says the same thing.</p>

      <h3>YouTube</h3>
      <p>The site embeds YouTube videos. YouTube's own privacy policy applies to what they see when a video plays.</p>

      <h3>Changes</h3>
      <p>If this page changes, we date the change at the top. Material changes to how we handle your email get emailed to the list.</p>
    </div>
  </section>`;

  // Subscribe page — form ships DISABLED until the MailerLite group exists
  // (Stephanie owns). Nothing collects before the privacy page is live and the
  // vendor is wired; the disabled state is the honest interim.
export const subscribeBody = `
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

export const notFoundBody = `
  <section class="nf">
    <div class="wrap">
      <p class="kicker">404</p>
      <h1 class="legal-title">That page doesn't exist.</h1>
      <p>The episode you're after is probably on the homepage.</p>
      <a class="btn" href="/">Back to the show</a>
    </div>
  </section>`;

export const aboutBody = `
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

export function episodesIndexBody(data) {
  const episodesByNumber = new Map(data.episodes.map((e) => [e.episodeNumber, e]));
  return `
  <section class="legal">
    <div class="wrap">
      <p class="kicker">Episodes</p>
      <h1 class="legal-title">Every episode, in order.</h1>
      <div class="eps" style="margin-top:32px">
${data.episodes.map((e) => episodeCard(e, { internal: true })).join("\n")}
      </div>
    </div>
  </section>`;
}

export function articlesIndexBody(data) {
  const episodesByNumber = new Map(data.episodes.map((e) => [e.episodeNumber, e]));
  return `
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
}
