import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import { Toggle } from '../../ui';
import GlobalChordRow from '../GlobalChordRow';

interface Status {
  enabled: boolean;
  hotkey: string;
  supported: boolean;
  registered: boolean;
}

const DEFAULT_STATUS: Status = { enabled: false, hotkey: 'Ctrl+Alt+J', supported: true, registered: false };

/**
 * Study → Popup dictionary everywhere. Toggles the OS-wide global-hotkey lookup
 * (main/systemDictionary.ts). The chords themselves are rebound in Settings →
 * Shortcuts, with every other system-wide command, so one list can catch two
 * features asking for the same key.
 */
export default function SystemDictionarySection() {
  const { t } = useT();
  const [status, setStatus] = useState<Status>(DEFAULT_STATUS);

  useEffect(() => {
    let alive = true;
    window.api
      .sysDictGetSettings()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => undefined);
    const off = window.api.onSysDictSettingsChanged((s) => setStatus(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const toggle = useCallback(async (on: boolean) => {
    const next = await window.api.sysDictSetEnabled(on);
    setStatus(next);
  }, []);

  return (
    <>
      <Toggle
        className="os-toggle os-toggle-compact"
        checked={status.enabled}
        onChange={(e) => void toggle(e.target.checked)}
        aria-label={t('settings.sysDict.enable')}
        label={status.enabled ? t('common.on') : t('common.off')}
      />

      <GlobalChordRow commandId="companion.lookupSelection" label={t('settings.sysDict.hotkeyLabel')} />
      <GlobalChordRow commandId="lens.atCursor" label={t('cmd.lens.atCursor')} />

      <p className="muted os-set-hint">{t('settings.sysDict.hint')}</p>
      {!status.supported && <p className="muted os-set-hint">{t('settings.sysDict.unsupported')}</p>}

      <div className="os-viz-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn small" onClick={() => void window.api.sysDictLookupClipboard()}>
          {t('settings.sysDict.testClipboard')}
        </button>
      </div>
    </>
  );
}
