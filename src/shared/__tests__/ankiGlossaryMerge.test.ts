import { describe, expect, it } from 'vitest';
import type { AnkiDraft, RawAnkiCollection, RawAnkiNoteTypeRow } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import { wrapEnrichProvenance } from '../ankiEnrich';
import {
  buildGlossarySource,
  decideGlossaryField,
  glossaryPlainText,
  glossarySenses,
  glossaryStrength,
  glossaryStrengthWinner,
  matchGlossaryEntry,
} from '../ankiGlossaryMerge';

const FIELDS = ['Expression', 'Meaning', 'Reading'];

function noteType(over: Partial<RawAnkiNoteTypeRow> = {}): RawAnkiNoteTypeRow {
  return {
    id: '1',
    name: 'Basic',
    fields: FIELDS.map((name, ord) => ({ name, ord })),
    templates: [{ ord: 0, name: 'Card 1', qfmt: '{{Expression}}', afmt: '{{Meaning}}' }],
    ...over,
  };
}

function draftOf(rows: string[][], types: RawAnkiNoteTypeRow[] = [noteType()]): AnkiDraft {
  const raw: RawAnkiCollection = {
    col: { ver: 11, crt: 0, mod: 0 },
    notes: rows.map((values, i) => ({
      id: String(100 + i),
      guid: `g${i}`,
      mid: '1',
      flds: values.join(ANKI_FIELD_SEP),
    })),
    cards: rows.map((_, i) => ({ id: String(500 + i), nid: String(100 + i), did: '1', ord: 0 })),
    decks: [{ id: '1', name: 'Glossary' }],
    noteTypes: types,
    revlog: [],
  };
  return buildAnkiDraft(raw, {
    source: { kind: 'apkg', label: 'glossary.apkg' },
    normalize: (v) => v.replace(/<[^>]*>/g, '').trim(),
  });
}

function sourceOf(rows: string[][], over: { keyField?: string; fieldNames?: string[] } = {}) {
  const draft = draftOf(rows);
  return buildGlossarySource({
    id: 'src-1',
    label: 'glossary.apkg',
    notes: draft.notes,
    noteTypes: draft.noteTypes,
    keyField: over.keyField ?? 'Expression',
    fieldNames: over.fieldNames ?? ['Meaning', 'Reading'],
  });
}

const ATTRIBUTED = wrapEnrichProvenance('cat; feline', ['JMdict (EN)'], 'inline');

describe('glossaryPlainText and glossarySenses', () => {
  it('strips the provenance wrapper rather than counting it as content', () => {
    expect(glossaryPlainText(ATTRIBUTED)).toBe('cat; feline');
    expect(glossarySenses(ATTRIBUTED)).toEqual(['cat', 'feline']);
  });

  it('splits on semicolons only, so a comma inside one gloss stays put', () => {
    expect(glossarySenses('cat, feline; tomcat')).toEqual(['cat, feline', 'tomcat']);
  });

  it('drops blank senses instead of returning empty strings', () => {
    expect(glossarySenses(' ; cat ;; ')).toEqual(['cat']);
    expect(glossarySenses('<br>')).toEqual([]);
  });
});

describe('glossaryStrength', () => {
  it('reads provenance, sense count and length off the same value', () => {
    expect(glossaryStrength(ATTRIBUTED)).toEqual({ attributed: true, senses: 2, length: 11 });
    expect(glossaryStrength('cat')).toEqual({ attributed: false, senses: 1, length: 3 });
  });

  it('decides on the first component that differs, in the stated order', () => {
    const attributedShort = glossaryStrength(wrapEnrichProvenance('cat', ['JMdict (EN)'], 'inline'));
    const bareLong = glossaryStrength('cat; feline; tomcat; a much longer gloss');
    // Provenance outranks both other components, even losing on both.
    expect(glossaryStrengthWinner(attributedShort, bareLong)).toBe('provenance');
    expect(glossaryStrengthWinner(bareLong, attributedShort)).toBeNull();
  });

  it('falls through provenance to senses, and senses to length', () => {
    expect(glossaryStrengthWinner(glossaryStrength('a; b'), glossaryStrength('a'))).toBe('senses');
    expect(glossaryStrengthWinner(glossaryStrength('cattt'), glossaryStrength('cat'))).toBe('length');
    expect(glossaryStrengthWinner(glossaryStrength('cat'), glossaryStrength('cat'))).toBeNull();
  });
});

describe('decideGlossaryField', () => {
  it('fill-empty writes into a blank field and never over an occupied one', () => {
    expect(decideGlossaryField('', 'cat', 'fill-empty')).toEqual({ outcome: 'write', value: 'cat' });
    expect(decideGlossaryField('<br>', 'cat', 'fill-empty')).toEqual({ outcome: 'write', value: 'cat' });
    // Even a far stronger incoming value is refused: this mode cannot lose text.
    expect(decideGlossaryField('x', ATTRIBUTED, 'fill-empty')).toEqual({ outcome: 'kept-occupied' });
  });

  it('an empty source is never a write, in any mode', () => {
    for (const mode of ['fill-empty', 'prefer-stronger', 'merge-senses'] as const) {
      expect(decideGlossaryField('cat', '  <br> ', mode).outcome).toBe('source-empty');
    }
  });

  it('prefer-stronger overwrites only when the incoming value wins outright', () => {
    expect(decideGlossaryField('cat', ATTRIBUTED, 'prefer-stronger')).toEqual({
      outcome: 'write',
      value: ATTRIBUTED,
    });
    expect(decideGlossaryField(ATTRIBUTED, 'cat', 'prefer-stronger')).toEqual({
      outcome: 'kept-stronger',
      strongerBy: 'provenance',
    });
    expect(decideGlossaryField('cat; feline', 'cat', 'prefer-stronger')).toEqual({
      outcome: 'kept-stronger',
      strongerBy: 'senses',
    });
  });

  it('a tie keeps the destination rather than rewriting it to the same strength', () => {
    // Different text, identical strength: two one-sense bare glosses of equal
    // length. Writing would churn the field for nothing — see the module header.
    expect(decideGlossaryField('cat', 'dog', 'prefer-stronger')).toEqual({ outcome: 'kept-equal' });
  });

  it('merge-senses appends what is missing and dedupes what is not', () => {
    expect(decideGlossaryField('cat', 'feline; cat', 'merge-senses')).toEqual({
      outcome: 'write',
      value: 'cat; feline',
    });
    // Normalized comparison: case and width fold, so `CAT` is not a new sense.
    expect(decideGlossaryField('cat; feline', 'CAT; Feline', 'merge-senses')).toEqual({
      outcome: 'nothing-to-add',
    });
  });

  it('merge-senses refuses markup and entities instead of splitting them', () => {
    expect(decideGlossaryField('cat<br>feline', 'tomcat', 'merge-senses')).toEqual({
      outcome: 'html-refused',
    });
    // The trap the refusal exists for: the `;` in `&nbsp;` is not a boundary.
    expect(decideGlossaryField('cat&nbsp;nap', 'tomcat', 'merge-senses')).toEqual({
      outcome: 'html-refused',
    });
    // The other two modes still work on exactly that value.
    expect(decideGlossaryField('cat&nbsp;nap', 'tomcat', 'fill-empty').outcome).toBe('kept-occupied');
  });

  it('merge-senses over a blank destination is a plain write, markup and all', () => {
    expect(decideGlossaryField('', 'cat<br>feline', 'merge-senses')).toEqual({
      outcome: 'write',
      value: 'cat<br>feline',
    });
  });
});

describe('buildGlossarySource', () => {
  it('keys rows by the normalized key field and carries only the asked-for fields', () => {
    const source = sourceOf([['猫', 'cat', 'ねこ']], { fieldNames: ['Meaning'] });
    expect(source.rowsRead).toBe(1);
    expect(source.entries.size).toBe(1);
    expect([...source.entries.keys()]).toEqual(['猫']);
    expect(source.entries.get('猫')?.values).toEqual({ meaning: 'cat' });
  });

  it('counts keyless rows instead of grouping them under one blank key', () => {
    const source = sourceOf([
      ['', 'cat', 'ねこ'],
      ['  ', 'dog', 'いぬ'],
      ['猫', 'cat', 'ねこ'],
    ]);
    expect(source.keylessRows).toBe(2);
    expect(source.entries.size).toBe(1);
  });

  it('collapses duplicate keys that agree and keeps the attributed copy', () => {
    const source = sourceOf([
      ['猫', 'cat; feline', 'ねこ'],
      ['猫', ATTRIBUTED, 'ねこ'],
    ]);
    expect(source.ambiguousKeys).toEqual([]);
    expect(source.entries.size).toBe(1);
    // Same plain text, so not ambiguous — and the wrapper survives the collapse.
    expect(source.entries.get('猫')?.values.meaning).toBe(ATTRIBUTED);
  });

  it('refuses a duplicate key whose rows disagree, and removes it entirely', () => {
    const source = sourceOf([
      ['猫', 'cat', 'ねこ'],
      ['猫', 'tiger', 'ねこ'],
      ['犬', 'dog', 'いぬ'],
    ]);
    expect(source.ambiguousKeys).toEqual(['猫']);
    expect(source.entries.has('猫')).toBe(false);
    expect(source.entries.size).toBe(1);
  });

  it('does not read a field it was not asked for, so a disagreement there is not ambiguous', () => {
    const source = sourceOf(
      [
        ['猫', 'cat', 'ねこ'],
        ['猫', 'cat', 'びょう'],
      ],
      { fieldNames: ['Meaning'] },
    );
    expect(source.ambiguousKeys).toEqual([]);
    expect(source.entries.get('猫')?.values).toEqual({ meaning: 'cat' });
  });
});

describe('matchGlossaryEntry', () => {
  const source = sourceOf([
    ['猫', 'cat', 'ねこ'],
    ['狐', 'fox', 'きつね'],
    ['狐', 'vixen', 'きつね'],
  ]);

  it('matches on the normalized key, so HTML and case do not miss', () => {
    const hit = matchGlossaryEntry(source, '<b>猫</b>');
    expect(hit.matched).toBe(true);
    expect(hit.matched && hit.entry.values.meaning).toBe('cat');
  });

  it('separates an empty key, an ambiguous one and a plain miss', () => {
    expect(matchGlossaryEntry(source, '')).toEqual({ matched: false, reason: 'key-empty', key: '' });
    expect(matchGlossaryEntry(source, '狐')).toEqual({
      matched: false,
      reason: 'key-ambiguous',
      key: '狐',
    });
    expect(matchGlossaryEntry(source, '犬')).toEqual({
      matched: false,
      reason: 'unmatched',
      key: '犬',
    });
  });
});
