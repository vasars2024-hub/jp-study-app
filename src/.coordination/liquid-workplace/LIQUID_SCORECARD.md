# Liquid scorecard — every surface that has been measured against the rubric

Authority: `src/LIQUID_UI_RUBRIC.md`. Eight categories, 10 points each, **80/80 or the
surface is not done**. A surface at 79/80 is not "essentially done" and is not reported as
a pass.

This file is **append-only**. A scorecard is never edited to raise a score; a re-score
after a fix is a new entry carrying the fixing commit.

## What an entry must contain

Per the rubric's "Rules that make the score mean something" — each of these is a way this
repo's probes have already produced a false pass:

- a **number** per category, never an adjective;
- the **negative control** for that category and the fact that it actually failed — a
  control that did not fail voids the score rather than earning it;
- the **instrument** (`css-measure`, `jp-bridge`, `honesty-probe`, `/health`);
- the **commit** that earned the score, and for a re-score, the fix it followed;
- the **real functional state** it was driven in — a category measured only on an empty
  harness is capped at **0**, not skipped;
- for anything main-process, confirmation of a **real restart** before measuring.

## Entry template

```text
## <YYYY-MM-DD> — <surface> — <total>/80 — commit <hash>
State driven: <the real functional state, with its numbers>
Restart before main-process measurement: <yes/no + evidence>

| # | Category                        | Score | Number measured | Negative control (must have failed) |
| - | ------------------------------- | ----- | --------------- | ----------------------------------- |
| 1 | Accessibility                   |  /10  |                 |                                     |
| 2 | Clunkiness                      |  /10  |                 |                                     |
| 3 | Liquid utilization              |  /10  |                 |                                     |
| 4 | Use of space                    |  /10  |                 |                                     |
| 5 | UI clarity                      |  /10  |                 |                                     |
| 6 | Feature parity + reversibility  |  /10  |                 |                                     |
| 7 | Performance under real load     |  /10  |                 |                                     |
| 8 | Honest states                   |  /10  |                 |                                     |

Lowest category: <name> — <what was wrong> — <fixed in <hash> / open>
```

## Scorecards

*No completed scorecard yet* — but the paragraph that stood here ("no Liquid product code
exists to score") is **stale and is corrected**, 2026-08-24. L2 built the primitives, L3
shipped per-window presentation state and L5 adopted the contextual role on the Dictionary
window, so Liquid product code exists and one surface is being scored category by category.
`src/media/` remains CLAUDE.md's named architectural reference and remains **not certified**;
"the player already exists and looks Liquid" is still not evidence that L4 passed.

**All eight categories now hold a 10 on the Liquid Dictionary window — and there is still no
completed entry, deliberately.** The rubric's own rule decides it: *"Re-score after the fix, not
before. The commit that fixes a category carries the new measurement; a score inherited across a
change is stale by definition."* Categories **2, 5, 6, 7 and 8** were each measured on an earlier
tree, and the tree has moved since — `e4de125b` changed `liquid-tokens.css`, this turn's
category-4 slice changed `conjugationTable.css`. A scorecard assembled from five inherited
scores and three fresh ones is exactly the false pass the rules exist to prevent.

**What the completed entry needs, and it is the next slice:** re-drive **2, 5, 6, 7, 8** on the
current tree, each with its own control failing in that session, then write one entry carrying
all eight numbers and the commit. Category 7 is the cheap one — its restart requirement is
already satisfied (`bridge.json` `started` 1787560481897, pid 22560, this turn).

**In progress — Liquid Dictionary window.** An entry is written only when all eight categories
sit on this one surface *at one tree*, so this is running state, not a score:

| # | Category                       | State | Where the number lives |
| - | ------------------------------ | ----- | ---------------------- |
| 1 | Accessibility                  | **10/10** — `41ba85b7` | `L1_ACCESSIBILITY.md` |
| 2 | Clunkiness                     | **10/10** — `7cdc34b4` | `L1_CLUNKINESS.md` |
| 3 | Liquid utilization             | **10/10** — this commit | `L1_SURFACE_ROLES.md` |
| 4 | Use of space                   | **10/10** — this commit | `L1_USE_OF_SPACE.md` |
| 5 | UI clarity                     | **10/10** — `cbb3506a` | `L1_UI_CLARITY.md` |
| 6 | Feature parity + reversibility | **10/10** — `aaef2a84` | `L6_PARITY_DICTIONARY.md` |
| 7 | Performance under real load    | **10/10** — `752daa00` | `L7_PERF_DICTIONARY.md` |
| 8 | Honest states                  | **10/10** — `9d9e876c` | `L8_STATES.md`, `L8_DEAD_CONTROLS.md` |

**Category 2's point, unlike 5 and 8, was a product defect.** `Explain again` bypassed the
dictionary cache but not the provider session cache, so the second ask in a session returned the
byte-identical answer in 2 ms and the control did nothing (`7cdc34b4`). **Six** of eight
categories now sit at 10 on this surface; **3 and 4 remain**, each owed a re-drive *as this
surface* rather than as the L1 reference apps they were first measured on.

**Category 1 cost four commits and changed nothing in the product**, which is the most useful
thing this surface has produced. Its two "open product decisions" — 46 of 57 controls under 32 px,
and 0.14 s under reduced motion — were an instrument that scrolled the window it was measuring,
a population that included controls inside closed `<details>`, a checkbox measured without its
142 px label, and a motion bar scored against the in-app *Reduced* tier instead of the OS query
the rubric names. Every one read as a product defect and none was.

**Both points categories 5 and 8 gained on 2026-08-24 came from instrument defects, not from
changes to the product** — a hardcoded Q9 verdict that reported a number nobody computed, and a
clutter term that moved 12 points depending on whether a drawer happened to be open. That is
the expected shape at this stage, and it is the argument for the rules above: each of this
surface's scored categories was measured by a probe that had already produced one false answer.

A first-pass 80/80 on any surface means the probe is broken, not that the surface is
perfect.
