import { useMemo, useState } from 'react';
import { filterMediaTrackingAvailabilityCalendar, projectMediaTrackingAvailabilityCalendar, type MediaTrackingAvailabilityFilter, type MediaTrackingCalendarRange } from '../../../shared/mediaTrackingCalendar';
import type { MediaTrackingDocument } from '../../../shared/mediaTracking';
import { loadMediaTrackingSourcesDocument } from '../../mediaTrackingSourcesStore';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useT } from '../../i18n';

export function MediaTrackingCalendar({ document, titleFor, now = new Date() }: { document: MediaTrackingDocument; titleFor?: (identityId: string) => string; now?: Date }) {
  const { t, lang } = useT();
  const [range, setRange] = useState<MediaTrackingCalendarRange>('week');
  const [availabilityFilter, setAvailabilityFilter] = useState<MediaTrackingAvailabilityFilter>('all');
  const [sources] = useState(loadMediaTrackingSourcesDocument);
  const entries = useMemo(() => filterMediaTrackingAvailabilityCalendar(projectMediaTrackingAvailabilityCalendar(document, sources, range, now), availabilityFilter), [document, sources, range, now, availabilityFilter]);
  return <section className="media-tracking-calendar" aria-label={t('mediaCalendar.head')}>
    <div className="media-tracking-shelf-head"><h2>{t('mediaCalendar.head')}</h2>
      <div className="media-tracking-calendar-controls">
        <label className="media-tracking-range">{t('mediaCalendar.range')} <select value={range} onChange={(event) => setRange(event.target.value as MediaTrackingCalendarRange)}>
        <option value="today">{t('mediaCalendar.range.today')}</option><option value="week">{t('mediaCalendar.range.week')}</option><option value="month">{t('mediaCalendar.range.month')}</option><option value="season">{t('mediaCalendar.range.season')}</option>
        </select></label>
        <label className="media-tracking-range">{t('mediaCalendar.availability')} <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as MediaTrackingAvailabilityFilter)}>
          <option value="all">{t('mediaCalendar.availability.all')}</option><option value="working">{t('mediaCalendar.availability.working')}</option><option value="new">{t('mediaCalendar.availability.new')}</option><option value="both">{t('mediaCalendar.availability.both')}</option>
        </select></label>
      </div>
    </div>
    {entries.length === 0 ? <p className="muted">{t('mediaCalendar.empty')}</p> : <ol className="media-tracking-calendar-list">
      {entries.map((entry) => <li key={entry.identityId}>
        <strong>{titleFor?.(entry.identityId) ?? entry.identityId}</strong>
        {/* `toLocaleString()` with no locale follows the OS, not the UI language,
            so this air date stayed English under a translated calendar. */}
        <span className="muted">{new Date(entry.nextAirDate).toLocaleString(LANG_TAGS[lang])} · {entry.daysFromNow === 0 ? t('mediaCalendar.today') : t('mediaCalendar.inDays', { count: entry.daysFromNow })}{entry.nextEpisodeNumber === null ? '' : ` · ${t('mediaCalendar.episode', { number: entry.nextEpisodeNumber })}`} · {t('mediaCalendar.workingCount', { count: entry.workingSourceCount ?? 0 })}{entry.newEpisodeSourceCount ? ` · ${t('mediaCalendar.newCount', { count: entry.newEpisodeSourceCount })}` : ''}</span>
      </li>)}
    </ol>}
  </section>;
}
