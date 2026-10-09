import { describe, expect, it } from 'vitest';
import {
  acceptClipboardPassage,
  alignTranslation,
  capTranslationHistory,
  searchTranslationHistory,
  translationHistoryKey,
  translationMineFields,
  type TranslationHistoryLike,
} from '../translateWorkbench';
import {
  buildSentencePrompt,
  sanitizeTranslateSegments,
  sanitizeTranslateStyle,
  splitTranslationSentences,
} from '../translateCore';

describe('alignTranslation', () => {
  it('uses the pairs main reported when they describe the text on screen', () => {
    const reported = [
      { source: '猫が好き。', target: 'I like cats.' },
      { source: '犬も。', target: '' },
    ];
    expect(alignTranslation('猫が好き。犬も。', 'I like cats.', reported)).toEqual(reported);
  });

  it('ignores reported pairs for a different text and splits instead', () => {
    const stale = [{ source: '別の文。', target: 'Another.' }];
    expect(alignTranslation('猫が好き。犬も好き。', 'I like cats. I like dogs.', stale)).toEqual([
      { source: '猫が好き。', target: 'I like cats.' },
      { source: '犬も好き。', target: 'I like dogs.' },
    ]);
  });

  it('never guesses a zip when the sentence counts disagree', () => {
    expect(alignTranslation('猫が好き。犬も好き。', 'I like cats and dogs.')).toEqual([
      { source: '猫が好き。犬も好き。', target: 'I like cats and dogs.' },
    ]);
  });

  it('is empty until both sides exist', () => {
    expect(alignTranslation('', 'x')).toEqual([]);
    expect(alignTranslation('猫', '  ')).toEqual([]);
  });
});

function row(id: string, ts: number, extra: Partial<TranslationHistoryLike> = {}): TranslationHistoryLike {
  return { id, ts, sourceLang: 'ja', targetLang: 'en', sourceText: id, resultText: `${id}-out`, ...extra };
}

describe('history search, pins and cap', () => {
  it('matches every term across both sides, NFKC-folded, pinned first then newest', () => {
    const rows = [
      row('ｶﾀｶﾅ', 1, { resultText: 'katakana' }),
      row('カタカナ 2', 3, { resultText: 'Katakana again' }),
      row('other', 2, { pinned: true, resultText: 'KATAKANA pinned' }),
    ];
    expect(searchTranslationHistory(rows, 'カタカナ').map((r) => r.id)).toEqual(['カタカナ 2', 'ｶﾀｶﾅ']);
    expect(searchTranslationHistory(rows, 'katakana').map((r) => r.id)).toEqual(['other', 'カタカナ 2', 'ｶﾀｶﾅ']);
    expect(searchTranslationHistory(rows, 'katakana again').map((r) => r.id)).toEqual(['カタカナ 2']);
    expect(searchTranslationHistory(rows, '   ').map((r) => r.id)).toEqual(['other', 'カタカナ 2', 'ｶﾀｶﾅ']);
  });

  it('caps unpinned rows but never evicts a pinned one', () => {
    const rows = [row('a', 5), row('b', 4, { pinned: true }), row('c', 3), row('d', 2, { pinned: true }), row('e', 1)];
    expect(capTranslationHistory(rows, 3).map((r) => r.id)).toEqual(['a', 'b', 'd']);
    expect(capTranslationHistory(rows, 1).map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('keys a request by direction and trimmed source', () => {
    expect(translationHistoryKey(row(' 猫 ', 1))).toBe(translationHistoryKey(row('猫', 2)));
    expect(translationHistoryKey(row('猫', 1))).not.toBe(translationHistoryKey(row('猫', 1, { targetLang: 'ru' })));
  });
});

describe('clipboard watcher acceptance', () => {
  const base = { last: '', currentInput: '', sourceLang: 'ja' };
  it('takes new source-language text', () => {
    expect(acceptClipboardPassage('  猫が好きです。 ', base)).toBe('猫が好きです。');
  });
  it('refuses the seed, a repeat, the pane input and the result', () => {
    expect(acceptClipboardPassage('猫', { ...base, last: '猫' })).toBeNull();
    expect(acceptClipboardPassage('猫', { ...base, currentInput: '猫' })).toBeNull();
    expect(acceptClipboardPassage('I like cats.', { ...base, sourceLang: 'en', currentOutput: 'I like cats.' })).toBeNull();
  });
  it('refuses text with nothing in the source language, and very long pastes', () => {
    expect(acceptClipboardPassage('https://example.com/a', base)).toBeNull();
    expect(acceptClipboardPassage('猫'.repeat(2001), base)).toBeNull();
    expect(acceptClipboardPassage('Привет', { ...base, sourceLang: 'ru' })).toBe('Привет');
    expect(acceptClipboardPassage('hello', { ...base, sourceLang: 'ru' })).toBeNull();
  });
});

describe('translationMineFields', () => {
  it('a sentence or passage is a sentence card', () => {
    expect(translationMineFields('猫が好きです。', 'I like cats.')).toEqual({
      word: '猫が好きです。',
      meaning: 'I like cats.',
      sentence: '猫が好きです。',
      studyKind: 'sentence',
    });
  });
  it('a short phrase stays a vocabulary card', () => {
    expect(translationMineFields('猫', 'cat').studyKind).toBeUndefined();
  });
});

describe('translateCore style and segments', () => {
  it('the natural prompt is byte-identical to the pre-style prompt', () => {
    expect(buildSentencePrompt('猫。', 'ja', 'en', undefined, 'natural')).toBe(buildSentencePrompt('猫。', 'ja', 'en'));
    expect(buildSentencePrompt('猫。', 'ja', 'en')).toContain('text to English. Output ONLY');
  });
  it('the literal prompt asks for structure and still ends on the text', () => {
    const prompt = buildSentencePrompt('猫。', 'ja', 'en', undefined, 'literal');
    expect(prompt).toMatch(/to English as literally as possible/);
    expect(prompt.endsWith('Text: 猫。')).toBe(true);
  });
  it('sanitizes IPC input', () => {
    expect(sanitizeTranslateStyle('literal')).toBe('literal');
    expect(sanitizeTranslateStyle('<script>')).toBe('natural');
    expect(sanitizeTranslateSegments([{ source: 'a', target: 'b' }])).toEqual([{ source: 'a', target: 'b' }]);
    expect(sanitizeTranslateSegments([{ source: 'a' }])).toBeNull();
    expect(sanitizeTranslateSegments([])).toBeNull();
  });
  it('splits sentences the way the translator does', () => {
    expect(splitTranslationSentences('猫。\r\n犬！ 鳥?')).toEqual(['猫。', '犬！', '鳥?']);
  });
});
