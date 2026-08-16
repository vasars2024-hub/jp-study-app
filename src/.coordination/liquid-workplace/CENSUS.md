# L0 census — routes, controls, commands, settings, tests, visual states

Milestone: **L0-baseline-1**. Generated 2026-08-16 from `feat/nyaa-subtitles` at `da154966`.

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` L0 and §10.1. This is the row set
`PARITY_LEDGER.md` is built from. Regenerate with:

```
node tools/liquid-census.cjs          # table
node tools/liquid-census.cjs --json   # machine-readable, incl. per-app owned file list
```

Numbers, never adjectives — and the tool prints the pattern behind every column so the
count can be argued with rather than believed.

## Method

- The row set is the **`DesktopWinSection` union** in `src/shared/desktop.ts`, which is the
  same canonical list `tools/blanc-drift.cjs` uses. **25 sections.**
- Each section's root component comes from the `switch (section)` in
  `src/renderer/components/AppSection.tsx` — the shared route seam that both the in-desktop
  `FloatingWindow` (DesktopShell) and the pop-out window (App) go through.
- An app's files are its **transitive local import graph** from that root.
- Files reached by **≥ 11 of the 21** distinct entries are **shared core** (163 files) and
  belong to no app. The rest are **partitioned** by fewest import hops, ties to the smaller
  graph.

### Why partitioned and not exclusive — the first false count this census produced

The first run counted a file as an app's only if **no other section** reached it. Under that
rule `library`, `novels`, `player`, `video`, `music` and `reading` all reported **0 files and
0 LOC**. None of them is empty. `player`/`video`/`music` are one `MediaCenterView`, so every
file in it had three owners and survived as none; `novels`/`reading` are one
`ReadingWorkspaceView`. **An empty app and a shared root are indistinguishable under raw
exclusivity**, and 0 would have gone into the ledger as a size. The partition fixes it.

## The table

```
section     component                 own  graph  loc   ctrl cmd set test i18n states
----------- ------------------------- ---- ------ ----- ---- --- --- ---- ---- ---------------------------
agent       AgentWorkspaceShell       68   303    17447 173  24  32  141  252  empty/error/loading/offline
library     LibraryView               23   180    5805  134  24  0   62   136  empty/error/loading/offline
novels      ReadingWorkspaceView      12   194    6756  110  18  1   9    141  empty/error/loading/offline
dictionary  DictionaryView            50   235    10158 97   24  1   129  188  empty/error/loading/offline
grammar     GrammarView               34   199    47201 130  2   0   39   128  empty/error/loading/offline
notebook    NotebookView              9    174    2051  22   1   0   15   21   empty/error
translate   TranslateView             14   246    2404  40   5   0   81   31   empty/error/loading/offline
player      MediaCenterView           123  415    37713 816  100 124 173  1266 empty/error/loading/offline
video       MediaCenterView           123  415    37713 816  100 124 173  1266 empty/error/loading/offline
music       MediaCenterView           123  415    37713 816  100 124 173  1266 empty/error/loading/offline
anki        AnkiView                  66   233    21525 389  36  12  134  579  empty/error/loading/offline
flashcards  FlashcardsView            39   229    12018 471  33  0   71   631  empty/error/loading
games       GameArenaView             20   155    7255  53   9   8   55   105  empty/error/loading/offline
stats       StatisticsView            7    172    1479  26   4   1   44   56   empty/error
resources   ResourcesView             12   83     2512  49   9   0   6    34   empty/loading/offline
settings    SettingsApp               179  425    46414 1307 83  67  156  1423 empty/error/loading/offline
note        (none)                    -    -      -     -    -   -   -    -    NO SHARED ROUTE
visualizer  VisualizerWidget          3    14     561   0    0   6   10   0    none
musicwidget MusicWidget               8    58     967   18   3   0   36   2    empty/error/loading
city        ReadingGarden             1    1      1111  10   0   0   0    0    none
immersion   ImmersionView             37   297    9333  359  49  0   52   427  empty/error/loading
calendar    CalendarView              3    152    965   68   0   0   22   44   none
reading     ReadingWorkspaceView      12   194    6756  110  18  1   9    141  empty/error/loading/offline
youtube     YouTubePlaylistsView      7    89     1693  70   16  2   12   51   empty/error/loading
scraper     ScraperView               63   363    19785 367  24  25  67   200  empty/error/loading/offline
```

**21 distinct root components serve 24 routed sections.** Deduplicated totals: **778 owned
files, 255,153 LOC, 4,709 controls, 464 command references, 5,715 i18n keys**, plus **163
shared-core files** excluded from every app.

## Findings

1. **`note` has no shared route — 24 of 25 sections go through `AppSection.tsx`, `note` does
   not.** There is no `case 'note'` in the switch; `DesktopShell.tsx:1456` pushes
   `{ section: 'note' }` windows directly, and the file's own comment says "Notes stay
   desktop-coupled". **Consequence for L3:** an opt-in Liquid presentation applied at the
   `AppSection` seam reaches 24 sections and silently misses Note. §7 lists Note as an app
   with its own Liquid row, so this is a ledger row, not a curiosity.

2. **25 sections are 21 components.** `player`/`video`/`music` are one `MediaCenterView`
   separated only by `initialTab` (`library`/`video`/`music`); `novels`/`reading` are one
   `ReadingWorkspaceView` separated only by `initialSection` (`plan`/`discover`). The ledger
   row set is therefore **components with route variants**, not 25 independent apps — and a
   change to `MediaCenterView` lands on three §7 rows at once.

3. **`MediaWorkspaceCompatibilityView` is exported and imported by nobody.**
   `AppSection.tsx:15` exports it "for older deep links and recovery callers"; a repo-wide
   search finds **zero** importers — every other match is a comment, a test asserting its
   *absence*, or ledger prose. `MAIN_V1_EVIDENCE_LEDGER.md:12925` says the export is
   deliberately retained, so this is **recorded, not filed as a defect**. It is not a
   reachable route and must not be counted as one.

4. **Settings is the largest surface in the product by a wide margin** — 179 owned files,
   46,414 LOC, **1,307 controls**, 1,423 i18n keys, 83 command references, 67 settings keys.
   That is more controls than `flashcards` + `anki` + `scraper` combined (1,227). §7's parity
   focus for Settings is "every registered setting", so it owns the largest single row set in
   the whole ledger and should not be scheduled as one wave-sized unit.

5. **Three sections show none of the four §10.1 state words**: `city` (ReadingGarden),
   `calendar` (CalendarView), `visualizer`. `calendar` is the one that matters — 68 controls
   and **0** occurrences of empty/loading/error/offline in its owned files. This is a
   **candidate**, not a finding: the census counts words, and rubric category 8 requires the
   state be *driven live*. Carry it to the live baseline as the first thing to probe.

6. **`grammar` carries 47,201 LOC across 34 owned files** — the highest LOC-per-file of any
   app and higher than Settings' total despite a fifth of the files. Expect generated or
   table-shaped data in that graph; confirm before treating it as UI surface to migrate.

## What this census does NOT establish

- **Reachability.** It counts what is *rendered in source*, not what a user can get to. Every
  control here still needs the live baseline (§10.1) before a parity row may close.
- **That a state renders.** `visualStates` matches identifiers and key fragments. A section
  showing `error` may still fail silently; a section showing `none` may still handle failure
  under another name.
- **Ownership in the design sense.** Min-depth partitioning attributes generic
  infrastructure to whichever app reaches it shallowest — `youtube`'s owned list contains
  `renderer/hooks.ts`, `VirtualList.tsx` and `blancMode.ts`, which YouTube does not own in
  any meaningful sense. Read `own` as **"size of the graph this app is nearest to"**, never
  as a claim of authorship.
- **Anything about Blanc, Aero or Wired.** This is the Study OS section seam only. Blanc gets
  its own native matrix per §10.2 and already has `tools/blanc-drift.cjs`.
