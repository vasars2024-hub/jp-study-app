import { describe, expect, it, vi } from 'vitest';
import {
  MAX_DIFFICULTY_WORDS,
  attachLexiconFrequency,
  scoreLexiconDifficulty,
} from '../lexiconDifficulty';
import type {
  LexiconInterlinearMatch,
  LexiconInterlinearPart,
  LexiconInterlinearResult,
  LexiconWordClass,
} from '../lexiconInterlinear';

function token(
  text: string,
  start: number,
  match?: Partial<LexiconInterlinearMatch>,
  wordClass?: LexiconWordClass,
): LexiconInterlinearPart {
  return {
    kind: 'token',
    text,
    start,
    end: start + text.length,
    ...(wordClass ? { pos: { tag: 'test', wordClass } } : {}),
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

/** The real ranks this installation's JPDB v2.2 list returns for these words. */
const JPDB: Record<string, number> = { 見る: 36, 猫: 1509, 面白い: 660, 学校: 616, 邂逅: 16703 };

const jpdb = (text: string) =>
  (JPDB[text] === undefined ? undefined : { rank: JPDB[text], source: 'Japanese frequency (JPDB v2.2)' });

describe('attachLexiconFrequency', () => {
  it('ranks the matched headword, not the surface the passage wrote', () => {
    const result = attachLexiconFrequency(
      passage([token('見た', 0, { text: '見る', reading: 'みる', via: 'deinflected' })]),
      jpdb,
    );
    const part = result.parts[0];
    expect(part.kind === 'token' && part.match?.frequency).toEqual({
      rank: 36,
      source: 'Japanese frequency (JPDB v2.2)',
    });
  });

  it('leaves a word no list ranks with no frequency at all, rather than a zero', () => {
    const result = attachLexiconFrequency(
      passage([token('田中', 0, { text: '田中', reading: 'たなか' })]),
      jpdb,
    );
    const part = result.parts[0];
    expect(part.kind === 'token' && 'frequency' in (part.match ?? {})).toBe(false);
  });

  it('asks the lists once per headword however often the passage repeats it', () => {
    const resolve = vi.fn(jpdb);
    attachLexiconFrequency(
      passage([
        token('猫', 0, { text: '猫', reading: 'ねこ' }),
        token('猫', 1, { text: '猫', reading: 'ねこ' }),
        token('見た', 2, { text: '見る', reading: 'みる', via: 'deinflected' }),
      ]),
      resolve,
    );
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('keeps the same spelling with two readings apart', () => {
    const resolve = vi.fn(() => undefined);
    attachLexiconFrequency(
      passage([
        token('生', 0, { text: '生', reading: 'なま' }),
        token('生', 1, { text: '生', reading: 'せい' }),
      ]),
      resolve,
    );
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('survives a list that throws, and still returns the readable passage', () => {
    const result = attachLexiconFrequency(
      passage([token('猫', 0, { text: '猫', reading: 'ねこ' })]),
      () => { throw new Error('unreadable list'); },
    );
    const part = result.parts[0];
    expect(part.kind === 'token' && part.match?.text).toBe('猫');
    expect(part.kind === 'token' && part.match?.frequency).toBeUndefined();
  });

  it('does not mutate the result it was given', () => {
    const original = passage([token('猫', 0, { text: '猫', reading: 'ねこ' })]);
    attachLexiconFrequency(original, jpdb);
    const part = original.parts[0];
    expect(part.kind === 'token' && part.match?.frequency).toBeUndefined();
  });
});

describe('scoreLexiconDifficulty', () => {
  const mixed = () => attachLexiconFrequency(
    passage([
      token('見た', 0, { text: '見る', reading: 'みる', via: 'deinflected' }),
      token('猫', 2, { text: '猫', reading: 'ねこ' }),
      token('邂逅', 3, { text: '邂逅', reading: 'かいこう' }),
      token('田中', 5, { text: '田中', reading: 'たなか' }),
      token('ヌルポ', 7),
    ]),
    jpdb,
  );

  it('sorts each ranked word into the band its rank falls in', () => {
    const bands = Object.fromEntries(
      scoreLexiconDifficulty(mixed()).bands.map((band) => [band.id, band.count]),
    );
    // 見る 36 and 猫 1509 straddle the core edge; 邂逅 16703 is past the last one.
    expect(bands).toEqual({ core: 1, common: 1, wider: 0, rare: 1 });
  });

  it('separates a word no list ranks from a word no dictionary knows', () => {
    const profile = scoreLexiconDifficulty(mixed());
    expect(profile.ranked).toBe(3);
    expect(profile.unranked).toBe(1);
    expect(profile.ungrounded).toBe(1);
    expect(profile.distinct).toBe(5);
    expect(profile.analyzed).toBe(false);
    expect(profile.functionWords).toBe(0);
  });

  it('sets analysed grammar aside instead of calling it easy vocabulary', () => {
    const profile = scoreLexiconDifficulty(attachLexiconFrequency(
      passage([
        token('猫', 0, { text: '猫', reading: 'ねこ' }, 'content'),
        token('を', 1, { text: 'を', reading: 'を' }, 'function'),
        token('見る', 2, { text: '見る', reading: 'みる' }, 'content'),
      ]),
      (text) => ({
        rank: text === 'を' ? 4 : (JPDB[text] ?? 100),
        source: 'Japanese frequency (JPDB v2.2)',
      }),
    ));

    expect(profile.analyzed).toBe(true);
    expect(profile.functionWords).toBe(1);
    expect(profile.distinct).toBe(2);
    expect(profile.ranked).toBe(2);
    expect(profile.hardest.map((word) => word.text)).toEqual(['猫', '見る']);
  });

  it('keeps an unknown analyser class in the profile', () => {
    const profile = scoreLexiconDifficulty(attachLexiconFrequency(
      passage([token('未知', 0, { text: '未知', reading: 'みち' }, 'other')]),
      () => ({ rank: 999, source: 'test list' }),
    ));

    expect(profile.analyzed).toBe(true);
    expect(profile.functionWords).toBe(0);
    expect(profile.ranked).toBe(1);
  });

  it('leads with the rarest word, which is what to look up first', () => {
    expect(scoreLexiconDifficulty(mixed()).hardest.map((word) => word.text))
      .toEqual(['邂逅', '猫', '見る']);
  });

  it('names every list that supplied a rank', () => {
    expect(scoreLexiconDifficulty(mixed()).sources).toEqual(['Japanese frequency (JPDB v2.2)']);
  });

  it('reports the middle rank of the ranked words', () => {
    expect(scoreLexiconDifficulty(mixed()).medianRank).toBe(1509);
  });

  it('averages the middle pair when the ranked count is even', () => {
    const profile = scoreLexiconDifficulty(attachLexiconFrequency(
      passage([
        token('学校', 0, { text: '学校', reading: 'がっこう' }),
        token('面白い', 2, { text: '面白い', reading: 'おもしろい' }),
      ]),
      jpdb,
    ));
    expect(profile.medianRank).toBe(638);
  });

  it('refuses to score a passage no list could speak for', () => {
    const profile = scoreLexiconDifficulty(passage([
      token('田中', 0, { text: '田中', reading: 'たなか' }),
    ]));
    expect(profile.scored).toBe(false);
    expect(profile.medianRank).toBeUndefined();
    expect(profile.hardest).toEqual([]);
  });

  it('counts a repeated word once', () => {
    const profile = scoreLexiconDifficulty(attachLexiconFrequency(
      passage([
        token('猫', 0, { text: '猫', reading: 'ねこ' }),
        token('猫', 1, { text: '猫', reading: 'ねこ' }),
        token('猫', 2, { text: '猫', reading: 'ねこ' }),
      ]),
      jpdb,
    ));
    expect(profile.ranked).toBe(1);
    expect(profile.hardest[0].count).toBe(3);
  });

  it('caps the hardest list while leaving the counts whole', () => {
    const parts = Array.from({ length: MAX_DIFFICULTY_WORDS + 5 }, (_, index) =>
      token(`語${index}`, index, { text: `語${index}`, reading: `ご${index}` }));
    const profile = scoreLexiconDifficulty(attachLexiconFrequency(
      passage(parts),
      (text) => ({ rank: 1_000 + Number(text.slice(1)), source: 'test list' }),
    ));
    expect(profile.hardest).toHaveLength(MAX_DIFFICULTY_WORDS);
    expect(profile.ranked).toBe(MAX_DIFFICULTY_WORDS + 5);
  });
});
