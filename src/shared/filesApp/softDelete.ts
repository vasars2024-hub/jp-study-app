import type { FilesOwnerDelete, FilesSoftDeleteReceipt } from './deletion';

export const FILES_SOFT_DELETE_STORAGE_KEY = 'jp-files-soft-deletes-v1';
export const FILES_SOFT_DELETE_EVENT = 'jp-files-soft-deletes-changed';
export const FILES_SOFT_DELETE_UNDO_MS = 10_000;

/** The owner's real delete, run once the undo window has passed. */
export interface FilesSoftDeleteCommit extends FilesOwnerDelete {
  /** Linked media only: the user also asked for the file itself to go. */
  trashFile?: boolean;
}

export interface FilesSoftDeleteTombstone extends FilesSoftDeleteReceipt {
  itemId: string;
  deletedAt: number;
  /** What the row was called, so the Hidden items view can name it. */
  name?: string;
  /** Present for an owner delete that has not run yet. */
  commit?: FilesSoftDeleteCommit;
  /**
   * The owner refused or failed. The row stays hidden and is listed under
   * Hidden items with the reason, where it can be restored — it is never
   * silently re-shown, and never silently claimed as deleted.
   */
  commitError?: string;
}

interface FilesSoftDeleteStateV1 {
  version: 1;
  tombstones: FilesSoftDeleteTombstone[];
}

export interface FilesSoftDeletePersistence {
  read(key: string): string | null;
  write(key: string, value: string): void;
  emit?(eventName: string): void;
}

export type FilesSoftDeleteUndoResult =
  | { ok: true; itemId: string }
  | { ok: false; reason: 'unknown-token' | 'expired' | 'storage-failed' };

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseState(raw: string | null): FilesSoftDeleteStateV1 {
  if (!raw) return { version: 1, tombstones: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { version: 1, tombstones: [] };
    const candidate = parsed as { version?: unknown; tombstones?: unknown };
    if (candidate.version !== 1 || !Array.isArray(candidate.tombstones)) {
      return { version: 1, tombstones: [] };
    }
    const tombstones: FilesSoftDeleteTombstone[] = [];
    const itemIds = new Set<string>();
    const undoTokens = new Set<string>();
    for (const row of candidate.tombstones) {
      if (!row || typeof row !== 'object') continue;
      const tombstone = row as FilesSoftDeleteTombstone;
      if (
        typeof tombstone.itemId !== 'string' ||
        !tombstone.itemId ||
        typeof tombstone.undoToken !== 'string' ||
        !tombstone.undoToken ||
        !isFiniteTimestamp(tombstone.deletedAt) ||
        !isFiniteTimestamp(tombstone.undoExpiresAt) ||
        itemIds.has(tombstone.itemId) ||
        undoTokens.has(tombstone.undoToken)
      ) {
        continue;
      }
      itemIds.add(tombstone.itemId);
      undoTokens.add(tombstone.undoToken);
      tombstones.push(tombstone);
    }
    return { version: 1, tombstones };
  } catch {
    return { version: 1, tombstones: [] };
  }
}

/**
 * Persisted overlay for index-only deletes.
 *
 * The owning record stays intact: Files filters tombstoned ids out of its view,
 * so undo is exact and no heterogeneous store gains a second writer. The undo
 * window expires; the tombstone does not, because an expired undo must not make
 * a deliberately removed row silently reappear on the next launch.
 */
export class FilesSoftDeleteStore {
  constructor(
    private readonly persistence: FilesSoftDeletePersistence,
    private readonly createToken: () => string,
    private readonly undoWindowMs = FILES_SOFT_DELETE_UNDO_MS,
  ) {}

  list(): FilesSoftDeleteTombstone[] {
    return parseState(this.persistence.read(FILES_SOFT_DELETE_STORAGE_KEY)).tombstones;
  }

  isDeleted(itemId: string): boolean {
    return this.list().some((row) => row.itemId === itemId);
  }

  delete(
    itemId: string,
    now = Date.now(),
    extra: { name?: string; commit?: FilesSoftDeleteCommit } = {},
  ): FilesSoftDeleteReceipt {
    if (!itemId) throw new Error('Files soft-delete requires an item id');
    const state = parseState(this.persistence.read(FILES_SOFT_DELETE_STORAGE_KEY));
    const existing = state.tombstones.find((row) => row.itemId === itemId);
    if (existing) {
      return { undoToken: existing.undoToken, undoExpiresAt: existing.undoExpiresAt };
    }

    const undoToken = this.createToken();
    if (!undoToken) throw new Error('Files soft-delete requires a non-empty undo token');
    if (state.tombstones.some((row) => row.undoToken === undoToken)) {
      throw new Error('Files soft-delete requires a unique undo token');
    }
    const tombstone: FilesSoftDeleteTombstone = {
      itemId,
      deletedAt: now,
      undoToken,
      undoExpiresAt: now + Math.max(0, this.undoWindowMs),
      ...(extra.name ? { name: extra.name } : {}),
      ...(extra.commit ? { commit: extra.commit } : {}),
    };
    this.save({ version: 1, tombstones: [...state.tombstones, tombstone] });
    return { undoToken, undoExpiresAt: tombstone.undoExpiresAt };
  }

  undo(undoToken: string, now = Date.now()): FilesSoftDeleteUndoResult {
    let state: FilesSoftDeleteStateV1;
    try {
      state = parseState(this.persistence.read(FILES_SOFT_DELETE_STORAGE_KEY));
    } catch {
      return { ok: false, reason: 'storage-failed' };
    }
    const match = state.tombstones.find((row) => row.undoToken === undoToken);
    if (!match) return { ok: false, reason: 'unknown-token' };
    if (now > match.undoExpiresAt) return { ok: false, reason: 'expired' };

    try {
      this.save({
        version: 1,
        tombstones: state.tombstones.filter((row) => row.itemId !== match.itemId),
      });
    } catch {
      // localStorage writes are allowed to fail (quota, privacy policy, an
      // unavailable renderer store). The row must remain hidden rather than
      // claiming Undo worked only for it to reappear deleted after restart.
      return { ok: false, reason: 'storage-failed' };
    }
    return { ok: true, itemId: match.itemId };
  }

  /**
   * Owner deletes whose undo window has passed and that have not been tried
   * yet. A failed one is not retried on its own: the owner already said no,
   * and a loop that asked again every few seconds would only repeat it.
   */
  due(now = Date.now()): FilesSoftDeleteTombstone[] {
    return this.list().filter(
      (row) => row.commit && !row.commitError && now > row.undoExpiresAt,
    );
  }

  /** Rows that are hidden rather than deleted: hide-only, or an owner that refused. */
  hidden(): FilesSoftDeleteTombstone[] {
    return this.list().filter((row) => !row.commit || Boolean(row.commitError));
  }

  /** The owner removed the record, so there is nothing left to hide. */
  settle(itemId: string): void {
    const state = parseState(this.persistence.read(FILES_SOFT_DELETE_STORAGE_KEY));
    if (!state.tombstones.some((row) => row.itemId === itemId)) return;
    this.save({ version: 1, tombstones: state.tombstones.filter((row) => row.itemId !== itemId) });
  }

  markFailed(itemId: string, reason: string): void {
    const state = parseState(this.persistence.read(FILES_SOFT_DELETE_STORAGE_KEY));
    this.save({
      version: 1,
      tombstones: state.tombstones.map((row) =>
        row.itemId === itemId ? { ...row, commitError: reason || 'failed' } : row,
      ),
    });
  }

  /**
   * Hidden items' Restore: un-hide a row whenever the user asks. Unlike
   * `undo` this has no window — a hide is not a delete, so there is nothing
   * the passing of time made irreversible. A pending owner delete is not
   * restorable here (its receipt carries Undo while it is still pending).
   */
  restore(itemId: string): boolean {
    let state: FilesSoftDeleteStateV1;
    try {
      state = parseState(this.persistence.read(FILES_SOFT_DELETE_STORAGE_KEY));
    } catch {
      return false;
    }
    const match = state.tombstones.find((row) => row.itemId === itemId);
    if (!match || (match.commit && !match.commitError)) return false;
    try {
      this.save({ version: 1, tombstones: state.tombstones.filter((row) => row.itemId !== itemId) });
    } catch {
      return false;
    }
    return true;
  }

  private save(state: FilesSoftDeleteStateV1): void {
    this.persistence.write(FILES_SOFT_DELETE_STORAGE_KEY, JSON.stringify(state));
    this.persistence.emit?.(FILES_SOFT_DELETE_EVENT);
  }
}
