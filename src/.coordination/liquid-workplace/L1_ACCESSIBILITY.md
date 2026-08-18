# L1 — accessibility on Dictionary and Media, and the one bar that fails

Authority: `src/LIQUID_UI_RUBRIC.md` **category 1**. Four numbers, and 10 requires all four.

Instruments: `probes/l1-accessibility.js` (contrast, hit targets, keyboard),
`probes/l1-reduced-motion.js` (motion). Controls: `probes/l1-a11y-control.js` +
`-cleanup.js`.

## State driven, and it is not an empty harness

`data-theme=forest-night`, viewport 1264×821. **Dictionary carrying 8 `dict-entry` results for
食べる**, driven through the real search input and Search button — the same functional state
`L1_USE_OF_SPACE.md` measured, reproduced on a fresh app instance. **Media on its library page
with 33 recently-added and 2 continue-watching rows.** Both reopened from the Start menu, since
another track had closed them.

| | Dictionary 820×580 | Media 1080×700 |
| --- | --- | --- |
| Text runs measured / unmeasurable | 141 / **0** | 37 / **0** |
| **Minimum contrast ratio** | **5.30:1** — `span.lexicon-etymology-source` 11.9 px | **5.13:1** — `small` "Library" 11 px |
| Text below its WCAG bar (4.5:1 body, 3:1 large) | **0** | **0** |
| Interactive controls | 54 | 31 |
| Smallest hit target (rendered) | `button.dict-star` **18 px** | `input` **19 px** |
| **WCAG 2.5.8 failures, spacing exception applied** | **0** | **0** |
| Controls under the rubric's own 32 px bar | **45 of 54** | **19 of 31** |
| **Controls not keyboard-reachable** | **0** | **0** |
| Motion duration under reduced motion | **0.001 ms** (8 animated → 0) | **0.001 ms** (30 animated → 0) |

## Three of the four numbers pass. The fourth is a conflict, not a defect

**Contrast passes** on both, with zero unmeasurable runs — that last zero matters, see the
parser note below. **Keyboard passes**: every one of 54 and 31 controls took focus when actually
focused, not merely inspected for `tabIndex`.

**Reduced motion passes** through both shipped mechanisms, and this is where scoring from source
would have produced a false FAILURE — the rarer and more embarrassing direction. Grepping
`styles.css`/`shell.css` finds the media query scoped to `.game-arena *` (`styles.css:20942`) and
the `.reduce-motion` rules scoped to named widgets, none of which reach these two surfaces. That
reading says *fail*. It is wrong: the global rules live in `theme/a11y.css:36-46` (OS query) and
`:50-55` (`html.reduce-motion *`), both app-wide, both `!important`, both collapsing to 0.001 ms.
The live diff settled it — 8 → 0 and 30 → 0.

**Hit targets are where category 1 stops being a 10, and the two instruments disagree on
purpose.** By WCAG 2.5.8 with its spacing exception both surfaces are **clean: 0 failures**; every
undersized control has a nearest-neighbour centre distance ≥ 24 px (Dictionary's stars sit at
37.5 px and up). By **the rubric's own stricter bar — "every interactive element ≥ 32 px in its
smallest dimension" — Dictionary fails 45 of 54 and Media 19 of 31.** Both readings are stated
because §10 forbids reporting a straddled threshold without naming the path that produced it.

### Decision: record it, do not inflate the chrome

Standing auto-approval, reversible, recorded here rather than asked. The rubric's 32 px bar is
not met and category 1 is therefore **not a 10** — that is the honest score and it stands. But
the fix is **not** to grow 64 controls to 32 px now: `css-measure` §2 records that a raw size
rule generated 98 false failures suite-wide, that compact desktop chrome is compliant, and that
*inflating it is damage, not repair*. The affected controls are window-chrome buttons
(`button.fwin-b` 24 px), inline result stars (`button.dict-star` 18 px) and filter inputs — the
dense-work chrome §2.3 explicitly wants left alone. Raising them uniformly would worsen
category 4, whose dead-region number is already failing on both surfaces.

So this goes to **L4's repair list as a targeted item**: give the Liquid contextual-tool
primitives a ≥ 32 px touch surface (padding/hit-area expansion, not visual growth) and re-measure
category 1 in the fixing commit, per the rubric's "re-score after the fix". Visual size stays;
the hit area grows. Nothing is decided here that a later slice cannot reverse.

## The controls, both of which failed as required

**Contrast — a zero is not accepted until the probe produces a non-zero.** `failingCount: 0` on
both surfaces is the single most dangerous shape in this repo's history: a parser that fails to
match `color(srgb …)` returns null and scores every boundary as ABSENT rather than weak, which
once hid 23 real failures out of 52 behind a PASS. `l1-a11y-control.js` forced one real painted
element's text to its own opaque backdrop: **`failingCount` 0 → 1 at ratio 1.00**, then restored,
then re-measured back to 0 / 5.30. The zeros are true zeros.

**The parser also runs a positive control every single run**, because a parser that silently
returns null passes any test that only checks it did not throw. `color(srgb 0.87 0.49 0.50)` must
parse to **222,125,128** — an 8-bit misread would put those near 1 (near-black, the recorded 1.38
-vs-5.33 case). It reports `ok: true` on every run above. *The first version of this self-test
asserted a ratio band and failed on a correct parse* (6.12 against this panel vs. the 5.33 the
source recorded against a different one); the assertion is now on the channels, which is the
actual claim.

## The two-palette check: attempted, INVALID, and not counted

`css-measure` §0 is blunt — a contrast defect moves with the palette, and a number that does not
move is counting elements. Setting `data-theme="soft-sepia"` on `<html>` from the bridge **does
not change the palette** and must not be used for this. Measured: it repaints the CSS-variable
tokens (`--panel` → `#fffaf1`) while `body` stays `rgb(28,28,30)`, the button text stays
`rgb(245,245,247)`, and `--accent` stays `#10b981` because `osPersonalization` writes it **inline
on `<html>`**, where it outranks every stylesheet rule (§10's third recorded case). The result is
a half-applied palette that manufactured **39 "failures" at ~1.01, none of them real.** They are
recorded here only so the next worker does not rediscover them and file them.

The ratios did move (5.30 → 1.01), which shows the probe reads real computed colour rather than
counting elements. But that is **not** the §0 check, and this document does not claim it as one.
A true two-palette run must go through the product's own theme control, which persists state and
so needs capture-patch-restore. **Category 1 is therefore measured on one palette only**, and
that is a stated limit, not a pass.

## 2026-08-18 — the 32px bar is met, and it was never a size problem

The deferred item above is done: the hit AREA reaches 32px, the rendered box does not move.
`.lq-hit` (`theme/liquid-controls.css:31`) is a transparent centred `::after` sized
`max(100%, var(--lq-hit-target))`, adopted on the six control families L1 measured short —
`dict-star`, `dict-add`, `dict-ex-btn`, `word-audio`, `lexicon-knowledge`, `fwin-b`.

**The instrument is new and it is the point.** `probes/l1-hit-area.js` walks outward from each
control's centre in 0.5px steps until `elementFromPoint` stops resolving to it. Reading
`getBoundingClientRect()` — what `l1-accessibility.js` does, correctly, for layout — cannot see
an overlay, which is why this category read as unfixable without inflating chrome that
`css-measure` §2 says must not be inflated.

**Live, Dictionary in Liquid presentation, 8 `dict-entry` results for 食べる, 66 controls:**

| | before | after |
| --- | --- | --- |
| below 32px **by rect** | 46 | **46** (unchanged, by design) |
| below 32px **by pointer** | 46 | **0** |
| smallest hit region | 18.5x20.5 `dict-star` | **32x32.5** `fwin-b` |
| controls whose region shrank (theft) | — | **0** |
| contrast min / failing | 5.30:1 / 0 | **4.67:1** `fwin-b "◆"` 13px / **0** |
| keyboard unreachable | 0 | **0** |
| reduced motion over 0.01s | 8 -> 0 | **10 -> 0** (longest 0.24s `div.lq-contextual`) |

11 of 66 are `occluded` and NOT scored: 5 `lexicon-*-run` stay off-viewport after
`scrollIntoView`, 3 sit under the lens picker. An unscored control is not a passing one.

**Two controls, both red for their own case, both restored and re-measured to the numbers
above.** They mutate the live CSSOM rule, not the file — the L2 harness left a mutation on disk
when the dev server held the file open. (a) overlay `width/height: auto` -> below-by-pointer
**0 -> 46**, landing exactly on the by-rect count, which is what proves the probe reads the
overlay and not something else. (b) `--lq-hit-target: 96px` so overlays overlap -> theft guard
**0 -> 2** (`gram-level-btn` cut to 20px tall by the title bar's buttons reaching down) and the
`fwin-b` pair occluding each other. A guard that has never caught a thief is unproven.

**Traps.** (1) The first version hit-tested the required area's four CORNERS and reported 30 of
66 failing — an abspos overlay's containing block is the PADDING box, so on a bordered control
the corner lands in the 1px border gutter outside both. Artefact, not defect. (2) Measured cold
it scored ONE control: the results region is 3,194px tall in an 820x580 window and two sibling
windows were stacked on top. Raise the window and scroll each control into view, or the probe
reports a clean sweep of nothing. (3) A walk that runs out of REACH is not a walk that hit
something — conflating them made every control wider than 52px a false theft row.

**Still not a 10, and only one thing is left:** the one-palette limit below. Contrast is
measured on `forest-night` alone. Hit targets, keyboard and reduced motion now pass.

## 2026-08-18 — the second palette, run validly, and what it found

**The valid path, since the one below is not it.** `import('/src/renderer/theme/engine.ts')` from
the bridge returns the LIVE module — `listThemes()` gives 13, so it is not a duplicate Vite copy
with an empty registry that would silently fall back to the default theme. Then
`applyTheme(id, { persist: false })`, the engine's own single choke point (`engine.ts:145`),
which stamps `data-theme`, runs `applyThemeAttributes`, and dispatches the event React listens
to. `persist: false` means no capture-patch-restore is needed at all: `jp-os-theme` read
`forest-night` before every switch and after the last one.

| palette | min ratio | failing text runs | owner of the minimum |
| --- | --- | --- | --- |
| forest-night | 4.67:1 | **0** | `button.fwin-b "◆"` 13px |
| high-contrast | 8.88:1 | **0** | `span.dict-badge "#"` 10px |
| **classic-light** | **1.05:1** | **43** | `button.active "Automatic"` 13.3px |

**43 failures on a light theme, and the control says they are NOT Liquid's.** Same palette, same
window, presentation toggled to Standard: **46** failing runs, the same worst offenders at the
same ratios, and only **3** of them sit inside a Liquid region — those three read 1.05/1.09 in
BOTH presentations. Liquid contributes exactly **5**, all `fwin-b` window chrome on the
translucent frame. So this is a pre-existing app defect that L1's one-palette limit was hiding,
not a defect in the material.

**And it is not the half-applied artefact recorded below — that was checked before it was
called a finding.** On `classic-light` the tokens DO move: `--text` `#1e1e1e`, `--panel`
`#ffffff`, `--bg` `#ffffff`, `--border` `#e0e0e0`, and of the 50 inline properties on `<html>`
only `--accent` is a colour. Yet `span.dict-word` still paints `rgb(245, 245, 247)` and `body`
stays `rgb(28, 28, 30)`. The palette is applied; these elements never read it. That is the
defect: hardcoded dark-theme colours in the Dictionary's own rules, 46 runs of them —
`dict-word` x8, `li` x14, `dict-badge.freq` x6, `dict-reading` x3, `sr-only` x4.

**Category 1 is still not a 10, and the reason has changed.** It is no longer "the second
palette was never run"; it is a measured, reproducible failure on every light palette. Next
slice: tokenize those rules and re-measure all three palettes in the fixing commit. Do not
"fix" `body` — the desktop background behind windows is a different question from a window's
own content, and only the second one is white-on-white.

## 2026-08-18 — the palette run is now one command, and it exonerates the tokens

`probes/l1-palette-contrast{,-load}.js` does the whole §0 check in two calls: park the live
engine, then switch / measure / restore across three palettes. Two files because /eval is
synchronous and a promise serialises to `{}`. It **refuses** unless `listThemes()` reports 13 —
an `import()` that returns a duplicate copy has an empty registry, `applyTheme` then falls back
to the default, every palette measures identically, and the run reads as "contrast does not
depend on the palette". That refusal is the guard against the most convincing false pass here.

Liquid Dictionary, 8 results, 169 text runs, 0 unmeasurable, restored to `forest-night` with
`jp-os-theme` unchanged:

| palette | min | failing | of those, inside a Liquid region |
| --- | --- | --- | --- |
| forest-night | 4.92:1 | **0** | 0 |
| classic-light | **1.05:1** | **52** | **3** |
| high-contrast | 6.12:1 | **0** | 0 |

**The Liquid tokens are not the defect, and the probe now proves it rather than asserting it.**
It dumps the chain per palette: on `classic-light` `--glass-tint` is
`color-mix(in srgb, #ffffff 72%, transparent)` and `--lq-liquid-text` is `#1e1e1e` — white glass,
dark text, exactly right. `high-contrast` collapses it to `#000000` with `#ffff00` text. The
material tracks the palette; the 52 failures are consuming rules that never read a token. Even
the 3 inside a Liquid region are that: the lens-picker buttons paint their own light colour over
the now-white glass.

**So the fix is in `styles.css`, and it was NOT done here on purpose.** That file carries another
track's live hunks; committing it would take the HEAD+edit blob route on a mega-file at the end
of a turn. Left for a turn that owns it, now scoped to a list rather than a symptom.

## Category 1 verdict: neither surface is a 10

Contrast, keyboard and reduced motion pass on both. **The 32 px hit-target bar fails on both** —
Dictionary 45 of 54, Media 19 of 31 — with the fix deliberately deferred to L4 as a hit-area
change rather than a visual one. Plus the one-palette limit above. `LIQUID_SCORECARD.md` stays
empty: two scored categories out of eight is still not a scorecard.

## 2026-08-18 — 32 of the 52 failures were never the Dictionary's, and never Liquid's

The previous entry blamed "hardcoded dark-theme colours in the Dictionary's own rules —
`dict-word` x8, `li` x14, `sr-only` x4". **Wrong: none of those rules declares a colour.**
Walking each failing node out to the element carrying its computed colour lands on `body`
every time, and `body` is painted by **`theme/blanc.css`**, which `main.tsx:78` imports —
after `styles.css`. Its baseline was an unqualified `body { color: var(--blanc-text,#f5f5f7) }`,
and `--blanc-text` is declared on `.blanc-root`, a **descendant** of body, so at body it is
never set and the dark fallback wins the tie against `styles.css`'s `var(--text)`.

Proof, not inference: `--blanc-text: rgb(1,2,3)` on `<html>` moved `body`'s computed colour to
`rgb(1,2,3)`; `--text: rgb(7,8,9)` moved it **not at all**. Same for `--blanc-bg` vs `--bg`.

**Fix:** scope the baseline to `html.blanc-shell`, stamped in `blanc.html` /
`blanc-harness.html` — the two documents that boot `blancMain` — not by JS, which would leave
the Blanc window one frame unpainted. Rejected: fallback `var(--text)`, which fixes Study OS
but silently retunes Blanc's own baseline to the shared palette.

Re-measured here, same 8-result 食べる Liquid window, 169 runs, 0 unmeasurable:

| palette | min | failing | inside a Liquid region |
| --- | --- | --- | --- |
| forest-night | 4.92:1 | 0 (was 0) | 0 |
| classic-light | 1.39:1 | **20 (was 52)** | **0 (was 3)** |
| high-contrast | 6.12:1 | 0 (was 0) | 0 |

**Liquid now contributes zero contrast failures on any palette** — the 3 that were inside one
were lens-picker buttons inheriting body.

**Controls, both red.** Instrument: the structural check finds 3 bare root selectors in
`styles.css`, 1 in `blanc.css` with the fix reverted in memory, 0 at HEAD. Product: the Blanc
window opened live measures body `rgb(245,245,247)` on `rgb(28,28,30)` — **byte-identical to
pre-fix**. Study OS now tracks the palette (`#1e1e1e` on white; yellow on black). `html`
geometry and `--app-zoom` unchanged, as predicted: that rule declares no paint.

**Trap.** `document.styleSheets` here enumerates 51 sheets but only **296** rules and finds
*zero* `body`-color rules — it cannot see the Vite-served CSS. Never conclude "no rule sets
this" from a stylesheet walk; set the suspected var and watch the computed value move.

**Remaining 20, next slice:** `dict-badge.freq` x6 + `dict-freq-source` x3 + `.common` x1 are
truly hardcoded at `styles.css:4761-4772`; `dict-reading` x3 + `dict-ex-btn` x1 paint
`var(--accent-2)` as text on white; the last 6 are `.fwin` chrome. `styles.css` is dirty —
HEAD+edit blob.
