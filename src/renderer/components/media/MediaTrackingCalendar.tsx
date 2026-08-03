import { useMemo, useState } from 'react';
import { filterMediaTrackingAvailabilityCalendar, projectMediaTrackingAvailabilityCalendar, type MediaTrackingAvailabilityFilter, type MediaTrackingCalendarRange } from '../../../shared/mediaTrackingCalendar';
import type { MediaTrackingDocument } from '../../../shared/mediaTracking';
import { loadMediaTrackingSourcesDocument } from '../../mediaTrackingSourcesStore';

export function MediaTrackingCalendar({ document, titleFor, now = new Date() }: { document: MediaTrackingDocument; titleFor?: (identityId: string) => string; now?: Date }) {
  const [range, setRange] = useState<MediaTrackingCalendarRange>('week');
  const [availabilityFilter, setAvailabilityFilter] = useState<MediaTrackingAvailabilityFilter>('all');
  const [sources] = useState(loadMediaTrackingSourcesDocument);
  const entries = useMemo(() => filterMediaTrackingAvailabilityCalendar(projectMediaTrackingAvailabilityCalendar(document, sources, range, now), availabilityFilter), [document, sources, range, now, availabilityFilter]);
  return <section className="media-tracking-calendar" aria-label="Upcoming releases">
    <div className="media-tracking-shelf-head"><h2>Upcoming releases</h2>
      <div className="media-tracking-calendar-controls">
        <label className="media-tracking-range">Range <select value={range} onChange={(event) => setRange(event.target.value as MediaTrackingCalendarRange)}>
        <option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="season">Current season</option>
        </select></label>
        <label className="media-tracking-range">Availability <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as MediaTrackingAvailabilityFilter)}>
          <option value="all">All releases</option><option value="working">Working sources</option><option value="new">New episode signals</option><option value="both">Working and new</option>
        </select></label>
      </div>
    </div>
    {entries.length === 0 ? <p className="muted">No tracked releases in this range.</p> : <ol className="media-tracking-calendar-list">
      {entries.map((entry) => <li key={entry.identityId}>
        <strong>{titleFor?.(entry.identityId) ?? entry.identityId}</strong>
        <span className="muted">{new Date(entry.nextAirDate).toLocaleString()} · {entry.daysFromNow === 0 ? 'Today' : `in ${entry.daysFromNow} days`}{entry.nextEpisodeNumber === null ? '' : ` · Episode ${entry.nextEpisodeNumber}`} · {entry.workingSourceCount} working sources{entry.newEpisodeSourceCount ? ` · ${entry.newEpisodeSourceCount} new` : ''}</span>
      </li>)}
    </ol>}
  </section>;
}
