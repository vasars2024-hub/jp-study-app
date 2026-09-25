/**
 * Files-app deletion policy and exact-target executor.
 *
 * The Files catalogue is a view over several stores, so "delete this row" is
 * not one operation. File-backed rows go through the OS trash, index-backed
 * rows are soft-deleted by their owning store, and computed rows have nothing
 * durable to remove. This module keeps those modes distinct and deliberately
 * has no filesystem implementation: the main process supplies `trashFile`,
 * while each index owner supplies its own reversible soft-delete adapter.
 */

export type FilesDeletionLocation =
  | { store: 'file'; path: string }
  | { store: 'sqlite'; database: string; table: string; rowId: string }
  | { store: 'json'; file: string; pointer: string }
  | { store: 'localStorage'; key: string; pointer?: string }
  | { store: 'derived'; describes: string };

/**
 * `owner` is a real delete through the store that owns the record (the
 * Library's `library:remove`, the dictionary's own uninstall, the deck's
 * `removeDeckCards`, …), run once the undo window has passed. `soft` is what
 * is left for records no owner can delete from here: hidden in Files only,
 * and restorable from the Hidden items view.
 */
export type FilesDeletionMode = 'trash' | 'owner' | 'soft' | 'none';
export type FilesDeletionRisk = 'replaceable' | 'irreplaceable-media';
export const FILES_DELETE_CHANNEL = 'filesapp:delete';

export interface FilesDeletionTarget {
  /** Stable catalogue id. Also binds an explicit confirmation to one item. */
  id: string;
  name: string;
  /** Authoritative catalogue kind; deletion risk is derived from this value. */
  kind: string;
  location: FilesDeletionLocation;
  sizeBytes: number | null;
  /**
   * The catalogue points at a user-owned file in place. Removing this item must
   * hide the index row only; it must never trash the original file (gate 30).
   */
  referenced?: boolean;
}

export interface FilesDeletionPlan {
  itemId: string;
  mode: FilesDeletionMode;
  risk: FilesDeletionRisk;
  /** i18n key for the confirmation/refusal copy. */
  messageKey: string;
  messageValues: { name: string; sizeBytes: number | null };
  requiresExplicitConfirmation: boolean;
  /** Which store's own delete runs, for an `owner` plan. */
  owner?: FilesOwnerDeleteKind;
}

/**
 * The stores a Files delete can actually remove a record from, each through
 * that store's own API (audit r2 #2: every non-file delete used to be a
 * permanent hide that the owning app never heard about).
 */
export const FILES_OWNER_DELETE_KINDS = [
  'library',
  'media',
  'dictionary',
  'visual-novel',
  'deck-card',
  'notebook',
  'saved-word',
  'translation',
  'clipboard',
  'annotation',
] as const;
export type FilesOwnerDeleteKind = (typeof FILES_OWNER_DELETE_KINDS)[number];

export interface FilesOwnerDelete {
  owner: FilesOwnerDeleteKind;
  /** The id inside the owning store — the catalogue id minus its prefix. */
  localId: string;
}

const OWNER_FOR_PREFIX: Readonly<Record<string, FilesOwnerDeleteKind>> = {
  library: 'library',
  media: 'media',
  dictionary: 'dictionary',
  'visual-novel': 'visual-novel',
  'deck-card': 'deck-card',
  notebook: 'notebook',
  'saved-word': 'saved-word',
  translation: 'translation',
  clipboard: 'clipboard',
  annotation: 'annotation',
};

/**
 * Which owner deletes this row, or `null` when none can. A media row is only
 * owner-deleted when it is a LINK to the user's file (`referenced`, which every
 * real library row is): the record goes, and the bytes stay unless the user
 * asks for them too.
 */
export function ownerDeleteFor(
  target: Pick<FilesDeletionTarget, 'id' | 'location' | 'referenced'>,
): FilesOwnerDelete | null {
  if (target.location.store === 'derived') return null;
  const at = target.id.indexOf(':');
  if (at <= 0 || at === target.id.length - 1) return null;
  const owner = OWNER_FOR_PREFIX[target.id.slice(0, at)];
  if (!owner) return null;
  if (owner === 'media' && target.referenced !== true) return null;
  return { owner, localId: target.id.slice(at + 1) };
}

/**
 * Confirm copy per owner — spelled out rather than built from the owner id so
 * `tools/i18n-check.cjs` and grep can see every key.
 */
const OWNER_CONFIRM_KEY: Readonly<Record<FilesOwnerDeleteKind, string>> = {
  library: 'filesApp.delete.confirmOwner.library',
  media: 'filesApp.delete.confirmOwner.media',
  dictionary: 'filesApp.delete.confirmOwner.dictionary',
  'visual-novel': 'filesApp.delete.confirmOwner.visualNovel',
  'deck-card': 'filesApp.delete.confirmOwner.deckCard',
  notebook: 'filesApp.delete.confirmOwner.note',
  'saved-word': 'filesApp.delete.confirmOwner.savedWord',
  translation: 'filesApp.delete.confirmOwner.translation',
  clipboard: 'filesApp.delete.confirmOwner.clipboard',
  annotation: 'filesApp.delete.confirmOwner.highlight',
};

export function deletionModeForLocation(location: FilesDeletionLocation): FilesDeletionMode {
  if (location.store === 'file') return 'trash';
  if (location.store === 'derived') return 'none';
  return 'soft';
}

/**
 * Resolve the actual operation, including reference-in-place ownership.
 *
 * A referenced file is still file-backed for Open and Reveal, but it is
 * index-backed for Delete. Keeping that distinction on the target prevents a
 * generic `location.store === 'file'` branch from deleting user-owned bytes.
 */
export function deletionModeForTarget(target: FilesDeletionTarget): FilesDeletionMode {
  if (target.location.store === 'file' && target.referenced === true) return 'soft';
  return deletionModeForLocation(target.location);
}

const IRREPLACEABLE_MEDIA_KINDS: ReadonlySet<string> = new Set(['video', 'audio']);

/** The caller cannot downgrade media risk with a request field. */
export function deletionRiskForKind(kind: string): FilesDeletionRisk {
  return IRREPLACEABLE_MEDIA_KINDS.has(kind) ? 'irreplaceable-media' : 'replaceable';
}

/**
 * Build the copy and guard before presenting a delete action. The message keys
 * differ by recovery semantics; a non-recoverable refusal must never reuse the
 * Recycle Bin wording and imply a recovery path that does not exist.
 */
export function planFilesDeletion(target: FilesDeletionTarget): FilesDeletionPlan {
  const owner = ownerDeleteFor(target);
  const mode: FilesDeletionMode = owner ? 'owner' : deletionModeForTarget(target);
  const risk = deletionRiskForKind(target.kind);
  const messageKey = owner
    ? OWNER_CONFIRM_KEY[owner.owner]
    : mode === 'trash'
      ? risk === 'irreplaceable-media'
        ? 'filesApp.delete.confirmMediaTrash'
        : 'filesApp.delete.confirmTrash'
      : mode === 'soft'
        ? 'filesApp.delete.confirmSoft'
        : 'filesApp.delete.refuseComputed';

  return {
    itemId: target.id,
    mode,
    risk,
    messageKey,
    messageValues: { name: target.name, sizeBytes: target.sizeBytes },
    // The separate media guard protects bytes. Removing a reference is an
    // undoable index action and leaves those bytes untouched.
    requiresExplicitConfirmation: risk === 'irreplaceable-media' && mode === 'trash',
    ...(owner ? { owner: owner.owner } : {}),
  };
}

export interface FilesSoftDeleteReceipt {
  /** Opaque owner-issued token. Passing it back restores exactly this row. */
  undoToken: string;
  undoExpiresAt: number;
}

export type FilesDeletionResult =
  | { ok: true; itemId: string; mode: 'trash' }
  | ({ ok: true; itemId: string; mode: 'soft' | 'owner' } & FilesSoftDeleteReceipt)
  | {
      ok: false;
      itemId: string;
      reasonKey:
        | 'filesApp.delete.refuseComputed'
        | 'filesApp.delete.refuseNotTrashable'
        | 'filesApp.delete.invalidRequest'
        | 'filesApp.delete.notFound'
        | 'filesApp.delete.confirmationRequired'
        | 'filesApp.delete.confirmationMismatch'
        | 'filesApp.delete.failed';
      detail?: string;
    };

const FILES_DELETION_FAILURE_REASONS: ReadonlySet<
  Extract<FilesDeletionResult, { ok: false }>['reasonKey']
> = new Set([
  'filesApp.delete.refuseComputed',
  'filesApp.delete.refuseNotTrashable',
  'filesApp.delete.invalidRequest',
  'filesApp.delete.notFound',
  'filesApp.delete.confirmationRequired',
  'filesApp.delete.confirmationMismatch',
  'filesApp.delete.failed',
]);

/**
 * Validate the untrusted value returned across the preload boundary.
 *
 * TypeScript disappears at runtime and a stale preload can outlive a renderer
 * reload. A malformed success must not remove a row from the Files view or
 * offer an Undo token that cannot work, so the renderer accepts only the
 * complete versioned union it knows how to represent.
 */
export function isFilesDeletionResultForItem(
  value: unknown,
  expectedItemId: string,
): value is FilesDeletionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.itemId !== expectedItemId || typeof result.ok !== 'boolean') return false;

  if (result.ok) {
    if (result.mode === 'trash') return true;
    return (
      (result.mode === 'soft' || result.mode === 'owner') &&
      typeof result.undoToken === 'string' &&
      result.undoToken.length > 0 &&
      typeof result.undoExpiresAt === 'number' &&
      Number.isFinite(result.undoExpiresAt) &&
      result.undoExpiresAt >= 0
    );
  }

  return (
    typeof result.reasonKey === 'string' &&
    FILES_DELETION_FAILURE_REASONS.has(
      result.reasonKey as Extract<FilesDeletionResult, { ok: false }>['reasonKey'],
    ) &&
    (result.detail === undefined || typeof result.detail === 'string')
  );
}

export interface FilesDeletionDependencies {
  /** Main supplies Electron `shell.trashItem`; never `unlink` or `rm`. */
  trashFile(path: string): Promise<void>;
  /**
   * Hide one exact row and return its bounded undo token. For an `owner`
   * delete the same call also schedules the owner's real delete for when the
   * undo window has passed.
   */
  softDelete(
    target: FilesDeletionTarget,
    commit?: FilesOwnerDelete & { trashFile?: boolean },
  ): Promise<FilesSoftDeleteReceipt>;
}

export interface FilesDeletionAuthorization {
  /**
   * Exact item id the user confirmed. A boolean is intentionally insufficient:
   * selection can change while a confirmation dialog is open.
   */
  confirmedItemId?: string;
  /**
   * Linked media only: also send the user's own file to the Recycle Bin. Off
   * unless the user ticks it — removing a library link never touches the
   * bytes on its own.
   */
  trashFile?: boolean;
}

/** The complete renderer-to-main request. Paths and risk never cross IPC. */
export interface FilesDeleteRequest extends FilesDeletionAuthorization {
  itemId: string;
}

/**
 * Check the confirmation against the immutable plan before either process
 * performs a destructive operation. Main repeats this check after resolving
 * the item id from its own index; the renderer uses it to avoid presenting a
 * doomed request as progress.
 */
export function authorizeFilesDeletion(
  plan: FilesDeletionPlan,
  authorization: FilesDeletionAuthorization,
): Extract<FilesDeletionResult, { ok: false }> | null {
  if (!plan.requiresExplicitConfirmation) return null;
  if (!authorization.confirmedItemId) {
    return { ok: false, itemId: plan.itemId, reasonKey: 'filesApp.delete.confirmationRequired' };
  }
  if (authorization.confirmedItemId !== plan.itemId) {
    return { ok: false, itemId: plan.itemId, reasonKey: 'filesApp.delete.confirmationMismatch' };
  }
  return null;
}

/**
 * Execute one deletion plan against one exact target.
 *
 * Re-planning here is intentional. Callers may show a plan in the UI, but the
 * executor must not trust a stale client-provided mode or risk classification.
 */
export async function executeFilesDeletion(
  target: FilesDeletionTarget,
  authorization: FilesDeletionAuthorization,
  dependencies: FilesDeletionDependencies,
): Promise<FilesDeletionResult> {
  const plan = planFilesDeletion(target);

  if (plan.mode === 'none') {
    return { ok: false, itemId: target.id, reasonKey: 'filesApp.delete.refuseComputed' };
  }

  const refusal = authorizeFilesDeletion(plan, authorization);
  if (refusal) return refusal;

  try {
    if (plan.mode === 'trash') {
      const path = target.location.store === 'file' ? target.location.path : null;
      if (!path?.trim()) {
        return { ok: false, itemId: target.id, reasonKey: 'filesApp.delete.failed' };
      }
      await dependencies.trashFile(path);
      return { ok: true, itemId: target.id, mode: 'trash' };
    }

    if (plan.mode === 'owner') {
      const owner = ownerDeleteFor(target);
      if (!owner) return { ok: false, itemId: target.id, reasonKey: 'filesApp.delete.failed' };
      const receipt = await dependencies.softDelete(target, {
        ...owner,
        ...(owner.owner === 'media' && authorization.trashFile === true ? { trashFile: true } : {}),
      });
      return { ok: true, itemId: target.id, mode: 'owner', ...receipt };
    }

    const receipt = await dependencies.softDelete(target);
    return { ok: true, itemId: target.id, mode: 'soft', ...receipt };
  } catch (error) {
    return {
      ok: false,
      itemId: target.id,
      reasonKey: 'filesApp.delete.failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
