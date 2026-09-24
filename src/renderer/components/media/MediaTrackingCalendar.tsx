import { useMemo, useState } from 'react';
import { projectWatchAiringCalendar, type MediaTrackingCalendarRange, type WatchAiringTitle } from '../../../shared/mediaTrackingCalendar';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useT } from '../../i18n';

/**
 * Upcoming episodes of the titles in the watch library, from the airing
 * schedule the main process keeps current (AniList). Nothing is entered here.
 */
export function MediaTrackingCalendar({ titles, now }: { titles: readonly WatchAiringTitle[]; now?: Date }) {
  const { t, lang } = useT();
  const [range, setRange] = useState<MediaTrackingCalendarRange>('week');
  const entries = useMemo(
    () => projectWatchAiringCalendar(titles, range, now ?? new Date()),
    [titles, range, now],
  );
  return <section className="media-tracking-calendar" aria-label={t('mediaCalendar.head')}>
    <div className="media-tracking-shelf-head"><h2>{t('mediaCalendar.head')}</h2>
      <div className="media-tracking-calendar-controls">
        <label className="media-tracking-range">{t('mediaCalendar.range')} <select value={range} onChange={(event) => setRange(event.target.value as MediaTrackingCalendarRange)}>
          <option value="today">{t('mediaCalendar.range.today')}</option><option value="week">{t('mediaCalendar.range.week')}</option><option value="month">{t('mediaCalendar.range.month')}</option><option value="season">{t('mediaCalendar.range.season')}</option>
        </select></label>
      </div>
    </div>
    {entries.length === 0 ? <p className="muted">{t('mediaCalendar.empty')}</p> : <ol className="media-tracking-calendar-list">
      {entries.map((entry) => <li key={entry.titleId}>
        <strong>{entry.title}</strong>
        {/* Always the UI locale: a bare toLocaleString() follows the OS. */}
        <span className="muted">
          {new Date(entry.at).toLocaleString(LANG_TAGS[lang], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {' · '}
          {entry.daysFromNow === 0 ? t('mediaCalendar.today') : t('mediaCalendar.inDays', { count: entry.daysFromNow })}
          {' · '}
          {t('mediaCalendar.episode', { number: entry.episode })}
        </span>
      </li>)}
    </ol>}
  </section>;
}
