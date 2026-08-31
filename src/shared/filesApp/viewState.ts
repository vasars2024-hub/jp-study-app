/**
 * Gate 22 — per-folder view state, as a pure model.
 *
 * The gate: "Sort column, direction and view mode are remembered per folder
 * across a restart."
 *
 * **Per folder is the whole gate.** One global sort would be remembered across a
 * restart too, and would pass a careless reading of the sentence while being a
 * different feature: sorting Downloads by size and then opening Subtitles must
 * not re-sort Subtitles by size. So the unit of memory is a folder KEY, and the
 * key has to name the same folder the list is actually showing.
 *
 * **The key's precedence mirrors the list's, deliberately.** `FilesApp` resolves
 * what to show as smart folder, then collection, then derived category, then the
 * whole tree. If this key used any other order, a window that somehow held two
 * scopes at once would remember its sort under the name of a folder nobody was
 * looking at — the setting would appear to be forgotten while in fact being
 * faithfully stored against the wrong row. Keep the two in step.
 *
 * **An unknown value is refused, not coerced.** `parseViewStateDoc` drops an
 * entry it cannot read, which is right for a corrupted document but is exactly
 * the wrong answer for a write: a value that is stored and then silently dropped
 * at the next load looks to the user like a setting that does not persist. So
 * the writer refuses first, and the two halves cannot disagree about what a
 * legal value is.
 */
import { FILES_SORT_COLUMNS, type FilesCategoryId, type FilesSortColumn, type FilesSortDirection } from './catalog';

/** Bumped when the on-disk shape changes; readers migrate forward, never guess. */
export const FILES_VIEW_STATE_VERSION = 1;

/**
 * The list presentations.
 *
 * `details` is the column table; `compact` is name and kind only, on a shorter
 * row. Deliberately two and not four: the list is windowed by `VirtualList` at a
 * fixed `itemHeight`, so a tile grid is a second windowing mode rather than a
 * class name, and gate 22 asks about REMEMBERING the mode rather than about how
 * many exist. A third value can be added here later without touching the
 * persistence contract, which is the reversible half.
 */
export const FILES_VIEW_MODES = ['details', 'compact'] as const;
export type FilesViewMode = (typeof FILES_VIEW_MODES)[number];

export const FILES_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export interface FilesFolderView {
  sortColumn: FilesSortColumn;
  sortDirection: FilesSortDirection;
  viewMode: FilesViewMode;
}

/** What a folder shows before anyone has told it otherwise. */
export const DEFAULT_FOLDER_VIEW: FilesFolderView = {
  sortColumn: 'name',
  sortDirection: 'asc',
  viewMode: 'details',
};

export interface FilesFolderViewEntry extends FilesFolderView {
  /** Drives eviction only. Never read by the view. */
  updatedAt: number;
}

export interface FilesViewStateDoc {
  version: number;
  folders: Record<string, FilesFolderViewEntry>;
}

export interface FilesViewStateResult {
  doc: FilesViewStateDoc;
  errorKey?: string;
}

export const EMPTY_VIEW_STATE_DOC: FilesViewStateDoc = {
  version: FILES_VIEW_STATE_VERSION,
  folders: {},
};

/**
 * How many folders are remembered.
 *
 * The derived categories are a fixed list, but collections and saved searches
 * are user-created and deleting one leaves its key behind with nothing to point
 * at. Unbounded, a document that only ever grows would eventually be the reason
 * a `setItem` throws — and the failure would land on some unrelated write.
 * Least-recently-set is evicted, so the folders someone actually uses stay.
 */
export const MAX_REMEMBERED_FOLDERS = 200;

/** Which folder the list is showing. Mirrors `FilesApp`'s own three scopes. */
export interface FilesFolderRef {
  scope?: FilesCategoryId | null;
  collectionId?: string | null;
  smartId?: string | null;
}

/** The whole tree, when nothing is narrowed. Stable, so it survives a rename. */
export const ROOT_FOLDER_KEY = 'root';

export function folderViewKey(ref: FilesFolderRef): string {
  // Same precedence as the list's own resolution — see the header.
  if (ref.smartId) return `smart:${ref.smartId}`;
  if (ref.collectionId) return `collection:${ref.collectionId}`;
  if (ref.scope) return `category:${ref.scope}`;
  return ROOT_FOLDER_KEY;
}

function isSortColumn(value: unknown): value is FilesSortColumn {
  return typeof value === 'string' && (FILES_SORT_COLUMNS as readonly string[]).includes(value);
}

function isSortDirection(value: unknown): value is FilesSortDirection {
  return value === 'asc' || value === 'desc';
}

function isViewMode(value: unknown): value is FilesViewMode {
  return typeof value === 'string' && (FILES_VIEW_MODES as readonly string[]).includes(value);
}

/**
 * Never throws, and never reinterprets a document from a future version — an
 * unknown version reads as empty rather than as a shape guessed at field by
 * field, which is how a forward-compatible reader corrupts a backup.
 */
export function parseViewStateDoc(raw: unknown): FilesViewStateDoc {
  if (!raw || typeof raw !== 'object') return EMPTY_VIEW_STATE_DOC;
  const source = raw as { version?: unknown; folders?: unknown };
  if (source.version !== FILES_VIEW_STATE_VERSION) return EMPTY_VIEW_STATE_DOC;
  if (!source.folders || typeof source.folders !== 'object') return EMPTY_VIEW_STATE_DOC;
  const folders: Record<string, FilesFolderViewEntry> = {};
  for (const [key, value] of Object.entries(source.folders as Record<string, unknown>)) {
    if (!key || !value || typeof value !== 'object') continue;
    const entry = value as Partial<FilesFolderViewEntry>;
    // A partially legible entry is dropped whole rather than half-adopted: a row
    // that kept its sort but lost its view mode would be a folder that
    // remembered some of what it was told and not the rest.
    if (!isSortColumn(entry.sortColumn)) continue;
    if (!isSortDirection(entry.sortDirection)) continue;
    if (!isViewMode(entry.viewMode)) continue;
    folders[key] = {
      sortColumn: entry.sortColumn,
      sortDirection: entry.sortDirection,
      viewMode: entry.viewMode,
      updatedAt: typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
        ? entry.updatedAt
        : 0,
    };
  }
  return { version: FILES_VIEW_STATE_VERSION, folders };
}

/** What this folder shows. An unremembered folder is the default, not an error. */
export function folderView(doc: FilesViewStateDoc, key: string): FilesFolderView {
  const entry = doc.folders[key];
  if (!entry) return DEFAULT_FOLDER_VIEW;
  return {
    sortColumn: entry.sortColumn,
    sortDirection: entry.sortDirection,
    viewMode: entry.viewMode,
  };
}

function evict(folders: Record<string, FilesFolderViewEntry>): Record<string, FilesFolderViewEntry> {
  const keys = Object.keys(folders);
  if (keys.length <= MAX_REMEMBERED_FOLDERS) return folders;
  const ordered = keys.sort((a, b) => folders[b].updatedAt - folders[a].updatedAt);
  const kept: Record<string, FilesFolderViewEntry> = {};
  for (const key of ordered.slice(0, MAX_REMEMBERED_FOLDERS)) kept[key] = folders[key];
  return kept;
}

/**
 * Record part of a folder's view.
 *
 * A patch rather than a whole entry, because the three controls are three
 * separate gestures — flipping the direction must not also re-assert a view mode
 * a second window changed a moment ago.
 */
export function setFolderView(
  doc: FilesViewStateDoc,
  key: string,
  patch: Partial<FilesFolderView>,
  now: number,
): FilesViewStateResult {
  if (!key) return { doc, errorKey: 'filesApp.view.error.unknownFolder' };
  if (patch.sortColumn !== undefined && !isSortColumn(patch.sortColumn)) {
    return { doc, errorKey: 'filesApp.view.error.unknownValue' };
  }
  if (patch.sortDirection !== undefined && !isSortDirection(patch.sortDirection)) {
    return { doc, errorKey: 'filesApp.view.error.unknownValue' };
  }
  if (patch.viewMode !== undefined && !isViewMode(patch.viewMode)) {
    return { doc, errorKey: 'filesApp.view.error.unknownValue' };
  }
  const current = folderView(doc, key);
  const next: FilesFolderViewEntry = {
    sortColumn: patch.sortColumn ?? current.sortColumn,
    sortDirection: patch.sortDirection ?? current.sortDirection,
    viewMode: patch.viewMode ?? current.viewMode,
    updatedAt: now,
  };
  return {
    doc: {
      version: FILES_VIEW_STATE_VERSION,
      folders: evict({ ...doc.folders, [key]: next }),
    },
  };
}

/**
 * Forget one folder's view. Used when its folder goes away, so a deleted
 * collection does not hold a slot forever — and it is also the honest "reset to
 * default" for a folder the user wants back to plain.
 */
export function forgetFolderView(doc: FilesViewStateDoc, key: string): FilesViewStateResult {
  if (!doc.folders[key]) return { doc };
  const folders = { ...doc.folders };
  delete folders[key];
  return { doc: { version: FILES_VIEW_STATE_VERSION, folders } };
}
