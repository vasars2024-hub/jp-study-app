import { describe, expect, it } from 'vitest';
import { buildEpisodeExport, exportExtension } from '../components/scraper/data/exportBuilder';
import type { EpisodeRow } from '../../shared/scraperResults';

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

describe('scraper episode export builder', () => {
  it('builds valid JSON and NDJSON', () => {
    expect(JSON.parse(buildEpisodeExport([EPISODE], 'json').content)).toHaveLength(1);
    expect(JSON.parse(buildEpisodeExport([EPISODE], 'ndjson').content)).toMatchObject({
      titleEn: EPISODE.titleEn,
      subtitles: ['ja'],
    });
  });

  it('escapes CSV cells and includes the header', () => {
    const output = buildEpisodeExport([EPISODE], 'csv');
    expect(output.content).toContain('number,numberLabel,titleEn');
    expect(output.content).toContain('"Title, With Comma"');
  });

  it('builds a playable M3U and a link list', () => {
    expect(buildEpisodeExport([EPISODE], 'm3u').content).toContain('#EXTM3U');
    expect(buildEpisodeExport([EPISODE], 'm3u').content).toContain('/episode-1');
    expect(buildEpisodeExport([EPISODE], 'torrent-list').content).toContain('Source\t/episode-1');
    expect(exportExtension('torrent-list')).toBe('txt');
  });
});
