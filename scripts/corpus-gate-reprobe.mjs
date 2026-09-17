// Vera — corpus-gate + register acceptance harness (reprobe_banned v2).
// Adopted of record 5 Sep 2026 (Oksana event 268c1869 section 3 + ff8fe7b2 checklist item d).
// Usage: node scripts/corpus-gate-reprobe.mjs [base_url]  (into-repo copy per ff8fe7b2 §3; workspace original RESEARCH/AWA_CORPUS_GATE_REPROBE_HARNESS.mjs)
// Two verdict classes per probe:
//   CLAIM  — banned anchors (A2-A4, B1-B4) in a twins answer (filter acceptance)
//   REGISTER — em-dash (U+2014) or en-dash-as-break (U+2013 with surrounding spaces)
//              or US spellings in a served answer (Yoshi register criterion, checklist item 3)
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
    const emDash = (ans.match(/\u2014/g) || []).length;
    const enDashBreak = /(\s\u2013\s)|(\u2013\s*$)|(\u2013\s+[a-z])/i.test(ans) ? 1 : 0;
    const usHits = US_SPELLINGS.filter(w => low.includes(w));
    const regIssues = [];
    if (emDash) regIssues.push(`em-dash x${emDash}`);
    if (enDashBreak) regIssues.push('en-dash-as-break');
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
