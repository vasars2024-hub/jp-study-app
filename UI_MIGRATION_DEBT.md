# UI Migration Debt

Persistent ledger for the Study OS UI/UX refinement. Read with `UI_UX_REFINEMENT_MASTER_PLAN.md`.
Both agents update **only their own rows** where possible. On merge, keep **both** sides' rows (never drop one
during conflict resolution — see `UI_UX_INTEGRATION_PROTOCOL.md` §12). **Remove a row only after its work is
visually verified.** This file keeps the effort honest — it is where "we only did superficial global changes"
would show up.

## Coordination header (fill in at kickoff)

- Base commit SHA (both branches start here): `54fd5d99f07ce9af01e027003efdde98225606f3`
- Approved Phase 1 commit/tag: `TBD` (`ui-phase1-approved`)
- Base branch: `grammarx/phase-1-5` (confirm current)
- Account A worktree: `C:/Users/Arseniy/Projects/jp-study-app-core-shell` on `ui/core-shell`
- Baselines captured (`debug/shots/ui-refinement/baseline/`): 01 study-os medium+overlap, 02 launcher,
  03 Settings home (cards/nav/quick-actions), 04 Blanc. Theme-regression before/after (classic-light,
  wired, aero) reproduced via `git stash` toggle at the token checkpoint.
- Accepted tooling baseline: vitest 946/946; i18n clean; tsc 1291 errors (0 in A-owned files);
  eslint 65 errors / 171 warnings; runtime error log 0.

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
| Semantic colour split (`--status-error`→`--danger`, `--status-info`→blue, new `--danger`/`--danger-2`/`--danger-deep`/`--danger-weak`) | A | css-propagated | tokens.css/styles.css `:root` + tokens.ts mirror | none | none | Aero inherits new `--status-error` (does not override it; only `--status-info`) — verify Aero error affordances at checkpoint theme sweep; Wired likewise inherits both. Blanc insulated (overrides both). | in-progress | Aero/Wired live verify pending until theme sweep | P1 | 9d09df0 |
| Surface ladder widen (study-os `--bg`/`--sidebar`/`--panel`/`--panel-2`) + new `--surface-0..3`/`--surface-sunken`/`--surface-input` aliases | A | css-propagated | styles.css base `:root` | none | none | Study-os only; all 12 named themes + Aero + Wired override the four base surfaces (verified) so no leak. Aliases are var()/color-mix over per-theme tokens → adapt everywhere with no per-theme edits. Propagation confirmed live on Settings (`.fwin`=`--bg`, chip=`--panel`). | screenshotted | none | P1 | dc5e5b5 |
| Unify duplicated systems: `--shadow-card`→`--elevation-2`, `--shadow-toolbar`→`--elevation-1`, `--motion-duration`→`var(--dur-fast)`; add `--space-lg-2` (20px) + spacing-ownership comment | A | css-propagated | styles.css base `:root` | none | Runtime shadow/density/motion presets NOT yet derived from canonical ramps (see note) | **Stylesheet defaults only.** At runtime `osPersonalization.applyPersonalization()` emits `--shadow-card`/`--shadow-toolbar` (user SHADOW preset) and `--space-xs..xl` (user DENSITY preset) inline on `<html>`, and `motionPrefs` emits `--motion-duration = 0.14*v`; these override the stylesheet by design. Not collapsed — they are user-facing personalization features (§7 preserve functionality). `--motion-duration` default now = `--dur-fast` (=0.14s, identical to runtime v=1). `--space-lg-2` is fixed (does not scale with density; 0 consumers yet). True single-runtime shadow/density system = product decision, deferred. `--danger`/`--status-*`/`--surface-*` are NOT personalization-emitted, so P1.1/P1.2 hold at runtime. | verified (defaults resolve; runtime layer documented) | Runtime preset unification deferred (would alter a user feature) | P1 | bcdf64b |
| Legacy `.btn` reconciled with `.ui-btn` tiers (base/primary/small/ghost/danger + focus) + new `--accent-weak`; `.ui-btn--danger`/`.btn.danger` keyed off `--danger` | A | css-propagated | styles.css + ui/ui.css | none | none | Original `.btn` tier rules kept verbatim as skin-safe base; refined ui-btn-parity treatment layered in a **zero-specificity `:where()` guard** (`html:not([data-materials='aero']):not([data-materials='wired'])` + `.btn:where(:not(.blanc-root *))`) so Aero/Wired/Blanc buttons stay pixel-identical (they inherit base structure + own in-scope overrides). Verified live: study-os primary now filled accent gradient (fw600, white); plain `.btn` semibold+flex; contextual per-screen overrides still win. `--font-display` under named themes = `--font-body` (no named-theme font change). **Aero/Wired/Blanc live theme sweep pending at checkpoint.** NOTE: a `replace_all` initially produced a triple-paren syntax error that silently dropped all guarded rules; fixed and re-verified (12 rules parsed). | screenshotted (computed-style verified; skin sweep pending) | Aero/Wired/Blanc live verify at checkpoint | P1 | _pending_ |

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
