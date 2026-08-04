# GrammarX §7.1 — closed out

**Run:** 2026-08-04 by the orchestrator, completing what P2 left when it hit its session limit.
Fresh scratch profile; `%APPDATA%\jp-study-app` never opened.

## All four standing defects, settled

`GRAMMARX_REDESIGN_PLAN.md` §7.1 has carried these since 2026-07-19.

| # | Defect | Verdict | Evidence |
|:-:|---|---|---|
| 1 | "No category" chip reads 0 while **852** records lack categories | **RESOLVED BY OBSOLESCENCE** — not fixed, overtaken | Review mode reads `Imported examples 706 · No examples 1239 · **No category 0** · Reviewed 0`. B6 and P2 independently re-derived uncategorised as **0%**, so 0 is correct. The plan describes a corpus that no longer exists |
| 2 | Filter-sidebar label/count collisions | **FIXED** | P2, proven with a positive control that reproduced the defect exactly then restored |
| 3 | Raw study-language code `· ja` leaking into the Grammar Test dialog | **FIXED** | Dialog reads *"2,410 points match your filters. Choose how many cards to practice."* — no raw code anywhere in the window |
| 4 | Saved-filter dropdown resets its label after loading a preset | **STILL LIVE** | `GrammarExplorer.tsx:337` pins `value=""`; P2 drove it end-to-end |

**Three of four resolved, one open.** The plan text should be updated — two of its four entries now
describe states that no longer exist, which is itself a `PROMISE_REGISTER` row.

## A positive finding, recorded because an audit that only finds defects is not measuring

The plan warns that nothing is `verified` until a human works the review queue and **"the UI must
not imply otherwise"**. It does not. Review mode states plainly:

> **64 of 2,410 entries verified by a human.**

and shows `Reviewed 0` for the current session. Both numbers are honest about the corpus's
incompleteness. This is the opposite of the Scraper's fabricated confidence.

---

## Two false findings I nearly filed, and how each was caught

Recorded because the audit's own instrument errors are part of its output.

### 1. "The filter category buttons collide" — an `innerText` artifact

Reading the Practice surface returned `Time & sequence284`, `Cause & reason189`,
`Condition & hypothesis199` — apparently the exact defect §7.1 reported.

It is not. **`innerText` concatenates adjacent inline elements with no separator.** P2 measured the
*geometry* and found a real 6px gap, with a positive control proving the CSS fix load-bearing.
Reporting my reading would have re-opened a correctly-closed defect.

> Worth noting: this may well be how the original §7.1 report was produced. A text-level reading
> and a geometric one disagree here, and only the geometric one is measuring the thing the defect
> is about.

### 2. "Grammar cannot be reopened after closing" — the instrument was reading the wrong window

Sequence: I clicked `.fwin button`, the Grammar window vanished, and every subsequent Start-menu
click on Grammar registered but produced **no window** — while a control (Dictionary) opened
normally. That looked like a reproducible, app-specific, user-facing bug.

`/health` showed the truth: **two Electron windows**, and window 2 was
`http://localhost:5173/?popout=grammar`.

**`.fwin button` matched `⧉`, the pop-out control — the first button in the window chrome.** Grammar
had moved into its own OS window, and the shell then correctly declined to duplicate it. My probe
was evaluating window 1 only, so the content looked absent.

Two lessons, both already in this project's record and both re-earned here:

- **`click.ps1`'s hit-test guard cannot save you from a bad selector.** It verifies the click lands
  on the element you named; it cannot know you named the wrong one. The guard reported
  `hitTest: match` and was right to.
- **Always confirm which document you are measuring.** `/health` enumerates every window; a probe
  that assumes one is measuring a subset it never declared. This is the same family as the recorded
  CDP trap where a target filter matched `about:blank` and every `localStorage` read failed for
  reasons that looked like permissions.

**Method note carried forward:** after any click on window chrome, re-read `/health` before
concluding anything about what exists.
