import type { MediaTrackingDocument, MediaTrackingRecord } from './mediaTracking';
import type { MediaTrackingSourcesDocument } from './mediaTrackingSources';

export type MediaTrackingCalendarRange = 'today' | 'week' | 'month' | 'season';
export type MediaTrackingAvailabilityFilter = 'all' | 'working' | 'new' | 'both';

export interface MediaTrackingCalendarEntry {
  identityId: string;
  status: MediaTrackingRecord['schedule']['status'];
  nextEpisodeNumber: number | null;
  nextAirDate: string;
  daysFromNow: number;
  workingSourceCount?: number;
  newEpisodeSourceCount?: number;
}

export function filterMediaTrackingAvailabilityCalendar(
  entries: MediaTrackingCalendarEntry[],
  filter: MediaTrackingAvailabilityFilter = 'all',
): MediaTrackingCalendarEntry[] {
  if (filter === 'working') return entries.filter((entry) => (entry.workingSourceCount ?? 0) > 0);
  if (filter === 'new') return entries.filter((entry) => (entry.newEpisodeSourceCount ?? 0) > 0);
  if (filter === 'both') return entries.filter((entry) => (entry.workingSourceCount ?? 0) > 0 && (entry.newEpisodeSourceCount ?? 0) > 0);
  return entries;
}

/** Adds deterministic local source availability to scheduled release entries. */
export function projectMediaTrackingAvailabilityCalendar(document: MediaTrackingDocument, sources: MediaTrackingSourcesDocument, range: MediaTrackingCalendarRange = 'week', now = new Date()): MediaTrackingCalendarEntry[] {
  const rows = new Map<string, typeof sources.rows>();
  sources.rows.forEach((row) => { const current = rows.get(row.identityId) ?? []; current.push(row); rows.set(row.identityId, current); });
  return projectMediaTrackingCalendar(document, range, now).map((entry) => { const assigned = rows.get(entry.identityId) ?? []; return { ...entry, workingSourceCount: assigned.filter((row) => row.enabled && row.status === 'working').length, newEpisodeSourceCount: assigned.filter((row) => row.enabled && row.newEpisodeDetected).length }; });
}

function startOfDay(value: Date): number {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

export function calendarRangeEnd(range: MediaTrackingCalendarRange, now: Date): Date {
  const end = new Date(now);
  if (range === 'today') return new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  if (range === 'week') end.setDate(end.getDate() + 7);
  else if (range === 'month') end.setMonth(end.getMonth() + 1);
  else end.setMonth(end.getMonth() + 3);
  return end;
}

export function projectMediaTrackingCalendar(
  document: MediaTrackingDocument,
  range: MediaTrackingCalendarRange = 'week',
  now = new Date(),
): MediaTrackingCalendarEntry[] {
  const from = startOfDay(now);
  const to = calendarRangeEnd(range, now).getTime();
  return document.records
    .filter((record) => record.schedule.nextAirDate)
    .map((record) => ({ record, date: new Date(record.schedule.nextAirDate as string) }))
    .filter(({ date }) => !Number.isNaN(date.getTime()) && date.getTime() >= from && date.getTime() <= to)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.record.identityId.localeCompare(b.record.identityId))
    .map(({ record, date }) => ({
      identityId: record.identityId,
      status: record.schedule.status,
      nextEpisodeNumber: record.schedule.nextEpisodeNumber,
      nextAirDate: date.toISOString(),
      daysFromNow: Math.max(0, Math.ceil((startOfDay(date) - from) / 86_400_000)),
    }));
}
