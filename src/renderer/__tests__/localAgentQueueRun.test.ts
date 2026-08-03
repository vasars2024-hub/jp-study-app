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
} from '../../shared/localAgentTaskQueue';
import { pendingAgentTaskStep, runAgentTaskStep, selectAgentQueueRun } from '../localAgentQueueRun';

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
    expect(/const runQueued[\s\S]{0,200}?selectAgentQueueRun\(taskQueue, id\)/.test(source)).toBe(true);
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

  it('refuses a queued task whose operation the profile no longer enables', async () => {
    // The cross-session case slice 47e was written for, now that it can actually arise: the
    // task was planned when the profile allowed `flashcard.delete-deck`, persisted, and is run
    // after the operation was removed from the profile. Permission is `full-automation` and the
    // call is pre-confirmed, so the ONLY thing that can stop it is the allow-list.
    const queue = rehydrated(deleteDeckTask('stale'));
    const selection = selectAgentQueueRun(queue, 'stale');
    if (!selection.ok) throw new Error(`expected a runnable selection, got ${selection.reason}`);
    const handler = vi.fn(() => ({ deleted: true }));

    const result = await runAgentTaskStep(queue, selection.item.task, selection.step, {
      permission: 'full-automation',
      allowedOperations: ALLOWED,
      handlers: { 'flashcard.delete-deck': handler },
      confirmedCallIds: new Set(['call-stale']),
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.task.status).toBe('failed');
    expect(result.task.steps[0].error).toMatch(/not enabled for the active agent profile/);
    expect(result.events.map((event) => event.type)).toEqual(['tool-started', 'tool-failed']);
    // and the refusal is persisted back onto the queue item, not just held in the component
    expect(result.queue.items.find((item) => item.id === 'stale')?.status).toBe('failed');
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
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.events.map((event) => event.type)).toEqual(['confirmation-required']);
    expect(result.task.steps[0].status).toBe('waiting-confirmation');
  });
});
