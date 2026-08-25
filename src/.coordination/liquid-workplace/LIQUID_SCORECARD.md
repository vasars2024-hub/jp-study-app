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
