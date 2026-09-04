// @vitest-environment node
/**
 * The one seam Reading Lists' late binding (§3.1) hangs on.
 *
 * `library.ts` has six import paths and nineteen `writeDb` calls, so the
 * subscription is on the write and not on the importers. This suite drives a
 * REAL import through `importGeneratedArticle` rather than calling the notifier
 * directly — the whole claim being tested is "an importer nobody edited fires
 * this", and a direct call would prove nothing about that.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../shared/types';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'library-seam-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: () => undefined },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));
vi.mock('./readabilityExtract', () => ({ extractReadableFromUrl: () => Promise.resolve(null) }));
vi.mock('./readingFetch', () => ({ fetchReadingContent: () => Promise.resolve(null) }));
vi.mock('./i18n', () => ({ mt: (k: string) => k }));
vi.mock('./epubMeta', () => ({ extractEpubTitleFromOpf: () => undefined }));

const {
  ensureLibrary,
  importGeneratedArticle,
  onLibraryItemsAdded,
  resetLibraryItemsAddedListenersForTesting,
  updateLibraryLevelMeta,
} = await import('../library');

let seen: LibraryItem[][];

beforeEach(() => {
  resetLibraryItemsAddedListenersForTesting();
  ensureLibrary();
  seen = [];
  onLibraryItemsAdded((items) => seen.push(items));
});

afterEach(() => {
  resetLibraryItemsAddedListenersForTesting();
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('onLibraryItemsAdded', () => {
  it('fires once per import, with only the item that is actually new', () => {
    const first = importGeneratedArticle({ title: 'コンビニ人間', html: '<p>a</p>' });
    expect(first.item).not.toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0].map((item) => item.title)).toEqual(['コンビニ人間']);

    const second = importGeneratedArticle({ title: 'ノルウェイの森', html: '<p>b</p>' });
    expect(seen).toHaveLength(2);
    // Only the new one — the library already held the first, and a subscriber
    // that re-matched the whole library on every import would do N^2 work.
    expect(seen[1].map((item) => item.id)).toEqual([second.item?.id]);
  });

  it('NEGATIVE CONTROL — a metadata update on an existing item announces nothing', () => {
    const imported = importGeneratedArticle({ title: 'Kino no Tabi', html: '<p>c</p>' });
    expect(seen).toHaveLength(1);

    updateLibraryLevelMeta(imported.item?.id ?? '', {
      lang: 'ja',
      knownRatio: 0.4,
      levelEstimate: 3,
    });
    // `writeDb` runs, the file changes, and nothing was added. Without the id
    // diff this would fire on every progress save in the app.
    expect(seen).toHaveLength(1);
  });

  it('NEGATIVE CONTROL — a deduped re-import is not an addition', () => {
    importGeneratedArticle({ title: 'Dup', html: '<p>d</p>', source: 'https://example.test/x' });
    expect(seen).toHaveLength(1);
    const again = importGeneratedArticle({
      title: 'Dup',
      html: '<p>d</p>',
      source: 'https://example.test/x',
    });
    expect(again.duplicate).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it('a subscriber that throws does not fail the import', () => {
    onLibraryItemsAdded(() => {
      throw new Error('subscriber exploded');
    });
    const later: LibraryItem[][] = [];
    onLibraryItemsAdded((items) => later.push(items));

    const result = importGeneratedArticle({ title: 'Resilient', html: '<p>e</p>' });
    expect(result.item).not.toBeNull();
    // The write already reached disk before any subscriber ran, and a later
    // subscriber still gets its turn.
    expect(later).toHaveLength(1);
  });
});
