// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FIELD_SEP, type AnkiModels } from '../apkgParse';
import { deckLabel, notesToCards, parseTags, resolveFieldRoles } from '../apkgCards';

/**
 * Mapping Anki notes onto study cards.
 *
 * The case that matters is field ORDER: a deck whose fields run
 * Meaning/Term/Reading must not import the meaning as the studied word. A
 * fixture whose fields are already in the obvious order cannot fail that, so
 * every model below is deliberately shuffled.
 */

const models: AnkiModels = {
  // Fields deliberately out of the conventional order.
  '1': {
    name: 'Vocab',
    flds: [
      { name: 'Meaning', ord: 0 },
      { name: 'Expression', ord: 1 },
      { name: 'Reading', ord: 2 },
      { name: 'Sentence', ord: 3 },
    ],
  },
  // Two-field Front/Back, the most common shape of all.
  '2': { name: 'Basic', flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }] },
  // No recognisable names at all — positional fallback territory.
  '3': { name: 'Odd', flds: [{ name: 'A', ord: 0 }, { name: 'B', ord: 1 }] },
};

const note = (mid: string, fields: string[], extra: Record<string, unknown> = {}) => ({
  mid,
  flds: fields.join(FIELD_SEP),
  ...extra,
});

describe('resolveFieldRoles', () => {
  it('finds the term by name, not by position', () => {
    const roles = resolveFieldRoles(models['1']);
    expect(roles.word).toBe(1);
    expect(roles.reading).toBe(2);
    expect(roles.meaning).toBe(0);
    expect(roles.sentence).toBe(3);
  });

  it('maps a two-field Front/Back note', () => {
    const roles = resolveFieldRoles(models['2']);
    expect(roles.word).toBe(0);
    expect(roles.meaning).toBe(1);
    expect(roles.reading).toBe(-1);
    expect(roles.sentence).toBe(-1);
  });

  it('never assigns one field to two roles', () => {
    for (const model of Object.values(models)) {
      const roles = resolveFieldRoles(model);
      const used = [roles.word, roles.reading, roles.meaning, roles.sentence].filter((o) => o >= 0);
      expect(new Set(used).size).toBe(used.length);
    }
  });

  it('reports absent roles as -1 rather than guessing', () => {
    // 'A'/'B' match no synonym; only the two-field Front/Back fallback applies.
    const roles = resolveFieldRoles(models['3']);
    expect(roles.reading).toBe(-1);
    expect(roles.sentence).toBe(-1);
  });
});

describe('notesToCards', () => {
  it('maps a note onto word/reading/meaning/sentence', () => {
    const { cards, noteCount } = notesToCards(
      [note('1', ['to eat', '食べる', 'たべる', '寿司を食べる。'])],
      models,
    );
    expect(noteCount).toBe(1);
    expect(cards).toEqual([
      { word: '食べる', reading: 'たべる', meaning: 'to eat', sentence: '寿司を食べる。' },
    ]);
  });

  it('strips HTML, sound tags and bracket furigana', () => {
    const { cards } = notesToCards(
      [note('1', ['<b>to eat</b>', '食べる[たべる]', 'たべる', '[sound:a.mp3]寿司を食べる。'])],
      models,
    );
    expect(cards[0].word).toBe('食べる');
    expect(cards[0].meaning).toBe('to eat');
    expect(cards[0].sentence).toBe('寿司を食べる。');
  });

  it('drops notes whose expression field is empty', () => {
    const { cards, noteCount } = notesToCards(
      [note('1', ['orphan meaning', '', '', '']), note('1', ['to eat', '食べる', 'たべる', ''])],
      models,
    );
    // Both scanned; only one became a card.
    expect(noteCount).toBe(2);
    expect(cards).toHaveLength(1);
    expect(cards[0].word).toBe('食べる');
  });

  it('collapses duplicate word+reading pairs', () => {
    // A deck with separate recognition and production notes for one word.
    const { cards, noteCount } = notesToCards(
      [
        note('1', ['to eat', '食べる', 'たべる', '']),
        note('1', ['to eat (produce)', '食べる', 'たべる', '']),
      ],
      models,
    );
    expect(noteCount).toBe(2);
    expect(cards).toHaveLength(1);
  });

  it('keeps homographs apart when their readings differ', () => {
    const { cards } = notesToCards(
      [note('1', ['now', '今日', 'きょう', '']), note('1', ['these days', '今日', 'こんにち', ''])],
      models,
    );
    expect(cards).toHaveLength(2);
  });

  it('carries the deck name and tags through', () => {
    const { cards } = notesToCards(
      [note('1', ['to eat', '食べる', 'たべる', ''], { deck: 'Core::Stage 1', tags: ' verb  n5 ' })],
      models,
    );
    expect(cards[0].deck).toBe('Core::Stage 1');
    expect(cards[0].tags).toEqual(['verb', 'n5']);
  });

  it('handles a model it has never seen without throwing', () => {
    const { cards } = notesToCards([note('999', ['食べる', 'to eat'])], models);
    expect(cards).toHaveLength(1);
    expect(cards[0].word).toBe('食べる');
  });
});

describe('parseTags', () => {
  it('splits on whitespace and drops empties', () => {
    expect(parseTags('  verb   n5 ')).toEqual(['verb', 'n5']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
  });
});

describe('deckLabel', () => {
  it('keeps the last two segments of a nested deck', () => {
    expect(deckLabel('Japanese::Core 2k::Stage 1', 'x')).toBe('Core 2k / Stage 1');
  });

  it('passes a flat deck name through', () => {
    expect(deckLabel('Core 2k', 'x')).toBe('Core 2k');
  });

  it('falls back when the collection carries no usable name', () => {
    expect(deckLabel(undefined, 'core2k')).toBe('core2k');
    expect(deckLabel('   ', 'core2k')).toBe('core2k');
    expect(deckLabel('::', 'core2k')).toBe('core2k');
  });
});
