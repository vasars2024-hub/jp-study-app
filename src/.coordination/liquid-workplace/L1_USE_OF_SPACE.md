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

## 2026-08-22 · backup · the band pairs — 18.3% → 8.7%, and the third row that could not join

The previous entry left this located and called it structural. Two of the three rows **are**
siblings, and pairing those two is enough: `.fwin.fwin-liquid .dict-view` becomes
`grid-template-columns: repeat(auto-fit, minmax(28rem, 1fr))`, every child spans `1 / -1`, and
`.dict-saved-searches` + `.lexicon-notes-browser` opt back to `auto`. `theme/liquid-window.css`,
because that sheet was clean while `styles.css` carries nine foreign hunks — and because
scoping to `.fwin-liquid` makes the standard window this fix's own control.

**Measured, maximized 1264×765, disclosure panels collapsed** (the state the earlier 18.3% was
taken in — reproduced to the decimal first, *before* the edit, so the two figures are comparable):

| | dead region | % of viewport | canvas |
| --- | --- | --- | --- |
| Liquid, before | 947×201 at grid 10,8 | **18.3** | 48.3% |
| Liquid, after | 379×237 at grid 28,19 | **8.7** | 55.0% |
| **Standard, after** (control) | 947×164 at grid 10,7 | **15.0** | 55.1% |

clipped **0**, overlaps **0**, horizontal scrollers **0** in all three. **Under the 15% bar.**

**Three controls, because one number proves nothing.** (1) The standard window at the same
1264×765 still computes `.dict-view` `display: block` with both rows full-width at 772px — the
rule did not leak, and standard's own band is a separate 15.0%. (2) At the default 820×580 the
track resolves to a single `772px` column and the layout is byte-identical to before, so
`auto-fit` and not a media query is what makes the pairing width-honest. (3) Three source
mutations, each red for its own case and restored byte-identical: pair loses `grid-column: auto`
→ 1 red; `auto-fit` becomes a fixed `repeat(2, …)` → 1 red; results stop spanning → 2 red.

**The lens picker did not join, and that is the honest remainder.** `.lexicon-lens-picker` is a
grandchild — `section.lexicon-workbench` owns it — so reaching it needs either `display: contents`
on a section whose layout the dense results depend on, or lifting `selectedLens` out of
`LexiconWorkbenchResults`. Neither is a spacing fix. At 8.7% it no longer decides the category.

**Expanded is a different surface, and both numbers are real.** With all eight `<details>` open
and all five lazy loaders run, the same window before the fix read **10.7%** (1010×110). The
collapsed figure is what a user lands on, so it is the one scored; the expanded one is recorded
so nobody reads a lower number as a contradiction.

**The trap that cost two probe runs:** an unfocused window measured `regions: 0`,
`chromeParts: []` and a **95.3%** dead region — a refusal wearing a measurement's clothes. It also
reported the window as `1239×750` where the focused read gives `1264×765`. `/focus` first, then
measure; a probe that returns zeros for every region has not run.

## 2026-08-22 · backup · the compact control that could not fail, and the two blind spots behind it

Category 4 was one size short of a score, so compact was re-driven on the Liquid Dictionary
(`data-presentation=liquid`, 食べる, 8 entries). It read **clipped 0 / overlaps 0 /
h-scrollers 0** — and so did the sub-minimum 200×130 control, and so did **both** deliberate
failures injected on top of it (a `position:fixed` box 300 px past the right frame edge;
`.dict-view`'s track floor forced to a fixed `repeat(2, 28rem)` in a 260 px window). Per the
rubric a control that does not fail **voids** the score. It voided.

**Two blind spots in `probes/l1-use-of-space.js`, both now fixed.**

1. `scrollableAncestor` was axis-blind — it tested `overflowY + overflowX` against one regex
   and asked only whether *either* axis scrolled. Dictionary's `.fwin-body` is
   `overflow-y: auto; overflow-x: hidden`, so it exempted every descendant from the clipping
   check on **both** axes. Split into `scrollableAncestor(el, 'x'|'y')`; `clipped` now tests
   each axis against its own ancestor.
2. `horizontalScrollers` counts only `overflow-x: auto|scroll`. Overflow inside
   `overflow-x: hidden` has no scrollbar to count, which is *worse* than a scrollbar — the
   content is unreachable — and read clean. New number **`hiddenOverflowX`**, excluding the
   two legitimate cases: the `.sr-only` visually-hidden idiom (1×1 absolute) and
   `text-overflow: ellipsis` (`.fwin-title` reads `81>76` and shows the user an ellipsis).
   Without those exclusions the number is **4** on a surface with no defect.

**The same three sizes, before and after the instrument fix, one window, one session:**

| size | clipped before | clipped after | hiddenOverflowX | dead % of viewport |
| --- | --- | --- | --- | --- |
| compact 260×170 | 0 | **160** | **1** (`.fwin-body 498>248`) | 0.9 |
| sub-min 200×130 *(control)* | 0 | **178** | **1** (`498>188`) | 0.7 |
| default 820×580 | 0 | **0** | **0** | 10.7 |
| maximized 1264×765 | 0 | 0 | 0 | **8.7** |

The control now fails and fails *further* than the size it controls (160 → 178), and default
and maximized stay clean, so the fix is discriminating rather than merely louder.

**What it was hiding is a real product defect, and it is not Liquid's.** At 260×170 every
`div.dict-entry` measures **480×… in a 258 px body** — 268 px of each entry unreachable, with
`.fwin-body`'s `overflow-x: hidden` swallowing 250 px of it. Driven in **standard**
presentation at the same widths the numbers are **identical** (`display: block`, `cols: none`,
overflow 268 / 128 / 0 at 260 / 400 / 560), so the `.fwin-liquid .dict-view` grid is not the
cause. `styles.css:4790` `.dict-entries { repeat(auto-fill, minmax(30rem, 1fr)) }` is: 30rem is
**480 px**, a hard track floor that overflows any container narrower than it. Landed by this
plan's own 2026-08-18 category-4 slice, unscoped, so it regressed standard windows too.
Three more rules carry the same shape — `styles.css:9423` `.dict-ex-list` (30rem),
`lexiconExamples.css:58` `.lexicon-examples-list` (30rem), `liquid-window.css:166`
`.fwin-liquid .dict-view` (28rem).

**Maximized re-derived this turn on a fresh window, not inherited:** 1264×765, dead region
`379×237 at grid 28,19` = **8.7%** of viewport, canvas 55.0%, chrome 4.3% — reproduces the
2026-08-22 figure exactly. Round trip through the product's own `toggleMax`:
`left: 60px; top: 24px; width: 820px; height: 580px` byte-identical, z-index 23 → 26.

**Category 4 is NOT scored this turn and the score is not carried forward.** Three of its four
numbers now fail at a size the product itself allows.

## 2026-08-22 · backup · the hard floors clamped — compact 160 clipped → 0, and the control still fails

Five rules, four sheets, one shape: `minmax(<n>rem, 1fr)` reads like "at least this wide,
more if there is room" and is a **hard** minimum, so below it the track keeps its width and
the row leaves the frame. `min(<n>rem, 100%)` clamps the floor to the container. Three of the
five were landed by this plan's own earlier category-4 slices, unscoped, so they regressed
standard windows too.

| rule | file | floor |
| --- | --- | --- |
| `.dict-entries` | `styles.css:4790` | 30rem → `min(30rem, 100%)` |
| `.dict-ex-list` | `styles.css:9423` | 30rem → `min(30rem, 100%)` |
| `.lexicon-examples-list` | `lexiconExamples.css:58` | 30rem → `min(30rem, 100%)` |
| `.fwin.fwin-liquid .dict-view` | `liquid-window.css:166` | 28rem → `min(28rem, 100%)` |

Two nowrap control rows survived that fix and were measured separately: `form.dict-search`
at **324 px** (the input plus a 71 px *Search* button) and `.lexicon-lens-picker` at
**297 px** (three lens buttons), both in a 258 px body — the Search button and the
*Interlinear* lens were unreachable, not merely tight. Both now `flex-wrap: wrap`.

**Liquid Dictionary, 食べる, 8 entries, focused, one session** (`debug/l4c-sizes.cjs`,
`debug/l4c-max.cjs`):

| size | clipped | overlaps | h-scroll | hiddenOverflowX | dead % of viewport | canvas |
| --- | --- | --- | --- | --- | --- | --- |
| compact 260×170 | 160 → **0** | 0 | 0 | 1 → **0** | 1.2 | 12.3% |
| default 820×580 | **0** | 0 | 0 | **0** | **10.7** | 32.3% |
| maximized 1264×765 | **0** | 0 | 0 | **0** | **8.7** | **55.0%** |
| sub-min 200×130 *(control)* | **3** | 0 | 0 | **1** (`243>188`) | 0.5 | 12.7% |

**The control fails, and only below the size the product supports.** That is the shape this
category needed: 200×130 is not reachable through the product, 260×170 is, and the instrument
now separates them. Maximized re-measured **identical** to before the fix — `379×237 at grid
28,19`, 8.7%, canvas 55.0% — so the clamp is width-honest and changes nothing where nothing
was wrong.

**Standard presentation, same three sizes, as the parity control:** compact **0/0/0/0** (dead
1.4%), default **0/0/0/0** (dead 8.9%), and its 200×130 control fails identically (3, 1).
Three of the five rules are unscoped, so standard was supposed to improve too, and it did.

**Five source mutations, each red for its own case, each restored byte-identical**
(`debug/l4c-mut2.cjs`, `gridTrackFloorsFitTheWindow.test.ts` + `liquidWindowPresentation.test.ts`,
42 tests): `.dict-entries` unclamped → **2** red; `.dict-view` unclamped → **3**;
`.dict-search` stops wrapping → **1**; `.lexicon-lens-picker` stops wrapping → **1**;
`.lexicon-examples-list` unclamped → **2**.

**Trap:** `styles.css` carries other tracks' hunks, so `git add` on it is wrong.
`node debug/l4c-stage-styles.cjs` rebuilds HEAD + these three edits and hashes `--no-filters`;
`git diff --cached HEAD` on the path shows exactly three hunks. A second trap: writing a CSS
file while the dev Vite server holds it throws `UNKNOWN: unknown error` about one run in five,
so the mutation driver retries the write and re-reads the bytes back rather than trusting the
first attempt.

**Category 4 is still NOT scored.** All four numbers now pass at all three sizes with a
control that fails — but the rubric's re-score is from scratch on the fixing commit, and a
category is not a scorecard: 2, 5, 7 and 8 have no live number on this surface yet.
