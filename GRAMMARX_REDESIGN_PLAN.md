# GrammarX Redesign Plan

Living document. Phases 1, 1.5 and 2 are implemented. Phase 3 (learner state)
is next and is specified, not built.

**Nothing in Phases 1.5 or 2 has been driven live.** The browser harness §7
refers to cannot render this app: the renderer boots by awaiting `window.api`
from the Electron preload bridge, so under plain Vite React mounts and `#root`
stays empty *with no console error*. Treat that silence as absence of evidence,
not evidence of absence — the review queue, the unified Explorer and the
selection drawer are verified by tests and build only, and want an `npm start`
pass before anyone trusts the screens.

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

### Phase 3 — learner state

There is currently **no** grammar familiarity, mastery, or session history
anywhere. `GrammarTestModal` has exactly one question type (a self-graded flip
card) and discards results on close.

- [ ] Per-point familiarity store with migration
- [ ] Session builder (count, direction, question types, mastered handling, ratio)
- [ ] Real exercise types; results feed familiarity
- [ ] Session history

### Phase 4 — Notebook

`notebook/aggregate.ts` merges 8 stores but groups highlights as
`Highlights/${bookId}` — the raw UUID in the screenshots. `ocr`, `plan` and
`extension` streams are declared but never emitted by the aggregator, and
`appendNotebookEvent` has only 4 call sites, so manga-reader OCR under
`<item>/_ocr/` never reaches the Notebook at all.

- [ ] Human-readable source grouping
- [ ] Emit the three missing streams
- [ ] Overview / Library / Words / Translations / Highlights / Captures views
- [ ] Artifact lineage

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
