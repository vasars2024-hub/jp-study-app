# Chrome extension — the app-side contract, driven live

**Run:** 2026-08-04 06:52 by the orchestrator, fresh scratch profile. App shut down cleanly;
`%APPDATA%\jp-study-app` never opened.

**Scope split, deliberately.** The extension has two halves: the app-side server the extension
talks to, and the browser-side load. This run settles the **app-side half**, which is
independently verifiable and decisive — if the app does not answer, nothing the extension does can
work. The browser-side half needs CDP orchestration and is left for a budgeted agent.

---

## E1 — The extension server is `LIVE`

| check | result |
|---|---|
| Listening | **`127.0.0.1:18765`** (loopback only, PID 23920) |
| `GET /v1/health` | **HTTP 200** |
| Contract version | 1 |
| Commands exposed | **20** |
| Queue kinds | **10** |
| `features.sentenceAnalysis` | `true` |

Commands: `lookup.selection · save.word · save.sentence · card.create · capture.page · capture.ocr
· capture.audio.record · capture.audio.save · capture.manga · media.download · clipboard.send ·
translate.selection · grammar.match · reader.theme · reader.highlight · reader.knownTint ·
tabs.picker · app.open · settings.special · wheel.more`

Queue kinds: `inbox · mine · capture · playlist · video · download · clipboard · audio-save ·
manga-import · immersion`

## E2 — Security posture: **sound**, and worth stating as a positive

A local HTTP server exposing 20 commands including `card.create`, `capture.ocr` and
`media.download` is exactly the kind of surface a publication audit should be suspicious of. It
holds up:

| control | evidence |
|---|---|
| Loopback bind only | `extensionServer.ts:3`, and `:966` explicitly rejects any `remoteAddress` that is not `127.0.0.1` / `::1` / `::ffff:127.0.0.1` |
| **Bearer token on every mutating route** | `:568-570` → `401 Unauthorized` without it |
| Token strength | `crypto.randomBytes(24)` hex (`:403`, re-rolled at `:437`) |
| **Token encrypted at rest** | `safeStorage.encryptString` when available (`:370-372`) |
| Pairing model | shared secret shown to the user in Settings (`:359`) |
| CORS | origin allowlist via `isAllowedExtensionOrigin` (`:443-449`) |

**One observation, not a defect:** `/v1/health` answers **unauthenticated** and discloses the full
command and queue contract. That is deliberate — it is the discovery endpoint pairing depends on —
and it leaks capability names, not capability. Recorded so a reader does not rediscover it as a
finding.

**A note on the CORS fallback** (`:446`): when the origin is not allowlisted the server sends
`Access-Control-Allow-Origin: *`. That is defensible here precisely *because* mutating routes are
token-gated — CORS does not protect a bearer-authenticated endpoint, and browsers reject `*`
alongside credentials. It would be a real problem only if the token gate were removed.

## E3 — Mirror parity holds

`extension/` vs the bundled mirror `src/main/chrome-extension/`: **13 files, 0 mismatches**
(SHA-256, re-derived this run).

This is worth re-asserting rather than assuming, because **`npm run package` runs
`sync-extension-mirror.cjs`, which can write into `src/main/chrome-extension/` as a build side
effect.** The mirror is a thing that can silently drift; it has not.

## E4 — The browser-side half: **DRIVEN, and `LIVE`**

*(Originally filed as not-attempted; completed in the same session. The original reasoning is kept
below because its trap list is what made the run succeed.)*

Driven against `%LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe` with
`--load-extension` + `--disable-extensions-except`, profile in the **OS temp dir**, over CDP on
port 9222.

**No dependency was installed.** Node 24 ships a native `WebSocket`, so a ~40-line CDP client in
the scratchpad was enough. Adding `ws` or Playwright to the repo to audit the repo would have
dirtied the tree it was measuring.

| Check | Result |
|---|---|
| Service worker registers | **PASS** — `chrome-extension://nimngppppgpldedpaepkpobiebicmcba/background.js` |
| **Identified by `chrome.runtime.getManifest().name`** | **`GrammarX — Reader Companion` v3.2.0** — exact match to `extension/manifest.json` |
| Content script injects on a real page | **PASS** — `https://example.com/`, `#jp-study-fab` present, **4** `jp-study*` nodes: `jp-study-fab`, `jp-study-level-badge`, `jp-study-comp-badge`, `jp-study-fab-status` |

**The identification step is the point, not a formality.** The CDP target list showed **two**
service workers — ours and `chrome-extension://nkeimhogjdpnpccoofpliimaahmaaome/thunk.js`, a Chrome
component extension. Reasoning from the URL alone would have been inference; the record says a
component extension has already been reported as a pass once in this project. Evaluating
`getManifest().name` inside the worker is what turns it into identification.

### The three harness traps, as encountered

1. **Profile in the OS temp dir** — honoured. A profile under the Vite-watched repo kills the dev
   server with `EBUSY` on `Network/Cookies`.
2. **`chrome.kill()` does not kill the tree** — confirmed concretely: **13** Playwright Chromium
   processes were alive. They were terminated by matching `ExecutablePath` against the Playwright
   binary, which left the user's **20 real Chrome processes untouched**. Port 9222 released;
   scratch profile removed.
3. **Identify by manifest name** — done, and it mattered (see above).

## E4-original — prerequisite confirmed, not driven

`%LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe` is **present**.

That build is required, not preferred: **branded Chrome 150 removed `--load-extension` entirely**,
and neither `--disable-features=DisableLoadExtensionCommandLineSwitch` nor
`--enable-unsafe-extension-debugging` restores it. A verification run against branded Chrome
reports "no `chrome-extension://` target, no content script" **on a completely healthy
extension** — a false negative of exactly the shape this audit keeps finding, and one that has
already fooled a prior run of this same harness.

**Not attempted here.** Driving it needs CDP: service-worker target registration, content-script
injection on a real page, and the corner-panel render. Three harness traps are on record for it and
should be carried into that run:

1. Put the Chromium profile in the **OS temp dir** — a profile under the Vite-watched repo kills
   the dev server with `EBUSY` on `Network/Cookies`.
2. **`chrome.kill()` does not kill the browser tree**; a leftover instance holds port 9222 and the
   next run silently measures the *previous* browser.
3. **Identify the extension by `chrome.runtime.getManifest().name`** — Chrome's own component
   extensions expose `…/background.html` targets and one was previously reported as a pass.

## Coverage

| Area | visited / enumerated |
|---|---|
| App-side server endpoints | `/v1/health` 1 / 1 driven; 20 commands enumerated, **0 driven** |
| Mirror files | 13 / 13 |
| Browser-side load | **0 / 1 — NOT ATTEMPTED** |
| 47-row feature truth matrix | **0 / 47 — NOT ATTEMPTED** |

**No command was executed against the server.** Every one of the 20 mutates something — cards,
captures, downloads, clipboard — and several would reach the user's real Anki collection. Their
existence is enumerated; their behaviour is unverified, and that is a deliberate refusal rather
than an omission.
