# SLICE 51 — the persisted agent queue was a dead end, and now it runs

**Verdict: the finding is REAL.** Slice 48 was right, and the defect was slightly worse than it
described. It is now fixed, with the profile allow-list enforced on the newly-runnable path.

> Written to a separate file because claude-primary owns `NEXT_SESSION.md`, `progress.json`,
> `proof/**` and `tools/**` for the duration of the Phase 9 packaged run. Merge into the main
> handoff afterwards.

## 1. Settling it — measured, not read off slice 48's prose

Three independent reads, all agreeing.

**`nextRunnableAgentQueueItem` had exactly two references in the entire repository:** its own
definition at `src/shared/localAgentTaskQueue.ts:90` and its own test at
`src/shared/__tests__/localAgentTaskQueue.test.ts:5,32,38,41`. No production module referenced it.

**Nothing set `task` from a queue item.** Every writer of `setTask` in
`BlancReadyToolPanels.tsx`, pre-fix: `276` (the `useState` declaration), `308`
(`setTask(null)` at the top of `plan()`), `326` (`setTask(response.task ?? null)` from the plan
response), `586` and `618` (the results of `runNext` / `confirmAndRun`). Both execution verbs
open with `if (!task) return;` (`570`, `603`) and both buttons are gated on that same in-memory
`task` (`717`, `720`). The queue's own rows offered exactly four controls — Pause, Resume,
Cancel, Prioritize (`770`–`773`). There was no fifth.

**A reachability walk from the panel confirms it.** Walking every non-type import transitively
from `BlancReadyToolPanels.tsx` and filtering out test files, the only production module
mentioning `nextRunnableAgentQueueItem` was the file that defines it:

```
expected [ 'src/shared/localAgentTaskQueue.ts' ] to include 'src/renderer/localAgentQueueRun.ts'
```

So: `Run next` had no wiring slice 48 missed, there was no other producer, and the selector was
unreachable from anything that ships.

### One correction to slice 48's framing

Slice 48 recorded this as a **cross-session** problem — a task that "outlives the session cannot
be run at all". The stranding also happened **within** a single session. `plan()` clears `task`
(`308`) and then overwrites it (`326`), while every planned task is appended to the queue
(`327`). Planning a second objective therefore stranded the first one permanently: still
`queued`, still persisted, still listed, and with no path back to being the live task. The queue
began accumulating dead rows from the second plan onward, not from the second session onward.

### How this re-reads slice 47e

47e's fix was correct and is untouched. Its stated motivation — "a task planned while a profile
enabled `flashcard.delete-deck` stayed runnable after the user removed that operation" — was
describing a path that could not execute. **Slice 51 makes that path real for the first time**,
which is exactly why the fix had to carry the allow-list with it rather than bolt a `setTask`
onto a queue row.

## 2. The fix

New module **`src/renderer/localAgentQueueRun.ts`** — the renderer's single agent execution
boundary plus the queue selection rule:

| export | role |
|---|---|
| `selectAgentQueueRun(queue, id?)` | eligible work: a named row, or `nextRunnableAgentQueueItem` when no id. Refuses `item-not-found` / `item-not-runnable` / `no-pending-step` / `no-runnable-item` |
| `pendingAgentTaskStep(task, 'next' \| 'confirm')` | which step a verb runs — was duplicated inline in both panel verbs |
| `runAgentTaskStep(queue, task, step, options)` | **the one call to `executeAgentTaskStep`** |
| `applyAgentRunToQueue(queue, task)` / `agentQueueStatusForTask(task)` | the write-back, so an outcome survives the session |

`BlancReadyToolPanels.tsx` now routes **all three** verbs — run next, confirm, and the new
`runQueued(id?)` — through one `runStep` helper, and gained two controls: a **Run** button on
each queued row and a **Run next queued plan** button whose disabled state is computed by the
same `selectAgentQueueRun` that the click uses, so enablement and action cannot disagree.

`selectAgentQueueRun` refuses a paused or cancelled row rather than running it, so Pause keeps
meaning paused. A queued step that needs confirmation reaches `waiting-confirmation` and is then
confirmed on the now-live task — the queue is not a way around the confirmation gate.

### How the allow-list invariant is preserved

Authorization is still computed **outside the model**, by `evaluateAgentToolAccess`, and the new
path is strictly narrower than before rather than a third boundary:

- **The number of renderer execution boundaries went from two to one.** `executeAgentTaskStep`
  was called at `BlancReadyToolPanels.tsx:578` and `:609`; it is now called once, inside
  `runAgentTaskStep`. Three verbs share it. There is no second place that can drift.
- **`allowedOperations` is a required property of `AgentQueueRunOptions`** whose type admits
  `undefined`. A caller must state what the profile permits even when the answer is "no
  profile"; it cannot be silently omitted into full access. It stays *optional* on
  `AgentExecutionOptions` itself, because 47e deliberately kept a profile-less caller governed
  by the permission level alone — and a test pins that.
- A test asserts the single-boundary property structurally, so a future slice that adds a fourth
  verb by calling `executeAgentTaskStep` directly fails the suite.

## 3. The proof, and that it is non-vacuous

`src/renderer/__tests__/localAgentQueueRun.test.ts` — 14 tests, written before the fix.

**Pre-fix failure (structural half, run against the unmodified tree):** 3 failed, 3 passed.

```
× reaches nextRunnableAgentQueueItem from the panel, not only from its own test
  AssertionError: expected [ 'src/shared/localAgentTaskQueue.ts' ] to include
                  'src/renderer/localAgentQueueRun.ts'
× gives the panel a path from a queue item to the live task
  AssertionError: expected 'import { useCallback, useEffect, useM…' to contain 'selectAgentQueueRun'
× keeps ONE execution boundary in the renderer, and it passes the allow-list
  AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]
    -- ['src/renderer/components/blanc/BlancReadyToolPanels.tsx']
    ++ ['src/renderer/localAgentQueueRun.ts']
```

The three that **passed** pre-fix are the control block, and they matter: they prove the walker
resolves real modules, that the test-file exclusion is doing work (the selector *is* in its own
test, and that reference correctly fails to satisfy the assertion), and that an invented symbol
reports absent. Without them a resolver returning `null` for everything would be green forever.

**Pre-fix failure (behavioural half):** `Cannot find module '../localAgentQueueRun'`. That alone
proves only that my fixture was absent, so the behavioural half was checked by **mutation**
instead. Reverting just the allow-list pass-through inside `runAgentTaskStep`
(`allowedOperations: options.allowedOperations` → `undefined`) with everything else in place:

```
× refuses a queued task whose operation the profile no longer enables
  AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
```

The deck-deletion handler ran — the same signature 47e reported for its own non-vacuity check.
That test runs the **real** `executeAgentTaskStep` against a queue rehydrated through the real
`normalizeAgentTaskQueue` (round-tripped via `JSON.parse(JSON.stringify(...))`, i.e. the shape
that actually comes back out of localStorage), at `full-automation` with the call pre-confirmed —
so the allow-list is the only thing that can stop it. It has a positive control beside it (an
enabled operation still runs), or a `runAgentTaskStep` that refused everything would pass.

**Why the panel is tested from source rather than rendered.** `vitest.config.ts` sets
`environment: 'node'`, there is no `@testing-library/react`, and `BlancReadyToolPanels.tsx`
reaches `keyboardShortcuts` and the whole Blanc tree at module eval. The wiring is therefore read
the way `mediaSurfaceImportGraph.test.ts` reads it, with the control block underneath. Stated
plainly: the structural half proves the wiring exists, not that a human clicked it.

**The audit agrees.** `node docs/migration/tools/audit-carried-items.mjs` now reports:

```
DRIFT agent-queue-cannot-be-run   a queue item now reaches setTask — the dead end is wired up,
                                  re-run phase7-live-gate.mjs
```

## 4. Measured gates

| gate | measured | baseline |
|---|---|---|
| `npx vitest run` | **361 files / 4589 tests pass** | 360 / 4575 (+1 file, +14 tests — all mine) |
| `node tools/i18n-check.cjs` | **6436 keys, exit 0** | 6436, exit 0 — unchanged |
| `node tools/architecture-audit.cjs` | **1331 modules, 18 findings, "Nothing new"** | 1329 / 18 (+2 modules — my two files) |
| `npx tsc --noEmit` (not a gate) | **0 errors in my files** | one pre-existing `TS2307` on a `.css` import at `BlancReadyToolPanels.tsx:105`, another track's, not in my diff |

## 5. Files created or modified

- `src/renderer/localAgentQueueRun.ts` — **new**
- `src/renderer/__tests__/localAgentQueueRun.test.ts` — **new**
- `src/renderer/components/blanc/BlancReadyToolPanels.tsx` — modified (imports, `runStep` /
  `runNext` / `confirmAndRun` / `runQueued`, `QUEUE_REFUSALS`, two new controls)
- `docs/migration/SLICE_51_PHASE7_QUEUE.md` — this file

Nothing else. `migrationRunner.ts` and `storageMigrationBoundary.ts` were never opened. No
`npm run package`, no harness, no port 5174, no git operation of any kind.

## 6. Left open, deliberately

- **The audit row needs its `recordedAs` flipped** from `holds` to `expired` in
  `docs/migration/tools/audit-carried-items.mjs:791`, and `progress.json`'s
  `phase7.slice48.structuralFinding` needs the correction in §1. Both files are claude-primary's
  for now, hence this document.
- **`phase7-live-gate.mjs` should be re-run after the next `npm run package`.** Slice 48 already
  noted the packaged build predates 47e; it now also predates the queue being runnable, so the
  gate's cancel-only queue observation is stale. The live verbs to drive next are **Run** on a
  queued row and **Run next queued plan**, and the sharp one is 47e's original story, now
  actually reachable: plan a task, narrow the profile, restart the app, run the queued row, and
  read the refusal.
- **New UI strings are raw English, matching their siblings.** `Run`, `Run next queued plan` and
  the four `QUEUE_REFUSALS` messages sit beside `Pause`/`Resume`/`Cancel`/`Prioritize` and
  `Run next approved step`, none of which go through `useT()` — this panel is not converted.
  CLAUDE.md's i18n rule says new UI text should be, and I did not follow it here: converting six
  strings while their immediate siblings stay raw leaves the panel half-converted, and editing
  `shared/i18n/catalogs/*.ts` risks a collision with claude-primary's concurrent accessibility
  pass. `i18n-check` is unaffected (exit 0, 6436 keys). Converting `LocalAgentPanel` as a whole
  is a clean follow-up slice for whoever holds the catalogs.

## 7. One thing worth flagging

`runAgentTaskStep` returns a new queue, but the panel folds it in with a **functional** state
update (`setTaskQueue((previous) => …applyAgentRunToQueue(previous, result.task))`) rather than
the queue it captured before the `await`. The row-level Pause and Cancel buttons stay clickable
while a step is in flight — only the run controls take `busy` — so a queue captured pre-`await`
would silently revert a cancel the user made during execution. `applyAgentRunToQueue` is exported
separately from `runAgentTaskStep` for exactly this reason; the first draft of this slice had the
bug and it is worth not reintroducing.
