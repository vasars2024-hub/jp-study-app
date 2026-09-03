# L0 perf baseline — PLAYER FRAME STABILITY

Milestone `L0-baseline-1`, player leg, **2026-09-03**. This is the sixth and last of the six
numbers L0's `Record performance baselines` bullet names. The other five were taken on
2026-08-16 in `PERF_BASELINE_RESTART.md`; this one was recorded open in two places
(`PERF_BASELINE.md` "Gaps" table, `VIDEO_BASELINE.md` "Still open for §10.1") for the same
reason both times — **it needs a real clip and none had ever been loaded**. No number in either
of those files is modified by this pass; both now point here.

## Instrument

`tools/liquid-interaction-probe.ps1 -Interaction playback`, driven by
`cat7-perf.cjs --surface player --playback`. RULE 1: no new probe — the `playback` interaction
is ~60 lines added to the existing instrument and the mode reuses the runner's refusals, bridge
client, retry policy and, critically, its ceiling legs.

**Why two ledgers.** The rAF recorder every other leg here uses reports the RENDERER's frame
cadence, and on a video surface that is the compositor. A dropped video frame simply repaints
the previous picture, **on time** — so a decoder losing every second frame produces the same
clean rAF distribution as a healthy one. `getVideoPlaybackQuality()` is the decoder's own
ledger and is what "player frame stability" actually names. Both are recorded; the decoder
ledger is what can fail this leg on its own.

**The scored leg drives nothing.** It observes a clip the app is already playing, so there is
no restore step and no state to strand. It refuses on absent / unstarted / paused / stalled
players rather than scoring a still picture as perfectly stable.

## Scene

Fresh-profile instance (`JP_USER_DATA_DIR=~\.claude-runs\jp-fresh-p2`, `JP_DEBUG_PORT=39281`),
pid 41752, main uptime **343 s / 438 s / 557 s** at the three runs' starts — past the 120 s settle the
rubric requires. Desk: 1 `.fwin` ("Video", 320 elements), 686 document elements, viewport
1264x821, dpr 1. Clip: JoJo no Kimyou na Bouken — Ougon no Kaze **39-END RAW**, served over the
sidecar's directstream at `127.0.0.1:53344/api/v1/directstream/stream`, intrinsic **1280x720**,
painted at **1264x821**, `playbackRate` 1, duration 1420 s, sampled from ~155 s, ~290 s and
~406 s in — three different points of the same clip, not the same seconds three times.

## The numbers — three runs, six scored readings, all clean

| | r1 (05:37) | r1 rpt | r2 (05:39) | r2 rpt | r3 (05:41) | r3 rpt |
| --- | --- | --- | --- | --- | --- | --- |
| span | 1302 ms | 1302 | 1308 | 1308 | 1315 | 1313 |
| `currentTime` advanced | 1.303 s | 1.302 | 1.312 | 1.314 | 1.319 | 1.313 |
| decoded frames | 31 | 32 | 31 | 32 | 32 | 31 |
| **dropped frames** | **0** | **0** | **0** | **0** | **0** | **0** |
| **corrupted frames** | **0** | **0** | **0** | **0** | **0** | **0** |
| decoded fps | 23.8 | 24.6 | 23.7 | 24.5 | 24.3 | 23.6 |
| drop rate | **0.00 %** | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| renderer p50 / p95 | 16.7 / 16.9 | 16.7 / 16.8 | 16.7 / 16.8 | 16.7 / 17.0 | 16.7 / 16.9 | 16.7 / 16.8 |
| renderer frames > 100 ms | 0 | 0 | 0 | 0 | 0 | 0 |
| main longest block | 34.6 ms | — | 9.2 ms | — | — | — |

Session ceiling, three readings each run: **p50 16.7 / p95 16.8 ms** in all three, noise floor
0 frames over 100 ms, worst ceiling frame 19.7 ms. **The player costs the renderer nothing measurable**: its
p50 is the ceiling's p50 to the decimal. Bar for the decoder half: **1.0 % dropped**, stated in
the runner as `DROP_BAR_PCT` so the next worker moves it deliberately rather than by feel.
Corrupted frames get no allowance — one is a decode error, not a scheduling loss.

24 fps decoded against a 60 Hz compositor is the clip's own frame rate, not a shortfall.

Main RSS across a run: 135.7 → 135.8 MB (r1), 106.4 → 100.4 MB (r2), 69.7 → 70.7 MB (r3). It
falls run over run because the process was still shedding boot allocations, not because
playback frees anything — do not read a trend into three points taken 2 minutes apart.

**Score: PASS 10/10, three times. 0 findings, 0 voids, in every run.**

## The two controls, both measured

1. **NEGATIVE CONTROL — the instrument must refuse a paused player.** This is the failure the
   leg exists to avoid: a paused `<video>` decodes nothing and drops nothing, and would report
   a flawless 0.00 %. The runner pauses the clip (`paused at 199.18 s` / `290.62 s` /
   `406.50 s`) and requires the instrument to **refuse**. It did, all three times —
   `REFUSE: the largest <video> (1264x821) is paused: a still frame decodes nothing and drops
   nothing, which would score as perfect`, the banked copy truncated at the PowerShell error
   formatter's line wrap — and `scoredAnyway` is `null` in every record. Had it scored, the run
   voids every number above.
   The clip was put back and the restore verified, not assumed: `{"paused":false,"at":199.9}`,
   `{"paused":false,"at":291.35}`, `{"paused":false,"at":407.21}`. The renderer also arms its own 20 s watchdog **before**
   pausing, so a run that dies mid-control cannot leave the user's clip stopped —
   `refusing-leg-strands-app-state` is banked in this repo.
2. **SENSITIVITY CONTROL — `-Jank`.** 120 ms renderer blocks must visibly worsen the rAF
   distribution: **p95 16.9 → 100.4 ms** (r1), **16.8 → 117.0 ms** (r2), **16.9 → 100.3 ms**
   (r3), frames over 100 ms **0 → 10** in all three, against 10 injected blocks each time.

   And this control produced the run's one genuinely useful side finding: **the decoder ledger
   under `-Jank` was indistinguishable from the clean run — r3's jank leg decoded 31 frames and
   dropped 0, against 32/0 clean.** Video decode on
   this platform does not run on the renderer's main thread, so a blocked renderer does not
   drop video frames. That is exactly why the rAF half alone could never have answered this
   bullet, and it is the measured version of the claim, not the assumed one.

## What this leg does NOT cover, stated rather than implied

- **One clip, one container, one codec.** 1280x720 H.264-in-MKV over the local directstream.
  A 4K source, a VP9/AV1 stream, or a remote URL are different decoders and are not measured.
- **A quiet machine.** No concurrent scroll, search or download was running. `--under-load` has
  no playback arm; adding one is the natural next slice if L11 bullet 3 wants it.
- **1.3 s per reading.** Long-run decoder drift (thermal, buffer starvation over 20 minutes) is
  not what this samples.
- **`data-media-surface="workspace"` only.** The detached study block is a second surface that
  carries no `<video>` of its own (`DetachedStudyBlock.tsx:12`), so there is nothing to measure
  there; that is a fact about the product, not a gap in the instrument.

## Traps banked while taking it

- **A raw ESC byte landed in the probe source** from an edit that never contained one, turning
  `/\[[0-9;]*m/g` into `/<ESC>\[[0-9;]*m/g` — which then silently matched nothing because the
  preceding `.split(String.fromCharCode(27))` had already removed every ESC. `write-tool-emits-raw-nul`
  again; only PowerShell's `[System.IO.File]::ReadAllText`/`WriteAllText` repaired it.
- **The first reading banked 90 characters of live bearer token.** The directstream URL carries
  a JWT in its query string and the record took `.slice(-90)` of the href. It now banks origin,
  pathname and the opaque media id only. Check this on any future leg that records a `src`.
- **A gesture that REFUSED still printed a full, clean-looking frame distribution.** The
  instrument set `refuse` inside `__lip` and left the caller to notice; the numbers were real
  frames of an idle window and nothing in the record said the gesture was not among them. The
  probe now refuses at line 610 for every interaction, which is what makes the negative control
  above able to fail at all.
- **This file is CRLF.** Multi-line `Edit` anchors do not match; use single-line ones.
