# L7 — rubric category 7 on the Dictionary Liquid window: 9/10, and the 2.4 GB that reproduced

Authority: `src/LIQUID_UI_RUBRIC.md` category 7. Baselines it is scored against:
`PERF_BASELINE.md` (main loop) and `PERF_BASELINE_RESTART.md` (restart leg, milestone
`L0-baseline-1`). **No number in either file is modified, restated or corrected here.**

## 2026-08-17 — measured off a real cold start, at `aaef2a84`

**Restart evidence, because the rubric voids a main-process number taken without one.** All six
`electron` pids stopped (`Get-Process electron | Stop-Process -Force`, count 6 → **0**), then one
`npm start`. `npm start` → `debug/bridge.json` **56.6 s** (start clock granularity 1 s; L0's
93.84 s was a colder forge cache, so this is NOT quoted as a boot improvement). Readiness polled
for **`5173` in the health url**, not `ok:true` — a fast restart can leave a live `/health` with
no page. Every number below is from that one process.

**Real functional state, not an empty harness.** Dictionary window restored, searched 食べる →
**7/7 parity rows reachable**, 3,767 chars / 341 nodes / 66 controls. The heaviest actions were
driven on that populated window, not a blank one.

### Gestures, with the liquid material live

`backdrop-filter: blur(8px) saturate(1.25)`, background `color(srgb … / 0.72)` — confirmed on the
element before each run, so this is the cost of the real material and not of a class name.
Frame deltas in ms; `main` is `/health` round trip sampled across the gesture. Display ceiling is
**10 ms (~100 Hz)**, per L0 — scoring against an assumed 16.7 ms would call a dropped frame healthy.

| Run | frames | p50 | p95 | max | >100 | main p50 | main p95 | main max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Drag, **standard** | 136 | 10.0 | 10.2 | 140.0 | 4 | 2.2 | 3.8 | 168.0 |
| Drag, **liquid** | 140 | 10.0 | **10.4** | 110.0 | 3 | 2.4 | 18.1 | 26.8 |
| Resize, liquid | 138 | 10.0 | 10.1 | 130.1 | 4 | 2.2 | 22.2 | 27.9 |
| Theme switch, liquid | 179 | 10.0 | 10.1 | 60.0 | 0 | 2.5 | 14.4 | 17.1 |
| **JANK CONTROL**, liquid drag | — | 10.0 | **120.0** | 140.1 | **12** | 2.0 | 56.6 | 156.8 |

**The liquid material costs 0.2 ms at p95 on drag (10.2 → 10.4), which is inside run-to-run
spread** — L0's own two drag runs differ by the same margin. Every gesture holds p50 at the
display's own rate. Theme switch: apply **16.1 ms**, restore **19.8 ms**, against L0 settled
20.0 / 23.6 — no regression, and `data-theme` came back to **`forest-night`**, asserted not eyeballed.

### Main availability under the surface's heaviest real operations

Bar: **no main-process block over 500 ms**.

| Run | samples | p50 | p95 | **max** |
| --- | --- | --- | --- | --- |
| Idle | 40 | 1.5 | 2.8 | 8.8 |
| One real search (勉強, typed + Search clicked) | 40 | 1.7 | 6.5 | **319.2** |
| `Find example sentences` (the heaviest in-window action) | 40 | 1.5 | 6.6 | **224.5** |
| **SENSITIVITY CONTROL** — 126 cold unseen lookups | 40 | 1.9 | 23.6 | **8,081.5** |

**Both pass the bar, and the control proves the instrument can see a failure**: 8,081.5 ms against
a 1.5 ms idle p50 is ~5,400×, the same shape as the reference defect (`7954921a`, 36,910 ms vs
1 ms) and it independently re-confirms `PERF_BASELINE.md`'s finding at the same magnitude
(8,235.9 ms). That burst is a **batch** path (Reading / subtitle mining), not something the
Dictionary window does to itself — so it caps whatever surface owns `lookupTermsBatch`, not this one.

### Persisted state: nothing leaked

`desktop-layout.json` captured before the pass and compared after: window geometry **identical**
(`scraper 60,24,820×580` · `dictionary 94,54,820×580`, both `presentation: none`), `globalZTop`
**10802 → 10802**. The live DOM read 827×584 afterwards — that is L0's already-recorded resize
desync (`resizeStart`'s `up` never clears the inline style it wrote), **persisted state was never
wrong**, and it is not re-opened here.

## Why 9, not 10 — the number that caps it

**Memory. L0's ~3 GB main transient REPRODUCED on this second cold boot, which is exactly the
condition L0 set before anyone scored on it.**

| Sample | main RSS | main private | all 6 processes |
| --- | --- | --- | --- |
| 3.1 min uptime | **2,363.7 MB** | **2,606.1 MB** | 3,428.7 MB |
| 3.8 min uptime | **731.1 MB** | 677.5 MB | 1,807.7 MB |

Same shape as L0 (3,174.1 → ~375 MB): a real allocation genuinely released, handles 1,074 and flat.
The peak is *lower* than L0's, so it is not a regression. **What caps the category is the settled
figure: 731.1 MB at 3.8 min against L0's 373–379 MB at 3.0–3.8 min uptime.** This process had
also just absorbed a 126-word cold lookup burst, which plausibly explains it — but *plausibly* is
not a measurement, and a 10 awarded on an unisolated 2× is the false pass this rubric exists to
prevent.

**Exact re-measurement that would earn the 10** (nothing else in the category is open): one more
cold boot, gestures only, **no lookup burst**, main RSS sampled at 3.0 / 3.4 / 3.8 min uptime. If
it settles at L0's 373–379 MB the cap lifts and the burst is named as the owner; if it stays near
731 MB there is a real steady-state regression to bisect.

## Traps this pass paid for

- **The interaction probe targets the LARGEST visible `.fwin`.** Scraper and Dictionary are both
  820×580, so it took Scraper first and would have scored the wrong surface while reporting a
  perfectly healthy number. Fixed non-persistently: `style.display='none'` on the other window for
  the duration, restored after — never minimise, which persists. The probe echoes
  `gesture.title`; **read it, every run.** All five runs above say `title=Dictionary`.
- **`closedLoop` is `True` for every drag and `False` for every resize.** That is the L0 finding,
  not a harness fault — do not re-derive it as new.

## 2026-08-17 · primary — the re-measurement ran, and it retracts its own premise

The pass above capped category 7 at 9 on "settled 731.1 MB at 3.8 min against L0's
373–379 MB", and named one experiment: a cold boot, gestures only, no lookup burst,
RSS at 3.0 / 3.4 / 3.8 min. That ran. Cold start proven — 6 electron pids → **0**, one
`npm start`, readiness polled on `5173` in the health url; main pid **37416**. Real
functional state: Dictionary Liquid, 食べる, **3,834 chars / 341 nodes / 66 controls**.

| uptime | main RSS | main private | all 6 | what had happened |
| --- | --- | --- | --- | --- |
| 1.17 min | **2,979.1** | 3,133.2 | 3,980.5 | window restore only — **no search yet** |
| 2.01 | **3,221.1** | 3,543.3 | 4,231.9 | one search |
| 3.00 | 2,877.8 | 3,136.0 | 3,786.2 | drag+resize+theme+jank gestures |
| 3.41 | 658.5 | 662.3 | 1,338.2 | — the release |
| 3.81 | **617.2** | 661.4 | 1,305.3 | the prescribed sample |
| 8.01 | **436.6** | 581.9 | 1,035.1 | idle |
| 12.01 | **2,278.1** | 2,824.9 | 3,136.3 | after a renderer **reload** + probes |

**Three findings, and the third retracts the cap's premise.**

1. **The burst is not the owner.** 617.2 MB at 3.8 min with no burst vs 731.1 MB with
   one. Removing the 126 cold lookups moved it 114 MB, not 240.
2. **Searching is a bounded cache, not a leak.** `debug/l7b-search-bisect.cjs`, five
   distinct words each returning real results (2,518–3,262 chars): RSS **618.2 → 663.1**,
   private **662.4 → 672.6**, and it **plateaus after the second** (662.3, 662.3, 663.1,
   663.1). +45 MB total, +10.2 MB private. Handles 1,067 → 1,067.
3. **3.8 min is not settled, so the 9 was scored on a number still falling.** The same
   process read **436.6 MB at 8.01 min**, within 58–64 MB of L0's 373–379. The gap the
   cap was built on is mostly the sampling instant.

**The transient is NOT boot-only, which is the sharper bisect target.** 2,979.1 MB at
1.17 min was measured *before the first search* — nothing dictionary-shaped had run. And
after the window settled to 436.6 MB, a renderer **reload** plus probe work put it back
to **2,278.1 MB** at 12.01 min. L0 saw one peak and called it a boot cost; it recurs when
a renderer re-attaches. Handles are flat throughout (1,067–1,073), so it is allocation,
not OS-object leakage.

**Category 7 stays 9/10 and the cap is re-stated, not lifted.** What earns the 10 now is
narrower: sample RSS at 3, 8, 16 and 24 min on a boot with **no reload**, and separately
reload once at a settled point and sample either side. If the no-reload leg holds ~375–437
MB the memory objection is closed and the reload path owns the re-spike; if it re-spikes
unprompted there is a periodic allocation to bisect. **Do not score 10 off the 436.6
figure alone** — this run's 12-min sample is confounded by work I drove.

Instruments, both re-runnable: `debug/l7b-rss-sampler.ps1 -MainPid <pid> -Marks @(...)`
and `debug/l7b-search-bisect.cjs <pid> <words...>`.

**Trap.** The four gesture runs above are the healthy ones and they were taken while main
sat at ~3 GB: drag p50 **10.0** / p95 **10.1** / 0 frames >100 ms, resize p95 10.2,
theme apply **15.1** / restore **19.5**, `restoredTo=forest-night`, `title=Dictionary` on
every run. **Frame health does not fall out of main RSS** — reporting one as evidence for
the other is how a 3 GB process reads as fine. The jank control fired: p95 **10.1 → 110.0**,
frames >100 ms **0 → 10**.

## 2026-08-24 · backup — the memory experiment this file prescribed, run: the objection closes, and RSS is not the number

The entry above capped category 7 at 9/10 on memory and named exactly one experiment:
*"sample RSS at 3, 8, 16 and 24 min on a boot with **no reload**, and separately reload once at a
settled point and sample either side."* That ran.

**Cold start proven.** 0 `electron` pids before (`Get-Process electron` returned none), one
`npm start`, bridge pid **2912**, 6 processes. Readiness taken from the bridge, then husk-probed
(`eval 1+1` gives **2**) before any number was trusted. Real functional state, set up once and then
left strictly alone: Dictionary window restored **already in Liquid presentation**, 食べる gives
**8 `dict-entry` / 5,963 chars / 349 nodes / 67 controls**, `forest-night`, `data-perf=performance`.

### Leg 1 — no reload, no probe work, 16 minutes of silence

| uptime | main RSS | main **private** | handles | all 6 |
| --- | --- | --- | --- | --- |
| 4.20 | 592.2 | — | — | — |
| 6.26 | 472.2 | 551.7 | 1085 | 919.5 |
| 8.01 | 332.7 | **550.9** | 1079 | 729.6 |
| 12.00 | 68.2 | 550.8 | 1078 | 420.9 |
| 16.00 | 55.3 | 551.8 | 1076 | 406.2 |
| 20.00 | 55.3 | 553.2 | 1076 | 405.1 |
| 24.00 | 56.2 | **554.2** | 1075 | 408.5 |

**+3.4 MB of private memory across 16 quiet minutes, handles 1,079 down to 1,075.** There is no
steady-state leak on this surface.

### THE CORRECTION THIS RUN FORCES: main RSS on an idle Windows process is not a memory measurement

Between 8 and 12 minutes main RSS fell **332.7 to 68.2 MB** while private moved **550.9 to 550.8**.
Nothing was released. That is the OS trimming the working set of a process that stopped touching
its pages. Every earlier number in this file that reads as *"a real allocation genuinely
released"* — L0's 3,174 to ~375, and this file's own 2,979 to 436.6 — was scored on `WorkingSet64`,
and **the 373–379 MB L0 baseline the 9/10 cap was written against is an RSS figure**. On that
metric this boot reads **56.2 MB**, far under the baseline, which would "lift the cap" for the
wrong reason. The number that carries information is **private bytes**, and it is flat.
Prior RSS figures are **not** restated or corrected here; what changes is which column is read.

### Leg 2 — one reload at a settled point, sampled either side, nothing else driven

| point | main RSS | main private | handles | all 6 |
| --- | --- | --- | --- | --- |
| pre-reload (24.27 min) | 56.1 | 554.3 | 1077 | 408.9 |
| reload + 45 s | 105.8 | 557.2 | 1081 | 862.5 |
| reload + 150 s | 88.0 | **559.1** | 1079 | 658.3 |

**A bare reload costs main +4.8 MB private and does not re-spike.** This retracts the previous
entry's third finding, which read *"after the window settled to 436.6 MB, a renderer reload plus
probe work put it back to 2,278.1 MB"* and named the reload path as the likely owner. Separated,
the reload is not the owner — **the probe work was**. The window came back liquid and re-armed to
the identical state (8 entries / 5,963 chars / 349 nodes / 67 controls), so nothing was lost.

### The control fired — and the instrument it was supposed to use is BROKEN

`debug/l7b-search-bisect.cjs`, named at the end of the previous entry as re-runnable, **throws on
this tree**: every step returns `THREW: Cannot read properties of undefined (reading 'search')`
and `(reading 'snapshot')`. It reported memory **flat at 560.1 MB private for five words while
performing no searches at all** — a broken probe whose output is indistinguishable from a clean
pass. Do not quote it again without checking it clicked something.

Re-run through the search path that is known to work (type, click `Search`, read `.dict-entry`),
five distinct words, each returning real results — 勉強 **8**, 図書館 **8**, 新聞 **8**,
冷蔵庫 **3** (a real narrower result, not an empty), 自転車 **8**:

**private 560.1 to 571.0 (+10.9 MB) and RSS 75.0 to 126.7 (+51.7 MB) in about 20 seconds** — three
times the movement that 16 quiet minutes produced. The sampler sees a rise when there is one, so
the flat quiet reading means something.

### Disposition: the memory objection is CLOSED. Category 7 is still NOT re-scored to 10.

The cap's stated premise is gone — no steady-state leak, no reload-owned re-spike, and the
instrument is shown sensitive. But the rubric forbids inheriting a score across a change, and the
gesture and main-availability halves of category 7 were measured **on a different boot** (the
2026-08-17 pass). Scoring 10 now would mean carrying frame and `/health` numbers from a process
that no longer exists onto a process where only memory was measured — which is precisely the
"frame health does not fall out of main RSS" trap this file already recorded, run in reverse.

**Exact re-measurement that earns the 10, and it is now the only thing open:** one cold boot that
does all three legs in a single process — drag/resize/theme frame deltas with the jank control,
`/health` under one real search and `Find example sentences` with the burst sensitivity control,
and private-byte samples at 8/16/24 min — reported together.

### Traps

- **Read `PrivateMemorySize64`, not `WorkingSet64`.** An idle Electron main trims to ~55 MB RSS
  while holding ~551 MB private.
- `debug/l7b-rss-sampler.ps1` takes `-Marks` as a `[double[]]`. Passing `"5,8,12,16,20,24"` as one
  quoted string through `Start-Process -ArgumentList` fails the parameter bind and the script
  produces **no output file at all** while its `pwsh` process stays alive — which reads exactly
  like a sampler that is still waiting for its first mark. Pass `@(8,12,16,20,24)`.
- Do not run the full vitest suite while sampling. It is a separate process, but the memory
  pressure trims the working set being measured and would manufacture a clean number.

## 2026-08-24 · primary — the single-boot re-measurement: all three legs in ONE process

Cold start proven: `Get-Process electron` **6 → 0**, one `npm start` (01:08:25), main pid **7920**,
6 processes, `/health` answering with `5173` in the url. `l7d-setup.cjs` asserted exactly **1
visible `.fwin`** — Dictionary, `presentation=liquid`, 食べる → **8 entries / 5,963 chars / 349
nodes / 75 controls**, `forest-night`, `data-perf=performance`. Every number below is that process.

### Leg 1 — gestures. THIS BOOT'S DISPLAY CEILING IS 16.7 ms, NOT 10.0.

| Run | frames | p50 | p95 | max | >100 | main p50 | main p95 | main max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ceiling | 110 | 16.7 | 16.8 | 16.9 | 0 | 2.3 | 3.5 | 13.1 |
| Drag, liquid | 106 | 16.7 | 16.9 | 33.5 | 0 | 2.2 | 3.7 | 21.6 |
| Resize, liquid | 108 | 16.7 | 16.8 | 33.4 | 0 | 2.5 | 3.6 | 10.0 |
| Theme switch, liquid | 109 | 16.7 | 16.8 | 16.9 | 0 | 2.6 | 3.7 | 9.8 |
| **JANK CONTROL**, drag | 65 | 16.7 | **117.0** | 133.7 | **12** | 1.9 | 3.0 | 7.9 |

**Scoring these against 2026-08-17's 10.0 ms ceiling would report a 67% frame regression that is
the display, not the app** — the probe re-measures the ceiling every run for exactly this reason,
and every gesture holds p50 *at* it. Theme apply **29.0** / restore **33.3** ms = 1.74 / 1.99
frames, against 16.1 / 19.8 at a 10 ms frame = 1.61 / 1.98 — the same frame count. `title=Dictionary`
and `restoredTo=forest-night` on every run; drag `closedLoop=True`, resize `False` (the L0 finding,
not new). The jank control fired: p95 16.9 → 117.0, frames >100 ms 0 → 12.

### Leg 2 — `/health` under this surface's real work. Bar: no main block over 500 ms.

| Run | samples | p50 | p95 | **max** | proof the work happened |
| --- | --- | --- | --- | --- | --- |
| Idle | 40 | 0.9 | 1.6 | **3.5** | — |
| One real search (勉強) | 40 | 1.1 | 1.7 | **20.6** | `typed=勉強`, 8 rows, chars 5,963→2,700 |
| `Find example sentences` | 40 | 1.0 | 1.7 | **3.0** | nodes 303→363, chars 2,700→3,215 |
| ISOLATION CONTROL (renderer blocked 1.5 s) | 40 | 1.0 | 1.9 | **3.1** | unmoved ⇒ main-only ✔ |
| ~~SENSITIVITY (126 `lookupTermsBatch`)~~ | 40 | 1.0 | 2.4 | **5.5** | `keys 126, withGloss 126` in **62 ms** |
| **SENSITIVITY CONTROL** (756 `lookupTerm`) | 40 | 1.2 | 69.9 | **39,026.2** | `fired===settled===756`, 42,136 ms |

**Both real loads pass the bar by three orders of magnitude, and the old control is now useless as
a control.** `l7d-burst-control.js` still does its work and the work is simply cheap (62 ms), so it
can no longer show the probe catching a failure — that is a product improvement and an instrument
regression at once. `l7e-burst2.js` replaces it with `PERF_BASELINE.md`'s recorded single-term
shape and produced **39,026.2 ms against a 0.9 ms idle p50 (~43,000×**, larger than the `7954921a`
reference's 36,910 ms). L0's finding therefore stands unchanged: the **single-term** path saturates
main. It is a batch path no Dictionary-window action performs, so it caps whatever surface owns it.

### Leg 3 — private bytes at 8 / 16 / 24 min, same process, `l7c-mem-sampler.ps1`

| uptime | main RSS | main **private** | handles | all 6 private | what had happened by then |
| --- | --- | --- | --- | --- | --- |
| 8.00 (01:16:37) | 239.0 | **555.6** | 1055 | 1,484.4 | setup search + all five gesture runs |
| 16.00 (01:24:37) | 85.7 | **576.9** | 1058 | 1,513.2 | + every leg-2 load, incl. the 42 s / 756-lookup burst |
| 24.00 (01:32:37) | 59.4 | **576.8** | 1057 | 1,519.0 | 8 minutes strictly quiet — no app driven |

**+21.3 MB of private memory for the whole load phase, and −0.1 MB across the 8 quiet minutes
after it.** Handles 1055 → 1058 → 1057. Main RSS falls 239.0 → 59.4 with private flat, which is the
OS trim this file already recorded — read the private column. Boot: `npm start` → bridge up
**15.3 s** (main spawned at 12.5 s); the forge/Vite cache was warm, so as in the 2026-08-17 entry
this is **not** quoted as a boot improvement over L0's 93.84 s.

### Category 7 = **10/10**. All three legs are from process 7920 and nothing is inherited.

Frame stability at the display's own rate with 0 frames >100 ms; theme switch the same frame count
as the baseline; boot no worse; the heaviest action this window performs blocks main **20.6 ms**
against a 500 ms bar; private memory flat. Three controls fired rather than one — jank (p95
16.9 → 117.0), isolation (main unmoved by a 1.5 s renderer block), sensitivity (39,026.2 ms).

**Traps this pass adds.** (1) *The display ceiling is not a constant.* It was 10.0 ms on the
2026-08-17 boot and 16.7 ms here; re-measure `-Interaction ceiling` every run and score against
that run's own number. (2) *A control can decay into uselessness while staying green.*
`l7d-burst-control.js` reports `done`, `keys 126`, `withGloss 126` — a perfectly healthy-looking
run that no longer blocks anything. Check that a control still FAILS, not merely that it ran.
(3) `-DuringJs` reaches the bridge with its non-ASCII intact (`typed=勉強` came back exact), but a
`\u` escape written into a probe file by this repo's write path collapses into the character
before the file lands — `String.fromCharCode` is the form that survives editing.
