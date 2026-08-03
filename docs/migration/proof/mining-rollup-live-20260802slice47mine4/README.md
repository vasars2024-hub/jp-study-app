# The mining rollup, seen in the app, against a card the app mined — slice 47

```
node docs/migration/tools/prepare-gplay-datadir.mjs "%TEMP%/gplay-dd-slice35/cue-library/Sousou no Frieren - 01.mkv" "%TEMP%/gplay-dd-mining"
node docs/migration/tools/mining-rollup-live-harness.mjs --datadir="%TEMP%/gplay-dd-mining"
```

Needs the Vite dev server on 5173 and Anki running with AnkiConnect on 8765. It mines **one
real card** into `StudyOS::_MigrationProbe` and deletes it by id afterwards.

## What closed

`rollup-unseen-in-the-app` had been the standing OPEN row since slice 42, and on 2026-08-02
its reason was narrowed to a measurement: the store `jp-video-core-mining-history-v1` was
`[]`, so there was no history for the rollup to be seen against. The row concluded that only
the user could create one.

That conclusion did not follow. Driving the app's **own** mine button, on a real cue from a
real playback, against live Anki, is not a seeded fixture — it is the path a user's click
takes, and **nothing in this harness writes to that store**. The entry is written by
`VideoCoreMiningPanel`'s own effect from the result of the app's own `window.api.ankiMineNote`.

```text
0b  history before          0 entries          <- the state the OPEN row described
2   cue in the panel        "The cat is sleeping by the window."
3   destination typed       StudyOS::_MigrationProbe   (through the real input)
4   mined                   status exported, noteId 1785650130128
4b  Anki confirms by id     model JP Study App::JA-EN Classic, deck StudyOS::_MigrationProbe
6   rollup in the panel     1 card, term = the mined sentence, Cards 1
```

Step 6 reads the DOM of the real `SeanimeWatchLoopPanel`, reached by clicking the launcher and
the Review segment — not `seanimeWatchLoopCards` called directly. That function counts only
entries whose status is `exported` **and** whose `noteId` is a real number
(`seanimeWatchLoop.ts:187`), so a failed mine could not have produced this reading.

Blanc mines and the main window reads. They are the same origin (`http://localhost:5173`,
differing only by query string), so they share one `localStorage` — that is why the number did
not have to cross a process.

## What it does NOT show, and the defect it found instead

**No card ever got a STAGE.** Every run reads `untracked`, and that is not a fact about the
collection — it is the panel's *pre-snapshot frame*. The panel renders cards synchronously
from history and only then awaits `ankiStatus` and `ankiGetIntervals`
(`SeanimeWatchLoopPanel.tsx:107-142`); until the snapshot lands,
`seanimeWatchLoopCards(history, null)` stages everything `untracked` by construction.

The first two runs sampled immediately and recorded `untracked` — a finding about when the
harness looked, not about the app. So the harness now waits for the panel's own `loading` flag
(exposed as the refresh button's `disabled`). **It never clears.** In run `…mine4` the panel
was still showing `Reading your mining history…` after 90 seconds, and a direct
`window.api.ankiGetIntervals()` from the main window did not return inside a 60 s CDP timeout.

Why, measured directly against the live collection:

| | |
|---|---|
| default profile `syncQuery` | `deck:*` (`shared/profiles.ts:235`) |
| notes matching it here | **155,377** |
| `intervals.ts` chunk size | 500, **sequential** |
| calls implied | 311 × `notesInfo` + ≥311 × `cardsInfo` |
| one measured `notesInfo(500)` | 55 ms → ~17 s for notesInfo alone, the pair well past a minute |

The rollup needs intervals for the note ids **in the mining history** — one, in this run. It
asks for the whole collection because that is the only snapshot API there is. The fix is a
narrower request rather than a faster loop, and it needs a new IPC surface, so it is left
unimplemented and tracked as `interval-snapshot-stalls-the-review-panel` rather than started
here.

## Safety, and one thing left behind

Every run deletes its note **by id** through the app's own `ankiDeleteNotes` and verifies it is
gone; `residualNotes 0`, `historyRestored true`, and the prior contents of the mining-history
store are put back exactly.

Two harness bugs were found by doing this and are fixed:

- `notesInfo` answers `[{}]` — an array holding an **empty object** — for a note that no longer
  exists, and `{}` is truthy. The first version counted that as a survivor and reported
  `residualNotes: 1` about a collection that was already clean.
- The deck count was recorded but not the deck **names**, so when the count went 83 → 84 the
  run could say a deck had appeared but not which one. It now records the list and names
  anything left behind.

**One empty deck was created and is still there: `JP Study::N2 Vocab`.** Run `…mine2` was run
with `--deck=` (empty) to let the app's own profile rule choose the destination, which is what
a user's mine does; the rule named that deck and creating it was the app's doing, not the
harness's. Its note was deleted and the deck is empty, but **a deck in someone's collection is
not a harness's to remove**, so it is reported rather than deleted. The harness now never
deletes a deck it did not itself name.
