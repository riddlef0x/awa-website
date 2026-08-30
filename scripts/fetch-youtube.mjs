// Build-time YouTube data fetch. Runs at build time only — never in the browser.
// Per Oksana's architecture ruling (AWA channel, 30 Aug 2026): build-time static
// data, fail-soft to last-known-good, no keys/tokens, flag staleness past 14 days.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "youtube.json");
const CHANNEL_ID = "UCfFVB1rJgfR3_qybXhHTiGA";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const STALE_DAYS = 14;

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

function classify(entries) {
  const episodes = [];
  const shorts = [];
  for (const e of entries) {
    const isShort = /#shorts/i.test(e.title);
    const epMatch = e.title.match(/Episode\s+(\d+)/i);
    const record = {
      videoId: e.videoId,
      title: e.title,
      published: e.published,
      url: isShort
        ? `https://www.youtube.com/shorts/${e.videoId}`
        : `https://www.youtube.com/watch?v=${e.videoId}`,
      thumbnail: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
    };
    if (isShort) {
      shorts.push(record);
    } else if (epMatch) {
      episodes.push({ ...record, episodeNumber: Number(epMatch[1]) });
    }
    // Entries that are neither #shorts-tagged nor "Episode N" titled (e.g. the
    // unresolved Grok Bot cut, or any future guest-numbered special) are
    // intentionally dropped here rather than guessed into a slot — per the
    // channel rule against inventing episode numbers.
  }
  episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  shorts.sort((a, b) => new Date(b.published) - new Date(a.published));
  return { episodes, shorts };
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
    const res = await fetch(FEED_URL, { headers: { "User-Agent": "awa-website-build/1.0" } });
    if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
    const xml = await res.text();
    const entries = parseEntries(xml);
    if (entries.length === 0) throw new Error("feed parsed to zero entries");
    const { episodes, shorts } = classify(entries);
    if (episodes.length === 0) throw new Error("no episodes classified from feed");
    data = { fetchedAt: new Date().toISOString(), source: "live", episodes, shorts };
    console.log(`[fetch-youtube] live fetch OK — ${episodes.length} episodes, ${shorts.length} shorts`);
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
