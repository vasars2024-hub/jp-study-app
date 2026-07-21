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
- **Account B independent re-verification (prep, 2026-07-21):** Vitest 946/946 ✓ · i18n 3976 keys clean ✓ · tsc 1291 total / **9 in `src/`** ✓ · ESLint 65 errors + 171 warnings ✓ — all four match the accepted baseline exactly. Correction to the attribution above: the 1282 vendored errors are dominated by `@types/node` (854), `lifecycle-utils` (158) and `node-llama-cpp` (~190); `@huggingface/transformers` contributes only 28. Total is correct; the package attribution is not. None of the 9 `src/` errors are in Account B-owned screens.

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
| _(none yet)_ | | | | | |
