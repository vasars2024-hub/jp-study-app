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
