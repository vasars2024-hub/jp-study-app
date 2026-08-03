import type {
  UnifiedSearchQueryPlan,
  UnifiedSearchQueryPlanStep,
  UnifiedSearchResult,
} from './unifiedSearch';

export type UnifiedSearchProviderExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type UnifiedSearchExecutionStatus = 'running' | 'completed' | 'cancelled';

export interface UnifiedSearchProviderRequest {
  query: string;
  step: Readonly<UnifiedSearchQueryPlanStep>;
  signal: AbortSignal;
}

/** A provider adapter is the only executable object accepted by the lifecycle. */
export type UnifiedSearchProviderExecutor = (
  request: UnifiedSearchProviderRequest,
) => Promise<readonly UnifiedSearchResult[]>;

export type UnifiedSearchProviderRegistry = Readonly<Record<string, UnifiedSearchProviderExecutor>>;

export interface UnifiedSearchProviderProgress {
  providerId: string;
  providerName: string;
  status: UnifiedSearchProviderExecutionStatus;
  results: readonly UnifiedSearchResult[];
  error: string | null;
}

export interface UnifiedSearchExecutionSnapshot {
  status: UnifiedSearchExecutionStatus;
  query: string;
  providers: readonly UnifiedSearchProviderProgress[];
}

export interface UnifiedSearchExecutionOptions {
  /** Values outside 1-16 are clamped. The default is 4. */
  concurrency?: number;
  signal?: AbortSignal;
  onSnapshot?: (snapshot: UnifiedSearchExecutionSnapshot) => void;
}

export interface UnifiedSearchExecution {
  signal: AbortSignal;
  cancel: (reason?: unknown) => void;
  completion: Promise<UnifiedSearchExecutionSnapshot>;
}

interface MutableProviderProgress {
  providerId: string;
  providerName: string;
  status: UnifiedSearchProviderExecutionStatus;
  results: UnifiedSearchResult[];
  error: string | null;
}

function executorFor(
  registry: UnifiedSearchProviderRegistry,
  providerId: string,
): UnifiedSearchProviderExecutor | undefined {
  return registry[providerId];
}

function concurrencyLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 4;
  return Math.min(16, Math.max(1, Math.floor(value)));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  return 'Provider execution failed.';
}

function cloneSnapshot(
  status: UnifiedSearchExecutionStatus,
  query: string,
  providers: readonly MutableProviderProgress[],
): UnifiedSearchExecutionSnapshot {
  return Object.freeze({
    status,
    query,
    providers: Object.freeze(providers.map((provider) => Object.freeze({
      ...provider,
      results: Object.freeze([...provider.results]),
    }))),
  });
}

function raceCancellation<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const rejectCancellation = () => {
      cleanup();
      reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    const cleanup = () => signal.removeEventListener('abort', rejectCancellation);
    work.then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error); },
    );
    if (signal.aborted) rejectCancellation();
    else signal.addEventListener('abort', rejectCancellation, { once: true });
  });
}

/**
 * Consumes an inert query plan through registered provider adapters. Results remain
 * partitioned per provider; this boundary performs no merging or identity work.
 */
export function startUnifiedSearchExecution(
  plan: Readonly<UnifiedSearchQueryPlan>,
  registry: UnifiedSearchProviderRegistry,
  options: UnifiedSearchExecutionOptions = {},
): UnifiedSearchExecution {
  const controller = new AbortController();
  const providers: MutableProviderProgress[] = plan.steps.map((step) => ({
    providerId: step.providerId,
    providerName: step.providerName,
    status: 'queued',
    results: [],
    error: null,
  }));
  let lifecycleStatus: UnifiedSearchExecutionStatus = 'running';

  const emit = () => {
    const snapshot = cloneSnapshot(lifecycleStatus, plan.query, providers);
    try { options.onSnapshot?.(snapshot); } catch { /* observers cannot stop provider work */ }
    return snapshot;
  };

  const cancel = (reason?: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };

  const externalSignal = options.signal;
  const forwardCancellation = () => cancel(externalSignal?.reason);
  if (externalSignal?.aborted) forwardCancellation();
  else externalSignal?.addEventListener('abort', forwardCancellation, { once: true });

  const completion = (async (): Promise<UnifiedSearchExecutionSnapshot> => {
    emit();
    if (plan.status !== 'ready' || providers.length === 0) {
      lifecycleStatus = controller.signal.aborted ? 'cancelled' : 'completed';
      return emit();
    }

    let nextIndex = 0;
    const executeProvider = async (index: number) => {
      const progress = providers[index];
      const step = plan.steps[index];
      if (controller.signal.aborted) return;
      progress.status = 'running';
      emit();
      const executor = executorFor(registry, step.providerId);
      if (!executor) {
        progress.status = 'failed';
        progress.error = `No executor is registered for provider "${step.providerId}".`;
        emit();
        return;
      }

      try {
        const providerWork = Promise.resolve(executor({ query: plan.query, step, signal: controller.signal }));
        const results = await raceCancellation(providerWork, controller.signal);
        if (controller.signal.aborted) return;
        progress.results = results.filter((result) => result.providerId === step.providerId);
        progress.status = 'succeeded';
      } catch (error) {
        if (controller.signal.aborted) return;
        progress.status = 'failed';
        progress.error = errorMessage(error);
      }
      emit();
    };

    const worker = async () => {
      while (!controller.signal.aborted) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= providers.length) return;
        await executeProvider(index);
      }
    };

    const workerCount = Math.min(concurrencyLimit(options.concurrency), providers.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    if (controller.signal.aborted) {
      lifecycleStatus = 'cancelled';
      for (const provider of providers) {
        if (provider.status === 'queued' || provider.status === 'running') provider.status = 'cancelled';
      }
    } else {
      lifecycleStatus = 'completed';
    }
    return emit();
  })().finally(() => externalSignal?.removeEventListener('abort', forwardCancellation));

  return { signal: controller.signal, cancel, completion };
}
