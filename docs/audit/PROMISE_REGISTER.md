# PROMISE_REGISTER — what the plans claim vs what the tree contains

**Wave B6. Static analysis only; the app was never started.** Measured against `68b25dc` on
`audit/a-evidence`, 2026-08-04.

Classification vocabulary is `honesty-probe` §8. **This run cannot emit `SHIPPED-VERIFIED` or
`SHIPPED-DEAD`** — both require driving the app, which the dispatch forbids. Where a promise's
code exists but liveness is unknown the row reads **`SHIPPED-UNVERIFIED`** and names the surface
a later probe must drive.

Every count below was re-derived by this run. Where a source document's number disagreed with the
tree, the tree wins and the disagreement is the finding.

---

## 0. Denominator

| Source | Unit | Count | How measured |
|---|---|---:|---|
| `docs/MASTER_PLAN.md` | `##` sections | 26 (22 numbered) | `Select-String '^## '` |
| `docs/MASTER_PLAN.md` | `###` subsections | **255** | `Select-String '^### '` |
| `docs/MASTER_PLAN.md` | bullet requirements | **706** | `Select-String '^\s*[-*] '` |
| `docs/IMPLEMENTATION_PLAN_V1.01.md` | `## Phase` headings | **17** | `Select-String '^## Phase'` |
| `TASKS.md` | `- [x]/[~]/[ ]` checklist entries | 24 | `Select-String '^- \[.\]'` |
| Plan documents opened | files | **68** | see `HANDOFF_B6_PROMISES.md` §2.1 |

**Coverage of `MASTER_PLAN.md`: structure 100%, prose ~⅓ and non-randomly chosen.** Stated
because the dispatch asked; the reasoning is in the handoff §2.2. The short version: this file
carries **no status markers at all**, so heading depth is sufficient to classify it (§4.1).

**Rows below: 22 numbered ids** — `B6-P01`–`B6-P05` and `B6-P10`–`B6-P26`. **The gap at
`P06`–`P09` is deliberate**: those ids were assigned during drafting and their subjects folded
into `B6-P05` (the four GrammarX §7.1 defects) and `B6-P26`. Ids are stable and cross-referenced
from `HANDOFF_B6_PROMISES.md`, so they were not renumbered. Two rows carry sub-items:
`B6-P05` has 4, `B6-P26` has 7.

Not every one of 255 subsections has a row — that would be a different document. Rows were
selected by the dispatch's ranking: anything a user reads in the app first, then anything a
published document asserts, then internal plans.

---

## A. Tier 1 — claims a user reads inside the running app

These outrank everything below them. A stale tick in a planning file is housekeeping; a false
statement in shipping UI is a defect against the user.

### A.1 · `B6-P01` — 16 scraper settings controls that nothing reads

`SHIPPED-PARTIAL` · **the highest-value row in this register**

`src/renderer/components/scraper/featureStatus.ts` names, in comments, the exact fields inside
`untested` settings groups that have **no consumer**. This run took that list at its word only
after re-deriving it — and it holds.

**Method, with the positive control that makes the zeros meaningful.** For each field: confirm it
is rendered as a control (`path: '<group>.<field>'` in `settings/fields.ts`), then count sites
across all of `src` excluding tests, the field definition, and the validator/defaults modules
(`scraperSettings.ts`, `scraperOutputSettings.ts`, `connectionProfiles.ts`).

`verifySsl` is the control: the same comment block says it *is* consumed but unproven, and the
probe finds **6** sites (`http.ts:312,449,453,483`, `networkPolicy.ts:104`, `ScraperPage.tsx:320`).
The instrument finds consumers when they exist.

| Group | Field | Rendered | Consumer sites | Verdict |
|---|---|:-:|:-:|---|
| `performance` | `maxParallelDownloads` | ✓ | 0 | orphan |
| `performance` | `memoryBudgetMb` | ✓ | 0 | orphan |
| `performance` | `cpuThrottlePercent` | ✓ | 0 | orphan |
| `performance` | `reuseBrowserContext` | ✓ | 0 | orphan |
| `performance` | `prefetchNextPage` | ✓ | 0 | orphan |
| `metadata` | `mergeStrategy` | ✓ | 0 | orphan |
| `metadata` | `fetchStaff` | ✓ | 0 | orphan |
| `images` | `minWidth` | ✓ | 0 | orphan |
| `images` | `minHeight` | ✓ | 0 | orphan |
| `images` | `skipDuplicatesByHash` | ✓ | 0 | orphan |
| `images` | `namingTemplate` | ✓ | 0 | orphan |
| `extraction` | `cssSelectors` | ✓ | 1 → `episodeProcessing.ts:59` | **two-hop dead** |
| `extraction` | `xpathSelectors` | ✓ | 1 → `episodeProcessing.ts:67` | **two-hop dead** |
| `extraction` | `regexPattern` | ✓ | 2 → `episodeProcessing.ts:81-82` | **two-hop dead** |
| `extraction` | `regexFlags` | ✓ | 1 → `episodeProcessing.ts:82` | **two-hop dead** |
| `extraction` | `attribute` | ✓ | 2 → `episodeProcessing.ts:87-88` | **two-hop dead** |

The five `extraction` fields deserve their own note. Their only consumer is
`src/shared/episodeProcessing.ts` — and **that module is imported by nothing but its own test**:

```
Select-String -Path <all src *.ts,*.tsx> -Pattern "from '.*episodeProcessing'"
→ src\shared\__tests__\episodeProcessing.test.ts:4     (one hit, and it is the test)
```

`node tools/architecture-audit.cjs` classifies it as one of **3 pending `test-only-module`**
findings (exit 0, "Nothing new. 3 known finding(s) still marked pending"). So the chain is
*control → settings document → a module nothing calls*. A user changing "CSS Selectors" in the
Scraper's Extraction settings is configuring a code path the app does not execute.

**Where this is honest and where it is not.** `featureStatus.ts` is explicit — it names every one
of these fields in comments and says why (`:186-214`). What the *user* sees is a group-level
amber "untested" dot. The file states the gap itself (`:173-175`): *"the honest unit is the field,
and a group-level dot cannot express that on its own."* The defect is that the honesty stops at
the source file and does not reach the screen.

```
| B6-P01 | promise-register | Scraper ▸ Settings drawer ▸ Performance/Extraction/Metadata/Images | E |
  group status dot reads "untested" (implemented, believed to work) over 16 fields with no consumer |
  each field confirmed rendered via `path:` in settings/fields.ts; consumer count across src
  excluding tests+validators = 0 for 11, and 1-2 into a test-only module for 5;
  positive control `verifySsl` -> 6 sites | NOT-REACHABLE (not driven) |
  featureStatus.ts:186-214; settings/fields.ts; shared/episodeProcessing.ts | major |
  src/renderer/components/scraper/** |
```

**Second surface, same fields.** The five `extraction` fields are rendered a *second* time in the
main Settings app at `ScraperPage.tsx:583-592`. Both surfaces need driving.

**Surface a later probe must drive:** Scraper ▸ Settings drawer (4 categories) **and** Settings ▸
Scraper page. Resolution per `honesty-probe` §6 is *disable and label*, not *build the backend* —
confirm with the user before acting (handoff §11.3).

---

### A.2 · `B6-P02` — Game Arena ships English to all four languages

`SHIPPED-PARTIAL`

| Claim | Where | Verdict |
|---|---|---|
| "Phase 3 + 3.5: Game Arena platform, baseline games, Mirror Writing — **code complete**" | `TASKS.md:60` | contradicted 14 lines later by the same document |
| "**Noticed, NOT fixed** — the Arena is not actually translated" | `TASKS.md:74` | **CONFIRMED, and larger than stated** |
| "`node tools/i18n-check.cjs` clean … the ~57 `games.*` keys were already complete" | `TASKS.md:75` | true and misleading — the checker tests *presence*, not translation |

Re-derived:

- `GAME_ARENA_CHROME` — **109** keys (TypeScript AST count of the object literal in
  `catalogs/gameArena.ts`; regex cross-check on `^  '` agrees at 109).
- `MOONCAP_PHASE_LORE` — **200** keys. The literal has **50** properties, each a
  `...phase(stage, …)` spread emitting **4** keys (`mooncapLore.ts:14-19`). A naive property count
  returns 50 and would have been reported here as a correction to the dispatch; it is not one.
- Spread into **all four** catalogs: `en.ts:48-49`, `ja.ts:47-48`, `ru.ts:47-48`, `zh.ts:45-46`.

**309 English strings render identically whether the UI language is English, Japanese, Chinese or
Russian**, and the i18n gate is green because they are present in all four files.

`TASKS.md:74` says this outright — *"a real Phase 2 hole hiding behind a green check, and it
silently swallows any future `games.*` key too."* The register's objection is placement: that
sentence is line 15 of a 16-line block whose first line is a completion tick.

**Also stale:** `TASKS.md:74` locates `GAME_ARENA_CHROME` "in `catalogs.ts`". Since 2026-07-21 it
lives in `shared/i18n/catalogs/gameArena.ts` and `catalogs.ts:36` only re-exports it.

**Surface to drive:** Game Arena with UI language set to `ja`, then `ru`.

---

### A.3 · `B6-P03` — a downloadable asset advertises a feature that does not exist

`SHIPPED-PARTIAL` · severity **minor**, and the reason it is minor is worth stating

`src/shared/assetRegistry.ts:524-537` publishes an asset the user can download from
Settings ▸ Models & dictionaries:

> **Pitch accent (Kanjium)** — *"Pitch-accent contours for **the pronunciation checker**. Not part
> of JMdict."*

**There is no pronunciation checker.** See `B6-P11`.

**But the asset is not dead**, and this run checked before filing. `kanjium-accent` is genuinely
consumed — by the `{pitch}` mining field (`shared/pitchAccent.ts`, `profileFields.ts:267`), by the
dictionary popup path (`main/dictionary/yomitan.ts:571-638`), and by the Blanc pitch-accent panel
(`BlancStudyNativePanels.tsx:741`, `toolboxRegistry.ts:656-660`). So this is **a misleading label
on a working download**, not a fabricated one. Filed as minor for exactly that reason.

Correct copy would name the three features that do read it.

---

### A.4 · `B6-P04` — the Visual Novel entry point is a raw English literal

`SHIPPED-PARTIAL` · cross-referenced with `B6-P12`

`ImmersionView.tsx:346-349` renders the only non-excluded path into the entire VN platform, and
its label is the string literal `Visual Novel Library` — not a `t()` call. The feature has **zero
i18n keys of its own**: the sole `visualNovel` key in the catalogs is
`blanc.agent.operations.group.visualNovel` (`catalogs/en.ts:5420`), which belongs to Blanc.

This is a direct violation of `CLAUDE.md`'s i18n workflow — *"never a raw string literal in JSX"*.
Already recorded by B0 (`HANDOFF_B0_CENSUS.md:186`); repeated here because it is also the visible
tip of the promise in `B6-P12`.

---

### A.5 · `B6-P05` — GrammarX §7.1's four live defects, settled

Mixed. Full derivation in `HANDOFF_B6_PROMISES.md` §3.3.

| §7.1 | Defect | Now |
|:-:|---|---|
| 1 | "No category" chip reads 0 against 852 uncategorised | **structurally unchanged, number obsolete.** `issueFor` is the same first-match-wins chain (`grammarCuration.ts:66-72`) so the chip is still a residual presented as a census. But `node tools/grammar-audit.cjs` reports **0 uncategorized records (0.0%)**, so the doc's proposed fix ("show `0 of 852`") would now print `0 of 0`. |
| 2 | Filter-sidebar label/count collisions | **addressed in CSS, unproven live.** `.gx-filters-group-head` `display:flex; gap:6px` (`styles.css:7089-7093`); `.gx-filters-group-count` `flex:0 0 auto; margin-left:auto` (`:6978-6983`); `.gx-filters-label` `float:none; width:auto` (`:6890-6901`). `git log -L7089,7092:src/renderer/styles.css` dates the block to **2026-07-21**, after the 2026-07-19 pass. |
| 3 | Raw `· ja` in the Grammar Test count dialog | **FIXED**, with the fix documented in code: `GrammarTestModal.tsx:86-91` explains that `initialFilters` is now accepted-but-unread precisely because the hint "used to append the raw study-language code". |
| 4 | Saved-filter dropdown resets its label | **STILL PRESENT.** `GrammarExplorer.tsx:337` pins `value=""` on the `<select>`; `applyPreset(p)` at `:341` never writes the id back, so the control returns to the placeholder `<option value="">` at `:344` = `'Saved filters…'` (`catalogs/en.ts:2390`). |

**§7.1 presents all four as open. One is fixed, one is very likely fixed, one has an obsolete
number, one is real.** Proposed correction in the handoff §7.

---

## B. Tier 2 — claims in documents that would be published

### B.1 · `B6-P10` — Phase 9.5, the Miku first-boot guided tour · **`SILENTLY-DROPPED`**

**The clearest instance of the category the dispatch called highest-value, and the headline row of
this register.**

`docs/IMPLEMENTATION_PLAN_V1.01.md:512-537` specifies it in full: guide character, declarative
tour engine, the tour content doubling as first-run setup, skip/replay controls, motion-mode
respect, six named pitfalls, an **Accepts when** clause, and named files:

> **Files:** `onboarding/tourScript.ts`, `onboarding/TourOverlay.tsx`, Miku voice profile in the
> companion system, Help section in `settingsRegistry.ts`.

It is titled **"(last phase before release)"**.

**Measured — none of it exists:**

| Probe | Result |
|---|---|
| `Get-ChildItem src -Recurse -Include 'tourScript*','TourOverlay*'` | **0** |
| `Test-Path src/renderer/onboarding` | **False** |
| `Select-String` over all `src` `*.ts,*.tsx` for `\btour\b\|Tour[A-Z]\|guidedTour\|onboarding` | **8 hits, every one study content** — "tournament", "the tourists", "Tourism and residents" (`gradedSentences/index.ts:408`, `grammar/n1-extra.ts:83`, `mirrorTexts/index.ts:908`) |
| Help page in `SETTINGS_NAV` | **absent** — the 20 ids are `home, appearance, wallpaper, atmosphere, companions, desktop-layout, shortcuts, mini, lockscreen, study, profile-rules, reading, transcription, scraper, visualizer, special, display, motion, storage, memory` |
| **Positive control** — `CompanionLayer` (Phase 4, known present) | **8 hits**, correctly found |

**And `TASKS.md` never mentions it.** The Road-to-v1.01 checklist stops after Phase 3+3.5; there
is no `[ ] Phase 9.5` line to be unchecked. The plan still reads as a live commitment; nothing
records it as abandoned.

### B.2 · `B6-P11` — Phase 7, the pronunciation checker · `NOT-SHIPPED`, drifting toward dropped

`docs/IMPLEMENTATION_PLAN_V1.01.md:442-463`. The plan is honest at the top —
*"**Build-order note:** **postponed** until after Phase 6.5"* — which is why this is `NOT-SHIPPED`
and not `SILENTLY-DROPPED`.

Measured: **21** `pronunciation` hits in `src`, and not one is the specified feature. They are TTS
playback (`DictionaryPopup.tsx:74-98`, `keyboardShortcuts.ts:333` — Phase 3's "Play
Pronunciation"), an Anki field-mapping regex (`FieldMappingEditor.tsx:32`), study content, a
storage group label, and `assetRegistry.ts:527` (see `B6-P03`). There is no record→transcribe→
score→per-mora-highlight flow, no "Practice" button, no Pronunciation section under Study, no
attempt history.

It degrades toward `SILENTLY-DROPPED` because it is also absent from the `TASKS.md` checklist — see
the next row.

### B.3 · `B6-P12` — the v1.01 checklist tracks 6 of 17 phases · `SILENTLY-DROPPED` (cluster)

`docs/IMPLEMENTATION_PLAN_V1.01.md` has **17** `## Phase` headings. `TASKS.md`'s "Road to v1.01"
section carries **5 checklist lines** covering **6** phases (0.5, 6, 2, 1, 3, 3.5) — the list
simply stops and the document moves on to "Game Arena rework".

Three more carry a status inside the plan itself: Phases **6, 8, 9** are marked `— DONE` in their
own headings (`:399`, `:469`, `:488`).

**That leaves 9 phases with no status in any document:**

| Phase | Title | Probe of the tree |
|---|---|---|
| 4 | Shimeji companions + routines + beep speech | **present** — `CompanionLayer.tsx` etc., 132 hits |
| 4.5 | Motion Design & System Animations | **present** — `MotionModeId`/motion settings, 20 hits |
| 5 | Manga OCR replacement + on-image translation overlay | partial — `mangaOcr:recognizeImage` exists (`TOOLBOX_COMPLETION_AUDIT.md:109`); the overlay was not resolved by this run |
| 5b | Transcription upgrade + Media/Video split | **present** — the Media/Video split is in the section census |
| 6.5 | Stabilization pass 1 | not resolved by this run |
| **7** | **Pronunciation checker** | **absent** — `B6-P11` |
| **9.5** | **Miku first-boot guided tour** | **absent** — `B6-P10` |
| 10 | Final hardening, packaging, v1.01 | partial — packaging artifacts exist under `out/`; the plan's open-source compliance audit and About-page attribution were not resolved by this run |
| 11 | Data portability & resiliency | partial — 6 backup/restore hits; not resolved |

The pattern is not "nothing was built" — most of these shipped. The pattern is that **the tracking
document stopped tracking**, so a reader cannot tell built from dropped without doing what this
run just did. Two of the nine are genuinely absent.

### B.4 · `B6-P13` — `FEATURE_PARITY_LEDGER.md` totals read as coverage

`SHIPPED-PARTIAL` (as a document claim)

The bolded totals at `:93-94`:

> **Totals: 22/22 sections mapped · 255/255 subsections accounted · 0 unaccounted · 0 proposed
> retirements without a gate.**

**255 is correct** — re-derived, `Select-String '^### ' docs/MASTER_PLAN.md` → 255. So is 706
bullets (`:12`) and 22 sections.

The problem is the word *accounted*, which here means **assigned an owner and a disposition**, not
**built**. The document says so honestly two paragraphs earlier (`:29-32`: *"Per-subsection rows
are filled when that section's phase opens, not now"*) — but a reader who lands on a bold
`255/255` line reads it as coverage. **One clause fixes it**, not a rewrite.

### B.5 · `B6-P14` — three `FEATURE_PARITY_LEDGER.md` counts are stale

`RENAMED/SUPERSEDED` (the underlying registry moved)

| Line | Claim | Measured | Command |
|---|---|---|---|
| `:13` | `featureStatus.ts` registers **60** feature ids | **49** | count of `FEATURE_STATUS` entries |
| `:45` | §1 Advanced Settings: "5 ready, 4 untested, **11 shell**" | `set.*` = **5 ready, 14 untested, 0 shell** | same, grouped by id prefix |
| `:74` | §15: "`immersion/visualNovels.ts` + **11 components**" | **10** VN components (the 11th file in that directory is `ImmersionContent.tsx`) | `Get-ChildItem src/renderer/components/immersion` |

The `:45` row matters most. Its warning — *"11 shell groups persist values nothing reads. Must not
be promoted by adoption"* — describes exactly the risk that then materialised as promotion to
`untested`. The promotion was **not** blind: `featureStatus.ts` names each still-inert field in a
comment (`B6-P01`). But the ledger's guard rail now reads as satisfied when the substance of its
concern is live.

### B.6 · `B6-P15` — `TOOLBOX_COMPLETION_AUDIT.md` carries four different registry totals

`SHIPPED-PARTIAL` (as a document claim)

| Where | Total claimed |
|---|---|
| `:19` and the table at `:29-32` | **56** modules — 35 ready / 20 adapter-needed / 1 experimental |
| `:65` section heading | "all **50** registry entries" |
| `:67` note | "the registry is now **30 ready** / 20 planned" |
| `:86` table row | "**30** `adapter-needed` modules" |

**Measured: 58 modules — 37 `ready`, 20 `adapter-needed`, 1 `experimental`.**
38 explicitly written entries (`^\s{4}id: '` → 38) plus 20 generated by `plannedModules([...])`
(`toolboxRegistry.ts:1042-1063`), which hardcodes `status: 'adapter-needed'` at `:1079`.

The document is *aware* it drifts — `:34-39` says "both are now stale" about two of its own
figures and explains why. It then leaves a third stale number in a section heading. This is a
document that has been corrected three times and never reconciled.

**Separately, one factual error.** `:36` says the earlier note "used a `planned` status that does
not exist in the schema." It does exist:

```
// src/shared/toolboxRegistry.ts:1
export type ToolboxModuleStatus = 'ready' | 'existing' | 'planned' | 'adapter-needed' | 'experimental';
```

No module *uses* `'planned'` (histogram: 0), so the correction's substance was right and its
stated reason is wrong.

### B.7 · `B6-P16` — `GRAMMARX_REDESIGN_PLAN.md`'s corpus figures

`RENAMED/SUPERSEDED` — the corpus moved under the document

Every figure below re-derived with `node tools/grammar-audit.cjs` (2026-08-04). The plan's own
§1.4 warns about *"a number whose meaning is set by the query behind it"*, which is why this
matters more here than it would elsewhere.

| Plan | Claim | Measured |
|---|---|---|
| `:971` | "**82** Chinese grammar points" | **599** |
| `:986` | "Nothing is `verified` yet … the count stays 0" | **64 verified (2.3%)** |
| `:982` | "**38.3%** of records have no canonical category" | **0%** — 0 uncategorized |
| `:989` | "**2** canonical categories are empty" | **0** — 82 declared, 82 populated |
| `:973` | "**50.0%** of records are a pattern plus an English gloss and nothing else" | **66.3%** (1,820 of 2,744) |
| `:948` | "**852** records genuinely have no category" | **0** |
| `:992` | "Duplicate groups: **0** after the shipped dedupe" | **0** — CONFIRMED |
| `:995` | "N5 has 50 points against N3's 675" | **CONFIRMED** — N5=50, N3=675 |

Totals now: **2,744 points — ja 2,145, zh 599.** Two of the eight hold; six do not, and they move
in both directions. Any reader quoting §2 or §8 quotes something false.

### B.8 · `B6-P17` — `EXTENSION_AUDIT_REPORT.md`'s verdict line

`SHIPPED-PARTIAL` (as a document claim)

`:360` — *"Originally: Production-capable with known limitations. **After §15: Production-capable,
known limitations closed** — two fixes … still await a live click-through."*

The qualification is present, in the same sentence and again at `:461`. The issue is form: the
bolded verdict is the quotable unit and it says "closed", while the evidence for two of the six
fixes is *source tracing and static checks*, not observation. Same shape as `B6-P13` and fixable
the same way.

### B.9 · `B6-P18` — `TASKS.md` uses "Verified" for "the suite passed"

`SHIPPED-PARTIAL` (as a document claim) · this is the document's most systematic issue

`TASKS.md` says "Verified" 40+ times. In most cases what follows is *tests passed, lint clean,
`vite build` clean, app boots* — none of which is `honesty-probe` §1's standard ("the verdict
comes from driving the app and observing a side effect").

The document knows. It says so, repeatedly, in the same entries:

- `:50` — *"**User visual/click test in the running app still pending** (dev Electron isn't
  screenshot-drivable in this environment)."*
- `:75` — *"**Not done: driving the Electron UI by click** — same recurring environment limitation
  as every other phase here; user visual confirmation still owed."*
- `:69` — and when a harness was finally built, *"**THE ARENA WAS VISUALLY VERIFIED FOR THE FIRST
  TIME — and it was badly broken**"*, followed by three severe bugs that every prior green suite
  had missed, including *"the games showed the player the answer"* (`:70`).

`:69-72` is the strongest argument in the repository for why "Verified" should be reserved. The
proposal is not to rewrite history but to split the word: **"Verified"** for driven, **"Checked"**
for suite-and-build.

### B.10 · `B6-P19` — `TASKS.md` i18n claims predate the 2026-07-21 catalog split

`RENAMED/SUPERSEDED`

| Line | Claim | Now |
|---|---|---|
| `:35` | i18n catalogs are `shared/i18n/catalogs.ts` (EN/JA/ZH/RU in one file) | **per-language files** under `shared/i18n/catalogs/`; `catalogs.ts` is a loader. `CLAUDE.md` states this and warns that editing `catalogs.ts` "is almost never what you want" |
| `:44` | the script is `tools/i18n-check.**mjs**` | `tools/i18n-check.**cjs**` — the `.mjs` does not exist |
| `:74` | `GAME_ARENA_CHROME` is "in `catalogs.ts`" | `catalogs/gameArena.ts`, re-exported at `catalogs.ts:36` |
| `:38` | "the ~49-entry `SETTINGS_REGISTRY` search index" | **100** entries — 19 page entries + **81** cards (`CENSUS_SURFACES.md` §4) |

Low severity individually; together they mean a new contributor following `TASKS.md` edits the
wrong file and runs a script that does not exist.

### B.11 · `B6-P20` — `TASKS.md:117`'s pending list is one item long

`RENAMED/SUPERSEDED`

Claim: *"Still pending (**4**), all one honest shape: `csvPaste`, `episodeProcessing`,
`mediaProviderSyncJournal`, `subtitleMatching` are pure layers built and tested with no consumer
yet."*

Measured — **3**. `subtitleMatching` gained a real consumer at `src/main/subtitleDiscovery.ts:23`.
The other three are still imported only by their own tests.

Independently confirmed by the repo's own gate:

```
node tools/architecture-audit.cjs
→ architecture: scanned 1354 modules, 18 finding(s).
    test-only-module 7 (3 pending)
  Nothing new. 3 known finding(s) still marked pending.   exit=0
```

### B.12 · `B6-P21` — mobile `M01`'s code-derived counts

`RENAMED/SUPERSEDED`, partly · asserted as current at `TASKS.md:127`

`docs/mobile/M01_CAPABILITY_RELEASE_MATRIX.md` states its counts are *"code-derived at `a31fd8a`"*
— honest provenance. `TASKS.md:127` then repeats them without the qualifier.

| M01 | Claim | Measured today | Command |
|---|---|---|---|
| `:11`, `:46` | "`AppSection.tsx` — **25** registered app sections" | **23** `case` labels in that switch; **24** in the `DesktopWinSection` union | `Select-String "^\s*case '"` / `"^\s*\| '"` |
| `:168` | "**26** widgets" | **27** | `Select-String "^\s*\{ type: '" src/renderer/widgets/registry.tsx`; positive control `clock-digital` → 1 |
| `:13` | "**~200** IPC channels" | **374** distinct `invoke()` channels in `src/preload.ts`; **379** `ipcMain.handle/on` sites under `src/main/` | `invoke\('([^']+)'` sorted unique |

**The IPC gap is not necessarily an error** — M01 counted at an older commit by a different method,
and the tree grows. It is flagged because `TASKS.md:127` presents "~200 IPC channels in 25 groups"
as a current fact and a reader would size the mobile port from it. **Unverified whether the gap is
growth or method.**

---

## C. Tier 3 — internal planning claims worth recording

### C.1 · `B6-P22` — the Visual Novel platform: 3,000+ lines that no plan document claims

`SHIPPED-UNVERIFIED` · the calibration case, and it inverts

The dispatch predicted the pair shape: *a feature the plans mark done that has one or zero entry
points*. **The VN platform is the opposite** — substantial built code that **no planning document
claims at all**.

Measured:

| Asset | Count |
|---|---|
| Renderer panels (`VisualNovel*.tsx`) | **10** — 2,033 lines |
| `shared/visualNovel*.ts` modules | **8** — 1,683 lines |
| `main/immersion/visualNovels.ts` | 1,073 lines |
| **Total** | **~4,789 lines** |
| Test files (`shared/__tests__/visualNovel*.test.ts`) | **8** |
| **Entry points outside excluded themes** | **1** (`ImmersionView.tsx:346`) |
| i18n keys of its own | **0** |
| `settingsRegistry` entries | **0** |

> **Correction to `CENSUS_NAVIGATION.md:164`**, which says "9 `shared/visualNovel*.ts` modules":
> measured **8** (`Get-ChildItem src/shared -Recurse -Filter '*isualNovel*'` → 8 modules + 8 tests).

**What the plans say.** `docs/MASTER_PLAN.md` §15 (`:1680-1807`) specifies it across **18** `###`
subsections — VN database, sources, local library, engine detection, reading tracker, route/ending
tracker, text extraction, language analyzer, character speech analysis, reading assist, vocabulary
mining, Anki integration, study decks, AI assistant, recommendations, community features,
integration, final goal. It calls text extraction + reading overlay *"the highest-priority
technical feature"* (`:1805-1807`).

**Where it appears in status documents:** `FEATURE_PARITY_LEDGER.md:74` — one row, disposition
"**Retain Study OS**", Phase 5, note *"Outside Seanime scope entirely."* Per-subsection rows are
deliberately unfilled (`:29-32`).

**Where it does not appear:** `TASKS.md` (0 mentions), `docs/migration/NEXT_SESSION.md` (0),
`progress.json` (0), any `src/PHASE_*.md` (0 — the single hit,
`PHASE_5_READING_CONVERGENCE_STATE.md:211`, is about *source aggregation for* visual novels, a
different subject).

```
Select-String -Path <all repo *.md> -Pattern "[Vv]isual [Nn]ovel|visualNovel"
→ docs/migration/**: 1 hit (FEATURE_PARITY_LEDGER.md:74)
→ src/PHASE_*.md:    1 hit (PHASE_5_READING_CONVERGENCE_STATE.md:211, unrelated sense)
```

**So there is no false tick to correct.** The finding is the reverse and it is still a finding: the
most expensive unrecorded asset in the tree sits behind one un-i18n'd button at depth 3, and no
document tells a reader it is there.

```
| B6-P22 | promise-register | Immersion ▸ Visual Novel Library | F |
  MASTER_PLAN §15 specifies 18 subsections; no status document claims any of them |
  10 panels + 8 shared modules + 8 test files + a 1,073-line main module measured;
  entry points outside excluded themes = 1 (ImmersionView.tsx:346); own i18n keys = 0;
  settingsRegistry entries = 0 | NOT-REACHABLE (not driven) |
  CENSUS_NAVIGATION.md §4; docs/MASTER_PLAN.md:1680-1807 | major |
  src/renderer/components/immersion/** |
```

**Surface to drive:** Immersion ▸ "Visual Novel Library" → all 10 panels. Probe-F resolution is
*promote* / *polish* / *hide*, and `honesty-probe` §6 makes `hide` the default consideration
before publication. **Product call, not an audit call** — handoff §11.4.

### C.2 · `B6-P23` — GrammarX Phase 5 (full rename): recorded as deferred, and only once

`NOT-SHIPPED` · **honest — the dispatch's third question, answered clean**

`GRAMMARX_REDESIGN_PLAN.md:900-905` marks it *"Deferred deliberately"* with concrete reasons
(renaming `productName` moves `%APPDATA%\jp-study-app`; renaming the Anki note types
`JP Study App::…` breaks field mappings in an existing collection) and states what it needs.

**No other document claims it.** A repo-wide search for `GrammarX` lines mentioning
rename / `productName` / "Phase 5" returns exactly one hit outside the audit tree — that heading.
`package.json` `productName` is still `jp-study-app`, consistent with the deferral.

Noted without prejudice: `tools/` holds `brand-grammarx.cjs`, `check-grammarx-keys.cjs`,
`fix-grammarx-i18n.cjs`, `inject-grammarx-i18n.cjs` — partial-rename tooling exists. That is not a
contradiction of the deferral, but it is where a later reader will look for one.

### C.3 · `B6-P24` — Blanc: the plan is unchecked and the work landed

`SHIPPED-UNVERIFIED` · understated rather than overstated

`TASKS.md:90` is a single **`- [ ]`** entry holding an eight-pillar plan. Measured against it:

| Pillar | Done-condition as written | Measured |
|---|---|---|
| **0 · Blanc-native UI** | *"nothing in `renderBlancTool` returns a `*View` and no `ui-app-chrome` renders in a Blanc window"* | **met.** `<DictionaryView\|GrammarView\|ReadingFinderView\|ResourcesView\|CalendarView` in `BlancShell.tsx` → **0**; `<AppChrome\|ui-app-chrome` across `components/blanc/*.tsx` → **0** |
| **1 · performance** | split the Blanc entry, record a cold-open + chunk-size budget | `src/renderer/blancMain.tsx` exists; `tools/blanc-budget.cjs` + `blanc-budget.json` exist |
| **tooling** | `tools/blanc-drift.cjs` modelled on `i18n-check.cjs`, committed `blanc-coverage.json`, a `/update-blanc` command | **all three exist** — `tools/blanc-drift.cjs`, `blanc-coverage.json`, `.claude/commands/update-blanc.md` |

```
node tools/blanc-drift.cjs
→ Blanc drift: 24 Study OS sections, 42 Blanc tools, 42 render branches.
  PENDING — known gaps, the work-list (1):  scraper — Pillar 2 …
  No unclassified drift and no Pillar 0 violations.        exit=0
```

The checkbox says nothing has happened. The tree and the repo's own drift gate say Pillar 0 is
closed, Pillar 1 has its budget harness, and the tooling shipped. **An unchecked box on delivered
work is a smaller sin than a checked box on absent work — but it is the same document being
unreliable.**

### C.4 · `B6-P25` — §22 Autonomous QA agent · `NOT-SHIPPED`, correctly labelled

`TASKS.md:120`: *"§22 (autonomous QA agent) is the last unstarted whole section."*

Measured: `autonomousQa|qaAgent|visualRegression` across `src` → **0**.
`FEATURE_PARITY_LEDGER.md:91` gives §22 20 subsections, disposition *"Retain, extend to Seanime
surfaces"*, Phase 9, note *"`jp-app` MCP in use. Becomes the visual-regression gate."*

**The claim and the tree agree.** Recorded as a clean row so the register is not only defects.

### C.5 · `B6-P26` — smaller open items the docs already name honestly

All `NOT-SHIPPED` and correctly labelled. Recorded so a later wave does not re-discover them as
findings.

| # | Item | Source | Tree |
|---|---|---|---|
| 1 | Game Arena's `tools/` offline grading script | `TASKS.md:67`, with the reason (the Tatoeba corpus is a runtime asset in `userData`, absent at build time) | `Get-ChildItem tools -Filter '*grad*'` → **0** — CONFIRMED absent |
| 2 | Calendar Week/Day are agenda lists, not hour grids; reminders have no OS notification | `TASKS.md:27` | not re-derived — needs driving |
| 3 | `.apkg` schema-18 note types: `parseModels` returns `{}`, field selection falls back to "first field" | `TASKS.md:80` | not re-derived |
| 4 | Immersion Browser v0.5+ — multi-tab, mine-all, shadowing | `TASKS.md:123` (`[~]`) | 9 tab-ish hits in the immersion/views tree; **unresolved** |
| 5 | §20's `--ui-media-card-*` / `--ui-subtitle-panel-*` / `--ui-vocabulary-card-*` tokens are emitted and editable but **nothing reads them** | `TASKS.md:104`, stated plainly | a Tier-1 candidate — the tokens are user-editable in Theme Studio. **Needs driving** |
| 6 | §2 Connection Profiles: every diagnostics number is zero until a connector calls `recordConnectionAttempt`, "and the panel says so rather than rendering a confident 0%" | `TASKS.md:101` | the honest pattern; **needs driving to confirm the panel does say so** |
| 7 | Phase 6 asset registry: no upstream sha256 pinned; assets verify by size | `TASKS.md:32` | a release-blocking item the doc flags itself |

Items 5 and 6 are the two most likely to promote into Tier 1 once driven.

---

## D. What is honest — recorded deliberately

An audit that only lists defects mis-describes the repository.

1. **`docs/MASTER_PLAN.md` makes no status claims whatsoever.**
   `Select-String '\[x\]|\[ \]|✅|❌|DONE|SHIPPED|complete|implemented'` → **12 hits in 1,936
   lines, every one the ordinary word "complete"/"completed" in prose.** No tick, no checkbox, no
   done-marker. It is a specification that is honest about being one, and it therefore **cannot
   carry a `SILENTLY-DROPPED` promise in the strict sense.** Publishing it as a roadmap is honest.

2. **`src/renderer/components/scraper/featureStatus.ts` is the model.** 49 ids, a stated promotion
   rule (*"promote an entry only after actually exercising it"*), a fail-safe default
   (*"anything unlisted reads as 'shell'"*), and a written record of its own past dishonesty:
   *"Before that pass every entry read 'ready' while every screen was drawing sample data — the
   registry was the least honest thing in the app"* (`:17-20`). On 2026-08-02 it resolved two
   entries **by deleting the surface rather than promoting it** (`:41-61`) — *"A dot is a claim
   about a feature; when the feature is not going to exist in the form the surface drew, the honest
   fix is to remove the surface."* Measured: **0 shell · 21 untested · 28 ready**, and the 28
   matches its own note *"28 of 28 entries hold"* exactly.

3. **`FEATURE_PARITY_LEDGER.md` refuses to fill rows it has not earned** (`:29-32`) and publishes
   its own cross-source conflicts (`:98-104`), including one where a state report says "completed"
   and the registry says "untested" — resolved *"Registry wins. State reports describe a build run;
   the registry describes verified behaviour."* That is the right rule, written down.

4. **The repo's gates run clean and are real gates.**
   `node tools/architecture-audit.cjs` → 18 findings, 3 pending, **exit 0**.
   `node tools/blanc-drift.cjs` → 1 tracked pending gap, no Pillar 0 violations, **exit 0**.
   `node tools/grammar-audit.cjs` → full corpus report, `grammar-audit.json` written.
   All three refuse to pass unclassified drift, which is what makes `B6-P20` and `B6-P24`
   cheap to settle.

5. **`TASKS.md:69-72` is the best evidence in the repository for the standard this audit applies.**
   The Game Arena was tested green for an entire phase, then driven for the first time and found
   *"badly broken"* — including that five of ten games printed the answer they were asking for.
   The document records it in full rather than quietly fixing it.

---

## E. Method and limits

- Every count re-derived this run; no number is repeated from a source document without its own
  command beside it.
- Instruments reporting an absence were given a **positive control** before their zero was
  believed. Two are recorded in place: `verifySsl` → 6 sites for `B6-P01`, `CompanionLayer` → 8
  hits for `B6-P10`. One instrument failed its control mid-run (a `key: '<field>'` accessor that
  returned 0 for every field including ones known present) and was replaced with the real
  accessor (`path: '<group>.<field>'`) before anything was reported.
- **No surface was driven. No row claims a feature works or fails.** Rows carrying code evidence
  are `SHIPPED-UNVERIFIED` with a named surface (`HANDOFF_B6_PROMISES.md` §5); rows carrying an
  absence are `NOT-SHIPPED` or `SILENTLY-DROPPED` and say what was searched for.
- `MASTER_PLAN.md` prose coverage is ~⅓ (§0). `NEXT_SESSION.md` was term-searched, not read
  (`HANDOFF_B6_PROMISES.md` §2.3). Both limits are stated rather than smoothed over, and a promise
  living only in an unsearched region would have been missed.
