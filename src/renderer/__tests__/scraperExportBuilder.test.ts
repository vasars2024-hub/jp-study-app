import { describe, expect, it } from 'vitest';
import {
  buildEpisodeExport,
  exportColumns,
  exportExtension,
  exportFileStem,
} from '../components/scraper/data/exportBuilder';
import type { EpisodeRow } from '../../shared/scraperResults';
import {
  DEFAULT_SCRAPER_EXPORT_SETTINGS,
  type ScraperExportSettings,
} from '../../shared/scraperOutputSettings';

const EPISODE: EpisodeRow = {
  id: 'episode-1',
  seriesId: 'series',
  number: 1,
  numberLabel: '第1話',
  season: 1,
  titleEn: 'Title, With Comma',
  titleJa: '第一話',
  kind: 'episode',
  audio: 'sub',
  resolution: '1080p',
  sourceId: 'source',
  sourceLabel: 'Source',
  sizeBytes: 1024,
  durationSec: 1440,
  airDate: null,
  url: '/episode-1',
  thumbnailUrl: '',
  subtitles: [{ language: 'ja', format: 'srt', embedded: false, quality: 1, source: 'Local' }],
  status: 'ok',
  statusNote: '',
};

const SEASON_TWO: EpisodeRow = {
  ...EPISODE,
  id: 'episode-2-1',
  number: 1,
  numberLabel: 'S2 EP 01',
  season: 2,
  titleEn: 'Second season opener',
  url: '/s2e1',
};

function settings(over: Partial<ScraperExportSettings> = {}): ScraperExportSettings {
  return { ...DEFAULT_SCRAPER_EXPORT_SETTINGS, ...over };
}

describe('scraper episode export builder', () => {
  it('builds valid JSON and NDJSON', () => {
    expect(JSON.parse(buildEpisodeExport([EPISODE], settings({ format: 'json' })).content)).toHaveLength(1);
    expect(JSON.parse(buildEpisodeExport([EPISODE], settings({ format: 'ndjson' })).content)).toMatchObject({
      titleEn: EPISODE.titleEn,
      subtitles: ['ja'],
    });
  });

  it('escapes CSV cells and includes the header', () => {
    const output = buildEpisodeExport([EPISODE], settings({ format: 'csv' }));
    expect(output.content).toContain('number,numberLabel,titleEn');
    expect(output.content).toContain('"Title, With Comma"');
  });

  it('neutralises scraped cells that a spreadsheet would run as a formula', () => {
    const titles = ['=HYPERLINK("x")', '+1', '-cmd', '@SUM(A1)', '\tTab'];
    const csv = buildEpisodeExport(
      titles.map((titleEn, i) => ({ ...EPISODE, id: `e${i}`, titleEn })),
      settings({ format: 'csv', includeColumns: ['title'], includeSubtitleColumn: false }),
    ).content;
    const cells = csv.split('\r\n').slice(1).map((line) => line.split(',')[0]);
    expect(cells).toEqual(["\"'=HYPERLINK(\"\"x\"\")\"", "'+1", "'-cmd", "'@SUM(A1)", "'\tTab"]);
  });

  it('builds a playable M3U and a link list', () => {
    expect(buildEpisodeExport([EPISODE], settings({ format: 'm3u' })).content).toContain('#EXTM3U');
    expect(buildEpisodeExport([EPISODE], settings({ format: 'm3u' })).content).toContain('/episode-1');
    expect(buildEpisodeExport([EPISODE], settings({ format: 'torrent-list' })).content).toContain('Source\t/episode-1');
    expect(exportExtension('torrent-list')).toBe('txt');
  });
});

describe('the Export group reaches the bytes', () => {
  it('prettyPrint sets JSON indentation', () => {
    const pretty = buildEpisodeExport([EPISODE], settings({ format: 'json', prettyPrint: true })).content;
    const compact = buildEpisodeExport([EPISODE], settings({ format: 'json', prettyPrint: false })).content;
    expect(pretty).toContain('\n  ');
    expect(compact).not.toContain('\n');
    expect(JSON.parse(compact)).toEqual(JSON.parse(pretty));
  });

  it('includeColumns chooses and orders the fields', () => {
    const csv = buildEpisodeExport(
      [EPISODE],
      settings({ format: 'csv', includeColumns: ['url', 'title'], includeSubtitleColumn: false }),
    ).content;
    expect(csv.split('\r\n')[0]).toBe('url,titleEn,titleJa');
    const json = JSON.parse(buildEpisodeExport(
      [EPISODE],
      settings({ format: 'json', includeColumns: ['resolution'], includeSubtitleColumn: false }),
    ).content);
    expect(json).toEqual([{ resolution: '1080p' }]);
  });

  it('ignores unknown column names and treats an empty list as every column', () => {
    expect(exportColumns({ includeColumns: ['bogus', 'size'], splitBySeason: false })).toEqual(['size']);
    expect(exportColumns({ includeColumns: [], splitBySeason: false })).toHaveLength(12);
    expect(exportColumns({ includeColumns: ['bogus'], splitBySeason: false })).toHaveLength(12);
  });

  it('includeSubtitleColumn adds or drops the subtitle field', () => {
    const on = JSON.parse(buildEpisodeExport([EPISODE], settings({ includeSubtitleColumn: true })).content);
    const off = JSON.parse(buildEpisodeExport([EPISODE], settings({ includeSubtitleColumn: false })).content);
    expect(on[0].subtitles).toEqual(['ja']);
    expect(off[0]).not.toHaveProperty('subtitles');
  });

  it('splitBySeason keys JSON by season', () => {
    const json = JSON.parse(buildEpisodeExport(
      [SEASON_TWO, EPISODE],
      settings({ format: 'json', splitBySeason: true }),
    ).content);
    expect(Object.keys(json)).toEqual(['1', '2']);
    expect(json['2'][0].titleEn).toBe('Second season opener');
  });

  it('splitBySeason adds #EXTGRP to M3U', () => {
    const m3u = buildEpisodeExport([SEASON_TWO, EPISODE], settings({ format: 'm3u', splitBySeason: true })).content;
    const lines = m3u.split('\n');
    expect(lines).toContain('#EXTGRP:Season 1');
    expect(lines).toContain('#EXTGRP:Season 2');
    expect(lines.indexOf('#EXTGRP:Season 1')).toBeLessThan(lines.indexOf('#EXTGRP:Season 2'));
    expect(buildEpisodeExport([EPISODE], settings({ format: 'm3u' })).content).not.toContain('#EXTGRP');
  });

  it('splitBySeason gives the flat formats a season column', () => {
    const csv = buildEpisodeExport(
      [EPISODE],
      settings({ format: 'csv', includeColumns: ['title'], splitBySeason: true, includeSubtitleColumn: false }),
    ).content;
    expect(csv.split('\r\n')[0]).toBe('season,titleEn,titleJa');
    const list = buildEpisodeExport([SEASON_TWO], settings({ format: 'torrent-list', splitBySeason: true })).content;
    expect(list.startsWith('2\t')).toBe(true);
  });

  it('format picks the branch', () => {
    expect(buildEpisodeExport([EPISODE], settings({ format: 'csv' })).mimeType).toBe('text/csv');
    expect(buildEpisodeExport([EPISODE], settings({ format: 'm3u' })).extension).toBe('m3u');
  });

  it('filenameTemplate expands every placeholder into a safe stem', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    expect(exportFileStem('{series}-{date}', 'Frieren: Beyond', now)).toBe('frieren-beyond-2026-09-24');
    expect(exportFileStem('{series}/{series}', 'A', now)).toBe('a-a');
    expect(exportFileStem('///', 'x', now)).toBe('anime-export');
  });
});
