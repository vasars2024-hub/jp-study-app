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

## 2026-08-18 · primary · Category 4 re-driven on the LIQUID window — and the fix that did not move the number

The 2026-08-17 table above was measured **pre-Liquid**. Re-driven on the Liquid
Dictionary (`data-presentation=liquid`, `.fwin-liquid`), 食べる, every lazy panel run
(compounds 5 li, examples 8 li, neighbors 12 li, collocations 0 li — an honest empty):

| | default 820x580 | maximized 1264x765 |
| --- | --- | --- |
| Regions / clipped / overlaps / h-scrollers | 22 / **0** / **0** / **0** | 21 / **0** / **0** / **0** |
| Largest dead region | 23.4% of window, **10.7% of viewport** | 22.9% of window, **21.3% of viewport** |
| Dominant canvas / chrome | 32.3% / 5.7% | 48.3% / 4.3% |

**Maximized still fails**, at 21.3% against the rubric's 15%-of-viewport bar. Liquid did
not cause it (pre-Liquid was 22.0%) and did not fix it.

**What was fixed, with its number.** A text-extent walk found the two example-sentence
lists were the largest wasters of width at maximized: `.lexicon-examples-list` 1186 px
wide with its longest run at **269 px — 951 px dead over 1082 px of height**, and
`.dict-ex-list` 1188 px with its run at **408 px — 813 px over 528 px**. Both now use
`repeat(auto-fill, minmax(30rem, 1fr))`. Measured after: examples **1082 → 650 px** tall,
waste **951 → 354**; dict-ex **528 → 260 px**, waste **813 → 215**. At the default
820 px window both return to a single column (`cols=742px` / `744px`) at their original
1082 px and 528 px, so the sizes that already measured clean are untouched — the 30rem
floor needs 968 px and the default offers 772.

**And the dead region did not move: 379x584 at grid 24,8, 21.3%, identical to three
decimal places.** Recording that rather than the improvement alone, because the
improvement is real and the *category* is not fixed. `elementFromPoint` sampled across
that rectangle (scroller at `top=0/5266`, so this is the top of the page) hits
`div.dict-saved-searches-head`, `div.lq-contextual.lexicon-lens-picker`, `li`,
`div.dict-entry` and `span.dict-pos` — the right ~30% of the **first screen**, not the
examples further down. The example lists never intersected the measured rectangle.

**So the next slice is `.dict-entry`, and it is a layout change, not a token.** Eight
entries at 1216x174–264 each, `display:flex; flex-direction:column` (`styles.css:4780`),
each with one full-width run (`textR=1207`) and the rest short. That single long line per
entry is why aggregate waste reads 28 px while the grid still finds 379x584 of empty
cells between the lines.

**Round trip:** the window returned to `left: 94px; top: 54px; width: 820px; height: 580px`
byte-identical; only `z-index` moved 68 → 74, which focus explains.

**Controls, both red, both files restored byte-identical** (`debug/l5b-mutate-columns.cjs`):
floor 30rem → 20rem → *"a second column must not fit at the default width: expected 648 to
be greater than 772"*; `align-items: start` dropped → both selectors fail their own message.

**Trap:** `styles.css` is LF in HEAD, CRLF in the worktree, and carries 9 hunks from other
tracks. `node debug/l5b-stage-styles.cjs` rebuilds HEAD + this one edit and hashes
`--no-filters`; `git add` would have taken all ten.

## 2026-08-18 · primary · `.dict-entries` pairs up — 21.3% → 18.3%, and the band that is left

`.dict-entries` was `display:flex; flex-direction:column` (`styles.css:4780`), so eight
食べる entries were eight full-width rows in a 1216 px content box. Now
`repeat(auto-fill, minmax(30rem, 1fr))` with `column-gap: 16px` and no row gap —
`.dict-entry`'s `border-bottom` is the row separator and a row gap would detach it from
the entry it divides.

**Measured, maximized 1264x765, through the sheet and not an inline style** (the inline
trial gave the identical number first, which is the check that the rule and not the probe
moved it): dead region **379x584 → 947x201**, **21.3% → 18.3% of viewport**, 19.7% of
window; clipped **0**, overlaps **0**, horizontal scrollers **0**, canvas 48.3%.

**Default 820x580 is untouched and reproduces its own earlier row to the decimal:** 22
regions, 0 / 0 / 0, dead **511x218 at grid 15,11 = 10.7% of viewport**, canvas 32.3%,
chrome 5.7%. Round trip `left: 94px; top: 54px; width: 820px; height: 580px`, z-index only.

**Category 4 is still NOT a 10 — 18.3% against a 15% bar — and the remainder is now
located exactly.** The dead rectangle rotated from a tall right-hand column to a wide flat
band at `x316..1263 y146..347`, and that band is four short full-width contextual rows
stacked, each holding a label and one control on its left:

| row | y | height |
| --- | --- | --- |
| `.dict-saved-searches` | 159..212 | 53 |
| `.lexicon-notes-browser` | 226..271 | 45 |
| `.lexicon-lens-picker` | 285..335 | 50 |

**The next slice is therefore structural, not a token.** These three are *not* siblings —
the first two are children of `.dict-view`, the third is inside `LexiconWorkbenchResults` —
so no CSS-only rule can put them side by side at wide widths. That is a real contextual-rail
decision for L5 and is deliberately not started at the end of a turn. Everything above it
(`.view-head` 16..81, `.dict-search` 99..141) is already dense or full.

**Instrument note:** the dead-region number is read at the current scroll offset
(`scroller top=0/5266` here, i.e. the first screen). Every figure in this document was taken
at top, so they are comparable; a figure taken mid-scroll is not.
