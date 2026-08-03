// Scraper backend — IPC registration.
//
// One handler per port method, and a capability list that says which of them
// are genuinely implemented. The renderer keeps sample data for everything
// else, so this file can grow one feature at a time without the UI ever
// showing an error where a table used to be.
//
// Adding a backend is two edits: implement it in a sibling module, then add its
// method id to CAPABILITIES.

import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import {
  SCRAPER_CHANNELS,
  type ScraperCredentialResult,
  type ScraperHttpProbeRequest,
  type ScraperHttpProbeResult,
  type ScraperJobEventEnvelope,
  type ScraperMethod,
  type ScraperPluginInfo,
  type ScraperProbeInput,
  type ScraperQbitInput,
  type ScraperQbitSendInput,
  type ScraperSchedulerState,
  type ScraperSchedulerSyncInput,
  type ScraperStartInput,
  type ScraperTorrentSearchInput,
} from '../../shared/scraperIpc';
import type {
  DownloadRow,
  ExportRecord,
  QbitSendReport,
  QbitStatusReport,
  QbitTransferRow,
  ScrapeJobSummary,
  ScrapeResult,
  SourceStatus,
  SystemStats,
  TorrentRow,
} from '../../shared/scraperResults';
import type { ScraperSourceEntry } from '../../shared/scraperSourceSettings';
import type {
  AcquisitionAction,
  AcquisitionActionResult,
  AcquisitionBackendSnapshot,
  AcquisitionProviderInventory,
} from '../../shared/acquisition';
import type { MalUnitsInput, MalUnitsResult } from '../../shared/malDownload';
import { listMalUnits } from './malUnits';
import { clearScraperSecret, hasScraperSecret, setScraperSecret } from './credentials';
import {
  activeJobCount,
  cancelScrape,
  jobResult,
  jobSummaries,
  setJobFailedHook,
  setJobFinishedHook,
  startScrape,
  type JobEmitter,
} from './engine';
import { noticesForFinishedJob } from '../../shared/scraperNotices';
import { notifyScraper, setScraperNoticeSink } from './notifications';
import { previousEpisodeIds, recordJob, storedResult, storedSummaries } from './history';
import { listDownloads } from './downloads';
import { listExports, writeExport, type WriteExportRequest } from './exports';
import { listPlugins } from './plugins';
import { qbitSend, qbitTest, qbitTransfers } from './qbittorrent';
import { noteJobEvent, runScheduleNow, startScheduler, syncScheduler } from './scheduler';
import { probeHttp } from './http';
import { onScraperLog, recentScraperLogs, scraperLog } from './logBus';
import { listSources, probeSource } from './sources';
import { scraperSystemStats, setActiveJobCounter } from './stats';
import { searchTorrents } from './torrents';
import { listSeanimeAcquisitionProviders } from './seanimeSources';
import {
  getSeanimeAcquisitionSnapshot,
  runSeanimeAcquisitionAction,
} from './seanimeAcquisition';

/**
 * Methods with a real implementation behind them. Anything absent falls back to
 * the renderer's sample data, which is why this list must only ever grow after
 * the feature has actually been exercised.
 */
const CAPABILITIES: ScraperMethod[] = [
  'systemStats',
  'tailLogs',
  'fetchHttp',
  'listSources',
  'listAcquisitionProviders',
  'getAcquisitionSnapshot',
  'runAcquisitionAction',
  'probeSource',
  'malUnits',
  'searchTorrents',
  'qbitTest',
  'qbitTransfers',
  'qbitSend',
  'startScrape',
  'cancelScrape',
  'subscribeJob',
  'listJobs',
  'getResult',
  'listDownloads',
  'listExports',
  'writeExport',
  'listPlugins',
  'syncScheduler',
  'runSchedule',
  'subscribeScheduler',
];

/** Renderers currently tailing the log, with their unsubscribe handles. */
const logSubscribers = new Map<number, () => void>();

function unsubscribeLogs(id: number): void {
  const off = logSubscribers.get(id);
  if (off) off();
  logSubscribers.delete(id);
}

function subscribeLogs(sender: WebContents): void {
  unsubscribeLogs(sender.id);
  const off = onScraperLog((line) => {
    if (sender.isDestroyed()) {
      unsubscribeLogs(sender.id);
      return;
    }
    sender.send(SCRAPER_CHANNELS.logEvent, line);
  });
  logSubscribers.set(sender.id, off);
  sender.once('destroyed', () => unsubscribeLogs(sender.id));
}

export function registerScraperIpc(): void {
  ipcMain.handle(SCRAPER_CHANNELS.capabilities, async (): Promise<ScraperMethod[]> => [
    ...CAPABILITIES,
  ]);

  ipcMain.handle(SCRAPER_CHANNELS.systemStats, async (): Promise<SystemStats> =>
    scraperSystemStats());

  // The backlog is replayed on subscribe so a Logs tab opened mid-run is not
  // blank until the next line happens to arrive.
  ipcMain.handle(SCRAPER_CHANNELS.logsSubscribe, async (event, limit: unknown) => {
    subscribeLogs(event.sender);
    const count = typeof limit === 'number' && Number.isFinite(limit) ? limit : 200;
    return recentScraperLogs(Math.max(0, Math.min(1_000, Math.trunc(count))));
  });

  ipcMain.handle(SCRAPER_CHANNELS.logsUnsubscribe, async (event) => {
    unsubscribeLogs(event.sender.id);
  });

  ipcMain.handle(
    SCRAPER_CHANNELS.fetchHttp,
    async (_event, request: ScraperHttpProbeRequest): Promise<ScraperHttpProbeResult> =>
      probeHttp(request),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.listSources,
    async (_event, entries: ScraperSourceEntry[]): Promise<SourceStatus[]> =>
      listSources(Array.isArray(entries) ? entries : []),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.listAcquisitionProviders,
    async (): Promise<AcquisitionProviderInventory> => listSeanimeAcquisitionProviders(),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.getAcquisitionSnapshot,
    async (): Promise<AcquisitionBackendSnapshot> => getSeanimeAcquisitionSnapshot(),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.runAcquisitionAction,
    async (_event, action: AcquisitionAction): Promise<AcquisitionActionResult> =>
      runSeanimeAcquisitionAction(action),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.probeSource,
    async (_event, input: ScraperProbeInput): Promise<SourceStatus> =>
      probeSource(input.entry, input.timeoutMs),
  );

  // The download dialog's first call: what units does this catalogue entry have?
  // It throws rather than answering an empty list on a lookup failure — "we
  // could not reach the catalogue" and "this series has no episodes yet" are
  // different answers and the dialog says different things about them.
  ipcMain.handle(
    SCRAPER_CHANNELS.malUnits,
    async (_event, input: MalUnitsInput): Promise<MalUnitsResult> => listMalUnits(input),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.searchTorrents,
    async (_event, input: ScraperTorrentSearchInput): Promise<TorrentRow[]> =>
      searchTorrents(input),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.qbitTest,
    async (_event, input: ScraperQbitInput): Promise<QbitStatusReport> => qbitTest(input),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.qbitTransfers,
    async (_event, input: ScraperQbitInput): Promise<QbitTransferRow[]> => qbitTransfers(input),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.qbitSend,
    async (_event, input: ScraperQbitSendInput): Promise<QbitSendReport> => qbitSend(input),
  );

  // Secrets cross this boundary in one direction only: the renderer can store
  // one and ask whether one exists, but there is no channel that reads it back.
  ipcMain.handle(
    SCRAPER_CHANNELS.credentialSet,
    async (_event, ref: string, secret: string): Promise<ScraperCredentialResult> =>
      setScraperSecret(String(ref ?? ''), String(secret ?? '')),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.credentialHas,
    async (_event, ref: string): Promise<boolean> => hasScraperSecret(String(ref ?? '')),
  );

  ipcMain.handle(SCRAPER_CHANNELS.credentialClear, async (_event, ref: string): Promise<void> => {
    await clearScraperSecret(String(ref ?? ''));
  });

  // Job events are broadcast to every live window rather than to the starter
  // alone: a scrape started from the main window has to keep updating if the
  // Scraper is popped out into its own window mid-run.
  const emit: JobEmitter = (jobId, event) => {
    const envelope: ScraperJobEventEnvelope = { jobId, event };
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send(SCRAPER_CHANNELS.jobEvent, envelope);
    }
    noteJobEvent(jobId, event);
  };

  ipcMain.handle(
    SCRAPER_CHANNELS.startScrape,
    async (_event, input: ScraperStartInput): Promise<string> => startScrape(input, emit),
  );

  ipcMain.handle(SCRAPER_CHANNELS.cancelScrape, async (_event, jobId: string): Promise<void> => {
    cancelScrape(String(jobId ?? ''));
  });

  // History is the union of this session's jobs and what earlier sessions
  // stored, with the live copy winning so a re-run shows its fresher numbers.
  ipcMain.handle(SCRAPER_CHANNELS.listJobs, async (): Promise<ScrapeJobSummary[]> => {
    const live = jobSummaries();
    const liveIds = new Set(live.map((job) => job.id));
    const stored = (await storedSummaries()).filter((job) => !liveIds.has(job.id));
    return [...live, ...stored].sort((a, b) => a.ageMinutes - b.ageMinutes);
  });

  ipcMain.handle(
    SCRAPER_CHANNELS.getResult,
    async (_event, jobId: string): Promise<ScrapeResult | null> => {
      const id = String(jobId ?? '');
      return jobResult(id) ?? (await storedResult(id));
    },
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.listDownloads,
    async (_event, input: ScraperQbitInput): Promise<DownloadRow[]> => listDownloads(input),
  );

  ipcMain.handle(SCRAPER_CHANNELS.listExports, async (): Promise<ExportRecord[]> => listExports());

  ipcMain.handle(
    SCRAPER_CHANNELS.listPlugins,
    async (_event, enabledIds: string[]): Promise<ScraperPluginInfo[]> =>
      listPlugins(Array.isArray(enabledIds) ? enabledIds : []),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.writeExport,
    async (_event, request: WriteExportRequest): Promise<ExportRecord | null> =>
      writeExport(request),
  );

  // Scheduler state is broadcast the same way job events are, so a Scraper
  // popped into its own window still sees runs fired by the timer.
  const emitSchedulerState = (state: ScraperSchedulerState) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send(SCRAPER_CHANNELS.schedulerState, state);
    }
  };

  ipcMain.handle(
    SCRAPER_CHANNELS.schedulerSync,
    async (_event, input: ScraperSchedulerSyncInput): Promise<ScraperSchedulerState> =>
      syncScheduler(input),
  );

  ipcMain.handle(
    SCRAPER_CHANNELS.schedulerRun,
    async (_event, entryId: string): Promise<string | null> =>
      runScheduleNow(String(entryId ?? '')),
  );

  // An in-app notice goes to every live window, like job and scheduler events:
  // the Scraper may be popped out, and the run that raised it does not know.
  setScraperNoticeSink((notice) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send(SCRAPER_CHANNELS.notice, notice);
    }
  });

  setActiveJobCounter(activeJobCount);
  setJobFinishedHook(({ summary, result, settings }) => {
    void (async () => {
      // Read before recording, so "what did the last run of this series have?"
      // cannot be answered with this run's own episodes.
      const previous = await previousEpisodeIds(summary.seriesId, summary.id);
      await recordJob(summary, result);
      for (const { kind, facts } of noticesForFinishedJob(summary, result, previous)) {
        notifyScraper(kind, settings.notifications, { ...facts, correlationId: summary.id });
      }
    })();
  });
  setJobFailedHook(({ jobId, target, message, settings }) => {
    notifyScraper('error', settings.notifications, {
      subject: `${target} — ${message}`,
      count: 0,
      correlationId: jobId,
    });
  });
  startScheduler(emit, emitSchedulerState);

  scraperLog('info', 'system', 'Scraper backend ready.');
}
