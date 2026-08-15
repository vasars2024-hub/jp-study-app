import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('../anki/client', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  toUiError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const { readConnectDraft } = await import('../anki/connectDraftRead');
const { CONNECT_FILTERED_PROBE_LIMIT, CONNECT_READ_CHUNK } = await import('../../shared/ankiConnectDraft');

const MODEL = {
  id: 1767397623232,
  name: 'Basic',
  type: 0,
  css: '',
  sortf: 0,
  flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
  tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
};

function note(id: number, deck = 'Chinese') {
  return {
    noteId: id,
    modelName: 'Basic',
    profile: 'User 1',
    tags: [],
    mod: 1782214626,
    cards: [id],
    fields: { Front: { value: `w${id}`, order: 0 }, Back: { value: `m${id}`, order: 1 } },
    deckName: deck,
  };
}

function card(id: number, deckName = 'Chinese') {
  return {
    cardId: id,
    note: id,
    deckName,
    ord: 0,
    type: 0,
    queue: 0,
    due: 1,
    interval: 0,
    factor: 0,
    reps: 0,
    lapses: 0,
    left: 0,
    mod: 1782214626,
    flags: 0,
  };
}

/** Route every action to a canned response, recording what was asked. */
function wire(options: {
  noteIds: number[];
  decks?: Record<string, number>;
  deckConfig?: (deck: string) => { dyn?: number };
}) {
  const decks = options.decks ?? { Chinese: 1782214589474 };
  invoke.mockImplementation(async (action: string, params: Record<string, unknown>) => {
    switch (action) {
      case 'version':
        return 6;
      case 'findNotes':
        return options.noteIds;
      case 'notesInfo':
        return (params.notes as number[]).map((id) => note(id));
      case 'cardsInfo':
        return (params.cards as number[]).map((id) => card(id));
      case 'deckNamesAndIds':
        return decks;
      case 'findModelsByName':
        return [MODEL];
      case 'getDeckConfig':
        return options.deckConfig ? options.deckConfig(String(params.deck)) : { dyn: 0 };
      default:
        throw new Error(`unexpected action ${action}`);
    }
  });
}

function callsTo(action: string) {
  return invoke.mock.calls.filter((call) => call[0] === action);
}

describe('readConnectDraft', () => {
  // Braces matter: `() => invoke.mockReset()` returns the mock, and Vitest calls
  // a function returned from a hook as that hook's teardown -- with no arguments,
  // which lands in the router below as `action: undefined` after every test.
  beforeEach(() => {
    invoke.mockReset();
  });

  it('reads a page and reports the whole match count, not the page size', async () => {
    wire({ noteIds: Array.from({ length: 37 }, (_v, i) => 100 + i) });
    const result = await readConnectDraft({ noteOffset: 10, noteLimit: 5 });

    expect(result.ok).toBe(true);
    expect(result.totalNotes).toBe(37);
    expect(result.noteOffset).toBe(10);
    expect(result.draft!.counts.notes).toBe(5);
    expect(result.draft!.notes.map((n) => n.id)).toEqual(['110', '111', '112', '113', '114']);
    expect(result.connect).toMatchObject({ matchedNotes: 37, apiVersion: 6, profile: 'User 1' });
  });

  it('sends deck:* for an empty query, because AnkiConnect rejects a blank one', async () => {
    wire({ noteIds: [1] });
    const result = await readConnectDraft({});
    expect(callsTo('findNotes')[0]![1]).toEqual({ query: 'deck:*' });
    expect(result.connect!.query).toBe('deck:*');

    invoke.mockClear();
    wire({ noteIds: [1] });
    await readConnectDraft({ query: '  tag:mined  ' });
    expect(callsTo('findNotes')[0]![1]).toEqual({ query: 'tag:mined' });
  });

  it('chunks notesInfo and cardsInfo rather than asking for a page in one request', async () => {
    const ids = Array.from({ length: CONNECT_READ_CHUNK * 2 + 3 }, (_v, i) => 1000 + i);
    wire({ noteIds: ids });
    await readConnectDraft({ noteLimit: ids.length });

    expect(callsTo('notesInfo')).toHaveLength(3);
    expect((callsTo('notesInfo')[0]![1] as { notes: number[] }).notes).toHaveLength(CONNECT_READ_CHUNK);
    expect((callsTo('notesInfo')[2]![1] as { notes: number[] }).notes).toHaveLength(3);
    expect(callsTo('cardsInfo')).toHaveLength(3);
  });

  it('marks a filtered deck and probes only the decks the page actually used', async () => {
    wire({
      noteIds: [1],
      decks: { Chinese: 2, 'Custom Study Session': 3, Untouched: 4 },
      deckConfig: (deck) => ({ dyn: deck === 'Chinese' ? 1 : 0 }),
    });
    const result = await readConnectDraft({});

    expect(callsTo('getDeckConfig').map((c) => (c[1] as { deck: string }).deck)).toEqual(['Chinese']);
    expect(result.connect!.filteredDecks).toEqual(['Chinese']);
    expect(result.connect!.filteredProbeTruncated).toBe(false);
    expect(result.draft!.decks.find((d) => d.name === 'Chinese')!.filtered).toBe(true);
  });

  it('caps the filtered probe and says so instead of silently reading fewer decks', async () => {
    const count = CONNECT_FILTERED_PROBE_LIMIT + 4;
    const decks: Record<string, number> = {};
    for (let i = 0; i < count; i += 1) decks[`Deck ${i}`] = 100 + i;
    invoke.mockImplementation(async (action: string, params: Record<string, unknown>) => {
      if (action === 'version') return 6;
      if (action === 'findNotes') return Array.from({ length: count }, (_v, i) => i + 1);
      if (action === 'notesInfo') return (params.notes as number[]).map((id) => note(id));
      if (action === 'cardsInfo') return (params.cards as number[]).map((id) => card(id, `Deck ${id - 1}`));
      if (action === 'deckNamesAndIds') return decks;
      if (action === 'findModelsByName') return [MODEL];
      if (action === 'getDeckConfig') return { dyn: 0 };
      throw new Error(action);
    });

    const result = await readConnectDraft({ noteLimit: count });
    expect(callsTo('getDeckConfig')).toHaveLength(CONNECT_FILTERED_PROBE_LIMIT);
    expect(result.connect!.filteredProbeTruncated).toBe(true);
  });

  it('treats a failed deck-options probe as not-filtered rather than failing the read', async () => {
    wire({ noteIds: [1] });
    const inner = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (action: string, params: Record<string, unknown>) => {
      if (action === 'getDeckConfig') throw new Error('deck was not found');
      return inner(action, params);
    });

    const result = await readConnectDraft({});
    expect(result.ok).toBe(true);
    expect(result.connect!.filteredDecks).toEqual([]);
  });

  it('fetches only the note types the page references', async () => {
    wire({ noteIds: [1, 2] });
    await readConnectDraft({});
    expect((callsTo('findModelsByName')[0]![1] as { modelNames: string[] }).modelNames).toEqual(['Basic']);
  });

  it('never asks for note types when the page is empty', async () => {
    wire({ noteIds: [] });
    const result = await readConnectDraft({});
    expect(callsTo('findModelsByName')).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.draft!.counts.notes).toBe(0);
  });

  it('returns the mapped transport error instead of throwing at the IPC boundary', async () => {
    invoke.mockImplementation(async () => {
      throw new Error('Anki is not reachable');
    });
    const result = await readConnectDraft({});
    expect(result).toEqual({ ok: false, error: 'Anki is not reachable' });
  });

  it('performs no mutating action', async () => {
    wire({ noteIds: [1] });
    await readConnectDraft({});
    const actions = new Set(invoke.mock.calls.map((call) => String(call[0])));
    for (const mutating of ['addNote', 'deleteNotes', 'createDeck', 'createModel', 'storeMediaFile']) {
      expect(actions.has(mutating)).toBe(false);
    }
  });
});
