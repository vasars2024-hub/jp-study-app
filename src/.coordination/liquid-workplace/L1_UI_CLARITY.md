# L1 — category 5 (UI clarity): NOT SCORED, and it cannot be scored before L3

Authority: `src/LIQUID_UI_RUBRIC.md` category 5 — the ten §10.4 questions, scored instead of asked
of a human. Instrument: `probes/l1-ui-clarity.js`, driven live at `lang=en`,
`data-theme=forest-night`, Dictionary holding **8 `dict-entry` results** for 食べる.

## The headline: two of the ten questions have no subject, on every surface

**Q7 ("standard mode remains fully normal") and Q8 ("Liquid can be turned off without losing
state") are `NO-SUBJECT` on all five windows** — measured, not assumed: **0 Liquid-presentation
toggles** on any surface. L3 (per-window presentation state) is unbuilt, so there is no Liquid
mode to leave and nothing to turn off. **Q6 ("Liquid motion explains a real relationship") is
`NO-SUBJECT` on Anki and Dictionary too**, which render **0** regions with a `backdrop-filter`.

A probe that answered those "yes" because nothing was broken would be scoring the **absence** of
the feature as the presence of its quality. So category 5 is **NOT SCORED** — the same disposition
category 8 got when its control did not fire, and for the same reason. It is structurally capped
until L3/L4 exists, exactly as category 2's Standard-vs-Liquid cost delta is.

## The five surfaces, driven

| Surface | YES | NO | NO-SUBJECT | Inherited | Failing question |
| --- | --- | --- | --- | --- | --- |
| Anki | 4 | 1 | 3 | 2 | **Q3** — primary action outside the body viewport at `scrollTop 0` |
| Scraper | 5 | 1 | 2 | 2 | **Q4** — 31 chrome controls, 1 collapsed disclosure |
| Dictionary | 4 | 1 | 3 | 2 | **Q4** — 18 chrome controls, 7 collapsed disclosures |
| Media | 5 | 1 | 2 | 2 | **Q4** — 25 chrome controls, **0** collapsed disclosures |
| Settings | 6 | 0 | 2 | 2 | — |

Q5 (contrast) is inherited from `l1-accessibility.js`, **re-driven at this tree today** and
reproducing its recorded numbers to the decimal: min **5.30:1**, **141** text runs measured,
**0** failing, **0** unmeasurable. Q9 (pre-migration parity) is inherited from
`parity-ledger.json`: **0 of 7 rows are `both`; all 7 are `pending`** — there is no post-migration
state to compare against, so Q9 earns no discriminating point either.

The one real cross-surface finding is **Q4**: three of five surfaces put more than 12 controls in
the default view outside their repeating content, and **Media offers 0 collapsed disclosures at
all** — every tool it has is either always visible or not present. The 12 bar is this probe's
choice and is stated so it can be argued with; the counts are not.

## The negative control fired in three directions

Q10 answered YES on all five surfaces after the repairs below, and a question that cannot return
NO measures nothing. `probes/l1-ui-clarity-control.js` induces three failures in Dictionary:

| Plant | Question | Expected | Observed |
| --- | --- | --- | --- |
| blank the window title | Q2 | NO | **NO** (`titleText: ""`) |
| `translateY(4000px)` on the primary action | Q3 | NO | **NO** (`insideBodyViewport: false`) |
| 6 uniform cards, 6 different control signatures | Q10 | NO | **NO** (uniformity 1.00, `cardControlSignatures: 6`) |

Q10's plant is the load-bearing one. The probe already sees `div.os-theme-grid` at uniformity
**1.00** and calls it YES because its 13 swatches share **one** control signature — a gallery. The
injected dashboard differs *only* in being heterogeneous, and it goes NO. So the gallery
discriminator is a real distinction, not a blanket exemption.

Restored: title back to `Dictionary`, 1 transform cleared, 1 planted grid removed,
**0 markers remaining**, all five surfaces back to their pre-control verdicts, 8 entries still live.

## Four probe defects killed before any of the above was recorded

The first run produced five NOs that were all the instrument. They are worth more than the score,
because each is a shape that recurs:

1. **The window body computes to `rgba(0, 0, 0, 0)`.** The "is this control filled/accent?" test
   compared every background against that — i.e. against **black**. Fixed by walking ancestors to
   the first surface with alpha > 0.05. *A declared background is not the painted backdrop.*
2. **Anki scored `entryPoints: 0`** and was called unclear. Its entire top third is one deck
   `<select>` plus four window-chrome glyphs, and the counter accepted only `input`/`textarea`.
3. **Q3 answered YES about the wrong element on two surfaces** — `accentButtons[0]` was
   `button.gram-level-btn` (Dictionary's JA/ZH grammar toggle) and `button.ui-sidebar__item`
   (a Media nav row). Now prefers a control the app itself marks `primary`, excluding chrome and
   nav. *A right answer about the wrong element is not a right answer.*
4. **Q10 called four surfaces "a generic card dashboard" at uniformity 1.00** — the hosts were
   `ul.scr-rail-list`, `nav.ui-sidebar`, `ul.os-set-nav-list` and `ul.lexicon-conjugation-list`.
   Equal-height list rows are not cards. Cards must now be ≥120×60, paint their own
   background/border, and sit in a host covering ≥25% of the body.

Also corrected: `identityMarkers.desktopLayer` was queried as `.desktop`, which **does not exist**
in this shell (`.desktop-root` / `.os-desktop` / `.os-wall-layer` do). It reported `false` on every
surface — a selector matching nothing reads as "the app has no desktop", not as "the probe is
wrong". This is the same failure as `l1-use-of-space.js`'s `.fwin-titlebar`, which scored
Dictionary's chrome at a flat 0%.

One timing note for the next worker: the control's Q3 flip **does not show on a probe run issued
immediately after the plant** — the first read returned `insideBodyViewport: true` with the
transform already in the DOM. A second run, unchanged, returned NO. Give injected layout a
settle before reading it, or a control will look like it failed to fire.

## What category 5 needs to become scorable

L3's per-window presentation state and L4's Video pilot. Until then Q6–Q8 have no second term, and
the honest ceiling is 7 answerable questions of 10.

## 2026-08-24 · backup — category 5 re-driven on the LIQUID Dictionary: **8/10**

The disposition above ("NOT SCORED, and it cannot be scored before L3") was correct when it was
written and is now **superseded**. L3 landed `button.fwin-b-liquid` and L5 landed the painted
`.lq-contextual` regions, so Q6, Q7 and Q8 have a subject on an opted-in window and the honest
thing is to measure them rather than keep recording an absence.

State driven: Dictionary window in **Liquid** presentation, `lang=en`, `data-theme=forest-night`,
`data-perf=performance`, 食べる → **8 `dict-entry` results / 5,963 chars / 349 nodes / 67 controls**,
box `820x580`. Not an empty harness.

| Q | Verdict | The number |
| - | ------- | ---------- |
| 1 | YES | `entryPoints` **3** (1 input + 2 accent), bar 1..3 |
| 2 | YES | title `Dictionary`, back affordances **1** |
| 3 | YES | `button.btn` primary, inside body viewport at `scrollTop 0` |
| 4 | **NO** | **20** chrome controls, **6** collapsed disclosures — bar is `<=12` chrome |
| 5 | INHERIT-PASS | min **5.30:1** over 141 runs, 0 failing (`l1-accessibility.js`) |
| 6 | YES | **3** Liquid-treated regions, **3** carrying a transition, **0** infinite animations |
| 7 | YES | contextual painting **3 → 0 → 3**; control set equal; geometry equal to 1 px |
| 8 | YES | round trip: entries 8/8/8, chars 5963/5963/5963, scroll, focus, search value all equal |
| 9 | NOT EARNABLE | `parity-ledger.json` still **0 of 7 rows `both`** — no post-migration term |
| 10 | YES | 4 of 4 identity markers; card uniformity 0.75, **1** control signature = a gallery |

**Score 8/10.** Q4 is a real product finding; Q9 cannot be earned by this surface at all until the
parity ledger closes. Nothing here is rounded up.

### Two instrument defects, both of which had already produced a false answer

1. **Q6 read `NO-SUBJECT` on a window that was visibly in Liquid presentation.** It counted
   regions with a `backdrop-filter`, and this surface has **0** of them — by design.
   `theme/liquid-window.css` states the reason at the rule: `.fwin` carries
   `transform: translateZ(0)` and is therefore a backdrop root, so a `backdrop-filter` inside it
   would sample the window's own opaque body. Liquid is spelled here as translucency + border +
   radius + shadow on `.lq-contextual`, painted only under `.fwin-liquid`. **A probe that knows one
   spelling of a material reports the absence of the other as the absence of the feature** — the
   same class of error as the `.desktop` selector that matched nothing and read as "the app has no
   desktop". Q6 now takes the union of both spellings: **0 by backdrop-filter, 3 by contextual paint**.
2. **Q7 scored NO for the toggle working correctly.** The control-label set differs across the
   round trip because the presentation toggle's own `aria-label` changes — measured:
   `Return to standard window` ↔ `Make Liquid`. That is the affordance doing its job, not a lost
   feature. The toggle is now excluded from the parity set, and the parity set is 64 controls.

Also replaced: Q7's `zeroBackdropRegions` check was structurally `true` on this surface and so
discriminated nothing. The check that does the work is `liquidWasPainting` **AND**
`zeroLiquidTreatmentInStandard` — liquid must have been painting in the first place, or "0 in
standard" passes for a surface that has no Liquid treatment at all.

### The negative controls fired, both of them

`l1-q78-drive.cjs --control q7|q8`. Neither control run parks its verdicts, so a planted failure
can never reach a score — the driver asserts that in its own output.

| Plant | Expected | Observed |
| ----- | -------- | -------- |
| a `.lq-contextual` painted **inline** (cascade cannot remove it) | Q7 NO | **NO** — standard painting **1**, `zeroLiquidTreatmentInStandard: false`, `zeroBackdropRegions: false` |
| remove one `.dict-entry` while standard | Q8 NO | **NO** — entries **8 → 7**, chars **5963 → 5843**, `sameResults/sameTextLength/sameControlSet` all false |

Surface restored after: re-driven to **8 entries / 5,963 chars**, and a clean run re-parked
`q7 YES / q8 YES` before the clarity probe was read.

### Measured contextual treatment, both presentations

`view-head` **772x65 → 772x47**, `dict-saved-searches` **772x53 → 772x35**,
`lexicon-lens-picker` **772x50 → 772x32**. In liquid all three read
`color(srgb 0.0706 0.1098 0.0902 / 0.72)` + `1px` border + `16px` radius + shadow set + `8px`
padding; in standard all three read `rgba(0, 0, 0, 0)` + `0px` + `0px` + `none` + `0px`.
Conventional presentation is unchanged, which is §2's first non-negotiable.

### What category 5 needs to reach 10

- **Q4** — 20 chrome controls against a bar of 12. This is the one open product change, and the bar
  is this probe's own choice and stated so it can be argued with. Decide it deliberately; do not
  reflexively hide six controls behind a disclosure.
- **Q9** — `parity-ledger.json` at 0 of 7. Not fixable from this surface; it closes with L6.

**Trap.** The Q8 control leaves the surface with 7 entries. Re-drive 食べる before reading anything
else, or the next probe scores a surface the control damaged.
