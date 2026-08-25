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

## 2026-08-18 — the badges follow the palette now, 20 → 10

Second half of the same sitting. The 10 remaining badge failures were the genuinely hardcoded
ones: `#aeb6ff` / `#f3a3b0` / `#c9b0e8` / `#9fd49f`, pastels picked against a dark panel, so
legible on exactly one palette.

**Shape, not four new constants.** Each variant declares one saturated
`--dict-badge-hue`; the chip tints with it at 18–20%, the label is
`color-mix(in srgb, var(--dict-badge-hue) 42%, var(--text))`. Mixing toward the palette's own
text is what makes it bidirectional — near-white reconstructs the pastel, `#1e1e1e` yields a
dark tint of the same hue. 42% is the lowest hue share clearing 4.5:1 at 10px on classic-light;
50% measures 4.28 and fails. `.dict-freq-source`'s border became `currentcolor 40%` so it
tracks the label it hangs off. `.dict-badge.bundled` was NOT in the failing set (it needs a
bundled dictionary to render) and was fixed anyway — same defect, one edit away from resurfacing.

**The appearance cost on the dark default, as hex rather than an adjective.** forest-night
`common` `#aeb6ff` → `#abbced`, `freq` `#c9b0e8` → `#c0bbd6` — slightly softer, same hue,
still 0 failing at min 4.92:1. classic-light `#3f457c` / `#554465`; high-contrast `#c1c86b` /
`#d7c654`, which is that palette's yellow doing what it is supposed to.

| palette | min | failing | inside a Liquid region |
| --- | --- | --- | --- |
| forest-night | 4.92:1 | 0 | 0 |
| classic-light | 1.39:1 | **10 (was 20, was 52)** | 0 |
| high-contrast | 6.12:1 | 0 | 0 |

**Control, red:** the new test's predicate finds 4 literal badge labels at HEAD and 0 after.

**Trap:** the staging script's first guard rejected the fix, correctly — the new comment quotes
the four old pastels as documentation and a substring test read that as the defect surviving.
Guards over a region that also contains prose must match the DECLARATION, not the value.

**Remaining 10, and the tradeoff the next slice must settle:** `dict-reading` x3 +
`dict-ex-btn` x1 paint `var(--accent-2)` — a USER-CHOSEN accent, set inline on `<html>` — as
text on white. The same mix trick works (42% clears it) but visibly desaturates the reading on
dark themes, where the accent is an identity element, so it is a real product decision rather
than a mechanical repeat. The last 6 are `.fwin` chrome (`fwin-title-text` 1.55:1, `fwin-b`
1.49:1) and belong with the window frame, not the Dictionary.

## 2026-08-18 — the instrument was measuring the previous palette, on every run so far

The last 6 failures looked like `.fwin` chrome painting `#d8ebe0` / `#7fa08e` on a light ground.
Those are forest-night's `--text` and `--muted`. Under classic-light the var chain reads
`#1e1e1e` at **every** element from `<html>` down to `.fwin-title`, so no rule was hardcoding
them — and `.fwin.fwin-liquid .fwin-title { color: var(--lq-liquid-text) }` is the winning rule
and it was resolving correctly.

**`/eval` is synchronous, so the measurement runs in the same task as `applyTheme`, before a
transition has advanced one frame.** `.fwin-title` transitions `color` over 140ms, `.fwin-b`
over 80ms. Both reported the OLD palette's colour against the NEW palette's background. Applied
in one call and measured in a second, two seconds later: `rgb(30,30,30)` and `rgb(95,95,102)` —
correct for classic-light.

**Fix:** `l1-palette-contrast.js` installs a `transition: none !important` sheet before the
first switch and removes it in the `finally`. Setting `transition: none` snaps a running
transition to its target, which is the wanted value. The output now carries `frozen` and
`thawed`; a run with `frozen: false` is void.

**This invalidates every palette number this instrument has produced, in both directions:**

| palette | before freeze | after freeze |
| --- | --- | --- |
| forest-night | 4.92:1, 0 failing | 4.92:1, 0 failing |
| classic-light | 1.39:1, 10 failing | **1.92:1, 9 failing** |
| high-contrast | 6.12:1, 0 failing | **9.89:1**, 0 failing |

High-contrast's minimum was understated by 3.77 — the lag fabricates a PASS exactly as readily
as a failure, and that is the more dangerous direction.

**Control, red:** the same tree measured unfrozen gives back the 6 artefact rows —
`fwin-title-text` at 1.55:1 with `#d8ebe0`, `fwin-b` at 1.49:1 with `#7fa08e`.

**What is actually left on classic-light: 9, and only 5 are chrome.** `.fwin-b` is a real but
modest gap — `--muted` `#5f5f66` on the title bar at **3.28:1**, not the 1.49:1 previously
recorded; fixing it means moving a shell chrome token, which is wider than the Dictionary.
`dict-reading` x3 + `dict-ex-btn` x1 at 1.92:1 remain the `var(--accent-2)`-as-text decision.
`fwin-title-text` was never a defect.

## 2026-08-18 — `--accent-text`, and why one accent is not a measurement (`27e8e313`)

The `var(--accent-2)`-as-text decision left open above is settled. `--accent-2` is the accent
mixed 28% toward WHITE (`osPersonalization.ts:226`): a highlight recipe, right on a dark panel,
wrong by construction for a glyph on a light one. Nine rules painted it — `.dict-reading`,
`.dict-ex-btn`, `.dict-anki-icon`, `.cs-tag`, `.novel-link-article a`, `.gram-gloss`,
`.flash-reading`, `.flash-row-reading`, `.flash-strip-reading`.

**Decision:** a NEW token, `--accent-text`. It can live in the stylesheet precisely because it
is new — personalization writes `--accent`/`--accent-2` INLINE on `<html>`, so a light palette
can never fix `--accent-2` itself (that is the note at `styles.css:41`, and slice 77 already
proved it the expensive way). Dark keeps `var(--accent-2)` verbatim; the six light palettes get
one grouped override, placed after all six blocks because the specificity is identical and
source order decides. Tradeoff: 30% accent is visibly muted next to the raw accent — that is the
cost of legibility on a near-white panel, and the alternative (six per-palette shares) puts the
same number in six places to be fixed five times.

**30, not 40.** The first solver measured whichever accent was selected and returned 40.
`--accent` is user-chosen (nine presets, `osPersonalization.ts:39`, plus a free `customAccent`
at `:201`), so a share tuned to one hue is not a measurement. Swept 9 presets x 6 light
palettes: **40 fails on amber** (soft-sepia 3.94, rose-pine 3.88); 35 fails on the same two; 30
is the largest share with **0 of 54** failing. Tightest cells: amber/rose-pine **4.52**,
amber/soft-sepia **4.58**. A pure-white `customAccent` is NOT rescued (3.26 on soft-sepia) and
no fixed share can rescue it; the presets are the contract.

**Live:** Dictionary on classic-light **9 failing -> 5**, all four `--accent-2` runs gone. The
5 left are `.fwin-b` chrome at **3.06-3.28** — a title-bar token, still not Dictionary's.
All nine rules mounted and measured on all nine palettes: **81 of 81 cells, 0 refused, 0
failing** (`probes/l1-accent-text-rules.js`).

**Controls, red:** status quo `var(--accent-2)`-as-text fails **54 of 54** light cells and
passes **27 of 27** dark ones — the asymmetry is what says the instrument discriminates. Inert
mix at share 100 fails 54 of 54. `accentTextToken.test.ts` goes red on both mutations: dropping
`paper` from the override list reports `["paper"]`, reverting `.dict-reading` names the rule.

**A control that was WRONG, recorded rather than dropped:** `#ffffff` as the accent was meant to
be the thing the fix cannot rescue. At share 30 it scores 5.54 on classic-light and passes,
because 30% white + 70% `#1e1e1e` is `#626262`. The recipe was working; the control was badly
chosen. Replaced with the status quo.

**TRAP, and it nearly went in the ledger as a pass.** `l1-accent-text-rules.js` first reported
"0 failing" on all six light palettes having measured NOTHING. `color-mix` computes to
`color(srgb r g b)`; that probe's parser only handled `rgb()`; every row refused; and `failing`
counts `pass === false`, which a refused row does not have. The only tell was `min`, because
`Infinity` serialises to `null`. Any probe here that reports a count of failures must also
report a count of MEASURED rows.

## 2026-08-18 — category 1 reaches 0 failing on the Liquid Dictionary window (`a70cbbed`)

**5 -> 0.** min **6.08** forest-night / **6.33** classic-light / **13.06** high-contrast, 16 runs
measured, 0 unmeasurable, frozen+thawed. First time this surface has had none.

**The ground was the defect, not the glyph, and that took two wrong fixes to see.**
`.fwin-bar` is `background: transparent` in Liquid presentation, so the title glyphs sit on the
frame material over `.os-desktop`, which paints an OPAQUE `rgb(10,10,14)` on EVERY palette. A
light palette's 72% material is therefore white glass over black and composites to mid-grey —
`#bababc` classic-light, `#bab7b1` soft-sepia, measured and confirmed against the hand-computed
`0.72*255 + 0.28*10`. At share 100, i.e. `var(--text)` itself, the glyphs still measured **4.42**
soft-sepia / **4.44** rose-pine. Nothing darker exists in those palettes, so no glyph colour
could ever have worked.

**Decision:** the light six opacify `--lq-liquid-bg` to **88%** (`liquid-tokens.css`, same shape
as the existing high-contrast/battery variants). Blur, saturate, border, highlight and shadow
untouched; darks stay 72% where they measured 4.92-16.74. Then `.fwin-b` derives from `--text`
mixed toward the bar's own background at **90%** — the SMALLEST share clearing the bar on all 13
palettes (85 leaves soft-sepia at 4.49). Bidirectional, so one declaration, no per-palette
override. And the ◆ toggle drops `color: var(--accent)` entirely: `--accent-text` does not rescue
it either (**4.12** soft-sepia) because that token is solved against `--panel-2` and this ground
is darker. The accent stays the FILL, where it has no contrast duty.

**Two mistakes, both corrected in the same commit, both worth more than the fix.**
1. The first `.fwin-b` fix went in `styles.css` and was **INERT**. `shell.css:815` carries
   `.fwin:where(...) .fwin-b`; `:where()` contributes 0, so (0,2,0) beats `styles.css`'s (0,1,0).
   It read exactly like a fix and computed to nothing. `styles.css` now carries a
   DO-NOT-FIX-HERE note. **Before fixing any `.fwin*` paint, check `shell.css` first.**
2. Raising the pressed fill 16% -> 24% to compensate for the lost glyph colour put the glyph back
   under the bar (**4.07** classic-light, **4.19** forest-night) — the fill IS that glyph's
   ground. 16 is the largest fill holding >= 4.5 on all 13.

**Controls, red:** status-quo glyph fails all six light palettes; three mutations each fail with
their own message; all three files restored byte-identical.

**TRAP — do not trust a resting read after a palette sweep.** After ~13 rapid `applyTheme` calls
one element's computed `color` stayed stuck at the LAST palette's `--muted` (cyberpunk
`#a78bc4`) while `data-theme` AND `--muted` read at that same element both said forest-night.
It survived separate /eval calls minutes apart; only a renderer reload cleared it. In-loop reads
were sound (grounds matched hand-computed values), so this invalidates resting-state reads only
— but it looks exactly like a real defect and cost most of an hour.

**What category 1 still needs before it can be SCORED 10 here:** this window only. The rubric
scores a surface, and `l1-palette-contrast.js` measures the Dictionary window's 16 runs, not the
whole app. `LIQUID_SCORECARD.md` stays empty until all eight categories sit on one surface.

## 2026-08-24 — category 1 measured AS THIS SURFACE, and it is NOT a 10

All four numbers on the Liquid Dictionary window, forest-night, 820x580, driven state 食べる /
8 entries. Restart confirmed (`bridge.json` `started` 1787548120277 → 1787558670463).
Parser self-test passed in-run (`color(srgb …)` channels scaled, 222,125,128, 6.12 vs panel) —
the read that has faked a clean bill of health twice.

| # | number | bar | verdict |
| - | ------ | --- | ------- |
| contrast | min **5.30** (`span.lexicon-etymology-source`, 11.9px), 150 measured, 0 unmeasurable | >=4.5 | **pass**, 0 failing |
| hit targets | smallest **18 px** (`button.dict-star`), **46 of 57** under 32 px | rubric >=32 px | **FAIL** |
| keyboard | **0 of 57** unreachable, 0 focus hosts | 0 | **pass** |
| reduced motion | **2** over 0.01 s, longest `button.btn` **0.14 s** | <=0.01 s | **FAIL** |

**Fixed this turn, and it was Liquid's own** (`liquid-tokens.css`): the reduced-motion token block
honoured `@media (prefers-reduced-motion: reduce)` only. `matchMedia` is **false** here — the
common Windows case — so a user who set Settings > Display's in-app control got **no** Liquid
reduction at all, and `.lq-contextual` stayed the longest moving element on the surface at
**0.24 s**. `:root.reduce-motion` now collapses the same four tokens. Measured, class on:
**5 → 2** over threshold, `.lq-contextual` gone. Control, same run: with the class **off** the
count is **12**, unchanged, so the rule fires on the class rather than unconditionally.
`liquidTokens.test.ts`'s ":root only" gate rejected `:root.reduce-motion` and was widened to
`:root` + `[attr]`/`.class` qualifiers, with a new control case asserting `:root .fwin`,
`:root > *`, `.lq-anchor`, `body` and `:root, .dict-entry` are all still rejected.

**The two open items, and neither is a probe defect.**
1. `button.btn` at 0.14 s is shared app chrome, not Liquid. It is behaving as `a11y.css:49-52`
   documents — the class *halves* shared duration tokens and `data-motion-mode='disabled'` is the
   kill switch — so the rubric's <=0.01 s bar and the app's three-tier motion design **disagree**.
   That is a product decision, not a bug to reflexively patch.
2. 46 of 57 controls under the rubric's 32 px, while **wcag258FailCount is 0** — every one clears
   WCAG 2.5.8 through the spacing exception (nearest neighbour >= 37.5 px). Same disagreement the
   boss audit's finding 3 flagged on the Read sheet's `×`. Raising `.dict-star` and its 45 peers
   from 18 px is a real visual change to a dense list, not a tail-of-turn edit.

Category 1 stays **open** on this surface until both are settled.

## 2026-08-24 — item (a) was not a decision, it was a broken instrument

**Two runs of `l1-hit-area.js` on an unchanged surface: `belowFloorByHit` 4 then 9,
`stolenCount` 2 then 7.** The probe is what was wrong, and every hit-target number this document
has ever printed from it is void — the 2026-08-18 **0** and the 2026-08-24 **46 of 57** alike.

**Cause, mechanical.** `el.scrollIntoView()` scrolls *every* scrollable ancestor, and
`overflow: hidden` does not make an element unscrollable — it only removes the scrollbar. The
first control that needed scrolling therefore also scrolled `section.fwin` itself to
`scrollTop: 81`, lifting the window's own title bar out of the viewport. The five `fwin-b`
buttons then hit-tested to `null`, or terminated early against `div.fwin-bar`, and were counted
as failures. The restore missed it twice over: it snapshotted `win.querySelectorAll('*')`, which
excludes `win`, and only elements *already* scrolled, and `.fwin` started at 0. So the leak
survived the run and the next run started from a different geometry. Measured after the run:
`section.fwin scrollTop 81`, restored to 0 by hand.

**Fix:** write `scrollTop`/`scrollLeft` on the nearest *real* scroll region only (`auto`/`scroll`
with something to scroll — `overflow: hidden` chrome is excluded by construction), snapshot every
element document-wide including the ones at 0, and report `scrollLeaks`. **Two consecutive runs
must agree; that is now the pass condition for the instrument itself.**

**Deterministic baseline, forest-night, liquid, 820x580, 食べる / 8 entries, both runs identical:**

| | number |
| --- | --- |
| measured / controls | **57** of 67 (10 occluded, not scored) |
| below 32px **by rect** | **46** |
| below 32px **by pointer** | **9** |
| clicks **stolen** by a neighbour's overlay | **5** |
| smallest hit region | **41.5x17.5** `lexicon-knowledge`, own rect 41x22 |
| `scrollLeaks` | `div.fwin-body 0,0 -> 3195,0` only — a real scroll region, restored |

**The 9 are one shape, and it is vertical.** `dict-star` x4 (32.5x**21.5**), `word-audio` x2
(32.5x**20.5**), `lexicon-knowledge` x2 (41.5x**17.5**), `dict-add` x1 (52.5x**19.5**). Every one
reaches the floor horizontally and fails on height, because `.dict-entry-head` rows are ~24px and
a 32px overlay reaching into the next row is painted over by that row. Where it *does* win it
**steals**: `lexicon-knowledge`'s blocker is `button.dict-star.lq-hit`, so a user aiming at the
visible knowledge button hits the star. The theft is a defect; the height is the open question.

`dict-add`'s blocker is `div.fwin-edge-b` — the window's bottom resize gutter covers the last
entry's Add button when the list is scrolled to its end. Real, and separate from the row height.

## 2026-08-24 — hit targets pass, and the "9 below floor" above is superseded (`a176a54f`+)

**The 9 were three more instrument defects, all found by asking who the blocker actually was.**
Deterministic is not the same as correct: the run above reproduced, and was still measuring the
wrong thing.

1. **`if (owns(centre)) skip the scroll`.** A control that happened to be visible was measured
   where it sat, which near a scroller's clip edge means the walk terminates against the clip.
   That made the result depend on iteration order — each control's centring moved the scroller
   for the next one. Centre **every** control, and the number becomes a property of the control.
   The 8 `dict-star`/`word-audio`/`lexicon-knowledge` failures were all this: re-measured centred,
   every one reaches 32. **9 -> 2.**
2. **A closed `<details>` reports a live rect.** Chromium hides disclosure content with
   `content-visibility`, which skips painting and hit-testing but *not* layout, so 6 controls
   entered the population with `156x32` and `visibility: visible`, failed every hit test, and
   were filed `occluded` "by summary". 10 of 67 unscored, and an unscored control is not a
   passing one. The probe now opens every disclosure, measures, and restores
   (`disclosuresRestored: true`) — safe here because `LexiconCompounds.tsx:62` and its three
   siblings carry no `onToggle`. **occluded 10 -> 0, measured 57 -> 67.**
3. **A `<label>` is the control's hit target.** The last 2 were the notes-scope checkboxes at
   `13x13`. Their labels are `142x32` and `100x32` and wrap them. Proven, not cited: a synthesized
   click at the label's far edge — `129px` from the box, landing on a `<span>` — flipped
   `input.checked` `false -> true` on both, and the same route restored it. Measurement now
   starts from the largest host. **2 -> 0.**

**Live, forest-night, liquid, 820x580, 食べる / 8 entries, two consecutive runs identical:**

| | number |
| --- | --- |
| measured | **67 of 67**, 0 occluded |
| below 32px by pointer | **0** |
| clicks stolen | **0** |
| smallest hit region | **32x32.5** `button.fwin-b` |
| below 32px **by rect** | 46 — unchanged and by design, the box does not move |
| `scrollLeaks` | `div.fwin-body` only, restored |

**Controls, red.** (a) `--lq-hit-target: 0px` (overlay collapses to the box) -> below-by-pointer
**0 -> 46**, landing exactly on the by-rect count, which is what proves the probe reads the
overlay and not something else. (b) `--lq-hit-target: 52px` -> **stolen 0 -> 4**, the title-bar
buttons cutting each other down to `31.5` wide. (b) only fired after the guard was fixed: it
compared whole axes and dropped an axis if *either* side ran out of REACH, so a control visibly
cutting 9px off `lexicon-knowledge` reported `stolen: 0`. It is now judged per side against the
distance from the centre to that edge. At `96px` the guard does **not** fire — the centres
themselves get covered, so those rows go to `occluded` instead; that value is the wrong control.
Token restored to computed `32px` with no inline override, verified after each run.

**Hit targets: PASS.** Item (a) needed no product decision — nothing about the dense list has to
change, and the 2026-08-22 boss-audit finding 3 (`×` at 16x18) should be re-measured with this
probe before it is treated as a defect.

## 2026-08-24 — reduced motion: the rubric names a tier the probe never measured

**Item (b) is not a disagreement between the rubric and the app's design. It is the wrong tier.**
The rubric's words are *"motion duration under `prefers-reduced-motion`"* — the OS query. The
`0.14 s` figure came from toggling `html.reduce-motion`, which is the in-app Settings > Display
*Reduced* control, a different tier that **halves** shared duration tokens by design
(`theme/a11y.css:49-52`). Three tiers ship and only one of them is the one being scored:

| tier | how it is reached | elements over 0.01 s on this surface |
| ---- | ----------------- | ----------------------------------- |
| none | as-shipped | **12**, longest `div.lq-contextual` **0.24 s** |
| (b) `html.reduce-motion` | Settings > Display, *Reduced* | **2**, longest `button.btn` **0.14 s** |
| (c) `[data-motion-mode='disabled']` | Settings > Display, *Disabled* | **0** |
| **(a) `prefers-reduced-motion: reduce`** | **the OS** | **0** |

**Tier (a) measured for the first time, and it needed a relaunch.** `matchMedia` is read-only and
the previous probe said outright that emulating the OS setting "needs CDP". It does not: Chromium
takes `--force-prefers-reduced-motion`, and electron-forge passes it through —
`npx electron-forge start -- --force-prefers-reduced-motion`. Restart confirmed (`bridge.json`
`started` 1787558670463 → 1787560357647, pid 7820 → 10564), flag confirmed by the probe's own
`mqMatches: true`, and the surface re-driven to the same real state it was measured in before
(食べる, **8 entries, 67 controls** — the identical population).

**Control, red, on the same surface in the same state:** the same probe with `mqMatches: false`
reports **12** over the bar with a `0.24 s` longest. 12 → 0 on the flag alone is the discrimination.
Capture-patch-restore verified on all three axes (`classMatches`, `modeMatches`,
`countMatchesBaseline`), so the two in-app tiers were toggled without being left behind.

`button.btn` at `0.14 s` under tier (b) is `0.28 s` halved — the Reduced tier working exactly as
documented, not an unhalved outlier. **Nothing was changed in the product for this.** New
instrument: `probes/l1-motion-tiers.js`; `l1-reduced-motion.js` measures tier (b) only and its
header now understates what is reachable.

## 2026-08-24 — category 1 SCORES 10 on the Liquid Dictionary window

All four numbers on one tree, one state, after a real restart back to the **unflagged** app
(`started` 1787560357647 → 1787560481897, pid 22560, `mqMatches: false` confirmed), surface
re-driven to 食べる / **8 entries / 67 controls**, forest-night, liquid, 820x580.

| # | number | bar | verdict |
| - | ------ | --- | ------- |
| contrast | min **5.30** (`span.lexicon-etymology-source`, 11.9px), **150** measured, **0** unmeasurable, **0** failing; parser self-test ok in-run | >=4.5 | **pass** |
| keyboard | **0 of 57** unreachable, **0** focus hosts | 0 | **pass** |
| hit targets | **0 of 67** below 32px by pointer, **0** stolen, smallest **32x32.5**; by rect 46, `wcag258FailCount` **0** | >=32 px | **pass** |
| reduced motion | tier (a) **0** over 0.01 s | <=0.01 s | **pass** |

**Four negative controls, all red in this session** — the rubric's rule is that a probe which has
not failed this session is unproven, and this document has been wrong in both directions before.

| control | forced | probe reported |
| ------- | ------ | -------------- |
| contrast | `.dict-word` colour → `#2a2a2c` | failing **0 → 1**, min **5.30 → 1.22** |
| keyboard | `button.dict-star` `tabindex="-1"` | unreachable **0 → 1**, named the element |
| hit area | `--lq-hit-target: 0px` | below-by-pointer **0 → 46**, landing on the by-rect count |
| hit area (theft) | `--lq-hit-target: 52px` | stolen **0 → 4** |
| motion | flag absent (`mqMatches: false`) | over-bar **0 → 12**, longest **0.24 s** |

All restored and re-measured: failing 0, unreachable 0, min 5.30, `[data-ctl]` count 0, token
computed `32px` with no inline override.

**Neither open item needed a product change, and that is the finding.** Item (a) was three
instrument defects; item (b) was the wrong tier. Two turns had them written up as product
decisions awaiting a call. **Category 1: 10/10.**

## 2026-08-25 — VIDEO scored for the first time, and it fails category 1 on hit targets

Gate 461 needs 80/80 on **Video and Dictionary**. Only Dictionary had ever been scored, and the
reason was not difficulty: `l1-accessibility.js:49` and `l1-hit-area.js:59` both read
`const TITLE = 'Dictionary'` as a literal. Both now take `window.__lqScoreTitle` with the
Dictionary default kept, so every run already recorded above reproduces byte-for-byte. **No new
probe file** — these two were adapted, which is the whole of the change.

**What the Video window actually holds.** Not a player: the Media Center hub (`div.mc-root`,
`header.mc-topbar`, `nav.ui-sidebar`, the media library grid) — 1,569 body chars, 296 nodes, 35
interactive controls, `<video>` count **0**. That is a real surface with real controls, so it is
scorable, but it is the hub and not the transport, and the transport still has to be scored
separately before this category can close on "Video".

**Contrast and keyboard PASS.** 86 text nodes measured, 0 unmeasurable, min ratio **4.96:1**
(`p.mc-muted "Choose a file from your…" 12px`) against the 4.5 bar, 0 failing. Keyboard: 42
controls, **0** unreachable, 1 focus host (`div.mc-root`, `tabindex=-1`). Parser self-test ok
(`color(srgb …)` channels scaled 0..1 → 0..255, ratio 6.12 on the known value).

**Hit targets FAIL, and this is the finding.** Two consecutive runs at the window's real
1080x700, agreeing exactly — which is this probe's own pass condition for itself:

| | Video (Media Center hub) | Dictionary, for comparison |
| --- | --- | --- |
| controls / measured | 35 / **34** (1 occluded) | 67 / 67 |
| below 32 px **by pointer** | **17** | **0** |
| below 32 px by rect | 22 | 46 |
| hit **stolen** by an ancestor | **3** | 0 |
| smallest hit | **26.5 px** (`button`, rect 30x26) | 32x32.5 |

The named offenders, with their measured hit box rather than their declared size:
`button.ui-sidebar__item` ×9 — rect **207x29** but hit only **52.5x29.5**, blocked by
`div.medialib-rail__group`; `button` ×4 and `button.mc-top-action` ×2 in the topbar at **28x28**;
`input via label.mc-global-search` rect 290x30, hit **52.5x30.5**; `button.medialib-card__more`
at **26x26**, blocked by `img.medialib-card__img`. The 3 stolen are `button` ×2 at rect 185x46
whose centre hit-tests to `nav.mc-nav`, plus one in `div.medialib-view-toggle`.

Note the shape the rect column hides: the sidebar items are 207 px WIDE and still fail, because
the pointer only reaches 52.5 px of that width. A rect-based instrument scores them as comfortable.

**Trap, and it cost a real desktop change — read this before scoring any second window.**
1. **Raise the target window or the score is a fiction.** The first run reported
   `occludedCount: 25 of 35` with blockers named `div.dict-entry`, `div.dict-view`,
   `div.dict-saved-searches-head` — the *Dictionary* window, stacked on top. Only 10 controls were
   measured and an unscored control is not a passing one. `l1-hit-area.js` reports these as
   `occluded` rather than refusing, so the partial run looks like a result.
2. **Do NOT raise it with a synthetic `pointerdown` at `clientX:0, clientY:0`.** That is the
   desk's top edge: the shell's own edge-snap fired, and the Video window went from `1080x700` to
   the full desk at `0,0` — **and persisted**, because geometry is written on release. Restored
   through the product's own grip and bar handlers (rAF-spaced moves dispatched ON the grip, not
   on `window` — a synchronous `pointermove` on `window` does nothing here and reads as "the
   resize didn't take"): back to **1080x700**, confirmed in `desktop-layout.json`. **Disclosed:
   the size is the recorded baseline exactly, but x/y is now `92,40`, which is my choice — the
   snap overwrote the original before anything read it, and no doc had ever recorded Video's x/y.**

**Category 1 on Video: NOT 10.** Contrast and keyboard are clean; the 32 px hit-target floor is
missed by 17 controls with 3 more stolen. This is the same class of defect Dictionary closed on
2026-08-24 (`a176a54f`+) by giving controls a ≥32 px hit surface through padding rather than
visual growth, and the same remedy applies — it is a product slice, not a re-measurement.
