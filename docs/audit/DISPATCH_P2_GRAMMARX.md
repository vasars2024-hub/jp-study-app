# DISPATCH P2 — Probe GrammarX, live

Cold agent, `jp-study-app`. You hold the **live queue exclusively**.

## 0. Read first

`.claude/skills/jp-dispatch/SKILL.md` · `.claude/skills/jp-bridge/SKILL.md` (use its `scripts/`)
· `.claude/skills/honesty-probe/SKILL.md` (**emit its row schema exactly**) ·
`.claude/skills/claim-check/SKILL.md` · `docs/audit/CENSUS_SURFACES.md` for your denominator ·
`docs/audit/PROMISE_REGISTER.md` — B6 already re-derived this corpus and **found six of eight
figures in the plan doc wrong**. Start from its numbers, not the plan's.

## 1. Ownership

Only `docs/audit/FINDINGS_P2_GRAMMARX.md` and `docs/audit/HANDOFF_P2_GRAMMARX.md`.
**Do not commit, branch or `git add`.** **Do not fix anything.**

## 2. Running the app

```
npx electron-forge start -- --user-data-dir=%TEMP%\jp-p2-scratch
```

- `npm start -- --user-data-dir=X` **fails** — npm's `--` goes to forge; the second `--` is required.
- Never put the profile in the repo. Never open `%APPDATA%\jp-study-app` (8.7 GB of real data).
- Bridge takes ~40 s. If you watch a log, **truncate it first**.
- **Fresh profile opens behind a full-viewport consent gate** — dismiss with **No thanks**.
- Zero windows, zero desktop icons on a fresh profile. Open your own surface; say how.
- **`node tools/grammar-audit.cjs` rewrites `grammar-audit.json` in the repo root.** If you run
  it, say so — a previous agent's run left that file modified and unattributed.
- Shut down with `eval.ps1 -Js "(() => { setTimeout(()=>window.close(),200); return 'closing' })()"`.

## 3. Surfaces

GrammarX's Explorer, Practice, Review/curation queue, Notebook, and the session/history surfaces.
Report `visited / enumerated`.

**This app renders 19,336 DOM nodes in one window** per a prior measurement. Re-derive that
number, and treat it as a Probe F / performance observation — measure interaction latency if you
can do it honestly.

## 4. Standing claims to settle by driving

`GRAMMARX_REDESIGN_PLAN.md` §7.1 lists four defects from 2026-07-19. B6 assessed them statically;
**your job is the live verdict**:

| # | Defect | B6's static read |
|---|---|---|
| 1 | "No category" chip reads 0 while 852 records genuinely have no category | documented as intended in `GrammarTestModal.tsx:86-91` — **but B6 also re-derived uncategorised as 0%, not 38.3%**, so the chip and the corpus may now agree. Settle which |
| 2 | Filter-sidebar label/count collisions (`Time & sequence168`) | CSS fix landed 2026-07-21, **never rendered**. This is a `css-measure` job — clipped vs spill vs truncated, at both window sizes |
| 3 | Raw study-language code leaking into copy (`· ja`) | structurally intact, number obsolete |
| 4 | Saved-filter dropdown resets its label after loading a preset | **still live** — `GrammarExplorer.tsx:337` pins `value=""` |

**Also settle the honesty question the plan raises about itself:** nothing is `verified` until a
human works the review queue, and the UI "must not imply otherwise". Drive the Review mode and
report whether the counts a user sees are honest about that.

## 5. Probes

Apply A–F. Particular attention to:

- **Probe B on a fresh profile** — the corpus is bundled study content, so it is *legitimately*
  non-empty. Do not report bundled grammar data as fabricated; that is the rule's exception.
- **Probe E** — GrammarX has filter presets and saved state. Do they persist and survive reload?
- **Probe F** — Practice vs Explorer vs Review: how many entry points does each mode have, and is
  Review discoverable at all? A prior finding recorded that both explorers had bypassed the
  filter layer entirely, making a whole phase's work reachable only from one screen.

## 6. Evidence discipline

- A control that prints success is not passing — assert a side effect that **survives a reload**.
- `/screenshot` **lags one frame**; insert a second call between click and capture.
- `/eval` **re-evaluates your expression if the result fails to serialize** (`debugBridge.ts:236`)
  — return primitives or plain objects, never DOM nodes.
- **Wait for async loads.** P1 twice read a surface one round-trip after navigating and saw
  "empty" lists that were still loading — two findings that would have been fabricated.
- Use `click.ps1`; if its hit-test guard refuses, **believe it**.
- **Re-derive every corpus count yourself.** Plan-doc figures here have been measurement
  artifacts three separate times.

## 7. Handoff

`FINDINGS_P2_GRAMMARX.md` (rows, schema, `visited / enumerated`) and
`HANDOFF_P2_GRAMMARX.md` — **written as you go**: what you drove, what you could not reach and
why, every count re-derived, and defects noticed in code you do not own.
