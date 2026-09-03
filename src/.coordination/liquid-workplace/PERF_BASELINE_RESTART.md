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

## Player frame stability — MEASURED 2026-09-03 (backup), the sixth axis

L0's bullet names six baselines and this file recorded five. The sixth was open from 2026-08-16
to 2026-09-03 for one reason, written in both `PERF_BASELINE.md:98` and `VIDEO_BASELINE.md:109`:
it needs a real clip, and **a player with nothing loaded drops no frames and therefore scores
perfectly**. Every refusal in the instrument exists to stop exactly that.

Instrument: `cat7-perf.cjs --surface player --player-frames` (correction 37 — a mode on the
existing category-7 runner, not a new probe). It reads `getVideoPlaybackQuality()` **deltas**
from a renderer-side sampler. Not rAF: a decoder dropping half its frames still presents a
compositor frame every 16.7 ms, so rAF scores a healthy player and a stuttering one identically.
Cumulative ratios are not used either — the startup burst dominates them (measured on the JoJo
clip: 203 of the first 1,950 frames, 10.4%, against a steady state of zero).

Subject: `[project-gxs] Date a Live II - Kurumi Star Festival OVA [10bit BD 720p]`, opened
through the product's own `seanime:media-workspace-open` into `#media-workspace`, 1280x720,
direct-streamed from the sidecar. Scene: 2 desk windows (Dictionary, Video), 16,414 elements
under the workspace root. Main process uptime 107,532 s — settled, as the rubric requires.

| Axis | Reading |
| --- | --- |
| Decoded / dropped | **1,298 / 0** over 54.15 s of wall clock |
| Dropped | **0.00 %**, 0 of 4 rated seconds carried a single drop |
| Decode rate | **24.0 fps** of media time |
| Media-to-wall ratio at rate 1 | **1.00** — the player never fell behind its own clock |
| Corrupted frames | **0** |
| Score | **PASS 10/10**, no findings, no voids |

**Sensitivity control, and it FIRED.** A clean frame number means nothing unless the recorder can
be shown to see a decoder that is dropping frames. The subject itself was driven to
`playbackRate = 8` — ~192 fps asked of a 60 Hz display — and re-sampled on the same element in
the same session: **1,164 decoded / 802 dropped = 68.9 %, 132.17 dropped per wall second against
0.00 clean.** Then undone, measured not assumed: rate back to 1, `paused: false`, position seeked
back to 373.15 s. Banked at `baselines/cat7-player-frames.json`.

The first design used a second off-screen `<video>` on the same source as the control. **Do not
repeat that**: it decodes the same sidecar directstream id, and running it at 8x wedged the
stream — the next three opens mounted the library browser instead of the player. One decoder,
one stream.

### Observed beside it — DEFECT S5, and its control fires

While the media workspace is mounted, this renderer stops servicing its own timers for tens of
seconds. Three independent readings on the scored instrument: a 30 s leg returning **3 samples
over 37.1 s**, another **3 over 41.0 s**, and the scored leg **5 over 54.2 s with a 28,756 ms gap
between two consecutive ticks**. `/eval` itself times out through the same stretches.

The discriminating series, a bare `setTimeout` recorder armed for 20 s at a 1 s interval, three
arms on one process minutes apart:

| Arm | Ticks | Longest gap |
| --- | --- | --- |
| workspace open, clip playing | **1** | **137,254 ms** |
| workspace open, same clip paused | 4 | 58,547 ms |
| **workspace closed (control)** | **11** | **1,586 ms** |

So the renderer is not generally starved and the stall is not the decoder: closing the surface
restores a 1 s cadence within 1.6 s of jitter, and pausing playback only halves the damage.

Two further explanations are ruled out by measurement rather than argument. **Not background
throttling**: `document.visibilityState` is `visible`, `document.hidden` false,
`document.hasFocus()` true, taken while a leg was stalling. **Not the subtitle track**: it
reproduces on this OVA as readily as on the JoJo clip with its 36,435-line ASS sidecar.

A caveat was owed — this process is **29.9 hours old**, so its renderer modules predated the media
fixes of 2026-09-03 — and it was answered in the same turn rather than handed on. `/reload` on the
bridge re-executed every renderer module from the Vite dev server (main is untouched and still old;
S5 is a renderer-thread symptom, so this is the half that matters), and the arms were re-taken with
the surface driven through its own controls:

| Arm, freshly loaded modules | Ticks | Longest gap |
| --- | --- | --- |
| workspace closed | 20 | 1,014 ms |
| host open via `.seanime-host-launcher`, full library browser, **no clip** | 20 | 1,015 ms |
| same host, **OVA playing** | 7 | **10,966 ms** |

So the mounted surface is exonerated: the no-clip arm is indistinguishable from closed, at 1,015
against 1,014 ms, with the same ~17k-element subtree on screen. The playing clip is the term. A
`PerformanceObserver({entryTypes:['longtask']})` over the same window gives the shape — **35 long
tasks totalling 32,999 ms in ~22 s, the two largest 10,755 and 10,531 ms, every one `name: 'self'`
with `containerType: window`**, so top-document JS rather than an iframe or the JASSUB worker.

Recorded as a LEAD and not as a diagnosis, because it has not been tested as a cause: with the clip
playing this surface renders **3,054 `.study-transcript-text` nodes** inside a 16,952-element host,
against CLAUDE.md's own rule to virtualise large rendered collections. Cheapest falsification is a
clip with a short transcript. Second candidate, equally untested: a resume/progress write on a timer
re-rendering the library pane.

Magnitude depends on the age of the module graph — 137 s at 29.9 hours, 11 s fresh — so quote the
age beside the number or the two readings look like a contradiction.

Note also that the decoder itself is unaffected: 1,298 frames at 0 dropped and a 1.00 clock ratio
were taken *through* these stalls. That is the whole reason the video pipeline's own counters are
the right instrument here and a main-thread recorder is not — a rAF or `setTimeout` recorder in
this session would have reported catastrophic jank on a player that was in fact perfect.

## What is still not measured

| Baseline | Status | Blocker |
| --- | --- | --- |
| Packaged-build boot | **not measured** | Only the dev boot exists; the 106 s figure includes Vite and forge. |
| Memory peak attribution | **observed, unexplained** | One sample; needs a second cold boot plus a bisect. |
