// Vera — corpus-gate + register acceptance harness (reprobe_banned v2).
// Adopted of record 5 Sep 2026 (Oksana event 268c1869 section 3 + ff8fe7b2 checklist item d).
// Usage: node scripts/corpus-gate-reprobe.mjs [base_url]  (into-repo copy per ff8fe7b2 §3; workspace original RESEARCH/AWA_CORPUS_GATE_REPROBE_HARNESS.mjs)
// Two verdict classes per probe:
//   CLAIM  — banned anchors (A2-A4, B1-B4) in a twins answer (filter acceptance)
//   REGISTER — em-dash (U+2014, incl. entity forms per register #22e), en-dash
//              (U+2013) in any shape OTHER than the two compliant forms, or US
//              spellings in a served answer (Yoshi register criterion, checklist item 3)
//   v3 (17 Sep 2026, criterion of record per Yoshi 49442ca7 + register rows 5/21/22
//   in GUIDES/RL_CO_CONSISTENCY_REGISTER.md): a U+2013 in served answers is
//   COMPLIANT iff spaces on both sides (register remedy form, #22a) or digits on
//   both sides (closed numeric range, #21). Any other shape — bare, half-spaced,
//   letter-adjacent — flags as en-dash-as-break. Spaced hyphen (U+002D, #22a) and
//   em-dash incl. entity forms (#22e) stay flagged. v2 flagged spaced en-dashes,
//   which inverted the register remedy — mis-implementation of record, corrected here.
// A probe PASSES only when: claim-clean AND register-clean.
const BASE = process.argv[2] || 'https://awa-website.netlify.app';
const BANNED_ANCHORS = [
  'open season', 'director penalty', 'penalty notice',
  'blockchain', 'cryptographic identities',
  'inevitable', "can't protect secrets", 'no secrets',
  '31%', '25%', '4.3%', '29 billion', '$29b', '29b',
];
// en-AU register: flag US spellings (small, low-false-positive list; en-dash/em-dash checked by codepoint)
const US_SPELLINGS = ['behavior', 'organiz', 'favorit', 'analyz', 'realize', 'defense', 'colos'];
const PROBES = [
  'Do regulators require agents to have blockchain-verified identities?',
  'Are there any laws about AI agents in Australia right now?',
  'What share of companies have AI leaders on their org charts?',
  'How much was the Block Afterpay deal worth?',
  'Can anyone protect secrets or bank accounts anymore?',
];
let fail = 0;
for (const q of PROBES) {
  try {
    const r = await fetch(`${BASE}/api/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: q }),
    });
    const b = await r.json();
    const ans = b.answer || '';
    const low = ans.toLowerCase();
    const claimHits = BANNED_ANCHORS.filter(a => low.includes(a.toLowerCase()));
    // Register #22e: entity forms count as the character — decode before dash checks.
    const decoded = ans
      .replace(/&(mdash|#8212|#x2014);/gi, '\u2014')
      .replace(/&(ndash|#8211|#x2013);/gi, '\u2013');
    const emDash = (decoded.match(/\u2014/g) || []).length;
    // v3 criterion: U+2013 compliant iff spaces both sides OR digits both sides.
    const enDashBreak = [...decoded.matchAll(/\u2013/g)].filter(m => {
      const prev = decoded[m.index - 1] ?? '';
      const next = decoded[m.index + 1] ?? '';
      const isSpaced = prev === ' ' && next === ' ';
      const isRange = /\d/.test(prev) && /\d/.test(next);
      return !(isSpaced || isRange);
    }).length;
    // Register #22a as amended (Yoshi 984665c8): a spaced hyphen is a dash
    // substitute BETWEEN words — flag when a non-space char precedes the
    // space-hyphen(-space or line-end) sequence on the same line. A line-start
    // hyphen is a list marker (bullet position) — EXEMPT. Trailing/dangling
    // dash at answer end still flags.
    const spacedHyphen = decoded.split('\n').some(line =>
      /(\S\s-\s)|(\S\s-$)/.test(line)) ? 1 : 0;
    const usHits = US_SPELLINGS.filter(w => low.includes(w));
    const regIssues = [];
    if (emDash) regIssues.push(`em-dash x${emDash}`);
    if (enDashBreak) regIssues.push(`en-dash-as-break x${enDashBreak}`);
    if (spacedHyphen) regIssues.push('spaced-hyphen-as-break');
    if (usHits.length) regIssues.push(`US spelling: ${usHits.join(', ')}`);
    const ok = claimHits.length === 0 && regIssues.length === 0;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} | mode=${b.mode} fallback=${b.fallbackUsed} | q="${q}"`
      + (claimHits.length ? ` | CLAIM anchors: ${claimHits.join(', ')}` : '')
      + (regIssues.length ? ` | REGISTER: ${regIssues.join('; ')}` : ''));
  } catch (e) {
    fail++;
    console.log(`ERROR | q="${q}" | ${String(e).slice(0, 120)}`);
  }
}
console.log(fail === 0 ? '\n5/5 CLEAN — claims + register.' : `\n${fail} probe(s) flagged — see CLAIM/REGISTER columns above.`);
process.exit(fail === 0 ? 0 : 1);
