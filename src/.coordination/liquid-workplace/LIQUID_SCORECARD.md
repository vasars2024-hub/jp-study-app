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
