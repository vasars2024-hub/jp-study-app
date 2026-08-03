# Documentation disposition — what publishes, what does not

**Produced by A2, 2026-08-04.** `docs/audit/DISPATCH_A2_LICENSE.md` §4.
**Every row here is a recommendation. The user rules.**

> **A plan document published is a public claim.** A tick beside a feature that does not exist is
> the same dishonesty defect this audit exists to find — on the front page, and permanent if
> history is squashed. That is why almost nothing in this repo is rated plain **PUBLISH**: not
> because the documents are bad, but because **A2 did not re-verify their completion claims
> against shipped behaviour, and neither has anyone else.** `PUBLISH WITH BANNER` is the honest
> rating for a document whose contents nobody has re-checked.

## Vocabulary

| Rating | Meaning |
|---|---|
| **PUBLISH** | Accurate and useful to an outside reader |
| **PUBLISH WITH BANNER** | Useful, but must carry *"internal working notes, not a specification"* |
| **KEEP PRIVATE** | Internal-only, machine-specific, or contains claims I cannot vouch for |
| **CORRECT FIRST** | Would mislead as written — the specific claim is named |

---

## 1. Measured surface

Counted with `git ls-files` — **what would actually publish**, not what sits on disk.

| Family | Tracked | Recommendation |
|---|---:|---|
| root `*.md` | **37** | mixed — see §3 |
| `docs/` root `*.md` | 10 | mixed |
| `docs/frutiger-aero/**` | 33 | **PUBLISH WITH BANNER** (whole family) |
| `docs/mobile/**` | 3 | **PUBLISH WITH BANNER** (whole family) |
| `docs/audit/**` | 5 tracked (10 on disk incl. this run's 3) | mixed |
| `docs/migration/*.md` (non-proof) | 27 | mixed, mostly BANNER |
| `docs/migration/tools/**` | 56 | **PUBLISH** (whole family) — see §2.1 |
| `docs/migration/proof/**` | **286 files / 258 dirs** | **KEEP PRIVATE** (whole family) — §2.2 |
| `src/` top-level `*.md` | 20 | **PUBLISH WITH BANNER** (whole family) |
| `src/.coordination/**` | 15 | **KEEP PRIVATE** (whole family) — §2.3 |
| `.claude/**` | 11 | mixed — ruled in `GITIGNORE_DRAFT.md` §5 |
| **all tracked `*.md`** | **176** | |

**Corrections to `PRECOST_A1_A2_PROVENANCE.md:100-106`:** `docs/**` is **87** tracked `*.md`, not
85 (90 exist on disk; 3 are untracked, including this run's own output).
`src/.coordination/**` is **15** tracked files, not 12. Root 37, `src/*.md` 20 and 258 proof
directories are **confirmed exactly**.

### The measurement used for family rulings

Rather than hand-classify, every family was grepped in full for a literal developer home path
(`C:\Users\Arseniy` / `/c/Users/Arseniy`):

| Family | Files | Contain a developer home path |
|---|---:|---:|
| `docs/migration/proof/**` | 286 in 258 dirs | **211 of 247 dirs (85%)** |
| root `*.md` | 37 | 7 |
| `docs/migration/tools/**` | 56 | 7 |
| `docs/migration/*.md` | 27 | 8 |
| `src/.coordination/**` | 15 | 2 |
| `docs/audit/**` | 5 | 2 |
| `docs/frutiger-aero/**` | 33 | **0** |
| `docs/mobile/**` | 3 | **0** |
| `src/` top-level `*.md` | 20 | **0** |

`docs/frutiger-aero`, `docs/mobile` and `src/*.md` are **clean** on this measure — which is what
makes a family-level PUBLISH WITH BANNER defensible for them rather than a guess.

---

## 2. The family rulings, with evidence

### 2.1 `docs/migration/tools/**` (56 files) — **PUBLISH**

The strongest publish case in the repo, and the one I would lead with. These are 56 `.mjs` gates,
harnesses and measurement probes — `license-audit-gate.mjs`, `audit-carried-items.mjs`,
`a11y-pixel-sampler.mjs`, `packaged-a11y-deep-gate.mjs`, `import-graph.mjs`,
`build-patched-sidecar.mjs`. They are *executable methodology*: an outside reader can run them and
get the same answer. That is exactly what a public repo should carry, and it is rare.

**7 of 56 contain a developer home path** and need a one-line scrub first (parameterise or read
from `process.env`/`app.getAppPath()`). Cost: under an hour for all seven. **Scrub those 7, then
publish all 56.**

### 2.2 `docs/migration/proof/**` (286 files, 258 dirs) — **KEEP PRIVATE, whole family**

**Not sampled — measured.** `git grep` over all 286 tracked files:

- **211 of the 247 directories containing any tracked text file (85%) hold a literal
  `C:\Users\Arseniy` path.**
- **123 directories** mention personal media titles, `.mkv` paths, or MAL account data.
- 261 of the 286 files are `.json` run artifacts — timings, ports, pids, profile contents.

One of the 12 tracked PNGs was opened as a spot check:
**`docs/migration/proof/startatsec-20260730/real-app-1-library.png`** shows, in one frame:

- `C:\Users\Arseniy\Documents\books` — an auto-import path in the UI
- `datadir C:\Users\Arseniy\AppData\Local\Temp\seanime-phase3-gplay-20260728`, `port 63726`,
  `pid 31856`
- **the user's real personal library** — 24 items including 悪の教典 02, 木村宗喜, ハサミ男, 1Q84
- **third-party manga cover art and interior scanlation pages** (One Punch-Man, three copies at
  different OCR/translation stages)

That last item is a **copyright exposure distinct from the privacy one.** Publishing screenshots
of scanlated manga interiors in a public repo is a redistribution question, and it is not
answered by GPL-3.0 on the code.

> **This is the single strongest KEEP PRIVATE case in the audit**, and it is also the strongest
> argument for squashing history rather than scrubbing: 258 directories cannot be usefully
> redacted, and every one of them exists in history whether or not it exists in the working tree.

**Counter-consideration the user should weigh:** these proof directories are the *evidence* behind
the migration's claims. Keeping them private means the public plan documents assert results whose
backing is not visible. If that trade is uncomfortable, the answer is a small curated
`docs/evidence/` — a handful of regenerated, path-scrubbed, fixture-only runs — **not**
publishing the 258.

### 2.3 `src/.coordination/**` (15 files) — **KEEP PRIVATE, whole family**

Multi-agent coordination state: `SESSION_LOG.md`, `HANDOFF.md`, `NEXT_ACTIONS.md`,
`CURRENT_STATE.md`, `TEST_STATUS.md`, `state.json`, plus two `.cjs` fixture-removal scripts that
hardcode `C:\Users\Arseniy\AppData\Roaming\jp-study-app\...`
(`remove-rank22-media-fixture.cjs:19`, `remove-rank22-fixture.cjs:15`).

These document incidents — a lost `desktop-layout.json` backup, hash comparisons of the user's
live profile (`SESSION_LOG.md:1734`), what the user's saved desktop contains. Meaningless to an
outside reader and a running commentary on the user's own machine. Nothing here is a
specification. **It also does not belong under `src/`** — a directory of agent session logs
inside the source tree is a structural oddity an outside reader will notice immediately.

### 2.4 `docs/frutiger-aero/**` (33 files) — **PUBLISH WITH BANNER, whole family**

Zero developer paths. These are genuine design-system documents — `DESIGN_SYSTEM.md`,
`THEME_TOKEN_REFERENCE.md`, `COMPONENT_LIBRARY.md`, `MOTION_GUIDELINES.md`, `ACCESSIBILITY.md`,
`WINDOW_MANAGER.md`. This is the most outward-facing writing in the repo and the family most
likely to be useful to someone else.

**Banner, not plain publish**, for two reasons: three of the 33 are QA/audit documents
(`DESKTOP_SHELL_QA.md`, `LIVING_DESKTOP_QA.md`, `PHASE_4_QA.md`, `VERIFICATION.md`) whose pass
claims A2 did not re-verify; and the design docs describe an intended system, which may have
drifted from `styles.css`. The banner costs nothing and makes the distinction honest.

### 2.5 `docs/mobile/**` (3 files) — **PUBLISH WITH BANNER**

`MOBILE_EXPANSION_MASTER_PLAN.md`, `M00_MOBILE_PRODUCT_CHARTER.md`,
`M01_CAPABILITY_RELEASE_MATRIX.md`. Zero developer paths. **These describe a product that does
not exist** — there is no mobile build in this repo. That is fine for a published roadmap
*provided the banner says so*; without it, a "capability release matrix" for an unbuilt app is
precisely the misleading-tick problem. **Banner must state: aspirational, nothing shipped.**

### 2.6 `src/` top-level `*.md` (20 files) — **PUBLISH WITH BANNER or relocate**

Zero developer paths — cleaner than expected. All 20 are `PHASE_*_STATE.md` / `PHASE_*_PLAN.md` /
`PHASE_*_AUDIT.md` documents plus `VIEWPORT_ARCHITECTURE.md` and `MEDIA_CENTER_REVAMP_AUDIT.md`.

Two of them are worth publishing on their own merit: **`VIEWPORT_ARCHITECTURE.md`** (real
architecture reference) and **`PHASE_5_AUDIO_PROOF_PROVENANCE.md`** (asset provenance — directly
relevant to the licensing story and to A1's half).

**Separate recommendation regardless of rating: move all 20 out of `src/`.** Phase-state documents
in the source root are the first thing an outside reader sees when they open `src/`, and they read
as clutter. `docs/phases/` costs one `git mv`.

---

## 3. Root `*.md` — all 37

**Method disclosure:** these rulings come from filename, size, family, the full developer-path
grep in §1, and spot-reads. **I opened `PROJECT.md` and `CLAUDE.md` in full; the other 35 I did
not read end to end.** Where a rating depends on content I did not verify, it is
`PUBLISH WITH BANNER` rather than `PUBLISH` — that is the rating's purpose.

| Document | KB | Rating | Why |
|---|---:|---|---|
| `CLAUDE.md` | 4 | **PUBLISH** | Read in full. Project persona + the i18n workflow contract. Accurate, useful, and conventional to publish |
| `AGENTS.md` | 1 | **PUBLISH** | Agent entry point; conventional |
| `PROJECT.md` | 7 | **CORRECT FIRST** | Read in full. Excellent architecture summary naming real files, with an honest "Defects / debts" section — **but line 46 says "Global `tsc` remains broken under TS 4.5 vs modern `@types`" and the repo is on TypeScript 5.2.2** (`node -p "require('./node_modules/typescript/package.json').version"`). The symptom is real (~327 pre-existing errors); the stated cause names a version that is not installed. Fix that line and this becomes the best PUBLISH candidate at root |
| `FRUTIGER_AERO_OS_VISION.md` | 18 | **PUBLISH WITH BANNER** | Vision/aesthetic direction. Aspirational by nature; banner makes that explicit |
| `TASKS.md` | 72 | **KEEP PRIVATE** | Largest root doc; a live task list, not a specification. `PRECOST_A1_A2_PROVENANCE.md:23` already flags one unverified provenance claim in it ("7→99 authored in-repo") |
| `UI_MIGRATION_DEBT.md` | 71 | **KEEP PRIVATE** | Contains a developer home path. A debt ledger is internal by nature |
| `BLANC_REFINEMENT_PLAN.md` | 69 | **PUBLISH WITH BANNER** | Large live plan; completion claims unverified |
| `EXTENSION_AUDIT_REPORT.md` | 61 | **KEEP PRIVATE** | Contains a developer home path |
| `GRAMMARX_REDESIGN_PLAN.md` | 53 | **PUBLISH WITH BANNER** | Plan doc |
| `SERVICES_PATCH.md` | 50 | **PUBLISH WITH BANNER** | Implementation notes |
| `PHASE_6_5_AUDIT.md` | 47 | **KEEP PRIVATE** | Contains a developer home path |
| `PHASE_6_5_CLEANUP_LOG.md` | 33 | **KEEP PRIVATE** | Contains a developer home path; a cleanup log is pure session residue |
| `UI_UX_AUDIT.md` | 28 | **PUBLISH WITH BANNER** | Audit findings; unverified |
| `UI_UX_REFINEMENT_MASTER_PLAN.md` | 21 | **PUBLISH WITH BANNER** | Plan |
| `PHASE_6_5_BASELINE_PLAN.md` | 21 | **PUBLISH WITH BANNER** | Plan |
| `UI_UX_CORE_SHELL_EXECUTION_PLAN.md` | 11 | **PUBLISH WITH BANNER** | Plan |
| `TOOLBOX_COMPLETION_AUDIT.md` | 11 | **PUBLISH WITH BANNER** | "Completion audit" — the exact genre the banner exists for |
| `PHASE_1_IMPLEMENTATION_PLAN.md` | 10 | **KEEP PRIVATE** | Contains a developer home path |
| `UI_UX_APP_SCREENS_EXECUTION_PLAN.md` | 9 | **PUBLISH WITH BANNER** | Plan |
| `REPOSITORY_STABILIZATION_MANIFEST.md` | 9 | **KEEP PRIVATE** | Developer home path; describes this machine's recovery |
| `UI_UX_INTEGRATION_PROTOCOL.md` | 8 | **PUBLISH WITH BANNER** | Process doc |
| `PHASE_6_5_IMPLEMENTATION_PLAN.md` | 7 | **PUBLISH WITH BANNER** | Plan |
| `REPOSITORY_STABILIZATION_RISKS.md` | 5 | **KEEP PRIVATE** | Machine-specific risk register |
| `EXTENSION_PRODUCT_AUDIT.md` | 5 | **PUBLISH WITH BANNER** | Audit |
| `EXTENSION_FINAL_VERIFICATION.md` | 5 | **PUBLISH WITH BANNER** | "Final verification" — banner mandatory; A2 verified none of it |
| `PHASE_3_AUDIT.md` | 4 | **PUBLISH WITH BANNER** | Audit |
| `EXTENSION_READER_POPUP_SPEC.md` | 4 | **PUBLISH WITH BANNER** | Spec |
| `EXTENSION_FEATURE_TRUTH_MATRIX.md` | 4 | **PUBLISH WITH BANNER** | A "truth matrix" is a completion-claim table by another name. Banner, or re-verify before publishing |
| `REPOSITORY_RECOVERY.md` | 3 | **KEEP PRIVATE** | Developer home path; incident record for this machine |
| `PHASE_3_IMPLEMENTATION_PLAN.md` | 3 | **PUBLISH WITH BANNER** | Plan |
| `PHASE_2_IMPLEMENTATION_PLAN.md` | 3 | **PUBLISH WITH BANNER** | Plan |
| `EXTENSION_UX_REBUILD_SPEC.md` | 2 | **PUBLISH WITH BANNER** | Spec |
| `EXTENSION_SETTINGS_ARCHITECTURE.md` | 2 | **PUBLISH WITH BANNER** | Architecture note |
| `EXTENSION_REDUNDANCY_MAP.md` | 2 | **PUBLISH WITH BANNER** | Analysis |
| `EXTENSION_RADIAL_WHEEL_DECISION.md` | 2 | **PUBLISH** | A design decision record with its rationale — the genre that ages well |
| `EXTENSION_COMMAND_MODEL.md` | 2 | **PUBLISH WITH BANNER** | Model doc |
| `EXTENSION_MIGRATION_REPORT.md` | 1 | **PUBLISH WITH BANNER** | Report |

**Root summary: 3 PUBLISH · 24 PUBLISH WITH BANNER · 9 KEEP PRIVATE · 1 CORRECT FIRST = 37.**
The KEEP PRIVATE set is exactly the **7 root docs carrying a developer home path**
(`EXTENSION_AUDIT_REPORT`, `PHASE_1_IMPLEMENTATION_PLAN`, `PHASE_6_5_AUDIT`,
`PHASE_6_5_CLEANUP_LOG`, `REPOSITORY_RECOVERY`, `REPOSITORY_STABILIZATION_MANIFEST`,
`UI_MIGRATION_DEBT`) plus `TASKS.md` and `REPOSITORY_STABILIZATION_RISKS.md`.

**Independent of every rating above: 37 planning documents in the repository root is itself the
problem.** Whatever survives should move to `docs/`, leaving root with `README.md`, `LICENSE`,
`CLAUDE.md`, `AGENTS.md` and config.

---

## 4. `docs/` root and `docs/migration/*.md`

| Document | Rating | Why |
|---|---|---|
| `docs/MASTER_PLAN.md` | **PUBLISH WITH BANNER** | The top-level plan; unverified completion claims |
| `docs/IMPLEMENTATION_PLAN_V1.01.md` | **PUBLISH WITH BANNER** | Plan |
| `docs/RESOURCES_1.01_OVERHAUL_PLAN.md` | **PUBLISH WITH BANNER** | Plan |
| `docs/WIRED_BESPOKE_SPEC.md` | **PUBLISH WITH BANNER** | Theme spec |
| `docs/translate-linguistic-analysis-plan.md` | **PUBLISH WITH BANNER** | Plan |
| `docs/SCRAPER_REALITY_AUDIT.md` | **PUBLISH WITH BANNER** | A "reality audit" is the right genre for this repo; banner because unverified |
| `docs/EXTENSION_BUGFIX_ROUND4.md` | **KEEP PRIVATE** | Session-round bugfix log |
| `docs/LIVING_DESKTOP_QA.md` | **PUBLISH WITH BANNER** | QA checklist |
| `docs/IMMERSIVE_DESKTOP_LIVING_LAYER_DEBUG.md` | **KEEP PRIVATE** | Debug session notes |
| `docs/MANGA_DOWNLOAD_AND_EXTENSION_VERIFICATION_20260802.md` | **KEEP PRIVATE** | Dated verification run; likely names real downloads |
| `docs/migration/ARCHITECTURE_DECISIONS.md` | **PUBLISH** | ADRs — including ADR-001, the GPL flip. Directly relevant to a published GPL repo |
| `docs/migration/LICENSING_PLAN.md` | **CORRECT FIRST** | Three stale claims — §5 |
| `docs/migration/SEANIME_MIGRATION_PLAN.md` | **CORRECT FIRST** | Developer home path, **and** `LICENSING_PLAN.md:114-129` records that its "unmodified pinned binary" posture stopped being true on 2026-08-02. Publishing the superseded framing misstates a GPL source obligation |
| `docs/migration/RISK_REGISTER.md` | **PUBLISH WITH BANNER** | Useful; unverified |
| `docs/migration/FEATURE_PARITY_LEDGER.md` | **CORRECT FIRST or KEEP PRIVATE** | A parity ledger is *entirely* completion claims. **This is the single highest-risk document to publish unverified.** Either re-verify every row or keep it private — a banner is too weak here |
| `docs/migration/CURRENT_STATE.md`, `NEXT_SESSION.md`, `SCHEDULED_SWEEP_BRIEF.md`, `TEST_EVIDENCE.md` | **KEEP PRIVATE** | All four contain developer home paths; all four are live session state |
| `docs/migration/SLICE_*.md` (14 files) | **KEEP PRIVATE** | Per-slice working notes. 3 contain developer home paths (`SLICE_59`, `SLICE_71`, `SLICE_74`). Meaningless without the session context |
| `docs/migration/USER_VERIFICATION_CHECKLIST.md` | **KEEP PRIVATE** | A checklist addressed to this user, about this machine |
| `docs/audit/DISPATCH_*.md`, `HANDOFF_*.md`, `PRECOST_*.md` (5 tracked, 10 on disk) | **KEEP PRIVATE** | Audit working papers, including this file. 2 contain developer home paths. Their *conclusions* belong in public documents; the papers themselves do not |

---

## 5. CORRECT FIRST — the specific claims

Each names the claim and its evidence, so the fix is mechanical.

| Document | Claim as written | Why it misleads |
|---|---|---|
| `PROJECT.md:46` | "Global `tsc` remains broken under **TS 4.5** vs modern `@types`" | Installed TypeScript is **5.2.2** (`package.json` declares `~5.2.2`). The breakage is real; the stated cause is not |
| `docs/migration/LICENSING_PLAN.md:32` | "no declared license — 2 — `fast-shallow-equal`, `react-universal-interface`" | Both ship a verbatim **Unlicense** text file (`node_modules/fast-shallow-equal/LICENSE:1-25`). Reads as an open risk; it is closed |
| `docs/migration/LICENSING_PLAN.md:29` | "weak copyleft — 15" | 13 of the 15 are other-platform optional binaries **not installed and not shipped** on Windows. Only `@img/sharp-win32-x64` and `jassub` ship |
| `docs/migration/LICENSING_PLAN.md:88-92` | `hsk-import`, `mirrorTexts`, `gradedSentences`, `novels`, `catalogFallback`, `worldMapPaths` = "**Unknown**" provenance | Already refuted by `PRECOST_A1_A2_PROVENANCE.md:19-22` — four of six document their own provenance and one has its generator *and* source in-tree. Never corrected in the plan itself. **Publishing an "unknown provenance" table that its own author disproved is worse than publishing nothing** |
| `docs/migration/SEANIME_MIGRATION_PLAN.md` | "unmodified pinned binary, conventional separate-program posture" | Superseded 2026-08-02 per `LICENSING_PLAN.md:114-129`; the staged sidecar is patched, which triggers the fork-source publication obligation |
| `docs/audit/PRECOST_A1_A2_PROVENANCE.md:100-106` | `docs/**` = 85; `src/.coordination` = 12 | Measured **87** and **15** tracked (§1) |
| `docs/migration/FEATURE_PARITY_LEDGER.md` | (whole document) | Not a specific claim — I did not open it. It is flagged because a parity ledger is *definitionally* a table of completion claims, and **no one has re-verified it.** Either verify or keep private |

---

## 6. What is missing, and matters more than any ruling above

**There is no `README.md`.**

```
$ git ls-files | grep -iE '^readme'
(no output)
```

`LICENSE` is present (GPLv3). A repository published with **37 planning documents in its root and
no README** leads with its internal working notes. Every rating in this file is downstream of
that: the banner problem largely disappears once a README frames the plan docs as history rather
than specification.

**Recommended minimum README:** what the app is · a screenshot (one **not** taken from
`docs/migration/proof/`) · install/build · the GPL-3.0-or-later notice and why (bundled FFmpeg —
`LICENSING_PLAN.md:59`) · `THIRD_PARTY_NOTICES` pointer · **one line saying the plan documents are
working history, not specifications**, which retires the banner requirement for most of §3 in a
single sentence.

**Not in A2's scope, and the highest-value item in this document.**

---

## 7. Decisions for the user

1. **Squash history or publish it?** Gates everything. 258 proof directories and every superseded
   plan exist in history regardless of what the working tree looks like at publication.
2. **`docs/migration/proof/**` — accept KEEP PRIVATE, or fund a curated `docs/evidence/`?**
3. **`FEATURE_PARITY_LEDGER.md` — verify, or keep private?** No third option that is honest.
4. **Write a README before publishing?** Strongly recommended.
5. **Relocate root docs and `src/*.md` into `docs/`?** Cosmetic, cheap, and changes the first
   impression more than any single ruling here.
6. **Banner wording**, if adopted:
   > *Internal working notes, not a specification. This document records what was planned and
   > believed at the time of writing; it has not been re-verified against the shipped
   > application.*
