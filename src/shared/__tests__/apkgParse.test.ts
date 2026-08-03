import { describe, expect, it } from 'vitest';
import {
  FIELD_SEP,
  extractExpressions,
  looksLikeUpgradeStub,
  modelsFromNormalizedRows,
  parseModels,
  pickExpressionOrd,
  splitFields,
  stripFieldHtml,
  type AnkiModels,
} from '../apkgParse';

// A modern .apkg ships a decoy `collection.anki2` next to the real zstd
// `collection.anki21b`, holding one note that tells old clients to upgrade.
// Reading the decoy imports exactly one bogus word and looks like a successful
// import — this is what produced "1 cards → 1 words" on a real deck.
describe('legacy upgrade-stub detection', () => {
  it('flags the single-note upgrade decoy', () => {
    expect(
      looksLikeUpgradeStub(['Please update to the latest Anki version to view this deck.'], 1),
    ).toBe(true);
    expect(looksLikeUpgradeStub(['Update Anki to open this file'], 1)).toBe(true);
  });

  it('does not flag a real deck', () => {
    expect(looksLikeUpgradeStub(['食べる', '飲む', '新しい'], 3)).toBe(false);
    // A tiny real deck must still import, even at one note.
    expect(looksLikeUpgradeStub(['食べる'], 1)).toBe(false);
  });
});

describe('stripFieldHtml', () => {
  it('strips [sound:…] tags', () => {
    expect(stripFieldHtml('食べる[sound:tabe.mp3]')).toBe('食べる');
  });

  it('drops ruby readings, keeping base kanji', () => {
    expect(stripFieldHtml('<ruby>漢字<rt>かんじ</rt></ruby>')).toBe('漢字');
  });

  it('strips bracket furigana (漢字[かんじ] → 漢字)', () => {
    expect(stripFieldHtml('漢字[かんじ]')).toBe('漢字');
    expect(stripFieldHtml(' 食[た]べる')).toBe('食べる');
  });

  it('unwraps cloze deletions', () => {
    expect(stripFieldHtml('{{c1::勉強::study}}する')).toBe('勉強する');
  });

  it('removes remaining HTML and decodes entities', () => {
    expect(stripFieldHtml('<b>本</b>&amp;')).toBe('本 &');
    expect(stripFieldHtml('a&nbsp;b')).toBe('a b');
  });

  it('handles full-width brackets', () => {
    expect(stripFieldHtml('漢字［かんじ］')).toBe('漢字');
  });

  it('returns empty for empty/garbage', () => {
    expect(stripFieldHtml('')).toBe('');
    expect(stripFieldHtml('<br>')).toBe('');
  });
});

describe('models + field selection', () => {
  const modelsJson = JSON.stringify({
    '1': {
      name: 'jidoujisho Kinomoto',
      flds: [
        { name: 'Reading', ord: 0 },
        { name: 'Term', ord: 1 },
        { name: 'Meaning', ord: 2 },
      ],
    },
    '2': {
      name: 'Basic',
      flds: [
        { name: 'Front', ord: 0 },
        { name: 'Back', ord: 1 },
      ],
    },
    '3': {
      name: 'Weird',
      flds: [
        { name: 'Notes', ord: 0 },
        { name: 'Audio', ord: 1 },
      ],
    },
  });

  const models: AnkiModels = parseModels(modelsJson);

  it('parses models', () => {
    expect(Object.keys(models)).toEqual(['1', '2', '3']);
    expect(models['1'].flds[1].name).toBe('Term');
  });

  it('rebuilds models from modern normalized notetype fields', () => {
    const normalized = modelsFromNormalizedRows([
      { mid: '42', modelName: 'Word', ord: 1, fieldName: 'Reading' },
      { mid: '42', modelName: 'Word', ord: 0, fieldName: 'Expression' },
    ]);
    expect(normalized['42']).toEqual({
      name: 'Word',
      flds: [
        { name: 'Expression', ord: 0 },
        { name: 'Reading', ord: 1 },
      ],
    });
    expect(pickExpressionOrd(normalized['42'])).toBe(0);
  });

  it('picks the Term/Expression field even when it is not first', () => {
    expect(pickExpressionOrd(models['1'])).toBe(1); // Term at ord 1
  });

  it('picks Front for Basic notes', () => {
    expect(pickExpressionOrd(models['2'])).toBe(0);
  });

  it('falls back to field 0 when no expression-like field exists', () => {
    expect(pickExpressionOrd(models['3'])).toBe(0);
  });

  it('falls back to 0 for an unknown model', () => {
    expect(pickExpressionOrd(undefined)).toBe(0);
  });
});

describe('extractExpressions', () => {
  const models = parseModels(
    JSON.stringify({
      '1': {
        name: 'Vocab',
        flds: [
          { name: 'Reading', ord: 0 },
          { name: 'Expression', ord: 1 },
        ],
      },
    }),
  );

  const note = (reading: string, expr: string) => ({
    mid: '1',
    flds: [reading, expr].join(FIELD_SEP),
  });

  it('splitFields round-trips the separator', () => {
    expect(splitFields(`a${FIELD_SEP}b${FIELD_SEP}c`)).toEqual(['a', 'b', 'c']);
  });

  it('extracts the mapped expression field and dedupes exact repeats', () => {
    const notes = [
      note('たべる', '食べる'),
      note('たべる', '食べる[sound:x.mp3]'), // same after strip → deduped
      note('のむ', '飲む'),
    ];
    const { expressions, noteCount } = extractExpressions(notes, models);
    expect(expressions).toEqual(['食べる', '飲む']);
    expect(noteCount).toBe(3);
  });
});
