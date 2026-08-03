import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import ShortcutSettings from '../../ShortcutSettings';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import {
  GLOBAL_LOOKUP_TRIGGERS,
  isModifierTrigger,
  loadGlobalLookupSettings,
  onGlobalLookupChanged,
  saveGlobalLookupSettings,
  type GlobalLookupSettings,
} from '../../../globalLookupSettings';
import {
  collectOsHotkeyBindings,
  effectiveKeys,
  onShortcutsChanged,
  setOsHotkeyInstalledCache,
} from '../../../keyboardShortcuts';

type OsHotkeyStatus = {
  supported: boolean;
  installed: boolean;
  running: boolean;
  hotkey: string;
  restartHotkey?: string;
  openCount: number;
};

export default function ShortcutsPage() {
  const { t } = useT();
  const { focusSettingId } = useSettings();
  const [lookup, setLookup] = useState<GlobalLookupSettings>(loadGlobalLookupSettings);
  const [osHotkey, setOsHotkey] = useState<OsHotkeyStatus | null>(null);
  const [osBusy, setOsBusy] = useState(false);
  const [osError, setOsError] = useState('');

  // The toggle shortcut can flip this while the page is open.
  useEffect(() => onGlobalLookupChanged(setLookup), []);

  useEffect(() => {
    let alive = true;
    void window.api.osHotkeyStatus?.().then((s) => {
      if (alive) {
        setOsHotkey(s);
        setOsHotkeyInstalledCache(Boolean(s?.installed));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Rebinds in ShortcutSettings sync the helper; refresh the status line.
  useEffect(() => {
    return onShortcutsChanged(() => {
      void window.api.osHotkeyStatus?.().then((s) => {
        setOsHotkey(s);
        setOsHotkeyInstalledCache(Boolean(s?.installed));
      });
    });
  }, []);

  const update = (next: Partial<GlobalLookupSettings>) => setLookup(saveGlobalLookupSettings(next));

  const installOsHelper = async () => {
    setOsBusy(true);
    setOsError('');
    try {
      const bindings = collectOsHotkeyBindings();
      // Release Electron's RegisterHotKey first so the Startup helper can own them.
      await window.api.appSetToggleShortcut('');
      await window.api.appSetRestartShortcut?.('');
      const res = await window.api.osHotkeyInstall(bindings);
      setOsHotkey(res.status);
      setOsHotkeyInstalledCache(Boolean(res.status?.installed && res.ok));
      if (!res.ok) {
        setOsError(res.error || t('settings.osHotkey.failed'));
        // Fall back to in-process global shortcuts if the helper failed.
        await window.api.appSetToggleShortcut(bindings.toggle);
        await window.api.appSetRestartShortcut?.(bindings.restart);
      } else {
        // Keep Electron unregistered for these chords while the helper owns them.
        await window.api.appSetToggleShortcut(bindings.toggle);
        await window.api.appSetRestartShortcut?.(bindings.restart);
      }
    } catch (err) {
      setOsError(err instanceof Error ? err.message : t('settings.osHotkey.failed'));
    } finally {
      setOsBusy(false);
    }
  };

  const uninstallOsHelper = async () => {
    setOsBusy(true);
    setOsError('');
    try {
      const res = await window.api.osHotkeyUninstall();
      setOsHotkey(res.status);
      setOsHotkeyInstalledCache(false);
      const toggle = effectiveKeys('app.toggle') || 'Ctrl+Alt+Shift+G';
      const restart = effectiveKeys('app.restart') || 'Ctrl+Alt+Shift+R';
      // Reclaim in-process global shortcuts now that the helper is gone.
      await window.api.appSetToggleShortcut(toggle);
      await window.api.appSetRestartShortcut?.(restart);
    } catch (err) {
      setOsError(err instanceof Error ? err.message : t('settings.osHotkey.failed'));
    } finally {
      setOsBusy(false);
    }
  };

  return (
    <>
      <SettingsCard
        id="os-hotkey"
        title={t('settings.osHotkey.title')}
        description={t('settings.osHotkey.desc')}
        highlight={focusSettingId === 'os-hotkey'}
      >
        {osHotkey && !osHotkey.supported ? (
          <p className="muted os-set-hint">{t('settings.osHotkey.windowsOnly')}</p>
        ) : (
          <>
            <p className="muted os-set-hint">
              {osHotkey?.installed
                ? t('settings.osHotkey.statusOn', {
                    hotkey: osHotkey.hotkey,
                    state: osHotkey.running
                      ? t('settings.osHotkey.running')
                      : t('settings.osHotkey.stopped'),
                    openCount: osHotkey.openCount ?? 0,
                    restart: osHotkey.restartHotkey || t('settings.osHotkey.restartNone'),
                  })
                : t('settings.osHotkey.statusOff')}
            </p>
            <div className="os-set-row" style={{ gap: 8, display: 'flex', flexWrap: 'wrap' }}>
              {!osHotkey?.installed ? (
                <button type="button" className="btn primary" disabled={osBusy} onClick={() => void installOsHelper()}>
                  {osBusy ? t('common.loading') : t('settings.osHotkey.install')}
                </button>
              ) : (
                <button type="button" className="btn" disabled={osBusy} onClick={() => void uninstallOsHelper()}>
                  {osBusy ? t('common.loading') : t('settings.osHotkey.uninstall')}
                </button>
              )}
            </div>
            {osError ? (
              <p className="muted" style={{ color: 'var(--danger, #c44)' }}>
                {osError}
              </p>
            ) : null}
          </>
        )}
      </SettingsCard>

      <SettingsCard
        id="global-lookup"
        title={t('settings.dict.globalLookup')}
        description={t('settings.dict.globalLookupHint')}
        highlight={focusSettingId === 'global-lookup'}
      >
        <label className="pl-field">
          <span className="muted">{t('settings.dict.globalLookup')}</span>
          <select
            className="set-select"
            value={lookup.trigger}
            onChange={(e) => update({ trigger: e.target.value as GlobalLookupSettings['trigger'] })}
          >
            {GLOBAL_LOOKUP_TRIGGERS.map((trigger) => (
              <option key={trigger} value={trigger}>
                {t(`settings.dict.trigger.${trigger}`)}
              </option>
            ))}
          </select>
        </label>
        {lookup.trigger === 'click' && (
          <p className="muted">{t('settings.dict.trigger.clickHint')}</p>
        )}
        {isModifierTrigger(lookup.trigger) && (
          <>
            <label className="pl-field">
              <input
                type="checkbox"
                checked={lookup.inReaders}
                onChange={(e) => update({ inReaders: e.target.checked })}
              />
              <span>{t('settings.dict.inReaders')}</span>
            </label>
            <p className="muted">{t('settings.dict.inReadersHint')}</p>
          </>
        )}
      </SettingsCard>

      <SettingsCard
        id="shortcuts"
        title={t('search.shortcuts')}
        description={t('search.shortcuts.desc')}
        highlight={focusSettingId === 'shortcuts'}
      >
        <div className="os-set-shortcuts-embed">
          <ShortcutSettings embedded />
        </div>
      </SettingsCard>
    </>
  );
}
