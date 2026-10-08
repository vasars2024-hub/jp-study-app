import { describe, expect, it } from 'vitest';
import { mapQbitPath } from '../qbitPathMapping';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  SCRAPER_QBIT_PATH_MAPPINGS_MAX,
  cloneScraperQbittorrentSettings,
  mergeScraperQbittorrentSettings,
  validateScraperQbittorrentSettings,
} from '../scraperSourceSettings';
import type { ScraperSettingsIssue } from '../scraperSettingsPrimitives';
import { infoHashFromMagnet, ingestPathKey, normalizeInfoHash } from '../mediaIngest';

describe('mapQbitPath', () => {
  const mappings = [
    { remote: '/downloads', local: 'D:\\Torrents' },
    { remote: '/downloads/anime', local: '\\\\nas\\anime' },
  ];

  it('maps a POSIX remote path onto a Windows local folder', () => {
    expect(mapQbitPath('/downloads/Show/ep01.mkv', mappings)).toBe('D:\\Torrents\\Show\\ep01.mkv');
  });

  it('lets the longest matching prefix win', () => {
    expect(mapQbitPath('/downloads/anime/Show/ep01.mkv', mappings)).toBe('\\\\nas\\anime\\Show\\ep01.mkv');
  });

  it('matches whole segments only, and is case-sensitive for POSIX remotes', () => {
    expect(mapQbitPath('/downloads2/x.mkv', mappings)).toBe('/downloads2/x.mkv');
    expect(mapQbitPath('/Downloads/x.mkv', mappings)).toBe('/Downloads/x.mkv');
  });

  it('maps the prefix itself, and ignores a trailing slash on either side', () => {
    expect(mapQbitPath('/downloads/', [{ remote: '/downloads/', local: '/mnt/t/' }])).toBe('/mnt/t/');
    expect(mapQbitPath('/downloads/a', [{ remote: '/downloads/', local: '/mnt/t/' }])).toBe('/mnt/t/a');
  });

  it('is separator- and case-insensitive for a Windows remote', () => {
    expect(mapQbitPath('c:/Data/Show/ep.mkv', [{ remote: 'C:\\data', local: '/Volumes/data' }]))
      .toBe('/Volumes/data/Show/ep.mkv');
  });

  it('leaves a path alone when nothing matches or there are no mappings', () => {
    expect(mapQbitPath('E:\\x\\y.mkv', mappings)).toBe('E:\\x\\y.mkv');
    expect(mapQbitPath('/downloads/x', [])).toBe('/downloads/x');
    expect(mapQbitPath('', mappings)).toBe('');
  });
});

describe('qBittorrent pathMappings setting', () => {
  it('defaults to none and survives clone and merge as a copy', () => {
    expect(DEFAULT_SCRAPER_QBITTORRENT_SETTINGS.pathMappings).toEqual([]);
    const withOne = mergeScraperQbittorrentSettings(DEFAULT_SCRAPER_QBITTORRENT_SETTINGS, {
      pathMappings: [{ remote: '/a', local: 'D:\\a' }],
    });
    const copy = cloneScraperQbittorrentSettings(withOne);
    expect(copy.pathMappings).toEqual([{ remote: '/a', local: 'D:\\a' }]);
    expect(copy.pathMappings).not.toBe(withOne.pathMappings);
    expect(copy.pathMappings[0]).not.toBe(withOne.pathMappings[0]);
  });

  it('keeps a profile saved before the field existed without reporting a repair', () => {
    const issues: ScraperSettingsIssue[] = [];
    const out = validateScraperQbittorrentSettings({ host: 'localhost' }, DEFAULT_SCRAPER_QBITTORRENT_SETTINGS, issues, 'q');
    expect(out.pathMappings).toEqual([]);
    expect(issues.filter((issue) => issue.path === 'q.pathMappings')).toEqual([]);
  });

  it('drops malformed rows, duplicates and anything past the cap', () => {
    const issues: ScraperSettingsIssue[] = [];
    const rows: unknown[] = [
      { remote: ' /srv/t ', local: ' D:\\t ' },
      { remote: '/srv/t/', local: 'E:\\dup' },
      { remote: 'relative', local: 'D:\\x' },
      { remote: '/x', local: '' },
      { remote: 5, local: 'D:\\x' },
      null,
    ];
    for (let i = 0; i < SCRAPER_QBIT_PATH_MAPPINGS_MAX + 3; i += 1) rows.push({ remote: `/m${i}`, local: `D:\\m${i}` });
    const out = validateScraperQbittorrentSettings({ pathMappings: rows }, DEFAULT_SCRAPER_QBITTORRENT_SETTINGS, issues, 'q');
    expect(out.pathMappings[0]).toEqual({ remote: '/srv/t', local: 'D:\\t' });
    expect(out.pathMappings).toHaveLength(SCRAPER_QBIT_PATH_MAPPINGS_MAX);
    expect(issues.some((issue) => issue.path === 'q.pathMappings')).toBe(true);
  });

  it('falls back on a non-list value', () => {
    const issues: ScraperSettingsIssue[] = [];
    const out = validateScraperQbittorrentSettings({ pathMappings: 'nope' }, DEFAULT_SCRAPER_QBITTORRENT_SETTINGS, issues, 'q');
    expect(out.pathMappings).toEqual([]);
    expect(issues.some((issue) => issue.path === 'q.pathMappings')).toBe(true);
  });
});

describe('info hash and path key normalisation', () => {
  it('decodes a 32-character base32 hash to the hex qBittorrent reports', () => {
    expect(normalizeInfoHash('A'.repeat(32))).toBe('0'.repeat(40));
    expect(normalizeInfoHash('a'.repeat(32))).toBe('0'.repeat(40));
    expect(normalizeInfoHash(infoHashFromMagnet(`magnet:?xt=urn:btih:${'A'.repeat(32)}`))).toBe('0'.repeat(40));
    expect(normalizeInfoHash('not-a-hash')).toBe('');
  });

  it('keys a decomposed (NFD) name the same as the composed one', () => {
    const composed = 'D:\\アニメ\\が.mkv';
    expect(ingestPathKey(composed.normalize('NFD'))).toBe(ingestPathKey(composed));
    expect(ingestPathKey('D:/A//b/')).toBe(ingestPathKey('d:\\a\\B'));
  });
});
