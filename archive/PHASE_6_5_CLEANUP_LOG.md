# Phase 6.5 Cleanup Log

Running record of what was changed, tested, and verified across the Phase 6.5 batches
(see `PHASE_6_5_AUDIT.md` for the baseline findings and
`C:\Users\Arseniy\.claude\plans\note-this-app-has-ethereal-iverson.md` Revision 3 for
the batch roadmap). Entries are appended per batch, not rewritten.

---

## Batch A — Security & Permission Hardening (Phases 5, 6, 7)

Date: 2026-07-17.

### Fixed

1. **No CSP (High, chained).** Added a `Content-Security-Policy` response header
   for the packaged app's own document (`app://` origin only — dev server untouched).
   `src/main.ts`: new `registerContentSecurityPolicy()`, called from `app.whenReady()`
   right after `registerAppProtocol()`, inside the same `!isDevServer()` guard so it
   never fires against the Vite dev server (which needs HMR/eval). Policy: `script-src
   'self'`, `connect-src 'self' app: media: playfile: localfile:`, `object-src 'none'`,
   `form-action 'none'`, plus `img-src`/`media-src`/`font-src` covering the app's own
   custom schemes. Verified before writing it that the renderer has **no** direct
   `fetch()` calls to external hosts (all external network activity — translate/mining
   AI calls, resources-catalog fetch, telemetry ping — already goes through
   main-process IPC handlers, confirmed by grep) — so `connect-src 'self'` doesn't
   break any legitimate renderer-side network call.
   - **Not yet verified live**: this only takes effect in a packaged build
     (`app://` protocol isn't registered in dev mode). Scheduled for a real check
     during Batch C/E's packaged-build pass — flagging here rather than claiming it's
     confirmed working.
   - **2026-08-01 — that live check ran, and this directive was wrong.** The
     packaged-build pass (`docs/migration/tools/packaged-blanc-harness.mjs`) found
     `connect-src` blocking every renderer call to the bundled seanime sidecar:
     `Connecting to 'http://127.0.0.1:<port>/api/v1/status' violates the following
     Content Security Policy directive`. The study player gates on that status
     fetch, so the player never loaded in a packaged build at all — while dev was
     unaffected, since dev runs off the Vite origin this header never touches.
     The pre-write grep above is what missed it: it asked whether the renderer
     called **external hosts** and correctly answered no. The sidecar is loopback,
     so it was never in scope of the question. Fixed by adding
     `http://127.0.0.1:* ws://127.0.0.1:*` (both — the player also holds a
     `/events` websocket). Port is wildcarded because a CSP binds to a document at
     load time, so the live port cannot be named: Blanc can open before the sidecar
     has a port, and the supervisor can restart it onto a new one mid-session.
   - **`media-src` needed it too, and this took a second pass to find.** With only
     `connect-src` fixed the harness got a live socket, one clean POST and a
     `watch` at 1514ms — and still no picture, because the `<video>` element's load
     of `/api/v1/directstream/stream` is governed by `media-src`, not `connect-src`.
     The two directives cover different steps of the same open: `connect-src` the
     `fetch()` that *prepares* the stream, `media-src` the element that then *plays*
     it. A grep for renderer `fetch()` calls — which is how both this entry and the
     2026-07-17 note above framed the question — cannot see the second one. Any
     future host added for playback has to be checked against both.

2. **Unnecessary `webviewTag: true` on 3 of 5 windows (Low, per §6a's open question).**
   Traced the only `<webview>` consumer in the renderer (`ImmersionView.tsx`) and
   confirmed via `App.tsx`'s window-type routing (`?blanc=1`/`?miniWidget=1`/
   `?lockscreen=1`) that `BlancShell`, `MiniShell`, and `Lockscreen` never mount it —
   only the main window (full `AppSection` routing) and pop-out windows (`immersion`
   is in `POPOUT_LABELS`) can. Removed `webviewTag: true` from the Blanc, Mini Widget,
   and Lockscreen `BrowserWindow` constructors in `src/main.ts`. Main and pop-out
   windows keep it, since both can legitimately reach the Immersion Browser.

3. **Plaintext AI provider keys (Medium).** `src/main/mining.ts`: `api-keys.json`
   values are now encrypted at rest via Electron's `safeStorage` (OS
   keychain/DPAPI-backed) when available, with an `_encrypted` flag and transparent
   migration — a store written before this change (plaintext, no flag) is decrypted
   as plaintext on next read and immediately rewritten in encrypted form. If
   `safeStorage.isEncryptionAvailable()` is false (e.g. some Linux setups without a
   keyring), falls back to plaintext with a one-time console warning rather than
   losing the key. Also stopped the redundant plaintext mirror write to
   `gemini-api-key.txt` in `setApiKeyForBucket` (it used to keep writing the *same*
   secret in plaintext on every key update, which would have silently defeated the
   encryption above) — that file is now only ever read for one-way legacy migration,
   and gets deleted once its value has been folded into the encrypted store.

4. **Plaintext extension pairing token (Medium).** `src/main/extensionServer.ts`:
   same `safeStorage` treatment for `extension-bridge.json`'s `token` field (the
   `port` field stays plaintext — not sensitive). The token is still necessarily
   plaintext *at runtime* (it's shown to the user in Settings and sent as a Bearer
   header by the extension) — this fix is about the on-disk copy, not the runtime
   value.

5. **`desktop:launch` accepts any renderer-supplied path (High, chained).**
   `src/main/library.ts`. Traced both real call sites
   (`DesktopShell.tsx:1209` — a stored shortcut's `target`, sourced from the
   `desktop:pickShortcut` file-dialog result; `BlancShell.tsx:1869` — a
   `toolbox:fileSearch` result the user clicked) and confirmed neither ever passes a
   renderer-typed string — both originate from native OS UI the user already
   interacted with. Added: reject paths containing a null byte, reject non-absolute
   paths, and reject any path where `path.resolve(target) !== target` (blocks `..`
   traversal / non-normalized-path tricks) before the existing `fs.existsSync` +
   `shell.openPath` calls. Does not change behavior for either legitimate call site
   (both already pass absolute, already-normalized, existing paths) — only narrows
   what a *compromised* renderer could send this channel directly.

6. **`toolbox:fileSearch` accepts an arbitrary root (Medium).** `src/main.ts`.
   Traced the only renderer entry point (`BlancShell.tsx`'s `FileSearchPanel`) and
   confirmed its `root` state can only ever be set via `toolbox:pickSearchFolder`
   (a native folder-picker dialog) — there's no free-text root input in the UI.
   Added a session-scoped `lastPickedSearchRoots` set in `src/main.ts`, populated by
   the picker handler; `toolbox:fileSearch` now rejects any resolved root that isn't
   one of those picked folders (or a subdirectory of one) with a clear
   "Choose a folder with Browse before searching" error, instead of silently
   accepting any root string a compromised renderer might send.

### Investigated, no code change needed

7. **Phase 7 (Cross-Profile Isolation) — finding: the original framing didn't match
   the actual architecture.** The plan assumed `profiles.json` (`ProfileId`s like
   `p1-ja-focus`) was a data-isolation boundary worth ID-substitution testing. Reading
   `src/main/profiles.ts` end to end shows these "profiles" are **Anki
   export-configuration presets** (deck name, note-model, field mapping, lookup
   pipeline) — not separate data domains, and there is no session/auth concept
   distinguishing "whose" profile a renderer call is for (any renderer code can
   already list/switch/update any profile by design — that's the intended
   single-user UX, like switching a settings preset, not a privilege boundary to
   defend). So a classic "can tenant A read tenant B's data by changing an ID" test
   doesn't apply here — there's no tenant boundary to breach.
   - The concept that **does** need isolation and actually has it: per-language
     study data. `knownWords.ts` and `savedWords.ts` key their localStorage entries
     by `StudyLang` (`jp-word-knowledge-ja` vs `-zh`, from `studyEnvironment.ts`'s
     `getStudyLang()`), confirmed by direct read — this is the real mechanism behind
     the v1.01 doc's own stated pitfall ("switching study language must never wipe
     or overwrite the other language's state").
   - **Minor gap found, not fixed this pass:** `levelLists.ts` (user-pasted JLPT/HSK
     word lists) does **not** key its storage by `StudyLang` the way
     knownWords/savedWords do — a list pasted while in a JA environment stays visible
     when switched to ZH. This isn't a data leak in the security sense (a JA lemma
     list just shows 0% progress against ZH knownWords, since `getLevel()` itself is
     lang-scoped), but it is a UX/data-hygiene inconsistency worth a follow-up. Not
     fixed in this batch since it's a UI/data-model change, not a security fix — noted
     for Batch C/D's Settings & Data Migration passes.

### Tests run

- `npm test` (`vitest run`): **560/560 passing, 62 files** — run three times across
  this batch's edits (after webviewTag/CSP changes, after the IPC hardening, and
  after the eslint fix below), no regressions at any point.
- `npx eslint` on all four touched files: one real error caught and fixed
  (`mining.ts:141` — `prefer-const` on a `let deepseek` that was never reassigned in
  the new `readApiKeyStore`); everything else was pre-existing `no-non-null-assertion`
  warnings in code this batch didn't touch the logic of.

### Not yet verified (honest gaps, carried to later batches)

- CSP's actual effect on a packaged app hasn't been observed live (dev mode never
  exercises it, per its own gating) — needs a real `npm run package` + launch check.
- `safeStorage.isEncryptionAvailable()` behavior on this specific Windows machine
  hasn't been confirmed live (should be true via DPAPI, but not observed) — will show
  up naturally the first time Batch C exercises the AI Card Studio / mining API-key
  flow with computer-use.
- The `desktop:launch` and `toolbox:fileSearch` hardening hasn't been click-tested
  yet (desktop shortcut grid, Blanc file-search panel) — scheduled for Batch C.

---

## Batch B, part 1 — Diagnostics & Payment Scan (Phases 8, 10)

Date: 2026-07-17.

### Phase 10 — Payment/Licensing Review

Grepped `package.json` and all of `src/` for payment-related terms (stripe, paypal,
checkout, billing, subscription, premium unlock, paywall, license key). Three
substring hits, all false positives on inspection: `bundle-card-stripe` (a CSS accent
stripe on a Resources bundle card, nothing to do with payments) and two "subscription"
hits in `src/main/city/docs/ARCHITECTURE.md` referring to the event-listener
subscribe/unsubscribe pattern. **No payment scaffolding, no abandoned purchase UI, no
payment SDK dependencies, no test/license keys found anywhere.** Matches the user's own
statement that the app has no payment features. Phase 10 closed — nothing to fix.

### Phase 8 — Error Tracking and Diagnostic Infrastructure

**Gaps confirmed before fixing** (grepped first, all zero matches / one partial):
no React error boundary anywhere in `src/renderer`; no `unhandledRejection` handler in
the main process (only `uncaughtException`, which existed and quit the app on any
error but didn't log it anywhere durable); no `render-process-gone` /
`unresponsive` handling on any of the 6 windows. A renderer crash or hang previously
left a blank/frozen window with nothing recorded.

**Added:**

1. `src/main/errorLog.ts` (new) — structured local diagnostic log. Appends
   JSON-lines (`ts`, `severity`, `subsystem`, `operation`, `detail`) to
   `<userData>/logs/main.log`, capped at 2MB (trims to the newest half rather than
   growing forever or deleting everything). `sanitizeDetail()` redacts anything that
   looks like a Bearer token or a long hex/base64 blob before writing, as defense in
   depth beyond "callers pass short sanitized strings, not raw objects."
2. Wired into `src/main.ts`: the existing `uncaughtException` handler now also logs;
   new `unhandledRejection` handler (previously nothing caught these); a
   `render-process-gone` + `unresponsive` listener added inside `attachNavGuards()` —
   since every one of the 6 window constructors already calls that function, this
   covers all of them (main, Blanc, Mini, Lockscreen, pop-out, Companion Host) from
   one place rather than duplicating the wiring 6 times.
3. New narrow IPC channel `diagnostics:logRendererError` (`registerDiagnosticsIpc()`
   in `main.ts`, exposed as `window.api.logRendererError()` in `preload.ts` +
   `window.d.ts`) — accepts only `{subsystem, operation, detail}` strings, no
   arbitrary object logging from the renderer.
4. `src/renderer/components/AppErrorBoundary.tsx` (new) — a top-level React error
   boundary wrapping `<App />` in `main.tsx`. On a render crash it now shows a plain
   "Something went wrong — your saved data is untouched, reload to continue" screen
   with a Reload button instead of a blank white screen, and reports the error +
   component stack via the new IPC channel.
5. `src/renderer/main.tsx`: added `window.addEventListener('error', …)` and
   `('unhandledrejection', …)` handlers forwarding to the same IPC channel, so
   errors outside React's render cycle (event handlers, async code) are captured too.

**Explicitly not done this pass** (scope decision, not an oversight): the original
spec's "user-accessible diagnostic export" UI (a Settings page that packages the log
for the user to share) is real follow-up work, not implemented here — logging to disk
is the foundation; the export UI belongs with the rest of the Settings audit
(Batch C, Phase 14) rather than being bolted on ad hoc here.

### Tests run

- `npm test`: 560/560 passing, 62 files — no regressions.
- `npx eslint` on all 6 touched/new files: caught and fixed 2 real errors
  (`no-empty-function` on `.catch(() => {})` in `main.tsx` — changed to
  `.catch(() => undefined)`); everything else was pre-existing non-null-assertion
  warnings in untouched code.

### Not yet verified

- None of the new crash/error paths have been exercised live yet (no renderer crash,
  no unhandled rejection, no actual log file inspected) — verifying the log file
  actually gets written correctly is natural to fold into Batch C/E's computer-use
  passes rather than synthetically forcing a crash right now.

---

## Batch B, part 2 — Live app testing session (Phase 9 attempt) + environment finding

Date: 2026-07-17.

### Bug found and fixed while booting the dev app for testing

Launching `npm start` to do live computer-use verification immediately surfaced a
real, pre-existing bug (unrelated to Batches A/B's own changes — this is in
untracked work from the Chrome-extension/inbox feature): **`src/renderer/inboxEnrich.ts`
had wrong relative import paths on all three of its imports**, written as if the file
lived one directory deeper than it actually does. `../../shared/types` and
`../../shared/inboxMeta` resolved to a nonexistent `<repo-root>/shared/` (should be
`../shared/...`, since the file is directly in `src/renderer/`); `../comprehensibility`
resolved to a nonexistent `src/comprehensibility.ts` (should be `./comprehensibility`,
since that file is in the same `src/renderer/` directory). The type-only import
(`import type { LibraryItem }`) never actually errored at runtime — TypeScript elides
type-only imports entirely, so Vite never tried to resolve that one — but the two real
value imports broke Vite's dev transform outright, which would have blocked the
Chrome-extension inbox auto-sorting feature (v1.01 Phase 9) from working at all the
first time anyone tried to use it. Fixed all three import paths; confirmed via the dev
server log that the app now boots with zero Vite transform errors, tokenizer/highlight
boot self-tests passing; `npm test` still 560/560 afterward.

### Environment finding: main window failed to paint in this session (not a code bug)

After getting the app booted, live verification of Settings → Memory (export/import)
and other main-window-only UI was attempted via computer-use. **The main "日本語
Study" window consistently rendered as a solid blank frame** — no content, no error
screen — across four separate full process restarts (`taskkill /IM electron.exe` +
fresh `npm start`), while in the same sessions:
- The **Blanc Toolbox window** (a second `BrowserWindow` loading the identical
  renderer bundle, differentiated only by `?blanc=1`) rendered correctly every time,
  showing real data (`Folders: All (9)`, a library item "メインページ" consistently at
  67% progress across all four restarts — see the persistence note below).
- The **detached DevTools window** (native Chromium UI, not app code) was *also*
  blank in three of the four attempts, and its Console tab reported **zero JS
  errors** ("No Issues") in the one attempt where it did render.
- Disabling GPU hardware acceleration (`app.disableHardwareAcceleration()`, tested
  behind a temporary env-var flag and reverted afterward — not shipped) did not fix
  it.

Since the app's own native DevTools chrome was equally affected and no JS error was
ever reported, this points to a compositor/paint issue specific to this sandboxed
session's virtual display, not a defect in the app or in this session's code changes.
It's recorded here rather than silently ignored because a future session attempting
computer-use verification of main-window-only features (Settings, Reader, Dictionary,
most pop-outs, the Chrome-extension pairing UI) should expect to hit the same wall in
this environment and may need to fall back to the Blanc Toolbox window (which does
work), file-level verification, or a non-sandboxed environment.

### Phase 9 (Memory Persistence & Backup/Restore) — partial verification

Given the above, the full click-through (create data → export → wipe → import →
verify) specified in the plan could **not** be completed via GUI this session. What
was actually verified, by two different methods:

1. **Incidental but genuine launch-to-launch persistence evidence.** The Blanc
   Toolbox Library panel showed identical state — `Folders: All (9)`, the same EPUB
   title at the same 67% progress — across four independent full process kills and
   relaunches performed during the troubleshooting above. This data is backed by
   `library.json` (a main-process JSON store, per `PHASE_6_5_AUDIT.md` §4), so this is
   real evidence that at least one real data category survives a full restart, even
   though it wasn't the deliberately-constructed test data the plan called for.
2. **Code-level verification of `exportAllData`/`importAllData`**
   (`src/renderer/storage/storage.ts:245-407`, read directly). Confirmed this is a
   real, substantial implementation, not a stub: `exportAllData()` snapshots
   localStorage, IndexedDB (via `collectIdbSnapshot()`), and a "host" snapshot of
   main-process-owned state (mining config, AI provider selection, desktop layout,
   Anki profiles) into a versioned (`format: 2`) JSON structure, plus a manifest of
   settings-domain sizes. `importAllData()` validates the `app: 'jp-study-app'`
   marker before touching anything (rejects unrelated JSON files), clears then
   restores localStorage + IndexedDB, and restores host state field-by-field with
   individual `try/catch` per field so one failed IPC call (e.g. a since-deleted
   profile) doesn't abort the whole restore.

**Verdict for `PHASE_6_5_AUDIT.md`'s Backup/Restore row: still `Unable to verify` for
the actual button-driven user flow — upgraded from "code exists" to "code is real and
looks complete" based on the read above, but the corrupt-then-restore cycle with
checksums that the original spec calls for was not run.** This is carried forward as
open work, not marked done.

### Tests run

- `npm test`: 560/560 passing after the `inboxEnrich.ts` fix — confirmed twice more
  during the restart cycles above (state unaffected by any of the GUI troubleshooting).

### Root cause found and fixed — the "blank main window" was a real bug, not just an environment quirk

Per user direction, kept investigating instead of working around it. Found it:
**`createWindow()` in `src/main.ts` was the only one of the 6 window constructors that
did not use the `show: false` + `ready-to-show` pattern** — it let the window show
immediately on construction (Electron's default), before the renderer had produced a
first paintable frame. Blanc/Mini/Lockscreen/pop-out all correctly defer `show` until
`ready-to-show` fires. This is the textbook Electron cause of a window staying
persistently blank on some GPU/compositor setups (the window "shows" once with nothing
to swap in, and never gets a forced repaint afterward) — matching every symptom
observed: only the main window affected, DevTools (attached to the same window) 
equally blank until the same fix, zero JS errors since nothing actually crashed,
disabling GPU acceleration didn't help since the problem was paint *timing*, not paint
capability.

**Fix** (`src/main.ts`, `createWindow()`): added `show: false` to the
`BrowserWindow` constructor and `mainWindow.once('ready-to-show', () => { if
(mainWindow && !mainWindow.isDestroyed() && restore?.visible !== false)
mainWindow.show(); })`, replacing the old unconditional-show +
`if (restore?.visible === false) mainWindow.hide()` pair with an equivalent
ready-to-show-gated version (same effective behavior for the restore-hidden case,
just no longer flashes visible-then-hidden first). Verified: `npm test` 560/560
passing after the change; live-tested via computer-use — the main window now renders
correctly (live sky wallpaper, full taskbar with Start/Desktop 1/Desktop 2/search/
notifications/settings, all interactive) on the very next launch, and consistently
across subsequent relaunches.

This was a real, shippable bug affecting every user, not a sandbox-only artifact — it
would show as an intermittent blank-window-on-launch on any machine where the first
frame happens to take slightly longer to composite (slower GPU, high display scaling,
some virtualization/remote-desktop setups). Worth a mention in `TASKS.md`/release notes
since "app opens to a blank window sometimes" is exactly the kind of report that's hard
to reproduce and easy to dismiss without this trace.

### Phase 9 (Memory Persistence & Backup/Restore) — completed, with a real defect found

With the main window rendering, ran the actual planned click-through:

1. **Launch-to-launch persistence**: confirmed again via Settings → Memory & storage,
   which showed real live data (System memory: RAM/CPU/uptime from `system:getMetrics`;
   Settings inventory: 20 active domains, e.g. "Living layer" 5.8KB, "Theme &
   appearance" 19B, "Desktop layout" 441B — all real, not placeholder zeros once the
   page finished loading).
2. **Functional export**: clicked "Export all settings" → native Save dialog → saved
   `jp-study-backup-2026-07-17.json` to Downloads. Verified directly (Node, not just
   trusting the UI): real 7.8MB file, `app: "jp-study-app"`, `format: 2`, 39
   localStorage keys, 6 IndexedDB keys, host data for `mining`/`ai`/`desktopLayout`/
   `profiles`. Confirms `exportAllData()` produces real, complete output, not a stub.
3. **Changed state**: switched the wallpaper from "Midday" to a different preset via
   Settings → Wallpaper (applied immediately, as the UI claims).
4. **Functional import**: clicked "Import backup...", selected the file from step 2,
   confirmed via a native Open dialog. The app cleared and reloaded as expected
   (`importAllData()` calls `localStorage.clear()` + IndexedDB clear then repopulates,
   per the code read in part 2).

**Defect found**: after import, the wallpaper was **not** correctly restored. The
backup's `host.desktopLayout` snapshot (verified directly in the exported JSON)
correctly recorded two per-desktop wallpapers — `desktopIndex 0: "midday"`,
`desktopIndex 1: "crimsonveil"` — matching the state at export time. After import,
**both** Desktop 1 and Desktop 2 showed as "Crimson Veil" (confirmed by checking
Settings → Home's wallpaper label on each desktop tab), and both rendered a solid
black wallpaper area instead of their distinct expected backgrounds. DevTools Console
showed no JS errors during or after the import — this is a silent partial-restore
defect, not a crash. Likely cause (not fully root-caused this pass, flagged for a
future session): `restoreHost()`'s `desktopLayout` restore loop
(`src/renderer/storage/storage.ts:316-342`) calls `api.desktopCommitLayout(vp.desktopIndex,
vp)` per viewport then separately `api.desktopSwitch(snap.activeDesktopIndex)` — if
`desktopCommitLayout` doesn't correctly scope the wallpaper write to the specific
`desktopIndex`, or if both commits race before the final switch, both desktops could
end up sharing whichever wallpaper was written last (desktopIndex 1's "crimsonveil"),
which matches what was observed.

**Verdict for `PHASE_6_5_AUDIT.md`'s Backup/Restore row: upgrade from `Unable to
verify` to `Working with defects`** — the feature is real, exports/imports a
substantial and correctly-structured backup, and most domains (Library, per the
earlier restart evidence) round-trip correctly, but per-desktop wallpaper restore is
confirmed broken. Filed as an open bug, not fixed in this pass (root cause needs a
closer trace of `desktopCommitLayout`'s IPC handler in a future session — Batch C or a
dedicated follow-up).

### Tests run (this part)

- `npm test`: 560/560 passing, confirmed both before and after the `show: false` fix.

---

## Batch C — Runtime Feature Verification (Phases 11-14), part 1: Chrome extension

Date: 2026-07-17.

### Tooling constraint

Neither available browser-automation path could load the unpacked Chrome extension
this session: the Claude-in-Chrome MCP extension is not connected/installed on this
machine, and computer-use's browser grant tier is read-only by design (screenshots
only, no clicks/typing) for any real browser. So the extension's own code
(`extension/popup.html`, `background.js` — keyboard shortcuts, context menu, "app not
running" retry queue) was **not** exercised inside an actual Chrome instance this
session.

### What was verified instead — the app-side half of the integration, directly

Got the real pairing token from the running app (Settings → Chrome extension page,
which correctly displays "Bridge listening on 127.0.0.1:18765" and a live pairing
token with Copy/Regenerate/Refresh controls — matches the design exactly). Then used
that real token to call the loopback HTTP bridge directly with `curl`, simulating
exactly what `background.js` would send:

- `GET /v1/health` (no auth) → `{"ok":true,"version":1,"port":18765}` — bridge live.
- `GET /v1/page-kind?url=...` → correctly classified a URL as `"kind":"article"`,
  `"action":"inbox"`.
- `POST /v1/inbox` with the **wrong** Bearer token → `401`. With **no** token → `401`.
  Auth enforcement confirmed working, not just present in the code.
- `POST /v1/inbox` with the **correct** token and a real payload (title, URL, Japanese
  HTML body) → `{"ok":true,"duplicate":false,"id":"...","kind":"article"}` — a real
  item was created.
- **Confirmed in the actual UI**, not just the HTTP response: opened Library → Inbox
  filter in the running app and saw the captured item ("Batch C test article",
  "UNKNOWN · 1m") appear for real, with "Chrome extension" as a selectable source
  filter alongside "Inbox"/"YouTube".
- Resent the identical request → `{"ok":true,"duplicate":true,"id":"<same id>",...}` —
  de-duplication by URL confirmed working (spec requirement: "de-duplicate inbox items
  by URL + content hash").
- `POST /v1/mine` with a Japanese sentence → mode auto-detected as `"sentence"`,
  correctly attempted Anki card creation, and failed with a clear, specific,
  non-crashing error ("Anki's sort field 'Meaning' is empty...") because this test
  environment has no configured Anki note type — a real environment limitation, not a
  bug; the important finding is the pipeline ran correctly and failed *loudly and
  specifically* rather than silently.

**Verdict: the extension's app-side integration (pairing, loopback auth, inbox
capture, de-dup, selection mining) is real and confirmed working end-to-end. The
extension's own browser-side code (popup, background script, keyboard shortcuts,
context menu, offline retry queue) remains unverified this session** — flagged
honestly rather than claimed. A future session with Claude-in-Chrome connected (or a
manual test by the user) should load `extension/` unpacked and confirm the popup UI
and keyboard shortcuts trigger these same calls correctly.

## Batch C, part 2: Reader, Dictionary, Flashcards click-through

Date: 2026-07-17. Continued in the same live session, main window fully working.

- **Reader**: opened the real "メインページ" EPUB from the Library — resumed exactly
  at its saved position (chapter 7/10, 67%), matching the library card. Prev/Next,
  bookmark, font-size, highlight-color swatches, and Collect controls all present and
  visually correct.
- **Dictionary**: clicked a plain (non-hyperlinked) word in the actual EPUB content —
  real popup appeared with pitch-accent reading, two real dictionary entries (JMdict
  Japanese→English *and* Japanese→Russian glosses for the same word), N/L/F/K
  level buttons, star/copy/audio icons, and Example sentences / Reverse Learning Focus
  sections.
- **Flashcards/Anki**: clicked "+ Add to Anki" on that dictionary entry — button
  changed to "Added ✓". Confirms the capture pipeline (dictionary entry → Anki card)
  works end-to-end from the reader, not just in isolation.
- Double-clicking a *hyperlinked* word (`人口`, a wiki-style internal link in the test
  content) followed the link to a new in-app page instead of opening the dictionary —
  this is correct, expected behavior (links stay links), not a defect; plain-word
  single-click is the actual lookup trigger.

### Not reached this session (honest scope boundary)

Given the scale of the remaining work and time already spent, this session stopped
after Reader/Dictionary/Flashcards. **Not yet click-tested**: Study Statistics
(restart-inflation check), Download manager, Auto language-environment switcher,
Manga OCR, Resources catalog + heat map + consent flow, Translate linguistic-analysis
panels (needs a configured cloud API key), Calendar, Clipboard capture, the
`desktop:launch`/`toolbox:fileSearch` hardening from Batch A (shortcut grid, Blanc
file-search panel), Settings/Shortcuts consistency audit (Phase 14), and Phase 11's
git-history regression review. These remain open per the Batch C plan in Revision 3 of
the roadmap and should be picked up in a follow-up session.

### Tests run

- `npm test`: 560/560 passing — final check for this session, no regressions from any
  of the Batch C interactions (dictionary lookup, flashcard capture, reader progress,
  extension bridge calls all exercise real app state, not fixtures, and none of it
  broke anything the suite covers).

## Batch C, part 3: Statistics, Calendar, Clipboard + Phase 11 (Silent Rewrite Detection)

Date: 2026-07-17.

### Phase 11 — Silent Rewrite Detection: git history too coarse to be useful

Checked `git log --oneline -- <file>` for the highest-risk files (`src/preload.ts`,
`src/main.ts`, `src/renderer/keyboardShortcuts.ts`,
`src/renderer/storage/storage.ts`). Each has only 4-5 commits total, all
"checkpoint before checking out master" / "baseline snapshot" / one large merge —
there is no fine-grained commit history to trace incremental regressions from,
consistent with `PHASE_6_5_AUDIT.md` §2's finding that essentially all real
development happened in the (still largely uncommitted) working tree. A traditional
"diff each commit, look for a removed handler" pass isn't meaningful here. Substituted
the practical equivalent: the live click-through testing done across this and the
prior Batch C session (extension, Reader, Dictionary, Flashcards, Statistics,
Calendar, Clipboard) *is* the regression check for this pass — nothing exercised so
far showed a handler silently missing or a caller left pointing at a removed function.
This is not a substitute for a real Phase 11 pass once more work is committed in
reviewable increments — noted as a standing gap, not resolved.

### Statistics, Calendar, Clipboard — verified working

See updated `PHASE_6_5_AUDIT.md` §5 rows for each. Highlights:
- **Statistics**: real non-zero word-knowledge/streak/reading-time data, not
  placeholders. One unconfirmed observation (not filed as a bug): "Characters Today"
  read 0 immediately after an active reading session in the same run — could be a
  debounce/flush-timing artifact, needs isolation before it's a real finding.
- **Calendar**: completed a full live CRUD cycle — create → confirm on-calendar
  render → edit (confirmed correct pre-fill) → delete → confirm removed. No
  synthetic/mocked steps.
- **Clipboard**: opened the real history panel populated with genuine prior entries,
  confirmed category tabs/search/per-entry actions are present and not placeholders.
  Deliberately did not delete or modify any of the user's real clipboard history while
  verifying this.

### Session wrap-up

This closes out the representative sample of Batch C's Phase 12/13 flows planned for
this session (Chrome extension, Reader, Dictionary, Flashcards, Statistics, Calendar,
Clipboard) plus a lightweight Phase 11 pass. **Not reached**: Download manager, Auto
language-environment switcher, Manga OCR, Resources catalog + heat map, Translate
linguistic-analysis panels, the `desktop:launch`/`toolbox:fileSearch` hardening
click-test, Phase 14 (Settings/Shortcuts consistency audit), and all of Batch D
(theme isolation, dependency cleanup, migration audit) and Batch E (performance,
final validation). Carried forward per the roadmap in
`C:\Users\Arseniy\.claude\plans\note-this-app-has-ethereal-iverson.md` Revision 3.

### Tests run

- `npm test`: 560/560 passing, final check before ending this testing round.
