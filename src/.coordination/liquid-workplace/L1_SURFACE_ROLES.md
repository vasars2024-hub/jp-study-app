# L1 — the four surface roles, measured on Dictionary and Video

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` L1 ("confirm the four surface roles")
and `src/LIQUID_UI_RUBRIC.md` **category 3, Liquid utilization**. L0's gate closed 2026-08-17
(`PARITY_LEDGER.md`, "Verdict: L0's gate is CLOSED"), so this is the first L1 measurement.

Instrument: `probes/l1-surface-roles.js`, driven live through the debug bridge.
Control: `probes/l1-surface-roles-control.js`. Both are re-runnable.

## What was driven, and in what state

`data-theme=forest-night`, viewport 1264×821, dpr 1, `data-materials` unset. Windows opened
from their own Start-menu rows; `Anki` and `Scraper` were on the desk at entry and were left
untouched.

- **Dictionary 820×580, in a real functional state** — typed 食べる through the bridge's own
  `/type` and pressed Search: **8 `.dict-entry` results, content 3,194 px tall inside a 580 px
  window, 3,819 chars of text, 76 focusables**. An empty Dictionary caps this category at 0
  (rubric), so the empty run is not the measurement.
- **Video 1080×700** — `MediaCenter` on its library page, **557 chars, 25 focusables**.

## The numbers

| | Dictionary | Video (MediaCenter) |
| --- | --- | --- |
| Regions ≥1% of window area, depth ≤3 | **24** | **10** |
| Single controls skipped (not regions) | 12 | 11 |
| Work / Liquid-eligible / Anchor / Anchor-holding-work / Ambient | **7 / 9 / 4 / 4 / 0** | **1 / 3 / 2 / 3 / 1** |
| **Dense-work regions on translucent material** (must be 0) | **0** | **0** |
| Liquid-treated eligible regions vs total | **0 of 9** | **3 of 3** |

Video's three: `aside.mc-sidebar` (alpha 0.94 + backdrop blur), `nav.mc-nav` inside it, and
`header.mc-topbar` (alpha 0.72 + blur). Its dense work — `div.mc-page.mc-library-page`,
836×527 — sits on `div.mc-root` at **alpha 1**. That is §2.3 holding in practice, measured
rather than assumed, and it is why CLAUDE.md points at `src/media/` as the reference.

Dictionary is the honest pre-Liquid baseline: **every one of its 24 regions resolves to an
opaque backing**, nine of them navigation/transport/inspector regions that L5 will move.

## The control, which failed as required

`denseWorkOnTranslucent` on Dictionary went **0 → 1 → 2 → 0**: baseline 0; one dense region
(`div.dict-entries`) given `backdrop-filter: blur(12px)` → **1**, naming that region; the whole
`.fwin-body` given a blur → **2** (`form.dict-search` + `div.dict-entries`); restored → **0**,
with both `style` attributes byte-identical to their captured values.

Control B is 2 and not 7 **on purpose**: the other five Work regions paint their own opaque
background, and an opaque panel on a glass window is still opaque. A control that flagged all
seven would be measuring the window, not the region.

## Three instrument corrections, each of which had already produced a false number

1. **A nav rail is not dense work.** The first run flagged `aside.mc-sidebar` and
   `header.mc-topbar` as dense-work-on-glass — on the strength of a list and a search field.
   §2.3 makes those exactly the regions Liquid is *for*. `NAV_SEL` now classifies landmarks
   before content heuristics: **two false findings, removed by re-deriving, not by re-running**.
2. **A single control is not a region.** `label.mc-global-search`, a 290×30 search field at
   alpha 0.035, was the third. Controls are category 1's business; `CONTROL_SEL` skips them and
   the count is reported (12 / 11) so the exclusion is visible rather than silent.
3. **Leaf-most only.** Without it one dense table flags all four of its ancestors and the
   "must be 0" number becomes a depth count. Dictionary's four `Anchor(holds work)` rows are
   containers that would otherwise have inflated Work from 7 to 11.

Two further traps, both paid for in this session:

- **The control must collect regions the same way the probe does.** Its first version applied
  the leaf rule over *every descendant* rather than over the region set, so `.dict-entries` read
  as a container and control A did not fire. A VOID verdict from an instrument mismatch looks
  exactly like a VOID verdict from a broken probe.
- **`.fwin-body` and `.dict-entries` ship an empty `style=""` attribute.** `(attr || null)`
  folds that to `null`, so the restore assertion reported "not restored" on a byte-identical
  tree. Compare the raw attribute.

Alpha parsing handles `rgba()`, `rgb(… / a)`, `color(srgb … / a)` and `oklab/oklch/lab/lch/hwb`,
and returns **null** rather than 1 on an unrecognised paint, so an unknown material is visible
as `?` instead of silently scoring opaque — `css-measure` §1 records 23 real failures lost to
exactly that silent null.

## What this settles for L1, and what it does not

**Settled.** The four roles are mechanically decidable on both reference apps, and the two
category-3 numbers exist for each. Video is the pattern: Liquid on the rail and the transport,
opaque under the grid.

**Not settled, and not to be inferred from this.** This is one of eight categories. No surface
is scored here and `LIQUID_SCORECARD.md` stays empty — a category measured in isolation is not a
score, and the rubric's `80/80` is not reachable until categories 1, 2, 4–8 are driven too.

## 2026-08-24 — category 3 SCORES 10, once the sections were actually populated

**The 4-of-9 that stood here was an empty-harness reading**, and the rubric caps such a
category at 0 rather than scoring it. `details.lexicon-{compounds,collocations,examples,
neighbors}` and `div.dict-examples` each hold nothing until their own Run/reveal control is
used, so the classifier saw a small header with one focusable and called them
Liquid-eligible. `dictionaryLiquidRegions.test.tsx` already recorded the right decision —
they are disclosure containers holding dense reading content, so they stay opaque — but as
an inference from collapsed geometry. This measures it.

**Driven, not assumed.** Clicked all four Run buttons (`window.api.dictCompounds` and
siblings — local index scans, read-only, transient state) and the *Example sentences*
reveal, on 食べる / 8 entries:

| region | before | after |
| ------ | ------ | ----- |
| `details.lexicon-compounds` | eligible | **Work** (5 li) |
| `details.lexicon-examples` | eligible | **Work** (8 li) |
| `details.lexicon-neighbors` | eligible | **Work** (12 li) |
| `details.lexicon-collocations` | eligible | **Work** (honest empty result) |
| `div.dict-examples` | eligible, `text=17` | **Work**, `text=566`, 6 li, 12 focusables |

`byRole` moved `Work` **7 → 12**, `Liquid-eligible` **9 → 4**.

**The three rubric numbers, live, forest-night, liquid, 820x580:**

| number | value | bar |
| ------ | ----- | --- |
| dense-work regions on translucent material | **0** of 12 Work regions | must be 0 |
| contextual regions Liquid-treated | **4 of 4** eligible | — |
| shared primitive vs local re-implementation | 3 of 4 carry `.lq-contextual` itself; `div.dict-saved-searches-head` inherits its material from its `.lq-contextual` parent — **0** local re-implementations | 0 |
| Liquid motion that decorates | **0** infinite animations, **0** non-spatial transitions across the whole surface; the three `.lq-contextual` regions animate `opacity, transform` only (0.24 s / 0.14 s) | 0 |

**Control, red:** `.lq-contextual` forced onto five dense-work regions
(`dict-entries`, `lexicon-conjugation`, `lexicon-etymology`, `dict-examples`,
`lexicon-notes-controls`) took `denseWorkOnTranslucent` **0 → 5**, each named with its own
backing chain (`alpha 0.72 on …`). Removed; back to **0**, `[data-ctl3]` count 0. That is the
rubric's "a deliberately all-glass surface must score low" control, and it fails as required.

**Category 3: 10/10.** The universal-glass failure mode this category exists to catch is
absent, and the selectivity is real rather than accidental: the twelve dense-work regions are
opaque and the four contextual ones are not.

## 2026-08-24 (late) · primary — category 3 re-driven on this tree, and the control's own VOID was an artifact

Process 30432, `6b490fc3` in the renderer, Dictionary liquid 820×580, 食べる / 8 entries, 23 regions.
Drove the five reveal controls first (`Find containing words` / `Find phrases` /
`Find example sentences` / `Find shared senses` / `Example sentences`) — measured populated, not
assumed: compounds 542 chars / 5 li, examples 716 / 8 li, neighbors 698 / 12 li, collocations 223
chars and an honest empty result, `dict-examples` 528 chars / 6 li / 12 focusables.

`byRole` **Work 7 → 12, Liquid-eligible 9 → 4**. `denseWorkOnTranslucent` **0 of 12**.
`liquidTreatedEligible` **4 of 4** — `view-head`, `dict-saved-searches`, `dict-saved-searches-head`,
`lexicon-lens-picker`, all glass, three of them carrying `.lq-contextual` itself. Identical to
`debad557`'s numbers on a tree that has moved since, which is the point of re-driving.

**The control's repair, and this is the trap.** `l1-surface-roles-control.js` fired perfectly —
`baseline []` → A `["div.dict-entries"]` → B three regions → `restored []` — and then declared
itself **VOID**, because it verified the restore by comparing the raw `style` ATTRIBUTE STRING.
Both elements arrive with no style attribute (`null`), and `style.removeProperty` leaves an empty
`style=""` behind, so `null !== ""` reads as unrestored on a surface that is byte-identical. Worse,
it is not even stable: the next run captured `""` as its before-value and the same comparison passed.
The verdict now hangs on the COMPUTED material this control actually mutates —
`backdrop-filter|background-color` on both elements — which came back `none|rgba(0, 0, 0, 0)` and
`none|rgb(18, 28, 23)`, identical either side. Verdict: **CONTROL FAILED AS REQUIRED**.

**Category 3 = 10/10**, re-driven, control proven.

## 2026-08-25 · backup — category 3 scored on Video for the first time, and depth 3 was a false clean

`l1-surface-roles.js` was hardcoded to `['Dictionary','Media']` at `ARG`; it now reads
`window.__lqScoreTitles` and `window.__lqRoleDepth`. No new probe was written.

**Depth 3 does not reach the Media shell's regions.** At the file's default it returned Video
`regions 8`, `liquidTreatedEligible 3/3` — a clean sheet that had never looked at the surface the
category is about. `.medialib-rail` (navigation) and `.medialib-browser` (the work canvas) sit at
depth 4-5 inside `.mc-root > .mc-workspace > .mc-content > .mc-page > .medialib-root >
.medialib-shell`. At depth 6: **Video `regions 12`, `denseWorkOnTranslucent 0`,
`liquidTreatedEligible 3 of 4`** — `nav.medialib-rail`, 15.1% of the window, is Liquid-eligible and
opaque. Dictionary at the same depth: **163 regions, `denseWorkOnTranslucent 0`, 4 of 23** —
unchanged in kind from `debad557`, so the deeper walk does not invalidate its 10.

**The real category-3 defect on this shell is not the rail, it is the palette.** §2.3 says Liquid is
a composition language, not one palette. `.mc-sidebar`, `.mc-topbar` and `.mc-playerbar` painted
three `rgba(...)` literals written straight into the rule, and the whole `--mc-*` token block is a
fixed dark set with no theme variant. Measured live at `data-theme='classic-light'`, one window:

| region | before | after `ac2330cb` |
| --- | --- | --- |
| `.medialib-rail` (shared token) | rgb(247,247,247) on rgb(30,30,30) | unchanged |
| `.mc-root` | rgb(11,13,19) on rgb(243,244,248) | rgb(255,255,255) on rgb(30,30,30) |
| `.mc-topbar` | rgba(10,12,18,0.72) | srgb 1 1 1 / 0.82 |
| `.mc-sidebar` | rgba(8,10,16,0.94) | srgb .953 .953 .953 / 0.94 |
| sidebar nav ink | #aaaebb — **2.01:1** | rgb(95,95,102) — **5.74:1** |

`high-contrast` before: chrome near-black, blurred, rgb(243,244,248) text while the rail was #000 on
#ffff00. After: every chrome surface #000 on #ffff00 with all three `backdrop-filter`s computing
`none`. `paper` 4.71:1. **forest-night and study-os are byte-identical** — the literals stayed the
default and only the six `color-scheme: light` palettes plus `high-contrast` remap.

**Category 3 on Video is PARKED at 9**, not 10. What is measured and passing: 0 dense-work regions
on translucent material, at a depth that actually reaches them. What is open: the shared-primitive
half — `.medialib-rail` is a local re-implementation rather than `.lq-contextual`, and adopting the
primitive is a no-op in a conventional window (`liquid-surfaces.css` deliberately paints nothing
there), so it only becomes measurable once Video gets a Liquid presentation state. The negative
control (`l1-surface-roles-control.js`) has not been re-run against Video.

**Trap.** `--mc-nav-label` would have collided in the reader's eye with the existing `.mc-nav-label`
CLASS; the token is `--mc-nav-ink`. And a `sed`/python patch of `mediaCenter.css` must be CRLF-aware
— the worktree is CRLF, HEAD is LF, and a `\n`-only pattern silently matches nothing and reports
success.

## 2026-08-25 · primary — category 3 CLOSES on Video at 10/10, with the control proven on both surfaces

**Video was driven in LIQUID presentation for the first time.** Every category ever scored on it
was scored in `standard`; the chrome still offered `Make Liquid`. Clicked it: `data-presentation`
standard → liquid, rect unchanged at 92,40 1080x700, and it survived a renderer reload — L3's
persistence, observed rather than inherited.

**The product change.** `nav.medialib-rail` was the ONE Liquid-eligible region of that window still
painting its own opaque fill (`rgb(8, 15, 12)`), which is what held category 3 at 9. It now renders
through the shared primitive — `<ContextualSurface as="nav" className="medialib-rail">` — and
`liquid-window.css` gains ONE scoped rule keeping it flush (radius 0, no shadow, its own
`12px 8px`), because a 224x585 full-height column that meets three edges is not a floating card.
The same exception `.fwin-body-flush` already takes. Decision recorded under standing auto-approval.

| `l1-surface-roles.js`, depth 6, forest-night, 1264x821 | regions | denseWorkOnTranslucent | liquidTreatedEligible |
| --- | --- | --- | --- |
| Video 1080x700 **liquid**, before | 12 | 0 | **3 of 4** |
| Video 1080x700 **liquid**, after | 13 | 0 | **4 of 4** |
| Media 820x580 **standard**, after | 11 | 0 | **3 of 4** |

**Media is the negative control and it is the same DOM node.** `nav.lq-contextual.medialib-rail`
reads `ownAlpha 1, opaque` in the standard window and `ownAlpha 0.72, translucent` in the liquid
one, in the SAME run — §2 non-negotiable 1 (a conventional window is unchanged) measured rather
than argued. `.medialib-rail`'s own sheet is asserted to carry no `backdrop-filter` and no
`--lq-liquid-*`, so the material can only ever arrive from `.fwin-liquid`.

**The control now runs on both surfaces, and its BAR was wrong twice.** `l1-surface-roles-control.js`
was hardcoded to `TITLE = 'Dictionary'` / `.dict-entries` / depth 3 — the same defect that cost the
dead-end sweep four turns. Adapted (no new probe): `__lqControlTitle`, `__lqControlDenseSel`,
`__lqControlGlassSel`, `__lqControlDepth`, defaults unchanged.
- `controlB > controlA` encoded an accident of Dictionary. The Media shell holds exactly ONE dense
  region, so B can never exceed A and a perfectly-firing control read VOID.
- `controlB === workTotal` ("every Work region flags", the rubric's own wording) is ALSO wrong,
  measured: Dictionary's `workTotal` is **7** and B reaches **2**, because five of the seven paint
  their own opaque fills and nothing done to an ancestor can reach them.
- The bar is now B ⊇ A and (B > A or workTotal === 1), with `workTotal`/`workList` reported.

Verdicts: **Video CONTROL FAILED AS REQUIRED** (workTotal 1, [] → A `[section.medialib-browser]` →
B same → restored [], material identical) and **Dictionary CONTROL FAILED AS REQUIRED** (workTotal 7,
[] → A `[div.dict-entries]` → B `[form.dict-search, div.dict-entries]` → restored []). Both restores
verified on the COMPUTED material and, this time, on the style attribute too.

**Video category 3 = 10/10.** 4 tests; the flush-rail guard fails exactly 1 when `border-radius: 0`
becomes `4px`, and the sheet came back byte-identical.

**Traps.** (1) Japanese cannot reach `/eval` — the input took `???` and a `/^(Search|検索)/` regex
became `/^(Search|??)/`, a SyntaxError that reads as a dead probe. `String.fromCharCode(0x98df,
0x3079, 0x308b)` is the way. (2) `.fwin-body` is not the backing on every shell: `div.mc-root` is an
opaque plate between it and every region, so glassing the body reaches nothing.

## 2026-08-26 · codexA — reusable category-3 harness and Library 10/10

`probes/cat3-liquid-utilization.cjs` consolidates the two probes above: `--surface` accepts a title
or `@selector`, runtime DOM paths select the dense control, and an attribute-scoped stylesheet makes
the whole surface all-glass. No surface selector, window size, entry count or pid is embedded.

The denominator defect named in the handoff is fixed: a focusable result notice is not contextual
chrome. Runtime landmarks/shared primitives now define navigation, transport and inspectors, and
the harness separately reports treated vs shared-primitive counts.

Library initially failed **0/1 treated, 0/1 shared** on its local `header.view-head`. It now renders
that existing header through `ContextualSurface`; conventional mode remained transparent/opaque-
backed, while Liquid measured **0 dense Work on translucent, 1/1 treated, 1/1 shared** at 820x580.
Control: dense **0→1**, all-glass **3/3**, restored **0** with style/material identical. **10/10.**
Raw summary: `baselines/cat3-l6-library.json`. Board: **25 of 48 cells**; category 3 is 1/6.

## 2026-08-26 · codexA — Captures/Reading Finder category 3 is 10/10

The second surface was a harness RUN. `nav.reading-workspace-nav` painted its own 0.88-alpha
material in every presentation but was a local implementation: **0 dense on glass, 1/1 treated,
0/1 shared**. It now uses `ContextualSurface as="nav"`; the existing class keeps conventional
pixels unchanged, while `.fwin-liquid` supplies the shared material.

Liquid at 820x580: **0 dense Work on translucent, 1/1 treated, 1/1 shared**. Control: dense
**0→1**, all-glass **2/2**, restored **0**, material/style identical. **10/10.** Conventional
geometry remained 820x580 and the nav returned to its original 0.88-alpha colour. Raw summary:
`baselines/cat3-l6-captures.json`. Board: **26 of 48 cells**; category 3 is 2/6.
