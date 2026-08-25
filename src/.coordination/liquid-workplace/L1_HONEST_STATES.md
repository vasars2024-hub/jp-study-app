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

## 2026-08-24 · primary — the dead-control census ran twice; run 1 was 45 false DEADs

**Run 1 reported every one of 46 probed controls DEAD**, including `Search`, which had provably
worked ninety seconds earlier in the L7 pass. One eval found it: `document.querySelectorAll('.fwin')`
was **0**. The exclusion table refuses the window chrome by GLYPH (`/^⧉$/`, `/^×$/`), but `labelOf`
prefers `title`/`aria-label`, so those rows arrived as *"Pop out into its own window"* and *"Close"*
and matched nothing. **Control 0 popped the surface into a separate BrowserWindow** —
`?popout=dictionary`, confirmed on `/health` — and the other 45 were measured on a detached tree.
A detached tree mutates for nobody, so it reads DEAD for everything: the exact mirror of the
"everything ALIVE" false pass the file's own correction 1 was written against. **The self-test
could not catch it** — a planted dead button reads DEAD on a broken probe too.

Three fixes, all in this commit: exclusions match the resolved label OR the raw glyph; an
**aliveness control** (a planted button that genuinely mutates the window, VOID if it reads DEAD);
and a per-control `document.contains(win)` assertion that aborts naming the last good index
instead of manufacturing verdicts.

**Run 2, after the fixes.** Both controls fired — planted-dead → DEAD, planted-alive → ALIVE
(1 mutation, restored). **65 controls, 21 excluded with a named reason, 44 probed → 8 ALIVE,
1 DEAD, 35 NOT ACTUATED (`element detached`).**

**The dead-control number is therefore STILL NOT EARNED: this is 9 of 44 with a verdict, not
44 of 44.** The stale-roster cause is measured, not guessed — control 6 (中文) re-renders the whole
result list (chars **5,963 → 1,415**, entries **8 → 2**) and every stored element from index 14 on
is a node React has since replaced. The roster has to be re-resolved after any control whose
fingerprint delta moves the node count; addressing controls by stored element is what correction 1
chose over CSS paths, and both fail — the fix is re-install-and-rematch, not one or the other.

The single DEAD is `Automatic` (`cls=active`), the already-selected segment of the
Automatic/Dictionary/Interlinear group. Clicking the active segment of a segmented control is a
legitimate no-op, so it is a **candidate, not a defect**, and it is only decidable alongside the
other two segments.

Residuals this run left, stated rather than hidden: **one saved search** (`localStorage` 90 → 91;
the app's own Save-search flow, user-removable, not deleted blind), and the gloss/mode toggles,
which were driven back by hand — 日本語 ON, `Automatic` active, **8 entries / 5,967 chars**.
`中文` does not turn off by re-clicking; it is a two-way radio, and 日本語 is the way back.

## 2026-08-25 · backup — Video, category 8 leg 1 only: 0 raw i18n keys, and NO state was reachable

`TITLE` now reads `window.__lqScoreTitle` with `'Dictionary'` kept as the default; every run above
reproduces. No new probe file.

Video (Media Center hub), live at pid 32344, `en`, `forest-night`, library 36 items / 2 cards
rendered: `rawI18nKeyCount` **0**. Every state bucket is **0** — empty 0, loading 0, error 0,
offline 0 — and `statusCandidatesNeedingEmptyProfile` is **[]**.

**That is a coverage gap, not a pass, and it is written down as one.** The rubric's category 8
needs 0 dead controls, 0 fabricated values, and *all four states rendering a real message*. A
populated profile renders none of the four, so this run cannot say whether they exist; it says only
that nothing dishonest is on screen right now. The two legs that decide the category —
`l8-dead-controls.cjs` (drive every control) and `l8-fabricated.cjs` (needs an empty scratch
profile) — have not been run against Video. **Category 8 on Video: unscored, which is not 10.**
