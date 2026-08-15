// Dictionary enrichment — ANKI_DECK_WORKBENCH_PLAN.md Phase 4 and gate 11
// ("enrich a mixed deck from configured dictionaries, resolve conflicting
// senses, and prove field-level provenance after export/reimport").
//
// The two failures these guard are the ones that would make gate 11 pass on
// paper and fail in a deck: a disagreement between two installed dictionaries
// silently resolving to whichever came first, and provenance that is written
// but cannot be read back after a round trip through the field text.
import { describe, expect, it } from 'vitest';
import {
  ENRICH_DEFINITION_SEPARATOR,
  ENRICH_SOURCE_SEPARATOR,
  MAX_ENRICH_DEFINITIONS,
  readEnrichProvenance,
  resolveEnrichValue,
  wrapEnrichProvenance,
  type EnrichEntry,
} from '../ankiEnrich';
import { planChangeTray, type TrayAction } from '../ankiChangeTray';
import { buildVocabContext, emptyVocabContext } from '../ankiVocabContext';
import { createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import { stripFieldHtml } from '../apkgParse';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';

const jmdict = (definitions: string[], reading = 'ねこ'): EnrichEntry => ({
  source: 'JMdict (EN)',
  reading,
  senses: [{ partsOfSpeech: ['noun'], definitions }],
});

const other = (definitions: string[], reading = 'ねこ'): EnrichEntry => ({
  source: 'Wiktionary',
  reading,
  senses: [{ partsOfSpeech: ['noun', 'common'], definitions }],
});

describe('resolveEnrichValue', () => {
  it('keeps "no dictionary answered" distinct from "the entry has no such value"', () => {
    expect(resolveEnrichValue(undefined, 'meaning', 'first-source')).toEqual({ refused: 'no-entry' });
    expect(resolveEnrichValue([], 'meaning', 'first-source')).toEqual({ refused: 'no-entry' });
    const readingless: EnrichEntry = { source: 'JMdict (EN)', reading: '  ', senses: [] };
    expect(resolveEnrichValue([readingless], 'reading', 'first-source')).toEqual({
      refused: 'no-value',
    });
  });

  it('does not call one source disagreeing with itself a conflict', () => {
    const entries = [jmdict(['cat']), jmdict(['feline'])];
    const out = resolveEnrichValue(entries, 'meaning', 'refuse');
    expect(out).toEqual({
      value: `cat${ENRICH_DEFINITION_SEPARATOR}feline`,
      sources: ['JMdict (EN)'],
      merged: false,
    });
  });

  it('treats two sources that produced identical text as agreement', () => {
    const out = resolveEnrichValue([jmdict(['cat']), other(['cat'])], 'meaning', 'refuse');
    expect(out).toEqual({ value: 'cat', sources: ['JMdict (EN)'], merged: false });
  });

  it('resolves a real disagreement three different ways', () => {
    const entries = [jmdict(['cat']), other(['domestic cat'])];
    expect(resolveEnrichValue(entries, 'meaning', 'refuse')).toEqual({
      refused: 'sense-conflict',
    });
    expect(resolveEnrichValue(entries, 'meaning', 'first-source')).toEqual({
      value: 'cat',
      sources: ['JMdict (EN)'],
      merged: false,
    });
    expect(resolveEnrichValue(entries, 'meaning', 'all-sources')).toEqual({
      value: `cat${ENRICH_SOURCE_SEPARATOR}domestic cat`,
      sources: ['JMdict (EN)', 'Wiktionary'],
      merged: true,
    });
  });

  it('bounds the definitions it will join into one field', () => {
    const many = Array.from({ length: MAX_ENRICH_DEFINITIONS + 4 }, (_, i) => `sense ${i}`);
    const out = resolveEnrichValue([jmdict(many)], 'meaning', 'first-source');
    expect('value' in out && out.value.split(ENRICH_DEFINITION_SEPARATOR)).toHaveLength(
      MAX_ENRICH_DEFINITIONS,
    );
  });

  it('reads parts of speech across senses without repeating one', () => {
    const entry: EnrichEntry = {
      source: 'JMdict (EN)',
      reading: 'ねこ',
      senses: [
        { partsOfSpeech: ['noun'], definitions: ['cat'] },
        { partsOfSpeech: ['noun', 'colloquial'], definitions: ['shamisen'] },
      ],
    };
    expect(resolveEnrichValue([entry], 'partOfSpeech', 'first-source')).toEqual({
      value: `noun${ENRICH_DEFINITION_SEPARATOR}colloquial`,
      sources: ['JMdict (EN)'],
      merged: false,
    });
  });

  it('credits every dictionary behind a merged entry, primary first', () => {
    // The unified database merges two dictionaries that agree on headword and
    // reading into ONE entry with combined senses. That is one voice with two
    // names, not a disagreement — so `refuse` must not fire, and the field must
    // still credit both.
    const merged: EnrichEntry = {
      source: 'JMdict (EN)',
      sources: ['JMdict (EN)', 'Wiktionary'],
      reading: 'ねこ',
      senses: [{ partsOfSpeech: ['noun'], definitions: ['cat', 'domestic cat'] }],
    };
    expect(resolveEnrichValue([merged], 'meaning', 'refuse')).toEqual({
      value: `cat${ENRICH_DEFINITION_SEPARATOR}domestic cat`,
      sources: ['JMdict (EN)', 'Wiktionary'],
      merged: false,
    });
  });

  it('contributes no source name for an entry that cannot be attributed', () => {
    const anon: EnrichEntry = { source: null, reading: 'ねこ', senses: [{ partsOfSpeech: [], definitions: ['cat'] }] };
    expect(resolveEnrichValue([anon], 'meaning', 'first-source')).toEqual({
      value: 'cat',
      sources: [],
      merged: false,
    });
  });
});

describe('inline provenance', () => {
  it('round-trips through the field text a package would carry', () => {
    const wrapped = wrapEnrichProvenance('cat', ['JMdict (EN)', 'Wiktionary'], 'inline');
    expect(wrapped).toContain('data-jp-dict="JMdict (EN)|Wiktionary"');
    expect(readEnrichProvenance(wrapped)).toEqual({
      sources: ['JMdict (EN)', 'Wiktionary'],
      value: 'cat',
    });
  });

  it('survives a source name carrying a quote or an ampersand', () => {
    const name = 'A "big" dictionary & friends';
    const wrapped = wrapEnrichProvenance('cat', [name], 'inline');
    expect(wrapped).not.toContain('"A "big"');
    expect(readEnrichProvenance(wrapped)?.sources).toEqual([name]);
  });

  it('keeps markup the dictionary produced inside the wrapper', () => {
    const wrapped = wrapEnrichProvenance('<i>cat</i>', ['JMdict (EN)'], 'inline');
    expect(readEnrichProvenance(wrapped)?.value).toBe('<i>cat</i>');
  });

  it('writes nothing extra when there is nobody to credit or the mode is off', () => {
    expect(wrapEnrichProvenance('cat', [], 'inline')).toBe('cat');
    expect(wrapEnrichProvenance('cat', ['JMdict (EN)'], 'none')).toBe('cat');
    expect(readEnrichProvenance('cat')).toBeNull();
    expect(readEnrichProvenance('<span class="other">cat</span>')).toBeNull();
  });
});

// ----- the tray action -------------------------------------------------------

function noteOf(id: string, expression: string, meaning: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Expression', raw: expression, normalized: expression },
      { ord: 1, name: 'Meaning', raw: meaning, normalized: meaning },
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
          { ord: 1, name: 'Meaning', sticky: false, rtl: false },
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

const enrichAction = (over: Partial<Extract<TrayAction, { kind: 'enrich-dictionary' }>> = {}): TrayAction => ({
  id: 'a1',
  enabled: true,
  kind: 'enrich-dictionary',
  aspect: 'meaning',
  toField: 'Meaning',
  onConflict: 'keep',
  senseRule: 'first-source',
  provenance: 'inline',
  ...over,
});

describe('the enrich-dictionary tray action', () => {
  const notes = [noteOf('n1', '猫', ''), noteOf('n2', '犬', ''), noteOf('n3', '', '')];
  const draft = draftOf(notes);
  const vocab = buildVocabContext({ notes, noteTypes: draft.noteTypes, cards: [] });
  const lookup = new Map([['猫', [jmdict(['cat'])]]]);

  it('refuses the whole plan when no dictionary data was supplied', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [enrichAction()]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toContain('no-enrich-data');
    expect(plan.draft).toBe(draft);
  });

  it('still refuses when the data exists but the destination field is blank', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [enrichAction({ toField: '' })], {
      enrich: { lookup, vocab },
    });
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toContain('empty-parameter');
  });

  it('writes an attributed value and keeps every absence distinct', () => {
    const plan = planChangeTray(
      draft,
      createEditJournal(),
      ['n1', 'n2', 'n3'],
      [enrichAction()],
      { enrich: { lookup, vocab } },
    );
    expect(plan.blocked).toBe(false);
    expect(plan.changedNotes).toBe(1);
    const written = plan.draft.notes.find((n) => n.id === 'n1')?.fields[1].raw ?? '';
    expect(readEnrichProvenance(written)).toEqual({ sources: ['JMdict (EN)'], value: 'cat' });
    // 犬 has a word but no dictionary answered; n3 has no word at all. Two
    // different facts, two different codes.
    const codes = plan.problems.map((p) => `${p.code}:${p.detail}`);
    expect(codes).toContain('enrich-no-entry:犬');
    expect(codes).toContain('enrich-no-word:n3');
    expect(plan.outcomes[0]).toMatchObject({ matched: 3, changed: 1, skipped: 2 });
  });

  it('reports a conflict rather than picking a winner under `refuse`', () => {
    const conflicted = new Map([['猫', [jmdict(['cat']), other(['domestic cat'])]]]);
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [enrichAction({ senseRule: 'refuse' })], {
      enrich: { lookup: conflicted, vocab },
    });
    expect(plan.changedNotes).toBe(0);
    expect(plan.problems.map((p) => p.code)).toContain('enrich-sense-conflict');

    const merged = planChangeTray(draft, createEditJournal(), ['n1'], [enrichAction({ senseRule: 'all-sources' })], {
      enrich: { lookup: conflicted, vocab },
    });
    expect(merged.changedNotes).toBe(1);
    expect(merged.problems.map((p) => p.code)).toContain('enrich-sources-merged');
    expect(readEnrichProvenance(merged.draft.notes[0].fields[1].raw)).toEqual({
      sources: ['JMdict (EN)', 'Wiktionary'],
      value: `cat${ENRICH_SOURCE_SEPARATOR}domestic cat`,
    });
  });

  it('honours the three conflict rules on an occupied destination', () => {
    const occupied = draftOf([noteOf('n1', '猫', 'my own gloss')]);
    const ctx = buildVocabContext({
      notes: occupied.notes,
      noteTypes: occupied.noteTypes,
      cards: [],
    });
    const run = (onConflict: 'keep' | 'overwrite' | 'append') =>
      planChangeTray(
        occupied,
        createEditJournal(),
        ['n1'],
        [enrichAction({ onConflict, provenance: 'none' })],
        { enrich: { lookup, vocab: ctx } },
      );
    expect(run('keep').changedNotes).toBe(0);
    expect(run('overwrite').draft.notes[0].fields[1].raw).toBe('cat');
    expect(run('overwrite').problems.map((p) => p.code)).toContain('overwrite-nonempty');
    expect(run('append').draft.notes[0].fields[1].raw).toBe('my own gloss<br>cat');
  });

  it('is one undo, like every other tray action', () => {
    const journal = createEditJournal();
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [enrichAction()], {
      enrich: { lookup, vocab },
    });
    expect(plan.journal.done).toHaveLength(1);
    const back = undoLastEdit(plan.draft, plan.journal, stripFieldHtml);
    expect(back.draft.notes.find((n) => n.id === 'n1')?.fields[1].raw).toBe('');
    expect(journal.done).toHaveLength(0);
  });

  it('warns rather than writing when the note type has no destination field', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [enrichAction({ toField: 'Reading' })], {
      enrich: { lookup, vocab },
    });
    expect(plan.changedNotes).toBe(0);
    expect(plan.problems.map((p) => `${p.code}:${p.detail}`)).toContain('field-absent:Reading');
  });

  it('an empty vocabulary context is data, so the plan runs and finds no words', () => {
    const plan = planChangeTray(draft, createEditJournal(), ['n1'], [enrichAction()], {
      enrich: { lookup, vocab: emptyVocabContext() },
    });
    expect(plan.blocked).toBe(false);
    expect(plan.changedNotes).toBe(0);
    expect(plan.problems.map((p) => p.code)).toContain('enrich-no-word');
  });
});
