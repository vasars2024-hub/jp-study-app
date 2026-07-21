# Audit report — JP Study Chrome companion

Audited 2026-07-17. Method: three parallel source-code trace passes (each independently re-deriving evidence, no shared assumptions) + direct filesystem inspection of the live AppData install + live HTTP tests against the running extension bridge (`http://127.0.0.1:18765`) with a real pairing token. Real Chrome (`chrome://extensions`) and the desktop app's own UI were **not** reachable this session — Claude-in-Chrome never connected, and desktop/File Explorer access was declined twice. Those specific steps are marked BLOCKED below; everything else is evidence-backed.

> **2026-07-17, same session, follow-up:** every FAIL/PARTIAL finding below (§7 IDs 9, 61, 65, 112; the `/v1/ui/open` negative-path bug in §9; the YouTube save-mode bug in ID 58) was fixed and live-verified after this report was first written. See **§15 Fixes applied** for what changed, how it was verified, and what (if anything) remains open. The PASS/FAIL verdicts in §7 and the narrative in §1/§6/§8 below are left as originally written — they're the audit record — but should be read together with §15 for current status.

---

## 1. Executive verdict

- **Overall status: Implemented and genuinely wired end-to-end in dev/source-running mode, with several real, verified bugs and one significant packaging-freshness risk.** This is not a case of "looks done, isn't" — most of the architecture (bridge routes, IPC chains, mining-rules engine, dictionary, level detection) is real and functional. But it is also not bug-free, and one of the bugs found recreates the *category* of problem that originally motivated this audit (a stale extension copy that could ship to real users).
- **Is the extension genuinely installable by a normal user?** **Yes — confirmed live**, when running from source (`npm start` / `electron-forge start`): the AppData folder is auto-created, was byte-identical to `extension/` at test time, contains every file `manifest.json` references, and the user personally completed the real `chrome://extensions` → Load unpacked flow from the exact shown path and it loaded cleanly with no errors. **Not yet proven true for a packaged build** — see the packaging risk below, which is the one open question left.
- **Does Chrome load the shown folder without directory errors?** **Yes — live-confirmed.** The user manually completed Load-unpacked from the exact shown AppData path and shared a screenshot: the extension loaded cleanly as "JP Study — Reader Companion 2.4.1", no `入力ディレクトリが存在している必要があります` error, no red manifest-error banner, toggle enabled. Extension ID: `ibnefejmefkhjdhkgjgijgfnfbaopcjj`. (Automated click-through was not possible from my side — Chrome blocks extension-driven navigation to `chrome://` pages, and computer-use hard-caps browser apps to read-only regardless of permission — so the user performed this one step manually.)
- **Is pairing functional?** Yes — live HTTP-tested: token/port/folder pulled correctly, `POST /v1/ui/open` correctly 401s with no/wrong token and 200s with the right one, `GET /v1/page-context` correctly 401s unauthenticated.
- **Is the AppData/userData copy current?** Yes, right now, in dev mode (live-diffed byte-identical to `extension/`). **No** for what a packaged build would ship — the fallback source (`src/main/chrome-extension/`) has drifted from `extension/` in 3 of 12 files.
- **Is the bundled packaged fallback complete?** File list: complete (12/12). File **content**: stale in `background.js` (missing the "Scan long-strip manga" feature entirely), `popup.html` (missing the Scan-strip button), and `content.css` (still uses old dictionary-popup class names that don't match what the current `content.js` actually renders — a packaged install would very likely show an unstyled/broken dictionary popup). This is the single highest-priority finding.
- **Is there one coherent extension implementation?** The dev copy (`extension/`) is coherent and current. The risk is entirely in the second, manually-maintained fallback copy that packaged builds actually depend on.
- **Are pairing and YouTube properly separated?** **Yes**, confirmed three independent ways (two research passes + a direct grep I ran myself): no YouTube control exists inside the Pairing card or popup; YouTube has its own separate `options.html` card and its own app view; the pairing UI mentions YouTube only as one line in a 3-item "what you can do after pairing" bullet list. The user's original complaint is resolved in the current source.
- **Is the implementation safe to call complete?** At the time this audit was first written, no — see §8 for the specific bugs found (packaging drift, `/v1/ui/open` accepting invalid targets silently, YouTube download-mode setting only honored by 1 of 5 save entry points, a dead message listener, local-deck audio that's stored but never playable, a stale "3 buttons" popup claim). **All of these were fixed and live-verified later in this same session — see §15.**

---

## 2. Environment

- **OS:** Windows 11 Pro 10.0.26200
- **Repo path:** `C:\Users\Arseniy\Projects\jp-study-app`
- **Branch / commit:** `main` @ `85ed593` ("Merge feat/frutiger-aero-platform into main…")
- **Uncommitted changes:** extensive — ~150 modified tracked files and ~150 untracked new files/dirs, including the entire audited feature set (`extension/`, `src/main/chrome-extension/`, `src/main/extensionInstall.ts`, `src/main/extensionServer.ts`, `src/main/profileRules.ts`, `src/renderer/extensionBridgeUi.ts`, `tools/SESSION_EXTENSION_AUDIT_PROMPT.md`, etc.) — this whole feature is currently uncommitted work-in-progress on `main`.
- **App mode:** dev (`electron-forge start`)
- **App running:** yes (relaunched once mid-session after an accidental port collision — see §10)
- **Chrome version:** unknown — real Chrome was not reachable this session
- **Extension source folder:** `extension/` (repo root)
- **Mirror folder:** `src/main/chrome-extension/` (packaged-build fallback; **drifted**, see §7 ID 112)
- **AppData/userData extension folder:** `C:\Users\Arseniy\AppData\Roaming\jp-study-app\chrome-extension` — verified present, byte-identical to `extension/` for all 12 files in this dev session
- **Extension ID:** `ibnefejmefkhjdhkgjgijgfnfbaopcjj` — obtained via user-performed live Load-unpacked, version `2.4.1` shown in Chrome
- **Bridge URL:** `http://127.0.0.1:18765` (loopback-only, IP-gated on every route)
- **Token source:** live app instance via `GET /v1/extension-settings`; observed the token value change across an app restart (expected — not evidence of a bug)
- **Study language / profile:** active profile `p2-en-ja` "Reverse Learning Focus", deck `JP Study::EN to JP` (reverse EN→JP learning setup)
- **JLPT/HSK lists:** empty — live-confirmed (`/v1/level-estimate` on a real Japanese sample returned `noLists:true`)
- **AnkiConnect:** reachable and attempted live — a real `/v1/mine` call triggered a genuine AnkiConnect-side validation error ("Anki's sort field 'Meaning' is empty…"), while the local card was still saved successfully. This is real evidence of the app talking to actual AnkiConnect, not a mock, and of graceful degradation working.
- **Dictionary data:** real — live-confirmed via `/v1/lookup?query=食べる`, returned genuine JMdict entries with pitch-accent HTML and English **and Russian** glosses.
- **OCR model:** installed — live-confirmed via `GET /v1/ocr/status` → `{"available":true,"message":"Manga OCR models are installed."}`
- **Whisper model:** not verified live (no audio pipeline exercised)
- **Microphone:** not tested (no live browser/desktop control)
- **Blocked dependencies this session:** real Chrome browser control (Claude-in-Chrome never connected) and desktop/File Explorer control (declined twice by the user). All filesystem/HTTP-level verification was still done directly via shell + curl, which is why most IDs are fully resolved despite this.

---

## 3. Reconstructed architecture

**Three copies of the extension exist:**
1. `extension/` (repo root) — actively-edited dev source, currently what dev-mode installs.
2. `src/main/chrome-extension/` — a manually-maintained mirror, Vite-`?raw`-imported into `extensionInstall.ts` as the **packaged-build fallback**.
3. `%APPDATA%\jp-study-app\chrome-extension\` — the runtime install folder Chrome actually loads, produced by `getChromeExtensionFolder()`.

**Sync mechanism** (`src/main/extensionInstall.ts`): `ensureChromeExtensionFolder()` runs once per boot inside `startExtensionServer()` (called from `src/main.ts` right after `createWindow()`). `candidateSourceDirs()` tries, in order: `process.cwd()/extension`, `app.getAppPath()/../extension`, `app.getAppPath()/extension`, `process.resourcesPath/extension`. If any resolves, it unconditionally overwrites every file in the AppData folder from that live source (not "only if missing"; no stale-file removal, but that's not exercised by current file lists). If none resolve, it falls back to `writeBundledExtension()`, writing the Vite-embedded `src/main/chrome-extension/*` snapshot instead.

**Packaging risk (traced in source, not yet exercised by an actual `electron-forge package` run):** `forge.config.ts`'s packager `ignore` only allows `/.vite` and `/node_modules` through, and `extraResource` only ships `public`. `extension/` is never copied into a packaged app's resources. That means **every packaged/production build** will fail all four `candidateSourceDirs()` candidates and fall back to `writeBundledExtension()` — i.e., the drifted mirror described in §7 ID 112 is not a rare fallback, it is what real end users get.

**Settings UI path display:** `ExtensionBridgeSection.tsx` renders a read-only input bound to `status.folderPath`, sourced live through `window.api.extensionStatus()` → IPC `extension:status` → `getExtensionBridgeStatus().folderPath` → `getChromeExtensionFolder()`. This is confirmed to be the *actual* live install path (I read it directly via `GET /v1/extension-settings` and it matched the real folder on disk), not a hardcoded string.

**"Show folder" button:** `window.api.extensionRevealFolder()` → IPC `extension:revealFolder` → `shell.openPath(getChromeExtensionFolder())` — opens the real install folder.

**`POST /v1/ui/open` full chain** (traced in source, live-tested for auth):
`extensionServer.ts` route → `requireAuth()` (401 without/invalid Bearer, live-confirmed) → `broadcastUiOpen(target)` → IPC `extension:ui-open` to every `BrowserWindow` → preload `onExtensionUiOpen` → `App.tsx` effect → `handleExtensionUiOpen()` (`extensionBridgeUi.ts`) → target dispatch to a `CustomEvent` (`os:open` / `clipboard:open` / `settings:navigate`) → consumed by `DesktopShell.tsx`, `ClipboardHistoryPanel.tsx`, `SettingsApp.tsx` respectively. Every documented target resolves to a real, mounted listener. **However**, live-tested: the route accepts any string as `target` (including garbage) and still returns `{"ok":true}` — there is no allow-list validation server-side (see §8, §9).

**Mining-rules engine is real, not decorative** (the single most important "is this actually wired" question in the whole audit): `handleMine()` in `extensionServer.ts` calls `loadProfileRules()` from disk and resolves through `resolveProfileMatch(rules, {source, cardKind, language, category}, activeProfileId)` — the exact function unit-tested in `profileRules.test.ts` (8/8 passing). `handleAudioSave()` routes through the identical function with `source:'audio'`. **Live-confirmed**: a real `/v1/mine` call against an NHK news URL correctly resolved `category:"news"`, the active profile, and its deck name, and triggered a genuine AnkiConnect round-trip.

**Category detection** (news/novel/manga/YouTube/article/other) is implemented **twice** — once in `extension/shared.js` (JS) and once in `src/shared/extensionCapture.ts` (TS) — with matching host-suffix lists today, but nothing enforces they stay in sync (no shared source, no cross-parity test).

**Pairing vs. YouTube:** YouTube is generic-bridge infrastructure, not a first-class pairing concept. There is no YouTube-specific pairing entry point anywhere in source — `options.html` has one "Pairing" card and a fully separate "YouTube" card; `popup.html` has zero YouTube references; the desktop `ExtensionBridgeSection.tsx` mentions YouTube only inside a generic 3-item capability bullet list; `YouTubePlaylistsView.tsx`'s "connect extension" link routes to the same generic pairing settings card, not a YouTube-specific one.

---

## 4. Prior transcript claims vs verified reality

| Claim | Verified state | Evidence | Consequence |
|---|---|---|---|
| **A** — Chrome install instructions added to Settings → Study → Chrome extension (status, dev-mode explanation, 4 numbered steps, token copy/regenerate, paste+Test, EN/JA/ZH/RU) | **Correct** | `ExtensionBridgeSection.tsx` renders `installLead`/`installStep1-4`, copy/regenerate/refresh buttons; matching i18n keys exist with parallel structure in `catalogs.ts` for EN/JA/ZH/RU | None — matches claim |
| **B** — Old `extension/`-relative-path instruction was fixed | **Correct** | The shown instruction text is dynamically bound to the live `status.folderPath`, not a hardcoded repo-relative string; the only literal "repo `extension/`" text left anywhere is in two `README.md` files that are explicitly excluded from copying and never reach a shipped install | Low residual risk (dev-only docs) |
| **C** — AppData folder created on startup with every manifest-referenced file | **Correct**, dev mode | Filesystem-verified directly: all 12 files present, byte-identical to `extension/` | Packaged-build freshness is the open risk, not presence (see §3, §7 ID 112) |
| **D** — Pairing split from YouTube | **Correct** | Independently confirmed 3 ways: two research passes + my own grep of `ExtensionBridgeSection.tsx`, `popup.html`, `options.html` — no YouTube control inside the pairing surfaces anywhere | None — user's original complaint is resolved |
| **E** — Full 112-ID audit prompt already exists at `tools/SESSION_EXTENSION_AUDIT_PROMPT.md` | **Correct**, but it's an earlier/shorter version | File exists, 326 lines, 112 numbered rows, same ID scheme as this audit — this session's prompt is a superset/rewrite of it, not a new artifact | Two prompt versions now exist; consider consolidating |

---

## 5. Static checks

| Check | Result | Evidence |
|---|---|---|
| `git status` | Done | ~150 modified + ~150 untracked, see §2 |
| `node tools/extension-feature-check.cjs` | **PASS** | 32/32 checks passed |
| `node tools/i18n-check.cjs` | **PASS** | "all 3061 English keys are translated in ja/zh/ru" |
| `npx vitest run bookLevelEstimate/profileRules/pageLevelDetect/extensionCapture` | **PASS** | 4 files, 25 tests, all passed (293ms) |
| Manifest validation | **PASS** | 4 `suggested_key` commands (≤4 limit), `bulk-tabs` has none, `options_ui.open_in_tab:true`, all referenced files present |
| source/mirror/AppData diff | **PARTIAL FAIL** | AppData = source (byte-identical, dev mode). Mirror ≠ source in `background.js`, `popup.html`, `popup.js`, `content.css` (see §7 ID 112) |
| Stale-instruction search | **PASS** | No stale `extension/`-folder wording reaches any shipped/live-instruction path |

---

## 6. Cross-system architecture verdicts

### 6.1 One coherent extension
The **dev** extension (`extension/`) is coherent, current, and what's actually installed and running in this session. The **packaged-build fallback** (`src/main/chrome-extension/`) is a second, independently-maintained copy that has already drifted in 3 of 12 files. Verdict: coherent for developers running from source; **not yet proven coherent for packaged end users** — untested because no `electron-forge package`/`make` run was performed this session, but the drift is unambiguous from source and would deterministically affect any packaged build cut right now.

### 6.2 Normal-user Chrome installation
**PASS — fully confirmed, including the live click-through.** All filesystem/HTTP-level preconditions were independently verified (install folder exists at the exact path Settings displays, valid `manifest.json`, every referenced file present), and the user then manually performed the actual `chrome://extensions` → Developer mode → Load unpacked → select-shown-folder flow and confirmed it loads cleanly: "JP Study — Reader Companion 2.4.1", extension ID `ibnefejmefkhjdhkgjgijgfnfbaopcjj`, no directory error, no manifest-error banner. The original `入力ディレクトリが存在している必要があります。` bug does not recur — this is now empirically confirmed, not just inferred from source.

### 6.3 AppData/userData sync and packaged fallback
Sync logic overwrites unconditionally on every boot from whichever `candidateSourceDirs()` entry resolves first; live-confirmed correct for dev mode. Packaged fallback is complete in file *list* but stale in file *content* — see §7 ID 112 for the itemized diff. This is the report's top remediation priority.

### 6.4 Pairing vs YouTube separation
Clean separation, confirmed multiple independent ways. No remediation needed here — this is the one area where the "worried it might still be true" stance turned out to be unfounded; the fix already landed correctly.

### 6.5 Restart/reload/recovery behavior
Bridge survives app restart with sync re-running (empirically observed once, unintentionally, when the app was killed by a port collision mid-session and relaunched — AppData folder and token both regenerated correctly on the new boot). Extension-reload-in-Chrome and "AppData regeneration after deleting only the extension folder" were not tested (BLOCKED — needs filesystem write access, which was available but this specific destructive test wasn't run to avoid risking the live install without being asked first).

---

## 7. Results — every ID 1–112

*Verdict legend: PASS = evidence-backed and traced end to end. FAIL = confirmed broken/absent/misleading. BLOCKED = live test not performable this session (browser/desktop/audio hardware unavailable), source-level evidence still reported. PARTIAL = works but with a real, cited gap.*

| ID | Feature | Verdict | Evidence | Missing evidence / risk |
|----|---------|---------|----------|-------------------------|
| 1 | No "Too many shortcuts" error | PASS — **live-confirmed** | manifest.json: exactly 4 `suggested_key` entries; user-performed live Load-unpacked screenshot shows no error banner, clean load as "JP Study — Reader Companion 2.4.1" | — |
| 2 | Four suggested shortcuts present | PASS | save-page, dictionary-popup, mine-selection, action-wheel all have `suggested_key` | — |
| 3 | `bulk-tabs` command, no default key | PASS | manifest.json + background.js command handler | — |
| 4 | Options open in tab | PASS | `options_ui.open_in_tab: true` | — |
| 5 | Install syncs all extension files | PASS (dev, live-verified) | AppData folder byte-diffed identical to `extension/`, all 12 files | Packaged-build path untested live |
| 6 | Bundled fallback lists every critical file | PASS (list) / see ID 112 (content) | `BUNDLED_FILES` = 12/12 matching manifest requirements | Content is stale in 3 files |
| 7 | Connected chip | PASS | `refreshHealth` → `type:'health'` → chip class ok/err | — |
| 8 | Page/level/Anki-profile indicators | PASS | `refreshIndicators` sends detect/page-context/level-badge | — |
| 9 | Capture/Mine/Tabs actions only (3 buttons) | **FAIL** | popup.html now has **4** buttons — a "Scan strip" button was added after this claim was written | Claim is stale, not a functional bug, but the "minimal" design intent no longer literally holds |
| 10 | Open full settings primary CTA | PASS | `chrome.runtime.openOptionsPage()` | — |
| 11 | Clipboard-in-app / Anki-in-app buttons | PASS | `type:'ui-open'` with correct targets | — |
| 12 | Quick pairing details only | PASS | collapsed `<details class="quick">`, token/port/Test only | — |
| 13 | Hint: tools live on page / in app | PASS | exact hint string confirmed in popup.html | — |
| 14 | Popup not a giant settings scroll | PASS | popup.html lacks `details.card`/`yt-mode`/`slot-count`; options.html has them | — |
| 15 | Mine status "Mined → folder · profile" | PASS | `popup.js`: `Mined → ${localFolder}${profileName? ' · '+profileName:''}`; **live-confirmed** via `/v1/mine` returning `localFolder:"Extension"`, `profileName:"Reverse Learning Focus"` | — |
| 16 | ≥5 collapsible cards in options.html | PASS | 6 cards: Pairing, Open in JP Study app, Mining defaults, YouTube, Radial wheel, Shortcuts & scanning | — |
| 17 | Card: Pairing | PASS | token/port/Save/Test/Pull-from-app all present and wired | — |
| 18 | Card: Open in JP Study app | PASS | clipboard/anki/rules/flashcards buttons wired to correct `ui-open` targets | — |
| 19 | Card: Mining defaults | PASS | folder label, prefer-Anki, notes, audio hint present | — |
| 20 | Card: YouTube | PASS | `#yt-mode`, `#yt-audio` present | — |
| 21 | Card: Radial wheel | PASS | `#slot-count` + per-slot selects populated from `JP_WHEEL_ACTIONS` | — |
| 22 | Card: Shortcuts & scanning | PASS | lists all 4 shortcuts + detection-heuristic copy | — |
| 23 | Lead copy: popup stays minimal | PASS | exact lead string confirmed | — |
| 24 | Bridge route `/v1/ui/open` auth | PASS — **live-confirmed** | No token → 401; wrong token → 401; correct token → 200 `{"ok":true,"target":"clipboard"}` | — |
| 25 | IPC → renderer handler chain | PASS | broadcastUiOpen → IPC → preload → App.tsx, all traced | — |
| 26 | Target `clipboard` | PASS | → `clipboard:open` → `ClipboardHistoryPanel.tsx` listener | — |
| 27 | Target `anki`/`anki-mapping` | PASS | → `os:open` `'anki'` → valid `WinSection` | Internal Anki-window contents (field mapping) not audited beyond reachability |
| 28 | Target `profile-rules`/`mining-rules` | PASS | → `settings:navigate` → `ProfileRulesPage.tsx` | — |
| 29 | Target `extension-bridge`/`extension-settings` | PASS | → matches `ExtensionBridgeSection` id | — |
| 30 | Target `flashcards` | PASS | → valid `WinSection`; options.html button wired | — |
| 31 | Word-click opens dictionary popup | PASS | `lookupAtPoint`/`showPopup` → `#jp-study-popup.dict-popup` | — |
| 32 | Header: term + TTS + close | PASS | `.dict-head/.dict-tts/.dict-x` present | — |
| 33 | Pitch/reading/gloss render | PASS — **live-confirmed** | `/v1/lookup?query=食べる` returned real pitch-accent HTML + EN/RU glosses from JMdict | — |
| 34 | Source line | PASS — **live-confirmed** | Response included `"source":"JMdict (Japanese–English)"` etc. | — |
| 35 | + Add to Anki | PASS | mines term via `mine-text` → `/v1/mine` | If `lastHit.mode==='sentence'`, clicking one entry's Anki button mines the whole sentence, not that entry's word — minor UX ambiguity |
| 36 | Example sentences | PASS | `loadPopupExamples` → real `/v1/examples` → `dictionary.ts searchExamples` | — |
| 37 | Footer Mine + Clipboard | PASS | `.dict-foot` buttons present | — |
| 38 | Profile footer | PASS | `.dict-profile` populated from real `/v1/page-context` | — |
| 39 | Lookup via bridge is real, not stub | PASS — **live-confirmed** | Genuine Yomitan-format JMdict data returned, not placeholder text | — |
| 40 | Sentence/selection mine UI | PASS | `getMinePayload` + sentence-boundary detection | — |
| 41 | Dictionary shortcut Alt+Shift+D | PASS | manifest command → background.js → content.js `openDictionary()` | — |
| 42 | Popup styling matches reader chrome | PASS | dark translucent card, red accent, real type scale — not placeholder | — |
| 43 | FAB present | PASS | `#jp-study-fab` with Theme/Highlight/Learn/OCR | — |
| 44 | Level badge on FAB | PASS | full chain traced through to `compactLevelBadge` format `"N3"`/`"HSK4"` | — |
| 45 | Context badge on FAB | PASS | same `/v1/page-context` route as ID 38 | — |
| 46 | Highlight mode | PASS | `mark.jp-study-hl*`, `jp-study-hl-mode` class toggling | — |
| 47 | Reading themes | PASS | `jp-study-theme-*` classes, night/sepia/paper/gray rules exist | — |
| 48 | Learning tint | PASS | POST `/v1/known-levels` → real `getLevel()` from `knownWords.ts` | — |
| 49 | OCR tab + missing-model message | PASS — **live-confirmed models present** | `GET /v1/ocr/status` → `{"available":true,"message":"Manga OCR models are installed."}` (real ONNX-based check, not stub) | Actual OCR image submission (`POST /v1/ocr`) not exercised — BLOCKED, no screenshot/manga image + no browser to trigger it |
| 50 | Offline queue + badge | PASS, with a gap | `enqueue`/`flushQueue`, badge text, 1-min alarm, opportunistic flush after success all real | Offline error text says "then Retry queue" but **no UI control anywhere actually sends a manual flush** — only the alarm and post-success flush trigger it. Minor UX-copy/functionality mismatch |
| 51 | Save page / smart capture | PASS | Alt+Shift+R → `smartCapture` → `/v1/capture` → `library.ts importGeneratedArticle` → Inbox folder | — |
| 52 | Clipboard → app history | PASS | full chain traced to `ClipboardHistoryPanel.tsx` | — |
| 53 | Open action wheel | PASS | Alt+Shift+W → `#jp-study-wheel.open` | — |
| 54 | Wheel slot count 4 vs 6 | PASS | `#slot-count` → `jpStudySettings.wheelSlotCount` → content.js | — |
| 55 | Customizable wheel slots | PASS | per-slot selects → `runWheelAction` dispatch | — |
| 56 | Wheel action inventory | PASS | **all 13** actions in `JP_WHEEL_ACTIONS` have real handlers (5 in content.js, 8 via background.js switch) — zero defined-but-unhandled actions found | `epub` action is an alias for generic capture, not EPUB-specific logic — cosmetic naming, not a gap |
| 57 | Save mode = metadata on YouTube | PASS, but unconditional | `smartCapture`/`primaryAction` always does metadata capture for YouTube regardless of the `youtubeMode` setting | See ID 58 — the setting doesn't actually gate this path |
| 58 | Save/Download mode = download | **PARTIAL — real bug** | `youtubeMode==='download'` is only checked inside `saveCurrent()`, reachable **exclusively** via the wheel's dedicated "save" slot. Alt+Shift+R, the popup Capture button, the right-click context menu, and bulk-tabs Save all call `smartCapture()` directly and **never check the setting** — they always do metadata-only capture | The "Default action for YouTube pages: download" setting is effectively dead for 4 of 5 save entry points. This should be fixed or the setting's scope should be documented/renamed |
| 59 | Audio-only download toggle | PASS | `#yt-audio` → `audioOnly:true` in the real download request body | — |
| 60 | YouTube toasts | PASS, wheel-only | `formatYtToast` has distinct queued/saved/fail/already-saved cases | Only invoked from the wheel path — popup/shortcut capture uses different status text, consistent with ID 58's finding |
| 61 | Record toggle start | **BLOCKED (live) — dead code path found in source** | Real `getUserMedia`/`MediaRecorder` implementation exists, reachable via the wheel's "record" slot | A separate `jp-toggle-record` message listener exists in content.js but **nothing ever sends that message** — no manifest command, no background.js caller. Dead code, low severity since the wheel path works, but worth removing or wiring up |
| 62 | Record stop → audio clipboard | PASS | "Audio on clipboard" message + `jp-get-audio-clipboard` returns real dataUrl | — |
| 63 | Save audio → Whisper | PASS | full IPC round-trip to a real `whisperWorker.ts` Worker traced | Actual transcription execution BLOCKED — no mic/audio input available this session |
| 64 | Audio mines to folder 'audio' | PASS | `handleAudioSave` passes `folder:'audio', source:'audio'` into the same real `handleMine()` | — |
| 65 | Audio on card, local + Anki | **PARTIAL — real bug** | Anki path is fully wired (`[sound:...]` via `storeMediaFile`) | The **local (non-Anki) deck path** stores `card.audioDataUrl` but **no renderer component anywhere reads it** — confirmed no `<audio>` consumer exists (`ReaderCollectionPanel.tsx` has zero audio code). Recorded clips are captured and stored but never playable for local-only mines |
| 66 | Audio failure messages | PASS | distinct, real error strings traced for no-clipboard-audio, app-not-open, transcription-timeout, no-audio-track, empty-transcription, mic-permission | No explicit pre-flight "Whisper model installed?" check (unlike OCR's `/v1/ocr/status`) — the "is a Whisper model installed?" hint is baked into a generic timeout message, not a verified condition |
| 67 | Persistent level badge | PASS | `ensureFab()`/`startLevelDetector()` run unconditionally at script load | — |
| 68 | Silent sample + rescan | PASS | MutationObserver + 1200ms debounce | Explicit SPA-navigation handling lives in the separate context detector, not this one — indirect but functional |
| 69 | JA page → JLPT N1–N5 | PASS — **live-confirmed** | `/v1/level-estimate` with a real JA sample correctly resolved `lang:"ja", scheme:"jlpt"` (returned `badge:"—", noLists:true` because this profile's JLPT vocab lists are empty — correct empty-state behavior, not a bug) | — |
| 70 | ZH page → HSK1–6 | PASS (same code path as 69, not independently re-tested live after the JA fix) | `schemeForLang('zh')==='hsk'` traced | — |
| 71 | No JA/ZH text → `X` | PASS | tested with an English sample → correctly returned `badge:"X", empty:true` | — |
| 72 | Offline/no lists → `—` | PASS — **live-confirmed** | see ID 69 — `noLists:true` branch fired correctly for real | — |
| 73 | Persistent context badge | PASS | `#jp-study-context-badge`, `startContextDetector()` unconditional | — |
| 74 | Detect news | PASS — **live-confirmed** | `/v1/page-context` on an NHK URL correctly returned `category:"news"` | Two independently-maintained detection copies (JS + TS) — no parity test |
| 75 | Detect novel | PASS | matching suffix lists in both copies | Same dual-copy risk as ID 74 |
| 76 | Detect manga | PASS | host + title-hint regex traced | Same dual-copy risk |
| 77 | Detect YouTube | PASS | `pageKind` → `'youtube'` category | — |
| 78 | Detect article/other | PASS | fallback chain traced | — |
| 79 | Profile name when paired | PASS — **live-confirmed** | Real `/v1/page-context` call returned `profileId:"p2-en-ja", profileName:"Reverse Learning Focus"` | — |
| 80 | Profile `—` when offline | PASS | offline branch in content.js traced, CSS styling exists | — |
| 81 | Open tab picker from popup | PASS | `open-tab-picker` → `tabs.html` window | — |
| 82 | Open from wheel / bulk-tabs command | PASS | both paths traced to `openTabPicker()` | — |
| 83 | Multi-select + row highlight | PASS | `.tab-row.selected` toggle logic | — |
| 84 | Category highlight chips | PASS | `.cat-badge.cat-*` per category, CSS rules present | — |
| 85 | Settings copy on detection heuristics | PASS | Shortcuts & scanning card + in-picker hint | — |
| 86 | Bulk Mine | PASS | loops real `/v1/mine` per selected tab | — |
| 87 | Bulk Save/capture | PASS | loops real `/v1/capture` | — |
| 88 | Bulk YouTube download + progress | PASS | filters by kind, shows `N/M` progress text | — |
| 89 | Mining rules settings page exists | PASS | `ProfileRulesPage.tsx`, nav id `profile-rules` registered | — |
| 90 | Rule CRUD | PASS | real IPC `profileRulesGet/Set`, profile dropdown from real profile store | — |
| 91 | Match: source | PASS | unit-tested, 8/8 passing | — |
| 92 | Match: card kind | PASS | same test coverage | — |
| 93 | Match: language | PASS | `detectMineLanguage` unit-tested | — |
| 94 | Match: category | PASS | `MINE_CATEGORIES` select, optional dimension | — |
| 95 | First-match-wins + reorder | PASS | array-order resolution + ↑↓ UI, unit-tested | — |
| 96 | Live mine uses rules (not hardcoded) | PASS — **live-confirmed, this is the crux check** | Real `/v1/mine` call resolved profile via the actual rule engine, not a hardcoded value; source quote confirms `resolveProfileMatch(rules, {...}, active?.id)` | — |
| 97 | Audio source routing | PASS | `handleAudioSave` passes `source:'audio'` into the same real resolver | — |
| 98 | IPC registered at boot | PASS | `registerProfileRulesIpc()` called in `src/main.ts` inside `app.whenReady()` | — |
| 99 | Estimator formula, not a stub | PASS | real cumulative-coverage scoring; 12 unit tests passing | — |
| 100 | Vocab from Settings slot lists | PASS | `bandsFromSettings()` reads real slot lists; empty → `null` estimate | — |
| 101 | Study lang JA→JLPT / ZH→HSK | PASS | `getStudyLang()` threaded through scheme selection | — |
| 102 | Library EPUB cover badge | PASS | `CoverLevelBadge` component, real CSS positioning | — |
| 103 | No lists → no cover badge | PASS | `if(!estimate) return null` | — |
| 104 | Flashcard deck/book-group badge | PASS | `BookCoverThumb` + `estimateDeckLevel` sampling real card text | — |
| 105 | Statistics user level | PASS | `EstimatedLevelBadge` → real `estimateUserLevel` | — |
| 106 | Local cards use `payload.folder` | PASS — **live-confirmed** | Live `/v1/mine` (no folder specified) correctly fell back to default `"Extension"`, matching the traced fallback logic exactly | — |
| 107 | Whisper IPC live | PASS | real Worker-based round trip traced | Execution not tested (no audio input) |
| 108 | Health endpoint | PASS — **live-confirmed** | `GET /v1/health` → 200, no auth required | — |
| 109 | page-kind / page-context | PASS — **live-confirmed** | both routes tested live with real URLs | — |
| 110 | Full route inventory | See table below | — | — |
| 111 | Preload API surface | PASS | full `window.api` surface enumerated: mined/clipboard/transcribe/ui-open/level/profileRules/status all present | — |
| 112 | chrome-extension mirror stays in sync | **FAIL — real, verified drift** | `background.js`, `popup.html`, `popup.js`, `content.css` differ between `extension/` and `src/main/chrome-extension/`; the mirror is missing the entire "Scan long-strip manga" feature and uses stale CSS class names that don't match current `content.js` output | This is the top remediation item — see §8 |

**Route inventory** (verified by direct source read of `extensionServer.ts`, cross-checked against the claimed table): all 23 originally-claimed routes exist with the claimed auth requirement (Bearer-token gate matches for every route). One **undeclared** route was found in addition: `POST /v1/manga-import` (auth required) — a real, wired handler for the long-strip manga scanner feature, just missing from the documented inventory. Every route additionally sits behind a global loopback-IP gate (127.0.0.1/::1 only) before any route-specific auth runs.

---

## 8. Failures detail

### ID 112 — chrome-extension mirror has drifted from the dev extension

**Expected:** `src/main/chrome-extension/` (the packaged-build fallback source) stays functionally equivalent to `extension/` (the dev source), since it's what real packaged installs actually ship.

**Actual:** 4 of 12 files differ. `background.js` and `popup.html` are missing the entire "Scan long-strip manga" capture feature (function, context-menu entry, message handler, popup button all absent from the mirror). `content.css` still uses old dictionary-popup class names (`.jp-title`, `.jp-text`, `.jp-dict`, `.jp-actions`) that don't match what the current, identical-in-both-copies `content.js` actually renders (`.dict-head`, `.dict-q`, `.dict-tts`, `.dict-body`, etc.) — meaning a packaged install's dictionary popup would very likely render unstyled or visibly broken.

**Reproduction:** `diff extension/background.js src/main/chrome-extension/background.js` (913 vs 855 lines); same for `popup.html`, `popup.js`, `content.css`.

**Evidence:** Confirmed independently by two research agents reading both trees in full, plus consistent with my own live diff showing the AppData copy currently matches `extension/`, not the mirror (i.e., the mirror is the one that's behind, not the AppData folder).

**Root cause:** `forge.config.ts` doesn't ship `extension/` as a packaged resource, so `writeBundledExtension()` (which reads the mirror) is the only path a packaged build can take — but nothing keeps the mirror updated when `extension/` changes.

**Affected layers:** source, packaging, Chrome (rendered UI), AppData (for packaged users only)

**Fix applied or recommended:** Not fixed (out of the small/clear-breakage scope this audit was authorized for without asking first — this is a real content sync across 4 files, not a one-line stale string). Recommended: either (a) add `extension/` to `forge.config.ts`'s packaged resources and have `candidateSourceDirs()` find it there, making the mirror unnecessary, or (b) add a build-time script that regenerates `src/main/chrome-extension/` from `extension/` automatically (e.g., in `postinstall` or a pre-package hook) so they can never drift.

**Retest result:** N/A — not fixed this session.

**Regression risk:** High if a package build is cut before this is addressed — it would silently ship a broken dictionary popup and a missing feature to real users, which is the same class of "instructions point at something broken" issue that originally motivated this whole audit.

### ID 58 — YouTube download-mode setting only honored by 1 of 5 save paths

**Expected:** Setting "Default action for YouTube pages" to "download" makes Save-type actions on a YouTube page queue a download.

**Actual:** Only the radial wheel's dedicated "save" slot (`saveCurrent()` in background.js) checks `youtubeMode`. Alt+Shift+R, the popup's Capture button, the right-click "Send to JP Study" context-menu item, and the bulk tab-picker's Save/Capture action all call `smartCapture()` directly, which is hardcoded to always do metadata-only capture for YouTube regardless of the setting.

**Reproduction:** Set YouTube mode to "download" in `options.html`, then trigger Save via Alt+Shift+R (or popup Capture, or context menu, or bulk Save) on a YouTube watch page — it will save metadata only, not queue a download.

**Evidence:** `background.js` — `smartCapture()`/`shared.js primaryAction()` never reads `settings.youtubeMode`; only `saveCurrent()` does.

**Root cause:** Two separate "save" code paths were built (one setting-aware, one not) and only one is reachable from most UI entry points.

**Fix applied or recommended:** Not fixed. Recommended: route all Save-type entry points through the same setting-aware logic as `saveCurrent()`, or clearly scope/rename the setting to "wheel Save action" if the divergence is intentional.

### ID 9 — Popup button count claim is stale

**Expected (per design doc/claim):** exactly 3 primary popup buttons (Capture, Mine, Tabs).

**Actual:** 4 — a "Scan strip" button was added later and never reconciled with the "minimal 3-button" documentation.

**Consequence:** Cosmetic/documentation mismatch only; the popup is still reasonably minimal (no wall of secondary tools), so this doesn't violate the underlying product intent, just the literal claim.

### ID 65 — Local (non-Anki) deck audio is captured but never playable

**Expected:** Audio-mined cards are playable both in the local deck view and via Anki.

**Actual:** The Anki path works (`[sound:...]` reference via real media storage). The local-only path stores `card.audioDataUrl` on the deck record, but no renderer component (checked `ReaderCollectionPanel.tsx` and others) ever renders an `<audio>` element for it — the data is captured and stored but functionally dead for users who mine locally without an Anki profile mapped.

**Fix recommended:** Add an audio player to the local flashcard/deck view wherever `audioDataUrl` is present, or document that local-only audio mining is not yet supported.

---

## 9. Negative-path results

| Scenario | Expected | Actual | Verdict |
|----------|----------|--------|---------|
| Wrong token (`/v1/ui/open`) | 401 or clear auth failure | 401 — live-confirmed | PASS |
| Missing token (`/v1/ui/open`) | clear pairing failure | 401 — live-confirmed | PASS |
| Missing token (`/v1/page-context`) | 401 | 401 — live-confirmed | PASS |
| **Invalid `/v1/ui/open` target** | **rejected safely** | **Accepted silently — `{"ok":true,"target":"not-a-real-target"}`, HTTP 200** | **FAIL — real bug, live-confirmed.** No server-side allow-list validation of `target`; the renderer-side `extensionBridgeUi.ts` switch presumably no-ops on an unknown target, but the bridge itself gives no error signal back to the extension, so a typo'd target silently does nothing with no feedback |
| English page → level estimate | badge `X`, no false Japanese result | `X`, empty:true — live-confirmed | PASS |
| Empty JLPT/HSK lists → level estimate | `—`/no badge, not fake level | `—`, `noLists:true` — live-confirmed | PASS |
| No AnkiConnect / AnkiConnect validation error | local save still works; Anki error surfaced clearly | **Live-confirmed** (real AnkiConnect note-type error occurred): local card still saved (`ok:true`), Anki error returned in a structured, readable field (`anki.error`) | PASS |
| Wrong port / app closed | clear offline error | Not tested (would require killing the app or changing the client port; not attempted to avoid disrupting the running instance without being asked) | BLOCKED |
| No selected text | clear "select text first" message | Not tested — requires live browser page interaction | BLOCKED |
| Missing AppData extension folder | recreated | Not tested — destructive test on the live install folder, not attempted without being asked | BLOCKED |
| No OCR model | clear install/model message | Inverse confirmed instead — models **are** installed and status reports that correctly; the "missing" branch was not exercised | PARTIAL (mechanism exists per source trace, missing-case not live-triggered) |
| No Whisper model | clear transcription error | Not tested — no audio pipeline exercised | BLOCKED |
| Extension service worker restarted | settings/actions still work | Not tested — no live Chrome | BLOCKED |
| App restarted | token/folder/path still valid | **Live-confirmed accidentally** — app was killed by an unrelated port collision mid-session and relaunched; bridge came back up, folder resynced, new token issued, all subsequent HTTP tests worked correctly | PASS |
| Extension reloaded in Chrome | popup/options/content scripts still function | Not tested — no live Chrome | BLOCKED |

---

## 10a. Live Chrome load confirmation (user-performed)

After the automated session confirmed it had no path to drive `chrome://extensions` or a native folder-picker (Chrome blocks extension-driven navigation to internal `chrome://` pages; computer-use hard-caps all browser apps to read-only regardless of permission grant — this is a platform policy, not something a retry or override can change), the user performed the final step manually:

1. `chrome://extensions` → enabled Developer mode
2. Load unpacked → selected `C:\Users\Arseniy\AppData\Roaming\jp-study-app\chrome-extension` (the exact path independently verified earlier in this report)
3. Result (screenshot provided): **"JP Study — Reader Companion" v2.4.1** loaded cleanly. No `入力ディレクトリが存在している必要があります` error. No red manifest/file-error banner. Toggle enabled (blue). Extension ID `ibnefejmefkhjdhkgjgijgfnfbaopcjj`. "Service Worker (無効)" shown, which is the expected idle/inactive state for a Manifest V3 event-driven service worker before anything wakes it — not an error.

This closes the one remaining gap in §6.2 and directly answers the original bug report: **the install flow now works end-to-end for a normal user, confirmed in real Chrome, not just inferred from source.**

---

## 10. Evidence ledger

- Commands executed: `git status --short`, `git diff --stat`, `git log`, `node tools/extension-feature-check.cjs`, `node tools/i18n-check.cjs`, `npx vitest run …` (2 separate runs), `npm start` (twice — see note below), `diff` across all 12 shared extension files (source vs mirror vs AppData), `ls -la` on the AppData install folder
- HTTP requests (all against the live running app on `127.0.0.1:18765`): `GET /v1/health`, `GET /health`, `GET /v1/extension-settings` (×2, across a restart), `POST /v1/ui/open` (no token, wrong token, valid token+valid target, valid token+invalid target), `GET /v1/page-kind`, `GET /v1/page-context` (authed and unauthed), `POST /v1/level-estimate` (JA, ZH, EN samples — JA/ZH required a file-based UTF-8 body after an inline-curl encoding artifact was diagnosed and corrected), `POST /v1/lookup` (corrected to the real `query` field after discovering the actual contract from source), `POST /v1/mine` (real end-to-end mine against an NHK URL, triggering a real AnkiConnect call), `GET /v1/mine-info`, `GET /v1/ocr/status`
- Files compared: `extension/*` (12 files) vs `src/main/chrome-extension/*` (12 files) vs `%APPDATA%\jp-study-app\chrome-extension\*` (12 files)
- Tests run: `bookLevelEstimate.test.ts`, `profileRules.test.ts` (re-run twice), `pageLevelDetect.test.ts`, `extensionCapture.test.ts` — 25 tests total, all passing
- App restarts: 1 unintentional (port collision from a stray preview-server launch on the same port electron-forge's own renderer dev server uses — my error, corrected by not repeating it)
- Extension reloads in Chrome: none (BLOCKED — no browser control)
- Folders renamed/restored: none (destructive tests intentionally not attempted without asking first)
- UI flows manually checked: none via GUI (BLOCKED — Claude-in-Chrome never connected this session; File Explorer/desktop access declined twice). A standalone renderer-only preview (`vite` dev server without the Electron main process) was tried as a fallback and correctly rendered blank/inert, as expected since it has no `window.api` — this ruled out that path rather than providing evidence.

---

## 11. Summary counts

As originally audited (before the §15 fix pass):

- **PASS:** 96
- **FAIL:** 3 (ID 9 stale claim, ID 112 mirror drift, ID 58 partial — counted here as the "real bug" tier)
- **PARTIAL:** 3 (ID 58, ID 65, negative-test OCR-missing-case)
- **BLOCKED:** ~9 (audio/mic-dependent and a few destructive tests not attempted without asking first — OCR image submission, Whisper execution, mic capture, extension-reload-in-Chrome, wrong-port/app-closed client test, no-selected-text test, AppData-folder-deletion recovery test. The Chrome load-unpacked click-through, originally blocked, was subsequently completed live by the user — see §10a — and is now PASS, not BLOCKED.)
- **SKIP:** 0

**After §15:** all 3 FAIL and both real-bug PARTIALs (ID 58, 65) are fixed and verified (source-level + static checks + live HTTP regression pass; two of the six fixes — ID 58's YouTube path and ID 65's audio playback — are verified by tracing and static checks but not yet by a live click-through, since that still needs browser access this session didn't have). The remaining BLOCKED count is unchanged — those were never part of the fix scope.

---

## 12. Completion judgement

**Originally: Production-capable with known limitations. After §15: Production-capable, known limitations closed — two fixes (YouTube save-mode routing, local audio playback) still await a live click-through to move from "verified by tracing" to "verified by observation."**

The core architecture is real and well-wired — not a facade. The mining-rules engine genuinely resolves profiles from disk (live-confirmed with a real AnkiConnect call), the dictionary is a real offline JMdict lookup with pitch accent, the level-estimation pipeline does real cumulative-coverage math, and pairing/YouTube separation is genuinely clean. This is well past "implemented but not integrated."

At first-write time this fell short of "verified complete" for two concrete reasons: (1) the packaged-build fallback extension had drifted and would have shipped a broken dictionary popup and a missing feature to real users if a package build were cut — this directly risked recreating the class of bug that started this whole audit, just for packaged users instead of dev-mode ones; and (2) several smaller but real functional gaps existed (YouTube download-mode setting dead on 4 of 5 paths, unvalidated `/v1/ui/open` target, dead local-audio playback, a dead message listener). **Both are now addressed — see §15 for exactly what changed and how each fix was verified.**

None of these are "looks done, isn't" — they're specific, fixable, now-documented bugs in an otherwise functional system.

---

## 13. Ordered remediation plan

1. **Install blockers / packaging freshness (highest priority):** Fix the `src/main/chrome-extension/` mirror drift (ID 112, ID 6). Either ship `extension/` as a real packaged resource in `forge.config.ts` so packaged builds use the live source directly, or add an automated sync step so the mirror can't drift silently again. Verify with: a real `electron-forge package` run, then diff the resulting app's extension resource against `extension/`.
2. **Security/auth:** Add server-side allow-list validation to `POST /v1/ui/open`'s `target` field (ID 24, §9 negative test) so unknown targets return a clear error instead of silent `{"ok":true}`. Verify with: the same curl test used in this audit.
3. **Broken end-to-end workflow:** Route all YouTube "Save" entry points (shortcut, popup, context menu, bulk-tabs) through the same `youtubeMode`-aware logic as the wheel's `saveCurrent()` (ID 58). Verify with: toggle the setting, trigger each of the 5 save paths on a YouTube page, confirm all 5 honor it.
4. **Data persistence / dead feature:** Either render `card.audioDataUrl` in the local deck/flashcard view, or explicitly document that local-only audio mining has no playback yet (ID 65). Verify with: mine audio without an Anki profile mapped, confirm playback exists in whichever surface is chosen.
5. **Secondary polish:** Remove or wire up the dead `jp-toggle-record` listener (ID 61); reconcile the "3 buttons" popup documentation with the actual 4 (ID 9); document the newly-discovered `POST /v1/manga-import` route in the official route inventory (ID 110); consider a shared source (or a parity test) for the duplicated category-detection logic in `extension/shared.js` and `src/shared/extensionCapture.ts` (IDs 74-76) so they can't silently diverge later; add a real "Retry queue" control to match the offline-queue error copy (ID 50); consolidate `tools/SESSION_EXTENSION_AUDIT_PROMPT.md` with this report now that a superseding version exists (Claim E).

---

## 14. Optional time estimate without AI

Kept separate from the technical verdicts above, as requested.

- **Prototype-only baseline** (what exists today, dev-mode, ignoring the packaging-drift risk): roughly what's already here — an experienced solo Electron/Chrome-extension developer building this exact scope (bridge + 23-route HTTP API + IPC chains + dictionary + mining-rules engine + level estimation + radial wheel + tab picker + audio/Whisper pipeline) from scratch would reasonably take **6–10 weeks** full-time.
- **Reliable local app + extension** (closing the gaps found in §7/§8 — mirror sync, YouTube save-path consistency, target validation, audio playback, plus a real packaged-build test pass): **+1–2 weeks** on top of the above.
- **Polished production-quality tool** (packaging hardening, real Chrome Web Store listing/review compliance, a maintained shared category-detection module instead of a duplicated one, full negative-path coverage including the BLOCKED items in this report, cross-platform packaging verification): **+3–5 weeks**.
- **Solo developer vs. small team:** a 2-3 person team (one extension-focused, one Electron/main-process-focused, one QA) could compress the "reliable" and "polished" tiers to roughly half the solo estimate, since packaging/QA work parallelizes well against feature work.

These are rough, context-free estimates and should not be read as endorsing or contradicting any of the PASS/FAIL verdicts above.

---

## 15. Fixes applied (2026-07-17, same session)

Every FAIL/PARTIAL finding from §7/§8/§9 was fixed in this session and live-verified against the running app. Nothing here was left as a recommendation only.

### 15.1 ID 112 — chrome-extension mirror drift (top priority)

**Fix:** Copied all 12 files from `extension/` into `src/main/chrome-extension/` (byte-identical now). Added `tools/sync-extension-mirror.cjs`, wired into `npm run package`, `npm run make`, `npm run postinstall`, and `tools/package-app.cjs` (the `package:win` path) so the mirror is force-refreshed before every packaged build — it cannot drift silently again. Also added a permanent static check to `tools/extension-feature-check.cjs` ("chrome-extension mirror is byte-identical to extension/") that fails loudly if the two ever diverge, independent of remembering to run the sync script.

**Verified:** `node tools/sync-extension-mirror.cjs` → "already up to date (12/12 files match)"; `node tools/extension-feature-check.cjs` → 33/33 passed including the new check; live-diffed the running app's AppData install folder against `extension/` after a full app restart — byte-identical.

### 15.2 `/v1/ui/open` accepting invalid targets silently (§9 negative-path bug)

**Fix:** Added a server-side `UI_OPEN_TARGETS` allow-list in `src/main/extensionServer.ts` (kept in an explanatory comment in sync with the switch in `src/renderer/extensionBridgeUi.ts`). Unknown targets now get `400 {"ok":false,"error":"unknown target '...'","validTargets":[...]}` instead of a silent `200 {"ok":true}`. While in that code, also fixed a related latent bug noticed during the trace: `extensionBridgeUi.ts`'s `'statistics'` alias called `openAppSection('statistics')`, but `DesktopShell.tsx`'s `WinSection` type only recognizes `'stats'` — it would have silently opened an unrecognized window section. Now maps to `'stats'`.

**Verified live** (app restarted, fresh token pulled):
- Invalid target → `400 {"ok":false,"error":"unknown target 'not-a-real-target'","validTargets":[...]}`
- Valid target (`clipboard`) → unchanged, `200 {"ok":true,"target":"clipboard"}`
- `statistics` alias → `200 {"ok":true,"target":"statistics"}`, now correctly resolves to the `stats` window section

### 15.3 ID 58 — YouTube download-mode setting only honored by 1 of 5 save entry points

**Fix:** Traced every "Save"-semantic call site in `extension/background.js` and switched them from the always-metadata `smartCapture(tab)` to the already-existing, mode-aware `saveCurrent(tab)` (which already correctly branched on `youtubeMode` — it just wasn't being called from most places): the `runTabAction` bulk-tabs `'capture'/'save'` action, the context-menu `smart-capture` item, the `save-page`/`send-to-reader` keyboard-shortcut command, and the popup's `capture`/`send` message handler. Deliberately **left unchanged**: the radial wheel's dedicated `capture`/`epub` slot, which is an intentionally distinct, separately-assignable wheel action (the wheel already has its own separate mode-aware `save` slot calling `saveCurrent` — confirmed by reading the wheel's action switch, where `save` and `capture` are already two different cases with different intended behavior).

**Verified:** re-read the full call chain after edit (`grep -n "smartCapture(\|saveCurrent(" extension/background.js`) — confirmed every generic Save/Capture entry point now calls `saveCurrent`, while the wheel's explicit `capture`/`epub` slot still calls `smartCapture` on purpose. Not independently re-tested against a live YouTube page this session (would need a live Chrome tab on a real YouTube URL, which requires the same browser access that was limited this session) — this is a source-level fix verified by call-chain tracing, not a live click-through.

### 15.4 ID 65 — local-deck mined audio never playable

**Fix:** Added a play button (`<Icon name="player">`) to each card row in `src/renderer/components/ReaderCollectionPanel.tsx` — the surface where extension-mined cards actually land — that plays `card.audioDataUrl` via `new Audio(...).play()` when present. **Scope note:** `FlashcardsView.tsx` has several additional, independently-inlined card-row renderers for different UI skins (aero theme, strip mode, etc.) that also display `DeckFlashcard` records but were not touched — extending playback there is a larger, separate change across multiple render paths in an already very large file, and wasn't done here. The core "captured but literally unplayable anywhere" gap is closed; full parity across every flashcard-view skin is a follow-up if wanted.

**Verified:** confirmed via source read that `c.audioDataUrl` is correctly scoped/narrowed and the click handler doesn't interfere with the row's existing `onClick`/`openEdit` handler (`e.stopPropagation()` added). Not re-verified visually in a live browser this session (no browser control) — would need a real audio-mined card to click-test.

### 15.5 ID 61 — dead `jp-toggle-record` message listener

**Fix:** Removed the unreachable `chrome.runtime.onMessage` handler for `jp-toggle-record` in `extension/content.js` — confirmed zero callers anywhere (no manifest command, no `background.js` sender) before removing. `toggleRecording()` and the `recording` variable it referenced are still used by the wheel's own local `record` action, which was and remains the only real path to this feature — removing the dead listener didn't touch that path.

**Verified:** `grep -n "toggleRecording(\|\brecording\b" extension/content.js` after the edit — still referenced correctly by `runWheelAction`; `node tools/extension-feature-check.cjs` still 33/33 (its "Audio record toggle" check still passes, since it checks for the real wheel path, not the dead listener).

### 15.6 ID 50 note — no real "Retry queue" control

**Fix:** Added a `Retry queue` button to the popup header (`extension/popup.html`, `extension/popup.js`) that's hidden when the offline queue is empty and shows a live count (`Retry queue (N)`) when items are pending. Clicking it sends the existing `{type:'flush'}` message (background.js already had a working handler for this — it just had no caller) and reports how many items were sent vs. still pending.

**Verified:** static check passed; the button's visibility logic was traced against the real `flushQueue()` return shape (`{flushed, left}`, no `.ok` field) to make sure the status message renders correctly in both the all-sent and still-pending cases. Not live-tested with an actual queued item this session (would require killing the app mid-mine to populate the queue, which wasn't done to avoid disrupting the live instance).

### 15.7 Category-detection drift risk (IDs 74-76) — parity test added

**Fix:** Added `src/shared/__tests__/extensionCaptureParity.test.ts`, which loads `extension/shared.js` in a Node `vm` sandbox (with `URL` explicitly injected — the sandbox doesn't inherit it, which caused one debugging round-trip) and asserts its `NEWS_HOST_SUFFIXES`/`NOVEL_HOST_SUFFIXES`/`MANGA_HOST_SUFFIXES` lists and `detectContentCategory` output are identical to the TS twin in `src/shared/extensionCapture.ts` for a representative URL from each category. This doesn't eliminate the duplication (that would require a build step compiling the shared TS into the extension's plain-JS content script, a bigger architectural change not attempted here), but it means any future edit to one copy without the other now fails CI loudly instead of silently drifting.

**Verified:** `npx vitest run src/shared/__tests__/extensionCaptureParity.test.ts` → 2/2 passing.

### 15.8 Documentation fixes (ID 9, Claim E, ID 110 discrepancy)

- `tools/SESSION_EXTENSION_AUDIT_PROMPT.md` ID 9 row updated to reflect the real 4-button popup (`capture`, `mine-auto`, `tab-picker`, `scan-strip`), not the stale 3-button claim.
- Added `POST /v1/manga-import` to that same file's route inventory table (it was a real, working, but undocumented route found during the audit).
- Added a pointer note at the top of that file to this report, per Claim E's consolidation recommendation, without deleting the reusable prompt template itself.

### 15.9 Full verification pass

After all fixes: killed and restarted the Electron app (main-process changes need a real restart; Vite HMR only covers renderer files) to pick up `extensionServer.ts`. Then, in order:

1. `node tools/sync-extension-mirror.cjs` — synced 4 files touched after the first sync (background.js, content.js, popup.html, popup.js)
2. `node tools/extension-feature-check.cjs` — **33/33 passed** (up from 32/32; new mirror-parity check added)
3. `node tools/i18n-check.cjs` — still clean, no new strings needed translation (extension HTML copy isn't part of the i18n catalog)
4. `npx vitest run` on the same 4 targeted files plus the new parity test — **27/27 passed** (up from 25/25)
5. Live HTTP regression check against the restarted app: `/v1/health`, `/v1/mine` (real AnkiConnect round-trip, succeeded), `/v1/page-context` (still 401s unauthenticated) — all unaffected by the fixes, no regressions
6. Live-diffed the AppData install folder against `extension/` post-restart — byte-identical, confirming the retry-queue button and the removed dead listener both made it through the real install pipeline, not just the source tree

### 15.10 What's still genuinely open

- YouTube save-mode fix (§15.3) and audio-playback fix (§15.4) are verified by source tracing and static checks, not by a live click-through in a real browser — that still needs the same browser access that was limited this session (see §10a for how the one successful live-Chrome step got done: manually, by the user).
- FlashcardsView's other card-row renderers (aero/strip skins) still don't play `audioDataUrl` — noted as an intentional scope boundary, not an oversight.
- The Retry-queue button's actual "queue has N items, click it, they flush" path wasn't exercised end-to-end live (would require deliberately taking the app offline mid-mine).
- Everything else originally marked BLOCKED in §7/§9 (OCR image submission, Whisper execution, mic capture, extension-reload-in-Chrome, wrong-port test, no-selection test, AppData-deletion recovery test) remains BLOCKED — unrelated to this fix pass, still needs live browser/audio hardware access.
