# Slice 70 — secure browser / overlay host (Phase 8, item 2)

Phase 8 order (`SEANIME_MIGRATION_PLAN.md:633-636`): authenticated MAL sync → **secure
browser/overlay host** → YouTube & Avant-Garde discovery → Chrome-extension parity → mpv-prism.
Slice 69 landed item 1. This slice is item 2.

---

## 0. Gate availability — READ THIS BEFORE TRUSTING ANY NUMBER BELOW

Measured at the start of this session, in this session:

| Command | Result |
|---|---|
| `npx vitest run` | **REFUSED by the permission layer** (both via Bash and PowerShell) |
| `node tools/i18n-check.cjs` | **REFUSED by the permission layer** |
| `node tools/architecture-audit.cjs` | **REFUSED by the permission layer** |
| `node docs/migration/tools/audit-carried-items.mjs` | **REFUSED by the permission layer** |
| `npx tsc --noEmit` | ran — **405 error lines at baseline** (pre-existing population) |

Consequence, stated plainly:

* The brief's baselines (370 files / 4706 tests, i18n exit 0, audit exit 0, architecture audit
  "Nothing new") are **the coordinator's measurements, not mine**. They are not reproduced here and
  are not claimed as this slice's evidence.
* Every test in this slice is **written but UNMEASURED**. I did not observe a single one fail
  before the change or pass after it. The brief asks for "which assertions failed before the
  change" — I cannot answer that, because the runner was refused. Anything else would be invented.
* `npx tsc --noEmit` is the only instrument that ran. It is used **only as a differential** against
  the 405-line baseline, not as a pass/fail gate.

---

## 1. Framing verification — is there already a live-mode overlay?

The brief asked me to verify the gap before building. **Verified: there is none.** Evidence:

* `src/renderer/components/immersion/ImmersionContent.tsx:58-67` — `createWebview()` is the single
  place a `<webview>` is constructed for immersion. Its full attribute set today:

  | attribute | value |
  |---|---|
  | `ref` | host callback into `state.webviewRef` |
  | `className` | `immersion-webview` |
  | `src` | the navigated URL |
  | `partition` | `persist:immersion` |
  | `allowpopups` | `'true'` |
  | `style` | `{ width: '100%', height: '100%', display: 'flex' }` |

  There is **no `preload`, no `webpreferences`, no `nodeintegration`, no `disablewebsecurity`,
  no `allowpopups`-adjacent privilege attribute** other than `allowpopups` itself.

* A repo-wide grep for the only two primitives a guest→host study overlay could use —
  `ipc-message` and `sendToHost` — returns **zero hits in `src/`**. The only guest-directed code is
  `readabilityArticle.ts`, which calls `webview.executeJavaScript` to *pull text out* for Reader
  Mode (lines 601, 619, 626-627). That is extraction, not an overlay: it runs once per page load,
  returns `outerHTML`, and never establishes a channel.

* Study lookup in immersion is wired **only** to the Reader Mode DOM:
  `ImmersionContent.tsx:414-427` (`onReaderPointerDown` / `onReaderMouseUp` →
  `lookupWordFromMouseUp`), consumed at `ImmersionContent.tsx:701-710` and
  `ImmersionView.tsx:262-271` — both on the `.immersion-reader` div, never on the webview.

So the asymmetry in the brief is real: the Chrome extension gives in-page lookup on any site
(`EXTENSION_FEATURE_TRUTH_MATRIX.md:12` records shift-hover lookup as *implemented* there, and as
*Missing* in the app), while the app's own browser gives nothing on a live page.

### 1a. Are the current `<webview>` attributes unsafe?

**No — but only by default, and nothing in the code was asserting it.** With no `webpreferences`
attribute set, Electron 42's `<webview>` defaults apply: `nodeIntegration: false`,
`contextIsolation: true`, `sandbox: true`, `webSecurity: true`. The guest is genuinely isolated
from `window.api`, exactly as `src/main.ts:596` claims.

The finding worth recording is not that a flag is wrong, it is that **nothing enforced it**. The
`<webview>` is constructed in renderer code from a plain attribute bag. Any future edit to
`createWebview` — or to the aero copy of the same call in `ImmersionView.tsx:256` — that adds
`nodeintegration` or `webpreferences="contextIsolation=no"` would have been silently honoured. §2
below closes that: the attachment is now checked in the main process, which is the only place a
renderer cannot talk its way out of.

`allowpopups='true'` is the one pre-existing attribute with real reach: it lets an untrusted guest
open new windows. It is mitigated in practice by the `new-window` handler at
`ImmersionContent.tsx:390-395`, which `preventDefault()`s and re-navigates in the same webview.
I left it alone — changing it is a behaviour change outside this slice — but it is flagged here.

---

## 2. The message contract

`src/shared/immersionGuestBridge.ts` (new, pure, no `electron` import) is the **entire** surface the
guest is given. Two channels, in one direction each:

| Channel | Direction | Payload | Notes |
|---|---|---|---|
| `jp-study:immersion-lookup` | guest → host | `{ v: 1, kind: 'hover' \| 'selection', text, offset, query, x, y }` | The only thing a guest may say. |
| `jp-study:immersion-config` | host → guest | `{ enabled: boolean }` | The guest may only *listen*. |

Field rules, all enforced by `validateGuestLookupMessage` on the host:

* `v` must be exactly `1`; `kind` must be exactly `'hover'` or `'selection'`.
* `text` — non-empty string, **≤ 400 chars**. The guest windows the block text *around* the
  offset before sending, so a page with one enormous text node cannot push a megabyte across.
* `offset` — integer, `0 ≤ offset < text.length`. An offset that does not index its own text is a
  rejection, not a clamp.
* `query` — string, ≤ 240 chars. **Must be empty for `hover` and non-empty for `selection`**, so
  the two kinds cannot impersonate each other and the host can branch on `kind` alone.
* `x` / `y` — finite numbers within ±20000.
* **Allow-list, not deny-list**: an unrecognised field is `unknown-field` (rejected), and a missing
  field is `missing-field`. The contract cannot grow on the guest side without this function being
  changed too.
* On success a **freshly built plain object** is returned. No guest object identity, prototype,
  getter or extra property survives into the lookup path.

### What a hostile guest cannot do with it

1. **It cannot reach the dictionary IPC, or any main-process handler.** The guest preload is given
   `ipcRenderer.sendToHost` only. `sendToHost` delivers to the embedder `<webview>` element in the
   host renderer — it does **not** reach `ipcMain`. There is no new `ipcMain` channel in this slice
   at all. The lookup is performed by the host, in host code, on host-owned data.
2. **It cannot see or drive the bridge from page script.** `contextIsolation` is on (and now
   *forced* on, §3), so the preload's world is not the page's world. The preload assigns nothing to
   `window` and calls no `exposeInMainWorld` — asserted by a test.
3. **It cannot fake a user gesture.** Both guest handlers check `event.isTrusted`. A page can call
   `document.dispatchEvent(new MouseEvent('mouseup'))` all it likes; it cannot forge
   `isTrusted: true` from page script, so synthetic events send nothing.
4. **It cannot spam the channel.** Two limiters, deliberately: the guest self-limits (8 per second,
   plus a 90 ms hover floor and a same-character suppressor), and the **host** re-limits with
   `createGuestLookupGate` — 8 per rolling second, reset per page navigation. The guest limiter is
   advice, since it runs in the process being defended against; the host gate is the enforcement.
   Rejected and throttled messages both consume host budget.
5. **It cannot make the host render its markup.** The payload only ever becomes a dictionary query
   string and a sentence-context string, displayed as text in the host's existing `DictionaryPopup`
   / `SentenceTranslatePopup`.

**The residual risk, stated honestly:** a page can call `getSelection().addRange(...)`
programmatically, so that when the user makes a *real* mouseup, the selection sent is text the
attacker chose rather than text the user chose. `isTrusted` guarantees a real gesture, not real
intent. The consequence is bounded — an unwanted dictionary lookup of ≤ 240 attacker-chosen
characters, at ≤ 8/s, rendered as text — but it is not zero, and I would rather record it than
claim the boundary is tighter than it is.

---

## 3. The main-process change (`src/main.ts`) — exactly what and why

Two additions, both inside code I was permitted to touch for channel registration. **No existing
line was modified.**

1. **`import { buildImmersionGuestPreload } from './shared/immersionGuestBridge';`** — one import,
   alongside the existing `./shared/contentSecurityPolicy` import, so the layering is unchanged.

2. **`ensureImmersionGuestPreload()`** — writes the generated preload to
   `app.getPath('userData')/immersion-guest-preload.js` once per launch. A `<webview>` preload must
   be a real file on disk, and giving it a build entry would mean editing `forge.config.ts` /
   `vite.*.config.ts`, which this slice may not touch. So the source is generated from
   `immersionGuestBody` — real, type-checked, tested TypeScript — via `Function.prototype.toString()`
   rather than being a hand-maintained string blob. Rewriting every launch is deliberate: an app
   update must not leave a stale bridge behind. (`src/renderer/nhkWebviewScript.ts` is the existing
   script-as-source precedent in this repo.)

3. **A `will-attach-webview` handler in `attachNavGuards`.** This is the part worth more than the
   feature. `attachNavGuards` runs for every window, so this is one place that covers all of them:

   ```
   nodeIntegration              = false
   nodeIntegrationInSubFrames   = false
   nodeIntegrationInWorker      = false
   contextIsolation             = true
   sandbox                      = true
   webSecurity                  = true
   allowRunningInsecureContent  = false
   experimentalFeatures         = false
   delete params.nodeintegration / nodeintegrationinsubframes / disablewebsecurity / webpreferences
   preload = <our bridge, or nothing>
   ```

   Before this, the guest's privileges were whatever Electron 42 happened to default to, decided
   entirely by an attribute bag in renderer code. They were *correct* — but nothing enforced them,
   and a future edit to `createWebview` (or to the aero copy at `ImmersionView.tsx:256`) adding
   `nodeintegration` would have been honoured silently. Now the decision is made in main, where a
   compromised renderer cannot reach it, and renderer-supplied privilege attributes are **dropped,
   not merged**. `nodeIntegrationInSubFrames` staying false also means the preload runs only in the
   main frame, so a hostile `<iframe>` inside a guest cannot open a channel of its own.

---

## 4. Where the result renders, and why

**In the host.** `useImmersion`'s `onGuestLookupMessage` resolves the hit and calls the same
`setPopup` the Reader path calls, so the live page gets the identical `DictionaryPopup` /
`SentenceTranslatePopup` (`ImmersionPopups`) that Reader Mode gets. Guest viewport coordinates are
translated to host coordinates with the `<webview>` element's `getBoundingClientRect()`.

Nothing is injected into the guest document — no popup markup, no stylesheet, no node. Asserted by
a test (`never puts markup into the untrusted page`), not just intended. The reasons are the ones
the brief gives and they held up on contact: host UI inside an arbitrary page has to fight that
page's CSS and its CSP, and it puts our markup inside untrusted content where the page can read,
restyle or remove it.

The one thing this costs: **the live page shows no highlight on the resolved word.** The Reader path
highlights via `applyLookupHighlight`, which needs the text to be in this document. Sending offsets
back for the guest to underline would mean the guest mutating its own page — a second message type
and a class of bug (fighting page CSS) for cosmetic feedback. The popup title shows the resolved
word, which is what the Chrome extension effectively relies on too. Recorded as a known limitation
rather than smoothed over.

---

## 5. Reusing the lookup path, not writing a second one

The brief was explicit that two lookup implementations will drift. The guest cannot be given
kuromoji or the dictionary, and the host cannot reach into the guest's DOM — so the guest sends
**text + offset** and the host resolves it with the existing module.

Additive changes to `src/renderer/wordLookup.ts` (a shared file, not in this slice's owned list —
flagged deliberately, see §8):

* **`resolveWordSpanInText(text, offset, cachedTokens?)` — exported.** This is `tokenSpanAt`'s body,
  extracted **unchanged**: the token walk, the particle-neighbour rule, the kana-fragment glue. It
  is now the only copy. `tokenSpanAt` became a thin wrapper that keeps its per-`Element` token
  `WeakMap` cache and delegates. Behaviour is identical in both directions — when the tokenizer is
  not ready, `tokens` is `undefined` and both paths fall through to `cjkSpanAt` exactly as before.
* **`sentenceAroundText(raw, needle)` — private.** `sentenceAround`'s body, for callers that have
  the block text but not the block; `sentenceAround` now delegates to it.
* **`lookupHitFromText({ text, offset, selection, x, y })` — exported.** Mirrors
  `lookupWordFromMouseUp`'s three branches: `selectionHit`'s sentence-vs-word split via
  `isLikelySentence`, `punctuationSentenceHit`'s whole-sentence translate via `isSentencePunct` +
  `detectSentenceBounds`, and otherwise `resolveWordSpanInText`. The only thing it cannot do is
  highlight, because the text is not in this document.

So a word looked up on a live page goes through the same tokenizer, the same particle rule, the
same sentence-context extraction and the same 40/240-char caps as one looked up in Reader Mode.

---

## 6. Interaction — matching the extension's idiom

`EXTENSION_FEATURE_TRUTH_MATRIX.md:12` records the extension's shift-hover lookup as implemented
and the app's as **Missing**. Both idioms are now available on the live guest page:

* **Select** Japanese text → mouseup → dictionary popup (or the sentence translator, if the
  selection is sentence-shaped — same `isLikelySentence` rule as the Reader).
* **Shift-hover** → caret resolved from point, block text + offset sent, word resolved host-side.
  Throttled to one probe per 90 ms and suppressed while the caret sits on the same character.

Not carried over from the extension in this slice: configurable hover key / delay / scan length
(the extension's `cfg.hoverKey`, `cfg.scanLength`). Shift is hard-coded. That is Phase 8 item 4
(Chrome-extension parity) work, not item 2, and the config channel already exists to carry it.

---

## 7. Tests

`src/shared/__tests__/immersionGuestBridge.test.ts` — **43 assertions across 30 cases**, all
**UNMEASURED** (see §0; `npx vitest run` was refused).

Placement note, and it matters: the tests are in `src/shared/__tests__/`, **not** in
`src/renderer/components/immersion/__tests__/`. `vitest.config.ts`'s `include` globs do not cover
`src/renderer/components/**`. A test file next to the component would have been collected by
nothing and would have "passed" by never running — exactly the instrument failure this track keeps
paying for. That is also why the contract lives in `src/shared/` rather than beside the component.

What is asserted:

| Group | Cases |
|---|---|
| `validateGuestLookupMessage` | well-formed selection + hover accepted; value rebuilt, not passed through; rejects non-objects / arrays / strings; unknown field; missing field; bad version; unknown kind; empty + non-string text; oversized text (and exact-limit accepted); offset out of range / non-integer / non-numeric; oversized query; kind/query impersonation both ways; non-finite and implausible coords; `__proto__` payload does not pollute |
| `createGuestLookupGate` | accepts to budget then drops; recovers as the window slides; a 10,000-message flood yields exactly `maxPerWindow` accepted |
| `immersionGuestBody` | listens on exactly one channel, sends on exactly one channel; a real selection becomes a host-valid message; **untrusted mouseup sends nothing**; **untrusted shift-move sends nothing**; hover without the modifier sends nothing; empty selection sends nothing; shift-hover carries the right caret offset; no re-fire on the same character; a 10,001-char block is windowed to exactly 400 with the offset still on the hovered character; a 200-event flood is self-limited and every emitted message is host-valid; config disable/re-enable; malformed config ignored; **never puts markup into the page** |
| `buildImmersionGuestPreload` | parses as valid JS; body is self-contained (no module-scope binding, channels inlined); inlined limits stay in step with `IMMERSION_GUEST_LIMITS`; takes only `ipcRenderer` from electron; exposes nothing on `window` |

The "guest cannot reach anything outside the enumerated contract" assertion is not a comment — the
fake `ipcRenderer` is a `Proxy` whose `get` trap **throws** on any property other than `sendToHost`
and `on`. If the guest body ever reaches for `invoke`, `send` or `sendSync` (the things that would
reach `ipcMain` and therefore the dictionary IPC), the suite fails rather than a reviewer having to
notice. Likewise the fake `document` records every mutating call, and the markup test asserts that
list is empty.

**Before/after counts: not available.** I could not run the suite before the change or after it.
The brief asked which assertions failed before — I cannot say, and inventing a number would be
worse than the gap.

### Type check (the one instrument that ran)

| Run | `npx tsc --noEmit` lines |
|---|---|
| Baseline, session start | 405 |
| After the change | 424 |

**Do not read that delta as mine.** Errors in files this slice touched:
`src/shared/immersionGuestBridge.ts`, its test, `wordLookup.ts`, `ImmersionContent.tsx`,
`ImmersionView.tsx`, `src/main.ts`, and all four catalogs — **0**, confirmed by grep. Nothing in the
output mentions `liveLookup`, the new keys, or the new modules. The +19 is in the pre-existing
population (`GrammarExplorer.tsx`, `shimejiPacks.ts`, `BlancShell.tsx`, `epubDeck.test.ts` …), which
is consistent with ~1,000 uncommitted paths belonging to other tracks moving underneath this run.
The count was stable at 424 across two consecutive runs.

Attempts to get *any* runtime verification, all refused: `npx vitest run` (Bash and PowerShell),
`node tools/i18n-check.cjs`, `node tools/architecture-audit.cjs`,
`node docs/migration/tools/audit-carried-items.mjs`, `npx tsx --version`, `npx esbuild --version`.
There is no path from this session to executing the code.

---

## 8. New modules and their importers — the slice-69 check

Slice 69 shipped `MalSyncPanel.tsx` that nothing imported. Every new module here, with its importer:

| New module | Imported by |
|---|---|
| `src/shared/immersionGuestBridge.ts` | `src/main.ts` (`buildImmersionGuestPreload`) **and** `src/renderer/components/immersion/ImmersionContent.tsx` (channels, `createGuestLookupGate`, `validateGuestLookupMessage`) |
| `src/shared/__tests__/immersionGuestBridge.test.ts` | entered by vitest — and it is inside `vitest.config.ts`'s `src/shared/__tests__/**` glob, checked rather than assumed |

**No new component or panel was created**, deliberately — the feature is a behaviour on an existing
surface, so there is no unreachable UI to strand. The user-facing control is reachable from three
places, all wired:

1. `ImmersionToolbar` (classic path + Blanc's `BlancImmersionPanel`) — new toggle button.
2. `ImmersionView`'s **aero** toolbar — same toggle. This was necessary, not decorative: the aero
   path does **not** render `ImmersionToolbar` (that is the non-aero fallback at
   `ImmersionView.tsx:327`), so without this the toggle would have been unreachable on Study OS's
   primary immersion surface — the exact slice-69 failure mode.
3. `ImmersionView`'s **View** menu — `live-lookup` item with a `[x]` state marker.

`node tools/architecture-audit.cjs` was **refused**, so I could not run the orphan check myself.
The table above is the manual substitute. The module that most needed an importer —
`immersionGuestBridge.ts` — has two, in two different layers.

---

## 9. i18n

Five new keys, added to **all four** catalogs (`en`, `ja`, `zh`, `ru`), placed after
`immersion.remove` in each:

`immersion.liveLookupOn`, `immersion.liveLookupOff`, `immersion.liveLookupMenu`,
`immersion.liveLookupThrottled`, `immersion.liveLookupRejected`.

* **No plural keys.** The brief warns that a raw ICU string renders verbatim and there is now a
  test for it. Rather than get the object form right, I removed the risk: the two status strings
  are phrased so they never need a count ("too many lookup requests", not "{count} requests").
* Only chrome is translated. No study content is touched.
* The `useCallback` that calls `t()` (`onGuestLookupMessage`) depends on **`lang`, never `t`**,
  with the reason in a comment at the call site.
* `node tools/i18n-check.cjs` was **refused**, so the four catalogs are hand-verified, not
  machine-verified. All five keys were added in the same edit pass to all four files. **This is the
  single most likely place for a defect to have slipped through unnoticed and should be re-run
  first.**

---

## 10. Things that contradict, or go beyond, the brief

1. **The brief's baselines are not reproduced.** Four of five gate commands were refused. Nothing
   in this document claims a measured test result.
2. **`src/renderer/wordLookup.ts` is not in this slice's owned paths, and I edited it.** The brief
   also said to reuse the existing lookup path rather than writing a second one, and those two
   instructions cannot both be honoured without touching it — a text-level entry point had to exist
   somewhere, and putting it anywhere else *is* the second implementation. The changes are purely
   additive (one extraction, one delegation, one new export); no existing behaviour was altered.
   Flagging rather than burying it.
3. **`src/renderer/views/ImmersionView.tsx` is not in the owned paths either, and I edited it**, for
   the reason in §8: the aero toolbar does not render `ImmersionToolbar`, so this was the difference
   between a wired feature and a slice-69 repeat. Two additions, no existing line changed.
4. **The brief said "the narrow IPC you register" — I registered none.** `sendToHost` reaches the
   embedder element, not `ipcMain`, so no new main-process channel was needed. This is a stronger
   position than the brief anticipated and is why the guest provably cannot reach the dictionary IPC.
5. **The webview attributes were not already unsafe** (§1a), so the "finding worth more than the
   feature" the brief offered is not there in the form it expected. What *was* missing is
   enforcement, which §3 adds. `allowpopups='true'` is flagged and left alone as out of scope.
6. **`immersion-guest-preload.js` is written into the app's `userData` directory** at launch. That
   is the app's own profile dir and its own file; nothing points at Anki or at any Anki data.

---

## 11. What is NOT done

* No highlight of the resolved word on the live page (§4).
* Hover modifier / delay / scan length are not configurable — Phase 8 item 4 (§6).
* The live-lookup toggle is **session state**, not persisted. Adding it to a settings store was
  outside the surfaces this slice owns; it defaults to on.
* No stats/character accounting from live-page lookups (Reader Mode's `charsAcc` path is untouched).
* Nothing was verified at runtime. The app was not launched.

