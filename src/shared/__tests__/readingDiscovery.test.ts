import { describe, expect, it, vi } from 'vitest';
import {
  buildReadingDiscoveryLearnerContext,
  rankReadingDiscoveryResults,
  readingDiscoveryTextScore,
  scoreReadingDiscoveryResult,
  startReadingDiscovery,
  type ReadingDiscoveryProvider,
  type ReadingDiscoveryResult,
} from '../readingDiscovery';
import { READING_WORKSPACE_SCHEMA_VERSION } from '../readingWorkspace';

function discoveryResult(
  providerId: string,
  title: string,
  relevance: number,
  priority: number,
): ReadingDiscoveryResult {
  return {
    providerId,
    providerLabelKey: providerId,
    providerPriority: priority,
    relevance,
    action: { type: 'open-plan', query: title },
    entry: {
      version: READING_WORKSPACE_SCHEMA_VERSION,
      key: `${providerId}:${title}`,
      itemId: null,
      work: {
        workId: title,
        title,
        titleNative: title,
        contentType: 'novel',
        aniListId: null,
        malId: null,
      },
      edition: null,
      source: { kind: 'provider', id: providerId },
      availability: 'external',
      cover: { state: 'fallback', ref: null },
      progress: { value: null, percent: 0, updatedAt: 0, state: 'unstarted' },
      level: null,
      knownRatio: null,
      tags: [],
    },
  };
}

describe('Reading discovery execution', () => {
  it('scores exact, prefix, body and absent matches deterministically', () => {
    expect(readingDiscoveryTextScore(['Kokoro', 'novel'], 'kokoro')).toBe(0);
    expect(readingDiscoveryTextScore(['Kokoro study edition'], 'kokoro')).toBe(10);
    expect(readingDiscoveryTextScore(['Read Kokoro here'], 'kokoro')).toBe(20);
    expect(readingDiscoveryTextScore(['Botchan'], 'kokoro')).toBeNull();
  });

  it('ranks relevance before provider priority and keeps stable title order', () => {
    const ranked = rankReadingDiscoveryResults([
      discoveryResult('site', 'Z', 10, 30),
      discoveryResult('library', 'B', 10, 0),
      discoveryResult('library', 'A', 10, 0),
      discoveryResult('jiten', 'Exact', 0, 20),
    ]);
    expect(ranked.map((item) => item.entry.work.title)).toEqual(['Exact', 'A', 'B', 'Z']);
  });

  it('derives level, coverage, interests and recency only from reading history', () => {
    const recent = discoveryResult('library', 'Recent', 0, 0).entry;
    recent.work.workId = 'recent';
    recent.progress = { value: null, percent: 42, updatedAt: 200, state: 'in-progress' };
    recent.level = 4;
    recent.knownRatio = 0.84;
    recent.tags = ['Mystery', 'Classics'];
    const completed = discoveryResult('library', 'Completed', 0, 0).entry;
    completed.work.workId = 'completed';
    completed.progress = { value: null, percent: 100, updatedAt: 100, state: 'complete' };
    completed.level = 2;
    completed.knownRatio = 0.72;
    completed.tags = ['Classics'];
    const untouched = discoveryResult('library', 'Untouched', 0, 0).entry;
    untouched.progress = { value: null, percent: 0, updatedAt: 300, state: 'unstarted' };
    untouched.level = 7;
    untouched.tags = ['Ignored'];

    const context = buildReadingDiscoveryLearnerContext([untouched, completed, recent]);
    expect(context.observedEntries).toBe(2);
    expect(context.recentWorkKeys).toEqual(['recent', 'completed']);
    expect(context.targetLevel).toBeCloseTo(3.2857, 3);
    expect(context.targetKnownRatio).toBeCloseTo(0.7971, 3);
    expect(context.preferredTags).toEqual(['Classics', 'Mystery']);
  });

  it('refines equal text matches with history, fit, availability and source quality', () => {
    const context = {
      targetLevel: 4,
      targetKnownRatio: 0.82,
      preferredTags: ['Mystery'],
      recentWorkKeys: ['continued'],
      observedEntries: 1,
    };
    const unavailable = discoveryResult('catalogue', 'Unavailable', 10, 0);
    unavailable.entry.availability = 'unavailable';
    unavailable.entry.level = 1;
    const continued = discoveryResult('library', 'Continue', 10, 30);
    continued.entry.work.workId = 'continued';
    continued.entry.source = { kind: 'local-library', id: 'library' };
    continued.entry.availability = 'readable';
    continued.entry.progress = { value: null, percent: 40, updatedAt: 100, state: 'in-progress' };
    continued.entry.level = 4;
    continued.entry.knownRatio = 0.82;
    continued.entry.tags = ['mystery'];

    const recommendation = scoreReadingDiscoveryResult(continued, context);
    expect(recommendation.score).toBe(100);
    expect(recommendation.reasons).toEqual(expect.arrayContaining([
      'continue-reading',
      'level-fit',
      'known-vocabulary-fit',
      'interest-match',
      'available-now',
      'trusted-source',
    ]));
    const ranked = rankReadingDiscoveryResults([unavailable, continued], context);
    expect(ranked.map((item) => item.entry.work.title)).toEqual(['Continue', 'Unavailable']);
    expect(ranked[0].recommendation?.score).toBeGreaterThan(ranked[1].recommendation?.score ?? 0);

    unavailable.relevance = 0;
    expect(rankReadingDiscoveryResults([continued, unavailable], context)[0].entry.work.title)
      .toBe('Unavailable');
  });

  it('uses analyzed library records as a level fallback before reading history exists', () => {
    const analyzed = discoveryResult('library', 'Analyzed', 0, 0).entry;
    analyzed.level = 3;
    analyzed.knownRatio = 0.8;
    analyzed.tags = ['Not yet an interest'];
    const context = buildReadingDiscoveryLearnerContext([analyzed]);
    expect(context).toMatchObject({
      targetLevel: 3,
      targetKnownRatio: 0.8,
      preferredTags: [],
      recentWorkKeys: [],
      observedEntries: 0,
    });
  });

  it('aggregates attributed provider results and contains one provider failure', async () => {
    const snapshots: string[] = [];
    const providers: ReadingDiscoveryProvider[] = [
      {
        id: 'library',
        labelKey: 'library',
        priority: 0,
        search: async () => [discoveryResult('library', 'Library title', 1, 0)],
      },
      {
        id: 'jiten',
        labelKey: 'jiten',
        priority: 20,
        search: async () => { throw new Error('offline'); },
      },
    ];
    const search = startReadingDiscovery('title', providers, {
      onSnapshot: (snapshot) => snapshots.push(snapshot.status),
    });
    const final = await search.completion;
    expect(final.status).toBe('completed');
    expect(final.results.map((item) => item.providerId)).toEqual(['library']);
    expect(final.providers).toEqual([
      expect.objectContaining({ id: 'library', status: 'succeeded', resultCount: 1 }),
      expect.objectContaining({
        id: 'jiten',
        status: 'failed',
        resultCount: 0,
        error: 'offline',
      }),
    ]);
    expect(snapshots.at(-1)).toBe('completed');
  });

  it('cancels promptly and ignores a late provider value', async () => {
    let release: ((value: readonly ReadingDiscoveryResult[]) => void) | undefined;
    const provider: ReadingDiscoveryProvider = {
      id: 'slow',
      labelKey: 'slow',
      priority: 0,
      search: vi.fn(() => new Promise((resolve) => { release = resolve; })),
    };
    const search = startReadingDiscovery('title', [provider]);
    search.cancel();
    const final = await search.completion;
    expect(final.status).toBe('cancelled');
    expect(final.providers[0].status).toBe('cancelled');
    expect(final.results).toEqual([]);
    release?.([discoveryResult('slow', 'Too late', 0, 0)]);
    await Promise.resolve();
    expect(final.results).toEqual([]);
  });
});
