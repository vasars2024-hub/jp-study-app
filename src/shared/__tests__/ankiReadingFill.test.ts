// Reading / furigana filling — ANKI_DECK_WORKBENCH_PLAN.md Phase 4, recipe 7
// ("fill missing readings or furigana, with confidence and manual-review
// thresholds").
//
// The failure these guard is the one that makes the recipe look like it works
// and quietly corrupts a deck: 上手 has two readings with different meanings,
// and a batch that takes the first entry writes じょうず onto a card the user
// meant as うわて and then drills it for months. So the ambiguity tests are the
// load-bearing ones here, not the happy path.
import { describe, expect, it } from 'vitest';
import {
  proposeReading,
  readingCandidates,
  readingMeetsThreshold,
  type ReadingFillThreshold,
} from '../ankiReadingFill';
import { readEnrichProvenance, type EnrichEntry } from '../ankiEnrich';
import { planChangeTray, type TrayAction } from '../ankiChangeTray';
import { buildVocabContext } from '../ankiVocabContext';
import { createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import { stripFieldHtml } from '../apkgParse';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';

const entry = (reading: string, source: string | null, sources?: string[]): EnrichEntry => ({
  source,
  ...(sources ? { sources } : {}),
  reading,
  senses: [{ partsOfSpeech: ['noun'], definitions: ['a gloss'] }],
});

describe('readingCandidates', () => {
  it('treats katakana and hiragana spellings of one reading as one candidate', () => {
    const out = readingCandidates([entry('ネコ', 'JMdict'), entry('ねこ', 'Wiktionary')]);
    expect(out).toEqual([{ reading: 'ねこ', sources: ['JMdict', 'Wiktionary'] }]);
  });

  it('keeps genuinely different readings apart, in source order', () => {
    const out = readingCandidates([entry('じょうず', 'JMdict'), entry('うわて', 'Wiktionary')]);
    expect(out.map((c) => c.reading)).toEqual(['じょうず', 'うわて']);
  });

  it('credits every source behind a merged entry, not just the primary', () => {
    const out = readingCandidates([entry('ねこ', 'JMdict', ['JMdict', 'Wiktionary'])]);
    expect(out[0].sources).toEqual(['JMdict', 'Wiktionary']);
  });

  it('drops entries with no reading rather than inventing an empty candidate', () => {
    expect(readingCandidates([entry('  ', 'JMdict')])).toEqual([]);
  });
});

describe('proposeReading', () => {
  it('keeps "nobody answered" distinct from "the answers carry no reading"', () => {
    expect(proposeReading('猫', undefined, 'kana')).toEqual({ refused: 'no-entry' });
    expect(proposeReading('猫', [], 'kana')).toEqual({ refused: 'no-entry' });
    expect(proposeReading('猫', [entry('', 'JMdict')], 'kana')).toEqual({ refused: 'no-reading' });
  });

  it('refuses furigana on a term with no kanji, and still fills its kana reading', () => {
    expect(proposeReading('ねこ', [entry('ねこ', 'JMdict')], 'furigana')).toEqual({
      refused: 'no-kanji',
    });
    const kana = proposeReading('ネコ', [entry('ネコ', 'JMdict')], 'kana');
    expect(kana).toMatchObject({ value: 'ねこ', reading: 'ねこ' });
  });

  it('writes bracket ruby over the kanji runs only', () => {
    const out = proposeReading('食べる', [entry('たべる', 'JMdict')], 'furigana');
    expect(out).toMatchObject({ value: '食[た]べる', coarse: false, confidence: 'likely' });
  });

  it('writes the whole word in kana for the kana form', () => {
    const out = proposeReading('食べる', [entry('タベル', 'JMdict')], 'kana');
    expect(out).toMatchObject({ value: 'たべる', coarse: false });
  });

  it('calls one reading from two agreeing dictionaries certain, one source likely', () => {
    const two = proposeReading('猫', [entry('ねこ', 'JMdict'), entry('ネコ', 'Wiktionary')], 'kana');
    expect(two).toMatchObject({ confidence: 'certain' });
    const one = proposeReading('猫', [entry('ねこ', 'JMdict')], 'kana');
    expect(one).toMatchObject({ confidence: 'likely' });
  });

  it('does not call an all-kanji whole-token ruby coarse — it is the right split', () => {
    const out = proposeReading('今日', [entry('きょう', 'JMdict'), entry('きょう', 'W')], 'furigana');
    expect(out).toMatchObject({ value: '今日[きょう]', coarse: false, confidence: 'certain' });
  });

  it('caps a coarse alignment at likely even when both dictionaries agreed', () => {
    // The reading cannot be split against べる, so the ruby covers the okurigana
    // too. Agreement does not make an unsplittable ruby safe to write unattended.
    const out = proposeReading('食べる', [entry('しょくじ', 'A'), entry('しょくじ', 'B')], 'furigana');
    expect(out).toMatchObject({ value: '食べる[しょくじ]', coarse: true, confidence: 'likely' });
  });

  it('reports several readings as ambiguous and carries every candidate out', () => {
    const out = proposeReading('上手', [entry('じょうず', 'JMdict'), entry('うわて', 'W')], 'kana');
    expect(out).toMatchObject({ confidence: 'ambiguous', reading: 'じょうず' });
    expect('candidates' in out && out.candidates.map((c) => c.reading)).toEqual([
      'じょうず',
      'うわて',
    ]);
  });
});

describe('readingMeetsThreshold', () => {
  it('never lets an ambiguous reading through, at any threshold', () => {
    const thresholds: ReadingFillThreshold[] = ['certain', 'likely'];
    for (const threshold of thresholds) {
      expect(readingMeetsThreshold('ambiguous', threshold)).toBe(false);
    }
  });

  it('admits likely only at the likely threshold', () => {
    expect(readingMeetsThreshold('likely', 'likely')).toBe(true);
    expect(readingMeetsThreshold('likely', 'certain')).toBe(false);
    expect(readingMeetsThreshold('certain', 'certain')).toBe(true);
    expect(readingMeetsThreshold('certain', 'likely')).toBe(true);
  });
});

// ----- the tray action -------------------------------------------------------

function noteOf(id: string, expression: string, reading: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Expression', raw: expression, normalized: expression },
      { ord: 1, name: 'Reading', raw: reading, normalized: reading },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
  };
}

function draftOf(notes: AnkiDraftNote[]): AnkiDraft {
  return {
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
          { ord: 1, name: 'Reading', sticky: false, rtl: false },
        ],
        templates: [],
        sortFieldOrd: 0,
      },
    ],
    notes,
    cards: [],
    diagnostics: [],
    counts: { notes: notes.length, cards: 0, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
  };
}

const fillAction = (
  over: Partial<Extract<TrayAction, { kind: 'fill-reading' }>> = {},
): TrayAction => ({
  id: 'a1',
  enabled: true,
  kind: 'fill-reading',
  form: 'kana',
  toField: 'Reading',
  threshold: 'likely',
  provenance: 'inline',
  ...over,
});

describe('the fill-reading tray action', () => {
  // n1 has an agreed reading and an empty field; n2 already has one; n3 is
  // ambiguous; nobody answered for n4; n5 declares no word at all.
  const notes = [
    noteOf('n1', '猫', ''),
    noteOf('n2', '犬', 'いぬ'),
    noteOf('n3', '上手', ''),
    noteOf('n4', '燦然', ''),
    noteOf('n5', '', ''),
  ];
  const draft = draftOf(notes);
  const vocab = buildVocabContext({ notes, noteTypes: draft.noteTypes, cards: [] });
  const lookup = new Map([
    ['猫', [entry('ねこ', 'JMdict'), entry('ネコ', 'Wiktionary')]],
    ['犬', [entry('いぬ', 'JMdict')]],
    ['上手', [entry('じょうず', 'JMdict'), entry('うわて', 'Wiktionary')]],
  ]);

  it('refuses the whole plan when no dictionary data was supplied', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [fillAction()]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toContain('no-enrich-data');
    expect(plan.draft).toBe(draft);
  });

  it('still refuses when the data exists but the destination field is blank', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [fillAction({ toField: '' })], {
      enrich: { lookup, vocab },
    });
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toContain('empty-parameter');
  });

  it('fills only the missing readings and keeps every other outcome distinct', () => {
    const plan = planChangeTray(
      draft,
      createEditJournal(),
      ['n1', 'n2', 'n3', 'n4', 'n5'],
      [fillAction()],
      { enrich: { lookup, vocab } },
    );
    expect(plan.blocked).toBe(false);
    expect(plan.changedNotes).toBe(1);
    const written = plan.draft.notes.find((n) => n.id === 'n1')?.fields[1].raw ?? '';
    expect(readEnrichProvenance(written)).toEqual({
      sources: ['JMdict', 'Wiktionary'],
      value: 'ねこ',
    });
    const codes = plan.problems.map((p) => p.code);
    expect(codes).toContain('reading-occupied');
    expect(codes).toContain('reading-ambiguous');
    expect(codes).toContain('reading-no-entry');
    expect(codes).toContain('reading-no-word');
    expect(plan.outcomes[0]).toMatchObject({ matched: 5, changed: 1, skipped: 4 });
  });

  it('names both readings of an ambiguous word rather than picking one', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n3'], [fillAction()], {
      enrich: { lookup, vocab },
    });
    expect(plan.changedNotes).toBe(0);
    expect(plan.problems.find((p) => p.code === 'reading-ambiguous')?.detail)
      .toBe('上手: じょうず / うわて');
    // The guarantee the whole recipe rests on: nothing was written.
    expect(plan.draft.notes.find((n) => n.id === 'n3')?.fields[1].raw).toBe('');
  });

  it('never overwrites a reading that is already there', () => {
    // 犬 resolves cleanly, so the only thing stopping the write is that the
    // field is occupied — which is what "fill missing" has to mean.
    const plan = planChangeTray(draft, createEditJournal(), ['n2'], [fillAction()], {
      enrich: { lookup, vocab },
    });
    expect(plan.changedNotes).toBe(0);
    expect(plan.draft.notes.find((n) => n.id === 'n2')?.fields[1].raw).toBe('いぬ');
    expect(plan.problems.find((p) => p.code === 'reading-occupied')?.detail).toBe('Reading');
  });

  it('holds a single-source reading back at the certain threshold', () => {
    const single = new Map([['猫', [entry('ねこ', 'JMdict')]]]);
    const strict = planChangeTray(
      draft,
      createEditJournal(),
      ['n1'],
      [fillAction({ threshold: 'certain' })],
      { enrich: { lookup: single, vocab } },
    );
    expect(strict.changedNotes).toBe(0);
    expect(strict.problems.find((p) => p.code === 'reading-below-threshold')?.detail).toBe('猫');
    const loose = planChangeTray(draft, createEditJournal(), ['n1'], [fillAction()], {
      enrich: { lookup: single, vocab },
    });
    expect(loose.changedNotes).toBe(1);
  });

  it('writes bracket furigana in the furigana form and reports a kana-only word', () => {
    const kanaNotes = [noteOf('k1', '食べる', ''), noteOf('k2', 'ねこ', '')];
    const kanaDraft = draftOf(kanaNotes);
    const kanaVocab = buildVocabContext({
      notes: kanaNotes,
      noteTypes: kanaDraft.noteTypes,
      cards: [],
    });
    const plan = planChangeTray(
      kanaDraft,
      createEditJournal(),
      ['k1', 'k2'],
      [fillAction({ form: 'furigana', provenance: 'none' })],
      {
        enrich: {
          lookup: new Map([
            ['食べる', [entry('たべる', 'JMdict')]],
            ['ねこ', [entry('ねこ', 'JMdict')]],
          ]),
          vocab: kanaVocab,
        },
      },
    );
    expect(plan.draft.notes.find((n) => n.id === 'k1')?.fields[1].raw).toBe('食[た]べる');
    expect(plan.problems.find((p) => p.code === 'reading-no-kanji')?.detail).toBe('ねこ');
  });

  it('is one undo, like every other tray step', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [fillAction()], {
      enrich: { lookup, vocab },
    });
    const undone = undoLastEdit(plan.draft, plan.journal, stripFieldHtml);
    expect(undone?.draft.notes.find((n) => n.id === 'n1')?.fields[1].raw).toBe('');
  });
});
