import type { EpisodeRow } from '../../../../shared/scraperResults';
import type {
  ScraperExportFormat,
  ScraperExportSettings,
} from '../../../../shared/scraperOutputSettings';

export interface EpisodeExportOutput {
  content: string;
  extension: string;
  mimeType: string;
}

/**
 * The column vocabulary `export.includeColumns` is written in, in its default
 * order. The Columns field's hint names this list, so it cannot drift from what
 * the builder below understands.
 */
export const SCRAPER_EXPORT_COLUMNS = [
  'index',
  'title',
  'type',
  'language',
  'resolution',
  'source',
  'size',
  'season',
  'duration',
  'airDate',
  'status',
  'url',
] as const;

export type ScraperExportColumn = (typeof SCRAPER_EXPORT_COLUMNS)[number];

type Cell = string | number | string[] | null;

/** The record fields each column contributes, in order. */
const COLUMN_FIELDS: Record<ScraperExportColumn, (row: EpisodeRow) => [string, Cell][]> = {
  index: (row) => [['number', row.number], ['numberLabel', row.numberLabel]],
  title: (row) => [['titleEn', row.titleEn], ['titleJa', row.titleJa]],
  type: (row) => [['kind', row.kind]],
  language: (row) => [['audio', row.audio]],
  resolution: (row) => [['resolution', row.resolution]],
  source: (row) => [['source', row.sourceLabel]],
  size: (row) => [['sizeBytes', row.sizeBytes]],
  season: (row) => [['season', row.season]],
  duration: (row) => [['durationSec', row.durationSec]],
  airDate: (row) => [['airDate', row.airDate]],
  status: (row) => [['status', row.status]],
  url: (row) => [['url', row.url]],
};

const KNOWN = new Set<string>(SCRAPER_EXPORT_COLUMNS);

/**
 * The columns an export carries, in the order the user listed them.
 *
 * Unknown names are ignored and an empty list means every column — both as the
 * field's hint promises. Split by Season adds `season` to the flat formats when
 * the list left it out, because a split nobody can see is not a split.
 */
export function exportColumns(settings: Pick<ScraperExportSettings, 'includeColumns' | 'splitBySeason'>): ScraperExportColumn[] {
  const listed = [...new Set(settings.includeColumns.map((column) => column.trim()))]
    .filter((column): column is ScraperExportColumn => KNOWN.has(column));
  const columns = listed.length ? listed : [...SCRAPER_EXPORT_COLUMNS];
  if (settings.splitBySeason && !columns.includes('season')) columns.unshift('season');
  return columns;
}

function recordFor(
  row: EpisodeRow,
  columns: readonly ScraperExportColumn[],
  includeSubtitles: boolean,
): Record<string, Cell> {
  const record: Record<string, Cell> = {};
  for (const column of columns) {
    for (const [key, value] of COLUMN_FIELDS[column](row)) record[key] = value;
  }
  if (includeSubtitles) record.subtitles = row.subtitles.map((subtitle) => subtitle.language);
  return record;
}

function csvCell(value: Cell): string {
  const text = value === null ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows grouped by season, seasons ascending, row order kept inside each. */
function bySeason(rows: EpisodeRow[]): [number, EpisodeRow[]][] {
  const groups = new Map<number, EpisodeRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.season);
    if (bucket) bucket.push(row);
    else groups.set(row.season, [row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b);
}

export function exportExtension(format: ScraperExportFormat): string {
  return format === 'torrent-list' ? 'txt' : format;
}

/**
 * Expands `{series}` and `{date}` (every occurrence) into a safe file stem.
 * An empty result falls back to `anime-export` rather than naming a file ".json".
 */
export function exportFileStem(template: string, series: string, now = new Date()): string {
  const slug = series
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'anime-export';
  return template
    .replace(/\{series\}/g, slug)
    .replace(/\{date\}/g, now.toISOString().slice(0, 10))
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'anime-export';
}

/**
 * Builds an export from the profile's Export group.
 *
 * Every field reaches the bytes: `format` picks the branch, `includeColumns`
 * and `includeSubtitleColumn` choose the fields, `splitBySeason` groups them
 * (JSON keyed by season, M3U `#EXTGRP`, a season column for the flat formats)
 * and `prettyPrint` sets JSON indentation. `filenameTemplate`, `destinationRef`
 * and `openAfterExport` act on the file rather than its content and are
 * applied by the caller and by main's writer.
 */
export function buildEpisodeExport(
  rows: EpisodeRow[],
  settings: ScraperExportSettings,
): EpisodeExportOutput {
  const columns = exportColumns(settings);
  const records = (list: EpisodeRow[]) =>
    list.map((row) => recordFor(row, columns, settings.includeSubtitleColumn));
  const indent = settings.prettyPrint ? 2 : undefined;

  switch (settings.format) {
    case 'json': {
      const value = settings.splitBySeason
        ? Object.fromEntries(bySeason(rows).map(([season, list]) => [String(season), records(list)]))
        : records(rows);
      return {
        content: JSON.stringify(value, null, indent),
        extension: 'json',
        mimeType: 'application/json',
      };
    }
    case 'ndjson': {
      const ordered = settings.splitBySeason ? bySeason(rows).flatMap(([, list]) => list) : rows;
      return {
        content: records(ordered).map((record) => JSON.stringify(record)).join('\n'),
        extension: 'ndjson',
        mimeType: 'application/x-ndjson',
      };
    }
    case 'csv': {
      const ordered = settings.splitBySeason ? bySeason(rows).flatMap(([, list]) => list) : rows;
      const list = records(ordered);
      const header = list[0]
        ? Object.keys(list[0])
        : Object.keys(recordFor(rowTemplate(), columns, settings.includeSubtitleColumn));
      const lines = list.map((record) => header.map((key) => csvCell(record[key] ?? null)).join(','));
      return {
        content: [header.join(','), ...lines].join('\r\n'),
        extension: 'csv',
        mimeType: 'text/csv',
      };
    }
    case 'm3u': {
      const entry = (row: EpisodeRow) => [
        `#EXTINF:${row.durationSec},${row.numberLabel} - ${row.titleEn}`,
        row.url,
      ];
      const body = settings.splitBySeason
        ? bySeason(rows).flatMap(([season, list]) => [
          `#EXTGRP:Season ${season}`,
          ...list.flatMap(entry),
        ])
        : rows.flatMap(entry);
      return {
        content: ['#EXTM3U', ...body].join('\n'),
        extension: 'm3u',
        mimeType: 'audio/x-mpegurl',
      };
    }
    case 'torrent-list': {
      const ordered = settings.splitBySeason ? bySeason(rows).flatMap(([, list]) => list) : rows;
      return {
        content: ordered
          .map((row) => [
            ...(settings.splitBySeason ? [String(row.season)] : []),
            row.numberLabel,
            row.titleEn,
            row.resolution,
            row.sourceLabel,
            row.url,
          ].join('\t'))
          .join('\n'),
        extension: 'txt',
        mimeType: 'text/plain',
      };
    }
  }
}

/** An empty row, only so an export of zero rows still gets a correct CSV header. */
function rowTemplate(): EpisodeRow {
  return {
    id: '', seriesId: '', number: 0, numberLabel: '', season: 0, titleEn: '', titleJa: '',
    kind: 'episode', audio: '', resolution: '', sourceId: '', sourceLabel: '', sizeBytes: 0,
    durationSec: 0, airDate: null, url: '', thumbnailUrl: '', subtitles: [], status: 'ok',
    statusNote: '',
  };
}
