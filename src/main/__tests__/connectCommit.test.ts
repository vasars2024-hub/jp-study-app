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

const { commitConnectDraft, cancelConnectCommit } = await import('../anki/connectCommit');

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
  /** Preset per deck name, written by `setDeckConfigId`. */
  deckConfig: Record<string, number> = {};
  deckSeq = 1;
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
      case 'createDeck': {
        const name = String(params.deck);
        const fail = this.failures.get(`createDeck:${name}`);
        if (fail) throw fail;
        // Anki's own behaviour: an existing name is not an error, it just
        // answers the id it already has.
        if (!(name in this.decks)) this.decks[name] = 1782300000000 + this.deckSeq++;
        return this.decks[name];
      }
      case 'setDeckConfigId': {
        const names = params.decks as string[];
        const fail = this.failures.get(`setDeckConfigId:${names.join(',')}`);
        if (fail) throw fail;
        for (const name of names) this.deckConfig[name] = Number(params.configId);
        return true;
      }
      case 'changeDeck': {
        const name = String(params.deck);
        const fail = this.failures.get(`changeDeck:${name}`);
        if (fail) throw fail;
        // `changeDeck` creates the deck when the name is unknown — the real
        // add-on does, and a fake that refused would hide the fact that the
        // explicit `createDeck` above is there for the preset, not the deck.
        if (!(name in this.decks)) this.decks[name] = 1782300000000 + this.deckSeq++;
        for (const id of params.cards as number[]) {
          const target = this.cards.find((c) => c.id === id);
          if (!target || this.swallowWrites) continue;
          target.deck = name;
          const note = this.note(target.note);
          if (note) note.mod += 1;
        }
        return null;
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
    [
      'updateNoteFields',
      'addTags',
      'removeTags',
      'setSpecificValueOfCard',
      'createDeck',
      'setDeckConfigId',
      'changeDeck',
    ].includes(String(call[0])),
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

  it('refuses a deck rename by name, and commits none of the batch beside it', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [{ noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'] }],
        cardMoves: [],
        deckRenames: [{ deckId: '1', from: 'Default', to: 'Japanese::Core' }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('deck-rename-unsupported');
    // The negative control the whole refusal exists for: the note edit beside
    // the rename must NOT have been written.
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses recipe 17 template removal by name, and commits none of the batch beside it', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [{ noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'] }],
        cardMoves: [],
        deckRenames: [],
        templateRemovals: [{ noteTypeId: '1', removedOrds: [1] }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('template-remove-unsupported');
    // Same control as the rename above: AnkiConnect has no remove-template
    // action, so the field edit sharing the batch must not land either.
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('an empty removal list is not a removal, so the batch beside it commits', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [{ noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'] }],
        cardMoves: [],
        deckRenames: [],
        templateRemovals: [{ noteTypeId: '1', removedOrds: [] }],
      },
    });
    expect(result.ok).toBe(true);
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

/**
 * Recipe 13's split, live half. The package writer allocates its own deck ids;
 * this side cannot — AnkiConnect addresses a deck by NAME and Anki allocates the
 * id — so every assertion here is about the name and about what the RE-READ
 * finds, never about an id the commit chose.
 */
describe('commitConnectDraft — recipe 13 split', () => {
  beforeEach(() => {
    invoke.mockReset();
    wire();
  });

  /** One card into a subdeck the split invented, which Anki does not have yet. */
  const MINTED = 'split:1782214589474:N5';
  function splitOneCard(deckId = MINTED, name = 'JP::N5'): ApkgExportChangeSet {
    return {
      notes: [],
      cardMoves: [],
      cardDeckMoves: [{ cardId: String(CARD_A), noteId: String(NOTE_A), deckId }],
      deckCreates: [{ deckId, name, configId: '1782214589999' }],
    };
  }

  it('creates the subdeck, applies the parent preset, and refiles the card', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: splitOneCard(),
    });

    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.cardsUpdated).toBe(1);
    expect(callsTo('createDeck').map((c) => c[1])).toEqual([{ deck: 'JP::N5' }]);
    expect(callsTo('setDeckConfigId').map((c) => c[1])).toEqual([
      { decks: ['JP::N5'], configId: 1782214589999 },
    ]);
    expect(callsTo('changeDeck').map((c) => c[1])).toEqual([
      { cards: [CARD_A], deck: 'JP::N5' },
    ]);
    // The claim, read out of the collection rather than off the result.
    expect(collection.cards.find((c) => c.id === CARD_A)?.deck).toBe('JP::N5');
    expect(collection.deckConfig['JP::N5']).toBe(1782214589999);
    // The card that was not in the split stayed exactly where it was.
    expect(collection.cards.find((c) => c.id === CARD_B)?.deck).toBe('JP');
  });

  it('sends one changeDeck call for every card going to the same deck', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [],
        cardMoves: [],
        cardDeckMoves: [
          { cardId: String(CARD_A), noteId: String(NOTE_A), deckId: MINTED },
          { cardId: String(CARD_B), noteId: String(NOTE_B), deckId: MINTED },
        ],
        deckCreates: [{ deckId: MINTED, name: 'JP::N5' }],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.cardsUpdated).toBe(2);
    expect(callsTo('changeDeck')).toHaveLength(1);
    expect(callsTo('changeDeck')[0][1]).toEqual({ cards: [CARD_A, CARD_B], deck: 'JP::N5' });
    // No preset was described, so none is forced onto the new deck.
    expect(callsTo('setDeckConfigId')).toHaveLength(0);
  });

  it('refiles into a deck the collection already has without creating one', async () => {
    collection.decks['JP::N4'] = 1782214589500;
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [],
        cardMoves: [],
        cardDeckMoves: [
          { cardId: String(CARD_A), noteId: String(NOTE_A), deckId: '1782214589500' },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(callsTo('createDeck')).toHaveLength(0);
    expect(collection.cards.find((c) => c.id === CARD_A)?.deck).toBe('JP::N4');
  });

  it('treats a minted deck Anki already holds as a move, not a create', async () => {
    // The user made the deck in Anki between the read and the commit.
    collection.decks['JP::N5'] = 1782214589600;
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({ fingerprint, read: READ, changes: splitOneCard() });

    expect(result.ok).toBe(true);
    expect(callsTo('createDeck')).toHaveLength(0);
    // Nor is the existing deck's own preset overwritten by the split's guess.
    expect(callsTo('setDeckConfigId')).toHaveLength(0);
    expect(collection.cards.find((c) => c.id === CARD_A)?.deck).toBe('JP::N5');
  });

  it('is not a write when the card is already in the target deck', async () => {
    collection.decks['JP::N5'] = 1782214589600;
    const card = collection.cards.find((c) => c.id === CARD_A);
    if (card) card.deck = 'JP::N5';
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({ fingerprint, read: READ, changes: splitOneCard() });

    expect(result.ok).toBe(true);
    expect(result.cardsUpdated).toBe(0);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('counts a card that is both refiled and repositioned once', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [],
        cardMoves: [{ cardId: String(CARD_A), noteId: String(NOTE_A), due: 7 }],
        cardDeckMoves: [{ cardId: String(CARD_A), noteId: String(NOTE_A), deckId: MINTED }],
        deckCreates: [{ deckId: MINTED, name: 'JP::N5' }],
      },
    });

    expect(result.ok).toBe(true);
    // Two change-list entries, one card row in Anki.
    expect(result.cardsUpdated).toBe(1);
    const card = collection.cards.find((c) => c.id === CARD_A);
    expect(card?.deck).toBe('JP::N5');
    expect(card?.due).toBe(7);
  });

  it('refuses a target the collection lacks and the change set does not describe', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [],
        cardMoves: [],
        cardDeckMoves: [{ cardId: String(CARD_A), noteId: String(NOTE_A), deckId: MINTED }],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('deck-missing');
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses filing cards into a filtered deck', async () => {
    collection.decks['Custom Study'] = 1782214589700;
    collection.filteredDecks.add('Custom Study');
    // The deck has to hold a card to be *seen* as filtered: `probeFilteredDecks`
    // only probes deck names the cards reference, so an EMPTY filtered deck
    // reads as normal. That residual hole is recorded in the ledger; putting a
    // card here is what makes this test measure the refusal rather than it.
    const other = collection.cards.find((c) => c.id === CARD_B);
    if (other) other.deck = 'Custom Study';
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [],
        cardMoves: [],
        cardDeckMoves: [
          { cardId: String(CARD_A), noteId: String(NOTE_A), deckId: '1782214589700' },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('deck-filtered');
    expect(result.error).toContain('Custom Study');
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses moving a card that is on loan to a filtered deck', async () => {
    collection.decks['Custom Study'] = 1782214589700;
    collection.filteredDecks.add('Custom Study');
    const card = collection.cards.find((c) => c.id === CARD_A);
    if (card) card.deck = 'Custom Study';
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({ fingerprint, read: READ, changes: splitOneCard() });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('card-filtered');
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('names every card in a batched changeDeck that failed, and totals honestly', async () => {
    collection.failures.set('changeDeck:JP::N5', new Error('deck was not found'));
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: {
        notes: [],
        cardMoves: [],
        cardDeckMoves: [
          { cardId: String(CARD_A), noteId: String(NOTE_A), deckId: MINTED },
          { cardId: String(CARD_B), noteId: String(NOTE_B), deckId: MINTED },
        ],
        deckCreates: [{ deckId: MINTED, name: 'JP::N5' }],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('partial');
    expect(result.cardsUpdated).toBe(0);
    // Both cards named individually — and the denominator counts them the same
    // way, so it can never read "2 of 1 changes did not commit".
    expect(result.failures).toEqual([
      { kind: 'card', id: String(CARD_A), reason: 'deck was not found' },
      { kind: 'card', id: String(CARD_B), reason: 'deck was not found' },
    ]);
    expect(result.error).toBe('2 of 2 changes did not commit.');
    expect(collection.cards.find((c) => c.id === CARD_A)?.deck).toBe('JP');
  });

  it('stops at the first move when Anki goes away, and says how far it got', async () => {
    collection.failures.set('changeDeck:JP::N5', new Error('UNREACHABLE'));
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      changes: splitOneCard(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('unreachable');
    expect(result.cardsUpdated).toBe(0);
    expect(result.failures).toEqual([
      { kind: 'card', id: String(CARD_A), reason: 'UNREACHABLE' },
    ]);
  });

  it('does not claim a split landed when the re-read disagrees', async () => {
    const fingerprint = await currentFingerprint();
    collection.swallowWrites = true;
    const result = await commitConnectDraft({ fingerprint, read: READ, changes: splitOneCard() });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('verify-failed');
    expect(result.verified).toBe(false);
    expect(result.error).toContain(`card ${CARD_A}: deck differs`);
  });

  // --- gate 7: the user stops the batch part-way ------------------------------

  /** Two independent note writes, so a cancel between them leaves exactly one. */
  const twoNoteEdit: ApkgExportChangeSet = {
    notes: [
      { noteId: String(NOTE_A), fields: ['犬（いぬ）', 'dog'] },
      { noteId: String(NOTE_B), fields: ['猫（ねこ）', 'cat'] },
    ],
    cardMoves: [],
  };

  /** Cancels `commitId` the moment the write for `noteId` is sent, not before. */
  function cancelOnNoteWrite(commitId: string, noteId: number): void {
    invoke.mockImplementation(async (action: string, params?: Record<string, unknown>) => {
      const answer = collection.handle(action, params ?? {});
      if (action === 'updateNoteFields') {
        const note = (params?.note ?? {}) as { id?: number };
        if (note.id === noteId) cancelConnectCommit(commitId);
      }
      return answer;
    });
  }

  it('stops after the write in progress and reports what actually landed', async () => {
    const fingerprint = await currentFingerprint();
    const commitId = 'commit-cancel-1';
    cancelOnNoteWrite(commitId, NOTE_A);

    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      commitId,
      changes: twoNoteEdit,
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('cancelled');
    // The write already sent is not un-sent, and the one after it never went.
    expect(result.notesUpdated).toBe(1);
    expect(callsTo('updateNoteFields')).toHaveLength(1);
    expect(collection.note(NOTE_A)?.front).toBe('犬（いぬ）');
    expect(collection.note(NOTE_B)?.front).toBe('猫');
    // Re-read out of the collection, never `planned - sent`.
    expect(result.unwritten).toBe(1);
    // Never a success, and never a verification of a set that is not in there.
    expect(result.verified).toBe(false);
    expect(result.error).toContain('1 of 2');
    expect(result.profile).toBe('User 1');
  });

  // The control. Same change set, same commitId, nobody cancels: if this went
  // green as `cancelled` too, the test above would be measuring the fixture.
  it('writes the whole batch when the same commit is never cancelled', async () => {
    const fingerprint = await currentFingerprint();
    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      commitId: 'commit-cancel-1',
      changes: twoNoteEdit,
    });

    expect(result.ok).toBe(true);
    expect(result.errorCode).toBeUndefined();
    expect(result.notesUpdated).toBe(2);
    expect(result.unwritten).toBeUndefined();
    expect(result.verified).toBe(true);
    expect(callsTo('updateNoteFields')).toHaveLength(2);
  });

  // The reason `unwritten` is read back rather than derived. Here the first
  // write is SENT and does not land, so "how far the loop got" says 1 change is
  // missing and the collection says 2. Only the second number is true.
  it('counts what is missing from the collection, not what it failed to send', async () => {
    const fingerprint = await currentFingerprint();
    const commitId = 'commit-cancel-swallow';
    cancelOnNoteWrite(commitId, NOTE_A);
    collection.swallowWrites = true;

    const result = await commitConnectDraft({
      fingerprint,
      read: READ,
      commitId,
      changes: twoNoteEdit,
    });

    expect(result.errorCode).toBe('cancelled');
    expect(result.notesUpdated).toBe(1);
    // 2 planned − 1 sent would be 1. Anki says neither is in there.
    expect(result.unwritten).toBe(2);
  });

  it('answers false for a token with nothing running under it', () => {
    expect(cancelConnectCommit('never-started')).toBe(false);
    expect(cancelConnectCommit(undefined)).toBe(false);
    expect(cancelConnectCommit('')).toBe(false);
  });

  // The registry is cleared in a `finally`, so a cancel the user clicked a beat
  // too late cannot lie in wait and stop the NEXT commit.
  it('does not let a late cancel poison the following commit', async () => {
    const commitId = 'commit-reused';
    const first = await commitConnectDraft({
      fingerprint: await currentFingerprint(),
      read: READ,
      commitId,
      changes: { notes: [{ noteId: String(NOTE_A), fields: ['犬', 'dog'] }], cardMoves: [] },
    });
    expect(first.ok).toBe(true);

    expect(cancelConnectCommit(commitId)).toBe(false);

    const second = await commitConnectDraft({
      fingerprint: await currentFingerprint(),
      read: READ,
      commitId,
      changes: twoNoteEdit,
    });
    expect(second.ok).toBe(true);
    expect(second.errorCode).toBeUndefined();
    expect(second.notesUpdated).toBe(2);
  });

  // Every caller before gate 7 omitted `commitId`, and those commits stay
  // uninterruptible rather than picking up a stranger's cancel.
  it('cannot be cancelled when the request carries no commitId', async () => {
    const fingerprint = await currentFingerprint();
    invoke.mockImplementation(async (action: string, params?: Record<string, unknown>) => {
      const answer = collection.handle(action, params ?? {});
      if (action === 'updateNoteFields') cancelConnectCommit('commit-cancel-1');
      return answer;
    });

    const result = await commitConnectDraft({ fingerprint, read: READ, changes: twoNoteEdit });

    expect(result.ok).toBe(true);
    expect(result.notesUpdated).toBe(2);
  });
});
