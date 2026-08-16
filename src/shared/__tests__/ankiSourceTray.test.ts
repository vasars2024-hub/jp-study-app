/**
 * Recipe 20 through the tray — the write half the model cannot prove alone.
 *
 * The model says what it would restore; this says `planChangeTray` writes it,
 * that one Apply is one undo, and that a selection with no provenance produces
 * a named refusal rather than a field full of invented context.
 */
import { describe, expect, it } from 'vitest';

import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import { planChangeTray, type TrayAction, type TrayPlan } from '../ankiChangeTray';
import { countJournalSteps, createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import { videoClipFilename } from '../videoClip';
import { SOURCE_FACETS, type SourceFacet } from '../ankiSourceContext';

const FIELDS = ['Expression', 'Sentence', 'Source'];

function note(
  id: string,
  over: { tags?: string[]; media?: string[]; source?: string } = {},
): AnkiDraftNote {
  const values = ['猫', '猫が好きです。', over.source ?? ''];
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt',
    tags: over.tags ?? [],
    marked: false,
    fields: FIELDS.map((name, ord) => ({ ord, name, raw: values[ord], normalized: values[ord] })),
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`c-${id}`],
    media: (over.media ?? []).map((fileName) => ({
      reference: fileName,
      fileName,
      kind: 'audio' as const,
      fieldOrd: 1,
      present: true,
    })),
  } as unknown as AnkiDraftNote;
}

function draftOf(notes: AnkiDraftNote[]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Anime', '銀河英雄伝説'], filtered: false }],
    noteTypes: [
      {
        id: 'nt',
        name: 'Mined',
        kind: 'standard',
        css: '',
        fields: FIELDS.map((name, ord) => ({ ord, name, sticky: false, rtl: false })),
        templates: [],
        sortFieldOrd: 0,
      },
    ],
    notes,
    cards: notes.map((n) => ({
      id: `c-${n.id}`,
      noteId: n.id,
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
    })),
    media: [],
  } as unknown as AnkiDraft;
}

function run(
  notes: AnkiDraftNote[],
  over: Partial<Extract<TrayAction, { kind: 'restore-source' }>> = {},
): { draft: AnkiDraft; plan: TrayPlan } {
  const draft = draftOf(notes);
  const action = {
    id: 'a1',
    enabled: true,
    kind: 'restore-source',
    toField: 'Source',
    facets: [...SOURCE_FACETS] as SourceFacet[],
    ...over,
  } as TrayAction;
  return {
    draft,
    plan: planChangeTray(draft, createEditJournal(), notes.map((n) => n.id), [action], {
      groupId: 'g1',
    }),
  };
}

const source = (d: AnkiDraft, id: string): string | undefined =>
  d.notes.find((n) => n.id === id)?.fields[2].raw;
const codes = (p: TrayPlan): string[] => p.problems.map((x) => x.code);

describe('restore-source through planChangeTray', () => {
  it('writes the decoded context and reports it as a field change', () => {
    const fileName = videoClipFilename('2-118', 1_284.0);
    const { plan } = run([note('n1', { media: [fileName], tags: ['jp-study-app::study-mode'] })]);

    expect(plan.blocked).toBe(false);
    expect(plan.changedNotes).toBe(1);
    expect(source(plan.draft, 'n1')).toBe('21:24 · 2:118 · study-mode · Anime::銀河英雄伝説');
    // The evidence travels with the value, which is what makes the run checkable.
    expect(plan.sourceContext?.proposals[0].values[0].evidence).toBe(fileName);
    expect(plan.sourceContext?.byFacet).toEqual({ timestamp: 1, cue: 1, origin: 1, deck: 1 });
  });

  it('one Apply is one undo, and undo empties the field again', () => {
    const { plan } = run([note('n1', { media: [videoClipFilename('1-1', 5)] })]);
    expect(countJournalSteps(plan.journal.done)).toBe(1);

    const back = undoLastEdit(plan.draft, plan.journal, (raw) => raw);
    expect(source(back.draft, 'n1')).toBe('');
    expect(countJournalSteps(back.journal.done)).toBe(0);
  });

  it('a second run over the same selection writes nothing', () => {
    const { plan } = run([note('n1', { media: [videoClipFilename('1-1', 5)] })]);
    const again = planChangeTray(
      plan.draft,
      plan.journal,
      ['n1'],
      [
        {
          id: 'a2',
          enabled: true,
          kind: 'restore-source',
          toField: 'Source',
          facets: [...SOURCE_FACETS],
        } as TrayAction,
      ],
      { groupId: 'g2' },
    );
    // Idempotent because the destination is now occupied, not because the decode
    // changed — the recipe fills, it never overwrites.
    expect(again.changedNotes).toBe(0);
    expect(codes(again)).toContain('source-occupied');
    expect(codes(again)).toContain('source-clean');
  });

  it('a deck with no provenance is refused by name, not filled with a guess', () => {
    // The control. Facets narrowed to the three that need real evidence, so the
    // deck path cannot rescue the run — nothing is written and it says why.
    const { plan } = run([note('n1'), note('n2')], {
      facets: ['timestamp', 'cue', 'origin'],
    });

    expect(plan.changedNotes).toBe(0);
    expect(source(plan.draft, 'n1')).toBe('');
    const none = plan.problems.find((p) => p.code === 'source-none');
    expect(none?.count).toBe(2);
    // `source-clean`'s detail is how many notes carried anything at all: 0 here,
    // which is the difference between "nothing to restore" and "already filled".
    expect(plan.problems.find((p) => p.code === 'source-clean')?.detail).toBe('0');
  });

  it('refuses an unset destination or an empty facet list', () => {
    for (const over of [{ toField: '' }, { facets: [] as SourceFacet[] }]) {
      const { plan } = run([note('n1', { media: [videoClipFilename('1-1', 5)] })], over);
      expect(plan.blocked, JSON.stringify(over)).toBe(true);
      expect(codes(plan)).toContain('empty-parameter');
    }
  });

  it('names the renamed clip when that is why a note produced nothing', () => {
    const { plan } = run([note('n1', { media: ['jp-clip-2-118-later.mp4'] })], {
      facets: ['timestamp'],
    });
    const row = plan.problems.find((p) => p.code === 'source-unreadable-clip');
    expect(row?.detail).toBe('jp-clip-2-118-later.mp4');
    expect(row?.severity).toBe('warning');
  });
});
