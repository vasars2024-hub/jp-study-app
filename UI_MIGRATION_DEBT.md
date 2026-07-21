# UI Migration Debt

Persistent ledger for the Study OS UI/UX refinement. Read with `UI_UX_REFINEMENT_MASTER_PLAN.md`.
Both agents update **only their own rows** where possible. On merge, keep **both** sides' rows (never drop one
during conflict resolution — see `UI_UX_INTEGRATION_PROTOCOL.md` §12). **Remove a row only after its work is
visually verified.** This file keeps the effort honest — it is where "we only did superficial global changes"
would show up.

## Coordination header (fill in at kickoff)

- Base commit SHA (both branches start here): `54fd5d99f07ce9af01e027003efdde98225606f3`
- Approved Phase 1 commit/tag: `TBD` (`ui-phase1-approved`)
- Base branch: `grammarx/phase-1-5` (parent of canonical base: `4b846f1`)
- Backup branch (pre-stabilization HEAD): `backup/pre-ui-stabilization` → `4b846f1`
- Account A worktree (Core & Shell, `ui/core-shell`): `C:/Users/Arseniy/Projects/jp-study-app-core-shell`
- Account B worktree (App Screens, `ui/app-screens`): `C:/Users/Arseniy/Projects/jp-study-app-app-screens`
- Recovery artifacts: `C:/Users/Arseniy/Projects/jp-study-app-stabilization/`
- **Accepted pre-UI validation baseline (UI phases must NOT worsen):** Vitest 946/946 pass (94 files) · i18n pass · app launches · 0 runtime errors · **TypeScript 1291 pre-existing errors** (1282 vendored `@huggingface/transformers` d.ts + 9 src `satisfies` unsupported by pinned TS 4.5.5) · **ESLint 65 errors + 171 warnings** pre-existing. Do NOT upgrade TypeScript/ESLint/deps/lockfile. New errors in files a UI agent edits are blockers.
- Runtime asset validation: shimeji sprite loads (128×128) + renders live; city asset loads (512×512). Aero CSS + wallpaper resolve (full live theme switch not exercised to avoid disrupting the running session).

## Legend

- **Owner:** A (Core & Shell) | B (App Screens)
- **Impl type:** `css-propagated` (improved via shared class/token, no structural rewrite) |
  `structurally-migrated` (rewritten to use `ui/*`) | `hybrid`
- **Shared primitive adopted:** which `ui/*` component(s), or `none`
- **Temp workaround:** narrowly-scoped local hack marked for removal, or `none`
- **Missing primitive/token:** what's needed but not yet in the shared system, or `none`
- **Validation status:** `not-started` | `in-progress` | `screenshotted` | `verified`
- **Phase:** P1 | P2 | P3A | P3B | integration
- **Commit:** short SHA(s)

## Migration ledger

| Screen / component | Owner | Impl type | Shared primitive adopted | Temp workaround | Missing primitive/token | Remaining inconsistency | Validation status | Deferred reason | Phase | Commit |
|---|---|---|---|---|---|---|---|---|---|---|
| _(seed — replace as work lands)_ | | | | | | | not-started | | | |

## Integration requests (Account B → Account A)

Missing shared tokens/primitives/global changes B needs. A (or the integration pass) implements these in
A-owned files; B removes any temporary workaround once the shared change lands and is verified.

| # | Requested by | What's needed | Screen(s) blocked | Temp workaround in place | Status (`open`/`landed`/`removed-workaround`) | Notes |
|---|---|---|---|---|---|---|
| _(none yet)_ | | | | | open | |

## Aero / Wired inherited-fix exceptions

Aero and Wired must stay visually + behaviorally equivalent to baseline (master §4). Log here any *documented*
inherited fix that corrects a genuine defect (nothing else is permitted, and they never receive the new default
aesthetic).

| # | Skin | What changed & why (genuine defect) | Approved by | Commit | Verified against baseline |
|---|---|---|---|---|---|
| _(none yet)_ | | | | | |

## Known good / verified (move rows here only after visual verification)

| Screen / component | Owner | Final impl type | Verified at (size/state) | Phase | Commit |
|---|---|---|---|---|---|
| _(none yet)_ | | | | | |
