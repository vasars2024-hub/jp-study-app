// Mastery mapping — ANKI_DECK_WORKBENCH_PLAN.md Phase 4 and acceptance gate 3
// ("map the results to `Very good`, and show the exact mastery/scheduling
// effects before commit").
//
// The three failures these guard are all silent ones: counting a lemma once per
// note that carries it, conflating "never judged" with level 0 so Undo invents a
// judgement, and dropping the notes that have no word at all so a batch that
// moved six words reads as if it covered two hundred.
import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import { planChangeTray, type TrayAction } from '../ankiChangeTray';
import { createEditJournal } from '../ankiDraftEdit';
import {
  invertMasteryWrites,
  isWritableMasteryTerm,
  masteryEffect,
  masteryWrites,
  planMasteryMapping,
} from '../ankiMastery';
import { buildVocabContext } from '../ankiVocabContext';

describe('planMasteryMapping', () => {
  const termByNote = new Map<string, string | null>([
    ['n1', '食べる'],
    ['n2', '食べる'],
    ['n3', '猫'],
    ['n4', null],
  ]);

  it('counts a lemma once however many notes carry it', () => {
    const plan = planMasteryMapping({
      noteIds: ['n1', 'n2', 'n3', 'n4'],
      termByNote,
      levels: new Map(),
      target: 3,
    });
    expect(plan.changes).toHaveLength(2);
    expect(plan.changes[0]).toMatchObject({ term: '食べる', before: null, after: 3 });
    expect(plan.changes[0].noteIds).toEqual(['n1', 'n2']);
    expect(plan.distinctTerms).toBe(2);
    expect(plan.notesCovered).toBe(3);
  });

  it('reports a note with no word rather than skipping it', () => {
    const plan = planMasteryMapping({
      noteIds: ['n1', 'n4'],
      termByNote,
      levels: new Map(),
      target: 2,
    });
    expect(plan.notesWithoutWord).toEqual(['n4']);
  });

  it('leaves a word already at the target alone and still counts it', () => {
    const plan = planMasteryMapping({
      noteIds: ['n1', 'n3'],
      termByNote,
      levels: new Map([['食べる', 3]]),
      target: 3,
    });
    expect(plan.changes.map((c) => c.term)).toEqual(['猫']);
    expect(plan.unchangedTerms).toBe(1);
    expect(plan.distinctTerms).toBe(2);
  });

  it('keeps "never judged" distinct from level 0, so undo restores the absence', () => {
    const plan = planMasteryMapping({
      noteIds: ['n1', 'n3'],
      termByNote,
      levels: new Map([['猫', 0]]),
      target: 3,
    });
    expect(plan.changes.find((c) => c.term === '食べる')?.before).toBeNull();
    expect(plan.changes.find((c) => c.term === '猫')?.before).toBe(0);
    expect(invertMasteryWrites(plan)).toEqual([
      { term: '食べる', level: null },
      { term: '猫', level: 0 },
    ]);
    expect(masteryWrites(plan)).toEqual([
      { term: '食べる', level: 3 },
      { term: '猫', level: 3 },
    ]);
  });

  it('treats mapping an unjudged word to New as no change at all', () => {
    // No stored entry and level 0 are the same state. Counting this as a move
    // would report work the store cannot show, since writing 0 deletes nothing
    // that was there.
    const plan = planMasteryMapping({
      noteIds: ['n1', 'n3'],
      termByNote,
      levels: new Map([['猫', 2]]),
      target: 0,
    });
    expect(plan.changes.map((c) => c.term)).toEqual(['猫']);
    expect(plan.unchangedTerms).toBe(1);
    expect(masteryEffect(plan).termsChanged).toBe(1);
  });

  it('declines to store a phrase as a word, and says which notes held one', () => {
    // Measured on the real deck: `extractVocabTerm` splits on whitespace, so a
    // short Japanese sentence in an Expression field arrives as one "word" and
    // clears the 16-character lookup cap. Reading it is harmless; writing it
    // into the lemma-keyed store is not.
    const plan = planMasteryMapping({
      noteIds: ['s1', 's2', 'n3'],
      termByNote: new Map([
        ['s1', '今日はいい天気です'],
        ['s2', 'ねこ、いぬ'],
        ['n3', '猫'],
      ]),
      levels: new Map(),
      target: 3,
    });
    expect(plan.changes.map((c) => c.term)).toEqual(['猫']);
    expect(plan.notesWithPhrase).toEqual(['s1', 's2']);
    expect(plan.notesWithoutWord).toEqual([]);
    expect(isWritableMasteryTerm('猫')).toBe(true);
    expect(isWritableMasteryTerm('今日はいい天気です')).toBe(false);
  });

  it('states zero Anki rescheduling as a value, not an omission', () => {
    const plan = planMasteryMapping({
      noteIds: ['n1', 'n3', 'n4'],
      termByNote,
      levels: new Map(),
      target: 3,
    });
    expect(masteryEffect(plan)).toEqual({
      store: 'local-knowledge',
      target: 3,
      termsChanged: 2,
      termsUnchanged: 0,
      notesCovered: 2,
      notesWithoutWord: 1,
      notesWithPhrase: 0,
      ankiSchedulingChanged: false,
      ankiCardsRescheduled: 0,
    });
  });
});

// ----- the tray action ---------------------------------------------------------

function note(id: string, word: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Expression', raw: word, normalized: word },
      { ord: 1, name: 'Back', raw: 'gloss', normalized: 'gloss' },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`c-${id}`],
    media: [],
  } as AnkiDraftNote;
}

const draft: AnkiDraft = {
  version: 1,
  source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
  decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
  noteTypes: [
    {
      id: 'nt1',
      name: 'Vocab',
      kind: 'standard',
      css: '',
      fields: [
        { ord: 0, name: 'Expression', sticky: false, rtl: false },
        { ord: 1, name: 'Back', sticky: false, rtl: false },
      ],
      templates: [],
      sortFieldOrd: 0,
    },
  ],
  notes: [note('n1', '食べる'), note('n2', '食べる'), note('n3', '猫')],
  cards: [],
  media: [],
  unsupported: [],
} as unknown as AnkiDraft;

const vocab = buildVocabContext({ notes: draft.notes, noteTypes: draft.noteTypes, cards: [] });

const action: TrayAction = { id: 'a1', enabled: true, kind: 'set-mastery', level: 3 };

describe('set-mastery in the change tray', () => {
  it('refuses the plan when no vocabulary context was supplied', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [action]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toContain('no-vocab-context');
    expect(plan.mastery).toBeUndefined();
  });

  it('plans the mapping without touching the draft or the journal', () => {
    const journal = createEditJournal();
    const plan = planChangeTray(draft, journal, ['n1', 'n2', 'n3'], [action], {
      mastery: { vocab, levels: new Map([['猫', 3]]) },
    });
    expect(plan.blocked).toBe(false);
    // Identity, not deep equality: local knowledge is not deck content, so a
    // mastery-only tray must leave the draft object itself untouched.
    expect(plan.draft).toBe(draft);
    expect(plan.journal).toBe(journal);
    expect(plan.changedNotes).toBe(0);
    expect(plan.mastery?.changes.map((c) => c.term)).toEqual(['食べる']);
    expect(plan.outcomes[0]).toEqual({
      actionId: 'a1',
      kind: 'set-mastery',
      matched: 3,
      changed: 2,
      skipped: 1,
    });
  });

  it('always reports the local-only consequence, even when nothing moves', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [action], {
      mastery: { vocab, levels: new Map([['食べる', 3]]) },
    });
    const local = plan.problems.find((p) => p.code === 'mastery-local-only');
    expect(local).toMatchObject({ severity: 'info', count: 0, detail: '3' });
    expect(plan.mastery?.changes).toHaveLength(0);
  });

  it('warns about notes that declare no word', () => {
    const wordless = {
      ...draft,
      noteTypes: [
        {
          ...draft.noteTypes[0],
          fields: [
            { ord: 0, name: 'Sentence', sticky: false, rtl: false },
            { ord: 1, name: 'Back', sticky: false, rtl: false },
          ],
        },
      ],
    } as AnkiDraft;
    const emptyVocab = buildVocabContext({
      notes: wordless.notes,
      noteTypes: wordless.noteTypes,
      cards: [],
    });
    const plan = planChangeTray(wordless, createEditJournal(), ['n1', 'n2'], [action], {
      mastery: { vocab: emptyVocab, levels: new Map() },
    });
    expect(plan.problems.find((p) => p.code === 'mastery-no-word')).toMatchObject({
      severity: 'warning',
      count: 2,
    });
    expect(plan.mastery?.changes).toHaveLength(0);
  });

  it('lets a later mapping in the same tray replace an earlier one', () => {
    const plan = planChangeTray(
      draft,
      createEditJournal(),
      ['n1', 'n3'],
      [action, { id: 'a2', enabled: true, kind: 'set-mastery', level: 1 }],
      { mastery: { vocab, levels: new Map() } },
    );
    expect(plan.mastery?.target).toBe(1);
    expect(plan.outcomes).toHaveLength(2);
  });
});
