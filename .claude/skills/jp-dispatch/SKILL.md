---
name: jp-dispatch
description: >
  The working rules for any dispatched agent doing audit or fix work in the
  jp-study-app repo: directory ownership, git and commit discipline, which
  checks are gates and which are not, known-failing suites, handoff format,
  and the evidence standard a finding must meet. Use at the start of any
  dispatched run in this repository, when picking up a DISPATCH document or
  writing a handoff, and whenever writing a dispatch prompt for another agent.
---

# Working rules for a dispatched run in jp-study-app

This is the single source of truth for these rules. Dispatch documents carry **scope and task**;
they do not restate what is here. If a dispatch contradicts this skill, the dispatch wins for
that run — say so explicitly in your handoff.

Facts below were verified against source on 2026-08-03 at `88d7ead`. Re-measure anything
numeric before quoting it.

---

## 1. Ownership

**Every run declares the directories it owns and the directories other live agents own.
Ownership is disjoint by construction** — if two runs can write the same path, the dispatch is
wrong and should be fixed before either starts.

State it at the top of your handoff:

```
Owned:    src/renderer/components/settings/**, docs/audit/HANDOFF_S3_SETTINGS.md
Foreign:  src/media/** (S4), src/renderer/styles.css (S2 holds it this wave)
```

- **Everything outside your owned paths is read-only to you.** You will read a lot of source to
  verify facts — that is expected and required. You will not modify it.
- **`src/renderer/styles.css` (617 KB) is shared by every package and belongs to exactly one run
  at a time.** Never edit it opportunistically. If your work needs a change there and you do not
  hold it, record the needed change in your handoff and let the holder apply it.
- Found a defect outside your paths? **Record it in the handoff. Do not fix it.** A drive-by fix
  in another run's tree is indistinguishable from a merge conflict at review time.

## 2. Git discipline

- **Branch first.** Cut a branch per package before your first write (`audit/<id>-<slug>`).
- **`git add` with explicit paths only. Never `git add -A`.** Other agents' work is in this tree.
- **Never `git stash`.** Two stashes are parked and live: `stash@{0}` `flashcard-search WIP (full
  feature)`, `stash@{1}` `pre-merge workbranch WIP`. A failed `stash push -- <untracked>`
  followed by a `pop` detonates one across the tree.
- **Never `git gc`, `git prune`, or `git reflog expire`.** Two other worktrees share this object
  store — `claude/cool-poincare-9b2f0c` and `codex/noctis-beta` — and the dangling commits
  include real parked work.
- **Never commit or revert what you did not write.** If `git status` shows changes you cannot
  account for, they are someone else's. Leave them.
- **Commit when your work is complete, and again at any point it is at risk** — before a long
  gate run, before anything destructive, whenever you are close to a usage limit. Explicit paths.

## 3. The dev app belongs to the user

**Do not start, restart, or kill the app.** If something is listening on 5173, it is the user's.

Most facts about this repo are verifiable by reading source — you rarely need a running app. When
a task genuinely requires driving the live app, **use the `jp-bridge` skill**; it covers profile
setup, the endpoints, and the measurement traps. Never use OS-level remote control.

## 4. Gates vs non-gates

### Gates — a failure here blocks

| Gate | Command |
|---|---|
| Tests | `npx vitest run` |
| i18n catalogs | `node tools/i18n-check.cjs` |
| Architecture | `node tools/architecture-audit.cjs` |
| Carried items | `node docs/migration/tools/audit-carried-items.mjs` |
| Grammar | `node tools/grammar-audit.cjs --compare` |
| Licenses | `node docs/migration/tools/license-audit-gate.mjs` |

Run the ones your change can plausibly affect. All six files were confirmed present at those
exact paths.

### Not a gate

**`npx tsc --noEmit` is NOT a gate.** It reported **327** errors on a clean tree at `88d7ead`
(measured: `npx tsc --noEmit 2>&1 | grep -c "error TS"`). These are pre-existing. Do not try to
fix them and do not treat them as your failure. If you want to show you added none, measure the
total before and after — never quote the raw number as if it were yours.

### Known-failing suites — THERE ARE NONE. The suite is green.

> **CORRECTED 2026-08-04, and this entry is why the hedge below it existed.** An earlier
> version named `architectureBaseline.test.ts` and `flashcardSearch.test.ts` as known-failing,
> carried from a stale note. **Measured on this tree: `npx vitest run` → 375 files, 4,833
> tests, 0 failed.** Both named suites run and pass (12 named tests between them).

**Any red suite is a real signal.** Do not assume a failure is pre-existing, and do not skip a
suite because a document told you it fails. If something is red, either your change caused it
or the tree moved — establish which before reporting.

The general rule stands regardless of this entry's contents: **check a "known-failing" claim
against your own first run before relying on it.** This one did not survive that check.

## 5. Report measured totals, never an uncaused delta

Test counts and i18n counts drift for reasons unrelated to your change — other agents are
committing in adjacent trees during your run.

> **Say:** `npx vitest run` → *&lt;N&gt;* files, *&lt;M&gt;* tests, *&lt;K&gt;* failed — quoting
> the totals **you measured this run**, and naming any failing suite. No baseline count is
> reproduced here on purpose: a number written into a skill goes stale and then gets quoted as
> current by someone who never ran the suite.
>
> **Never say:** "my change fixed 4 tests" unless you ran the suite immediately before and after
> your own edit, on an otherwise untouched tree, and can name the four.

A delta you did not personally cause and bracket is not a measurement. If you cannot bracket it,
report the total and say the baseline is unknown.

## 6. Default verdict in a labeling pass: document, don't fix

When you find a control that does not do what it says — a button wired to nothing, a setting
that never reaches a backend, a toggle that writes to state nobody reads — **the cheapest correct
resolution is to disable it and label it honestly, plus a row in `KNOWN_ISSUES.md`.**

**Do not build the missing backend.** A half-built mutation IPC is a new bug surface: it looks
implemented, so the next audit passes it, and now the dishonesty is buried one layer deeper
instead of visible at the surface.

Build the backend only when the dispatch explicitly scopes it as the task.

> `KNOWN_ISSUES.md` did not exist anywhere in the repo as of 2026-08-03. The first run that needs
> it creates it — agree the location with the user first rather than guessing; `docs/` root is the
> obvious candidate but that is not a verified convention.

## 7. Handoff as you go

**Write the handoff while you work, not at the end.** Runs die at usage limits, usually *after*
doing the work, leaving changed files and a one-line log. A handoff written incrementally
survives that; one planned for the end does not.

File name mirrors the dispatch: `docs/audit/DISPATCH_<ID>_<SLUG>.md` → `docs/audit/HANDOFF_<ID>_<SLUG>.md`.

Required sections:

1. **Scope and ownership** — branch, base commit, owned paths, foreign paths.
2. **Verification results** — every claim you were handed, resolved `CONFIRMED` / `CORRECTED` /
   `UNVERIFIABLE`, each with `file:line` or the exact command used.
3. **What you created or changed**, path by path.
4. **What you could not verify** — stated plainly, not smoothed over. This section being empty is
   itself a claim, and usually a false one.
5. **Defects noticed in code you do not own** — recorded, not fixed.
6. **Gate results** as measured totals (§5).
7. **Open questions for the user**, flagged explicitly. Decisions that are the user's to make
   are not yours to default.

## 8. Read back and assert on all N

**After any repeated or multi-file edit, read the values back out of the files and assert on all
N.** Not a spot check of one; all of them.

A prior session reported six successful edits when five were in the file. Edit tools report per-call
success, which is not the same as the file containing what you think — a near-duplicate match, a
silently skipped occurrence, or a later edit reverting an earlier one all pass at the call site.

Grep for the new value, count the hits, and compare the count to N before claiming the edit landed.

## 9. The evidence standard

This is what a finding is held to. It is the reason these runs exist.

1. **Every finding carries the re-runnable command that produced it.** A finding without a
   command is an opinion. Paste the command and its relevant output.

2. **A claim of "done" is a hypothesis.** Code that looks correct, a test that passes, a diff that
   reads right — none of these are the verdict. **The verdict comes from driving the app and
   observing a side effect.** Until then it is "implemented", never "works".

3. **A number that does not change when the input it claims to depend on changes is measuring
   something else.** Challenge it *before* reporting it. Vary the input and confirm the number
   moves. A metric that is stable across conditions that should move it is the single most
   common way a run reports a false pass.

4. **A refusal has no positive observable.** Nothing happening looks identical to the feature
   being absent, the harness misfiring, the click landing on the wrong window, and the button
   being disabled. **Conclusions about things that did *not* happen come from the difference
   between two runs on identical input** — one where the thing should occur and one where it
   should not — never from reading an absence alone.

5. **Before reporting, ask two questions:**
   - *Did the instrument actually do the thing it claims?* The click that hit a stacked window,
     the screenshot that lagged a frame, the eval that returned a stale global — each produces a
     clean-looking result that measures nothing.
   - *Is the fixture even capable of showing the thing being tested?* A minimised window measures
     0×0 and scores as perfect. An empty library shows no scan defects. A test file that never
     runs passes forever. **If the fixture cannot fail, the pass carries no information** — and
     that is a finding in itself, worth reporting.

## 10. Scope discipline

**If you finish early, stop.** Do not expand into adjacent work, do not start auditing things
outside your package, and do not fix what you recorded in §5 of your handoff. The declared
deliverable is the whole deliverable.

If part of your scope turns out to be blocked, finish every other part in full and say plainly
what you left out and why. Scaling the work down is the user's call, not yours.
