/**
 * Slice 51 — the persisted agent queue can actually be run, and running it is still governed
 * by the profile allow-list.
 *
 * Slice 48 measured, live, that with two tasks in `jp-study-local-agent-task-queue-v1` both
 * *Run next approved step* and *Confirm sensitive step* read `disabled=true`: they are gated on
 * `LocalAgentPanel`'s in-memory `task`, and the only writers of `task` were `plan()` and a
 * previous `executeAgentTaskStep`. Nothing took an item OUT of the queue and made it the live
 * task, and `nextRunnableAgentQueueItem` was referenced only by its own test. The queue could be
 * listed, paused, prioritized and cancelled — never resumed into execution.
 *
 * That mattered beyond the missing feature. Slice 47e hardened the EXECUTION boundary
 * specifically because "a queued task outlives the profile that authorized it" — a cross-session
 * story that could not actually happen while a persisted task could never be run at all. This
 * file is in two halves for that reason:
 *
 *  - `the queue is reachable from production code` is the structural half. It is what fails on
 *    the pre-slice-51 tree, and it asserts production WIRING, not a fixture. The panel itself is
 *    not renderable in this suite (vitest runs `environment: 'node'`, there is no
 *    testing-library, and `BlancReadyToolPanels.tsx` reaches `keyboardShortcuts` and the whole
 *    Blanc tree at module eval), so the wiring is read from source the way
 *    `mediaSurfaceImportGraph.test.ts` reads it — with a control block underneath, because a
 *    walker that silently resolved nothing would pass every assertion above it forever.
 *
 *  - `the allow-list still bites on the newly-runnable path` is the behavioural half. It runs the
 *    REAL `executeAgentTaskStep` against a queue rehydrated through the REAL
 *    `normalizeAgentTaskQueue`, i.e. the shape that actually comes back out of localStorage. It
 *    guards the thing that would make this slice a regression rather than a fix: a third way to
 *    reach a tool that does not consult `evaluateAgentToolAccess` with the profile's
 *    `enabledOperations`.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { createAgentTask, type AgentToolOperationId } from '../../shared/localAgent';
import {
  enqueueAgentTask,
  normalizeAgentTaskQueue,
  pauseAgentQueueItem,
  prioritizeAgentQueueItem,
  updateAgentQueueItem,
} from '../../shared/localAgentTaskQueue';
import {
  applyAgentRunToQueue,
  pendingAgentTaskStep,
  runAgentTaskStep,
  selectAgentQueueRun,
  type AgentQueueExecutionLeaseClient,
} from '../localAgentQueueRun';
import { normalizeAgentOperationalState } from '../../shared/agentOperationalState';
import type { AgentTaskQueue } from '../../shared/localAgentTaskQueue';

function inMemoryLeaseClient(queue: AgentTaskQueue): AgentQueueExecutionLeaseClient {
  return {
    acquire: async () => ({
      ok: true,
      token: 'lease-test',
      expiresAt: Date.now() + 30_000,
      state: { version: 1, queue, memory: { version: 1, entries: [] }, automations: [], legacyMigratedAt: null },
    }),
    keepAlive: () => () => undefined,
    release: async () => ({
      ok: true,
      state: { version: 1, queue, memory: { version: 1, entries: [] }, automations: [], legacyMigratedAt: null },
    }),
    commit: async (_taskId, _token, nextTask) => {
      const committed = applyAgentRunToQueue(queue, nextTask);
      return {
        ok: true,
        state: { version: 1, queue: committed, memory: { version: 1, entries: [] }, automations: [], legacyMigratedAt: null },
      };
    },
  };
}

const REPO = resolve(__dirname, '../../..');
const PANEL = 'src/renderer/components/blanc/BlancReadyToolPanels.tsx';
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

function resolveModule(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (existsSync(base)) {
    for (const ext of EXTENSIONS) {
      const index = resolve(base, `index${ext}`);
      if (existsSync(index)) return index;
    }
  }
  return null;
}

/**
 * Static and dynamic imports. Type-only clauses are excluded: they are erased at build time, so
 * a module that only imports a `type` from the queue is not a runtime path to running one.
 */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)\s+([^;]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    if (/^type\s/.test((match[1] ?? '').trim())) continue;
    if (match[2]) found.push(match[2]);
  }
  for (const match of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (match[1]) found.push(match[1]);
  }
  return found;
}

function reachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [resolve(REPO, entry)];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importsOf(file)) {
      const resolved = resolveModule(specifier, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen].map((f) => relative(REPO, f).replace(/\\/g, '/'));
}

/** Modules reachable from the panel that mention `symbol`, excluding test files. */
function productionReferencesOf(symbol: string, entry = PANEL): string[] {
  return reachableFrom(entry)
    .filter((path) => !path.includes('__tests__') && !path.endsWith('.test.ts'))
    .filter((path) => new RegExp(`\\b${symbol}\\b`).test(readFileSync(resolve(REPO, path), 'utf8')));
}

describe('the queue is reachable from production code', () => {
  it('reaches nextRunnableAgentQueueItem from the panel, not only from its own test', () => {
    // Slice 48's finding, stated as an assertion. Before slice 51 this list was empty: the
    // selector existed, was exported, was unit-tested, and no shipping code could call it.
    expect(productionReferencesOf('nextRunnableAgentQueueItem')).toContain(
      'src/renderer/localAgentQueueRun.ts',
    );
  });

  it('gives the panel a path from a queue item to the live task', () => {
    // The dead end was specifically that nothing set `task` FROM a queue item. `plan()` and a
    // previous execution were the only writers, so an item that outlived either could be
    // listed and cancelled but never run.
    const source = readFileSync(resolve(REPO, PANEL), 'utf8');
    expect(source).toContain('selectAgentQueueRun');
    // Assert the WIRING, not a label. This originally matched the literal word "Run" after
    // `<legend>Task queue</legend>`, which slice 52 correctly removed when it converted the panel
    // to i18n — an assertion coupled to English text fails the moment the app is translated, and
    // says nothing about whether the button does anything. It was also vacuous by construction:
    // `indexOf` returns -1 when the legend changes, and `slice(-1)` then tests a single character
    // instead of failing loudly.
    // A queue ROW must reach the runner (an id is passed), and the runner must go through the
    // selector rather than setting `task` on its own.
    expect(/onClick=\{\(\) => void runQueued\(item\.id\)\}/.test(source)).toBe(true);
    // Selection re-reads the main-owned snapshot at the click. React state is
    // only the displayed copy and may lag a pause/cancel from another window.
    expect(/const runQueued[\s\S]{0,300}?loadLocalAgentTaskQueue\(\)[\s\S]{0,100}?selectAgentQueueRun\(live, id\)/.test(source)).toBe(true);
  });

  it('keeps ONE execution boundary in the renderer, and it passes the allow-list', () => {
    // 47e's invariant made structural. A newly-runnable path must not become a second place
    // that decides what a tool may do; if `executeAgentTaskStep` is called from two renderer
    // modules they can drift, which is the exact shape of the defect 47e fixed.
    const callers = reachableFrom(PANEL)
      .filter((path) => path.startsWith('src/renderer/'))
      .filter((path) => /\bexecuteAgentTaskStep\s*\(/.test(readFileSync(resolve(REPO, path), 'utf8')));
    expect(callers).toEqual(['src/renderer/localAgentQueueRun.ts']);
    expect(readFileSync(resolve(REPO, 'src/renderer/localAgentQueueRun.ts'), 'utf8'))
      .toContain('allowedOperations');
  });
});

describe('the reachability walk can actually see', () => {
  // The control. Without it, a resolver that returned null for every specifier would report
  // "not reachable" for everything and make the block above vacuously green in both directions.
  it('reaches the queue module and the shared agent boundary from the panel', () => {
    const reachable = reachableFrom(PANEL);
    expect(reachable).toContain('src/shared/localAgentTaskQueue.ts');
    expect(reachable).toContain('src/shared/localAgent.ts');
  });

  it('does not count a test file as production, and the symbol really is in that test', () => {
    // Proves the exclusion filter is doing work rather than matching nothing: the selector IS
    // referenced by its own test, and that reference must not satisfy the assertion above.
    expect(readFileSync(resolve(REPO, 'src/shared/__tests__/localAgentTaskQueue.test.ts'), 'utf8'))
      .toContain('nextRunnableAgentQueueItem');
    expect(productionReferencesOf('nextRunnableAgentQueueItem'))
      .not.toContain('src/shared/__tests__/localAgentTaskQueue.test.ts');
  });

  it('reports absence for a symbol that genuinely is not there', () => {
    expect(productionReferencesOf('thisSymbolDoesNotExistAnywhere')).toEqual([]);
  });
});

const deleteDeckTask = (id: string) => createAgentTask(id, `delete from ${id}`, [{
  id: 'delete',
  label: 'Delete the deck',
  request: { callId: `call-${id}`, operation: 'flashcard.delete-deck', arguments: { name: 'JLPT' } },
}], 10);

/** A queue that has been through storage, not one built in memory. */
function rehydrated(...tasks: ReturnType<typeof deleteDeckTask>[]) {
  let queue = normalizeAgentTaskQueue(null);
  for (const task of tasks) queue = enqueueAgentTask(queue, task, 0, 10);
  return normalizeAgentTaskQueue(JSON.parse(JSON.stringify(queue)));
}

describe('selecting work out of the persisted queue', () => {
  it('picks the highest-priority queued item when no id is given', () => {
    const queue = prioritizeAgentQueueItem(rehydrated(deleteDeckTask('a'), deleteDeckTask('b')), 'b', 50);
    const selection = selectAgentQueueRun(queue);
    expect(selection.ok && selection.item.id).toBe('b');
  });

  it('refuses a paused item, so Pause keeps meaning paused', () => {
    const queue = pauseAgentQueueItem(rehydrated(deleteDeckTask('a')), 'a');
    expect(selectAgentQueueRun(queue, 'a')).toEqual({ ok: false, reason: 'item-not-runnable' });
    expect(selectAgentQueueRun(queue)).toEqual({ ok: false, reason: 'no-runnable-item' });
  });

  it('refuses an item whose steps are all finished', () => {
    const task = deleteDeckTask('done');
    task.steps[0].status = 'completed';
    expect(selectAgentQueueRun(rehydrated(task), 'done')).toEqual({ ok: false, reason: 'no-pending-step' });
  });

  it('finds the step the panel would run', () => {
    expect(pendingAgentTaskStep(deleteDeckTask('a'), 'next')?.id).toBe('delete');
    expect(pendingAgentTaskStep(deleteDeckTask('a'), 'confirm')).toBeNull();
  });
});

describe('the allow-list still bites on the newly-runnable path', () => {
  const ALLOWED: readonly AgentToolOperationId[] = ['flashcard.create-deck'];

  it('never resolves a tool handler when main refuses the execution lease', async () => {
    const queue = rehydrated(deleteDeckTask('lease-held'));
    const selection = selectAgentQueueRun(queue, 'lease-held');
    if (!selection.ok) throw new Error(`expected a runnable selection, got ${selection.reason}`);
    const handler = vi.fn(() => ({ deleted: true }));
    const leaseClient = inMemoryLeaseClient(queue);
    leaseClient.acquire = async () => ({ ok: false, code: 'lease-held' });

    const result = await runAgentTaskStep(queue, selection.item.task, selection.step, {
      permission: 'full-automation',
      allowedOperations: ['flashcard.delete-deck'],
      handlers: { 'flashcard.delete-deck': handler },
      confirmedCallIds: new Set(['call-lease-held']),
      leaseClient,
    });

    expect(result.leaseRefusal).toEqual({ code: 'lease-held' });
    expect(handler).not.toHaveBeenCalled();
    expect(result.events).toEqual([]);
  });

  it('refuses a queued task before start when its operation is no longer enabled', async () => {
    // The cross-session case slice 47e was written for, now that it can actually arise: the
    // task was planned when the profile allowed `flashcard.delete-deck`, persisted, and is run
    // after the operation was removed from the profile. Permission is `full-automation` and the
    // call is pre-confirmed, so the ONLY thing that can stop it is the allow-list.
    const queue = rehydrated(deleteDeckTask('stale'));
    const selection = selectAgentQueueRun(queue, 'stale');
    if (!selection.ok) throw new Error(`expected a runnable selection, got ${selection.reason}`);
    const handler = vi.fn(() => ({ deleted: true }));

    const now = vi.fn(() => 20);
    const result = await runAgentTaskStep(queue, selection.item.task, selection.step, {
      permission: 'full-automation',
      allowedOperations: ALLOWED,
      handlers: { 'flashcard.delete-deck': handler },
      confirmedCallIds: new Set(['call-stale']),
      leaseClient: inMemoryLeaseClient(queue),
      now,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(result.task).toBe(selection.item.task);
    expect(result.task).toMatchObject({ status: 'queued' });
    expect(result.task.steps[0]).toMatchObject({ status: 'pending' });
    expect(result.task.steps[0]).not.toHaveProperty('error');
    expect(result.events).toEqual([]);
    expect(result.refusal).toMatchObject({
      code: 'operation-denied',
      reason: expect.stringContaining('not enabled for the active agent profile'),
    });
    // A refusal is not an execution outcome. The persisted queue is returned
    // byte-for-byte, so Run next and Run queued cannot turn a declined step
    // into a failed plan.
    expect(result.queue).toBe(queue);
    expect(result.queue.items.find((item) => item.id === 'stale')).toEqual(
      queue.items.find((item) => item.id === 'stale'),
    );
  });

  it('runs a queued task whose operation the profile still enables', async () => {
    // The control for the test above: without it, a `runAgentTaskStep` that refused everything
    // would pass the refusal assertions perfectly.
    const task = createAgentTask('fresh', 'make a deck', [{
      id: 'create',
      label: 'Create the deck',
      request: { callId: 'call-fresh', operation: 'flashcard.create-deck', arguments: { name: 'JLPT' } },
    }], 10);
    const queue = normalizeAgentTaskQueue(JSON.parse(JSON.stringify(
      enqueueAgentTask(normalizeAgentTaskQueue(null), task, 0, 10),
    )));
    const selection = selectAgentQueueRun(queue, 'fresh');
    if (!selection.ok) throw new Error(`expected a runnable selection, got ${selection.reason}`);
    const handler = vi.fn(() => ({ created: true }));

    const result = await runAgentTaskStep(queue, selection.item.task, selection.step, {
      permission: 'limited-actions',
      allowedOperations: ALLOWED,
      handlers: { 'flashcard.create-deck': handler },
      leaseClient: inMemoryLeaseClient(queue),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.task.status).toBe('completed');
    expect(result.queue.items.find((item) => item.id === 'fresh')?.status).toBe('completed');
  });

  it('leaves a caller with no profile governed by the permission level alone', async () => {
    // 47e made `allowedOperations` optional on purpose. Passing `undefined` must mean "no
    // profile restriction", not "deny everything" — otherwise the queue path would be stricter
    // than the plan path and the two rules would have drifted after all.
    const queue = rehydrated(deleteDeckTask('no-profile'));
    const selection = selectAgentQueueRun(queue, 'no-profile');
    if (!selection.ok) throw new Error(`expected a runnable selection, got ${selection.reason}`);
    const handler = vi.fn(() => ({ deleted: true }));

    const result = await runAgentTaskStep(queue, selection.item.task, selection.step, {
      permission: 'full-automation',
      allowedOperations: undefined,
      handlers: { 'flashcard.delete-deck': handler },
      confirmedCallIds: new Set(['call-no-profile']),
      leaseClient: inMemoryLeaseClient(queue),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.task.status).toBe('completed');
  });

  it('holds a sensitive step for confirmation instead of running it', async () => {
    // The queue path must not be a way to skip the confirmation gate either.
    const queue = rehydrated(deleteDeckTask('needs-confirm'));
    const selection = selectAgentQueueRun(queue, 'needs-confirm');
    if (!selection.ok) throw new Error(`expected a runnable selection, got ${selection.reason}`);
    const handler = vi.fn(() => ({ deleted: true }));

    const result = await runAgentTaskStep(queue, selection.item.task, selection.step, {
      permission: 'full-automation',
      allowedOperations: ['flashcard.delete-deck'],
      handlers: { 'flashcard.delete-deck': handler },
      leaseClient: inMemoryLeaseClient(queue),
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.events.map((event) => event.type)).toEqual(['confirmation-required']);
    expect(result.task.steps[0].status).toBe('waiting-confirmation');
  });
});

/**
 * The queue no longer round-trips through a renderer-owned `localStorage` string;
 * it goes out to the main-owned operational document and comes back through
 * `normalizeAgentOperationalState`, which is what `main/agentOperationalStore.ts`
 * applies on every read and every write.
 *
 * The risk that introduces is specific: if that normalization dropped or blanked
 * a task's steps or its operation id, the allow-list above would have nothing
 * left to bite on and a restored task would sail through. So the same refusal is
 * asserted again, with the real persistence path in the middle.
 */
describe('a task restored from main-owned persistence is still re-checked', () => {
  const throughMainPersistence = (queue: ReturnType<typeof rehydrated>) => {
    const persisted = JSON.parse(JSON.stringify(normalizeAgentOperationalState({
      version: 1,
      queue,
      memory: { version: 1, entries: [] },
      automations: [],
      legacyMigratedAt: null,
    })));
    return normalizeAgentOperationalState(persisted).queue;
  };

  it('carries the step and its operation id across the process boundary intact', () => {
    const queue = throughMainPersistence(rehydrated(deleteDeckTask('restored')));
    const item = queue.items.find((candidate) => candidate.id === 'restored');
    expect(item?.task.steps).toHaveLength(1);
    expect(item?.task.steps[0].request.operation).toBe('flashcard.delete-deck');
  });

  it('still refuses an operation the profile no longer enables', async () => {
    const queue = throughMainPersistence(rehydrated(deleteDeckTask('restored')));
    const selection = selectAgentQueueRun(queue, 'restored');
    if (!selection.ok) throw new Error(`expected a runnable selection, got ${selection.reason}`);
    const handler = vi.fn(() => ({ deleted: true }));

    const result = await runAgentTaskStep(queue, selection.item.task, selection.step, {
      permission: 'full-automation',
      allowedOperations: ['flashcard.create-deck'],
      handlers: { 'flashcard.delete-deck': handler },
      confirmedCallIds: new Set(['call-restored']),
      leaseClient: inMemoryLeaseClient(queue),
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.task).toBe(selection.item.task);
    expect(result.task.status).toBe('queued');
    expect(result.task.steps[0]).toMatchObject({ status: 'pending' });
    expect(result.task.steps[0]).not.toHaveProperty('error');
    expect(result.events).toEqual([]);
    expect(result.refusal).toMatchObject({
      code: 'operation-denied',
      reason: expect.stringContaining('not enabled for the active agent profile'),
    });
    expect(result.queue).toBe(queue);
  });
});

/**
 * A scheduled automation stores the permission level it was created under, and the
 * automation list shows the user that level as the entry's own permission. Nothing
 * read it: the trigger called `plan(entry.objective)` and every verb then executed
 * at whatever `readExecutionAuthority` resolved from the LIVE setting, so the column
 * described nothing and raising the global permission afterwards silently applied to
 * work the user had authorized at a narrower level.
 *
 * The bound rides on the queue row, so it survives the restart and the other window,
 * and it is applied here — the renderer's one execution boundary — rather than in the
 * panel, so no future caller can reach `executeAgentTaskStep` around it.
 */
describe('a task ceiling narrows the live permission and never widens it', () => {
  const scheduled = (id: string, ceiling: 'read-only' | 'limited-actions' | 'full-automation') => {
    const task = createAgentTask(id, `scheduled ${id}`, [{
      id: 'delete',
      label: 'Delete the deck',
      request: { callId: `call-${id}`, operation: 'flashcard.delete-deck', arguments: { name: 'JLPT' } },
    }], 10);
    return normalizeAgentTaskQueue(JSON.parse(JSON.stringify(
      enqueueAgentTask(normalizeAgentTaskQueue(null), task, 0, 10, undefined, ceiling),
    )));
  };

  const run = async (queue: AgentTaskQueue, id: string, permission: 'read-only' | 'limited-actions' | 'full-automation') => {
    const selection = selectAgentQueueRun(queue, id);
    if (!selection.ok) throw new Error(`expected a runnable selection, got ${selection.reason}`);
    const handler = vi.fn(() => ({ deleted: true }));
    const result = await runAgentTaskStep(queue, selection.item.task, selection.step, {
      permission,
      allowedOperations: undefined,
      handlers: { 'flashcard.delete-deck': handler },
      confirmedCallIds: new Set([`call-${id}`]),
      leaseClient: inMemoryLeaseClient(queue),
    });
    return { handler, result };
  };

  it('refuses a read-only automation even while the live setting is full-automation', async () => {
    const queue = scheduled('narrowed', 'read-only');
    const { handler, result } = await run(queue, 'narrowed', 'full-automation');

    expect(handler).not.toHaveBeenCalled();
    // The reason, not just the code: an allow-list refusal carries the same code,
    // so asserting the code alone would pass even if the ceiling did nothing.
    expect(result.refusal).toMatchObject({
      code: 'operation-denied',
      reason: expect.stringContaining('requires full-automation permission'),
    });
    // A refusal is not an execution outcome; the row is returned untouched.
    expect(result.queue).toBe(queue);
    expect(result.task.steps[0]).toMatchObject({ status: 'pending' });
  });

  it('runs the same task once its ceiling permits it', async () => {
    // The positive control. Without it a boundary that refused everything would
    // pass the assertion above perfectly.
    const queue = scheduled('permitted', 'full-automation');
    const { handler, result } = await run(queue, 'permitted', 'full-automation');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.task.status).toBe('completed');
  });

  it('does not let a stored full-automation ceiling widen a read-only live setting', async () => {
    // The direction that matters most: the ceiling is a bound, never a grant. An
    // automation created when the user allowed everything must not keep that
    // authority after the user narrows the global setting.
    const queue = scheduled('stale-grant', 'full-automation');
    const { handler, result } = await run(queue, 'stale-grant', 'read-only');

    expect(handler).not.toHaveBeenCalled();
    expect(result.refusal).toMatchObject({
      code: 'operation-denied',
      reason: expect.stringContaining('requires full-automation permission'),
    });
  });

  it('leaves a row carrying no ceiling governed by the live permission alone', async () => {
    // Every hand-run task and every pre-existing queue row states no bound, and
    // must behave exactly as it did before ceilings existed.
    const queue = rehydrated(deleteDeckTask('unbounded'));
    const { handler, result } = await run(queue, 'unbounded', 'full-automation');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.task.status).toBe('completed');
  });
});

/**
 * `applyAgentRunToQueue`'s docstring has always said Pause and Cancel "stay live
 * while a step is in flight and must not be reverted by its write-back". They
 * were: `agentQueueStatusForTask` had no branch for either, so any run that did
 * not fail or complete the task folded the row back to `queued` — resurrecting a
 * cancelled task as runnable work and silently undoing a pause.
 */
describe('a run write-back respects the row status the user chose', () => {
  const task = createAgentTask('task-writeback', 'Objective', [{
    id: 'step-1',
    label: 'Step',
    request: { callId: 'call-1', operation: 'flashcard.list-decks', arguments: {} },
  }], 10);
  const empty = normalizeAgentTaskQueue({ version: 1, items: [] });

  it.each(['cancelled', 'paused'] as const)('keeps a %s row at that status', (status) => {
    const queue = updateAgentQueueItem(enqueueAgentTask(empty, task), task.id, { status });
    const applied = applyAgentRunToQueue(queue, { ...task, status: 'running' });
    expect(applied.items[0].status).toBe(status);
    // The task itself is still written back — only the row's status is the
    // user's decision rather than the run's report.
    expect(applied.items[0].task.status).toBe('running');
  });

  it('still reports completion and failure onto a live row', () => {
    const queue = enqueueAgentTask(empty, task);
    expect(applyAgentRunToQueue(queue, { ...task, status: 'completed' }).items[0].status)
      .toBe('completed');
    expect(applyAgentRunToQueue(queue, { ...task, status: 'failed' }).items[0].status)
      .toBe('failed');
    expect(applyAgentRunToQueue(queue, { ...task, status: 'running' }).items[0].status)
      .toBe('queued');
  });
});
