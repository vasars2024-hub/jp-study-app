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
