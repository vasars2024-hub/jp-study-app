// @vitest-environment jsdom
//
// The IPC port is the seam every Scraper screen talks through. Two promises are
// pinned here: a live call that fails never turns into sample data (the sample
// qBittorrent send reports "sent" for a transfer that never left the machine),
// and the new transfer and storage calls reach main with exactly what the
// screen asked for — above all, `deleteFiles` is never true unless the user
// chose it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIpcScraperPort,
  ScraperResultMissingError,
} from '../components/scraper/data/ipcScraperPort';
import { createMockScraperPort } from '../components/scraper/data/mockScraperPort';
import { saveScraperSettingsDocument, loadScraperSettingsDocument } from '../scraperSettingsStore';
import { patchScraperProfile } from '../../shared/scraperSettings';
import { SCRAPER_METHODS } from '../../shared/scraperIpc';
import {
  createDefaultConnectionProfilesDocument,
  type ConnectionProfilesDocument,
} from '../../shared/connectionProfiles';
import { saveConnectionProfilesDocument } from '../connectionProfilesStore';
import type { ScraperSourceEntry } from '../../shared/scraperSourceSettings';
import type { TorrentRow } from '../../shared/scraperResults';

type Api = Record<string, (...args: unknown[]) => unknown>;

function install(api: Api): void {
  (window as unknown as { api: Api }).api = {
    scraperCapabilities: async () => [...SCRAPER_METHODS],
    ...api,
  };
}

function source(id: string, over: Partial<ScraperSourceEntry> = {}): ScraperSourceEntry {
  return {
    id,
    label: id,
    host: `${id}.example`,
    kind: 'torrent',
    enabled: true,
    priority: 1,
    fallbackIds: [],
    verifiedSiteId: '',
    requiresAuth: false,
    supportsSubtitles: true,
    health: 'unknown',
    lastCheckedAt: null,
    notes: '',
    ...over,
  };
}

const ROW: TorrentRow = {
  id: 'r1', infoHash: 'aa11', name: 'Show - 01', releaseGroup: 'G', resolution: '1080p',
  seeders: 5, leechers: 0, availability: 1, tracker: 'nyaa', sizeBytes: 1, ageDays: 0,
  fileCount: 1, subtitleLanguages: [], isBatch: false, magnet: 'magnet:?xt=urn:btih:aa11',
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  delete (window as unknown as { api?: Api }).api;
});

describe('a live call that fails', () => {
  it('rejects and is reported — it is never answered with sample data', async () => {
    const onError = vi.fn();
    install({ scraperQbitSend: async () => { throw new Error('ECONNREFUSED 127.0.0.1:8080'); } });
    const port = createIpcScraperPort(createMockScraperPort(), { onError });

    await expect(
      port.qbitSend([ROW], { ...loadScraperSettingsDocument().profiles[0].settings.qbittorrent, enabled: true }),
    ).rejects.toThrow('ECONNREFUSED');
    expect(onError).toHaveBeenCalledWith('qbitSend', expect.any(Error));
  });

  it('surfaces a capability failure instead of treating the backend as absent', async () => {
    const onError = vi.fn();
    install({
      scraperCapabilities: async () => { throw new Error('bridge down'); },
      scraperListDownloads: async () => [],
    });
    const port = createIpcScraperPort(createMockScraperPort(), { onError });
    await expect(port.listDownloads()).rejects.toThrow('bridge down');
    expect(onError).toHaveBeenCalledWith('listDownloads', expect.any(Error));
  });

  it('asks for capabilities again after a failed fetch', async () => {
    let calls = 0;
    install({
      scraperCapabilities: async () => {
        calls += 1;
        if (calls === 1) throw new Error('not yet');
        return [...SCRAPER_METHODS];
      },
      scraperListDownloads: async () => [],
    });
    const port = createIpcScraperPort(createMockScraperPort());
    await expect(port.listDownloads()).rejects.toThrow('not yet');
    await expect(port.listDownloads()).resolves.toEqual([]);
  });

  it('does not report an absent stored result as a failure', async () => {
    const onError = vi.fn();
    install({ scraperGetResult: async () => null });
    const port = createIpcScraperPort(createMockScraperPort(), { onError });
    await expect(port.getResult('job-x')).rejects.toBeInstanceOf(ScraperResultMissingError);
    expect(onError).not.toHaveBeenCalled();
  });

  it('still uses sample data when there is no backend at all', async () => {
    const port = createIpcScraperPort(createMockScraperPort());
    const report = await port.qbitAction('pause', ['aa11']);
    // The sample port says plainly that nothing was paused.
    expect(report.ok).toBe(false);
    expect(report.failures[0].reason).toMatch(/sample data/i);
  });
});

describe('transfer actions and free space', () => {
  it('sends the action, the hashes and the active qBittorrent profile', async () => {
    const seen: unknown[] = [];
    install({ scraperQbitAction: async (input: unknown) => { seen.push(input); return { ok: true, done: 1, failures: [] }; } });
    const port = createIpcScraperPort(createMockScraperPort());
    await port.qbitAction('pause', ['aa11']);
    expect(seen[0]).toMatchObject({ action: 'pause', hashes: ['aa11'], deleteFiles: false });
    expect((seen[0] as { config: unknown }).config).toEqual(
      loadScraperSettingsDocument().profiles[0].settings.qbittorrent,
    );
  });

  it('keeps files on remove unless deleting them was chosen', async () => {
    const seen: { deleteFiles?: boolean }[] = [];
    install({ scraperQbitAction: async (input: { deleteFiles?: boolean }) => { seen.push(input); return { ok: true, done: 1, failures: [] }; } });
    const port = createIpcScraperPort(createMockScraperPort());
    await port.qbitAction('delete', ['aa11']);
    await port.qbitAction('delete', ['aa11'], {});
    await port.qbitAction('delete', ['aa11'], { deleteFiles: true });
    expect(seen.map((input) => input.deleteFiles)).toEqual([false, false, true]);
  });

  it('asks main for free space with the qBittorrent profile', async () => {
    const seen: unknown[] = [];
    install({ scraperFreeSpace: async (input: unknown) => { seen.push(input); return { bytes: 42, source: 'qbittorrent', path: 'D:\\' }; } });
    const port = createIpcScraperPort(createMockScraperPort());
    await expect(port.freeSpace()).resolves.toEqual({ bytes: 42, source: 'qbittorrent', path: 'D:\\' });
    expect(seen[0]).toHaveProperty('config');
  });
});

describe('source priority and connection profiles reach the request', () => {
  it('sends torrent indexes in Source Manager order, with the pool for fallbacks', async () => {
    const doc = loadScraperSettingsDocument();
    saveScraperSettingsDocument(patchScraperProfile(doc, doc.activeProfileId, {
      sources: {
        entries: [source('a'), source('b'), source('c', { enabled: false })],
        order: ['b', 'a', 'c'],
        maxFallbackDepth: 2,
      },
    }));
    const seen: { indexers: ScraperSourceEntry[]; pool?: ScraperSourceEntry[]; maxFallbackDepth?: number }[] = [];
    install({ scraperSearchTorrents: async (input: never) => { seen.push(input); return []; } });
    const port = createIpcScraperPort(createMockScraperPort());
    await port.searchTorrents({ text: 'frieren' });
    expect(seen[0].indexers.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(seen[0].pool?.map((entry) => entry.id).sort()).toEqual(['a', 'b', 'c']);
    expect(seen[0].maxFallbackDepth).toBe(2);
  });

  it('layers the active connection profile over a scrape and names assigned hosts', async () => {
    const connections: ConnectionProfilesDocument = {
      ...createDefaultConnectionProfilesDocument(),
      activeProfileId: 'conservative',
      siteAssignments: { 'nyaa.si': 'fast' },
    };
    saveConnectionProfilesDocument(connections);
    const seen: { settings: { network: { concurrentRequests: number } }; context?: { hosts?: Record<string, { network: { concurrentRequests: number } }> } }[] = [];
    install({ scraperStartScrape: async (input: never) => { seen.push(input); return 'job-1'; } });
    const port = createIpcScraperPort(createMockScraperPort());
    await port.startScrape({ targetUrl: 'Frieren', profileId: 'balanced', sourceId: '' });
    // Conservative says one request at a time; Fast says eight.
    expect(seen[0].settings.network.concurrentRequests).toBe(1);
    expect(seen[0].context?.hosts?.['nyaa.si']?.network.concurrentRequests).toBe(8);
  });
});
