# Gum v1 release plan

Written **2026-10-13** against `theme/aero-wired-polish` at **287e8ac8**. This is a read-only audit; this file is its only output.

**What the owner decided:**
- v1 is a **finished release, not a beta**.
- **Every feature stays** and is brought to finished quality. That includes the torrent scraper with qBittorrent/Seanime and the YouTube downloader.
- **Snip to cards** is off by default and offered during first-run setup. Another agent is already doing this.
- The v1 installer is **unsigned**.

**How the scores were produced:**
- `docs/SCORECARD.md` (scored at bc13760e) was the baseline.
- Commits 8ece0f20 and 287e8ac8 claimed fixes since then, but only the EPUB row had been re-scored.
- Six parallel auditors re-scored all 37 rows at HEAD. They read the code and ran targeted vitest with `--maxWorkers=2`. Their raw reports are in `%TEMP%\claude\gum-v1-audit\reports\`.
- About 1,900 targeted tests in more than 140 files are green. There is one flake under load (`visualNovelCaptureErrorsUi.test.tsx` `beforeAll`).
- The average across all 37 rows is now **7.5**, up from 6.9.

**Scoring rule.** The scorecard's rule still holds. A row that has never been run against its real counterpart is capped at about **8.0**. The counterpart might be a real screen, a real Anki, a real provider key, real YouTube, a real installer, or a human ear or eye. So for most rows **8.5 needs two things**:
- every CODE gap below is closed, and
- the row's OWNER check (§5) has passed.

Code work alone can take a row to about 8.0–8.4. The owner's checklist is what takes it to 8.5 and above.

---

## 1. The "v1 done" bar

### 1.1 Every feature row must meet all of these

| # | Criterion | How it is checked |
|---|---|---|
| F1 | **Score ≥ 8.5** on the strict scorecard. | Re-score in the final docs package (W8-C), after the owner checks in §5. |
| F2 | **No half-done leftovers** in user-facing code or strings. That means nothing like "not yet", "only partially", "stub", "unbound", "Stored for a future …", "Unavailable until …", "Ships silent", a raw internal id shown as a tooltip, or a developer panel shown to users. | `rg -i "not yet\|only partial\|stub\|unbound\|for a future\|until a real\|ships silent\|not ready yet" src/renderer src/shared/i18n` finds no user-facing hits. Each hit that remains is either removed, wired up, or behind developer mode. |
| F3 | **No raw English in ja/zh/ru.** | All of these hold: `node tools/i18n-check.cjs` is green. `tools/i18n-hardcoded-baseline.json` is **empty** (today it lists 8 files and 80 strings). The values in ja/zh/ru that are identical to English are reviewed down to proper nouns and codes only (today ja 76, zh 76, ru 83). Main-process errors reach the UI as **codes mapped to keys**, never as `e.message` or `res.error`. |
| F4 | **The main path is covered by a test.** | There is an E2E flow in `tools/e2e/flows/`, or a unit test of the main path where E2E is impossible (for example, hardware encoders). Today these rows have no main-path E2E: Stats, Games, Widgets/Shortcuts, Notes, Settings, Soundscape, Speak (shadowing and writing), and Translate (only the missing-model path is tested). |
| F5 | **Works in all 4 themes** (Study OS, Aero, Wired, Blanc). | The feature can be reached and is styled in each theme. A pop-out fallback in Blanc does not count. The owner's eyeball pass is §5 O16. |

### 1.2 Release-wide items

| # | Item | State at 287e8ac8 | Who |
|---|---|---|---|
| R1 | **Licence, NOTICES and an About screen** | There is no About section (`settingsRegistry.ts`) and no `THIRD_PARTY_NOTICES.txt`. Two licence rows in `docs/audit/NOTICES_DRAFT_ASSETS.md` are **NOT ESTABLISHED**: the Xenova ONNX conversion and the tessdata revision. Under GPL the Seanime sidecar is a **modified** build, so its source (`patches/seanime/*.patch` plus upstream `9bdd052…`) must be published with the release (`docs/migration/LICENSING_PLAN.md`). | **The notices agent, in flight.** W7-C adds the inline credits (CC-CEDICT in `DictionaryResults.tsx`, the world map in `WorldHeatMap.tsx`, OPUS-MT on translation output) if that agent doesn't. The owner decides D10. |
| R2 | **Privacy statement** | None yet. It must cover what goes to AI providers, DeepL, LRCLIB, YouTube, indexers and GitHub (update checks), and must say that crash reports stay local. | **The notices agent, in flight.** |
| R3 | **README and screenshots** | Outdated in several ways: "Fifteen" games (there are 19), "1,810 grammar points" (there are 2,905), and no mention of Snip, AI, the recorder, the scraper, the YouTube downloader, VN, the lockscreen or the extension. The four screenshots (`docs/readme/*.png`, 2026-10-08) show only Study OS. The Branches section is stale. `FEATURES.md` was derived on 2026-08-05 and still has 46 UNVERIFIED rows. | **W8-C**, except the SmartScreen section, which belongs to the notices agent. |
| R4 | **Release notes** | None. The first bullets of the GitHub release body become the in-app "What's new" (`docs/RELEASING.md` §4). | W8-C drafts them. The owner publishes. |
| R5 | **Version bump** | `package.json` is at **1.0.1**, and v1.0.0 and v1.0.1 are already tagged as zip-only releases. Squirrel needs a higher semver. | **OWNER (D1, step R-1).** The recommendation is **1.1.0**. |
| R6 | **SmartScreen guidance for the unsigned installer** | `README.md` has one line about it, and `docs/UPDATE_TESTING.md` §2 describes the dialog. There is no screenshot of the real dialog. | The notices agent owns the README section. The owner captures the real dialog text in O1. W8-C puts it in the release notes. |
| R7 | **First-run polish** | Onboarding scores 7.8. The Snip offer is in flight. `10-setup.cjs` only covers ja + Study OS. Blanc has no tour. | W8-A, once the Snip agent has landed. |
| R8 | **Crash and error reporting, opt-in and local only** | Already there: a fatal-error dialog with "Copy details" (`src/main/crashRecovery.ts`), renderer crash reload, and a Settings → Help → Diagnostics log. Missing: the React crash screen is English in every language (`AppErrorBoundary.tsx:58,60,77`); no local native minidumps (`crashReporter` with `uploadToServer:false`); no **"Save problem report…"** option (a redacted zip of the log, version info and dumps that the user can attach to an issue). | **W4-A.** Nothing is ever sent (D9). |
| R9 | **Accessibility pass** | 20 axe suites run in jsdom, but with `color-contrast` disabled (`__tests__/helpers/axeAudit.ts:53`). The Wired panels have no tests. The NVDA checklist is **0/36**. | W6-A (Wired tests and contrast), W7-B (real-Chromium axe for each theme), **OWNER O17** (NVDA). |
| R10 | **Performance budgets** | Blanc boot is **2,305,165 / 2,411,724 B** (passes). Study OS is **4,214,682 / 4,300,000 B** (passes, but only about 85 KB of headroom). RAM is shown but has no baseline or gate. There is no cold-start metric. | W7-B adds the RAM probe and gate (baseline + 10 %) and a cold-start timing in the E2E harness. **OWNER O18** measures on real hardware and confirms the targets. |
| R11 | **Build hygiene** | `npx tsc --noEmit` gives **584 errors**: 429 in tests, 60 in vendor, 95 in app code (53 of them real). `docs/RELEASING.md` §0 still says tsc is green. Switching `tsconfig` `module` to esnext/bundler clears about 314 of them. | **W8-B.** |
| R12 | **Release candidate gates all green** | `npx vitest run` (full), `npm run e2e` (all flows), `node tools/i18n-check.cjs`, the orphan-key gate (it runs in vitest), `node tools/blanc-budget.cjs`, `npx tsc --noEmit`, and `node docs/migration/tools/license-audit-gate.mjs`. | W8-B runs them. The owner re-runs them at R-2. |
| R13 | **Branch** | `theme/aero-wired-polish` is 10 or more commits ahead of `master` (ba99af29), and releases are cut from `master`. | **OWNER, step R-5.** |

---

## 2. Feature rows: current score, remaining gaps, and the package that closes each gap

Abbreviations:
- **C** = CODE (fixable headless). **O** = OWNER.
- Effort sizes, in agent time: **S** is under half a day, **M** is about a day, **L** is 2–3 days.
- Paths are relative to `src/` unless they start with `tools/`, `extension/` or `docs/`.

Each row's "Pkg" column names the work package from §3.

### 2.1 Study core

**Flashcards / SRS + FSRS: 7.5 → 8.2**

Fixed: bugs 2, 3 and 4, a learn-ahead limit, SM-2→FSRS memory replay (`shared/fsrsMemoryReplay.ts`), and a 4 am study day.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | FSRS-5 only: add FSRS-6 and per-deck presets. Anki has both. | `shared/fsrs.ts`, `shared/fsrsOptimizer.ts`, `shared/flashcardScheduling.ts`, `shared/fsrsMemoryReplay.ts`, `renderer/components/flashcards/SchedulingPreferences.tsx`, `renderer/flashcardDeck.ts` | L | W1-B |
| O | Compare intervals with real Anki on the same deck. | | | O5 |

Tests: `50-srs.cjs`. Themes: fine.

**Stats: 7.0 → 7.8**

Fixed: bug 39 and the 4 am rollover.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Blanc Statistics has no review insights. | `components/blanc/BlancStatisticsPanel.tsx` | S | W3-B |
| C | Long ranges read only the live 50k-row log. | `components/stats/StatsReviewInsights.tsx`, `renderer/reviewLog.ts` (`loadFullReviewLog`) | S | W3-B |
| C | **No E2E.** | new `tools/e2e/flows/72-stats.cjs` | M | W3-B |

**Grammar: 6.0 → 6.8**

Fixed: bug 38, kana- and conjugation-aware cloze, practice tests no longer move schedules, and undo.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | A practice test still enrols points that aren't scheduled. | `renderer/grammarSrs.ts:132-141`, `components/grammar/GrammarTestModal.tsx` | S | W2-C |
| C | No audio (TTS) for points or examples. | `components/grammar/GrammarContent.tsx`, `GrammarReviewPanel.tsx` | M | W2-C |
| C | Content: N5 has **50** points (Bunpro has about 130). **459 of 667** zh points and **334** ja points have no example. | `renderer/data/grammar/**` | L | W2-C |
| O | Decision D6: the grammar content is English-only (`data/grammar/types.ts` has no localised fields). | | | D6 |
| O | A native speaker spot-checks the new content. | | | O19 |

Tests: `80-grammar.cjs`.

**Games: 6.0 → 7.3**

Fixed: bug 43, NFKC folding and exact readings. All 19 games are real.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | **No E2E for the arena.** | new `tools/e2e/flows/82-games.cjs` | M | W3-B |
| C | ja/zh/ru values identical to English: 5 in the `gameArena` pack, 4 in the `arcade` namespace. | `shared/i18n/gameArena/*` (W3-B), `arcade` in the catalogs (W7-C) | S | W3-B, W7-C |
| C | README says "Fifteen". | `README.md` | S | W8-C |

**Known words: 6.0 → 7.4**

Fixed: bugs 40, 41 and 42, with one language-aware `knowledgeKey`.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | No Traditional↔Simplified folding. | new `shared/zhVariants.ts`, `shared/knowledgeKey.ts` | M | W3-B |

Tests: `70-known-words.cjs`.

**Anki sync: 7.0 → 7.2**

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Mirrored due dates use midnight, not the 4 am study day. | `main/anki/reviewSync.ts:282-283`, `shared/ankiReviewSync.ts:390` | S | W1-B |
| C | Review history doesn't round-trip through `.apkg`: import ignores it, and export writes an empty review log. | `renderer/apkgImport.ts:127-129`, `apkgNoteRead.ts`, `shared/apkgCards.ts`, `main/anki/localDeckApkgCore.ts:51-60` (plus `Host`/`Worker`), `renderer/reviewLog.ts` (bulk merge) | M | W1-B |
| C | Anki's FSRS parameters are not imported. | `main/anki/ankiProtoConfig.ts`, `apkgNoteRead.ts`, `shared/apkgCards.ts:176-186` | M | W1-B |
| C | Hard-coded JA/EN placeholders in the manual-card form. | `components/anki/AnkiContent.tsx:448-484` | S | W1-B |
| O | Two-way sync against a throwaway real Anki profile. | | | O5 |

Tests: `45-anki.cjs`, against a fake AnkiConnect.

### 2.2 Lookup and reading

**Dictionary / popup: 6.5 → 7.8**

Fixed: bug 1 (155/155 forms), part-of-speech filtering, longest match, nested lookup, and kana variants.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | The Yomitan import ignores the term bank's rules column `row[3]`. | `main/dictionary/yomitanZip.ts:319-337` (test `dict3YomitanImport.test.ts`) | S | W2-B |
| C | E2E flake: a fixed 120 s wait, and a `busy` start isn't retried. | `tools/e2e/flows/20-dictionary.cjs:25-35` | S | W2-B |
| O | Run the real-data suite (`JP_DICT_REAL=1`) and compare with Yomitan. | | | O14 |

**Reading Lens: 7.0 → 7.0**

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | No "watch region" auto re-OCR. owocr and GSM both have it. | `main/readingLens.ts`, `main/screenOcr.ts`, `components/lens/ReadingLensOverlay.tsx`, `shared/i18n/lensOcrUi/*` | M | W3-A |
| C | `97-lens.cjs:35-36` skips its OCR check. It should use the bundled `web` engine, as 97b does. | `tools/e2e/flows/97-lens.cjs` | S | W3-A |
| C | Blanc has no Lens toggle. | Blanc settings card | S | W7-A |
| O | KI-6: the real hotkey, real capture and mixed DPI. | | | O4 |

**Translate: 7.0 → 7.0**

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | DeepL `formality` and `context` are never sent. | `main/translateRouter.ts:458-464` | S | W1-A |
| C | The mining cache has no size limit, and its key omits the offline model file. | `main/translate.ts` | S | W1-A |
| C | No side-by-side comparison of engines (LunaTranslator's core feature). | `translateRouter.ts`, `components/translate/TranslateContent.tsx`, `TranslateEngineBar.tsx`, `components/blanc/BlancTranslatePanel.tsx`, `shared/i18n/translateEnginesUi/*` | M | W1-A |
| C | Raw English errors are shown to the user. | `TranslateContent.tsx:365`, `SentenceTranslatePopup.tsx:80` | S | W1-A |
| C | E2E covers only the missing-model path. Add a fake provider. | `tools/e2e/flows/60-translate.cjs`, `tools/e2e/fixtures.cjs` | M | W1-A |
| O | Real DeepL, Gemini and DeepSeek keys. | | | O6 |

**Library / Files: 6.5 → 7.8**

Fixed: bugs 14 and 15, trash with Undo, resumable imports, the metadata editor, and relink.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Raw fetch errors from wiki and URL imports. | `views/LibraryView.tsx:625,671` | S | W4-C |
| C | Blanc's Read panel has no remove/Undo/trash, metadata editor, relink or import progress. | Extract `BlancShell.tsx:1143` into a new `components/blanc/BlancReadPanel.tsx`. | M | W7-A |
| O | A large real library. | | | O14 |

**EPUB / novel reader: 8.0 → 8.0**

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Bookmarks and TOC/slider jumps are geometric. They should use `novelTextAnchor`. | `views/NovelReader.tsx:2802-2823`, `renderer/bookmarks.ts` | M | W4-C |
| C | No search inside a book. | `NovelReader.tsx` plus a new search module | M–L | W4-C |
| C | No E2E for horizontal columns. | `tools/e2e/flows/30-epub.cjs`, `fixtures.cjs` | S | W4-C |
| C | Raw English. | `NovelReader.tsx:1163,2172,2176`, `NovelsContent.tsx:397,648` (W4-C); catalog keys `epub.mining.format.learn.label` (ja/zh/ru) and `epub.test.source.qwen` (ru) (W7-C) | S | W4-C, W7-C |

**Manga + OCR: 6.5 → 7.5**

Fixed: bugs 10, 11 and 12.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Detection lacks Mokuro-style text-line grouping. | `main/mangaOcr.ts` | L | W2-B |
| O | Compare accuracy with Mokuro on a real volume. | | | O14 |

Tests: `40-manga.cjs`.

**Snip to cards: 6.5 → 7.0** (about 7.5 once the opt-in lands)

**The Snip agent is working on this.**
- Already in its tree: `enabled:false` plus the migration.
- Still for that agent to do: update `tools/e2e/flows/97b-snip-cards.cjs:63` (it asserts "on by default") and `snipToCardsReview.test.ts:21`, and add the first-run offer.
- No other package touches `snip*`.

| Tag | Gap | Pkg |
|---|---|---|
| O | A real Win+Shift+S into real Anki. | O4 |

### 2.3 Media

**Video study mode: 7.0 → 7.8**

The seamless-playback agent is working on this row. No code gaps were found outside its work.

| Tag | Gap | Pkg |
|---|---|---|
| O | A real MKV with ASS subtitles, and Whisper on real speech. | O8 |

The packaged build ships the GPL Seanime sidecar (84 MB), which is covered by R1.

**YouTube: 6.5 → 6.9**

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Bug 31: `proc.kill()` should be `killProcessTree`. | `main/media.ts:504`, `main/youtubeStudy5.ts:60` | S | W5-A |
| C | No `windowsHide`, so a console window flashes in packaged builds. | `media.ts:499,611,908,1858`, `main/ytPlaylists.ts:681`, `main/musicLyricsFile.ts:72` | S | W5-A |
| C | Raw English errors. | `media.ts:423,522,572,607,626,1836,1867`, `main/youtubeDiscovery.ts:272`, shown through `MusicContent.tsx:415` | S | W5-A |
| C | yt-dlp is found only on PATH (`findYtDlp`, `media.ts:920`), and the user is never told that a JS runtime is also needed. Fix: a managed download with a SHA-256 check and updates (yt-dlp is Unlicense). | new `main/ytDlpBinary.ts` | M | W5-A |
| C | No first-use notice for downloads. | Wire the shared notice that W1-C builds. | S | W5-A |
| C | Blanc YouTube has no discovery, pre-study or progress. | `components/blanc/BlancReadyToolPanels.tsx:1286` | M | W7-A |
| O | Real YouTube, and no console flash. | | | O7 |

**Music / lyrics: 6.5 → 7.6**

Fixed: bugs 20 and 22, and `[offset:]`.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | No per-line machine translation: `lookupAt` ignores `hit.translate`. | `components/music/MusicContent.tsx:426`, `MusicLyricText.tsx`, `shared/i18n/musicLyrics2/*` | M | W5-A |
| O | LRCLIB on a real library. | | | O9 |

**Soundscape: 6.5 → 6.8**

Fixed: bug 23.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Tests run on a hand-made fake Web Audio. Test the real engine with `node-web-audio-api` (dev dependency). | `__tests__/helpers/offlineAudio.ts`, `package.json` | M | W5-C |
| C | **Leftover:** Settings → Atmosphere → "Ambient audio" says "Ships silent — add a sound pack…". | `settings/pages/AtmospherePage.tsx:325`, `renderer/environment/ambientAudio.ts` | S | W5-C |
| C | Not reachable in Blanc (it's a widget only). | Blanc panel | M | W7-A |
| O | Listen to all 22 layers and 6 styles, and decide D7 (recorded CC0 loops). | | | O9 |

**Screen recorder: 7.5 → 7.4**

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | A failed extension recording can't be retried: its chunks are deleted and "Upload now" does nothing. | `extension/background.js:2041,2164-2172`, `extension/popup.js:549-550`, `main/extensionRecordings.ts` | M | W6-C |
| C | English HTTP error bodies reach the popup. | `main/extensionRecordings.ts` | S | W6-C |
| O | NVENC, QSV and AMF encoders, and a long recording. | | | O10 |

Tests: `94-recorder.cjs`.

**Scraper + qBittorrent/Seanime: 7.0 → 7.2**

Fixed: bug 7. The private-address and DNS-rebinding guard is solid.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | The Dashboard → Results link is dead. It should use `librarySeriesId(entry.jobId, entry.seriesId)`. | `DashboardPage.tsx:344`, `scraperResultHandoff.test.ts` | S | W1-C |
| C | **Leftover:** the Plugins page says "not ready yet" (`PLUGINS_READY=false`). Hide it for v1 (D4). | `ManagementPages.tsx:1285-1505`, `scraperPages.ts`, `featureStatus.ts` | S | W1-C |
| C | **Leftover:** 20 inert settings say "Stored for a future …". Wire them or remove them, and fix the stale `verboseTimings` hint. | scraper `settings/fields.ts:272-445`, `shared/i18n/scraperDrawerUi/*` | S–M | W1-C |
| C | **Leftover:** a developer "Build Status" panel is shown to everyone. Gate it behind developer mode. | `DashboardPage.tsx:75,570` | S | W1-C |
| C | Raw English. | `TorrentManagerPage.tsx:791,794`, `main/scraper/engine.ts:723,838,847`, `qbittorrent.ts:1070-1072`, `result/Pill.tsx:36` | S | W1-C |
| C | Three keys are missing: `torrent.noIndexers`, `torrent.indexersAllOff` and `message`. | `scraperUi/*` (pack) | S | W1-C |
| C | `scraperUi` has 7/7/6 values identical to English. | `scraperUi/*` (pack) | S | W1-C |
| C | The resolution column echoes the user's preference instead of the release's resolution. | `engine.ts:351,369,442` | S | W1-C |
| C | No legal or first-use notice for torrents/qBittorrent or YouTube downloads. Build one shared gate, in all 4 languages. | new `components/common/DownloadNotice.tsx` plus a pack | S–M | W1-C |
| C | Blanc reaches only Discover: torrents, qBittorrent and Seanime are missing. | `BlancShell.tsx:1613`, `BlancDiscoverPanel.tsx` | M | W7-A |
| O | Real indexers, qBittorrent and Seanime, plus a review of the notice wording (D11). | | | O11 |

Tests: `93-scraper.cjs`.

### 2.4 Immersion and AI

**Immersion: 7.0 → 7.0**

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Bug 28: the query string is dropped, so different pages share history and bookmark rows. The fix needs a migration that merges the old rows. | `main/immersion/index.ts:107-119,184`, `shared/immersion.ts:637-640` | S | W3-C |
| C | Bug 29: dropped offline copies are never deleted. | `renderer/immersionStudy5Store.ts:124-147`, `shared/immersionStudy5.ts:308,526-528` | S | W3-C |
| C | Raw English. | `ImmersionContent.tsx:474,917,936,952`, `main/readabilityArticle.ts:774-775` | S | W3-C |
| C | No read-aloud or audio in the reader (Satori Reader and LingQ have it). | `ImmersionContent.tsx` plus a TTS hook | M | W3-C |
| O | NHK, syosetu and kakuyomu on the real sites. | | | O12 |

Tests: `89-immersion.cjs`.

**VN: 7.0 → 7.8**

Fixed: bugs 24–27 and the raw errors.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | No automatic per-line screenshot or audio like GSM: `visualNovels.ts:1520` saves empty paths. | `main/immersion/visualNovels.ts`, `visualNovelCaptureSession.ts`, `components/immersion/VisualNovel*.tsx` | L | W3-A |
| C | No OCR fallback. It reuses the Lens watch region. | `main/screenOcr.ts` | M | W3-A |
| C | The `beforeAll` timeout flakes under load. | `visualNovelCaptureErrorsUi.test.tsx` | S | W3-A |
| O | A real Textractor or Luna hook. | | | O12 |

Tests: `98-visual-novel.cjs`.

**Agent: 7.0 → 7.5**

Fixed: bug 9 (Undo).

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | No tool-result loop: `toolOutputForPlanner` is dead code and the planner is single-shot. | `shared/agentCloudStudyDataGate.ts:70`, `main/localAgent.ts:214-247` | L | W4-B |
| C | The local planner has no JSON grammar. W1-A adds the grammar API; this package uses it. | `localAgent.ts` | M | W4-B |
| C | **Leftover:** `flashcard.schedule-reviews` is always disabled with "Unavailable until a real execution adapter exists". Implement it. | `renderer/agentToolRegistry.ts:88-90`, `catalogs/en.ts:9939` | M | W4-B (catalog: W7-C) |
| C | **Leftover:** the raw id `false-success-stub-removed` is used as a tooltip. | `AgentProfileOperations.tsx:191`, `localAgentProfileOperationsUi.test.ts:196` | S | W4-B |
| C | Raw English in Blanc. | `localAgent.ts:219-223,239,293,360,365` return codes (W4-B); `BlancReadyToolPanels.tsx:398,768` map them (W7-A) | S | W4-B, W7-A |
| O | A real provider. | | | O6 |

Tests: `96-agent.cjs`.

**AI overall: 5.5 → 7.0**

Fixed since `AI_AUDIT.md`: F1, F2, F4, F6 and F8.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Bug 13: the fence is checked before a leading `{`. The same pattern is in 5 places. Replace them with one shared helper and tests. | `main/aiStructuredOutput.ts:27`, `main/translate.ts:835`, `games/mirrorWriting/evaluator.ts:111`, `shared/lexiconExplainPrompt.ts:176`, `shared/subtitleDiscoveryTranslate.ts:124` | S | W1-A |
| C | The analysis cache keys omit the model. | `translateAnalysis.ts:72-87`, `sentenceAnalysis.ts:235` | S | W1-A |
| C | The 1.7B local model has no JSON grammar. | `main/llamaHost.ts`, `llamaHostWorker.ts` | M | W1-A |
| C | F9: no streaming for Explain, sentence analysis, translate analysis, the study helpers, Card Studio or the assistant. | `main/aiStudyAssist.ts:400-410`, `main/dictionary.ts` (Explain), `sentenceAnalysis.ts`, `translateAnalysis.ts`, `preload.ts` | M–L | W2-A |
| C | F10: the AI panels are unstyled in Aero and Wired. | `wb-ai*` CSS | M | W6-A |
| O | Real-provider runs. | | | O6 |

Tests: `88-ai-study.cjs`, against a fake server.

**Speak (conversation, shadowing, writing): 6.0 → 7.2**

Fixed: bug 44 (Retry), memory, and pitch feedback.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Replies don't stream. | `main/aiSpeakAssist.ts` | M | W2-A |
| C | Push-to-talk only: no voice-activity loop and no interrupt. | `components/speak/ConversationPartner.tsx:334-350` | M | W2-A |
| C | No E2E for shadowing or writing. | `tools/e2e/flows/88b-speak.cjs` | S–M | W2-A |
| C | `speak.css` has no Aero or Wired treatment. | `components/speak/speak.css` | S | W2-A |
| O | A real model. | | | O6 |

**Chrome extension: 8.0 → 8.0**

The extension has a mirror copy in `src/main/chrome-extension/`, and both copies must change together.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Offline lookup is only a cache of up to 20,000 earlier results. Make it a real offline mode with a bundled or synced dictionary and a deinflector. | `extension/background.js:1541-1567` | L | W6-C |
| C | Packaging: `manifest.json` has no `icons`, there is no `tools/pack-extension.cjs`, `extension/README.md` still says "load unpacked", and `<all_urls>` and `tabCapture` need written justifications. | as listed | S | W6-C |
| C | Raw `err.message`. | `background.js:1265,1305,1637,2731` | S | W6-C |
| O | Real YouTube and Netflix, and D8 (Web Store or unpacked). | | | O13 |

Tests: `99-extension.cjs`.

### 2.5 Shell and system

**Lockscreen: 8.5 → 8.6**

Fixed: bug 37.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Idle auto-lock counts video playback as idle. Use `media-started-playing` / `media-paused`. | `main/lockAutoArm.ts:71-82` | S–M | W4-A |
| C | A packaged build accepts `--remote-debugging-*`. | new `main/debugSwitchGuard.ts`, `main.ts` | S | W4-A |
| C | The E2E waits a fixed 900 ms after each PIN; it should poll. | `tools/e2e/flows/95-lockscreen.cjs:65` | S | W4-A |
| O | Real sleep, Win+L and idle. | | | O3 |

**Updates: 8.0 → 8.2**

Fixed: bug 35.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | No "check automatically" or "pause updates" switch. | `shared/appUpdate.ts`, `main/squirrelUpdater.ts`, `UpdatePanel.tsx`, `updateUi3/*` | S–M | W4-A |
| C | Blanc has only a button, and it shows a raw error. | `components/blanc/BlancStudySettings.tsx:70` | S | W7-A |
| O | D5 (rollback; defer recommended). | | | D5 |
| O | The VM `Update.exe` hand-off. | | | O2 |

Tests: `96-updates.cjs`.

**Installer / packaging: 6.0 → 7.0**

Fixed: bug 36 (uninstall cleanup), and the Squirrel entry runs within its hook budget.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| O | Version bump. | `package.json`, `package-lock.json` | | R-1 |
| O | D2: asar is off (`forge.config.ts:275`). Defer recommended; keep the "study lock, not a security boundary" note. | | | D2 |
| O | Clean-VM install and uninstall, plus SmartScreen. | | | O1 |

**Widgets / Shortcuts: 8.0 → 8.5**

Fixed: bugs 32, 33 and 34, and keyboard support in the Aero gadget menu.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | **No E2E** for widgets or the keymap. | new `tools/e2e/flows/9x-widgets.cjs` | M | W5-B |
| O | Multi-monitor snapping, and Alt+Tab during a drag. | | | O15 |

**Calendar: 8.0 → 8.5**

Fixed: bug 8, yearly/nth-weekday/multi-weekday repeats, multi-day events, snooze, and the DST warning.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | The E2E doesn't exercise the new repeat types or snooze. | `tools/e2e/flows/95-calendar.cjs` | S–M | W5-B |
| O | D3: reminders while Gum is closed. | | | D3 |
| O | A real Google or Outlook import. | | | O15 |

**Notebook / notes: 3.5 → 7.5**

Fixed: bugs 5 and 6. Notes now have their own store with a journal, migration, trash, versions, search, tags, Markdown, and export/import.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | No direct way to open Notes from the launcher, Start menu or palette in Study OS, Aero or Wired. | `components/notes/openNotesManager.tsx`, `renderer/keyboardShortcuts.ts`, Start menu registry | S | W5-B |
| C | **No E2E.** | new `tools/e2e/flows/9x-notes.cjs` | M | W5-B |
| C | No `[[links]]` or backlinks (Obsidian has both). | `components/notes/**`, `renderer/userNotesStore.ts` | M–L | W5-B |
| O | Real use. | | | O16 |

**Settings: 7.0 → 8.0**

Fixed: bug 45, settings-only transfer, and Reset desktop Undo.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | No per-setting "modified" marker or reset. | `settings/settingsRegistry.ts`, `renderer/storage/settingsCatalog.ts`, `settings/ResetSectionButton.tsx` | M–L | W6-B |
| C | **No E2E** for settings export and import. | new `tools/e2e/flows/9x-settings.cjs` | M | W6-B |
| C | Blanc lacks `SettingsTransferCard`. | | S–M | W7-A |
| C | Untranslated strings: ru `settings.memory.tier.host` is "Host" (`catalogs/ru.ts:2325`), and `settings.study.dict.rev` is untranslated in ja/zh/ru. | catalogs | S | W7-C |

### 2.6 Cross-cutting rows

**Themes: 7.5 → 7.6** (Study OS 7.5, Aero 8.0, Wired 7.7, Blanc 7.8)

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | Bug 17 plus 16 more Wired rules with cyan text at alpha ≤ 0.5, and no contrast gate. | `theme/wired-navi.css:316`, `wired-shell.css:411`, `wired-apps.css:1183,1311`, `widgets/wid6.css:197-199`, `theme/wired-archive.css:30`, new `__tests__/wiredContrastGate.test.ts` | S | W6-A |
| C | The Aero taskbar preview is a coloured plate, not a live thumbnail. | `components/shell/AeroTaskbarFx.tsx`, `aero-shell.css` | M | W6-A |
| C | No Aero Snap or Shake. | `components/DesktopShell.tsx`, `desktopWindowGeometry.ts` | M | W6-A |
| C | No Windows jump lists. | new `main/jumpList.ts`, `main.ts` | S | W6-A |
| C | The Wired panels have no tests. | `components/wired/NaviTerminal.tsx`, `WiredConsole.tsx`, `InterceptPanel.tsx` | S | W6-A |
| C | Blanc falls back to a Study OS pop-out for `city` and `musicwidget`. | `BlancShell.tsx:572-576` | M | W7-A |
| C | E2E runs other themes only in the lockscreen flows. | | | W7-B (axe per theme) |
| O | A visual review of all 4 themes against Vista/7 and Lain references. | | | O16 |

**Onboarding / first run: 7.0 → 7.8**

The Snip step is in flight (`FirstRunSnip`).

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | `10-setup.cjs` covers only ja + Study OS. Add the Anki-missing path and the Aero, Wired and Blanc finishes. | `tools/e2e/flows/10-setup.cjs` | S | W8-A |
| C | Blanc has no tour. | `BlancShell.tsx`, `onboarding/TourOverlay.tsx` | M | W8-A |

**i18n (en/ja/zh/ru): 7.5 → 8.3**

The gates are green (21,810 keys), and the orphan-key gate now runs in vitest.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | `'раз'` is wrongly treated as invariant. | `__tests__/i18nRussianPlurals.test.ts:49`, `ru.ts:11039`, `ru.ts:12239` | S | W7-C |
| C | The hard-coded-string baseline has 8 files and 80 strings, and must go to 0. `StudyPlayerSlice.tsx` (11 strings) can only be done after the video agent lands. | `tools/i18n-hardcoded-baseline.json` | S–M | W7-C |
| C | Values identical to English need review: ja 76, zh 76, ru 83. The worst are `aero` (12), `settings` (9–11), `epub`, `csv` and `arcade`. | catalogs | M | W7-C |
| C | No E2E in a non-English UI. | | S | W7-B (`--locale=ru` run) |

**Accessibility: 7.0 → 7.0**

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | `color-contrast` is off in jsdom, and there is no real-Chromium axe run per theme. | new `tools/e2e/flows/99b-axe-themes.cjs`, `__tests__/helpers/axeAudit.ts:53` | M | W7-B |
| C | The Wired panels have no axe coverage. | | S | W6-A |
| O | The NVDA checklist is 0/36. | | | O17 |

**Performance / RAM: 6.0 → 6.8**

The Blanc and Study OS byte budgets pass. Study OS has only 85 KB of headroom.

| Tag | Gap | Files | Effort | Pkg |
|---|---|---|---|---|
| C | No RAM baseline or gate. | new `tools/perf/ramProbe.cjs`, baseline JSON, `tools/e2e/run.cjs` hook | M | W7-B |
| C | No cold-start metric. | `run.cjs` | S | W7-B |
| O | Cold start and RAM on each hardware tier. | | | O18 |

### 2.7 Scores at a glance

| Row | Now | | Row | Now | | Row | Now |
|---|---:|---|---|---:|---|---|---:|
| Lockscreen | 8.6 | | Library/Files | 7.8 | | Known words | 7.4 |
| Widgets/Shortcuts | 8.5 | | Onboarding | 7.8 | | Screen recorder | 7.4 |
| Calendar | 8.5 | | Stats | 7.8 | | Games | 7.3 |
| i18n | 8.3 | | Video study | 7.8 | | Anki sync | 7.2 |
| Flashcards/SRS | 8.2 | | VN | 7.8 | | Scraper | 7.2 |
| Updates | 8.2 | | Music/lyrics | 7.6 | | Speak | 7.2 |
| EPUB | 8.0 | | Themes | 7.6 | | Snip *(in flight)* | 7.0 |
| Chrome extension | 8.0 | | Agent | 7.5 | | Reading Lens | 7.0 |
| Settings | 8.0 | | Manga + OCR | 7.5 | | Translate | 7.0 |
| Dictionary | 7.8 | | Notebook | 7.5 | | Immersion | 7.0 |
| | | | | | | AI overall | 7.0 |
| | | | | | | Accessibility | 7.0 |
| | | | | | | Installer | 7.0 |
| | | | | | | YouTube | 6.9 |
| | | | | | | Grammar | 6.8 |
| | | | | | | Soundscape | 6.8 |
| | | | | | | Performance | 6.8 |

---

## 3. Work packages

### 3.1 Rules for every package

- **At most 3 agents at once.** The packages in a wave are file-disjoint, and the next wave starts only after all of the current wave's packages are merged.
- **Files of agents already running are off-limits:**
  - **The seamless-video agent:** the video player, the Seanime sidecar, `src/media/**` (including `StudyPlayerSlice.tsx`) and `90-video.cjs`.
  - **The Snip/notices agent:** `snip*`, `FirstRunSetup*`/`FirstRunSnip*`, `THIRD_PARTY_NOTICES*`, `PRIVACY*`, the About section and the README SmartScreen section.
  - Packages that touch neighbouring files (W5-A `main/media.ts`, W6-B `settingsRegistry.ts`, W8-A onboarding) **start only after that agent's commit has landed**. Before starting, check `git log` for files that overlap.
  - **When this plan was written, those two agents had uncommitted edits in this same working tree, in several hotspots:**
    - `src/main.ts`, `src/preload.ts`, `src/renderer/window.d.ts`
    - `src/main/media.ts`
    - `BlancShell.tsx`, `settingsRegistry.ts`
    - all four `catalogs/*.ts`
    - `forge.config.ts`, `README.md`, `docs/RELEASING.md`
    - `tools/e2e/flows/10-setup.cjs`, `90-video.cjs`, `97b-snip-cards.cjs`

    They also had new files: `PRIVACY.md`, `THIRD_PARTY_NOTICES.md`, `components/about/`, `i18n/aboutUi/`, `i18n/playbackUi/`, `tools/generate-notices.cjs`, and the `src/media/*` playback files.
  - **So Wave 1 starts only after both agents have committed and `git status` is clean.** Each package then runs in its own worktree off the new HEAD.
- **i18n.** New strings go into the feature's **lazy pack** (`src/shared/i18n/<pack>/{en,ja,zh,ru}.ts`) in all four languages. **Only W7-C edits `src/shared/i18n/catalogs/*.ts`.** Any other package that needs a catalog key changed lists it in its commit message for W7-C.
- **Hotspot files.** Each wave names one owner for each hotspot. Only that owner may edit the file in that wave; the others must stay IPC-free or not need the file at all. The hotspots are:
  - `src/preload.ts` and `src/renderer/window.d.ts` (the IPC surface)
  - `src/main.ts`
  - `src/renderer/main.tsx`
  - `BlancShell.tsx` and `BlancReadyToolPanels.tsx`
  - `DesktopShell.tsx`
  - `keyboardShortcuts.ts`
  - `settingsRegistry.ts`
  - the shared E2E files `tools/e2e/{run,fixtures,world}.cjs` and `tools/e2e/flows/_lib.cjs`
  - `package.json` and `package-lock.json`
  - `tsconfig.json`
  - `main/media.ts` and `main/screenOcr.ts`
  - `extension/background.js` and its mirror copy
  - `README.md`
- **Definition of done for a package:**
  - its rows' CODE gaps in §2 are closed, with tests;
  - targeted vitest (`--maxWorkers=2`) is green, and so are its E2E flows (`npm run e2e -- --flows=…`);
  - `node tools/i18n-check.cjs` is green;
  - nothing is left half-done;
  - its commit message lists what was done and what is left.

### 3.2 Waves

Eight agent waves come first. The owner-gated release (R) follows them. Within a wave, packages are listed by rank, impact first.

#### Wave 1: correctness that other work builds on

The running agents may also touch `main.ts` and `preload.ts`. W1-A rebases onto their commits.

| Pkg | Name | Closes | Owns (exclusive) | Effort |
|---|---|---|---|:---:|
| **W1-A** | **AI & Translate correctness** | AI: bug 13 (×5), model in cache keys, JSON grammar for the local model. Translate: DeepL options, cache bound and key, side-by-side compare, raw errors, fake-provider E2E. | `main/aiStructuredOutput.ts`; new `shared/jsonReply.ts`; `main/translate.ts`; `games/mirrorWriting/evaluator.ts`; `shared/lexiconExplainPrompt.ts`; `shared/subtitleDiscoveryTranslate.ts`; `translateAnalysis.ts`; `sentenceAnalysis.ts`; `main/llamaHost.ts`; `llamaHostWorker.ts`; `main/translateRouter.ts`; `components/translate/**`; `SentenceTranslatePopup.tsx`; `BlancTranslatePanel.tsx`; `i18n/translateEnginesUi/*`; `60-translate.cjs` | L |
| **W1-B** | **SRS & Anki fidelity** | FSRS-6 and per-deck presets; 4 am Anki due dates; review-log round-trip; FSRS parameter import; AnkiContent placeholders | `shared/fsrs.ts`, `fsrsOptimizer.ts`, `fsrsMemoryReplay.ts`, `flashcardScheduling.ts` (shared and renderer); `flashcards/SchedulingPreferences.tsx`; `renderer/flashcardDeck.ts`; `main/anki/reviewSync.ts`, `ankiProtoConfig.ts`, `localDeckApkg{Core,Host,Worker}.ts`; `shared/ankiReviewSync.ts`, `apkgCards.ts`; `renderer/apkgImport.ts`, `apkgNoteRead.ts`, `reviewLog.ts`; `components/anki/AnkiContent.tsx`; `45-anki.cjs`; `50-srs.cjs` | L |
| **W1-C** | **Scraper finish and shared download notice** | Every Scraper CODE gap except Blanc reach: the dead link, hiding Plugins, the inert settings, gating the developer panel, raw English, missing keys, the resolution column, and the first-use notice component | `main/scraper/**`; `components/scraper/**`; `shared/scraperPages.ts`; `featureStatus.ts`; `i18n/scraperUi/*`, `scraperDrawerUi/*`; new `components/common/DownloadNotice.tsx` plus its pack; `93-scraper.cjs` | M |

**Hotspot owner:** W1-A, for `preload.ts`, `window.d.ts` (only if compare needs a channel; prefer parallel calls to the existing one) and `tools/e2e/fixtures.cjs`.

#### Wave 2: streaming AI, lookup quality, grammar

| Pkg | Name | Closes | Owns | Effort |
|---|---|---|---|:---:|
| **W2-A** | **Streaming AI & Speak** | F9 streaming plus cancel for Explain, sentence analysis, translate analysis, study helpers, Card Studio and the assistant. Speak: streaming replies, voice-activity loop with interrupt, shadowing and writing E2E, Aero and Wired styling of `speak.css`. | `main/aiStudyAssist.ts`; the Explain region of `main/dictionary.ts`; `sentenceAnalysis.ts` and `translateAnalysis.ts` (after W1-A); Card Studio and assistant components; `main/aiSpeakAssist.ts`; `components/speak/**`; `i18n/aiSpeak*Ui/*`, `aiPack/*`; `88-ai-study.cjs`; `88b-speak.cjs` | L |
| **W2-B** | **Dictionary & Manga OCR** | Yomitan rules column; dictionary E2E flake; Mokuro-style text-line grouping | `main/dictionary/yomitanZip.ts` (+ tests); `20-dictionary.cjs`; `main/mangaOcr.ts`; `40-manga.cjs` | L |
| **W2-C** | **Grammar** | Practice-test enrolment; TTS audio; N5 to about 130 points; examples for all ja and zh points (Tatoeba-sourced, with credit) | `renderer/grammarSrs.ts`; `components/grammar/**`; `renderer/data/grammar/**`; grammar packs; `80-grammar.cjs` | L |

**Hotspot owners:**
- `preload.ts` and `window.d.ts`: W2-A.
- The shared E2E files: W2-B.

#### Wave 3: screen capture, study data, immersion

| Pkg | Name | Closes | Owns | Effort |
|---|---|---|---|:---:|
| **W3-A** | **Lens watch region & VN capture** | Lens watch region; 97-lens OCR assertion; VN per-line screenshot and audio; VN OCR fallback; VN test flake | `main/readingLens.ts`; `main/screenOcr.ts`; `components/lens/**` (not `ReadingLensSection.tsx`, which belongs to the Snip agent); `i18n/lensOcrUi/*`; `main/immersion/visualNovels.ts`, `visualNovelCaptureSession.ts`; `components/immersion/VisualNovel*.tsx`; VN packs; `97-lens.cjs`; `98-visual-novel.cjs` | L |
| **W3-B** | **Study data: Stats, Games, Known words** | Blanc stats insights; full-log long ranges; Stats and Games E2E; `gameArena` identical values; Traditional↔Simplified folding | `components/stats/**`; `blanc/BlancStatisticsPanel.tsx`; `i18n/gameArena/*`; new `shared/zhVariants.ts`; `shared/knowledgeKey.ts`; new `72-stats.cjs`, `82-games.cjs`; `70-known-words.cjs` | M–L |
| **W3-C** | **Immersion** | Bugs 28 (with migration) and 29; raw English; read-aloud | `main/immersion/index.ts`; `shared/immersion.ts`; `shared/immersionStudy5.ts`; `renderer/immersionStudy5Store.ts`; `ImmersionContent.tsx`; `main/readabilityArticle.ts`; immersion packs; `89-immersion.cjs` | M |

**Hotspot owners:**
- `preload.ts`, `window.d.ts`, `keyboardShortcuts.ts` (the watch hotkey) and `screenOcr.ts`: W3-A.
- The shared E2E files: W3-B.

#### Wave 4: system, agent, reader

| Pkg | Name | Closes | Owns | Effort |
|---|---|---|---|:---:|
| **W4-A** | **System: lock, updates, crash reporting** | Lock: video counts as activity; remote-debugging guard; 95-lockscreen polling. Updates: auto-check and pause switch. R8: localised `AppErrorBoundary`, opt-in local `crashReporter` (`uploadToServer:false`), and "Save problem report…" (a redacted zip in Diagnostics). | `main/lockAutoArm.ts`, `lockGuard.ts`; new `main/debugSwitchGuard.ts`; `main/crashRecovery.ts`, `errorLog.ts`; `components/AppErrorBoundary.tsx`; the Diagnostics settings component; `shared/appUpdate.ts`; `main/squirrelUpdater.ts`; `UpdatePanel.tsx`; `lock3Ui/*`, `updateUi3/*`; `95-lockscreen.cjs`, `96b-lockscreen.cjs`, `96-updates.cjs` | M |
| **W4-B** | **Agent loop** | Tool-result loop; JSON grammar for the planner; implement `flashcard.schedule-reviews`; the tooltip id; error codes from `localAgent.ts` | `main/localAgent.ts`; `shared/agentCloudStudyDataGate.ts`; `renderer/agentToolRegistry.ts`; `AgentProfileOperations.tsx` and its test; the agent handlers; agent packs; `96-agent.cjs` | L |
| **W4-C** | **EPUB & Library reader** | Character-anchored bookmarks and TOC jumps; in-book search; horizontal E2E; raw English in the reader, Novels and Library | `views/NovelReader.tsx`; `renderer/bookmarks.ts`; `novelTextAnchor.ts`; `NovelsContent.tsx`; `views/LibraryView.tsx`; epub and library packs; `30-epub.cjs`; `31-library.cjs` | M–L |

**Hotspot owners:**
- `main.ts`, `preload.ts`, `window.d.ts` and `renderer/main.tsx`: W4-A.
- The shared E2E files: W4-C.

#### Wave 5: media and desktop tests

Before starting, W5-A checks that the seamless-video agent has landed or does not touch `main/media.ts`.

| Pkg | Name | Closes | Owns | Effort |
|---|---|---|---|:---:|
| **W5-A** | **YouTube & Music** | Bug 31 (tree kill); `windowsHide`; error codes; managed yt-dlp with the runtime explanation; wire the download notice; per-line lyric machine translation; map codes in Music | `main/media.ts` (except player and sidecar code); `main/youtubeStudy5.ts`, `ytPlaylists.ts`, `youtubeDiscovery.ts`, `musicLyricsFile.ts`; new `main/ytDlpBinary.ts`; `components/music/**`; `i18n/musicLyrics2/*`, `media5/*`; `91-youtube.cjs`; `92-music.cjs` | L |
| **W5-B** | **Notes & desktop E2E** | Notes in the launcher, Start menu and palette; `[[links]]` and backlinks; Notes E2E; widget and keymap E2E; calendar E2E for the new repeats and snooze | `components/notes/**`; `renderer/userNotesStore.ts`; `notesUi/*`; Start-menu registry; new `9x-notes.cjs`, `9x-widgets.cjs`; `95-calendar.cjs` | M–L |
| **W5-C** | **Soundscape** | Real-engine tests; remove or wire the "Ships silent" leftover; a hook for integrating recorded loops once D7 is decided | `renderer/soundscape/**`; `__tests__/helpers/offlineAudio.ts`; `settings/pages/AtmospherePage.tsx`; `renderer/environment/ambientAudio.ts` | M |

**Hotspot owners:**
- `preload.ts`, `window.d.ts` and `media.ts`: W5-A.
- `keyboardShortcuts.ts` and the shared E2E files: W5-B.
- `package.json` and `package-lock.json` (the dev dependency): W5-C.

#### Wave 6: themes, settings, extension

W6-B starts only after the notices agent has added the About section to `settingsRegistry.ts`.

| Pkg | Name | Closes | Owns | Effort |
|---|---|---|---|:---:|
| **W6-A** | **Theme completion: Wired & Aero** | Wired contrast gate plus the 17 rules (bug 17); Wired panel tests and axe; Aero live taskbar thumbnail, Snap/Shake and jump lists; F10 styling of the AI surfaces | `theme/wired-*.css`; `widgets/wid6.css`; `theme/aero-*.css`; `components/shell/AeroTaskbarFx.tsx`; `components/wired/**`; `DesktopShell.tsx`; `desktopWindowGeometry.ts`; new `main/jumpList.ts`; new `wb-ai` theme CSS; new `wiredContrastGate.test.ts` | L |
| **W6-B** | **Settings** | Per-setting "modified" marker and reset; settings export/import E2E | `settings/settingsRegistry.ts`; `renderer/storage/settingsCatalog.ts`, `settingsTransfer.ts`; `settings/ResetSectionButton.tsx`, `SettingsSearch.tsx`, `settings/pages/**` (except About, `ReadingLensSection.tsx`, `AtmospherePage.tsx` and snip); new `9x-settings.cjs` | M–L |
| **W6-C** | **Chrome extension & recorder retry** | Real offline mode; Web Store packaging; raw errors; failed-recording retry; HTTP error codes | `extension/**`; `src/main/chrome-extension/**`; `main/extensionRecordings.ts`; new `tools/pack-extension.cjs`; `99-extension.cjs`; `94-recorder.cjs` | L |

**Hotspot owners:**
- `main.ts`, `DesktopShell.tsx`, `preload.ts` and `window.d.ts` (the thumbnail capture): W6-A.
- `settingsRegistry.ts` and the shared E2E files: W6-B.
- `extension/background.js` and its mirror: W6-C.

#### Wave 7: Blanc parity, quality gates, translations

| Pkg | Name | Closes | Owns | Effort |
|---|---|---|---|:---:|
| **W7-A** | **Blanc parity** | Every Blanc gap in §2: Read panel (extracted from `BlancShell.tsx:1143`) with manage, trash and relink; Lens toggle; Settings transfer card; update panel without raw errors; YouTube discovery and progress; Agent error mapping (`BlancReadyToolPanels.tsx:398,768`); torrents, qBittorrent and Seanime reach; Soundscape panel; native `city` and `musicwidget`; the `BlancShell.tsx:2027` type error. The Blanc boot budget must stay green. | `components/blanc/**`; `i18n/blancUi/*` | L |
| **W7-B** | **Quality gates: a11y, performance, locale** | Real-Chromium axe for each theme, with `color-contrast` on; contrast fixes outside Wired, Aero and Blanc CSS; RAM probe, baseline and gate; cold-start timing; a `--locale=ru` E2E run | `tools/e2e/{run,world,fixtures}.cjs`; `tools/e2e/flows/_lib.cjs`; new `99b-axe-themes.cjs`; new `tools/perf/**`; `__tests__/helpers/axeAudit.ts`; Study OS theme CSS | M–L |
| **W7-C** | **Catalog sweep** | All catalog hand-offs from W1–W6; the RU `'раз'` plural; untranslated settings and epub keys; values identical to English (ja 76 / zh 76 / ru 83) and pack leftovers; the hard-coded baseline down to 0 (`main.tsx`, `MenuBar.tsx`, `widgets/registry.tsx`, `GumIcons.tsx`, `ReadingGardenSkyEvents.tsx`, `GlobalDictionaryOverlay.tsx`, plus `StudyPlayerSlice.tsx` once the video agent has landed); inline credits (CC-CEDICT, world map, OPUS-MT) if the notices agent hasn't added them | `src/shared/i18n/catalogs/*.ts`; i18n tests; `tools/i18n-*.cjs`; the files named in the baseline; `DictionaryResults.tsx`; `WorldHeatMap.tsx` | M |

**Hotspot owners:**
- `BlancShell.tsx` and `BlancReadyToolPanels.tsx`: W7-A.
- The shared E2E files: W7-B.
- The catalogs and `renderer/main.tsx`: W7-C.

#### Wave 8: first run, build hygiene, docs

| Pkg | Name | Closes | Owns | Effort |
|---|---|---|---|:---:|
| **W8-A** | **First run & Blanc tour** | The Blanc tour; `10-setup.cjs` coverage of the Anki-missing path and all 4 themes; first-run copy polish. This runs after the Snip agent's setup step has landed. | `components/onboarding/**` (with the Snip agent's files now released); `BlancShell.tsx` (tour mount only); `10-setup.cjs` | M |
| **W8-B** | **Build hygiene & release-candidate gates** | Set `tsconfig` `module` to esnext/bundler (clears about 314 errors); fix the 53 real app errors (`ReadingGarden.tsx`, `scraper/artwork.ts`, `privateAssets.ts`, `FilesApp.tsx`, `DesktopShell.tsx`, `DictionaryResults.tsx`, `NovelsContent.tsx`, …); fix the test-code errors; make tsc a vitest or CI gate; run every R12 gate and record the results | `tsconfig.json`; type-only edits anywhere **except** the files W8-A owns | M |
| **W8-C** | **Docs & release assets** | README: counts, a feature list covering every app, a Branches section, and new screenshots in all 4 themes taken through the headless E2E harness. Also: `FEATURES.md` refreshed to DRIVEN/TESTED; `KNOWN_ISSUES.md`; the tsc claim in `RELEASING.md`; `SCORECARD.md` re-scored; draft release notes `docs/RELEASE_NOTES_v1.md` with SmartScreen steps and links to the sidecar source and NOTICES. Take the screenshots last, after W8-A and W8-B merge. | `README.md` (not the SmartScreen section); `FEATURES.md`; `docs/**`; `docs/readme/*.png` | M |

**Hotspot owners:**
- `BlancShell.tsx`: W8-A.
- `tsconfig.json`: W8-B.
- `README.md`: W8-C.

#### Wave R: release (OWNER-gated, no agent acts alone)

1. **R-1. Decide the version (D1)** and bump it: `npm version 1.1.0 --no-git-tag-version`. 1.1.0 is recommended; it must be higher than 1.0.1.
2. **R-2. Re-run the gates:** `npx vitest run`, `npm run e2e`, `node tools/i18n-check.cjs`, `npx tsc --noEmit`, `node tools/blanc-budget.cjs`, `node docs/migration/tools/license-audit-gate.mjs`.
3. **R-3. Build** with `node tools/package-app.cjs --installer --zip`, following `docs/RELEASING.md` §0–3. The first Squirrel release is full-only.
4. **R-4. Run the §5 checklist** on that build, in particular O1 and O2.
5. **R-5. Merge** `theme/aero-wired-polish` → `master`, then tag `v1.1.0`.
6. **R-6. Publish the GitHub release.** Upload the assets **before** publishing (`RELEASING.md` §4), along with:
   - the release notes;
   - `THIRD_PARTY_NOTICES.txt`;
   - a link to the Seanime patch source.

   Do not mark it as a pre-release.
7. **R-7. Tell users of the zip-only releases** (1.0.0 and 1.0.1) in the notes to run `Setup.exe` once. Zip installs don't update themselves.

### 3.3 Wave summary

| Wave | Packages (rank order) | Size | Hotspot owner |
|---|---|---|---|
| 1 | W1-A AI & Translate · W1-B SRS & Anki · W1-C Scraper | L · L · M | W1-A (preload, fixtures) |
| 2 | W2-A Streaming AI & Speak · W2-B Dictionary & Manga · W2-C Grammar | L · L · L | W2-A (preload); W2-B (E2E) |
| 3 | W3-A Lens & VN · W3-B Study data · W3-C Immersion | L · M–L · M | W3-A (preload, shortcuts, screenOcr); W3-B (E2E) |
| 4 | W4-A System · W4-B Agent · W4-C EPUB & Library | M · L · M–L | W4-A (main.ts, preload, main.tsx); W4-C (E2E) |
| 5 | W5-A YouTube & Music · W5-B Notes & desktop E2E · W5-C Soundscape | L · M–L · M | W5-A (preload, media.ts); W5-B (shortcuts, E2E); W5-C (package.json) |
| 6 | W6-A Themes · W6-B Settings · W6-C Extension & recorder | L · M–L · L | W6-A (main.ts, DesktopShell, preload); W6-B (settingsRegistry, E2E); W6-C (extension) |
| 7 | W7-A Blanc parity · W7-B Gates · W7-C Catalog sweep | L · M–L · M | W7-A (Blanc); W7-B (E2E); W7-C (catalogs, main.tsx) |
| 8 | W8-A First run · W8-B Build hygiene · W8-C Docs | M · M · M | W8-A (BlancShell); W8-B (tsconfig); W8-C (README) |
| R | Owner release steps | — | Owner |

**Why the waves are in this order:**
- W1-A provides the JSON helper and grammar API that W2-A and W4-B use.
- W1-C provides the download notice that W5-A wires in.
- W3-A's `screenOcr` watch region comes before anything else touches `screenOcr.ts`.
- Every package that adds Blanc features comes before W7-A, so Blanc parity is done in one pass.
- Every package that adds strings comes before the W7-C catalog sweep.
- W6-A's contrast fixes come before W7-B's real axe gate.
- The type fixes and docs come last, so the screenshots and the re-score reflect the final code.

---

## 4. Decisions only the owner can make

| # | Decision | Recommendation |
|---|---|---|
| D1 | Version number | **1.1.0** |
| D2 | asar stays off for v1 (`forge.config.ts:275`) | Defer. It is an L-sized change with model unpacking, and the lock is documented as a study lock, not a security boundary. |
| D3 | Calendar reminders while Gum is closed | v1: reminders need Gum running. Offer "Start with Windows, minimised to tray" in setup. No OS scheduler. |
| D4 | The scraper Plugins page (never built) | Hide it for v1. A placeholder is not a feature. |
| D5 | Update rollback | Defer. Document that running the previous `Setup.exe` reinstalls it. |
| D6 | Grammar content in English for ja/zh/ru UIs | Treat it as content, like dictionary glosses, and label it "Explanations in English". Translating it is post-v1. |
| D7 | Soundscape: recorded CC0 loops or keep the synthesised sounds | Decide after listening (O9). If loops, source CC0 only and add them to NOTICES. |
| D8 | Chrome extension: Web Store or unpacked | Web Store, if you're willing to hold the developer account. W6-C prepares the package either way. |
| D9 | Crash reporting | Opt-in and **local only**: minidumps plus "Save problem report…", never uploaded. |
| D10 | Licence rows that are NOT ESTABLISHED (the Xenova ONNX conversion layer, the tessdata revision) | Accept them with credit, or replace them with established upstream files. The notices agent writes up the options. |
| D11 | The wording of the download and torrent notice | Review W1-C's text in all 4 languages before W5-A wires it in. |

---

## 5. OWNER checklist (real hardware, accounts, eyes and ears)

Do these on the **release-candidate build from R-3**:
- Use a **throwaway profile** or a VM.
- Never use your real `%APPDATA%\jp-study-app` unless a step says so.
- Tick each item, and write what you saw in a reply or an issue.

**O1. Clean install and uninstall (VM)**
1. Restore a clean Windows 10/11 VM snapshot.
2. Copy in `Gum-<version> Setup.exe` and run it.
3. When "Windows protected your PC" appears, **screenshot it**. Then choose More info → Run anyway.
4. Check that Gum starts, and that the desktop and Start-menu shortcuts and "Open with Gum" on an `.epub` all exist.
5. Uninstall from Settings → Apps.
6. Check that the shortcuts are gone, and that `HKCU\…\Run` and `shell:startup\GrammarX-OS-Hotkey.cmd` are gone.

**O2. Update N → N+1 (VM)**
1. Follow `docs/UPDATE_TESTING.md` steps 1–5 exactly, using a fork or a draft release.
2. Report the result of step 4.5 ("Unpacking…" → "has downloaded").

**O3. Lock screen on your PC**
1. Set a PIN and enable auto-lock.
2. Press Win+L, then unlock Windows: Gum should be locked.
3. Sleep the PC, then wake it: Gum should be locked.
4. Leave it idle past the timeout: it should lock.
5. Play a video longer than the timeout: it should **not** lock.

**O4. Reading Lens and Snip on a real desktop**
1. Enable the Lens in Settings.
2. Press Ctrl+Shift+Space over a game, a PDF and a video, on each monitor if they have different scaling. The text should come out right.
3. Enable Snip in setup or Settings.
4. Press Win+Shift+S on Japanese text. Cards should appear, and with Anki open they should reach Anki.

**O5. Anki (throwaway Anki profile)**
1. Install AnkiConnect.
2. Sync a small deck both ways and review in both apps. Due dates and intervals should match.
3. Export an `.apkg` from Gum and import it into Anki. The review history should be present.

**O6. AI**
1. Enter real keys for Claude, OpenAI, Gemini, DeepSeek and DeepL.
2. In each, run Explain, a sentence analysis, a translation, a side-by-side comparison, a Speak conversation and an Agent task.
3. Then try the local model.
4. Note anything slow, wrong or unclear.

**O7. YouTube**
1. Download a real Japanese video with subtitles and study it.
2. Pause, then cancel. Task Manager should show no `yt-dlp` or `ffmpeg` left, and no console window should flash.

**O8. Video**
1. Open a real MKV with ASS Japanese subtitles. Study and mine a line.
2. Transcribe 5 minutes of real speech with Whisper and check the SRT.

**O9. Listen**
1. Play music with lyrics from LRCLIB. Check the timing and the per-line translation.
2. Listen to every Soundscape layer and style for about a minute each. Decide D7.

**O10. Screen recorder**
1. Record 10 minutes with each hardware encoder you have (NVENC, QSV or AMF).
2. Check that the file plays and that the audio stays in sync.

**O11. Scraper**
1. Point it at your real indexers, qBittorrent and Seanime.
2. Search, send to qBittorrent, and open the result in Seanime.
3. Read the first-use notice in English and one other language (D11).

**O12. Immersion and VN**
1. Read one NHK Easy article, one syosetu chapter and one kakuyomu chapter with the dictionary.
2. Run a VN through Textractor or Luna. Lines, screenshots and audio should be captured.

**O13. Chrome extension**
1. Pair the extension, then look up words on YouTube (subtitles) and Netflix.
2. Close Gum and check that offline lookup still works.
3. Decide D8.

**O14. Real data at scale**
1. Run `JP_DICT_REAL=1 npx vitest run --maxWorkers=2 dictionaryRealData` and compare 10 lookups with Yomitan.
2. Import your real library (books and manga) and open several of each.
3. OCR one real manga volume and compare it with Mokuro.

**O15. Calendar and multi-monitor**
1. Import a real Google or Outlook `.ics` that has recurring events. The weekdays and times should be right.
2. Drag widgets across monitors, and Alt+Tab while dragging. Nothing should stick to the mouse.

**O16. Eyes on every app**
1. In each of the 4 themes, open every app from the Start menu or the Blanc drawer, including Notes.
2. Note anything ugly, clipped, English-in-Russian, or unreachable.
3. Compare Aero with your Vista/7 references and Wired with your Lain references.

**O17. NVDA**
1. Install NVDA.
2. Work through `docs/ACCESSIBILITY_CHECKLIST.md` (36 items) and tick each one.

**O18. Speed and memory**
1. On your PC (and on an older or low-RAM PC if you have one), cold-boot Windows and start Gum.
2. Time how long it takes for the desktop to appear.
3. After 10 minutes of normal use, read the RAM figure in Task Manager.
4. Confirm or adjust the W7-B budgets.

**O19. Grammar content**
1. Have a native or advanced speaker spot-check 30 of the new N5 points and examples (W2-C). Decide D6.

---

## 6. Counts

- **CODE packages:** 24, in **8 waves** of 3. After that comes 1 owner release wave of 7 steps.
- **Effort per wave:** most waves are L/L/M or L/M–L/M. The critical path is about 8 × the longest package in each wave.
- **OWNER checks:** **19** (O1–O19).
- **OWNER decisions:** **11** (D1–D11).
- **OWNER release steps:** **7** (R-1 to R-7).
