/**
 * The Agent's *operational* state: the task queue, the memory store and the
 * automation schedule.
 *
 * These three lived in `localStorage` under `jp-study-local-agent-task-queue-v1`,
 * `jp-study-local-agent-memory-v1` and `jp-study-local-agent-automations-v1`,
 * written by three renderer modules that each owned their own key. That layout
 * had three defects the conversation store (`agentWorkspace.ts`) had already
 * been moved off:
 *
 * 1. **No cross-window truth.** Each window kept its own `fallback` variable and
 *    its own `localStorage` view. Two open windows diverged silently and the
 *    last writer won.
 * 2. **The scheduler depended on a renderer being alive.** `main`'s automation
 *    scheduler only knew about an automation if some renderer had pushed it over
 *    `localAgent:syncAutomations`. Nothing in main could read the schedule.
 * 3. **No atomicity or retention.** A partial `setItem` under quota pressure
 *    truncated the whole document, and completed queue rows accumulated forever
 *    until the 100-item cap silently dropped the oldest.
 *
 * So the three become one versioned main-owned document. They stay separate
 * *sections* rather than being merged into one list, joined by the Agent's
 * small cross-window suggestion-preference section: they have genuinely
 * different lifetimes (a queue row is transient, a memory entry is long-lived,
 * an automation is a user-authored schedule) and dedicated normalizers.
 *
 * Nothing here decides *authorization*. Whether a queued step may run is still
 * re-checked at execution time by `evaluateAgentToolAccess`, reached through
 * `renderer/localAgentQueueRun.ts`. Persistence moving to main does not grant a
 * resumed task any permission it did not have.
 */

import {
  normalizeAgentTaskQueue,
  type AgentTaskQueue,
} from './localAgentTaskQueue';
import {
  normalizeAgentMemory,
  type AgentMemoryStore,
} from './localAgentMemory';
import {
  normalizeAgentAutomations,
  type AgentAutomation,
} from './localAgentAutomation';
import {
  DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
  normalizeAgentContextSuggestionPreferences,
  type AgentContextSuggestionPreferences,
} from './agentContextSuggestions';
import {
  emptyAgentOperationHistory,
  normalizeAgentOperationHistory,
  pruneAgentOperationHistory,
  type AgentOperationHistory,
} from './agentOperationHistory';
import {
  emptyAgentAutomationRunLog,
  normalizeAgentAutomationRunLog,
  pruneAgentAutomationRunLog,
  type AgentAutomationRunLog,
} from './localAgentAutomationRuns';

export const AGENT_OPERATIONAL_SCHEMA_VERSION = 1;

export interface AgentOperationalState {
  version: typeof AGENT_OPERATIONAL_SCHEMA_VERSION;
  queue: AgentTaskQueue;
  memory: AgentMemoryStore;
  automations: AgentAutomation[];
  /** Main-owned, cross-window preferences for inert context suggestion chips. */
  suggestions?: AgentContextSuggestionPreferences;
  /**
   * The durable record of completed Agent effects — see `agentOperationHistory.ts`
   * for why the session log stays session-only while this does not.
   *
   * A fifth section here rather than a fifth store, and optional for the same
   * reason `suggestions` is: an additive field costs nothing at the schema
   * version, while a new document would need its own channel, preload binding
   * and window typing to answer a question this file's reader already asks. It
   * has its own retention rule, which is the one thing a section genuinely owes.
   */
  history?: AgentOperationHistory;
  /**
   * What happened when each scheduled automation came due — see
   * `localAgentAutomationRuns.ts`. Main-written, because main is the only place
   * that knows whether the trigger it fired reached a handler.
   *
   * A sixth optional section for the same reason `history` is one: additive at
   * the current schema version, and the reader who asks "did my schedule run"
   * is already holding this document.
   */
  automationRuns?: AgentAutomationRunLog;
  /**
   * When the one-way `localStorage` adoption ran, or `null` if it never has.
   *
   * This is the migration latch, and it is deliberately *not* "does the file
   * exist". A crash between main committing the file and the renderer calling
   * `localStorage.removeItem` would leave real legacy data next to a valid empty
   * store; keying off file existence would then discard it. Keying off an
   * explicit marker inside the document means the adoption is attempted until it
   * has demonstrably happened, and exactly once after that.
   */
  legacyMigratedAt: number | null;
}

/**
 * Terminal queue rows are evidence, not work, and they grow without a user
 * asking for it — as does `history`, which carries its own window in
 * `agentOperationHistory.ts`. They are pruned by age so a long-running
 * profile does not carry a year of completed rows across every restart, and so
 * the 100-item cap in `normalizeAgentTaskQueue` stops being reached by history
 * alone — which would silently evict *live* queued work.
 */
export const AGENT_QUEUE_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export function emptyAgentOperationalState(): AgentOperationalState {
  return {
    version: AGENT_OPERATIONAL_SCHEMA_VERSION,
    queue: { version: 1, items: [] },
    memory: { version: 1, entries: [] },
    automations: [],
    suggestions: normalizeAgentContextSuggestionPreferences(
      DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
    ),
    history: emptyAgentOperationHistory(),
    automationRuns: emptyAgentAutomationRunLog(),
    legacyMigratedAt: null,
  };
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/**
 * Drops terminal queue rows older than the retention window. Non-terminal rows
 * — queued, running, paused — are never pruned by age: they are outstanding
 * work, and losing them is losing the user's request.
 */
export function pruneAgentOperationalState(
  state: AgentOperationalState,
  now = Date.now(),
): AgentOperationalState {
  const cutoff = now - AGENT_QUEUE_TERMINAL_RETENTION_MS;
  const items = state.queue.items.filter((item) => (
    !TERMINAL_STATUSES.has(item.status) || item.updatedAt >= cutoff
  ));
  const history = pruneAgentOperationHistory(
    state.history ?? emptyAgentOperationHistory(),
    now,
  );
  const automationRuns = pruneAgentAutomationRunLog(
    state.automationRuns ?? emptyAgentAutomationRunLog(),
    now,
  );
  const queueChanged = items.length !== state.queue.items.length;
  const historyChanged = history !== state.history;
  const runsChanged = automationRuns !== state.automationRuns;
  if (!queueChanged && !historyChanged && !runsChanged) return state;
  return {
    ...state,
    ...(queueChanged ? { queue: { version: 1 as const, items } } : {}),
    ...(historyChanged ? { history } : {}),
    ...(runsChanged ? { automationRuns } : {}),
  };
}

/**
 * Re-derives the document from anything at all.
 *
 * An unknown `version` yields the *empty* state rather than a best-effort read,
 * which is the correct failure for a load (a future schema must not be
 * half-understood) and is exactly why a save has to be guarded before it reaches
 * the store — see `isAgentOperationalSavePayload` in `agentOperationalBridge.ts`.
 */
export function normalizeAgentOperationalState(input: unknown): AgentOperationalState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return emptyAgentOperationalState();
  }
  const raw = input as Partial<AgentOperationalState>;
  if (raw.version !== AGENT_OPERATIONAL_SCHEMA_VERSION) return emptyAgentOperationalState();
  return {
    version: AGENT_OPERATIONAL_SCHEMA_VERSION,
    queue: normalizeAgentTaskQueue(raw.queue),
    memory: normalizeAgentMemory(raw.memory),
    automations: normalizeAgentAutomations(raw.automations),
    suggestions: normalizeAgentContextSuggestionPreferences(raw.suggestions),
    history: normalizeAgentOperationHistory(raw.history),
    automationRuns: normalizeAgentAutomationRunLog(raw.automationRuns),
    legacyMigratedAt: finiteTimestamp(raw.legacyMigratedAt),
  };
}

/**
 * Restores the sections a renderer may read but must never write.
 *
 * The bridge persists the **whole** document: a renderer holds a snapshot and
 * sends all of it back whenever any part of it changes. That is fine for the
 * sections the renderer owns, and it silently destroys the ones it does not.
 * `automationRuns` is written only by main — it is main that knows whether the
 * trigger it fired reached a handler — and no renderer is ever told when a run
 * is appended, because the scheduler writes through the store rather than
 * through the save handler that broadcasts. So every window holds a run log
 * that is stale by construction, and the next unrelated save (queueing a task,
 * editing a memory) writes that staleness back over main's record.
 *
 * The fix is ownership, not merging. An incoming section is discarded outright
 * and the current one kept, so there is no ordering in which a renderer can
 * erase a run — including the renderer that has never heard of the section at
 * all and sends it as `undefined`.
 *
 * Returns `incoming` unchanged when nothing needed restoring, so a caller can
 * use reference equality to see that no section was overridden.
 */
export function retainMainOwnedSections(
  incoming: AgentOperationalState,
  current: AgentOperationalState,
): AgentOperationalState {
  const automationRuns = current.automationRuns ?? emptyAgentAutomationRunLog();
  if (incoming.automationRuns === automationRuns) return incoming;
  return { ...incoming, automationRuns };
}

/**
 * The three legacy `localStorage` documents, as the renderer read them. Every
 * field is optional because a profile may have had any subset of the keys.
 */
export interface LegacyAgentOperationalPayload {
  queue?: unknown;
  memory?: unknown;
  automations?: unknown;
}

/**
 * Folds the legacy payload into the current state, once.
 *
 * Adoption is per-section and only into an *empty* section. That rule matters:
 * without it, a second window replaying its own stale `localStorage` after the
 * first window had already migrated and started writing would overwrite live
 * main-owned data with a snapshot from before the migration. Refusing to
 * overwrite a non-empty section makes the operation idempotent and makes
 * ordering between windows irrelevant.
 *
 * The latch is set whether or not anything was actually adopted, because the
 * question it answers is "has legacy storage been consulted?", not "did it have
 * anything in it?".
 */
export function adoptLegacyAgentOperationalState(
  state: AgentOperationalState,
  payload: LegacyAgentOperationalPayload,
  now = Date.now(),
): AgentOperationalState {
  if (state.legacyMigratedAt !== null) return state;
  const queue = payload.queue === undefined || state.queue.items.length > 0
    ? state.queue
    : normalizeAgentTaskQueue(payload.queue);
  const memory = payload.memory === undefined || state.memory.entries.length > 0
    ? state.memory
    : normalizeAgentMemory(payload.memory);
  const automations = payload.automations === undefined || state.automations.length > 0
    ? state.automations
    : normalizeAgentAutomations(payload.automations);
  return {
    ...state,
    version: AGENT_OPERATIONAL_SCHEMA_VERSION,
    queue,
    memory,
    automations,
    legacyMigratedAt: now,
  };
}
