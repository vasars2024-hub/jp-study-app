# Repository Stabilization — Risks & Unresolved Questions

Companion to `REPOSITORY_STABILIZATION_MANIFEST.md`. Status: pre-approval; no Git mutations performed beyond the Stage-1 backup pointer + external recovery artifacts.

## Known interdependencies (why a partial base is unsafe)
- Tracked `src/main.ts` / `src/preload.ts` import 13+ **untracked** modules (see manifest Central Finding). Excluding any breaks main-process compile.
- `package.json` `postinstall` runs **untracked** `tools/sync-extension-mirror.cjs`. Excluding `tools/**` breaks `npm install` and packaging.
- `extension/` ↔ `src/main/chrome-extension/` must stay byte-identical (enforced by the mirror tool; mirror is `?raw`-imported into the renderer build). Committing one without the other creates drift.
- Root `*-harness.html` are Vite rollup inputs; removing them without editing `vite.renderer.config.ts` breaks the renderer build config.

## Pre-existing conditions NOT caused by this pass (must be characterized before claiming "base builds")
- Committed HEAD's `postinstall` already depends on an untracked file → HEAD itself may be non-bootstrapping from a clean clone. **The canonical base actually FIXES this** by including the tool, but it means "does HEAD build?" is not a valid baseline; we must validate the *snapshot*, not HEAD.
- `.gitignore` and `CLAUDE.md` are themselves tracked-modified; the base will carry their current content.
- `tsc`/`vitest`/`lint` full-suite status on the snapshot is **not yet measured** (Stage 11, post-approval). Any failures found there will be reported precisely and attributed (pre-existing vs snapshot-induced), never hidden.

## Possible private / local-only data
- `.mcp.json`, `.claude/settings.json`, `automation-configs/**`, `tools/claude-wired-fast-settings.json` — machine-local config. **No secret patterns detected** (Stage 4), but they are environment-specific → recommend EXCLUDE + IGNORE, not commit.
- `cloudflare-worker/wrangler.toml` — no `account_id`/token detected, but wrangler configs often carry an account id; **re-confirm before it enters git**.
- No `.env`, credentials, DB files, cookies, or crash dumps found among non-ignored untracked files.

## Asset risks
- **~90 MB of binary PNGs** (shimeji 15 MB + city 75 MB) are runtime-required for the companion and city features but large for normal Git, and there is **no existing LFS/attributes convention**. Decision #1 governs whether worktrees are fully runnable vs. lean. If excluded, Stage 13 REQUIRES a documented, checksum-verified access mechanism (e.g. symlink/junction to the main checkout's asset dirs) before any worktree that runs the app.
- City asset runtime loading appears manifest-driven (`asset-manifest.json`, `validateAssets.ts`); a direct code grep does not prove reachability — treated as **reachable/required** (do not exclude on "unreferenced").

## Build / worktree limitations
- Worktrees share the main repo object store but have independent working trees and **their own `node_modules`** (untracked/ignored) — each worktree needs its own `npm install` before build/test, which will run the untracked `sync-extension-mirror.cjs` (fine once included).
- Live app inspection (jp-app MCP) targets the already-running **main checkout**, so Phase-1 CSS work does not strictly require the worktrees to launch the full app; this lowers (but does not eliminate) the impact of excluding binaries.

## Rollback method (summary; full copy in REPOSITORY_RECOVERY.md at Stage 15)
- Backup branch `backup/pre-ui-stabilization` → `4b846f1`.
- `../jp-study-app-stabilization/tracked.patch` (binary-safe) reproduces all tracked edits; `untracked-backup.tar.gz` (1243 files) + `untracked-checksums.txt` reproduce all untracked content.
- No destructive Git used; original checkout untouched. To undo any future snapshot commit: `git reset --soft` back to `4b846f1` is **not** needed because we branch, not rewrite — worktrees are created on new branches from the snapshot SHA and can simply be removed.

## Post-validation status (recorded after worktree creation)

- **Accepted baseline failures (NOT snapshot-induced, do not "fix" during UI work):** TypeScript 1291 errors + ESLint 65 errors/171 warnings, all from the pinned-TS-4.5.5-vs-`satisfies` mismatch and vendored `.d.ts`. Green gates: Vitest 946/946, i18n, app launch, 0 runtime errors. UI phases must keep TS/lint from getting worse; new errors in a UI-edited file are blockers.
- **Env-prep risk:** worktrees have no `node_modules`. Running checks there needs `npm ci` (lockfile-safe) or a `node_modules` junction to the main checkout. Using `npm install` risks a forbidden lockfile change.
- **Aero verified only at resource level** (CSS + wallpaper resolve/parse, 0 errors). Full live theme switch intentionally skipped to protect the running session — treat as partially-verified, not a regression (Aero content is byte-identical to pre-commit).
- **City feature:** committed assets resolve (512×512 image served); the interactive city UI was not driven end-to-end this session.
- **TS-version fix is deferred** to a dedicated tooling phase (ideally post-UI-integration / pre-public-release), and must include dependency-compatibility checks — not a bare `typescript` bump.

## Open decisions requiring the user
1. Binary assets (rows 12–13): INCLUDE in base (runnable, +86 MB) vs EXCLUDE (lean, needs Stage-13 access mechanism) vs LFS-later.
2. Unrelated root audit docs (row 14): INCLUDE vs EXCLUDE.
3. `blanc-budget.json` / `blanc-coverage.json` (row 22): confirm generated → EXCLUDE.
4. `.gitignore` edit: apply the proposed additions as a separate documented commit, yes/no.
