import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import type { ReadingLensStatus } from '../../../../main/readingLens';

const DEFAULT_STATUS: ReadingLensStatus = {
  enabled: false,
  hotkey: 'Ctrl+Shift+Space',
  supported: true,
  registered: false,
  open: false,
};

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
 * Study → Reading Lens. Toggles the OS-wide screen-region OCR reader
 * (main/readingLens.ts), lets the user rebind its accelerator, and opens it on
 * demand. Mirrors SystemDictionarySection; the two are independent features.
 */
export default function ReadingLensSection() {
  const { t } = useT();
  const [status, setStatus] = useState<ReadingLensStatus>(DEFAULT_STATUS);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    window.api
      .lensGetSettings()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => undefined);
    const off = window.api.onLensSettingsChanged((s) => setStatus(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  // A hotkey that reports enabled-but-not-registered was rejected by the OS
  // (another app holds it) — surface that so the user knows to rebind.
  useEffect(() => {
    if (status.enabled && status.supported && !status.registered) setError(t('settings.lens.busy'));
    else setError('');
  }, [status.enabled, status.supported, status.registered, t]);

  const toggle = useCallback(async (on: boolean) => {
    const next = await window.api.lensSetEnabled(on);
    setStatus(next);
  }, []);

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
      const res = await window.api.lensSetHotkey(chord);
      setStatus(res.status);
      if (!res.ok) setError(res.error || t('settings.lens.busy'));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, t]);

  return (
    <>
      <label className="os-toggle os-toggle-compact">
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={(e) => void toggle(e.target.checked)}
          aria-label={t('settings.lens.enable')}
        />
        <span>{status.enabled ? t('common.on') : t('common.off')}</span>
      </label>

      <div className="os-viz-row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span className="muted">{t('settings.lens.hotkeyLabel')}</span>
        <kbd className="sc-keys">{capturing ? t('settings.lens.capturing') : status.hotkey}</kbd>
        <button
          type="button"
          className="btn small"
          disabled={capturing}
          onClick={() => {
            setError('');
            setCapturing(true);
          }}
        >
          {t('settings.lens.change')}
        </button>
      </div>

      {error && <p className="dict-add-err">{error}</p>}

      <p className="muted os-set-hint">{t('settings.lens.hint')}</p>
      {!status.supported && <p className="muted os-set-hint">{t('settings.lens.unsupported')}</p>}

      <div className="os-viz-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn small"
          disabled={!status.enabled}
          onClick={() => void window.api.lensOpen('select')}
        >
          {t('settings.lens.openNow')}
        </button>
      </div>
    </>
  );
}
