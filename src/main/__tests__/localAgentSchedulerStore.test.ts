// @vitest-environment node
/**
 * The scheduler now reads the schedule out of the main-owned operational store
 * instead of waiting for a renderer to push it.
 *
 * That is the behavioural change worth pinning. Before, `schedules` was empty
 * until some window booted and sent `localAgent:syncAutomations`, which meant a
 * daily automation did not exist in main until a renderer had rendered — and two
 * windows could push two different schedules. These tests assert the two halves
 * of the replacement: the schedule is live at startup from the store alone, and
 * a write from any window reaches the scheduler without a renderer telling it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeWindow {
  destroyed: boolean;
  sent: Array<{ channel: string; payload: unknown }>;
}

const registry = vi.hoisted(() => ({ windows: [] as FakeWindow[] }));

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  BrowserWindow: {
    getAllWindows: () => registry.windows.map((window) => ({
      isDestroyed: () => window.destroyed,
      webContents: {
        send: (channel: string, payload: unknown) => window.sent.push({ channel, payload }),
      },
    })),
  },
}));

import {
  createAgentOperationalStore,
  type AgentOperationalStore,
} from '../agentOperationalStore';
import {
  registerLocalAgentSchedulerIpc,
  stopLocalAgentScheduler,
} from '../localAgentScheduler';

/** A Wednesday, 09:00 local time. */
const WEDNESDAY_0900 = new Date(2027, 0, 6, 9, 0, 0, 0);

let root = '';
let store: AgentOperationalStore;

function automation(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Automation ${id}`,
    objective: 'Review due cards',
    frequency: 'daily',
    time: '09:00',
    enabled: true,
    permission: 'read-only',
    createdAt: 1,
    ...overrides,
  };
}

function writeAutomations(entries: unknown[]): void {
  store.write({
    version: 1,
    queue: { version: 1, items: [] },
    memory: { version: 1, entries: [] },
    automations: entries,
    legacyMigratedAt: null,
  });
}

function makeWindow(): FakeWindow {
  const window: FakeWindow = { destroyed: false, sent: [] };
  registry.windows.push(window);
  return window;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(WEDNESDAY_0900);
  registry.windows.length = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-scheduler-'));
  store = createAgentOperationalStore(root, () => WEDNESDAY_0900.getTime());
});

afterEach(() => {
  stopLocalAgentScheduler();
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('scheduler over the main-owned store', () => {
  it('fires a due automation that was already in the store at startup', () => {
    const window = makeWindow();
    writeAutomations([automation('a1')]);

    // No renderer has pushed anything; the store is the only source.
    registerLocalAgentSchedulerIpc(() => store);

    expect(window.sent).toHaveLength(1);
    expect(window.sent[0].channel).toBe('localAgent:trigger');
    expect((window.sent[0].payload as { id: string }).id).toBe('a1');
  });

  it('picks up an automation written after startup', () => {
    const window = makeWindow();
    registerLocalAgentSchedulerIpc(() => store);
    expect(window.sent).toEqual([]);

    writeAutomations([automation('later')]);

    expect(window.sent.map((message) => (message.payload as { id: string }).id))
      .toEqual(['later']);
  });

  it('fires a given automation at most once per day', () => {
    const window = makeWindow();
    registerLocalAgentSchedulerIpc(() => store);

    writeAutomations([automation('a1')]);
    // A second, unrelated write re-applies the schedule and ticks again.
    writeAutomations([automation('a1'), automation('a2', { time: '23:59' })]);

    expect(window.sent.map((message) => (message.payload as { id: string }).id))
      .toEqual(['a1']);
  });

  it('does not fire a disabled automation', () => {
    const window = makeWindow();
    writeAutomations([automation('off', { enabled: false })]);
    registerLocalAgentSchedulerIpc(() => store);
    expect(window.sent).toEqual([]);
  });

  it('respects the weekday of a weekly automation', () => {
    const window = makeWindow();
    writeAutomations([
      // Wednesday is 3; Monday is 1.
      automation('wednesday', { frequency: 'weekly', weekday: 3 }),
      automation('monday', { frequency: 'weekly', weekday: 1 }),
    ]);
    registerLocalAgentSchedulerIpc(() => store);
    expect(window.sent.map((message) => (message.payload as { id: string }).id))
      .toEqual(['wednesday']);
  });

  it('stops listening to the store once stopped', () => {
    const window = makeWindow();
    registerLocalAgentSchedulerIpc(() => store);
    stopLocalAgentScheduler();

    writeAutomations([automation('a1')]);

    expect(window.sent).toEqual([]);
  });

  it('does not send to a destroyed window', () => {
    const gone = makeWindow();
    gone.destroyed = true;
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);
    expect(gone.sent).toEqual([]);
  });

  it('re-registering replaces the previous subscription rather than doubling it', () => {
    const window = makeWindow();
    registerLocalAgentSchedulerIpc(() => store);
    registerLocalAgentSchedulerIpc(() => store);

    writeAutomations([automation('a1')]);

    expect(window.sent).toHaveLength(1);
  });
});
