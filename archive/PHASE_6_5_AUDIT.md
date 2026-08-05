# Phase 6.5 Audit — Repository State, Feature Inventory, v1.01 Verification, Secrets

Date: 2026-07-17. Scope: Phase 1 (repository state), Phase 2 (feature inventory), Phase
3 (v1.01 / post-v1.01 audit), Phase 4 (secrets/credentials). Phases 5–16 and 18–20 of
the full Phase 6.5 program are **not** covered by this pass — see
[`PHASE_6_5_IMPLEMENTATION_PLAN.md`](./PHASE_6_5_IMPLEMENTATION_PLAN.md) for the Phase
17 (safe-junk-removal) planning output that accompanies this audit.

**Naming note:** this document is unrelated to `docs/IMPLEMENTATION_PLAN_V1.01.md`'s own
internal "Phase 6.5 — Stabilization pass 1" entry (line 429 of that file), and also
unrelated to the Frutiger Aero `PHASE_1`…`PHASE_5` docs at the repo root and under
`docs/frutiger-aero/`. The repo has (at least) three independent "Phase N" numbering
schemes; this document is the *fourth*, scoped specifically to the cleanup/audit program
described in this session's brief. No cross-references between the schemes should be
assumed.

**Methodology:** every claim below with a `file:line` citation was read directly from
the working tree on 2026-07-17, not inferred from documentation or carried over
uncritically from an earlier pass. Where only a project document's own claim is the
evidence (e.g. a `DONE` marker), that is stated explicitly rather than presented as
independently verified.

---

## §1 Architecture map

Six distinct window surfaces are created in `src/main.ts`, all loading the **same**
renderer bundle (`src/renderer/main.tsx` → `src/renderer/App.tsx`), differentiated by a
query string, and all sharing **one** preload script (`src/preload.ts`):

| Window | Constructor | webviewTag |
|---|---|---|
| Main desktop window | `createWindow()`, `src/main.ts:373-422` | `true` (`:392`) |
| Blanc Toolbox | `createBlancWindow()`, `src/main.ts:474-531` | `true` (`:511`) |
| Mini Widget | `createMiniWidgetWindow()`, `src/main.ts:607-674` | `true` (`:647`) |
| Lockscreen | `createLockscreenWindow()`, `src/main.ts:741-815` | `true` (`:781`) |
| Pop-out app window | `createPopoutWindow()`, `src/main.ts:899-946` | `true` (`:918`) |
| Companion Host (transparent overlay) | `src/main/companionHost.ts:92-129` | `false` (`:112`) |

Entry points: main process `src/main.ts`; preload `src/preload.ts`; renderer HTML
`index.html` (repo root, 12 lines, no `<meta>` CSP tag — verified by direct read);
renderer bootstrap `src/renderer/main.tsx`.

Build system: Electron Forge + `@electron-forge/plugin-vite` (`forge.config.ts`), three
Vite configs (`vite.main.config.ts`, `vite.preload.config.ts`,
`vite.renderer.config.ts`). No electron-builder.

---

## §2 Repository state caveat

- **HEAD**: `85ed59343d89535b82e4daac8ff2f6e6d9f61d0f` — "Merge feat/frutiger-aero-platform
  into main after workbranch consolidation." Branch `main`, remote `origin` →
  `https://github.com/vasars2024-hub/jp-study-app.git`.
- **Working tree, measured directly on the Windows checkout** via
  `git status --porcelain` (2026-07-17): **147 modified tracked files** (`M`) + **173
  untracked files/directories** (`??`) = 320 porcelain entries. Config at measurement
  time: `core.autocrlf=true`, `core.filemode=false`.
- This figure supersedes two earlier informal estimates surfaced during planning for
  this audit (an approximate "~140" from an initial survey, and a claim of "421 modified
  on a Linux mount, attributed to CRLF normalization noise, with a true content-change
  estimate of ~40"). The 147/173 split above is the direct, on-machine, reproducible
  measurement and is what this audit treats as ground truth. The CRLF explanation for
  the discrepancy between environments was **not independently confirmed** in this pass
  — it's plausible (autocrlf is on) but no diff was actually inspected to verify it, so
  it is not asserted as fact here. Any session measuring this figure from a different
  machine or mount should expect a different number and should re-run
  `git status --porcelain` itself rather than trusting a cached figure.
- Untracked files include **entire subsystems**, not just stray files:
  `src/main/aiProviderClient.ts`, `buddyScheduler.ts`, `extensionServer.ts`,
  `jiten.ts`, `mangaOcr.ts`, `readingFetch.ts`, `resourcesCatalog.ts`, `stats.ts`,
  `translateAnalysis.ts`, `windowChrome.ts`, `ytPlaylists.ts`; the entire `extension/`
  (Chrome extension) and `cloudflare-worker/` directories; `catalog-repo/`.
- **Consequence for every finding in this document**: this audit describes *current
  on-disk state*, not `git show HEAD`. A large fraction of the feature areas in §5–§7
  (extension bridge, local-LLM translate, AI mining providers, jiten, buddy scheduler,
  manga OCR, resources catalog, stats/telemetry) exist only as uncommitted work. Any
  future session diffing against `HEAD` alone will miss most of what's described here.

---

## §3 Security boundary summary

Electron defaults hold across all six windows — none of the six window constructors
override `contextIsolation`, `nodeIntegration`, `sandbox`, or `webSecurity`, so Electron
`^42.3.0`'s secure defaults apply everywhere (`contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`, `webSecurity: true`).

The preload bridge (`src/preload.ts`) has exactly **one**
`contextBridge.exposeInMainWorld('api', api)` call (`src/preload.ts:964` — confirmed
this is the only `contextBridge` usage in the repo), exposing roughly 150 methods, each
a named, typed wrapper around one specific `ipcRenderer.invoke`/`.send`/`.on` channel —
not a generic passthrough. No raw `fs`, `child_process`, `require`, or arbitrary
`ipcRenderer.invoke(channel, ...args)` primitive is exposed.

### Findings

**High (chained, not independently exploitable) — no CSP + `bypassCSP` + widespread `webviewTag`.**
**[FIXED 2026-07-17, Batch A — see `PHASE_6_5_CLEANUP_LOG.md`]** A CSP is now injected
for the packaged app's own origin, and `webviewTag` was removed from the 3 windows that
never need it (Blanc/Mini/Lockscreen). Not yet verified against a live packaged build —
see the cleanup log's "not yet verified" section. Original finding preserved below for
context.
`index.html` has no `<meta http-equiv="Content-Security-Policy">` (confirmed — file is
12 lines total, no CSP tag), and no `session.defaultSession.webRequest.onHeadersReceived`
CSP injection exists anywhere in `src/` (grepped, zero matches). Combined with
`bypassCSP: true` on all 4 custom protocol schemes (`app`, `media`, `playfile`,
`localfile` — `protocol.registerSchemesAsPrivileged`, `src/main.ts:78-103`) and
`webviewTag: true` on 5 of 6 windows (table in §1), the trust boundary between "renderer
gets compromised via some future injection bug" and "attacker has webview + protocol
capabilities" is thinner than ideal. The `<webview>` tag is used legitimately by the
Immersion Browser feature (`src/renderer/views/ImmersionView.tsx:52-55`, loads
arbitrary user-chosen news/reading sites), so this isn't a defect to "fix" by ripping
out webviews — the correct future remediation (Phase 5, out of scope this pass) is
adding a CSP and considering whether all 5 windows actually need `webviewTag`.

**High (chained, not standalone) — `desktop:launch` executes arbitrary local files.**
**[HARDENED 2026-07-17, Batch A]** Now rejects null bytes, non-absolute paths, and
non-normalized paths before use — see cleanup log. The feature itself (launching
user-picked shortcuts) is unchanged; this narrows what a compromised renderer could
send. Not yet click-tested against the real desktop-shortcut grid (Batch C).
`src/main/library.ts:880-889` (pre-fix version shown below for context):
```
ipcMain.handle('desktop:launch', async (_e, target: string) => {
  if (typeof target !== 'string' || !target) return 'Invalid target.';
  if (/^https?:\/\//i.test(target)) { await shell.openExternal(target); return null; }
  if (!fs.existsSync(target)) return 'That file no longer exists.';
  const err = await shell.openPath(target);
  return err || null;
});
```
`shell.openPath()` launches the target with its OS-registered default handler — for an
`.exe`/`.bat`/`.lnk` target, that's execution. **This is the desktop-shortcut feature's
actual, intended purpose** (the app has a desktop-shortcut grid), not a bug — it's
flagged High only as the second link in a chain: a renderer compromise (enabled by the
CSP gap above) could call `window.api` methods including this one to launch arbitrary
local programs. The correct mitigation path is CSP plus optionally scoping accepted
paths to a whitelist directory (e.g. only shortcuts the user explicitly created via the
picker), not removing the handler — removing it would break the desktop-shortcut
feature that CLAUDE.md protects.

**Low (downgraded from an earlier draft's Medium) — automation-builder launcher.**
`toolbox:launchAutomationBuilder` (`src/main.ts:174-205`) spawns
`powershell.exe -ExecutionPolicy Bypass -File <scriptPath>`, but `scriptPath` is
resolved from exactly two fixed candidates —
`path.join(app.getAppPath(), 'automation-builder.ps1')` and
`path.join(process.cwd(), 'automation-builder.ps1')` — verified directly at
`src/main.ts:176-182`; the renderer supplies no arguments and cannot influence which
script runs or with what parameters. `TOOLBOX_COMPLETION_AUDIT.md` independently
confirms "fixed allowlisted script path only — no arbitrary shell." What remains is a
**Low portability defect**: `AUTOMATION_BUILDER_DIRECT_COMMAND`
(`src/shared/automationBuilder.ts:7-8`) hardcodes
`C:\Users\Arseniy\Projects\jp-study-app\automation-builder.ps1` as a source constant —
confirmed by direct read. This is a machine-specific string baked into shared code, not
a security hole; it will just be wrong/unused on any other machine or install path.

**Medium — `toolbox:fileSearch` accepts an arbitrary renderer-supplied root.**
**[FIXED 2026-07-17, Batch A]** `toolbox:fileSearch` now rejects any root that wasn't
just returned by `toolbox:pickSearchFolder` (or a subdirectory of one) — see cleanup
log. Not yet click-tested against the Blanc file-search panel (Batch C).
`src/shared/toolboxFileSearch.ts:38-49`
(`sanitizeToolboxFileSearchRequest`) coerces `root: String(input.root ?? '')` with no
whitelist check against the folder the picker actually returned — confirmed by direct
read, line 43 exactly. Real mitigations exist and are worth recording alongside the
finding rather than treating it as unmitigated: per `TOOLBOX_COMPLETION_AUDIT.md`, the
main-process handler never follows symlinks, caps scanned/result counts, and reports an
honest `truncated` flag; it is read-only (stat/readdir), never writes. Net effect: the
renderer can enumerate (not modify) any directory it can name on the local filesystem.

**Medium — plaintext credential storage.**
**[FIXED 2026-07-17, Batch A]** Both files below now use `safeStorage` encryption at
rest, with migration from the old plaintext format — see cleanup log. Not yet
confirmed live that `safeStorage.isEncryptionAvailable()` is true on this machine.
AI provider API keys were stored unencrypted in
`<userData>/mining/api-keys.json` (`readApiKeyStore`/`writeApiKeyStore`,
`src/main/mining.ts:90-113`, confirmed by direct read) and a legacy mirror
`gemini-api-key.txt`. The Chrome-extension pairing token is likewise stored in
plaintext at `<userData>/extension-bridge.json`. Neither uses Electron's `safeStorage`
or an OS keychain. This is a local-machine-only risk (an attacker already needs
filesystem access to the user's profile to read either file) consistent with this
app's "no payment, minimal outbound data" framing, but it's a high-value, low-effort
hardening item for a future Phase 5 pass. The renderer never receives the raw key back
— `src/preload.ts:764-785` only exposes a setter and a boolean `apiKeySet`/`apiKeysSet`
read-back, confirmed by direct read of the preload bridge contract.

**Informational — no asar, fuses adjusted accordingly.**
`asar: false` (`forge.config.ts:40`) is a deliberate, documented tradeoff — the app
ships ~945 MB of bundled models/dictionaries, and packing that into an asar archive was
found to choke the packager (comment in `forge.config.ts:36-39`). Consequently
`EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` are explicitly
disabled (`forge.config.ts:97-100`, confirmed by direct read) — there is no
code-integrity check on the shipped JS/HTML on disk. Not a defect given the tradeoff,
but worth recording: anyone with write access to the install directory can modify app
code before it loads, with no fuse-level protection against it.

**Note, not a vulnerability — nested `.git` at `src/main/city/.git`.**
The Noctis city-simulation engine directory contains its own `.git` folder, not wired
up as a proper git submodule in the parent repo. Per explicit direction for this pass,
this is recorded as a finding only — no further investigation or action taken. Risk if
ever revisited: files under `src/main/city/` may not behave as expected under the
parent repo's tooling (a `git add src/main/city/foo.ts` from the parent repo can silently
no-op or behave unexpectedly depending on git version/config, since git treats a nested
`.git` directory as an embedded repository boundary).

**Completeness caveat.** This section is a **spot-check**, not an exhaustive
handler-by-handler review of the ~150 preload-exposed methods. One additional
unreviewed surface noted in passing: `net:extractReadableArticle`
(`src/main/library.ts:894`) fetches an arbitrary renderer-supplied URL in the main
process (no CORS restriction, by design, since it's server-side). Reasonable for a
local single-user app with no auth boundary to defend, but a full IPC sweep of every
exposed channel is Phase 5 work and should not be considered done because of this
audit.

---

## §4 Persistence map

**No SQLite/electron-store as an app datastore.** `sql.js` appears in dependencies but
is used only to parse Anki `.apkg` files during import (in-memory, not persisted app
state) — `src/shared/apkgParse.ts`, `src/main/anki/apkgImport.ts`.

**Main-process persistence — flat JSON files under `app.getPath('userData')`, one file
per module:**

| File | Module | Contents |
|---|---|---|
| `library.json`, `config.json`, `library/` | `src/main/library.ts` | Library items, watch-folder config, wallpapers |
| `media.json`, `covers/`, `media-cache/`, `downloads/`, `wallpapers/` | `src/main/media.ts` | Media library, cached conversions |
| `profiles.json` | `src/main/profiles.ts` | Multi-language study profiles |
| `anki-intervals.json` | `src/main/anki/intervals.ts` | Cached Anki SRS snapshot |
| `yt-playlists.json`, `transcripts/`, `subs-cache/` | `src/main/ytPlaylists.ts` | YouTube immersion playlists |
| `jiten.json` | `src/main/jiten.ts` | Jiten novel/deck catalogue + mining plan |
| `window-chrome.json` | `src/main/windowChrome.ts` | Window frame mode preference |
| `mining/gloss-cache.json` | `src/main/dictionary.ts` | Dictionary gloss cache |
| `mining/translation-analysis-cache.json` | `src/main/translateAnalysis.ts` | Cloud-LLM linguistic-analysis cache |
| `mining/translation-cache.json` | `src/main/translate.ts` | Offline (Qwen3) translation cache |
| `mining/config.json`, `mining/api-keys.json` (+legacy `gemini-api-key.txt`) | `src/main/mining.ts` | EPUB mining config, AI provider keys (plaintext — §3/§8) |
| `immersion/sites.json`, `sessions.json`, `metrics.json` | `src/main/immersion/index.ts` | Immersion Browser sites/sessions/metrics |
| `extension-bridge.json` | `src/main/extensionServer.ts` | Chrome-extension pairing token (plaintext) |
| `models/state.json`, `models/registry.json`, `models/*.gguf` | `src/main/downloads.ts`, `src/main/translate.ts` | Downloaded-asset state + local LLM weights |
| `desktop-layout.json` | `src/main/desktop.ts` | Dual-desktop / widget layout |
| `resources-catalog.json`, `novels-catalog.json` | `src/main/resourcesCatalog.ts` | Cached remote catalogues |
| `download-stats.json` | `src/main/stats.ts` | Anonymous download heat-map telemetry |
| `collected-tools.json` | `src/main/collectedTools.ts` | Tools saved from Immersion Browser |
| `noctis-state.json` | `src/main/city/service/persistence.ts` | Noctis civilization-module state |
| `yomitan/registry.json`, `yomitan/<id>/index.json` | `src/main/dictionary/yomitan.ts` | Offline Yomitan dictionary packages |
| `tatoeba/index.json` | `src/main/dictionary/tatoebaOffline.ts` | Offline example-sentence index |
| `blanc-window.json` | `src/main.ts:446-463` | Blanc Toolbox window bounds |

**Renderer-side persistence** — two mechanisms by design (per the comment header in
`src/renderer/storage/db.ts`): **`localStorage`** for small synchronous UI/settings
state (theme, pane sizes, toolbox settings key
`jp-study.toolbox.settings.v1`, telemetry consent keys), and a hand-rolled
**IndexedDB** wrapper (`DB_NAME = 'jp-study-db'`, single `kv` object store) for larger
data (flashcard decks, CSV drafts, presets) that would exceed `localStorage`'s quota,
with corruption-recovery logic that deletes and recreates the DB on Chromium
`UnknownError`/`InvalidStateError`.

No renderer code reads/writes the main-process JSON stores directly — everything
crosses via IPC. A `NOTE` comment at `src/main.ts:988-995` explicitly documents that a
prior "sync renderer storage with profiles.json" step was deliberately removed because
it was wiping IndexedDB decks on restart — a real historical incident worth remembering
before anyone re-adds a similar sync step.

---

## §5 Feature inventory matrix

Status vocabulary (per spec): `Verified working` / `Working with defects` /
`Partially implemented` / `UI-only` / `Backend-only` / `Disconnected` /
`Duplicate implementation` / `Placeholder or mock` / `Obsolete` / `Missing` /
`Unable to verify`.

**Honesty note on "Verified working":** this pass verified code paths, tests, and
static wiring by direct reading — it did **not** launch the packaged or dev Electron
app and click through these flows (that's Phase 12/20 territory, out of scope here).
"Verified working" below means *the implementation is real, wired end-to-end in code,
and has automated test or self-audit evidence* — not that a human clicked through it
this session. Where that distinction matters, the row says so.

| Feature | Intended behavior | Entry point | Main impl | Renderer impl | Persistence | Security boundary | Tests | Current status | Required action |
|---|---|---|---|---|---|---|---|---|---|
| Reader / EPUB | Import, view, navigate EPUB/manga/PDF; track progress | `views/BookReader.tsx`, `NovelReader.tsx`, `MangaReader.tsx` | `src/main/library.ts` | `epubLoader.ts`, `pdfLoader.ts`, `annotations.ts`, `bookmarks.ts` | `library.json` | IPC-scoped file import | Present (de-inflection unit tests) | **Verified working** 2026-07-17 (Batch C): opened a real EPUB from the Library, correctly resumed at its saved 67%/chapter-7-of-10 position, Prev/Next/bookmark/font-size/highlight-color controls all present. Still has the known i18n gap in `DictionaryResults.tsx` per TASKS.md | i18n follow-up tracked in project docs |
| Manga + OCR | On-image OCR overlay for manga | `MangaOcrOverlay.tsx`, `MangaHandwritingPopup.tsx` | `src/main/mangaOcr.ts` (untracked) | `mangaBubbleFill.ts` | n/a (in-memory) | onnxruntime-node, in-process | Unable to verify (no test file found for this module) | **Working with defects** — verified live 2026-07-17 (Batch C) with a real manga page (user-supplied): import-as-manga and the reader itself work correctly (real page render, page count, zoom). The "Scan" OCR trigger correctly detects the real Manga OCR model isn't installed and offers a proper "Download Manga OCR (530 MB)" button (graceful-degrade contract honored, matches spec). But the **active Tesseract fallback path produces unusable output** — extracted "text" was incoherent garbled strings, not valid Japanese, on real manga dialogue — and logged 8 repeated DevTools warnings ("Parameter not found: segsearch_mode", "language_model_ngram_space_delimited_language", etc.) on every scan | Either fix the Tesseract fallback's parameter warnings and quality, or don't offer it as a usable fallback until the real model is installed (currently it silently produces garbage rather than clearly saying "install the model for usable results") |
| Dictionary / lookup | Word/sentence lookup, offline Yomitan + Tatoeba | `DictionaryPopup.tsx`, `DictionaryResults.tsx` | `src/main/dictionary.ts`, `dictionary/yomitan.ts`, `dictionary/tatoebaOffline.ts` | `wordLookup.ts` | `yomitan/`, `tatoeba/index.json` | IPC-scoped | Present | **Verified working** 2026-07-17 (Batch C): clicked a word in a real EPUB, got a real popup with pitch accent, multi-language glosses (English AND Russian JMdict entries), and a working "+ Add to Anki" button (confirmed → "Added ✓"). Still working with defects: English-hardcoded UI strings per TASKS.md | i18n follow-up |
| Flashcards + Anki | Card creation, deck management, `.apkg` import, AnkiConnect-style sync | `AnkiView.tsx`, `FlashcardsView.tsx` | `src/main/anki/*` (apkgImport, client, fieldMapper, heartbeat, intervals) | `flashcardDeck.ts`, `ankiSync.ts` | IndexedDB decks, `anki-intervals.json` | IPC-scoped | Present | **Verified working** 2026-07-17 (Batch C): "Add to Anki" from the Dictionary popup confirmed working end-to-end, real client not mocked | None this pass |
| Study statistics | Real activity-derived stats (sessions, streaks, vocab counts) | `views/StatisticsView.tsx` | `src/main/stats.ts` (untracked) | `renderer/stats.ts` | localStorage/IndexedDB | IPC-scoped | Unable to verify | **Verified working** 2026-07-17 (Batch C): real, non-zero data (2,993 Known / 2,326 Familiar / 36,215 Learning / 41,534 Tracked Total word-knowledge counts, 1-day streak, "40s Read Today"). Minor observation, not confirmed as a bug: "Characters Today" showed 0 immediately after an active reading session — plausibly a debounce/threshold before the counter flushes, not reproduced/isolated carefully enough to file as a defect | Duplicate-event/restart-inflation trace and the "Characters Today" observation both remain open |
| Calendar | CRUD events, recurrence, reminders | `views/CalendarView.tsx` | n/a (client-side) | `calendar.ts` | localStorage/IndexedDB (same pattern app-wide) | n/a | Unable to verify | **Verified working** 2026-07-17 (Batch C): full CRUD cycle completed live — created a real event via "+ New event", confirmed it rendered on the correct day, reopened it via the Edit dialog (title/date/time/category/color/reminder/repeat all correctly pre-filled), deleted it via the Delete button, confirmed the day was clean again | Documented known limitation stands: Week/Day views are agenda lists, not an hour grid; no OS toast reminders yet |
| Clipboard capture | Optional monitored clipboard history, promote to flashcards | `ClipboardHistoryPanel.tsx` | `clipboard:readText` IPC (`systemMetrics.ts`) | `clipboardHistory.ts` | localStorage | Gated by user setting | Unable to verify | **Verified working** 2026-07-17 (Batch C): opened the real panel — populated with genuine historical entries (not placeholders), category tabs (All/Words/Sentences/Dictionary/Reader/Manual Copy), search box, and per-entry Copy/Plain/Pin/Fav/Flashcard/Delete actions all present. Did not modify or delete any of the user's real clipboard history while verifying | Confirm retention limits / sensitive-content exclusions in a later pass |
| Automation / scripting | Launch external PowerShell automation tool | Toolbox launcher UI | `toolbox:launchAutomationBuilder`, `src/main.ts:174-205` | `shared/automationBuilder.ts` | n/a | Fixed allowlisted script path only (verified §3) | Rated `experimental` by app's own audit | Working with defects (by the app's own honest self-rating) | Low-priority: fix hardcoded absolute path in `AUTOMATION_BUILDER_DIRECT_COMMAND` |
| Blanc Toolbox | 51-module side-window utility suite | `components/blanc/BlancShell.tsx` | `registerToolboxIpc`/`registerBlancIpc`, `src/main.ts` | `shared/toolboxRegistry.ts` + 51 modules | `blanc-window.json`, `jp-study.toolbox.settings.v1` (localStorage) | Narrow, module-scoped | 487/487 vitest passing per `TOOLBOX_COMPLETION_AUDIT.md` (2026-07-17) | Verified working (20 modules `ready`), Partially implemented (1 `experimental`), Missing by design (30 `adapter-needed`, correctly hidden) | See §6a — none required this pass |
| Frutiger Aero | Hidden alt-OS theme, `data-materials="aero"` | `theme/SecretAeroTrigger.tsx` | n/a (client-side theme) | Full desktop-shell reskin | localStorage theme flag | n/a | Not found this pass | Verified working (most heavily documented subsystem in repo — 5 root `PHASE_1..5` docs + 33 files under `docs/frutiger-aero/`) | None this pass |
| Wired Archive ("cyber-terminal") | CRT/hacker-terminal secret mode nested inside Aero, discovered via a "finding" mechanic | `AeroFindingOverlay.tsx`, `WiredArchiveBootOverlay.tsx` | n/a (client-side) | `theme/wired-archive.ts/css`, `wiredArchiveLifecycle.ts`, `wiredDiscovery.ts` | localStorage | n/a | Not found this pass | Verified working per code presence; not click-tested this session | None this pass |
| Noctis (city-sim engine) | Standalone city/economy/ecology simulation feeding ambient lighting into the desktop | `renderer/environment/noctisLightBridge.ts` | `src/main/city/` (engine/service/ipc/rendering) | Bridges into desktop ambient layer | `noctis-state.json` | IPC-scoped (`city:getState`, `city:recordSession`) | ~20 internal design docs, own nested `.git` (§3) | Unable to verify (large, self-contained subsystem not deep-traced this pass) | Deep trace deferred; do not confuse with a UI skin (see §10) |
| Settings (canonical) | App-wide settings, routed | `components/settings/SettingsApp.tsx`/`SettingsHome.tsx` | n/a (client-side) | `settingsRegistry.ts` (~49 entries) + 19 `pages/*.tsx` | localStorage | n/a | Not found this pass | Verified working (confirmed routed via `AppSection.tsx` lazy import) | None this pass |
| Settings (legacy) | Older settings surface: profile mgmt, zoom, shortcuts, clipboard, telemetry | `views/SettingsView.tsx` (703 lines) | n/a | n/a | localStorage | n/a | Not found this pass | Unable to verify — **not routed** through `AppSection.tsx`, but still referenced from exactly 2 files: `components/settings/pages/StudyPage.tsx` and `views/AnkiView.tsx` (confirmed by direct grep) | Trace whether those 2 references are live call sites or stale imports before any deletion is proposed |
| Shortcuts / Command Palette | Rebindable global command system, fuzzy palette | `CommandPalette.tsx` (Ctrl+Space/Ctrl+P) | n/a (client-side) | `keyboardShortcuts.ts` (43.5KB, `COMMAND_CATALOG`) | localStorage (per-profile bindings) | n/a | Toolbox slice covered by vitest per §6a | Verified working (one of the most mature subsystems per PROJECT.md/TASKS.md) | None this pass |
| Backup / Restore | Export/import all app data | `components/settings/pages/MemoryPage.tsx` | n/a | `storage/storage.ts` (`exportAllData`/`importAllData`, lines 245-407 confirmed by direct read 2026-07-17) | Reads/writes all localStorage+IndexedDB stores plus a "host" snapshot of main-process state (mining config, AI provider, desktop layout, Anki profiles) | n/a | Not found this pass | **Working with defects** — full click-through completed 2026-07-17 (export → verify file contents directly → change wallpaper → import → verify). Export produces a real, well-formed `format: 2` backup (verified: 39 localStorage keys, 6 IndexedDB keys, host data). Import correctly clears and reloads. **Confirmed defect**: per-desktop wallpaper is not restored correctly — after import both virtual desktops showed the same wallpaper ("Crimson Veil") instead of their distinct backed-up values (Desktop 1 "midday", Desktop 2 "crimsonveil"), with no JS error. Suspected cause: `restoreHost()`'s per-viewport `desktopCommitLayout` calls in `storage.ts:316-342` — not root-caused this pass. | Root-cause and fix the per-desktop wallpaper restore bug; re-verify after the fix |
| Resources / bundles / novels catalog | Remote-JSON-driven resource hub, bundles, heat map | `views/ResourcesView.tsx` | `src/main/resourcesCatalog.ts` (untracked) | `BundleCard.tsx`, `BundleDetail.tsx`, `WorldHeatMap.tsx` | `resources-catalog.json`, `novels-catalog.json` | Consent-gated telemetry (§8) | Not found this pass | Implemented, unverified — see §7 for the dedicated write-up | Verify catalog fetch + offline fallback path in a future pass |
| Translate / AI analysis panels | Offline Qwen3 translation + cloud-LLM linguistic analysis (particles/declension/formality/measure words) | `views/TranslateView.tsx` | `src/main/translateAnalysis.ts`, `translate.ts`, `aiProviderClient.ts` (untracked) | `components/translate-analysis/*` | `mining/translation-*-cache.json` | Cloud path requires user-configured key; offline path (particles) needs no network | Doc claims vitest+eslint+boot-smoke pass; not independently re-run this pass | Implemented, unverified — see §7 | Manual key-dependent test matrix (doc's own stated gap) still open |
| Desktop Shell / widgets / window manager | Taskbar, start menu, free-positioned widgets | `components/DesktopShell.tsx` (93KB) | `src/main/desktop.ts` | `widgets/registry.tsx` + 6 category files | `desktop-layout.json` | n/a | Not found this pass | Verified working per code presence | None this pass |

---

## §6 Duplicate / legacy implementations

- **`Sidebar.tsx` vs `ui/Sidebar.tsx`.** `src/renderer/components/ui/Sidebar.tsx` is
  the live component. `src/renderer/components/Sidebar.tsx` is *mostly* dead — per
  TASKS.md itself, "nothing renders it, only its type is imported by `ComingSoon.tsx`."
  Confirmed directly: `src/renderer/views/ComingSoon.tsx:2` —
  `import type { SectionId } from '../components/Sidebar';` — a **type-only** import.
  **This is not a plain-delete candidate.** Any future removal of
  `components/Sidebar.tsx` must first migrate or relocate the `SectionId` type export
  (e.g. into `ui/Sidebar.tsx` or a shared types file) and update the `ComingSoon.tsx`
  import before the file can be deleted.
- **`SettingsView.tsx` (legacy) vs `SettingsApp.tsx` + registry (canonical).**
  `AppSection.tsx` routes to `SettingsApp` via `lazy()` import (confirmed) —
  `SettingsView.tsx` is not reached through the main section router. It **is** still
  referenced from exactly 2 other source files, confirmed by direct grep:
  `src/renderer/components/settings/pages/StudyPage.tsx` and
  `src/renderer/views/AnkiView.tsx`. Status: `Unable to verify` until those two
  reference sites are traced to determine whether they're live imports (e.g. importing
  a sub-component or type from the file) or genuinely dead code pulling in an unused
  703-line view.
- **`kuromoji` vs `@sglkc/kuromoji`.** Both are actively used Japanese tokenizers in
  different processes — plain `kuromoji` in the main process
  (`src/main/mining.ts:382`, dynamic `import('kuromoji')`), the `@sglkc/kuromoji` fork
  in the renderer (`src/renderer/tokenizer.ts`, reaching into internal
  `DictionaryLoader`/`Tokenizer` submodules with a hand-rolled `.d.ts` shim since the
  fork ships no types). Flagged as a maintenance-risk duplicate (dictionary/logic
  maintained twice, could drift), not dead code — likely the fork was chosen
  specifically for renderer/bundler compatibility that stock `kuromoji` lacks.

---

## §6a Blanc Mode / Blanc Toolbox — dedicated deep-dive

Blanc Mode is a top-level subsystem, not a single feature row.

**Surface map** (all confirmed on disk):

| Layer | Files |
|---|---|
| Window | `src/main.ts:331-460+` — 560×460 default / 420×360 min / 760×620 max, own persisted bounds file, `registerBlancIpc` (open/close/fullscreen) |
| Shell | `src/renderer/components/blanc/BlancShell.tsx` |
| Mode state | `src/shared/blancMode.ts` + `src/renderer/blancMode.ts` (+ `src/shared/__tests__/blancMode.test.ts`) |
| Registry | `src/shared/toolboxRegistry.ts` — 51 modules, stable IDs, category/status/capabilities/permissions/launch-contexts/adapter strategy |
| Settings | `toolboxSettings.ts` (shared + renderer) — typed schema, sanitize-on-load, per-category reset, JSON import/export; localStorage `jp-study.toolbox.settings.v1` |
| Shortcuts | `toolboxShortcuts.ts` → merged into app-wide `COMMAND_CATALOG`; command-palette `toolbox` mode (Ctrl+Shift+P) |
| Main IPC | `registerToolboxIpc` — file search, folder picker, automation-builder launcher (fixed path — §3), Blanc window controls |
| Theme/harness | `src/renderer/theme/blanc.css`, `src/renderer/__devharness__/blancHarness.tsx`, `blanc-harness.html` (root, dev-only — see Phase 17 doc) |

**Module status** (confirmed by direct read of `TOOLBOX_COMPLETION_AUDIT.md`, dated
2026-07-17, which traced every module UI→state→IPC→persistence→error-handling): **20
`ready`** (clipboard, dictionary, grammar, reading-finder, resources, calendar, media,
flashcards, statistics, epub-mining, anki-deck, mono-blocks, calculator,
unit-converter, focus-timer, system-monitor, file-search, quick-notes, hash-checker,
image-converter — counted directly from the audit's own table, totals to exactly 20),
**1 `experimental`** (automation-builder), **30 `adapter-needed`/planned** (correctly
hidden — no placeholder buttons rendered, listed only in the in-app Coverage panel).
51 total, matching the registry's own module count.

**Verification evidence, as claimed by `TOOLBOX_COMPLETION_AUDIT.md`** (self-audit, not
independently re-run in full this pass — the app-wide `npm test` run in §9 below is
this audit's independent check on the current state of the full suite): baseline
484/484 vitest passing before its changes, 487/487 after (+3 regression tests);
`vite build` clean; `eslint` no new errors on touched files (pre-existing TS 4.5
parser/`satisfies` issue noted as a known environment limitation, not a regression);
boot smoke test (`npm start`, 90s capture) — zero renderer errors reported.

**Safety posture, verified directly this pass:**
- Automation launch is fixed-path only — confirmed at `src/main.ts:176-182` (§3).
- File search never expands its root beyond the string given, has no symlink-following
  logic beyond what `toolboxFileSearch.ts` implements, and is read-only — confirmed by
  direct read of `sanitizeToolboxFileSearchRequest` (§3); the actual scan-cap
  enforcement (`maxScanned`/`maxResults`, both clamped by the sanitizer, lines 46-47)
  is visible directly in the same file.
- Calculator eval being regex-gated to digits/operators was **not** independently
  re-verified by this pass (spot-check budget was spent on the higher-stakes IPC
  handlers above) — carried over from the toolbox's own audit as `Unable to verify
  independently, but plausible given the stated implementation`.

**Persistence** (added to §4): Blanc window bounds → `blanc-window.json` (userData);
Blanc/toolbox settings → localStorage `jp-study.toolbox.settings.v1`.

**Open item, Low severity:** the Blanc window sets `webviewTag: true`
(`src/main.ts:511`) alongside the other four non-Companion windows, but Blanc Toolbox
modules (per the registry) don't appear to embed a `<webview>` anywhere — this may be
inherited boilerplate from a shared window-options helper rather than a deliberate
choice. Worth a one-line check in a future pass (is `webviewTag` actually needed on the
Blanc window?) but not treated as a security finding since it doesn't grant the Blanc
window any additional capability beyond what the main window already has.

`blanc-harness.html` + `blancHarness.tsx` are intentional dev-only visual-test surface
(TASKS.md-documented) — carried into the Phase 17 "not junk" list.

---

## §7 v1.01 / post-v1.01 promise-vs-reality

Source documents (all confirmed present at the paths below):
`docs/IMPLEMENTATION_PLAN_V1.01.md`, `docs/RESOURCES_1.01_OVERHAUL_PLAN.md`,
`docs/translate-linguistic-analysis-plan.md`.

Verdict vocabulary for this section: `Verified working` (traced + doc evidence
consistent with implementation) / `Implemented, unverified` (code exists and is wired,
but only the doc's own claim — not this audit — asserts it works) / `Partial` /
`Not started` / `Unable to verify`.

### Main v1.01 phase plan

Build order per the doc: 0.5 → 6 → 2 → 1 → 3 → 3.5 → 4 → 4.5 → 5/5b → 8 → 9 → 6.5 → 7 →
11 → 9.5 → 10. All 16 phase headers confirmed present in
`docs/IMPLEMENTATION_PLAN_V1.01.md` by direct read.

| Phase | Promise | Doc's own marker | Audit verdict |
|---|---|---|---|
| 0.5 | Level Meter — JLPT/HSK detection, `.apkg` import via sql.js worker | (none) | Unable to verify — not traced this pass |
| 1 | Reading Finder — comprehensibility score, continue-reading state, de-inflection | (none) | Implemented, unverified — `data/readingSites.ts` and de-inflection pipeline confirmed present per Explore survey; not click-tested |
| 2 | Whole-app i18n EN/JA/ZH/RU | Live per CLAUDE.md | **Verified working** — `node tools/i18n-check.cjs` run directly this pass: "all 2910 English keys are translated in ja/zh/ru. Nothing to do." |
| 3 / 3.5 | Game Arena — 10 games, zero runtime AI; mirror-writing AI evaluation loop | (none) | Unable to verify — not traced this pass |
| 4 / 4.5 | Shimeji companions + routines; motion design pass | (none) | Partial — Companion Host window (§1, window #6) confirmed to exist; routine depth not traced |
| 5 / 5b | Manga OCR replacement + overlay; transcription/Media split | (none) | Implemented, unverified — `mangaOcr` subsystem present (untracked) per §5 row |
| 6 | Download manager for all models/dictionaries | **DONE** | Implemented, unverified — `src/shared/assetRegistry.ts` + `src/main/downloads.ts` + Settings "Models & dictionaries" page confirmed present by direct read of the doc's own "Built:" line; doc records one deliberate deviation (optional sha256 — verify-by-size fallback) which is an honest, documented tradeoff, not a hidden gap. Not independently traced against the actual code this pass. |
| 6.5 | Stabilization pass 1 (this doc's own numbering, unrelated to this audit — see naming note) | in progress per doc | n/a to this audit |
| 7 | Pronunciation checker | Postponed by the doc | Not started (expected — doc explicitly defers it past Phase 6.5) |
| 8 | Auto language environment switcher | **DONE** | Implemented, unverified — design read directly (tokenizer/OCR/whisper/dictionary reconfiguration on language switch); not independently traced against code |
| 9 | Chrome extension mining + reader auto-sorting | **DONE** | App-side verified working 2026-07-17 (Batch C): pairing token UI, loopback bridge, `/v1/inbox` capture, URL de-dup, and `/v1/mine` selection mining all confirmed live via direct HTTP calls with the real pairing token, with the captured item confirmed appearing in the actual Library → Inbox UI. Extension-side code (popup, background script, keyboard shortcuts) **not** verified — no working browser-automation path this session (see `PHASE_6_5_CLEANUP_LOG.md`) |
| 9.5 | Miku first-boot guided tour | (none) | Unable to verify — not traced this pass |
| 10 | Final hardening, packaging, v1.01 | (none) | Not started (expected — this is the final gate phase) |
| 11 | Data portability & resiliency (backups + mining queue) | Must land before 10 | Unable to verify — see Backup/Restore row in §5; full cycle test not run this pass |

### Post-v1.01 projects

Tracked explicitly here since both landed after the v1.01 phase plan was written and
aren't folded into the numbered table above.

**1. Resources 1.01 overhaul** (`docs/RESOURCES_1.01_OVERHAUL_PLAN.md`, Phases 0–6).
Note: this document itself contains the phase plan **twice** — an initial spec (lines
1–191) followed by a "Phased Implementation Plan" restatement (lines 196–438) with the
same phase numbers — this looks like an iterative-drafting artifact within one file
rather than two competing plans; worth a light consolidation pass later, not flagged as
a defect. Confirmed built: `resourcesCatalog.ts` shared types; remote catalogue
plumbing (`catalog:get`/`catalog:refresh`, userData cache, `catalogFallback.ts`);
bundle/checklist UI (`BundleCard.tsx`, `BundleDetail.tsx`); heat map + consent flow +
Cloudflare Worker (`cloudflare-worker/`, untracked — §2, §8). **Verdict: Implemented,
unverified** — code and doc both point to a real, wired pipeline, but the actual
catalog-fetch/offline-fallback/consent-gate behavior was not exercised this pass.

**2. Translate linguistic-analysis panels**
(`docs/translate-linguistic-analysis-plan.md`, confirmed present at
`C:\Users\Arseniy\Projects\jp-study-app\docs\translate-linguistic-analysis-plan.md`).
The doc's own status line, confirmed by direct read of line 3: *"implemented
2026-07-16 (all 13 checklist steps; verified via vitest + eslint + boot smoke test —
the manual key-dependent matrix below still needs a hands-on pass)."* Implementation
surface confirmed present: `src/main/aiProviderClient.ts` (untracked — extracted from
`mining.ts` per the plan's own design section, confirmed by direct read of the plan's
"Backend design" section describing exactly this extraction),
`src/main/translateAnalysis.ts`, `src/shared/translateAnalysisCore.ts`,
`src/renderer/views/TranslateView.tsx`,
`src/renderer/components/translate-analysis/` (DeclensionDrawer, FormalityToggle,
MeasureWordGuide, ParticleBreakdown). **Verdict: Implemented, unverified for the
key-dependent paths** (formality/declension/measure-words require a configured cloud
API key — this audit has no key configured and did not exercise them). The offline
Japanese-particle path (kuromoji-tagged, no network required per the plan's design) is
more likely to be genuinely working since it has no external dependency, but was not
click-tested this pass either.

**Rule applied throughout this section:** no row says `Verified working` on the
strength of a plan document's own `DONE` marker alone; where that's the only evidence,
the verdict says `Implemented, unverified` and names what was actually confirmed by
direct reading (file existence, design-doc/code consistency) versus what would require
a runtime click-through to fully verify.

---

## §8 Secrets / credential findings

No committed real secrets found in this pass (source, config, docs, or the tracked
`terminals/*.txt` session transcripts — a targeted grep for API-key/token/password
patterns across all 30 transcript files came back clean in the underlying survey for
this audit).

- API keys are parameter-passed through `callGeminiApi`/`callDeepSeekApi` and never
  hardcoded (`src/main/aiProviderClient.ts`, `src/main/mining.ts`,
  `src/main/translateApi.ts`).
- `.env` is correctly listed in `.gitignore` (confirmed) though the app doesn't
  currently use any `.env` file at all — nothing to leak there today.
- `STATS_BASE` (`src/shared/stats.ts:10`, confirmed by direct read) hardcodes
  `https://jp-study-pings.vasars2024.workers.dev` — the developer's personal
  Cloudflare Workers subdomain. This is an **identifier, not a credential** (no key or
  token). Confirmed by direct read: the telemetry ping is gated behind explicit opt-in
  consent (`TELEMETRY_CONSENT_KEY`, line 16, checked as `localStorage['jp-telemetry-consent'] === 'yes'`
  before any request fires), and the code comment at the top of the file states the app
  never reads or sends an IP or any identifier — Cloudflare derives country server-side
  from the connection. This matches the user's own framing of the app as sending
  minimal outbound data.
- `cloudflare-worker/wrangler.toml:10` contains a real Cloudflare KV namespace ID
  (`114bc2d9...`, truncated here). This directory is currently **untracked** — if it is
  ever `git add`-ed as-is, that ID becomes permanently baked into git history. Recorded
  as an observation only, per this session's scope decision (excluded from the
  actionable Phase 17 batch — see the accompanying implementation-plan doc). No KV
  auth token was found alongside it; a namespace ID alone doesn't grant access without
  the developer's separate Cloudflare account credentials.
- AI provider keys and the extension pairing token are stored in plaintext on disk —
  see §3 Medium finding (this is a hardening gap, not a "committed secret" finding,
  since these files live under `userData`, not in the repo).

---

## §9 Dependency and test-suite findings

**Dependency duplication:** `kuromoji` / `@sglkc/kuromoji` — see §6. No other
duplicated-purpose libraries found (no second state-management library, date library,
or HTTP client).

**Test suite, run directly this pass** (`npm test`, i.e. `vitest run`, from repo root,
2026-07-17): **PASS — 560/560 tests passing across 62 test files**, 4.42s test run
time (30.39s transform + 37.80s import/collection overhead on top). This is the
full-repo figure, larger than the toolbox-only subset (`TOOLBOX_COMPLETION_AUDIT.md`
reports 487/487 for its own scope as of the same date — consistent, since the toolbox
is a subset of the full suite). No failing or skipped tests reported. This is a real
result from this session, not carried over from any document's own claim.

**i18n hygiene check, run directly this pass** (`node tools/i18n-check.cjs`): **PASS**
— "all 2910 English keys are translated in ja/zh/ru. Nothing to do."

---

## §10 Terminology mapping note

Per direction for this session: "cyber-terminal" (as referenced in the originating
cleanup brief) maps to the repo's real **Wired Archive** secret mode
(`data-materials="wired"`, discovered from within Frutiger Aero via a nested "finding"
mechanic). "Noctis" maps to the **city-simulation engine** under `src/main/city/` — a
real, substantial, self-contained subsystem with its own persistence
(`noctis-state.json`) and ~20 internal design docs, **not** a hidden UI skin like Aero
or Wired Archive. Any future document referencing "Noctis mode" or "cyber-terminal
mode" should be corrected to these real names.

---

## §11 Risk ranking summary

**Status column added 2026-07-17 after Batch A** (see `PHASE_6_5_CLEANUP_LOG.md`).
"Code fixed" means the mitigation landed and the test suite passed; it does not yet
mean the fix was exercised in the running app — that's Batch C/E's job.

| Severity | Finding | Section | Status |
|---|---|---|---|
| Critical | None found this pass | — | — |
| Medium | Manga OCR's Tesseract fallback silently produces garbled/unusable text on real manga content instead of erroring or clearly labeling results as unreliable, plus 8 repeated "Parameter not found" console warnings per scan | §5 Manga+OCR row | Found and reproduced 2026-07-17, Batch C — not fixed |
| High | Backup restore does not correctly restore per-desktop wallpaper (silent data-integrity defect, not a security issue — listed High per the spec's own severity rubric, which names "backup cannot restore" as a High example) | §5 Backup/Restore row | Found and reproduced 2026-07-17, Batch B — root cause not yet fixed |
| High (chained) | No CSP + `bypassCSP` schemes + widespread `webviewTag` | §3 | Code fixed, Batch A — not yet verified in a packaged build |
| High (chained) | `desktop:launch` executes arbitrary local files (by design; risk is only realized if chained with a renderer compromise) | §3 | Hardened, Batch A — not yet click-tested |
| Medium | `toolbox:fileSearch` accepts unrestricted renderer-supplied root (mitigated by read-only, capped, no-symlink-follow behavior) | §3 | Code fixed, Batch A — not yet click-tested |
| Medium | AI provider keys + extension pairing token stored in plaintext under `userData` | §3, §8 | Code fixed, Batch A — not yet confirmed live |
| Low | `AUTOMATION_BUILDER_DIRECT_COMMAND` hardcodes a machine-specific absolute path | §3 | Open — not in Batch A's scope |
| Low | Nested `.git` at `src/main/city/.git` — repo-hygiene note only | §3 | Open — flagged only, per standing decision not to touch it |
| Informational | No asar / disabled integrity fuses — deliberate, documented tradeoff | §3 | Not a defect — no action planned |
| Informational | `cloudflare-worker/wrangler.toml` KV namespace ID would be committed if that dir is ever added as-is | §8 | Open — deferred with `terminals/`/`mcps/` per scope decision |

**Zero Critical findings**: no committed secrets, no renderer-reachable arbitrary-command
execution (the automation launcher is fixed-path, verified directly), no cross-user data
exposure (the app is single-profile-scoped locally, and cross-profile isolation audit
Phase 7 of the full program is out of scope here so this isn't a completed clearance,
just an absence of evidence to the contrary).

**This ranking covers spot-checked findings, not a full IPC sweep** (repeated from §3's
completeness caveat — a full pass over all ~150 preload-exposed methods is Phase 5
work).
