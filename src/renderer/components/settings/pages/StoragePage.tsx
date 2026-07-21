import { useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useAssets, type AssetView } from '../../../assetStore';
import { formatBytes, isBusy, type AssetKind } from '../../../../shared/assetRegistry';
import { useT } from '../../../i18n';
import type { TVars } from '../../../../shared/i18n/core';

// The one place that lists every downloadable model and dictionary, with its
// size, version and a delete button. Download buttons also appear inline on the
// pages that need each asset — this page is the inventory view.

/** Two OCR kinds share one group — users think "OCR", not "tessdata vs onnx". */
const KIND_GROUP_KEY: Record<AssetKind, string> = {
  dictionary: 'storage.group.dictionary',
  whisper: 'storage.group.whisper',
  ocr: 'storage.group.ocr',
  tessdata: 'storage.group.ocr',
  examples: 'storage.group.examples',
  accent: 'storage.group.accent',
  sentences: 'storage.group.sentences',
  llm: 'storage.group.llm',
};

const GROUP_ORDER = [
  'storage.group.dictionary',
  // Transcription (Whisper) models are managed on the Transcription settings
  // page, where they download on first use and stay in sync with the player's
  // model dropdown. The ggml entries in the catalog are reserved for a future
  // whisper.cpp path and nothing loads them yet, so they're intentionally not
  // surfaced here — listing them was the "downloads don't match the dropdown"
  // confusion.
  'storage.group.ocr',
  'storage.group.accent',
  'storage.group.examples',
  'storage.group.sentences',
  'storage.group.llm',
];

function progressPercent(view: AssetView): number {
  const { receivedBytes, totalBytes } = view.status;
  if (!totalBytes) return 0;
  return Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
}

function statusLine(view: AssetView, t: (key: string, vars?: TVars) => string): string {
  const { status, spec } = view;
  switch (status.state) {
    case 'installed':
      return `${t('storage.state.installed')} · ${formatBytes(
        status.totalBytes || spec.sizeBytes,
      )} · v${status.installedVersion ?? spec.version}`;
    case 'downloading': {
      const speed = status.bytesPerSecond ? ` · ${formatBytes(status.bytesPerSecond)}/s` : '';
      return `${t('storage.state.progress', {
        received: formatBytes(status.receivedBytes),
        total: formatBytes(status.totalBytes),
      })}${speed}`;
    }
    case 'queued':
      return t('storage.state.queued');
    case 'verifying':
      return t('storage.state.verifying');
    case 'paused':
      return status.receivedBytes > 0
        ? t('storage.state.pausedAt', {
            received: formatBytes(status.receivedBytes),
            total: formatBytes(status.totalBytes),
          })
        : t('storage.state.paused');
    case 'failed':
      // Main sends {key, vars}, never a composed sentence — it doesn't know
      // which language is active. Only the renderer resolves it, at read time.
      return status.error ? t(status.error.key, status.error.vars) : t('storage.state.failed');
    default:
      return t('storage.state.available', { size: formatBytes(spec.sizeBytes) });
  }
}

export default function StoragePage() {
  const { focusSettingId } = useSettings();
  const { views, loading, freeSpace, start, pause, cancel, remove } = useAssets();
  const { t } = useT();
  const [notice, setNotice] = useState<string | null>(null);

  const groups = useMemo(() => {
    // Companion graphs (decoder/vocab) are pulled automatically when the parent
    // is downloaded — keep the inventory list to the top-level rows.
    const companionIds = new Set(
      views.flatMap((v) => v.spec.requires ?? []),
    );
    const byGroup = new Map<string, AssetView[]>();
    for (const view of views) {
      if (companionIds.has(view.spec.id)) continue;
      const key = KIND_GROUP_KEY[view.spec.kind];
      const list = byGroup.get(key) ?? [];
      list.push(view);
      byGroup.set(key, list);
    }
    return GROUP_ORDER.filter((key) => byGroup.has(key)).map((key) => ({
      key,
      views: byGroup.get(key) ?? [],
    }));
  }, [views]);

  const installedBytes = views
    .filter((v) => v.status.state === 'installed')
    .reduce((sum, v) => sum + (v.status.totalBytes || v.spec.sizeBytes), 0);

  async function onStart(id: string) {
    setNotice(null);
    const result = await start(id);
    // The pre-flight failure is the one the user most needs spelled out — it is
    // the difference between "this app is broken" and "I need to free 4 GB".
    if (!result.ok && result.error) setNotice(t(result.error.key, result.error.vars));
  }

  async function onRemove(id: string, name: string) {
    setNotice(null);
    const result = await remove(id);
    if (!result.ok && result.error) setNotice(t(result.error.key, result.error.vars));
    else setNotice(t('storage.removed', { name }));
  }

  return (
    <>
      <SettingsCard
        id="storage-models"
        title={t('storage.title')}
        description={t('storage.desc')}
        highlight={focusSettingId === 'storage-models'}
      >
        <div className="sp-row">
          <span className="muted">
            {t('storage.installedSize', { size: formatBytes(installedBytes) })}
            {freeSpace !== null && Number.isFinite(freeSpace)
              ? ` · ${t('storage.freeSpace', { size: formatBytes(freeSpace) })}`
              : ''}
          </span>
        </div>
        {notice && (
          <div className="asset-notice" role="status">
            {notice}
          </div>
        )}
        {loading && <div className="muted">{t('storage.reading')}</div>}
      </SettingsCard>

      {groups.map((group) => (
        <SettingsCard key={group.key} id={`storage-${group.key}`} title={t(group.key)}>
          <div className="asset-list">
            {group.views.map((view) => {
              const { spec, status } = view;
              const busy = isBusy(status.state);
              const showBar = busy || status.state === 'paused';
              return (
                <div key={spec.id} className="asset-row">
                  <div className="asset-main">
                    <div className="asset-name">
                      {spec.name}
                      {spec.lang !== 'any' && (
                        <span className="asset-tag">{spec.lang === 'ja' ? 'JA' : 'ZH'}</span>
                      )}
                    </div>
                    <div className="asset-desc">{spec.description}</div>
                    <div
                      className={`asset-status ${status.state === 'failed' ? 'is-error' : ''}`}
                    >
                      {statusLine(view, t)}
                    </div>
                    {showBar && (
                      <div className="asset-bar">
                        <div
                          className="asset-bar-fill"
                          style={{ width: `${progressPercent(view)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="asset-actions">
                    {status.state === 'not-installed' && (
                      <button type="button" className="btn" onClick={() => onStart(spec.id)}>
                        {t('common.downloadSize', { size: formatBytes(spec.sizeBytes) })}
                      </button>
                    )}
                    {status.state === 'failed' && (
                      <button type="button" className="btn" onClick={() => onStart(spec.id)}>
                        {t('common.tryAgain')}
                      </button>
                    )}
                    {(status.state === 'downloading' || status.state === 'queued') && (
                      <button type="button" className="btn" onClick={() => pause(spec.id)}>
                        {t('common.pause')}
                      </button>
                    )}
                    {status.state === 'paused' && (
                      <button type="button" className="btn" onClick={() => onStart(spec.id)}>
                        {t('common.resume')}
                      </button>
                    )}
                    {(busy || status.state === 'paused') && status.state !== 'verifying' && (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => cancel(spec.id)}
                      >
                        {t('common.cancel')}
                      </button>
                    )}
                    {status.state === 'installed' && (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => onRemove(spec.id, spec.name)}
                      >
                        {t('common.remove')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>
      ))}
    </>
  );
}
