# Blanc Refinement Plan

Created 2026-07-20. Supersedes the "Blanc Toolbox module build-out" track in `TASKS.md`.

## Status (updated 2026-07-20)

**Done:**

- **Pillar 0 — complete.** All six embeds rebuilt Blanc-native in
  `components/blanc/BlancStudyPanels.tsx`, each composing a shared
  `*Content.tsx` extraction (`grammar/GrammarContent`, `reading/ReadingFinderContent`,
  `resources/ResourcesContent`, `calendar/CalendarContent`) that Study OS still
  consumes through its own view. `renderBlancTool` returns no `*View`, and no
  Blanc file imports `AppChrome`/`MenuBar`/`StatusBar`.
- **Pillar 1 — items 1–3.** Blanc has its own entry (`blanc.html` →
  `src/renderer/blancMain.tsx`), wired in `vite.renderer.config.ts` and loaded by
  `main.ts`'s `blancUrl()`. The five eager readers are `lazy()`, and `App.tsx`
  now lazy-loads `BlancShell` too. Measured: **Blanc boots 1.83 MB vs Study OS
  4.76 MB (62% smaller)**, with no desktop shell, city engine, widget registry,
  or environment layer in its boot path. Gated by `tools/blanc-budget.cjs` +
  `blanc-budget.json`.
- **Tooling — complete.** `tools/blanc-drift.cjs` + `blanc-coverage.json` +
  `.claude/commands/update-blanc.md`.
- **Study-native item 1** (clipboard watch / auto-lookup) shipped as the Blanc
  `clipboard` panel.
- **Pillar 0 — `stats` tab bail-out closed (2026-07-20).** `BlancStatisticsPanel`
  is Blanc-native, composing a new `components/stats/StatsContent.tsx`
  (`useStats`, `WordKnowledge`, `StatsCards`, `StatsChart`, `StatsBooks`) that
  `StatisticsView` also consumes — `StatisticsView` lost ~110 lines of duplicated
  markup and Blanc no longer mounts it. `StatsContent` imports `confirmDialog`
  from `ui/dialogService` rather than the `ui` barrel, so Blanc's bundle never
  pulls `AppChrome` in transitively. Blanc boot payload unchanged at 1.83 MB
  (the panel is `lazy()`). Marked `covered` in `blanc-coverage.json` via
  `blancSurface`, not `blancToolId` — `stats` is a tab, not a `BLANC_TOOL_IDS`
  entry, and the drift script correctly rejected the wrong claim first.
  Verified live in both shells against seeded data (cards, 14-day chart, and
  per-book list all render identically); the seed was removed afterwards.
- **Pillar 0 — `anki` bail-out closed (2026-07-20).** `BlancAnkiPanel` composes a
  new `components/anki/AnkiContent.tsx` — `useAnkiConfig` holds all the state and
  IPC, and the blocks (`AnkiDisconnected`, `AnkiDeckNoteType`, `AnkiFieldMapping`,
  `AnkiNoteCss`, `AnkiManualCardForm`, `AnkiPreviewPane`) render bodies only, so
  each shell supplies its own framing. `AnkiView` is 463 → 105 lines. Blanc uses
  `ProfileSwitcher`, not `ProfileSettingsSection` — the latter lives in
  `SettingsView` and would drag the settings surface into Blanc's bundle.
  **Only the disconnected branch is verified live** (AnkiConnect was not running);
  the connected branch is covered by types and the build, not by observation.
- **Pillar 2 — `notebook` ported (2026-07-20).** New `components/notebook/
  NotebookContent.tsx` (`useNotebook` + tabs/streams/folders/timeline blocks);
  `NotebookView` is 254 → 61 lines. Registered as the second **Blanc-only tool
  id** alongside `coverage` (new `BlancOnlyToolId` type + `BLANC_ONLY_LABELS`) —
  deliberately *not* a new `TOOLBOX_MODULES` entry, since that registry is shared
  with Study OS and carries 19 fields plus its own tests. Navigation is injected:
  Study OS keeps `os:open`, Blanc translates hrefs onto `toolbox:open-tool` /
  `blanc:select-tab` and *reports* targets it has no surface for. `quick-notes`
  stays separate, per the original plan. Verified live: 3,246 entries, 8 folders,
  400 rows with an honest "showing first 400" truncation note.
- **Pillar 2 — `translate` ported (2026-07-20).** New `components/translate/
  TranslateContent.tsx` (`useTranslate` + the shared history list). Study OS
  renders two quite different layouts (aero and classic), so only the genuinely
  shared parts are extracted rather than forcing one markup on both. Blanc-only
  tool id. Verified live in both shells.
- **Pillar 2 — `music` ported (2026-07-20).** New `components/music/
  MusicContent.tsx` (`useMusic` + `MusicSongList`/`MusicSearchBox`/
  `MusicLyricsPane`/`MusicControls`/`MusicNowPlaying`/`MusicYoutubeRow`);
  `MusicView` is 594 → 165 lines. Playback stays on the shared `playerBus`, so
  the Blanc panel, the `FocusMusicBar` widget, and the Study OS window are one
  transport, not three. The song list keeps `VirtualList` in both shells —
  verified live at **1,585 songs rendering only 15 DOM rows**, which is Pillar 1
  item 4 satisfied for this surface. `MusicControls` takes `onOpenWidget`
  optionally; Blanc omits it (6 buttons vs Study OS's 7).

- **Pillar 0 — `player` / `video` closed (2026-07-21, Stream A).** New
  `components/media/MediaContent.tsx` (`useMedia` + `MediaTranscriptionControls`/
  `MediaWatchFolder`/`MediaYoutubeBar`/`MediaGenerationStatus`/`MediaPlayerStage`/
  `MediaSearchBox`/`MediaFolderNav`/`MediaGrid`/`MediaKindFilter`/
  `MediaEmptyLibrary`/`MediaLookupPopup`); `MediaView` is 1122 → 190 lines.
  The `mode` prop ('full' | 'library' | 'video') is preserved verbatim so Study
  OS's three entry points behave identically; Blanc's Media tab runs `'full'`.
  The library grid keeps `VirtualGrid` — verified live at **1,586 media items
  rendering only 8 card nodes**, with a 198-row folder rail in a bounded
  scroller. Zero `.blanc-practical-host`, zero `.ui-app-chrome`, no `.media-view`
  in the Blanc window. Removed a dead `eslint-disable` for `jsx-a11y/media-has-caption`
  (that rule is not loaded in this config, so the comment itself errored once the
  code moved); replaced with a comment explaining why the `<video>` has no `<track>`.
  **Not verified:** the Study OS `MediaView` render — the Study OS window was
  closed partway through the session, leaving only the Blanc window. Covered by
  the build and by the shared content module, not by observation.

- **Pillar 0 — `flashcards` closed (2026-07-21, Stream A).** The app's largest
  view. New `components/flashcards/FlashcardsContent.tsx` = one `useFlashcards`
  hook (all state, deck mutations, the review-session logic, the mining handoff)
  plus five presentation components: `FlashcardReviewMode`, `FlashcardMiningMode`,
  `FlashcardCsvMode`, `FlashcardAiMode`, `FlashcardDeckOverview`. `FlashcardsView`
  is 1883 → ~640 lines; it keeps only the **aero** overview (which legitimately
  uses `Toolbar`/`Button`, so it must not move into the content module and drag
  chrome into Blanc's bundle) plus the menu/status builders, and delegates
  everything else. Blanc composes the same five components in `.blanc-flashcards-embed`.
  Pillar 7 honoured: mining runs through the identical `FlashcardMiningMode` →
  `EpubMiningPanel`/`JitenMiningPanel` + `flashcards:openEpubMining` path, not a
  parallel one. **Verified live** in Blanc: zero `.ui-app-chrome`/`.blanc-practical-host`,
  3,223 EPUB cards, all five overview sections; drove overview → review (flipped a
  card, marked Know, then reverted it to Don't-know and confirmed `known` cleared
  in `jp-flashcard-deck` — no user data left changed) → mining (all three sub-tabs)
  → back. `confirmDialog`/`promptDialog` imported from `ui/dialogService`, not the
  barrel. **Not verified:** the Study OS `FlashcardsView` render (window was closed).

**Stream A (Media & Cards) is complete** — `player`, `video`, and `flashcards`
are all Blanc-native.

- **Stream B (Library & Arcade) verified and flipped (2026-07-21, coordinator).**
  All four surfaces were found already built and correctly shaped — `lazy()` in
  `BlancShell.tsx`, composing `NovelsContent` / `GameArenaContent` /
  `ImmersionContent` / `VisualizerContent`, with the Study OS views rewired to the
  same modules (`NovelsView` 1004 → 119, `GameArenaView` 1053 → 8, `ImmersionView`
  1027 → 330). They were still marked `pending` because the split reserves flag
  flips for the coordinator, after verification. **Now verified live in the running
  Blanc window** (`blanc.html?blanc=1`), each asserting `.ui-app-chrome === 0` with
  exactly one `.blanc-tool-detail`:
  - `novels` — 208 titles, three-pane `jiten-workbench`, real rows (`button.jiten-row`,
    not `<tr>`).
  - `games` — arena with 13 games, XP/streak/badges.
  - `visualizer` — live canvas stage + Style/React-to/Colors controls.
  - `immersion` — toolbar, sites rail, Reader mode, **and Live mode mounting a real
    `<webview>` guest**. That resolves the open caveat in `BlancImmersionPanel`'s
    docstring: `<webview>` *is* enabled in the Blanc window, so Live mode is not
    conditional.

  `blanc-coverage.json` now reports **zero pending surfaces** and
  `tools/blanc-drift.cjs` exits 0 with "Blanc covers every classified Study OS
  surface." **Pillar 2 parity is complete.** 952 tests green across 95 files.

  Side effect, disclosed: verifying immersion Live mode loaded NHK Easy in the
  guest, which increments that site's visit count in immersion history (65 → 66).
  Real user data, left as-is — reverting a visit counter is more invasive than the
  increment.

**Verified incidentally:** `main.ts`'s `blancUrl()` — the running Blanc window is
served from `http://localhost:5173/blanc.html?blanc=1`, the dedicated entry, not
the `index.html?blanc=1` fallback. The verification note at the end of this Status
section is therefore closed.

### Budget: gate is RED and deliberately left red

`blanc-budget.cjs` currently reports **over budget by 0.09 MB**
(recorded 1,919,741 → measured 2,014,291 bytes, +96,974 over the session start).

What was ruled out, by grepping the built Blanc entry chunk:

- **No panel code leaked into boot.** `music-lyrics`, `gx-notebook`, `tr-history`,
  `anki-manual-form`, `stats-bar-fill`, `guessSongMeta`, `buildMusicTree`,
  `translationHistory`, `aggregateNotebook` are all **absent** from the entry
  chunk. Every new panel is genuinely `lazy()`.
- **`violations` is empty** — no desktop shell, city engine, or environment layer.
- What *is* in boot (`dict-popup`, `deinflect`, `kuromoji`) is the pre-existing
  dictionary/tokenizer stack that the clipboard panel and `FocusMusicBar` already
  needed.

So the growth is chunk re-shuffling (Rollup hoisting shared modules between the
entry and the lazy panel chunks), not an eager import — but that was **not
positively attributed**, and a baseline build could not be produced because
stashing `src/renderer` alone breaks the build against the branch's other
uncommitted work. **Do not `--update` the budget until the 97 KB is attributed.**
Silencing an unexplained regression is exactly what this gate exists to prevent.

**Not done — the remaining work-list:**

- **Pillar 1 item 4** (virtualize long lists).
- **Pillars 3–8** in full, and **study-native items 2–7**.
- **Pillar 2 parity: done.** `node tools/blanc-drift.cjs` reports **0 pending**
  and exits 0. There is no parity gap list any more; the drift script's value from
  here is as an *alarm* — a brand-new Study OS view shows up as unclassified on the
  next run.

  The established recipe is retained for when that happens:
  extract a `*Content.tsx` (hook + presentation-neutral blocks), rewire the Study
  OS view to compose it, build the Blanc panel, register a Blanc-only tool id if
  the surface has no tab, update `blanc-coverage.json`, verify live.

  **Next session should start from the study-native toolbox track (items 2–7)** —
  it is the highest-priority remaining track in `/update-blanc`'s ordering now that
  Pillar 0 violations, tab bail-outs, and Pillar 2 ports are all clear. Item 2
  (pitch accent) and item 3 (furigana generator) are the cheapest, and both sit on
  infrastructure the app has already paid for.
- Doc debt below is still open.

**Verification note — CLOSED 2026-07-21.** `main.ts`'s `blancUrl()` is confirmed
live: the running Blanc window's URL is `http://localhost:5173/blanc.html?blanc=1`,
the dedicated entry, not the `index.html?blanc=1` fallback.

## Parallel split (added 2026-07-21 — RETIRED 2026-07-21, both streams complete)

**Status: dormant.** Stream A and Stream B have both landed and been verified, and
no second agent is currently on this surface, so the file-ownership rules below are
not in force — the next session may edit any Blanc file. **Reinstate this entire
section verbatim before starting two concurrent sessions on Blanc again**, and note
that the `theme/blanc-media.css` + `theme/blanc-library.css` seam and the
`BlancMediaPanels` / `BlancLibraryPanels` split it created are worth keeping either
way: they are good structure independent of the coordination problem that motivated
them.

The original rationale, for whoever reinstates it:

The remaining 7 surfaces are being worked by **two agents at once, in the same
working tree**. That means there is no git merge to protect anyone: two sessions
writing the same file is last-write-wins, and one stream's edit silently
disappears. So the split is **file-disjoint**, not merely "small edits in the
same files."

### Stream A — Media & Cards (Pillar 0, ~3,000 lines)

`player`, `video` (`MediaView`, 1122) and `flashcards` (`FlashcardsView`, 1883).
Both are **tab** surfaces that already exist, so this stream needs **no new tool
ids and never edits `BlancShell.tsx`**.

Owns, exclusively:

- `components/blanc/BlancMediaPanels.tsx` ← the two panels now live here
- `components/media/MediaContent.tsx` (new)
- `components/flashcards/FlashcardsContent.tsx` (new)
- `views/MediaView.tsx`, `views/FlashcardsView.tsx`
- `theme/blanc-media.css`

### Stream B — Library & Arcade (Pillar 2, ~3,100 lines)

`novels` (1004), `games` (`GameArenaView`, 1053), `immersion` (1027),
`visualizer` (`VisualizerWidget` — a widget, not a `*View`; see `AppSection.tsx`).
All four need new Blanc-only tool ids, so this stream is the **sole editor of
`BlancShell.tsx`**.

Owns, exclusively:

- `components/blanc/BlancLibraryPanels.tsx` (new, currently empty)
- `components/blanc/BlancShell.tsx` — **only Stream B may touch this**
- `components/{novels,games,immersion,visualizer}/*Content.tsx` (new)
- `views/NovelsView.tsx`, `views/GameArenaView.tsx`, `views/ImmersionView.tsx`
- `theme/blanc-library.css`

### Frozen — neither stream edits these

| File | Why |
|---|---|
| `components/blanc/BlancStudyPanels.tsx` | Done (stats/anki/notebook/translate/music). Read it for the pattern; do not add to it. |
| `theme/blanc.css` | Shared. It now `@import`s the two per-stream CSS files; add rules there instead. |
| `blanc-coverage.json` | Both streams would edit it. Report your surfaces as done and let the coordinator flip the flags — `pending` entries keep the drift script at exit 0 meanwhile. |
| `blanc-budget.json` | The gate is **red on purpose** (see below). Do not `--update` it. |
| `BLANC_REFINEMENT_PLAN.md` | Coordinator reconciles at handoff. |
| `renderer/keyboardShortcuts.ts` | A third session was editing this on 2026-07-20. Leave it alone. |

### Seam already prepared (2026-07-21)

`BlancMediaPanel` / `BlancFlashcardsPanel` and `BlancViewHost` were **moved out
of `BlancShell.tsx`** into `BlancMediaPanels.tsx` with behaviour unchanged, and
the shell now `lazy()`-imports just those two names. `blanc-media.css` and
`blanc-library.css` were created and wired into `blanc.css`. Verified green:
946 tests, clean build, drift exit 0, no new Pillar 0 violations.

---

## Direction change

Blanc stops growing sideways. The previous track promoted one planned utility per
session (`batch-converter` 07-19, `workspace-launcher` 07-20) toward a 50-module
registry. That work is **paused**: the remaining 20 planned modules are mostly
generic Windows utilities (color picker, QR codes, always-on-top, bulk renamer)
that PowerToys and Explorer already do better. Shipping them grows maintenance
surface and the "ready" count without making Blanc more useful.

The new goal: **Blanc is the fast way to use the study app.** Everything Study OS
can do, Blanc does too — in Blanc's own visual language, fully rearrangeable by the
user, honest about what it is doing, and much cheaper to open.

Pillars, in priority order: **0** Blanc-native UI · **1** performance · **2**
parity · **3** app drawer · **4** flexibility and theming · **5** transparency
(console, indicators, app CPU/GPU) · **6** master search · **7** integrations
(mining, extension, updates) · **8** polish. Plus **tooling**: a drift command so
"Update Blanc" is one instruction with a real work-list behind it. Plus a
**study-native toolbox track** (clipboard auto-lookup, pitch, furigana,
conjugation drill, counters, audio mine, review forecast) — preferred over the
paused generic adapters, because these are the modules that make Blanc the fast
way to study rather than a second PowerToys.

Pillar 0 gates the rest — every new surface below is built Blanc-native, and the
five existing embeds get retro-fixed. The study-native modules are new Blanc
panels (no Study OS `*View` to wrap); they still obey the same chrome rule.

---

## Pillar 0 — Blanc-native UI (blocks every port; also a fix for what already shipped)

**Rule: never mount a Study OS `*View` inside Blanc.** Ported apps must be rebuilt
in Blanc's visual language. This is not a preference — the current embeds visibly
read as "a Study OS window stuffed inside a toolbox panel," and the cause is
mechanical.

**Why it looks off.** Study OS views wrap their content in `AppChrome`
([AppChrome.tsx:60](src/renderer/components/ui/AppChrome.tsx:60)) — a menu bar and a status bar,
Study OS's window furniture. 17 views do this. Blanc's `renderBlancTool` mounts
five of them raw, with no Blanc chrome at all:

| Blanc tool | Currently renders | Should render |
|---|---|---|
| `dictionary` | `<DictionaryView />` | `<DictionaryResults />` in a Blanc panel |
| `grammar` | `<GrammarView />` | Blanc panel over the same data layer |
| `reading-finder` | `<ReadingFinderView />` | Blanc panel |
| `resources` | `<ResourcesView />` | Blanc panel |
| `calendar` | `<CalendarView />` (fallback branch) | Blanc panel |
| `clipboard` | `<ClipboardWidget>` in a host div | Blanc panel (partially wrapped today) |

The other 18 tools are already Blanc-native (`blanc-tool-detail` + `fieldset`/
`legend`) — that is the target look, and it is the majority, which is why the five
embeds stand out.

**The cheap path, verified.** These views are thin. `DictionaryView` is 104 lines
and is essentially state + `AppChrome` + `<DictionaryResults />` — **the real
content is already a separate component.** So the fix is composition, not a
rewrite: render the inner content component inside Blanc chrome and drop the
`*View` wrapper. Logic is not duplicated and the data layer stays shared.

Where a view has no extracted inner component, extract one — Study OS keeps using
it via its own `*View`, Blanc composes it directly. That keeps one implementation
with two presentations, which is the actual goal.

Also route the five tab-routed modules (`media`, `flashcards`, `statistics`,
`epub-mining`, `anki-deck`) through the same rule: today they bail out to Study OS
tabs entirely, which is the most jarring transition in the product.

**Definition of done:** nothing in `renderBlancTool` returns a `*View`, and no
`ui-app-chrome` element ever renders inside a Blanc window.

---

## Pillar 1 — Performance (the reason Blanc exists)

This is the headline problem and it is currently unaddressed.

**Blanc loads the entire application.** `BlancShell` is statically imported by
`App.tsx` ([App.tsx:26](src/renderer/App.tsx:26)) and the Blanc window renders from the
same renderer entry as Study OS. `vite build` emits a **3.82 MB** `index-*.js`
(1.16 MB gzip). A window whose purpose is "fast toolbox" pays the full Study OS
bundle before it paints.

Work items:

1. **Split the Blanc entry.** Give the Blanc window its own HTML entry and root
   module so it never pulls Study OS's shell, desktop layer, city engine, or
   widget registry. `blanc-harness.html` already proves `BlancShell` mounts
   standalone — that harness is the shape the real entry should take.
2. **Lazy-load the eager readers.** `AnkiView`, `MangaReader`, `NovelReader`,
   `EpubMiningPanel`, and `EpubMiningSimplePanel` are static imports at
   [BlancShell.tsx:18-22](src/renderer/components/blanc/BlancShell.tsx:18); the other heavy views
   are already `lazy()`. Match them.
3. **Measure and gate.** Record cold-open time to first paint and the Blanc chunk
   size, then hold them as a budget. Without a recorded baseline "performance" is
   an adjective, not a target.
4. **Virtualize the long lists.** Per CLAUDE.md's performance rule, dictionary
   results, deck lists, and file-search results must not drop frames while the
   window is dragged.

**Definition of done:** Blanc's cold open is measurably faster than the Study OS
window, and its bundle excludes the city engine and desktop shell entirely.

---

## Pillar 2 — Parity with Study OS

Blanc covers 30 ready modules against Study OS's 23 sections
(`DesktopWinSection`, [desktop.ts:8](src/shared/desktop.ts:8)). The genuine gaps, all of
which are app features rather than new OS-level capability:

| Study OS surface | Blanc today | Work |
|---|---|---|
| `novels` / `NovelsView` | `NovelReader` only (reading, no catalog) | Add the catalog/browse surface |
| `translate` / `TranslateView` | none | Port |
| `notebook` / `NotebookView` | `quick-notes` (deliberately separate, local) | Port the real notebook alongside it |
| `games` / `GameArenaView` | `mono-blocks` only | Port the arena |
| `visualizer` | none | Port |
| `immersion` / `ImmersionView` | `immersion-tracker` (read-only totals) | Promote to the full browser |
| `music` / `MusicView` | `FocusMusicBar` taskbar widget | Full library surface |
| Manga suite (`MangaCleanTextView`, `MangaCompareView`) | none | Port |
| `TreeView` | none | Evaluate — may not belong in a toolbox |

Out of scope: `city` (its own desktop), `settings` (Blanc has its own).

**Rule for every port (revised 2026-07-20 — this reverses the original wording).**
The first draft said "reuse the existing view lazily, the way `dictionary`,
`grammar`, and `calendar` already do." That is exactly the mistake Pillar 0 exists
to fix — those three are the offenders, not the model.

Correct rule, three parts:

1. **Share the data layer, never the view.** Stores, IPC, and pure helpers are
   reused as-is. The registry's `existing-service` strategy refers to *services*,
   not presentation.
2. **Compose the inner content component** inside Blanc chrome. Extract one from
   the `*View` if it doesn't exist yet, and leave Study OS consuming it through
   its own view so there is still one implementation.
3. **Never import `AppChrome`, `MenuBar`, or `StatusBar` into a Blanc panel.**

This raises the cost of Pillar 2 above the original estimate — porting is now a UI
build per app, not a one-line `lazy()` import. That cost is accepted deliberately;
the whole point of Blanc is that it does not look or feel like Study OS.

---

## Pillar 3 — App Drawer (new feature)

One place to organize the user's study apps: add anything as a shortcut, group
shortcuts into folders, launch from a single surface.

**Scope**
- Shortcut kinds: installed apps and files (native picker), http(s) links, and
  Blanc's own built-in tools — a folder should be able to hold "Anki + jisho.org +
  Blanc's Dictionary" side by side. That last kind is what makes this a *study*
  organizer rather than a generic launcher.
- Folders: create, rename, delete, drag between, nest one level (not arbitrary
  depth — deep trees are a maintenance and UI cost with no payoff at this size).
- Per-item: rename, custom icon, remove. Grid layout with the icons the OS already
  gives us (`app.getFileIcon` is already used by `desktop:pickShortcut`).
- Launch a whole folder at once.

**Reuse — this must not become a third parallel store.** Two overlapping things
already exist and the drawer should absorb both:

1. **`workspace-launcher`** (built 2026-07-20) is already "an ordered group of
   launchable targets," which is a folder minus the UI. Fold it in: a workspace
   *becomes* a drawer folder, and "launch all in order" becomes an action on a
   folder. Migrate the `jp-study.blanc.toolbox.workspaces.v1` key rather than
   stranding it, and retire the standalone tool once parity is reached.
2. **`collectedTools`** ([collectedTools.ts](src/shared/collectedTools.ts)) is an existing
   main-process store of sites the user saved from the Immersion browser and the
   Chrome extension, with full IPC (`toolsList`/`toolsAdd`/`toolsUpdate`) and URL
   de-duplication. Saved sites should appear in the drawer as shortcuts instead of
   living only in the Resources app. Note its model has `tags` but no folders and
   is URL-only — extending it beats inventing a parallel schema, but the local-app
   and built-in-tool kinds need a schema addition either way.

**Decide before building:** whether the drawer's store lives in the main process
(like `collectedTools`, survives profile/window changes, shareable with Study OS)
or in renderer localStorage (like every other Blanc setting today). Main-process is
the better fit given `collectedTools` is already there — but it is the one choice
that is expensive to reverse later, so settle it first.

**Launch safety:** reuse `desktop:launch` ([library.ts:1361](src/main/library.ts:1361)) and keep
its documented invariant — paths enter only via the native picker, free text only
as http(s). Do not add a "type a path" field.

**UI:** Blanc-native per Pillar 0. This is a new surface with no Study OS
counterpart, so there is nothing to copy and no excuse to.

---

## Pillar 4 — Flexibility: the user rearranges everything

Nothing in Blanc's layout should be fixed by us if the user might want it moved.

**Already built — reuse, don't reinvent.** `toolboxSettings.ts` already has
`enabledTools`, `hiddenTools`, `favoriteTools`, `showHiddenToolsInSearch`,
`sidebarWidth`, `sidebarExpanded`, `tabPosition`, `density`, `launcherStyle`. So
"hide or disable any function" is mostly wiring an editor UI onto an existing
typed, sanitized, import/export-able schema.

**Missing: order.** There is no `toolOrder` key — `BLANC_TOOL_IDS` is a hardcoded
array and category order is a fixed constant. Add persisted ordering for the tool
rail, the taskbar, and category groups, with drag-to-reorder and a per-section
reset. This is the single biggest gap in the "flexible" ask.

**Theming — cheaper than it looks.** `blanc.css` is already fully tokenized: 17
CSS custom properties (`--blanc-bg`, `--blanc-panel`, `--blanc-accent`,
`--blanc-text`, `--blanc-border`, `--blanc-danger`, …) across 174 usages. A
"blood mode" is a ~6-token override, not a restyle. Ship:
- A theme editor with live color pickers bound to those tokens.
- Named presets (including a red/"blood" one) plus user-saved themes.
- Import/export as JSON, matching how toolbox settings already export.
- A raw custom-CSS escape hatch, scoped to the Blanc root. Treat user CSS as
  untrusted layout input: it must not be able to hide the settings entry point or
  the way out of Blanc, or the user can lock themselves out.

**Settings completeness.** Every knob above belongs in Blanc Settings, searchable
via the existing `keywords` field on each setting definition. The audit's rule
still binds: **every setting must work or be removed** — that is what defects #1
and #2 were about. Do not add a toggle before its consumer exists.

---

## Pillar 5 — Transparency: know exactly what the app is doing

The ask: no surprises. Where did that card go, what got mined, what failed, why.

**Developer console.** A real event log surface in Blanc showing mining events,
card writes and their destination deck, imports, downloads, IPC failures, and
stack traces.

Build note, honestly: `notificationStore.ts` is the closest existing thing — it
already captures the `os:toast` / `ui:toast` buses into persistent history with
`kind` (`error`/`warning`/`success`/`info`), `source`, and priority. But it is
toast-shaped and **capped at 100 entries**, so it is the wrong backbone for a log.
Add a separate append-only ring buffer with structured entries (timestamp,
category, level, payload, correlation id), filter-by-category, text search, and
copy/export for bug reports. Feed it from the same emitters plus explicit
instrumentation at the mining and deck-write paths. Keep the notification center
as the *summary* surface; the console is the *detail* surface.

**Indicators.** Persistent status for: extension connected/disconnected, OCR model
installed, dictionary loaded, downloads in flight, last sync, unread errors. These
should be glanceable in the shell, not buried in a panel.

**App resource usage — new work, no new deps.** The existing `system:getMetrics`
is *system-wide*; the ask is what **this app** is consuming. Electron provides it
directly and neither API is used anywhere in the repo today:
- `app.getAppMetrics()` — per-process CPU percentage and memory, broken out by
  process type (browser, renderer, GPU, utility). That gives a real per-window
  and per-process breakdown.
- `app.getGPUFeatureStatus()` / `app.getGPUInfo()` — GPU acceleration status.

Surface as a live panel plus a compact always-visible indicator. Poll on a
generous interval and stop polling when the panel is hidden — a resource monitor
that itself burns CPU is self-defeating.

---

## Pillar 6 — Master search

One search field that reaches everything: apps and tools, settings, deck cards,
saved words, dictionary entries, grammar points, library items and novels, mined
sentences, files and folders, commands, and app-drawer shortcuts.

Two partial implementations exist and should merge rather than multiply:
`context-search` (commands, saved words, deck cards, grammar) and
`toolboxFileSearch` (capped filename search with honest `truncated` reporting).

Requirements: grouped results by source, keyboard-first navigation, per-source
enable/disable (Pillar 4), and **honest caps** — when results are truncated it
must say so, exactly as `toolboxFileSearch` already does. A search that silently
drops matches is worse than one that admits its limit.

### 6a. The command bar — visual & UX spec (added 2026-07-21)

The functional scope above says *what* the search reaches; this part fixes *how it
looks and feels*. The reference is the **Goose home screen**: a calm hero with a
single, prominent command bar rather than a cramped toolbar field. It inherits the
neutral macOS aesthetic shipped 2026-07-21 (see `[[blanc-macos-aesthetic]]` /
`blanc.css` tokens) — no blue-grey tint, hairline borders, rounded geometry,
generous whitespace, soft motion.

**Two entry points, one component.**

1. **Home hero.** Blanc's empty/landing state (no tool open) becomes a centered
   hero, Goose-style:
   - Large live clock + contextual greeting ("9:57 AM" / "Good morning",
     time-of-day aware). Uses the existing Blanc clock source; greeting is app
     chrome, so route it through i18n (`useT()`), unlike study content.
   - Directly below, the master command bar as the single focal point. Nothing
     else competes for attention — this is the one obvious focal point the polish
     brief demands.

2. **Overlay palette.** A global shortcut (reuse `keyboardShortcuts.ts`; do not add
   a parallel registrar) opens the *same* bar as a floating, centered overlay above
   any tool, Raycast/Spotlight-style — backdrop dim, `Esc` closes, focus trapped.
   Home-hero and overlay share one `MasterSearch` component; only the framing
   differs.

**The bar itself.**
- A single rounded container card (`--blanc-radius-lg`, `--blanc-panel`, hairline
  border, `--blanc-shadow`) that *floats* — not a bordered strip. Comfortable
  height and padding; the input is borderless inside the card (the card is the
  affordance), placeholder in `--blanc-faint`, matching the Toolbox "Search tools"
  field already restyled.
- **Context chips** on the input row, like Goose's model / directory chips: an
  active **scope** chip (All · Tools · Cards · Words · Files · …) and a source/path
  chip where relevant. Chips are pills (`--blanc-radius-pill`), muted until active.
- **Right-aligned affordances**, Goose's cost/token cluster reframed for Blanc:
  a live **result count** with honest truncation ("128 · showing 50", never a
  silent cap — same contract as `toolboxFileSearch`), an optional attach/scope
  icon, and a primary submit/return glyph.
- **A keyboard-hint line** inside the card ("↑ ↓ to navigate · ↵ to open ·
  ⌘K scope"), the analogue of Goose's "Ctrl+↑/Ctrl+↓ to navigate messages".
- **A floating action toolbar** under the bar (the icon row in the reference):
  quick scope filters / recent commands as borderless icon buttons
  (`.blanc-icon-btn`), revealing on focus, receding otherwise.

**Results.** Grouped by source with muted small-caps section headers (the type
hierarchy already in `blanc.css`), rounded hover rows (Apple-Mail/Arc style, not
spreadsheet rows), selected row = subtle `--blanc-active` fill not an outline,
150–250ms ease. Full keyboard traversal across groups.

**Reuse, don't multiply** (unchanged from above): merge `context-search` and
`toolboxFileSearch` behind one query dispatcher; per-source toggles come from
`toolboxSettings` (Pillar 4); the registry (`BLANC_TOOL_IDS` + labels/keywords)
already supplies the tool/command source.

**Definition of done:** opening Blanc with nothing selected shows the clock +
greeting hero with the command bar as the sole focal point; a global shortcut opens
the identical bar as an overlay from anywhere; one field returns grouped,
keyboard-navigable results across every Pillar 6 source with honest truncation; the
whole surface reads as the neutral macOS language, not a toolbar field.

---

## Pillar 7 — Integrations

**EPUB miner and the full mining chain.** Called out explicitly: mining is the
app's core loop and it must be first-class in Blanc, not a bail-out to a Study OS
tab. `epub-mining` is currently tab-routed (Pillar 0) and `EpubMiningPanel` /
`EpubMiningSimplePanel` are eager imports (Pillar 1). Fix both, and instrument the
mining path into the Pillar 5 console so every mined card is traceable. The
study-native track adds two more intakes to the same chain — clipboard
auto-lookup (item 1) and audio transcribe-and-mine (item 6) — and they must use
the same mine → deck → console path, not a parallel write.

**Chrome extension.** Real infrastructure already exists — `extensionServer.ts`,
`extensionInstall.ts`, `extensionCapture.ts`, and an `extensionStatus()` IPC
returning running state, port, token, folder path, and extension version. Blanc
needs a connection panel (status, port, token regenerate, reveal folder) and a
live connected/disconnected indicator per Pillar 5.

**Update notifications — mostly wiring, not building.** `shared/release.ts`
already models exactly what was asked: `AppReleaseInfo` carries `appUpdate`,
`extensionUpdate: { version }`, and `installedExtensionVersion`, with version
comparison and release-note parsing, against
`api.github.com/repos/vasars2024-hub/jp-study-app/releases/latest`. And
`notificationStore` already supports `actionUrl` (deep-link to the release page)
and `clientAction: 'extension-settings'`. So Blanc mainly needs to surface this
and let the user control check frequency. Verify Study OS's existing check before
duplicating it — reuse the same path.

---

## Tooling — the drift command ("Update Blanc")

**Problem:** features land in Study OS and Blanc silently falls behind. Nobody
notices until the gap is large.

**Build `tools/blanc-drift.cjs`**, modelled on `tools/i18n-check.cjs` — a plain
node script, no build step, exit code 0 when clean so it can gate CI like the i18n
check does.

It compares the Study OS surface against Blanc coverage and prints what is
missing, machine-readably enough to act on:
- `DesktopWinSection` members ([desktop.ts:8](src/shared/desktop.ts:8)) vs Blanc tool ids
- `src/renderer/views/*.tsx` vs `renderBlancTool`'s branches
- the widget registry vs Blanc's panels
- registered IPC channels vs those Blanc actually calls
- `TOOLBOX_SHORTCUT_COMMANDS` vs registry-ready modules (the existing
  `validateToolboxShortcutRegistry` already covers this slice — call it, don't
  reimplement)

**Committed manifest** (`blanc-coverage.json`) records each Study OS surface as
`covered`, `deliberately-excluded` (with a reason — `city` and `settings` are
legitimate exclusions), or `pending`. The script fails on anything *new* and
unclassified. That is what makes it a drift alarm rather than a static list: a
brand-new Study OS view shows up as unclassified on the next run.

**Then `/update-blanc`** — a slash command in `.claude/commands/` that runs the
script, reads the pending list, and ports the gaps under the Pillar 0 UI rule.
So "Update Blanc" becomes one instruction with a deterministic work-list behind it
instead of a fresh audit every time.

Two things this must not do: report a surface as covered because a file exists
(the 2026-07-17 audit's whole method was tracing features end-to-end, not judging
by filename), and count a tab-routed bail-out as coverage.

---

## Pillar 8 — Polish and correctness

The 2026-07-17 audit closed all 9 known defects and the surface has no dead TODOs
or placeholder controls. Remaining polish, from that audit's own limitations list:

- **System monitor** exposes CPU/RAM/uptime/battery only; GPU and process lists
  are still adapter work (the panel says so).
- **Global shortcut** registration can lose the accelerator to another app; the
  failure is reported but the recovery UX is bare.
- **Blanc strings are outside the i18n sweep** — a deliberate, documented choice.
  Revisit only if Blanc becomes a primary surface, and if so do it as one pass
  under the CLAUDE.md i18n workflow, not piecemeal.
- **`satisfies` eslint parse errors** in `toolboxSettings.ts` / `toolboxShortcuts.ts`
  are the pinned-TS-4.5 parser, not real defects. Unpinning TypeScript would
  clear them and remove a recurring "is this new?" check every session.

---

## Study-native toolbox modules (preferred build track)

These are not parity ports and not the paused PowerToys-shaped adapters. They are
small Blanc panels that use study infrastructure the app already paid for. Build
them under Pillar 0 (`blanc-tool-detail` + `fieldset`/`legend`, no `AppChrome`),
register them like any other ready tool, and prefer them over finishing the
20 deferred generic modules.

Split by cost. Items 1–5 are nearly free; 6–7 are worth it but real work.

### Nearly free

#### 1. Clipboard watch / auto-lookup

**Why.** The classic Yomitan-style loop: an always-on window that looks up
whatever you copy while you play a game or read in another app. That is exactly
what Blanc is shaped for, and it is the single most toolbox-native idea on this
list. Pair with a mine button and it becomes the fastest path from "saw a word"
to "card made."

**What already exists.** More than it looks:
- `clipboard:readText` IPC ([systemMetrics.ts:86](src/main/systemMetrics.ts:86)) and
  preload `clipboardReadText`.
- Background monitor in [clipboardHistory.ts:242](src/renderer/clipboardHistory.ts:242)
  (`startClipboardMonitor`, ≥4s poll, gated by `monitoringEnabled`, skips while
  dragging / tab hidden). Today it **only records history** — it does not look
  anything up.
- Blanc already has a `clipboard` tool, but it hosts `<ClipboardWidget>` in a
  host div (Pillar 0 offender). Dictionary stack and mining handoff are shared.

**Work.** Blanc-native panel that: watches clipboard (reuse the monitor or a
Blanc-scoped sibling so Study OS history settings stay independent if needed),
runs the existing dictionary lookup on each new text, shows results in-panel,
and exposes a one-click mine into the configured deck. Do not invent a second
clipboard store — feed or mirror `clipboardHistory` and keep the performance
invariants (no sub-4s poll, skip while `os-interacting`).

**Definition of done:** copy Japanese text in another app → Blanc shows a gloss
without focus-stealing → Mine writes a card and Pillar 5 console can trace it.

#### 2. Pitch accent lookup

**Why.** Underserved by most tools; learners actively want word → contour → hear
it. The data is already registered for a "pronunciation checker."

**What already exists.**
- Downloadable asset `kanjium-accent` at
  [assetRegistry.ts:525](src/shared/assetRegistry.ts:525) — "Pitch-accent contours
  for the pronunciation checker."
- Bundled Kanjium seed + `getPitch(term, reading)` returning HTML patterns in
  [yomitan.ts:727](src/main/dictionary/yomitan.ts:727); mining already fills
  `{pitch}` via the same path.
- TTS: `speak()` in [tts.ts:23](src/renderer/tts.ts:23).

**Work.** Blanc panel: look up a word (or accept a selection from auto-lookup /
dictionary), render the pitch contour (reuse `pitchHtml` / `getPitch`, do not
re-parse Kanjium), and a hear button via `speak()`. Gate on asset-installed the
same way OCR tools must gate on model-installed — honest empty state if Kanjium
is missing.

**Definition of done:** type or paste a term → see contour + reading → hear it;
missing asset shows install guidance, not a blank fail.

#### 3. Furigana generator

**Why.** Paste text, get ruby-annotated output, copy it back out. Constantly
useful for making your own materials.

**What already exists.** Offline kuromoji tokenizer in
[tokenizer.ts](src/renderer/tokenizer.ts) (`public/kuromoji/dict`); readers and
subtitle lines already produce furigana from the same stack
([SubtitleCueLine.tsx](src/renderer/components/SubtitleCueLine.tsx)).

**Work.** Blanc panel: textarea in → tokenize → `<ruby>` (and plain-text /
copy-friendly variants) out → copy. Pure composition over the tokenizer; no new
deps. Keep tokenization off the drag path (async / idle), per CLAUDE.md
performance rule.

**Definition of done:** paste a paragraph → ruby preview → copy HTML or plain
furigana form in one click.

#### 4. Conjugation drill

**Why.** Verb/adjective conjugation is a top-3 beginner pain point. Pure logic,
fast, trivially testable, no deps, perfectly toolbox-shaped — 90 seconds of
drilling, then close it.

**What already exists.** [deinflect.ts](src/shared/deinflect.ts) already goes
conjugated → dictionary form (Yomitan-style rule engine, shared main/renderer,
covered by `deinflect.test.ts`). There is **no** conjugation drill today — games
have Counter Quiz and others, not this. Dictionary popup uses deinflect for
lookup only.

**Work.** Small pure inverse module (dictionary form + target form → surface),
built beside `deinflect.ts` and tested the same way. Blanc panel: pick verb class
/ adjective, drill a form (ます, て, た, potential, passive, causative, ない,
etc.), check answer, next. Do not mount `GameArenaView` — this is a focused
drill, not the arena.

**Definition of done:** いちだん/ごだん/する/くる/い-adj covered for the common
forms; vitest covers the inverse the way `deinflect.test.ts` covers peel; panel
is open-drill-close with no Study OS chrome.

#### 5. Counter and number reader

**Why.** `1234` → `せんにひゃくさんじゅうよん`, `3本` → `さんぼん`, dates and
times. Counters are a persistent pain that never quite goes away. Pure logic,
tiny, essentially free.

**What already exists.** Counter Quiz is a **static prompt game**
(`COUNTER_PROMPTS` in graded-sentences data + `counter-quiz` in
[games/engine.ts](src/renderer/games/engine.ts)) — not a general number→reading
engine. Nothing converts arbitrary numerals / counter phrases today.

**Work.** New pure module (shared, tested): numerals, common counters with
rendaku/phonetic changes, dates, clock times. Blanc panel: type or paste →
reading out → copy / optional `speak()`. Keep the quiz game as-is; this tool is
the reference reader the quiz is not.

**Definition of done:** round-trip examples above plus a short vitest table of
counters and date/time forms; panel copies reading in one click.

### Worth it, but real work

#### 6. Audio transcribe-and-mine

**Why.** Drop in audio or video → transcript → mine lines directly. Opens
listening material to the mining loop and reuses installed Whisper
infrastructure instead of a third transcription stack.

**What already exists.**
- Settings surface [TranscriptionPage.tsx](src/renderer/components/settings/pages/TranscriptionPage.tsx)
  (device, model tiers, download/cache).
- `whisperModelCache`, `shared/whisperModels.ts`, media player path that already
  transcribes and supports click-to-mine / furigana.
- Pillar 7 already requires mining to be first-class in Blanc; this is the
  audio/video intake for that chain.

**Work.** Blanc-native panel (not a bail-out to the Video/Media Study OS tab):
pick or drop media → run the existing Whisper path → show transcript cues →
mine selected lines into the deck with the same instrumentation as EPUB mining
(Pillar 5 console). Reuse model-cache and device settings; do not add a second
downloader. Honest states for "model not downloaded" (deep-link or point at
transcription settings).

**Definition of done:** local audio/video file → transcript in Blanc → mine at
least one line to a deck without opening Study OS; failures are visible in the
console.

#### 7. Review forecast

**Why.** A small panel answering "what does my week look like" — upcoming review
load, backlog, whether you are about to get buried. Glanceable, read-only,
toolbox-sized.

**Honest data picture (do not oversell).** There is **no** in-app SM-2/FSRS due
scheduler — local decks use a binary `known` flag
([flashcardDeck.ts](src/renderer/flashcardDeck.ts)), and Anki intervals
([intervals.ts](src/main/anki/intervals.ts), `IntervalSnapshot` in
[anki.ts](src/shared/anki.ts)) drive knowledge tinting, not next-review dates.
`computeStudyVerdict` in `findingModules.ts` already uses a soft "backlog"
heuristic from learning/familiar word counts.

**Work.** Blanc-native read-only stats panel that composes what we can tell
truthfully:
- **Local backlog:** unknown / not-`known` card counts per deck (same pool
  Flashcards already calls "due").
- **Knowledge load:** familiar/learning bands from `knownWords` /
  Anki interval snapshot.
- **True week forecast (when AnkiConnect is up):** extend the Anki client to
  query due cards / due dates (read-only `findCards` + `cardsInfo`), bucket by
  day for the next 7 days, and show buried-vs-manageable. When Anki is
  disconnected, show local + knowledge views and an honest "connect Anki for
  day-by-day forecast" empty state — do not invent fake due dates from interval
  length alone.

**Definition of done:** open panel → see backlog and (if Anki connected) a 7-day
load chart; no write path; Pillar 0 chrome only.

### Placement vs other tracks

- Prefer this list over the OCR / shadowing adapters in Explicitly deferred when
  choosing the next Blanc feature session.
- Clipboard auto-lookup and audio mine both feed Pillar 7's mining chain and
  Pillar 5's console — wire them into those pillars rather than as isolated
  toys.
- Master search (Pillar 6) should eventually reach these tools by id/keyword once
  registered.
- Drift tooling: new modules are Blanc-only surfaces — mark them
  `deliberately-excluded` on the Study OS side of `blanc-coverage.json` (or a
  Blanc-owned inventory), not as Study OS parity gaps.

---

## Explicitly deferred

The 20 remaining `adapter-needed` modules stay planned and stay invisible in the
launcher. **Do not build these ahead of the study-native track above.** If any
generic adapters get built later, prefer these — they serve the app's actual
purpose and the expensive dependency is already paid for:

- `screenshot-dictionary`, `clipboard-ocr`, `global-ocr` — the OCR stack already
  exists (`tesseract.js` installed; `mangaOcr:recognizeImage` is a general
  data-URL → Japanese text endpoint at [mangaOcr.ts:1637](src/main/mangaOcr.ts:1637); a second
  engine in `paddleOcr.ts`). These need `desktopCapturer` / `clipboard.readImage`
  wiring — both Electron built-ins — plus an "OCR model not installed" state,
  since `mangaOcrAvailable()` gates on downloaded assets
  ([mangaOcr.ts:94](src/main/mangaOcr.ts:94)). Note: clipboard **text**
  auto-lookup is study-native item 1 above and does not wait on OCR; image-OCR
  from clipboard remains here.
- `shadowing-player` — `getUserMedia` + `MediaRecorder`, ffmpeg-static installed.

Genuinely blocked without a native module (nut.js / iohook): `macro-recorder`,
`text-expander`. Blocked only at full scope: `hotkey-manager` and `window-layouts`
(Blanc's own windows are fine; controlling *other* apps' windows needs Win32 FFI).

Dep-gated, not blocked: `pdf-toolkit` (needs `pdf-lib` to write; `pdfjs-dist`
already reads), `qr-barcode` (needs `jsQR` — `BarcodeDetector` is unreliable on
Chromium/Windows).

## Doc debt to clear alongside

- `TOOLBOX_COMPLETION_AUDIT.md` says "51 modules / 30 adapter-needed"; it is now
  **50 modules, 30 ready / 20 planned**.
- Every planned module carries boilerplate `migrationNotes` claiming it needs a
  native adapter. That is false for most of them (see above) and it misled a
  session on 2026-07-20. Re-tier by actual blocker.
