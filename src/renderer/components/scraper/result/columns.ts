// Column definitions for the episode table.
//
// Widths are grid track sizes, not pixels-per-cell: the table is a CSS grid so
// the header and every virtualized row share one track list and cannot drift
// out of alignment while scrolling.

import type { ScraperColumnId } from '../../../../shared/scraperShell';
import type { EpisodeRow } from '../../../../shared/scraperResults';

export interface ScraperColumn {
  id: ScraperColumnId;
  label: string;
  /** CSS grid track, e.g. '1fr' or '80px'. */
  track: string;
  align?: 'start' | 'center' | 'end';
  sortable: boolean;
  /** Locked columns cannot be hidden — without them a row is unreadable. */
  locked?: boolean;
  /** Sort key. Absent for columns that carry no ordering. */
  sortValue?: (row: EpisodeRow) => string | number;
}

export const SCRAPER_COLUMNS: ScraperColumn[] = [
  { id: 'select', label: '', track: '34px', align: 'center', sortable: false, locked: true },
  { id: 'index', label: '#', track: '52px', align: 'end', sortable: true, locked: true, sortValue: (r) => r.number },
  { id: 'title', label: 'Title', track: 'minmax(220px, 2.2fr)', sortable: true, locked: true, sortValue: (r) => r.titleEn },
  { id: 'type', label: 'Type', track: '96px', sortable: true, sortValue: (r) => r.kind },
  { id: 'language', label: 'Language', track: '96px', sortable: true, sortValue: (r) => r.audio },
  { id: 'subtitles', label: 'Subs', track: '104px', sortable: true, sortValue: (r) => r.subtitles.map((s) => s.language).join(',') },
  { id: 'resolution', label: 'Resolution', track: '104px', sortable: true, sortValue: (r) => r.resolution },
  { id: 'source', label: 'Source', track: 'minmax(90px, 0.7fr)', sortable: true, sortValue: (r) => r.sourceLabel },
  { id: 'size', label: 'Size', track: '96px', align: 'end', sortable: true, sortValue: (r) => r.sizeBytes },
  { id: 'duration', label: 'Duration', track: '92px', align: 'end', sortable: true, sortValue: (r) => r.durationSec },
  { id: 'season', label: 'Season', track: '80px', align: 'end', sortable: true, sortValue: (r) => r.season },
  { id: 'airDate', label: 'Aired', track: '104px', sortable: true, sortValue: (r) => r.airDate ?? '' },
  { id: 'status', label: 'Status', track: '96px', sortable: true, sortValue: (r) => r.status },
  { id: 'link', label: 'Link', track: '58px', align: 'center', sortable: false, locked: true },
];

export function columnById(id: ScraperColumnId): ScraperColumn | undefined {
  return SCRAPER_COLUMNS.find((c) => c.id === id);
}

/** Visible columns in the user's saved order, with locked ones guaranteed. */
export function resolveColumns(
  visible: ScraperColumnId[],
  order: ScraperColumnId[],
): ScraperColumn[] {
  const wanted = new Set<ScraperColumnId>(visible);
  for (const column of SCRAPER_COLUMNS) if (column.locked) wanted.add(column.id);
  return order
    .map((id) => columnById(id))
    .filter((column): column is ScraperColumn => column !== undefined && wanted.has(column.id));
}

/** Grid track list for the header and every row. */
export function gridTemplate(columns: ScraperColumn[]): string {
  return columns.map((c) => c.track).join(' ');
}

/** Fields a free-text filter searches. */
export function rowMatches(row: EpisodeRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.titleEn.toLowerCase().includes(q)
    || row.titleJa.includes(query.trim())
    || row.numberLabel.includes(query.trim())
    || String(row.number) === q
    || row.sourceLabel.toLowerCase().includes(q)
    || row.resolution.toLowerCase().includes(q)
    || row.kind.toLowerCase().includes(q)
  );
}

export function sortRows(
  rows: EpisodeRow[],
  columnId: ScraperColumnId,
  dir: 'asc' | 'desc',
): EpisodeRow[] {
  const sortValue = columnById(columnId)?.sortValue;
  if (!sortValue) return rows;
  const factor = dir === 'asc' ? 1 : -1;
  // Copy first: sorting the caller's array in place would reorder the fixture
  // set for every other screen reading it.
  return [...rows].sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor;
  });
}

export type GroupKey = '' | 'season' | 'type' | 'source' | 'resolution' | 'status';

export const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: '', label: 'No grouping' },
  { value: 'season', label: 'Season' },
  { value: 'type', label: 'Type' },
  { value: 'source', label: 'Source' },
  { value: 'resolution', label: 'Resolution' },
  { value: 'status', label: 'Status' },
];

export function groupLabelFor(row: EpisodeRow, key: GroupKey): string {
  switch (key) {
    case 'season':
      return `Season ${row.season}`;
    case 'type':
      return row.kind;
    case 'source':
      return row.sourceLabel;
    case 'resolution':
      return row.resolution;
    case 'status':
      return row.status;
    default:
      return '';
  }
}
