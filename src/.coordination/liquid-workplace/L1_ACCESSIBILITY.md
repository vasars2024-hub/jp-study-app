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

## Category 1 verdict: neither surface is a 10

Contrast, keyboard and reduced motion pass on both. **The 32 px hit-target bar fails on both** —
Dictionary 45 of 54, Media 19 of 31 — with the fix deliberately deferred to L4 as a hit-area
change rather than a visual one. Plus the one-palette limit above. `LIQUID_SCORECARD.md` stays
empty: two scored categories out of eight is still not a scorecard.
