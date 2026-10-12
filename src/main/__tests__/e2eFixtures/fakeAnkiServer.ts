/**
 * The fake AnkiConnect (`../fakeAnkiConnect.ts`) behind a real HTTP listener, for the
 * headless real-app E2E harness (`tools/e2e`), where the app's own `fetch` must reach it
 * over a socket instead of a stubbed global.
 *
 * The review-sync half (answerCards, areDue, notesInfo, cardsInfo, findNotes …) is the
 * shared fake's, unchanged. What mining needs on top of it — decks, note types, `addNote`,
 * `canAddNotes`, the interval poll's `getIntervals`/`areSuspended` — is answered here, so
 * a card mined in Gum really becomes a note the fake holds, with cards a later review can
 * answer. Listens on 127.0.0.1, ephemeral port; never on 8765.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { FakeAnkiConnect } from '../fakeAnkiConnect';

export interface FakeAnkiServer {
  fake: FakeAnkiConnect;
  port: number;
  url: string;
  decks: Set<string>;
  close(): Promise<void>;
}

type Params = Record<string, unknown>;

interface NoteInput {
  deckName?: string;
  modelName?: string;
  fields?: Record<string, string>;
  tags?: string[];
}

function noteKey(fake: FakeAnkiConnect, note: NoteInput): string {
  // AnkiConnect's duplicate rule: same note type, same first field.
  const fields = fake.models[String(note.modelName)] ?? Object.keys(note.fields ?? {});
  const first = fields[0] ?? '';
  return `${note.modelName}\u0000${(note.fields ?? {})[first] ?? ''}`;
}

/** The mining-side actions the shared fake does not know. Null: not handled here. */
function mining(fake: FakeAnkiConnect, decks: Set<string>, action: string, params: Params): { result: unknown } | null {
  switch (action) {
    case 'requestPermission':
      return { result: { permission: 'granted', requireApikey: false, version: fake.apiVersion } };
    case 'deckNames':
      return { result: [...decks] };
    case 'deckNamesAndIds':
      return { result: Object.fromEntries([...decks].map((d, i) => [d, 1 + i])) };
    case 'createDeck':
      decks.add(String(params.deck));
      return { result: [...decks].indexOf(String(params.deck)) + 1 };
    case 'modelNames':
      return { result: Object.keys(fake.models) };
    case 'createModel': {
      const name = String(params.modelName);
      if (fake.models[name]) throw new Error(`Model name already exists`);
      fake.models[name] = (params.inOrderFields as string[]) ?? [];
      return { result: { name, id: Date.now() } };
    }
    case 'updateModelStyling':
      return { result: null };
    case 'findModelsByName':
      return {
        result: ((params.modelNames as string[]) ?? []).filter((n) => fake.models[n]).map((name, i) => ({
          id: 1_000 + i,
          name,
          type: 0,
          sortf: 0,
          flds: fake.models[name].map((f, ord) => ({ name: f, ord })),
          tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
          css: '',
        })),
      };
    case 'canAddNotes': {
      const existing = new Set([...fake.notes.values()].map((n) => noteKey(fake, n)));
      return { result: ((params.notes as NoteInput[]) ?? []).map((n) => !existing.has(noteKey(fake, n))) };
    }
    case 'addNote': {
      const input = (params.note ?? {}) as NoteInput;
      if (!input.modelName || !fake.models[input.modelName]) throw new Error(`model was not found: ${String(input.modelName)}`);
      if (!input.deckName || !decks.has(input.deckName)) throw new Error(`deck was not found: ${String(input.deckName)}`);
      const key = noteKey(fake, input);
      if ([...fake.notes.values()].some((n) => noteKey(fake, n) === key)) throw new Error('cannot create note because it is a duplicate');
      const note = fake.addNote({
        modelName: input.modelName,
        fields: { ...Object.fromEntries(fake.models[input.modelName].map((f) => [f, ''])), ...(input.fields ?? {}) },
        tags: input.tags ?? [],
        deckName: input.deckName,
      });
      return { result: note.noteId };
    }
    case 'deleteNotes':
      // Undo of a mine (Snip to cards, the player's mining history) removes exactly its notes.
      for (const id of (params.notes as number[]) ?? []) fake.deleteNote(Number(id));
      return { result: null };
    case 'getIntervals':
      return { result: ((params.cards as number[]) ?? []).map((id) => fake.cards.get(id)?.interval ?? null) };
    case 'areSuspended':
      return { result: ((params.cards as number[]) ?? []).map((id) => {
        const card = fake.cards.get(id);
        return card ? card.queue === -1 : null;
      }) };
    case 'findNotes': {
      // The shared fake knows `nid:` and quoted field terms; mining also asks by deck / tag.
      const query = String(params.query ?? '');
      const deck = /"?deck:((?:[^"\\]|\\.)*?)"?(?:\s|$)/.exec(query)?.[1];
      if (deck && !/"[^"]+:[^"]*"/.test(query.replace(/"?deck:[^\s]+/, ''))) {
        const want = deck.replace(/\\(.)/g, '$1').replace(/\*$/, '');
        const ids = [...fake.notes.values()].filter((n) => n.cards.some((c) => (fake.cards.get(c)?.deckName ?? '').startsWith(want))).map((n) => n.noteId);
        return { result: ids };
      }
      return null;
    }
    default:
      return null;
  }
}

export async function startFakeAnkiServer(opts: { profile?: string; decks?: string[] } = {}): Promise<FakeAnkiServer> {
  const fake = new FakeAnkiConnect();
  if (opts.profile) fake.profile = opts.profile;
  const decks = new Set<string>(['Default', ...(opts.decks ?? [])]);

  // The mining actions answer first; the shared fake answers the rest, `multi`
  // included (one request, each inner action recorded in `fake.calls`), and
  // counts HTTP round trips in `fake.requests`.
  fake.extraHandler = (action, params) => mining(fake, decks, action, params);
  const answer = async (body: { action?: string; params?: Params }): Promise<{ result: unknown; error: string | null }> => {
    const res = await fake.fetch('fake://anki', {
      body: JSON.stringify({ action: String(body.action ?? ''), params: body.params ?? {} }),
    });
    return (await res.json()) as { result: unknown; error: string | null };
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      void (async () => {
        if (fake.down) {
          req.socket.destroy();
          return;
        }
        let body: { action?: string; params?: Params } = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          res.writeHead(400);
          res.end();
          return;
        }
        let out: { result: unknown; error: string | null };
        try {
          out = await answer(body);
        } catch (err) {
          out = { result: null, error: err instanceof Error ? err.message : String(err) };
        }
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify(out));
      })();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    fake,
    port,
    url: `http://127.0.0.1:${port}`,
    decks,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
