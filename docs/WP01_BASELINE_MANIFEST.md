# WP01 Baseline Manifest — AWA Redesign

Date: 2026-09-07 (ICT). Branch: `jenny/wp01-baseline` @ `c2829fa`. Owner: Jenny (Producer), integration lead.

## 1. Reconciliation (handoff §WP01.1)

- Package-pinned production baseline: `c2829faba2d67fde9e5911dd27a01641ea45d5da` (deployed 6 Sept 2026 06:00 UTC).
- `origin/main` tip: `c2829fa` — **identical to the pinned baseline**. No newer work to preserve beyond feed refresh.
- Prod-vs-baseline byte-diff (5 static routes + home): all routes byte-identical; `/` differs ONLY by shorts-wall dates shifted one day (scheduled rebuild posted fresher feed). **No code or content drift.**
- Clean build at `c2829fa`: exit 0, 18 pages, twins gates pass, retrieval=87 excerpts, stale=false.
- `npm run test:twins`: **ALL PASS** (rate limiter + LLM seam suites).
- 233f201 (blog index) verified ancestor of origin/main — nothing lost.

## 2. Feed additions since package audit (handoff §WP01.3)

- Package audit says "six checked-in shorts"; live fetch 7 Sept returns **9 shorts** (source: playlist-feed), 0 dropped/unclassified, 4 episodes. Shorts wall renders the top slice; count delta is feed-side, not a regression.
- Checked-in `data/youtube.json` is superseded by the live fetch on build; foundation change treats live fetch as the source of truth (established flow).

## 3. Route/content inventory (handoff §WP01.5, manifest of record)

Pages (15 HTML + 404): `/`, `/episodes/`, 4 episode pages, `/articles/`, 4 article pages, `/about/`, `/subscribe/`, `/privacy/`, `/twins/`, `404.html` (serves HTTP 404).
Infrastructure: `_redirects` (ask rewrite preserved), `robots.txt`, `sitemap.xml`, `llms.txt`, `site.css`, `favicon.ico`, `og-card.png`.
Backend (DO NOT REDESIGN): `netlify/functions/ask.mjs` contract frozen; rate limiting + scripted fallback behavior frozen; scheduled rebuild + feed refresh frozen; source citations frozen.

## 4. Slug freeze (handoff §WP01.4) — persistent, seed for content contracts

Episodes: `what-is-an-ai-harness`, `building-an-agent-s-brain`, `multiplayer-ai-agents`, `buzz`.
Articles: `ai-harness-over-model`, `agent-memory`, `multiplayer-agents`, `we-moved-onto-buzz`.
Article↔episode associations (existing): ai-harness-over-model↔what-is-an-ai-harness; agent-memory↔building-an-agent-s-brain; multiplayer-agents↔multiplayer-ai-agents; we-moved-onto-buzz↔buzz.
Fixed paths: `/`, `/episodes/`, `/articles/`, `/twins/`, `/about/`, `/subscribe/`, `/privacy/`.
**No redirects needed — no path changes.** Title edits must never change these slugs.

## 5. Subscription readiness (handoff §WP01.2, recorded separately, no secrets inspected)

- `emailReady = FALSE`. Evidence: `scripts/build.mjs:816-833` — subscribe form ships hard-disabled (`data-pending`, inputs disabled, onsubmit blocked); comment of record "form ships DISABLED until the MailerLite group exists"; no provider integration, no key, no delivery evidence anywhere in repo. Standing blocker: MailerLite group/account not yet created.
- `kitReady = FALSE`. Evidence: Kit is PROMISED in copy (build.mjs:588,616,774,824) but no downloadable asset exists — `assets/` contains only favicon + og-card; the Kit exists as a workspace draft awaiting editorial passes, not a deliverable. **WP06 must remove/soften the Kit promise while kitReady=false (package §WP06).**

## 6. Baseline captures (handoff §WP01.1; QA of record for WP08)

`baseline-captures/` — 10 PNGs (deviceScaleFactor 2), captured 7 Sept from a clean local build of `c2829fa`:
- 390x844 (mobile): home, episodes, episode (building-an-agent-s-brain), twins, subscribe
- 1440x1000 (desktop): same five routes
Names: `before-<route>-{mob,desk}.png`. These are the "before" evidence set; the package's historical 390px screenshot is superseded by these fresh captures.

## 7. File ownership map (handoff §WP01.6 — freeze announcement)

Frozen interfaces (proposed destination paths per package, adapted to this repo in the foundation change set):
- `scripts/build.mjs` + config/orchestration: **WP01/Jenny ONLY until release merge.**
- Shared shell/components/tokens/theme assets: WP02.
- Home/episode library renderers: WP03. Reading/about/privacy/404 bodies: WP04.
- Twins frontend (backend contract frozen): WP05. Subscribe states: WP06. Assets/metadata: WP07.
- Evidence/verify scripts: WP08.
Shared-file requests go through WP01 with the exact requested change. No one edits `package.json`, tokens, or shared shell concurrently. Backend ask files: nobody (frozen).
