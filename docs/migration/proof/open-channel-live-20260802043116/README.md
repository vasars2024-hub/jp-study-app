# Slice 44's open channel, observed against a running sidecar — 2026-08-02

This is the run slice 44 said it could not take. It closes
`open-channel-unmeasured-live`, and **only** that claim.

```
node docs/migration/tools/blanc-player-open-retry-probe.mjs --datadir=<a prepared G-PLAY dir>
```

Verdict `DONE`, exit 0, all six PASS steps. Sidecar pid 13612, port 62824, v3.10.2.
Raw record: `blanc-open-retry.json` (copied verbatim from
`proof/blanc-open-retry-20260802043116/`), sidecar log alongside it.

## What was observed

**Blanc's first open succeeded.** This is the result that matters: the tally before
this slice was 7 of 7 phase-E passes with nothing wired, and Blanc's first open
historically needing a recovery.

```
step 1   videoPresent true, readyState 4, networkState 1, 1920x1080,
         paused false, sliceState "active"
step 3   the clock moves: 3.151 -> 7.159 s of a 30.386 s file, real pixels
step 4   frame 392x221, video 392x189 at y 191, visible
step 5   Blanc's own nav still hit-testable behind the player
```

**The thin margin held.** Slice 44 flagged the risk from
`proof/blanc-open-retry-20260801072500`: the POST answered at 9,177 ms while stage 1
fires at ~10,018 ms, so a slower POST would cost one tick dropped as `busy`, argued
at ~1 s. Here the first POST landed at **9,696 ms** — 519 ms later than the run that
produced the worry, still inside the window — and the open succeeded rather than
being rescued. Observed once, at one point in that distribution.

**The recovery gate behaved as designed.** On the second open (same mounted session,
new requestId):

```
directstreamPosts 1, videoTerminatedFramesSent 1,
firstPostAtMs 48, firstTerminatedAtMs 102, firstWatchAtMs 103,
terminatedInsideTheOpenWindow true, recoveryFired FALSE
```

One POST for one intent, and **the recovery did not fire**. That is rule 3 of the
channel — a recovery is dropped rather than queued — visible in a real run.
`terminatedInsideTheOpenWindow` is still true, which is expected: slice 24 established
that the terminate is the *client's* own lifecycle effect ~190 ms later, not a socket
problem, and this slice changed neither predicate.

## What this run does NOT show — read before citing it

1. **No sidecar has refused a generation.** Patch 0004 is still absent from
   `build-patched-sidecar.mjs`, so the `generation` field this slice sends was
   accepted and ignored by the binary under test. `open-generation-not-in-the-build`
   is untouched by this run.
2. **The first open is not clean.** `traceSummary` records **4 directstream POSTs and
   2 `video-terminated` frames** across the first open (sockets opened 2, closed 1,
   first close at 9,715 ms). The channel serialises opens; it does not make the
   sequence a single POST, and this record should not be read as claiming it does.
   Whether four is the expected count for a StrictMode double-mount plus supersession
   is not answered here.
3. **One run.** The margin above is ~300–800 ms wide. A single pass is evidence that
   it can hold, not that it holds reliably. A phase-E series on a tree with this wired
   is still what would move the 7-of-7 tally.

## Honest note on the previous attempt

An earlier run the same morning
(`proof/blanc-open-retry-20260802012909/`) died at `no library card`: the sidecar
reached `ready` and `addMediaPaths` returned the seeded item, but no `.media-card`
rendered inside the probe's 30 s wait.

The probe now classifies that failure instead of reporting one string for three
unrelated causes — `noItems` (the panel never saw the store write), `allFiltered`
(a kind/folder/search filter excluded the fixture) or `zeroHeight` (the virtualised
grid measured its container at zero, which no longer wait fixes). `.media-card` comes
from `MediaGrid` → `VirtualGrid` in `components/media/MediaContent.tsx`, which is why
the three are worth telling apart.

**That classification did not run, because the stall did not recur.** The failure was
transient. Nothing was changed in the app to fix it, and it would be wrong to read
this pass as a repair — the diagnostic is there for the next time it happens.

## Reproducing

`cue-probe-dual.mkv` is no longer in the tree. The media survives inside earlier
datadirs; this run used:

```
node docs/migration/tools/prepare-gplay-datadir.mjs \
  "%TEMP%/gplay-dd-slice35/cue-library/Sousou no Frieren - 01.mkv" \
  "%TEMP%/gplay-dd-openchannel-b"
```

which prepares cleanly (mediaId 154587, seanime 3.10.2). `prepare-gplay-datadir.mjs`
refuses a destination that already exists — do not pre-create the directory.
