// @vitest-environment node
/**
 * The main-owned Agent operational store.
 *
 * Three properties carry real risk and are pinned against a real temp directory
 * rather than a double, because what is being checked is what ends up on disk:
 *
 * - retention prunes *terminal* queue rows only. Pruning a queued or paused row
 *   by age would silently drop outstanding work the user asked for.
 * - legacy adoption happens at most once, and never over the top of data main
 *   already owns. Without the second half, a second window replaying its stale
 *   localStorage after the first had migrated would roll the store back.
 * - an unknown schema version reads as empty (fail closed), which is exactly why
 *   the IPC layer has to guard a *write* before the store sees it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AGENT_QUEUE_TERMINAL_RETENTION_MS,
  AGENT_OPERATIONAL_SCHEMA_VERSION,
} from '../../shared/agentOperationalState';
import { createAgentOperationalStore, type AgentOperationalStore } from '../agentOperationalStore';

const NOW = 1_800_000_000_000;

let root = '';
let store: AgentOperationalStore;

function queueItem(id: string, status: string, updatedAt: number) {
  return {
    id,
    task: { id, objective: 'o', steps: [], status: 'planned' },
    priority: 0,
    status,
    createdAt: updatedAt,
    updatedAt,
  };
}

function memoryEntry(id: string) {
  return {
    id,
    category: 'learning',
    key: `key-${id}`,
    value: `value-${id}`,
    createdAt: NOW,
    updatedAt: NOW,
  };
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

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-operational-'));
  store = createAgentOperationalStore(root, () => NOW);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('agent operational store', () => {
  it('reads an empty document before anything has been written', () => {
    const state = store.read();
    expect(state.version).toBe(AGENT_OPERATIONAL_SCHEMA_VERSION);
    expect(state.queue.items).toEqual([]);
    expect(state.memory.entries).toEqual([]);
    expect(state.automations).toEqual([]);
    expect(state.legacyMigratedAt).toBeNull();
    expect(fs.existsSync(store.filePath)).toBe(false);
  });

  it('round-trips all three sections through the file', () => {
    store.write({
      version: 1,
      queue: { version: 1, items: [queueItem('t1', 'queued', NOW)] },
      memory: { version: 1, entries: [memoryEntry('m1')] },
      automations: [automation('a1')],
      legacyMigratedAt: null,
    });

    const reread = createAgentOperationalStore(root, () => NOW).read();
    expect(reread.queue.items.map((item) => item.id)).toEqual(['t1']);
    expect(reread.memory.entries.map((entry) => entry.id)).toEqual(['m1']);
    expect(reread.automations.map((entry) => entry.id)).toEqual(['a1']);
  });

  it('round-trips normalized task origin coordinates without inventing them for legacy rows', () => {
    store.write({
      version: 1,
      queue: {
        version: 1,
        items: [
          {
            ...queueItem('with-origin', 'queued', NOW),
            origin: {
              conversationId: ' chat-1 ',
              contextIds: [' ctx-one ', 'ctx-one', 'ctx-two'],
            },
          },
          queueItem('legacy', 'queued', NOW),
        ],
      },
    });

    const reread = createAgentOperationalStore(root, () => NOW).read();
    expect(reread.queue.items[0].origin).toEqual({
      conversationId: 'chat-1',
      contextIds: ['ctx-one', 'ctx-two'],
    });
    expect(reread.queue.items[1]).not.toHaveProperty('origin');
    const raw = JSON.parse(fs.readFileSync(store.filePath, 'utf8'));
    expect(raw.queue.items[0].origin).toEqual({
      conversationId: 'chat-1',
      contextIds: ['ctx-one', 'ctx-two'],
    });
    expect(raw.queue.items[1]).not.toHaveProperty('origin');
  });

  it('writes the document atomically and leaves no temporary file behind', () => {
    store.write({ version: 1, queue: { version: 1, items: [queueItem('t1', 'queued', NOW)] } });
    const directory = path.dirname(store.filePath);
    expect(fs.readdirSync(directory)).toEqual([path.basename(store.filePath)]);
  });

  it('prunes terminal queue rows past the retention window but keeps live ones', () => {
    const stale = NOW - AGENT_QUEUE_TERMINAL_RETENTION_MS - 1;
    const state = store.write({
      version: 1,
      queue: {
        version: 1,
        items: [
          queueItem('done-old', 'completed', stale),
          queueItem('failed-old', 'failed', stale),
          queueItem('cancelled-old', 'cancelled', stale),
          queueItem('done-recent', 'completed', NOW),
          // The point of the rule: outstanding work is never pruned by age.
          queueItem('queued-old', 'queued', stale),
          queueItem('paused-old', 'paused', stale),
          queueItem('running-old', 'running', stale),
        ],
      },
    });

    expect(state.queue.items.map((item) => item.id)).toEqual([
      'done-recent',
      'queued-old',
      'paused-old',
      'running-old',
    ]);
  });

  it('reads an unknown schema version as empty rather than guessing', () => {
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true });
    fs.writeFileSync(
      store.filePath,
      JSON.stringify({ version: 99, queue: { version: 1, items: [queueItem('t1', 'queued', NOW)] } }),
      'utf8',
    );
    expect(store.read().queue.items).toEqual([]);
  });

  it('reads a corrupt file as empty rather than throwing', () => {
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true });
    fs.writeFileSync(store.filePath, '{ not json', 'utf8');
    expect(store.read().queue.items).toEqual([]);
  });

  describe('legacy adoption', () => {
    it('adopts all three legacy documents once and latches', () => {
      const adopted = store.migrateLegacy({
        queue: { version: 1, items: [queueItem('t1', 'queued', NOW)] },
        memory: { version: 1, entries: [memoryEntry('m1')] },
        automations: [automation('a1')],
      });

      expect(adopted.queue.items.map((item) => item.id)).toEqual(['t1']);
      expect(adopted.memory.entries.map((entry) => entry.id)).toEqual(['m1']);
      expect(adopted.automations.map((entry) => entry.id)).toEqual(['a1']);
      expect(adopted.legacyMigratedAt).toBe(NOW);

      // A second window replaying its own stale copy must not roll anything back.
      const again = store.migrateLegacy({
        queue: { version: 1, items: [queueItem('stale', 'queued', NOW)] },
        memory: { version: 1, entries: [memoryEntry('stale')] },
        automations: [automation('stale')],
      });
      expect(again.queue.items.map((item) => item.id)).toEqual(['t1']);
      expect(again.memory.entries.map((entry) => entry.id)).toEqual(['m1']);
      expect(again.automations.map((entry) => entry.id)).toEqual(['a1']);
      expect(again.legacyMigratedAt).toBe(NOW);
    });

    it('latches even when legacy storage held nothing', () => {
      expect(store.migrateLegacy({}).legacyMigratedAt).toBe(NOW);
      const second = store.migrateLegacy({
        queue: { version: 1, items: [queueItem('late', 'queued', NOW)] },
      });
      expect(second.queue.items).toEqual([]);
    });

    it('never overwrites a section main already owns', () => {
      store.write({
        version: 1,
        queue: { version: 1, items: [queueItem('owned', 'queued', NOW)] },
        memory: { version: 1, entries: [] },
        automations: [],
        legacyMigratedAt: null,
      });

      const adopted = store.migrateLegacy({
        queue: { version: 1, items: [queueItem('legacy', 'queued', NOW)] },
        memory: { version: 1, entries: [memoryEntry('m1')] },
      });

      // The occupied section is left alone; the empty one still adopts.
      expect(adopted.queue.items.map((item) => item.id)).toEqual(['owned']);
      expect(adopted.memory.entries.map((entry) => entry.id)).toEqual(['m1']);
    });

    it('does not rewrite the file when the latch is already set', () => {
      store.migrateLegacy({});
      const before = fs.statSync(store.filePath).mtimeMs;
      const again = store.migrateLegacy({ automations: [automation('a1')] });
      expect(again.automations).toEqual([]);
      expect(fs.statSync(store.filePath).mtimeMs).toBe(before);
    });
  });

  describe('subscribers', () => {
    it('notifies on write and stops after unsubscribe', () => {
      const seen: number[] = [];
      const off = store.subscribe((state) => seen.push(state.automations.length));

      store.write({ version: 1, automations: [automation('a1')] });
      expect(seen).toEqual([1]);

      off();
      store.write({ version: 1, automations: [automation('a1'), automation('a2')] });
      expect(seen).toEqual([1]);
    });

    it('does not let a failing subscriber break a write that already landed', () => {
      store.subscribe(() => {
        throw new Error('subscriber exploded');
      });
      expect(() => store.write({ version: 1, automations: [automation('a1')] })).not.toThrow();
      expect(store.read().automations).toHaveLength(1);
    });
  });
});
