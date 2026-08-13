import { describe, expect, it } from 'vitest';
import {
  MAX_CONCORDANCE_CITATIONS,
  findLexiconConcordance,
} from '../lexiconConcordance';

describe('personal lexicon concordance', () => {
  const terms = [
    { key: 'cat', text: '猫' },
    { key: 'see', text: '見る' },
  ];

  it('returns literal, source-addressed subtitle citations in library order', () => {
    expect(findLexiconConcordance(terms, [
      {
        mediaId: 'ep-2',
        title: 'Second episode',
        cues: [
          { start: 4, end: 6, text: '猫を見た。' },
          { start: 8, end: 9, text: '犬です。' },
        ],
      },
      {
        mediaId: 'ep-1',
        title: 'First episode',
        cues: [{ start: 1, end: 2, text: '見る猫' }],
      },
    ])).toEqual([
      {
        mediaId: 'ep-2', title: 'Second episode', start: 4, end: 6,
        text: '猫を見た。', terms: ['cat'],
      },
      {
        mediaId: 'ep-1', title: 'First episode', start: 1, end: 2,
        text: '見る猫', terms: ['cat', 'see'],
      },
    ]);
  });

  it('normalizes width and case but does not invent inflection matches', () => {
    const source = [{
      mediaId: 'm', title: 'Mine',
      cues: [
        { start: 0, end: 1, text: 'ＡＢＣ 猫' },
        { start: 1, end: 2, text: '見た' },
      ],
    }];
    expect(findLexiconConcordance([
      { key: 'ascii', text: 'abc' },
      { key: 'dictionary-form', text: '見る' },
    ], source)).toEqual([{
      mediaId: 'm', title: 'Mine', start: 0, end: 1,
      text: 'ＡＢＣ 猫', terms: ['ascii'],
    }]);
  });

  it('deduplicates equivalent terms and enforces the hard result cap', () => {
    const cues = Array.from({ length: MAX_CONCORDANCE_CITATIONS + 5 }, (_, index) => ({
      start: index,
      end: index + 1,
      text: '猫',
    }));
    const results = findLexiconConcordance([
      { key: 'first', text: '猫' },
      { key: 'duplicate', text: ' 猫 ' },
    ], [{ mediaId: 'm', title: 'Mine', cues }], 999);
    expect(results).toHaveLength(MAX_CONCORDANCE_CITATIONS);
    expect(results[0].terms).toEqual(['first']);
  });

  it('returns no citations for an empty term set', () => {
    expect(findLexiconConcordance([], [{
      mediaId: 'm', title: 'Mine', cues: [{ start: 0, end: 1, text: '猫' }],
    }])).toEqual([]);
  });
});
