import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';

type Lifecycle = { keepRunningInTray: boolean; startAtLogin: boolean; startMinimized: boolean; loginItemSupported: boolean };

/**
 * Startup & tray: whether closing Gum's window quits or keeps it running in the
 * notification area (so the Reading Lens and companion hotkeys and calendar
 * reminders keep working), and whether Windows starts Gum at sign-in. Both off
 * by default; main owns the state (`main/appLifecycle.ts`).
 */
export default function AppLifecycleCard() {
  const { t } = useT();
  const { focusSettingId } = useSettings();
  const [state, setState] = useState<Lifecycle | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.api.appGetLifecycle?.().then((s) => {
      if (alive) setState(s);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!window.api.appSetLifecycle) return null;

  const update = async (patch: Partial<Omit<Lifecycle, 'loginItemSupported'>>): Promise<void> => {
    setBusy(true);
    try {
      const next = await window.api.appSetLifecycle?.(patch);
      if (next) setState(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard
      id="startup-tray"
      title={t('polish.lifecycle.title')}
      description={t('polish.lifecycle.desc')}
      highlight={focusSettingId === 'startup-tray'}
    >
      <label className="pl-field">
        <input
          type="checkbox"
          disabled={!state || busy}
          checked={state?.keepRunningInTray ?? false}
          onChange={(e) => void update({ keepRunningInTray: e.target.checked })}
        />
        <span>{t('polish.lifecycle.keepRunning')}</span>
      </label>
      <p className="muted">{t('polish.lifecycle.keepRunningHint')}</p>
      {state?.loginItemSupported !== false && (
        <>
          <label className="pl-field">
            <input
              type="checkbox"
              disabled={!state || busy}
              checked={state?.startAtLogin ?? false}
              onChange={(e) => void update({ startAtLogin: e.target.checked })}
            />
            <span>{t('polish.lifecycle.startAtLogin')}</span>
          </label>
          {state?.startAtLogin && state.keepRunningInTray && (
            <label className="pl-field">
              <input
                type="checkbox"
                disabled={busy}
                checked={state.startMinimized}
                onChange={(e) => void update({ startMinimized: e.target.checked })}
              />
              <span>{t('polish.lifecycle.startMinimized')}</span>
            </label>
          )}
        </>
      )}
    </SettingsCard>
  );
}
