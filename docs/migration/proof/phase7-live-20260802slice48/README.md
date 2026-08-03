# Phase 7 preview / confirm / cancel / audit, all four driven live

Slice 48, 2026-08-02. Reproduce:

```
node docs/migration/tools/phase7-live-gate.mjs
```

Packaged build, throwaway `--user-data-dir`, real clicks on the real Local AI Agent panel
(Blanc tool `local-agent`, `BlancReadyToolPanels.tsx`).

## The block was not real

The record carried Phase 7's live half as blocked on a multi-GB model download. **The model is
already on this machine**: `~/Downloads/Qwen_Qwen3-1.7B-Q4_K_M.gguf`, 1.28 GB, dated 2026-07-07.
`resolveModelPath` (`src/main/localAgent.ts:47`) searches `<userData>/models` *and* `~/Downloads`,
and the filename is in its `KNOWN_MODEL_FILENAMES`. Nothing needed downloading. The app's own
`localAgentModels()` reports it: `Qwen_Qwen3-1.7B-Q4_K_M.gguf (1.28 GB, downloads)`.

## What was driven

| Phase 7 verb | verdict | what was observed |
|---|---|---|
| **preview** | PASS | after clicking *Create local plan*, the **Task plan** table rendered `study.preview-cards` at status `Queued` — a proposed step shown **before** anything ran |
| **confirm** | PASS | under the Automation Assistant profile at full-automation, `settings.apply-theme` was **held**: `confirmation-required · settings.apply-theme`, then *Confirm sensitive step* produced `tool-started` → `tool-completed · 2ms` |
| **cancel** | PASS | real click on a persisted queue row: `queued → cancelled`, written back to `jp-study-local-agent-task-queue-v1`, and the cancelled row then offers no buttons at all |
| **audit** | PASS | the **Execution log** rendered `tool-started · study.preview-cards` and `tool-failed · study.preview-cards · No active Study vocabulary workspace is available. · 4ms` |

Also driven: pause/resume/prioritize on the persisted queue, and the two authorization selects
(assistant profile, permission level).

## Which surfaces need the model, precisely

Measured by two controlled calls to the same IPC, because a refusal on its own has no positive
observable:

| call | result |
|---|---|
| agent disabled | `The local agent is disabled in Settings.` (0 ms) |
| enabled, `modelFileName` pointed at a file that does not exist | `No local GGUF model was found. Place a supported Qwen3 model in the app models folder or Downloads.` (1 ms) |

Two *different* refusals from the same call is what makes the second one the model gate rather
than a generic failure. So:

- **Needs a loaded model:** producing a plan at all — and therefore step-level preview, run,
  confirm and every `AgentExecutionEvent`, because they all hang off the in-memory `task` that
  only `plan()` sets.
- **Needs no model:** the whole persisted-queue surface (render, pause, resume, cancel,
  prioritize, persistence), the profile and permission selects, and the refusal itself.

## The structural finding — the persisted queue is a dead end

With two tasks sitting in `jp-study-local-agent-task-queue-v1`, *Run next approved step* and
*Confirm sensitive step* both read `disabled=true`. They are gated on the component's in-memory
`task`, and the only writers of `task` are `plan()` and a previous `executeAgentTaskStep`
(`BlancReadyToolPanels.tsx:308,326,586,618`). **Nothing sets `task` from a queue item.**
`nextRunnableAgentQueueItem` is exported from `localAgentTaskQueue.ts:90` and is referenced only
by its own test.

So `AgentTaskQueue`'s paused/resumed states, its 100-item cap and its persistence describe work
that can be listed and cancelled but never resumed into execution. This matters for how slice
47e is read: that fix re-checks the profile allow-list at the execution boundary "because a
queued task outlives the profile that authorized it". The re-check is still correct and still
needed *within a session* — plan, narrow the profile, run — but the cross-session case it
describes cannot arise today, because a task that outlives the session cannot be run at all.

This is a positive read of `disabled`, not an argument from a missing button: both controls are
always rendered.

## What this does NOT show

- The packaged build is from **2026-08-01** and **predates slice 47e** — `allowedOperations` is
  absent from its bundle. The reachability and the four verbs are properties of the surface and
  hold either way, but the allow-list re-check itself was **not** exercised here. Re-run after
  the next `npm run package` to cover it.
- Only two objectives were put to the model. Which operations a 1.7B model proposes is not
  something this gate controls; the confirm path was reached by choosing a profile whose
  permission admits a confirming operation, not by forcing a particular plan.
- The one step that actually executed a handler failed on a real precondition (`No active Study
  vocabulary workspace is available.`). That is a genuine `tool-failed` audit event, not a
  successful study action — this run says the *surfaces* work, not that the agent did useful work.
- Under `limited-actions`, a confirming operation is **denied**, never held: every confirming
  operation in `AGENT_TOOL_OPERATIONS` requires `full-automation`, and `evaluateAgentToolAccess`
  checks the permission level *before* the confirmation reason (`localAgent.ts:231,237`).
