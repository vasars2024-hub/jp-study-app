import { describe, expect, it } from 'vitest';
import type { AnkiDraftCard, AnkiDraftNote, AnkiDraftNoteType } from '../ankiDraft';
import {
  DEFAULT_MATURE_INTERVAL_DAYS,
  ankiKnownFromCards,
  buildVocabContext,
  collectVocabTerms,
  emptyVocabContext,
  extractVocabTerm,
  isVocabKnownConflict,
  resolveVocabField,
  resolveVocabKnown,
} from '../ankiVocabContext';

function note(id: string, noteTypeId: string, fields: Array<[string, string]>): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId,
    tags: [],
    marked: false,
    fields: fields.map(([name, text], ord) => ({ ord, name, raw: text, normalized: text })),
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
  };
}

function noteType(id: string, names: string[]): AnkiDraftNoteType {
  return {
    id,
    name: id,
    kind: 'standard',
    css: '',
    fields: names.map((name, ord) => ({ ord, name, sticky: false, rtl: false })),
    templates: [],
    sortFieldOrd: 0,
  };
}

function card(id: string, noteId: string, over: Partial<AnkiDraftCard> = {}): AnkiDraftCard {
  return {
    id,
    noteId,
    deckId: 'd1',
    ord: 0,
    type: 'new',
    queue: 'new',
    due: 0,
    interval: 0,
    easeFactor: 0,
    reps: 0,
    lapses: 0,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
    ...over,
  };
}

const mature = (id: string, noteId: string, ord = 0): AnkiDraftCard =>
  card(id, noteId, { ord, type: 'review', queue: 'review', interval: DEFAULT_MATURE_INTERVAL_DAYS });

describe('resolveVocabField', () => {
  it('prefers the earlier candidate over a later one', () => {
    expect(resolveVocabField(['Front', 'Back', 'Expression'])).toBe('Expression');
  });

  it('matches case-insensitively but returns the note type spelling', () => {
    expect(resolveVocabField(['MEANING', 'word'])).toBe('word');
  });

  it('never matches a companion field by substring', () => {
    // `Word Audio` is a recording of the word, not the word.
    expect(resolveVocabField(['Word Audio', 'Expression Furigana', 'Sentence'])).toBeNull();
  });

  it('returns null rather than falling back to the first field', () => {
    expect(resolveVocabField(['Sentence', 'Translation', 'Notes'])).toBeNull();
  });
});

describe('extractVocabTerm', () => {
  it('takes the first run when a gloss follows the word', () => {
    expect(extractVocabTerm('食べる to eat')).toBe('食べる');
  });

  it('drops brackets a deck author typed around the word', () => {
    expect(extractVocabTerm('「猫」')).toBe('猫');
    expect(extractVocabTerm('走る、')).toBe('走る');
  });

  it('refuses prose rather than looking up a sentence', () => {
    expect(extractVocabTerm('これはとても長い日本語の文章であって単語ではありません')).toBeNull();
  });

  it('is null for empty and whitespace-only fields', () => {
    expect(extractVocabTerm('')).toBeNull();
    expect(extractVocabTerm('   ')).toBeNull();
  });
});

describe('ankiKnownFromCards', () => {
  it('is null when the note generates no card at all', () => {
    expect(ankiKnownFromCards([])).toBeNull();
  });

  it('needs every card mature, not any', () => {
    expect(ankiKnownFromCards([mature('c1', 'n1'), card('c2', 'n1', { ord: 1 })])).toBe(false);
    expect(ankiKnownFromCards([mature('c1', 'n1'), mature('c2', 'n1', 1)])).toBe(true);
  });

  it('never counts the legacy negative-seconds interval as mature', () => {
    expect(ankiKnownFromCards([card('c1', 'n1', { type: 'review', interval: -600 })])).toBe(false);
  });
});

describe('resolveVocabKnown', () => {
  it('reports no-data only when neither source spoke', () => {
    expect(resolveVocabKnown({ local: null, anki: null }, 'local')).toBe('no-data');
  });

  it('lets the one source that has data answer, whatever the precedence', () => {
    expect(resolveVocabKnown({ local: null, anki: true }, 'local')).toBe('known');
    expect(resolveVocabKnown({ local: false, anki: null }, 'anki')).toBe('unknown');
  });

  it('resolves a real conflict by the selected precedence', () => {
    const conflict = { local: true, anki: false };
    expect(isVocabKnownConflict(conflict)).toBe(true);
    expect(resolveVocabKnown(conflict, 'local')).toBe('known');
    expect(resolveVocabKnown(conflict, 'anki')).toBe('unknown');
    expect(resolveVocabKnown(conflict, 'either')).toBe('known');
    expect(resolveVocabKnown(conflict, 'both')).toBe('unknown');
  });

  it('does not call agreement a conflict', () => {
    expect(isVocabKnownConflict({ local: true, anki: true })).toBe(false);
    expect(isVocabKnownConflict({ local: true, anki: null })).toBe(false);
  });
});

describe('buildVocabContext', () => {
  const noteTypes = [noteType('nt1', ['Expression', 'Meaning']), noteType('nt2', ['Sentence', 'Translation'])];
  const notes = [
    note('n1', 'nt1', [['Expression', '猫'], ['Meaning', 'cat']]),
    note('n2', 'nt1', [['Expression', '胼胝'], ['Meaning', 'callus']]),
    note('n3', 'nt2', [['Sentence', '猫が好きです'], ['Translation', 'I like cats']]),
    note('n4', 'nt1', [['Expression', '猫'], ['Meaning', 'duplicate']]),
  ];

  it('collects distinct terms in first-note order and skips note types with no word field', () => {
    expect(collectVocabTerms(notes, noteTypes)).toEqual(['猫', '胼胝']);
  });

  it('keeps an unranked word null instead of treating it as rare', () => {
    const ctx = buildVocabContext({
      notes,
      noteTypes,
      cards: [],
      ranks: new Map([['猫', 1_204], ['胼胝', null]]),
    });
    expect(ctx.byNote.get('n1')?.rank).toBe(1_204);
    expect(ctx.byNote.get('n2')?.rank).toBeNull();
    expect(ctx.rankedTermCount).toBe(1);
  });

  it('records a note whose note type declares no word field as term-less, not absent', () => {
    const ctx = buildVocabContext({ notes, noteTypes, cards: [] });
    const facts = ctx.byNote.get('n3');
    expect(facts).toBeDefined();
    expect(facts?.field).toBeNull();
    expect(facts?.term).toBeNull();
    expect(facts?.known).toEqual({ local: null, anki: null });
  });

  it('separates "never asked" from "asked and set to new"', () => {
    const ctx = buildVocabContext({
      notes,
      noteTypes,
      cards: [],
      localLevels: new Map([['猫', 0]]),
    });
    expect(ctx.byNote.get('n1')?.known.local).toBe(false);
    expect(ctx.byNote.get('n2')?.known.local).toBeNull();
  });

  it('reads Anki state per note from that note\'s own cards', () => {
    const ctx = buildVocabContext({
      notes,
      noteTypes,
      cards: [mature('c1', 'n1'), card('c2', 'n2')],
      localLevels: new Map([['猫', 3], ['胼胝', 3]]),
    });
    expect(ctx.byNote.get('n1')?.known).toEqual({ local: true, anki: true });
    expect(ctx.byNote.get('n2')?.known).toEqual({ local: true, anki: false });
    expect(isVocabKnownConflict(ctx.byNote.get('n2')?.known ?? { local: null, anki: null })).toBe(true);
  });

  it('gives every note an entry, so a filter never has to guess at a missing key', () => {
    const ctx = buildVocabContext({ notes, noteTypes, cards: [] });
    expect([...ctx.byNote.keys()]).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('has an empty context that is still a context', () => {
    const ctx = emptyVocabContext('anki');
    expect(ctx.byNote.size).toBe(0);
    expect(ctx.terms).toEqual([]);
    expect(ctx.precedence).toBe('anki');
  });
});
