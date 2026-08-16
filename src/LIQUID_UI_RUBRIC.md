# Liquid UI Rubric — the acceptance gate for every Liquid surface

Status: **authority**. Created 2026-08-16 on a direct user instruction that replaces the
user visual-approval gates in `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §10.4, §12 and the
L1/L4/L12 gates. The user's words: *"remove needing visual approval for me, instead i want it
to evaluate it on different metrics — user accessibility, clunkiness, liquid utilization, use
of space, ui and user friendly, and 3 other categories, and if its not a 10/10 improve it."*

No surface is approved by a human looking at it. A surface is approved when it scores
**80/80** on the eight categories below, every score backed by a measured number and a
negative control, and the evidence committed.

## The loop, per surface

1. Drive the surface live (`jp-bridge`), in the real app, in at least one **real functional
   state** — never an empty harness.
2. Score all eight categories. Record the number, the instrument, and the negative control.
3. Any category below 10 → **fix it, then re-drive and re-score from scratch.** Do not carry a
   score forward across a fix.
4. Repeat until 80/80. Append the passing scorecard to
   `src/.coordination/liquid-workplace/LIQUID_SCORECARD.md` with the commit that earned it.

A surface at 79/80 is not done, is not "essentially done", and is not reported as a pass.

## The eight categories, 10 points each

### 1. Accessibility

Contrast on every readable surface, focus visibility and order, keyboard reachability of every
control, hit-target size, reduced-motion behavior, and the semantics a screen reader gets.

- Instrument: `css-measure` for every number. Sampled painted pixels, not declared tokens —
  a translucent Liquid material's *effective* contrast is what counts, over its real backdrop.
- Numbers to report: minimum contrast ratio and the element that owns it; smallest hit target
  in px; count of controls not reachable by keyboard; motion duration under
  `prefers-reduced-motion`.
- 10 requires: min contrast ≥ 4.5:1 for body text and ≥ 3:1 for UI/graphical boundaries, every
  interactive element ≥ 32 px in its smallest dimension and `tabIndex` reachable, focus ring
  visible against the Liquid material itself, reduced motion collapsing animation to ≤ 0.01 s.
- Negative control: measure one element you know fails (or force a failing value) and confirm
  the probe reports it. A probe that has never returned a failure this session is unproven.

### 2. Clunkiness

The interaction cost of doing the surface's dominant task, and whether anything fights back.

- Instrument: drive the actual task end to end through the bridge and count.
- Numbers to report: clicks and keystrokes to complete the dominant task, compared with the
  Standard-mode path; count of dead ends (controls that lead nowhere), modal traps (no
  keyboard escape), and scroll traps; observed latency between input and visible response.
- 10 requires: the Liquid path costs no more input than the Standard path, zero dead ends,
  zero modal traps, and every input acknowledged within 100 ms.
- Negative control: a deliberately wrong flow must be reported as a dead end. If everything
  you try scores clean, the probe is not discriminating.

### 3. Liquid utilization

Whether the Liquid language is used **where the plan says to and nowhere else**. §2.3: Liquid
is selective. Universal glass is a failure, not a maximum.

- Instrument: classify every surface region as Anchor / Work / Liquid / Ambient, then check the
  classification against what is painted.
- Numbers to report: count of dense-work regions (reading, editing, forms, tables, logs,
  calendars, review cards) rendered on a translucent material — this must be **0**; count of
  navigation/transport/inspector/transition regions that got Liquid treatment vs. total.
- 10 requires: 0 dense-work regions on Liquid material, every contextual-navigation region
  using the shared primitives rather than a local re-implementation, and each Liquid motion
  explaining a real spatial relationship rather than decorating.
- Negative control: a surface that is deliberately all-glass must score low here. If the
  category cannot produce a low score, it is measuring nothing.

### 4. Use of space

Density and reflow — at compact, default, and maximized, which are three separate measurements.

- Instrument: `css-measure` geometry at all three sizes, plus the smallest supported size.
- Numbers to report: clipped or overlapping elements (must be 0 at every size); horizontal
  body scroll (must be absent); largest contiguous dead region as a fraction of viewport;
  content-to-chrome ratio.
- 10 requires: 0 clipping and 0 overlap at all three sizes, no horizontal body scroll, no dead
  region over 15% of the viewport, and the dominant content growing into extra space rather
  than the chrome growing.
- Negative control: shrink below the smallest supported size and confirm the measurement
  reports the breakage it should.

### 5. UI clarity and user-friendliness

The §10.4 questions, now scored instead of asked of a human.

- Instrument: drive the surface cold, as a user who has not seen it, and answer each question
  from what is observably on screen — not from source.
- Numbers to report: one point each for the ten §10.4 questions, halved to a /10 score; name
  every question that failed and the element responsible.
- 10 requires: all ten answerable "yes" from the rendered surface alone — dominant task
  obvious, location and way back obvious, primary actions visible without hunting, advanced
  tools discoverable without cluttering, stable contrast, motion that explains, Standard mode
  still normal, Liquid reversible without state loss, all pre-migration features reachable,
  and the app still feeling like itself.
- Negative control: at least one question must have failed at some point during the surface's
  history and been fixed. A surface that answered "yes" ten times on the first pass was not
  really asked.

### 6. Feature parity and reversibility

§2.2 and §5.3. A capability that becomes Liquid-only, or that does not survive the round trip,
is a regression — the single most expensive way this transformation can fail.

- Instrument: the feature-parity ledger row for this surface, verified by **observable side
  effects**, never by button presence.
- Numbers to report: features reachable in Standard vs. reachable in Liquid (must be equal);
  ledger rows closed vs. total; and the round-trip diff of app data across
  Standard → Liquid → Standard.
- 10 requires: parity exactly equal, every ledger row closed by side effect, and the round trip
  preserving app data byte-for-byte along with geometry, focus, z-order, pin, pop-out, snap,
  monitor placement, and taskbar identity.
- Negative control: remove a feature deliberately and confirm the ledger check catches it. A
  parity check that has never caught a missing feature has never been shown to work.

### 7. Performance under real load

CLAUDE.md treats drag responsiveness, startup, and theme-switch cost as product invariants,
and L0 records these baselines precisely so this category can be scored against them.

- Instrument: measure against the L0 baseline for the same surface, on real data, after a real
  restart — main does not hot-reload, so a measurement taken without one is void.
- Numbers to report: frame stability during window drag and resize; theme-switch cost; boot
  cost; memory; and the longest main-process block observed while the surface is doing its
  real work (a `/health` probe answers this — it touches main only).
- 10 requires: no regression against the L0 baseline on any of them, and no main-process block
  over 500 ms under the surface's heaviest real operation.
- Negative control: the enrichment defect fixed in `7954921a` is the reference case — a
  36,910 ms `/health` during the run vs. 1 ms after. A perf probe that cannot reproduce that
  shape of finding is not sensitive enough to score this category.

### 8. Honest states

CLAUDE.md: user-visible failures must be honest. No mock data, no placeholder success, no
inactive control presented as working.

- Instrument: the `honesty-probe` skill's six probes, driven live.
- Numbers to report: count of dead controls (present but with no observable effect); count of
  fabricated or placeholder values rendered as real; and whether empty, loading, error, and
  offline states each render a named, translated message.
- 10 requires: 0 dead controls, 0 fabricated values, all four states rendering a real message
  with 0 raw i18n keys in all four languages.
- Negative control: induce a genuine failure (unreachable host, missing file) and confirm the
  surface names it rather than showing a generic or false-success state.

## Rules that make the score mean something

These exist because this repo's own probes have produced false passes three separate ways, and
a self-scored 10/10 is precisely the shape that goes wrong.

- **A number, never an adjective.** "37 cues across 4 episodes", not "cues fetched". A category
  reported without its number is unscored, not passed.
- **A negative control or it did not happen.** Every category above names one. If the control
  does not fail, the probe is broken and the score is **void** — not 10.
- **No score from reading source.** Every category is driven live. Source explains a score; it
  cannot produce one.
- **Empty state caps the score at 0.** A category measured only on an empty harness or seed-less
  fixture is not measured. Harness fixtures must be typechecked first — a type-wrong fixture
  reads as a product bug.
- **Re-score after the fix, not before.** The commit that fixes a category carries the new
  measurement; a score inherited across a change is stale by definition.
- **Restart before measuring anything main-process.** Main does not hot-reload; a live check
  without a restart proves nothing.
- **`pct` is honest or it is worthless.** An inherited score is annotated as inherited and is
  not re-reported as fresh evidence.

## What still comes back to the user

Nothing, for scoring. The user has removed themselves from the approval loop deliberately, and
these scorecards are not to be parked in `needs-user.md` or re-raised as blockers. The only
items that still reach them are the standing exceptions: an irreversible external action, money,
a personal credential, or deleting user data.
