import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../../i18n';
import { Toggle } from '../../ui';

interface Status {
  enabled: boolean;
  hotkey: string;
  supported: boolean;
  registered: boolean;
}

const DEFAULT_STATUS: Status = { enabled: false, hotkey: 'Ctrl+Alt+J', supported: true, registered: false };

/** Build an accelerator chord ("Ctrl+Shift+D") from a captured keydown. */
function chordFromEvent(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  const key = e.key;
  if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return null;
  if (!mods.length) return null; // a global shortcut needs a modifier
  const main = key.length === 1 ? key.toUpperCase() : key;
  return [...mods, main].join('+');
}

/**
 * Study → Popup dictionary everywhere. Toggles the OS-wide global-hotkey lookup
 * (main/systemDictionary.ts) and lets the user rebind its accelerator.
 */
export default function SystemDictionarySection() {
  const { t } = useT();
  const [status, setStatus] = useState<Status>(DEFAULT_STATUS);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const capturingRef = useRef(false);
  capturingRef.current = capturing;

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
    setError('');
    const next = await window.api.sysDictSetEnabled(on);
    setStatus(next);
  }, []);

  // Capture the next key chord and register it as the new hotkey.
  useEffect(() => {
    if (!capturing) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }
      const chord = chordFromEvent(e);
      if (!chord) return;
      setCapturing(false);
      const res = await window.api.sysDictSetHotkey(chord);
      setStatus(res.status);
      setError(res.ok ? '' : res.error || '');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing]);

  return (
    <>
      <Toggle
        className="os-toggle os-toggle-compact"
        checked={status.enabled}
        onChange={(e) => void toggle(e.target.checked)}
        aria-label={t('settings.sysDict.enable')}
        label={status.enabled ? t('common.on') : t('common.off')}
      />

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span className="muted">{t('settings.sysDict.hotkeyLabel')}</span>
        <kbd className="sc-keys">{capturing ? t('settings.sysDict.capturing') : status.hotkey}</kbd>
        <button
          type="button"
          className="btn small"
          disabled={capturing}
          onClick={() => {
            setError('');
            setCapturing(true);
          }}
        >
          {t('settings.sysDict.change')}
        </button>
      </div>

      {error && <p className="dict-add-err">{error}</p>}

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
