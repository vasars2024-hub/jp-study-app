# GrammarX Redesign Plan

Living document. Phases 1, 1.5, 2 and 3 are implemented. Phase 4 (Notebook) is
next and is specified, not built.

**Phases 1.5 and 2 have now been driven live (2026-07-19) and the screens work.**
The browser harness §7 refers to still cannot render this app — the renderer
boots by awaiting `window.api` from the Electron preload bridge, so under plain
Vite React mounts and `#root` stays empty *with no console error*. That silence
remains absence of evidence, not evidence of absence. **Use `npm start`
(electron-forge) plus computer-use instead**; the dev app runs as `electron.exe`
out of `node_modules/electron/dist`, which is the name computer-use must be
granted (the packaged "Nihongo Study" grant does not cover it).

Verified live: Explorer renders 1,893 deduped points with working detail pane
and Tatoeba examples; filters show live per-category counts, the HSK10 footnote
and the verified-tags default; selection survives filtering and reports
`3 selected (3 hidden by filters)` with the drawer flagging each hidden row;
category counts recompute against active filters (Time & sequence 168 → 39
under N1); the Review queue renders four queues with `0 of 1,893 entries
verified by a human`; presets save, reset and reload correctly. See §7.1 for
the defects this pass did find.

A recurring lesson, now bitten three times: **numbers in this document are only
as good as the query behind them.** §2.2 counted a populated non-answer as an
answer; §6's "220 duplicate groups" measured a corpus the user never sees. Rerun
`node tools/grammar-audit.cjs` and check *what* it counts before quoting it.
Every number here comes from `node tools/grammar-audit.cjs`, which is rerunnable
and writes a machine-readable `grammar-audit.json` beside the console summary.

---

## 1. What was actually wrong

The Grammar screen had the requested controls. They were wired to data that
could not support them.

### 1.1 Register and function tags were guessed from the English gloss

`normalize.ts` back-filled any missing `functions`/`register` by running regexes
over the **English meaning text**. `inferRegisterFromMeaning` returned
`'business'` whenever the gloss matched `/business|formal|office/`, so an entry
glossed *"a less formal way to say X"* was tagged **business**. That is the bad
Business match in the screenshots — not a layout problem.

`inferFunctionsFromMeaning` matched 32 patterns, capped at 3 hits, and fell back
to `['other']`.

### 1.2 The Mazii import had the same guesses frozen into it

The four `*-mazii.ts` files *do* carry `functions` and `register` fields, which
makes their records indistinguishable from authored data by inspection. The
distribution gives it away:

- 288 of 627 `n3-mazii` records are tagged `['other']` and nothing else
- 1,814 of 1,820 Mazii records are `register: 'neutral'` — **4** are business

Provenance is recoverable only at *module* level, which is how Phase 1 fixes it.

### 1.3 Over half the filter column could never match

185 declared function ids; **96 matched zero records**. The UI rendered all 185
as a flat, unsorted checkbox list with machine-translated labels — "How to say
the first", "Levels are few", "Much less volume", "Innocent", "Transfer the
story".

### 1.4 The tests were green throughout

`grammarCorpus.test.ts` asserted `functions.length > 0`. The fallback `['other']`
satisfies it. The suite passed for the entire period the filters were unusable.

### 1.5 Practice was unreachable in the Aero theme

`GrammarView.tsx:115` early-returned `<AeroGrammarExplorer />` before the mode
switch, and that explorer has no practice mode. The `grammar:open-practice`
deep link (fired by `extensionBridgeUi.ts`) set state on a component that then
never rendered — the extension's "practise this" action silently did nothing.

---

## 2. Corpus audit — before and after

`tools/grammar-audit.cjs`. Baseline captured before any change
(`grammar-audit.baseline.json`), current state in `grammar-audit.json`.

### 2.1 Size by level — unchanged by Phase 1 (no content was added or removed)

| Japanese | count | | Chinese | count |
|---|---|---|---|---|
| N5 | 50 | | HSK1 | 12 |
| N4 | 480 | | HSK2 | 10 |
| N3 | 675 | | HSK3 | 10 |
| N2 | 531 | | HSK4 | 8 |
| N1 | 409 | | HSK5 | 8 |
| **total** | **2,145** | | HSK6 | 8 |
| | | | HSK7 | 6 |
| | | | HSK8 | 6 |
| | | | HSK9 | 6 |
| | | | HSK10 | 8 |
| | | | **total** | **82** |

**82 Chinese grammar points is not HSK 1–10 coverage.** Nothing in the app may
claim otherwise. See §5.

### 2.2 Content completeness

| Field | Absent | % |
|---|---|---|
| meaning | 0 | 0% |
| structure | 0 | 0% |
| explanation | 0 | 0% |
| **examples** | **1,820** | **81.7%** |
| source/provenance (before) | 2,227 | 100% |

**Those three zeroes are misleading, and the first version of this audit
repeated them uncritically.** Field presence is not field content:

| | Count | % |
|---|---|---|
| `structure` is a verbatim copy of `title` | 1,822 | 81.8% |
| `explanation` is a verbatim copy of `meaning` | 1,820 | 81.7% |
| **both — the record is a pattern plus a gloss and nothing else** | **1,820** | **81.7%** |

In the core 325, neither duplication occurs even once — average explanation
length 88 characters against Mazii's 30, and 596 Mazii explanations are under
20 characters.

So a Mazii record carries exactly two pieces of information: the pattern and an
English gloss. `structure`, `explanation` and `examples` are padding. Counting
those fields as "0% missing" was the same failure as counting `['other']` as a
category — a populated non-answer scored as an answer. The audit now measures
duplication explicitly.

**Consequence for the recategorization plan:** these 1,820 records cannot be
classified from their content, because they have none beyond the gloss the
deleted regex tagger already consumed. Hand-classifying them would mean reading
the same English string the regex read and reproducing its errors more slowly.
They are a **pattern index** — useful for "does this pattern exist, and at what
level" — not study material. Improving them is content acquisition, not
recategorization, and it is a different project from Phase 1.5.

### 2.3 Taxonomy

| | Before | After |
|---|---|---|
| Legacy ids declared | 185 | 185 (retained as aliases) |
| Legacy ids matching ≥1 record | 89 | 88 |
| Canonical categories declared | — | 82 in 24 groups |
| Canonical categories populated | — | 66 |
| Records tagged `other` only | 987 (44.3%) | — |
| Records with no category | 0 (falsely) | 1,177 (52.9%, honestly) |

The uncategorized count *rose* because `other` no longer resolves to a category.
That is the correction: 1,177 records genuinely have no usable function tag, and
the previous 0 was an artifact of laundering a non-answer into data.

#### Categories per point — the corpus is under-classified

| Categories | Points | % |
|---|---|---|
| 0 | 1,177 | 52.9% |
| 1 | 714 | 32.1% |
| 2 | 261 | 11.7% |
| 3 | 75 | 3.4% |

Average among tagged records: **1.39**.

Grammar function is not a partition. 〜ば〜ほど is proportion *and* condition;
〜ても is concession *and* condition. A corpus where most tagged records carry
exactly one category is under-classified, not cleanly classified.

The schema supports many-to-many (`categories: string[]`), and the alias table
deliberately fans several legacy ids out to multiple canonical categories
(`location-method-cause` → location + means + reason). The limit is the source
data: 1,563 records carry exactly one legacy tag, and **no record carries more
than three** — because the deleted gloss-regex tagger stopped at three hits
(`if (hits.length >= 3) break;`) and its output was frozen into the Mazii files.

That ceiling is a fingerprint of the guessing pipeline, not a property of the
language, and **no remapping can lift it** — a mapping table can only
redistribute what the source already claimed. Genuine multi-category coverage
requires the Phase 1.5 authoring pass. The audit now reports this distribution
and flags the cap.

### 2.4 Register — the headline fix

| Register | Tagged before | Tagged after | **Answerable after** |
|---|---|---|---|
| neutral | 2,184 | 2,155 | — |
| business | 17 | 26 | **23** |
| casual | 10 | 17 | **16** |
| literary | 16 | 29 | **28** |

*Answerable* = records whose register was authored or derived from the pattern's
own morphology, and which therefore appear under `verifiedTagsOnly` (the
default). Verified live in the browser: **Formal returns 22 records after
dedupe — 11 Japanese honorific/humble patterns and 11 formal-written Chinese.**
Every one is genuinely formal. Switching off "Verified tags only" reveals the
4 remaining gloss-guessed claims rather than hiding them.

### 2.5 Provenance

| tagSource | count | % |
|---|---|---|
| heuristic | 2,145 | 96.3% |
| authored | 82 | 3.7% |

| verification | count | % |
|---|---|---|
| missing (no examples) | 1,820 | 81.7% |
| partial | 407 | 18.3% |
| verified | 0 | 0% |

Nothing in this corpus is verified yet. The UI must not imply otherwise.

### 2.6 The authored and scraped sources overlap heavily — and the dedupe missed it

`dedupeGrammarByTitle` keyed on `title.replace(/\s+/g, '')`. The two Japanese
sources write the same pattern differently — authored files use `〜前に`, the
Mazii dump uses `... 前に` — so that key matched **zero** cross-source pairs:

| Matching method | Mazii rows hitting an authored title | Authored points covered |
|---|---|---|
| exact | 0 | 0 / 325 |
| whitespace-insensitive (what shipped) | 0 | 0 / 325 |
| + strip `〜 ～ . ． … ・` placeholders | **189** | **159 / 325 (49%)** |

So roughly half the authored corpus was **also present as a hollow duplicate**,
and both rows were shown. A user searching 前に saw two entries: one with
examples and a real explanation, one with the gloss repeated three times.

Verified safe: the added normalization causes **0** collisions among the 325
authored titles and leaves no record with an empty key.

**Fixed in Phase 1.** `grammarTitleKey()` normalizes notation;
`dedupeGrammarByTitle` now picks the survivor by `contentRank` rather than by
order — necessary because `index.ts` emits `N4_MAZII` before `N3`, so a hollow
N4 copy can precede its authored N3 twin.

| | Before | After |
|---|---|---|
| Rows after dedupe | 2,164 | **1,919** |
| Duplicate rows removed | 63 | **308** |
| Rows with examples | 407 | 407 |
| Rows without examples | 1,757 (81.2%) | 1,512 (78.8%) |

**Level conflicts are preserved, not resolved.** 53 of the 189 pairs disagree on
level — 〜前に is N5 authored and N4 in Mazii; likewise 〜から〜まで, 〜ている,
〜あとで, 〜ながら. Merging now records the loser's level on `alternateLevels`
(109 records carry one) instead of silently adopting one source's claim. The UI
can surface "also listed as N4"; deciding which is correct is curation work.

Still outstanding after Phase 1: 220 near-duplicate groups by fuzzy title (this
fix handles exact-after-normalization only) and 98 groups spanning levels.

**Both were closed in Phase 1.5, and both numbers turned out to be artifacts of
how this document measured them** — see §6. The 220 counts the raw corpus under
the audit script's own normalization, not the shipped key; the real post-dedupe
backlog was 26, all mechanical. The 98 are a systematic one-band offset between
the two sources rather than 98 disputes. `grammar-audit.cjs` now reports the
raw and post-dedupe figures as separate lines so this cannot recur.

---

## 3. Architecture after Phase 1

```
data/grammar/
  types.ts           GrammarProvenance, framework/level split, verification
  taxonomy.ts        82 canonical categories in 24 groups + 185 legacy aliases
  functions.ts       legacy ids + labels, kept as SEARCHABLE ALIASES only
  normalize.ts       per-module provenance; morphology-derived register
  practiceFilters.ts pure query layer (filter / count / categoryCounts / sort)
  index.ts           attaches ModuleProvenance per source module
```

### Decisions worth keeping

**Provenance is a module fact.** Individual Mazii records cannot be told from
authored ones, but their origin module can. `index.ts` attaches
`ModuleProvenance` per import, which is the whole basis for the trust model.

**Register and category provenance are tracked separately.** They were briefly
collapsed into one weakest-link field; that made every Japanese record whose
register was derived from 敬語 morphology fail the verified gate, because its
*categories* were still Mazii guesses. Formal then returned Chinese records
exclusively. `registerSource` and `categorySource` are independent; `tagSource`
is a display-only summary and must never gate a filter.

**Unverified values are preserved and flagged, never erased.** Overwriting an
untrusted register with `neutral` discards source data *and* makes the
"Verified tags only" toggle a no-op, since switching it off would reveal
nothing.

**Derivation rules are under-inclusive on purpose.** A rule that also matches an
ordinary verb (`〜ぬ` matching 死ぬ, `〜たる` matching 当たる) is worse than no
rule, because a wrong tag is indistinguishable downstream from a right one.

**One predicate for counting and listing.** `matchesFilters` backs
`filterGrammarPoints`, `countMatching`, and `categoryCounts`. Verified in the
browser: a category chip reading `4` yields exactly 4 rows.

**Category counts respect the other active filters.** Showing a global total
next to a filtered list produces chips that promise results a click cannot
deliver.

**Taxonomy labels are four per-language records**, not one shared object spread
into all four catalogs. The shared-object pattern (`GAME_ARENA_CHROME`) leaves
105 `games.*` keys as English in ja/zh/ru while `tools/i18n-check.cjs` reports
them fully translated, because that script compares key *presence* only.

---

## 4. Migrations

| Store | Change | Strategy |
|---|---|---|
| `jp-grammarx-practice-filters-v1` | → `-v2` | Read once, map forward, **v1 key left in place**. Legacy `functions[]` → canonical categories via the alias table; `business`/`casual` booleans → `registers[]`. |

`verifiedTagsOnly` is migrated to **off** for users who had a register filter
saved, and **on** for everyone else. A returning user's saved Business filter
was matching heuristic tags; silently shrinking their result set would look like
data loss. They opt in instead.

No user content is touched. Nothing is deleted.

---

## 5. HSK framework honesty

`types.ts` already conceded in a comment that HSK10 is invented
(*"HSK 1–9 official bands + HSK10 advanced/beyond-9 catch-all"*). The UI did not.

Now modelled explicitly:

- `GrammarFramework = 'jlpt' | 'hsk3.0' | 'grammarx'`
- `frameworkForLevel('HSK10') === 'grammarx'`; `isUnofficialLevel('HSK10')` is true
- The level filter footnotes it: *"HSK10 is a GrammarX progression step, not an official band."*
- `sourceLevel`, `normalizedLevel` and `mappingConfidence` are on every record so
  an import may disagree with us without corrupting the data

**To verify before any HSK import:** which framework the source uses. HSK 3.0 is
widely described as publishing bands 1–6 plus a combined 7–9. That should be
confirmed against the official standard at import time rather than assumed —
this document does not assert it as established fact.

### Candidate sources — none imported, awaiting approval

Licenses are as reported by search results and **must be checked against each
repository before use**:

| Source | Content | Reported license | Note |
|---|---|---|---|
| [krmanik/HSK-3.0](https://github.com/krmanik/HSK-3.0) | HSK 3.0 grammar points, text + JSON | check | Closest match to the need |
| [openlanguageprofiles/olp-zh-zerotohero](https://github.com/openlanguageprofiles/olp-zh-zerotohero) | Chinese grammar list | CC-BY-SA-4.0 | Share-alike is a real constraint for a shipped app |
| [glxxyz/hskhsk.com](https://hskhsk.com/word-lists) | Example sentences for HSK 1–3 grammar | check | Largely from official HSK documentation |
| [ivankra/hsk30](https://github.com/ivankra/hsk30) | Vocabulary, not grammar | MIT code | Level cross-validation only |

Before importing, document: authority, license and permitted use, levels
covered, expected record count, field quality, conflicts with the existing 82,
and dedupe strategy. Import must land as a reproducible adapter retaining
`sourceLevel` and per-record provenance.

---

## 6. Phase checklist

### Phase 1 — corpus and filter correctness ✅ done

- [x] Canonical taxonomy: 82 categories, 24 groups, all 185 legacy ids mapped
- [x] Retire gloss-regex inference; delete `inferFunctionsFromMeaning` / `inferRegisterFromMeaning`
- [x] Provenance model (`tagSource`, `registerSource`, `categorySource`, `verification`, `framework`)
- [x] Morphology-derived register for ja and zh
- [x] Rerunnable audit tool with JSON output and `--compare`
- [x] Filter service layer: OR-in-group / AND-across-groups, exclusions, verified gate, shared predicate
- [x] `-v1` → `-v2` filter migration, non-destructive
- [x] Grouped collapsible category UI with live counts, search, tooltips, removable chips
- [x] Fix the Aero Practice dead-end
- [x] Taxonomy i18n in en/ja/zh/ru, per-language, with a test that they differ
- [x] 699 tests passing (was 642); `vite build` clean; browser-verified

### Phase 1.5 — curation queue (in progress)

- [x] Review the 220 near-duplicate groups — **done, and the number was wrong.**
      220 was measured on the *raw* corpus using `grammar-audit.cjs`'s own
      `normalizeTitle()`, which is not the shipped `grammarTitleKey()`. Against
      the deduped list — what a user actually sees — the real backlog was **26
      groups**, and *none* of them were editorial: 12 were two hollow Mazii rows,
      14 were an authored record shadowed by a hollow twin, and **0** had real
      content on both sides.

      All 26 were one of three mechanical notation gaps, now closed in
      `grammarTitleKey`: ASCII `~` (the set covered `〜` and `～` but not plain
      `~`), bracket characters around optional particles (`ため(に)` vs
      `〜ために` — only the brackets are stripped, never their contents), and
      ASCII vs fullwidth slash. Rows after dedupe 1,919 → **1,893**; the
      curation queue is **0** under three independently-chosen fuzzy keys.

      Verified against four invariants before shipping: no empty keys, no new
      collisions among the authored titles, exactly the expected merge count,
      and **no authored record displaced by a hollow twin**. The last three are
      now corpus-level tests in `grammarPracticeFilters.test.ts` — the existing
      dedupe tests all used hand-built fixtures, which is precisely how §1.4
      happened.

- [x] Resolve the 98 groups spanning multiple levels — **done: resolved as
      "correctly preserved, do not resolve".** The disagreement is a systematic
      source offset, not 98 editorial disputes. Of the 116 surviving rows that
      carry a level disagreement, **every single one is exactly ±1 or +2 bands
      and none is mixed**; in 87 of 116 the authored file is the easier band and
      the Mazii dump the harder one (79 are exactly +1).

      That shape says the Mazii dump simply levels shared patterns about one
      band harder than the authored files. Picking a winner per record would
      dress a known source offset up as 98 individual curation judgments. The
      shipped behaviour — survivor keeps its level, the other is preserved on
      `alternateLevels`, and the UI can surface "also listed as N4" — is already
      the honest answer. **No records were changed.**
- [x] Author categories for the 325 hand-written JLPT points — **done.** All 325
      records in `n5/n4/n3/n2/n1/n1-extra/n2-extra.ts` now carry an authored
      `categories: [...]`, so `normalize.ts` reports `categorySource: 'authored'`
      for every one of them and they pass the verified gate.

      Applied as a data map plus a mechanical inserter, not by hand-editing 325
      records: judgment lived in one reviewable id→categories table, and the
      inserter refused to write unless (a) every category id resolved against
      `CATEGORY_IDS`, (b) the map and the record ids were 1:1, and (c) no file
      already had a `categories` field. Gate (b) caught two records the
      classification pass had missed.

      | | Before | After |
      |---|---|---|
      | Canonical categories populated | 66 | **80** |
      | Empty categories | 16 | **2** (`request.refusal`, `discourse.vagueness`) |
      | Uncategorized records | 1,177 (52.9%) | **852 (38.3%)** |
      | Records with ≥2 categories | 336 | **562** |
      | Average categories when tagged | 1.39 | **1.47** |

      Note `tagSource` barely moves (82 → 88 authored). That is correct, not a
      partial application: `tagSource` is the weakest-link display summary, and
      these records still carry a default *register*. The filter gate reads
      `categorySource`, which is `authored` for all 325 — verified directly
      rather than inferred from the audit totals.
- [x] Decide what the Mazii records are *for* — **decided: option (b), enrich
      from a real source. Done for 706 of them.**

      **The Mazii export is a dead end, and this was measured, not assumed.**
      The 57 `Grammar-N*-Mazii*.xlsx` files in Downloads are 50-row paginated
      exports whose header is `word, phonetic, mean, comment` — the same four
      columns as the imported JSON. Across all 2,195 rows, `phonetic` and
      `comment` are empty in **every single one**, and the unique-pattern counts
      match the import exactly (324/437/627/432, zero on either side only). The
      original import discarded nothing; Mazii's exporter has a `comment` column
      it never fills. No re-import can help.

      **Source: Tatoeba** (https://tatoeba.org), CC-BY 2.0 FR, verified at
      https://tatoeba.org/en/downloads before use. Acquisition is **build-time
      only** — 34 MB of TSV is fetched to a scratch dir, and what ships is a
      generated ~536 KB module. Users download nothing, so the offline-first
      rule is untouched and the asset registry is not involved.

      **Matching is two-stage, because one stage was not good enough.** A
      bounded-regex pass alone reached 65% coverage at roughly 65% precision —
      it put ずに inside じょう**ずに** (上手に), がる inside 転**がる**, にて
      inside **にて**いる (似ている). Shipping that would have reproduced §1.1
      exactly: confident output from a weak signal. Stage two re-checks every
      hit against morpheme boundaries using **the same kuromoji + IPADIC
      dictionary the app ships**, so a sentence accepted at build time segments
      in the app the way it did here. That rejected 5,527 of 31,735 candidates.

      Precision after boundary filtering, on hand-reviewed samples:

      | Bucket | Records | Sampled | Correct |
      |---|---|---|---|
      | Literal core ≥4 chars | 659 | 16 | 16/16 |
      | 2–3 char all-kana | 231 | 15 | 13/15 |

      Boundary agreement cannot separate the short all-kana cases (…も…も still
      matched もっとも; んで matched なんで), so **all 234 all-kana patterns with
      a core under 4 characters ship no examples at all** rather than wrong
      ones. Flip `MIN_KANA_LITERAL` in the emitter to include them.

      Result: `missing` 1,820 → **1,114**; 706 records became
      `imported-unreviewed`, which is what `studyReadyOnly` admits, so
      study-ready records went **407 → 1,113**.

      Attribution is a shipping obligation, not a code comment: `GrammarExample`
      gained `source`/`sourceId`, every imported sentence keeps its upstream
      Tatoeba id, and `GrammarView` shows a CC-BY credit whenever a displayed
      example came from Tatoeba. A test asserts every imported sentence stays
      traceable. Note the app already queried Tatoeba's API live and surfaced
      **no** attribution anywhere — this is the first credit in the app.

- [ ] ~~Decide what the 1,820 Mazii records are *for*.~~ They are a pattern index,
      not study material (see §2.2). Options, not mutually exclusive:
      (a) present them honestly as an index — searchable, excluded from study
      and export by default, which `studyReadyOnly` already does;
      (b) enrich from a real source — this is content acquisition and belongs
      with the HSK sourcing decision;
      (c) merge the ones that duplicate a core entry, recovering the core
      record's content for the Mazii title variant. The 220 near-duplicate
      groups are the place to start measuring how much (c) recovers.
      **Do not hand-classify them from the gloss** — that reproduces the
      original defect by hand.
- [x] Audit the HSK seed's authored register tags — **done.** All 7 `casual`
      tags were reviewed against one standard: keep the tag where the record's
      own explanation attests colloquial or spoken-only use, drop it where
      nothing in the record supports it.

      Demoted to `neutral`: `别` (standard negative imperative at every
      register — 别动 appears on official signage; 不要 is the formal variant,
      not 别's opposite number), `真` (plain degree intensifier), `简直`
      (common intensifier, appears freely in written prose), `何苦`
      (rhetorical, not colloquial — if anything it leans literary, so neutral
      is the under-inclusive call).

      Kept `casual`: `呢`, `吧` (spoken sentence-final particles) and `再…不过`
      (its authored explanation reads "Colloquial superlative").

      Effect: casual 17 → 13 tagged, 16 → 12 answerable. The two the audit
      originally flagged were both genuine; applying the same standard to the
      rest found two more.
- [x] Curation UI — **built, but deliberately re-scoped.** The original spec
      (side-by-side duplicate compare, merge/split) was written for a backlog
      that no longer exists: the duplicate queue is 0, and the surviving level
      disagreements are a preserved source offset, not disputes. There is
      nothing left to merge.

      What does need a person is the opposite end. **Nothing in this corpus is
      `verified`** — 706 records carry machine-matched Tatoeba sentences, which
      is good enough to study from but is not evidence that anyone looked. So
      the screen is a *review queue*: `src/renderer/grammarCuration.ts` (pure
      logic + storage) and `components/grammar/GrammarCurationPanel.tsx`, on a
      new "Review" mode in `GrammarView`.

      - Four queues with live counts: imported-unreviewed / no-examples /
        no-category / reviewed. A reviewed record leaves the work queue even if
        it still lacks categories, so it stops resurfacing.
      - Approve is the **only** path to `verified` in the whole corpus. Reject
        strips the imported sentences, so the record falls back to `missing`
        through the ordinary `verificationFor` rule rather than a special case.
      - **A verdict is data about a record, never an edit to it.** The generated
        `tatoebaExamples.ts` stays regenerable; decisions live in user storage
        (`jp-grammarx-curation-v1`, IDB-mirrored) and are applied over the top,
        so re-running the import cannot silently discard someone's review.
      - Bulk approve/reject with a real undo stack, because a bulk action over
        hundreds of records is only safe if it is reversible.
      - 13 tests, including corpus-level ones: approving the whole queue
        verifies exactly it and nothing else, and rejecting it returns the
        corpus to its pre-import state.

      **Not driven live.** §7's browser harness cannot render this app — the
      renderer's boot awaits `window.api` from the Electron preload bridge, so
      under plain Vite React mounts and the root stays empty with no error. The
      logic is unit-tested against the real corpus and the build is clean, but
      the screen itself has not been exercised; that needs `npm start`.

- [x] **Register classification pass — the 2,060 points morphology couldn't
      decide, applied.** `tools/grammar-register/` (extract → make-prompts →
      14 batches → ingest → apply, documented in its own README) asks a model
      to label register on every point `normalize.ts`'s morphology rules can't
      resolve, writing `registerSource: 'classified'` so the label stays
      attributable and — by design — untrusted by `trusted()`/the "verified
      tags only" filter. All 14 batch replies validated clean (2060/2060
      accepted, 0 unlabelled) and landed well under the pipeline's own 35%
      non-neutral sanity check (18.2%: neutral 1685, literary 194, casual 126,
      business 55).

      **`apply.cjs` (the step that writes the `.ts` data files) had two real
      bugs, both found and fixed before landing:**
      1. *Not idempotent.* It always blindly inserted a fresh
         `register:`/`provenance:` pair instead of checking for one already
         there, so records touched across more than one run (this pass had
         been partially re-run before) ended up with 2–3 duplicate
         `provenance:` keys in the same object literal — harmless at runtime
         (JS keeps the last duplicate and every copy was byte-identical) but
         a growing mess that would have kept compounding on every future
         re-run. Rewritten to operate per-record: strip any existing
         `register:`/`provenance:` lines for that id, merge forward any other
         field already living in `provenance` (e.g. the HSK import's
         `categorySource: 'imported'`), and write exactly one pair. Verified
         idempotent — a second `--dry` run now reports 0 changes, 2060
         "already correct".
      2. *Silently skipped the four `*-mazii.ts` files.* Those four are CRLF
         while every other data file is LF; the new per-record regex required
         exact `\n` adjacency around the braces and matched zero records in a
         CRLF file, so the first fixed version would have dropped 1,687 of
         the 2,060 assignments with no error. Fixed by normalizing to LF for
         matching and restoring each file's original line-ending style on
         write (no unrelated CRLF↔LF diff noise). A third gap — the very last
         record in each array has no trailing comma before `];` — was also
         missing 4 ids (one per mazii file) until the closing-brace match was
         made comma-optional.

      Applied: 2060 points across 13 files (`n1-mazii.ts` 304, `n3-mazii.ts`
      590, `n4-mazii.ts` 370, `n2-mazii.ts` 423, and the rest split across
      `n1–n5.ts`, `n1-extra/n2-extra.ts`, `hsk.ts`, `hsk-extra.ts`). Verified:
      898/898 vitest, `vite build` clean, eslint clean on `apply.cjs` (the two
      remaining `no-var-requires` errors are the same pre-existing pattern on
      every `.cjs` tool script in this repo, confirmed by checking
      `grammar-audit.cjs`/`extract.cjs`/`ingest.cjs`, not something this pass
      introduced). The corpus-level "coverage" audit numbers (carries a
      register / checked-no-register / never-examined) do not move from this
      pass by design — those track `trusted()` register sources only, and
      `classified` is deliberately excluded from that trust tier.

### Phase 2 — Grammar Explorer redesign

- [x] Collapse the Aero and classic explorers into one themed component —
      **done, and it was hiding a bigger problem than duplication.**

      The two explorers had drifted: `AeroGrammarExplorer` had favourites, a
      study queue and back/forward history that `GrammarBrowser` simply did not,
      so which features you got depended on your theme. But the real defect was
      that **neither used the Phase 1 filter layer.** Both read raw `GRAMMAR`,
      so both listed all 2,227 rows — including the 334 duplicates
      `dedupeGrammarByTitle` exists to collapse — and neither could filter by
      category, register, verified tags or study-readiness. The entire Phase 1
      investment was reachable only from Practice. Browsing, the thing people
      actually do, was the one screen missing it.

      `components/grammar/GrammarExplorer.tsx` replaces both. It holds only
      selection and navigation state and defers every "which records match"
      question to `filterGrammarPoints` — the same predicate behind the counts
      and the practice list. Skins differ by CSS class, never by behaviour.
      Explorer filters persist under their own key (`EXPLORER_FILTERS_KEY`)
      rather than sharing Practice's, so narrowing a browse does not silently
      reach into the next study session.

      Removed 741 lines of now-dead code (the Aero explorer and its five
      sub-components, plus `GrammarBrowser`); `GrammarView.tsx` went 1,148 →
      ~400 lines. The theme early-return that made Practice unreachable in Aero
      is gone with them, so the mode switch is now the only thing deciding what
      renders. The status bar was also reading raw `GRAMMAR.length`, which would
      have claimed 2,227 next to a list of 1,893 — now deduped.

      **Caveat:** guides lose their Aero-specific presentation, since
      `AeroGuideList`/`AeroGuideDetail` went with the explorer and `GuidesBrowser`
      now serves both skins. Re-skinning that is CSS work, not a component fork.
- [x] Virtualized results in both skins — came free with unification: the list
      is a single `VirtualList`, so there is no longer a skin that renders all
      1,893 rows eagerly.
- [x] Selection drawer, stable across filter changes, with hidden-selection
      count — selection survives filtering, the header reports how many selected
      records are currently out of view, and the drawer lists the full selection
      with the filtered-out rows dimmed and flagged. Hiding a record never
      silently drops it from a pending bulk action.
- [x] Bulk actions with disabled-reason tooltips — favourite / queue / add to
      flashcards. The reasons are specific rather than generic: a deck card
      built from a record with no example sentence is an empty card, so the
      action is blocked only when *every* selected record lacks examples
      ("None of the 12 selected points have an example sentence, so the cards
      would be empty"), and when only some do it runs and reports how many it
      skipped instead of quietly producing junk.
- [x] Saved filter presets — `grammarPresets.ts`, named snapshots of
      `PracticeFilters`, saving twice under one name overwrites rather than
      accumulating. Presets are **deep**-copied in both directions: a shallow
      spread left them sharing `levels`/`categories` arrays with live state, and
      `parsePresets` merging over `DEFAULT_PRACTICE_FILTERS` left them sharing
      the module-level default arrays — shared state one in-place edit from
      corruption. Caught by its own test; 9 tests pin it.

### Phase 3 — learner state ✅ done

- [x] **Per-point familiarity store with migration** — `grammarFamiliarity.ts`.
      Reuses the vocabulary scale rather than inventing a second one:
      `GX_LEVELS` is asserted equal to `knownWords.ts`'s `WK_LEVELS` by test, so
      the two cannot drift, and `GX_KNOWN_THRESHOLD` matches the
      Familiar-or-better rule `levelService` already sums. Mirrors two further
      patterns from `knownWords`: the `m?: 1` manual flag (a session result
      records statistics but never moves a hand-set band, exactly as
      `bulkSetFromAnki` skips manual words) and sparse storage (clearing to New
      deletes the entry).

      **The existing study queue is deliberately NOT migrated into levels.**
      `jp-grammarx-explorer-study-v1` and the favourites list were the obvious
      seed, and using them would have been wrong: queueing records an intention
      to study, favouriting records interest, and neither is evidence of
      knowledge. Promoting either into `Learning` would manufacture a
      familiarity the user never asserted, indistinguishable afterwards from one
      they earned — §1.1 repeating itself. What the store *is* built for is
      being migrated: a versioned envelope from day one, with `parseFamiliarity`
      mapping an unversioned bare map forward rather than discarding it.
- [x] **Session builder** — `grammarSession.ts`. Count, direction, question
      types, mastered handling and new/review ratio.

      `count` and `newRatio` are targets, not promises, and the plan reports
      what it actually delivered (`delivered`, `ratioDelivered`,
      `unusableTypes`) rather than silently returning 7 cards for a request of
      20. A question is never dealt that the record cannot support, following
      the Phase 2 bulk-action rule about empty cards.

      `MASTERED_LEVEL` (Known, 3) is deliberately **not** `GX_KNOWN_THRESHOLD`
      (Familiar, 2). They answer different questions — coverage versus "further
      drilling has little value" — and a test pins them apart.
- [x] **Real exercise types; results feed familiarity** — flip, meaning-choice,
      pattern-choice and cloze, wired into a rewritten `GrammarTestModal`.
      Grading is three-way (**Hard / Okay / Good** → −1 / 0 / +1 band); `okay`
      counts as recalled for accuracy but holds position, because collapsing it
      into either neighbour lies about progress. Choice questions auto-grade
      onto the outer two. Familiarity is persisted **per answer**, so a session
      abandoned halfway still counts — discarding it was the original defect.

      **Cloze matching is under-inclusive on purpose.** `clozeCore` requires a
      literal core of `MIN_CLOZE_CORE` (4) characters or a kanji, and a verbatim
      occurrence in the example — the same rule the Tatoeba importer applied.
      Measured reach: **745 of the 1,113 records that have examples (66.9%)**,
      682 ja and 63 zh. This refuses common patterns — ながら is three kana and
      gets no cloze card. Note this threshold is independent of the importer's
      `MIN_KANA_LITERAL`; changing one does not change the other.
- [x] **Session history** — `grammarSessionHistory.ts`. Bounded, newest-first,
      versioned envelope with the same forward-migrating parser. Records what
      happened in a session, deliberately **not** a schedule: no due dates,
      intervals or ease. Scheduling is Anki's job and this app already exports
      there; a third opinion about what is due would compete with both.

**Verified live on 2026-07-20**, not by tests alone. A complete five-card
session was driven end to end in `npm start`: setup screen, grading, the done
screen reading `Score: 4/5 good · 1 missed` and `1 session · 80% correct`, and
all three stores confirmed written to the Electron LevelDB on disk —
familiarity (`{"l":1,"seen":1,"correct":1,...}` per point), session options,
and the history record. 809 tests / 85 files, i18n clean at 3,640 keys,
`vite build` clean.

**Familiarity is now surfaced (done 2026-07-20).** The Phase 3 gap — state
stored but invisible — is closed:

- **Row badge.** A compact N/L/F/K pill on each Explorer row, shown only once a
  point leaves New (a badge on every row is noise). It reuses the vocabulary
  `wk-grade` palette, so the two knowledge scales read as one visual language.
- **Filter dimension.** `PracticeFilters.familiarity: GxLevel[]`, wired into the
  shared predicate, chips and a `familiarityFilterCounts` helper that counts
  each band against the *other* active filters — the same anti-drift recipe as
  `categoryCounts`. Forward-compatible via `coerce`, so no key-version bump. The
  filter and its counts appear on **both** the Explorer and Practice screens,
  which both now decorate their corpus with `applyFamiliarity`.
- **Manual band setter.** A reusable `GrammarBandControl` in the Explorer detail
  pane, the same four-button picker vocabulary uses; clicking the active band
  clears to New (sparse-delete). A hand-set band shows a "set by hand" tooltip
  and is protected from automatic grading, exactly as `knownWords` does.
- **Live cross-screen sync.** `grammarFamiliarity` gained `onFamiliarityChanged`
  + an emit from `saveFamiliarity` (mirroring `knownWords.onKnowledgeChanged`),
  so grading a card in the test modal live-updates the badges and counts behind
  it. `filterGrammarPoints`/`sortGrammarPoints` are now generic so the
  decoration survives to the rows.

**Verified live on 2026-07-20** under `npm start`, driving the real Electron
window (the Vite harness renders nothing for this app): set ～あとで to Familiar
→ the row badge appeared, the detail control showed "Familiar · set by hand",
the filter counts read New 1892 / Familiar 1, ticking Familiar narrowed the list
to that one point, and switching to Practice showed the same counts (proving the
decoration and the localStorage-backed persistence across a remount). Clearing
the band removed the entry. 826 tests / 86 files (+8 new, including corpus-level
familiarity-filter and subscription-wiring tests), i18n clean at 3,657 keys,
`vite build` clean, changed files lint clean.

**Still not built (a smaller gap): sort by familiarity.** The filter narrows by
band, but there is no "sort by how well I know it" option in `GrammarSort`.

### Phase 4 — Notebook

`notebook/aggregate.ts` merges 8 stores but groups highlights as
`Highlights/${bookId}` — the raw UUID in the screenshots. `ocr`, `plan` and
`extension` streams are declared but never emitted by the aggregator, and
`appendNotebookEvent` has only 4 call sites, so manga-reader OCR under
`<item>/_ocr/` never reaches the Notebook at all.

- [x] Human-readable source grouping
- [x] Emit the three missing streams
- [x] Overview / Library / Words / Translations / Highlights / Captures views
- [x] Artifact lineage

**Shipped 2026-07-20 (M1 + M2).** `aggregateNotebook` now takes an optional
`NotebookSources` ({ library, plan }) instead of fetching nothing; it stays
synchronous, and `loadNotebookSources()` / `aggregateNotebookAsync()` wrap the
two IPC calls. Highlights group as `Highlights/<library title>`, degrading to
`Unknown book (3f8a1c92)` — never the full UUID — when the book has been
removed. 11 new tests, 837 total, `vite build` clean, i18n clean at 3,657 keys.

All three "missing" streams turned out to have real backing stores; none needed
to be dropped:

| Stream | Source | Granularity |
|---|---|---|
| `ocr` | `LibraryItem.ocrMeta` | one entry per **volume**, not per page — `_ocr/` page files are the truth, `ocrMeta` is the summary the library already keeps in sync |
| `extension` | deck cards with `source: 'extension'`, plus `inboxMeta` articles | per card / per article |
| `plan` | `JitenStore.plan` via `jitenGetStore()` | per plan entry |

**A correction worth recording.** The first pass of this work concluded `plan`
had *no* backing store and proposed dropping it, after grepping for
`planToRead` / `toRead` / `wantToRead` / `readingList` and finding only the i18n
string. The store exists — it is `JitenStore.plan`, written by `ensurePlanned()`
in `NovelsView.tsx`, and it is named `acquisitionStatus`/`jiten` throughout. The
grep searched for the concept's *obvious* names and read their absence as the
feature's absence. This is §7.1's failure mode in yet another form: a result
whose meaning was set by the query behind it. `plan` was also missing from
`STREAM_KEYS` in `NotebookView.tsx`, so its count chip had never rendered —
which is why the empty stream was easy to believe.

**Groundwork this lays for artifact lineage.** `JitenPlanEntry` already persists
`importedLibraryItemId` (plan → library item) and `minedAt` (→ mined cards), and
deck cards already carry `bookId`/`bookTitle`/`source`. Both are now passed
through to entry `meta`. The lineage chain is already on disk and needs reading,
not a new store — so the last checkbox is cheaper than it looks.

**Shipped 2026-07-20 (M3).** Six tabs over the previously flat timeline, in
`notebook/views.ts` so the mapping is testable apart from the component. The
stream→view map is a **partition**: every stream belongs to exactly one named
view, and `overview` owns none (it shows all). `notebookViews.test.ts` holds
that property — an unassigned stream fails the suite instead of quietly
vanishing from every tab while still inflating the Overview count, and a
double-assigned one fails instead of making the tabs stop summing to the
notebook.

| View | Streams |
|---|---|
| Overview | all |
| Library | `plan`, `ocr` |
| Words | `saved-words`, `lookups`, `flashcards`, `anki`, `mining`, `known` |
| Translations | `translations` |
| Highlights | `highlights` |
| Captures | `extension`, `audio`, `clipboard` |

Two hazards handled while wiring it: the folder sidebar recomputes against the
active view (a whole-notebook count in a scoped sidebar promises rows the view
will not show — §7.1's defect again), and switching views clears the stream and
folder chips, since a filter stranded on a stream the new view lacks reads as an
empty notebook rather than a stale filter. 843 tests / 88 files (+17 across the
two new files), `vite build` clean, i18n clean at 3,663 keys (+6 view labels ×
4 locales).

**Shipped 2026-07-20 (M4).** `notebook/lineage.ts` renders the chain

```
plan → library → ocr → highlights → cards → anki
```

under each entry that has one. Every stage is read from a relationship the app
*already persists* — `JitenPlanEntry.importedLibraryItemId`, `Annotation.bookId`,
`DeckFlashcard.bookId`/`ankiExported`, `LibraryItem.ocrMeta` — so no new store
was added and nothing is inferred.

Three deliberate refusals, each with a test:

- **Stages that never happened are omitted, not shown as zero.** A `Cards 0`
  node is the §7.1 defect in miniature: a number that reads as a census and is
  actually an absence.
- **An unresolvable book yields `[]`, never a partial chain.** A plausible-looking
  lineage is worse than none.
- **Single-node chains are suppressed.** "Library: 君の名は。" under a row about
  that same book restates the row; it is not lineage.

The index is built once per refresh rather than per row — resolving inline would
re-scan the whole deck for each of up to 400 rendered entries. 855 tests / 89
files (+12), `vite build` clean, i18n clean at 3,670 keys.

### Phase 4 live verification (2026-07-20)

Driven in the running Electron app on the real profile (3,245 entries).

**Confirmed working.** Six tabs render and switch. The 13-chip Overview grid
fits one row at 1920px with no collision — the §7.1 layout failure did *not*
recur. Highlight folders show real titles (`Highlights/ハサミ男 (殊能将之) …`),
not UUIDs. `Plan to read 3` and `OCR 1` prove the two IPC-backed streams reach
the screen. The lineage strip renders and resolves:
`Library One Punch-Man : The Koi Pond | C… → OCR 18`. Chips sum to 3,245,
matching `All (3245)` — the counts reconcile.

**One defect found, and it was mine.** The sidebar read `Extension (4)` while
the Extension chip read `1`, with the three-card difference labelled
`Flashcards`. Cause: the stream was classified on `source === 'extension'` but
`origin` on `source === 'extension' || folder === 'Extension'` — one predicate
asked two ways. `source` postdates the extension bridge, so cards captured
before it carry only the folder, and those three were simultaneously
`origin: 'extension'` and `stream: 'flashcards'`. Now a single `fromExtension`
binding feeds both. Two regression tests, both confirmed to fail against the
old code: the legacy folder-only card, and the invariant behind it — a card with
`origin: 'extension'` may never sit in the plain `flashcards` stream.

857 tests / 89 files, `vite build` clean, i18n clean at 3,670 keys.

**This is the fifth consecutive milestone in this project where driving the UI
found something the suite did not.** §7 recorded it, §7.1 recorded it, and it
held again here — with the added sting that the defect was an inconsistency
*within a single function I had just written*, invisible to tests that only ever
asked about one card shape at a time. The invariant test is the durable fix; the
symptom test alone would not have generalised.

Two observations that are **data, not defects**: some library titles carry
scraper noise (`… (z-library.sk, 1lib.sk, z-lib.sk)`) and wrap to two lines in
the sidebar, and the deck holds exact duplicate cards (two `んだが` 13 seconds
apart). Neither originates in the Notebook.

The new tab styles use the same `var(--border)` / `var(--accent)` / `color-mix`
tokens as the sibling `.gx-notebook-*` rules, so they follow either skin. Note
that `aero-notebook-chrome` has no CSS anywhere in the repo — the Notebook has
never been Aero-transformed (Frutiger Aero Phase 4 M1–M14 are still pending),
so the class is inert in both skins today.

### Phase 5 — full GrammarX rename

Deferred deliberately. Renaming `productName` moves `%APPDATA%\jp-study-app`,
and renaming the Anki note types `JP Study App::…` breaks field mappings in an
existing collection. Needs its own session, a verified backup, and a reversible
userData migration.

---

## 7. Verification performed

| Check | Result |
|---|---|
| `npx vitest run` | **699 passed / 699**, 80 files (baseline 642) |
| `npx vite build --config vite.renderer.config.ts` | clean, 10.4s |
| `node tools/i18n-check.cjs` | clean, 3,567 keys |
| Taxonomy translation check | 212 keys, **0** identical across ja/zh/ru |
| `node tools/grammar-audit.cjs --compare` | before/after captured |
| Browser harness | filters, counts, chips, tooltips, zero-state driven live |

**`tsc --noEmit` and `eslint` are not obtainable and were not run.** TypeScript
is pinned to 4.5.5 (a 2021 release), which cannot parse `satisfies` — used in 3
shipped files (`profileFields.ts:596`, `toolboxSettings.ts:224`,
`toolboxShortcuts.ts:669`). Both tools fail on code the app runs correctly, and
`AGENTS.md`/`CLAUDE.md` forbid touching root configs. This is pre-existing and
recorded in `TASKS.md`. Vite/esbuild strip types without typechecking, so the
runtime is unaffected — but no type-safety claim should be made about this work.

### Bugs found by driving the UI that tests did not catch

1. **Formal returned Chinese records only.** Register and category provenance
   had been collapsed into one weakest-link field, so every Japanese record with
   a morphology-derived register failed the verified gate on account of its
   guessed categories. Now split; regression test added.
2. **"Verified tags only" was a no-op.** Untrusted registers were being
   overwritten with `neutral`, so switching the toggle off revealed nothing.
   Now preserved-and-flagged; the toggle moves 38 → 42.
3. **`authored` collapsed from 82 to 33** when an explicit `neutral` from an
   authored module was misclassified as a guess.

Consistent with this repo's history: passing tests proved the engine's logic,
never that the screen was usable.

### 7.1 Defects found in the 2026-07-19 live pass

The Phase 1.5 / Phase 2 screens all render and behave as specified. Four
presentation-level defects survived the test suite, none of them blocking:

1. **The Review queue's "No category" chip reads 0 while 852 records genuinely
   have no category.** Not a broken count — `issueFor` in `grammarCuration.ts`
   is a first-match-wins chain (`reviewed` → `imported-unreviewed` →
   `no-examples` → `no-category`), so a record only reaches the last branch if
   it has examples, is not Tatoeba-imported, *and* lacks categories. The Mazii
   pattern index is absorbed by the earlier branches. One record to one queue is
   the right routing; the defect is that the chip reads as a census and is
   actually a residual. Either relabel it or show `0 of 852`. **This is the same
   failure mode as §1.4 and §2.2 in presentational form** — a number whose
   meaning is set by the query behind it.
2. **Filter sidebar layout collisions**, in both the Explorer and Practice
   skins: the `Search` label overlaps its input (placeholder clipped mid-word),
   and category group counts collide with their labels and overflow the panel
   (`Time & sequence168`, `Condition & hypothesis203`).
3. **A raw study-language code leaks into UI copy** — the Grammar Test count
   dialog reads "…how many cards to practice. · ja".
4. **The saved-filter dropdown resets its label** to "Saved filters…" after
   loading a preset instead of showing the active preset's name.

---

## 8. Known limitations

- **82 Chinese grammar points.** The pipeline, schema and honest coverage
  reporting are in place; the content is not. Awaiting source approval.
- **50.0% of records are a pattern plus an English gloss and nothing else**
  (was 81.7%). The Tatoeba import gave 706 of them real example sentences;
  `structure`/`explanation` on those are still verbatim copies of
  `title`/`meaning`, so they are `imported-unreviewed`, never `verified`.
  Still the largest content gap in the app, and still not fixable by
  classification — but no longer immovable.
- **234 patterns are deliberately example-less.** All-kana cores under 4
  characters, where morpheme-boundary agreement cannot rule out a false match.
  Not a gap in the source; a refusal to guess.
- **38.3% of records have no canonical category** (was 52.9%; the Phase 1.5
  authoring pass classified the 325 hand-written JLPT points). The remainder is
  almost entirely the Mazii pattern index, which by §2.2 cannot be classified
  from its own content.
- **Nothing is `verified` yet, but there is now a way to get there.** The Phase
  1.5 review queue makes approval the only route to `verified`; until someone
  works the queue the count stays 0, and the UI must not imply otherwise.
- **2 canonical categories are empty** (was 16) — `request.refusal` and
  `discourse.vagueness`. Reachable from the alias map, but no record yet
  carries a legacy id or authored tag that maps to them.
- **Duplicate groups: 0 after the shipped dedupe** (was reported as 220, which
  measured the raw corpus under a different key — see §6). 116 rows carry a
  preserved `alternateLevels` disagreement, deliberately unresolved.
- **N5 has 50 points against N3's 675.** The Mazii dumps cover N1–N4 only; N5 is
  hand-authored. Worth noting before treating level counts as difficulty signal.
