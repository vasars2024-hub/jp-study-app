// @vitest-environment node
/**
 * The scheduler reads the schedule out of the main-owned operational store
 * instead of waiting for a renderer to push it, and — since 2026-08-22 — it
 * delivers a fire to one *claiming* renderer and writes down what happened.
 *
 * Both halves are pinned here. The store half: the schedule is live at startup
 * from the store alone, and a write from any window reaches the scheduler
 * without a renderer telling it. The delivery half: a fire with no claimant is
 * recorded as `missed` rather than vanishing, and a fire with two claimants
 * reaches exactly one of them. The old contract — send to every open window —
 * is what made a scheduled automation silently do nothing outside Blanc's agent
 * tool, so the tests that asserted it are gone deliberately.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeWindow {
  id: number;
  destroyed: boolean;
  focused: boolean;
  sent: Array<{ channel: string; payload: unknown }>;
}

const registry = vi.hoisted(() => ({ windows: [] as FakeWindow[], nextId: 1 }));

function asBrowserWindow(window: FakeWindow) {
  return {
    isDestroyed: () => window.destroyed,
    webContents: {
      id: window.id,
      isDestroyed: () => window.destroyed,
      send: (channel: string, payload: unknown) => window.sent.push({ channel, payload }),
    },
  };
}

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: {
    handle: () => undefined,
    removeHandler: () => undefined,
  },
  BrowserWindow: {
    getAllWindows: () => registry.windows.map(asBrowserWindow),
    getFocusedWindow: () => {
      const found = registry.windows.find((window) => window.focused && !window.destroyed);
      return found ? asBrowserWindow(found) : null;
    },
  },
}));

import {
  createAgentOperationalStore,
  type AgentOperationalStore,
} from '../agentOperationalStore';
import {
  claimLocalAgentTriggersForTesting,
  registerLocalAgentSchedulerIpc,
  stopLocalAgentScheduler,
} from '../localAgentScheduler';
import type { AgentAutomationRun } from '../../shared/localAgentAutomationRuns';

/** A Wednesday, 09:00 local time. */
const WEDNESDAY_0900 = new Date(2027, 0, 6, 9, 0, 0, 0);

let root = '';
let store: AgentOperationalStore;
const releases: Array<() => void> = [];

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
    ...store.read(),
    version: 1,
    automations: entries,
  });
}

/** A window that has told main it runs automations. */
function makeClaimingWindow(options: { focused?: boolean } = {}): FakeWindow {
  const window: FakeWindow = {
    id: registry.nextId += 1,
    destroyed: false,
    focused: options.focused === true,
    sent: [],
  };
  registry.windows.push(window);
  releases.push(claimLocalAgentTriggersForTesting(window.id));
  return window;
}

/** A window with no automation handler mounted — the main app, in practice. */
function makeSilentWindow(): FakeWindow {
  const window: FakeWindow = {
    id: registry.nextId += 1,
    destroyed: false,
    focused: false,
    sent: [],
  };
  registry.windows.push(window);
  return window;
}

function runs(): AgentAutomationRun[] {
  return store.read().automationRuns?.runs ?? [];
}

function firedIds(window: FakeWindow): string[] {
  return window.sent
    .filter((message) => message.channel === 'localAgent:trigger')
    .map((message) => (message.payload as { id: string }).id);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(WEDNESDAY_0900);
  registry.windows.length = 0;
  releases.length = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-scheduler-'));
  store = createAgentOperationalStore(root, () => WEDNESDAY_0900.getTime());
});

afterEach(() => {
  for (const release of releases) release();
  stopLocalAgentScheduler();
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('scheduler over the main-owned store', () => {
  it('fires a due automation that was already in the store at startup', () => {
    const window = makeClaimingWindow();
    writeAutomations([automation('a1')]);

    // No renderer has pushed anything; the store is the only source.
    registerLocalAgentSchedulerIpc(() => store);

    expect(firedIds(window)).toEqual(['a1']);
  });

  it('picks up an automation written after startup', () => {
    const window = makeClaimingWindow();
    registerLocalAgentSchedulerIpc(() => store);
    expect(firedIds(window)).toEqual([]);

    writeAutomations([automation('later')]);

    expect(firedIds(window)).toEqual(['later']);
  });

  it('fires a given automation at most once per day', () => {
    const window = makeClaimingWindow();
    registerLocalAgentSchedulerIpc(() => store);

    writeAutomations([automation('a1')]);
    // A second, unrelated write re-applies the schedule and ticks again.
    writeAutomations([automation('a1'), automation('a2', { time: '23:59' })]);

    expect(firedIds(window)).toEqual(['a1']);
    expect(runs()).toHaveLength(1);
  });

  it('does not fire a disabled automation', () => {
    const window = makeClaimingWindow();
    writeAutomations([automation('off', { enabled: false })]);
    registerLocalAgentSchedulerIpc(() => store);
    expect(firedIds(window)).toEqual([]);
    expect(runs()).toEqual([]);
  });

  it('respects the weekday of a weekly automation', () => {
    const window = makeClaimingWindow();
    writeAutomations([
      // Wednesday is 3; Monday is 1.
      automation('wednesday', { frequency: 'weekly', weekday: 3 }),
      automation('monday', { frequency: 'weekly', weekday: 1 }),
    ]);
    registerLocalAgentSchedulerIpc(() => store);
    expect(firedIds(window)).toEqual(['wednesday']);
  });

  it('stops listening to the store once stopped', () => {
    const window = makeClaimingWindow();
    registerLocalAgentSchedulerIpc(() => store);
    stopLocalAgentScheduler();

    writeAutomations([automation('a1')]);

    expect(firedIds(window)).toEqual([]);
  });

  it('does not send to a destroyed window', () => {
    const gone = makeClaimingWindow();
    gone.destroyed = true;
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);
    expect(firedIds(gone)).toEqual([]);
  });

  it('re-registering replaces the previous subscription rather than doubling it', () => {
    const window = makeClaimingWindow();
    registerLocalAgentSchedulerIpc(() => store);
    registerLocalAgentSchedulerIpc(() => store);

    writeAutomations([automation('a1')]);

    expect(firedIds(window)).toHaveLength(1);
  });
});

describe('delivery is claimed, and a fire with no claimant is recorded', () => {
  it('records a delivered run naming the automation and the claimant count', () => {
    makeClaimingWindow();
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);

    expect(runs()).toEqual([
      {
        automationId: 'a1',
        at: WEDNESDAY_0900.getTime(),
        outcome: 'delivered',
        handlers: 1,
      },
    ]);
  });

  /**
   * The negative control for the whole slice. This window is the main app: open,
   * alive, receiving every other push — and with no automation handler mounted.
   * Before this change it received the trigger and dropped it, and nothing was
   * written anywhere.
   */
  it('records `missed` when an open window exists but nothing claimed the trigger', () => {
    const window = makeSilentWindow();
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);

    // Narrowed to the trigger channel: this window is now correctly pushed the
    // document carrying its own missed run, which is the point of the record.
    expect(firedIds(window)).toEqual([]);
    expect(runs()).toEqual([
      {
        automationId: 'a1',
        at: WEDNESDAY_0900.getTime(),
        outcome: 'missed',
        handlers: 0,
      },
    ]);
  });

  it('delivers to exactly one claimant when two windows claim', () => {
    const first = makeClaimingWindow();
    const second = makeClaimingWindow();
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);

    expect(firedIds(first).length + firedIds(second).length).toBe(1);
    expect(runs()[0].handlers).toBe(2);
  });

  it('prefers the focused claimant over the earliest one', () => {
    const earliest = makeClaimingWindow();
    const focused = makeClaimingWindow({ focused: true });
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);

    expect(firedIds(focused)).toEqual(['a1']);
    expect(firedIds(earliest)).toEqual([]);
  });

  it('falls back to a claimant when the focused window has not claimed', () => {
    const claimant = makeClaimingWindow();
    const focusedButSilent = makeSilentWindow();
    focusedButSilent.focused = true;
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);

    expect(firedIds(claimant)).toEqual(['a1']);
    expect(firedIds(focusedButSilent)).toEqual([]);
  });

  it('drops a claim whose window is gone rather than counting it as a handler', () => {
    const closed = makeClaimingWindow();
    registry.windows.splice(registry.windows.indexOf(closed), 1);
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);

    expect(runs()).toEqual([
      {
        automationId: 'a1',
        at: WEDNESDAY_0900.getTime(),
        outcome: 'missed',
        handlers: 0,
      },
    ]);
  });
});

/**
 * A recorded run that no window is told about is a record only a reload can
 * reach. The scheduler writes straight through the store, so none of the save
 * handler's broadcast runs — the push has to be made here or the surface that
 * must show "nothing was listening" keeps showing the state before the fire.
 */
describe('a recorded run reaches the windows', () => {
  const changed = (window: FakeWindow) => window.sent
    .filter((message) => message.channel === 'agentOperational:changed')
    .map((message) => message.payload as { automationRuns?: { runs: AgentAutomationRun[] } });

  it('pushes the document carrying the run to a window that could not have known', () => {
    const silent = makeSilentWindow();
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);

    const pushes = changed(silent);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].automationRuns?.runs).toEqual([
      {
        automationId: 'a1',
        at: WEDNESDAY_0900.getTime(),
        outcome: 'missed',
        handlers: 0,
      },
    ]);
  });

  it('pushes to the claimant too, which knows it was triggered but not what was written', () => {
    const claimant = makeClaimingWindow();
    writeAutomations([automation('a1')]);
    registerLocalAgentSchedulerIpc(() => store);

    expect(changed(claimant)).toHaveLength(1);
    expect(firedIds(claimant)).toEqual(['a1']);
  });

  /**
   * NEGATIVE CONTROL. A tick that records nothing must push nothing, or a window
   * would be re-rendered every thirty seconds by a document that did not change
   * — and the assertions above would pass against an unconditional push.
   */
  it('pushes nothing when no automation came due', () => {
    const silent = makeSilentWindow();
    writeAutomations([{ ...automation('a1'), time: '23:45' }]);
    registerLocalAgentSchedulerIpc(() => store);

    expect(runs()).toEqual([]);
    expect(changed(silent)).toEqual([]);
  });
});
