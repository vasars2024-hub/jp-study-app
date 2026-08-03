// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { UnifiedSearchDocument, UnifiedSearchResult } from '../../shared/unifiedSearch';
import { startUnifiedSearchExecution, type UnifiedSearchProviderExecutor } from '../../shared/unifiedSearchExecution';
import { createUnifiedSearchSession } from '../unifiedSearchSession';

function result(providerId: string, id = 'one'): UnifiedSearchResult {
  return {
    id: `${providerId}-${id}`, providerId, providerResultId: id, title: id,
    alternativeTitles: [], japaneseTitle: null, romajiTitle: null, authorsOrStudios: [],
    coverUrl: null, language: null, availability: 'unknown', metadataQuality: null,
    episodeCount: null, trackingStatus: 'unknown', mediaType: 'other', year: null,
    season: null, genres: [],
  };
}

function document(providerIds: string[]): UnifiedSearchDocument {
  return {
    version: 1,
    providers: providerIds.map((providerId, priority) => ({
      id: providerId,
      name: providerId.toUpperCase(),
      kind: 'connector',
      enabled: true,
      priority,
      groupIds: [],
      supportedLanguages: [],
      definition: { endpoint: null, method: 'get', selectors: {}, apiConfiguration: {}, resultParser: null, metadataMapping: {} },
    })),
    groups: [],
    results: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function session(providerIds: string[], registry: Record<string, UnifiedSearchProviderExecutor>, concurrency?: number) {
  return createUnifiedSearchSession({
    getDocument: () => document(providerIds),
    getRegistry: () => registry,
    concurrency,
  });
}

describe('unified search session coordinator', () => {
  it('starts idle and exposes a running lifecycle synchronously on search', () => {
    const coordinator = session(['a', 'b'], { a: () => new Promise(() => undefined), b: () => new Promise(() => undefined) });
    expect(coordinator.getState()).toMatchObject({ generation: 0, status: 'idle', providers: [] });

    const changes: string[] = [];
    coordinator.subscribe(() => changes.push(coordinator.getState().status));
    coordinator.search({ query: 'Frieren' });

    const state = coordinator.getState();
    expect(state.generation).toBe(1);
    expect(state.status).toBe('running');
    expect(state.query).toBe('Frieren');
    expect(state.planStatus).toBe('ready');
    expect(state.providers.map((provider) => provider.providerId)).toEqual(['a', 'b']);
    expect(changes).toContain('running');
    coordinator.dispose();
  });

  it('completes and surfaces the per-provider lifecycle to subscribers', async () => {
    const coordinator = session(['a', 'b'], { a: async () => [result('a')], b: async () => [] });
    coordinator.search({ query: 'Frieren' });
    const settled = await coordinator.whenSettled();
    expect(settled.status).toBe('completed');
    expect(settled.providers.map((provider) => provider.status)).toEqual(['succeeded', 'succeeded']);
    expect(settled.providers[0].results).toEqual([result('a')]);
  });

  it('resolves an inert plan without invoking providers', async () => {
    const executor = vi.fn<UnifiedSearchProviderExecutor>();
    const coordinator = createUnifiedSearchSession({
      getDocument: () => ({ version: 1, providers: [], groups: [], results: [] }),
      getRegistry: () => ({ a: executor }),
    });
    coordinator.search({ query: 'Frieren' });
    const settled = await coordinator.whenSettled();
    expect(settled.status).toBe('completed');
    expect(settled.planStatus).toBe('no-providers');
    expect(executor).not.toHaveBeenCalled();
  });

  it('cancels the superseded execution when a newer search begins', async () => {
    const first = deferred<readonly UnifiedSearchResult[]>();
    let observedReason: unknown;
    const coordinator = session(['a'], {
      a: async ({ signal }) => {
        signal.addEventListener('abort', () => { observedReason = signal.reason; });
        return first.promise;
      },
    });
    coordinator.search({ query: 'first' });
    await vi.waitFor(() => expect(coordinator.getState().providers[0]?.status).toBe('running'));

    coordinator.search({ query: 'second' });
    expect(observedReason).toBe('superseded');
    expect(coordinator.getState().generation).toBe(2);
    expect(coordinator.getState().query).toBe('second');
  });

  it('suppresses stale snapshots emitted by a superseded execution', async () => {
    const first = deferred<readonly UnifiedSearchResult[]>();
    const second = deferred<readonly UnifiedSearchResult[]>();
    const coordinator = session(['a'], {
      a: vi.fn<UnifiedSearchProviderExecutor>()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    });

    coordinator.search({ query: 'first' });
    coordinator.search({ query: 'second' });

    // The first (now superseded) execution resolves late; it must not touch state.
    first.resolve([result('a', 'stale')]);
    await Promise.resolve();
    expect(coordinator.getState().query).toBe('second');
    expect(coordinator.getState().providers[0].results).toEqual([]);

    second.resolve([result('a', 'fresh')]);
    const settled = await coordinator.whenSettled();
    expect(settled.query).toBe('second');
    expect(settled.providers[0].results).toEqual([result('a', 'fresh')]);
  });

  it('cancel keeps the cancelled lifecycle visible; clear returns to idle', async () => {
    const coordinator = session(['a'], { a: () => new Promise(() => undefined) });
    coordinator.search({ query: 'Frieren' });
    await vi.waitFor(() => expect(coordinator.getState().providers[0]?.status).toBe('running'));

    coordinator.cancel();
    const cancelled = await coordinator.whenSettled();
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.providers[0].status).toBe('cancelled');

    coordinator.clear();
    expect(coordinator.getState()).toMatchObject({ generation: 0, status: 'idle', query: '', providers: [] });
  });

  it('reads the document and registry afresh for each search', () => {
    const documents = [document(['a']), document(['a', 'b'])];
    const getDocument = vi.fn(() => documents.shift() as UnifiedSearchDocument);
    const registry = { a: () => new Promise<readonly UnifiedSearchResult[]>(() => undefined), b: () => new Promise<readonly UnifiedSearchResult[]>(() => undefined) };
    const coordinator = createUnifiedSearchSession({ getDocument, getRegistry: () => registry });

    coordinator.search({ query: 'first' });
    expect(coordinator.getState().providers).toHaveLength(1);
    coordinator.search({ query: 'second' });
    expect(coordinator.getState().providers.map((provider) => provider.providerId)).toEqual(['a', 'b']);
    expect(getDocument).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it('ignores searches after disposal and cancels the in-flight execution', async () => {
    let observedReason: unknown;
    const coordinator = session(['a'], {
      a: async ({ signal }) => {
        signal.addEventListener('abort', () => { observedReason = signal.reason; });
        return new Promise<readonly UnifiedSearchResult[]>(() => undefined);
      },
    });
    coordinator.search({ query: 'Frieren' });
    await vi.waitFor(() => expect(coordinator.getState().providers[0]?.status).toBe('running'));

    coordinator.dispose();
    expect(observedReason).toBe('disposed');
    const before = coordinator.getState();
    coordinator.search({ query: 'ignored' });
    expect(coordinator.getState()).toBe(before);
  });

  it('defaults to the real plan and execution builders', async () => {
    const coordinator = createUnifiedSearchSession({
      getDocument: () => document(['a']),
      getRegistry: () => ({ a: async () => [result('a')] }),
      // no createPlan / startExecution overrides — exercise the production defaults
    });
    expect(startUnifiedSearchExecution).toBeTypeOf('function');
    coordinator.search({ query: '  Frieren  ' });
    expect(coordinator.getState().query).toBe('Frieren');
    const settled = await coordinator.whenSettled();
    expect(settled.providers[0].results).toEqual([result('a')]);
  });
});
