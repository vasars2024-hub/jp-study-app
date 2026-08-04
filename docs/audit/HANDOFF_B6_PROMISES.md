# HANDOFF B6 — The promise register

**Static analysis only. The app was never started, and no live verdict is claimed anywhere in
this package.** Written incrementally, per `jp-dispatch` §7.

---

## 1. Scope and ownership

| | |
|---|---|
| Branch | `audit/a-evidence` (pre-existing; **no branch cut, no commit, no `git add`** — dispatch §7) |
| Base commit | `68b25dc` |
| Date | 2026-08-04 |
| **Owned** | `docs/audit/PROMISE_REGISTER.md`, `docs/audit/HANDOFF_B6_PROMISES.md` |
| **Foreign — read only** | every plan document (`TASKS.md`, `docs/MASTER_PLAN.md`, `GRAMMARX_REDESIGN_PLAN.md`, …), all of `src/**`, `src/renderer/styles.css`, `docs/migration/**` |

Nothing outside the two owned files was modified. **No plan document was corrected** — proposed
corrections are §7 of this handoff and are the user's to apply.

---

## 2. Corpus read — what the denominator actually is

### 2.1 Documents opened — and at what depth

The three depths are not equivalent and are kept separate on purpose. Line counts measured with
`Get-Content <f> | Measure-Object -Line`.

**Read in full or near-full (9 files, 3,875 lines):**

| File | Lines |
|---|---:|
| `TASKS.md` | 128 |
| `docs/IMPLEMENTATION_PLAN_V1.01.md` | 409 |
| `docs/migration/FEATURE_PARITY_LEDGER.md` | 88 |
| `TOOLBOX_COMPLETION_AUDIT.md` | 140 |
| `EXTENSION_FEATURE_TRUTH_MATRIX.md` | 43 |
| `docs/audit/CENSUS_SURFACES.md`, `CENSUS_NAVIGATION.md`, `DISPATCH_B6_PROMISES.md` | 542 |
| `GRAMMARX_REDESIGN_PLAN.md` — §6 checklist, §7, §7.1, §8 read in full; §1–§5 by heading | 823 |
| `docs/MASTER_PLAN.md` — §15 in full; §1, §2, §16, §17, §19–§22 in full or near-full | 1,936 |

**Structurally enumerated, prose sampled (see §2.2):** `docs/MASTER_PLAN.md` — all 26 `##`
sections and all 255 `###` subsections listed; Parts II–III (§3–§12) at heading depth only.

**Searched by term, not read (the rest):** `docs/migration/NEXT_SESSION.md` (7,070),
`docs/migration/progress.json` (3,297), `src/PHASE_*.md` (18 files, 4,745),
`src/.coordination/study-mode/**` (15 files, 3,996), `EXTENSION_*.md` (10 remaining, 797),
`UI_MIGRATION_DEBT.md` (399), `UI_UX_REFINEMENT_MASTER_PLAN.md` (271),
`docs/RESOURCES_1.01_OVERHAUL_PLAN.md` (325), `BLANC_REFINEMENT_PLAN.md` (1,031),
`docs/mobile/M01_CAPABILITY_RELEASE_MATRIX.md`, and every other root `*.md` (37 files total at
root). Term searches were run repo-wide over `*.md`, so a claim containing one of the searched
terms would have been found in any of these; a claim phrased differently would not.

**Total opened or searched: 76 documents.** The honest summary is that **9 were read**, the
roadmap was enumerated in full and sampled in prose, and the remaining ~66 were interrogated for
specific terms.

### 2.2 What fraction of `MASTER_PLAN.md` was covered

Stated plainly because the dispatch asked for it and because overclaiming here would be the
same defect this package exists to find.

- **Structure: 100%.** Every `##` section (26, of which 22 are numbered feature sections) and
  every `###` subsection (**255**) was enumerated.
  `Select-String -Path docs/MASTER_PLAN.md -Pattern '^### '` → **255**;
  `'^## '` → **26**; `'^\s*[-*] '` → **706** bullets.
- **Prose: roughly a third, chosen non-randomly.** §15 (Visual Novel, 129 lines) was read in
  full because it is the calibration case; §1/§2 (Scraper), §16 (video player), §17/§19/§20
  (AI), §21/§22 (consolidation and QA) were read in full or near-full because other documents
  make status claims about them. Parts II–III (§3–§12) were read at heading + first-paragraph
  depth only.
- **The single most important structural finding about this file is that it makes no status
  claims at all** — see §4.1. That is why heading-level coverage is sufficient to classify it,
  and why the ticks that need auditing live in `TASKS.md` and the `PHASE_*_STATE.md` ledgers
  instead.

### 2.3 `NEXT_SESSION.md` (7,070 lines) — how it was sampled

Not read end to end. Searched by term for every feature named in the register, plus the slice
markers. The dispatch's warning about ordering is noted and was respected: newest slice first,
**slice 45 at the bottom**.

**This is a stated limit, not a silent one.** A promise asserted only in an unsearched region of
`NEXT_SESSION.md` would have been missed by this pass.

---

## 3. Verification results — every claim resolved

Format: the claim as handed to this run, the verdict, and the re-runnable command.

### 3.1 Claims handed down by the dispatch

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | VN feature has **10 panels** under `components/immersion/` | **CONFIRMED** | `Get-ChildItem src/renderer/components/immersion` → 11 files, of which **10** are `VisualNovel*.tsx`; the 11th is `ImmersionContent.tsx` |
| 2 | VN has **8 test files** | **CONFIRMED** | `Get-ChildItem src/shared/__tests__ -Filter 'visualNovel*'` → 8 |
| 3 | VN reachable by **exactly one** button, `ImmersionView.tsx:346`, label a raw English literal | **CONFIRMED** (as "one outside excluded themes"; 2 in code) | `CENSUS_NAVIGATION.md` §4; `ImmersionView.tsx:346-349` |
| 4 | VN has **zero i18n keys of its own** | **CONFIRMED** | the only `visualNovel` key is `blanc.agent.operations.group.visualNovel`, `catalogs/en.ts:5420` — a Blanc key |
| 5 | VN has **no `settingsRegistry` entry** | **CONFIRMED** | `'visual novel'` at `settingsRegistry.ts:566` is a search *keyword* on the `reading-lens` card, `pageId: 'study'` |
| 6 | `GAME_ARENA_CHROME` = **109** keys | **CONFIRMED** | TS AST count of the object literal → 109; regex cross-check `^  '` → 109 |
| 7 | `MOONCAP_PHASE_LORE` = **200** keys | **CONFIRMED, by a different route than a naive count** | the literal has **50** properties, each a `...phase(...)` spread emitting **4** keys (`mooncapLore.ts:14-19`) → 50 × 4 = 200. A property count alone returns 50 and would have been reported as a correction. |
| 8 | 309 English keys spread into **all four** catalogs | **CONFIRMED** | `...GAME_ARENA_CHROME` + `...MOONCAP_PHASE_LORE` present in `en.ts:48-49`, `ja.ts:47-48`, `ru.ts:47-48`, `zh.ts:45-46` |

### 3.2 Corrections to documents this run read

| # | Source | Claim | Measured | Command |
|---|---|---|---|---|
| C1 | `CENSUS_NAVIGATION.md:164` | "**9** `shared/visualNovel*.ts` modules" | **8** | `Get-ChildItem src/shared -Recurse -Filter '*isualNovel*'` → 8 modules + 8 tests |
| C2 | `FEATURE_PARITY_LEDGER.md:13` | `featureStatus.ts` has **60** registered feature ids | **49** | AST/regex count of `FEATURE_STATUS` → 49 |
| C3 | `FEATURE_PARITY_LEDGER.md:45` | §1: "5 ready, 4 untested, **11 shell**" | `set.*`: 5 ready, **14** untested, **0 shell** | same command, grouped by id prefix |
| C4 | `FEATURE_PARITY_LEDGER.md:74` | §15: "`visualNovels.ts` + **11 components**" | **10** VN components (+1 non-VN file in the directory) | as row 1 above |
| C5 | `GRAMMARX_REDESIGN_PLAN.md:948` | "**852** records genuinely have no category" | **0** uncategorized records (0.0%) | `node tools/grammar-audit.cjs` |
| C6 | `GRAMMARX_REDESIGN_PLAN.md:971` | "**82** Chinese grammar points" | **599** | same |
| C7 | `GRAMMARX_REDESIGN_PLAN.md:986` | "Nothing is `verified` yet … the count stays 0" | **64 verified (2.3%)** | same |
| C8 | `GRAMMARX_REDESIGN_PLAN.md:989` | "**2** canonical categories are empty" | **0 empty** (82 declared, 82 populated) | same |
| C9 | `GRAMMARX_REDESIGN_PLAN.md:973` | "**50.0%** of records are a pattern plus an English gloss and nothing else" | **66.3%** (1,820 records) | same |
| C10 | `GRAMMARX_REDESIGN_PLAN.md:982` | "**38.3%** of records have no canonical category" | **0%** | same |
| C11 | `TASKS.md:35`, `:44` | i18n catalogs live in `shared/i18n/catalogs.ts`; script is `tools/i18n-check.mjs` | catalogs are **per-language files** under `shared/i18n/catalogs/` since 2026-07-21 (`CLAUDE.md`); the script is `tools/i18n-check.**cjs**` | `CLAUDE.md` i18n section; `Test-Path tools/i18n-check.cjs` |
| C12 | `TASKS.md:74` | `GAME_ARENA_CHROME` is "in `catalogs.ts`" | it is in `shared/i18n/catalogs/gameArena.ts`, re-exported by `catalogs.ts:36` | `rg GAME_ARENA_CHROME src` |
| C13 | `TASKS.md:117` | "Still pending (**4**): `csvPaste`, `episodeProcessing`, `mediaProviderSyncJournal`, `subtitleMatching` — pure layers with no consumer" | **3.** `subtitleMatching` gained a real consumer at `src/main/subtitleDiscovery.ts:23`. The other three are still imported only by their own tests. Independently confirmed by `node tools/architecture-audit.cjs` → *"3 known finding(s) still marked pending"*. | `Select-String` for `from '.*(csvPaste\|mediaProviderSyncJournal\|subtitleMatching\|episodeProcessing)'` across `src` |
| C14 | `TOOLBOX_COMPLETION_AUDIT.md:19`, `:29-32`, `:65`, `:67`, `:86` | **four different registry totals in one document** — 56 modules / "all 50 registry entries" / "30 ready" / "35 ready" | **58 modules — 37 `ready`, 20 `adapter-needed`, 1 `experimental`** | 38 explicit entries (`^\s{4}id: '`) + 20 rows in `plannedModules([...])` (`toolboxRegistry.ts:1042-1063`, status hardcoded at `:1079`) |
| C15 | `TOOLBOX_COMPLETION_AUDIT.md:36` | the earlier note "used a `planned` status that **does not exist in the schema**" | **it exists.** `ToolboxModuleStatus = 'ready' \| 'existing' \| 'planned' \| 'adapter-needed' \| 'experimental'` (`toolboxRegistry.ts:1`). No module *uses* it (histogram: 0), so the correction's substance was right and its stated reason is wrong. | `Select-String "ToolboxModuleStatus" src/shared/toolboxRegistry.ts` |
| C16 | `docs/mobile/M01_CAPABILITY_RELEASE_MATRIX.md:11`, `:46`, `:168`, repeated as current at `TASKS.md:127` | "**25** registered app sections", "**26** widgets", "**~200** IPC channels" | **23** `case` labels in the `AppSection` switch (24 in the `DesktopWinSection` union); **27** widgets; **374** distinct `invoke()` channels in `preload.ts` | `^\s*case '`; `^\s*\{ type: '` in `widgets/registry.tsx` (positive control `clock-digital` → 1); `invoke\('([^']+)'` sorted unique |
| C17 | `TASKS.md:38` | "the ~**49**-entry `SETTINGS_REGISTRY` search index" | **100** entries — 19 page entries + **81** cards | `CENSUS_SURFACES.md` §4, re-derived there from `settingsRegistry.ts:172` |

**On C16:** M01 states its counts are *"code-derived at `a31fd8a`"* — honest provenance, and the
IPC gap may be growth rather than error. **This run did not establish which**, and says so. What
is flagged is `TASKS.md:127` repeating them without the qualifier, where a reader would size a
mobile port from them.

C5–C10 are all the same shape and the dispatch predicted it: **the GrammarX plan's corpus
figures are stale by a wide margin in both directions**, because the corpus grew (Chinese
82 → 599) and a classification pass landed after the doc was written. Every number in
`GRAMMARX_REDESIGN_PLAN.md` §2 and §8 should be treated as unverified until re-derived.

### 3.3 The four `GRAMMARX_REDESIGN_PLAN.md` §7.1 defects — settled

The dispatch asked whether the four live defects of 2026-07-19 are still in the code.

| # | §7.1 defect | Verdict now | Evidence |
|---|---|---|---|
| 1 | "No category" chip reads 0 while 852 records have none | **Routing logic unchanged; the number is obsolete.** `issueFor` is still the same first-match-wins chain (`grammarCuration.ts:66-72`), so the chip is still a **residual, not a census** — the original structural criticism stands. But the corpus now has **0** uncategorized records, so both figures read 0 and the "0 of 852" remedy the doc proposes would print "0 of 0". | `grammarCuration.ts:66-72`; `node tools/grammar-audit.cjs` |
| 2 | Filter-sidebar label/count collisions | **Addressed in CSS; needs a live check to close.** `.gx-filters-group-head` is now `display:flex; gap:6px` (`styles.css:7089-7093`), `.gx-filters-group-count` is `flex:0 0 auto; margin-left:auto` (`:6978-6983`), and `.gx-filters-label` carries `float:none; width:auto` (`:6890-6901`) — the standard fixes for exactly the two reported collisions. `git log -L7089,7092:src/renderer/styles.css` dates that block to **2026-07-21**, after the 2026-07-19 pass. **Static only — this run did not render it.** | as cited |
| 3 | Raw `· ja` leaks into the Grammar Test count dialog | **FIXED, and the fix is documented in code.** `GrammarTestModal.tsx:86-91`: *"The setup screen used to append the raw study-language code to its hint ('· ja') … the pool is already filtered by the time it arrives here."* `initialFilters` is accepted and no longer read. | `GrammarTestModal.tsx:86-92` |
| 4 | Saved-filter dropdown resets its label after loading a preset | **STILL PRESENT.** `GrammarExplorer.tsx:337` hardcodes `value=""` on the `<select>`, so after `applyPreset(p)` at `:341` the control returns to the placeholder `option value=""` at `:344`, which renders `t('grammar.explorer.presets')` = `'Saved filters…'` (`catalogs/en.ts:2390`). Nothing writes the applied preset id back to the select. | `GrammarExplorer.tsx:334-350` |

**So: 1 fixed, 1 fixed-but-still-listed-as-open, 1 structurally unchanged with an obsolete
number, 1 unfixed** — and §7.1 presents all four as open. See §7 for the proposed correction.

### 3.4 The Game Arena translation contradiction

Re-derived rather than repeated: **109 + 200 = 309 English strings are spread verbatim into all
four language catalogs.** `tools/i18n-check.cjs` passes because it checks *presence*, not
*translation* — which `TASKS.md:74` itself says, in the same document that ticks the feature.

The claims this contradicts are enumerated in `PROMISE_REGISTER.md` rows `B6-P12`–`B6-P14`.

---

## 4. Structural findings about the document set

### 4.1 `MASTER_PLAN.md` makes no status claims — and that is the headline

`Select-String -Path docs/MASTER_PLAN.md -Pattern '\[x\]|\[ \]|✅|❌|DONE|SHIPPED|complete|implemented'`
→ **12 hits in 1,936 lines, and every one is the ordinary English word "complete"/"completed"
used descriptively** (e.g. `:1682` "Create a complete Visual Novel module", `:1720` "Status:
Planned, Reading, Completed" as VN tracker vocabulary).

**There is not a single tick, checkbox or done-marker in the entire roadmap.** It is a pure
specification. That means:

- `MASTER_PLAN.md` **cannot** contain a `SILENTLY-DROPPED` promise in the strict sense, because
  it never claimed anything was built. It is a wish list that is honest about being one.
- Every false "shipped" signal about the roadmap therefore lives in the **status layer**:
  `TASKS.md` §"Japanese Study OS master roadmap", the `PHASE_*_STATE.md` ledgers, and
  `FEATURE_PARITY_LEDGER.md`. That is where this register concentrates.

This is a genuinely good result and it should be said as clearly as the defects.

### 4.2 `featureStatus.ts` is the most honest artifact in the repository

`src/renderer/components/scraper/featureStatus.ts` registers **49** ids as
`shell` / `untested` / `ready`, renders a coloured dot from each, and its header comment states
the rule: *"promote an entry only after actually exercising it. Anything unlisted reads as
'shell', so forgetting to register is safe."*

Measured: **0 shell · 21 untested · 28 ready.** The `28` matches its own 2026-07-29 note
(*"28 of 28 entries hold"*) exactly.

It also records, in comments, that it was once the opposite: *"Before that pass every entry read
'ready' while every screen was drawing sample data — the registry was the least honest thing in
the app"* (`:17-20`). And on 2026-08-02 it resolved two entries **by deleting the surface**
rather than promoting it (`:41-61`).

**This file is the template for what the rest of the audit is asking for**, and it is worth
naming as such rather than only cataloguing failures.

### 4.3 …and it is also where the highest-exposure defect is

The same file's honesty is field-level in the comments and only **group**-level in the UI. It
says so itself (`:173-175`): *"Where a group has a field that is still inert, the comment says
which — the honest unit is the field, and a group-level dot cannot express that on its own."*

Sixteen named fields are rendered as live controls in shipping Settings UI and have **no
consumer**. Full derivation, positive control and per-field counts: `PROMISE_REGISTER.md` row
`B6-P01`.

---

## 5. What was marked `SHIPPED-UNVERIFIED`, and what must be driven

Per dispatch §3, this run **cannot** emit `SHIPPED-VERIFIED` or `SHIPPED-DEAD`. Every promise
whose code exists but whose liveness is unknown is `SHIPPED-UNVERIFIED` with a named surface.

| Register id | Promise | Surface a later probe must drive |
|---|---|---|
| `B6-P01` | 16 inert scraper settings fields | Scraper ▸ Settings drawer ▸ Performance / Extraction / Metadata / Images; **and** Settings ▸ Scraper page (`ScraperPage.tsx:583-592`), which renders the extraction five a second time |
| `B6-P02` | Game Arena renders 309 English strings under every UI language | Game Arena with UI language set to `ja`, then `ru` |
| `B6-P05` (2) | GrammarX §7.1 defect 2 — sidebar label/count collisions | Grammar ▸ Explorer **and** Grammar ▸ Practice filter sidebars, RU locale worst case |
| `B6-P05` (4) | GrammarX §7.1 defect 4 — saved-filter label reset | Grammar ▸ Explorer ▸ saved-filter `<select>` |
| `B6-P22` | Visual Novel platform (§15) — 10 panels, 1 entry point | Immersion ▸ "Visual Novel Library" (`ImmersionView.tsx:346`) → all 10 panels |
| `B6-P24` | Blanc Pillar 0 / Pillar 1 (unchecked in `TASKS.md`, delivered in the tree) | Blanc window ▸ dictionary / grammar / reading / resources / calendar tools |
| `B6-P26` (5) | §20 Theme Studio — 3 token families emitted and editable, read by nothing | Settings ▸ Appearance ▸ Theme Studio |
| `B6-P26` (6) | §2 Connection Profiles — panel claims to say "no data" rather than a confident 0% | Settings ▸ Scraper ▸ Connection Profiles panel, 8 cards |
| `B6-P26` (2) | Calendar Week/Day are agenda lists, not hour grids | Calendar ▸ Week, Calendar ▸ Day |
| `B6-P26` (4) | Immersion Browser v0.5+ — multi-tab, mine-all, shadowing | Immersion, all 3 browser modes |

Items `B6-P26` (5) and (6) are the two most likely to promote into Tier 1 (shipping-UI copy) once
driven: both concern controls a user can change on a settings surface.

**None of these is reported as working or as broken by this run.** They are reported as *not
measured*, which per `honesty-probe` §4 is a result rather than an omission.

---

## 6. What could not be verified — stated plainly

This section is deliberately not empty.

1. **Every liveness question.** Static analysis cannot distinguish "wired and working" from
   "wired and silently failing". Nine promises above carry a named surface for that reason.
2. **`NEXT_SESSION.md` beyond the searched terms** (§2.3). ~7,000 lines, term-searched, not read.
3. **`progress.json`** was read for its slice/gate structure, not reconciled row by row against
   the tree. It is machine-generated and 3,297 lines.
4. **Prose bodies of `MASTER_PLAN.md` §3–§12** (Parts II–III) — heading depth only (§2.2). The
   `FEATURE_PARITY_LEDGER` rows for those sections are therefore repeated with their provenance
   rather than independently re-derived, **except** the two rows whose sources this run did
   re-measure (C2, C3).
5. **Whether the GrammarX §7.1 sidebar fix actually renders correctly** (§3.3 row 2). The CSS
   contains the right declarations; only a render proves the collision is gone.
6. **`tsc --noEmit`** was not run and is not a gate (`jp-dispatch` §4). No type-safety claim is
   made anywhere in this package.
7. **The 2026-07-19 date on the §7.1 defects could not be tied to a commit** — the plan document
   states it; this run did not verify that a live pass occurred on that date.

---

## 7. Proposed corrections — **not applied**

Dispatch §7 forbids editing plan documents. These are proposals for the user to rule on.

| Document | Line(s) | Proposed change |
|---|---|---|
| `GRAMMARX_REDESIGN_PLAN.md` | 943-965 (§7.1) | Mark defect **3 fixed** (cite `GrammarTestModal.tsx:86-91`); mark defect **2 addressed in CSS, pending a live re-check**; keep **4 open**; rewrite **1** to drop "852" and state the criticism that survives (the chip is a residual labelled as a census). |
| `GRAMMARX_REDESIGN_PLAN.md` | §2, §8 (esp. 971-995) | Every corpus figure is stale (C5–C10). Replace with `tools/grammar-audit.cjs` output and **add the command beside each number** so the next reader re-derives instead of quoting. |
| `docs/migration/FEATURE_PARITY_LEDGER.md` | 13, 45, 74 | 60 → **49** ids; "5 ready / 4 untested / 11 shell" → **5 / 14 / 0**; "11 components" → **10**. |
| `TASKS.md` | 35, 44, 74 | `catalogs.ts` → the per-language `catalogs/` layout; `i18n-check.mjs` → `.cjs`; note that `GAME_ARENA_CHROME` moved to `catalogs/gameArena.ts`. |
| `TASKS.md` | 117 | "Still pending (4)" → **3**; `subtitleMatching` has a consumer (`main/subtitleDiscovery.ts:23`). |
| `TASKS.md` | 38 | "~49-entry `SETTINGS_REGISTRY`" → **100** entries (19 pages + 81 cards). |
| `TOOLBOX_COMPLETION_AUDIT.md` | 19, 29-32, 65, 67, 86 | Reconcile to **one** total: **58 modules — 37 ready / 20 adapter-needed / 1 experimental**. Four different figures currently coexist in one document. |
| `TOOLBOX_COMPLETION_AUDIT.md` | 36 | Drop "a `planned` status that does not exist in the schema" — it does exist (`toolboxRegistry.ts:1`); the true statement is that no module uses it. |
| `docs/mobile/M01_CAPABILITY_RELEASE_MATRIX.md` | 11, 46, 168 | 25 sections → **23** switch cases / 24 union members; 26 widgets → **27**. Keep the `a31fd8a` provenance note. |
| `TASKS.md` | 127 | Carry M01's "code-derived at `a31fd8a`" qualifier through, or re-derive. |
| `docs/audit/CENSUS_NAVIGATION.md` | 164 | "9 `shared/visualNovel*.ts` modules" → **8**. |

---

## 8. Documents this run would **not** publish as written

Separated out because it is the user's ruling, per dispatch §8. The test applied is narrow:
**would an outside reader, reading only this document, come away believing something about the
product that is not true?**

| Document | The specific claim that would mislead | Why it misleads |
|---|---|---|
| **`GRAMMARX_REDESIGN_PLAN.md`** | §8's entire "Known limitations" block, and §7.1's four "surviving defects" | Six figures are wrong by large margins in **both** directions (C5–C10). A reader is told the Chinese corpus is 82 points when it is 599, that nothing is verified when 64 records are, and that 38.3% are uncategorised when none are. A document whose own headline is *"a number whose meaning is set by the query behind it"* publishing six unre-derived numbers is the defect it was written to name. |
| **`TASKS.md`** | The Game Arena entry: `[~] Phase 3 + 3.5 … code complete` at `:60`, against `:74` *"the Arena is not actually translated"* | The tick is at the top of a 16-line block; the contradiction is buried at line 15 of it. A reader scanning statuses sees a shipped multilingual feature. **309 strings are English in all four languages.** |
| **`TASKS.md`** | `:15-18`, `:31`, `:50`, `:75` — "Verified: compiles + boots", "Verified: 216 tests pass", "**user visual/click test still pending**" | The document repeatedly uses "Verified" for *the suite passed and the app booted*, then admits in the same entries that nobody drove the UI. `:75` says it outright: *"Not done: driving the Electron UI by click — same recurring environment limitation as every other phase."* The word "Verified" is doing work the evidence does not support. |
| **`docs/migration/FEATURE_PARITY_LEDGER.md`** | The totals line `:93-94`: *"22/22 sections mapped · 255/255 subsections accounted · 0 unaccounted"* | **255/255 is true and 255 was re-derived — but "accounted" means *assigned an owner*, not *built*.** `:29-32` says so honestly two paragraphs earlier ("Per-subsection rows are filled when that section's phase opens, not now"). A reader who reaches the bold totals first reads 255/255 as coverage. The fix is one clause in the totals line, not a rewrite. |
| **`EXTENSION_AUDIT_REPORT.md`** | `:360` *"Production-capable, known limitations closed"* | Qualified correctly in the same sentence and at `:461` (two fixes "verified by tracing … not by a live click-through"), but the bolded verdict line is what gets quoted. Same shape as the row above. |
| **`TOOLBOX_COMPLETION_AUDIT.md`** | Four mutually exclusive registry totals — `:19`/`:29-32` say 56 modules and 35 ready, `:65` says "all 50 registry entries", `:67` and `:86` say 30 ready | A reader cannot learn how big the Blanc Toolbox is from the document whose title is *Completion Audit*. Measured: **58 — 37 ready / 20 adapter-needed / 1 experimental.** The document already corrects itself twice (`:34-39`, `:104-111`) and each correction left the previous figure in place elsewhere. It also asserts one thing that is simply false (`:36`, the `planned` status). |

**Not on this list, deliberately:** `docs/MASTER_PLAN.md`. It contains no status claims at all
(§4.1), so publishing it as a roadmap is honest. `featureStatus.ts` is not a document, but if it
were, it would be the model (§4.2).

---

## 9. Defects noticed in code I do not own — recorded, not fixed

| # | Defect | Location |
|---|---|---|
| 1 | Saved-filter `<select>` is a controlled component pinned to `value=""`, so it can never show the applied preset | `GrammarExplorer.tsx:337` |
| 2 | 16 scraper settings fields are persisted and validated but read by nothing | see `PROMISE_REGISTER.md` `B6-P01` |
| 3 | `shared/episodeProcessing.ts` is imported only by its own test, yet 5 shipping settings controls write into the shape it consumes | `episodeProcessing.ts`; `settings/fields.ts`; `ScraperPage.tsx:583-592` |
| 4 | VN feature UI is entirely raw English literals — direct `CLAUDE.md` i18n-workflow violation (already recorded by B0; repeated here because it is also a promise-register row) | `ImmersionView.tsx:346-349` |

---

## 10. Gate results

Measured this run, as totals (`jp-dispatch` §5). **No baseline delta is claimed and none could
be** — this run changed no file under `src/`, so any drift is someone else's.

| Gate | Command | Result this run |
|---|---|---|
| Architecture | `node tools/architecture-audit.cjs` | **exit 0.** Scanned **1,354** modules, **18** findings — `duplicate-export` 7 (0 pending), `duplicate-storage` 3 (0 pending), `orphan-module` 1 (0 pending), `test-only-module` 7 (**3 pending**). *"Nothing new."* |
| Grammar | `node tools/grammar-audit.cjs` | ran to completion; **2,744** points (ja 2,145 / zh 599); `grammar-audit.json` written. Full figures in §3.2 |
| Blanc drift | `node tools/blanc-drift.cjs` | **exit 0.** 24 Study OS sections, 42 Blanc tools, 42 render branches; **1** tracked pending gap (`scraper`, Pillar 2); *"No unclassified drift and no Pillar 0 violations."* |

**Not run, and why:** `npx vitest run`, `node tools/i18n-check.cjs`,
`node docs/migration/tools/audit-carried-items.mjs` and the license gate were not run. This
package changed no source, no catalog and no carried item, so none of them can be affected by it,
and `jp-dispatch` §4 says to run the gates a change can plausibly affect. The three above were run
because they are *evidence for findings*, not because this run could break them.

**`npx tsc --noEmit` was not run and is not a gate** (`jp-dispatch` §4). No type-safety claim is
made anywhere in this package.

---

## 11. Open questions for the user

1. **§7's corrections** — apply them, or leave the plan docs as historical records with a dated
   "figures superseded" banner? The second is cheaper and arguably more honest for a document
   that is a record of a session.
2. **§8's publication list** — four of the five entries are fixable with one sentence each. The
   `GRAMMARX_REDESIGN_PLAN.md` entry is not; it needs its numbers regenerated.
3. **The 16 inert scraper fields** (`B6-P01`) — `honesty-probe` §6 says disable and label, not
   build the backend. Confirm that is the intended resolution before a later wave acts on it.
   Note that `featureStatus.ts` has already set the precedent twice: on 2026-08-02 it resolved two
   entries **by deleting the surface** (`:41-61`).
4. **The Visual Novel platform** (`B6-P22`) — the largest unrecorded body of work in the tree:
   ~4,800 lines across 10 panels, 8 shared modules and a 1,073-line main module, behind **one**
   un-i18n'd button, claimed by **no** planning document. `honesty-probe` §6's Probe-F ladder
   offers *promote* / *polish* / *hide* and makes `hide` the default consideration before
   publication. **This is a product call, not an audit call.**
5. **Phase 9.5, the Miku guided tour** (`B6-P10`) — the plan calls it "the last phase before
   release" and nothing exists. Is it dropped, deferred, or still intended? Whichever it is, the
   plan document currently says the third and the tree says the first.
6. **`TASKS.md`'s "Verified"** (`B6-P18`) — proposal is to split the word: **"Verified"** for
   driven-and-observed, **"Checked"** for suite-and-build. That is a convention change across a
   128-line document and needs your agreement before anyone edits it.
