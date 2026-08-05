# Phase 6.5 Implementation Plan — Phase 17 (Safe Junk Removal), Planning Only

Date: 2026-07-17. Companion document to
[`PHASE_6_5_AUDIT.md`](./PHASE_6_5_AUDIT.md). This document covers **only** Phase 17
of the full Phase 6.5 program — a candidate deletion batch with justification. **No
files were deleted and no git commands that change state were run to produce this
document.** Everything below is "ready for execution pending your go-ahead."

**Naming note:** unrelated to `docs/IMPLEMENTATION_PLAN_V1.01.md`'s own internal
"Phase 6.5" entry — see the naming note at the top of `PHASE_6_5_AUDIT.md`.

## Scope decision carried from planning

Per explicit direction before this document was produced, the actionable batch below
is **limited to untracked stray/junk files at the repo root**. Two other candidate
categories were identified but are **excluded from the actionable batch** and are
recorded as observations only, since they involve git-tracked content / git history
and need separate, explicit approval in a future session:

- `terminals/1.txt`…`terminals/29.txt` + `terminals/.next-id` (30 files) and
  `mcps/tasks/tools/*.json` (6 files) — these ARE tracked in git (confirmed:
  `git ls-files terminals` returns all 30; `mcps/tasks/tools/` similarly tracked).
  Removing them requires `git rm` + a commit, not a plain filesystem delete.
- `cloudflare-worker/wrangler.toml` — contains a real Cloudflare KV namespace ID
  (line 10) that would be permanently committed if this untracked directory is ever
  `git add`-ed as-is. The recommended fix (move the ID to an untracked
  `wrangler.toml.local` or environment-injected value, gitignore the real file) is
  noted here for awareness but is not part of this batch since the directory isn't
  being committed by this pass at all.

## Batch 1 — root-level stray artifacts (untracked, zero functional risk)

All items below were re-confirmed present on disk and their reference status
re-confirmed by direct grep on 2026-07-17 (not carried over from an earlier
description).

### 1a. Zero-byte shell-redirection accidents (5 files)

| File | Size | Tracked? | Referenced in source/build/config? |
|---|---|---|---|
| `a` | 0 bytes | No | No — the only matches for a naive substring grep were the single-letter variable name `a` inside unrelated code (arrow-function params, comparisons); a precise path-anchored grep (`'./a'`, `require('a')`, etc.) found zero hits |
| `Cl.txt` | 0 bytes | No | No |
| `npm` | 0 bytes | No | No — all substring matches were the word "npm" inside `npm run`/`npm install`/`npm test` prose in docs and scripts, never a reference to a bare root-level file named `npm`; a path-anchored grep found zero hits |
| `{` | 0 bytes | No | No |
| `mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL))` | 0 bytes | No | No — this filename is itself the tail end of a shell command (`... mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL))`) that got redirected to a file instead of executed; the real code is in `src/main.ts`, this is not it |

**Justification:** all five are 0-byte files with names that are not valid
identifiers/module specifiers a TypeScript/JavaScript import could resolve to, sitting
at the repo root outside `src/`, `tools/`, or any config location. Their names read as
shell copy-paste/redirection accidents (`{`, a bare `mainWindow.loadURL(...)` command
line, single-letter/short generic names). None are tracked by git, none are referenced
by any source, build, or config file.

**Justification is not "confirmed unused because git status says so"** — it's the
conjunction of: (a) 0 bytes (cannot contain working code or data), (b) not a valid
import specifier for any module system in this project, (c) not tracked, (d) zero
static references after a precise grep. Deletion action: plain `rm`, no git operation
needed since these were never tracked.

### 1b. Electron Forge / packaging debug logs (18 files)

`build.log`, `build2.log`, `make-cmd.log`, `make-detached.err`, `make-detached.log`,
`make-full.log`, `make.log`, `package-app-run.log`, `package-app-run2.log`,
`package-app-run3.log`, `package-build.log`, `package-debug.log`, `package-long.err`,
`package-long.log`, `package-only.log`, `package-test.log`, `package-verbose.log`,
`packager-direct.log`.

**Justification:** all 18 confirmed present, all untracked, all covered by the
`*.log` rule in `.gitignore` (line 3). A grep across `src/`, `tools/`, `forge.config.ts`,
`package.json`, and all three Vite configs for each exact filename returned **zero
matches** — nothing reads these logs programmatically, they're purely
manually-generated console-output dumps from interactive Forge debugging sessions
(consistent with their content, per the earlier survey: plain build-tool console
output, no secrets). Deletion action: plain `rm`, no git operation needed.

### Batch 1 execution procedure (for the future session that runs it)

1. Re-run `git status --porcelain -- a Cl.txt npm "{" "mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL))" *.log` immediately before deleting, to confirm nothing changed between this planning pass and execution.
2. `rm` each of the 23 files listed above (no `git rm` needed — none are tracked).
3. Run `npm test` and `node tools/i18n-check.cjs` afterward as a trivial sanity check that nothing broke (expected: identical results to this session's baseline — 560/560 tests, 62 files; i18n clean). This is a formality given the "zero references" finding, not a real risk mitigation — included because the source Phase 17 procedure calls for a post-delete test run.
4. Record the outcome in a `PHASE_6_5_CLEANUP_LOG.md` if/when that deliverable is produced (out of scope for this session).

## Explicitly excluded from Batch 1 (recorded, not actioned)

- `terminals/*.txt` (30 files, tracked) + `mcps/tasks/tools/*.json` (6 files, tracked)
  — candidate for a future batch; needs `git rm` + commit + explicit approval, not a
  plain-file delete.
- `cloudflare-worker/wrangler.toml` KV-namespace-ID hardening — needs a config change
  (move the real ID out of the file that will eventually be committed), not a deletion.

## Flagged for a later pass — NOT junk, do not delete

These were surfaced during the same survey that produced Batch 1 but are real,
intentional, or load-bearing:

- **`arena-harness.html`, `blanc-harness.html`, `motion-harness.html`,
  `reader-test.html`, and `harness-dist/`** — intentional dev-only visual-test
  harnesses, documented in TASKS.md as the project's only way to visually verify views
  since the dev Electron shell isn't screenshot-drivable in this environment
  (`arena-harness.html` ties to v1.01 Phase 3 Game Arena, `blanc-harness.html` to
  Blanc Mode, `motion-harness.html` to Phase 4.5 motion design). Do not delete. One
  sub-item worth a future look: `harness-dist/` is a **build output** directory sitting
  uncommitted in the tree — that's a `.gitignore` completeness check for later (is
  `harness-dist/` covered by an ignore pattern?), not a deletion candidate.
- **`automation-builder.ps1`, `paste-enter-later.ps1`/`.json`,
  `press-enter-later.ps1`/`.json`, `automation-configs/`** — this is the real,
  wired Blanc Toolbox `automation-builder` module (status `experimental` per its own
  registry entry, confirmed launched via a fixed allowlisted path at
  `src/main.ts:176-182` — see `PHASE_6_5_AUDIT.md` §3). Do not delete.
- **`src/renderer/components/Sidebar.tsx`** — not a Phase 17 candidate as-is. Per
  `PHASE_6_5_AUDIT.md` §6, it is dead *except* for a type-only import
  (`SectionId`) consumed by `src/renderer/views/ComingSoon.tsx:2`. Any future removal
  must first migrate that type export before the file can be deleted; listing it here
  only so nobody mistakes it for a same-batch delete alongside the Batch 1 items above.
- **`docs/frutiger-aero/*`, root `PHASE_1`–`PHASE_5` docs, `src/PHASE_4_5_*` /
  `PHASE_4_75_*` / `PHASE_5_*` docs** — read during this audit as a deliberate
  phase-by-phase project log, not accidental duplication. Not a Phase 17 candidate.
