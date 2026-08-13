import { describe, expect, it } from 'vitest';
import {
  MAX_ROUND_TRIP_WORDS,
  diffLexiconRoundTrip,
  pinnedVocabularyKeys,
} from '../lexiconRoundTrip';
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

/** 猫を見た。 as the offline pipeline grounds it, with 見る optionally pinned. */
function catSaw(pinnedSense?: number): LexiconInterlinearResult {
  return passage([
    token('猫', 0, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
    { kind: 'separator', text: 'を', start: 1, end: 2 },
    token('見た', 2, {
      text: '見る',
      reading: 'みる',
      via: 'deinflected',
      glosses: [{ lang: 'en', text: 'to see' }],
      ...(pinnedSense === undefined ? {} : { pinnedSense }),
    }),
  ]);
}

describe('pinnedVocabularyKeys', () => {
  it('names nothing when the reader pinned nothing', () => {
    expect(pinnedVocabularyKeys(catSaw()).size).toBe(0);
  });

  it('names the pinned headword, not the surface form it appeared as', () => {
    const keys = [...pinnedVocabularyKeys(catSaw(2))];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain('見る');
    expect(keys[0]).not.toContain('見た');
  });
});

describe('diffLexiconRoundTrip', () => {
  it('reports every word as kept when the round trip came back with the same lemmas', () => {
    // A different surface form of the same headword is the same word: the round
    // trip is allowed to conjugate differently without that reading as a loss.
    const back = passage([
      token('猫', 0, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
      { kind: 'separator', text: 'を', start: 1, end: 2 },
      token('見ました', 2, { text: '見る', reading: 'みる', via: 'deinflected' }),
    ]);
    const diff = diffLexiconRoundTrip(catSaw(), back);
    expect(diff.kept.total).toBe(2);
    expect(diff.lost.total).toBe(0);
    expect(diff.added.total).toBe(0);
    expect(diff.retention).toBe(1);
    expect(diff.comparable).toBe(true);
  });

  it('separates the word that did not come back from the one the round trip introduced', () => {
    const back = passage([
      token('犬', 0, { text: '犬', reading: 'いぬ', glosses: [{ lang: 'en', text: 'dog' }] }),
      { kind: 'separator', text: 'を', start: 1, end: 2 },
      token('見た', 2, { text: '見る', reading: 'みる', via: 'deinflected' }),
    ]);
    const diff = diffLexiconRoundTrip(catSaw(), back);
    expect(diff.kept.words.map((word) => word.text)).toEqual(['見る']);
    expect(diff.lost.words.map((word) => word.text)).toEqual(['猫']);
    expect(diff.added.words.map((word) => word.text)).toEqual(['犬']);
    expect(diff.retention).toBeCloseTo(0.5);
  });

  it('carries the reader glosses from the side each word was actually found on', () => {
    const back = passage([
      token('犬', 0, { text: '犬', reading: 'いぬ', glosses: [{ lang: 'en', text: 'dog' }] }),
    ]);
    const diff = diffLexiconRoundTrip(catSaw(), back);
    expect(diff.lost.words[0].glosses).toEqual(['cat']);
    expect(diff.added.words[0].glosses).toEqual(['dog']);
  });

  it('flags a pinned word that did not survive, and sorts it to the front of the bucket', () => {
    // 見る is pinned and lost; 猫 is only lost. Frequency order would put 猫
    // first — the reader's own choice outranks it.
    const original = passage([
      token('猫', 0, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
      { kind: 'separator', text: 'と', start: 1, end: 2 },
      token('猫', 2, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
      { kind: 'separator', text: 'を', start: 3, end: 4 },
      token('見た', 4, { text: '見る', reading: 'みる', via: 'deinflected', pinnedSense: 2 }),
    ]);
    const back = passage([
      token('犬', 0, { text: '犬', reading: 'いぬ', glosses: [{ lang: 'en', text: 'dog' }] }),
    ]);
    const diff = diffLexiconRoundTrip(original, back);
    expect(diff.lost.words.map((word) => word.text)).toEqual(['見る', '猫']);
    expect(diff.lost.words[0].pinned).toBe(true);
    expect(diff.lost.words[1].pinned).toBe(false);
    expect(diff.pinnedLost).toBe(1);
  });

  it('does not count a pinned word that came back as lost', () => {
    const back = passage([token('見る', 0, { text: '見る', reading: 'みる' })]);
    const diff = diffLexiconRoundTrip(catSaw(2), back);
    expect(diff.pinnedLost).toBe(0);
    expect(diff.kept.words.map((word) => word.text)).toEqual(['見る']);
  });

  it('keeps a homograph with a different reading distinct rather than calling it survived', () => {
    const original = passage([
      token('生', 0, { text: '生', reading: 'なま', glosses: [{ lang: 'en', text: 'raw' }] }),
    ]);
    const back = passage([
      token('生', 0, { text: '生', reading: 'せい', glosses: [{ lang: 'en', text: 'life' }] }),
    ]);
    const diff = diffLexiconRoundTrip(original, back);
    expect(diff.kept.total).toBe(0);
    expect(diff.lost.words[0].reading).toBe('なま');
    expect(diff.added.words[0].reading).toBe('せい');
  });

  it('excludes words no dictionary knows from the comparison and counts them instead', () => {
    // Two different unknown words would compare as strings only; counting them
    // as a loss or a survival would both be inventions.
    const original = passage([
      token('猫', 0, { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
      { kind: 'separator', text: 'と', start: 1, end: 2 },
      token('ヌルポ', 2),
    ]);
    const back = passage([
      token('猫', 0, { text: '猫', reading: 'ねこ' }),
      { kind: 'separator', text: 'と', start: 1, end: 2 },
      token('ガッ', 2),
    ]);
    const diff = diffLexiconRoundTrip(original, back);
    expect(diff.originalCount).toBe(1);
    expect(diff.roundTripCount).toBe(1);
    expect(diff.kept.total).toBe(1);
    expect(diff.lost.total).toBe(0);
    expect(diff.added.total).toBe(0);
    expect(diff.ungrounded).toEqual({ original: 1, roundTrip: 1 });
    expect(diff.retention).toBe(1);
  });

  it('says nothing is comparable when the round trip grounded no word at all', () => {
    const diff = diffLexiconRoundTrip(catSaw(), passage([token('ヌルポ', 0)]));
    expect(diff.comparable).toBe(false);
    expect(diff.retention).toBe(0);
    expect(diff.lost.total).toBe(2);
  });

  it('caps each rendered bucket but keeps the total it was capped from', () => {
    const parts: LexiconInterlinearPart[] = [];
    for (let i = 0; i < MAX_ROUND_TRIP_WORDS + 5; i += 1) {
      parts.push(token(`語${i}`, i * 2, { text: `語${i}`, reading: `よみ${i}` }));
      parts.push({ kind: 'separator', text: 'と', start: i * 2 + 1, end: i * 2 + 2 });
    }
    const diff = diffLexiconRoundTrip(passage(parts), passage([token('ヌルポ', 0)]));
    expect(diff.lost.total).toBe(MAX_ROUND_TRIP_WORDS + 5);
    expect(diff.lost.words).toHaveLength(MAX_ROUND_TRIP_WORDS);
  });

  it('treats an empty round trip as everything lost rather than as a division by zero', () => {
    const diff = diffLexiconRoundTrip(catSaw(), passage([]));
    expect(diff.retention).toBe(0);
    expect(diff.kept.total).toBe(0);
    expect(diff.lost.total).toBe(2);
    expect(diff.comparable).toBe(false);
  });

  it('reports a retention of zero, not NaN, when the passage itself grounded nothing', () => {
    const diff = diffLexiconRoundTrip(passage([token('ヌルポ', 0)]), catSaw());
    expect(diff.retention).toBe(0);
    expect(diff.originalCount).toBe(0);
    expect(diff.added.total).toBe(2);
    expect(diff.comparable).toBe(false);
  });
});
