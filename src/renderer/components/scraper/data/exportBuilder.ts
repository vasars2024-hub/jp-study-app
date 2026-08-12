import type { EpisodeRow } from '../../../../shared/scraperResults';
import type { ScraperExportFormat } from '../../../../shared/scraperOutputSettings';

export interface EpisodeExportOutput {
  content: string;
  extension: string;
  mimeType: string;
}

/**
 * The column vocabulary `export.includeColumns` is written in.
 *
 * This is the source of truth the Columns field's hint names, rather than a
 * hand-copied list that would drift from it. The builder below does not consume
 * it yet — the export slice that reads it is still in flight — but
 * `settings/fields.ts` already imports it, and that import is unresolvable
 * without it, so it lives here where that slice will need it.
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

function recordFor(row: EpisodeRow) {
  return {
    number: row.number,
    numberLabel: row.numberLabel,
    titleEn: row.titleEn,
    titleJa: row.titleJa,
    kind: row.kind,
    resolution: row.resolution,
    source: row.sourceLabel,
    url: row.url,
    subtitles: row.subtitles.map((subtitle) => subtitle.language),
    status: row.status,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportExtension(format: ScraperExportFormat): string {
  return format === 'torrent-list' ? 'txt' : format;
}

export function buildEpisodeExport(
  rows: EpisodeRow[],
  format: ScraperExportFormat,
): EpisodeExportOutput {
  const records = rows.map(recordFor);

  switch (format) {
    case 'json':
      return {
        content: JSON.stringify(records, null, 2),
        extension: 'json',
        mimeType: 'application/json',
      };
    case 'ndjson':
      return {
        content: records.map((record) => JSON.stringify(record)).join('\n'),
        extension: 'ndjson',
        mimeType: 'application/x-ndjson',
      };
    case 'csv': {
      const header = ['number', 'numberLabel', 'titleEn', 'titleJa', 'kind', 'resolution', 'source', 'url', 'subtitles', 'status'];
      const lines = records.map((record) =>
        [
          record.number,
          record.numberLabel,
          record.titleEn,
          record.titleJa,
          record.kind,
          record.resolution,
          record.source,
          record.url,
          record.subtitles.join('|'),
          record.status,
        ].map(csvCell).join(','),
      );
      return {
        content: [header.join(','), ...lines].join('\r\n'),
        extension: 'csv',
        mimeType: 'text/csv',
      };
    }
    case 'm3u':
      return {
        content: [
          '#EXTM3U',
          ...rows.flatMap((row) => [
            `#EXTINF:${row.durationSec},${row.numberLabel} - ${row.titleEn}`,
            row.url,
          ]),
        ].join('\n'),
        extension: 'm3u',
        mimeType: 'audio/x-mpegurl',
      };
    case 'torrent-list':
      return {
        content: rows
          .map((row) => `${row.numberLabel}\t${row.titleEn}\t${row.resolution}\t${row.sourceLabel}\t${row.url}`)
          .join('\n'),
        extension: 'txt',
        mimeType: 'text/plain',
      };
  }
}
