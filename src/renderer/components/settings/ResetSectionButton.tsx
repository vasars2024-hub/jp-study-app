/**
 * The one "reset this section to defaults" control (set2).
 *
 * Five Settings pages had one, and they disagreed: Display and Monitors asked
 * first, Desktop layout, File drops and Motion reset on the first click with no
 * way back. A reset that throws away a page of choices is the same decision on
 * every page, so it is one component: it always confirms (as a danger action,
 * naming the section), and it records the card under "Recently changed" so the
 * user can find their way back to what they just cleared.
 *
 * set8: and it can be taken back. `onReset` returns how to undo itself — the
 * page snapshots what it is about to clear — and the button raises a toast with
 * an Undo action that runs it. A confirm guards against the wrong click; the
 * Undo covers the click the user confirmed and regretted a second later, which
 * is the one a confirm cannot.
 */
import { confirmDialog } from '../ui';
import { useT } from '../../i18n';
import { showOsToast } from '../ToastHost';
import { pushRecentChange } from './settingsRecent';

/**
 * Puts the section back as it was. It may be asynchronous (a reset that lives
 * in the main process), and it may report that it could not (`false`, or a
 * rejection), which the toast then says instead of claiming success.
 */
export type SectionUndo = () => void | boolean | Promise<void | boolean>;

/** What `onReset` may return: how to undo it, or nothing for a reset with no way back. */
export type SectionResetResult = SectionUndo | void;

/**
 * The Undo toast every reversible settings action raises (set8): a toast whose
 * action runs `undo` once, then says whether it worked. A toast can be clicked
 * twice before it leaves; a second restore of the same snapshot is harmless but
 * would announce itself twice, so the action runs at most once. Shared with the
 * settings import (WP3), which is the same "you can take that back" moment.
 */
export function offerUndoToast(opts: {
  message: string;
  undoLabel: string;
  undoneMessage: string;
  undoFailedMessage: string;
  undo: SectionUndo;
  /** Runs after a successful undo, before the confirmation toast. */
  onRestored?: () => void;
}): void {
  let used = false;
  showOsToast(opts.message, 'ok', {
    label: opts.undoLabel,
    run: () => {
      if (used) return;
      used = true;
      void (async () => {
        let restored = true;
        try {
          restored = (await opts.undo()) !== false;
        } catch {
          restored = false;
        }
        if (restored) opts.onRestored?.();
        showOsToast(
          restored ? opts.undoneMessage : opts.undoFailedMessage,
          restored ? 'ok' : 'err',
        );
      })();
    },
  });
}

export default function ResetSectionButton({
  settingId,
  section,
  label,
  onReset,
  dialogTitle,
  dialogMessage,
  className = 'btn',
}: {
  /** The card's SettingsCard id — recorded as recently changed. */
  settingId: string;
  /** The section's name, as the card title shows it. */
  section: string;
  /** The button's own text (each page keeps its existing label). */
  label: string;
  /** Resets the section and returns how to undo it. */
  onReset: () => SectionResetResult | Promise<SectionResetResult>;
  /** Override the shared dialog copy where a page already has its own. */
  dialogTitle?: string;
  dialogMessage?: string;
  className?: string;
}) {
  const { t } = useT();
  const undoToast = (undo: SectionUndo): void =>
    offerUndoToast({
      message: t('set8.reset.done', { section }),
      undoLabel: t('set8.reset.undo'),
      undoneMessage: t('set8.reset.undone', { section }),
      undoFailedMessage: t('set8.reset.undoFailed', { section }),
      undo,
      onRestored: () => pushRecentChange(settingId),
    });
  return (
    <button
      type="button"
      className={className}
      data-reset-section={settingId}
      onClick={async () => {
        const ok = await confirmDialog({
          title: dialogTitle ?? t('set2.reset.dialogTitle', { section }),
          message: dialogMessage ?? t('set8.reset.dialogMessage'),
          confirmLabel: t('common.reset'),
          danger: true,
        });
        if (!ok) return;
        const undo = await onReset();
        pushRecentChange(settingId);
        if (typeof undo === 'function') undoToast(undo);
      }}
    >
      {label}
    </button>
  );
}
