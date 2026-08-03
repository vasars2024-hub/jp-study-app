# Slice 76 — the scheduled leftover-and-sweep run

**Run date:** 2026-08-03. **Coordinator:** `claude-primary`, started by a Windows scheduled task.
**Workers:** `claude-x` (slice 74, extension parity), `claude-backup` (slice 75, theme a11y sweep).

Written as the run proceeds. Anything marked UNTESTED or NOT-REACHABLE was not measured, and that
is a result, not an omission.

---

## PART 0 — the authorised checkpoint commit

The user authorised **one** `git add -A` commit of this worktree on 2026-08-03. It was done first,
before any sweep work, because ~1,200 changed paths existed nowhere but this disk.

**Gates re-run immediately before committing** (a checkpoint of a broken tree is worse than none):

| gate | measured |
|---|---|
| `npx vitest run` | **374 files / 4815 tests passed**, exit 0 |
| `node tools/i18n-check.cjs` | **exit 0** — all **6688** English keys translated in ja/zh/ru |
| `node tools/architecture-audit.cjs` | **"Nothing new"** — 3 known findings still pending |
| `node docs/migration/tools/audit-carried-items.mjs` | **exit 0** |

All four match the brief's stated baselines exactly. The i18n key count is **6688**, not the 6685
quoted in the slice-70 notes; that is drift from later slices adding keys, not a discrepancy.

**Working-tree counts before staging: 716 untracked / 266 modified / 218 deleted** — exactly the
brief's expected figures. Staged, this expands to **1346 files, +532,590 / −42,903**, because
`git status` collapses untracked directories to one entry each while `git diff --cached` lists
every file.

**Commit:** `8acf172` on `grammarx/phase-1-5`. **Not pushed.** No `git stash` was used. The other
two worktrees (`jp-study-app-noctis-beta` on `codex/noctis-beta`, and the ProgramData
`cool-poincare-9b2f0c` worktree) were not touched, not `cd`'d into and not merged.

### Credential scan — and one instrument that lied first

- **`JP_STUDY_MAL_CLIENT_ID` is present as a Windows *User* env var, 32 chars.** Its value was
  never printed, logged, or written to any file. A content scan of every staged text file for that
  exact value returned **0 hits**.
- No `.env`, `.pem`, `.p12`, `.pfx` or credential file is staged. `src/main/scraper/credentials.ts`
  is a store that reads a runtime file and embeds no value.
- Generic secret-pattern scan (private keys, `ghp_`/`sk-`/`AKIA`/`xox*` tokens, assigned
  `password`/`api_key`/`access_token`/`client_secret`, long `client_id` literals) returned only
  benign hits: i18n label translations (`'API-ключ'`), a UI string in `Lockscreen.tsx`, a test
  sentinel `'must-not-cross-ipc'`, and upstream Seanime's own public default
  `"seanime-default-secret"` in `vendor/seanime-web/lib/server/hmac-auth.ts`.

> **The first scan was a non-scan and reported clean.** `rg --files-from=…` is not a ripgrep flag;
> with `2>/dev/null` the error vanished and the empty output read exactly like "no credentials
> found". A positive control (`grep for 'export'`, which must match hundreds of files) returned
> **0**, which is what exposed it. The rule this track keeps paying for — *ask what your instrument
> actually did* — applies to the safety checks too, not only to the findings.

### The Noctis deletions are included, deliberately — flagged for the user to object to

The commit removes **11 `NOCTIS`/`noctis` paths** from this worktree and adds one
`src/renderer/__tests__/noctisRetirement.test.ts`:

```
D  src/main/city/docs/NOCTIS_ECOLOGICAL_ENGINE.md
D  src/main/city/docs/archive/NOCTIS_UI_PANELS.md
D  src/main/city/rendering/diorama/NoctisDiorama.tsx
D  src/main/city/rendering/diorama/NoctisWorldScene.tsx
D  src/main/city/rendering/particles/NoctisParticleCanvas.tsx
D  src/main/city/ui/NoctisWorkspace.tsx
D  src/main/city/ui/noctis.css
D  src/renderer/__devharness__/noctisHarness.html
D  src/renderer/__devharness__/noctisHarness.tsx
D  src/renderer/environment/noctisLightBridge.ts
R  src/renderer/__devharness__/noctis-harness.html -> reading-garden-phases.html
A  src/renderer/__tests__/noctisRetirement.test.ts
```

This is a *Noctis retirement performed in this worktree*, which is a different thing from the
`codex/noctis-beta` branch. That branch lives in a separate worktree with its own working
directory, so this commit cannot reach it. Excluding these would have left the tree half-committed.

### The build under measurement

`npm run package` was run **once, before the sweep**, and verified against the stale-exe trap the
handoff warns about:

- `PACKAGE_EXIT=0`
- **zero** occurrences of `EPERM` / `dxcompiler` / `unhandled` in the build log
- **no `src` file is newer than the exe** (exe mtime 2026-08-03 12:11)
- `out/jp-study-app-win32-x64.pre-storage-fix/` (the preserved control binary) intact

No rebuild happened mid-sweep, and both workers were explicitly forbidden from packaging.

---

## PART 1 — Phase 8 item 4, Chrome-extension parity (slice 74, worker `claude-x`)

**Full write-up: `SLICE_74_EXTENSION_PARITY.md`. Verdict: the item was NOT already satisfied, and
the work that closes it is much smaller than "port the extension".**

The spec is one sentence in `FEATURE_PARITY_LEDGER.md:106-110` — *"Their identities and events must
exist in the shared contracts from Phase 2 so promotion later is additive."* That is **nameability,
not features**, and the worker read it correctly rather than building UI.

**Gap table: 38 rows with file:line evidence** — **31 parity gaps** (identity/event absent from the
shared contracts), **2 deferred promotions** (which the ledger explicitly permits and which it
therefore classified rather than built), **5 not applicable** (page-side only, or documented
non-features).

**What landed:** `src/shared/extensionContract.ts` — 20 command identities, 10 queue-kind events,
32 bridge routes, with type guards — plus `extensionContract.test.ts` binding it to the live
extension and bridge.

### Verified by me, because the worker could not verify anything itself

`claude-x` had **every gate refused** by its permission layer and said so plainly instead of
quoting my baselines. So I re-ran them:

- **`npx vitest run`: 375 files / 4833 tests pass** (up from 374 / 4815 — slice 74 contributes
  1 file / 18 tests). The new test also passes **18/18 standalone**, which matters because this
  track has seen a test that passed alone and failed in its own file.
- **Not an orphan** — the lesson from slice 69's unreachable `MalSyncPanel.tsx`. The module is
  imported at `extensionServer.ts:28` and used at `:1013`. `architecture-audit.cjs` says
  **"Nothing new"**.
- **The central claim, checked against the code rather than the report:** no command identity, queue
  kind or `/v1` route is named in any non-test `src/shared/**` module. The apparent counter-examples
  are substring coincidences in the i18n catalogs (`clipboard.sendToFlashcards` is not the
  `clipboard.send` command id), and the only `/v1/` hits are MyAnimeList OAuth URLs plus comments in
  `contentSecurityPolicy.ts` and `seanime.ts`. **The claim holds.**
- **The `/v1/health` change is genuinely additive**: one import, one extra `contract` field beside
  the existing `ok`/`version`/`port`/`features`. I measured the added payload — **488 bytes** — which
  matters because that endpoint is polled by the connection chip.
- **The extension mirror is not drifted**: `sync-extension-mirror.cjs` reports **12/12 files match**
  (the worker touched `extensionServer.ts`, not `extension/**`).

## PART 2 — gate results

### The theme gate could not measure a single base theme, and failed in the direction that invents findings

**The blind spot was real but the instrument for closing it was broken, and it broke in the
direction that manufactures findings.**

`packaged-a11y-deep-gate.mjs` step 0a decided "the theme applied" with:

```js
const applied = out.theme.storedId === THEME && !!out.theme.materials;
```

`data-materials` is stamped by `applyThemeAttributes` **only when a theme declares a `materialSet`**
(`src/renderer/theme/engine.ts:127`). **No base theme declares one** — it exists for the glass
aesthetics. The check had only ever been run against `frutiger-aero`, which has one. So:

| theme | `data-theme` on screen | `data-materials` | step 0a | steps completed |
|---|---|---|---|---|
| `classic-light` | `classic-light` ✅ | `null` | **FAIL (phantom)** | 4 of 19, verdict `ERROR` |
| `wired-archive` | `wired-archive` ✅ | `wired` | PASS | 19 of 19, `MEASURED` |

The theme had applied *perfectly* in both cases. Step 0a then **throws**, so all twelve base themes
would have aborted and been reported as twelve theme-application failures — a phantom defect per
theme, in a sweep whose entire purpose is to find real ones.

**The fix (slice 76):** `data-theme` is the evidence. `applyTheme` sets it to the resolved theme's
own id (`engine.ts:150`) and *removes* it for the default (`:148`), and an unregistered id falls
back to the default (`:145`) — so a typo cannot pass, which was the guard's real purpose.
`storedId` is still checked alongside it, because `loadThemeId()` (`:107`) returns the default when
the stored id is unregistered, meaning localStorage can hold a typo while the screen shows the
default palette. `materials` is still recorded, just no longer a pass condition.

Verified against a base theme before being trusted — `RUN_STAMP=verify-0a-fix --theme=classic-light`:

```
PASS — 0a the requested THEME is the one on screen:
{"requested":"classic-light","storedId":"classic-light","materials":null,
 "themeAttr":"classic-light","expectedThemeAttr":"classic-light"}
```

### classic-light — the first light base theme ever measured, and slice 72's prediction holds

`docs/migration/proof/packaged-a11y-deep-verify-0a-fix/`

| step | default (`study-os`) | **`classic-light`** |
|---|---|---|
| A2 Tab coverage | PASS 121/121 | **PASS 121/121** |
| B1 text contrast | 336 samples, 4 below AA, all 4 inactive-exempt → **0 real** | 344 samples, 20 below AA, 4 exempt → **16 REAL** |
| B2 non-text (1.4.11) | PASS — 107 scored of 233, 68 below, **0 load-bearing** | **FAIL — 107 scored of 233, 84 below, 16 LOAD-BEARING** (`state` 15, `affordance` 1) |
| B3 focus ring | PASS 52 ringed stops, 0 below 3:1 (4.80–5.43:1) | **PASS 52 stops, 0 below — but marginal: 3.41:1 and 3.65:1** |
| C0 artwork / E1 sliders | PASS / PASS | PASS / PASS |

The predicted shape exactly: **a light theme cannot use the same indicator colours as a dark one.**
The focus ring is the same `rgb(255,46,77)` in both; on the dark palette it sits at 4.8–5.4:1, on
white it drops to **3.41:1** — still passing, but with almost no margin. The load-bearing `state`
failures (15) are the ones that would ship a defect: those boundaries are the only thing
communicating a control's state.

### MAL sync — the configured path executed for the first time, as a two-arm differential

New gate: `docs/migration/tools/packaged-mal-config-gate.mjs`.
Proof: `docs/migration/proof/packaged-mal-config-sweep-mal/`. **Exit 0.**

Until today no client id existed on this machine, so `status().configured` was false and every
OAuth call died in `requireClientId()`. 36 unit tests cover the client over a fake transport with
**zero network calls**, so the configured branch had never been executed by shipped bytes. The
gate launches the **packaged** app twice, differing in exactly one variable — whether
`JP_STUDY_MAL_CLIENT_ID` is in the child's environment — because an absence read alone is not a
verdict:

| step | control arm (no client id) | armed arm (client id present) |
|---|---|---|
| 1 / 3 `status().configured` | **`false`** | **`true`** |
| 2 / 4 `beginAuth()` | **refused, `not-configured`** | **`ok: true`, no error code** |
| 6 the arms differ | — | **PASS** — `{control: false, armed: true}` |

Authorize-URL **shape** (step 5 PASS). Values are never asserted and never recorded:

```
origin              https://myanimelist.net
pathname            /v1/oauth2/authorize
params              client_id, code_challenge, code_challenge_method, response_type, state
response_type       code
code_challenge_method  plain          <- correct for MAL; hashing it breaks the exchange
client_id           present, length 32   <- LENGTH ONLY
code_challenge      length 86            <- 64 random bytes base64url, inside RFC 7636's 43-128
state               length 32, and IDENTICAL to the state handed back to the caller
```

`redirect_uri` is **absent** from the URL, so MAL will use the redirect registered against the app
(`http://localhost/oauth/callback`). That is legitimate but it means the registered value is now
load-bearing and untested — noted in the checklist.

**The client id never left memory.** It is read from the environment by the child process only; the
gate records lengths and a redacted URL (`client_id=<redacted len=32>`). A post-run scan of both
proof files for the literal value found **0 hits**.

**Not attempted, by design:** `completeAuth(code, state)` needs a human to approve in a browser and
paste the code back — there is no loopback listener and no protocol handler — and `mal:updateEntry`
mutates the user's real MyAnimeList list. Both are **NOT-REACHABLE (needs the user)**.

### THE BIGGEST FINDING — painted pixels disagree with CSS about 1.4.11, on the DEFAULT theme

**Slice 73's pixel sampler is the more trustworthy instrument, and it fails where the CSS-derived
step passes.** Both `--pixels` runs FAIL step **B2p**, on a build whose CSS-derived step **B2**
passes.

| | CSS-derived **B2** | painted-pixel **B2p** |
|---|---|---|
| **default (`study-os`)** | **PASS** — 107 scored of 234, 68 below 3:1, **0 load-bearing** | **FAIL** — **206 scored of 234**, 184 below 3:1, **66 LOAD-BEARING** (`identity` 48, `state` 18) |
| **`frutiger-aero`** | "PASS" — **8 scored of 251**, 0 load-bearing | **FAIL** — **231 scored of 251**, 207 below 3:1, **8 load-bearing** (`identity` 8) |

Proof: `docs/migration/proof/packaged-a11y-deep-sweep-default-pixels/`,
`…-sweep-aero-pixels/`.

**Why the two disagree, and why the pixel reading wins.** The CSS path only scores a control that
*declares* a boundary; it recorded **126 controls as `boundaryLessNotScored`** on the default theme
and simply did not score them. The pixel path samples the boundary and backdrop out of
`Page.captureScreenshot` through a fiducial-derived mapping cross-checked four ways, and scores
**206 of the same 234**. The controls the CSS path skipped are painting something after all. This is
the track's own lesson — *a token is advisory until proven; four times a CSS rule outranked the
token meant to control it* — showing up as a systematic gap rather than a one-off.

**The instrument checked itself first:** `pixelSelfTest.ok = true`, **29/29 offline assertions**
(PNG codec pixel-exact, WCAG maths, scale detector) before any of the above was believed.

The number quoted as load-bearing is `loadBearingBelowThreeOnBothReadings` — the conservative one,
failing under *both* the lenient and the strict reading over a gradient. The gate keeps
`belowThreeStrictOnly` separately (default **0**, aero **108**), so aero's extra failures are
mostly gradient-dependent while **the default theme's 66 are not**.

> **The aero B2 "PASS" was never a pass and the gate says so itself: 8 of 251 controls scored.**
> Slice 72 flagged exactly this. Aero's glass boundaries are translucent, so the CSS path finds no
> boundary to score on 243 of 251 controls. Reporting that as PASS is the "all-zero across every
> bucket" shape. The pixel path is what makes aero measurable at all.

> **What must NOT be quoted from these runs.** `textPixelContrast` reports 232 of 277 below AA on
> the default theme — **do not quote that as a text-contrast finding.** The gate labels it
> `HYBRID and deliberately weaker than B2p`: only the *backdrop* is sampled from pixels while the
> foreground is what CSS declares, because reading glyph colour off an antialiased screen biases
> every result in whichever direction the hinting went. The authoritative text number remains
> **B1**, which is 0 real failures on the default theme.

**This is a real, unfixed accessibility defect on the theme every user starts on, and it is the one
item in this sweep I would not ship without a decision on.** I did not fix it: it is 66
load-bearing boundaries across identity and state roles, the fix is a token/palette change, and
this track has learned four times that a token change must be rebuilt and re-measured before it
means anything — which is more than this run can honestly close out.

### The artwork fixture does nothing unless the sidecar is opted out

Three runs, and the pair that matters is the second and third:

| run | `--fixture` | `SEANIME_SIDECAR` | **distinct visible `<img>`** | decorative (`alt=""`) |
|---|---|---|---|---|
| `sweep-default` | no | default (on) | 4 | 1 |
| `sweep-fixture` | **yes** | default (on) | **4** | 1 |
| `sweep-localgrid` | **yes** | **`0`** | **16** | 13 |

**`--fixture` on its own measures exactly what no fixture measures.** The seeded artwork only
becomes visible with `SEANIME_SIDECAR=0`, because with the sidecar on, `player` and `video` route to
it instead of to the local grid — which the gate's own source notes at
`packaged-a11y-deep-gate.mjs:1180`. Anyone running `--fixture` alone and reporting "artwork
coverage" is reporting the un-fixtured number. The brief's ordering (both variants, and the
`SEANIME_SIDECAR=0` one third) is right, but the middle run is not the one that provides coverage.

**A small real finding from the 16-image run:** of 16 images, **13 are marked decorative
(`alt=""`)** and **one of those sits in a card carrying no text at all** — so that card presents
nothing whatsoever to a screen reader. The same 1 appears in the 4-image runs, so it is a specific
card, not a scaling artifact. `0` images lack an `alt` attribute entirely, which is the good half.

### Phase 7 — the AI allow-list refusal differential, in its strong form

`docs/migration/tools/phase7-queue-refusal-live-gate.mjs`, `RUN_STAMP=sweep-phase7`. **Exit 0**,
every step PASS. This is a genuine two-arm differential, not an absence:

- a **live plan** produced by the **real local model** (`dictionary.search-knowledge`, 1 step)
- the queued task **survived a process restart** in both arms
- the narrowing **took and survived the restart** (`narrowed: 19 -> 18`, `enabled=false` before and
  after; control untouched at `enabled=true`)
- **step 10, the differential:** narrowed arm → `failed`, *"Search local knowledge is not enabled
  for the active agent profile."*; control arm → **`completed`**, same step, same persisted plan.

The only variable separating the arms is the narrowing.

### Offline-first — a real two-arm differential, and one counter that must not be quoted

`packaged-offline-gate.mjs`, both arms, **exit 0 each**.
Proof: `docs/migration/proof/packaged-offline-sweep-offline-control-control/` and
`…-sweep-offline-blocked/`.

| evidence | **control** (internet up) | **blocked** (`MAP * ~NOTFOUND, EXCLUDE localhost`) |
|---|---|---|
| main-process `searchDiscovery` | **6 results** in 3706 ms | **0 results** in 1041 ms — degraded, did not hang |
| discover rows rendered | **6 rows**, one clicked, inspector titled | **`no-rows`** |
| remote artwork actually loaded | **1** — `https://s4.anilist.co/…/bx182255-….jpg` | **0** |
| local dictionary offline | 3 / 3 / 3 langs | 3 / 3 / 3 langs |
| shell after the failures | mounted, no error text | mounted, no error text |

**That is a verdict**: the block cut something real (6 → 0 results, one remote cover art → none), and
the app degraded honestly instead of hanging, crashing or showing a raw error.

> **One number in this gate is the "field that never arrived" shape and I am not quoting it.**
> `rendererRequestsDuringStep` is **0 in BOTH arms** — including the control arm, which demonstrably
> loaded a remote AniList image. Step 5 prints
> `renderer: 0 external request(s) … across 0 host(s) [none]` in both runs; `blockedHosts` is `[]`
> in both. That counter is not observing renderer network traffic. The offline conclusion above
> rests on the main-process result count and the rendered artwork, both of which differ between the
> arms; it does **not** rest on that counter. Worth fixing before someone reads it as evidence.

### CSP — delivered and enforced in the packaged build

`packaged-csp-gate.mjs`, `RUN_STAMP=sweep-csp`. **Exit 0.**

- the document answers with a **527-char** `Content-Security-Policy` header
- `script-src` is **`'self'` only**, `unsafe-eval` absent everywhere
- **enforced, not merely present**: an injected inline script is **refused**
  (`violatedDirective: script-src-elem`, `inline script ran: false`)

The last point is the one that matters — a header that is present but not enforced is the classic
absence-read-as-a-pass, and this gate closes it with a difference.

### Carried-items audit

`node docs/migration/tools/audit-carried-items.mjs` — **exit 0**, re-run at the start and end of
this slice. One item remains **OPEN** and is unchanged by this run:
`media-study-localstorage-half-never-round-tripped` (RETAINED_LS seeds 5 keys and not
`jp-media-study-database-v1`). It is carried into the user checklist under the upgrade item.

### Feature-by-feature — all 24 surfaces driven in the packaged app

New gate: `docs/migration/tools/packaged-surface-sweep.mjs`.
Proof: `docs/migration/proof/packaged-surface-sweep-surfaces2/`. **Exit 0.**

Each surface is opened the way the app opens it — a `CustomEvent('os:open')` on the bus that
`DesktopShell.tsx:1091` listens to and the command palette uses — then inspected **inside the opened
window only**, so the taskbar and desktop icons cannot make an empty panel look populated.

**24 of 24 surfaces mount and render correctly on a throwaway profile. 0 silent-empty, 0 errors,
0 failures to open.**

| verdict | n | surfaces |
|---|---|---|
| `CONTENT` | **19** | grammar (7233 rows), novels (624), resources (190), scraper (149 rows + **3/3 images decoded**), settings (41), anki (33), reading (25), stats (13), games (11), flashcards (5), youtube (3), music, notebook, library, immersion, calendar, musicwidget (canvas), visualizer (canvas), city (**4/4 images, 13 canvases**) |
| `CONTENT-AWAITING-INPUT` | **3** | dictionary, translate, note |
| `EMPTY-HONEST` | **2** | player, video |
| `EMPTY-SILENT` / `ERROR` / `NOT-OPENED` | **0** | — |

> **The first run of this gate reported five defects and every one of them was mine, not the app's.**
> The initial classifier had no way to say "this surface is driven by what you type", so it put
> `dictionary` (205 chars of real UI — *"Search Japanese or English — powered by Jisho (JMdict)"*,
> language toggles, a Search button; **15 characters short of the 220-char threshold**), `translate`
> (*"Offline translation via Qwen3 on your machine"*, Translate/History tabs, four language
> selectors), and `note` (a correctly **blank new-note editor**) into EMPTY-SILENT. `player` and
> `video` both render the deliberate handoff *"The media workspace is open in front of this window.
> / Bring it forward"* with a button to act on it — an honest explanation that was missed only
> because the element carrying it has no class matching the empty-state selector.
>
> **Reporting those five would have been this track's signature failure** — an instrument artifact
> written up as a finding, the same shape as the `closest()` that manufactured 13 phantom defects.
> They were caught by reading what the surfaces actually rendered instead of trusting the bucket.
> The classifier now has `CONTENT-AWAITING-INPUT` and a prose-explanation branch, all five are
> pinned as regression cases in `--selfcheck` (10 cases), and `EMPTY-SILENT` now means what it was
> always supposed to: mounted, said nothing, offered nothing to do.

**Per the brief's three questions:**

- **Does it mount?** All 24, yes.
- **Does it render real content?** 19 with substantive content; the scraper/discover surface pulled
  and decoded **3 real images**, and `city` rendered 4 images across 13 canvases.
- **Does it degrade honestly when its dependency is missing?** Yes, in both cases where it had to:
  `player` and `video` have no media on a scratch profile and say so in prose with an affordance,
  rather than showing a blank pane. That is the behaviour the brief asks for.

**Not covered by this gate, and still NOT-REACHABLE:** the player *study overlay* (needs a real
media session, `D0` in the a11y runs), the two disabled sliders (`E2`), and any MAL list call
(needs the OAuth completion). EPUB/PDF/manga *rendering* is reported here only as far as the
`reading` and `novels` surfaces mounting with content (25 and 624 rows); **opening a real book and
reading it was not driven** and is not claimed.

### Theme sweep — full table in `SLICE_75_THEME_A11Y_SWEEP.md`

Accessibility had only ever been measured on **2 of 15** themes. It is now measured on all of them
(the gate had to be fixed first — see the step 0a section above).

**The result is one finding, not thirteen:** every **light** theme fails B2 with **exactly 16
load-bearing boundaries**, and every **dark** theme passes with 0.

| | B1 real / samples | B2 load-bearing |
|---|---|---|
| `study-os` (dark, default) | 0 / 336 | **0** |
| `dark-nebula` (dark) | 7 / 346 | **0** |
| `high-contrast` (dark) | 0 / 314 | **0** |
| `oled-black` (dark) | 0 / 335 | **0** |
| `cyberpunk` (dark) | 0 / 314 | **0** |
| `forest-night` (dark) | 0 / 335 | **0** |
| `midnight-ink` (dark) | 7 / 335 | **0** |
| `classic-light` | 16 / 344 | **16** |
| `ocean-blue` | 23 / 343 | **16** |
| `paper` | 64 / 346 | **16** |
| `mint-green` | 90 / 335 | **16** |
| `rose-pine` | 166 / 309 | **16** |
| `soft-sepia` | **174** / 343 | **16** |

Six light themes, six failures, the same count every time — one palette decision that does not
survive a light background, not six bugs. **All seven dark themes pass with 0.**

> **But the pixel sampler says that split is mostly an artifact.** `soft-sepia` measured with
> `--pixels` has **67** load-bearing failures against the dark default's **66** — same
> `identity: 48`, same `state: 18`. The real 1.4.11 defect is structural and present on *every*
> theme; the CSS path only sees it on light ones because of which controls declare a boundary.
> **Fixing the light palettes alone would green the CSS number and leave the defect.** Full analysis
> in slice 75.

`frutiger-aero`'s slice-72 fixes are confirmed landed
(24 real text failures → **0 of 129**; focus rings 4-of-4-failing → **0 of 4**), and
`wired-archive` turns out to be **structurally unreadable by the CSS instrument** — it paints on
`background-image`, so **303 of 393** text samples and **223 of 246** controls come back
*unmeasurable*. Full denominators, the pixel comparison and the recommended fixes are in slice 75.

---

## The coordination bug this run hit — the Stop hook leaked into the workers

**This is the most important operational finding of the run and it is a defect in the sweep
harness, not in the app.**

The runner sets `JP_SWEEP_ACTIVE=1` so the `Stop` hook in `.claude/settings.local.json` can block
the coordinator from stopping early. **`nohup claude -p …` inherits the parent environment**, so
both dispatched workers were started with `JP_SWEEP_ACTIVE=1` too. When a worker finished its task
and tried to stop, *its* Stop hook fired, told it "the scheduled sweep brief is NOT finished,
re-read `SCHEDULED_SWEEP_BRIEF.md` and continue", and looped it.

Three consequences, in increasing order of seriousness:

1. **Wasted worker quota.** `claude-backup` finished its report and then spun.
2. **The runaway guard is a SHARED counter.** The hook increments one file,
   `%TEMP%/jp-sweep-blocks.count`, with no per-session key. The looping worker drove it from
   **4 to 13 in about two minutes**. At that rate the 40-block guard would have released within
   ~6 minutes — and it would have released **the coordinator's** stop gate, silently, on blocks the
   coordinator never made. The guard's stated purpose is to catch a runaway; leaked blocks invert
   it into a mechanism that lets the real run stop early.
3. **A worker told to "continue the sweep" is told to run PART 0**, which is the `git add -A`
   checkpoint commit. A second agent committing the tree concurrently is precisely the failure this
   track's rules exist to prevent. `HEAD` was checked and stayed at `8acf172` throughout, so this
   did not happen — but nothing in the harness prevented it.

**What I did:** `claude-backup` had already exited by the time I moved to stop it (its process was
gone), so the burn stopped at 13. I reset the counter to `0`, because **13 of those blocks were not
mine** and leaving them would weaken the very guard that is supposed to keep this run honest.
Recorded here so the reset is visible rather than silent: *counter was 13, all worker-caused, reset
to 0, coordinator's own blocked stops start from zero.* `claude-x` was left running because it was
doing productive work; it inherited the same variable and may loop once at the end.

**The fix, for whoever writes the next runner:** dispatch workers with the variable stripped —

```bash
env -u JP_SWEEP_ACTIVE CLAUDE_CONFIG_DIR=… nohup claude -p "$(cat brief)" …
```

— and key the counter file per session (`jp-sweep-blocks.$PPID.count`) so one agent cannot spend
another's guard. The re-dispatch of `claude-backup` in this run uses the `env -u` form and its brief
explicitly tells it that the Stop hook is not addressed to it and that it must never create the
sentinel.

## Contradictions with the brief

1. **"the twelve themes" — there are fifteen.** `BASE_THEMES` in `src/renderer/theme/engine.ts:70-82`
   registers **13** themes, and `src/renderer/main.tsx:175-176` registers two more at boot
   (`registerFrutigerAero()`, `registerWiredArchive()`). So the a11y blind spot is **13 unmeasured
   themes**, not 10. The sweep covers all 13.

2. **`--selfcheck` is not universal.** `packaged-a11y-deep-gate.mjs` and
   `phase7-queue-refusal-live-gate.mjs` honour it and exit after compiling their page-side probes.
   **`packaged-csp-gate.mjs` and `packaged-offline-gate.mjs` ignore the flag and run the full
   gate.** Those two "self-checks" were therefore real, complete measurements and are reported as
   such below. Worth knowing before someone runs one expecting it to be cheap.

3. **"Step 0a hard-fails if a theme did not apply — trust that, and if it fails, the id is wrong."**
   **Do not trust it as written.** Step 0a failed on `classic-light` with a *correct* id and a
   correctly applied theme, because it required `data-materials`, which only material-set themes
   stamp. The brief's advice would have led straight to hunting for wrong theme ids that did not
   exist. Fixed in this slice; the advice is now true.

4. **"`--fixture` seeds artwork" is only half true.** `--fixture` without `SEANIME_SIDECAR=0`
   measures the same 4 images as no fixture at all. Only the third command in the brief's list
   (`SEANIME_SIDECAR=0 … --fixture`) actually produces artwork coverage — 16 images. The brief lists
   all three, so the coverage is obtained, but the middle run is not what provides it.

5. **The brief's own parallelism instructions are unsafe as written**, and this is the one that cost
   the most. `nohup claude -p` inherits `JP_SWEEP_ACTIVE`, so both workers were looped by the Stop
   hook, and the runaway counter is shared and unkeyed so their blocks were spent out of the
   coordinator's budget — reaching **41, past the 40-block release**, on blocks the coordinator never
   made. See the section above. Dispatch with `env -u JP_SWEEP_ACTIVE`.

6. **"Expect their gates to be REFUSED" was right, and under-stated for one worker.**
   `claude-backup` had **five of five** invocations refused and measured nothing on its first
   dispatch. It was nonetheless the run that independently diagnosed the step 0a defect from source
   and proposed the exact fix that landed. A blocked worker is not necessarily an unproductive one.

7. **The user stood `claude-backup` down mid-run**, so the suggested three-way split did not hold.
   Its remaining nine themes were run by the coordinator. Reported here so the parallelism claimed
   matches the parallelism that happened.
