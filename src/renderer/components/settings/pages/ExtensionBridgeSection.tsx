import { useCallback, useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';

/** Settings → Study: Chrome extension install + pairing token only. */
export default function ExtensionBridgeSection() {
  const { t } = useT();
  const { focusSettingId } = useSettings();
  const [status, setStatus] = useState<{
    running: boolean;
    port: number;
    token: string;
    folderPath: string;
    extensionVersion: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    void window.api.extensionStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const regenerate = async () => {
    setStatus(await window.api.extensionRegenerateToken());
  };

  const copyToken = async () => {
    if (!status?.token) return;
    try {
      await navigator.clipboard.writeText(status.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <SettingsCard
      id="extension-bridge"
      title={t('settings.extension.title')}
      description={t('settings.extension.desc')}
      highlight={focusSettingId === 'extension-bridge'}
    >
      <p className="muted os-set-hint">
        {status?.running
          ? t('settings.extension.running', { port: status.port })
          : t('settings.extension.stopped')}
        {status?.extensionVersion
          ? ` · ${t('settings.extension.version', { version: status.extensionVersion })}`
          : ''}
      </p>
      <p className="muted os-set-hint" style={{ marginTop: 10 }}>
        {t('settings.extension.installLead')}
      </p>
      <ol className="anki-steps">
        <li>{t('settings.extension.installStep1')}</li>
        <li>{t('settings.extension.installStep2')}</li>
        <li>{t('settings.extension.installStep3')}</li>
      </ol>
      <label className="sp-field" style={{ display: 'block', marginTop: 8 }}>
        <span className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>
          {t('settings.extension.folder')}
        </span>
        <input
          className="gram-search"
          type="text"
          readOnly
          value={status?.folderPath ?? ''}
          aria-label={t('settings.extension.folder')}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
      </label>
      <div className="os-viz-row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn small primary" onClick={() => void window.api.extensionRevealFolder()}>
          {t('settings.extension.showFolder')}
        </button>
      </div>
      <p className="muted os-set-hint" style={{ marginTop: 10 }}>
        {t('settings.extension.installStep4')}
      </p>
      <label className="sp-field" style={{ display: 'block', marginTop: 8 }}>
        <span className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>
          {t('settings.extension.token')}
        </span>
        <input
          className="gram-search"
          type="text"
          readOnly
          value={status?.token ?? ''}
          aria-label={t('settings.extension.token')}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
      </label>
      <div className="os-viz-row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn small primary" onClick={() => void copyToken()}>
          {copied ? t('settings.extension.copied') : t('settings.extension.copy')}
        </button>
        <button type="button" className="btn small" onClick={() => void regenerate()}>
          {t('settings.extension.regenerate')}
        </button>
        <button type="button" className="btn small" onClick={refresh}>
          {t('settings.extension.refresh')}
        </button>
      </div>
      <p className="muted os-set-hint" style={{ marginTop: 12 }}>
        {t('settings.extension.capabilitiesLead')}
      </p>
      <ul className="anki-steps" style={{ listStyle: 'disc' }}>
        <li>{t('settings.extension.capabilityInbox')}</li>
        <li>{t('settings.extension.capabilityMine')}</li>
        <li>{t('settings.extension.capabilityYoutube')}</li>
      </ul>
    </SettingsCard>
  );
}
