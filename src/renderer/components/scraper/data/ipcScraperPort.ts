// The IPC-backed ScraperPort.
//
// The backend lands one method at a time, so this is not an all-or-nothing
// swap: main answers `scraperCapabilities()` with the methods it genuinely
// implements, and everything else is delegated to the sample-data port. A
// half-built backend therefore shows real data where real data exists and the
// old fixtures everywhere else, instead of an error where a table used to be.
//
// Capabilities are fetched once and cached as a promise. Every call awaits it,
// which costs one microtask after the first round-trip and means no screen has
// to know whether the answer has arrived yet.

import type { ScraperMethod, ScraperSchedulerState } from '../../../../shared/scraperIpc';
import type { LogLine } from '../../../../shared/scraperResults';
import type { ScraperSourceEntry } from '../../../../shared/scraperSourceSettings';
import { getActiveScraperSettings } from '../../../scraperSettingsStore';
import type { ScraperPort } from './scraperPort';

/** Nothing is real when the preload bridge is missing (tests, harnesses). */
const NO_CAPABILITIES: ScraperMethod[] = [];

async function fetchCapabilities(): Promise<Set<ScraperMethod>> {
  try {
    const list = await window.api?.scraperCapabilities?.();
    return new Set(Array.isArray(list) ? list : NO_CAPABILITIES);
  } catch {
    // A backend that cannot answer is treated as a backend that has nothing,
    // which is the same as running with no backend at all.
    return new Set(NO_CAPABILITIES);
  }
}

/** The active profile's sources, read fresh so a reorder takes effect at once. */
function sourceEntries(): ScraperSourceEntry[] {
  try {
    return getActiveScraperSettings().sources.entries;
  } catch {
    return [];
  }
}

export function createIpcScraperPort(fallback: ScraperPort): ScraperPort {
  let capabilities: Promise<Set<ScraperMethod>> | null = null;
  const caps = (): Promise<Set<ScraperMethod>> => {
    if (!capabilities) capabilities = fetchCapabilities();
    return capabilities;
  };

  /**
   * Runs `real` when main implements `method`, otherwise the sample-data path.
   * A real implementation that throws also falls back: a transient backend
   * failure should degrade the screen, not blank it.
   */
  const route = async <T>(
    method: ScraperMethod,
    real: () => Promise<T>,
    sample: () => Promise<T>,
  ): Promise<T> => {
    const set = await caps();
    if (!set.has(method)) return sample();
    try {
      return await real();
    } catch (error) {
      console.warn(`[scraper] ${method} failed, falling back to sample data`, error);
      return sample();
    }
  };

  return {
    ...fallback,

    // The capability list itself, which is the one answer that cannot fall back
    // to sample data: a screen asking "is this live?" needs main's own reply,
    // and "the backend could not tell me" is the same answer as "nothing".
    backendCapabilities: async (): Promise<readonly string[]> => [...(await caps())],

    // Settings live in the renderer, so the port — not main — is what turns
    // "the source called nyaa" into the entry main needs. Main stays stateless
    // about configuration, which is what keeps profiles working.
    listSources: () =>
      route(
        'listSources',
        () => window.api.scraperListSources(sourceEntries()),
        () => fallback.listSources(),
      ),

    listAcquisitionProviders: () =>
      route(
        'listAcquisitionProviders',
        () => window.api.scraperListAcquisitionProviders(),
        () => fallback.listAcquisitionProviders(),
      ),

    getAcquisitionSnapshot: () =>
      route(
        'getAcquisitionSnapshot',
        () => window.api.scraperGetAcquisitionSnapshot(),
        () => fallback.getAcquisitionSnapshot(),
      ),

    runAcquisitionAction: (action) =>
      route(
        'runAcquisitionAction',
        () => window.api.scraperRunAcquisitionAction(action),
        () => fallback.runAcquisitionAction(action),
      ),

    probeSource: (id) =>
      route(
        'probeSource',
        async () => {
          const settings = getActiveScraperSettings();
          const entry = settings.sources.entries.find((e) => e.id === id);
          if (!entry) throw new Error(`Unknown source: ${id}`);
          return window.api.scraperProbeSource({
            entry,
            timeoutMs: settings.sources.perSourceTimeoutMs,
          });
        },
        () => fallback.probeSource(id),
      ),

    listDownloads: () =>
      route(
        'listDownloads',
        () => window.api.scraperListDownloads({
          config: getActiveScraperSettings().qbittorrent,
        }),
        () => fallback.listDownloads(),
      ),

    listExports: () =>
      route(
        'listExports',
        () => window.api.scraperListExports(),
        () => fallback.listExports(),
      ),

    listPlugins: () =>
      route(
        'listPlugins',
        () => window.api.scraperListPlugins(getActiveScraperSettings().developer.pluginIds),
        () => fallback.listPlugins(),
      ),

    writeExport: (request) =>
      route(
        'writeExport',
        () => window.api.scraperWriteExport({
          ...request,
          destination: '',
          columns: [],
        }),
        () => fallback.writeExport(request),
      ),

    startScrape: (request) =>
      route(
        'startScrape',
        () => window.api.scraperStartScrape({
          request,
          settings: getActiveScraperSettings(),
        }),
        () => fallback.startScrape(request),
      ),

    cancelScrape: (jobId) =>
      route(
        'cancelScrape',
        () => window.api.scraperCancelScrape(jobId),
        () => fallback.cancelScrape(jobId),
      ),

    // Subscribing cannot await the capability list, and a job id alone does not
    // say who issued it. Both sources are attached instead: each ignores an id
    // it did not mint, so exactly one of them ever emits.
    subscribeJob(jobId, listener) {
      const offReal = window.api?.scraperOnJobEvent?.(jobId, listener);
      const offMock = fallback.subscribeJob(jobId, listener);
      return () => {
        offReal?.();
        offMock();
      };
    },

    listJobs: () =>
      route(
        'listJobs',
        () => window.api.scraperListJobs(),
        () => fallback.listJobs(),
      ),

    getResult: (jobId) =>
      route(
        'getResult',
        async () => {
          const result = await window.api.scraperGetResult(jobId);
          // Main answers null for a job it has never run — the sample result is
          // a better answer than an empty screen for a fixture-era job id.
          if (!result) throw new Error(`No stored result for ${jobId}`);
          return result;
        },
        () => fallback.getResult(jobId),
      ),

    qbitTest: (config) =>
      route(
        'qbitTest',
        () => window.api.scraperQbitTest({ config }),
        () => fallback.qbitTest(config),
      ),

    qbitTransfers: () =>
      route(
        'qbitTransfers',
        () => window.api.scraperQbitTransfers({
          config: getActiveScraperSettings().qbittorrent,
        }),
        () => fallback.qbitTransfers(),
      ),

    qbitSend: (rows, config) =>
      route(
        'qbitSend',
        () => window.api.scraperQbitSend({ rows, config }),
        () => fallback.qbitSend(rows, config),
      ),

    searchTorrents: (query) =>
      route(
        'searchTorrents',
        () => {
          const settings = getActiveScraperSettings();
          const wanted = new Set(settings.torrents.indexerIds);
          // An empty indexer list means "any torrent source in the profile",
          // which is what a freshly seeded profile looks like.
          const indexers = settings.sources.entries.filter(
            (entry) => entry.kind === 'torrent' && (!wanted.size || wanted.has(entry.id)),
          );
          return window.api.scraperSearchTorrents({
            query,
            indexers,
            torrents: settings.torrents,
            timeoutMs: settings.sources.perSourceTimeoutMs,
          });
        },
        () => fallback.searchTorrents(query),
      ),

    fetchHttp: (request) =>
      route(
        'fetchHttp',
        () => window.api.scraperFetchHttp(request),
        () => fallback.fetchHttp(request),
      ),

    systemStats: () =>
      route(
        'systemStats',
        () => window.api.scraperSystemStats(),
        () => fallback.systemStats(),
      ),

    // The scheduler runs in main so a scrape still fires with the window shut;
    // the renderer only pushes configuration down and renders what comes back.
    syncScheduler: (scheduler) =>
      route(
        'syncScheduler',
        () => window.api.scraperSyncScheduler({
          scheduler,
          settings: getActiveScraperSettings(),
        }),
        () => fallback.syncScheduler(scheduler),
      ),

    runSchedule: (entryId) =>
      route(
        'runSchedule',
        () => window.api.scraperRunSchedule(entryId),
        () => fallback.runSchedule(entryId),
      ),

    subscribeScheduler(listener: (state: ScraperSchedulerState) => void) {
      let detach: (() => void) | null = null;
      let released = false;
      void caps().then((set) => {
        if (released) return;
        detach = set.has('subscribeScheduler')
          ? window.api.scraperOnSchedulerState(listener)
          : fallback.subscribeScheduler(listener);
      });
      return () => {
        released = true;
        detach?.();
        detach = null;
      };
    },

    // Subscriptions cannot await, so this attaches whichever source is right
    // once capabilities resolve and keeps a handle the caller can release at
    // any point — including before the attach has happened.
    tailLogs(listener: (line: LogLine) => void) {
      let detach: (() => void) | null = null;
      let released = false;
      void caps().then((set) => {
        if (released) return;
        detach = set.has('tailLogs')
          ? window.api.scraperTailLogs(listener)
          : fallback.tailLogs(listener);
      });
      return () => {
        released = true;
        detach?.();
        detach = null;
      };
    },
  };
}
