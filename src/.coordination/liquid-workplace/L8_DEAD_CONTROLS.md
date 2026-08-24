# L8 — dead controls on the Liquid Dictionary window

Rubric category 8's first number: *count of dead controls (present but with no observable effect)*.
Instrument `probes/l8-dead-controls.cjs`, driven live against pid 7920, 2026-08-24.
Raw run: `baselines/l8-dead-controls-run7.json`.

## The number

**65 controls, 22 excluded with a stated reason, 43 probed, 43 ALIVE, 0 DEAD.**
Both controls held: the planted no-op button read **DEAD**, the planted mutating button read
**ALIVE**. Per the rubric's own rule, a run where the deadness control comes back alive is VOID —
this one is not. `notActuated 0`, `gone 0`: every probed control has a verdict, none was skipped.

Denominator, in full: 8 `+ Add to Anki` and 8 `Copy to clipboard history` (write real user data),
`Remove saved search`, `Forget this explanation` (destructive, no undo), and the five window-chrome
controls (close/minimise/maximise/pop-out/presentation toggle).

## What four earlier runs got wrong, so nobody re-earns it

The same surface returned **45 false DEADs**, then **35 NOT ACTUATED**, then **26 GONE**, then
**1 false DEAD**, before it returned 0. Each was the instrument, not the product:

1. **A roster of element references is not a roster.** 中文 re-renders the result list; every
   stored node from index 14 on was a corpse and `click()` returned "detached". Fixed by
   `rematch()` — re-bind by `label|tag|type|class` + ordinal, with a **class-only fallback**
   because a cycling control's label *is* its state and the keyed match cannot survive it.
2. **A segmented picker's second click is not an undo.** Clicking 中文 collapsed 8 entries to 2
   and the 26 per-entry controls after it were then honestly absent. `preArm`/`unclick` read the
   group (`.dict-lang-toggle` marks its choice with a bare `active` class and **no ARIA at all**;
   `.lexicon-lens-picker` uses `aria-pressed` too) and restore by clicking the member that *was*
   active. The same fix turned `Automatic` from a false DEAD — it was already the active member,
   so clicking it was a no-op by design — into a measured ALIVE.
3. **An effect can outrun the settle.** `EntryExplain.forget()` awaits `dictExplanationClear`
   before clearing the panel and missed 450 ms. No control is now recorded DEAD until it has been
   re-probed at **3000 ms** (`--slow-settle`).
4. **Restoration must be measured against the surface as found**, not against the post-setup
   state, and one unrestorable control must not cost the census the rest: `restoreBaseline()`
   re-selects the install-time choices and re-runs the install-time query.

## Residue, and the one thing the census damaged

`lsSettle` removes keys the census *added* (`jp-os-dictionary-saved-searches-v1`) and reports
keys it merely changed without reverting them. Before that existed, the there-and-back walked all
eight looked-up words **New → Learning → Familiar** in real study data; cycle-restore now keeps
actuating until the label returns, and those eight were put back to New by hand.

## Product observation for category 8, not scored here

**7 one-way controls**: `Play <word>` becomes `No recording for this word` and never returns
(`.word-audio`, all 8 entries bar one). Honest text, but the control stays a button that can no
longer act. Category 8's remaining items — fabricated values, and the four states under a real
unreachable dependency — are unmeasured, so **no score is claimed for category 8 yet**.
