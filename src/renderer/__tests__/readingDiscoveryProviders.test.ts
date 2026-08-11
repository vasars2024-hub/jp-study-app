import { beforeEach, describe, expect, it } from 'vitest';
import type { JitenDeck } from '../../shared/jiten';
import type { ReadingWorkspaceEntry } from '../../shared/readingWorkspace';
import type { LibraryItem } from '../../shared/types';
import { markCoverBroken, resetCoverArtCache } from '../utils/coverArt';
import type { Novel } from '../data/novels';
import type { ReadingSite } from '../data/readingSites';
import {
  createReadingDiscoveryProviders,
  jitenDiscoveryResult,
  novelDiscoveryResult,
  readingDiscoveryCoverUrl,
  readingSiteDiscoveryResult,
} from '../readingDiscoveryProviders';

const site: ReadingSite = {
  id: 'news',
  name: 'News Easy',
  url: 'https://example.com',
  levels: [2],
  genres: ['news'],
  furigana: true,
  lengthKinds: ['short'],
  lang: 'ja',
  pricing: 'Free',
  notes: 'Learner news',
  lastVerified: '2026-08-11',
};

const novel: Novel = {
  id: 'kokoro',
  titleJp: 'こころ',
  titleEn: 'Kokoro',
  author: '夏目漱石',
  type: 'Classic',
  genres: ['Literary'],
  difficulty: 'Hard',
  jlpt: 'N2',
  freeOnAozora: true,
  synopsis: 'A classic novel.',
  links: [{ label: 'Read', url: 'https://example.com/kokoro', kind: 'free' }],
};

const deck: JitenDeck = {
  deckId: 7,
  originalTitle: '吾輩は猫である',
  englishTitle: 'I Am a Cat',
  mediaType: 4,
  tags: [{ name: 'classic' }],
};

describe('Reading discovery providers', () => {
  it('projects curated, local and Jiten values into the shared card contract', () => {
    expect(readingSiteDiscoveryResult(site, 'news')).toMatchObject({
      providerId: 'curated-sites',
      action: { type: 'inspect-site', siteId: 'news' },
      entry: {
        source: { kind: 'curated-site', id: 'news' },
        availability: 'external',
      },
    });
    expect(novelDiscoveryResult(novel, 'kokoro')).toMatchObject({
      providerId: 'local-catalogue',
      action: { type: 'open-external', url: 'https://example.com/kokoro' },
      entry: { level: 5, source: { kind: 'provider' } },
    });
    expect(jitenDiscoveryResult(deck, 'cat')).toMatchObject({
      providerId: 'jiten',
      action: { type: 'open-plan', query: '吾輩は猫である' },
      entry: {
        source: { kind: 'jiten', id: '7' },
        availability: 'importable',
      },
    });
  });

  it('searches the live Library snapshot and all three discovery catalogues', async () => {
    const libraryItem = {
      id: 'book-1',
      kind: 'book',
      title: 'Kokoro study copy',
      createdAt: 1,
    } as LibraryItem;
    const providers = createReadingDiscoveryProviders({
      sites: [site],
      novels: [novel],
      listLibrary: async () => [libraryItem],
      searchJiten: async () => ({ decks: [deck] }),
    });
    const values = await Promise.all(providers.map((provider) => provider.search({
      query: provider.id === 'curated-sites'
        ? 'news'
        : provider.id === 'jiten'
          ? 'cat'
          : 'kokoro',
      signal: new AbortController().signal,
    })));
    expect(providers.map((provider) => provider.id)).toEqual([
      'library',
      'local-catalogue',
      'jiten',
      'curated-sites',
    ]);
    expect(values.map((items) => items.length)).toEqual([1, 1, 1, 1]);
    expect(values[0][0]).toMatchObject({
      action: { type: 'open-library', itemId: 'book-1' },
      entry: { itemId: 'book-1', source: { kind: 'local-library' } },
    });
    expect(readingDiscoveryCoverUrl({
      ...values[0][0].entry,
      cover: { state: 'local-cache', ref: 'cover.jpg' },
    })).toBe('media://book-1/cover.jpg');
  });
});

/**
 * `cached local art -> validated remote art -> designed fallback`. Null is how
 * this function says "fallback", and the card paints its gradient instead of an
 * `<img>` pointed at something that cannot load.
 */
describe('discovery cover resolution', () => {
  // Built from a real Jiten result rather than a hand-written literal, so a
  // change to the entry contract reaches these cases instead of passing over a
  // shape that no provider actually emits.
  const jitenResult = jitenDiscoveryResult(deck, 'cat');
  if (!jitenResult) throw new Error('jitenDiscoveryResult scored the fixture deck as no match');

  const entryWith = (cover: ReadingWorkspaceEntry['cover'], itemId: string | null = null) =>
    ({ ...jitenResult.entry, itemId, cover }) as ReadingWorkspaceEntry;

  beforeEach(() => {
    resetCoverArtCache();
  });

  it('prefers locally cached art, which is the only art that survives offline', () => {
    expect(readingDiscoveryCoverUrl(entryWith({ state: 'local-cache', ref: 'cover.jpg' }, 'jiten-7')))
      .toBe('media://jiten-7/cover.jpg');
  });

  it('offers remote art whose host the CSP will actually render', () => {
    const url = 'https://cdn.jiten.moe/7/cover.jpg';
    expect(readingDiscoveryCoverUrl(entryWith({ state: 'remote', ref: url }))).toBe(url);
  });

  it('falls back rather than painting art the CSP blocks', () => {
    // The defect this closes: a raw provider URL went straight to an <img>, so a
    // packaged build showed a broken box and logged a CSP violation per card.
    expect(readingDiscoveryCoverUrl(entryWith({
      state: 'remote',
      ref: 'https://images.example.com/7/cover.jpg',
    }))).toBeNull();
  });

  it('stops offering a remote URL once the session has seen it fail', () => {
    const url = 'https://cdn.jiten.moe/7/cover.jpg';
    expect(readingDiscoveryCoverUrl(entryWith({ state: 'remote', ref: url }))).toBe(url);
    markCoverBroken(url);
    expect(readingDiscoveryCoverUrl(entryWith({ state: 'remote', ref: url }))).toBeNull();
  });

  it('falls back when there is no art, or no owner to resolve a cached path against', () => {
    expect(readingDiscoveryCoverUrl(entryWith({ state: 'fallback', ref: null }))).toBeNull();
    expect(readingDiscoveryCoverUrl(entryWith({ state: 'local-cache', ref: 'cover.jpg' }, null)))
      .toBeNull();
  });
});
