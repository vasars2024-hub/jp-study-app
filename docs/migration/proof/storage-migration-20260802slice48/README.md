# The storage migration exists, it is interruptible, and it corrupts every key it "keeps"

Slice 48, 2026-08-02. Reproduce:

```
node docs/migration/tools/storage-migration-gate.mjs
```

Packaged build `out/jp-study-app-win32-x64/jp-study-app.exe`, throwaway `--user-data-dir` in the
OS temp dir, fresh profile per run. Nothing here touches the real `%APPDATA%/jp-study-app`.

## 1. The checklist item names something real

Phase 9 carries "interrupted-migration tests". The previous session could not find a migration
layer and flagged the item as possibly naming nothing. It names:

| | |
|---|---|
| runner | `src/renderer/storage/migrationRunner.ts` → `runStorageMigrations()` |
| called from | `src/renderer/main.tsx:239`, `runWhenIdle(…, 8000)` on every main-window boot |
| boundary | `src/shared/storageMigrationBoundary.ts`, `STORAGE_MIGRATION_VERSION = 5` |
| version cell | `storage-version` in IndexedDB `jp-study-db/kv` |

That is a versioned upgrade-on-load with a retention plan. The item is **not** stale.

## 2. What the run measured

| step | verdict | measurement |
|---|---|---|
| round-trip | **FAIL** | 5/5 retained localStorage keys come back at JSON parse depth **2**, seeded at 1 |
| escalation | **FAIL** | a second completed run takes them to **3**, a third to **4** |
| control | PASS | `jp-slice48-control`, not in `LS_KEYS`, is byte-identical throughout |
| idb-retention | — | this build **drops** `media-study-database`: enumerated by `IDB_KEYS`, absent from `HEAVY_INDEXED_DB_KEYS` |
| interrupt | OK | process killed 409 ms into a run calibrated at 908 ms |
| interrupt-evidence | OK | first read on the next boot found `storage-version` still **0** — `replaceAtomic` was cut before it returned |
| recovery | PASS | 14 keys present, next migration completed, nothing lost beyond the deliberate drop |

### The defect

`collectSnapshot()` stores the **raw string** from `localStorage.getItem`. `writeLocal()` then does
`localStorage.setItem(key, JSON.stringify(value))` on that string. One extra encoding layer per
boot, forever. The app's readers parse **once** — `flashcardDeck.ts:72` — so after one migration
`JSON.parse(raw)` returns a *string*, `parsed.cards` is `undefined`, and `readStore()` returns an
empty deck. The IndexedDB mirror is still correct, but no code path restores the deck from it,
and the next deck write mirrors the empty store back over the good IndexedDB copy.

The five affected keys are `jp-flashcard-deck`, `jp-study-csv-editor-v1`, `jp-clipboard-history`,
`jp-calendar-events`, `jp-media-tracking-v1`.

### It has already happened on the real profile

`%APPDATA%/jp-study-app/Local Storage/leveldb/000110.log` carries, for `jp-clipboard-history`,
successive records of `[{"id":"cb-…` (clean), `"[{\"id\":\"cb-…` (one layer),
`"\"[{\\\"id\\\…` (two), `"\"\\\"[{\\\\\\\"id\\…` (three), then clean again — the history read
as empty and was rebuilt from new activity. This is a forensic read of a binary, offered as
corroboration only; the verdict above rests on the controlled run.

## 3. The interruption

The write loop cannot be watched while it runs: IndexedDB serialises readonly transactions behind
readwrite ones on the same store, so a poll issued mid-loop does not answer until the loop has
drained. The first attempt polled every 25 ms for five seconds and every answer arrived after the
run had finished — it read "already complete" about a loop it had been watching throughout. The
kill is therefore **timed**: one calibration run measures the full duration over a 36 MB payload,
the next run is cut at 45 % of it, and the proof that the cut landed mid-flight is read afterwards
— `storage-version` still 0 on the next boot.

**The partial state survives correctly.** The version cell is written last, so an interrupted run
is simply replayed; IndexedDB kept all 14 keys across a `taskkill /F`; the control key was
untouched; and the next boot's migration completed normally.

`tier-durability` records one asymmetry: across the kill, localStorage came back **shallower**
than it was three completed migrations earlier, while IndexedDB kept everything. Chromium commits
localStorage to disk lazily, so a SIGKILL can discard recent writes. This gate **observes** the
rollback; it does not prove that mechanism.

## What this does NOT show

- The packaged build is from **2026-08-01** and predates slice 47e. It carries the rewritten
  runner and the `media-study-database` drop, but the working tree may differ elsewhere.
- Only the five `LS_KEYS` and the twelve `IDB_KEYS` were exercised. Other persisted state
  (`profileRules` v1→v2, `desktop.ts` schemaVersion 1→2, extension settings) has its own
  migration path and was not touched here.
- No claim about *how much* user data is lost in practice — that depends on what was in the five
  keys when the first migration ran.

## Two instrument traps, both of which produced a false PASS first

1. **The probe must not create the database.** `indexedDB.open('jp-study-db')` with no
   `onupgradeneeded` creates an empty v1 database with no `kv` store. The app's `openDb()` then
   opens it successfully — the version matches, so its upgrade handler never runs — and every
   `withStore` throws `NotFoundError` forever. The migration's try/catch logs "skipped", and the
   gate reads back byte-identical values and calls it a PASS. The first version of this file
   reported three PASSes about a run in which the migration never executed.
2. **Seeding must not land inside a run.** `runStorageMigrations` reads its snapshot, awaits the
   IndexedDB loop, and only then touches localStorage. A value written by the harness inside that
   window is not in the snapshot and is *removed* by the next line. The second version seeded
   right after `readyState === 'complete'`, landed in that window, and reported "all five
   retained keys were REMOVED" — a race in the instrument, not the app's steady-state behaviour.
