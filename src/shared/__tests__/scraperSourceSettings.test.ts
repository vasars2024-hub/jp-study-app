import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  DEFAULT_SCRAPER_SOURCE_SETTINGS,
  DEFAULT_SCRAPER_TORRENT_SETTINGS,
  validateScraperQbittorrentSettings,
  validateScraperSourceSettings,
  validateScraperTorrentSettings,
} from '../scraperSourceSettings';
import type { ScraperSettingsIssue } from '../scraperSettingsPrimitives';

function run<T>(
  fn: (input: unknown, fallback: T, issues: ScraperSettingsIssue[], p: string) => T,
  input: unknown,
  fallback: T,
) {
  const issues: ScraperSettingsIssue[] = [];
  const value = fn(input, fallback, issues, 'g');
  return { value, issues, paths: issues.map((i) => i.path) };
}

const source = (over: Record<string, unknown> = {}) => ({
  id: 'streamsb',
  label: 'StreamSB',
  host: 'https://www.StreamSB.example/path',
  kind: 'streaming',
  ...over,
});

describe('source settings', () => {
  it('normalizes a host down to a bare lowercase hostname', () => {
    const { value } = run(validateScraperSourceSettings, { entries: [source()] }, DEFAULT_SCRAPER_SOURCE_SETTINGS);
    expect(value.entries[0].host).toBe('streamsb.example');
  });

  it('drops a source with no usable id or host, and says so', () => {
    const { value, paths } = run(
      validateScraperSourceSettings,
      { entries: [source(), { label: 'no id' }, source({ id: 'x', host: '!!!' })] },
      DEFAULT_SCRAPER_SOURCE_SETTINGS,
    );
    expect(value.entries).toHaveLength(1);
    expect(paths.some((p) => p.endsWith('.id'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.host'))).toBe(true);
  });

  it('ignores a duplicate source id', () => {
    const { value, issues } = run(
      validateScraperSourceSettings,
      { entries: [source(), source({ label: 'copy' })] },
      DEFAULT_SCRAPER_SOURCE_SETTINGS,
    );
    expect(value.entries).toHaveLength(1);
    expect(issues.some((i) => i.message.includes('duplicate'))).toBe(true);
  });

  it('densifies priority so the list always reads 1..N', () => {
    const { value } = run(
      validateScraperSourceSettings,
      {
        entries: [
          source({ id: 'a', host: 'a.example', priority: 40 }),
          source({ id: 'b', host: 'b.example', priority: 41 }),
          source({ id: 'c', host: 'c.example', priority: 99 }),
        ],
      },
      DEFAULT_SCRAPER_SOURCE_SETTINGS,
    );
    expect(value.entries.map((e) => e.priority)).toEqual([1, 2, 3]);
  });

  it('lets the stored order decide priority, and appends anything missing from it', () => {
    const { value } = run(
      validateScraperSourceSettings,
      {
        entries: [
          source({ id: 'a', host: 'a.example' }),
          source({ id: 'b', host: 'b.example' }),
          source({ id: 'c', host: 'c.example' }),
        ],
        order: ['c', 'a'],
      },
      DEFAULT_SCRAPER_SOURCE_SETTINGS,
    );
    expect(value.order).toEqual(['c', 'a', 'b']);
    expect(value.entries.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('drops an order entry that names a source which no longer exists', () => {
    const { value } = run(
      validateScraperSourceSettings,
      { entries: [source({ id: 'a', host: 'a.example' })], order: ['ghost', 'a'] },
      DEFAULT_SCRAPER_SOURCE_SETTINGS,
    );
    expect(value.order).toEqual(['a']);
  });

  it('drops a dangling fallback id rather than stranding a run mid-chain', () => {
    const { value, issues } = run(
      validateScraperSourceSettings,
      {
        entries: [
          source({ id: 'a', host: 'a.example', fallbackIds: ['b', 'ghost'] }),
          source({ id: 'b', host: 'b.example' }),
        ],
      },
      DEFAULT_SCRAPER_SOURCE_SETTINGS,
    );
    expect(value.entries.find((e) => e.id === 'a')?.fallbackIds).toEqual(['b']);
    expect(issues.some((i) => i.path.includes('fallbackIds'))).toBe(true);
  });

  it('refuses to let a source fall back to itself', () => {
    const { value } = run(
      validateScraperSourceSettings,
      { entries: [source({ id: 'a', host: 'a.example', fallbackIds: ['a'] })] },
      DEFAULT_SCRAPER_SOURCE_SETTINGS,
    );
    expect(value.entries[0].fallbackIds).toEqual([]);
  });

  it('falls back on an unknown mode', () => {
    const { value, paths } = run(validateScraperSourceSettings, { mode: 'psychic' }, DEFAULT_SCRAPER_SOURCE_SETTINGS);
    expect(value.mode).toBe(DEFAULT_SCRAPER_SOURCE_SETTINGS.mode);
    expect(paths).toContain('g.mode');
  });

  it('keeps a real mode', () => {
    expect(run(validateScraperSourceSettings, { mode: 'torrent' }, DEFAULT_SCRAPER_SOURCE_SETTINGS).value.mode).toBe('torrent');
  });

  it('clamps depth and timeout into usable ranges', () => {
    const { value } = run(
      validateScraperSourceSettings,
      { maxFallbackDepth: 900, perSourceTimeoutMs: 5 },
      DEFAULT_SCRAPER_SOURCE_SETTINGS,
    );
    expect(value.maxFallbackDepth).toBe(10);
    expect(value.perSourceTimeoutMs).toBe(1_000);
  });
});

describe('torrent settings', () => {
  it('clamps seeder and size bounds', () => {
    const { value } = run(
      validateScraperTorrentSettings,
      { minSeeders: -5, maxSizeMb: 99_999_999 },
      DEFAULT_SCRAPER_TORRENT_SETTINGS,
    );
    expect(value.minSeeders).toBe(0);
    expect(value.maxSizeMb).toBe(1_048_576);
  });

  it('rejects a tracker URL with an unusable scheme', () => {
    const { value, issues } = run(
      validateScraperTorrentSettings,
      {
        extraTrackers: [
          { url: 'udp://tracker.example:80', enabled: true },
          { url: 'javascript:alert(1)', enabled: true },
        ],
      },
      DEFAULT_SCRAPER_TORRENT_SETTINGS,
    );
    expect(value.extraTrackers.map((t) => t.url)).toEqual(['udp://tracker.example:80']);
    expect(issues.some((i) => i.path.includes('extraTrackers'))).toBe(true);
  });

  it('de-duplicates trackers', () => {
    const { value } = run(
      validateScraperTorrentSettings,
      {
        extraTrackers: [
          { url: 'https://t.example/announce' },
          { url: 'https://t.example/announce' },
        ],
      },
      DEFAULT_SCRAPER_TORRENT_SETTINGS,
    );
    expect(value.extraTrackers).toHaveLength(1);
  });

  it('caps subtitle languages at twenty', () => {
    const many = Array.from({ length: 40 }, (_, i) => `l${i}`);
    const { value } = run(
      validateScraperTorrentSettings,
      { subtitleLanguages: many },
      DEFAULT_SCRAPER_TORRENT_SETTINGS,
    );
    expect(value.subtitleLanguages.length).toBeLessThanOrEqual(20);
  });

  it('keeps a valid protocol and rejects an invented one', () => {
    expect(run(validateScraperTorrentSettings, { protocols: 'both' }, DEFAULT_SCRAPER_TORRENT_SETTINGS).value.protocols).toBe('both');
    expect(run(validateScraperTorrentSettings, { protocols: 'carrier-pigeon' }, DEFAULT_SCRAPER_TORRENT_SETTINGS).value.protocols).toBe(
      DEFAULT_SCRAPER_TORRENT_SETTINGS.protocols,
    );
  });
});

describe('qBittorrent settings', () => {
  it('DROPS A PLAINTEXT PASSWORD and keeps only the secure-store handle', () => {
    // The single most important assertion in this file: a credential must never
    // reach a persisted settings document.
    const { value, issues } = run(
      validateScraperQbittorrentSettings,
      { password: 'hunter2', passwordRef: 'keychain:qbit' },
      DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    );
    expect(JSON.stringify(value)).not.toContain('hunter2');
    expect('password' in (value as object)).toBe(false);
    expect(value.passwordRef).toBe('keychain:qbit');
    expect(issues.some((i) => i.path === 'g.password')).toBe(true);
  });

  it('normalizes the host and clamps the port', () => {
    const { value } = run(
      validateScraperQbittorrentSettings,
      { host: 'http://WWW.Example.com:1234/x', port: 999_999 },
      DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    );
    expect(value.host).toBe('example.com');
    expect(value.port).toBe(65_535);
  });

  it('keeps the fallback host and reports an unparseable one', () => {
    const { value, paths } = run(
      validateScraperQbittorrentSettings,
      { host: '   ' },
      DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    );
    expect(value.host).toBe(DEFAULT_SCRAPER_QBITTORRENT_SETTINGS.host);
    expect(paths).toContain('g.host');
  });

  it('normalizes basePath so callers can always concatenate', () => {
    expect(run(validateScraperQbittorrentSettings, { basePath: 'qbt/' }, DEFAULT_SCRAPER_QBITTORRENT_SETTINGS).value.basePath).toBe('/qbt');
    expect(run(validateScraperQbittorrentSettings, { basePath: '/qbt/' }, DEFAULT_SCRAPER_QBITTORRENT_SETTINGS).value.basePath).toBe('/qbt');
    expect(run(validateScraperQbittorrentSettings, { basePath: '' }, DEFAULT_SCRAPER_QBITTORRENT_SETTINGS).value.basePath).toBe('');
  });

  it('rejects an invented scheme, add mode or content layout', () => {
    const { value } = run(
      validateScraperQbittorrentSettings,
      { scheme: 'ftp', addMode: 'sideways', contentLayout: 'spiral' },
      DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    );
    expect(value.scheme).toBe('http');
    expect(value.addMode).toBe(DEFAULT_SCRAPER_QBITTORRENT_SETTINGS.addMode);
    expect(value.contentLayout).toBe(DEFAULT_SCRAPER_QBITTORRENT_SETTINGS.contentLayout);
  });

  it('allows -1 on limits, meaning "follow qBittorrent\'s global setting"', () => {
    const { value } = run(
      validateScraperQbittorrentSettings,
      { ratioLimit: -1, seedingTimeLimitMin: -1 },
      DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    );
    expect(value.ratioLimit).toBe(-1);
    expect(value.seedingTimeLimitMin).toBe(-1);
  });

  it('caps tags at twenty', () => {
    const { value } = run(
      validateScraperQbittorrentSettings,
      { tags: Array.from({ length: 50 }, (_, i) => `t${i}`) },
      DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
    );
    expect(value.tags.length).toBeLessThanOrEqual(20);
  });
});
