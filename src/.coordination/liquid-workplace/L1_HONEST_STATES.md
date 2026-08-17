# L1 — honest states on Dictionary: VOID, because the control never fired

Authority: `src/LIQUID_UI_RUBRIC.md` **category 8**; probe vocabulary from `honesty-probe`.
Instrument: `probes/l1-honest-states.js`. Surface: Dictionary, `lang=en`,
`data-theme=forest-night`, 8 `dict-entry` results for 食べる.

**Headline: category 8 is NOT SCORED.** The rubric requires inducing a genuine failure and
confirming the surface names it. **Two induced-failure attempts both SUCCEEDED**, so the error
and offline states were never observed. Per the rubric's own rule — *"if the control does not
fail, the probe is broken and the score is VOID — not 10"* — this is void, not a pass. What was
genuinely measured is below; what was not is named rather than left silent.

## Measured, and real

| State | Verdict | What was observed |
| --- | --- | --- |
| Empty | `LIVE` | Searched `zzzqqqxxwv`: **"No dictionary match for "zzzqqqxxwv"."** — names the query rather than a generic blank |
| Loading | `LIVE` | Add-to-Anki drove **"Translating sentence…" → "Adding…" → "Added"**, button `disabled` throughout |
| Raw i18n keys | **0** | On `lang=en` only — see the limit below |
| Error | **NOT MEASURED** | Both induced failures succeeded |
| Offline | **NOT MEASURED** | Same |

Two side effects were observed, both `LIVE` in `honesty-probe`'s sense — real effects, not
toasts. **Add to Anki genuinely wrote a note**: AnkiConnect was up, so the intended
unreachable-host control did not fail, and one 食べる card now exists in the real collection. That
is a real mutation of user data, stated plainly rather than omitted; it is one note from the app's
own normal mining flow and the user can delete it. **Explain this word genuinely called a
configured AI provider** and returned a grounded answer about 食べる's literal and metaphorical
senses — so that path is not a fixture either.

## The instrument correction, which had already produced a false zero

The first run reported **`loading: 0` while the surface was visibly in a named loading state.**
The selector looked for `[class*="loading"]`/`[aria-busy]` containers; Dictionary renders its
loading state as the **button's own label** (`Translating sentence…`, `disabled`). A container
selector cannot see that, and the zero it returns is indistinguishable from a surface that says
nothing while it works.

This is `honesty-probe` §3's D-calibration verbatim — five surfaces were once bucketed
EMPTY-SILENT by a selector that never read what was rendered. **The rule that saved it: read what
the surface actually rendered before bucketing it.** The zeros in the table above are only
trustworthy for the rows where that was done by hand.

## The limits, named rather than left silent

- **Error and offline: NOT MEASURED.** AnkiConnect is running and an AI provider is configured,
  so neither click produced a failure. A real control needs a genuinely unreachable dependency —
  stop AnkiConnect, or point a provider at a dead host — and that is the next slice's first job.
- **One language, not four.** The rubric requires 0 raw keys **in all four languages**. Measured
  on `lang=en` only. A raw key is invisible to `tools/i18n-check.cjs`, which compares catalogs
  against each other: a key no catalog has is missing from all of them equally and passes. So the
  four-language rendered scan is not redundant with the existing gate and still has to be run.
- **Dead-control count: not counted.** That is `honesty-probe` probe A over all 54 controls with a
  side-effect assertion each — its own slice. **No 0 is claimed for it.**
- **Fabricated values: no verdict.** Probe B requires an empty scratch profile; on a populated
  one, real data and a hardcoded constant look identical. The probe reports candidates only, and
  found **0** status-word candidates on this surface.
- **Media not measured at all** for this category.

## Verdict

Category 8 is **VOID / not scored** for Dictionary and **not started** for Media. Three of eight
categories have now been driven (3, 4, 1) and **none of them scored 10**; category 8 does not even
reach a score. `LIQUID_SCORECARD.md` stays empty — correctly, and a first-pass 80/80 would have
meant the probe was broken.
