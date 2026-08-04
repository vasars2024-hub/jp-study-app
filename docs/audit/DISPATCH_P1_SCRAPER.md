# DISPATCH P1 — Probe the Scraper, live

Cold agent, `jp-study-app`. You hold the **live queue exclusively** for this run.

---

## 0. Read first

1. `.claude/skills/jp-dispatch/SKILL.md` — working rules. Follow it.
2. `.claude/skills/jp-bridge/SKILL.md` — how to drive the app. **Use its scripts in
   `scripts/`; they are smoke-tested and passing** (`docs/audit/SMOKE_TEST_JP_BRIDGE.md`).
3. `.claude/skills/honesty-probe/SKILL.md` — the probes, verdicts and **row schema**. Emit its
   schema exactly; your table gets concatenated with others.
4. `.claude/skills/claim-check/SKILL.md` — before you report any count.
5. `docs/audit/CENSUS_SURFACES.md` + `CENSUS_SETTINGS.md` — **your denominator.**

## 1. Why the Scraper

It is the only surface with an honesty registry (`components/scraper/featureStatus.ts`), it is
the one the user named, and B0 measured that **26 of the app's 35 depth-3 surfaces sit behind
it** (19 settings-drawer categories + 7 result tabs) along with **all 34 orphan settings keys**.
It is the densest concentration of un-probed surface in the app.

## 2. Ownership

Create/edit **only** `docs/audit/HANDOFF_P1_SCRAPER.md` and `docs/audit/FINDINGS_P1_SCRAPER.md`.
Everything else read-only. **Do not commit, branch or `git add`** — the orchestrator commits.

**Do not fix anything.** Stage B's verdict is **document-don't-fix**: a dishonest control is
resolved by a `KNOWN_ISSUES.md` row and an honest label, not by building the missing backend.
You are producing the evidence for that, not the fix.

## 3. Running the app — read this or you will lose an hour

```
npx electron-forge start -- --user-data-dir=%TEMP%\jp-p1-scratch
```

- **`npm start -- --user-data-dir=X` DOES NOT WORK** — npm's `--` hands the flag to
  `electron-forge`, which rejects it. The second `--` is required.
- **Never put the profile inside the repo.** Chromium locks `<profile>/Network/Cookies`, Vite's
  watcher throws `EBUSY`, and the dev server dies presenting as "the renderer never became
  usable".
- **Never open `%APPDATA%\jp-study-app`.** It is 8.7 GB of the user's real data.
- The bridge takes **~40 s** to appear. Wait for `debug/bridge.json`. If you watch a log for
  readiness, **truncate it first** — a previous watcher false-failed on a stale line from an
  earlier attempt.
- **A fresh profile opens behind a full-viewport consent gate** (*"Put your country on the
  map?"*, buttons *Share my country anonymously* / *No thanks*). **Dismiss it first or every hit
  test fails.** Choose **No thanks** — do not send telemetry on the user's behalf.
- A fresh profile has **zero** floating windows and **zero** desktop icons. You must open the
  Scraper yourself, and say how you opened it.
- Shut down with `eval.ps1 -Js "(() => { setTimeout(()=>window.close(),200); return 'closing' })()"`.
  `bridge.json` disappearing is the clean signal.

## 4. What to probe

Walk **every** surface in your denominator — all 19 drawer categories and all 7 result tabs —
and report `visited / enumerated`. If you cannot reach one, that is a **Probe D or F finding**,
not a gap in your work.

Apply probes **A–F** per `honesty-probe`. Specific standing claims to settle by driving:

| Claim | Status |
|---|---|
| `DataPages.tsx:410` `const freeBytes = 412 * 1024 ** 3` rendered as "free 412 GB" beside a storage warning whose threshold derives from that invented number | **still in the tree** — confirm what the user sees |
| `DataPages.tsx:1004` `stageBreakdown()` multiplies real total time by fixed weights (0.08/0.34/0.31/0.16/0.11) and renders it as a per-stage diagnostic chart | **still in the tree** — every job will show the identical shape |
| `ManagementPages.tsx:212,327` `STARTER_SCHEDULES` seeds two schedules on **every fresh install** with past run-dates and `targetUrl: https://example-anime-site.com/...` — a domain that does not exist, and "Run now" starts a real job against it | **still in the tree** — you are on a fresh install, so you will see exactly this |
| Dashboard "Recent anime" / "Source health" click handoffs were dead (bare fixture ids vs per-job ids; fixture source ids vs real ones). The code now reads `entry.seriesId` / `source.id` and **looks** fixed | **hypothesis — click them and see where you land** |
| Write-side controls that only `setState` and print success: torrent pause/recheck/remove, plugin enable/update/install, download pause/retry/cancel, "Queue selected" | confirm each; **reload the page and check whether the effect survived** |
| **34 orphan settings keys**, all in this app — `performance` 5-of-7, `logging` 7-of-9, `export` 7-of-8 | statically found by B0. Flip a representative sample, assert the persisted file changed, restart, assert behaviour does not differ |

**Probe F on this app specifically:** 19 drawer categories is a lot of surface. How much of it is
a settings page pretending to be a feature? Use the control-type histogram, the empty/loading/error
state check, and the lazy-CSS proxies. `scraper.css` is 101 KB — measure with `css-measure`'s
rules, not by eye.

## 5. Evidence discipline

- **A click that prints success is not a passing control.** Assert a side effect: an IPC call, a
  changed persisted file, or state that survives a reload. *An "update" that vanishes on reload
  never happened.*
- **`/screenshot` lags one frame** — a capture straight after a click shows the previous frame.
  Insert any second call between them. Geometry and computed styles decide; screenshots
  corroborate.
- **`/eval` re-evaluates your expression a second time if the result fails to serialize**
  (`debugBridge.ts:236`). A side-effecting expression returning something non-cloneable
  **double-applies while looking like one call.** Return a primitive or a plain object.
- Use `click.ps1` — its hit-test guard already caught a full-viewport overlay that would have
  produced a fabricated "the control does nothing" finding. **If it refuses, believe it.**
- Restore nothing at the end except: stop the app, confirm `bridge.json` is gone, and confirm you
  never touched `%APPDATA%`.

## 6. Handoff

`docs/audit/FINDINGS_P1_SCRAPER.md` — the rows, in `honesty-probe`'s schema, with
`visited / enumerated` stated per area.
`docs/audit/HANDOFF_P1_SCRAPER.md` — written **as you go**: what you drove and how, what you
could not reach and why, every count re-derived rather than repeated, anything where the registry
under- or over-claims, and defects noticed in code you do not own.

**If you run low on budget, write the handoff first and the prose last.** A run that dies at its
limit usually dies *after* doing the work.

## 7. Scope

Scraper only. Do not probe other apps, do not fix, do not touch `.gitignore`, `styles.css`, or
any file outside your two.
