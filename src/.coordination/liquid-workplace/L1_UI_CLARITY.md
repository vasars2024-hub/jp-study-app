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

## 2026-08-24 · primary — Q9 was a string literal, and it reported a number nobody computed

The 2026-08-24 entry above scored Q9 **NOT EARNABLE** on *"`parity-ledger.json` still **0 of 7**
rows `both`"*. The file holds **7 of 7** `both`, every one carrying an `observed` measurement, and
has since L6 closed the category on 2026-08-17. The probe never opened it: Q9 was the hardcoded
string `'INHERIT'` beside the note *"no migration has occurred"*, written before L3.2 shipped
`Make Liquid` on this window.

**This is the false-pass shape the rubric names, pointed at a score instead of a feature.** A
selector that matches nothing reports a live feature as absent; a hardcoded verdict reports a
stale belief as a measurement, and it cannot go stale gracefully — nothing about it changes when
the product does. It is worth more than the one point it cost: **any `'INHERIT'` literal in these
probes is a number nobody computed**, and Q5's is the other one (it is at least true — 141 runs,
0 failing, re-driven at this tree — but it is inherited, not measured here).

**The replacement, `probes/l1-q9-drive.cjs`, requires two terms that can disagree.** Reading the
ledger alone would still be trusting a record, and the rubric forbids scoring from source. So:

| Term | What it must show | Measured |
| --- | --- | --- |
| recorded | every `app: dictionary` row `both` **and** carrying a non-empty `observed` | **7 / 7** |
| live | `window.__L6.check()` re-run at this tree reports every row `reachable` | **7 / 7** |

A row the ledger claims and the live check denies is a REGRESSION and scores NO. That
disagreement is exactly what the control induces. State driven: Liquid presentation, 食べる,
**8 entries / 5,251 chars / 69 controls**, box `820x580` — not an empty harness.

**Three negative controls, via L6's own `mutate()`, each flipping exactly its own row:**

| Plant | Live | Ledger | Q9 |
| --- | --- | --- | --- |
| notes filter detached | **6/7** — `notesFilter (absent)` | still 7/7 `both` | **NO** |
| both language buttons `active` | **6/7** — `sourceSwitch (ja.active=true zh.active=true)` | still 7/7 | **NO** |
| `aria-pressed` stripped off the Liquid toggle | **6/7** — `windowLifecycle (liquidAriaPressed=null)` | still 7/7 | **NO** |

The ledger column is the point: it stayed 7/7 through all three, so the NO came from the live
term and not from the file. Each run reports `parked: false` and asserts it — **a control run
never parks a verdict**, or a planted failure could reach a score. All three `restored`.

**Category 5 on the Liquid Dictionary window is now 9/10** (Q1-Q3 YES, Q4 NO, Q5 INHERIT-PASS,
Q6-Q10 YES). Q4 is the only remaining NO and is a bar question, taken next.

**Trap.** `l6-parity-dictionary.js` ends `})();` and the bridge evaluates **one expression** — the
trailing semicolon makes it a statement and the bridge answers *"Script failed to execute"*, which
reads like a broken probe. `.trim().replace(/;$/, '')` before posting. The driver also treats a
`result: null` as a throw rather than an answer, because the bridge returns null for both.

## 2026-08-24 · primary — Q4: the clutter term moved 12 points on drawer state, and 12 was the bar

Q4 scored NO on `chromeControls` **22** against a bar of **12**, and the entry above called it
"the one open product change". It is not a product change. Two defects in the term, neither about
the surface:

1. **It counted the contents of an OPEN disclosure.** 13 of the 22 sat inside `details` elements
   and were on screen only because an earlier probe clicked the drawers open to score category 3.
   This is L5.2's trap in the other direction — there a *closed* drawer inflated a Liquid-eligible
   denominator by 125%; here an *open* one inflated clutter by the same mechanism.
2. **It double-charged the disclosure mechanism.** The first half of the bar rewards collapsed
   disclosures; the second half then charged for the `summary` header every disclosure must have.
   The more advanced tools a surface tucks away, the worse it scored — on the question that asks
   it to tuck them away.

**The decision, standing auto-approval, reversible, and the bar was NOT moved.** The clutter term
is now *controls scanned in the default state*: `chromeControls` minus the contents of any
`details` (tucked away by definition, which is what the first half rewards) and minus the
`summary` headers (counted once, by `collapsedDisclosures`, not twice). Bar stays **12**. Every
raw component is reported beside the verdict — `chromeControlsRaw`, `summaryHeaders`,
`behindDisclosure`, `disclosures.{total,open}` and the full `scannedList` — so the split is
arguable rather than asserted.

**Guard 1, invariance — and it is what proves the complaint rather than restating it.**
`probes/l1-q4-guards.cjs` re-counts with every disclosure forced closed and again forced open:

| Term | drawers closed | drawers open | invariant |
| --- | --- | --- | --- |
| old `chromeControls` | **20** | **32** | **NO — moves by 12** |
| new `scannedControls` | **11** | **11** | **yes** |

The old term's swing *is* the bar. Whether this surface passed Q4 was decided by whether someone
had clicked a drawer, and the 22 that was written up was simply a mid-state reading. Drawers
restored to the set they were found in: `open 2 of 8`.

**Guard 2, the control — a redefinition that flips a score needs one or it is just bar-moving.**
2 real controls planted at top level (`insideDetails 0`, `insideRow 0`): scanned **11 → 13**,
Q4 **YES → NO**. Removed: **13 → 11**, `verdictReturned true`. A term that cannot be pushed over
its own bar is measuring nothing; this one can.

**The 11 that are scanned**, so the number is inspectable rather than trusted: 日本語, 中文, the
search input, `Search`, `Save search`, the saved-search chip 食べる, `Remove saved search`,
`Automatic`, `Dictionary`, `Interlinear`, `Example sentences`. Eight `summary` headers sit beside
them as the discovery affordance, with 6 of the 8 collapsed.

## Category 5 on the Liquid Dictionary window: **10/10**

State driven: Liquid presentation, `lang=en`, `data-theme=forest-night`, `data-perf=performance`,
食べる → **8 entries**, box `820x580`. Q1-Q4 YES, Q5 INHERIT-PASS (min **5.30:1** over 141 runs,
0 failing, `l1-accessibility.js` re-driven at this tree), Q6-Q10 YES. The two categories this
turn raised — 8/10 → 9/10 → 10/10 — were both instrument defects, and neither point came from a
change to the product.

## 2026-08-25 · primary — Video scored for the first time; Q6 fixed, Q4 is a real open number

`l1-ui-clarity.js` already measures EVERY `.fwin` — no adaptation and no new probe was needed,
which is why the previous turns' "Video is unmeasured" was a reading gap, not a missing instrument.

**Video, 1080x700, `forest-night`, en, 35 controls painted.** Q1 YES (3 entry points, 1 accent
button), Q2 YES (title "Video", 3 back affordances), Q3 YES (primary action inside the body at
`scrollTop 0`), **Q4 NO**, Q5 INHERIT (from `l1-accessibility.js`), **Q6 NO → YES** (`98bd70ea`),
Q7/Q8 MEASURE (`l1-q78-drive.cjs` has not run at this tree), Q9 MEASURE (`l1-q9-drive.cjs`),
Q10 YES (4 identity markers, cardUniformity 0).

**Q6 is closed and re-scored in the fix's own commit.** `.mc-sidebar` (blur 24px) and
`.mc-topbar` (blur 18px) both computed `transitionProperty: all 0s` — `carryingATransition`
**0 of 2**. `:focus-within` now colours each region's own edge, transitioned 140ms.
Measured in SPLIT evals, because a single eval reads the transition at t=0 and returns the
RESTING value — the first attempt reported "no change" on a rule that was working. Sidebar
focused: its border-right rgba(255,255,255,0.075) → rgb(255,107,132) while `.mc-topbar` stayed
rgba(255,255,255,0.075) (the sibling does not fire). Blurred: both return. `animationName none`,
iteration 1. Re-scored **2 of 2** on Video and on Media, which shares the rules.

**Q4 is NOT closed and the number is not close.** `collapsedDisclosures 0`, `chromeControlsRaw
30` against a bar of ">=1 collapsed and <=12". The 30 are 10 sidebar nav + 2 history + search +
2 top actions + 9 library rail + sort + 2 view + Add + the 2 spotlight actions. Getting to 12
means hiding ~18 controls, and 19 of the 30 are PRIMARY navigation across two persistent rails —
hiding those would breach the plan's own "do not obscure a feature" non-negotiable. So this is a
real design decision (a collapsible sidebar, or grouping the rail's three category rows behind a
disclosure), not a CSS fix, and it is the open unit for category 5. **Category 5 on Video is
currently 8 answerable of 10 with Q4 NO — not a 10, and it stays counted.**

## 2026-08-25 · primary — Q4's first product change on the Media shell: the rail is a disclosure now

Q4's open number was **30 scanned chrome controls against a bar of 12, with 0 collapsed
disclosures**, and the previous entry called it a design decision rather than a CSS fix. It is.
The decision taken, under the relay's standing auto-approval, is the one with an argument that
does not depend on the probe: **the Media Center already carries its own 174–222px shell sidebar
of ten destinations, and the Library page put a SECOND persistent vertical column of nine rows
beside it.** At the shell's default 820px box that is close to half the window spent on two
stacked navigation columns — a use-of-space defect independent of Q4.

`MediaLibrarySidebar.tsx`: each of the three groups is now a real `<details>` with its heading as
the `<summary>`. Library open, Media type and Collections closed until asked for, remembered per
group in `jp-medialib-rail-groups`, merged over the defaults so a blob written before a group
existed cannot decide its first render. **Nothing is obscured**: every heading stays on screen
with its own chevron, one click and one Enter away, and the group holding the ACTIVE scope is
force-opened so the rail can never hide where you are.

**Measured live, Video 1080×700 and Media 820×580, Media Center on Library / Continue watching:**

| term | before | after |
| --- | --- | --- |
| scannedControls | **30** | **19** |
| collapsedDisclosures | **0** | **1** |
| chromeControlsRaw | 30 | 27 |
| summaryHeaders / behindDisclosure | 0 / 0 | 2 / 6 |
| Q4 verdict | NO | **NO** — first half of the bar met, 19 > 12 |

Disclosure verified as a real one, not a class: closed group **20px** tall against **118px** open,
`checkVisibility()` **false** on its nav and its first row, and the reverse transition
(closed → open → closed) returns every number byte-identical.

**Trap, and it produced a false reading in this session before it was caught:**
`getBoundingClientRect()` on a node inside a CLOSED `<details>` still returns its last laid-out
box — 207×98 here — because Chromium hides the subtree with `content-visibility`, not `display`.
The first check reported the collapsed group as still painted. Only `checkVisibility()` and the
group's own height tell the truth.

**What is left of Q4, stated as a number rather than a plan:** 19 = 10 shell-sidebar destinations
+ 5 topbar (Back, Forward, search, Add, Settings) + 4 library toolbar. Reaching 12 means the shell
sidebar itself, which is the window's primary navigation — a second design decision, not a repeat
of this one. **Q4 stays NO and category 5 on Video stays PARKED at 9 answerable of 10.**

## 2026-08-25 · primary — Q6 on Video was NO because of one 35×34 chip, and buying the point would have been the failure

| Slice | Commit | What landed |
| --- | --- | --- |
| Q6 term narrowed + 3 guards | *this commit* | `l1-ui-clarity.js`, new `probes/l1-q6-guards.cjs` |

**The measurement.** Video (`.mc-root`, liquid, 1080×700) read Q6 **NO** on `liquidRegions` 4 /
`carryingATransition` 3. The dissenting element, named: `span.medialib-card__badge` — **35×34**,
the count chip on a poster, `backdrop-filter: blur(6px)` over a fixed `rgb(0 0 0 / 0.66)`,
`transition-duration: 0s` (`mediaLibrary.css:495`). It is a static label with no state to change,
so the only way to satisfy the old term was to give a chip decorative motion — which is the exact
failure Q6 exists to catch. **That point would have been bought, not earned.**

**The term now says what it always meant.** Motion explains a relationship only for something whose
presence or position moves with state, i.e. a surface that HOLDS content. A Liquid region is
therefore (a) not itself a control and (b) holds at least one painted element child. Neither
condition mentions the badge. `liquidMaterialTotal` and `decoratedLeaves` are both reported, so the
split is arguable rather than asserted.

**A redefinition that flips a score needs its own controls** — Q4's rule, applied here. All three
fired, and the surface came back:

| guard | what it does | result |
| --- | --- | --- |
| `containerPlant` | plants a Liquid-material CONTAINER, `transition:none`, one painted child | regions **3 → 4**, Q6 **YES → NO**, names `div.l1-q6-plant` |
| `leafPlant` | the identical material as a LEAF (0 element children) | material **4 → 5**, regions **flat at 3**, Q6 stays **YES** |
| `suppressReal` | `transition: none !important` on `aside.mc-sidebar`, a region the app ships | carrying **3 → 2**, Q6 **NO**, names `.mc-sidebar` |
| `restored` | re-read after every plant and override is undone | verdict, regions, material, carrying all **== asFound** |

Guard 1 alone would pass for a term that counts everything and guard 2 alone for a term that counts
nothing; both are required. Whole run reproduced twice, identical numbers.

**Q6 on Video: YES.** 3 regions (`aside.mc-sidebar`, `header.mc-topbar`, `nav.lq-contextual`), all
3 carrying a transition, `infiniteAnimationsOnLiquid` **0**, 1 decorated leaf refused. The current
run also re-reads **Q4 NO at scannedControls 19** — unchanged, and still the open unit.
**Category 5 on Video: Q1 Q2 Q3 Q6 Q10 YES, Q4 NO, Q5 INHERIT, Q7/Q8/Q9 MEASURE — still not a 10.**

**Residual, disclosed.** The dead-end sweep earlier this turn drove the rail's category rows, which
force-opens the group holding the active scope, leaving Video's `Media type` group open where Media
had it closed. Closed it back; both windows now read `Library=true, Media type=false`. That write
created `jp-medialib-rail-groups` (previously **absent**) holding
`{"library":true,"mediaType":false,"collections":false}` — byte-identical to the defaults the
component merges over, so it changes no first render.
