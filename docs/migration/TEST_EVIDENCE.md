# Test and visual evidence

Append-only. Every entry records the exact command or tool, date, environment, and whether the
dependency was **live** or **stubbed**. Unverified claims stay unverified.

## 2026-07-27 — Phase 0 baseline

Environment: Windows 11 Pro 26200 · node v24.16.0 · npm 11.13.0 · tsc 5.2.2 ·
branch `grammarx/phase-1-5` @ `a22e7ba` · dev server `http://localhost:5173`

### Automated

| Command | Result | Classification |
|---|---|---|
| `npm test` (`vitest run`) | **251 files, 2,888 tests, 0 failed**, exit 0, 16.69 s | pass |
| `npx tsc --noEmit` | exit 2 — **290 diagnostics, 108 files** | **pre-existing failure**, not a regression |
| `npm run lint` (`eslint --ext .ts,.tsx .`) | exit 1 — 164 problems (**2 errors**, 162 warnings) | **pre-existing failure** |

The 2 eslint errors are `import/no-unresolved` on `vitest/config` in config files, not app code.
Per-file diagnostic breakdown: `…/2026-07-27-phase0/baseline-tsc-by-file.txt`. **Any future
session must diff against that file before calling a diagnostic a migration regression.**

Highest-diagnostic files: `shared/__tests__/epubDeck.test.ts` (16),
`renderer/components/grammar/GrammarExplorer.tsx` (16), `renderer/environment/shimejiPacks.ts` (14),
`renderer/components/blanc/BlancShell.tsx` (13), `main/city/rendering/diorama/NoctisWorldScene.tsx` (13).
Anki/scraper core is nearly clean — 1 diagnostic in `main/anki/apkgImport.ts`.

### Runtime / visual — `jp-app` MCP, live app

Tool: `mcp__jp-app__{app_health,app_screenshot,app_eval,app_click}`. Windows: `日本語 Study`
1280×860 and `Blanc Toolbox` 560×460. Captures 1264×821, dark theme, dev build.

| # | Surface | Route | File | What it establishes |
|---|---|---|---|---|
| 1 | Anime Scraper — Scheduled Tasks | Scraper ▸ Scheduled Tasks | `debug/shots/win1-1785172392909.png` | Rail with per-page maturity dots; live cron validation ("hour 25-25 is outside 0-23"); 2 schedules / 1 enabled; scheduler off; live memory+CPU footer |
| 2 | Media Center — Library Home | Media ▸ Library | `debug/shots/win1-1785172643580.png` | **1,586 titles · 1,586 files**; rail Home/Library/Video/Music/Study Mode/Discover; sub-nav Recently added 1,586 / Continue watching 2 / Study queue / Favorites / Tracking; **TV shows 1, Music 1,585**; persistent bottom player |
| 3 | Media Center — Video player | Media ▸ Video | `debug/shots/win1-1785172724152.png` | **The Phase-3 "before".** Learning controls: Auto-pause, Loop line, Furigana, **Dual sub ON**, Dictation mode, Shadowing mode. Subtitle & transcription: Whisper "Base (fast)", 日本語/中文, complete/Stop. Open-from-YouTube. Open video / Subtitles / Generate |
| 4 | Media Center — Study Mode | Media ▸ Study Mode | `debug/shots/win1-1785172756993.png` | **Live production line**: Media selected ✓ → Subtitles ready ✓ → Language analyzed ✓ **253 lines** → Compared with knowledge ✓ 0% Known → Vocabulary refined ✓ **30 candidates** → 6 Cards prepared (Waiting) → 7 Anki handoff (Waiting). Funnel **370 → 30**, coverage 0% → 17%. Exclude N5/N4, "Only words missing JLPT", min repeats 1 |

| 5 | Anime Scraper — Dashboard | popped-out window, 900×640 | `debug/shots/win3-1785173161604.png` | Explicit **"Sample data"** badge; amber maturity dot on Dashboard itself; **1 healthy source · 2,362 indexed episodes · 0 Japanese subtitle tracks** |
| 6 | Anime Scraper — Torrent Manager | ” | `debug/shots/win3-1785173201765.png` | **70 matching releases** from real indexers (Erai-raws 1080p 1,437 seeders 1.4 GB; SubsPlease 1080p 1,389 seeders). qBittorrent **"not configured"**, `http://localhost:8080`, no password |
| 7 | Anime Scraper — Source Manager | ” | `debug/shots/win3-1785173230697.png` | Source mode Streaming/Torrent/Both. **Priority chain 6 enabled — Streaming 0, Torrent 1, Metadata 3, Subtitles 2.** Jikan (MyAnimeList) `api.jikan.moe` **Degraded 749 ms**; AniList `graphql.anilist.co` **Unknown** |

| 8 | Anime Scraper — Discover | ” | `debug/shots/win3-1785173346024.png` | Real catalogue: One Piece ワンピース 1,122 eps · 2,234 mirrors (StreamSB); Frieren 葬送のフリーレン 28 eps · 61 mirrors (VidPlay); Jujutsu Kaisen 呪術廻戦 47 eps · 94 mirrors (MegaCloud). Filters This season / Airing now / Most watched / Upcoming, **Level N4**, "Hide titles in my library". Discover/Shortlist tabs. 0 planned · 7 active sources. Actions: Plan to watch / Find sources / Queue scrape |

**Capture 8 is the direct "before" for the Seanime Discovery decision.** It already carries the
Study-specific additions the plan requires any adopted discovery UI to keep — a **JLPT level
filter**, "Hide titles in my library", a shortlist, and a **Queue scrape** handoff into
acquisition. Adopting Seanime's richer filter matrix must *add* to this, not replace it.

**Capture 4 independently confirms `study-mode/CURRENT_STATE.md`** — the recorded 253 subtitle
lines / 370 candidates / 30 selected are visible in the running app, not just claimed in prose.

**Captures 6–7 independently confirm `featureStatus.ts`.** `page.torrents` = `ready` is backed
by 70 real releases; `set.qbittorrent` = `untested` is backed by a client that is literally not
configured; `result.streams` = `shell` is backed by **Streaming 0** in the priority chain. The
registry is telling the truth.

**Capture 5 shows the Dashboard is honest about itself** — it renders a "Sample data" badge and
carries its own amber dot rather than claiming the panels below the hero counts are live.

**Live vs stubbed:** all four are live renderer state against the real local library and the
real persisted study document. No fixtures. The Scraper's schedule rows use example URLs
(`example-anime-site.com`) — that is user-entered sample data, not a fixture.

### Blocked evidence — carry into the next session

1. **Synthetic clicks against stacked in-app windows are unreliable — solved.** Inside the main
   window, `.fwin-max` surfaces re-raise unpredictably and rail items often fail to activate
   even at exact `getBoundingClientRect()` centres. **Not a product bug** — no user-visible
   reproduction; it is an instrumentation limit.
   **Working procedure, used for captures 5–7:** pop the workspace into its own OS window
   (`⧉` "Pop out into its own window"), then drive it with `{window: <id>}`. Inside a popped-out
   window, **send the same click twice** — the first focuses the window, the second activates
   the control. This was reliable every time.
2. **`app_screenshot` lags exactly one call.** A capture taken immediately after `app_click`
   shows the *previous* frame. Insert any second tool call (e.g. `app_eval {js: 1}`) between
   click and capture. Reproduced 6×.
3. **`app_screenshot {window: <id>}` failed with `UnknownVizError` once**, immediately after the
   pop-out window was created; it succeeded on the following call. Give a new window one
   round-trip before capturing.
4. **Gate G-VIS — foundation surfaces: CLOSED.** All eight surfaces owned by Phases 1–4 (the
   media + scraper foundation) are captured: the player, Study Mode, the media library, and
   five Scraper surfaces including source health and discovery.
   **Deliberately not captured, because they belong to later phases:** series/entry detail and
   Manga/Novel readers (Phase 5, Reading convergence), Anki (disposition is *Retain, untouched* —
   nothing migrates), AI permission prompt (Phase 7). Each is captured when its phase opens,
   using the procedure above. This is a scope boundary, not an omission.
5. **Live AnkiConnect still unverified.** Carried forward from `study-mode/CURRENT_STATE.md`;
   no external Anki write has ever been attempted. This is the Phase-3 acceptance gap.
6. **Anime library is effectively empty** — 1 TV show against 1,585 music files (capture 2),
   while the Scraper reports 2,362 indexed episodes (capture 5). Indexed metadata is not local
   media. Phase 1's scanner comparison needs real anime files, or it proves nothing.
7. **Metadata provider health is degraded right now** — Jikan `Degraded` at 749 ms, AniList
   `Unknown` (capture 7). Re-check before treating any Phase-1 catalogue result as a baseline.

## 2026-07-28 — Phase 3 continuation: core study controls on VideoCore

Environment: Windows · branch `grammarx/phase-1-5` · implementation `a4e495d` ·
Seanime pin `9bdd052`.

### Automated

| Command | Result | Classification |
|---|---|---|
| focused `videoCoreStudy` + architecture tests | **14/14 passed** | pass |
| `npm test` | **252 files, 2,894 tests, 0 failed** | pass |
| `npx tsc --noEmit` | expected exit 2; **290 diagnostics / 108 files**, 0 in changed slice | fixed baseline |
| `npm run lint` | expected exit 1; **164 problems (2 errors, 162 warnings)**, 0 changed-path mentions | fixed baseline |
| `npx vite build --config vite.renderer.config.ts` | **exit 0**, 4,578 modules | pass |
| `check-media-css-containment.mjs` | **6,865/6,865 scoped**, 0 unscoped, 0 shell `--tw-` | pass |
| upstream `git apply --check` + substitution generator | **exit 0** | pass |

The first full suite run found one new architecture finding: the overlay repeated the old
player’s storage-key literal. The implementation moved access behind its shared migration
contract; the baseline was not updated, and the subsequent full suite passed.

### Runtime — isolated real Seanime sidecar

Tool: the dev-only `cue-manager-harness.mjs` plus the in-app browser against
`http://127.0.0.1:58134/media-harness.html`. Dependencies were **live**, not stubbed,
except for inert Electron player-bus preload calls that cannot exist in a browser page.
The Seanime provider, REST calls, websocket, parser, VideoCore, subtitle manager, video
element, audio manager, and study controls were the production paths.

Evidence:

- adopted provider connected as
  `cc8a86ef-1ed4-4a08-9f07-842fbbaf45df`;
- directstream accepted and parser consumed **11,871,913 bytes**;
- real `VideoCoreSubtitleManager` mounted;
- real ASS cues:

  ```text
  2148-5148ms  猫が窓辺で寝ている。
  6648-9398ms  今日は本当にいい天気ですね。
  ```

- playback speed selected `0.75`; the real video element reported `0.75`;
- subtitle delay displayed `+0.1s`;
- cue-end auto-pause stopped at about `5.37s` for the delayed `5.248s` boundary;
- line loop stayed inside cue 1’s delayed range;
- paused cue 1 at `2.248s`; dictation answer `猫が窓辺で寝ている。` returned
  **Exact match**;
- furigana rendered ruby readings `ねこ`, `まどべ`, `ね`;
- A–B UI displayed `2.25s` / `14.55s`; after crossing B, playback returned inside
  the interval at `6.02s`.

No cue or subtitle/audio manager was mocked. The harness Node and isolated Seanime
processes were stopped by exact PID, the resolved disposable datadir was removed, the
running Electron app was not duplicated, Anki was untouched, and the pinned upstream
checkout retained exactly its three pre-existing dirty entries.

### Scope verdict

This evidence passes the **first control slice**, not full Phase 3. G-PLAY remains open
for dual subtitles, shadowing, Whisper, screenshot/audio assets, editable mining preview,
duplicate/undo/destination/history/provenance, the one-run live-Anki export, restart
persistence, and final visual comparison.

## 2026-07-28 — Phase 3 continuation: mining preview and real cue assets

Environment: Windows · branch `grammarx/phase-1-5` · implementation `03d27a3` ·
Seanime pin `9bdd052`.

### Automated

| Command | Result | Classification |
|---|---|---|
| focused mining + study + architecture tests | **18/18 passed** | pass |
| `npm test` | **253 files, 2,900 tests, 0 failed** | pass |
| `npx tsc --noEmit` | expected exit 2; **290 diagnostics / 108 files**, 0 mining paths | fixed baseline |
| targeted changed-path ESLint | **exit 0**, no warnings or errors | pass |
| `npm run lint` | expected exit 1; **164 problems (2 errors, 162 warnings)**, 0 mining-path mentions | fixed baseline |
| renderer production build | **exit 0**, 4,580 modules | pass |
| CSS containment | **6,895/6,895 scoped**, 0 unscoped, 0 shell `--tw-` | pass |

### Runtime — real VideoCore frame and audio

Tool: the isolated cue-manager harness plus the in-app browser. The Seanime provider,
websocket, parser, VideoCore, selected ASS cue, video frame, and audio stream were live.
Electron-only preload calls were inert. Anki was intentionally not mutated.

On the real first cue:

```text
source       Sousou no Frieren · Episode 1
cue          track 3 · index 0 · 2148–5148 ms
screenshot   jp-video-cue-3-0-2148.png · 113,329 bytes
audio        jp-video-cue-3-0-2148.webm · 48,843 bytes
```

The preview retained both assets and the original cue/source provenance after the term
was edited from the full sentence to `猫`. The Mine button was enabled. Audio capture
temporarily sought and played the exact delay-adjusted cue interval at 1×; afterward the
same VideoCore element was paused at `2.151889s` with rate `1`, matching its prior state.

The Mine, duplicate-history, destination, and undo code paths are implemented but were
not clicked. Therefore this is **asset and preview acceptance only**, not a live-Anki
G-PLAY pass. Harness processes were stopped by exact PID, the disposable datadir was
removed, the browser harness tab was finalized, the running Electron app was not
duplicated, and the live 82-deck Anki collection was untouched.

## 2026-07-28 — Phase 3 continuation: dual-track negative acceptance

Environment: Windows · branch `grammarx/phase-1-5` · implementation `ea77f59` ·
Seanime pin `9bdd052`.

### Automated

| Gate | Result |
|---|---|
| focused mining + study + architecture tests | **19/19 passed** |
| `npm test` | **253 files, 2,901 tests, 0 failed** |
| `npx tsc --noEmit` | expected exit 2; **290 diagnostics / 108 files**, 0 slice diagnostics |
| targeted ESLint | **exit 0** |
| `npm run lint` | expected exit 1; **164 problems**, 0 slice mentions |
| renderer production build | **exit 0**, 4,580 modules |
| CSS containment | **6,896/6,896 scoped**, 0 unscoped, 0 shell `--tw-` |
| upstream patch apply + generator | **exit 0** |

### Runtime — fresh two-track fixture

The disposable fixture contained Japanese ASS track 3 and English ASS track 4 with six
aligned cue ranges. Both appeared in the real manager’s track menus. The startup-race fix
allowed directstream to complete without the earlier intermittent cancellation.

The fresh provider connected as
`f6dbda04-4197-4ac0-97bc-9668dd55940b` and consumed **11,873,146 bytes**, but tracing
showed only:

```text
[cue-proof] subtitle-event 1 cue(s), tracks 4
```

Track 3 was selected as the secondary track; `data-secondary-cue-count` remained `0`.
This is a **valid negative result**: the renderer can keep and resolve a second timeline,
but the real parser/directstream feed did not supply that timeline, so dual subtitles
are not accepted.

The exact Node/sidecar processes were stopped, all disposable datadirs and temporary
dual-track files were removed, the browser tab was finalized, Electron and Anki were
untouched, and pinned upstream remained at its three pre-existing dirty entries.

## 2026-07-28 — Phase 3 continuation: terminal batch fix and practice surfaces

Environment: Windows · branch `grammarx/phase-1-5` · implementation `3fe73d0` ·
Seanime pin `9bdd052`.

### Automated

| Gate | Result |
|---|---|
| focused study + mining + architecture tests | **21/21 passed** |
| `npm test -- --run` | **253 files, 2,903 tests, 0 failed** |
| `npx tsc --noEmit` | expected exit 2; **290 diagnostics / 108 files**, 0 migration diagnostics |
| targeted ESLint | **exit 0** |
| `npm run lint` | expected exit 1; **164 problems (2 errors, 162 warnings)** |
| renderer production build | **exit 0**, 4,581 modules; dedicated Whisper worker emitted |
| CSS containment | **6,912/6,912 scoped**, 0 unscoped, 0 shell `--tw-` |
| patched sidecar builder | **exit 0**, `go test ./internal/directstream` pass, 51.4 s |

The typecheck briefly rose to 292/109 because the Vite worker constructor lacked an
ambient type and its error callback became implicit `any`; the scoped worker declaration
removed both, restoring the exact baseline. No baseline was changed.

### Runtime — dual subtitles now pass

The negative above was traced to successful parser shutdown: `Stop(true)` cancelled the
context before the terminal subtitle batch was sent. Patch `0002` reverses that ordering
and adds an upstream Go regression.

The fresh patched-sidecar run delivered **6 Japanese + 6 English cues**. Simultaneous real
manager output included:

```text
2148–5148 ms  猫が窓辺で寝ている。
2148–5148 ms  The cat is sleeping by the window.
```

Later in the loop, `この漢字の読み方が分かりません。` aligned with
`I do not know how to read this kanji.`. Disabling dual subtitles removed only the
secondary English text; re-enabling restored it with six secondary cues and unchanged
Japanese mining provenance.

### Explicitly not yet accepted

Shadowing, Whisper, and restart continuity were implemented and build/unit clean, but this
run did not yet claim:

- a real microphone capture;
- a real Whisper model download/inference (closed by the later `1c51d6c` run below);
- mounted-preview export to the live Anki collection;
- actual app restart/resume/history persistence;
- final visual parity.

Those remain the G-PLAY exit work. The browser proof lease was finalized after dual-cue
acceptance, so inventing a hardware/model result would have been a false positive.

### Runtime addendum — local Whisper inference PASS (`1c51d6c`)

The harness produced 16 kHz mono float PCM with the same ffmpeg arguments as Electron main
and served it from the disposable datadir. The first Auto run downloaded
`whisper-base` but failed because Chrome exposed WebGPU without a usable adapter. The worker
was corrected to probe before ONNX pipeline creation, avoiding a poisoned GPU-first backend
and selecting WASM cleanly.

The fresh CPU run completed:

```text
Generated 3 subtitle lines.
Subtitle track: Whisper (generated)
Cue 1 · track 5 · 0–24000 ms · 【音楽】
```

The generated cue rendered in the Study Overlay and populated the mounted card preview
with track 5 and exact `0–24000 ms` provenance. Production build remained 4,581 modules;
focused tests stayed 21/21, TypeScript stayed at 290/108, and CSS containment stayed
6,912/6,912.

The microphone button was reached on a real active cue, but not pressed: Chrome microphone
permission and audio capture require explicit user approval. No microphone result is
claimed.

### Final visual comparison — PASS (`29582e0`)

Compared:

- before: `debug/shots/win1-1785172724152.png`;
- adopted player: `debug/shots/phase3-adopted-player-dual-cue-20260728.jpg`;
- proof viewport: 1,294 × 845 at Chrome 100% zoom.

The first adopted-player capture was a negative result: intrinsic form-control widths made
the 24rem card-preview grid overflow horizontally and clip its Term/Meaning fields. The
fix uses zero-minimum grid tracks, bounded 100%-width controls, and vertical-only panel
overflow.

The fresh real-cue capture showed `I do not know how to read this kanji.` and
`この漢字の読み方が分かりません。` simultaneously; cue 5, track 4, and exact
`21000–24000 ms` timing remained visible. The entire control dock was reachable, and the
card preview displayed both columns plus provenance without a horizontal scrollbar.

After the correction:

```text
renderer build: 4,581 modules, exit 0
media CSS: 6,915/6,915 scoped
unscoped selectors: 0
shell --tw- tokens: 0
```

This closes G-VIS. Microphone capture and the uninterrupted mounted-preview
Anki/restart G-PLAY remain open.
