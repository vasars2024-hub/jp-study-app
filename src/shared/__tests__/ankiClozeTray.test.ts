/**
 * Recipe 19 through the tray — the half the model cannot prove on its own.
 *
 * The model says what it would write; this says that `planChangeTray` writes it,
 * that the journal can take it back, and that a run whose whole selection is
 * refused reports the refusal rather than a silent zero. It also pins the one
 * consequence this action has and no other field edit does: adding a marker
 * generates a card, so the tray must raise `cloze-cards-change`.
 */
import { describe, expect, it } from 'vitest';

import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import { planChangeTray, type TrayAction } from '../ankiChangeTray';
import { countJournalSteps, createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import { stripFieldHtml } from '../apkgParse';

const FIELDS = ['Expression', 'Reading', 'Sentence'];

function note(id: string, values: string[], noteTypeId = 'nt-cloze'): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId,
    tags: [],
    marked: false,
    fields: FIELDS.map((name, ord) => ({
      ord,
      name,
      raw: values[ord] ?? '',
      normalized: (values[ord] ?? '').replace(/\{\{c\d+::/g, '').replace(/\}\}/g, ''),
    })),
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`c-${id}`],
    media: [],
  };
}

function draftOf(notes: AnkiDraftNote[]): AnkiDraft {
  const fields = FIELDS.map((name, ord) => ({ ord, name, sticky: false, rtl: false }));
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      { id: 'nt-cloze', name: 'Cloze', kind: 'cloze', css: '', fields, templates: [], sortFieldOrd: 0 },
      { id: 'nt-basic', name: 'Basic', kind: 'standard', css: '', fields, templates: [], sortFieldOrd: 0 },
    ],
    notes,
    cards: [],
    media: [],
  } as unknown as AnkiDraft;
}

const action = (modes: TrayAction extends { modes: infer M } ? M : never): TrayAction =>
  ({ id: 'a1', enabled: true, kind: 'add-cloze', modes }) as TrayAction;

function plan(notes: AnkiDraftNote[], modes: string[] = ['exact', 'reading', 'stem']) {
  const draft = draftOf(notes);
  return {
    draft,
    result: planChangeTray(
      draft,
      createEditJournal(),
      notes.map((n) => n.id),
      [action(modes as never)],
      { groupId: 'g1' },
    ),
  };
}

const raw = (d: AnkiDraft, id: string) => d.notes.find((n) => n.id === id)?.fields[2].raw;
const codes = (p: { problems: { code: string }[] }) => p.problems.map((x) => x.code);

describe('add-cloze through planChangeTray', () => {
  it('writes the marker and reports the card it would generate', () => {
    const { result } = plan([note('n1', ['猫', 'ねこ', '猫が好きです。'])]);
    expect(result.blocked).toBe(false);
    expect(result.changedNotes).toBe(1);
    expect(raw(result.draft, 'n1')).toBe('{{c1::猫}}が好きです。');
    // The consequence no other field edit has: a marker generates a card.
    expect(codes(result)).toContain('cloze-cards-change');
  });

  it('is undone whole by the journal', () => {
    const { draft, result } = plan([note('n1', ['猫', 'ねこ', '猫が好きです。'])]);
    expect(countJournalSteps(result.journal.done)).toBe(1);
    const back = undoLastEdit(result.draft, result.journal, stripFieldHtml);
    expect(raw(back.draft, 'n1')).toBe('猫が好きです。');
    expect(raw(back.draft, 'n1')).toBe(raw(draft, 'n1'));
  });

  // The refusal the recipe exists for, at the surface the user actually meets.
  it('refuses a standard note type and writes nothing', () => {
    const { result } = plan([note('n1', ['猫', 'ねこ', '猫が好きです。'], 'nt-basic')]);
    expect(result.changedNotes).toBe(0);
    expect(codes(result)).toContain('cloze-wrong-note-type');
    expect(raw(result.draft, 'n1')).toBe('猫が好きです。');
  });

  it('reports why a fully-refused run changed nothing instead of a bare zero', () => {
    const { result } = plan([
      note('n1', ['猫', 'ねこ', '{{c1::猫}}が好きです。']),
      note('n2', ['食べる', 'たべる', '犬が走った。']),
      note('n3', ['猫', 'ねこ', '']),
      note('n4', ['', '', '猫が好き']),
    ]);
    expect(result.changedNotes).toBe(0);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        'cloze-already',
        'cloze-not-found',
        'cloze-no-sentence',
        'cloze-no-word',
      ]),
    );
  });

  it('blocks a tray with no mode selected rather than running it to zero', () => {
    const { result } = plan([note('n1', ['猫', 'ねこ', '猫が好きです。'])], []);
    expect(result.blocked).toBe(true);
    expect(codes(result)).toContain('empty-parameter');
    expect(result.changedNotes).toBe(0);
  });

  it('allocates around markers the note already carries', () => {
    const n = note('n1', ['猫', 'ねこ', '猫が{{c1::好き}}です。']);
    const { result } = plan([n]);
    expect(raw(result.draft, 'n1')).toBe('{{c2::猫}}が{{c1::好き}}です。');
  });

  // A second Apply over the same selection must not nest a marker in a marker.
  it('is idempotent across two runs', () => {
    const first = plan([note('n1', ['猫', 'ねこ', '猫が好きです。'])]);
    const after = first.result.draft;
    const second = planChangeTray(after, first.result.journal, ['n1'], [action(['exact'] as never)], {
      groupId: 'g2',
    });
    expect(second.changedNotes).toBe(0);
    expect(codes(second)).toContain('cloze-already');
    expect(raw(second.draft, 'n1')).toBe('{{c1::猫}}が好きです。');
  });
});
