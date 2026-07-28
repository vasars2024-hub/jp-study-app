# Next session handoff

Updated 2026-07-28 after **Phase 3 closed**.

## Where you are

Repo `C:/Users/Arseniy/Projects/jp-study-app` · branch `grammarx/phase-1-5`.

Committed migration line:

- `55df6e9` — Phase 1 and Phase 2;
- `dd2ca47` — Phase 3 Task 1 entry/video-core adoption;
- `ffc703f` — Task 1 durable record;
- `cfd05fa` — Phase 3 Tasks 2/3 live subtitle join and smallest player slice.

The adopted closure is **369 files: 363 upstream-identical + 6 guarded whole-file
substitutions**. The Media workspace mounts the adopted websocket provider and full
VideoCore. A sibling Study Overlay receives real `cuechange` from the real
`VideoCoreSubtitleManager` and uses `cue.startMs` / `cue.endMs`.

`CURRENT_STATE.md` contains the complete evidence and failed experiments. Phase 3 has no
remaining implementation task.

## Verify before doing anything

```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -5
git -C C:/Users/Arseniy/Projects/seanime-upstream status --short
```

The pinned checkout must remain at `9bdd052` with exactly its three pre-existing dirty
entries:

```text
 M seanime-web/public/jassub/jassub-worker.js
 M seanime-web/src/routeTree.gen.ts
?? seanime.exe
```

Never clean the main worktree. It contains extensive unrelated concurrent work. Stage only
explicit migration paths.

## Phase 3 acceptance — settled, do not re-derive

- Real adopted provider identity:
  `8b42797e-4798-40b6-992e-79c065a914e8` in the accepted isolated run.
- Real parser stream: **11,871,913 bytes** consumed.
- Real manager cues:

  ```text
  2148-5148ms  猫が窓辺で寝ている。
  6648-9398ms  今日は本当にいい天気ですね。
  ```

- Sidecar corroboration: track 3 `S_TEXT/ASS`; events
  `startTime=2148 duration=3000` and `startTime=6648 duration=2750`.
- Full adopted VideoCore was active and its h264/aac remux was playing.
- The sibling Overlay reads exact demuxer timings from the cue. It never uses
  `video.currentTime` for provenance or mining boundaries.
- No synthetic cue or mocked subtitle manager was used.

## The transport contract that matters

Directstream local-file messages arrive on `WSEvents.NATIVE_PLAYER`, not
`WSEvents.VIDEOCORE`.

The REST request that starts targeted playback must carry:

```text
X-Seanime-Token
X-Seanime-Client-Id
X-Seanime-Client-Id-Proof
X-Seanime-Client-Platform
```

Putting `clientId` only in the JSON body reproduces the old false negative: the server
accepts and logs a targeted send, but the browser receives no `watch` or
`subtitle-event`.

Fresh isolated sidecars need `POST /api/v1/start` before settings exist. A scan directory
must not contain a same-basename MP4 beside the MKV, or the MKV can remain unmatched. The
parser stream must actually be consumed before cues are emitted.

## Durable repro

```bash
node docs/migration/tools/cue-manager-harness.mjs <cue-probe.mkv> <cue-probe.mp4>
```

The harness:

- derives the repo path instead of hard-coding a user directory;
- accepts `SEANIME_CUE_PROOF_EXE` or defaults to the sibling pinned checkout;
- creates a temporary sidecar datadir and copied one-file library;
- serves the private MP4 remux with byte-range support;
- captures sidecar stdout in `%TEMP%`;
- cleans its process tree and disposable datadir on exit.

It does not start Electron and does not touch the live Anki collection.

## Fixed verification baselines

| Command | Accepted result |
|---|---|
| `npx vite build --config vite.renderer.config.ts` | exit 0; 4,576 modules |
| `node docs/migration/tools/check-media-css-containment.mjs` | 6,847/6,847 scoped; 0 shell Tailwind tokens |
| `npm test` | 251 files / 2,888 tests pass |
| `npx tsc --noEmit` | expected exit 2; 290 diagnostics / 108 files; 0 vendor |
| `npm run lint` | expected exit 1; 164 problems (2 errors, 162 warnings) |

`src/media/seanime-boundary.d.ts` is hand-maintained. TypeScript deliberately never opens
the vendor tree, so the production build and real browser harness—not a green boundary
re-check—are the upstream-signature gates.

## Next three safe actions

1. Keep Phase 3 closed. Do not expand the deliberately minimal player/Overlay seam as
   incidental cleanup.
2. If the Seanime pin changes, regenerate
   `video-core-subtitles.ts`, confirm the guarded in-memory cue patch still applies, and
   repeat both the production build and live cue harness.
3. Prepare the upstream cuechange patch together with the incorrect seconds→milliseconds
   documentation correction, then begin the next phase named by
   `SEANIME_MIGRATION_PLAN.md`.

## Destructive-risk constraints

- Do not launch a second Electron instance while the app is running; instances share
  `%APPDATA%/jp-study-app`.
- Anki is live on the real 82-deck collection. Use only the namespaced, self-cleaning probe
  deck if its gate must be repeated.
- Do not edit or clean the pinned upstream checkout. The substitution generator applies
  the cue patch in memory.
- Never run `git clean -fd`, `git reset --hard`, or broad staging in the main worktree.
