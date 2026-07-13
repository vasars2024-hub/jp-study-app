# Phase 4 Implementation Plan — XP–Aero Native Application Transformation

Executable milestone plan for Phase 4 of the Frutiger Aero Secret OS. Grounded
in `PHASE_4_AUDIT.md` (read it first — it records the current state, the status
matrix, and the key architectural decision). The repository is the technical
source of truth; `FRUTIGER_AERO_OS_VISION.md` §8 is the creative source of
truth ("an app must look like it was born in this OS, not ported into it").

**Direction:** Windows XP ergonomics and personality, refined through Windows
Vista materials and Frutiger Aero atmosphere. Not a pixel clone — an idealized
memory: clearer, smoother, more cohesive, more accessible, more atmospheric.

**Hard boundary:** all XP–Aero visual transformation is scoped to the secret
Aero theme (`:root[data-materials='aero']` for CSS; the `AppChrome` theme seam
for structural chrome). The default Study OS must remain visually unchanged,
except intentional shared behavior/accessibility fixes (M2). Do not fork
applications by theme. Do not add display-mode branches to applications.

**Ordering rationale:** shared grammar → dialogs/menus → shell → startup →
applications (Settings, Flashcards, EPUB, CSV, Calendar, Notes) → triage →
workflows → authenticity → QA. Revisions vs. the original brief: Calendar
downgraded to polish-scope (Month/Week/Day/Agenda already exist); no CSV
ribbon (menu bar + existing toolbar suffice); Notes is sticky-note polish only;
a small Native-Fill toggle is added in M3 to close a spec/repo gap; acceptance
gates re-grounded to the fixed 1280×960 virtual display.

One commit per milestone: `feat(phase4): M<n> — <summary>` (or `docs`/`fix`).
The working tree currently carries unrelated concurrent work (lockscreen
feature and others) — **stage only the files each milestone touches, by path**;
never `git add -A`.

---

## M0 — Audit + plan docs (this commit)

Land `PHASE_4_AUDIT.md` + `PHASE_4_IMPLEMENTATION_PLAN.md` in
`docs/frutiger-aero/` (Phase 1–3 precedent location).
**Commit:** `docs(phase4): M0 — audit + implementation plan`.

## M1 — Shared XP–Aero application grammar

- **Objective:** the design grammar + small shared layer everything else
  consumes.
- **Reuses:** `theme/tokens.css`, materials, motion, `ui/Toolbar`,
  `ui/TreeView`, `ui/Tabs`, ThemeContext.
- **New primitives** (in `components/ui/`, additive, no API breaks):
  - `MenuBar.tsx` — roving tabindex, Alt-key access, submenus reusing
    ContextMenu's positioning/key-nav patterns.
  - `StatusBar.tsx` — slots for fields + spring.
  - `SplitPane.tsx` — keyboard-resizable splitter.
  - `FormRow.tsx` — compact label/control row.
  - `AppChrome.tsx` — Aero-gated frame (menu bar above / status bar below app
    content in Aero; pure pass-through in every other theme).
- **New CSS:** `theme/aero-apps.css` — density tokens (row heights, toolbar
  metrics, tree indent, tab treatment), small radii for rows/toolbars/menus and
  moderate radii for shells, light bevel/gloss states, selection/focus/pressed/
  disabled states. Every selector carries the `data-materials='aero'` gate.
  Solid, readable work surfaces — no glass behind documents or data.
- **Preserved:** default OS visuals (nothing unscoped); existing primitive APIs.
- **Risks:** MenuBar accessibility (mitigate: follow ContextMenu's existing
  key-nav); accidental unscoped CSS (mitigate: check that every selector in
  aero-apps.css contains the gate).
- **Acceptance:** primitives render in isolation in both themes; default-theme
  DOM/visuals unchanged on theme toggle; reduced motion/transparency respected;
  full keyboard access on MenuBar/SplitPane.
- **Docs:** `XP_AERO_APPLICATION_LANGUAGE.md`.
- **Commit:** `feat(phase4): M1 — shared XP–Aero app grammar + chrome primitives`.

## M2 — Dialog / menu / tooltip standardization (before app work)

- **Objective:** one interaction system suite-wide, both themes.
- **Work:** promise-based `confirmDialog()` (+ optional input variant) service
  + `DialogHost`; replace all 19 native `confirm()` calls (12 files listed in
  the audit); migrate csv-editor `FindReplaceModal`/`ImportMergeModal`, the
  Library import modal, and the Novels modal onto `ui/Dialog`; adopt
  `ui/ContextMenu`/`ui/Tooltip` conventions; document Enter/Escape/default-
  action + progress/error-state conventions. No new modal architecture.
- **Preserved:** every dialog's behavior and data flow; default-theme dialog
  styling (token-driven).
- **Risks:** flow changes where `confirm()` was synchronous — audit each call
  site during migration.
- **Acceptance:** zero `confirm(`/`prompt(`/`alert(` matches in `src/renderer`;
  focus trap + Escape verified per dialog; both hosts (desktop window +
  pop-out).
- **Docs:** `APPLICATION_CHROME_AND_DIALOGS.md`.
- **Commit:** `feat(phase4): M2 — dialog/menu/tooltip standardization`.

## M3 — Narrow shell identity convergence (Aero-scoped polish only)

- **Objective:** shell reads as one XP–Vista hybrid next to transformed apps.
  No rebuild; CSS + emblem only.
- **Work:** aero-shell.css refinement — taskbar proportions/labels/restrained
  hover bloom; Start two-column XP density + Vista-style integrated search
  (existing Start architecture + app registry); original Start emblem
  (glass-leaf or luminous-book SVG in `Icons.tsx`; never the Windows logo, no
  emoji); title-bar/window-control states; tray/clock density; notification
  balloon skin. Add a **Native Fill toggle** for the Aero viewport (class on
  `.os-viewport-stage`, exposed via Quick Settings or Settings → Display;
  presentation layer only).
- **Preserved:** all taskbar/Start behavior, window manager, drag layer
  (CLAUDE.md safety rule — no DOM changes to drag surfaces).
- **Acceptance:** default OS shell pixel-identical; Aero Start/taskbar usable at
  stage scale < 1; Native Fill on/off correct.
- **Commit:** `feat(phase4): M3 — Aero shell identity convergence + native-fill toggle`.

## M4 — Startup + system-audio infrastructure polish

- **Objective:** the ten-step entry sequence — Study OS dims → transition →
  emblem → soft light/aurora → startup-sound event → welcome → 4:3 desktop
  resolves → taskbar/icons settle → environment layers fade in → ambient audio
  begins — built on `AeroBootOverlay` + `BootScreen` + environment fade-in +
  `ambientAudio`.
- **Work:** extend AeroBootOverlay sequencing (skippable on click/key; reduced
  motion collapses to a quick fade — current behavior preserved); extend
  `shellSounds.ts` event map (window close/minimize, dialog open, error) and add
  a `startup` semantic event; verify volume/mute routing through soundEngine.
  Silence / placeholders / licensed test assets only — the authored sound pack
  is Phase 5. Never recreate Microsoft Windows sounds.
- **Preserved:** instant Aero exit; safe no-op fallback when no pack is active.
- **Acceptance:** full sequence, skipped sequence, reduced motion, reduced
  transparency, Battery Saver; no sound pack = no errors.
- **Docs:** `STARTUP_AND_SYSTEM_AUDIO_INFRASTRUCTURE.md`.
- **Commit:** `feat(phase4): M4 — Aero startup sequence + sound-event map`.

## M5 — Settings → Control Center

- **Objective:** classic Control Panel structure with modern search and
  accessibility — presentation only.
- **Reuses:** `settingsRegistry.ts` (source of truth), SettingsNav/Search/Home,
  `FormRow`, `AppChrome`, `TreeView` (Personalization subtree where helpful),
  property-style dialogs via `ui/Dialog`.
- **Preserved:** registry, search, recents, deep-linking, advanced mode,
  persistence, keyboard navigation. No wall-of-controls regression.
- **Acceptance:** every page reachable via search + deep link in both themes;
  default theme unchanged; rows compact-not-cramped at 1280×960.
- **Commit:** `feat(phase4): M5 — Settings as Aero Control Center`.

## M6 — Flashcards → Study Deck Studio (showcase)

- **Objective:** menu bar (File/Edit/Deck/Study/Tools/Help), compact command
  bar, deck tree (left), card list + preview/details (SplitPane), study-session
  workspace, status bar (deck counts / due / session progress). EPUB-mining
  entry under Tools. No ribbon.
- **Preserved:** all review/session/scheduling logic, storage
  (`flashcardDeck.ts`, `savedWords.ts`), import/export, EPUB mining flow.
- **Risks:** largest interior rewrite — keep all state/handlers; replace only
  JSX structure and classes; behavior-first review.
- **Acceptance:** full gate battery (below); a study session completes
  identically; mining round-trip intact.
- **Commit:** `feat(phase4): M6 — Flashcards Study Deck Studio`.

## M7 — EPUB → Digital Library + Reader

- **Objective:** Library mode (NovelsView + LibraryView): collections/nav pane,
  list-or-cover + details pane, compact toolbar, progress, status bar. Reader
  (NovelReader/MangaReader): Aero-scope toolbars/panels/dialogs only — the text
  surface stays solid, opaque, and untouched.
- **Verify first:** `BookReader.tsx` (886 lines) usage — classify legacy vs
  FocusShell before touching.
- **Preserved:** chapter navigation, bookmarks, annotations, popup dictionary,
  sentence/word highlighting, flashcard mining, typography controls, reading
  progress, focus mode, keyboard shortcuts.
- **Acceptance:** read a real EPUB end-to-end incl. dictionary popup + mining;
  no glass behind text; gates below.
- **Commit:** `feat(phase4): M7 — EPUB library + reader Aero transformation`.

## M8 — CSV Editor → Future Spreadsheet

- **Objective:** menu bar + existing toolbar as command bar; status bar
  (rows/cols/selection/filter state); grid dominates the window; context menus
  via `ui/ContextMenu`. No ribbon — audit shows toolbar + menus cover the
  command surface. No giant cards around the grid.
- **Preserved:** virtualization (`CsvGridRow`, `csvParseAsync.ts`), storage,
  import/merge + find/replace (on ui/Dialog since M2), column mapping.
- **Tests:** large dataset (10k+ rows) scroll/edit during the milestone;
  keyboard navigation.
- **Commit:** `feat(phase4): M8 — CSV editor spreadsheet chrome`.

## M9 — Calendar → Future Life Organizer (polish-scope)

- **Objective:** existing Month/Week/Day/Agenda + reminders stay; add event
  details pane, quick-add via `ui/Dialog`, denser cells, status information,
  study-category colors; reminders through the existing notification bus.
- **Preserved:** calendar data model (`calendar.ts`), all four views, CRUD,
  reminders. No second calendar engine.
- **Commit:** `feat(phase4): M9 — Calendar organizer polish`.

## M10 — Notes (sticky-note polish; no new product)

- **Finding:** only desktop sticky notes exist (DesktopShell `note` windows,
  text + color). Knowledge Notebook is deferred to Phase 5.
- **Work:** Aero glass sticky skin (scoped CSS), color set alignment. Nothing
  else.
- **Commit:** `feat(phase4): M10 — Aero sticky-note polish`.

## M11 — Remaining applications triage + batch density pass

- **Work:** Music/Media/Dictionary/Anki/Translate get the grammar CSS + light
  toolbar/status adoption (mostly class + AppChrome adoption, minimal DOM).
  Grammar/Statistics/Resources/Immersion: audited, classified, and (unless
  trivially cheap) deferred with notes in PHASE_4_QA.md. Noctis stays out of
  scope.
- **Commit:** `feat(phase4): M11 — remaining app triage + density pass`.

## M12 — Existing cross-app workflow polish (small)

- **Work:** existing buses only — `os:open` deep-links from notifications and
  search, recent items in Start where recents already exist, mining events →
  Flashcards refresh. No new workflows; deep expansion is a later phase.
- **Commit:** `feat(phase4): M12 — workflow polish on existing buses`.

## M13 — Emotional / authenticity review

- **Work:** compare the suite against `FRUTIGER_AERO_OS_VISION.md` §8 and the
  XP/Vista references: desktop software, not a website? compact but readable?
  one operating system? wallpaper supports rather than overpowers? Fix density/
  hierarchy/timing/readability before any added decoration.
- **Commit:** `fix(phase4): M13 — authenticity + density fixes`.

## M14 — Consolidated docs + QA

- **Docs** (all in `docs/frutiger-aero/`): finalize
  `XP_AERO_APPLICATION_LANGUAGE.md`, `APPLICATION_CHROME_AND_DIALOGS.md`,
  `APPLICATION_TRANSFORMATION_GUIDE.md`,
  `STARTUP_AND_SYSTEM_AUDIO_INFRASTRUCTURE.md`, `PHASE_4_QA.md` (status matrix,
  gate results, bugs found/fixed, deferred work, Phase 5 recommendations).
- **Commit:** `docs(phase4): M14 — consolidated docs + QA`.

---

## Per-application acceptance gates (every app milestone, M5–M11)

1. **Functional** — data, persistence, import/export, cross-app events intact;
   no mature business logic rewritten.
2. **Classic 4:3** *(re-grounded)* — inside the 1280×960 logical desktop:
   useful default window sizes; no clipped dialogs; no inaccessible controls;
   no horizontal overflow unless intrinsic; toolbars/status bars usable;
   readable at stage scales ≈0.6 and >1.
3. **Native Display** — non-Aero full-window layout unchanged; the M3 Aero
   Native-Fill toggle correct; zero display-mode branches in app code.
4. **Floating / pop-out** — works in `fwin` and `?popout=` hosts; after
   maximize/restore; after session restoration.
5. **Accessibility** — keyboard-only navigation, visible focus, labels/roles,
   high-contrast theme, large text (`appZoom`), reduced motion, reduced
   transparency, accessible disabled states.
6. **Performance** — VirtualList/VirtualGrid stay virtualized; no new always-on
   renders; hidden windows do no expensive work; large-data checks run inside
   the milestone (CSV, Music).
7. **Theme boundary** — default Study OS visually unchanged (before/after
   theme-toggle screenshot or DOM diff each milestone); all Aero CSS carries
   the `data-materials='aero'` gate; AppChrome renders nothing extra outside
   Aero.

## Verification approach (each milestone)

- `npx vitest run` for the existing test suite. Note: `tsc` is known-broken in
  this repo (TypeScript 4.5 vs `satisfies`) — rely on the Vite build instead.
- Launch the app, toggle Aero (type "aero" outside a text field), and exercise
  the milestone's app in: desktop window, pop-out, default theme, Aero theme,
  reduced motion, Battery Saver.
- Default-theme regression: screenshot-compare the shell + the touched app
  before/after the milestone.

## Deferrals to Phase 5

Authored production sound pack (M4 wires events only); final icon/wallpaper
asset production; Anime Edition asset pack; advanced / outside-app companions;
collectible themes, unlock systems, deep Easter eggs; Knowledge Notebook
(standalone Notes product); deep transformation of Grammar / Statistics /
Resources / Immersion (unless trivially cheap in M11); Noctis surfaces
(separate project track); new cross-app workflows; release packaging and final
legal/licensing review.
