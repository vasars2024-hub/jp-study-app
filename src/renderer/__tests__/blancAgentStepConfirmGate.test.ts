// @vitest-environment jsdom
/**
 * The Blanc queue panel's *Confirm sensitive step* button, driven as a user
 * drives it.
 *
 * The two-paths drift this pins is the one the evidence ledger named: the Agent
 * surface approves a step through `resolveAgentStepApproval`, and this panel had
 * its own confirm button that called `runAgentTaskStep` with `confirmedCallIds`
 * and consulted that gate not at all. Not because anyone skipped it — the gate
 * took an `AgentConversation`, a message id and a card id, none of which exist
 * here. So the panel answered a shorter question: it re-checked the profile
 * allow-list, and checked nothing about the queue row.
 *
 * Which made this reachable, entirely from one screen: create a plan whose step
 * needs confirmation, press Cancel on its row in the queue table, then press
 * Confirm on the buttons a few pixels above. The step ran. `cancelAgentQueueItem`
 * marks the ROW and never touches the task, so the step is still
 * `waiting-confirmation` and a step-only check waves it through — the same hole
 * commit 042ef46 closed on the Agent side, still open on this one. Pause was the
 * same story with a second consequence: the run happens and
 * `agentQueueStatusForTask` then carefully preserves the `paused` status over it.
 *
 * So this drives the real component, the real store and the real gate:
 *   - `runAgentTaskStep` is the ONE thing mocked, because it is the execution
 *     boundary and "did the step run" is the whole question. Everything else in
 *     `localAgentQueueRun` is the real module.
 *   - the queue is the real main-owned snapshot (`resetAgentOperationalStateForTests`
 *     seeds a fresh one per test, and the bridge simply degrades with no
 *     `window.api.agentOperational*`), so the Cancel click really is what the
 *     Confirm click reads back.
 *   - the refusal text is compared against the English catalog entry, so a
 *     missing i18n key fails here rather than rendering a raw key at the user.
 *
 * `.test.ts`, not `.test.tsx`: `vitest.config.ts` collects both under this
 * directory, but the repo's convention here is `createElement` over JSX so the
 * root configs stay untouched (see `localAgentProfileOperationsUi.test.ts`).
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTask } from '../../shared/localAgent';

const NOW = 1_700_000_000_000;

let runCalls: unknown[][];

/**
 * `window.api` before the imports, not in `beforeEach`.
 *
 * The panel's import graph reaches `keyboardShortcuts` → `playerBus`, which
 * calls `window.api.onPlayerSync(...)` at module scope. Imports are hoisted
 * above every statement in this file, so a stub installed in `beforeEach` is
 * installed after the module that needed it already threw. `vi.hoisted` is the
 * one hook that runs earlier.
 */
const BOOT_API = vi.hoisted(() => {
  const api = {
    onPlayerSync: () => () => undefined,
    onPlayerCommand: () => () => undefined,
    playerWindowId: () => Promise.resolve('test-window'),
    playerGetSnapshot: () => Promise.resolve(null),
  };
  (globalThis as Record<string, unknown>).api = api;
  return api;
});

// The single execution boundary in `src/renderer`. Spying on it is what turns
// "the gate refused" into "nothing ran"; the rest of the module — selection,
// the queue write-back, `pendingAgentTaskStep` — stays real.
vi.mock('../localAgentQueueRun', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../localAgentQueueRun')>();
  return {
    ...actual,
    runAgentTaskStep: (...args: unknown[]) => {
      runCalls.push(args);
      const task = args[1] as AgentTask;
      const step = args[2] as AgentTask['steps'][number];
      const options = args[3] as { allowedOperations?: readonly string[] };
      if (options.allowedOperations && !options.allowedOperations.includes(step.request.operation)) {
        return Promise.resolve({
          queue: args[0],
          task,
          events: [],
          refusal: {
            code: 'operation-denied',
            reason: `${step.request.operation} is not enabled for the active agent profile.`,
          },
        });
      }
      return Promise.resolve({
        queue: args[0],
        task: {
          ...task,
          status: 'completed',
          steps: task.steps.map((entry) => ({ ...entry, status: 'completed' })),
        },
        events: [],
      });
    },
  };
});

import { LocalAgentPanel } from '../components/blanc/BlancReadyToolPanels';
import { resetAgentOperationalStateForTests } from '../agentOperationalClient';
import { loadLocalAgentTaskQueue } from '../localAgentTaskQueueStore';
import {
  loadLocalAgentProfiles,
  setLocalAgentProfileOperations,
} from '../localAgentProfilesStore';
import { en } from '../../shared/i18n/catalogs';

const SETTINGS_KEY = 'jp-study-local-agent-settings-v1';
const PROFILES_KEY = 'jp-study-local-agent-profiles-v1';

/** A plan whose only step is sensitive, which is what the Confirm verb is for. */
function plannedTask(): AgentTask {
  return {
    id: 'task-1',
    objective: 'Mine today’s reading into the deck',
    status: 'waiting-confirmation',
    steps: [{
      id: 'step-1',
      label: 'Add three cards to Core 2k',
      request: {
        callId: 'call-1',
        operation: 'flashcard.add-cards',
        arguments: { cards: [{ front: 'a', back: 'b' }] },
      },
      status: 'waiting-confirmation',
    }],
    currentStepId: 'step-1',
    createdAt: NOW,
    updatedAt: NOW,
  } as AgentTask;
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  runCalls = [];
  vi.stubGlobal('localStorage', memoryStorage());
  // `limited-actions` is what `flashcard.add-cards` demands, and the default
  // `study-tutor` profile enables it — so the operation check PASSES and a
  // refusal below can only have come from the queue row. `backend` matters:
  // `normalizeLocalAgentSettings` forces `enabled` false while the backend is
  // `disabled`, and a disabled agent cannot plan, so the panel would never get
  // a task to confirm.
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    enabled: true,
    backend: 'local-gguf',
    permission: 'limited-actions',
  }));
  // The store also keeps an in-memory fallback across tests. Supplying an
  // explicit raw store makes each mount normalize from factory profiles again
  // after the preceding parameterized case narrows one of them.
  localStorage.setItem(PROFILES_KEY, JSON.stringify({
    version: 1,
    activeProfileId: 'study-tutor',
    profiles: [],
  }));
  vi.stubGlobal('api', {
    ...BOOT_API,
    onLocalAgentTrigger: () => () => undefined,
    localAgentClaimTriggers: () => Promise.resolve(true),
    localAgentReleaseTriggers: () => Promise.resolve(true),
    localAgentStatus: () => Promise.resolve({ loaded: false, busy: false }),
    localAgentModels: () => Promise.resolve([]),
    localAgentPlan: () => Promise.resolve({
      ok: true,
      summary: 'Plan ready',
      task: plannedTask(),
      modelFileName: 'model.gguf',
    }),
  });
  resetAgentOperationalStateForTests();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

async function mountPanel(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container as HTMLDivElement);
    root.render(createElement(LocalAgentPanel));
  });
}

function buttonLabelled(label: string): HTMLButtonElement {
  const found = Array.from(container?.querySelectorAll('button') ?? [])
    .find((entry) => entry.textContent?.trim() === label);
  if (!found) throw new Error(`no button labelled "${label}" — the panel changed shape`);
  return found;
}

async function click(label: string): Promise<void> {
  const target = buttonLabelled(label);
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function disableOperation(operation: string): Promise<void> {
  const target = container?.querySelector(`input[data-operation="${operation}"]`) as HTMLInputElement | null;
  if (!target) throw new Error(`no operation checkbox for "${operation}"`);
  expect(target.checked).toBe(true);
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(target.checked).toBe(false);
}

function status(): string {
  return container?.querySelector('p.blanc-status')?.textContent ?? '';
}

/**
 * The English text of a key, as the panel would render it.
 *
 * Going through the catalog rather than hard-coding the sentences is what makes
 * a missing or misspelled i18n key fail *here*, loudly, instead of shipping a
 * raw `blanc.agent.…` key to the user. A `CatalogEntry` can also be a plural
 * object; every key this file uses is a plain sentence, and one that stopped
 * being a plain sentence should break the test rather than stringify oddly.
 */
function english(key: string): string {
  const value = (en as Record<string, unknown>)[key];
  if (typeof value !== 'string') throw new Error(`no plain English string for "${key}"`);
  return value;
}

/** Types into the request box the way React sees a real keystroke. */
async function describeTask(text: string): Promise<void> {
  const area = container?.querySelectorAll('textarea')[0] as HTMLTextAreaElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(area, text);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Plan, so the panel holds a live task whose only step awaits confirmation. */
async function planASensitiveStep(): Promise<void> {
  await mountPanel();
  await describeTask('Mine today’s reading into the deck');
  await click(english('blanc.agent.action.createPlan'));
}

describe('Blanc confirm-step verb', () => {
  it('runs the step while the queue row is still runnable', async () => {
    // The control that keeps the refusals below honest: same panel, same task,
    // same profile — only the row status differs.
    await planASensitiveStep();
    await click(english('blanc.agent.action.confirmStep'));
    expect(runCalls).toHaveLength(1);
    const options = runCalls[0][3] as { confirmedCallIds?: ReadonlySet<string> };
    expect([...(options.confirmedCallIds ?? [])]).toEqual(['call-1']);
  });

  it.each([
    ['cancelled', 'common.cancel'],
    ['paused', 'common.pause'],
  ] as const)('refuses once the row is %s in the queue table below it', async (_status, verb) => {
    await planASensitiveStep();
    await click(english(verb));
    await click(english('blanc.agent.action.confirmStep'));

    expect(runCalls).toHaveLength(0);
    expect(status()).toBe(english('blanc.agent.approvalRefusal.taskNotRunnable'));
  });

  it('leaves the stopped row exactly as the user left it', async () => {
    // A refusal that still wrote to the queue would be its own defect: the panel
    // would report "not runnable" and hand the row back changed.
    await planASensitiveStep();
    await click(english('common.cancel'));
    const before = loadLocalAgentTaskQueue();
    await click(english('blanc.agent.action.confirmStep'));
    expect(loadLocalAgentTaskQueue()).toEqual(before);
    expect(loadLocalAgentTaskQueue().items[0]?.status).toBe('cancelled');
  });

  it('refuses when the permission level no longer allows the step’s operation', async () => {
    // The allow-list was the one thing the old path was said to check — and it
    // did, by handing the step to `runAgentTaskStep` and letting the executor
    // deny it. That is not a refusal: the step STARTS and then fails, so a
    // withdrawn permission failed the whole plan instead of declining a button.
    // Measured, not assumed: with the old body restored this test fails on the
    // status line, not on `runCalls`. `read-only` is below `flashcard.add-cards`.
    await planASensitiveStep();
    const select = Array.from(container?.querySelectorAll('select') ?? [])
      .find((entry) => Array.from(entry.options).some((option) => option.value === 'read-only'));
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      setValue?.call(select, 'read-only');
      select?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await click(english('blanc.agent.action.confirmStep'));
    expect(runCalls).toHaveLength(0);
    expect(status()).toBe(english('blanc.agent.approvalRefusal.operationDenied'));
  });
});

describe('Blanc non-confirm run verbs', () => {
  it.each([
    ['run next', 'blanc.agent.action.runNext'],
    ['run queued', 'blanc.agent.action.runQueued'],
  ] as const)('renders a refusal and preserves the queue when %s loses profile access', async (_name, verb) => {
    await planASensitiveStep();
    const before = loadLocalAgentTaskQueue();

    // The task was planned while Add flashcards was enabled. Narrow the live
    // built-in profile after planning, then drive each ordinary run button.
    await disableOperation('flashcard.add-cards');
    await click(english(verb));

    expect(runCalls).toHaveLength(1);
    const options = runCalls[0][3] as { allowedOperations?: readonly string[] };
    expect(options.allowedOperations).not.toContain('flashcard.add-cards');
    expect(status()).toBe(english('blanc.agent.approvalRefusal.operationDenied'));
    expect(loadLocalAgentTaskQueue()).toEqual(before);
    expect(loadLocalAgentTaskQueue().items[0]?.task).toMatchObject({
      status: 'waiting-confirmation',
      steps: [expect.objectContaining({ status: 'waiting-confirmation' })],
    });
  });

  it.each([
    ['cancelled', 'common.cancel'],
    ['paused', 'common.pause'],
  ] as const)('Run next respects a live %s queue row instead of using its stale task copy', async (_status, stopVerb) => {
    await planASensitiveStep();
    await click(english(stopVerb));
    const before = loadLocalAgentTaskQueue();

    await click(english('blanc.agent.action.runNext'));

    expect(runCalls).toHaveLength(0);
    expect(status()).toBe(english('blanc.agent.refusal.itemNotRunnable'));
    expect(loadLocalAgentTaskQueue()).toEqual(before);
  });

  it('re-reads a profile narrowed outside this mounted panel', async () => {
    await planASensitiveStep();
    const rendered = container?.querySelector(
      'input[data-operation="flashcard.add-cards"]',
    ) as HTMLInputElement | null;
    expect(rendered?.checked).toBe(true);

    // Simulate another window editing the shared renderer store. This panel
    // intentionally still renders its old checkbox; execution must not use it
    // as authority.
    const store = loadLocalAgentProfiles();
    const active = store.profiles.find((profile) => profile.id === store.activeProfileId);
    if (!active) throw new Error('expected an active profile');
    setLocalAgentProfileOperations(
      store,
      active.id,
      active.enabledOperations.filter((operation) => operation !== 'flashcard.add-cards'),
    );
    expect(rendered?.checked).toBe(true);

    const before = loadLocalAgentTaskQueue();
    await click(english('blanc.agent.action.runNext'));

    expect(runCalls).toHaveLength(1);
    const options = runCalls[0][3] as { allowedOperations?: readonly string[] };
    expect(options.allowedOperations).not.toContain('flashcard.add-cards');
    expect(status()).toBe(english('blanc.agent.approvalRefusal.operationDenied'));
    expect(loadLocalAgentTaskQueue()).toEqual(before);
  });
});
