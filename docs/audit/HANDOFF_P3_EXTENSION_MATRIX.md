# HANDOFF P3 — extension feature truth matrix, driven

**Status: IN PROGRESS.** This file is written incrementally from the first measurement, per the
dispatch. If it ends mid-section the run was cut at a session limit; everything above the cut is
measured, nothing below it exists.

## 1. Scope and ownership

| | |
|---|---|
| Branch | `audit/a-evidence` (stayed on it; no branch cut, no commits — the dispatch reserves committing to the orchestrator) |
| Base commit | `97924ce` |
| Account | claude-x |
| Owned | `docs/audit/FINDINGS_P3_EXTENSION_MATRIX.md`, `docs/audit/HANDOFF_P3_EXTENSION_MATRIX.md` |
| Foreign | everything else — `EXTENSION_FEATURE_TRUTH_MATRIX.md`, `extension/**`, `src/**`, `.gitignore`. Read-only to this run. |

**No proof directory was created.** The dispatch says "You own exactly" two files and "Nothing
else". Evidence that would normally go in `docs/audit/proof/<pkg>/` is therefore inlined in
`FINDINGS_P3_EXTENSION_MATRIX.md` as the literal CDP output, and every row carries the
re-runnable command. Scratch scripts live in the session scratchpad, not in the repo:

```
C:\Users\Arseniy\AppData\Local\Temp\claude\C--Users-Arseniy-Projects-jp-study-app\
  c387efa5-8ef1-4d16-9568-8fb369f84532\scratchpad\
    cdp-probe.mjs / cdp-content.mjs   copied from the orchestrator
    cdp.mjs      persistent-session CDP client, so click and assert are two round-trips
    bridge.mjs   debug-bridge client for the scratch-profile app
    extctx.mjs   an extension-page context, because a service worker cannot message itself
    pair.mjs     writes jpStudyToken/jpStudyPort into the scratch Chromium profile
    s1..s13      13 stage scripts (`ls s*.mjs | wc -l` -> 13)
```

## 2. Pre-flight safety state

| Check | Value at start |
|---|---|
| Real Electron profile `%APPDATA%\jp-study-app` newest write | `8/2/2026 9:40:03 AM` — `Local Storage\leveldb\000110.log`, `immersion/metrics.json`, `immersion/sites.json` |
| Listeners on 18765 / 5173 / 39273 / 9222 at start | **none** (`Get-NetTCPConnection -State Listen`, exit 1 = no match) |
| User's real Chrome processes at start | **29** (`C:\Program Files\Google\Chrome\Application\chrome.exe`). At cleanup there were **38** — the user was working in their browser during the run. Both counts are of *their* Chrome, and neither was touched |
| Scratch Chromium profile | `%TEMP%\p3ext-chrome` |
| Scratch Electron profile | `%TEMP%\p3ext-app` |

## 3. Corrections to the dispatch, before anything was driven

| Dispatch says | Measured | Consequence |
|---|---|---|
| Chromium at `…\chromium-1228\chrome-win\chrome.exe` | **`chrome-win64\chrome.exe`** — `chrome-win` does not exist (`ls …/chrome-win/chrome.exe` → No such file or directory) | Used `chrome-win64`, which is also what `FINDINGS_EXTENSION_BRIDGE.md:71` records. Copying the dispatch path verbatim fails to launch. |
| CDP examples at `…\c7ad7e98-598a-4897-aa96-ab063d6d53e4\scratchpad\` | That scratchpad holds only `vitest.widened.config.{mjs,ts}`. The scripts are at **`…\15370502-a83f-4763-aa84-607acb26de74\scratchpad\`** (`find … -name "cdp-*.mjs"`) | Copied from the real location. |
| Matrix has "**35 feature rows** (not 47 …); verify the count yourself" | **35 confirmed.** `awk 'NR>=12 && NR<=46 && /^\|/' EXTENSION_FEATURE_TRUTH_MATRIX.md \| wc -l` → 35; `grep -c '^\| ' …` → 36 = 1 header + 35 features (the `\|---\|` separator does not match `'^\| '`) | Denominator is **35**. `FINDINGS_EXTENSION_BRIDGE.md:130` says `0 / 47` — that 47 is wrong and should be corrected to 35 by whoever owns that file. |

## 4. Harness — what came up

**Extension identified by manifest name, not by URL** (dispatch trap 1):

```
$ node cdp-probe.mjs
{
  "serviceWorkers": [
    { "url": "chrome-extension://nkeimhogjdpnpccoofpliimaahmaaome/thunk.js",
      "name": "Google Hangouts", "version": "1.4.5" },
    { "url": "chrome-extension://nimngppppgpldedpaepkpobiebicmcba/background.js",
      "name": "GrammarX — Reader Companion", "version": "3.2.0" }
  ]
}
```

The decoy is real and present: Chrome's own **Google Hangouts** component extension exposes a
service worker in the same target list. A run that took "the only service worker" or matched on a
URL would have measured it. Extension id under test: **`nimngppppgpldedpaepkpobiebicmcba`**.

Browser: `Chrome/149.0.7827.55` (Playwright chromium-1228), `Protocol-Version 1.3`.

---

*(sections 5+ appended as measurements land)*

## 5. Measurement log (appended as it happened)

### 5.1 App side came up on a scratch profile

```
npx electron-forge start -- --user-data-dir=C:/Users/Arseniy/AppData/Local/Temp/p3ext-app
```

- `debug/bridge.json` → `{port: 39273, pid: 14992}`; `/health` → 1 window, `日本語 Study`,
  `http://localhost:5173/`, 1280×860.
- `GET http://127.0.0.1:18765/v1/health` → **200**, contract version 1, **20** commands,
  **10** queue kinds, `features.sentenceAnalysis: true` — matches
  `FINDINGS_EXTENSION_BRIDGE.md:13-30` exactly, re-derived this run.
- Scratch profile confirmed in use: `%TEMP%\p3ext-app\extension-bridge.json` exists and
  `window.api.extensionStatus()` reports
  `folderPath: C:\Users\Arseniy\AppData\Local\Temp\p3ext-app\chrome-extension`.

**Correction to the dispatch: no telemetry consent gate appeared.** The dispatch says a fresh
profile opens behind a full-viewport consent gate to be dismissed with "No thanks". Measured on
this fresh profile: `/eval` → `/consent|telemetry|No thanks/i.test(document.body.innerHTML)` =
**false**, `document.body.innerText` = `"Start / Desktop 1 / Desktop 2 / 09:19 AM / Aug 4 /
Seanime sidecar · stopped / + / Media workspace / stopped"` (92 chars). Nothing was consented to
on the user's behalf because nothing asked.

**Anki is live on this machine.** `%TEMP%\p3ext-app\anki-intervals.json` reached **7.8 MB**
within three minutes of launch, and the popup reports the real profile
`Japanese Focus → JP Study::N2 Vocab`. A scratch Electron profile does **not** isolate
AnkiConnect — HARD SAFETY RULE 1 is live, not theoretical, on this run. No write path was driven.

### 5.2 Pairing — done, and it is what unlocked most rows

The extension pairs by writing `jpStudyToken` + `jpStudyPort` into `chrome.storage.local`
(`extension/background.js:33-49`, read by `getConfig()` at `:44`). Token read from the app the
same way Settings shows it to the user (`window.api.extensionStatus()`), then written into the
**scratch Chromium profile only**:

```
### before  {"jpStudyPort":18765,"jpStudyToken":""}
### after   {"jpStudyPort":18765,"jpStudyToken":"a6b4…d4f3"}
```

Consequence for the dispatch's `NOT-REACHABLE — requires pairing` bucket: **it is nearly empty.**
Pairing was reachable, so every read-only bridge route could be driven for real.

**Harness note worth carrying:** the MV3 service worker terminates after ~30 s idle and then
disappears from `/json` entirely — `findExtensionWorker()` returned null on the second call in
the same session. Waking is done by loading `chrome-extension://<id>/popup.html`; **identification
is still by `chrome.runtime.getManifest().name`.** The URL only decides who to poke.

**Second harness note, and it silently falsified a whole measurement round.** A service worker
cannot `chrome.runtime.sendMessage` to itself — every call returned
`"Could not establish connection. Receiving end does not exist."` The background router is
driveable only from another extension context, so all message-level probes run from
`popup.html` opened as a tab.

**Third harness note, and this one produced a wrong answer before it was caught.** Opening
`popup.html` via `/json/new` makes it **the active tab**, so background.js's
`chrome.tabs.query({active: true, currentWindow: true})` answered about the popup itself:
`detect` returned `url: chrome-extension://…/popup.html`, `scriptable: false`, and the popup
rendered *"This page is browser-restricted"*. Read alone that is a clean-looking "the extension
correctly refuses internal pages" pass — and it measures nothing about page awareness. Fixed by
opening the web page **after** the popup so the web page is the active tab and the popup runs in
a background tab of the same window. Every page-awareness number below is from the corrected
harness.

### 5.3 What is driven so far

Raw output is reproduced in `FINDINGS_P3_EXTENSION_MATRIX.md`. Scripts:
`s1-fab.mjs` (content script / FAB / themes), `s2-popup.mjs` (background router),
`s3-popup-real.mjs` (popup against a real active tab).

### 5.3b A second harness was raised after teardown

Reading my own table back caught two rows marked `LIVE` on sub-claims I had never measured — row 4's
*"literal spans underlined"* and row 7's *"loads for the de-inflected base form"*. Both halves were
relaunched on fresh profiles (`p3ext-app2`, `p3ext-chrome2`), re-paired, and **re-identified by
`getManifest().name`** before anything was read, because a second harness is a second chance to
measure the wrong browser. Both sub-claims then passed on real observables (§4.15 of the findings).

This is the read-back rule doing exactly what it is for: the cost was one relaunch, and the
alternative was two rows asserting more than had been driven.

### 5.4 Instrument failures caught during the run, and what each would have produced

Recorded because in every case the wrong reading was *clean-looking* and would have shipped as a
finding.

| # | The instrument | What it produced | What it actually measured | Fix |
|---|---|---|---|---|
| 1 | `chrome.runtime.sendMessage` from the **service worker** | `"Could not establish connection. Receiving end does not exist."` on every message | Nothing — a worker cannot message itself. Read as a result this says "the whole background router is dead" | Drive from `popup.html` opened as a tab |
| 2 | `popup.html` opened via `/json/new` | `detect` → `scriptable:false`, popup rendered *"This page is browser-restricted"* | The popup was the active tab, so it was describing itself. Reads as "correctly refuses internal pages" — a clean pass measuring nothing | Open the web page **after** the popup so the web page is active |
| 3 | Hooking `speechSynthesis.speak` in the **main world** | `calls: []` after clicking the TTS button | Nothing — the content script is in an isolated world with its own wrapper. **This is exactly a `DEAD` verdict on a working feature** | Poll `speechSynthesis.speaking`, which is the shared browser service: false → **true** → false |
| 4 | Popup drag with the popup **unpinned** | `left/top` unchanged | Nothing — drag is gated on `popupPinned` (`content.js:580-586`). Reads as "drag is dead" | Pin first: 474.5px → 344.5px, 138px → 268px |
| 5 | `#jp-study-popup .rp-tab` selectors after `jp-lookup-selection({text})` | Sentence tab: *"No sentence detected around this word."*, extend/reset buttons absent → `TypeError` | An honest empty state — that entry point has no surrounding block. **A fixture that cannot show the feature** | Use a real shift-hover hit; bounds then move 52 → 73 → 158 → 196 → 52 chars |
| 6 | `offsetParent` as a visibility test for `#fix-connection` | `false` | Also `null` for positioned elements; and the DOM read was left over from an earlier offline reload | `getComputedStyle` + `getBoundingClientRect`: `display:block, visibility:visible`, box **0×0** because the ancestor is `hidden` |
| 7 | `span.jp-study-hl` / `.jp-study-known-tint` selectors | 0 highlights, 0 tint nodes | Wrong element names. Real: `MARK.jp-study-hl` (3) and `span[data-jp-wk]` (106) | Read the class off the source, not off the claim |
| 8 | Wheel close checked via the `hidden` attribute | `hidden:false` after Escape → looked like Escape does nothing | The wheel uses a **class**, not `hidden` | `className`: `"open"` → `""` |
| 9 | `localStorage['clipboard-history']` as the app-side clipboard observable | key absent before **and** after a successful `clipboard.send` — reads as "the extension reports success and nothing lands" | Wrong key. `clipboard-history` is the **IndexedDB** name (`storage.ts:34`); the localStorage key is `jp-clipboard-history` (`:58`) | Correct key: absent → one entry carrying the marker text and `readerMeta` |

Nine instrument failures. **Eight produced a clean-looking negative** — the shape that becomes a
false `DEAD` — and one (#2) produced a clean-looking *pass*, which is worse because nothing about
it invites a second look. **None reached the findings file.**

## 6. Verification results — every claim I was handed, resolved

| # | Claim handed to me | Resolution | Evidence |
|---|---|---|---|
| 1 | The matrix has **35** feature rows, not 47 — "verify the count yourself" | **CONFIRMED — 35** | `awk 'NR>=12 && NR<=46 && /^\|/' EXTENSION_FEATURE_TRUTH_MATRIX.md \| wc -l` → 35 |
| 2 | `FINDINGS_EXTENSION_BRIDGE.md` says the matrix is 47 rows | **CORRECTED** — the figure at `:130` is wrong | same command |
| 3 | Branded Chrome 150 dropped `--load-extension`; use the Playwright build | **CONFIRMED by proxy, not directly tested.** The Playwright build was used and worked; branded Chrome was **not** run, deliberately — the user had 29 real Chrome processes running at the time and the dispatch forbids touching them. So the *positive* half is confirmed and the *negative* half is carried on the dispatch's word |
| 4 | Chromium is at `chromium-1228\chrome-win\chrome.exe` | **CORRECTED** — `chrome-win64\chrome.exe`; `chrome-win` does not exist | `ls …/chrome-win/chrome.exe` → No such file or directory |
| 5 | Identify by `chrome.runtime.getManifest().name`; a component extension has been mistaken for a pass | **CONFIRMED, and it mattered.** Two service workers were listed; the decoy identified itself as **Google Hangouts** v1.4.5 | `cdp-probe.mjs` output, §4 |
| 6 | Expect `GrammarX — Reader Companion`, version `3.2.0` | **CONFIRMED**, exact match to `extension/manifest.json:3-4` | same |
| 7 | `chrome.kill()` does not kill the tree; kill by `ExecutablePath` | **CONFIRMED** — §11; the launch left **12** Chromium processes to kill, while **38** real Chrome processes sat beside them and had to be excluded by exact path | `Get-Process -Name chrome` filtered on `Path` |
| 8 | Never click and assert in one evaluation | **CONFIRMED as necessary.** Every click/assert pair in this run is two round-trips; §5.4 lists **nine** cases where a single-shot or wrongly-aimed read produced a clean false result |
| 9 | Start the app with `npx electron-forge start -- --user-data-dir=…` (doubled `--`) | **CONFIRMED** — the scratch profile was used; `extension-bridge.json` and a 7.8 MB `anki-intervals.json` appeared under `%TEMP%\p3ext-app` |
| 10 | The bridge takes up to ~40 s | **CONFIRMED** — `debug/bridge.json` was present and answering within that window |
| 11 | A fresh profile opens behind a full-viewport telemetry consent gate | **CORRECTED — no gate appeared.** `/consent\|telemetry\|No thanks/i.test(document.body.innerHTML)` → `false`; `document.body.innerText` was the 92-character desktop shell. Nothing was consented to |
| 12 | `/v1/health` is unauthenticated; every mutating route needs a Bearer token | **CONFIRMED** — and it produces a real bug surface: the extension's own `health` handler returns `paired: true` on a wrong token because the route answers regardless. Nothing in the shipped UI calls it (P3-A3) |
| 13 | If a row cannot be driven for want of a paired token, that is `NOT-REACHABLE — requires pairing` | **NOT NEEDED.** Pairing succeeded, so that bucket is empty. The 4 `NOT-REACHABLE` rows have other reasons |
| 14 | Anki writes reach the user's real collection and are not isolated by a scratch profile | **CONFIRMED, concretely.** `anki-intervals.json` reached **7.8 MB** on a fresh profile within three minutes and the popup reported the real `Japanese Focus → JP Study::N2 Vocab`. No write path was driven |
| 15 | The real Electron profile's newest write is `8/2/2026 9:40 AM` and must still be | **CONFIRMED at start and at end** — `8/2/2026 9:40:03 AM`, `Local Storage\leveldb\000110.log`, identical at both checks and after both teardowns. §11 |

## 7. What I created or changed

| Path | What |
|---|---|
| `docs/audit/FINDINGS_P3_EXTENSION_MATRIX.md` | **New.** All 35 rows with verdicts, the tally derived from the table by a command that survives quoting itself, **15** detail sections (§4.1–§4.15), the wave row-schema findings table, 7 corrections owed to 3 other documents, and a raw-evidence appendix that makes the file self-contained |
| `docs/audit/HANDOFF_P3_EXTENSION_MATRIX.md` | **New.** This file |

**Nothing else was written.** `git status` should show exactly two new files under `docs/audit/`
from this run, plus whatever other agents left in the tree — which I did not touch. **No commit was
made**; the dispatch reserves committing to the orchestrator.

`extension/**`, `src/**`, `EXTENSION_FEATURE_TRUTH_MATRIX.md` and `.gitignore` were read heavily and
modified never.

## 8. What I could not verify

This section is not empty, and it should not be.

1. **Three write paths were refused, not failed** — `Save word`, `Save sentence`, and `Create
   card`'s send. Their UI is fully verified; their effect is not. Anyone who wants them driven needs
   either an Anki profile they are willing to dirty, or a build where `saveDestination` can be
   forced to `'app'` *and* proof the app-side queue does not forward.
2. **The dictionary-entry JLPT badge has never been seen.** 43 entries across 8 terms all returned
   `jlpt: []`, so I cannot say whether its "estimate" labelling is right, wrong, or present. A
   *different* badge with the same `rp-badge jlpt` class does render in the Grammar tab against a
   grammar pattern — do not let that one stand in for this one.
3. **Audio recording** — needs a microphone grant; only the menu entries were driven.
4. **The immersion +480 s / 35 s anomaly is unresolved** (§4.7 of the findings). Two readings fit
   and I did not build the two-tab timestamped fixture that would separate them.
5. **The OCR status flip was not bisected.** Two contradictory answers ~1 hour apart from the same
   route on the same unchanged install is what I measured; "warm-up race" is the likely explanation,
   not a proven one.
6. **Branded Chrome was never run**, so the dispatch's central harness claim is carried, not
   re-derived (§6 row 3).
7. **`analyze.selection` / sentence analysis was not driven.** It is registered as a context-menu
   item and a keyboard command, and `/v1/health` advertises `features.sentenceAnalysis: true`, but
   running it would send page text to whatever AI provider the app is configured for. On a fresh
   scratch profile that is probably nothing; "probably" is not good enough to spend the user's
   credits on, so it was left alone. **Not counted as a matrix row** — no row claims it.

## 9. Gates

The change is **two new Markdown files under `docs/audit/`**. No gate can be affected by that, so
`npx vitest run` was deliberately **not** run — the suite cannot observe a new document, and the
totals it prints would be a number I could not attribute to anything I did. (I am also not quoting
the suite size from the skill: a count written into a document is exactly the thing this audit keeps
catching, and I did not measure it.) The three cheap
gates that do walk the repo were run:

| Gate | Command | Result |
|---|---|---|
| i18n catalogs | `node tools/i18n-check.cjs` | **exit 0** |
| Architecture | `node tools/architecture-audit.cjs` | **exit 0** — `Nothing new. 3 known finding(s) still marked pending.` (`duplicate-storage 3 · orphan-module 1 · test-only-module 7`) |
| Carried items | `node docs/migration/tools/audit-carried-items.mjs` | **exit 0** — `OK — every carried reason still says what the record says it says.` |

Baseline for the two counts above is **unknown to this run** — I did not measure them before my
edits, and my edits could not move them. They are reported as totals, not as a delta.

## 10. Defects noticed in code I do not own

All are recorded in `FINDINGS_P3_EXTENSION_MATRIX.md` §5 in the wave row schema and **none was
fixed**. Two are blockers:

- **P3-D1** `extension/content.js` — the page difficulty badge tells the user "No Japanese or
  Chinese text detected on this page" on a page full of Japanese, because the app's `noLists` state
  has no tooltip branch. Shipping UI copy, false, and it points away from the fix.
- **P3-A1** `extension/popup.js` — an item the retry queue **discarded** renders in Recent as
  **"Saved"**, in the same session where the toast says it was discarded. `entry.dropped` is written
  and never read.

Plus P3-D2 (app-side OCR status warm-up), P3-A2 (the panel renders on PDFs where nothing works),
P3-A3 (`type:'health'`, one handler, zero senders), P3-F1 (2 of 4 suggested shortcuts unbound),
P3-F2 (two labels for one clipboard command).

## 11. Cleanup — measured, not asserted

| Step | Result |
|---|---|
| App shut down through **its own** `window.close()`, twice | `{"ok":true,"result":"closing"}` both times; `electron` processes **6 → 0**, then **→ 0** again after the second harness |
| Playwright Chromium killed **by `ExecutablePath` match**, twice | harness 1: **12 killed, 0 remaining**; harness 2: **11 killed, 0 remaining**. The dispatch warned that one launch produced 13 processes and a single kill left twelve — 12 and 11 are the same shape, and matching on the exact path is what made each teardown complete |
| User's real Chrome | **38 before / 38 after** the first teardown, **28** after the second — the user closed windows of their own in between. **Never touched**: every kill was filtered on an exact `Path` equality against the Playwright binary, never on the process name |
| Listeners on 9222 / 18765 / 39273 / 5173 | **none** |
| Scratch dirs | all four removed — `p3ext-chrome`, `p3ext-app`, `p3ext-chrome2`, `p3ext-app2` |
| `debug/bridge.json` | **gone** after both teardowns — the app clears it on a clean exit, so its absence is itself evidence the exit was clean |
| `%APPDATA%\jp-study-app` newest write | **`8/2/2026 9:40:03 AM`**, `Local Storage\leveldb\000110.log` — **byte-for-byte the value recorded at §2 before anything started.** The real profile was never opened |

`git status` at the end shows my two files as untracked under `docs/audit/`, alongside other
agents' work I did not touch (`docs/KNOWN_ISSUES.md`, `docs/audit/DISPATCH_B8_SETTINGS_STATIC.md`,
`docs/audit/RULINGS_2026-08-04.md`, a modified `docs/audit/AUDIT_2026-08.md`, and the
`docs/migration/**` set that was already dirty at session start). **Nothing was committed.**

> **`docs/KNOWN_ISSUES.md` now exists** — created by another run on 2026-08-04, with the location
> agreed with the user, and it is where `jp-dispatch` §6 says found-but-not-fixed defects live.
> **P3-D1** and **P3-A1** belong in it. I did not add them: that file is not in my owned paths and
> two runs appending to one table is how merge conflicts get written. Whoever owns it should lift
> them from §5 of the findings — both rows already carry `file:line` and a re-runnable command,
> which is that file's stated row standard.

## 12. Open questions for the user

1. **`docs/audit/FINDINGS_EXTENSION_BRIDGE.md` carries two stale lines** (`:129` browser-side
   `0 / 1 — NOT ATTEMPTED`, contradicted by §E4 of the same file; `:130` the 47). I did not edit it —
   it is not mine. Someone should.
2. **`EXTENSION_FEATURE_TRUTH_MATRIX.md` has three inaccuracies** (§6 of the findings, rows for
   `:42`, `:25`, `:45`). The context-menu one is the substantive one: the doc claims 6 verbs, lists
   7, and the extension registers 8 clickable items. Do you want the matrix corrected in place, or
   annotated with this run's verdicts?
3. **Two blockers are one-branch fixes each.** Per the dispatch and `honesty-probe` §6 I documented
   rather than fixed. Say the word and they are small.
4. **The immersion counter question (§4.7)** needs a deliberate two-tab experiment. Worth a follow-up
   only if the app's headline immersion number matters to you.
5. **Should any of the three Anki write paths be driven at all?** They are the last unmeasured
   behaviour of consequence in this extension, and driving them permanently dirties a real
   collection that already carries `JP Study::*` residue from earlier sessions. My default was to
   refuse; that is your call, not mine.
