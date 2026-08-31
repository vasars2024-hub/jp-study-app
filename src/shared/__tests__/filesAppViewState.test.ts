/**
 * Gate 22, the model half — "Sort column, direction and view mode are
 * remembered per folder across a restart."
 *
 * The restart itself is proven on the real component in
 * `renderer/__tests__/filesAppViewState.test.tsx`, against real `localStorage`
 * and a real unmount. What is proven here is the part a component test cannot
 * see: that the key names the folder on screen, that an illegible entry is
 * dropped whole rather than half-adopted, and that a value which would not
 * survive a parse is refused at the write instead.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOLDER_VIEW,
  EMPTY_VIEW_STATE_DOC,
  FILES_VIEW_STATE_VERSION,
  MAX_REMEMBERED_FOLDERS,
  ROOT_FOLDER_KEY,
  folderView,
  folderViewKey,
  forgetFolderView,
  parseViewStateDoc,
  setFolderView,
  type FilesViewStateDoc,
} from '../filesApp/viewState';

function set(
  doc: FilesViewStateDoc,
  key: string,
  patch: Parameters<typeof setFolderView>[2],
  now = 1,
): FilesViewStateDoc {
  const result = setFolderView(doc, key, patch, now);
  expect(result.errorKey).toBeUndefined();
  return result.doc;
}

describe('folderViewKey — the key names the folder the list is showing', () => {
  it('root when nothing is narrowed', () => {
    expect(folderViewKey({})).toBe(ROOT_FOLDER_KEY);
    expect(folderViewKey({ scope: null, collectionId: null, smartId: null })).toBe(ROOT_FOLDER_KEY);
  });

  it('names each of the three scopes distinctly', () => {
    expect(folderViewKey({ scope: 'sources/video' })).toBe('category:sources/video');
    expect(folderViewKey({ collectionId: 'col_1' })).toBe('collection:col_1');
    expect(folderViewKey({ smartId: 'preset:broken-links' })).toBe('smart:preset:broken-links');
  });

  it('a collection and a category can never collide', () => {
    // Same trailing text, different folders. Without the prefix they would share
    // one remembered view and each would appear to overwrite the other.
    expect(folderViewKey({ collectionId: 'sources/video' })).not.toBe(
      folderViewKey({ scope: 'sources/video' }),
    );
  });

  it('precedence is smart, then collection, then category — the list resolution order', () => {
    expect(folderViewKey({ scope: 'sources/video', collectionId: 'c', smartId: 's' })).toBe(
      'smart:s',
    );
    expect(folderViewKey({ scope: 'sources/video', collectionId: 'c' })).toBe('collection:c');
  });
});

describe('folderView — what a folder shows', () => {
  it('an unremembered folder is the default, not an error', () => {
    expect(folderView(EMPTY_VIEW_STATE_DOC, 'category:sources/video')).toEqual(
      DEFAULT_FOLDER_VIEW,
    );
  });

  it('one folder is remembered without touching another', () => {
    const doc = set(EMPTY_VIEW_STATE_DOC, 'category:sources/video', {
      sortColumn: 'size',
      sortDirection: 'desc',
    });
    expect(folderView(doc, 'category:sources/video')).toEqual({
      sortColumn: 'size',
      sortDirection: 'desc',
      viewMode: 'details',
    });
    // The gate's whole point: the folder next door is untouched.
    expect(folderView(doc, 'category:sources/text')).toEqual(DEFAULT_FOLDER_VIEW);
    expect(folderView(doc, ROOT_FOLDER_KEY)).toEqual(DEFAULT_FOLDER_VIEW);
  });

  it('a patch changes only the field it names', () => {
    let doc = set(EMPTY_VIEW_STATE_DOC, 'root', { sortColumn: 'modified', sortDirection: 'desc' });
    doc = set(doc, 'root', { viewMode: 'compact' }, 2);
    expect(folderView(doc, 'root')).toEqual({
      sortColumn: 'modified',
      sortDirection: 'desc',
      viewMode: 'compact',
    });
  });
});

describe('setFolderView — a value that would not survive a parse is refused', () => {
  it('refuses an unknown sort column and writes nothing', () => {
    const result = setFolderView(
      EMPTY_VIEW_STATE_DOC,
      'root',
      { sortColumn: 'colour' as never },
      1,
    );
    expect(result.errorKey).toBe('filesApp.view.error.unknownValue');
    expect(result.doc).toBe(EMPTY_VIEW_STATE_DOC);
  });

  it('refuses an unknown view mode and an unknown direction', () => {
    expect(
      setFolderView(EMPTY_VIEW_STATE_DOC, 'root', { viewMode: 'tiles' as never }, 1).errorKey,
    ).toBe('filesApp.view.error.unknownValue');
    expect(
      setFolderView(EMPTY_VIEW_STATE_DOC, 'root', { sortDirection: 'sideways' as never }, 1)
        .errorKey,
    ).toBe('filesApp.view.error.unknownValue');
  });

  it('refuses an empty key — a view belonging to no folder', () => {
    expect(setFolderView(EMPTY_VIEW_STATE_DOC, '', { viewMode: 'compact' }, 1).errorKey).toBe(
      'filesApp.view.error.unknownFolder',
    );
  });
});

describe('parseViewStateDoc — never throws, never guesses', () => {
  it('reads back exactly what was written', () => {
    const doc = set(EMPTY_VIEW_STATE_DOC, 'category:sources/video', {
      sortColumn: 'size',
      sortDirection: 'desc',
      viewMode: 'compact',
    });
    expect(parseViewStateDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('an unknown version reads empty rather than field-by-field', () => {
    expect(
      parseViewStateDoc({ version: FILES_VIEW_STATE_VERSION + 1, folders: { root: {} } }),
    ).toEqual(EMPTY_VIEW_STATE_DOC);
  });

  it('junk of every shape reads empty', () => {
    for (const raw of [null, undefined, 0, '', [], { folders: {} }, { version: 1 }]) {
      expect(parseViewStateDoc(raw).folders).toEqual({});
    }
  });

  it('a half-legible entry is dropped whole, and its neighbours survive', () => {
    const parsed = parseViewStateDoc({
      version: FILES_VIEW_STATE_VERSION,
      folders: {
        good: { sortColumn: 'size', sortDirection: 'desc', viewMode: 'compact', updatedAt: 7 },
        // Has a legal sort but an illegal mode. Keeping the sort would leave a
        // folder that remembered some of what it was told and not the rest.
        partial: { sortColumn: 'size', sortDirection: 'desc', viewMode: 'tiles' },
        notAnObject: 5,
      },
    });
    expect(Object.keys(parsed.folders)).toEqual(['good']);
    expect(folderView(parsed, 'partial')).toEqual(DEFAULT_FOLDER_VIEW);
  });

  it('a missing updatedAt reads 0 rather than dropping the row', () => {
    const parsed = parseViewStateDoc({
      version: FILES_VIEW_STATE_VERSION,
      folders: { root: { sortColumn: 'name', sortDirection: 'asc', viewMode: 'compact' } },
    });
    expect(parsed.folders.root.updatedAt).toBe(0);
    expect(folderView(parsed, 'root').viewMode).toBe('compact');
  });
});

describe('eviction — the document is bounded', () => {
  it('keeps the most recently set folders and drops the oldest', () => {
    let doc = EMPTY_VIEW_STATE_DOC;
    for (let n = 0; n < MAX_REMEMBERED_FOLDERS + 5; n += 1) {
      doc = set(doc, `collection:c${n}`, { viewMode: 'compact' }, n + 1);
    }
    expect(Object.keys(doc.folders)).toHaveLength(MAX_REMEMBERED_FOLDERS);
    // The five oldest are gone; the newest is there.
    expect(doc.folders['collection:c0']).toBeUndefined();
    expect(doc.folders['collection:c4']).toBeUndefined();
    expect(doc.folders['collection:c5']).toBeDefined();
    expect(doc.folders[`collection:c${MAX_REMEMBERED_FOLDERS + 4}`]).toBeDefined();
  });

  it('re-setting an old folder keeps it — it is least-recently-SET, not oldest-created', () => {
    let doc = EMPTY_VIEW_STATE_DOC;
    for (let n = 0; n < MAX_REMEMBERED_FOLDERS; n += 1) {
      doc = set(doc, `collection:c${n}`, { viewMode: 'compact' }, n + 1);
    }
    doc = set(doc, 'collection:c0', { sortColumn: 'size' }, 10_000);
    doc = set(doc, 'collection:new', { viewMode: 'compact' }, 10_001);
    expect(doc.folders['collection:c0']).toBeDefined();
    expect(doc.folders['collection:c1']).toBeUndefined();
  });
});

describe('forgetFolderView', () => {
  it('removes one folder and leaves the rest', () => {
    let doc = set(EMPTY_VIEW_STATE_DOC, 'root', { viewMode: 'compact' });
    doc = set(doc, 'category:sources/video', { sortColumn: 'size' }, 2);
    const after = forgetFolderView(doc, 'root').doc;
    expect(folderView(after, 'root')).toEqual(DEFAULT_FOLDER_VIEW);
    expect(folderView(after, 'category:sources/video').sortColumn).toBe('size');
  });

  it('forgetting an unremembered folder is a no-op, not a churned write', () => {
    const result = forgetFolderView(EMPTY_VIEW_STATE_DOC, 'nope');
    expect(result.doc).toBe(EMPTY_VIEW_STATE_DOC);
    expect(result.errorKey).toBeUndefined();
  });
});
