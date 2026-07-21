import { useEffect, useRef, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { WHISPER_MODEL_SPECS, type WhisperModelTier } from '../../../../shared/whisperModels';
import { formatBytes } from '../../../../shared/assetRegistry';
import {
  isDownloadedIn,
  loadDownloaded,
  onDownloadedChanged,
  prefetchWhisperModel,
  removeWhisperModel,
  type PrefetchHandle,
} from '../../../whisperModelCache';

export default function TranscriptionPage() {
  const { t } = useT();
  const {
    whisperDevice,
    chooseWhisperDevice,
    whisperModelTier,
    chooseWhisperModelTier,
    focusSettingId,
  } = useSettings();

  const [downloaded, setDownloaded] = useState(loadDownloaded);
  // Percent (0..100) for a tier currently downloading; absent when idle.
  const [progress, setProgress] = useState<Partial<Record<WhisperModelTier, number>>>({});
  const [errors, setErrors] = useState<Partial<Record<WhisperModelTier, string>>>({});
  const handlesRef = useRef<Partial<Record<WhisperModelTier, PrefetchHandle>>>({});

  useEffect(() => onDownloadedChanged(setDownloaded), []);
  // Abort any in-flight download if the user leaves the page.
  useEffect(() => () => Object.values(handlesRef.current).forEach((h) => h?.cancel()), []);

  const startDownload = (tier: WhisperModelTier): void => {
    setErrors((e) => ({ ...e, [tier]: undefined }));
    setProgress((p) => ({ ...p, [tier]: 0 }));
    const handle = prefetchWhisperModel(tier, whisperDevice, (pct) =>
      setProgress((p) => ({ ...p, [tier]: pct })),
    );
    handlesRef.current[tier] = handle;
    handle.done
      .catch((err: unknown) =>
        setErrors((e) => ({
          ...e,
          [tier]: err instanceof Error ? err.message : String(err),
        })),
      )
      .finally(() => {
        delete handlesRef.current[tier];
        setProgress((p) => {
          const next = { ...p };
          delete next[tier];
          return next;
        });
      });
  };

  const cancelDownload = (tier: WhisperModelTier): void => {
    handlesRef.current[tier]?.cancel();
    delete handlesRef.current[tier];
    setProgress((p) => {
      const next = { ...p };
      delete next[tier];
      return next;
    });
  };

  return (
    <>
      <SettingsCard
        id="whisper"
        title={t('search.whisper')}
        description={t('search.whisper.desc')}
        highlight={focusSettingId === 'whisper'}
      >
        <div className="sp-seg" role="group" aria-label={t('search.whisper')}>
          <button
            type="button"
            className={`sp-seg-btn ${whisperDevice === 'auto' ? 'active' : ''}`}
            onClick={() => chooseWhisperDevice('auto')}
            title={t('settings.transcription.gpuTitle')}
          >
            GPU
          </button>
          <button
            type="button"
            className={`sp-seg-btn ${whisperDevice === 'cpu' ? 'active' : ''}`}
            onClick={() => chooseWhisperDevice('cpu')}
            title={t('settings.transcription.cpuTitle')}
          >
            CPU
          </button>
        </div>
        <label className="sp-field" style={{ display: 'block', marginTop: 12 }}>
          <span className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>
            {t('media.model.ariaLabel')}
          </span>
          <select
            className="media-model-select"
            value={whisperModelTier}
            aria-label={t('media.model.ariaLabel')}
            onChange={(e) => chooseWhisperModelTier(e.target.value as WhisperModelTier)}
          >
            {WHISPER_MODEL_SPECS.map((s) => (
              <option key={s.id} value={s.id}>
                {t(`media.model.${s.id}`)}
                {isDownloadedIn(downloaded, s.id, whisperDevice) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </label>
      </SettingsCard>

      <SettingsCard
        id="whisper-models"
        title={t('storage.group.whisper')}
        description={t('settings.transcription.modelsDesc')}
      >
        <div className="asset-list">
          {WHISPER_MODEL_SPECS.map((spec) => {
            const isDownloaded = isDownloadedIn(downloaded, spec.id, whisperDevice);
            const pct = progress[spec.id];
            const busy = pct !== undefined;
            const err = errors[spec.id];
            return (
              <div key={spec.id} className="asset-row">
                <div className="asset-main">
                  <div className="asset-name">
                    {t(`media.model.${spec.id}`)}
                    {spec.langs.includes('ja') && !spec.langs.includes('any') && (
                      <span className="asset-tag">JA</span>
                    )}
                  </div>
                  <div className={`asset-status ${err ? 'is-error' : ''}`}>
                    {err
                      ? t('settings.transcription.downloadFailed', { detail: err })
                      : busy
                        ? t('settings.transcription.downloadingPct', { percent: pct ?? 0 })
                        : isDownloaded
                          ? `${t('storage.state.installed')} · ${formatBytes(spec.sizeBytes)}`
                          : `${t('settings.transcription.notDownloaded')} · ${formatBytes(spec.sizeBytes)}`}
                  </div>
                  {busy && (
                    <div className="asset-bar">
                      <div className="asset-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <div className="asset-actions">
                  {busy ? (
                    <button type="button" className="btn small" onClick={() => cancelDownload(spec.id)}>
                      {t('common.cancel')}
                    </button>
                  ) : isDownloaded ? (
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => void removeWhisperModel(spec.id)}
                    >
                      {t('common.remove')}
                    </button>
                  ) : (
                    <button type="button" className="btn" onClick={() => startDownload(spec.id)}>
                      {err
                        ? t('common.tryAgain')
                        : t('common.downloadSize', { size: formatBytes(spec.sizeBytes) })}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SettingsCard>
    </>
  );
}
