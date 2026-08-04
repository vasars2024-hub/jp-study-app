# DISPATCH B6 — The promise register: what the plans claim vs what the tree contains

Cold agent, `jp-study-app`. **Static analysis only. Do not start, restart or kill any app** —
another agent holds the live queue right now.

## 0. Read first

`.claude/skills/jp-dispatch/SKILL.md` · `.claude/skills/honesty-probe/SKILL.md` (it defines the
**promise-register classification** — use it exactly) · `.claude/skills/claim-check/SKILL.md` ·
`docs/audit/CENSUS_SURFACES.md` and `CENSUS_NAVIGATION.md` — your reachability evidence.

## 1. The job

Extract **every named feature assertion** from the planning documents, with `file:line`, and
classify each against what is actually in the tree.

**This repo is being published.** Plan docs going public are **public claims**. A tick beside a
feature that does not exist is the same dishonesty defect the rest of this audit is finding —
on the front page, and permanent if history is squashed.

## 2. Sources

- `TASKS.md`, `docs/IMPLEMENTATION_PLAN_V1.01.md`, `GRAMMARX_REDESIGN_PLAN.md`,
  `docs/MASTER_PLAN.md`, `docs/RESOURCES_1.01_OVERHAUL_PLAN.md`,
  `TOOLBOX_COMPLETION_AUDIT.md`, `UI_UX_REFINEMENT_MASTER_PLAN.md`, `UI_MIGRATION_DEBT.md`
- `docs/migration/NEXT_SESSION.md` (7,070 lines — **newest slice first, EXCEPT slice 45 which is
  at the BOTTOM**), `docs/migration/FEATURE_PARITY_LEDGER.md`, `progress.json`
- `src/.coordination/study-mode/**`, `src/PHASE_*.md` (20 files)
- The `EXTENSION_*.md` family at the repo root

`docs/MASTER_PLAN.md` is 1,936 lines of feature specification and is the densest source of
unbuilt promises. Sample it systematically and **say what fraction you covered** — do not
pretend to exhaustiveness you did not achieve.

## 3. Classification

Per `honesty-probe`: `SHIPPED-VERIFIED` · `SHIPPED-PARTIAL` · `SHIPPED-DEAD` · `NOT-SHIPPED` ·
`SILENTLY-DROPPED` · `RENAMED/SUPERSEDED`.

**You cannot produce `SHIPPED-VERIFIED` or `SHIPPED-DEAD` yourself** — both require driving the
app, which you must not do. Where a promise's code exists but liveness is unknown, mark it
**`SHIPPED-UNVERIFIED`** and name the surface a later probe must drive. Inventing a live verdict
from a static read is the single worst thing you can do here.

**`SILENTLY-DROPPED` is the highest-value category** — planned, never built, never marked
abandoned, so the document still reads as a commitment.

## 4. Ranking — by exposure, not by age

1. **Claims in shipping UI copy** (a string the user reads inside the app)
2. **Claims in docs that would be published**
3. **Claims in internal planning docs**

A lie the user reads in the app outranks a stale tick in a planning file.

## 5. The template row is already measured — extend it, don't redo it

The visual-novel feature is the calibration case, and B0 already established the facts:
**10 panels** under `components/immersion/`, `main/immersion/visualNovels.ts`,
`shared/visualNovel.ts`, 8 test files — reachable by **exactly one** button
(`ImmersionView.tsx:346`) whose label is a **raw English literal**, with **zero i18n keys of its
own**, and **no `settingsRegistry` entry** (only the keyword `'visual novel'` on the Reading Lens
card, which routes elsewhere).

Now find what the plans *say* about it, and classify. Then apply the same method to every other
substantial feature. **Look especially for the pair shape: a feature the plans mark done that
has one or zero entry points.** The expensive part is already built; only the integration is
missing, which makes these the cheapest high-value rows in the whole audit.

## 6. Also settle these, since they are promises the docs still carry

- **`GRAMMARX_REDESIGN_PLAN.md` §7.1** lists four live defects from 2026-07-19: the "No category"
  chip reading 0 against 852 uncategorised records; filter-sidebar label/count collisions; a raw
  `· ja` language code leaking into UI copy; the saved-filter dropdown resetting its label. Are
  they still in the code? **Re-derive every corpus number with `node tools/grammar-audit.cjs`
  — the plan doc's figures have been measurement artifacts twice.**
- **`TASKS.md`** claims the Game Arena is complete while also recording that it "is not actually
  translated". B0 confirmed 309 keys of English spread into all four catalogs
  (`GAME_ARENA_CHROME` 109 + `MOONCAP_PHASE_LORE` 200). Which plan claims does that contradict?
- **Phase 5 of the GrammarX plan (full rename)** is deferred for stated reasons. Is it recorded
  as deferred everywhere, or does some other doc still claim it?

## 7. Ownership

Create/edit only `docs/audit/PROMISE_REGISTER.md` and `docs/audit/HANDOFF_B6_PROMISES.md`.
**Do not commit, branch or `git add`.** Do not fix anything, do not edit any plan document —
proposing a correction is your output; making it is not.

## 8. Handoff

`HANDOFF_B6_PROMISES.md`, written **as you go**: how many documents you read and what fraction of
`MASTER_PLAN.md` you covered; every count re-derived rather than repeated; which promises you
marked `SHIPPED-UNVERIFIED` and which surface each needs driven; and — separately, because the
user must rule on it — **which documents you would not publish as written, and the specific
claim in each that would mislead an outside reader.**
