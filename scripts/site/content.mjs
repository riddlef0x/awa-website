// Content records + shared content helpers (WP01 foundation extraction, 7 Sep 2026).
// Mechanical move from scripts/build.mjs — article bodies, slug logic and
// episode metadata helpers preserved byte-for-byte.
import { EPISODE_TRANSCRIPTS } from "../episode-transcripts.mjs";
import { YOUTUBE_CHANNEL } from "./config.mjs";

// Tracking-links pass (2 Sept): rendered outbound YouTube links carry UTM
// params so YouTube analytics attributes site-driven traffic. Mirrors the
// twins citation convention already in this build: utm_source=awa_site,
// utm_medium=surface, utm_campaign=intent, utm_content=locator. Rendered
// <a href> only — JSON-LD/canonical/sitemap URLs stay clean, and the twins
// seed citations arrive pre-tagged. Internal links are never tagged.
export function ytUtm(url, { medium, campaign, content = null }) {
  if (!url) return url;
  const u = new URL(url);
  u.searchParams.set("utm_source", "awa_site");
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  if (content) u.searchParams.set("utm_content", content);
  return u.toString();
}

// A2 "Listen on" block (DoD v2): YouTube ONLY tonight — show is not on
// Apple/Spotify (verified via iTunes Search API, 1 Sep 2026). Data-driven so
// platform deep links slot in on distribution day without touching markup:
// push a { name, url } entry and every placement picks it up.
export const LISTEN_PLATFORMS = [
  { name: "YouTube", url: YOUTUBE_CHANNEL },
];

// One article per published episode. Verified facts only, sourced from episode
// transcripts / show notes / fact-checks in RESEARCH — never the raw recording.
// Cleared for publish 30 Aug 2026: fact pass (Jenny/Oksana) and voice pass
// (Stephanie) both done, Robin waived further approval gates — draft badges
// removed accordingly. See WORK_LOGS for the QA trail if any article changes.
export const ARTICLES = [
  {
    episodeNumber: 1,
    slug: "ai-harness-over-model",
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
    slug: "multiplayer-agents",
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
    slug: "agent-memory",
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
    slug: "we-moved-onto-buzz",
    title: "We moved our business onto Buzz. Here's what actually happened.",
    dek: "Jack Dorsey's Block launched an agent-native chat platform for teams of people and agents. Robin and Tobi run their real company on it — and talk about what that's actually like.",
    body: [
      "Block launched Buzz on 21 July 2026 — an open-source, Nostr-based group chat platform built, in Dorsey's own words, \"for teams of people and agents of all sizes.\" Robin and Tobi didn't just review it — they moved their own business onto it, and this episode is the honest account of what that took. <a href=\"https://block.xyz/inside/introducing-buzz-where-humans-and-agents-work-together\" target=\"_blank\" rel=\"noopener\">Source: Block's launch announcement, 21 July 2026</a>.",
      "The setup pain is real and specific: keys, environment variables, access control — the unglamorous plumbing that comes before any of the upside shows up. Once it's running, auto-transcribing every voice note changes how a team actually talks to each other, and the hosts get into how agents end up spreading bottom-up inside larger companies, one team at a time, well before any formal rollout.",
      "They don't skip the hard part either: the prompt-injection risk that nobody in this space has fully solved yet. Robin's answer for why he stays on Buzz anyway comes down to one thing — sovereignty over his own data and AI infrastructure, even against easier, more polished closed alternatives.",
      "One correction worth noting here since the show is committed to getting numbers right: an on-air stat about companies listing AI agents on their org charts was corrected after broadcast — the accurate figure is 23%, roughly one in four, not the 25% said on air.",
    ],
  },
];

// Transcript + show-notes slots per episode. Arch gate condition satisfied
// (Kate's four passes landed 3 Sept): transcripts filled data-only from
// scripts/episode-transcripts.mjs (GENERATED from Kate's site-pass files;
// conversion rules in its header — trims applied, cut annotations and inline
// flag markers never render, "Host" labels kept, spoken claims kept).
// Show notes stay per-episode gated (Ep 2's HELD until that episode
// publishes) and nothing renders showNotesHtml yet, so transcripts only:
export const EPISODE_EXTRAS = Object.fromEntries(
  Object.entries(EPISODE_TRANSCRIPTS).map(([n, t]) => [n, { transcriptHtml: t.transcriptHtml }])
);

// Association map + content helpers (moved from main(), 7 Sep 2026 — byte-identical logic).
export const articlesByEpisode = new Map(ARTICLES.map((a) => [a.episodeNumber, a]));
export const cleanEpTitle = (ep) => ep.title.replace(/\s*\|\s*Episode\s+\d+\s*$/i, "").trim();
export const epDek = (ep) =>
  articlesByEpisode.get(ep.episodeNumber)?.dek ??
  `Episode ${ep.episodeNumber} of Act Without Asking — AI agents doing real work.`;
export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

export function episodeSlug(ep) {
  const clean = ep.title.replace(/\s*\|\s*Episode\s+\d+\s*$/i, "").trim();
  return clean
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// DoD #1: latest episode playable above the fold. Click-to-play facade — the
// page ships only the thumbnail (fast, no third-party runtime dependency on
// load); the YouTube iframe (privacy-enhanced nocookie domain) is injected on
// click. Consistent with the arch ruling: static build output, no runtime
// fetch until the visitor asks to play.
export function youtubeId(ep) {
  const m = String(ep.url).match(/[?&]v=([\w-]+)/);
  return m ? m[1] : null;
}
