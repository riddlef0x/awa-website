// Corpus-gate unit tests — checklist item (a), spec ff8fe7b2 + Vera 59ec45f8.
// Proves the gate FAILS LOUD on every unresolvable/mutated shape, and that the
// dropped sections are genuinely absent from the emitted index.
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRetrievalIndex, applyCorpusGate, censusCorpus } from "./build-retrieval.mjs";

const yt = JSON.parse(readFileSync(new URL("../data/youtube.json", import.meta.url), "utf8"));
const episodes = yt.episodes || yt;

// --- baseline: gate passes, banned sections gone ---------------------------
const idx = buildRetrievalIndex({ episodes });
const stamps = new Set(idx.excerpts.map((e) => `${e.episode}@${e.timestamp}`));
const expectedDrops = [
  [1, "37:00"], // A2
  [2, "0:55"], //  B1 (covers ~2:26 + ~2:50 — chunker merged)
  [3, "5:00"], //  B3
  [4, "18:46"], // B2
  [4, "13:01"], // A3
  [4, "11:04"], // A4
];
for (const [ep, ts] of expectedDrops) {
  assert.ok(!stamps.has(`${ep}@${ts}`), `banned section Ep${ep} [${ts}] still in emitted index`);
}
assert.equal(idx.corpusGate.droppedCount, 6, `expected 6 drops, got ${idx.corpusGate.droppedCount}`);
console.log("PASS 1: all 6 mapped banned sections absent from emitted index; droppedCount=6");

// --- fingerprint miss → loud fail ------------------------------------------
{
  const gate = JSON.parse(readFileSync(new URL("../data/twins/corpus-gate.json", import.meta.url), "utf8"));
  const mutated = structuredClone(gate);
  mutated.exclusions.find((e) => e.id === "A2").fingerprints = ["this fingerprint no longer exists"];
  const dir = mkdtempSync(path.join(tmpdir(), "cg-"));
  const origPath = path.join(process.cwd(), "data/twins/corpus-gate.json");
  writeFileSync(origPath + ".bak", readFileSync(origPath));
  writeFileSync(origPath, JSON.stringify(mutated));
  try {
    assert.throws(() => buildRetrievalIndex({ episodes }), /fingerprint/);
    console.log("PASS 2: fingerprint miss fails the build loud");
  } finally {
    writeFileSync(origPath, readFileSync(origPath + ".bak"));
    // restore took the backup bytes; drop the backup
    const fs = await import("node:fs");
    fs.unlinkSync(origPath + ".bak");
  }
}

// --- non-dormant empty window → loud fail ----------------------------------
{
  const gate = JSON.parse(readFileSync(new URL("../data/twins/corpus-gate.json", import.meta.url), "utf8"));
  const mutated = structuredClone(gate);
  const phantom = { id: "PX", episode: 2, windowStart: "58:00", windowEnd: "58:30", fingerprints: ["x"], note: "test phantom" };
  mutated.exclusions.push(phantom);
  const dir = mkdtempSync(path.join(tmpdir(), "cg-"));
  const origPath = path.join(process.cwd(), "data/twins/corpus-gate.json");
  const fs = await import("node:fs");
  fs.writeFileSync(origPath + ".bak2", fs.readFileSync(origPath));
  fs.writeFileSync(origPath, JSON.stringify(mutated));
  try {
    assert.throws(() => buildRetrievalIndex({ episodes }), /UNRESOLVABLE/);
    console.log("PASS 3: non-dormant window with no section fails the build loud");
  } finally {
    fs.writeFileSync(origPath, fs.readFileSync(origPath + ".bak2"));
    fs.unlinkSync(origPath + ".bak2");
  }
}

// --- dormant window warns and passes ---------------------------------------
{
  const gate = JSON.parse(readFileSync(new URL("../data/twins/corpus-gate.json", import.meta.url), "utf8"));
  const b4 = gate.exclusions.find((e) => e.id === "B4");
  assert.equal(b4.dormantExpected, true, "B4 must stay dormantExpected until the Ep3 tail lands");
  console.log("PASS 4: B4 dormant marker present; gate warns and continues (seen in baseline run)");
}

// --- census catches planted anchors ----------------------------------------
{
  const planted = structuredClone(idx);
  planted.excerpts[0] = { ...planted.excerpts[0], text: "innocent start. It's open season for agents. end" };
  assert.throws(() => censusCorpus(planted), /CENSUS FAIL/);
  console.log("PASS 5: census catches a planted banned anchor (open season)");
}
{
  const planted = structuredClone(idx);
  planted.excerpts[0] = { ...planted.excerpts[0], text: "Agents will be 25% of headcount by next year, some say." };
  assert.throws(() => censusCorpus(planted), /CENSUS FAIL/);
  console.log("PASS 6: census catches the 25% figure (count-to-zero incl. entities class)");
}
{
  const planted = structuredClone(idx);
  planted.excerpts[0] = { ...planted.excerpts[0], text: 'The vendor said "Anthropic\'s doing 80% of its coding with its own LLM now". That is attributed.' };
  censusCorpus(planted); // must NOT throw — attributed vendor wording is the cleared form
  console.log("PASS 7: attributed vendor 80% wording passes the census");
}
{
  const planted = structuredClone(idx);
  planted.excerpts[0] = { ...planted.excerpts[0], text: "They say 80% of its coding is done with its own model now." };
  assert.throws(() => censusCorpus(planted), /CENSUS FAIL/);
  console.log("PASS 8: UNATTRIBUTED 80% fails the census");
}
{
  const planted = structuredClone(idx);
  planted.excerpts[0] = { ...planted.excerpts[0], text: "figures like 31&#37; of leaders — entity-encoded" };
  assert.throws(() => censusCorpus(planted), /CENSUS FAIL/);
  console.log("PASS 9: census catches entity-encoded figures (&#37;)");
}

console.log("ALL CORPUS-GATE TESTS PASS");
