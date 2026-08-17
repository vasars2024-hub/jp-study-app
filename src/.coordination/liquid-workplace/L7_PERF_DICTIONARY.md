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
