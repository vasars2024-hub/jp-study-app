import { describe, expect, it } from 'vitest';
import { mediaTrackingDashboardFixture } from '../data/mediaTrackingFixtures';
import { buildLocalMediaTitleResolver, buildMediaTrackingDashboard, selectMediaTrackingCard, buildWatchTrackingDashboard } from '../mediaTrackingDashboard';
import { normalizeMediaProvidersDocument } from '../../shared/mediaProviders';
import { mergeStoredMediaResults } from '../../shared/mediaResultPresentation';

describe('media tracking dashboard presentation', () => {
  it('builds stable local shelves from the offline fixture', () => {
    const sections = buildMediaTrackingDashboard(mediaTrackingDashboardFixture, (id) => `Title: ${id}`);
    expect(sections.map(({ id, count }) => [id, count])).toEqual([
      ['watching', 1], ['planned', 1], ['favorites', 1], ['completed', 1],
    ]);
    expect(sections[0].cards[0]).toMatchObject({ title: 'Title: fixture-blue-period', nextEpisodeNumber: 5, progress: { watchedCount: 1, totalCount: 12 } });
  });

  it('does not duplicate a favorite across its status shelf', () => {
    const sections = buildMediaTrackingDashboard(mediaTrackingDashboardFixture);
    expect(sections.find((section) => section.id === 'planned')?.cards.map((card) => card.identityId)).toEqual(['fixture-planetes']);
    expect(sections.find((section) => section.id === 'favorites')?.cards.map((card) => card.identityId)).toEqual(['fixture-planetes']);
  });

  it('resolves titles only from stored local search snapshots', () => {
    const document = normalizeMediaProvidersDocument({ providers: [{ id: 'local', name: 'Local catalog', role: 'metadata', contentTypes: ['anime'], capabilities: { search: true } }], descriptors: [{ id: 'descriptor-1', providerId: 'local', providerItemId: 'fixture-blue-period', title: 'Blue Period', contentType: 'anime' }] }).value;
    const titleFor = buildLocalMediaTitleResolver(document);
    const localIdentityId = mergeStoredMediaResults(document)[0].identityId;
    expect(titleFor(localIdentityId)).toBe('Blue Period');
    expect(titleFor('missing')).toBe('missing');
  });

  it('updates selection before navigating when a card is activated', () => {
    const calls: string[] = [];
    selectMediaTrackingCard('fixture-blue-period', (id) => calls.push(`selected:${id}`), (id) => calls.push(`navigated:${id}`));
    expect(calls).toEqual(['selected:fixture-blue-period', 'navigated:fixture-blue-period']);
  });
});

describe('watch-library tracking dashboard', () => {
  const view = (id: string, extra: Partial<import('../../shared/watchLibrary').WatchTitleView>) => ({
    id, kind: 'anime', title: id, status: 'watching', watchDates: [], tags: [], lists: [], sources: ['manual'], addedAt: 1, updatedAt: 1,
    mediaItemIds: [], onDisk: false, episodesOnDisk: 0, allGenres: [], ...extra,
  }) as import('../../shared/watchLibrary').WatchTitleView;

  it('shelves the watch library by status, soonest airing first, with full counts', () => {
    const sections = buildWatchTrackingDashboard([
      view('a', { nextAiring: { episode: 3, at: 500 } }),
      view('b', { nextAiring: { episode: 9, at: 100 }, status: 'rewatching', favorite: true }),
      view('c', { status: 'plan', addedAt: 5 }),
      view('d', { status: 'completed', lastWatched: 50 }),
      view('e', { status: 'completed', lastWatched: 90 }),
    ], 1);
    const byId = Object.fromEntries(sections.map((section) => [section.id, section]));
    expect(byId.watching.cards.map((card) => card.id)).toEqual(['b']);
    expect(byId.watching.count).toBe(2);
    expect(byId.plan.cards.map((card) => card.id)).toEqual(['c']);
    expect(byId.favorites.cards.map((card) => card.id)).toEqual(['b']);
    expect(byId.completed.cards.map((card) => card.id)).toEqual(['e']);
    expect(byId.on_hold.count).toBe(0);
  });
});
