import { describe, expect, it } from 'vitest';
import {
  normalizeVoicePreferences,
  resolveVoice,
  voiceLanguageOf,
  voicesForLanguage,
  type FlashcardVoice,
} from '../flashcardVoices';

const voice = (id: string, culture: string): FlashcardVoice => ({
  id,
  name: id,
  culture,
  language: voiceLanguageOf(culture),
});

const HARUKA = voice('Microsoft Haruka Desktop', 'ja-JP');
const AYUMI = voice('Microsoft Ayumi', 'ja-JP');
const ZIRA = voice('Microsoft Zira Desktop', 'en-US');

describe('reading a culture tag', () => {
  it('takes the primary subtag whatever the separator or case', () => {
    expect(voiceLanguageOf('ja-JP')).toBe('ja');
    expect(voiceLanguageOf('ja_JP')).toBe('ja');
    expect(voiceLanguageOf('JA')).toBe('ja');
    expect(voiceLanguageOf('')).toBe('');
  });
});

describe('choosing the voice a card is spoken in', () => {
  it('uses the saved choice when it is still installed', () => {
    expect(resolveVoice([HARUKA, AYUMI, ZIRA], 'ja-JP', AYUMI.id))
      .toEqual({ voice: AYUMI, resolution: 'preferred' });
  });

  it('falls back within the language, and says that it did', () => {
    // A saved voice that has been uninstalled must not silently look like the
    // user's own choice on the next card.
    expect(resolveVoice([HARUKA, ZIRA], 'ja-JP', 'Microsoft Sayaka')).toEqual({
      voice: HARUKA,
      resolution: 'language',
      requested: 'Microsoft Sayaka',
    });
  });

  it('never crosses languages — the negative control for the whole feature', () => {
    // An English voice reading a Japanese sentence is not a degraded result, it
    // is a wrong one, and would be reported as working audio.
    expect(resolveVoice([ZIRA], 'ja-JP', 'Microsoft Haruka Desktop'))
      .toEqual({ voice: null, resolution: 'none' });
    expect(resolveVoice([ZIRA], 'ja-JP')).toEqual({ voice: null, resolution: 'none' });
    expect(resolveVoice([], 'ja-JP')).toEqual({ voice: null, resolution: 'none' });
  });

  it('treats no preference as the system default, not as a fallback', () => {
    // Otherwise an untouched setting would report itself as a failure.
    expect(resolveVoice([HARUKA, AYUMI], 'ja-JP')).toEqual({
      voice: HARUKA,
      resolution: 'preferred',
    });
    expect(resolveVoice([HARUKA, AYUMI], 'ja-JP', '   ').resolution).toBe('preferred');
  });

  it('lists only the voices that speak the language, in the OS order', () => {
    expect(voicesForLanguage([ZIRA, AYUMI, HARUKA], 'ja')).toEqual([AYUMI, HARUKA]);
    expect(voicesForLanguage([ZIRA], 'ja')).toEqual([]);
  });
});

describe('the stored per-language choice', () => {
  it('keeps only usable entries and normalises the key', () => {
    expect(normalizeVoicePreferences({ 'ja-JP': 'Haruka', zh: '  ', ru: 4 as never }))
      .toEqual({ ja: 'Haruka' });
    expect(normalizeVoicePreferences(null)).toEqual({});
    expect(normalizeVoicePreferences('nonsense' as never)).toEqual({});
  });
});
