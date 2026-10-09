/**
 * An in-memory AnkiConnect for tests, answered at the `fetch` level so the real
 * client (`main/anki/client.ts`) — request shape, error normalisation, timeouts —
 * is what gets exercised. Covers the actions the review sync, link discovery
 * and media upload use; anything else answers "unsupported action", exactly as
 * an AnkiConnect that does not know it would.
 *
 * Not a test file itself (no `.test.ts`), so vitest does not collect it.
 */

export interface FakeNote {
  noteId: number;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  cards: number[];
}

export interface FakeCard {
  cardId: number;
  note: number;
  ord: number;
  deckName: string;
  type: number;
  queue: number;
  due: number;
  interval: number;
  factor: number;
  reps: number;
  lapses: number;
  /** Epoch seconds. */
  mod: number;
}

export class FakeAnkiConnect {
  profile = 'User 1';
  apiVersion = 6;
  /** Anki's day number for today. */
  today = 500;
  nowSec = () => Math.floor(Date.now() / 1000);
  models: Record<string, string[]> = {};
  notes = new Map<number, FakeNote>();
  cards = new Map<number, FakeCard>();
  media = new Map<string, string>();
  /** Actions this AnkiConnect "does not know". */
  unsupported = new Set<string>();
  /** AnkiConnect configured with an API key the client does not send. */
  requireApiKey = false;
  /** Anki closed: every request fails at the transport. */
  down = false;
  calls: Array<{ action: string; params: Record<string, unknown> }> = [];
  private nextId = 1_700_000_000_000;

  addNote(input: {
    modelName: string;
    fields: Record<string, string>;
    tags?: string[];
    deckName?: string;
    cards?: Array<Partial<FakeCard>>;
  }): FakeNote {
    const noteId = this.nextId++;
    const cardRows = input.cards?.length ? input.cards : [{}];
    const cards = cardRows.map((row, ord) => {
      const cardId = this.nextId++;
      this.cards.set(cardId, {
        cardId,
        note: noteId,
        ord,
        deckName: input.deckName ?? 'Default',
        type: 0,
        queue: 0,
        due: ord + 1,
        interval: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
        mod: 1_600_000_000,
        ...row,
      });
      return cardId;
    });
    const note = { noteId, modelName: input.modelName, fields: { ...input.fields }, tags: input.tags ?? [], cards };
    this.notes.set(noteId, note);
    if (!this.models[input.modelName]) this.models[input.modelName] = Object.keys(input.fields);
    return note;
  }

  deleteNote(noteId: number): void {
    const note = this.notes.get(noteId);
    if (!note) return;
    for (const id of note.cards) this.cards.delete(id);
    this.notes.delete(noteId);
  }

  count(action: string): number {
    return this.calls.filter((call) => call.action === action).length;
  }

  /** Install as the global `fetch`. Returns the stub for `vi.stubGlobal`. */
  fetch = async (_url: unknown, init?: { body?: unknown }): Promise<{ json: () => Promise<unknown> }> => {
    if (this.down) throw new TypeError('fetch failed');
    const body = JSON.parse(String(init?.body ?? '{}')) as { action: string; params?: Record<string, unknown> };
    const params = body.params ?? {};
    this.calls.push({ action: body.action, params });
    let result: unknown = null;
    let error: string | null = null;
    try {
      if (this.requireApiKey) throw new Error('valid api key must be provided');
      if (this.unsupported.has(body.action)) throw new Error('unsupported action');
      result = this.handle(body.action, params);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    return { json: async () => ({ result, error }) };
  };

  private handle(action: string, params: Record<string, unknown>): unknown {
    switch (action) {
      case 'version':
        return this.apiVersion;
      case 'getActiveProfile':
        return this.profile;
      case 'modelFieldNames': {
        const fields = this.models[String(params.modelName)];
        if (!fields) throw new Error(`model was not found: ${String(params.modelName)}`);
        return fields;
      }
      case 'notesInfo':
        return (params.notes as number[]).map((id) => {
          const note = this.notes.get(id);
          if (!note) return {};
          const fields: Record<string, { value: string; order: number }> = {};
          Object.entries(note.fields).forEach(([name, value], order) => {
            fields[name] = { value, order };
          });
          return { noteId: note.noteId, modelName: note.modelName, tags: note.tags, cards: note.cards, fields };
        });
      case 'cardsInfo':
        return (params.cards as number[]).map((id) => {
          const card = this.cards.get(id);
          return card ? { ...card } : {};
        });
      case 'findNotes':
        return this.findNotes(String(params.query));
      case 'findCards':
        return this.findCards(String(params.query));
      case 'areDue':
        return (params.cards as number[]).map((id) => {
          const card = this.cards.get(id);
          if (!card) return false;
          if (card.queue === 2 || card.queue === 3) return card.due <= this.today;
          if (card.queue === 1) return card.due <= this.nowSec();
          return false;
        });
      case 'answerCards':
        return (params.answers as Array<{ cardId: number; ease: number }>).map(({ cardId, ease }) => {
          const card = this.cards.get(cardId);
          if (!card) return false;
          card.reps += 1;
          card.mod = this.nowSec();
          if (ease === 1) {
            card.lapses += card.type === 2 ? 1 : 0;
            card.type = card.type === 2 ? 3 : 1;
            card.queue = 1;
            card.due = this.nowSec() + 600;
          } else {
            card.type = 2;
            card.queue = 2;
            card.interval = Math.max(1, card.interval * (ease === 4 ? 3 : ease === 3 ? 2 : 1.2)) | 0;
            card.due = this.today + card.interval;
          }
          return true;
        });
      case 'getMediaFilesNames': {
        const pattern = String(params.pattern);
        return [...this.media.keys()].filter((name) => name === pattern);
      }
      case 'storeMediaFile':
        this.media.set(String(params.filename), String(params.data));
        return String(params.filename);
      default:
        throw new Error('unsupported action');
    }
  }

  private findNotes(query: string): number[] {
    const nid = /^nid:([\d,]+)$/.exec(query.trim());
    if (nid) return nid[1].split(',').map(Number).filter((id) => this.notes.has(id));
    const model = /"note:((?:[^"\\]|\\.)*)"/.exec(query)?.[1]?.replace(/\\(.)/g, '$1');
    const terms: Array<{ field: string; value: string }> = [];
    for (const m of query.matchAll(/"((?:[^"\\:]|\\.)+):((?:[^"\\]|\\.)*)"/g)) {
      const field = m[1].replace(/\\(.)/g, '$1');
      if (field === 'note') continue;
      terms.push({ field, value: m[2].replace(/\\(.)/g, '$1') });
    }
    return [...this.notes.values()]
      .filter((note) => !model || note.modelName === model)
      .filter((note) => !terms.length || terms.some((t) => (note.fields[t.field] ?? '') === t.value))
      .map((note) => note.noteId);
  }

  private findCards(query: string): number[] {
    const due = /prop:due=(-?\d+)/.exec(query);
    if (!due) return [];
    const offset = Number(due[1]);
    return [...this.cards.values()]
      .filter((card) => card.queue === 2 && card.due === this.today + offset)
      .map((card) => card.cardId);
  }
}
