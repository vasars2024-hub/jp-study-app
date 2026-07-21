# UI Migration Debt

Persistent ledger for the Study OS UI/UX refinement. Read with `UI_UX_REFINEMENT_MASTER_PLAN.md`.
Both agents update **only their own rows** where possible. On merge, keep **both** sides' rows (never drop one
during conflict resolution — see `UI_UX_INTEGRATION_PROTOCOL.md` §12). **Remove a row only after its work is
visually verified.** This file keeps the effort honest — it is where "we only did superficial global changes"
would show up.

## Coordination header (fill in at kickoff)

- Base commit SHA (both branches start here): `54fd5d99f07ce9af01e027003efdde98225606f3`
- Approved Phase 1 commit/tag: `d6b07c2c05b05edad6ca03b65720f88bab2ace79` (tagged `ui-phase1-approved`)
  — approved by the user; the complete nine-commit sequence `9d09df0..d6b07c2` is the Phase 1 foundation.
- Base branch: `grammarx/phase-1-5` (confirm current)
- Account A worktree: `C:/Users/Arseniy/Projects/jp-study-app-core-shell` on `ui/core-shell`
- Baselines captured (`debug/shots/ui-refinement/baseline/`): 01 study-os medium+overlap, 02 launcher,
  03 Settings home (cards/nav/quick-actions), 04 Blanc. Theme-regression before/after (classic-light,
  wired, aero) reproduced via `git stash` toggle at the token checkpoint.
- Phase 2 baselines (`debug/shots/ui-refinement/p2-baseline/`, captured at `d6b07c2` before any P2 edit):
  01 medium+overlap+taskbar, 02 launcher, 03 widget gallery, 04 narrow 940x600, 05 maximized.
  "After" counterparts in `p2-after/`.
- Accepted tooling baseline (corrected by the user at the Phase 1 approval): vitest 946/946; i18n clean;
  tsc 1291 errors (0 in A-owned files); eslint **63 errors / 171 warnings**; runtime error log 0;
  Aero/Wired/Blanc zero rendered differences.
- ESLint note: `npx eslint src --ext .ts,.tsx` in this worktree reports **63 errors / 171 warnings**,
  not 65/171. This is NOT a change introduced by Phase 1: the only lint-visible file touched in the whole
  phase is `theme/tokens.ts` (CSS files are not linted), and it reports 0 errors / 0 warnings. Warnings match
  the accepted baseline exactly. Treated as a measurement/scope difference in how the 65 was originally
  captured, and flagged here rather than silently accepted. Zero errors in any A-owned file.

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
| Semantic colour split (`--status-error`→`--danger`, `--status-info`→blue, new `--danger`/`--danger-2`/`--danger-deep`/`--danger-weak`) | A | css-propagated | tokens.css/styles.css `:root` + tokens.ts mirror | none | none | **RESOLVED at checkpoint.** The concern was real: the A/B sweep confirmed Aero and Wired inherited the new `--status-error` (both) and `--status-info` (Wired), and that defining `--danger` changed the 4 existing `var(--danger, #d8534f)` / `var(--danger, #e06c75)` call sites for them too. Fixed in `998c7f7` by pinning `--status-error: var(--red)`, `--status-info: var(--accent)` and `--danger: initial` under `:root[data-materials='aero'], :root[data-materials='wired']` in tokens.css (no protected skin file touched). `--danger: initial` yields the guaranteed-invalid value so those `var()` fallbacks resolve exactly as at baseline — verified: study-os `rgb(209,52,56)`, Aero/Wired `rgb(224,108,117)` = baseline. Blanc insulated (overrides both in `.blanc-root`). | verified (computed-style A/B vs base) | none | P1 | 9d09df0, 998c7f7 |
| Surface ladder widen (study-os `--bg`/`--sidebar`/`--panel`/`--panel-2`) + new `--surface-0..3`/`--surface-sunken`/`--surface-input` aliases | A | css-propagated | styles.css base `:root` | none | none | Study-os only; all 12 named themes + Aero + Wired override the four base surfaces (verified) so no leak. Aliases are var()/color-mix over per-theme tokens → adapt everywhere with no per-theme edits. Propagation confirmed live on Settings (`.fwin`=`--bg`, chip=`--panel`). | screenshotted | none | P1 | dc5e5b5 |
| Unify duplicated systems: `--shadow-card`→`--elevation-2`, `--shadow-toolbar`→`--elevation-1`, `--motion-duration`→`var(--dur-fast)`; add `--space-lg-2` (20px) + spacing-ownership comment | A | css-propagated | styles.css base `:root` | none | Runtime shadow/density/motion presets NOT yet derived from canonical ramps (see note) | **Stylesheet defaults only.** At runtime `osPersonalization.applyPersonalization()` emits `--shadow-card`/`--shadow-toolbar` (user SHADOW preset) and `--space-xs..xl` (user DENSITY preset) inline on `<html>`, and `motionPrefs` emits `--motion-duration = 0.14*v`; these override the stylesheet by design. Not collapsed — they are user-facing personalization features (§7 preserve functionality). `--motion-duration` default now = `--dur-fast` (=0.14s, identical to runtime v=1). `--space-lg-2` is fixed (does not scale with density; 0 consumers yet). True single-runtime shadow/density system = product decision, deferred. `--danger`/`--status-*`/`--surface-*` are NOT personalization-emitted, so P1.1/P1.2 hold at runtime. | verified (defaults resolve; runtime layer documented) | Runtime preset unification deferred (would alter a user feature) | P1 | bcdf64b |
| Legacy `.btn` reconciled with `.ui-btn` tiers (base/primary/small/ghost/danger + focus) + new `--accent-weak`; `.ui-btn--danger`/`.btn.danger` keyed off `--danger` | A | css-propagated | styles.css + ui/ui.css | none | none | Original `.btn` tier rules kept verbatim as skin-safe base; refined ui-btn-parity treatment layered in a **zero-specificity `:where()` guard** (`html:not([data-materials='aero']):not([data-materials='wired'])` + `.btn:where(:not(.blanc-root *))`) so Aero/Wired/Blanc buttons stay pixel-identical (they inherit base structure + own in-scope overrides). Verified live: study-os primary now filled accent gradient (fw600, white); plain `.btn` semibold+flex; contextual per-screen overrides still win. `--font-display` under named themes = `--font-body` (no named-theme font change). **Skin sweep DONE at checkpoint — buttons passed with zero diffs.** The A/B computed-style comparison (base CSS vs HEAD, all four skins) found `.btn`, `.btn.primary`, `.btn.danger`, `.btn.small`, `.ui-btn`, `.ui-btn--primary`, `.ui-btn--danger` byte-identical under Aero and Wired, and Blanc identical across 120 sampled elements. The button guard's specificity contract was re-audited after the card-guard defect and is correct: `:where(html:not(..):not(..)) .btn:where(:not(.blanc-root *))` = (0,1,0) — the guard conditions are inside `:where()`, so variants (`.btn.small` (0,2,0)) and app overrides (`.mining-actions .btn.primary` (0,3,0)) still win; verified live (small 4px/10px 12px, primary filled, ghost transparent). Danger is now visually distinct from primary (`#d13438` vs `#ff2e4d`) and `.btn.danger` matches `.ui-btn--danger` exactly. NOTE: a `replace_all` initially produced a triple-paren syntax error that silently dropped all guarded rules; fixed and re-verified (12 rules parsed). | verified (computed-style A/B vs base, all 4 skins) | none | P1 | 8a0697c |
| Shared card set: `.ui-card` (base) surface-contrast + soft elevation, no border; new `.ui-card--quiet` / `.ui-card--interactive`; `.ui-panel` de-bordered | A | css-propagated | ui/ui.css | none | none | Provides the base/quiet/interactive card the app converges on; borders reserved for inputs/focus (§8 ≤1 cue), built on the P1.2 surface ladder. **CORRECTION — the original reasoning in this row was wrong and caused a real regression.** It claimed that because Aero/Wired/Blanc do not override `.ui-card`, the change was "low skin risk". The opposite is true: *not* overriding means they **inherit** it. The checkpoint A/B sweep caught Aero and Wired losing their `.ui-card` border (and Wired its `.ui-panel` border/background). Fixed in `998c7f7`: baseline `.ui-card`/`.ui-panel` declarations restored verbatim, refinement re-layered behind the skin guard. A second defect was found in that fix — the guard was written as `html:not([..]):not([..]) :where(.ui-card…)`, but **`:not()` contributes its argument's specificity**, scoring (0,2,1) and wrongly beating `.ui-card--quiet` (0,1,0), so quiet cards rendered `--surface-2`. Corrected to `:where(html:not(..):not(..)) .ui-card:where(:not(.blanc-root *))` = exactly (0,1,0), matching the base rule and winning on source order only, with the guard placed immediately after each base rule so variants and app overrides still out-specify it. Verified: study-os card `--surface-2` borderless, quiet `--surface-1` no shadow; Aero card `rgb(247,251,247)`/1px and Wired `rgb(6,18,26)`/1px = baseline. No accent-bordered card families exist in the shell/shared layer (0 found). App-owned `*-card` families remain B's to adopt. | verified (computed-style A/B vs base, all 4 skins) | App-card adoption is Account B | P1 | 739042e, 998c7f7 |
| New shared `.ui-segmented` primitive; align `.gram-level-btn` (drop accent idle-hover border, restrained selected cue) | A | css-propagated | ui/ui.css + styles.css | none | none | The previously-missing shared segmented control (selected = raised surface pill + thin accent-weak inset, not a full accent ring). `seg()` is already `.btn small/primary`-based so P1.4 covers it. `.gram-level-btn` refined under the same zero-specificity guard (Aero/Wired/Blanc excluded; Wired restyles it in-scope). `.os-toggle` uses `accent-color` for the checked state only (legit active use) and inputs/selects use neutral `--control-*` with accent focus — no idle-accent §8 issue, no broad raw-input selectors added (raw-input safety honored). Full pixel-alignment of every legacy toggle/select to the `.ui-*` primitives deferred as adoption. 5+2 rules parsed OK. | screenshotted (rules parsed; live segmented render pending) | Legacy toggle/select→ui-* adoption deferred | P1 | b7580ed |
| Accent detox — **classification pass** (P1.7) | A | classified (audit; no sweep) | styles.css (audit only) | none | 207 idle app-family uses (B) + shell-chrome uses (A, Phase 2) | Parsed every `var(--accent)` declaration in `styles.css`: **431 total → 202 state-scoped (legitimate: hover/focus/active/selected/checked/open) + 229 idle**. Of the 229 idle, **207 are in Account-B app families** (top: `wgt` 18, `bundle` 13, `reader` 10, `pr` 10, `manga` 9, `dict` 8, `mining` 7, `gram` 7, `mini` 7) and only **22 are shell/shared (A)**. Triage of the 22 — legitimate keeps: `.btn.primary` + `:where` ui primary (primary action), `.card-progress > div` (progress), 3× native `accent-color` inputs, `.fwin.focused` (focus state), `.os-start-backdrop.drop-ready` (drop state), `.os-start-tile.pinned` (state), `html[data-icon-text='accent']` (user-selected option), `:root[data-materials='aero']` ambience (Aero — protected, untouched), `.os-set-card-advanced-toggle` (accent-as-link affordance), `.os-companion-spark` (indicator). Remaining genuine idle-decorative: `.os-start-btn` idle accent border, `.os-desk-icon-img.action/.tone-add`, `.os-start-app-ic.tone-add` — **all Start/taskbar/desktop-icon chrome, which master plan line 199 assigns to Phase 2 (A)**; the `tone-*` pair is a categorical icon palette whose sibling slots are literal colors (accent = the "red" slot), so it needs the Phase-2 icon-tone decision, not an isolated swap. **Net: no idle-decorative accent violation remains in the Phase-1 shared/primitive layer** — `ui.css` accent uses are 100% state-scoped, and `shell.css` likewise (active tile, focus ring, checked box, selected tab, primary). No code change made in P1.7: a sweep across 57 app families would have been the forbidden broad sweep. | audited (classification reproducible via scratchpad `classify-accent.cjs`) | Shell-chrome detox → Phase 2; 207 app-family idle uses → Account B (inventory above) | P1 | _pending_ |

| Window chrome — `.fwin` active/inactive (P2.1) | A | css-propagated | shell.css (guarded) | none | none | Focused state was `border-color: var(--accent)` + a `0 0 0 1px rgba(255,46,77,.35)` ring — a hard red outline around the entire window, the loudest chrome in the shell and a direct §8 violation. Replaced with the elevation ramp: focused = `--elevation-4` + brighter NEUTRAL hairline, unfocused = `--elevation-2` + `--border` with the title dropping to `--muted`. Zero accent now used for window focus. Close-hover repointed from brand `--red` to Phase 1 `--danger`. Verified live post-reload: focused border `color(srgb 0.333 0.326 0.366)`, shadow `0 12px 32px rgba(0,0,0,.3)`; unfocused `0 2px 8px`. | verified (computed style + screenshot) | none | P2 | 0fceb13 |
| Taskbar — weight, active cue, tray grouping, narrow crowding (P2.2) | A | css-propagated | shell.css (guarded) | none | none | Removed the idle `border: 1px solid var(--accent)` on `.os-start-btn` (the item Phase 1's accent classification explicitly deferred to Phase 2) and its red glow; collapsed the doubled accent cue on `.os-task-win.active`/`.os-desktop-switch.active` (border + underline) to a single restrained underline on a raised surface; controls are borderless with a neutral hover wash; tray separated from apps by a hairline; clock rebalanced. **Real defect fixed:** at 940x600 the task strip measured clientWidth 290 / scrollWidth 438 with the 4th button at x=614 past the 561 edge — unreachable behind the tray with a hidden scrollbar. `flex: 0 1 auto` + 44px icon floor brings scrollWidth to clientWidth (354/354); all four tasks visible and reachable at a real 940x600 viewport. | verified (measured + screenshot at 940x600 and 1264x821) | none | P2 | 2882a12 |
| Launcher — category grouping, icon detox, search affordance (P2.3) | A | hybrid (TSX structure + CSS) | shell.css (guarded) + DesktopShell.tsx | none | none | 23 tiles in one flat grid with every icon painted brand red by `.os-start-app-ic { color: var(--red) }`. Now grouped into Study/Library/Media/Progress/System/Shortcuts via `START_GROUPS`, a **presentational map over app IDs only** — the app-list contract (`APPS`/`DesktopWinSection`/`AppSection`/`POPOUT_SECTIONS`) is untouched, and unmapped ids fall through to an "Other" bucket so a new app can never vanish. Default icons are neutral raised surfaces; the categorical `tone-*` tiles keep their hues (this is the "Phase-2 icon-tone decision" Phase 1 deferred). Panel capped at `min(76vh,720px)` with an internal scroll so headers cannot push the footer under the taskbar — verified at 940x600: panel bottom 547 vs taskbar top 552. Scoped to `.os-start-legacy` so the Aero/Wired `.os-start-aero-menu` is untouched. | verified (measured + screenshot at 1264x821 and 940x600) | none | P2 | b5fb324 |
| Widget Gallery — grouping, quiet add controls, installed state (P2.4) | A | hybrid (TSX + CSS) | shell.css (guarded) + WidgetGallery.tsx | none | none | ~12 filled-accent "Add" buttons competed as primary actions in one region (§8), with the category repeated as accent text per card instead of grouping them. Now: category sections (using the `category` field the registry already carries), quiet hover-revealed Add (kept permanently visible on focus and under `(hover:none)/(pointer:coarse)` so touch users never lose the only action), favourite as a real `aria-pressed` toggle, borderless surface-contrast cards, 184px responsive floor, and a real empty state with a clear-search escape. Installed/available distinction uses DesktopShell's **existing** widget state passed as `installedTypes` — no new persistence/tracking (§7); verified live (adding Digital Clock flipped the card to `.installed` + "On workspace" + "Add another"). Only prominent action left is the destructive Reset, on `--danger`. | verified (computed style + screenshot + live add/reset) | none | P2 | 510068f |
| `ui/Window.tsx` — control labels + tooltips (P2 a11y) | A | structurally-migrated (labels only) | ui/Window.tsx | none | none | Hardcoded English `aria-label`s ("Minimize"/"Maximize"/"Close") replaced with existing catalog keys (`desktop.minimize`/`desktop.maximize`/`common.close` — already in all four languages, so no new keys), plus matching tooltips. **Component has ZERO consumers**, so this is contract alignment for future adopters and is NOT visually verified. `.ui-window` already sat on `--elevation-5` with no accent, so no repaint was needed to match the refined FloatingWindow. | not visually verifiable (no consumers) | Unused component — cannot be rendered | P2 | a382bdd |

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
| Library window — primary/secondary button hierarchy | A | css-propagated | 1264×821, Library focused, empty state; before/after state-matched (`baseline/01` vs `after/01`). "+ Import file(s)" and "Import your first file" went red-outline → filled accent + white text; secondary buttons unchanged neutral. | P1 | 8a0697c |
| Settings home — surfaces + cards | A | css-propagated | 1264×821, Settings focused (accent frame present in BOTH shots — focus state, not a Phase-1 change); `baseline/03` vs `after/03`. Near-identical by design: `.os-set-card` is an app-owned family (B) and the surface-ladder shift is deliberately subtle. | P1 | dc5e5b5 |
| Blanc Toolbox — regression check | A | unchanged (protected) | 544×421, same view/scroll; `baseline/04` vs `after/04` pixel-identical except the clock. 120/120 sampled elements identical by computed style. | P1 | 998c7f7 |
| Start launcher — regression check | A | unchanged (Phase 2 scope) | 1264×821, launcher open; `baseline/02` vs `after/02` visually identical. | P1 | — |

## Phase 1 checkpoint — validation matrix results

Run at commit `998c7f7` on `ui/core-shell` (base `54fd5d9`).

| Gate | Baseline | Result | Verdict |
|---|---|---|---|
| Vitest | 946/946 | **946/946 (94 files)** — re-run after the fix commit | pass |
| i18n check | clean | **clean, exit 0** (3976 EN keys translated ja/zh/ru) | pass |
| TypeScript | 1291 errors | **1291 errors**, 0 in any A-owned file | pass (unchanged) |
| ESLint | 65 err / 171 warn | **63 err / 171 warn**; only lint-visible file touched all phase is `tokens.ts` → 0/0. Not caused by Phase 1 (see header note) | pass (not worsened) |
| Runtime error log | 0 | **0** | pass |
| Live app | working | working; 4 windows, taskbar, launcher open/close, window focus all functional | pass |
| Aero equivalence | must match | **zero diffs on every rendered property** (computed-style A/B, base CSS vs HEAD). Only difference: existence of unconsumed new tokens `--danger`/`--surface-2` | pass |
| Wired equivalence | must match | **zero diffs on every rendered property**, same method | pass |
| Blanc equivalence | must match | **120/120 sampled elements identical**; screenshot identical | pass |
| classic-light | may change | 11 intended token/component changes, no breakage observed | pass |

**Method note:** equivalence was verified by fingerprinting computed styles of 10 representative
selectors + 12 tokens under `study-os` / `classic-light` / `wired` / `aero`, then reverting the three
changed CSS files to the base commit via HMR, re-measuring, and diffing. This is what caught both
regressions fixed in `998c7f7`; the screenshots alone would not have.

**Not visually verified (declared):** `.ui-card--quiet` / `.ui-card--interactive` and `.ui-segmented` are new
primitives with no consumers yet — verified by computed style only, never seen rendered in a real screen.
`--space-lg-2`, `--surface-0/3/sunken/input`, `--danger-2/-deep/-weak` currently have zero or near-zero
consumers. Named themes other than `classic-light` (10 of them) were not individually swept. Hover/active/
focus states were verified by rule inspection and computed style, not by driving real pointer states.

---

## Phase 2 checkpoint — validation matrix results

Run at commit `a382bdd` on `ui/core-shell` (Phase 1 base `d6b07c2` / `ui-phase1-approved`).

| Gate | Baseline | Result | Verdict |
|---|---|---|---|
| Vitest | 946/946 | **946/946 (94 files)** | pass |
| i18n check | clean | **clean, exit 0** (3990 EN keys translated ja/zh/ru; 14 new chrome keys added this phase) | pass |
| TypeScript | 1291 errors | **1291 errors**, 0 in any A-owned edited file | pass (unchanged) |
| ESLint | 63 err / 171 warn | **63 err / 171 warn**; edited files report 0 errors and 0 new warnings | pass (unchanged) |
| Runtime error log | 0 | **0** across the whole phase | pass |
| Aero equivalence | must match | **0 of 70 guarded P2 rules match any element under Aero**; real theme switch renders the intact Aero skin | pass |
| Wired equivalence | must match | **0 of 70 guarded P2 rules match any element under Wired**; real theme switch renders the intact Wired skin | pass |
| Blanc equivalence | must match | In the Blanc window: 17 guarded rules loaded, **0 total matches, 0 inside `.blanc-root`**; screenshot unchanged | pass |
| study-os / classic-light | may change | 312 element matches each — the intended refinement | pass |
| Responsive | max / 1264 / 940x600 | all three captured; narrow crowding defect fixed (see ledger) | pass |
| Reduced motion | honored | every P2 transition collapses to `0s` under `html.reduce-motion`; launcher animation to `none` | pass |
| A11y — accessible names | required | **0 unnamed** icon-only controls (tray, desktop switches, window controls, Start pins) | pass |
| Functional smoke | preserved | minimize/restore, maximize, virtual-desktop switch (independent layouts: Desktop 2 = 5 windows, Desktop 1 = 1), launcher, gallery, add/reset widget, theme switch and back — all working | pass |

**Method note — why the protected-skin check changed shape this phase.** Phase 1 verified equivalence by
fingerprinting computed styles across skins. Repeating that here produced *apparent* Aero/Wired diffs that
turned out to be measurement artifacts, and chasing them is what surfaced the better method:

1. Switching skins by stamping `data-theme`/`data-materials` **without re-rendering React** applies Aero CSS
   to the *legacy* Start DOM — a combination that never exists in the real app (Aero renders
   `.os-start-aero-menu`, not `.os-start-legacy`). Several "diffs" were on elements that would not be mounted.
2. Others were plain app state: the first inactive task button happened to be a **minimized** window in the
   after-capture (`.os-task-win.min` carries reduced opacity in the skins' own CSS), and window counts differed.
3. Trying Phase 1's "revert the CSS file via HMR and re-measure" trick was actively misleading here: Vite
   momentarily dropped the whole `shell.css` sheet, so `.os-start-search`/`.os-start-foot-btn` fell back to UA
   defaults (`outset` borders, `1px 6px` padding) and every skin looked "changed". Caught by asserting a known
   marker value before measuring; the run was discarded rather than reported.

The replacement check is **exhaustive rather than sampled**: enumerate every rule carrying the Phase 2 skin
guard (70 of them) and count how many elements each matches under each skin. Under Aero and Wired the count is
**0 / 70 rules, 0 elements, 0 offenders** — the guard makes leakage structurally impossible, not merely
unobserved — and this was then confirmed by switching each skin for real (via `jp-os-theme` + reload) and
screenshotting the intact result.

**Not visually verified (declared):**
- `ui/Window.tsx` has no consumers; its label/tooltip fix cannot be rendered.
- `:focus-visible` rings were verified by rule inspection plus token resolution (`--focus-ring-width: 2px`,
  accent-derived colour) and not by driving real keyboard focus — synthetic key events do not trip Chrome's
  focus-visible heuristic. Hover states likewise verified by rule + computed style, not a real pointer.
- Window **drag/resize** was not exercised end-to-end (the handlers use pointer capture, which synthetic
  PointerEvents do not satisfy). The perf invariant is instead guaranteed by construction: no handler code was
  touched, and every P2 transition enumerates its properties — the transitioned set is exactly
  `background, border-color, box-shadow, color, opacity`, with **zero `transition: all` declarations** and none
  of the geometry properties the gestures write (`transform`/`left`/`top`/`width`/`height`). The pre-existing
  `html.os-interacting .fwin { transition: none !important }` rule is a second layer of protection.
- The 10 named themes other than `classic-light` were again not individually swept.
- Screenshot state-matching: `p2-after/01` and `04` are state-matched to their baselines (same four windows).
  `06-maximized` and the launcher/gallery shots were taken with a different window set, because the app's
  session restore dropped the original windows during a mid-phase reload; the shell chrome under comparison is
  unaffected by which apps are open, but the match is not pixel-exact.
