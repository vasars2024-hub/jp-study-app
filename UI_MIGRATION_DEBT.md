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
| Semantic colour split (`--status-error`→`--danger`, `--status-info`→blue, new `--danger`/`--danger-2`/`--danger-deep`/`--danger-weak`) | A | css-propagated | tokens.css/styles.css `:root` + tokens.ts mirror | none | none | **RESOLVED at checkpoint.** The concern was real: the A/B sweep confirmed Aero and Wired inherited the new `--status-error` (both) and `--status-info` (Wired), and that defining `--danger` changed the 4 existing `var(--danger, #d8534f)` / `var(--danger, #e06c75)` call sites for them too. Fixed in `d9f1a7c` by pinning `--status-error: var(--red)`, `--status-info: var(--accent)` and `--danger: initial` under `:root[data-materials='aero'], :root[data-materials='wired']` in tokens.css (no protected skin file touched). `--danger: initial` yields the guaranteed-invalid value so those `var()` fallbacks resolve exactly as at baseline — verified: study-os `rgb(209,52,56)`, Aero/Wired `rgb(224,108,117)` = baseline. Blanc insulated (overrides both in `.blanc-root`). | verified (computed-style A/B vs base) | none | P1 | 9d09df0, d9f1a7c |
| Surface ladder widen (study-os `--bg`/`--sidebar`/`--panel`/`--panel-2`) + new `--surface-0..3`/`--surface-sunken`/`--surface-input` aliases | A | css-propagated | styles.css base `:root` | none | none | Study-os only; all 12 named themes + Aero + Wired override the four base surfaces (verified) so no leak. Aliases are var()/color-mix over per-theme tokens → adapt everywhere with no per-theme edits. Propagation confirmed live on Settings (`.fwin`=`--bg`, chip=`--panel`). | screenshotted | none | P1 | dc5e5b5 |
| Unify duplicated systems: `--shadow-card`→`--elevation-2`, `--shadow-toolbar`→`--elevation-1`, `--motion-duration`→`var(--dur-fast)`; add `--space-lg-2` (20px) + spacing-ownership comment | A | css-propagated | styles.css base `:root` | none | Runtime shadow/density/motion presets NOT yet derived from canonical ramps (see note) | **Stylesheet defaults only.** At runtime `osPersonalization.applyPersonalization()` emits `--shadow-card`/`--shadow-toolbar` (user SHADOW preset) and `--space-xs..xl` (user DENSITY preset) inline on `<html>`, and `motionPrefs` emits `--motion-duration = 0.14*v`; these override the stylesheet by design. Not collapsed — they are user-facing personalization features (§7 preserve functionality). `--motion-duration` default now = `--dur-fast` (=0.14s, identical to runtime v=1). `--space-lg-2` is fixed (does not scale with density; 0 consumers yet). True single-runtime shadow/density system = product decision, deferred. `--danger`/`--status-*`/`--surface-*` are NOT personalization-emitted, so P1.1/P1.2 hold at runtime. | verified (defaults resolve; runtime layer documented) | Runtime preset unification deferred (would alter a user feature) | P1 | bcdf64b |
| Legacy `.btn` reconciled with `.ui-btn` tiers (base/primary/small/ghost/danger + focus) + new `--accent-weak`; `.ui-btn--danger`/`.btn.danger` keyed off `--danger` | A | css-propagated | styles.css + ui/ui.css | none | none | Original `.btn` tier rules kept verbatim as skin-safe base; refined ui-btn-parity treatment layered in a **zero-specificity `:where()` guard** (`html:not([data-materials='aero']):not([data-materials='wired'])` + `.btn:where(:not(.blanc-root *))`) so Aero/Wired/Blanc buttons stay pixel-identical (they inherit base structure + own in-scope overrides). Verified live: study-os primary now filled accent gradient (fw600, white); plain `.btn` semibold+flex; contextual per-screen overrides still win. `--font-display` under named themes = `--font-body` (no named-theme font change). **Aero/Wired/Blanc live theme sweep pending at checkpoint.** NOTE: a `replace_all` initially produced a triple-paren syntax error that silently dropped all guarded rules; fixed and re-verified (12 rules parsed). | screenshotted (computed-style verified; skin sweep pending) | Aero/Wired/Blanc live verify at checkpoint | P1 | 8a0697c |
| Shared card set: `.ui-card` (base) surface-contrast + soft elevation, no border; new `.ui-card--quiet` / `.ui-card--interactive`; `.ui-panel` de-bordered | A | css-propagated | ui/ui.css | none | none | Provides the base/quiet/interactive card the app converges on; borders reserved for inputs/focus (§8 ≤1 cue), built on the P1.2 surface ladder. **CORRECTION — the original reasoning in this row was wrong and caused a real regression.** It claimed that because Aero/Wired/Blanc do not override `.ui-card`, the change was "low skin risk". The opposite is true: *not* overriding means they **inherit** it. The checkpoint A/B sweep caught Aero and Wired losing their `.ui-card` border (and Wired its `.ui-panel` border/background). Fixed in `d9f1a7c`: baseline `.ui-card`/`.ui-panel` declarations restored verbatim, refinement re-layered behind the skin guard. A second defect was found in that fix — the guard was written as `html:not([..]):not([..]) :where(.ui-card…)`, but **`:not()` contributes its argument's specificity**, scoring (0,2,1) and wrongly beating `.ui-card--quiet` (0,1,0), so quiet cards rendered `--surface-2`. Corrected to `:where(html:not(..):not(..)) .ui-card:where(:not(.blanc-root *))` = exactly (0,1,0), matching the base rule and winning on source order only, with the guard placed immediately after each base rule so variants and app overrides still out-specify it. Verified: study-os card `--surface-2` borderless, quiet `--surface-1` no shadow; Aero card `rgb(247,251,247)`/1px and Wired `rgb(6,18,26)`/1px = baseline. No accent-bordered card families exist in the shell/shared layer (0 found). App-owned `*-card` families remain B's to adopt. | verified (computed-style A/B vs base, all 4 skins) | App-card adoption is Account B | P1 | 739042e, d9f1a7c |
| New shared `.ui-segmented` primitive; align `.gram-level-btn` (drop accent idle-hover border, restrained selected cue) | A | css-propagated | ui/ui.css + styles.css | none | none | The previously-missing shared segmented control (selected = raised surface pill + thin accent-weak inset, not a full accent ring). `seg()` is already `.btn small/primary`-based so P1.4 covers it. `.gram-level-btn` refined under the same zero-specificity guard (Aero/Wired/Blanc excluded; Wired restyles it in-scope). `.os-toggle` uses `accent-color` for the checked state only (legit active use) and inputs/selects use neutral `--control-*` with accent focus — no idle-accent §8 issue, no broad raw-input selectors added (raw-input safety honored). Full pixel-alignment of every legacy toggle/select to the `.ui-*` primitives deferred as adoption. 5+2 rules parsed OK. | screenshotted (rules parsed; live segmented render pending) | Legacy toggle/select→ui-* adoption deferred | P1 | b7580ed |
| Accent detox — **classification pass** (P1.7) | A | classified (audit; no sweep) | styles.css (audit only) | none | 207 idle app-family uses (B) + shell-chrome uses (A, Phase 2) | Parsed every `var(--accent)` declaration in `styles.css`: **431 total → 202 state-scoped (legitimate: hover/focus/active/selected/checked/open) + 229 idle**. Of the 229 idle, **207 are in Account-B app families** (top: `wgt` 18, `bundle` 13, `reader` 10, `pr` 10, `manga` 9, `dict` 8, `mining` 7, `gram` 7, `mini` 7) and only **22 are shell/shared (A)**. Triage of the 22 — legitimate keeps: `.btn.primary` + `:where` ui primary (primary action), `.card-progress > div` (progress), 3× native `accent-color` inputs, `.fwin.focused` (focus state), `.os-start-backdrop.drop-ready` (drop state), `.os-start-tile.pinned` (state), `html[data-icon-text='accent']` (user-selected option), `:root[data-materials='aero']` ambience (Aero — protected, untouched), `.os-set-card-advanced-toggle` (accent-as-link affordance), `.os-companion-spark` (indicator). Remaining genuine idle-decorative: `.os-start-btn` idle accent border, `.os-desk-icon-img.action/.tone-add`, `.os-start-app-ic.tone-add` — **all Start/taskbar/desktop-icon chrome, which master plan line 199 assigns to Phase 2 (A)**; the `tone-*` pair is a categorical icon palette whose sibling slots are literal colors (accent = the "red" slot), so it needs the Phase-2 icon-tone decision, not an isolated swap. **Net: no idle-decorative accent violation remains in the Phase-1 shared/primitive layer** — `ui.css` accent uses are 100% state-scoped, and `shell.css` likewise (active tile, focus ring, checked box, selected tab, primary). No code change made in P1.7: a sweep across 57 app families would have been the forbidden broad sweep. | audited (classification reproducible via scratchpad `classify-accent.cjs`) | Shell-chrome detox → Phase 2; 207 app-family idle uses → Account B (inventory above) | P1 | _pending_ |

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
