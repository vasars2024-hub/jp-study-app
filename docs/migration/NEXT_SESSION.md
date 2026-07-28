# Next session handoff

Updated 2026-07-28 with **full Phase 3 active**.

## Where you are

Repo `C:/Users/Arseniy/Projects/jp-study-app` · branch `grammarx/phase-1-5`.

Committed migration line:

- `55df6e9` — Phase 1 and Phase 2;
- `dd2ca47` / `ffc703f` — Phase 3 entry/video-core adoption and record;
- `cfd05fa` / `d96d140` — real subtitle join and opening player seam;
- `a4e495d` — first full-plan continuation slice: core study controls on VideoCore;
- `03d27a3` — editable VideoCore mining preview, screenshot/audio assets, and Anki
  history/undo contract;
- `ea77f59` — secondary-track cue timeline and directstream startup-race fix; live
  dual-track acceptance was negative at that boundary (superseded by `3fe73d0`).
- `3fe73d0` — terminal subtitle-batch fix, verified 6+6 dual cues, shadowing, Whisper
  track generation, and Study OS-owned restart continuity.

The old record called Phase 3 closed after the cue seam. That was too narrow. The
authoritative `SEANIME_MIGRATION_PLAN.md` requires the complete retained control set and
one uninterrupted mine → assets → preview → live Anki → restart run. **G-PLAY is open.**

## Verify before doing anything

```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -6
git -C C:/Users/Arseniy/Projects/seanime-upstream status --short
```

The pinned checkout must remain at `9bdd052` with exactly:

```text
 M seanime-web/public/jassub/jassub-worker.js
 M seanime-web/src/routeTree.gen.ts
?? seanime.exe
```

Never clean the main worktree. It contains extensive unrelated concurrent work. Stage
only explicit migration paths.

## Current VideoCore study contract

- One clock only: `vc_videoElement`.
- Real selected-track timeline: `VideoCoreSubtitleManager.getCues()`.
- Cue identity/provenance: `index`, `trackNumber`, raw `text`, exact `startMs` / `endMs`.
- Delay-aware activation:
  `(video.currentTime - subtitleDelay) * 1000`.
- Display text may strip ASS tags; raw text and demuxer timings must remain intact.
- Real audio/subtitle selection goes through `vc_audioManager` /
  `vc_subtitleManager`.

The seven-hunk upstream patch is regenerated in memory by
`make-jassub-substitution.mjs`; never hand-edit or clean the pinned checkout.

## Implemented and proved

`VideoCoreStudyOverlay` now supplies previous/replay/next line, ±1/30 frame step,
subtitle delay, persisted speed, auto-pause, line loop, A–B loop, subtitle/audio track
selection, Japanese subtitle visibility, click lookup with optional pause, selection/line
translation, furigana, and dictation.

Isolated real-sidecar proof:

```text
provider cc8a86ef-1ed4-4a08-9f07-842fbbaf45df
parser 11,871,913 bytes
2148-5148ms  猫が窓辺で寝ている。
6648-9398ms  今日は本当にいい天気ですね。
```

Observed: real element at 0.75×, +0.1 s subtitle delay, delayed auto-pause, repeated
line loop, A–B transition, three furigana readings, and exact dictation match. The
isolated processes and temp datadir were removed afterward.

## Mining preview now implemented

`VideoCoreMiningPanel` stays on the one VideoCore clock and exposes editable word/sentence
fields, deck selection, screenshot capture, exact cue-range audio capture, Mine card,
duplicate history, and undo. `videoCoreMining.ts` preserves cue → episode → media →
assets → draft provenance and builds the committed `MineNoteRequest`.

The isolated real-sidecar proof captured cue 3:0 (`2148–5148 ms`) into a **113,329-byte
PNG** and **48,843-byte WebM**, retained both after editing the term to `猫`, and restored
the video to paused, 1×, `2.151889s`. No Anki mutation was invoked.

Do not import the currently untracked `StudyOrchestratorWorkspace.tsx` or related
orchestrator contracts into this migration line unless their owning session first commits
them. The local adapter deliberately depends only on committed Anki contracts.

## Remaining Phase 3 work

- shadowing microphone hardware proof and one real local Whisper inference; both paths are
  implemented/build-clean, but neither runtime claim has been promoted without evidence;
- one uninterrupted namespaced G-PLAY using the mounted preview: both real assets,
  live Anki export, duplicate rejection, undo/cleanup, then restart/resume/history proof;
- final visual comparison before retiring the old player.

Dual subtitles are now closed. Patch `0002` flushes the terminal directstream batch before
successful stop/cancellation. The isolated two-track run delivered 6 Japanese + 6 English
cues and simultaneously rendered `猫が窓辺で寝ている。` /
`The cat is sleeping by the window.` at 2148–5148 ms. Use
`docs/migration/tools/build-patched-sidecar.mjs` for a corrected binary; the original
pinned `seanime.exe` still contains the bug.

## Next three safe actions

1. Record one real microphone response and one real local Whisper inference in a safe
   renderer session; keep any negative result.
2. Run the complete namespaced live-Anki G-PLAY plus actual restart-persistence check.
3. Perform the final visual comparison; only then decide whether the old player retires.

## Current verification

| Gate | Result |
|---|---|
| focused mining + study + architecture tests | 21/21 pass |
| full tests | 253 files / 2,903 tests pass |
| TypeScript | accepted 290 diagnostics / 108 files; 0 in slice |
| lint | accepted 164 problems; 0 changed-path mentions |
| renderer build | exit 0; 4,581 modules; Whisper worker emitted |
| CSS containment | 6,912/6,912 scoped; 0 unscoped; 0 shell Tailwind tokens |
| patched sidecar builder | exit 0; Go directstream test pass |

`src/media/seanime-boundary.d.ts` remains hand-maintained. TypeScript does not open the
vendor tree, so production build and live harness are the signature gates.

## Destructive-risk constraints

- Do not launch a second Electron instance; it shares `%APPDATA%/jp-study-app`.
- Anki is live on the real 82-deck collection. Use only the namespaced, self-cleaning
  probe deck for the final gate.
- Do not edit or clean the pinned upstream checkout.
- Never run `git clean -fd`, `git reset --hard`, or broad staging.
