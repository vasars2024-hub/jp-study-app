import { describe, expect, it, vi } from 'vitest';
import type { UnifiedSearchQueryPlan, UnifiedSearchResult } from '../unifiedSearch';
import {
  startUnifiedSearchExecution,
  type UnifiedSearchExecutionSnapshot,
  type UnifiedSearchProviderExecutor,
} from '../unifiedSearchExecution';

function plan(providerIds: string[], status: UnifiedSearchQueryPlan['status'] = 'ready'): UnifiedSearchQueryPlan {
  return {
    query: 'Frieren',
    selectedGroupIds: [],
    status,
    steps: providerIds.map((providerId, priority) => ({
      providerId,
      providerName: providerId.toUpperCase(),
      providerKind: 'connector',
      priority,
      groupIds: [],
    })),
  };
}

function result(providerId: string, id = 'one'): UnifiedSearchResult {
  return {
    id: `${providerId}-${id}`, providerId, providerResultId: id, title: id,
    alternativeTitles: [], japaneseTitle: null, romajiTitle: null, authorsOrStudios: [],
    coverUrl: null, language: null, availability: 'unknown', metadataQuality: null,
    episodeCount: null, trackingStatus: 'unknown', mediaType: 'other', year: null,
    season: null, genres: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('unified search provider execution', () => {
  it('does not invoke providers for an inert plan status', async () => {
    const executor = vi.fn<UnifiedSearchProviderExecutor>();
    const snapshots: UnifiedSearchExecutionSnapshot[] = [];
    const run = startUnifiedSearchExecution(plan(['a'], 'empty-query'), { a: executor }, {
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });
    expect((await run.completion).status).toBe('completed');
    expect(executor).not.toHaveBeenCalled();
    expect(snapshots.map((snapshot) => snapshot.status)).toEqual(['running', 'completed']);
  });

  it('bounds parallel work and starts queued providers in plan order', async () => {
    const pending = [deferred<readonly UnifiedSearchResult[]>(), deferred<readonly UnifiedSearchResult[]>(), deferred<readonly UnifiedSearchResult[]>()];
    const started: string[] = [];
    let active = 0;
    let maximumActive = 0;
    const registry = Object.fromEntries(['a', 'b', 'c'].map((id, index) => [id, async () => {
      started.push(id);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const value = await pending[index].promise;
      active -= 1;
      return value;
    }]));
    const run = startUnifiedSearchExecution(plan(['a', 'b', 'c']), registry, { concurrency: 2 });
    await vi.waitFor(() => expect(started).toEqual(['a', 'b']));
    pending[0].resolve([result('a')]);
    await vi.waitFor(() => expect(started).toEqual(['a', 'b', 'c']));
    pending[1].resolve([result('b')]);
    pending[2].resolve([result('c')]);
    const final = await run.completion;
    expect(maximumActive).toBe(2);
    expect(final.status).toBe('completed');
    expect(final.providers.map((provider) => provider.status)).toEqual(['succeeded', 'succeeded', 'succeeded']);
  });

  it('keeps provider results partitioned and isolates missing adapters and failures', async () => {
    const final = await startUnifiedSearchExecution(plan(['a', 'missing', 'broken']), {
      a: async () => [result('a'), result('other')],
      broken: async () => { throw new Error('Provider unavailable'); },
    }).completion;
    expect(final.status).toBe('completed');
    expect(final.providers[0]).toMatchObject({ status: 'succeeded', results: [result('a')] });
    expect(final.providers[1]).toMatchObject({ status: 'failed', error: 'No executor is registered for provider "missing".' });
    expect(final.providers[2]).toMatchObject({ status: 'failed', error: 'Provider unavailable' });
  });

  it('cancels running and queued work promptly through the owned signal', async () => {
    const observedSignals: AbortSignal[] = [];
    const never = new Promise<readonly UnifiedSearchResult[]>(() => undefined);
    const run = startUnifiedSearchExecution(plan(['a', 'b']), {
      a: async ({ signal }) => { observedSignals.push(signal); return never; },
      b: async () => [],
    }, { concurrency: 1 });
    await vi.waitFor(() => expect(observedSignals).toHaveLength(1));
    run.cancel('superseded');
    const final = await run.completion;
    expect(run.signal.aborted).toBe(true);
    expect(observedSignals[0].reason).toBe('superseded');
    expect(final.status).toBe('cancelled');
    expect(final.providers.map((provider) => provider.status)).toEqual(['cancelled', 'cancelled']);
  });

  it('forwards external cancellation and emits detached immutable snapshots', async () => {
    const external = new AbortController();
    const snapshots: UnifiedSearchExecutionSnapshot[] = [];
    const pending = deferred<readonly UnifiedSearchResult[]>();
    const run = startUnifiedSearchExecution(plan(['a']), { a: () => pending.promise }, {
      signal: external.signal,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });
    await vi.waitFor(() => expect(snapshots.at(-1)?.providers[0].status).toBe('running'));
    external.abort();
    const final = await run.completion;
    expect(final.status).toBe('cancelled');
    expect(Object.isFrozen(final)).toBe(true);
    expect(Object.isFrozen(final.providers)).toBe(true);
    expect(snapshots[0].providers[0].status).toBe('queued');
  });
});
