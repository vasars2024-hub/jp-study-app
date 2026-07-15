# Phase 4.5 Implementation Plan

Original planning artifact. Implementation is now in progress; milestone specs
below are preserved as the acceptance record.

## Current Progress

Completed:

- M0 - Audit and plan.
- M1 - Grammar Proof Application.
- M2 - Aero Materials and Contrast.
- M3 - Desktop, Taskbar, and Start Menu.
- M5 - Grammar Completion and Immersion Polish.
- M6 - Flashcards Study Deck Studio.
- M7 - Settings Aero Control Center.
- M8 - EPUB Library And Reader.
- M9 - CSV And Calendar.
- M10 - Media, Anki, And Dictionary Corrections.
- M11 - Representative Original Icon Set.
- M12 - System-Wide Consistency Pass.
- M13 - QA And Completion Report.

M7 result:

- `SettingsApp` now uses Aero-only `AppChrome` with File/View/Page menus,
  status fields, and a compact command strip.
- The default Settings presentation remains on the existing render path.
- Aero Settings pages now use denser property-sheet styling, compact home
  status/action lists, tighter nav, and native control-panel proportions.

M8 result:

- `LibraryView` now has an Aero-only three-pane library manager: shelf tree,
  central item list, and details inspector.
- Default Library keeps the existing shelf/card interaction.
- `NovelReader` now has Aero-only app menus and status fields while preserving
  the opaque reader surface and existing reader controls.
- Reader and collection chrome are tighter under Aero without changing EPUB,
  PDF, lookup, bookmark, or flashcard collection logic.

M9 result:

- `CsvEditorPanel` now uses a grid-first Aero spreadsheet surface with compact
  command rails, full-height virtual grid, and denser preview/sidebar behavior.
- `CalendarView` now has an Aero-only three-pane organizer frame: navigation
  rail, central calendar canvas, and schedule inspector.
- Default CSV and Calendar behavior remains on the existing render path and
  data logic is unchanged.

M10 result:

- `MediaView` now has Aero-only native menu/status chrome for file, subtitle,
  and library commands.
- Media, Anki, and Dictionary now have targeted Aero density/layout corrections
  so their interiors are less like chrome-wrapped Study OS pages.
- Anki keeps its existing profile, AnkiConnect, mapping, manual-add, and card
  preview logic; Dictionary keeps its existing lookup and language logic.

M11 result:

- Desktop, Start, and taskbar icon containers now carry app identity classes.
- Aero shell CSS gives the existing original SVG glyphs glossy, app-specific
  color plates and stronger small-size rendering.
- No external icon artwork, Microsoft assets, anime assets, or copied branding
  were introduced.

M12 result:

- Remaining decorative emoji and fullwidth add glyphs were removed from touched
  renderer data/UI surfaces and replaced with neutral text ids, ASCII controls,
  or existing vector icons.
- Widget, mini-player, Immersion favorite, and secret Aero flash affordances now
  avoid decorative text glyphs while preserving their existing behavior.
- A renderer-wide pictograph scan now only reports text arrows/prose references,
  not decorative emoji or the fullwidth add glyph.

M13 result:

- `src/PHASE_4_5_COMPLETION_REPORT.md` maps the original success criteria to
  implementation evidence, verification results, known pre-existing warnings,
  and remaining manual screenshot QA.

Latest verification:

- `npx eslint src/renderer/components/settings/SettingsApp.tsx src/renderer/components/settings/SettingsHome.tsx`
- `npx eslint src/renderer/views/LibraryView.tsx`
- `npx eslint src/renderer/components/CsvEditorPanel.tsx src/renderer/views/CalendarView.tsx` - passed with two existing CsvEditorPanel non-null assertion warnings.
- `npx eslint src/renderer/views/AnkiView.tsx src/renderer/views/DictionaryView.tsx`
- `npx eslint src/renderer/data/resources.ts src/renderer/data/grammar/guides.ts src/renderer/theme/SecretAeroTrigger.tsx src/renderer/views/AnkiView.tsx src/renderer/components/ReaderSettingsPanel.tsx src/renderer/views/GrammarView.tsx src/renderer/views/LibraryView.tsx src/renderer/views/SettingsView.tsx src/renderer/components/settings/pages/DisplayPage.tsx src/renderer/widgets/music.tsx src/renderer/components/WidgetGallery.tsx src/renderer/views/ImmersionView.tsx`
- `npm test` - 19 files passed, 151 tests passed.
- `npx vite build --config vite.renderer.config.ts` - passed with pre-existing
  CSS minifier/chunk-size warnings.
- `npx eslint src/renderer/components/DesktopShell.tsx` remains blocked by
  pre-existing issues: missing `react-hooks/exhaustive-deps` rule and old
  unused variable warnings.
- `npx eslint src/renderer/views/NovelReader.tsx` remains blocked by
  pre-existing lint errors: missing `react-hooks/exhaustive-deps` rule plus old
  empty-arrow-function findings.
- `npx eslint src/renderer/views/MediaView.tsx` remains blocked by a
  pre-existing missing `jsx-a11y/media-has-caption` rule reference.

Next unfinished milestone: none. Phase 4.5 is complete as a code and
documentation pass.

## Global Rules

- Keep changes inside `src/`.
- Preserve the existing desktop shell, window manager, theme engine, material boundary, app registry, persistence, IPC, services, and performance safeguards.
- Use the existing `data-materials="aero"` / `useAeroMaterials()` boundary for Aero-only presentation.
- Do not fork business logic by theme.
- Do not copy Microsoft, Windows, anime, or franchise assets.
- Remove decorative emoji from touched UI surfaces.
- Verify default Study OS remains visually unchanged.

## Milestone Plan

Each milestone is also a recommended commit boundary. Screenshot checkpoints should include Secret OS 4:3 and Native Display where the surface is relevant.

### M0 - Audit And Plan

- Objective: finish visual audit and implementation plan.
- Systems reused: repository inspection only.
- Likely files: `src/PHASE_4_5_VISUAL_AUDIT.md`, `src/PHASE_4_5_IMPLEMENTATION_PLAN.md`.
- Structural result: documented preserve/reconstruct boundary and milestone order.
- Visible result: none.
- Risks: plan can drift if implementation discovers hidden coupling.
- Tests: none required beyond file review.
- Screenshot checkpoint: current supplied screenshots.
- Acceptance: plan approved before code.

### M1 - Grammar Proof Application

- Objective: prove structural Aero re-authoring with Grammar Explorer.
- Systems reused: grammar data, search/filter state, Tatoeba lookup, keyboard/accessibility patterns, UI primitives.
- Likely files: `src/renderer/views/GrammarView.tsx`, `src/renderer/theme/aero-apps.css`, possibly `src/renderer/styles.css`.
- Structural result: `AppChrome`, real menus, toolbar, navigation tree, resizable list/detail panes, status bar.
- Visible result: no more large filter-card/detail-card silhouette; reads as native Grammar Explorer.
- Risks: keeping default Study OS unchanged while adding Aero branch.
- Tests: `npm test`; manual grammar search/filter/example lookup.
- Screenshot checkpoint: Grammar window in 1024x768, 1280x960, 1600x1200, Native Display.
- Acceptance: grayscale layout differs meaningfully from default Grammar view.

### M2 - Aero Materials And Contrast

- Objective: fix pale-blue wash and establish material hierarchy.
- Systems reused: theme tokens and existing material CSS.
- Likely files: `src/renderer/theme/frutiger-aero.css`, `src/renderer/theme/aero-shell.css`, `src/renderer/theme/aero-apps.css`.
- Structural result: no app logic changes.
- Visible result: glass frames, opaque work surfaces, stronger selected/focused states, active/inactive separation.
- Risks: global Aero changes can regress multiple app surfaces.
- Tests: `npm test`; manual pass through major windows.
- Screenshot checkpoint: multi-window desktop before/after.
- Acceptance: chrome/workspace separation remains clear even in grayscale.

### M3 - Desktop, Taskbar, And Start Menu

- Objective: make the shell feel like a personal compact desktop OS.
- Systems reused: `DesktopShell`, app registry, pinned icons, desktop prefs, tray hooks.
- Likely files: `src/renderer/components/DesktopShell.tsx`, `src/renderer/theme/aero-shell.css`, `src/renderer/styles.css`, `src/renderer/components/Icons.tsx`.
- Structural result: Start menu moves from grid launcher to two-column organization using existing actions.
- Visible result: compact taskbar, iconic Start control, stronger tray/clock, denser desktop icons.
- Risks: Start drag-to-desktop and taskbar focusing must remain intact.
- Tests: pin/unpin apps, drag Start app to desktop, switch desktops, minimize/restore.
- Screenshot checkpoint: full Secret OS desktop and Start menu.
- Acceptance: Start menu organization is visibly two-column and taskbar proportions are compact.

### M4 - Window System And Shared Controls

- Objective: strengthen active/inactive windows and shared control grammar.
- Systems reused: floating window manager, rAF drag/resize, UI primitives.
- Likely files: `src/renderer/components/DesktopShell.tsx`, `src/renderer/theme/aero-shell.css`, `src/renderer/theme/aero-apps.css`, `src/renderer/components/ui/*`.
- Structural result: no replacement window manager; possible control glyph cleanup only.
- Visible result: active window glow/depth, subdued inactive windows, compact toolbars/menus/dialogs.
- Risks: excessive blur or shadow can hurt performance.
- Tests: drag/resize/maximize/pop-out, reduced transparency, reduced motion.
- Screenshot checkpoint: overlapping active/inactive windows.
- Acceptance: active and inactive windows are immediately distinguishable.

### M5 - Grammar Completion And Immersion Polish

- Objective: finish Grammar Explorer and make Immersion a native browser workspace.
- Systems reused: Grammar from M1; Immersion webview/reader/sites/stats/lookup.
- Likely files: `src/renderer/views/GrammarView.tsx`, `src/renderer/views/ImmersionView.tsx`, `src/renderer/theme/aero-apps.css`, `src/renderer/styles.css`.
- Structural result: Immersion gets menu/status chrome and resizable sites/history rail.
- Visible result: Grammar and Immersion both look like desktop software without relying on color.
- Risks: webview sizing and focus behavior.
- Tests: navigate URLs, reader mode, focus mode, save site, export to library.
- Screenshot checkpoint: Grammar and Immersion in windowed and maximized states.
- Acceptance: Immersion remains functionally identical but visually denser and more native.

### M6 - Flashcards Study Deck Studio

- Objective: replace dashboard overview with deck studio layout.
- Systems reused: deck stores, saved words, review engine, import/export, mining, CSV, AI studio.
- Likely files: `src/renderer/views/FlashcardsView.tsx`, `src/renderer/components/DeckImportPanel.tsx`, `src/renderer/theme/aero-apps.css`, `src/renderer/styles.css`.
- Structural result: left deck tree, center card/source list, right inspector, import/mining task pane/dialog entry points.
- Visible result: no giant import/mining/study stack on the home screen.
- Risks: review/mining modes are complex; avoid moving logic.
- Tests: import deck, folder operations, start review, mark known, export CSV.
- Screenshot checkpoint: Flashcards overview, review, import/mining entry.
- Acceptance: reads as Study Deck Studio in grayscale.

### M7 - Settings Aero Control Center

- Objective: compact settings into alternate-2007 Control Center.
- Systems reused: settings registry, search, routing, controllers, persistence.
- Likely files: `src/renderer/components/settings/SettingsApp.tsx`, `src/renderer/components/settings/pages/*`, `src/renderer/theme/aero-apps.css`, `src/renderer/styles.css`.
- Structural result: category tree plus property pages; reduce large cards and repeated explanations.
- Visible result: searchable Control Panel feel.
- Risks: many pages and concurrent dirty files already exist in settings areas.
- Tests: settings search, deep links, save/persist display/desktop/lockscreen settings.
- Screenshot checkpoint: Lockscreen, Display, Profile/Dictionary, Advanced pages.
- Acceptance: common settings fit densely without hiding controls.

### M8 - EPUB Library And Reader

- Objective: complete library/reader native transformation while preserving reading quality.
- Systems reused: library import, reader settings, lookup, highlighting, mining, bookmarks.
- Likely files: `src/renderer/views/LibraryView.tsx`, `src/renderer/views/BookReader.tsx`, `src/renderer/components/ReaderCollectionPanel.tsx`, `src/renderer/theme/aero-apps.css`.
- Structural result: library tree/list/metadata inspector; compact reader chrome.
- Visible result: library as desktop manager, reader surface opaque and calm.
- Risks: reader regressions and text readability.
- Tests: open EPUB, lookup word, highlight, save flashcard, change typography.
- Screenshot checkpoint: library and reader in 4:3 and Native Display.
- Acceptance: reading surface remains more readable than decorative.

### M9 - CSV And Calendar

- Objective: finish spreadsheet and organizer composition.
- Systems reused: CSV virtualization/transforms/history; calendar event data/views/modals.
- Likely files: `src/renderer/components/CsvEditorPanel.tsx`, `src/renderer/views/CalendarView.tsx`, `src/renderer/theme/aero-apps.css`, `src/renderer/styles.css`.
- Structural result: CSV grid dominates; Calendar gains navigator/list/inspector.
- Visible result: spreadsheet and organizer, not dashboards.
- Risks: virtualization and calendar modal layout.
- Tests: paste/open CSV, scroll large grid, edit cells, event create/edit.
- Screenshot checkpoint: CSV with preview, month/week/day calendar.
- Acceptance: grid/calendar workspace dominates app bodies.

### M10 - Media, Anki, And Dictionary Corrections

- Objective: fix chrome-only results in remaining high-visibility apps.
- Systems reused: media library/playback, Anki profile/field mapping, dictionary lookup/mining.
- Likely files: `src/renderer/views/MediaView.tsx`, `src/renderer/views/AnkiView.tsx`, `src/renderer/views/DictionaryView.tsx`, `src/renderer/components/DictionaryResults.tsx`, `src/renderer/theme/aero-apps.css`.
- Structural result: classify each as transformed/partial/chrome-only, then correct biggest gaps.
- Visible result: denser lists, inspectors, command placement.
- Risks: AnkiConnect and media workflows need careful manual checks.
- Tests: dictionary lookup/save, Anki create, media open/play/download where available.
- Screenshot checkpoint: each app in Secret OS.
- Acceptance: no priority app is merely a blue card page with menu chrome.

### M11 - Representative Original Icon Set

- Objective: validate original XP/Vista/Frutiger-inspired icon direction.
- Systems reused: existing `Icon` component and app registry.
- Likely files: `src/renderer/components/Icons.tsx`, `src/renderer/theme/aero-shell.css`, maybe `src/renderer/styles.css`.
- Structural result: no app logic changes.
- Visible result: coherent Start/taskbar/desktop/toolbar icon samples.
- Risks: over-detailing small icons; copyright similarity.
- Tests: inspect at desktop, Start, taskbar, toolbar, menu sizes.
- Screenshot checkpoint: desktop and Start menu.
- Acceptance: icons are original, legible, and more personal than line glyphs alone.

### M12 - System-Wide Consistency Pass

- Objective: remove visual seams across shell/apps.
- Systems reused: all systems.
- Likely files: mostly Aero CSS and small presentation fixes in touched app views.
- Structural result: clean duplicated actions where menus/toolbars own commands.
- Visible result: consistent density, contrast, control states, no pale-blue wash.
- Risks: accidental default-theme leakage.
- Tests: `npm test`, `npm run lint` if feasible, manual default-theme comparison.
- Screenshot checkpoint: desktop with several windows, Start menu, each priority app.
- Acceptance: Secret OS is recognizable without title bars/wallpaper/colors.

### M13 - QA And Completion Report

- Objective: document results, gaps, and Phase 5 readiness.
- Systems reused: test scripts and manual screenshot set.
- Likely files: `src/PHASE_4_5_COMPLETION_REPORT.md` or equivalent inside `src/`.
- Structural result: no product changes unless small QA fixes are found.
- Visible result: screenshot comparison evidence.
- Risks: incomplete screenshots or missed default-theme regression.
- Tests: `npm test`, targeted manual checks, 4:3 and Native Display, reduced motion/transparency.
- Screenshot checkpoint: full final set.
- Acceptance: report maps each success criterion to evidence or a deferred item.

## First Implementation Step After Approval

Start with M1: Grammar Proof Application.

Implementation outline:

1. Add Aero-only Grammar Explorer presentation selected through `useAeroMaterials()`.
2. Preserve existing non-Aero `GrammarView` DOM.
3. Add `AppChrome` menus and status fields.
4. Add compact toolbar for back/forward/search/level/favorite/study/display actions.
5. Use `SplitPane` for navigation/list/detail composition.
6. Add Aero-scoped CSS for native rows, detail article, attached tabs, and status density.
7. Run `npm test`.
8. Capture screenshots for Grammar in 4:3 and Native Display.

## Plan Verdict

Ready with revisions.

Approval should authorize M1 only first. Broader shell/material work should wait until the Grammar proof visibly succeeds.
