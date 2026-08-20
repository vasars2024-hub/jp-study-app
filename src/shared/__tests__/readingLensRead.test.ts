import { describe, expect, it } from 'vitest';
import {
  MAX_LENS_HARVEST_ITEMS,
  buildReadingLensPassage,
  harvestReadingLensVocabulary,
  type ReadingLensReadSourceLine,
  type ReadingLensReadToken,
} from '../readingLensRead';

function token(surface: string, over: Partial<ReadingLensReadToken> = {}): ReadingLensReadToken {
  return {
    surface,
    lemma: over.lemma ?? surface,
    content: over.content ?? true,
    proper: over.proper ?? false,
    pos: over.pos ?? '名詞',
    ...(over.reading !== undefined ? { reading: over.reading } : {}),
  };
}

function line(
  text: string,
  box: [number, number, number, number],
  over: Partial<ReadingLensReadSourceLine> = {},
): ReadingLensReadSourceLine {
  return {
    text,
    box,
    vertical: over.vertical ?? false,
    confidence: over.confidence ?? 0.9,
    tokens: over.tokens ?? [token(text)],
  };
}

describe('buildReadingLensPassage', () => {
  it('welds continuation lines into one paragraph and breaks on a sentence end', () => {
    const passage = buildReadingLensPassage([
      line('今日は天気が', [0, 0, 200, 20]),
      line('とてもよかった。', [0, 22, 200, 20]),
      line('明日も晴れるらしい。', [0, 44, 200, 20]),
    ]);

    expect(passage.paragraphs.map((p) => p.text)).toEqual([
      '今日は天気がとてもよかった。',
      '明日も晴れるらしい。',
    ]);
    expect(passage.lineCount).toBe(3);
    expect(passage.droppedLines).toBe(0);
  });

  it('breaks on a vertical gap wider than a line, with no sentence punctuation anywhere', () => {
    const passage = buildReadingLensPassage([
      line('見出しの行', [0, 0, 200, 20]),
      line('本文の始まり', [0, 80, 200, 20]),
      line('その続き', [0, 102, 200, 20]),
    ]);

    expect(passage.paragraphs.map((p) => p.text)).toEqual(['見出しの行', '本文の始まりその続き']);
  });

  it('reads the horizontal axis right to left for vertical columns', () => {
    const passage = buildReadingLensPassage([
      line('第一列のつづき', [180, 0, 20, 200], { vertical: true }),
      line('第二列', [156, 0, 20, 200], { vertical: true }),
      line('離れた列', [40, 0, 20, 200], { vertical: true }),
    ]);

    expect(passage.paragraphs.map((p) => p.text)).toEqual(['第一列のつづき第二列', '離れた列']);
  });

  it('breaks when the writing direction changes', () => {
    const passage = buildReadingLensPassage([
      line('よこがき', [0, 0, 200, 20]),
      line('たてがき', [0, 0, 20, 200], { vertical: true }),
    ]);

    expect(passage.paragraphs).toHaveLength(2);
  });

  it('separates Latin words across a weld but never CJK', () => {
    const latin = buildReadingLensPassage([
      line('the quick brown', [0, 0, 200, 20]),
      line('fox jumps', [0, 22, 200, 20]),
    ]);
    expect(latin.paragraphs[0].text).toBe('the quick brown fox jumps');

    const cjk = buildReadingLensPassage([
      line('日本語の', [0, 0, 200, 20]),
      line('文章です', [0, 22, 200, 20]),
    ]);
    expect(cjk.paragraphs[0].text).toBe('日本語の文章です');
  });

  it('drops empty lines and counts them rather than swallowing them', () => {
    const passage = buildReadingLensPassage([
      line('  ', [0, 0, 200, 20]),
      line('本文', [0, 22, 200, 20]),
      line('', [0, 44, 200, 20]),
    ]);

    expect(passage.lineCount).toBe(1);
    expect(passage.droppedLines).toBe(2);
    expect(passage.text).toBe('本文');
  });

  it('gives paragraphs offsets that slice the passage text back out', () => {
    const passage = buildReadingLensPassage([
      line('一つ目。', [0, 0, 200, 20]),
      line('二つ目。', [0, 22, 200, 20]),
      line('三つ目。', [0, 44, 200, 20]),
    ]);

    expect(passage.paragraphs).toHaveLength(3);
    for (const paragraph of passage.paragraphs) {
      expect(passage.text.slice(paragraph.start, paragraph.end)).toBe(paragraph.text);
    }
  });

  it('reports the worst line confidence a paragraph folded in', () => {
    const passage = buildReadingLensPassage([
      line('よい行の', [0, 0, 200, 20], { confidence: 0.95 }),
      line('わるい行', [0, 22, 200, 20], { confidence: 0.31 }),
    ]);

    expect(passage.paragraphs[0].confidence).toBeCloseTo(0.31, 5);
  });

  it('returns an empty passage rather than throwing on no lines', () => {
    const passage = buildReadingLensPassage([]);
    expect(passage.text).toBe('');
    expect(passage.paragraphs).toEqual([]);
    expect(passage.lineCount).toBe(0);
  });
});

describe('harvestReadingLensVocabulary', () => {
  it('groups inflected surfaces under one dictionary form and counts them', () => {
    const lines = [
      line('食べた', [0, 0, 200, 20], {
        tokens: [token('食べ', { lemma: '食べる', reading: 'タベ' }), token('た', { content: false })],
      }),
      line('食べる。', [0, 22, 200, 20], {
        tokens: [token('食べる', { lemma: '食べる', reading: 'タベル' })],
      }),
    ];
    const harvest = harvestReadingLensVocabulary(buildReadingLensPassage(lines), lines);

    expect(harvest.occurrences).toBe(2);
    expect(harvest.uniqueCount).toBe(2);
    const forms = harvest.items.map((row) => row.text);
    expect(forms).toContain('食べる');
  });

  it('does not merge two words that share a spelling but not a reading', () => {
    const lines = [
      line('生生', [0, 0, 200, 20], {
        tokens: [
          token('生', { lemma: '生', reading: 'ナマ' }),
          token('生', { lemma: '生', reading: 'セイ' }),
        ],
      }),
    ];
    const harvest = harvestReadingLensVocabulary(buildReadingLensPassage(lines), lines);

    expect(harvest.uniqueCount).toBe(2);
    expect(harvest.items.map((row) => row.reading).sort()).toEqual(['セイ', 'ナマ']);
  });

  it('skips particles and bare punctuation but keeps and flags a proper noun', () => {
    const lines = [
      line('熊本県が。', [0, 0, 200, 20], {
        tokens: [
          token('熊本県', { proper: true, reading: 'クマモトケン' }),
          token('が', { content: false, pos: '助詞' }),
          token('。', { content: true, pos: '記号' }),
        ],
      }),
    ];
    const harvest = harvestReadingLensVocabulary(buildReadingLensPassage(lines), lines);

    expect(harvest.occurrences).toBe(1);
    expect(harvest.items).toHaveLength(1);
    expect(harvest.items[0].text).toBe('熊本県');
    expect(harvest.items[0].proper).toBe(true);
  });

  it('orders by frequency and settles a tie by first appearance', () => {
    const lines = [
      line('猫犬猫鳥', [0, 0, 200, 20], {
        tokens: [token('猫'), token('犬'), token('猫'), token('鳥')],
      }),
    ];
    const harvest = harvestReadingLensVocabulary(buildReadingLensPassage(lines), lines);

    expect(harvest.items.map((row) => row.text)).toEqual(['猫', '犬', '鳥']);
    expect(harvest.items[0].count).toBe(2);
    expect(harvest.items[1].firstStart).toBeLessThan(harvest.items[2].firstStart);
  });

  it('caps the row list and says so without losing the true distinct count', () => {
    const tokens = Array.from({ length: 5 }, (_, i) => token(`語${i}`, { lemma: `語${i}` }));
    const lines = [line(tokens.map((tk) => tk.surface).join(''), [0, 0, 200, 20], { tokens })];
    const harvest = harvestReadingLensVocabulary(buildReadingLensPassage(lines), lines, 3);

    expect(harvest.items).toHaveLength(3);
    expect(harvest.uniqueCount).toBe(5);
    expect(harvest.capped).toBe(true);
    expect(MAX_LENS_HARVEST_ITEMS).toBeGreaterThan(3);
  });

  it('reports an empty harvest for a passage of nothing but particles', () => {
    const lines = [
      line('がのに', [0, 0, 200, 20], {
        tokens: [
          token('が', { content: false }),
          token('の', { content: false }),
          token('に', { content: false }),
        ],
      }),
    ];
    const harvest = harvestReadingLensVocabulary(buildReadingLensPassage(lines), lines);

    expect(harvest.items).toEqual([]);
    expect(harvest.occurrences).toBe(0);
    expect(harvest.uniqueCount).toBe(0);
    expect(harvest.capped).toBe(false);
  });

  it('caps stored surfaces without capping the count', () => {
    const tokens = Array.from({ length: 9 }, (_, i) =>
      token(`書${i}`, { lemma: '書く', reading: 'カク' }),
    );
    const lines = [line(tokens.map((tk) => tk.surface).join(''), [0, 0, 200, 20], { tokens })];
    const harvest = harvestReadingLensVocabulary(buildReadingLensPassage(lines), lines);

    expect(harvest.items).toHaveLength(1);
    expect(harvest.items[0].count).toBe(9);
    expect(harvest.items[0].surfaces).toHaveLength(6);
  });
});
