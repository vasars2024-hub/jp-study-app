# L8 — dead controls on the Liquid Dictionary window

Rubric category 8's first number: *count of dead controls (present but with no observable effect)*.
Instrument `probes/l8-dead-controls.cjs`, driven live against pid 7920, 2026-08-24.
Raw run: `baselines/l8-dead-controls-run7.json`.

## The number

**65 controls, 22 excluded with a stated reason, 43 probed, 43 ALIVE, 0 DEAD.**
Both controls held: the planted no-op button read **DEAD**, the planted mutating button read
**ALIVE**. Per the rubric's own rule, a run where the deadness control comes back alive is VOID —
this one is not. `notActuated 0`, `gone 0`: every probed control has a verdict, none was skipped.

Denominator, in full: 8 `+ Add to Anki` and 8 `Copy to clipboard history` (write real user data),
`Remove saved search`, `Forget this explanation` (destructive, no undo), and the five window-chrome
controls (close/minimise/maximise/pop-out/presentation toggle).

## What four earlier runs got wrong, so nobody re-earns it

The same surface returned **45 false DEADs**, then **35 NOT ACTUATED**, then **26 GONE**, then
**1 false DEAD**, before it returned 0. Each was the instrument, not the product:

1. **A roster of element references is not a roster.** 中文 re-renders the result list; every
   stored node from index 14 on was a corpse and `click()` returned "detached". Fixed by
   `rematch()` — re-bind by `label|tag|type|class` + ordinal, with a **class-only fallback**
   because a cycling control's label *is* its state and the keyed match cannot survive it.
2. **A segmented picker's second click is not an undo.** Clicking 中文 collapsed 8 entries to 2
   and the 26 per-entry controls after it were then honestly absent. `preArm`/`unclick` read the
   group (`.dict-lang-toggle` marks its choice with a bare `active` class and **no ARIA at all**;
   `.lexicon-lens-picker` uses `aria-pressed` too) and restore by clicking the member that *was*
   active. The same fix turned `Automatic` from a false DEAD — it was already the active member,
   so clicking it was a no-op by design — into a measured ALIVE.
3. **An effect can outrun the settle.** `EntryExplain.forget()` awaits `dictExplanationClear`
   before clearing the panel and missed 450 ms. No control is now recorded DEAD until it has been
   re-probed at **3000 ms** (`--slow-settle`).
4. **Restoration must be measured against the surface as found**, not against the post-setup
   state, and one unrestorable control must not cost the census the rest: `restoreBaseline()`
   re-selects the install-time choices and re-runs the install-time query.

## Residue, and the one thing the census damaged

`lsSettle` removes keys the census *added* (`jp-os-dictionary-saved-searches-v1`) and reports
keys it merely changed without reverting them. Before that existed, the there-and-back walked all
eight looked-up words **New → Learning → Familiar** in real study data; cycle-restore now keeps
actuating until the label returns, and those eight were put back to New by hand.

## Product observation for category 8, not scored here

**7 one-way controls**: `Play <word>` becomes `No recording for this word` and never returns
(`.word-audio`, all 8 entries bar one). Honest text, but the control stays a button that can no
longer act. Category 8's remaining items — fabricated values, and the four states under a real
unreachable dependency — are unmeasured, so **no score is claimed for category 8 yet**.

## 2026-08-24 — `Explain again` was the one real DEAD control, and it was two caches

The census left 4 dead ends of 20 in the Liquid Dictionary window; three were honest
already-in-that-state no-ops (`Search`, a `.dict-saved-search` chip, `Automatic`). The fourth,
**`Explain again`**, was real: it painted `Asking the model…`, returned to idle in ~4 ms with the
byte-identical answer, no error element, no blocked element, `/logs?level=error` total 0.

**Cause, not the one the handoff predicted.** The renderer's bare returns at
`EntryExplain.tsx:128/:130` are exonerated — `aiGetConfig` live is
`engine cloud / gemini-2.5-flash / apiKeysSet.gemini true`, so `live.ok` is **true** and the call
does reach main. There are **two** caches and `refresh` only bypassed one.
`defaultAgentExecutionPolicy` runs Explain at `cache: 'session'`
(`agentExecutionBridge.ts:456`); the provider runtime keys that on the assembled prompt
(`providerRuntime.ts:727`), and the explain prompt is deterministic for a word. So the second ask
in a session was answered out of process memory, re-parsed, and re-stored over itself.

**Measured through the real `dict:explain` handler, 猫/ねこ/en, same policy, same session:**

| call | `refresh` | before | after |
| --- | --- | --- | --- |
| 1 plain | false | 6823 ms, `cached:false` (real call) | **18 ms, `cached:true`** |
| 2 `Explain again` | true | **2 ms, identical summary** | **7290 ms, different summary** |
| 3 plain | false | 0 ms, `cached:true` | **1 ms, `cached:true`** — serving the new answer |

Negative control is call 1/3 in the after column: the non-refresh path is **still cached**, so the
fix did not just switch caching off. Second-order finding, now also gone: the 2 ms row reported
`cached:false`, and that field's contract is "nothing was sent anywhere" — the result asserted a
provider call that never happened.

**Fix** (`explainRun.ts`, `policyForRun`): a refresh forwards the caller's policy with
`cache: 'off'` and every other term untouched, so it cannot become a request the user did not
authorise; a policy already at `'off'` is returned by identity. Placed in the run rather than at
the IPC handler because `refresh` is that module's contract and both caches must fall to one
decision. 3 tests added (11 total in `lexiconExplainRun.test.ts`).

Dead ends **4 → 3**, all three remaining honest. Data left as found: 猫 had **no** stored
explanation before the probe (`preexisting: null`) and `dictExplanationClear` removed exactly
**1** row, re-read as `null`.

## 2026-08-25 · primary — the census ported to the VIDEO window, and the first number it produced was a lie

Category 8's dead-control number on the Media Center (`Video`, 1080×700, `presentation=liquid`,
Library / `Recently added`, 8 cards / 1,234 chars / 350 nodes). Instrument `l8-dead-controls.cjs`
`--title Video --self-test`, pid 1324, `debug/bridge.json` port 39273. Raw:
`baselines/l8-dead-video.json`.

**42 controls painted, 13 excluded by name, 29 probed, 0 DEAD, 0 GONE, 0 NOT ACTUATED, 0 left
unrestored.** Both self-test controls fired in the same run: the planted handler-less button read
**DEAD** at 0 mutations, the planted marker button read **ALIVE** at 1 and restored itself. Surface
returned to 1,234 chars / 350 nodes / 8 entries / `Recently added36`, `lsSettle` added-and-removed
**0**. `Forward` is `disabled` and reported as presented-disabled, not counted either way.

**THE FIRST TWO RUNS SCORED A CONTROL THEY HAD REFUSED BY NAME.** Row 35 was rostered
`Date A Live II: Kurumi Star Festival` — a series, whose click opens a drawer. It reported ALIVE
and `restoredAfterSecondClick:false` with `dialogs 0→2`, `entries 8→0`, `selects series →
kotoba-whisper|none`: the Media workspace opened over the desktop and the window navigated to the
player. Reproduced three times, and **never** when that card was probed in isolation (4 cards →
4 ALIVE, all restored). Cause, measured directly rather than reasoned: after 25 controls the
roster's element for row 35 was **still `isConnected`** while its own `aria-label` had become
`Emotion 感情表現 ｜ Japanese Podcast with Hana #13` — a standalone file, which **plays**. The library
grid is a virtual list and recycles DOM nodes onto other entries; `rematch()` only re-bound
DETACHED rows, so a recycled-but-attached node was invisible to it. A probe defect in a product
defect's clothes: the run started playback of a real file, wrote watch progress, and filed the
residual under the wrong control's name.

**Fixed in the instrument two ways, and both are reported per run.** `rematch()` now also re-binds
a row whose live element no longer carries its original key, but only when a live element still
holds that key at that ordinal — a cycling control, whose label IS its state, matches nothing here
and is left alone. And every result row now carries `identityAtClick {roster, wore, match}`, read
after the last rematch and immediately before the click. This run: **`identityMatched` 29 of 29,
`identityMismatched` []**, `recycled` 0, `rebound` 47.

**Control for the identity guard itself: FIRED.** Row 35's element was deliberately pointed at row
36's, still attached — `rematch()` returned `detached: 0` but `recycled: 1`, naming both
(`"Date A Live II…" wore "Emotion 感情表現…"`), and re-bound it; `labelNow(35)` read the wrong title
before and the right one after.

**Three exclusions ported from `l1-deadend.js` rather than re-invented**, so the two censuses agree
about what is unsafe: `Open media` and `Add` both reach `window.api.pickMedia()`
(`MediaLibraryBrowser.tsx:259` → `MediaLibraryShell.tsx:396` → `MediaCenterView.tsx:687` →
`MediaContent.tsx:932`) and would hang the app on an OS-modal dialog; `Media workspace` calls
`popOut('player')`; and 4 of 8 cards are standalone files that play — discriminated by the badge
form, `"w / e"` for a series and a duration for a standalone (`MediaLibraryBrowser.tsx:308`).

**Stated denominator.** The 38 controls inside a series drawer are NOT in this census: the roster is
taken on the surface as found, and `rematch()` never adds controls. They are covered by category 2's
sweep on this same surface — 41 targets, coverage 41/41, 0 dead ends (`L1_CLUNKINESS.md`, this tree).
