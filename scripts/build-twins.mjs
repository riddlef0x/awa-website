// Twins Phase A build (PLANS/AWA_TWINS_V1_SCRIPTED_SPEC.md).
// Gates enforced at BUILD time (spec §4/§8):
//  - Handoff gate: every entry resolves against data/youtube.json; an
//    unpublished/unnumbered episode FAILS the build (launch-article lesson).
//  - Fact gate: named bans grepped against the whole pool; any hit fails.
//  - Contract gate: <=3 lines per entry, composed answer <=480 chars.
//  - Name gate: "Toby" anywhere in the pool fails (spec gate 5).
// Output: netlify/functions/ask-data.json, dist/twins/index.html, widget markup.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Fact gate — binding named bans from the spec + Vera's final verdicts.
const BANNED = [
  "31%", "4.3%", "2.53", // org-chart stats; unsourced returns figure
  "australia has recently changed", "director liability", // Ep 1 law claim: UNVERIFIED
  "glm 5", "glm-5", "glm5", // no specific GLM version, ever
  "21 july 2026", // Buzz launch date: unverified without Block's own announcement
  "29 bill", "$29b", "29b", // Block/Afterpay figure: only with company-announcement citation
  "anthropic's doing 80", "80% of its coding", // only the vendor wording is cleared; not used in v1
];

const ASK_STYLES = `
.twins-ask{background:#131E33;border:1px solid #22304A;border-radius:12px;color:#F4F7FB;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.twins-log{max-height:300px;overflow-y:auto;padding:4px 12px 0;font-size:13px;line-height:1.45}
.twins-q{color:#F4F7FB;margin:8px 0 2px;font-weight:600}
.twins-a{color:#C9D4E3;margin:2px 0 8px;white-space:pre-line}
.twins-cite{font-size:11px;color:#9AA7BA}
.twins-handoff{display:inline-block;margin:6px 0 10px;padding:7px 12px;border-radius:8px;background:#C8FF3D;color:#0A1628;font-weight:700;font-size:13px;text-decoration:none}
.twins-row{display:flex;gap:6px;padding:10px 12px 12px}
.twins-input{flex:1;background:#0A1628;border:1px solid #22304A;border-radius:8px;color:#F4F7FB;padding:8px 10px;font-size:13px;min-width:0}
.twins-go{background:#C8FF3D;border:0;border-radius:8px;color:#0A1628;font-weight:700;padding:8px 12px;cursor:pointer}
.twins-err{color:#FFB86B;font-size:12px;margin:0 12px 10px}
.twins-tag{display:inline-block;font-size:11px;letter-spacing:.02em;color:#C8FF3D;background:rgba(200,255,61,.08);border:1px solid rgba(200,255,61,.25);border-radius:6px;padding:4px 8px;margin:10px 12px 0}
.twins-widget{position:fixed;right:16px;bottom:74px;z-index:9999;max-width:min(360px,calc(100vw - 32px))}
.twins-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none}
.twins-dot{width:8px;height:8px;border-radius:50%;background:#C8FF3D;flex:none}
.twins-ticker{font-size:13px;color:#9AA7BA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.twins-panel{display:none;border-top:1px solid #22304A}
.twins-open .twins-panel{display:block}
.twins-hidden{display:none}
@media (prefers-reduced-motion: reduce){.twins-ask *{transition:none!important;animation:none!important}}
@media (max-width:640px){.twins-widget{left:16px;right:16px;bottom:70px;max-width:none}.twins-widget .twins-ask{max-height:70vh;overflow-y:auto}}
`;

const ASK_SCRIPT = `
(function(){
  function initAsk(root){
    var log=root.querySelector(".twins-log"),input=root.querySelector(".twins-input"),
        go=root.querySelector(".twins-go"),err=root.querySelector(".twins-err");
    if(!log||!input||!go)return;
    var busy=false;
    function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}
    function ask(){
      if(busy)return;var q=input.value.trim();if(!q)return;
      err.hidden=true;busy=true;go.disabled=true;
      var qEl=document.createElement("div");qEl.className="twins-q";qEl.textContent="You: "+q;log.appendChild(qEl);
      input.value="";
      fetch("/api/ask",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question:q})})
      .then(function(r){return r.json().then(function(b){return {status:r.status,body:b};});})
      .then(function(res){
        var b=res.body||{};
        if(b.answer){var aEl=document.createElement("div");aEl.className="twins-a";aEl.textContent=b.answer;log.appendChild(aEl);}
        if(b.citations&&b.citations.length){var c=b.citations[0];
          var cEl=document.createElement("div");cEl.className="twins-cite";cEl.textContent="From Episode "+c.episode+(c.timestamp?" · "+c.timestamp:"");log.appendChild(cEl);}
        if(b.handoff&&b.handoff.url){
          var h=document.createElement("a");h.className="twins-handoff";
          h.href=b.handoff.url+"&utm_source=awa_site&utm_medium=twins&utm_campaign=handoff&utm_content="+encodeURIComponent(b.poolId||"fallback");
          h.target="_blank";h.rel="noopener";h.textContent=b.handoff.label||"Watch the episode";
          h.addEventListener("click",function(){try{navigator.sendBeacon("/api/ask",JSON.stringify({kind:"handoff-click",poolId:b.poolId}));}catch(e){}});
          log.appendChild(h);
        }
      })
      .catch(function(){err.textContent="The twins lost the thread for a second. Try again — or watch the real thing.";err.hidden=false;})
      .finally(function(){busy=false;go.disabled=false;log.scrollTop=log.scrollHeight;});
    }
    go.addEventListener("click",ask);
    input.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();ask();}});
  }
  document.querySelectorAll(".twins-ask").forEach(initAsk);

  // Corner widget: idle ticker + expand-to-ask.
  var widget=document.getElementById("twinsWidget");
  if(!widget)return;
  var dataEl=document.getElementById("twins-data");
  var tickerLines=dataEl?JSON.parse(dataEl.textContent).ticker:[];
  var card=widget.querySelector(".twins-ask"),bar=widget.querySelector(".twins-bar"),
      ticker=widget.querySelector(".twins-ticker");
  var idx=0,paused=false,timer=setInterval(next,25000);
  function next(){if(paused||!tickerLines.length)return;idx=(idx+1)%tickerLines.length;ticker.textContent=tickerLines[idx];}
  ticker.textContent=tickerLines[0]||"";
  function setOpen(o){card.classList.toggle("twins-open",o);bar.setAttribute("aria-expanded",o?"true":"false");
    if(o){paused=true;clearInterval(timer);var i=widget.querySelector(".twins-input");if(i)setTimeout(function(){i.focus();},0);}}
  bar.addEventListener("click",function(){setOpen(!card.classList.contains("twins-open"));});
  bar.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(!card.classList.contains("twins-open"));}});
  card.addEventListener("mouseenter",function(){paused=true;});
  card.addEventListener("mouseleave",function(){paused=!card.classList.contains("twins-open");});
})();
`;

function askRootMarkup() {
  return `<div class="twins-ask">
  <span class="twins-tag">AI twins — may be wrong</span>
  <div class="twins-log" aria-live="polite"></div>
  <div class="twins-row">
    <input class="twins-input" maxlength="280" placeholder="Ask the twins…" aria-label="Ask the twins">
    <button class="twins-go">Ask</button>
  </div>
  <p class="twins-err" hidden></p>
</div>`;
}

export function buildWidget(pool) {
  const ticker = pool.entries
    .filter((e) => e.tickerOk)
    .map((e) => e.lines.map((l) => l.text).sort((a, b) => a.length - b.length)[0]);
  const payload = JSON.stringify({ ticker }).replace(/<\//g, "<\\/");
  return `
<style>${ASK_STYLES}</style>
<div class="twins-widget" id="twinsWidget">
  <div class="twins-ask">
    <div class="twins-bar" role="button" tabindex="0" aria-expanded="false" aria-controls="twinsPanel">
      <span class="twins-dot" aria-hidden="true"></span>
      <span class="twins-ticker"></span>
    </div>
    <div class="twins-panel" id="twinsPanel">
      ${askRootMarkup()}
    </div>
  </div>
</div>
<script id="twins-data" type="application/json">${payload}</script>
<script>${ASK_SCRIPT}</script>`;
}

export async function buildTwins(data, siteUrl) {
  if (!siteUrl) throw new Error("[twins-gate] buildTwins requires SITE_URL — canonical must derive from the one domain constant, never a hardcoded host");
  const pool = JSON.parse(await readFile(path.join(ROOT, "data", "twins", "pool.json"), "utf8"));
  const episodes = new Map(data.episodes.map((e) => [e.episodeNumber, e]));
  const fail = (msg) => {
    throw new Error(`[twins-gate] ${msg}`);
  };

  // Name gate (spec §4.5) — entry content only; pool.notes may document the correction.
  if (/toby/i.test(JSON.stringify(pool.entries))) fail('"Toby" found in pool entries — spec gate 5 requires "Tobi" everywhere');

  // Fact gate (spec §4.2)
  const poolText = JSON.stringify(pool.entries).toLowerCase();
  for (const banned of BANNED) {
    if (poolText.includes(banned.toLowerCase())) fail(`banned string "${banned}" found in pool`);
  }

  const out = [];
  for (const e of pool.entries) {
    if (!e.id || !Array.isArray(e.lines) || !e.lines.length) fail(`${e.id || "(no id)"}: malformed entry`);
    if (e.lines.length > 3) fail(`${e.id}: ${e.lines.length} lines — spec caps exchanges at 3`);
    for (const l of e.lines) {
      if (!["robin-twin", "tobi-twin"].includes(l.speaker)) fail(`${e.id}: bad speaker "${l.speaker}"`);
      if (typeof l.text !== "string" || !l.text.trim()) fail(`${e.id}: empty line`);
    }
    const answerLen = e.lines.reduce((n, l) => n + l.text.length + 12, 0);
    if (answerLen > 480) fail(`${e.id}: composed answer ${answerLen} chars > 480 (contract)`);
    if (e.attributionStatus !== "unattributed" && e.attributionStatus !== "confirmed") {
      fail(`${e.id}: attributionStatus must be confirmed | unattributed`);
    }
    if (!e.citations || !e.citations.length) fail(`${e.id}: citations REQUIRED (contract)`);
    for (const c of e.citations) {
      if (!episodes.get(c.episode)) fail(`${e.id}: citation episode ${c.episode} not published`);
    }
    const ref = episodes.get(e.episodeRef && e.episodeRef.episode);
    if (!ref || !ref.url || !ref.videoId) {
      fail(`entry ${e.id} references episode ${e.episodeRef && e.episodeRef.episode} — not a published episode in data/youtube.json (handoff gate)`);
    }
    out.push({
      id: e.id,
      keywords: e.topics,
      lines: e.lines,
      citations: e.citations.map((c) => ({ ...c, videoId: episodes.get(c.episode).videoId })),
      handoff: {
        episode: e.episodeRef.episode,
        url: ref.url,
        label: `This argument started in Episode ${e.episodeRef.episode}`,
      },
    });
  }

  const latest = data.episodes.reduce((a, b) => (a.episodeNumber > b.episodeNumber ? a : b));
  const askData = {
    generatedAt: new Date().toISOString(),
    entries: out,
    fallbackLines: pool.fallback,
    fallbackHandoff: {
      episode: latest.episodeNumber,
      url: latest.url,
      label: "The real version lives in the episodes",
      citations: [{ episode: latest.episodeNumber, videoId: latest.videoId, timestamp: "0:00" }],
    },
    disagreementIds: pool.disagreement,
  };
  await writeFile(path.join(ROOT, "netlify", "functions", "ask-data.json"), JSON.stringify(askData, null, 2));

  return { widget: buildWidget(pool), twinsPage: renderTwinsPage(pool, out, buildWidget(pool), siteUrl, data.episodes.length ? data.episodes[data.episodes.length - 1].thumbnail : "") };
}

function renderTwinsPage(pool, entries, widgetMarkup, siteUrl, ogImage = "") {
  const cards = entries
    .map((e) => {
      const lines = e.lines
        .map((l) => `<p class="t-line"><strong>${l.speaker === "robin-twin" ? "Robin-twin" : "Tobi-twin"}:</strong> ${l.text}</p>`)
        .join("\n      ");
      const cite = e.citations[0];
      const href = `${e.handoff.url}&utm_source=awa_site&utm_medium=twins&utm_campaign=archive&utm_content=${e.id}`;
      return `<article class="t-card">
      ${lines}
      <a class="t-link" href="${href}" target="_blank" rel="noopener">Episode ${e.handoff.episode}${cite && cite.timestamp ? " · " + cite.timestamp : ""} — ${e.handoff.label}</a>
    </article>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The twins — Act Without Asking</title>
<meta name="description" content="Scripted AI twins built from the show's best arguments. Ask them anything — they may be wrong, and they always hand you the episode where it really happened.">
<meta property="og:title" content="The twins — Act Without Asking">
<meta property="og:description" content="Two scripted AI twins built from the show's arguments. They may be wrong — and they always hand you the episode.">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="The twins — Act Without Asking">
<meta name="twitter:description" content="Two scripted AI twins built from the show's arguments. They may be wrong — and they always hand you the episode.">
<meta name="twitter:image" content="${ogImage}">
<link rel="canonical" href="${siteUrl}/twins/">
<meta property="og:url" content="${siteUrl}/twins/">
<style>
body{margin:0;background:#0A1628;color:#F4F7FB;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.55}
.wrap{max-width:760px;margin:0 auto;padding:48px 20px 96px}
.kicker{color:#C8FF3D;text-transform:uppercase;letter-spacing:.14em;font-size:12px;margin:0 0 8px}
h1{font-size:clamp(28px,5vw,40px);margin:0 0 12px}
h2{font-size:20px;margin:32px 0 12px}
.dek{color:#C9D4E3;font-size:17px;margin:0 0 10px}
.t-honest{color:#FFB86B;font-size:14px;margin:0 0 8px}
.t-ask{margin:28px 0 8px}
.t-note{color:#9AA7BA;font-size:12px;margin:10px 2px}
.t-card{background:#131E33;border:1px solid #22304A;border-radius:12px;padding:16px 18px;margin:14px 0}
.t-line{margin:6px 0;color:#C9D4E3}
.t-link{display:inline-block;margin-top:10px;color:#C8FF3D;font-size:13px;font-weight:700;text-decoration:none;border:1px solid rgba(200,255,61,.35);border-radius:8px;padding:6px 10px}
.t-link:hover{background:rgba(200,255,61,.1)}
.t-foot{color:#9AA7BA;font-size:12px;margin-top:40px}
</style>
</head>
<body>
<main class="wrap">
  <p class="kicker">Act Without Asking</p>
  <h1>The twins</h1>
  <p class="dek">Two AI twins, built from the show's own arguments. Robin-twin is dry and opinionated. Tobi-twin starts fights. Neither is live AI — Phase A is a curated script with a matching function, which is exactly as honest as we know how to be.</p>
  <p class="t-honest">They may be wrong. When they're wrong, they hand you the episode — that link is the product.</p>
  <section class="t-ask">
    <h2>Ask the twins</h2>
    ${askRootMarkup()}
    <p class="t-note">Scripted Phase A: keyword matching over a curated exchange pool. No question text is stored.</p>
  </section>
  <section>
    <h2>Best exchanges</h2>
    ${cards}
  </section>
  <p class="t-foot">Act Without Asking — a show from Axela, hosted by Robin Leonard with Tobi Webster.</p>
</main>
${widgetMarkup}
</body>
</html>`;
}
