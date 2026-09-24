/**
 * The main-owned store for the Agent's task queue, memory, automations and
 * context-suggestion preferences.
 *
 * Deliberately a sibling of `agentWorkspaceStore.ts` rather than a second
 * document inside it: the workspace is conversation content and this is
 * operational state with a different lifetime, a different retention rule and —
 * critically — a main-side reader. `localAgentScheduler.ts` subscribes here, so
 * the automation schedule is live in main whether or not a renderer has ever
 * opened.
 *
 * The write is atomic (temp file + rename, `0o600`) for the same reason the
 * workspace write is: a partial document is indistinguishable from a corrupt one
 * on the next read, and the next read fails closed to empty.
 */

import path from 'node:path';
import { app } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import {
  adoptLegacyAgentOperationalState,
  emptyAgentOperationalState,
  normalizeAgentOperationalState,
  pruneAgentOperationalState,
  type AgentOperationalState,
  type LegacyAgentOperationalPayload,
} from '../shared/agentOperationalState';

const OPERATIONAL_FILE = 'operational-v1.json';

export type AgentOperationalListener = (state: AgentOperationalState) => void;

export interface AgentOperationalStore {
  readonly filePath: string;
  read(): AgentOperationalState;
  write(value: unknown): AgentOperationalState;
  migrateLegacy(payload: LegacyAgentOperationalPayload): AgentOperationalState;
  /**
   * Fires after any write this store performed. The scheduler uses it; the IPC
   * layer does not, because it must distinguish the window that asked from the
   * windows that need telling.
   */
  subscribe(listener: AgentOperationalListener): () => void;
}

function readFile(filePath: string): AgentOperationalState {
  const raw = readJsonSync<unknown>(filePath, null, {
    validate: (value) => !!value && typeof value === 'object',
  });
  if (raw === null) return emptyAgentOperationalState();
  try {
    return normalizeAgentOperationalState(raw);
  } catch {
    return emptyAgentOperationalState();
  }
}

function atomicWrite(filePath: string, state: AgentOperationalState): void {
  writeJsonAtomicSync(filePath, state, { mode: 0o600 });
}

export function createAgentOperationalStore(
  rootDirectory: string,
  now: () => number = Date.now,
): AgentOperationalStore {
  const filePath = path.join(rootDirectory, 'agent', OPERATIONAL_FILE);
  const listeners = new Set<AgentOperationalListener>();

  const commit = (value: AgentOperationalState): AgentOperationalState => {
    const state = pruneAgentOperationalState(value, now());
    atomicWrite(filePath, state);
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch {
        // A subscriber's failure is its own; it must not fail the write that
        // already reached disk.
      }
    }
    return state;
  };

  return {
    filePath,
    read: () => readFile(filePath),
    write: (value: unknown) => commit(normalizeAgentOperationalState(value)),
    migrateLegacy: (payload: LegacyAgentOperationalPayload) => {
      const current = readFile(filePath);
      const adopted = adoptLegacyAgentOperationalState(current, payload, now());
      // Already latched: nothing changed, so nothing is written and no
      // subscriber is woken. The renderer still gets the authoritative state
      // back and can drop its legacy keys.
      if (adopted === current) return current;
      return commit(adopted);
    },
    subscribe: (listener: AgentOperationalListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let defaultStore: AgentOperationalStore | null = null;

export function getAgentOperationalStore(): AgentOperationalStore {
  if (!defaultStore) defaultStore = createAgentOperationalStore(app.getPath('userData'));
  return defaultStore;
}
