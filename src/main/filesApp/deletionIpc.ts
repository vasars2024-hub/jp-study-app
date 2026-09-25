import {
  executeFilesDeletion,
  FILES_DELETE_CHANNEL,
  planFilesDeletion,
  type FilesDeleteRequest,
  type FilesDeletionResult,
  type FilesDeletionTarget,
} from '../../shared/filesApp/deletion';
import path from 'node:path';

export { FILES_DELETE_CHANNEL };

export interface FilesDeletionMainDependencies {
  /** Resolve from the current main-process index, not from renderer fields. */
  lookupItem(itemId: string): FilesDeletionTarget | null;
  /** Production supplies Electron `shell.trashItem`. */
  trashItem(path: string): Promise<void>;
  /** Drop the Files index cache after the OS accepted a trash request. */
  onTrashed?(target: FilesDeletionTarget): void;
}

/** Structural subset shared by the authoritative Files index and Delete. */
export interface FilesDeletionIndexItem {
  id: string;
  name: string;
  kind: string;
  location: FilesDeletionTarget['location'];
  sizeBytes: number | null;
  flags?: { referenced?: boolean };
}

/**
 * Resolve a fresh deletion target from the main-process snapshot.
 *
 * Keeping this adapter beside the privileged handler prevents its production
 * caller from returning a renderer row or hand-copying the `referenced` flag.
 * The returned object contains only deletion policy fields, so future display
 * metadata cannot accidentally become part of the security decision.
 */
export function lookupFilesDeletionTarget(
  items: readonly FilesDeletionIndexItem[],
  itemId: string,
): FilesDeletionTarget | null {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    location: item.location,
    sizeBytes: item.sizeBytes,
    referenced: item.flags?.referenced === true,
  };
}

export interface FilesDeletionIndexAccess {
  /** Return the authoritative snapshot used for this operation. */
  getItems(): readonly FilesDeletionIndexItem[];
  /** Invalidate the snapshot only after a successful filesystem change. */
  invalidate(): void;
  /** Production supplies Electron `shell.trashItem`. */
  trashItem(path: string): Promise<void>;
}

/**
 * Bind the generic delete boundary to the production Files index.
 *
 * This is deliberately a factory instead of duplicated closures in main.ts:
 * every invocation asks the index access for its current rows, and the only
 * filesystem primitive it exposes is the Recycle Bin operation.
 */
export function createFilesDeletionMainDependencies(
  access: FilesDeletionIndexAccess,
): FilesDeletionMainDependencies {
  return {
    lookupItem: (itemId) => lookupFilesDeletionTarget(access.getItems(), itemId),
    trashItem: (path) => access.trashItem(path),
    onTrashed: () => access.invalidate(),
  };
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

  const filePath = target.location.store === 'file' ? target.location.path : '';
  if (!isAbsoluteFilePath(filePath)) {
    return { ok: false, itemId: request.itemId, reasonKey: 'filesApp.delete.failed' };
  }

  const result = await executeFilesDeletion(
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
  if (result.ok && result.mode === 'trash') {
    // The filesystem changed underneath the 15-second Files index cache. A
    // stale snapshot would briefly put the deleted row back after the UI's
    // optimistic removal, so invalidate only after trashItem resolves.
    try {
      dependencies.onTrashed?.(target);
    } catch {
      // The OS already accepted the destructive operation. Cache maintenance
      // failing must not turn that success into a false "nothing changed"
      // error; the TTL remains the safe fallback.
    }
  }
  return result;
}

/**
 * A catalogue row is authoritative about which item was selected, but a
 * malformed row must not turn the app's working directory into a deletion
 * root. Accept both platform path syntaxes so imported Windows rows remain
 * testable on non-Windows CI while still refusing relative and drive-relative
 * values such as `episode.srt` and `C:episode.srt`.
 */
export function isAbsoluteFilePath(value: string): boolean {
  const candidate = value.trim();
  return Boolean(candidate) && (path.win32.isAbsolute(candidate) || path.posix.isAbsolute(candidate));
}

export const FILES_TRASH_OWNED_FILE_CHANNEL = 'filesapp:trash-owned-file';

/**
 * The one extra a linked-media delete may carry: the user ticked "also move
 * the file to the Recycle Bin". Same contract as Delete — an id crosses the
 * bridge, the path is re-read here — and narrower: only a `media:` row that is
 * a link to the user's own file qualifies, because that is the only row whose
 * Delete offers the choice.
 */
export async function trashOwnedMediaFileInMain(
  requestValue: unknown,
  dependencies: FilesDeletionMainDependencies,
): Promise<{ ok: boolean; reasonKey?: string }> {
  if (typeof requestValue !== 'string' || !requestValue.startsWith('media:') || requestValue.length > 1_024) {
    return { ok: false, reasonKey: 'filesApp.delete.invalidRequest' };
  }
  const target = dependencies.lookupItem(requestValue);
  if (!target || target.id !== requestValue) return { ok: false, reasonKey: 'filesApp.delete.notFound' };
  if (target.referenced !== true || target.location.store !== 'file') {
    return { ok: false, reasonKey: 'filesApp.delete.refuseNotTrashable' };
  }
  if (!isAbsoluteFilePath(target.location.path)) {
    return { ok: false, reasonKey: 'filesApp.delete.failed' };
  }
  try {
    await dependencies.trashItem(target.location.path);
  } catch {
    return { ok: false, reasonKey: 'filesApp.delete.failed' };
  }
  try {
    dependencies.onTrashed?.(target);
  } catch {
    /* the trash itself succeeded; the cache TTL is the fallback */
  }
  return { ok: true };
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
  ipc.handle(FILES_TRASH_OWNED_FILE_CHANNEL, (_event, itemId) =>
    trashOwnedMediaFileInMain(itemId, dependencies),
  );
}
