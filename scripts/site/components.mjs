// Shared render components (WP01 foundation extraction, 7 Sep 2026).
// Mechanical move from scripts/build.mjs — markup byte-identical.
// WP02 owns this file from dispatch; no direct filesystem writes (handoff §WP02).
import { NAVY, LIME, LINE, INK, escapeHtml } from "./config.mjs";
import { ytUtm, episodeSlug, youtubeId, LISTEN_PLATFORMS } from "./content.mjs";

export function listenOnBlock({ compact = false } = {}) {
  const links = LISTEN_PLATFORMS.map(
    (p) => `<a class="cta-btn ${compact ? "ghost" : "primary"}" href="${escapeHtml(ytUtm(p.url, { medium: "listen", campaign: "channel" }))}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`
  ).join("\n      ");
  return `<div class="listen-on${compact ? " compact" : ""}">
      <span class="listen-label">Listen on</span>
      ${links}
    </div>`;
}

export function markCTA({ label, href, kind = "primary", utm = null }) {
  const isPending = href == null;
  const finalHref = isPending ? "#" : (utm ? ytUtm(href, utm) : href);
  const bg = kind === "primary" ? LIME : "transparent";
  const color = kind === "primary" ? NAVY : INK;
  const border = kind === "primary" ? "none" : `1px solid ${LINE}`;
  const pendingAttr = isPending ? ` data-pending="true" aria-disabled="true" title="LinkedIn page URL pending — placeholder"` : "";
  return `<a class="cta-btn ${kind}" href="${finalHref}"${pendingAttr}>${label}${isPending ? " (link pending)" : ""}</a>`;
}

export function chevronMark({ w = 26, h = 20, opacity = 1 } = {}) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 60 40" aria-hidden="true" style="opacity:${opacity}"><g fill="${LIME}"><path d="M0 0 L16 20 L0 40 L12 40 L28 20 L12 0 Z"/><path d="M20 0 L36 20 L20 40 L32 40 L48 20 L32 0 Z"/><path d="M40 0 L56 20 L40 40 L52 40 L60 28 L60 12 Z" opacity=".55"/></g></svg>`;
}

// Click-to-play binding for every facade on the page. Idempotent per button
// (data-yt-bound guard) so a page that carries the script more than once can
// never double-bind. The iframe uses the privacy-enhanced nocookie domain.
export const FACADE_SCRIPT = `
<script>
document.querySelectorAll("[data-yt]").forEach(function (btn) {
  if (btn.dataset.ytBound) return;
  btn.dataset.ytBound = "1";
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

export function shortVideoId(s) {
  const m = String(s.url).match(/shorts\/([\w-]+)/);
  return m ? m[1] : null;
}

// Portrait/landscape click-to-play facade. Ships only the thumbnail; the
// YouTube iframe is injected on click (same arch ruling as the featured
// player: no third-party runtime dependency until the visitor asks to play).
export function videoFacade({ videoId, thumbnail, ariaLabel, className }) {
  if (!videoId) return "";
  return `<button class="${className}" type="button" data-yt="${escapeHtml(videoId)}" aria-label="${escapeHtml(ariaLabel)}">
    <img src="${escapeHtml(thumbnail)}" alt="" loading="lazy">
    <span class="facade-play" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="${NAVY}"><path d="M8 5v14l11-7z"/></svg></span>
  </button>`;
}

export function featuredPlayer(ep) {
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
</div>`;
}

export function episodeCard(ep, { internal = false } = {}) {
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

export function shortCard(s) {
  const dateStr = new Date(s.published).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const cleanTitle = s.title.replace(/#shorts/i, "").trim();
  const videoId = shortVideoId(s);
  const ytHref = escapeHtml(ytUtm(s.url, { medium: "shorts_wall", campaign: "watch", content: videoId ?? "" }));
  // Click-to-play facade keeps the visitor on the site (embedded views still
  // count as views + watch time); the "Watch on YouTube" link preserves the
  // outbound path for likes/comments/subscribes.
  const player = videoId
    ? videoFacade({ videoId, thumbnail: s.thumbnail, ariaLabel: `Play short: ${cleanTitle}`, className: "short-facade" })
    : `<a class="short-thumb" href="${ytHref}" target="_blank" rel="noopener"><img src="${escapeHtml(s.thumbnail)}" alt="${escapeHtml(cleanTitle)}" loading="lazy"></a>`;
  return `
    <div class="short-card">
      <div class="short-video">${player}</div>
      <p class="short-title">${escapeHtml(cleanTitle)}</p>
      <p class="short-date">${dateStr}</p>
      <a class="short-yt" href="${ytHref}" target="_blank" rel="noopener">Watch on YouTube →</a>
    </div>`;
}

export function articleBlock(article, episodesByNumber) {
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
