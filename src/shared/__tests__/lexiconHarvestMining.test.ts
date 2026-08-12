import { describe, expect, it } from 'vitest';
import { harvestLexiconVocabulary, type LexiconVocabularyItem } from '../lexiconHarvest';
import {
  buildHarvestMineRequest,
  canMineHarvestItem,
  harvestContextSentence,
} from '../lexiconHarvestMining';
import type {
  LexiconInterlinearMatch,
  LexiconInterlinearPart,
  LexiconInterlinearResult,
} from '../lexiconInterlinear';

function token(
  text: string,
  start: number,
  match?: Partial<LexiconInterlinearMatch>,
): LexiconInterlinearPart {
  return {
    kind: 'token',
    text,
    start,
    end: start + text.length,
    ...(match
      ? {
        match: {
          query: text,
          headwordId: 1,
          dictId: 'jmdict-en',
          dictTitle: 'JMdict (English)',
          text,
          reading: '',
          via: 'exact',
          score: 10,
          glosses: [],
          hasTargetGloss: false,
          ...match,
        },
      }
      : {}),
  };
}

function passage(parts: LexiconInterlinearPart[]): LexiconInterlinearResult {
  return {
    text: parts.map((part) => part.text).join(''),
    detectedLangs: ['ja'],
    glossLangs: ['en'],
    parts,
    tokenCount: parts.filter((part) => part.kind === 'token').length,
    matchedCount: parts.filter((part) => part.kind === 'token' && part.match).length,
    truncated: false,
  };
}

function itemFor(result: LexiconInterlinearResult, text: string): LexiconVocabularyItem {
  const item = harvestLexiconVocabulary(result).items.find((row) => row.text === text);
  if (!item) throw new Error(`no harvested row for ${text}`);
  return item;
}

describe('canMineHarvestItem', () => {
  it('refuses a row this installation has no answer for', () => {
    const result = passage([token('ヌルポ', 0)]);
    expect(canMineHarvestItem(itemFor(result, 'ヌルポ'))).toBe(false);
  });

  it('refuses a grounded row whose dictionary carries no gloss in the chosen targets', () => {
    const result = passage([token('猫', 0, { text: '猫', reading: 'ねこ' })]);
    expect(canMineHarvestItem(itemFor(result, '猫'))).toBe(false);
  });

  it('accepts a grounded row that actually has a gloss', () => {
    const result = passage([
      token('猫', 0, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
    ]);
    expect(canMineHarvestItem(itemFor(result, '猫'))).toBe(true);
  });
});

describe('harvestContextSentence', () => {
  it('slices the sentence the word first appeared in, not the whole passage', () => {
    const result = passage([
      token('犬', 0, { text: '犬', reading: 'いぬ', glosses: [{ lang: 'en', text: 'dog' }] }),
      { kind: 'separator', text: 'を見た。', start: 1, end: 5 },
      token('猫', 5, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
      { kind: 'separator', text: 'も見た。', start: 6, end: 10 },
    ]);

    expect(harvestContextSentence(itemFor(result, '犬'), result)).toBe('犬を見た。');
    expect(harvestContextSentence(itemFor(result, '猫'), result)).toBe('猫も見た。');
  });

  it('drops a context sentence that is only the word itself', () => {
    const result = passage([
      token('猫', 0, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
    ]);
    expect(harvestContextSentence(itemFor(result, '猫'), result)).toBeUndefined();
  });
});

describe('buildHarvestMineRequest', () => {
  it('routes exactly like a dictionary mine and carries the passage sentence', () => {
    const result = passage([
      token('食べた', 0, {
        text: '食べる',
        reading: 'たべる',
        via: 'deinflected',
        glosses: [{ lang: 'en', text: 'to eat' }, { lang: 'en', text: 'to live on' }],
        hasTargetGloss: true,
      }),
      { kind: 'separator', text: '。', start: 3, end: 4 },
    ]);

    const req = buildHarvestMineRequest(itemFor(result, '食べる'), result, { lang: 'ja' });
    expect(req.route).toEqual({ source: 'dictionary', cardKind: 'word', language: 'ja' });
    expect(req.term).toBe('食べる');
    expect(req.reading).toBe('たべる');
    expect(req.meaning).toBe('to eat; to live on');
    expect(req.sentence).toBe('食べた。');
    // The citation form is not in the sentence — cloze splitting needs the
    // inflected surface the passage actually wrote.
    expect(req.surface).toBe('食べた');
  });

  it('omits the surface when it is the term, the way the dictionary surface does', () => {
    const result = passage([
      token('猫', 0, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
      { kind: 'separator', text: 'を見た。', start: 1, end: 5 },
    ]);

    const req = buildHarvestMineRequest(itemFor(result, '猫'), result, { lang: 'ja' });
    expect(req.surface).toBeUndefined();
    expect(req.sentence).toBe('猫を見た。');
  });

  it('omits a reading that only repeats the headword', () => {
    const result = passage([
      token('ねこ', 0, { text: 'ねこ', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
      { kind: 'separator', text: 'を見た。', start: 2, end: 6 },
    ]);

    expect(buildHarvestMineRequest(itemFor(result, 'ねこ'), result, { lang: 'ja' }).reading)
      .toBeUndefined();
  });

  it('falls back to the text heuristic when the passage language is not a routable one', () => {
    const result = passage([
      token('猫', 0, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
      { kind: 'separator', text: 'を見た。', start: 1, end: 5 },
    ]);

    expect(buildHarvestMineRequest(itemFor(result, '猫'), result, { lang: 'auto' }).route?.language)
      .toBe('ja');
  });
});
