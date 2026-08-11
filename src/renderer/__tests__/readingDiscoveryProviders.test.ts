import { describe, expect, it } from 'vitest';
import type { JitenDeck } from '../../shared/jiten';
import type { LibraryItem } from '../../shared/types';
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
