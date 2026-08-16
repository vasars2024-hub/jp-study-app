# §10.1 live baseline — every app

Milestone **L0-baseline-1**. Captured 2026-08-16 on `feat/nyaa-subtitles` against the process
cold-started at 21:05 (`PERF_BASELINE_RESTART.md`). Instrument:
`tools/liquid-app-sweep.ps1` → `tools/liquid-surface-baseline.ps1`, driven through the debug
bridge, never read from source. Raw records: `baselines/L0-baseline-1/<surface>-{default,min,max}.json`,
index `baselines/L0-baseline-1/sweep-summary.json`.

Video has its own document (`VIDEO_BASELINE.md`) and is repeated here for comparison only.

## What the sweep does, and the two rules it will not bend

It opens each app from **its own Start-menu row** — the product's real open path, so the box it
measures is the geometry the product actually creates — and it **closes only windows it opened**.
`Scraper` and `Anki` were on the desk at entry (the boot layout, persisted state) and were
measured in place and left byte-identical. Desk window set at entry == at exit, asserted by the
sweep on every run.

## The 22 surfaces, at their default size

`foc` = visible enabled focusables · `u24`/`u44` = focusables under 24 px / 44 px in some axis ·
`inv` = DOM-vs-reading-order inversions (a **number, not a defect** — see `VIDEO_BASELINE.md`) ·
`unreach` = boxes past the window frame with **no scrollable ancestor**, at default/min/max.

| Surface | Default box | foc | routes | u24 | u44 | inv | DOM | scrollersY | unreach d/min/max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| agent | 820×580 | 29 | 8 | 0 | 25 | 14 | 281 | 1 | 0 / 0 / 0 |
| anki | 820×580 | 21 | 0 | 1 | 16 | 12 | 248 | 1 | 0 / 0 / 0 |
| calendar | 820×580 | 13 | 0 | 0 | 13 | 7 | 168 | 1 | 0 / 0 / 0 |
| **city** (Garden) | 680×705 | 8 | 0 | 1 | 7 | 0 | 130 | 0 | **19** / **81** / not recorded |
| dictionary | 820×580 | 10 | 0 | 2 | 10 | 0 | 38 | 0 | 0 / 0 / 0 |
| flashcards | 820×580 | 98 | 3 | 37 | 94 | 57 | 551 | 3 | 0 / 0 / 0 |
| game arena | 980×660 | 21 | 0 | 0 | 6 | 13 | 142 | 1 | 0 / 0 / 0 |
| **grammar** | 820×580 | **4839** | 0 | **2412** | 4818 | 4827 | **19350** | 1 | 0 / 0 / 0 |
| immersion | 820×580 | 1046 | 0 | 512 | 534 | 13 | 3652 | 1 | 0 / 23 / 0 |
| library | 820×580 | 40 | 0 | 0 | 40 | 0 | 447 | 1 | 0 / 0 / 0 |
| media (MediaCenter) | 1080×700 | 28 | 16 | 1 | 19 | 23 | 203 | 0 | 0 / 49 / 0 |
| music (MediaCenter) | 1080×700 | 31 | 8 | 4 | 23 | 23 | 248 | 1 | 0 / 39 / 0 |
| notebook | 820×580 | 480 | 6 | 0 | 63 | 15 | 3854 | 2 | 0 / 0 / 0 |
| novels | 820×580 | 37 | 9 | 1 | 30 | 15 | 228 | 2 | 1 / 11 / 0 |
| **reading finder** | 820×580 | 33 | 7 | 0 | 25 | 0 | 175 | 0 | **41** / **108** / 0 |
| resources | 820×580 | 77 | 0 | 2 | 17 | 2 | 935 | 1 | 0 / 0 / 0 |
| scraper | 820×580 | 125 | 23 | 57 | 100 | 105 | 825 | 2 | 0 / 22 / 0 |
| settings | 960×680 | 44 | 34 | 0 | 33 | 23 | 245 | 2 | 0 / 2 / 0 |
| statistics | 820×580 | 9 | 0 | 0 | 9 | 0 | 185 | 1 | 0 / 0 / 0 |
| translate | 820×580 | 14 | 1 | 0 | 13 | 6 | 44 | 0 | 0 / 0 / 0 |
| video (MediaCenter) | 1080×700 | 32 | 8 | 1 | 17 | 17 | 295 | 1 | 0 / 27 / 0 |
| youtube | 980×640 | 14 | 3 | 2 | 12 | 10 | 77 | 0 | 0 / 0 / 0 |

Environment for every capture: viewport 1264×821, dpr 1, `data-theme=forest-night`, no
`data-materials` attribute, `prefers-reduced-motion` false, `forced-colors` false.

## Finding 3 — two surfaces lose content at the size the product itself opens them

Every other surface reads `unreach = 0` at default, so this is not the metric being noisy.

- **Reading Finder: 41 unreachable at 820×580**, its own opening geometry — and **0 when
  maximized**. The window the product creates is smaller than the layout it renders, with no
  scroller to reach the remainder.
- **Mooncap Garden: 19 unreachable at 680×705**, and it is the one window with **no maximize
  control** (`isGarden` renders `fwin-frameless`), so the escape hatch that fixes Reading Finder
  does not exist here. Its default height is also clamped by the desk (`open()` asks 800, gets
  705).

## Finding 4 — at minimum size, 9 of 22 surfaces drop content unreachably

260×170 is `MIN_W`×`MIN_H` (`DesktopShell.tsx:266`), a size the shell itself permits:
reading finder **108**, city **81**, media **49**, music **39**, video **27**, immersion **23**,
scraper **22**, novels **11**, settings **2**. The three MediaCenter routes lose their own rail
(see `VIDEO_BASELINE.md` finding 1). The remaining 13 surfaces read 0 — they reflow or scroll.

## Finding 5 — Grammar renders 19,350 DOM nodes with no virtualization

**4,839 focusables (2,426 button + 2,412 input), 2,412 of them under 24 px** — the `Select this
point` checkbox, one per grammar point, all mounted at once inside a single scroller. Identical
counts at 260×170, 820×580 and 1264×765, so nothing is windowed. CLAUDE.md's performance section
requires virtualizing large rendered collections; this is the largest violation in the tree.
Immersion (3,652 nodes / 1,046 focusables) and Notebook (3,854 / 480) are the next two.

This is recorded as a **baseline fact, not a wave assignment**. Rubric category 7 is scored
against it later; whichever wave owns Grammar inherits it.

## Finding 6 — the census counts source, this counts pixels, and Dictionary shows why

`CENSUS.md` credits DictionaryView with 97 controls; the live default surface renders **10
focusables in 38 DOM nodes and 251 characters** — a search field, two language toggles, a notes
filter, and the four title-bar buttons. Nothing is broken: it is a search-first surface whose
result and detail states are simply not on screen with an empty query. **The census ceiling and
the live count are different measurements and neither substitutes for the other** — the parity
ledger's rows come from behavior observed here, and the census bounds how many there can be.

## Rendered states, verbatim

`stateBlocks` carries the literal text; `states.*` booleans remain a hint only (the keyword form
returned all-false on a screen reading "Video playback needs the media server"). Present at
default size: agent ("This prompt stays on this device."), immersion ("Open a page to begin
immersion reading…"), music ("No audio in your media library yet…"), notebook ("No scripts yet.
Captions are only recorded while capture is on."), scraper ("Select a title to see why it was
recommended."), statistics ("Beginner · Estimated level…"), video (2 blocks, see its own doc),
youtube ("Refreshing 1/1 オノマトペ"). All eight are **honest** — each names its cause or its
next action. The other 14 surfaces rendered no state block, which means none was on screen, not
that none exists.

## Instrument changes this run, and why each was forced

1. **A fixed 700 ms sleep is not a settle.** Immersion's first `default` record read **4
   focusables**; the same surface read **1,046** seconds later. A loading skeleton had been filed
   under the name `default` — a false baseline every later scorecard would be compared against.
   The harvest now polls node/control counts until two consecutive samples agree (400 ms tick,
   12 s cap) and every record carries `settle.settled` + `waitedMs`. All 22 surfaces settled;
   most in 1,200 ms, resources in 1,600 ms.
2. **A window with no maximize control must refuse, not duplicate.** The Garden has no maximize
   button, so the old code clicked nothing and recorded the unchanged default box **under the
   name `max`** — three sizes claimed, two measured. It now writes `NOT RECORDED` with the
   reason.
3. **A frameless window has no title and cannot be addressed by one.** `-Selector` targets the
   element directly and `-Title` becomes the record's label. Without it the Garden was skipped
   entirely with a parameter-binding error, i.e. a whole app silently missing from the baseline.

Regression check on 2 and 3: Dictionary re-run after the refactor reproduced its earlier record
exactly (10 / 0 / 2 / 0 at all three sizes).

## The entry point none of the app lists has: the desktop context menu

Right-clicking the desk (`.os-desktop`, `contextmenu`) opens a 6-item menu that is not in the
Start menu, not a desk icon, and not in `CENSUS.md`'s 25 sections: **`New sticky note`,
`New app shortcut…`, `Widgets…`, `Close all apps`, `Personalize…`, `Desktop & display
settings`**. Two of the three previously-unreachable surfaces are behind it.

**`note` is now captured** — `Sticky note`, **260×220, 2 focusables, 0 unreachable at default
and at minimum, no maximize control** (`baselines/L0-baseline-1/sticky note-{default,min}.json`).
The frameless guard fired here for the second time and correctly refused to record a `max`.
That makes **23 surfaces** in this milestone.

`Widgets…` opens a **widget gallery of 27 cards** across tabs All/Favorites/Recent/Productivity/
Study/Music/Statistics — Digital Clock, Analog Clock, Calendar, Pomodoro, Stopwatch, World
Clock, Daily Goals, Habit Tracker, Countdown, To-do, Study Streak, Today's Study Time, Reading
Progress, Vocabulary Progress, JLPT/HSK Progress, Word of the Day, Continue Watching, Music
Player, Learning Heatmap, Learner Map, Calculator, Recent Lookups, Clipboard, CPU, Memory,
Battery, Network. **That is a whole surface class absent from the census's section list**, and
the parity ledger will need rows for it.

## Not captured, and exactly what it would take

- **`visualizer`**, **`musicwidget`** — `open()` via `DesktopSettings`' `onOpenVisualizer` /
  `onOpenMusicWidget` (`DesktopShell.tsx:2488`). The Settings window was opened live and its
  Media·Visualizer tab searched; **no button matching `/visual|widget|open/i`** was rendered, so
  the live entry point is not where the prop suggests. The widget gallery has a `Music Player`
  card but no Visualizer card.
- **Unresolved, stated as unresolved:** clicking `Add` on the gallery's `Music Player` card
  produced **0 `.widget-frame`** elements, and afterwards that card was **indistinguishable from
  an untouched card** (both read `Add`). So either the add did not take, or widgets mount under
  a selector this probe does not know. One click is not enough to call a control dead — it is
  recorded as an open question for whichever wave owns widgets, not as a finding.

Also still open, unchanged from `VIDEO_BASELINE.md`: loading/offline states not on screen during
capture, and playing-clip measurements including frame stability, which need a real clip.

## Harness incident, recorded because it nearly corrupted the boot layout

Hunting for the gallery's close control, a probe clicked the first button matching
`/close/i` **anywhere in the document** and closed the **Scraper** window — part of the persisted
boot layout, not scratch. Restored by reopening it from Start (which places at 94,54, not its
boot 60,24) and dragging it back through the product's own commit path; verified against
`scraper-default.json`'s recorded rect: **60,24 820×580, and Anki 94,54 820×580** — both exact.
The lesson is the sweep's own rule, which this ad-hoc probe had stepped outside of: **scope every
click to the element you are operating on**. `.widget-gallery .widget-b` was the right selector.

Also still open, unchanged from `VIDEO_BASELINE.md`: loading/offline states not on screen during
capture, and playing-clip measurements including frame stability, which need a real clip.
