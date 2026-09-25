// Column definitions for the episode table.
//
// Widths are grid track sizes, not pixels-per-cell: the table is a CSS grid so
// the header and every virtualized row share one track list and cannot drift
// out of alignment while scrolling.

import type { ScraperColumnId } from '../../../../shared/scraperShell';
import type { EpisodeRow } from '../../../../shared/scraperResults';
import { episodeKindText, episodeStatusText, tr } from '../localize';

export interface ScraperColumn {
  id: ScraperColumnId;
  /**
   * i18n key of the header, resolved with `columnLabel()` at render — never text:
   * this table is module-level, so text stored here would be frozen in whatever
   * language was active when the module loaded (it was English, always).
   * '' for the header-less select column; '#' is not a word and needs no key.
   */
  labelKey: string;
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
  { id: 'select', labelKey: '', track: '34px', align: 'center', sortable: false, locked: true },
  { id: 'index', labelKey: '#', track: '52px', align: 'end', sortable: true, locked: true, sortValue: (r) => r.number },
  { id: 'title', labelKey: 'scrApp.r2.col.title', track: 'minmax(220px, 2.2fr)', sortable: true, locked: true, sortValue: (r) => r.titleEn },
  { id: 'type', labelKey: 'scrApp.r2.col.type', track: '96px', sortable: true, sortValue: (r) => r.kind },
  { id: 'language', labelKey: 'scrApp.r2.col.language', track: '96px', sortable: true, sortValue: (r) => r.audio },
  { id: 'subtitles', labelKey: 'scrApp.r2.col.subtitles', track: '104px', sortable: true, sortValue: (r) => r.subtitles.map((s) => s.language).join(',') },
  { id: 'resolution', labelKey: 'scrApp.r2.col.resolution', track: '104px', sortable: true, sortValue: (r) => r.resolution },
  { id: 'source', labelKey: 'scrApp.r2.col.source', track: 'minmax(90px, 0.7fr)', sortable: true, sortValue: (r) => r.sourceLabel },
  { id: 'size', labelKey: 'scrApp.r2.col.size', track: '96px', align: 'end', sortable: true, sortValue: (r) => r.sizeBytes },
  { id: 'duration', labelKey: 'scrApp.r2.col.duration', track: '92px', align: 'end', sortable: true, sortValue: (r) => r.durationSec },
  { id: 'season', labelKey: 'scrApp.r2.col.season', track: '80px', align: 'end', sortable: true, sortValue: (r) => r.season },
  { id: 'airDate', labelKey: 'scrApp.r2.col.airDate', track: '104px', sortable: true, sortValue: (r) => r.airDate ?? '' },
  { id: 'status', labelKey: 'scrApp.r2.col.status', track: '96px', sortable: true, sortValue: (r) => r.status },
  { id: 'link', labelKey: 'scrApp.r2.col.link', track: '58px', align: 'center', sortable: false, locked: true },
];

/** A column's header text in the current UI language. */
export function columnLabel(column: Pick<ScraperColumn, 'labelKey'>): string {
  if (!column.labelKey || column.labelKey === '#') return column.labelKey;
  return tr(column.labelKey);
}

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

/** `labelKey` is resolved with `tr()` at render, same contract as `labelKey` above. */
export const GROUP_OPTIONS: { value: GroupKey; labelKey: string }[] = [
  { value: '', labelKey: 'scrApp.r2.group.none' },
  { value: 'season', labelKey: 'scrApp.r2.col.season' },
  { value: 'type', labelKey: 'scrApp.r2.col.type' },
  { value: 'source', labelKey: 'scrApp.r2.col.source' },
  { value: 'resolution', labelKey: 'scrApp.r2.col.resolution' },
  { value: 'status', labelKey: 'scrApp.r2.col.status' },
];

export function groupLabelFor(row: EpisodeRow, key: GroupKey): string {
  switch (key) {
    case 'season':
      return tr('scrApp.r2.group.seasonN', { n: row.season });
    case 'type':
      return episodeKindText(row.kind);
    case 'source':
      return row.sourceLabel;
    case 'resolution':
      return row.resolution;
    case 'status':
      return episodeStatusText(row.status);
    default:
      return '';
  }
}
