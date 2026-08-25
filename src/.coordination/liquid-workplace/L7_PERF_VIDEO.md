# L7 — rubric category 7 on the VIDEO window (the Media Center)

Separate from `L7_PERF_DICTIONARY.md` on purpose: that file is 1,200 lines about a different
surface, and category 7 is scored per surface. Instruments: `tools/liquid-interaction-probe.ps1`
(legs 1), `src/.coordination/liquid-workplace/probes/l7v-burst.cjs` (legs 2 and 4),
`probes/l7c-mem-sampler.ps1` (leg 3). Baseline: `PERF_BASELINE_RESTART.md`.

## 2026-08-25 · primary — first measurement on Video. Category 7 is **NOT 10**, on a product number

**Real restart, as the rubric requires.** The dev app was stopped (forge pid 5372) and `npm start`ed
fresh; main pid **30480**, bridge up 75 s later, three windows restored — `Media` 820×580 `standard`
/ `Video` 1080×700 **`liquid`** / `Dictionary` 820×580 `liquid`, `forest-night`, `en`. The scored
surface was driven to its loaded state first: Library / `Recently added`, **8 cards, 49 controls,
355 nodes, 1,234 chars** — an empty harness caps this category at 0, and the media windows restore
at 18 chars.

### Leg 1 — gestures on the Video window. PASSES.

Display compositor ceiling measured the same session: **17.1 ms**.

| gesture, `-Title Video` | runs | frames over 33 ms | frames over 100 ms | worst frame |
| --- | --- | --- | --- | --- |
| drag | 9 | **0** ×9 | **0** ×9 | 17.6 |
| resize | 3 | **0** ×3 | **0** ×3 | 17.1 |
| theme switch | 2 | 1, 1 | **0** ×2 | 33.5 |

`closedLoop=True` and `title=Video` on every gesture record. **Jank control FIRED**: the same drag
with 10×120 ms renderer blocks reads p95 16.9 → **116.9**, frames over 100 **0 → 12**.

**One number to carry forward, stated rather than scored:** theme *restore* costs **50.7 / 50.3 ms**
here against L0's settled **23.6 ms**. L0 was recorded on a two-window desktop with no Media Center;
this is three windows with a 355-node library. Not isolated this turn, so it is not called a
regression and not called clean either. Apply is 26.2 / 22.7 vs L0's 20.0.

### Leg 2 — the longest main-process block under this surface's real work. **FAILS.**

Bar: no main block over **500 ms**. `/health` is answered on main's own loop, sampled every 120 ms
through an 18-control burst of the Media Center's own dominant-task path (whole rail, both kind
chips, both view densities, six sidebar destinations, a series drawer opened and closed).

| run | samples | p50 | p95 | MAX | over 500 ms, attributed |
| --- | --- | --- | --- | --- | --- |
| 1 | 53 | 2 | 3 | **3,117** | not attributed — the probe could not say which control |
| 2 | 53 | 1 | 3 | **1,910** | `nav:Review` **1,150**, `nav:Study Mode` **1,910** |
| 3 (control) | 54 | 2 | 36 | **2,076** | `nav:Review` **1,020**, `nav:Study Mode` **2,076** |

**Two of this surface's own sidebar destinations block main for 1.0–3.1 s**, reproduced on three
independent runs. Run 1's unattributed max is why the sampler now stamps each sample with the step
in flight — a max nobody can act on is not a finding.

**The sensitivity control fired, and weakly — recorded as measured.** 600 `dict:lookup` calls onto
main moved p95 **3 → 36 ms**, a 12× move that proves the sampler responds to added main load, but it
never reached the 500 ms bar. The stronger proof is the product's own: the instrument reported
1,910 ms and 3,117 ms blocks, which is exactly the shape the rubric asks a category-7 probe to be
able to see. A decisive named control (uncached terms, higher count) is the next small step.

### Leg 4 — what the burst costs main. Transient, not a leak.

Main private over one burst: **429.1 → 526.6** (+97.5), **528.1 → 713.4** (+185.3), **447.1 → 599.5**
(+152.4) MB. Three minutes later, quiet, `Get-Process` reads **450.9 MB / 1,123 handles** at 5.9 min
uptime — so the burst's peak comes back unprompted and this is not the 604 → 7,082 MB shape the
Dictionary surface once had.

### Leg 3 — IN PROGRESS, not claimed.

`l7c-mem-sampler.ps1` is running against pid 30480 at marks **8 / 16 / 24 min**, writing
`%TEMP%\l7v-mem-video.jsonl`; header verified `marks:[8.0,16.0,24.0]` (the array-bind trap). At
the **8-minute mark has landed**: main RSS 359.2 MB, **private 448.1 MB, 1,121 handles**, 6
processes, all-process private 1,510.8 MB. L0's band for a settled main is **550–577 MB**, so this
boot sits **101.9 MB below the bottom of it** at 8 min — recorded as a number, not as a pass,
because the Dictionary leg was scored on the 16- and 24-minute marks and those are not in yet.

**Verdict: category 7 on Video is NOT 10.** Leg 1 passes with room and its control fires; leg 4 is
clean; leg 2 fails on a reproduced product number. The next slice is `Review` and `Study Mode` —
find what those two destinations run on main and move it off the loop — then re-drive leg 2.

### Leg 3 — COMPLETE on this boot (pid 30480). Flat.

| mark | uptime | main private | handles | all-process private |
| --- | --- | --- | --- | --- |
| 8 | 8.01 min | 448.1 MB | 1,121 | 1,510.8 MB |
| 16 | 16.01 min | 447.1 MB | 1,120 | 1,555.6 MB |
| 24 | 24.00 min | 447.1 MB | 1,125 | 1,502.5 MB |

**448.1 → 447.1 → 447.1 MB, handles +4 over 24 minutes**, and every mark is 102–103 MB *below*
the bottom of L0's 550–577 MB band. Not an idle control and better than one: ten IPC-firing
attribution probes ran inside the 16→24 window. `main RSS` moves 359.2 → 70.1 → 84.4 and carries
no information — that is the Windows working-set trim this sampler exists to disclose.

## 2026-08-25 · primary — leg 2's block ATTRIBUTED and FIXED: `mining:listFrequencyDicts`

`6620ab71`. The previous section could name two destinations and not a call. `l7v-attribute.cjs`
drives ONE `window.api` call at a time with 2.5 s of quiet either side, sampling `/health` at
40 ms — because the burst advances every 260 ms while a mount effect's work lands whenever it
lands, so a block opened by `Readiness` is routinely stamped `Review`, which is exactly what
happened.

| call fired alone (pid 30480, pre-fix) | samples | p50 | MAX |
| --- | --- | --- | --- |
| `miningListFrequencyDicts` | 54 | 2 | **1,270 ms** |
| `ankiStatus` | 54 | 2 | 3 ms |
| `ankiGetIntervals` | 55 | 1 | 3 ms |
| `ankiGetIntervalsForNotes` | 54 | 1 | 3 ms |
| `studyGet` | 53 | 1 | 3 ms |
| idle/quiet baseline | 183 | 1 | 13 ms |

**Negative control fired**: the same schedule with every payload replaced by a same-shaped no-op
gave MAX 3 ms on all five and `OVER 500 none`. The 1,270 ms is the product's.

**The defect.** `mining:listFrequencyDicts` answers with six summary fields and read every rank
table in full to do it, three times per call — the bundled-provisioning sync, the large-list
preference, and the listing, whose cache `ensureAllFrequencyDictionariesReady` invalidated
*unconditionally immediately before it ran*. `bundled-freq-ja-jpdb-v2.json` is **20.10 MB /
550,408 ranks**, measured at 68 ms read + 269 ms parse. Both Media Center destinations reach the
IPC on mount through `currentStudyReadinessFingerprints()` → `miningListFrequencyDicts()`.
Tradeoff taken: a bounded 64 KB head read with brace-matching and a **full-parse fallback**, over
a summaries sidecar — no schema, no second source of truth, and a file this module did not write
is still listed. Ranks are untouched; `resolveCustomFrequencyRanks` still loads the whole table.

### Re-measured after the fix — real restart, main pid **1324**

`miningListFrequencyDicts` **1,270 ms → 3 ms**, cold cache, and the answer is unchanged: 4
dictionaries, `entryCount` 550,408 / 486 / 321 / 390, `enabled` true/false/true/true — i.e. the
large-list preference still holds. Nothing else moved (MAX 3–5 ms).

| leg 2 run, `--title Video` | samples | p50 | p95 | MAX | over 500 ms |
| --- | --- | --- | --- | --- | --- |
| 1 | 56 | 1 | 3 | **3** | none |
| 2 | 55 | 1 | 2 | **50** | none |
| 3 (+`--sensitivity`) | 57 | 1 | 3 | **53** | none |

All 18 controls `ok` on every run; surface 8 cards / 49 controls / 350 nodes / 1,234 chars before
and after. Was 3,117 / 1,910 / 2,076 ms.

**THE DECISIVE CONTROL, and leg 2 would be VOID without it** (`l7v-control.cjs`). `--sensitivity`
only ever reached 36–53 ms, an order of magnitude short of the bar it is meant to prove reachable
— 600 repetitions of one word are absorbed by cache. Distinct generated terms, escalating:

| planted on main | samples | p50 | MAX |
| --- | --- | --- | --- |
| 600 distinct `dict:lookup` | 129 | 1 | 41 ms |
| 3,000 | 123 | 1 | **1,127 ms** |
| 12,000 | 201 | 2 | **9,030 ms** |
| idle/quiet | 173 | 1 | 12 ms |

Monotonic, and the sampler catches a >500 ms main block on this surface in this session. Leg 2's
"none over 500" is a measurement, not an unmeasured surface.

### Leg 1 re-run on pid 1324. Display ceiling this session: **17.0 ms**.

| gesture, `-Title Video` | runs | over 33 ms | over 100 ms | worst | L0's own counts |
| --- | --- | --- | --- | --- | --- |
| drag | 5 | **0** ×5 | **0** ×5 | 17.1 | 4 (post-boot) / 5 (settled) over 33 |
| resize | 3 | 1, 0, 2 | **0** ×3 | 33.5 | **8** over 33, **2** over 100 |
| theme switch | 2 | 1, 1 | **0** ×2 | 33.4 | **2** over 33, **1** over 100 |

Every count is at or below L0's, which is what category 7 asks ("no regression against the L0
baseline"). `closedLoop=True`, `title=Video` on every record. **Jank control FIRED**: p95 16.8 →
**116.9**, frames over 100 **0 → 12**.

**The theme-RESTORE number is now attributed, and it is not a regression.** It reads 50.1 / 50.1
ms against L0's settled 23.6 ms, which the previous section left open. Two measurements close it.
(1) **Content is exonerated**: driven to `Home` at **0 cards / 311 nodes** it reads **49.4 / 50.0
ms** — indistinguishable from the 8-card loaded state, so it does not scale with the surface at
all. Six readings across two turns and two content states span 49.4–50.7 ms; this is a fixed
cost. (2) **L0's raw milliseconds are not comparable to this session's**, and this is the trap
worth carrying: L0's ceiling was **10.0–10.3 ms/frame** and this session's is **16.4–17.0**. The
probe measures *two frames painted*, so every frame-bound figure scales with the display —
L0 drag p50 10.0 → 16.8 here, and restore 23.6 ms = 2.35 L0 frames vs 50.1 ms = **3.00** frames
here. Apply is 17.7 / 25.5 / 25.9 / 17.1 ms vs L0's settled 20.0. Never compare a painted-frame
millisecond figure across displays without dividing by the ceiling first.

### Leg 4 after the fix — the burst's cost collapsed with the same defect

Main private over one burst: **426.7 → 430.1 (+3.4)**, **429.5 → 429.8 (+0.3)**, **429.0 → 443.1
(+14.1, the run carrying 600 lookups)** MB. Was +97.5 / +185.3 / +152.4. Those three figures were
main loading a 20.10 MB rank table into its heap three times per navigation.

### Leg 3 re-run POST-FIX on pid 1324 — complete, and flatter than the pre-fix boot

| mark | uptime | main private | handles | all-process private |
| --- | --- | --- | --- | --- |
| 8 | 8.00 min | 445.6 MB | 1,076 | 1,608.0 MB |
| 16 | 16.01 min | 445.9 MB | 1,075 | 1,556.1 MB |
| 24 | 24.01 min | 447.4 MB | 1,077 | 1,567.8 MB |

**445.6 → 445.9 → 447.4 MB (+1.8) and +1 handle across 24 minutes**, 103–105 MB below the bottom
of L0's 550–577 band, on a boot that took three 18-control bursts, a 12,000-lookup control, ten
gesture probes and a partial dead-control sweep. So category 7's memory leg is no longer carried
from the pre-fix boot — both runs are complete and they agree to within 1.5 MB. `main RSS` reads
264.9 → 64.4 → 53.7 and again carries nothing but the Windows working-set trim.

**Category 7 on Video: 10/10.** All four legs measured on the fix's own boot, each with a control
that fired.
