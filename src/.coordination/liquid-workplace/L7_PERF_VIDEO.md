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
write time only the header record exists. L0's band for a settled main is **550–577 MB**; this boot
reads 450.9 MB at 5.9 min, below it.

**Verdict: category 7 on Video is NOT 10.** Leg 1 passes with room and its control fires; leg 4 is
clean; leg 2 fails on a reproduced product number. The next slice is `Review` and `Study Mode` —
find what those two destinations run on main and move it off the loop — then re-drive leg 2.
