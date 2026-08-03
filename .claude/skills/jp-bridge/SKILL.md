---
name: jp-bridge
description: >
  Drive the running jp-study-app through its debug bridge to verify behaviour by
  observing side effects. Use whenever a task requires clicking, evaluating JS,
  reading the DOM, measuring computed styles, or screenshotting the live app —
  including verifying a feature actually works, checking a control has a real
  effect, driving or clicking through a surface, measuring the live app or a
  live UI, confirming a fix landed in the running renderer, or reproducing a
  reported defect by hand. Covers profile setup, the bridge endpoints, and the
  measurement traps that produce false results.
---

# Driving jp-study-app through the debug bridge

The app exposes a loopback HTTP bridge in dev builds. It is the **only** sanctioned way to
drive the app. Every trap below has already produced a false finding or a lost measurement in
this repo — they are not hypothetical.

Facts here were verified against source on 2026-08-03 at `88d7ead`. Where something is
inferred rather than verified, it says so.

---

## 0. Before you touch anything: is the app yours?

The dev app on port 5173 belongs to the user, and other agents work in this repo
(there are two other worktrees on a shared object store). **Never start, restart, or kill the
app** unless the task explicitly says to.

Read `/logs` first. Foreign `[vite] hot updated: …` paths for files you are not working on mean
someone else is editing the tree right now. That is a reason to stop and report, not a reason
to kill anything.

```powershell
.\.claude\skills\jp-bridge\scripts\eval.ps1 -Health
```

---

## 1. Profile discipline

**Never point `--user-data-dir` anywhere inside the repo.** Chromium holds
`<profile>/Network/Cookies` locked, Vite's watcher throws `EBUSY`, and **the dev server process
dies**. It presents as "the renderer never became usable" — nothing like its cause. This killed
the developer's own dev server twice before it was diagnosed
(`docs/migration/NEXT_SESSION.md:5-9`, `docs/migration/CURRENT_STATE.md:99-102`).

The existing harnesses solve this by **splitting the two roots**, and you should copy that split
exactly — it is the part people get wrong:

- **The record goes in the repo.** `music-mining-harness.mjs:46` puts `workRoot` at
  `docs/migration/proof/<run>` so the evidence is version-controlled.
- **The profile and fixtures do not.** `scratchRoot` is `$TEMP/jp-music-harness-<stamp>`
  (`:62-63`, `HARNESS_SCRATCH` overrides) and `userDataDir` hangs off it (`:242`).
  `retirement-step3-harness.mjs` does the same with `workRoot` itself in `os.tmpdir()` (`:83`,
  `userDataDir` at `:215`).

Within that scratch root, two profiles, **both copies**:

| Profile | Contents | What it shows |
|---|---|---|
| `scratch/` | empty | the fresh-install view — first-run states, empty states, seed defaults |
| `populated/` | a **copy** of the real profile | the real-data view |

**The real profile is never opened by a harness.** Copy it, drive the copy.

## 2. Back up all of `%APPDATA%\jp-study-app` before any live run

Every file. Not a subset, not the files you expect to touch.

That directory currently holds **64 entries, 18 of them `.json` state files** — `config.json`,
`desktop-layout.json`, `library.json`, `media.json`, `profiles.json`,
`study-orchestrator-v2.json`, and more. You cannot predict which ones a run touches:
`desktop-layout.json` is rewritten synchronously the moment a window moves
(`src/main/desktop.ts:41`, `:46`, `persist()` at `:311` from `:342`/`:356`/`:374`), and moving a
window is something you do incidentally, not deliberately.

```powershell
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $env:TEMP "jp-userdata-backup-$stamp"
Copy-Item -Recurse -Force "$env:APPDATA\jp-study-app" $backup
"$backup"   # write this path into your handoff NOW, before the run
```

**Renderer storage — localStorage and IndexedDB — has no restore point at all.** A run that
mutates renderer state mutates it permanently. Know before you click whether the control you
are about to exercise writes there.

## 3. Connecting

The app writes `debug/bridge.json` = `{port, token, pid, started}` when the bridge comes up
(`src/main/debugBridge.ts:421-426`). Port is the fixed constant **39273**
(`debugBridge.ts:21`). Bind is `127.0.0.1` only; anything off-box gets 403 (`:397`). Every
request needs `Authorization: Bearer <token>` or it gets 401 (`:402`).

**The bridge only exists in a dev-server run.** Two independent gates:
`startDebugBridge()` is called only under `if (isDevServer())` (`src/main.ts:1419`), where
`isDevServer()` is `!!MAIN_WINDOW_VITE_DEV_SERVER_URL` (`src/main.ts:472-474`); and the function
itself hard-stops on `if (app.isPackaged) return;` (`debugBridge.ts:380`). So:

- **No `bridge.json` ⇒ no dev-server app is running.** A packaged build never has a bridge —
  do not wait for one to appear, and do not conclude "the app is broken".
- A **stale-looking** `bridge.json` whose port refuses connections: the server logs
  `[debugBridge] disabled: …` and nulls itself if the port is taken (`:415-418`), and clears the
  file on clean shutdown (`:450`). A leftover file therefore means an unclean exit.
  *(This reading is inferred from source, not tested.)*

Use the scripts in `scripts/` — they read port and token themselves and take no credentials as
arguments.

---

## 4. The endpoints

Full route set, from the `switch` at `debugBridge.ts:206-375`:

| Route | Method | Body / query | Notes |
|---|---|---|---|
| `/health` | GET | — | `{ok, version, windows[]}` — every window with `bounds`, `visible`, `focused`, `minimized`, `maximized` |
| `/logs` | GET | `?limit=&level=&match=` | ring buffer, 2000 entries max |
| `/clear-logs` | POST | — | |
| `/eval` | POST | `js`, `window` | see §5 |
| `/dom` | POST/GET | `selector`, `window`, `maxChars` | `outerHTML`, default cap 40000, sets `truncated` |
| `/text` | POST/GET | `selector`, `window` | `innerText` |
| `/screenshot` | POST | `window` | see §7 |
| `/click` | POST | `x`, `y`, `window`, `button`, `clickCount` | see §6 |
| `/type` | POST | `text`, `window` | per-character `char` events |
| `/key` | POST | `key`, `modifiers[]`, `window` | |
| `/focus` | POST | `window` | see below — **use this** |
| `/reload` | POST | `window` | |

`window` accepts a numeric id, `"focused"`, `"main"`, or a substring matched against title/URL
(so `"blanc"` or `"mini"` work) — `resolveWindow`, `debugBridge.ts:147-170`. Note `"main"` is
resolved as *the window whose URL has no query string*, because companion windows all carry one
and `getAllWindows()` order is not creation order (`:119-141`).

### `/focus` is not optional before a measured interaction

Chromium **throttles `requestAnimationFrame` in a non-foreground window**. An effect that
reveals a panel on the next frame simply never runs while you drive an unfocused window — and
the pass then cannot tell a real defect from the harness. This is documented in the endpoint's
own comment (`debugBridge.ts:341-348`). `/focus` restores if minimised, shows, raises, focuses,
and calls `app.focus({steal:true})`, which is what makes it actually take effect on Windows.

**Focus the window before measuring anything that animates or reveals.**

---

## 5. `/eval` mechanics — single expression, no await

The code field is named **`js`** (`debugBridge.ts:229`), and it is spliced into `(${code})`
inside an IIFE (`:234-238`). Consequences, all load-bearing:

- **It must be a single expression.** Statements, `const`, and `return` at top level are a
  syntax error. Use an IIFE — `(() => { … })()` — when you need statements.
- **It does not await.** A promise serializes to `{}`. There is no async form.
- **`undefined` becomes `null`** (`__r ?? null`, `:235`). `{ok:true, result:null}` cannot tell
  you whether the property was absent or genuinely null. If that distinction matters, probe
  `typeof x` or `'k' in obj` instead of the value.
- **On a serialization failure the expression runs a SECOND time.** The `catch` re-evaluates
  `(${code})` to stringify it (`:236`). So an expression that both has a side effect *and*
  returns something non-cloneable — a DOM node with circular refs, `window`, a React fiber —
  **applies its side effect twice while looking like one call**. Always end a side-effecting
  eval with a cheap serializable value:

  ```js
  (() => { document.querySelector('#save').click(); return 'clicked'; })()
  ```

  not `document.querySelector('#save').click()` and never a bare element.

### Awaiting a promise: stash on a global, poll in a second call

Because there is no await, the only correct pattern is two calls.

```powershell
# call 1 — kick it off, stash the settled state on a global, return immediately
.\.claude\skills\jp-bridge\scripts\eval.ps1 -Js @'
(() => {
  window.__probe = { done: false };
  window.api.study.prepare({ deckId: 'x' })
    .then(r => { window.__probe = { done: true, ok: true, value: r }; })
    .catch(e => { window.__probe = { done: true, ok: false, error: String(e) }; });
  return 'started';
})()
'@

# call 2 — poll until done
.\.claude\skills\jp-bridge\scripts\eval.ps1 -Js 'window.__probe' -Poll
```

`eval.ps1 -Poll` does exactly this wait loop and fails loudly on timeout rather than returning
a half-settled object. **Clean up your globals** (`delete window.__probe`) so the next probe
cannot read a previous run's answer — a stale global is one of the easiest ways to "confirm"
something that never happened.

---

## 6. Clicking: hit-test first, every time

The app stacks draggable windows in one DOM. **A coordinate click can land on a different
window than the one you meant**, and the result looks like "the control did nothing" — which is
exactly the false finding an audit is supposed to avoid.

**Call `elementFromPoint` before every click and confirm the element under the point is your
target.** `click.ps1` does this and refuses when it does not match.

```powershell
.\.claude\skills\jp-bridge\scripts\click.ps1 -Selector '#deck-save' -Window main
```

Known limits, from `docs/migration/TEST_EVIDENCE.md:68-75`:

- Inside the main window, `.fwin-max` surfaces re-raise unpredictably and rail items often fail
  to activate **even at exact `getBoundingClientRect()` centres**. This is an instrumentation
  limit, **not a product bug** — do not report it as one.
- **Working procedure:** pop the surface into its own OS window (the `⧉` "Pop out into its own
  window" control), then drive it with `{window: <id>}`. Inside a popped-out window, **send the
  same click twice** — the first focuses the window, the second activates the control. This was
  reliable every time. `click.ps1 -Twice` does this.

## 7. Screenshots corroborate; they do not decide

`/screenshot` **returns JSON and writes the file itself** (`debugBridge.ts:294-299`):
`{ok, path, size}`, PNG written to `debug/shots/win<id>-<epoch>.png`.

- `size` is `image.getSize()` — a `{width,height}` **dimension object, not a byte count**.
- **Do not pipe the response body to a `.png`.** The body is **~137 bytes** of JSON (measured for
  a typical path at 1920×1080); you get a tiny JSON file with a `.png` name and then "read" an
  image that is not one. Take `path` from the parsed response.

Two traps:

1. **The capture lags exactly one call.** A screenshot taken immediately after a click shows the
   **previous** frame. Reproduced 6× (`docs/migration/TEST_EVIDENCE.md:76-78`). Insert any
   second round-trip — `eval.ps1 -Js '1'` is enough — between the interaction and the capture.
   Every "the click did nothing" screenshot should be suspected of this first.
2. **A brand-new window can fail to capture once.** `UnknownVizError` was observed immediately
   after a pop-out window was created, and succeeded on the following call
   (`docs/migration/TEST_EVIDENCE.md:79-81`). Give a new window one round-trip before capturing.
   *(An occlusion theory for this error circulates in dispatch notes; nothing in this repo
   supports it and it is unverified. Treat the failure as retry-once, not as evidence about
   window stacking.)*

**Geometry and computed styles are the primary channel.** `getBoundingClientRect()` and
`getComputedStyle()` through `/eval` are what a finding rests on. A screenshot is corroboration
for a human reader — it never decides a verdict.

## 8. Refuse to score a minimised window

In a minimised window **every box measures 0×0**, and a naive check — "is anything overflowing?",
"is the contrast ratio acceptable?", "does it fit?" — **scores 0×0 as perfect**. This is a
silent pass, the worst kind.

Check first and **refuse rather than record zeros**:

```js
(() => {
  const s = document.querySelector('.fwin[data-id="settings"]');
  if (!s) return { refuse: 'section not found' };
  const d = getComputedStyle(s).display;
  if (d === 'none') return { refuse: 'window not displayed — measurement invalid' };
  return { ok: true, rect: s.getBoundingClientRect().toJSON() };
})()
```

`/health` also reports `minimized` per window — check it before a measurement pass and use
`/focus` (which restores) rather than measuring through it.

## 9. Freeze the tree during a measured run

**No `src` edit while a harness is up.** HMR lands in the renderer *under measurement*, so the
thing you measured is not the thing you shipped, and the two halves of a before/after comparison
are different builds. Finish the run, then edit.

## 10. Restoring afterwards

**Stop the whole process tree first, then hash.** Hashing a runtime file while the app is
running measures the app writing its own in-memory state back to disk — you get a mismatch that
has nothing to do with your run, and chase it.

```powershell
# 1. stop everything, and confirm it is stopped
# 2. only then:
Get-ChildItem -Recurse "$env:APPDATA\jp-study-app" -File |
  Get-FileHash | Select-Object Path, Hash
```

Compare against the backup from §2. Restore anything that moved and was not supposed to.

## 11. Never use desktop remote control

No `nut.js`, no PowerShell `SendKeys`, no OS-level mouse or keyboard automation, no screen
capture outside the bridge. The bridge is the only sanctioned channel: it is loopback-only,
token-authenticated, and it cannot escape the app's own windows. Anything else can act on
whatever the user happens to have focused.

---

## Scripts

In `.claude/skills/jp-bridge/scripts/`. Each reads port and token from `debug/bridge.json`
itself, **takes no credentials as arguments**, and fails loudly (non-zero, with a message)
rather than returning an empty result.

| Script | Use |
|---|---|
| `eval.ps1` | `-Js <expr>` post an expression · `-Poll` stash-and-poll for promises · `-Health` |
| `click.ps1` | `-Selector <css>` hit-tests with `elementFromPoint` and refuses on mismatch · `-Twice` |
| `shot.ps1` | `/screenshot`, parses JSON, returns the written path, reports the retry-once viz failure distinctly |

> **Unverified:** these scripts have been checked for argument handling and for the no-bridge
> path only. They have **never been run against a live app**. Exercise all three in one live run
> before depending on them for a finding.
