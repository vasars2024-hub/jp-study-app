import { useEffect, useMemo, useRef, useState } from 'react';
import type { FilesDeletionPlan } from '../../../shared/filesApp/deletion';
import {
  deletionNoticeForResult,
  deletionNoticeForUndo,
  type FilesDeletionCatalogueItem,
  type FilesDeletionNotice,
  type FilesDeletionSession,
} from './filesDeletionSession';
import './FilesDeletionControls.css';

type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface FilesDeletionControlsProps {
  item: FilesDeletionCatalogueItem;
  session: FilesDeletionSession;
  t: Translate;
  /** Refreshes the derived index after delete and after a successful Undo. */
  onChanged(): void | Promise<void>;
  /**
   * Hand the receipt to an owner that outlives the selection.
   *
   * A successful delete removes the row, which clears the selection, which
   * unmounts this inspector — taking the receipt and its Undo button with it.
   * Rendered inline the Undo was therefore unreachable for exactly the deletes
   * that succeeded, which is the only case it exists for. Standalone mounts
   * (and this component's own suite) keep the inline rendering by omitting
   * this prop; `FilesApp` supplies it and renders `FilesDeletionReceipt` in
   * the status dock, which never unmounts.
   */
  onNotice?(notice: FilesDeletionNotice | null): void;
  /**
   * Bumped by another entry point to the same Delete (the row's context menu),
   * so it lands on this confirmation rather than acting on its own — one
   * confirm, one wording, whichever way the user got here.
   */
  confirmRequest?: number;
  /** Told once the request above has opened the confirmation, so it is not replayed. */
  onConfirmRequestHandled?(): void;
}

/**
 * The Files inspector's complete delete interaction.
 *
 * Confirmation is inline so its wording remains visible and localised. The
 * selected item id is captured when confirmation opens and is sent back as the
 * authorization, which prevents a changed selection from authorising another
 * row. Computed rows render their distinct refusal and never expose an action.
 */
export function FilesDeletionControls({
  item,
  session,
  t,
  onChanged,
  onNotice,
  confirmRequest = 0,
  onConfirmRequestHandled,
}: FilesDeletionControlsProps) {
  const plan = useMemo(() => session.plan(item), [item, session]);
  const [pending, setPending] = useState<FilesDeletionPlan | null>(null);
  /** Linked media only: also send the user's own file to the Recycle Bin. */
  const [trashFile, setTrashFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<FilesDeletionNotice | null>(null);
  const operationGeneration = useRef(0);
  // The owner is told regardless; only the RENDERING moves. Kept in a ref so
  // the publish helper is not re-created on every parent render.
  const noticeSink = useRef(onNotice);
  noticeSink.current = onNotice;

  const publishNotice = (next: FilesDeletionNotice | null): void => {
    if (noticeSink.current) noticeSink.current(next);
    else setInlineNotice(next);
  };

  // Selection can change while the inspector remains mounted. Never carry a
  // confirmation or an Undo receipt onto the newly selected row.
  useEffect(() => {
    operationGeneration.current += 1;
    setPending(null);
    setTrashFile(false);
    setInlineNotice(null);
    setBusy(false);
    // Deliberately does NOT clear a hoisted notice: the receipt for the row
    // that just left the list must outlive the selection change it caused.
  }, [item.id]);

  useEffect(() => {
    if (confirmRequest <= 0) return;
    if (plan.mode !== 'none') setPending(plan);
    onConfirmRequestHandled?.();
    // `plan` is read at the moment of the request; a later re-plan must not re-open it.
  }, [confirmRequest]);

  const confirmDelete = async () => {
    if (!pending || busy) return;
    const generation = operationGeneration.current;
    setBusy(true);
    const result = await session.delete(item, {
      confirmedItemId: pending.itemId,
      ...(pending.owner === 'media' && trashFile ? { trashFile: true } : {}),
    });
    // The receipt is published either way: a delayed reply must not be attached
    // to a row selected since, but a hoisted owner still needs to hear about it.
    if (generation !== operationGeneration.current) {
      if (noticeSink.current) noticeSink.current(deletionNoticeForResult(result, item.name));
      if (result.ok) await onChanged();
      return;
    }
    setBusy(false);
    setPending(null);
    publishNotice(deletionNoticeForResult(result, item.name));
    if (result.ok) await onChanged();
  };

  const undo = async () => {
    if (!inlineNotice?.undoToken || busy) return;
    const generation = operationGeneration.current;
    setBusy(true);
    const result = session.undo(inlineNotice.undoToken);
    if (generation !== operationGeneration.current) {
      if (result.ok) await onChanged();
      return;
    }
    setBusy(false);
    setInlineNotice(deletionNoticeForUndo(result));
    if (result.ok) await onChanged();
  };

  if (plan.mode === 'none') {
    return (
      <p className="fa-details-note fa-delete-refusal" role="status">
        {t(plan.messageKey, plan.messageValues)}
      </p>
    );
  }

  return (
    <div className="fa-delete-controls">
      {pending ? (
        <div
          className="fa-delete-confirm"
          role="alertdialog"
          aria-label={t('filesApp.delete.confirmAction')}
        >
          <p>{t(pending.messageKey, pending.messageValues)}</p>
          {pending.owner === 'media' ? (
            <label className="fa-delete-trash-file">
              <input
                type="checkbox"
                checked={trashFile}
                onChange={(e) => setTrashFile(e.target.checked)}
                disabled={busy}
              />
              <span>{t('filesApp.delete.alsoTrashFile')}</span>
            </label>
          ) : null}
          <div className="fa-delete-confirm-actions">
            <button
              type="button"
              className="fa-action fa-delete-confirm-yes"
              onClick={confirmDelete}
              disabled={busy}
            >
              {t('filesApp.delete.confirmAction')}
            </button>
            <button
              type="button"
              className="fa-action"
              onClick={() => setPending(null)}
              disabled={busy}
            >
              {t('filesApp.delete.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="fa-action fa-delete-action"
          onClick={() => setPending(plan)}
          disabled={busy}
        >
          {t('filesApp.delete.action')}
        </button>
      )}
      {inlineNotice ? (
        <div
          className={`fa-details-note fa-delete-notice is-${inlineNotice.tone}`}
          role="status"
        >
          <span>{t(inlineNotice.key, inlineNotice.values)}</span>
          {inlineNotice.undoToken ? (
            <button type="button" className="fa-action fa-delete-undo" onClick={undo} disabled={busy}>
              {t('filesApp.delete.undo')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface FilesDeletionReceiptProps {
  notice: FilesDeletionNotice | null;
  session: FilesDeletionSession;
  t: Translate;
  onChanged(): void | Promise<void>;
  onNotice(notice: FilesDeletionNotice | null): void;
}

/**
 * The delete receipt, rendered somewhere that outlives the deleted row.
 *
 * Undo is the reason this is a separate component rather than a line of text.
 * The row it would restore is by definition no longer in the list, so the
 * inspector that offered Delete is gone; the receipt has to live in a region
 * that does not depend on a selection. Dismiss is explicit — an Undo that
 * disappears on its own is one the user can miss entirely.
 */
export function FilesDeletionReceipt({
  notice,
  session,
  t,
  onChanged,
  onNotice,
}: FilesDeletionReceiptProps) {
  const [busy, setBusy] = useState(false);
  if (!notice) return null;

  const undo = async (): Promise<void> => {
    if (!notice.undoToken || busy) return;
    setBusy(true);
    const result = session.undo(notice.undoToken);
    setBusy(false);
    onNotice(deletionNoticeForUndo(result));
    if (result.ok) await onChanged();
  };

  return (
    <span className={`fa-delete-notice is-${notice.tone}`} role="status">
      <span>{t(notice.key, notice.values)}</span>
      {notice.undoToken ? (
        <button type="button" className="fa-action fa-delete-undo" onClick={undo} disabled={busy}>
          {t('filesApp.delete.undo')}
        </button>
      ) : null}
      <button
        type="button"
        className="fa-action fa-delete-dismiss"
        onClick={() => onNotice(null)}
        aria-label={t('filesApp.delete.dismiss')}
      >
        {t('filesApp.delete.dismiss')}
      </button>
    </span>
  );
}
