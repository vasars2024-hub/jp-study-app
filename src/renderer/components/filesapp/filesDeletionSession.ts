import {
  authorizeFilesDeletion,
  executeFilesDeletion,
  planFilesDeletion,
  type FilesDeletionAuthorization,
  type FilesDeletionLocation,
  type FilesDeletionPlan,
  type FilesDeletionResult,
  type FilesDeletionTarget,
} from '../../../shared/filesApp/deletion';
import {
  FILES_SOFT_DELETE_EVENT,
  FILES_SOFT_DELETE_STORAGE_KEY,
  FilesSoftDeleteStore,
  type FilesSoftDeletePersistence,
  type FilesSoftDeleteUndoResult,
} from '../../../shared/filesApp/softDelete';

/** The structural subset of a catalogue row needed by Delete. */
export interface FilesDeletionCatalogueItem {
  id: string;
  name: string;
  kind: string;
  location: FilesDeletionLocation;
  sizeBytes: number | null;
  flags?: { referenced?: boolean };
}

/**
 * Only an index id and its exact confirmation cross IPC. Main must resolve the
 * authoritative row again; accepting a renderer-supplied path would turn an
 * XSS into an arbitrary Recycle Bin primitive.
 */
export interface FilesTrashRequest extends FilesDeletionAuthorization {
  itemId: string;
}

export interface FilesDeletionBridge {
  trash(request: FilesTrashRequest): Promise<FilesDeletionResult>;
}

export function deletionTargetFromItem(item: FilesDeletionCatalogueItem): FilesDeletionTarget {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    location: item.location,
    sizeBytes: item.sizeBytes,
    referenced: item.flags?.referenced === true,
  };
}

/**
 * One renderer deletion session over the heterogeneous Files catalogue.
 *
 * File trashing stays in main. Index-only deletion stays in the renderer so
 * localStorage retains one owner. Both return the same result union, while the
 * tombstone overlay provides exact, bounded undo without rewriting any source
 * store owned by another application surface.
 */
export class FilesDeletionSession {
  private readonly softDeletes: FilesSoftDeleteStore;

  constructor(
    private readonly bridge: FilesDeletionBridge,
    persistence: FilesSoftDeletePersistence,
    createToken: () => string,
    undoWindowMs?: number,
  ) {
    this.softDeletes = new FilesSoftDeleteStore(persistence, createToken, undoWindowMs);
  }

  plan(item: FilesDeletionCatalogueItem): FilesDeletionPlan {
    return planFilesDeletion(deletionTargetFromItem(item));
  }

  isDeleted(itemId: string): boolean {
    return this.softDeletes.isDeleted(itemId);
  }

  visibleItems<T extends { id: string }>(items: readonly T[]): T[] {
    const hidden = new Set(this.softDeletes.list().map((row) => row.itemId));
    return items.filter((item) => !hidden.has(item.id));
  }

  async delete(
    item: FilesDeletionCatalogueItem,
    authorization: FilesDeletionAuthorization = {},
  ): Promise<FilesDeletionResult> {
    const target = deletionTargetFromItem(item);
    const plan = planFilesDeletion(target);

    if (plan.mode === 'none') {
      return { ok: false, itemId: target.id, reasonKey: 'filesApp.delete.refuseComputed' };
    }

    const refusal = authorizeFilesDeletion(plan, authorization);
    if (refusal) return refusal;

    if (plan.mode === 'trash') {
      const result = await this.bridge.trash({
        itemId: target.id,
        confirmedItemId: authorization.confirmedItemId,
      });
      // A stale or compromised bridge reply must not be attached to the row
      // currently selected in the renderer.
      if (result.itemId !== target.id) {
        return {
          ok: false,
          itemId: target.id,
          reasonKey: 'filesApp.delete.failed',
        };
      }
      return result;
    }

    return executeFilesDeletion(target, authorization, {
      trashFile: async () => {
        throw new Error('Index-only deletion cannot trash a file');
      },
      softDelete: async ({ id }) => this.softDeletes.delete(id),
    });
  }

  undo(undoToken: string, now = Date.now()): FilesSoftDeleteUndoResult {
    return this.softDeletes.undo(undoToken, now);
  }
}

interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Adapt browser storage without reading `window` at module load. */
export function browserFilesSoftDeletePersistence(
  storage: BrowserStorageLike,
  emit: (eventName: string) => void,
): FilesSoftDeletePersistence {
  return {
    read: (key) => storage.getItem(key),
    write: (key, value) => storage.setItem(key, value),
    emit,
  };
}

/** Browser defaults kept behind a function so unit tests and SSR can import safely. */
export function createBrowserFilesDeletionSession(bridge: FilesDeletionBridge): FilesDeletionSession {
  const persistence = browserFilesSoftDeletePersistence(window.localStorage, (eventName) => {
    window.dispatchEvent(new CustomEvent(eventName));
  });
  return new FilesDeletionSession(bridge, persistence, () => window.crypto.randomUUID());
}

export { FILES_SOFT_DELETE_EVENT, FILES_SOFT_DELETE_STORAGE_KEY };
