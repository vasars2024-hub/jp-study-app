# Seanime × Study OS — Architecture & Migration Plan (planning session output)

**Session type:** read-only planning. No repository file was created or modified, no branch,
no worktree, no install, no build, no test run, no application launch.
This document lives outside both repositories at
`…/Temp/claude/C--Users-Arseniy-Projects-jp-study-app/<session>/scratchpad/SEANIME_MIGRATION_PLAN.md`.

Evidence labels used throughout: **[V]** verified fact (exact path / API response / pinned
commit), **[L]** reported lead rechecked as far as read-only inspection allowed,
**[I]** inference from verified facts, **[U]** unknown — requires verification,
**[R]** recommendation (future action, not current behaviour).

---

## 1. Executive recommendation

### Target architecture

**Seanime runs as a pinned, supervised local sidecar process owned by the Study OS Electron
main process; Seanime's React web UI is adopted *as source* into the Study OS renderer as a
first-class Media workspace; Study Mode / mining / Anki stay in Electron main and bind to the
Seanime player timeline through one typed bridge.**

That is a deliberate **Strategy B + Strategy D hybrid**, not a fork (A) and not a webview
embed (C):

| Layer | Owner | Why |
|---|---|---|
| Catalogue, library scan/match, sources, extensions, torrent/debrid, auto-downloader, transcoding, offline sync, jobs | **Seanime Go server** (pinned, sidecar) | This is where Seanime's real, hard-to-rebuild value lives — 188+ typed REST routes, Habari filename parser, extension runtime, torrent-stream engine. **[V]** |
| Media UI: Discover, Library, entry/episode pages, settings, player chrome | **Seanime web source, adopted into Study OS renderer** | Normal React 19 + Tailwind + Radix + TanStack Router SPA. Portable to stock Electron. **[V]** |
| Playback engine | **Seanime `video-core`** (HTML5/hls.js) — *not* Denshi/mpv-prism | See blocker B1. `video-core` already does SSA/ASS + PGS + screenshots + playlists + preview thumbs in a normal Chromium. **[V]** |
| Subtitles-as-study, dictionary, OCR, mining, cards, Anki, Study Mode, difficulty, AI | **Study OS Electron main (unchanged)** | Already verified working, restart-safe, test-covered. Nothing in Seanime competes. **[V]** |
| Scraper (acquisition operations) | **Study OS Scraper app, re-based on Seanime source/job contracts** | Study OS's Scraper has surfaces Seanime has no equivalent for (Site Rules, selector/regex/HTTP tooling, honest maturity registry). **[V]** |

### Interim bridge

Phase 1 is a **read-only sidecar proof**: launch a pinned `seanime.exe` against an isolated
temp datadir, call three endpoints through Seanime's *generated* TypeScript types, render one
real library grid inside a throwaway Study OS route, prove zero writes to Study OS user data,
kill it cleanly. Falsifies or confirms the whole architecture in one slice.

### Why not the alternatives

- **Not Strategy A (fork Seanime, port Study OS into it).** Study OS is ~284k LOC of
  TS/TSX across main/renderer/shared with 246 test files **[V]**. Porting dictionary, OCR,
  reading lens, EPUB mining, Anki gateway, i18n, the desktop shell and Study Mode into a Go
  repo is a multi-quarter rewrite that throws away verified, restart-proven behaviour, and it
  puts your whole product under GPL-3.0.
- **Not Strategy C (host Seanime Denshi / its web UI in a webview).** Denshi is not a stock
  Electron app — see B1. And an `app-inside-an-app` webview cannot receive privileged Study
  overlays, keyboard ownership, or the mining IPC without exactly the security holes §11 of
  your brief forbids.

### Confidence and the single most important unknown

Confidence in the **boundary** (sidecar + adopted UI + main-process study services): **high**.
Confidence in the **player** decision: **medium** — it rests on one unverified claim:

> **[U] Can `video-core` expose a subtitle-cue timeline precise and observable enough to drive
> the existing Study Overlay (click-lookup, line replay, offset, screenshot + audio clip at the
> exact cue) without adding a second subtitle clock?**

Everything else can be recovered from; that one decides whether Phase 3 is an adoption or a
port. It is the first thing Phase 1 should probe after the connection proof.

---

## 2. Inspection boundary

**Study OS**
- Root: `C:\Users\Arseniy\Projects\jp-study-app`
- Branch: `grammarx/phase-1-5`; HEAD `a22e7ba1f72aa7942890ad7eb3ac253b37be0735` **[V]**
- Remote: `https://github.com/vasars2024-hub/jp-study-app.git` **[V]**
- Working tree: **505 dirty entries — 347 untracked, 147 modified, 11 deleted** **[V]**
  This is a large body of user-owned uncommitted work. It was not touched, staged, cleaned
  or inspected for content beyond `git status`.
- Inspected: repo root layout, `src/main/**` module list, `src/renderer/**` component and view
  layout, `src/shared/**`, `src/main/scraper/*`, `src/main/anki/*`,
  `src/renderer/components/scraper/featureStatus.ts` (read in full),
  `src/.coordination/study-mode/CURRENT_STATE.md` (read in full),
  `src/MEDIA_CENTER_REVAMP_AUDIT.md` (Phase 1–6 sections), `TASKS.md` (headings),
  `package.json`, `CLAUDE.md`.
- **Not** inspected this session: `docs/MASTER_PLAN.md`, `src/PHASE_*_STATE.md` (11 files),
  `AGENTS.md`, `PROJECT.md`, the Manga/EPUB reader internals beyond file size, the extension
  bridge, `src/main/city/*`, the Blanc toolbox, existing screenshots under `debug/shots/`.
  These are required inputs for the exhaustive ledgers — see §4 honesty note.

**Seanime**
- Upstream: `https://github.com/5rahim/seanime`, default branch `main` **[V]**
- **Pinned commit for all upstream claims: `9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9`**
  (`main`, authored 2026-07-23T10:15:22Z, message "changelog") **[V]**
- Retrieved: 2026-07-27, via the public GitHub REST API and `raw.githubusercontent.com`.
- License at that commit: **GPL-3.0** (`spdx_id: GPL-3.0`, from the repository API) **[V]**
- Inspected: root tree, `internal/` package list, `internal/handlers/` file list,
  `internal/handlers/routes.go` (route census), `internal/handlers/mal.go` (handler census),
  `internal/local/`, `seanime-web/` layout + `package.json` + `.env.*` targets,
  `seanime-web/src/app/(main)/` route+feature list, `seanime-web/src/app/(main)/_features/{video-core,native-player,mpv-core,media-core}/`,
  `seanime-denshi/` layout + `package.json` + `src/main/`, `mpv-prism.lock.json`,
  `DEVELOPMENT_AND_BUILD.md`, `README.md`.
- **Not** inspected: Go source bodies, the generated `seanime-web/src/api/generated/*`
  contents, settings route internals, manga internals, extension SDK, tests, `mobile/`.

**Visual evidence: none captured this session.** No Study OS launch, no Seanime build, no
screenshots. `src/.coordination/study-mode/CURRENT_STATE.md` cites three existing captures
(`debug/shots/win1-1785142561155.png`, `…691593.png`, `…973210.png`) **[V — cited, not opened]**.
**Runtime visual compatibility is therefore UNVERIFIED, and a visual-capture checkpoint is
mandatory before architecture approval** (see §9 gate G-VIS).

**Deliberately not run** (mutating): `npm install`, `npm test`, `npm run make/package`,
`go build`, `go generate`, any `git` write, any Seanime binary launch, any datadir creation,
any download.

---

## 3. Current Study OS truth (what the evidence actually shows)

### Scale

| Area | Non-test LOC | **[V]** |
|---|---:|---|
| `src/main` | 35,848 | `find … | wc -l` |
| `src/renderer` | 184,170 | ” |
| `src/shared` | 63,612 | ” |
| test files | 246 | ” |
| `src/main.ts` / `src/preload.ts` | 1,282 / 1,920 | ” |

44 registered desktop app sections in `src/renderer/components/DesktopShell.tsx`, grouped into
Study / Library / Media / Progress / System start categories **[V]**.

### Media Center

`src/renderer/views/MediaCenterView.tsx` (1,347 lines) + `src/renderer/components/media/**`
(9,639 lines incl. `library/`) is a real, composed shell **[V]**.
`src/MEDIA_CENTER_REVAMP_AUDIT.md` claims Library/Metadata/Video/Music/Detachable/Study/
Tracking/Organization all "completed and integrated", with a named partial column **[L]**.
Not re-verified at runtime this session.

**The player is an HTML5 `<video>` player.** `<video>`/`videoRef`/`HTMLVideoElement` appear in
exactly three files: `MediaCenterView.tsx`, `components/media/MediaContent.tsx`,
`components/media/StudyOrchestratorWorkspace.tsx` **[V]**. `MediaContent.tsx` carries the study
controls directly: `playbackRate`, `autoPause`, `furigana`, `dualSubs`, `dictationMode`,
`dictationResult`, `shadowingMode`/`shadowRecording` (via `MediaRecorder`), `abLoop`, and the
Whisper stack (`WHISPER_MODEL_SPECS`, `whisperSettings`, `whisperModelCache`) **[V]**.

**[I]** So the study player is not a codec/format engine — it is a *study control surface bolted
to `<video>`*. That is the good news for migration: the valuable part is separable from the
playback element, which is precisely what Phase 3 needs.

### Anime Scraper

`src/main/scraper/` is a genuine backend: `engine.ts`, `sources.ts`, `torrents.ts`,
`qbittorrent.ts`, `scheduler.ts`, `history.ts`, `plugins.ts`, `downloads.ts`, `exports.ts`,
`credentials.ts`, `catalogue.ts`, `http.ts`, `store.ts`, `logBus.ts`, `stats.ts` **[V]**.

`src/renderer/components/scraper/featureStatus.ts` is the most valuable artifact in the repo
for this migration — a re-derived, honest maturity registry **[V, read in full]**:

- **ready (verified live):** discover, new-scrape, history, sources, torrents (68 real nyaa.si
  releases parsed), scheduled (real cron, restart-verified), site-rules (28 episodes matched
  from a real page), plugins, results, selector-tester, regex-tester, http-inspector; result
  tabs episodes/details/metadata/logs/torrents; settings groups sources/torrent/episodes/
  validation/developer; all four shell chrome entries.
- **untested (implemented, not exercised end-to-end):** dashboard, profiles, downloads
  (qBittorrent transfer list — unit-tested only), exports (save dialog never clicked),
  result.images, settings qbittorrent/logging/export/profiles.
- **shell (nothing behind it):** `page.script-console`, `result.streams` ("the engine emits no
  stream rows: resolving playable streams is out of scope"), and settings groups network,
  browser, antibot, extraction, images, metadata, cache, performance, scheduler,
  notifications, ui.

**[I] This registry is the single best input to the parity ledger and must survive the
migration verbatim in spirit.** It already answers "what is real" for ~60 features. Any
Seanime adoption that quietly promotes a `shell` entry to `ready` because Seanime has a
similarly-named screen is exactly the failure mode your brief forbids.

**[V] Notable gap that Seanime directly fills:** `result.streams` is a shell because "resolving
playable streams is out of scope". Seanime's `onlinestream` + `extension` + `torrentstream` +
`debrid` packages are exactly that capability.

### Study Mode / mining / Anki

`src/.coordination/study-mode/CURRENT_STATE.md` (last updated 2026-07-27, base commit matches
HEAD) is unusually strong evidence **[V]**:

- Authoritative versioned main-process document, atomic replace, one-time legacy migration.
- Deterministic N5/N4/recurrence/known-word/duplicate/Anki-maturity/proper-name/max-card filters.
- Persistent transcription queue with a real queued→extracting→transcribing→aligning→done
  lifecycle.
- Typed AI operations executing the *same* Study APIs as the UI.
- Restart-safe media, subtitle identity, timestamp, filters, selection, pipeline, export state.
- **Validation:** 247 files / 2,735 tests passed; renderer prod Vite build passed; live MCP
  smoke including a real Kitsunekko subtitle download (267 cues, SHA-256 recorded), 253 lines →
  370 candidates → 30 selected, a 550,408-entry JPDB frequency dictionary ranking 345/370,
  N1–N5 decks imported and restart-verified, and a vocabulary row reopening the player at
  **53.267 s** with all 267 lines loaded.
- **Stated limitation:** "Live AnkiConnect was not available and no external Anki write was
  attempted."

`src/main/anki/` is a typed AnkiConnect transport (`client.ts` with a compile-time
`AnkiActionMap`), plus `apkgImport.ts`, `fieldMapper.ts`, `forecast.ts`, `intervals.ts`,
`noteTypes.ts`, and 12+ `ipcMain.handle('anki:…')` channels **[V]**.

**[I] Conclusion that shapes the entire plan: the study half of your product is the verified
half, and Seanime has no equivalent for any of it.** It must not move. Seanime should be
plugged *underneath* it, never through it.

### Reading (Manga / EPUB / Novels)

`views/MangaReader.tsx` 1,933 lines, `views/NovelReader.tsx` 2,858 lines, plus
`components/manga/`, `components/novels/`, `components/reading/`, `src/main/mangaOcr.ts`,
`bookEpub.ts`, `bookOcrJob.ts`, `epubMeta.ts`, `pdfRasterize.ts`, `paddleOcr.ts`,
`readingLens.ts`, `jiten.ts` **[V]**. Internals not audited this session **[U]**.

---

## 4. Active-plan reconciliation — honest status

Your brief requires a ledger with **zero unaccounted requirements** across `TASKS.md`,
`docs/MASTER_PLAN.md`, `src/MEDIA_CENTER_REVAMP_AUDIT.md`, `src/PHASE_10_MEDIA_HUB_STATE.md`,
every other `src/PHASE_*_STATE.md`, the Scraper registries, and the five
`src/.coordination/study-mode/` documents.

**I did not produce that ledger in this session and will not claim I did.** I read four of
those sources in full or in part; there are at least 11 further `src/PHASE_*` documents,
`docs/MASTER_PLAN.md` (§§1–14, §16), `AGENTS.md`, `PROJECT.md`, and four more study-mode
coordination files outstanding. Producing a defensible row-per-requirement ledger across them
is itself a bounded work item, not a by-product of an architecture session.

**[R] It becomes Phase 0 deliverable P0-6**, with this row schema (one row per requirement):

```
req_id | source_doc§ | current_path | status(ready|untested|shell|planned|deferred|broken)
       | evidence(auto|runtime|visual) | user_value | acceptance_criteria
       | future_owner(MediaLibrary|Scraper|SharedPlatform|StudyMode|AI|Deferred)
       | future_ui_host | seanime_subsystem+commit_evidence
       | disposition(adopt|retain|merge|redesign|defer|retire-after-parity)
       | data_migration | phase | visual_prototype_required
       | tests | runtime_proof | rollback | retirement_gate | conflicts_with
```

What I *can* state now with evidence:

| Source | Discovered this session | Mapped | Unaccounted |
|---|---:|---:|---:|
| `scraper/featureStatus.ts` | 60 registered ids | 60 (dispositions in §8) | 0 |
| `study-mode/CURRENT_STATE.md` "What works now" | 22 capability claims | 22 (all → **Retain Study OS**) | 0 |
| `MEDIA_CENTER_REVAMP_AUDIT.md` Phase-1 table | 8 areas × (done / partial) | 8 (dispositions in §8) | 0 |
| `TASKS.md` | headings only | — | **not counted** |
| `docs/MASTER_PLAN.md`, 11 × `PHASE_*` | — | — | **not read** |

Reported unaccounted count is therefore **not yet zero**, and the architecture recommendation
below is deliberately structured so that it does not *depend* on the unread documents: it
changes ownership of media plumbing only, and freezes everything study-side in place.

---

## 5. Seanime capability map — and the three findings that change the plan

### Shape (all **[V]** at `9bdd052…`)

```
seanime/
  main.go, go.mod                     Go server entry
  internal/  (60 packages)            anilist api continuity core cron customsource database
                                      debrid directstream events extension extension_playground
                                      extension_repo goja handlers hook library library_explorer
                                      local manga matroska mediacore mediaplayers mediastream
                                      mkvparser mpvcore nakama nativeplayer notification
                                      onlinestream pgs platforms player playlist plugin
                                      torrent_clients torrents torrentstream updater user
                                      vendor_habari videocore …
  seanime-web/                        React 19 + rsbuild + TanStack Router + Tailwind + Radix
    src/api/{client,generated,hooks}  GENERATED typed client
    src/app/(main)/                   discover entry lists manga onlinestream mediastream
                                      torrent-client torrent-list auto-downloader debrid
                                      extensions custom-sources schedule search settings sync
                                      mal medialinks nakama qbittorrent webview scan-summaries
    src/app/(main)/_features/         video-core  native-player  mpv-core  media-core
                                      anime-library progress-tracking offline playlists
                                      library-watcher nakama plugin sea-command tour …
  seanime-denshi/                     Electron 42.4.0 desktop client
  mpv-prism.lock.json                 ← see B1
  codegen/                            go generate → TS types/hooks
```

- **188 registered HTTP routes** in `internal/handlers/routes.go` **[V]**. Largest groups:
  auto-downloader 15, mediastream 13, debrid 13, playback-manager 11, torrentstream 9,
  anime-entry 9, onlinestream 7, torrent-client 6.
- **Types are generated from Go handler doc-comments** into
  `seanime-web/api/generated/{types.ts,endpoint.types.ts,hooks_template.ts}` via
  `go generate ./codegen/main.go` **[V, DEVELOPMENT_AND_BUILD.md]**.
  **[I] This is the single most important integration asset**: a versioned, machine-generated
  TS contract means the Study OS renderer can consume the server without hand-written
  adapters, and an upstream bump surfaces as TypeScript errors rather than runtime surprises.
- Stack: Echo, GORM + SQLite (glebarez), Goja JS plugin runtime, **Habari** filename parser,
  anacrolix/torrent, forked matroska-go **[V]**.
- `internal/local/` (`sync.go`, `diff.go`, `manager.go`, `database_models.go`) = real offline /
  local-account support **[V]** — you are not forced into a permanent AniList dependency for
  local library use, though AniList remains the catalogue identity backbone **[I]**.

### Finding B1 — the polished player is NOT freely embeddable *(highest-impact discovery)*

`mpv-prism.lock.json` at the repo root pins **prebuilt binary packages hosted on
`seanime.app`**, not npm, not in the GPL source tree **[V]**:

```json
{ "version": "0.1.8", "electronVersion": "42.4.0",
  "packages": { "@mpv-prism/core"|"react"|"electron":
     "https://seanime.app/assets/mpv-prism/0.1.8/packages/…tgz  + sha256" },
  "native": { "win32-x64": "https://seanime.app/assets/mpv-prism/0.1.8/native/win32-x64.tar.gz" } }
```

`seanime-denshi/package.json` then does **[V]**:

```json
"electronDownload": { "mirror": "https://seanime.app/assets/electron/", "customDir": "v42.4.0" }
```

and `DEVELOPMENT_AND_BUILD.md` states it outright **[V]**:

> "Seanime Denshi: Built with a custom Electron/Chromium to support more codecs"

**[I] Consequences, and they are decisive:**
1. "Seanime is an Electron app too, so it's easier" is **half true**. The *shell* is Electron;
   the *player that makes it feel premium* requires a **custom Chromium build** plus
   **closed-distribution native tarballs** whose license is not stated in the repo **[U]**.
2. You cannot host Denshi's player inside Study OS's stock `electron@^42.3.0` **[V, package.json]**.
   Study OS would have to migrate to Seanime's custom Electron mirror — inheriting a
   third-party's Electron build for your entire product, including your dictionary, OCR and
   Anki stack. **[R] Do not do this.**
3. **The plan therefore adopts `video-core`, not `mpv-core`/`native-player`.**

### Finding B2 — `video-core` is genuinely enough

`seanime-web/src/app/(main)/_features/video-core/` contains 40 modules **[V]**, including
`video-core-subtitles.ts`, `video-core-pgs-renderer.ts`, `video-core-subtitle-menu.tsx`,
`video-core-audio-menu.tsx`, `video-core-screenshot.ts` + `screenshot-prompt.tsx`,
`video-core-preview.ts`, `video-core-playlist.tsx`, `video-core-pip.ts`,
`video-core-media-session.ts`, `video-core-hls.ts`, `video-core-anime-4k*.ts`,
`video-core-stats.tsx`, `video-core-time-range.tsx`, `video-core-control-bar.tsx`,
`video-core-mobile-gestures.ts`, `video-core-cast.tsx`, `video-core-watch-party-chat.tsx`.
`media-core/` supplies shared chapters, control bar, drawer, menu, overlays, preferences.

**[I]** SSA/ASS + PGS + track menus + screenshots + preview scrubbing + playlist + PiP in plain
Chromium — a strict superset of Study OS's `<video>` chrome, minus the study controls, which
you already own. Combined with the server's `mediastream`(13 routes) / `directstream`(4) /
transcoding, format coverage is handled server-side rather than by a custom Chromium.
**[U] Not verified:** how `video-core` exposes cue timing to external consumers.

### Finding B3 — Seanime has no i18n and will not have one

README, "Not planned" section **[V]**: *"Built-in localization (translations)"*.
Also **[V]** *"Built-in support for other trackers such as MyAnimeList, Trakt, SIMKL"*.
`internal/handlers/mal.go` exposes only `HandleMALAuth`, `HandleEditMALListEntryProgress`,
`HandleMALLogout` **[V]** — thin, and unlikely to deepen.

**[I]** Two consequences:
- **i18n is a real, quantified adoption cost.** `CLAUDE.md` makes EN/JA/ZH/RU a *hard test
  gate* (`src/shared/__tests__/i18n.test.ts` fails on any en-only key). Every adopted Seanime
  surface arrives English-only. Either the gate is scoped to exclude the adopted Media
  workspace during migration (temporary, named, time-bounded regression per §12 of your brief),
  or each adopted surface is swept before it ships. **This is a user decision — see D3.**
- **MAL stays yours.** Your existing MAL/Jikan discovery and any future authenticated MAL sync
  are *not* being replaced by Seanime and never will be. Correctly deferred, and correctly
  owned by the Study OS shared platform.

### Finding B4 — licensing

- Study OS `package.json`: `"license": "MIT"`, `"private": true` **[V]**.
- Seanime at `9bdd052…`: **GPL-3.0** **[V]**.

**[I], not legal advice:**
- **Sidecar over documented HTTP** (Phase 1–2) is the conventional *separate-program* posture:
  you ship/run an unmodified pinned binary and talk to its API. Weakest coupling, cleanest story.
- **Adopting `seanime-web` source into your renderer** creates a combined derivative. On
  **distribution**, that combined work is GPL-3.0 and your MIT declaration becomes wrong.
- **GPL obligations attach on distribution, not private use.** A private repo used personally
  is materially different from shipping installers. **[U] Your actual distribution intent is
  not established** — this is decision **D1**.
- Names, logos, `docs/images/seanime-logo.png`, `s3.seanime.app` screenshots, fonts, and the
  `mpv-prism` binaries do **not** inherit the source license **[I]**. Never copy Seanime
  branding. `mpv-prism` was later confirmed as LGPL-3.0, but remains deferred because its
  native tarball supply chain and custom Chromium requirements do not fit ADR-002.
- **[R] Not a compliance guarantee.** If you intend to distribute, get a specialist review
  before Phase 2 begins.

### Finding B5 — Go becomes a build dependency

The web build must precede the Go server build **[V, DEVELOPMENT_AND_BUILD.md]**. The live
Phase-1 build later proved that `-tags=nosystray` succeeds with `CGO_ENABLED=0`; a C toolchain
is therefore not required for the adopted sidecar. Packaging must ship
`seanime.exe` as an Electron Forge `extraResource` **[R]**. This **supersedes** the CLAUDE.md
"changes stay inside `src/`" and "do not alter `forge.config`" rules — see §7.

---

## 6. Recommended target architecture

```
┌──────────────────────── Study OS Electron (stock electron ^42.3, contextIsolation) ─────────┐
│                                                                                             │
│  RENDERER                                                                                   │
│   Frutiger-Aero desktop shell · taskbar · window manager   (UNCHANGED, DesktopShell.tsx)     │
│   ├─ existing 44 app sections (dictionary, anki, grammar, reading, city …)  UNCHANGED        │
│   ├─ ▣ MEDIA workspace  ← adopted seanime-web source, restyled to Study tokens               │
│   │     discover · library · entry/episodes · schedule · playlists · settings                │
│   │     player = video-core  + ⟨Study Overlay⟩  (Study OS component, mounted as sibling)     │
│   └─ ▣ SCRAPER workspace ← existing app, re-based on shared source/job contracts             │
│                                                                                             │
│  PRELOAD  narrow typed bridge (existing pattern, src/preload.ts)                             │
│                                                                                             │
│  MAIN                                                                                        │
│   ├─ seanimeSupervisor.ts  [NEW]  spawn/health/port/token/shutdown/crash-restart             │
│   ├─ identityBridge.ts     [NEW]  AniList id ⇄ MAL id ⇄ Study OS mediaId                     │
│   ├─ studyBridge.ts        [NEW]  player cue → mining pipeline (ONE direction, typed)        │
│   ├─ anki/* dictionary/* mangaOcr bookEpub readingLens mining translate …   UNCHANGED        │
│   └─ scraper/*  (engine, sources, torrents, qbittorrent, scheduler, siteRules)  RETAINED     │
└──────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                       │ HTTP 127.0.0.1:<ephemeral> + WS, generated TS types
                                       │ loopback-only, token-authed, no external bind
┌──────────────────────────────────────▼──────────────────────────────────────────────────────┐
│  seanime.exe  (pinned 9bdd052… + tracked upstreamable patches, isolated Study OS datadir)    │
│  scanner(Habari) · AniList · library · entries · episodes · progress · schedule · playlists  │
│  extensions(Goja) · onlinestream · torrents · torrentstream · debrid · auto-downloader       │
│  mediastream/transcode · directstream · manga · local(offline sync) · SQLite(GORM)           │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Canonical identity — the rule that prevents split-brain

`Study OS mediaId` stays the **primary key for everything study-side** (mined sentences, cards,
Anki mappings, difficulty, readiness, OCR regions, reading progress). Seanime's **AniList media
id + local file id** become **external identity columns** on it, resolved once by
`identityBridge.ts` and stored, never re-derived from titles.

```
StudyMediaId  ─1:1─ { anilistId?, malId?, seanimeLocalFileId?, path, contentHash }
Episode       ─1:1─ { studyEpisodeId, anilistId+episodeNumber, seanimeLocalFileId }
SubtitleTrack ─ owned by Study OS (discovery/records already exist) ─ referenced by cue time
Card/Note     ─ owned by Study OS/Anki ─ provenance → { studyEpisodeId, cueIndex, tMs }
```

**No episode gets a second permanent identity.** Seanime ids are foreign keys, one direction.
Rollback = drop the external-id columns; nothing study-side is lost. **[R]**

### Player and the single clock

`video-core` owns the `<video>` element, the playback clock, tracks, seeking, fullscreen, PiP
and screenshots. The Study Overlay is a **sibling React component reading video-core state**,
never a second timeline. Concretely, the Overlay needs from `video-core`:

`currentTimeMs` · `activeCue{index,startMs,endMs,text}` · `subtitleTrackId` ·
`seekTo(ms)` · `pause()/play()` · `screenshot()` · `audioSlice(startMs,endMs)` ·
`offsetMs` (settable) · `onCueChange`, `onTrackChange`, `onEnded`.

**[U] Whether video-core already exposes these is the Phase-1 probe.** If it does not, the
contract is added as a small, upstream-friendly extension (`video-core` already emits events
via `video-core-events.ts` **[V]**), *not* by cloning the player.

Audio-clip capture and screenshot **[I]** may need to stay Electron-main-side (ffmpeg-static is
already a dependency **[V]**) so that captures are frame-exact against the source file rather
than the rendered canvas — decided in Phase 3, not assumed now.

---

## 7. Repository guidance: what changes

| Current CLAUDE.md rule | Verdict | Why |
|---|---|---|
| Changes stay inside `src/` | **Superseded** | Sidecar needs `forge.config.ts` `extraResource`, a `seanime/` vendor dir, and build scripts. Cost: root config becomes migration-owned; mitigate with a single `tools/seanime-*.cjs` entry point. |
| Don't alter `forge.config.*`, `vite.*.config.*`, `tsconfig.json` | **Superseded, narrowly** | Only `forge.config.ts` (packaging) and one Vite alias for the adopted UI. `tsconfig.json` unchanged unless the adopted source needs `paths`. |
| Desktop grid / dragging layer / taskbar are protected | **Retained, hard constraint** | The Media workspace is a *section inside* the shell. `DesktopShell.tsx` must not be restructured. |
| Heavy data async / virtualized | **Retained, strengthened** | Seanime's Discover is poster-dense; virtualization is now non-optional. |
| Windows 11 Fluent, dark deep-red accent | **Retained, extended** | Seanime ships its own theme system (`internal/handlers/theme.go`, `_features/custom-ui` **[V]**). **[R]** Map Seanime's Tailwind tokens onto Study OS CSS variables so the Media workspace reads as the same product, and keep the Blanc/macOS neutral surface separate as today. |
| No decorative emoji | **Retained** | Applies to adopted source too — a sweep item. |
| EN/JA/ZH/RU i18n hard gate | **Conflicted — decision D3** | Seanime is English-only by policy (B3). |

---

## 8. Disposition matrix (evidence-backed, not exhaustive — see §4)

| Capability | Study OS today | Seanime at `9bdd052…` | Disposition | Gate |
|---|---|---|---|---|
| Library scan / filename match | manual import, watch folders, identity parsing **[L]** | Habari parser, "no strict naming" scanner, scan-summaries **[V]** | **Adopt Seanime** | side-by-side scan of your real library; ≥ parity on match rate |
| Discover | Jikan/AniList feed + shortlist **[L]** | full filter matrix, poster grid **[V]** | **Adopt Seanime, extend with Study badges** (JLPT fit, subtitle availability, readiness) | screenshot parity: default / filtered / empty / offline / compact |
| Episode / entry pages | `MediaDetailPanel.tsx`, `MediaEpisodeRow.tsx` **[V]** | `(main)/entry`, 9 anime-entry routes **[V]** | **Adopt Seanime, add Study rail** | Study actions present on every episode row |
| Playback engine | HTML5 `<video>` **[V]** | `video-core` **[V]** / `mpv-core` (blocked, B1) | **Adopt `video-core`; defer mpv-prism** | player proof, §9 G-PLAY |
| Study controls (auto-pause, A–B, dual subs, furigana, dictation, shadowing, Whisper) | verified in `MediaContent.tsx` **[V]** | none | **Retain Study OS — port onto video-core** | every control works on the new player before old retires |
| Subtitle discovery/records/offsets | `subtitleDiscovery.ts`, `subtitleLocalSources.ts`, `subtitleProviderClients.ts`, live Kitsunekko proof **[V]** | track selection only | **Retain Study OS** | — |
| Mining → card → Anki | typed pipeline, 2,735 tests, restart-safe **[V]** | none | **Retain Study OS, untouched** | AnkiConnect live write (still open **[V]**) |
| Study Mode / readiness / difficulty | verified orchestrator **[V]** | none | **Retain Study OS** | — |
| Streams / online sources | `result.streams` = **shell** **[V]** | onlinestream + extensions **[V]** | **Adopt Seanime** — fills a real hole | a real stream plays and can be mined |
| Torrent search | nyaa.si, 68 real releases **[V, ready]** | extension-based providers, 6+9 routes **[V]** | **Merge** — Seanime contracts, keep your parser + ranking where measured better | release-parser fixture suite must reject year/res/codec/CRC false positives |
| qBittorrent | implemented, **untested** **[V]** | qBittorrent/Transmission/Torbox/RD/AD/Premiumize **[V]** | **Adopt Seanime** | live client run |
| Auto-download / scheduling | `scheduler.ts`, `page.scheduled` **ready, restart-verified** **[V]** | 15 auto-downloader routes **[V]** | **Merge** — Seanime engine, keep your cron UI + run history | scheduled run survives restart on new backend |
| Site Rules / selector / regex / HTTP inspector | **ready, live-verified** **[V]** | no equivalent | **Retain Study OS** | — |
| Script console | **shell** **[V]** | Goja plugin runtime + `extension_playground` **[V]** | **Redesign onto Seanime's sandbox** | never promote above `shell` until it executes safely |
| Manga reader | 1,933-line reader + OCR + regions **[V, internals unaudited]** | `internal/manga` + reader **[V]** | **Merge** — Seanime catalogue/sources/chapters, Study OS reader | both Reading vertical slices |
| EPUB / novels | 2,858-line reader + mining + Jiten **[V]** | none | **Retain Study OS** | — |
| MAL / Jikan | yours **[L]** | 3 thin handlers, explicitly not planned **[V]** | **Retain Study OS; deeper sync deferred** | — |
| Offline mode | partial **[L]** | `internal/local` sync/diff **[V]** | **Adopt Seanime** | airplane-mode run |
| i18n EN/JA/ZH/RU | hard gate **[V]** | none, by policy **[V]** | **Retain Study OS — decision D3** | — |
| Desktop shell / taskbar / dragging | protected **[V]** | Denshi lifecycle | **Retain Study OS** | — |

---

## 9. Phased roadmap

Sizes are relative (`S`/`M`/`L`/`XL`). No calendar estimates.

### Phase 0 — Preserve and establish truth · `M` · **prerequisite for everything**

With 505 dirty entries **[V]**, this is not optional.

1. `git bundle create` of all reachable history + `git rev-parse` record of branch/commit/remotes.
2. **Separate** staged and unstaged patches (`git diff --cached` / `git diff`).
3. Untracked manifest (`git ls-files --others --exclude-standard`) + archive of the 347
   untracked files, **excluding** secrets, credentials, personal Anki data, private media,
   `node_modules`, `dist`, `out`, `.vite`, `debug/`.
4. SHA-256 for every backup artifact + written restore instructions.
5. Record Node / npm / Electron / Go / TypeScript / Vite versions and lockfile hashes.
6. **P0-6: the reconciliation ledger** of §4 — read the 15 unread plan documents and fill one
   row per requirement. *This is the gate that makes "zero unaccounted" true.*
7. Baseline runs: `npm run lint`, `npx tsc --noEmit`, `npm test` — classify pass / fail / flaky /
   **pre-existing failure** (CURRENT_STATE.md already warns of broad repo-wide `tsc`
   diagnostics outside the Study core **[V]**).
8. **Visual baseline**: screenshot every important surface via the `jp-app` MCP
   (`app_screenshot`, `app_dom`) — Media Center, Video player + study controls, Scraper
   dashboard/torrents/site-rules, Study Mode workspace, Manga reader, Novel reader, Anki.
   Label each: build, route, window size, theme, runtime-vs-static.
9. Pin Seanime: clone at `9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9` **into a sibling directory
   outside this repo**; record `upstream-seanime.json`.
10. **P0-10 — publishability audit (added by D1).** License every runtime dependency; classify
    every tracked data file for redistributability (starting with `tools/_mazii_n*.json`);
    confirm no dictionary, deck, subtitle, frequency-list or media asset is tracked or ever
    becomes tracked; extend `.gitignore` accordingly. Output → `LICENSING_PLAN.md`.
11. **P0-11 — history hygiene (added by D1).** `git fsck` + reachability check on the 460 MiB
    pack; confirm the three large blobs are unreachable; clean the 14 `tmp_obj_*` garbage
    objects. **Read-only inspection first; no history rewrite without a separate decision.**

**Continuity records** — `docs/migration/` as your brief proposes, but trimmed to what has an
operational use: `CURRENT_STATE.md`, `FEATURE_PARITY_LEDGER.md`, `SEANIME_CAPABILITY_MAP.md`,
`DATA_MIGRATION_MAP.md`, `ARCHITECTURE_DECISIONS.md`, `LICENSING_PLAN.md`, `RISK_REGISTER.md`,
`TEST_EVIDENCE.md`, `NEXT_SESSION.md`, `upstream-seanime.json`, `progress.json`.
**[R] Drop `SESSION_LOG.md`, `ROADMAP.md`, `DEFERRED_REQUIREMENTS.md` as separate files** —
fold them into `ARCHITECTURE_DECISIONS.md` (append-only) and `progress.json`. Your existing
`src/.coordination/study-mode/` set already proves this format works; mirror its style.

**Rollback:** nothing changed. **Risk:** the backup itself leaks secrets — mitigate with an
explicit exclude list reviewed before archiving.

### Phase 1 — Architecture proof (read-only sidecar) · `S` · **go/no-go**

Smallest falsifiable slice. **Touches no Study OS user data.**

Build the pinned Seanime server once in the sibling checkout (`go build`, `CGO_ENABLED=1`).
Then, behind a dev-only flag:

1. `seanimeSupervisor.ts` spawns it with `--datadir=<temp isolated dir>`, ephemeral loopback
   port, auth token, no external bind.
2. Health-poll `/api/v1/status` until ready; surface an explicit **offline / failed-to-start**
   state, not a spinner.
3. Call **three** endpoints through Seanime's generated types: status, an anime collection
   read, and one entry read.
4. Render one poster grid in a throwaway route inside the existing shell.
5. **Probe the player contract** (the real unknown): load `video-core` in the renderer against
   one local file and log whether cue-level timing, track ids and a screenshot hook are
   reachable from outside the component.
6. Kill the process on app quit and on crash; verify no orphan, no port leak.

**Acceptance:** real posters from a real scan; identity mapping shown for one title
(`anilistId ⇄ path`); offline state proven by killing the server mid-session; **`git status`
diff of the Study OS data directory is empty**; uninstall = delete temp datadir + revert one
flag.

**GO/NO-GO gate G-1** — proceed to Phase 2 only if: process lifecycle is clean on Windows,
generated types compile against your TS 5.2 **[U — Seanime web uses a newer TS; version skew
must be checked]**, and the player probe shows either a usable contract or a small, clearly
scoped extension point. **Fallback if the player probe fails:** keep the existing `<video>`
study player for Phase 2–3 and adopt Seanime for library/discover/sources only; re-open the
player decision in Phase 5.

### Phase 2 — Media shell on real data · `L`

Adopt `discover`, `lists`/library, `entry`/episodes, `schedule`, `playlists` from
`seanime-web` into a `MEDIA` workspace section. Restyle to Study tokens. Wire Study extension
points (difficulty badge, readiness pill, "Prepare to Study", "Mine") as *slots*, not forks.
Keep the old Media Center reachable behind a flag — **nothing retires yet**.
**Acceptance:** real library, real posters, filters, loading/empty/error/offline, virtualized
at ≥1,000 items, window dragging stays responsive, keyboard + focus parity, screenshots at
normal and compact widths.

### Phase 3 — Player + Study Overlay · `XL` · **the phase that decides the product** ← your priority

Port every verified study control from `MediaContent.tsx` onto `video-core`: click-lookup,
optional pause-on-lookup, sentence/token selection, dictionary, furigana, translation, line
replay, subtitle offset, A–B loop, frame step, speed, dual subs, dictation, shadowing, Whisper
generation, screenshot, audio clip, editable card preview, one-action mining, duplicate
warning, undo, Anki destination, mining history, and full provenance
(cue → episode → media → assets → card draft → exported note).

**Acceptance path (must all pass in one run):** play a representative local file → select audio
and subtitle tracks incl. SSA/ASS → mine a real Japanese cue → screenshot + audio clip attach →
card preview → **export through live AnkiConnect** (the one gap CURRENT_STATE.md still lists
open **[V]**) → restart → resume position and mining history intact.
**Gate G-PLAY:** old player retires only after this passes *and* a visual comparison shows no
regression. **Gate G-VIS:** annotated wireframes for the combined player approved before
implementation.

### Phase 4 — Scraper on shared contracts · `L`

Re-base `src/main/scraper/` on the shared source/job/download contracts: adopt Seanime's
provider extensions, torrent clients, debrid, auto-downloader engine, and **fill
`result.streams`** (today a shell **[V]**). Retain Site Rules, selector/regex/HTTP tooling, the
maturity registry, run history and diagnostics. Generalize by content type so a Manga
acquisition mode is additive, not a second app.
**Acceptance:** every `ready` entry in `featureStatus.ts` is still `ready` on the new backend,
re-verified live, and no entry is promoted without a recorded run.

### Phase 5 — Reading convergence (Manga/EPUB/PDF) · `XL`
Canonical `ReadingWork` / `ReadingEdition` / volume / chapter / page-or-location model; Study OS
readers kept, Seanime manga catalogue/sources/chapters adopted; both vertical slices from your
brief as the gate.

### Phase 6 — Study Mode over the unified library · `M`
Readiness and difficulty filters across the *Seanime* library; preparation queues; subtitle and
Anki health; watch-to-review loop. Deterministic first, AI second.

### Phase 7 — AI capabilities · `M`
Typed capability registry over the same services; preview/confirm/cancel/audit; authorization
computed outside the model; no prompt-granted capability.

### Phase 8 — Deferred, in this order
Authenticated MAL sync → secure browser/overlay host → YouTube ~~& Avant-Garde~~ discovery →
Chrome-extension parity → (only if ever justified) mpv-prism/native player as an *external
player profile*.

> **"& Avant-Garde" struck 2026-08-03 — it was never a feature.** Investigated by slice 71 and
> verified independently:
> - **"Avant Garde" is a MyAnimeList genre** (MAL's 2022 rename of "Dementia"), and this repo
>   *already implements it as data*: `src/shared/mediaDiscovery.ts:164` scores it `'avant garde': 3.2`
>   in `GENRE_DIFFICULTY`, sitting among `romance`, `school`, `sports`, `gourmet`, `kids`,
>   `adventure`, `action`, `fantasy`. It arrives as a `genres[]` string from Jikan and votes in
>   `estimateDifficulty`.
> - It appears **nowhere in the pinned Seanime upstream** (`9bdd052`) — grepped directly.
> - Of its five occurrences in this repo, **four are this one sentence quoting itself**; the fifth
>   is the genre weight above.
> - `FEATURE_PARITY_LEDGER.md:106-110` is the authoritative deferred list, and every other Phase 8
>   item traces to a ledger row. **This one traces to nothing.**
>
> Phase 8 item 3 is therefore **YouTube discovery**, full stop. Left struck rather than deleted so
> the next reader sees the question was asked and answered instead of asking it again.

### Phase 9 — Hardening and retirement
CSP, dependency+license audit, accessibility, interrupted-migration and interrupted-download
tests, large-library and offline tests, Windows packaging with the sidecar, clean-machine
smoke, upgrade from representative old data, **upstream-sync rehearsal** against a newer
Seanime commit with conflicts documented.

---

## 10. Risk register

| Risk | P | Impact | Early warning | Mitigation | Fallback |
|---|---|---|---|---|---|
| `video-core` won't expose a usable cue timeline | **M** | **High** — Phase 3 becomes a port, not an adoption | Phase-1 probe step 5 | Add a narrow event contract upstream-style; ffmpeg-side capture | Keep `<video>` player; adopt Seanime for library/sources only |
| Sidecar lifecycle on Windows (orphans, ports, AV false-positives) | **M** | High | Phase-1 kill test | Ephemeral port, token, PID file, kill-on-quit + on-crash | Manual "start media server" toggle |
| GPL/MIT if you ever distribute | **M** | **High** | — | Sidecar-only until D1 is answered; `LICENSING_PLAN.md` from day one | Keep UI adoption out; API-only integration |
| i18n regression on adopted surfaces | **H** | Medium | i18n test fails | Scope the gate, name the debt, time-box the sweep | Ship Media workspace English-only, flagged |
| Upstream churn (one-person project, active) | **H** | Medium | Generated-type diffs | Pin hard; bump deliberately; regenerate types as the diff | Freeze at a known-good commit |
| Dirty tree (505 entries) lost | **L** | **Critical** | — | Phase 0 before anything | Bundle + patches + untracked archive |
| Two identity systems drift | **M** | High | Duplicate titles in Study Mode | External-id columns only, one direction | Drop columns; study data unaffected |
| Study Mode regressions from library re-plumbing | **M** | **High** | 2,735-test suite | Freeze study services; bridge only | Revert the bridge, not the study code |
| `mpv-prism` license unknown | **M** | Medium | — | Don't ship it | video-core only |
| Scope collapse (the ledger never gets written) | **H** | High | Phase 2 starts before P0-6 | Make P0-6 a hard gate | Narrow to Media+Player only, defer Scraper/Reading |

---

## 11. User decision gates — RESOLVED 2026-07-27

All five answered by the user. Recorded here; to be copied verbatim into
`docs/migration/ARCHITECTURE_DECISIONS.md` as ADR-001..005 in Phase 0.

**D1 — Licensing / distribution → GPL-3.0 for the whole work. ACCEPTED.**
User elects to open-source under the same license as Seanime, making distribution intent moot
as a *permission* question. Consequences that remain real and are now migration work items:
- GPL-3.0 covers the **entire** app, not the media half — dictionary, OCR, Anki, reading, city,
  shell. One-way door: closing it later requires rewriting the Seanime-derived parts.
- **Code dependencies look compatible** — all 17 runtime deps are permissive
  (MIT / Apache-2.0 / BSD / ISC family), which is one-way compatible with GPLv3 **[U — must be
  confirmed by an actual license audit in Phase 0, not asserted]**. `ffmpeg-static` gets
  *cleaner* under GPL: it ships GPL FFmpeg builds, which is the awkward direction for an MIT
  app and the correct direction for a GPL one.
- **The real exposure is data, not code.** `tools/_mazii_n1.json`…`_n4.json` are tracked
  (~243 KB total) and Mazii is a commercial dictionary product **[V, tracked files]** —
  redistributability **[U]**. Beyond the repo: JMdict (CC BY-SA — attribution + share-alike),
  the 550,408-entry JPDB frequency dictionary, imported N1–N5 Anki decks, downloaded
  Kitsunekko subtitles. **None of that may enter a public repository.** → Phase-0 item **P0-10**.
- **Repo hygiene before going public**: pack is 460.23 MiB with 1,016 loose objects, but the
  three largest blobs (230.7 MB, 76.3 MB, 9.7 MB) are **unreachable from any ref** — aborted-commit
  leftovers, alongside 14 `tmp_obj_*` garbage files in `.git/objects` **[V]**. A fresh clone
  would not carry them, but confirm with `git fsck` before publishing → Phase-0 item **P0-11**.
- Seanime's name, logo (`docs/images/seanime-logo.png`) and screenshots do **not** inherit the
  code license — never ship them. For the sidecar, point at the pinned upstream commit; if you
  ever modify the Go server, your fork's source must be published too.
- **[R] Sequencing:** record GPL-3.0 as the decision now, but **flip the actual `LICENSE` /
  `package.json` declaration at the moment the first Seanime-derived file lands in `src/`**
  (start of Phase 2). Phases 0–1 are sidecar-only and need no flip, so the option stays open
  through gate G-1 and the provenance record stays exact.
- **[R] Not a compliance guarantee.** A dependency + bundled-data license audit is Phase-0 work.

**D2 — Player → adopt `video-core`, defer mpv-prism. ACCEPTED.**
Stock `electron@^42.3.0` is retained. Codec coverage comes from the server's
`mediastream`/`directstream` transcoding rather than a custom Chromium. External-player
profiles remain a later option.

**D3 — i18n → option (b). ACCEPTED.**
Media workspace ships English-only during Phases 2–3 behind a **named, time-boxed exemption**
recorded in `RISK_REGISTER.md` and visible in `CURRENT_STATE.md`; the EN/JA/ZH/RU sweep of all
adopted surfaces is a **hard exit gate on Phase 4**. Per §12, this regression must never be
described as complete while open. The i18n test gate is scoped — not weakened — by an explicit
allowlist of adopted-surface files, which shrinks to empty at the Phase-4 gate.

**D4 — Root-config supersession. APPROVED.**
`forge.config.ts` (sidecar `extraResource`), one Vite alias, `tools/seanime-*.cjs`, and a
pinned vendored Seanime checkout. CLAUDE.md's `src/`-only and protected-root-config rules are
amended by ADR-004. The desktop grid, dragging layer and taskbar remain hard-protected.

**D5 — Phase-0 depth. APPROVED.**
P0-6 (read the 15 unread plan documents, write the requirement-level reconciliation ledger)
runs before any Phase-2 code. This is what makes "zero unaccounted requirements" a fact.

---

## 12. Continuity, MCP evidence, quality ratchet

**Source-of-truth order:** repository code → approved decisions + parity ledger → exact test and
visual evidence → `CURRENT_STATE.md` + `progress.json` → `NEXT_SESSION.md` → append-only
history → chat (non-authoritative).

**MCP inventory available in this environment [V]:** `jp-app` (`app_screenshot`, `app_dom`,
`app_eval`, `app_click`, `app_type`, `app_key`, `app_logs`, `app_reload`, `app_health`) —
the primary tool for reproducible Electron runtime + visual evidence; `GitKraken` (git/PR
inspection); `Claude_Browser` / `claude-in-chrome` (web-side inspection); `computer-use`
(desktop). Every visual claim must record tool, build, route, steps, window size, scale, theme,
and screenshot path. **MCP availability is not evidence** — a blocked capture is recorded as
blocked.

**Quality ratchet.** Per migration-critical feature, record: existing verified behaviour that
must not regress · approved target · automated evidence · runtime evidence · visual evidence ·
a11y/keyboard/i18n/responsive evidence · performance budget · rollback. A later session may
raise the bar; it may not delete a requirement, relabel fixture evidence as live, accept an
unexplained visual regression, or retire a path without a recorded user-approved decision.
Temporary regressions must be named, isolated, time-boxed, rollback-covered, visible in
`CURRENT_STATE.md` + `RISK_REGISTER.md`, and never described as complete.

---

## 13. Next safe action

**Stop here and approve, or revise.** Nothing has been created, installed, built, launched or
committed. On approval the first action is **Phase 0** — snapshot the 505-entry dirty tree,
baseline the toolchain, capture the visual baseline through the `jp-app` MCP, pin the Seanime
checkout in a sibling directory, and write the P0-6 reconciliation ledger. No Study OS source
file is modified in Phase 0.
