# Liquid Study Workspace — delivery report

Companion to `LIQUID_WORKSPACE_AUDIT.md`. Phases 1–7, 2026-08-06/07.

Every number here was measured in this session — vitest output, `tsc` counts, or the
live DOM of `video-study-harness.html`. Nothing is recalled.

---

## Baseline, before any edit

| | |
| --- | --- |
| Player suites | 5 files / **66 tests**, all passing |
| `tsc --noEmit` | 328 errors, none under `src/media` (327 recorded previously on a clean tree; the repo carries ~1,000 uncommitted paths from four tracks) |
| `i18n-check` | exit 0 |

## Result, after

| | |
| --- | --- |
| **Full suite** | **414 files / 5,474 tests — all passing** (was 403 / 5,272 before detach) |
| `eslint src/media` | 0 errors, **0 warnings** over the project's own `.ts`/`.tsx`. The 108 problems the bare `eslint src/media` reports are all in `src/media/jassub/` — vendored third-party worker JS and WASM, not written here. Lint with `--ignore-pattern "src/media/jassub/**"` to see the number this row is about. |
| `tsc --noEmit` | zero errors under `src/media`, `src/shared/studyWorkspace.ts`, `src/shared/studyDetach.ts` or `src/main/studyBlockWindows.ts` (the repo as a whole carries 332 pre-existing errors elsewhere; this row is a scoped claim, not a clean-tree claim) |
| `i18n-check` | exit 0 — 8,567 English keys, all present in ja/zh/ru |

---

## What was changed

### New

| File | What it is |
| --- | --- |
| `src/shared/studyWorkspace.ts` | the model: block/workspace types, 7 presets, reducer with undo/redo, contextual placement, responsive rules, schema versioning, repair, export/import. Pure — no React, no DOM, no storage. |
| `src/shared/__tests__/studyWorkspace.test.ts` | 37 tests over that model |
| `src/media/studyBlockRegistry.ts` | 31 Study Block definitions with sizes, placements, pin/auto-hide/detach and an honest `availability` |
| `src/media/StudyWorkspaceProvider.tsx` | storage, viewport, idleness, Escape; per-surface, never global |
| `src/media/StudyBottomBar.tsx` | the 5-category adaptive bar |
| `src/media/StudyToolSheet.tsx` | one temporary tool surface at a time, Escape + outside-click + focus return |
| `src/media/StudyDocks.tsx` | places blocks into left / right / bottom / floating / overlay |
| `src/media/StudyBlockMenu.tsx` | per-block menu — and the **non-drag** path for every layout change |
| `src/media/StudyBlocks.tsx` | HUD, media info, mining queue, listening, AI workspace, app-owned routing |
| `src/media/StudyWorkspaceCustomizer.tsx` | Customize mode: workspace manager, block library, undo/redo, reset, export/import |
| `src/media/studyWorkspace.css` | the liquid layer, transcript hierarchy, motion, reduced-motion |
| `docs/ACTIVE/LIQUID_WORKSPACE_AUDIT.md` | the pre-work audit (deliverables 31.1–31.8) |

Added 2026-08-07, when detach shipped (see "Detached windows" below):

| File | What it is |
| --- | --- |
| `src/shared/studyDetach.ts` | the detach contract, pure: the routable block lists, window-id encode/parse, the `StudyDetachSnapshot` frame and its merge, cue trimming, command parsing, bounds sanitising and work-area centring |
| `src/shared/__tests__/studyDetach.test.ts` | 26 tests over that contract |
| `src/main/studyBlockWindows.ts` | main-process window manager: opens/closes/lists detached windows, remembers each rectangle, routes frames, registers the `studyblock:*` IPC |
| `src/main/__tests__/studyBlockWindows.test.ts` | 22 tests over the window manager |
| `src/media/useStudyDetach.ts` | the renderer half of the bus — `StudyDetachContext`, the publish loop, and `available` (false with no Electron bridge) |
| `src/media/DetachedStudyBlock.tsx` | what a detached window renders; carries its own `id="media-workspace"` scope root so the panel is styled outside the player |
| `src/renderer/__devharness__/detachedBlockHarness.tsx` + `detached-block-harness.html` | the six hosted blocks rendered against a fake bridge at the rectangles main opens them at |

### Modified

`VideoCoreStudyOverlay.tsx` (2,454 → 2,390 lines, now a composition root),
`VideoCoreTranscriptPanel.tsx`, `StudyPlayerSlice.tsx`, `MediaPlayerSurface.tsx`,
`MediaSurfaceShell.tsx`, `mediaWorkspace.css`, `keyboardShortcuts.ts`,
`videoStudyLayout.test.ts` (rewritten, 23 → 24 tests, then → 35 with the detach wiring
contract), `musicCueNavCommands.test.ts` (count control updated 13 → 19),
`videoStudyHarness.tsx`, all four i18n catalogs (+118 keys each),
`i18n-untranslated-baseline.json` (+1 acronym per language).

For detach: `studyBlockRegistry.ts` (`canDetach` opt-outs with reasons),
`StudyBlockMenu.tsx` (the Detach / Reattach / Send-to-display items),
`VideoCoreStudyOverlay.tsx` (publishes the frame), `App.tsx` (routes a detach-target
window to `DetachedStudyBlock`), `main.ts`, `preload.ts`, `window.d.ts`
(the `studyblock:*` channels) and the four catalogs again.

**Untouched, as promised**: the directstream open protocol, `MediaSurfaceShell`'s
provider stack, `seanimeSocketPool`, `mediastreamTranscode`, `vendor/`, `patches/`.

---

## Measured: the defect is gone

From the live harness DOM at a 1280px stage. The "before" column is the collision this
redesign was commissioned to fix, as recorded in the old `videoStudyLayout.test.ts`.

| | before | after, sheet closed | after, More sheet open |
| --- | --- | --- | --- |
| subtitle covered by the control surface | **644 × 69 px** | **0** | **0** |
| subtitle covered by the right column | 12 × 294 px (grammar × mining) | **0** | **0** |
| control surface height | 56 px → 275 px when expanded | 45 px | **45 px** (the sheet renders above it) |
| `--study-dock-height` | 3.5 rem constant | 45 px | 163 px (measured, so the cue clears the sheet) |
| subtitle box | shrank as panels opened | 736 × 73 px | **736 × 73 px, unchanged** |

Transcript hierarchy, measured on the live rows:

| band | opacity | size |
| --- | --- | --- |
| active | 1.00 | 16.96 px |
| near (±1) | 0.86 | 14 px |
| mid (±4) | 0.62 | 14 px |
| far | 0.34 | 13.44 px |
| past | 0.26 | 13.44 px |

The grammar panel's own absolute corner is genuinely overridden inside a dock —
verified live by wrapping a real panel: `position` went `absolute` → `static`.

---

## Features preserved

Checked by assertion, not by inspection (`videoStudyLayout.test.ts`, "preservation"):

- **All 13 `video.*` command registrations** still owned by the overlay (plus 6 new
  `workspace.*` rows), and still disjoint from the music pane's `music.*` set.
- **All 18 `VideoCoreStudyPreferences` keys** and their storage key, untouched.
- **All 4 `data-study-action` and 9 `data-study-pref` hooks** the harnesses select on.
- **Every control the retired dock owned** — asserted by its i18n key, the one
  identifier a control cannot lose without changing what it says: frame stepping,
  speed, seek step, subtitle offset, primary/dual subs, pause-on-lookup, translate
  line, font size/weight/background/outline/family, timing readout, practice radio,
  A–B loop, subtitle/secondary/audio track pickers, Whisper device/model/language/
  generate/stop.
- `<VideoCore>` is still mounted unconditionally, outside the workspace provider —
  asserted structurally, because unmounting it drops `vc_activePlayerId` and kills
  subtitle streaming.
- The mine shortcut still has a target: `cardEditor` is kept mounted while hidden.
- Resume, watch-time ledger, transcode fallback, directstream watchdogs, external
  subtitle mounting and the ffmpeg sync correction were not touched at all.

## Tests added

| Suite | Tests |
| --- | --- |
| `studyWorkspace.test.ts` (new) | 37 — presets, reducer, contextual least-disruption, responsive folding, priority order, migration, repair of a corrupt document, export/import |
| `videoStudyLayout.test.ts` (rewritten) | 35 — geometry contract, preservation contract, Watch-Mode contract, and the detach wiring contract |
| `studyDetach.test.ts` (new) | 26 — honesty of the detachable set, window-id round-trip, snapshot merge, cue trimming, command parsing, bounds sanitising |
| `studyBlockWindows.test.ts` (new) | 22 — open/close/list, rectangle persistence across close and reopen, frame routing, display targeting |

All green. Full suite green: **5,474 tests** in 414 files.

---

## Known limitations

1. **No screenshots.** The Browser pane was hidden for this session and the one that
   shipped detach, so it could not composite frames — `computer{screenshot}` fails
   with "the page is not compositing frames" rather than returning a blank image.
   Geometry, text content and computed styles were read directly off the live DOM
   instead — the numbers above — which is stronger evidence for these particular
   claims than an image would be. A screenshot pass over `video-study-harness.html`
   and `detached-block-harness.html` will produce the images whenever the pane is
   visible.
2. **Drag-and-drop is menu-first.** Every move/dock/float/overlay/resize is reachable
   from the block menu and the customizer (the accessible path, which is mandatory).
   A pointer drag layer on top of that is not yet built.
3. **Detach has not been run in the packaged app.** The window manager, the IPC and
   the panel are unit-tested and the panel was rendered live in a browser against a
   fake bridge, but nobody has yet dragged a real transcript onto a second monitor —
   the Electron app is the user's to start. What is unverified is the Electron seam
   specifically: real `BrowserWindow` creation, real display enumeration, and the
   publish loop under a real player.
4. **`bookmarks`, `ocr`, `waveform`, `playlist` and pronunciation scoring are
   registered but withheld.** None exists for video in this app — the app's bookmarks
   belong to the novel reader and its OCR to manga/books. They are `planned` in the
   registry, so a saved layout naming one is repaired rather than rejected, and the
   block library never offers them. Nothing renders as an empty card.
5. **Practice Mode covers shadowing, dictation and listening.** Repetition, pronunciation
   and comprehension are workspace *kinds* in the model but resolve to the listening
   block today, because no separate drill exists behind them.

## Acceptance criteria

Met: default player is not a dashboard; video dominates Watch Mode (no side dock at
all, asserted); configuration is out of the active player (Whisper and appearance live
behind More, and already had a settings home); every feature remains available;
contextual panels appear only on intent and close predictably on Escape; the transcript
has a real active-line hierarchy; the bar carries 5 categories plus the cue loop;
practice/review/mining/listening recompose the workspace; users can create, resize,
dock, float, hide, export and import layouts; normal users never customise anything;
saved workspaces restore and repair; narrow windows fold docks to sheets; keyboard
access is complete; no block is a visual placeholder; a new Study Block is a definition
plus a renderer entry, with no layout change.

Multi-monitor detach was originally shipped short and is now met as well: ten blocks
are detachable — six hosted by `DetachedStudyBlock` (transcript, grammar, aiWorkspace,
miningQueue, mediaInfo, studyHud) and four routed to their existing app section (notes,
library, statistics, review) — with "Send to display" reading the real display list off
the OS. The detachable set is not a second hand-maintained list: `canDetach` defaults to
true in the registry's `def()` factory and 21 of 31 definitions opt out, each with the
reason written at the definition (`video` would be a second `<VideoCore>` mount;
`cardEditor` and `cardPreview` capture screenshot and audio off a `<video>` a second
renderer does not have; `dictionary` is anchored to the word that was clicked).
`studyDetach.test.ts` asserts that set against the routing tables in both directions,
so a block cannot become routable without becoming detachable or vice versa.

All acceptance criteria are met. The remaining gap is verification, not function —
limitation 3.
