# Patches against the pinned Seanime checkout

These are **not applied** to anything in this repo. They are kept as patch files so the
pinned checkout at `C:/Users/Arseniy/Projects/seanime-upstream` (`9bdd052`) stays pristine
and the changes remain upstream-submittable rather than becoming a fork.

```bash
cd C:/Users/Arseniy/Projects/seanime-upstream
git apply --check ../jp-study-app/patches/seanime/0001-video-core-cuechange.patch   # verify
git apply         ../jp-study-app/patches/seanime/0001-video-core-cuechange.patch   # apply
git checkout -- seanime-web/src/app/\(main\)/_features/video-core/video-core-subtitles.ts  # revert
```

## 0001 — `cuechange` / active-cue signal for `VideoCoreSubtitleManager`

Closes the one gap Phase 1's Probe A found. Everything else the Study Overlay needs
(`currentTimeMs`, seek, play/pause, screenshot, track list, subtitle delay, raw cue data)
was already reachable from outside the component; there was no `activeCue` and no
`cuechange`.

**Shape:** 94 insertions, **0 deletions** — purely additive.

| Added | Where |
|---|---|
| `VideoCoreActiveCue`, `SubtitleManagerCueChangeEvent` | beside the existing event type aliases |
| `"cuechange"` | one entry in the existing `VideoCoreSubtitleManagerEventMap` |
| `getActiveCues()` | public read of the current on-screen cues |
| `_rebuildCueIndex`, `_updateActiveCues`, `_dispatchCueChange` | private |
| `timeupdate` / `seeked` listeners | bound in the constructor, removed in `destroy()` |

### One deliberate deviation from the original plan

The Phase-1 note proposed dispatching from `onSubtitleEvents()` / `_recordSubtitleEvent()`,
"both of which already run per cue". They do — but they run at **demux** time, which is ahead
of playback. Dispatching there answers "a cue was parsed", not "a cue is on screen", so the
Overlay would receive cues seconds before the viewer sees them and would mine the wrong line.

So the signal is driven by the video element's `timeupdate` (plus `seeked`, so scrubbing
re-emits immediately) and reads the cue cache those two methods already populate. The cache
stays the source of truth; only the activation clock is new. This is still a small, scoped,
upstream-friendly change and does not restructure the player.

### Verified

- Applies cleanly to `9bdd052` (`git apply --check`), re-confirmed 2026-07-28: applied,
  content checked, then reverted — the pinned checkout ends pristine (`9bdd052`, three
  pre-existing dirty entries).
- `npx tsc --noEmit` in `seanime-web` exits 0 with the patch applied (upstream's TS 7).
- Purely additive; no upstream line is modified or removed.

### The three open questions — ANSWERED (Phase 3, 2026-07-28)

#### 1. Units: **MILLISECONDS.** The patch is correct; upstream's own docs are wrong.

Settled from the producing source, which is stronger than the PGS inference:

```go
// internal/mkvparser/mkvparser.go:616-617
milliseconds := float64(packet.StartTime) / 1e6 // Convert nanoseconds to milliseconds
duration     := float64(packet.EndTime-packet.StartTime) / 1e6
// :656  StartTime: milliseconds
// :657  Duration:  duration
```

Matroska packet times are nanoseconds, so `/1e6` is milliseconds. Corroborated by
`seekTargetTimeMs float64` (`:650`) and by `subtitle_test.go:12`, which builds
`SubtitleEvent{StartTime: 1000, Duration: 2000}` and compares it against a seek target of
`4000`.

> **Upstream documentation bug.** The struct comment (`mkvparser.go:36-37`) and the
> generated `types.ts` (`MKVParser_SubtitleEvent`) both say *"Start time in seconds"* /
> *"Duration in seconds"*. **Both are wrong.** A reader who trusts the generated types will
> divide by 1000 and mis-time every cue by three orders of magnitude. Worth an upstream PR
> alongside this patch.

So `startMs = e.startTime` and `endMs = e.startTime + e.duration` need **no** conversion.

#### 2. `timeupdate` precision: **~3.8 Hz, cue boundaries up to ~216 ms late.** Good enough — with one rule.

Measured in a real Chromium renderer against a real h264/aac clip, running this patch's
`_updateActiveCues` + `activeCueKey` dedup logic verbatim over cues parsed from a real ASS
file (115 `timeupdate` samples over 30 s):

| Metric | Value |
|---|---|
| mean gap between `timeupdate` | **262.6 ms** (3.81 Hz) |
| median / p95 / max gap | 263.8 / 280.1 / **290.7 ms** |
| cue activations fired | 6 / 6 |
| activation latency | 76, 96, 120, 160, 216, 120 ms — mean **131 ms**, max **216 ms** |

The README's original "~250 ms late" estimate is confirmed empirically.

**The rule that makes this a non-issue, and it is the important architectural point:**
the activation clock decides only *when you are told* a cue is on screen. The cue's own
`startMs`/`endMs` come from the demuxer and are **exact**. So the Study Overlay must take
timings from `cue.startMs`/`cue.endMs` — never from `video.currentTime` at the moment
`cuechange` fires. With that rule:

- mining, provenance, screenshots and audio clips are frame-exact (they use cue timings);
- only *UI responsiveness* carries the ≤216 ms lag, against cue durations of 2.75–3.5 s
  (<8 % of a cue).

`requestVideoFrameCallback` is therefore **not** required. Revisit only if a control needs
sub-frame boundary *reaction* (e.g. a hard A–B loop that must cut exactly at the boundary
rather than seeking to a known `endMs`).

#### 3. ASS override tags: **present in `text`, stripping stays with the consumer.**

Confirmed against the real ASS: 3 of 6 cues carry override tags — `{\pos(960,900)}`,
`{\i1}…{\i0}`, `{\an8}…{\b1}…{\b0}`. The patch deliberately passes `text` through raw.
Stripping belongs in the **Study Overlay**, not in the patch and not in the manager:

- the manager is upstream code and must stay generic (upstream's own translation feature
  wants a different treatment);
- mining wants the plain sentence, but the *card* may want inline emphasis preserved;
- a lossy strip inside video-core would be unrecoverable downstream.

Suggested Overlay-side treatment: drop `{\...}` blocks, convert `\N`/`\n` to spaces, then
collapse whitespace — applied at the mining boundary, keeping the raw text in provenance.

### End-to-end verification — CLOSED (Phase 3, commit `cfd05fa`)

The two halves are now joined in a real in-app Chromium renderer:

1. the adopted `WebsocketProvider` connected with a server-issued client identity;
2. a real matched MKV was started through `directstream/play/localfile`;
3. the parser stream was consumed in full (**11,871,913 bytes**);
4. real `subtitle-event` frames on `WSEvents.NATIVE_PLAYER` reached the mounted adopted
   `VideoCoreSubtitleManager`;
5. the manager emitted real `cuechange` events while the full adopted `VideoCore` played;
6. the sibling Study Overlay read exact `cue.startMs` / `cue.endMs`, never
   `video.currentTime`.

Observed manager output:

```text
[cue-proof] cuechange 2148-5148ms "猫が窓辺で寝ている。"
[cue-proof] cuechange 6648-9398ms "今日は本当にいい天気ですね。"
```

The sidecar independently logged track 3 as `S_TEXT/ASS`, with parser events
`startTime=2148 duration=3000` and `startTime=6648 duration=2750`. This closes the patch's
runtime acceptance without a synthetic cue or mocked manager.

### Driving directstream from the adopted browser client

The four earlier preconditions still apply: scan a registered file, ensure it is matched,
seed its media into the simulated collection, and consume the parser stream. Two additional
transport facts close the earlier addressing dead end:

- directstream lifecycle and subtitle messages use **`WSEvents.NATIVE_PLAYER`**, not
  `WSEvents.VIDEOCORE`;
- the REST request that starts targeted playback must carry the adopted identity contract:
  `X-Seanime-Client-Id`, `X-Seanime-Client-Id-Proof`, and
  `X-Seanime-Client-Platform`, in addition to `X-Seanime-Token`.

Putting `clientId` only in the JSON body is insufficient even when the websocket identity
was accepted. The server can log a targeted send while the browser receives nothing. The
durable reproducer is `docs/migration/tools/cue-manager-harness.mjs`; it uses an isolated
temporary datadir and copied one-file library and never starts a second Electron instance.

## 0002 — flush the terminal directstream subtitle batch before cancellation

Closes the parser-feed loss found by the real two-track Phase 3 fixture. The renderer and
websocket transport were healthy: Seanime discovered both ASS tracks, but the sidecar sent
only the first immediately flushed event. At end-of-file, `subtitleStream.Stop(true)`
cancelled the stream context before `flushBatch(false)` tried to send the remaining events.
`sendSubtitleEvents` correctly rejects a cancelled context, so the final batch was lost.

The patch preserves the existing error path and changes successful completion ordering to:

```text
flush terminal subtitle events -> stop/cancel the completed stream
```

It also adds an upstream Go regression that asserts `flush` precedes `stop`. Verification:

- `git apply --check` against pinned commit `9bdd052` — pass;
- `go test ./internal/directstream` with the patch overlaid — pass;
- isolated patched-sidecar run — both six-cue ASS tracks delivered (**6 Japanese + 6
  English**);
- simultaneous manager output at `2148–5148 ms`:
  `猫が窓辺で寝ている。` and `The cat is sleeping by the window.`;
- disabling dual subtitles left the Japanese primary cue intact; enabling it restored the
  English cue on the same VideoCore clock.

Build the corrected sidecar without modifying the pinned checkout:

```powershell
node docs/migration/tools/build-patched-sidecar.mjs `
  "$env:TEMP\seanime-phase3.exe"
$env:SEANIME_EXE = "$env:TEMP\seanime-phase3.exe"
```

The builder takes tracked source from `git archive` at the exact pin, copies only the
already-generated `web/` embed input, applies the patch in a disposable directory, runs the
upstream regression, and then builds with `-tags=nosystray`. Its temporary source directory
is always removed.
