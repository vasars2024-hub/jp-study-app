// @vitest-environment jsdom
/**
 * A grade writes one card, durably, and never loses it.
 *
 * Before: every grade rewrote the whole deck — JSON.stringify + setItem of the
 * 3.7 MB cache and a structured clone of all 10k cards into IndexedDB — 0.35 to
 * 0.63 s per grade. Now the graded card goes to IndexedDB as its own record at
 * once and the cache catches up in one write when grading pauses. These tests
 * run against the real storage modules over an in-memory IndexedDB, and hold
 * the round-1 rules: the durable deck always has every card, a crash before
 * the cache write loses nothing, and another window's write merges instead of
 * overwriting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb, type FakeIndexedDb } from './helpers/fakeIndexedDb';

let fake: FakeIndexedDb;
/** Every module instance a test made: their pending cache timers must not outlive it. */
const windows: Array<{ resetDeckMemoryForTests: () => void }> = [];

async function freshWindow() {
  vi.resetModules();
  const db = await import('../storage/db');
  db.__resetDbForTests();
  const deck = await import('../flashcardDeck');
  deck.resetDeckMemoryForTests();
  windows.push(deck);
  return deck;
}

function kvRows(): Record<string, unknown> {
  return fake.rows('jp-study-db', 'kv');
}

function cardRecords(): string[] {
  return Object.keys(kvRows()).filter((key) => key.startsWith('flashcard-deck-card:'));
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const seed = (n: number) => ({
  folders: [],
  cards: Array.from({ length: n }, (_, i) => ({ id: `fc-${i}`, word: `語${i}`, reading: '', meaning: 'm', source: 'epub', addedAt: i })),
  savedAt: 100,
});

beforeEach(() => {
  fake = installFakeIndexedDb();
  localStorage.clear();
});

afterEach(() => {
  for (const w of windows.splice(0)) w.resetDeckMemoryForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a review', () => {
  it('writes the graded card to IndexedDB at once and leaves the cache for later', async () => {
    const deck = await freshWindow();
    localStorage.setItem(deck.FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(seed(300)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(300) });
    deck.loadDeck();

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const t0 = performance.now();
    deck.reviewDeckCard('fc-7', 'good');
    const gradeMs = performance.now() - t0;
    const deckWrites = setItem.mock.calls.filter(([key]) => key === deck.FLASHCARD_DECK_STORAGE_KEY);
    expect(deckWrites).toHaveLength(0);
    expect(gradeMs).toBeLessThan(50);

    await deck.settleHotWritesForTests();
    expect(cardRecords()).toEqual(['flashcard-deck-card:fc-7']);
    // What the window reads already has the grade.
    expect(deck.loadDeck().find((c) => c.id === 'fc-7')?.srs).toBeDefined();
    // And the durable deck does too, before the cache has caught up.
    const durable = await deck.readDurableDeck();
    expect(durable?.cards).toHaveLength(300);
    expect(durable?.cards.find((c) => c.id === 'fc-7')?.srs).toBeDefined();
  });

  it('catches the cache and the whole-deck record up in one write, then retires the card records', async () => {
    const deck = await freshWindow();
    localStorage.setItem(deck.FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(seed(50)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(50) });
    deck.loadDeck();
    deck.reviewDeckCard('fc-1', 'good');
    deck.reviewDeckCard('fc-2', 'again');
    await deck.settleHotWritesForTests();
    expect(cardRecords()).toHaveLength(2);

    deck.settleHotDeck();
    const cached = JSON.parse(localStorage.getItem(deck.FLASHCARD_DECK_STORAGE_KEY) ?? '{}');
    expect(cached.cards.find((c: { id: string }) => c.id === 'fc-2').srs.lastRating).toBe('again');
    expect(localStorage.getItem(deck.FLASHCARD_DECK_JOURNAL_KEY)).toBeNull();
    await wait(600);
    expect(cardRecords()).toEqual([]);
    const whole = kvRows()['flashcard-deck'] as { cards: Array<{ id: string; srs?: unknown }> };
    expect(whole.cards.find((c) => c.id === 'fc-1')?.srs).toBeDefined();
  });

  it('survives a crash before the cache write: the next start restores the grade', async () => {
    const a = await freshWindow();
    localStorage.setItem(a.FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(seed(20)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(20) });
    a.loadDeck();
    a.reviewDeckCard('fc-3', 'easy');
    await a.settleHotWritesForTests();
    // The window dies here: no cache write, no pagehide.

    const next = await freshWindow();
    expect(next.loadDeck().find((c) => c.id === 'fc-3')?.srs).toBeUndefined();
    expect(await next.restoreDeckFromIdb()).toBe('durable');
    expect(next.loadDeck().find((c) => c.id === 'fc-3')?.srs).toMatchObject({ lastRating: 'easy' });
    expect(next.loadDeck()).toHaveLength(20);
    await wait(600);
    expect(cardRecords()).toEqual([]);
  });

  it('another window that mines meanwhile keeps the grade and adds its card', async () => {
    const a = await freshWindow();
    localStorage.setItem(a.FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(seed(10)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(10) });
    a.loadDeck();
    a.reviewDeckCard('fc-4', 'good');
    await a.settleHotWritesForTests();

    // Window B: its cache read is stale (the grade is not in it), and the
    // journal marker says so, so its write merges over the durable deck.
    const b = await freshWindow();
    b.addDeckCards([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }]);
    await b.settleDeckWritesForTests();
    await wait(600);

    const durable = await b.readDurableDeck();
    expect(durable?.cards).toHaveLength(11);
    expect(durable?.cards.find((c) => c.id === 'fc-4')?.srs).toBeDefined();
    expect(durable?.cards.some((c) => c.word === '猫')).toBe(true);
    expect(b.loadDeck().find((c) => c.id === 'fc-4')?.srs).toBeDefined();
  });

  it('a backup taken before the cache caught up still holds the grade, and restores it', async () => {
    const deck = await freshWindow();
    localStorage.setItem(deck.FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(seed(8)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(8) });
    deck.loadDeck();
    deck.reviewDeckCard('fc-5', 'hard');
    await deck.settleHotWritesForTests();

    const { collectRendererSnapshot, applyRendererSnapshot } = await import('../storage/backupSnapshot');
    const snapshot = await collectRendererSnapshot({ mirrorReading: false });
    const keys = snapshot.indexedDb['jp-study-db'].stores.kv.entries.map(([key]) => String(key));
    expect(keys).toContain('flashcard-deck-card:fc-5');

    // Restore it into a profile that has moved on (the grade undone everywhere).
    fake = installFakeIndexedDb();
    localStorage.clear();
    const restoredWindow = await freshWindow();
    await applyRendererSnapshot(snapshot);
    const after = await freshWindow();
    await after.restoreDeckFromIdb();
    expect(after.loadDeck().find((c) => c.id === 'fc-5')?.srs).toMatchObject({ lastRating: 'hard' });
    expect(after.loadDeck()).toHaveLength(8);
    void restoredWindow;
  });

  it('an undo is a per-card write too, and puts the schedule back', async () => {
    const deck = await freshWindow();
    localStorage.setItem(deck.FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(seed(5)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(5) });
    deck.loadDeck();
    deck.resetReviewUndoForTests();
    deck.reviewDeckCard('fc-0', 'good');
    deck.undoLastReview();
    await deck.settleHotWritesForTests();
    expect(deck.loadDeck().find((c) => c.id === 'fc-0')?.srs).toBeUndefined();
    const durable = await deck.readDurableDeck();
    expect(durable?.cards.find((c) => c.id === 'fc-0')?.srs).toBeUndefined();
  });
});
