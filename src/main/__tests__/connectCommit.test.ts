// The live-Anki commit path (Phase 6 of ANKI_DECK_WORKBENCH_PLAN.md).
//
// Only `anki/client` is mocked, so `readConnectDraft` runs for real on both
// sides of the commit: the fingerprint precondition, the plan and the read-back
// verification are all measured against the app's own draft model rather than
// against a stub of it. The fake collection below mutates the way Anki does —
// a write bumps `mod`, which is what moves the fingerprint.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApkgExportChangeSet } from '../../shared/ankiApkgExport';

const invoke = vi.fn();

// Only the transport is faked. `settingsFailure` comes through untouched: the
// in-band-refusal case below exists because that decoder is what turns a 200
// body into a failure, and a stub of it would reproduce the defect it guards.
vi.mock('../anki/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../anki/client')>()),
  invoke: (...args: unknown[]) => invoke(...args),
  toUiError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  isUnreachable: (err: unknown) => err instanceof Error && err.message === 'UNREACHABLE',
  isCollectionUnavailable: (err: unknown) => err instanceof Error && err.message === 'COLLECTION',
}));

const { commitConnectDraft } = await import('../anki/connectCommit');

const MODEL = {
  id: 1767397623232,
  name: 'Basic',
  type: 0,
  css: '',
  sortf: 0,
  flds: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 },
  ],
  tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
};

const NOTE_A = 1782214626001;
const NOTE_B = 1782214626002;
const CARD_A = 1782214626101;
const CARD_B = 1782214626102;

interface FakeNote {
  id: number;
  front: string;
  back: string;
  tags: string[];
  mod: number;
  deck: string;
}
interface FakeCard {
  id: number;
  note: number;
  due: number;
  deck: string;
}

/** A collection that answers reads and remembers writes, like the real thing. */
class FakeCollection {
  notes: FakeNote[] = [
    { id: NOTE_A, front: '犬', back: 'dog', tags: ['core', 'marked'], mod: 1782214626, deck: 'JP' },
    { id: NOTE_B, front: '猫', back: 'cat', tags: [], mod: 1782214626, deck: 'JP' },
  ];
  cards: FakeCard[] = [
    { id: CARD_A, note: NOTE_A, due: 10, deck: 'JP' },
    { id: CARD_B, note: NOTE_B, due: 20, deck: 'JP' },
  ];
  decks: Record<string, number> = { JP: 1782214589474 };
  filteredDecks = new Set<string>();
  /** Actions that must throw, by `${action}:${id}`. */
  failures = new Map<string, Error>();
  /** Frozen so a write cannot move it — used to force `verify-failed`. */
  swallowWrites = false;

  note(id: number): FakeNote | undefined {
    return this.notes.find((n) => n.id === id);
  }

  handle(action: string, params: Record<string, unknown>): unknown {
    switch (action) {
      case 'version':
        return 6;
      case 'getActiveProfile':
        return 'User 1';
      case 'findNotes':
        return this.notes.map((n) => n.id);
      case 'notesInfo':
        return (params.notes as number[])
          .map((id) => this.note(id))
          .filter((n): n is FakeNote => Boolean(n))
          .map((n) => ({
            noteId: n.id,
            modelName: 'Basic',
            profile: 'User 1',
            tags: [...n.tags],
            mod: n.mod,
            cards: this.cards.filter((c) => c.note === n.id).map((c) => c.id),
            fields: { Front: { value: n.front, order: 0 }, Back: { value: n.back, order: 1 } },
          }));
      case 'cardsInfo':
        return (params.cards as number[])
          .map((id) => this.cards.find((c) => c.id === id))
          .filter((c): c is FakeCard => Boolean(c))
          .map((c) => ({
            cardId: c.id,
            note: c.note,
            deckName: c.deck,
            modelName: 'Basic',
            ord: 0,
            type: 0,
            queue: 0,
            due: c.due,
            interval: 0,
            factor: 0,
            reps: 0,
            lapses: 0,
            left: 0,
            mod: 1782214626,
            flags: 0,
          }));
      case 'deckNamesAndIds':
        return this.decks;
      case 'findModelsByName':
        return [MODEL];
      case 'getDeckConfig':
        return { dyn: this.filteredDecks.has(String(params.deck)) ? 1 : 0 };
      case 'updateNoteFields': {
        const req = params.note as { id: number; fields: Record<string, string> };
        const fail = this.failures.get(`updateNoteFields:${req.id}`);
        if (fail) throw fail;
        const target = this.note(req.id);
        if (!target) throw new Error('note was not found');
        if (!this.swallowWrites) {
          if ('Front' in req.fields) target.front = req.fields.Front;
          if ('Back' in req.fields) target.back = req.fields.Back;
          target.mod += 1;
        }
        return null;
      }
      case 'addTags':
      case 'removeTags': {
        const ids = params.notes as number[];
        const tags = String(params.tags).split(' ').filter(Boolean);
        for (const id of ids) {
          const fail = this.failures.get(`${action}:${id}`);
          if (fail) throw fail;
          const target = this.note(id);
          if (!target || this.swallowWrites) continue;
          target.tags =
            action === 'addTags'
              ? [...new Set([...target.tags, ...tags])]
              : target.tags.filter((tag) => !tags.includes(tag));
          target.mod += 1;
        }
        return null;
      }
      case 'setSpecificValueOfCard': {
        const id = Number(params.card);
        const fail = this.failures.get(`setSpecificValueOfCard:${id}`);
        if (fail) throw fail;
        const target = this.cards.find((c) => c.id === id);
        if (!target) throw new Error('card was not found');
        const keys = params.keys as string[];
        const values = params.newValues as unknown[];
        // Anki's own rule, measured 2026-08-16: the value is `setattr` onto an
        // integer column, so a string is refused — HTTP 200, `error: null`, and
        // the verdict inside the result. Writing nothing in that case is what
        // makes this a real reproduction rather than a friendlier fake.
        const bad = keys.findIndex((_k, i) => typeof values[i] !== 'number');
        if (bad >= 0) return [[false, "'str' object cannot be interpreted as an integer"]];
        if (!this.swallowWrites) {
          keys.forEach((key, i) => {
            if (key === 'due') target.due = Number(values[i]);
          });
        }
        return keys.map(() => true);
      }
      default:
        throw new Error(`unexpected action ${action}`);
    }
  }
}

let collection: FakeCollection;

/** The read the commit re-runs; the same one the workbench's source step uses. */
const READ = { noteLimit: 50 };

function wire(): void {
  collection = new FakeCollection();
  invoke.mockImplementation(async (action: string, params?: Record<string, unknown>) =>
    collection.handle(action, params ?? {}),
  );
}

/** Fingerprint of the collection right now, computed the way the reader does. */
async function currentFingerprint(): Promise<string> {
  const { readConnectDraft } = await import('../anki/connectDraftRead');
  const read = await readConnectDraft(READ);
  return read.draft?.source.fingerprint ?? '';
}

function callsTo(action: string) {
  return invoke.mock.calls.filter((call) => call[0] === action);
}

/** Every action that can change the collection. Zero of these is the control. */
function mutatingCalls() {
  return invoke.mock.calls.filter((call) =>
    ['updateNoteFields', 'addTags', 'removeTags', 'setSpecificValueOfCard'].includes(
      String(call[0]),
    ),
  );
}

const fieldEdit: ApkgExportChangeSet = {
  notes: [{ noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'] }],
  cardMoves: [],
};

describe('commitConnectDraft', () => {
  beforeEach(() => {
    invoke.mockReset();
    wire();
  });

  it('writes fields by name, moves a card, and proves it by re-reading', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [{ noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'], tags: ['core', 'jlpt5'] }],
        cardMoves: [{ cardId: String(CARD_A), noteId: String(NOTE_A), due: 3 }],
      },
    });

    expect(result.errorCode).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.notesUpdated).toBe(1);
    expect(result.cardsUpdated).toBe(1);
    expect(result.verified).toBe(true);
    expect(result.profile).toBe('User 1');
    // The fingerprint has to move: it is what a later commit checks against.
    expect(result.fingerprint).not.toBe(fingerprint);

    const [, wrote] = callsTo('updateNoteFields')[0];
    expect(wrote).toEqual({ note: { id: NOTE_A, fields: { Front: '犬（いぬ）', Back: 'dog' } } });
    expect(callsTo('addTags')[0][1]).toEqual({ notes: [NOTE_A], tags: 'jlpt5' });
    expect(callsTo('setSpecificValueOfCard')[0][1]).toEqual({
      card: CARD_A,
      keys: ['due'],
      newValues: [3],
      warning_check: true,
    });
    expect(collection.cards.find((c) => c.id === CARD_A)?.due).toBe(3);
    // The card nobody moved stays where it was.
    expect(collection.cards.find((c) => c.id === CARD_B)?.due).toBe(20);
  });

  it('never removes the marked tag, because the draft does not carry it', async () => {
    const fingerprint = await currentFingerprint();
    // NOTE_A is `marked` in Anki; the draft models that as a flag, so the tag
    // list the workbench edits has only `core`.
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: { notes: [{ noteId: String(NOTE_A), tags: ['core', 'jlpt5'] }], cardMoves: [] },
    });

    expect(result.ok).toBe(true);
    expect(callsTo('removeTags')).toHaveLength(0);
    expect(collection.note(NOTE_A)?.tags).toContain('marked');
  });

  it('removes a tag the edit dropped, and only that one', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: { notes: [{ noteId: String(NOTE_A), tags: [] }], cardMoves: [] },
    });

    expect(result.ok).toBe(true);
    expect(callsTo('removeTags')[0][1]).toEqual({ notes: [NOTE_A], tags: 'core' });
    expect(collection.note(NOTE_A)?.tags).toEqual(['marked']);
  });

  it('refuses an empty change set without touching Anki', async () => {
    const result = await commitConnectDraft({
      fingerprint: 'connect:2:1782214626',
      read: READ,
      changes: { notes: [], cardMoves: [] },
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('nothing-to-commit');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('refuses when the main process does not know how the draft was read', async () => {
    const result = await commitConnectDraft({ fingerprint: 'connect:9:9', changes: fieldEdit });
    expect(result.errorCode).toBe('no-source');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('refuses when the collection moved in Anki, and writes nothing', async () => {
    const fingerprint = await currentFingerprint();
    // Someone edits in Anki between the read and the commit.
    collection.notes[1].mod += 500;
    const result = await commitConnectDraft({ fingerprint, read: READ, changes: fieldEdit });

    expect(result.errorCode).toBe('source-changed');
    expect(mutatingCalls()).toHaveLength(0);
    expect(collection.note(NOTE_A)?.front).toBe('犬');
  });

  it('refuses a note that is gone, and writes nothing', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [
          { noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'] },
          { noteId: '1782214626999', fields: ['x', 'y'] },
        ],
        cardMoves: [],
      },
    });

    expect(result.errorCode).toBe('note-missing');
    // The refusal is planned before write #1, so the *valid* note is untouched.
    expect(mutatingCalls()).toHaveLength(0);
    expect(collection.note(NOTE_A)?.front).toBe('犬');
  });

  it('refuses a field count that disagrees with the live note type', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: { notes: [{ noteId: String(NOTE_A), fields: ['a', 'b', 'c'] }], cardMoves: [] },
    });

    expect(result.errorCode).toBe('field-count-mismatch');
    expect(result.error).toContain('2 fields in Anki');
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses to reposition a card on loan to a filtered deck', async () => {
    collection.filteredDecks.add('JP');
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [{ noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'] }],
        cardMoves: [{ cardId: String(CARD_A), noteId: String(NOTE_A), due: 3 }],
      },
    });

    expect(result.errorCode).toBe('card-filtered');
    expect(mutatingCalls()).toHaveLength(0);
    expect(collection.cards.find((c) => c.id === CARD_A)?.due).toBe(10);
  });

  it('names every change that did not land instead of one generic failure', async () => {
    const fingerprint = await currentFingerprint();
    collection.failures.set(
      `updateNoteFields:${NOTE_B}`,
      new Error('cannot update note because it is open in the editor'),
    );
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [
          { noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'] },
          { noteId: String(NOTE_B), fields: ['猫（ねこ）', 'cat'] },
        ],
        cardMoves: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('partial');
    expect(result.notesUpdated).toBe(1);
    expect(result.failures).toEqual([
      { kind: 'note', id: String(NOTE_B), reason: 'cannot update note because it is open in the editor' },
    ]);
    // The half that did land is reported as landed, not rolled back in the prose.
    expect(collection.note(NOTE_A)?.front).toBe('犬（いぬ）');
    expect(collection.note(NOTE_B)?.front).toBe('猫');
  });

  it('stops and says how far it got when Anki disappears mid-batch', async () => {
    const fingerprint = await currentFingerprint();
    collection.failures.set(`updateNoteFields:${NOTE_B}`, new Error('UNREACHABLE'));
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [
          { noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'] },
          { noteId: String(NOTE_B), fields: ['猫（ねこ）', 'cat'] },
        ],
        cardMoves: [{ cardId: String(CARD_A), noteId: String(NOTE_A), due: 3 }],
      },
    });

    expect(result.errorCode).toBe('unreachable');
    expect(result.notesUpdated).toBe(1);
    // It stopped: the card after the failing note was never attempted.
    expect(callsTo('setSpecificValueOfCard')).toHaveLength(0);
    expect(result.failures?.[0]).toEqual({
      kind: 'note',
      id: String(NOTE_B),
      reason: 'UNREACHABLE',
    });
  });

  it('sends the due as a number, because a string is refused inside a 200 body', async () => {
    // The first live run against real Anki sent '7' and reported `cardsUpdated
    // 1` on a card that had not moved: `setSpecificValueOfCard` answers
    // `[[false, "'str' object cannot be interpreted as an integer"]]` with
    // `error: null`, so nothing threw. Guarding both halves — what is sent, and
    // that an in-band refusal is read as a failure.
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: { notes: [], cardMoves: [{ cardId: String(CARD_A), noteId: String(NOTE_A), due: 7 }] },
    });

    expect(typeof (callsTo('setSpecificValueOfCard')[0][1] as { newValues: unknown[] }).newValues[0]).toBe(
      'number',
    );
    expect(result.ok).toBe(true);
    expect(result.cardsUpdated).toBe(1);
    expect(collection.cards.find((c) => c.id === CARD_A)?.due).toBe(7);
  });

  it('reads an in-band refusal as a failure rather than as a write', async () => {
    const fingerprint = await currentFingerprint();
    // Anki refuses the column without an HTTP error and without moving the card.
    invoke.mockImplementation(async (action: string, params?: Record<string, unknown>) => {
      if (action === 'setSpecificValueOfCard') return [[false, 'card is in a filtered deck']];
      return collection.handle(action, params ?? {});
    });
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: { notes: [], cardMoves: [{ cardId: String(CARD_A), noteId: String(NOTE_A), due: 7 }] },
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('partial');
    expect(result.cardsUpdated).toBe(0);
    expect(result.failures).toEqual([
      { kind: 'card', id: String(CARD_A), reason: 'card is in a filtered deck' },
    ]);
    expect(collection.cards.find((c) => c.id === CARD_A)?.due).toBe(10);
  });

  it('does not claim success when the re-read cannot find the change', async () => {
    const fingerprint = await currentFingerprint();
    // AnkiConnect answers 200 to everything and stores none of it.
    collection.swallowWrites = true;
    const result = await commitConnectDraft({ fingerprint, read: READ, changes: fieldEdit });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('verify-failed');
    expect(result.verified).toBe(false);
    expect(result.error).toContain(`note ${NOTE_A}: fields differ`);
  });
});
