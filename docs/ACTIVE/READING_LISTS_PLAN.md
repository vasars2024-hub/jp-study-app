# Reading Lists — booklists parsed from a text message, ticked by the reader

Written 2026-09-03 by an interactive session, on direct user request:

> "add a feature to the relay which allows the app to make book lists from a text message
> which automatically is tracked when u finish books in the reader, a full robust list
> tracking, be creative, it needs to have features even i might have not thought of"

Two sentences, one product: **paste a message → get a list → the list fills itself in as you
read.** Everything below serves those two sentences. Anything that does not is marked
OPTIONAL and can be cut without breaking the core.

---

## 0. What already exists (measured, not assumed)

Read this before designing anything; four of these facts change the design.

| Fact | Where | Consequence |
|---|---|---|
| Items already carry `collections?: string[]` — free-form names, flat | `src/shared/types.ts:274` | A list is **not** just a string on an item. A flat string array cannot hold order, a finished date, a per-entry note, or an entry for a book you do not own. Reading Lists is a real store; `collections` stays as-is and gets a one-way import. |
| Reading position is `Progress { page?, location?, percent? }`, `location` is `p:<part>:<frac>` | `src/shared/types.ts`, `NovelReader.tsx` `saveNow`/`parseLoc` | The completion signal has to be derived from this, and `percent` alone is not enough (see §4). |
| `window.api.setProgress(id, progress)` → `library:setProgress` | `src/preload.ts` | The one funnel every reader already calls. The completion detector hangs here, in main — not in each reader view. |
| Readers are `NovelReader.tsx` (130 KB), `MangaReader.tsx` (87 KB) | `src/renderer/views/` | Do **not** add list logic to either. They are large and shared; they emit progress and nothing else. |
| Reading Garden stores progress in **`localStorage`** (`jp-reading-garden-v1`) | `src/renderer/readingGardenProgress.ts:1` | Renderer storage has **no restore point** — userData backups hold main-process JSON only. Reading Lists must persist in **main**, or a profile wipe silently destroys a year of lists. This is the single most important constraint here. |
| `metadataConfidence` exists, and the codebase's stated rule is that a low-confidence match "flags the card for review rather than pretending a guess is a fact" | `src/shared/types.ts:250-255` | The parser follows the same idiom: low-confidence entries go to a triage strip, they are never silently guessed. |
| `preferredSubtitleId` is persisted specifically because "the library and the player are different windows" | `src/shared/types.ts:275-284` | Same trap here. The library window and the reader window are different renderers; list state must live in main and broadcast, not in a React store. |
| i18n catalogs are per-language TS modules under `src/shared/i18n/`, English eager, others dynamic | `src/shared/i18n/catalogs.ts` | New chrome strings go in an **already-wired** catalog. A brand-new module resolves to nothing until something imports it, and every key-count check still passes. |

---

## 1. The data model

Three records. The pivot is **work identity** — the thing that survives re-imports, format
changes, and re-reads.

```ts
/** A book as an idea, independent of any file you happen to hold. */
interface ReadingWorkRef {
  id: string;                   // stable, app-minted
  titleRaw: string;             // exactly as it appeared in the source text
  titleJa?: string;
  titleEn?: string;
  titleRomaji?: string;
  authorRaw?: string;
  volume?: { from: number; to?: number };   // "vol 1-3" stays ONE ref with a range
  externalIds?: {                            // filled in by matchers, never required
    jiten?: string; mal?: string; vndb?: string; isbn?: string; asin?: string;
  };
  /** Library items currently believed to BE this work. Many: epub + paper + re-rip. */
  boundItemIds: string[];
  /** 0..1. Below ACCEPT_THRESHOLD the binding is a suggestion, not a fact. */
  bindConfidence: number;
}

interface ReadingListEntry {
  id: string;
  workId: string;
  order: number;                // meaningful only when list.kind === 'ordered'
  addedAt: number;
  /** Which line of which paste produced this entry. Provenance, always. */
  sourceRef?: { importId: string; lineIndex: number; rawLine: string };
  state: 'wanted' | 'owned' | 'reading' | 'finished' | 'abandoned' | 'skipped';
  startedAt?: number;
  finishedAt?: number;
  /** How the finish was decided. Never lose this — it is the audit trail. */
  finishedBy?: 'reader-auto' | 'manual' | 'imported' | 'bulk';
  note?: string;
  rating?: number;              // 1..5, OPTIONAL
}

interface ReadingList {
  id: string;
  name: string;
  kind: 'ordered' | 'pool' | 'tiered' | 'challenge' | 'smart';
  description?: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  /** challenge only */
  target?: { count?: number; by?: number /* epoch ms */ };
  /** smart only: a saved query, re-evaluated on read. §8 */
  query?: SmartListQuery;
  entries: ReadingListEntry[];
  /** Every paste that ever fed this list, kept verbatim. §2.4 */
  imports: ReadingListImport[];
}
```

**Persistence:** `userData/reading-lists.json`, written by main, single writer, atomic
(temp + rename), with `schemaVersion`. Broadcast every mutation on a
`reading-lists:changed` channel so the library window and the reader window cannot disagree.

**Event log:** `userData/reading-lists-events.jsonl`, append-only, one line per mutation
(`entry-added`, `entry-finished`, `list-merged`, `import-applied`, …). This is what makes
"when did I actually finish this" answerable and an accidental bulk delete recoverable. It
is also how a bad parser release gets rolled back without losing hand edits.

---

## 2. Paste → list: the parser

The whole feature stands or falls here. Input is a real text message, not clean data.

### 2.1 Worked example — this exact input must produce the list below

```
yo these are the ones i said

1. Kino no Tabi
2. 君の膵臓をたべたい
3. Convenience Store Woman (コンビニ人間) — Murakami? no, Sayaka Murata
- ハリー・ポッター 1〜3巻
also 「夜は短し歩けよ乙女」 if u can find it lol
https://example.com/list/1234
```

Expected: **6 works**, one flagged for triage.

| # | title | note |
|---|---|---|
| 1 | Kino no Tabi | romaji; matcher looks up 「キノの旅」 |
| 2 | 君の膵臓をたべたい | JA |
| 3 | コンビニ人間 / Convenience Store Woman | EN + JA in parens = **one** work, both titles kept; author corrected inline to Sayaka Murata |
| 4 | ハリー・ポッター | `volume: {from:1, to:3}` — one entry, not three |
| 5 | 夜は短し歩けよ乙女 | 「」 stripped; "if u can find it lol" dropped as chatter |
| — | the URL | kept as `list.sourceUrl`, not an entry |

"yo these are the ones i said" is a greeting → dropped. Getting this exact input right is
the acceptance test; it is checked in as a fixture.

> **Corrected 2026-09-03 while implementing it (`primary`).** The heading above says **6
> works** and the table enumerates **five**, plus a sixth row marked `—` for the URL, which
> the same row says is "not an entry". The itemised table is the specific half and the
> summary is the loose one, so the implementation produces **5 entries + 1 `sourceUrl`**.
> `src/shared/__tests__/readingListParser.test.ts` asserts that count and every field of
> every entry. Do not "fix" it back to six.
>
> "one flagged for triage" **is** honoured, and it is entry 3 (`author-ambiguous`, from the
> retracted `Murakami? no, Sayaka Murata`). Entry 5 is recovered from prose but is **not**
> flagged: §2.3 step 3 calls a quoted span a strong title signal, and asking the user about
> the case the parser is most confident in is how a triage strip stops being read.

### 2.2 Segmentation

Try each strategy, score it, keep the best — do not hard-code one:

- numbered — `1.` `1)` `1 -` `(1)` `①` `一、`
- bulleted — `-` `*` `•` `・` `→` `>` `>>`
- line-per-title — every non-empty line, when ≥3 lines and none matched above
- inline-separated — one line split on `、` `,` `;` `/` when it holds ≥3 candidates
- prose fallback — quoted spans only (`「」` `『』` `""` `“”`), when nothing else scores

Scoring rewards uniform line shape and a plausible count; it rejects a strategy that
produces one 400-character "title".

### 2.3 Per-line cleanup, in order

1. Strip and retain URLs (→ `entry.sourceRef.url`, or the list's if it stands alone).
2. Strip trailing chatter: `if u can find it`, `lol`, `maybe`, `?`, `!!`, emoji runs.
3. Extract quoted spans — quotes are a **strong** title signal; a quoted span wins.
4. Split author: `by X`, `X著`, `X - Title`, `Title - X` (disambiguated by which side
   matches a known author or carries a title marker), `【X】`.
5. Extract volumes: `1-3`, `1〜3`, `vol 1-5`, `巻1-5`, `第1-3巻`, `#1-3`.
6. Pair EN/JA: `English (日本語)` or `日本語 (English)` → one work, both titles.
7. Normalise: NFKC, full-width→half-width digits, collapse whitespace, drop leading list
   markers, trim 　 (ideographic space).
8. Drop lines that are now empty, pure punctuation, or match a greeting/sign-off lexicon.

### 2.4 Provenance and re-parse — do not skip this

Store every paste verbatim:

```ts
interface ReadingListImport {
  id: string;
  rawText: string;              // exactly what was pasted, unmodified
  pastedAt: number;
  from?: string;                // free text: "Kenji, LINE", "r/LearnJapanese"
  parserVersion: string;
  entryIds: string[];           // what this import produced
}
```

Because the parse is a **pure function of `rawText`**, a better parser can be re-run over
every historical import and shown as a diff — "this paste would now yield 7 entries instead
of 5, 1 changed" — which the user accepts or rejects per entry. Hand edits are preserved:
re-parse never overwrites an entry the user touched. This costs almost nothing to build now
and is impossible to retrofit once the raw text is thrown away.

### 2.5 The preview is mandatory

Paste never writes straight to a list. It opens a preview where every entry can be edited,
merged, split, dropped, or reordered, with the source line shown beside it. Entries below
the confidence threshold are pre-selected for attention rather than silently included.
`Ctrl+Z` restores the previous parse. This is the difference between "clever" and
"trustworthy".

### 2.6 Other intake paths (same pipeline, different front door)

- **Clipboard watch** — OPTIONAL, off by default: notice a clipboard payload that parses as
  ≥3 titles, offer a non-modal "make a list?" toast. Never acts on its own.
- **Drag a `.txt`/`.md` file** onto a list.
- **Screenshot / photo of a paper list** → the OCR path already exists (`bookOcrRun`,
  `src/main/bookOcrJob.ts`). Photograph a bookshelf or a magazine's top-20, get a list.
  Reuses the pipeline wholesale; only the text source differs.
- **Share URL / list code** — see §9.

---

## 3. Matching a parsed title to something real

Two independent jobs; keep them separate.

**a) Bind to a library item you own.** Score over: exact normalised title, JA↔romaji
transliteration, EN↔JA title pair via the catalogs, author agreement, volume agreement,
fuzzy distance with a length-aware floor. Above `BIND_ACCEPT` (start at 0.82, tune against
the fixture corpus) → bind and mark `state: 'owned'`. Between `BIND_SUGGEST` (0.55) and
accept → the entry stays `wanted` and shows a "is this it?" chip. Below → stays `wanted`,
no suggestion, no noise.

**b) Enrich from catalogues you already ship.** Jiten novel catalogue, `visualNovels.ts`,
`malLibrary.ts`, the scraper catalogue. Fills `externalIds`, canonical titles, cover art,
and difficulty (§7). Never blocks — an unenriched entry is fully usable.

### 3.1 Late binding — the feature that makes this feel alive

A `wanted` entry keeps its matcher fingerprint. **Every library import — manual add, folder
scan, scraper landing, download completion — runs the fingerprint against new items.** A
friend texts you ten books today; you download the fourth one three weeks from now; the
list ticks itself to `owned` and tells you, without you ever opening the list.

Hook it where items are created in `src/main/library.ts`, in one place, on the item-added
path — not in each importer.

---

## 4. "Finished in the reader" — the completion detector

This is where a naive implementation produces false positives forever. Split hard signals
(auto-tick) from soft ones (suggest only). **Never auto-tick on a soft signal.**

### 4.1 Hard — auto-tick

- **Books:** `percent >= 0.985` **AND** `location` parses to the final part **AND** the
  position has survived **two consecutive `setProgress` saves ≥60 s apart**. The dwell
  requirement is what rejects a scrub to the end: dragging the scrollbar to 100 % to peek at
  the afterword writes one save and then moves away.
- **Manga:** `page >= pageCount - 1`, same two-save dwell.
- **Explicit:** the user presses "Finished". Always available, always wins, needs no
  heuristic, and is the only signal that can mark a work you read on paper.

### 4.2 Soft — suggest, never auto-tick

- `percent >= 0.90`, final part reached, and no progress for 14 days → "Did you finish
  this?" on the list, dismissible, asked once.
- Reader closed within the last 2 % three times in a row.

Rationale, and it is not hypothetical: EPUB back-matter (afterword, translator notes,
publisher ads, other-titles-by pages) routinely occupies the last 3–8 % of a file. A
`percent >= 1.0` requirement never fires for a large fraction of real books, and a
`percent >= 0.90` auto-tick fires for people who abandoned a book near the end. Hard signals
catch the honest case; soft signals catch the rest **by asking**.

### 4.3 Where it lives

In **main**, on the `library:setProgress` path — one detector, every reader, present and
future. The readers stay untouched. Emit:

```ts
interface BookFinishedEvent {
  itemId: string;
  workId: string | null;
  at: number;
  by: 'reader-auto' | 'manual';
  evidence: { percent: number; location: string | null; dwellMs: number; saves: number };
}
```

`evidence` is not decoration — when a false positive is reported, it is the only way to tell
which rule misfired.

### 4.4 Fan-out

One finish ticks the work on **every** list it belongs to, in one transaction. Subscribers:
Reading Lists, Reading Garden (a bloom — a finished book is a bigger event than a page),
statistics, and an OPTIONAL "finished book" Anki note.

### 4.5 Un-finish

Always reversible. Un-finishing restores the previous state and writes an event; it does not
delete the finish from the log. Re-reads append a **read session** rather than overwriting
`finishedAt`, so "I have read this three times" is representable.

---

## 5. Beyond the ask — features worth having

Ordered by value per unit of work. Everything here is OPTIONAL relative to §2–§4.

1. **Cross-list membership.** One work, many lists, one finish. Falls out of the model for
   free and is the reason `collections: string[]` was not enough.
2. **Wanted-list = shopping list.** Filter to `wanted` and you have exactly what to go find.
   Hand it to the existing scraper/download surfaces as a batch.
3. **Next up.** One button: the next unfinished entry, in order for `ordered` lists, by
   best-fit difficulty for pools. Opens the reader. The list becomes a queue.
4. **Pace and projection.** The app already measures pages and characters read. So: "at your
   rate over the last 30 days, this list finishes 2026-11-14." For a `challenge` list with a
   target date, say plainly whether the user is ahead or behind, in books, not percentages.
5. **Difficulty ramp.** It is a Japanese study app: annotate entries with measured
   difficulty (unique-kanji ratio, vocab beyond the user's known set, from the SQLite
   dictionary) and offer "sort easiest first". Warn when an entry is far above current
   level — kindly, once, not as a nag.
6. **Smart lists (§8).** Saved queries that populate themselves.
7. **Merge and dedupe.** Two lists from two friends overlap; merge with a preview showing
   what is shared. Dedupe within a list on work identity, not string equality.
8. **Export back to a text message (§9).** The input format is a text message; so is the
   output. Full circle.
9. **Abandoned ≠ unfinished.** `abandoned` is a first-class state with an optional reason.
   It keeps "did not finish" out of the shame column and out of the pace maths.
10. **List cover mosaic.** Four bound covers in a 2×2 → the list looks like a shelf. Cheap,
    and it is what makes the surface feel like it belongs in this app.
11. **Per-entry notes and a rating**, so the list doubles as a reading journal.
12. **Timeline view.** Finishes on a calendar, per list. Answers "what did I read this year"
    in one screen, straight from the event log.
13. **Recovery from the event log.** "Undo the last import", "restore the list as of last
    Tuesday". Nearly free once §1's log exists.

---

## 6. Surfaces

- **Lists view** — grid of list cards (mosaic cover, N/M finished, pace line).
- **List detail** — entries with state chips, drag to reorder (ordered lists), triage strip
  at top when confidence is low, "Next up" button, pace line, source-message expander.
- **Paste dialog** — big textarea, live preview beside it, per-entry edit, `from` field.
- **Reader touch-point** — a single unobtrusive line: "On 2 lists · mark finished". Do not
  build list management into the reader.
- **Library touch-point** — "Add to list…" on the item card, alongside the existing
  favourite/study-queue actions.

All chrome strings go through an **already-wired** catalog under `src/shared/i18n/`, in all
four languages. A new module that nothing imports resolves to nothing while every key-count
check still passes.

---

## 7. Smart list queries (OPTIONAL)

```ts
type SmartListQuery = {
  format?: ('book' | 'manga' | 'vn')[];
  state?: ReadingListEntry['state'][];
  difficultyMax?: number;
  startedBefore?: number;      // "abandoned": started, not finished, stale
  notOnList?: string[];
  authorIs?: string;
  ownedOnly?: boolean;
};
```

Ships with three presets: **Abandoned** (started, <90 %, untouched 30 days), **Ready to
read** (owned, unstarted, within difficulty band), **Author sweep** (every owned work by the
author of the last book finished).

---

## 8. Import / export (OPTIONAL, high value)

- **Text out.** Renders the list as a numbered message — pasteable straight back into LINE,
  Discord, or a forum. The round trip is the point: text in, text out.
- **Markdown / CSV out.** With states and finish dates.
- **List code.** One compressed base64url string carrying titles + external ids (never file
  paths, never anything personal). Someone pastes it back in and gets the same list — which
  is just §2 again, with a cleaner input.
- **In:** Goodreads CSV, Anilist/MAL export, plain text file.

---

## 9. Build order

Each phase is shippable on its own and leaves the tree green.

| Phase | Contents | Done when |
|---|---|---|
| **P0** | Store + IPC + event log + broadcast. No UI. | Round-trips through a restart; two windows agree; corrupt file recovers to last good with a diagnostic. |
| **P1** | Parser + preview dialog + manual lists. | The §2.1 fixture produces exactly its 6 works; ≥25 real-message fixtures pass; every parser rule has a **mutation test** that proves the test fails when the rule is broken. |
| **P2** | Matching + binding + late binding (§3.1). | An item imported *after* the list exists binds itself, proven by an integration test that adds the item second. |
| **P3** | Completion detector (§4). | Scrub-to-end does **not** tick (negative control). Two-save dwell does. Back-matter case ticks at 0.985. Manual always ticks. |
| **P4** | Lists view + detail + reader/library touch-points + i18n ×4. | Zero hardcoded strings (`tools/i18n-hardcoded-check.cjs` clean for the new files). |
| **P5** | Pace, next-up, smart lists, export, timeline. | Per §5/§7/§8. |

### 9.1 Progress log — append only, one block per turn

**2026-09-03, `primary`.** P0 CLOSED (`25a83b55`). P1 is **2 of 3 clauses closed**:

- §2.1's worked example — CLOSED at `065805d5`, field by field. The heading's "6
  works" versus its own five-row table is settled in §2.1's own correction block.
- **≥25 real-message fixtures — CLOSED at `3837058a`. 28 fixtures**, asserted by
  exact title list plus a provenance check on every entry. It found **five real
  parser defects** on its first run, listed in that commit; the largest was that a
  URL anywhere in a message beat the correct segmentation and returned fabricated
  titles. Two fixtures deliberately pin a KNOWN LIMITATION rather than a fix
  (`君の名は。` and `ハイキュー!!` lose their trailing marks) — do not "fix" those
  without also handling ordinary sentence punctuation.
- **A mutation test per parser rule — CLOSED at `9d603e58`**, landed on this
  branch by the §9.2 integration merge. The three that existed when this block
  was written (URL-before-split, the §4.4 abandoned guard, the CAS retry) were
  per-defect, not per-rule; `readingListParserMutations.test.ts` is the per-rule
  harness the clause asked for.

Two supporting layers landed beside the parser, both required by every P1 surface
and neither in the phase table:

- `dc5c345a` — `shared/readingListMutations.ts`, every change a surface can make,
  as pure `(document) -> {document, events}` functions. 30 tests.
- `e953820e` — `renderer/readingListsClient.ts`, the compare-and-swap retry. A
  refused write re-applies the INTENT against the document main handed back; a
  patch-based client resurrects the entry the other window removed, and the
  mutation control in that commit demonstrates exactly that.

**Exact next slice: the §2.5 paste preview dialog.** Everything under it exists —
parser, mutations, client, IPC, store. It is the last thing standing between P1
and a user, and it is also what makes `readingListsClient.ts` stop being a
`test-only-module` in `tools/architecture-baseline.json`. Ship edit + drop +
triage strip + dropped-lines disclosure first; merge, split and reorder-in-preview
are a follow-up, and `reorderReadingListEntries` already exists for the last one.

**2026-09-04, `primary2`. P1 CLOSES — all three done-when clauses.**

- `6ff47c06` — **§2.5's sheet.** `shared/readingListPreview.ts` (the model, no DOM)
  + `ReadingListPastePreview.tsx` (renders it, owns only draft state and the
  keyboard). Edit, drop, triage strip, dropped-lines disclosure, Ctrl+Z, Reset,
  per-row Revert. Three decisions not to re-derive: a triage row is INCLUDED
  (§2.5 says flagged, not silently dropped); a dropped row is KEPT unticked so
  `lineIndex` never shifts under a pending edit; Ctrl+Z inside a text field is
  left to the caret. The confirm is disabled AND names its reason, and the
  blank-title exclusion also lives in `readingPreviewImport` so a caller that
  ignores the button still cannot mint a nameless work. Built on L2's **Work**
  tokens, not Liquid — the transformation plan keeps editable tables opaque.
  Control: a triage row starting unticked → 11 of 33 RED; dropping the
  blank-title exclusion → 1 of 33 RED. Restored, sha256 `C5AD696F`.
- `a4c5d6e8` — **`ReadingListPasteFlow.tsx`**, the sheet joined to the store.
  Found and fixed a real defect in the same commit: a failed load degraded to an
  EMPTY document, the import found no list on it and never reached IPC, so a
  missing bridge was reported to the user as *"that list no longer exists"*.
  6 tests against a fake main doing real CAS — two refusals → 3 writes, ONE
  surviving import, 3 entries not 9; the attempt limit → a conflict message with
  the sheet still standing; a re-paste reports added 0 / skipped 3. Control:
  `attemptLimit` 1 → the retry test RED by name, restored, sha256 `A900F813`.
  `readingListsClient.ts` stops being a `test-only-module`; the pending baseline
  entry moves up to this flow, which **P4 §6 mounts verbatim**.
- `9d603e58` — **the third clause: a mutation test per parser RULE**, not per
  defect. `readingListParserMutations.test.ts` is a real mutation harness: 26
  rows, each breaking one rule *in the parser's own source*, transpiling it in
  memory (the parser's single import is `import type`, so a mutant needs no temp
  file in `src/` — several suites here scan the tree) and asserting the property
  is violated. Every row asserts its anchor is present first, and asserts the
  property on the REAL parser first. Control: making one row's replacement
  identical to its anchor → that row RED on "the property SURVIVED".

Three inputs had to be built rather than borrowed, and each is a trap: the
inline split drops a one-character piece (`鼻` never reaches the threshold); the
URL-before-split defect needs a message that is ONLY a link, because a numbered
list recovers on its own; and the overlong penalty needs a real rival —
`quoted-prose` with no competitor passes either way.

**Exact next slice: P2, §3 matching + §3.1 late binding.** Hook the fingerprint
in `src/main/library.ts` on the item-added path, in one place, not per importer.
Its done-when is an integration test that adds the item SECOND.

**2026-09-04, `primary2`. P2 CLOSED against its own done-when (`9678a525`).**
3 of 6 phases (P0, P1, P2).

- `shared/readingListMatch.ts` — pure. Fingerprint / score / three dispositions
  at `BIND_ACCEPT` 0.82, `BIND_SUGGEST` 0.55. `titleSimilarity` is REUSED from
  `mediaMetadataMatch.ts`: its containment ceiling is already the "a sequel
  swallows its predecessor" guard, and a second fuzzy matcher in one tree is how
  two surfaces start disagreeing about what a title match is.
- **A kana Hepburn romanizer had to be written — nothing in the tree had one**
  (`langs.ts` folds katakana→hiragana; `jiten.ts`/`mediaIdentity.ts` only carry a
  provider's `romajiTitle` field). Kanji contributes NO romaji key, deliberately:
  a guessed reading produces a confident wrong bind, the one outcome this module
  exists to prevent. Space-stripped key variants are load-bearing, not
  belt-and-braces — Japanese writes no word boundaries, so `ノルウェイのもり`
  romanizes to `noruweinomori` against a file named `Noruwei no Mori`, and
  without the stripped form those are a near-miss instead of the same book.
- **Volume disagreement is −0.35, not a nudge.** Vol 1 and vol 7 of one series
  are the same string, so the title signal is weakest exactly where it looks
  strongest. Author agreement stays ±0.1/−0.12 and can never reject a plain
  title match — a book catalogued under a romanized author on one shelf and a
  kanji author on another is not a mismatch.
- **The hook is `writeDb`, not an importer.** `library.ts` has seven
  `items.unshift(item)` sites and every future acquisition route adds another;
  all 18 write sites funnel through `writeDb`, so diffing the incoming set
  against disk yields "items that are new" for all of them at once, including
  routes written after this line. Guarded and swallowing: a matcher fault must
  not be able to fail the import that carried it.
- CONTROL: dropping the `state !== 'wanted'` guard in `bindReadingWorkToItem` →
  "does not touch an entry the user already moved off wanted" RED alone, by
  name. Restored, +75/−0 against HEAD.

**NOT closed by this slice, and not silently dropped: §3(b) catalogue
enrichment** (jiten / `visualNovels.ts` / `malLibrary.ts` → `externalIds`,
canonical titles, cover art). It is outside P2's stated done-when and §3 itself
says it never blocks, so it rides with P5's smart-list/difficulty work where the
catalogues are already being read.

**TRAP, and it cost two runs.** The parser gates `line-per-title` on
`indexed.length >= 3` (`readingListParser.ts:377`, §2.2's own rule — a one- or
two-line message is a sentence, not a list). A short fixture parses to ZERO
entries, so every assertion then passes vacuously against an empty list. This
suite read as a broken binder until the parse itself was dumped.

**2026-09-04, `primary2`. P3 CLOSED, all three done-when clauses (`1479861e`).**
4 of 6 phases (P0, P1, P2, P3).

- `shared/readingFinishDetector.ts` (pure) + `main/readingFinishWatcher.ts`
  (store, CAS, broadcast), wired at `library:setProgress`. No reader was touched
  — trap 2 holds.
- **The dwell needs no new state.** The previous save is already on the
  `LibraryItem` (`progress` + `lastReadAt`) and main reads it immediately before
  overwriting it, so that pair IS §4.1's two consecutive saves. It survives a
  restart, which an in-memory dwell map would not.
- **§4.1's "location parses to the final part" is not directly derivable** —
  there is no part COUNT in the tree (`LibraryItem` has `pageCount` for manga and
  no book equivalent). Implemented as `FINAL_PART_FRACTION`: the location parses
  AND sits at the end of the part it names. With the whole-book `percent`, "end
  of a part" and "98.5 % of the book" can only both hold at the end of the last
  one, while a stale `percent` of 0.99 against `p:3:0.4` is rejected — which is
  the case the clause exists for. Recorded as a decision, not an omission.
- `percent` is deliberately NOT in the position signature: it is a derived
  display number and drifts between two saves at one location, which would make
  the dwell unreachable rather than strict.
- **DEFECT FOUND AND FIXED in `applyReadingListImport`.** Work dedup was scoped
  to the LIST, so the same book on two lists minted two work records — and §1's
  own rationale for works living beside lists is that the cross-list finish is
  only free with one record to tick. P2 bound one copy, P3's fan-out ticked one
  copy, and the second list silently never moved. Works now dedup across the
  DOCUMENT (duplicate ENTRIES stay per-list), and an entry whose work is already
  bound starts `owned` instead of telling §5.2's shopping list to buy a book
  already in the library.
- CONTROLS, **two, because the first was caught by another rule and that is
  recorded rather than hidden**: removing only the `held` guard → 1 RED (the
  detector's first-save case) while the watcher's scrub control stayed GREEN,
  caught by the `dwellMs` guard. Removing BOTH — the naive `percent >= 0.98`
  detector trap 4 names — → **4 RED including both negative controls by name**.
  Restored, sha256 `B0A40476`.
- Clause 3, "manual always does", was already met by P1's
  `setReadingEntryState(..., 'finished', 'manual')` and §4.5's un-finish; both
  re-derived green this turn rather than assumed.

**Exact next slice: P4, §6 surfaces + §11 IN FULL.** §11 is a GATE on P4, not
polish — the user named it. Click-through rides `onOpenBook` (already threaded
through `App.tsx` 712/770/799/820/905), widgets register in
`renderer/widgets/registry.tsx` like any other, reminders reuse
`main/buddyScheduler.ts` and are OFF by default at most one a day. New strings
go in the already-wired `shared/i18n/catalogs/{en,ja,zh,ru}.ts`, never a new
module (trap 5).
**2026-09-04, `primary`.** **P2 CLOSED on `feat/nyaa-subtitles`**, against its own
done-when: `readingListsLateBinding.test.ts` adds the list first and the file second and
the `wanted` entry ticks to `owned`. `9a7e269d` the matcher (kana→romaji, title
similarity, 0.82 accept / 0.55 suggest, five mutations); `e11f15ba` bind, unbind and the
suggest/dismiss/restore band; `e1bd081a` the main-side hook. Recovered: `backup` died one
second after writing `library.ts`, with the slice complete and uncommitted.

The hook is **`onLibraryItemsAdded` on `writeDb` itself**, not a subscription per importer.
`library.ts` has six import paths and nineteen `writeDb` calls; diffing the write by item id
covers importers nobody has written yet. It defers with `setImmediate` (the import path is
one a user waits on), swallows its own failures (an unreadable lists document is not an EPUB
import error), and re-applies the intent on a CAS refusal. 16 tests, 4 negative controls by
name. `tools/architecture-baseline.json` loses `test-only-module:readingListMatching.ts`,
exactly as that entry's own escape clause said it would.

**2026-09-04, `primary`. THE FORK IS CLOSED (`120a838a`) and P4 is open (`97f00f6f`).**
**4 of 6 phases, on ONE branch** — see §9.2 for what the merge cost and what it caught.

`shared/readingListViews.ts` is the pure model §6's two surfaces draw from, landed
before any component for the same reason P1b landed the mutation layer before any
surface: three callers want it (the view, §11.2's widgets, P5's smart lists) and a
count computed inside a component is a count two surfaces will eventually disagree
about. Two decisions, both load-bearing:

- **`abandoned` and `skipped` are OUT of the progress denominator.** §5.9 makes
  abandoned first-class precisely so a book put down on purpose stays out of the
  pace maths, and a bar a deliberate abandonment drags down IS the shame column
  that clause exists to delete. Ten entries, two abandoned, eight finished reads
  **8/8** — so `total` and `counted` are separate fields and a card can say both.
  An all-abandoned list reads 0, never `NaN`.
- **Row order is TOTAL** — `order`, then `addedAt`, then `id`. Two entries can
  share an `order` (an import racing a reorder produces exactly that) and a list
  that reshuffles between renders is indistinguishable from data loss to the
  person watching it. The test re-sorts the already-sorted array, which is what a
  re-render actually does.

Smaller, and each one a defect avoided: triage counts per **work**, so a book
pasted twice onto one list does not claim two decisions; the mosaic takes at most
four covers and never one item id twice; `readingListRows` never yields a blank
title (it falls back to the pasted raw line) and never drops a row whose work is
missing. `itemId: null` is documented as a **destination** — §11.1's acquisition
path — not as a missing one.

Controls: emptying `EXCLUDED_FROM_PROGRESS` and flattening the order tiebreak to
`return 0` → **3 RED**, each by the name of the rule it breaks. Restored
byte-identical, 15/15 green.

**Exact next slice: P4b — the `ReadingListsView` surface, plus i18n ×4.** Grid of
cards off `summarizeReadingLists`, detail rows off `readingListRows`, and then
mount `ReadingListPasteFlow.tsx` **verbatim**: `tools/architecture-baseline.json`
holds it PENDING as a route with no consumer, and that entry's own escape clause
says to re-key it to accepted the moment a P4 surface renders it. §11 is the
larger half of P4 and it is a gate.

**2026-09-04, `backup`. §11.2 and §11.3 are BOTH CLOSED. P4 now owes only §11.1 and §11.4.**

Opened as interrupted-work recovery: `primary` was killed at 02:58:39 with §11.2 complete
and uncommitted — its last file was written at 02:58:38, one second before. Re-derived,
finished, gated, `d4f9bd4d`.

- `d4f9bd4d` — **§11.2, four widgets on the real `WIDGETS` registry.** The gap the interrupt
  left: `widgets.readingLists.noFinishes` was called and existed in NO catalog.
  `i18n-check.cjs` compares catalogs against each other, so a key missing from **all four**
  is green on every gate and surfaces only as a raw dotted string — on the empty state a new
  user sees first. Fixed, plus a guard that reads every `t('...')` call site out of the
  widget source and demands four languages. **Control: deleting the en key → 2 RED.**
- `ca0093b5` — **§11.3's scheduler, in main.** Decisions pure in
  `shared/readingListReminders.ts`, because §11.3's clauses are RATE clauses and a rate rule
  proven through a live timer is proven once, slowly. **Seven mutation controls, seven RED**,
  each by the name of its rule: one-a-day, first-run, the 10 % stalled floor, the weekly pace
  cap, the pace comparison, read-today silence, silenced-kinds. Fired-state is PERSISTED —
  in memory it would mean "one per LAUNCH". `readingListsBinding.ts` now NAMES what bound
  (`boundWorks`) rather than counting it; a count cannot say which book turned up.
- `38c8e910` — **the notification.** Mounted inside `ToastHost`, the one place every shell
  already mounts exactly once (App.tsx renders it in ten branches). Not a toast: a stalled
  book offers three answers and `ToastHost`'s toast carries one. Tests assert EFFECTS —
  finished writes `finished`, abandoned writes `abandoned`, Never again reaches main and
  writes no document, Continue on an UNBOUND entry routes to the list.
- `400c4af3` — **the settings card.** Every kind is off by default, so this is the only route
  in; without it the feature is correct, silent and unreachable. A silenced kind reads as OFF
  and says why (its enable flag is still true in main), and turning it on clears the silence
  in the same call.

**Trap, paid here:** `window.api.readingListsWrite` is POSITIONAL —
`(baseRevision, document, events)`. An object-shaped stub recorded `undefined` and both
effect assertions read as PASSES until the document was dereferenced.

**Not mine, in the shared tree:** `i18n-hardcoded-check.cjs` reports
`SeanimeDevPanel.tsx` 18 → 21. It is another track's uncommitted change and is in none of
these four commits.

**Exact next slice: §11.4, starting with keyboard + undo on `ReadingListsView`.** §11.1's
click-through table is largely satisfied by P4b and §11.2; audit it row by row against the
table rather than assuming, then §11.4's eight pass/fail rows.

**2026-09-04, `primary2` (worktree `jp-wt-filesapp`). §11.4: bulk selection and
performance CLOSED. P4 owes §11.1's audit and five §11.4 rows.**

Counted against §11.4's own nine bullets: **keyboard** (`816a68c1`), **bulk
selection** and **performance** are closed; **undo** is closed for every
destructive act that exists (remove entry, delete list, dismiss suggestion, and
all three bulk verbs) and still owes the re-parse; **drag and drop**, **real
empty states**, **loading/error states**, **accessibility** and **density** are
open. So **3 of 9 closed, 1 partial, 5 open.**

- `f55e002a` — the three bulk verbs in the mutation layer. Finish and remove are
  FOLDS over the single-entry mutations, so what "finished" means stays in one
  place; move is not a fold, and carries the entry whole (same id, workId, state,
  dates) because re-adding it would mint a new work and reset the state. A work
  already on the target is skipped and NAMED. 43/43, five mutation controls.
- `a9fa1550` — the bulk bar. The selection is **derived through the live rows**
  before it is used, so an entry removed by another window falls out of the count
  on its own. A **shift-range spans only the rows on screen**; ranging over the
  unfiltered list selects entries that were never visible. 18/18, three controls.
- `e5ad2963` — §11.4's performance row: one row repaints on a one-row change,
  not 500. 20/20, two controls.

**Two traps, both of which cost a run here:**

1. **`applyReadingListsMutation` normalizes its base**, which rebuilds every
   entry object — so `memo` on `row.entry` identity NEVER bites and scored 500 of
   500 rows re-rendering. Pass `entryId` and `state`; they are primitives.
2. **The two bulk undos replay their captured indices in OPPOSITE directions.**
   The removal fold captures each index against the array as it stood at that
   step (two adjacent rows both capture 0) and unwinds BACKWARDS; the move takes
   all its indices from one snapshot, so they are simultaneous and re-insert in
   ASCENDING order. I wrote the move backwards first; only a whole-array
   assertion caught it.

Smaller: `setUiLang` is a dynamic import of a 12,000-key module, so a fixed
microtask wait reads 0 repaints on a CORRECT component — poll `getUiLang()`. And
a `perl -0pi` whose pattern carried a Japanese literal double-encoded six
characters elsewhere in the file; grep for mojibake after any scripted non-ASCII
edit.

Gates at `e5ad2963`: `npx vitest run` EXIT 0, **1064 passed | 1 skipped, 13,705
tests**; `i18n-check.cjs` EXIT 0 at **12,410** keys; `architecture-audit.cjs`
EXIT 0 "Nothing new"; eslint 0 errors on every touched path.

**Exact next slice: §11.4's empty/loading/error states**, which is the cheapest
remaining row and the one a new user hits first — the grid's "No lists yet" is
the bare string the plan forbids and should be the paste box itself with §2.1's
example as the hint, and the detail's load state should be skeleton rows. Then
density, then drag-and-drop (`reorderReadingListEntries` already exists and has
no consumer). §11.1's click-through table still needs auditing row by row rather
than assuming — four of its eight rows have no test naming them.

**2026-09-04, `primary2` (worktree `jp-wt-filesapp`). §11.4: empty, loading and
error states CLOSED, plus the library route the copy needed. 5 of 9 rows.**

Counted against §11.4's own nine bullets: **keyboard** (`816a68c1`), **bulk
selection** (`a9fa1550`), **performance** (`e5ad2963`), **real empty states**
and **loading and error states** are closed; **undo** still owes only the
re-parse; **drag and drop**, **accessibility** and **density** are open. So
**5 of 9 closed, 1 partial, 3 open.**

- `ce7ae626` — **a `reset` store could not be told from a first run.**
  `main/readingListsStore.ts` computes a health record on every snapshot — ok /
  empty / recovered / reset — and `useReadingListsDocument` threw it away. The
  word appeared in no renderer file. So `reset` (the file did not parse AND
  there was no restore point, the one case where the lists are genuinely gone)
  hands back `emptyReadingListsDocument()`, byte-identical to a first run's, and
  the grid rendered *"No lists yet. Make one, then paste a message into it."*
  That is the sentence the clause forbids. `recovered` is a `--warn` notice over
  a grid that is still drawn, `reset` is `--error`; both say the unreadable file
  is still on disk. No revision count is printed — the store documents
  `lostRevisions: 1` as unknown-but-at-least-one, so a number would be
  fabricated, and a test asserts its absence. Skeleton cards share `.rlv__grid`'s
  rule rather than copying it.
- `5d98a401` — **28 `var(--lq-…)` sites naming tokens declared NOWHERE.** Read
  live off pid 13316: `--lq-surface-2`, `--lq-border-weak` and `--lq-radius-2`
  all resolve to `""`. So the sheet painted fixed white translucencies in every
  theme, and on `classic-light` (`--bg` and `--panel` both `#ffffff`) the card
  borders composited to exactly the page colour. `--lq-accent`'s fallback was a
  BLUE. `liquidTokenNamesResolve.test.ts` is the repo-wide guard, with a vacuity
  check and three recorded names in sheets other tracks hold open.
- `aac290e6` — **the empty grid IS the paste box**, and the hint is
  `READING_LIST_EXAMPLE_MESSAGE`, promoted out of the parser test into
  `readingListParser.ts` and imported by both. The sample a user sees is now by
  construction the exact input §2.1's acceptance test pins the output of.
  Untranslated on purpose: sample input, not chrome.
- `3384cdfb` — **`addLibraryItemToReadingList`.** §11.4's copy says "paste a
  message **or add from your library**"; `aac290e6` printed only the first half
  because the second route did not exist anywhere in `src/renderer`. Now it
  does: a fold over add + bind at confidence 1, a duplicate refused and named, a
  picker that MARKS what is already on the list rather than hiding it, and an
  undo.

**Four traps, each of which cost a run:**

1. **jsdom does not perform implicit form submission from a button click.** A
   `type="submit"` button is therefore untestable by the mouse path — the suite
   passes on a button that does nothing. Use an explicit `onClick` and keep
   `onSubmit` for the Enter key.
2. **`byText` returns the wrapping DIV, not the button.** It scans
   `button, span, p, div` in document order, so a `.rlv__paste-actions` holding
   one button has the same trimmed text as the button. Measured `tag: "DIV"`.
   Clicking a div does nothing, silently. It also matched the HEADER's paste
   button when the empty state's own was meant.
3. **A control that reads GREEN is a finding.** `state: 'owned'` on the library
   add was dead: flipping it to `'wanted'` left all 83 tests green, because
   `bindReadingWork` promotes immediately afterwards. Removed rather than kept.
4. **A `const query` in the picker shadowed the filter strip's `query`** in the
   same scope, so the row-count line vanished unless the picker's search box was
   non-empty. Caught by an existing test, not a new one.

Gates at `3384cdfb`: `npx vitest run` EXIT 0, **1067 passed | 1 skipped, 13,738
tests passed | 6 skipped**; `i18n-check.cjs` EXIT 0 at **12,430** keys;
`i18n-hardcoded-check.cjs` EXIT 0; `architecture-audit.cjs` EXIT 0 "Nothing
new"; eslint 0 errors on every touched non-CSS path.

**Exact next slice: §11.4's density row** (comfortable/compact — the plan's own
"a 20-book list and a 300-book list are not the same UI problem"), then
**accessibility**, then **drag and drop** (`reorderReadingListEntries` exists
and still has no consumer). Undo's remaining debt is the re-parse alone.
§11.1's click-through table still needs auditing row by row — four of its eight
rows have no test naming them, and that has now been deferred for three turns.

**2026-09-04, `primary2` (worktree `jp-wt-filesapp`, branch `wt/files-app`).**
Three §11.4 rows: **density**, **accessibility**, and the first half of **drag
and drop**. §11.4 goes **5 of 9 -> 8 of 9 closed** (+1 partial). The one row
still open is drag-and-drop's other three clauses; undo's only remaining debt is
still the re-parse.

- `fbec7ec7` — **density.** Comfortable/compact, one preference over the whole
  surface, persisted in renderer `localStorage` (NOT the document: that is user
  data, it round-trips through main, and a chrome preference riding in it would
  make every flip a store write, a broadcast and a line in the event log).

  **Compact does not shrink a hit target, and that is the whole design.**
  `.rlv__row-open` and `.rlv__selectall` are 34px, not 32, because the
  accessibility walk's floor IS 32 and it steps in halves. A compact mode at
  28px would buy this row by failing the accessibility row two bullets above it.
  So compact spends only the space between and around the targets: 48px/row ->
  40px/row, 17% more rows, every target unchanged. The guard asserts that NO
  `[data-density='compact']` rule declares any height, width, transform or
  scale, with a vacuity check that the attribute is not inert. 5 of 5 RED.

- `cbd3ff26` — **accessibility, and a role the tree threw away.** Every list
  card carried `role="progressbar"` with `aria-valuenow` INSIDE its own
  `<button>`. ARIA gives `button` presentational children, so that role was
  stripped in every browser: it announced nothing, while making the source read
  as covered. The bar is `aria-hidden` now and the sentence above it ("0 of 2
  finished") is the announcement, inside the same button. Also: `ul.rlv__grid`,
  `ul.rlv__rows` and the picker list had no accessible name — "list, 3 items"
  on a surface with three lists on it.

  `__tests__/helpers/a11yWalk.ts` is a HARNESS (RULE 1), not a probe: it takes
  any container. Two of its four legs open a panel FIRST, because the panels are
  click-mounted and a walk of the resting surface never reaches them. What it
  CONFIRMED matters as much as what it found: every control already had a name,
  nothing clickable is a bare div, every focusable is native or `.ui-focusable`.
  5 of 5 RED.

- `a9dc23e4` — **reorder.** `reorderReadingListEntries` had existed since P0
  with no consumer in `src/renderer`. Drag plus Alt+Arrow, one write, one undo.
  The order handed to the mutation is the WHOLE list, never `visibleRows`: that
  mutation APPENDS omitted ids, so a filtered reorder moves every hidden entry
  to the end, invisibly. 5 of 5 RED after two rewrites — see below.

**TWO MUTATION CONTROLS READ GREEN, and each was a finding of its own:**

1. *"Compute the reorder from the filtered view"* passed all 72 tests. It
   APPLIED (sentinel-substituted and grepped, per `mutation-control-that-never-
   applied`) and was NEUTRALISED: `reorderRows` closes over `visibleRows` with
   deps `[list, t, write]`, so the mutant read a stale unfiltered array and did
   the right thing by accident. A control that the code under test can
   accidentally satisfy proves nothing.
2. *"Delete the `preventDefault` in `onDragOver`"* passed everything. **jsdom
   implements NONE of the HTML drag-and-drop model** — a synthetic `drop` fires
   whether or not `dragover` was cancelled, and cancelling dragover is the only
   thing that permits a drop in a real browser. Every drag test would have
   stayed green with the feature dead in the app. `defaultPrevented` on the
   dispatched event is the one fact jsdom does report, so that is what is
   asserted now, with its negative half.

**Three more traps, all live-measured this turn:**

3. **`CSS.escape` is UNDEFINED in this jsdom.** `label[for="${CSS.escape(id)}"]`
   throws — and only for elements that HAVE an id, which on this surface means
   only the two click-mounted panels. A walk of the resting surface passes clean
   and the failure looks like a panel bug.
4. **`event.dataTransfer` is `undefined` in jsdom.** A drag payload put there is
   unreadable from every test, so the dragged id is held in a ref in the view.
5. **A `{/* JSX comment */}` immediately after `) : (`** is a parse error: the
   ternary arm takes one expression, and the comment makes two children with no
   fragment. Use a `//` line comment above the element instead.

Gates at `a9dc23e4`: 410 tests across the 20 reading-list suites, all passing;
`i18n-check.cjs` EXIT 0 at **12,446** keys; `i18n-hardcoded-check.cjs` EXIT 0;
eslint 0 errors on every touched non-CSS path.

**Exact next slice: §11.4's drag-and-drop remainder** — drag an entry BETWEEN
lists (`moveReadingListEntries` already exists and the bulk bar already uses
it), drop a library item onto a list card, drop a `.txt` onto the lists view.
Then **§11.1's click-through table, row by row** — four of its eight rows still
have no test naming them, and that has now been deferred for four turns.

**2026-09-04, `primary2` (worktree `jp-wt-filesapp`). §11.4 CLOSES at 9 of 9.
§11.1 goes 3 of 8 rows to 7 of 8. §11 is 18 of 19. P4 owes ONE row: §11.1 row 8.**

`8ec4ee24`, `9ddc89a5`, `16fc0811`, `a50faedb`. 33 mutation controls across the
four, every one sentinel-checked as APPLIED before its verdict was read;
**33 of 33 RED**.

- `8ec4ee24` — **§11.4's drag-and-drop remainder, all three clauses.** Between
  lists (a rail of the other lists, mounted on `dragstart` and gone on
  `dragend`), a library book onto a list card, a `.txt` onto the view.

  **The library half needed NO change to the library.** `LibraryView` has set
  `app/lib-item` on all four of its drag sources (1273, 1584, 1624, 1846) and
  read it back at 464 since long before this view existed. Joining that type was
  the whole integration; minting a second one would have been two contracts for
  one drag.

  **THE GUARD THAT DECIDES WHETHER ANY OF IT WORKS: every `dragover` test is
  written against `dataTransfer.types`, never `getData`.** The HTML model puts
  the data store in *protected* mode during `dragover`, where `getData` returns
  `''` for every type no matter what the drag holds. A guard written on `getData`
  never cancels `dragover`, Chromium then refuses every drop — and jsdom, which
  has no protected mode either, reports the whole feature green.

  A dropped file lands in the §2.5 preview, never straight into the list: a file
  is a paste through a different door, and it would otherwise be the one intake
  path that skips the preview. In the grid there is no list to import into, so
  the FILE NAMES the list it creates.

- `9ddc89a5` — **§11.1 rows 2 and 7.** Row 2 was not implemented at all:
  `openRow` opened the book and wrote nothing. It promotes `owned → reading`
  now, and **only** from `owned` — `finished`, `abandoned` and `skipped` are
  decisions, and opening a book you abandoned to check one line is not a
  decision to resume it. No undo toast, deliberately: it would fire on the app's
  most common gesture, and the row's own state Select is the reversal, in view.

  Row 7's highlight is derived from `sourceRef.lineIndex`, **never** by matching
  `rawLine` back into the text. The fixture is a message naming the same title
  on lines 2 and 4 with the entry from line 4; the matching mutant marks line 2.
  Matching would also silently mark nothing after §2.4's re-parse.

- `16fc0811` — **§11.1 row 6.** `authorRaw` has been on the work since P0 and
  the parser writes it (`readingListMutations.ts:343`); **nothing in
  `src/renderer` had ever read it.** `readingWorksByAuthor` is a pure function
  in `readingListViews.ts`, not a hook, because §11.2's widgets and P5's smart
  lists want the same answer. Across EVERY list — a list-scoped version answers
  "none" for the ordinary one-book-per-list case and reads like a broken link.
  Same normaliser as `readingListMatching`, so two spellings are one person; a
  BLANK author matches nothing, or every authorless work comes back.

**Two findings of the "it read green" kind, both kept as tests:**

1. `addLibraryItemToReadingList` binds through `boundItemIds`, not an `itemId`
   field. An assertion on `work.itemId` reads `undefined` and would have passed
   as `toBeUndefined()`. The row must be BOUND, not merely titled the same, or
   §3's matcher has to find its own book back.
2. The parser rejects a bare `Delta\nEcho` — 0 titles, "2 lines were ignored".
   A file-drop fixture has to be list-SHAPED (`1. Delta`), or the preview opens
   empty and the test proves only that a panel appeared.

**Gates at `16fc0811`, from a worktree with `git status --short` EMPTY, so this
is committed HEAD and not somebody's uncommitted conversions:** `npx vitest run`
**EXIT 0 — 1,073 files passed / 1 skipped; 13,827 tests passed / 6 skipped**.
`i18n-check` EXIT 0 at **12,465** keys. `i18n-hardcoded-check` EXIT 0.
`architecture-audit` EXIT 0, "Nothing new", 6 pending. eslint 0 errors.

- `a50faedb` — **§11.1 row 4, so §11.1 closes 7 of 8 and §11 stands at 18 of 19.**
  Rows had no cover at all; only list cards carried the mosaic. **Two
  destinations on one row** — the title opens the reader, the cover reveals the
  book — because a cover repeating what the title does is decoration with a tab
  index.

  **What makes it a link rather than a wire:** `resolveSelection` returns `null`
  for an id not in `visible`, deliberately (`libraryShelf.ts` — a recorded id
  outlives its item three ordinary ways). So `setSelectedId` ALONE lands on a
  CLOSED drawer whenever the user's folder/language/level filter excludes that
  book, which is indistinguishable from a dead link. `LibraryView`'s new
  `revealItemId` clears those three filters, and that is the honest thing to
  show: the user asked for this book, not for their filter.

  Keyed on the id, not on mount, so cover → back → cover reveals again;
  `ReadingWorkspaceView` holds an `{itemId}` OBJECT rather than a bare id for
  the same reason. `onShowInLibrary` is OPTIONAL and the cover is a button only
  where a host supplies it — otherwise, and on an unbound row, the same image
  renders inert and `aria-hidden`, so the column does not go ragged. `canReveal`
  enters `rowActions` as a BOOLEAN dep: the handler's identity changes on every
  render of the mount and depending on it would repaint all 500 rows.

  7 of 7 mutants RED, including *"the reveal leaves the folder filter set"* and
  *"the reveal fires on mount only"*. **33 of 33 mutants RED across this turn's
  four product commits.**

  TRAP: the filter precondition must be driven from the shelf's folder rail
  (`LibraryView.tsx:1393`), never the View menu — menu items render as bare
  children on the default theme and are unreachable from a jsdom mount, so a
  test written against the menu finds no button and reads as the rail missing.

**Gates re-run after `a50faedb`, tree clean:** `npx vitest run` **EXIT 0 —
1,074 files passed / 1 skipped; 13,839 tests, 13,833 passed / 6 skipped.**
`i18n-check` EXIT 0 at 12,466 keys. `i18n-hardcoded-check` EXIT 0.
`architecture-audit` EXIT 0, "Nothing new", 6 pending. eslint 0 errors.

**2026-09-04, `primary2`. §11.1 CLOSES 8 of 8. §11 CLOSES 19 of 19. P4 is DONE.**

- `ed946667` — `readingListsForItem`, row 8's pure core. Scans EVERY work binding
  the item rather than `workForItem`'s first match: two works claiming one item
  is repairable, not impossible, and the first match then reports FEWER lists
  than the user is on. Archived lists come back FLAGGED — the derivation cannot
  know if its caller is the reader strip or a diagnostic.

  An `itemId.trim()` was written and then REMOVED: no test could falsify it, and
  untestable defensive code reads as covered. The blank guard that stayed is
  falsified against an UNNORMALIZED document, because `normalizeWork` strips
  `''` out of `boundItemIds` (`readingLists.ts:317`) and the assertion passes
  with the guard deleted on a normalized one. **9 of 9 mutants RED.**

- `421bdff1` — **A DEFECT FOUND BY NEEDING A ROUTE. `section: 'lists'` was
  unreachable, and five live call sites had been publishing nothing.**

  `lists` is in `READING_WORKSPACE_SECTIONS` and `readingWorkspaceSurfaceForSection`
  maps it to a real surface, but `SECTION_ALIASES` — the ONLY table
  `normalizeReadingWorkspaceSection` reads — never got the key. So every route
  naming it normalized to `null` and `resolveReadingWorkspaceOpenRequest`
  dropped the `os:open` before `DesktopShell` could publish it. Dead:
  `ReadingReminderHost.tsx:106/:118/:119` (§11.3's "open the list") and
  `widgets/readingLists.tsx:61/:128` (§11.2's "click the header → list detail").
  **Both sections were closed as passing**, and §11.2's is the one the user named
  in their own words.

  The test is written over the SECTION union, through both the object form and
  the serialized deep-link form, so the next section added is caught the same
  way instead of shipping dead too. Deleting the one alias line turns 3 of 13 RED.

  Also adds row 8's `entryId` to the route, dropped when no `listId` names a
  list — an entry id alone names a row in an unnamed list.

- `906e68b0` — **row 8 itself.** `ReadingListMembership` is read-only: §10.2
  keeps list logic out of the two reader files, so the reader hands it an item
  id and renders what comes back. **Nothing** renders for a book on no list —
  an "on 0 lists" chip is noise, not an empty state. Archived lists are dropped
  HERE, at the caller that knows. The landing scrolls, marks `data-focused`, and
  moves the keyboard into the row; it CLEARS a filter that would hide that row
  and does NOT clear it for an entry that is not on the list at all.

  **9 of 10 mutants RED.** Two read GREEN first. *"a stale entry id still
  scrolls"* was a REAL gap: without the membership guard the effect falls
  through and clears the user's filter for a row that was never there, and
  nothing is marked either way, so the mark alone cannot tell the two apart —
  the test now sets a filter and it is RED. *"itemId guard removed"* stays GREEN
  and is NOT a gap: `itemId ?? ''` is caught by the core's own blank guard,
  which has its own RED mutant. Recorded rather than counted.

  The component test drives `resolveReadingWorkspaceOpenRequest`, the function
  `DesktopShell` runs — not the event detail. Reading the detail passes on a
  route the resolver rejects, which is how the five call sites above shipped dead.

**TWO TRAPS:**

1. **`addReadingListEntry` mints a NEW work on every call**
   (`readingListMutations.ts:762` — `workFromParsed` then
   `works: [...next.works, work]`). It never reuses one by title. Adding one
   book to three lists by hand gives THREE works, so a fixture binding only
   `works.find(...)` answers "on 1 list" and reads as the strip being broken.
2. **A whole-file `String.replace` mutation script hits the wrong function.**
   The first version of `mutate-row8-core.cjs` mutated `readingWorksByAuthor`,
   which sits ABOVE `readingListsForItem` and shares almost every anchor line;
   six of nine landed there and four still read RED off the author tests. Scope
   every mutation to the target function's own text span.

**`MangaReader.tsx` IS NOT WIRED.** It is ` M` in the main tree from another
track (checked twice, 15:47 and 16:02), and editing it here blocks
`relay-mergeback` until that path goes clean. The change is one import and one
`<ReadingListMembership itemId={item.id} />` beside the title, exactly as in
`NovelReader.tsx:2982`. **Do it the first turn the path is clean.**

**2026-09-04, `primary2`, same turn. P5 OPENS: §8 export ships.**

- `48cc35fe` — `readingListExport.ts`: message, Markdown, CSV. The gate is §8's
  own words — *"the round trip is the point"* — so the test feeds
  `readingListToMessage`'s output back through `parseReadingList` AND
  re-imports it through `applyReadingListImport`, on the §2.1 example.

  **It caught its own first draft.** The author was separated with an em dash;
  `splitAuthor` DELIBERATELY refuses to split a dash (`readingListParser.ts:358`
  — *"'Title - Author' and 'Author - Title' look identical"*), so the author
  round-tripped welded onto the title. Of the three markers the parser reads
  (` by X`, `【X】`, `X著`), `【X】` is the only one natural in every script, so
  it needs no decision about the connector word's language. One separator across
  message and Markdown.

  Markdown is NOT a round-trip format and the test SAYS so: `AUTHOR_MARKERS`'s
  bracket rule is end-anchored and a checklist row carries `· _state_` after the
  title. The title portion does round-trip. Both halves pinned.

  **12 of 12 mutants RED.** Three read GREEN first, all real: the raw-line
  fallback (a dangling `workId` made the row silently ABSENT), `includeSourceUrl`
  in Markdown (one anchor matching two call sites, so NOT APPLIED rather than
  passing), and *"entry order not sorted"* — the fixture reversed the array AND
  rewrote every `order` to match, so the two agreed again.

- `6e46b6c6` — the control that calls it, in the detail header. **Clipboard, not
  a file dialog:** §8's first bullet is *"pasteable straight back into LINE,
  Discord, or a forum"*, and a native save dialog is a modal nothing automated
  can drive. A file save can be added beside it later; the format code is pure.

  Three ways this would have claimed a copy that did not happen, all now tested:
  `await navigator.clipboard?.writeText(t)` **resolves** on a host with no
  clipboard; `writeFailure` renders a FIXED string and ignores its value, so an
  export failure through it reports a failed document write; and a `select` that
  keeps its value fires once and then looks dead.

- `530adf2d` — "Markdown" and "CSV" baselined as untranslated in ja/zh/ru. Six
  lines, nothing reordered. **The gate fires one language at a time**, so ja+zh
  looked complete and ru came back on the re-run.

**FULL GATES at `530adf2d`, tree clean:** `npx vitest run` **EXIT 0 — 1,076
files passed / 1 skipped; 13,874 tests, 13,868 passed / 6 skipped.** `i18n-check`
EXIT 0 at **12,477** keys. `i18n-hardcoded-check` EXIT 0. `architecture-audit`
EXIT 0, "Nothing new", 6 pending. eslint **0 errors** on every touched path.

### 9.3 — 2026-09-04, P5 §7 CLOSED. Smart lists, both halves.

`322e1cef` `03343403` `a9d1c274` `9b9695ff`.

**The three parked decisions, settled against the tree rather than invented.**

- **`difficultyMax` rides the EXISTING L1–L7 `LevelTier`** from
  `effectiveLevelEstimate()` (`libraryLevel.ts:13`) — measured from known-word
  ratio in `inboxMeta.ts:58`, already shown to the user as `LIBRARY_LEVEL_CHIPS`,
  and already on the card contract as `ReadingWorkspaceEntry.level`. No new
  field, no new scale. Rejected, with reasons: `lexiconDifficulty.ts` (passage
  scoped, never persisted per item — one filter would re-parse every book),
  `jiten.ts`'s own `difficultyMax` (remote query param, foreign 0–5 scale),
  `novels.ts`'s `Difficulty` strings (hand-authored, catalogue-only, absent from
  anything imported).
- **An unmeasured work PASSES the cap.** `levelSortKey`'s missing-level sentinel
  is **99**, so the obvious `level <= max` silently drops every book the
  enricher has not reached — and a fresh import has no level for hours, while
  "Ready to read" exists to surface owned books. `requireKnownDifficulty` is the
  strict reading. The row then SAYS "Not rated yet", or the band reads as
  verified for every row in it.
- **`untouchedSince` and `progressBelow` are added, additively.** §7 defines
  Abandoned as *"started, <90 %, untouched 30 days"* and offers only
  `startedBefore`. Started-at and touched-at are different facts — a book begun
  a year ago and read this morning is not abandoned — so collapsing them would
  ship a preset that lies. Everything §7 names keeps its name.

**FINDING, and the reason §7 was more than a module.** `smart` has been in
`ReadingListKind` since P0 and is accepted by `createReadingList` and
`updateReadingList`, but nothing ever produced one, nothing rendered one, and
`query` did not exist on `ReadingList` at all. **A value in the union that no
route can reach** — the same defect class as `421bdff1`'s `section: 'lists'`,
found the same way: by asking what actually consumes the value, not whether it
compiles.

`SmartListQuery` therefore lives on the MODEL, beside every other persisted
field, and goes through the same total normalization pass. That pass is lossy in
one direction only: an unrecognised format or state is **dropped from its
array** rather than carried through, because a query is a filter and an unknown
term returns nothing and reads as an empty library. Dropping it widens the
answer, which is visibly wrong instead of invisibly wrong. An array that empties
is removed (`state: []` and no `state` are the same to the evaluator, and only
one survives a round trip); a query with nothing left is `undefined`, because
`{}` matches the whole library.

`summarizeReadingLists` now **excludes** smart lists. A smart list stores a
query and no entries — its normal shape — so a card for one reads "0 of 0
finished" over an empty bar. Safe to narrow: nothing produced one until
`saveSmartReadingList`, so no stored document has one.

Save is offered on a preset with a real query **even when it matches nothing**:
a question is worth keeping before it has an answer, and a control that appeared
and vanished with the row count would move for reasons the user cannot see.

**Evidence.** 36 + 15 + 2 + 2 tests. **24 of 24 scoped mutants RED** across four
files. Every mutation was confined to its target function's own line span with a
disk sentinel and a SHA256 restore — `saveSmartReadingList` sits directly above
`updateReadingList` and shares anchor lines with it, which is the sibling-function
trap exactly. One mutant was **SKIPPED rather than guessed** (`kind: 'smart'`
occurs twice inside its own function) and re-run RED with a unique anchor.

**FULL GATES at `9b9695ff`, tree clean:** `npx vitest run` **EXIT 0 — 1,078 files
passed / 1 skipped; 13,935 tests, 13,929 passed / 6 skipped.** `i18n-check` EXIT 0
at **12,497** keys. `i18n-hardcoded-check` EXIT 0. `architecture-audit` EXIT 0,
"Nothing new", 6 pending. eslint **0 errors** on every touched path.

### 9.4 — 2026-09-04, P5 §5.4 CLOSED. The projected finish date.

`57fdf10b` (pure core) `c23bf067` (the caller on the list header).

**THE RATE SOURCE, settled against the tree.** Four candidates exist and only one
can answer a book-scoped dated question:

- **`ReadingListEntry.finishedAt`** — main-persisted in `reading-lists.json`,
  book-scoped, dated, and *guaranteed present*: `normalizeReadingEntry` repairs a
  `finished` entry with no timestamp back to `owned` (`readingLists.ts:435`), so a
  dateless finish cannot reach the function. **This is the source. Zero new fields.**
- `renderer/stats.ts`'s `days` map — a richer chars/seconds series, **rejected
  twice over**: it is `localStorage` (`jp-study-stats-v1-<lang>`) with no restore
  point, which is trap 1 at the top of this plan, and its only exported reader
  truncates to 14 days.
- `userData/immersion/metrics.json` — durable and unbounded, but counts **web
  pages**. A book read in `NovelReader` contributes nothing, so a book list
  projected from it would *slow down* as the user read more books.
- `readingGardenProgress` — a lifetime page scalar with no day axis.

**A NEW function, not a widening of `readingChallengePace`.** That one measures
the list against a target date the USER SET, on a straight line from `createdAt`,
and returns `null` without one — it reads no history at all. This measures the
rate actually achieved and needs no target. Merging them would make a challenge
list and a pool list disagree about what "pace" means, and the challenge widget
would move when a book on an unrelated list was finished.

**What it refuses to say** is the part that matters. A rate of zero projects to
infinity, so `finishesAt` is `null` — "never" is not a date, and the header
renders no line at all. Under **three** observed finishes it is `provisional` and
the flag travels WITH the number, so a surface cannot print one without the
other; on screen that is a differently-worded sentence *and* italic, because
§5.4's whole risk is that a confident date off two finishes reads exactly like
one off forty. A finished list answers `now`, not `null`, so "already done" and
"we cannot say" stay distinguishable. `abandoned`/`skipped` are out of
`remaining` per §5.9. The rate spans EVERY list and de-duplicates per **work** —
a book finished elsewhere is still an evening spent reading, and §4's fan-out
would otherwise multiply a reader's apparent rate by how tidily they file.

**Evidence.** 10 + 2 tests. **7 of 7 real mutants RED**, plus an inert SENTINEL
mutation that correctly stayed GREEN — so a RED verdict here means the test
noticed the change rather than the file failing to compile. One mutant was GREEN
on the first pass (dropping the `state !== 'finished'` check while keeping
`finishedAt`) and **that gap was closed by its own test rather than reported as
6 of 7**: `setReadingEntryState` deletes `finishedAt` on un-finish, so the shape
is unreachable through the product but reachable by a hand edit.

**Exact next slice: P5's remaining two — next-up and the timeline.**
`nextUpReadingRow` already EXISTS in `readingListViews.ts` and is consumed by
§11.2's widget, so **derive what is actually missing before rebuilding it** — the
plausible gap is §5.3's *"by best-fit difficulty for pools"*, which the current
implementation does not do (it is state-priority then list order). The level
source for that is already settled and shipped: `SmartListRow.level` /
`smartListFactsFromItem` in `readingListSmartLists.ts`, on the L1–L7 tier scale.
The timeline (§5's year-in-review shape) can read `recentReadingFinishes`, which
exists and is already de-duplicated per work.

**TRAP for next-up.** Widening `nextUpReadingRow` changes what §11.2's shipped
widget shows. Either take an explicit option and leave the default alone, or
change both together and re-run `readingListWidgets.test.tsx` — a silent
re-ordering of the "Next up" widget is a behaviour change nobody asked for.

### 9.5 — 2026-09-04, P5 §5.3 CLOSED. Next up, by best-fit difficulty for pools.

`a510e4f9` (pure core) `97b8610c` (the Next up button on the list detail).

**WHAT WAS ACTUALLY MISSING, derived before rebuilding.** `nextUpReadingRow` has
existed since P4 and §11.2's widget ships it. Its gap against §5.3 was exactly the
half the previous turn predicted: it did state-priority (`reading` → `owned` →
`wanted`) then list order, and had no notion of difficulty at all. Nothing was
rewritten; the ranking was added INSIDE the winning state band.

**Scoped to `pool`, and to nothing else.** A pool is explicitly unordered — the
user dropped twenty books in a bag and the app is supposed to hand back the one
to read now. For every other kind the arrangement IS the answer: `ordered` is the
user's sequence, `tiered` already sorts by tier, `challenge` is a set with a date.
Four kinds are asserted unchanged.

**The rank, four components in order.** Measured before unmeasured; distance from
the reader's tier; **easier wins an exact tie** (a book one tier below is always
readable, one above may simply not be, and when the app chooses on the user's
behalf it takes the readable one); then list order, which `sort` preserves. An
unmeasured work is never PREFERRED and never EXCLUDED — §7's `difficultyMax` call,
for the same reason: excluding it makes a fresh import invisible for as long as
enrichment takes.

**The widget trap was taken by the first branch.** Both inputs are OPTIONAL and
the default is byte-for-byte the shipped behaviour, so a caller opts in by having
the levels to opt in with. `readingListWidgets.test.tsx` + the view + a11y suites
= **109 passed, unchanged**.

**No new scale, no new field.** The tier is `getUserLevel()` — the same reader the
Reading Finder builds its level band from — and the per-work level is
`effectiveLevelEstimate` over the bound library items, the one L1–L7 scale §7's
`difficultyMax` already rides. `getUserLevel` is guarded: a throw would take the
whole list detail down for one button, and falling back to `null` turns the fit
off and leaves list order.

**The button routes through `openRow`**, the same handler a row click uses, so the
queue inherits §11.1 whole — bound to the reader, `owned` promoted to `reading`,
unbound `wanted` to acquisition. A second navigation path here would be a second
answer to "where does a book open". The title is IN the label: a button that opens
a reader without saying which book is one the user must press to find out.

**Evidence.** 4 + 5 tests. **7/7 core mutants RED and 4/4 caller mutants RED**,
each with an inert SENTINEL that correctly stayed GREEN. The caller mutants are
the ones that matter: a pure core fed an empty map ranks nothing, passes every
unit test, and ships a button that silently offers the first row forever.

### 9.6 — 2026-09-04, P5 §5.12 CLOSED. The timeline. **P5 IS 5 OF 5.**

`67a15812` (pure core) `48bad532` (the panel, mounted twice).

**IT READS THE ENTRIES, NOT THE EVENT LOG — deliberately against §5.12's own
wording.** §5.12 says "straight from the event log". The log is capped and
compacted, so a year-in-review built on it silently loses the START of the year,
which is precisely the half a year view exists to show, and it would lose it
without saying so. `finishedAt` is on the entry, `normalizeReadingEntry` repairs a
dateless finish back to `owned`, and entries are never compacted.
`recentReadingFinishes` made the same call for the same reason.

**Fan-out counts once, at the EARLIEST tick.** §4 ticks the same book on every
list it is on; unscoped, a book on three lists would paint three squares and the
year total would read three books for one read. The later timestamps are the
fan-out, not a second reading.

**The zone is an argument, not a `Date` call inside the core.** `offsetMinutes` is
minutes to ADD to UTC, which is `-new Date().getTimezoneOffset()` at the call
site. A calendar computed with local getters inside a pure function gives one
answer on a CI box and another on the user's machine.

**Empty days are `<span>`s, not buttons.** A year is 365 cells and all but a
handful are empty; making them focusable puts 365 tab stops between the year
picker and the next control, which is §11.4's keyboard row failing on this panel
alone. A live day is a real button that says its date and its count.

**Honest states, all three.** `elsewhere` is reported, so a panel showing 3 books
does not hide the other 40. The current year is offered in the picker even when
empty, so "nothing yet this year" is answerable. Nothing-ever-finished is a
sentence saying what would fill it, and a `null` document renders nothing at all
because loading belongs to the host.

**Evidence. 12 + 8 tests. 12/12 core mutants RED, 11/11 panel mutants RED**, each
with an inert SENTINEL that stayed GREEN. **TWO panel mutants were GREEN on the
first pass and both were real gaps, not rounding:**

1. **A dropped `offsetMinutes` scored GREEN.** Every fixture was mid-day UTC — by
   design, so the suite would be zone-independent — and a mid-day fixture *cannot
   see* the zone. The fix stubs `getTimezoneOffset` at −540 and +300 and asserts
   the same instant lands on two different days. Writing it against the real clock
   would pass vacuously on a UTC build box.
2. **A `listId` that never reached the core scored GREEN.** The scoping test read
   only the per-row list-name chip, which is driven by the PROP. A panel that
   passed `listId` to the label and `null` to `readingTimeline` hid the chip and
   still drew the other list's day. Fixed by adding a second list on a second day
   and asserting the grid, not the chip.

**Mounted twice, one implementation** — unscoped under the grid ("what did I read
this year") and scoped on the list detail ("per list") — so the two can never
disagree about what counts as a finish.

**Exact next slice: §11.1 row 8's `MangaReader` wiring, the moment that path goes
clean in the MAIN tree.** Checked again this turn (17:47): still ` M` from another
track, six turns running. One import plus
`<ReadingListMembership itemId={item.id} />` beside the title, exactly as
`NovelReader.tsx:2986`. The path is `src/renderer/views/MangaReader.tsx` —
`components/MangaReader.tsx` does not exist and checking it exits 0 with silence.
Editing it here blocks `relay-mergeback` until that path goes clean. After that,
P5 has nothing open and the track's remaining surface is §11.3 reminders and
§11.4's residual rows.

### 9.7 — 2026-09-04, §11.1's "Back works" row CLOSED.

`1bee620b`.

**What it is.** §11.1: *"Opening a book from a list and coming back returns to the
list at the same scroll position and selection."* Both halves, keyed BY LIST in a
module-level `Map` in `ReadingListsView.tsx`.

**Module-level, and NOT persisted.** Opening a book navigates the app away and
UNMOUNTS the view, so component state is gone by the time the user returns — a
`useRef` would remember nothing across the only journey the rule is about. And a
scroll offset is a session affordance, not a setting: `localStorage` would add a
key with no restore point (trap 1) to remember where someone was three days ago,
and a stale offset restored into a list that has since changed length is worse
than starting at the top.

**A REAL DEFECT, found by the test rather than reasoned about.** Grid and detail
are both a `div.rlv`, so React reconciles them to the SAME host node and the
browser keeps its scroll offset across the switch. Measured: list A left at 300 →
grid → open list B, and B opened at **300**. The restore therefore writes
UNCONDITIONALLY, including the 0.

**Three timing traps, all paid for here:**

1. **`detailRef.current` is null in a passive cleanup on unmount** — React has
   already detached the ref. It is also null on the way IN, because the first
   render of a visit is the loading state. So the scroll is recorded by the
   container's own `onScroll` as it happens; only the selection is captured in a
   cleanup, and that needs no DOM.
2. **An effect keyed on `listId` alone runs before the document exists.** The
   store loads after mount, so the selection restore found no list, returned, and
   never got a second chance. It depends on `document` now, with a
   once-per-arrival ref guard — without that guard it re-selects on every store
   broadcast and a row the user deselected comes back, which reads as a haunted
   UI. That guard has its own test, driving a real broadcast through
   `onReadingListsChanged`.
3. **jsdom performs no layout**, so a real `scrollTop` write is clamped to 0 and
   an assertion on it passes whether the feature works or not. The suite gives
   `HTMLElement.prototype.scrollTop` a backing property for its duration, and
   restores it.

**This does NOT undo the existing clear-on-navigate effect** and must not be read
as doing so. What is remembered is keyed by list, so leaving A for B still arrives
at B with B's own state and the bulk bar can never hold a row from a list that is
not on screen. Asserted in both directions.

**Evidence. 6 tests. 9 of 10 mutants RED**, plus an inert SENTINEL that stayed
GREEN. **The tenth is GREEN and is recorded as knowingly unfalsifiable rather than
counted as 10 of 10:** deleting the dead-id filter changes nothing observable,
because `selectedIds` already derives the actionable list through `rows` and the
select-all checkbox reads `selected.has` over `visibleRows`. The line is kept as
defence in depth and says so at the call site, so the next worker does not spend a
run trying to make it fail.

**§11.1's last open row is now the pop-out** — *"Middle-click / Ctrl-click opens
in a pop-out (`AppSection popout`, `App.tsx:799`)"*. **PARKED, and not for want of
a design:** it needs a callback threaded through `src/renderer/App.tsx`, which is
` M` in the MAIN tree from another track (checked 17:58). Editing it here blocks
`relay-mergeback` until that path goes clean — the same reason `MangaReader.tsx`
is parked. `ReadingListsView.tsx` itself is CLEAN in the main tree, which is why
this slice was safe to take.

### 9.8 — 2026-09-04, §11.1 is 8 OF 8. Row 8 reaches manga; the pop-out row closes.

`c286c410`, `fb154aa2`. **§11.1 has no open row left.**

**`c286c410` — row 8 in the MANGA reader, recovered from `codexB`.** Its 18:56 run
died on a usage limit at 19:05 with the slice uncommitted; finished here rather
than discarded. `MangaReader.tsx` gets the same read-only
`<ReadingListMembership itemId>` `NovelReader` already carried — §10.2 keeps the
logic out of the 87 KB file. Two fixes were needed before any evidence existed:
the harness's KNOWN ISSUE ("stalls silently, #root stays empty, no console
error") was **static imports** evaluating the ~120-module graph before
`window.api` was assigned — both are dynamic now, awaited after the assignment;
and `manga-reader-harness.html` had never been written, so Vite had nothing to
serve the URL the harness header has always named. **LIVE:** `?lists=2` → banner
reads "On 2 lists" with buttons `Manga club 1` / `Manga club 2`; `?lists=0` →
the strip is absent, title straight to `1 / 12`. The inherited test asserted
`'On 1 list(s)'`, the raw plural KEY rather than the rendered `one` arm.

**`fb154aa2` — the pop-out row, which 9.7 parked as needing `App.tsx`. It does
not.** `window.api.popOut(section)` is a renderer-level seam with 19 call sites;
neither `App.tsx` nor `preload.ts` is touched.

**Scope decision, because the row does not state it:** the app pops out
SECTIONS, not books, so the gesture belongs to a list CARD and opens Reading
routed to that list. A per-book window would be the second navigation model
§11.1's first bullet forbids.

**The route travels through `localStorage`, and trap 1 does not forbid it.**
Trap 1 is about list DATA and a profile reset with no restore point. This is one
navigation intent with a 60 s TTL whose loss costs a pop-out that opens on the
grid. A pop-out is a separate process, so `pendingRoutes` cannot reach it, and
main's route would need `preload.ts` (` M`, eight turns). Wire format is the
existing `reading://workspace/...` link, so the receiver validates it like any
untrusted route.

**Both delivery halves ship, because each is dead alone:** the mount claim
serves the cold open; a `storage` subscription serves every later gesture,
because `popOut` FOCUSES rather than remounts. Claiming is gated on
`isPopoutWindow()` — without it the desktop eats its own hand-off and one
Ctrl-click moves two windows.

**LIVE, and it is the half jsdom cannot prove:** two Chromium documents on the
Vite origin — B staged, A received exactly ONE `storage` event carrying it, then
claimed `{section:'lists', listId:'live-list-1'}`; the second claim returned
null with the key gone. **12 tests, 8 of 8 mutants RED.**

**Exact next slice: §11.2's four widgets, or §11.3's reminders** — §11.4's rows
are the other P4 gate. `App.tsx` and `preload.ts` are still ` M`; §11.2 registers
in `widgets/registry.ts` and §11.3 in `main/buddyScheduler.ts`, so neither needs
them. **The trap this turn refutes:** "parked on a foreign dirty path" is worth
re-deriving before it is inherited — row 8 and the pop-out row were both parked
on files that turned out not to be required.

### 9.1 SUPERSEDED — the slice below was row 8, and it is closed above

Kept only so the entry above has its subject.

**Exact next slice: §11.1's LAST row, row 8** — *the "on 2 lists" line in the
reader*. Trap §10.2 forbids list LOGIC in `NovelReader.tsx` (130 KB) and
`MangaReader.tsx` (87 KB), so this is a READ-ONLY touch-point: a small component
fed by a pure `readingListsForItem(document, itemId)` next to
`readingWorksByAuthor` in `readingListViews.ts`, rendered by the readers and
routing through the same `onOpenBook`/list-detail seams row 6's panel uses.
Both reader files were clean in the main tree as of 2026-09-04 12:05, so the
edit is conflict-safe; re-check before starting. Then P5.

### 9.2 FORK — RESOLVED 2026-09-04 by `primary`. Do not re-derive it.

**The integration merge is on `feat/nyaa-subtitles`.** `wt/files-app` merged in whole, the
disposition table below applied exactly, four gates green after. P0–P3 are now all on one
branch: **4 of 6 phases.**

What the merge actually cost, so the next fork is priced honestly:

- Two real conflicts, both predicted: `main/library.ts` and this file. `library.ts` kept
  HEAD's `onLibraryItemsAdded` seam and took `wt`'s `noteReadingProgress` + the
  `library:setProgress` capture; `notifyLibraryItemsAdded`/`bindReadingListsToItems` were
  deleted with the binder.
- `shared/readingListMutations.ts` auto-merged and the dedup fix landed intact — verified,
  not assumed: reverting the document-scope work reuse turns `readingFinishWatcher.test.ts`
  **2 RED by name** (the cross-list tick and the abandoned-list case), restored
  byte-identical after.
- **One thing the table did not foresee:** `main/__tests__/readingFinishWatcher.test.ts`
  imported the dropped binder, so it was ported onto `bindLibraryItemsIntoReadingLists`.
  That is a *better* test than it was — P3's fan-out is now proven through P2's real
  matcher rather than through a hand-written `boundItemIds`, so a threshold change that
  stopped binding fails here too.
- **`readingListMatch.ts` never became an orphan** — it was `git rm`'d during the merge, so
  the audit had nothing to catch. `architecture-audit.cjs`: "Nothing new", 7 pending.

Gates after the merge: **15 reading-list suites, 268 tests, all green**;
`i18n-check.cjs` EXIT 0 (12,297 keys); `i18n-hardcoded-check.cjs` clean for the new files;
`architecture-audit.cjs` EXIT 0.

The record of the fork itself, kept because the shape recurs:

`backup` (main tree) and `primary2` (`wt/files-app`) both implemented P2 between 00:30 and
00:56 on 2026-09-04, neither aware of the other. Nothing else duplicates: **P3 and P1's
§2.5 preview exist only on `wt/files-app`; P2's unbind/suggest band exists only here.**

The resolution is mechanical, because **`wt`'s P3 does not import a matcher.**
`readingFinishWatcher.ts` takes `createReadingListsMutationContext`,
`finishReadingWorkEverywhere`, `sealReadingListsDocument` and `workForItem` — all four are
in the common ancestor `dc5c345a`/P1b. So P3 ports onto either P2 unchanged.

**Keep this branch's P2, take everything else from `wt`:**

| From `wt/files-app` | Disposition |
|---|---|
| `6ff47c06`, `a4c5d6e8` §2.5 paste preview; `9d603e58` parser mutation tests | TAKE — P1's last open clause is in `9d603e58`; delete §9.1's "still owes" line when it lands |
| `1479861e` P3 detector + watcher, **and its cross-document work-dedup fix in `applyReadingListImport`** | TAKE — the dedup is a real defect on both sides: one book on two lists minted two works, so a finish ticked one list and not the other |
| `shared/readingListMatch.ts`, `main/readingListsBinder.ts` and their two suites; `bindReadingWorkToItem`; the direct `writeDb` hook in `library.ts` | DROP — superseded. This branch's mutation layer is a superset (7 exports vs 1) and the `onLibraryItemsAdded` seam is the more general hook |

Conflicts to expect: `shared/readingListMutations.ts` and `main/library.ts`, both real.
`readingListMatch.ts` will merge **without** a conflict and leave two matchers standing —
the architecture audit catches it as an orphan, but only if nobody baselines it away.

**Exact next slice: P4 — §6 surfaces plus §11 in full.** The merge above HAS landed, so the
"do not start P4 on either branch alone" bar is met: `feat/nyaa-subtitles` now carries P1's
preview and P2's suggest band together. §11 is a gate, not polish.

**And `wt/files-app` must not fork again.** files-app is 37/37 and reading-lists is now
whole on the main branch, so there is nothing left that needs a second tree. Build P4 on
`feat/nyaa-subtitles` only.

---

## 10. Traps, stated up front

1. **Do not persist in `localStorage`.** Reading Garden does, and that data has no restore
   point in userData backups. Main-process JSON, or a profile reset eats every list.
2. **Do not put list logic in `NovelReader.tsx` / `MangaReader.tsx`.** They are 130 KB and
   87 KB, shared by other tracks, and a merge conflict there is expensive. The detector goes
   in main, on `library:setProgress`.
3. **Do not extend `collections: string[]`.** It cannot carry per-entry state or an entry
   for an unowned book. Import from it once, then leave it alone.
4. **Titles are not identity.** Bind on the work record. Two files, one work; one title
   string, two works.
5. **A parser test that asserts a title "appears in the output" is not a test.** Assert the
   exact entry count and each field, and mutate every rule to prove the test fails.
6. **The dwell requirement is the whole completion design.** An implementation that ticks on
   `percent >= 0.98` alone will mark half the library finished the first time someone drags
   a scrollbar. Ship the negative control test with it.
7. **The i18n module must be imported by an existing catalog** or 485 keys resolve to
   nothing while every key-count check passes.
8. **The shared tree carries ~358 dirty paths owned by concurrent tracks.** Path-scoped
   commits only. Never `git add -A`, never `git stash` in this repo.

---

## 11. Interaction quality — the part that is "a given"

Added 2026-09-03 on the user's follow-up: *"make sure the implementation is actually good ie
u can click on each list name and it takes u to the book, widgets for the list, reminders
ect, this should be a given though."*

It is a given, and it is written down anyway, because "obvious" is exactly what gets skipped
under a deadline. **A phase is not done until its rows in this section are true.** All three
of these ride on seams that already exist — none of it is new infrastructure.

### 11.1 Everything is a link, and every link lands somewhere real

| You click | You get |
|---|---|
| an entry with a bound item | the **reader**, opened at the saved position — `onOpenBook(item)`, `App.tsx:862` |
| an entry, bound, never started | the reader at the start, and the entry flips `owned → reading` |
| an entry that is `wanted` (no file) | the acquisition path — Reading Finder / scraper prefilled with the title, **not** a dead card |
| an entry's cover | the library item detail |
| a list card | list detail |
| an author name | that author's other works, owned and wanted |
| a source-message chip | the original paste, with the producing line highlighted |
| the "on 2 lists" line in the reader | the list detail, scrolled to this entry |

Rules that make those honest:

- **Use the existing seam.** `onOpenBook: (item: LibraryItem) => void` is threaded through
  `App.tsx` (712, 770, 799, 820, 905) and `DesktopShell`. Do not invent a second navigation
  path; a list rendered inside a widget must open books through the same call the library
  uses, or the two disagree about which window the reader is in.
- **No dead ends.** A `wanted` entry is the one that tempts a stub. It must lead somewhere
  useful on click, and if nothing can be offered, it must say what it needs — never a card
  that swallows the click.
- **Back works.** Opening a book from a list and coming back returns to the list at the same
  scroll position and selection.
- **Middle-click / Ctrl-click opens in a pop-out** wherever the app already supports it
  (`AppSection popout`, `App.tsx:799`).

### 11.2 Widgets — register in the existing gallery, do not build a parallel one

The desktop already has a widget system: `src/renderer/widgets/registry.ts` (`WIDGETS`,
`getWidgetDef`), categories in `widgets/types.ts`, `WidgetFrame.tsx`, `WidgetGallery.tsx`,
snapshots in `shared/desktop.ts`, and `MusicWidget.tsx` as the worked example to copy.
Widgets carry `titleKey` / `descKey`, so they are i18n'd by construction.

Ship **four**, registered like any other widget so they appear in the gallery, can be
pinned, resized, hidden and restored with everything else:

1. **List progress** — one list: mosaic cover, `7 / 20 finished`, a progress bar, and the
   next-up title. Click the title → opens the book. Click the header → list detail. This is
   the default widget and the one most people will keep.
2. **Next up** — a single cover, the title, and a Read button. The whole widget is the
   click target. Deliberately dumb; it is a "start reading" button with a picture.
3. **Challenge / pace** — for `challenge` lists: books remaining, days remaining, and one
   honest sentence: *"3 books in 24 days — you are 1 ahead."* Ahead and behind are both
   stated plainly; do not render "behind" as a red alarm.
4. **Recently finished** — the last N finishes with dates. Doubles as the year-in-review
   surface and reads straight from the event log.

Widget rules: each picks its list in its own settings (follow `musicWidgetSettings.ts`);
each renders a real empty state before any list exists (an invitation to paste one, not a
blank box); each survives its list being deleted without throwing.

### 11.3 Reminders — main-process, opt-in, and quiet

Reuse the existing pattern, do not write renderer timers: `src/main/buddyScheduler.ts` is a
single main-process time-of-day scheduler that takes a pushed schedule and fires each entry
once per day-window, and `localAgentScheduler.ts` is the second precedent. A renderer
`setTimeout` dies with the window and fires nothing.

Reminder kinds, **all off by default**, each individually switchable:

- **Daily read** — one nudge at a chosen time, only if nothing was read today. Silent on days
  you already read; that is the entire point.
- **Challenge pace** — for a `challenge` list with a target date, one nudge when the required
  rate rises above your measured rate. Fires at most **once a week**.
- **Stalled book** — a book at ≥10 % untouched for N days (default 14): *"still reading X?"*
  with three buttons — Continue / Mark finished / Move to abandoned. This is the same signal
  as §4.2's soft finish, surfaced once, not twice.
- **New binding** — when a `wanted` entry auto-binds because a file landed (§3.1). This one
  earns an interrupt: it is news, and it is the moment the feature proves itself.

Hard rules: **at most one reminder per day across all kinds**; every reminder is dismissible
forever from the notification itself, not buried in settings; "remind me" state lives in
main with the lists, so it survives a renderer reload; and nothing fires on first run — a
feature that nags before it has been used once will be turned off and never turned back on.

### 11.4 The rest of "actually good"

These are pass/fail rows on P4, not aspirations:

- **Keyboard.** Full traversal of a list without a mouse; `Enter` opens, `Space` toggles
  finished, `/` focuses filter, `Del` removes with undo. The paste dialog is operable
  end-to-end from the keyboard.
- **Undo, everywhere.** Every destructive action — remove entry, delete list, apply a
  re-parse, bulk-mark-finished — leaves an undo toast. The event log (§1) already makes this
  cheap; not offering it would be the strange choice.
- **Drag and drop.** Reorder within an ordered list; drag an entry between lists; drop a
  library item onto a list; drop a `.txt` onto the lists view to import it.
- **Bulk selection.** Shift-click ranges, then mark finished / move / remove in one action.
  A 40-entry list is unusable one row at a time.
- **Real empty states.** No list yet → the paste box itself, with the §2.1 example shown as
  a hint. Empty list → "paste a message or add from your library". Never a bare "No items".
- **Loading and error states.** Skeleton rows while the store loads; a corrupt store shows
  what happened and offers last-good recovery (§1), it does not silently show zero lists.
- **Accessibility.** Real `<button>`s, list semantics, labelled controls, visible focus, and
  progress announced as text (`7 of 20 finished`) rather than colour alone.
- **Performance.** A 500-entry list scrolls without jank; the list view must not re-render
  every row when one entry's state changes.
- **Density.** Comfortable and compact modes — a 20-book list and a 300-book list are not
  the same UI problem.
