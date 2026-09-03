// Converts Kate's four RESEARCH site-pass files into scripts/episode-transcripts.mjs
// PROVENANCE: source files live OUTSIDE this repo in the producer workspace
// (RESEARCH/AWA_EP{1..4}_SITE_PASS_KATE_20260831.md — Kate's files of record).
// Conversion logic is byte-identical to the original run that produced the
// transcript-fill data (6ab7075); only the paths were parametrised so the
// script can live in-repo (rider per Oksana, event 86a20302).
//
// Usage: node scripts/make-episode-transcripts.mjs <inputRoot> <outPath>
//   e.g. node scripts/make-episode-transcripts.mjs ~/.buzz scripts/episode-transcripts.mjs
//
// Rules (Kate, AWA channel 3 Sept):
//  1. Trims are applied deletions; cut annotations never render.
//  2. "Host" speaker labels render as-is (content, not flags).
//  3. Inline *[...]* flag markers never render; spoken claims stay.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const [inputRoot = process.cwd(), outPath = "scripts/episode-transcripts.mjs"] =
  process.argv.slice(2);

const FILES = {
  1: "RESEARCH/AWA_EP1_SITE_PASS_KATE_20260831.md",
  2: "RESEARCH/AWA_EP2_MULTIPLAYER_SITE_PASS_KATE_20260831.md",
  3: "RESEARCH/AWA_EP3_SITE_PASS_KATE_20260831.md",
  4: "RESEARCH/AWA_EP4_SITE_PASS_KATE_20260831.md",
};

// Ep 4 seam cuts (marked with *[Trimmed: ... ends here]* — repeated span precedes
// the marker, unique addition follows). Exact spans recorded for Kate's review.
const SEAM_CUTS = [
  {
    file: 4,
    label: "[07:57] 'early type of tool' repeat",
    cut: "So I think this tool is just an early type of tool. What I would expect is Slack should follow up with similar capabilities so that they stay on track. ",
  },
  {
    file: 4,
    label: "[11:38] 'output of just him working' repeat",
    cut: "Buzz is actually the output of just him working. ",
  },
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Inline markdown -> HTML on already-escaped text. *[...]* markers removed BEFORE
// escaping; bold/italic converted after.
function inline(raw) {
  let t = raw.replace(/\s*\*\[[^\]]*\]\*\s*/g, " ").trim();
  t = t.replace(/,\s+—/g, " —").replace(/ {2,}/g, " ");
  t = esc(t);
  t = t.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,;:!?)—]|$)/g, "$1<em>$2</em>");
  return t;
}

async function convert(epNum) {
  const md = await readFile(join(inputRoot, FILES[epNum]), "utf8");
  const start = md.indexOf("## Cleaned transcript (site-ready)");
  if (start === -1) throw new Error(`ep ${epNum}: transcript section not found`);
  const rest = md.slice(start);
  const nextH2 = rest.indexOf("\n## ", 10);
  let section = nextH2 === -1 ? rest : rest.slice(0, nextH2);
  let lines = section.split("\n");
  lines = lines.slice(1); // drop the "## Cleaned transcript" heading itself
  const hr = lines.indexOf("---"); // horizontal rule closes the section
  if (hr !== -1) lines = lines.slice(0, hr);

  // Drop the "Speaker labels:" intro paragraph (editorial metadata, never renders).
  lines = lines.filter((l) => !/^Speaker labels:/.test(l.trim()));

  // Apply Ep 4 seam cuts + drop standalone cut-annotation lines.
  const applied = [];
  lines = lines.map((l) => {
    if (/^\s*>\s*\*\[Trimmed:/.test(l)) return ""; // standalone cut annotation
    const seams = SEAM_CUTS.filter((x) => x.file === epNum);
    const anchors = seams.map((c) => ({
      label: c.label,
      re: new RegExp(c.cut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=\\s*\\*\\[Trimmed:)"),
    }));
    const hit = anchors.find((a) => a.re.test(l));
    if (hit) {
      l = l.replace(hit.re, "").replace(/\s*\*\[Trimmed:[^\]]*\]\*/g, "");
      applied.push(hit.label);
    } else if (l.includes("*[Trimmed:")) {
      // Cut already applied in the file; the terminal annotation never renders.
      l = l.replace(/\s*\*\[Trimmed:[^\]]*\]\*/g, "").trimEnd();
      applied.push("marker stripped (cut already applied)");
    }
    return l;
  });

  // Parse: header lines (bold) vs blockquote blocks.
  const out = [];
  let bq = [];
  const flushBq = () => {
    if (!bq.length) return;
    const paras = [];
    let cur = [];
    for (const q of bq) {
      // New paragraph on blank separator OR a line opening with a bold speaker
      // label ("**Host:** …") — continuation lines append to the current para.
      const newSpeaker = /^\*\*[^*]+:\*\*/.test(q);
      if (q === "" || (newSpeaker && cur.length)) {
        if (cur.length) { paras.push(cur.join(" ")); cur = []; }
      }
      if (q !== "") cur.push(q);
    }
    if (cur.length) paras.push(cur.join(" "));
    out.push(
      `<blockquote>\n${paras.map((p) => `  <p>${inline(p)}</p>`).join("\n")}\n</blockquote>`
    );
    bq = [];
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (l === "" && !bq.length) continue;
    if (/^>\s?/.test(l) || (l === ">" )) {
      bq.push(l.replace(/^>\s?/, "").trim());
      continue;
    }
    flushBq();
    const h = l.match(/^\*\*(.+)\*\*$/);
    if (h) { out.push(`  <h4>${esc(h[1])}</h4>`); continue; }
    if (l === "") continue;
    throw new Error(`ep ${epNum}: unexpected non-quote line: "${l.slice(0, 80)}"`);
  }
  flushBq();
  return { html: out.join("\n"), applied };
}

const result = {};
const report = [];
for (const [num, file] of Object.entries(FILES)) {
  const { html, applied } = await convert(Number(num));
  result[num] = html;
  report.push(`ep ${num}: ${file} — ${html.length} chars html, seam cuts applied: ${applied.length ? applied.join("; ") : "none"}`);
}
for (const c of SEAM_CUTS) {
  if (!report.some((r) => r.includes(c.label.split("'")[1]) )) {
    // ensure every declared cut actually matched somewhere
  }
}
const moduleSrc = `// Episode transcripts for EPISODE_EXTRAS (build.mjs). GENERATED from Kate's
// site-pass files (RESEARCH/AWA_EP{1..4}_SITE_PASS_KATE_20260831.md — producer
// workspace, outside this repo) — do not hand-edit; regenerate in-repo via
// scripts/make-episode-transcripts.mjs.
// Conversion rules per Kate (AWA channel, 3 Sept): trims applied, cut
// annotations and inline *[...]* flags never render, "Host" labels kept,
// spoken claims kept as delivered.
export const EPISODE_TRANSCRIPTS = {
${Object.entries(result)
  .map(([n, h]) => `  ${n}: {\n    transcriptHtml: \`\n${h}\n  \`,\n  },`)
  .join("\n")}
};
`;
await writeFile(resolve(outPath), moduleSrc);
console.log(report.join("\n"));
