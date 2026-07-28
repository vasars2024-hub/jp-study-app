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

- Applies cleanly to `9bdd052` (`git apply --check`).
- `npx tsc --noEmit` in `seanime-web` exits 0 with the patch applied (upstream's TS 7).
- Purely additive; no upstream line is modified or removed.

### NOT verified — the honest gap

**The runtime proof was not performed.** The acceptance criterion was to log real cue text
plus millisecond timing while playing one real file, and that did not happen this session:
it needs the full video-core player mounted against a `mediastream`/transcode session, which
is Phase-3 surface that Phase 2 deliberately did not adopt (the `media-preview-modal` stub
is precisely what keeps video-core out of the Phase-2 import closure).

Treat the cue semantics as **unproven at runtime**. Specific things to check when Phase 3
mounts the player:

1. `startTime` / `duration` on `MKVParser_SubtitleEvent` are assumed to be **milliseconds**.
   That is inferred from the PGS path, which divides both by `1e3` before handing them to a
   renderer that wants seconds. Confirm it.
2. `timeupdate` fires roughly 4x/second, so a cue boundary can be observed up to ~250 ms
   late. If mining needs frame-accurate boundaries, drive `_updateActiveCues()` from
   `requestVideoFrameCallback` instead.
3. `text` is the raw event text; for ASS tracks it still contains override tags (`{\pos…}`).
   Stripping is left to the consumer, deliberately — the Overlay and upstream's own
   translation feature will want different treatments.
