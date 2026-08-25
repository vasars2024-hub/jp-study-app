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

## 2026-08-24 · primary — the re-drive: legs 1 and 2 hold, leg 3 FAILS. Category 7 is NOT a 10.

Re-measured because `e4de125b` and `6f86f2cc` moved CSS after the 10/10 above, and the rubric
forbids carrying a score across a change. Cold boot, main pid **9932**, `npm start` → bridge
**16.1 s**; `l7d-setup.cjs` asserted 1 visible `.fwin`: Dictionary, liquid, 食べる → **8 entries /
5,247 chars / 346 nodes / 75 controls**, `820x580`, `forest-night`, `data-perf=performance`.

**Leg 1 — gestures. This boot's display ceiling is 16.7 ms, re-measured as the file requires.**

| Run | frames | p50 | p95 | max | >33 | >100 | main p50 | main max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ceiling | — | 16.7 | 16.9 | 17.6 | 0 | 0 | 2.5 | 8.9 |
| Drag | — | 16.7 | 17.1 | 33.4 | 3 | **0** | 2.3 | 9.4 |
| Resize | — | 16.7 | 17.0 | 33.5 | 2 | **0** | 2.4 | 8.8 |
| Theme switch | — | 16.7 | 16.9 | 17.1 | 0 | **0** | 2.4 | 9.9 |
| **JANK CONTROL** | 64 | 16.7 | **117.0** | 117.0 | 13 | **12** | 2.0 | 7.8 |

Every gesture sits *at* the ceiling; the control fired (p95 16.9 → 117.0, >100 ms 0 → 12),
`title=Dictionary`, `closedLoop=True`.

**Leg 2 — `/health` under this surface's real work. Bar: no main block over 500 ms.**

| Run | p50 | p95 | **max** | proof the work happened |
| --- | --- | --- | --- | --- |
| Idle | 0.9 | 1.9 | **5.5** | — |
| One real search (勉強) | 1.1 | 2.6 | **176.2** | `done`, `typed=勉強`, before 8 → after 8 rows |
| `Find example sentences` | 1.0 | 1.8 | **220.9** | nodes 303 → 363, chars 2,700 → 3,215 |
| ISOLATION CONTROL (renderer blocked 1,500 ms) | 0.8 | 1.5 | **3.2** | `ms:1500` — main unmoved ⇒ main-only ✔ |
| **SENSITIVITY CONTROL** (756 `lookupTerm`) | 2.0 | 79.9 | **38,098.2** | `fired===settled===756`, 41,147 ms |

Both real loads pass, but note they are **8.5× and 63× worse than the 2026-08-24 boot** (20.6 and
3.0 ms) on unchanged code — quote them against the 500 ms bar, not as a trend.

### Leg 3 — main-process memory. THIS IS THE FAILURE, and it reproduces across two boots.

| uptime | clock | main RSS | main **private** | handles | all 6 private |
| --- | --- | --- | --- | --- | --- |
| 11.01 | 05:01:53 | 52.6 | **604.2** | 1,070 | 1,525.2 |
| 17.00 | 05:07:53 | 5,453.7 | **7,082.0** | **4,421** | 8,159.7 |
| 18.27 (quiet) | 05:09:08 | 5,456.8 | **7,081.5** | 4,421 | 8,171.6 |

**+6,477.8 MB of private memory and +3,351 handles in six minutes, and none of it comes back.**
The L0 baseline for this surface is 550–577 MB private and ~1,055 handles. It is not a one-off:
the *previous* boot (pid 22560) measured **7,071.8 MB** private at ~15 min uptime — the same
plateau to within 10 MB, which is itself a clue that this is a bounded allocation, not a drift.

**Bisected on a third cold boot (pid 7132) and every Dictionary control is EXONERATED**
(`probes/l7g-membisect{,2,3,4}.cjs`, private bytes sampled between every click):

| Driven | Δ private | Δ handles |
| --- | --- | --- |
| real search 食べる → 8 entries | +340.2 then −227.4 (net ≈ 0) | +1 |
| `Find containing words` / `Find phrases` / `Find example sentences` / `Find shared senses` | −4.3 … **+7.6** | −6 |
| Interlinear mode switch, all `details` opened, `Search my subtitles` | +50.4 then −32 | ±2 |
| all **8** `Play <word>` controls | −1.0 … +0.3 | **0** |
| full AI explain cycle on a 猫 fixture: create (142 chars) → `Forget` | **+1.8** total | +9 |

Nothing the window offers costs more than 8 MB. The jump on boot 9932 happened inside an
**uptime window** (11 → 17 min) rather than after any one control, so the live hypothesis is
time-based work in main — a scheduled job, not a user action. A sampler is running on boot 7132
at marks 8/11/13/15/17/20 with the app otherwise idle: if it reaches ~7 GB untouched, the source
is a timer and no Dictionary probe will ever find it.

**Category 7 = capped, not 10.** Legs 1 and 2 pass with three controls fired (jank, isolation,
sensitivity). Leg 3 fails against its own L0 baseline by an order of magnitude, and the rubric's
10 requires *no regression against the L0 baseline on any of them*. The 10/10 recorded in the
entry above stands as a measurement of boot 7920 and is **not** carried forward.

### The 6.5 GB is LOCATED: it is the cadence, not any one control — and the idle control settles it

**Idle control, and it is what makes the rest mean something.** Boot **7132** left strictly alone
across the identical uptime window (`probes/l7c-mem-sampler.ps1`, marks 8/11/13/15/17):

| uptime | 8.00 | 11.00 | 13.01 | 15.00 | 17.01 |
| --- | --- | --- | --- | --- | --- |
| main private MB | 573.0 | 572.7 | 573.1 | 573.9 | **573.6** |
| handles | 1,050 | 1,051 | 1,047 | 1,047 | **1,047** |

**+0.6 MB and −3 handles over nine minutes.** There is no timer. The allocation is action-driven.

**Reproduced on demand.** On that same quiet boot, at 575.8 MB / 1,053 handles, one run of
`probes/l1-deadend.js` — 19 targets in about 70 seconds — took main to **7,075.7 MB private /
4,404 handles**, and it stayed there. Three boots now plateau at **7,071.8 / 7,082.0 / 7,075.7 MB**,
within 10 MB of each other, which is a ceiling being hit rather than a drift.

**And every individual control is exonerated, on clean boots, sampled between clicks:**
search (+340.2 then −227.4), `Find containing words` / `Find phrases` / `Find example sentences` /
`Find shared senses` (worst **+7.6**), the `Example sentences` summary (**−256.4**), the
`Dictionary` lens (−1.9), the `Interlinear` lens plus every `details` opened plus
`Search my subtitles` (+50.4 then −32), all **8** `Play <word>` (worst +0.3), a whole AI explain
create-and-`Forget` cycle (**+1.8** total), and **six** Liquid⇄Standard presentation toggles
(**+1.7** over all six).

**So the shape is a release failure under cadence, not a leak in any one path.** A single action
transiently commits ~250–340 MB in main and gives it back — `searched` reads 801.1 MB and the very
next sample reads 544.7. Nineteen of them back to back at the sweep's settle interval never give
any of it back. Which allocation it is, is the next slice; the honest statement today is that the
window's own controls, driven at a rate a fast user can produce, take main from 0.57 GB to 7 GB
permanently.

**Category 7 stays capped at less than 10** and this is now a located product defect rather than an
unexplained number. Repro, three commands: boot clean, `probes/l7d-setup.cjs`, then
`debug/evfile.cjs probes/l1-deadend.js` and read `PrivateMemorySize64` before and 70 s after.

## 2026-08-24 — D1 is NOT a JS leak, and no JS-side bisect would ever have found it

Every instrument until now sampled main from OUTSIDE (`Get-Process`.`PrivateMemorySize64`), which
says how much grew and never which pool. `/eval` cannot help: it runs in a renderer. So the debug
bridge gained a bounded, read-only `/mem` route (`src/main/debugBridge.ts`) reporting main's own
`process.memoryUsage()`, `v8.getHeapStatistics()`, heap spaces and `app.getAppMetrics()`, plus an
explicit `{gc:true}` that borrows `--expose_gc` for one forced collection. Probe:
`probes/l7h-memprofile.cjs <label> [--gc]`, appending to `l7h-memprofile.json`.

Fresh boot, pid 19452, the documented state (liquid Dictionary, 820x580, 食べる, 8 entries):

| sample | private | heapUsed | external | malloced | unattributed |
| --- | --- | --- | --- | --- | --- |
| settled (40 s) | 430.9 | 286.7 | 4.2 | 8 | 108.4 |
| pre-deadend (one search) | 802.8 | 328.3 | **197.8** | 8 | 244.6 |
| burst t+0 s | 2,212.5 | 389.7 | 93.9 | 8 | — |
| burst t+12 s | **7,074.0** | 355.1 | 93.9 | 8 | 6,606 |
| t+24…t+84 s | 7,073.8 flat | 355 | 93.9 | 8 | — |
| after FORCED GC | 7,078.4 | 354.6 | 93.9 | 8 | **6,610.6** |

Reproduces the prior three boots (7,071.8 / 7,082.0 / 7,075.7) within 10 MB, so this is the same
defect, now attributed. Three hypotheses die here:

1. **"A JS reference is retained in main."** FALSE. `heapUsed` is 286.7 → 355 MB across the whole
   blow-up — it moves 68 MB while private moves 6,643. The heap limit is 4,096 MB and private is
   7,078, so most of it *cannot* be V8 heap.
2. **"GC never gets idle time under cadence."** FALSE, and this was the leading theory. A real
   collection ran (`gcRan=true`, `nativeContexts` 2→3) and private went 7,074.0 → **7,078.4** — it
   did not fall. RSS fell 7,287 → 6,185 (the OS trimmed pages), which is exactly why `WorkingSet64`
   must never be the number reported.
3. **"Leaked/detached contexts."** FALSE. `detachedContexts` is **0** at every sample.

**6,610 MB is native memory main holds that V8 does not own** — not JS objects, not Buffers
(`external` 93.9 MB and *falling* through the burst; `arrayBuffers` 0 throughout). It is also a
STEP, not a ramp: 2,212 → 7,074 inside one 12 s window, then flat to the megabyte for 84 s.

Consequence for the next slice: bisecting the 19 controls in JS is the wrong instrument and the
prior exoneration pass (all 19 individually ≤8 MB net, all 8 `Play` at +0.3) is consistent with
this rather than in tension with it. Hunt a native allocator in main reached by the *cadence* —
candidates in order: the dictionary SQLite handle's page cache/`mmap_size`, per-call native
allocation in the search/tokenize path, and Chromium browser-process allocation. `l7h-memprofile`'s
`UNATTRIBUTED` line is the number to watch; if it does not move, the fix is not in JS.

**First native candidate checked and ELIMINATED, same turn.** `mmap_size = 268435456` in
`src/main/dictionary/db.ts:124` is 256 MB per connection, and the measured step of 4,861.5 MB is
18.99 × 256 MB against exactly 19 driven targets — an almost perfect fit for "a fresh connection
per action". It is a coincidence. `openDictionaryDb()` has exactly two non-test callers
(`dictionaryDb()`'s lazy singleton and the import worker), 33 call sites go through the shared
handle, and `new Database(` appears at exactly one site in all of `src/main/`. No per-action
connection churn exists, so this is not it. Do not re-run this check.

## 2026-08-24 · backup — D1 ATTRIBUTED: it is a GGUF LLM loading in main, not a Dictionary leak

Four turns hunted a leak among the 19 Dictionary controls. There is none. The chain, each step
falsifying the last guess, every number from main's own `/mem` (never `WorkingSet64`):

- **`l7i-memstep.cjs`** drove the identical 18-control cadence `l1-deadend.js` uses, sampling
  between every step: the whole sweep moved private bytes **785.5 → 788.6 MB (Δ+3.1)**. Largest
  single step 98.6 MB. Then, ~40 s later with **nothing clicked**, the same process read
  **7,071 MB** — and PowerShell independently read 7,073.9 MB / 4,454 handles on that pid. So D1 is
  **delayed, not click-synchronous**, which is exactly why the earlier isolation pass (all 19 at
  ≤8 MB net, sampled at click time) exonerated everything.
- **`l7j-interlinear-step.cjs`** — Interlinear was the last control driven before the step and the
  one path that awaits `initYomitan()` + kuromoji. FALSIFIED: **Δ-2.3 MB over 90 s**, with an idle
  control and a non-interlinear adverse control (`Find containing words`) both flat (Δ0 MB / 40 s).
- **`l7k-candidate-bisect.cjs`** — five more candidates each clicked once and sampled 30 s:
  `Play 食べる` +1.1, `Find phrases` -1.4, `Find example sentences` -0.4, `Find shared senses` -1.3,
  `Explain again` +0.5. Idle control -0.4. **No candidate stepped.**
- Then the log, not another probe: `grep -i llama debug/devapp-l7h2.log` — the 7 GB session's own
  stdout carries `[node-llama-cpp] load: …`, and the healthy 599 MB session's log carries **no
  llama line at all**. `userData/models/Qwen3-1.7B.gguf` is **1,223.0 MB**;
  `src/main/localAgent.ts:159` loads it with `llama.loadModel()` + `createContext({contextSize})`
  and caches it in a module-level `runtime` for `IDLE_UNLOAD_MS` = 5 min.

**Positive control — `l7l-llama-attribution.cjs`.** One `localAgent:plan` call on a healthy process:

| | private | heapUsed | external |
| --- | --- | --- | --- |
| idle control, 20 s | 598.1 → 598.2 (**Δ+0.1**) | 366.8 | 93.8 |
| plan t+0 s | 617.2 | 377.8 | 93.9 |
| plan t+10 s | **3,488.9** | 361.0 | 93.9 |
| plan t+15…150 s | 3,448.3 flat | 355 | 93.9 |

**Δ+2,831.1 MB from one call**, `localAgent:status` `loaded:false → true`,
`Qwen_Qwen3-1.7B-Q4_K_M.gguf`, contextSize 8192. That is 2.3× the model file, native, GC-immune,
`heapUsed` and `external` unmoved — every property l7h measured, and the fixed plateau that lands
within 10 MB of 7,074 on four boots is a fixed model + fixed KV cache, not a leak.

Open, and the next slice: **which action in the cadence starts the plan**, and why the plateau is
7,074 rather than 3,448. Prime suspect for the second: `src/main/translate.ts:379` holds a
**second, independent** module-level llama cache — two full models resident at once. `localAgent.ts`
has an idle unload; check whether `translate.ts` has one.

## 2026-08-24 · backup — D1 FIXED, and the fix shipped half-broken until the live run caught it

Two defects in `src/main/translate.ts`, both about the same GGUF:

1. `model.createContext()` with **no size** — node-llama-cpp then sizes the KV cache to Qwen3-1.7B's
   full 32,768-token context. Now `contextSize: 8_192`, matching
   `DEFAULT_LOCAL_AGENT_SETTINGS.contextSize`; the longest prompt this module builds is a chunk of
   `BATCH_SIZE` = 8 sentences, so the old size was never usable.
2. The module kept only the `LlamaChatSession`. The model and context that own the weights and the
   cache had **no reachable reference**, so nothing could dispose them — no idle unload, no
   `dispose()`, resident for the process lifetime. `localAgent.ts` already had both guards.
   Added: `loadedModel`/`loadedContext`, `unloadTranslationModel()`, and a `scheduleIdleUnload()`
   armed from `promptWithTimeout`'s `finally` (the one choke point every inference passes) and from
   `ensureSession` (for a caller that loads and never prompts).

**The fix's own defect, and it only failed live.** `loadPromise` was cleared on failure but never on
success, so `scheduleIdleUnload`'s `!loadPromise` guard was permanently false: the timer fired,
found the guard false, and did nothing. First live run — model still resident at **3,290 MB, 460 s
after a 300 s deadline**. Four green unit tests did not see it, because asserting on
`unloadTranslationModel()` directly never drives the timer. Now cleared in `ensureSession`'s
`finally`, and a fifth test drives the deadline with fake timers.

| run | baseline | peak | after the idle deadline |
| --- | --- | --- | --- |
| before the fix (pid 25936) | 3,447.7 (agent already resident) | 9,618.8 | **7,222** — never falls |
| bounded context only (pid 15132) | 432.2 | 3,290.4 | 3,290 at t+460 s — **unload never fired** |
| both halves (pid 25420) | 430.3 | 3,287.7 | **913.9** at t+304 s; RSS 1,901 → 340 |

Tests: `src/main/__tests__/translateModelLifecycle.test.ts`, 5 passed. Three mutation controls, each
one failure, each restored and re-run green: `createContext()` unsized → `expected undefined to be
defined`; disposal removed → `expected [] to deeply equal ['context','model']`; `loadPromise = null`
removed → `actually unloads once the idle deadline passes` fails alone.

Still open, and NOT claimed: 913.9 MB is ~484 MB above the 430.3 MB boot baseline, and **which
action in the Dictionary cadence starts a model load at all** is unidentified — `l7k` falsified
six controls individually. Rubric category 7 leg 3 should be re-driven against these numbers.

## 2026-08-24 · primary — leg 3 re-driven after the fix: D1's magnitude is gone, the TRIGGER is named, and the residual STACKS

One cold boot, pid **19416**, `l7d-setup.cjs` → Dictionary, liquid, 食べる, **8 entries / 5,470
chars / 349 nodes / 75 controls**, `820x580`, `forest-night`, `data-perf=performance`. Every number
below is that one process. Private bytes only — RSS swung 3,798 → 535 MB while private sat flat.

| point | uptime | private MB | handles |
| --- | --- | --- | --- |
| boot baseline (L0 band 550–577 / ~1,055) | 1.22 | **551.4** | **1,051** |
| `l1-deadend.js`, 19 controls — model loads within ~15 s | 1.59 | 3,521.1 | 4,394 |
| resident plateau | 3.00–6.00 | 3,453.2 | 4,391 |
| **idle unload fires** | 6.70 | **1,080.4** | 4,382 |
| cycle 1 settled | 8.48 | **1,082.4** | 4,378 |
| second load (probe below) | 10.13–14.85 | 3,634.7 | **6,809** |
| second unload fires | 15.10 | 1,412.2 | 6,801 |
| cycle 2 settled | 16.04 | **1,256.7** | **6,803** |

**D1's headline number is closed.** The same repro plateaued at 7,071.8 / 7,082.0 / 7,075.7 MB on
three boots before `148ca3e9` and never fell; it now peaks at 3.5 GB and releases 2.4 GB on the
5-minute deadline, twice, unprompted.

**D2 — the residual stacks, and handles are the honest column.** 1,051 → 4,378 → 6,803: about
**+2,425 handles per load/unload cycle**, never released, and private settles **+531 then +174 MB**
above the previous floor. Cause, read from the dependency rather than guessed: `getLlama()` does not
cache — `getLlamaForOptions` builds a new `Llama` per call, and `loadBindingModule`
(`node_modules/node-llama-cpp/dist/bindings/getLlama.js:549`) deliberately deletes the addon from
`require.cache` first, "each llama instance has its own settings". Deleting a require-cache entry
does not unload a `.node`. `translate.ts` disposed the context and the model but never the `Llama`
that owns the binding, its thread pool and its `process.once('beforeExit')` listener.

**The trigger is `Example sentences`** — the one thing `148ca3e9` left explicitly unclaimed.
`probes/l7n-load-trigger.cjs` records `translate:progress` through
`window.api.onTranslateModelProgress` (`preload.ts:1432`), which `ensureSession()` emits as
`status:'init'` **before** `import('node-llama-cpp')`, so attribution is a 1-second boolean instead
of a 3 GB delta. Idle control **silent 6 s**; then `Search`, `Play 食べる`, `Find containing words`,
`Find phrases`, `Find example sentences`, `Find shared senses` — **six silent for 8 s each** — and
`Example sentences` emitted `init/0 progress/20 progress/45` **after 1 s**. Run stops at the first
hit: every later candidate would meet a warm session.

Why four earlier bisects missed it: they sampled private bytes at click time, and this file's own
table records `Example sentences` at **−256.4 MB**, "exonerated". A load takes ~15 s and the
allocation is native, so a click-time delta measures the search that the control also runs.

**Leg 3 is still NOT a 10.** 1,256.7 MB against an L0 baseline of 550–577 is a 2.2× regression and
6,803 handles against ~1,055 is 6.4×. Fix and re-drive: next section.

## 2026-08-24 · primary — D2: the backend IS undisposed, the fix is real, and it does NOT move the number

Second cold boot, pid **22796**, same `l7d-setup.cjs` state (8 entries / 5,669 chars / 349 nodes /
75 controls). `Example sentences` drove each cycle, so this is the same path measured twice.
Baseline **556.9 MB / 1,052 handles** against the previous boot's 551.4 / 1,051 — 6 MB and 1 handle
apart, which is what makes the comparison below a comparison.

| cycle | point | before (pid 19416) | with the dispose (pid 22796) |
| --- | --- | --- | --- |
| — | boot baseline | 551.4 MB / 1,051 h | **556.9 MB / 1,052 h** |
| 1 | load plateau | 3,453.2 / 4,391 | 3,529.5 / **4,384** |
| 1 | settled after unload | 1,082.4 / 4,378 | 1,157.7 / **4,378** |
| 2 | load plateau | 3,634.7 / 6,809 | 3,677.7 / **6,811** |

**The handle stack is unchanged: 4,378 then 6,811, against 4,378 then 6,809.** Reported as the
number rather than as an intention — `llama.dispose()` is called and the handles do not come back.
Either `_bindings.dispose()` does not release them on Windows, or its
`_backendDisposeGuard.acquireDisposeLock()` never resolves while the just-disposed model still holds
a reference; the `try` swallows both identically. Not distinguished here, and not claimed.

**What the change does earn, and it is smaller than it looked.** `getLlama()` genuinely builds a new
`Llama` per call over a freshly re-`require`d addon, and each one registers a
`process.once('beforeExit')` listener that only `dispose()` removes, so leaving it unreferenced is a
leak on its own terms. And the one thing that could have gone wrong does not: **a load after a
disposed backend works** — cycle 2 loaded normally to 3,677.7 MB on the fixed build, so
dispose-then-`getLlama()` is a supported sequence rather than a one-shot teardown.

**D2 stays OPEN with its number.** Next candidate, and it is a measurement not a guess: count
threads alongside handles across one cycle. ~2,425 handles per cycle at a 1.2 GB mmap'd GGUF smells
like a thread pool or file mapping that `model.dispose()` leaves behind, which would put the defect
in node-llama-cpp rather than in this repo — in which case the product answer is to stop cycling the
backend at all (one process-lifetime `Llama`, reloading only model and context), not to keep
disposing harder.

**`localAgent.ts` had the identical hole** — `disposeRuntime` disposed context and model only, and
`loadRuntime` leaked the backend outright on a `loadModel`/`createContext` failure. Fixed the same
way plus an error-path dispose. **Not measured live**: that path was not exercised in this session
and the change landed after this boot started, so it rides on the translate path's evidence and on
7/7 unit tests, and is recorded here as unverified rather than as verified.

## 2026-08-24 · backup — D2 halved and quantified: the addon was half of it, the model cycle is the other half

Cold boot, pid **9532**, on the build carrying `fb4d59aa` (one process-lifetime `Llama` shared by
`translate.ts` and `localAgent.ts`; the context and model are still disposed per cycle). Two full
cycles driven through the product's own `translate:ensureReady`, each unload the module's real
5-minute idle deadline. `probes/l7o-backend-cycles.cjs`, output in its `.json`.

| point | private MB | handles | before the fix (pid 22796) |
| --- | --- | --- | --- |
| boot, first reading | 866.9 | 1,076 | — |
| after 45 s idle (the settled baseline) | **420.7** | **1,070** | 556.9 / 1,052 |
| cycle 1 load plateau | 3,323.0 | 4,409 | 3,529.5 / 4,384 |
| cycle 1 settled after unload | 923.5 | 4,401 | 1,157.7 / 4,378 |
| cycle 2 load plateau | 3,387.4 | 5,622 | 3,677.7 / **6,811** |
| cycle 2 settled after unload | **1,026.7** | **5,613** | — |

**The number this slice was for: a second cycle now costs +1,212 handles and +103.2 MB, against
+2,433 and +174 MB before.** So the re-`require`d native addon was about **half** of D2, and the
other half is the model/context cycle itself — `model.dispose()` + `context.dispose()` return the
2.4 GB (measured twice: −2,399.5 and −2,360.7) and do not return ~1,200 handles.

**Leg 3 is still NOT a 10, and the gap is smaller: 1,026.7 MB against L0's 550–577 band is 1.8×
(was 2.2×) and 5,613 handles against ~1,055 is 5.3× (was 6.4×).**

**The negative control did not hold and is reported rather than dressed up.** The 45-second idle
window was supposed to be flat; private *fell* **446.2 MB** as the process finished booting. It
cannot manufacture the increases attributed to loads — every delta above is an increase measured
from the post-idle 420.7 MB reading, not from the early 866.9 — but by the rubric's own rule this
run does not earn a category-7 score on its own. The first reading was simply taken too early.

**Next candidate, and it is a measurement, not a guess:** count threads alongside handles across
one cycle. ~1,200 handles per cycle for a 1.2 GB mmap'd GGUF still smells like a thread pool or
file mapping that `model.dispose()` leaves behind, which would put the remainder in
node-llama-cpp rather than in this repo. If it is, the product answer is to stop repeating the
cycle — which the same day's `ebc88b40` already does for most users by not loading the model at
all on an English-front profile.

**Trap:** `l7o-backend-cycles.cjs` VOIDs a cycle whose `translate:status` never reported ready, or
whose unload never fired, rather than recording a 0. Two boots were needed to learn that a plain
restart lands in whatever windows the session restored, so take the baseline AFTER an idle window,
never at t+1 s.

## 2026-08-24 (later still) · primary · the weights are now shared and recycled less. D2's number did not move, and here is why.

| Slice | Commit | What landed |
| --- | --- | --- |
| — | `3729e45c` | `llamaModelPool.ts` — one refcounted `LlamaModel` per GGUF, contexts stay per-consumer |
| — | `7af7f8db` | the release grace backs off per churned reload: 60 s → ×2 → capped at 10 min |
| — | `b4e4113b` | `/mem` reports the pool, so a native GB is visible without bisecting a boot |
| — | `45cb990d` | NovelReader's single-chapter button reported the model load, like its range sibling |

**The defect the pool closes, and it was hiding in plain sight.** `translate.ts` and
`localAgent.ts` resolve their GGUF from the *same* two roots (`userData/models`, then
`~/Downloads`) over overlapping candidate name lists, so on an ordinary profile they pick the
same file — and each called `llama.loadModel()` on it. `TRANSLATE_CONTEXT_SIZE`'s own comment
already recorded the price without naming it: main settled at 7,222 MB "after the local agent's
own copy idle-unloaded". Two copies of a 1,223 MB model.

**The measurement, `l7o-backend-cycles.cjs` re-run verbatim on a cold boot of the fix (pid 33092).**

| Mark | priv MB | handles | ready |
| --- | --- | --- | --- |
| boot baseline | 427.5 | 1,064 | false |
| CONTROL idle 45 s | 422.7 (−4.8) | 1,059 (−5) | false |
| cycle 1 load plateau | 3,318.9 | 4,398 | true |
| cycle 1 settled after unload | 919.6 (−2,399.3) | 4,387 (−11) | false |
| cycle 2 load plateau | 3,391.2 | 5,608 | true |

**Cycle 2 cost +1,221 handles against the pre-fix +1,212. That is not an improvement and is not
reported as one.** The negative control held this time (−4.8 MB / −5 handles over 45 idle
seconds), so the reading is sound. Private per cycle went +103.2 → **+72.3 MB**, which is real
but small.

**Why the handles did not move is arithmetic, not mystery, and it is the finding.** The probe
waits 390 s between cycles. Cycle 1's entry has no churn history, so it gets the base 60 s grace
and the weights are genuinely disposed at idle+60 s = 360 s — before the probe returns at 390 s.
The pool cannot help a cadence it never sees. **This probe is built to defeat a grace window**,
which is exactly what makes it the right instrument for the *backend* question and the wrong one
for this fix.

**The sharp, falsifiable prediction the next turn should run, `L7O_CYCLES=3`, ~20 min: cycle 3
costs ≈0 handles.** Cycle 2's entry carries churn count 1, so its grace is 120 s; its idle unload
fires at plateau+300 s and disposal would land at plateau+420 s, while the probe re-acquires at
plateau+390 s. 390 < 420, so cycle 3 is a resident hit with no `loadModel` at all. If cycle 3
still costs ~1,200 handles the backoff is not working and the commit should be re-examined, not
excused.

**Leg 3 is still NOT a 10 and this turn did not close it.** What it did was remove the second
copy and give repeat users a converging cadence; neither is visible in a two-cycle run.

**Trap for the next worker.** The base grace is deliberately only 60 s, so the FIRST recycle of a
model is always paid in full. That is the chosen tradeoff — a one-shot user gets their 1.2 GB
back promptly and only demonstrated repeat use earns residency — and it means any probe whose
inter-cycle gap exceeds 60 s will measure the unfixed number on its first two cycles. Do not read
that as the fix failing.

## 2026-08-24 (evening) · primary · the 3-cycle prediction was HALF right, and the half that failed names the next lever

| Slice | Commit | What landed |
| --- | --- | --- |
| — | `6b53d0e` | `translate.ts` — prompt + completion are budgeted against the context, not assumed to fit |
| — | `b6f1cd6b` | `localAgent.ts` — the same, against the user's own `contextSize` setting |
| — | `201db2d2` | the Workbench's retranslate button reports the model load (4th surface; `backup`'s interrupted slice, finished here) |

**`L7O_CYCLES=3` on a cold boot of `7af7f8db` (pid 2476, `debug/l7o-3cycle-backup.log`).** The run
was cut off by a usage limit during cycle 3's wait, so the cycle-3 unload line is missing; every
line below landed.

| Mark | priv MB | handles | poolResident / grace | ready |
| --- | --- | --- | --- | --- |
| boot baseline | 427.2 | 1,076 | 0 / null | false |
| CONTROL idle 45 s | 421.0 (−6.2) | 1,070 (−6) | 0 / null | false |
| cycle 1 plateau | 3,353.2 | 4,409 (+3,339) | 1 / 60 s | true |
| cycle 1 settled | 922.7 | 4,397 (−12) | **0 / null** | false |
| cycle 2 plateau | 3,386.4 | 5,620 (**+1,223**) | 1 / 120 s | true |
| cycle 2 settled | 2,088.6 | 5,610 (−10) | **1 / 120 s** | false |
| cycle 3 plateau | 3,387.1 | 6,222 (**+612**) | 1 / 120 s | true |

**The backoff works and the prediction's mechanism is confirmed: cycle 2's entry survived the
390 s gap that cycle 1's did not** (`poolResident` 1 vs 0 at the identical sampling point — the
same reading, in opposite states, one cycle apart). **The predicted ≈0 handles did not happen:
cycle 3 cost +612, exactly half of cycle 2's +1,223.** Reported as measured, not as the number
that was asked for.

**What the halving decomposes, and it is the finding.** With the weights RESIDENT, a cycle still
costs **612 handles and +1,298.5 MB**. That is the CONTEXT, not the model: `translate.ts` disposes
its context on every idle unload and `createContext({ contextSize: 8_192 })` rebuilds the KV
cache from nothing. So the per-cycle bill is ~611 handles of weights (which the pool now removes
for a repeat user) and ~612 handles of KV cache (which it cannot touch). **The KV cache is now the
larger half of D2 at 1,298 MB against a 1,223 MB model file** — 8,192 tokens × ~112 KB/token for
Qwen3-1.7B's 28 layers × 8 KV heads × 128 dims × 2 × f16, which is arithmetic that matches the
measurement rather than a story fitted to it.

**Why the next lever is NOT simply shrinking `TRANSLATE_CONTEXT_SIZE`, decided and recorded so it
is not re-litigated.** Two callers legitimately ask for up to 8,192 OUTPUT tokens
(`sentenceAnalysis.ts:212`, `mining.ts:1408`); a smaller context clamps real work. What the two
commits above did instead is make the relationship EXPLICIT — which is what a later size change
needs in order to be safe, and which fixed a live category-8 defect on the way: an over-long
request was never rejected, it was context-SHIFTED, so the model answered fluently about source
text it had already dropped. Pooling a context per `contextSize` is the obvious follow-up and is
deliberately not started here.

**Traps.**
1. **The probe cannot see the fix on its first two cycles by construction.** The base grace is
   60 s and its gap is 390 s, so cycle 1→2 always measures the unfixed number. Only cycle 3
   onwards is evidence. A two-cycle run reporting "no improvement" is measuring its own schedule.
2. **`poolResident` at the settled mark is the discriminator, not the handle delta.** Cycles 2 and
   3 have identical grace and identical plateau memory; what separates them is whether the entry
   was still there when the next cycle began.

## 2026-08-24 (late) · primary · the KV cache was the other half, and pooling it makes a cycle cost +1.8 MB

| Slice | Commit | What landed |
| --- | --- | --- |
| L7 leg 3 | `cd01ffbd` | `llamaContextPool.ts` — the KV cache gets the weights' refcount + grace + churn backoff |
| L7 leg 3b | `4e45c5f2` | eviction of a warm sibling size; `/mem` reports `llamaContexts`; the probe adapted |

**`L7O_CYCLES=3 L7O_UNLOAD_WAIT_MS=330000 L7O_CONTROL_GAP_MS=480000` on a cold boot of `cd01ffbd`
(pid 26592, `debug/l7p-ctxpool-3cycle.log`).** No new probe: `l7o-backend-cycles.cjs` already took
the gap as an env var and was extended with the context row and an adverse gap.

| Mark | priv MB | handles | model / ctx | ready |
| --- | --- | --- | --- | --- |
| boot baseline | 423.7 | 1,068 | 0 / 0 | false |
| CONTROL idle 45 s | 422.8 (−0.9) | 1,068 (0) | 0 / 0 | false |
| cycle 1 plateau (cold) | 3,351.2 | 4,405 (**+3,337**) | 1@60s / 1@60s | true |
| cycle 1 settled, 330 s gap | 3,288.9 | 4,408 (+3) | **1@60s / 1@60s** | false |
| cycle 2 plateau (warm) | 3,290.7 | 4,401 (**−7**) | 1 / 1 | true |
| cycle 2 settled, **480 s ADVERSE gap** | 919.7 (**−2,371**) | 4,388 (−13) | **0 / 0** | false |
| cycle 3 plateau (cold again) | 3,376.8 | 5,609 (**+1,221**) | 1@120s / 1@120s | true |

**A whole cycle now costs +1.8 MB and −7 handles.** Cycle 2 is a load, a plateau and an idle unload
with nothing rebuilt: `translateEnsureReady` returned ready with both pools warm. Against the
previous turn's best number on this defect — **+612 handles / +1,298.5 MB with the weights already
resident** — that is the KV-cache half of D2 closed for a user who returns inside the window.

**The adverse control fired, which is what makes the row above a measurement.** Same boot, same
session, everything identical except the gap: 480 s puts both pools past their grace, `model` and
`ctx` read **0 / 0**, private drops **2,371 MB**, and the next cycle costs **+2,457.1 MB / +1,221
handles**. A fix that "works" at whatever gap the probe happens to use is exactly this file's own
trap 1; one run now measures both sides of the 360 s boundary.

**Decided and recorded so it is not re-litigated.** The cross-FILE case is deliberately not evicted:
switching the model file in Settings leaves the old file's cache and weights warm for their grace.
That is the model pool's existing, deliberate tradeoff (a bounded, temporary hold), the 7 GB plateau
came from cycles rather than from graces, and there is no evidence a file switch is frequent. Only
the same-file/different-size case is evicted, because there the two caches are the SAME work at two
sizes and holding both was a defect `cd01ffbd` would have introduced.

**Traps.**
1. **The boundary is 360 s, not 300 s.** The idle unload fires at 300 s and the base grace adds 60.
   A probe at 390 s measures the unfixed number by construction and always will.
2. **The app under measurement predates `4e45c5f2`** — main does not hot-reload and the pid did not
   change (26592, created 17:34:35, `started` unchanged). It is a valid measurement of `cd01ffbd`
   because `evictOtherSizes` only fires on a size change and this probe uses one size (8,192).
3. `/mem`'s `llamaContexts` is what separates "the cache was rebuilt" from "the weights were
   reloaded". In `privateMb` alone those two are indistinguishable.

**The probe's own machine-readable verdict** (`probes/l7o-backend-cycles.json`, written after the
final settle): `idleControlFlat: true` (−0.9 MB, 0 handles), and `loadedFromCold` reads
**cycle 1 true / cycle 2 FALSE / cycle 3 true**. Plateau-to-plateau, cycle 2 cost **−4 handles and
−60.5 MB** and cycle 3 cost **+1,208 handles and +86.1 MB**. The `gapMs` field records the gap that
FOLLOWS each cycle, so it is cycle 2's 480 s that made cycle 3 cold — the one field to read before
re-deriving the table above.

## 2026-08-24 (evening) · primary — leg 3 re-driven end to end. The magnitude is closed; the RESIDUAL is not, and it is one-time

One cold boot, pid **3668**, restarted onto `67918c19` so `4e45c5f2` is in main (main does not
hot-reload). `l7d-setup.cjs` → Dictionary, then `Make Liquid` through the window's own
`.fwin-b-liquid`: **liquid / 8 entries / 61 controls / 820x580 / forest-night / perf=performance**.
Instrument `probes/l1-deadend.js` — 19 targets, ~70 s — sampled from outside every 10–15 s.

| point | uptime | private MB | handles |
| --- | --- | --- | --- |
| boot baseline (L0 band 550–577 / ~1,055) | 2.15–2.32 | **546.4 → 553.3** | **1,063 → 1,061** |
| burst peak, model load inside the sweep | 2.65 | **3,515.4** | **4,406** |
| resident plateau | 2.8–8.3 | 3,450–3,454 | 4,406–4,429 |
| KV cache freed (context grace fires) | 8.55–8.80 | **2,310.1 → 2,182.1** | 4,422 |
| weights freed (model grace fires) | 9.55–9.80 | **1,236.2 → 1,081.0** | 4,412 |
| both pools empty, `/mem` `models:[] ctx:[]` | 9.85 | **1,081.1** | 4,410 |

**The headline is closed and the number is not an adjective.** The same repro plateaued at
7,071.8 / 7,082.0 / 7,075.7 MB on three boots and never fell. It now peaks at **3,515.4 MB** and
releases **2,434 MB** unprompted, in two steps, on the two pools' own deadlines.

**The residual is +534.6 MB and +3,349 handles over baseline with both pools EMPTY**, and that is
what keeps leg 3 off a 10. It is one-time, not per-cycle — the previous turn measured a whole
load/unload cycle at +1.8 MB / −7 handles — and `llamaBackend.ts` already records why: disposing
the backend was tried and measured not to work (+2,425 handles per cycle either way), so this is
native residue of ever having loaded llama.cpp in this process, not a leak with a lever.

**The full release path is 420 s, not the 360 s the previous handoff banked**: 300 s caller idle +
60 s context grace + 60 s model grace, the last two SERIALISED because the context pool releases
the model lease only from `teardown`. Measured here as 162 s (last use) → 513 s (cache) → 573 s
(weights). A probe sampling at 390 s reads the unfixed number by construction; one sampling at
400 s reads the cache freed and the weights still resident.

**A `leases: 1` on the model with the app quiet is NOT a leaked lease** — it is the context still
holding it through its own grace. Read `awaitingRelease` on both rows before calling it one; the
model's read `false` at 488 s for exactly this reason and it disposed 85 s later.

**Product finding, fixed in `424eb46f`.** `/mem`'s pool rows made it visible: the whole runtime
releases on idle deadlines and had **no quit path**. `disposeAllLlamaContexts`,
`disposeAllLlamaModels` and `disposeSharedLlama` all existed, all documented "shutdown and tests
only", **zero callers in `src/main` or `src/main.ts`**. A quit inside either caller's 5-minute idle
window exited holding 2.4 GB and the thread pool. `stopLlamaRuntime()` now runs the three
innermost-first from `will-quit`; 3 tests, mutation control 3 of 15 red.

**Category 7 verdict: NOT a 10, and this is the first leg-3 statement backed by a full release
curve rather than a plateau.** 1,081.0 MB against 550–577 is 1.96×; 4,410 handles against ~1,055
is 4.18×. What would earn the 10 is a boot whose post-burst settle lands inside the L0 band, and
the only lever left for that is not loading the backend into the main process at all — a
utility-process move, which is a slice of its own and is named as such rather than attempted here.

## 2026-08-24 — leg 4: llama.cpp moved to a utility process, and the residual is gone

**Slices.** `e0c47a1e` the host (`shared/llamaHostProtocol.ts`, `main/llamaHostWorker.ts`,
`main/llamaHost.ts`, a fifth forge entry, 10 tests); `ff1c1fc4` both consumers switched off native
objects onto a `LlamaSessionHandle`, plus `/mem` and `will-quit`.

**Cold boot pid 37248 on `ff1c1fc4`**, restarted for it — main does not hot-reload. Model:
`%APPDATA%/jp-study-app/models/Qwen3-1.7B.gguf` at 8,192 tokens, loaded through
`window.api.translateEnsureReady()`, which resolved `{ok:true}` inside 10 s.

| Moment | main private | main handles | jp-llama-host WS |
| --- | --- | --- | --- |
| cold, no model | 428.2 MB | 1,074 | — |
| model + KV cache resident | 424.4 MB | 1,078 | **3,680 MB** / 3,681 handles |
| child gone (+411 s) | **423.0 MB** | **1,072** | — |

**A whole load/unload cycle now costs main −5.2 MB and −2 handles.** Leg 3, in-process on the same
model, was 546.4 MB / 1,063 → 3,515.4 MB / 4,406 peak → 1,081.1 MB / 4,410 settled: a residual of
**+534.6 MB / +3,349 handles**. That residual is not smaller, it is in another process, and that
process ends. `/mem` after the exit: both pool rows `[]`, no `jp-llama-host` in `metrics`.

**+411 s is the release path answering exactly as specified** — 300 s translate idle unload, then
the context pool's 60 s grace, then the model pool's 60 s, then the child's 15 s idle tick. The
child never exits on its own: it posts `bye`, and main kills it only when it has nothing pending
and no live session. A child exiting the moment it went idle could do so with an `acquire` already
on the wire.

**Category 7 is NOT scored 10 on this leg, and the reason is scope rather than the number.** The
memory criterion is now met with room — main sits BELOW the 550–577 MB L0 band across a full cycle
— but the category's 10 also requires drag frame stability, theme-switch cost, boot cost and the
longest main-process block, none of which were re-driven here. That is the next leg, and it is
cheap now: the biggest main-loop block this surface could produce was a 1.2 GB GGUF load, and it no
longer happens in main at all.

**Trap for the next worker.** `architecture-audit.cjs` calls the worker an orphan because
`utilityProcess.fork()` names it by built path; it is classified in
`tools/architecture-baseline.json` alongside `apkgReadWorker.ts`. If that entry or the fifth
`forge.config.ts` build target is ever lost, the fork exits 1 and `llamaHost.ts` degrades **silently**
to loading llama.cpp into main — the exact residue this leg removed, with no error anywhere.

## 2026-08-24 — leg 4b: the main-loop block during a model load, with a control that fires

Category 7's fifth number, and the one the utility-process move was supposed to change: *"the
longest main-process block observed while the surface is doing its real work (a `/health` probe
answers this — it touches main only)"*. Serial `/health` round trips, so the gap between
consecutive answers IS the block; a fixed cadence would queue behind a stall and report its own
backlog.

| Window | round trips | longest gap | p95 |
| --- | --- | --- | --- |
| idle control, 3 s | 10,980 | 38 ms | 1 ms |
| **during a full 1.2 GB GGUF load (10,548 ms)** | **38,234** | **24 ms** | 1 ms |
| negative control: 5× forced full GC on main | 25 | **216 ms** | 168 ms |

**24 ms against a 500 ms threshold, and the control proves the instrument can see a stall** —
five synchronous `v8` GCs through `/mem {gc:true}` cut throughput from 3,572 answers per second to
25 and produced a 216 ms gap, against a quiet-window maximum of 34 ms. Without that row the 24 ms
would be indistinguishable from an insensitive probe, which is exactly what the rubric warns about.

**Cycle 2, same boot, is the leg-3 comparison point.** A second load forked a NEW host (pid 37284;
the first, 18912, had exited) holding 3,623.4 MB, with main at 424.6 MB / 1,083 handles — flat
across two complete cycles. In the in-process shape a second cycle added roughly another 2,425
handles to main.

**No new file under `probes/`.** `l7n-load-trigger.cjs` drives the same load but scores WHICH
control starts one from renderer events; `l7c-mem-sampler.ps1` samples memory at uptime marks and
never touches main's loop; the l7g/l7h/l7i bisectors all read `/mem`. Adapting any of them would
mean replacing their instrument outright, so both samplers are scratch files under `debug/lhost/`.

**Cycle 2 completed on the same boot: child gone at +401 s, main at 424.5 MB / 1,071 handles.**
Against the cold-boot 428.2 MB / 1,074 that is **−3.7 MB and −3 handles across TWO full model
cycles and ~13 minutes**. Cycle 2 is the leg where the in-process shape doubled its debt
(`llamaBackend.ts`: 1,052 handles at boot → 4,378 after one cycle → 6,811 after a second, with or
without `llama.dispose()`). It no longer accumulates because the process that accumulates it ends.

## 2026-08-24 (night) · primary — the burst path is measured, and the resize defect is fixed rather than logged

One cold boot, pid **30432** (launch 18:56:07.165, Electron main 18:56:18.996), 6 processes,
`l7d-setup.cjs` asserting Dictionary alone visible, `presentation=liquid`, 食べる → **8 entries /
5,534 chars / 349 nodes / 75 controls**, `forest-night`, `data-perf=performance`. Everything below
is that process. Display ceiling re-measured **16.7 ms** (it is not a constant — 10.0 on 08-17).

**Boot.** `npm start` → bridge.json **17.56 s**, → first `/health` **17.85 s**, → renderer ready
(`.os-taskbar`) **25.04 s**; Electron main → renderer ready **13.22 s**. The forge/Vite cache was
warm, so as in every earlier entry this is **not** quoted as an improvement on L0's 93.84 / 106.49 s.

### Leg 1 — gestures on the Dictionary window

| Run | frames | p50 | p95 | max | >100 | main max |
| --- | --- | --- | --- | --- | --- | --- |
| Ceiling | 109 | 16.7 | 16.8 | 16.9 | 0 | 92.2 |
| Drag | 102 | 16.7 | 16.9 | 66.8 | **0** | 5.8 |
| Resize | 104 | 16.7 | 16.9 | 50.2 | **0** | 4.8 |
| Theme switch | 111 | 16.7 | 16.8 | 16.9 | **0** | 3.1 |
| **JANK CONTROL** (12 × 120 ms) | 68 | 16.7 | **117.1** | 150.4 | **13** | 4.9 |

Theme apply **17.3** / restore **33.4** ms, `restoredTo=forest-night`, and `jp-os-theme` +
`data-theme` compared `-ceq` **True** either side. `title=Dictionary` on every gesture run.
**`closedLoop=True` for resize** — it was False on every previous boot, which is the L0 finding;
`971987a9` fixes it, and the independent read agrees: live `.fwin` `1080x700` / rect `1080x700`
against `desktop-layout.json` `video 1080x700` after two closed-loop gestures.

### Leg 2 — `/health` under this window's real work. Bar: no main block over 500 ms.

| Run | samples | p50 | p95 | **max** | proof the work happened |
| --- | --- | --- | --- | --- | --- |
| Idle | 40 | 1.0 | 7.5 | **10.5** | — |
| One real search (勉強) | 40 | 1.0 | 2.9 | **12.0** | `typed=勉強`, `after=8` rows |
| `Find example sentences` | 40 | 1.1 | 11.9 | **168.6** | nodes 303→363, chars 2,700→3,215 |
| ISOLATION CONTROL (renderer blocked 1.5 s) | 40 | 0.9 | 3.0 | **9.0** | main unmoved ⇒ main-only ✔ |
| **SENSITIVITY CONTROL** (756 `lookupTerm`) | 40 | 1.9 | 77.0 | **38,049.3** | `fired===settled===756`, 44,897 ms |

Both real actions pass by more than a factor of three; the single-term batch path still saturates
main, unchanged from L0, and no Dictionary-window action performs it.

### Leg 4 — THE BURST PATH, which the last scorecard entry named as the one thing not measured

`l1-deadend.js`, 19 controls clicked over ~70 s, sampled either side on this process:

| | clock | main private | handles | electron procs | all private |
| --- | --- | --- | --- | --- | --- |
| before | 19:06:00 | **582.3 MB** | 1,071 | 6 | — |
| +70 s | 19:07:25 | **589.1 MB** | 1,082 | **7** | 4,787.3 MB |

**+6.8 MB and +11 handles in main, against the historical 604.2 → 7,082.0 MB.** The seventh
process is pid **23584**, `--type=utility --utility-sub-type=node.mojom.NodeService`, forked at
19:06:11 during the burst and holding **2,942.2 MB** — the burst still loads a model, and the model
is now in the child. The action path and the cycle path now agree; neither is asserted from the
other.

### Traps this pass adds

1. **`l1-q9-drive.cjs` hard-codes 食べる.** `l6-parity-dictionary.js:121` earns the `lookup` row
   from `/食べる/.test(text)`, so any earlier probe that searches something else — `l7e-search.js`
   types 勉強 — makes Q9 read **NO** (`6/7 reachable, unreachable: lookup`) on a healthy tree.
   Restore the setup word before scoring Q9; re-run after doing so gave **7/7, verdict YES**.
2. **A control can be inert without being red.** See `8b3bd5ea`: the Q7 control painted its glass
   on a `display:none` window and reported `zeroBackdropRegions true` with Q7 still YES.

### Leg 3 — main private bytes at 8 / 16 / 24 min, same process 30432, `l7c-mem-sampler.ps1`

| uptime | main RSS | main **private** | handles | procs | all private | what had happened by then |
| --- | --- | --- | --- | --- | --- | --- |
| 8.01 (19:04:19) | 354.1 | **619.6** | 1067 | 6 | 1,602.5 | setup + all five gesture runs + the whole of leg 2, including the 756-lookup burst |
| 16.01 (19:12:19) | 79.0 | **590.6** | 1076 | **7** | 4,801.0 | + leg 4's 19-control burst; the llama host alive, holding ~2.9 GB |
| 24.00 (19:20:19) | 55.6 | **591.4** | 1071 | **6** | 1,789.3 | the host **exited**; 8 minutes strictly quiet, nothing driven |

**−28.2 MB across the load phase and +0.8 MB across the eight quiet minutes.** Handles 1067 → 1076
→ 1071. The line that matters is the last one: all-process private fell **4,801.0 → 1,789.3 MB**
when the child exited, and main moved **+0.8 MB** — the 2.9 GB left with the process that owned it
and cost main nothing. Read the private column; RSS falls 354.1 → 55.6 on OS trim, as this file has
recorded before.

**Leg 3 is scored a pass, and the judgement is stated rather than hidden.** 591.4 MB is **+14.4 MB
(+2.5%)** above the top of L0's 550–577 band. This boot did strictly more than the L0 boot did — a
whole model load and release, a 19-control action burst and a 756-lookup burst, none of which L0
ran — and the band's own spread is 27 MB. A 2.5% overshoot under heavier load is not the class of
regression category 7 exists to catch (that was 1,081 MB, and before it 7,082 MB). The number is on
the record so that a later drift is measurable against it rather than against a band.

**Category 7 = 10/10 on the Dictionary window**, from process 30432, nothing inherited: frames at
the display's own 16.7 ms ceiling with 0 over 100 ms on all three gestures; theme switch 17.3/33.4
ms with the stored theme byte-identical either side; the heaviest real action blocks main 168.6 ms
against a 500 ms bar; the burst path costs main +6.8 MB where it once cost 6.5 GB; memory settles
flat. Five controls fired: jank (p95 16.9 → 117.1), isolation (main unmoved by a 1.5 s renderer
block), sensitivity (38,049.3 ms), and Q7/Q8's two, repaired in `8b3bd5ea`.

## 2026-08-24 (late, pid 37540 @ `8cf1f2b8`) — leg 1 re-driven ON DICTIONARY, and it does NOT hold a 10

Every earlier leg-1 table was recorded with `l7d-setup.cjs` holding the other windows at
`display:none`, so "the largest visible `.fwin`" *was* Dictionary. This boot has the real
three-window desktop (Media 820×580, Video 1080×700, Dictionary 820×580) and the probe drove
**Video** — the `gesture.title` field was the only place it showed. `tools/liquid-interaction-probe.ps1`
now takes `-Title`; the largest-area default is kept so recorded runs reproduce.

**Leg 2 and leg 3 pass on this tree.** Idle `/health` p50 **1.0** / max **10.4** ms; `Find example
sentences` max **4.2** ms against a 500 ms bar with the work proven (nodes 349→415, chars
5476→6038); isolation control — renderer blocked 1.5 s — main max **2.9** ms, unmoved; sensitivity
control **756/756 fired and settled**, main max **51,279.8** ms, so the probe is proven able to see
a block. Leg 3: main private **576.7 MB** at 23.8 min uptime, **inside** L0's 550–577 band, after a
19-control sweep, four presentation round trips, three L6 mutate/restore cycles and the 756-lookup
burst — where the last entry read 591.4 and the one before 1,081.0.

**Leg 1 is the failing leg, and it is NOT Liquid's cost.** Drag on Dictionary, 4 runs:

| presentation | over 100 ms per run | worst frame |
| --- | --- | --- |
| liquid | 1, 0, 0, **2** | **100.3 ms** |
| standard | 0, 1, **2**, 0 | **100.4 ms** |

Same shape either side of the toggle, so the hitch is the shell's drag path on a multi-window
desktop, not `backdrop-filter` re-sampling. Resize is clean (max 83.7, over-100 **0**); theme
switch clean (apply 35.6 / restore 58.7 ms, `restoredTo=forest-night`); ceiling 110 frames at
16.6–16.9. Jank control fired: p95 16.8 → **116.9**, over-100 0 → **12**.

The rubric's bar is 0 frames over 100 ms and it is missed in **4 of 8** runs by one dropped frame
slot (100.3 ≈ 6 × 16.7). **Category 7 is not scored 10 here.** Recorded as the number rather than
argued down: a 0.3 ms overshoot is small, and an intermittent single dropped frame during a window
drag is exactly what this category exists to notice.

**Trap this pass adds.** Three instruments resolved the window as "the first/largest visible
`.fwin`", which was correct only while the desktop was artificially isolated: `l1-q78-drive.cjs`
refused with *"window is not liquid at the start"* (it had Media), `l7e-examples.js` refused with
*"no Find example sentences button"* (same), and the gesture probe silently scored Video. All three
now resolve by title. A refusal that names a product state is the shape to distrust.

## 2026-08-24 (late) — the drag hitch located to the gesture BOUNDARIES, two product fixes, still not a 10

**Where the long frames actually are.** The frame recorder was re-run with marks at
`pointerdown` and `pointerup`. One drag, 112 frames, over-33 at indices `25:83.6`, `56:66.9`,
`84:100.4`, `98:66.9`; marks `predown@25 postdown@25 preup@85 postup@85`. **The two worst frames
sit exactly on the two boundaries**, not spread through the 60 moves. So this is per-gesture
setup/teardown cost, and the per-move path was already clean.

**Negative result, recorded so nobody re-derives it: `os-interacting` is NOT the cost.** The class
`perfSetInteracting` toggles on `<html>` drops `backdrop-filter` from every `.fwin`
(`styles.css:12819`), which looks exactly like a compositor-layer teardown. Six full toggles with
no drag at all: **131 frames, max 16.8 ms, 0 over 33**. Free. The rule can stay.

**Fix 1 — `deskDrag.ts` cached the desk rect.** `moveDeskDrag` ran `getBoundingClientRect()` on the
desk element on EVERY `pointermove`, before `dragStart`'s rAF throttle and interleaved with the
rAF's `style.transform` write — a forced layout flush per pointer event at up to the pointer's full
report rate. Cached for the gesture, invalidated on `resize` and at begin/end/cancel. 4 new tests
pin it (200 moves ⇒ 0 extra reads; a mid-drag resize still re-measures, because a stale rect would
hand the window to the wrong monitor).

**Fix 2 — `DesktopShell.focus()` no longer re-renders a window that is already on top.**
`dragStart` calls it on every `pointerdown`, so dragging the window you are already using rebuilt
the whole `wins` array and re-rendered every mounted window inside the pointerdown handler. Guarded
with `!w.min && w.z === zTop.current → return ws` (identity preserved, React re-renders nothing).

**Measured, 6 runs each, same boot, same three-window desktop, `closedLoop=True` throughout:**

| | frames delivered | over 33 ms | over 100 ms | worst |
| --- | --- | --- | --- | --- |
| before | 92, 93, 93, 95, 95, 92 | 4,4,4,5,4,4 | 2,0,0,0,2,2 | 100.4 |
| after both fixes | 92, 100, 102, 98, **101**, **101** | **2–3** (one 4) | 1,1,1,2,**0**,**0** | 100.3 |

**Frames delivered rise ~93 → ~101 and over-33 halves. Category 7 is still NOT a 10.** One ~100.2 ms
frame remains, at `pointerup`, where `onPatch({x,y})` commits the position — a React re-render plus
the layout persist. That commit has to happen; removing its cost is a separate slice (commit off
the gesture frame, e.g. in a `requestIdleCallback` or after a rAF), and it is named here rather
than half-attempted. Reported as measured: two real improvements, bar still missed.

## 2026-08-25 — leg 1 CLOSES: FloatingWindow's memo could never hit (`9c4a38e5`)

**The cause, read from source rather than profiled.** `FloatingWindow` is `memo()`-wrapped, but
the call site handed it six freshly-allocated arrows AND a fresh `children` element on every
render, so the shallow comparison failed on seven props at once. The wrapper cost a comparison and
skipped nothing: one `patch()` — which `pointerup` fires to commit the position — re-rendered every
open window and every `AppSection` under it. Stabilising the callbacks alone would not have worked;
`children` is a prop too, and an element literal is a new object every render.

Fix: `src/renderer/renderIdentityCache.ts`, a per-key identity cache (hooks cannot run in a loop,
so `useMemo` is unavailable here). Handler bundles read the actions through a ref rather than
closing over the current render's functions — `focus`/`close`/`patch` are plain declarations
recreated every render, so capturing them would freeze the first render's closures. Stamped by
section so `onPopOut` can never aim at a previous app; pruned on the `wins` effect. `note` and
`settings` bodies are deliberately NOT cached (their children depend on live state) — the honest
limit of the fix. 8 tests; mutation control (always rebuild) turns 6 of 8 red.

**Measured after a REAL RESTART, as the rubric requires.** App stopped and `npm start`ed fresh
(main pid 32344). Same three-window desktop (Media / Video / Dictionary), `-Title Dictionary` so
the instrument drives the scored surface, `closedLoop=True` on every run.

**The harness was loaded first, and this is not bookkeeping.** On the cold boot the Dictionary
window restored EMPTY — 341 body chars, 12 controls. An empty body is a far cheaper re-render than
the loaded one the "before" numbers came from, so a clean score there would have been the rubric's
"measured only on an empty harness" cap, not a pass. Queried 食べる through the window's own input
(React needs the native value setter, not a bare `.value` write) to reach **67 controls / 5,461
body chars / 334 nodes** — the previous entry's loaded state was 67 / 5,385. Then re-drove.

| drag, 6 runs each | frames delivered | over 33 ms | over 100 ms | worst frame |
| --- | --- | --- | --- | --- |
| before (last entry) | 92, 93, 93, 95, 95, 92 | 4,4,4,5,4,4 | 2,0,0,0,2,2 | **100.4** |
| after, empty body | 109–110 | **0** ×6 | **0** ×6 | 17.5 |
| after, loaded body | 109–111 | **0** ×6 | **0** ×6 | **16.9** |
| after, standard presentation | 110–111 | **0** ×3 | **0** ×3 | 16.9 |

Compositor ceiling on this display measured the same session: **16.9 ms**. The loaded drag's worst
frame is *equal to the ceiling*, so the gesture is no longer distinguishable from what the display
can do at all. Standard presentation matches, which is the control that says the fix is in the
shell's drag path and not something presentation-specific.

**Legs 2 and 3.** Leg 2: `Find example sentences` — the heaviest action this window performs —
main `/health` **max 3.5 ms** (p50 1.0, 40 samples) against a 500 ms bar, with the work proven
rather than assumed: nodes 349→415, chars 5,476→6,038, `done:true`, 3,002 ms of renderer work.
Resize max **16.9** (was 83.7), theme apply **26.3** / restore **33.7** ms with
`restoredTo=forest-night`. Leg 3 is IN PROGRESS, not claimed: main private **557.6 MB at 2.9 min**
uptime, inside L0's 550–577 band, with the 8/16/24-minute curve still being sampled to
`%TEMP%\l7c-mem-memofix.jsonl`.

**Instrument repair, one, and it prevents a fabricated finding.** Two of ten pre-restart runs
reported `frame_max_ms = 3927.9` — *identical to the decimal*, which no pair of independent
gestures produces — while eight surrounding runs read 16.8–17.5. That is Chromium throttling rAF
in a backgrounded window; the probe checked focus only BEFORE installing the recorder, and
dropping index 0 does not catch it because the gap lands mid-recording. `liquid-interaction-probe.ps1`
now re-checks focus after the gesture and **VOIDs** rather than reporting a throttle gap as
renderer cost. Sensitivity control still fires: `-Jank` gives 12 blocks → **12** frames over 100 ms,
max 117.1, so the recorder sees what it reports and the zeros above are a real result.

**Trap this pass adds, paid for twice.** `l7c-mem-sampler.ps1` cannot be launched with `pwsh -File`:
`-Marks 8 16 24` produces no file at all, and `-Marks "8,16,24"` binds as a single mark of
**81624.0** — a sampler that stays alive, samples nothing, and reads exactly like one still
waiting for its first mark. Use `-Command` with `@(8,16,24)` and read the header record back;
`marks:[8.0,16.0,24.0]` is the only proof of a good bind. Written into the probe's own header.

## 2026-08-25 · primary — leg 3 RE-OPENED on this boot and IN FLIGHT, plus the confound it must be read against

Dictionary's legs 1, 2 and 4 closed on pid **32344**. Leg 3 was left "IN PROGRESS, not claimed" on
that boot and is the surface's last open leg — so it is re-driven here on pid **1324**, the boot that
carries the `6620ab71` frequency-listing fix, rather than transcribed across boots.

**Harness loaded FIRST, because an empty Dictionary is the rubric's own cap and not a pass.**
`l7d-setup.cjs` drove 食べる through the window's own input: **8 entries / 5,476 chars / 349 nodes /
75 controls**, `presentation=liquid`, `forest-night`. Matches the `9c4a38e5` entry's loaded state
(8 / 5,476 / 349) so the two boots are comparable.

**Marks are relative to NOW, and that is forced.** The sampler keys off *process uptime* and pid 1324
was already **123 min** old, so the canonical 8/16/24 marks were long past. Marks are `@(125,133,141)`
— a 16-minute window opening at the load. Header record verified before walking away, which is the
one guard against the array-bind trap: `marks:[125.0,133.0,141.0]`, a good bind. Output
`%TEMP%\l7c-mem-dict.jsonl`; the sampler is detached and outlives the turn.

| mark | uptime | main private | handles | all-process private |
| --- | --- | --- | --- | --- |
| 125 | 125.0 min | **584.9 MB** | 1,126 | 1,852.9 MB |
| 133 | — | pending | pending | pending |
| 141 | — | pending | pending | pending |

**NOT SCORED, and here is what the next worker must not do with that first row.** 584.9 MB is above
L0's 550–577 band, and reading that as a regression would be wrong twice over. (1) It is an ABSOLUTE
at 125 minutes of uptime, on a boot that has since taken three full four-language state sweeps, a
12,000-lookup control, ten gesture probes, two dead-control censuses and a Dictionary load — not a
cold 8-minute boot, which is what L0's band measures. The scorable quantity here is the **delta
across the three marks**, exactly as Video's +1.8 MB was. (2) A full `npx vitest run` was executing
concurrently with mark 125. Private bytes are not trimmed the way RSS is, so the effect should be
small, but it is a real confound and it is disclosed rather than smoothed: if the delta comes back
ambiguous, re-drive the window on a quiet machine before scoring it either way.

**Desk state this leg needs, and it is deliberately left in place.** `l7d-setup.cjs` sets inline
`display:none` on Media, Video and Settings so the instrument cannot type into a neighbouring window.
Restoring them mid-curve would change the harness the marks are being taken under, so they stay
hidden until the curve completes. One command undoes it, added this turn:
`node src/.coordination/liquid-workplace/probes/l7d-restore.cjs` — it clears the inline value rather
than assigning `block` (the `.fwin` rule owns the display mode) and reports the resulting desk, so
"restored" is a measurement rather than a claim.

**Dictionary is 7 of 8 and category 7 is the only open one.** Video closed at 8 of 8 this turn
(`c7115f56`).

## 2026-08-25 (later) · primary — leg 3 CLOSES on pid 1324; leg 2 produces one over-bar sample that this boot cannot settle

**Leg 3, the full curve, main pid 1324, Dictionary loaded (8 entries / 5,461 chars / 349 nodes /
75 controls), `presentation=liquid`, `forest-night`, `en`.**

| mark | uptime | main private | handles | all-process private | main RSS |
| --- | --- | --- | --- | --- | --- |
| 125 | 125.0 min | 584.9 MB | 1,126 | 1,852.9 MB | 525.1 |
| 133 | 133.0 min | 585.1 MB | 1,127 | 1,862.1 MB | 67.5 |
| 141 | 141.0 min | **586.5 MB** | **1,122** | 1,882.2 MB | 57.9 |

**Delta across the window: +1.6 MB and −4 handles in 16 minutes** — the scorable quantity, and the
same shape as Video's +1.8 MB / +1 handle. **Leg 3 PASSES.** The absolute 586.5 MB is +9.5 MB
(+1.6%) over the top of L0's 550–577 band; stated rather than band-matched, because L0 measures a
cold 8-minute boot and this one is 141 minutes old and has taken three four-language sweeps, a
12,000-lookup control, ten gesture probes, two dead-control censuses and a Dictionary load.

**Two disclosed confounds, neither of which moved it.** A full `npx vitest run` overlapped mark 125
(previous turn) and two single-file `vitest run`s overlapped the 133–141 leg (this turn) — both are
separate node processes and private bytes are not trimmed, and the curve is flat across both.
**The RSS column is the control on the instrument**: 525.1 → 67.5 → 57.9 while private moved 1.6 MB.
The two counters diverge by **467 MB** on the same process at the same instant, which is exactly why
this sampler reads `PrivateMemorySize64` and never `WorkingSet64`.

**Leg 2 on this boot, and it does NOT close.** `Find example sentences` — the heaviest action this
window performs — under `liquid-perf-probe.ps1`, `/health` sampled every ~120 ms:

| run | main max | driver evidence |
| --- | --- | --- |
| 1st of the boot | **1,034.2 ms** | `done:true`, nodes **349→415**, chars **5,476→6,038**, 3,002 ms renderer |
| re-run | 4.0 ms | same word; node growth cannot validate a refill (415→415) |
| re-run | 3.9 ms | — |
| idle baseline | 9.4 ms | p50 1.0, 40 samples |

**Two attributions, both run, both exonerating.** (1) The 1,034.2 ms sample was the first probe
after `l7d-restore.cjs` un-hid Media, Video and Settings, so the re-mount is a candidate: driving
**only** the visibility change (hide 3, 600 ms, restore 3 — `hid:3, done:true, ms:601`, all four
windows back to a cleared `display`) reads main max **5.0 ms**. Re-mount exonerated. (2) The panel
re-runs prove nothing because they re-query the same word, so `dictExamples` was called directly,
one word at a time, on four the boot had never seen: 猫 **48 ms / 8 rows**, 学校 **21 ms / 8**,
清い **164 ms / 3**, 鉃 **47 ms / 0** (an honest empty), main max **99.2 ms** across all four.
The steady path is cheap and the cost is not per-word.

**So it is a once-per-boot cost of about a second, and this boot can no longer measure it** — it
only happens on the first `dict:examples` and there has now been one. `findExampleSentences` is an
uncapped-index `instr` scan over `examples` (234,982 rows) on the main thread, so a cold OS page
cache is the standing hypothesis, but **hypothesis is not attribution and it is not recorded as
one**. Reproducing it needs a fresh boot, and a restart would make leg 3's 16-minute curve stale by
the rubric's own rule — the two cannot be had on the same boot in this order.

**Category 7 is therefore NOT a 10 and Dictionary stays 7 of 8.** Leg 3 is closed and does not need
re-driving; leg 2 is the open one, with one over-bar observation and no second.

**Next slice, and it is the opening one: restart, then take leg 2 FIRST.** Drive Dictionary to its
loaded state, run `liquid-perf-probe.ps1` across the boot's **first** `dict:examples` with
`l7d-examples-attrib.js`-style per-IPC timing already installed, then start the leg-3 sampler on
that same boot. Order matters: leg 2's number exists only in the first few seconds of a boot's use
of this feature, and leg 3's needs 16 uninterrupted minutes after it.

## 2026-08-25 (later) · primary — leg 2 REPRODUCES at 6,590.8 ms, and "once per boot, not per word" is CORRECTED

Real restart: forge tree stopped, `npm start`, main pid **36020** (was 1324), fresh bridge token,
`llamaHostWorker.ts` rebuilt in the boot. Desk restored to four windows, Dictionary **liquid**
820×580, driven to **8 entries / 5,476 chars / 349 nodes / 75 controls** before anything queried
examples — an empty harness caps this category at 0. Probe: `probes/l7f-first-examples.js`, the
boot's first `dictExamples` call, five words, per-IPC timing.

| pass | 食べる | 海 | 痛い | 窓 | 話す |
| --- | --- | --- | --- | --- | --- |
| 1 — cold | **6,590.8 ms** | 50.0 | **641.6 ms** | 60.0 | 49.6 |
| 2 — same words, same boot | 35.5 | 20.3 | 38.8 | 35.1 | 26.2 |

All ten calls returned **8 examples**, so the work is real in both passes and pass 2 is not an
empty short-circuit. **Two of five words are over the 500 ms bar on a cold boot**, the worst by
13×. Pass 2 is the control on the mechanism and it fired: 食べる collapses **186×**, same word,
same query, same row count — so the cost is cache residency, not the query.

**The correction, and it matters more than the number.** The previous entry concluded "once per
boot, not per word" from four never-queried words at 48/21/164/47 ms. Those were measured *after*
the boot had already spent its first call, i.e. on the warm path — pass 2 above reproduces them
almost exactly (20–39 ms). The warm path was measured and reported as the cold one. 痛い at
**641.6 ms** is the disproof: it is not the first call, it is never-queried, and it is over the bar.
The cost is paid per cold *region of the corpus*, so several early lookups pay it, not just one.

**Also corrected: the standing hypothesis is wrong on its face.** The previous entry calls
`findExampleSentences` an "uncapped-index `instr` scan". It is capped — `limit EXAMPLE_SCAN_ROWS`
(400, `shared/lexiconExamples.ts:8`), and `dictService.ts:1716` documents the cap and why there is
no `ORDER BY`. What the cap bounds is the RESULT, not the scan: a word whose matches are sparse
still visits the corpus before it can return fewer than 400 rows. `examples` has an index on
`dict_id` only (`schema.ts:621`) — none on `lang` — and `instr` cannot use one regardless.

**Leg 2 FAILS. Category 7 is NOT a 10, Dictionary stays 7 of 8, gate 461 stays OPEN on Dictionary.**
Video remains 8 of 8.

**Instrument defect fixed in the same turn, because it had already bought one false pass here.**
`-DuringJs` took JS *text*, and every probe in `probes/` is a *path* — which is also what this
file's own "next slice" told the next worker to pass. A path is not an expression, /eval throws,
nothing reads the throw, and the run reports a clean distribution: this turn it read **max 5.9 ms**
across the call that actually cost 6,590.8 ms, and `window.__l7fEx` did not exist. It now loads a
path when the argument resolves to a file. Delivery control: the parked `startedAt` re-arms after
the run (`1787657506267` → `1787657567896`) where before the fix the global was absent entirely.
Believe `window.__l7fEx.done`, never the harness's exit code.

**Next slice, in order.** (1) Fix the cold-lookup cost — it is a main-thread scan of a 234,982-row
table and the two levers are moving `dict:examples` off the main event loop or making the scan
resident-bounded; decide from measurement, not from this paragraph. (2) Re-drive leg 2 on a fresh
boot with the repaired harness. (3) Leg 3's 16-minute curve on that same boot — it must be
re-driven regardless, since `855789ca` changed main-process code (`llamaHost`, `translate`).
