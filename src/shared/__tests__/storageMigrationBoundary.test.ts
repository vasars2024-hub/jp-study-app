import { describe, expect, it } from 'vitest';
import {
  applyStorageMigration,
  createMemoryStorageMigrationAdapter,
  planStorageMigration,
  STORAGE_MIGRATION_VERSION,
} from '../storageMigrationBoundary';

describe('storage migration boundary', () => {
  it('plans a deterministic retention set and strips corrupt values before replacement', () => {
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
    expect(plan.replace.localStorage.map((entry) => entry.key)).toEqual([
      'jp-clipboard-history',
      'jp-flashcard-deck',
    ]);
    expect(plan.replace.indexedDb.map((entry) => entry.key)).toEqual([
      'csv-editor',
      'flashcard-deck',
    ]);
    expect(plan.retention.keepIndexedDbKeys).toContain('level-lists');
    expect(plan.issues.join(' ')).toContain('corrupted localStorage');
    expect(plan.issues.join(' ')).toContain('corrupted IndexedDB');
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
