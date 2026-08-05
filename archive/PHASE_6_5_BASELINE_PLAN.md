# Phase 6.5 — Baseline Audit Plan (Phases 1–4 & 17 only) — REVISED

Revision 2 — incorporates evaluation corrections (2026-07-17) and expanded coverage of
v1.01 features and Blanc Mode. Supersedes the original Phase 6.5 session plan.

## Context

This session is scoped to **only**:

- Phase 1 — Establish the Real Repository State
- Phase 2 — Complete Feature Inventory
- Phase 3 — v1.01 / Post-v1.01 Audit *(expanded — see §7)*
- Phase 4 — Secrets and Credential Audit
- Phase 17 — Safe Junk Removal **Planning** (candidate list + justification, not execution)

No source-code edits, no deletions, no git operations happen in this pass — only two
draft documents. The intent is a trustworthy, evidence-based baseline that later
sessions (Phases 5–16/18–20 and actual cleanup) can build on without re-deriving it.

Resolved decisions carried forward:

- Nested `.git` at `src/main/city/.git` (Noctis city-sim engine) → **flag as a finding
  only; do not touch or investigate further this pass.**
- Terminology: "cyber-terminal" in the original spec = the repo's real **Wired Archive**
  secret mode; "Noctis" = the city-sim engine under `src/main/city`, not a UI skin.
  The audit uses real names, with a mapping note back to the original terms.
- Phase 17 candidate batch this pass is **scoped to untracked stray/junk files only**.
  Git-tracked `terminals/*.txt` + `mcps/tasks/tools/*.json`, and the untracked
  `cloudflare-worker/` KV-id exposure, are recorded as observations but **excluded from
  the actionable batch** (they involve git history and need separate explicit approval).

### Verification status of this plan's claims

Every high-stakes claim below was independently re-verified against the working tree on
2026-07-17 (cited file:line evidence confirmed for: `desktop:launch`, CSP absence,
`bypassCSP` schemes, `webviewTag` counts, `asar: false` + fuses, single `contextBridge`
call, plaintext `api-keys.json`, `STATS_BASE` consent gating, `wrangler.toml` KV id,
nested `.git`, and the complete Phase 17 junk-file list). Claims marked **[corrected]**
changed as a result of that re-verification.

---

## What gets produced (next session)

Two files at the repo root, matching the existing `PHASE_N_*.md` convention:
`PHASE_6_5_AUDIT.md` and `PHASE_6_5_IMPLEMENTATION_PLAN.md`.

---

## 1. `PHASE_6_5_AUDIT.md` — sections

### §1 Architecture map

Six window types — main / Blanc / Mini / Lockscreen / pop-out / Companion Host — all
sharing one preload (`src/preload.ts`) and one renderer bundle differentiated by query
string. Entry points: `src/main.ts`, `src/preload.ts`, `src/renderer/main.tsx`.

### §2 Repository state caveat **[corrected]**

HEAD is `85ed593` ("Merge feat/frutiger-aero-platform into main after workbranch
consolidation."). The working tree has **172 untracked** files/dirs, including entire
subsystems (aiProviderClient, buddyScheduler, extensionServer, jiten, mangaOcr,
resourcesCatalog, stats, translateAnalysis, ytPlaylists, the whole `extension/` and
`cloudflare-worker/` dirs).

**Correction — the modified-file count is environment-dependent and must be recorded
with its measurement method.** `git status` from a Linux mount reports 421 modified
files, but sample diffs show whole-file rewrites (e.g. 183 added / 183 removed lines)
— classic CRLF/line-ending noise, not content changes. The earlier "~40 modified"
figure is plausible as the true content-change count on the Windows checkout. The audit
must therefore: (a) run the count **on the user's Windows machine**, (b) state the
exact command used (`git status --porcelain`, autocrlf setting, filemode setting), and
(c) note that any other environment will disagree. Without this, later sessions will
wrongly conclude the baseline is stale.

The audit states clearly: **it audits current on-disk state, not `git show HEAD`**,
since most recent feature work is not committed yet.

### §3 Security boundary summary

Electron defaults hold: contextIsolation / sandbox / nodeIntegration default-secure on
all 6 windows; preload exposes ~150 narrowly-scoped methods via a single
`contextBridge.exposeInMainWorld('api', api)` call (`src/preload.ts:964`); no raw
fs/child_process/generic-invoke passthrough found.

Findings, at stated severity:

- **High (chained) [corrected]**: no CSP anywhere (`index.html` has no CSP meta — verified,
  the file is 11 lines with no CSP; no `onHeadersReceived` injection), combined with
  `bypassCSP: true` on all 4 custom protocol schemes (`app`, `media`, `playfile`,
  `localfile` — `src/main.ts:78-99`) and `webviewTag: true` on 5/6 windows
  (`src/main.ts:392,511,647,781,918`; companionHost is `false`). The webviews are used
  legitimately by the Immersion Browser, but this widens the trust surface.
- **High (chained, not standalone) [corrected]**: `desktop:launch`
  (`src/main/library.ts:880-889`) calls `shell.openPath()` on a renderer-supplied path
  with no whitelist. **Framing correction:** launching arbitrary local files *is* the
  desktop-shortcut feature's purpose. This is High only as the second link of a chain —
  renderer compromise (enabled by the no-CSP finding above) escalates to arbitrary local
  file execution. The audit must present it as a chained finding so a later session does
  not "fix" it by breaking the desktop shortcut grid, which CLAUDE.md explicitly
  protects. The correct future mitigation is CSP + optional path allowlisting, not
  removing the handler.
- **Medium → downgraded in part [corrected]**: `toolbox:launchAutomationBuilder` spawns
  `powershell.exe -ExecutionPolicy Bypass -File automation-builder.ps1`. The open
  question "can the renderer influence the spawned command's arguments?" is now
  **answered: no** — `src/main.ts:177-182` resolves a fixed allowlisted script path
  (app root / cwd only) and errors out if absent; TOOLBOX_COMPLETION_AUDIT.md
  independently confirms "fixed allowlisted script path only — no arbitrary shell".
  What remains is a **Low portability defect**: `AUTOMATION_BUILDER_DIRECT_COMMAND`
  (`src/shared/automationBuilder.ts:7-8`) hardcodes the developer's absolute Windows
  path as a user-facing constant.
- **Medium**: `toolbox:fileSearch` accepts an arbitrary renderer-supplied root
  (`src/shared/toolboxFileSearch.ts:43` — `root: String(input.root ?? '')`), not
  restricted to what the folder picker returned. Mitigations already present and worth
  recording: symlink-skipping, scan/result caps, honest `truncated` flag, never writes.
- **Medium**: AI provider API keys (`mining/api-keys.json` —
  `src/main/mining.ts:92,112`) and the extension pairing token
  (`extension-bridge.json`) are stored **unencrypted** in `userData`; no
  `safeStorage`/OS-keychain use. Local-only risk, but a high-value low-effort Phase 5
  fix (out of scope this pass).
- **No asar** (`forge.config.ts:40`) is a deliberate, documented tradeoff (945MB of
  bundled models) — note it, don't flag as a defect, but record that
  `EnableEmbeddedAsarIntegrityValidation` / `OnlyLoadAppFromAsar` fuses are
  consequently disabled (`forge.config.ts:99-100`) — no code-integrity check on
  shipped JS.
- **Note (not a vuln)**: nested `.git` at `src/main/city/.git` — flag per user
  decision, no further action.
- **Completeness caveat [new]**: this security list is **spot-checked, not
  exhaustive**. Example of an unreviewed surface: `net:extractReadableArticle`
  (`src/main/library.ts:~893`) fetches arbitrary renderer-supplied URLs in the main
  process. Fine for a local single-user app, but the audit must state that a full IPC
  sweep (all ~150 preload methods) is Phase 5 work, so nobody mistakes this section
  for a completed handler-by-handler review.

### §4 Persistence map

Flat JSON files under `userData` per module (no SQLite/electron-store; `sql.js` is only
used to parse `.apkg` imports) + renderer localStorage/IndexedDB split. Table sourced
from Explore agent 1 finding #5; include the Blanc/toolbox keys explicitly (see §6a).

### §5 Feature inventory matrix

Exact schema from the spec (`Feature | Intended behavior | Entry point | Main impl |
Renderer impl | Persistence | Security boundary | Tests | Current status | Required
action`), populated for every confirmed-real feature area: Reader/EPUB, Manga+OCR,
Dictionary (incl. Yomitan/Tatoeba offline), Flashcards+Anki, Study Stats, Calendar,
Clipboard capture, Automation (rated `experimental` by the app's own toolbox audit),
**Blanc Toolbox (expanded — §6a)**, Frutiger Aero, Wired Archive, Noctis sim engine,
Settings (two implementations — §6), Shortcuts/Command Palette, Backup/Restore,
Resources/bundles/novels catalog (expanded — §7), Translate/AI analysis panels
(expanded — §7), Desktop Shell/widgets/window manager.

### §6 Duplicate/legacy implementations **[corrected]**

- `Sidebar.tsx` vs `ui/Sidebar.tsx` (live). **Correction:** `Sidebar.tsx` is *mostly*
  dead — per TASKS.md itself, "nothing renders it, **only its type is imported by
  `ComingSoon.tsx`**". The audit records it as "dead code with one live type import";
  any future deletion step must migrate or inline that type first. Do not record it as
  "confirmed dead, safe to delete as-is".
- `SettingsView.tsx` (legacy, not routed through `AppSection.tsx`) vs
  `SettingsApp.tsx`+registry (canonical, routed). **Correction:** `SettingsView` is
  referenced from **2** other files (`components/settings/pages/StudyPage.tsx`,
  `views/AnkiView.tsx`), not 3. Status remains "Unable to verify" until those two
  references are traced.
- `kuromoji` vs `@sglkc/kuromoji` — both actively used in different processes; flag as
  maintenance-risk duplicate, not dead code.

### §6a Blanc Mode / Blanc Toolbox — dedicated deep-dive **[expanded]**

Blanc Mode is a top-level subsystem, not a feature row. The audit gives it its own
section with this coverage:

**Surface map** (all confirmed on disk):

| Layer | Files |
|---|---|
| Window | `src/main.ts:331-460+` — compact side window parallel to the full Study OS; 560×460 default, 420×360 min, 760×620 max; own persisted bounds file (`blancBoundsFile()`); `registerBlancIpc` (open/close/fullscreen) |
| Shell | `src/renderer/components/blanc/BlancShell.tsx` |
| Mode state | `src/shared/blancMode.ts` + `src/renderer/blancMode.ts` (+ `src/shared/__tests__/blancMode.test.ts`) |
| Registry | `src/shared/toolboxRegistry.ts` — **51 modules**, stable IDs, category/status/capabilities/permissions/launch-contexts/adapter strategy |
| Settings | `toolboxSettings.ts` (shared + renderer) — typed schema, sanitize-on-load, per-category reset, JSON import/export; localStorage `jp-study.toolbox.settings.v1` |
| Shortcuts | `toolboxShortcuts.ts` → merged into app-wide `COMMAND_CATALOG`; rebindable, conflict-detected, import/export with ID migration; command-palette `toolbox` mode (Ctrl+Shift+P) |
| Main IPC | `registerToolboxIpc` — file search, folder picker, automation-builder launcher (fixed path), Blanc window controls |
| Theme/harness | `src/renderer/theme/blanc.css`, `src/renderer/__devharness__/blancHarness.tsx`, `blanc-harness.html` (root, dev-only) |

**Module status to carry into the matrix** (from TOOLBOX_COMPLETION_AUDIT.md,
2026-07-17, which traced every module UI→state→IPC→persistence→error-handling against
a 484/484 passing vitest baseline): **20 `ready`** (clipboard, dictionary, grammar,
reading-finder, resources, calendar, media, flashcards, statistics, epub-mining,
anki-deck, mono-blocks, calculator, unit-converter, focus-timer, system-monitor,
file-search, quick-notes, hash-checker, image-converter), **1 `experimental`**
(automation-builder), **30 `adapter-needed`/planned** (correctly hidden — no
placeholder buttons, listed only in the Coverage panel).

**Audit tasks for this section:**

1. Cross-check TOOLBOX_COMPLETION_AUDIT.md's per-module verdicts against the registry
   file (do the 51 IDs and statuses still match?) — the toolbox audit is the app's own
   claim; Phase 6.5 spot-checks at least 5 modules independently (one per category,
   including calculator's regex-gated eval and file-search's caps).
2. Record the safety posture already documented there: calculator eval regex-gated to
   digits/operators; automation launch fixed-path only; file search never follows
   symlinks and never writes. Verify each with a direct read, cite file:line.
3. Record Blanc's persistence keys (bounds file in `userData`, settings in
   localStorage) in the §4 persistence map.
4. Confirm the Blanc window's webPreferences match the default-secure pattern of the
   other five windows (it is one of the 5 with `webviewTag: true` — record why, or
   flag if unneeded: a candidate Low finding, since Blanc likely doesn't embed
   webviews).
5. Note `blanc-harness.html` + `blancHarness.tsx` as intentional dev-harness surface
   (TASKS.md-documented), tied to the harness observations in Phase 17.

### §7 v1.01 / post-v1.01 promise-vs-reality — dedicated deep-dive **[expanded]**

This is the largest section of the audit. Source documents:
`docs/IMPLEMENTATION_PLAN_V1.01.md` (Phases 0.5–11, with binding build order
0.5 → 6 → 2 → 1 → 3 → 3.5 → 4 → 4.5 → 5/5b → 8 → 9 → 6.5 → 7 → 11 → 9.5 → 10),
`docs/RESOURCES_1.01_OVERHAUL_PLAN.md` (Phases 0–6), and
`docs/translate-linguistic-analysis-plan.md`.

**Full promise-vs-reality table, one row per phase.** Verdicts must come from reading
the implementation, not the plan doc's own DONE markers. Verdict vocabulary:
`Verified working` (traced + spot-run where possible) / `Implemented, unverified`
(code exists and is wired, but only the doc claims it works) / `Partial` /
`Not started` / `Unable to verify`.

Main v1.01 plan rows:

| Phase | Promise | Doc's own claim | Audit action |
|---|---|---|---|
| 0.5 | Level Meter — JLPT/HSK detection, .apkg import via sql.js worker, `levelService.ts` | — | Trace `levelService`/`apkgImport` existence + StatisticsView consumption |
| 1 | Reading Finder — comprehensibility score, continue-reading state, de-inflection, `data/readingSites.ts` (~24 sites) | — | Verify view is routed; spot-check the de-inflection claim against the dictionary pipeline |
| 2 | Whole-app i18n EN/JA/ZH/RU | Live system per CLAUDE.md | Run `node tools/i18n-check.cjs`; confirm vitest catalog-hygiene gate passes |
| 3 / 3.5 | Game Arena — 10 games, zero runtime AI; mirror-writing AI evaluation loop | — | Confirm which games exist vs planned; `arena-harness.html` ties in here |
| 4 / 4.5 | Shimeji companions + routines; motion design pass | — | Companion Host window exists (window #6) — trace how much of the routine system is real |
| 5 / 5b | Manga OCR replacement + on-image overlay; transcription upgrade + Media/Video split | — | `mangaOcr` subsystem is untracked-new — inventory it |
| 6 | Download manager for all models/dictionaries | **DONE** (doc) | Independent trace: `src/main/downloads.ts` exists (streaming, `assets:root` IPC) — verify at least one end-to-end path |
| 6.5 | Stabilization pass 1 | this session | — |
| 7 | Pronunciation checker | postponed by plan | Confirm not started (expected) |
| 8 | Auto language environment switcher | **DONE** (doc) | Independent trace |
| 9 | Chrome extension mining + reader auto-sorting | **DONE** (doc) | `extension/` + `extensionServer` are untracked-new — inventory + pairing-token note (§3) |
| 9.5 | Miku first-boot guided tour | — | Confirm status |
| 10 | Final hardening, packaging, v1.01 | — | Not expected yet |
| 11 | Data portability & resiliency (backups + mining queue) | must land before 10 | Trace Backup/Restore feature row against this promise |

Resources overhaul rows (Phases 0–6): version bump + `resourcesCatalog.ts` shared
types; remote catalogue plumbing (`catalog:get`/`catalog:refresh`, userData cache,
`catalogFallback.ts`); 10 gem/creature bundles + checklists; "New & promising"
section; Immersion-browser "collect tool" + My Tools; novels bulk import (remote
levelled catalogue); download heat map + consent + Cloudflare Worker (KV) — the
`cloudflare-worker/` dir and `src/shared/stats.ts` consent gating (§3, §8) are this
phase's artifacts. Explore agent 2 confirmed the overhaul "built and wired" — the
audit verifies at least: catalog fetch path, fallback behavior offline, and the
consent gate before any ping.

Translate linguistic analysis: its plan doc self-reports **"implemented 2026-07-16
(all 13 checklist steps; verified via vitest + eslint + boot smoke test)"** but
explicitly says **"the manual key-dependent matrix below still needs a hands-on
pass"**. The audit records it as `Implemented, unverified` for the key-dependent
paths — not `Verified working` — and lists the pending manual matrix as a follow-up.

**Rule for the whole section:** where the only evidence is the plan doc's own DONE
marker, say so. A couple of concrete claims per DONE phase get verified by reading
the implementation directly before any row says `Verified working`.

### §8 Secrets/credential findings

No committed real secrets found. Record: API keys parameter-passed, never hardcoded;
`.env` correctly gitignored though unused; `STATS_BASE` embeds the developer's
personal Cloudflare subdomain (`jp-study-pings.vasars2024.workers.dev` —
`src/shared/stats.ts:10`; an identifier, not a credential) with explicit opt-in
consent gating (`TELEMETRY_CONSENT_KEY`, line 16) and no IP/id sent — verified
directly; `cloudflare-worker/wrangler.toml:10` contains a real KV namespace ID
(`114bc2d9...`) that would be committed as-is if that directory is ever `git add`-ed
(observation only, per scope decision).

### §9 Dependency findings

`kuromoji` / `@sglkc/kuromoji` duplication noted; otherwise clean.

### §10 Terminology mapping note

cyber-terminal → **Wired Archive**; Noctis → **city-sim engine** under
`src/main/city` (not a skin).

### §11 Risk ranking summary

Critical/High/Medium/Low per the spec's rubric. Expected: **zero Critical** (no
committed secrets; no renderer-to-arbitrary-command path — the automation launcher is
fixed-path (verified), and `desktop:launch` is High-as-chained per §3; no cross-user
data exposure — single local profile). The summary must repeat the §3 completeness
caveat: severity ranking covers spot-checked findings, not a full IPC sweep.

---

## 2. `PHASE_6_5_IMPLEMENTATION_PLAN.md` — Phase 17 planning only

Single ordered batch, untracked files only.

**Batch 1 — root-level stray artifacts (untracked, zero functional risk)**
(full list re-confirmed present on disk 2026-07-17):

- Zero-byte shell-accident files (5): `a`, `Cl.txt`, `npm`, `{`,
  `mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL))`
- Build/package logs (18): `build.log`, `build2.log`, `make-cmd.log`,
  `make-detached.err`, `make-detached.log`, `make-full.log`, `make.log`,
  `package-app-run.log`, `package-app-run2.log`, `package-app-run3.log`,
  `package-build.log`, `package-debug.log`, `package-long.err`, `package-long.log`,
  `package-only.log`, `package-test.log`, `package-verbose.log`,
  `packager-direct.log`

For each: note it is untracked (`git status` confirms), gitignored where applicable,
referenced nowhere in source/build config (grep re-confirmed **at execution time**,
not carried over), and deletable with plain `rm` (no git operation, no commit —
never tracked).

**Explicitly excluded from this batch** (recorded as "candidate for a future batch,
needs separate git-touching approval"): `terminals/*.txt`, `mcps/tasks/tools/*.json`,
`cloudflare-worker/wrangler.toml` KV-id hardening.

**Flagged for a later pass, not junk:**

- `arena-harness.html` / `blanc-harness.html` / `motion-harness.html` /
  `reader-test.html` + `harness-dist/` — intentional dev-only visual-test harnesses
  per TASKS.md (arena → v1.01 Phase 3, blanc → Blanc Mode §6a, motion → Phase 4.5).
  Not junk; but `harness-dist/` is a *build output* sitting uncommitted — gitignore
  check, not deletion.
- `automation-builder.ps1` + `paste-enter-later.*` / `press-enter-later.*` +
  `automation-configs/*.json` — real, wired feature (Blanc Toolbox
  `automation-builder`, status `experimental`). Do not delete.
- **[corrected]** Any future `Sidebar.tsx` removal must first migrate the type import
  in `ComingSoon.tsx` (§6) — it is not a plain-delete candidate.

Format: numbered steps per the spec's Phase 17 procedure (list candidates → justify →
search static/registry/build/test references → delete → re-verify), with each step
ending "ready for execution pending user go-ahead" since this pass is planning-only.

---

## Verification (for the user)

1. Open both produced files and check claims against cited file:line references.
2. Spot-check security findings directly: `src/main/library.ts:880-889`
   (`desktop:launch`), `src/preload.ts:964` (single contextBridge call),
   `src/main.ts:177-182` (fixed automation script path).
3. Confirm the Phase 17 batch list against your own `git status` / directory listing
   **on the Windows machine** before approving deletion.
4. For §7, spot-check one DONE phase (suggest Phase 6, download manager) and confirm
   the audit's verdict vocabulary was applied honestly.

No app launch or runtime testing applies to this pass (no code changed) — except the
two zero-cost checks in §7: `node tools/i18n-check.cjs` and the existing vitest suite,
both explicitly sanctioned by CLAUDE.md as non-build verification.
