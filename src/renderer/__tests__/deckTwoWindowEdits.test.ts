// @vitest-environment jsdom
/**
 * Two windows, one card: an edit in one never overwrites a review in the other.
 *
 * Study OS and Blanc each load the deck module. Before per-card versions a
 * write won card by card: window B, whose copy of a card predated window A's
 * review of it, edited the meaning and its copy — old schedule included —
 * replaced A's. Most easily on a deck too big for the localStorage cache, where
 * neither window sees the other's writes until it reads IndexedDB. Each test
 * here runs two real module instances (`vi.resetModules`) over one shared
 * localStorage and one in-memory IndexedDB, as two renderer windows share them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb, type FakeIndexedDb } from './helpers/fakeIndexedDb';
import type { DeckFlashcard } from '../flashcardDeck';

let fake: FakeIndexedDb;
type DeckModule = typeof import('../flashcardDeck');
const windows: DeckModule[] = [];

async function openWindow(): Promise<DeckModule> {
  vi.resetModules();
  const db = await import('../storage/db');
  db.__resetDbForTests();
  const deck = await import('../flashcardDeck');
  deck.resetDeckMemoryForTests();
  deck.resetReviewUndoForTests();
  windows.push(deck);
  return deck;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Let every held write, per-card record and debounced mirror land. */
async function settleAll(...decks: DeckModule[]): Promise<void> {
  for (const deck of decks) {
    await deck.settleHotWritesForTests();
    await deck.settleDeckWritesForTests();
  }
  await wait(600);
  for (const deck of decks) {
    await deck.settleHotWritesForTests();
    await deck.settleDeckWritesForTests();
  }
}

const seed = (n: number) => ({
  folders: [],
  cards: Array.from({ length: n }, (_, i) => ({ id: `fc-${i}`, word: `語${i}`, reading: '', meaning: 'm', source: 'epub', addedAt: i })),
  savedAt: 100,
});

/** The deck is too big for the cache: every write to its key overflows. */
function overflowCache(): void {
  const real = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (key === 'jp-flashcard-deck') throw new DOMException('full', 'QuotaExceededError');
    return real.call(this, key, value);
  });
}

function cardIn(cards: readonly DeckFlashcard[] | undefined, id: string): DeckFlashcard | undefined {
  return cards?.find((card) => card.id === id);
}

beforeEach(() => {
  fake = installFakeIndexedDb();
  localStorage.clear();
});

afterEach(() => {
  for (const w of windows.splice(0)) {
    w.settleHotDeck();
    w.resetDeckMemoryForTests();
  }
  vi.restoreAllMocks();
});

describe('a deck too big for the cache (overflowed in both windows)', () => {
  it('B edits a card A just reviewed: the durable deck and both windows keep the review and the edit', async () => {
    overflowCache();
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(40) });
    const a = await openWindow();
    await a.restoreDeckFromIdb();
    const b = await openWindow();
    await b.restoreDeckFromIdb();

    a.reviewDeckCard('fc-1', 'again');
    await a.settleHotWritesForTests();
    b.updateDeckCard('fc-1', { meaning: 'edited in B' });
    await settleAll(a, b);

    const durable = await b.readDurableDeck();
    expect(cardIn(durable?.cards, 'fc-1')).toMatchObject({ meaning: 'edited in B', srs: { lastRating: 'again' } });
    expect(durable?.cards).toHaveLength(40);
    expect(cardIn(b.loadDeck(), 'fc-1')).toMatchObject({ meaning: 'edited in B', srs: { lastRating: 'again' } });

    // A catches up (its next read sees B's newer overflowed deck and merges).
    a.settleHotDeck();
    await settleAll(a, b);
    expect(cardIn(a.loadDeck(), 'fc-1')).toMatchObject({ meaning: 'edited in B', srs: { lastRating: 'again' } });

    const fresh = await openWindow();
    await fresh.restoreDeckFromIdb();
    expect(cardIn(fresh.loadDeck(), 'fc-1')).toMatchObject({ meaning: 'edited in B', srs: { lastRating: 'again' } });
  });

  it('both windows mid-grading: B\'s edit of A\'s card merges, and nothing either graded is lost', async () => {
    overflowCache();
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(40) });
    const a = await openWindow();
    await a.restoreDeckFromIdb();
    const b = await openWindow();
    await b.restoreDeckFromIdb();

    b.reviewDeckCard('fc-2', 'good');
    a.reviewDeckCard('fc-1', 'hard');
    b.updateDeckCard('fc-1', { sentence: 'B added a sentence' });
    await settleAll(a, b);
    a.settleHotDeck();
    b.settleHotDeck();
    await settleAll(a, b);

    const fresh = await openWindow();
    await fresh.restoreDeckFromIdb();
    const cards = fresh.loadDeck();
    expect(cardIn(cards, 'fc-1')).toMatchObject({ sentence: 'B added a sentence', srs: { lastRating: 'hard' } });
    expect(cardIn(cards, 'fc-2')?.srs).toMatchObject({ lastRating: 'good' });
    expect(cards).toHaveLength(40);
  });

  it('A dies before its catch-up write: its review still survives B\'s whole-deck write', async () => {
    overflowCache();
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(20) });
    const a = await openWindow();
    await a.restoreDeckFromIdb();
    const b = await openWindow();
    await b.restoreDeckFromIdb();

    a.reviewDeckCard('fc-3', 'easy');
    await a.settleHotWritesForTests();
    windows.splice(windows.indexOf(a), 1);
    a.resetDeckMemoryForTests(); // the window is gone: no catch-up, no pagehide

    b.updateDeckCard('fc-3', { meaning: 'B meaning' });
    b.setDeckFolders(['N3']);
    await settleAll(b);
    b.settleHotDeck();
    await settleAll(b);

    const fresh = await openWindow();
    await fresh.restoreDeckFromIdb();
    expect(cardIn(fresh.loadDeck(), 'fc-3')).toMatchObject({ meaning: 'B meaning', srs: { lastRating: 'easy' } });
  });
});

describe('a deck that fits the cache', () => {
  it('B, still holding an old copy, edits a card A reviewed and caught up: B\'s view keeps the review', async () => {
    const a = await openWindow();
    localStorage.setItem(a.FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(seed(10)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(10) });
    a.loadDeck();
    const b = await openWindow();
    b.loadDeck();
    // B is mid-grading on its old copy of the deck.
    b.reviewDeckCard('fc-5', 'good');

    a.reviewDeckCard('fc-1', 'again');
    a.settleHotDeck();
    await settleAll(a);

    b.updateDeckCard('fc-1', { meaning: 'B meaning' });
    expect(cardIn(b.loadDeck(), 'fc-1')).toMatchObject({ meaning: 'B meaning', srs: { lastRating: 'again' } });
    b.settleHotDeck();
    await settleAll(a, b);

    const durable = await a.readDurableDeck();
    expect(cardIn(durable?.cards, 'fc-1')).toMatchObject({ meaning: 'B meaning', srs: { lastRating: 'again' } });
    expect(cardIn(durable?.cards, 'fc-5')?.srs).toMatchObject({ lastRating: 'good' });
  });

  it('two per-card records of one card merge in IndexedDB instead of the later replacing the earlier', async () => {
    const a = await openWindow();
    localStorage.setItem(a.FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(seed(10)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(10) });
    a.loadDeck();
    const b = await openWindow();
    b.loadDeck();

    a.reviewDeckCard('fc-4', 'hard');
    await a.settleHotWritesForTests();
    // Another window's catch-up cleared the journal marker: B cannot tell A's
    // grade is pending, and takes the per-card path on its old copy.
    localStorage.removeItem(a.FLASHCARD_DECK_JOURNAL_KEY);
    b.updateDeckCard('fc-4', { meaning: 'B meaning' });
    await b.settleHotWritesForTests();

    const record = fake.rows('jp-study-db', 'kv')['flashcard-deck-card:fc-4'] as { card: DeckFlashcard };
    expect(record.card).toMatchObject({ meaning: 'B meaning', srs: { lastRating: 'hard' } });
    const durable = await b.readDurableDeck();
    expect(cardIn(durable?.cards, 'fc-4')).toMatchObject({ meaning: 'B meaning', srs: { lastRating: 'hard' } });
  });

  it('the same field edited in both windows: the newer edit wins', async () => {
    const a = await openWindow();
    localStorage.setItem(a.FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(seed(6)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(6) });
    a.loadDeck();
    const b = await openWindow();
    b.loadDeck();
    b.reviewDeckCard('fc-0', 'good'); // B holds its old copy (hot)

    a.updateDeckCard('fc-2', { meaning: 'older, from A' });
    a.settleHotDeck();
    await wait(5);
    b.updateDeckCard('fc-2', { meaning: 'newer, from B' });
    b.settleHotDeck();
    await settleAll(a, b);
    expect(cardIn(a.loadDeck(), 'fc-2')?.meaning).toBe('newer, from B');
    expect(cardIn((await a.readDurableDeck())?.cards, 'fc-2')?.meaning).toBe('newer, from B');
  });
});

describe('versions', () => {
  it('a change stamps exactly the fields it touched; a review stamps the schedule as one group', async () => {
    const deck = await openWindow();
    const base: DeckFlashcard = { id: 'x', word: 'w', reading: '', meaning: 'm', source: 'epub', addedAt: 1 };
    const edited = deck.stampCardChange(base, { ...base, meaning: 'm2', ankiNoteId: undefined }, 1_000);
    expect(edited.fieldRev).toEqual({ meaning: 1_000 });
    expect(edited.rev).toBe(1_000);
    const reviewed = deck.stampCardChange(edited, { ...edited, known: true, srs: { lastRating: 'good' } as never }, 900);
    // Monotonic per card even when the clock steps back.
    expect(reviewed.rev).toBe(1_001);
    expect(reviewed.fieldRev).toEqual({ meaning: 1_000, srs: 1_001 });
    const unlinked = deck.stampCardChange({ ...base, ankiNoteId: 5 }, { ...base, ankiNoteId: undefined }, 2_000);
    expect(unlinked.fieldRev).toEqual({ ankiNoteId: 2_000 });
  });

  it('merges field by field, newer stamp first, ties to the preferred side, and keeps identity when nothing is newer', async () => {
    const deck = await openWindow();
    const base: DeckFlashcard = { id: 'x', word: 'w', reading: '', meaning: 'm', source: 'epub', addedAt: 1 };
    const reviewedElsewhere: DeckFlashcard = { ...base, srs: { lastRating: 'again' } as never, known: undefined, rev: 50, fieldRev: { srs: 50 } };
    const editedHere: DeckFlashcard = { ...base, meaning: 'new', rev: 60, fieldRev: { meaning: 60 } };
    const merged = deck.mergeCardVersions(reviewedElsewhere, editedHere);
    expect(merged).toMatchObject({ meaning: 'new', srs: { lastRating: 'again' }, rev: 60, fieldRev: { srs: 50, meaning: 60 } });
    expect(deck.mergeCardVersions(merged, editedHere)).toEqual(merged);
    expect(deck.mergeCardVersions(base, editedHere)).toBe(editedHere);
    const legacyMine = { ...base, meaning: 'mine' };
    expect(deck.mergeCardVersions(base, legacyMine, true)).toBe(legacyMine);
    expect(deck.mergeCardVersions(base, legacyMine, false)).toBe(base);
    // A deletion is a change like any other: the newer stamp removes the field.
    const deleted: DeckFlashcard = { ...base, rev: 70, fieldRev: { ankiNoteId: 70 } };
    expect(deck.mergeCardVersions({ ...base, ankiNoteId: 9, rev: 10, fieldRev: { ankiNoteId: 10 } }, deleted).ankiNoteId).toBeUndefined();
  });
});
