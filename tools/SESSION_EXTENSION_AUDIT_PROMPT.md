# JP Study — Full session feature audit prompt (for Claude)

> **2026-07-17:** This 112-ID checklist was actually run — see
> `EXTENSION_AUDIT_REPORT.md` (repo root) for the full results, evidence,
> and the fixes that followed. Use this file to re-run the checklist from
> scratch later; use the report to see what was already found and fixed.

Copy everything below the line into a new Claude chat (Agent) with the `jp-study-app` repo open.

---

## Role

You are auditing **every** shipped JP Study Chrome companion + bridge + Anki mining-rules feature. Treat recent agent work as **finished / PASS-ready** — verify each item with evidence; do **not** collapse, skip, or renumber IDs. Mark each numbered feature **PASS / FAIL / BLOCKED / SKIP**.

Prefer: command output, HTTP JSON, file reads, vitest, screenshots. Fix only small clear breakages; ask before large redesigns. Do not commit unless asked.

## Constraints

- Scope: `src/` + `extension/` (mirror changes to `src/main/chrome-extension/` via install sync).
- Chrome: **max 4** `suggested_key` commands — never add a fifth (`bulk-tabs` has no default).
- Pairing: `http://127.0.0.1:18765` + Bearer token (Settings → Study → Chrome extension).
- Extension UX: toolbar **popup is minimal**; **full settings** live in `options.html` (`open_in_tab`).
- i18n for app chrome strings via `catalogs.ts` / `useT()` (not required for extension HTML copy).

## Prep

```bash
node tools/extension-feature-check.cjs
node tools/i18n-check.cjs
npx vitest run src/shared/__tests__/bookLevelEstimate.test.ts src/shared/__tests__/profileRules.test.ts src/shared/__tests__/pageLevelDetect.test.ts src/shared/__tests__/extensionCapture.test.ts
```

Start JP Study if possible; copy pairing token; Reload unpacked extension from Show-folder path (or `extension/`).

**Efficient test order:** (1) static / unit → (2) HTTP bridge smoke → (3) desktop UI → (4) Chrome-only last.

Bridge base: `http://127.0.0.1:18765`  
Header: `Authorization: Bearer <TOKEN>`

---

## Full feature list (do not drop rows)

For each ID: run the practical test; if FAIL, open the cited files/lines. Line ranges are approximate anchors from the current tree — re-grep if files shifted.

### 1–6 · Install & packaging

| ID | Feature | Practical test | Efficient agent check | Main files (lines) |
|----|---------|----------------|----------------------|--------------------|
| 1 | No “Too many shortcuts” error | Load unpacked; extension card has no red error | Count `suggested_key` in manifest ≤ 4 | `extension/manifest.json` 28–46; AppData `chrome-extension/manifest.json`; `src/main/chrome-extension/manifest.json` |
| 2 | Four suggested shortcuts present | `chrome://extensions/shortcuts`: Save, Dictionary, Mine, Wheel with defaults | Assert ids `save-page`, `dictionary-popup`, `mine-selection`, `action-wheel` each have `suggested_key` | `extension/manifest.json` 28–43 |
| 3 | `bulk-tabs` command without default key | Same page: `bulk-tabs` listed, key empty until assigned | Assert command exists and has **no** `suggested_key` | `extension/manifest.json` 44–46; `extension/background.js` 541–542 |
| 4 | Options open in tab (not cramped popup) | Right-click → Options opens full tab | Assert `options_ui.open_in_tab: true` | `extension/manifest.json` 12–15 |
| 5 | Install syncs all extension files | Restart app → AppData folder contains options, settings, tabs, content, etc. | Diff `extension/` vs `%AppData%/jp-study-app/chrome-extension/` file names | `src/main/extensionInstall.ts` 22–50, 76–106 |
| 6 | Bundled fallback lists every critical file | With no live `extension/` source, writeBundled still emits options/tabs | Assert `BUNDLED_FILES` includes `options.html`, `tabs.html`, `settings.js` | `src/main/extensionInstall.ts` 22–50, 88–93 |

### 7–15 · Minimal toolbar popup

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 7 | Connected chip | Open popup with app running → chip **Connected** | `refreshHealth` → `type: 'health'` | `extension/popup.html` 118–120; `extension/popup.js` 51–59 |
| 8 | Page / level / Anki-profile indicators | Popup shows Page, Level, Anki profile rows for active tab | `refreshIndicators` + `page-context` / `jp-get-level-badge` | `popup.html` 123–137; `popup.js` 62–107 |
| 9 | Capture / Mine / Tabs / Scan-strip actions only | Four ghost buttons (Scan-strip added since this row was written); still no wall of secondary tools | Snapshot button ids `capture`, `mine-auto`, `tab-picker`, `scan-strip` | `popup.html` 140–145; `popup.js` 109–138 |
| 10 | **Open full settings** primary CTA | Click → `options.html` tab | `chrome.runtime.openOptionsPage()` | `popup.html` 146–148; `popup.js` 130–132 |
| 11 | Clipboard in app / Anki in app | Buttons open app surfaces via bridge | `type: 'ui-open'` targets `clipboard` / `anki` | `popup.html` 151–153; `popup.js` 134–142 |
| 12 | Quick pairing details only | Collapsed `<details>` with token/port/Test — not full settings | Grep `Quick pairing` + no YouTube/wheel fields in popup | `popup.html` 156–166 |
| 13 | Hint: tools live on page / in app | Hint mentions dictionary/wheel/OCR on page; clipboard/Anki in app | Read hint paragraph | `popup.html` 149 |
| 14 | Popup not a giant scroll of settings | Height stays compact; no Mining/YouTube/Wheel cards | Assert popup lacks `details.card` / yt-mode / slot-count | `popup.html` (whole); contrast `options.html` 129–215 |
| 15 | Mine status shows folder · profile | Mine from popup → status `Mined → <folder> · <profile>` | Assert status string uses `localFolder` / `profileName` | `popup.js` 115–121 |

### 16–23 · Full settings (`options.html` cards)

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 16 | Yomitan-style collapsible cards | Options tab: multiple `<details class="card">`, not one infinite scroll | Count `details.card` ≥ 5 | `extension/options.html` 29–64, 129–215 |
| 17 | Card: Pairing | Token, port, Save / Test / Pull from app | Grep Pairing + `pull-app` | `options.html` 129–144; `options.js` |
| 18 | Card: Open in JP Study app | Links: clipboard, Anki, mining rules, flashcards | Buttons `open-clipboard`, `open-anki`, `open-rules`, `open-flashcards` | `options.html` 146–155; `options.js` ~130–145 |
| 19 | Card: Mining defaults | Folder label, prefer Anki, notes; audio→`audio` hint | `#folder`, `#prefer-anki` | `options.html` 157–167 |
| 20 | Card: YouTube | Mode metadata/download + audio-only | `#yt-mode`, `#yt-audio` | `options.html` 169–179; `settings.js` 25–26 |
| 21 | Card: Radial wheel | Slot count 4/6 + per-slot selects | `#slot-count`, `#slots` | `options.html` 181–192; `settings.js` 3–28 |
| 22 | Card: Shortcuts & scanning | Lists 4 shortcuts + dict/FAB/tab-picker category copy | Shortcuts & scanning section | `options.html` 194–215 |
| 23 | Lead copy: popup stays minimal | Lead says full settings here; popup stays minimal | Read `.lead` | `options.html` 126–127 |

### 24–30 · Deep-links (`POST /v1/ui/open`)

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 24 | Bridge route `/v1/ui/open` | `POST` `{ "target": "clipboard" }` → `{ ok: true }` | Curl with Bearer; 401 without | `extensionServer.ts` `broadcastUiOpen` + `POST /v1/ui/open` |
| 25 | IPC → renderer handler | App window focuses; `extension:ui-open` fires | `broadcastUiOpen` + `onExtensionUiOpen` | `extensionServer.ts`; `preload.ts` `onExtensionUiOpen`; `App.tsx` → `handleExtensionUiOpen` |
| 26 | Target: clipboard panel | Popup/options → Clipboard → history panel | `handleExtensionUiOpen('clipboard')` | `extensionBridgeUi.ts` 21–24, 46–50 |
| 27 | Target: Anki app | → Anki / field mapping section | targets `anki` / `anki-mapping` | `extensionBridgeUi.ts` 38–41, 52–54 |
| 28 | Target: mining rules | → Settings → Study → Mining rules | `profile-rules` / `mining-rules` | `extensionBridgeUi.ts` 26–36, 56–58 |
| 29 | Target: extension-bridge settings | → Chrome extension pairing settings | `extension-bridge` / `extension-settings` | `extensionBridgeUi.ts` 9–18, 60–62 |
| 30 | Target: flashcards | Options “Open flashcards” → flashcards app | `flashcards` | `extensionBridgeUi.ts` 64–66; `options.html` 153 |

### 31–42 · On-page reader dictionary popup

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 31 | Word-click opens dict popup | Click JA word → `#jp-study-popup.dict-popup` | `lookupAtPoint` / `showPopup` | `content.js` 800–870, 747–757; `content.css` dict styles |
| 32 | Head: term + TTS + close | Head shows query, play, × | `.dict-head` / `.dict-tts` / `.dict-x` | `content.js` 507–516 |
| 33 | Pitch / reading + glossary | Entry shows pitch pattern, reading, gloss/senses | `renderDictEntries` | `content.js` 624–691 |
| 34 | Source line | Dictionary source label when present | `.dict-source` | `content.js` 676–686 |
| 35 | **+ Add to Anki** | Button mines term as Anki-bound mine | `data-act="anki"` → `mine-text` | `content.js` 580–590, 687 |
| 36 | Example sentences | Button loads examples list | `loadPopupExamples` → `/v1/examples` | `content.js` 522–524, 725–745; `extensionServer.ts` 1175–1200 |
| 37 | Foot: Mine + Clipboard | Secondary Mine / Clipboard actions | `.dict-foot` buttons | `content.js` 526–528, 561–575 |
| 38 | Profile footer | Footer shows `category · profile` | `.dict-profile` + `page-context` | `content.js` 529, 693–712 |
| 39 | Lookup via bridge | With dicts loaded, entries return | `POST /v1/lookup` | `extensionServer.ts` 1134–1173; bg lookup msg |
| 40 | Sentence / selection mine UI | Select text or click `。！？` → popup with mine | `getMinePayload` returns text | `content.js` 161–172, 876–888 |
| 41 | Dictionary shortcut | Alt+Shift+D opens popup for selection/word | command `dictionary-popup` | `manifest.json` 32–35; `background.js` commands |
| 42 | Popup styles match reader chrome | Dark Fluent-ish card, not emoji chrome | `#jp-study-popup` CSS | `content.css` ~200–280 |

### 43–52 · On-page tools (FAB stack, themes, OCR, queue)

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 43 | FAB present | Corner FAB with Theme / Highlight / Learn / OCR | `#jp-study-fab` | `content.js` 890–936; `content.css` 287–320 |
| 44 | Level badge on FAB | Top badge shows `N#` / `HSK#` / `X` / `—` | `#jp-study-level-badge` | `content.js` 895, 997–1010, 1150–1195; `content.css` 322–342 |
| 45 | Context badge on FAB | Under level: `category · profile` | `#jp-study-context-badge` | `content.js` 896, 1012–1100; `content.css` 345–361 |
| 46 | Highlight mode | FAB/wheel Highlight ON → select → colored mark | `mark.jp-study-hl*` / `jp-study-hl-mode` | `content.js` 252–256, 778–798, 914–917 |
| 47 | Reading themes | Cycle Theme: night / sepia / paper / gray / off | `jp-study-theme-*` on `documentElement` | `content.js` 402–430, 912 |
| 48 | Learning tint | Learn tint ON → known terms tinted by level | `POST /v1/known-levels` | `content.js` 1306–1345; `extensionServer.ts` 1101–1113; `App.tsx` 401–409 |
| 49 | OCR tab + missing-model message | Wheel/FAB OCR; without models see install message | `GET /v1/ocr/status`; overlay path | `content.js` 1248–1303; `background.js` ~397–425; `extensionServer.ts` 813–823, 1202–1230 |
| 50 | Offline queue + badge | Quit app → mine → badge count; reopen → flush | `enqueue` / `flushQueue` / badge | `background.js` 62–111, 503–505 |
| 51 | Save page / smart capture | Alt+Shift+R on article → Library Inbox | `POST /v1/capture` | `background.js` 126–146, 529+; `extensionServer.ts` 890–907 |
| 52 | Clipboard → app history | Send selection → Clipboard panel | `POST /v1/clipboard` | `background.js` 359–380; `extensionServer.ts` 1022–1058; `App.tsx` 368+ |

### 53–56 · Radial wheel

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 53 | Open action wheel | Alt+Shift+W → radial UI | Msg `jp-action-wheel`; `#jp-study-wheel.open` | `content.js` 184–242, 385–400, 1411+; `background.js` 537–540 |
| 54 | Wheel slot count 4 vs 6 | Options → 6 → reopen wheel shows 6 labels | `jpStudySettings.wheelSlotCount` | `settings.js` 20–35; `options.html` 181–192; `content.js` 63–79 |
| 55 | Customizable wheel slots | Assign Record / Tab picker / OCR etc.; each fires | `runWheelAction` + `wheel-action` switch | `content.js` 246–301; `background.js` ~713–743; `settings.js` 3–17 |
| 56 | Wheel action inventory | Actions: save, download, mine, dictionary, clipboard, ocr, record, audio-save, theme, highlight, learn, epub, bulk-tabs | Diff `JP_WHEEL_ACTIONS` vs handlers | `settings.js` 3–17; `content.js` 30–52, 246–301 |

### 57–60 · YouTube

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 57 | Save mode = metadata | Options metadata; Save on YT → metadata/playlist entry | `detectPageKind` + capture with YT URL | `settings.js` 25–26; `options.html` 172–176; `background.js` capture path |
| 58 | Save/Download mode = download | Options download; Download on watch → job queued | `POST /v1/download` `{url}` | `background.js` ~309–325; `extensionServer.ts` 909–999 |
| 59 | Audio-only download toggle | Toggle on → download uses audioOnly | Assert body `audioOnly: true` | `options.html` 177; `settings.js` 26; download handler |
| 60 | YT success/error toasts | Toast text for queued / saved / fail | `formatYtToast` cases | `content.js` 95–106, ~286–295 |

### 61–66 · Audio record → Whisper → cards

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 61 | Record toggle start | Wheel Record → mic permission → recording toast | BLOCKED if no mic; else MediaRecorder | `content.js` 303–349 |
| 62 | Record stop → audio clipboard | Stop → “Audio on clipboard — use Save audio” | `jp-get-audio-clipboard` returns dataUrl | `content.js` 327–337, 1397–1402 |
| 63 | Save audio → Whisper | App open + Whisper model → transcription | `POST /v1/audio/save`; App transcribe reply | `extensionServer.ts` 539–617, 1003–1019; `App.tsx` 315–366 |
| 64 | Audio mines to folder `audio` | Local flashcards folder label `audio` | Assert mine `folder: 'audio'` / `localFolder` | `extensionServer.ts` 588–597 |
| 65 | Audio on card (local + Anki) | Card has playable audio / Anki `[sound:]` when mapped | `audioDataUrl` on mined payload | `App.tsx` 294–310; `extensionServer.ts` 483–521 |
| 66 | Audio failure messages | No recording / app closed / no Whisper → clear error | Hit API without audio / with app killed | `content.js` toasts; `handleAudioSave` errors |

### 67–72 · Chrome level badge (FAB)

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 67 | Persistent level badge | Badge always visible on pages with content script | Query `#jp-study-level-badge` | `content.js` 895–934, 997–1010 |
| 68 | Silent page sample + rescan | Change page text / navigate → badge updates after idle | Debounce + MutationObserver | `content.js` 1162–1240 |
| 69 | JA page → JLPT `N#` | NHK Easy + JLPT lists filled → `N1`…`N5` | `POST /v1/level-estimate` Japanese sample | `background.js` 775–790; `extensionServer.ts` 1115–1132; `pageLevelDetect` / `bookLevelEstimate` |
| 70 | ZH page → HSK `#` | Study lang ZH + Chinese article → `HSK1`…`HSK6` | Chinese sample → estimate | same as 69; study lang ZH |
| 71 | No matching JA/ZH text → `X` | English Wikipedia → `X` | English text → empty/`X` | `App.tsx` 412–427; `content.js` level scan |
| 72 | Offline / no lists → `—` | Quit app or empty slot lists → `—` (or last cache) | Offline / `noLists` branch | `content.js` level detector; bridge reply |

### 73–80 · Category + Anki profile indicator

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 73 | Persistent context badge | FAB shows second badge under level | `#jp-study-context-badge` | `content.js` 896, 1012–1044 |
| 74 | Detect **news** | NHK / Asahi / etc. → News | Unit `detectContentCategory(url)` | `extension/shared.js` 157–210; `src/shared/extensionCapture.ts` 224–280 |
| 75 | Detect **novel** | syosetu / kakuyomu → Novel | same | same |
| 76 | Detect **manga** | manga/comic host or 漫画 in title → Manga | same | same |
| 77 | Detect **youtube** | watch/playlist URL → YouTube | same | same |
| 78 | Detect **article** / **other** | Generic blog → article; random → other | same | same |
| 79 | Profile name when paired | Mining rule matches → badge `News · <Profile>` | `GET /v1/page-context?url=&title=` | `extensionServer.ts` 746–811; `background.js` 793–808 |
| 80 | Profile `—` when offline | Quit app → category stays, profile `—` | UI offline branch | `content.js` 1070–1100 |

### 81–88 · Bulk tab picker (+ category chips)

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 81 | Open from popup | Popup → Tabs → tab picker window | `open-tab-picker` / `tabs.html` | `popup.js` 124–128; `background.js` 230–246 |
| 82 | Open from wheel / command | Wheel slot Tab picker or `bulk-tabs` command | `openTabPicker` | `background.js` 541–542, 733, 743; `settings.js` bulk-tabs |
| 83 | Multi-select + row highlight | Check several tabs → rows highlight | `.tab-row.selected` | `tabs.js` 61–86, 98–154 |
| 84 | Category highlight indicators | Each row has color chip: news/novel/manga/youtube/article/other | `.cat-badge.cat-*` + `.tab-row.cat-*` | `tabs.js` 34–55, 99–147; `tabs.html` 90–206 |
| 85 | Settings copy explaining detection | Options Shortcuts card explains URL/title heuristics | Tab picker category paragraph | `options.html` 204–210; `tabs.html` 290–294 |
| 86 | Bulk Mine | 2 article tabs → both mine | Loop `/v1/mine` | `tabs.js` 179–217; `background.js` list-tabs ~200–230 |
| 87 | Bulk Save / capture | 2 articles → 2 inbox/captures | Loop capture | `tabs.js` runBulk `capture` |
| 88 | Bulk YT download + progress | 2 YT tabs download; non-YT skipped; `N/M` progress | Filter kind + download | `tabs.js` 179–210; download path |

### 89–98 · Mining rules (Anki profile engine)

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 89 | Settings page exists | Settings → Study → **Mining rules** | Nav id `profile-rules` | `ProfileRulesPage.tsx` 159+; `settingsRegistry.ts` |
| 90 | Rule CRUD (label, enable, profile) | Add/edit/delete; profile dropdown from Anki profiles | `profileRulesGet` / `Set` | `ProfileRulesPage.tsx`; `preload.ts` 1058–1063 |
| 91 | Match: source | Rule source=extension / audio / epub / … | `ruleMatches` unit tests | `src/shared/profileRules.ts` 64+ |
| 92 | Match: card kind | word vs sentence vs any | same | same |
| 93 | Match: language | ja / zh / ru / unknown / any | `detectMineLanguage` + match | `profileRules.ts` |
| 94 | Match: **category** | news/novel/manga/youtube/article/other | Settings category select + unit test | `profileRules.ts` 11–21, 64–75, 120–174; `ProfileRulesPage.tsx` 343–362 |
| 95 | First match wins + reorder | Two overlapping rules; ↑↓ changes winner | `resolveProfileId` order | `profileRules.ts` 84–108; ProfileRulesPage reorder |
| 96 | Live mine uses rules | Rule news+sentence → Profile B; mine NHK sentence → toast Profile B | Set rules via IPC; `POST /v1/mine` | `extensionServer.ts` handleMine ~398–537 |
| 97 | Audio source routing | Rule source=audio → Profile C on Save audio | `/v1/audio/save` after rule set | `handleAudioSave` + `handleMine` source audio |
| 98 | IPC registered at boot | Mining rules load/save without “no handler” | `registerProfileRulesIpc` | `src/main/profileRules.ts` 36–38; `main.ts` |

### 99–105 · Desktop JLPT/HSK level detection

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 99 | Estimator formula (0.85 cumulative) | Unit tests pass for band selection | vitest `bookLevelEstimate` | `src/shared/bookLevelEstimate.ts`; `__tests__/bookLevelEstimate.test.ts` |
| 100 | Vocab from Settings slot lists | Empty lists → no badges; filled → badges | `getSlotList` / levelLists | Settings study lists; renderer estimate |
| 101 | Study lang JA→JLPT / ZH→HSK | Switch study language → scheme changes | `getStudyLang()` in estimate | `bookLevelEstimate` / `levelEstimate` |
| 102 | Library EPUB cover badge | Cover bottom-right `N#`/`HSK#` + flash once | Library with EPUB + lists | `LibraryView.tsx` 101–102, 916, 1198, 1289–1323 |
| 103 | No lists → no cover badge | Clear lists → badges gone after refresh | enrich no-op | same |
| 104 | Flashcard deck/book-group badge | Thumb shows level from card headwords/sentences | Deck with N5-only vs hard mix | `deckLevelEstimate.ts`; `FlashcardsView.tsx` 153, 1218–1221, 1687–1690 |
| 105 | Statistics user level | Stats shows your estimated `N#`/`HSK#` | `getLevelEstimate` / `estimateUserLevel` | `StatisticsView.tsx` 17–40; `levelService.ts` 85–110; `levelEstimate.ts` |

### 106–112 · Bridge wiring minutiae

| ID | Feature | Practical test | Efficient agent check | Main files |
|----|---------|----------------|----------------------|------------|
| 106 | Local cards use `payload.folder` | Options folder `Web` → cards in `Web` not always `Extension` | Assert `onExtensionMined` folder | `App.tsx` 275–312; mine `localFolder` |
| 107 | Whisper IPC live | Audio save triggers transcribe-request/reply | Log IPC once during audio save | `App.tsx` 315–366; `preload.ts` 996–1005; `extensionServer.ts` 163–180 |
| 108 | Health endpoint | `GET /v1/health` 200 when app up | curl | `extensionServer.ts` 719–721 |
| 109 | page-kind / page-context | `GET /v1/page-kind`, `GET /v1/page-context` | curl with url query | `extensionServer.ts` 724–738, 746–811 |
| 110 | Full route inventory | Auth required on mutating routes | Probe without token → 401 | Routes table below |
| 111 | Preload API surface | `window.api` has mined/clipboard/transcribe/ui-open/level/profileRules | Read `preload.ts` 964–1063 | `src/preload.ts` |
| 112 | chrome-extension mirror | After edit `extension/`, mirror or install copy updated | Diff critical files | `extensionInstall.ts` 8–50, 76–106; `src/main/chrome-extension/*` |

---

## Bridge route inventory (token required where noted)

File: `src/main/extensionServer.ts`

| Route | Auth | Approx lines | Notes |
|-------|------|--------------|-------|
| GET `/v1/extension-settings` | no (loopback) | 707–716 | Token pull for options |
| GET `/v1/health` (also `/health`) | no | 719–721 | Reachability |
| GET `/v1/page-kind` | no | 724–738 | Kind + category heuristic |
| GET `/v1/page-context` | **yes** | 746–811 | Category + resolved Anki profile |
| GET `/v1/ocr/status` | **yes** | 813–823 | Manga OCR models |
| GET `/v1/mine-info` | **yes** | 826+ | Active profile / deck hint |
| GET `/v1/download/status` | **yes** | 836+ | YT job status |
| POST `/v1/inbox` | **yes** | 848–868 | Raw inbox |
| POST `/v1/mine` | **yes** | 871–887 (+ `handleMine` ~398–537) | Mining + profile rules |
| POST `/v1/capture` | **yes** | 890–907 | Smart capture |
| POST `/v1/manga-import` | **yes** | ~956+ | Long-strip manga scan import (was undocumented — added after EXTENSION_AUDIT_REPORT.md caught it missing) |
| POST `/v1/download` | **yes** | 909–999 | YT download |
| POST `/v1/audio/save` | **yes** | 1003–1019 (+ `handleAudioSave` ~539–617) | Whisper → mine folder `audio` |
| POST `/v1/clipboard` | **yes** | 1022–1058 | Append clipboard history |
| POST `/v1/ui/open` | **yes** | ~1069–1092 (+ `broadcastUiOpen` ~106–122) | Deep-link into app |
| GET `/v1/clipboard` | **yes** | after `/v1/ui/open` | List clipboard |
| POST `/v1/known-levels` | **yes** | 1101–1113 | Learning tint |
| POST `/v1/level-estimate` | **yes** | 1115–1132 | Page JLPT/HSK badge |
| POST `/v1/lookup` | **yes** | 1134–1173 | Dictionary popup |
| POST `/v1/examples` | **yes** | 1175–1200 | Example sentences |
| POST `/v1/ocr` | **yes** | 1202–1230 | Manga OCR |
| POST `/v1/playlist` | **yes** | 1234–1257 | YT playlist meta |
| POST `/v1/video` | **yes** | 1260–1288 | YT video meta |

Helper: `broadcastUiOpen` → IPC `extension:ui-open` → `handleExtensionUiOpen` (`extensionBridgeUi.ts` 46–72).

---

## Golden path smoke (~8 min)

Reflects **minimal popup → Open full settings** architecture:

1. **Pair:** App running → popup chip **Connected**; expand Quick pairing only if needed.
2. **Open full settings:** Popup primary CTA → options tab with collapsible cards (Pairing, Open in JP Study, Mining, YouTube, Wheel, Shortcuts).
3. **Deep-link:** Options → Open clipboard / Anki / mining rules → app surfaces focus.
4. **News (NHK):** FAB level badge + context `News · <profile>`; word-click dict popup (TTS, Add to Anki, examples, profile footer); Mine toast matches Mining rules.
5. **English page:** level `X`.
6. **YouTube:** category YouTube; optional download from wheel/options mode.
7. **Tab picker:** Popup **Tabs** → multi-select with **category color chips** → bulk save/mine.
8. **Record → Save audio** (if mic + Whisper) → folder `audio`.
9. **App:** Library EPUB badge, Flashcards deck badge, Statistics level, Mining rules category CRUD.

---

## Output format (required)

```markdown
# Audit report — full session feature list

## Environment
- App / extension path / study lang / JLPT|HSK lists / AnkiConnect / mic / Whisper

## Static
- extension-feature-check / i18n-check / vitest: …

## Results (every ID 1–112)
| ID | Feature | Verdict | Evidence |
|----|---------|---------|----------|
| 1 | … | PASS/FAIL/BLOCKED/SKIP | … |

## Failures detail
### ID — title
Expected / Actual / Files / Fix suggestion

## Summary
PASS / FAIL / BLOCKED / SKIP counts; top risks; ordered next fixes
```

**Do not omit IDs.** If you cannot test one, mark **BLOCKED** or **SKIP** with why — never delete the row. Never collapse sections into letter-only summaries without the numbered table.

## Allowed quick fixes

- Manifest/AppData sync (≤4 suggested keys; missing options/tabs files)
- Missing IPC registration / preload typings / `/v1/ui/open` wiring
- Obvious crashes in cited ranges
- Stale line-number comments in this prompt after verifying current tree

Ask first: new suggested shortcuts, large UX redesigns, dependency upgrades.

## Fixtures

- News: `https://www3.nhk.or.jp/news/`
- Novel: syosetu / kakuyomu
- YT: `youtube.com/watch?v=…`
- Mine: `{ "text": "今日はいい天気です。", "mode": "sentence", "url": "https://www3.nhk.or.jp/news/" }`
- Level: short JA vs EN vs ZH paragraphs to `/v1/level-estimate`
- UI open: `{ "target": "clipboard" }` | `"anki"` | `"profile-rules"` | `"extension-bridge"` | `"flashcards"`
- Examples: `{ "query": "食べる", "limit": 5 }` → `/v1/examples`
- Page context: `GET /v1/page-context?url=<encoded>&title=<encoded>`

End of prompt.
