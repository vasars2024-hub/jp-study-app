/**
 * A pasted list without a header row (round-4 journeys audit, packaged app): pasting
 * "猫<TAB>cat / 犬<TAB>dog / 鳥<TAB>bird" into Flashcards ▸ Import deck made three cards whose
 * READING was "cat" and whose meaning was empty — the second column was mapped by position —
 * so Write then said "This deck has none" of cards with a word and a meaning.
 */
import { describe, expect, it } from 'vitest';
import { parseCsvText } from '../csvEditor';
import { guessColumnMapping, rowsToDeckEntries } from '../deckImport';

function entries(raw: string) {
  const table = parseCsvText(raw);
  return rowsToDeckEntries(table, guessColumnMapping(table.headers, table.rows), 'd', 'import');
}

describe('headerless deck paste', () => {
  it('word + meaning', () => {
    const e = entries('猫\tcat\n犬\tdog\n鳥\tbird');
    expect(e.map((x) => [x.word, x.reading, x.meaning])).toEqual([
      ['猫', '', 'cat'],
      ['犬', '', 'dog'],
      ['鳥', '', 'bird'],
    ]);
  });

  it('word + kana reading + meaning, in either order', () => {
    expect(entries('猫\tねこ\tcat\n犬\tいぬ\tdog')[0]).toMatchObject({ word: '猫', reading: 'ねこ', meaning: 'cat' });
    expect(entries('猫\tcat\tねこ\n犬\tdog\tいぬ')[0]).toMatchObject({ word: '猫', reading: 'ねこ', meaning: 'cat' });
  });

  it('Chinese with pinyin and Russian with stress marks', () => {
    expect(entries('你好\tnǐ hǎo\thello\n谢谢\txiè xie\tthanks')[0]).toMatchObject({ reading: 'nǐ hǎo', meaning: 'hello' });
    expect(entries('кошка\tко́шка\tcat\nсобака\tсоба́ка\tdog')[0]).toMatchObject({ reading: 'ко́шка', meaning: 'cat' });
    expect(entries('кошка\tcat\nсобака\tdog')[0]).toMatchObject({ word: 'кошка', meaning: 'cat' });
  });

  it('named headers still win', () => {
    expect(entries('word,meaning,reading\n猫,cat,ねこ')[0]).toMatchObject({ word: '猫', reading: 'ねこ', meaning: 'cat' });
  });
});
