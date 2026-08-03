# Slice 74 — Phase 8 item 4: Chrome-extension parity

**Date:** 2026-08-03 · **Branch:** `grammarx/phase-1-5`

> Written incrementally, as the work happened. Sections appear in the order they
> were established, not in order of importance.

## 0. The spec, read before deciding the task

`docs/migration/FEATURE_PARITY_LEDGER.md:106-110` is the authority:

> **Deliberately deferred (retained, not dropped)**
> 31 Study-Mode opportunities · §12 YouTube · authenticated MAL sync · secure browser/overlay ·
> **Chrome-extension parity** · mpv-prism native player. *Their identities and events must exist in
> the shared contracts from Phase 2 so promotion later is additive.*

The requirement is **not** "port every extension feature into the app". It is that the extension's
**identities** and **events** are *nameable from the shared contracts*, so that a later app-side
promotion is an addition rather than a rewrite. Everything below is measured against that sentence.

## 1. Correction to the brief: doc paths

The brief cites `docs/migration/EXTENSION_FEATURE_TRUTH_MATRIX.md`, `docs/migration/EXTENSION_COMMAND_MODEL.md`
and `docs/migration/EXTENSION_AUDIT_REPORT.md`. **None of those exist at those paths.** All the
`EXTENSION_*.md` docs live at the **repository root**:

- `EXTENSION_FEATURE_TRUTH_MATRIX.md` (root) — 36 feature rows, verified present
- `EXTENSION_COMMAND_MODEL.md` (root)
- `EXTENSION_AUDIT_REPORT.md` (root)

Confirmed by `Glob **/EXTENSION_*` → all matches at root; `ls docs/migration/` contains no
`EXTENSION_*` file. Not a blocker, recorded so the next slice does not re-hunt them.

## 2. Structural fact the brief does not mention: the extension is mirrored

`extension/` is the source of truth. `src/main/chrome-extension/` is a **byte-identical mirror**
consumed by the packaged build via Vite `?raw` imports.

- `tools/sync-extension-mirror.cjs:11` — copies `extension/` → `src/main/chrome-extension/`
- `tools/package-app.cjs:32` — runs that sync as a packaging step
- `tools/extension-feature-check.cjs:116-141` — fails if the mirror drifts

Verified identical on the current tree: `diff -rq extension src/main/chrome-extension` produced
**no output**.

**Consequence for the ownership fence:** I own `extension/**`. Any edit there makes
`src/main/chrome-extension/**` drift until the sync tool is run. The mirror is *generated*, so
regenerating it is part of editing `extension/`, not an incursion into someone else's file. See §7
for what I actually did.

## 3. Instrument error found and discarded (recorded because this track pays for these)

A regex scan of `/v1/[a-zA-Z0-9/_-]+` over the extension sources reported that the extension calls
**`/v1/sentence-analysis-v2`**, a route the server does not handle — an apparent live 404 bug.

**It is not a bug. It is a comment.** `extension/background.js:62` reads:

```
 * `/v1/sentence-analysis-v2` or `-batch` route, so a 404 from a genuinely missing
```

…inside the docblock explaining why `APP_UPDATE_PATHS` is anchored. The scan matched prose. Caught
by reading the line rather than trusting the match. **No route defect exists here** — do not let a
future scan re-raise it.

## 4. THE GAP TABLE

Method: for each feature row in `EXTENSION_FEATURE_TRUTH_MATRIX.md`, locate (a) its **identity** —
the command id the extension dispatches on — and (b) its **event** — the retry-queue kind and/or
bridge route it produces; then ask whether that identity/event is **named in a non-test module under
`src/shared/**`**.

`P` = parity gap (identity/event absent from shared contracts). `D` = deferred promotion (contract
present, app-side UI absent — explicitly permitted by the ledger).

| # | Feature (truth matrix) | Identity (command id) | Event (queue kind / route) | Named in `src/shared/**`? | Class |
|---|---|---|---|---|---|
| 1 | Shift-hover lookup | `lookup.selection` `extension/shared.js:274` | `/v1/lookup` `extensionServer.ts:1626` | **No** | **P** |
| 2 | Dictionary popup | `lookup.selection` `extension/shared.js:274` | `/v1/lookup` `extensionServer.ts:1626` | **No** | **P** |
| 3 | Sentence detection | `lookup.selection` (Sentence tab) | `/v1/sentence-analysis` `extensionServer.ts:1671` | partial — `sentenceBounds.ts`, `sentenceAnalysisCore.ts` exist as *logic*, but no route/identity name | **P** |
| 4 | Grammar analysis | `grammar.match` `extension/shared.js:394` | `/v1/grammar-match` `extensionServer.ts:1518` | **No** (`grammarPatternSurface.ts` is logic, not identity) | **P** |
| 5 | Kanji information | `lookup.selection` (Kanji tab) | `/v1/lookup` `extensionServer.ts:1626` | **No** | **P** |
| 6 | Examples | `lookup.selection` (Examples tab) | `/v1/examples` `extensionServer.ts:1797` | **No** | **P** |
| 7 | Known-word status | — (popup control) | `/v1/known-level` `:1481`, `/v1/known-levels` `:1463` | **No** | **P** |
| 8 | Pitch / freq / JLPT badges | — (popup render) | via `/v1/lookup` | **No** | **P** |
| 9 | Audio (TTS) | — (page-side `speechSynthesis`) | none (no bridge event) | n/a — no event to contract | — |
| 10 | Mine word | `save.word` `extension/shared.js:284` | kind `mine` → `/v1/mine` `bg.js:215` / `:1180` | **No** | **P** |
| 11 | Mine sentence | `save.sentence` `extension/shared.js:294` | kind `mine` → `/v1/mine` | **No** | **P** |
| 12 | Add to Anki / create card | `card.create` `extension/shared.js:304` | kind `mine` (forceAnki) → `/v1/mine` | **No** | **P** |
| 13 | Card field editing | — (scoped out; preview edits sent text only) | none | n/a — deliberately not a capability | — |
| 14 | Capture page / inbox | `capture.page` `extension/shared.js:314` | kind `inbox` → `/v1/inbox` `bg.js:214` / `:1157`; kind `capture` → `/v1/capture` `:1201` | **No** | **P** |
| 15 | YouTube download | `media.download` `extension/shared.js:364` | kind `download` → `/v1/download` `bg.js:218` / `:1233` | **No** | **P** |
| 16 | YouTube metadata save | `capture.page` (YT branch) | kind `video` → `/v1/video` `bg.js:217` / `:1970`; kind `playlist` → `/v1/playlist` `bg.js:216` / `:1934` | **No** | **P** |
| 17 | Long-strip / manga import | `capture.manga` `extension/shared.js:354` | kind `manga-import` → `/v1/manga-import` `bg.js:221` / `:1220` | **No** | **P** |
| 18 | OCR | `capture.ocr` `extension/shared.js:324` | `/v1/ocr` `:1824`, `/v1/ocr/status` `:1100` | **No** | **P** |
| 19 | Audio record | `capture.audio.record` `extension/shared.js:334` | none (page-side MediaRecorder) | n/a page-side | — |
| 20 | Audio save | `capture.audio.save` `extension/shared.js:344` | kind `audio-save` → `/v1/audio/save` `bg.js:220` / `:1356` | **No** | **P** |
| 21 | Clipboard send | `clipboard.send` `extension/shared.js:374` | kind `clipboard` → `/v1/clipboard` `bg.js:219` / `:1375`,`:1448` | **No** | **P** |
| 22 | Radial wheel | `wheel.more` `extension/shared.js:464` + slot layout | none (dispatch shell) | **No** | **P** |
| 23 | Bulk tab picker / reading list | `tabs.picker` `extension/shared.js:434` | fans out to `inbox`/`download` kinds | **No** | **P** |
| 24 | Page level badge | — | `/v1/level-estimate` `:1608` | logic in `levelEstimate.ts`, `pageLevelDetect.ts`; **route/identity not named** | **P** |
| 25 | Comprehensibility % | — | `/v1/comprehensibility` `:1504` | logic in `comprehensibility.ts`; route not named | **P** |
| 26 | Category · profile badge | — | `/v1/page-context` `:1033`, `/v1/page-kind` `:1011` | **Yes** — `extensionCapture.ts:8-21` (`ExtensionPageKind`, `ExtensionContentCategory`, `ExtensionMineMode`) | **D** |
| 27 | Destination badge (removed) | — | `/v1/mine-info` `:1121` | **No** | **P** |
| 28 | Page themes / highlight / tint | `reader.theme` `:404`, `reader.highlight` `:414`, `reader.knownTint` `:424` | none (page-side CSS) | **No** | **P** |
| 29 | Immersion logging | — (Advanced toggle) | kind `immersion` → `/v1/immersion/visit` `bg.js:222` / `:1532` | **No** (`immersion.ts` is app-side logic, does not name the kind/route) | **P** |
| 30 | Retry queue + badge | — | the 10 kinds themselves, `bg.js:213-223` | **No** | **P** |
| 31 | Pairing | — | `/v1/health` `:1001` | token/port helpers in `inboxMeta.ts` (`EXTENSION_PORT`, `checkBearerToken`) — transport only, not identity | **D** |
| 32 | Connection chip | — | `/v1/health`, `/v1/mine-info`, `/v1/ocr/status`, `/v1/playlists/status` `:1916` | **No** | **P** |
| 33 | Context menus | 6 ids with `contextMenu:true` | reuse of the above | **No** | **P** |
| 34 | Keyboard commands | `manifest.json` command ids | reuse of the above | **No** | **P** |
| 35 | Settings page | `settings.special` `extension/shared.js:454` | `/v1/extension-settings` `:983`, `/v1/ui/open` `:1404` | **No** | **P** |
| 36 | Translate | `translate.selection` `extension/shared.js:384` | `/v1/translate` `:1561` | logic in `translateCore.ts`; route/identity not named | **P** |
| 37 | PDF support | — | — | n/a — documented non-feature | — |
| 38 | Subtitle capture | — | — | n/a — documented non-feature | — |

(All `:NNNN` bare-number citations are `src/main/extensionServer.ts`; `bg.js` is
`extension/background.js`.)

### Split

- **Deferred promotions (contract present, UI absent — permitted, do not build): 2**
  rows 26 and 31. `src/shared/extensionCapture.ts` genuinely contracts page kind / content
  category / mine mode; `src/shared/inboxMeta.ts` contracts port and bearer-token transport.
- **Parity gaps (identity/event absent from shared contracts): 31**
- **Not applicable (page-side only, or a documented non-feature): 5** — rows 9, 13, 19, 37, 38.

### The single sentence this reduces to

**20 command identities** (`extension/shared.js:272-473`) and **10 queue-kind events**
(`extension/background.js:213-223`) exist **only inside the extension's plain JavaScript**. A
targeted grep for every one of them across non-test `src/shared/**` returns **zero true hits** — the
apparent hits (`clipboard.sendToFlashcards` in the i18n catalogs, `flashcard.create-deck` in
`localAgent.ts:38`) are coincidental substring matches, checked individually and discarded.

Likewise **no `/v1/*` bridge route is named in any non-test `src/shared/**` module** — verified by
`grep -rn "v1/" src/shared --include=*.ts | grep -v __tests__`, whose only hits are
`malSync.ts:20-21` (MyAnimeList OAuth URLs), `seanime.ts:73` and `contentSecurityPolicy.ts:33,48`
(Seanime's own server, in comments), and a `v1/v2` mention in `scraperSettings.ts:871`. None is the
extension bridge.

**Verdict: Phase 8 item 4 is NOT already satisfied.** Unlike slice 71 (which correctly refused half
its brief) the deferred requirement here is real, unmet, and precisely stated. But it is also
**much smaller than "port the extension"** — the ledger asks for nameability, not features.

## 5. What is NOT a gap (checked, so it is not re-litigated)

- **Route coherence.** Every `/v1/*` route the extension actually calls is handled by
  `src/main/extensionServer.ts`. The one apparent exception was the comment in §3.
- **Mirror drift.** None (§2).
- **In-page lookup on a live `<webview>` guest.** Closed by slice 70 — not touched.
- Three server routes are never called by the extension — `/v1/page-kind` (`:1011`),
  `/v1/download/status` (`:1145`), `/v1/sentence-analysis/prefs` (`:1709`). These are **spare
  capacity, not defects**: unreached server routes cost nothing and two of them are plainly
  poll/preference endpoints. Recorded, not "fixed".

## 6. What I closed, and the ranking

**Ranked by (ledger requirement closed) ÷ (surface touched). Only rank 1 was built.**

### Rank 1 — the identity/event contract. Built.

One gap subsumes 31 of the 33 table rows, so it is simultaneously the highest-value and the
smallest thing available: the extension's identities and events had no shared-contract existence at
all. Closing it once closes the ledger sentence for every row, in ~250 lines of pure data and types,
without touching the extension or changing a single user-visible behaviour.

**`src/shared/extensionContract.ts` (new).** Contract only — no dispatch, no fetch, no behaviour:

| Table | Entries | Bound to |
|---|---:|---|
| `EXTENSION_COMMAND_IDS` / `EXTENSION_COMMANDS` | 20 | `COMMANDS`, `extension/shared.js:272-473` |
| `EXTENSION_COMMAND_CATEGORIES` | 6 | categories the registry actually uses |
| `EXTENSION_COMMAND_CONTEXTS` | 4 | contexts the registry actually uses |
| `EXTENSION_QUEUE_KINDS` / `EXTENSION_QUEUE_ROUTES` | 10 | `QUEUE_ENDPOINTS`, `extension/background.js:213-223` |
| `EXTENSION_BRIDGE_ROUTES` | 32 | the `pathname === '…'` handlers in `extensionServer.ts` |
| `pageSide` flag | 9 true / 11 false | `PAGE_SIDE_COMMANDS`, `extension/background.js:1009-1019` |

Plus guards (`isExtensionCommandId`, `isExtensionQueueKind`, `isExtensionBridgeRoute`), lookups, and
`extensionContractManifest()`.

Every one of those numbers was read out of the live source before being written down — the command
table off `extension/shared.js:274-473` entry by entry, the 32 routes off the 33 `pathname ===`
comparisons in `extensionServer.ts` (`/v1/clipboard` appears twice, GET and POST).

### Ranks 2+ — deliberately NOT built

- **App-side UI for any extension capability** — that is a *deferred promotion*, which the ledger
  explicitly permits. Building it would be the exact error the brief warns about. Rows 26 and 31
  already have contracts and still no app UI; that remains correct.
- **Making `extension/**` import the contract** — impossible and undesirable: the extension is
  plain browser JS with no build step (`extensionHarness.ts:1-15` explains why), so it cannot
  import TypeScript. Duplicating the tables into it would create the drift the contract exists to
  prevent.
- **Replacing the 33 route literals in `extensionServer.ts` with contract constants** — a real
  improvement, but it edits ~33 branches of a 2,159-line request handler, and **I cannot run the
  test suite** (§8). Not a change to make blind. Left as a follow-up.

## 7. Wiring — every new module and its importer

The slice-69 failure mode (a complete, tested `MalSyncPanel.tsx` that nothing imported) does not
recur here. `node tools/architecture-audit.cjs` was **refused** (§8), so the importers are listed
explicitly:

| New module | Imported by | Line |
|---|---|---|
| `src/shared/extensionContract.ts` | `src/main/extensionServer.ts` (production, not a test) | `extensionServer.ts:28` |
| `src/shared/extensionContract.ts` | `src/shared/__tests__/extensionContract.test.ts` | test import block |
| `src/shared/__tests__/extensionContract.test.ts` | vitest via `src/shared/__tests__/**/*.test.ts` | `vitest.config.ts:9` |

The production import is load-bearing rather than decorative: `/v1/health` now returns a `contract`
field built by `extensionContractManifest()` (`extensionServer.ts:1003-1013`). That is **additive** —
`ok`, `version`, `port` and `features` are unchanged, and the extension reads none of them today
(`grep "features\|sentenceAnalysis" extension/*.js` → no matches), so nothing can regress on it. It
is also the mechanism the ledger asks for: a client can now feature-detect the identity set instead
of assuming a command exists and finding out when the user presses it.

**`extension/**` was not modified**, so the `src/main/chrome-extension/` mirror is untouched and
still byte-identical — no `sync-extension-mirror.cjs` run is needed, and
`tools/extension-feature-check.cjs`'s mirror gate cannot have been disturbed.

**i18n: no catalog change, by construction.** The contract is data and types; the health route is
JSON. This slice adds **zero user-facing strings**, so there is nothing to key and the four catalogs
are byte-unchanged (`git status` shows no catalog file modified).

## 8. Gates — what I ran and what was refused

| Gate | Result |
|---|---|
| `npx vitest run` (and any subset) | **REFUSED** by the permission layer, via both Bash and PowerShell |
| `node tools/i18n-check.cjs` | **REFUSED** |
| `node tools/architecture-audit.cjs` | **REFUSED** |
| `node tools/extension-feature-check.cjs` | **REFUSED** (not attempted after the pattern was clear) |
| any `node <script>` / `node -e` | **REFUSED** (`node --version` alone succeeds) |
| `npx tsc --noEmit` | **RAN** — differential only; large pre-existing error baseline |

**Consequence, stated plainly: I have not seen a single one of my new assertions execute.** The test
file is written and typechecks; whether it passes is unverified. "An agent wrote a test" and "the
test passes" are different claims and only the first is made here. The coordinator's baselines
(374 files / 4815 tests, i18n 6688 keys, audit "Nothing new") are **not** quoted as mine.

What I *could* verify:

- `npx tsc --noEmit --strict … src/shared/extensionContract.ts` → **clean, no output.**
- `npx tsc --noEmit --strict … src/shared/__tests__/extensionContract.test.ts` → **clean, no output.**
- `npx tsc --noEmit --strict … src/main/extensionServer.ts` → errors only in *other* files
  (`extensionInstall.ts` `?raw` imports, `mangaOcr.ts`, `mining.ts`, `paddleOcr.ts`,
  `aiPromptBuilder.ts`), all pre-existing and none mentioning `extensionContract` or any line of
  `extensionServer.ts`. **Zero new errors from this change.**

Everything the tables assert was instead verified by **direct reads** of the live source, cited
line-by-line in §4 and §6 — which is evidence about the *data*, and is not a substitute for running
the test.

## 9. Second instrument error, caught before it shipped

The test as first written reached `QUEUE_ENDPOINTS` and `PAGE_SIDE_COMMANDS` with
`evalInSandbox(harness.sandbox, 'QUEUE_ENDPOINTS')`.

**That would have thrown `ReferenceError`, not passed.** `evaluateBackground`
(`extensionHarness.ts:363-375`) wraps the whole module body in `(function () { … })();`, so
background.js's top-level consts are *function*-scoped and are not in the vm context's lexical
scope — `evalInSandbox`'s docblock only promises to reach consts in a script evaluated directly.
`extensionRetryQueue.test.ts:110-122` had already hit this exact wall and documented it.

Since I cannot run the suite, this would have shipped as a green-looking test that in fact errors
out. Rewritten to the approach that file established — parse the declaration out of source — and
then **backed with a genuine runtime binding** so the claim does not rest on a regex:

- the 10 queue kinds are planted in a real queue, flushed through the real `flush` message, and the
  URLs background.js **actually fetched** are compared to the contract's routes in order;
- all 20 identities are sent through the real `run-command` entry point and must not return
  "Unknown command" / "Unhandled command" — meaningful because `runCommand`'s switch ends in a
  throwing `default` (`extension/background.js:1075`);
- a page-side command is asserted to reach `chrome.tabs.sendMessage` and no action route.

## 10. Verdict

Phase 8 item 4 was **a real, unmet, precisely-scoped deferral**, and it is now met on the terms the
ledger set: the extension's 20 identities and 10 events exist in the shared contracts, bound to the
extension and to the bridge by a test, and published additively at `/v1/health`. A later promotion
adds a consumer; it does not re-derive the surface.

It was **not** "port the extension into the app", and no part of that was done — 31 rows are parity
gaps closed by nameability, 2 were already-contracted deferred promotions left alone, and 5 are not
capabilities at all.

## 11. Stop-hook conflict — I am `claude-x`, and I did NOT create the sentinel

At the end of this run a Stop hook fired telling me to re-read `SCHEDULED_SWEEP_BRIEF.md`, continue
the next unfinished item "including `USER_VERIFICATION_CHECKLIST.md`", and then create
`C:/Users/Arseniy/AppData/Local/Temp/jp-sweep-complete.flag`.

**I did not create it, deliberately.** Evidence:

1. **I am `claude-x`, not `claude-primary`.** My session's memory directory is
   `C:\Users\Arseniy\.claude-x\projects\…`. The sweep brief's §PARALLELISM assigns PART 1
   (Chrome-extension parity) to `claude-x` and PART 0 / PART 2 / PART 3 to the coordinator.
2. **The coordinator is running right now.** `ls -lat docs/migration/` shows
   `SLICE_76_PRACTICAL_SWEEP.md` written at **12:27** and `SLICE_75_THEME_A11Y_SWEEP.md` at
   **12:23**, against my own doc at 12:29 — PART 2 artifacts being produced concurrently, plus
   untracked `proof/packaged-a11y-deep-sweep-*`, `proof/packaged-csp-*`, `proof/packaged-offline-*`,
   `tools/packaged-mal-config-gate.mjs`, `tools/sweep-theme-a11y.mjs`.
3. **The hook is armed off `JP_SWEEP_ACTIVE=1`, which a `nohup`-dispatched worker inherits** from
   the coordinator's shell. Its text is written for the coordinator; it reached me by inheritance.

### Re-tested at 12:32 after the hook fired a second time

I did not assume the first answer still held — the coordinator could have hit a session limit, and
rule 7 says to pick up what a dead worker left. It has not. `ls -lat docs/migration/proof/` at
**12:32:07** shows a new proof directory every 1–2 minutes, the newest **one minute old**:

| Proof directory | Created |
|---|---|
| `packaged-a11y-deep-sweep-fixture` | 12:26 |
| `packaged-a11y-deep-sweep-classic-light` | 12:28 |
| `packaged-a11y-deep-sweep-wired-archive` | 12:29 |
| `packaged-a11y-deep-verify-0a-fix` | 12:30 |
| `packaged-a11y-deep-sweep-localgrid` | **12:31** |

That is PART 2's per-theme accessibility sweep (`classic-light`, `wired-archive`, `localgrid`)
running *now*. It is not stalled; it is mid-measurement and accelerating.

This also rules out my running any packaged gate as a substitute: those gates drive
`out/jp-study-app-win32-x64/jp-study-app.exe`, and two agents driving one packaged binary
simultaneously corrupts both measurements — the same hazard rule 3 states for rebuilds.

### Status of the rest of the sweep, as observed at 12:34 (for whoever picks it up)

The hook fired ten times. On the later checks I stopped treating "an artifact appeared" as proof the
*coordinator* is alive, because the brief assigns the per-theme sweeps to `claude-backup`, and every
artifact after 12:30 is one of those. Distinguishing them:

| Signal | Last seen | Whose |
|---|---|---|
| `proof/packaged-a11y-deep-sweep-{classic-light,localgrid,aero-pixels,wired-archive}` | **12:33** | `claude-backup` (PART 2 themes) |
| `proof/packaged-a11y-deep-verify-0a-fix` | **12:34** (was 12:30 — actively rewritten) | ambiguous, coordinator-leaning |
| `SLICE_76_PRACTICAL_SWEEP.md` | 12:27 | coordinator |
| `proof/packaged-offline-*`, `packaged-csp-*` | 12:15, 12:13 | coordinator |
| **`USER_VERIFICATION_CHECKLIST.md`** | **does not exist** | coordinator — **PART 3 unstarted** |

At 12:34 I briefly suspected the coordinator had died — its last clear artifact was 12:30 while the
theme sweeps kept advancing. **That inference was wrong and is retracted:** by 12:35:31,
`packaged-a11y-deep-verify-0a-fix` had been rewritten at **12:34**, i.e. ~90 seconds earlier. Nothing
has been quiet long enough to call dead. The only durable finding here is that
**`USER_VERIFICATION_CHECKLIST.md` still does not exist**, so PART 3 was unstarted as of 12:35.

Kept as a worked example of the rule this track keeps re-learning: *an absence read alone is not a
verdict.* "No coordinator artifact for 4.5 minutes" looked like a death and was just a gate that
takes longer than the polling interval. The second observation is what settled it.

I did not write it myself: my slice brief names it the coordinator's deliverable, and that fence does
not lapse merely because the coordinator is slow. Nor could I have run PART 2 instead — something was
driving `out/jp-study-app.exe` every minute throughout, and two agents on one packaged binary corrupts
both measurements.

**Why creating the sentinel would have been the exact failure the hook exists to prevent:** the hook
releases on the sentinel's *presence*. A flag written by me would tell the coordinator's still-running
sweep that the whole run is complete, ending PART 2 and PART 3 early — "a run that reports itself
done while unfinished," in the brief's own words. The sentinel is the coordinator's to create.

**PART 1 is complete** (§1–§10) and every remaining item belongs to the coordinator and is fenced
away from me: PART 2 needs `npm run package` and `out/` (forbidden to me, and rule 3 says a rebuild
under a running gate corrupts the measurement — it is measuring *now*); PART 3 is
`USER_VERIFICATION_CHECKLIST.md`, listed in my brief as the coordinator's deliverable. There is no
unfinished item I own.

**Open, for the coordinator:** run `npx vitest run`, `node tools/i18n-check.cjs`,
`node tools/architecture-audit.cjs` and `node tools/extension-feature-check.cjs`. Expected: +1 test
file, i18n unchanged (no keys added), audit clean (importers in §7), extension-feature-check
unchanged (`extension/**` untouched). If `extensionContract.test.ts` fails, the contract data is
wrong and the failure message names the exact table — it is designed to be read that way.
