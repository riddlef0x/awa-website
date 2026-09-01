// Build-time YouTube data fetch. Runs at build time only — never in the browser.
// Per Oksana's architecture ruling (AWA channel, 30 Aug 2026): build-time static
// data, fail-soft to last-known-good, no keys/tokens, flag staleness past 14 days.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "youtube.json");
const CHANNEL_ID = "UCfFVB1rJgfR3_qybXhHTiGA";
const UPLOADS_FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
// YouTube's Shorts shelf is its own pseudo-playlist: swap the UC channel prefix
// for UUSH. Verified live 30 Aug 2026 — returns a feed titled "Short videos"
// containing only Shorts, distinct from the general uploads feed. This is the
// authoritative source per Oksana's follow-up (title-heuristic alone can miss
// a Short published without "#shorts" in its title).
const SHORTS_FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH${CHANNEL_ID.slice(2)}`;
const STALE_DAYS = 14;

// Episode slots are pinned by videoId. A re-title on the channel must never
// silently reclassify a published episode (incident 1 Sep 2026: Ep1/Ep2
// re-titled without "| Episode N" → title regex dropped both → build gate
// failed). The title regex stays as the fallback for NEW uploads only; if a
// pinned video's title still matches the regex with a DIFFERENT number, the
// pin wins and the mismatch is logged loudly.
const KNOWN_EPISODE_IDS = {
  "IT1CxSch6x4": 1,
  "-cv48twm9Kw": 2,
  "qp1zBerxoaE": 3,
  "foh1JHjA8GE": 4,
};

function parseEntries(xml) {
  const entries = [];
  const blocks = xml.split("<entry>").slice(1);
  for (const block of blocks) {
    const videoId = block.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const title = block.match(/<title>(.*?)<\/title>/)?.[1];
    const published = block.match(/<published>(.*?)<\/published>/)?.[1];
    if (!videoId || !title || !published) continue;
    entries.push({
      videoId,
      title: title.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
      published,
    });
  }
  return entries;
}

function toRecord(e, { isShort }) {
  return {
    videoId: e.videoId,
    title: e.title,
    published: e.published,
    url: isShort
      ? `https://www.youtube.com/shorts/${e.videoId}`
      : `https://www.youtube.com/watch?v=${e.videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
  };
}

async function fetchFeed(url) {
  const res = await fetch(url, { headers: { "User-Agent": "awa-website-build/1.0" } });
  if (!res.ok) throw new Error(`feed fetch failed: ${res.status} (${url})`);
  return parseEntries(await res.text());
}

async function classify(uploadEntries) {
  // Authoritative Shorts source: the UUSH playlist feed. Falls back to a
  // title-text heuristic only if that feed is unreachable — and says so loudly,
  // since the heuristic silently misses any Short without "#shorts" in the title.
  let shortEntries = [];
  let shortsSourceNote;
  try {
    shortEntries = await fetchFeed(SHORTS_FEED_URL);
    shortsSourceNote = "playlist-feed";
  } catch (err) {
    console.warn(
      `[fetch-youtube] Shorts playlist feed failed (${err.message}) — falling back to ` +
        `"#shorts"-in-title heuristic. This WILL miss a Short published without that hashtag.`
    );
    shortEntries = uploadEntries.filter((e) => /#shorts/i.test(e.title));
    shortsSourceNote = "title-heuristic-fallback";
  }
  const shortIds = new Set(shortEntries.map((e) => e.videoId));

  const episodes = [];
  const shorts = [];
  const dropped = [];
  const uploadIds = new Set(uploadEntries.map((e) => e.videoId));

  for (const e of uploadEntries) {
    const epMatch = e.title.match(/Episode\s+(\d+)/i);
    const pinned = KNOWN_EPISODE_IDS[e.videoId];
    if (shortIds.has(e.videoId)) {
      shorts.push(toRecord(e, { isShort: true }));
    } else if (pinned) {
      if (epMatch && Number(epMatch[1]) !== pinned) {
        console.warn(
          `[fetch-youtube] pinned episode ${pinned} (${e.videoId}) title says "Episode ${epMatch[1]}" — pin wins`
        );
      }
      episodes.push({ ...toRecord(e, { isShort: false }), episodeNumber: pinned });
    } else if (epMatch) {
      episodes.push({ ...toRecord(e, { isShort: false }), episodeNumber: Number(epMatch[1]) });
    } else {
      // Neither a confirmed Short nor "Episode N" titled — e.g. the unresolved
      // Grok Bot cut, or any future guest-numbered special. Never guessed into
      // a slot (channel rule against inventing episode numbers) — but logged,
      // per Oksana's note, so nothing vanishes without a trace.
      dropped.push({ videoId: e.videoId, title: e.title });
    }
  }

  // A Short that lives in the Shorts playlist but fell outside the uploads
  // feed's short recency window (~15 entries) still counts.
  for (const e of shortEntries) {
    if (!uploadIds.has(e.videoId)) {
      shorts.push(toRecord(e, { isShort: true }));
    }
  }

  episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  shorts.sort((a, b) => new Date(b.published) - new Date(a.published));

  if (dropped.length > 0) {
    console.warn(
      `[fetch-youtube] ${dropped.length} upload(s) classified as neither episode nor short — ` +
        `not shown on site, not silently lost: ${dropped.map((d) => `"${d.title}" (${d.videoId})`).join("; ")}`
    );
  }

  return { episodes, shorts, dropped, shortsSourceNote };
}

async function loadExisting() {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  let data;
  try {
    const uploadEntries = await fetchFeed(UPLOADS_FEED_URL);
    if (uploadEntries.length === 0) throw new Error("uploads feed parsed to zero entries");
    const { episodes, shorts, dropped, shortsSourceNote } = await classify(uploadEntries);
    if (episodes.length === 0) throw new Error("no episodes classified from feed");
    data = {
      fetchedAt: new Date().toISOString(),
      source: "live",
      shortsSource: shortsSourceNote,
      episodes,
      shorts,
      droppedCount: dropped.length,
    };
    console.log(
      `[fetch-youtube] live fetch OK — ${episodes.length} episodes, ${shorts.length} shorts ` +
        `(shorts source: ${shortsSourceNote}), ${dropped.length} dropped/unclassified`
    );
  } catch (err) {
    console.warn(`[fetch-youtube] live fetch failed (${err.message}) — falling back to last-known-good`);
    const existing = await loadExisting();
    if (!existing) {
      throw new Error(
        "[fetch-youtube] no live data AND no committed fallback in data/youtube.json — cannot build. " +
          "This should never happen once data/youtube.json is committed once."
      );
    }
    const ageDays = (Date.now() - new Date(existing.fetchedAt).getTime()) / 86400000;
    if (ageDays > STALE_DAYS) {
      console.warn(
        `[fetch-youtube] WARNING: fallback data is ${ageDays.toFixed(1)} days old (> ${STALE_DAYS}-day threshold). ` +
          `Site is building with stale YouTube data. Check the scheduled rebuild / feed reachability.`
      );
    }
    data = { ...existing, source: "fallback-stale" };
  }

  await mkdir(path.dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`[fetch-youtube] wrote ${DATA_PATH} (source: ${data.source})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
