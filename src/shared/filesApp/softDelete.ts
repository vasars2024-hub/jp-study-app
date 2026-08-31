import type { FilesSoftDeleteReceipt } from './deletion';

export const FILES_SOFT_DELETE_STORAGE_KEY = 'jp-files-soft-deletes-v1';
export const FILES_SOFT_DELETE_EVENT = 'jp-files-soft-deletes-changed';
export const FILES_SOFT_DELETE_UNDO_MS = 10_000;

export interface FilesSoftDeleteTombstone extends FilesSoftDeleteReceipt {
  itemId: string;
  deletedAt: number;
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
    const tombstones = candidate.tombstones.filter(
      (row): row is FilesSoftDeleteTombstone =>
        Boolean(row) &&
        typeof row === 'object' &&
        typeof (row as FilesSoftDeleteTombstone).itemId === 'string' &&
        (row as FilesSoftDeleteTombstone).itemId.length > 0 &&
        typeof (row as FilesSoftDeleteTombstone).undoToken === 'string' &&
        (row as FilesSoftDeleteTombstone).undoToken.length > 0 &&
        isFiniteTimestamp((row as FilesSoftDeleteTombstone).deletedAt) &&
        isFiniteTimestamp((row as FilesSoftDeleteTombstone).undoExpiresAt),
    );
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

  delete(itemId: string, now = Date.now()): FilesSoftDeleteReceipt {
    if (!itemId) throw new Error('Files soft-delete requires an item id');
    const state = parseState(this.persistence.read(FILES_SOFT_DELETE_STORAGE_KEY));
    const existing = state.tombstones.find((row) => row.itemId === itemId);
    if (existing) {
      return { undoToken: existing.undoToken, undoExpiresAt: existing.undoExpiresAt };
    }

    const undoToken = this.createToken();
    if (!undoToken) throw new Error('Files soft-delete requires a non-empty undo token');
    const tombstone: FilesSoftDeleteTombstone = {
      itemId,
      deletedAt: now,
      undoToken,
      undoExpiresAt: now + Math.max(0, this.undoWindowMs),
    };
    this.save({ version: 1, tombstones: [...state.tombstones, tombstone] });
    return { undoToken, undoExpiresAt: tombstone.undoExpiresAt };
  }

  undo(undoToken: string, now = Date.now()): FilesSoftDeleteUndoResult {
    const state = parseState(this.persistence.read(FILES_SOFT_DELETE_STORAGE_KEY));
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

  private save(state: FilesSoftDeleteStateV1): void {
    this.persistence.write(FILES_SOFT_DELETE_STORAGE_KEY, JSON.stringify(state));
    this.persistence.emit?.(FILES_SOFT_DELETE_EVENT);
  }
}
