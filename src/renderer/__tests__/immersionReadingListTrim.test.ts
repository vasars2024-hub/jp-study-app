/**
 * Bug 29 — trimming the reading list to its cap never deleted the offline copies
 * it dropped (only "Remove" did), on both trim paths: Save for later and the
 * import merge. Plus the one-time sweep for the copies already left behind.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
  kvDelete: async (key: string) => {
    idb.delete(key);
  },
  kvUpdate: async (key: string, update: (current: unknown) => unknown) => {
    const next = update(idb.get(key));
    if (next !== undefined) idb.set(key, JSON.parse(JSON.stringify(next)));
    return idb.get(key);
  },
  kvDeleteWhere: async (prefix: string, predicate: (value: unknown, key: string) => boolean) => {
    let n = 0;
    for (const [key, value] of [...idb.entries()]) {
      if (key.startsWith(prefix) && predicate(value, key)) {
        idb.delete(key);
        n += 1;
      }
    }
    return n;
  },
}));

import {
  IMM5_READING_LIST_MAX,
  imm5AddReadingItem,
  imm5ExportReadingList,
  imm5MergeReadingLists,
  imm5ReadingItemId,
  imm5SnapshotHash,
  type Imm5ReadingItem,
} from '../../shared/immersionStudy5';
import {
  __resetImm5StoreForTests,
  imm5ImportReadingList,
  imm5ReadingList,
  imm5SaveForLater,
  imm5SweepOrphanSnapshots,
  loadImm5Store,
} from '../immersionStudy5Store';

const SNAP = 'imm5:snapshot:';
const LIST = 'imm5:readingList';
const html = (n: number) => `<p>記事${n}の本文です。これは十分に長い本文の一部です。</p>`;

function seedFullList(): Imm5ReadingItem[] {
  const items: Imm5ReadingItem[] = [];
  for (let i = 0; i < IMM5_READING_LIST_MAX; i += 1) {
    const url = `https://example.invalid/a${i}`;
    const id = imm5ReadingItemId(url);
    const body = html(i);
    items.push({ id, url, title: `A${i}`, host: 'example.invalid', savedAt: 10_000 + i, excerpt: '', snapshotChars: body.length, snapshotHash: imm5SnapshotHash(body) });
    idb.set(`${SNAP}${id}`, body);
  }
  // Newest saved first, as the store keeps it.
  items.sort((a, b) => b.savedAt - a.savedAt);
  idb.set(LIST, items);
  return items;
}

const snapshotKeys = () => [...idb.keys()].filter((k) => k.startsWith(SNAP));

beforeEach(() => {
  idb.clear();
  __resetImm5StoreForTests();
});

describe('the pure trims report what they dropped', () => {
  it('imm5AddReadingItem returns the id the cap pushed off', () => {
    const list = seedFullList();
    const oldest = list[list.length - 1].id;
    const next = imm5AddReadingItem(list, { url: 'https://example.invalid/new', title: 'New' }, 99_999);
    expect(next.list).toHaveLength(IMM5_READING_LIST_MAX);
    expect(next.dropped).toEqual([oldest]);
    // Re-saving an item already on the list drops nothing.
    expect(imm5AddReadingItem(list, { url: list[5].url, title: 'Again' }, 99_999).dropped).toEqual([]);
  });

  it('imm5MergeReadingLists returns the existing ids the cap pushed off', () => {
    const list = seedFullList();
    const incoming = [0, 1, 2].map((n) => ({
      id: imm5ReadingItemId(`https://example.invalid/in${n}`),
      url: `https://example.invalid/in${n}`,
      title: `In${n}`,
      host: 'example.invalid',
      savedAt: 50_000 + n,
      excerpt: '',
      snapshotChars: 0,
    }));
    const merged = imm5MergeReadingLists(list, incoming);
    expect(merged.added).toBe(3);
    expect(new Set(merged.dropped)).toEqual(new Set(list.slice(-3).map((i) => i.id)));
  });
});

describe('the store deletes the dropped offline copies', () => {
  it('Save for later past the cap deletes the oldest item and its copy', async () => {
    const list = seedFullList();
    const oldest = list[list.length - 1].id;
    await loadImm5Store();
    expect(snapshotKeys()).toHaveLength(IMM5_READING_LIST_MAX);
    await imm5SaveForLater({ url: 'https://example.invalid/new', title: 'New', snapshotHtml: html(1000) });
    expect(imm5ReadingList()).toHaveLength(IMM5_READING_LIST_MAX);
    expect(imm5ReadingList().some((i) => i.id === oldest)).toBe(false);
    expect(idb.has(`${SNAP}${oldest}`)).toBe(false);
    expect(idb.has(`${SNAP}${imm5ReadingItemId('https://example.invalid/new')}`)).toBe(true);
    expect(snapshotKeys()).toHaveLength(IMM5_READING_LIST_MAX);
  });

  it('an import that overflows the cap deletes the copies of the items it pushed out', async () => {
    const list = seedFullList();
    await loadImm5Store();
    const incoming = [0, 1].map((n) => ({
      id: imm5ReadingItemId(`https://example.invalid/in${n}`),
      url: `https://example.invalid/in${n}`,
      title: `In${n}`,
      host: 'example.invalid',
      savedAt: 90_000 + n,
      excerpt: '',
      snapshotChars: 0,
    }));
    const file = imm5ExportReadingList(incoming, {}, 100_000);
    const result = await imm5ImportReadingList(file, 100_000);
    expect(result).toEqual({ added: 2, updated: 0 });
    const pushedOut = list.slice(-2).map((i) => i.id);
    for (const id of pushedOut) {
      expect(imm5ReadingList().some((i) => i.id === id)).toBe(false);
      expect(idb.has(`${SNAP}${id}`)).toBe(false);
    }
    expect(snapshotKeys()).toHaveLength(IMM5_READING_LIST_MAX - 2);
  });
});

describe('the one-time orphan sweep', () => {
  it('deletes copies no item owns, keeps the owned ones, and runs once', async () => {
    const list = seedFullList().slice(0, 3);
    idb.set(LIST, list);
    idb.set(`${SNAP}rl-orphan1`, '<p>x</p>');
    idb.set(`${SNAP}rl-orphan2`, '<p>y</p>');
    idb.set('imm5:siteDays', {});
    __resetImm5StoreForTests();
    await loadImm5Store();
    await vi.waitFor(() => expect(idb.has('imm5:snapshotSweep')).toBe(true));
    expect(snapshotKeys().sort()).toEqual(list.map((i) => `${SNAP}${i.id}`).sort());
    expect(idb.has('imm5:siteDays')).toBe(true);
    // A second run is a no-op unless forced.
    idb.set(`${SNAP}rl-orphan3`, '<p>z</p>');
    expect(await imm5SweepOrphanSnapshots()).toBe(0);
    expect(idb.has(`${SNAP}rl-orphan3`)).toBe(true);
    expect(await imm5SweepOrphanSnapshots(true)).toBe(1);
  });

  it('never sweeps against a list it could not read', async () => {
    idb.set(LIST, { corrupt: true });
    idb.set(`${SNAP}rl-keepme`, '<p>x</p>');
    expect(await imm5SweepOrphanSnapshots()).toBe(0);
    expect(idb.has(`${SNAP}rl-keepme`)).toBe(true);
    expect(idb.has('imm5:snapshotSweep')).toBe(false);
  });
});
