// @vitest-environment jsdom
//
// Auto-narration speaks each card in its own language: a Chinese card with a
// Chinese voice, a Russian card with a Russian one, a stored card with no
// language (the old format) in Japanese.
import { beforeEach, describe, expect, it } from 'vitest';
import { addDeckCardsTracked } from '../flashcardDeck';
import { narrateNewCards } from '../flashcardAutoAudio';
import { DEFAULT_AUTO_AUDIO_PREFERENCES } from '../../shared/flashcardAutoAudio';

const spoken: { text: string; lang: string }[] = [];

beforeEach(() => {
  localStorage.clear();
  spoken.length = 0;
  (window as unknown as { api: unknown }).api = {
    flashcardSynthesizeAudio: async (text: string, lang: string) => {
      spoken.push({ text, lang });
      return { ok: true, path: `C:/audio/${spoken.length}.wav` };
    },
  };
});

describe('narrateNewCards', () => {
  it('uses the card language for the voice', async () => {
    const created = addDeckCardsTracked([
      { word: '你好', reading: '', meaning: 'hello', source: 'epub', studyLang: 'zh' },
      { word: 'привет', reading: '', meaning: 'hi', source: 'epub', studyLang: 'ru' },
      { word: '猫', reading: '', meaning: 'cat', source: 'epub' },
    ]);
    const report = await narrateNewCards(created, { ...DEFAULT_AUTO_AUDIO_PREFERENCES, epub: true });
    expect(report).toMatchObject({ added: 3, failed: 0 });
    expect(spoken.map((entry) => entry.lang)).toEqual(['zh', 'ru', 'ja']);
  });
});
