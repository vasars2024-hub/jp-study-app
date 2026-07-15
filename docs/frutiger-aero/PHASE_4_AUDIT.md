# Phase 4 Audit — XP–Aero Native Application Transformation

Focused audit for Phase 4 of the Frutiger Aero Secret OS: transforming application
interiors from modern dashboard grammar into native mid-2000s desktop software
(XP ergonomics, Vista materials, Frutiger Aero atmosphere) — scoped strictly to
the secret Aero theme. Companion document: `PHASE_4_IMPLEMENTATION_PLAN.md`.

Audit method: ~15 high-value files/scans (per the Phase 4 brief's exploration
budget). The repository is the technical source of truth; where the brief's
assumptions diverged from the code, this audit records the divergence.

---

## 1. What exists and is mature (extend, never replace)

- **Theme Engine** — `src/renderer/theme/engine.ts`: theme registry, `data-theme`
  + `data-materials` stamping on `<html>`, `assetPack` refs, hidden themes,
  versioned migration hook. The secret Aero theme is a hidden theme with
  `materialSet: 'aero'`.
- **Secret boundary** — every Aero rule is scoped `:root[data-materials='aero']`
  (`theme/aero-shell.css`, ~142 lines, plus ~10 scoped blocks in `styles.css`).
  With the attribute absent, the default Study OS is byte-for-byte unchanged.
  **This is the exact mechanism Phase 4 extends to application interiors.**
- **Virtual Display** — `AeroViewport` in `src/renderer/App.tsx`: a fixed
  1280×960 logical frame with `transform: scale(...)`, pass-through outside Aero
  (documented in `src/VIEWPORT_ARCHITECTURE.md`). Applications are already
  viewport-agnostic. **Divergence from brief:** internal sizes 1024×768 /
  1280×960 / 1600×1200 do not exist — the virtual display is always 1280×960
  logical; only the outer scale varies. Acceptance gates are re-grounded
  accordingly. There is currently **no Native-Fill toggle inside Aero**
  (spec/repo gap; small presentation-layer addition planned in M3).
- **Hosts** — `FloatingWindow` (`fwin`) inside `DesktopShell.tsx`; borderless
  pop-outs via `?popout=<section>` + `PopoutChrome` (App.tsx); FocusShell;
  MiniShell; lockscreen window; companion host window. `AppSection.tsx` is the
  canonical application inventory (17 sections + desktop-coupled sticky notes)
  and renders identically in desktop windows and pop-outs.
- **UI primitives** (Phase 1 · M5, `src/renderer/components/ui/`): Button,
  IconButton, Surfaces, Input, Select, Checkbox, Toggle, Slider, SearchBox,
  Toolbar (+Spacer/Separator), Tabs, Progress, Tooltip, Dialog (focus trap,
  Escape, labelled), Window, Toast, ContextMenu, Sheet, Sidebar, TreeView,
  Dropdown, Notification, Breadcrumb. Standalone `VirtualList.tsx` /
  `VirtualGrid.tsx` beside them.
- **Settings** — registry-driven (`components/settings/settingsRegistry.ts`:
  nav groups, advanced flags), 14 pages, search, recents, deep-linking
  (`focusSettingId`), keyboard command routing. The information model is mature;
  Phase 4 transforms presentation only.
- **Sound / boot** — `audio/soundEngine` (packs + semantic categories, silent
  default pack) + `shellSounds.ts` (routes `os:open`, menu toggles, toasts) +
  `BootScreen.tsx` + `shell/AeroBootOverlay.tsx` (soft reboot: ~240 ms theme
  swap behind a branded splash; reduced motion shortens it; exit is instant).
- **Git** — conventional commits (`feat(phase3): M7 — …`). Phase 4 uses the
  same style with a `(phase4)` scope.

## 2. What currently breaks the Secret OS illusion

1. **Zero UI-primitive adoption in applications.** Only `DesktopShell`,
   `QuickSettings`, and `NotificationCenter` import from `components/ui`. All
   app views use bespoke class vocabularies (`flash-*`, `csv-editor-*`, `cal-*`,
   `nov-*`, `lib-*`, `music-*`, …) styled in the 14,413-line `styles.css`
   monolith, sharing only `.btn` / `.view-head` / `.muted` atoms.
2. **19 native `confirm()` calls across 12 files** — DesktopShell,
   FlashcardsView, LibraryView, StatisticsView, SettingsView, ShortcutSettings,
   PlaylistEditor, MediaLibraryActions, and four settings pages. No `prompt()`
   or `alert()` calls found.
3. **Duplicate modal systems** — csv-editor has its own `FindReplaceModal` /
   `ImportMergeModal`; Library and Novels have bespoke backdrop modals; none use
   `ui/Dialog`.
4. **No menu bars, status bars, split panes, or list/details grammar anywhere.**
   Applications are header + scrolling sections — SaaS grammar.
5. **App interiors are identical in both OSes.** Aero windows are glass; their
   contents are unmistakably the Fluent app.

## 3. Repository policy constraints (CLAUDE.md / AGENTS.md)

- Default aesthetic is Windows 11 Fluent, dark deep-red, minimal — the default
  Study OS must stay that way; the XP–Aero grammar is Aero-scoped only.
- No decorative emojis anywhere.
- Code changes stay in `src/`; documentation follows the Phase 1–3 precedent of
  `docs/frutiger-aero/`.
- Never break the desktop shortcut grid, window drag layer, or taskbar shell.
- Heavy datasets stay async / virtualized.

## 4. Key architectural decision — XP chrome without forking

Structural chrome (menu bar, status bar) cannot be CSS-only (it is new DOM), but
must not appear in the default Study OS (CLAUDE.md "Window Minimalism" + the
phase boundary). Resolution: **one shared `AppChrome` host component** in
`components/ui/` that consults ThemeContext (`materialSet === 'aero'`) and
renders the menu-bar / status-bar frame only in Aero, passing app content
through unchanged otherwise. One theme seam in one shared component — each
app's implementation, state, and logic stay single-sourced; no per-app forks;
no display-mode branches (the forbidden `if (classic4x3Mode)` concerns the
viewport; the theme seam is the sanctioned theme/material/edition boundary).
Density and materials remain pure CSS under `:root[data-materials='aero']` in a
new `theme/aero-apps.css`.

## 5. Application Status Matrix

| Application (section) | Files | Current Status | Required Work | Priority | Defer? |
|---|---|---|---|---|---|
| Flashcards | `views/FlashcardsView.tsx` (1085) | Needs Structural Transformation | Menu bar, deck tree, card list + preview pane, study workspace, status bar; keep review/session/storage logic | P1 (showcase) | No |
| CSV Editor | `components/CsvEditorPanel.tsx` (915) + `csv-editor/*` | Mostly Native grid / chrome needs transformation | Menu bar, status bar (rows/selection), migrate 2 bespoke modals to ui/Dialog, keep virtualization; no ribbon | P1 | No |
| Settings | `components/settings/*` (registry, 14 pages) | Mostly Native (model) / Needs Polish (presentation) | Control-Center density, property-style dialogs, tree-ish nav; preserve registry/search/deep-links | P1 | No |
| EPUB Library | `views/NovelsView.tsx` (358), `views/LibraryView.tsx` (639) | Needs Structural Transformation | Library mode: nav/collections pane, list/details, compact toolbar, status bar | P2 | No |
| EPUB Reader | `views/NovelReader.tsx` (2211), `MangaReader` | Mostly Native (mature reading stack) | Aero chrome for toolbars/panels only; reading surface stays opaque; verify `BookReader.tsx` (886) usage | P2 | No |
| Calendar | `views/CalendarView.tsx` (482) | Mostly Native — has Month/Week/Day/Agenda, CRUD, reminders (brief's assumption outdated) | Details pane, quick-add via ui/Dialog, density, status info | P2 | No |
| Notes | Sticky notes inside `DesktopShell.tsx` | Not Present (as standalone app) | Polish sticky-note Aero skin only; defer Knowledge Notebook | P3 | Product deferred |
| Music | `views/MusicView.tsx` (527) | Needs Polish (has vlist, toolbar-ish rows) | Grammar/density alignment, toolbar/status adoption | P3 | No |
| Media | `views/MediaView.tsx` (763) | Needs Polish | Same as Music | P3 | No |
| Dictionary | `views/DictionaryView.tsx` (74) + `DictionaryResults` | Needs Polish | Density + search-field alignment | P3 | No |
| Anki | `views/AnkiView.tsx` (428) | Needs Polish | Density + dialog standardization | P3 | No |
| Translate | `views/TranslateView.tsx` (189) | Needs Polish | Density pass | P3 | No |
| Grammar | `views/GrammarView.tsx` (360) | Needs Polish | Density pass or defer | P4 | Phase 5 if not trivial |
| Statistics | `views/StatisticsView.tsx` (187) | Needs Polish | Density pass; confirm() removal in M2 | P4 | Phase 5 if not trivial |
| Resources | `views/ResourcesView.tsx` (113) | Needs Polish | Batch pass | P4 | Phase 5 if not trivial |
| Immersion | `views/ImmersionView.tsx` (722) | Needs triage | Audit in M11; likely defer | P4 | Likely Phase 5 |
| Noctis (city) | placeholder panel in AppSection | Not Present (real module: `src/main/city`, separate track) | None | — | Out of scope |
| Visualizer / MusicWidget | widget components | Already Native enough (canvas/widget) | None beyond widget-frame skin (Phase 2) | — | Yes |

## 6. Shared-System Findings

- **UI primitives**: accessible and token-driven, but minimal and unadopted by
  apps. Missing for the XP grammar: **MenuBar** (top-level menus + keyboard
  navigation), **StatusBar**, **SplitPane**, **compact FormRow**. Each is
  justified by ≥2 real applications (menu bar: Flashcards/CSV/EPUB/Calendar;
  status bar: same; split pane: Flashcards/EPUB/Settings; form rows:
  Settings/Calendar/CSV) — satisfying the shared-component rule.
- **Dialogs**: `ui/Dialog` is sound (focus trap, Escape, labelled, footer slot).
  Needs a promise-based `confirmDialog()` service + host so the 19 scattered
  `confirm()` calls can be replaced without local state plumbing. This is a
  shared behavior/accessibility fix benefiting both OSes (allowed by the phase
  boundary); styling follows the active theme.
- **Menus / context menus / tooltips**: `ui/ContextMenu` + `ui/Tooltip` exist;
  applications do not use them consistently. Standardize in M2.
- **App chrome**: none today. New `AppChrome` (Aero-gated via ThemeContext) is
  the single new shared layer.
- **Settings registry**: mature; source of truth for M5.
- **Routing**: `AppSection.tsx` is the canonical inventory and transformation
  boundary; identical component tree in both hosts.
- **Floating-window / pop-out hosts**: apps are plain fills today and assume
  neither host — `AppChrome` inherits this property by living inside
  `AppSection`'s children.
- **Sound engine**: semantic categories + silent default pack + `shellSounds.ts`
  wiring. Phase 4 extends the event map only; no authored assets.
- **Theme Engine**: needs zero structural change.
- **Virtual Display boundary**: fixed 1280×960 logical frame, CSS-gated. Apps
  stay container-responsive. An optional Native-Fill presentation toggle (class
  on `.os-viewport-stage`) is planned in M3 — presentation layer only, zero app
  logic.
