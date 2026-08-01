# Migration current state

> **2026-08-01 (slice 34) — THE ANALYSE ROW ACTION IS WIRED AND HAS BEEN PRESSED.** Phase 6's
> `Next slice` item 1, carried since slice 3, is closed — and slice 4's *verified* reason for
> deferring it had gone stale: **`preload.ts:1275` exposes `studyPrepare`** and
> `renderer/mediaStudyOrchestrator.ts:255` exposes `prepareStudyMediaById(mediaId,
> subtitleRecordId)`, whose two ids the entry already carries. *A verified reason has a shelf
> life.* What survives is that the `study:prepare` **handler** is in the untracked
> `main/mediaStudyOrchestrator.ts`, so the capability is **offered, not reached for** —
> `onAnalyse` is an injected optional prop on the same terms `orchestrator` has had since
> slice 2, and the panel gains **no new import**. Offered on `unanalyzed`/`stale` only;
> `queued-transcription` is its own outcome, never "analysed"; the row deliberately does not
> transition, because readiness lives in the document this surface does not own. Pressed live
> in a real Chromium, three scenarios PASS; 4 mutants, all caught. Gates: vitest **333 /
> 3,834** (+7), `tsc` **288** with 0 in any changed file, ESLint 0, arch audit 0, i18n 0 at
> **6,358** keys. Evidence: `proof/analyse-action-20260801153334/`. **Production wiring is one
> prop** in `MediaWorkspaceHost.tsx:339` once that track commits.
>
> The harness reported FAIL on two of three scenarios first, and **the product was fine** — the
> expectations hardcoded the media item's title while the row renders the Seanime *collection*
> title. Second own-goal of that family in two slices: the measurement was wrong, not the thing
> measured.

> **2026-08-01 (slice 33) — THE LAST PIECE OF "OLD-PLAYER RETIREMENT" IS ANSWERED, AND THE
> ANSWER IS THAT MOST OF IT MUST NOT BE DELETED.** `MediaState` has **46** members nothing
> reads (not 49), and the test that matters is **provenance, not deadness**: **16** were
> members of the *committed* interface and lost their last reader — retirement debris, safe;
> **30** were added by the **1,267 uncommitted insertions** `MediaContent.tsx` carries against
> `HEAD` and are unread because **nothing has been wired to them yet**. A dead-surface
> measurement cannot tell *retired* from *not yet wired* — both read as zero readers — and
> deleting the second kind destroys work git cannot recover. The removal was executed in full
> and reverted byte-exactly; **`tsc` held at 288 and `vitest` at 333/3,827 the entire time**, so
> the gate stack cannot see the difference. Only `git show HEAD` can, and that check is now the
> last line the tool prints. `src/` is unchanged. Evidence:
> `proof/mediastate-surface-20260801151602/`; tool
> `docs/migration/tools/measure-mediastate-surface.mjs`.
>
> Secondary, and **not** a regression: the player-diagnostics feature is half-built. Two buttons
> in the **untracked** `MediaCenterView.tsx:1164-1165` run it and open it; nothing in 1,289 files
> renders the report. Neither the buttons nor the state exist at `HEAD`, so this is one
> unfinished in-flight feature rather than something slice 16's deletion broke.

> **2026-08-01 (slice 22) — SOMEBODY FINALLY PRESSED `R`.** `retirement-step3-harness.mjs`
> gained a phase G that drives the study shortcuts with **real key events** (CDP
> `Input.dispatchKeyEvent`) instead of clicking their buttons, and all seven phases PASS:
> `R → 6.620808`, `W → 2.059812`, `S → 6.565682` against the fixture's true cue starts 6.5 /
> 2.0 / 6.5, with an unbound control key producing no seek at all. That closes the item
> slices **19, 20 and 21 each re-recorded**. Evidence:
> `proof/video-shortcuts-live-20260801022019/slice-22.json`; run record in
> `proof/retirement-step3-20260731222019/`.
>
> Keys are sent **lowercase**, which is what a real unshifted press produces, while the
> catalog default is written `'R'` — so the phase passes only while slice 19's
> `effectiveKeys` normalization holds. If that regressed, phase G fails and the button phase
> keeps passing; that asymmetry is what let the original defect live.
>
> **The control found something.** The first run used `q`, which is absent from this app's
> catalog and *looked* free — and it seeked to 0, because `KeyQ` is bound in the **adopted
> player's own** `vc_defaultKeybindings`. Not a defect (`q` is not a Study OS binding), but a
> standing rule for anyone writing a harness here: *"absent from our catalog"* is not
> *"unbound"* in a window that also mounts a third-party player with its own keymap.

> **2026-08-01 (slice 21) — THE CUE TRANSPORT HAS BEEN PRESSED IN A RUNNING WINDOW.**
> `music-mining-harness.mjs` now runs **21 phases, all PASS**, closing slice 20's standing
> item ("no one has pressed prev/replay/next"). Prev/next/replay each land on the right cue
> start, both ends **clamp** instead of seeking off the sheet, and replay is **disabled** —
> and refuses the click — when no line is active. Evidence:
> `proof/music-cue-transport-live-20260801010650/slice-21.json`; run record in
> `proof/music-mining-live-20260801010650/`. Reproduce with
> `node docs/migration/tools/music-mining-harness.mjs`; it needs the Vite dev server on
> **5173**, and `npx vite --config vite.renderer.config.ts` is enough — `npm start` is not
> required.
>
> **The finding is about the tree, not the feature.** Another session was writing the same
> harness phase into the same file **at the same time** — ~330 lines appeared between this
> session reading it and editing it, and their own passing run is on disk five minutes
> earlier (`proof/music-mining-live-20260801010500/`). Their phases were kept byte-for-byte
> and this slice added only what they do not ask, using their helpers. Slice 20's lesson
> therefore gains a second half: the tree is not the record of what has been done, **and it
> is not stable while you work in it — re-read a file immediately before editing it.**
>
> The one assumption removed: the harness addressed the button row positionally
> (`[0]/[1]/[2]`), which fails *silently* under a reorder. The buttons carry
> `music-cue-prev`/`-replay`/`-next` classes now, a phase asserts the rendered order **is**
> the named order, and a unit guard reads both the pane and the harness so a rename cannot
> die quietly between suite runs.

> **2026-07-31 (slice 18) — A MINED LYRIC CARRIES ITS AUDIO, and both music slices are
> PROVEN LIVE.** `recordCueAudio` moved out of `VideoCoreMiningPanel` (where it was typed to
> `HTMLVideoElement`) into `media/cueAudioCapture.ts` typed on `HTMLMediaElement`; video now
> calls the shared one. Audio is recorded for synced lyrics only, only in the leader window
> (`playerBus.getLeaderAudioElement()`), and a capture failure still mines the card.
> `docs/migration/tools/music-mining-harness.mjs` drives a real Electron window: **12 phases
> PASS**, including a 16,709-byte opus clip on the mined entry. Evidence:
> `proof/music-mining-live-20260731231500/`. Anki was not running, so the mine was recorded
> as a failure — the designed behaviour; only Anki's acceptance is untested live.
>
> **Harness trap, read before writing another one:** never put an Electron
> `--user-data-dir` inside the repo. Vite's watcher chokes on the locked Chromium
> `Cookies` file and **kills the dev server**. ~~`retirement-step3-harness.mjs` still has
> it.~~ **Wrong — corrected 2026-08-01.** That harness has never had this trap: its
> `workRoot` is `path.join(os.tmpdir(), ...)` and its `userDataDir` hangs off it. The claim
> was repeated in the harness's own header comment, which is probably where it came from;
> both were fixed on 2026-08-01, but this copy was missed until slice 21. The trap itself is
> real — only this attribution was not.

> **2026-07-31 (slice 17) — MUSIC CAN BE MINED.** Music was the one immersion surface you
> could not get a card out of: live lyrics, active-line highlight, LRC loading, word lookup,
> and zero mining. A Mine button on each lyric line now sends the line through **video's own**
> draft → request → `ankiMineNote` → history path, so it appears in Review with no changes to
> Review. `shared/musicMining.ts` is an adapter, not a second loop. Plain lyrics have no
> timestamps, so they are recorded as `music-plain` with a **zero-length** range at the
> listening position rather than a fabricated one — `startMs === endMs` is the marker.
> **Not proven live:** no song has been mined in a running app. Still missing: an audio clip
> on the card, cue navigation, and any presence in the readiness view. Evidence:
> `proof/music-joins-study-loop-20260731212500/`.

> **2026-07-31 (slice 16) — OLD-PLAYER RETIREMENT IS COMPLETE. The legacy player is
> deleted.** `MediaPlayerStage`, 591 lines, is gone; `MediaContent.tsx` is 2,983 → 2,392
> lines. `useMedia` and the library/transcription/YouTube/hub exports stay — Media Center's
> Home, Study Mode and Settings tabs are backed by that hook. Verified **in the production
> bundle**, not by line count: the `MediaContent` chunk fell 82,887 → 50,707 bytes, total
> renderer JS fell 29,308, and `media-shadowing-error` (a class only that component used) is
> in a chunk before and in **no chunk** after. Note `MediaCenterView-*.js` *grew* 780 bytes —
> `MediaContent.tsx` is its own shared chunk, so the chunk that renders the component was
> never where the code lived. **The cost, chosen deliberately:** `SEANIME_SIDECAR=0` has no
> video player any more. Both fallback sites now say so in EN/JA/ZH/RU rather than rendering
> a hole. Evidence: `proof/legacy-player-deleted-20260731211000/`.

> **2026-07-31 (slice 15) — BLANC IS ROUTED; the legacy player is now genuinely unreachable
> with the sidecar on.** Blanc's Player fieldset renders the adopted `MediaPlayerSurface`
> behind the shared availability gate, with the legacy stage kept only as the
> `SEANIME_SIDECAR=0` fallback. Two premises in the plan were wrong and are corrected in
> `NEXT_SESSION.md`: the player surface is **not** materially lighter than the full
> workspace (8 modules / 49 KB of 472 / 5.9 MB — `video-core` drags the rest in regardless),
> and two websocket clients would have been worse than "eviction" — the sidecar
> double-delivers targeted events and lets the first socket to close de-register the other.
> Both closed. A production build ran for the first time on this track by building to a
> scratch `--outDir` while the dev server stayed up: **one shared 2.69 MB chunk, so a second
> surface costs 756 bytes**; CSS containment 6,950/6,950. Evidence:
> `proof/blanc-player-routing-20260731205000/`. **Not proven live** — the 560×460 geometry
> and the Blanc keymap collision are still unwatched.

> **2026-07-31 (later) — RETIREMENT IS NEARLY COMPLETE, NOT COMPLETE, AND TWO RECORDED
> REASONS WERE WRONG.** Measured against the code:
> - **Blanc still reaches the legacy player.** `BlancMediaPanels.tsx:106` renders
>   `MediaPlayerStage` whenever a source is loaded, with **no sidecar gate at all**. The
>   sweep covered the desktop sections and `MediaCenterView`'s nav; Blanc's toolbox is a
>   third shell nobody enumerated.
> - **"Music keeps `MediaCenterView` alive" is wrong.** Music is
>   `components/music/MusicContent.tsx` and imports nothing from `MediaContent.tsx`. The
>   real constraint is `useMedia` (~1,420 lines) backing the Home, Study Mode and Settings
>   tabs. The deletion target is `MediaPlayerStage`, **~590 lines**, not 2,982.
>
> **User decision:** route Blanc first — as a *pure capability*, stripped of UI and light on
> the machine — then delete. **Plan only, not started**; it is the top section of
> `NEXT_SESSION.md` and `progress.json`'s
> `playerRetirementBlockers.removalScope.blancPlanDecided20260731`. The one real cost that
> survives is unchanged: deleting the player makes `SEANIME_SIDECAR=0` a hollow rollback.

> **2026-07-31 — ~~OLD-PLAYER RETIREMENT IS FUNCTIONALLY COMPLETE~~** (corrected above; this
> block keeps its original wording). ~~Nothing reaches the
> legacy player in normal use~~ — nothing reaches it **from the desktop sections or
> `MediaCenterView`'s nav**: that view's own Video and Library tabs are hidden
> whenever the workspace exists, and restored only when it does not (the `SEANIME_SIDECAR=0`
> fallback). What remains is deletion, which is a **product decision** — ~~it cannot be done
> without either keeping `MediaCenterView` for music or~~ without making the flag's rollback hollow.
> See `NEXT_SESSION.md`, top section.

> **2026-07-31 — the routing swap.**
> `player` and `video` now open the adopted workspace (`music` deliberately does not — the
> workspace has no music surface), and that route was driven end to end: a real file plays
> at 1920×1080 with both subtitle tracks, the taskbar identity is unchanged and window
> dragging survives the workspace opening and closing. Evidence:
> `proof/media-routing-20260731115831/` and `proof/retirement-step3-20260731121641/`.
> The deletion is gated on rehoming `MediaContent.tsx`'s non-player exports —
> it is **22 exports, not a player**, and `MediaCenterView` still needs many of them.

> **2026-07-31 — `SEANIME_SIDECAR` IS ON BY DEFAULT.** Old-player retirement's first of
> three steps. A normal run (variable deleted from the environment) now comes up `stopped`
> with the media launcher in the DOM and reaches `ready` on the durable
> `<userData>/seanime` datadir; `SEANIME_SIDECAR=0` gives `disabled` and no launcher, which
> is both the discriminator and the rollback's only exercise. Evidence:
> `proof/sidecar-default-on-20260731114100/`. Every "the flag cannot be turned on by
> default" and "off in a normal run" statement below is now **historical**. What remains of
> retirement is the legacy player removal alone — scoped in `NEXT_SESSION.md`, including the
> correction that `MediaContentType` is an unrelated union sharing the name and is **not**
> part of it.

Last updated: 2026-07-30 (**Phase 4 COMPLETE**; **G-PLAY CLOSED**; **both Phase 5 gate slices PROVEN**. The microphone hardware proof is a user decision to SKIP, recorded as a permanent known gap, so Phase 3 is closable by retiring the old player.)
Phase: **4 — Scraper on shared contracts, COMPLETE (2026-07-29). 5 — Reading convergence, GATE MET (2026-07-30): manga slice proven in live proof #6, novel/EPUB slice in live proof #7; out-of-gate leftovers remain (real third-party provider, volumes, PDF). 3 — Player + Study Overlay: §8 scanner gate PASS, §9 AnkiConnect gate PASS, G-PLAY PASS (2026-07-30), G-VIS PASS, microphone hardware SKIPPED by user decision — next action is retiring the old player.**

> **Phase 5 gate, 2026-07-30.** `SEANIME_MIGRATION_PLAN.md:620` makes "both
> vertical slices from your brief" the gate, and that phrase was undefined in this
> repo. The user resolved it: **(a) manga** — catalogue → chapter → pages → the
> Study OS reader → OCR → mined card, and **(b) novel/EPUB** — the retained reader
> → dictionary → mined card on the same canonical model. **PDF is not in the
> gate.** (a) is `proof/phase5-manga-ocr-20260730/`; (b) is
> `proof/phase5-novel-20260730/`, which also found and fixed a real defect —
> `NovelReader`'s cleanup persisted `part 0, fraction 0` when it ran before the
> async book load resolved, so under React.StrictMode *opening* any book destroyed
> its stored `p:<part>:<frac>` while `percent` survived and hid the damage.

> **G-PLAY closure, 2026-07-30.** Every "G-PLAY … open / acceptance still open"
> statement below is historical. The gate passed in one uninterrupted run driven
> through the app's own debug bridge: cue `track 3, index 0, 2,148–5,148 ms`
> (`猫が窓辺で寝ている。`), a 162,806-byte screenshot and a 48,843-byte cue audio,
> note `1785396692600` on `JP Study App::JA Immersion` whose `Sentence` field
> carries `<img src="jsa-vn-69a3655b7f3d.png">` **and**
> `[sound:jp-video-cue-3-0-2148.webm]`, a refused duplicate, a real quit and
> relaunch with both persisted stores intact and the stored position re-applied
> (`play t=6 → seeking t=6 → seeked t=6`), and undo performed *after* the
> restart. Deck count 83 → 84 → 83, zero note types minted, and the runtime JSON
> files hash-matched their pre-run baseline verified from PowerShell. Evidence:
> `proof/gplay-20260730/gplay-asset-reference-and-restart.json`.

> **Phase 4 acceptance.** Its criterion was that every `ready` entry in
> `featureStatus.ts` still be `ready` on the new backend, re-verified live, with no
> promotion lacking a recorded run. 28 of 28 hold; runs are in
> `proof/phase4-reverify-20260729/`. One defect (`page.results` counting every run's rows
> against every entry — "500% catalogue coverage") was fixed, not demoted. `result.streams`
> — the shell this phase existed to fill — is live. Phases run additively here: Phase 4
> completing does **not** close Phase 3.

Branch `grammarx/phase-1-5` · Phase 1+2 committed as **`55df6e9`**, based on
`a22e7ba1f72aa7942890ad7eb3ac253b37be0735`. See "Phase 3 — opening" for the commit boundary.

> **Superseding correction.** The sections below that say “Phase 3 closed” refer only to
> the entry adoption and real-cue player seam delivered by `dd2ca47` / `cfd05fa`. The
> authoritative plan requires every retained study control plus the complete one-run
> mining/export/restart path. Full Phase 3 remains active; the latest durable state is the
> final “Phase 3 — full-plan continuation” section in this file.

> **Correction to the Phase-0 record.** `ENVIRONMENT_BASELINE.md` in the backup says
> `go — NOT INSTALLED — blocks Phase 1`. **That line is stale.** Go **1.26.5** is
> installed at `C:\Program Files\Go\bin\go.exe` and is on the *machine* PATH; it was
> installed after the Phase-0 snapshot was taken. The backup file was deliberately
> **not** edited — it is covered by `SHA256SUMS.txt` and the standing constraint is
> not to modify the backup, so correcting it there would break `sha256sum -c`. This
> note is the correction of record. Blocker **R3 / B5 is closed.**

## Approved architecture (ADR-001..005, 2026-07-27)

Seanime runs as a **pinned local sidecar process** owned by the Study OS Electron main;
Seanime's React web UI is **adopted as source** into the Study OS renderer as a Media
workspace; **all study services stay in Electron main** and bind to the player timeline
through one typed bridge. Player is Seanime's **`video-core`** (HTML5); Denshi/mpv-prism is
deferred — it needs a custom Electron build and non-public native tarballs.

| ADR | Decision |
|---|---|
| 001 | License the combined work **GPL-3.0**. Flip `LICENSE`/`package.json` when the first Seanime-derived file lands in `src/` (start of Phase 2), not before. |
| 002 | Adopt `video-core`; keep stock `electron@^42.3.0`; defer mpv-prism. |
| 003 | **CLOSED 2026-07-29.** The Phase 2–3 English-only exemption ended at its Phase-4 exit gate: allowlist empty, a static gate over all five adopted surfaces, and EN/JA/ZH/RU verified live on a real provider stream (`proof/i18n-20260729/`). |
| 004 | Root-config supersession approved: `forge.config.ts`, one Vite alias, `tools/seanime-*.cjs`, vendored pinned checkout. Desktop grid / dragging layer / taskbar remain hard-protected. |
| 005 | P0-6 requirement-level reconciliation ledger runs before any Phase-2 code. |

**Full architecture plan: [`SEANIME_MIGRATION_PLAN.md`](SEANIME_MIGRATION_PLAN.md)** in this
directory (50 KB) — strategy comparison and scoring, the disposition matrix, the canonical
identity model, the target-architecture diagram, the phased roadmap with acceptance criteria
and rollback per phase, and the Phase 1 specification. It is the authoritative "why" behind
ADR-001..005; this file is only the current status.

## Phase 0 progress

| Item | Status |
|---|---|
| P0-1 git bundle, all reachable refs | **done** — 159.9 MiB |
| P0-2 staged/unstaged patches, separate | **done** — 0 staged, 1.19 MB unstaged |
| P0-3 untracked manifest + archive | **done** — 442 files, 903 KB, no secrets found |
| P0-4 hashes + restore instructions | **done** — `SHA256SUMS.txt`, `RESTORE.md` |
| P0-5 toolchain/lockfile record | **done** — `ENVIRONMENT_BASELINE.md` |
| P0-6 requirement reconciliation ledger | **done** — `FEATURE_PARITY_LEDGER.md`, 22/22 sections, 255/255 subsections, 0 unaccounted |
| P0-7 lint / typecheck / test baseline | **done** — see below |
| P0-8 visual baseline via `jp-app` MCP | **done for the foundation** — 8 surfaces; gate G-VIS closed for Phases 1–4 |
| P0-9 pin Seanime | **done** — `C:/Users/Arseniy/Projects/seanime-upstream` @ `9bdd052…`, 1,756 files |
| P0-10 publishability audit | **partial** — deps clear, bundled data flagged (below) |
| P0-11 history hygiene | **done, read-only** — findings below |

Backup location: `C:/Users/Arseniy/jp-study-app-backups/2026-07-27-phase0` (165 MB, 13 artifacts).

## Verified baselines (2026-07-27)

| Command | Result |
|---|---|
| `npm test` | **251 files, 2,888 tests, all passed**, exit 0, 16.7 s |
| `npx tsc --noEmit` | exit 2 — **290 pre-existing diagnostics across 108 files** (renderer 169 / main 67 / shared 46 / preload 8) |
| `npm run lint` | exit 1 — **164 problems: 2 errors, 162 warnings**. Both errors are `import/no-unresolved` in config files, not app code |

`baseline-tsc-by-file.txt` is the authoritative pre-existing-diagnostic list. **A future session
must diff against it — do not treat any of these 290 as regressions caused by the migration.**

## Phase 1 — read-only sidecar proof (2026-07-27)

### Gate G-1: **PASS** — Phase 2 is unblocked

| G-1 criterion | Verdict | Evidence |
|---|---|---|
| Clean process lifecycle on Windows | **PASS** | no orphan and no port leak under graceful stop, simulated crash (`process.exit`), and hard `Stop-Process` |
| Generated types compile against TS 5.2.2 | **PASS** | `tsc` 5.2.2 exits **0** on `types.ts` + `endpoint.types.ts` |
| Player probe shows usable contract or small scoped extension | **PASS (with one extension point)** | see Probe A |

### Build — no C compiler was needed

```
go version                       -> go1.26.5 windows/amd64
go env CGO_ENABLED               -> 0
cd seanime-web && npm install    -> 812 packages, exit 0, 35s
npm run build                    -> exit 0, out/ = 11.4 MB (3.56 MB gz)
move out/* -> <root>/web/        (main.go has //go:embed all:web)
go build -o seanime.exe -trimpath -ldflags="-s -w" -tags=nosystray
                                 -> exit 0, 158s, seanime.exe 80.5 MB
```

Two things worth recording against the plan's assumptions:

- **`CGO_ENABLED=1` is not required.** The plan and `upstream-seanime.json` B5 both say a
  C toolchain is needed. With `-tags=nosystray` it is not — `glebarez/sqlite` is pure Go.
  No MinGW/TDM-GCC was installed. **B5 should be narrowed to the systray build only.**
- **The mpv-prism tarballs fetched fine** from `seanime.app`. They are not needed (ADR-002
  defers mpv-prism) but they did not block `npm install`, contrary to the risk noted in the
  session brief.

### Sidecar CLI surface (all flags Phase 1 needed already exist)

`--datadir` · `--host` · `--port` · `--password` · `--desktop-sidecar` ·
`--disable-features` · `--disable-password`. Auth is `X-Seanime-Token: sha256hex(password)`
(`internal/handlers/server_auth_middleware.go`, `internal/core/app.go:232`).

### The three endpoints, called through the generated types

| # | Route | Generated type | Result |
|---|---|---|---|
| 1 | `GET /api/v1/status` | `Status` | `v3.10.2`, `serverReady: true`, `user.isSimulated: true` |
| 2 | `GET /api/v1/library/collection` | `Anime_LibraryCollection` | 9 titles, `stats.totalFiles` 59, 44 unmatched |
| 3 | `GET /api/v1/library/anime-entry/:id` | `Anime_Entry` | identity mapping + `idMal` |

Identity mapping demonstrated (the acceptance criterion), e.g.:

```
anilistId 182255  malId 59978  "Sousou no Frieren 2nd Season"
  ep 7  <-  AnimePahe_Sousou_no_Frieren_-_35_1080p_SubsPlease.mp4
anilistId 166617  malId 55830  "Fate/strange Fake"           ep 1
```

Note the **absolute→season-relative episode conversion** (file says 35, entry says ep 7) —
Habari does this for free, and `idMal` is on the entry payload already, which matters for
the user's MAL-as-tracker preference.

### Scanner match rate — read this number carefully

A 59-file / ~16-title library (hardlinks to real files, originals untouched) scanned in
**53.7 s**: **15/59 files matched (25.4 %)**, 9 titles resolved. `The Big O` (26 files) and
`Oshi no Ko`, `Gnosia`, `Ikoku Nikki`, `Baki-dou`, `Re:Zero`, `Ginpachi-sensei` did not match.

**This is a deliberate worst case, not a verdict on Habari.** It is a cold start with *no
tracker account*: an empty simulated collection, `enhanced` (legacy) mode, and
`AnimePahe_`-prefixed filenames. Seanime's normal path matches against a populated AniList
collection. **Do not quote 25 % as the scanner's parity number** — the real side-by-side
comparison the plan asks for (§8, "≥ parity on match rate") still has to be run against a
populated collection, and is a Phase-2 item.

### Probe A — `video-core` player contract: **usable, one small extension point**

This was the plan's single biggest unknown (R1). Answer: **adoption, not a port.**

Already exposed to an external sibling component, all as module-level Jotai atoms in
`video-core-atoms.ts` / `video-core.tsx`:

| Overlay need (plan §6) | Status |
|---|---|
| `currentTimeMs` | **[V]** `vc_currentTime` |
| `seekTo` / `pause()` / `play()` | **[V]** `vc_videoElement` (raw `HTMLVideoElement`) |
| `subtitleTrackId`, track list | **[V]** `vc_subtitleManager` atom → `getTracks()`, `getSelectedTrackNumberOrNull()`, `trackselected`/`tracksloaded` events |
| `screenshot()` | **[V]** `useVideoCoreScreenshot()`; also `vc_videoElement` → canvas |
| `offsetMs` (settable) | **[V]** `vc_subtitleDelay`, `setSubtitleDelay()` |
| `onEnded`, `onTrackChange` | **[V]** `vc_ended`; `VideoCoreSubtitleManagerEventMap` |
| cue text + timing | **[V] data exists** — `MKVParser_SubtitleEvent { trackNumber, text, startTime, duration }` is in the **generated types**, fed live to `VideoCoreSubtitleManager.onSubtitleEvents()`. Non-ASS path keeps parsed `VTTCue[]` per track. `getTrackContent(n)` returns the whole track. |
| **`activeCue` / `onCueChange`** | **[U] MISSING — this is the extension point** |

There is **no** `cuechange` event and **no** `activeCue` atom anywhere in `video-core`
(`activeCues` exists only as a local inside `renderToCanvas`). The fix is small and
upstream-friendly: add one entry to the existing `VideoCoreSubtitleManagerEventMap` and
dispatch it from `onSubtitleEvents()` / `_recordSubtitleEvent()`, which already run per cue.

Strong corroboration that this is the intended seam: **upstream already does per-cue text
extraction** for its own translation feature — `sendTranslateRequest(text, track)`,
`updateShouldTranslate()`, `processEventTranslationQueue(original, translated)`. Study OS
needs the same data for mining.

**Consequence: the §9 fallback (keep the old `<video>` player) is NOT needed.**

### Probe B — running without an AniList login: **yes, with one real caveat**

`internal/platforms/simulated_platform/` is a first-class no-account mode. `App.GetUser()`
returns `user.NewSimulatedUser()` when `a.user == nil`, and the platform is swapped to
`SimulatedPlatform` whenever the client is unauthenticated. Verified live:
`user: {"viewer":{"name":"User"},"token":"SIMULATED","isSimulated":true}` with
`serverReady: true`, and a full scan + collection + entry read all succeeded.

AniList is still used as an **unauthenticated public metadata source** (posters, titles,
`idMal`) — a network dependency, not an account dependency. MAL-as-tracker later is
unobstructed.

**The caveat, and it is a real one:**

1. A first scan with an empty simulated collection **fails hard** —
   `[matcher] no media fed into the matcher` (`internal/library/scanner/matcher.go:130`).
   The matcher requires a non-empty collection, so a fresh no-tracker account cannot
   bootstrap itself with a default scan.
2. Workaround, verified: scan with `enhanced: true` (legacy mode fetches media by parsed
   title instead of from the collection), then seed the collection via
   `POST /api/v1/library/unknown-media { mediaIds }`.
3. The scanner only auto-adds unknown media **when fewer than 5 titles are unknown**
   (`scanner/scan.go:439`), so a real first import must seed explicitly or the library
   view stays empty even though local files were matched.

This is a genuine Phase-2 design constraint, not a bug.

### Process lifecycle (the G-1 criterion Windows usually fails)

| Scenario | Result |
|---|---|
| `stopSeanime()` graceful | no orphan, port released |
| Electron `process.exit(7)` — `will-quit` never runs | **no orphan** (`process.on('exit')` sweep) |
| Hard `Stop-Process -Force` on Electron | **no orphan**, port free within 4 s |
| Server killed mid-session | status → `offline` with `sidecar exited with code 1`; next API call fails loudly (`fetch failed`), no hang |

Observed state transitions: `starting → ready → offline`. There is no spinner limbo.

Three independent guards exist: explicit stop, `process.on('exit')` tree-kill
(`taskkill /T /F`), and Seanime's own `--desktop-sidecar` dead-man switch
(`events/websocket.go:112`, exits ~15 s after the websocket drops). **Caveat:** that
dead-man switch only arms **after** a websocket has connected at least once
(`m.hasHadConnection`), so it is a backstop, not the primary. Under hard-kill the orphan
was already gone at 4 s — sooner than the 15 s switch — so *which* guard fired first was
not isolated.

### Study OS user data: **unchanged**

Snapshot of `%APPDATA%\jp-study-app\{library,mining,immersion,scraper,metadata-cache,`
`media-cache,artwork,downloads,models,logs}` before and after: **1892 files both times**,
byte-for-byte identical except `logs\main.log`, which grew because the user's own dev app
was running. No Seanime write ever left its temp datadir.

### Baselines — no regression

| Command | Baseline | After Phase 1 |
|---|---|---|
| `npm test` | 251 files / 2888 tests | **251 / 2888 passed** |
| `npx tsc --noEmit` | 290 diagnostics / 108 files | **290 / 108** |
| `npm run lint` | 2 errors / 162 warnings | **2 / 162** |

### What Phase 1 added, and how to roll it back

| Path | Note |
|---|---|
| `src/main/seanime/supervisor.ts` | spawn / health-poll / kill |
| `src/main/seanime/index.ts` | IPC + the three typed calls |
| `src/shared/seanime.ts` | shared contract + `SEANIME_SIDECAR_ENABLED` |
| `src/renderer/components/SeanimeDevPanel.tsx` | throwaway dev grid |
| `vendor/seanime/generated/types.ts` | **verbatim** copy at `9bdd052` |
| `src/main.ts`, `src/preload.ts`, `src/renderer/window.d.ts`, `src/renderer/App.tsx` | one wiring line each |
| `.eslintrc.json` | `ignorePatterns: ["vendor/**"]` so generated code is not linted |

**Rollback:** unset `SEANIME_SIDECAR`, delete the temp datadir, delete the four new paths,
revert five one-line wiring edits. Everything is inert without the env flag — the panel
renders `null` and the supervisor refuses to spawn.

**ADR-001 is deliberately NOT tripped.** The vendored generated type file lives in
`vendor/`, *outside* `src/`, so "the first Seanime-derived file in `src/`" has not happened
and the `LICENSE` flip correctly stays a Phase-2 action. Moving `vendor/seanime/` into
`src/` is the action that triggers it.

## Phase 2 — first adoption (2026-07-28)

### §8 scanner gate: **PASS** — but the headline number needed three runs to earn

Phase 1's 25.4 % was a cold-start worst case and is **not** Habari's parity figure. The real
comparison was run on one 62-file library built from **hardlinks** into a temp dir
(originals never moved or renamed): `The Big O [BDRip 1440x1080 x265 FLAC]` (29 `.mkv`,
26 episodes + 3 creditless) plus 33 `AnimePahe_*.mp4`.

A file counts as **correct** only when the episode it was mapped to actually exists in the
season it was assigned. Seanime's `metadata.type === "special"` is *not* evidence of a real
special — it is the fallback bucket used when the franchise matched but the episode number
did not fit, so those are scored against the season's episode count too.

| Run | Collection state | Resolved to an id | **Correct** | Mis-matched | Unmatched |
|---|---|---:|---:|---:|---:|
| A | cold start, none (Phase-1 repro) | 15/62 | — | — | 47 |
| B | seeded from `unknownGroups` | 12/62 | — | — | 50 |
| C | all seasons of each franchise seeded | 55/62 | **44/62 (71.0 %)** | 11 | 7 |
| D | **current season only** | 51/62 | **51/62 (82.3 %)** | **0** | 11 |
| Study OS | as shipped | 29/62 | **13/62 (21.0 %)** | 16 | 33 |
| Study OS | + underscore fix | 29/62 | 13/62 | 16 | 33 |
| Study OS | + underscore **and** prefix fix | 62/62 | **31/62 (50.0 %)** | **31** | 0 |

**Verdict: Seanime wins decisively — 82.3 % correct with zero wrong matches, against the
incumbent's best case of 50.0 % with 31 wrong matches. §8's "Adopt Seanime" for library
scanning HOLDS.**

The structural reason, and it is not a tuning difference: Seanime resolves **seasons** and
converts absolute episode numbers to season-relative ones. Verified live — `The Big O` split
itself across two AniList ids (files 01–13 → `567`, files 14–26 → `129608` as its episodes
1–13), `SPY×FAMILY` abs. 48–50 → S3 eps 10–12, `Sousou no Frieren` abs. 35 → S2 ep 7.
Study OS has **no season model at all**: every file lands on season 1, which is why its two
small fixes convert 33 clean failures into 31 confident *wrong* matches. For mining
provenance a wrong episode id is worse than no id.

#### Three findings worth keeping

1. **Seeding *prior* seasons makes matching worse** (run C vs D). With several seasons of one
   franchise in the collection, the matcher picks the closest *title* match — which is the
   bare S1 title — then overflows the absolute episode number into `type: "special"` with an
   impossible number (`Jujutsu Kaisen` abs. 51 → S1 "ep 27" of 24). Seeding only the current
   season turned all 11 mis-matches into honest non-matches.
2. **The `unknownGroups` seeding loop cannot bootstrap** (run B). Titles that fail matching
   entirely never get a `mediaId`, so they never appear in `unknownGroups` and can never be
   seeded from it. Run B scored *worse* than the cold start. A real collection has to come
   from a tracker, not from the scanner's own output.
3. `GET /api/v1/library/collection` lists only media that **have local files**, so it reads
   0 entries before a scan. It is not the tracker collection, and it is the wrong endpoint
   for verifying a seed landed.

#### Two Study OS parser bugs, precisely isolated

Both are in `parseMediaFileName` (`src/shared/mediaFileIdentity.ts`) and neither is fixed
here — spun off as separate work.

- **Underscores are never normalised.** `AnimePahe_Gnosia_-_01_1080p.mp4` → `kind=unknown`,
  `episode=null`, and the episode number is baked into `seriesKey`. The identical name with
  spaces parses cleanly. Consequence: every file becomes its own "series", `inferMediaCategory`
  returns `inbox`, and `groupTitles` (which only looks up `anime|tv|drama`) drops it before
  any provider is asked. 33 of 62 files never reached a lookup.
- **The release-source prefix is not stripped.** The parsed title keeps `AnimePahe`, and
  `anilistSearch("AnimePahe Gnosia")` returns **0 candidates** — all 15 AnimePahe series
  scored 0.00 purely because of the prefix. With it stripped, all 15 matched at 0.93–1.00.
- Note `cleanTitle` (`src/main/media.ts:91`) already does `replace(/[._]+/g, ' ')`, so the
  two are inconsistent today.

**Caveat on the Study OS runs:** Jikan was returning **HTTP 504** throughout, so the pipeline
fell back to AniList — which is its designed behaviour, not a failure, but the Jikan primary
was never exercised. The prefix bug would have sunk those queries either way.

### Task 2 — adoption blast radius, measured before writing adoption code

Static analysis only, nothing installed. Entry
`app/(main)/_features/anime-library/_screens/library-view.tsx`.

| Scope | Local files | npm packages | New to Study OS |
|---|---:|---:|---:|
| As-is | 368 | 60 | 59 |
| − `media-preview-modal` | 179 | 47 | **46** |
| − preview-modal − UI kit | 83 | 20 | 19 |

Study OS had **17 runtime deps**. The 368 → 179 collapse is **one edge**:
`media-entry-card → media-preview-modal`, a hover preview that transitively pulls in the
whole entry page, video-core (`hls.js`, `jassub`, `anime4k-webgpu`, `media-captions`),
mpv-core (`@mpv-prism/core`), onlinestream, torrent-search, debrid and playlists.

- **Unavoidable when adopting source at all (5):** `jotai` + `jotai-derive/family/immer`
  (31 importers) and `@tanstack/react-query` (9). These are Seanime's state and data model.
- **Strippable:** `@tanstack/react-router` (reachable through 1 file), `axios`/`crypto-js`/
  `chalk`, `sonner`, `react-icons`, `cmdk` (Study OS already has a command palette),
  `zod`/`react-hook-form`/`react-day-picker`/`react-colorful` (only via the AniList entry
  modal + form kit).
- **React version match confirmed, not assumed:** Study OS `19.2.6`, seanime-web `^19`.
- **Tailwind can be scoped.** It is 3.4.17 with Preflight on and no prefix, so dropped in raw
  its global element reset *would* restyle the Aero shell. Contained with
  `corePlugins.preflight = false` + `important: "#media-workspace"` (+ `container: false`,
  the one component Tailwind emits without the `important` selector).

**Decision (user, 2026-07-28): adopt feature + UI kit with Tailwind scoped — the 46-package
option.** Rationale: it is the only shape that establishes "adoption, not port"; stripping
the UI kit means hand-reimplementing 89 component files and re-porting every upstream UI
change. §7 already anticipated this ("map Seanime's Tailwind tokens onto Study OS CSS
variables") and ADR-004 pre-approved the Vite alias.

### What was adopted, and what it cost

179 files at `vendor/seanime-web/`, copied verbatim from `9bdd052` except four whole-file
substitutions. Full detail — including the re-sync procedure — in
[`vendor/seanime-web/ADOPTION.md`](../../vendor/seanime-web/ADOPTION.md).

| Cost | Value |
|---|---|
| Runtime deps | 17 → 63 (+46) |
| Dev deps | +7 (tailwindcss, postcss, autoprefixer, 4 tailwind plugins) |
| `npm install` | +225 packages including transitives |
| New root config | `tailwind.config.ts`, `postcss.config.cjs` |
| `vite.renderer.config.ts` | one alias, `@` → `vendor/seanime-web` (ADR-004's single permitted change) |
| `tsconfig.json` | **untouched** — see the boundary note below |
| `forge.config.ts` | **untouched** |
| `DesktopShell.tsx` / grid / dragging layer / taskbar | **untouched** |

**It lives in `vendor/`, not `src/`.** Three repo-wide rules should not apply to third-party
source we have decided never to hand-edit: `vendor/**` is already lint-excluded;
`tools/architecture-audit.cjs` walks `src/` only (the 179 files broke
`architectureBaseline.test.ts` as orphan modules while they sat under `src/media/seanime/`);
and see the typecheck note. This also matches the precedent already set by
`vendor/seanime/generated/types.ts`.

**The typed boundary.** `tsconfig.json` deliberately carries no `paths` for `@/*` — the alias
exists only in the Vite config. Under this repo's stricter `noImplicitAny` the adopted tree
produces 165 diagnostics we will not "fix" by editing someone else's code, so `tsc` resolves
`@/*` through hand-written declarations in `src/media/seanime-boundary.d.ts` and never opens
those files. That keeps `npx tsc --noEmit` a meaningful gate. **Cost, stated plainly: that
boundary is hand-maintained and TypeScript will not notice an upstream signature change —
the build or runtime will. Re-check it on every version bump.**

### The failure that cost the most time

Upstream reads the auth token via
`atomWithStorage(SERVER_AUTH_TOKEN_STORAGE_KEY, undefined, undefined, { getOnInit: true })`.
`getOnInit` snapshots `localStorage` when the **atom is created** — at module-eval time — not
when a component reads it. A token written from a React effect therefore lands too late:
every request goes out with no `X-Seanime-Token`, the server answers 401, and `requests.ts`
does `window.location.replace("/public/auth")`. The symptom is a blank screen with **no
console error**.

Hence `src/media/seanimeBootstrap.ts`, which imports nothing from `@/` and must resolve
before `React.lazy` pulls in the adopted bundle.

### Verified live

Against a real sidecar serving the run-D scan (51/62 matched, 15 titles):

- **Real posters from a real scan** — 13 `<img>` from `s4.anilist.co`, and the UI shows both
  `THE Big O` and `THE Big O (2003)`, i.e. the season split is visible end to end.
- **Restyled to Study OS tokens** — computed on `#media-workspace`:
  `--color-brand-500: 255 46 77` (Study OS `--accent` `#ff2e4d`, not Seanime's indigo),
  `--color-gray-950: 13 12 18` (`--bg`), resolved background `rgb(13, 12, 18)`.
- **Tailwind containment** — of 6,183 selectors in the built stylesheet, **6,183 are scoped**
  to `#media-workspace`, and the shell's `main.css` contains zero Tailwind.
- **Code-split** — the adopted bundle is a lazy chunk (`MediaWorkspace-*.css/js`); with the
  flag off, nothing adopted is in the boot path.
- **Virtualization** — upstream's own `MediaCardLazyGrid` (IntersectionObserver, height-
  preserving skeletons) is in the tree and satisfies the ADR, **but engages only above 48
  items and this library has 15 titles, so it was not exercised at scale.**

**How it was verified, and why not in Electron:** the user's app was running and shares
`%APPDATA%/jp-study-app`; a second Electron instance could have corrupted live user data. So
the real adopted components were driven through a dev-server harness
(`media-harness.html` + `src/media/harnessMain.tsx`, dev-only — the production input list is
still exactly `index.html` + `blanc.html`) against a real `seanime.exe`. Everything except
the preload bridge is the production path.

### Task 4 — `video-core` cue signal

`patches/seanime/0001-video-core-cuechange.patch` — **94 insertions, 0 deletions**, applies
cleanly to `9bdd052`, and `tsc` exits 0 in `seanime-web` with it applied. Kept as a patch
file; the pinned checkout is left pristine, so this stays upstream-submittable, not a fork.

**Deliberate deviation:** the plan proposed dispatching from `onSubtitleEvents()` /
`_recordSubtitleEvent()`. Those run at *demux* time, ahead of playback, so a dispatch there
means "a cue was parsed", not "a cue is on screen" — the Overlay would mine the wrong line.
The signal is instead driven by `timeupdate` + `seeked` and reads the cache those methods
already populate.

**NOT verified:** the runtime proof (logging real cue text + ms timing while playing a file)
**did not happen** — it needs the full player mounted against a mediastream session, which is
Phase-3 surface that Phase 2 deliberately kept out of the import closure. Cue semantics are
**unproven at runtime**; the three specific things to check are listed in
[`patches/seanime/README.md`](../../patches/seanime/README.md).

### Baselines — no regression

| Command | Baseline | After Phase 2 |
|---|---|---|
| `npm test` | 251 files / 2,888 tests | **251 / 2,888 passed** |
| `npx tsc --noEmit` | 290 diagnostics / 108 files | **290 / 108** (0 from `vendor/`) |
| `npm run lint` | 2 errors / 162 warnings | **2 / 162** |

Getting there required three fixes that are themselves part of the record: moving the adopted
tree to `vendor/` (orphan-module test), the typed boundary (165 tsc diagnostics), and lint
exclusions for `tailwind.config.ts` plus an `import/no-unresolved` override for `src/media/**`
(eslint cannot see a Vite-only alias).

### Commit boundary — READ BEFORE COMMITTING

**Phase 2 is uncommitted.** ADR-001 requires `LICENSE` + `package.json` to land in the *same
commit* as the first adopted source, and both are already flipped in the working tree
(`LICENSE` = GPL-3.0 verbatim from upstream; `package.json` = `"license": "GPL-3.0-or-later"`),
so the tree is self-consistent — there is no GPL-source-under-MIT state.

It was **not** committed because the files it touches carry substantial pre-existing changes
from parallel work, and staging them would sweep that in:

| File | Pre-existing diff | Phase-2 share |
|---|---|---|
| `src/preload.ts` | 624 +/4 − | ~4 lines |
| `src/renderer/window.d.ts` | 427 +/2 − | 1 line |
| `src/renderer/App.tsx` | 37 +/42 − | 2 lines |
| `package.json` | includes an unrelated `jsdom` dev-dep addition | license + 50 deps |

Decide that boundary deliberately. **Whatever else is included, `LICENSE` and `package.json`
must be in the same commit as `vendor/seanime-web/`.**

## Phase 3 — opening (2026-07-28)

### Phase 2 is COMMITTED — `55df6e9`

`feat(media): adopt Seanime library surface as a GPL-3.0 Media workspace`
— 217 files, +52,248 / −215, on `grammarx/phase-1-5`.

**What the boundary included:** `LICENSE` (new, GPL-3.0) + `package.json` + `package-lock.json`
(ADR-001 satisfied — they land with `vendor/seanime-web/`), the 183-file `vendor/` tree,
`src/media/`, `src/main/seanime/`, `src/shared/seanime.ts`, `SeanimeDevPanel.tsx`,
`tailwind.config.ts`, `postcss.config.cjs`, `vite.renderer.config.ts`, `.eslintrc.json`,
`media-harness.html`, all of `docs/migration/`, and `patches/`.

**How the four contested files were handled.** `src/preload.ts`, `src/main.ts`,
`src/renderer/App.tsx` and `src/renderer/window.d.ts` carry ~1,050 lines of parallel-session
work. Crucially, that work `import`s five modules that are **still untracked**
(`shared/scraperIpc`, `shared/mediaStudyOrchestrator`, `shared/localAgentRuntime`,
`theme/SecretHistoryTrigger`, `whisperTranscribePcm`) — so committing those files whole would
have produced a **broken** commit, not merely a polluted one. Instead, Seanime-only versions
were built and staged directly into the index via `git hash-object` + `git update-index`,
leaving the **working tree untouched**. Net: exactly **34 added lines, 0 deletions** across the
four files. The parallel work remains uncommitted and owned by its sessions
(`git diff` still shows 1,068 insertions there). Script:
`docs/migration/tools/` sibling of `build-blobs.mjs` (scratchpad).

Deliberately included: the unrelated `jsdom` devDependency — it is inseparable from
`package-lock.json`'s 225 new packages, and splitting it would have left manifest and lockfile
inconsistent. Deliberately excluded: `src/main/scraper/`, `src/.coordination/`, `tools/`,
`src/renderer/data/grammar/`.

Baselines after the commit: **`npm test` 251 files / 2,888 tests pass; `npx tsc --noEmit` 290
diagnostics / 108 files; porcelain 552 → 537** (exactly the 11 untracked + 4 modified paths
consumed).

### §9 acceptance gate — live AnkiConnect: **PASS** (first time in any phase)

Exercised early as a standalone de-risk, against the user's real collection (82 decks, 33
models, AnkiConnect v6 on `127.0.0.1:8765`). **All 14 actions in `AnkiActionMap` work.**

Full round trip in a namespaced probe deck: `createDeck` → `storeMediaFile` ×2 (a real PNG and
a real 40 ms WAV, i.e. the screenshot + audio-clip attach path) → `canAddNotes` → **`addNote`**
→ `findNotes` / `notesInfo` / `cardsInfo` read-back → duplicate correctly rejected
(`allowDuplicate:false`) → `findCards` (the due-forecast path, 7,562 cards due). Japanese text
survived intact (`猫` / `ねこ`), as did `<img src="…">` and `[sound:…]` references.

Cleanup verified: note deleted, both media files deleted, probe deck deleted — **0 residual
notes, probe deck absent**. Latencies 16–310 ms; nothing near the 8 s MUTATE timeout.

Note Study OS's own note types are **already provisioned** in the live collection
(`JP Study App::JA Immersion` = Term/Reading/Sentence, plus EN-JA and ZH-JA Production), so
`noteTypes.ts` has run against real Anki before; only the *note export* was unproven.

Repro: `node docs/migration/tools/anki-gate.mjs <stamp>`.

### Cue patch — the three assumptions, ANSWERED

Full detail in [`patches/seanime/README.md`](../../patches/seanime/README.md). Headlines:

1. **`startTime`/`duration` are MILLISECONDS** — settled from the producing Go source
   (`mkvparser.go:616`, `milliseconds := float64(packet.StartTime) / 1e6`), not inferred.
   The patch needs no conversion. **Upstream's own doc comments say "in seconds" and are
   wrong** — both the Go struct and the generated `types.ts`. Anyone trusting the generated
   types would mis-time every cue by 1000×. Worth an upstream PR.
2. **`timeupdate` runs at 3.81 Hz** (mean gap 262.6 ms, max 290.7 ms over 115 samples in a
   real Chromium renderer); cue activation lands **76–216 ms late, mean 131 ms**. The
   estimate of "~250 ms" was right. `requestVideoFrameCallback` is **not** needed, because
   the cue's own `startMs`/`endMs` are exact — **the Overlay must take timings from the cue,
   never from `video.currentTime` at `cuechange`**. Then only UI responsiveness carries the
   lag (<8 % of a 2.75–3.5 s cue), while mining and provenance stay frame-exact.
3. **Override tags are present** (3 of 6 real cues carried `{\pos}`, `{\i1}`, `{\an8}`,
   `{\b1}`). Stripping belongs in the Study Overlay at the mining boundary, with the raw text
   retained in provenance — not in the patch, which must stay generic upstream code.

The patch was applied to the pinned checkout, verified, and reverted; the checkout ends
**pristine at `9bdd052` with its original three dirty entries**.

**Negative result, recorded honestly:** the two halves were never joined. The data contract
was proven against the real server and the activation logic in a real renderer, but real
`subtitle-event` frames never reached a hand-rolled external websocket client, so
`getActiveCues()` / `cuechange` have still not run inside the real manager class. Three
addressing schemes were tried (own `?id=`, server-issued id, full `id`+`proof` reconnect —
all accepted); the server logs the event as sent but it does not arrive. **Next session:
mount the adopted `websocket-provider.tsx` instead of hand-rolling the client.**

### Test-library finding: there are no soft subtitles to mine

Probed with `ffprobe`. **The Big O** (29 × 2 GB BDRips) is HEVC with **zero subtitle streams**;
the ~15 `AnimePahe_*.mp4` files are h264 + aac only, i.e. **hardsubbed**. The only subtitle
files on disk are loose Netflix `.srt` for a Chinese drama.

Two consequences: (a) the cue path could not be exercised against the library as it stands —
a real MKV had to be built by muxing a real Japanese ASS track into a real 30 s h264/aac clip;
(b) this is exactly why Study OS's `subtitleDiscovery.ts` / Kitsunekko path is **Retain**, and
it means Phase 3's mining slice depends on external subtitle acquisition, not on the library.

Also note HEVC: Chromium will not play those BDRips in `video-core` without hardware decode —
they would go down the transcode path.

### `entry`/episodes closure — measured, NOT adopted

Re-measured before copying, as instructed. **`library-view` + `entry/page.tsx` = 369 local
files / 67 npm specifiers**, against 179 today: **+190 files and 15 new packages**. The entry
closure almost entirely contains the library closure, confirming that adopting `entry` is
what restores the real `media-preview-modal`. Table, calibration notes and the package list
are in [`vendor/seanime-web/ADOPTION.md`](../../vendor/seanime-web/ADOPTION.md).

**Blocker found: `@mpv-prism/core` is in the closure.** ADR-002 defers mpv-prism and the risk
register marks its licence unknown with the mitigation "don't ship it". It is contained —
four files under `_features/mpv-core/`, only `mpv-core.tsx` reachable — so a **fifth
whole-file substitution** removes it. That decision is recorded in `ADOPTION.md` and must be
applied when the copy is performed.

The measuring tool was rewritten this session (the Phase-2 copy lived in a scratchpad and was
lost) and is now **checked in at `docs/migration/tools/import-graph.mjs`** so this does not
happen a third time. It reproduces the Phase-2 file counts exactly.

### NOT done this session — stated plainly

- **The entry/episodes adoption was not performed.** Only measured. No files copied, no
  packages installed, no substitution written. The measurement was the instructed
  precondition, and the `@mpv-prism/core` finding changes the shape of the step.
- **The Phase-3 opening slice was not built.** `video-core` is not mounted, no Study Overlay
  sibling exists, and no `activeCue` has been rendered on screen — all of it is downstream of
  the adoption above.

## Phase 3 — continuation: entry surface adopted (2026-07-28)

### Task 1: **CLOSED** — implementation commit `dd2ca47`

`feat(media): adopt Seanime entry and video-core closure`
— 206 files, +48,509 / −100.

The earlier “not performed” statement above is the record of the opening session; this
continuation supersedes it.

#### Exact boundary

- Adopted `library-view + entry/page.tsx`: **369 local files** at pinned upstream `9bdd052`.
  The initial copy reconciled as **188 unchanged + 1 overwritten + 176 added + 4 kept =
  369**. After the two build-driven integration substitutions, the final dry run is
  **363 upstream-identical + 6 kept substitutions = 369**, with zero stale files.
- Restored upstream's real `media-preview-modal.tsx`; its Phase-2 no-op substitution is gone.
- Added **14 direct runtime packages** at the exact versions from upstream's lockfile.
  The current manifest moved **67 → 81 dependencies**. `npm install` added 54 transitive
  packages. `@mpv-prism/core` is not installed.
- Added five reproducible tools under `docs/migration/tools/`: closure adoption, the MPV
  substitution, JASSUB integration, media-captions CSS scoping, and built-CSS containment.
- Added generated JASSUB 2.5.6 runtime, worker, two WASM binaries, and Roboto font under
  `src/media/jassub/`. The worker setup follows upstream's `rsbuild.config.ts`, but all
  shipped URLs are Vite-managed.

#### Six whole-file substitutions

1. `api/client/server-url.ts` — runtime ephemeral sidecar origin.
2. `components/shared/sea-link.tsx` — no RouterProvider requirement.
3. `lib/navigation.ts` — router-free exported navigation contract.
4. `_features/mpv-core/mpv-core.atoms.ts` — structural `MpvPrismTrack`, no package import.
5. `_features/video-core/video-core-subtitles.ts` — generated JASSUB runtime/assets.
6. `_features/video-core/video-core-media-captions.ts` — scoped package CSS.

The MPV correction matters: the reachable importer is `mpv-core.atoms.ts`, not
`mpv-core.tsx`. The chain is
`entry/page.tsx → torrent-stream/playback-play-pill.tsx → mpv-core.atoms.ts`.
The package's licence is now known (**LGPL-3.0**), but ADR-002 still defers the feature and
the dependency is a hash-pinned tarball URL on `seanime.app`, not a registry package.

#### Build findings and containment

The first production renderer build failed in JASSUB's unused fallback worker:
Vite attempted an IIFE code-split worker build, which Rollup rejects. It also exposed that
upstream's `/jassub/*` and `/fonts/Roboto-Medium.ttf` paths did not exist in Study OS.
The guarded JASSUB substitution closes both problems without changing a root build config or
editing `node_modules`.

The first CSS measurement found **36 unscoped selectors**: 26 from
`@tailwindcss/forms` and 10 from `media-captions`. The stylesheet-local Tailwind config and
the media-captions substitution close both leaks. Final production result:

```
MediaWorkspace-DKC8CtF3.css  6,841 / 6,841 selectors scoped to #media-workspace
main-CKGuxUdq.css            0 occurrences of --tw-
```

#### Commands and results

| Command | Result |
|---|---|
| `node docs/migration/tools/adopt-closure.mjs <library-view> <entry-page> --dry` | 369 files; 363 unchanged; 6/6 substitutions kept; 0 stale |
| `npx vite build --config vite.renderer.config.ts` | **exit 0**, 4,575 modules transformed, 24.72 s |
| `node docs/migration/tools/check-media-css-containment.mjs` | **exit 0**, 6,841/6,841 scoped; 0 shell Tailwind tokens |
| `npm test` | **exit 0**, 251 files / 2,888 tests passed |
| `npx tsc --noEmit` | expected exit 2, **290 diagnostics / 108 files**, 0 from `vendor/` |
| `npm run lint` | expected exit 1, **164 problems (2 errors, 162 warnings)** |

`src/media/seanime-boundary.d.ts` was checked against the pinned real exports and still
matches. This is a manual result: `tsc` does not open the adopted tree.

#### What this proves—and does not

Task 1 proves the complete entry/video-core closure builds, its runtime assets ship, the
typed boundary remains valid, and its CSS cannot leak into the shell. It does **not** prove
that a real `MKVParser_SubtitleEvent` reaches a mounted `VideoCoreSubtitleManager`, and it
does not mount the player or Study Overlay. Those remain Tasks 2 and 3.

#### Next three safe actions

1. Mount the adopted `websocket-provider.tsx` in the dev harness and join the real
   directstream subtitle event to `VideoCoreSubtitleManager`. A recorded negative result is
   acceptable; never claim success from a synthetic cue.
2. If and only if Task 2 is real, mount `video-core` inside the Study OS Media workspace and
   add the Study Overlay as a sibling reading the same player state.
3. Render the real active cue and its exact `cue.startMs` / `cue.endMs`; never derive mining
   timing from `video.currentTime`.

## Phase 3 — Tasks 2 and 3 closed (2026-07-28)

### Runtime join and smallest player slice — implementation commit `cfd05fa`

`feat(media): join live subtitles to study overlay`
— 9 files, +994 / −9.

The adopted `WebsocketProvider` now wraps the Media workspace. A thin Study OS host mounts
the full adopted `VideoCore` / `VideoCoreProvider`, forwards real native-player
`subtitle-event` payloads into the real `VideoCoreSubtitleManager`, and renders a sibling
Study Overlay from the manager's `cuechange` signal. This deliberately stops at the
requested seam; the full study-control set was not ported.

The overlay preserves raw ASS text in proof state, strips override tags only for display,
and reads timing exclusively from `cue.startMs` / `cue.endMs`. It never derives mining
timing from `video.currentTime`.

#### Real browser acceptance: **PASS**

The durable harness starts an isolated `seanime.exe` datadir and a Vite page, copies the
private fixture into a disposable one-file library, serves its h264/aac MP4 remux with
Range support, and mounts the production provider/player components. No second Electron
instance was started and the live Anki collection was not touched.

Observed in the in-app Chromium browser:

```text
[cue-proof] adopted provider connected as 8b42797e-4798-40b6-992e-79c065a914e8
[cue-proof] parser stream consumed 11871913 bytes
[cue-proof] cuechange 2148-5148ms "猫が窓辺で寝ている。"
[cue-proof] cuechange 6648-9398ms "今日は本当にいい天気ですね。"
```

At the same time, the isolated sidecar reported track 3 as `S_TEXT/ASS` and emitted real
parser events with `startTime=2148 duration=3000` and
`startTime=6648 duration=2750`. The adopted VideoCore was active and the remux was playing.
This is the required real `MKVParser_SubtitleEvent → VideoCoreSubtitleManager →
cuechange → sibling Study Overlay` path; no cue or manager was mocked.

#### Transport findings that closed the earlier false negative

- Directstream local-file lifecycle messages are on **`WSEvents.NATIVE_PLAYER`**, not the
  videocore channel.
- Targeted REST calls require all of
  `X-Seanime-Client-Id`, `X-Seanime-Client-Id-Proof`, and
  `X-Seanime-Client-Platform`, plus the token. Supplying `clientId` only in the body makes
  the server accept the request and log the send while the browser receives nothing.
- A fresh sidecar can return 500 from `GET /api/v1/settings` because no settings row exists;
  initialize it through `POST /api/v1/start`, then use `PATCH /api/v1/settings` later.
- Scanning the scratch directory containing both an MKV and a same-basename MP4 remux can
  leave the MKV unmatched. The harness copies only the MKV into its disposable library.
- The parser advances only while its directstream response is consumed. The proof consumes
  all 11,871,913 bytes independently while VideoCore plays the browser-compatible remux.

These are recorded negative experiments, not discarded noise: a hand-rolled websocket
under three addressing schemes, body-only client addressing, missing fresh-sidecar
settings, and scanning the duplicate-basename scratch directory all failed before the
accepted path above.

#### Reproducibility boundary

- `docs/migration/tools/cue-manager-harness.mjs` is the isolated live acceptance harness.
- `docs/migration/tools/make-jassub-substitution.mjs` now applies
  `patches/seanime/0001-video-core-cuechange.patch` in memory with guarded six-hunk parsing,
  then applies the JASSUB substitutions. The pinned checkout remains untouched.
- `src/media/seanime-boundary.d.ts` now describes the mounted provider/player seam. This is
  still a manual contract: `tsc` never opens `vendor/`; the production build and runtime
  acceptance are the real upstream-signature checks.
- The adopted closure remains **369 files: 363 upstream-identical + 6 guarded
  substitutions**. The cue patch is part of the generated JASSUB substitution, not a
  seventh hand-edited vendor file.

#### Final commands and results

| Command | Result |
|---|---|
| `node docs/migration/tools/cue-manager-harness.mjs <cue-probe.mkv> <cue-probe.mp4>` | real provider identity; directstream accepted; 11,871,913 parser bytes; two real manager `cuechange` events |
| `npx vite build --config vite.renderer.config.ts` | **exit 0**, 4,576 modules transformed, 25.58 s |
| `node docs/migration/tools/check-media-css-containment.mjs` | **exit 0**, 6,847/6,847 scoped; 0 unscoped; 0 shell Tailwind tokens |
| `npm test` | **exit 0**, 251 files / 2,888 tests passed |
| `npx tsc --noEmit` | expected exit 2, **290 diagnostics / 108 files**, 0 from `vendor/` |
| `npm run lint` | expected exit 1, **164 problems (2 errors, 162 warnings)** |
| `node --check docs/migration/tools/{make-jassub-substitution,cue-manager-harness}.mjs` | **exit 0** |

The first post-implementation type/lint pass exposed the unextended manual boundary and one
new constant-condition lint error (302 diagnostics / 110 files; 165 lint problems). After
extending the boundary and using an unconditional `for (;;)` stream loop, both returned
exactly to their fixed baselines above.

#### Historical next actions — superseded by the full-plan continuation below

1. The cue-seam task was closed here; the later audit established that this did **not**
   close full Phase 3.
2. On any upstream version bump, regenerate the JASSUB substitution and repeat the
   production build plus real cue-manager harness; a green `tsc` boundary alone is not
   acceptance.
3. Prepare the upstreamable cue patch together with the milliseconds documentation fix,
   then open the next migration phase from `SEANIME_MIGRATION_PLAN.md`.

## Blocking findings

~~**Go is not installed.**~~ **RESOLVED** — Go 1.26.5 present; `CGO_ENABLED=1` turned out
not to be required for the `nosystray` build. See the Phase 1 section above.

**Bundled third-party study content is not publishable as-is** (ADR-001 consequence):

| File | Size | Source | Risk |
|---|---:|---|---|
| ~~`n{1,2,3,4}-mazii.ts`~~ → `src/renderer/data/grammar/n{1,2,3,4}-supplement.ts` | 671 KB | **RESOLVED 2026-07-28** — de-branded, exports `N*_SUPPLEMENT`, provenance `supplement-${level}` | **Closed** |
| ~~`tools/_mazii_n{1,2,3,4}.json`~~, ~~`tools/import-mazii-grammar.py`~~ | — | **DELETED** | **Closed** |
| `src/renderer/data/grammar/tatoebaExamples.ts` | 545 KB | Tatoeba | Low — CC BY 2.0 FR, **needs attribution notice** |
| `src/renderer/data/grammar/hsk-import.ts` | 155 KB | unknown | **Unknown** |
| `src/renderer/data/{gradedSentences,mirrorTexts}/index.ts` | 158 KB | unknown | **Unknown** |

Resolve before the repository is made public: verify terms, replace with openly-licensed
equivalents, or move to runtime user-import. Does **not** block Phases 0–1.

**Runtime dependencies are GPL-3.0 compatible** — 17 deps: Apache-2.0 ×6, MIT ×7,
BSD-2-Clause ×1, ISC ×1, and `ffmpeg-static` **GPL-3.0-or-later**. That last one means the app
*already* bundles GPL-3.0 code while declaring MIT; ADR-001 resolves a pre-existing conflict
rather than creating one.

## Do-not-touch warnings

1. **A second worktree shares this object store**: `C:/Users/Arseniy/Projects/jp-study-app-noctis-beta`
   @ `f9a318b` on `codex/noctis-beta`.
2. **Never `git clean -fd`.** All 16 files of `src/main/scraper/` are untracked, as are 12 files
   under `src/.coordination/study-mode/` and 234 test files.
3. **Never `git gc --prune=now`.** 20 dangling commits exist (2 live stashes + 18 orphaned WIP,
   incl. `bdda548` "unpin TypeScript 4.5 → 5.2"). Their unique objects are preserved in
   `dangling-objects.pack` (784 objects, 2.4 MB), but the repo copy is the only in-place one.
   The pack is ~300 MiB of the 460 MiB on disk; only 159.9 MiB is reachable.

## Visual baseline captured so far

`jp-app` MCP verified working against the live app (2 windows: `日本語 Study` @1280×860,
`Blanc Toolbox` @560×460, both on `http://localhost:5173`).

Seven surfaces captured — full detail and what each proves in `TEST_EVIDENCE.md`.

| # | Surface | Capture |
|---|---|---|
| 1 | Scraper — Scheduled Tasks | `debug/shots/win1-1785172392909.png` |
| 2 | Media Center — Library Home (1,586 titles) | `debug/shots/win1-1785172643580.png` |
| 3 | **Media Center — Video player + learning controls** | `debug/shots/win1-1785172724152.png` |
| 4 | Media Center — Study Mode production line | `debug/shots/win1-1785172756993.png` |
| 5 | Scraper — Dashboard | `debug/shots/win3-1785173161604.png` |
| 6 | Scraper — Torrent Manager (70 real releases) | `debug/shots/win3-1785173201765.png` |
| 7 | Scraper — Source Manager (provider health) | `debug/shots/win3-1785173230697.png` |
| 8 | Scraper — Discover (real catalogue, JLPT filter) | `debug/shots/win3-1785173346024.png` |

Captures 4, 6 and 7 independently corroborate `study-mode/CURRENT_STATE.md` and
`featureStatus.ts` in the running app.

**Gate G-VIS is closed for Phases 1–4.** Every surface the media + scraper foundation owns has
a labelled "before". Series/entry detail and the Manga/Novel readers belong to Phase 5, Anki's
disposition is *Retain, untouched*, and the AI permission prompt is Phase 7 — each is captured
when its phase opens.

**Working capture procedure** (found the hard way, use it):
pop the workspace out (`⧉`) → target `{window: <id>}` → **send each click twice** (first focuses,
second activates) → insert one cheap call before `app_screenshot`, which lags exactly one call.

## Next actions

Gate G-1 is **PASS**, so Phase 2 is unblocked. The next three safe actions:

1. **Re-run the scanner comparison against a populated collection.** The 25.4 % cold-start
   number above is a worst case and must not be carried forward as Habari's parity figure.
   This is the §8 "≥ parity on match rate" gate and it is still open.
2. **Prototype the `video-core` cue-change extension** (Probe A): one entry in
   `VideoCoreSubtitleManagerEventMap` + a dispatch in `onSubtitleEvents()`. Keep it as a
   patch against the pinned checkout so it stays upstream-friendly.
3. **Decide the ADR-001 flip explicitly** before moving `vendor/seanime/` into `src/`.
   Phase 2's first adopted file triggers the GPL-3.0 `LICENSE` / `package.json` change.

Carried over from Phase 0, unchanged:

- **R13** is partly answered — real anime *does* exist on disk (`The Big O` 26 eps plus
  ~15 AnimePahe titles in `C:\Users\Arseniy\Downloads`), so a real scanner comparison is
  now possible; it just has not been run against a populated collection yet.
- **R5 licensing** — note that a **parallel session has deleted** the Mazii grammar data
  and `tools/import-mazii-grammar.py` (9 new deletions in `git status`). That is the
  highest-risk item in the publishability audit, so re-check `LICENSING_PLAN.md` against
  the working tree before relying on the table above.

## Phase 3 — full-plan continuation: core study controls on VideoCore (2026-07-28)

This section supersedes every earlier instruction to treat the whole phase as closed.
Commit **`a4e495d`** ports the first coherent control slice onto the same adopted
VideoCore video element and subtitle/audio managers; it does not satisfy G-PLAY by itself.

### Contract extension

- `VideoCoreSubtitleManager.getCues()` exposes the selected event track’s full, ordered
  cue timeline. Each cue carries a stable `index`, exact demuxer `startMs` / `endMs`,
  track number, and raw text.
- Subtitle delay is now manager state: `setSubtitleDelay()` updates settings, offsets the
  renderer, and immediately re-evaluates the active cue against
  `(video.currentTime - subtitleDelay) * 1000`.
- The guarded upstream patch now has seven hunks and still applies cleanly to pin
  `9bdd052`. The substitution generator ran successfully; upstream remained at its exact
  three pre-existing dirty entries.
- `src/shared/videoCoreStudy.ts` owns delay-aware seek/loop arithmetic, ASS display
  stripping, bounded rate normalization, compatibility-preserving preference loading,
  and deterministic dictation scoring. Raw ASS text remains available for provenance.

### Controls implemented in this slice

| Control | Current state |
|---|---|
| Previous / replay / next line | **implemented and live-proven** against manager cues |
| Subtitle offset | **implemented and live-proven**; manager activation follows the delayed clock |
| Frame step | **implemented** at ±1/30 s on the one VideoCore video element |
| Playback speed | **implemented and live-proven** at 0.75×; stored in the existing preference record |
| Auto-pause / line loop / A–B loop | **implemented and live-proven** against exact cue/delay boundaries |
| Japanese subtitle visibility | **implemented** |
| Subtitle and audio track selection | **implemented** through the real managers |
| Click lookup / optional pause | **implemented** using the retained lookup and dictionary surface |
| Selection / line translation | **implemented** using the retained translator |
| Furigana | **implemented and live-proven**; the real cue produced three ruby readings |
| Dictation | **implemented and live-proven**; exact Japanese answer scored 100% |

### Live evidence

The isolated harness used a disposable Seanime datadir and did not start Electron or touch
Anki. The adopted provider connected as
`cc8a86ef-1ed4-4a08-9f07-842fbbaf45df`; the real parser consumed **11,871,913 bytes**,
mounted `VideoCoreSubtitleManager`, and emitted:

```text
2148-5148ms  猫が窓辺で寝ている。
6648-9398ms  今日は本当にいい天気ですね。
```

Observed control transitions on that real clock:

- playback element and speed selector both read `0.75`;
- subtitle delay display read `+0.1s`;
- auto-pause stopped at about `5.37s` for cue 1’s delayed `5.248s` boundary (normal
  `timeupdate` granularity);
- line loop repeatedly returned to cue 1 and remained inside `2.248–5.248s`;
- pausing on cue 1 at `2.248s`, entering `猫が窓辺で寝ている。`, and checking produced
  **Exact match**;
- furigana rendered `ねこ`, `まどべ`, and `ね`;
- A–B boundaries displayed `2.25s` and `14.55s`; after crossing B, playback returned
  inside the interval at `6.02s`.

The exact harness processes were stopped and its resolved temporary datadir was removed.
The pinned upstream checkout was not edited or cleaned.

### Verification after the control port

| Command | Result |
|---|---|
| focused study + architecture tests | **14/14 pass** |
| `npm test` | **252 files / 2,894 tests pass** |
| `npx tsc --noEmit` | accepted exit 2; **290 diagnostics / 108 files**, 0 in this slice |
| `npm run lint` | accepted exit 1; **164 problems (2 errors, 162 warnings)**, 0 changed-path mentions |
| renderer production build | **exit 0**, 4,578 modules |
| CSS containment | **6,865/6,865 scoped**, 0 unscoped, 0 shell Tailwind tokens |
| patch apply + generator | **exit 0** |

The first full test run correctly rejected a duplicate storage-key literal. The key moved
behind the migration’s shared compatibility contract; the architecture baseline was not
weakened, and the full suite then passed.

### What remains before Phase 3 can close

- real dual-subtitle rendering, shadowing mode, and Whisper generation;
- screenshot and cue-bounded audio capture wired into the retained asset pipeline;
- editable card preview, one-action mining, duplicate warning, undo, Anki destination,
  mining history, and complete cue → episode → media → assets → draft → note provenance;
- one uninterrupted G-PLAY run: representative local file, audio/subtitle selection
  including ASS, real cue mining, both assets, preview, live Anki export, restart, resume
  position, and history persistence;
- the required final visual comparison before the old player can retire.

### Next three safe actions

1. Bridge the active VideoCore cue and video element into the retained
   `StudyOrchestratorWorkspace` draft/asset contract without introducing a second clock.
2. Add screenshot plus exact cue-bounded audio capture, preserving raw cue timing and
   provenance through editable preview.
3. Wire duplicate/undo/destination/history, then run the complete namespaced live-Anki
   G-PLAY path and restart persistence check. A negative runtime result is a valid record;
   never promote a false positive.

## Phase 3 — VideoCore mining preview and cue assets (2026-07-28)

Commit **`03d27a3`** completes the next implementation slice without adopting the
parallel session's untracked study-orchestrator files. It uses the committed Anki IPC and
shared note contract directly, so this commit remains independently buildable.

### Implemented

- An editable sentence/word card preview is mounted beside the real VideoCore study
  overlay. It retains the selected cue while capture temporarily moves the playback
  clock outside that cue.
- Screenshot capture reads the current VideoCore frame and burns the raw cue display
  text into a PNG.
- Cue audio capture uses `captureStream()` / `MediaRecorder` on the same VideoCore
  element, seeks to the delay-adjusted demuxer boundaries, records at 1×, then restores
  the previous time, rate, and paused/playing state.
- The draft carries raw and display cue text, exact `startMs` / `endMs`, selected track
  and cue index, playback/media/episode/local-file identity, asset names/types/sizes,
  and capture time through to one `MineNoteRequest`.
- Anki destination selection, duplicate outcomes, bounded persisted history, and undo
  by exported note ID are implemented. These Anki mutations were deliberately not
  clicked during the isolated browser proof.

The adapter was implemented locally instead of importing
`StudyOrchestratorWorkspace.tsx`: that workspace and its related contracts are untracked
parallel-session work, so depending on them would make this migration commit incomplete
and would take ownership of unrelated changes.

### Live evidence

The same real sidecar/ASS fixture produced cue 3:0 at **2148–5148 ms**. From that cue the
mounted preview attached:

```text
jp-video-cue-3-0-2148.png   113,329 bytes
jp-video-cue-3-0-2148.webm   48,843 bytes
```

Both assets remained attached after editing the term to `猫`; provenance still named
`Sousou no Frieren`, Episode 1, track 3, cue 0, the raw Japanese text, and the exact
demuxer range. After audio capture the real element was restored to paused, 1×, and
`2.151889s`. No Anki write occurred. The exact harness processes were stopped, its
temporary datadir was removed, and the browser harness tab was closed.

### Verification

| Command | Result |
|---|---|
| focused mining + study + architecture tests | **18/18 pass** |
| `npm test` | **253 files / 2,900 tests pass** |
| `npx tsc --noEmit` | accepted exit 2; **290 diagnostics / 108 files**, 0 mining paths |
| targeted ESLint | **exit 0** |
| `npm run lint` | accepted exit 1; **164 problems (2 errors, 162 warnings)**, 0 mining paths |
| renderer production build | **exit 0**, 4,580 modules |
| CSS containment | **6,895/6,895 scoped**, 0 unscoped, 0 shell Tailwind tokens |

### What remains before Phase 3 can close

- real dual subtitles;
- shadowing mode and Whisper generation;
- a single uninterrupted namespaced G-PLAY run that uses this preview to mine both
  assets into live Anki, observes duplicate rejection, undoes/cleans the probe note,
  restarts, and proves resume plus history persistence;
- the required final visual comparison before the old player retires.

The code paths for mine, duplicate history, destination, and undo now exist, but they are
**implemented, not live-accepted**. G-PLAY remains open.

## Phase 3 — secondary VideoCore timeline, negative runtime gate (2026-07-28)

Commit **`ea77f59`** adds the renderer half of real dual subtitles:

- the guarded upstream extension now exposes `getCuesForTrack(trackNumber)` without
  changing the primary rendered/selected track;
- the Study Overlay selects a secondary event track and resolves it against the same
  delay-adjusted VideoCore clock;
- secondary text renders independently of the primary cue, while mining continues to
  use only the primary selected-track cue;
- the old `open-and-await` harness race is fixed: VideoCore no longer mounts with null
  playback info and accidentally terminates directstream preparation.

The implementation is production-build clean, but the live gate is a recorded
**negative**, not a pass. A disposable MKV contained Japanese ASS track 3 and English
ASS track 4 over the same six cue ranges. Seanime exposed both tracks in the UI, but the
fresh directstream websocket delivered exactly:

```text
subtitle-event 1 cue(s), tracks 4
```

Provider `f6dbda04-4197-4ac0-97bc-9668dd55940b` consumed **11,873,146 bytes**. The
secondary track was selected as track 3 but its manager timeline remained at **0 cues**.
Therefore simultaneous real-track rendering could not occur. Browser reloads were not
counted as retries because the sidecar deduplicates subtitle events for a stream; the
decisive run used a fresh isolated sidecar.

Verification after the slice:

| Gate | Result |
|---|---|
| focused mining + study + architecture tests | **19/19 pass** |
| full tests | **253 files / 2,901 tests pass** |
| TypeScript | accepted **290 diagnostics / 108 files**, 0 slice diagnostics |
| targeted ESLint | **exit 0** |
| full lint | accepted **164 problems**, 0 slice mentions |
| renderer build | **exit 0**, 4,580 modules |
| CSS containment | **6,896/6,896 scoped**, 0 unscoped, 0 shell Tailwind tokens |
| patch apply + substitution generator | **exit 0** |

The exact harness processes were stopped, all three disposable datadirs and the
temporary dual-track fixture were removed, the browser tab was finalized, and the
pinned checkout retained its exact three pre-existing dirty entries.

**Historical verdict, superseded immediately below:** dual subtitles remained open at
`ea77f59`; the next slice had to prove both track numbers reached `subtitle-event`.

## Phase 3 — dual delivery fix, shadowing, Whisper, and Study OS continuity (2026-07-28)

Commit **`3fe73d0`** closes the dual-subtitle runtime defect and implements the remaining
study-practice surfaces. Full Phase 3 and G-PLAY remain active because the hardware/model,
one-run live-Anki, restart, and visual gates below have not all been exercised together.

### Dual subtitles — PASS

The earlier negative was not a renderer or websocket problem. On successful parser
completion, `internal/directstream/subtitles.go` called `subtitleStream.Stop(true)` before
`flushBatch(false)`. Stop cancelled the stream context; `sendSubtitleEvents` then rejected
the cancelled context and silently dropped the terminal batch. The first immediately
flushed English event survived, while all six Japanese events and the remaining English
events were lost.

`patches/seanime/0002-directstream-terminal-subtitle-flush.patch` sends the terminal
batch before successful stop and adds a Go ordering regression. The patch applies cleanly
to `9bdd052`; `go test ./internal/directstream` passes. The disposable builder
`docs/migration/tools/build-patched-sidecar.mjs` archives the exact pin, overlays the patch,
tests, and builds without modifying the pinned checkout.

The fresh isolated two-track run then delivered **6 Japanese + 6 English cues**. At
`2148–5148 ms`, the mounted real manager simultaneously rendered:

```text
猫が窓辺で寝ている。
The cat is sleeping by the window.
```

The later `この漢字の読み方が分かりません。` /
`I do not know how to read this kanji.` pair also aligned. Turning dual subtitles off
removed only English; turning them back on restored English with the Japanese primary cue
and its mining provenance unchanged.

Two harness-only lifecycle defects were fixed while isolating this:

- the separate proof MP4's bootstrap seek could replace the MKV subtitle stream;
- Vite's renderer config could overwrite the proof defines, making a reload look valid
  while serving the ordinary page.

### Shadowing open; Whisper runtime — PASS

- Shadowing uses the retained microphone stack on the same overlay: exact cue replay via
  `cue.startMs` / `cue.endMs`, `MediaRecorder`, echo cancellation, noise suppression,
  automatic gain control, a 60-second limit, local response playback, discard, cue-change
  cleanup, and mutual exclusion with dictation.
- Whisper uses the retained local Transformers.js worker and model settings. Electron main
  validates an absolute local file, extracts 16 kHz mono float PCM with the existing ffmpeg
  helper, and transfers it to the worker. Partial timestamps are rounded from seconds to
  exact milliseconds, mounted as a new `Whisper (generated)` manager event track, and
  selected without introducing a second timeline.
- Worker creation, transfer, model/download/transcription progress, cancellation, playback
  change, and error paths are explicit. The production build emitted a dedicated Whisper
  worker chunk.

The first real `whisper-base` run produced a useful negative: download reached 70%, then
Chrome reported no WebGPU adapter. Initializing ONNX on that failed backend prevented the
intended same-worker WASM recovery. Commit **`1c51d6c`** now probes for a usable adapter
before pipeline creation and exposes an explicit Auto/CPU selector.

The fresh forced-CPU run then **passed** against ffmpeg-produced PCM from the 30-second
local fixture:

```text
Generated 3 subtitle lines.
selected track: Whisper (generated), track 5
cue 1: 0–24000 ms  【音楽】
```

The generated cue became the real manager’s primary timeline and populated the mounted
card preview with the same exact `0–24000 ms` provenance. The model/worker/track runtime
gate is closed. Only the microphone hardware path remains open because accepting Chrome’s
microphone permission requires explicit user approval.

### Restart continuity

The player seam previously set `disableRestoreFromContinuity: true`, while the supervised
sidecar uses a disposable datadir. Commit `3fe73d0` therefore adds bounded Study OS-owned
resume storage keyed first by normalized absolute local-file path, then by media/episode
identity. It persists every two seconds and on pause/unmount, clears at end-of-file, and is
disabled in disposable proof runs. Mining history already uses bounded Study OS
localStorage.

Pure tests prove that `C:\Anime\Episode 01.mkv` restores across a changed ephemeral
playback ID and that a position within five seconds of the end is not restored. An actual
app restart remains part of the open one-run G-PLAY gate.

### Verification

| Gate | Result |
|---|---|
| focused study/mining/architecture tests | **21/21 pass** |
| full tests | **253 files / 2,903 tests pass** |
| TypeScript | accepted **290 diagnostics / 108 files**, 0 migration diagnostics |
| targeted ESLint | **exit 0** |
| full lint | accepted **164 problems (2 errors, 162 warnings)** |
| renderer production build | **exit 0**, 4,581 modules; Whisper worker emitted |
| CSS containment | **6,915/6,915 scoped**, 0 unscoped, 0 shell Tailwind tokens |
| patched sidecar builder | **exit 0**; Go directstream regression pass; 51.4 s |

The exact proof processes/datadir were removed, the browser tab was finalized, Electron
and Anki were untouched, and the pinned checkout retained its three pre-existing dirty
entries.

### Final visual comparison — PASS after one correction

The recorded old-player image at `debug/shots/win1-1785172724152.png` was compared at
normal scale with a fresh adopted-player real-cue image at
`debug/shots/phase3-adopted-player-dual-cue-20260728.jpg`.

The first comparison caught a real regression: the mounted card preview's two-column form
used intrinsic control widths, producing horizontal overflow and clipping at the
1,294 × 845 Chrome proof viewport. Commit **`29582e0`** changes those columns to
`minmax(0, 1fr)`, bounds every form control, and keeps only vertical overflow.

The fresh comparison then passed: video remained unobscured at the center, simultaneous
English/Japanese cues were readable, exact cue timing remained visible, the full retained
control dock stayed reachable, and the card preview showed both columns and provenance with
no horizontal scrollbar. Production build and CSS-containment results above include this
correction. G-VIS is therefore closed; this does not substitute for the still-open one-run
G-PLAY and restart proof.

### G-PLAY isolated datadir — READY, acceptance still open

Commit **`8d10aa1`** adds `docs/migration/tools/prepare-gplay-datadir.mjs`. It refuses to
overwrite an existing directory, starts only the patched sidecar, copies the representative
dual-subtitle fixture into a one-file library, scans/matches/seeds it, writes a manifest,
and stops while retaining the caller-owned datadir.

The prepared acceptance state is:

```text
SEANIME_DATADIR=C:\Users\Arseniy\AppData\Local\Temp\seanime-phase3-gplay-20260728
fixture mediaId: 154587
collection items after sidecar reopen: 1
local files after sidecar reopen: 1
server: 3.10.2, simulated user
```

The already-running Electron instance was inspected without changing its data. It is the
old player with `SEANIME_SIDECAR` disabled, so it cannot host G-PLAY and was left running.
The final run therefore still requires that instance to close before one Electron process
is relaunched with `SEANIME_SIDECAR=1`, the verified patched executable, and the prepared
external datadir. Reopening the sidecar proves preparation persistence only; it is not
claimed as the required app restart/resume/history result.

### Next three safe actions

1. With explicit microphone-permission approval, record and play back one real shadowing
   response; a recorded negative is acceptable.
2. Run one namespaced G-PLAY through the mounted preview: both real cue assets, export,
   duplicate rejection, undo/cleanup, then actual restart/resume/history persistence.
3. Only after both runtime gates pass, retire the old player and close Phase 3.

### G-PLAY first live attempt — NEGATIVE, cue delivery never starts (2026-07-28)

The prepared environment was launched for real: one Electron instance with
`SEANIME_SIDECAR=1`, the verified patched executable, and the external datadir. No second
instance was started, and Anki was never contacted.

What the mounted production surface **did** prove:

```text
sidecar        state ready · v3.10.2 · isolated datadir · 1 titles · 1 files · 0 unmatched
fixture        154587 (mal 52991) · ep 1
play           POST /api/v1/directstream/play/localfile -> 200
video          real frames rendered; readyState 4; duration 30.386s; no media error
manager        VideoCoreSubtitleManager mounted (real class, logged by the seam)
tracks         subtitle "English (probe) (default)" + secondary "Japanese (probe) (default)"
controls       full retained dock rendered (line nav, frame step, delay, speed, auto-pause,
               loop, A-B, track pickers, furigana, dictation, shadowing)
```

What it **did not** prove, and this is the blocking result:

```text
cueChanges     0   across ~25s of real playback spanning the known cue ranges, and again
                   after an explicit seek
sidecar log    only "mkvparser > Metadata parsing complete attachments=0 chapters=1
                   cues=19 tracks=4" — no subtitle stream is ever started
```

**Zero real `MKVParser_SubtitleEvent`s were delivered.** Per the standing rule, nothing
downstream is claimed: no cue was mined, no asset captured, no Anki export attempted.

Root cause, located in the pinned upstream (not yet isolated to a single confirmed
trigger):

- the server starts subtitle streaming only from a **client** event — a
  `LoadedMetadataEvent` with `key.Target == player.TargetVideoCore`
  (`internal/directstream/stream.go` §517-548), or a `SeekedEvent` (§551-553);
- `internal/videocore/videocore.go` §916-922 **drops** `video-loaded-metadata` when the
  module holds no playback state (`ps, ok := vc.GetPlaybackState(); if !ok { continue }`);
- playback state is only established by `video-loaded` (§897-906), and is cleared when the
  stream is terminated.

In this run the first play attempt was terminated by the client immediately after the
stream became ready (`directstream > Video terminated`), which is exactly what clears that
state. The retry then streamed video correctly but its metadata and seek events were
dropped, so no subtitle stream was ever started.

**A hypothesis that was tested and disproved:** draining the directstream body by hand
(11,873,146 bytes, matching the isolated proof's parser byte count) does **not** trigger
subtitle generation. Consuming the stream is not the trigger; the client event is. Do not
re-derive this.

Relevant seam detail for whoever continues: in `src/media/StudyPlayerSlice.tsx` the
`onLoadedMetadata` handler opens with `if (!proofConfig) return;`, so **both** the
bootstrap-`seeked` suppression and the parser-stream pull exist only on the proof path.
The production path has neither guard. That is a concrete lead for the termination race,
but it has **not** been tested as the fix and must not be recorded as one.

### Correction to the "adopt the entry surface" scope

The mounted UI has **no click-path to start playback**. The media-entry card's Watch
button calls `setPlayNext(...)` then `router.push(ANIME_LINK)`
(`vendor/seanime-web/app/(main)/_features/media/_components/media-entry-card.tsx` §178-182),
and the entry/episode-list route is not part of the adopted seam. Playback in this run was
therefore started by calling the same real endpoint the seam's own driver calls. This is a
real scope gap in Phase 3, not a harness shortcut: G-PLAY cannot be completed purely by
clicking the adopted UI until the entry surface owns a play affordance.

### Session hygiene notes

- The sidecar's no-client watchdog exits the process (code 1) shortly after the last
  websocket client disconnects. A renderer reload therefore kills it; restart it from the
  dev panel and expect a **new ephemeral port**. This is benign, not a defect.
- The app's first-launch telemetry consent screen renders *before* the desktop shell and
  blocks every surface behind it, including the Media workspace button. It must be
  answered by the user before any further UI-driven run.

### G-PLAY second live attempt — cue delivery POSITIVE (2026-07-28, later session)

The first attempt's negative is closed. Same prepared datadir, same fixture, same single
Electron instance, **`React.StrictMode` restored** (the diagnostic removal was reverted
before any of this was measured). Evidence: `docs/migration/proof/gplay-20260728/`.

Two upstream defects plus one seam deviation were responsible, and all three are fixed:

| # | Where | Defect |
|---|---|---|
| 3a | `video-core.tsx` §1016-1021 | "Override active player" effect guarded on `activePlayer === props.id` — a self-assignment that can never restore a nulled `vc_activePlayerId`. Inverted to `!==`, native-player excluded. |
| 3b | `video-core.tsx` §954 / `video-core-events.ts` | The only caller of `dispatchVideoLoadedEvent()` is a `useUpdateEffect`, which is skipped on mount, so a player mounted *with* playback info never announced its stream. Added a deduped, `clientId`-aware mount-case dispatch. |
| — | `src/media/StudyPlayerSlice.tsx` | `<VideoCore>` was mounted inside `{state.active && …}`. Upstream mounts it unconditionally (`native-player.tsx` §340-348). Conditional mounting is what exposed 3a/3b. Now unconditional, hidden by CSS while idle. |

3a and 3b are captured as `patches/seanime/0003-video-core-active-player-and-loaded-announce.patch`,
which `git apply --check`s clean against pinned `9bdd052` and leaves the checkout pristine.

Server side, the two lines that had never once appeared now log:

```text
2026-07-28 15:59:55 directstream > Video loaded metadata
2026-07-28 15:59:55 directstream > Starting new subtitle stream offset=0
2026-07-28 15:59:55 mkvparser    > Subtitle event codecId=S_TEXT/ASS duration=3000 startTime=2000 trackNum=4
2026-07-28 15:59:55 directstream > First subtitle event sent offset=0
2026-07-28 15:59:55 directstream > Player seeked currentTime=0
```

Client side:

```text
manager        VideoCoreSubtitleManager (real class)
subtitleEvents 12 real MKVParser_SubtitleEvent
cuechange      11 activations, both tracks, readyState 4, duration 30.386
track 4        2000-5000    The cat is sleeping by the window.
track 3        2148-5148    猫が窓辺で寝ている。
track 3        6648-9398    今日は本当にいい天気ですね。
track 3        11148-14148  raw "{\pos(960,900)}彼女は駅まで走って行った。" -> display stripped
```

The raw/display contract holds: the ASS override tag survives on the cue and is stripped
only for presentation.

#### Live Anki export — note POSITIVE, assets NEGATIVE

Cue `3:0` (`2148–5148 ms`) was mined through the real panel: a **171,302-byte PNG** and a
**48,843-byte WebM** captured from the one VideoCore clock, then `ankiMineNote` against the
live 83-deck collection. `addNote` returned note `1785243770143` with real provenance tags
(`cue-3-0`, `media-154587`, `video-core`). The panel's **Undo** deleted it; both media files
were removed; 83 decks before and after; 0 residual `video-core` notes.

**The note referenced neither asset.** Both files reached Anki's media folder, but the
routed model `JP Study App::JA Immersion` has fields `[Term, Reading, Sentence]` only — no
picture or audio role — so `src/main/anki/index.ts` §330 drops the image and no `[sound:]`
reference lands. Recorded as open; it is a model/field-mapping decision, not a player fault.

Also observed: the panel's "Anki destination" is silently ignored when a mining rule
matches (`index.ts` §310-314 `routedToRule`), so a card aimed at `StudyOS::_MigrationProbe`
went to `JP Study::Immersion`. Documented policy, but the UI gives no indication.

Regression gates after the change: **253 files / 2,903 tests pass**; `tsc --noEmit` at the
unchanged **290-diagnostic** baseline with **0 in the slice**.

---

## Slice 23 (2026-08-01) — Blanc's toolbox player plays, and its frame was collapsing it

Appended by the Blanc-player session; earlier sections untouched.

Blanc's toolbox player had never been observed playing a file. It has now been driven live
in Blanc's own `BrowserWindow` (`blanc.html?blanc=1`, opened over `window.api.blancOpen()`),
at 560x460, with the sidecar started and verified `ready` **before** anything was driven:
`4.028 -> 8.039 s`, `1920x1080`, duration `30.386`, inside `#media-workspace.blanc-study-player`.
All ten harness phases PASS — `docs/migration/proof/blanc-player-live-20260801065000/`.

**The frame was collapsing the surface, and a passing assertion was hiding it.** With the
video decoding at 1920x1080 and the clock advancing, the frame measured **392x0**, the
`.study-player-slice` **392x0** (`position: fixed`), and the `<video>` **392x0** — nothing
on screen (`proof/blanc-open-retry-20260801061000/`). Two causes, both in
`src/renderer/theme/blanc-media.css`, both now fixed:

- `max-height` alone left the frame's height `auto`, and the adopted subtree below the slice
  is a chain of Tailwind `h-full` divs — a percentage of an auto height is zero. The frame
  now carries a definite `height: clamp(180px, 60vh, calc(100vh - 200px))`.
- The slice is `position: fixed; inset: 0`, so as a child it contributed no height to the
  frame either. `height: auto` was the previous attempt at this and is exactly what the
  measurement disproved. It is now `position: relative; inset: auto; height: 100%`.

After the fix: frame `392x221`, video `392x189` (the 45vh cap holding), dock `353x165`, all
inside the frame, no horizontal page scroll, Blanc's nav still hit-testing back to itself.

The keymap question is answered too, by pressing keys rather than counting listeners:
R → 6.519 (cue 6.5), W → 2.002 (cue 2.0), S → 6.515 (cue 6.5), unbound `x` → no seek, and
the toolbox tab unchanged across every press. Blanc's own three `keydown` handlers are all
conditional and none is live on the Media tab.

**Open, and a real user hits it.** Blanc's *first* directstream open fails every time: the
panel shows "Opening local file" and stops. `React.StrictMode` double-invokes the launch
effect on mount, two sockets share one client id, and the sidecar logs
`Skipping open step for cancelled preparation` when the released socket disconnects. The
main window escapes this only because its open arrives as an event at an already-settled
session. The harness recovers by re-requesting on the still-mounted session; the product
fix belongs in `StudyPlayerSlice`/`BlancStudyPlayer` and is not made here. Dev build only.

Gates after the change: **331 files / 3788 tests pass**; `tsc --noEmit` at the unchanged
**288**-diagnostic baseline with 0 in the slice; i18n exit 0 (6348 keys); architecture audit
exit 0 ("Nothing new"); CSS containment 6950/6950 scoped.

---

## Slice 35 (2026-08-01) — a resume write could delete a position the user really reached

Appended by the resume-write session; earlier sections untouched. **Nothing here ran live.**

`ResumeTracker` in `src/media/StudyPlayerSlice.tsx` persists `video.currentTime` from four
triggers — a `timeupdate` that moved ≥ 2 s, `pause`, `ended`, and its own effect **teardown**.
The teardown is not the user doing anything, and a write of `0` is not neutral in this app:
`resolveVideoCoreResumePosition` returns 0 for any stored entry below 1 s, and
`seanimeContinueWatching` drops any row under `CONTINUE_WATCHING_MIN_POSITION_SEC` (10 s). A
zero therefore deletes the resume point and the Continue Watching row together.

The element says `currentTime === 0` both when the user is at the top of the file and when it
has no media at all — and the adopted lifecycle effect (`video-core.tsx` §965-970) empties it
(`pause() / removeAttribute("src") / load()`) whenever playback info goes null, which our own
`open-and-await` branch does on **every** open. Two sequences destroyed a stored position with
nothing watched: opening an episode and leaving before a frame decodes (or hitting the
silent-open stall), and any teardown that lands after the element was emptied.

`src/shared/videoCoreResumeWrite.ts` (new) decides between `save`, `clear` and the outcome the
old code could not express, **`skip`**. `hasMedia` is read off the element as
`readyState > 0 || currentSrc !== ''` — the exact signal the lifecycle effect destroys, and
sound because VideoCore attaches the stream as a `src` attribute (§443). A sub-threshold
position may `clear` a stored point only when the session had genuinely started: a rewind to
0:00 after eight minutes is a decision, an unplayed 0 is not.

Evidence: `docs/migration/proof/resume-write-20260801221721/resume-write.json` — the wiring
check (rule in the shipped persist path, all four triggers, `skip` honoured), both sequences
replayed through the **real compiled** rule with the pre-slice rule modelled beside them
(`8.8 → 0` becomes `8.8 → 8.8`; `528 → 0` becomes `528 → 528`), and the cost priced through
the real Continue Watching join. The gate is verified to exit 1 on the before-state three
ways, including a reverted wiring; every mutated file was restored byte-exactly (sha256).

**The 2026-07-30 open question is NOT answered.** Its ruling-out ("re-read immediately before
dispatch to rule out `ResumeTracker` overwriting it") covers the window *before* dispatch,
while the write that matters is *after* it: the file was already active, so its live session's
teardown persist fires when `open-and-await` nulls the playback info — between the dispatch
and the `watch` handler that is the only reader of the store. That is a mechanism, not a
measurement. The control run and the discriminator it needs are in NEXT_SESSION.md, slice 35.

Gates: `tsc --noEmit` **289**, 0 in any file this slice touched; targeted ESLint exit 0;
resume-and-continuity surface **10 / 10 files, 115 / 115 tests**; 15 new tests and 6 mutants,
all caught. The full suite reads 337 files / 3,927 tests with one failure in
`malDownloadDialog.test.ts`, another session's file, written during the run. No UI string
changed, so i18n was not re-run.

---

## Slice 36 (2026-08-01) — the carried list was audited, and half of it had expired

Appended by the same session as slice 35; earlier sections untouched. No `src/` file was
touched.

Ten reasons this track carries were re-checked against the tree. **Five had expired**, and the
two worth naming are the ones that cost real time: *"no analyse-shaped API is exposed in
`preload.ts` at all"* was still in the list twice although slice 34 had already wired and
pressed the action through `preload.ts:1275`, and *"decide the shell-wide layering question —
the palette renders behind the media workspace"* had been fixed by **slice 10** and carried for
25 slices afterwards. Also expired: Blanc routing recorded as *NOT STARTED* (done in slice 15),
and `ResultPanels.tsx:235` recorded as the next unfixed seam of slice 14's class (it already
goes through `reachMediaWorkspace`).

One was **narrowed rather than closed**: the Library / Readiness / Review switch *was* seen live
on 2026-07-31 (`phase6-live-pass.json`, `libraryReadinessReviewSwitch = PASS`, real clicks), so
only the two Anki-dependent halves of that entry survive — and they are the Anki blocker already
tracked. Deleting a claim to make an audit green is the failure mode such a tool invites;
narrowing is the move, and it is stated in the tool's own header.

The instrument is `docs/migration/tools/audit-carried-items.mjs`: ten claims, each with the
record line it belongs to, exiting 1 on divergence — verified to do so by flipping one entry
back to its stale value. The five that still hold are recorded too, because "checked and still
true" and "never checked" read identically in prose: the untracked `main/mediaStudyOrchestrator.ts`,
the propless `<SeanimeStudyLibraryPanel />` at `MediaWorkspaceHost.tsx:339`, AnkiConnect
refusing 8765, `MediaContent.tsx` at 1267/231 against `HEAD`, and `src/media/**` still outside
every vitest include glob.

Every correction in `progress.json` keeps its original text after a `WAS:`, so nothing was
rewritten. Evidence: `docs/migration/proof/carried-items-20260801/carried-items.json`.

---

## Slice 37 (2026-08-01) — the un-recallable recovery POST has a design, and it is unwired

Appended by the same session as slices 35 and 36. **Stage 2 is unchanged**:
`DIRECTSTREAM_MEDIA_REPORT_ONLY` is still `0`, no POST is issued, and `StudyPlayerSlice.tsx`
does not import the new module.

Slice 32 left "wire a stage 2" blocked on the *transport*, not on the predicate: a recovery
POST issued against attempt N can still be in flight when attempt N+1 goes live, and
`BeginOpen` → `beginSubtitleSeek` stops every active subtitle stream. It named two possible
fixes — a generation the sidecar can reject, or a rule that never issues while a newer open is
outstanding — and said neither existed. `src/shared/directstreamOpenChannel.ts` is the second.

Every open presents a ticket; the channel answers `issue`, `queue` or `drop` from two facts
(the current intent, whether a POST is outstanding). At most one POST is outstanding; a launch
supersedes and queues, going out as soon as the outstanding POST is answered, so the sidecar's
last `BeginOpen` is always the newest intent; and **a recovery is dropped, never queued** —
a POST that outlives the state that justified it is the whole bug. Replayed against the
failing run's timeline (launch N, stage 2 at 10 724 ms, launch N+1 at ~20.9 s), the recovery
is dropped as `busy` and N+1 is issued only after N is answered.

**The hole is named in the module's own header.** `settled` must mean the server answered, not
that our `fetch` stopped: aborting a fetch abandons the response, never the work. A caller that
settles in its `AbortError` branch restores the race, and since aborts come from effect
cleanup, that caller looks reasonable. What no client rule can close — an open the client
abandons, the sidecar processes, and the client never learns the end of — needs a sidecar
patch, and that is now all that is left of this blocker.

A 500-sequence seeded property test found a hole in the module before anything else did:
`directstreamOpenReset` nulls the intent, and the permissive recovery gate let a recovery for a
dead request out after a reset. The gate now demands an exact match with a live intent —
"cannot tell" must not resolve to "send it". 15 tests, six mutants, all caught, module restored
byte-exactly. `tsc` 289 with none in either new file; ESLint exit 0. No live run: wiring is the
step that needs one, and wiring is deliberately not done here.

---

## Slice 38 (2026-08-01) — the control run ran, and the 2026-07-30 open question is answered

Appended by the same session as slices 35-37.

Phase J of `retirement-step3-harness.mjs` is the two-row control slice 35 specified for the
2026-07-30 open question. Row 1 needs a session that **never started**, where the teardown must
`skip` so a planted position survives to be read at `watch`. Row 2 parks at `12` and requires
the reopen to land on `12`: a reopen honouring the live position is the store *working*, and
without that row a passing row 1 could not be told from "resume is broken".

**The first cut of row 1 was wrong in a way worth keeping.** It parked at `0.4` after phases
C-I had played the file to ~12 s, which is the *deliberate rewind* case — `sessionMaxSec` spans
the whole `ResumeTracker` effect — and slice 35's rule clears that on purpose. A rewind cannot
construct a never-started session, and neither can clearing the store by hand (run 1 below is
the proof). The setup has to **use** the teardown: rewind below the floor so it takes the
`clear` branch, and the next open then starts at zero with its session max under the floor. The
pause guard exists because `openFileWithRetry` waits for `readyState >= 2` while an autoplaying
element runs on; it cannot suppress the restore, since `restoreSeekTime` only calls
`play()`/`pause()` for an explicit boolean and `canplay` fires either way. If the guarded open
still lands above the floor the row reports **INFO, not FAIL**.

**The first attempt did not run, for a measured environmental reason** — the built main
resolves the renderer to `http://localhost:5173`, `.vite/build/` was rewritten at 22:39 inside
the 22:37-22:39 run window, and by 22:41 nothing was listening on 5173 at all. That record is
kept as a negative: `proof/retirement-step3-20260801193700/`, zero phases reached.

**Then it ran, and the question is answered.** By 22:44 there were zero Electron processes and
no dev server, so this session started its own Vite on 5173, ran three times, and stopped it
afterwards (port free, zero Electron and zero `seanime.exe` left; nothing under `src/` has an
mtime inside any run window).

The answer came from the row that reported INFO. Run 1
(`proof/retirement-step3-20260801194522`, ten phases PASS) cleared the store entry
**immediately before the dispatch** — the same precaution the 2026-07-30 entry took — and the
reopen resumed at **7.292**, with the store holding `7.292` afterwards. Nothing else writes
that key: `disableRestoreFromContinuity` is set, no `startAtSec` was supplied, the profile is
fresh per run. So between a dispatch that left the store empty and the `watch` handler that is
its only reader, `ResumeTracker`'s teardown persist wrote the live position. **The entry's
ruling-out is sound and looks at the wrong side of the dispatch**, and the original probe saw
`0` because its live element was near `0`: a sub-second position, floored to zero by
`resolveVideoCoreResumePosition`. Resume was never broken.

Run 3 (`proof/retirement-step3-20260801195221`, ten phases PASS) entered the branch: rewound
to `0.400`, the teardown **cleared** the row, the clearing open started at `0.016`, `8.8` was
planted, and the reopen resumed at **8.800** with the store still holding `8.8`. Row 2 parked
at `12`, planted `8.8`, and resumed at **12.000** — the plant overwritten, which is the control
that stops "resume is broken" being written up again. All three branches of slice 35's rule —
`clear`, `skip`, `save` — are now verified live.

Two things that are **not** this slice's: run 2
(`proof/retirement-step3-20260801194942`) failed phase E with slice 32's intermittent cue
signature on a byte-identical tree (session tally 2 PASS / 1 FAIL, nothing wired), and every
run still reports `openAttempts: 2`, the known StrictMode first-open defect.

---

## Slice 39 (2026-08-01) — the channel was wired and reverted, for want of a live run

`src/media/` is back to its slice-35 state. `shared/directstreamOpenChannel.ts` gained the two
pieces the wiring showed it needed — `directstreamOpenSupersede` (a launch that will not wait,
because the dangerous inversion is a *recovery* landing inside a later open, while a launch is
the newest intent there is) and `directstreamOpenOverdue` with a deadline (because a
correctness rule that can hang is not a correctness rule). 23 tests, 10 mutants, all caught.

The wiring itself was two edits: the launch POST took the channel, and the stage-1 recovery
asked the channel before posting, breaking out on `busy` or `superseded` without counting an
attempt. Two live runs then failed at phase I, which three runs an hour earlier had passed —
and the cause was found rather than guessed. `npx vite --strictPort` had refused to start with
`Port 5173 is already in use`, and the owner of that port was
`@electron-forge/cli/dist/electron-forge-start.js`: **another session had restarted `npm
start`**, so both runs measured somebody else's in-flight source and neither says anything
about the change. With no way to verify it, it goes back out — the third wiring on this line to
be reverted, and the first that was never given a chance to fail.

The specific risk a future session must measure: **Blanc's first open depends on the stage-1
recovery firing**, so a gate that refuses one can bring that defect back. Land it by owning the
dev server for the whole run, wiring only the recovery gate, and checking `openAttempts` and
phases C/E/J against this session's baselines (`proof/retirement-step3-20260801194522` and
`-20260801195221`, ten phases PASS at `openAttempts: 2`), then `blanc-player-harness.mjs`.

**Process note.** The revert was scripted in Python, and `io.open(path, 'w')` on Windows
silently rewrote every line ending to CRLF — 1,072 CRs in `StudyPlayerSlice.tsx`, 5,463 in
`NEXT_SESSION.md`. Nothing failed loudly; what failed was `measure-resume-write.mjs`'s wiring
check, whose anchors contain `\n`, and it read as slice 35's wiring having come out with slice
39's. All four files are back to LF and the gate passes. Check `git diff --stat` after any
scripted edit: a diff an order of magnitude larger than the change is the tell.

---

## Slice 40 (2026-08-01) — two test files that had never run, ran

`vitest.config.ts` collects `src/renderer/__tests__/**/*.test.ts` — `.ts`, not `.tsx` — and
that directory holds two `.tsx` files, `externalPlayerPanel.test.tsx` and
`mediaTrackingSourcesHistory.test.tsx`. Phase 5's `stillOpen` named them and correctly left the
root glob alone (`CLAUDE.md` keeps root configs out of scope), but *out of scope to fix* became
*out of sight*: neither had ever been executed, and both had drifted from the components they
describe.

`docs/migration/tools/vitest.tsx.config.mjs` runs them without touching anything at the root:
**2 files / 4 tests pass**. The real fix is still one character in `vitest.config.ts`
(`*.test.{ts,tsx}`) and still belongs to that file's owner.

Three failures on first execution, all three in the test rather than the product:
`useSettings outside SettingsProvider` (the panel's `SettingsCard` gained a context dependency
after the test was written); `expected 'Assign' to be 'Export JSON'` (the assertion read
`querySelector('button')`, and the panel has since gained an assign control above the audit
block); and `expected null to be '5'`.

The third is the transferable one. **`input.value = x` writes past React's value tracker**, so
no synthetic `change` fires and `onChange` never runs — the element shows the new text and the
component knows nothing. The retention store was never written because the handler was never
called; the product is a correct controlled input. The same pattern sat in the other file's
form-filling, where it had been a silent no-op for the life of the file: its assertions did not
depend on the typed values, so it would have passed while proving nothing about "creates a
player profile through the renderer form". Both now type through the native setter, and that
test asserts the one observable that requires the typing to have reached the component —
`Save player` disabled with no fields, still disabled with only a name, enabled with both.

Gates: the root suite's own directory (`npx vitest run src/renderer/__tests__/`) is unchanged
at **106 files / 926 tests**, because the configured surface still cannot see these files;
ESLint exit 0 on both; endings normalised to LF (one file had picked up 101 CRs). No component
was touched — every fix was in a test.

---

## Slice 41 (2026-08-01) — the sidecar half of the stale-open fix

`patches/seanime/0004-directstream-open-generation.patch` gives the sidecar a generation it can
refuse. Slices 32, 37 and 39 all end at the same sentence: a recovery request the client has
already sent **cannot be recalled** — `fetch`'s abort abandons the response, never the work —
so it can land inside a later open, where `BeginOpen` → `beginSubtitleSeek` strips that open's
subtitles. Slice 32 named the only two possible fixes; `shared/directstreamOpenChannel.ts` is
the client-side one and closes everything except the abandoned-fetch case. This is the other.

`Manager.AcceptOpenGeneration(clientId, generation)` is consulted **before** `BeginOpen`, since
`BeginOpen` is itself the destructive step. A generation of 0 or no client id is accepted and
records nothing, so every existing client is unaffected; a newer generation is accepted and
becomes the bar; an **equal** one is accepted, because a re-open of the same request is the
legitimate recovery this exists to protect; only a strictly older one is refused. Clients are
ordered independently and a refusal does not move the bar.

**It is inert until a client opts in** — nothing sends `generation`, not Study OS and not
upstream — which is exactly what makes the server half landable and verifiable on its own. The
client half (`generation: requestId` on the open body and on every recovery for that request)
belongs with the session that wires `directstreamOpenChannel`, and it is not in
`build-patched-sidecar.mjs`'s patch list.

121 insertions, 0 deletions. Verified against a fresh clone of the pin: `git apply --check`
clean, `go vet` clean, `go build ./internal/directstream ./internal/handlers` clean, five new
subtests pass, the whole `internal/directstream` package's existing tests still pass, and the
pinned checkout's `HEAD` is asserted unmoved. Evidence:
`docs/migration/proof/open-generation-patch-20260801232841/`; re-run with
`node docs/migration/tools/verify-open-generation-patch.mjs`.

Two machine traps encoded in that tool: Git Bash's `tar` reads `-C C:\…` as a remote host, so
`git archive | tar` cannot stage the pin here (both tools clone instead); and `git clone`
honours the global `core.autocrlf`, which would check the tree out as CRLF and make every
multi-line anchor and hunk context stop matching — both clone with `-c core.autocrlf=false`.
That is slice 39's CRLF lesson arriving from a different direction on the same day.

---

## Slice 42 (2026-08-01) — the Anki blocker lifted, and the tool caught it

The session's final gate sweep exited 1 with `DRIFT anki-unreachable — AnkiConnect ANSWERS`.
Slices 32, 33 and 34 each re-probed 8765 by hand and each wrote "still blocked on the user";
this time nobody looked, `audit-carried-items.mjs` did, six minutes after Anki came up. That is
what slice 36 built it for.

What had never run was not the rollup arithmetic — `seanimeWatchLoopCards` has been unit tested
since slice 6 — but **the join in the middle**: a real `IntervalSnapshot`, built from real
cards, reaching it. `docs/migration/tools/anki-rollup-gate.mjs` runs exactly that with no
Electron, no dev server and no renderer: the **shipped** `src/main/anki/intervals.ts` (bundled
with only `electron` stubbed) builds a snapshot over the real AnkiConnect actions, one
namespaced probe note carries the miner's own tag shape, and the **shipped**
`seanimeWatchLoopCards` / `seanimeWatchLoopByEntry` produce the rollup.

Measured: 1 entry from 1 note (`ivl 0d`, model `JP Study App::JA Immersion`); the card reads
**`new`** with the snapshot and **`untracked`** without it; the entry rollup is
`{ cards: 1, attention: 0, known: 0 }` keyed by the resume path key; cleanup deleted the note
by id, removed the deck, and left 0 residual with 83 decks before and after.

That `new` versus `untracked` difference is the whole gate — the live snapshot is what puts a
stage on the card, so this proves the join rather than the arithmetic.

**Not closed:** the mining history here is a probe fixture, not the user's own. Real history
lives in renderer `localStorage`, so the in-app view still needs the dev server and a real
mined card. The carried claim was rewritten rather than ticked off: `anki-unreachable` is gone
from the audit (it flips whenever somebody opens or closes Anki, and would report DRIFT about a
desktop rather than about this project) and `rollup-unseen-in-the-app` takes its place.
