// Threshold calibration for the per-claim idf material tie (F-NEW-2, Oksana 6150aced).
import { readFileSync } from "node:fs";
import { retrieve, tokenize } from "../../awa-fnew2-tie/netlify/functions/llm/retrieval.mjs";

const idx = JSON.parse(readFileSync("./netlify/functions/ask-retrieval.json", "utf8"));
const excerpts = idx.excerpts;
const N = excerpts.length;

const dfAll = new Map();
for (const e of excerpts) for (const t of new Set(tokenize(e.text || ""))) dfAll.set(t, (dfAll.get(t) || 0) + 1);
const floor = N * 0.1;
const UBIQUITOUS = new Set([...dfAll].filter(([, n]) => n >= floor).map(([t]) => t));
const idf = (t) => Math.log(1 + (N - (dfAll.get(t) || 0) + 0.5) / ((dfAll.get(t) || 0) + 0.5));

const PREFIX = /^(Robin|Tobi)-twin:\s*/;
const EXCLUSION_SPANS = [
  /never\s+(talked|spoke)\s+about\s+[a-z0-9'\u2019,\s\-–&]+/gi,
  /haven'?t\s+covered\s+[a-z0-9'\u2019,\s\-–&]+/gi,
  /\bnot\s+covered\b[^.\n]*\bon the show\b/gi,
];
function claims(answer) {
  return String(answer).split(/\n\n+|(?<=[.!?])\s+/).map(s => s.replace(PREFIX, "").trim()).filter(Boolean);
}
function vocab(claim) {
  let c = claim;
  for (const re of EXCLUSION_SPANS) c = c.replace(re, " ");
  return [...new Set(tokenize(c))].filter(t => !UBIQUITOUS.has(t));
}

const CASES = [
  { name: "kaeo-tokenbill", q: "How big was the token bill that month?",
    answer: "Robin-twin: Tobi burnt through $800 on Opus in his first month with OpenClaw – that's the gnarly bill he mentioned before switching his thinking on Chinese models.\n\nTobi-twin: Hey, I learned my lesson fast! Now I'm comfortable with DeepSeek and GLM because the power-to-cost ratio is just better, and my privacy paranoia evened out.",
    keep: ["1 19:54"], drop: ["1 23:53", "4 9:13"] },
  { name: "yoshi-claim-opus", q: "what was the $800 Opus month?",
    answer: "Robin-twin: That's when I gave my agent Steve full access to Opus and let it rip for three weeks building websites and revamping my finances – burned through $800 because I was using the most expensive frontier model for absolutely everything like an idiot.\n\nTobi-twin: Classic move – you treated Opus like an all-you-can-eat buffet when it's actually Michelin-star pricing per bite. Should've saved it for the hard thinking and used Haiku for grunt work from day one.",
    keep: ["1 19:54", "2 9:55", "1 12:04"], drop: ["1 23:53"] },
  { name: "kaeo-partial-horse", q: "What is your stance on betting on horse races – and how do you raise an AI agent?",
    answer: "Robin-twin: We've never talked about actual horse gambling, but raising agents? You set up their identity files (agent.md, soul.md, user.md) so they know who they are and what they do – then you let them troubleshoot, iterate, and train themselves inside your harness.\n\nTobi-twin: Put guardrails in place, connect them to your data foundation first, and honestly they get smarter the longer you work with them – it's challenging at the start but that's the whole point of harnessing the power instead of fearing it.",
    keep: ["4 28:53", "1 30:55"], drop: ["HORSE"] },
];

for (const c of CASES) {
  const cands = retrieve(c.q, excerpts, { topK: 4 });
  console.log(`\n=== ${c.name} — candidates: ${cands.map(e => `${e.episode} ${e.timestamp}`).join(" | ")}`);
  const cls = claims(c.answer).map(vocab);
  cls.forEach((v, i) => console.log(`  claim${i + 1} vocab (${v.length}): ${v.join(",")}`));
  for (const e of cands) {
    const key = `${e.episode} ${e.timestamp}`;
    const et = new Set(tokenize(e.text || ""));
    const perClaim = cls.map(v => [...v].filter(t => et.has(t)).reduce((s, t) => s + idf(t), 0));
    const best = Math.max(...perClaim);
    const label = c.keep.includes(key) ? "KEEP" : (key === "HORSE" ? "DROP" : c.drop.includes(key) ? "DROP" : "?");
    const shared = perClaim.map((s, i) => `${i + 1}:[${[...cls[i]].filter(t => et.has(t)).join(",")||"-"}=${s.toFixed(2)}]`).join(" ");
    console.log(`  ${key} ${label} best=${best.toFixed(2)}  ${shared}`);
  }
}
console.log("\n=== idf reference ===");
for (const t of ["800","opus","month","twin","before","harness","agent","horse","gambling","deepseek","haiku","steve","privacy","soul","guardrails","openclaw","burnt","bill"]) {
  console.log(`  ${t}: df=${dfAll.get(t) || 0} idf=${idf(t).toFixed(2)}${UBIQUITOUS.has(t) ? " UBIQ" : ""}`);
}
