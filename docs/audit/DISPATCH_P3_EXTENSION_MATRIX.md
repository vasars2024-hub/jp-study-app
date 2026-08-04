# DISPATCH P3 — the extension feature truth matrix, driven

**Account:** claude-x. **Branch:** stay on `audit/a-evidence`. **Do not commit** — the orchestrator
commits. Write only the two files you own.

## Read first

- `.claude/skills/jp-dispatch/SKILL.md` — the rules. The **mandatory read-back** has caught a
  fabricated number in four of four prior runs. It applies to you.
- `.claude/skills/honesty-probe/SKILL.md` — verdict vocabulary and the probe definitions.
- `docs/audit/FINDINGS_EXTENSION_BRIDGE.md` — what is already established. Do not re-derive it;
  do not trust it either. It records the harness recipe you need.

## You own exactly

- `docs/audit/FINDINGS_P3_EXTENSION_MATRIX.md`
- `docs/audit/HANDOFF_P3_EXTENSION_MATRIX.md`

Nothing else. Not `.gitignore`, not the matrix doc itself, not `src/**`.

**Write the handoff incrementally, from your first measurement.** Two prior runs died at their
session limit and lost nothing *only* because they had been writing as they went. Assume you will
be cut off without warning.

## The task

`EXTENSION_FEATURE_TRUTH_MATRIX.md` has **35 feature rows** (not 47 — the audit carried that figure
without counting; verify the count yourself and report what you get). Each row asserts a v3.0.0
"After" state. Your job is to give each row a driven verdict.

Verdicts: `LIVE` · `DEAD` · `FIXTURE` · `MIXED` · `BROKEN` · `NOT-REACHABLE`.

`NOT-REACHABLE` **with a stated reason is a result, not a gap.** Several rows will land there and
that is correct. Inventing a `LIVE` from a code read is the one outcome that poisons the file.

## Harness — this is the only combination that works

Branded Chrome 150 **dropped `--load-extension` entirely**; neither
`--disable-features=DisableLoadExtensionCommandLineSwitch` nor `--enable-unsafe-extension-debugging`
restores it. A run against branded Chrome reports "no extension, no content script" on a perfectly
healthy extension — a false negative that has already been produced once in this project.

Use the Playwright Chromium binary:

```
C:\Users\Arseniy\AppData\Local\ms-playwright\chromium-1228\chrome-win\chrome.exe
  --disable-extensions-except=<repo>\extension
  --load-extension=<repo>\extension
  --remote-debugging-port=9222
  --user-data-dir=%TEMP%\<your-own-scratch-name>
```

Drive it over CDP. **Do not install `ws`, `playwright`, or `puppeteer`** — adding a dependency to the
repo in order to audit the repo is not acceptable. Node 24 ships a **native `WebSocket`**; a ~40-line
CDP client is enough. Working examples are in the orchestrator's scratchpad:

```
<scratchpad>\cdp-probe.mjs      # enumerate targets, evaluate in the service worker
<scratchpad>\cdp-content.mjs    # navigate a tab, assert content-script injection
```

Copy them into **your own** scratch dir and extend. Do not write .mjs helpers into the repo.

### Three traps, all previously paid for

1. **Identify the extension by `chrome.runtime.getManifest().name`**, never by URL or by "the only
   service worker". CDP lists Chrome's own component extensions as targets; one of them
   (`…ome/thunk.js`) has already been mistaken for a pass in this project. Expect
   `GrammarX — Reader Companion`, version `3.2.0`.
2. **Kill by `ExecutablePath` match, not `chrome.kill()`.** One launch produced **13** Chromium
   processes; a single kill left twelve holding port 9222, and the next run would silently measure
   the previous browser. **Never touch the user's real Chrome** — filter on the Playwright path.
3. **Async.** Never click and assert in one evaluation. This has produced false findings four times
   this session, including in the orchestrator's own probe code.

## The app side must be running for most rows

The extension talks to the app's server on `127.0.0.1:18765`. Start the app on **your own scratch
profile** — never the real one:

```
npx electron-forge start -- --user-data-dir=%TEMP%\<your-own-scratch-name>-app
```

Note the doubled `--`: npm/forge eats the first one. The bridge takes up to ~40 s. A fresh profile
opens behind a **full-viewport telemetry consent gate** — dismiss it with **"No thanks"**. Do not
consent to telemetry on the user's behalf.

`/v1/health` is unauthenticated; **every mutating route requires a Bearer pairing token.** If a row
cannot be driven because you have no paired token, that is `NOT-REACHABLE — requires pairing`, and
say so.

## HARD SAFETY RULES

1. **Never write to the user's Anki.** `Save word`, `Save sentence`, `Create card`, `forceAnki` and
   the queued mining paths reach AnkiConnect on a fixed local port, which is **not** isolated by a
   scratch Electron profile. The user's real collection has **84 decks / 35 note types** and already
   carries stray `JP Study App::*` test residue from earlier sessions that only they can delete.
   AnkiConnect has **no `deleteModel`** — anything you create is permanent.
   If a row's only honest verdict needs a write, the verdict is
   `NOT-REACHABLE — would mutate the user's real collection`. **That is a correct answer.**
2. **No downloads.** `Download video` / YouTube rows: verify the control's *state and page-awareness*
   (enabled on YouTube, disabled off it). Do not start a transfer.
3. **Do not touch the real Electron profile** (`%APPDATA%\jp-study-app`). Its newest write is
   `8/2/2026 9:40 AM`; it must still be that when you finish. Check and report it.
4. **Use public/neutral test pages only** — a Wikipedia article for Japanese text, a YouTube watch
   page for the video rows. Do not open the user's history, accounts, or anything logged-in.
5. **Clean up**: kill the Playwright tree by path, shut the app via its own `window.close()`, remove
   your scratch dirs, and confirm `debug/bridge.json` is gone.

## Report

For each row: the matrix's claim, what you drove, the observable you asserted on, and the verdict.
A verdict with no observable is not a verdict.

State your denominator: rows attempted / 35, and rows `NOT-REACHABLE` with reasons grouped. Also
report the row count you measured, since the audit's own figure was wrong.

Finally — **re-read your own output before you finish and assert every number in it against
something you actually ran.** Four of four prior agents put at least one unmeasured number in their
first draft; two of them did it inside the skill that forbids exactly that.
