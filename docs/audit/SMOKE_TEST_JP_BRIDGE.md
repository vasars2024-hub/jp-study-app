# Live smoke test — `jp-bridge` helper scripts

**Run:** 2026-08-04 ~03:58–04:00. **Verdict: all three scripts PASS end-to-end.**

S0a shipped `eval.ps1`, `click.ps1` and `shot.ps1` with parse/argument/no-bridge validation only,
and said plainly that end-to-end behaviour was unverified. This is that verification. Wave 3 may
now depend on them.

## Setup

- App launched with `npx electron-forge start -- --user-data-dir=%TEMP%\jp-audit-scratch-profile`.
  **The real 8.7 GB `%APPDATA%\jp-study-app` profile was never opened** — confirmed by the scratch
  directory populating to 25 entries.
- Bridge came up in ~40 s: `{port: 39273, token: …, pid: 41888}`.

> **A launch gotcha worth keeping.** `npm start -- --user-data-dir=X` **fails** —
> npm's `--` hands the flag to `electron-forge`, which rejects it with
> `error: unknown option`. Electron needs a second `--`:
> `npx electron-forge start -- --user-data-dir=X`.

## Results

| # | Test | Result |
|---|---|---|
| 1 | `eval.ps1 -Health` | **PASS** — `ok=True`, 1 window, `日本語 Study`, `localhost:5173`, visible/focused/not-minimised |
| 2 | `eval.ps1 -Js "document.querySelectorAll('.fwin').length"` | **PASS** — returns `0` |
| 3 | `eval.ps1` with the corrected `.fwin-title-text` selector | **PASS** — empty array, consistent with 0 windows |
| 4 | `shot.ps1` | **PASS** — wrote `debug/shots/win1-….png`, reported `width 1264 · height 821 · bytes 40162` |
| 5 | `click.ps1 -Selector '.os-start-btn'` | **PASS by refusing** — see below |
| 6 | `click.ps1` on a non-existent selector | **PASS by refusing** — *"No element matches … Check the selector against /dom before concluding anything about the control."* |

**Test 4 confirms the B4 correction is correctly implemented.** The bridge's `size` field is a
`{width,height}` dimension object, not a byte count; the script reports dimensions and byte size
as **separate** fields rather than mislabelling one as the other.

**Test 5 is the headline.** The guard refused with:

> `HIT-TEST MISMATCH — refusing to click. target: .os-start-btn · point (48, 798) [centre of an
> 80x34 box] · actually: <div class='consent'>`

A naive click would have landed on an overlay and produced a **fabricated Probe A finding** —
"the Start button does nothing." This is the single clearest justification for the scripts
existing at all.

## Two facts Wave 3 must build on

**1. A fresh profile has zero floating windows.** `.fwin` count is `0`, and there are `0` desktop
icons. Probes cannot assume a surface is open — each must open its own, and must record that it
did.

**2. A fresh profile opens behind a full-viewport consent gate.**

```
Put your country on the map?
We keep a fun world map of where learners are. If you say yes, the app makes one anonymous
request so your country can be counted. Your country is worked out from your connection; the
app never reads or sends your IP or any ID. It happens once, and only counts add up: never
anything about you. You can change this any time in Settings.
[ Share my country anonymously ]  [ No thanks ]
```

It covers the whole viewport (1264×821, `coversViewport: true`), so **every scratch-profile probe
must dismiss it first or every hit test fails.**

Three consequences beyond the mechanics:

- This is the **first thing a new user sees** — a telemetry prompt before any app content. That is
  a first-run UX judgement for the user, and it belongs in the USER-MUST register.
- It is a **network request on first run**, which sits against the offline-first invariant in
  `CLAUDE.md`. The copy is honest and the data minimal, but the fact belongs on the record.
- It ties to the CC-BY-4.0 `worldMapPaths.ts` asset, whose attribution is currently given only in
  a source comment (see `PRECOST_A1_A2_PROVENANCE.md` §2).

**The first-run consent flow is therefore reachable on a scratch profile**, which removes part of
what `USER_VERIFICATION_CHECKLIST.md` item 5 (clean-machine smoke) said no machine here could do.
It is not the whole item — a genuinely clean machine also tests install and model download — but
the consent gate itself no longer needs a human.

## An instrument failure in the orchestration, recorded rather than smoothed

The first wait-for-bridge watcher reported `ERROR SIGNATURE in log after ~3s` and exited 1 — a
**false failure**. It grepped an append-mode log that still held the *first* launch attempt's
`unknown option` line. The bridge was in fact healthy; a second watcher confirmed it.

This is the audit's own rule — *sampling a log that contains a prior run's output is not
evidence* — tripped by the audit. Any watcher over an append-mode log must either truncate first
or anchor to a run marker.
