# Feature parity ledger — L0

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §5.3 and §10.1. This ledger plus
the protected-system matrix are what the **L0 gate** requires before any Liquid product
code may land.

## Schema

§5.3's row shape, one row per feature:

```text
app | feature | current route/control | standard destination | liquid destination |
keyboard route | data/state owner | automated proof | visual proof | status
```

## Rules, from §5.3 and the rubric's category 6

- **Count behavior, not buttons.** "Mine sentence" is one row only if fields, media
  preview, destination deck, error states and undo/retry are all inside it; otherwise they
  are their own rows.
- A row is closed by an **observable side effect**, never by a button's presence. A parity
  check that has never caught a missing feature has never been shown to work.
- A feature is complete only when **both** standard and Liquid destinations work.
- Every moved control must retain a search/keyboard route.
- New UI cannot land with `pending` parity rows.
- The ledger must cover **settings and recovery paths**, not only happy-path actions.
- Status vocabulary: `pending` (no Liquid destination yet) · `standard-only` (deliberately
  never going Liquid — needs the reason inline) · `both` (verified in each, by side effect)
  · `REGRESSION` (reachable in one and not the other — blocks the wave).

## Status of this ledger

**Row set: census DONE, ledger rows NOT YET WRITTEN. The L0 gate is OPEN — no Liquid
product code may land.**

`CENSUS.md` (milestone L0-baseline-1, `da154966`) supplies the row set: **25 Study OS
sections served by 21 distinct root components**, 778 owned files, 255,153 LOC, **4,709
controls**, 464 command references, 5,715 i18n keys. Regenerate with
`node tools/liquid-census.cjs`.

Two census findings change the shape of this ledger and are not optional detail:

- **`note` has no route through `AppSection.tsx`** (24 of 25 sections do). A Liquid
  presentation applied at that seam misses Note entirely, so Note needs its own row set and
  its own entry point — see census finding 1.
- **A row is per component-with-route-variant, not per §7 app.** `player`/`video`/`music`
  are one `MediaCenterView` differing only by `initialTab`; `novels`/`reading` are one
  `ReadingWorkspaceView` differing only by `initialSection`. One change lands on three §7
  rows at once — see census finding 2.

| Component (sections served) | Controls | Commands | Census | Ledger rows | Closed by side effect |
| --- | --- | --- | --- | --- | --- |
| SettingsApp (settings) | 1307 | 83 | done | 0 | 0 |
| MediaCenterView (player, video, music) | 816 | 100 | done | 0 | 0 |
| FlashcardsView (flashcards) | 471 | 33 | done | 0 | 0 |
| AnkiView (anki) | 389 | 36 | done | 0 | 0 |
| ScraperView (scraper) | 367 | 24 | done | 0 | 0 |
| ImmersionView (immersion) | 359 | 49 | done | 0 | 0 |
| AgentWorkspaceShell (agent) | 173 | 24 | done | 0 | 0 |
| LibraryView (library) | 134 | 24 | done | 0 | 0 |
| GrammarView (grammar) | 130 | 2 | done | 0 | 0 |
| ReadingWorkspaceView (novels, reading) | 110 | 18 | done | 0 | 0 |
| DictionaryView (dictionary) | 97 | 24 | done | 0 | 0 |
| YouTubePlaylistsView (youtube) | 70 | 16 | done | 0 | 0 |
| CalendarView (calendar) | 68 | 0 | done | 0 | 0 |
| GameArenaView (games) | 53 | 9 | done | 0 | 0 |
| ResourcesView (resources) | 49 | 9 | done | 0 | 0 |
| TranslateView (translate) | 40 | 5 | done | 0 | 0 |
| StatisticsView (stats) | 26 | 4 | done | 0 | 0 |
| NotebookView (notebook) | 22 | 1 | done | 0 | 0 |
| MusicWidget (musicwidget) | 18 | 3 | done | 0 | 0 |
| ReadingGarden (city) | 10 | 0 | done | 0 | 0 |
| VisualizerWidget (visualizer) | 0 | 0 | done | 0 | 0 |
| **Note (note)** | — | — | **NO SHARED ROUTE** | 0 | 0 |

The `Controls` column is a **ceiling on the row count, not the row count**. §5.3 counts
behavior, not buttons: several controls collapse into one row ("Mine sentence" includes
fields, media preview, destination deck, error states and undo/retry), while one control
that branches on state may become several. Rows are written per app during its own wave,
against the live baseline — never from this table alone.

## Protected-system matrix

§8: these must survive every wave unchanged unless a wave explicitly owns them. A row here
is a **freeze**, not a feature — breaking one is a release blocker, not a parity gap.

| Protected system | Owner | How a break is observed | Verified |
| --- | --- | --- | --- |
| Secret Aero discovery and exit | Aero shell | | |
| Aero safe mode | Aero shell | | |
| Wired lifecycle | Wired shell | | |
| Taskbar shell | Study OS shell | | |
| Desktop shortcut grid | Study OS shell | | |
| Display assignments | Shell/window mgr | | |
| Window dragging | Shell/window mgr | | |
| Pop-outs | Shell/window mgr | | |
| Blanc cold-open boundary | Blanc renderer | | |
