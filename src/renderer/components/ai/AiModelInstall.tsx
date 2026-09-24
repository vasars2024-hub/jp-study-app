import { useState } from 'react';
import { useT } from '../../i18n';
import { useAssetInstalled } from '../../assetStore';
import { ASSET_CATALOG, findAsset, formatBytes, isBusy } from '../../../shared/assetRegistry';
import { DEFAULT_LOCAL_MODEL_ASSET_ID } from '../../../shared/localAgentModels';
import './aiSetup.css';

/**
 * Install the offline AI model in place, with progress — the control six
 * messages used to promise ("install via Translate") and nothing provided.
 *
 * It drives the ordinary asset download manager, so the download is the same
 * one Settings > Storage lists, resumes the same way, and is checked against
 * the pinned sha256 before it is used. Reusable anywhere a surface needs the
 * model (the manga reader's translate error, the Translate view, AI Card
 * Studio): `<AiModelInstallControl />` and nothing else.
 */
export function AiModelInstallControl({ assetId = DEFAULT_LOCAL_MODEL_ASSET_ID }: { assetId?: string }) {
  const { t } = useT();
  const { status } = useAssetInstalled(assetId);
  const [error, setError] = useState<string | null>(null);
  const spec = findAsset(ASSET_CATALOG, assetId);
  if (!spec) return null;

  const state = status?.state ?? 'not-installed';
  const received = status?.receivedBytes ?? 0;
  const total = status?.totalBytes || spec.sizeBytes;
  const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;

  const start = async (): Promise<void> => {
    setError(null);
    const result = await window.api.assetsStart(assetId).catch(() => null);
    if (result && !result.ok && result.error) setError(t(result.error.key, result.error.vars));
  };

  let line: string;
  if (state === 'installed') line = t('settings.ai.model.installed', { size: formatBytes(total) });
  else if (state === 'downloading') line = t('settings.ai.model.downloading', { percent });
  else if (state === 'queued') line = t('storage.state.queued');
  else if (state === 'verifying') line = t('storage.state.verifying');
  else if (state === 'paused') line = t('settings.ai.model.paused', { percent });
  else if (state === 'failed') line = status?.error ? t(status.error.key, status.error.vars) : t('storage.state.failed');
  else line = t('settings.ai.model.notInstalled', { size: formatBytes(spec.sizeBytes) });

  return (
    <div className="ai-model-install" data-asset-id={assetId}>
      <div className="ai-model-install-row">
        {(state === 'not-installed' || state === 'failed') && (
          <button type="button" className="btn primary" onClick={() => void start()}>
            {state === 'failed' ? t('common.tryAgain') : t('settings.ai.model.install', { size: formatBytes(spec.sizeBytes) })}
          </button>
        )}
        {(state === 'downloading' || state === 'queued') && (
          <button type="button" className="btn" onClick={() => void window.api.assetsPause(assetId)}>
            {t('common.pause')}
          </button>
        )}
        {state === 'paused' && (
          <button type="button" className="btn" onClick={() => void start()}>
            {t('common.resume')}
          </button>
        )}
        {(isBusy(state) || state === 'paused') && state !== 'verifying' && (
          <button type="button" className="btn small" onClick={() => void window.api.assetsCancel(assetId)}>
            {t('common.cancel')}
          </button>
        )}
        <span
          className={`ai-model-install-status muted${state === 'failed' ? ' is-error' : ''}`}
          role="status"
        >
          {line}
        </span>
      </div>
      {(isBusy(state) || state === 'paused') && (
        <div className="asset-bar" aria-hidden="true">
          <div className="asset-bar-fill" style={{ width: `${percent}%` }} />
        </div>
      )}
      {error && <p className="ai-model-install-status is-error" role="alert">{error}</p>}
    </div>
  );
}

export default AiModelInstallControl;
