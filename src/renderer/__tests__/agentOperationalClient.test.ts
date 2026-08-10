// @vitest-environment jsdom
/**
 * The renderer's synchronous view of the main-owned Agent operational document.
 *
 * The reason this module is worth its own test is the shape it has to hold: the
 * consumers (`agentToolRegistry`, `LocalAgentPanel`, the settings Memory page)
 * read synchronously, while the owner is asynchronous and lives in another
 * process. Four properties fall out of that and each has a way to go wrong
 * quietly:
 *
 * - a write must be visible to the very next synchronous read, or a tool adapter
 *   that saves a memory and immediately re-reads it sees the old document;
 * - a burst of writes must coalesce into ordered, non-overlapping saves, or the
 *   stored document is decided by which invoke resolved last;
 * - a push from another window must be applied without echoing back as a save;
 * - the legacy `localStorage` keys must be dropped only once main confirms it
 *   consulted them, and must never be rewritten — that is the whole point of the
 *   migration being one-way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AGENT_AUTOMATIONS_CHANGED_EVENT,
  AGENT_MEMORY_CHANGED_EVENT,
  AGENT_QUEUE_CHANGED_EVENT,
  LEGACY_AGENT_AUTOMATIONS_KEY,
  LEGACY_AGENT_MEMORY_KEY,
  LEGACY_AGENT_QUEUE_KEY,
  flushAgentOperationalState,
  getAgentOperationalState,
  initAgentOperationalState,
  resetAgentOperationalStateForTests,
} from '../agentOperationalClient';
import {
  loadLocalAgentTaskQueue,
  onLocalAgentTaskQueueChanged,
  saveLocalAgentTaskQueue,
  saveLocalAgentTaskQueueDurably,
} from '../localAgentTaskQueueStore';
import {
  loadLocalAgentMemory,
  onLocalAgentMemoryChanged,
  removeLocalAgentMemory,
  saveLocalAgentMemory,
} from '../localAgentMemoryStore';
import {
  loadLocalAgentAutomations,
  onLocalAgentAutomationsChanged,
  saveLocalAgentAutomation,
} from '../localAgentAutomationStore';
import type { AgentAutomation } from '../../shared/localAgentAutomation';

const NOW = 1_800_000_000_000;

function queueItem(id: string) {
  return {
    id,
    task: { id, objective: 'o', steps: [], status: 'planned' },
    priority: 0,
    status: 'queued',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function memoryEntry(id: string) {
  return {
    id,
    category: 'learning' as const,
    key: `key-${id}`,
    value: `value-${id}`,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function automation(id: string): AgentAutomation {
  return {
    id,
    name: `Automation ${id}`,
    objective: 'Review due cards',
    frequency: 'daily',
    time: '09:00',
    enabled: true,
    permission: 'read-only',
    createdAt: NOW,
  };
}

function emptyDocument() {
  return {
    version: 1,
    queue: { version: 1, items: [] },
    memory: { version: 1, entries: [] },
    automations: [],
    legacyMigratedAt: null,
  };
}

interface Bridge {
  stored: ReturnType<typeof emptyDocument>;
  saves: unknown[];
  migrations: unknown[];
  loadCalls: number;
  push: ((state: unknown) => void) | null;
  api: Record<string, unknown>;
}

function installBridge(overrides: Partial<Record<string, unknown>> = {}): Bridge {
  const bridge: Bridge = {
    stored: emptyDocument(),
    saves: [],
    migrations: [],
    loadCalls: 0,
    push: null,
    api: {},
  };
  bridge.api = {
    agentOperationalLoad: async () => {
      bridge.loadCalls += 1;
      return { ok: true, state: bridge.stored };
    },
    agentOperationalSave: async (state: unknown) => {
      bridge.saves.push(structuredClone(state));
      bridge.stored = structuredClone(state) as ReturnType<typeof emptyDocument>;
      return { ok: true, state: bridge.stored };
    },
    agentOperationalMigrateLegacy: async (payload: unknown) => {
      bridge.migrations.push(structuredClone(payload));
      return { ok: true, state: bridge.stored };
    },
    onAgentOperationalChanged: (callback: (state: unknown) => void) => {
      bridge.push = callback;
      return () => {
        bridge.push = null;
      };
    },
    ...overrides,
  };
  (window as unknown as { api: unknown }).api = bridge.api;
  return bridge;
}

beforeEach(() => {
  localStorage.clear();
  resetAgentOperationalStateForTests();
  delete (window as unknown as { api?: unknown }).api;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hydration', () => {
  it('makes the loaded document visible to synchronous readers', async () => {
    const bridge = installBridge();
    bridge.stored = {
      ...emptyDocument(),
      queue: { version: 1, items: [queueItem('t1')] },
      memory: { version: 1, entries: [memoryEntry('m1')] },
      automations: [automation('a1')],
    };

    await initAgentOperationalState();

    expect(loadLocalAgentTaskQueue().items.map((item) => item.id)).toEqual(['t1']);
    expect(loadLocalAgentMemory().entries.map((entry) => entry.id)).toEqual(['m1']);
    expect(loadLocalAgentAutomations().map((entry) => entry.id)).toEqual(['a1']);
  });

  it('runs once per window however many callers ask', async () => {
    const bridge = installBridge();
    await Promise.all([
      initAgentOperationalState(),
      initAgentOperationalState(),
      initAgentOperationalState(),
    ]);
    expect(bridge.loadCalls).toBe(1);
  });

  it('subscribes to the change push before loading, so a concurrent write is not lost', async () => {
    const order: string[] = [];
    const bridge = installBridge({
      onAgentOperationalChanged: () => {
        order.push('subscribe');
        return () => undefined;
      },
      agentOperationalLoad: async () => {
        order.push('load');
        return { ok: true, state: emptyDocument() };
      },
    });
    await initAgentOperationalState();
    expect(order).toEqual(['subscribe', 'load']);
    expect(bridge.saves).toEqual([]);
  });

  it('degrades to an empty in-memory document when the bridge is missing', async () => {
    await initAgentOperationalState();
    expect(loadLocalAgentTaskQueue().items).toEqual([]);
    expect(getAgentOperationalState().legacyMigratedAt).toBeNull();
  });
});

describe('legacy migration', () => {
  it('hands the three legacy documents to main and then drops the keys', async () => {
    localStorage.setItem(
      LEGACY_AGENT_QUEUE_KEY,
      JSON.stringify({ version: 1, items: [queueItem('t1')] }),
    );
    localStorage.setItem(
      LEGACY_AGENT_MEMORY_KEY,
      JSON.stringify({ version: 1, entries: [memoryEntry('m1')] }),
    );
    localStorage.setItem(LEGACY_AGENT_AUTOMATIONS_KEY, JSON.stringify([automation('a1')]));

    const bridge = installBridge();
    await initAgentOperationalState();

    expect(bridge.migrations).toHaveLength(1);
    const payload = bridge.migrations[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['automations', 'memory', 'queue']);

    expect(localStorage.getItem(LEGACY_AGENT_QUEUE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AGENT_MEMORY_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AGENT_AUTOMATIONS_KEY)).toBeNull();
  });

  it('does not call main at all when there is nothing legacy to adopt', async () => {
    const bridge = installBridge();
    await initAgentOperationalState();
    expect(bridge.migrations).toEqual([]);
  });

  it('sends only the keys that exist', async () => {
    localStorage.setItem(LEGACY_AGENT_AUTOMATIONS_KEY, JSON.stringify([automation('a1')]));
    const bridge = installBridge();
    await initAgentOperationalState();
    expect(Object.keys(bridge.migrations[0] as object)).toEqual(['automations']);
  });

  it('keeps the legacy keys when the bridge cannot confirm the adoption', async () => {
    localStorage.setItem(LEGACY_AGENT_AUTOMATIONS_KEY, JSON.stringify([automation('a1')]));
    installBridge({ agentOperationalMigrateLegacy: undefined });
    await initAgentOperationalState();
    // A stale preload must not cost the user their schedule; the next launch
    // with a correct preload still migrates it.
    expect(localStorage.getItem(LEGACY_AGENT_AUTOMATIONS_KEY)).not.toBeNull();
  });

  it('treats a malformed legacy document as absent rather than throwing', async () => {
    localStorage.setItem(LEGACY_AGENT_QUEUE_KEY, '{ not json');
    localStorage.setItem(LEGACY_AGENT_AUTOMATIONS_KEY, JSON.stringify([automation('a1')]));
    const bridge = installBridge();
    await expect(initAgentOperationalState()).resolves.toBeUndefined();
    expect(Object.keys(bridge.migrations[0] as object)).toEqual(['automations']);
  });

  it('never writes a legacy key back after a save', async () => {
    const bridge = installBridge();
    await initAgentOperationalState();

    saveLocalAgentAutomation(automation('a1'));
    saveLocalAgentMemory({ id: 'm1', category: 'learning', key: 'k', value: 'v' });
    saveLocalAgentTaskQueue({ version: 1, items: [queueItem('t1')] });
    await flushAgentOperationalState();

    expect(bridge.saves.length).toBeGreaterThan(0);
    expect(localStorage.getItem(LEGACY_AGENT_QUEUE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AGENT_MEMORY_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AGENT_AUTOMATIONS_KEY)).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});

describe('writes', () => {
  it('is visible to the next synchronous read, before the save resolves', async () => {
    installBridge();
    await initAgentOperationalState();

    saveLocalAgentMemory({ id: 'm1', category: 'learning', key: 'k', value: 'v' });
    expect(loadLocalAgentMemory().entries.map((entry) => entry.id)).toEqual(['m1']);

    removeLocalAgentMemory('m1');
    expect(loadLocalAgentMemory().entries).toEqual([]);
  });

  it('coalesces a burst into ordered saves that end on the latest state', async () => {
    const bridge = installBridge();
    await initAgentOperationalState();

    saveLocalAgentTaskQueue({ version: 1, items: [queueItem('t1')] });
    saveLocalAgentTaskQueue({ version: 1, items: [queueItem('t1'), queueItem('t2')] });
    saveLocalAgentTaskQueue({ version: 1, items: [queueItem('t1'), queueItem('t2'), queueItem('t3')] });
    await flushAgentOperationalState();

    // Three writes, at most two invokes: the first in flight, one more carrying
    // whatever accumulated behind it.
    expect(bridge.saves.length).toBeLessThanOrEqual(2);
    const last = bridge.saves[bridge.saves.length - 1] as {
      queue: { items: Array<{ id: string }> };
    };
    expect(last.queue.items.map((item) => item.id)).toEqual(['t1', 't2', 't3']);
  });

  it('never has two saves in flight at once', async () => {
    let inFlight = 0;
    let overlapped = false;
    const bridge = installBridge({
      agentOperationalSave: async (state: unknown) => {
        inFlight += 1;
        if (inFlight > 1) overlapped = true;
        await Promise.resolve();
        inFlight -= 1;
        return { ok: true, state };
      },
    });
    await initAgentOperationalState();

    for (let index = 0; index < 8; index += 1) {
      saveLocalAgentTaskQueue({ version: 1, items: [queueItem(`t${index}`)] });
    }
    await flushAgentOperationalState();
    expect(overlapped).toBe(false);
    expect(bridge.saves).toBeDefined();
  });

  it('sends the whole document, so one section cannot erase another', async () => {
    const bridge = installBridge();
    await initAgentOperationalState();

    saveLocalAgentAutomation(automation('a1'));
    await flushAgentOperationalState();
    saveLocalAgentMemory({ id: 'm1', category: 'learning', key: 'k', value: 'v' });
    await flushAgentOperationalState();

    const last = bridge.saves[bridge.saves.length - 1] as {
      automations: Array<{ id: string }>;
      memory: { entries: Array<{ id: string }> };
    };
    expect(last.automations.map((entry) => entry.id)).toEqual(['a1']);
    expect(last.memory.entries.map((entry) => entry.id)).toEqual(['m1']);
  });

  it('returns a generation-bound receipt when main refuses the write', async () => {
    installBridge({
      agentOperationalSave: async () => ({ ok: false, code: 'write-failed' }),
    });
    await initAgentOperationalState();

    const receipt = await saveLocalAgentTaskQueueDurably({
      version: 1,
      items: [queueItem('failed')],
    });

    expect(receipt).toEqual({
      ok: false,
      code: 'write-failed',
      requestedGeneration: 1,
      attemptGeneration: 1,
    });
    // The synchronous contract remains optimistic even when durability fails.
    expect(loadLocalAgentTaskQueue().items.map((item) => item.id)).toEqual(['failed']);
  });

  it('returns bridge-unavailable without hanging when no save method exists', async () => {
    installBridge({ agentOperationalSave: undefined });
    await initAgentOperationalState();

    await expect(
      saveLocalAgentTaskQueueDurably({ version: 1, items: [queueItem('session-only')] }),
    ).resolves.toEqual({
      ok: false,
      code: 'bridge-unavailable',
      requestedGeneration: 1,
      attemptGeneration: 1,
    });
  });

  it('binds each receipt to the save attempt that covered its generation', async () => {
    let releaseFirst: (() => void) | null = null;
    const saves: unknown[] = [];
    installBridge({
      agentOperationalSave: async (state: unknown) => {
        saves.push(structuredClone(state));
        if (saves.length === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return { ok: true, state };
      },
    });
    await initAgentOperationalState();

    const first = saveLocalAgentTaskQueueDurably({
      version: 1,
      items: [queueItem('t1')],
    });
    const second = saveLocalAgentTaskQueueDurably({
      version: 1,
      items: [queueItem('t1'), queueItem('t2')],
    });
    const third = saveLocalAgentTaskQueueDurably({
      version: 1,
      items: [queueItem('t1'), queueItem('t2'), queueItem('t3')],
    });

    releaseFirst?.();

    await expect(first).resolves.toMatchObject({
      ok: true,
      requestedGeneration: 1,
      attemptGeneration: 1,
    });
    await expect(second).resolves.toMatchObject({
      ok: true,
      requestedGeneration: 2,
      attemptGeneration: 3,
    });
    await expect(third).resolves.toMatchObject({
      ok: true,
      requestedGeneration: 3,
      attemptGeneration: 3,
    });
    expect(saves).toHaveLength(2);
  });

  it('keeps durable saves single-flight and never adopts an older reply state', async () => {
    let releaseFirst: (() => void) | null = null;
    let inFlight = 0;
    let maximumInFlight = 0;
    let calls = 0;
    installBridge({
      agentOperationalSave: async (state: unknown) => {
        calls += 1;
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        if (calls === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
          inFlight -= 1;
          return {
            ok: true,
            state: { ...emptyDocument(), queue: { version: 1, items: [queueItem('stale')] } },
          };
        }
        inFlight -= 1;
        return { ok: true, state };
      },
    });
    await initAgentOperationalState();

    const first = saveLocalAgentTaskQueueDurably({
      version: 1,
      items: [queueItem('first')],
    });
    const latest = saveLocalAgentTaskQueueDurably({
      version: 1,
      items: [queueItem('latest')],
    });
    releaseFirst?.();

    await Promise.all([first, latest]);
    expect(maximumInFlight).toBe(1);
    expect(loadLocalAgentTaskQueue().items.map((item) => item.id)).toEqual(['latest']);
  });
});

describe('change events', () => {
  it('announces only the section that changed', async () => {
    installBridge();
    await initAgentOperationalState();

    const seen: string[] = [];
    const offQueue = onLocalAgentTaskQueueChanged(() => seen.push('queue'));
    const offMemory = onLocalAgentMemoryChanged(() => seen.push('memory'));
    const offAutomations = onLocalAgentAutomationsChanged(() => seen.push('automations'));

    saveLocalAgentMemory({ id: 'm1', category: 'learning', key: 'k', value: 'v' });
    expect(seen).toEqual(['memory']);

    saveLocalAgentTaskQueue({ version: 1, items: [queueItem('t1')] });
    expect(seen).toEqual(['memory', 'queue']);

    offQueue();
    offMemory();
    offAutomations();
    saveLocalAgentAutomation(automation('a1'));
    expect(seen).toEqual(['memory', 'queue']);
  });

  it('applies a push from another window and fires the same events', async () => {
    const bridge = installBridge();
    await initAgentOperationalState();

    const seen: string[] = [];
    onLocalAgentAutomationsChanged(() => seen.push(AGENT_AUTOMATIONS_CHANGED_EVENT));
    onLocalAgentMemoryChanged(() => seen.push(AGENT_MEMORY_CHANGED_EVENT));
    onLocalAgentTaskQueueChanged(() => seen.push(AGENT_QUEUE_CHANGED_EVENT));

    bridge.push?.({
      ...emptyDocument(),
      automations: [automation('from-other-window')],
    });

    expect(loadLocalAgentAutomations().map((entry) => entry.id)).toEqual(['from-other-window']);
    expect(seen).toEqual([AGENT_AUTOMATIONS_CHANGED_EVENT]);
  });

  it('does not echo a push back to main as a save', async () => {
    const bridge = installBridge();
    await initAgentOperationalState();

    bridge.push?.({ ...emptyDocument(), automations: [automation('a1')] });
    await flushAgentOperationalState();

    expect(bridge.saves).toEqual([]);
  });

  it('re-derives a pushed document instead of trusting it', async () => {
    const bridge = installBridge();
    await initAgentOperationalState();

    bridge.push?.({
      version: 1,
      queue: { version: 1, items: [queueItem('t1'), { id: '', task: null }] },
      memory: { version: 1, entries: [memoryEntry('m1'), { id: 'bad' }] },
      automations: [automation('a1'), { id: 'no-name' }],
      legacyMigratedAt: 'nonsense',
    });

    const state = getAgentOperationalState();
    expect(state.queue.items.map((item) => item.id)).toEqual(['t1']);
    expect(state.memory.entries.map((entry) => entry.id)).toEqual(['m1']);
    expect(state.automations.map((entry) => entry.id)).toEqual(['a1']);
    expect(state.legacyMigratedAt).toBeNull();
  });

  it('keeps the current document when a push is unusable', async () => {
    const bridge = installBridge();
    await initAgentOperationalState();
    saveLocalAgentAutomation(automation('a1'));

    bridge.push?.({ version: 99 });

    // An unknown schema normalizes to empty; the client must not adopt that over
    // a document it already holds.
    expect(loadLocalAgentAutomations().map((entry) => entry.id)).toEqual(['a1']);
  });
});
