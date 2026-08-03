import {
  createUnifiedSearchQueryPlan,
  type UnifiedSearchDocument,
  type UnifiedSearchPlanStatus,
  type UnifiedSearchQueryPlan,
  type UnifiedSearchQueryPlanningState,
} from '../shared/unifiedSearch';
import {
  startUnifiedSearchExecution,
  type UnifiedSearchExecution,
  type UnifiedSearchExecutionSnapshot,
  type UnifiedSearchProviderProgress,
  type UnifiedSearchProviderRegistry,
} from '../shared/unifiedSearchExecution';

/**
 * Renderer-level coordinator for successive unified searches.
 *
 * It owns the boundary between the UI and {@link startUnifiedSearchExecution}: every
 * `search` builds a fresh plan, supersedes the previous run, and projects the
 * per-provider lifecycle into one subscribable state. Snapshots emitted by a superseded
 * execution are suppressed by a monotonic generation stamp so late teardown events can
 * never overwrite a newer session. It performs no result merging, identity resolution,
 * playback, authentication, or provider I/O — those belong to later phases and to the
 * injected registry respectively.
 */

export type UnifiedSearchSessionStatus = 'idle' | 'running' | 'completed' | 'cancelled';

export interface UnifiedSearchSessionState {
  /** Monotonic id of the search that produced this state; `0` before the first search. */
  generation: number;
  status: UnifiedSearchSessionStatus;
  query: string;
  planStatus: UnifiedSearchPlanStatus | null;
  selectedGroupIds: readonly string[];
  providers: readonly UnifiedSearchProviderProgress[];
}

export interface UnifiedSearchSessionOptions {
  /** Supplies the inert configuration a plan is built from, read once per search. */
  getDocument: () => UnifiedSearchDocument;
  /** Supplies the provider adapters, read once per search. */
  getRegistry: () => UnifiedSearchProviderRegistry;
  concurrency?: number;
  /** Injectable for determinism in tests; defaults to {@link createUnifiedSearchQueryPlan}. */
  createPlan?: (
    document: UnifiedSearchDocument,
    state: UnifiedSearchQueryPlanningState,
  ) => UnifiedSearchQueryPlan;
  /** Injectable for determinism in tests; defaults to {@link startUnifiedSearchExecution}. */
  startExecution?: typeof startUnifiedSearchExecution;
}

export interface UnifiedSearchSession {
  getState: () => UnifiedSearchSessionState;
  subscribe: (listener: () => void) => () => void;
  /** Supersedes any running search, builds a plan, and starts a new execution. */
  search: (input: UnifiedSearchQueryPlanningState) => UnifiedSearchSessionState;
  /** Aborts the running search, leaving its cancelled lifecycle visible. */
  cancel: (reason?: unknown) => void;
  /** Aborts the running search and returns the session to its idle state. */
  clear: () => void;
  /** Resolves once the current run settles; resolves immediately when idle. */
  whenSettled: () => Promise<UnifiedSearchSessionState>;
  dispose: () => void;
}

const IDLE_STATE: UnifiedSearchSessionState = Object.freeze({
  generation: 0,
  status: 'idle',
  query: '',
  planStatus: null,
  selectedGroupIds: Object.freeze([]) as readonly string[],
  providers: Object.freeze([]) as readonly UnifiedSearchProviderProgress[],
});

function projectSnapshot(
  generation: number,
  plan: Readonly<UnifiedSearchQueryPlan>,
  snapshot: UnifiedSearchExecutionSnapshot,
): UnifiedSearchSessionState {
  return Object.freeze({
    generation,
    status: snapshot.status,
    query: snapshot.query,
    planStatus: plan.status,
    selectedGroupIds: plan.selectedGroupIds,
    providers: snapshot.providers,
  });
}

export function createUnifiedSearchSession(options: UnifiedSearchSessionOptions): UnifiedSearchSession {
  const createPlan = options.createPlan ?? createUnifiedSearchQueryPlan;
  const startExecution = options.startExecution ?? startUnifiedSearchExecution;

  let state = IDLE_STATE;
  let generation = 0;
  let active: { generation: number; execution: UnifiedSearchExecution } | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();

  const setState = (next: UnifiedSearchSessionState) => {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };

  /** A snapshot older than the current generation belongs to a superseded run — drop it. */
  const applySnapshot = (
    forGeneration: number,
    plan: Readonly<UnifiedSearchQueryPlan>,
    snapshot: UnifiedSearchExecutionSnapshot,
  ) => {
    if (disposed || forGeneration !== generation) return;
    setState(projectSnapshot(forGeneration, plan, snapshot));
  };

  const supersede = (reason: unknown) => {
    const previous = active;
    active = null;
    // Bump first so any snapshot the aborted run emits is stamped with a stale generation.
    generation += 1;
    previous?.execution.cancel(reason);
  };

  const search = (input: UnifiedSearchQueryPlanningState): UnifiedSearchSessionState => {
    if (disposed) return state;
    supersede('superseded');
    const forGeneration = generation;
    const plan = createPlan(options.getDocument(), input);
    const execution = startExecution(plan, options.getRegistry(), {
      concurrency: options.concurrency,
      onSnapshot: (snapshot) => applySnapshot(forGeneration, plan, snapshot),
    });
    active = { generation: forGeneration, execution };
    void execution.completion.then(() => {
      if (active?.generation === forGeneration) active = null;
    });
    return state;
  };

  const cancel = (reason?: unknown) => {
    active?.execution.cancel(reason ?? 'cancelled');
  };

  const clear = () => {
    supersede('cleared');
    setState(IDLE_STATE);
  };

  const whenSettled = (): Promise<UnifiedSearchSessionState> => {
    const current = active;
    if (!current) return Promise.resolve(state);
    return current.execution.completion.then(() => state);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    active?.execution.cancel('disposed');
    active = null;
    listeners.clear();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    search,
    cancel,
    clear,
    whenSettled,
    dispose,
  };
}
