/**
 * The one "reset this section to defaults" control (set2).
 *
 * Five Settings pages had one, and they disagreed: Display and Monitors asked
 * first, Desktop layout, File drops and Motion reset on the first click with no
 * way back. A reset that throws away a page of choices is the same decision on
 * every page, so it is one component: it always confirms (as a danger action,
 * naming the section), and it records the card under "Recently changed" so the
 * user can find their way back to what they just cleared.
 */
import { confirmDialog } from '../ui';
import { useT } from '../../i18n';
import { pushRecentChange } from './settingsRecent';

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
  onReset: () => void;
  /** Override the shared dialog copy where a page already has its own. */
  dialogTitle?: string;
  dialogMessage?: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      className={className}
      data-reset-section={settingId}
      onClick={async () => {
        const ok = await confirmDialog({
          title: dialogTitle ?? t('set2.reset.dialogTitle', { section }),
          message: dialogMessage ?? t('set2.reset.dialogMessage'),
          confirmLabel: t('common.reset'),
          danger: true,
        });
        if (!ok) return;
        onReset();
        pushRecentChange(settingId);
      }}
    >
      {label}
    </button>
  );
}
