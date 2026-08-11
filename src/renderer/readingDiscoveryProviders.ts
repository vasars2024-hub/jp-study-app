import type { JitenDeck } from '../shared/jiten';
import {
  READING_WORKSPACE_SCHEMA_VERSION,
  readingWorkspaceEntryFromLibraryItem,
  type ReadingWorkspaceEntry,
} from '../shared/readingWorkspace';
import {
  readingDiscoveryTextScore,
  type ReadingDiscoveryAction,
  type ReadingDiscoveryProvider,
  type ReadingDiscoveryResult,
} from '../shared/readingDiscovery';
import type { LibraryItem } from '../shared/types';
import type { Novel } from './data/novels';
import type { ReadingSite } from './data/readingSites';


export function readingDiscoveryCoverUrl(entry: ReadingWorkspaceEntry): string | null {
  if (!entry.cover.ref) return null;
  if (entry.cover.state === 'remote') return entry.cover.ref;
  if (entry.cover.state === 'local-cache' && entry.itemId) {
    return `media://${entry.itemId}/${entry.cover.ref}`;
  }
  return null;
}

export interface ReadingDiscoveryProviderSources {
  sites: readonly ReadingSite[];
  novels: readonly Novel[];
  listLibrary: () => Promise<unknown>;
  searchJiten: (query: string) => Promise<{ decks: JitenDeck[] }>;
}

const JLPT_LEVEL: Record<NonNullable<Novel['jlpt']>, number> = {
  N5: 2,
  N4: 3,
  N3: 4,
  N2: 5,
  N1: 6,
};

function emptyProgress(): ReadingWorkspaceEntry['progress'] {
  return { value: null, percent: 0, updatedAt: 0, state: 'unstarted' };
}

function safeRemoteCover(value: string | null | undefined): ReadingWorkspaceEntry['cover'] {
  if (!value) return { state: 'fallback', ref: null };
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? { state: 'remote', ref: url.toString() }
      : { state: 'fallback', ref: null };
  } catch {
    return { state: 'fallback', ref: null };
  }
}

function result(
  entry: ReadingWorkspaceEntry,
  providerId: string,
  providerLabelKey: string,
  providerPriority: number,
  relevance: number,
  action: ReadingDiscoveryAction,
): ReadingDiscoveryResult {
  return { entry, providerId, providerLabelKey, providerPriority, relevance, action };
}

export function readingSiteDiscoveryResult(
  site: ReadingSite,
  query: string,
): ReadingDiscoveryResult | null {
  const score = readingDiscoveryTextScore(
    [site.name, site.notes, ...site.genres, ...site.lengthKinds],
    query,
  );
  if (score === null) return null;
  return result({
    version: READING_WORKSPACE_SCHEMA_VERSION,
    key: `site:${site.id}`,
    itemId: null,
    work: {
      workId: `site:${site.id}`,
      title: site.name,
      titleNative: site.name,
      contentType: 'article',
      aniListId: null,
      malId: null,
    },
    edition: null,
    source: { kind: 'curated-site', id: site.id },
    availability: 'external',
    cover: { state: 'fallback', ref: null },
    progress: emptyProgress(),
    level: site.levels[0] ?? null,
    knownRatio: null,
    tags: [...site.genres, ...site.lengthKinds, site.pricing],
  }, 'curated-sites', 'reading.title', 30, score, {
    type: 'inspect-site',
    siteId: site.id,
  });
}

export function novelDiscoveryResult(
  novel: Novel,
  query: string,
): ReadingDiscoveryResult | null {
  const score = readingDiscoveryTextScore([
    novel.titleJp,
    novel.titleEn,
    novel.reading,
    novel.author,
    novel.authorEn,
    novel.synopsis,
    ...novel.genres,
  ], query);
  if (score === null) return null;
  const firstLink = novel.links[0]?.url;
  return result({
    version: READING_WORKSPACE_SCHEMA_VERSION,
    key: `catalogue:${novel.id}`,
    itemId: null,
    work: {
      workId: `catalogue:${novel.id}`,
      title: novel.titleJp,
      titleNative: novel.titleJp,
      contentType: 'novel',
      aniListId: null,
      malId: null,
    },
    edition: null,
    source: { kind: 'provider', id: `local-catalogue:${novel.id}` },
    availability: firstLink ? 'external' : 'unavailable',
    cover: { state: 'fallback', ref: null },
    progress: emptyProgress(),
    level: novel.jlpt ? JLPT_LEVEL[novel.jlpt] : null,
    knownRatio: null,
    tags: [
      novel.type,
      novel.difficulty,
      ...novel.genres,
      ...(novel.jlpt ? [novel.jlpt] : []),
    ],
  }, 'local-catalogue', 'novels.kind.local', 10, score,
  firstLink
    ? { type: 'open-external', url: firstLink }
    : { type: 'open-plan', query: novel.titleJp });
}

export function jitenDiscoveryResult(
  deck: JitenDeck,
  query: string,
): ReadingDiscoveryResult | null {
  const score = readingDiscoveryTextScore([
    deck.originalTitle,
    deck.romajiTitle,
    deck.englishTitle,
    deck.description,
    ...(deck.tags?.map((tag) => tag.name) ?? []),
  ], query);
  if (score === null) return null;
  const externalUrl = deck.links?.find((link) => /^https?:\/\//iu.test(link.url))?.url;
  return result({
    version: READING_WORKSPACE_SCHEMA_VERSION,
    key: `jiten:${deck.deckId}`,
    itemId: null,
    work: {
      workId: `jiten:${deck.deckId}`,
      title: deck.originalTitle,
      titleNative: deck.originalTitle,
      contentType: 'novel',
      aniListId: null,
      malId: null,
    },
    edition: null,
    source: { kind: 'jiten', id: String(deck.deckId) },
    availability: externalUrl ? 'external' : 'importable',
    cover: safeRemoteCover(deck.coverName),
    progress: emptyProgress(),
    level: null,
    knownRatio: null,
    tags: deck.tags?.map((tag) => tag.name).slice(0, 40) ?? [],
  }, 'jiten', 'novels.kind.jiten', 20, score,
  externalUrl
    ? { type: 'open-external', url: externalUrl }
    : { type: 'open-plan', query: deck.originalTitle });
}

function libraryScore(
  item: LibraryItem,
  entry: ReadingWorkspaceEntry,
  query: string,
): number | null {
  return readingDiscoveryTextScore([
    entry.work.title,
    entry.work.titleNative,
    item.sourcePath,
    item.folder,
    ...entry.tags,
  ], query);
}

export function createReadingDiscoveryProviders(
  sources: ReadingDiscoveryProviderSources,
): ReadingDiscoveryProvider[] {
  return [
    {
      id: 'library',
      labelKey: 'palette.section.library',
      priority: 0,
      search: async ({ query, signal }) => {
        const payload = await sources.listLibrary();
        if (signal.aborted || !Array.isArray(payload)) return [];
        return payload.flatMap((item: LibraryItem) => {
          const entry = readingWorkspaceEntryFromLibraryItem(item);
          const score = libraryScore(item, entry, query);
          return score === null ? [] : [result(
            entry,
            'library',
            'palette.section.library',
            0,
            score,
            { type: 'open-library', itemId: item.id },
          )];
        });
      },
    },
    {
      id: 'local-catalogue',
      labelKey: 'novels.kind.local',
      priority: 10,
      search: async ({ query, signal }) => signal.aborted
        ? []
        : sources.novels.flatMap((novel) => novelDiscoveryResult(novel, query) ?? []),
    },
    {
      id: 'jiten',
      labelKey: 'novels.kind.jiten',
      priority: 20,
      search: async ({ query, signal }) => {
        const response = await sources.searchJiten(query);
        if (signal.aborted) return [];
        return response.decks.flatMap((deck) => jitenDiscoveryResult(deck, query) ?? []);
      },
    },
    {
      id: 'curated-sites',
      labelKey: 'reading.title',
      priority: 30,
      search: async ({ query, signal }) => signal.aborted
        ? []
        : sources.sites.flatMap((site) => readingSiteDiscoveryResult(site, query) ?? []),
    },
  ];
}
