/**
 * Audit round 2 — the Files app's model-level fixes, each pinned to the
 * behaviour the audit found missing.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  filesOpenDecision,
  ownedOpenRoute,
  withLibraryTwin,
  withOwnedRoute,
  openFor,
} from '../filesApp/openPlan';
import {
  executeFilesDeletion,
  ownerDeleteFor,
  planFilesDeletion,
  type FilesDeletionTarget,
} from '../filesApp/deletion';
import { FilesSoftDeleteStore, type FilesSoftDeletePersistence } from '../filesApp/softDelete';
import { planFilesCleanup, type FilesCleanupInput } from '../filesApp/cleanup';
import { planWatchImports } from '../filesApp/watchImport';
import { DEFAULT_INGEST_SETTINGS } from '../filesApp/ingest';
import type { FilesScanEntry } from '../filesApp/scan';
import {
  DEFAULT_FILES_COLUMNS,
  filesGridTemplate,
  filesStatusBadges,
  normalizeFilesColumns,
  toggleFilesColumn,
} from '../filesApp/columns';
import { clipPreviewText, findDuplicateGroups, previewPlanFor } from '../filesApp/preview';

describe('r2 #1 — Open lands on the exact record', () => {
  it('derives the owner route from the row id', () => {
    expect(ownedOpenRoute({ id: 'library:b1' })).toEqual({ kind: 'library', itemId: 'b1' });
    expect(ownedOpenRoute({ id: 'media:m1' })).toEqual({ kind: 'media', mediaId: 'm1' });
    expect(ownedOpenRoute({ id: 'visual-novel:v1' })).toEqual({ kind: 'visual-novel', visualNovelId: 'v1' });
    expect(ownedOpenRoute({ id: 'deck-card:c1' })).toEqual({ kind: 'deck', folder: null, cardId: 'c1' });
    expect(ownedOpenRoute({ id: 'deck-folder:N5' })).toEqual({ kind: 'deck', folder: 'N5', cardId: null });
    expect(ownedOpenRoute({ id: 'saved-word:猫' })).toEqual({ kind: 'lookup', query: '猫' });
    expect(ownedOpenRoute({ id: 'notebook:nb-1' })).toEqual({ kind: 'note', entryId: 'nb-1' });
    // A loose file no store claims keeps the section-level open.
    expect(ownedOpenRoute({ id: 'download:ep1.mkv' })).toBeNull();
  });

  it('attaches the route to a routed file open, and keeps the section', () => {
    const decision = filesOpenDecision(
      { id: 'library:b1', kind: 'book', location: { store: 'file', path: 'C:\\lib\\b1\\book.epub' } },
      {
        path: 'C:\\lib\\b1\\book.epub',
        candidates: [{ target: 'library-book', confidence: 'exact', reasonKey: 'fileDrop.reason.epub' }],
      },
    );
    expect(decision).toMatchObject({ mode: 'open', section: 'library', route: { kind: 'library', itemId: 'b1' } });
  });

  it('opens a manga volume folder through its owner instead of refusing it as a container', () => {
    const decision = filesOpenDecision(
      { id: 'library:m1', kind: 'manga', location: { store: 'file', path: 'C:\\lib\\m1' } },
      { path: 'C:\\lib\\m1', candidates: [{ target: 'folder', confidence: 'exact', reasonKey: 'fileDrop.reason.folder' }] },
    );
    expect(decision).toMatchObject({ mode: 'open', section: 'library', route: { kind: 'library', itemId: 'm1' } });
  });

  it('opens a non-file record the owner app can address (a deck card) instead of refusing it', () => {
    const decision = filesOpenDecision(
      { id: 'deck-card:c9', kind: 'mined-card', location: { store: 'localStorage', key: 'jp-flashcard-deck', pointer: 'c9' } },
      null,
    );
    expect(decision).toMatchObject({ mode: 'open', section: 'flashcards', route: { kind: 'deck', cardId: 'c9' } });
  });

  it('drops the route when the user picked a different app from the ranked list', () => {
    const picked = openFor({ target: 'anki-cards', confidence: 'likely', reasonKey: 'x' }, false, 'video');
    expect(withOwnedRoute(picked, { id: 'media:m1' })).not.toHaveProperty('route');
  });

  it('routes a loose video to its media-library twin by path', () => {
    const decision = openFor({ target: 'media', confidence: 'exact', reasonKey: 'x' }, false, 'video');
    const out = withLibraryTwin(decision, { location: { store: 'file', path: 'D:/Dl/Ep1.mkv' } }, [
      { id: 'media:abc', location: { store: 'file', path: 'd:\\dl\\ep1.mkv' } },
    ]);
    expect(out).toMatchObject({ route: { kind: 'media', mediaId: 'abc' } });
  });
});

function memory(): FilesSoftDeletePersistence & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, read: (k) => values.get(k) ?? null, write: (k, v) => void values.set(k, v) };
}

function target(overrides: Partial<FilesDeletionTarget>): FilesDeletionTarget {
  return {
    id: 'dictionary:jmdict',
    name: 'JMdict',
    kind: 'dictionary',
    location: { store: 'sqlite', database: 'dict.db', table: 'dictionaries', rowId: 'jmdict' },
    sizeBytes: null,
    ...overrides,
  };
}

describe('r2 #2 — Delete is real, deferred for Undo, and honest about hides', () => {
  it('plans an owner delete per store, with that store named in the confirm', () => {
    expect(planFilesDeletion(target({}))).toMatchObject({
      mode: 'owner',
      owner: 'dictionary',
      messageKey: 'filesApp.delete.confirmOwner.dictionary',
    });
    // A library book is a FILE, but Delete goes through the Library, not the Recycle Bin.
    expect(
      planFilesDeletion(
        target({ id: 'library:b1', kind: 'book', location: { store: 'file', path: 'C:\\lib\\b1\\x.epub' } }),
      ),
    ).toMatchObject({ mode: 'owner', owner: 'library' });
    // A record no owner can delete from here is a hide, and says so.
    expect(
      planFilesDeletion(
        target({ id: 'lookup:猫', kind: 'note', location: { store: 'localStorage', key: 'k', pointer: '猫' } }),
      ),
    ).toMatchObject({ mode: 'soft', messageKey: 'filesApp.delete.confirmSoft' });
  });

  it('only a LINKED media row is an owner delete; the file goes only on request', async () => {
    const linked = target({
      id: 'media:m1',
      kind: 'video',
      location: { store: 'file', path: 'D:\\v.mkv' },
      referenced: true,
    });
    expect(ownerDeleteFor(linked)).toEqual({ owner: 'media', localId: 'm1' });
    const softDelete = vi.fn(async () => ({ undoToken: 't', undoExpiresAt: 1 }));
    await executeFilesDeletion(linked, { trashFile: true }, { trashFile: vi.fn(), softDelete });
    expect(softDelete).toHaveBeenCalledWith(linked, { owner: 'media', localId: 'm1', trashFile: true });
  });

  it('a pending owner delete becomes due after the window, settles on success, records a refusal', () => {
    const store = new FilesSoftDeleteStore(memory(), (() => {
      let n = 0;
      return () => `tok${++n}`;
    })(), 10_000);
    store.delete('dictionary:a', 1_000, { name: 'A', commit: { owner: 'dictionary', localId: 'a' } });
    store.delete('dictionary:b', 1_000, { name: 'B', commit: { owner: 'dictionary', localId: 'b' } });
    store.delete('lookup:x', 1_000, { name: 'x' });
    expect(store.due(5_000)).toHaveLength(0);
    expect(store.due(11_001).map((r) => r.itemId)).toEqual(['dictionary:a', 'dictionary:b']);
    store.settle('dictionary:a');
    store.markFailed('dictionary:b', 'Bundled default dictionaries cannot be removed.');
    expect(store.due(20_000)).toHaveLength(0);
    // Hidden items: the hide, and the refused delete — never the settled one.
    expect(store.hidden().map((r) => r.itemId).sort()).toEqual(['dictionary:b', 'lookup:x']);
    // Restore has no window for a hide.
    expect(store.restore('lookup:x')).toBe(true);
    expect(store.restore('dictionary:b')).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it('a still-pending owner delete is not restorable from Hidden items (its receipt has Undo)', () => {
    const store = new FilesSoftDeleteStore(memory(), () => 'tok', 10_000);
    store.delete('library:b', 1_000, { commit: { owner: 'library', localId: 'b' } });
    expect(store.hidden()).toHaveLength(0);
    expect(store.restore('library:b')).toBe(false);
  });
});

function row(over: Partial<FilesCleanupInput> & Pick<FilesCleanupInput, 'id' | 'source'>): FilesCleanupInput {
  return {
    name: over.id,
    kind: 'book',
    location: { store: 'file', path: `C:\\x\\${over.id}` },
    sizeBytes: 10,
    flags: { brokenLink: true },
    ...over,
  };
}

describe('r2 #4 — cleanup offers only broken links it can remove', () => {
  it('protects a source with no remover, and removes a library record rather than trashing a missing file', () => {
    const report = planFilesCleanup(
      [
        row({ id: 'scraper-result:j1', source: 'scraper-jobs', kind: 'job' }),
        row({ id: 'library:b1', source: 'library' }),
      ],
      { enabledClasses: ['broken-links'], brokenLinkPolicy: 'prompt' },
      0,
    );
    expect(report.candidates.map((c) => [c.itemId, c.mode])).toEqual([['library:b1', 'soft']]);
    expect(report.protectedItems).toMatchObject([
      { itemId: 'scraper-result:j1', reasonKey: 'filesApp.cleanup.protect.noRemover' },
    ]);
  });
});

function entry(over: Partial<FilesScanEntry> & Pick<FilesScanEntry, 'path'>): FilesScanEntry {
  return {
    name: over.path.split('/').pop() ?? over.path,
    sizeBytes: 100,
    target: 'library-book',
    confidence: 'exact',
    reasonKey: 'x',
    candidateCount: 1,
    settlement: 'placed',
    ...over,
  } as FilesScanEntry;
}

describe('r2 #3 — a watched folder imports its auto pile', () => {
  it('splits arrivals by the review sheet disposition and leaves media-ingest media alone', () => {
    const plan = planWatchImports(
      [
        { root: 'D:/in', entry: entry({ path: 'D:/in/book.epub' }) },
        { root: 'D:/in', entry: entry({ path: 'D:/in/ep1.mkv', target: 'media' }), coveredByMediaIngest: true },
        { root: 'D:/in', entry: entry({ path: 'D:/in/x.apkg', target: 'anki-cards', confidence: 'likely', candidateCount: 2 }) },
      ],
      DEFAULT_INGEST_SETTINGS,
    );
    expect(plan.auto.map((e) => e.path)).toEqual(['D:/in/book.epub']);
    expect(plan.review.map((e) => e.path)).toEqual(['D:/in/x.apkg']);
    expect(plan.coveredByMedia).toBe(1);
  });
});

describe('r2 #6 — columns and badges', () => {
  it('keeps the old columns by default, toggles in canonical order and survives junk', () => {
    expect(normalizeFilesColumns(undefined)).toEqual([...DEFAULT_FILES_COLUMNS]);
    expect(normalizeFilesColumns(['lastUsed', 'bogus', 'kind'])).toEqual(['kind', 'lastUsed']);
    expect(toggleFilesColumn(['kind', 'size'], 'created')).toEqual(['kind', 'size', 'created']);
    expect(toggleFilesColumn(['kind', 'size'], 'kind')).toEqual(['size']);
    expect(filesGridTemplate(['size']).split(' ').length).toBeGreaterThanOrEqual(3);
  });

  it('shows every computed flag, and a switched-off dictionary as off', () => {
    const keys = filesStatusBadges({ transcribed: true, mined: true, exported: true, hasNotes: true, enabled: false })
      .map((b) => b.key);
    expect(keys).toEqual([
      'filesApp.flag.disabled',
      'filesApp.flag.transcribed',
      'filesApp.flag.mined',
      'filesApp.flag.exported',
      'filesApp.flag.hasNotes',
    ]);
  });
});

describe('r2 #9 — preview and duplicates', () => {
  it('picks a reader per file and clips text', () => {
    expect(previewPlanFor({ kind: 'artwork', path: 'C:\\a\\cover.PNG' })).toBe('image');
    expect(previewPlanFor({ kind: 'subtitle', path: 'C:\\a\\ep.ass' })).toBe('subtitle');
    expect(previewPlanFor({ kind: 'transcript', path: 'C:\\t\\abc.json' })).toBe('transcript');
    expect(previewPlanFor({ kind: 'export', path: 'C:\\e\\book.pdf' })).toBe('pdf');
    expect(previewPlanFor({ kind: 'video', path: 'C:\\v.mkv' })).toBeNull();
    expect(clipPreviewText('あいうえお', 3)).toEqual({ text: 'あいう', truncated: true });
  });

  it('finds one path under two sources, and two paths with equal content', () => {
    const hash = vi.fn((path: string) => (path.includes('copy') || path.includes('orig') ? 'same' : path));
    const groups = findDuplicateGroups(
      [
        { id: 'media:1', sizeBytes: 50, location: { store: 'file', path: 'D:\\v\\ep.mkv' } },
        { id: 'download:ep.mkv', sizeBytes: 50, location: { store: 'file', path: 'd:/v/ep.mkv' } },
        { id: 'export:orig', sizeBytes: 9, location: { store: 'file', path: 'C:\\orig.txt' } },
        { id: 'export:copy', sizeBytes: 9, location: { store: 'file', path: 'C:\\copy.txt' } },
        { id: 'export:other', sizeBytes: 7, location: { store: 'file', path: 'C:\\other.txt' } },
        { id: 'dictionary:x', sizeBytes: null, location: { store: 'sqlite' } },
      ],
      hash,
    );
    expect(groups).toEqual([
      { reason: 'path', itemIds: ['media:1', 'download:ep.mkv'] },
      { reason: 'content', itemIds: ['export:orig', 'export:copy'] },
    ]);
    // Only equal sizes are ever read.
    expect(hash).not.toHaveBeenCalledWith('C:\\other.txt', 7);
  });
});
