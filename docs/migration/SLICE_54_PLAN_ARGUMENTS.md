# Slice 54 — the zero-argument plan defect

*(written as the slice ran, not afterwards)*

Fixes the defect slice 53 found live: `parseLocalAgentModelPlan` rejected the **whole plan** when a
step omitted `arguments`, including for operations that take none. 6 live rejections out of 6 across
`flashcard.list-decks` and `calendar.list`.

## Step 0 — a correction to the brief, before anything else

**The parser is not in `src/shared/localAgent.ts`.** The brief assigned "`src/shared/localAgent.ts`
(the PARSER path only)" and "`src/shared/__tests__/localAgent.test.ts`". `parseLocalAgentModelPlan`
lives in **`src/shared/localAgentPrompt.ts:93`** and its tests in
**`src/shared/__tests__/localAgentPrompt.test.ts`**. Slice 53's own record cites
`localAgentPrompt.ts:137`, so the brief's file list is the thing that is wrong, not the record.

Both files were edited. `src/shared/localAgent.ts` was edited too — the fix needs a per-operation
argument contract and the operation table is the only honest place for it. Neither
`localAgentProfiles.ts`, `localAgentQueueRun.ts`, `migrationRunner.ts`,
`storageMigrationBoundary.ts` nor `docs/migration/tools/**` was touched.

## Step 1 — the failing test, BEFORE the change

`npx vitest run src/shared/__tests__/localAgentPrompt.test.ts` → **3 failed | 4 passed**.

```
FAIL  src/shared/__tests__/localAgentPrompt.test.ts > local agent model boundary >
      accepts a step that omits arguments for an operation that takes none
Error: Local model step 1 needs an arguments object.
 ❯ src/shared/localAgentPrompt.ts:138:13
 ❯ parseLocalAgentModelPlan src/shared/localAgentPrompt.ts:117:27
```

and, on the half that must NOT be loosened:

```
FAIL  ... > still refuses a step that omits an argument the operation requires
AssertionError: expected [Function] to throw error including 'needs a query argument'
                but got 'Local model step 1 needs an arguments…'
Expected: "needs a query argument"
Received: "Local model step 1 needs an arguments object."
```

That second failure is the interesting one: **before this slice the parser did not refuse a missing
required argument at all.** It refused a missing `arguments` *container*, which is a different
thing, and `arguments:{}` with nothing in it sailed through to die in the handler — the
"passing the parser is not being runnable" observation slice 53 recorded as a second-order
consequence. So the naive one-line fix from the slice 53 notes (`arguments: step.arguments ?? {}`)
would have *removed the only check there was* and converted every out-of-spec plan into a
downstream handler failure.

## Step 2 — the fix

The parser could not tell "this operation needs nothing" from "the model forgot the field", because
**nothing in the codebase declared what any operation takes.** Required arguments were enforced
ad hoc inside each adapter (`textArg`, `textArgument`), which is one layer too late to answer the
question the parser was being asked. So the fix is a declaration plus two checks that replace one.

**`src/shared/localAgent.ts`**

- `AgentToolOperationDefinition` gains `requiredArguments: readonly string[]`, populated from a
  `REQUIRED_ARGUMENTS` map read off the adapters that actually execute each operation
  (`BlancReadyToolPanels.tsx`'s `handlers` memo and `studyAgentHandlers.ts`). 19 operations declare
  one or more; the remaining 34 declare none. An operation with **no adapter installed**
  (`anime.*`, `visual-novel.*`, `media.analyze-subtitles`, `media.generate-profile`,
  `media.organize-files`) declares none, because inventing a contract for a handler that does not
  exist would be guessing.
- `missingAgentToolArguments(operationId, arguments)` — the one place that answers "is this step
  complete enough to run". An argument counts as supplied when it is present and carries
  something: `null`/`undefined`, a blank string and an empty array are all missing; `false` and `0`
  are not.

**`src/shared/localAgentPrompt.ts`** — one unconditional check became two conditional ones:

| input | before | after |
|---|---|---|
| no `arguments`, zero-arg operation | **whole plan rejected** | accepted as `{}` |
| `arguments: null`, zero-arg operation | whole plan rejected | accepted as `{}` |
| `arguments: "…"` / `42` / `[…]` | whole plan rejected | **still rejected** (`needs an arguments object`) |
| no `arguments`, `dictionary.search-knowledge` | whole plan rejected (`needs an arguments object`) | **still rejected**, now `(dictionary.search-knowledge) needs a query argument` |
| `arguments: {}`, `dictionary.search-knowledge` | **accepted**, then died in the adapter | **rejected at plan time**, naming the field |
| `arguments: {query:"neko"}` | accepted | accepted |

`null` is treated as absent — a model writing it is saying what a model omitting the key says. A
string, a number or an **array** is not: that is a structurally different plan, and replacing it
with `{}` would silently discard arguments the model did mean to pass.

Note the fifth row. **This fix makes the parser stricter as well as looser**, and that half is the
one slice 53's suggested one-liner (`arguments: step.arguments ?? {}`) would have gone the wrong
way on.

### The authorization boundary is untouched

- `evaluateAgentToolAccess` is unchanged, still called with the same arguments, still called
  **before** any of this, and its `throw` on a non-`allowed` verdict is unchanged. Every operation
  the parser refused before, it still refuses.
- `missingAgentToolArguments` returns `[]` for an unknown operation **on purpose** — authorization
  is what refuses those, and a runnability helper must never be the thing that happens to catch a
  bad operation, or someone will later rely on it for that.
- Nothing was added to a profile allow-list, no permission level moved, `localAgentProfiles.ts` was
  not opened, and `runAgentTaskStep` remains the renderer's single execution boundary.
- The set of *operations* a plan may reach is byte-identical. What widened is the set of
  *encodings* of a plan over the same operations. The existing
  `rejects unknown or permission-elevating operations` test still passes unmodified, and
  `localAgentQueueRun.test.ts`'s allow-list half is green.

## Step 3 — does `arguments: {}` still die in the handler? No.

`src/renderer/__tests__/localAgentZeroArgumentPlan.test.ts` (new) carries a plan **with no
`arguments` field** through the real `parseLocalAgentModelPlan` → real `createAgentTask` → real
`executeAgentTaskStep` → a **real installed adapter**, and asserts it reaches
`status: "completed"`, `error: undefined`.

`study.list-opportunities` is the operation under test because it is the only zero-argument
operation whose adapter this suite can reach. The two that failed live — `flashcard.list-decks` and
`calendar.list` — are declared inside `BlancReadyToolPanels.tsx`'s `handlers` memo, and that module
reaches the whole Blanc tree at eval time under `environment: 'node'`. For those two the test reads
the source and asserts the adapter is a **zero-parameter arrow** (`'calendar.list': () =>`), with a
control assertion on `flashcard.create-deck` (`(arguments_) =>`) so a reader that silently resolved
nothing would fail rather than pass forever. That is static evidence and is labelled as such.

**Where `arguments: {}` still dies, and why that is correct:** `dictionary.search-knowledge` with an
empty object died in `textArg` with `The operation needs query.` It no longer reaches the adapter —
it is refused at plan time by the second half of the fix. `executeAgentTaskStep` was deliberately
**not** given the same check: adapters remain the run-time authority on their own inputs, the
parser cannot know what a future adapter will need, and every task already persisted in
`jp-study-local-agent-task-queue-v1` was written by the old parser and therefore already carries an
`arguments` object. Adding a second gate there would have changed the failure text of queued work
without changing its outcome.

## Step 4 — whole plan or single step? WHOLE PLAN, kept deliberately.

A malformed or unauthorized step still throws and takes the plan with it. Reasons, in order of
weight:

1. **A dropped step silently changes what the user approved.** `summary` is the user-visible
   artifact and it describes all the steps. Executing 2 of 3 while showing a summary for 3 is a
   mismatch between what was shown and what ran, in the one subsystem whose entire design premise
   is that the model does not get to decide what happens.
2. **Steps are ordered and coupled.** `createAgentTask` forbids duplicate step/call IDs and
   `updateAgentTask` refuses to start a step while an earlier one is incomplete
   (`Agent steps must run in plan order.`). Step 3 of a plan frequently exists *because* step 2 ran.
   Dropping the middle one yields a sequence the model never proposed.
3. **A step requesting an unavailable operation is a security signal, not noise.** Dropping it
   quietly would turn a visible refusal into a silent omission, which is exactly the wrong
   direction after slices 47e and 51.

**The cost is real and is recorded, not hidden.** This fix *widens* the blast radius of total
rejection: a plan whose step 3 omits a required argument is now refused at plan time, where before
it parsed and failed at run time with steps 1-2 already done. That is the intended trade — fail
early, loudly, and name the field — but it is a trade. The mitigation shipped with it is the error
message, which now names both the step index and the operation
(`Local model step 2 (dictionary.lookup) needs a term argument.`) so the failure is actionable
instead of merely total. Whether the panel should instead offer a *partial* plan for the user to
approve is a product decision and is carried below, not taken here.

## Carried items for the next slice

- **`plan-rejection-is-all-or-nothing`** — one malformed step still discards the whole plan. Kept
  on the reasoning above; the alternative (present the parseable steps as a partial plan for
  explicit approval) is a UX change to `LocalAgentPanel`, not a parser change, and needs the
  summary re-derived so it cannot describe work that was dropped.
- **`system-prompt-does-not-state-required-arguments`** — `buildLocalAgentSystemPrompt` lists each
  operation as `{operation, label, confirmation}` only. `requiredArguments` now exists and could be
  emitted there, which is the fix for the *cause* (a 1.7B model guessing the shape) rather than the
  symptom. **Not done here on purpose:** changing the prompt changes live model behaviour, and this
  slice ran no live model, so shipping it would be an unmeasured change to the one thing slice 53
  measured. It should land in a slice that re-runs `phase7-queue-refusal-live-gate.mjs`.
- **`shared-agent-errors-are-not-on-the-i18n-path`** — every error string in `localAgentPrompt.ts`
  and `localAgent.ts` is raw English and reaches the panel's status line
  (slice 53 read `"Local model step 1 needs an arguments object."` straight off the UI). The new
  message is consistent with its six siblings rather than a new exception, and `i18n-check` cannot
  see any of them because they are literals, not keys. Translating them is a self-contained pass.
- **`required-arguments-are-read-from-adapters-not-declared-by-them`** — `REQUIRED_ARGUMENTS` in
  `localAgent.ts` mirrors what each handler validates. Nothing enforces the mirror; an adapter that
  starts requiring a new field will not update the map. The new test asserts the zero-parameter
  shape of the two operations this slice turns on, which is a spot check, not the general gate.

### Two smaller judgement calls, stated so they can be reversed

- `settings.apply-css` and `settings.preview-css` now require `css`. Previously
  `sanitizeCustomCss(undefined)` returned `''`, so a plan with no `css` **wiped the user's custom
  CSS while reporting `applied: true`**. `settings.reset-css` already exists for that intent.
- `settings.change-preference` / `settings.configure-module` require `value`. `false` and `0` count
  as supplied; an empty string does not, so setting `modelFileName` to `''` via the agent is now
  refused. That looked like the safer side of a rare edge.

## Gates — measured this slice, on the tree as it stood at 2026-08-02 17:11

| gate | result |
|---|---|
| `npx vitest run` | **364 files / 4616 tests pass, exit 0** |
| `node tools/i18n-check.cjs` | **6587 keys, all translated in ja/zh/ru, exit 0** |
| `node tools/architecture-audit.cjs` | **1334 modules, 18 findings, "Nothing new", exit 0** |
| `node docs/migration/tools/audit-carried-items.mjs` | **exit 0, 2 OPEN** (`mediacontent-uncommitted`, `media-study-localstorage-half-never-round-tripped`) — unchanged |
| `npx tsc --noEmit` filtered to this slice's files | **0 errors** (not a gate: ~288 pre-existing errors from other tracks) |

**The totals are not all attributable to this slice, and are stated as measured rather than as a
delta.** The brief's baseline was 362 files / 4599 tests and 1332 modules. This slice adds **1 test
file and 6 tests**; the remaining +1 file / +11 tests / +1 module arrived from another session
working the same tree concurrently. Nothing here should be read as "slice 54 added 17 tests".

## Files created or modified

| file | what |
|---|---|
| `src/shared/localAgent.ts` | `requiredArguments` on the operation definition, `REQUIRED_ARGUMENTS` map, `missingAgentToolArguments` + `isSuppliedArgument` |
| `src/shared/localAgentPrompt.ts` | the parser fix (one unconditional check → two conditional ones) |
| `src/shared/__tests__/localAgentPrompt.test.ts` | 3 tests: the omission is accepted, a missing required argument is still refused, a wrongly typed `arguments` is still refused |
| `src/renderer/__tests__/localAgentZeroArgumentPlan.test.ts` | **new** — parse → execute round trip into a real adapter, plus the source-read for the two panel-local adapters |
| `docs/migration/SLICE_54_PLAN_ARGUMENTS.md` | **new** — this file |

Not touched: `localAgentProfiles.ts` and its tests, `localAgentQueueRun.ts`, `migrationRunner.ts`,
`storageMigrationBoundary.ts`, `docs/migration/tools/**`, `NEXT_SESSION.md`, `progress.json`.
Nothing was committed, staged, stashed, reverted or checked out.

## One more contradiction found in the record, for whoever updates NEXT_SESSION.md

Slice 53's note says the live gate's target was switched to `calendar.list` — *"The target is now
`calendar.list`, whose handler is `() => ({ events: loadEvents().slice(0, 100) })` and takes no
arguments at all, so an empty `arguments:{}` is not merely accepted, it is complete. That is what
lets the control arm reach `completed`."* The only proof artifact from that run,
`proof/phase7-queue-refusal-20260802slice53e/phase7-queue-refusal.json`, records
`preferredOperation: "dictionary.search-knowledge"`, `chosenOperation: "dictionary.search-knowledge"`
and every step with `argCount: 1`, `args: {"query":"neko"}`. **`calendar.list` does not appear in
the artifact at all.** The prose describes an intended change the recorded run does not contain, so
there is **no live evidence that `calendar.list` with an empty `arguments` completes in the app** —
the evidence for that is this slice's test, at the adapter layer, not from a live run.
