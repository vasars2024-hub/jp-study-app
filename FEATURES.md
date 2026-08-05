# Features

A reference index of what this app actually contains, for finding things and for
debugging. **Not marketing.** If a feature is here, the `file:line` next to it is
where it starts; if it is broken or unproven, this document says so.

Derived by walking the tree on **2026-08-05**, not from the planning documents —
several of those describe things that were never built. Where a count here
disagrees with a plan, the plan is stale.

## How to read a row

| Marker | Means |
|---|---|
| **DRIVEN** | Someone ran it in the live app and observed the side effect. The audit row or handoff that did it is named. |
| **TESTED** | Covered by the suite, but never driven end to end. `jp-dispatch` §9.2: "implemented", not "works". |
| **UNVERIFIED** | Present in the code, no evidence either way. Treat as a claim. |
| **BROKEN** | Measured, reproducible defect. Links `docs/KNOWN_ISSUES.md`. |

Nothing here is marked DRIVEN on the strength of a passing test. That distinction
is the whole point of the column.

**Registries worth knowing**, because most of this document is derived from them:

| Registry | Where | Holds |
|---|---|---|
| Desktop window sections | `src/shared/desktop.ts:8` | 24 |
| Settings pages | `src/renderer/components/settings/types.ts:21` | 21 |
| Settings sidebar order | `src/renderer/components/settings/settingsRegistry.ts:11` | — |
| Scraper pages | `src/shared/scraperShell.ts:15` | 17 |
| Games | `src/renderer/games/engine.ts:20` | 15 |
| Blanc toolbox modules | `src/shared/toolboxRegistry.ts:146` | 38 |
| Downloadable assets | `src/shared/assetRegistry.ts:293` | 21 |
| Keyboard commands | `src/renderer/keyboardShortcuts.ts:72` | 125 |

---

## 1. Desktop shell

The app presents as a small desktop OS: a wallpaper, draggable windows, a Start
menu and a taskbar. Every major surface below opens as a window section from
`DesktopWinSection` (`src/shared/desktop.ts:8`).

The 24 sections: `library`, `novels`, `dictionary`, `grammar`, `notebook`,
`translate`, `player`, `video`, `music`, `anki`, `flashcards`, `games`, `stats`,
`resources`, `settings`, `note`, `visualizer`, `musicwidget`, `city`,
`immersion`, `calendar`, `reading`, `youtube`, `scraper`.

| Feature | Entry point | Reachability | Status |
|---|---|---|---|
| Window manager (drag, resize, focus, pop-out) | `src/renderer/components/DesktopShell.tsx` | Always | UNVERIFIED |
| Start menu | `DesktopShell.tsx` | Taskbar | UNVERIFIED |
| Taskbar clock, locale-formatted | `DesktopShell.tsx` | Always | **DRIVEN** — C1-2 verified the clock renders `5 авг.` in RU and `8月5日` in JA while the host locale stayed `en-US` |
| Keyboard command palette / shortcuts | `src/renderer/keyboardShortcuts.ts:72` (125 commands) | Global | UNVERIFIED |
| Mini shell | `src/renderer/components/MiniShell.tsx` | Settings → Mini | UNVERIFIED |
| Lockscreen | `src/renderer/components/Lockscreen.tsx` | Settings → Lockscreen | UNVERIFIED |
| Notification centre | `src/renderer/components/shell/NotificationCenter.tsx` | Taskbar | UNVERIFIED |
| Themes (incl. `soft-sepia`, `rose-pine`, `frutiger-aero`) | `src/renderer/theme/engine.ts:73`, `:77` | Settings → Appearance | **DRIVEN** — audit U6 measured both themes live and closed them working-as-intended |

---

## 2. Reading Lens

A **system-wide screen-OCR reader**. It is **enabled by default** and claims an
OS-level global accelerator at boot.

| Feature | Entry point | Reachability | Status |
|---|---|---|---|
| Global hotkey capture | `src/main/readingLens.ts:57` — `{ enabled: true, hotkey: 'Ctrl+Shift+Space' }` | Global hotkey, anywhere in the OS | TESTED |
| Lens configuration | `src/main/readingLens.ts:76` | Settings → Reading | TESTED |
| Screen region OCR | `src/main/screenOcr.ts` | Via the hotkey | TESTED |
| Lens overlay / reader / analysis panels | `src/renderer/components/lens/` | After a capture | TESTED |

**Caveat that matters:** the 98 tests here stub Electron throughout. No test
performs a real `desktopCapturer` capture or a real hotkey press. See
`docs/KNOWN_ISSUES.md` **KI-6**.

---

## 3. Dictionary, Grammar, Study

| Feature | Entry point | Reachability | Status |
|---|---|---|---|
| Dictionary lookup | `src/renderer/views/DictionaryView.tsx` | Start → Dictionary | UNVERIFIED |
| Jiten dictionary backend | `src/shared/jiten.ts` | Dictionary | UNVERIFIED |
| Grammar explorer | `src/renderer/components/grammar/GrammarExplorer.tsx` | Start → Grammar | UNVERIFIED |
| Grammar practice | `src/renderer/components/grammar/GrammarPracticePanel.tsx` | Grammar | UNVERIFIED |
| Grammar curation | `src/renderer/components/grammar/GrammarCurationPanel.tsx` | Grammar | UNVERIFIED |
| Sentence analysis | `src/renderer/components/SentenceAnalysisPanel.tsx` | Reader, Dictionary | UNVERIFIED |
| Pitch accent | `src/shared/pitchAccent.ts` | Dictionary | UNVERIFIED |
| Review forecast | `src/shared/reviewForecast.ts` | Stats, Blanc | Partly **BROKEN** — `dayLabel` renders in the OS locale and hardcodes English. `docs/KNOWN_ISSUES.md` **KI-1** |

---

## 4. Anki, flashcards, notebook

| Feature | Entry point | Reachability | Status |
|---|---|---|---|
| Anki card preview | `src/renderer/components/AnkiCardPreview.tsx` | Start → Anki | UNVERIFIED |
| `.apkg` import | `src/main/anki/apkgImport.ts` | Anki | UNVERIFIED |
| Field mapping editor | `src/renderer/components/FieldMappingEditor.tsx` | Anki | UNVERIFIED |
| Note CSS editor | `src/renderer/components/NoteCssEditor.tsx` | Anki | UNVERIFIED |
| Jiten mining panel | `src/renderer/components/JitenMiningPanel.tsx` | Reader, Dictionary | UNVERIFIED |
| Live captions | `src/renderer/components/notebook/LiveCaptionsPanel.tsx` | Start → Notebook | UNVERIFIED |

> **U3 is a standing user-only item.** Five `JP Study App::*` note types in the
> real Anki collection cannot be removed programmatically — AnkiConnect has no
> `deleteModel`. Only removable from Anki's own Manage Note Types dialog.

---

## 5. Games

15 games, all defined in `src/renderer/games/engine.ts:20` (`GAME_DEFINITIONS`).
Reachable from Start → Games.

`sentence-builder`, `speed-type`, `word-match`, `kana-sprint`, `kanji-reading`,
`cloze-blitz`, `listening-flash`, `particle-panic`, `counter-quiz`,
`reverse-recall`, `star-invaders`, `comet-courier`, `capsule-sorter`,
`signal-simon`, `mirror-writing`.

Status: UNVERIFIED as gameplay. i18n coverage **is** tested
(`src/renderer/__tests__/arcadeGamesI18n.test.tsx`).

---

## 6. Media

| Feature | Entry point | Reachability | Status |
|---|---|---|---|
| Media library | `src/renderer/views/LibraryView.tsx` | Start → Library | UNVERIFIED |
| Media workspace (Seanime sidecar) | `src/media/MediaWorkspaceHost.tsx:85` | Start → Media | **DRIVEN** — F15/F16 both refuted on the live app; open/close state tracks the real overlay in both directions |
| External player handoff | `src/shared/externalPlayer.ts` | Library | UNVERIFIED |
| Media tracking calendar | `src/renderer/components/media/MediaTrackingCalendar.tsx` | Media | UNVERIFIED |
| MyAnimeList sync | `src/main/malSync.ts` | Settings → Media tracking | **UNVERIFIED, and known-unproven** — audit U5: 44 passing tests, zero real bytes to MyAnimeList. Needs the user's own account |
| YouTube playlists | `src/renderer/views/YouTubePlaylistsView.tsx` | Start → YouTube | UNVERIFIED |
| Music widget / visualizer | `src/renderer/components/FocusMusicBar.tsx` | Start → Music | UNVERIFIED |
| Transcription queue | `src/main/transcriptionJobs.ts:340` | Media, automatic | **BROKEN on defaults** — see §7 |

---

## 7. Transcription (Whisper)

Two separate model systems, and **they are not the same one**. This has already
caused a "downloads don't match the dropdown" confusion, so it is spelled out.

**What actually runs:** Transformers.js in a renderer worker, loading ONNX
weights from HuggingFace by model id.

- Worker: `src/renderer/whisperWorker.ts` (`env.allowLocalModels = false`, so it
  never reads a local file)
- Tiers: `src/shared/whisperModels.ts:24` — `Xenova/whisper-base`,
  `Xenova/whisper-small`, `onnx-community/kotoba-whisper-v2.0`,
  `whisper-large-v3-turbo`
- Reachable: Settings → Transcription (download ahead of time), or automatically
  on first use from the player

**What does not run:** the four `whisper-*` ggml entries in the asset catalog
(`src/shared/assetRegistry.ts:295-341`). They are reserved for a future
whisper.cpp path, nothing loads them, and they are deliberately hidden from the
Storage page (`StoragePage.tsx:28-33`).

| Finding | Status |
|---|---|
| Default Japanese tier `kotoba-whisper-v2.0` is gated — HF answers **401** | **BROKEN**, `docs/KNOWN_ISSUES.md` **KI-7** |
| Default WebGPU device returns degenerate Japanese transcripts | **BROKEN**, `docs/KNOWN_ISSUES.md` **KI-8** |
| Transcription on CPU/fp32 with `Xenova/whisper-base` | **DRIVEN** — transcribed synthesised Japanese speech correctly |

### Measured cost, so the real price is known before triggering it

Driven 2026-08-05 on the live app (C1-9). Times are wall clock on this machine.

| What | Size | Time |
|---|---|---|
| `whisper-base` ggml asset (catalog; **not used by transcription**) | 147,951,465 B (141 MiB) | ~13.3 s transfer, peak 68.4 MB/s |
| `Xenova/whisper-base` fp32, CPU — first use incl. download | — | **54.4 s** |
| `Xenova/whisper-base` fp32, CPU — cached | — | 7.1 s for 3.7 s of audio |
| `Xenova/whisper-base` q4/WebGPU — cached | — | 8.2 s (but see KI-8) |

---

## 8. Scraper

A 17-page console (`src/shared/scraperShell.ts:15`), reachable from Start →
Scraper. Backend registration: `src/main/scraper/index.ts:134`
(`registerScraperIpc`), which also publishes the capability list the UI uses to
decide what is real.

| Page | Entry point | Status |
|---|---|---|
| Dashboard | `pages/DashboardPage.tsx` | UNVERIFIED (`featureStatus.ts` marks it `untested`) |
| New scrape | `pages/NewScrapePage.tsx` | Marked `ready` — driven previously against a title and a URL |
| Discover (catalogue search) | `pages/DiscoverPage.tsx` | Marked `ready` — the one surface with a real backend from the start |
| **Airing schedule → releases** | `pages/AiringSchedulePanel.tsx`, `src/shared/animeSchedule.ts`, `src/main/scraper/animeSchedule.ts` | **DRIVEN** — see below |
| Results | `pages/DataPages.tsx` | UNVERIFIED |
| Torrent manager | `pages/TorrentManagerPage.tsx` | UNVERIFIED |
| Sources / profiles / scheduled / site-rules / plugins / downloads / exports | `pages/ManagementPages.tsx`, `pages/DataPages.tsx` | UNVERIFIED |
| Selector tester, regex tester, HTTP inspector, script console | `pages/ToolPages.tsx` | UNVERIFIED |

### Dashboard → Results handoff (audit F4)

**Fixed and covered.** `DashboardPage.tsx:312` passes
`librarySeriesId(entry.jobId, entry.seriesId)` — the per-job id the Results
library actually stores — and `src/renderer/__tests__/scraperDashboardResultLink.test.ts`
spans both id spaces so the regression cannot return.

### Airing schedule → nyaa matching (audit C1-3)

The schedule is the spine: AniList `airingSchedules` produces one row per
scheduled episode, and torrent-index releases are matched **onto** those rows.
A row with no release stays in the list and says why.

- Matcher (pure): `src/shared/animeSchedule.ts`
- Network: `src/main/scraper/animeSchedule.ts` — sequential, paced 1.2 s per
  index request
- UI: `src/renderer/components/scraper/pages/AiringSchedulePanel.tsx`, rendered
  from Discover
- Episode matching reuses `src/shared/malDownload.ts:273` and `:437` rather than
  a second matcher

Verdicts per row are `exact` / `review` / `none`, and `review` never reads as
`exact`. The four no-release reasons are distinct: index unreachable, index
returned nothing, releases exist but not this episode, nothing matched closely
enough.

**DRIVEN** against real AniList + nyaa on 2026-08-05: 14 scheduled episodes →
7 exact, 1 review, 6 with no release, 0 unreachable. *Chiikawa* episode 366
pulled 75 candidate releases and matched the single one carrying that episode.

---

## 9. Immersion and visual novels

| Feature | Entry point | Reachability | Status |
|---|---|---|---|
| Immersion hub | `src/renderer/views/ImmersionView.tsx` | Start → Immersion | UNVERIFIED |
| Visual novel panel | `src/renderer/components/immersion/VisualNovelPanel.tsx` | Immersion | UNVERIFIED |
| VN import / script import | `.../VisualNovelImportPanel.tsx`, `.../VisualNovelScriptImportPanel.tsx` | Immersion | UNVERIFIED |
| VN release catalog | `.../VisualNovelReleaseCatalog.tsx` | Immersion | UNVERIFIED |
| VN sentence assist | `.../VisualNovelSentenceAssist.tsx` | Immersion | UNVERIFIED |
| Novels reader | `src/renderer/views/NovelsView.tsx` | Start → Novels | UNVERIFIED |
| Manga reader | `src/renderer/views/MangaReader.tsx` | Library | UNVERIFIED |

---

## 10. OCR

The OCR assets are the ones the download subsystem genuinely serves, and they
are consumed:

| Feature | Entry point | Consumes |
|---|---|---|
| Manga OCR | `src/main/mangaOcr.ts:129-132` | `manga-ocr`, `manga-ocr-decoder`, `manga-ocr-vocab`, `comic-text-detector` |
| Paddle OCR | `src/main/paddleOcr.ts:169-193` | detection + per-language model/keys |
| Screen OCR (Reading Lens) | `src/main/screenOcr.ts` | via the above |

`comic-text-detector` is the **only** checksum-pinned asset in the catalog
(audit T6): its URL is frozen at release tag `beta-0.2.1`, so a hard hash check
is correct there and nowhere else.

---

## 11. Blanc

**Documented here; deliberately not modified.** Blanc is deferred by the user,
and every audit run in this series has been scoped out of it.

- Shell: `src/renderer/components/blanc/BlancShell.tsx`
- Study panels: `src/renderer/components/blanc/BlancStudyPanels.tsx`,
  `BlancStudyNativePanels.tsx`
- Module registry: `src/shared/toolboxRegistry.ts:146`

**Corrected count.** The dispatch that scoped this document described the
registry as "30 ready / 20 planned". Measured on 2026-08-05 it holds **38
modules: 37 `ready`, 1 `experimental`, and 0 `planned`.** Whatever the split
once was, there is no planned-vs-ready split left to respect — so no module in
this registry should be presented as unbuilt on the strength of that document.

`blanc-native.css` re-skins Study OS classes by name and prefix
(`:18-28` prefix match, `:35-44` explicit names). Renaming any class those rules
reach silently breaks Blanc — this is audit ruling **B7**, and it constrains the
design-system work in B1–B5.

---

## 12. Settings

21 pages (`src/renderer/components/settings/types.ts:21`), ordered for the rail
in `settingsRegistry.ts:11`:

`home`, `appearance`, `wallpaper`, `atmosphere`, `companions`, `desktop-layout`,
`shortcuts`, `mini`, `lockscreen`, `study`, `profile-rules`, `reading`,
`scraper`, `transcription`, `visualizer`, `special`, `display`, `motion`,
`storage`, `memory`, `help`.

| Notable page | Entry point | Status |
|---|---|---|
| Storage (downloadable assets) | `src/renderer/components/settings/pages/StoragePage.tsx` | Asset integrity row added by T6; **not yet seen rendering** — main-process handlers need an app restart, and the dev profile has no assets installed |
| Transcription | `.../pages/TranscriptionPage.tsx` | Downloads Transformers.js tiers ahead of use. See §7 for the two defects |
| Help | `.../pages/HelpPage.tsx` | UNVERIFIED |
| Memory | `.../pages/MemoryPage.tsx` | UNVERIFIED |

---

## 13. Downloadable assets

21 assets (`src/shared/assetRegistry.ts:293`), by kind: **ocr 11**, **whisper 4**
(unused — §7), **dictionary 2**, **accent 1**, **examples 1**, **llm 1**,
**tessdata 1**.

The download subsystem itself is the best-verified part of this app:

| Property | Where | Status |
|---|---|---|
| Disk-space pre-flight | `src/main/downloads.ts:850-865`, `preflightDiskSpace` at `src/shared/assetRegistry.ts:114` | **DRIVEN** — runs against a real `statfs`; the app's free-space number cross-checks Win32 to within one 4 KB cluster. *The refusal branch itself was not exercised: no catalog asset is large enough to exceed free space, and filling the disk was not acceptable* |
| Resumable download (`Range` + `If-Range`) | `src/main/downloads.ts:538-589` | **DRIVEN** — paused at 57,638,667 B, resumed and appended from exactly that offset, final file byte-correct |
| Atomic install (stage → rename) | `src/main/downloads.ts:684-702` | **DRIVEN** — after install, 0 files left in `.partial`, 0 `.staging` directories |
| Hash recorded per install | `src/main/downloads.ts:757-763` | **DRIVEN** — recorded sha256 matched a fresh hash of the file on disk |
| Re-verify on demand | `src/main/downloads.ts:264` | TESTED — ran clean over 14 really-installed assets |
| Content-change warning | `src/main/downloads.ts:351`, used at `:745` | TESTED |

**Every installed asset currently records `verifyMode: "size"`**, because
`comic-text-detector` is the only pinned one. The UI must never call
size-verification "verified" — `listIntegrity` deliberately exposes no boolean
that would allow it.

---

## 14. Browser extension bridge

| Feature | Entry point | Status |
|---|---|---|
| Extension HTTP server | `src/main/extensionServer.ts` | **DRIVEN** — audit P3 drove the extension feature matrix 35/35 |
| Renderer bridge UI | `src/renderer/extensionBridgeUi.ts` | **DRIVEN** (P3) |

P3 found **two BROKEN and zero DEAD** features in that matrix; see
`docs/audit/FINDINGS_EXTENSION_BRIDGE.md`.

---

## 15. Known-broken index

The single list of measured, reproducible defects is **`docs/KNOWN_ISSUES.md`**.
As of 2026-08-05 it holds:

| Row | Summary |
|---|---|
| KI-1 | `dayLabel` renders in the OS locale and hardcodes English |
| KI-2 | 60 `toLocaleString()` calls format numbers in the OS locale (ratcheted) |
| KI-3 | `grammar-audit.json` still carries pre-de-branding identifiers |
| KI-4 | Four dead catalog keys, `mediaWorkspace.section.reopen` |
| KI-5 | `Surfaces.tsx` is dead — all three primitives, not just `.ui-card` |
| KI-6 | Reading Lens is untested end to end |
| KI-7 | Default Japanese Whisper model is gated; first-use transcription fails |
| KI-8 | Default WebGPU path returns degenerate Japanese transcripts |

Items that remain the user's to run, and cannot be closed from here: **U3**
(Anki note types), **U5** (MyAnimeList token against a real account), **U7**
(clean-machine first launch).

---

## Maintaining this document

It is derived from the registries in the table at the top. When you add a
feature, add its row here with a real `file:line` and an honest status word —
and if you cannot say DRIVEN, do not write it.
