# Toolbox Completion Audit (Blanc Toolbox)

Working implementation ledger for the Blanc Toolbox layer. Updated 2026-07-17.
Scope: `src/shared/toolboxRegistry.ts`, `toolboxSettings.ts`, `toolboxShortcuts.ts`,
`toolboxUtilities.ts`, `toolboxFileSearch.ts`, `automationBuilder.ts`,
`src/renderer/components/blanc/BlancShell.tsx`, `src/renderer/toolboxSettings.ts`,
`src/renderer/blancMode.ts`, `src/renderer/keyboardShortcuts.ts` (Toolbox slice),
`src/renderer/components/CommandPalette.tsx` (toolbox mode), `src/main.ts`
(`registerToolboxIpc`, `registerBlancIpc`).

## How this audit was made

Every feature was traced from its UI entry point through state, IPC, persistence,
and error handling — not judged by its card or filename. Baseline before changes:
484/484 vitest passing.

## Architecture verdict (what is genuinely sound)

- **Single feature registry** exists (`toolboxRegistry.ts`): **56 modules** with
  stable IDs, category, status, capabilities, permissions, launch contexts, adapter
  strategy. The launcher, settings tool-visibility list, default-tool select, and
  shortcut validation all derive from it. Deferred modules are `adapter-needed` and
  render **no placeholder buttons** — only the honest Coverage table.

  Counts as of 2026-07-21, read off the registry rather than remembered:

  | Status | Count |
  |---|---|
  | `ready` | 35 |
  | `adapter-needed` | 20 |
  | `experimental` | 1 (`automation-builder`) |
  | **total** | **56** |

  36 have `appearsInBlanc`. This section previously said "50 modules", and
  `BLANC_REFINEMENT_PLAN.md` corrected that to "50 modules, 30 ready / 20 planned"
  — both are now stale, and the second used a `planned` status that does not exist
  in the schema (the 20 are `adapter-needed`). The ready count moved 30 → 35 on
  2026-07-21 when the study-native track shipped `furigana`, `counter-reader`,
  `conjugation-drill`, `review-forecast`, and `pitch-accent`.

  **Re-tier the deferred 20 by actual blocker.** Their `migrationNotes` still carry
  boilerplate claiming each needs a native adapter, which is false for most and
  misled a session on 2026-07-20. The accurate tiering is written up in
  `BLANC_REFINEMENT_PLAN.md` → "Explicitly deferred": the OCR trio and
  `shadowing-player` need only Electron built-ins the app already depends on;
  `pdf-toolkit` and `qr-barcode` are dependency-gated; `hotkey-manager` and
  `window-layouts` are blocked only at full scope; just `macro-recorder` and
  `text-expander` genuinely need a native module. Editing those 20 fields is still
  open — this note records where the truth lives in the meantime.
- **Central shortcut system**: all Toolbox commands live in
  `TOOLBOX_SHORTCUT_COMMANDS`, are merged into the app-wide `COMMAND_CATALOG`
  (rebindable, conflict-detected, import/export with ID migration, reserved-combo
  rejection), and are searchable in the command palette (`toolbox` mode,
  Ctrl+Shift+P). Registry-derived docs via `generateToolboxShortcutMarkdown()`.
- **Settings**: typed schema + definitions with keywords (searchable), sanitize on
  load, per-category reset, JSON import/export. Persisted in localStorage
  `jp-study.toolbox.settings.v1`.
- **Main-process IPC**: file search (symlink-skipping, scan/result caps, honest
  `truncated` flag), folder picker, automation-builder launcher (fixed allowlisted
  script path only — no arbitrary shell), Blanc window open/close/fullscreen.
- **Safety**: calculator eval is regex-gated to digits/operators (no identifiers
  reachable); automation launch runs only the repo's own `automation-builder.ps1`;
  file search never follows symlinks and never writes.

## Module status (all 50 registry entries)

> Counts updated 2026-07-20: the registry is now **30 ready / 20 planned**
> (`batch-converter` 07-19, `workspace-launcher` 07-20 promoted). The table below
> records the 2026-07-17 audit state and is kept as the historical trace.

| Feature | Status | Verdict after trace |
|---|---|---|
| clipboard | ready | Complete — ClipboardWidget + shared history store; Alt+7 |
| dictionary / grammar / reading-finder / resources / calendar | ready | Complete — shared views embedded lazily; open commands work |
| media / flashcards / statistics / epub-mining / anki-deck | ready | Complete — direct-tab routing from `toolbox:open-tool` works |
| mono-blocks | ready | Complete — playable, restart, game-over state |
| calculator | ready | Complete — pure helper + tests; cannot be disabled (guard keeps Toolbox non-empty) |
| unit-converter | ready | Complete — category-guarded conversions + tests |
| focus-timer | ready | Complete — countdown/stopwatch/presets/laps; Space/R commands registered |
| system-monitor | ready | Complete — `system:getMetrics` IPC, 3s poll, unavailable state |
| file-search | ready | Complete — caps honest, open/copy actions, error states |
| quick-notes | ready | Complete — local persistence, Ctrl+N command registered |
| hash-checker | ready | Complete — SHA-256 via WebCrypto, match/mismatch states |
| image-converter | ready | Complete — canvas convert, object-URL cleanup, JPEG white matte |
| automation-builder | experimental | Working launcher for the existing PowerShell tool; honest about scope |
| 30 `adapter-needed` modules (screen-recorder … context-search) | planned | Correctly hidden; listed in Coverage panel; no fake UI |

## Defects found (this audit) and their resolution

| # | Defect | Resolution |
|---|---|---|
| 1 | **11 dead settings keys** persisted but consumed by nothing: `openMode`, `showStatusMessages`, `showSuccessNotifications`, `showErrorNotifications`, `pinnedFirst`, `pinnedTools`, `useGlobalAppearance`, `monochromeIcons`, `commandHistoryLimit`, `confirmBeforeClearingHistory`, `advancedOptions` | Removed from schema + definitions ("every setting must work or be removed") |
| 2 | **Dead-but-rendered toggles**: `showTooltips`, `searchCommands`, `showCommandShortcutLabels` appear as checkboxes in Blanc Settings yet changed no behavior; `fuzzySearch`, `showCommandDescriptions`, `enabled` also unconsumed | Wired: tooltips gate `title` attrs; Toolbox search now includes runnable commands (with shortcut labels/descriptions per setting); fuzzy subsequence matching; `enabled=false` shows a disabled panel with re-enable |
| 3 | `sanitizeToolboxSettings` spread raw input over defaults, so **unknown/stale keys persisted forever** | Sanitize now rebuilds from known keys only |
| 4 | `restoreTabs` claimed "restore open Toolbox tabs" but restored only the last single tool | Full `openTabs` list persisted and restored |
| 5 | **Placeholder control**: disabled "Detach mini-window coming later" button in the active-tool header | Removed |
| 6 | **Dead commands**: `readingFinder.search`, `clipboard.copySelectedEntry` in the registry with no handler registered anywhere (unfulfillable bindings in Settings → Shortcuts) | Removed from registry + ID-migration entries added so old exports import cleanly; re-add when the views register real handlers |
| 7 | `toolbox.open` declared `global: true` but **no OS-level global shortcut was ever registered** — it only worked inside the app | Main now registers a real `globalShortcut` (driven by the user's current binding via IPC; graceful fallback when the accelerator is taken) |
| 8 | `rememberWindowBounds` setting had no backing implementation | Blanc window size persisted in main (userData) and restored on open, gated by the setting |
| 9 | `TOOLBOX_SHORTCUTS.md` was a second, manually synced list | Regenerated from the registry generator; the settings panel already exposes live generated docs |

## Known remaining limitations (honest, not hidden)

- 20 `adapter-needed` modules remain planned and stay invisible in the launcher by
  design. **Correction (2026-07-20):** "each needs a native adapter" was wrong and
  misled a later session. Only `macro-recorder` and `text-expander` genuinely
  require a native module (global input hooks); `hotkey-manager` and
  `window-layouts` are blocked only for *other* apps' windows. The OCR cluster is
  already reachable — `tesseract.js` is installed and `mangaOcr:recognizeImage` is
  a general data-URL → text endpoint. See `BLANC_REFINEMENT_PLAN.md` for the
  re-tiering by actual blocker.
- Blanc quick notes and Blanc memory are intentionally separate from Study OS
  memory (documented in the UI).
- `restoreLastTool`/`restoreTabs` persistence is localStorage (renderer-local),
  consistent with the rest of the app's storage model.
- Global shortcut registration can fail if another app owns the accelerator; the
  in-app binding still works and the failure is reported to the renderer.
- System monitor exposes CPU/RAM/uptime/battery/browser-storage only; GPU and
  process lists are adapter work (stated in the panel).
- Command search inside the Toolbox launcher covers Toolbox commands; full
  app-wide search remains the command palette's job (Ctrl+Shift+P / Ctrl+P).

## Verification evidence (final pass, 2026-07-17)

- `vitest run`: **487/487 passing, 51 files** (baseline before changes: 484; +3 new
  regression tests: stale-key drop, type-mismatch rejection, no-dead-toggle
  definition parity).
- `vite build`: clean (only the repo's pre-existing chunk-size warnings).
- `esbuild --bundle src/main.ts`: resolves and compiles (exit 0; the
  `import.meta`/`createRequire` warnings are the repo's established main-ESM
  pattern, identical before this work).
- `eslint` on all touched files: **no new errors.** The reported "parsing errors"
  in `toolboxSettings.ts` / `toolboxShortcuts.ts` are the pinned TypeScript 4.5
  eslint parser choking on pre-existing `satisfies` expressions (documented
  environment issue in TASKS.md; lines untouched by this pass).
- **Boot smoke test**: full `npm start`, 90s capture — zero renderer errors;
  tokenizer/highlight self-tests pass; only the standard dev-mode CSP warning.
- `validateToolboxShortcutRegistry()` remains `ok` (enforced by unit test), with
  every remaining registered command backed by a real handler:
  `toolbox.*` via `dispatchToolboxCommand`, `focusTimer.*` / `quickNotes.newNote`
  / `automation.runSelected` via `registerCommandHandler` in their panels.

## Files changed in the completion pass

- `src/shared/toolboxSettings.ts` — removed 11 dead keys; strict known-key sanitize
- `src/shared/toolboxShortcuts.ts` — removed 2 handler-less commands (documented)
- `src/shared/TOOLBOX_SHORTCUTS.md` — regenerated table + removal note
- `src/shared/__tests__/toolboxSettings.test.ts` — 3 new regression tests
- `src/renderer/components/blanc/BlancShell.tsx` — wired `enabled`, `showTooltips`,
  `fuzzySearch`, `searchCommands`, `showCommandShortcutLabels`,
  `showCommandDescriptions`; full open-tab restore; removed placeholder detach
  button; exposed `rememberSidebarState`/`rememberWindowBounds`/`fuzzySearch`/
  `showCommandDescriptions` controls; no-match empty state for search
- `src/renderer/keyboardShortcuts.ts` — global-shortcut sync to main;
  bounds-aware `toolbox.open`
- `src/renderer/blancMode.ts` — `rememberWindowBounds`-aware open
- `src/main.ts` — `blanc:setGlobalShortcut` IPC (validated accelerator, modifier
  required, graceful in-use failure, `will-quit` cleanup); Blanc window size
  persisted to userData on close and restored when no explicit size is passed
- `src/preload.ts`, `src/renderer/window.d.ts` — `blancSetGlobalShortcut` bridge
