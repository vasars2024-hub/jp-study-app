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
- **A mutation test per parser rule — STILL OPEN.** The three landed this turn
  (URL-before-split, the §4.4 abandoned guard, the CAS retry) are per-defect, not
  per-rule. This clause is what P1 still owes.

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
