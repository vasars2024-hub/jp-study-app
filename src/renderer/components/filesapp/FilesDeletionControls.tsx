import { useEffect, useMemo, useState } from 'react';
import type { FilesDeletionPlan } from '../../../shared/filesApp/deletion';
import {
  deletionNoticeForResult,
  deletionNoticeForUndo,
  type FilesDeletionCatalogueItem,
  type FilesDeletionNotice,
  type FilesDeletionSession,
} from './filesDeletionSession';

type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface FilesDeletionControlsProps {
  item: FilesDeletionCatalogueItem;
  session: FilesDeletionSession;
  t: Translate;
  /** Refreshes the derived index after delete and after a successful Undo. */
  onChanged(): void | Promise<void>;
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
}: FilesDeletionControlsProps) {
  const plan = useMemo(() => session.plan(item), [item, session]);
  const [pending, setPending] = useState<FilesDeletionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<FilesDeletionNotice | null>(null);

  // Selection can change while the inspector remains mounted. Never carry a
  // confirmation or an Undo receipt onto the newly selected row.
  useEffect(() => {
    setPending(null);
    setNotice(null);
    setBusy(false);
  }, [item.id]);

  const confirmDelete = async () => {
    if (!pending || busy) return;
    setBusy(true);
    const result = await session.delete(item, { confirmedItemId: pending.itemId });
    setBusy(false);
    setPending(null);
    setNotice(deletionNoticeForResult(result, item.name));
    if (result.ok) await onChanged();
  };

  const undo = async () => {
    if (!notice?.undoToken || busy) return;
    setBusy(true);
    const result = session.undo(notice.undoToken);
    setBusy(false);
    setNotice(deletionNoticeForUndo(result));
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
      {notice ? (
        <div
          className={`fa-details-note fa-delete-notice is-${notice.tone}`}
          role="status"
        >
          <span>{t(notice.key, notice.values)}</span>
          {notice.undoToken ? (
            <button type="button" className="fa-action fa-delete-undo" onClick={undo} disabled={busy}>
              {t('filesApp.delete.undo')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

