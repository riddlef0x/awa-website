---
title: "AWA Twins Phase B — LLM+RAG Arch Spec (backend swap)"
tags: [awa, twins, phase-b, llm, arch-spec, egress]
status: active
created: 2026-09-03
---

# AWA Twins Phase B — LLM+RAG Arch Spec

Spec: Oksana (3 Sep 2026). **CANONICAL BY DESIGNATION of record (3 Sep
~00:5xZ, event of the same hour): this file governs Phase B; the parallel
`PLANS/AWA_TWINS_PHASEB_ARCH_V1.md` is SUPERSEDED (same-key twin-seat race,
two delivery posts 27s apart — f7bc0441 vs 7744d277; this file wins because
the privacy-amendment drafting already targets it). Amendment of record
folded below: §7 corrected (no question text in any first-party log, ever),
§1 gains the `mode` field, §2 gate scope clarified.** Folds and supersedes
the Phase B sketch in `PLANS/AWA_MULTIPAGE_TWINS_ARCH_V1.md` §7 — that
section now reads through this file. Phase A spec
(`AWA_TWINS_V1_SCRIPTED_SPEC.md`) remains governing for everything shipped;
RED verdict of record: event `3e3cb45d` (3 Sep).

## 1. Scope — what Phase B is and is not

- **A backend swap behind the frozen contract.** `POST /api/ask` request and
  response shapes are UNCHANGED (v1 spec §3): `{question ≤280}` →
  `{answer ≤480 ≤3 lines, speaker, citations[], handoff, poolId}`. The UI
  does not know which backend served it. `citations[]` and `handoff` stay
  REQUIRED in every response. **One additive field for QA visibility:**
  every response carries `mode` — `"llm"` | `"pool"` | `"fallback"` — so
  probes and Kaeo's battery can assert which tier served. Additive only;
  existing fields keep byte-identical semantics.
- **Stateless.** One question, one answer. No visitor chat history is
  retained server-side; multi-turn is a post-sprint decision through me.
- **No streaming.** Answers stay ≤480 chars — streaming buys nothing and
  would trigger the framework escape hatch in arch V1 §1. Not revisited.
- **No visitor PII ever** (unchanged): the request carries question text
  only — no identity, no email, no cookies consumed.

## 2. Preconditions — build start gate (all four, no waivers)

1. **Robin's provider + key word** via Stephanie: a DEDICATED key on
   Robin's own provider account for this site. The portfolio shared
   OpenRouter key is BANNED for this endpoint (its daily cap dropped agents
   twice in the week of 1 Sep — a demo-path dependency that fails shut).
2. **Privacy section amended and LIVE before the endpoint flips** (copy
   owner: Jenny, Kate review): it must name third-party LLM processing of
   the question text, retention of twin logs, and the "AI — may be wrong"
   stance. The live page currently promises aggregate-only behavior; a flip
   without the amendment makes the live privacy page FALSE.
   **AMENDMENT (3 Sep, ruling event f77322bb):** "retention of twin logs" is
   satisfied by naming the log contents per the frozen §7 text-free schema
   PLUS the explicit indefinite-retention sentence ("These counts contain
   nothing personal, so we keep them indefinitely — there is nothing in them
   to delete."). No duration window: the logs hold no personal data, so any
   purge promise would be an unenforced one; the claim stays welded to the
   schema freeze (any schema change re-enters review + privacy amendment in
   the same unit). Landed in this repo copy on 4 Sep with the ep3
   retrieval-fix data touch (rider of record, event 86a20302 thread).
3. **This spec reviewed and stamped by me** (any material deviation re-enters
   my review), and **Kaeo QA pass** on the swapped backend incl. fallback
   paths.
4. **Budget word from Stephanie**: daily spend cap value + alert recipient,
   recorded in the deploy receipt before first real call.

**Gate scope (amendment):** items 1, 3 (stamp half) and 4 gate the FLIP —
no real provider call, no key materialization, no spend, no egress-enabled
deploy before all four are green. What MAY proceed before the gate: the
privacy amendment DRAFTING (that is how item 2 gets done), the mock-provider
adapter and local test harness (zero keys, zero egress), and the shared-state
rate limiter upgrade (pure Phase A improvement). The gate is absolute about
spend and egress, not about preparation.

## 3. Egress contract (the amendment the RED verdict named)

What may leave our server to the LLM provider — the COMPLETE list:
- The composed prompt: system prompt (static, in the function), retrieved
  transcript excerpts (repo corpus), and the visitor's question verbatim
  (≤280 chars).
What may NEVER leave:
- Any request header, IP, geolocation, session artifact, or site cookie.
  The provider call is constructed fresh: no `Referer`, no forwarding of
  inbound headers, no user-agent passthrough.
- Pool contents, rate data, keys, logs, or anything from other site paths.
- Any second visitor's data (stateless per question — see §1).
Transport: TLS to a provider endpoint pinned in config; endpoint host
recorded in the deploy receipt. The egress surface is auditable by grep:
one function, one outbound call, one config-pinned host.

## 4. Key custody

- Key lives in a Netlify site-scoped env var, never account-level, never in
  the repo, never in build output. **Build grep gate extends:** build FAILS
  if the env var name or any key-shaped literal appears in emitted assets.
- Dedicated budget cap + monitor on the key (the whole point of §2.1):
  daily cap, alert at 80% to Stephanie's desk, hard stop at cap →
  graceful fallback (§6), never a failed demo.
- Rotation runbook: one env var update + redeploy; no code change. Rotated
  on any suspicion, on staff change, and at 90 days max age.

## 5. Grounding (RAG) — the anti-invention spine

- **Corpus = repo transcripts and verified quote files only**
  (`data/transcripts/`, `data/quotes/`, build-generated index). Nothing the
  model was pretrained on is admissible as a source.
- Retrieval is server-side. Every answer MUST trace to retrieved excerpts:
  `citations[]` carry episode + videoId + timestamp exactly as Phase A.
- **No grounding → no answer from the LLM.** The function falls back to the
  scripted pool response (same shape; `poolId` marks the seam) with the
  standard "say so + episode handoff" pattern. Improvisation is the
  Samantha failure class — it does not ship.
- Biographical-facts rule enforced twice: prompt instruction AND response
  filter (answers asserting bio facts without a retrieved source are
  rejected → fallback). Roast each other, never guests/visitors; the
  visible "AI — may be wrong" tag carries.
- Visitor question text is DATA, never instructions: system prompt
  hardening + output filter; prompt-injection probes belong in Kaeo's QA
  battery.

## 6. Runtime guardrails

- **20s abort → graceful fallback, never a raw 500** (carried from arch V1).
  Fallback response = scripted pool entry or fallback copy + handoff,
  identical response shape.
- Rate limits carried and upgraded: per-IP 10/min stays the floor; Phase B
  moves the counter to shared state (Netlify Blobs) so lambda ephemerality
  stops making it best-effort.
- Global spend cap (§4) is a second, independent brake.
- Latency budget: p95 under 8s sustained; breaches page the same desk as
  spend alerts.
- **Fallback-rate KPI**: if the LLM path fallbacks above a set threshold
  (start: 20% of requests in an hour), the flag flips back to Phase A
  automatically and the incident is receipted — the site visibly degrades
  to v1 rather than silently degrading to junk.

## 7. Logging (unchanged posture, restated)

**CORRECTED BY AMENDMENT (3 Sep): the schema below is TEXT-FREE — the
original wording listed "question text" among log fields, which contradicts
the live privacy page and the aggregate-only contract. Never ships.**

Twin interaction logs stay aggregate-only at the LOG layer (arch V1 §6).
The complete allowed field list, frozen before first row: event type,
`mode` (§1), latency bucket, token bucket, episode handoff target (the KPI),
timestamp. **No question text, no IP, no UA, no coarse metadata beyond the
listed buckets — nothing that identifies a visitor or reconstructs a
question.** The LLM provider receives the prompt (§3) and logs under ITS
policy; that processing is exactly what the amended privacy section (§2.2)
must disclose. The provider call itself writes nothing to our logs beyond
cost/latency metadata. Any future schema change re-enters my review AND a
privacy-page amendment in the same unit.

## 8. Flip plan

- Env flag `ASK_BACKEND=scripted|llm`; deploy is the same build either way.
  **Rollback = flip the env var.** Zero code revert, zero downtime.
- Cutover order: preconditions §2 all green → shadow verification
  (optional: run LLM path against a fixed question set, compare citation
  fidelity) → flip → Kaeo probes → receipt. Phase A code stays deployed
  and warm the whole time; it IS the fallback.

## 9. Non-goals (post-sprint decisions through me)

Streaming responses · multi-turn context · voice/CGI faces (Phase C) ·
any visitor identity or PII · any second provider.

— Oksana, 3 Sep 2026. Build lane may not start before §2; the lane starting
clean Monday means this file, Robin's word, the amended privacy section,
and the budget word all exist before Monday.
