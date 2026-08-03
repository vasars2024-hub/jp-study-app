// The seam between the Scraper's UI and whatever actually does the scraping.
//
// Today the only implementation is the mock next door. That is deliberate: the
// UI is being built first, and the fastest way to end up with a UI that cannot
// be wired to a real backend is to let screens reach for data however they
// like. Every screen goes through this interface, so swapping in an IPC-backed
// implementation is one line in ScraperApp:
//
//   const port = settings.developer.mockMode
//     ? createMockScraperPort()
//     : createIpcScraperPort();
//
// Methods return promises and subscriptions return an unsubscribe function —
// the same shape the preload bridge already uses elsewhere in this app.

import { createContext, useContext } from 'react';
import type {
  DownloadRow,
  ExportRecord,
  LogLine,
  QbitSendReport,
  QbitStatusReport,
  ScrapeJobEvent,
  ScrapeJobSummary,
  ScrapeRequest,
  ScrapeResult,
  SourceStatus,
  SystemStats,
  TorrentRow,
} from '../../../../shared/scraperResults';
import type { ScraperQbittorrentSettings } from '../../../../shared/scraperSourceSettings';
import type { ScraperSchedulerSettings } from '../../../../shared/scraperOutputSettings';
import type { ScraperSchedulerState } from '../../../../shared/scraperIpc';
import type {
  AcquisitionAction,
  AcquisitionActionResult,
  AcquisitionBackendSnapshot,
  AcquisitionProviderInventory,
} from '../../../../shared/acquisition';

export interface TorrentQuery {
  text: string;
  minSeeders?: number;
  resolution?: string;
  releaseGroup?: string;
}

export interface SelectorMatch {
  index: number;
  /** A readable path to the matched element, e.g. `div.list > li:nth-child(2)`. */
  path: string;
  text: string;
  attributes: Record<string, string>;
}

export interface HttpProbeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
}

export interface HttpProbeResult {
  status: number;
  statusText: string;
  /** Redaction has already happened — this is safe to display. */
  headers: Record<string, string>;
  body: string;
  timingMs: { dns: number; connect: number; tls: number; ttfb: number; total: number };
  sizeBytes: number;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  publisher: string;
  enabled: boolean;
  compatible: boolean;
  updateAvailable: string;
  permissions: string[];
  description: string;
}

export interface ExportWriteRequest {
  /** The job the rows came from; '' when they came from sample data. */
  jobId: string;
  format: string;
  /** Formatted bytes, produced by `data/exportBuilder.ts`. */
  content: string;
  /** Suggested file name, with extension. Sanitised before use. */
  defaultName: string;
  recordCount: number;
  openAfter?: boolean;
}

export interface ScraperPort {
  startScrape(request: ScrapeRequest): Promise<string>;
  cancelScrape(jobId: string): Promise<void>;
  subscribeJob(jobId: string, listener: (event: ScrapeJobEvent) => void): () => void;
  listJobs(): Promise<ScrapeJobSummary[]>;
  getResult(jobId: string): Promise<ScrapeResult>;

  listSources(): Promise<SourceStatus[]>;
  listAcquisitionProviders(): Promise<AcquisitionProviderInventory>;
  getAcquisitionSnapshot(): Promise<AcquisitionBackendSnapshot>;
  runAcquisitionAction(action: AcquisitionAction): Promise<AcquisitionActionResult>;
  probeSource(id: string): Promise<SourceStatus>;

  searchTorrents(query: TorrentQuery): Promise<TorrentRow[]>;
  qbitTest(config: ScraperQbittorrentSettings): Promise<QbitStatusReport>;
  qbitTransfers(): Promise<QbitTransfersResult>;
  qbitSend(rows: TorrentRow[], config: ScraperQbittorrentSettings): Promise<QbitSendReport>;

  listDownloads(): Promise<DownloadRow[]>;
  listExports(): Promise<ExportRecord[]>;
  /**
   * Writes an already-built export to a file the user picks.
   *
   * Resolves to null when they cancel — a cancelled save is not a failed export
   * and must not be recorded as one.
   */
  writeExport(request: ExportWriteRequest): Promise<ExportRecord | null>;

  listPlugins(): Promise<PluginInfo[]>;

  /**
   * Hands the scheduler configuration to whatever actually owns the clock, and
   * gets back the real per-entry run record. Called on every settings change.
   */
  syncScheduler(scheduler: ScraperSchedulerSettings): Promise<ScraperSchedulerState>;
  /** Fires one entry immediately; resolves to the job id, or null if it could not start. */
  runSchedule(entryId: string): Promise<string | null>;
  subscribeScheduler(listener: (state: ScraperSchedulerState) => void): () => void;

  testSelector(html: string, selector: string, mode: 'css' | 'xpath'): Promise<SelectorMatch[]>;
  fetchHttp(request: HttpProbeRequest): Promise<HttpProbeResult>;
  tailLogs(listener: (line: LogLine) => void): () => void;
  systemStats(): Promise<SystemStats>;

  /**
   * Which port methods main genuinely implements — the same list the IPC port
   * routes on, exposed so a screen can say whether a reading is live or came
   * from the sample-data fallback. Empty when there is no backend at all.
   */
  backendCapabilities(): Promise<readonly string[]>;
}

export type QbitTransfersResult = import('../../../../shared/scraperResults').QbitTransferRow[];

const ScraperPortContext = createContext<ScraperPort | null>(null);

export const ScraperPortProvider = ScraperPortContext.Provider;

export function useScraperPort(): ScraperPort {
  const port = useContext(ScraperPortContext);
  if (!port) throw new Error('useScraperPort() must be called inside <ScraperPortProvider>.');
  return port;
}
