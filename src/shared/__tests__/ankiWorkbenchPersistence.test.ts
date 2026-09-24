// The Deck Workbench's persistence, paging and local-deck destination, pure.
//
// ANKI_DECK_WORKBENCH_PLAN.md :42/:70 (the local deck is a source) and :222/:250
// (an edit journal that autosaves). Before this, edits lived only in React
// state, a live Anki / CSV source stopped at its first 500 notes, and the local
// deck had no destination at all.
import { describe, expect, it } from 'vitest';
import { pageAnkiDraft } from '../ankiDraft';
import { createEditJournal, setNoteField, setNoteTags, undoLastEdit } from '../ankiDraftEdit';
import { buildApkgExportChanges } from '../ankiApkgExport';
import { buildLocalDeckDraft } from '../ankiLocalDeck';
import { stripFieldHtml } from '../apkgParse';
import {
  isWorkbenchAutosave,
  journalSteps,
  mergeDraftPage,
  planLocalDeckApply,
  replayJournal,
  WORKBENCH_AUTOSAVE_VERSION,
} from '../ankiWorkbenchPersistence';

const CARDS = [
  { id: 'fc-1', word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '猫がいる。', addedAt: 1 },
  { id: 'fc-2', word: '犬', reading: 'いぬ', meaning: 'dog', addedAt: 2 },
  { id: 'fc-3', word: '鳥', reading: 'とり', meaning: 'bird', addedAt: 3 },
];

function localDraft() {
  return buildLocalDeckDraft(CARDS, stripFieldHtml, { nowMs: 10 }).draft;
}

const MEANING = 2;

describe('journal replay', () => {
  it('re-applies a saved journal onto a fresh read of the same source', () => {
    const fresh = localDraft();
    let edited = setNoteField(fresh, createEditJournal(), 'fc-1', MEANING, 'a cat', stripFieldHtml);
    edited = setNoteField(edited.draft, edited.journal, 'fc-2', MEANING, 'a dog', stripFieldHtml);

    const replay = replayJournal(localDraft(), edited.journal, stripFieldHtml);

    expect(replay.replayed).toBe(2);
    expect(replay.skipped).toBe(0);
    expect(replay.draft.notes.find((n) => n.id === 'fc-1')?.fields[MEANING].raw).toBe('a cat');
    expect(replay.draft.notes.find((n) => n.id === 'fc-2')?.fields[MEANING].raw).toBe('a dog');
    // Still undoable, one step at a time, exactly as before the restart.
    const undone = undoLastEdit(replay.draft, replay.journal, stripFieldHtml);
    expect(undone.draft.notes.find((n) => n.id === 'fc-2')?.fields[MEANING].raw).toBe('dog');
  });

  it('keeps a tray group one step', () => {
    const ops = [
      { kind: 'field', noteId: 'a', fieldOrd: 0, before: '', after: 'x', group: 'g1' },
      { kind: 'field', noteId: 'b', fieldOrd: 0, before: '', after: 'y', group: 'g1' },
      { kind: 'field', noteId: 'c', fieldOrd: 0, before: '', after: 'z' },
    ] as Parameters<typeof journalSteps>[0];
    expect(journalSteps(ops).map((step) => step.length)).toEqual([2, 1]);
  });

  it('counts an edit to a note the fresh read lacks as skipped', () => {
    const fresh = localDraft();
    const edited = setNoteField(fresh, createEditJournal(), 'fc-3', MEANING, 'a bird', stripFieldHtml);
    const firstPage = pageAnkiDraft(localDraft(), 0, 2);
    const replay = replayJournal(firstPage, edited.journal, stripFieldHtml);
    expect(replay).toMatchObject({ replayed: 0, skipped: 1 });
    expect(replay.draft.notes.some((n) => n.id === 'fc-3')).toBe(false);
  });
});

describe('paging', () => {
  it('appends a further page without duplicating rows or changing the whole-source counts', () => {
    const whole = localDraft();
    const first = pageAnkiDraft(whole, 0, 2);
    const second = pageAnkiDraft(whole, 2, 2);
    const merged = mergeDraftPage(mergeDraftPage(first, second), second);
    expect(merged.notes.map((n) => n.id)).toEqual(['fc-1', 'fc-2', 'fc-3']);
    expect(merged.cards).toHaveLength(3);
    expect(merged.counts).toEqual(whole.counts);
  });
});

describe('autosave shape', () => {
  it('accepts a session and refuses anything else', () => {
    const session = {
      version: WORKBENCH_AUTOSAVE_VERSION,
      savedAt: 1,
      draft: localDraft(),
      totalNotes: 3,
      journal: createEditJournal(),
    };
    expect(isWorkbenchAutosave(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(isWorkbenchAutosave({ ...session, version: 99 })).toBe(false);
    expect(isWorkbenchAutosave(null)).toBe(false);
  });
});

describe('local deck destination', () => {
  const current = new Map(CARDS.map((card) => [card.id, {
    word: card.word,
    reading: card.reading,
    meaning: card.meaning,
    sentence: card.sentence,
    front: undefined,
    back: undefined,
  }]));

  it('turns field edits into card patches, only for what changed', () => {
    const draft = localDraft();
    let edited = setNoteField(draft, createEditJournal(), 'fc-1', MEANING, 'a cat', stripFieldHtml);
    edited = setNoteField(edited.draft, edited.journal, 'fc-2', 0, '狗', stripFieldHtml);
    const plan = planLocalDeckApply(buildApkgExportChanges(edited.draft, edited.journal), current);
    expect(plan.patches).toEqual([
      { id: 'fc-1', patch: { meaning: 'a cat' } },
      { id: 'fc-2', patch: { word: '狗' } },
    ]);
    expect(plan.unsupported).toEqual([]);
  });

  it('names what a local deck cannot store instead of dropping it', () => {
    const draft = localDraft();
    const edited = setNoteTags(draft, createEditJournal(), 'fc-1', ['mine']);
    const plan = planLocalDeckApply(buildApkgExportChanges(edited.draft, edited.journal), current);
    expect(plan.patches).toEqual([]);
    expect(plan.unsupported).toEqual([{ kind: 'tags', count: 1 }]);
  });
});
