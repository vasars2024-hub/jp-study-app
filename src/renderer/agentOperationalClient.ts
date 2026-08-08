/**
 * Renderer side of the Agent operational bridge — the one place in `src/renderer`
 * that holds the task queue, memory and automations.
 *
 * The hard constraint this module exists to satisfy: **the consumers are
 * synchronous.** `loadLocalAgentMemory()` is called from inside a tool adapter in
 * `agentToolRegistry.ts`, and both `LocalAgentPanel` and the settings Memory page
 * seed `useState` from a plain function call. Persistence moving to main makes
 * the *transport* asynchronous, but rewriting every call site into a promise
 * would have meant rewriting three surfaces and their render paths in the same
 * slice that changes where the bytes live.
 *
 * So the shape is a synchronous snapshot over an asynchronous owner:
 *
 * - `initAgentOperationalState()` runs once per window, from `renderer/main.tsx`.
 *   It subscribes to main's change push, loads the authoritative document, then
 *   performs the one-way `localStorage` adoption and drops the legacy keys.
 * - Reads return the snapshot, synchronously, exactly as before.
 * - Writes update the snapshot synchronously — so the UI stays responsive and a
 *   subsequent read in the same tick sees its own write — and are persisted to
 *   main by a single-flight loop that always sends the latest state.
 * - Main's push replaces the snapshot and re-fires the same `CustomEvent`s the
 *   old renderer-owned stores fired, which is what makes a change in one window
 *   land in another with no consumer changes.
 *
 * The snapshot is a cache of a main-owned document, not a second owner. Nothing
 * here writes `localStorage`: the legacy keys are read once, at adoption, and
 * then removed. A window whose preload predates this bridge degrades to a
 * session-only in-memory document rather than resurrecting the old key.
 */

import {
  emptyAgentOperationalState,
  normalizeAgentOperationalState,
  type AgentOperationalState,
  type LegacyAgentOperationalPayload,
} from '../shared/agentOperationalState';
import {
  agentOperationalFailure,
  isAgentOperationalSavePayload,
  normalizeAgentOperationalResult,
  type AgentOperationalResult,
} from '../shared/agentOperationalBridge';
import type { AgentTaskQueue } from '../shared/localAgentTaskQueue';
import type { AgentMemoryStore } from '../shared/localAgentMemory';
import type { AgentAutomation } from '../shared/localAgentAutomation';

/** The three documents the renderer used to own outright. */
export const LEGACY_AGENT_QUEUE_KEY = 'jp-study-local-agent-task-queue-v1';
export const LEGACY_AGENT_MEMORY_KEY = 'jp-study-local-agent-memory-v1';
export const LEGACY_AGENT_AUTOMATIONS_KEY = 'jp-study-local-agent-automations-v1';

/**
 * The event names are unchanged from the renderer-owned stores. Existing
 * subscribers keep working, and they now also fire for a change that happened in
 * a different window.
 */
export const AGENT_QUEUE_CHANGED_EVENT = 'jp-study-local-agent-task-queue-changed';
export const AGENT_MEMORY_CHANGED_EVENT = 'jp-study-local-agent-memory-changed';
export const AGENT_AUTOMATIONS_CHANGED_EVENT = 'jp-study-local-agent-automations-changed';

interface AgentOperationalBridge {
  agentOperationalLoad(): Promise<unknown>;
  agentOperationalSave(state: AgentOperationalState): Promise<unknown>;
  agentOperationalMigrateLegacy(payload: LegacyAgentOperationalPayload): Promise<unknown>;
  onAgentOperationalChanged(callback: (state: AgentOperationalState) => void): () => void;
}

type BridgeMethod = keyof AgentOperationalBridge;

let snapshot: AgentOperationalState = emptyAgentOperationalState();
let initPromise: Promise<void> | null = null;
let saving: Promise<void> | null = null;
let dirty = false;

/**
 * `window.api` is declared by `window.d.ts`, but this can run in a window that
 * predates the preload carrying these methods (a pop-out opened before an
 * upgrade, or a test harness). A missing method degrades; it does not throw.
 */
function bridgeMethod<K extends BridgeMethod>(name: K): AgentOperationalBridge[K] | null {
  if (typeof window === 'undefined') return null;
  const api = (window as { api?: Partial<AgentOperationalBridge> }).api;
  const method = api?.[name];
  return typeof method === 'function' ? (method.bind(api) as AgentOperationalBridge[K]) : null;
}

async function call(
  invoke: (() => Promise<unknown>) | null,
  onThrow: 'read-failed' | 'write-failed',
): Promise<AgentOperationalResult> {
  if (!invoke) return agentOperationalFailure('bridge-unavailable');
  try {
    return normalizeAgentOperationalResult(await invoke());
  } catch {
    // An invoke rejects when the channel has no handler, or main threw before
    // its own try/catch. Neither is worth surfacing verbatim.
    return agentOperationalFailure(onThrow);
  }
}

function emit(name: string, detail: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Whether a section is unchanged.
 *
 * Reference equality is the fast path and covers every local write, which passes
 * the previous reference through for sections it did not touch. It is not enough
 * for a document that arrived from main: normalization allocates a fresh object
 * for all three sections, so an incoming push would look like "everything
 * changed" and wake every subscriber — a memory edit in another window would
 * re-render this window's queue panel. Both sides are normalized output with a
 * stable key order, so serializing is a sound deep comparison here.
 */
function sameSection(previous: unknown, next: unknown): boolean {
  return previous === next || JSON.stringify(previous) === JSON.stringify(next);
}

/**
 * Replaces the snapshot and announces only the sections that actually changed.
 * Unchanged sections keep their previous reference, so a consumer holding one in
 * React state is not handed a new object that renders identically.
 */
function applySnapshot(incoming: AgentOperationalState): void {
  const previous = snapshot;
  const next: AgentOperationalState = {
    ...incoming,
    queue: sameSection(previous.queue, incoming.queue) ? previous.queue : incoming.queue,
    memory: sameSection(previous.memory, incoming.memory) ? previous.memory : incoming.memory,
    automations: sameSection(previous.automations, incoming.automations)
      ? previous.automations
      : incoming.automations,
  };
  snapshot = next;
  if (previous.queue !== next.queue) emit(AGENT_QUEUE_CHANGED_EVENT, next.queue);
  if (previous.memory !== next.memory) emit(AGENT_MEMORY_CHANGED_EVENT, next.memory);
  if (previous.automations !== next.automations) {
    emit(AGENT_AUTOMATIONS_CHANGED_EVENT, next.automations);
  }
}

/**
 * Single-flight persistence.
 *
 * A burst of writes — pausing three queue rows, or a plan enqueuing a task while
 * a step completes — must not produce interleaved saves whose completion order
 * decides the stored document. The loop coalesces: it always sends the newest
 * snapshot, and it never has two saves in flight. The result of a save is
 * ignored on purpose; main's reply is the state it just wrote, which is the
 * state we already hold, and adopting it would clobber a write made while the
 * save was in flight.
 */
function schedulePersist(): void {
  dirty = true;
  if (saving) return;
  saving = (async () => {
    try {
      while (dirty) {
        dirty = false;
        const method = bridgeMethod('agentOperationalSave');
        const pending = snapshot;
        await call(method && (() => method(pending)), 'write-failed');
      }
    } finally {
      saving = null;
    }
  })();
}

/** Resolves once every queued save has been flushed. Used by tests and shutdown. */
export function flushAgentOperationalState(): Promise<void> {
  return saving ?? Promise.resolve();
}

export function getAgentOperationalState(): AgentOperationalState {
  return snapshot;
}

export function getAgentTaskQueueSnapshot(): AgentTaskQueue {
  return snapshot.queue;
}

export function getAgentMemorySnapshot(): AgentMemoryStore {
  return snapshot.memory;
}

export function getAgentAutomationsSnapshot(): readonly AgentAutomation[] {
  return snapshot.automations;
}

export function setAgentTaskQueueSnapshot(queue: AgentTaskQueue): AgentTaskQueue {
  applySnapshot({ ...snapshot, queue });
  schedulePersist();
  return snapshot.queue;
}

export function setAgentMemorySnapshot(memory: AgentMemoryStore): AgentMemoryStore {
  applySnapshot({ ...snapshot, memory });
  schedulePersist();
  return snapshot.memory;
}

export function setAgentAutomationsSnapshot(
  automations: AgentAutomation[],
): AgentAutomation[] {
  applySnapshot({ ...snapshot, automations });
  schedulePersist();
  return snapshot.automations;
}

function readLegacyKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    // A malformed legacy document is indistinguishable from an absent one for
    // migration purposes: the normalizers would reduce it to empty anyway.
    return undefined;
  }
}

function readLegacyPayload(): LegacyAgentOperationalPayload | null {
  if (typeof localStorage === 'undefined') return null;
  const queue = readLegacyKey(LEGACY_AGENT_QUEUE_KEY);
  const memory = readLegacyKey(LEGACY_AGENT_MEMORY_KEY);
  const automations = readLegacyKey(LEGACY_AGENT_AUTOMATIONS_KEY);
  if (queue === undefined && memory === undefined && automations === undefined) return null;
  return {
    ...(queue === undefined ? {} : { queue }),
    ...(memory === undefined ? {} : { memory }),
    ...(automations === undefined ? {} : { automations }),
  };
}

function dropLegacyKeys(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_AGENT_QUEUE_KEY);
    localStorage.removeItem(LEGACY_AGENT_MEMORY_KEY);
    localStorage.removeItem(LEGACY_AGENT_AUTOMATIONS_KEY);
  } catch {
    // Removal is best-effort. Main has latched the migration, so a key that
    // survives is inert on the next launch rather than a second source of truth.
  }
}

/**
 * Hydrates this window. Idempotent, and safe to call before the bridge exists.
 *
 * Order matters. The change subscription is installed *before* the load so a
 * write by another window during hydration is not lost between the read and the
 * first render. Legacy adoption runs after the load because main decides whether
 * to adopt, and it can only decide that against the document it already has.
 *
 * The legacy keys are dropped only when main confirms it consulted them. If the
 * bridge is unavailable the keys stay, so a later launch with a correct preload
 * still migrates instead of having silently discarded the user's queue.
 */
export function initAgentOperationalState(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const subscribe = bridgeMethod('onAgentOperationalChanged');
      // A push is authoritative and must not echo back as a save; `applySnapshot`
      // is deliberately used here rather than the setters.
      subscribe?.((state) => applySnapshot(normalizeIncoming(state)));

      const loaded = await call(
        (() => {
          const method = bridgeMethod('agentOperationalLoad');
          return method && (() => method());
        })(),
        'read-failed',
      );
      if (loaded.ok) applySnapshot(loaded.state);

      const legacy = readLegacyPayload();
      if (!legacy) return;
      const method = bridgeMethod('agentOperationalMigrateLegacy');
      const migrated = await call(method && (() => method(legacy)), 'write-failed');
      if (!migrated.ok) return;
      applySnapshot(migrated.state);
      dropLegacyKeys();
    })();
  }
  return initPromise;
}

/**
 * A pushed state crosses the same untrusted boundary as a reply, so it is
 * re-derived rather than trusted — but the version is checked *before*
 * normalization, exactly as a save is guarded in main.
 *
 * `normalizeAgentOperationalState` answers an unknown version with the EMPTY
 * document. That is the right answer for a cold read, where empty is genuinely
 * all we know, and the wrong one for a push: adopting it would wipe the document
 * this window is already holding and, because the setters persist, write that
 * emptiness back on the next edit. An unusable push is dropped instead.
 */
function normalizeIncoming(state: unknown): AgentOperationalState {
  if (!isAgentOperationalSavePayload(state)) return snapshot;
  return normalizeAgentOperationalState(state);
}

/**
 * Test seam. Drops the hydration latch and the cached document so a suite can
 * run a fresh window against a fresh bridge; production has exactly one window
 * lifetime and never calls it.
 */
export function resetAgentOperationalStateForTests(
  state: AgentOperationalState = emptyAgentOperationalState(),
): void {
  snapshot = state;
  initPromise = null;
  saving = null;
  dirty = false;
}
