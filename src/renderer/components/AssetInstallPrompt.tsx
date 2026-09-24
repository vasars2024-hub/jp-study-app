/**
 * The one "this feature needs a download" control: a button while the set is
 * missing, a progress bar with Cancel while it downloads, the reason when it
 * failed, and nothing once it is installed.
 *
 * Before this, each feature drew its own button and none of them followed the
 * download it started — Manga OCR's "Download (530 MB)" stayed a plain button
 * for the whole 530 MB, and the Reading Lens said "downloading" when nothing
 * was. Status comes from the download manager's own events, so what this shows
 * is what is actually happening.
 */
import { useState } from 'react';
import { formatBytes } from '../../shared/assetRegistry';
import { summarizeAssetBundle } from '../../shared/assetBundleProgress';
import { useAssetStatuses } from '../assetStore';
import { useT } from '../i18n';
import { Progress } from './ui/Progress';

interface Props {
  /** Every asset the feature needs; the prompt is gone when all are installed. */
  ids: readonly string[];
  /**
   * What the button starts, in order. Defaults to `ids`. Name the parent of a
   * `requires` group rather than each member: the manager queues companions
   * itself, and starting them one by one only adds racing requests.
   */
  startIds?: readonly string[];
  /** Short line above the button saying what the download is for. */
  message?: string;
  className?: string;
}

export default function AssetInstallPrompt({ ids, startIds, message, className = '' }: Props) {
  const { t } = useT();
  const statuses = useAssetStatuses(ids);
  const summary = summarizeAssetBundle(statuses);
  const [starting, setStarting] = useState(false);

  if (summary.state === 'installed') return null;

  const start = async () => {
    setStarting(true);
    try {
      // Sequential on purpose: two parallel starts that share a companion
      // (the web-OCR detector, say) both try to stage it.
      for (const id of startIds ?? ids) {
        const current = statuses[ids.indexOf(id)];
        if (current?.state === 'installed') continue;
        await window.api.assetsStart(id);
      }
    } finally {
      setStarting(false);
    }
  };

  const cancel = () => {
    for (const id of summary.busyIds) void window.api.assetsCancel(id);
  };

  const busy = summary.state === 'busy' || starting;
  const percent = summary.fraction == null ? null : Math.round(summary.fraction * 100);

  return (
    <div className={`asset-install-prompt ${className}`.trim()} data-asset-state={summary.state}>
      {message && <p className="muted asset-install-message">{message}</p>}
      {busy ? (
        <div className="asset-install-busy" role="status" aria-busy="true">
          <Progress value={summary.fraction ?? undefined} />
          <span className="muted">
            {percent != null && percent > 0
              ? t('assetInstall.progress', { percent })
              : t('assetInstall.waiting')}
          </span>
          {summary.busyIds.length > 0 && (
            <button type="button" className="btn small" onClick={cancel}>
              {t('common.cancel')}
            </button>
          )}
        </div>
      ) : (
        <>
          {summary.state === 'failed' && summary.error && (
            <p className="asset-install-error" role="alert">
              {t(summary.error.key, summary.error.vars)}
            </p>
          )}
          <button type="button" className="btn" onClick={() => void start()}>
            {summary.totalBytes > 0
              ? t('assetInstall.download', { size: formatBytes(summary.totalBytes) })
              : t('assetInstall.downloadPlain')}
          </button>
        </>
      )}
    </div>
  );
}
