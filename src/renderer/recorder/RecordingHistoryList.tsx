/**
 * The Region Recorder's history: every finished recording, across restarts
 * (`recordings-history.json`, kept by main). Shown in Settings → Screen
 * recorder and in Blanc's recorder tool.
 *
 * Per recording: Open (the study player, else the system player), Show in
 * folder, Transcribe again, and Delete — which asks first, and sends the file
 * to the Recycle Bin rather than unlinking it, then drops it from the library.
 *
 * Also the two window-recording starters ("the active window", "choose a
 * window"), which both surfaces offer beside the region buttons.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import {
  formatRecorderClock,
  type RecorderHistoryEntry,
  type RecorderWindowSource,
} from '../../shared/regionRecorder';
import './recorderHistory.css';

type HistoryRow = RecorderHistoryEntry & { missing?: boolean };

/** `btn small` in Settings, `blanc-btn` in Blanc. */
export type RecorderUiVariant = 'settings' | 'blanc';

const btnClass = (variant: RecorderUiVariant, primary = false): string =>
  variant === 'blanc' ? `blanc-btn${primary ? ' blanc-btn--primary' : ''}` : `btn small${primary ? ' primary' : ''}`;

function useRecorderHistory(): [HistoryRow[] | null, () => void] {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const reload = useCallback(() => {
    if (typeof window.api?.recorderHistory !== 'function') {
      setRows([]);
      return;
    }
    void window.api.recorderHistory().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => {
    reload();
    if (typeof window.api?.onRecorderHistoryChanged !== 'function') return undefined;
    // Re-read rather than take the pushed list: only a read says which files are missing.
    return window.api.onRecorderHistoryChanged(() => reload());
  }, [reload]);
  return [rows, reload];
}

function formatSize(bytes: number, lang: string): string {
  const mb = bytes / (1024 * 1024);
  return new Intl.NumberFormat(lang, { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb);
}

function HistoryRowView({ row, variant, onChanged }: { row: HistoryRow; variant: RecorderUiVariant; onChanged: () => void }) {
  const { t, lang } = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const when = useMemo(
    () => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.createdAt)),
    [row.createdAt, lang],
  );
  const act = (action: 'open' | 'show' | 'transcribe' | 'delete'): void => {
    setBusy(true);
    setError('');
    void window.api.recorderHistoryAction(row.id, action)
      .then(async (result) => {
        if (!result.ok) {
          setError(t(result.errorKey || 'rec2.history.error.failed'));
          return;
        }
        if (action === 'delete') {
          setConfirming(false);
          if (result.mediaId && typeof window.api.removeMedia === 'function') {
            await window.api.removeMedia(result.mediaId).catch(() => undefined);
          }
          onChanged();
        }
      })
      .catch(() => setError(t('rec2.history.error.failed')))
      .finally(() => setBusy(false));
  };
  const transcript = row.transcript === 'waiting-model' || row.transcript === 'model-missing'
    ? t('rec2.history.transcript.waiting')
    : row.transcript === 'done' ? t('rec2.history.transcript.done')
      : row.transcript === 'failed' ? t('rec2.history.transcript.failed')
        : row.transcript === 'queued' || row.transcript === 'running' ? t('rec2.history.transcript.running')
          : row.transcript === 'no-audio' ? t('recorder.job.noAudio') : '';

  return (
    <li className="rr-history-row" data-testid="rr-history-row">
      <div className="rr-history-main">
        <span className="rr-history-title" title={row.outputPath}>{row.title}</span>
        <span className="muted rr-history-meta">
          {t('rec2.history.meta', { when, duration: formatRecorderClock(row.durationMs), size: formatSize(row.bytes, lang) })}
          {row.source === 'window' ? ` · ${t('rec2.source.window')}` : ''}
          {transcript ? ` · ${transcript}` : ''}
        </span>
        {row.missing && <span className="rr-history-warn">{t('rec2.history.missing')}</span>}
        {error && <span className="rr-history-warn" role="alert">{error}</span>}
      </div>
      {confirming ? (
        <div className="rr-history-actions" role="group" aria-label={t('rec2.history.confirmLabel', { title: row.title })}>
          <span>{t('rec2.history.confirm')}</span>
          <button type="button" className={btnClass(variant, true)} disabled={busy} onClick={() => act('delete')}>
            {t('rec2.history.confirmDelete')}
          </button>
          <button type="button" className={btnClass(variant)} disabled={busy} onClick={() => setConfirming(false)}>
            {t('rec2.history.cancel')}
          </button>
        </div>
      ) : (
        <div className="rr-history-actions">
          <button type="button" className={btnClass(variant, true)} disabled={busy || row.missing} onClick={() => act('open')}>
            {t('recorder.job.open')}
          </button>
          <button type="button" className={btnClass(variant)} disabled={busy} onClick={() => act('show')}>
            {t('recorder.job.show')}
          </button>
          <button
            type="button"
            className={btnClass(variant)}
            disabled={busy || row.missing || !row.mediaId || !row.hasAudio}
            onClick={() => act('transcribe')}
          >
            {t('rec2.history.retranscribe')}
          </button>
          <button
            type="button"
            className={btnClass(variant)}
            disabled={busy}
            aria-label={t('rec2.history.deleteLabel', { title: row.title })}
            onClick={() => setConfirming(true)}
          >
            {t('rec2.history.delete')}
          </button>
        </div>
      )}
    </li>
  );
}

export function RecordingHistoryList({ variant, limit = 50 }: { variant: RecorderUiVariant; limit?: number }) {
  const { t } = useT();
  const [rows, reload] = useRecorderHistory();
  const [showAll, setShowAll] = useState(false);
  if (rows === null) return null;
  if (!rows.length) return <p className="muted">{t('rec2.history.empty')}</p>;
  const shown = showAll ? rows : rows.slice(0, limit);
  return (
    <div className="rr-history">
      <ul className="rr-history-list" aria-label={t('rec2.history.title')}>
        {shown.map((row) => <HistoryRowView key={row.id} row={row} variant={variant} onChanged={reload} />)}
      </ul>
      {rows.length > shown.length && (
        <button type="button" className={btnClass(variant)} onClick={() => setShowAll(true)}>
          {t('rec2.history.showAll', { count: rows.length })}
        </button>
      )}
    </div>
  );
}

/** "Record the active window" and a picker over every window that can be recorded. */
export function RecorderWindowStarter({ variant, disabled }: { variant: RecorderUiVariant; disabled: boolean }) {
  const { t } = useT();
  const [windows, setWindows] = useState<RecorderWindowSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const list = (): void => {
    if (typeof window.api?.recorderListWindows !== 'function') return;
    setLoading(true);
    void window.api.recorderListWindows()
      .then(setWindows)
      .catch(() => setWindows([]))
      .finally(() => setLoading(false));
  };
  return (
    <div className="rr-window-starter">
      <div className="rr-history-actions">
        <button type="button" className={btnClass(variant)} disabled={disabled} onClick={() => void window.api.recorderStart('window')}>
          {t('rec2.window.active')}
        </button>
        <button
          type="button"
          className={btnClass(variant)}
          disabled={disabled || loading}
          aria-expanded={windows !== null}
          onClick={() => (windows === null ? list() : setWindows(null))}
        >
          {windows === null ? t('rec2.window.choose') : t('rec2.window.hide')}
        </button>
      </div>
      {windows !== null && (
        windows.length ? (
          <ul className="rr-window-list" aria-label={t('rec2.window.listLabel')}>
            {windows.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="rr-window-pick"
                  disabled={disabled}
                  title={w.name}
                  onClick={() => {
                    setWindows(null);
                    void window.api.recorderStart('window', w.id);
                  }}
                >
                  {w.thumbnail ? <img src={w.thumbnail} alt="" width={120} height={68} /> : <span className="rr-window-thumb" aria-hidden="true" />}
                  <span className="rr-window-name">{w.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('rec2.window.none')}</p>
      )}
      <p className="muted">{t('rec2.window.hint')}</p>
    </div>
  );
}
