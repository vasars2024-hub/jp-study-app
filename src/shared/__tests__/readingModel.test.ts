import { describe, expect, it } from 'vitest';
import {
  isLocatorValidFor,
  locatorKindFor,
  parseLocator,
  serializeLocator,
  sortReadingChapters,
  stripReadingPageSecrets,
  type ReadingChapter,
  type ReadingPage,
} from '../readingModel';
import {
  progressFromReadingLocator,
  readingEditionFromLibraryItem,
  readingFormatOf,
  readingLocatorFromProgress,
  readingProgressFromLibraryItem,
  readingWorkFromLibraryItem,
} from '../readingLibraryAdapter';
import type { LibraryItem } from '../types';

function libraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-1',
    title: 'Test Work',
    kind: 'book',
    createdAt: 1_000,
    ...overrides,
  } as LibraryItem;
}

function chapter(overrides: Partial<ReadingChapter>): ReadingChapter {
  return {
    chapterId: 'c',
    editionId: 'e',
    volumeId: null,
    number: '1',
    title: '',
    index: 0,
    scanlator: '',
    language: '',
    ...overrides,
  };
}

describe('reading locators', () => {
  it('binds each format to the one locator kind it can express', () => {
    expect(locatorKindFor('image-series')).toBe('page');
    expect(locatorKindFor('pdf')).toBe('page');
    // Both go through the one novel reader, which addresses them identically.
    expect(locatorKindFor('epub')).toBe('part');
    expect(locatorKindFor('text')).toBe('part');
  });

  it('rejects a locator that cannot address the format', () => {
    // The mistake the model exists to prevent: a page index against a novel.
    expect(isLocatorValidFor('epub', { kind: 'page', index: 3 })).toBe(false);
    expect(isLocatorValidFor('epub', { kind: 'part', part: 2, fraction: 0.5 })).toBe(true);
    expect(isLocatorValidFor('image-series', { kind: 'page', index: 3 })).toBe(true);
    expect(isLocatorValidFor('image-series', { kind: 'part', part: 0, fraction: 0 })).toBe(false);
  });

  it('round-trips every locator kind through storage', () => {
    for (const locator of [
      { kind: 'page', index: 0 },
      { kind: 'page', index: 41 },
      { kind: 'part', part: 0, fraction: 0 },
      { kind: 'part', part: 12, fraction: 0.6183 },
      { kind: 'part', part: 3, fraction: 1 },
    ] as const) {
      expect(parseLocator(serializeLocator(locator))).toEqual(locator);
    }
  });

  it('refuses malformed stored locators rather than guessing', () => {
    expect(parseLocator('')).toBeNull();
    expect(parseLocator('page')).toBeNull();
    expect(parseLocator('page:-1')).toBeNull();
    expect(parseLocator('page:2.5')).toBeNull();
    expect(parseLocator('part:2')).toBeNull();
    // `Number('')` is 0, so an empty half must not read as "start of part 0".
    expect(parseLocator('part:2:')).toBeNull();
    expect(parseLocator('part::0.5')).toBeNull();
    expect(parseLocator('part:2:abc')).toBeNull();
    // A fraction is within one part, so it can never exceed 1.
    expect(parseLocator('part:2:1.5')).toBeNull();
    expect(parseLocator('part:-1:0.5')).toBeNull();
    expect(parseLocator('chapter:4')).toBeNull();
    // The kinds this union deliberately does not have: nothing in the app
    // produces an epub.js CFI or a character offset.
    expect(parseLocator('cfi:epubcfi(/6/4)')).toBeNull();
    expect(parseLocator('offset:900')).toBeNull();
  });
});

describe('reading chapters', () => {
  it('orders by index, not by printed number', () => {
    // Providers commonly list newest-first, and numbering is not reliable —
    // "7.5" and "Extra" both occur.
    const sorted = sortReadingChapters([
      chapter({ chapterId: 'c3', index: 2, number: '8' }),
      chapter({ chapterId: 'c1', index: 0, number: '7' }),
      chapter({ chapterId: 'c2', index: 1, number: '7.5' }),
    ]);
    expect(sorted.map((c) => c.chapterId)).toEqual(['c1', 'c2', 'c3']);
  });

  it('breaks an index tie numerically, not lexically', () => {
    const sorted = sortReadingChapters([
      chapter({ chapterId: 'b', index: 0, number: '10' }),
      chapter({ chapterId: 'a', index: 0, number: '9' }),
    ]);
    expect(sorted.map((c) => c.chapterId)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = [chapter({ chapterId: 'z', index: 1 }), chapter({ chapterId: 'a', index: 0 })];
    sortReadingChapters(input);
    expect(input.map((c) => c.chapterId)).toEqual(['z', 'a']);
  });
});

describe('page persistence', () => {
  it('drops the URL and every header before storage, and demands a refresh', () => {
    const page: ReadingPage = {
      index: 4,
      url: 'https://cdn.example/chapter/4.jpg?sig=secret',
      headers: { Referer: 'https://example', Cookie: 'session=secret' },
      width: 800,
      height: 1200,
    };
    const stored = stripReadingPageSecrets(page);

    expect(stored).toEqual({ index: 4, url: '', width: 800, height: 1200, refreshRequired: true });
    expect(JSON.stringify(stored)).not.toContain('secret');
    expect(Object.keys(stored)).not.toContain('headers');
  });
});

describe('Study OS library projection', () => {
  it('separates a novel, an article and a manga by more than kind', () => {
    // Both an EPUB and an imported article are `kind: 'book'` on disk.
    expect(readingFormatOf(libraryItem({ epubFile: 'book.epub' }))).toBe('epub');
    expect(readingFormatOf(libraryItem())).toBe('text');
    expect(readingFormatOf(libraryItem({ kind: 'manga' }))).toBe('image-series');

    expect(readingWorkFromLibraryItem(libraryItem({ epubFile: 'b.epub' })).contentType).toBe('novel');
    expect(
      readingWorkFromLibraryItem(
        libraryItem({ inboxMeta: { lang: 'ja' } as LibraryItem['inboxMeta'] }),
      ).contentType,
    ).toBe('article');
    expect(readingWorkFromLibraryItem(libraryItem({ kind: 'manga' })).contentType).toBe('manga');
  });

  it('projects a manga volume with its page count and cover', () => {
    const edition = readingEditionFromLibraryItem(
      libraryItem({ kind: 'manga', pageCount: 180, coverPath: 'cover.jpg' }),
    );
    expect(edition).toMatchObject({
      format: 'image-series',
      origin: 'local',
      providerId: '',
      unitCount: 180,
      coverRef: 'cover.jpg',
    });
  });

  it('keeps provider identity when a downloaded chapter becomes local', () => {
    const item = libraryItem({
      kind: 'manga',
      pageCount: 24,
      progress: { page: 3, percent: 0.125 },
      readingSource: {
        kind: 'seanime-manga-chapter',
        mediaId: 30_002,
        malId: 2,
        workId: 'seanime-manga:30002',
        workTitle: 'Berserk',
        workTitleNative: 'ベルセルク',
        editionId: 'seanime:fixture:30002',
        providerId: 'fixture',
        providerLabel: 'Fixture provider',
        chapterId: 'chapter-1',
        chapterNumber: '1',
        chapterTitle: '第一話',
        language: 'ja',
      },
    });

    expect(readingWorkFromLibraryItem(item)).toMatchObject({
      workId: 'seanime-manga:30002',
      title: 'Berserk',
      titleNative: 'ベルセルク',
      aniListId: 30_002,
      malId: 2,
    });
    expect(readingEditionFromLibraryItem(item)).toMatchObject({
      editionId: 'seanime:fixture:30002',
      workId: 'seanime-manga:30002',
      origin: 'local',
      providerId: 'fixture',
      providerLabel: 'Fixture provider',
      language: 'ja',
    });
    expect(readingProgressFromLibraryItem(item)).toMatchObject({
      editionId: 'seanime:fixture:30002',
      chapterId: 'chapter-1',
      locator: { kind: 'page', index: 3 },
    });
  });

  it('reads a page index for manga and a part/fraction for a novel', () => {
    expect(
      readingLocatorFromProgress(libraryItem({ kind: 'manga' }), { page: 12 }),
    ).toEqual({ kind: 'page', index: 12 });
    // Exactly what NovelReader.saveNow writes.
    expect(
      readingLocatorFromProgress(libraryItem({ epubFile: 'b.epub' }), { location: 'p:4:0.6183' }),
    ).toEqual({ kind: 'part', part: 4, fraction: 0.6183 });
    // An imported article is stored the same way and must read back the same.
    expect(
      readingLocatorFromProgress(libraryItem(), { location: 'p:0:0.25' }),
    ).toEqual({ kind: 'part', part: 0, fraction: 0.25 });
  });

  it('hands a legacy bare-number position back to the reader instead of guessing', () => {
    // Very old saves stored a fraction of the *whole book*. Turning that into a
    // part index needs the chapter weights only the reader has, so the adapter
    // declines and NovelReader's existing legacy path maps it.
    expect(
      readingLocatorFromProgress(libraryItem({ epubFile: 'b.epub' }), { location: '0.42' }),
    ).toBeNull();
  });

  it('returns null rather than a locator the format cannot mean', () => {
    // A stored book position on a manga item, or a page on a novel, is corrupt
    // data — reopening at a position that does not mean what it says is worse
    // than starting from the beginning.
    expect(
      readingLocatorFromProgress(libraryItem({ kind: 'manga' }), { location: 'p:1:0.5' }),
    ).toBeNull();
    expect(
      readingLocatorFromProgress(libraryItem({ epubFile: 'b.epub' }), { page: 3 }),
    ).toBeNull();
    expect(readingLocatorFromProgress(libraryItem({ kind: 'manga' }), undefined)).toBeNull();
    expect(readingLocatorFromProgress(libraryItem({ kind: 'manga' }), { page: -1 })).toBeNull();
    expect(readingLocatorFromProgress(libraryItem({ kind: 'manga' }), { percent: 0.5 })).toBeNull();
  });

  it('carries percent and last-read time into progress, clamped', () => {
    const progress = readingProgressFromLibraryItem(
      libraryItem({ kind: 'manga', progress: { page: 5, percent: 1.4 }, lastReadAt: 2_000 }),
    );
    expect(progress).toEqual({
      editionId: 'item-1',
      chapterId: null,
      locator: { kind: 'page', index: 5 },
      percent: 1,
      updatedAt: 2_000,
    });
  });

  it('falls back to createdAt when the item has never been opened', () => {
    const progress = readingProgressFromLibraryItem(
      libraryItem({ kind: 'manga', progress: { page: 0 } }),
    );
    expect(progress?.updatedAt).toBe(1_000);
    expect(progress?.percent).toBe(0);
  });

  it('writes back the shape the existing library already reads', () => {
    expect(
      progressFromReadingLocator(libraryItem({ kind: 'manga' }), { kind: 'page', index: 7 }, 0.25),
    ).toEqual({ page: 7, percent: 0.25 });
    // Byte-for-byte what NovelReader.saveNow writes today, four decimals
    // included — moving the reader onto the model changes no stored value.
    expect(
      progressFromReadingLocator(
        libraryItem({ epubFile: 'b.epub' }),
        { kind: 'part', part: 4, fraction: 0.61829 },
        0.5,
      ),
    ).toEqual({ location: 'p:4:0.6183', percent: 0.5 });
  });

  it('survives a round trip through the library shape', () => {
    const item = libraryItem({ epubFile: 'b.epub' });
    const written = progressFromReadingLocator(item, { kind: 'part', part: 9, fraction: 0.5 }, 0.7);
    expect(readingLocatorFromProgress(item, written)).toEqual({
      kind: 'part',
      part: 9,
      fraction: 0.5,
    });
  });

  it('throws on a write-back the format cannot express', () => {
    expect(() =>
      progressFromReadingLocator(
        libraryItem({ kind: 'manga' }),
        { kind: 'part', part: 0, fraction: 0 },
        0,
      ),
    ).toThrow(/cannot address/i);
  });
});
