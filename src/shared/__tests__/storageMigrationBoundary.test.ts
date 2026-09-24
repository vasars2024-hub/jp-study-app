import { describe, expect, it } from 'vitest';
import {
  applyStorageMigration,
  createMemoryStorageMigrationAdapter,
  isDamagedValue,
  planStorageMigration,
  STORAGE_MIGRATION_VERSION,
} from '../storageMigrationBoundary';

describe('storage migration boundary', () => {
  it('plans a deterministic retention set and quarantines unparseable values without dropping them', () => {
    const plan = planStorageMigration({
      localStorage: {
        'jp-flashcard-deck': { cards: 1 },
        'jp-study-csv-editor-v1': 'corrupt local cache',
        'jp-clipboard-history': { entries: [1] },
        transient: 'ignored',
      },
      indexedDb: {
        'flashcard-deck': { cards: 2 },
        'csv-editor': { rows: 3 },
        'reading-annotations': 'data lost after crash',
        'unknown-key': 'kept out of plan',
      },
    }, 2);

    expect(plan.toVersion).toBe(STORAGE_MIGRATION_VERSION);
    expect(plan.retention.keepLocalStorageKeys).toEqual([
      'jp-flashcard-deck',
      'jp-study-csv-editor-v1',
      'jp-clipboard-history',
      'jp-calendar-events',
      'jp-media-tracking-v1',
      'jp-media-study-database-v1',
    ]);
    // Heavy user data is never dropped, even when it does not parse.
    expect(plan.replace.localStorage.map((entry) => entry.key)).toEqual([
      'jp-clipboard-history',
      'jp-flashcard-deck',
      'jp-study-csv-editor-v1',
    ]);
    expect(plan.replace.indexedDb.map((entry) => entry.key)).toEqual([
      'csv-editor',
      'flashcard-deck',
      'reading-annotations',
    ]);
    expect(plan.quarantine.localStorage.map((entry) => entry.key)).toEqual(['jp-study-csv-editor-v1']);
    expect(plan.quarantine.indexedDb.map((entry) => entry.key)).toEqual(['reading-annotations']);
    expect(plan.retention.keepIndexedDbKeys).toContain('level-lists');
    expect(plan.issues.join(' ')).toContain('unreadable localStorage');
    expect(plan.issues.join(' ')).toContain('unreadable IndexedDB');
  });

  it('never flags a healthy value for the words it contains', () => {
    // A deck with a card meaning "corruption" (汚職) used to be removed on boot.
    const deck = JSON.stringify({
      folders: [],
      cards: [
        { id: 'a', word: '汚職', meaning: 'corruption' },
        { id: 'b', word: '欠落', meaning: 'missing file; data lost' },
        { id: 'c', word: '不明', meaning: 'UnknownError' },
      ],
    });
    const plan = planStorageMigration({
      localStorage: { 'jp-flashcard-deck': deck, 'jp-clipboard-history': '["corrupt"]' },
      indexedDb: { 'flashcard-deck': JSON.parse(deck), 'clipboard-history': ['data lost'] },
    }, 4);
    expect(plan.quarantine).toEqual({ localStorage: [], indexedDb: [] });
    expect(plan.issues).toEqual([]);
    expect(plan.replace.localStorage.find((e) => e.key === 'jp-flashcard-deck')?.value).toBe(deck);
    expect(plan.replace.indexedDb.map((e) => e.key)).toEqual(['clipboard-history', 'flashcard-deck']);
  });

  it('flags only values that do not parse into an object or array', () => {
    expect(isDamagedValue('{"cards":[]}')).toBe(false);
    expect(isDamagedValue(JSON.stringify(JSON.stringify({ cards: [] })))).toBe(false); // over-encoded: readers peel it
    expect(isDamagedValue({ cards: [] })).toBe(false);
    expect(isDamagedValue('{"cards":[')).toBe(true);
    expect(isDamagedValue('corrupt')).toBe(true);
    expect(isDamagedValue('42')).toBe(true);
    expect(isDamagedValue(7)).toBe(true);
  });

  it('hands damaged values to the adapter to copy aside', async () => {
    const quarantined: string[] = [];
    const base = createMemoryStorageMigrationAdapter({
      localStorage: { 'jp-flashcard-deck': 'not json' },
      indexedDb: { 'flashcard-deck': { cards: [1] } },
    });
    await applyStorageMigration({
      ...base,
      async quarantine(entries) {
        quarantined.push(...entries.localStorage.map((e) => e.key), ...entries.indexedDb.map((e) => e.key));
      },
    }, 0);
    expect(quarantined).toEqual(['jp-flashcard-deck']);
    expect(base.snapshot().localStorage['jp-flashcard-deck']).toBe('not json');
  });

  it('applies an atomic replacement through the adapter boundary', async () => {
    const adapter = createMemoryStorageMigrationAdapter({
      localStorage: {
        'jp-flashcard-deck': { cards: 1 },
        stale: { remove: true },
      },
      indexedDb: {
        'flashcard-deck': { cards: 2 },
        stale: { remove: true },
      },
    });

    const plan = await applyStorageMigration(adapter, 1);
    const snapshot = adapter.snapshot();

    expect(plan.version).toBe(1);
    expect(snapshot.localStorage).toEqual({
      'jp-flashcard-deck': { cards: 1 },
    });
    expect(snapshot.indexedDb).toEqual({
      'flashcard-deck': { cards: 2 },
    });
  });

  it('keeps the adapter deterministic when re-run on the same snapshot', async () => {
    const adapter = createMemoryStorageMigrationAdapter({
      localStorage: {
        'jp-calendar-events': { rows: [1, 2] },
      },
      indexedDb: {
        'calendar-events': { events: [1] },
      },
    });

    const first = await applyStorageMigration(adapter, 0);
    const second = await applyStorageMigration(adapter, 0);

    expect(first.replace).toEqual(second.replace);
    expect(adapter.snapshot()).toEqual({
      localStorage: {
        'jp-calendar-events': { rows: [1, 2] },
      },
      indexedDb: {
        'calendar-events': { events: [1] },
      },
    });
  });
});
