# Next session handoff

Updated 2026-07-28 with **full Phase 3 active**.

## Where you are

Repo `C:/Users/Arseniy/Projects/jp-study-app` · branch `grammarx/phase-1-5`.

Committed migration line:

- `55df6e9` — Phase 1 and Phase 2;
- `dd2ca47` / `ffc703f` — Phase 3 entry/video-core adoption and record;
- `cfd05fa` / `d96d140` — real subtitle join and opening player seam;
- `a4e495d` — first full-plan continuation slice: core study controls on VideoCore.

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

## Remaining Phase 3 work

- real dual subtitles;
- shadowing and Whisper generation;
- screenshot and exact cue-bounded audio clip;
- editable card preview and one-action mining;
- duplicate warning, undo, Anki destination, mining history;
- complete cue → episode → media → assets → draft → exported-note provenance;
- single-run G-PLAY with live AnkiConnect, followed by restart/resume/history proof;
- final visual comparison before retiring the old player.

## Next three safe actions

1. Bridge the active VideoCore cue/player into the retained
   `StudyOrchestratorWorkspace` draft and provenance contract without a second timeline.
2. Attach screenshot and cue-bounded audio capture to that draft, then expose editable
   preview.
3. Add duplicate/undo/destination/history and run the complete namespaced live-Anki
   G-PLAY plus restart-persistence check.

## Current verification

| Gate | Result |
|---|---|
| focused study + architecture tests | 14/14 pass |
| full tests | 252 files / 2,894 tests pass |
| TypeScript | accepted 290 diagnostics / 108 files; 0 in slice |
| lint | accepted 164 problems; 0 changed-path mentions |
| renderer build | exit 0; 4,578 modules |
| CSS containment | 6,865/6,865 scoped; 0 unscoped; 0 shell Tailwind tokens |
| patch apply and generator | exit 0 |

`src/media/seanime-boundary.d.ts` remains hand-maintained. TypeScript does not open the
vendor tree, so production build and live harness are the signature gates.

## Destructive-risk constraints

- Do not launch a second Electron instance; it shares `%APPDATA%/jp-study-app`.
- Anki is live on the real 82-deck collection. Use only the namespaced, self-cleaning
  probe deck for the final gate.
- Do not edit or clean the pinned upstream checkout.
- Never run `git clean -fd`, `git reset --hard`, or broad staging.
