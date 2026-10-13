# Gum feature scorecard

Audited **2026-10-12** against `theme/aero-wired-polish` at **bc13760e**. The audit was read-only; this file is its only output.

## How this was scored

- **Method.** For each row I read the main code paths and tests, ran targeted vitest (`--maxWorkers=2`), and probed suspect logic with small scratch scripts outside the repo.
- **E2E.** The headless E2E suite ran once over all 27 flows, and the two flows that failed were run again.
- **Competitors.** Scores are against the best tool in each category: Anki/FSRS, Yomitan/10ten, Migaku, Language Reactor/asbplayer, Bunpro, LingQ, Satori Reader, Mokuro, Textractor/LunaTranslator/GameSentenceMiner, and Windows Vista/7 for the Aero feel.
- **What the numbers mean:**
  - **9+** means near best-in-class *and* verified in real use.
  - Anything never run against the real thing (a real screen, real Anki, real YouTube, a real provider key, a real installer, a human ear) is capped at about 8.
- **Tags.**
  - Gaps are tagged **CODE** (fixable here) or **OWNER** (needs the owner's hardware, accounts or ears).
  - "Confirmed" bugs have a file:line (at bc13760e) and evidence: a probe run, a failing throwaway test, or an exact code trace. Bugs marked **(V)** in the bug list were also re-checked by the coordinator.

### Verification run during this audit

| Check | Result |
|---|---|
| `npm run e2e` (all 27 flows across two runs) | 25/27 PASS on the first run, which ran under heavy CPU load (7 parallel audits running vitest). **dictionary** failed: the KANJIDIC2 import got `busy` because the Yomitan store import (a `legacy` job) sat at 100% for more than 2 min. **lockscreen** failed: no backoff text after 5 wrong PINs, because `typePin` sleeps a fixed 900 ms while scrypt ran slower under load. Run again: **both PASS** (16/16, 31/31). Both are harness timing flakes, not product regressions. |
| Lens / Snip E2E | Pass, but `97-lens` **skips its OCR assertion** when no model is installed. `97b-snip-cards` reads the same picture with the bundled offline recognizer, so the Lens flow could too. |
| Targeted vitest | About 4,700 tests in about 330 files across all rows: **all green**. The confirmed bugs below are mostly not covered by tests. |
| `npx tsc --noEmit` | **572 errors**: 410 in `__tests__`, 60 in `vendor/seanime-web`, about 100 in app code. `docs/RELEASING.md` §0 still lists tsc as a green gate. |
| `node tools/i18n-check.cjs` | Clean: 21,410 keys in all four languages. |
| `node tools/i18n-orphan-key-check.cjs` | **Exit 1, 17 namespace regressions** (`blanc.shell`, `blanc.ready`, `blanc.tb`, …). No vitest runs this gate. |
| `node tools/blanc-budget.cjs --json` | **Blanc boot 2,497,814 B against its gate of 2,411,724 B: over by 86 KB.** Study OS is 4,292,077 B against 4,300,000. Commit bc13760e's "under 4.2 MB" refers to a different metric (source bytes in the import graph), not this built-bundle gate. |

> **Working tree note.** During the audit, another session was editing the tree without committing. It changed `keyboardShortcuts.ts`, `keymapEditor.ts`, `ShortcutSettings.tsx`, `blancMain.tsx`, `main.tsx`, `grammarSrs.ts`, `grammarReviewPrompt.ts`, Grammar components and `product5Ui/*`, and added `kbd7ImportHardening.test.ts` and `zzProbeGrammarSrs.test.ts`.
>
> None of those edits came from this audit. All scores and bugs here are for **HEAD bc13760e**. Some of those edits appear to fix the keymap-import and grammar-SRS bugs listed below. As this file was finished, that session committed **bd1e3ce8**, which says it fixes bugs 32 and 33 (keymap import, key repeat). That fix has not been re-audited here.

---

## Scorecard

### Rows with a prior claim

| Row | Score | Claim | Δ | Top gaps |
|---|---:|---:|---:|---|
| Lockscreen | **8.5** | 9.2 | −0.7 | **OWNER:** real sleep, Win+L and idle are not re-verified since lock4; the E2E fakes `powerMonitor`. **CODE:** idle auto-lock counts video playback as idle (`src/main/lockAutoArm.ts:71-82`). **CODE:** a packaged build doesn't refuse `--remote-debugging-*` and asar is off; the code itself says this is a study lock, not a security boundary (`src/main/lockGuard.ts:31-34`). |
| Updates | **8.0** | 9.1 | −1.1 | **OWNER:** the real `Update.exe --update <local folder>` hand-off has never run (`docs/UPDATE_TESTING.md` says so). **OWNER:** no Authenticode signing. **CODE:** a stale feed URL is used after a failed stable-channel lookup (bug below); no rollback and no "pause updates" (`src/main/squirrelUpdater.ts`, `UpdatePanel.tsx`). |
| Soundscape | **6.5** | 9 | −2.5 | **OWNER:** nobody has listened to it, and all 14 layers and 6 styles are synthesised (FEATURES.md says so). That makes a 9 against myNoise or Noisli unsupportable. **CODE:** a slider change during a fade-in is undone when the fade ends (`soundscapeEngine.ts:1526`). **CODE:** the "offline render" test runs on a hand-made fake Web Audio, not a real engine. |
| Widgets / Shortcuts | **8.0** | 9 | −1.0 | **CODE:** a malformed keymap import bricks the window at boot (bug below). **CODE:** widget drag and resize ignore `pointercancel` and `lostpointercapture` (`WidgetFrame.tsx:311-312,366-367`), and the Aero gadget menu has no Escape or arrow keys. **OWNER:** multi-monitor snapping needs a hands-on check. |
| Calendar | **8.0** | 9.5 | −1.5 | **CODE:** imported weekly BYDAY rules land on the wrong weekdays across time zones (bug below). **CODE:** no yearly, nth-weekday or multi-weekday series, no multi-day events, no snooze (`src/renderer/calendar.ts`). **CODE:** recurring imports from another zone drift by an hour after DST with no warning. **OWNER (decision):** reminders fire only while a renderer is alive; there are no OS-scheduled toasts. |
| Agent | **7.0** | 9.2 | −2.2 | **CODE:** single-shot plan with no tool-result loop. `toolOutputForPlanner` (`shared/agentCloudStudyDataGate.ts:70`) is dead code and there is no native tool calling. **CODE:** Undo is always refused for calendar writes under the Tutor and Automation profiles (bug below), and E2E 96 counts that refusal as a pass (`96-agent.cjs:105-110`). **CODE:** cancel discards streamed text (`agentExecutionIpc.ts:580`), and the local planner has no JSON grammar. |
| Reading Lens | **7.0** | 9 | −2.0 | **OWNER:** KI-6 is still open (no real hotkey, real `desktopCapturer` or mixed-DPI run), and the 64.5→99.4% OCR gain was measured on synthetic fixtures. **CODE:** no "watch region" auto re-OCR (owocr and GSM have it), though the hash cache in `screenOcr.ts:429-456` would support one. **CODE:** `97-lens.cjs` skips its OCR assertion instead of using the bundled recognizer. |
| Translate | **7.0** | 9 | −2.0 | **OWNER:** DeepL, Gemini and DeepSeek are never exercised with real keys. **CODE:** no side-by-side engine comparison (Luna's core feature), and DeepL `formality`/`context` are unused (`translateRouter.ts:458-464`). **CODE:** the mining translation cache grows without bound (`translate.ts:117-183`), and cache keys omit the offline model file. |
| Immersion | **7.0** | 9 | −2.0 | **CODE:** pages are keyed by host and path only, so `?id=1` and `?id=2` share one history row and one bookmark (`src/main/immersion/index.ts:107-119`, `shared/immersion.ts:637-640`). **CODE:** trimming the reading list to 300 never deletes the dropped offline copies (`shared/immersionStudy5.ts:308,526`). **OWNER:** never run on real NHK, syosetu or kakuyomu pages, and there is no graded reading with audio like Satori/LingQ. |
| VN | **7.0** | 9 | −2.0 | **CODE:** four capture-correctness bugs (Test kills a live capture, UTF-16 hook files, repeated lines dropped, clipboard skipped while the reader is focused; see the bug list). **CODE:** raw English errors (`VisualNovelPanel.tsx:589,688,720,1163`). **OWNER:** never run against a real Textractor/Luna hook. **CODE:** no per-line audio or screenshot like GSM, and no OCR fallback. |
| YouTube | **6.5** | 9 | −2.5 | **CODE:** VTT text is never entity-decoded, and the rolling-caption dedupe eats lines that are really said twice (`shared/subtitleCues.ts:33-35,229-235`). **CODE:** pause/cancel uses `proc.kill()`, not a tree kill, so yt-dlp and ffmpeg children can survive (`src/main/media.ts:504`, `youtubeStudy5.ts:60`). **OWNER:** never run against real YouTube; this is a download-then-study design, not in-page like Language Reactor. |
| AI overall | **7.0** | 5.5 | **+1.5** | Fixed since docs/AI_AUDIT.md: F1, F2, F4, F6 and F8 are really done (consent defaults, cache keys plus refresh, unknown providers refused, reserve/settle spend, error codes), and Claude, OpenAI and local providers plus zod-validated output were added. Remaining: **OWNER:** no real-provider run at all; E2E 88 uses a fake server. **CODE:** no streaming for study helpers (F9; `aiStudyAssist.ts:395-406`). **CODE:** the 1.7B local default has no JSON grammar, and there is a fence-stripping bug (below). |

### Rows without a prior claim

| Row | Score | Δ | Top gaps |
|---|---:|---|---|
| Flashcards / SRS + FSRS | **7.5** | n/a | The FSRS-5 maths matches term by term and the optimiser is real (Adam, holdout gate). **CODE:** the scheduler's same-day split (<24 h) disagrees with the optimiser's 4 am study day (bug below). **CODE:** no learn-ahead limit (`reviewSessionQueue.ts:45`). **CODE:** switching SM-2→FSRS throws away history (a 200-day card comes back in 3 days; `flashcardDeck.ts:2160`). FSRS-5 only, with no FSRS-6 and no per-deck presets. |
| Dictionary / popup | **6.5** | n/a | Yomitan v3 import is broad. **CODE:** wrong deinflection word types for godan, する and 来る progressive forms and for てしまう/ておく (9 of 23 common forms fail; `shared/deinflect.ts:231-238,241,243-244,255`). **CODE:** no part-of-speech validation of candidates against the term bank's rules column (Yomitan does this). **OWNER:** the real-dictionary suite (`dictionaryRealData`) is skipped. |
| Anki sync | **7.0** | n/a | The conflict rules are well designed. **OWNER:** two-way `answerCards` sync has never run against a real Anki (fake AnkiConnect only). **CODE:** review history doesn't round-trip (import ignores revlog; export writes an empty revlog in `localDeckApkgCore.ts`), and Anki FSRS parameters aren't imported. **CODE:** mirrored due dates use midnight, not Anki's 4 am (`main/anki/reviewSync.ts:282`). |
| Library / Files | **6.5** | n/a | **CODE:** no author, series or tags metadata and no editor (`src/shared/types.ts:535`, `epubMeta.ts`). **CODE:** EPUB titles aren't entity-decoded (bug below). **CODE:** `filesapp:mine-source` trusts a renderer path despite a comment saying otherwise. **OWNER:** never run against a large real library. |
| EPUB / novel reader | **8.0** | n/a | Real `vertical-rl`, ruby and 縦中横 (E2E-verified). **Fixed:** the saved position is now a *character* fraction of the part (`novelTextAnchor.ts`), so a font, margin or window change lands on the same text, in paged and scroll modes, on reopen and live; E2E `epub` reopens the book in paged and in Scroll flow, after a font-size change, and checks the same paragraph is on screen. The scroll window's rebuild used to replace the restored target with a geometric one, which put a vertical Scroll-flow book back at its start (seen in the E2E probe); it now reuses the saved character. **Fixed:** the sanitizer (`epubLoader.ts` `sanitizeChapterBody`) drops iframe/frame/object/embed/applet/form controls and SVG `set`/`animate*`, and keeps a URL attribute (`href`, `src`, any `*:href`) only for relative, `#`, blob:, data:image and http(s)/mailto; `srcset`/`srcdoc`/`action`-style attributes go (`epubSanitizer.test.ts`). Bug 14 (OPF entities, CDATA) was already fixed (`epubMetaOpf.test.ts`). **CODE:** E2E covers vertical text only (paged and scroll), not horizontal columns. Bookmarks and TOC/slider jumps are still geometric. No in-book search. **OWNER:** never run on a large real library. |
| Manga + OCR | **6.5** | n/a | **CODE:** `detectionSensitivity` is dropped by the scanPage IPC (bug below). **CODE:** 224 px crops use nearest-neighbour sampling (`mangaOcr.ts:206,275`), and detection is simplified compared with Mokuro. **CODE:** `.mokuro` pages are matched off by one for 0-based volumes. **OWNER:** no accuracy run against Mokuro on a real volume; the E2E has no model. |
| Video study mode | **7.0** | n/a | The Seanime sidecar is E2E-driven (U/R/L/C keys) and cue timing is correct. **CODE:** Whisper uses hard 25 s windows with no overlap, and a segment cut mid-word without an end time is dropped from the SRT (`whisperWorker.ts:29,140`, `whisperTranscribePcm.ts:171-176`). **CODE:** no user setting for clip padding. **OWNER:** never run on a real MKV with ASS subtitles; Whisper has only been tried on 3.7 s of synthetic speech. |
| Music / lyrics | **6.5** | n/a | **CODE:** blank LRC timestamps (line ends) are dropped, so loops and clips run into instrumental breaks (`subtitleCues.ts:285`). **CODE:** a lyrics lookup race shows the previous song's lyrics (`liveLyrics.ts:109-119`). **CODE:** no per-line translation, and `[offset:]` is ignored. **OWNER:** never run against LRCLIB on a real library. |
| Scraper | **7.0** | n/a | The private-address and DNS-rebinding guard is thorough, and the fabricated dashboard data from the old audit is gone. **CODE:** CJK and Cyrillic subtitle tags can never match, and "Rusty" matches Russian (bug below). **OWNER:** never run against real indexes or the owner's real qBittorrent/Seanime. |
| Screen recorder | **7.5** | n/a | Stall-kill, encoder fallback, faststart and atomic assembly are all solid. **OWNER:** the NVENC/QSV/AMF encoders, multi-GB recordings and real display capture need the owner's hardware; the E2E records a synthetic canvas. **CODE:** no retry for a failed extension-recording conversion. |
| Chrome extension | **8.0** | n/a | All 41 routes are token-gated or rebinding-guarded, the server is loopback-only, there are 4 locales, and the E2E loads the real unpacked extension. **CODE:** no offline lookup when the app is closed (Yomitan and 10ten work standalone). **OWNER:** real sites (YouTube/Netflix subtitles) and Web Store packaging are untested. |
| Grammar | **6.0** | n/a | **CODE:** learning or relearning points are treated as brand new (bug below; a fix is in progress in the tree). **CODE:** the cloze needs an exact match, with no kana folding and no conjugations (`grammarReviewPrompt.ts:195-213`). **CODE:** practice tests write to the SRS (`GrammarTestModal.tsx:201`). Content: N5 has 50 points (Bunpro about 130), 459 of 667 zh points have no example, and there is no audio. |
| Known words | **6.0** | n/a | **CODE:** spelling variants aren't merged (no NFKC or kana fold; `tokenizer.ts:135`), and four different word-key rules disagree. **CODE:** Anki sync always uses the JP tokenizer, even for Chinese (bug below). **OWNER:** no traditional/simplified mapping. |
| Stats | **7.0** | n/a | True retention follows Anki's rules. **CODE:** day rollover is at midnight while the optimiser uses 4 am, with no setting (`reviewStats.ts:21-45`). **CODE:** the review log is capped at 50k rows (`shared/reviewLog.ts:68`). **CODE:** the per-deck Due count ignores the new-card limit (bug below). |
| Games | **6.0** | n/a | All 19 games are real (the README still says "Fifteen"). **CODE:** Reverse Recall accepts any comma-separated fragment; Kanji Reading allows an 18% typo margin, which lets び**よ**ういん pass for びょういん (`games/engine.ts:495-496,909-916`). **CODE:** no NFKC or half-width fold, and 3冊 is rejected for 三冊. |
| Notebook / notes | **3.5** | n/a | **CODE:** user notes share a 500-entry FIFO list with automatic mining/translation events, so they are silently deleted (bug below). **CODE:** bodies are silently cut to 4,000 characters. **CODE:** plain text only, with no Markdown, links or search. |
| Snip to cards | **6.5** | n/a | Undo is exact and nothing is read while locked. **CODE:** clipboard watching *and* auto-add are **on by default** (`shared/snipToCards.ts:45-46`), unlike the opt-in Lens. **CODE:** `clipboard.readImage()` is decoded twice a second while an image sits on the clipboard (`main/snipToCards.ts:237,279`). **OWNER:** never tested with a real Win+Shift+S and real Anki. |
| Conversation / shadowing / writing | **6.0** | n/a | Writing correction is solid. **CODE:** no Retry for a failed or cancelled reply (`ConversationPartner.tsx:191,408-414`). Replies don't stream and there is no voice loop. Shadowing has no pitch contour. No E2E. **OWNER:** never run with a real model, and the 1.7B default is weak for conversation. |
| Themes (Study OS 7.5 · Aero 8 · Wired 7.5 · Blanc 7.5) | **7.5** | n/a | Aero has glass, peek, flip and hover glow; Wired has NAVI, layer descent and CRT. **CODE:** Aero is missing a live taskbar thumbnail (it shows a coloured plate), Aero Snap/Shake and jump lists (`components/shell/AeroTaskbarFx.tsx`). **CODE:** no Wired contrast gate, and one real failure (bug below). **OWNER:** no GPU or visual review against Vista/7 references, and no visual-regression baseline. |
| Settings | **7.0** | n/a | 186-id IME-aware search with deep links. **CODE:** no per-setting "modified" marker or reset, and no settings-only export/import (`settingsRegistry.ts:1990-2025`). **CODE:** "Reset desktop" has no Undo (`DesktopShell.tsx:2602-2615`). **CODE:** after Escape, Enter has to be pressed twice in search (`SettingsSearch.tsx:124-128`). |
| Onboarding / first run | **7.0** *(partial)* | n/a | E2E `setup` passes 19/19. **CODE:** the Anki step shows Anki's raw English error, and the download step never refreshes its status. That comes from a sub-audit summary without file:line, so treat it as suspected. |
| i18n (en/ja/zh/ru) | **7.5** | n/a | Coverage is complete and rules 1 and 6 are respected. **CODE:** 185 `{count}`+noun keys are plain strings, which breaks CLDR rule 5 (e.g. RU "Показать ещё 3 глав"). **CODE:** the orphan-key gate is red (17 regressions) and nothing runs it in vitest. The catalogs are a shared hotspot. |
| Accessibility | **7.0** | n/a | 8+ axe suites pass, with forced-colours, a skip link and focus traps. **OWNER:** the NVDA checklist is 0 of 36 checked. **CODE:** axe runs only in jsdom with `color-contrast` disabled, with no real-Chromium contrast run per theme and no axe suite for the Wired panels (`NaviTerminal`, `WiredConsole`, `InterceptPanel`). |
| Performance / RAM (Blanc) | **6.0** | n/a | 20k-card numbers are good (grade 0.2 ms). **CODE:** the built Blanc boot bundle is **over its gate** by 86 KB, and `tools/blanc-budget.cjs` is not wired into vitest or E2E, so it went red unnoticed. **CODE:** RAM is displayed but never baselined or gated. **OWNER:** cold start and RAM on real hardware per tier. |
| Installer / packaging | **6.0** | n/a | Fuses are set and Squirrel events are handled early. **OWNER:** no signing certificate and no clean-VM install (U7). **CODE:** uninstall leaves the HKCU Run entry and the Startup `GrammarX-OS-Hotkey.cmd` behind (bug below). **CODE:** asar is off, so `OnlyLoadAppFromAsar` and integrity validation can't be enabled; use asar with `asar.unpack` for the models. |

### Averages

| Set | Average |
|---|---:|
| **All 37 rows** | **6.9 / 10** |
| The 11 rows with a 9+ claim | 7.3 now, against a claimed 9.1 |
| AI overall | 7.0, up from 5.5 |

The pattern behind the drop is consistent. The engineering is careful, with good isolation, consent, atomic writes and broad tests, so most rows are solid 7–8s. But no claimed-9 row has been verified with the real counterpart (screen, provider, YouTube, game hook, ears, installer). Most of them also still had a confirmed logic bug that the test suite passes over.

---

## Confirmed bugs (at bc13760e)

**(V)** means the coordinator re-checked the bug, by probe or by reading the cited lines.

| # | Where | Bug | Evidence |
|---|---|---|---|
| 1 | `src/shared/deinflect.ts:231-238, 241, 243-244, 255` | Wrong `rulesIn` word types. The godan, する and 来る progressive rules use v5/vs/vk but should use v1 (いる is ichidan). The ichidan てしまう/ておく rules use v1 but should use v5. As a result 飲んでいた, 眠っていた, 食べてしまった and 勉強していました don't deinflect. | esbuild probe **(V)** |
| 2 | `src/renderer/cardAudioPlayback.ts:44-47` | `current` is cleared when `play()` *resolves*, which is when playback starts. So `stop()` can't stop a clip that is playing, and review clips overlap. The test fake hides this. | code trace **(V)** |
| 3 | `src/shared/flashcardScheduling.ts:359-366` | Same-day split is `elapsed < 1` (24 h), while the optimiser (`fsrsOptimizer.ts:82`) uses 4 am study days. The weights are trained on one rule and applied with another (S 4.47 vs 5.87 in the probe). | code **(V)** + probe |
| 4 | `src/shared/reviewSessionQueue.ts:35-45` | No learn-ahead limit: the soonest step card is shown however far in the future it is due, so long steps get skipped. | code **(V)** |
| 5 | `src/renderer/notebookTimeline.ts:45,79` (+`studyBackgroundJobs.ts:164,283,414`) | User notes share a 500-entry FIFO with automatic events, so they are silently deleted after about 500 mines. | code **(V)** |
| 6 | `src/renderer/notebookTimeline.ts:142` / `components/notes/NoteViewer.tsx:85` | The note body is silently cut to 4,000 characters, and the textarea has no `maxLength` or notice. | code **(V)** |
| 7 | `src/main/scraper/torrents.ts:103-104` | `\b` never fires next to CJK or Cyrillic, so 中文/简体/繁體/Русск are never detected. `rus` has no closing `\b`, so "Rusty Lake" is tagged Russian. | node probe **(V)** |
| 8 | `src/renderer/calendarIcsImport.ts:348` (with `:511`) | BYDAY offsets are computed from the already-localised start date. A Tue/Thu 09:00 Tokyo class imports as Tue/Thu 20:00 New York; it should be Mon/Wed. The test only checks `startTime`. | code **(V)** + probe |
| 9 | `src/shared/localAgentProfiles.ts:78-89,103-112` + `agentUndoClient.ts:67,96` | Calendar inverse operations (`calendar.delete-event`) aren't in the Tutor or Automation profiles, so Undo is offered and then always refused. | code **(V)** |
| 10 | `src/main/mangaOcr.ts:1978-1982` | The `mangaOcr:scanPage` IPC rebuilds the request without `detectionSensitivity`, so page scans always run at "normal". | code **(V)** |
| 11 | `src/renderer/views/MangaReader.tsx:413` | The raw Electron/English error is shown as the OCR error. | code **(V)** |
| 12 | `src/shared/mokuroVolume.ts:143-146` + `src/main/library.ts:349,367` | Library pages are renamed `0001…` (1-based), so a 0-based `.mokuro` volume matches every page one off. | code **(V)** |
| 13 | `src/main/aiStructuredOutput.ts:24-28` | The fence check runs before the leading-`{` check, so a valid JSON reply containing ``` in a string is cut down, leading to `invalid-response` and a paid retry. | code **(V)** |
| 14 | `src/main/epubMeta.ts:5-8` | `dc:title` isn't entity-decoded (`&amp;` is shown literally), and a CDATA title comes back undefined. | node probe **(V)** |
| 15 | `src/main/filesApp/ipc.ts:288` + `shared/filesApp/catalog.ts:304-305` | `filesapp:mine-source` reads any `store:'file'` path the renderer sends; the comment says it can't. (Low: needs a compromised renderer.) | code **(V)** |
| 16 | `src/shared/snipToCards.ts:45-46` | Clipboard watching and auto-add (and Anki send `auto`) are on by default, so every screenshot becomes cards. This is a privacy and UX default, inconsistent with the opt-in Lens. | code **(V)** |
| 17 | `src/renderer/widgets/wid6.css:197-199` + `theme/wired-archive.css:30` | Wired gallery preview text is `rgba(109,241,255,.42)` on glass, about 3.35:1 contrast; body text needs 4.5:1. | computed |
| 18 | `src/shared/i18n/catalogs/ru.ts:6362, 6063, 3754` (+ en counterparts) | Plain-string plurals: "Показать ещё 3 глав", "{count} строк", hand-rolled "плейлисте(ах)". | catalog **(V)** |
| 19 | `tools/blanc-budget.cjs` gate | Blanc boot bundle is 2,497,814 B against a 2,411,724 B gate. | tool run **(V)** |
| 20 | `src/shared/subtitleCues.ts:285` | Blank timestamped LRC lines (line ends) are dropped, so line 1 runs 10–40 s instead of 10–14 s. Repeat, auto-pause and mined clips then include the instrumental break. | code **(V)** + probe |
| 21 | `src/shared/subtitleCues.ts:33-35, 229-235` | VTT entities aren't decoded (`&gt;&gt;` is shown literally). A line said twice in a row is treated as a rolling-caption carry and lost. | probe |
| 22 | `src/renderer/liveLyrics.ts:109-119` | No check that the song is still current after `await fetchLyrics`, so skipping during a lookup shows the old song's lyrics (4 mounted consumers). | code trace |
| 23 | `src/renderer/soundscape/soundscapeEngine.ts:1526` | `setTargetAtTime` without cancelling the scheduled fade-in, so a slider change inside the fade is undone when the fade ends. | Web Audio spec trace |
| 24 | `src/renderer/components/immersion/VisualNovelCaptureControls.tsx:177` + `visualNovelCaptureSession.ts:307` | "Test" during a real capture replaces the live session and leaves capture off. | code **(V)** |
| 25 | `src/main/immersion/visualNovels.ts:298` | The hook-file source omits `{ keepRepeats: true }`, so a repeated line (e.g. a second はい。) is dropped. | code **(V)** |
| 26 | `src/main/immersion/visualNovels.ts:1235` (+`:636-650`) | Reading starts at the end of the file, so the UTF-16LE BOM is never seen and the text comes out garbled. UTF-8 characters split across two reads are also corrupted. | probe |
| 27 | `src/main/immersion/visualNovels.ts:506` | Clipboard capture is skipped whenever *any* Gum window is focused, including the VN reader, and the skipped text is marked as seen. | code |
| 28 | `src/main/immersion/index.ts:107-119` | `siteKey` drops the query string, so pages that differ only by query share one history and bookmark row (and stats id). | code |
| 29 | `src/shared/immersionStudy5.ts:308, 526` | Trimming the list to 300 (and import) never deletes the dropped offline copies, which are up to 200k characters each. | code |
| 30 | `src/renderer/whisperWorker.ts:140` + `whisperTranscribePcm.ts:171-176` + `transcriptionJobs.ts:544` | A segment with no end time is dropped, so its text never reaches the SRT. | code trace |
| 31 | `src/main/media.ts:504`, `src/main/youtubeStudy5.ts:60` | `proc.kill()` instead of a process-tree kill, so yt-dlp and ffmpeg children can survive pause/cancel and keep the `.part` file locked. | code |
| 32 | `src/renderer/keyboardShortcuts.ts:1842-1846, 1131-1140, 1615` | A keymap import with `{type:'runCommands'}` and no `commandIds` passes the filter and is persisted, then crashes `describeCustomAction`. That crash happens inside `installKeyboardShortcuts()` before render, so **the window never loads again.** (A fix appears to be in flight in the working tree.) | failing throwaway test (sub-audit), code **(V)** |
| 33 | `src/renderer/components/ShortcutSettings.tsx:375, 460` | Sequence capture doesn't ignore `e.repeat`, so a held key is recorded twice. | failing throwaway test |
| 34 | `src/renderer/components/WidgetFrame.tsx:311-312, 366-367` | Drag and resize listen only for `pointerup`. After a lost pointer capture (alt-tab) the widget follows the mouse until the next click. | code trace |
| 35 | `src/main/squirrelUpdater.ts:405-407` | When the stable feed lookup fails, `askSquirrel()` runs without resetting the feed, so it reuses a staging folder that may already be deleted. Fix: `squirrelDownloads(null)`. | code **(V)** |
| 36 | `src/main/squirrelEvents.ts:285-288` | Uninstall leaves the login-item Run entry (`appLifecycle.ts:111,124`) and the Startup `GrammarX-OS-Hotkey.cmd` (`osHotkeyHelper.ts:115-125`), which keeps launching PowerShell after Gum is gone. | code **(V)** |
| 37 | `src/renderer/components/Lockscreen.tsx:287-292`, `blanc/BlancLockscreen.tsx:144-148` | The submit runs inside a state updater, which StrictMode runs twice. **Dev builds only:** one wrong PIN counts as 2 attempts. | code trace |
| 38 | `src/renderer/grammarSrs.ts:86` | A point in its learning or relearning steps (0 repetitions, 0-day interval) is treated as new: lapses and ease are reset, and it never graduates with "1m 10m" steps. (A fix is in flight in the working tree.) | code **(V)** + probe |
| 39 | `src/shared/reviewStats.ts:333-336` | Per-deck "Due" counts every new card and ignores the new-card limit and Anki ownership (3,001 shown vs 21 in the queue). | code **(V)** |
| 40 | `src/renderer/ankiSync.ts:29-50` | Anki known-word sync always runs the kuromoji JP tokenizer: in Chinese mode 学习 becomes 学 and 电脑 becomes 电. | code **(V)** |
| 41 | `src/main/anki/intervals.ts:708-711` + `shared/anki.ts:414,487` | One suspended card or duplicate note marks the whole word suspended, so a live 180-day note drops to level 0. | probe |
| 42 | `src/renderer/flashcardDeck.ts:1734` | 勉強する reviews are stored under 勉強する, but the reader and Anki look up 勉強. | code |
| 43 | `src/renderer/games/engine.ts:909-916` (Reverse Recall), `:495-496` | Comma split accepts sentence fragments (17 of 49 JP sentences affected); typo tolerance on Kanji Reading accepts wrong readings. | code **(V)** |
| 44 | `src/renderer/components/speak/ConversationPartner.tsx:191, 408-414` | A failed or cancelled reply leaves the learner's message unanswered with no Retry, and Start after Clear replays the cached opening because the UI never sends `refresh`. | code **(V)** |
| 45 | `src/renderer/components/settings/SettingsSearch.tsx:124-128` | Enter reads a stale `open`, so after Escape a result takes two Enters to pick. | code trace |

**Not bugs, but worth knowing:**

- **Harness flakiness:** `tools/e2e/flows/95-lockscreen.cjs:63-66` (fixed 900 ms wait after each PIN) and `20-dictionary.cjs:25-33` (120 s idle wait while a queued Yomitan store import holds the slot) fail under CPU load.
- **Docs drift:** README says "Fifteen small games" (there are 19) and "1,810 grammar points" (the corpus has 2,905). FEATURES.md still marks Immersion and the Files app UNVERIFIED although E2E now drives them. RELEASING.md lists tsc as green.

---

## Top 10 code-fixable work packages (ranked by impact)

**Rules for running these in parallel:**

- **Ownership.** Each package owns only the files listed. Two packages never share a file.
- **i18n strings.** `src/shared/i18n/catalogs/*.ts` is a shared hotspot. A package that needs new strings adds them to its own lazy pack if one exists. Otherwise it hands its keys to a single serialized catalog commit at the end.
- **Files with uncommitted edits.** These have uncommitted edits from another session, so check with that session before touching them: `keyboardShortcuts.ts`, `keymapEditor.ts`, `ShortcutSettings.tsx`, `blancMain.tsx`, `main.tsx`, `grammarSrs.ts`, `grammarReviewPrompt.ts`, Grammar components.

| Rank | Package | Fixes | Owns (exclusive) | Effort | Expected impact |
|---:|---|---|---|:---:|---|
| 1 | **Deinflection word types** | Bug 1. Add the 9 failing forms as tests. Return the final word-type flags so callers can filter by part of speech later. | `src/shared/deinflect.ts`, `src/shared/__tests__/deinflect*.test.ts` | S | Dictionary 6.5→7.5; also lifts the hover popup, Snip, reader, Lens and extension lookups, which all share it. |
| 2 | **Card audio, lyrics race, soundscape ramps** | Bugs 2, 22, 23. Clear the clip on `ended`/`error`. Check the song is still current after each await and share in-flight lookups. `cancelAndHoldAtTime` before a slider ramp. Forget paused elements in foregroundAudio. | `src/renderer/cardAudioPlayback.ts`, `src/renderer/foregroundAudio.ts`, `src/renderer/liveLyrics.ts`, `src/renderer/soundscape/soundscapeEngine.ts`, their tests | S | Flashcards +0.3 (overlapping review audio), Music +0.5, Soundscape +0.5. Soundscape stays capped below 8 until someone listens. |
| 3 | **FSRS fidelity** | Bugs 3, 4. A new `studyDay` helper with a 4 am rollover, shared by the scheduler and the optimiser. A 20-minute learn-ahead limit. Enforce Hard ≤ Good < Easy. A `fsrsMemoryReplay` that rebuilds memory from the review log; wiring it into `convertDeckSchedule` is a follow-up for whoever owns `flashcardDeck.ts`, see #6. | `src/shared/fsrs.ts`, `src/shared/flashcardScheduling.ts`, `src/shared/reviewSessionQueue.ts`, new `src/shared/studyDay.ts`, new `src/shared/fsrsMemoryReplay.ts`, matching tests | M | SRS 7.5→8.5; Grammar inherits the fix through the shared scheduler. |
| 4 | **Notes that can't be lost** | Bugs 5, 6. Give user notes their own key, with migration out of the 500-entry FIFO. Add `maxLength`, a counter and a notice. Optionally Markdown rendering and search. Keep the `appendNotebookEvent` API so callers don't change. | `src/renderer/notebookTimeline.ts`, `src/renderer/components/notes/**`, `notebookTimelineStore`/`notesBrowser` tests | M | Notebook 3.5→5.5. This is the only silent data-loss bug found. |
| 5 | **Subtitle and lyric parser correctness** | Bugs 20, 21. Decode entities. Detect carried-over lines by order. Keep blank LRC stamps as line ends. Apply `[offset:]`. Optionally strip `[音楽]`-style sound labels from study cues. | `src/shared/subtitleCues.ts`, new `src/shared/__tests__/subtitleCuesText.test.ts` | S | YouTube +0.5, Music +0.5, Video +0.25. |
| 6 | **One language-aware word key** | Bugs 40, 41, 42. A new `knowledgeKey` (NFKC, kana fold, language-aware tokenizer, する compounds) used everywhere. A word is suspended only when all its cards are. | new `src/shared/knowledgeKey.ts`, `src/renderer/ankiSync.ts`, `src/renderer/flashcardDeck.ts`, `src/renderer/components/knownWords/KnownWordsManager.tsx`, `src/renderer/studyTokens.ts`, `src/shared/anki.ts`, `src/main/anki/intervals.ts`, tests | M | Known words 6→7.5, Anki sync +0.3; Chinese mode becomes usable. |
| 7 | **Update, uninstall and lock correctness** | Bugs 35, 36, 37. Use `squirrelDownloads(null)` in the stable-failure fallback. On uninstall, delete the Run value and the Startup `.cmd` and stop the helper. Move the PIN submit out of the state updaters. Limit "latest wins" in `lockIpcGate` to snapshot channels (not `*-reply` or acks). | `src/main/squirrelUpdater.ts`, `src/main/squirrelEvents.ts`, `src/main/osHotkeyHelper.ts`, `src/main/lockIpcGate.ts`, `src/renderer/components/Lockscreen.tsx`, `src/renderer/components/blanc/BlancLockscreen.tsx`, new tests | S | Updates +0.3, Installer +0.5, Lockscreen +0.2. Further gains need the owner's VM and signing. |
| 8 | **Calendar import and recurrence fidelity** | Bug 8: compute BYDAY in the event's own zone, with a TZ-pinned test. Multi-weekday weekly series, yearly and nth-weekday monthly. A warning for recurring events imported from another zone. Snooze. | `src/renderer/calendar.ts`, `src/renderer/calendarIcs.ts`, `src/renderer/calendarIcsImport.ts`, `src/renderer/calendarReminders.ts`, `src/renderer/components/calendar/**`, `src/renderer/__tests__/calendar*` | M | Calendar 8→9 (a 9.5 also needs OS-level reminders). |
| 9 | **Agent: honest Undo, cancel and strict E2E** | Bug 9: let the inverse of the agent's own write pass the profile gate. Keep partial text on cancel. Make `96-agent.cjs` assert that Undo actually undoes, and add a chat step against the fake provider. The N29 tool-result loop is a follow-up L-sized package in the same files. | `src/shared/localAgentProfiles.ts`, `src/renderer/agentUndoClient.ts`, `src/main/agentExecutionIpc.ts`, `tools/e2e/flows/96-agent.cjs` | S (loop: L) | Agent 7→7.5 (→8.5 with the loop). |
| 10 | **VN capture correctness and translated errors** | Bugs 24–27. Disable Test while capturing. Remember the hook-file encoding and decode it with a streaming decoder. `keepRepeats` for hook files. Exclude the reader window from the focus check. Handle Blob/ArrayBuffer frames. Main returns error codes and the renderer maps them to keys (VN pack). | `src/main/immersion/visualNovels.ts`, `src/main/immersion/visualNovelCaptureSession.ts`, `src/shared/visualNovelCapture.ts`, `src/renderer/components/immersion/VisualNovelCaptureControls.tsx`, `src/renderer/components/immersion/VisualNovelPanel.tsx` | M | VN 7→8. |

### Next tier

These are also code-fixable and file-disjoint from the ten above:

| Package | Fixes | Owns | Effort |
|---|---|---|:---:|
| Blanc back under budget, gated in vitest, RAM probe | Bug 19 | `components/blanc/**` static imports except `BlancLockscreen.tsx`, `tools/blanc-budget.cjs`, `blancBootGraph.test.ts`, new `tools/perf/ramProbe.cjs`; `blancMain.tsx` only after the other session lands | M |
| Manga OCR correctness | Bugs 10–12, plus bilinear crops | `src/main/mangaOcr.ts`, `src/shared/mokuroVolume.ts`, `src/renderer/views/MangaReader.tsx` | M |
| Russian plurals and a vitest orphan-key gate | Bug 18; the 17 orphan regressions | catalogs, serialized | M–L |
| Scraper Unicode tags | Bug 7 | `src/main/scraper/torrents.ts` | S |
| Snip opt-in for new profiles and a format-change poll | Bug 16 | `src/main/snipToCards.ts`, `src/shared/snipToCards.ts` | S |
| E2E harness hardening | Poll instead of sleeping in `95-lockscreen`; wait out queued imports in `20-dictionary`; bundled-recognizer OCR assertion in `97-lens` | those flow files | S |
| Immersion page identity and copy cleanup | Bugs 28, 29 | `src/main/immersion/index.ts`, `src/shared/immersion.ts`, `src/shared/immersionStudy5.ts`, `src/renderer/immersionStudy5Store.ts` | S–M |
| EPUB metadata and sanitizer allow-list, Files mine-source lookup | Bugs 14, 15 | `src/main/epubMeta.ts`, `src/renderer/epubLoader.ts`, `src/main/bookEpub.ts`, `src/main/filesApp/ipc.ts` | M |
| YouTube process-tree kill and Whisper segment ends and overlap | Bugs 30, 31 | `src/main/media.ts`, `src/main/youtubeStudy5.ts`, `whisperWorker.ts`, `whisperTranscribePcm.ts`, `transcriptionJobs.ts` | M |
| Speak Retry and refresh, streaming | Bug 44 | `src/renderer/components/speak/**`, `src/shared/aiConversation.ts` | M |
| AI hygiene | Bug 13; model in the analysis cache keys | `aiStructuredOutput.ts`, `translateAnalysis.ts`, `sentenceAnalysis.ts` | S |
| Stats day rollover and queue-true Due | Bug 39 | after #3, using `studyDay.ts` | M |
| Anki revlog and FSRS-parameter round-trip | Import and export review history; import FSRS parameters | apkg import/export files | M |
| Game answer checks | Bug 43 | `src/renderer/games/engine.ts` | S |
| Widget gestures and Aero menu keys | Bug 34 | `WidgetFrame.tsx`, `widgets/widgetAlign.ts` | S |
| Wired contrast gate and axe suite | Bug 17 | `wid6.css`, new tests | S |
| Settings transfer, reset Undo, search Enter | Bug 45 | settings files listed in the Settings row | M |

**Owner-only items** (none of these are code fixes):

- Real-desktop Reading Lens run (KI-6).
- Real-key runs for Claude, OpenAI, Gemini and DeepL.
- Two-way sync against a throwaway real Anki profile.
- Real YouTube, Textractor/Luna and an MKV with ASS subtitles.
- Listening to the soundscape.
- NVDA checklist.
- Signing certificate and a clean-VM install/update (U7, `docs/UPDATE_TESTING.md`).
- Hardware encoder recordings.
- Real Win+L, sleep and idle on the lock.
