import { describe, expect, it } from 'vitest';
import {
  FILES_SOFT_DELETE_EVENT,
  FILES_SOFT_DELETE_STORAGE_KEY,
  FilesSoftDeleteStore,
  type FilesSoftDeletePersistence,
} from '../filesApp/softDelete';

function memoryPersistence(initial: string | null = null): FilesSoftDeletePersistence & {
  values: Map<string, string>;
  events: string[];
} {
  const values = new Map<string, string>();
  if (initial !== null) values.set(FILES_SOFT_DELETE_STORAGE_KEY, initial);
  const events: string[] = [];
  return {
    values,
    events,
    read: (key) => values.get(key) ?? null,
    write: (key, value) => values.set(key, value),
    emit: (eventName) => events.push(eventName),
  };
}

describe('FilesSoftDeleteStore', () => {
  it('soft-deletes exactly one id and persists a versioned tombstone', () => {
    const persistence = memoryPersistence();
    const store = new FilesSoftDeleteStore(persistence, () => 'undo:highlight-42', 10_000);

    expect(store.delete('highlight:42', 1_000)).toEqual({
      undoToken: 'undo:highlight-42',
      undoExpiresAt: 11_000,
    });
    expect(store.isDeleted('highlight:42')).toBe(true);
    expect(store.isDeleted('highlight:43')).toBe(false);
    expect(JSON.parse(persistence.values.get(FILES_SOFT_DELETE_STORAGE_KEY) ?? '')).toEqual({
      version: 1,
      tombstones: [
        {
          itemId: 'highlight:42',
          deletedAt: 1_000,
          undoToken: 'undo:highlight-42',
          undoExpiresAt: 11_000,
        },
      ],
    });
    expect(persistence.events).toEqual([FILES_SOFT_DELETE_EVENT]);
  });

  it('survives reopening and undo restores only the matching row', () => {
    const persistence = memoryPersistence();
    let token = 0;
    const store = new FilesSoftDeleteStore(persistence, () => `undo:${++token}`, 5_000);
    const first = store.delete('note:1', 100);
    store.delete('note:2', 200);

    const reopened = new FilesSoftDeleteStore(persistence, () => 'unused', 5_000);
    expect(reopened.undo(first.undoToken, 1_000)).toEqual({ ok: true, itemId: 'note:1' });
    expect(reopened.isDeleted('note:1')).toBe(false);
    expect(reopened.isDeleted('note:2')).toBe(true);
  });

  it('keeps an expired tombstone and refuses to resurrect it', () => {
    const persistence = memoryPersistence();
    const store = new FilesSoftDeleteStore(persistence, () => 'undo:expired', 100);
    const receipt = store.delete('job:old', 1_000);

    expect(store.undo(receipt.undoToken, 1_101)).toEqual({ ok: false, reason: 'expired' });
    expect(store.isDeleted('job:old')).toBe(true);
    expect(persistence.events).toHaveLength(1);
  });

  it('an unknown token changes no rows', () => {
    const persistence = memoryPersistence();
    const store = new FilesSoftDeleteStore(persistence, () => 'undo:real');
    store.delete('draft:1', 1_000);

    expect(store.undo('undo:wrong', 1_001)).toEqual({ ok: false, reason: 'unknown-token' });
    expect(store.isDeleted('draft:1')).toBe(true);
    expect(persistence.events).toHaveLength(1);
  });

  it('refuses undo honestly when persistence fails and keeps the tombstone', () => {
    const persistence = memoryPersistence();
    const store = new FilesSoftDeleteStore(persistence, () => 'undo:kept', 5_000);
    const receipt = store.delete('note:kept', 100);
    const written = persistence.values.get(FILES_SOFT_DELETE_STORAGE_KEY);
    persistence.write = () => {
      throw new Error('storage unavailable');
    };

    expect(store.undo(receipt.undoToken, 200)).toEqual({
      ok: false,
      reason: 'storage-failed',
    });
    expect(persistence.values.get(FILES_SOFT_DELETE_STORAGE_KEY)).toBe(written);
    expect(store.isDeleted('note:kept')).toBe(true);
    expect(persistence.events).toHaveLength(1);
  });

  it('refuses undo honestly when the persisted tombstones cannot be read', () => {
    const persistence = memoryPersistence();
    const store = new FilesSoftDeleteStore(persistence, () => 'undo:unreadable', 5_000);
    const receipt = store.delete('note:unreadable', 100);
    persistence.read = () => {
      throw new Error('storage unavailable');
    };

    expect(store.undo(receipt.undoToken, 200)).toEqual({
      ok: false,
      reason: 'storage-failed',
    });
    expect(persistence.events).toHaveLength(1);
  });

  it('does not extend the undo window when the same row is deleted twice', () => {
    const persistence = memoryPersistence();
    let calls = 0;
    const store = new FilesSoftDeleteStore(persistence, () => `undo:${++calls}`, 1_000);

    expect(store.delete('workspace:1', 100)).toEqual(store.delete('workspace:1', 900));
    expect(calls).toBe(1);
    expect(store.list()).toHaveLength(1);
  });

  it('drops malformed persisted rows instead of hiding unrelated catalogue items', () => {
    const persistence = memoryPersistence(
      JSON.stringify({
        version: 1,
        tombstones: [
          { itemId: '', undoToken: 'bad', deletedAt: 1, undoExpiresAt: 2 },
          { itemId: 'bad:time', undoToken: 'bad2', deletedAt: 'yesterday', undoExpiresAt: 2 },
          { itemId: 'valid:1', undoToken: 'good', deletedAt: 1, undoExpiresAt: 2 },
        ],
      }),
    );
    const store = new FilesSoftDeleteStore(persistence, () => 'unused');

    expect(store.list().map((row) => row.itemId)).toEqual(['valid:1']);
    expect(store.isDeleted('bad:time')).toBe(false);
  });

  it('keeps the first row when persisted item ids or undo tokens collide', () => {
    const persistence = memoryPersistence(
      JSON.stringify({
        version: 1,
        tombstones: [
          { itemId: 'note:1', undoToken: 'undo:1', deletedAt: 1, undoExpiresAt: 10 },
          { itemId: 'note:1', undoToken: 'undo:2', deletedAt: 2, undoExpiresAt: 11 },
          { itemId: 'note:2', undoToken: 'undo:1', deletedAt: 3, undoExpiresAt: 12 },
          { itemId: 'note:3', undoToken: 'undo:3', deletedAt: 4, undoExpiresAt: 13 },
        ],
      }),
    );
    const store = new FilesSoftDeleteStore(persistence, () => 'unused');

    expect(store.list().map(({ itemId, undoToken }) => ({ itemId, undoToken }))).toEqual([
      { itemId: 'note:1', undoToken: 'undo:1' },
      { itemId: 'note:3', undoToken: 'undo:3' },
    ]);
  });

  it('refuses a generated token collision rather than making Undo ambiguous', () => {
    const persistence = memoryPersistence();
    const first = new FilesSoftDeleteStore(persistence, () => 'undo:shared');
    first.delete('note:1', 1);
    const second = new FilesSoftDeleteStore(persistence, () => 'undo:shared');

    expect(() => second.delete('note:2', 2)).toThrow('unique undo token');
    expect(second.list().map((row) => row.itemId)).toEqual(['note:1']);
  });

  it('treats unknown schema versions and invalid JSON as empty, never as delete-all', () => {
    const future = memoryPersistence(JSON.stringify({ version: 2, tombstones: [{ itemId: 'x' }] }));
    expect(new FilesSoftDeleteStore(future, () => 'token').list()).toEqual([]);

    const corrupt = memoryPersistence('{not-json');
    expect(new FilesSoftDeleteStore(corrupt, () => 'token').list()).toEqual([]);
  });
});
