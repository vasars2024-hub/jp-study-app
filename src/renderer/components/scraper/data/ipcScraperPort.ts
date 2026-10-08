// The IPC-backed ScraperPort.
//
// The backend lands one method at a time, so this is not an all-or-nothing
// swap: main answers `scraperCapabilities()` with the methods it genuinely
// implements, and anything main does not implement is delegated to the
// sample-data port. A method main DOES implement never falls back: when the
// real call throws, the error reaches the screen (through `onError` and the
// rejected promise). The old behaviour — swap in sample data on any throw — is
// how a qBittorrent send that never left the machine was reported as "sent".
//
// Capabilities are fetched once and cached as a promise. Every call awaits it,
// which costs one microtask after the first round-trip and means no screen has
// to know whether the answer has arrived yet. A failed fetch is not cached, so
// the next call asks again.

import type { ScraperMethod, ScraperSchedulerState } from '../../../../shared/scraperIpc';
import type { LogLine } from '../../../../shared/scraperResults';
import type { ScraperSourceEntry } from '../../../../shared/scraperSourceSettings';
import { enabledSourcesOfKind } from '../../../../shared/scraperSourceOrder';
import { getActiveScraperSettings } from '../../../scraperSettingsStore';
import { scraperRunScope } from '../../../scraperRunContext';
import type { ScraperPort } from './scraperPort';

/** Nothing is real when the preload bridge is missing (tests, harnesses). */
const NO_CAPABILITIES: ScraperMethod[] = [];

/** True when the preload bridge exists — the packaged or dev app, not a harness. */
function bridgePresent(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.scraperCapabilities === 'function';
}

async function fetchCapabilities(): Promise<Set<ScraperMethod>> {
  // No bridge is "no backend at all": every method is sample data, by design.
  if (!bridgePresent()) return new Set(NO_CAPABILITIES);
  const list = await window.api.scraperCapabilities();
  return new Set(Array.isArray(list) ? list : NO_CAPABILITIES);
}

/** The active profile's sources, read fresh so a reorder takes effect at once. */
function sourceEntries(): ScraperSourceEntry[] {
  try {
    return getActiveScraperSettings().sources.entries;
  } catch {
    return [];
  }
}

/**
 * Thrown for "main has no stored result for this job". A normal answer for an
 * id that was never run, so it is not reported through `onError`.
 */
export class ScraperResultMissingError extends Error {}

export interface IpcScraperPortOptions {
  /**
   * Hears every failed live call, so the app can show it. The promise still
   * rejects — this is for the user, the rejection is for the caller.
   */
  onError?: (method: ScraperMethod, error: unknown) => void;
}

export function createIpcScraperPort(
  fallback: ScraperPort,
  options: IpcScraperPortOptions = {},
): ScraperPort {
  let capabilities: Promise<Set<ScraperMethod>> | null = null;
  const caps = (): Promise<Set<ScraperMethod>> => {
    if (!capabilities) {
      capabilities = fetchCapabilities().catch((error: unknown) => {
        capabilities = null;
        throw error;
      });
    }
    return capabilities;
  };

  const report = (method: ScraperMethod, error: unknown) => {
    if (error instanceof ScraperResultMissingError) return;
    try {
      options.onError?.(method, error);
    } catch {
      /* a broken reporter must not replace the real error */
    }
  };

  /**
   * Runs `real` when main implements `method`, otherwise the sample-data path.
   *
   * A real implementation that throws is NOT swapped for sample data: the
   * error is reported and rethrown. Sample data in a live window is a lie
   * about the user's own client, library and disk.
   */
  const route = async <T>(
    method: ScraperMethod,
    real: () => Promise<T>,
    sample: () => Promise<T>,
  ): Promise<T> => {
    let set: Set<ScraperMethod>;
    try {
      set = await caps();
    } catch (error) {
      report(method, error);
      throw error;
    }
    if (!set.has(method)) return sample();
    try {
      return await real();
    } catch (error) {
      report(method, error);
      throw error;
    }
  };

  return {
    ...fallback,

    // The capability list itself. "The backend could not tell me" is answered
    // as "nothing is live", which is what a screen asking "is this live?" can
    // act on; the failure itself is reported by whichever call hit it.
    backendCapabilities: async (): Promise<readonly string[]> => {
      try {
        return [...(await caps())];
      } catch {
        return [];
      }
    },

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
            // Main refuses private addresses unless the profile allows them.
            allowPrivateNetwork: settings.safety.allowPrivateNetwork === true,
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

    // The export group decides where the save dialog opens and whether the
    // file is revealed. The columns were already applied by the builder; they
    // ride along for the record.
    writeExport: (request) =>
      route(
        'writeExport',
        () => {
          const exportSettings = getActiveScraperSettings().export;
          return window.api.scraperWriteExport({
            ...request,
            destination: exportSettings.destinationRef,
            columns: exportSettings.includeColumns,
            openAfter: request.openAfter ?? exportSettings.openAfterExport,
          });
        },
        () => fallback.writeExport(request),
      ),

    // A run carries the Connection Profiles scope and the video-server order
    // with its settings: main keeps neither document.
    startScrape: (request) =>
      route(
        'startScrape',
        () => {
          const { settings, context } = scraperRunScope(getActiveScraperSettings());
          return window.api.scraperStartScrape({ request, settings, context });
        },
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
          // Main answers null for a job it has never run. The caller decides
          // what an absent result means; sample rows are never it.
          if (!result) throw new ScraperResultMissingError(`No stored result for ${jobId}`);
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

    qbitSend: (rows, config, ingest) =>
      route(
        'qbitSend',
        () => window.api.scraperQbitSend({ rows, config, ingest }),
        () => fallback.qbitSend(rows, config),
      ),

    qbitAction: (action, hashes, actionOptions) =>
      route(
        'qbitAction',
        () => window.api.scraperQbitAction({
          config: getActiveScraperSettings().qbittorrent,
          action,
          hashes,
          // Only ever true when the caller said so: the default keeps files.
          deleteFiles: actionOptions?.deleteFiles === true,
        }),
        () => fallback.qbitAction(action, hashes, actionOptions),
      ),

    freeSpace: () =>
      route(
        'freeSpace',
        () => window.api.scraperFreeSpace({ config: getActiveScraperSettings().qbittorrent }),
        () => fallback.freeSpace(),
      ),

    searchTorrents: (query) =>
      route(
        'searchTorrents',
        () => {
          const { settings, context } = scraperRunScope(getActiveScraperSettings());
          const wanted = new Set(settings.torrents.indexerIds);
          // Priority order — the Source Manager's list, top to bottom. An empty
          // indexer list means "any torrent source in the profile", which is
          // what a freshly seeded profile looks like.
          const indexers = enabledSourcesOfKind(settings.sources, 'torrent').filter(
            (entry) => !wanted.size || wanted.has(entry.id),
          );
          return window.api.scraperSearchTorrents({
            query,
            indexers,
            torrents: settings.torrents,
            timeoutMs: settings.sources.perSourceTimeoutMs,
            pool: settings.sources.entries,
            maxFallbackDepth: settings.sources.maxFallbackDepth,
            settings,
            context,
          });
        },
        () => fallback.searchTorrents(query),
      ),

    fetchHttp: (request) =>
      route(
        'fetchHttp',
        () => window.api.scraperFetchHttp({
          ...request,
          // Main refuses private addresses unless the active profile allows them.
          allowPrivateNetwork: getActiveScraperSettings().safety.allowPrivateNetwork === true,
        }),
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
        () => {
          const { settings, context } = scraperRunScope(getActiveScraperSettings());
          return window.api.scraperSyncScheduler({ scheduler, settings, context });
        },
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
      }, (error: unknown) => report('subscribeScheduler', error));
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
      }, (error: unknown) => report('tailLogs', error));
      return () => {
        released = true;
        detach?.();
        detach = null;
      };
    },
  };
}
