// @vitest-environment jsdom
/**
 * At-scale benchmark: a 20,000-card deck and a 200,000-row review log.
 *
 * Measures the operations the re-audit named ("full deck copies on every read,
 * per-review load map, deck held in a localStorage cache") against the REAL
 * renderer modules over the in-memory IndexedDB the test suite uses. Numbers
 * are wall-clock medians in this process (jsdom, Node), so they compare runs
 * of this script with each other, not with the packaged app.
 *
 * Run: `node tools/perf/deckScale.cjs [label]`. Results land in
 * `tools/perf/results/deckScale-<label>.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installFakeIndexedDb } from '../../src/renderer/__tests__/helpers/fakeIndexedDb';

const CARDS = Number(process.env.PERF_CARDS ?? 20_000);
const LOG_ROWS = Number(process.env.PERF_LOG_ROWS ?? 200_000);
const LABEL = process.env.PERF_LABEL ?? 'run';
const DAY = 86_400_000;
const NOW = new Date(2026, 9, 9, 15, 0, 0).getTime();

/** Deterministic PRNG so two runs seed the same deck. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const KANJI = '日本語学生先猫犬食飲見聞読書話行来出入上下左右大小中山川田水火木金土天気雨雪電車駅道店';

function pick(r: () => number, alphabet: string, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[Math.floor(r() * alphabet.length)];
  return out;
}

function seedDeck() {
  const r = rng(42);
  const cards = [];
  for (let i = 0; i < CARDS; i++) {
    const word = pick(r, KANJI, 1 + Math.floor(r() * 3));
    const reviewed = r() < 0.7;
    const interval = Math.max(1, Math.floor(r() * 120));
    const book = Math.floor(r() * 60);
    cards.push({
      id: `fc-${i.toString(36)}-${Math.floor(r() * 1e6).toString(36)}`,
      word,
      reading: pick(r, KANA, 2 + Math.floor(r() * 4)),
      meaning: `meaning ${i} ${pick(r, 'abcdefghijklmnopqrstuvwxyz ', 24)}`,
      sentence: `${pick(r, KANA + KANJI, 18)}${word}${pick(r, KANA, 10)}。`,
      source: 'epub',
      bookId: `book-${book}`,
      bookTitle: `Book title ${book}`,
      ...(r() < 0.6 ? { folder: `Folder ${Math.floor(r() * 12)}` } : {}),
      addedAt: NOW - Math.floor(r() * 700) * DAY,
      ...(r() < 0.15 ? { tags: ['imported', `t${Math.floor(r() * 9)}`] } : {}),
      ...(reviewed
        ? {
            srs: {
              version: 2,
              dueAt: NOW + Math.floor((r() - 0.25) * interval) * DAY,
              intervalDays: interval,
              ease: 2.5,
              repetitions: 1 + Math.floor(r() * 12),
              lapses: Math.floor(r() * 4),
              lastReviewedAt: NOW - Math.floor(r() * interval) * DAY,
              lastRating: 'good',
              stability: interval * 1.1,
              difficulty: 5,
              algorithm: 'fsrs',
            },
            introducedAt: NOW - Math.floor(r() * 600) * DAY,
          }
        : {}),
    });
  }
  return cards;
}

function seedLog(cardIds: string[]) {
  const r = rng(7);
  const rows = [];
  const span = 730 * DAY;
  for (let i = 0; i < LOG_ROWS; i++) {
    const at = NOW - span + Math.floor((i / LOG_ROWS) * span) + Math.floor(r() * 60_000);
    const prev = Math.floor(r() * 60);
    const correct = r() < 0.87;
    rows.push({
      id: `rv-${i.toString(36)}`,
      at,
      mode: r() < 0.92 ? 'review' : 'learn',
      cardId: cardIds[Math.floor(r() * cardIds.length)],
      word: 'w',
      rating: correct ? 'good' : 'again',
      correct,
      prevIntervalDays: prev,
      intervalDays: correct ? prev * 2 + 1 : 0,
      ...(prev === 0 ? { isNew: true } : {}),
      durationMs: Math.floor(r() * 20_000),
    });
  }
  return rows;
}

interface Measurement {
  op: string;
  /** First call (cold caches). */
  coldMs: number;
  /** Median of the remaining calls (warm), or the cold time when run once. */
  medianMs: number;
  runs: number;
  note?: string;
}

const results: Measurement[] = [];

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function round(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}

function measure(op: string, runs: number, fn: (i: number) => void, note?: string): void {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn(i);
    times.push(performance.now() - t0);
  }
  results.push({
    op,
    coldMs: round(times[0]),
    medianMs: round(runs > 1 ? median(times.slice(1)) : times[0]),
    runs,
    ...(note ? { note } : {}),
  });
}

async function measureAsync(op: string, runs: number, fn: (i: number) => Promise<void>, note?: string): Promise<void> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn(i);
    times.push(performance.now() - t0);
  }
  results.push({
    op,
    coldMs: round(times[0]),
    medianMs: round(runs > 1 ? median(times.slice(1)) : times[0]),
    runs,
    ...(note ? { note } : {}),
  });
}

describe(`deck at scale: ${CARDS} cards, ${LOG_ROWS} review-log rows`, () => {
  it('measures', async () => {
    const fake = installFakeIndexedDb();
    localStorage.clear();
    const cards = seedDeck();
    const store = { folders: Array.from({ length: 12 }, (_, i) => `Folder ${i}`), cards, savedAt: NOW - DAY };
    const deckJson = JSON.stringify(store);
    const log = seedLog(cards.map((c) => c.id));

    // The durable home: whole-deck record + one record per log row.
    const logRecords: Record<string, unknown> = {};
    for (const row of log) logRecords[`review-log-row:${row.id}`] = row;
    fake.seed('jp-study-db', 'kv', { 'flashcard-deck': store, ...logRecords });

    // The synchronous cache, when it fits (Chromium and jsdom both cap an
    // origin's localStorage around 5M UTF-16 code units).
    let cacheFits = true;
    try {
      localStorage.setItem('jp-flashcard-deck', deckJson);
    } catch {
      cacheFits = false;
    }
    // Spread reviews over days: the per-review load map is only built then.
    localStorage.setItem('jp-flashcard-scheduling-v1', JSON.stringify({ fuzz: true, algorithm: 'fsrs' }));

    const deck = await import('../../src/renderer/flashcardDeck');
    const reviewLog = await import('../../src/renderer/reviewLog');
    const stats = await import('../../src/shared/reviewStats');
    const sharedLog = await import('../../src/shared/reviewLog');
    const known = await import('../../src/renderer/knownWords');
    const presence = await import('../../src/renderer/dictEntryPresence');
    const browser = await import('../../src/shared/ankiWorkbenchBrowser');
    const query = await import('../../src/shared/ankiBrowserQuery');
    const heat = await import('../../src/shared/calendarDayDetail');
    const heat2 = await import('../../src/shared/studyActivityHeatmap');

    // ── deck load ────────────────────────────────────────────────────────────
    if (cacheFits) {
      measure('deck.load.cache (parse from localStorage)', 4, () => {
        deck.resetDeckMemoryForTests();
        deck.loadDeck();
      });
    }
    await measureAsync('deck.load.durable (IndexedDB whole-deck + card records)', 3, async () => {
      await deck.readDurableDeck();
    });
    deck.resetDeckMemoryForTests();
    await measureAsync('deck.restore (boot reconciliation)', 1, async () => {
      await deck.restoreDeckFromIdb();
    }, cacheFits ? 'cache fits' : 'cache overflowed: deck held in memory + IndexedDB');
    expect(deck.loadDeck()).toHaveLength(CARDS);

    measure('deck.read.warm (loadDeck x1000)', 5, () => {
      for (let i = 0; i < 1000; i++) deck.loadDeck();
    });

    // ── due list ─────────────────────────────────────────────────────────────
    measure('due.list (dueDeckCards)', 6, () => {
      deck.dueDeckCards(deck.loadDeck(), NOW);
    });
    measure('due.pickerCounts (reviewSessionCounts)', 6, () => {
      deck.reviewSessionCounts(deck.loadDeck(), true, 'mixed', NOW);
    });

    // ── a review: grade + write ──────────────────────────────────────────────
    const ids = deck.loadDeck().slice(0, 400).map((c) => c.id);
    measure('review.grade (reviewDeckCard)', 60, (i) => {
      deck.reviewDeckCard(ids[i], i % 5 === 0 ? 'again' : 'good', NOW + i * 1000);
    });
    measure('review.uiRefresh (due + counts + search after a grade)', 6, (i) => {
      deck.reviewDeckCard(ids[100 + i], 'good', NOW + 100_000 + i);
      const pool = deck.loadDeck();
      deck.dueDeckCards(pool, NOW);
      deck.reviewSessionCounts(pool, true, 'mixed', NOW);
      deck.searchDeckCards(pool, 'meaning 12');
    });
    measure('review.settle (cache + whole-deck catch-up)', 1, () => {
      deck.settleHotDeck();
    });
    measure('review.gradeAfterSettle (reviewDeckCard)', 30, (i) => {
      deck.reviewDeckCard(ids[200 + i], 'hard', NOW + 200_000 + i * 1000);
    });
    deck.settleHotDeck();
    await deck.settleHotWritesForTests();
    await deck.settleDeckWritesForTests();
    measure('edit.singleCard (updateDeckCard)', 20, (i) => {
      deck.updateDeckCard(ids[300 + i], { meaning: `edited ${i}` });
    });
    deck.settleHotDeck();
    measure('mine.addCard (addDeckCards, one card)', 10, (i) => {
      deck.addDeckCards([{ word: `新語${i}`, reading: 'しんご', meaning: 'new word', source: 'dictionary' }]);
    });
    await deck.settleDeckWritesForTests();

    // ── search / filter ──────────────────────────────────────────────────────
    const queries = ['meaning 12', '日本', 'book title 4', 'xyzzy', 'ねこ', 'is:leech'];
    measure('search.flashcards (searchDeckCards, 6 queries)', 5, () => {
      const pool = deck.loadDeck();
      for (const q of queries) deck.searchDeckCards(pool, q);
    });
    measure('filter.folder (filterDeckCards)', 6, () => {
      deck.filterDeckCards(deck.loadDeck(), 'Folder 3');
    });
    measure('group.byBook (groupDeckByBook)', 6, () => {
      deck.groupDeckByBook(deck.loadDeck());
    });

    // ── Deck Workbench browser over the local deck ───────────────────────────
    let built = deck.loadDeckAsAnkiDraft();
    measure('workbench.draft (loadDeckAsAnkiDraft)', 3, () => {
      built = deck.loadDeckAsAnkiDraft();
    });
    const wbDraft = built.draft;
    let rows: ReturnType<typeof browser.buildBrowserRows> = [];
    measure('workbench.rows (buildBrowserRows)', 3, () => {
      rows = browser.buildBrowserRows(wbDraft, browser.defaultBrowserColumns(wbDraft));
    });
    const schema = { fieldNames: browser.browserFieldNames(wbDraft) };
    measure('workbench.search (filterBrowserRows, 3 queries)', 4, () => {
      for (const q of ['日本', 'meaning 12', 'xyzzy']) query.filterBrowserRows(rows, q, schema);
    });

    // ── stats ────────────────────────────────────────────────────────────────
    measure('log.normalize (all rows -> capped log)', 3, () => {
      sharedLog.normalizeReviewLog(log);
    });
    reviewLog.resetReviewLogForTests();
    await measureAsync('log.load (IndexedDB scan + normalize)', 1, async () => {
      await reviewLog.loadReviewLog();
    });
    const entries = await reviewLog.loadReviewLog();
    const deckCards = deck.loadDeck();
    const since = NOW - 365 * DAY;
    measure('stats.insights (Statistics review insights, 365 d)', 4, () => {
      const daily = stats.dailyReviewStats(entries, 365, NOW);
      stats.weeklyRetention(entries, 52, NOW);
      stats.retentionByInterval(entries, since);
      stats.hourlyBreakdown(entries, since);
      stats.answerTimeSummary(entries, since);
      stats.activityMinutesByDay({}, daily, 365, NOW);
      stats.deckStats(
        deckCards.map((c) => ({ id: c.id, deckKey: `${c.bookId}::${c.bookTitle}`, suspended: c.suspended, srs: c.srs })),
        entries,
        since,
        NOW,
      );
      stats.recallEstimate(deckCards, NOW);
    });
    measure('stats.summary (summarizeReviewLog 30 d)', 4, () => {
      sharedLog.summarizeReviewLog(entries, 30, NOW);
    });
    const studyDays: Record<string, { reviews: number; seconds: number }> = {};
    for (const row of log) {
      const key = stats.localDateKey(row.at);
      const day = studyDays[key] ?? (studyDays[key] = { reviews: 0, seconds: 0 });
      day.reviews += 1;
      day.seconds += 30;
    }
    measure('stats.heatmap (year grid + 365-day strip)', 4, () => {
      heat.yearHeatmap(2026, studyDays as never, {}, 1);
      heat2.buildStudyHeatmap(studyDays as never, {}, new Date(NOW), 365, 1);
    });

    // ── known words ──────────────────────────────────────────────────────────
    const levels: Record<string, { l: number }> = {};
    deckCards.forEach((c, i) => {
      levels[`${c.word}${i}`] = { l: (i % 3) + 1 };
    });
    localStorage.setItem(known.knowledgeKey('ja'), JSON.stringify(levels));
    known.resetKnownWordsCacheForTests();
    measure('known.setInferred (one review, deck-sized store)', 30, (i) => {
      // A different level than the seed, so every call is a real change + write.
      known.setInferredLevel(`${deckCards[i].word}${i}`, (((i + 1) % 3) + 1) as 1 | 2 | 3);
    });
    measure('known.counts (knowledgeCounts)', 6, () => {
      known.knowledgeCounts();
    });

    // ── dictionary: is this word in the deck? ───────────────────────────────
    const words = deckCards.slice(0, 10).map((c) => c.word);
    measure('dict.inDeck (deckPresenceByWord, 10 words)', 10, (i) => {
      presence.deckPresenceByWord(deck.loadDeck(), words.slice(i % 5), 'ja');
    });

    await deck.settleHotWritesForTests();
    await reviewLog.flushReviewLogWrites();

    const out = {
      label: LABEL,
      cards: CARDS,
      logRows: LOG_ROWS,
      deckJsonChars: deckJson.length,
      cacheFits,
      node: process.version,
      at: new Date().toISOString(),
      results,
    };
    const dir = resolve(__dirname, 'results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `deckScale-${LABEL}.json`), `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\n[deckScale] ${LABEL}: ${CARDS} cards (${(deckJson.length / 1e6).toFixed(2)}M chars, cache ${cacheFits ? 'fits' : 'overflows'}), ${LOG_ROWS} log rows`);
    for (const m of results) {
      console.log(`  ${m.op.padEnd(62)} cold ${m.coldMs.toFixed(2).padStart(9)} ms   median ${m.medianMs.toFixed(2).padStart(9)} ms`);
    }
  });
});
