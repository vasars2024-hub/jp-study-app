# Dictionary rebuild — build log

The running record for `docs/plans/PROFESSIONAL_DICTIONARY_PLAN.md`. Written **as each piece
lands**, not at the end: runs in this repo have died at a usage limit *after* doing the work,
leaving code on disk with no record. If this file and the tree disagree, trust the tree and fix
this file.

Branch: `feat/nyaa-subtitles` (Part A shipped as `477380b`; the dictionary work continues here
rather than on its own branch, because it is additive and shares no file with Part A).

---

## B0 — `better-sqlite3` under Electron 42: **PASS**, and the risk was never real

Run 2026-08-08. The spike the source plan said was unnecessary and my own plan file said was
"a 30-minute spike, not zero risk". Both were wrong, in opposite directions, and the reason is
worth writing down because it changes how Phases 1–2 are *tested*.

Measured under the real Electron binary (`npx electron <spike>`), not under node:

| Assertion | Result |
|---|---|
| Electron / `NODE_MODULE_VERSION` | 42.3.0 / **146** |
| module loads | yes |
| SQLite version | 3.53.4 |
| `PRAGMA compile_options` contains `ENABLE_FTS5` | **yes** |
| `CREATE VIRTUAL TABLE … USING fts5(… unicode61 …)` | succeeds |
| FTS5 `MATCH` on CJK (`食べる`) / Cyrillic (`стол`) | 1 hit each |
| `journal_mode = WAL` | `wal` |
| `user_version` ladder | reads back `3` |
| **exact headword lookup, p95 over 200 000 rows** | **0.0067 ms** |

The plan's Phase 11 performance gate is p95 < 5 ms. The measurement is **~750× under it**, on an
index hit, which is the whole architectural claim of Phase 1 — `chineseDict.ts:189`'s
renderer-thread linear scan is not being replaced by something merely faster, it is being replaced
by something in a different complexity class.

### Why there was no ABI risk: the driver is Node-API, not V8-ABI

`@electron/rebuild -f -w better-sqlite3` exits 0 and **produces no binary** — `build/Release`
contains only `obj/` and a `.forge-meta` marker. What actually ships is
`node_modules/better-sqlite3/prebuilds/<platform>-<arch>.node` (the prebuildify layout), and
`node-addon-api` is the package's only dependency. One binary, ABI-stable across runtimes:

```
electron 42 (modules 146) → loads → sqlite 3.53.4
node      24 (modules 137) → loads → sqlite 3.53.4     ← the same file
```

**Two consequences, both load-bearing for later phases:**

1. **Phase 1 and 2 tests can use the real driver under vitest.** No mock layer, no
   "main-process-only" test constraint, no fixture DB built by a different engine than the one
   that ships. This is the opposite of what an ABI-bound native module would have forced, and it
   is why the migration-parity test in Phase 1 can be a real end-to-end assertion.
2. **Packaging needs nothing new.** `asar: false` (`forge.config.ts:129`) already ships `.node`
   files loose, so `plugin-auto-unpack-natives` remains unnecessary — it is installed as a
   devDependency but **not registered** in `forge.config.ts`'s plugin array, which is what my
   plan file's §1 correction actually established. The conclusion ("no unpack plugin needed")
   survives, and now for a second independent reason.

`package.json` gained exactly one dependency, `better-sqlite3@^13.0.3`, which is the sole root-file
change CLAUDE.md's scope rule permits for this work.

---

## B2 — Phase 1, database foundation: **built and tested**

New: `src/main/dictionary/schema.ts`, `db.ts`, `migrate.ts`.
Tests: `src/main/__tests__/dictionaryDb.test.ts` (17), `dictionaryMigrate.test.ts` (20),
`dictionaryRealData.test.ts` (6, opt-in).

### Four things §3.1 leaves implicit, made explicit

1. **FTS5 synchronisation triggers.** The plan declares `content='headwords'` external-content FTS
   tables and stops. An external-content table holds no copy of the data and tracks nothing on its
   own: without INSERT/UPDATE/DELETE triggers it returns **nothing at all**, silently. The triggers
   are the feature. The `'delete'` command rows matter as much as the inserts — omit them on UPDATE
   and the old terms stay matchable forever, which presents as *search returning rows that no longer
   exist*. Three tests exist only to pin that (`retracts the OLD term on update`, and the delete
   cases for headwords and glosses).
2. **Foreign keys.** The plan asks for `PRAGMA foreign_keys=ON` and then declares no references,
   which makes the pragma decorative. Cascades are now declared where ownership is genuinely
   exclusive (dictionary → headwords → senses → glosses), so removing a dictionary is one statement
   and the FTS triggers fire on the cascade. `user_notes` and `explanations` are deliberately **not**
   cascaded: a note must survive re-importing the dictionary it annotates.
3. **A `pitch` table, which §3.1 does not have.** The plan lists `pitch` as a dictionary `kind` and
   provides nowhere to store pitch data. Migrating `bundled-kanjium-pitch` would have silently
   dropped all of it. Added at v1 with the same `dict_id` cascade.
4. **A ladder that fails safely.** Each step runs in its own transaction and bumps `user_version`
   inside it, so a step that throws leaves the file on the last version that *fully* applied rather
   than half-way through one. The error names the step. Tested by pushing a deliberately invalid
   migration and asserting the version does not move.

### The migration is additive, and re-runnable

`migrateLegacyYomitanStores` reads `userData/yomitan/<id>/index.json` and **never deletes it** —
the JSON is the only copy of dictionaries a user may have spent an hour downloading. Re-importing
replaces that dictionary's rows via the cascade rather than appending a second copy, so "Rebuild
index" is safe to press twice; a re-import with *fewer* terms leaves nothing behind, index included.
One corrupt store is skipped and named in the result rather than aborting the other three.

### The parity test is a round trip, not a description

The plan calls this the scariest change in the document. The test is therefore shaped so it cannot
agree with a bug: a fixture in the exact legacy format goes in, and `readMigratedEntries` must return
**the same objects** (`toEqual` on the whole entry, including sense order, multi-definition senses,
duplicate headwords under one reading, and the structured glossary HTML). A test that instead
asserted what the migration happens to write would pass no matter what it wrote.

### Two bugs the tests caught, both silent-failure shaped

- `insertHeadword.run(...)` was missing its first parameter (`dict_id`), so every real insert threw
  `RangeError: Too few parameter values`. Caught by 13 tests at once.
- A backtick inside a SQL comment (`` `kind` ``) **closed the template literal** holding the DDL.
  This repo already knows this failure — the jp-bridge notes record a backtick in a CSS comment
  inside a template literal — and it is worth the second mention because the parse error points at
  the *comment*, not at the string it broke.

### Measured, not assumed

| Assertion | Result |
|---|---|
| exact lookup p95, 50 000 synthetic rows | < 5 ms (gate), measured well under |
| query plan | `SEARCH headwords USING COVERING INDEX idx_hw_norm` — no scan |
| FTS MATCH across scripts | CJK, Cyrillic and Latin all hit in one index |

The plan assertion is deliberately on the **query plan** as well as the clock: at 50 000 rows a
table scan would still pass a timing gate, so timing alone would have proved nothing.

### The defect only real data could find: a missing composite index

Running the migration against the four real stores — **697 837 headwords**, 524 106 of them JMdict-EN
— the parity pass went CPU-bound for ten minutes with no disk I/O at all. It was not the import.

```
select id from headwords where dict_id = ? and norm = ?
  →  SEARCH headwords USING INDEX idx_hw_dict (dict_id=?)      ~100 ms per lookup
select id from headwords where lang = ? and norm = ?
  →  SEARCH headwords USING COVERING INDEX idx_hw_norm         microseconds
```

§3.1 indexes `(lang, norm)` and `(dict_id)`. A **per-dictionary** lookup filters on the pair, and
with those two indexes SQLite matches `dict_id` and then walks every row of that dictionary —
524 000 of them, 100 ms a time, measured at 1 998 ms for 20 lookups. Added `idx_hw_dict_norm
(dict_id, norm)` to schema v1.

**The 50 000-row synthetic test could not have caught this**, and that is the transferable lesson:
at 50 k the scan is fast enough to pass any timing gate. What catches it is asserting on the *query
plan*, so `dictionaryDb.test.ts` now pins the plan for this shape too — the timing assertion alone
would have stayed green through the whole defect.

Amending a v1 migration step is normally forbidden (`user_version` means an edited step never re-runs
on a machine that applied it). It is legitimate here for one reason only: **v1 has not shipped**, so
no machine has applied it.

### Wiring, and the one piece of the plan that is blocked

The architecture audit failed the moment these modules existed — `migrate.ts` and `cedict.ts` were
*reachable only from tests*. That is the same class as the i18n module that shipped with 485 keys and
resolved to nothing because no catalog imported it, and the gate is right to fail it: a library
nothing calls is not a feature.

`dictionary/service.ts` is the seam. `initYomitan()` now calls `initDictionaryService()`, which opens
the database and applies schema migrations — DDL only, milliseconds, safe on the main thread.

**What it deliberately does NOT do is migrate the JSON stores on boot**, and this is a finding rather
than a shortcut. The real migration takes minutes of *synchronous* work; `better-sqlite3` is
synchronous by design, so every second of it is a second the main process cannot answer an IPC call.
On first launch the window would be frozen solid with no way to cancel. The plan's answer is a
`utilityProcess`, and that is **blocked by this repo's scope rule**: a utilityProcess, a
`worker_threads` Worker and a forked child all need their own build entry point, and CLAUDE.md
forbids touching `forge.config.ts` / `vite.*.config.ts`. My plan file recorded that utilityProcess is
net-new infrastructure; the sharper version is that it cannot be added at all without a build-config
change that is out of scope for this work. So the migration is exposed as `migrateLegacyStoresNow()`,
is never called automatically, and `dictionaryStatus()` reports `pendingLegacyStores` so a future
caller can see there is work to do. **Wiring it to a button is only safe once it has somewhere to
run.**

---

## B3 — Phase 2, the two blocking importers

### `shared/pinyin.ts` — extracted, not copied

`LINE_RE`, the tone-mark table and `parseClassifiers` moved out of
`renderer/chineseDict.ts` into `src/shared/pinyin.ts`, and the renderer now
**re-exports from there**. One implementation, not two: a second copy of a tone-placement table is a
guaranteed divergence, and the tone rule is exactly the kind of thing that looks simple and is not —
it is a → e → the `o` of `ou` → otherwise the *last* vowel, which is why `xiao4` is `xiào` and
`liu2` is `liú`. 26 tests, including the cases that a naive "first vowel" implementation gets wrong.

Two functions are new because the schema needs them: `pinyinToneless` (search key) and
`pinyinSearchKey` (spaceless). `reading` keeps the readable `chuán tǒng`.

### `dictionary/importers/cedict.ts`

Simplified carries the senses; traditional is a headword whose `variant_of` points at it — the plan's
own instruction, and the reason that column exists. Storing the pair as two full entries would double
every sense and make `entry_count` meaningless; storing one would miss half the lookups.

**A defect the lookup tests found in the importer:** `reading_norm` was being stored as
`chuan tong`, with the space. A learner types both `chuan tong` and `chuantong`, and only one of
those can be an index hit unless *both sides* collapse spaces. Stripping at query time instead would
mean `replace(reading_norm,' ','') = ?` — a function on the column, which defeats the index (the same
mistake as the missing composite index above, in a different disguise). `reading_norm` is now
spaceless on both sides; `reading` is untouched because it is what the user reads.

14 tests: comments and malformed lines skipped rather than fatal, CRLF, the `u:` → `ü` digraph
end-to-end, licence and attribution recorded (CC BY-SA obliges the UI to surface them), re-import
replacing rather than doubling, and progress reporting.

---

## B4 — Phase 3, the unified lookup service

`dictionary/dictService.ts`. The claim is narrow and checkable — **one code path serves ja/zh/en/ru,
in both directions** — and all 34 tests go through the same `lookup()` call.

It falls out of `lang` being on both sides of the schema:

```
headword direction   headwords.norm / reading_norm  →  senses → glosses
gloss direction      glosses_fts MATCH              →  senses → headwords
```

JA→RU and RU→JA are not two features; they are that function with the language arguments swapped.

**No morphology is re-implemented.** Japanese wraps the existing `deinflect()` and reports the
conjugation chain; Chinese needs none; Russian and English strip a small suffix list — a deliberate
floor, honest about being a heuristic, because Phase 3's lemma table has no importer yet.

Decisions worth keeping:

- **Bare Han searches Japanese *and* Chinese.** `食` is genuinely ambiguous, and a `zh`-only guess
  would silently lose every JMdict entry.
- **A traditional headword resolves through `variant_of`.** Without that hop, half of Chinese returns
  entries with an empty sense list — which reads to a user as "no definition", not as a bug.
- **A sense whose every gloss was filtered out by language is dropped**, not returned empty. The
  alternative renders as a numbered bullet with nothing in it.
- **Ranking is stable.** Ties break on headword id, because an unstable order reshuffles the results
  list on every keystroke.
- **FTS input is quoted.** `"`, `*`, `:`, `-`, `(`, `)` and bare AND/OR/NOT are FTS5 operators, so
  `to run (away)` throws `fts5: syntax error` unescaped. A test looks up each bare operator and
  asserts the call does not throw.

The plan's "done when `lookupChinese` is unreferenced" is **not** reached: that requires swapping the
five renderer surfaces onto this service, which is Phase 4's work.
