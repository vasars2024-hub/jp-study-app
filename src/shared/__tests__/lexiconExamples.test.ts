import { describe, expect, it } from 'vitest';
import {
  containsExampleQuery,
  exampleBodyKey,
  selectLexiconExamples,
  splitExampleText,
  type LexiconExampleCandidate,
} from '../lexiconExamples';

const candidate = (text: string, over: Partial<LexiconExampleCandidate> = {}): LexiconExampleCandidate => ({
  exampleId: 1,
  lang: 'jpn',
  text,
  dictId: 'tatoeba',
  dictTitle: 'Tatoeba',
  ...over,
});

describe('containsExampleQuery', () => {
  it('matches through the same fold the SQL scan uses', () => {
    expect(containsExampleQuery('猫が好きです。', '猫')).toBe(true);
    expect(containsExampleQuery('ＣＡＴが好き', 'cat')).toBe(true);
    expect(containsExampleQuery('犬が走る。', '猫')).toBe(false);
    expect(containsExampleQuery('猫が好きです。', '  ')).toBe(false);
  });
});

describe('exampleBodyKey', () => {
  it('strips the punctuation that dresses a bare word as a sentence', () => {
    expect(exampleBodyKey('猫。')).toBe(exampleBodyKey('猫'));
    expect(exampleBodyKey('Cat.')).toBe(exampleBodyKey('cat'));
    expect(exampleBodyKey('「猫」')).toBe(exampleBodyKey('猫'));
  });

  it('leaves a real sentence distinguishable from its own words', () => {
    expect(exampleBodyKey('猫が好きです。')).not.toBe(exampleBodyKey('猫'));
  });
});

describe('splitExampleText', () => {
  it('marks every occurrence of the query', () => {
    expect(splitExampleText('猫と猫', '猫')).toEqual([
      { text: '猫', match: true },
      { text: 'と', match: false },
      { text: '猫', match: true },
    ]);
  });

  // A row matched only after folding is still a correct row; underlining a span
  // the reader cannot see would be the dishonest option.
  it('claims no span when the query is not literally present', () => {
    expect(splitExampleText('ＣＡＴが好き', 'cat')).toEqual([{ text: 'ＣＡＴが好き', match: false }]);
  });
});

describe('selectLexiconExamples', () => {
  it('orders shortest first and keeps scan order within a length', () => {
    const chosen = selectLexiconExamples('猫', [
      candidate('その大きな黒い猫はとても静かに眠っています。', { exampleId: 1 }),
      candidate('猫が鳴く。', { exampleId: 2 }),
      candidate('猫が走る。', { exampleId: 3 }),
    ]);
    expect(chosen.map((item) => item.exampleId)).toEqual([2, 3, 1]);
  });

  it('drops rows that do not contain the query and rows that are only the query', () => {
    const chosen = selectLexiconExamples('猫', [
      candidate('猫。', { exampleId: 1 }),
      candidate('犬が走る。', { exampleId: 2 }),
      candidate('猫が走る。', { exampleId: 3 }),
    ]);
    expect(chosen.map((item) => item.exampleId)).toEqual([3]);
  });

  it('collapses the same sentence from two corpora onto the first attribution', () => {
    const chosen = selectLexiconExamples('猫', [
      candidate('猫が走る。', { exampleId: 1, dictId: 'tatoeba', dictTitle: 'Tatoeba' }),
      candidate('猫が走る。', { exampleId: 2, dictId: 'other', dictTitle: 'Other' }),
    ]);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].dictId).toBe('tatoeba');
  });

  it('honours a caller limit and clamps a nonsense one', () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      candidate(`猫が走る${'。'.repeat(index + 1)}`, { exampleId: index + 1 }));
    expect(selectLexiconExamples('猫', rows, 3)).toHaveLength(3);
    expect(selectLexiconExamples('猫', rows, 0)).toHaveLength(1);
    expect(selectLexiconExamples('猫', rows, 999)).toHaveLength(8);
  });
});
