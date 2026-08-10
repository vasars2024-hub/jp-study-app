// @vitest-environment node
/**
 * Handler behaviour for the Agent operational bridge.
 *
 * The destructive path is the one worth pinning: `store.write` normalizes, and
 * normalization of an unknown schema version is the *empty* document — so a
 * handler that forwarded a malformed payload would answer "saved" while erasing
 * the queue, the memory and the schedule at once. That runs against a real store
 * on a real temp directory, because the guarantee is about what reaches disk.
 *
 * The other one is the broadcast. It must reach the other windows and skip the
 * one that caused the write, which already has the state as its return value.
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

import { AGENT_OPERATIONAL_CHANNELS } from '../../shared/agentOperationalBridge';
import { AGENT_EXECUTION_LEASE_CHANNELS } from '../../shared/agentExecutionLeaseBridge';
import type { AgentOperationalResult } from '../../shared/agentOperationalBridge';
import {
  createAgentOperationalStore,
  type AgentOperationalStore,
} from '../agentOperationalStore';
import { registerAgentOperationalIpc } from '../agentOperationalIpc';

const NOW = 1_800_000_000_000;

let root = '';
let store: AgentOperationalStore;

const invoke = (channel: string, sender: unknown, ...args: unknown[]): AgentOperationalResult => {
  const handler = registry.handlers.get(channel);
  if (!handler) throw new Error(`no handler registered for ${channel}`);
  return handler({ sender }, ...args) as AgentOperationalResult;
};

function makeWindow(id: number): FakeWindow {
  const window: FakeWindow = { id, destroyed: false, sent: [] };
  registry.windows.push(window);
  return window;
}

function automation(id: string) {
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

function document(automations: unknown[] = [automation('a1')]) {
  return {
    version: 1,
    queue: { version: 1, items: [] },
    memory: { version: 1, entries: [] },
    automations,
    legacyMigratedAt: null,
  };
}

beforeEach(() => {
  registry.handlers.clear();
  registry.duplicates.length = 0;
  registry.windows.length = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-operational-ipc-'));
  store = createAgentOperationalStore(root, () => NOW);
  registerAgentOperationalIpc(() => store);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('agent operational IPC', () => {
  it('registers the operational and execution-lease handlers once each', () => {
    expect([...registry.handlers.keys()].sort()).toEqual([
      ...Object.values(AGENT_EXECUTION_LEASE_CHANNELS),
      AGENT_OPERATIONAL_CHANNELS.load,
      AGENT_OPERATIONAL_CHANNELS.migrateLegacy,
      AGENT_OPERATIONAL_CHANNELS.save,
    ].sort());
    expect(registry.duplicates).toEqual([]);
  });

  it('loads the stored document', () => {
    store.write(document());
    const result = invoke(AGENT_OPERATIONAL_CHANNELS.load, null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.automations.map((entry) => entry.id)).toEqual(['a1']);
  });

  it('saves a well-formed document', () => {
    const result = invoke(AGENT_OPERATIONAL_CHANNELS.save, null, document());
    expect(result.ok).toBe(true);
    expect(store.read().automations.map((entry) => entry.id)).toEqual(['a1']);
  });

  it('refuses a payload of the wrong schema version instead of erasing the document', () => {
    store.write(document());
    const result = invoke(AGENT_OPERATIONAL_CHANNELS.save, null, { version: 99, automations: [] });
    expect(result).toEqual({ ok: false, code: 'invalid-request' });
    // The stored schedule survived the malformed write.
    expect(store.read().automations.map((entry) => entry.id)).toEqual(['a1']);
  });

  it.each([null, undefined, 'nope', 42, []])('refuses a non-document save: %p', (payload) => {
    store.write(document());
    expect(invoke(AGENT_OPERATIONAL_CHANNELS.save, null, payload))
      .toEqual({ ok: false, code: 'invalid-request' });
    expect(store.read().automations).toHaveLength(1);
  });

  it.each([null, 'nope', 42, []])('refuses a non-object legacy payload: %p', (payload) => {
    expect(invoke(AGENT_OPERATIONAL_CHANNELS.migrateLegacy, null, payload))
      .toEqual({ ok: false, code: 'invalid-request' });
  });

  it('adopts a legacy payload through the bridge', () => {
    const result = invoke(AGENT_OPERATIONAL_CHANNELS.migrateLegacy, null, {
      automations: [automation('legacy')],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.automations.map((entry) => entry.id)).toEqual(['legacy']);
      expect(result.state.legacyMigratedAt).toBe(NOW);
    }
  });

  it('answers a failing read with a code and no prose', () => {
    const exploding: AgentOperationalStore = {
      ...store,
      read: () => {
        throw new Error(`EACCES: ${root}\\agent\\operational-v1.json`);
      },
    };
    registry.handlers.clear();
    registerAgentOperationalIpc(() => exploding);
    expect(invoke(AGENT_OPERATIONAL_CHANNELS.load, null)).toEqual({ ok: false, code: 'read-failed' });
  });

  it('answers a failing write with a code and no prose', () => {
    const exploding: AgentOperationalStore = {
      ...store,
      write: () => {
        throw new Error(`ENOSPC: ${root}\\agent\\operational-v1.json`);
      },
    };
    registry.handlers.clear();
    registerAgentOperationalIpc(() => exploding);
    expect(invoke(AGENT_OPERATIONAL_CHANNELS.save, null, document()))
      .toEqual({ ok: false, code: 'write-failed' });
  });

  describe('cross-window broadcast', () => {
    it('reaches the other windows and skips the one that wrote', () => {
      const author = makeWindow(1);
      const other = makeWindow(2);

      invoke(AGENT_OPERATIONAL_CHANNELS.save, { id: author.id }, document());

      expect(author.sent).toEqual([]);
      expect(other.sent).toHaveLength(1);
      expect(other.sent[0].channel).toBe(AGENT_OPERATIONAL_CHANNELS.changed);
      const payload = other.sent[0].payload as { automations: Array<{ id: string }> };
      expect(payload.automations.map((entry) => entry.id)).toEqual(['a1']);
    });

    it('broadcasts a legacy adoption too, so a second window sees the migrated state', () => {
      const author = makeWindow(1);
      const other = makeWindow(2);

      invoke(AGENT_OPERATIONAL_CHANNELS.migrateLegacy, { id: author.id }, {
        automations: [automation('legacy')],
      });

      expect(author.sent).toEqual([]);
      expect(other.sent.map((message) => message.channel))
        .toEqual([AGENT_OPERATIONAL_CHANNELS.changed]);
    });

    it('does not send to a destroyed window', () => {
      const gone = makeWindow(2);
      gone.destroyed = true;
      invoke(AGENT_OPERATIONAL_CHANNELS.save, { id: 1 }, document());
      expect(gone.sent).toEqual([]);
    });

    it('does not broadcast when the save was refused', () => {
      const other = makeWindow(2);
      invoke(AGENT_OPERATIONAL_CHANNELS.save, { id: 1 }, { version: 99 });
      expect(other.sent).toEqual([]);
    });
  });
});
