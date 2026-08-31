// POST /api/ask — Twins Phase A (scripted). See PLANS/AWA_TWINS_V1_SCRIPTED_SPEC.md.
// Zero inference, zero external calls at runtime, zero keys. The matching
// function is server-side; the client never sees pool logic (Phase B is a
// backend swap). ask-data.json is generated at BUILD time by scripts/build.mjs
// (handoff URLs resolved against data/youtube.json — unresolvable = build fails).
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("./ask-data.json", import.meta.url), "utf8"));
const { entries, fallbackLines, fallbackHandoff, disagreementIds } = data;
const byId = new Map(entries.map((e) => [e.id, e]));

const MAX_QUESTION = 280;
const RATE_LIMIT = 10; // per window per IP
const RATE_WINDOW_MS = 60_000;

// Per-instance rate limiting (documented Phase A limitation: lambda instances
// are ephemeral, so this is best-effort until Phase B revisits shared state).
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear(); // crude memory bound
  return list.length > RATE_LIMIT;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const GENERIC = new Set(["who", "are", "you", "what", "this", "hello", "hi", "hey", "ai", "agent", "agents", "podcast", "twins", "show", "robin", "tobi", "episode", "episodes", "about"]);

// Weak-evidence words: never counted at word level (they match everything).
const STOPWORDS = new Set(["the", "a", "an", "of", "to", "is", "are", "was", "were", "be", "been", "am", "it", "its", "in", "on", "at", "and", "or", "for", "with", "what", "how", "who", "whats", "do", "does", "did", "me", "my", "your", "you", "this", "that", "they", "them", "their", "we", "us", "our", "so", "if", "was", "will", "can", "get", "got"]);

// Returns best-scoring entry (optionally excluding one). Phrase/topic matches
// are strong evidence (+3); distinct content-word overlaps are weak (+1).
function phraseHit(q, t) {
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`).test(q);
}

function scoreEntries(q, tokens, excludeId) {
  let best = null;
  let bestScore = 0;
  for (const e of entries) {
    if (e.id === excludeId) continue;
    let score = 0;
    const seenWords = new Set();
    for (const topic of e.keywords) {
      const t = normalize(topic);
      if (!t) continue;
      if (phraseHit(q, t)) {
        score += 3;
        continue;
      }
      const words = t.split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w));
      if (words.length === 1) {
        if (tokens.includes(words[0]) || tokens.includes(words[0].replace(/s$/, "")) || tokens.includes(words[0] + "s")) {
          score += 3; // distinctive single-word keyword (singular/plural tolerant)
        }
      } else {
        for (const w of words) {
          if (!seenWords.has(w) && (tokens.includes(w) || tokens.includes(w.replace(/s$/, "")) || tokens.includes(w + "s"))) {
            seenWords.add(w);
            score += 1;
          }
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return { best, bestScore };
}

function matchEntry(question) {
  const q = normalize(question);
  const tokens = q.split(" ").filter(Boolean);
  return scoreEntries(q, tokens, null);
}

const THRESHOLD = 3;

let fallbackIdx = 0;
let disagreementIdx = 0;
let lastServed = null;

function serve(entry) {
  lastServed = entry.id;
  return entry;
}

function nextFallback() {
  const line = fallbackLines[fallbackIdx % fallbackLines.length];
  fallbackIdx += 1;
  return line;
}

function response(entry, { fallback = false } = {}) {
  const answer = fallback
    ? nextFallback()
    : entry.lines.map((l) => (l.speaker === "robin-twin" ? "Robin-twin: " : "Tobi-twin: ") + l.text).join("\n\n");
  const speakers = new Set((entry.lines || []).map((l) => l.speaker));
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer,
      speaker: speakers.size === 1 ? [...speakers][0] : "both",
      citations: entry.citations,
      handoff: entry.handoff,
      poolId: entry.id,
      fallbackUsed: fallback,
    }),
  };
}

function handoffResponse(statusCode, answer) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer,
      speaker: "both",
      citations: fallbackHandoff.citations,
      handoff: fallbackHandoff,
      poolId: "fallback",
      fallbackUsed: true,
    }),
  };
}

function log(event) {
  // Aggregate only — NO question text, no IP, no UA, no fingerprints (spec §7).
  console.log(JSON.stringify({ kind: "twins-metric", t: new Date().toISOString(), ...event }));
}

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return handoffResponse(405, "The twins only take questions, not sightseeing. Use POST.");
    }
    const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown";
    let body = {};
    try {
      body = JSON.parse(await req.text() || "{}");
    } catch {
      return handoffResponse(400, "That question didn't parse. Plain English works best on us.");
    }

    // Client beacon: handoff click counting (aggregate, no identifiers).
    if (body.kind === "handoff-click") {
      log({ poolId: String(body.poolId || "unknown").slice(0, 40), event: "handoffClicked" });
      return { statusCode: 204 };
    }

    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question || question.length > MAX_QUESTION) {
      return handoffResponse(400, `Keep questions under ${MAX_QUESTION} characters — the twins are scripted, not infinite.`);
    }
    if (limited(ip)) {
      return handoffResponse(429, "Easy — ten questions a minute. The humans said the same thing in every episode.");
    }

    const { best, bestScore } = matchEntry(question);
    if (best && bestScore >= THRESHOLD) {
      const served = best.id === lastServed ? matchAlternate(question, best.id) : serve(best);
      if (served) {
        log({ poolId: served.id, fallbackUsed: false });
        return response(served);
      }
    }

    // Ambiguous / generic → disagreement mode: the argument is the product.
    const isGeneric = normalize(question).split(" ").every((w) => GENERIC.has(w));
    if (isGeneric) {
      const id = disagreementIds[disagreementIdx % disagreementIds.length];
      disagreementIdx += 1;
      const entry = byId.get(id);
      if (entry) {
        log({ poolId: entry.id, fallbackUsed: false, mode: "disagreement" });
        return response(entry);
      }
    }

    // Below threshold → honest fallback, never generated text in Phase A.
    log({ poolId: "fallback", fallbackUsed: true });
    return handoffResponse(200, nextFallback());
  } catch (err) {
    // NEVER a raw 500 (the Samantha chat lesson).
    console.error("[ask] failure:", err && err.message);
    return handoffResponse(200, nextFallback());
  }
};

// Alternate repeats: if we just served this entry, serve the next-best match.
function matchAlternate(question, excludeId) {
  const q = normalize(question);
  const tokens = q.split(" ").filter(Boolean);
  const { best, bestScore } = scoreEntries(q, tokens, excludeId);
  return bestScore >= THRESHOLD && best ? serve(best) : byId.get(excludeId);
}
