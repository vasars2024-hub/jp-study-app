import { useCallback, useEffect, useState } from 'react';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useT } from '../../i18n';

type Status = Awaited<ReturnType<Window['api']['watchAiringStatus']>>;

/**
 * One line under the dashboard head: where the airing times come from, when
 * they were last checked, and a way to check now. Replaces the hand-edited
 * "source monitoring" form, whose numbers nothing ever measured.
 */
export function WatchAiringStatus() {
  const { t, lang } = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.api?.watchAiringStatus?.().then((value) => { if (alive) setStatus(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setStatus(await window.api.watchAiringRefresh());
    } catch {
      /* the status line keeps the previous answer */
    } finally {
      setBusy(false);
    }
  }, []);

  if (!window.api?.watchAiringStatus) return null;
  const when = status?.lastCheckedAt
    ? new Date(status.lastCheckedAt).toLocaleString(LANG_TAGS[lang], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div className="media-tracking-airing-status field-row">
      <span className="muted" role="status">
        {busy || status?.running
          ? t('watchAiring.checking')
          : when
            ? t('watchAiring.checkedAt', { when, count: status?.scheduled ?? 0 })
            : t('watchAiring.never')}
        {status?.lastError ? ` · ${t(`watchAiring.error.${status.lastError}`)}` : ''}
      </span>
      <button type="button" className="btn" disabled={busy || status?.running} onClick={() => void refresh()}>
        {t('watchAiring.checkNow')}
      </button>
    </div>
  );
}
