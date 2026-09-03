# L0 performance baseline, part 2 — the six rows that needed a real restart

Milestone: **L0-baseline-1**, restart leg. Measured 2026-08-16 on `feat/nyaa-subtitles` at
`71aa9409`. `PERF_BASELINE.md` holds the main-loop leg and **is not modified by this file** —
none of its numbers are touched, restated or corrected here.

The app was **stopped and cold-started for this pass** (launch 21:04:31, Electron main up
21:05:49.294). Every number below comes from that one process. A restart mid-sequence voids
everything before it, which is why all six rows were taken in one run.

Instruments: `tools/liquid-perf-probe.ps1` (main event loop, unchanged) and the new
`tools/liquid-interaction-probe.ps1` (renderer frame deltas + main availability across a
gesture, driving the app's own `dragStart` / `resizeStart` pointer handlers).

## The reference frame rate is 10 ms, not 16.7 ms

**This display runs at ~100 Hz.** Scoring a gesture against an assumed 60 Hz budget would call
a dropped frame healthy. The `ceiling` mode animates a throwaway compositor-only layer to
establish what the machine can actually do:

| ceiling run | frames | p50 | p95 | max | >16.7 | >33 | >100 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| post-boot | 186 | 10.0 | 10.1 | 10.3 | 0 | 0 | 0 |
| settled | 165 | 10.0 | 10.1 | 140.0 | 3 | 2 | 1 |

**There is deliberately no "idle" frame control, and the reason cost a run.** A static page
produces about **3 frames per second** — Chromium only runs rAF when the compositor produces a
frame, and a page with nothing changing gives it no reason to. The first version of this probe
recorded exactly that and reported a **360 ms frame** on a perfectly healthy app. An idle
control here is not a weak control, it is an inverted one.

## Boot — one cold start, dev build

| | |
| --- | --- |
| `npm start` → `debug/bridge.json` written | **93.84 s** |
| `npm start` → first `/health` answered | **93.93 s** |
| `npm start` → renderer ready (`.os-taskbar` present) | **106.49 s** |
| Electron main process start → renderer ready | **28.26 s** |
| Debug bridge up → renderer ready | **12.66 s** |
| Restored on first paint | 2 `.fwin` (Scraper, Anki), 1 taskbar, 6 icons, theme `forest-night` |

**Read the 106 s as a dev-server number, not a product number.** `electron-forge start` builds
main and preload and brings Vite up before Electron launches at all; the renderer's first load
then transforms modules on demand. **28.26 s from the Electron process itself to a mounted
renderer is the closest honest figure to a packaged boot**, and it is still slow.
**Gap: no packaged-build boot number exists.** Do not quote either figure as the packaged cost.

## Gestures — frame stability and main availability

All driven through the product's own pointer handlers. Frame deltas in ms; main = `/health`
round trip sampled over a 1.8 s window covering the gesture.

| Gesture | frames | p50 | p95 | max | >16.7 | >33 | >100 | main p50 | main p95 | main max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Window drag, post-boot | 153 | 10.0 | 10.1 | 90.1 | 6 | 4 | 0 | 2.4 | 9.4 | 125.9 |
| Window drag, settled | 153 | 10.0 | 10.1 | 89.9 | 5 | 5 | 0 | 2.7 | 47.9 | 129.5 |
| Resize, post-boot | 136 | 10.0 | **40.0** | 110.0 | 12 | 8 | 2 | 2.6 | 12.8 | **475.3** |
| Resize, settled | 155 | 10.0 | 10.2 | 80.1 | 7 | 5 | 0 | 2.4 | 35.5 | 145.8 |
| Theme switch, post-boot | 167 | 10.0 | 10.1 | 110.0 | 3 | 2 | 1 | 2.7 | 16.9 | 24.2 |
| Theme switch, settled | 183 | 10.0 | 10.1 | 20.0 | 1 | 0 | 0 | 2.3 | 25.8 | 143.4 |
| **CONTROL** — drag + 10×120 ms renderer blocks | **65** | 10.0 | **119.9** | 189.9 | 14 | 12 | **10** | 2.3 | 40.5 | 132.3 |

**Against the 500 ms main bar: every gesture passes, worst 145.8 ms settled.** Against the
10 ms frame ceiling, drag/resize/theme all hold p50 and p95 at the display's own rate.

**The one number that did not reproduce is the resize row's 475.3 ms main max.** It was taken
~2 min after boot; the settled re-run gave 145.8 ms and p95 40.0 → 10.2. Recorded as
**post-boot settling, not a resize cost** — a single reading during the app's first minutes is
not a baseline, and quoting 475 ms as "resize nearly breaches the bar" would be false.

**Theme switch, from the app's own choke point:** attribute stamp + `jp-theme-changed` broadcast
to two frames painted = **20.0 ms** settled (61.9 ms post-boot); the restore leg 23.6 ms
(135.8 ms post-boot). The `localStorage` write `applyTheme` also performs is **excluded** — renderer
storage has no restore point, and the write is not where the cost is. `jp-os-theme` was captured
before and asserted after with `-ceq`: **`forest-night` → `forest-night`, byte-identical**, and
live `data-theme` is back to `forest-night`.

### The control, and what it proves

`-Jank` runs the same drag with repeated 120 ms synchronous renderer blocks. Frames **153 → 65**,
p95 **10.1 → 119.9**, frames over 100 ms **0 → 10**. The probe sees jank when jank exists.
Main was **unchanged** (p50 2.3, max 132.3), which independently re-confirms the isolation claim
in `PERF_BASELINE.md`: `/health` measures main and nothing else.

## Memory — a ~3 GB transient in main, released within 10 s

| Sample | main RSS | main private |
| --- | --- | --- |
| Renderer ready (0.5 min uptime) | 663.1 MB | — |
| 2.8 min uptime (**one sample**) | **3,174.1 MB** | **3,459.0 MB** |
| 3.0 → 3.8 min uptime (5 samples, 10 s apart) | 373–379 MB | 431 MB |

Whole app at the peak sample — **3,809.6 MB across 6 processes**: main 3,174.1 · renderer
352.9 · renderer 97.6 · gpu 70.3 · utility `audio.mojom.AudioService` 17.5 · utility
`network.mojom.NetworkService` 13.7.

**Private bytes fell 3,459 → 431 MB, so this is a real allocation genuinely released, not a
working-set trim.** Handle count did not move (1,095 → 1,096), so it is not a leak of OS objects.

**Stated as observed, not explained.** It is one sample, its owner is not identified, and this
pass did not attempt to attribute it. **Do not score category 7 on it** until a second cold boot
reproduces the peak and a bisect names the allocation. What it does establish is the steady-state
figure a later regression is measured against: **main ~375 MB RSS / ~431 MB private, settled.**
Note the previous process at 78 min uptime read 366.1 MB RSS — consistent with that steady state.

## Finding — a resize that ends where it started leaves the DOM out of sync with state

**Reproduced twice, deterministic.** After a closed-loop resize gesture the live window measured
**827×584** while `desktop-layout.json` held **820×580** — the committed, correct value.

`resizeStart`'s `move` writes `node.style.width/height` imperatively once per rAF
(`DesktopShell.tsx`, the `raf` clamp). Its `up` cancels any pending rAF write and calls
`onPatch({w: curW, h: curH})` — but **does not clear the inline style it wrote**, relying on
React to reconcile. When the committed size equals the starting size, `win.w`/`win.h` do not
change, React re-renders nothing, and the last rAF's inline write survives. `dragStart` does not
have this: its `up` explicitly assigns `left`/`top` and clears `transform` before committing.

- **Persisted state was never wrong** and it self-corrects on the next reload or state change.
- It is a **reversibility** defect, which is the class L3's byte-for-byte round trip exists to
  catch — logged here rather than fixed, because L0 forbids product code.
- The window was restored to 820×580 by hand after each affected run; `desktop-layout.json`
  was read and confirmed unchanged at 820×580.

## Harness accommodations, disclosed

- `dragStart`/`resizeStart` call `setPointerCapture(e.pointerId)`, which throws for a synthetic
  pointer id because no active pointer exists. The probe stubs
  `setPointerCapture`/`releasePointerCapture` to no-ops for the gesture and restores them. The
  `pointermove` listener is attached to the grip element directly, so dispatching at that element
  reaches the same handler capture would have routed it to — the work under measurement is
  unchanged.
- Every gesture offset follows `sin(0..π)` and returns to 0, so the commit on `pointerup` writes
  back the coordinates it started from. `closedLoop` is reported per run and was **true** for
  every drag. It is **false for every resize** — that is the finding above, not a harness fault.
- `/focus` is called and verified before each run, and the script refuses on an unfocused or
  minimized window. rAF is throttled in a background window; an unfocused run would report ~1000 ms
  frames and read as catastrophic jank.

## What is still not measured

| Baseline | Status | Blocker |
| --- | --- | --- |
| Player frame stability | ~~not measured~~ **CLOSED 2026-09-03** | Taken in a separate session with a real clip loaded — `PERF_BASELINE_PLAYER.md`. 0 dropped / 0 corrupted frames over six readings, renderer p50 at the session ceiling. Not folded into this file because it is a different process and a different scene; nothing above is restated by it. |
| Packaged-build boot | **not measured** | Only the dev boot exists; the 106 s figure includes Vite and forge. |
| Memory peak attribution | **observed, unexplained** | One sample; needs a second cold boot plus a bisect. |
