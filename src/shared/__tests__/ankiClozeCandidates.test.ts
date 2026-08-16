import { describe, expect, it } from 'vitest';

import type { AnkiDraftNote, AnkiDraftNoteType } from '../ankiDraft';
import {
  clozeCandidate,
  clozeCandidates,
  emptyClozeCandidateTally,
  nextClozeOrdinal,
  type ClozeMatchMode,
} from '../ankiClozeCandidates';

const ALL_MODES: readonly ClozeMatchMode[] = ['exact', 'reading', 'stem'];

function noteType(kind: 'standard' | 'cloze', fieldNames: string[]): AnkiDraftNoteType {
  return {
    id: 'nt1',
    name: kind === 'cloze' ? 'Cloze' : 'Basic',
    kind,
    css: '',
    fields: fieldNames.map((name, ord) => ({ ord, name })),
    templates: [],
    sortFieldOrd: 0,
  } as unknown as AnkiDraftNoteType;
}

/** `normalized` is cloze-stripped in the real model, so fixtures strip too. */
function strip(raw: string): string {
  return raw
    .replace(/\{\{c\d+::/g, '')
    .replace(/\}\}/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function note(values: Record<string, string>, fieldNames: string[], id = 'n1'): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: fieldNames.map((name, ord) => ({
      ord,
      name,
      raw: values[name] ?? '',
      normalized: strip(values[name] ?? ''),
    })),
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
  } as unknown as AnkiDraftNote;
}

const FIELDS = ['Expression', 'Reading', 'Sentence'];

describe('clozeCandidate', () => {
  it('wraps an exact match and allocates c1 on a clean note', () => {
    const nt = noteType('cloze', FIELDS);
    const n = note({ Expression: '猫', Reading: 'ねこ', Sentence: '猫が好きです。' }, FIELDS);
    const c = clozeCandidate(n, nt, { modes: ALL_MODES });
    expect(c.outcome).toBe('ready');
    expect(c.matchedBy).toBe('exact');
    expect(c.span).toBe('猫');
    expect(c.ordinal).toBe(1);
    expect(c.raw).toBe('{{c1::猫}}が好きです。');
    expect(c.fieldName).toBe('Sentence');
  });

  // The refusal the whole module exists for: markers on a standard note type
  // render as literal braces, with no error anywhere.
  it('refuses a standard note type by name and proposes nothing', () => {
    const nt = noteType('standard', FIELDS);
    const n = note({ Expression: '猫', Reading: 'ねこ', Sentence: '猫が好きです。' }, FIELDS);
    const c = clozeCandidate(n, nt, { modes: ALL_MODES });
    expect(c.outcome).toBe('not-cloze');
    expect(c.raw).toBeUndefined();
    expect(c.ordinal).toBeUndefined();
  });

  it('falls back to the reading when the sentence holds kana, not the written form', () => {
    const nt = noteType('cloze', FIELDS);
    const n = note({ Expression: '綺麗', Reading: 'きれい', Sentence: 'とてもきれいです。' }, FIELDS);
    const c = clozeCandidate(n, nt, { modes: ALL_MODES });
    expect(c.outcome).toBe('ready');
    expect(c.matchedBy).toBe('reading');
    expect(c.raw).toBe('とても{{c1::きれい}}です。');
  });

  // The stated under-coverage: 食べました is matched, 食べ is wrapped.
  it('wraps the stem only on an inflected match, leaving the tail visible', () => {
    const nt = noteType('cloze', FIELDS);
    const n = note(
      { Expression: '食べる', Reading: 'たべる', Sentence: '昨日ケーキを食べました。' },
      FIELDS,
    );
    const c = clozeCandidate(n, nt, { modes: ALL_MODES });
    expect(c.outcome).toBe('ready');
    expect(c.matchedBy).toBe('stem');
    expect(c.span).toBe('食べ');
    expect(c.raw).toBe('昨日ケーキを{{c1::食べ}}ました。');
  });

  it('is a no-op on a second run over the same span', () => {
    const nt = noteType('cloze', FIELDS);
    const n = note(
      { Expression: '猫', Reading: 'ねこ', Sentence: '{{c1::猫}}が好きです。' },
      FIELDS,
    );
    const c = clozeCandidate(n, nt, { modes: ALL_MODES });
    expect(c.outcome).toBe('already');
    expect(c.raw).toBeUndefined();
  });

  it('allocates the next free ordinal note-wide, not per field', () => {
    const nt = noteType('cloze', ['Expression', 'Reading', 'Sentence', 'Notes']);
    const names = ['Expression', 'Reading', 'Sentence', 'Notes'];
    const n = note(
      { Expression: '猫', Reading: 'ねこ', Sentence: '猫が好きです。', Notes: '{{c4::補足}}' },
      names,
    );
    expect(nextClozeOrdinal(n)).toBe(5);
    expect(clozeCandidate(n, noteType('cloze', names), { modes: ALL_MODES }).ordinal).toBe(5);
  });

  // `normalized` sees the word, `raw` cannot be wrapped without editing markup.
  it('reports html-split rather than not-found when markup runs through the match', () => {
    const nt = noteType('cloze', FIELDS);
    const n = note({ Expression: '猫', Reading: 'ねこ', Sentence: '<b>猫</b>が好き' }, FIELDS);
    // The fixture's own premise: normalized contains the term, raw does not.
    expect(n.fields[2].normalized).toContain('猫');
    expect(n.fields[2].raw.includes('猫')).toBe(true);
    const split = note(
      { Expression: '食べる', Reading: 'たべる', Sentence: '食<b>べ</b>ました' },
      FIELDS,
    );
    const c = clozeCandidate(split, nt, { modes: ALL_MODES });
    expect(c.outcome).toBe('html-split');
    expect(c.raw).toBeUndefined();
    void n;
  });

  it('separates a genuinely absent word from an undecidable one', () => {
    const nt = noteType('cloze', FIELDS);
    const absent = note(
      { Expression: '食べる', Reading: 'たべる', Sentence: '犬が走った。' },
      FIELDS,
    );
    expect(clozeCandidate(absent, nt, { modes: ALL_MODES }).outcome).toBe('not-found');
    // Two-character verb: no stem is computable, so containment was never asked.
    const undecidable = note({ Expression: '出す', Reading: 'だす', Sentence: '手紙を出した。' }, FIELDS);
    expect(clozeCandidate(undecidable, nt, { modes: ALL_MODES }).outcome).toBe('unknown');
  });

  it('proposes nothing for a mode the run did not ask for', () => {
    const nt = noteType('cloze', FIELDS);
    const n = note(
      { Expression: '食べる', Reading: 'たべる', Sentence: '昨日ケーキを食べました。' },
      FIELDS,
    );
    expect(clozeCandidate(n, nt, { modes: ['exact'] }).outcome).toBe('not-found');
    expect(clozeCandidate(n, nt, { modes: [] }).outcome).toBe('not-found');
  });

  it('reports the missing half by name', () => {
    const nt = noteType('cloze', FIELDS);
    expect(
      clozeCandidate(note({ Expression: '猫', Reading: 'ねこ', Sentence: '' }, FIELDS), nt, {
        modes: ALL_MODES,
      }).outcome,
    ).toBe('no-sentence');
    expect(
      clozeCandidate(note({ Expression: '', Reading: '', Sentence: '猫が好き' }, FIELDS), nt, {
        modes: ALL_MODES,
      }).outcome,
    ).toBe('no-term');
  });
});

describe('clozeCandidates', () => {
  it('partitions the scan exactly and never guesses a missing note type', () => {
    const nt = noteType('cloze', FIELDS);
    const rows = [
      note({ Expression: '猫', Reading: 'ねこ', Sentence: '猫が好き' }, FIELDS, 'a'),
      note({ Expression: '食べる', Reading: 'たべる', Sentence: '犬が走った' }, FIELDS, 'b'),
      note({ Expression: '猫', Reading: 'ねこ', Sentence: '{{c1::猫}}が好き' }, FIELDS, 'c'),
    ];
    const orphan = { ...note({}, FIELDS, 'd'), noteTypeId: 'missing' } as AnkiDraftNote;
    const report = clozeCandidates([...rows, orphan], [nt], { modes: ALL_MODES });

    expect(report.notesScanned).toBe(4);
    const sum = Object.values(report.tally).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.notesScanned);
    expect(report.tally.ready).toBe(1);
    expect(report.tally['not-found']).toBe(1);
    expect(report.tally.already).toBe(1);
    // An unknown note type is refused as `not-cloze`; guessing `cloze` writes.
    expect(report.tally['not-cloze']).toBe(1);
  });

  it('empties to zeros across every outcome', () => {
    const tally = emptyClozeCandidateTally();
    expect(Object.values(tally).every((n) => n === 0)).toBe(true);
    expect(Object.keys(tally)).toHaveLength(8);
  });
});
