# Patch 0002, measured in the app, against the binary the product launches — slice 47

```
node docs/migration/tools/subtitle-tail-gate.mjs      # needs Vite on 5173; ~7 minutes
```

`subtitle-tail.json` is the verdict. The two probe records it summarises are
`../blanc-open-retry-20260802slice47gate-control/` and `…-subject/`.

## The result

| | control | subject |
|---|---|---|
| binary | `seanime.exe.pre-patches-20260727` | `seanime.exe` (deployed) |
| sha256 | `62d6af1b…` | `70ecf65d…` |
| carries `0002` | no | yes |
| **latest cue the client received** | **6,500 ms** | **24,148 ms** |
| cues received over the run | 5 | 14 |
| last line seen | `The weather is really nice today.` | `明日の朝、一緒に朝ご飯を食べましょう。` |

Same fixture (30.386 s, two subtitle tracks), same app build, same probe, a freshly prepared
datadir each. The subject run is the app resolving its own sidecar with nothing overridden;
only the control names a binary.

## What it means

Patch `0002` reorders the terminal branch of `startSubtitleStreamP`. Upstream calls
`subtitleStream.Stop(true)` and *then* `flushBatch(false)`; `Stop` runs `cleanupFunc`, which
is `subtitleCtxCancel` (`subtitles.go:424`), and `sendSubtitleEvents` returns `false` on its
first line once that context is cancelled (`subtitles.go:151`). The final batch is assembled
and dropped. For a local file at offset 0 the flush interval is 300 ms and the batch cap is
50, and this fixture's whole track parses in well under one tick — so "the final batch" is
most of the file.

**On the binary this app launched until 2026-08-02 07:51, subtitles stopped at 6.5 s of a
30.4 s file.** Not late, not garbled — absent, with no error anywhere. Phase 3 recorded
terminal cue delivery as closed; it was closed against a purpose-built exe passed through
`SEANIME_EXE`, which nothing sets in normal operation.

## Four things this does NOT show

1. **It is not a full-length playback.** The probe plays ~7 s and the parser races ahead of
   it; what is measured is which cues were *delivered*, not which were *displayed*. A user
   watching to 24 s on the old binary would have seen nothing after 6.5 s, but that last step
   is inference from delivery, not an observation of the screen.
2. **The counts are not a stable quantity — only the latest cue is.** The patch changes one
   of the goroutine's three exits. `ctx.Done()` drops the batch in both builds; both channels
   closing flushes in both. Which of the probe's two opens reaches the terminal branch moves
   between runs: the subject's two manual runs split 2/12 and 11/3 across the steps. Read
   `subtitlesRun.maxStartTimeMs`, never a per-step count.
3. **One fixture, one container.** S_TEXT/ASS in MKV, two tracks, 12 cues. Nothing here says
   what a 24-minute episode with 400 cues does, where several ticker flushes land before the
   terminal one and the dropped tail is proportionally much smaller.
4. **It says nothing about `0004`.** No generation was refused in any of these runs, and the
   client is not expected to produce one — see the open item in `NEXT_SESSION.md`.

## Stability

Three subject runs and three control runs, in both orders (manual pairs
`blanc-open-retry-20260802slice47-{subject,control}` and `…-{subject2,control2}`, plus this
gate). Every subject run: 24,148 ms. Every control run: 6,500 ms. Step 1 measured 2 cues on
both binaries in five of the six runs — the two agree exactly where the patch cannot apply,
which is the internal control for the comparison.

## A tool bug this gate hit on its first run, worth not repeating

The gate's first run reported `n/a` for both sides while the probes it had just run were
plainly measuring 6,500 against 24,148. Two causes, both now fixed:

- The probe takes its stamp from `process.env.RUN_STAMP`, which the child **inherits** — so
  both runs wrote into one proof directory and the second overwrote the first. It is now set
  per child.
- The gate then read `blanc-open-retry-<stamp>-control`, which happened to exist from an
  earlier manual run, and reported a record written **before the field existed**. The gate now
  refuses to read a proof directory it did not just create.

The mixed directory that run produced — a control's sidecar log beside a subject's JSON — was
deleted rather than kept, being an artifact of the bug and not a measurement.
