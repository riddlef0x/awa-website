// Shared page shell + stylesheet (WP01 foundation extraction, 7 Sep 2026).
// Mechanical move from scripts/build.mjs — output byte-identical tonight.
// Frozen interface (handoff §WP02): renderPage({path,title,description,body,jsonLd,ogImage,activeNav}).
// Tonight's adapted form is createPageShell(deps) -> pageShell(opts): the deps
// are the values pageShell previously closed over inside main(). WP02 reshapes
// the signature when it redesigns the shell; the contract (one shared shell for
// every page, nav/footer/subscribe surfaces included) is frozen now.
import { SITE_URL, YOUTUBE_SUBSCRIBE, escapeHtml, jsonLdSafe } from "./config.mjs";
import { chevronMark, markCTA, listenOnBlock } from "./components.mjs";

export const SITE_CSS = `
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
  .short-video{position:relative;aspect-ratio:9/16;background:var(--navy2)}
  .short-facade{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:var(--navy2);cursor:pointer;display:block}
  .short-facade img{width:100%;height:100%;object-fit:cover;display:block}
  .facade-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;width:52px;height:52px;border-radius:50%;background:var(--lime);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 5px rgba(200,255,61,.18);transition:transform .15s ease}
  .facade-play svg{margin-left:3px}
  .short-facade:hover .facade-play,.ep-facade:hover .facade-play{transform:translate(-50%,-50%) scale(1.06)}
  .short-facade .facade-play{width:40px;height:40px;box-shadow:0 0 0 4px rgba(200,255,61,.18)}
  .short-facade .facade-play svg{width:16px;height:16px}
  .short-video iframe,.ep-player iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  .short-yt{display:block;padding:0 10px 12px;font-size:11px;color:var(--muted);text-decoration:none}
  .short-yt:hover{color:var(--lime);text-decoration:underline}
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

export const MOTION_TILT_JS = `<script>
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

export function createPageShell({ defaultOg, innerCSS, footerCTAs, subscribeBar }) {
  const DEFAULT_OG = defaultOg;
  return function pageShell({ path: pagePath, title, desc, body, jsonLd = null, ogImage = null }) {
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
<link rel="icon" href="/favicon.ico">
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
}
