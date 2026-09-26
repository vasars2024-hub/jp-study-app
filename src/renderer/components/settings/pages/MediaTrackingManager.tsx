import { useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { useWatchTitles } from '../../../useWatchTitles';
import { migrateLegacyWatchStores, readWatchLegacyMark } from '../../../watchLegacyMigration';
import { WATCH_STATUSES, watchStatusLabelKey } from '../../../../shared/watchLibrary';
import { LANG_TAGS } from '../../../../shared/i18n/core';

/**
 * Tracking — what the watch library holds, by status. The list itself is edited
 * where it is shown (Gum, the tracking dashboard); this card only says where it
 * lives and whether the older tracking list has been folded in.
 *
 * It used to be a raw editor over `jp-media-tracking-v1`, a second list nothing
 * else showed. That list is now read into the watch library (never deleted).
 */
export default function MediaTrackingManager() {
  const { t, lang } = useT();
  const { titles, ready } = useWatchTitles();
  const [mark, setMark] = useState(readWatchLegacyMark);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const title of titles) out.set(title.status, (out.get(title.status) ?? 0) + 1);
    return out;
  }, [titles]);

  const migrateNow = async () => {
    setBusy(true);
    const sent = await migrateLegacyWatchStores();
    setMark(readWatchLegacyMark());
    setMessage(t('media.tracking.migrated', { count: sent }));
    setBusy(false);
  };

  return (
    <SettingsCard id="media-tracking-manager" title={t('media.tracking.settingsTitle')} description={t('media.tracking.settingsDesc')}>
      <p role="status" className="muted">
        {ready ? t('media.tracking.entryCount', { count: titles.length }) : t('media.tracking.loading')}
      </p>
      {ready && titles.length > 0 && (
        <ul className="muted">
          {WATCH_STATUSES.filter((status) => counts.get(status)).map((status) => (
            <li key={status}>{t(watchStatusLabelKey(status))}: {(counts.get(status) ?? 0).toLocaleString(LANG_TAGS[lang])}</li>
          ))}
        </ul>
      )}
      <div className="field-row">
        <span className="muted">
          {mark.at
            ? t('media.tracking.legacyMigratedAt', { when: new Date(mark.at).toLocaleString(LANG_TAGS[lang]) })
            : t('media.tracking.legacyNotYet')}
        </span>
        <button className="btn" type="button" disabled={busy} onClick={() => void migrateNow()}>{t('media.tracking.legacyMigrate')}</button>
      </div>
      {message && <p role="status" className="muted">{message}</p>}
    </SettingsCard>
  );
}
