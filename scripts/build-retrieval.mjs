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
import { readFileSync } from "node:fs";
import { EPISODE_TRANSCRIPTS } from "./episode-transcripts.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// 2800 (4 Sep 2026, Oksana — ep3-memory launch gate): 1400 cut the Episode-3
// "Every harness hits the wall" section (2665 chars) mid-way, hiding the
// long-term-memory / vector-search material that answers "runs out of
// memory"-class questions. 9 of 87 sections still truncate; the cap keeps
// prompt size bounded (~11K chars worst case at top-4).
const MAX_EXCERPT_CHARS = 2800; // truncate long sections at a sentence boundary

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
  const { filtered, receipts, droppedCount } = applyCorpusGate(excerpts);
  return {
    generatedAt: new Date().toISOString(),
    source: "scripts/episode-transcripts.mjs (Kate's site-pass files)",
    excerpts: filtered,
    corpusGate: { droppedCount, receipts },
  };
}

export async function writeRetrievalIndex({ episodes, writeFile }) {
  const index = buildRetrievalIndex({ episodes });
  censusCorpus(index);
  await writeFile(path.join(ROOT, "netlify", "functions", "ask-retrieval.json"), JSON.stringify(index, null, 1));
  return index;
}

// ---------------------------------------------------------------------------
// Corpus gate (checklist item (a) of record — Oksana consolidation ff8fe7b2,
// 5 Sep 2026; data: Vera event 59ec45f8). Two controls, both fail-closed:
//
//   1. EXCLUSION FILTER — banned transcript sections never enter the emitted
//      index. Match = episode + time window + text fingerprints (ALL must be
//      present). An exclusion that cannot resolve is a LOUD build failure so
//      new transcripts extend the gate rather than rotting it — except an
//      exclusion explicitly marked dormantExpected, which warns and rides
//      until the section reappears (its fingerprint still guards the text).
//   2. CENSUS — count-to-zero on the EMITTED index for anchor strings AND
//      distinctive figures, every encoding (entity forms of % included).
//      Any hit = loud build failure. Receipt printed to build output.
// ---------------------------------------------------------------------------


const GATE_PATH = path.join(ROOT, "data", "twins", "corpus-gate.json");

function loadGate() {
  return JSON.parse(readFileSync(GATE_PATH, "utf8"));
}

// "37:20" | "1:02:03" → seconds
function tsToSeconds(ts) {
  const parts = String(ts).split(":").map(Number);
  if (parts.some(Number.isNaN)) throw new Error(`[corpus-gate] bad timestamp ${ts}`);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

// Speech estimate for a trailing section with no known end: ~10 chars/sec is
// deliberately generous — it must never stretch far enough to swallow a real
// later window (B4 vs the Ep3 tail at 22:25 is the case that forced this).
function sectionSpanStart(excerpts, i) {
  const e = excerpts[i];
  const start = tsToSeconds(e.timestamp);
  const isLast = i + 1 >= excerpts.length || excerpts[i + 1].episode !== e.episode;
  const end = isLast ? start + Math.max(120, Math.floor(e.text.length / 10)) : tsToSeconds(excerpts[i + 1].timestamp);
  return [start, end];
}

export function applyCorpusGate(excerpts) {
  const gate = loadGate();
  const dropped = [];
  const receipts = [];

  for (const ex of gate.exclusions) {
    const ws = tsToSeconds(ex.windowStart);
    const we = tsToSeconds(ex.windowEnd);
    const idxs = [];
    for (let i = 0; i < excerpts.length; i++) {
      const e = excerpts[i];
      if (e.episode !== ex.episode) continue;
      const [s0, s1] = sectionSpanStart(excerpts, i);
      if (s0 <= we && s1 > ws) idxs.push(i);
    }
    if (idxs.length === 0) {
      if (ex.dormantExpected) {
        console.warn(`[corpus-gate] ${ex.id}: window ${ex.windowStart}-${ex.windowEnd} (Ep${ex.episode}) has no section in the corpus yet — dormantExpected, filter stays armed (${ex.note})`);
        receipts.push({ id: ex.id, status: "dormant", dropped: [] });
        continue;
      }
      throw new Error(`[corpus-gate] exclusion ${ex.id} UNRESOLVABLE: no corpus section overlaps Ep${ex.episode} ${ex.windowStart}-${ex.windowEnd}. The corpus moved — re-point the exclusion by hand, never guess. (${ex.note})`);
    }
    for (const i of idxs) {
      const hay = excerpts[i].text.toLowerCase();
      const missing = ex.fingerprints.filter((f) => !hay.includes(f.toLowerCase()));
      if (missing.length) {
        throw new Error(`[corpus-gate] exclusion ${ex.id}: section Ep${ex.episode} [${excerpts[i].timestamp}] overlaps the window but is missing fingerprint(s) [${missing.join(", ")}] — section text changed; re-point the exclusion by hand. (${ex.note})`);
      }
    }
    for (const i of idxs) {
      dropped.push({ id: ex.id, episode: excerpts[i].episode, timestamp: excerpts[i].timestamp, section: excerpts[i].section });
    }
    receipts.push({ id: ex.id, status: "dropped", dropped: idxs.map((i) => `Ep${excerpts[i].episode} [${excerpts[i].timestamp}] ${excerpts[i].section}`) });
  }

  const dropSet = new Set(dropped.map((d) => `${d.episode}@${d.timestamp}`));
  const filtered = excerpts.filter((e) => !dropSet.has(`${e.episode}@${e.timestamp}`));
  return { filtered, receipts, droppedCount: dropped.length };
}

export function censusCorpus(index) {
  const gate = loadGate();
  const raw = JSON.stringify(index);
  const low = raw.toLowerCase();
  const entityForms = (a) => {
    if (!a.includes("%")) return [a];
    return [a, a.replaceAll("%", "&#37;"), a.replaceAll("%", "&percnt;")];
  };
  const hits = [];
  for (const anchor of gate.censusAnchors) {
    for (const form of entityForms(anchor.toLowerCase())) {
      let pos = 0;
      while ((pos = low.indexOf(form, pos)) !== -1) {
        if (form.includes("80")) {
          // Vendor-attributed 80% is the cleared wording (build-twins BANNED
          // comment): both 80-anchors target that one sentence; fail only when
          // the containing sentence lacks "anthropic".
          const sentStart = Math.max(low.lastIndexOf(". ", pos), 0);
          const sentEnd = low.indexOf(". ", pos + 1);
          const sentence = low.slice(sentStart, sentEnd === -1 ? undefined : sentEnd + 2);
          if (!sentence.includes("anthropic")) {
            hits.push({ anchor, form, sample: raw.slice(pos - 40, pos + 60) });
          }
        } else {
          hits.push({ anchor, form, sample: raw.slice(pos - 40, pos + 60) });
        }
        pos += form.length;
      }
    }
  }
  if (hits.length) {
    const detail = hits.slice(0, 10).map((h) => `"${h.form}" @ …${h.sample}…`).join("\n  ");
    throw new Error(`[corpus-gate] CENSUS FAIL: ${hits.length} banned-anchor occurrence(s) in the emitted index (count-to-zero violated):\n  ${detail}`);
  }
  console.log(`[corpus-gate] census PASS: ${gate.censusAnchors.length} anchors, count-to-zero, ${index.excerpts.length} excerpts emitted`);
  return { anchors: gate.censusAnchors.length, excerpts: index.excerpts.length, hits: 0 };
}
