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

## 2026-08-24 (later) · primary — the re-drive found a category-7 failure. Still no entry, and now for a REASON rather than a rule.

The five inherited categories (2, 5, 6, 7, 8) were being re-driven on one tree so an entry could
finally be written. Two are done and they went opposite ways.

| # | Category | Re-driven on this tree | Result |
| - | -------- | ---------------------- | ------ |
| 6 | Feature parity + reversibility | yes, `b0232340` | **10/10** — parity 7/7 both presentations, round trip byte-for-byte, 3 of 3 controls fired |
| 2 | Clunkiness | partly, `b0232340` | dead ends 3 → the third was the probe; the sweep's own re-run is the number the entry needs |
| 7 | Performance under real load | yes | **NOT 10** — leg 3 fails |

**Category 7's leg 3 is a real finding and it is why there is still no scorecard.** Main-process
private memory goes **604.2 MB → 7,082.0 MB and handles 1,070 → 4,421 between 11 and 17 minutes of
uptime**, and does not come back (7,081.5 MB with the app quiet at 18.3 min). L0's baseline for
this surface is 550–577 MB. It reproduced on the boot before it (7,071.8 MB at ~15 min — the same
plateau to within 10 MB). Every Dictionary control was then bisected on a third boot with private
bytes sampled between clicks, and **none costs more than 8 MB** — search, all four `Find …`
controls, the Interlinear sections, all 8 `Play <word>`, and a whole AI explain create-and-forget
cycle. The jump sits in an uptime window rather than after an action, so the hypothesis under test
is time-based work in main.

**This is the first category on this surface whose lost point is NOT an instrument defect**, after
categories 1, 2, 5 and 8 each turned out to be one. The rubric's line about a first-pass 80/80
meaning the probe is broken has been paid twice over; this is the other half of it working.

Running state, unchanged except where re-driven this turn:

| # | Category | State | Tree it was measured on |
| - | -------- | ----- | ----------------------- |
| 1 | Accessibility | 10/10 `06ad1a55` | current |
| 2 | Clunkiness | 10/10 `7cdc34b4` → re-drive in `b0232340`, one number outstanding | current |
| 3 | Liquid utilization | 10/10 `debad557` | current |
| 4 | Use of space | 10/10 `6f86f2cc` | current |
| 5 | UI clarity | 10/10 `cbb3506a` | **stale — not re-driven** |
| 6 | Feature parity + reversibility | 10/10 `b0232340` | current |
| 7 | Performance under real load | **capped** — leg 3 regression | current |
| 8 | Honest states | 10/10 `9d9e876c` | **stale — not re-driven** |

**Next, in order:** find what allocates the 6.5 GB (the idle-boot sampler at marks 8–20 decides
whether it is a timer or an action), fix it, re-drive leg 3, then re-drive categories 5 and 8 and
the category-2 sweep. The entry is written when all eight sit on one tree — which is now blocked
on a product defect, not on bookkeeping.

## 2026-08-24 (late) · primary — leg 3's mechanism is measured closed; the category is NOT yet a 10, and that is deliberate

Category 7's blocker was leg 3: a load/unload cycle left unreclaimable native residue, most recently
**+612 handles / +1,298.5 MB per cycle with the weights already resident**. `cd01ffbd` pooled the KV
cache — the larger half — and the re-drive on a cold boot measured a whole cycle at **+1.8 MB and
−7 handles** (`L7_PERF_DICTIONARY.md`, this turn). Its adverse control fired in the same session: at
a 480 s gap both pools read `0 / 0`, private drops **2,371 MB**, and the next cycle costs
**+2,457.1 MB / +1,221 handles**.

**That is one leg, not the category, and the entry is still not written.** The rubric's rule cuts
both ways: a category is scored from its own instrument on the current tree, and category 7's
headline finding was `l1-deadend.js`'s **604.2 MB → 7,082.0 MB** over 19 Dictionary controls in
~70 s — a burst of ACTIONS, not three cycles. The cycle path is now cheap; whether the burst path is
has not been measured on this tree and will not be asserted from the cycle number. Reported as
measured.

Running state, unchanged except category 7:

| # | Category | State | Tree it was measured on |
| - | -------- | ----- | ----------------------- |
| 1 | Accessibility | 10/10 `06ad1a55` | current |
| 2 | Clunkiness | 10/10 `7cdc34b4` → re-drive in `b0232340`, one number outstanding | current |
| 3 | Liquid utilization | 10/10 `debad557` | current |
| 4 | Use of space | 10/10 `6f86f2cc` | current |
| 5 | UI clarity | 10/10 `cbb3506a` | **stale — not re-driven** |
| 6 | Feature parity + reversibility | 10/10 `b0232340` | current |
| 7 | Performance under real load | **leg 3 mechanism closed `cd01ffbd`; leg not re-driven end to end** | current for the cycle path only |
| 8 | Honest states | 10/10 `9d9e876c` | **stale — not re-driven** |

**Next, in order:** re-drive leg 3 over `l1-deadend.js` on a restarted app carrying `4e45c5f2` —
one boot, 19 controls, private bytes before and 70 s after, against L0's 550–577 MB baseline. If the
burst path is now flat, category 7 is a 10 and only 5, 8 and the category-2 sweep stand between this
surface and the first completed entry.

## 2026-08-24 (evening) · primary — leg 3 re-driven end to end. Category 2's number landed; category 7 is measurably NOT a 10

Two of the four outstanding items closed and the third produced a number that decides the surface.

| # | Category | Re-driven on this tree (pid 3668, `67918c19`) | Result |
| - | -------- | --------------------------------------------- | ------ |
| 2 | Clunkiness | yes — `l1-deadend.js` repaired and re-run | **0 dead ends of 18**, bait `changed:false` fired, 16 with effect, 0 gone, 0 unstable, coverage 18/18 |
| 7 | Performance under real load | yes — full release curve, not a plateau | **NOT 10** — settles **1,081.0 MB / 4,410 handles** against L0's 550–577 / ~1,055 |

**Category 7's leg 3, measured end to end for the first time.** 546.4 MB / 1,063 handles at boot →
**3,515.4 MB / 4,406** at the burst peak → KV cache freed at 8.55 min → weights freed at 9.55 min →
**1,081.1 MB with both pools reporting empty**. The 7,082 MB plateau that three earlier boots hit
and never left is gone; **2,434 MB now comes back unprompted**. What remains is **+534.6 MB and
+3,349 handles**, one-time rather than per-cycle (a whole cycle measures +1.8 MB / −7 handles), and
`llamaBackend.ts` already banks the measurement that it has no lever: disposing the backend costs
+2,425 handles per cycle either way.

**So this surface does not hold 80/80, and the reason is a product number, not bookkeeping.**
The only remaining lever on the residual is to stop loading llama.cpp into the main process at all
— a utility-process move. That is the next product slice for category 7 and it is named here
rather than attempted, because it is a whole slice and half-doing it would leave the surface worse.

Running state, unchanged except 2 and 7:

| # | Category | State | Tree it was measured on |
| - | -------- | ----- | ----------------------- |
| 1 | Accessibility | 10/10 `06ad1a55` | current |
| 2 | Clunkiness | **10/10 — this turn**, 0 dead ends of 18, control fired | **current** |
| 3 | Liquid utilization | 10/10 `debad557` | current |
| 4 | Use of space | 10/10 `6f86f2cc` | current |
| 5 | UI clarity | 10/10 `cbb3506a` | **stale — not re-driven** |
| 6 | Feature parity + reversibility | 10/10 `b0232340` | current |
| 7 | Performance under real load | **NOT 10 — 1,081.0 MB / 4,410 h settled** | **current, end to end** |
| 8 | Honest states | 10/10 `9d9e876c` | **stale — not re-driven** |

**Product code this turn: `424eb46f`** — the local model runtime had three shutdown disposals and
no caller, so a quit inside a 5-minute idle window exited holding 2.4 GB and llama.cpp's thread
pool. Found by reading `/mem`'s pool rows during the release curve above, not by a code sweep.

**Next, in order:** the utility-process move for category 7 (the one lever left on the residual),
then re-drive 5 and 8. Six of eight now sit at 10 on the current tree; 5 and 8 are stale rather
than failing, and 7 is failing rather than stale.

## 2026-08-24 (night) · primary — five of eight re-driven on one boot; still not a completed entry, and the gap is category 8

Process **30432**, cold boot on `971987a9`+`8b3bd5ea`, Dictionary alone visible, `presentation=liquid`,
食べる → 8 entries. Numbers and controls in `L7_PERF_DICTIONARY.md`, `L1_UI_CLARITY.md` lineage.

| # | Category | Re-driven on this boot | Result |
| - | -------- | ---------------------- | ------ |
| 1 | Accessibility | yes — `l1-accessibility.js` | **10/10**: 152 text nodes, min **5.30:1**, 0 failing; 57 targets, **0** WCAG 2.5.8 fails; 57 controls, **0** keyboard-unreachable, 0 focus hosts; parser self-test ok |
| 2 | Clunkiness | yes — `l1-deadend.js` + `-read` | **10/10**: 19 targets of a 62 roster (43 skipped as user-data writers), **16 with a measured effect**, bait `Probe control` correctly inert, 2 idempotent-by-state (`Search` re-running the same query, `Automatic` already `active`), **0 dead ends**, 0 unstable, `savedStoreUntouched` / `lensModeRestored` true |
| 3 | Liquid utilization | no | 10/10 `debad557`, **not re-driven** |
| 4 | Use of space | no | 10/10 `6f86f2cc`, **not re-driven** |
| 5 | UI clarity | yes — `l1-ui-clarity.js` + `q78` + `q9` | **10/10**: Q1–Q4 YES (7 collapsed disclosures, **9** scanned controls against a bar of 12), Q5 INHERIT-PASS off the fresh a11y run, Q6 YES (3 Liquid regions, 3 carrying a transition, 0 infinite), Q7/Q8 YES **with both controls now firing**, Q9 YES **7/7**, Q10 YES |
| 6 | Feature parity + reversibility | partly | 10/10 `b0232340`; its live term re-ran clean this boot (`__L6.check()` **7/7 reachable**), the category's own probe did not |
| 7 | Performance under real load | yes — legs 1, 2, 4 | frames at the display's own **16.7 ms** ceiling with **0** frames >100 ms on all three gestures; heaviest real action blocks main **168.6 ms** against a 500 ms bar; **the burst path now costs main +6.8 MB / +11 handles** where it once went 604.2 → 7,082.0 MB. Leg 3's 16/24-min marks pending at write time |
| 8 | Honest states | **no — the run is VOID** | `l8-honest-states.cjs` returned `baseline.entries 0 / chars 10`, i.e. it scored an empty harness, which the rubric caps at 0. Not scored, not inherited |

**Three controls fired, which is what makes the rest quotable.** Jank: p95 16.9 → **117.1**, frames
>100 ms 0 → 13. Isolation: a 1.5 s renderer block left main at **9.0 ms** max. Sensitivity: 756
single-term lookups → **38,049.3 ms** against a 1.0 ms idle p50. And two more that were not firing
before: `--control q7` now flips Q7 to **NO**, `--control q8` flips Q8 to **NO**.

**Why this is still not the first completed entry, stated plainly.** 80/80 needs all eight at 10 on
one tree. Category 8's instrument produced an empty-harness reading and is therefore unscored rather
than passed; 3 and 4 were not re-driven; 6 has only its live half. Reporting 80/80 off five re-drives
and three inherited rows is exactly the false completion this file exists to refuse.

**Next, in order:** find why `l8-honest-states.cjs` reads a cleared window and re-drive category 8;
then 3, 4 and 6's own probes; then the entry is writable in one pass. Category 7 is the one that was
failing and it is now the one with the most evidence behind it.

**Category 7's leg 3 landed after the table above was written, and it closes the category.** Main
private on process 30432: **619.6 MB at 8 min → 590.6 at 16 → 591.4 at 24**, handles 1067 → 1076 →
1071. All-process private fell **4,801.0 → 1,789.3 MB** when the llama host exited between the 16-
and 24-minute marks while main moved **+0.8 MB**. 591.4 is +14.4 MB (+2.5%) over the top of L0's
550–577 band, on a boot that did strictly more work than L0's; recorded as a pass with the number
stated, not as a band match. **Category 7 = 10/10**, five controls fired, nothing inherited.

That makes it **6 of 8 on this tree** (1, 2, 5, 7 re-driven; 6's live half re-driven; 3, 4 inherited
from `debad557` / `6f86f2cc`; **8 unscored**). Still not a completed entry, and category 8 is the
whole of what stands between here and one.

## 2026-08-24 (late) · primary — three categories moved because a product defect was removed, and the entry is STILL not completed

**What changed is product, not instrumentation.** `6b490fc3` removes a persisted `section: 'media'`
window — the Start menu's media CATEGORY id, never an app — that restored on every boot as an
820×580 frame over a `.fwin-body` with **zero child nodes**. Three separate probes had been reading
that blank window as if it were the surface under test (`l7d-setup.cjs` worked around it last turn;
`l8-honest-states.cjs` scored it and returned VOID; `l1-use-of-space-control.js` could not find its
discriminating window at all). `23cc333f` points both L8 probes at the window by title.

| # | Category | Re-driven | Result |
| - | -------- | --------- | ------ |
| 3 | Liquid utilization | yes, pid 30432 @ `6b490fc3` | **10/10**: `Work 7→12`, `eligible 9→4`, `denseWorkOnTranslucent` **0 of 12**, `liquidTreatedEligible` **4 of 4**; control 0→1→3→0, **CONTROL FAILED AS REQUIRED** after its restore check was moved from the style attribute to the computed material |
| 4 | Use of space | yes, pid 37540 @ `6b490fc3` | **10/10** for Dictionary: clipped **0** at 820×580 / 260×170 / 200×130, overlaps 0, h-scroll 0, `hiddenOverflowX` 0, dead **10.7%** of viewport vs 15%, chrome **5.7%**, canvas **32.3%**; control red on Media (**0 → 55 clipped → 0**), `allRestoredExactly true` |
| 8 | Honest states | yes, pid 30432 @ `6b490fc3` | **10/10**: four distinct renders, 0 raw i18n keys, 0 false successes; AnkiConnect **REFUSED** by node's own TCP with 5173 **LISTENING** as the control on the control; error carries provider code `authentication` + `role=alert`, absent-before → named-after, answer unchanged, `restored true` |

**Why this is still not the first completed entry, stated plainly.** 80/80 needs all eight at 10 on
ONE tree, and categories **1, 2, 5, 6, 7** were last measured on pid 30432 at `971987a9`+`8b3bd5ea`,
i.e. BEFORE `6b490fc3` changed the renderer and removed a window from the desktop. The rubric
forbids carrying a score across a change, so they are not 10 here — they are unmeasured here.
Writing 80/80 off three fresh rows and five stale ones is exactly the false completion this file
exists to refuse.

**Category 6 additionally needs its own probe re-driven**, not only its live term; that was already
true last turn and is unchanged.

**Next, and it is now cheap.** Re-drive 1, 2, 5, 6, 7 on pid **37540** in one pass. Every instrument
they use is repaired and the blank window that was corrupting three of them is gone, so this is one
sitting rather than five investigations. Then the entry is writable. **Video has still never been
scored at all**, and gate 461 needs both surfaces.

## 2026-08-24 (night 2) · primary — 1, 2, 5, 6 re-driven on the current tree; the entry is blocked by category 7, on a number

Process **37540** at `8cf1f2b8` (product tree = `6b490fc3`), the real three-window desktop —
Media 820×580 `standard`, Video 1080×700 `standard`, Dictionary 820×580 **`liquid`**, 食べる → **8**
entries, `forest-night`, `en`. Nothing below is inherited.

| # | Category | Re-driven | Result |
| - | -------- | --------- | ------ |
| 1 | Accessibility | yes | **10/10**: **154** text nodes, 0 unmeasurable, min **5.30:1** (`span.lexicon-etymology-source`), **0** failing; 57 targets, **0** WCAG 2.5.8 fails; 57 controls, **0** keyboard-unreachable. Control fired: forced colour → failing **0→1**, ratio **1.03**, restored **0 / 5.30** |
| 2 | Clunkiness | yes | **10/10**: 19 of a 62 roster, coverage **18/18**, **0 dead ends**, 16 with a measured effect, 0 gone, 0 unstable, `resolvedBy live 4 / key 14 / class 0`. Bait control fired (`changed:false`), `savedStoreUntouched` and `lensModeRestored` true |
| 5 | UI clarity | yes | **10/10**: Q1–Q10 all YES, Q5 INHERIT-PASS off *this* a11y run (6 collapsed disclosures, **9** scanned controls against a bar of 12; 3 Liquid regions, 3 carrying a transition, 0 infinite). Q7 all 7 checks true, Q8 all 8 true (entries 8→8→8, chars **6019** identical across the round trip), Q9 **7/7**. Four controls fired: `--control q7` → NO, `--control q8` → NO, `--control notesFilter` → NO (7/7 → 6/7), clarity control → Q2/Q3/Q10 NO |
| 6 | Feature parity + reversibility | yes, its own probe | **10/10**: **7/7** rows in liquid AND in standard, round trip A===C **byte-for-byte true** with the notes filter deliberately dirty (`食`), ledger 7 rows / 7 both / 7 with non-empty observed. Three controls each flipped **exactly one** row 7→6 and restored to 7 |
| 7 | Performance under real load | yes, all four legs | **NOT 10** — see below |

**Category 7 fails on leg 1 and the reason is worth more than the point.** Every earlier leg-1 run
was recorded while `l7d-setup.cjs` hid the other windows, so "the largest visible `.fwin`" happened
to be Dictionary; on the real desktop the gesture probe was driving **Video** and the score named
Dictionary. Fixed (`-Title`), re-driven, and drag on Dictionary misses the rubric's 0-frames-over-100 ms
bar in **4 of 8 runs** by a single dropped frame slot (**100.3 ms**). It is **not** Liquid's cost:
standard presentation measures 0/1/2/0 over-100 against liquid's 1/0/0/2, same worst frame. Legs 2, 3
and 4 pass with room — main max **4.2 ms** under the heaviest real action, private **576.7 MB** at
23.8 min *inside* L0's 550–577 band, and the sensitivity control at **51,279.8 ms** proves the
instrument can see a block. Numbers and controls in `L7_PERF_DICTIONARY.md`.

**So the first completed entry is still not written, and for the second time it is a product number
rather than bookkeeping.** 3, 4 and 8 hold 10 from `6b490fc3`'s tree, which is this tree; 1, 2, 5 and
6 now hold 10 measured here; 7 is the only open one.

**Next:** the drag hitch is a shell-level defect on a multi-window desktop, present in both
presentations, so it is `DesktopShell`'s drag path and not `liquid-window.css`. Fix it, re-drive leg 1
with `-Title Dictionary` over at least 4 runs, and the entry is writable in one pass.

### Same turn, later — two product fixes for category 7, and the root cause of what is left

`579c9d73`. The drag hitch was located to the gesture BOUNDARIES with a marked frame recorder
(`predown@25 postdown@25 preup@85 postup@85`, worst frames at 25 and 84), so it was per-gesture
setup/teardown, never the 60 moves. Fixed: `deskDrag.ts` no longer runs `getBoundingClientRect()`
per `pointermove` (cached for the gesture, invalidated on `resize`, 4 new tests), and
`DesktopShell.focus()` no longer rebuilds `wins` when the window is already on top. Frames
delivered ~93 → ~101, over-33 halved, `closedLoop=True` throughout — **but over-100 is still 1–2 in
4 of 6 runs, so category 7 is still not a 10 and is not reported as one.**

Negative result, so it is not re-derived: `os-interacting` is free. Six full toggles of the class
with no drag measured 131 frames, max **16.8 ms**, 0 over 33, despite it dropping `backdrop-filter`
from every `.fwin`.

**The remaining ~100.2 ms frame has a located cause and it is a refactor.** `FloatingWindow` is
`memo()`-wrapped (`DesktopShell.tsx:3191`) and the memo can never hit: the call site (`:2506`)
passes six fresh inline arrows and a fresh `children` tree every render, so the `onPatch` commit at
`pointerup` re-renders every window and every `AppSection` under it — 349 nodes for Dictionary
alone. Stabilising the callbacks is not enough on its own because `children` is also a prop. Next
slice, named rather than half-started.

## 2026-08-25 · primary — the VIDEO window gets its category 6, at 10, and the surface it is actually made of

Gate 461 (`L1`) needs **both** reference surfaces at 80/80, and Video is the one with no entry.
Process **32344**, product tree `89c11473`, the real three-window desktop — `Media` 820×580
`standard` / `Video` 1080×700 **`liquid`** / `Dictionary` 820×580 `liquid`, both media windows on
`Recently added` (36 items, 8 titles / 36 files), `forest-night`, `en`.

**What the Video window's surface IS, settled here so it is not re-litigated.** It hosts the
**Media Center** (`.mc-root`). The parity ledger's six `mediaWorkspace` rows are a DIFFERENT
surface: the Media workspace is a full-screen overlay at `body > div > .seanime-host`, outside
every `.fwin`, with no window chrome, no `Make Liquid` and no `data-presentation`. Their blank
`liquidDestination` now carries that measured reason. They stay `pending` — that is a fact about
that surface and L4's job, not a gap in this score.

| # | Category | State | Presentation it was measured in |
| - | -------- | ----- | ------------------------------- |
| 1 | Accessibility | 10/10 `4a7fa118` — min **5.13:1**, 0 failing of 53 | **liquid**, control fired (0→1, ratio 1.03) |
| 2 | Clunkiness | not measured on Video | — |
| 3 | Liquid utilization | 10/10 `bde1b435` — `liquidTreatedEligible` **4 of 4**, `denseWorkOnTranslucent` **0** | **liquid**, Media/standard as the same-DOM control |
| 4 | Use of space | **10/10 — this turn**, all three sizes in liquid: maximized 1264×765 clipped **0** / overlaps **0** / h-scroll **0** / hiddenOverflowX **0**, dead **7.0%** of viewport, chrome **49.8 → 45.8%** and canvas **64.7 → 68.6%** as the window grows | **liquid**, control fired at maximized (Video 0→1→0, Dictionary unchanged at 0), `restoredExactly: true` |
| 5 | UI clarity | first number only (`e3cb00ca`) | standard |
| 6 | Feature parity + reversibility | **10/10 — this turn** | **both**, in one run |
| 7 | Performance under real load | not measured on Video | — |
| 8 | Honest states | not measured on Video | — |

**Category 6 = 10/10.** Parity **8 of 8 reachable in liquid and 8 of 8 in standard**, read off the
same component in ONE run (two Media Center windows exist, one in each presentation, so no toggle
sits between the two readings). Round trip Liquid → Standard → Liquid, title-anchored and driven
**dirty** (search `big`, Grid view, `Recently added`): **`diffKeys: []`** — rect 92,40 1080×700,
maximized false, focused true, zIndex 153, activeRail, activeShelf, searchValue, sortValue,
viewMode, cardCount 1, chars 686, nodes 242, controls 35 all identical, **byte-for-byte true**.
Three controls fired, each flipping **exactly one** row 8 → 7 → 8. Ledger: 8 of 8
`mediaCenter` rows `both`, each with a non-empty `observed`. Numbers and traps in
`PARITY_LEDGER.md`.

**The point it cost was a real product defect, not an instrument defect** — the third on this
surface in a row, after category 1's muted count and category 3's untreated rail.
`librarySearch` scored `false`: the Media Center's search box wrote to `state.query` and nothing
read it (`89c11473`). That is now three of Video's categories whose lost point was product, where
Dictionary's first four were all instrumentation.

**Next on Video, in order:** categories 2, 5, 7, 8 — 4 closed later in this same turn, above.
**Three of eight now hold a 10 on Video measured in liquid (1, 3, 4) plus category 6 in both**,
i.e. **4 of 8**; 2, 7 and 8 have never been measured on this surface at all and 5 has only its
first number, taken in standard. **Dictionary is still 7 of 8** with category 7 the open one —
its remaining ~100.2 ms frame is the `FloatingWindow` memo/`children` refactor, which `9c4a38e5`
landed and `af7fd609` then measured at the compositor ceiling (0 frames over 100 ms in 6 of 6
runs, worst frame **16.9 ms** = the display's own ceiling). Dictionary's entry is therefore one
re-drive pass away, not one refactor away.

## 2026-08-25 · primary — Video category 5, at 10, and the point it cost was product again

Process **32344**, product tree `9b07971c`, the same three-window desktop — `Media` 820×580
`standard` / `Video` 1080×700 **`liquid`** / `Dictionary` 820×580 `liquid`, `forest-night`, `en`.

| # | Category | State | Presentation it was measured in |
| - | -------- | ----- | ------------------------------- |
| 5 | UI clarity | **10/10 — this turn.** All ten §10.4 questions YES, every one measured at this tree | **liquid**, both themes and both disclosure states |

**Q5 was the literal `'INHERIT'`, and it was pointing at a one-cell number.** Category 1 scored
Video min **5.13:1**, 0 failing of 53 — in ONE cell (forest-night, liquid, disclosures closed).
Q5 does not ask whether contrast passes, it asks whether it is STABLE. Re-driven across
**theme × disclosure-state** the same window scored **NO: 4 failing, min 1.07:1** on
`classic-light`, WITH the light theme remap already in force — `#fff`, `#ececf1`, `#c9ccd6` and
`--success` written straight into text that the surface remap could never reach. Fixed as three
`--mc-*-ink` tokens and a `--success-text`/`--warning-text`/`--danger-text` family, dark palettes
byte-identical. **Q5 = YES: 0 failing of 240 measured across 4 cells**, worst **5.30:1**, theme
delta **0.41**, disclosure axis **+24** rows. Controls: a planted 1.07:1 span → **NO**; the second
theme run as the same theme → **VOID**, not YES. `f2c4a3bd`.

**Q4 was a coin flip on the shelf and is now invariant.** The kind-filter chip row renders only
when a shelf holds ≥2 kinds, so Q4 read 11/YES on `Continue watching` and **14/NO** on
`Recently added`. Behind `details.medialib-kind` it is **11/YES** on the wide shelf, and `scanned`
excludes `SUMMARY` so the count no longer grows with `CHIP_KINDS`. Six live gates on the moved
control, including the closed summary naming the active kind. `be3c9887`.

**Q7 8 9 re-parked at this tree** — Q7 7/7, Q8 8/8 (driven twice: 1 spotlight entry, then 8
cards), Q9 8/8 ledger + 8/8 live. `9b07971c` also repaired the driver's row selector, which
refused *"0 .dict-entry rows"* on the Media Center because a one-title shelf renders a spotlight.

**Three consumer-side false-pass channels closed.** `l1-ui-clarity.js` read `__q9verdict` and
`__q78verdict` once for ALL windows, so a dictionary run scored the Video row; both now resolve
per surface, and Q7/Q8 read `MEASURE` with `measuredOnWindow` when the parked verdict came from
another window. Demonstrated in the same sweep: Video Q7=YES, Media/Dictionary Q7=MEASURE
`crossSurface: true`.

**Video is 5 of 8 in this table** — 1, 3, 4 (liquid), 6 (both), 5 (this turn). **Category 2's
numbers exist and its row does not:** `L1_CLUNKINESS.md`'s 2026-08-25 run reports targets 31,
coverage 30/30, `deadEnds` **0**, `unstable` 0, control fired on both passes. That is a scorecard
row away, not a measurement away — transcribe and re-derive it rather than re-running the sweep.
7 and 8 have never been measured on this surface. **Dictionary is still 7 of 8.**

## 2026-08-25 · primary — Video category 2, at 10, RE-DRIVEN rather than transcribed

The last handoff named this row a transcription: `L1_CLUNKINESS.md` already held a Video
category-2 run (targets 31, coverage 30/30, 0 dead ends). It was taken at `651d0c38`, and three
product commits have touched this surface since — `e61d3179`, `be3c9887`, `f2c4a3bd`. The rubric's
rule decides it: *a score inherited across a change is stale by definition*. Re-driven.

Process **32344**, product tree `62c0e7e4`, the same three-window desktop — `Media` 820×580
`standard` / `Video` 1080×700 **`liquid`** / `Dictionary` 820×580 `liquid`, `forest-night`, `en`.

| # | Category | State | Presentation it was measured in |
| - | -------- | ----- | ------------------------------- |
| 2 | Clunkiness | **10/10 — this turn.** coverage **41/41**, `deadEnds` **0**, `gone` 0, `unstable` 0, `unconfirmed` 0, 38 with a measured effect, 3 `alreadyActive`, `resolvedBy.class` **0**, `worstSettleTries` 2, `savedStoreUntouched` true | **liquid**, `Recently added` (36 files / 8 titles / 3 kinds), 5 disclosures open, drawer open |

**Control: FIRED, on both passes** — the injected handler-less `Probe control` read `changed:false`
and `secondPassChanged:false`. The second number is the guard on the confirmation pass itself: a
pass that could rescue the bait would be the broken thing.

**Every point this category cost was instrument, not product — five channels, all measured on this
tree, all detailed in `L1_CLUNKINESS.md`.** A closed `<details>` reports a real box for 9 of 32
controls; a standalone card PLAYS where a series card opens a drawer; the rail outranked the toolbar
it replaces and faked 5 `gone`; a re-anchored `[role="menu"]` faked 7 `unconfirmed`; and an
unfocused window throttles `setTimeout` to ~1 Hz, which turns a settle timeout into `unstable`.
A sixth voided a whole run outright: deleting `window.__liqDead` does not stop the async loop, so
two sweeps drove the same surface at once and the second one's bait correctly reported `changed:true`.

**Video is 6 of 8 in this table** — 1, 3, 4 (liquid), 5 (this tree), 6 (both), 2 (this turn).
**7 and 8 have never been measured on this surface.** Category 7 needs a restart before anything
main-process is read. **Dictionary is still 7 of 8**, category 7 the open one.

## 2026-08-25 · primary — Video category 7 measured for the first time, and it is NOT a 10

Main pid **30480**, a **real restart** (forge stopped, `npm start`, bridge up 75 s later), product
tree `973436c7`. Same three-window desktop; the Video window driven to Library / `Recently added`
first — **8 cards, 49 controls, 355 nodes, 1,234 chars**, because the media windows restore at 18
chars and an empty harness caps this category at 0. Numbers and controls in `L7_PERF_VIDEO.md`.

| # | Category | Re-driven | Result |
| - | -------- | --------- | ------ |
| 7 | Performance under real load | yes — legs 1, 2, 4; leg 3 in progress | **NOT 10** — leg 2 fails |

**Leg 1 passes with room.** Drag 9 runs and resize 3 runs on `-Title Video`: **0 frames over 33 ms
and 0 over 100 ms in every run**, worst frame **17.6 ms** against this display's measured ceiling of
**17.1 ms**. Jank control **FIRED**: p95 16.9 → **116.9**, frames over 100 **0 → 12**.

**Leg 2 fails on a product number, reproduced three times.** `/health` sampled every 120 ms through
an 18-control burst of the Media Center's own path: p50 **1–2 ms**, p95 **3 ms**, and a MAX of
**3,117 / 1,910 / 2,076 ms** against a 500 ms bar. Attributed on the runs that could:
**`Review` 1,020–1,150 ms and `Study Mode` 1,910–2,076 ms** — two of this surface's own sidebar
destinations, blocking main for one to three seconds. The sensitivity control is honest about its
own weakness: 600 `dict:lookup` calls moved p95 **3 → 36 ms**, a 12× move that never reached the
bar; the product's own 3,117 ms block is the stronger proof the instrument can see one.

**Leg 4 is clean and worth recording as a negative result.** One burst costs main **+97.5 / +185.3 /
+152.4 MB** private, and three minutes later, quiet, main reads **450.9 MB / 1,123 handles** — it
comes back unprompted. This is not the 604 → 7,082 MB shape the Dictionary surface once had.

**Video is 6 of 8, unchanged by this turn** — 1, 3, 4 (liquid), 5, 6 (both), 2. Category 7 is now
measured and **failing** rather than unmeasured, which is the more useful state: it names two
controls to fix. **Category 8 has still never been measured on this surface** and is the only
unmeasured one left. Dictionary remains 7 of 8.

---

## 2026-08-25 · primary — Video category 7 **CLOSES at 10/10**, on a product fix

`6620ab71` + this entry. Real restart, main pid **1324** (the previous boot 30480 was stopped
and `npm start`ed fresh); Media 820×580 `standard` / `Video` 1080×700 **`liquid`** / `Dictionary`
820×580 `liquid`, `forest-night`, `en`. Video driven to Library / `Recently added` first — **8
cards, 49 controls, 350 nodes, 1,234 chars**, because an empty harness caps this category at 0.
Full numbers and the instruments: `L7_PERF_VIDEO.md`.

**Leg 2's block was `mining:listFrequencyDicts`, and it is fixed, not excused.** Driving one
`window.api` call at a time (`l7v-attribute.cjs`) separated it from four innocent neighbours:
**1,270 ms** vs 3 ms each, idle p50 1 ms, and a same-shaped no-op control at MAX 3 ms across the
board. The listing answered with six summary fields while reading every rank table in full three
times per call — 20.10 MB and 550,408 ranks for the JPDB list, 68 ms read + 269 ms parse — because
`ensureAllFrequencyDictionariesReady` invalidated the cache unconditionally right before the
listing ran. After the fix: **3 ms**, cold cache, same four dictionaries and the same
`entryCount`/`enabled` values.

| leg | result on pid 1324 | control |
| --- | --- | --- |
| 1 gestures | drag **0/0** over 33/100 ×5; resize 1,0,2 over 33 and **0** over 100 ×3; theme 1 over 33, **0** over 100 ×2 — every count at or below L0's own 4–5 / 8 / 2 | jank FIRED: p95 16.8 → **116.9**, over 100 **0 → 12** |
| 2 main block | MAX **3 / 50 / 53 ms** over three 18-control bursts, **none over 500** (was 3,117 / 1,910 / 2,076) | FIRED: 3,000 distinct lookups → **1,127 ms**, 12,000 → **9,030 ms**, idle MAX 12 ms |
| 3 memory | measured on BOTH boots and they agree to 1.5 MB. Post-fix pid 1324: **445.6 / 445.9 / 447.4 MB**, **+1.8 MB and +1 handle** across 8/16/24 min. Pre-fix pid 30480: 448.1 / 447.1 / 447.1 MB, +4 handles. Both 102–105 MB *below* L0's 550–577 band | the RSS column (264.9 → 64.4 → 53.7) is the Windows trim this sampler exists to disclose |
| 4 burst cost | **+3.4 / +0.3 / +14.1 MB** private (was +97.5 / +185.3 / +152.4) | — |

**The one open number from the previous entry is closed, and it was never a regression.** Theme
*restore* reads 50.1 ms against L0's 23.6. Content is exonerated — at **0 cards / 311 nodes** it
reads **49.4 / 50.0 ms**, indistinguishable from the loaded surface, six readings spanning
49.4–50.7 ms. And L0's raw milliseconds are not comparable: **L0's display ceiling was 10.0–10.3
ms/frame, this session's is 16.4–17.0**, and the probe measures two frames painted. 23.6 ms =
2.35 L0 frames; 50.1 ms = 3.00 frames here. **Never compare a painted-frame figure across
displays without dividing by the ceiling first** — it is the same trap that would have read L0's
drag p50 10.0 → 16.8 as a 68% regression.

**Video is 7 of 8** — 1, 3, 4 (liquid), 5, 6 (both), 2, and now 7. **Category 8 is the only one
never measured on this surface**, and it needs a new instrument: the L8 probes are all
Dictionary-shaped (`.dict-empty` / `.dict-loading` / `.anki-setup`). Dictionary remains 7 of 8.

## 2026-08-25 · primary — Video **category 8 CLOSES at 10/10**, so the surface is 8 of 8 — commit `e801c683`

The last unmeasured category on this surface, and the one that needed three new instruments because
every L8 probe was Dictionary-shaped. All three now exist and all three carry a firing control.
Detail and raw numbers: `L8_DEAD_CONTROLS.md` and `L8_STATES.md`; baselines under `baselines/l8-*`.

| measure | number | its control |
| --- | --- | --- |
| dead controls (`4f102a04`) | 42 painted, 13 excluded by name, **29 probed, 0 DEAD / 0 GONE / 0 unrestored** | planted handler-less button **DEAD at 0 mutations**; planted marker button **ALIVE at 1**, self-restoring |
| fabricated values (`6a077498`) | `statusWordCandidates` **0** in both measures — 9 comparable slots / 1 invariant across shelves, 11 repeated / 3 constant within a pass | two plants in two runs: invariant 1→**2** and candidates 0→**1**; constants 3→**6** and candidates 0→**3** |
| honest states (`e801c683`) | empty / loading / error / offline × **4 languages**, **0 raw keys** and **falseSuccess false** in every one, 8 cards restored per pass | induction from OUTSIDE the app — TCP 8765 **REFUSED**, control 5173 **LISTENING**; translation control **5 of 5 slots differ from en** in ja/zh-Hans/ru |

**The category cost a product fix, which is why it is a 10 and not a report.** The four-language
sweep caught the interpolated Anki reason rendering English inside a translated sentence in all three
non-English languages — structural, since main authors the constant and main has no locale. Fixed
with `translateAnkiReason()` and four new catalog entries, and **re-measured after the fix in the
fix's own commit**. Note for whoever scores category 8 elsewhere: neither a raw-key sweep nor a
key-count check can see this defect. Only asserting that the string **changes between languages**
does, so that assertion is now part of the instrument.

**Three probe defects were fixed before any number was trusted**, each of which yields a false pass
or a false finding: `namesDependency` matched the whole window body (true on this surface no matter
what renders — it would have scored 10/10 against a panel printing nothing); the Discover measure
matched English prose, so ja/zh/ru falsely read `malUnreachable false`; and `.sp-seg-btn` is a
generic class that resolved to the Media SUBTITLE language pair when Settings sat off Appearance.

**Video is 8 of 8.** Dictionary remains 7 of 8 — its category 7 is the outstanding one, and it must
be re-driven on this boot rather than transcribed, since L0's millisecond figures are not comparable
across displays (10.0–10.3 ms/frame there, 16.4–17.0 here).

## 2026-08-25 · primary — Dictionary leg 3 closes, leg 2 re-opens; the surface stays 7 of 8 and gate 461 stays open

Main pid **1324**, product tree `0aeacd4b`, the real four-window desktop after
`l7d-restore.cjs` — `Media` standard / `Video` **liquid** / `Dictionary` 820×580 **liquid** /
`Settings` standard, 食べる → 8 entries, `forest-night`, `en`. Numbers and both attributions:
`L7_PERF_DICTIONARY.md`, this turn.

| # | Category | Re-driven | Result |
| - | -------- | --------- | ------ |
| 7 | Performance under real load | leg 3 yes, end to end; leg 2 yes | **NOT 10 — leg 2** |

**Leg 3 PASSES and does not need re-driving.** +1.6 MB private and −4 handles across marks
125/133/141 min (584.9 → 585.1 → 586.5 MB, 1,126 → 1,127 → 1,122 handles) on the loaded window.
Scored as the delta; the absolute is +9.5 MB (+1.6%) over L0's band and stated rather than
band-matched, since L0 measures a cold 8-minute boot. Control on the instrument: **main RSS
525.1 → 67.5 → 57.9 MB over the same three marks**, a 467 MB divergence from private on one process,
which is what makes the counter choice a measurement.

**Leg 2 fails on one sample, and the honest verdict is that this boot cannot settle it.** The boot's
first `Find example sentences` blocked main **1,034.2 ms** against a 500 ms bar with its work proven
(nodes 349→415, 3,002 ms renderer). Both candidates were driven and both are exonerated: window
re-mount alone **5.0 ms**, and `dictExamples` on four never-queried words **48 / 21 / 164 / 47 ms**
with main max **99.2 ms**. So it is once-per-boot, not per-word — and it only exists in the first
seconds of a boot's use of the feature, which this boot has spent.

**Why it is not scored either way.** Reproducing it needs a restart; a restart makes leg 3's
16-minute curve stale by this file's own rule. One over-bar observation with no second is not a
10 and is not a finding either, and writing it as either would be the false pass this file refuses.

**Dictionary is 7 of 8**, category 7 the open one — unchanged in count, but the open leg has moved
from 3 to 2 and 3 is now closed with a number. **Video is 8 of 8.** Gate 461 (plan line 461: the L1
studies score 80/80 against *both* Video and Dictionary) therefore stays **OPEN**, on Dictionary.

**Product this turn: `0aeacd4b`**, and it is a category-8 prerequisite rather than a category-7 one.
`AnkiSetup.tsx` rendered main's English `status?.error` verbatim in every language — and that panel
is precisely what `l8-honest-states.cjs` measures as this surface's **offline** state. Scoring
category 8 on Dictionary before the fix would have scored an untranslated render as an honest one.
Same defect `e801c683` fixed on the Media Center, on the surface gate 461 still needs; found by
reading the consumers of the two constants rather than by re-running a sweep.

**Order for the next boot, and it is forced rather than preferred:** leg 2 FIRST (its number exists
only in a boot's first seconds), per-IPC timing installed before the first click, then start the
leg-3 sampler on that same boot. Doing it the other way round is what cost this turn its 10.

## 2026-08-25 (later) · primary — leg 2 reproduced on a real restart; Dictionary stays 7 of 8 and the earlier exoneration is withdrawn

Main pid **36020**, a real restart, product tree `855789ca`. Dictionary **liquid** 820×580 driven to
**8 entries / 5,476 chars / 349 nodes** before anything queried examples. Numbers, both controls and
the harness defect: `L7_PERF_DICTIONARY.md`, this turn.

| # | Category | Re-driven | Result |
| - | -------- | --------- | ------ |
| 7 | Performance under real load | leg 2 yes, on the boot's first call | **NOT 10 — leg 2**, 6,590.8 ms against a 500 ms bar |

**The open leg is unchanged in name and changed in kind.** Leg 2 was carrying one over-bar sample
the last boot could not settle; it is now reproduced at **13× the bar**, with a second word (痛い,
never queried) also over it at 641.6 ms, and a control that fires — the identical five words re-run
on the same boot cost 20–39 ms, 食べる collapsing **186×** with the same 8-row result.

**Two claims from the previous entry are withdrawn, both measured wrong rather than reasoned wrong.**
"Once per boot, not per word" came from four words timed *after* the boot's first call, i.e. on the
warm path — this turn reproduces those exact numbers as pass 2. And `findExampleSentences` is not the
"uncapped-index scan" the hypothesis named: it is capped at 400 rows and says so. The cap bounds the
result, not the scan.

**Category 7's lost point is a product number for the second time on this surface**, and it now has
a mechanism and a reproduction rather than a single unexplained sample. Not scored as a 10, not
scored as a 9 — the rubric has no such thing.

Running state, unchanged except the detail behind 7:

| # | Category | State |
| - | -------- | ----- |
| 1 | Accessibility | 10/10 |
| 2 | Clunkiness | 10/10 |
| 3 | Liquid utilization | 10/10 |
| 4 | Use of space | 10/10 |
| 5 | UI clarity | 10/10 |
| 6 | Feature parity + reversibility | 10/10 |
| 7 | Performance under real load | **NOT 10 — leg 2 reproduced**; leg 3 must be re-driven anyway, `855789ca` changed main |
| 8 | Honest states | 10/10 |

**Video is 8 of 8. Dictionary is 7 of 8. Gate 461 stays OPEN on Dictionary**, and the next slice is
the product fix rather than another measurement — the surface has now been measured twice and the
second measurement only made the number worse.

## 2026-08-25 (later 3) · primary — Dictionary reaches 8 of 8 and **GATE 461 CLOSES**

Main pid **39160**, one fresh `npm start` at `6eefff6c`, everything below from that single boot —
required, because `855789ca` and `9a2bceb7` both changed main-process code and main does not
hot-reload. Dictionary **liquid** 820×580, **8 entries / 5,476 chars / 349 nodes / 75 controls**
before any timing. Numbers: `L7_PERF_DICTIONARY.md`, this turn's last three sections.

| # | Category | State |
| - | -------- | ----- |
| 1 | Accessibility | 10/10 |
| 2 | Clunkiness | 10/10 |
| 3 | Liquid utilization | 10/10 |
| 4 | Use of space | 10/10 |
| 5 | UI clarity | 10/10 |
| 6 | Feature parity + reversibility | 10/10 |
| 7 | Performance under real load | **10/10 — all three legs re-driven on one boot** |
| 8 | Honest states | 10/10 |

**Category 7 was a product defect, and it was fixed rather than re-measured.** `9a2bceb7`: the
example scan's 400-row cap bounds the RESULT, not the visit — at real Japanese match density
collecting 400 matches costs **40.9%–99.8% (mean 70.4%)** of a 234,982-row / 5,473-page table, so
the boot's first lookup was a **6,590.8 ms** synchronous block on the main event loop. The scan now
walks in 3,000-row rowid windows with the event loop yielded between them.

**The A/B is the evidence, not the after-number.** Same protocol, same surface state, 300 `/health`
samples each: chunked **30.9 ms** (**40.8** on a second boot) against `chunk=10,000,000` — which
restores the shipped statement exactly — at **963.2 ms**. 31×, control over the 500 ms bar, fix 16×
under it. Total wall time is unchanged within 9%: chunking does not make the lookup faster, it makes
it not own the main thread, and that is what this category measures.

**A new instrument was needed and is committed: `tools/evict-file-cache.ps1`.** Leg 2 only exists on
a cold `examples` table, the Windows standby list survives an app restart, and *any* diagnostic that
reads the table destroys the condition the next run needs. Without the flood the second run measures
the warm path and reads as a clean pass. Every cold number above is behind one, with the standby
figure recorded.

**Two things scored honestly downward and kept, so a later drift is measurable:** this boot drops
**one vsync per drag** (33.4–33.6 ms, 0 over 100) where the boot that closed leg 1 dropped none, and
leg 3 gains **+3.1 MB across its eight quiet minutes** against +0.8 previously, landing at 577.5 MB
— 0.5 MB (+0.09%) above L0's 550–577 band on a boot that did four cache floods, six gesture runs and
a full vitest run.

**Video is 8 of 8. Dictionary is 8 of 8. GATE 461 CLOSES** — plan line 461, the L1 studies scoring
80/80 against *both* reference surfaces, is satisfied for the first time.

**What is NOT claimed, and it is the next slice.** `findLexiconCompounds` / `findLexiconCollocations`
share a statement whose plan ends `USE TEMP B-TREE FOR ORDER BY`, so their scan cap provably cannot
fire either — **10,904.4 ms cold outside the app to return 11 rows**. Driven live on this boot it
was **304.2 ms**, *under* the bar, which is why category 7 scores 10 and why this is recorded as the
next fix rather than as a failure. The smaller number is the one quoted.

## 2026-08-28 — Game Arena — 80/80 — commit `b6e55253`

State driven: all **15** games selected **60** times without starting a round; layout scored with
**12** schema-valid recent-round records and the key removed back to `null`; never-played state is
banked separately. Standard and Liquid both driven at 980×589, with compact and maximized layout.
Restart before main-process measurement: yes — the unchanged main had a real live boot at PID
**40648**; category 7 verified that same PID before/after every closed-loop run. No main code changed.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 1 | Accessibility | 10/10 | 55 text owners; min 4.72:1; 22/22 reachable; min app target 32 px | contrast/reachability/pointer/target/motion all moved and restored |
| 2 | Clunkiness | 10/10 | 1 click, 0 keys in both presentations; 0 traps | dead end/modal/scroll trap 0→1→0 |
| 3 | Liquid utilization | 10/10 | 6/6 eligible and 6/6 shared; dense translucent Work 0 | one-region and all-glass controls failed then restored |
| 4 | Use of space | 10/10 | dead 6.9/0.8/11.1%; all four defect counts zero at three sizes | injected clip 0→1→0 |
| 5 | UI clarity | 10/10 | 10/10 answers on six light palettes; contrast minima 4.70–6.23:1 | Q2/Q3/Q5/Q10 failed and residue returned to 0 |
| 6 | Feature parity + reversibility | 10/10 | 10/10 rows in Standard and Liquid; zero round-trip diffs | each of 10 mutations dropped only its own row |
| 7 | Performance under real load | 10/10 | 60 cycles; heavy p50/p95/max 2.1/3.4/9.0 ms | injected jank produced 11 frames >100 ms, p95 100.4 ms |
| 8 | Honest states | 10/10 | 1/1 named state; 0 defects; 4 language hashes | three defects 0→1→0 |

Lowest category: tied at 10/10. The last product failure was category 1's **26.5 px** disclosure
button; fixed to 32 px in `b6e55253`. Instruments: shared `css-measure`, `jp-bridge`, parity,
performance, and honest-state harnesses. Receipts are the `cat*-l7-games*.json` baselines.
## 2026-08-30 · codexB — Settings category 1 closes at 10/10

Reused `cat1-accessibility.cjs` unchanged against the real `Settings` floating window at
960×680, `forest-night`, standard presentation. The first measured run was 4/5 bars: the
Ask Agent button's effective target was 52.5×26 px. The product correction uses the shared
medium Button geometry instead of the compact variant; the re-run measured 64 text records,
46 keyboard controls, 45 pointer targets, minimum contrast 5.47:1, 0 unreachable controls,
0 targets below the 32 px pointer floor, and 0 motion durations above 0.01 s under reduced
motion. Category result: **PASS 10/10**.

Negative control moved contrast/target-rect/WCAG-2.5.8/keyboard/pointer counts from
`0/5/0/0/0` to `1/7/2/1/2`, then restored all scored counts. Disclosures, scroll positions,
deferred styles, reduced-motion emulation, and the surface state restored. Evidence:
`baselines/cat1-l8-settings.json`; checkpoint commit: this entry's product commit.

## 2026-08-30 · codexB — Settings category 2 closes at 10/10

Reused `cat2-clunkiness.cjs` unchanged for the dominant Home → Appearance navigation and
its Home reverse path, in the same 960×680 window across Standard and Liquid. The first run
failed only latency: Standard 1136.7 ms and Liquid 320.7 ms to the first renderer paint, while
the inert control was 1.9 ms. Appearance mounted its isolated preview and full theme grid before
the destination could paint. The bounded repair defers only that heavy body until the following
frame; the header and selected navigation state paint immediately, without deleting controls.

The re-run measured one click in each presentation, Standard 97.1 ms and Liquid 31.6 ms,
0 dead ends, 0 modal traps, 0 scroll traps, and an exact Home and presentation/geometry reverse
transition. Negative control moved dead-end/modal/scroll counts `0/0/0 → 1/1/1 → 0/0/0`;
its inert click was 0.4 ms. Category result: **PASS 10/10**. Evidence:
`baselines/cat2-l8-settings.json`; checkpoint commit: this entry's product commit.

## 2026-08-30 · primary — Settings category 3 closes at 10/10

codexB left `baselines/cat3-l8-settings.json` measured and unfixed (FAIL: `contextualTreated`,
`sharedPrimitives`; 2 eligible, 0 treated, 0 shared) when its usage ran out. Re-derived and
finished here. Reused `cat3-liquid-utilization.cjs` unchanged, `--presentation liquid`.

The migration is `SettingsNav.tsx` + both `header.os-set-page-head` hosts (`SettingsApp.tsx`
renders it for 22 pages, `SettingsHome.tsx` for Home — migrating one and not the other passes
on Home only). The rail declares the role at nav, all 4 groups and all 4 lists, because a
`ul.os-set-nav-list` of 8 buttons reads as dense work the moment the rail paints and
`div.os-set-nav-group` inherits that the instant the list stops. Geometry exceptions in
`liquid-window.css` keep the rail a flush column and the head a flush strip.

TRAP, and it cost the round trip: `liquid-surfaces.css` gives every primitive `min-height: 0`
UNCONDITIONALLY. Inside the rail's scrolling flex column that collapsed the four groups
129/164/129/304 → 61/77/61/143 px with overlapping buttons, in BOTH presentations. Category 1
caught it — 45 controls but only 36 measurable, 9 occluded, 1 hit area stolen (4.5 px),
`targets32` FAIL. The compensation is in `styles.css`, not `liquid-window.css`, because
`liquidWindowPresentation.test.ts:250` requires every selector in that sheet to name
`.fwin-liquid`. Staged as a HEAD+edit blob; `styles.css` carries another track's hunks.

Numbers after the fix, 960×680, `forest-night`, viewport 1264×821, 39 regions:
`denseWorkOnTranslucent` **0** of 2 Work, `liquidTreatedEligible` **10 of 10**,
`sharedPrimitiveEligible` **10 of 10**. Control A one region → glass moved 0→1; control B
all-glass moved 0→2 = every Work region; both restored to `[0,10,10,10,2]` with the inline
style and the injected sheet gone — **CONTROL FAILED AS REQUIRED**.

Category 1 re-run in BOTH presentations at this tree, not inherited: Liquid 45/45 measured,
0 below the hit floor, 0 stolen, 0 occluded, min contrast 5.46:1; Standard 64 text records,
5.47:1, 45/45, 0 unreachable — both **PASS 10/10**, control moved all five counts and
restored. Window returned to Standard, the presentation it was found in.

Regression: `settingsLiquidRegions.test.tsx`, 5 tests, pins both traps. Evidence:
`baselines/cat3-l8-settings.json`, `baselines/cat1-l8-settings.json`,
`baselines/cat1-l8-settings-liquid.json`.

## 2026-08-30 · primary — Settings category 4 is PARKED at 2 of 4 bars, not closed

`cat4-use-of-space.cjs` reused unchanged, `--control`, three sizes. First run FAILED four
bars. Two are fixed and re-measured here; two remain and are the next turn's opening slice.

FIXED — overlaps, 2 pairs at 960×680 and the whole `179x88` footer over a nav group at
maximized. The footer stayed visible by being `position: sticky` over the scrolled rail, and
its 92%-opaque fill plus blur existed to hide that. It now sits OUTSIDE a new
`.os-set-nav-scroll`, the same structure `.scr-rail-scroll` uses. Structure, not paint,
removes a collision. Measured after: **0 overlaps at all three sizes**.

FIXED — dead region. `.os-settings` sets `align-items: flex-start`, correct for the v1 ROW
layout and wrong for v2, which flips to column and turns it into "shrink every child to its
content width". Maximized to 1264×765 the root grew to 1226 px and `.os-set-body` stayed
**685 px** — Settings never used more than 685 px of any window. `deadPctViewport` against
the 15% ceiling: default **16.4 → 4.8**, maximized **39.9 → 7.0**, compact 0.6 unchanged.

OPEN — `clipped` and `horizontal`, and ONLY at the harness's 260×170 compact leg. The rail is
a fixed 204 px against an 18 px gap, so at 260 the pane measures `184>0`: `.os-set-pane-v2`
has zero client width and the Home status chips clip. 108 clipped before the two fixes, **71**
now. The fix is a narrow-width reflow — collapse the rail to icons under a container query and
let `.os-set-home-status` / `.os-set-quick-grid` fall to one column via `minmax(min(N, 100%),
1fr)`. Not started; it must keep the accessible names (`.os-set-nav-item > span` is the name,
so visually-hidden, never `display: none`) or it trades category 4 for category 1.

Control: injected clip moved `clipped 0 → 1 → 0` with removal proven; the sub-minimum
200×140 shrink restored exactly; no proven pager exists on this surface so that leg reports
`applicable: false` rather than a number. Every size restored its geometry.

Categories 1 and 3 re-measured at this tree after the layout changes, not inherited:
cat1 Standard **PASS 10/10** (64 text records, 5.47:1, 45/45 hit, 0 below floor, 0 stolen,
0 occluded, 0 unreachable, control restored); cat3 Liquid **PASS 10/10** (now 11 of 11
eligible treated and shared, `denseWorkOnTranslucent` 0 of 2 Work, control 0→1→2→0,
CONTROL FAILED AS REQUIRED). Settings stands at **1, 2, 3 closed; 4 parked; 5–8 unmeasured**.
Evidence: `baselines/cat4-l8-settings.json`.

## 2026-08-30 · primary — Settings category 4 CLOSES at a controlled 10/10

The parked bars were `clipped` and `horizontal`, and only at the 260×170 compact leg. Cause,
re-measured before editing: `.os-set-nav-v2` is a fixed 204 px against an 18 px gap, so
`.os-set-pane-v2` was handed a **0 px** client width against 184 px of content
(`hiddenOverflowX 184>0`) and **71** descendants read clipped.

Fix — one container query, `.os-set-body` at `max-width: 420px`, rail 204 → 52 px of icons.
`.os-set-home-status` and `.os-set-quick-grid` get `minmax(min(N, 100%), 1fr)`: a fixed
`minmax(170px, 1fr)` track cannot fall below 170 px, so six clipped rects were status chips
overflowing a pane narrower than one track no matter how much room the rail gave back.

TRAP, and it is the whole reason this is not the Scraper's implementation: `.scr-rail-label`
uses `display: none`, and `.os-set-nav-item` carries **no `aria-label`** — its bare `<span>`
IS the button's accessible name (`SettingsNav.tsx:48,77`). Copying the Scraper here trades
category 4 for category 1. The span is clipped to 1×1 instead; the name stays in the
accessibility tree, and category 4's own reader drops any rect under 2 px so it is not
counted as clipped either. Home gained the `title` the other 19 already had.

Category 4 after, `cat4-use-of-space.cjs --control`, three sizes, harness unchanged:
960×680 **0/0/0/0**, 260×170 **0/0/0/0** (from 71/0/0/2), 1264×765 **0/0/0/0**;
dead region 4.8 / 0.7 / 7.0 % against the 15 % ceiling; chrome 26.1 → 22.0 while the dominant
canvas rises 94.7 → 95.3. Control: injected clip **0 → 1 → 0**, removal proven; the
sub-minimum 200×140 shrink now reports `clipped 0` where it reported 75. Every leg restored.
**PASS 10/10.**

The accessible-name claim is falsified separately because no rubric harness ever resizes:
`probes/l8-rail-names.cjs` reads each button's name the way an AT computes it, at the same
260×170. Rail **204 → 52**, pane client width **690 → 132**, named **20 of 20**, `title` 20 of
20. Negative control forces `display: none` on the same spans → named **0 of 20**, then back
to 20; the `.fwin` inline style restored byte-identically. **CONTROL FAILED AS REQUIRED.**

Carry 19 applied — the two cells already banked on this surface were re-run at this tree, not
inherited, because `container-type` changes layout at every size: cat1 Standard **PASS 10/10**
(control [0,5,0,0,0] → [1,7,2,1,2] → restored) and cat3 Liquid **PASS 10/10**
(`denseWorkOnTranslucent` 0 of 2, 11/11 treated, 11/11 shared, control 0→11→11→11→2 → restored).
Both baselines regenerated byte-identical to the previous run, which is itself the evidence
that nothing moved. Window left in Standard, the presentation it was found in.

Regression: `settingsLiquidRegions.test.tsx` **9/9**, two new cases pinning the container and
the never-`display: none` rule; mutation control flipped `clip-path: inset(50%)` to
`display: none` in `styles.css` and the guard failed on exactly that assertion, then the file
was restored byte-identically to the staged blob.

Settings stands at **1, 3, 4 closed; 2 banked from before this tree; 5–8 unmeasured** — 40/80.
Evidence: `baselines/cat4-l8-settings.json`, `baselines/l8-settings-rail-names.json`.

## 2026-08-30 · primary — Settings categories 5, 6 and 7 close; category 8 scored to an honest FAIL

Three RUNs and three surface SPECS, no new probe file. Categories 6 and 7 had no `settings`
entry, which is the parameterisation RULE 1 asks for — `l6-parity.js` gains a 7-feature spec
and `cat7-perf.cjs` a heavy-load spec, both data in an existing harness.

**Category 6 — PASS 10/10.** Parity **7/7 in Standard and 7/7 in Liquid**, `equal: true`,
`na: 0`. Round trip standard → liquid → standard with `os-set-search-input` dirtied first:
**0 diffs**, fields and shell both held. Control: all **7 of 7** mutations fell **exactly their
own row** with no unexpected row, and 7/7 returned after each restore. The rows are
`categoryRail`, `groupedNavigation`, `settingsSearch`, `advancedDisclosure`, `pageRegion`,
`homeOverview`, `windowLifecycle`. `categoryRail` counts the `<span>` name AND the `title`
because since this morning the narrow tier clips the span — a rail item that loses both is
unreachable at 260 px and the old one-count row would not have seen it.

**Category 5 — PASS 10/10** (Q1–Q10 all YES). Q4 `collapsedDisclosures` 1 / `scannedControls`
**3** against a bar of 12; Q5 forest-night min **5.48**, classic-light min **5.81**, 64 runs
each, 0 failing, the two minima differ so the theme axis moved. Control run separately at the
same state: **CONTROL FAILED AS REQUIRED on Q2, Q3, Q4, Q5, Q10**, residue 0.

CARRY 22 AGAIN, and this one cost a run. The first category-5 pass scored **9/10** on Q4 with
`collapsedDisclosures: 0`. Cause: `SettingsSearch` opens its panel `onFocus` and closes it on a
140 ms `onBlur` timer, and the category-6 drive had typed into the box. React's onBlur is
`focusout`, so nothing closed it — the panel sat open with an EMPTY query, and Q4 counts
`[aria-expanded="false"]` as this surface's one collapsed disclosure. A real 10 read as a 9 on
drive residue. The settings spec now ends its drive with a `closeSearch` (Escape is
synchronous) and its `undo` closes the panel too.

**Category 7 — PASS 10/10.** Heavy load is **19 pages × 2 = 38 navigations, restored to Home**
— navigation, not scrolling, because Settings has no collection (`scrollAll` would have picked
the 204 px rail). Ceiling p50 **16.7**; drag/resize/theme frame max 33.3/33.6/33.5 with
**0 frames over 100** each; heavy main max **44.5 ms** against the 500 ms bar. `--jank`
sensitivity control: drag p95 **16.9 → 116.9**, max **33.3 → 117.1**, so the recorder does see
the frames it reports.

**Category 8 — FAIL, one bar, named.** `rawKeys` **0**, `placeholders` **0**, four-language
sweep 257 runs per language, 4 distinct hashes, `diffRuns` 156 of 257 = **diffShare 0.607**,
language restored to `en`. `mutePairs` **8** — eight disabled controls that never say why.
`statesNamed` is **UNMEASURED**: 0 of empty/loading/error/offline are observable on this page.
Scored on **Appearance**, not Home, and that is recorded rather than smoothed: the four-language
leg needs `[data-setting-id="ui-language"]` on screen, which only Appearance renders. Settings
is one app, Appearance is a real state of it, and it is the denser page.

Settings stands at **1, 3, 4, 5, 6, 7 closed; 2 banked before this tree; 8 open** — 70/80.
Evidence: `baselines/cat5-l8-settings.json`, `cat5-l8-settings-control.json`,
`cat6-l8-settings.json`, `cat7-settings-perf.json`, `cat8-l8-settings.json`.

## 2026-08-30 · primary — Settings CLOSES at 80/80: category 8 repaired, category 2 re-earned

**Category 8 — FAIL → PASS 10/10, and the fix is product code.** `mutePairs` **8 → 0**. Every
disabled control on Appearance and Theme Studio now derives its reason from the first failing
clause and spends it as both `disabled` and `title`, so the two cannot drift: Reset/Apply
(`!touched`), Preview, Apply-plan, Create, Undo, Delete, the custom-CSS toggle, Save-CSS and
Import — 10 sites, 8 of them painted and counted. `firstReason` moved out of
`scraper/disabledReason.ts` into `shared/disabledReason.ts` (pure, no strings) and the Scraper
module re-exports it, so there is one implementation and every Scraper import is unchanged.
9 new keys in EN/JA/ZH/RU; `i18n-check` **11,769** exit 0.

Other cat8 numbers: `rawKeys` **0**, `placeholders` **0**, 257 painted runs, four languages
with **4 distinct hashes** and `diffShare` **0.611**, language restored to `en`. `statesNamed`
**1 of 1 observable** — the empty state is DRIVEN (`--drive-input .os-set-search-input
--drive-value zzzqqqxyzzy`) and renders "No matching settings"; loading/error/offline are
`notObservable` on this surface and correctly excluded from the denominator. Control:
rawKeys/placeholders/mutePairs **0/0/0 → 1/1/1 → 0/0/0**, returned.

HARNESS CORRECTION 21, and it VOIDed a clean run before it landed: **restoring an input's value
is not restoring the surface.** `SettingsSearch` opens its listbox on input and closes it on
blur; this driver writes `.value` and dispatches `input`, so it never blurs. The panel stayed
open with an empty query — 258 painted runs against a 257-run baseline, `restored: false`, and
the real "No matching settings" measurement was discarded with it. Escape is now sent ONLY when
the surface has not already come back, and the second reading is reported as
`restoredAfterEscape` rather than folded into `restored`, so every baseline taken before this
correction is bit-identical and a reader can see when Escape is what fixed it.

Also measured, and it is why the title form was abandoned mid-run: `--surface "Settings"` cannot
survive its own four-language leg, because the window title localizes. Scored on
`@.fwin:has(.os-settings-v2)`.

**Category 2 — PASS 10/10, re-run at this tree per Carry 19, not inherited.** Task is the
dominant one, search → open a result: `deadEnds` **0**, `modalTraps` **0**, `scrollTraps` **0**,
worst renderer-side latency **35.6 ms** over 7 measured inputs with **0 over the 100 ms bar**.
`costParity` measured with `--both-presentations` on the same window and geometry: Standard
**7** inputs, Liquid **7**, dead ends 0 in both, worst 35.6 vs 31.9 ms, presentation restored
to `standard` at an identical `960x680`. Control moved all three counts 0→1→0 and returned;
the inert-click floor read **0.4 ms**.

**Settings is 80/80 — 1, 2, 3, 4, 5, 6, 7, 8 all closed and all measured at this tree.**
Surface left as found: Home, Standard presentation, search collapsed, `960x680`.
Regression: `settingsLiquidRegions.test.tsx` **10/10** — the new case parses both sources and
fails any `disabled={...}` not immediately followed by `title={sameWhy}`.
Evidence: `baselines/cat8-l8-settings.json`, `cat8-l8-settings-control.json`,
`cat2-l8-settings.json`.

## 2026-08-30 · primary — YouTube category 1 closes at a controlled 10/10

L8's last unscored surface. Opened it from Start > YouTube; `.yt-root`, so every harness
runs on `@.fwin:has(.yt-root)` — NOT `--surface "YouTube"`, for the reason Settings
recorded (a window title localizes and cannot survive its own four-language leg).

**Scored state, stated because Carry 22 says an unstated one is a fabricated number.** The
product opens on the News tab, and News here holds **0 rows** ("No new videos since last
check") — a category measured on an empty harness is capped at 0. The honest surface is the
playlist pane with a real playlist selected: **16 video rows, 111 painted text runs, 65
hit-tested controls, 84 focusable**. That is the state every number below was taken in.

**Category 1 — PASS 10/10.** `belowFloorByHit` **54 → 0**, `stolen` 0, `occluded` 0,
`minRatio` **6.52** over 106 records with 0 failing, WCAG 2.5.8 fails **0**, unreachable
**0 of 84**, reduced-motion durations over threshold **0**. Box 980x640, standard
presentation, forest-night.

The 54 were families, not one-offs: 34 row-action buttons at hit 22.5, 6 side links at 26.5,
4 `select` and 6 `input` reached through `label.yt-pref` at 19.5–25.5, 4 sub-language chips at
21.5. So the floor went on containers, in the idiom this repo already owns:
- `lq-hit-scope` on `.yt-root` — the transparent centred `::after`, no chrome growth.
- `min-height: var(--lq-hit-target)` on `.yt-pref`. The scope deliberately omits `input` and
  `select`: they are replaced elements, `::after` generates no box on them, and a scope that
  looked like it covered them would have left every pref control at 21px while reading fixed.
  A control's pointer target is the control PLUS its labels, and the label is the bigger box.

**One control survived the first fix at 31 of 32, and the reason is worth keeping.**
`button.btn.ghost.small` in `div.yt-folder-head` had its scope expander already applied. The
row was 22px tall and the first `.yt-pl-item` sits 4px below it, so the downward pointer walk
left the header at 15px and entered the neighbour — the expander was correct and the
ROW was too short to hold it. `min-height` on `.yt-folder-head` closed it. Generalisation:
a scope expander is bounded by whatever is painted next, so on a tight vertical stack the
floor has to exist on the row as well as on the control.

Control (`--control`, same root, same run): contrast, targets-by-pointer, targets-by-rect,
WCAG 2.5.8 and keyboard **all five moved** — counts `[0,78,0,0,0] → [1,80,2,1,2] →
[0,78,0,0]`, `backToBaseline: true`, `rectDrift: 0`.

`under32Count` stays **78** by RECT and that is not a failing bar — the rubric's floor is the
pointer region, and this surface is deliberately compact chrome (11–12px chips and prefs).
Growing the boxes is what category 4's dead-region number exists to punish.

Regression: `youtubeLiquidHitFloor.test.ts` **3/3** — it fails if `.yt-root` loses the scope,
if either `min-height` leaves its rule, or if `.lq-hit-scope`'s `:is()` ever grows `input`/
`select` (which would make the `.yt-pref` rule dead while the test still passed).
Evidence: `baselines/cat1-l8-youtube.json`. Zero new probes — one RUN of `cat1-accessibility.cjs`.

## 2026-08-30 · primary — YouTube category 3 closes at a controlled 10/10

Opened FAIL on two of three bars: `liquidTreatedEligible` **0 of 2** and
`sharedPrimitiveEligible` **0 of 2**. The two eligible regions are `aside.yt-side` and
`header.yt-header` — the only semantic landmarks this surface has, and exactly the
navigation/contextual chrome §2.3 says Liquid is for. Both took `ContextualSurface`
(`as="aside"` / `as="header"`), which declares the role, paints nothing outside
`.fwin-liquid`, and therefore costs no reversibility.

**Making the header contextual immediately broke the OTHER bar, which is the finding worth
carrying.** `div.yt-prefs` — ten playlist settings, `forms >= 1`, dense work by every rule
the rubric has — lived INSIDE that `<header>`. The moment the header became the translucent
role, the form was on glass. So the form moved OUT of the header and onto its own
`AnchorSurface bare` sibling. The same thing then surfaced one level down in the rail:
`div.yt-add` and `div.yt-folder-add` each hold an input, and with `aside.yt-side` contextual
they read `alpha 0.72 on aside.lq-contextual`. `denseWorkOnTranslucent` **0 → 2 → 0**; both
field rows are anchors now.

Generalisation, and it is the mirror of Carry 20: **declaring a landmark contextual promotes
every form inside it onto glass.** Take the landmark and its dense children in ONE edit, or
the category trades one failing bar for another and each pass looks like progress.

Final: regions **83**, roles Work 4 / Liquid-eligible 2 / Anchor 73 / Anchor(holds work) 4 /
Ambient 0. `denseWorkOnTranslucent` **0**, `liquidTreatedEligible` **2 of 2**,
`sharedPrimitiveEligible` **2 of 2**. Window paint alpha 0.72, `blur(8px) saturate(1.25)`.
Control: `[0,2,2,2,4] → oneRegionGlass [1,…] → allGlass [4,…] → restored [0,2,2,2,4]`,
`movedOne` true, `allWorkFailed` true, returned — **CONTROL FAILED AS REQUIRED**.

**Two traps this cost, both already recorded elsewhere and both live here.**
1. `.lq-contextual`/`.lq-anchor` set `min-height: 0` unconditionally so a primitive can be a
   scroll container. In `.yt-main`'s column flex that lets the header be crushed by the video
   list. `flex: 0 0 auto` on `.yt-header` and `.yt-prefs` is the compensation.
2. `.lq-anchor[data-bare]` zeroes padding and radius, and it is **(0,2,0)**. A two-class
   restore only TIES and is then decided by bundler import order — measured live: `.yt-prefs`
   came back `padding: 0px` with my two-class rule in place. The restores are three classes
   (`.yt-side .lq-anchor.yt-add`, `.yt-main .lq-anchor.yt-prefs`), the same shape
   `.scr-drawer .lq-anchor.scr-drawer-search` uses and for the same reason.

**Deliberate visual change, recorded rather than smoothed:** the prefs band and the two rail
field rows now carry `--lq-anchor-bg` (`#121c17` against the root's `#0c1410` in forest-night)
in BOTH presentations, because `.lq-anchor` paints unconditionally. That is the anchor role's
own token, remapped per theme, not a baked palette. It reads as a distinct configuration band,
which is the honest thing for a ten-control form; reverting is dropping the primitive.

**Category 1 RE-RUN at this tree per Carry 19, not carried across the restructure:** still
**PASS 10/10** — `belowFloorByHit` 0, stolen 0, occluded 0, minRatio 6.52, unreachable 0.
Regression: `youtubeLiquidHitFloor.test.ts` **7/7** (4 new cases pin the roles, the absence of
the raw landmarks, the flex compensation, and the three-class restores).
Evidence: `baselines/cat3-l8-youtube.json`. Zero new probes — two RUNs of
`cat3-liquid-utilization.cjs`, one re-RUN of `cat1-accessibility.cjs`.

## 2026-08-30 · primary — YouTube category 4 closes at a controlled 10/10

Opened FAIL on two bars. `default` 980x640 and `maximized` 1264x765 were already clean
(0/0/0/0, dead 3.5% and 6.2%); the whole finding was the **compact** leg, and it is a real
product state — `MIN_W`/`MIN_H` in `DesktopShell.tsx:296` are **260x170**, so 260x170 is a
size a user can drag to, not a probe artifact.

At 260px the `minmax(200px, 240px)` rail left the video list a **0px** column: **44 clipped**,
1 horizontal scroller (`div.yt-list` **330 > 202**), 1 `hiddenOverflowX`
(`div.fwin-body 477 > 248`). Final: **0 / 0 / 0 / 0 at all three sizes**, dead 3.5 / 0.5 / 6.2%,
chrome 33.5 / 57.2 / 27.5%, dominant canvas 94.3 / 78.8 / 95.3%, every leg restored.

Three fixes, in the order the harness forced them:

1. **The rail stops being a column below 560px** and becomes a band above the list that
   scrolls inside itself. `grid-template-rows: minmax(0, 0.45fr) minmax(0, 1fr)` — fractional,
   not a fixed cap, because the query is on WIDTH and the same rule has to hold at 260x170
   and 520x820 (53px of 170, 254px of 820). `cqb` was the obvious spelling and is wrong:
   block-size container units need `container-type: size`, and this container is `inline-size`.
   **44 → 2 clipped.**
2. **Two families were refusing to shrink, not being clipped.** A flex item's `min-width` is
   `auto`, so `.yt-row-meta`'s three spans held the row open at their full text width and
   `.yt-pref`'s label held the preference form open. `min-width: 0` plus ellipsis on both.
   **2 → 0 clipped, `hiddenOverflowX` 1 → 0.**
3. **The row could not hold four columns at 260px.** Measured live: thumbnail 96 + status
   chips 80 + three actions 112 = 288 before the title gets a pixel. Under the query the
   badges move to a second line under the title and the row keeps its fixed 64px, because
   `ROW_H` is what `VirtualList` measures with. **Scroller 330 → 0.**

**THE TRAP THAT COST TWO FULL RUNS, and it is not specificity as usually stated: `@container`
adds NO specificity, so it is decided by SOURCE ORDER.** The block was first written next to
`.yt-root` near the top of the section, ~290 lines above `.yt-row`, `.yt-side` and `.yt-thumb`.
It matched, it was live, and it moved nothing — the row still measured 330 in a 202px list
across two re-runs. Moving the same bytes below the rules it overrides took the score from
FAIL to 10/10 with no other change. A container query that appears to do nothing is in the
wrong place in the file before it is wrong in its conditions.

**A dead `@media (max-width: 720px)` block was doing this job and could never fire**, because
a media query reads the OS viewport (1264px) while this surface lives in a 260px floating
window — the same defect `.jiten-novels-shell` records. It was not merely dead: it set
`display: none` on `.yt-status-chips`, i.e. it deleted a feature at narrow widths. It is
replaced by the container query, which hides nothing.

Control: injected clip `clipped` **0 → 1 → 0**, `removalProven` true, `backToBaseline` true.
Sub-minimum shrink (200x140, below the product's own floor) recorded factually: clipped 0,
overlaps 0, 1 horizontal scroller, restored. Proven-pager leg not applicable here.

**Categories 1 and 3 RE-RUN at this tree per Carry 19:** cat1 **10/10** (belowFloorByHit 0,
stolen 0, minRatio 6.52, unreachable 0), cat3 **10/10** (84 regions, dense 0, treated 2 of 2,
shared 2 of 2). Guard `youtubeLiquidHitFloor.test.ts` **10/10**.
Evidence: `baselines/cat4-l8-youtube.json`. Zero new probes — four RUNs of
`cat4-use-of-space.cjs`, one re-RUN each of cat1 and cat3.

## 2026-08-30 · backup — YouTube category 6 closes at a controlled 10/10

**Category 6 — feature parity and reversibility. PASS 10/10**, all three bars.
Category 5 VOIDed on `no category-6 baseline at baselines/cat6-youtube.json`, so this is
what unblocks it. **Zero new probes and zero new harness lines**: a `youtube` SPEC added to
`l6-parity.js` (9 rows, 4 drive steps, 9 mutations) and one RUN of `cat6-feature-parity.cjs`.

| bar | number |
| --- | --- |
| features reachable, Standard | **9 of 9** |
| features reachable, Liquid | **9 of 9**, `rowsAgree` true, `onlyInOne` [] |
| round trip standard → liquid → standard | `fieldsHeld` true, `shellHeld` true, **diffs []** |
| drive refusals | **0 of 4** steps |
| negative control | **9 of 9** mutations, `exactlyOwnRow` true on every one |

Rows, with the number that earned each: `playlistRail` items=2/titled=2/active=1/planBadge=0 ·
`folderTree` folders=3/headed=3/playlists=1/filed=1 · `addPlaylist` submitDisabled=true
agreeing with an empty field · `tabSwitching` tabs=2/active=1 · `videoRows`
rows=16/titled=16/thumbed=16/meta=16/listitems=16 · `rowActions`
threeActions=16/titled=16/openImpliesDownloaded=16 · `selectionActions` selected=0 with both
batch actions disabled · `playlistPreferences` prefs=11/named=11/controls=10/valued=10/subChips=4
· `windowLifecycle` chrome 5/4, `aria-pressed` false.

**Three decisions recorded, because each could have manufactured a score:**

1. **The menu bar and status strip are NOT scored.** Measured live rather than assumed:
   `.fwin-body` has exactly one child, `.yt-shell`, and `.ui-statusbar__field` and menu
   buttons both count **0** in this host. `AppChrome` renders them elsewhere. Scoring an
   absent host affordance as a missing feature would have invented a regression.
2. **The drive touches only view-local state** — folder-name draft, active tab, row
   selection. Every preference control (`setLang`, `toggleSub`, `setPlaylistField`,
   `setSortPref`, `setAutoUpdate`, `moveToFolder`) writes through
   `window.api.ytSetPlaylistPrefs` into the user's real store, and refresh/downloadAll reach
   the network. A run that dies halfway now persists nothing.
3. **Three rows are one-way or two-way AGREEMENTS, not presence counts** — `addPlaylist`
   (submit disabled ⇔ field blank), `selectionActions` (batch actions disabled ⇔ nothing
   selected), `rowActions` (Open enabled ⇒ the row really has a file; stated one-way because
   the product also, honestly, disables it for a downloaded row with no `mediaItemId`).

**TRAP for the next spec author:** do NOT drive the add-URL field. `cat6-feature-parity.cjs`
dirties the first editable text input on the surface with its own `lqp-roundtrip-食` mark and
afterwards hunts for that exact value to put it back. Typing over it makes `undirtyField`
refuse and leaves the mark in the user's running app. The folder-name field is the second
input and is free. Second trap: the undo must restore SELECTION BEFORE THE TAB — `restore()`
is one synchronous call, so a tab click that unmounts the list leaves the selection sweep
with zero rows and silently restores nothing.

Surface returned to what it was found in: presentation `standard`, playlist tab active, both
drafts empty, 0 rows selected, 16 rows painted. Evidence: `baselines/cat6-youtube.json`.
**YouTube 30/80 → 40/80.**

## 2026-08-30 · backup — YouTube category 5 closes at a controlled 10/10

**Category 5 — UI clarity. 7/10 → PASS 10/10.** Three of the ten questions answered NO on the
first run, and all three were real product defects rather than instrument problems. Zero new
probes: two RUNs of `cat5-ui-clarity.cjs` plus its `--control`, and one re-RUN each of
categories 1, 3, 4 and 6 after the structural edits (Carry 19).

**Q5 — `--fg` IS NOT A TOKEN IN THIS REPO, and the fallback was the whole declaration.**
`.yt-root` read `color: var(--fg, #eee)`. No `:root` block in the 700 KB stylesheet defines
`--fg`, so every one of the twelve palettes painted the literal `#eee`. On the six dark themes
that coincided with the intent; in `classic-light` it is near-white on `--bg: #ffffff`.

| theme | measured runs | minimum ratio | failing |
| --- | --- | --- | --- |
| forest-night, before | 106 | 6.52 | 0 |
| classic-light, before | 106 | **1.00** | **75** |
| forest-night, after | 89 | 5.12 | 0 |
| classic-light, after | 89 | **5.46** | **0** |

A ratio of 1.00 is text the exact colour of its own background. `themeAxisMoved` true both
times, so the two cells are a real stability answer and not one number reported twice.
Repairing the token alone was NOT enough: seven rules dimmed secondary text with
`opacity: 0.65`/`0.7`, and `--text` at 0.65 alpha over white composites to about rgb(150) and
still misses the 4.5 bar. Those seven move to `--muted`, which the palettes already tune
(#5f5f66 on white). `.yt-status-err`'s hardcoded `#f88` (~2.3:1 on white) moves to
`--danger-text`. Dropping the opacity also stopped the dimming leaking onto controls: the
folder head's delete button was being greyed with its own label.

**Q4 — 29 controls to scan in the default state, against a ceiling of 12, and 0 disclosures.**
Two native `<details>`: the rail's secondary tools (extension pairing, Reader Inbox, Surprise
me, new folder) and the fourteen-control playlist preference form. **scannedControls 29 → 10,
collapsedDisclosures 0 → 2.** Paste-a-URL deliberately stays outside, because it is the rail's
one obvious way in. Nothing is removed and nothing is controlled by React state — a `<details>`
is native, keyboard-reachable and reversible, and the resting state is the same every time.

**Q1 — 8 entry points against a bar of 1-3.** Not fixed separately: with the two disclosures
closed, `primaryInputs` 5 → 1 and `accentButtons` 3 → 2 (`Add` and `Log`; the `JA` sub-language
chip is inside the prefs form). **entryPoints 8 → 3.**

Category 6 gained a tenth row, `progressiveDisclosure`, so a disclosure that stops opening
cannot pass unnoticed, plus an `openTools` drive step and its own mutation — parity
**10/10 in both presentations**, round trip `diffs []`, all ten mutations `exactlyOwnRow`.

Re-runs after the structural edits, none inherited: **cat1 10/10, cat3 10/10 (liquid
presentation), cat4 10/10, cat6 10/10.** Control: `CONTROL FAILED AS REQUIRED on Q2, Q3, Q4,
Q5, Q10`, with the Q4 plant taking scanned 10 → 32 past the bar of 12.

Guard `youtubeClarityGuards.test.ts` (7 cases) pins all three repairs at source, and it was
mutation-checked rather than merely run: putting `var(--fg, #eee)` back took it **7 passed →
2 failed**, and the stylesheet was restored byte-identical to the staged region afterwards.

**YouTube 40/80 → 50/80.** Remaining: categories 2, 7, 8. Evidence:
`baselines/cat5-l8-youtube.json`, `cat5-l8-youtube-control.json`, `cat6-l8-youtube.json`.

## 2026-08-30 · backup — YouTube categories 2 and 7 both close at a controlled 10/10

**Category 2 — clunkiness. PASS 10/10**, five bars, on the first run. Zero new probes: two
RUNs of `cat2-clunkiness.cjs` (measurement + `--control`), the surface named as data.

    --task "click:.yt-plan-item >> wait:500 >> click:.yt-folder .yt-pl-item >> wait:500
            >> click:.yt-prefs-disclosure > summary >> wait:400"
    --undo "click:.yt-prefs-disclosure > summary"   --result ".yt-row"   --both-presentations

The dominant task is picking what to study — swap to the Plan-to-watch queue, back to the
playlist, then open its settings. **Refresh, Channel, Log and Download all are deliberately
NOT driven**: each calls `window.api` and reaches the network or writes user data, and the
rubric's dominant task never means "cause a side effect the score does not need".

| bar | number |
| --- | --- |
| input cost | **3 clicks, 0 keystrokes** |
| dead ends | **0 of 3** driven steps |
| modal traps | **0** |
| scroll traps | **0** |
| latency, scored `recvMs` | 19.8 / 66.8 / 3.2 — worst **66.8** against the 100 ms bar, **over100 = 0** |
| latency, `stampMs` unscored | 34.6 / 81.6 / 30.6 — recorded so the main→renderer hop stays visible |
| cost parity | standard **3**, liquid **3**, restored to standard, box 980x640 both |
| undo | `restored` true, `baseHash === afterHash` (`1psfto3`) |
| idle leg | resting and after-task both `rawChurns` false — nothing on this surface moves on its own, so no `--churn` exclusion was taken |

Control: `deadEnd/modalTrap/scrollTrap` **0/0/0 → 1/1/1 → 0/0/0**, `backToBaseline` true, and
the inert-click latency floor measured **1.3 ms** — three orders under the bar, so the floor
does not straddle it.

**Category 7 — performance under real load. PASS 10/10.** `cat7-perf.cjs` gained a `youtube`
SPECS entry; that is DATA, and it is the only thing this surface contributed.

**Why navigation and not scrolling, measured rather than preferred:** `.yt-list` is the only
overflowing box here and it overflows by **603 px**. `scrollProof` REFUSES below 1000 px
reached, so a scroll leg would have VOIDed rather than scored. What this surface does at scale
is swap destinations — each rail click unmounts a `<header>`, the fourteen-control preference
form and a virtualised list, and mounts the next one's. The load runs 12 round trips.

| leg | p50 | p95 | max | frames over 100 | main max |
| --- | --- | --- | --- | --- | --- |
| ceiling (3 runs) | 16.7 | 16.8 | 17.9 | 0 | 10.9 |
| drag | 16.7 | 16.8 | 17.5 | **0** | 12.6 |
| resize | 16.7 | 33.5 | 50.0 | **0** | 10.9 |
| theme switch | 16.7 | 16.8 | 16.9 | **0** | 9.0 |
| heavy (24 swaps) | — | — | — | — | main p95 **3.2**, max **28.1** against a 500 ms bar |
| idle | 1.9 | 2.8 | 7.0 | — | — |

`heavyProof`: **"2 destinations x12 = 24 swaps, restored to オノマトペ"** — the rail agreed it
got back, so the leg is not scored on a load that half-ran. This display's ceiling p50 is 16.7
against L0's 10.0, so only the RATIO to this session's own ceiling is read, never the L0 ms.

Control: `--jank` takes the drag leg's p95 **16.8 → 100.4** and frames over 100 **0 → 12** with
12 injected blocks — the recorder is seeing the frames it claims to.

**YouTube 50/80 → 70/80.** Remaining: category 8. Evidence:
`baselines/cat2-l8-youtube.json`, `cat2-l8-youtube-control.json`, `cat7-youtube-perf.json`.

## 2026-08-30 · backup — YouTube category 8 closes, and YouTube CLOSES at 80/80

**Category 8 — honest states. FAIL → PASS 10/10.** The first run failed one bar and left two
UNMEASURED; all three are closed here. Zero new probes — four RUNs of `cat8-honest-states.cjs`.

**`mutePairs` 6 → 0.** Six disabled controls said nothing about why, and every one guards on
more than one condition, so a fixed caption per button would name the wrong cause whenever the
other clause is biting. They now spend `firstReason` from `shared/disabledReason.ts` as BOTH
`disabled` and `title`, which is one expression and cannot drift. Eleven controls in total,
including the two on the News header the resting probe never saw:

| control | reasons, in precedence order |
| --- | --- |
| Add playlist | busy · `yt.why.needUrl` |
| Log / Add to Plan (both headers) | busy · `yt.why.needSelection` |
| row Log | busy · `yt.why.alreadyLogged` |
| row Open in Video | `yt.why.notLogged` · `yt.why.noMedia` |
| Refresh, Channel, Download all, Surprise me, the URL field | busy |

`busy` is already a translated status sentence, so it IS the reason verbatim rather than a
second string somebody would have to keep in step with it.

**`statesNamed` UNMEASURED → 1 of 1 observable.** Driven, not read:
`--drive-click ".yt-plan-item" --drive-undo ".yt-folder .yt-pl-item"` empties the pane to the
Plan-to-watch queue (0 videos), which renders a named `yt.plan.empty`. `surfaceChanged` true,
`restored` true. `loading`, `error` and `offline` are recorded NOT OBSERVABLE on this surface
rather than scored — correction 6's denominator.

**`languagesDiffer` UNMEASURED → true.** Driven through Settings > Appearance, the
`[data-setting-id="ui-language"]` card, and restored: **4 distinct hashes**, 89 text runs in
each language, **28 differing runs = diffShare 0.3146**, `rawKeyCountMax` **0**, and the
language returned to `{ html: 'en', stored: 'en' }` exactly. `rawKeys` 0, `placeholders` 0.

Control: `rawKeys/placeholders/mutePairs` **0/0/0 → 1/1/1 → 0/0/0**, `backToBaseline` true.
Re-runs after the edits: **cat5 10/10, cat1 10/10** — the reasons are attributes, and both
categories were re-measured rather than assumed.

Guard `youtubeClarityGuards.test.ts` grows an eighth case that forbids the shape itself:
`disabled={!!busy…}` and `disabled={!v.downloaded…}` may not appear, and at least 11
`disabled={!!why*}` sites must each carry the matching `title`.

# **YouTube CLOSES at 80/80.** All eight categories, each with its own passing negative control:
1 · 2 · 3 · 4 · 5 · 6 · 7 · 8. That is **L8's fifth and last surface** — Resources, Scraper,
Settings, YouTube and Music now all hold 80/80. Evidence: `baselines/cat8-l8-youtube.json`,
`cat8-l8-youtube-control.json`.

## 2026-09-02 — Dictionary — 80/80 — commit 70626d66

**L1's re-drive, half one of two.** Gate 495 names Video AND Dictionary. Their previous 8/8
was driven at `6eefff6c`, which `git rev-list --count 6eefff6c..HEAD` puts **925 commits**
behind this HEAD — stale by the rubric's own rule, not missing. So this is a re-measurement
with the instruments and protocols that already existed, not a first measurement. RULE C: 2
surfaces × 8 categories = **16 cells**, `sampled-out:` **EMPTY**.

State driven: a REAL lookup, not the window at rest. `食べる` typed through the product's own
field and submitted → **20 entries**, `.dict-view` 772×3756, `.lexicon-workbench` 3,523 px
inside an 818×545 body. This is load-bearing rather than ceremony — see cat 4 below.
Restart before main-process measurement: not required; every category here is renderer-side.
Instrument: the eight parameterised `cat*-*.cjs` harnesses via `jp-bridge` (pid 47004, port
39273, `eval 1+1` → 2). **Zero new probes** (RULE 1).

| # | Category                        | Score | Number measured | Negative control (must have failed) |
| - | ------------------------------- | ----- | --------------- | ----------------------------------- |
| 1 | Accessibility                   | 10/10 | 154 text runs, minRatio **5.35:1** (`span.muted` 12px), 0 failing, 0 unmeasurable; 67 controls, 47 below the 32 px bar **by rect** but **0 by pointer** (`.lq-hit`); 58 focusable, **0** unreachable; reduce-motion 9 → **0** durations | same process: contrast 0→2, targets-by-rect 47→49, targets-by-pointer 0→2, 2.5.8 0→1, keyboard 0→2; restored to `[0,47,0,0]`, rectDrift 0 |
| 2 | Clunkiness                      | 10/10 | input cost **4** (1 click + 3 keys); `worstRecv` **19.6 ms** vs the 100 ms bar, `overBar100` **0**; 0 dead ends, 0 modal traps, 0 scroll traps; costParity standard **4** = liquid **4** at one geometry | deadEnd / modalTrap / scrollTrap each **0 → 1 → 0**; inert plant received in 0.4 ms; undo round trip `ditcbg` → `ditcbg` |
| 3 | Liquid utilization              | 10/10 | `denseWorkOnTranslucent` **0**; liquid-treated eligible **2 of 2**, all backed by a shared primitive; roles Work 2 / Anchor 4 / Anchor-holds-work 2 / Ambient 0 | A blur one Work region → count moved; B force all-glass → **every** Work region failed; both restored, one-material check byte-identical |
| 4 | Use of space                    | 10/10 | three sizes, all clean: default 820×580 dead **8.9%** · compact 260×170 **0.7%** · maximized 1264×765 **15.0%**; clipped 0 / overlaps 0 / horizontal scrollers 0 at every size; canvas 93.7 / 78.8 / 95.3% | injected must-clip box 0 → 1 → 0; art-plate exclusion proven narrow (plate hanging out 279 px did NOT raise `clipped`); backdrop plant raised overlaps 0 → 8 → 0; sub-minimum 200×140 shrink restored |
| 5 | UI clarity                      | 10/10 | 10 of 10 questions answered YES, 66 controls painted, 0 findings, 0 voided; alt-theme axis `[null, classic-light]` | control arm fired on **Q2, Q3, Q4, Q5, Q10** — banked separately as `cat5-l1rd-dictionary-control.json` so the measurement arm did not overwrite it |
| 6 | Feature parity + reversibility  | 10/10 | standard **7/7** = liquid **7/7**, na 0, rows agree, 0 failing, 0 only-in-one; round trip standard → liquid → standard with a dirtied INPUT: fields held, shell held, **0** diffs, box 820×580 both ways | three mutations, each fell **exactly its own row** and no other: `notesFilter` 7/7→6/7, `sourceSwitch` 7/7→6/7, `windowLifecycle`; all restored to 7/7 |
| 7 | Performance under real load     | 10/10 | score 10, findings **[]**, voided **[]**; drag p50 **16.7** / p95 **17.1** / max 33.4 ms, over-100 **0**, closed loop (geometry identical before/after); resize p95 16.9; theme p95 16.9; main-thread max 11.4 ms vs a 500 ms bar | `--jank` sensitivity control: the SAME drag under 120 ms renderer blocks went p95 **17.1 → 100.3** and over-100 **0 → 11**. The recorder demonstrably sees the frames it reports |
| 8 | Honest states                   | 10/10 | 164 text runs, raw i18n keys **0**, placeholders **0**, mute pairs **0**, `statesNamed` **1 of 1 observable**, `languagesDiffer` TRUE across all four languages (restored to `en`/`en`) | stock plant: rawKeys / placeholders / mutePairs each **0 → 1 → 0**. Plus the control for correction 39 — see below |

Lowest category: none — every category holds a 10. Two of them only after work this turn:

**Category 2 was a FAIL and is fixed in `70626d66`, the commit this entry carries.** The
first keystroke into `.dict-search input` was received in **118 ms** (then 78.9, 38.8) against
a 100 ms bar. The decay across three keys is the tell: render cost, not I/O. `input` state
lives in `DictionaryView` and `LexiconWorkbenchResults` is its SIBLING, so every keystroke
re-rendered 3,523 px of reading area. Memoised the results component and stabilised its one
non-primitive prop. After: **[15.9, 11.8, 7.0]**, worst 19.6, over-bar **0**. Re-scored in the
fixing commit, same task, same 820×580 geometry, base state re-established after HMR remounted
the view.

**Category 8 was a FAIL, and the defect was in the INSTRUMENT — fixed in `890c4074`.**
`textOf` returned `hosts: found.length` (raw query count) while `messages` was filtered by
`painted()`. `p.muted.lexicon-notes-empty` carries a real, correct, translated empty message
but sits inside a CLOSED `details.lexicon-notes-browser`, so it sat in the denominator and
could never reach the numerator: `0 of 1 observable`, a FAIL no product change could clear.
The discriminating control is the reason this is a repair and not a muted bar — details
CLOSED **plus** a PAINTED plant carrying no text still scores `hosts 1 / messages 0` → **FAIL**;
remove the plant and reopen → `1 of 1` → PASS. `unpaintedHosts`/`unpainted` are now published
with the excluded node's ancestor chain.

**The state a category is driven in decided category 4's verdict, and this is the trap to
carry forward.** Measured on the window AT REST (empty search box, no results) the dead region
is default 18.3% / maximized **53.3%** — a two-bar FAIL. The same window, same tree, same
harness, holding a real 20-entry lookup: 8.9% / **15.0%**. The rubric already says a category
measured only on an empty harness is capped at 0; the empty run is not a worse score, it is
**not a measurement**. Both are banked (`cat4-l1rd-dictionary.json` = at rest,
`cat4-l1rd-dictionary-loaded.json` = scored) so the difference stays checkable. The same
correction applies to category 1: at rest it saw 13 text runs and 11 controls, loaded it sees
154 and 67.

**Disclosed rather than rounded away:** maximized dead region is **15.0** against a bar of
`<= 15`, and the harness rounds to 1 dp *before* comparing. It passes, but it passes AT the
bar, not under it — anything that adds chrome at maximized will tip it.

Evidence: `baselines/cat{1,2,3,5,6,7,8}-l1rd-dictionary*.json`,
`cat4-l1rd-dictionary-loaded.json`. **sampled-out: (none)**.
Still open for gate 495: **Video**, all eight categories, same protocol.

## 2026-09-02 · backup — Video, 6 of 8 categories at a controlled 10/10 — NOT an 80/80 entry

**L1's re-drive, half two, INCOMPLETE and reported as incomplete.** Six categories hold a
controlled 10; **category 5 scores 7/10 on three named findings and category 7 is VOID.**
This entry exists because the rubric's own rule is that a partial result is published with
its numbers, not held back until it is flattering. Video is NOT done.

State driven: the Media Center Video page with a REAL library item selected — `JoJo no
Kimyou na Bouken - Ougon no Kaze 38 RAW`, **486 subtitle lines**, MAL 8.5 — reached by
clicking its own up-next tile, not by injection. Everything below was measured in that
state, and that is the whole point of the turn: **one instrument defect with three faces and
two product defects existed only in the loaded state and were invisible at rest.**
Restart before main-process measurement: not required; every category here is renderer-side.
Instrument: the eight parameterised `cat*-*.cjs` harnesses via `jp-bridge` (pid 47004, port
39273, `eval 1+1` → 2). **Zero new probes** (RULE 1).

| # | Category                        | Score | Number measured | Negative control (must have failed) |
| - | ------------------------------- | ----- | --------------- | ----------------------------------- |
| 1 | Accessibility                   | 10/10 | 84 text runs, minRatio **5.28:1**, 0 failing, 0 unmeasurable; 38 controls measured, **0** below the 32 px hit floor, 0 occluded, 0 stolen; 33 focusable, **0** unreachable; WCAG 2.5.8 fails **0**; reduce-motion 41 → **0** durations, released back to 41 | same process, six legs all moved: contrast, targets-by-pointer, targets-by-rect, 2.5.8, keyboard, decorative-exemption-is-narrow — findings `[0,5,0,0,0]` → `[2,7,2,1,2]` → `[0,5,0,0]`, rectDrift 0 |
| 2 | Clunkiness                      | 10/10 | `worstRecv` **11.7 ms** vs the 100 ms bar (11.1, 8.2, 4.7, 2.0), `overBar100` **0**; 0 dead ends, 0 modal traps, 0 scroll traps; costParity **true** — same window, same geometry, same task in BOTH presentations, presentation and box restored | banked separately as `cat2-l1rd-video-control.json` because the control arm overwrites `--out`: deadEnd / modalTrap / scrollTrap each **0 → 1 → 0**, inert plant received in 0.5 ms |
| 3 | Liquid utilization              | 10/10 | `denseWorkOnTranslucent` **0**; liquid-treated eligible **4 of 4**, shared-primitive-backed **4 of 4**; measured in `liquid`, restored | A blur one Work region → count moved; B force all-glass → **every** Work region failed; both restored |
| 4 | Use of space                    | 10/10 | three sizes, all four bars clean at each: dead region **6.9% / 0.6% / 9.8%** against a 15% bar; clipped 0, overlaps 0, horizontal scrollers 0 everywhere | injected must-clip box 0 → 1 → 0; art-plate exclusion proven narrow (a plate hanging out 279 px did NOT raise `clipped`); backdrop plant raised overlaps **0 → 10 → 0**; sub-minimum 200×140 shrink restored |
| 5 | UI clarity                      | **7/10** | **3 of 10 questions answer NO** — see below. 84 text runs per theme, alt-theme axis `[null, classic-light]` and the axis demonstrably moved (minRatio and paint digest both changed) | the theme axis is its own control and it fired: `classic-light` found a failure `null` did not |
| 6 | Feature parity + reversibility  | 10/10 | standard **10/10** = liquid **10/10**, na 0, rows agree, 0 failing, 0 only-in-one; round trip standard → liquid → standard with a dirtied field: fields held, shell held, **0** diffs, 1080×700 both ways | **10 of 10 mutations armed, 0 unarmable**, each falling **exactly its own row** and each restored to 10/10 — up from 8 armed / 2 unarmable / VOID before the repair in `af21269d` |
| 7 | Performance under real load     | **VOID** | drag readings disagree across repeats (BREACH, clean, clean, BREACH, clean) → leg UNSTABLE; heavy leg refused, `Video load never armed`; resize longest frame 100.3 ms against a control max of 18.5 ms, recorded ENV not scored | `--jank` ran, but a VOID leg cannot be scored 10 and is not scored at all |
| 8 | Honest states                   | 10/10 | 84 text runs, raw i18n keys **0**, placeholders **0**, mute pairs **0**, `statesNamed` clean, `languagesDiffer` **TRUE** across all four languages — 49 of 84 runs differ per language (`Video`→`動画`→`视频`), restored to `en` | banked separately as `cat8-l1rd-video-control.json`: rawKeys / placeholders / mutePairs each **0 → 1 → 0** |

**Two product defects, both fixed and re-scored in their own commits, both loaded-only.**
`5eaa3573` — category 1: the inspector's three score-row captions measured **4.49:1** against
a 4.5 bar (11px `--mc-dim` on the cell tint) and the MAL link's hit area was **26.5 px**
against a 32 px floor. Both elements render only with a video loaded. After: 5.28 and 0.
`4c2df362` — category 2: the first keystroke into the YouTube URL field was received after
**171.7 ms** (then 128.4, 82.5, 47.2), because `ytUrl` lives in `useMedia` and every character
reconciled the whole Media Center including the seven-poster shelf. `useDeferredText` is now
extracted from `GlobalSearchField` and shared by both fields. After: **11.7 ms**, over-bar 0.

**One INSTRUMENT defect, three faces, fixed in `af21269d` — and it is the finding to carry.**
Category 6 could not score this surface at all until it was repaired, and each face failed
differently: (a) the driver DELETED the surface, because `dirtyField` types into the first
visible text field and `df00b4be` made that the topbar GLOBAL SEARCH — a navigation control,
so the Media Center left the Video page and `check('video')` refused `no video surface`;
(b) two rows read source-ness as `.mc-video-stage video`, a node this page never mounts
(playback is delegated to the media workspace), so their "with a source" branch was
unreachable and both scored FAIL the moment a real item was selected; (c) three mutations
were armable only at rest and refused, VOIDing the category twice. **An instrument that
models a state the product cannot enter certifies only the state it can see.**

**Category 5's three NOs, stated as the next worker's slice, not smoothed over:**
- **Q1 dominant task** — `entryPoints 4` against a bar of 1..3. Three accent buttons compete
  in the loaded state: `Open video` (topbar), `Open in the media workspace` (stage),
  `Open Study Mode` (inspector), plus one primary input.
- **Q3 primary action visible without hunting** — `insideBodyViewport: false`. The primary is
  explicitly marked but requires scrolling at 1080×700.
- **Q5 stable contrast in BOTH themes** — `div.media-substatus` ("Loaded 486 subtitle lines")
  measures **3.18:1** on `.mc-video-stage` in `classic-light`, against 4.5. Clean in the
  default theme, which is exactly why the alt-theme axis exists.

Evidence: `baselines/cat{1,2,3,4,5,6,8}-l1rd-video*.json`, `cat7-video-perf.json`.
**sampled-out: (none)** — all eight categories were attempted; two did not close.
Still open for gate 495: **Video categories 5 and 7.**

## 2026-09-03 · backup — Video category 5 CLOSES at a controlled 10/10, in BOTH stage states

**Category 5 goes 7/10 → 10/10.** All three NOs the previous entry named are fixed and
re-measured in their fixing commits. Video is now **7 of 8**; category 7 stays VOID and is
the only thing between this surface and gate 495.

Instrument: `probes/cat5-ui-clarity.cjs`, `--surface "@.fwin:has(.mc-video-page)"`, 1080×700,
`bodyScrollTop 0`, presentation `standard`, 34 painted controls. **Zero new probes** (RULE 1).

| Q | was | now | number |
| - | --- | --- | ------ |
| Q1 dominant task | NO, `entryPoints 4` | **YES** | `entryPoints 1`, accentButtons 0, one primary input |
| Q3 primary visible without hunting | NO, `insideBodyViewport false` | **YES** | primaryAction inside the body viewport, `explicitlyMarked true`, in both states |
| Q5 stable contrast in both themes | NO, **3.18:1** | **YES** | 84 runs loaded / 78 empty per theme, **0 failing**, axis moved (minRatio and paint digest both) |

**Negative control, run fresh on the fixed surface:** `CONTROL FAILED AS REQUIRED on Q2, Q3,
Q4, Q5, Q10` — all four plants the category names moved, so the 10 is not VOID.

`1b77bedb` — **Q5.** `.mc-video-stage` is a fixed `#05070b` slab in EVERY theme (correct: it
is the letterbox behind a video), but its status text inherited `--muted`, which classic-light
takes dark to `#5f5f66` → **3.18:1**. `--mc-stage-ink{,-muted}` freeze the default dark
palette's own ink, as `--mc-stage-plate` already froze the gradient. Live: **7.11:1** in both
themes; CONTROL reverting that one row to `var(--muted)` reproduced **3.18** exactly and
restored to 7.11 with no residue. Second half: `.mc-video-stage .media-generation-status`
matched **nothing** — `MediaGenerationStatus` returns a FRAGMENT, so its blocks are direct
children — and its 8px inset had never applied. Left edge 340 → **348** against a stage at 339.

`f8c1aa0a` — **Q1 and Q3, one cause.** Three buttons carried `mc-button-primary` at once.
"Open video" and "Open Study Mode" are demoted outright (the first is described by its own
comment as returning "contextually"; the second is an inspector-rail follow-on). The stage's
"Open in the media workspace" is **conditional on `state.src`**, because its correct weight
really does differ by state: with a source it is the dominant task at y=493; with none it
renders into **the same grid cell** as "Choose what to watch" (both at `grid-area 1/1`) and
that block carries the up-next shelf, so the cell is **1051px inside a 665px body** and the
button centres at **y=807** — below the body's 753 bottom, reachable only by scrolling
`.mc-content` — while the empty state's real action sits at y=402.

**THE TRAP THIS TURN BANKS, because it manufactured a false pass and nearly banked it.**
The previous entry scored the **empty** stage; an intermediate run of mine scored the
**loaded** one and read Q1 and Q3 YES *before any fix*. Same box, same scroll, same 34-control
census, same 12 scanned — only the vertical layout differed, because `entryBand` is
`top < B.top + B.height/3` and the two states put the same three CTAs on opposite sides of a
310px cutoff. **A cat5 score is only meaningful with its stage state named.** Both states are
therefore recorded above, and the fix is what makes both pass rather than one.

Evidence: `baselines/cat5-l1rd3-video-{loaded,empty,empty-control}.json`.
**sampled-out: (none)** — Video only, this is a per-surface close.
Still open for gate 495: **Video category 7** (drag disagrees across repeats; heavy leg
refuses `Video load never armed`).

## 2026-09-03 — Video — 80/80 — commit `e54cdd9d` (instrument) + this entry

**Category 7 goes VOID → PASS 10/10, and with it Video completes 8 of 8. Gate 495 closes.**
Both of the previous entry's VOID legs are answered, and neither was a Video defect: one was
three instrument bugs in a row and the other was the DESK the surface was standing on.

State driven: the Media Center Video page with the same real library item still selected —
`JoJo no Kimyou na Bouken - Ougon no Kaze 38 RAW`, `.media-substatus` reading "Loaded 486
subtitle lines.", 7 `.mc-media-tile`s, the advanced inspector disclosure present, page
scroller `main.mc-content` with 563 px of overflow. Window 1080×700, presentation standard.
Restart before main-process measurement: not required — `/health` availability is read by the
perf probe against a process well past its two-minute settle, and the runner refuses otherwise.
Instrument: `probes/cat7-perf.cjs --surface video --under-load`. **Zero new probes** (RULE 1).

**SCENE, first, because it is the finding.** `fwins 2` / `fwinElements 361` /
`documentElements 490` / viewport 1264×821 / dpr 1 / heap 332 MB. The desk was **7,772
elements** when this turn opened: a `.seanime-host` media workspace (7,284 elements,
`position: fixed; inset: 0`) was mounted over the whole viewport, so the Video window was
being measured through a full-screen overlay. Closed through its own `.seanime-host-close`
button; 7,772 → 490. The previous turn's handoff recorded no host, so this was not its state.

| # | Category | Score | Number measured | Negative control (must have failed) |
| - | -------- | ----- | --------------- | ----------------------------------- |
| 7 | Performance under real load | **10/10** | ceiling p50 **16.7** / p95 16.9 / max 18.3, over100 **0**, across 3 runs of 110 frames. drag p50 16.7 / p95 16.8 / max **19.5**, over100 **0**, repeats 19.5 and 18.3 — **stable**. resize max 19.2 / 33.4, over100 **0**. theme max 33.4 / 35.3 against a theme-control max of 33.5, over100 **0**. Main availability under the surface's heaviest real work: **98 samples over 3,015 ms, p50 2.2 ms, p95 3.5 ms, max 7.9 ms** against a 500 ms bar. UNDER LOAD (L11 b3's actual question): drag max **33.5**, over100 **0**, `sceneStable true`, `workDuring` **40** real ticks. | `--jank` fired: 12 frames over 100 ms and p95 **117.0** against the clean run's **0** and 16.8. Heavy proof: `cycled 40 disclosures (20 open / 20 closed) over 7 tiles and 563 px of ancestor:main.mc-content, restored` — a receipt, not an arm count |

**Leg one — "heavy leg refuses `Video load never armed`" was three instrument defects in a
chain, none of them the surface's.** Fixed and committed at `e54cdd9d` before anything was
scored. (a) `tools/liquid-perf-probe.ps1:88` fed inline JS to `Join-Path`, which normalises `/`
to `\` and then THROWS; any expression carrying a regex literal or a `//` comment killed the
whole run before one sample. (b) the spec looked for its scroller INSIDE `.mc-video-page`, and
nothing inside it scrolls — `.mc-video-empty` is scrollHeight 422 / clientHeight 422 and every
other descendant is 0 — so the arm returned REFUSE before writing its receipt and the proof one
layer up blamed the surface for the instrument's own miss. The scroller resolves outward now
and names itself in the receipt. (c) both under-load legs then VOIDed `0 cycle(s)`, correction
33's by-construction failure, because the spec declared no `progress`; ten specs now do.

**Leg two — "drag disagrees across repeats (BREACH, clean, clean, BREACH, clean)" is a
DOSE-RESPONSE ON THE DESK, and it is recorded here rather than smoothed away.** Same window,
same gesture, same surface, same session; only the number of other open windows changed:

| documentElements | windows open | drag frame max (ms) | over 100 |
| ---------------- | ------------ | ------------------- | -------- |
| 490 | Dictionary, Video | 19.5, 18.3 | 0 |
| 766 | + Settings | 50.2, 50.2, 50.1 | 0 |
| 968 | + Calendar, Statistics | 83.5, 66.9, 66.9 | 0 |
| 1,184 (previous entry's scene) | Video, Settings | 100.2, 83.4, 83.7, 100.3, 83.5 | 1, 0, 0, 1, 0 |

Monotone, and repeatable in both directions — the effect was reproduced on demand by opening
windows and removed by closing them. **The idle ceiling does NOT move with it**: 19.0 / 18.3 /
18.1 at 968 elements against 18.3 at 490, so this is not a slower machine or a heavier page, it
is the shell's drag path costing more per frame the more window elements the desk holds. At the
previous entry's scene that cost sat astride the 100 ms bar, so a ±0.3 ms wobble flipped the
verdict from reading to reading — which is exactly the "BREACH, clean, clean, BREACH, clean"
the leg reported, and why it was right to refuse to score it.

**So the 10/10 is scene-conditional, and this says so in its own entry.** Video meets the bar
at 2-, 3- and 5-window desks with 0 frames over 100 in every one; at ~1,184 open-window
elements the same gesture breaches. That is not withdrawn or explained away. It is also not
Video's: what it names is the shell's window-drag path, and the fair comparison is Game Arena,
which passed at **5,070** documentElements with drag max 33.3 — a much larger desk and a much
smaller hitch. Video's drag therefore starts from a higher base than the other sampled
surfaces even though it is well inside the bar. **Recorded as an open observation against the
shell's drag path, with the four dose points above as its evidence, for whoever takes L11's
performance work.** It is not a cat7 failure for this surface at the scene measured.

Evidence: `baselines/cat7-video-perf.json`.
**sampled-out: (none)** — Video only, this is a per-surface close.
**VIDEO IS 80/80**: cat 1, 2, 3, 4, 6, 8 at `d337f958`; cat 5 at `522022dc` (both stage
states); cat 7 here. Dictionary is 80/80 at `c97b864d`. **Gate 495 — "the layout studies score
80/80 against Video and Dictionary" — is CLOSED on both named surfaces**, so L1's four bullets
close with it.

## 2026-09-03 · primary — THE PLAN IS NOT FINISHED. **5 of 25 surfaces at 80/80**, and the other 20 have no entry at all

The previous handoff asked this turn to settle whether the Liquid plan is finished, since all
**52 timeline bullets** are closed (`grep -oE 'status: (closed|open|unknown)'` at `e5905467` →
52 closed / 0 open / 0 unknown). **Bullets closed is not the plan's gate.** §12 "Definition of
done" is, and it names the scorecard directly: *"every migrated surface holds a committed 80/80
scorecard in `LIQUID_SCORECARD.md`"* and, first bullet, *"every current desktop app and
supported internal suite has a rubric-approved (80/80) standard and Liquid presentation"*.

**Method, so the next worker can re-run it rather than quote me.** Denominator: the 25 members
of `DESKTOP_WIN_SECTIONS` (`src/shared/desktop.ts:23`), read out of the source, not counted by
hand. Numerator: for each section, every `^## ` heading in this file that names it (with the
aliases the entries actually use — `Game Arena`→`games`, `Statistics`→`stats`), resolved by its
**LAST** heading, because this file is append-only and a surface scored 40/80 early and 80/80
later reads as both. The raw `X/80` histogram is not the answer and misleads: 23 `80/80`
mentions across 1,577 lines, but most are prose inside per-category entries, and `79/80` is the
rubric's own sentence about what does not count as a pass.

| resolved by last heading | sections |
| - | - |
| **80/80** (5) | `dictionary` (L1331, `70626d66`), `video` (L1507, `e54cdd9d`), `games` (L707, `b6e55253`), `settings` (L925), `youtube` (L1285) |
| **no entry at all** (20) | `agent` `library` `novels` `grammar` `translate` `player` `music` `anki` `flashcards` `stats` `resources` `note` `visualizer` `musicwidget` `city` `immersion` `calendar` `reading` `scraper` `files` |

Zero sections resolve to a partial score — a section either finished 80/80 or was never opened.
So the shortfall is not repair work on scored surfaces; it is **20 unscored surfaces**.

**Two corrections to what a reader of this file would otherwise conclude.**

1. **`games` really is 80/80, despite the plan saying otherwise in two places.**
   `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` carries *"Finding 2026-08-28 (Games category 4) —
   stays 30/80"* and *"Progress 2026-08-28 (Games category 4, compact half) — stays 30/80"*.
   Both are **superseded, not contradictory**: `b6e55253` is dated 2026-08-28 **19:40:53 -0400**
   and closes category 4 at 10/10 with the injected-clip control moving 0→1→0. The plan is a
   chronological LOG, so the same surface reads 30/80 earlier in the file and 80/80 later. Do
   not reopen Games on the strength of those two paragraphs.

2. **`visualizer`, `musicwidget` and `city` cannot reach 80/80 in the shape the other 22 did,
   and that is already a measured product fact rather than a gap.** L12's certification matrix
   (`l12-matrix-normal.json`) records all 39 of its uncaptured cells as exactly these three
   sections × 13 themes × liquid, because **they offer no presentation toggle of their own** —
   so "standard AND Liquid presentation", §12's first bullet, has no second half to score on
   them. `city` has since become the fifth Liquid host (`2b5a73cf`), which moves it into the
   scorable set and leaves **two**. Whoever scores them must either score the standard
   presentation alone and say so in the entry, or record the missing toggle as the finding —
   **not** silently score 8 categories on one presentation and call it 80/80.

**So the honest denominator for the remaining work is 20 surfaces, of which 18 are scorable in
both presentations today.** That is the remaining Liquid work, and it is stated here rather than
in a handoff so it survives the next hop.

## 2026-09-03 · primary — Resources and Calendar take category 1, both at a controlled 10/10 — and the second 10 is the finding

RULE C's pair, chosen by measurement rather than taste. Every unscored section was opened
from the real Start menu and counted: `resources` **937 elements / 78 controls** is the
densest of the twenty, and `calendar` is the most different shape on the desk — a date grid,
which §2.3 names by name as dense work that must stay on a stable anchor. (`stats` 61/6,
`calendar` 171/14, `flashcards` 190/52, `grammar` 208/59, `novels` 233/41.)
**sampled-out: `agent` `library` `novels` `grammar` `translate` `player` `music` `anki`
`flashcards` `stats` `immersion` `reading` `scraper` `files` `note` `city` `visualizer`
`musicwidget`** — eighteen, named, not silently truncated.

Instrument: `probes/cat1-accessibility.cjs`, unchanged, `--win 1`. **Zero new probes** (RULE 1).
Standard presentation, 820×580, one floating window on the desk.

| # | Category | Surface | Score | Number measured | Negative control (failed as required) |
| - | -------- | ------- | ----- | --------------- | ------------------------------------- |
| 1 | Accessibility | Resources | **10/10** | 246 text records, min **5.35:1** (`span "11 links" 11.5px`), 0 failing, 0 unmeasurable; 64 controls, **0 unreachable**; 0 WCAG 2.5.8 fails; smallest target 24 px (`fwin-b`, which `.lq-hit` carries to the floor — 0 below floor by hit); motion 54 → **0** → 54 under emulation; 0 occluded of 78 measured | counts `0/5/0/0/0` → `2/7/2/1/2`, all five bars moved, `backToBaseline: true`, `rectDrift: 0` |
| 1 | Accessibility | Calendar | **10/10** | 67 text records, min **5.35:1** (`div.cal-month-daynum "30" 12px`), 0 failing; 14 controls, **0 unreachable**; 0 WCAG 2.5.8 fails; motion 9 → **0** → 9; 0 occluded | same shape: `0/5/0/0/0` → `2/7/2/1/2`, restored, `rectDrift: 0` |

Evidence: `baselines/cat1-resources.json`, `cat1-resources-control.json`,
`cat1-calendar.json`, `cat1-calendar-after.json`, `cat1-calendar-control.json`.

**CALENDAR SCORED 10/10 BEFORE THE FIXES TOO, AND THAT IS THE POINT.** Two real
accessibility defects were sitting on the surface while the category-1 harness called it
clean, because the harness enumerates `button,a,input,select,[tabindex]` and neither defect
is in that set:

1. **`e077fdd6` — the month grid had no keyboard route to a day.** All 42 cells carried
   `onDoubleClick={() => openNew(key)}` on a bare `<div>`: no role, no `tabIndex`, no key
   handler, `cursor: auto`. Week and Day each ship a real button for the same action; Month
   did not. Now `role="grid"` + **one** tab stop + `aria-activedescendant`, the repo's own
   `DeckWorkbenchBrowser` pattern — 42 focusable cells would have traded a category-1 failure
   for a category-2 one. Driven live through `/key`: Right ×3 moved 2026-09-03 → 09-06, Down
   → 09-13, Enter opened New event dated **2026-09-13**. Layout unchanged and proven so: 42
   cells, 7 distinct X, 6 distinct Y, cell 99 px = (728 − 36)/7 exactly; forcing the
   `display: contents` rows to `block` moved columns 7 → 6 and the grid 607 → 644 px, then
   restored with zero style residue.
2. **`1dffda14` — the event modal was a div that Escape did not close.** Measured before
   touching it: Escape through `/key` left `modal: true`. No `role`, no `aria-modal`, no
   label. Now a labelled `role="dialog"` that Escape closes — verified live, `modal: false`,
   no event created — with the handler on the window and skipping an already-`defaultPrevented`
   Escape so a native `<select>` popup keeps eating its own first.

**So the honest reading of these two rows is: category 1 is a controlled 10/10 on both
surfaces, and on Calendar that 10 became TRUE this turn rather than staying true.** A
category score that does not move across a repair is normally a sign the repair was
unnecessary; here it is a sign the instrument is blind to a whole class — a control that
exists only as a mouse gesture. Recorded as an open instrument gap for whoever next touches
`cat1-accessibility.cjs`: its control set cannot see `onDoubleClick`/`onClick` handlers on
elements with no role and no `tabIndex`, and adding that would re-open, not re-confirm,
surfaces already scored.

**Two first-run overlays block any run on this app profile and are not defects.** The
2026-09-03 restart lost `localStorage`, so a full-viewport `div.consent` ("Put your country
on the map?", z-index 40000) and an 8-step `.tour-bubble` were both up. The first VOIDed a
run at *"6 of 6 controls occluded"* and the second at *"28 of 64"* — neither names an overlay,
so both read as a layout defect. **Decline the consent (it is the option that makes no
network request) and Skip tour, then re-run.**

**AND THE TRAP THAT COST THE MOST THIS TURN: drive the app only in a FOCUSED window.**
Clicking a Start-menu app tile in the unfocused window 1 returned `clicked`, closed the menu
(so `open()` demonstrably ran) and opened **nothing**, repeatably, across `anki`, `stats`,
`grammar` and `library`. It is renderer throttling in an occluded window, not a dead control
— `/focus`'s own comment in `main/debugBridge.ts` says Chromium throttles `rAF` there. One
`POST /focus {window:1}` and every one of them opened first try. A worker who does not know
this will file the Start menu as broken.

## 2026-09-03 · primary — Resources and Calendar take categories 3 and 4, all four at a controlled 10/10 — and a SECOND desktop window silently falsifies the numbers

Same RULE C pair as the category-1 entry above, same reason, same eighteen
**sampled-out: `agent` `library` `novels` `grammar` `translate` `player` `music` `anki`
`flashcards` `stats` `immersion` `reading` `scraper` `files` `note` `city` `visualizer`
`musicwidget`**. Instruments: `probes/cat3-liquid-utilization.cjs` and
`probes/cat4-use-of-space.cjs`, both `--win 1 --control`, **zero new probes** (RULE 1).
Category 3 was driven with `--presentation liquid` (a Standard window is *supposed* to be
opaque, so scoring one as-is is the harness scoring the wrong thing); category 4 in the
as-found Standard, which is the product default.

| # | Category | Surface | Score | Number measured | Negative control (failed as required) |
| - | -------- | ------- | ----- | --------------- | ------------------------------------- |
| 3 | Liquid utilization | Calendar | **10/10** | 9 regions — Work 1, Liquid-eligible 2, Anchor 5, Anchor(holds work) 1, Ambient 0; **denseWorkOnTranslucent 0**; liquid-treated eligible **2/2**, all 2 backed by a shared primitive; window paint alpha 0.72, `blur(8px) saturate(1.25)` | one-region blur AND all-glass: Work failures `0 → 1 → 0` and `0 → all → 0`, both materials returned (`none\|rgb(26,24,35)` before and after) |
| 3 | Liquid utilization | Resources | **10/10** | 244 regions — Work 10, Liquid-eligible 1, Anchor 210, Anchor(holds work) 11, Ambient 12; **denseWorkOnTranslucent 0**; eligible **1/1** and shared-primitive-backed | same two falsifications, `CONTROL FAILED AS REQUIRED` |
| 4 | Use of space | Calendar | **10/10** | 3 of 3 sizes. default 820×580 · maximized 1264×773 · compact 260×170; clipped **0**, overlaps **0**, horizontal scrollers **0**, hidden overflow-x **0** at every size; dead region **5.4 / 9.8 / 0.9 %**; chrome **17.8 → 13.7 %** and canvas **93.7 → 95.3 %** default→maximized; all three legs restored | injected clip `0 → 1 → 0` and `backToBaseline`; art-plate and backdrop exclusions both `removalProven`; sub-minimum 200×140 stays 0/0/0/0 |
| 4 | Use of space | Resources | **10/10** | same three sizes; 0/0/0/0 at each; dead region **4.7 / 6.7 / 0.8 %** (largest empty box 327×150 default, 757×92 maximized); chrome **5.7 → 4.3 %**, canvas **93.7 → 95.3 %**; all restored | identical control set, all proven |

Evidence: `debug/_pri-cat3-cal.json`, `_pri-cat3-res.json`, `_pri-cat4-cal2.json`,
`_pri-cat4-res.json`. Calendar's category-4 run is the one taken AFTER `dbf58818`, so the
scored build is the committed one.

**THE FINDING IS NOT IN THE TABLE. A SECOND DESKTOP WINDOW ON THE SAME DESK MAKES THE
PRODUCT DROP THE USER'S CLICKS, AND MADE THIS CATEGORY SCORE FAIL.** The app was found with
two desktop renderers open — window 1 at `localhost:5173/` and window 2 at
`?desk=0&displayKey=display|1920x1080|1`, both rendering **desk 0** and both holding the same
`calendar` window. Under that condition category 4 returned **FAIL** twice, on
`restored` and then on `contentGrowsNotChrome`, with default chrome reading **5.7 %** —
`.fwin-bar` alone, `header.lq-contextual`'s 728×79 missing from a set the same run listed it
in. Closing window 2 changed nothing else and the surface scored **10/10** with chrome 17.8 %.

The controlled measurement, because a differing score is not yet evidence of a cause. Six
clicks on the window's own Maximize control, 2 s apart, state read before and after each:

| condition | trials | clicks that changed the window |
| --------- | ------ | ------------------------------ |
| two desktop windows on desk 0 | 6 | **2** (`norm→norm`, `norm→MAX`, `MAX→MAX`, `MAX→MAX`, `MAX→norm`, `norm→norm`) |
| window 2 closed, nothing else changed | 6 | **6**, alternating perfectly |

It is not the bridge and not throttling: a `click` listener on the button and a capturing one
on `document` both fired on **every** trial including the dead ones, `document.hasFocus()` was
true and `/health` reported window 1 focused, and a fresh `POST /reload` did not clear it (2 of
the first 4 post-reload clicks were still dead). It is not `.click()` versus a real pointer
either — the same no-ops hit the Liquid toggle and the `os:window` `togglePresentation`
command. A `MutationObserver` caught the mechanism directly: **one** click produced
`fwin-max` off at t+6 ms and back on at t+131 ms, and `style.zIndex` went `20 → 18` — a
*decrease*, i.e. a second write restoring an older snapshot. `DesktopShell` recognises its own
layout echo by **signature** (`committedSignatures`, a 16-deep ring), not by origin, so a
second renderer — which re-fits geometry for its own `displayKey` before committing — produces
signatures this one never wrote and hydrates over the top of it.

Not repaired here, and that is a decision rather than an omission: the fix is per-display
layout convergence in the desktop shell, which is the most load-bearing surface in the app,
and it is not a Liquid defect. **What every later worker needs is the operating rule: score
with exactly one desktop window open, and check `/health` for a second one before believing
any FAIL.** Two of the three FAILs seen this turn were fabricated by it.

**`dbf58818` — the Maximize control never said which way it points.** Found while chasing the
above. Maximized, it still read `title="Maximize"`, carried no `aria-label` and no
`aria-pressed`, and drew the same glyph; the Liquid toggle three buttons up has swapped all
three since L3. Now `Maximize`/`Restore down` (`desktop.restoreDown`, added en/ja/zh/ru,
`i18n-check` 12,260 keys exit 0), `aria-pressed` carrying the state, `▢`/`❐`. Verified live in
both directions after a reload. It also forced correction 26 in `cat4-use-of-space.cjs`, which
matched this button by `title === 'Maximize'` — the English string, and the one the control
stops carrying the instant it is maximized, so the restore leg would have found nothing and
left every scored window maximized. It now matches the state affordance instead.

## 2026-09-03 · primary — Resources and Calendar take category 2, both at a controlled 10/10, in BOTH presentations

Same RULE C pair, same eighteen sampled-out sections as the two entries above. Instrument:
`probes/cat2-clunkiness.cjs`, unchanged, `--win 1 --control --both-presentations`. Zero new
probes. `--both-presentations` is what makes `costParity` a measurement instead of an
`UNMEASURED`: it drives the identical task twice in the same window at the same geometry,
once Standard and once Liquid, and asserts the presentation and the box came back.

| # | Category | Surface | Score | Number measured | Negative control (failed as required) |
| - | -------- | ------- | ----- | --------------- | ------------------------------------- |
| 2 | Clunkiness | Resources | **10/10** | task `type:.gram-search=yomi` over 51 cards / 257 text runs / 64 controls: **4 keystrokes, 0 clicks**; dead ends **0**; modal traps **0**; scroll traps **0**; worst renderer-side ack **43.5 ms**, **0 over the 100 ms bar** (4 samples: 50.4/20.4/9.1/5.1 on the first pass); idle churn none in either phase; undo `clear:` round-tripped the text hash `s1hb05 → s1hb05` | planted dead end / modal trap / scroll trap `0,0,0 → 1,1,1 → 0,0,0`, `backToBaseline: true`; inert-click floor 0.3 ms |
| 2 | Clunkiness | Calendar | **10/10** | task `click:.cal-mode-btn:not(.active)` (Month → Week): **1 click, 0 keystrokes**; dead ends **0**; modal traps **0**; scroll traps **0**; worst ack **11.1 ms**, **0 over bar** | same three plants, same `0,0,0 → 1,1,1 → 0,0,0`, restored |

costParity, read rather than asserted — same window, same 820×580 box, same task:
Resources Standard **4** vs Liquid **4** (worst ack 43.5 / 47.8 ms); Calendar Standard **1**
vs Liquid **1** (11.1 / 6.3 ms). Liquid costs no extra input on either, and both windows came
back to `presentation: standard`, `aria-pressed: false`, `820x580`.

Evidence: `debug/_pri-cat2-res.json`, `_pri-cat2-cal.json`.

**TRAP, and it cost a run: this harness VOIDs on a surface the PREVIOUS run left dirty.**
`VOID - undo did not restore the surface: baseHash 2td9na afterHash s1hb05` — the base hash was
taken with `yomi` still in the search field from an earlier leg, so the undo restored the
surface to its true empty state and the round trip read as a failure. Reset the surface before
re-running, not after. And note `--out` is written only on a scoring exit: an `exit 3` VOID
leaves the PREVIOUS run's JSON on disk, which reads exactly like a fresh result (`ls -la` the
mtime, or delete the file first).

**Running total for this pair: categories 1, 2, 3 and 4 all at a controlled 10/10 — 4 of 8.**
Remaining for these two surfaces: 5 (UI clarity), 6 (feature parity and reversibility),
7 (performance under real load), 8 (honest states).

## 2026-09-03 · primary — Calendar — 80/80 — commit `9b5b437f`

The four categories the previous entries left open (5, 6, 7, 8), all driven this turn against
the current tree, all controlled. With categories 1–4 from the three entries above, `calendar`
is the **sixth** of the 25 `DESKTOP_WIN_SECTIONS` to reach 80/80. Zero new probes (RULE 1);
the only instrument change is correction 37 below, in the existing category-8 harness.

**sampled-out (RULE C), unchanged from the entries above:** `agent` `library` `novels`
`grammar` `translate` `player` `music` `anki` `flashcards` `stats` `immersion` `reading`
`scraper` `files` `note` `city` `visualizer` `musicwidget`.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 5 | UI clarity | **10/10** | Q1 entry points **2** (`New event`, `Month`), 0 primary inputs; Q2 location `Calendar` + **1** way back; Q3 primary action inside the body viewport at rest, explicitly marked; Q4 **1** collapsed disclosure, **8** controls scanned against a bar of 12; Q5 **67** text runs measured in both themes, **0** failing, min **5.35** (study-os) vs **5.71** (classic-light) and the axis moved; Q7/Q8/Q9 read from this turn's own category-6 baseline, not August's | 37 controls painted vs 14 at rest; **Q2, Q3, Q4, Q5 and Q10 all went NO** — blanked title, primary action translated 4000 px down, a 1.07:1 span, and 6 uniform cards with 6 different control signatures |
| 6 | Feature parity + reversibility | **10/10** | ledger **5/5 reachable in standard, 5/5 in Liquid**, `na` 0, rows agree, nothing only-in-one; round trip `standard → liquid → standard` with **0** diffs, shell held, other-presentation box 820×580 (no editable text field on this surface, stated rather than skipped) | **5 of 5** mutations armed; each felled **exactly its own row** (`4/5` reachable), no unexpected row moved, every one restored to `5/5` |
| 7 | Performance under real load | **10/10** | ceiling p50 **8.3** / p95 **8.5** ms over 3 runs, noise floor 0 over 100 ms; drag **8.3 / 8.9 / 74.9** max, resize **8.3 / 8.6 / 58.5**, theme swap **8.3 / 8.6 / 58.4** — **0 frames over 100 ms in every leg**; the heavy leg cycled **56 views (14/14/14/14)** and restored mode 0, main-loop p50 **2.2** vs idle **1.9** ms, worst **10.2** vs a 500 ms bar; main RSS **383.6 → 342.1 MB** across the run | `--jank`: the same drag with 120 ms renderer blocks moved p95 **8.9 → 116.7 ms** and frames over 100 ms **0 → 10**. The recorder sees what it claims to |
| 8 | Honest states | **10/10** | raw i18n keys **0**, placeholders **0**, mute pairs **0** (61 text runs); states **1 of 1 observable** — Agenda drives the empty state to **3** hosts reading “Nothing today.” / “Nothing on the horizon.”, and `loading`/`error`/`offline` are `notObservable` and excluded rather than passed; four languages give **4 distinct text hashes**, **10 of 61** runs move (16.4 %), max raw keys in any language **0** | rawKeys/placeholders/mutePairs **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true` |

Evidence: `baselines/cat5-l7-calendar.json` + `-control.json`, `cat6-l7-calendar.json`,
`cat7-calendar-perf.json`, `cat8-l7-calendar.json`, all rewritten this turn from the runs above.
The August files they replace were taken before `e077fdd6`, `1dffda14` and `dbf58818`, all three
of which changed this surface or its window chrome today, so they described a build that no
longer exists.

**CORRECTION 37 in `cat8-honest-states.cjs`, and it VOIDed this cell twice before it was read
rather than assumed. AN ABSENT `ui-lang` IS ENGLISH.** `renderer/i18n.ts:26` `readStored()`
falls back to `DEFAULT_LANG` when the key is missing, and the product writes the key only on a
real change — so on a profile whose `localStorage` has been wiped (a dev-app restart did exactly
that here on 2026-09-03), the leg's **first** tag `en` clicks an already-active control, nothing
is written, and the guard fired `language did not take: asked en, storage says null` on a leg
that had in fact landed. The guard is not relaxed — correction 14's point is that it catches a
click that hit the wrong control — it is re-based on what the app renders: the **effective**
language (stored, or the default when absent) **and** the `lang` attribute `applyLangAttribute`
stamps on `<html>` must both agree with the tag asked for. The second half is the restore: the
leg must put back the **absence** of the key too, or it VOIDs itself on its own residue
(`before {stored:null}` vs `after {stored:"en"}`, which is the same effective state and a
different profile). Both halves proven live: the key was deleted, the run was repeated from
`ui-lang: null`, all four tags landed, and the key read `null` again afterwards.

**Running total: 6 of 25 sections at 80/80** — `dictionary`, `video`, `games`, `settings`,
`youtube`, `calendar`. Resources is at 4 of 8 and is the next to close.

## 2026-09-03 · primary — Resources — 80/80 — commit `cefc1b49`

The same four categories, same instruments, same turn, on the other half of the RULE C pair.
With categories 1–4 from the three entries above, `resources` is the **seventh** of the 25
`DESKTOP_WIN_SECTIONS` at 80/80. Zero new probes. Scene: exactly one desktop window and, for
the category-7 run, exactly one floating window — the operating rule the previous entry's
finding produced.

**sampled-out (RULE C):** the same eighteen sections listed in the Calendar entry above.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 5 | UI clarity | **10/10** | Q1 **2** entry points (`All`, `.gram-search`); Q2 location `Resources` + **1** way back; Q3 primary action inside the body viewport at rest; Q4 **1** collapsed disclosure, **10** controls scanned against a bar of 12; Q5 **246** text runs in both themes, **0** failing, min **5.35** (study-os, “11 links” on a bundle card) vs **5.17** (classic-light, “Pearl”) and the axis moved; Q6 **1** Liquid region by contextual paint, 0 infinite animations; Q10 5 identity markers, `res:139` bespoke prefix — not a generic dashboard; body scroll top **0**, so “at rest” means at rest | 65 controls painted vs 32 in the Q4 plant; **Q2, Q3, Q4, Q5 and Q10 all went NO** |
| 6 | Feature parity + reversibility | **10/10** | ledger **8/8 reachable in standard, 8/8 in Liquid**, `na` 0, rows agree, nothing only-in-one; round trip `standard → liquid → standard` with **0** diffs — and this surface **has** an editable field, so the trip carried a dirtied `gram-search` and `fieldsHeld` is a measurement rather than a stated absence | **8 of 8** mutations armed, each felled exactly its own row, each restored |
| 7 | Performance under real load | **10/10** | ceiling p50 **8.3** / p95 **8.5** ms over 3 runs, noise floor 0 over 100 ms; drag **8.3 / 8.6 / 12.0** max with **0 frames over 16 ms**, resize **8.3 / 16.7 / 25.1** (6 over 16, **0 over 33**), theme swap **8.3 / 8.7 / 25.0** — **0 over 100 ms in every leg**; the heavy leg cycled **44 filters (22 category / 22 landing)** and restored chip 0, main-loop p50 **2.2** vs idle **1.9** ms, worst **8.9** against a 500 ms bar; main RSS **88.9 → 87.4 MB** | `--jank`: drag p95 **8.6 → 116.6 ms**, frames over 100 ms **0 → 10** |
| 8 | Honest states | **10/10** | raw i18n keys **0**, placeholders **0**, mute pairs **0** across **256** text runs; states **1 of 1 observable** — typing `zzzznomatch` into `.gram-search` renders “No resources match your search.” in 1 host, 0 unpainted, and the field restored to empty; four languages give **4 distinct text hashes**, **32 of 256** runs move (12.5 %), max raw keys in any language **0** | rawKeys/placeholders/mutePairs **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true` |

Evidence: `baselines/cat5-l8-resources.json` + `-control.json`, `cat6-l8-resources.json`,
`cat7-l8-resources.json`, `cat8-l8-resources.json`, all rewritten this turn.

**Correction 37's absent-key restore proved itself here rather than in the run that motivated
it.** This cell's language leg started from `ui-lang: null` and ended at `ui-lang: null` —
`before`/`after` both `{html:'en', stored:null}`, `restored: true` — which is the byte-identical
restore the repo's persisted-setting rule asks for and which the pre-correction leg could not
produce. See the Calendar entry for the reasoning.

**TRAP, new this turn: `cat8-honest-states.cjs --control` can crash node ON EXIT after writing
its result.** The Resources control run ended `Assertion failed: !(handle->flags &
UV_HANDLE_CLOSING), file src\win\async.c, line 94` — a libuv teardown assertion in the *probe
process*, not the app. `/health` was clean immediately after and `--out` had already been
written in full. Read the file's mtime before concluding a control did not run; the run itself
was valid and its counts are the ones in the table.

**Running total: 7 of 25 sections at 80/80** — `dictionary`, `video`, `games`, `settings`,
`youtube`, `calendar`, `resources`. **18 left**, of which 17 are scorable in both presentations
(`visualizer` and `musicwidget` offer no presentation toggle; `city` became scorable at
`2b5a73cf`).

## 2026-09-03 · primary — Flashcards: category 1 closes at 10/10, category 8 scored to an honest FAIL and then repaired

Not an 80/80 entry. Flashcards was opened as the next surface after the pair above and two of
its eight categories were driven before the turn ran out; the other six are the next slice.
It is recorded here rather than in a handoff because one of the two found a real product
defect and the repair shipped in `8be691be`.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 1 | Accessibility | **10/10** | **101** text runs measured, 0 unmeasurable, **0 failing**, min **5.33** (`Check for new voices`, 13.3 px); 47 targets, **0** WCAG 2.5.8 failures — the 24 under 32 px are `input`s whose nearest interactive neighbour is 36 px away, and the smallest painted hit box is **32×32.5** with 0 stolen and 0 occluded; keyboard **47/47 reachable**, 0 focus hosts; motion 15 declarations over the threshold at rest, **0** under emulated `prefers-reduced-motion`, emulation taken and released | 6 axes planted, **all 6 moved** (contrast, targets by pointer, targets by rect, WCAG 2.5.8, keyboard, and the narrowness of the decorative exemption); counts `0,24,0,0,0 → 2,26,2,1,2 → 0,24,0,0`, rect drift 0 |
| 8 | Honest states | **FAIL, then 10/10 on the repaired build** | raw keys **0**, placeholders **0**, 101 text runs, empty state named in 2 hosts (“Mine cards in EPUB mining to fill this strip.”, “No cards in this view…”) — but **mutePairCount 5 of 10 disabled controls** | control `0,0,0 → 1,1,1 → 0,0,0`, `backToBaseline: true` |

**THE FINDING, and it is the reason category 8 exists.** On an empty profile this window paints
**10** disabled controls. Five of them said nothing at all about what would enable them:
`Review dictionary`, `Convert 0 scheduled cards now`, `Reset all scheduling`, `Add audio to 0
cards`, `Start review`. No `title`, no `aria-describedby`, and nothing beside them but other
buttons' captions — which correction 11 in this harness correctly refuses to read as an
explanation, because a row of six disabled buttons would otherwise explain each other.

Repaired in `8be691be`: each now points `aria-describedby` at a **rendered** hint that names the
condition, in en/ja/zh/ru. Rendered rather than a `title`, deliberately — pointer events are
suppressed on a disabled button, so a `title` there is not reliably shown at all and would have
been a fix only the probe could see. Re-measured on the live build: **mutePairCount 5 → 0 with
`disabledTotal` unchanged at 10**. The controls are still correctly disabled; they just say why.
Pinned by one new case in `schedulingPanel.test.tsx` asserting the *resolved text* of the
describedby target and its disappearance once a card is scheduled — an `aria-describedby`
pointing at nothing is the same silence with extra markup — with a mutation control that turned
it red for the intended reason.

Category 8's `languagesDiffer` bar is still UNMEASURED on this surface: the `--langs` leg needs
the Settings `ui-language` card painted, and that run is part of the next slice rather than
something to claim now.

**sampled-out for this bullet:** unchanged from the two entries above, minus `flashcards`.
**Running total: still 7 of 25 sections at 80/80.** Flashcards is 2 of 8.

## 2026-09-03 · primary — Flashcards — 80/80 — commit `ade42136` (+ `91bf8708`, `4b0772e0`)

The six categories the previous entry left open (2, 3, 4, 5, 6, 7), plus a re-derivation of
1 and 8 on the repaired build — the three fixes below changed this surface's layout and its
resting control count, so August's and this morning's numbers describe a build that no longer
exists. `flashcards` is the **eighth** of the 25 `DESKTOP_WIN_SECTIONS` at 80/80. Zero new
probes (RULE 1); the one new file is a deck FIXTURE (`debug/_pri-fcseed.cjs`, gitignored),
not an instrument.

**THE DECK HAD TO BE REAL, and that is the entry's first finding.** The 2026-09-03 dev-app
restart wiped this profile's `localStorage`, so `jp-flashcard-deck` was ABSENT. Category 6 on
that profile returned **4/8** with four rows reading "no book groups rendered" / "no card rows
rendered" — an empty harness, which the rubric caps at 0, not a product failure. Seeded through
`addDeckCards` (the miners' own call), measured, then removed through `removeDeckCards` with the
raw value restored to its captured state; `--read` confirms `present:false, cards:0` afterwards.
**24 cards over 3 books was still not enough:** `virtualizedList` demands `cap < maxDeclared` and
the render window is 8 at this pane height, so 8-card groups made windowing unprovable. 20 per
group answered it. Categories 1, 2, 3, 4, 6 and 7 were measured on the seeded deck; category 5's
Q4/Q5 and category 8 were measured EMPTY, because the empty state is this surface's one
observable state and hiding it would have made `statesNamed` UNMEASURED.

**sampled-out (RULE C), unchanged from the Calendar/Resources entries, minus `flashcards`:**
`agent` `library` `novels` `grammar` `translate` `player` `music` `anki` `stats` `immersion`
`reading` `scraper` `files` `note` `city` `visualizer` `musicwidget`.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 1 | Accessibility | **10/10** re-derived | 600-card deck, 856 elements: **452** text runs, 0 unmeasurable, **0 failing**, min **5.05**; 135 targets, smallest 13 px `input`, 7 under 32 px but **0** WCAG 2.5.8 failures; 156 controls hit-tested, 5 below floor by rect and **0 by hit box**, smallest painted hit **32×32.5**; keyboard **135/135** reachable, 0 focus hosts; motion **75** declarations over threshold at rest → **0** under emulated `prefers-reduced-motion`, emulation taken and released | 6 axes planted, **all 6 moved** (`0,7,0,0,0 → 2,9,2,1,86 → 0,7,0,0`), `rectDrift 0`, back to baseline |
| 2 | Clunkiness | **10/10** | 4 counted steps driven (folder chip out and back, tab switch, a typed filter), **0** dead ends, **0** scroll traps, **0** modal traps, worst click→recv **18.8 ms** and worst input→recv **73.7 ms**, **0** over the 100 ms bar; cost parity Liquid **7** = Standard **7**, geometry 820×580 both, restored | `--control`: dead end / modal trap / scroll trap **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true` |
| 3 | Liquid utilization | **10/10** | driven into Liquid and restored: `denseWorkOnTranslucent` **0**; Liquid-eligible **2/2** treated and **2/2** backed by a shared primitive; roles Work **9**, Anchor **48**, Anchor-holds-work **5**, Ambient **0** | both plants fired — blurring the first Work region, then making the whole surface glass; `oneMaterialReturned` and `allGlassReturned` true, "CONTROL FAILED AS REQUIRED" |
| 4 | Use of space | **10/10** after a repair | all three sizes ran and restored: default 820×580 dead **5.5 %**, compact 260×170 **0.7 %**, maximized 1264×773 **13.5 %** against a 15 bar; clipped **0** and horizontal scrollers / hidden-overflow-x **0** at every size | injected clip **0→1→0**; art-plate exclusion named its own plant; backdrop overlap **0→13→0**; all three `removalProven` |
| 5 | UI clarity | **10/10** after a repair | Q1 **2** entry points, 0 primary inputs; Q2 `Flashcards` + 1 way back; Q3 primary action inside the body viewport at rest, explicitly marked; Q4 **2** collapsed disclosures and **6** controls scanned against a bar of 12; Q5 **452** runs in both themes, **0** failing, min **5.07** (study-os) vs **5.71** (classic-light), axis moved; Q6 **2** Liquid regions, both carrying a transition, **0** infinite animations; Q7/Q8/Q9 from this turn's own category-6 baseline | **Q2, Q3, Q4, Q5 and Q10 all went NO** |
| 6 | Feature parity + reversibility | **10/10** | ledger **8/8 reachable in standard, 8/8 in Liquid**, `na` 0, rows agree, nothing only-in-one; round trip `standard → liquid → standard` with **0** diffs, a dirtied `flash-search-input` held, shell held, other-presentation box 820×580 | **8 of 8** mutations armed; each felled **exactly its own row**, no unexpected row moved, each restored |
| 7 | Performance under real load | **10/10** after a repair | 600-card deck: ceiling p50/p95 **8.3 / 8.5** ms over 3 runs, noise floor 0 over 100; drag **8.6**, resize **8.7**, theme **8.5** p95, **0 frames over 100 ms in every leg** and at most 1 over 16; heavy leg "scroll the whole deck" **98 samples / 3,002 ms**, main-loop p50 **2.0** and max **8.8** against a 500 ms bar | `--jank`: drag p95 **8.6 → 116.6 ms**, frames over 100 **0 → 10** |
| 8 | Honest states | **10/10**, `languagesDiffer` now MEASURED | raw keys **0**, placeholders **0**, mute pairs **0** with `disabledTotal` still **10**; states **1 of 1 observable** — the empty deck names it in **2** hosts ("Mine cards in EPUB mining to fill this strip.", "No cards in this view…"), 0 unpainted, and `loading`/`error`/`offline` are `notObservable` and excluded rather than passed; four languages give **4 distinct hashes**, **47 of 55** runs move (85.5 %), max raw keys in any language **0**, and `ui-lang` started and ended **absent** | rawKeys/placeholders/mutePairs **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true` |

Evidence: `baselines/cat{1,2,3,4,5,6,7,8}-l7-flashcards*.json` and `cat7-flashcards-perf.json`,
all rewritten this turn.

**THREE PRODUCT REPAIRS, all found by these instruments and all re-scored in their own commits.**

1. `91bf8708` — **the option panels clipped at the window minimum and wasted a maximized window.**
   `.fwin-body` scrollWidth **255** against clientWidth **248** at 260×170 with
   `overflow-x: hidden` (a `fieldset`'s UA `min-inline-size` is `min-content`); and at 1264×773
   the largest dead rectangle was **536×480 — 24.8 %** of the window, these panels' unused
   right-hand side. After: overflow gone at every size, maximized **13.5 %**, default
   **10.5 → 5.5 %**.
2. `4b0772e0` — **the overview asked a user to scan 26 controls before showing a card.** Q4's bar
   is 12. Twenty-four of the 26 were five preference panels sitting open above the deck. Folded
   behind the `<details>` this surface already uses for its specialist launchers: **26 → 6**.
3. `ade42136` — **a window resize re-rendered every mounted row because its WIDTH moved.** Resize
   p95 **33.3 ms** against an 8.5 ms ceiling, 20 frames over 16, repeated (33.3 then 33.2) —
   while drag and theme were clean at 8.6 and 8.5, which is the whole shape of it.
   `useElementSize` allocated a new `{width,height}` on every ResizeObserver callback and
   `VirtualList` reads only `height`. After: **8.7 ms**, 0 frames over 16.

**A NUMBER THAT DID NOT MOVE, and it is why (3) was found at all.** August's banked run scored
this surface 10/10 with resize p95 **33.5 ms** — one tenth of a millisecond under its bar, because
that session's ceiling was 16.8 ms and the bar is `2 ×` the ceiling. The surface has always been
this slow on resize; the machine got faster (ceiling 16.8 → 8.5) and stopped hiding it. A banked
pass on a ratio bar is only as good as the ceiling it was taken against.

**ATTRIBUTION IS WHAT MADE (3) FIXABLE, and it is worth copying.** The same 70-frame resize was
run five times in the live renderer with one subtree hidden each time: nothing hidden p95 **30.0**
/ 10 frames over 16; `.flash-group-body-vlist` hidden **8.7 / 0**; `.flash-explorer` **8.6 / 0**;
`.flash-group` **8.6 / 1**; `.flash-strip-section` **28.2 / 9** — so the card strip, the obvious
suspect, was exonerated by measurement rather than by argument. Forced synchronous layout was
~1.4 ms and main-loop max 5.7 ms, so it was never layout and never the main process.

**TRAPS, both new.** (a) `cat2-clunkiness.cjs` needs `--both-presentations` or `costParity`
returns UNMEASURED and the run exits 3 with every other bar green — it reads like a scoring
failure and is a missing flag. (b) This surface's controls sit **1,747 px down its own body**:
every `--task` step that touches the tabs, the search field or the folder chips must be preceded
by `scroll:.fwin-body=<px>`, and the folder chips do not exist on the Dictionary tab, so they
have to be driven BEFORE the tab switch. Three runs were spent discovering that.

**HONEST CONSEQUENCE OF REPAIR (2), stated rather than buried:** folding the preference panels
away drops this surface's resting painted text from 452 runs to **55**, so category 8's sweep
covers less at rest than it did this morning. That is what progressive disclosure costs an
at-rest instrument; the text is unchanged and one keystroke away, and the language leg still
moves 47 of the 55.

**Running total: 8 of 25 sections at 80/80** — `dictionary`, `video`, `games`, `settings`,
`youtube`, `calendar`, `resources`, `flashcards`. **17 left**, of which 16 are scorable in both
presentations (`visualizer` and `musicwidget` offer no presentation toggle).

## 2026-09-03 · primary — Library — 80/80 — commits `87ab9004`, `185f8fd6`, `80e87f92`

`library` is the **ninth** of the 25 `DESKTOP_WIN_SECTIONS` at 80/80, and the first half of the
RULE C pair opened for this bullet (`library` densest, `music` most different — `music` is still
open). All eight categories driven live this turn on the same window: `.fwin` "Library",
standard presentation, 820×580 at 60,24, viewport 1264×821, 24 books over 3 folders. Zero new
probes (RULE 1) — every number below comes from the eight `cat*` harnesses unchanged.

**sampled-out for this bullet:** `agent` `novels` `grammar` `translate` `player` `anki` `stats`
`immersion` `reading` `scraper` `files` `note` `city` `visualizer` `musicwidget`. `music` is the
pair's second surface and is scored next, not sampled out.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 1 | Accessibility | **10/10** after a repair | **155** text runs, 0 unmeasurable, **0 failing**, min **5.35** (`span.lib-chip-count "24"`, 11 px); 30 targets by rect, smallest `button.fwin-b` **24 px**, 23 under the 32 px floor by rect but **0** WCAG 2.5.8 failures; **36** controls hit-tested, **26** below the floor by RECT and **0 by hit box**, smallest painted hit **32×32.5**; keyboard **30/30** reachable, 0 focus hosts; motion **61** declarations over threshold at rest → **0** under emulated `prefers-reduced-motion`, emulation taken and released | 6 axes planted, all 6 moved (`0,23,0,0,0 → 2,25,2,1,2 → 0,23,0,0`), `rectDrift 0`, back to baseline |
| 2 | Clunkiness | **10/10** | 2 counted steps driven (a folder chip, then the layout switch), **0** dead ends, **0** modal traps, **0** scroll traps, worst click→recv **28 ms**, **0** over the 100 ms bar; cost parity Liquid **2** = Standard **2**, 820×580 both, restored to standard | `--control`: dead end / modal trap / scroll trap **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true`, inert click 0.6 ms |
| 3 | Liquid utilization | **10/10** | driven into Liquid and restored: `denseWorkOnTranslucent` **0** over **66** regions; Liquid-eligible **1/1** treated and **1/1** backed by a shared primitive; roles Work **3**, Anchor **56**, Anchor-holds-work **6**, Ambient **0**; the window's own paint `alpha 0.72`, `blur(8px) saturate(1.25)` | both plants fired — one region to glass, then every Work region (`allWorkFailed`); `oneMaterialReturned` and `allGlassReturned` true |
| 4 | Use of space | **10/10** after a repair | all three sizes ran and restored: default 820×580 dead **3.9 %** / dominant canvas **93.7 %**, compact 260×170 dead **0.9 %**, maximized 1264×773 dead **10.8 %** / canvas **95.3 %** against a 15 bar; clipped **0**, overlaps **0**, horizontal scrollers **0**, hidden-overflow-x **0** at every size | injected clip **0→1→0**; the art-plate exclusion named its own plant (hangs out 269 px, `clipped` did NOT rise); backdrop overlap **0→14→0**, not excused |
| 5 | UI clarity | **10/10** after a repair | all ten questions YES. Q1 **2** entry points, 0 primary inputs; Q2 a location label and a way back; Q3 the primary action inside the body viewport at rest; Q4 **7** collapsed disclosures and **6** controls scanned against a bar of 12; Q5 stable across the theme axis; Q6/Q7/Q8/Q9 from this turn's own category-6 baseline; Q10 5 identity markers against a bar of 3 | `--control` re-run AFTER the repair: **Q2, Q3, Q4, Q5 and Q10 all went NO**, planted clutter taking scanned to **28** against the bar of 12 |
| 6 | Feature parity + reversibility | **10/10** | ledger **9/9 reachable in standard, 9/9 in Liquid**, `na` 0, rows agree, nothing only-in-one; 4 drive steps (folder, sort, group, a 240 px scroll) with **0** refusals; round trip `standard → liquid → standard` with **0** diffs, shell held, other-presentation box 820×580. No editable text field on this surface, so the dirtied-field leg is recorded as N/A rather than silently skipped | **6 of 6** mutations armed; each felled **exactly its own row**, no unexpected row moved, each restored (`afterRestore 9/9`) |
| 7 | Performance under real load | **10/10** | ceiling p50/p95 **8.3 / 8.5** ms over 3 runs, noise floor **0** over 100; drag p95 **8.5** (max 16.6, 0 over 16), theme p95 **8.5** (max 16.7, 0 over 16), resize p95 **8.5** (max 75.0, 3 over 16, 2 over 33, **0 over 100**); main-loop max **12.2 / 13.8 / 10.0** ms against a 500 ms bar; heavy leg "scroll the whole library" **82 samples / 2,528 ms**, main-loop p50 **2.4** max **9.1**; idle 81 samples p50 **2.1** p95 **4.9** | `--jank`: drag p95 **8.5 → 116.7 ms**, frames over 100 **0 → 10** |
| 8 | Honest states | **10/10**, both driven bars MEASURED | raw keys **0**, placeholders **0**, mute pairs **0**; states **1 of 1 observable** — the empty `Inbox 0` folder names it in full ("This folder is empty / Use the folder button on any book to file it here, or switch back to All."), 0 unpainted, and `loading`/`error`/`offline` are `notObservable` and excluded rather than passed; four languages give **4 distinct hashes**, **48 of 167** runs move (**28.7 %**), max raw keys in any language **0**, and `ui-lang` started and ended **absent**; drive restored `Inbox 0 → All 24` | rawKeys/placeholders/mutePairs **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true` |

Evidence: `baselines/cat{1..8}-s9-library*.json`, all written this turn.

**THREE PRODUCT REPAIRS, all found by these instruments.**

1. `87ab9004` — **the manga cover-picker was the one card button with no pointer floor.**
   36 controls, 26 below 32 px by rect and exactly **one** still below it by hit box.
   After: `belowFloorByHit` **1 → 0**, smallest painted hit 32×32.5.
2. `185f8fd6` — **a 200 px label floor made the shelf 25 px wider than the window could show.**
   At 260×170 `.fwin-body` carried **273 px** of content in a **248 px** box with
   `overflow-x: hidden` — no scrollbar, no clip marker. The floor was stale: it dated from when
   `.watch-bar` was one flex row. After: `hiddenOverflowX` **1 → 0**, scrollWidth **273 → 248**.
3. `80e87f92` — **the shelf asked a user to scan 13 chips before a single cover.** Q4's bar is
   12. Ten of the 13 were the language and level refine banks sitting open above the grid; they
   now sit behind a `<details>` whose summary names whatever is filtering. **13 → 6**, and the
   disclosure count went 2 → 3.

**Two instrument notes the next surface should not rediscover.** `cat8 --langs` needs the
Settings ▸ Appearance language card actually on screen: `os:open` with detail `settings`, then
click the `.os-set-nav-item` reading "Appearance", or the leg refuses on every tag. And
`cat8 --control` still crashes node on exit (`UV_HANDLE_CLOSING`) **after** writing `--out` —
read the file, not the exit code.

**Running total: 9 of 25 sections at 80/80** — `dictionary`, `video`, `games`, `settings`,
`youtube`, `calendar`, `resources`, `flashcards`, `library`. **16 left**, of which 15 are
scorable in both presentations (`visualizer` and `musicwidget` offer no presentation toggle).

## 2026-09-03 · primary2 — Files takes its first category-1 measurement; a repair lands, the SCORE VOIDS — commit `f8503bbc`

**Not an 80/80 entry, and not a closed category.** Recorded here because the numbers are real
and the next worker should not re-derive them.

**Scene.** `files` is the 25th `DESKTOP_WIN_SECTIONS` member and had no entry at all. Driven on a
SECOND dev instance — `JP_DEBUG_PORT=39291`, `JP_EXTENSION_PORT=18865`, `PORT=5199`,
`JP_USER_DATA_DIR=~\.claude-runs\jp-fresh-p2b`, pid 5204 — so the sibling worker's app on 39273
was never touched. The cat1 harness resolves `bridge.json` from its own `__dirname`, so running it
from this worktree drives this instance and only this one. Window: "Files", 820x580, standard,
396 elements, 103 controls.

**Three bars pass, one fails.** contrast min **4.65** (`span.fa-tree-count`), 0 failing of 190
measured; keyboard **0 unreachable** of 103; motion 43 over threshold → **0** under emulated
reduce-motion, emulation taken and released; WCAG 2.5.8 **0** fails. `targets32` FAILS: **63**
under the floor by rect, **39** by pointer.

**Repaired in `f8503bbc`** — `input.fa-bulk-check` x24 (rect 18x32, pointer 18.5x28 → rect 32x32)
and `button.fa-view-mode-button` x2 (`::after` absent → 32px computed; visual rect unchanged at
59x28). The checkbox took the floor on its own box because an input is a replaced element and
`::after` generates nothing on it; the pill buttons took `.lq-hit` because raising their box would
grow the pill. Neither moved layout: `.fa-row` already reserved `var(--lq-hit-target)` for the
select column, so only the glyph was small.

**Why the category is VOID rather than scored.** The harness's own `--control` moved contrast,
targetsByRect, wcag258 and keyboard, but **not `targetsByPointer`** — the injected 12px button did
not register on the pointer leg. The rubric says a control that fails to falsify VOIDS the score.
So cat1 for `files` is UNSCORED, and the next turn's first job is to find why that leg did not
move before any number here is claimed.

**Left alone on purpose.** `button.fa-tree-node` x11 reads 24px WIDE while declaring `width:100%`
and `min-height:var(--lq-hit-target)`, and `.fa-tree` carries `overflow-y:auto` — a clipper, which
is a recorded way for this measurement to lie. Also unexplained: 25 controls report `occluded`,
three of them `by: div.os-desktop`. Both are instrument-vs-product questions, not yet findings.

**Cats 3/4/5/6 were NOT attempted and must not be scored on this profile.** A fresh
`JP_USER_DATA_DIR` leaves the Files index at `Everything 28` with every content folder at 0 —
an empty harness, which the rubric caps at 0. They need a populated profile.

## 2026-09-03 (later) · primary2 — Files cat1: the control now falsifies, two repairs land, the bar still fails — commit `0fc0e616`

**Still not a closed category, and deliberately not claimed as one.** What changed is that the
numbers are now *claimable*: the previous entry's run VOIDed on its own control, and it VOIDed
for an instrument reason, not a product one.

**Why `targetsByPointer` did not move, settled.** The leg asserted a COUNT —
`dirtyHit.belowFloorByHit > base.hit.belowFloorByHit`. The plant is a 48 px flex row appended
into a fixed-height `.fwin` flex column. On Files it shrank `.fwin-body` by 48 px, pushed five
real sub-floor controls out of their scroll parents into `occluded` (**25 → 27**), and the total
went **39 → 36** *with the two planted 12 px buttons correctly caught inside it* (verified by
running the walk by hand with the plant in place: `button` ×2, `hitMin 12.5`). The control had
falsified the bar and the harness said it had not. Correction 31 in `cat1-accessibility.cjs`:
the plant carries `class="cat1TinyTarget"` and the assertion NAMES that victim
(`plantCaught >= 2`, and 0 such rows at baseline); the count delta is printed beside it as
information. Re-run with the control: **all six axes move**, `plantCaughtByPointer 2`,
`pointerCountDelta +1`, `pointerOccludedDelta +2`, `backToBaseline true`.

**Two product defects it had been hiding.**

1. **`f8503bbc`'s checkbox repair never reached the pointer.** It took `input.fa-bulk-check` to
   rect **32×32** while the pointer region stayed **28.5×28**. An `<input>` carries a UA
   `margin: 3px 3px 3px 4px`, so a 32 px box needs 39×38 inside a cell that is exactly
   `--lq-hit-target` wide, and `.fa-cell` is `overflow: hidden` — the right 4 px and bottom 3 px
   were clipped, which layout does not report and `getBoundingClientRect()` cannot see.
   `margin: 0`.
2. **The one rail in the app that never got the collapsed contract.** The scaffold collapses its
   rail below `wide` (`LIQUID_BREAKPOINTS`, 1120 px of *scaffold*), and the Files window's own
   default 820×580 measures **782** — `medium`. So the app OPENS with its primary navigation in
   a 52 px track it was never designed for: **32 `.fa-tree-node` at rect 24×32**, labels clipped
   to one or two characters, 11 reading `occluded`. `.lq-rail-item` has a treatment for exactly
   this in `liquid-controls.css`; the Files tree is not one, so it got none of it. NOT repaired
   by hiding the label the way that contract does — a smart folder and a favorite carry a name
   and nothing else, so hiding it leaves a column of blank buttons. The width is what is wrong,
   so the width changes: `--lq-rail-width-collapsed` goes **52 → 72 px** for this app only,
   grid `52px 394px 320px` → **`72px 374px 320px`**, nodes **24 → 48 px**. `title` added to all
   five node kinds. The rejected alternative was measured, not assumed: forcing the rail open at
   this width reads **`232px 214px 320px`** — a six-column file list in 214 px.

**The bars, 78 of 103 controls scored.** contrast min **4.65**, **0 failing of 214**; WCAG 2.5.8
**0** fails; keyboard **0 unreachable of 103**; motion **43 → 0** under emulated reduce-motion,
emulation taken and released. `targets32` **still FAILS**: `belowFloorByHit` **39 → 4**,
`stolenCount` **24 → 1**. The four are single instances at the scroller's clip edge
(`button.fa-tree-node` 48×32 hit 48.5×**26.5**; `button.fa-cell-size` 31×32 hit **31.5**;
`div.fa-row` 364×32 hit **31.5**; one `input.fa-bulk-check` of 24 at hit **31**), not families.
**So category 1 for `files` is FAIL, not 10/10.**

**MEASURED AND REJECTED, recorded in the CSS so nobody tries it again.** Growing `.fa-row` to
`calc(var(--lq-hit-target) + 1px)` fixes the last checkbox and costs 24: an odd row height
centres the checkbox on a half-pixel and the pointer walk then reports its region as not
covering its own rect. `stolenCount` **1 → 24**, and `stolen` is half the same bar. 32 px stays,
re-measured after the revert to confirm (`belowByHit 4`, `stolen 1` — identical to the scored
run).

**Two instrument facts the next worker should not re-derive.** (a) The walk's `STEP` is 0.5, so
a control whose box is exactly 32.0 px and sits flush in a 32 px container tops out at **31.5**
— at the floor and reported under it. Three of the four remaining rows are that. (b) The
compact view (`.fa-list[data-view='compact'] .fa-row`, height 24 px) has NOT been measured and
will fail this bar on the row itself; the scored presentation is the default view.

Evidence: `baselines/cat1-files.json`.

## 2026-09-03 · backup — Music — 80/80 — commit `3efa3647`

`music` is the **tenth** of the 25 `DESKTOP_WIN_SECTIONS` at 80/80 and closes the RULE C pair
opened for this bullet (`library` densest, `music` most different — `library` closed at
`c8e5f2e7`). Driven on the `.fwin` "Music" (`@.fwin:has(.mc-root)`), standard presentation,
1080×700, viewport 1264×821, ONE desktop window and ONE `.fwin`, with a track CURRENT — the
state half these bars only exist in. Zero new probes (RULE 1).

**sampled-out for this bullet:** `agent` `novels` `grammar` `translate` `player` `anki` `stats`
`immersion` `reading` `scraper` `files` `note` `city` `visualizer` `musicwidget`.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 1 | Accessibility | **10/10**, re-derived AFTER the repair | **65** text runs, 0 unmeasurable, **0 failing**, min **5.00** (`small "2 tracks"`, 11 px) — the same sweep read min **4.43** before the repair; 38 targets by rect, smallest `button.fwin-b` **24 px**, 14 under the 32 px floor by rect and **0** WCAG 2.5.8 failures; **40** controls hit-tested, 14 below the floor by RECT and **0 by hit box**, smallest painted hit **32×32.5**; keyboard **38/38** reachable, 1 focus host (`div.mc-root`, `tabindex=-1`); motion **19** declarations over threshold at rest → **0** under emulated `prefers-reduced-motion` → 19 after, emulation taken and released | 6 axes planted, all 6 moved (`0,14,0,0,0 → 2,16,2,1,2 → 0,14,0,0`), `rectDrift 0`, back to baseline |
| 2 | Clunkiness | **10/10** | 1 counted step, **0** dead ends, **0** modal traps, **0** scroll traps, worst click→recv **0.7 ms**, **0** over the 100 ms bar; cost parity Liquid **1** = Standard **1**, 1080×700 both, restored to standard; resting and after-task idle both churn **net false** over 1,600 ms once the player strip is excluded | `--control`: dead end / modal trap / scroll trap **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true`, inert click 0.3 ms |
| 3 | Liquid utilization | **10/10** | driven into Liquid and restored: `denseWorkOnTranslucent` **0** over **37** regions; Liquid-eligible **9/9** treated and **9/9** backed by a shared primitive; roles Work **1**, Anchor **21**, Anchor-holds-work **5**, Ambient **1** | both plants fired on `div.lq-anchor.music-yt` — one region to glass, then every Work region (`allWorkFailed`); `oneMaterialReturned` and `allGlassReturned` true |
| 4 | Use of space | **10/10** | all three sizes ran and restored: default dead **10.4 %**, compact **0.5 %**, maximized **13.5 %** against a 15 bar; clipped **0**, overlaps **0**, horizontal scrollers **0** at every size; content grows not chrome, `default → maximized` | injected clip **0→1→0** with removal proven; the art-plate exclusion named its own plant (hangs out **279 px**, `clipped` did NOT rise); backdrop overlap rose and was **not excused** |
| 5 | UI clarity | **10/10** after a repair | all ten questions YES. Q4 **8** controls scanned against a bar of 12 with 21 shell-chrome controls excluded by name and **2** collapsed disclosures; Q5 **65** runs, **0 failing in EITHER theme**, min **4.77** (classic-light) / **4.93** (default), theme axis moved on both minRatio and paint digest; Q6/Q7/Q8/Q9 from this surface's own category-6 baseline; Q10 above the identity bar | `--control` re-run AFTER the repair: **Q2, Q3, Q4, Q5 and Q10 all went NO**, planted clutter taking scanned to **30** against the bar of 12 |
| 6 | Feature parity + reversibility | **10/10** | ledger **10/10 reachable in standard, 10/10 in Liquid**, `na` 0, rows agree, nothing only-in-one; round trip `standard → liquid → standard` with **0** diffs, an INPUT dirtied and held, shell held, other-presentation box 1080×700 | every mutation armed and felled **exactly its own row** (`libraryRows`, `librarySearch`, …), no unexpected row moved, each restored to `10/10` |
| 7 | Performance under real load | **10/10** | ceiling p50/p95 **8.3 / 8.5** ms, max 8.8, 0 over 16, main-loop max 12.2; drag p95 **8.5** (max 16.8, 1 over 16, 0 over 33); resize p95 **8.5** (max 8.8, 0 over 16); theme p95 **8.5** (max 25.0, 1 over 16, applyPainted 16.7 ms); heavy leg "cycle all four library sort modes" **131 samples / 4,026 ms**, main-loop p50 **2.0** max **8.0**, receipt `cycled 48 sorts (12/12/12/12), restored recent`; idle 132 samples p50 **2.1** p95 **3.0** | `--jank`: drag p95 **8.5 → 116.7 ms**, max **125.0**, frames over 100 **0 → 10**, **11** blocks injected |
| 8 | Honest states | **10/10**, both driven bars MEASURED | raw keys **0** against a 10,234-key / 107-namespace catalog, placeholders **0**, mute pairs **0** (3 disabled controls, all explained); states **1 of 1 observable** — the search empty state names it in full (`No songs match "zzqqxx-no-such-song".`), 0 unpainted, and `loading`/`error`/`offline` are `notObservable` and excluded rather than passed; four languages give **4 distinct hashes**, **33 of 66** runs move (**50.0 %**), max raw keys in any language **0**, and `ui-lang` started and ended **absent** (`restored: true`); the drive restored the search box | rawKeys/placeholders/mutePairs **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true` |

Evidence: `baselines/cat{1..8}-s9-music*.json`.

**ONE PRODUCT REPAIR, found by cat5 and confirmed by cat1.**

`3efa3647` — **a current track's row text sat 0.07 under the contrast bar.** Two 11 px runs in
`.mc-track-queue` (`small` "Downloads" and the trailing `span` "—") carry `--mc-dim` (#7f8598,
5.2:1 on the flat `--mc-bg`); a hovered or `.is-active` row paints `rgba(255,255,255,.035)` over
a 72 %-opaque `.lq-contextual` aside and the composite measured **4.43:1**. Swapped to
`--mc-muted`, the same token swap `.mc-inspector-score-row small` already carries for the
identical composite. Separately `.music-row.active .music-song-artist` measured **4.43:1 in
classic-light** — the only failing run of 66 — because the active row's 16 % accent tint darkens
a light panel; it now mixes 40 % `--text` into `--muted`. cat1's whole-surface min went
**4.43 → 5.00**; cat5's classic-light cell went 1 failing → **0**.

**HONEST SCOPE NOTE.** Categories 2, 3, 4 and 6 were driven earlier the same day, on the build
immediately before this repair. The repair changes two `color:` declarations and nothing else —
no geometry, no material, no control, no route — so those four cells are carried rather than
re-driven, and category 1, the one that scores contrast, WAS re-driven after it. Saying which
cells predate the fix is the point; silently re-labelling them would not be.

**THREE INSTRUMENT TRAPS, all paid for this turn.**

1. **A SECOND desktop window makes the Liquid toggle lag one click.** After the 2026-09-03
   reboot the app restored a window for a display that is not attached (`/health` listed two).
   With it open, clicking `.fwin-b-liquid` left the class one interaction behind, so cat5's Q6
   leg read `toggle did not reach liquid; surface reads standard` and the whole run VOIDed —
   twice. Closing it (POST `/eval` with `{"window":2,"js":"window.close()"}`) fixed it outright,
   one click, 600 ms. **`/health` must list ONE desktop window before any presentation run.**
2. **`cat5` on this surface needs `--shell-chrome ".mc-sidebar,.mc-topbar,.mc-playerbar"`.**
   Without it Q4 counts the Media Center's shared shell as the surface's own tools — 22 scanned
   against a bar of 12 — and reports a clutter defect that does not exist. With it, 8 scanned
   and 21 named in `shellList` where a reader can add them back and disagree.
3. **Half of this surface's bars only exist once a track is CURRENT.** At rest the queue rows
   are untinted and both failing runs are unreachable; `statesNamed` is `0 of 0 observable` until
   `--drive-input ".music-search input"` produces the empty state. An at-rest sweep of Music
   scores 10/10 on a defect it cannot see.

**Running total: 10 of 25 sections at 80/80** — `dictionary`, `video`, `games`, `settings`,
`youtube`, `calendar`, `resources`, `flashcards`, `library`, `music`. **15 left**, of which 14
are scorable in both presentations (`visualizer` and `musicwidget` offer no presentation toggle).

## 2026-09-03 · primary — Statistics — 80/80 — commit `2427124e` (finished from backup's interrupted turn)

`stats` is the **eleventh** of the 25 `DESKTOP_WIN_SECTIONS` at 80/80 and opens the RULE C pair
`stats` (densest of the 15 left) + `note` (most different). Driven on the `.fwin` "Statistics"
(`@.fwin:has(.stats-view)`), standard presentation, 820×580, viewport 1264×821, with a profile
carrying real study data — a wiped one caps this surface's own bars. Zero new probes (RULE 1).

**RECOVERY NOTE, because the provenance matters.** `backup` opened this surface at `2372c8c0`
(cats 1 and 8), drove cats 2/3/4/6/7 at 19:45–19:47, landed the repair `2427124e` at 19:52 and
lost its session two minutes later, before any receipt was written. This turn re-derived the
banked JSON rather than trusting the commit messages, **re-drove cats 1, 2 and 5 after the
repair**, and closes the surface. The pre-fix numbers in `2372c8c0`'s message (25 text runs,
6 controls) were measured mid-load; the post-fix sweep sees **86 runs / 11 controls** on the
same window, so the figures below are strictly the denser measurement.

**sampled-out for this bullet:** `agent` `novels` `grammar` `translate` `player` `anki`
`immersion` `reading` `scraper` `files` `note` `city` `visualizer` `musicwidget`.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 1 | Accessibility | **10/10**, re-derived AFTER the repair | **86** text runs, 0 unmeasurable, **0 failing**, min **5.35** (`span.stats-card-lbl "known"`, 12 px); 11 targets by rect, smallest `button.fwin-b` **24 px**, 5 under the 32 px floor by rect and **0** WCAG 2.5.8 failures; 12 controls hit-tested / 11 measured, **0 below the floor by hit box**, smallest painted hit **32×32.5**, `stolenCount` **0** and `occludedCount` **1** — the by-design popover overlap the repair made dismissable; keyboard **11/11** reachable, 0 focus hosts; motion **32** declarations over threshold at rest → **0** under emulated `prefers-reduced-motion` → 32 after, emulation taken and released | 6 axes planted, all 6 moved (`0,5,0,0,0 → 2,7,2,1,2 → 0,5,0,0`), `rectDrift 0`, back to baseline |
| 2 | Clunkiness | **10/10**, re-driven AFTER the repair | 3 counted steps over the repaired disclosure path (open → close → jump to recent), **0** dead ends, **0** modal traps, **0** scroll traps, worst click→recv **0.9 ms**, **0** over the 100 ms bar; cost parity Liquid **3** = Standard **3**, 820×580 both, restored to standard; resting and after-task idle both churn **net false** over 1,600 ms | `--control`: dead end / modal trap / scroll trap **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true`, inert click 0.1 ms |
| 3 | Liquid utilization | **10/10** | driven into Liquid and restored: `denseWorkOnTranslucent` **0** over **74** regions; Liquid-eligible **1/1** treated and **1/1** backed by a shared primitive; roles Work **2**, Anchor **69**, Anchor-holds-work **2**, Ambient **0**; the window's own paint `alpha 0.72`, `backdrop blur(8px) saturate(1.25)` | both plants fired on `section.stats-section.stats-knowledge` — one region to glass (`0,1,1,1,2 → 1,1,1,1,2`), then every Work region (`allWorkFailed`); `oneMaterialReturned` and `allGlassReturned` true |
| 4 | Use of space | **10/10** | all three sizes ran and restored: default dead **8.9 %**, compact **0.5 %**, maximized **13.5 %** against a 15 bar; clipped **0**, overlaps **0**, horizontal scrollers **0** at every size; chrome **11.4 / 76.8 / 8.6 %** and dominant canvas **93.7 / 78.8 / 95.3 %**; content grows not chrome, `default → maximized` | injected clip **0→1→0** with removal proven; the art-plate exclusion named its own plant (hangs out **269 px**, `clipped` did NOT rise); the backdrop plant took overlaps **0 → 24** and was **not excused** |
| 5 | UI clarity | **10/10**, driven AFTER the repair | all ten questions YES. Q1 **1** entry point / 1 accent button (`Last 14 days`); Q2 title `Statistics` with 1 way back; Q4 **2** controls scanned against a bar of 12 (`Last 14 days`, `Sync from Anki`), 1 collapsed disclosure, **0** hidden behind it; Q5 **86** runs, **0 failing in EITHER theme**, min **5.35** (default) / **5.71** (classic-light), theme axis moved on both minRatio and paint digest; Q10 above the identity bar at 5 markers, both card hosts uniform-one-kind and so exempt (`dashboardHosts 0`); Q6/Q7/Q8/Q9 from this surface's own category-6 baseline | `--control`: **Q2, Q3, Q4, Q5 and Q10 all went NO**, the heterogeneous 6-card plant taking `cardControlSignatures` **1 → 6** and `dashboardHosts` **0 → 1**, scanned controls **2 → 24** against the bar of 12 |
| 6 | Feature parity + reversibility | **10/10** | ledger **9/9 reachable in standard, 9/9 in Liquid**, `na` 0, rows agree, nothing only-in-one; round trip `standard → liquid → standard` with **0** diffs, shell held, other-presentation box 820×580; no editable text field exists on this surface, recorded as `dirtyNote` rather than silently skipped; drive receipt `recentActivity 0 → 814 moved`, `scroll top 320 of range 836` | every mutation armed and felled **exactly its own row** (`knowledgeSummary` → 9/9 → 8/9 → restored 9/9), no unexpected row moved |
| 7 | Performance under real load | **10/10** | ceiling p50/p95 **8.3 / 8.4** ms, max 9.0, 0 over 16, main-loop p50 2.4 max 15.4 — session ceiling re-run 3× with 0 frames over 100 and `comparable to L0`; drag p95 **8.4** (max 91.7, 6 over 16, 4 over 33, **0 over 100**); resize p95 **8.5** (max 91.6, 3 over 16, 2 over 33); theme p95 **8.5** (max 83.4, 5 over 16, 3 over 33); heavy leg "scroll the whole statistics view" **80 samples / 2,530 ms**, main-loop p50 **3.9** p95 **10.9** max **27.7**, receipt `scrolled inside:fwin-body to 1137 px over 91 ticks (overflow 1137), restored to 0`; idle 80 samples p50 **4.5** p95 **11.9**; `findings []`, `voided []` | `--jank`: drag p95 **8.4 → 116.7 ms**, max **125.1**, frames over 100 **0 → 10**, **10** blocks injected |
| 8 | Honest states | **10/10**, both driven bars MEASURED | raw keys **0** against a 10,234-key catalog, placeholders **0**, mute pairs **0**, **0** disabled controls; states **1 of 1 observable** — the zero-data state names it in full (`No reading tracked yet. Open a book from your Library…`), 0 unpainted, and `loading`/`error`/`offline` are `notObservable` and excluded rather than passed; four languages give **4 distinct hashes**, **14 of 25** runs move in each of ja/zh/ru (**56.0 %**), max raw keys in any language **0**, and `ui-lang` started and ended **absent** (`restored: true`) | rawKeys/placeholders/mutePairs **0,0,0 → 1,1,1 → 0,0,0**, `backToBaseline: true` |

Evidence: `baselines/cat{1..8}-s10-stats*.json`.

**ONE PRODUCT REPAIR, found by cat1's `hit.occluded` and landed by backup as `2427124e`.**

With the Reset disclosure open, its panel sits at (753,143) 132×45 and the Word Knowledge
"Sync from Anki" button at (752,157) 133×32 one row below. `document.elementFromPoint` at the
CENTRE OF THE SYNC BUTTON returned `BUTTON.btn.danger` — the Reset action, not the button the
user can still see. The overlap itself is what `position:absolute; z-index:var(--z-popover)` is
for; what was missing is the other half of the popover contract. A native `<details>` closes
only when its own summary is pressed again, so the obvious way out — click elsewhere —
activated whatever the panel had covered. `useDismissableDisclosure`, already solving this
inside `MediaLibraryBrowser`, moved to `components/ui` and Statistics became its second caller.
After the repair, `stolenCount` is **0** and the single remaining `occluded` row is the
by-design overlap, now dismissable by an outside press and by Escape.

**HONEST SCOPE NOTE.** Categories 3, 4, 6 and 7 were driven on the build immediately BEFORE the
repair. The repair adds two document listeners and one `open` transition to a disclosure — no
geometry, no material, no route, no ledger row — so those four cells are carried rather than
re-driven, and the three categories the repair could move (1 accessibility, 2 clunkiness whose
task IS the disclosure path, 5 clarity whose Q4 counts that disclosure) were ALL re-driven after
it. Saying which cells predate the fix is the point.

**TWO INSTRUMENT TRAPS, both paid for this turn.**

1. **`cat1-accessibility.cjs` prints its report but writes NOTHING without `--out`.** Unlike
   `cat5`, which resolves `baselines/cat<N>-<label>.json` itself and says `wrote <path>`, cat1
   is silent and leaves no file. A run that "looks banked" from its console output is not, and
   the next worker sees a missing baseline where a 10/10 was measured.
2. **A `.stats-recent-jump` click leaves `.fwin-body` scrolled 814 px, and the NEXT run refuses
   on it.** cat2's own task ends with that jump, so with `--both-presentations` the second leg
   starts scrolled and REFUSES `occluded: ... centre resolves to null` — which reads exactly
   like a dead control. The fix is inside the task: a leading `scroll:.fwin-body=0` step, which
   the harness bills as a restore primitive and does NOT count as input (correction 18), plus
   the same spec as `--undo`. `eval:` is **not** a step kind.

**Running total: 11 of 25 sections at 80/80** — `dictionary`, `video`, `games`, `settings`,
`youtube`, `calendar`, `resources`, `flashcards`, `library`, `music`, `stats`. **14 left**, of
which 13 are scorable in both presentations (`visualizer` and `musicwidget` offer no
presentation toggle).

## 2026-09-03 · primary — Sticky note — category 1 CLOSES at 10/10, and two measured defects the rest of the surface waits on

`note` is the second half of the RULE C pair `stats` (densest) + `note` (most different), opened
by backup at `2372c8c0`. It is the smallest surface in the plan: a title bar with two glyphs and
one `<textarea>`, 260×220, `@.fwin.fwin-note`. **It does NOT close this turn and is not claimed
at 80/80** — one category is banked, two product repairs landed, and the remaining seven are
blocked behind a category-2 instrument defect argued below.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 1 | Accessibility | **10/10**, re-derived AFTER the repair | **3** text runs, 0 unmeasurable, **0 failing**, min **11.11** (`span.fwin-title-text "Sticky note"`, 12.5 px) — the same sweep read min **1.20** before the repair, on the `◇` glyph, one failing run of three; 3 targets by rect, smallest `button.fwin-b` **24 px**, 2 under the 32 px floor by rect and **0** WCAG 2.5.8 failures; 3 controls hit-tested, **0 below the floor by hit box**, `stolenCount` **0**, `occludedCount` **0**; keyboard **3/3** reachable; motion **4** declarations over threshold at rest → **0** under emulated `prefers-reduced-motion` → 4 after | 6 axes planted, all 6 moved (`0,2,0,0,0 → 2,4,2,1,2 → 0,2,0,0`), `rectDrift 0`, back to baseline |
| 2 | Clunkiness | **OPEN** — 2 of 5 bars failed, one repaired, one is the instrument | scroll traps **1 → 0** (repaired, `e58ff32e`); dead ends **0**, modal traps **0**, cost parity Liquid **28** = Standard **28**, 260×220 both, restored to standard. `latency` reported `worstRecv 480.1 ms` / **13 of 28 over the 100 ms bar** and that figure is NOT a property of this surface — see below | `--control` not yet run; the score is therefore VOID rather than any number |
| 3–8 | — | not driven | — | — |

Evidence: `baselines/cat1-s11-note.json`, `cat1-s11-note-control.json`, `cat2-s11-note.json`.

**REPAIR 1 — `8cd44b3e`, the Make Liquid glyph painted 1.2:1 on the note's own yellow bar.**
A note paints its title bar in one of five pastel `NOTE_COLORS`, so `.fwin-title` and
`.fwin-close` each carried their own copy of `isNote && !liquid ? { color: '#3a3320' }`. The
Liquid toggle sits BETWEEN them and carried none, so it inherited `.fwin-b`'s near-white:
measured **1.20:1** against a 4.5 bar while its two neighbours in the same bar sat at 11.11:1.
Two copies were two chances for a third control to be missed; the predicate is now one `noteInk`
const applied at all three sites. cat1 min **1.20 → 11.11**.

**REPAIR 2 — `e58ff32e`, 4 px of the note body could never be scrolled to.** A textarea is
`inline-block`, so its line box reserves descender space below it, and `.fwin-body-note` is
`overflow: hidden`. Body scrollHeight **189** against clientHeight **185**. `display: block` →
**185 / 185**.

**FINDING A — the category-2 latency instrument cannot measure a TYPED task, on any surface.**

`cat2-clunkiness.cjs`'s recorder stamps `recvAt` at the event and `paintAt` in a
`requestAnimationFrame` callback. `/type` delivers characters faster than a frame, so every
keystroke's rAF callback fires in the SAME tick — one shared `paintAt`. Each sample is therefore
`burst_end − keystroke_time`, which is why the 28 samples are a monotonically DECREASING ramp
(480.1, 428.7, 376.3 … 5.8) rather than a scatter. Measured directly, with an independent
recorder counting rAF ticks:

| surface | keystrokes | burst | frames painted DURING the burst | max frame gap |
| --- | --- | --- | --- | --- |
| sticky note | 28 | 470.3 ms | **0** | 479.8 ms |
| Settings search (**control**) | 28 | 175.7 ms | **0** | 190.7 ms |

The control is the point: a surface nobody suspects produces the identical zero. So `overBar100:
13` is an artifact of the harness's own delivery rate, and any surface whose dominant task is
typing FAILS this bar for free. **Fix the instrument, not the art.** The repair, and the exact
next slice: record `framesSincePrevEvent` per sample in `ARM`, and when a run's input samples
share one paint, report `inputRecv` as `UNSCOREABLE — n input events shared one paint` instead
of scoring it. Do not simply exempt typed tasks; that would hide FINDING B.

**FINDING B — one keystroke in a sticky note costs 5.1× more when other windows are open.**

Spaced 400 ms apart so each keystroke gets its own frame, event → next paint, same recorder:

| desk | samples (ms) | p50 |
| --- | --- | --- |
| note + Settings 960×680 + Statistics | 71.2, 59.6, 57.0, 57.2, 59.8, 55.4 | **58.3** |
| note alone | 11.8, 12.3, 9.9, 12.1, 10.5, 10.7 | **11.4** |
| Settings search field, same desk (**control**) | 8.6, 7.0, 8.8, 8.5, 11.0, 8.7 | **8.6** |

The cause is read from source and is not note-specific: `FloatingWindow` IS wrapped in `memo`
(`DesktopShell.tsx:3705`) and its handlers come from a stable `winHandlerCache`, **but every
window is given `children` as a fresh JSX element on each shell render** (`:2862`), so the memo
never holds for ANY window. A keystroke into a note re-renders the whole of Settings and the
whole of Statistics. It scales with how many windows the user has open — the more they do, the
slower typing gets — and it is a category-7 defect on every desktop surface, not just this one.
Not repaired this turn: the fix is to memoize each window's body per section, which is a real
slice and would not have fit in this turn's tail with verification.

**Traps.** (a) `cat1-accessibility.cjs` prints its report and writes NOTHING without `--out`.
(b) `src/renderer/styles.css` carries another track's uncommitted work; the CSS repair landed as
a HEAD+edit blob through `git apply --cached` of the single hunk. (c) Closing a note DELETES it —
never use the close button to tidy up after a probe.

**Running total: unchanged at 11 of 25 sections at 80/80.** `note` has 1 of 8 categories banked.

---

## 2026-09-03 21:00 EDT — primary. FINDING B REPAIRED, and the boss audit's three items.

**FINDING B's cause statement above was half wrong, and the half that was wrong mattered.**
Re-derived from the tree rather than from that paragraph: `appSectionCache` (`DesktopShell.tsx`,
just above the call site) already returned one cached `<AppSection>` element per section, so
`children` WAS reference-stable for every app window — Statistics included. The comment beside
it named the real limit in as many words: the `note` and `settings` bodies were not cached.
So it was never "the memo never holds for ANY window"; it was two windows, one of them
expensive. **Do not quote the 5.1× line above as an unrepaired defect.**

Measured with one instrument across a full 2×2, in one session. One keystroke into a sticky
note to the SECOND animation frame after it, 12 scored samples per arm after 2 warm-ups,
keystrokes 400 ms apart so each gets its own frame (FINDING A's rule):

| DesktopShell | note alone | note + Statistics + Settings | cost of the other two |
| --- | --- | --- | --- |
| HEAD, before | **21.4** | **52.9** | **+31.5 ms** |
| `8b4dc866` | **22.8** | **27.9** | **+5.1 ms** |

The two `note alone` arms are the negative control and they match, so what got cheaper is the
unrelated windows and not the machine. The before arm was taken by writing HEAD's own
`DesktopShell.tsx` into the tree, letting HMR apply it, measuring, then restoring mine and
checking sha256 — not by comparing to a number from a previous turn's different recorder.

Repair `8b4dc866`: a `useMemo`'d `<DesktopSettings>` keyed on the three pieces of live state it
reads, with its eleven callbacks routed through `wallActionsRef` exactly as `winActionsRef`
already does; and `noteColorCache` / `noteBodyCache` keyed by window id, so the note being typed
in still rebuilds while no other note does. `noteBodyCache` is a `useMemo` on `[lang]`, not a
bare ref, because it caches a translated placeholder. Guard
`desktopWindowBodyIdentity.test.ts`, 5 tests, comments stripped first; mutation control =
restore HEAD's file → 5 of 5 RED.

**BOSS AUDIT 2026-09-04 02:55 MSK — all three handoff items answered.** The previous handoff
recorded "nothing owed" against a 2026-08-13 section; the audit had landed by then and was
missed. Read the file's LAST section, not a remembered one.

(a) `cb4bfa75` — `attachSubtitleFile` and `subtitleFallbackFont` added to `window.d.ts`, as a
HEAD+edit blob because that file is another track's dirty file; staged diff +14/−0. Both tsc
identities the audit quoted are gone.
(b) `63432f9a` — Finding P2 repaired geometrically. Reproduced first: tray `(753,143) 132x45`
over `Sync from Anki` `(752.3,157) 132.7x32`, `elementFromPoint` at Sync's centre returning
`BUTTON.btn.danger` with `contains` **true**. The tray now reserves its own width and height in
flow; closed and open are identical horizontally. Three legs, armed in one `/eval` and pressed
in the next: SUBJECT at Sync's centre → `BUTTON.btn.small`, dismissed; CONTROL inside the tray's
own padding → not dismissed.
(c) `ba494825` then `401b400c` — **a measured retraction.** The audit asked for both lagging
test suites to be committed. `musicCueNavCommands.test.ts` was right and passes in isolation.
`videoStudyLayout.test.ts` turned 3 failures into 4: its newer copy asserts Detached Study
Blocks, which is uncommitted across 8 files and ~450 lines (`preload.ts` +87/−10,
`StudyPlayerSlice.tsx` +243, `mediaWorkspace.css`). Its INDEX entry was reverted with
`update-index` on the old blob so the working tree keeps the study track's copy untouched.

**Trap.** A detached verification worktree is the only place the branch can be read: 4 of these
5 failures are invisible in the shared tree, where the uncommitted copies of the same test files
are what actually run.

**Running total: unchanged at 11 of 25 sections at 80/80.** `note` still has 1 of 8 banked —
cat2 remains VOID until FINDING A's recorder repair lands, which is the next slice.

---

## 2026-09-04 · primary — `note` categories 2 and 3 close at 10/10, and category 3's instrument was scoring an EMPTY WALK

Both cells were driven this turn against the live app (bridge 39273, pid 6756, one window, the
note alone on the desk at 260×220). Neither number was inherited.

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 2 | Clunkiness | **10/10** | 28 keystrokes / 0 clicks; `worstRecv` **13.0 ms**, `overBar100` **0** of 28, `sharedPaintSamples` **0**, `framesObserved` 28; deadEnds **0**, modalTraps **0**, scrollTraps **0**; costParity standard **28** = liquid **28**, 260×220 in both, `restored: true` to standard | 3 axes planted, all 3 moved `0,0,0 → 1,1,1 → 0,0,0`, `backToBaseline true`, inert click 0.3 ms |
| 3 | Liquid utilization | **10/10** | `regions` **1**, `Work` **1**, `controlsSkipped` **0**, `denseWorkOnTranslucent` **0**, `eligibleTotal` 0; window's own paint under Liquid `alpha 0.72 / blur(8px) saturate(1.25)` | controls **A and B both real** — "CONTROL FAILED AS REQUIRED"; plus the eligibility plant `0→1→0` proving the zero denominator is a MEASURED zero |

Evidence: `baselines/cat2-s11-note-r3.json`, `cat2-s11-note-r3-control.json`,
`cat3-s11-note-r2.json` (and `cat3-s11-note.json`, the pre-repair run, kept as the finding).

**FINDING A is CLOSED by `9ad79b92`, and this is the run that proves it on the surface that
raised it.** The previous entry left cat2 VOID pending that recorder repair. Re-driven at the
default 40 ms spacing the repaired instrument now *refuses* rather than scoring —
`UNSCOREABLE - 6 of 28 samples shared a paint (busiest frame held 4)` — which is the whole point
of the repair. Re-driven at `--key-spacing 150` every keystroke gets its own frame
(`framesObserved 28`, `sharedPaintSamples 0`) and the surface scores on real per-event latency.
The old 480.1 ms `worstRecv` was the harness's delivery rate; the true worst is **13.0 ms**.

**FINDING C — category 3 scored `note` 10/10 on a walk that found NOTHING, and would have
scored an identical 10 on a note that put its editing surface on glass.**

`l1-surface-roles.js:104` lists `textarea` in `CONTROL_SEL`, and the walk skips a control before
it ever reaches the area floor. `.fwin-body-note` holds exactly **one** child — a 258×185
`textarea.desk-note-text`, **80% of the window**. So the first run returned `regions: 0`,
`controlsSkipped: 1`, `byRole` all zero, `vacuousContextual: true`, all three bars true for an
absent denominator, and `PASS 10/10`. It could not even run its own controls: with no runtime
Work region, controls A and B have nothing to perturb, so it fell back to the plant substitute.
That is the "empty harness" cap the rubric puts at 0, reached silently.

Repair (this commit): a MULTI-LINE EDITOR is the work, not the chrome. `EDITOR_SEL =
'textarea,[contenteditable="true"]'` is exempted from the `CONTROL_SEL` skip, and `classify()`
counts the element itself as a form (`querySelectorAll` is descendants-only, so a region that IS
the editor read `forms: 0` and fell through to Ambient). Deliberately narrow: a single-line
`input` stays chrome however wide it is — that is `label.mc-global-search`, the 290×30 search
field whose false promotion is why `CONTROL_SEL` exists at all. The area floor is unchanged, so
a small composer still never reaches the walk.

After the repair, same surface, same presentation: `regions` **0 → 1**, `Work` **0 → 1**,
`controlsSkipped` **1 → 0**, and controls A and B run for real instead of the plant fallback.

**The product was innocent and that is measured, not assumed.** `textarea.desk-note-text`
computes `background-color: rgb(255, 243, 163)` — fully opaque — in **both** presentations
(standard, and Liquid with the frame at `alpha 0.72`), and `.fwin-body-note` is opaque
`rgb(26, 24, 35)` under Liquid. `denseWorkOnTranslucent` is therefore a real 0. The defect was
entirely in the instrument; no note CSS was changed.

**Trap for the next worker.** `--key-spacing` defaults to 40 ms and that is not enough on this
machine with a second Electron instance resident: 6 of 28 samples still shared a frame. Read the
`UNSCOREABLE` string as an instruction, not a failure, and widen the spacing until
`sharedPaintSamples` is 0. Do not exempt typed tasks.

**Running total: unchanged at 11 of 25 sections at 80/80.** `note` now has **3 of 8** banked
(cat1, cat2, cat3). Next: cat4 use-of-space on a 260×220 surface.

---

## 2026-09-04 · primary — `note` category 4 closes at 10/10, on a product change that makes a refusal LEGIBLE

| # | Category | Score | Number measured | Negative control (failed as required) |
| - | -------- | ----- | --------------- | ------------------------------------- |
| 4 | Use of space | **10/10** | 2 of 2 reachable sizes, both `restored: true` — default **260×220** (clipped 0, overlaps 0, hScrollers 0, dead **0%**, chrome **14.9%**, canvas **83.4%**) and compact **260×170** (0/0/0, dead **0%**, chrome **19.3%**, canvas **78.8%**); `contentGrowsNotChrome` **true** on the named pair `compact → default`; sub-minimum shrink to **200×140** clipped 0 / overlaps 0 / hScrollers 0, restored | 3 plants, each `0 → 1 → 0` with `removalProven: true` — injected clip, art-plate exclusion, backdrop exclusion; the pager leg records `applicable: false` with its reason rather than a score |

Evidence: `baselines/cat4-s11-note.json` (the FAIL, kept as the finding),
`cat4-s11-note-r2.json` (the pass).

**FINDING D — category 4 failed the note for HONOURING a documented product refusal.**

First run: `verdict FAIL`, `failedBars ["allThreeSizes"]`, because the maximized leg refused —
`no Maximize button - refusing to fake it with an inline width`, `noMaximizeAffordance: false`,
`chromeButtons: 2` (`Make Liquid`, `Delete note`), `frameless: false`.

That refusal is correct and the product is right. `canMaximizeSection`
(`src/renderer/desktopWindowGeometry.ts:36`) returns false for **`note` and `city`**, for a
reason the source already states and that re-derives live: **the shell suppresses window drag
and all three resize handles while maximized** (`DesktopShell.tsx`, the handles are inside
`{!isMaximized && (…)}`), and neither of those two bars renders a control that could clear the
state — so a maximized note would be trapped, unmovable and unresizable. That is CLAUDE.md's
"every enable flow needs a recovery path" invariant being honoured by refusing the state, and
the note loses nothing: **all three resize handles are ungated**, so it takes any size by drag.

The instrument was the defect. Its exoneration read `w.classList.contains('fwin-frameless')`,
which is a PROXY for the predicate and catches only one of its two members — `city` is
frameless, `note` is framed. Its own comment names the real rule ("DesktopShell forces
`max: false` for section 'city'") and then tests a class name instead.

**Repair — the product now publishes the decision, so nothing has to guess.**
`data-maximizable={canMaximize ? 'true' : 'false'}` on the `.fwin` element, beside
`data-section`. The harness reads that instead of the class name, and **keeps its button scan
as a second conjunct** — that half is the load-bearing one: a window that declares `true` and
ships no Maximize still fails, which is the accidental-loss case correction 19 refused to
launder, and this must not launder it either. `city` is unaffected: it declared `false` before
via the class and declares `false` now via the predicate.

After: `sizesExpected` **3 → 2**, `sizesRan` 2, `noMaximizeAffordance` **false → true**,
`allThreeSizes` **false → true**, all seven bars true, `PASS 10/10`.

Guard `src/renderer/__tests__/desktopWindowMaximizableAttr.test.ts`, 5 tests, comments stripped
before every assertion (this file's prose names the attribute it forbids, and DesktopShell's
does too). Mutation control: `data-maximizable={'true'}` → **1 of 5 RED**, restored and verified
byte-identical by sha256, green again.

**Running total: unchanged at 11 of 25 sections at 80/80.** `note` now has **4 of 8** banked
(cat1, cat2, cat3, cat4). Next: cat5 UI clarity, then 6, 7, 8 — four cells from an 80/80 entry.

---

## 2026-09-04 · primary — `note` cat5 is VOID, and the reason is an ORDERING rule the next worker needs before anything else

Driven, not skipped. `baselines/cat5-s11-note-m.json` (measurement) and `cat5-s11-note.json`
(control). The control is valid on its own — "CONTROL FAILED AS REQUIRED on Q2, Q3, Q4, Q5, Q10"
— so the instrument is proven; the measurement is what VOIDs.

Q1 YES (1 entry point, 1 primary input `textarea.desk-note-text`, 0 accent buttons).
Q2 YES (title `Sticky note` from `span.fwin-title`, 1 way back). Q3 YES (primary action inside
the body viewport at rest). **Q4 NO. Q5, Q7, Q8, Q9 VOID.**

**CAT6 MUST RUN BEFORE CAT5, AND THE LABELS MUST MATCH.** Q7/Q8/Q9 are MEASURE questions that
read a category-6 baseline at `baselines/cat6-<label>.json`. Run cat6 with `--label
cat5-s11-note-m` first, or cat5 VOIDs three questions no matter how good the surface is. This is
not a defect in either harness and it is not written down anywhere else.

**Q5's theme axis did not move** — `theme=null` and `theme=classic-light` both report
`minRatio 11.11`, so the swap never reached the paint and contrast stability measured nothing.
That is the recorded `theme-swap-is-a-transition` trap: `getComputedStyle` immediately after a
theme change returns the OLD colour. Settle before reading.

**FINDING E (open, deliberately not repaired this turn) — Q4 fails the note for having no
advanced tools to hide.** Bar: `>=1 collapsed disclosure AND <=12 controls scanned in the
default state`. The note measures `collapsedDisclosures: 0`, `scannedControls: 1`. It clears the
clutter half by a factor of twelve and fails the conjunct that asks for *something to disclose*.
That is the **third** cell in this family on this one surface — cat3's empty walk, cat4's absent
Maximize, and now this — and the shape is identical each time: a bar whose denominator a
correct minimal surface makes zero. The other two were repaired this turn; this one is NOT,
because the honest fix must still fail a surface that genuinely BURIES its tools, and getting
that discriminator wrong laundered is worse than a VOID. It is the next turn's opening slice.

**Running total: unchanged at 11 of 25 sections at 80/80.** `note` holds at **4 of 8**.

---

## 2026-09-04 · codexA — `note` closes at controlled 80/80

The interrupted cat5 finding was repaired without adding a disclosure to a one-control surface.
Q4 now requires one only when more than three controls are scanned or an existing control is
already hidden; its control plants 23 controls and fails. Q5's two theme cells are deliberately
identical because the note's user-selected inline paper colour is a fixed material. The new
`--fixed-material` mode proves every measured run resolves through that opaque authored paint;
the low-contrast control still fails in both cells.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 5 | UI clarity | **10/10** — 10/10 questions yes; Q4 1 control / 0 buried; Q5 3/3 fixed-material runs in both themes, min 11.11:1. Control fails Q2/Q3/Q4/Q5/Q10 and restores with residue 0. |
| 6 | Feature parity | **10/10** — 5/5 rows in standard and Liquid, 0 only-in-one, 0 round-trip diffs. Every one of 5 row mutations flips exactly its row and restores. |
| 7 | Performance | **10/10** — 90 real input events over 1.8 s, text restored exactly; main p95 3.3 ms / max 11.1 ms. Drag and resize p95 8.5 ms, 0 frames over 100 ms; jank control produces 10. |
| 8 | Honest states | **10/10** — the empty editor's painted placeholder is the honest empty state; 4/4 locale hashes differ and each alternate locale moves 1/4 text runs. Raw keys/placeholders/mute pairs control 0,0,0 → 1,1,1 → 0,0,0. |

Product repair: the note and garden glyph-only close buttons now have explicit translated
accessible names. Live note reading after HMR: `aria="Delete note"`; focused regression suite
10/10. Category 1 was re-driven after that change and remains **10/10**: 3 controls reachable,
0 occluded, min contrast 11.11:1; all six control axes move and restore.

Evidence: `cat1-s11-note-r2.json`, `cat5-s11-note-m.json`,
`cat5-s11-note-control-r2.json`, `cat6-cat5-s11-note-m.json`, `cat7-s11-note.json`, and
`cat8-s11-note.json`. Earlier controlled category 2/3/4 receipts remain the other three cells.

**Running total: 12 of 25 sections at 80/80.** `note` is **8 of 8**; **13 sections / 104
category cells remain**. Next surface is the plan-order `visualizer`, the most different compact
ambient surface from this minimal opaque editor.

---

## 2026-09-04 · codexA — Visualizer gains a real Liquid destination; category 6 is 10/10

The scorecard's measured gap was current: Visualizer was the only desktop section refused by
`canPresentLiquid`, because its 380×200 canvas had no contextual region for a flip to change.
The plan's own contract supplied the smallest coherent destination: the canvas remains fixed;
Music and full visualizer settings now live in a two-action `ContextualSurface` edge dock that
fades at idle and returns on hover, window focus, or `:focus-within` keyboard focus. Standard
paint `rgba(16,15,21,.82)` changes under Liquid to the theme-owned `.72` material and returns.

The Settings route initially failed live: with Advanced mode off, `settings:navigate` reached
the advanced Visualizer page and the existing guard immediately bounced it Home. Explicit
cross-surface routes now carry a temporary guided exemption without changing the user's
Advanced preference. Re-test: `page=visualizer`, card present, advanced preference still false.
Visualizer is presentable only on the desktop host; pop-out and reader remain refused.

Category 6: **10/10** — 5/5 rows in both presentations, 0 only-in-one, 0 round-trip diffs at
380×200. Canvas covers 378×165; Music and Settings routes are enabled and named; the dock is a
named contextual toolbar with exactly two actions; lifecycle is 4/4. All five mutations flip
exactly their own row and restore. Evidence: `baselines/cat6-s11-visualizer.json`.

**Running total: 12 of 25 sections at 80/80.** `visualizer` has **1 of 8**; **103 category
cells remain**. Next: drive categories 1–4 on this same live compact surface.

---

## 2026-09-04 · codexA — Visualizer categories 1–4 close; one overlap repaired

All four cells were driven on the live 380×200 window after the contextual-dock change.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 1 | Accessibility | **10/10** — 5 text runs, min 6.87:1; 6/6 controls keyboard-reachable; 0 hit-floor, WCAG 2.5.8, or motion failures. Six control axes move and restore. |
| 2 | Clunkiness | **10/10** — real presentation-toggle task costs 1 click in both modes; worst receive 17.1 ms standard / 15.4 ms Liquid, 0 dead ends, traps, or >100 ms samples; undo and presentation restore exact. Control 0,0,0 → 1,1,1 → 0,0,0. |
| 3 | Liquid utilization | **10/10** — 4 regions: eligible 1/1 treated and shared, Anchor 2, Ambient 1, dense Work on translucent 0. With no runtime Work region, the plant control moves eligible 1→2 and dense 0→1, fails both bars, then restores. |
| 4 | Use of space | **10/10** — default 380×200, compact 260×170, maximized 1264×773: clipped/overlaps/horizontal/dead all 0, canvas share 82.1→78.8→95.3%, every leg restored. Three geometry controls fire and restore. |

Category 4's first run was a real FAIL: the idle hint's element used `inset:0`, so its semantic
box covered the whole canvas and overlapped the new dock by 78×42 px at default and compact.
The hint now owns only its painted 86×17 box above the dock; overlap is 1→0 at both sizes.

Evidence: `cat1-s11-visualizer.json`, `cat2-s11-visualizer.json`,
`cat3-s11-visualizer.json`, `cat4-s11-visualizer.json`.

**Running total: 12 of 25 sections at 80/80.** `visualizer` has **5 of 8**; **99 category
cells remain**. Next: categories 5, 7, and 8.

---

## 2026-09-04 · primary — Visualizer category 5 closes on three product repairs; category 1 is WITHDRAWN

Category 5 scored **7/10** first, and all three findings were the product, not the instrument.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 5 | UI clarity | **10/10** at `24301ffd`, from 7/10. Control: **CONTROL-OK**, fails Q2 Q3 Q4 Q5 Q10, residue 0, 2 titles blanked and the root name stripped and restored. |

- **Q1/Q3** — the idle hint painted a music glyph and the words "Open Music" under
  `pointer-events: none`, while the only real route sat in a dock quiet until hover or focus.
  It is now the surface's `data-primary` action and moves 42% → 28% of the stage: spectrum and
  wave both paint upward from the bottom edge, so the old midpoint sat in the busiest band and
  below the window's entry band. Blanc passes no handler and degrades to the same painted text.
- **Q2** — the three untitled trinkets are a deliberate design and that stands, but a `section`
  with no accessible name is not a region landmark, so all three were unnamed to AT. Repaired
  with `aria-label` on the untitled window only. The harness's Q2 widened to accept an AUTHORED
  name, painted or announced — a strict superset reached only when the painted title is empty,
  which already scored NO. **The control caught the widening immediately** (`CONTROL DID NOT
  FAIL on Q2`); the plant now strips the root name too, under a suffixed marker rather than the
  bare plant attribute, which would have nulled Q3's `primaryAction` for the whole surface.
- **Q5** — `opacity: 0.45` on the resting `.fwin-viz` bar composites its four REAL controls
  with it: **2.4:1** in classic-light against a 4.5 bar. Tuning the alpha does not fix it —
  0.72 measured 4.95 classic-light / 6.93 forest-night / **3.20 soft-sepia**, whose focused
  margin is only 5.86. So the paint recedes and the controls do not. At rest after the change:
  soft-sepia **6.24**, classic-light **12.50**, forest-night **12.20**.

**CATEGORY 1'S 10/10 FOR THIS SURFACE IS WITHDRAWN, and it is not this turn's change.** Three
runs today read `targets32` FAIL: `belowFloorByHit 2`, `stolenCount 2`, the two
`button.viz-widget-action` measuring **29.5×29.5** against a 32×32 rect, stolen by their own
`.viz-widget-dock`. The 22:53 baseline recorded `stolenCount 0` on the same six controls.
Discriminator run: with the new hint button `display:none` the failure is **unchanged** (6
controls, byHit 2, stolen 2), so the hint is not the cause. `.viz-widget-action` is exactly
`var(--lq-hit-target)` = 32px and `.lq-hit::after` is `max(100%, 32px)`, i.e. **no expansion at
all at exactly 32** — the control is knife-edge on a walk that steps 2.5px, which is the shape
`hit-walk-step-caps-at-31-5` already records, and where that memory warns the CSS "fix" cost 24
stolen rows. Recorded, not papered over and not chased at the tail of a turn.

**Running total: unchanged at 12 of 25 sections at 80/80.** `visualizer` is **6 of 8** — cat2,
cat3, cat4, cat5, cat6 hold; **cat1 reverts to open** and cat7 and cat8 are unrun. `visualizer`
therefore went 5 → 6 by closing cat5 and 6 → 5 by withdrawing cat1, so **102 category cells
remain**, one better than the 103 before this turn. Next: cat1's floor question, then cat7 and
cat8.

---

## 2026-09-04 · backup — Visualizer category 1 is RESTORED at 10/10, and the cause was not the floor

The withdrawal above was right to withdraw and wrong about why. `targets32` did not fail because
`.viz-widget-action` is knife-edge at exactly `--lq-hit-target`; it failed because **the dock was
not where it is painted in the source**, and the two buttons were covered by window chrome.

Measured live before any change, walking each button from its own centre:

| button | hitW × hitH | left blocker | up blocker |
| ------ | ----------- | ------------ | ---------- |
| Open Music | 29.5 × 29.5 | `section.fwin.focused.fwin-viz` | `div.fwin-bar` |
| Visualizer — options | 32.5 × 29.5 | `div.lq-contextual.viz-widget-dock` | `div.fwin-bar` |

`div.fwin-bar` is the TITLE BAR. A dock declared `right: 8px; bottom: 8px` cannot be blocked by
the title bar, so the geometry was read directly: dock rect **(121,110) 78×42** against a
`.viz-widget` parent at **(129,118) 378×165** — up and left, outside its own stage, 8px past the
window's left edge. One step further left `elementFromPoint` returned
`input.os-set-search-input`, i.e. the page BEHIND the window.

Cause: `ContextualSurface` renders `lq-contextual viz-widget-dock`, and `liquid-surfaces.css`
sets `position: relative` on `.lq-contextual` at the same (0,1,0) specificity from a sheet that
loads later. `right`/`bottom` then resolve as relative OFFSETS, which is exactly the −8/−8 shift
observed. This is the third instance of that collision; `components/liquid/readingCanvas.css`
records the first two for `.lq-anchor`/`.lq-liquid`.

Scope check before fixing it in the shared class: a live sweep of **all 12 mounted
`.lq-contextual` elements** for `position: relative` + a non-auto offset + a box escaping its
parent found **exactly one** suspect, this dock. So the repair is local — `9781d731`, a child
combinator — and the shared role class is untouched, which it must be or every conventional
window repaints.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 1 | Accessibility | **10/10** at `9781d731` — 5 text runs, min **14.59:1** (`button.fwin-b "◇" 13px`); 7 controls, **0** unreachable; hit walk `belowFloorByHit 0 / stolenCount 0 / occludedCount 0`, stable across both runs; smallest pointer region **32×32.5**; WCAG 2.5.8 fails 0; reduce-motion `duringOverThreshold 0`, emulation taken and released. |

After the fix, same window, same session: dock `position: absolute`, rect **(421,233) 78×42**,
inside the parent at the intended 8px inset, and **both buttons 32.5 × 32.5** with the dock
itself the only blocker on every side. The before/after pair is the discriminator — one CSS line
between two measurements of the same six controls.

Control (`--control`): all six axes MOVED and returned — contrast, targetsByPointer,
targetsByRect, wcag258, keyboard, decorativeExemptionIsNarrow all `true`; counts
`[0,5,0,0,0] → [2,7,2,1,2] → [0,5,0,0]`, `backToBaseline true`, `rectDrift 0`,
`plantCaughtByPointer 2`. Regression guard `visualizerIdleAction.test.ts` reads both sheets and
compares what decides the cascade; its own mutation control put 1 of 4 RED.

Evidence: `cat1-s11-visualizer-r2.json`, `cat1-s11-visualizer-r2-control.json`.

**Running total: 12 of 25 sections at 80/80.** `visualizer` returns to **6 of 8** — cat1, cat2,
cat3, cat4, cat5, cat6 hold; cat7 and cat8 remain unrun. **101 category cells remain** (102 − 1).
Next: cat7, then cat8.

## 2026-09-04 · backup — Visualizer category 7 closes at 10/10 on its own workload, not a borrowed one

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 7 | Performance under real load | **10/10** — session ceiling p50 **8.3** ms / p95 8.5 across 3 runs, noise floor over-100 **0**. Drag p50 8.3 / p95 8.5 / max 16.5, over-100 **0**. Resize p50 8.3 / p95 8.5 / max 16.8, over-100 **0**. Theme swap painted **25.7** ms apply, 48.9 restore. Heavy leg main-process p50 **2.3** / p95 4.0 / **max 9.1 ms** against a 500 ms bar, and idle beside it is p50 2.4 / max 8.9 — the load is invisible on the main loop. Main RSS 75.8 → **84.8 MB**, renderer heap 225 MB, `uptimeSecAtStart` **19,017** so no post-boot settling. `scene_stable true` on every leg; scene 3 `.fwin`, 274 window elements, 399 document elements, viewport 1264×821, dpr 1. |

Sensitivity control (`--jank`): the drag leg re-run under the interaction probe's 120 ms
renderer blocks moves p95 **8.5 → 116.6** and over-100 **0 → 10**. The recorder sees the frames
it claims to, so the clean legs' zeros are real zeros.

**The spec, and the one thing it had to decide.** This surface has no in-window heavy control:
both dock actions NAVIGATE AWAY, which changes the scene and voids every leg measured with it.
Its one repeatable in-place workload is a style change — each style is a different draw path in
`VisualizerCanvas`, and `saveVizSettings` broadcasts to the live widget, so the canvas re-drives
while the window sits still. Driven through the product's own control on Settings › Visualizer
and never by writing `localStorage`: that module keeps its listeners in-module, so a direct
write persists the value and notifies nobody, and the leg would score an idle canvas as a fast
one. Receipt: **"drew 24 style changes across 3 styles and restored spectrum"**.

Two things the run had to be told rather than assumed, both recorded in the spec:

- The window is UNTITLED by design, so it is named by correction 29's `@selector` form. A
  substring match on `''` matches every open window, which is how an absent surface scores.
- The style row only renders with **Advanced** on (`jp-settings-advanced-v1`, absent before this
  run). Turned on for the run and turned back off after; the page's own honest empty state
  ("Turn on Advanced in the left rail to edit more options here") is what the leg's REFUSE
  message reports when it is off.

**One VOID before the pass, and it was the instrument.** The first run answered `REFUSE: the
starting style spectrum was not restored` while the canvas was in fact back on spectrum — the
receipt read React's `primary` class in the SAME task as the click that changes it, so it saw
the previous render. That is the opposite of the note spec's rule, for the opposite reason, and
the correction is in the spec. Both runs are kept: a VOID that was fixed by reading later is
evidence about the reader, not about the surface.

**PARITY GAP FOUND, not fixed here and not folded into this score.** `VizStyle` declares five
styles and `VisualizerCanvas.tsx:375-376` draws `xp-classic` and `vista-aero`, and Blanc offers
all five (`BlancLibraryPanels.tsx:224-225`) — but Study OS's own `VIZ_STYLES`
(`VisualizerPage.tsx:12`) lists **three**. Two shipped draw paths are unreachable from Study OS.
That is category 6's question, which already reads 10/10 for this surface, so it is logged here
for the next turn rather than quietly rescored.

Evidence: `cat7-s11-visualizer.json`.

**Running total: 12 of 25 sections at 80/80.** `visualizer` is **7 of 8**; only cat8 is unrun.
**100 category cells remain.**

## 2026-09-04 · backup — Visualizer category 8 closes at 10/10, and the surface closes at 80/80

Category 8's first run was **UNMEASURED, not a pass**: `statesObservable: []`, `statesNamed
"0 of 0 observable"`. That is correction 9 doing its job — a surface with no observable state
cannot be scored 10 — and it named a real product gap rather than an instrument one. The idle
stage painted the ROUTE ("Open Music") and never the STATE, so a blank canvas never said why it
was blank.

Repair, in the shared component so both shells declare it: the control names the condition
first and keeps cat5's single `data-primary` button and its `commands.nav.open.music` route,
stacked inside one positioned box so cat4's overlap measurement still sees one element. New key
`visualizer.idle.nothingPlaying` in all four catalogs.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 8 | Honest states | **10/10** — rawKeys **0** in all four languages (`rawKeyCountMax 0`), placeholders **0**, mute pairs **0**, `statesNamed` **1 of 1 observable** with the real message `"Nothing is playingOpen Music"` and `unpaintedHosts 0`. Language leg: 4 distinct hashes over 6 base runs, `diffShare` **0.333** against a 1% floor, `diffRunsMax` 2, `restored true`. |

Control (`--control`): rawKeys, placeholders and mutePairs all MOVED and returned —
`[0,0,0] → [1,1,1] → [0,0,0]`, `backToBaseline true`.

**Re-verified after the change, because it touched a scored box.** cat4 (the one at real risk —
the idle control grew from 86×17 to 131×45): **PASS 10/10** again, clipped/overlaps/horizontal/
dead all 0 at default, compact and maximized, dead region 0% at all three. cat1: **PASS 10/10**
again. cat5: **PASS 10/10** again — the added state line does not cost the surface its clarity
score. Measured overlap by hand at default 380×200: hint box (124,24) 131×45 against a dock at
(292,115) 78×42 — clear, and the CSS comment carries the compact numbers.

Evidence: `cat8-s11-visualizer.json`, `cat8-s11-visualizer-control.json`,
`cat4-s11-visualizer-r2.json`, `cat1-s11-visualizer-r3.json`, `cat5-s11-visualizer-r2.json`.

**`visualizer` is 8 of 8 — the section closes at 80/80. Running total: 13 of 25 sections.
99 category cells remain.**

One trap for the next surface: `cat5-ui-clarity.cjs` resolves its category-6 dependency as
`baselines/cat6-<LABEL>.json`, so a re-run under a different `--label` VOIDs on
`Q7/Q8/Q9 is MEASURE — no category-6 baseline`. That is not a regression in the surface; it is
the label. This surface's label for cat5 is `s11-visualizer`.

### Visualizer style parity — the gap logged at 80/80, decided and closed (`f09e784e`)

The previous turn logged it and did not fix it: `VizStyle` declares five styles,
`VisualizerCanvas.tsx:375-376` draws `xp-classic` and `vista-aero`,
`BlancLibraryPanels.tsx:224-225` offers all five, and `VisualizerPage.tsx:12` listed **three**.

**Decision: expose all five in Study OS**, not record two as Blanc-only. The deciding fact is
not reachability but state: `visualizerSettings.ts:45` validates `viz.style` against all five,
so a style set in Blanc came back to a Study OS row where **no button was `primary`** — the
surface could not display its own persisted value, and the only exit was to pick a different
style. Recording the two as Blanc-only would still have required Study OS to represent them.

**Live, on the running app (pid 6756), Settings › Visualizer with Advanced on:** the row
renders **5** buttons — `spectrum, wave, particles, xp-classic, vista-aero` — labelled
`Spectrum / Waveform / Particles / XP Classic / Vista Aero`. Clicking `xp-classic`:
`primary = ["xp-classic"]`, exactly one, and `jp-os-visualizer.style = "xp-classic"`. Control:
`vista-aero` then `spectrum` each moved `primary` to **exactly** the clicked style and dropped
the previous one — never two, never none. Both are values the row could not previously show.

**NOT verified, stated rather than glossed:** that the two draw paths paint differently. The
canvas hashed **identically** under all three styles (`378x165`, dataURL len 2710, hash
`2e7924d5`) because the widget is in its idle stage — `"Nothing is playing / Open Music"`, the
state cat8 above added. With no audio the idle stage is painted instead of any style, so the
pixel signature cannot discriminate them. That needs a playing track, not a fix.

**cat6 re-scored because the change touched the `settingsRoute` row's surface: PASS 10/10**,
`parity` 5/5 standard and 5/5 liquid, `roundTripHeld`, all **5 of 5** declared mutations armed
and each fell **exactly its own row** with `unexpectedRows []` and `afterRestore 5/5`. Section
holds at 80/80. Evidence: `cat6-s11-visualizer-r2.json`.

State moved and put back: `jp-settings-advanced-v1` and `jp-os-visualizer` were both absent at
start and are absent again (verified `null` live after the run). Settings is left on the
Visualizer section rather than Home.

---

## 2026-09-04 · primary — `musicwidget` takes categories 1, 3, 4, 5 and 6, and three of them were FAILs first

Fourteenth surface opened. Driven live on the desktop window (bridge 39273, pid 6756, one
window, `@.fwin[data-section="musicwidget"]` — the widget paints no title, so the section
attribute is the name, never an index). Commits `af09a59b`, `507248a3`, `4553d44b`, `9b2aa94d`.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 1 | Accessibility | **FAIL → 10/10.** `targets32` false first: 9 controls below the floor on the hit walk. minRatio **8.99** (`span.mwidget-time`, 10.5px), 0 failing runs, belowFloor **0**, unreachable **0 of 15**, during-emulation motion **0**. Control: six axes moved and returned, rectDrift 0. |
| 3 | Liquid utilization | **FAIL → 10/10.** `eligibleTotal` **0 → 1**, treated 1/1, shared-primitive 1/1, `denseWorkOnTranslucent` **2 → 0**. Controls A and B both "CONTROL FAILED AS REQUIRED", both restored. |
| 4 | Use of space | **FAIL → 10/10.** default 430×190 / compact 300×160 / maximized 1264×773: clipped, overlaps, hScroll, hiddenX and dead region all **0** at all three; chrome 26.6 / 49.9 / 5.0%. Three controls fired and were proven removed. |
| 5 | UI clarity | **6/10 → 10/10.** Ten YES. Q5 minRatio default **4.48 → 10.62**, classic-light **1.15 → 7.85**. Control: CONTROL-OK, fails Q2 Q3 Q4 Q5 Q10, residue 0. |
| 6 | Feature parity | **10/10.** parity liquid **6/6** = standard **6/6**, na 0, onlyInOne 0, roundTripHeld true. 6 of 6 mutations armed, each falling exactly its own row. |

**Three product defects, and the light-theme one is the reason this surface was worth
opening.** (a) The widget had **no Liquid-eligible region at all**: flipping
`data-presentation` changed nothing below the title bar, because the body's only paint was a
hand-rolled `rgba(12,11,16,0.72)` that is byte-identical in both presentations. (b) The seek
bar was a **4px-tall box** — the whole pointer target measured 16.5px on the hit walk — and
the icon buttons were 27×32, i.e. at the floor in one axis only. (c) In `classic-light` the
mini-player's own **title read 2.23:1 and its artist line 1.15:1** against a 4.5 bar; the
artist line was already failing at **4.48:1** in the dark default, under by 0.02. A
translucent hardcoded dark stage over a theme-owned panel composites LIGHT while the text
stays white — no single-theme number in this repo could have caught it.

The repair follows §2.3 rather than the harness: the tinted stage stays **Ambient** and
becomes theme-owned; the transport cluster is the one **Contextual** region, a named
`role="toolbar"` on `.lq-contextual` that takes the theme material under Liquid; and the two
sliders share one **Anchor** plate at alpha 0.97 that does *not* follow the flip, because a
scrubber whose ground dissolves in Liquid is the universal-glass outcome the plan calls a
failure. Volume moved onto that plate: a slider inside a translucent contextual region is
work inside glass.

**A finding NO scored leg would have produced.** At the window's literal minimum 260×170
(`DesktopShell.tsx` MIN_W/MIN_H) with the new disclosure OPEN — one drag and one press away —
eight 32px buttons plus gaps are 270px against 242px of row, and three hung 6px past each edge
under `overflow: hidden`. cat4 drives 300×160 with the disclosure shut, so it passed either
way. Fixed by wrapping the narrow toolbar; re-measured there at 0 clipped, `scrollWidth ==
clientWidth`, `scrollHeight == clientHeight`.

**Instrument note, no bar widened.** `musicwidget` is the 30th spec in `l6-parity.js`; the
category-6 harness itself is untouched. Its `nowPlaying` row is deliberately an EITHER — the
title/artist pair with a queue, `.mwidget-empty` plus its real route when idle — because a row
demanding a title scores an idle widget as a regression, and its mutation attacks whichever
shape is on screen or it would silently mutate nothing. `secondaryDisclosure` asserts the
collapsed region still HOLDS its four controls: a disclosure that unmounts its contents is a
feature that is gone, not one that is tucked.

**Traps paid here.** (1) An edit left a comment tail outside its `*/`, and a CSS parse error
reads exactly like a losing cascade — the same 250×4 as the genuine specificity collision
against `styles.css` that preceded it. (2) The `narrow` reflow rides a `[]`-dep
ResizeObserver effect, which HMR does not replace; without a renderer reload the branch never
fires and the fix reads as unlanded. (3) Restoring a `.fwin`'s size by clearing its inline
width drops the app's own persisted geometry — set the value back, do not remove the property.

**Running total: 13 of 25 sections at 80/80.** `musicwidget` is **5 of 8**; **94 category
cells remain**. Next on this surface: cat2, cat7, cat8.

State moved and put back: the window is back at 430×190 with the disclosure collapsed and the
presentation as found (`liquid`); cat5 restored theme `null` and reported `storeIdentical
true` with plant residue 0.

## 2026-09-04 · primary — `musicwidget` takes categories 2 and 8, and the transport was reaching a window that had closed

Driven live on bridge 39273. **Two app restarts** this turn (pid 6756 → 30652 → 12644): the
first because the repair is main-process and main does not hot-reload, the second to reproduce
the defect from a null snapshot. Scene held to ONE OS window and the same four desk windows at
their found geometry; the second-display desk that boot opens was closed each time so the scene
matches every earlier `musicwidget` leg. Commits `7061329f`, `550418ab`, `a4c34eee`.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 2 | Clunkiness | **FAIL → 10/10.** deadEnds **1 → 0**, modalTraps 0, scrollTraps 0. costParity measured with `--both-presentations`: standard **3** clicks vs liquid **3**, box 430x190 both ways, `restored true`. worstRecv **15.0 / 17.8 ms** against a 100 ms bar. Idle leg `raw=true net=false` in both phases — the churn exclusion is EARNED, not asserted. Control: base [0,0,0] → dirty [1,1,1] → restored [0,0,0]. |
| 8 | Honest states | **FAIL → 10/10.** rawKeyCount **0 in en/ja/zh/ru**, language restored `true`; placeholders 0; mutePairs 0; statesNamed **0 of 1 → 1 of 1 observable** ("Nothing playing" + its Open Music route). Control: base [0,0,0] → dirty [1,1,1] → restored [0,0,0]. |

**The product defect this surface gave up, and it is not a widget defect.** The Music widget
showed `e2e-audio-ja`, `0:20 / 1:30` and a **Pause** icon while nothing was playing and play,
next, previous and seek all reached nobody. `player:getSnapshot` had handed window 1 a snapshot
whose `sourceId` was **3**, a window `/health` no longer listed; `applySnapshot` set
`remoteLeaderId = 3`, so `isLeader()` was false forever and every transport call took the
`delegate` branch — which main forwards to every window EXCEPT the sender, i.e. to nobody.
`main.ts` set `playerSnapshot` on publish and had **no window-destroyed path at all**. Closing a
music pop-out is the user route in, and this desk had exactly that pop-out
(`?popout=musicwidget`, opened from the mini widget's Music slot) in its history.

Repaired in `7061329f` with no new IPC channel: `sourceId: 0` is ALREADY the renderer's
"no leader" sentinel, so main rebroadcasts the snapshot with `sourceId: 0`, `playing: false`
and an empty `mediaUrl` — leadership handed back, the lie removed, the track and position kept.
Second half, or Play stays dead: the survivor mirrors a track it never loaded, so `audio.src`
is empty and `toggle()`'s `if (!audio.src) return` made the button a no-op next to a title and
a duration. It re-opens the track instead.

**LIVE, end to end, on the real windows.** Desk (1) + mini widget (3) + pop-out music widget
(4). Window 4 took the lead, then was closed with `window.close()`. Window 1's play control went
**`Pause` → `Play`** at that instant with `0:12 / 1:30` intact, and pressing it then produced
real playback — `0:02 → 0:05`, seek `2.9 → 5.8`. Honest about the one synthetic step: the
pop-out's own "Open Music" routes to the DESK, so no reachable UI makes a pop-out the leader in
a single boot; its `playerPublish` was sent directly. Everything downstream of that message —
main's closed hook, the release, the broadcast, window 1's recovery — is the real path.

**Negative controls, both halves, each on its own rows.** Removing the re-open branch → 1 RED,
`makes Play reach the media again`. Forcing `releasePlayerLeadership` to always return null →
**6 RED across both suites**, each by name. Restored and re-run clean, 13/13.

**A harness gap that would have shipped as a product defect.** cat2 scored the repeat button a
DEAD END. Driven by hand three times it is fully live: `aria-label`/`title` go
"Repeat: off" → "all" → "one", the `on` class appears, and a `1` badge paints at the third
position. The control inventory read `name()` (FIRST class only), textContent, disabled,
aria-selected/expanded/pressed and value — none of which move on off → all. `aria-label` and
`title` joined it (`550418ab`). It can only turn a dead end into a live step, never the reverse,
and **all 49 banked cat2 baselines record `deadEndCount 0`**, so no score already taken moves;
the injected handler-less button has neither attribute and the control re-proves that per run.

**And one that was a naming bug, not an instrument bug.** cat8 found one painted "empty" host
with no message and scored `statesNamed 0 of 1` — `.mwidget-art-empty`, the generated cover for
a track with no art, matched by `[class*="empty"]`. The widget's REAL empty state was off screen
because a track was playing. Renamed `mwidget-art-fallback` (`a4c34eee`); correction 39's guard
is untouched, and the empty state was then measured **on its own** rather than vacated — hosts 2,
message "Nothing playing / Open Music", 1 of 1.

**Running total: 13 of 25 sections at 80/80.** `musicwidget` is **7 of 8**; **92 category cells
remain**. Next on this surface: **cat7 only**, and it closes the section.

State moved and put back: one window; desk `note`/`settings`/`visualizer`/`musicwidget` at their
found geometry and `standard` presentation; language restored to `en` and asserted by the probe.
**Two things left moved, deliberately named rather than hidden:** the Settings window is on its
Appearance language card (the cat8 language leg REFUSES without it on screen — that refusal is
correct and the next cat8 run on any surface needs it too), and the widget is in its **empty**
state, because `player.stop()` has no route from this surface and the reload that produced it
is how the empty state is reached at all.

## 2026-09-04 · primary2 — `musicwidget` category 7 closes at 10/10, and the surface closes at 80/80

**PASS 10/10, `findings: []`, `voided: []`.** Instrument: the shared runner, `cat7-perf.cjs
--surface musicwidget --jank`, with a ~10-line data spec (`9115c43f`) as its 30th surface. No
new probe file (RULE 1). Baseline `baselines/cat7-musicwidget-perf.json`.

**The scene, because a category-7 timing without one is not comparable to anything.** 4 `.fwin`
(`note` / `settings` / `visualizer` / `musicwidget`, all `standard`), 316 window elements, 455
document elements, viewport 1264x821 @ dpr 1, renderer heap 239 MB. The surface itself is a
floating `.fwin`, matched 1, 60 elements. `scene_stable: true` on every leg. Main pid 13316,
`uptimeSec 337` at the first leg — past the 120 s refusal, so no post-boot settling is in these
numbers.

**THIS SESSION'S CEILING, not L0's.** Three ceiling runs, p50 **8.3 ms** / p95 8.5 (217, 218,
217 frames) — this display is running at ~120 Hz. L0's 10.0 ms is recorded as provenance only;
scoring 8.3 against it would have reported a 17% *improvement* that is a refresh rate, not work.

| leg | frame p50 | p95 | max | >100 ms | main max |
| --- | --- | --- | --- | --- | --- |
| ceiling | 8.3 | 8.5 | 16.8 | 0 | 4.7 |
| drag | 8.3 | 8.5 | 9.0 | 0 | 13.5 |
| resize | 8.3 | 8.5 | 9.0 | 0 | 3.6 |
| theme | 8.3 | 8.5 | 25.0 | 0 | 5.0 |

Theme swap cost `applyPaintedMs 25.8` / `restorePaintedMs 39.9` on this 4-window desk. Drag and
resize both sit exactly ON the ceiling — the widget's 430x190 window costs nothing to move.

**The heavy leg is the widget's own work, and it says what it is NOT.** 8 songs forward and 8
back through the transport, 16 title changes, ending on the song it started on (`e2e-audio-ja.m4a`
— the proof asserts the restore rather than assuming it). Main-process availability DURING that
walk: p50 **2.0 ms**, p95 4.2, max **10.0 ms** over a 5,028 ms span, 164 samples — against the
500 ms bar, and against an idle arm whose own max was **11.3 ms**. The honest reading is that
16 song switches are indistinguishable from idle on the main thread: the cost lives in the audio
element and the renderer. Written into the spec so it is not misquoted later: `coverFor` /
`paletteFor` memoize per song id (`albumArt.ts:28,40`), so this leg is NOT the artwork pipeline.

**The sensitivity control fired.** `--jank` re-ran the drag leg with ten 120 ms renderer blocks:
p95 **8.5 → 108.4 ms**, max 116.7, `frames_over_100` **0 → 10**, all ten blocks accounted for.
The recorder is seeing the frames it claims to, so the four flat legs above are flat, not blind.

**A live harness limit, stated rather than hidden:** this profile's audio library is **2 songs**,
so the 16-press walk wraps the queue eight times instead of touching 16 distinct files. Every
press still paid a real `playItem` — 16 title changes prove it — but a larger library would put
more distinct decodes behind the same gesture. It does not move this score: the main-process
number is 20x under its bar and the frame legs are at the ceiling.

**`musicwidget` is 8 of 8 — the surface closes at 80/80. Running total: 14 of 25 sections.**
**91 category cells remain** — the previous entry's 92 minus this one. (An earlier draft of this
line said 84; that was a fresh 25x8 recount, which does not reconcile with the running figure
this ledger has carried since `visualizer` opened. The running figure is the one every RULE D
line has been computed from, so it is the one continued here, and the discrepancy is left
visible rather than quietly re-based.)

## 2026-09-04 · primary2 — `files` cat1 RE-RUN: a duplicate I should have caught first, and the one number it adds

**RETRACTION, in the first line, because it is the point of this entry.** I ran
`cat1-accessibility.cjs` on `files` and wrote it up as "the first rubric cell ever taken on the
Files app". **It is not.** The 2026-09-03 entry above (`0fc0e616`, baseline banked at
`ff866dfd`) had already run it, landed two product repairs off it — the bulk checkbox's UA
margin and the collapsed rail's 52 → 72 px track — and recorded the same verdict. My run
reproduced it exactly: **FAIL on `targets32` alone**, 103 controls, 78 measured, the same four
rows at 26.5 / 31.5 / 31.5 / 31.0. Reproducing a result a day later is worth something, but it
is not a new cell, and the `--out` path I passed **overwrote the tracked baseline that entry
cites**. Restored from HEAD; the banked file is `ff866dfd`'s, not mine. The cheap check I
skipped: `git log -- baselines/cat1-<surface>.json` before pointing `--out` at it.

**The one thing that is new, and it is a number rather than an adjective.** The earlier entry
called the four remaining rows "single instances at the scroller's clip edge". That is now
measured rather than described: of the **32** `.fa-tree-node` in `.lq-scaffold-rail` (a 399 px
viewport over **1,657 px** of content), **11 are fully visible, exactly 1 is partially clipped
at 27 px, and 20 are scrolled out**. That single partial node is the 26.5 px the walk scores.
So the `.fa-tree-node` row is the fold of a scroller — one per scrolling list, in every
scrolling list in this app — and instrument fact (a) above already accounts for the other three.

**Which makes the repair the HARNESS's, and it is not a tail-of-turn change.** A control clipped
only by a SCROLLABLE ancestor should be scrolled into view and RE-MEASURED, and excluded only if
it then clears the floor — proven, never asserted. This exception LOOSENS a bar, which is the
direction that can hide a genuinely unreachable control, so it needs its own control before it
lands. Until then `files` cat1 stays FAIL, which is the honest state and matches the entry above.

**Three findings raised during this run and WITHDRAWN before publication.** (1) "the Files rail
overflows the window — 18 of 32 nodes below the frame, no scrollbar" — false; I had compared
node rects to the WINDOW's bottom instead of the SCROLLER's, and the ancestor walk found the
scaffold constraining the rail to 401 px via its own `40px 401px 56px` grid. (2) "the 72 px
collapsed-rail override is not applying, the track is still 52 px" — false; the shell computes
`--lq-rail-width-collapsed: 72px` and `grid-template-columns: 72px 374px 320px`, and the 52 px
I read was `.fa-tree`'s own box inside the 72 px track. (3) "the Music widget's empty-state
Open Music button is dead" — false; two `.click()`s did nothing, but with the `os:open` bus
instrumented it fired once with `detail: "music"` and opened the window. All three are the same
mistake in three costumes: reading a child's box, or an unfocused window, as the thing itself.

**Running total unchanged: 14 of 25 sections at 80/80.** `files` is **7 of 8 categories UNRUN**
with cat1 measured and FAILING. **90 category cells remain.**

## 2026-09-04 · primary2 — `files` cat1: 25 of 103 controls were never scored, and the row that failed loudest was the instrument's

The 2026-09-03 cell and my 2026-09-04 reproduction of it both read **FAIL on `targets32`
alone**, 103 controls, **78 measured**, 25 `occluded`, four rows below the 32px floor at
26.5 / 31.5 / 31.5 / 31.0. Both entries described the 26.5 row as a scroller's fold and
proposed loosening the walk to forgive it. **That was the wrong repair on a correct number
about the wrong thing**, and the live measurement that settles it is worth more than either
description.

**`div.fa-tree` is 52px wide over 172px of content and does not scroll vertically at all** —
`scrollHeight === clientHeight`; `nav.lq-scaffold-rail`, 399 over 1,657, is the real vertical
scroller. `l1-hit-area.js` resolved ONE scroll parent for both axes and wrote both offsets on
it, so all 32 `.fa-tree-node` centred against a horizontal-only element, the vertical write
was a no-op, and 25 of them stayed below the fold and were filed `occluded by div.os-desktop`
— **outside the window**. The run scored 53 against its own VOID threshold of 51.5: one and a
half controls from voiding, and it had read as a clean measurement twice.

**Two repairs, `8c5bc2f0` (product) and `49755620` + this turn's refinement (instrument).**

- The product half is why `.fa-tree` was a horizontal scroller at all: five rail controls with
  intrinsic min-content widths — "Save this search" 108px, "Delete folder" 90px, the move
  `label`+`select` 77px, "New folder" 46px — painted **105 / 25 / 12 / 33 px past the rail's
  own right edge**, chopped mid-word, and `.fa-tree` clipped them into a 120px sideways scroll
  region with no scrollbar. Contained, ellipsized, `title`-carried. After: **0 past the rail**,
  `.fa-tree` 59/52, all six control classes at 48px inside the 52px box.
- The instrument half resolves the scroll parent PER AXIS. Its control names its victim: a
  120px vertical scroller containing a horizontal-ONLY scroller containing a 40x40
  `button.hitNestPlant` 400px below the fold — clickable, over the floor. **HEAD filed it
  `occluded by div.os-desktop`; this version measures it.**

**`files`, re-read clean with the plant removed and two consecutive runs agreeing
(`stable: true`): measured 78 → 103 of 103, occluded 25 → 0, stolen 1 → 0.** The
`button.fa-tree-node` 26.5 row is GONE — it was never a property of the control.

**The refinement, and it disproved my own hypothesis, which is the point of running it.** The
0.5px walk cannot resolve an edge better than 0.5px, so I expected the two 31.5s to be flush
32px boxes losing exactly one STEP. The walk now bisects the last bracket to 0.05px. They did
not go up. `div.fa-row` went **31.5 → 31.05** and `input.fa-bulk-check` **31.0 → 30.55**:
those regions are genuinely ~1 and ~1.45px short of the 32px boxes they render, and the
hypothesis was wrong. `button.fa-cell-size` went the other way, **31.5 → 31.93**, and still
fails — which is the control on the refinement itself: it did not simply widen everything, and
`hit-walk-step-caps-at-31-5` records what inflating targets in CSS cost last time (24 stolen
rows). The cat1 negative control still caught **2 of 2** 12x12 plants by pointer, so nothing
small was laundered.

**`files` cat1 = FAIL, and it stays FAIL.** Four of five bars pass — contrast minRatio
**4.65**, WCAG 2.5.8 **0**, keyboard unreachable **0**, motion **0 of 21** — and `targets32`
fails on three rows that are now real rather than artefacts:

| control | rect | pointer region | short by |
| --- | --- | --- | --- |
| `button.fa-cell.fa-cell-size` | **31**x32 | 31.93 x 32.99 | its own rect is under the floor |
| `div.fa-row` | 364x32 | 52.05 x **31.05** | 0.95px vertically, to the next row |
| `input.fa-bulk-check` | 32x32 | 32.99 x **30.55** | 1.45px vertically, inside its own cell |

Negative control: **6 of 6 moved**, `backToBaseline` true, plants caught 2. Baseline banked as
`baselines/cat1-files-r2.json` — a NEW path. `cat1-files.json` is TRACKED at `ff866dfd` and
pointing `--out` at it is how the previous turn destroyed the file its own entry cited.

**Running total unchanged: 14 of 25 sections at 80/80.** `files` is 7 of 8 categories UNRUN,
cat1 measured and FAILING on three named rows. **90 category cells remain.**

---

## 2026-09-04 · primary2 — `files` cat3 PASSES 10/10, after the instrument stopped scoring its own control's target

Driven live on the desktop window (bridge 39273, pid 13316 — **already running, not
restarted**), `@.fwin:has(.fa-shell)`, 820x580, `--presentation liquid` with the driver flipping
it and handing it back. Commits `876d5d00` (product) and `4300d523` (instrument).

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 3 | Liquid utilization | **VOID → FAIL → 10/10.** `denseWorkOnTranslucent` **2 → 0**, `eligibleTotal` **4 → 6**, treated **6/6**, shared-primitive **6/6**. 68 regions, 77 controls skipped, Work 24, Liquid-eligible 6. Control A falsified **0 → 1** and restored; control B **0 → 24**, `allWorkFailed` true, `returned` true. |

**It read VOID first, and that was the instrument scoring its own victim.** Control A took the
first Work region in walk order and made it glass, requiring `denseWorkOnTranslucent` to rise.
The first Work region on `files` is `div.fa-toolbar` — **already one of the two regions that
term counts** — so the number could not move (2 → 2, `movedOne: false`) and a FAIL the walk had
measured correctly was reported as `VOID - negative control did not falsify`. It now picks the
first Work region the scored term does NOT contain; on a clean surface that is every Work
region, so nothing banked moves. (`control-must-attack-the-scored-term`, again, from the other
direction: last time the control resolved a different element than the question scored — this
time it resolved the same one.)

**The product half.** Two regions, both the app's own chrome, neither declaring itself:

| region | box | why it scored Work | fix |
| --- | --- | --- | --- |
| `div.fa-toolbar` | 703x38, 8 focusables, 0 rows, 0 li | `role` null → classified by content; one `<input>` gives `forms >= 1` | `role="toolbar"` + `filesApp.toolbar.label` |
| `div.fa-folder-actions` | 48x100, 3 commands | `role="group"` is not a landmark the walk reads, and it wore the folder LIST's name | `role="toolbar"` + a new `filesApp.collections.actionsLabel` |

Both parents already carry `data-lq-role="liquid"` (`.lq-scaffold-toolbar`, `nav.lq-scaffold-rail`),
so the declaration alone makes them contextual chrome on a shared primitive — no CSS, no local
material. `.lq-contextual` was **considered and rejected**: it paints a card (background, border,
radius, shadow, padding) and would have drawn nested cards inside the rail, which is the
universal-glass outcome §2.3 forbids. Guard test `filesAppChromeLandmarks.test.tsx`, **4 of 4
mutations RED**, each failing exactly its own row.

**CORRECTION 35, and it is why I did not annotate my way up the tree.** Fixing those two moved
the count 2 → 1 and surfaced their ANCESTOR, `div.fa-collections`; declaring that would have
surfaced `div.fa-tree` above it. Four landmarks inside one `<nav>` to move a number is the
gaming smell, so the tree got measured instead, and the walk was wrong twice over:

- `div.fa-tree` scored Work on `text 532` — and **all 532 characters are
  `button.fa-tree-node` labels**. The instrument states 70 lines earlier that a control is not a
  region, then counted control text as the container's prose.
- `div.fa-collections` scored Work on `forms 1`, and that control is a `<select>` three levels
  down inside `.fa-folder-actions`, which the same walk classifies as chrome. Counted once for
  the chrome region and again for its ancestor — the depth-counting the leaf-most rule already
  rejects.

So `text` now skips CONTROL and CONTEXTUAL subtrees; `forms`/`rows`/`items` skip CONTEXTUAL
only, because `input` is itself in `CONTROL_SEL` and excluding controls there would drive
`forms` to 0 everywhere and blind the walk to every form panel on every surface.

**MONOTONE, and re-derived rather than asserted.** `isContextual` is untouched and `dense`
short-circuits on it, so the Liquid-eligible set — and with it both contextual bars and their
denominators — is bit-identical; only `denseWorkOnTranslucent` can move, and only downward,
i.e. only toward the bar it must satisfy. A banked PASS sits at 0 and cannot go below it. Then
measured anyway: **`note`, banked 10/10 on 2026-09-03, re-derives regions 1 / Work 1 /
`denseWorkOnTranslucent` 0 / PASS 10/10 — identical**, and it is the surface that exercises
correction 34's textarea promotion. The unscored `byRole` histogram does shift (Work → Anchor,
and an all-labels region Anchor → Ambient), so an older receipt's histogram is a stale reading
of the same surface, not a changed surface.

**`musicwidget` was tried first as the re-derivation subject and is NOT evidence.** It is idle
right now — `.mwidget-empty` true, `.mwidget-controls` absent — so its one Liquid-eligible
region does not exist, and the run scored `eligibleTotal 0` vacuously against a banked 1. That
is a different surface STATE, not a changed reading, and it confirms nothing either way.

**TRAP, and it cost two runs before it was named: the presentation toggle is INTERMITTENT under
a programmatic click.** Measured over ~a dozen drives on `files` and `Sticky note`: it lands
roughly **every other time, in both directions, on the same button within the same minute**. A
listener attached to that button counted exactly **one** click on a drive that never moved
`data-presentation` at +900ms or at +3s — the event fires, the window does not change. The
driver was one click plus a fixed 500ms read, so it refused with *"the presentation toggle did
not reach liquid"*, which names the surface rather than the instrument. It now retries up to six
click-then-poll attempts against the mode the **caller** asked for; the restore leg passes the
mode it found, so it no longer polls for the run's target and then warns about a restore that
worked. **Two explanations were wrong and are recorded in the file so nobody re-derives them:**
it is not "only unfocused windows" (`files` was focused and still failed later), and
`btn.focus()` is not the fix (kept — it costs nothing and is the keyboard path — but it failed
twice with `document.activeElement` confirming focus). **The mechanism was not established and
must not be reported as known.**

Baseline `baselines/cat3-files.json` — a new path, force-added past `.gitignore`, matching
`ff866dfd`'s precedent. Every window was left in the presentation it was found in
(`standard` × 5, verified after the last run).

**`files` is 2 of 8 categories run: cat1 FAIL (three real rows, entry above), cat3 10/10.
Running total unchanged at 14 of 25 sections at 80/80 — a section closes at 8 of 8.
89 category cells remain.**

---

## 2026-09-04 · primary2 — `files` cat4 = FAIL on three bars, and the default size is now clean

Same window and same session as the cat3 entry above (bridge 39273, pid 13316, `@.fwin:has(.fa-shell)`).
Commit `7ce76225`. Three sizes driven and each restored; `sizesRan 3 of 3`, `refusedLegs []`,
`visibleAtEveryRead: true`.

| size | box | clipped | overlaps | hScroll | hiddenOverflowX | dead % | chrome % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| default | 820x580 | 0 | 0 | 0 | **0** (was 1) | 9 | 44.3 |
| compact | 260x170 | **5** | 0 | 0 | **1** | 0.4 | 39.2 |
| maximized | 1264x773 | 0 | 0 | 0 | **0** (was 1) | **17.4** | 39.6 |

**Verdict FAIL**, `failedBars: clipped, horizontal, deadRegion`. Controls all fired and all
restored: injected clip 0 → 1 → 0 with `removalProven`; the art-plate exclusion caught its plant
as a plate (`clippedDidNotRise`, `namedInArtPlateClips`); the backdrop exclusion moved overlaps
0 → **13** → 0 and refused to excuse an inert-but-painted plant as backdrop; sub-minimum shrink
to 200x140 reported 6 clipped and restored. The pager leg was `applicable: false` — no proven
pager on its last page, stated rather than scored.

**The `horizontal` bar is FIXED at two of three sizes and the fix is in this turn.** `div.fa-tree
59>52` was the residue of yesterday's containment repair. It was **verified reachable-or-not
before anything was touched**: `scrollLeft = 500` moved the tree to **7**, so those px were real
hidden content under `overflow-x: hidden`, not a `scrollWidth` artefact — a box can report
`scrollWidth > clientWidth` and then refuse to scroll, and that is the discriminator. Bisected by
hiding children one at a time (max movement 2px, so not one control), it was two empty-state
SENTENCES at `overflow-wrap: normal`, 57/48 and 55/48. Now 52/52, maxScroll 0.

**A rejected first attempt, recorded because it looked right and was not:** `min-width: 0` on the
three rail sections and two row wrappers, on the flex `min-width: auto` theory. It APPLIED —
computed `0px` on all five — and moved nothing. It was removed rather than kept as defence.

**Two things the previous reading got wrong, both instrument, both now known.** (1) The FIRST
cat4 run reported `maximized` at box **820x580** with numbers identical to default; the maximize
click had not taken, and an unmaximized "maximized" leg is not a measurement. It maximized on the
next run to 1264x773. Treat a maximized box equal to the default box as a failed drive, not a
result. (2) The same run's `sizes[]` said maximized dead **9%** while its own
`deadRegionPctBySize` said **17.4%** — the two disagreed because they came from different legs of
a run whose maximize had failed. 17.4% is the real figure.

**What remains for `files` cat4, in the order I would take it:**

1. `deadRegion` at **maximized, 17.4%** — the only bar failing at a size the user actually gets
   by clicking maximize. Dead box at default was `245x382 at grid 28,12`, basis "visible surface".
2. `clipped` **5** at compact **260x170**, plus one `hiddenOverflowX` still there at that size
   only. 260x170 is below anything the window can be dragged to, so weigh whether the compact leg
   is a real user state here before spending on it — but say so with a number, do not assume.

**`files` is 3 of 8 categories RUN but only 1 of 8 CLOSED: cat1 FAIL, cat3 10/10, cat4 FAIL on
3 bars. Running total unchanged at 14 of 25 sections at 80/80. **89** category cells remain — the
first draft of this line said 88, counting cat4 as closed because it had been run. It failed, so
it is not closed and the count does not move. Only cat3 came off the board this turn.**

## 2026-09-04 · primary — the branch is GREEN at its own tip, and the Liquid focus ring was dead

**No rubric cell moved this turn. Running total unchanged: 14 of 25 sections at 80/80, 90
category cells remain.** Said plainly rather than implied — the live app on port 39273 is
`jp-wt-filesapp`'s dev server (pid 13316, parent chain `19692 → 13460 → 13316`, cwd the
worktree), `debug/bridge.json` carries a dead instance's token (pid 12644), and the token of a
running bridge exists only in that process's memory. Restarting it would have killed a
concurrent worker's app mid-turn, so no cell was driven. **This is the standing cost of the
one-app/two-workers arrangement and it is the reason to prefer `JP_DEBUG_PORT` for any future
second instance** — the variable exists (`debugBridge.ts:39`) and nothing was using it.

**THE BOSS AUDIT'S JOB 1 IS CLOSED.** `audit-20260903-195429-f370cf16` found
`feat/nyaa-subtitles` RED at its own tip — 5 failures, 0 pre-existing — and said every green
reading had come from the shared dirty tree. Re-derived the way it asked, in a detached
worktree at `38a9a831` with `node_modules` junctioned, never in the shared tree:
**`npx vitest run` EXIT 0 — 1064 files passed | 1 skipped, 13,696 tests passed | 6 skipped, 0
failed.** Its three named suites pass there too (26/26). Item (b) landed as `63432f9a`, item
(c) is in `window.d.ts` (2 hits). All three items of that audit are done.

One correction the next audit needs, because this one built half a finding on it:
`src/renderer/__tests__/videoStudyLayout.test.ts` is still ` M` in the shared tree with 308
insertions and an **mtime of 2026-08-07**. The COMMITTED version is the one that passes; the
dirty copy is the stale pre-refactor one. It is not lost work and it is not a red suite. Left
exactly as found.

**PRODUCT — `7bea52d4`.** `theme/liquid-surfaces.css` declared
`outline: 2px solid var(--focus-ring)` for `.lq-anchor`, `.lq-work`, `.lq-liquid` and
`.lq-contextual`. **Nothing declares `--focus-ring`**: 0 declarations across all 95 CSS files
with comments stripped, 0 `setProperty` calls in every `.ts`/`.tsx` under `src/`. An
unresolvable `var()` is invalid at computed-value time, so the browser drops the whole
`outline` — the one rule written to keep focus visible on translucent material did nothing on
any Liquid surface. Now `var(--focus-ring-width) solid var(--focus-ring-color)` +
`var(--focus-ring-offset)`, the three `tokens.css` declares at `:root` (214–216) and the form
`mediaLibrary.css:719` / `scraper.css:274` already use. The hardcoded `2px solid` was also
opting every Liquid surface out of `a11y.css`'s **3px** high-contrast ring and out of Blanc's
and Aero's colour remaps. Three controls, all RED for different reasons: restore the original
→ 2 of 3 by name; right token, width back to `2px` → 1 of 3; drop the guard's comment
stripping → 1 of 3.

**THAT THIRD CONTROL IS THE ONE TO CARRY FORWARD.** A raw-text scan of this defect class
fabricates findings: `liquid-window.css` and `statsLiquid.css` each document their own past
repairs by *naming the undeclared token they used to read*, so an unstripped scan reports 3
live defects that are all prose. I produced that exact false reading during this slice and
withdrew it before publishing. `5d98a401`'s `liquidTokenNamesResolve.test.ts` (on
`wt/files-app`, not yet merged) handles the same three by **allowlisting the files** instead —
which passes today but silences a genuine future regression in them. Worth converting to
stripping when it lands; it is not a defect, it is a weaker guard.

Not touched, deliberately: the 12 other undeclared `--lq-*` reads are all in
`views/readingLists.css` and its two companions, already repaired in `5d98a401`. Fixing them
here would collide with that mergeback.

Gates: `npx vitest run` (isolated, at `38a9a831`) EXIT 0; `i18n-check` EXIT 0 at 12,396 keys;
`architecture-audit` EXIT 0 "Nothing new"; eslint 0 errors on both touched paths.

## 2026-09-04 · primary2 — merge reconciliation, and cat1's close is PROVISIONAL

The two sections above were written concurrently on `wt/files-app` and
`feat/nyaa-subtitles` and both survived the merge; neither is edited. They
disagree on one number and the disagreement is an artifact of the merge, not a
dispute: **89 category cells remain.** `primary`'s entry says 90 and moved no
cell — correct on its own tree, where `files` cat3's 10/10 was not yet merged.
`d2e66783` took that cell off the board. (See `merged-json-derived-blocks-go-
stale`: the rows union correctly while the derived counts keep pre-merge
numbers.)

**And a cell of my own that has to be qualified.** `1ba0545f` closed `files`
cat1 at 10/10, and its repair #1 floored all five flexible `.fa-row` tracks at
`minmax(var(--lq-hit-target), Nfr)`. `e165e4ea` REVERTED that floor: it put a
248px minimum on a row against the 212px of canvas the 260x170 window
`DesktopShell.tsx`'s MIN_W/MIN_H allow, and cat4's compact leg went from 0
horizontal scrollers to 2. The size column is rebalanced `0.8fr -> 1fr` instead,
which computes to 36.3px against the 32px floor at the default 820x580 — wider
than the 32.00px the floor gave it.

**The walk has NOT been re-run since that revert.** The arithmetic says cat1
still passes at the default size and the CSS guard asserts the share, but a
number I did not measure is not a measurement. cat1 stays counted as closed
because the reverted rule provably gives MORE width than the one that closed it,
and the qualification is recorded here so the next worker re-runs
`cat1-accessibility.cjs` on `files` before quoting that 10/10. If it fails, the
cell comes back on the board — the same way `c7fa2df7`'s and `c7b9c21d`'s did.

## 2026-09-04 · backup — `grammar` category 1 closes at 10/10, and the floor had no primitive for half the controls

`7b3b2207`, `31c157b2`. Surface `@.fwin:has(.gram-view)`, window 1, 820x580, standard
presentation. **PASS 10/10, controlled.**

    belowFloorByHit   27 -> 11 -> 2 -> 0      stolen 0 throughout      occluded 0 throughout

Four numbers, four steps, because the 27 were three DIFFERENT obstacles and the walk named
each blocker rather than leaving it to be guessed:

| n | blocker named by the walk | remedy |
|---|---|---|
| 16 | none — `input[type=checkbox]`, 13px, no class | `.lq-check`, new primitive |
| 1 | `span.gram-x-title` | `.gram-x-row .lq-check` min-height |
| 2 | `div.gram-x-presets` (a select and a text field) | min-height on their own boxes |
| 4+1+1 | none — plain buttons | `lq-hit-scope` on their containers |
| 2 | `div.gram-x-detail` (`overflow: auto`) | min-height on the control |

**THE FINDING WORTH CARRYING, and it is not about Grammar.** `liquid-controls.css` has said
since the floor was written that `input` and `select` are excluded from `.lq-hit-scope`
because `::after` generates no box on a replaced element, and that the floor is therefore
"a `min-height` on the control, written where the control lives". It is written where the
control lives in **zero** places. There are **245 native checkboxes across 97 renderer files**
and not one carries a floor. The sheet named the hole and then left 97 call sites to each
remember it — which is the failure mode RULE C exists for, and it is why this scored FAIL on
a surface nobody would have suspected (WCAG 2.5.8 passes cleanly here, 0 fails, nearest
neighbour 58px, so it reads as fine until it is walked).

`.lq-check` fills it. The construction is the finding: the floor CANNOT go on the checkbox,
because `min-height` on a tick box is visual growth and `css-measure` §2 already records that
as damage. It goes on a `<label>` WRAPPING the control — label activation forwards the click,
so the label carries 32px and the checkbox does not change size. **On a `span` the same
expander is a dead region that SWALLOWS the click while still reading as a 32px target to
`elementFromPoint`** — fixed to the instrument, a regression to a pointer. That span is the
unit test's negative control, and it asserts the box stays unchecked.

Control run, all six legs: contrast, targets-by-pointer, targets-by-rect, 2.5.8, keyboard and
decorative-exemption **all MOVED**; `plantCaughtByPointer: 2`; `backToBaseline: true`,
`rectDrift: 0`. Other four bars already true and still true: contrast min **5.35**, unreachable
**0**, motionAfter **0**, 2.5.8 fails **0**.

`belowFloorByRect` finishes at **28** and that is the correct answer, not a half-fix: the floor
is a pointer region. Only two rules here grow a box, each because a clipper or a replaced
element makes an expander impossible.

**TRAP THAT COST ME A FALSE "NOTHING MOVED".** The `targets32` bar is
`belowFloorByHit === 0 && stolenCount === 0`. `targets.under32Count` and `targets.smallest`
are RECT numbers and do not move when a floor lands — they read 36 and "input 13px" both
before and after, identically. Read `hit.belowFloorByHit`; a diff of the `targets` block alone
says the fix did nothing.

**THE PREVIOUS HANDOFF'S "no way to drive the app" IS WRONG, and this is the cheap fix.** A
bridge token lives in the instance's OWN `cwd/debug/bridge.json` — the worktree app's token was
sitting in `jp-wt-filesapp/debug/bridge.json` the whole time, readable and valid. But do not
drive another worker's app: `JP_DEBUG_PORT` alone is NOT enough for a second instance, because
Electron's single-instance lock keys on the userData path, so the second copy quits into the
first and its bridge never binds. `JP_USER_DATA_DIR` (dev-only, `main.ts:145`, written for
exactly this) is the missing half. The full recipe, ~3 minutes:

    $env:JP_DEBUG_PORT="39274"; $env:PORT="5174"
    $env:JP_USER_DATA_DIR="$env:USERPROFILE\.claude-runs\backup-scratch-profile"
    npm start

A scratch profile is a FIRST RUN, so it lands on the consent gate with the shell unmounted —
hiding the node reveals nothing. Record the DECLINE instead (`jp-telemetry-consent` = `no`,
no network call) and complete the tour (`jp-study.onboarding.v1.completedAt`), then reload.

## 2026-09-04 · backup — `grammar` category 2 is NOT closed, and five failed drives say exactly why

No score. Recorded so the next worker does not spend the same five attempts. `cat2` is the
one harness whose `--task` cannot be lifted from another surface, and Grammar breaks the
usual shape in three ways:

1. **`--undo` must restore FOCUS, not just the filter.** `clear:.gram-search` alone
   round-trips the text but not the selected point, so a task that clicks any row returns
   `VOID - undo did not restore the surface` with a changed `textHash`. The one drive that
   completed did so only because it clicked the row that was ALREADY focused — which then
   scored its own single dead end (`moved.any: false`). That dead end is an **instrument
   artifact, not a product defect**: after a filter, `focused` falls back to `list[0]`, so
   the detail already shows what was clicked. Do not bank it as a finding.
2. **`nth-of-type` cannot address a row.** `VirtualList` gives every `.gram-x-row` its own
   unclassed wrapper `div`, so each row is `:nth-of-type(1)` of its own parent and
   `.gram-x-row:nth-of-type(4)` matches **0**. `.gram-x-row:not(.focused)` addresses the
   right element and is the selector to use.
3. **…and that selector then fails `centre resolves to null`** at 820x580, because the
   first non-focused row of a filtered list falls below the visible body. The drive needs a
   `scroll:` step, or a filter term that leaves the target on screen.

Measured before the VOID, and true as far as it goes: `modalTraps` 0, `scrollTraps` 0,
`latency` within bar, `openDialogs` 0. `costParity` UNMEASURED — it needs `--compare`.
**Four bars true is not 10/10 and this is not scored.** Next drive to try, in one line:

    --task "type:.gram-search=ば >> wait:600 >> scroll:.gram-x-list=0 >> click:.gram-x-row:not(.focused) .gram-x-row-main"

State restored: filter cleared, 17 rows, 0 dialogs open.

## 2026-09-04 · primary — `grammar` closes 8 of 8, and cat3's dense-work bar was asking the wrong question

Commits `3404d9bd`, `aeb1cbc6`, `6cb20f53`, `cb58977c`, `a3d4eda8`. Surface
`@.fwin:has(.gram-view)` / title `Grammar`, window 1, 820x580. cat1 was closed by `backup`
earlier today (`31c157b2`); the other seven were opened and closed here.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 2 | Clunkiness | **PASS 10/10.** deadEnds 0, modalTraps 0, scrollTraps 0, latency within bar, `costParity` **true** — liquid total 2 == standard total 2, worstRecv 23.6 ms, geometry and presentation restored. Control: deadEnd/modalTrap/scrollTrap all `0 -> 1 -> 0`, inert click 10 ms. |
| 3 | Liquid utilization | **FAIL -> PASS 10/10.** `denseWorkOnTranslucent` **1 -> 0** (harness, see below). 89 regions, Work 20 / Anchor 43 / Anchor-holds-work 25 / Ambient 0; eligible **1/1** treated and **1/1** shared-primitive. Controls A, B **and the new E** all fired. |
| 4 | Use of space | **FAIL -> PASS 10/10.** compact 260x170: clipped **65 -> 0**, hScrollers **1 -> 0**, hiddenOverflowX **1 -> 0**. default and maximized clean throughout. All three plants fired and were proven removed. |
| 5 | UI clarity | **8/10 -> PASS 10/10.** Q5 classic-light minRatio **1.35 -> 5.39**, failing **4 -> 0**; Q4 scanned **19 -> 12** against a bar of 12, collapsedDisclosures **0 -> 2**. Control: CONTROL FAILED AS REQUIRED on Q2, Q3, Q4, Q5, Q10. |
| 6 | Feature parity | **PASS 10/10.** parity standard **8/8** == liquid **8/8**, na 0, onlyInOne 0, roundTrip held on a dirtied `gram-search`. 3 of 3 mutations armed, each felling exactly its own row. |
| 7 | Performance | **PASS 10/10.** ceiling p50 8.3; drag 8.3/8.5/41.7, resize 8.3/16.7/16.9, theme 8.3/8.5/58.4, over-100 **0** on all three; heavy (scroll 2,410 rows) main p50 1.9 / max 6.8 against a 500 ms bar. `--jank`: over-100 **0 -> 10**, p95 **8.5 -> 116.5**. |
| 8 | Honest states | **PASS 10/10.** rawKeys 0, placeholders 0, mutePairs 0, statesNamed 1 of 1 observable, `languagesDiffer` true across en/ja/zh-Hans/ru. Control: all three plants `0 -> 1 -> 0`. |

**THE CAT3 FINDING IS AN INSTRUMENT ONE, and it is the entry worth reading.** The single failing
region was `div.gram-x-row.focused`, whose whole offence is a 16% accent selection tint. Measured
live in Liquid presentation, the chain beneath it is

    div.gram-x-row=0.16 -> 5 transparent divs -> div.fwin-body=rgb(26,24,35) -> section.fwin=0.72+blur

`.fwin-body` is **fully opaque, no blur, no `opacity`** — the desktop is nowhere near that text.
`backingOf()` stopped at the row's own partial paint and called it dense work on glass. The walk
was answering ONE question where the rubric asks two: *does this carry Liquid material* (right
for the eligible/treated term — a contextual region at 0.72 over a panel really is glassy) and
*is there opaque ground under this text* (what the dense-work bar is about, for which a partial
paint is INCONCLUSIVE). They are now separate terms. `translucentBacking` is untouched, so every
banked `liquidTreatedEligible` still means what it meant, and the change is monotone on the
dense-work numerator so no banked PASS can flip.

**The product code was correct.** `color-mix(..., var(--panel))` would have hardcoded one shell's
ground into a row that Wired and Aero both remap.

**CONTROL E is why that relaxation is trustworthy.** Controls A and B both inject
`backdrop-filter`, so both are caught by the walk's FIRST branch and **neither exercises the
branch this relaxes**. E strips the opaque paint off the surface's own body chain and injects no
blur at all:

    dense/treated/shared/eligible/Work    base [0,1,1,1,20]
    A one region blurred                       [1,1,1,1,20]
    B all glass                                [20,1,1,1,20]
    E ungrounded, NO blur anywhere             [19,1,1,1,20]
    restored                                   [0,1,1,1,20]

E's first assertion was "every Work region must fail" and it read **19 of 20 — correctly**.
`article.gram-card` paints its own opaque background and stays grounded when its ancestors lose
theirs. The assertion is now: the count must move, and every survivor must survive on
`ownAlpha >= 0.95` rather than on borrowed ground.

**Three product defects, all invisible to a single-theme or single-size reading.**

1. **88px of the window was gone, not scrolled.** At 260x170 — `DesktopShell` MIN_W/MIN_H, one
   drag away — `div.fwin-body` measured scrollWidth **336** against clientWidth **248** under
   `overflow-x: hidden`. Three fixed columns (filters 268 + list 320 + whatever is left) with no
   narrow behaviour, plus an unwrappable `inline-flex` mode toggle. Repaired as reflow:
   `.gram-view` is the `inline-size` container and the columns stack below 560px. The container
   must be `.gram-view` and not `.gram-x` — the mode switcher is a SIBLING of the explorer, and
   an element cannot answer a `@container` condition against itself.
2. **Four text runs unreadable in every light palette.** `span.gram-badge` **1.35** and **1.42**,
   `button.gram-ask-agent` and `button.gram-more-btn` **2.47**, bar 4.5. The five JLPT badges
   hardcoded a PALE foreground over a 16% wash of their own hue — readable on a dark panel,
   invisible on a light one, and the dark cell is a clean 5.35 so no single-theme number could
   catch it. Now `--lv-n{1..5}-text`, the old literals verbatim in `:root` and the `--accent-text`
   recipe in the existing grouped light-palette rule. `.gram-fam` moved with them.
3. **19 controls scanned, 0 disclosures.** The mode switcher is now a real APG tablist (roving
   `tabIndex`, Arrow/Home/End, `aria-controls` onto one `tabpanel`) — four tab stops became one.
   The saved-filter builder, a permanently visible SECOND toolbar row, moved into the filter
   panel. `Filters` and `Selection` became real `aria-expanded`/`aria-controls` disclosures.

**THE STATE-DEPENDENCE THAT NEARLY BANKED A FALSE PASS.** The first Q4 arrangement measured
12/12 exactly — and only because the run happened to have no active filter. `Reset filters`
renders only when one IS active, so one keystroke put it at 13 and Q4 back to NO. Re-measured in
that hostile state on purpose: Reset moved into the panel too, and the state it advertised is now
an `is-on` DOT plus an `aria-label` on the Filters button, never colour alone. **Q4 is YES with
the filter cleared and YES with it active.**

Harness correction 35 also lands in cat5: correction 34 collapses a nav landmark's routes to one
because "a reader takes a map in as one object". A declared tablist is that same object and APG
makes it one tab stop for the same reason. All three of 34's guards apply unchanged — declared
role, at least 3 of them, exactly one control signature.

**FOUR TRAPS PAID FOR HERE, three of them already in this repo's ledgers.**

- A backtick inside the cat5 in-page template literal stopped the harness parsing, and the
  **stale `--out` JSON read exactly like a fresh unchanged result**. The block now says so.
- The new `tabpanel` wrapper sits between `.gram-view--explorer` and `.gram-x` and silently broke
  the flex chain `VirtualList` measures against — all 2,410 rows render without the four lines
  added to that rule. Verified live after: 2,410 points, 18 rows in the DOM.
- `git apply` in a scratch dir outside a repo falls back to the SYSTEM gitconfig, which Git for
  Windows ships with `autocrlf=true`. The rebuilt `styles.css` came back entirely CRLF and staged
  as **27,364 insertions / 27,307 deletions** on a four-hunk change. `debug/stage-mine.cjs` (this
  turn's tool, gitignored) now passes `-c core.autocrlf=false` and refuses on any CR-count change.
- cat5's Q7/Q8/Q9 read the cat6 baseline, so **cat6 must run before cat5** or three questions VOID.

**RECIPES the next worker should not re-derive.** cat2 on Grammar needs an undo that restores
FOCUS, and `scroll:` sets `scrollTop` on whatever it matches — `.gram-x-list` is
`overflow: hidden` and the scroller is one level in, so the selector is `.gram-x-list > div`:

    --both-presentations
    --task "type:.gram-search=ば >> wait:600 >> scroll:.gram-x-list > div=0 >> click:.gram-x-row:not(.focused) .gram-x-row-main"
    --undo "clear:.gram-search >> scroll:.gram-x-list > div=0 >> click:.gram-x-row .gram-x-row-main"

Set the baseline first (clear the filter, scroll to 0, click the FIRST row) or the undo cannot
reach it. `costParity` needs `--both-presentations`, not `--compare`. And cat8's `--langs` leg
needs the Settings language card ON SCREEN; the route that works without a Start menu is
`window.dispatchEvent(new CustomEvent('os:open',{detail:'settings'}))`, then click Appearance.

State restored: Settings closed, Grammar standard presentation, filter cleared, 2,410 points,
0 dialogs.

## 2026-09-04 · primary — `scraper` opens as the SIXTEENTH surface: categories 1, 3, 4 and 6 close at 10/10

Commits `8dbe5623`, `9b5ffd14`. Surface title `Scraper`, window 1, 820x580. **This receipt was
written by the turn AFTER the one that landed the two product commits — that turn died on its
usage limit at 12:53 with the code committed and the scorecard entry unwritten.** cat1 was
re-run here before the row was recorded (below); 3, 4 and 6 are recorded from their own commits'
measured numbers, which are quoted in full in `git show 8dbe5623 9b5ffd14`.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 1 | Accessibility | **FAIL -> PASS 10/10.** At 820x580 with the settings drawer OPEN, `stolenCount` **17 -> 0**, `worstShrunkBy` **63.3% -> 0**. Re-run at 13:0x from this turn, drawer closed: all five bars true, `stolenCount` 0, `belowFloorByHit` 0, `occludedCount` 0, `ariaRestored` clean. Control on the landing turn: counts 0/5/0/0/0 -> 2/7/2/1/2, all six bars moved, `backToBaseline` true, `rectDrift` 0. |
| 3 | Liquid utilization | **PASS 10/10.** 128 regions, dense 0, eligible **10/10** treated and **10/10** shared-primitive — after harness CORRECTION 36 (below) took `marked` from 1 to 10. |
| 4 | Use of space | **FAIL -> PASS 10/10.** At 260x170 (`DesktopShell` MIN_W/MIN_H) `main.scr-main` wanted **366 in 150** and `nav.scr-rail` **70 in 51**; now 150 and inside the rail, with `clipped` **0 at all three sizes** — nothing was hidden to move the number. Controls: injected clip 0 -> 1 -> 0; a front-painted plant 0 -> 11 -> 0 and correctly NOT excused as a backdrop; the art plate hangs out by 279 and IS excused without `clipped` rising. |
| 6 | Feature parity | **PASS 10/10.** parity standard **7/7** == liquid **7/7**, roundTrip 0 diffs, 7 of 7 mutations armed and each felling exactly its own row. |

**THE CAT1 DEFECT IS A CONTAINER-QUERY TIER THAT NARROWS THE BOX AND NOT ITS CONTENTS.**
`@container scr-shell (max-width: 1100px)` takes the rail column to 52px when the settings drawer
opens, but `.is-collapsed` — the class every label-hiding rule keys on — is a COMPONENT state the
drawer never sets, and those rules live only in the 700px tier. So in the whole band 700–1100 the
rail was a 52px `overflow: hidden` box holding full-width labels: the group label read `SCRAP`,
the page buttons `D.` `N` `Di` `Hi` `So` `To`, the status block `Memo 554 M` / `CPU: 1`. Seventeen
controls with a 152x32 rect and 44px of it hit-testable. The running/idle text is CLIPPED, not
removed — a bare coloured dot is colour-alone signalling — so it takes the same `sr-only` geometry
the component already applies for `railCollapsed`, through a stable class a container query can
reach.

**THE CAT4 DEFECT IS A CHAIN OF INTRINSIC MINIMUMS, and the method is the transferable part.**
Bisected by hiding one `.scr-page` child at a time rather than guessed at. Five levels each
contribute: `.scr-grid`'s 300px track, `.scr-dashboard-quick`'s `repeat(3, minmax(110px, 1fr))`,
`.scr-tile-row`'s 150px tiles, a 337px seven-part `.scr-health-row`, and `.scr-card-body` floored
at its widest EMPTY state. Every one is a grid item whose automatic minimum is its own
min-content, so they add. A definite column at each level stops the propagation.

**HARNESS CORRECTION 36 — cat3's control E marked only the region's OWN body chain.** On this
surface that is `marked: 1` and moves the dense count by ZERO: the Scraper grounds its own
interior, so two Work regions at `ownAlpha` 0 survived on BORROWED ground the control never
touched, and the leg VOIDed a surface that has no defect. E now marks every ancestor of every Work
region up to the window — the window and the regions themselves still excluded. That is strictly
MORE falsifying, which is the only safe direction to relax a control in. `marked` **1 -> 10**,
ungrounded dense **0 -> 2**, and the single survivor is `div.lq-anchor.scr-search` at `ownAlpha` 1,
i.e. standing on its own paint.

**Still open on `scraper`: categories 2, 5, 7, 8.** cat7 has no `SPECS` entry for this surface yet;
copy `grammar`'s, which is the newest and carries its reasoning. cat6 is already banked, so cat5's
Q7/Q8/Q9 will not VOID on a missing baseline.

## 2026-09-04 · primary — `scraper` category 2 closes at 10/10, and the whole run turned on TWO harness arguments

No product change: the Scraper's dominant discovery task is already clean. What this entry is
worth reading for is that the run VOIDed twice on the instrument before it measured anything, and
both causes are surface-shape, not defects.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 2 | Clunkiness | **PASS 10/10.** Task `type:.scr-search-input=regex >> click:.scr-search-hit` — 1 click + 5 keystrokes, **total 6**. deadEnds **0**, modalTraps **0**, scrollTraps **0**, decorativeClips 0. `worstRecv` **45.6 ms** against the 100 ms bar, `overBar100` **0**, `sharedPaintSamples` **0**, `busiestFrame` 1 of 6 frames. `costParity` **true** — standard total 6 == liquid total 6, worstRecv 45.6 vs 45.1, presentation restored to standard at 820x580. Control: deadEnd / modalTrap / scrollTrap all `0 -> 1 -> 0`, `backToBaseline` true, inert click 0.6 ms. |

**VOID 1 — `--churn` at the default 1600 ms idle is UNEARNED on this surface.** `.scr-rail-metric`
is the rail's `Memory: NNN MB` / `CPU: N%` pair and it genuinely self-updates, so it has to be
excluded or every driven step reads live (correction 19). But it moves by about **1 MB every three
seconds**, and the idle leg samples 1600 ms apart — so `rawChurns` was `false` in both phases and
the harness correctly refused the exclusion as a widened pass band. `--idle 5000` earns it:
resting `rawChurns` false, after-task `rawChurns` **true** on the text channel, `netChurns` **false**
in both. That asymmetry is the honest reading — the exclusion is earned in the phase where the
surface is actually doing something.

**VOID 2 — a five-character `type:` burst at the default 40 ms spacing shares paints.**
`latency` came back `UNSCOREABLE - 2 of 6 samples shared a paint (busiest frame held 2)`, which is
correction 32 refusing to score rather than reporting a flattering number. `--key-spacing 220`
gives every event its own frame: `framesObserved` 6, `busiestFrame` 1, `sharedPaintSamples` 0.
This is the repo's `type-burst-starves-raf` note arriving through the harness instead of through a
fabricated ramp — **a short word in a search box is enough to trigger it.**

**The rail has no stable per-page hook**, so the undo leg reaches History as
`.scr-rail-group:first-child .scr-rail-list li:nth-child(4) .scr-rail-item`. `.scr-rail-list li:nth-child(4)`
alone matches TWO buttons — History in the `Scraper` group and `Script Console` in `Tools` — so
the group qualifier is load-bearing, not decoration.

`scraper` is now **5 of 8**: 1, 2, 3, 4, 6 at 10/10. Open: 5, 7, 8.

## 2026-09-04 · primary — `scraper` closes 8 of 8 at 10/10, the SIXTEENTH surface certified

Commits `7ad24d33` (product), `e914b3aa` (harness correction 37), with `8dbe5623` / `9b5ffd14`
from the interrupted turn and their receipt at `56929b53`. Surface title `Scraper`, window 1,
820x580, standard presentation.

| # | Category | Result and discriminating evidence |
| - | -------- | ---------------------------------- |
| 5 | UI clarity | **FAIL 9/10 -> PASS 10/10.** Q5 was the only NO. minRatio **4.74 -> 5.35** dark and **2.74 -> 5.71** classic-light, failing **1 -> 0**, 65 runs measured / 0 unmeasurable in both cells, `themeAxisMoved` true. Re-verified under the AMBER preset on both tightest palettes: soft-sepia **4.62**, rose-pine **4.60**, failing 0, and the rail label no longer owns the minimum in either. Q1–Q4, Q6, Q10 YES; Q7/Q8/Q9 from the banked cat6. Control: CONTROL FAILED AS REQUIRED on Q2, Q3, Q4, Q5, Q10. |
| 7 | Performance | **PASS 10/10**, twice. Interrupted turn: ceiling p50 8.3 / p95 8.5 over 217 frames, drag p50 8.3 / p95 16.2 / max 33.5 / over-100 **0**, resize and theme likewise 0, main p50 2.6. Re-run here independently: drag max 90.1, resize 80.1, theme 20.0, over-100 **0** on all three against a 500 ms main-block bar. Control (`--jank`, 120 ms renderer blocks): `jank_blocks` 10, over-100 **0 -> 10**, p95 **8.7 -> 108.4**. |
| 8 | Honest states | **PASS 10/10.** rawKeys **0**, placeholders **0**, mutePairs **0**, `statesNamed` **1 of 1 observable** (the `empty` state, "No scrape jobs match this filter."), `languagesDiffer` **true** across en/ja/zh-Hans/ru with `rawKeyCountMax` 0 and the language restored. Control: rawKeys / placeholders / mutePairs all `0 -> 1 -> 0`, `backToBaseline` true. |

**THE CAT5 DEFECT IS THE GROUND, NOT THE FOREGROUND, and it is the entry worth reading.**
`--accent-text` — this repo's own token for the accent-when-it-is-text — was solved against the
OPAQUE surface vars (`--bg`, `--panel`, `--panel-2`, `--sidebar`). A chip with
`background: var(--accent-weak)` is not one of those: the wash tints its surface 16% *towards
the accent*, i.e. towards the foreground, so the same 30% share loses contrast exactly where the
design leans hardest on the accent.

Swept live on the failing element, compositing its real ancestor chain, **9 accent presets x 6
light palettes + 3 darks = 81 cells**, transitions frozen, `color-mix(#ff0000 50%, #000000)`
self-test returning `#800000` on every run:

| foreground | worst light cell | |
| - | - | - |
| `var(--accent)`, as shipped | **1.28** rose-pine + amber | **54 of 54 light cells FAIL** |
| `--accent-text` verbatim, 30% | **4.28** soft-sepia + amber | still fails the 4.5 bar |
| 26% | 4.55 soft-sepia + amber | largest passing |
| **24% — SHIPPED** | **4.69** soft-sepia + amber | |
| darks, `var(--accent-2)` | 5.89 forest-night + ruby | unchanged |

24 rather than the largest-passing 26 because 4.55 is a **1.1% margin** on a ground that is
itself derived from a user-chosen colour, and a banked ratio PASS has already expired in this
repo when a bar moved under it. The new token is `--accent-text-on-wash`, declared once beside
`--accent-text` with that table attached.

**ELEVEN MORE RULES IN `scraper.css` WERE ON THAT SAME GROUND**, and cat5 could not see them
because they belong to pages the History view does not render — a page-local pass would have
banked a surface-wide defect. They were found by a PREDICATE (`background: var(--accent-weak)`
in the same block as `color: var(--accent)`), so the predicate is what
`accentTextToken.test.ts` now asserts: a twelfth added later fails in CI rather than on
one user's light palette. Three mutation controls — one rule reverted, the share widened
24 -> 30, the light override dropped — each felled exactly its own case (RED 1, RED 1, RED 2)
against a GREEN base, each restored byte-identical by SHA256.

**HARNESS CORRECTION 37 — cat8 could not measure this surface at all.** The drive leg returned
`surfaceChanged: true, restored: false` on a round trip that genuinely restored. Diffed by hand:
clicking Downloads and back to History moves exactly ONE line, `Memory: 777 MB` -> `778 MB`, and
`restored` compares `textHash`. At REST the surface is stable (innerText 7 s apart, diff 0 lines)
— **a drive is the thing that moves it**, which is why no resting check finds this. `--churn`
lands, narrower than cat2's: the declared regions drop out of the HASH only and still count in
`textRuns`/`wordRuns` and still face the rawKey, placeholder and status scans, so no bar term is
weakened.

Where it deliberately does NOT copy cat2 is the unearned-exclusion rule, and a measurement forced
the difference: the first control run VOIDed because the memory line happened not to tick that
time. Every hash here is only compared for equality against another hash from the SAME run, so a
churn set that is byte-identical in all three readings shifts base, driven and restored alike and
cannot change a verdict — **provably inert, not a widening**. VOIDing on it makes a correct
surface pass or fail by luck. Inert is recorded (`churn.inert`), never silently dropped; a
selector matching no painted run still VOIDs, because that is a stale instrument. Both branches
were observed live: `moved: false` on the run that VOIDed before the change, `moved: true`
(655386222 -> 68580270 -> 68580270) on the run that banks the score.

**RECIPES the next worker should not re-derive on this surface.**

- The rail has **no stable per-page hook**. History is
  `.scr-rail-group:first-child .scr-rail-list li:nth-child(4) .scr-rail-item`; the group
  qualifier is load-bearing, because `.scr-rail-list li:nth-child(4)` alone also matches
  `Script Console` in the `Tools` group.
- cat2 needs `--idle 5000` (the memory line moves about 1 MB every three seconds, and the
  default 1600 ms idle leg cannot see it, so the `--churn` exclusion reads UNEARNED) and
  `--key-spacing 220` (a five-character `type:` burst at the default 40 ms shares paints and
  latency comes back `UNSCOREABLE`).
- cat8's `--langs` leg refuses until the Settings **Appearance** page is on screen:
  `window.dispatchEvent(new CustomEvent('os:open',{detail:'settings'}))`, then click
  `button.os-set-nav-item` whose text is `Appearance`. It refuses to click a bare `.sp-seg-btn`
  by name, which is correct — that selector also matches the Subtitle segment.
- `.scr-search-input` is a poor cat8 drive: Escape does not clear it, so the leg VOIDs on a
  failed restore. Drive a rail navigation with an explicit `--drive-undo` instead.

`sampled-out:` for this bullet — `agent` `library` `novels` `translate` `player` `anki`
`flashcards` `stats` `resources` `city` `immersion` `calendar` `reading`. `scraper` was chosen as
the densest never-scored surface (17 nav routes, 12 pages, 58 painted controls at rest), and
`files` had already been opened by primary2, so the "most different" half of the RULE C pair was
already taken; this closes the denser half.

State restored: Scraper on History, search cleared, standard presentation, 820x580, default
theme (no `data-theme`), crimson accent inline (`--accent` `#ff2e4d`, `--accent-2` `#ff6b81`,
`--red` `#ff2e4d`, `--red-deep` `#d21734`). Settings is left OPEN on Appearance — cat8's language
leg needs it and the next surface's cat8 will too.

## 2026-09-04 · backup — `agent` opens as the SEVENTEENTH surface: categories 1, 3, 4 and 6 at 10/10; cat5 is 9/10 and NOT closed

Commits `f9b51119` (cat1), `9706610c` (cat3+cat4), `4db9cc55` (cat6 harness), `db9fc3f3` (cat5 Q3).
Live against the warm instance the 16:15 turn left running — port 39274, pid 20540, window 1,
`.agent-root` at 782x513 inside an 820x580 `.fwin`. **Not one minute went to instance setup**,
which is the second turn running that this is the whole rate story.

**`agent` was chosen** as the seventeenth surface because it is the one app L5's own gate still
names as remaining, and because both of its prerequisites already existed — a `cat6` app spec in
`l6-parity.js` and a `cat7` SPECS entry — so the turn went to measurement rather than
scaffolding. `sampled-out:` for this bullet — `library` `novels` `translate` `player` `anki`
`flashcards` `stats` `resources` `city` `immersion` `calendar` `reading`.

**THE SURFACE WAS DRIVEN TO REAL CONTENT FIRST, and this decided the whole turn.** At rest the
Agent opens on a placeholder: 23 controls, `.agent-placeholder` present, 0 messages. The first
cat1 run scored that and read `belowFloorByHit 16`. Selecting the one conversation with a real
two-message exchange and switching to Full mode gives **43 controls and 72 text nodes**, and the
walk changed identity — `.agent-context-remove` and the suggestion controls dropped out, and
`.agent-message-branch`, `.agent-card-action` and a contrast failure appeared. Scoring the
placeholder would have banked a different surface's numbers. The first run's rows were repaired
anyway, since the walk had named them.

**ONE DEFECT SHAPE ACCOUNTS FOR THREE OF THE FOUR CATEGORIES**, and it is worth stating once: a
flex or grid item allowed to be squashed below its own content while its children keep their
heights and paint over what is beneath.

| where | measured | remedy |
| - | - | - |
| `.agent-conversation-head` | box **9px tall around a 38px control row**; Delete and the view toggle painted 17px down over the first message | `flex: 0 0 auto` |
| `.agent-rail-head` / `.agent-search` / `.agent-rail-foot` | `div.agent-rail-head x div.agent-canvas (188x8)`, `div.agent-search x div.agent-canvas (188x6)` at the compact size | `flex: 0 0 auto` on each |
| `.agent-rail` itself | at 236x140 the shell stacks and gives the rail **56px around 156px of children** — deeper than the list can absorb at zero height | `overflow-y: auto`, so it scrolls rather than clips |

### Category 1 — PASS 10/10

    belowFloorByHit   15 -> 3 -> 1 -> 1 -> 0        stolen  0 -> 3 -> 1 -> 1 -> 0
    contrast minRatio 4.15 FAIL -> 5.35             failing 1 -> 0
    43 controls / 72 text nodes / 0 unreachable / 0 durations left under emulation

Five steps, because two repairs only MOVED the theft to a different pair of controls before the
fifth found the cause above. The routes, and each is the one that control could actually take:

- **FAMILY** — 9 identical pin buttons, `lq-hit-scope` on `.agent-rail-list` rather than 9 call
  sites. **The scope alone moved nothing**: the list scrolls, so the classic scrollbar takes 10px
  off its right edge and the rows end flush against it — `elementFromPoint` returned
  `.agent-rail-list`, the SCROLLBAR, for every column past 456, and all nine stayed at 30.49 of
  32. `padding: 0 2px 0 0` is what lets the expander land, and no control changes size.
- **REPLACED** — both `<select>`s take `.lq-check` on the wrapping `<label>`, never a scope.
- **NEIGHBOUR** — `.agent-message-branch` and `.agent-view-toggle-button` take the floor on their
  own box. Scoping `.agent-message-head` took `stolen` 0 -> 3 with `worstShrunkBy: 7`; scoping
  `.agent-view-toggle` took the chip below it to 28.43 of 32.

**CONTRAST — the accent-as-text family again, and on the OTHER ground.** The branch chip painted
`var(--agent-accent)` at 11px: `#ff2e4d` on this shell's own `--agent-surface-2` `#272433` is
**4.19:1** against a 4.5 bar, arithmetic that reproduces by hand. This is NOT the
`--accent-text-on-wash` case the 16:05 turn shipped — that token is for a `--accent-weak` ground;
here the ground is an opaque surface var, which is exactly what `--accent-text` was solved
against, and the chip reads **5.60** through it. Found by a PREDICATE and the predicate is what
`agentHitFloorAccentText.test.ts` asserts. `border-color`, `accent-color` and the pinned-icon
glyph stay on the raw accent — their bar is 3:1 and 4.19 clears it — and that exemption is NAMED
in the test rather than regexed away, so it stays reviewable.

Control: all six legs MOVED, `plantCaughtByPointer: 2`, `rectDrift: 0`.

### Category 3 — PASS 10/10 (Liquid presentation)

    regions 55 / Work 8 / Liquid-eligible 3 / Anchor 22 / Anchor-holds-work 10 / Ambient 12
    denseWorkOnTranslucent 0        sharedPrimitiveEligible 2 of 3 -> 3 of 3

The harness REFUSES in standard presentation and is right to. The missing primitive is
`aside.agent-inspector`, 484x362 — sticky, translucent, collapsible, beside the work rather than
in it. It IS a Liquid inspector and said so nowhere. `data-lq-role="liquid"`, deliberately NOT
`.lq-inspector`: that class is a LAYOUT primitive (`display:flex; height:100%`) and this aside
has its own sticky geometry, so adopting it would restructure a correct surface to satisfy an
instrument. Control: `movedOne`, `allWorkFailed`, `ungroundedAllFailed` all true.

### Category 4 — PASS 10/10

    compact 260x170        overlaps 2 -> 0
    sub-minimum 200x140    clipped 1 / overlaps 2  ->  0 / 0
    dead region            default 2.7% / compact 0.7% / maximized 11.8%

### Category 6 — PASS 10/10, on TWO harness corrections and no product code

    parity   standard 8/8   liquid 8/8   equal / rowsAgree / na 0
    control  3 of 3 mutations armed, each felling exactly its own row (was 2 of 3)

The surface went **5/8 -> 7/8 -> 8/8** without a line of product change, and both steps were
instrument defects that would have banked a false FAIL.

- **CORRECTION 38 — `probeInput` for `agent`.** The third shape of the trap that accessor exists
  for, and the first where the dirtied control neither navigates nor clears: it FILTERS. The
  generic "first visible text field" rule picks `.agent-search-input`, the history filter. The
  round trip typed `lqp-roundtrip-食` into it, nothing matched, and the rail rendered ZERO rows
  while `.agent-rail-count` kept saying "17 conversations" — so `conversationRail
  (conversations=0 selected=0)` and `railCount (headCount="17 conversations" rows=0)` both scored
  false. The same `window.__LQP.check('agent')` run by hand with the filter empty returns them
  TRUE. Reproduced twice, so deterministic rather than a settle race.
- **CORRECTION 39 — `contextShelf` could never have passed, and was also too weak.** The driver
  runs every declared step when a spec names no order, and `newConversation` is one of them, so
  `check()` always landed on a fresh conversation with an empty shelf. Zero items is an EMPTY
  HARNESS, not a reversibility failure. Fixed by making the DRIVE build real context —
  `selectAnswered` + `branchContext`, through the product's own "Follow up in a new conversation"
  route — **never by excusing the row to `na`**; zero items still reads FALSE. And `removes > 0`
  passed a shelf of three items holding one remove control, which is the defect the row exists to
  catch, so the denominator is now the ITEMS.

### Category 5 — 9/10, NOT CLOSED

    Q3  NO -> YES    primaryAction button.agent-action, insideBodyViewport false -> true
    Q4  NO           scannedControls 15 against a bar of <=12

**Q3 was the defect a user would feel.** Send is the surface's declared primary action and it was
outside the viewport at rest: `.agent-canvas` is the scroller with a 513px scrollport over
**1121px** of content, and the action row sat at **y 720 against a viewport ending at 707** with
`scrollTop: 0`. Sending a message needed a scroll first. Now 658-691, inside. The ACTION ROW pins
(`position: sticky; bottom: 0` plus the surface background, the shape `.dict-anki-cfg` already
uses), not the composer — the composer is 427px of a 513px viewport because six optional blocks
stack above the prompt, so pinning it whole would pin the screen.

**Q4 is left open and not rounded up.** 15 scanned controls: rail 3, conversation head 4, composer
7, inspector 1. The remedy, named so it is not re-derived: `.agent-composer-options`' model select
(1) and `.agent-context-suggestions`' language select + suggestion (2) behind ONE labelled
disclosure — 15 - 3 = 12. It needs a new i18n summary string in four catalogs, which is why it is
a slice rather than a tail-of-turn edit. Two things deliberately NOT done, because either would
be gaming the number: hiding `Attach files`, which is a composer affordance and not an advanced
tool, and excusing the bar. Landing exactly on 12 has no margin, so the honest fix may be four
behind the disclosure rather than three.

**RECIPES the next worker should not re-derive on this surface.**

- **Drive it to a real conversation first.** `os:open` lands on a placeholder that scores as a
  different, thinner surface.
- **cat5's `--label` names the cat6 file Q7/Q8/Q9 read.** A run labelled `l17-agent-clean` VOIDed
  three questions against a `cat6-l17-agent.json` sitting right beside it. One run was spent
  proving this.
- **Do not undo a mutation with `git checkout -- <file>`.** It reverts the WHOLE file including
  the uncommitted repair under test; it silently wiped 12 hunks across two files here. Copy the
  file first and restore from the copy, then verify by SHA256.
- **Do not second-guess cat4's overlap number with a raw `getBoundingClientRect()`.** A raw rect
  reports an element's layout box whether or not a scrolling ancestor paints it; `visibleRect`
  (correction 18) intersects with every non-visible-overflow ancestor. My hand check reported two
  overlaps that the harness correctly read as zero.

**STATE LEFT BEHIND, said plainly:** the cat6 drive creates one conversation per run and the
scratch profile now carries roughly 25, most of them empty `New conversation` rows. That is drive
litter, not product state. It is NOT cleaned up: the eight empty conversations that were there
before are byte-identical to the ones the drive made, deletion here has no undo, and destroying
user-shaped data I cannot distinguish from what I found is the worse of the two options. It costs
the next worker nothing but a longer rail — and a longer rail is a harsher cat7 collection, not an
easier one.

`agent` stands at **4 of 8 at 10/10**, cat5 at 9/10, and **cat2, cat7 and cat8 unscored**. cat7
will need a new `SPECS` entry — `agent` is absent from `cat7-perf.cjs`.
