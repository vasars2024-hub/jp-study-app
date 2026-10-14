// @vitest-environment jsdom
/**
 * Two-way review sync, renderer half: graded reviews of linked cards are queued
 * (and an undo takes them back), the queue drains under the conflict rules and
 * survives Anki being away, a profile switch pauses everything, Anki-owned
 * cards are mirrored rather than rescheduled, and a waiting card Anki already
 * has is linked instead of added twice. `window.api` is a fake main; reviews go
 * through the deck's public review API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
vi.mock('../storage/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/db')>()),
  kvGet: async (key: string) => clone(idb.get(key)),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, clone(value));
  },
  kvDelete: async (key: string) => {
    idb.delete(key);
  },
  kvUpdate: async (key: string, update: (current: unknown) => unknown) => {
    const next = update(clone(idb.get(key)));
    if (next !== undefined) idb.set(key, clone(next));
    return clone(idb.get(key));
  },
  kvBatch: async (ops: Array<{ type: 'put' | 'delete'; key: string; value?: unknown }>) => {
    for (const op of ops) {
      if (op.type === 'put') idb.set(op.key, clone(op.value));
      else idb.delete(op.key);
    }
  },
  kvScanPrefix: async (prefix: string) => [...idb.entries()].filter(([key]) => key.startsWith(prefix)),
}));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: async () => ({ audio: null, reading: null }) }));

import {
  ANKI_SYNC_BACKOFF_BASE_MS,
  type AnkiLinkRequest,
  type AnkiReviewPushItem,
  type AnkiReviewPushResult,
  type AnkiSchedulePullResult,
} from '../../shared/ankiReviewSync';
import { setAnkiOwnsScheduling } from '../ankiSchedulingOwner';
import { linkCardsToExistingAnkiNotes } from '../ankiNoteLinking';
import {
  ankiSyncHasWork,
  installAnkiReviewCapture,
  linkExistingAnkiNotesNow,
  readAnkiReviewOutbox,
  rebindAnkiSyncProfile,
  syncAnkiNow,
} from '../ankiReviewSync';
import { readAnkiScheduleMirror, readAnkiSyncState, setAnkiPushReviewsEnabled } from '../ankiSyncState';
import { addDeckCardsTracked, loadDeck, reviewDeckCard, undoLastReview } from '../flashcardDeck';
import { flushAnkiMineQueue, markAnkiSeen } from '../studyMining';

let profile = 'User 1';
let pushReply: (items: AnkiReviewPushItem[]) => AnkiReviewPushResult;
let pullReply: (noteIds: number[]) => AnkiSchedulePullResult;
let links: Record<string, number> = {};
const pushed: AnkiReviewPushItem[][] = [];
const mined: unknown[] = [];
let offCapture: () => void = () => undefined;

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  pushed.length = 0;
  mined.length = 0;
  profile = 'User 1';
  links = {};
  pushReply = (items) => ({ ok: true, profile, outcomes: Object.fromEntries(items.map((i) => [i.reviewId, 'answered'])) });
  pullReply = () => ({ ok: true, entries: [], profile });
  (window as unknown as { api: unknown }).api = {
    ankiLinkState: async () => ({ state: 'connected', consecutiveFailures: 0 }),
    ankiStatus: async () => ({ connected: true, decks: [], models: [] }),
    ankiSyncProbe: async () => ({ ok: true, apiVersion: 6, profile }),
    ankiPushReviews: async ({ items }: { items: AnkiReviewPushItem[] }) => {
      pushed.push(items);
      return pushReply(items);
    },
    ankiPullSchedule: async ({ noteIds }: { noteIds: number[] }) => pullReply(noteIds),
    ankiFindNoteLinks: async ({ requests }: { requests: AnkiLinkRequest[] }) => ({
      ok: true,
      profile,
      matches: requests.map((r) => ({ key: r.key, noteId: links[r.term] ?? null })),
    }),
    ankiMineNote: async (request: unknown) => {
      mined.push(request);
      return { ok: true, noteId: 777, deckName: 'Mining' };
    },
  };
  offCapture = installAnkiReviewCapture();
});

afterEach(() => {
  offCapture();
  vi.restoreAllMocks();
});

function linkedCard(word = '猫', noteId = 101) {
  return addDeckCardsTracked([{ word, reading: '', meaning: 'm', source: 'dictionary', ankiNoteId: noteId, ankiExported: true }])[0];
}

async function outboxSize(): Promise<number> {
  return (await readAnkiReviewOutbox()).length;
}

describe('capture', () => {
  it('queues a graded review of a linked card, and an undo takes it back', async () => {
    setAnkiPushReviewsEnabled(true);
    const card = linkedCard();
    reviewDeckCard(card.id, 'easy');
    await vi.waitFor(async () => expect(await outboxSize()).toBe(1));
    const [item] = await readAnkiReviewOutbox();
    expect(item).toMatchObject({ cardId: card.id, noteId: 101, ease: 4, attempts: 0 });

    undoLastReview();
    await vi.waitFor(async () => expect(await outboxSize()).toBe(0));
  });

  it('queues nothing with sending off, with Anki owning scheduling, or for a card Anki does not have', async () => {
    const card = linkedCard();
    const local = addDeckCardsTracked([{ word: '犬', reading: '', meaning: 'dog', source: 'dictionary' }])[0];
    reviewDeckCard(card.id, 'good');
    setAnkiPushReviewsEnabled(true);
    setAnkiOwnsScheduling(true);
    reviewDeckCard(card.id, 'good');
    setAnkiOwnsScheduling(false);
    reviewDeckCard(local.id, 'good');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await outboxSize()).toBe(0);
  });
});

describe('push', () => {
  it('keeps every answer while Anki is away, then sends and clears them, with the reason shown in between', async () => {
    setAnkiPushReviewsEnabled(true);
    const card = linkedCard();
    reviewDeckCard(card.id, 'good');
    await vi.waitFor(async () => expect(await outboxSize()).toBe(1));

    pushReply = () => ({ ok: false, outcomes: {}, errorKind: 'unreachable', error: 'down' });
    const away = await syncAnkiNow({ force: true });
    expect(away).toMatchObject({ ok: false, errorKind: 'unreachable' });
    expect(await outboxSize()).toBe(1);
    expect((await readAnkiSyncState()).lastError?.kind).toBe('unreachable');

    pushReply = (items) => ({ ok: true, profile, outcomes: Object.fromEntries(items.map((i) => [i.reviewId, 'answered'])) });
    const back = await syncAnkiNow({ force: true });
    expect(back).toMatchObject({ ok: true, answered: 1 });
    expect(pushed.at(-1)).toEqual([expect.objectContaining({ noteId: 101, ease: 3 })]);
    expect(await outboxSize()).toBe(0);
    const state = await readAnkiSyncState();
    expect(state).toMatchObject({ answeredTotal: 1, boundProfile: 'User 1', outboxCount: 0 });
    expect(state.lastError).toBeUndefined();
    expect(state.lastSyncAt).toBeGreaterThan(0);
  });

  it('holds a fresh answer for the undo grace unless the user forces the sync', async () => {
    setAnkiPushReviewsEnabled(true);
    reviewDeckCard(linkedCard().id, 'good');
    await vi.waitFor(async () => expect(await outboxSize()).toBe(1));
    const waiting = await syncAnkiNow();
    expect(waiting).toMatchObject({ ok: true, answered: 0, waiting: 1 });
    expect(pushed).toEqual([]);
  });

  it('unlinks a card whose note was deleted in Anki and lists it, so Gum schedules it again', async () => {
    setAnkiPushReviewsEnabled(true);
    const card = linkedCard('鳥', 303);
    reviewDeckCard(card.id, 'hard');
    await vi.waitFor(async () => expect(await outboxSize()).toBe(1));
    pushReply = (items) => ({ ok: true, profile, outcomes: Object.fromEntries(items.map((i) => [i.reviewId, 'note-missing'])) });
    const report = await syncAnkiNow({ force: true });
    expect(report).toMatchObject({ ok: true, unlinked: 1, skipped: { 'note-missing': 1 } });
    const after = loadDeck().find((c) => c.id === card.id);
    expect(after?.ankiNoteId).toBeUndefined();
    expect(after?.ankiExported).toBeUndefined();
    expect((await readAnkiSyncState()).unlinked).toEqual([expect.objectContaining({ cardId: card.id, word: '鳥' })]);
  });

  it('moves an answer Anki keeps refusing out of the queue into the panel\'s list, never silently', async () => {
    setAnkiPushReviewsEnabled(true);
    reviewDeckCard(linkedCard('蛙').id, 'good');
    await vi.waitFor(async () => expect(await outboxSize()).toBe(1));
    pushReply = (items) => ({ ok: true, profile, outcomes: Object.fromEntries(items.map((i) => [i.reviewId, 'failed'])) });
    for (let i = 0; i < 4; i += 1) await syncAnkiNow({ force: true });
    expect(await outboxSize()).toBe(1);
    const last = await syncAnkiNow({ force: true });
    expect(last.skipped.failed).toBe(1);
    expect(await outboxSize()).toBe(0);
    expect((await readAnkiSyncState()).failedAnswers).toEqual([expect.objectContaining({ word: '蛙' })]);
  });

  it('sends every answer to a card in order: "again then good" goes out as both', async () => {
    setAnkiPushReviewsEnabled(true);
    const card = linkedCard();
    reviewDeckCard(card.id, 'again', Date.now() - 120_000);
    reviewDeckCard(card.id, 'good', Date.now() - 60_000);
    await vi.waitFor(async () => expect(await outboxSize()).toBe(2));
    const report = await syncAnkiNow();
    expect(report).toMatchObject({ ok: true, answered: 2 });
    expect(pushed).toHaveLength(1);
    expect(pushed[0].map((item) => item.ease)).toEqual([1, 3]);
  });
});

describe('rule 10: errors keep the queue', () => {
  async function queueOne(): Promise<void> {
    setAnkiPushReviewsEnabled(true);
    reviewDeckCard(linkedCard().id, 'good');
    await vi.waitFor(async () => expect(await outboxSize()).toBe(1));
  }

  it.each(['unsupported', 'permission', 'version'] as const)('"%s" pauses sync, keeps the answer, and costs it no attempt', async (kind) => {
    await queueOne();
    pushReply = () => ({ ok: false, outcomes: {}, errorKind: kind, error: 'refused' });
    for (let i = 0; i < 7; i += 1) {
      const report = await syncAnkiNow({ force: true });
      expect(report).toMatchObject({ ok: false, errorKind: kind, paused: true });
    }
    const [item] = await readAnkiReviewOutbox();
    expect(item.attempts).toBe(0);
    const state = await readAnkiSyncState();
    expect(state.paused).toMatchObject({ kind });
    expect(state.lastError?.kind).toBe(kind);
    expect(state.failedAnswers).toEqual([]);
    // Background ticks wait for the user; Anki reconnecting is worth one try.
    expect(await ankiSyncHasWork()).toBe(false);
    expect(await ankiSyncHasWork(Date.now(), { resume: true })).toBe(true);

    // The user fixed it and pressed Sync now.
    pushReply = (items) => ({ ok: true, profile, outcomes: Object.fromEntries(items.map((i) => [i.reviewId, 'answered'])) });
    expect(await syncAnkiNow({ force: true })).toMatchObject({ ok: true, answered: 1 });
    const after = await readAnkiSyncState();
    expect(after.paused).toBeUndefined();
    expect(after.lastError).toBeUndefined();
  });

  it('a pause found by the probe (AnkiConnect API too old) keeps the queue too', async () => {
    await queueOne();
    (window as unknown as { api: { ankiSyncProbe: unknown } }).api.ankiSyncProbe = async () => ({ ok: false, apiVersion: 5, errorKind: 'version', error: 'AnkiConnect API version 5' });
    expect(await syncAnkiNow({ force: true })).toMatchObject({ ok: false, errorKind: 'version', paused: true });
    expect(await outboxSize()).toBe(1);
    expect(pushed).toEqual([]);
  });

  it('Anki being away (or an unknown refusal) retries with a growing wait, keeping the answer', async () => {
    await queueOne();
    pushReply = () => ({ ok: false, outcomes: {}, errorKind: 'unreachable', error: 'down' });
    const t0 = Date.now();
    await syncAnkiNow({ force: true });
    const first = (await readAnkiSyncState()).retry ?? { failures: 0, nextAt: 0 };
    expect(first.failures).toBe(1);
    expect(first.nextAt - t0).toBeGreaterThanOrEqual(ANKI_SYNC_BACKOFF_BASE_MS - 1000);
    expect(await ankiSyncHasWork()).toBe(false);
    expect(await ankiSyncHasWork(first.nextAt + 1)).toBe(true);

    pushReply = () => ({ ok: false, outcomes: {}, errorKind: 'api', error: 'something odd' });
    await syncAnkiNow({ force: true });
    const second = (await readAnkiSyncState()).retry ?? { failures: 0, nextAt: 0 };
    expect(second.failures).toBe(2);
    expect(second.nextAt - first.nextAt).toBeGreaterThanOrEqual(ANKI_SYNC_BACKOFF_BASE_MS - 1000);
    const [item] = await readAnkiReviewOutbox();
    expect(item.attempts).toBe(0);

    pushReply = (items) => ({ ok: true, profile, outcomes: Object.fromEntries(items.map((i) => [i.reviewId, 'answered'])) });
    expect(await syncAnkiNow({ force: true })).toMatchObject({ ok: true, answered: 1 });
    expect((await readAnkiSyncState()).retry).toBeUndefined();
  });
});

describe('profiles', () => {
  it('pauses on an Anki profile switch without sending, and resumes after an explicit re-bind', async () => {
    setAnkiPushReviewsEnabled(true);
    await syncAnkiNow({ force: true });
    expect((await readAnkiSyncState()).boundProfile).toBe('User 1');

    reviewDeckCard(linkedCard().id, 'good');
    await vi.waitFor(async () => expect(await outboxSize()).toBe(1));
    profile = 'User 2';
    const paused = await syncAnkiNow({ force: true });
    expect(paused).toMatchObject({ ok: false, errorKind: 'profile-mismatch' });
    expect(pushed).toEqual([]);
    expect((await readAnkiSyncState()).lastError).toMatchObject({ kind: 'profile-mismatch', detail: 'User 1 -> User 2' });

    await rebindAnkiSyncProfile();
    expect(await readAnkiSyncState()).toMatchObject({ boundProfile: 'User 2' });
    expect(await syncAnkiNow({ force: true })).toMatchObject({ ok: true, answered: 1 });
  });
});

describe('Anki owns scheduling', () => {
  it('mirrors Anki\'s state for linked cards, never pushes, and unlinks a deleted note', async () => {
    setAnkiOwnsScheduling(true);
    const kept = linkedCard('猫', 101);
    const deleted = linkedCard('犬', 202);
    pullReply = () => ({
      ok: true,
      profile,
      entries: [
        { noteId: 101, mirror: { noteId: 101, cardId: 9001, state: 'review', intervalDays: 30, isDue: true, reps: 9, lapses: 0, syncedAt: 1 } },
        { noteId: 202, mirror: null },
      ],
    });
    const report = await syncAnkiNow({ force: true });
    expect(report).toMatchObject({ ok: true, pulled: 1, unlinked: 1, answered: 0 });
    expect(pushed).toEqual([]);
    const mirror = await readAnkiScheduleMirror();
    expect(Object.keys(mirror)).toEqual([kept.id]);
    expect(mirror[kept.id]).toMatchObject({ intervalDays: 30, isDue: true });
    expect(loadDeck().find((c) => c.id === deleted.id)?.ankiNoteId).toBeUndefined();
    // The local schedule was not touched: Anki's state is display-only (rule 1).
    expect(loadDeck().find((c) => c.id === kept.id)?.srs).toBeUndefined();
  });

  it('sends the user\'s study-day start hour, so main dates Anki\'s due days on study days', async () => {
    setAnkiOwnsScheduling(true);
    linkedCard('猫', 101);
    localStorage.setItem('jp-flashcard-scheduling-v1', JSON.stringify({ dayStartHour: 6 }));
    const requests: unknown[] = [];
    (window as unknown as { api: { ankiPullSchedule: unknown } }).api.ankiPullSchedule = async (request: { noteIds: number[] }) => {
      requests.push(request);
      return pullReply(request.noteIds);
    };
    await syncAnkiNow({ force: true });
    expect(requests).toEqual([expect.objectContaining({ noteIds: [101], dayStartHour: 6 })]);
  });
});

describe('cards created on another machine', () => {
  it('links a waiting card to the note Anki already has instead of adding it again', async () => {
    setAnkiPushReviewsEnabled(true);
    markAnkiSeen();
    const waiting = addDeckCardsTracked([{ word: '犬', reading: 'いぬ', meaning: 'dog', source: 'dictionary', ankiPending: true }])[0];
    links = { 犬: 555 };
    const report = await flushAnkiMineQueue();
    expect(report.linked).toBe(1);
    expect(mined).toEqual([]);
    expect(loadDeck().find((c) => c.id === waiting.id)).toMatchObject({ ankiNoteId: 555, ankiExported: true });
    expect(loadDeck().find((c) => c.id === waiting.id)?.ankiPending).toBeUndefined();
  });

  it('links a card Anki refused as a duplicate during a sync', async () => {
    setAnkiPushReviewsEnabled(true);
    const dup = addDeckCardsTracked([{ word: '鳥', reading: '', meaning: 'bird', source: 'dictionary', ankiDuplicate: true }])[0];
    links = { 鳥: 808 };
    const report = await syncAnkiNow({ force: true });
    expect(report).toMatchObject({ ok: true, linked: 1 });
    expect(loadDeck().find((c) => c.id === dup.id)).toMatchObject({ ankiNoteId: 808 });
  });

  it('links nothing while sync is off — not in a sync, not in the mining queue, not on a timer', async () => {
    const find = vi.fn((window as unknown as { api: { ankiFindNoteLinks: (r: unknown) => unknown } }).api.ankiFindNoteLinks);
    (window as unknown as { api: { ankiFindNoteLinks: unknown } }).api.ankiFindNoteLinks = find;
    const dup = addDeckCardsTracked([{ word: '鳥', reading: '', meaning: 'bird', source: 'dictionary', ankiDuplicate: true }])[0];
    markAnkiSeen();
    addDeckCardsTracked([{ word: '犬', reading: 'いぬ', meaning: 'dog', source: 'dictionary', ankiPending: true }]);
    links = { 鳥: 808, 犬: 555 };
    expect(await syncAnkiNow({ force: true })).toMatchObject({ ok: true, linked: 0 });
    await flushAnkiMineQueue();
    expect(await ankiSyncHasWork(Date.now() + 365 * 86_400_000)).toBe(false);
    expect(find).not.toHaveBeenCalled();
    expect(loadDeck().find((c) => c.id === dup.id)?.ankiNoteId).toBeUndefined();
    // The waiting card was added as a new note instead (Anki's duplicate check answers for its deck).
    expect(mined).toHaveLength(1);
  });

  it('"Link existing notes" links on request with sync off, paging through every card', async () => {
    const requests: AnkiLinkRequest[][] = [];
    (window as unknown as { api: { ankiFindNoteLinks: unknown } }).api.ankiFindNoteLinks = async ({ requests: page }: { requests: AnkiLinkRequest[] }) => {
      requests.push(page);
      return { ok: true, profile, matches: page.map((r, i) => ({ key: r.key, noteId: 9000 + requests.length * 10 + i })) };
    };
    const words = ['一', '二', '三', '四', '五'];
    addDeckCardsTracked(words.map((word) => ({ word, reading: '', meaning: 'n', source: 'dictionary' as const, ankiDuplicate: true, ankiDeck: 'Mining' })));
    const report = await linkCardsToExistingAnkiNotes(loadDeck(), Date.now(), { explicit: true, batch: 2, pauseMs: 0 });
    expect(report).toMatchObject({ looked: 5, batches: 3 });
    expect(report.linkedIds).toHaveLength(5);
    expect(requests.map((page) => page.length)).toEqual([2, 2, 1]);
    expect(requests.flat().every((r) => r.deck === 'Mining')).toBe(true);
    expect(loadDeck().every((card) => typeof card.ankiNoteId === 'number')).toBe(true);
  });

  it('the panel action probes first and links the whole deck', async () => {
    addDeckCardsTracked([{ word: '鳥', reading: '', meaning: 'bird', source: 'dictionary', ankiDuplicate: true }]);
    links = { 鳥: 808 };
    const report = await linkExistingAnkiNotesNow();
    expect(report.linkedIds).toHaveLength(1);
    profile = 'Someone else';
    expect((await linkExistingAnkiNotesNow()).errorKind).toBe('profile-mismatch');
  });
});
