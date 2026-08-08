// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  READING_WORKSPACE_SCHEMA_VERSION,
  defaultReadingWorkspaceRoute,
  normalizeReadingWorkspaceEntry,
  normalizeReadingWorkspaceLibrary,
  normalizeReadingWorkspaceRoute,
  readingWorkspaceEntryFromLibraryItem,
  routeForReadingWorkspaceEntry,
  serializeReadingWorkspaceRoute,
  type ReadingWorkspaceEntry,
} from '../readingWorkspace';
import { normalizeReadingWorkspaceRoute as normalizeRouteFromReadingIpc } from '../readingIpc';
import type { LibraryItem } from '../types';

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'book-1',
    title: '  読む本  ',
    kind: 'book',
    createdAt: 1_000,
    epubFile: 'original.epub',
    progress: { location: 'p:4:0.2500', percent: 0.25 },
    coverPath: 'cover.jpg',
    ...overrides,
  } as LibraryItem;
}

describe('Reading workspace routes', () => {
  it('starts at a versioned home route', () => {
    expect(defaultReadingWorkspaceRoute()).toEqual({
      version: READING_WORKSPACE_SCHEMA_VERSION,
      section: 'home',
      intent: 'browse',
    });
  });

  it('keeps legacy Finder and Novels names as section aliases', () => {
    expect(normalizeReadingWorkspaceRoute('reading-finder')).toMatchObject({
      section: 'discover',
      intent: 'browse',
    });
    expect(normalizeReadingWorkspaceRoute('reading')).toMatchObject({ section: 'discover' });
    expect(normalizeReadingWorkspaceRoute('novels')).toMatchObject({ section: 'plan' });
  });

  it('round-trips an encoded deep link with all identity fields', () => {
    const route = {
      version: READING_WORKSPACE_SCHEMA_VERSION,
      section: 'discover' as const,
      intent: 'open' as const,
      workId: 'work:ベルセルク',
      editionId: 'edition/1',
      itemId: 'item-1',
    };
    expect(normalizeReadingWorkspaceRoute(serializeReadingWorkspaceRoute(route))).toEqual(route);
    expect(normalizeRouteFromReadingIpc('reading-finder')).toMatchObject({ section: 'discover' });
  });

  it('rejects a future schema instead of guessing', () => {
    expect(normalizeReadingWorkspaceRoute({ version: 99, section: 'library' })).toBeNull();
    expect(normalizeReadingWorkspaceRoute('reading://workspace/library?v=99')).toBeNull();
  });
});

describe('Reading workspace library normalization', () => {
  it('projects a local EPUB into one card contract and keeps progress precise', () => {
    const entry = readingWorkspaceEntryFromLibraryItem(item());
    expect(entry).toMatchObject({
      version: READING_WORKSPACE_SCHEMA_VERSION,
      key: 'library:book-1',
      itemId: 'book-1',
      work: { contentType: 'novel', workId: 'book-1', title: '読む本' },
      edition: { format: 'epub', origin: 'local' },
      source: { kind: 'local-library', id: 'library' },
      availability: 'readable',
      cover: { state: 'local-cache', ref: 'cover.jpg' },
      progress: {
        value: { locator: { kind: 'part', part: 4, fraction: 0.25 } },
        percent: 0.25,
        state: 'in-progress',
      },
    });
  });

  it('classifies web inbox items and preserves their level metadata', () => {
    const entry = readingWorkspaceEntryFromLibraryItem(item({
      inboxMeta: {
        sourceUrl: 'https://example.com/article',
        contentHash: 'hash',
        lang: 'ja',
        charCount: 100,
        estMinutes: 2,
        knownRatio: 1.4,
        levelEstimate: 3,
        receivedAt: 2_000,
      },
      progress: { location: 'p:0:0', percent: 1 },
      coverPath: undefined,
    }));
    expect(entry).toMatchObject({
      work: { contentType: 'article' },
      source: { kind: 'web', id: 'https://example.com/article' },
      cover: { state: 'fallback', ref: null },
      level: 3,
      knownRatio: 1,
      progress: { state: 'complete', percent: 1 },
    });
  });

  it('drops malformed IPC records and de-duplicates repeated item ids', () => {
    const entries = normalizeReadingWorkspaceLibrary([
      item(),
      item({ title: 'Replacement' }),
      { id: 'missing-title', kind: 'book', createdAt: 1_000 },
      'not an item',
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.work.title).toBe('読む本');
  });

  it('normalizes a persisted entry and rejects an invalid nested edition', () => {
    const entry = readingWorkspaceEntryFromLibraryItem(item());
    expect(normalizeReadingWorkspaceEntry(entry)).toEqual(entry);
    expect(normalizeReadingWorkspaceEntry({ ...entry, edition: { ...entry.edition, workId: 'wrong' } })).toBeNull();
    const progressValue = entry.progress.value;
    if (!progressValue) throw new Error('fixture should contain a precise progress value');
    expect(normalizeReadingWorkspaceEntry({
      ...entry,
      progress: { ...entry.progress, value: { ...progressValue, locator: { kind: 'page', index: -1 } } },
    })).toMatchObject({ progress: { value: null, state: 'in-progress' } });
    expect(normalizeReadingWorkspaceEntry({
      ...entry,
      progress: { ...entry.progress, value: { ...progressValue, editionId: 'other-edition' } },
    })).toMatchObject({ progress: { value: null, state: 'in-progress' } });
    expect(normalizeReadingWorkspaceEntry({
      ...entry,
      cover: { state: 'remote', ref: 'javascript:alert(1)' },
    })).toBeNull();
    expect(normalizeReadingWorkspaceEntry({
      ...entry,
      cover: { state: 'remote', ref: 'https://example.com/cover.jpg' },
    })).toMatchObject({ cover: { state: 'remote', ref: 'https://example.com/cover.jpg' } });
  });

  it('builds a reader handoff that keeps work, edition, and item identity', () => {
    const entry: ReadingWorkspaceEntry = readingWorkspaceEntryFromLibraryItem(item());
    expect(routeForReadingWorkspaceEntry(entry)).toEqual({
      version: READING_WORKSPACE_SCHEMA_VERSION,
      section: 'library',
      intent: 'open',
      workId: 'book-1',
      editionId: 'book-1',
      itemId: 'book-1',
    });
    expect(routeForReadingWorkspaceEntry(entry, 'continue').section).toBe('continue');
    expect(routeForReadingWorkspaceEntry(entry, 'plan').section).toBe('plan');
    expect(routeForReadingWorkspaceEntry(entry, 'import').section).toBe('imports');
  });
});
