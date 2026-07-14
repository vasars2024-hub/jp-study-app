# Phase 4.5 Visual Audit

Planning artifact only. No implementation has been started.

## Evidence Reviewed

- Current-state screenshots: desktop, Flashcards, Grammar, Start menu, Immersion.
- Reference images were treated as design-principle references only, not source assets.
- Repository files inspected:
  - `src/renderer/App.tsx`
  - `src/renderer/components/AppSection.tsx`
  - `src/renderer/components/DesktopShell.tsx`
  - `src/renderer/components/ui/AppChrome.tsx`
  - `src/renderer/components/ui/MenuBar.tsx`
  - `src/renderer/components/ui/Toolbar.tsx`
  - `src/renderer/components/ui/SplitPane.tsx`
  - `src/renderer/components/ui/StatusBar.tsx`
  - `src/renderer/theme/frutiger-aero.css`
  - `src/renderer/theme/aero-shell.css`
  - `src/renderer/theme/aero-apps.css`
  - `src/renderer/views/GrammarView.tsx`
  - `src/renderer/views/FlashcardsView.tsx`
  - `src/renderer/views/ImmersionView.tsx`
  - `src/renderer/components/settings/SettingsApp.tsx`
  - `src/renderer/components/CsvEditorPanel.tsx`
  - `src/renderer/views/CalendarView.tsx`
  - `src/renderer/views/LibraryView.tsx`

## Honest Visual Diagnosis

The current Secret OS has useful foundations but does not yet read as a complete alternate operating system. It reads as a pale-blue modern React desktop with nostalgic chrome.

### Structural Problems

- Many priority apps keep the same modern web-page silhouette as the default Study OS: top explanatory copy, pill filters, large rounded sections, stacked dashboard blocks, and body-level action buttons.
- `GrammarView` is the clearest example. It has a list/detail shape, but the visual grammar is still card/list-card/detail-card rather than native explorer with command surfaces, navigation tree, dense list, and status information.
- `FlashcardsView` already uses `AppChrome`, but the main overview still stacks import, mining, study setup, recent cards, and explorer sections vertically.
- `SettingsApp` has the right two-pane foundation, but pages still rely on large property cards and roomy explanatory text.
- `ImmersionView` is structurally closest to native software, but the toolbar and side rail still need denser browser-style hierarchy and stronger status treatment.

### Material Problems

- The screenshots show pale blue applied to almost every layer: chrome, app bodies, panels, inputs, sidebars, and list items. This weakens depth and makes surfaces merge.
- `frutiger-aero.css` currently maps most core tokens into light sky-blue surfaces (`--bg`, `--panel`, `--panel-2`, `--sidebar`, `--chrome`), which explains the washed-out result.
- `aero-shell.css` adds glass, sheen, and blur, but active and inactive window distinction is still too weak in the screenshot because the frame/body relationship is mostly same-value blue.
- Work surfaces should become more opaque and neutral; glass should belong mostly to shell, frame, toolbar, menu, taskbar, Start shell, and selected system surfaces.

### Application-Layout Problems

- Menus exist in some apps (`FlashcardsView`, `CalendarView`, `CsvEditorPanel`, `LibraryView`, `AnkiView`, `DictionaryView`), but commands often remain duplicated as large page buttons.
- `GrammarView` has no `AppChrome`, no functional menu bar, no toolbar, no status bar, and no resizable panes.
- `FlashcardsView` needs a real Studio layout: deck tree or folder/source pane, central list/workspace, right inspector, and dialogs/task panes for import/mining.
- `SettingsApp` should become a compact Control Center with property pages, OK/Apply/Reset patterns where useful, and reduced card dependence.

### Shell Problems

- `DesktopShell` already has the correct systems to preserve: app registry, window manager, taskbar, Start menu, desktop icon persistence, widget framework, wallpaper/environment layers, and drag/resize performance safeguards.
- The Start menu markup is still a modern grid (`os-start-grid`, `os-start-tile`) rather than a two-column personal-computer menu with pinned/frequent apps on one side and system places/settings/actions on the other.
- Taskbar proportions are close, but current screenshots still show a broad, pale strip with chip-like buttons rather than an iconic compact system bar.
- Desktop identity is weak because default desktops start empty and the Start menu does most of the identity work. The desktop needs stronger personal visual presence without copying Windows or copyrighted art.

### Icon And Asset Problems

- `Icons.tsx` is clean and emoji-free, but the current line-glyph set lacks the saturation, dimensionality, and small-size personality expected from the XP/Vista/Frutiger direction.
- Start button has an original leaf mark in CSS, which is a good legal direction, but the broader icon language has not yet been validated across desktop, Start, taskbar, toolbar, and menu sizes.

## Preserve Versus Reconstruct Matrix

| Area | Preserve | Reconstruct | Reason |
| --- | --- | --- | --- |
| Desktop | `DesktopShell`, layout persistence, wallpaper/environment layers, widgets, drag/drop | Icon density, labels, personal defaults, wallpaper/UI balance | Current desktop is technically solid but visually under-personalized. |
| Taskbar | Taskbar state, open-window focusing/minimize behavior, tray hooks, clock prefs | Proportions, active item treatment, Start identity, tray density | Behavior works; the visual silhouette is still pale/chip-like. |
| Start menu | App registry, pin/drag-to-desktop behavior, search command, settings/quick/power actions | Two-column organization, system places/actions, compact row density | Current grid reads like app launcher, not XP-era Start menu logic. |
| Windows | Existing floating-window manager, drag/resize rAF performance, pop-out support | Active/inactive materials, control glyphs, titlebar depth, frame/body contrast | Window manager is valuable; visual distinction is not strong enough. |
| Shared controls | Existing UI primitives and scoped Aero CSS | Button/input/tab/list/tree/menu density and state hierarchy | Primitives are useful, but need stronger native desktop material rules. |
| Grammar | Grammar data, filters, search, Tatoeba lookup behavior | Aero Grammar Explorer presentation | Highest-leverage proof app; current layout matches screenshot failure. |
| Immersion | Webview, reader extraction, stats, sites store, lookup popups | Toolbar hierarchy, resizable rail, status bar, native history list | It is closest structurally; needs polish, not logic rewrite. |
| Flashcards | Deck/saved-word stores, review logic, EPUB mining, CSV tool, commands | Study Deck Studio layout, import/mining dialogs/task panes, inspector | Current overview remains a stacked dashboard. |
| Settings | Registry, search, deep linking, persistence, page controllers | Compact Control Center pages and property groups | Existing shell is right; page composition is too roomy/card-heavy. |
| Reader | EPUB/reader logic, lookup, highlighting, mining, bookmarks/settings | Library/reader chrome and library inspector layout | Reading surface must remain opaque and calm. |
| CSV | Virtual grid, transforms, import/export, edit history | Grid-dominant spreadsheet layout and formula/input bar | Logic is strong; grid should dominate over helper controls/cards. |
| Calendar | Event data, views, modal workflows | Organizer layout with navigator/list/inspector | Existing calendar is partly native but lacks desktop organizer framing. |
| Media | Playback/download/library logic | Native media library/browser command layout | Needs audit to avoid chrome-only completion. |
| Anki | Profile mapping, AnkiConnect flow, preview | Inspector/workbench composition if still card-heavy | Already has AppChrome but body may still read as cards. |
| Dictionary | Lookup/mining behavior, language modes | Dense dictionary article/list layout | Menu/status exist; result cards likely need native list/detail treatment. |

## Application Architecture Proposal

### Grammar

- Preserve: `GRAMMAR`, `GUIDES`, search/filter behavior, selected item state, `window.api.searchExamples`.
- Default presentation: leave current `GrammarView` behavior untouched for normal Study OS.
- Aero presentation: add an Aero-specific branch through `useAeroMaterials()` or a small `AeroGrammarExplorer` component selected at the material boundary.
- Commands: File, Edit, View, Grammar, Favorites, Study, Help; all commands should drive existing state or disabled placeholders only when no handler exists.
- Panes: left navigation tree, center sortable/filterable grammar list, right details pane.
- Dialogs: display options and example lookup status can stay inline initially; future favorites/study dialogs can be introduced when real behavior exists.
- Status: total points, filter, selected title, guide/grammar mode, example lookup state.

### Flashcards

- Preserve: `flashcardDeck`, saved words, review session logic, EPUB mining panels, CSV tool, AI studio, deck export.
- Default presentation: keep existing `FlashcardsView` for non-Aero.
- Aero presentation: create `AeroFlashcardsStudio` for overview only first; keep review/mining/CSV modes functional while moving import/mining into task pane/dialog surfaces.
- Commands: File, Edit, Deck, Study, Tools, Help.
- Panes: left deck tree/folders/sources, center card/deck table, right card/source inspector.
- Status: EPUB count, dictionary count, active folder/source, selected cards, review-ready count.

### Settings

- Preserve: `SettingsProvider`, registry, page routing, search, persistence, controllers.
- Aero presentation: retain two-pane shell but add property-page density and standard Apply/Reset/OK-like command placement where the app supports it.
- Panes: category tree, searchable property page, optional advanced section.
- Status: active page, changed settings where trackable, advanced mode.

### Immersion

- Preserve: webview/reader logic, sites IPC, stats, known-word highlighting, dictionary/translation popups.
- Aero presentation: wrap with browser-style command/status chrome and make the sites rail a resizable native pane.
- Commands: File, View, Navigate, Tools, Help.
- Panes: browser/reader surface plus sites/history/bookmarks rail.
- Status: URL/title, loading state, mode, saved/export/capture status.

### Reader And Library

- Preserve: import, EPUB parsing, reader settings, highlighting, mining, collection behavior.
- Aero presentation: library as collection tree/list/metadata inspector; reader as opaque reading surface with compact chrome.
- Status: item count, active collection, reading progress, lookup/mining state.

### CSV

- Preserve: virtualization, transforms, history, import/export.
- Aero presentation: grid-first spreadsheet with compact command bars, formula/input row, optional preview pane.
- Status: rows, columns, selection, dirty/autosave state.

### Calendar

- Preserve: event model, view modes, modal editing, reminders.
- Aero presentation: navigator/list/organizer surface with compact toolbar and optional event inspector.
- Status: date range, event count, overdue count.

## Visual-System Proposal

- Palette hierarchy: darkened glass-frame tint, pearl/ivory opaque work surfaces, pale blue-grey navigation panes, saturated aqua/green selection, restrained warm warning/destructive colors, stronger disabled text contrast.
- Glass hierarchy: desktop/taskbar/Start/window frame use glass; app work surfaces stay opaque; dense text never sits directly on glass.
- Typography: compact Segoe-style desktop UI; no hero-scale headings inside apps; tighter menu/list/status row type.
- Corners: windows moderate, controls small, menus/toolbars nearly square, list rows square/lightly rounded, cards only for actual cards.
- Shadows: stronger active window shadow/glow, weaker inactive shadow, less inner-card floating.
- Buttons/inputs: tactile bevel, compact heights, visible focus glow, enabled/disabled hierarchy, fewer pills.
- Tabs: attached tab strips, not detached segmented pills.
- Trees/lists: compact rows, selection gradient, keyboard focus, optional icons, status fields.
- Menus/toolbars: real command ownership, toolbar for frequent actions, menus for organization.
- Icon direction: original glossy aqua/green/red-accent study icons with small-size simplification, not Microsoft or anime assets.

## First Proof Application Recommendation

Choose Grammar first.

Reasons:

- It is visible in the supplied screenshots and clearly demonstrates the current failure mode.
- It has enough domain richness to prove a native explorer: navigation tree, list, details, examples, search, levels, guide mode, status.
- It has lower functional risk than Flashcards because there is less persistence and fewer import/review workflows.
- A successful Grammar proof will validate the Aero presentation-branch pattern before applying it to heavier apps.

## Verdict

Ready with revisions.

The repository already has the right infrastructure. The plan should revise Phase 4.5 around application-level presentation rewrites, starting with Grammar, then system material hierarchy, then Start/taskbar/window identity, then higher-risk apps.
