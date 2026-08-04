# HANDOFF B0 — Census: the denominator

**Status: COMPLETE.** Static analysis only. The app was never started, restarted or killed.

---

## 1. Scope and ownership

| | |
|---|---|
| Branch | `audit/a-evidence` (not cut by me — dispatch §2 forbids branching) |
| Base commit | `5ae927d` |
| Owned | `docs/audit/CENSUS_SURFACES.md`, `docs/audit/CENSUS_SETTINGS.md`, `docs/audit/CENSUS_NAVIGATION.md`, `docs/audit/HANDOFF_B0_CENSUS.md` |
| Foreign | Everything else. **No file outside those four was modified.** |
| Git | No commit, no branch, no `git add`. Orchestrator commits. |

Dispatch §2 overrides `jp-dispatch` §2's "branch first" rule for this run; stated per that
skill's instruction to say so explicitly.

**Not mine.** `git status` shows `src/renderer/styles.css` modified (34+/5−). It was already
modified when this run began and I never opened it for writing. Per `jp-dispatch` §2 it is left
alone — **the orchestrator should not attribute it to B0.** The tree also carries several
untracked `docs/migration/**` proof directories from earlier runs, likewise untouched.

---

## 2. The four totals

### 2.1 Surfaces — **149**, plus 81 settings search cards

| Depth | What | Count |
|---|---|---|
| 0 | Window / shell modes | **13** (+1 `EXCLUDED`) |
| 1 | `DesktopWinSection` apps | **24** |
| 2 | Nested tabs / pages / modes | **77** |
| 3 | Sub-tabs, drawer categories, view modes | **35** |
| — | Settings search-index cards (anchors inside a depth-2 page) | **81** |

**Depth ≥3 is where later probes will under-reach, and it is concentrated: 26 of the 35 sit
behind the Scraper** (19 settings-drawer categories + 7 result tabs).

### 2.2 Settings — **433 keys**, **34 orphan candidates**

| | Count |
|---|---|
| Settings documents enumerated | **30** |
| Scraper keys exposed as a control | **166** |
| Top-level keys across the other 29 documents | **267** |
| **Orphan candidates (zero read sites in `src/`)** | **34** — all in the Scraper |
| Keys with a consumer but no UI write site | **1** (`AppBorderSettings.cornerRadius`) |

The other 29 documents produced **zero** orphans.

### 2.3 Navigation — **0 sections with zero entry points**

| | |
|---|---|
| Sections with zero entry points | **0 of 24** |
| Sections with exactly one | **1** — `visualizer` |
| `os:open` dispatch sites (non-excluded) | **24** |
| Navigation paths reaching the visual novel | **2 in code; 1 outside excluded themes** |

**The audit's highest-value row shape did not fire.** No surface exists only in code. That is a
measured result, not an omission — and it is worth saying plainly, because a census that found
nothing is the outcome a later wave will be tempted to re-derive.

### 2.4 i18n — **6,675 English keys**, **0 unreferenced**

| | Count |
|---|---|
| Literal keys in `catalogs/en.ts` | **6,143** |
| `GAME_ARENA_CHROME` (spread into all four catalogs) | **109** |
| `MOONCAP_PHASE_LORE` (spread into all four catalogs) | **200** (50 phases × 4) |
| `GRAMMAR_TAXONOMY_EN` (per-language, correctly) | **223** |
| **Total** | **6,675** |
| Keys with **no** string-literal reference anywhere in `src/` | **0** |
| Distinct key prefixes | **69** |
| Distinct dynamic (`` `prefix.${…}` ``) key prefixes | **168** |

Catalog parity holds: `en`, `ja`, `zh`, `ru` each carry exactly **6,143** literal keys.

---

## 3. The catalog-spread pattern — **2 instances, not 1**

The dispatch named `GAME_ARENA_CHROME`. Sweeping for the same shape found a **second**:

| Block | Keys | Spread sites |
|---|---|---|
| `GAME_ARENA_CHROME` | 109 | `en.ts:48`, `ja.ts:47`, `zh.ts:45`, `ru.ts:47` |
| `MOONCAP_PHASE_LORE` | 200 | `en.ts:49`, `ja.ts:48`, `zh.ts:46`, `ru.ts:48` |

**309 keys are identical English text in all four languages**, and `i18n-check` and the
catalog-hygiene test both pass because the key is present in every catalog. Command:
`grep -nE "\.\.\.[A-Za-z_$][\w$]*" src/shared/i18n/catalogs/*.ts`

**The control that proves the instrument works:** `GRAMMAR_TAXONOMY_*` is spread at the adjacent
line in all four files and is **correctly per-language** (`GRAMMAR_TAXONOMY_EN` / `_JA` / `_ZH` /
`_RU`, from `shared/i18n/grammarTaxonomy/`). The sweep distinguishes the two, so the two hits are
the pattern and not an artefact of grepping for `...`.

**Both carry an explicit rationale comment** — `gameArena.ts:11-12` ("deliberately shared verbatim
by every language rather than translated") and `mooncapLore.ts:1-2` ("same deliberate choice as
Game Arena chrome"). Enumerated as instructed; **not judged.** Whether a deliberate choice to ship
English into three other languages is right is the user's call, not mine.

---

## 4. Registry disagreements

Six registries describe "which sections exist" and none of them agree. Full detail in
`CENSUS_NAVIGATION.md` §5.

| # | Disagreement | Consequence |
|---|---|---|
| **1** | `youtube` is in `POPOUT_SECTIONS` (`main.ts:1285`) but **not** in `POPOUT_LABELS` (`App.tsx:126-148`) | `popoutSection()` gates on `POPOUT_LABELS` (`App.tsx:152-155`), so `?popout=youtube` resolves to `null` and `App` falls through to the **full desktop shell** instead of the YouTube app. **Static only — needs a live check.** |
| **2** | `note`, `visualizer`, `musicwidget` are in `DesktopWinSection` but in neither `APPS` nor the palette | Why the union is 24 and both launchers are 21. Deliberate for `note`. |
| **3** | `scraper` and `notebook` have no keyboard shortcut | 19 of 21 launchable apps have one. |
| **4** | `DesktopShell.tsx:116-117` says "same 15 app names"; the array below holds 21 | Cosmetic, but the next reader will quote it. |

Registry sizes: `DesktopWinSection` 24 · `AppSection` 23 · `APPS` 21 · palette `SECTIONS` 21 ·
`POPOUT_SECTIONS` 22 · `POPOUT_LABELS` 21.

---

## 5. What could not be resolved statically

| Item | Why |
|---|---|
| `buddyRoutines.ts:390` `os:open` target | `detail: step.appId` comes from routine step data, not a literal set. **Every entry-point total in `CENSUS_NAVIGATION.md` §2 is therefore a floor, not an exact count.** |
| `ScraperShellState.drawerCategory` | Typed `string` (`scraperShell.ts:126`), validated only for length. The *rendered* set is clamped to the 19 groups at `ScraperSettingsDrawer.tsx:87`; the *persisted* set is unbounded. Counted as 19. |
| Nested settings keys below top level | The 267 figure is **top-level keys only**. `EnvironmentSettings` and others hold nested objects whose sub-keys are uncounted. **267 is a floor.** |
| Indirect setting reads | `shared/scraperNotices.ts:51-55` maps notice kinds to setting names *as string values*. No name-based grep can find that read site. I found one such map; there may be others. Every orphan verdict is "orphan as far as name-based static analysis reaches". |
| Widget instance count on screen | `WidgetSnapshot.type` is user-placed at runtime (`shared/desktop.ts:73-85`). Types are enumerated (27); instances cannot be. |
| Whether `?popout=youtube` actually renders the desktop | Read from source; **not driven.** |
| Aero / Wired render branches | `EXCLUDED` by ruling, so not traced — noted because at least one surface (the VN menu entry) exists *only* in the Aero branch. |

---

## 6. Three instrument corrections, stated because they changed the numbers

**These are recorded in full because in both cases the first result looked clean and was wrong.**

### 6.1 The i18n reachability scan: 170 → 0

The first pass reported **170** English keys with no reference in `src/`, clustered in `widgets`
(37), `wired` (34), `theme` (23). The character class in the literal-harvesting grep was
`'[A-Za-z][A-Za-z0-9_.]*'` — **no hyphen**. Every "unreferenced" key contained one
(`widgets.title.clock-analog`, `epub.layout.preset.en-ja`, `mining.vars.cloze-after.hint`), and
all of them are plain string literals in `widgets/registry.tsx` and siblings.

With the hyphen added: **0 unreferenced keys, out of 6,143.**

It surfaced because the sampled keys did not hold up — `widgets.title.clock-analog` sitting
beside `widgets.title.calendar`, which the same scan called referenced, is not a pattern a real
dead-key cluster produces.

### 6.2 The settings orphan sweep: bare leaf names measured English words

The first sweep counted `\b<leaf>\b` in `src/main`. `cache.mode` scored 113 in main and 885 in
the renderer — it was counting the word "mode". Discarded entirely; **those counts appear nowhere
in the census.** The reported figures come from a qualified property-access pattern plus hand
resolution of every zero-hit key, which is what caught **12 false orphans** (listed in
`CENSUS_SETTINGS.md` §2), including five reached only through the indirect map above.

### 6.3 The key extractor undercounted single-line objects: 266 → 267

Caught in the §8 read-back of `jp-dispatch`, by re-summing the census table against the total I
had written rather than trusting the total. The extractor matched newline-terminated keys, so a
defaults object written on one line returned exactly 1 key whatever it held.
`ReadingLensSettings` (`main/readingLens.ts:57`) is `{ enabled, hotkey }` — counted 1, is 2.

I checked the other one-liners in the same set (`lyricsSettings`, `musicWidgetSettings`); both
genuinely hold one key, so this was the only undercount. **Corrected totals: 267 non-scraper
keys, 433 overall, 399 non-orphan.**

---

## 7. Defects noticed, not fixed

Recorded per dispatch §4. None is in a path I own; nothing was changed.

| # | Defect | Site |
|---|---|---|
| 1 | `?popout=youtube` opens a window the renderer cannot resolve; falls through to the full desktop shell | `main.ts:1285` vs `App.tsx:126-148`, gate at `:152-155` |
| 2 | The visual-novel feature's UI text is **raw string literals**, not `t()` — the entry button reads `Visual Novel Library` inline. It has **zero i18n keys of its own**. Direct `CLAUDE.md` i18n-workflow violation | `views/ImmersionView.tsx:346-349`, `:76` |
| 3 | `onOpenVisualizer` targets `visualizer` in-desktop but **`music`** in the pop-out path — same button, two apps. `visualizer` is also absent from `POPOUT_SECTIONS`, so `popOut('visualizer')` would no-op | `DesktopShell.tsx:1969` vs `AppSection.tsx:59`; `main.ts:1282-1286`, `:1308` |
| 4 | `AppBorderSettings.cornerRadius` has **no UI write site**, is applied to `--app-border-radius`, and **no CSS rule consumes that property** (`grep -c 'app-border-radius' src/renderer/styles.css` → 0) | `appBorderSettings.ts:13`, `:21`, `:44` |
| 5 | `DesktopShell.tsx:1090` casts an untrusted `os:open` detail straight to `WinSection` with no validation | `DesktopShell.tsx:1089-1093` |
| 6 | Stale comment: "same 15 app names" above a 21-entry array | `DesktopShell.tsx:116-117` |
| 7 | Settings nav page `mini` is the only one with zero search-index cards | `settingsRegistry.ts:56-62` |
| 8 | 28 of the 34 scraper orphans carry no note at their declaration; only `featureStatus.ts` names 6 of them | `CENSUS_SETTINGS.md` §2 |

---

## 8. Verification of claims I was handed

| Claim | Verdict | Evidence |
|---|---|---|
| `maxParallelDownloads`, `memoryBudgetMb`, `cpuThrottlePercent`, `reuseBrowserContext`, `prefetchNextPage`, `mergeStrategy` have zero refs in `src/main/` | **CONFIRMED**, all six | `for k in …; do grep -rn "$k" src/main/ \| wc -l; done` → `0` ×6 |
| VN feature has "seven renderer panels" | **CORRECTED — 10** | `ls src/renderer/components/immersion/` |
| VN feature has "eight test files" | **CONFIRMED — 8** | `shared/__tests__/visualNovel*.test.ts` |
| VN feature has "i18n keys" | **CORRECTED — zero of its own**; the sole `visualNovel` key is a Blanc key | `catalogs/en.ts:5420` |
| VN feature has "a `settingsRegistry` entry" | **CORRECTED — no entry.** One search *keyword* on the `reading-lens` card, routing to `pageId: 'study'` | `settingsRegistry.ts:566` |
| `GAME_ARENA_CHROME` spread pattern | **CONFIRMED, and extended** — a second instance, `MOONCAP_PHASE_LORE` | `catalogs/*.ts:45-49` |

---

## 9. Gate results

**None run, and none applicable.** This run created four Markdown files under `docs/audit/` and
modified no source, no catalog and no config. The six gates in `jp-dispatch` §4 all test `src/`
or the i18n catalogs; there is no plausible path from a new document in `docs/audit/` to any of
them. Stated rather than skipped silently, per §5 — **no baseline was measured this run, so no
gate total from this run should be quoted anywhere.**

---

## 10. Open questions for the user

1. **The two catalog-spread blocks (309 keys) are self-documented as deliberate.** `gameArena.ts`
   and `mooncapLore.ts` both state the choice in a header comment. The dispatch framed this
   pattern as something an instrument *caught*; the code frames it as a decision. **Which is it?**
   If deliberate, the later waves should stop re-finding it; if not, it is 309 keys of English
   shipping into three other languages. I did not resolve this — it is a product call.

2. **Should the 81 settings search cards count toward the audit's denominator?** They are
   anchors inside already-counted pages, not screens. `CENSUS_SURFACES.md` reports 149 and 230 so
   either can be used, but the waves should pick one and use it consistently or the coverage
   ratios will not compose.

3. **`AppBorderSettings` is Aero-associated by its own header comment but is written from the
   Appearance settings page, which is not excluded.** Does the Aero exclusion cover it? This
   changes whether defect #7.4 is in scope at all.

4. **Defect #7.1 (`?popout=youtube`) is the one finding here that needs the live app.** Static
   reading says it renders the whole desktop in a borderless window. I did not drive it — dispatch
   §0 forbids it. It should go on the wave-3 queue as a first-class row, not as a footnote.

---

## 11. Scope

Finished within scope and stopped. No surface was probed, no control driven, no defect fixed —
waves 2 and 3 own all three.
