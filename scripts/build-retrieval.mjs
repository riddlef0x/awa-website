// Retrieval index generator — Twins Phase B wiring (spec §5: corpus = repo
// transcripts, build-generated index). Reads EPISODE_TRANSCRIPTS (the same
// Kate-passed source the episode pages render from) and data/youtube.json,
// emits netlify/functions/ask-retrieval.json: one excerpt per transcript
// section, each carrying a Phase-A-shaped citation {episode, timestamp,
// videoId}. Nothing here is hand-maintained: transcripts change → regenerate.
//
// Output excerpt: { episode, timestamp, section, text, citation, handoff }.
// text is HTML-stripped with speaker labels preserved as content ("Tobi: ...")
// per Kate's conversion rules — the spoken words, nothing added.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EPISODE_TRANSCRIPTS } from "./episode-transcripts.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const MAX_EXCERPT_CHARS = 1400; // truncate long sections at a sentence boundary

// "Cold open [00:00] — Host" → "Cold open"; "[19:54]" → "19:54"
function parseHeading(h) {
  const m = String(h).match(/^(.*?)\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);
  if (!m) return null;
  const [, title, ts] = m;
  const parts = ts.split(":");
  let timestamp;
  if (parts.length === 3) timestamp = `${parseInt(parts[0], 10)}:${parts[1]}:${parts[2]}`;
  else timestamp = `${parseInt(parts[0], 10)}:${parts[1]}`;
  return { section: title.replace(/\s*[—-]\s*(Host|Robin|Tobi|Both)\s*$/i, "").trim() || title.trim(), timestamp };
}

// HTML → plain text with "Speaker:" labels kept as content.
function excerptText(blockHtml) {
  let s = blockHtml
    .replace(/<\/p>/g, "\n")
    .replace(/<h4>.*?<\/h4>/gs, "")
    .replace(/<blockquote>|<\/blockquote>/g, "")
    .replace(/<strong>(.*?):<\/strong>/g, "$1:")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (s.length > MAX_EXCERPT_CHARS) {
    const cut = s.slice(0, MAX_EXCERPT_CHARS);
    const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    s = (stop > MAX_EXCERPT_CHARS * 0.5 ? cut.slice(0, stop + 1) : cut) + " …[transcript continues]";
  }
  return s;
}

export function buildRetrievalIndex({ episodes }) {
  // episode number → videoId. Primary source: episodeNumber, which
  // fetch-youtube assigns from the KNOWN_EPISODE_IDS pin map (titles are
  // YouTube-editable and did drop their "Episode N" suffixes on 4 Sep —
  // title parsing alone broke the prod build that day). Title regex kept as
  // fallback; neither present = build fails, never guessed.
  const videoByEpisode = new Map();
  for (const ep of episodes || []) {
    const m = /Episode\s+(\d+)/i.exec(ep.title || "");
    const num = Number.isInteger(ep.episodeNumber)
      ? ep.episodeNumber
      : m
        ? parseInt(m[1], 10)
        : null;
    if (num !== null && ep.videoId) videoByEpisode.set(num, ep.videoId);
  }

  const excerpts = [];
  for (const [numStr, ep] of Object.entries(EPISODE_TRANSCRIPTS)) {
    const num = parseInt(numStr, 10);
    const videoId = videoByEpisode.get(num);
    if (!videoId) throw new Error(`[retrieval] episode ${num} has no videoId in data/youtube.json — index would be ungrounded`);
    const html = ep.transcriptHtml || "";
    const blocks = html.split(/(?=<h4>)/);
    for (const block of blocks) {
      const h = /<h4>(.*?)<\/h4>/.exec(block);
      if (!h) continue;
      const head = parseHeading(h[1]);
      if (!head) continue;
      const text = excerptText(block);
      if (!text) continue;
      excerpts.push({
        episode: num,
        timestamp: head.timestamp,
        section: head.section,
        text,
        citation: { episode: num, timestamp: head.timestamp, videoId },
        handoff: {
          episode: num,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          label: `This answer comes from Episode ${num}`,
        },
      });
    }
  }
  return { generatedAt: new Date().toISOString(), source: "scripts/episode-transcripts.mjs (Kate's site-pass files)", excerpts };
}

export async function writeRetrievalIndex({ episodes, writeFile }) {
  const index = buildRetrievalIndex({ episodes });
  await writeFile(path.join(ROOT, "netlify", "functions", "ask-retrieval.json"), JSON.stringify(index, null, 1));
  return index;
}
