// @vitest-environment jsdom
/**
 * One shared study database for mining (MASTER_PLAN.md §0, offline-first).
 *
 * Before `mineToStudy`, six in-app surfaces wrote ONLY to Anki: with Anki
 * closed the card was simply lost. These pin the new contract — the local card
 * always exists, the Anki half is queued while Anki is down and lands on the
 * same card (note id stored) when it comes back, and a repeated mine does not
 * duplicate anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
}));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: async () => ({ audio: null, reading: null }) }));

import { ANKI_UNREACHABLE_MSG, type MineNoteRequest, type MineNoteResult } from '../../shared/anki';
import { loadDeck } from '../flashcardDeck';
import {
  ANKI_MINE_QUEUE_KEY,
  ANKI_QUEUE_MAX_ATTEMPTS,
  flushAnkiMineQueue,
  gaveUpAnkiCards,
  markAnkiSeen,
  mineToStudy,
  pendingAnkiCards,
  retryGaveUpAnkiCards,
} from '../studyMining';

let linkState: 'connected' | 'disconnected' = 'disconnected';
const mined: MineNoteRequest[] = [];
let nextResult: () => MineNoteResult = () => ({ ok: true, noteId: 4242, deckName: 'Mining' });

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  mined.length = 0;
  linkState = 'disconnected';
  nextResult = () => ({ ok: true, noteId: 4242, deckName: 'Mining' });
  (window as unknown as { api: unknown }).api = {
    ankiLinkState: async () => ({ state: linkState, consecutiveFailures: 0 }),
    ankiMineNote: async (req: MineNoteRequest) => {
      mined.push(req);
      if (linkState !== 'connected') return { ok: false, error: ANKI_UNREACHABLE_MSG };
      return nextResult();
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const request: MineNoteRequest = {
  route: { source: 'dictionary', cardKind: 'word' },
  term: '猫',
  reading: 'ねこ',
  meaning: 'cat',
  sentence: '猫が好きです。',
};

function mineCat(extra: Partial<Parameters<typeof mineToStudy>[0]> = {}) {
  return mineToStudy({
    word: '猫',
    reading: 'ねこ',
    meaning: 'cat',
    sentence: '猫が好きです。',
    source: 'dictionary',
    sourceTitle: 'Dictionary',
    studyLang: 'ja',
    anki: request,
    notify: false,
    ...extra,
  });
}

describe('the mined language travels with the card', () => {
  it('a Russian card is stored as Russian and its note is routed as Russian', async () => {
    linkState = 'connected';
    markAnkiSeen();
    const result = await mineToStudy({
      word: 'книга',
      meaning: 'book',
      sentence: 'Это книга.',
      source: 'subtitle',
      studyLang: 'ru',
      anki: { route: { source: 'subtitle', cardKind: 'word' }, term: 'книга', sentence: 'Это книга.' },
      notify: false,
    });
    expect(result.card.studyLang).toBe('ru');
    expect(mined.at(-1)?.route?.language).toBe('ru');
  });

  it('a Japanese card keeps the stored convention (no field) and routes as Japanese even for a kanji-only word', async () => {
    linkState = 'connected';
    markAnkiSeen();
    const result = await mineCat({ word: '犬', sentence: undefined, anki: { route: { source: 'dictionary', cardKind: 'word' }, term: '犬' } });
    expect(result.card.studyLang).toBeUndefined();
    expect(mined.at(-1)?.route?.language).toBe('ja');
  });
});

describe('mineToStudy', () => {
  it('keeps a local card with every field even when Anki is closed', async () => {
    markAnkiSeen();
    const result = await mineCat({ sourceUrl: 'https://example.jp/a' });

    expect(result.created).toBe(true);
    expect(result.anki).toBe('queued');
    const [card] = loadDeck();
    expect(card).toMatchObject({
      word: '猫',
      reading: 'ねこ',
      meaning: 'cat',
      sentence: '猫が好きです。',
      source: 'dictionary',
      bookTitle: 'Dictionary',
      sourceUrl: 'https://example.jp/a',
      ankiPending: true,
    });
    // The request is kept for the retry, keyed by the card.
    const queue = idb.get(ANKI_MINE_QUEUE_KEY) as Record<string, { request: MineNoteRequest }>;
    expect(queue[card.id].request.term).toBe('猫');
    // Nothing was sent while Anki was down.
    expect(mined).toHaveLength(0);
  });

  it('sends the queued card when Anki comes back and stores the note id on it', async () => {
    markAnkiSeen();
    await mineCat();
    linkState = 'connected';

    const report = await flushAnkiMineQueue();

    expect(report.sent).toBe(1);
    expect(mined).toHaveLength(1);
    expect(mined[0].sentence).toBe('猫が好きです。');
    const [card] = loadDeck();
    expect(card.ankiNoteId).toBe(4242);
    expect(card.ankiPending).toBeUndefined();
    expect(pendingAnkiCards()).toHaveLength(0);
    expect(Object.keys(idb.get(ANKI_MINE_QUEUE_KEY) as object)).toHaveLength(0);
  });

  it('adds straight to Anki when it is open', async () => {
    linkState = 'connected';
    const result = await mineCat();
    expect(result.anki).toBe('added');
    expect(loadDeck()[0]).toMatchObject({ ankiNoteId: 4242, ankiExported: true, ankiDeck: 'Mining' });
  });

  it('does not duplicate a double click, and does not re-send to Anki', async () => {
    linkState = 'connected';
    const [a, b] = await Promise.all([mineCat(), mineCat()]);
    const c = await mineCat();

    expect(loadDeck()).toHaveLength(1);
    expect(mined).toHaveLength(1);
    expect(a.card.id).toBe(b.card.id);
    expect(c.created).toBe(false);
    expect(c.anki).toBe('added');
  });

  it('treats the same word in a different sentence as a different card', async () => {
    await mineCat({ anki: undefined });
    await mineCat({ anki: undefined, sentence: '猫がいる。' });
    expect(loadDeck()).toHaveLength(2);
  });

  it('never queues for a setup that has never had Anki', async () => {
    const result = await mineCat();
    expect(result.anki).toBe('local');
    expect(loadDeck()[0].ankiPending).toBeUndefined();
    expect(idb.get(ANKI_MINE_QUEUE_KEY)).toBeUndefined();
  });

  it('records an Anki duplicate on the card instead of queueing it', async () => {
    linkState = 'connected';
    nextResult = () => ({ ok: false, error: 'duplicate' });
    const result = await mineCat();
    expect(result.anki).toBe('duplicate');
    expect(loadDeck()[0]).toMatchObject({ ankiDuplicate: true });
    expect(loadDeck()[0].ankiPending).toBeUndefined();
  });

  it('keeps the card but not the queue entry when Anki refuses it', async () => {
    linkState = 'connected';
    nextResult = () => ({ ok: false, error: 'model has no field Front' });
    const result = await mineCat();
    expect(result.anki).toBe('failed');
    expect(result.error).toBe('model has no field Front');
    expect(loadDeck()[0].ankiExportError).toBe('model has no field Front');
    expect(pendingAnkiCards()).toHaveLength(0);
  });

  it('joins a later Add-to-Anki to the card a local save already made', async () => {
    await mineCat({ anki: undefined });
    linkState = 'connected';
    const result = await mineCat();
    expect(result.created).toBe(false);
    expect(result.anki).toBe('added');
    expect(loadDeck()).toHaveLength(1);
    expect(loadDeck()[0].ankiNoteId).toBe(4242);
  });

  it('keeps the extension copy with its page, and queues when main could not reach Anki', async () => {
    markAnkiSeen();
    const result = await mineToStudy({
      word: '猫',
      meaning: 'cat',
      source: 'extension',
      sourceTitle: 'Cats — News',
      sourceUrl: 'https://news.example.jp/cats',
      ankiResult: { ok: false, error: ANKI_UNREACHABLE_MSG },
      notify: false,
    });
    expect(result.anki).toBe('queued');
    expect(loadDeck()[0]).toMatchObject({
      meaning: 'cat',
      bookTitle: 'Cats — News',
      sourceUrl: 'https://news.example.jp/cats',
      ankiPending: true,
    });
    linkState = 'connected';
    await flushAnkiMineQueue();
    // Rebuilt from the card: the request the extension sent lives in main.
    expect(mined[0]).toMatchObject({ term: '猫', meaning: 'cat', route: { source: 'extension' } });
    expect(loadDeck()[0].ankiNoteId).toBe(4242);
  });

  it('replays the exact note main sent for an extension mine — audio, profile and tags — not one rebuilt from the card', async () => {
    markAnkiSeen();
    const sent: MineNoteRequest = {
      term: '猫',
      sentence: '猫が好きです。',
      surface: '猫',
      profileId: 'p-news',
      audioBase64: 'QUJD',
      audioFilename: 'clip.webm',
      extraTags: ['jp-study-app::extension', 'jp-study-app::extension-audio'],
    };
    const result = await mineToStudy({
      word: '猫',
      source: 'extension',
      ankiResult: { ok: false, error: ANKI_UNREACHABLE_MSG },
      anki: sent,
      notify: false,
    });
    expect(result.anki).toBe('queued');
    linkState = 'connected';
    await flushAnkiMineQueue();
    expect(mined.at(-1)).toEqual(sent);
  });

  it('stops draining when Anki goes away mid-queue and keeps the rest', async () => {
    markAnkiSeen();
    await mineCat({ anki: { ...request, term: '犬' }, word: '犬' });
    await mineCat();
    linkState = 'connected';
    let calls = 0;
    nextResult = () => {
      calls += 1;
      if (calls === 1) return { ok: true, noteId: 1 };
      linkState = 'disconnected'; // Anki itself closed, not one slow note
      return { ok: false, error: ANKI_UNREACHABLE_MSG };
    };
    const report = await flushAnkiMineQueue();
    expect(report.sent).toBe(1);
    expect(report.unreachable).toBe(true);
    expect(pendingAnkiCards()).toHaveLength(1);
  });
});

describe('the pending-Anki queue', () => {
  it('a note that keeps timing out no longer blocks the rest, and is given up after the limit', async () => {
    markAnkiSeen();
    await mineCat({ anki: { ...request, term: '犬' }, word: '犬' });
    await mineCat();
    linkState = 'connected';
    // Anki is up, but the 犬 note times out every time.
    nextResult = () => ({ ok: true, noteId: 7 });
    const api = (window as unknown as { api: { ankiMineNote: (req: MineNoteRequest) => Promise<MineNoteResult> } }).api;
    api.ankiMineNote = async (req) => {
      mined.push(req);
      return req.term === '犬' ? { ok: false, error: ANKI_UNREACHABLE_MSG } : nextResult();
    };

    const first = await flushAnkiMineQueue();
    // Before: the drain stopped at 犬 and 猫 never went, however often it ran.
    expect(first.sent).toBe(1);
    expect(loadDeck().find((c) => c.word === '猫')?.ankiNoteId).toBe(7);
    const queue = () => idb.get(ANKI_MINE_QUEUE_KEY) as Record<string, { attempts: number }>;
    const dog = loadDeck().find((c) => c.word === '犬')!;
    expect(queue()[dog.id].attempts).toBe(1);

    for (let i = 1; i < ANKI_QUEUE_MAX_ATTEMPTS; i++) await flushAnkiMineQueue();
    expect(queue()[dog.id].attempts).toBe(ANKI_QUEUE_MAX_ATTEMPTS);
    expect(pendingAnkiCards()).toHaveLength(0);
    expect(gaveUpAnkiCards().map((c) => c.word)).toEqual(['犬']);

    // "Add to Anki now" puts it back with a fresh count.
    expect(await retryGaveUpAnkiCards()).toBe(1);
    expect(pendingAnkiCards().map((c) => c.word)).toEqual(['犬']);
    expect(queue()[dog.id].attempts).toBe(0);
  });

  it('two windows never drain at once, however long a drain takes', async () => {
    markAnkiSeen();
    await mineCat();
    linkState = 'connected';
    const held = new Set<string>();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (name: string, _opts: unknown, cb: (lock: unknown) => Promise<unknown>) => {
          if (held.has(name)) return cb(null);
          held.add(name);
          try {
            return await cb({ name });
          } finally {
            held.delete(name);
          }
        },
      },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = (window as unknown as { api: { ankiMineNote: (req: MineNoteRequest) => Promise<MineNoteResult> } }).api;
    api.ankiMineNote = async (req) => {
      mined.push(req);
      await gate;
      return { ok: true, noteId: 9 };
    };
    try {
      const a = flushAnkiMineQueue();
      await new Promise((resolve) => setTimeout(resolve, 10));
      // A second window, two minutes later: the old lease would have expired.
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
      vi.resetModules();
      const other = await import('../studyMining');
      const b = await other.flushAnkiMineQueue();
      expect(b.sent).toBe(0);
      release();
      expect((await a).sent).toBe(1);
      expect(mined).toHaveLength(1);
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });
});
