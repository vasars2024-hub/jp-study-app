// @vitest-environment node
/**
 * Handler behaviour for the Agent spend bridge.
 *
 * Two things are worth pinning here rather than in the store's own test.
 *
 * The first is the refusal at the boundary. `normalizeAgentSpendBudget` turns a
 * malformed value into `null` — no ceiling — which is right for reading a
 * corrupt file and catastrophic for a write: a renderer posting rubbish would
 * silently withdraw the user's spending limit and get an "ok" for it. So a
 * malformed request must never reach the store at all, and `null` must still
 * get through, because withdrawing the ceiling on purpose is a real thing to do.
 *
 * The second is the broadcast, including the case the operational store never
 * had: main recording a request nobody asked it for, where there is no origin
 * window to skip and every window is a recipient.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

interface FakeWindow {
  id: number;
  destroyed: boolean;
  sent: Array<{ channel: string; payload: unknown }>;
}

const registry = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  duplicates: [] as string[],
  windows: [] as FakeWindow[],
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      if (registry.handlers.has(channel)) registry.duplicates.push(channel);
      else registry.handlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    getAllWindows: () => registry.windows.map((window) => ({
      isDestroyed: () => window.destroyed,
      webContents: {
        id: window.id,
        send: (channel: string, payload: unknown) => window.sent.push({ channel, payload }),
      },
    })),
  },
}));

import { AGENT_SPEND_CHANNELS, type AgentSpendResult } from '../../shared/agentSpendBridge';
import { createAgentSpendStore, type AgentSpendStore } from '../agentSpendStore';
import { broadcastAgentSpend, registerAgentSpendIpc } from '../agentSpendIpc';

const NOW = new Date(2026, 2, 14, 9, 0, 0).getTime();

let root = '';
let store: AgentSpendStore;

const invoke = (channel: string, sender: unknown, ...args: unknown[]): AgentSpendResult => {
  const handler = registry.handlers.get(channel);
  if (!handler) throw new Error(`no handler registered for ${channel}`);
  return handler({ sender }, ...args) as AgentSpendResult;
};

function makeWindow(id: number): FakeWindow {
  const window: FakeWindow = { id, destroyed: false, sent: [] };
  registry.windows.push(window);
  return window;
}

beforeEach(() => {
  registry.handlers.clear();
  registry.duplicates.length = 0;
  registry.windows.length = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'spend-ipc-'));
  store = createAgentSpendStore(root, () => NOW);
  registerAgentSpendIpc(() => store);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('agent spend IPC', () => {
  it('registers its three spend handlers and three rate handlers exactly once', () => {
    expect([...registry.handlers.keys()].sort()).toEqual([
      AGENT_SPEND_CHANNELS.clear,
      AGENT_SPEND_CHANNELS.load,
      AGENT_SPEND_CHANNELS.setBudget,
      AGENT_SPEND_CHANNELS.pricingLoad,
      AGENT_SPEND_CHANNELS.pricingSet,
      AGENT_SPEND_CHANNELS.pricingMigrate,
    ].sort());
    expect(registry.duplicates).toEqual([]);
  });

  it('refuses a half price at the rate boundary instead of storing it', async () => {
    const set = registry.handlers.get(AGENT_SPEND_CHANNELS.pricingSet)!;
    const result = await set({ sender: { id: 1 } }, { providerId: 'gemini-2.5-flash', price: { inputPerMillionTokens: 1 } });
    expect(result).toEqual({ ok: false, code: 'invalid-request' });
  });

  it('offers no save channel, so a stale window cannot write a total back', () => {
    expect(registry.handlers.has('agentSpend:save')).toBe(false);
  });

  it('loads the current snapshot', () => {
    store.setBudget(4);
    store.record('gemini-2.5-flash', 1);
    const result = invoke(AGENT_SPEND_CHANNELS.load, null);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error('unreachable');
    expect(result.snapshot.period).toBe('2026-03');
    expect(result.snapshot.ledger.budgetUsd).toBe(4);
    expect(result.snapshot.currentPeriod.spentUsd).toBe(1);
  });

  it('sets a ceiling and reaches disk', () => {
    const result = invoke(AGENT_SPEND_CHANNELS.setBudget, null, { budgetUsd: 12.5 });
    expect(result).toMatchObject({ ok: true });
    expect(createAgentSpendStore(root, () => NOW).read().ledger.budgetUsd).toBe(12.5);
  });

  it('accepts null as a deliberate withdrawal of the ceiling', () => {
    store.setBudget(3);
    const result = invoke(AGENT_SPEND_CHANNELS.setBudget, null, { budgetUsd: null });
    expect(result).toMatchObject({ ok: true });
    expect(store.read().ledger.budgetUsd).toBeNull();
  });

  it('refuses a malformed budget instead of quietly withdrawing the ceiling', () => {
    store.setBudget(3);
    for (const payload of [
      { budgetUsd: 'lots' },
      { budgetUsd: Number.NaN },
      { budgetUsd: undefined },
      {},
      null,
      [],
      'nope',
    ]) {
      expect(invoke(AGENT_SPEND_CHANNELS.setBudget, null, payload)).toEqual({
        ok: false,
        code: 'invalid-request',
      });
    }
    // The whole point: the ceiling the user set is still standing.
    expect(store.read().ledger.budgetUsd).toBe(3);
  });

  it('clears the record but leaves the ceiling in force', () => {
    store.setBudget(9);
    store.record('gemini-2.5-flash', 2);
    const result = invoke(AGENT_SPEND_CHANNELS.clear, null);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error('unreachable');
    expect(result.snapshot.currentPeriod.spentUsd).toBe(0);
    expect(result.snapshot.ledger.budgetUsd).toBe(9);
  });

  it('pushes to the other windows and skips the one that wrote', () => {
    const origin = makeWindow(1);
    const other = makeWindow(2);
    invoke(AGENT_SPEND_CHANNELS.setBudget, { id: 1 }, { budgetUsd: 6 });
    expect(origin.sent).toEqual([]);
    expect(other.sent).toHaveLength(1);
    expect(other.sent[0].channel).toBe(AGENT_SPEND_CHANNELS.changed);
  });

  it('pushes a main-written total to every window, since none of them asked', () => {
    const first = makeWindow(1);
    const second = makeWindow(2);
    broadcastAgentSpend(store.record('gemini-2.5-flash', 0.5));
    expect(first.sent).toHaveLength(1);
    expect(second.sent).toHaveLength(1);
    expect(first.sent[0].payload).toMatchObject({
      period: '2026-03',
      currentPeriod: { spentUsd: 0.5, requests: 1 },
    });
  });

  it('does not push to a destroyed window', () => {
    const gone = makeWindow(1);
    gone.destroyed = true;
    broadcastAgentSpend(store.read());
    expect(gone.sent).toEqual([]);
  });

  it('answers a broken store with a code, never a path', () => {
    const broken: AgentSpendStore = {
      filePath: '/secret/user/data/spend-v1.json',
      read: () => { throw new Error('EACCES: /secret/user/data'); },
      setBudget: () => { throw new Error('EACCES: /secret/user/data'); },
      record: () => { throw new Error('EACCES'); },
      clear: () => { throw new Error('EACCES: /secret/user/data'); },
      verdict: () => ({ kind: 'allow', reason: 'no-budget' }),
    };
    registry.handlers.clear();
    registerAgentSpendIpc(() => broken);
    expect(invoke(AGENT_SPEND_CHANNELS.load, null)).toEqual({ ok: false, code: 'read-failed' });
    expect(invoke(AGENT_SPEND_CHANNELS.setBudget, null, { budgetUsd: 1 }))
      .toEqual({ ok: false, code: 'write-failed' });
    expect(invoke(AGENT_SPEND_CHANNELS.clear, null)).toEqual({ ok: false, code: 'write-failed' });
  });
});
