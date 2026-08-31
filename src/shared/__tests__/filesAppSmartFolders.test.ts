// @vitest-environment node
/**
 * Gate 19's model — "A saved search such as *Untranscribed videos* changes its
 * membership after a video is transcribed, with the count before and after both
 * reported."
 *
 * The count before and after is the gate, so every membership assertion here is
 * a NUMBER. "membership changed" is an adjective and would not close it.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_SMART_FOLDERS_DOC,
  FILES_SMART_FOLDERS_VERSION,
  FILES_SMART_FOLDER_PRESETS,
  allSmartFolders,
  criteriaAreNarrowing,
  deleteSmartFolder,
  isPresetSmartFolder,
  matchesSmartFolder,
  parseSmartFoldersDoc,
  saveSmartFolder,
  smartFolderById,
  smartFolderCount,
  type FilesSmartFoldersDoc,
} from '../filesApp/smartFolders';
import { deriveCrossStoreFlags, type FilesItem } from '../filesApp/catalog';

function item(
  over: Partial<FilesItem> & Pick<FilesItem, 'id' | 'name' | 'kind' | 'categoryId'>,
): FilesItem {
  return {
    provenance: 'unknown',
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    lastUsedAt: null,
    location: { store: 'derived', describes: 'test' },
    flags: {},
    source: 'test',
    ...over,
  };
}

const UNTRANSCRIBED = smartFolderById(
  EMPTY_SMART_FOLDERS_DOC,
  'preset:untranscribed-video',
)?.criteria ?? { kinds: ['video'], flags: { transcribed: false } };
const TRANSCRIBED = smartFolderById(
  EMPTY_SMART_FOLDERS_DOC,
  'preset:transcribed-video',
)?.criteria ?? { kinds: ['video'], flags: { transcribed: true } };

/** Two videos named after their YouTube ids, the shape `deriveCrossStoreFlags` joins on. */
const VIDEOS: FilesItem[] = [
  item({
    id: 'media:1',
    name: 'lecture [dQw4w9WgXcQ].mkv',
    kind: 'video',
    categoryId: 'sources/video',
    location: { store: 'file', path: 'C:\\media\\lecture [dQw4w9WgXcQ].mkv' },
  }),
  item({
    id: 'media:2',
    name: 'talk [abc12345678].mkv',
    kind: 'video',
    categoryId: 'sources/video',
    location: { store: 'file', path: 'C:\\media\\talk [abc12345678].mkv' },
  }),
];

describe('gate 19 — the folder stays live', () => {
  it('UNTRANSCRIBED VIDEOS: 2 before, 1 after a transcript appears; transcribed goes 0 -> 1', () => {
    const before = deriveCrossStoreFlags(VIDEOS);
    expect(smartFolderCount(before, UNTRANSCRIBED)).toBe(2);
    expect(smartFolderCount(before, TRANSCRIBED)).toBe(0);

    // One video is transcribed. Nothing tells the saved search — it re-asks.
    const after = deriveCrossStoreFlags([
      ...VIDEOS,
      item({
        id: 'transcript:dQw4w9WgXcQ',
        name: 'dQw4w9WgXcQ',
        kind: 'transcript',
        categoryId: 'sources/text',
        provenance: 'whisper-transcript',
      }),
    ]);
    expect(smartFolderCount(after, UNTRANSCRIBED)).toBe(1);
    expect(smartFolderCount(after, TRANSCRIBED)).toBe(1);
  });

  it('the flag test is three-valued: an ABSENT flag counts as false', () => {
    // This is the clause the whole gate turns on. A strict `=== false` against
    // a sparse `flags` record matches nothing and the folder reads an honest
    // looking 0.
    const bare = item({ id: 'v', name: 'v', kind: 'video', categoryId: 'sources/video' });
    expect('transcribed' in bare.flags).toBe(false);
    expect(matchesSmartFolder(bare, UNTRANSCRIBED)).toBe(true);

    const explicitlyFalse = { ...bare, flags: { transcribed: false } };
    expect(matchesSmartFolder(explicitlyFalse, UNTRANSCRIBED)).toBe(true);
  });

  it('CONTROL: a transcribed video is not in the untranscribed folder', () => {
    const t = { ...VIDEOS[0], flags: { transcribed: true } };
    expect(matchesSmartFolder(t, UNTRANSCRIBED)).toBe(false);
    expect(matchesSmartFolder(t, TRANSCRIBED)).toBe(true);
  });

  it('CONTROL: a non-video with no transcript is not in the untranscribed VIDEO folder', () => {
    const book = item({ id: 'b', name: 'b', kind: 'book', categoryId: 'sources/text' });
    expect(matchesSmartFolder(book, UNTRANSCRIBED)).toBe(false);
  });
});

describe('criteria combine as AND across fields, OR within one', () => {
  const pool: FilesItem[] = [
    item({ id: 'a', name: 'alpha', kind: 'video', categoryId: 'sources/video' }),
    item({ id: 'b', name: 'beta', kind: 'audio', categoryId: 'sources/audio' }),
    item({ id: 'c', name: 'gamma', kind: 'book', categoryId: 'sources/text' }),
  ];

  it('OR within kinds', () => {
    expect(smartFolderCount(pool, { kinds: ['video', 'audio'] })).toBe(2);
  });

  it('AND across kind and query', () => {
    expect(smartFolderCount(pool, { kinds: ['video', 'audio'], query: 'beta' })).toBe(1);
  });

  it('a category narrows to its own subtree', () => {
    expect(smartFolderCount(pool, { categoryId: 'sources/video' })).toBe(1);
    expect(smartFolderCount(pool, { categoryId: 'sources' })).toBe(3);
  });

  it('empty criteria match everything, which is why saving them is refused', () => {
    expect(smartFolderCount(pool, {})).toBe(3);
    expect(criteriaAreNarrowing({})).toBe(false);
    expect(criteriaAreNarrowing({ kinds: [] })).toBe(false);
    expect(criteriaAreNarrowing({ query: '   ' })).toBe(false);
    expect(criteriaAreNarrowing({ query: 'x' })).toBe(true);
    expect(criteriaAreNarrowing({ flags: { mined: false } })).toBe(true);
  });
});

describe('saving and deleting', () => {
  const criteria = { kinds: ['video' as const] };

  it('saves a search and finds it back among the presets', () => {
    const result = saveSmartFolder(EMPTY_SMART_FOLDERS_DOC, {
      id: 'smart_1',
      name: 'My videos',
      criteria,
      now: 5,
    });
    expect(result.errorKey).toBeUndefined();
    expect(smartFolderById(result.doc, 'smart_1')?.name).toBe('My videos');
    expect(allSmartFolders(result.doc)).toHaveLength(FILES_SMART_FOLDER_PRESETS.length + 1);
  });

  it('refuses an empty name, a duplicate name and unfiltered criteria, each BY NAME', () => {
    const one = saveSmartFolder(EMPTY_SMART_FOLDERS_DOC, {
      id: 's1',
      name: 'Mine',
      criteria,
      now: 5,
    }).doc;
    expect(saveSmartFolder(one, { id: 's2', name: '  ', criteria, now: 6 }).errorKey).toBe(
      'filesApp.smart.error.emptyName',
    );
    expect(saveSmartFolder(one, { id: 's2', name: 'mine', criteria, now: 6 }).errorKey).toBe(
      'filesApp.smart.error.duplicateName',
    );
    expect(saveSmartFolder(one, { id: 's2', name: 'Other', criteria: {}, now: 6 }).errorKey).toBe(
      'filesApp.smart.error.emptyCriteria',
    );
  });

  it('a PRESET cannot be deleted, and refuses by name', () => {
    const result = deleteSmartFolder(EMPTY_SMART_FOLDERS_DOC, 'preset:untranscribed-video');
    expect(result.errorKey).toBe('filesApp.smart.error.presetLocked');
    expect(isPresetSmartFolder('preset:untranscribed-video')).toBe(true);
  });

  it('CONTROL: a saved search of the user\'s own DOES delete', () => {
    const saved = saveSmartFolder(EMPTY_SMART_FOLDERS_DOC, {
      id: 's1',
      name: 'Mine',
      criteria,
      now: 5,
    }).doc;
    const after = deleteSmartFolder(saved, 's1');
    expect(after.errorKey).toBeUndefined();
    expect(after.doc.folders).toEqual([]);
    // The presets are untouched by a delete aimed at a saved search.
    expect(allSmartFolders(after.doc)).toHaveLength(FILES_SMART_FOLDER_PRESETS.length);
  });
});

describe('parseSmartFoldersDoc', () => {
  it('anything unreadable is the empty document, never a throw', () => {
    expect(parseSmartFoldersDoc(null)).toEqual(EMPTY_SMART_FOLDERS_DOC);
    expect(parseSmartFoldersDoc({ version: 1 })).toEqual(EMPTY_SMART_FOLDERS_DOC);
  });

  it('a FUTURE version reads as empty', () => {
    expect(
      parseSmartFoldersDoc({
        version: FILES_SMART_FOLDERS_VERSION + 1,
        folders: [{ id: 'x', name: 'x', criteria: { kinds: ['video'] } }],
      }).folders,
    ).toEqual([]);
  });

  it('a stored row that shadows a preset id is dropped, not allowed to mask it', () => {
    const doc = parseSmartFoldersDoc({
      version: FILES_SMART_FOLDERS_VERSION,
      folders: [
        { id: 'preset:untranscribed-video', name: 'Impostor', criteria: { kinds: ['book'] } },
        { id: 'ok', name: 'Real', criteria: { kinds: ['video'] } },
      ],
    });
    expect(doc.folders.map((f) => f.id)).toEqual(['ok']);
    // And the preset still answers its own question.
    expect(smartFolderById(doc, 'preset:untranscribed-video')?.criteria).toEqual(UNTRANSCRIBED);
  });

  it('drops a row whose criteria would match everything', () => {
    const doc = parseSmartFoldersDoc({
      version: FILES_SMART_FOLDERS_VERSION,
      folders: [{ id: 'x', name: 'Everything again', criteria: {} }],
    });
    expect(doc.folders).toEqual([]);
  });

  it('round-trips through JSON, which is how it is actually stored', () => {
    const doc: FilesSmartFoldersDoc = saveSmartFolder(EMPTY_SMART_FOLDERS_DOC, {
      id: 's1',
      name: 'Mine',
      criteria: { kinds: ['video'], flags: { transcribed: false }, query: 'ep' },
      now: 5,
    }).doc;
    expect(parseSmartFoldersDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
});
