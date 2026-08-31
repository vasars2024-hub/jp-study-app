import {
  executeFilesDeletion,
  planFilesDeletion,
  type FilesDeletionResult,
  type FilesDeletionTarget,
} from '../../shared/filesApp/deletion';

export const FILES_DELETE_CHANNEL = 'filesapp:delete';

export interface FilesDeleteRequest {
  /** The only catalogue identity accepted from the renderer. Never a path. */
  itemId: string;
  /** Exact id from the confirmation dialog, when the resolved item is media. */
  confirmedItemId?: string;
}

export interface FilesDeletionMainDependencies {
  /** Resolve from the current main-process index, not from renderer fields. */
  lookupItem(itemId: string): FilesDeletionTarget | null;
  /** Production supplies Electron `shell.trashItem`. */
  trashItem(path: string): Promise<void>;
}

function sanitizeRequest(value: unknown): FilesDeleteRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as { itemId?: unknown; confirmedItemId?: unknown };
  if (typeof raw.itemId !== 'string' || !raw.itemId.trim() || raw.itemId.length > 1_024) {
    return null;
  }
  if (
    raw.confirmedItemId !== undefined &&
    (typeof raw.confirmedItemId !== 'string' || raw.confirmedItemId.length > 1_024)
  ) {
    return null;
  }
  return {
    itemId: raw.itemId,
    confirmedItemId: raw.confirmedItemId as string | undefined,
  };
}

/**
 * Resolve and trash one item on the privileged side of the bridge.
 *
 * The request contains no path, kind, ownership or risk fields. All of those
 * come from the main index immediately before execution, so a compromised or
 * stale renderer cannot downgrade a video or point Delete at an arbitrary
 * file. Index-only and referenced rows stay renderer-owned soft deletes and
 * are explicitly refused here rather than accidentally falling through.
 */
export async function deleteFilesItemInMain(
  requestValue: unknown,
  dependencies: FilesDeletionMainDependencies,
): Promise<FilesDeletionResult> {
  const request = sanitizeRequest(requestValue);
  if (!request) {
    return { ok: false, itemId: '', reasonKey: 'filesApp.delete.invalidRequest' };
  }

  const target = dependencies.lookupItem(request.itemId);
  if (!target) {
    return { ok: false, itemId: request.itemId, reasonKey: 'filesApp.delete.notFound' };
  }

  // Defend against a corrupt index adapter returning a different row than it
  // was asked for; otherwise a stale lookup could trash item B for request A.
  if (target.id !== request.itemId) {
    return { ok: false, itemId: request.itemId, reasonKey: 'filesApp.delete.notFound' };
  }

  if (planFilesDeletion(target).mode !== 'trash') {
    return {
      ok: false,
      itemId: request.itemId,
      reasonKey: 'filesApp.delete.refuseNotTrashable',
    };
  }

  return executeFilesDeletion(
    target,
    { confirmedItemId: request.confirmedItemId },
    {
      trashFile: dependencies.trashItem,
      // This branch is guarded above. Keeping it a hard failure ensures a
      // future policy change cannot make main a second writer for an index.
      softDelete: async () => {
        throw new Error('Main process cannot soft-delete renderer-owned rows');
      },
    },
  );
}

export interface FilesIpcHandleRegistrar {
  handle(channel: string, listener: (_event: unknown, request: unknown) => unknown): void;
}

/** Registration is dependency-injected so the security boundary has a unit test. */
export function registerFilesDeletionIpc(
  ipc: FilesIpcHandleRegistrar,
  dependencies: FilesDeletionMainDependencies,
): void {
  ipc.handle(FILES_DELETE_CHANNEL, (_event, request) =>
    deleteFilesItemInMain(request, dependencies),
  );
}
