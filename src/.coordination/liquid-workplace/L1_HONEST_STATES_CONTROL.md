# L1 — category 8's missing control, and the crash it found on the first click

Authority: `src/LIQUID_UI_RUBRIC.md` **category 8**. This closes the gap
`L1_HONEST_STATES.md` left open: that pass recorded category 8 as **VOID, not scored**, because
both induced-failure attempts SUCCEEDED — AnkiConnect was up and an AI provider was configured, so
the error and offline states were never observed.

Instruments: `probes/l1-honest-states-control.js` + `-read.js`. Fix and guard:
`src/renderer/components/DictionaryResults.tsx`,
`src/renderer/__tests__/dictionaryUnreachableAnkiHooks.test.tsx`.

## How the failure was made genuine

`ankiUrl` reaches the client through `ProfileStore.getAnkiUrl()`, wired once at
`main/anki/index.ts:837`, reading a `schema` loaded in the store's constructor
(`main/profiles.ts:80`). No IPC channel sets it and **main does not hot-reload**, so it cannot be
moved from the renderer and cannot be moved live. The control is therefore
`userData/profiles.json` → `"ankiUrl": "http://127.0.0.1:1"`, a **closed loopback port**, chosen so
the connection is *refused* rather than hanging — a hang is indistinguishable from a slow success.
The app was stopped for the edit (the store is that file's single writer) and restarted around it.

**The control fired, measured at the IPC layer before any UI claim:** `window.api.ankiStatus()` →
`{connected: false, decks: [], models: [], error: "Can't reach Anki. Open Anki desktop and make
sure the AnkiConnect add-on is installed."}` in **1 ms**, with `profileGet().ankiUrl` reading back
`http://127.0.0.1:1`. Same call before the restart returned connected.

**Capture-patch-restore, verified mechanically.** `profiles.json` SHA256
`BAE2E1248ACFEA0DF0860FED560C0B2508EF60718764488E5FEECC3897E448E4`, 66,386 bytes, restored and
re-hashed to the same value with PowerShell `-ceq` → **True**, `ankiUrl` back to
`http://127.0.0.1:8765`. Not checked by eye.

## What the control found: the desk disappeared

State driven: `data-theme=forest-night`, `lang=en`, Dictionary 820×580 raised, **8 `.dict-entry`
results for 食べる**, four `.fwin` windows on the desk (Anki, Scraper, Dictionary, Media).

**One bridge click on "+ Add to Anki" took the desk from 4 windows to 0.** Renderer globals
survived, so it was not a reload. `/logs` named it:

> `Error: Rendered fewer hooks than expected. This may be caused by an accidental early return
> statement. The above error occurred in the <DictionaryResults> component. React will try to
> recreate this component tree from scratch using the error boundary you provided,
> AppErrorBoundary.`

The chain, all in `DictionaryResults.tsx`: `addToAnki` → `ensureAnki()` → `ankiStatus()` →
`connected: false` → `setShowSetup(true)` (`:391`) → the next render takes the `showSetup` early
return, which sat **above** the `knowledge` `useMemo` → one hook fewer than the previous render →
`AppErrorBoundary` recreates the tree and every floating window goes with it.

This is why the earlier pass never saw it: on the **success** path `showSetup` stays false and the
hook count never changes. The defect lives only on the failure path — exactly the path a control
exists to reach.

**Fix:** `entries`, `gradable` and the `knowledge` `useMemo` hoisted above the `if (showSetup)`
return, with the reason recorded at the hook. No behaviour moved; only render order.

**Guard:** `dictionaryUnreachableAnkiHooks.test.tsx` asserts on the **transition** — `ankiStatus`
returns connected on call 1 and disconnected on call 2, in one mounted component. Asserting the
disconnected end state alone would pass against the broken code, because a component that mounts
straight into `showSetup` never changes its hook count. **Mutation control: with the hoist
inverted the test fails with the identical `Rendered fewer hooks than expected`; restored, it
passes.**

## Category 8 re-measured after the fix

Same refused port, same 8-result state, logs cleared before the click:

| State | Verdict | Observed |
| --- | --- | --- |
| Error | **LIVE** | "Can't reach Anki. Open Anki desktop and make sure the AnkiConnect add-on is installed." followed by the four-step AnkiConnect install walkthrough |
| Windows surviving the failure | **4 of 4** | was 0 of 4 before the fix |
| Raw i18n keys in the failure state | **0** | `lang=en` only — see the limit below |
| `/logs?level=error` after the run | **total 0** | was 1 (the hooks violation) |

**Category 8 is still NOT a 10, and the reason is now a different one.** The error state is real
and named; what remains unmeasured is: the **offline** state (distinct from a refused host — an
unroutable address that times out rather than refusing was not driven); raw-key counting in
**ja/zh/ru**, since this run was `lang=en` only, and the rubric requires 0 in all four; and the
dead-control and fabricated-value counts, which `l1-honest-states.js` deliberately does not claim.

## Traps for the next worker

- **A `.fwin` count of 0 with globals intact is a boundary tear-down, not a reload.** Check
  `/logs` before assuming the probe lost its handle to the window.
- The Dictionary's Add button was at **216,613** in this state, and the Search button moves
  **894 → 884** once `Save search` appears. Re-resolve every coordinate; never cache one.
- Restoring the tree with `/reload` brings all four windows back, but the search state is gone —
  re-drive 食べる before re-arming anything.
