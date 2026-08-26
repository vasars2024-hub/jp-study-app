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

## 2026-08-24 — category 4 SCORES 10, after the re-drive found the pattern back

**The re-drive was not a formality.** Re-run on the current tree, compact 260x170 reported
**26 clipped** and `div.fwin-body 273>248` where 2026-08-22 recorded 0 and 0. The same defect
class as that slice — a hard grid floor — in `components/lexicon/conjugationTable.css`:
`repeat(auto-fit, minmax(15rem, 1fr))` keeps its 240px track in a 248px body, and `.fwin-body`
is `overflow-x: hidden`, so 25px of every conjugation row is unreachable rather than scrolled.

**Why the guard did not catch it, which matters more than the fix.**
`gridTrackFloorsFitTheWindow.test.ts` scanned a hand-written list of **four** sheets — the ones
the 2026-08-22 measurement happened to name. `conjugationTable.css` was never on it, so the
guard was green while the defect shipped. The list is replaced by a walk of every `.css` under
`src/renderer`: **72** assertions now, from 42, and no other sheet carries a bare floor over the
212px content minimum. A guard scoped to the files a previous defect touched cannot catch the
next one.

**Fix:** `minmax(min(15rem, 100%), 1fr)`, the same clamp the four earlier rules use.

**Live, Liquid Dictionary, 食べる / 8 entries, forest-night, one session, after the fix:**

| size | clipped | overlaps | h-scroll | hiddenOverflowX | dead % of viewport | chrome | canvas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| compact 260x170 | 26 -> **0** | 0 | 0 | 1 -> **0** | 1.2 | 19.3% | 12.3% |
| default 820x580 | **0** | 0 | 0 | **0** | **10.7** | 5.7% | 32.3% |
| maximized 1264x765 | **0** | 0 | 0 | **0** | **8.7** | 4.3% | **55.0%** |
| sub-min 200x130 *(control)* | **3** | 0 | 0 | **1** (`243>188`) | 0.5 | 25.1% | 12.7% |

All four rubric numbers pass at all three sizes: 0 clipping and 0 overlap, no horizontal body
scroll, no dead region over 15%, and the dominant canvas growing **12.3 -> 32.3 -> 55.0%** while
chrome falls **19.3 -> 5.7 -> 4.3%** — content taking the extra space, not chrome.

**Controls, red.** (a) 200x130, below the product's own `MIN_W`/`MIN_H`, fails **3 clipped /
1 hiddenOverflowX** — and only below the supported size, which is the shape this category needs.
(b) Source mutation: reverting the clamp to `minmax(15rem, 1fr)` turns the guard red in **two**
places at once — the sweep (`bare rem floors wider than 212px: ['minmax(15rem, = 240px']`) and
the named-rule assertion. Restored, 72 passed. The window's inline `style` printed
**BYTE-IDENTICAL: true** on every run; maximize restored through the product's own control.

**Trap, and it cost a restore:** `cp x /tmp/y` under the Bash tool and `fs.readFileSync('/tmp/y')`
under node do **not** name the same file — node resolves it to `C:\tmp\y` and throws ENOENT, so
the mutation was left on disk. Keep a mutation's backup inside the repo, or restore with an
editor rather than a shell copy.

**Category 4: 10/10.**

## 2026-08-24 (late) · primary — category 4's control could not fail, and the reason was the blank window

**The control returned VOID and the probe's own comment already said why.** Dictionary puts
everything inside one vertical scroller, so by the `unreach` definition it cannot clip at any size —
so a control run on Dictionary alone proves nothing, and **Media is the discriminating case**. Media
refused with `no .fwin titled Media` on every run, because the only `media` row on this desktop was
the persisted `section: 'media'` window whose body was EMPTY (see `6b490fc3`). The category was not
failing its control; it had no control, and had not had one for as long as that row has existed.

**Restarted on `6b490fc3` (pid 37540). The row loads as `player`, the window is titled `Media`, and
its body carries 618 chars where it carried 0.** Same probe, same eval:

| window | entry 820×580 | compact 260×170 | sub-min 200×130 | restored |
| --- | --- | --- | --- | --- |
| Dictionary | 0 clipped / 0 h-scroll | **0 / 0** | **0 / 0** | 0 / 0, `styleIdentical true` |
| Media | 0 clipped / 0 h-scroll | **55 clipped / 1 h-scroll** | 54 / 1 | **0 / 0**, `styleIdentical true` |

`brokeAtSubMinimum: ["Media"]`, `allRestoredExactly: true`,
**`CONTROL FAILED AS REQUIRED on Media — category 4 probe is proven`**.

**Dictionary's four rubric numbers on this tree, restarted:** clipped **0**, overlaps **0**,
horizontal body scrollers **0**, `hiddenOverflowX` **0**; dead region **10.7%** of viewport against
a 15% bar; chrome **5.7%**, dominant canvas **32.3%**. **Category 4 (Dictionary) = 10/10.**

**A finding against Media, recorded not fixed.** Media clips **55 boxes at 260×170**, which is the
product's OWN `MIN_W`/`MIN_H` and therefore a supported size, not a control size — `nav.mc-nav` and
its buttons lead the list, and `chromePct` is **49.9%** at 820×580 against Dictionary's 5.7%. That
is category 4 work for whenever Media is scored; it is not Dictionary's score.

## 2026-08-25 · backup — Video's category 4, first measurement: FAILS the dead-region bar at DEFAULT size

`TITLES` now reads `window.__lqScoreTitles` with `['Dictionary', 'Media']` kept as the default, so
every run already recorded above reproduces. Gate 461 names **Video and Dictionary**, and `Media`
is a third window — the Video one had never been in this probe's population. No new probe file.

Live, pid 32344, viewport 1264x821, Video at **1080x700** (`standard`, `forest-night`), library
holding **36 items** with the current browser view rendering **2 cards** — a real populated state,
not an empty harness:

| number | Video | rubric bar |
| --- | --- | --- |
| clipped | **0** | 0 at every size |
| overlaps | **0** | 0 at every size |
| horizontal scrollers / hidden `overflow-x` | **0 / 0** | absent |
| largest contiguous dead region | **431x532 = 22.1% of viewport** (30.3% of the window) | **≤ 15%** |
| chrome share | 48.1% (`fwin-bar`, `mc-sidebar`, `mc-topbar`, `medialib-rail`, `medialib-browser__head`) | content grows, not chrome |
| dominant canvas | 58.3% | — |

**Category 4 on Video: NOT 10**, and it fails on the one number that is not zero. The dead region
is the media-library grid: five chrome bands take 48.1% of the window, and what is left renders two
cards against a 431x532 void. Compact and maximized are two further measurements that have not been
taken, so this is a floor on the finding, not the whole of it.

**Next slice, named rather than half-started:** the grid's sparse-result layout. It needs the same
treatment at all three sizes plus the below-minimum negative control, which is a leg of its own.

## 2026-08-25 · primary — Video's category 4 at all three sizes; every number now passes except one

Live, pid 32344, viewport 1264x821. Three product commits: `111ed86a` (sparse shelf), `125b2e80`
(the 260x170 floor), `06294a2f` (the test that pinned the old sidebar contract).

**Default 1080x700, on the shelf the previous turn measured (Continue watching, 1 title):**

| number | before | after | bar |
| --- | --- | --- | --- |
| clipped / overlaps | 0 / 0 | 0 / 0 | 0 |
| h-scrollers / hiddenOverflowX | 0 / 0 | 0 / 0 | 0 |
| largest dead region | **22.1%** of viewport | **9.7%** (13.3% of window) | ≤ 15% |
| chrome / dominant canvas | 48.1 / 58.3 | 48.1 / 58.3 | content grows |

**Compact 260x170 — the product's OWN MIN_W/MIN_H, so a supported size, not a control size:**
clipped **30 → 0**, h-scrollers **1 → 0**, hiddenOverflowX 0, and all **9 of 9** rail buttons still
present. `restoredExactly true`. Five distinct causes, all in `125b2e80`'s message.

**Maximized 1264x765:** clipped 0, overlaps 0, h-scroll 0, hiddenX 0.

**THE SHELF DECIDES THIS CATEGORY'S NUMBERS AND BOTH READINGS ARE HONEST.** On the 1-title shelf
the maximized dead region is **16.5%** — over the bar — because one poster cannot fill a 1264px
pane and there is no second card to put beside it. On the populated shelf (`Recently added`,
8 titles / 36 files, 8 cards) the same probe reads **4.4%** maximized and **3.6%** at default.
So: category 4 passes on the library's normal state and fails on its sparsest one, and the fix for
the sparse one is real content in the space (the detail panel), not more layout.

**Category 4 on Video: NOT YET SCORED 10, and the missing piece is the control, not a number.**
`l1-use-of-space-control.js` now returns **`VOID — nothing broke below the supported minimum`** on
Video and Dictionary: the surface degrades gracefully at 200x130 now, so shrink-to-break cannot
fire. What DID discriminate this turn is stronger — the same probe, same surface, same size, read
30 clipped and then 0 across `125b2e80`. The injected-box control (`l1-max-clip-control.js`,
hardcoded to Media) is the remaining leg and is the next slice.

**Two traps.** (1) `l1-use-of-space-control.js` resizes and measures in ONE eval by design, so
ResizeObserver has not fired and `VirtualGrid` still holds the pre-resize column math — it reported
a horizontal scroller at compact that a settled two-step read as 0. Any grid number from that probe
is pre-settle. (2) `git cat-file blob HEAD:$f | grep -c $'\r'` nested inside `$(...)` in double
quotes loses the ANSI-C quoting and counts lines containing the LETTER r — 133 of 138 lines, which
reads exactly like "fully CRLF". Every blob in this repo is LF; read the buffer from node.

## 2026-08-25 · backup — the maximized control fires on Video, and it exposes a failing number

`l1-max-clip-control.js` was hardcoded to `TITLE='Media'`; it now reads `window.__lqScoreTitle`,
the same idiom as `l1-maximize-drive.js`. No new probe was written.

Sequence, one bridge call each, Video maximized to 1264x765 through its own Maximize button:
baseline `clipped 0` → inject → **`clipped 1`, `div.__l1_ctrl_clip`** → cleanup → **`clipped 0`**.
Dictionary, measured in the same three calls, stayed at 0 throughout. **CONTROL FIRED AS REQUIRED** —
the maximized zero is a real zero, not a probe that cannot see. Video restored to
`left: 92px; top: 40px; width: 1080px; height: 700px` by a second click on the product's own button,
byte-identical to the pre-maximize string the drive probe recorded.

**Category 4 is NOT 10 on Video, and the reason is a number, not a missing control.** At maximized
the largest dead region is **284x602 = 16.5% of the viewport** against a 15% bar
(`deadRegionBox: 284x602 at grid 31,7`, i.e. the strip from just right of the single card to the
frame edge, running the full height). clipped 0 / overlaps 0 / horizontalScrollers 0 /
hiddenOverflowX 0 all pass. The cause is the one-title "Continue watching" shelf: `medialib-grid`
is 764 wide holding one 240x438 card, centred, so ~262px is dead either side and the right one
reaches the frame.

`1a00e1bd` was landed against this and did NOT move it: `.mc-workspace`'s third grid track was a
fixed 58px reserved for `PersistentPlayer`, which only mounts when something is playing, so Video,
Library, Settings, Discover, Study and Readiness each paid 58px for an absent element. `auto`
collapses it — `.mc-content` **592 → 650**, `.medialib-grid` **497 → 555**, dominant canvas
**62.4% → 68.6%** — but the dead rect already ran to the body bottom either way, so it is unchanged
at 284x602. Negative control on the Media window: clicking Music mounts the bar at exactly 724x58
and `.mc-content` returns to 407, so the present-player case is byte-identical.

**Category 4 is PARKED at 9 of its 10 requirements** with an exact blocker: the maximized dead
region needs to fall below 15% of the viewport, i.e. the dead strip must lose ~26px of its 284px
width or ~60px of its 602px height. Growing the card is nearly enough and nearly is not a 10 —
`maxColWidth` is height-bounded (`MediaPosterCard.tsx:36`), and at the 555px grid the ceiling is
~318px, which lands at 14.9%. A layout that passes by 0.1% is not a 10 either. The next worker
should treat a sparse shelf as a presentation decision, not a column-width one.

## 2026-08-25 · primary — Video's category 4 closes: the sparse shelf became a presentation

`cdd431d3`. The 16.5% was real and the fix was not layout. `MediaSpotlightCard` renders when a
shelf holds exactly ONE entry in grid view: the art on the left, and beside it the title, the
subtitle status, four facts (type, year, watched-of-total, subtitle languages), the watch
progress and Resume/More. `min-height: 100%` on the spotlight plus `align-content: space-evenly`
on the facts is what removed the band under it — without those the box was 764x428 in a 555-tall
pane and the dead region only fell 16.5% → 15.5%.

**Video, `Continue watching` (1 entry), through the product's own Maximize button:**

| size | clipped | overlaps | h-scroll | hiddenX | dead region | dominant canvas |
| --- | --- | --- | --- | --- | --- | --- |
| maximized 1264x765 | 0 | 0 | 0 | 0 | **16.5% → 7.8%** of viewport (17.7 → 8.3 of window) | 68.6% |
| default 1080x700 | 0 | 0 | 0 | 0 | **8.3%** of viewport (11.4 of window) | 64.7% |
| compact 260x170 | 0 | — | **0** | 0 | — | — |
| sub-min 200x130 | 0 | — | **1** | 2 | — | — |

`restoredExactly true`; verdict `CONTROL FAILED AS REQUIRED on Video`. Regression control on the
populated shelf (`Recently added`, 8 titles): grid true, spotlight false, 8 cards, dead 3.9%.

**Category 4 on Video is a 10:** all four numbers pass at every supported size, the maximized
injected-box control fired on 2026-08-25, and the compact/sub-minimum control fails as required.

**Two traps I paid for, both mine, so nobody reads them as pre-existing.** (1) `minmax(140px, 1fr)`
is a FLOOR the track keeps when the pane is narrower than it — at the product's own 260x170 the
facts grid gave the pane a horizontal scrollbar at 153 > 100. `min(140px, 100%)` is the idiom.
(2) `flex-wrap: wrap` on a COLUMN flex row sizes its line to the widest item, and `align-items:
stretch` then stretches to the LINE, not the container: the two buttons stayed 98 wide inside a
74px track (111 > 100) with `min-width: 0` AND `white-space: normal` both already applied.
`flex-wrap: nowrap` is what makes stretch mean the pane.

**One trap that is not mine and will cost the next worker a measurement.** Creating a new module
makes Vite do a FULL RELOAD, not an HMR patch. That reset every `window.__lq*` probe global (so
`l1-maximize-drive.js` silently fell back to its `'Dictionary'` default and maximized the wrong
window) and reset the Video window's Media Center page from Library back to Video. Re-set the
globals and re-select the page after any run that adds a file.

## 2026-08-25 · primary — Video's maximized third, measured in LIQUID at last

The category was carrying two of three sizes in liquid and the maximized third from a
standard-presentation run, which the rubric does not let stand. Process 32344, product tree
`44bf5cca`, Video 1080×700 `liquid` on `Recently added` (8 titles / 36 files), viewport
1264×821, `forest-night`.

| Video, liquid | box | clipped | overlaps | h-scroll | hiddenOverflowX | dead % of viewport | chrome % | canvas % |
| - | - | - | - | - | - | - | - | - |
| default | 1080×765 → **1080×700** | **0** | **0** | **0** | **0** | **5.8** | 49.8 | 64.7 |
| maximized | **1264×765** | **0** | **0** | **0** | **0** | **7.0** | **45.8** | **68.6** |

**The content-to-chrome half is the one that needed the maximized number to mean anything.**
The rubric asks for content growing into extra space *rather than chrome*, which is a
comparison, not a level: from default to maximized the chrome share **falls 49.8 → 45.8%**
while the dominant canvas **rises 64.7 → 68.6%**. The five chrome parts are the same at both
sizes (`div.fwin-bar`, `aside.mc-sidebar`, `header.mc-topbar`, `nav.lq-contextual`,
`header.medialib-browser__head`) — nothing new appears to eat the extra width.

**Negative control, fired in this session, at this size, in this presentation.**
`l1-max-clip-control.js` injects one 300 px box 20 px inside the right frame edge with no
scrollable ancestor: Video clipped **0 → 1 → 0**, and Dictionary stayed **0** throughout, so
the control is target-scoped rather than a global trip. `l1-max-clip-control-cleanup.js`
reports `stillPresent: false`.

**Restore is the product's own.** `toggleMax` stores the pre-maximize box and a second click
restores from it: `left: 92px; top: 40px; width: 1080px; height: 700px;` before and after,
byte-identical, `max` false, `data-presentation` still `liquid`. **`restoredExactly: true`**
(z-index legitimately moves, 153 → 157, because restoring raises the window).

**Video category 4 = 10/10**, all three sizes in liquid — compact 260×170 was re-derived in
liquid on 2026-08-24 (`4a7fa118`'s turn, 0 clipped / 0 overlap / 0 h-scroll, restored exactly).

## 2026-08-26 · primary — category 4 gets its one harness, and six blind spots the one-off probes never had a surface to reveal

| surface | default | compact | maximized | dead % (d/c/m) | chrome→ | canvas→ | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `@.reader` (manga) | 1264x821 | 924x561 | 1600x1000 | 6.8 / 5.8 / 8.3 | 20.6→16.7 | 65.5→71.9 | **PASS 10/10** |
| `Library` | 820x580 | 260x170 | 1264x765 | 3.1 / 0.9 / 6.7 | 21.6→10.2 | 31.8→53.9 | **PASS 10/10** |
| `Immersion` | 820x580 | 260x170 | 1264x765 | 2.9 / 0.6 / 7.0 | 27.3→19.2 | 47.1→61.5 | **FAIL** (compact only) |
| `Reading Finder` | 820x580 | 260x170 | 1264x765 | 2.4 / 0.5 / 20.0 | 12.7→9.8 | 42.9→35.7 | **FAIL** |
| `@.reader` (book) | 1264x821 | 924x561 | 1600x1000 | 9.4 / 7.5 / **38.3** | 0→0 | 86.6→89.0 | **FAIL** — lead, not a cell |

`probes/cat4-use-of-space.cjs`, one harness, surface as an argument. Every row above fired its own
injected clip 0 → 1 → 0 with removal proven. Board: **2 of 6**; VN and Novels not yet run.

**Every one of the five corrections this took was a FALSE NUMBER, not a preference.** They are in
the harness header with the measurement that produced each. The pattern is the finding:

- **8 — an occluded window has no ResizeObserver.** `visibilityState: hidden` is what a window
  reads while a terminal holds the foreground. Two runs of `@.reader` at the SAME 924x561 returned
  `overlaps: 0` and `overlaps: 2`; the 2 was 51px of stale `.manga-spread` over `.reader-footer`,
  the 0 was luck, and the 0 had already been written to a baseline as PASS 10/10. Reads focus and
  refuse now, and two consecutive runs are byte-identical.
- **9 — a `.fwin`'s inline style carries its z-index.** Restoring from maximize raises the window,
  so Library returned to an identical box at z 532 against 446 and the category scored FAIL.
- **10 — a CSS `background-image` paints content.** Library's covers are `div.cover` with
  `url(media://…/cover.jpeg)` and no `img`: 24 cards of 180x240 read as dead space, 15.9% against
  a bar of 15. Marking `url()` took it to 6.7. Gradients stay uncounted or every themed panel
  marks itself covered and the detector can never find real dead space again.
- **11 — `position: fixed` is not the viewport under containment.** Every `.fwin` carries
  `contain: content`, so the window is the containing block: the clip box landed 197px off on
  Immersion (frame `left: 196`), outside `.fwin-body`, and the control silently did not fire.
  Reading Finder and Immersion both returned VOID rather than a score.
- **12 — an opaque content host.** `iframe`/`webview`/`object`/`embed`. Immersion's stage is a
  950x619 `webview`; dead region 9 / 0.6 / 24.9 → 2.9 / 0.6 / 7.0.
- **13 — a text field is not a layout overflow.** `input.immersion-url` read 210>184 at the
  window's own default size. Every text field in the app with a long value would have failed.

**Why six at once, and why this is RULE 1 paying out rather than bad luck.** The five one-off
probes this harness replaced were only ever pointed at Dictionary, Media and Video — none of which
has a cover grid, a webview or an address bar. A sixth bespoke probe would have found none of
these, because it would have been written to fit what it was aimed at. Six surfaces through ONE
instrument is what exposed them.

**Product fix landed, `6e783f86`.** Reading Finder's `nav.reading-workspace-nav` measured
`scrollWidth` 784 in `clientWidth` 782 — eight tabs at `flex: 0 0 auto` grew a horizontal scrollbar
to reach two pixels, at the window's OWN default size, pushing a tab out of reach with no
affordance. The narrow rules existed the whole time in a `@media (max-width: 680px)`: the same
viewport-instrument error `00658d37` fixed in the VN panel, in a second sheet. `.reading-workspace`
is now a named `inline-size` container, the block becomes `@container rfwork`, tabs shrink with an
ellipsis on the label only (full text stays in the DOM, so the accessible name is untouched), and
below 680px of pane the strip WRAPS. `horizontalScrollers` 1/1/0 → 0/0/0.
`readingWorkspacePaneReflow.test.ts` guards the general form; revert gives 4 red of 7.

**Traps for the next worker, all paid here.**
1. **`@.reader` IS TWO SURFACES.** The first Library card is a BOOK — `div.reader-stage`, no
   `.manga-spread`, no `.nav-zone` — and it scored under `l6-manga` before anything checked. Pick
   by `.manga-ocr-badge` and assert `.manga-spread` before believing the number.
2. **The desktop window has a hard minimum.** `/bounds` asked 260x170 returns 924x561, so every
   root leg records `achieved` and `clampedByOsMinimum` beside `requested`.
3. **A surface in its EMPTY state cannot be scored for use of space.** Immersion's first read was
   "Open a page to begin immersion reading." — the rubric caps that rather than scoring it. Load
   real content through the product's own starter first.

**Next slice, in order.** Reading Finder's three remaining bars: 40 clipped `res-card`s at compact
with `main.reading-workspace-panel 280>202`, a 1262x164 dead band at the bottom when maximized,
and the canvas share FALLING 42.9 → 35.7 as the window grows — one catalogue that does not use the
space it is given, which is likely one fix for all three. Then Immersion's compact leg
(`div.immersion-reader` 97 wide inside 54, `div.immersion-stage` 284>178; Library holds 0 clipped
at that same size, so it is reachable, not a floor). Then RUN VN and Novels.

## 2026-08-26 (later) · primary — two surfaces close, and the harness was scoring a panel it never resized

| surface | default | compact | maximized | dead % (d/c/m) | chrome→ | canvas→ | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Reading Finder` | 820x580 | 260x170 | 1264x765 | 2.4 / 0.5 / **7.2** | 12.7→9.8 | 42.9→**50.6** | **PASS 10/10** |
| `Immersion` | 820x580 | 260x170 | 1264x765 | 2.9 / 0.6 / 7.0 | 27.3→19.2 | 47.1→61.5 | **PASS 10/10** |
| `@.visual-novel-panel` | 782x513 | 222x103 | 1226x698 | **16.9** / 0.3 / **47.9** | 37.3→20.9 | 17.7→**9.2** | **FAIL** |

Board: **4 of 6**. Novels (`@.reader` with an EPUB) not run. Each row fired its own injected clip
0 → 1 → 0 with removal proven.

**Reading Finder, `302588d4`.** One declaration closed all three bars. `repeat(auto-fill,
minmax(280px, 1fr))` is a hard floor AND the number that decides the column count: at the shipped
820x580 the cards are 380px, at maximized (a 1226px pane) the SAME cards are 296px — the window
grew and the card shrank — so the catalogue ran 4x2 and left a 1262x164 dead band. A 320px floor
takes three ~400px columns; `min(320px, 100%)` stops the floor becoming an overflow at a 202px
pane, where it had clipped 40 boxes. Swept repo-wide: **69 bare px floors over 212 across the 67
tracked sheets** at HEAD, **17 in the `repeat()` shape**, all 17 clamped. The other 52 are explicit
templates where `min()` is not the fix — that shape wants `minmax(0, …)` — so the new sweep latch
is scoped to `repeat()` and says why.

**Immersion, `efba53e4`.** `min-width: 220px` on the webview beats its own `max-width: 42%` and
`flex-shrink: 0` never hands the pixel back, so at a 178px stage the reader beside it was 64px wide
with a 0px text column. THE CONTAINER HAS TO BE THE STAGE: a docked tool never squeezes the
document below `READING_CANVAS_POLICY.minContentWidth` (384), so an 820px window holds a 516px
stage while a WIDER window with two tools docked holds a 352px one — a `@media`, or a container on
`.immersion-body`, stacks the wrong one. A container cannot answer its own query, so `flex-flow:
row wrap` is the stacking mechanism. **What wrap costs, and it shipped as a 64-box regression
mid-slice:** a nowrap row sizes items to the container's cross size, a wrapping one sizes each LINE
from content and `align-content: stretch` only grows. The reader became 1075px tall in a 434px
stage and `clipped` went 0 → **64 at the surface's own default size**. `max-height: 100%` pays for
wrap; 45% / 55% makes the two stacked lines add up to one stage.

**CORRECTION 14 — `@` means "a CSS selector", not "the OS window".** The first five surfaces hid it
because every `@`-rooted one so far replaces the desktop shell. `@.visual-novel-panel` renders
INSIDE the Immersion `.fwin`: `/bounds` resized the desktop while the `.fwin` kept its inline
820x580, so the panel never changed size and all three legs would have returned the SAME numbers
under three different labels — correction 4's failure mode with a pulse. The lever is
`closest('.fwin')` now, measured from the DOM. Regression control: `Reading Finder` re-run on the
corrected harness is **byte-identical to the committed baseline**, all nine numbers.

**NEXT, and it is the opening slice.** VN's three bars, all one shape: a 920x541 dead region at
maximized (**47.9%** against a bar of 15), 16.9% at its own default, and the canvas FALLING
17.7 → 9.2. The panel does not use the space it is given, at any size. Then RUN Novels.

### CORRECTION, same turn — VN's dead region was the EMPTY STATE, and `adae4059` said otherwise

`adae4059` recorded VN at `dead 16.9 / 0.3 / 47.9` and called the 920x541 region at maximized "a
product fix, not a measurement one". **It was neither.** `main.visual-novel-workspace` held one
child — `p.muted` reading "Add a local visual novel to begin capturing Japanese dialogue." — and
the rubric caps an empty harness rather than scoring it. This file's own trap 3, one entry above,
written by the previous turn and not applied here. The baseline has been replaced with the loaded
run; the empty numbers are recorded only in this paragraph, as the trap.

**Seeded through the product's own form, no native dialog:** the three `.visual-novel-add` fields
are typeable and `Browse` is only a convenience. Native value setter + `input`, then
`Add to library` → the workspace goes from one `p.muted` to **ten real sections** (summary,
metadata, sources, community, progress, routes, script import, capture, analysis actions, reading
overlay). **Trap: `input[type=text]` is an ATTRIBUTE selector.** These inputs carry no `type`
attribute, so `.type` reads `text` while `querySelectorAll('input[type=text]')` returns **0** — the
first seeding attempt refused with "EXPECTED 3 INPUTS, got 0" on a form that was right there.
Removed after scoring: `Remove` returned the library to `count: 0` and the identical empty string,
so nothing was left in the user's library.

| leg | box | clipped | h-scroll | dead % | chrome | canvas |
| --- | --- | --- | --- | --- | --- | --- |
| default | 782x513 | 0 | 0 | **5.8** | 37.9 | 19.2 |
| compact | 212x103 | **7** | **2** | 0.3 | 62.4 | 28.6 |
| maximized | 1226x698 | 0 | 0 | **12.9** | 27.4 | **13.5** |

**Dead region passes at every size** — 47.9 → 12.9 at maximized, entirely from loading content.
What is REAL and is the next slice: the compact leg (`div.lq-reading-tool-body 180>172` and
`main.visual-novel-workspace 219>128`, 7 clipped, all inside the sheet the tool becomes at that
width) and `contentGrowsNotChrome` (canvas **19.2 → 13.5** while chrome falls 37.9 → 27.4 — the
workspace does not take the width the chrome gives back). Injected clip fired 0 → 1 → 0.
