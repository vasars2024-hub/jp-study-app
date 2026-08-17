# L1 — use of space on Dictionary and Video, and the 49 that reproduced

Authority: `src/LIQUID_UI_RUBRIC.md` **category 4**, and L1's "produce static layout studies for
compact, default, and maximized states" — this is the measurement those studies have to beat.

Instrument: `probes/l1-use-of-space.js` (one size, whatever the window is at).
Control: `probes/l1-use-of-space-control.js` (entry → 260×170 → 200×130 → restore, one eval).

## Default size, real functional state

`data-theme=forest-night`, viewport 1264×821. Dictionary carrying 8 食べる results; Media on its
library page.

| | Dictionary 820×580 | Video (MediaCenter) 1080×700 |
| --- | --- | --- |
| Regions (≥1% of window, depth ≤3, painted) | 22 | 10 |
| **Clipped** — past the frame with no scrollable ancestor | **0** | **0** |
| **Overlapping regions** | **0** | **0** |
| **Horizontal scrollers** | **0** | **0** |
| Largest dead region | **19.3% of window** (450×204), 8.9% of viewport | **30.3% of window** (431×532), 22.1% of viewport |
| Dominant canvas / chrome (§4.1) | 41.1% / 5.7% | 58.3% / 48.1% |

Two of these are already below a 10 and both are §4.1's own numbers:

- **Dead region.** The rubric's bar is *no dead region over 15% of the viewport*. Dictionary at
  8.9% passes; **Media at 22.1% does not.** The block is 431×532 — the right two thirds of the
  library page below the browser head.
- **Chrome.** §4.1 wants one dominant canvas at 60–75% with rails "narrower and quieter". Media
  runs **two stacked navigation rails** — `aside.mc-sidebar` 206×633 and `nav.medialib-rail`
  224×527 — plus `header.mc-topbar` and `header.medialib-browser__head`, for **48.1% chrome**
  against a **58.3%** canvas. Dictionary is the mirror image: 5.7% chrome, but its canvas is
  41.1% because the page is a stack of `<details>` rather than a canvas.
  (The two percentages overlap on purpose — the dominant canvas *contains* the in-page rail.
  They are two lenses, not a partition, and are reported separately for that reason.)

## Compact, and the number that reproduced

| At 260×170 (`MIN_W`×`MIN_H`, `DesktopShell.tsx:266`) | clipped | horizontal scrollers |
| --- | --- | --- |
| Dictionary | **0** | 0 |
| Video (MediaCenter) | **49** | **1** |

**49 is the same number `ALL_APPS_BASELINE.md` recorded for `media` at min** (`0 / 49 / 0`) — and
it was reached by a different instrument through a different resize path: L0 drove the product's
own `resizeStart`/`onPatch` commit from PowerShell, this probe writes an inline width that never
reaches React state. Two independent routes to the same 49 is the strongest evidence in this
document, and it is what licenses the rest of the table.

So **Video's category 4 is not a 10 today**: the rubric requires 0 clipping at *all three* sizes,
and 260×170 is a size the product itself allows. `nav.mc-nav` and its buttons are the first five
boxes out of the frame. This is L4's repair list, recorded now rather than discovered later.

## The control, which failed as required

Sub-minimum 200×130: Media clipped 48 with a horizontal scroller; Dictionary **0**. Both windows
restored to their entry box with the inline `style` attribute byte-identical
(`left: 128px; top: 84px; width: 820px; height: 580px; z-index: 417;`).

**Running the control on Dictionary alone would have reported VOID for the wrong reason.**
Dictionary puts its whole page inside one vertical scroller, so by the `unreach` definition it
cannot clip at *any* size — a true property of that surface, not a broken probe. The control
therefore runs both, and the verdict names which one broke.

## Instrument corrections — three, each of which had already produced a false number

1. **A collapsed `<details>` still has a box.** The first run reported **4 overlaps** in
   Dictionary: the closed `lexicon-notes-browser`'s filter row and note text "overlapping"
   `section.lexicon-workbench` below it. `getBoundingClientRect()` returns their full rect;
   `checkVisibility({contentVisibilityAuto: true})` returns **false**. Every geometry read is now
   gated on it, and the region count fell 24 → 22. A rect without a visibility check is not a
   measurement.
2. **`.fwin-titlebar` does not exist in this shell — `.fwin-bar` does.** The chrome selector
   silently matched nothing on Dictionary and scored its chrome at a flat **0%**, which reads
   like an excellent result.
3. **`e.closest(sel)` starts at `e`**, so `closest(sel) === e` is true for every match and
   deduplicated nothing. It counted `nav.mc-nav` inside `aside.mc-sidebar` and put Media's chrome
   at **62.1%**; asking the parent gives **48.1%**.

Clipping keeps L0's `unreach` definition — past the frame *and* no scrollable ancestor — on
purpose. Dictionary's 3,194 px of results inside a 580 px window is the product working, and a
definition that called it clipping would make L1's numbers incomparable with L0's.

## Maximized — the third size, 2026-08-17

Driven through the real `.fwin-b[title="Maximize"]` button, never an inline width, because
`.fwin-max` (`styles.css:13849`) changes the applied CSS. `toggleMax` is a React `setWins`
update, so click and measure are **separate bridge calls** — one eval would read the box a
render early. Instrument: `probes/l1-maximize-drive.js` then the same `l1-use-of-space.js`.
Both maximize to the same **1264×765**. One window at a time, as a user would.

| At 1264×765 | Dictionary | Media |
| --- | --- | --- |
| Regions | 21 | 9 |
| **Clipped** | **0** | **0** |
| **Overlapping** | **0** | **0** |
| **Horizontal scrollers** | **0** | **0** |
| Largest dead region | 23.6% of window (379×602), **22.0% of viewport** | 37.3% of window (599×602), **34.8% of viewport** |
| Dominant canvas / chrome | 55.1% / 4.3% | 62.4% / 44.5% |

**The finding: maximizing makes the dead region worse on both, and this is what fails them.**
The rubric's bar is no dead region over 15% of the viewport. Dictionary passes at default
(8.9%) and **fails maximized at 22.0%** — new, and it moves Dictionary off the clean sheet the
default-size table gave it. Media goes 22.1% → **34.8%**, its worst number at any size.

The ratio numbers move the *right* way and are worth separating from that: canvas grows
(41.1 → 55.1, 58.3 → **62.4**) while chrome shrinks (5.7 → 4.3, 48.1 → 44.5), so §4.1's "content
grows into extra space rather than the chrome growing" holds, and Media only reaches §4.1's
60–75% canvas band **when maximized**. Both facts are true at once: the layout spends new width
on the canvas, and the canvas then fails to put content in it.

## The control, which failed as required

`clipped: 0` at maximized is the claim most likely to be a blind probe, and the compact control
does not cover it — that one fires at 260×170 on Media, a different CSS path. So
`probes/l1-max-clip-control.js` injected one `position:fixed` box into maximized Media's body,
300 px wide starting 20 px inside the right frame edge (right edge 1544 vs. frame 1264, no
scrollable ancestor). Re-measure: **Media clipped 0 → 1, Dictionary unchanged at 0** — it fires,
and it fires only on the target. Removed and verified absent before the restore.

**Round trip.** Both windows returned to their entry box byte-identical on
`left/top/width/height` — Dictionary `left: 128px; top: 84px; width: 820px; height: 580px`,
Media `left: 162px; top: 114px; width: 1080px; height: 700px`. Only `z-index` moved (419→424,
421→428), which focus explains and `toggleMax`'s `++zTop.current` predicts.

**The default table above re-ran identically this session**, on a fresh app instance with both
windows reopened from the Start menu: all 14 default-size figures reproduced to the decimal.
That is the reason to trust the maximized row, which has no prior to compare against.

## Category 4 verdict: neither surface is a 10

All three sizes now measured. **Dictionary** — clean at compact and default, **fails maximized**
on dead region (22.0%). **Media** — fails compact on clipping (49 boxes), and fails dead region
at **both** default (22.1%) and maximized (34.8%). Per the rubric a sub-10 is fixed and
re-measured, not reported; both are L4's repair list. `LIQUID_SCORECARD.md` stays empty — one
scored category out of eight is not a scorecard.
