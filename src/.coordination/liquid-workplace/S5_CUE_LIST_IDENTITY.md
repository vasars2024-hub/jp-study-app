# DEFECT S5 — the fix, and the live leg that is still owed

2026-09-03, backup, main tree, branch `feat/nyaa-subtitles`. Commit **`6d9f0aef`**.

Written here rather than in `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` or
`PERF_BASELINE_RESTART.md` on purpose: both are among the five files the `wt/files-app`
forward merge currently conflicts in, so S5's tag in the plan is left **open** and untouched.

## Mechanism — found by reading, not by inferring from list size

The handoff's standing diagnosis was "3,031 nodes, no virtualisation". That is a symptom, not
the cause: 3,031 memoized rows do not cost ten seconds. Two files answer it exactly.

`VideoCoreSubtitleManager.getCues()` returns a freshly built array of freshly built objects on
every call, and `VideoCoreStudyOverlay`'s `cuechange` handler called it **once per spoken
line** (`VideoCoreStudyOverlay.tsx`, `handleCueChange`). So `allCues` changed identity several
times a minute while describing an unchanged timeline. Two consumers are keyed on that:

1. `VideoCoreTranscriptPanel`'s `rows` is `useMemo(..., [cues])`, and the chunked IPADIC pass
   depends on `rows`. Every cue boundary therefore ran `setTokenRows({})` and restarted the
   pass at row 0 — a `setTimeout(…, 0)` chain 75 links long on a 3,000-cue track, each link
   tokenizing 40 lines and spreading a growing object. It re-armed before it could finish.
   **That is why a `setTimeout` recorder is what caught this: it starves its own queue.**
2. `TranscriptRow` is `React.memo`'d and compares `cue` by identity. New objects meant the
   shallow compare failed on *every* row, so each boundary re-rendered all ~3,000 rows and
   recomputed `readingLine(tokens)` over each — when two rows had changed.

The fix is upstream of both: `sameVideoCoreCueList` / `stableCueList`
(`src/shared/videoCoreStudy.ts`), and every whole-track read in the overlay routed through it.
All five fields are compared rather than length-and-endpoints, because the same setter also
carries a genuine **track swap** — two languages for one release share cue count and near
timings, and a guard that missed it would strand the transcript on the previous language.

## What is proven, and what is not

PROVEN: `src/media/__tests__/cueListIdentityStability.test.ts`, 15 cases. The negative control
is a leg of the suite — the unguarded loop replaces the array on **700 of 700** boundaries and
holds **0 of 700** row memos, against **0** and **700** guarded. Mutation control MEASURED:
unwrap the `cuechange` call site → **2 failed**, restored byte-identical (sha256
`4203459d96a5b2bf…`). Neighbouring suites 13 files / 194 tests passed; eslint 0.

**NOT PROVEN — S5 STAYS OPEN.** The bullet's own gate is live: the 11,769 ms inter-tick gap
falling to the ~1,014 ms floor with the transcript block open. I could not run it, and the
reason is measured rather than assumed: **no subtitle track reached the study layer in a fresh
session for either candidate file.** Date a Live II OVA — player mounts, `readyState` 4,
playing, `.study-cue-overlay` present, but 0 transcript rows, no cue text, and **no subtitle
track select exists at all** (7 selects enumerated with every `<details>` forced open: Whisper
model, existing-subs, audio, workspace mode, card kind, and two torrent-settings selects).
JoJo Ougon no Kaze 39-END — the file on disk is the **`.mp4` RAW**, not the `.mkv` the resume
list records, and it sat on `Waiting for subtitle` for 48 s of playback. So the subject, not
the instrument, is what is missing.

**The next turn opens on this and it is cheap**, because primary2 banked the recipe: mux a
sidecar in with ffmpeg into `C:\Users\Arseniy\Downloads\jp-study\`, `POST
/api/v1/library/scan`, then `POST /api/v1/library/unknown-media {"mediaIds":[N]}` — skip that
seed and the open refuses with "media not found in anime collection". Then arm a 20 s / 1 s
`setTimeout` recorder over two arms on the SAME build: transcript block open vs closed, one
clip playing. A within-build differential is the right gate here; comparing against backup's
2026-09-03 numbers would compare two builds of different ages.

## Traps this turn paid for

- The user's app (pid 47004, 30 h old) **exited during the probe**, at 14:05 EDT, right after
  the HMR reloads my commit caused and one `seanime:media-workspace-open`. I cannot attribute
  it — the `/eval` before it timed out at 30 s, which is itself an S5 symptom. I restarted the
  dev app; the replacement is pid 43436, port 39273. Say this plainly rather than rounding it
  to "the app was restarted".
- `transcriptPanel` is **false** in this profile, and there is no Transcript checkbox in the
  study bar — it lives in the layout customizer's Study category, and it persists.
- PowerShell variables are case-insensitive: `$h` and `$H` are one variable, and a health
  response silently overwrote a headers hashtable mid-script.
