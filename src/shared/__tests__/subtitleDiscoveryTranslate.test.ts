import { describe, expect, it } from 'vitest';
import type { Cue } from '../subtitleCues';
import { parseSubtitles } from '../subtitleCues';
import {
  assembleTranslatedSrt,
  buildSubtitleTranslationPrompt,
  chunkTranslationUnits,
  contextBefore,
  extractJsonPayload,
  parseSubtitleTranslationReply,
  subtitleTranslationUnits,
  translationIsUsable,
} from '../subtitleDiscoveryTranslate';
import {
  normalizeSubtitleDiscoverySettings,
  planDiscoveryLanguages,
} from '../subtitleDiscoveryIpc';

const cues: Cue[] = [
  { start: 1, end: 2, text: '行くぞ！' },
  { start: 3, end: 4, text: '{\\an8}看板', style: 'Sign' },
  { start: 5, end: 6, text: '♪ 夢を見ていた ♪' },
  { start: 7, end: 8, text: '' },
  { start: 9, end: 10.5, text: '{\\i1}待って\\Nくれ{\\i0}' },
];

describe('subtitleTranslationUnits', () => {
  it('keeps dialogue only, cleaned, with sequential ids', () => {
    const units = subtitleTranslationUnits(cues);
    expect(units).toEqual([
      { id: '1', start: 1, end: 2, text: '行くぞ！' },
      { id: '2', start: 9, end: 10.5, text: '待って くれ' },
    ]);
  });
});

describe('prompting', () => {
  const units = Array.from({ length: 7 }, (_, i) => ({ id: String(i + 1), start: i, end: i + 1, text: `line ${i + 1}` }));

  it('chunks and gives each chunk the lines before it as context', () => {
    const chunks = chunkTranslationUnits(units, 3);
    expect(chunks.map((chunk) => chunk.length)).toEqual([3, 3, 1]);
    expect(contextBefore(units, chunks[0])).toEqual([]);
    expect(contextBefore(units, chunks[2], 2)).toEqual(['line 5', 'line 6']);
  });

  it('uses the chunk\'s own first id in the example and numbers every line', () => {
    const prompt = buildSubtitleTranslationPrompt(units.slice(3, 5), 'ja', 'en', ['earlier']);
    expect(prompt).toContain('[{"id":"4","text":"<English line>"}');
    expect(prompt).toContain('[4] line 4\n[5] line 5');
    expect(prompt).toContain('- earlier');
    expect(prompt).toMatch(/Japanese subtitle lines into English/);
  });

  it('asks for real Japanese when Japanese is the target', () => {
    expect(buildSubtitleTranslationPrompt(units.slice(0, 1), 'en', 'ja')).toMatch(/no romaji/);
  });
});

describe('reading replies', () => {
  const chunk = [
    { id: '1', start: 1, end: 2, text: '行くぞ！' },
    { id: '2', start: 9, end: 10.5, text: '待ってくれ' },
  ];

  it('reads a fenced array and ignores ids it did not ask about', () => {
    const reply = 'Sure:\n```json\n[{"id":"1","text":"\\"Let\'s go!\\""},{"id":"9","text":"stray"},{"id":"2","text":"Wait!"}]\n```';
    expect([...parseSubtitleTranslationReply(reply, chunk)]).toEqual([['1', "Let's go!"], ['2', 'Wait!']]);
  });

  it('reads the {results: [...]} shape a JSON-mode provider returns', () => {
    const reply = '{"results":[{"id":"2","text":"Wait for me"}]}';
    expect(parseSubtitleTranslationReply(reply, chunk).get('2')).toBe('Wait for me');
    expect(extractJsonPayload('<think>x</think> [1]')).toBe('[1]');
  });

  it('puts translations back on the source timing and drops lines with none', () => {
    const { srt, translated, total } = assembleTranslatedSrt(chunk, new Map([['2', 'Wait for me']]));
    expect(translated).toBe(1);
    expect(total).toBe(2);
    expect(parseSubtitles(srt)).toEqual([{ start: 9, end: 10.5, text: 'Wait for me' }]);
  });

  it('keeps a track only when most of it translated', () => {
    expect(translationIsUsable({ translated: 0, total: 0 })).toBe(false);
    expect(translationIsUsable({ translated: 2, total: 2 })).toBe(true);
    expect(translationIsUsable({ translated: 59, total: 100 })).toBe(false);
    expect(translationIsUsable({ translated: 60, total: 100 })).toBe(true);
  });
});

describe('planDiscoveryLanguages — the helper line never spends the library-wide quota', () => {
  const settings = { autoDownloadLanguages: ['ja'], helperLanguage: 'en' };

  it('a library sweep wants English but only downloads Japanese', () => {
    expect(planDiscoveryLanguages(settings, {})).toEqual({ languages: ['ja', 'en'], remote: ['ja'] });
  });

  it('a targeted request (a played episode) may download both', () => {
    expect(planDiscoveryLanguages(settings, { mediaIds: ['a'] })).toEqual({ languages: ['ja', 'en'], remote: ['ja', 'en'] });
    expect(planDiscoveryLanguages(settings, { mediaIds: ['a', 'b', 'c', 'd'] }).remote).toEqual(['ja']);
  });

  it('an explicit remote list is honoured but cannot add a language that was not wanted', () => {
    expect(planDiscoveryLanguages(settings, { languages: ['ja'], remoteLanguages: ['ja', 'en'] }))
      .toEqual({ languages: ['ja'], remote: ['ja'] });
  });

  it('no helper line means no helper language at all', () => {
    expect(planDiscoveryLanguages({ ...settings, helperLanguage: null }, {})).toEqual({ languages: ['ja'], remote: ['ja'] });
  });
});

describe('normalizeSubtitleDiscoverySettings — automation fields', () => {
  it('defaults them on for an old settings file', () => {
    expect(normalizeSubtitleDiscoverySettings({ autoDownloadLanguages: ['ja'] })).toMatchObject({
      helperLanguage: 'en', autoTranslate: true, translationEngine: 'auto', autoStudyTrack: true, dismissedNotices: [],
    });
  });

  it('keeps an explicit "no helper line" and rejects an unknown engine', () => {
    const out = normalizeSubtitleDiscoverySettings({
      helperLanguage: null, translationEngine: 'telepathy', autoTranslate: false, dismissedNotices: ['a', 'a', 7],
    });
    expect(out).toMatchObject({ helperLanguage: null, translationEngine: 'auto', autoTranslate: false, dismissedNotices: ['a'] });
  });
});
