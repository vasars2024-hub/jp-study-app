import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_READING_PREFERENCES,
  autoReadingSourceFor,
  autoReadingTextFor,
  needsReading,
  normalizeAutoReadingPreferences,
  selectAutoReadingCards,
} from '../flashcardAutoReading';

const on = {
  ...DEFAULT_AUTO_READING_PREFERENCES,
  epub: true,
  extension: true,
  media: true,
  import: true,
};

describe('automatic reading preferences', () => {
  it('defaults to off for every source', () => {
    // The negative control for the whole feature: an unconfigured profile must
    // never rewrite a deck it was not asked to touch.
    const defaults = normalizeAutoReadingPreferences();
    expect(defaults).toEqual({
      epub: false,
      extension: false,
      media: false,
      import: false,
      form: 'furigana',
      maxPerBatch: 200,
    });
    expect(selectAutoReadingCards(
      [{ source: 'epub', word: '本' }, { source: 'media', sentence: '日本語を読む。' }],
      defaults,
    )).toEqual({ chosen: [], skipped: 2, deferred: 0 });
  });

  it('refuses a nonsense cap or form instead of inheriting it', () => {
    expect(normalizeAutoReadingPreferences({ maxPerBatch: 0 }).maxPerBatch).toBe(200);
    expect(normalizeAutoReadingPreferences({ maxPerBatch: -4 }).maxPerBatch).toBe(200);
    expect(normalizeAutoReadingPreferences({ maxPerBatch: Number.NaN }).maxPerBatch).toBe(200);
    expect(normalizeAutoReadingPreferences({ maxPerBatch: 9_000 }).maxPerBatch).toBe(2000);
    expect(normalizeAutoReadingPreferences({ maxPerBatch: 12.7 }).maxPerBatch).toBe(12);
    expect(normalizeAutoReadingPreferences({ form: 'kana' }).form).toBe('kana');
    expect(normalizeAutoReadingPreferences({ form: 'ruby' as never }).form).toBe('furigana');
  });

  it('shares one family mapping with narration, so a card cannot be two things', () => {
    expect(autoReadingSourceFor('epub-ai')).toBe('epub');
    expect(autoReadingSourceFor('extension')).toBe('extension');
    expect(autoReadingSourceFor('media')).toBe('media');
    expect(autoReadingSourceFor('csv')).toBe('import');
    expect(autoReadingSourceFor('dictionary')).toBeNull();
  });
});

describe('which new cards a reading run picks up', () => {
  it('never overwrites a reading the card already carries', () => {
    // An imported deck's own reading is authored data. A morphological guess
    // replacing it would be a silent downgrade nobody asked for.
    const result = selectAutoReadingCards([
      { source: 'import', word: '日本', reading: 'にほん' },
      { source: 'import', word: '東京', reading: '   ' },
      { source: 'import', word: '大阪' },
    ], on);
    expect(result.chosen.map((card) => card.word)).toEqual(['東京', '大阪']);
    expect(result.skipped).toBe(1);
  });

  it('skips text with nothing to annotate', () => {
    // Kana-only text already reads itself; a duplicate kana line is clutter.
    expect(needsReading('ねこ')).toBe(false);
    expect(needsReading('猫')).toBe(true);
    expect(needsReading('日本語を読む。')).toBe(true);
    // A Latin gloss through a Japanese tokenizer returns the surface unchanged.
    expect(needsReading('to eat, to devour')).toBe(false);
    expect(needsReading('')).toBe(false);
    expect(selectAutoReadingCards([
      { source: 'epub', word: 'ねこ' },
      { source: 'epub', word: 'to eat' },
    ], on).chosen).toHaveLength(0);
  });

  it('annotates the headword, falling back to the sentence only when there is none', () => {
    // The opposite of narration: a Reading slot describes the word, not a
    // whole mined sentence folded to kana.
    expect(autoReadingTextFor({ word: '食べる', sentence: 'ご飯を食べる。' })).toBe('食べる');
    expect(autoReadingTextFor({ sentence: 'ご飯を食べる。' })).toBe('ご飯を食べる。');
    expect(autoReadingTextFor({ word: '  ', sentence: '' })).toBe('');
  });

  it('caps the batch and reports the remainder rather than truncating silently', () => {
    const cards = Array.from({ length: 7 }, (_, index) => ({ source: 'media', word: `漢字${index}` }));
    const result = selectAutoReadingCards(cards, { ...on, maxPerBatch: 3 });
    expect(result.chosen).toHaveLength(3);
    expect(result.deferred).toBe(4);
    expect(result.skipped).toBe(0);
  });

  it('honours one family being on while another is off', () => {
    const result = selectAutoReadingCards([
      { source: 'epub', word: '本' },
      { source: 'media', word: '猫' },
    ], { ...DEFAULT_AUTO_READING_PREFERENCES, epub: true });
    expect(result.chosen.map((card) => card.word)).toEqual(['本']);
    expect(result.skipped).toBe(1);
  });
});
