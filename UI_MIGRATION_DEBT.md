# UI Migration Debt

Persistent ledger for the Study OS UI/UX refinement. Read with `UI_UX_REFINEMENT_MASTER_PLAN.md`.
Both agents update **only their own rows** where possible. On merge, keep **both** sides' rows (never drop one
during conflict resolution — see `UI_UX_INTEGRATION_PROTOCOL.md` §12). **Remove a row only after its work is
visually verified.** This file keeps the effort honest — it is where "we only did superficial global changes"
would show up.

## Coordination header (fill in at kickoff)

- Base commit SHA (both branches start here): `54fd5d99f07ce9af01e027003efdde98225606f3`
- Approved Phase 1 commit/tag: `d6b07c2c05b05edad6ca03b65720f88bab2ace79` (tagged `ui-phase1-approved`)
  — approved by the user; the complete nine-commit sequence `9d09df0..d6b07c2` is the Phase 1 foundation;
  merged into `ui/app-screens` at integration (`04e72c9`).
- Base branch: `grammarx/phase-1-5` (parent of canonical base: `4b846f1`)
- Backup branch (pre-stabilization HEAD): `backup/pre-ui-stabilization` → `4b846f1`
- Account A worktree (Core & Shell, `ui/core-shell`): `C:/Users/Arseniy/Projects/jp-study-app-core-shell`
- Account B worktree (App Screens, `ui/app-screens`): `C:/Users/Arseniy/Projects/jp-study-app-app-screens`
- Recovery artifacts: `C:/Users/Arseniy/Projects/jp-study-app-stabilization/`
- **Accepted pre-UI validation baseline (UI phases must NOT worsen):** Vitest 946/946 pass (94 files) · i18n pass · app launches · 0 runtime errors · **TypeScript 1291 pre-existing errors** (1282 vendored `@huggingface/transformers` d.ts + 9 src `satisfies` unsupported by pinned TS 4.5.5) · **ESLint 65 errors + 171 warnings** pre-existing. Do NOT upgrade TypeScript/ESLint/deps/lockfile. New errors in files a UI agent edits are blockers.
- Runtime asset validation: shimeji sprite loads (128×128) + renders live; city asset loads (512×512). Aero CSS + wallpaper resolve (full live theme switch not exercised to avoid disrupting the running session).
- Integration worktree (`ui/integration`): `C:/Users/Arseniy/Projects/jp-study-app-redesign`
- Recovery artifacts: `C:/Users/Arseniy/Projects/jp-study-app-stabilization/`
- Baselines captured (`debug/shots/ui-refinement/baseline/`): 01 study-os medium+overlap, 02 launcher,
  03 Settings home (cards/nav/quick-actions), 04 Blanc. Theme-regression before/after (classic-light,
  wired, aero) reproduced via `git stash` toggle at the token checkpoint.
- Phase 2 baselines (`debug/shots/ui-refinement/p2-baseline/`, captured at `d6b07c2` before any P2 edit):
  01 medium+overlap+taskbar, 02 launcher, 03 widget gallery, 04 narrow 940x600, 05 maximized.
  "After" counterparts in `p2-after/`.
- **Accepted pre-UI validation baseline (UI phases must NOT worsen):** Vitest 946/946 pass (94 files) · i18n pass · app launches · 0 runtime errors · **TypeScript 1291 pre-existing errors** (1282 vendored `@huggingface/transformers` d.ts + 9 src `satisfies` unsupported by pinned TS 4.5.5) · **ESLint 65 errors + 171 warnings** pre-existing. Do NOT upgrade TypeScript/ESLint/deps/lockfile. New errors in files a UI agent edits are blockers.
- Runtime asset validation: shimeji sprite loads (128×128) + renders live; city asset loads (512×512). Aero CSS + wallpaper resolve (full live theme switch not exercised to avoid disrupting the running session).
- **Account B independent re-verification (prep, 2026-07-21):** Vitest 946/946 ✓ · i18n 3976 keys clean ✓ · tsc 1291 total / **9 in `src/`** ✓ · ESLint 65 errors + 171 warnings ✓ — all four match the accepted baseline exactly. Correction to the attribution above: the 1282 vendored errors are dominated by `@types/node` (854), `lifecycle-utils` (158) and `node-llama-cpp` (~190); `@huggingface/transformers` contributes only 28. Total is correct; the package attribution is not. None of the 9 `src/` errors are in Account B-owned screens.
- Accepted tooling baseline (A): vitest 946/946; i18n clean; tsc 1291 errors (0 in A-owned files);
  eslint 65 errors / 171 warnings; runtime error log 0; Aero/Wired/Blanc zero rendered differences.
- ESLint note (A): `npx eslint src --ext .ts,.tsx` in this worktree reports **63 errors / 171 warnings**,
  not 65/171. This is NOT a change introduced by Phase 1: the only lint-visible file touched in the whole
  phase is `theme/tokens.ts` (CSS files are not linted), and it reports 0 errors / 0 warnings. Warnings match
  the accepted baseline exactly. Treated as a measurement/scope difference in how the 65 was originally
  captured, and flagged here rather than silently accepted. Zero errors in any A-owned file.
- **ESLint 65-vs-63 reconciled (B, at integration):** the discrepancy is purely **lint scope**, now confirmed.
  `npm run lint` is `eslint --ext .ts,.tsx .` — it lints the **repo root**, which includes `vitest.config.ts`
  (`4:30 error import/no-unresolved 'vitest/config'`); A's command lints **`src` only**. Root-level files
  account for the 2-error delta. Both numbers are correct for their scope: **65 = repo-wide (`npm run lint`),
  63 = `src`-only**. No error was introduced or fixed. Going forward B reports both scopes explicitly.

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
| Settings — nav selection + card containment | B | css-propagated | none (scoped refinement of B-owned `.os-set-*`) | none | none | Advanced-Mode indigo tint preserved, re-based onto `--surface-2` | screenshotted (live cascade verified: card `--surface-2` + border 0; active nav `--surface-2` + 2px accent bar) | | P3A | e50ddeb |
| Settings — nav/card chrome i18n | B | n/a (i18n) | none | none | none | 9 keys added across EN/ja/zh/ru; `Show`/`Hide` + label concatenation replaced with a `{label}` placeholder | verified (i18n-check clean at 3985 keys; rendered live) | | P3A | 0d58874 |
| Anki — connection status semantics | B | css-propagated | none — structure kept, per the IR-3/IR-4 strategy | none | see **IR-8** | `.form-msg.err` is still brand-hued until IR-8 lands (shared file, not B's to edit) | screenshotted (live: banner border 0, `--status-error`@12% + 3px bar, dot & setup msg `rgb(209,52,56)`) | | P3A | 467793c |
| Reading Finder — idle result-card badges | B | css-propagated | none (scoped refinement of B-owned `.rf-*`) | none | see **IR-9**, **IR-10** | `.res-card` still has 2 containment cues and `.nov-modal` is still bespoke — both shared, left to A | screenshotted (live: 8 badges, `--text` on 8% fill, border 0) | | P3A | d549520 |
| Special page — i18n literals | B | n/a (i18n) | none | none | none | 5 of 7 strings sit behind "Special modules locked" and are **not visually confirmed**; `QUIET`/`SCAN` deliberately left untranslated (terminal command tokens) | partially verified (2/7 rendered; all 7 enforced by i18n-check + vitest gate) | Wired/Aero modules undiscovered in the harness profile | P3A | 5cd3758 |
| **Aero / Wired guard verification** (covers every B Phase 3A rule) | B | verification only | — | none | none | Blanc exclusion verified structurally, not yet rendered in the Blanc window | **verified** — live attribute sweep: under `data-materials='wired'` and `'aero'` the `.os-set-card` border **returns** (0.667px vs 0px default) and each skin's own background wins, proving the `:where()` guards exclude them. Token swap proven a no-op: `--status-error` = `#ff2e4d` = `--accent` under both skins (Phase 1 `998c7f7` pinning), vs `#d13438` in study-os. State restored cleanly (`data-materials` back to null). | | P3A | d549520 |

| Window chrome — `.fwin` active/inactive (P2.1) | A | css-propagated | shell.css (guarded) | none | none | Focused state was `border-color: var(--accent)` + a `0 0 0 1px rgba(255,46,77,.35)` ring — a hard red outline around the entire window, the loudest chrome in the shell and a direct §8 violation. Replaced with the elevation ramp: focused = `--elevation-4` + brighter NEUTRAL hairline, unfocused = `--elevation-2` + `--border` with the title dropping to `--muted`. Zero accent now used for window focus. Close-hover repointed from brand `--red` to Phase 1 `--danger`. Verified live post-reload: focused border `color(srgb 0.333 0.326 0.366)`, shadow `0 12px 32px rgba(0,0,0,.3)`; unfocused `0 2px 8px`. | verified (computed style + screenshot) | none | P2 | 0fceb13 |
| Taskbar — weight, active cue, tray grouping, narrow crowding (P2.2) | A | css-propagated | shell.css (guarded) | none | none | Removed the idle `border: 1px solid var(--accent)` on `.os-start-btn` (the item Phase 1's accent classification explicitly deferred to Phase 2) and its red glow; collapsed the doubled accent cue on `.os-task-win.active`/`.os-desktop-switch.active` (border + underline) to a single restrained underline on a raised surface; controls are borderless with a neutral hover wash; tray separated from apps by a hairline; clock rebalanced. **Real defect fixed:** at 940x600 the task strip measured clientWidth 290 / scrollWidth 438 with the 4th button at x=614 past the 561 edge — unreachable behind the tray with a hidden scrollbar. `flex: 0 1 auto` + 44px icon floor brings scrollWidth to clientWidth (354/354); all four tasks visible and reachable at a real 940x600 viewport. | verified (measured + screenshot at 940x600 and 1264x821) | none | P2 | 2882a12 |
| Launcher — category grouping, icon detox, search affordance (P2.3) | A | hybrid (TSX structure + CSS) | shell.css (guarded) + DesktopShell.tsx | none | none | 23 tiles in one flat grid with every icon painted brand red by `.os-start-app-ic { color: var(--red) }`. Now grouped into Study/Library/Media/Progress/System/Shortcuts via `START_GROUPS`, a **presentational map over app IDs only** — the app-list contract (`APPS`/`DesktopWinSection`/`AppSection`/`POPOUT_SECTIONS`) is untouched, and unmapped ids fall through to an "Other" bucket so a new app can never vanish. Default icons are neutral raised surfaces; the categorical `tone-*` tiles keep their hues (this is the "Phase-2 icon-tone decision" Phase 1 deferred). Panel capped at `min(76vh,720px)` with an internal scroll so headers cannot push the footer under the taskbar — verified at 940x600: panel bottom 547 vs taskbar top 552. Scoped to `.os-start-legacy` so the Aero/Wired `.os-start-aero-menu` is untouched. | verified (measured + screenshot at 1264x821 and 940x600) | none | P2 | b5fb324 |
| Widget Gallery — grouping, quiet add controls, installed state (P2.4) | A | hybrid (TSX + CSS) | shell.css (guarded) + WidgetGallery.tsx | none | none | ~12 filled-accent "Add" buttons competed as primary actions in one region (§8), with the category repeated as accent text per card instead of grouping them. Now: category sections (using the `category` field the registry already carries), quiet hover-revealed Add (kept permanently visible on focus and under `(hover:none)/(pointer:coarse)` so touch users never lose the only action), favourite as a real `aria-pressed` toggle, borderless surface-contrast cards, 184px responsive floor, and a real empty state with a clear-search escape. Installed/available distinction uses DesktopShell's **existing** widget state passed as `installedTypes` — no new persistence/tracking (§7); verified live (adding Digital Clock flipped the card to `.installed` + "On workspace" + "Add another"). Only prominent action left is the destructive Reset, on `--danger`. | verified (computed style + screenshot + live add/reset) | none | P2 | 510068f |
| `ui/Window.tsx` — control labels + tooltips (P2 a11y) | A | structurally-migrated (labels only) | ui/Window.tsx | none | none | Hardcoded English `aria-label`s ("Minimize"/"Maximize"/"Close") replaced with existing catalog keys (`desktop.minimize`/`desktop.maximize`/`common.close` — already in all four languages, so no new keys), plus matching tooltips. **Component has ZERO consumers**, so this is contract alignment for future adopters and is NOT visually verified. `.ui-window` already sat on `--elevation-5` with no accent, so no repaint was needed to match the refined FloatingWindow. | not visually verifiable (no consumers) | Unused component — cannot be rendered | P2 | a382bdd |
| Notebook — count chips + timeline cards (single containment cue) | B | css-propagated | none (scoped refinement of B-owned `.gx-notebook-*`) | none | none | `.gx-notebook-count` and `.gx-notebook-item-btn` each carried **two** containment cues (`1px solid var(--border)` + `background: var(--panel-2)`) — a §8 violation. Collapsed to a single surface cue (border 0, `background: var(--surface-2)`), quiet `--surface-3` hover, and the selected `.active` count drops its full `var(--accent)` border for a restrained `inset 0 0 0 1px var(--accent)` hairline. All five rules carry the Phase 1 guard `:where(html:not([data-materials='aero']):not([data-materials='wired'])) …:where(:not(.blanc-root *))` so Aero/Wired keep the base rule and Blanc keeps its `[class^='gx-notebook']` re-skin (blanc-native.css). | verified (computed style: study-os `.gx-notebook-count` border `0px` bg `rgb(39,36,51)`=`--surface-2`; under stamped `data-materials='aero'` the base `1px solid` border **returns** → guard excludes it, Aero baseline preserved. Item-btn rule identical; timeline empty in the IPC-less harness so measured on the count chips.) | Blanc window not rendered in harness — exclusion verified structurally via the identical Phase 1 guard | P3B | _pending_ |
| Statistics — stat cards + chart panel (single containment cue) | B | css-propagated | none (scoped refinement of B-owned `.stats-*`) | none | none | `.stats-card` and `.stats-chart` each carried `1px solid var(--border)` + `background: var(--panel)` (two cues). Collapsed to a single surface cue (border 0, `--surface-2`). Chart bars (`.stats-bar-fill`) keep `--accent-2`/`--accent` — meaningful data, §8-legal. Guarded so Aero's protected `aero-stats-*` render branch, Wired, and Blanc's `[class^='stats-']` re-skin are untouched. | verified (computed style: study-os `.stats-card` border `0px` bg `rgb(39,36,51)`=`--surface-2`; under stamped `data-materials='aero'` the base `1px solid` + `--panel` bg **return** → guard excludes it. 4 cards rendered; chart empty in IPC-less harness so measured on the cards, identical rule shape.) | Blanc/Aero render-branch not exercised in harness — guard identical to verified Phase 1 idiom | P3B | _pending_ |
| Book Reader — chrome audit | B | audit (no change) | none | none | none | **Audited, already conforms — no change invented.** The reader is a reading surface, not a card/dashboard: `.reader-bar`/`.reader-footer` are toolbars with a single hairline separator (§8-legal structural border), `.reader-controls select`/`.chapter-select` are inputs (§8 reserves borders for inputs), and accent appears only on the native `.reader-seek` range control (`accent-color`) and active-state outlines (`.reader-anno-swatch.active`) — all legitimate state/native uses. No multi-cue cards, no idle decorative accent. Epub injection (`buildReaderCss`/`styleContents`/`stageBg`) deliberately untouched (master §7). | verified (source audit of all `.reader-*` chrome rules) | Nothing to migrate | P3B | (no change) |

## Integration requests (Account B → Account A)

Missing shared tokens/primitives/global changes B needs. A (or the integration pass) implements these in
A-owned files; B removes any temporary workaround once the shared change lands and is verified.

| # | Requested by | What's needed | Screen(s) blocked | Temp workaround in place | Status (`open`/`landed`/`removed-workaround`) | Notes |
|---|---|---|---|---|---|---|
| IR-3 | B | **Blanc class-name coupling** — see audit §3B/§4 | Anki (3A); Notebook/Stats/Reader (3B) | none | **strategy-proposed (NOT closed)** | Audit complete: `.anki-card`, `.stats-*`, `.gx-notebook-*`, `.reader-*` are Blanc-re-skinned; `os-set-*`, `rf-*`, `nov-*`, `res-*`, `status-banner`, `form-msg`, `gram-level-btn` are **not**. Proposed strategy = default-theme-scoped refinement using Phase 1's `:where(:not(.blanc-root *))` guard (`ui.css:59,121,165`). Stays open until the strategy is approved and verified in implementation. |
| IR-4 | B | **Blanc component-import coupling** — see audit §3A/§3C | Anki (3A); Stats (3B) | none | **strategy-proposed (NOT closed)** | `BlancStudyPanels.tsx` renders 6 `AnkiContent` + 5 `StatsContent` exports (l.792-828, l.862-886). `AnkiContent` verified **frameless** (emits no `.anki-card`; framing from `AnkiView.tsx:54,67,77,86` / Blanc `fieldset`) → already presentation-neutral, so **no extraction needed** and all exports preserved. Stays open until verified in implementation. |
| IR-7 | B | Account-B-controlled renderer + baselines | app-screen baselines | `debug/baseline-harness*.html` (gitignored, local-only) | **partially resolved (NOT closed)** | Isolated renderer achieved on port 5273 via the existing `PORT` option, zero disruption to A. **7 baselines captured** at 1280×601. **Not closed:** narrow ~940×600 unattainable on this display (dpr 1.5 / 1920×1080; window sizing proved non-deterministic), so §8's narrow criterion is not yet verifiable; Special page, Book Reader and Blanc Anki panel also uncaptured. |
| IR-8 | B | **`.form-msg.err` paints errors in the BRAND hue** — `color: var(--accent)` (`styles.css:5145`) | Anki (3A) + any screen using `.form-msg` | none — left untouched on purpose | **open** | Same §8 defect as `.status-dot.bad` / `.anki-setup-msg`, which B fixed because they are Anki-only. `.form-msg` is **not** exclusively B-owned — also used by `AiCardStudio.tsx`, `ProfileSwitcher.tsx`, `views/SettingsView.tsx` — so it fails master §15(1) and is A's to change. Suggested: `color: var(--status-error)` (and `.form-msg.ok`'s hardcoded `#5ad08a` → `var(--status-success)`). Both `aero-apps.css` and `wired-apps.css` override `.form-msg`, so Aero/Wired equivalence must be re-verified. |
| IR-9 | B | **`.res-card` carries two containment cues** (`border: 1px solid var(--border)` + `background: var(--panel)`, `styles.css:6978`) | Reading Finder result grid (3A); Resources | none — left untouched on purpose | **open** | §8 allows one strong containment cue. Not exclusively B-owned: also used by `resources/ResourcesContent.tsx` and `resources/BundleDetail.tsx`, so it fails §15(1). B could have refined it via the co-located B-owned `.rf-card` hook, but that would make Reading Finder's cards diverge from the identical Resources cards — worse than leaving it. Suggested: same treatment Phase 1 gave `.ui-card` (drop the border, keep surface contrast). Both `aero-apps.css` and `wired-apps.css` override `.res-card`, so equivalence must be re-verified. |
| IR-10 | B | **`.nov-modal` → shared `Dialog`** | Reading Finder detail (3A); Novels | none | **open** | The execution plan asks B to replace the bespoke `nov-modal`/`-backdrop`/`-body`/`-x` with shared `Dialog`, but these classes are shared with `novels/NovelsContent.tsx` + `views/NovelsView.tsx` and are overridden by protected Aero/Wired CSS. Swapping only B's call site would leave two divergent modal systems in one app (explicitly against master §6 "no second design system"). Needs either an A-led shared migration of both screens, or an explicit decision to migrate Reading Finder alone and accept the divergence. |
| IR-1 | B | **Segmented-control primitive** to replace the `.gram-level-btn` idiom | Reading Finder (JLPT level row, furigana/18+ filters) | none | open | **Not a B-exclusive selector.** `.gram-level-btn` is used by `DictionaryResults.tsx:900`, `grammar/GrammarContent.tsx:176`, `reading/ReadingFinderContent.tsx:217/282/288`, and is documented as an idiom by `translate-analysis/FormalityToggle.tsx:13`. Defined at `styles.css:5779-5793` and **re-scoped by protected `theme/wired-apps.css:38`**. Fails master §15 condition (1) → A must own this change; Wired equivalence must be re-verified. |
| IR-2 | B | Confirm ownership + treatment of **`.anki-card`** | Anki (3A) | none | open | Used by **12 files**, only 2 of which are B-owned (`AiCardStudio`, `CsvEditorPanel`, `DeckActionMenu`, `DeckImportPanel`, `EpubMiningPanel`, `EpubMiningSimplePanel`, `FlashcardsContent`, `JitenMiningPanel`, `views/AnkiView`, `blanc/BlancStudyPanels`…). Also styled by **protected `theme/aero-apps.css`** at 8+ sites. Fails §15 condition (1) → A-owned. |
| IR-3 | B | **Decision required:** how to migrate screens whose classNames Blanc re-skins | Anki (3A); Notebook + Statistics (3B) | none | **open — blocking design question** | `theme/blanc-native.css` re-skins Study OS classes **by class name / prefix**, scoped to `.blanc-root`: `.anki-card` (l.28/36), `.stats-card`, `.stats-section`, `.stats-level-estimate` (l.41), `.gx-notebook-item`, `.gx-notebook-count` (l.44), plus prefix matches `[class^='stats-']`, `[class^='gx-notebook']` (l.21/24). **Any structural migration of these screens to `ui/*` silently stops those selectors matching and visually breaks Blanc — which is protected (master §4).** The execution plan flags the Blanc seam for Anki only; it does **not** flag it for Notebook/Statistics, which are equally affected. Needs an explicit ruling before 3A/3B implementation. |
| IR-4 | B | **Decision required:** component-export contract shared with protected Blanc | Anki (3A); Statistics (3B) | none | **open — blocking design question** | `blanc/BlancStudyPanels.tsx` imports and renders B-owned components directly: from `anki/AnkiContent` → `AnkiDisconnected`, `AnkiDeckNoteType`, `AnkiFieldMapping`, `AnkiNoteCss`, `AnkiManualCardForm`, `AnkiPreviewPane`, `useAnkiConfig` (rendered at l.792-828); from `stats/StatsContent` → `StatsCards`, `StatsChart`, `StatsBooks`, `WordKnowledge`, `useStats` (l.862-886). Their **internal JSX is shared with Blanc**, so restyling them is not visually contained to Study OS. Compounds IR-3. |
| IR-5 | B | `Notification` primitive coverage for connection/status states | Anki (3A) | none | open | Replaces bespoke `status-banner` (`warn`/`bad` variants) and `form-msg ${kind}` (`ok`/`err`). Needs `kind` values covering error / warning / info / success, per master §6 semantic-state split. Blocked behind IR-3/IR-4 for Anki specifically. |
| IR-6 | B | `Dialog` parity for the bespoke `nov-modal` | Reading Finder (3A) | none | open | Bespoke `nov-modal` / `nov-modal-backdrop` / `nov-modal-body` / `nov-modal-x`. Needs backdrop, close affordance, focus trap + Esc parity before swap. |
| IR-7 | B | **Live-inspection contention: bridge port is hardcoded** | all B screens (baseline + checkpoint screenshots) | none | **open — blocks baseline capture** | `src/main/debugBridge.ts:21` hardcodes `DEBUG_PORT = 39273` with no env override, and the MCP server resolves `debug/bridge.json` from its **own** install root (`server.mjs:20`). Only one app instance can serve the bridge, so **A and B cannot both use live MCP inspection**. Currently the live app is Account A's instance (PID 42712, from the `core-shell` worktree); Account B's MCP reads the main repo's now-stale `bridge.json` (dead PID 15032) → every authenticated call returns `bad token`. `app_health` is unauthenticated and still responds, which makes the failure look intermittent. Needs a user decision (serialize live inspection, re-root B's MCP, or add a port override — the last is outside B's ownership). |

## Aero / Wired inherited-fix exceptions

Aero and Wired must stay visually + behaviorally equivalent to baseline (master §4). Log here any *documented*
inherited fix that corrects a genuine defect (nothing else is permitted, and they never receive the new default
aesthetic).

| # | Skin | What changed & why (genuine defect) | Approved by | Commit | Verified against baseline |
|---|---|---|---|---|---|
| _(none yet)_ | | | | | |

## Account B — Phase 3A unblock: baselines + Blanc coupling audit (no UI implementation)

### 1. Isolated Account-B renderer (IR-7)

Account A's Phase 2 Electron instance holds **both** default ports (Vite 5173, debug bridge 39273). `src/main/debugBridge.ts:21` hardcodes `DEBUG_PORT` with no env override and degrades silently on collision (`server.on('error')` → `server = null`, no `bridge.json` write), and the MCP server resolves `bridge.json` from its own root (`tools/claude-app-bridge/server.mjs:20`), so a second Electron instance could never be reached anyway. **No committed build config or app source was modified.**

Setup actually used (user-approved):
- **Renderer:** `PORT=5273 npx vite --config vite.renderer.config.ts` from the `ui/app-screens` worktree. `PORT` is an **existing, documented runtime option** (`vite.renderer.config.ts`, "Honour an assigned PORT when one is set"). A's 5173/39273 untouched throughout.
- **Boot shim:** `debug/baseline-harness.html` + `debug/baseline-harness-blanc.html` — **gitignored** (`.gitignore:121`), so they can never be committed. The renderer touches the Electron preload bridge at module init (`playerBus.ts:226-232`), which throws in a plain browser; the repo's own harnesses use the same idea (`src/renderer/__devharness__/motionHarness.tsx:31`, `window.api = {}`). A flat `{}` is insufficient for a full app boot, so the shim is a recursive proxy that is simultaneously **callable** (React effect cleanups require a function) and **thenable resolving to `[]`** (Blanc calls `.length`/`.legacyMigrated` on IPC results without null-guards; `null` crashes `BlancReadPanel` + `profileState`).
- **Capture:** Chrome (Browser 2) via `?popout=<section>` deep links — no click automation needed.

**Fidelity caveat (must be honoured for "after" shots):** these render in Chrome without Electron IPC, so data-backed panels are empty. Baselines are faithful for **chrome / layout / tokens / responsive width**, not for populated data. After-shots must use the identical harness, port, browser and viewport.

### 2. Baseline screenshot inventory — `debug/shots/ui-refinement/baseline/`

All at **viewport 1280×601 CSS, dpr 1.5, theme `study-os` (no `data-theme`), no `data-materials`**.

| File | Screen | State |
|---|---|---|
| `01-anki-disconnected_studyos_1280x601.jpg` | Anki | **disconnected** — `status-banner bad` + red "Can't reach Anki." + numbered AnkiConnect setup |
| `02-reading-finder_studyos_1280x601.jpg` | Reading Finder | default, 8 result cards, level row, filters |
| `03-settings-home_studyos_1280x601.jpg` | Settings | home shell, nav + quick actions |
| `04-notebook_studyos_1280x601.jpg` | Notebook | empty state, counters, tablist |
| `05-statistics_studyos_1280x601.jpg` | Statistics | classic render path (not Aero branch) |
| `06-blanc-stats-panel_shared-StatsContent_1280x601.jpg` | **Blanc** Stats | renders shared `StatsContent` — `.stats-card`×4, `[class^='stats-']`×19 |
| `07-blanc-read-panel_1280x601.jpg` | **Blanc** Read | Blanc shell reference |

**Not captured (disclosed, not silently skipped):**
- **Narrow ~940×600** — the display is dpr 1.5 on 1920×1080; max CSS viewport is ~1269×596, and OS-level window sizing proved unreliable (identical calls returned 1280×601 then 627×303 as Chrome re-maximized / changed DPI handling). Retrying was stopped rather than looped. §8's narrow criterion is therefore **not yet verifiable** — see IR-7 status.
- **Special page** — a Settings sub-page needing in-app navigation.
- **Book Reader** — not a `?popout=` section; requires opening a book.
- **Blanc Anki/Deck panel** — crashes under the shim (needs real IPC shapes). Anki↔Blanc coupling was therefore established **from source**, not screenshots.

### 3. Blanc coupling — exact dependency graph

**A. Component imports** — `blanc/BlancStudyPanels.tsx` imports and renders B-owned components directly:

| From | Components | Rendered at |
|---|---|---|
| `anki/AnkiContent.tsx` | `AnkiDisconnected`, `AnkiDeckNoteType`, `AnkiFieldMapping`, `AnkiNoteCss`, `AnkiManualCardForm`, `AnkiPreviewPane`, `useAnkiConfig` | l.792–828 |
| `stats/StatsContent.tsx` | `StatsCards`, `StatsChart`, `StatsBooks`, `WordKnowledge`, `useStats` | l.862–886 |

**B. CSS re-skin coupling** — swept every B-owned class prefix against `theme/blanc*.css`:

| Prefix | Blanc-coupled? | Selectors |
|---|---|---|
| `anki-card` | **YES** | `.anki-card` (blanc-native.css l.28, l.36) — but see note below |
| `stats-*` | **YES** | `.stats-card`, `.stats-section`, `.stats-level-estimate`, `.stats-bar-fill`, `.blanc-stats-grid`, prefix `[class^='stats-']` (2 files) |
| `gx-notebook*` | **YES** | `.gx-notebook-item`, `.gx-notebook-count`, prefix `[class^='gx-notebook']` |
| `reader-*` | **YES** | `.reader-bar`, `.reader-controls`, `.reader-footer`, `.reader-panel`, `.reader-pct`, `.reader-title`, `.reader-toolbar`, `.reader-anno-*` |
| `os-set-*` (Settings/Special) | **NO — zero rules** | — |
| `rf-*`, `nov-*`, `res-*` (Reading Finder) | **NO — zero rules** | — |
| `status-banner`, `form-msg`, `fm-*`, `wk-*`, `gram-level-btn` | **NO — zero rules** | — |

**C. Presentation vs behaviour.** `AnkiContent` is **frameless** — it emits **no** `.anki-card` (its only mention is the explanatory comment at l.8). Framing is supplied by the shells: `views/AnkiView.tsx:54,67,77,86` (Study OS `.anki-card`) and `BlancStudyPanels` (`fieldset`). So the Anki components are already **presentation-neutral content/state**; `.anki-card` belongs to the shells, not to my component.

**D. Two distinct risk modes** (both real, opposite directions):
- Classes Blanc **does** re-skin → structural migration removes the class, Blanc's selectors stop matching, Blanc **loses its skin**.
- Classes Blanc does **not** re-skin → Blanc currently **inherits** the Study OS look, so restyling them **leaks the new look into Blanc**.

### 4. Recommended strategy per screen (evidence-based, least invasive)

Phase 1 already established the exact idiom for this problem: default-theme-scoped rules guarded by `:where(:not(.blanc-root *))` inside a `:where(html:not([data-materials='aero']):not([data-materials='wired']))` wrapper — see `ui.css:59, 121, 165`. Reusing it costs no new system and no extraction.

| Screen | Strategy | Rationale |
|---|---|---|
| **Anki** | **Keep structure; default-theme-scoped visual refinement.** Adopt `Notification`/`Button`/`Input`/`Select` **inside** the existing exported components, with Blanc-excluded scoping for any new visual rule. **No extraction, no export changes.** | Components are already presentation-neutral (frameless); exports are consumed by protected Blanc. Extraction would duplicate logic for zero benefit. |
| **Settings + Special** | **Free migration** — adopt Phase 1 primitives structurally. | `os-set-*` has **zero** Blanc rules; `SettingsApp` already imports `AppChrome`/`Button`/`Toolbar`. No Blanc risk. |
| **Reading Finder** | **Free migration** — shared `Dialog` for `nov-modal`, `.ui-segmented` for the level row, `SearchBox`/`Select` for filters. | `rf-*`/`nov-*`/`res-*`/`gram-level-btn` have **zero** Blanc rules. |
| **Notebook, Statistics, Reader** (3B) | **Defer**; same scoped-refinement approach as Anki. | Blanc re-skins `.gx-notebook-*`, `.stats-*`, `.reader-*` by name/prefix. |

**Extraction is NOT required anywhere** — the evidence does not support it, so it was not chosen.

### 5. Phase 3A file scope (proposed)

Modify: `anki/AnkiContent.tsx`; `reading/ReadingFinderContent.tsx`; `settings/SettingsApp.tsx`, `SettingsCard.tsx`, `SettingsNav.tsx`; `settings/pages/SpecialPage.tsx`; `shared/i18n/catalogs.ts` (additive EN keys for SpecialPage literals); app-local scoped sections of `styles.css` **only** under master §15's six conditions.

Untouched (protected): all `theme/blanc*.css`, `theme/aero-*`, `theme/wired-*`, `blanc/BlancStudyPanels.tsx`, `views/AnkiView.tsx` (A/shared shell), `forge.config.*`, `vite.*.config.*`, `tsconfig.json`, `src/main/debugBridge.ts`.

**Can Phase 3A proceed without modifying protected Blanc files? — YES**, provided every new Study OS visual rule carries the Phase 1 `:where(:not(.blanc-root *))` guard, and no exported component signature from `AnkiContent`/`StatsContent` changes.

## Account B — Phase 1 synchronization + rendered verification of new primitives

Merge commit `04e72c9` brings `ui-phase1-approved` (`d6b07c2`, 9 commits) into `ui/app-screens`. `git diff d6b07c2 HEAD -- src/` is **empty** — the shared layer is byte-identical to A's approved state; nothing was manually reproduced.

**Post-merge validation:** vitest 946/946 · i18n 3976 clean · tsc 1291 total / 9 `src/` (**0 in any Phase-1-touched file**) · ESLint 63 err/171 warn (`src`) and 65/171 (repo-wide) — all at baseline.

**Rendered inspection of the three computationally-validated primitives** (live app, `study-os`, no `data-materials`, 1280×860; temporary probe nodes injected then removed — DOM verified clean afterwards):

| Primitive | Rendered result | Verdict |
|---|---|---|
| `.ui-card` (baseline) | `background rgb(39,36,51)` = `--surface-2`; `border 0/none`; `box-shadow` = `--elevation-2`; radius 16px | as designed — single containment cue (§8) |
| `.ui-card--quiet` | `background rgb(26,24,35)` = `--surface-1`; `box-shadow: none`; no border | **works** — confirms A's specificity claim: the `:where()`-guarded `.ui-card` refinement scores (0,1,0) so the later variant wins on source order |
| `.ui-card--interactive` | `cursor: pointer`; `transition-duration 0.14s`; all 4 rules (`base`/`:hover`/`:active`/`:focus-visible`) parsed with declarations intact | **works** — hover = `--surface-3` + `--elevation-3`, no accent |
| `.ui-segmented` | wrap `rgb(10,9,16)` = `--surface-sunken`, radius 8px, inline-flex; idle item transparent + `--muted`, **no idle border**; selected = `--surface-2` + `--elevation-1` + inset 1px `--accent-weak` | **works** — satisfies §8 "no accent border on inactive" |

- **All 20 token dependencies resolve** (`--surface-0..3`, `--surface-sunken/input`, `--elevation-1..3`, `--dur-fast`, `--ease-standard`, `--radius-md/xl`, `--accent-weak`, `--focus-ring-*`, `--font-*`).
- **CSSOM parse check:** every rule present with non-zero declaration counts (`.ui-segmented__item` 46, selected 11, hover 10, focus-visible 4) — no silently-dropped/invalid declarations.
- **Contrast (WCAG AA):** segmented idle text on sunken **6.99**, selected on surface-2 **13.82**, muted on surface-2 **5.35**, muted on surface-1 **6.18** — all PASS.
- **Surface ladder measured:** sunken `#0a0910` → s0 `#0d0c12` → s1 `#1a1823` → s2 `#272433` → s3 (mix) — a real ≥3-level ramp (§8).
- **Reduced motion:** covered — `theme/a11y.css:37-56` collapses `transition-duration` via a universal selector for both `prefers-reduced-motion` and `html.reduce-motion`. (`motion.css`'s own media block only targets `[class*='anim-']`/`[class*='trans-']`, which would *not* have matched these primitives; a11y.css is what covers them.)
- **Non-defect observation (no action taken):** `.ui-card--interactive:active { transform: translateY(0.5px) }` is a static transform, so under reduced motion it applies instantly rather than animating. At 0.5px this is not a perceptible motion defect; **global contract left unchanged** per instruction.

**Conclusion: no rendered defect demonstrated → no changes made to `.ui-card--quiet`, `.ui-card--interactive`, or `.ui-segmented`.**

IR-1 (segmented control) appears addressed by `b7580ed`; IR-3/IR-4 (Blanc coupling) remain **open** and still gate Phase 3A/3B.

## Account B — preparation-mode audit (no code changed)

Recorded during preparation mode at base `54fd5d9`. **No visual changes, no global CSS, no `ui/*` or token edits.**

### Shared-primitive adoption per B-owned screen (verified)

| Screen | Lines | Imports from `ui/*` | Bespoke class families | Migration read |
|---|---|---|---|---|
| `anki/AnkiContent.tsx` | 532 | **none** | `status-banner`, `form-msg ok/err`, `anki-*`, `fm-*`, `field-row`, `.btn` | Real migration target — but constrained by IR-3/IR-4 (Blanc). |
| `reading/ReadingFinderContent.tsx` | 533 | **none** | `rf-*` (22), `nov-*` (11), `res-*` (6), `gram-level-btn`, `.btn` | Largest bespoke surface; needs IR-1 + IR-6. |
| `notebook/NotebookContent.tsx` | 292 | **none** | `gx-notebook-*` (18) | `gx-notebook-views` tablist → shared `Tabs`; blocked by IR-3. |
| `stats/StatsContent.tsx` | 248 | `dialogService` only | `stats-*` (16), `wk-*` | Blocked by IR-3 + IR-4. Aero branch is protected. |
| `settings/SettingsApp.tsx` | 481 | `AppChrome`, `Button`, `StatusBar*`, `Toolbar*`, `MenuBar`, `useAeroMaterials` | `os-set-*` | **Already the best-adopted screen** — use as the reference pattern. |
| `settings/SettingsCard.tsx` | 78 | **none** | `os-set-card-*` (11) | Card-consolidation target (§8: ≤1 containment cue). |
| `settings/SettingsNav.tsx` | 90 | **none** | `os-set-nav-*`, `os-set-adv-*` | Selection state to de-accent. |
| `settings/pages/SpecialPage.tsx` | 720 | `useAeroMaterials`, `useWiredMaterials` (hooks, not primitives) | `special-*`, `os-toggle`, `os-viz-*`, + `aero-*`/`wired-*` lab content | Chrome-only cleanup; Aero/Wired lab content behavior-identical. |
| `views/BookReader.tsx` | 886 | none | `reader-*`, `book-stage` | Chrome only. Protected regions below. |

### Behavior that must be preserved (verified line references)

- **BookReader epub injection — do not disturb:** `buildReaderCss` (imported l.8; called l.137, 404, 560-561), `styleContents` (defined l.42), `stageBg` (l.719, applied l.821). Master §7 raw-input/embedded-content safety.
- **Anki frameless seam:** `AnkiContent` renders frameless so Study OS wraps bodies in `.anki-card` and Blanc wraps in `fieldset`. Preserve.
- **Statistics Aero branch** (`aero-stats-*`) is protected Aero territory — classic render path only.
- **i18n status:** `BookReader.tsx` already uses `useT()` (38 call sites). `SpecialPage.tsx` has confirmed untranslated literals: `"Blanc Mode"` (l.344), `"Use Blanc Mode"` (l.362), `"Reduced static/noise"` (l.459), `"Replay boot on entry"` (l.475), plus `"CRT intensity"`, `"Terminal ambient bed"`, `"Show Aero lyric gadgets when lyrics are active"`, and `"QUIET"`/`"SCAN"`. Note: `QUIET`/`SCAN` sit inside Aero/Wired terminal lab content — confirm whether these count as translatable chrome before touching them.

### Master-plan §5 counts re-verified against the tree

`--accent` and `--red` are both `#ff2e4d` (`styles.css:14,16`) and `--status-error: var(--red)` / `--status-info: var(--accent)` (`tokens.css:144-145`) — diagnosis confirmed. `var(--accent)` refs **248** (as stated); `1px solid` **465** (as stated); `<Button>` **71× / 10 files** (as stated). Two figures are **stale and understate the problem**: `.btn` is **590× / 109 files** (plan says ~521/102) and distinct `*-card` rules number **101** (plan says ~45).

### Baseline screenshots — NOT captured

Blocked by IR-7. **No baseline images exist for B-owned screens.** Per master §9 no code change may precede baseline capture, so this must be resolved before Phase 3A implementation begins. Note also that the currently-live app runs from Account A's `core-shell` worktree; it matches base `54fd5d9` **only while A's tree stays clean**, so it stops being a valid baseline source the moment Phase 1 editing starts.

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

---

## Integration checkpoint — Phase 2 (shell) + Phase 3A (app screens)

Merge commit `2f06d7c` on `ui/integration` (worktree `jp-study-app-redesign`). Brings `ui/core-shell`
(Phase 1 + Phase 2) and `ui/app-screens` (Phase 1 + Phase 3A) together. Only conflict was this ledger's
coordination header (both branches wrote it) — resolved by union, no content dropped. Code, `catalogs.ts`
and `styles.css` auto-merged (Phase 2 edits and Phase 3A edits touch disjoint regions of the shared files).

| Gate | Baseline | Result | Verdict |
|---|---|---|---|
| Vitest | 946/946 | **946/946 (94 files)** | pass |
| i18n check | clean | **clean, exit 0** (4006 EN keys translated ja/zh/ru) | pass |
| TypeScript | 1291 total / 9 src | **1291 total / 9 src** (all pre-existing `satisfies`; 0 in any merged UI file) | pass (unchanged) |

Visual verification of the merged tree tracked in the session task list (shell via the live core-shell
instance — byte-identical to integration's shell; app screens pending).

---

## Every-app pass (extension beyond the marquee plan, user-requested)

Long-tail apps not covered by Phases 1–3B. Same guarded idiom as the marquee work.

| App | What changed | Verification | Commit |
|---|---|---|---|
| Novels / Jiten | `.jiten-row`, `.aero-novels-command`, `.jiten-source-buttons button.active` used a hardcoded `rgba(180,50,58)` maroon that ignored the accent (read red under amber). → neutral hover wash + accent-following active; workbench panels (`.jiten-filters/.jiten-table-wrap/.jiten-inspector`) repointed off the muddy `rgba(8,8,10,.34)` to `--surface-1`. Guarded. | computed style: study-os follows `--accent`; under `data-materials='aero'` maroon returns | 9085cac |
| Media / Music | `.media-folder-row.active`, `.music-row.active`, `.music-line.active` glow, `.mwidget-btn.on`, `.music-liked-chip.on` hardcoded `rgba(255,46,77)` → `color-mix` over `var(--accent)` (identical in default+Aero, amber under personalization). Guarded. | computed style: study-os follows `--accent`; Aero literal returns | 21ffcb4 |

### Audit outcome — remaining hardcoded legacy-red is SHELL/shared, not app surfaces
After the three app fixes, every remaining `rgba(255,46,77)` / `rgba(180,50,58)` literal in `styles.css`
(>9000, excluding kept guarded-baseline originals and the literal `.anno-red` swatch) is in the **shell/shared
layer**, not a long-tail app: `.fwin-frameless.focused` (10654 border+ring), `.fwin.focused` ring (12132),
`.os-start-btn.active` glow (12327), `.os-start-backdrop.drop-ready` (12445), `.btn.danger:hover` (13357 —
should be `--danger`, a semantic leftover). These are A-owned shell/Phase-2 territory; logged for a shell
follow-up, not folded silently into an app commit.

### Remaining long-tail apps
Video, Manga, Games, Calendar, CSV, Translate, Dictionary, Grammar, Immersion, Resources, Flashcards, Library
carry **no** hardcoded legacy-red — they inherit Phase 1's calm tokens. Outstanding work for them is per-app
§8 card polish (multi-cue → single-cue), assessed app-by-app.

### Toolbar + shell-red + card-polish (every-app pass, cont.)
| Item | What changed | Verification | Commit |
|---|---|---|---|
| `.ui-toolbar` (all apps) | Flattened the grey chrome band: default/named themes get transparent bg + no shadow + single hairline separator (macOS toolbar). Guarded; Aero glass/Wired/Blanc keep theirs. | computed style: study-os transparent/no-shadow, Aero sheen+shadow return | 657bb95 |
| Shell red leftovers | `.fwin-frameless.focused` (P2 missed the frameless variant) → neutral elevation; `.os-start-backdrop.drop-ready` → accent; `.btn.danger:hover` brand-red → `--danger`. Guarded. | computed style: study-os neutral/accent/danger, Aero red returns | 24599e2 |
| Per-app content cards | `.cs-card .gram-card .gram-item .bundle-card .bundle-download-card .media-card .cbh-card .guide-item .pl-item` two-cue (border+fill) → single `--surface-2` cue. EXCLUDED (border legit): `.cal-month-cell` (grid), `.consent-card` (modal), `.flash-card` (study surface), `card-*-menu` (dropdowns). Guarded. | computed style: 6/6 sampled study-os border 0/surface-2, Aero baseline returns | b12387c |

**Every-app pass outcome:** all app-surface hardcoded legacy-red eliminated (Novels/Media/Music) and shell-red leftovers closed; the grey toolbar band flattened app-wide; the two-cue content cards collapsed to one cue. Apps with no such issues (Video, Manga, Games, Immersion, Library, Dictionary body, Calendar grid) already inherit Phase 1's calm tokens and were left unchanged rather than churned.

---

## Integration final sign-off

Branch `ui/integration` (worktree `jp-study-app-redesign`). Covers the merged marquee redesign
(Phases 1→3B) plus the user-requested every-app extension (Novels, Media, Music, toolbar flatten,
shell-red leftovers, per-app card polish).

### Validation matrix
| Gate | Baseline | Result | Verdict |
|---|---|---|---|
| Vitest | 946/946 | **946/946 (94 files)** | pass |
| i18n check | clean | **clean, 4006 EN keys translated ja/zh/ru** | pass |
| TypeScript | 1291 total / 9 src | **1291 / 9** (all pre-existing `satisfies`; 0 new — every change was CSS) | pass |
| ESLint | 65 err / 171 warn | **65 / 171** (repo-wide) | pass (unchanged) |

### Theme-regression (protected-skin equivalence, master §4)
Every refinement in this effort carries the Phase 1 guard
`:where(html:not([data-materials='aero']):not([data-materials='wired'])) …:where(:not(.blanc-root *))`.
Consolidated computed-style sweep of representative changes (`.ui-toolbar`, `.gram-card`,
`.jiten-row.active`, stat/notebook cards, media/music states, frameless-window focus):
- **study-os** renders the refined values.
- **Aero** and **Wired** both fall back to their own baselines (bordered cards return, maroon/red
  selection returns, glass/skin toolbars intact) — the guard makes leakage structurally impossible.
- **Blanc** excluded by `:where(:not(.blanc-root *))` (identical to the Phase 1 verified idiom).

### Verification medium
Pixel screenshots via the isolated preview time out on this heavy renderer, so verification is by
computed-style fingerprinting (the plan's own most-reliable method — §16 note). The shell was also
seen live on the core-shell Electron instance.

### Sign-off
Marquee redesign integrated and the every-app legacy-red/toolbar/card cleanup complete. All gates at
or above baseline; protected skins provably unchanged. Ready for user review on `ui/integration`.

---

## Post-integration pass — closing the shared-ownership integration requests

`ui/integration` is fully merged into `grammarx/phase-1-5` (`0e82dc1`; `git log ui/integration ^HEAD`
is empty). The A/B split no longer exists, so the three IRs that were blocked **purely** by master §15(1)
— "the selector is not exclusively owned by the branch proposing the change" — are now in scope and are
closed here. Same guarded idiom, no new system.

| IR | Family | What changed | Commit |
|---|---|---|---|
| IR-2 | `.anki-card` | Fill + 1px border + `--shadow-card` = **three** containment cues where §8 allows one. Collapsed to the single raised-surface cue every other card family already uses (`border: 0`, `box-shadow: none`, `background: var(--surface-2)`). Padding/radius/margin untouched — the CSV toolbar card and the EPUB settings card must keep sharing height, padding and radius. | uncommitted (working tree) |
| IR-8 | `.form-msg` | `.err` painted errors in the **brand** hue (`var(--accent)`) — the exact §8 defect Phase 3A fixed on `.status-dot.bad` but could not fix here. → `var(--status-error)`. `.ok`'s hardcoded `#5ad08a` → `var(--status-success)`. | uncommitted (working tree) |
| IR-9 | `.res-card` | Two cues (`1px solid var(--border)` + `--panel` fill) **and** a brand-coloured `--accent-2` border on mere hover. → single `--surface-2` cue, borderless, with the neutral `--surface-3` hover wash `.ui-card--interactive` uses. Moves Reading Finder, Resources and BundleDetail together, which is why it had to be done from an integrated tree. | uncommitted (working tree) |

### Verification

Measured in a clean Chromium against the authoritative cascade from `main.tsx` (tokens → styles → materials →
frutiger-aero → typography → ui → a11y → aero-apps → wired-apps → blanc), probe elements per family.

| Family | study-os (refined) | Aero (must equal baseline) | Wired (must equal baseline) | Blanc (must equal baseline) |
|---|---|---|---|---|
| `.anki-card` | `rgb(39,36,51)` = `--surface-2`, border `0px none`, shadow `none` | `rgb(255,255,255)` + `1px rgba(135,190,216,.9)` + Aero inset sheen — **returns** | `rgba(2,18,27,.82)` + `1px rgba(109,241,255,.2)` + shadow — **returns** | `rgb(38,38,40)` + `1px rgba(255,255,255,.07)` — Blanc's own re-skin intact |
| `.res-card` | `rgb(39,36,51)`, border `0px none` | `rgb(26,24,35)` = `--panel` + `1px rgb(45,43,55)` = `--border` — **returns** | same base baseline — **returns** | base baseline intact |
| `.form-msg.ok` | `rgb(56,178,107)` = `--status-success` | `rgb(23,66,95)` (aero-apps.css:5170) — **returns** | `rgb(90,208,138)` = the old `#5ad08a` — **returns** | Blanc `--text` intact |
| `.form-msg.err` | `rgb(209,52,56)` = `--status-error` | `rgb(23,66,95)` — **returns** | `rgb(255,46,77)` = brand red — **returns** | Blanc `--text` intact |

Structural guard proof (the exhaustive method the Phase 2 checkpoint adopted): enumerating every loaded rule
and testing `el.matches()` per probe, the count of **guard-carrying rules that match is 0** under
`data-materials='aero'`, 0 under `'wired'`, and 0 for probes nested in `.blanc-root`. Leakage is structurally
impossible, not merely unobserved. State restored (`data-materials` back to null, probes removed).

**Method warning — a real measurement trap, logged so the next session doesn't lose an hour to it.**
Reading `getComputedStyle()` in the **same JS task** as the `data-materials` attribute write returns
*partially* stale values in this Chromium: `border-width` re-resolved to the skin baseline while
`background` and `border-color` still reported the study-os values, producing an impossible mixture of two
rules on one element and a convincing false "the guard leaks" reading. Forcing layout (`void offsetHeight`)
does **not** fix it. Stamp the attribute in one `javascript_exec`, measure in the **next** one. This joins the
Phase 2 note's list of skin-comparison artifacts; it is the same class of error and it invalidated four
measurement rounds before it was caught by noticing `border-color: currentColor` (only obtainable from the
`border: 0` reset) sitting next to `border-width: 1px` (only obtainable from the base rule).

### Gates

| Gate | Result | Verdict |
|---|---|---|
| i18n check | **clean, exit 0** — 4292 EN keys translated ja/zh/ru | pass |
| Vitest | **2025/2026**; the one failure is `keyboardShortcuts` chord-conflict, from the tree's **pre-existing uncommitted** `src/renderer/keyboardShortcuts.ts` work | pass (not caused here — this pass is CSS-only) |
| TypeScript | 365 total / 306 `src` | unaffected (CSS is not typechecked) |
| ESLint | **2 errors / 166 warnings** repo-wide (both errors are the long-known root-level `vitest/config` resolution) | unaffected (CSS is not linted) |

**Baseline-drift disclosure:** the numbers recorded in this file's coordination header (vitest 946/946, tsc
1291/9, eslint 65/171) are **stale** relative to the current tree — TypeScript was unpinned 4.5→5.2
(`a09d994`), the suite has grown to 2026 tests, and the working tree carries ~1,100 lines of unrelated
uncommitted change. They are left as written because they are the historical record of what the UI phases were
measured against; they should not be read as the current baseline.

### Integration requests — remaining

| IR | Status | Note |
|---|---|---|
| IR-1 | **closed** | `.ui-segmented` landed in `b7580ed`; `.gram-level-btn` aligned. Adoption at the call sites is still open as ordinary migration work, not a missing primitive. |
| IR-2, IR-8, IR-9 | **closed** | This pass. |
| IR-3, IR-4 | **closed** | The proposed strategy (default-theme-scoped refinement behind the Phase 1 guard, no component extraction, no export changes) is what Phases 3A/3B and this pass actually shipped, and it is now verified rendered against Blanc for `.anki-card` and `.form-msg` as well as by structure. |
| IR-7 | **closed** | Superseded — with a single integrated branch there is no A/B contention for the debug bridge, and the isolated-renderer route (`.claude/launch.json` `renderer`, port 5174) works for probe-level verification without touching the app's ports. The §8 **narrow ~940×600** criterion was verified for the shell in Phase 2 (measured, real viewport); it remains unverified for the app screens. |
| **IR-5** | **open — needs a decision** | Adopt the shared `Notification` primitive in place of bespoke `status-banner` / `form-msg`. Now unblocked technically (both families are semantically correct after 3A + IR-8), but it is a **structural** migration of live call sites, not a CSS repoint, and `form-msg` alone spans AnkiContent, AiCardStudio, ProfileSwitcher and views/SettingsView. Recommendation: worth doing, but as its own reviewable pass with its own before/after capture — not folded into a CSS commit. |
| **IR-6 / IR-10** | **open — needs a decision** | Replace the bespoke `nov-modal` family with the shared `Dialog`. This is the last "second design system" left standing (master §6). It is genuinely harder than the others: `nov-modal*` is used by ReadingFinderContent **and** ProfileSwitcher **and** NovelsContent/NovelsView, and is overridden by protected `aero-apps.css`/`wired-apps.css` — so migrating it means either (a) moving all call sites at once and re-verifying Aero/Wired render the shared `Dialog` acceptably (the protected overrides would stop matching, which is the IR-3 failure mode in reverse), or (b) explicitly accepting two modal systems. `Dialog` also needs backdrop / close affordance / focus-trap / Esc parity confirmed before any swap. Recommendation: **(a)**, as a dedicated pass; do not attempt it as a side effect of anything else. |
