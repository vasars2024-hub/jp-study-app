# UI Migration Debt

Persistent ledger for the Study OS UI/UX refinement. Read with `UI_UX_REFINEMENT_MASTER_PLAN.md`.
Both agents update **only their own rows** where possible. On merge, keep **both** sides' rows (never drop one
during conflict resolution — see `UI_UX_INTEGRATION_PROTOCOL.md` §12). **Remove a row only after its work is
visually verified.** This file keeps the effort honest — it is where "we only did superficial global changes"
would show up.

## Coordination header (fill in at kickoff)

- Base commit SHA (both branches start here): `54fd5d99f07ce9af01e027003efdde98225606f3`
- Approved Phase 1 commit/tag: `d6b07c2` (`ui-phase1-approved`) — merged into `ui/app-screens` at integration
- Base branch: `grammarx/phase-1-5` (parent of canonical base: `4b846f1`)
- Backup branch (pre-stabilization HEAD): `backup/pre-ui-stabilization` → `4b846f1`
- Account A worktree (Core & Shell, `ui/core-shell`): `C:/Users/Arseniy/Projects/jp-study-app-core-shell`
- Account B worktree (App Screens, `ui/app-screens`): `C:/Users/Arseniy/Projects/jp-study-app-app-screens`
- Recovery artifacts: `C:/Users/Arseniy/Projects/jp-study-app-stabilization/`
- **Accepted pre-UI validation baseline (UI phases must NOT worsen):** Vitest 946/946 pass (94 files) · i18n pass · app launches · 0 runtime errors · **TypeScript 1291 pre-existing errors** (1282 vendored `@huggingface/transformers` d.ts + 9 src `satisfies` unsupported by pinned TS 4.5.5) · **ESLint 65 errors + 171 warnings** pre-existing. Do NOT upgrade TypeScript/ESLint/deps/lockfile. New errors in files a UI agent edits are blockers.
- Runtime asset validation: shimeji sprite loads (128×128) + renders live; city asset loads (512×512). Aero CSS + wallpaper resolve (full live theme switch not exercised to avoid disrupting the running session).
- **Account B independent re-verification (prep, 2026-07-21):** Vitest 946/946 ✓ · i18n 3976 keys clean ✓ · tsc 1291 total / **9 in `src/`** ✓ · ESLint 65 errors + 171 warnings ✓ — all four match the accepted baseline exactly. Correction to the attribution above: the 1282 vendored errors are dominated by `@types/node` (854), `lifecycle-utils` (158) and `node-llama-cpp` (~190); `@huggingface/transformers` contributes only 28. Total is correct; the package attribution is not. None of the 9 `src/` errors are in Account B-owned screens.
- Account A baselines captured (`debug/shots/ui-refinement/baseline/`): 01 study-os medium+overlap, 02 launcher,
  03 Settings home (cards/nav/quick-actions), 04 Blanc. Theme-regression before/after (classic-light,
  wired, aero) reproduced via `git stash` toggle at the token checkpoint.
- Accepted tooling baseline (A): vitest 946/946; i18n clean; tsc 1291 errors (0 in A-owned files);
  eslint 65 errors / 171 warnings; runtime error log 0.
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

## Integration requests (Account B → Account A)

Missing shared tokens/primitives/global changes B needs. A (or the integration pass) implements these in
A-owned files; B removes any temporary workaround once the shared change lands and is verified.

| # | Requested by | What's needed | Screen(s) blocked | Temp workaround in place | Status (`open`/`landed`/`removed-workaround`) | Notes |
|---|---|---|---|---|---|---|
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
