// @vitest-environment jsdom
/**
 * Performance-at-scale pass (perf3): every faster path must give the same
 * answer, and lose nothing, the slower one gave.
 *
 * - A deck too big for the localStorage cache (most 20,000-card decks) now
 *   grades and edits on the per-card IndexedDB path instead of rewriting the
 *   whole deck, and a cache write already known to overflow is not
 *   re-serialised. The durable deck must still hold every grade, a restart
 *   must restore it, and another window's newer deck must still be merged.
 * - Indexes and caches (id index, review-load map, search haystacks, the
 *   dictionary's in-deck index, picker counts, stats day keys, knowledge
 *   counts) must equal what the scans they replace computed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb, type FakeIndexedDb } from './helpers/fakeIndexedDb';
import type { DeckFlashcard } from '../flashcardDeck';
import type { ReviewLogEntry } from '../../shared/reviewLog';

const DECK_KEY = 'jp-flashcard-deck';
const OVERFLOW_KEY = 'jp-flashcard-deck-overflow';
const DAY = 86_400_000;

let fake: FakeIndexedDb;
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
  return Object.keys(kvRows()).filter((key) => key.startsWith('flashcard-deck-card:')).sort();
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function seed(n: number, savedAt = 100) {
  return {
    folders: ['F'],
    cards: Array.from({ length: n }, (_, i) => ({
      id: `fc-${i}`,
      word: `語${i}`,
      reading: '',
      meaning: `m${i}`,
      source: 'epub',
      addedAt: i,
    })),
    savedAt,
  };
}

/** localStorage that refuses any deck cache larger than `maxChars`; returns every attempt's size. */
function capDeckCache(maxChars: number): number[] {
  const real = Storage.prototype.setItem;
  const attempts: number[] = [];
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (key === DECK_KEY) {
      attempts.push(value.length);
      if (value.length > maxChars) throw new DOMException('full', 'QuotaExceededError');
    }
    return real.call(this, key, value);
  });
  return attempts;
}

beforeEach(() => {
  fake = installFakeIndexedDb();
  localStorage.clear();
});

afterEach(() => {
  for (const w of windows.splice(0)) w.resetDeckMemoryForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a deck the cache cannot hold', () => {
  it('grades on the per-card path, and the grade is durable before any whole-deck write', async () => {
    const deck = await freshWindow();
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(30) });
    const attempts = capDeckCache(10);
    expect(await deck.restoreDeckFromIdb()).toBe('durable');
    expect(localStorage.getItem(OVERFLOW_KEY)).not.toBeNull();
    expect(deck.loadDeck()).toHaveLength(30);

    const before = attempts.length;
    deck.reviewDeckCard('fc-3', 'good');
    expect(attempts.length).toBe(before);
    await deck.settleHotWritesForTests();
    expect(cardRecords()).toEqual(['flashcard-deck-card:fc-3']);
    expect(deck.loadDeck().find((c) => c.id === 'fc-3')?.srs).toMatchObject({ lastRating: 'good' });
    const durable = await deck.readDurableDeck();
    expect(durable?.cards).toHaveLength(30);
    expect(durable?.cards.find((c) => c.id === 'fc-3')?.srs).toMatchObject({ lastRating: 'good' });

    // The window dies before its whole-deck write: the next start has it all.
    const next = await freshWindow();
    expect(await next.restoreDeckFromIdb()).toBe('durable');
    expect(next.loadDeck()).toHaveLength(30);
    expect(next.loadDeck().find((c) => c.id === 'fc-3')?.srs).toMatchObject({ lastRating: 'good' });
  });

  it('settles into the whole-deck record and retires the card records, still overflowed', async () => {
    const deck = await freshWindow();
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(12) });
    capDeckCache(10);
    await deck.restoreDeckFromIdb();
    deck.reviewDeckCard('fc-1', 'easy');
    deck.reviewDeckCard('fc-2', 'again');
    await deck.settleHotWritesForTests();
    deck.settleHotDeck();
    await wait(700);
    expect(cardRecords()).toEqual([]);
    const whole = kvRows()['flashcard-deck'] as { cards: DeckFlashcard[]; savedAt: number };
    expect(whole.cards).toHaveLength(12);
    expect(whole.cards.find((c) => c.id === 'fc-1')?.srs?.lastRating).toBe('easy');
    expect(whole.cards.find((c) => c.id === 'fc-2')?.srs?.lastRating).toBe('again');
    expect(Number(localStorage.getItem(OVERFLOW_KEY))).toBe(whole.savedAt);
  });

  it('does not re-serialise a write already known to overflow, and retries once the deck shrinks', async () => {
    const deck = await freshWindow();
    const big = seed(40);
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': big });
    const fits = JSON.stringify({ ...big, cards: big.cards.slice(0, 5) }).length + 200;
    const attempts = capDeckCache(fits);
    await deck.restoreDeckFromIdb();
    const afterRestore = attempts.length;
    expect(afterRestore).toBe(1);

    deck.addDeckCards([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }]);
    expect(attempts.length).toBe(afterRestore);
    expect(deck.loadDeck()).toHaveLength(41);
    expect(localStorage.getItem(OVERFLOW_KEY)).not.toBeNull();

    // Shrinks below the size that overflowed: the cache is tried, fits, and wins again.
    deck.removeDeckCards(deck.loadDeck().slice(0, 37).map((c) => c.id));
    expect(attempts.length).toBe(afterRestore + 1);
    expect(localStorage.getItem(OVERFLOW_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(DECK_KEY) ?? '{}').cards).toHaveLength(4);
    await deck.settleDeckWritesForTests();
  });

  it('still merges another window\'s newer overflowed deck over a skipped write', async () => {
    const deck = await freshWindow();
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(10) });
    capDeckCache(10);
    await deck.restoreDeckFromIdb();
    // A skipped write: this window's overflow copy has no serialised base yet.
    deck.addDeckCards([{ word: 'A1', reading: '', meaning: 'a1', source: 'epub' }]);
    await wait(500);

    // Another window edits fc-1 and overflows too: IndexedDB has it, the marker says so.
    const mine = kvRows()['flashcard-deck'] as { folders: string[]; cards: DeckFlashcard[]; savedAt: number };
    const theirs = {
      ...mine,
      cards: mine.cards.map((c) => (c.id === 'fc-1' ? { ...c, meaning: 'edited elsewhere' } : c)),
      savedAt: mine.savedAt + 1_000,
    };
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': theirs });
    localStorage.setItem(OVERFLOW_KEY, String(theirs.savedAt));

    deck.addDeckCards([{ word: 'A2', reading: '', meaning: 'a2', source: 'epub' }]);
    await deck.settleDeckWritesForTests();
    await wait(500);

    const durable = kvRows()['flashcard-deck'] as { cards: DeckFlashcard[] };
    expect(durable.cards.find((c) => c.id === 'fc-1')?.meaning).toBe('edited elsewhere');
    expect(durable.cards.map((c) => c.word)).toEqual(expect.arrayContaining(['A1', 'A2']));
    expect(durable.cards).toHaveLength(12);
    expect(deck.loadDeck().find((c) => c.id === 'fc-1')?.meaning).toBe('edited elsewhere');
  });
});

describe('single-card edits', () => {
  it('updateDeckCard and setDeckCardFolder write one card record, not the deck', async () => {
    const deck = await freshWindow();
    localStorage.setItem(DECK_KEY, JSON.stringify(seed(20)));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': seed(20) });
    deck.loadDeck();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    deck.updateDeckCard('fc-4', { meaning: 'new meaning', ankiExported: true });
    deck.setDeckCardFolder('fc-5', 'F');
    expect(setItem.mock.calls.filter(([key]) => key === DECK_KEY)).toHaveLength(0);
    await deck.settleHotWritesForTests();
    expect(cardRecords()).toEqual(['flashcard-deck-card:fc-4', 'flashcard-deck-card:fc-5']);
    expect(deck.loadDeck().find((c) => c.id === 'fc-4')).toMatchObject({ meaning: 'new meaning', ankiExported: true });

    // Crash before the cache caught up: the next start restores both edits.
    const next = await freshWindow();
    expect(await next.restoreDeckFromIdb()).toBe('durable');
    expect(next.loadDeck().find((c) => c.id === 'fc-4')?.meaning).toBe('new meaning');
    expect(next.loadDeck().find((c) => c.id === 'fc-5')?.folder).toBe('F');
    expect(next.loadDeck()).toHaveLength(20);
  });

  it('an edit of a card that is not there is still a plain write that changes nothing', async () => {
    const deck = await freshWindow();
    localStorage.setItem(DECK_KEY, JSON.stringify(seed(3)));
    deck.loadDeck();
    const cards = deck.updateDeckCard('fc-missing', { meaning: 'x' });
    expect(cards.map((c) => c.meaning)).toEqual(['m0', 'm1', 'm2']);
    await deck.settleHotWritesForTests();
    expect(cardRecords()).toEqual([]);
  });
});

describe('snapshot indexes', () => {
  it('finds a card by id, and survives a snapshot sorted in place', async () => {
    const deck = await freshWindow();
    localStorage.setItem(DECK_KEY, JSON.stringify(seed(50)));
    const cards = deck.loadDeck();
    expect(deck.deckCardIndex(cards, 'fc-7')).toBe(7);
    expect(deck.findDeckCard('fc-7')?.word).toBe('語7');
    cards.reverse();
    expect(cards[deck.deckCardIndex(cards, 'fc-7')].id).toBe('fc-7');
    expect(deck.deckCardIndex(cards, 'nope')).toBe(-1);
  });

  it('carries the review-load map across grades exactly as a rebuild computes it', async () => {
    const deck = await freshWindow();
    const now = new Date(2026, 9, 9, 15).getTime();
    vi.useFakeTimers({ now, toFake: ['Date'] });
    localStorage.setItem('jp-flashcard-scheduling-v1', JSON.stringify({ fuzz: true }));
    const store = seed(60);
    const cards = store.cards.map((c, i) => (i % 3 === 0 ? c : {
      ...c,
      srs: {
        version: 2, dueAt: now + ((i % 9) - 2) * DAY, intervalDays: 1 + (i % 9), ease: 2.5,
        repetitions: 2, lapses: 0, lastReviewedAt: now - DAY, lastRating: 'good',
      },
      ...(i % 11 === 0 ? { suspended: true } : {}),
    }));
    localStorage.setItem(DECK_KEY, JSON.stringify({ ...store, cards }));
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': { ...store, cards } });
    deck.loadDeck();
    for (const [i, rating] of [[1, 'good'], [2, 'again'], [4, 'easy'], [0, 'good'], [7, 'hard'], [1, 'good']] as const) {
      deck.reviewDeckCard(`fc-${i}`, rating, now);
      const snapshot = deck.loadDeck();
      const carried = deck.dueLoadEntriesForTests(snapshot, now);
      const rebuilt = deck.dueLoadEntriesForTests(snapshot, now, true);
      expect(carried).toEqual(rebuilt);
    }
    await deck.settleHotWritesForTests();
  });

  it('picker counts equal reviewSessionCards for every source, mode, and Anki ownership', async () => {
    const deck = await freshWindow();
    const now = new Date(2026, 9, 9, 15).getTime();
    vi.useFakeTimers({ now, toFake: ['Date'] });
    const cards: DeckFlashcard[] = Array.from({ length: 400 }, (_, i) => ({
      id: `c${i}`,
      word: `w${i}`,
      reading: '',
      meaning: '',
      source: 'epub',
      bookId: `b${i % 6}`,
      bookTitle: i % 13 === 0 ? undefined : `Book ${i % 6}`,
      addedAt: i,
      ...(i % 4 === 0 ? {} : {
        srs: {
          version: 2, dueAt: now + ((i % 7) - 3) * DAY, intervalDays: 3, ease: 2.5,
          repetitions: 2, lapses: 0, lastReviewedAt: now - DAY, lastRating: 'good',
        },
      }),
      ...(i % 17 === 0 ? { suspended: true } : {}),
      ...(i % 5 === 0 ? { ankiNoteId: i } : {}),
      ...(i % 3 === 0 ? { audioPath: 'a.mp3' } : {}),
      ...(i % 19 === 0 ? { introducedAt: now - 3_600_000 } : {}),
    })) as DeckFlashcard[];
    localStorage.setItem(DECK_KEY, JSON.stringify({ folders: [], cards, savedAt: 5 }));
    const pool = deck.loadDeck();
    for (const owned of ['0', '1']) {
      localStorage.setItem('jp-anki-owns-scheduling', owned);
      for (const dueOnly of [true, false]) {
        for (const mode of ['mixed', 'text', 'audio'] as const) {
          const counts = deck.reviewSessionCounts(pool, dueOnly, mode, now);
          const keys = ['all', ...new Set(pool.map((c) => `${c.bookId || 'unknown'}::${c.bookTitle || 'Unknown source'}`))];
          expect([...counts.keys()].sort()).toEqual([...keys].sort());
          for (const key of keys) {
            expect(counts.get(key)).toBe(deck.reviewSessionCards(pool, key, dueOnly, mode).length);
          }
        }
      }
    }
  });
});

describe('search haystacks', () => {
  function reference(cards: DeckFlashcard[], query: string): DeckFlashcard[] {
    const q = query.normalize('NFKC').trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      [c.word, c.reading, c.meaning, c.front, c.back, c.sentence, c.bookTitle].some((field) =>
        field ? field.normalize('NFKC').toLowerCase().includes(q) : false,
      ),
    );
  }

  it('match the per-field search for width, case, dakuten and field boundaries', async () => {
    const deck = await freshWindow();
    const cards = [
      { id: 'a', word: 'ｶﾞｯｺｳ', reading: 'がっこう', meaning: 'School', source: 'epub', addedAt: 1 },
      { id: 'b', word: '学校', reading: 'がっこう', meaning: '', sentence: 'ＡＢＣ', source: 'epub', addedAt: 1 },
      { id: 'c', word: 'end', reading: 'start', meaning: 'x', bookTitle: 'Book', source: 'epub', addedAt: 1 },
      { id: 'd', word: '', reading: '', meaning: '', front: 'Q', back: 'A side', source: 'epub', addedAt: 1 },
    ] as DeckFlashcard[];
    for (const q of ['がっこう', 'ガッコウ', 'school', 'abc', 'endstart', 'nd', 'a side', 'BOOK', ' ', 'zzz', '\u0000']) {
      expect(deck.searchDeckCards(cards, q).map((c) => c.id)).toEqual(reference(cards, q).map((c) => c.id));
    }
  });

  it('see an edited card at once (a card is replaced, never edited in place)', async () => {
    const deck = await freshWindow();
    localStorage.setItem(DECK_KEY, JSON.stringify(seed(5)));
    expect(deck.searchDeckCards(deck.loadDeck(), 'needle')).toHaveLength(0);
    deck.updateDeckCard('fc-2', { meaning: 'a needle here' });
    expect(deck.searchDeckCards(deck.loadDeck(), 'needle').map((c) => c.id)).toEqual(['fc-2']);
    await deck.settleHotWritesForTests();
  });
});

describe('dictionary in-deck index', () => {
  it('answers like the scan, per language, and follows a new snapshot', async () => {
    const { deckPresenceByWord } = await import('../dictEntryPresence');
    const card = (word: string, extra: Partial<DeckFlashcard> = {}) =>
      ({ id: word, word, reading: '', meaning: '', source: 'epub', addedAt: 1, ...extra }) as DeckFlashcard;
    const v1 = [card('猫'), card('犬', { ankiNoteId: 4 }), card('ｶﾞ'), card('中', { studyLang: 'zh' }), card('猫', { ankiPending: true })];
    const p1 = deckPresenceByWord(v1, ['猫', '犬', 'ガ', '中', '鳥', ''], 'ja');
    expect(p1.get('猫')).toEqual({ inDeck: true, inAnki: false, ankiPending: true });
    expect(p1.get('犬')).toEqual({ inDeck: true, inAnki: true, ankiPending: false });
    expect(p1.get('ガ')?.inDeck).toBe(true);
    expect(p1.get('中')?.inDeck).toBe(false);
    expect(p1.get('鳥')?.inDeck).toBe(false);
    expect(p1.get('')?.inDeck).toBe(false);
    expect(deckPresenceByWord(v1, ['中'], 'zh').get('中')?.inDeck).toBe(true);
    // A caller mutating its answer cannot poison the index.
    const dog = p1.get('犬');
    if (dog) dog.inAnki = false;
    expect(deckPresenceByWord(v1, ['犬'], 'ja').get('犬')?.inAnki).toBe(true);
    // A new snapshot (or an array that grew) is indexed again.
    const v2 = [...v1, card('鳥')];
    expect(deckPresenceByWord(v2, ['鳥'], 'ja').get('鳥')?.inDeck).toBe(true);
    v1.push(card('魚'));
    expect(deckPresenceByWord(v1, ['魚'], 'ja').get('魚')?.inDeck).toBe(true);
  });
});

describe('durable record read', () => {
  it('reads an object record by the same rule as its JSON, and still peels a string one', async () => {
    const deck = await freshWindow();
    const record = {
      folders: ['A', 3, 'B'],
      cards: [{ id: 'x', word: 'x', reading: '', meaning: '', source: 'epub', addedAt: 1 }, null, { word: 'no id' }],
      savedAt: 42,
    };
    const fromObject = await deck.readDurableDeck(async () => record);
    const fromText = await deck.readDurableDeck(async () => JSON.stringify(record));
    const fromDoubleText = await deck.readDurableDeck(async () => JSON.stringify(JSON.stringify(record)));
    expect(fromObject).toEqual({ folders: ['A', 'B'], cards: [record.cards[0]], savedAt: 42 });
    expect(fromText).toEqual(fromObject);
    expect(fromDoubleText).toEqual(fromObject);
    expect(await deck.readDurableDeck(async () => undefined)).toBeNull();
  });
});

describe('review statistics', () => {
  function key(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function rows(now: number): ReviewLogEntry[] {
    let s = 9;
    const r = (): number => {
      s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
      return s / 2_147_483_648;
    };
    // Unsorted on purpose, spanning the window edges, with a few rows in the future.
    return Array.from({ length: 3_000 }, (_, i) => ({
      id: `r${i}`,
      at: now - Math.floor(r() * 400 * DAY) + (i % 97 === 0 ? 2 * DAY : 0),
      mode: (['review', 'review', 'review', 'learn', 'grammar', 'game'] as const)[i % 6],
      correct: r() < 0.8,
      prevIntervalDays: Math.floor(r() * 40),
      ...(i % 5 === 0 ? { isNew: true } : {}),
      ...(i % 3 === 0 ? { durationMs: 4_000 } : {}),
      ...(i % 23 === 0 ? { source: 'game' as const } : {}),
    }));
  }

  it('daily, weekly and summary figures equal a per-row date scan', async () => {
    const stats = await import('../../shared/reviewStats');
    const log = await import('../../shared/reviewLog');
    const now = new Date(2026, 2, 29, 9).getTime();
    const entries = rows(now);
    for (const days of [1, 7, 30, 365]) {
      const daily = stats.dailyReviewStats(entries, days, now);
      const expected = new Map(daily.map((d) => [d.date, { learning: 0, young: 0, mature: 0, passed: 0, seconds: 0, timed: 0 }]));
      for (const e of entries) {
        const row = expected.get(key(e.at));
        if (e.mode !== 'review' || !row) continue;
        row[stats.reviewMaturity(e)] += 1;
        if (e.correct) row.passed += 1;
        if (typeof e.durationMs === 'number') {
          row.seconds += e.durationMs / 1000;
          row.timed += 1;
        }
      }
      expect(daily).toEqual(daily.map((d) => ({ date: d.date, ...expected.get(d.date) })));

      const summary = log.summarizeReviewLog(entries, days, now);
      const perDay = new Map(summary.perDay.map((d) => [d.date, 0]));
      let reviews = 0;
      let practice = 0;
      for (const e of entries) {
        if (!perDay.has(key(e.at))) continue;
        if (e.mode === 'review') {
          perDay.set(key(e.at), (perDay.get(key(e.at)) ?? 0) + 1);
          reviews += 1;
        } else if (e.mode !== 'grammar' && e.mode !== 'game') {
          practice += 1;
        }
      }
      expect(summary.reviews).toBe(reviews);
      expect(summary.practiceAnswers).toBe(practice);
      expect(summary.perDay.map((d) => d.reviews)).toEqual([...perDay.values()]);
    }
    const weeks = stats.weeklyRetention(entries, 8, now);
    const dates = stats.lastLocalDays(56, now);
    let total = 0;
    for (const e of entries) {
      if (!(e.mode === 'review' && e.source === undefined) || stats.reviewMaturity(e) === 'learning') continue;
      if (dates.includes(key(e.at))) total += 1;
    }
    expect(weeks.reduce((n, w) => n + w.young.total + w.mature.total, 0)).toBe(total);
  });

  it('localDateKeyer answers like localDateKey in any order', async () => {
    const stats = await import('../../shared/reviewStats');
    const dayOf = stats.localDateKeyer();
    const base = new Date(2026, 2, 28, 23, 30).getTime();
    for (const offset of [0, 3_600_000, -1, 26 * 3_600_000, 1, 30 * 60_000, -40 * DAY, 2 * 3_600_000, Number.NaN]) {
      expect(dayOf(base + offset)).toBe(stats.localDateKey(base + offset));
    }
  });

  it('merging normalised rows equals normalising them again', async () => {
    const log = await import('../../shared/reviewLog');
    const now = Date.now();
    const normalized = log.normalizeReviewLog(rows(now));
    const doubled = [...normalized.slice(100), ...normalized.slice(0, 300)].reverse();
    expect(log.mergeNormalizedReviewLog(doubled)).toEqual(log.normalizeReviewLog(doubled));
  });
});

describe('knowledge counts', () => {
  it('are recounted after every write and after a re-read', async () => {
    vi.resetModules();
    const known = await import('../knownWords');
    known.resetKnownWordsCacheForTests();
    localStorage.setItem(known.knowledgeKey('ja'), JSON.stringify({ a: { l: 1 }, b: { l: 3 }, c: { l: 0, m: 1 } }));
    expect(known.knowledgeCounts()).toEqual({ 0: 0, 1: 1, 2: 0, 3: 1 });
    known.setLevel('d', 2);
    expect(known.knowledgeCounts()).toEqual({ 0: 0, 1: 1, 2: 1, 3: 1 });
    expect(known.setInferredLevel('a', 3)).toBe(1);
    const counts = known.knowledgeCounts();
    expect(counts).toEqual({ 0: 0, 1: 0, 2: 1, 3: 2 });
    counts[3] = 99;
    expect(known.knowledgeCounts()[3]).toBe(2);
    localStorage.setItem(known.knowledgeKey('ja'), JSON.stringify({ z: { l: 2 } }));
    known.resetKnownWordsCacheForTests();
    expect(known.knowledgeCounts()).toEqual({ 0: 0, 1: 0, 2: 1, 3: 0 });
  });
});
