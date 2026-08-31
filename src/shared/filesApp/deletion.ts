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

export type FilesDeletionMode = 'trash' | 'soft' | 'none';
export type FilesDeletionRisk = 'replaceable' | 'irreplaceable-media';

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
}

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
  const mode = deletionModeForTarget(target);
  const risk = deletionRiskForKind(target.kind);
  const messageKey =
    mode === 'trash'
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
  };
}

export interface FilesSoftDeleteReceipt {
  /** Opaque owner-issued token. Passing it back restores exactly this row. */
  undoToken: string;
  undoExpiresAt: number;
}

export type FilesDeletionResult =
  | { ok: true; itemId: string; mode: 'trash' }
  | ({ ok: true; itemId: string; mode: 'soft' } & FilesSoftDeleteReceipt)
  | {
      ok: false;
      itemId: string;
      reasonKey:
        | 'filesApp.delete.refuseComputed'
        | 'filesApp.delete.confirmationRequired'
        | 'filesApp.delete.confirmationMismatch'
        | 'filesApp.delete.failed';
      detail?: string;
    };

export interface FilesDeletionDependencies {
  /** Main supplies Electron `shell.trashItem`; never `unlink` or `rm`. */
  trashFile(path: string): Promise<void>;
  /** The owning store marks one exact row and returns its bounded undo token. */
  softDelete(target: FilesDeletionTarget): Promise<FilesSoftDeleteReceipt>;
}

export interface FilesDeletionAuthorization {
  /**
   * Exact item id the user confirmed. A boolean is intentionally insufficient:
   * selection can change while a confirmation dialog is open.
   */
  confirmedItemId?: string;
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
