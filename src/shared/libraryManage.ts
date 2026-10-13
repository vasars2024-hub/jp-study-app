/**
 * Shapes the Library's management channels share across the bridge: the
 * import job's progress, the trash, details editing and relink results.
 * Types only — main owns the behaviour (`main/library.ts`,
 * `main/libraryImportJob.ts`, `main/libraryTrash.ts`).
 */
import type { LibraryItem } from './types';

export const LIBRARY_IMPORT_PROGRESS_CHANNEL = 'library:importProgress';

export type LibraryImportFailureCode = 'unreadable' | 'no-pages' | 'storage-full' | 'bad-file';

export type LibraryImportState = 'running' | 'done' | 'cancelled';

export interface LibraryImportProgress {
  jobId: string;
  state: LibraryImportState;
  total: number;
  done: number;
  imported: number;
  duplicates: number;
  failed: number;
  /** File name (not path) being imported now. */
  current?: string;
  /** Paths not yet processed — what Resume would import. */
  remaining: number;
  /** The first few failures, by file name. */
  failures: Array<{ name: string; errorCode: LibraryImportFailureCode }>;
  /** Ids imported by this job, oldest first. */
  addedIds: string[];
}

export interface LibraryImportStatus {
  progress: LibraryImportProgress | null;
  /** Paths an interrupted or cancelled import did not reach (Resume imports them). */
  resumable: number;
}

/** A removed item as the shelf lists it: enough to restore, no paths. */
export interface LibraryTrashSummary {
  id: string;
  title: string;
  kind: LibraryItem['kind'];
  removedAt: number;
  /** When it leaves for the Recycle Bin. */
  expiresAt: number;
}

export type LibraryRestoreResult =
  | { ok: true; items: LibraryItem[]; item: LibraryItem }
  | { ok: false; errorCode: 'not-found' | 'busy' | 'conflict' | 'service-error' };

export type LibraryMetaUpdateResult =
  | { ok: true; item: LibraryItem; items: LibraryItem[] }
  | { ok: false; errorKey: string };

export type RelinkMangaResult =
  | { ok: true; pageCount: number }
  | { ok: false; canceled?: boolean; errorCode?: 'not-found' | 'no-pages' | 'storage-full' | 'service-error' };
