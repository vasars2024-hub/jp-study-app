/**
 * Which language a library item is OCR'd (and translated) in.
 *
 * `bookOcrJob.ts`, `BookOcrPanel.tsx` and `NovelReader.tsx` all read `item.lang`,
 * a field `LibraryItem` never had and nothing ever wrote. The tag was always
 * undefined, so every book fell through to the study language: a Chinese book
 * on a Japanese profile was read with the Japanese recognizer.
 */
import { describe, expect, it } from 'vitest';
import { bookOcrLangOf } from '../bookOcrIpc';
import { libraryItemLangTag } from '../libraryLevel';
import type { LibraryItem } from '../types';

type Item = Pick<LibraryItem, 'readingSource' | 'inboxMeta' | 'levelMeta'>;

const chapter = (language: string): Item => ({
  readingSource: {
    kind: 'seanime-manga-chapter', mediaId: 1, workId: 'w', workTitle: 'W', editionId: 'e',
    providerId: 'p', providerLabel: 'P', chapterId: 'c', chapterNumber: '1', chapterTitle: '', language,
  },
});
const detected = (lang: 'ja' | 'zh' | 'en' | 'unknown'): Item => ({
  levelMeta: { lang, knownRatio: 0.5, levelEstimate: 3 },
});

describe('libraryItemLangTag', () => {
  it("prefers the provider's language, then the detected one", () => {
    expect(libraryItemLangTag({ ...chapter('zh'), ...detected('ja') })).toBe('zh');
    expect(libraryItemLangTag(detected('zh'))).toBe('zh');
    expect(libraryItemLangTag({
      inboxMeta: {
        sourceUrl: '', contentHash: '', lang: 'ja', charCount: 1, estMinutes: 1,
        knownRatio: 0, levelEstimate: null, receivedAt: 1,
      },
    })).toBe('ja');
  });

  it('treats empty and unknown tags as no evidence', () => {
    expect(libraryItemLangTag({})).toBeUndefined();
    expect(libraryItemLangTag(detected('unknown'))).toBeUndefined();
    expect(libraryItemLangTag({ ...chapter(''), ...detected('zh') })).toBe('zh');
  });
});

describe('bookOcrLangOf', () => {
  it('reads a Chinese book as Chinese and a Japanese book as Japanese, whatever the profile', () => {
    expect(bookOcrLangOf(chapter('zh-hk'), 'ja')).toBe('zh');
    expect(bookOcrLangOf(detected('zh'), 'ja')).toBe('zh');
    expect(bookOcrLangOf(chapter('ja'), 'zh')).toBe('ja');
    expect(bookOcrLangOf(detected('ja'), 'zh')).toBe('ja');
    expect(bookOcrLangOf(chapter('ru'), 'ja')).toBe('ru');
  });

  it('falls back to the study language when the item says nothing it can read', () => {
    expect(bookOcrLangOf({}, 'zh')).toBe('zh');
    expect(bookOcrLangOf(detected('unknown'), 'ru')).toBe('ru');
    // No book OCR for English; the study language is the honest fallback.
    expect(bookOcrLangOf(detected('en'), 'ja')).toBe('ja');
  });
});
