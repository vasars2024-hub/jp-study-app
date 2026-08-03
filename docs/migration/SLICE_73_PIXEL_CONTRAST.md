# SLICE 73 — PIXEL-SAMPLED CONTRAST, AND THE ONE THING THIS SLICE COULD NOT DO

> ## READ THIS FIRST — NOTHING IN THIS DOCUMENT IS A MEASUREMENT I TOOK.
>
> **Every `node` invocation was refused by this agent's permission layer.** Verified by probing the
> boundary rather than assuming it:
>
> | command | result |
> |---|---|
> | `node --version` | **allowed** — `v24.16.0` |
> | `node docs/migration/tools/scan-probe-escapes.mjs …` | **REFUSED** |
> | `node docs/migration/tools/packaged-a11y-deep-gate.mjs --selfcheck` | **REFUSED** |
> | `node -e "…"` | **REFUSED** |
> | `npx --version` | **REFUSED** |
> | `mcp__jp-app__app_health` | **REFUSED** (not granted) |
>
> So: **I did not run the gate. I did not run the sampler. I did not measure aero.** I could not
> even run `--selfcheck` or the escape scanner on my own file.
>
> This is the sixth agent on this track to hit it (slices 63, 65, 66, 69 and two others). Per the
> brief's own instruction, **no number from the brief is repeated here as though it were mine**, and
> every quantity below is labelled `UNMEASURED`.
>
> **What this slice delivers is therefore an INSTRUMENT, not a RESULT.** The distinction is the
> whole subject of this track, so it is stated at the top rather than buried:
>
> - The sampler is written, and it is written **fail-closed**: it refuses to emit a single app
>   number unless its own known-answer self-test passes first, in the same shape as `B0`.
> - The sampler is **opt-in** (`--pixels`). Without that flag the gate is byte-for-byte the gate
>   that exists today. The CSS path is not merely "untouched" — it is unreachable from this change.
> - The riskiest component (the PNG decoder) has an **offline self-test that needs no app, no CDP
>   and no packaged build**: `node docs/migration/tools/a11y-pixel-sampler.mjs --selftest-offline`.
>   That is one second of runtime and it is the first thing the next runner should do.
>
> **Do not quote any aero number from this slice. There are none.** Section 5 lists, verbatim, the
> commands that would produce them.

## Why the aero blind spot is real (restating the premise, not re-measuring it)

Slice 72 ran the deep a11y gate against `--theme=frutiger-aero` and B2 reported PASS while 97% of
the controls came back UNMEASURABLE. The measurer was not broken — it was honest. It resolves **CSS
colours** and walks up for the first opaque backdrop; a boundary over a gradient, a
`backdrop-filter`, or a semi-transparent stack has no single backdrop colour to resolve, so it
correctly declines to invent one. The gate's own `B0` asserts that behaviour
(`text over a gradient -> UNMEASURABLE as designed`).

The consequence is the thing to fix: a glass theme is **invisible to the instrument**, and an
invisible failure and an absent failure produce byte-identical output. That is the same signature as
the `ringOf` regex that matched nothing for two slices, and as B3 passing on 2 stops of 52.

The fix is to stop asking the stylesheet what colour something is and start asking the screen.

## 1. What was built

Two files. One new, one edited by ~50 lines.

### `docs/migration/tools/a11y-pixel-sampler.mjs` — NEW, standalone

Standalone on purpose: **the gate executes `main()` at import**, so nothing may ever import it. The
dependency direction is gate → sampler, never the reverse.

| part | what it is |
|---|---|
| `decodePng` | hand-written PNG decoder. `zlib.inflateSync` + all five unfilter types (None/Sub/Up/Average/Paeth), colour types 0/2/3/4/6 at bit depth 8, every chunk CRC verified. **No npm dependency added.** |
| `encodePngRaw` | encoder used *only* by the offline self-test, so the decoder can be proven against known bytes |
| `verifyMapping` | derives CSS-px → image-px scale and origin from planted fiducials; see §3 |
| `PLANT` / `RECOLOUR` / `REMOVE` | page-side probes that plant fiducials + known-answer swatches and read their geometry **back off the DOM** |
| `nonTextPixelTargets` | page-side probe emitting validity-checked sample points around every control |
| `textBackdropTargets` | page-side probe for the B1 backdrop sampler |
| `offlineSelfTest()` | decoder + WCAG maths + synthetic-scale proof, **no browser required** |
| `pixelSelfTest(cdp)` | the in-app proof: mapping, stale-frame differential, known-answer swatches |

### `docs/migration/tools/packaged-a11y-deep-gate.mjs` — EDITED

Additive and opt-in. The whole integration is:

- a `--pixels` flag,
- a `B0p` step that runs the sampler's self-test and sets `pixelsTrusted`,
- a capture inside the **existing** surface loop (no restructuring of the loop),
- `B2p` / `B1p` steps and a `CSS-vs-PIXEL DISAGREEMENT` report,
- `import()` wrapped in `try/catch`, so a broken sampler degrades to "pixel path unavailable"
  rather than taking the gate down.

`pixelsTrusted` gates every one of those. If `B0p` fails, the run reports the failure and produces
**no** pixel numbers at all.

## 2. How the sampler is proven before it is believed — the design

This is the brief's main deliverable and the part I could not execute, so what follows is a
description of assertions that **exist in code and have never run**. Every one of them is
fail-closed: the phase refuses to report rather than degrading to a guess.

### 2a. Offline, no app needed — `--selftest-offline`

| assertion | why it is the right known answer |
|---|---|
| round-trip of all **5 filter types** × colour types **0/2/4/6**, pixel-exact | Paeth and Average are where hand-written decoders break, and they break *quietly* — a wrong `>>1` shifts a whole image by a few levels, which still looks like a plausible colour |
| a deliberately **non-square, asymmetric** test image (61 × 37) | a transposed or stride-confused decoder cannot round-trip a non-square image, but sails through a square one |
| corrupt one byte → **CRC mismatch throws** | proves the integrity check is wired, not decorative |
| `ratio(#000,#fff) === 21.00`, `ratio(#777,#888) === 1.26` | arithmetic, not remembered; the same two constants `B0` already pins |
| a **synthetic image built at scale 2**, fed to `verifyMapping`, must report `scaleX === 2` | trap #4 in the brief. This proves the mapping code *detects* a non-1:1 scale instead of assuming 1:1 |

That last row matters most: a mapping verifier that always returns 1 would pass every 1:1 run and
silently corrupt every non-1:1 one. Testing it against a scale it must *not* return 1 for is the
only version of the test that can fail for the right reason.

### 2b. In-app known answers — `B0p`

Swatches are planted in a `position:fixed` host at `z-index: 2147483647`, their geometry is **read
back** with `getBoundingClientRect()` rather than trusted from the CSS that declared it, and node
samples the decoded screenshot at those coordinates.

| swatch | assertion | what it catches |
|---|---|---|
| `#000` inside `#fff` | sampled RGB **exactly** `(0,0,0)` / `(255,255,255)`; ratio **21.00 ± 0.01** | the baseline |
| `#777` inside `#888` | exact; ratio **1.26 ± 0.01** | a measurer that only gets easy answers right |
| `rgba(255,255,255,.5)` over `#000` | sampled inner within ±1 of `(128,128,128)` | **paint vs declaration** — CSS says `#fff`, the screen says mid-grey |
| `linear-gradient(#204060,#204060)` (uniform) | sampled outer **exactly** `(32,64,96)` | **the entire point of the slice**: the CSS path returns UNMEASURABLE here and the pixel path returns a known, checkable number |
| 20 × 20 inner with a **4 px** backdrop margin | inner and outer both exact | an off-by-more-than-2px sampler reads the wrong box and fails |
| `linear-gradient(90deg,#000 0 50%,#fff 50%)` | sample at 25% → `(0,0,0)`, at 75% → `(255,255,255)` | **mirroring / x-flip**, which a correct-looking decoder can do |
| `linear-gradient(90deg,#000,#fff)` | luminance at 10% < 50% < 90%, strictly | proves position-dependent reads, not one cached colour |

### 2c. The stale-frame differential — `B0p-stale`

> *A verdict is a difference between two controlled runs, never an absence read alone.*

Capture. Then **recolour one fiducial** to a new unique triple, settle, capture again. Assert both
halves:

1. the new colour is present at the expected rect, **and**
2. the old colour is **absent from the entire image** (exact-match count `0`).

A cached or stale frame fails assertion 2. Asserting only (1) would pass on a stale frame that
happened to contain both.

## 3. How the CSS-px → image-px mapping is verified

**It is derived and cross-checked, never assumed.** Four fiducials are planted:

- deliberately **non-square** (80×24 and 24×80) and at **asymmetric** positions, so an x/y
  transposition cannot pass;
- in **unusual colours** (`(253,7,251)`, `(7,251,131)`, `(251,131,7)`, `(7,131,251)`) rather than
  round primaries, because a theme gradient can plausibly contain `#ff00ff` and essentially never
  contains `#fd07fb`.

Scale comes from the **separation between two fiducials**, not from one fiducial's own size —
differences cancel the sub-pixel error at antialiased edges:

```
scaleX = (bboxFar.minX - bboxNear.minX) / (cssFar.left - cssNear.left)
```

Then four independent things must agree, or the step **FAILS and no pixel number is produced**:

1. derived `scaleX` ≈ derived `scaleY` (within 0.02),
2. derived scale ≈ `image.width / document.documentElement.clientWidth` (within 0.02),
3. origin ≈ 0 on both axes (within 1.5 px) — i.e. the screenshot is not cropped or offset,
4. every fiducial's exact-match pixel **count** ≥ 90% of `w·h·scale²` — this is what stops a stray
   matching pixel elsewhere in the app from ballooning a bounding box and yielding a confidently
   wrong scale.

`window.devicePixelRatio` is recorded alongside, but **it is not used** — it is evidence, not input.
The gate pins `deviceScaleFactor: 1`, so the expected answer is 1:1; the point of the check is that
a run where it is *not* 1:1 fails loudly instead of silently reading the wrong rectangles.

## 4. What the sampler measures, and the honest limits of each part

### B2p — non-text boundaries (the 251 controls)

For every control, points are generated on all four sides at 25/50/75% and classified:

- **outside** — 3 px beyond the border box,
- **edge** — 1 px inside it,
- **inside** — `min(6, …)` px inside it.

Each point is validity-checked page-side with `document.elementFromPoint`: an *outside* point is
valid only if the topmost element is neither the control nor a descendant; an *edge/inside* point
only if it is. Points failing that, or falling outside the viewport, are discarded, and a control
with fewer than 2 valid outside or 1 valid boundary point is reported `unmeasurable` **with the
reason**, not scored.

Scoring, stated explicitly because the choice is arguable:

```
score = max over boundary colours b of ( min over outside colours o of ratio(b, o) )
```

The strongest identifying feature carries the verdict (matching the CSS path's "best of fill,
border, ring, marker"), but it must hold against the **weakest-contrasting** adjacent colour — which
is the strict reading of "adjacent colour(s)" and the right one over a gradient. `bestPairRatio` is
recorded next to it so the choice is auditable rather than asserted.

**Anti-animation guard.** Rects are read, the screenshot is captured, then rects are read **again**;
any control whose rect moved between the two reads is dropped as `moved`. Otherwise a hover
transition or a spinner makes geometry and pixels disagree — silently.

> **Known limitation, stated rather than discovered later.** `elementFromPoint` ignores
> `pointer-events: none`. A decorative non-interactive overlay painted above a control would corrupt
> the pixel read *without* being detected by the validity check. This is not solved. It is
> mitigated only in that outside-sample spread is recorded (`outsideDistinct`, min/max), so an
> implausible reading is visible in the record — and it is why B2p reports **alongside** the CSS
> path rather than replacing it.

### B1p — text backdrops

Deliberately weaker, and labelled as such in the field names. Sampling glyph pixels is a bad idea:
antialiasing means the "text colour" on screen is a blend, and picking the extreme pixel biases
every result in whichever direction the font hinting happened to go.

So B1p is a **hybrid**, and the split is the honest part:

- the **foreground** is what CSS declares, composited with its own alpha and the ancestor opacity
  product — the existing, self-tested code path,
- the **backdrop** is what the screen actually paints — sampled, mode-filtered, with pixels close to
  the declared foreground discarded as probable glyph coverage.

Recorded per sample: `backdropMode`, `backdropWorst` (the sampled colour closest in luminance to the
painted text, i.e. the strict case) and `glyphPixelFraction`, so a sample where glyphs dominated the
rect is visible rather than quietly averaged away.

**This is not a pixel-truth reading of text contrast and must not be quoted as one.** It converts
"unmeasurable because the backdrop is a gradient" into "measured against the gradient the screen
actually painted", which is the specific hole aero opened.

### The disagreement report — the finding this is most likely to produce

The CSS path knows what was **declared**. The pixel path knows what was **painted**. Slice 62 found
a ring declared opaque that painted at 16% alpha; that class of defect is only visible as a
*difference between the two*.

So both are kept and joined on `path|el|name`. Joins are **unambiguous-only**: keys appearing more
than once on either side are excluded and counted as `ambiguousJoin`, rather than matched by
position and hoped for. Buckets:

| bucket | meaning |
|---|---|
| `cssUnmeasurablePixelScored` | **the aero hole closing** — the count that answers this slice |
| `bothScoredDisagree` | ratios differ by > 0.5 — declared ≠ painted, i.e. a slice-62-shaped finding |
| `cssScoredPixelUnmeasurable` | occlusion or an off-screen control; the pixel path's own blind spot |
| `bothUnmeasurable` | honestly invisible to both |

## 5. THE NUMBERS — ALL UNMEASURED

**There are no results in this slice.** Answering the brief's questions 3 and 4 requires running the
gate, which this agent could not do.

| brief question | status |
|---|---|
| known-answer results for the sampler | **UNMEASURED** — assertions written, never executed |
| CSS-px → image-px mapping, as verified | **UNMEASURED** — derivation and its four cross-checks written, never executed |
| how many of aero's 251 controls became measurable | **UNMEASURED** |
| what the previously-invisible controls score | **UNMEASURED** |
| where the pixel and CSS paths disagree | **UNMEASURED** |

### The exact commands that produce them

Run in this order. **Stop at the first failure** — that is the design.

```bash
# 1. one second, no app, no build. If this fails, nothing else is worth running.
node docs/migration/tools/a11y-pixel-sampler.mjs --selftest-offline

# 2. both files parse, and no page-side probe has a halved backslash
node docs/migration/tools/scan-probe-escapes.mjs \
  docs/migration/tools/packaged-a11y-deep-gate.mjs \
  docs/migration/tools/a11y-pixel-sampler.mjs        # expects 0
node docs/migration/tools/a11y-pixel-sampler.mjs --selfcheck
node docs/migration/tools/packaged-a11y-deep-gate.mjs --selfcheck   # expects "all page-side probes compile"

# 3. the control: default palette, pixel path on. Proves B0p passes on a theme
#    whose numbers are already known, BEFORE trusting it on one whose numbers are not.
RUN_STAMP=px01 node docs/migration/tools/packaged-a11y-deep-gate.mjs --pixels

# 4. the actual question.
RUN_STAMP=pxaero01 node docs/migration/tools/packaged-a11y-deep-gate.mjs \
  --pixels --theme=frutiger-aero
```

Step 3 before step 4 is not ceremony. The default palette is the one surface where the CSS path is
known to work, so it is the only place where `bothScoredDisagree ≈ 0` is a meaningful *validation*
of the pixel path. Running aero first would mean trusting a new instrument on the one theme nobody
can check it against.

Read out of `packaged-a11y-deep.json`:

- `out.pixelSelfTest` — every known-answer assertion with its sampled value
- `out.pixelMapping` — `scaleX`, `scaleY`, `originX`, `originY`, `devicePixelRatio`, per-fiducial fill
- `out.nonTextPixelContrast.scored` vs `out.nonTextContrast.scored` — **the headline for aero**
- `out.contrastPathDisagreement` — the four buckets above

## 6. Contradicting the brief

Two points, since pushing back was invited.

**6a. "Report the new numbers for aero" was not achievable, and the brief already said what to do.**
The brief's timebox instruction — *"A half-wired sampler that silently returns garbage is far worse
than an honest 'not done'"* — is the governing rule here, and it points at labelling rather than at
abandoning. The instrument is delivered fail-closed and opt-in; the numbers are not delivered at
all. Shipping the sampler *without* the fail-closed self-test in order to look finished would have
reproduced the exact defect this slice exists to remove.

**6b. The framing "97% unmeasured" is right, but it is not obvious that the 97% contains
proportionally as many defects as the 3% did.** The 3% the CSS path could see was, by construction,
the *flat-backdrop* subset — the parts of aero that are least glassy and most like the default
theme. Those turned out to carry 24 text failures and 4 failing rings. Whether glass surfaces are
better or worse is genuinely unknown and could go either way: translucency destroys contrast, but
aero's glass panels are also pale and its text is dark. **This is an argument for measuring, not an
argument that the number will be bad** — and if B2p comes back clean across all 251, that is a real
result and should be recorded as one, not treated as a disappointing outcome.

**6c. One thing in the brief is imprecise.** It says the gate "already contains a hand-written PNG
*encoder* (`encodePng`, used by the artwork fixture) and `zlib` is in node; a matching decoder is
the same shape in reverse." The encoder emits colour type **2** with filter type **0 only** — it
never exercises Sub/Up/Average/Paeth, and never emits an alpha channel. Chromium's
`Page.captureScreenshot` emits **RGBA (colour type 6)** and its zlib encoder chooses filters
per-row, so in practice all five appear. A decoder written as "that in reverse" would handle
approximately none of the rows it will actually be given. That is why the decoder here implements
all five filters and four colour types, and why the offline self-test exercises each combination
rather than the one the existing encoder happens to produce.

## 7. Files touched

| file | change |
|---|---|
| `docs/migration/tools/a11y-pixel-sampler.mjs` | **new** |
| `docs/migration/tools/packaged-a11y-deep-gate.mjs` | additive, opt-in `--pixels`; CSS path unreachable without the flag |
| `docs/migration/SLICE_73_PIXEL_CONTRAST.md` | this file |

Not touched, per the brief's constraints: `src/**`, `out/**`, `packaged-offline-gate.mjs`,
`NEXT_SESSION.md`, `progress.json`. No build was run. No git operation beyond `git status` was run.
