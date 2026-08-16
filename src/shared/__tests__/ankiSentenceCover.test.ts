// Sentence cards missing their own word — ANKI_DECK_WORKBENCH_PLAN.md Phase 7,
// recipe 16.
//
// The negative controls this file exists for:
//
//  1. **`cover:none` must not be "every note".** A plain `includes` would report
//     every inflected sentence as missing its word, which is the failure mode
//     that makes this filter useless. 食べる in 食べました must be `stem`.
//  2. **The stem must not be one character.** 手 would otherwise match any
//     sentence containing 手 and the filter would return the whole deck.
//  3. **A note type with no sentence field is not `none`.** Absent is not empty;
//     otherwise a vocabulary deck reports 100% broken sentence cards.
import { describe, expect, it } from 'vitest';
import {
  inflectionStem,
  parseSentenceCover,
  resolveSentenceField,
  sentenceCover,
} from '../ankiSentenceCover';
import { matchBrowserRows, parseBrowserQuery } from '../ankiBrowserQuery';
import type { BrowserRow } from '../ankiWorkbenchBrowser';

describe('sentenceCover', () => {
  it('reports the written form as exact', () => {
    expect(sentenceCover({ sentence: '毎日ごはんを食べる', term: '食べる' })).toBe('exact');
  });

  it('reports an inflected occurrence as stem, not none — control 1', () => {
    expect(sentenceCover({ sentence: '昨日ケーキを食べました', term: '食べる' })).toBe('stem');
    expect(sentenceCover({ sentence: '何も食べなかった', term: '食べる' })).toBe('stem');
    expect(sentenceCover({ sentence: '美しかった景色', term: '美しい' })).toBe('stem');
  });

  it('falls back to the note reading when the sentence is written in kana', () => {
    expect(
      sentenceCover({ sentence: 'いとなむ店', term: '営む', reading: 'いとなむ' }),
    ).toBe('reading');
  });

  it('ignores a reading that holds no kana, because that is a pinyin answer', () => {
    expect(sentenceCover({ sentence: 'shi tang', term: '食堂', reading: 'shí táng' })).toBe('unknown');
  });

  it('reports a genuinely absent word as none only when a stem was computable', () => {
    // 走り出す is 4 chars and inflects, so a stem exists and is absent.
    expect(sentenceCover({ sentence: '犬が歩いている', term: '走り出す' })).toBe('none');
    // 猫 does not inflect, so the module cannot decide and says so.
    expect(sentenceCover({ sentence: '犬が走っている', term: '猫' })).toBe('unknown');
    // A sentence card with no sentence is the case this recipe surfaces.
    expect(sentenceCover({ sentence: '', term: '猫' })).toBe('none');
  });

  it('refuses a stem shorter than two characters — control 2', () => {
    expect(inflectionStem('手')).toBeNull();
    expect(inflectionStem('見る')).toBeNull(); // stem would be the single 見
    expect(inflectionStem('食べる')).toBe('食べ');
    // Not an inflecting tail at all.
    expect(inflectionStem('日本語')).toBeNull();
    expect(sentenceCover({ sentence: '手を洗う', term: '手紙' })).toBe('unknown');
  });

  it('parses only the four modes it defines', () => {
    expect(parseSentenceCover('None')).toBe('none');
    expect(parseSentenceCover('stem')).toBe('stem');
    expect(parseSentenceCover('unknown')).toBe('unknown');
    expect(parseSentenceCover('broken')).toBeNull();
  });

  it('resolves the sentence field by name and never falls back to field 0', () => {
    expect(resolveSentenceField(['Expression', 'Example', 'Meaning'])).toBe('Example');
    expect(resolveSentenceField(['Expression', 'Meaning', 'Back'])).toBeNull();
  });
});

function rowOf(noteId: string, fields: Record<string, string>): BrowserRow {
  return {
    noteId,
    guid: `g-${noteId}`,
    noteTypeName: 'Vocab',
    deckNames: ['Core'],
    tags: [],
    marked: false,
    cardCount: 1,
    modifiedAtSec: 0,
    cells: {},
    fields,
    search: Object.values(fields).join(' ').toLowerCase(),
  };
}

const rows: BrowserRow[] = [
  rowOf('r-exact', { Expression: '食べる', Sentence: '毎日ごはんを食べる', Reading: 'たべる' }),
  rowOf('r-stem', { Expression: '食べる', Sentence: '昨日ケーキを食べました', Reading: 'たべる' }),
  rowOf('r-reading', { Expression: '営む', Sentence: 'いとなむ店', Reading: 'いとなむ' }),
  rowOf('r-none', { Expression: '走り出す', Sentence: '犬が歩いている', Reading: 'はしりだす' }),
  rowOf('r-unknown', { Expression: '猫', Sentence: '犬が走っている', Reading: 'ねこ' }),
  rowOf('r-empty', { Expression: '本', Sentence: '', Reading: 'ほん' }),
  // No sentence field at all — control 3.
  rowOf('r-nosentence', { Expression: '水', Meaning: 'water' }),
];

function ids(query: string): string[] {
  const parsed = parseBrowserQuery(query, { fieldNames: ['Expression', 'Sentence', 'Reading', 'Meaning'] });
  if (!parsed.ok) throw new Error('query did not parse: ' + parsed.error.code);
  return matchBrowserRows(rows, parsed.filter).map((r) => r.noteId);
}

describe('the cover: predicate', () => {
  it('partitions the rows that have a sentence field, and leaves the one that does not', () => {
    expect(ids('cover:exact')).toEqual(['r-exact']);
    expect(ids('cover:stem')).toEqual(['r-stem']);
    expect(ids('cover:reading')).toEqual(['r-reading']);
    // Control 3: `r-nosentence` is in none of the four buckets.
    expect(ids('cover:none')).toEqual(['r-none', 'r-empty']);
    expect(ids('cover:unknown')).toEqual(['r-unknown']);
    const partition = [
      ...ids('cover:exact'),
      ...ids('cover:stem'),
      ...ids('cover:reading'),
      ...ids('cover:none'),
      ...ids('cover:unknown'),
    ];
    expect(partition.length).toBe(rows.length - 1);
    expect(new Set(partition).size).toBe(partition.length);
  });

  it('accepts the field-scoped form and reads exactly that field', () => {
    expect(ids('Sentence:cover:stem')).toEqual(['r-stem']);
    // `Meaning` exists only on the row with no sentence, and it covers nothing.
    expect(ids('Meaning:cover:unknown')).toEqual(['r-nosentence']);
  });

  it('composes with the grammar already there, which is how the audit query is written', () => {
    expect(ids('-cover:exact cover:stem')).toEqual(['r-stem']);
  });

  it('refuses a mode it does not define rather than matching nothing silently', () => {
    const parsed = parseBrowserQuery('cover:broken', { fieldNames: ['Expression', 'Sentence'] });
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error.code).toBe('unknown-key');
  });
});
