import type { ReadingWorkspaceEntry } from './readingWorkspace';

export type ReadingDiscoveryAction =
  | { type: 'open-library'; itemId: string }
  | { type: 'inspect-site'; siteId: string }
  | { type: 'open-external'; url: string }
  | { type: 'open-plan'; query: string };

export interface ReadingDiscoveryResult {
  entry: ReadingWorkspaceEntry;
  providerId: string;
  providerLabelKey: string;
  providerPriority: number;
  action: ReadingDiscoveryAction;
  /** Lower values sort first. Providers may supply a coarse, deterministic tier. */
  relevance: number;
  recommendation?: ReadingDiscoveryRecommendation;
}

export type ReadingDiscoveryReason =
  | 'continue-reading'
  | 'level-fit'
  | 'known-vocabulary-fit'
  | 'interest-match'
  | 'available-now'
  | 'trusted-source';

export interface ReadingDiscoveryRecommendation {
  /** Deterministic 0..100 fit score. It is not a provider rating. */
  score: number;
  reasons: ReadingDiscoveryReason[];
}

export interface ReadingDiscoveryLearnerContext {
  targetLevel: number | null;
  targetKnownRatio: number | null;
  preferredTags: string[];
  recentWorkKeys: string[];
  observedEntries: number;
}

export interface ReadingDiscoveryRequest {
  query: string;
  signal: AbortSignal;
}

export interface ReadingDiscoveryProvider {
  id: string;
  labelKey: string;
  priority: number;
  search: (request: ReadingDiscoveryRequest) => Promise<readonly ReadingDiscoveryResult[]>;
}

export type ReadingDiscoveryProviderStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ReadingDiscoveryProviderSnapshot {
  id: string;
  labelKey: string;
  status: ReadingDiscoveryProviderStatus;
  resultCount: number;
  error: string | null;
}

export interface ReadingDiscoverySnapshot {
  query: string;
  status: 'running' | 'completed' | 'cancelled';
  providers: readonly ReadingDiscoveryProviderSnapshot[];
  results: readonly ReadingDiscoveryResult[];
}

export interface ReadingDiscoverySearch {
  signal: AbortSignal;
  cancel: (reason?: unknown) => void;
  completion: Promise<ReadingDiscoverySnapshot>;
}

export interface ReadingDiscoveryOptions {
  signal?: AbortSignal;
  onSnapshot?: (snapshot: ReadingDiscoverySnapshot) => void;
  learnerContext?: ReadingDiscoveryLearnerContext;
}

interface MutableProviderSnapshot extends ReadingDiscoveryProviderSnapshot {
  results: ReadingDiscoveryResult[];
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

export function readingDiscoveryTextScore(
  values: readonly (string | null | undefined)[],
  query: string,
): number | null {
  const needle = normalized(query);
  if (!needle) return null;
  let best: number | null = null;
  values.forEach((value, index) => {
    if (!value) return;
    const haystack = normalized(value);
    let score: number | null = null;
    if (haystack === needle) score = index;
    else if (haystack.startsWith(needle)) score = 10 + index;
    else if (haystack.includes(needle)) score = 20 + index;
    if (score !== null && (best === null || score < best)) best = score;
  });
  return best;
}

export function rankReadingDiscoveryResults(
  results: readonly ReadingDiscoveryResult[],
  context?: ReadingDiscoveryLearnerContext,
): ReadingDiscoveryResult[] {
  const ranked = results.map((item) => context
    ? { ...item, recommendation: scoreReadingDiscoveryResult(item, context) }
    : item);
  return ranked.sort((left, right) =>
    left.relevance - right.relevance
    || (right.recommendation?.score ?? 0) - (left.recommendation?.score ?? 0)
    || left.providerPriority - right.providerPriority
    || left.entry.work.title.localeCompare(right.entry.work.title, 'ja')
    || left.entry.key.localeCompare(right.entry.key));
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function normalizedTag(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

/**
 * Derives a recommendation profile only from retained Reading records. No new
 * preference store is introduced: progress supplies history, analyzed entries
 * supply level/coverage, and user folders/tags supply the available interests.
 */
export function buildReadingDiscoveryLearnerContext(
  entries: readonly ReadingWorkspaceEntry[],
): ReadingDiscoveryLearnerContext {
  const history = entries
    .filter((entry) => entry.progress.state !== 'unstarted')
    .sort((left, right) =>
      right.progress.updatedAt - left.progress.updatedAt
      || right.progress.percent - left.progress.percent
      || left.key.localeCompare(right.key));
  const weighted = history.map((entry, index) => ({
    entry,
    weight: (entry.progress.state === 'in-progress' ? 3 : 2) / (1 + index * 0.2),
  }));
  const measured = weighted.length
    ? weighted
    : entries
      .filter((entry) => entry.level !== null || entry.knownRatio !== null)
      .map((entry) => ({ entry, weight: 1 }));
  const mean = (value: (entry: ReadingWorkspaceEntry) => number | null): number | null => {
    const usable = measured.flatMap(({ entry, weight }) => {
      const result = value(entry);
      return result === null ? [] : [{ result, weight }];
    });
    const total = usable.reduce((sum, item) => sum + item.weight, 0);
    return total
      ? usable.reduce((sum, item) => sum + item.result * item.weight, 0) / total
      : null;
  };
  const tagWeights = new Map<string, { label: string; weight: number }>();
  weighted.forEach(({ entry, weight }) => {
    entry.tags.forEach((tag) => {
      const key = normalizedTag(tag);
      if (!key) return;
      const current = tagWeights.get(key);
      tagWeights.set(key, { label: current?.label ?? tag, weight: (current?.weight ?? 0) + weight });
    });
  });

  return {
    targetLevel: mean((entry) => entry.level),
    targetKnownRatio: mean((entry) => entry.knownRatio),
    preferredTags: [...tagWeights.values()]
      .sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label))
      .slice(0, 8)
      .map((item) => item.label),
    recentWorkKeys: history.slice(0, 20).map((entry) => entry.work.workId),
    observedEntries: history.length,
  };
}

export function scoreReadingDiscoveryResult(
  result: ReadingDiscoveryResult,
  context: ReadingDiscoveryLearnerContext,
): ReadingDiscoveryRecommendation {
  const { entry } = result;
  const reasons: ReadingDiscoveryReason[] = [];
  let score = 35;

  if (entry.availability === 'readable') {
    score += 16;
    reasons.push('available-now');
  } else if (entry.availability === 'importable') score += 10;
  else if (entry.availability === 'external') score += 6;
  else score -= 20;

  const sourceScore = entry.source.kind === 'local-library' ? 12
    : entry.source.kind === 'jiten' ? 9
      : entry.source.kind === 'curated-site' ? 7
        : entry.source.kind === 'web' ? 5
          : 3;
  score += sourceScore;
  if (sourceScore >= 7) reasons.push('trusted-source');

  if (entry.progress.state === 'in-progress') {
    const recencyIndex = context.recentWorkKeys.indexOf(entry.work.workId);
    score += 18 + (recencyIndex < 0 ? 0 : Math.max(0, 8 - recencyIndex));
    reasons.push('continue-reading');
  } else if (entry.progress.state === 'complete') score -= 12;

  if (entry.level !== null && context.targetLevel !== null) {
    score += Math.max(0, 18 - Math.abs(entry.level - context.targetLevel) * 6);
    reasons.push('level-fit');
  }
  if (entry.knownRatio !== null) {
    const target = context.targetKnownRatio ?? 0.82;
    score += Math.max(0, 14 - Math.abs(entry.knownRatio - target) * 70);
    reasons.push('known-vocabulary-fit');
  }

  const interests = new Set(context.preferredTags.map(normalizedTag));
  const interestMatches = new Set(entry.tags.map(normalizedTag).filter((tag) => interests.has(tag)));
  if (interestMatches.size) {
    score += Math.min(18, interestMatches.size * 6);
    reasons.push('interest-match');
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons };
}

function safeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 300);
  return 'Provider execution failed.';
}

function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    work.then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error); },
    );
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
}

/**
 * Runs every Reading provider behind one cancellation boundary. A provider that
 * cannot abort its underlying transport (notably Electron IPC) is detached by
 * `raceAbort`; its late value can never mutate or outlive the completed query.
 */
export function startReadingDiscovery(
  query: string,
  providers: readonly ReadingDiscoveryProvider[],
  options: ReadingDiscoveryOptions = {},
): ReadingDiscoverySearch {
  const controller = new AbortController();
  const trimmedQuery = query.trim().slice(0, 500);
  const states: MutableProviderSnapshot[] = providers.map((provider) => ({
    id: provider.id,
    labelKey: provider.labelKey,
    status: 'queued',
    resultCount: 0,
    error: null,
    results: [],
  }));
  let lifecycle: ReadingDiscoverySnapshot['status'] = 'running';

  const snapshot = (): ReadingDiscoverySnapshot => Object.freeze({
    query: trimmedQuery,
    status: lifecycle,
    providers: Object.freeze(states.map((state) => Object.freeze({
      id: state.id,
      labelKey: state.labelKey,
      status: state.status,
      resultCount: state.resultCount,
      error: state.error,
    }))),
    results: Object.freeze(rankReadingDiscoveryResults(
      states.flatMap((state) => state.results),
      options.learnerContext,
    )),
  });
  const emit = (): ReadingDiscoverySnapshot => {
    const next = snapshot();
    try { options.onSnapshot?.(next); } catch { /* observers do not own execution */ }
    return next;
  };
  const cancel = (reason?: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  const externalAbort = () => cancel(options.signal?.reason);
  if (options.signal?.aborted) externalAbort();
  else options.signal?.addEventListener('abort', externalAbort, { once: true });

  const completion = (async (): Promise<ReadingDiscoverySnapshot> => {
    emit();
    if (!trimmedQuery || providers.length === 0) {
      lifecycle = controller.signal.aborted ? 'cancelled' : 'completed';
      return emit();
    }

    await Promise.all(providers.map(async (provider, index) => {
      const state = states[index];
      if (controller.signal.aborted) {
        state.status = 'cancelled';
        return;
      }
      state.status = 'running';
      emit();
      try {
        const values = await raceAbort(
          Promise.resolve(provider.search({ query: trimmedQuery, signal: controller.signal })),
          controller.signal,
        );
        if (controller.signal.aborted) {
          state.status = 'cancelled';
          return;
        }
        state.results = values
          .filter((value) => value.providerId === provider.id)
          .slice(0, 100)
          .map((value) => ({
            ...value,
            providerLabelKey: provider.labelKey,
            providerPriority: provider.priority,
          }));
        state.resultCount = state.results.length;
        state.status = 'succeeded';
      } catch (error) {
        if (isAbort(error, controller.signal)) state.status = 'cancelled';
        else {
          state.status = 'failed';
          state.error = safeError(error);
        }
      }
      emit();
    }));

    if (controller.signal.aborted) {
      lifecycle = 'cancelled';
      states.forEach((state) => {
        if (state.status === 'queued' || state.status === 'running') state.status = 'cancelled';
      });
    } else {
      lifecycle = 'completed';
    }
    options.signal?.removeEventListener('abort', externalAbort);
    return emit();
  })();

  return { signal: controller.signal, cancel, completion };
}
