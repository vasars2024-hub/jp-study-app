// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_SCRAPER_TORRENT_SETTINGS,
  type ScraperSourceEntry,
  type ScraperTorrentSettings,
} from '../../shared/scraperSourceSettings';

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd(), getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const {
  applyTorrentPreferences,
  buildIndexUrl,
  looksLikeBatch,
  magnetFor,
  parseReleaseGroup,
  parseResolution,
  parseSizeBytes,
  parseSubtitleLanguages,
  parseTorrentFeed,
  searchTorrents,
} = await import('../scraper/torrents');

// A real Nyaa RSS document, reduced to four items but keeping the exact element
// names, namespace prefixes and CDATA the live feed uses.
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa">
  <channel>
    <title>Nyaa - Home - Torrent File RSS</title>
    <item>
      <title><![CDATA[[SubsPlease] Frieren - 01 (1080p) [F1A2B3C4].mkv]]></title>
      <link>https://nyaa.si/download/1801234.torrent</link>
      <guid isPermaLink="true">https://nyaa.si/view/1801234</guid>
      <pubDate>Sun, 20 Jul 2026 12:00:00 -0000</pubDate>
      <nyaa:seeders>820</nyaa:seeders>
      <nyaa:leechers>44</nyaa:leechers>
      <nyaa:downloads>15230</nyaa:downloads>
      <nyaa:infoHash>AA11BB22CC33DD44EE55FF6677889900AABBCCDD</nyaa:infoHash>
      <nyaa:size>1.4 GiB</nyaa:size>
    </item>
    <item>
      <title><![CDATA[[Erai-raws] Frieren - 01 [720p][Multiple Subtitle]]]></title>
      <link>https://nyaa.si/download/1801235.torrent</link>
      <guid isPermaLink="true">https://nyaa.si/view/1801235</guid>
      <pubDate>Sat, 19 Jul 2026 12:00:00 -0000</pubDate>
      <nyaa:seeders>210</nyaa:seeders>
      <nyaa:leechers>12</nyaa:leechers>
      <nyaa:downloads>4400</nyaa:downloads>
      <nyaa:infoHash>1122334455667788990011223344556677889900</nyaa:infoHash>
      <nyaa:size>702.5 MiB</nyaa:size>
    </item>
    <item>
      <title><![CDATA[[LowSeed] Frieren - 01 (1080p)]]></title>
      <link>https://nyaa.si/download/1801236.torrent</link>
      <guid isPermaLink="true">https://nyaa.si/view/1801236</guid>
      <pubDate>Fri, 18 Jul 2026 12:00:00 -0000</pubDate>
      <nyaa:seeders>1</nyaa:seeders>
      <nyaa:leechers>0</nyaa:leechers>
      <nyaa:downloads>7</nyaa:downloads>
      <nyaa:infoHash>DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF</nyaa:infoHash>
      <nyaa:size>1.3 GiB</nyaa:size>
    </item>
    <item>
      <title><![CDATA[[SubsPlease] Frieren 01-28 (1080p) [Batch]]]></title>
      <link>https://nyaa.si/download/1801237.torrent</link>
      <guid isPermaLink="true">https://nyaa.si/view/1801237</guid>
      <pubDate>Thu, 17 Jul 2026 12:00:00 -0000</pubDate>
      <nyaa:seeders>640</nyaa:seeders>
      <nyaa:leechers>30</nyaa:leechers>
      <nyaa:downloads>9100</nyaa:downloads>
      <nyaa:infoHash>0102030405060708090A0B0C0D0E0F1011121314</nyaa:infoHash>
      <nyaa:size>39.2 GiB</nyaa:size>
    </item>
  </channel>
</rss>`;

const NOW = Date.parse('2026-07-27T12:00:00Z');

function settings(overrides: Partial<ScraperTorrentSettings> = {}): ScraperTorrentSettings {
  return { ...DEFAULT_SCRAPER_TORRENT_SETTINGS, ...overrides };
}

function indexer(host: string): ScraperSourceEntry {
  return {
    id: 'nyaa',
    label: 'Nyaa (torrent index)',
    host,
    kind: 'torrent',
    enabled: true,
    priority: 1,
    fallbackIds: [],
    verifiedSiteId: '',
    requiresAuth: false,
    supportsSubtitles: true,
    health: 'ok',
    lastCheckedAt: null,
    notes: '',
  };
}

describe('release-name parsing', () => {
  it('reads sizes in both SI and binary units', () => {
    expect(parseSizeBytes('1.4 GiB')).toBe(1_503_238_554);
    expect(parseSizeBytes('702.5 MiB')).toBe(736_624_640);
    expect(parseSizeBytes('2 GB')).toBe(2_000_000_000);
    expect(parseSizeBytes('nonsense')).toBe(0);
  });

  it('pulls the release group from either end of the name', () => {
    expect(parseReleaseGroup('[SubsPlease] Frieren - 01 (1080p)')).toBe('SubsPlease');
    expect(parseReleaseGroup('(Erai-raws) Something')).toBe('Erai-raws');
    expect(parseReleaseGroup('Frieren - 01 [1080p]-Commie.mkv')).toBe('Commie');
    expect(parseReleaseGroup('no group here')).toBe('');
  });

  it('reads the resolution from a tag or from dimensions', () => {
    expect(parseResolution('[X] Title - 01 (1080p)')).toBe('1080p');
    expect(parseResolution('Title 1920x1080')).toBe('1080p');
    expect(parseResolution('Title 4K remux')).toBe('2160p');
    expect(parseResolution('Title')).toBe('');
  });

  it('recognises a batch without calling a single episode one', () => {
    expect(looksLikeBatch('[X] Frieren 01-28 (1080p) [Batch]')).toBe(true);
    expect(looksLikeBatch('[X] Frieren S01 Complete')).toBe(true);
    expect(looksLikeBatch('[X] Frieren E01-E12')).toBe(true);
    expect(looksLikeBatch('[SubsPlease] Frieren - 01 (1080p) [F1A2B3C4].mkv')).toBe(false);
    expect(looksLikeBatch('[X] Title (2020) 1080p')).toBe(false);
  });

  it('reads advertised subtitle languages', () => {
    expect(parseSubtitleLanguages('[Erai-raws] X [Multiple Subtitle]').sort()).toEqual(['en', 'ja']);
    expect(parseSubtitleLanguages('[X] Title RAW')).toEqual(['ja']);
    expect(parseSubtitleLanguages('[X] Title [CHS]')).toEqual(['zh']);
  });

  it('builds a magnet with the hash, name and trackers', () => {
    const magnet = magnetFor('ABCD', 'My Release', ['udp://tracker.test:80/announce']);
    expect(magnet).toContain('magnet:?xt=urn:btih:abcd');
    expect(magnet).toContain('dn=My%20Release');
    expect(magnet).toContain('tr=udp%3A%2F%2Ftracker.test%3A80%2Fannounce');
    expect(magnetFor('', 'x', [])).toBe('');
  });
});

describe('parseTorrentFeed', () => {
  it('turns a real feed document into rows', () => {
    const rows = parseTorrentFeed(FEED, { tracker: 'Nyaa', trackers: [], now: NOW });
    expect(rows).toHaveLength(4);
    const first = rows[0];
    expect(first.name).toContain('[SubsPlease] Frieren - 01');
    expect(first.seeders).toBe(820);
    expect(first.leechers).toBe(44);
    expect(first.availability).toBe(15_230);
    expect(first.sizeBytes).toBe(1_503_238_554);
    expect(first.releaseGroup).toBe('SubsPlease');
    expect(first.resolution).toBe('1080p');
    expect(first.infoHash).toBe('aa11bb22cc33dd44ee55ff6677889900aabbccdd');
    expect(first.tracker).toBe('Nyaa');
    expect(first.isBatch).toBe(false);
    expect(first.ageDays).toBe(7);
    expect(first.magnet).toContain('urn:btih:aa11bb22');
  });

  it('marks the batch row and leaves its file count unknown', () => {
    const rows = parseTorrentFeed(FEED, { tracker: 'Nyaa', trackers: [], now: NOW });
    const batch = rows.find((r) => r.name.includes('Batch'));
    expect(batch?.isBatch).toBe(true);
    expect(batch?.fileCount).toBe(0);
  });

  it('returns nothing rather than throwing on a body that is not a feed', () => {
    expect(parseTorrentFeed('<html><body>blocked</body></html>', {
      tracker: 'X',
      trackers: [],
    })).toEqual([]);
    expect(parseTorrentFeed('', { tracker: 'X', trackers: [] })).toEqual([]);
  });
});

describe('applyTorrentPreferences', () => {
  const rows = parseTorrentFeed(FEED, { tracker: 'Nyaa', trackers: [], now: NOW });

  it('drops rows under the seeder floor', () => {
    const out = applyTorrentPreferences(rows, settings({ minSeeders: 100 }), { text: '' });
    expect(out.map((r) => r.releaseGroup)).not.toContain('LowSeed');
  });

  it('lets the query override the configured seeder floor', () => {
    const out = applyTorrentPreferences(rows, settings({ minSeeders: 100 }), {
      text: '',
      minSeeders: 0,
    });
    expect(out.map((r) => r.releaseGroup)).toContain('LowSeed');
  });

  it('applies the size ceiling', () => {
    const out = applyTorrentPreferences(rows, settings({ maxSizeMb: 2_048 }), { text: '' });
    expect(out.some((r) => r.name.includes('Batch'))).toBe(false);
  });

  it('removes blocked groups and floats preferred ones to the top', () => {
    const blocked = applyTorrentPreferences(
      rows,
      settings({ minSeeders: 0, blockedReleaseGroups: ['SubsPlease'] }),
      { text: '' },
    );
    expect(blocked.every((r) => r.releaseGroup !== 'SubsPlease')).toBe(true);

    const preferred = applyTorrentPreferences(
      rows,
      settings({ minSeeders: 0, preferredReleaseGroups: ['Erai-raws'] }),
      { text: '' },
    );
    expect(preferred[0].releaseGroup).toBe('Erai-raws');
  });

  it('filters by the query resolution and group', () => {
    expect(
      applyTorrentPreferences(rows, settings({ minSeeders: 0 }), { text: '', resolution: '720p' }),
    ).toHaveLength(1);
    expect(
      applyTorrentPreferences(rows, settings({ minSeeders: 0 }), {
        text: '',
        releaseGroup: 'subsplease',
      }),
    ).toHaveLength(2);
  });

  it('ranks by the configured resolution priority, then seeders', () => {
    const out = applyTorrentPreferences(
      rows,
      settings({ minSeeders: 0, resolutionPriority: [720, 1080] }),
      { text: '' },
    );
    expect(out[0].resolution).toBe('720p');
    // Within 1080p, the better-seeded release comes first.
    const hd = out.filter((r) => r.resolution === '1080p');
    expect(hd[0].seeders).toBeGreaterThan(hd[1].seeders);
  });

  it('puts batches first when asked', () => {
    const out = applyTorrentPreferences(
      rows,
      settings({ minSeeders: 0, preferBatches: true }),
      { text: '' },
    );
    expect(out[0].isBatch).toBe(true);
  });

  it('dedupes by info hash but keeps hashless rows', () => {
    const duplicated = [...rows, { ...rows[0], id: 'other' }, { ...rows[0], id: 'x', infoHash: '' }];
    const out = applyTorrentPreferences(duplicated, settings({ minSeeders: 0 }), { text: '' });
    expect(out.filter((r) => r.infoHash === rows[0].infoHash)).toHaveLength(1);
    expect(out.filter((r) => r.infoHash === '')).toHaveLength(1);
  });

  it('requires a subtitle language when the profile asks for one', () => {
    const out = applyTorrentPreferences(
      rows,
      settings({ minSeeders: 0, requireSubtitles: true, subtitleLanguages: ['zh'] }),
      { text: '' },
    );
    expect(out).toHaveLength(0);
  });
});

describe('buildIndexUrl', () => {
  it('asks the index for an RSS page sorted by seeders', () => {
    const url = new URL(buildIndexUrl('nyaa.si', { text: 'frieren 01' }));
    expect(url.origin).toBe('https://nyaa.si');
    expect(url.searchParams.get('page')).toBe('rss');
    expect(url.searchParams.get('q')).toBe('frieren 01');
    expect(url.searchParams.get('s')).toBe('seeders');
    expect(url.searchParams.get('o')).toBe('desc');
  });

  it('defaults to the anime category', () => {
    const url = new URL(buildIndexUrl('nyaa.si', { text: 'frieren' }));
    expect(url.searchParams.get('c')).toBe('1_0');
  });

  // Measured live: without this a manga search for NARUTO came back as 72 .mkv
  // episode files, because the series is named the same in both trees.
  it('honours a caller-supplied category so manga does not return video', () => {
    const url = new URL(buildIndexUrl('nyaa.si', { text: 'naruto', category: '3_0' }));
    expect(url.searchParams.get('c')).toBe('3_0');
  });

  it('falls back to anime for a blank category', () => {
    const url = new URL(buildIndexUrl('nyaa.si', { text: 'naruto', category: '  ' }));
    expect(url.searchParams.get('c')).toBe('1_0');
  });
});

describe('searchTorrents', () => {
  let server: http.Server;
  let host = '';
  let mode: 'feed' | 'error' | 'html' = 'feed';

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      if (mode === 'error') {
        res.writeHead(503);
        res.end('down');
        return;
      }
      if (mode === 'html') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html>not a feed</html>');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(FEED);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  });

  // buildIndexUrl is https-only, so the search path is exercised by pointing the
  // parser and filter at a served document through the same call shape the IPC
  // handler uses, with the index reachable over plain HTTP via the fallback in
  // scraperRequest. The URL builder itself is covered above.
  const searchAgainst = (overrides: Partial<ScraperTorrentSettings> = {}) =>
    searchTorrents({
      query: { text: 'frieren' },
      indexers: [indexer(host)],
      torrents: settings({ minSeeders: 0, ...overrides }),
      timeoutMs: 5_000,
    });

  it('returns nothing when no torrent index is enabled', async () => {
    const out = await searchTorrents({
      query: { text: 'x' },
      indexers: [{ ...indexer(host), enabled: false }],
      torrents: settings(),
      timeoutMs: 5_000,
    });
    expect(out).toEqual([]);
  });

  it('ignores sources that are not torrent indexes', async () => {
    const out = await searchTorrents({
      query: { text: 'x' },
      indexers: [{ ...indexer(host), kind: 'metadata' }],
      torrents: settings(),
      timeoutMs: 5_000,
    });
    expect(out).toEqual([]);
  });

  it('returns an empty list, not an error, when the index is down', async () => {
    mode = 'error';
    await expect(searchAgainst()).resolves.toEqual([]);
    mode = 'feed';
  });

  it('returns an empty list when the index answers with a challenge page', async () => {
    mode = 'html';
    await expect(searchAgainst()).resolves.toEqual([]);
    mode = 'feed';
  });
});
