import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_AUDIO_PREFERENCES,
  autoAudioSourceFor,
  autoAudioTextFor,
  isSpeakableJapanese,
  normalizeAutoAudioPreferences,
  selectAutoAudioCards,
} from '../flashcardAutoAudio';

const on = { ...DEFAULT_AUTO_AUDIO_PREFERENCES, epub: true, extension: true, media: true, import: true };

describe('automatic narration preferences', () => {
  it('defaults to off for every source', () => {
    // The negative control for the whole feature: an unconfigured profile must
    // never spend the synthesizer. A single APKG is thousands of cards.
    const defaults = normalizeAutoAudioPreferences();
    expect(defaults).toEqual({
      epub: false,
      extension: false,
      media: false,
      import: false,
      maxPerBatch: 50,
    });
    expect(selectAutoAudioCards(
      [{ source: 'epub', word: '本' }, { source: 'media', sentence: 'これはペンです。' }],
      defaults,
    )).toEqual({ chosen: [], skipped: 2, deferred: 0 });
  });

  it('refuses a nonsense cap instead of inheriting it', () => {
    expect(normalizeAutoAudioPreferences({ maxPerBatch: 0 }).maxPerBatch).toBe(50);
    expect(normalizeAutoAudioPreferences({ maxPerBatch: -4 }).maxPerBatch).toBe(50);
    expect(normalizeAutoAudioPreferences({ maxPerBatch: Number.NaN }).maxPerBatch).toBe(50);
    expect(normalizeAutoAudioPreferences({ maxPerBatch: 9_000 }).maxPerBatch).toBe(500);
    expect(normalizeAutoAudioPreferences({ maxPerBatch: 12.7 }).maxPerBatch).toBe(12);
  });

  it('maps every mining source onto a family, and lookups onto none', () => {
    expect(autoAudioSourceFor('epub')).toBe('epub');
    expect(autoAudioSourceFor('epub-ai')).toBe('epub');
    expect(autoAudioSourceFor('extension')).toBe('extension');
    expect(autoAudioSourceFor('media')).toBe('media');
    expect(autoAudioSourceFor('csv')).toBe('import');
    expect(autoAudioSourceFor('import')).toBe('import');
    // A dictionary or Jiten lookup is one word the user is already reading.
    expect(autoAudioSourceFor('dictionary')).toBeNull();
    expect(autoAudioSourceFor('jiten')).toBeNull();
    expect(autoAudioSourceFor(undefined)).toBeNull();
  });
});

describe('which new cards a run picks up', () => {
  it('skips cards that already have audio, in either representation', () => {
    const result = selectAutoAudioCards([
      { source: 'epub', word: '本', audioPath: 'C:/clip.mp3' },
      { source: 'epub', word: '猫', audioDataUrl: 'data:audio/wav;base64,AA' },
      { source: 'epub', word: '犬' },
    ], on);
    expect(result.chosen.map((card) => card.word)).toEqual(['犬']);
    expect(result.skipped).toBe(2);
  });

  it('refuses text a Japanese voice would only mangle', () => {
    expect(isSpeakableJapanese('ねこ')).toBe(true);
    expect(isSpeakableJapanese('日本語')).toBe(true);
    expect(isSpeakableJapanese('to eat, to devour')).toBe(false);
    expect(selectAutoAudioCards([
      { source: 'import', word: 'to eat', sentence: 'A gloss, not a sentence.' },
    ], on).chosen).toHaveLength(0);
  });

  it('prefers the sentence over the headword, matching what review speaks', () => {
    expect(autoAudioTextFor({ word: '食べる', sentence: 'ご飯を食べる。' })).toBe('ご飯を食べる。');
    expect(autoAudioTextFor({ word: '食べる' })).toBe('食べる');
    expect(autoAudioTextFor({ word: '  ' })).toBe('');
  });

  it('caps the batch and reports the remainder rather than truncating silently', () => {
    const cards = Array.from({ length: 7 }, (_, index) => ({ source: 'media', word: `ねこ${index}` }));
    const result = selectAutoAudioCards(cards, { ...on, maxPerBatch: 3 });
    expect(result.chosen).toHaveLength(3);
    expect(result.deferred).toBe(4);
    expect(result.skipped).toBe(0);
  });

  it('honours one family being on while another is off', () => {
    const result = selectAutoAudioCards([
      { source: 'epub', word: 'ねこ' },
      { source: 'media', word: 'いぬ' },
    ], { ...DEFAULT_AUTO_AUDIO_PREFERENCES, epub: true });
    expect(result.chosen.map((card) => card.word)).toEqual(['ねこ']);
    expect(result.skipped).toBe(1);
  });
});

describe('every study language is speakable in its own voice', () => {
  it('Chinese needs hanzi, Russian Cyrillic, Japanese kana or kanji', async () => {
    const { isSpeakableIn } = await import('../flashcardAutoAudio');
    expect(isSpeakableIn('你好', 'zh')).toBe(true);
    expect(isSpeakableIn('Привет', 'ru')).toBe(true);
    expect(isSpeakableIn('Привет', 'ja')).toBe(false);
    expect(isSpeakableIn('ねこ', 'ja')).toBe(true);
  });
});
