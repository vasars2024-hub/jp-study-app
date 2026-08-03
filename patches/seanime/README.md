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

**Shape:** 127 insertions, **0 deletions** — purely additive.
(Corrected slice 59 — this line said "94 insertions" until 2026-08-02; counted from the patch body.)

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

## 0003 — VideoCore never re-claims `vc_activePlayerId`, and never announces a stream it was mounted with

Two independent upstream defects in the web `video-core`. Together they make every
subtitle stream fail silently for any host that mounts `<VideoCore>` only while a stream is
active, which is what Study OS's Phase-3 seam did. **Shape:** 30 insertions, 1 deletion.

### 3a — the "Override active player" effect is a no-op

`video-core.tsx` §1016-1021:

```ts
// Override active player, won't apply to native-player
React.useEffect(() => {
    if (state.playbackInfo?.id && activePlayer === props.id) {
        setActivePlayer(props.id)      // only ever runs when it is ALREADY props.id
    }
}, [state.playbackInfo?.id, activePlayer])
```

The comment says *override*; the guard makes it a self-assignment that can never restore a
nulled value. The only other writer is `VideoCoreProvider`'s mount-only `[]` layout effect
(§203-212), which **nulls** the atom on unmount, and `useUnmount` (§837-842) nulls it on
every terminate. So once the player unmounts, `vc_activePlayerId` is stuck `null` forever,
`isActivePlayer` is permanently false, and the entire DOM-listener block in
`video-core-events.ts` §253-313 (`play`/`pause`/`loadedmetadata`/`ended`/`seeked`) never
attaches. Imperative dispatches (`video-loaded`, `video-can-play`, `video-terminated`)
still fire, so the player *looks* healthy.

Fixed by inverting the guard to `activePlayer !== props.id` and excluding `native-player`
explicitly (which the original comment already intended but never implemented).

### 3b — a stream present at mount is never announced

`video-core.tsx` §954 is a `useUpdateEffect`, so it is **skipped on mount**. It is the only
caller of `dispatchVideoLoadedEvent()`. A player mounted with `state.playbackInfo` already
set therefore never sends `video-loaded` — and `video-loaded` is what establishes the
server's playback state (`internal/videocore/videocore.go` §897-907). Without it,
`videocore.go` §916-922 **drops every `video-loaded-metadata`**
(`ps, ok := vc.GetPlaybackState(); if !ok { continue }`), so
`internal/directstream/stream.go` §518-529 never reaches `StartSubtitleStream`. The
observable symptom is `Populating 0 events for track N` with the sidecar logging only
`mkvparser > Metadata parsing complete`.

Fixed in `video-core-events.ts` with a mount-case dispatch that also waits for `clientId`
(which `dispatchVideoLoadedEvent` requires and which is not guaranteed at mount), deduped
through `announcedPlaybackRef` so it never doubles the lifecycle effect's dispatch. The ref
is cleared in `dispatchTerminatedEvent`, because terminating clears the server's playback
state and the same id must then be re-announced.

### Verified — live, against the real sidecar

- `git apply --check` against pinned `9bdd052` — **pass**; pinned checkout left pristine.
- Live G-PLAY run (`docs/migration/proof/gplay-20260728/`): sidecar log goes from
  metadata-parsing-only to

  ```text
  directstream > Video loaded metadata
  directstream > Starting new subtitle stream offset=0
  mkvparser    > Subtitle event codecId=S_TEXT/ASS duration=3000 startTime=2000 trackNum=4
  directstream > First subtitle event sent offset=0
  directstream > Player seeked currentTime=0
  ```

  Both `Video loaded metadata` (§519) and `Player seeked` (§551) — the two lines that had
  never once appeared — now log.
- 12 real `MKVParser_SubtitleEvent`s delivered, 11 `cuechange` activations, both tracks,
  `readyState 4`, `duration 30.386`.

### Note for whoever submits this upstream

Upstream itself never hits either defect, because its own host
(`native-player.tsx` §340-348) mounts `<VideoCore>` unconditionally and lets `state.active`
flow as a prop. Both are latent bugs that only surface for a conditionally-mounted player —
which is also why the Study OS seam was corrected to match upstream's mounting shape
(`src/media/StudyPlayerSlice.tsx`). The patch is still worth submitting: the §1016-1021
guard is unambiguously not what its comment says.

## 0004 — a client-supplied generation the server can refuse, so a stale open cannot cancel a live one

**Shape:** 116 insertions, **0 deletions** — purely additive, and inert for every client that
does not opt in.
(Corrected slice 59 — this line said "121 insertions" until 2026-08-02; counted from the patch body.)

### The defect, measured over five slices

`POST /api/v1/directstream/play/localfile` calls `BeginOpen`, which replaces the current
stream and — through `beginSubtitleSeek` — **stops every active subtitle stream**. A client
that issues a recovery request for one open, then starts a newer one, cannot recall the first:
`fetch`'s `AbortController` abandons the *response*, never the work. `PlayLocalFile` runs to
completion regardless, so a request the user has already moved past can land inside the open
they are actually watching and strip its cues.

Study OS measured this twice, from opposite ends: two independently designed client-side
recovery stages were wired and each cost a run its subtitles
(`docs/migration/proof/retirement-step3-20260801094543`), against a 7-of-7 pass rate with
nothing wired. Its own conclusion was that the fire condition was right and the **transport**
was the problem, and that the fix has exactly two shapes — *a generation the server can
reject*, or *a client rule that never issues while a newer open is outstanding*. The second is
in `src/shared/directstreamOpenChannel.ts` and closes everything except the abandoned-fetch
case. **This patch is the first, and it is the half a client cannot do.**

### The rule

`Manager.AcceptOpenGeneration(clientId, generation)`, consulted **before** `BeginOpen` —
after it, the damage is already done.

| generation | verdict |
|---|---|
| `0`, negative, or no client id | **accepted**, and recorded nothing. Every existing client is unaffected |
| newer than the last accepted for that client | **accepted**, and becomes the bar |
| **equal** to it | **accepted** — a re-open of the same request is the legitimate recovery this protects, not a stale one |
| strictly older | **refused**, with an error, before `BeginOpen` runs |

Clients are ordered independently, and a refusal does not move the bar.

### Verification

`internal/directstream/open_generation_test.go` (new, 5 subtests) covers each row plus
per-client isolation. Verified against a fresh clone of the pin: `git apply --check` clean,
`go vet` clean, `go build ./internal/directstream ./internal/handlers` clean, the new tests
pass, and the **whole `internal/directstream` package's existing tests still pass**. Evidence:
`docs/migration/proof/open-generation-patch-20260801232841/`.

### Note for whoever submits this upstream, and for whoever wires it here

~~Nothing sends `generation` yet — not Study OS, not upstream — so applying this patch changes
no observable behaviour. That is deliberate: the server half can land and be verified on its
own, and the client half (`generation: requestId` in the open body, plus the same value on
every recovery for that request) is a separate, live-measured step. It is **not** in
`build-patched-sidecar.mjs`'s patch list for the same reason.~~

**Superseded 2026-08-02.** Study OS sends `generation` (slice 44, `StudyPlayerSlice.tsx`) —
though *not* `requestId`, which slice 44 found is not an order at all and would have been
refused permanently; it is a counter the open channel keeps. 0004 **is** in
`build-patched-sidecar.mjs`'s patch list (slice 43).

Slice 46 then ran the patch **over the wire**: seven POSTs at a binary built with it, and the
identical seven at one built without it as the control. Only the two steps the patch is about
differ. Evidence `docs/migration/proof/open-generation-wire-20260802075705/`, reproduce with
`node docs/migration/tools/open-generation-wire-gate.mjs`. Two things whoever submits this
should know from that run:

- **A refusal is indistinguishable from any other open failure over HTTP.** `PlayLocalFile`
  returns before `BeginOpen`, so nothing is logged, and echo's default error handler
  (`e.Debug = false`) answers a byte-identical `500 {"message":"Internal Server Error"}` either
  way. A client that wants to treat a benign refusal differently from a real failure has
  nothing to key on. A distinguishable status or error body would be worth adding before
  submission.
- **The binary the app launches is still unpatched** — see the `patched-sidecar-not-deployed`
  row in `docs/migration/tools/audit-carried-items.mjs`.

Upstream's own web client would benefit identically: its `video-terminated` → cancel path has
the same shape, and any client that retries an open has the same un-recallable request.

### Two things slice 59 found that a submitter must say out loud

**1. Upstream already has a `generation`, and it is NOT this one.** `internal/directstream` at the
pin carries `BaseStream.subtitleGeneration atomic.Int64` (`stream.go:616`) plus
`TestBeginSubtitleSeekCancelsPreviousGeneration`, `TestStartSubtitleStreamPRejectsStaleGeneration`
and `TestSendSubtitleEventsRejectsStaleGeneration`. It looks like this patch and is not — it is
**per-`BaseStream`**, so it cannot order events across the stream replacement that `BeginOpen`
performs, and `beginSubtitleSeek` stops every active subtitle stream **unconditionally**, with no
generation check guarding the stop. Upstream's counter orders subtitle work *after* the
destructive step; 0004 refuses the request *before* it. Complementary, not redundant — but a
reviewer (or a future re-syncer deciding whether 0004 can be retired) will conflate them unless
told. **Do not retire 0004 on the strength of `subtitleGeneration`.**

**2. The guard covers one of six entry points.** `AcceptOpenGeneration` is consulted only in
`HandleDirectstreamPlayLocalFile`, but six call sites reach `BeginOpen` →
`beginSubtitleSeek` at the pin:

```
internal/directstream/localfile.go:296   PlayLocalFile     <- guarded
internal/directstream/nakama.go:55                         <- unguarded
internal/directstream/urlstream.go:50                      <- unguarded
internal/debrid/client/stream.go:120                       <- unguarded
internal/torrentstream/stream.go:152                       <- unguarded
internal/directstream/stream.go:210      PrepareNewStream  <- unguarded
```

Sufficient for Study OS, which only drives `play/localfile`. For upstream the durable shape is to
move the check inside `BeginOpenWithTarget` — the single choke point, and currently called from
exactly one place (`BeginOpen`).

## Re-sync durability — measured, slice 59 (2026-08-02)

Full method and evidence: `docs/migration/SLICE_59_UPSTREAM_REHEARSAL.md`.

All four patches were replayed across ten real upstream trees spanning 2026-06-16 → the pin.

| patch | survives back to | breaks on | rework |
|---|---|---|---|
| 0001 | `8b5c6bb^` (06-16) — every rung tested | — | none |
| 0002 | `8b5c6bb^` (06-16) — every rung tested | — | none |
| 0003 | `8b5c6bb^` (06-16) — every rung tested | — | none |
| 0004 | `ae92bc8^` (06-22) | `8b5c6bb` *feat: mpv-prism*, which split `BeginOpen` into a delegator + `BeginOpenWithTarget`; 0004's `stream.go` hunk #1 uses the post-split body as trailing context | re-anchor one hunk; the hunk is purely additive, so no design decision |

Two maintenance notes from the same run:

- **`0001`'s hunk headers are internally inconsistent.** Hunks 2–5 declare new-side start lines one
  lower than they should be, so `git apply` reports `offset 1 line` even against a pristine
  `9bdd052`. It applies (git matches on old-side context), but the permanent 1-line noise **masks
  genuine drift**. Regenerate it with `git diff` instead of hand-editing.
- **The pinned checkout cannot answer history questions.** `C:/Users/Arseniy/Projects/seanime-upstream`
  is a **depth-1 shallow clone with zero refs** — no `git log`, no blame, no `origin/main`. Any real
  re-sync must fetch history first, or work in a separate clone.
