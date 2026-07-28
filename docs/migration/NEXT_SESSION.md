# Next session handoff

Written 2026-07-28 at the end of the **Phase 3 opening** session.

## Where you are

Repo `C:/Users/Arseniy/Projects/jp-study-app` · branch `grammarx/phase-1-5`.

**Phase 1 and Phase 2 are COMMITTED as `55df6e9`.** Gate G-1: PASS. §8 scanner gate: PASS.
**§9 live-AnkiConnect gate: PASS** (exercised for the first time in any phase). The cue
patch's three open assumptions are **answered**. The `entry`/episodes closure is **measured
but not adopted**, and the Phase-3 player slice is **not built**.

`CURRENT_STATE.md`'s "Phase 3 — opening" section is the full record. This file is the handoff.

## Verify before doing anything

```bash
git rev-parse --abbrev-ref HEAD   # grammarx/phase-1-5
git log --oneline -1              # 55df6e9 feat(media): adopt Seanime library surface…
go version                        # go1.26.5 — if it does not resolve, that is a STALE SHELL,
                                  # not a missing toolchain (C:\Program Files\Go\bin\go.exe,
                                  # present on the MACHINE PATH; a fresh shell picks it up)
```

Pinned checkout `C:/Users/Arseniy/Projects/seanime-upstream` must be at `9bdd052` with exactly
three dirty entries (`jassub-worker.js`, `routeTree.gen.ts`, `?? seanime.exe`). It was left
pristine after the patch was applied and reverted.

`ENVIRONMENT_BASELINE.md` in the Phase-0 backup still says `go — NOT INSTALLED`. Knowingly
stale, left unedited because the backup is covered by `SHA256SUMS.txt`.
**Source-of-truth order is repo/system state > recorded prose. Never modify the backup.**

## Next three safe actions

1. **Adopt `entry`/episodes** — the measurement is done, so this is now a mechanical step.
   `+190 local files (179 → 369)` and **15 new npm packages**. Follow
   `vendor/seanime-web/ADOPTION.md` exactly, and **write the fifth substitution**: stub
   `_features/mpv-core/mpv-core.tsx`, because `@mpv-prism/core` is otherwise pulled in and
   ADR-002 defers mpv-prism (licence unknown, "don't ship it"). `hls.js`, `jassub`,
   `anime4k-webgpu`, `media-captions` **are** wanted — they are `video-core`.
   Re-check `src/media/seanime-boundary.d.ts` afterwards: it is hand-maintained and
   TypeScript will **not** catch an upstream signature change.
2. **Mount `video-core` + the Study Overlay sibling** (the actual Phase-3 opening slice).
   When you do, finish joining the cue path — see the one open item below.
3. **Join the two halves of the cue proof.** Mount the adopted `websocket-provider.tsx`
   instead of hand-rolling a websocket client, then confirm `cuechange` fires inside the real
   `VideoCoreSubtitleManager`. Everything else about the patch is now settled.

## What is settled — do NOT re-derive

- **`MKVParser_SubtitleEvent.startTime`/`duration` are MILLISECONDS.** From the producing Go
  source: `mkvparser.go:616  milliseconds := float64(packet.StartTime) / 1e6`. The patch is
  correct as written. **Upstream's Go struct comment AND the generated `types.ts` both say
  "in seconds" and are WRONG** — trusting them costs a 1000× timing error. Worth an upstream
  PR next to the patch.
- **`timeupdate` is 3.81 Hz** (mean gap 262.6 ms, max 290.7 ms, 115 real samples); cue
  activation is **76–216 ms late**. `requestVideoFrameCallback` is not needed **provided the
  Overlay reads timings from `cue.startMs`/`cue.endMs` (exact, from the demuxer) and never
  from `video.currentTime` at `cuechange`.** Then mining/provenance stay frame-exact and only
  UI responsiveness carries the lag.
- **ASS override tags reach `text` raw** (`{\pos}`, `{\i1}`, `{\an8}`, `{\b1}`). Strip in the
  Overlay at the mining boundary; keep raw text in provenance. Not in the patch.
- **Live AnkiConnect works end to end** — all 14 `AnkiActionMap` actions, including
  `storeMediaFile` for screenshot + audio clip, and duplicate rejection. Re-run any time with
  `node docs/migration/tools/anki-gate.mjs <stamp>` (self-cleaning; it creates and deletes its
  own probe deck — it never touches existing notes).
- **The test library has NO soft subtitles.** The Big O is HEVC with zero subtitle streams;
  the AnimePahe `.mp4`s are hardsubbed h264+aac. Don't waste time looking for one — build a
  fixture (see below), and note that Phase 3 mining depends on Study OS's subtitle-discovery
  path, not on the library.

## Driving directstream from an external client — four preconditions

Each failure returns a bare `HTTP 500 {"message":"Internal Server Error"}`; the real reason is
only in the server log, so always capture stdout.

1. the path must be a **registered `LocalFile`** (a library scan is required — an arbitrary
   path is rejected with *"could not find local file"*);
2. it must be **matched** (`mediaId != 0`);
3. the `mediaId` must be **seeded into the collection** via
   `POST /api/v1/library/unknown-media { mediaIds }` — otherwise *"media not found in anime
   collection: N"*, because the simulated collection starts empty;
4. the demuxer only advances **as a client consumes the stream** — no cues until something
   pulls `/directstream/stream`.

`node docs/migration/tools/cue-runtime.mjs <mkv>` performs all four and is the starting point.

## Reproducing the cue fixture

There is no subtitled file in the library, so build one (ffprobe/ffmpeg are at
`…\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-8.1.1-full_build\bin\`):

```bash
ffmpeg -y -i "<a real AnimePahe .mp4>" -i cue-probe.ass \
  -map 0:v:0 -map 0:a:0 -map 1:0 -t 30 -c:v copy -c:a copy -c:s ass \
  -metadata:s:s:0 language=jpn cue-probe.mkv
```

`cue-probe.ass` authors cues at exactly 2000/6500/11000/16000/21000/24000 ms with override
tags, so runtime values can be checked to the millisecond. Chromium cannot play Matroska —
for renderer-side tests use an `.mp4` remux of the same clip.

## Failed / negative experiments — keep these, they cost real time

Carried over from Phase 2:

- **Seeding *prior* seasons makes matching worse** — 44/62 with all seasons vs 51/62 with only
  the current season, and 11 silent mis-matches vs 0.
- **The `unknownGroups` seeding loop cannot bootstrap a collection** (12/62, below cold start).
- **`GET /api/v1/library/collection` is not the tracker collection** — only media with local
  files, so it reads 0 before a scan.
- **A `mediaId` is not a correct match** — `metadata.type === "special"` is the fallback bucket.
- **Adopted source under `src/` breaks `architectureBaseline.test.ts`** (179 orphan modules).
- **`getOnInit: true` on the auth-token atom** reads localStorage at module-eval → silent 401 →
  `location.replace("/public/auth")` → blank screen, no console error. Hence `seanimeBootstrap.ts`.
- **A dev harness must `chdir` to the repo root**, or Tailwind loads its default config and
  every `theme('colors.brand.*')` call fails.
- **Don't write patches through a shell heredoc containing `\u0000`.**

New this session:

- **Websocket addressing for nativeplayer events is unsolved from an external client.** Three
  schemes tried — our own `?id=` uuid, the server-issued `client-identity` id, and a full
  reconnect with `?id=&proof=` (accepted and echoed back). In every case the server logged
  *"Signaling player that stream is ready"* but no `watch`/`subtitle-event` frame arrived.
  Stop hand-rolling the client; mount `websocket-provider.tsx`.
- **A scratchpad is session-scoped and WILL be lost.** Phase 2's `import-graph.mjs`,
  `start-sidecar.mjs`, `media-harness-server.mjs` and the populated `seanime-datadir-runD` are
  all gone. Anything reusable now lives in `docs/migration/tools/`. Put it there, not in a
  scratchpad, and not in `tools/` (a parallel session owns that).
- **`git status --porcelain` counts an untracked directory as ONE entry**, so the 552 → 537
  drop after the commit is 11 untracked paths + 4 modified, not 15 files.

## Do not

- `git clean -fd` / `git reset --hard` / `git checkout -- .` — the tree is intentionally dirty
  (537 entries). All 16 files of `src/main/scraper/` are untracked.
- `git gc --prune` or any history rewrite — 20 dangling commits hold parked work, and
  `C:/Users/Arseniy/Projects/jp-study-app-noctis-beta` shares this object store.
- Commit `src/preload.ts`, `src/main.ts`, `src/renderer/App.tsx` or `src/renderer/window.d.ts`
  wholesale. They still carry ~1,068 lines of parallel-session work that imports five
  **untracked** modules; committing them whole produces a broken tree.
- Touch `src/main/anki/`, `src/.coordination/study-mode/`, `tools/`, or
  `src/renderer/data/grammar/` (parallel sessions).
- Hand-edit anything under `vendor/`. Substitutions are whole-file replacements, always.
- Restructure `DesktopShell.tsx`, the desktop grid, the dragging layer, or the taskbar.
- Ship Seanime's name, logo or screenshots in UI.
- Launch a second Electron instance while the user's app is running — it shares
  `%APPDATA%\jp-study-app`. Use the harness pattern instead.
- Re-open **R5** (grammar corpus de-branding). Closed.

## Known-failing baselines — not your bug

| Command | Expected | Verified this session |
|---|---|---|
| `npx tsc --noEmit` | exit 2, **290 diagnostics, 108 files** | 290 |
| `npm run lint` | exit 1, 164 problems (2 errors) | not re-run |
| `npm test` | **exit 0, 251 files, 2,888 tests** | 251 / 2,888 passed |

A test failure **is** your bug. Type and lint diagnostics must be diffed against the baseline.

## Unresolved

- **R1 all but closed** — the cue patch's semantics are settled; only the websocket join
  remains, and it is a transport problem, not a patch problem.
- **§9 AnkiConnect — CLOSED.** No longer an acceptance gap.
- **Virtualization still unproven at scale** — `MediaCardLazyGrid` engages above 48 items and
  the test library has 15 titles. The `entry` adoption may finally get you past it.
- **Two Study OS parser bugs remain spun off, and are probably MOOT** — §8 adopts Seanime's
  scanner, so decide whether `parseMediaFileName` has a future before spending time there.
- **English-only** stays ACCEPTED under ADR-003; the EN/JA/ZH/RU sweep is a hard exit gate on
  Phase 4.
