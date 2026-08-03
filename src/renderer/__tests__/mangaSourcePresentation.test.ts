import { describe, expect, it } from 'vitest';
import type { ReadingChapter } from '../../shared/readingModel';
import {
  isEmptyProviderResult,
  isLocalOnlyMangaProvider,
  isProviderCrash,
  mangaChapterSecondaryTitle,
  mangaChapterSourceKey,
  visibleMangaChapters,
} from '../components/reading/mangaSourcePresentation';

function chapter(index: number, number: string, title: string): ReadingChapter {
  return {
    chapterId: `chapter-${number}`,
    editionId: 'edition',
    volumeId: null,
    number,
    title,
    index,
    scanlator: index % 2 ? 'Team Blue' : 'Team Red',
    language: 'ja',
  };
}

const chapters = [
  chapter(0, '1', 'Arrival'),
  chapter(1, '2', 'The Golden Age'),
  chapter(2, '2.5', 'Extra'),
];

describe('manga source presentation', () => {
  it('shows newest chapters first and caps a large provider list', () => {
    expect(visibleMangaChapters(chapters, '', 'latest', 2)).toMatchObject({
      items: [{ number: '2.5' }, { number: '2' }],
      matchedCount: 3,
      hiddenCount: 1,
    });
  });

  it('searches chapter number, title, scanlator and language', () => {
    expect(visibleMangaChapters(chapters, 'golden', 'earliest', 20).items.map((row) => row.number))
      .toEqual(['2']);
    expect(visibleMangaChapters(chapters, 'blue', 'earliest', 20).items.map((row) => row.number))
      .toEqual(['2']);
    expect(visibleMangaChapters(chapters, '2.5', 'earliest', 20).items.map((row) => row.number))
      .toEqual(['2.5']);
  });

  it('uses an unambiguous provider/chapter key', () => {
    expect(mangaChapterSourceKey('provider:a', 'chapter:b'))
      .not.toBe(mangaChapterSourceKey('provider', 'a:chapter:b'));
  });

  it('separates an empty provider from a technical provider failure', () => {
    expect(isEmptyProviderResult('HTTP 500: no results found for this media')).toBe(true);
    expect(isEmptyProviderResult('HTTP 503: upstream timed out')).toBe(false);
  });

  it('does not count the built-in local provider as a chapter source', () => {
    expect(isLocalOnlyMangaProvider('local-manga')).toBe(true);
    expect(isLocalOnlyMangaProvider('LOCAL-MANGA')).toBe(true);
    expect(isLocalOnlyMangaProvider('mangadex')).toBe(false);
    expect(isLocalOnlyMangaProvider('comick')).toBe(false);
  });

  it('recognises a sidecar crash so it is not reported as an empty title', () => {
    // The exact string the dialog rendered on 2026-08-02 for AniList 31668.
    const measured = '/api/v1/manga/chapters -> HTTP 500: fatal error occurred, please report this issue';
    expect(isProviderCrash(measured)).toBe(true);
    expect(isEmptyProviderResult(measured)).toBe(false);
    expect(isProviderCrash('no chapters found for this media')).toBe(false);
  });

  it('removes a repeated provider chapter prefix from the secondary title', () => {
    expect(mangaChapterSecondaryTitle(chapter(0, '1', 'Chapter 1 - 第一話'))).toBe('第一話');
    expect(mangaChapterSecondaryTitle(chapter(1, '2.5', 'Extra'))).toBe('Extra');
  });
});
