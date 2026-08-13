import { describe, expect, it } from 'vitest';
import type { LexiconInterlinearResult, LexiconWordClass } from '../lexiconInterlinear';
import { checkLexiconComposition } from '../lexiconComposition';

function result(text: string, words: Array<{ text: string; wordClass?: LexiconWordClass }>): LexiconInterlinearResult {
  let cursor = 0;
  return {
    text, sourceLangs: ['ja'], glossLangs: ['en'], truncated: false,
    parts: words.map((word, index) => {
      const start = text.indexOf(word.text, cursor);
      const end = start + word.text.length;
      cursor = end;
      return {
        kind: 'token' as const, text: word.text, start, end,
        ...(word.wordClass ? { pos: { tag: 'test', wordClass: word.wordClass } } : {}),
        match: {
          query: word.text, headwordId: index, dictId: 'test', dictTitle: 'Test',
          text: word.text, reading: '', via: 'exact' as const, score: 1,
          glosses: [], hasTargetGloss: false,
        },
      };
    }),
  };
}

describe('Lexicon composition checking', () => {
  it('reports paired-mark and repeated-punctuation facts with source ranges', () => {
    expect(checkLexiconComposition(result('「猫！！）', [{ text: '猫' }])).issues).toEqual([
      { kind: 'unclosed-pair', start: 0, end: 1, text: '「' },
      { kind: 'repeated-punctuation', start: 2, end: 4, text: '！！' },
      { kind: 'unexpected-close', start: 4, end: 5, text: '）' },
    ]);
  });

  it('flags adjacent duplicate grammar only when both tokens are function words', () => {
    const checked = checkLexiconComposition(result('猫はは走る', [
      { text: '猫', wordClass: 'content' }, { text: 'は', wordClass: 'function' },
      { text: 'は', wordClass: 'function' }, { text: '走る', wordClass: 'content' },
    ]));
    expect(checked.analyzed).toBe(true);
    expect(checked.issues).toContainEqual({ kind: 'duplicate-function', start: 1, end: 3, text: 'はは' });
  });

  it('does not guess that an unanalysed repeated word is grammar', () => {
    const checked = checkLexiconComposition(result('母はは', [{ text: '母' }, { text: 'は' }, { text: 'は' }]));
    expect(checked).toEqual({ analyzed: false, issues: [] });
  });
});
