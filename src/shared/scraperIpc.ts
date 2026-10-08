// The wire contract between the Scraper UI and the real scraping backend.
//
// `data/scraperPort.ts` describes *what* the UI can ask for; this file pins
// down *how* that crosses the process boundary — one channel name per method,
// plus the payload shapes that are not already in `scraperResults.ts`.
//
// It lives in shared/ because both sides import it and neither may import the
// other: src/main must never reach into src/renderer.
//
// Backends land one method at a time. `SCRAPER_CAPABILITIES` is main's honest
// answer to "which of these are actually implemented?", and the renderer port
// falls back to sample data for anything not on that list — so a half-built
// backend degrades to the old behaviour instead of throwing at the user.

import type {
  DownloadRow,
  ExportRecord,
  LogLine,
  QbitSendReport,
  QbitStatusReport,
  QbitTransferRow,
  ScrapeJobEvent,
  ScrapeJobSummary,
  ScrapeRequest,
  ScrapeResult,
  SourceStatus,
  SystemStats,
  TorrentRow,
} from './scraperResults';
import type {
  ScraperQbittorrentSettings,
  ScraperSourceEntry,
  ScraperTorrentSettings,
} from './scraperSourceSettings';
import type { ScraperSchedulerSettings } from './scraperOutputSettings';
import type { SchedulerTickDecision } from './scraperCron';
import type { ScraperSettings } from './scraperSettings';
import type {
  AcquisitionAction,
  AcquisitionActionResult,
  AcquisitionBackendSnapshot,
  AcquisitionProviderInventory,
} from './acquisition';
import type { MalUnitsInput, MalUnitsResult } from './malDownload';

/** Every method the port exposes, as a stable id used for capability checks. */
export const SCRAPER_METHODS = [
  'startScrape',
  'cancelScrape',
  'subscribeJob',
  'listJobs',
  'getResult',
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
  'qbitAction',
  'freeSpace',
  'listDownloads',
  'listExports',
  'writeExport',
  'listPlugins',
  'testSelector',
  'fetchHttp',
  'tailLogs',
  'systemStats',
  'syncScheduler',
  'runSchedule',
  'subscribeScheduler',
] as const;

export type ScraperMethod = (typeof SCRAPER_METHODS)[number];

export const SCRAPER_CHANNELS = {
  capabilities: 'scraper:capabilities',
  systemStats: 'scraper:systemStats',
  logsSubscribe: 'scraper:logs:subscribe',
  logsUnsubscribe: 'scraper:logs:unsubscribe',
  /** main → renderer, one LogLine per push. */
  logEvent: 'scraper:log',
  fetchHttp: 'scraper:fetchHttp',
  listSources: 'scraper:listSources',
  listAcquisitionProviders: 'scraper:listAcquisitionProviders',
  getAcquisitionSnapshot: 'scraper:getAcquisitionSnapshot',
  runAcquisitionAction: 'scraper:runAcquisitionAction',
  probeSource: 'scraper:probeSource',
  malUnits: 'scraper:malUnits',
  searchTorrents: 'scraper:searchTorrents',
  qbitTest: 'scraper:qbitTest',
  qbitTransfers: 'scraper:qbitTransfers',
  qbitSend: 'scraper:qbitSend',
  qbitAction: 'scraper:qbitAction',
  freeSpace: 'scraper:freeSpace',
  startScrape: 'scraper:startScrape',
  cancelScrape: 'scraper:cancelScrape',
  listJobs: 'scraper:listJobs',
  getResult: 'scraper:getResult',
  /** main → renderer, one ScrapeJobEvent per push, tagged with its job id. */
  jobEvent: 'scraper:job-event',
  listDownloads: 'scraper:listDownloads',
  listExports: 'scraper:listExports',
  listPlugins: 'scraper:listPlugins',
  writeExport: 'scraper:writeExport',
  credentialSet: 'scraper:credential:set',
  credentialHas: 'scraper:credential:has',
  credentialClear: 'scraper:credential:clear',
  schedulerSync: 'scraper:scheduler:sync',
  schedulerRun: 'scraper:scheduler:run',
  /** main → renderer, one ScraperSchedulerState per change. */
  schedulerState: 'scraper:scheduler:state',
  /**
   * main → renderer, one ScraperNotice per in-app notification.
   *
   * Push-only and unsubscribed: a notice is raised by a run, not requested by a
   * screen, so there is no invoke half and no capability id. The renderer that
   * has the Scraper mounted renders it; one that does not simply ignores it.
   */
  notice: 'scraper:notice',
} as const;

// ---------------------------------------------------------------- payloads ---

export interface ScraperHttpProbeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** Hard ceiling; main clamps it so a renderer bug cannot hang a request forever. */
  timeoutMs?: number;
  followRedirects?: boolean;
  /** The active profile's `safety.allowPrivateNetwork`. Absent: private targets are refused. */
  allowPrivateNetwork?: boolean;
}

export interface ScraperHttpProbeResult {
  status: number;
  statusText: string;
  /** Already redacted — safe to display. */
  headers: Record<string, string>;
  body: string;
  timingMs: { dns: number; connect: number; tls: number; ttfb: number; total: number };
  sizeBytes: number;
  /** Final URL after redirects; equals the request URL when none were followed. */
  finalUrl: string;
  /** Set when the body was cut off at the size cap. */
  truncated: boolean;
}

export interface ScraperTorrentQuery {
  text: string;
  minSeeders?: number;
  resolution?: string;
  releaseGroup?: string;
  /**
   * Index category, in the host's own vocabulary (Nyaa: `1_0` anime, `3_0`
   * literature). Omit for anime, which is the default. Searching a manga
   * without it returns video files, because the title is the same either way.
   */
  category?: string;
}

export interface ScraperTorrentSearchInput {
  query: ScraperTorrentQuery;
  /** Indexers to hit, in priority order. Hosts come from the source registry. */
  indexers: ScraperSourceEntry[];
  torrents: ScraperTorrentSettings;
  timeoutMs: number;
  /**
   * Every source in the profile, so a failed index's `fallbackIds` can be
   * resolved to entries. Absent means "no fallbacks".
   */
  pool?: ScraperSourceEntry[];
  /** How many fallback hops a failed index may take. Absent means none. */
  maxFallbackDepth?: number;
  /**
   * The profile's network, pacing and session settings for a search the user
   * started directly. Absent keeps the request layer's own defaults.
   */
  settings?: ScraperSettings;
  context?: ScraperRunContext;
  /** Main-process only (never crosses IPC): the job's cancel signal. */
  signal?: AbortSignal;
}

/**
 * What a run needs beyond the scraper profile: the pieces of the Connection
 * Profiles and Video Server Profiles documents that change what it does. Both
 * documents live in the renderer, so they ride along like `settings` does.
 */
export interface ScraperRunContext {
  /** Per assigned host (lowercase, no `www.`): the request groups its connection profile resolves to. */
  hosts?: Record<string, import('./connectionProfiles').ScraperHostConnection>;
  /**
   * Streaming providers in the user's preferred order, as video-server profile
   * ids, names and provider labels (lowercase). Providers not named keep the
   * sidecar's order after the named ones.
   */
  streamProviderOrder?: string[];
}

export interface ScraperProbeInput {
  entry: ScraperSourceEntry;
  timeoutMs: number;
  /**
   * Path to request on the entry's host, for a site the catalogue has no
   * probe path for (a Verified Sites entry tests its own base URL). Must start
   * with `/`; anything else is ignored.
   */
  path?: string;
  /** The active profile's `safety.allowPrivateNetwork`. Absent: private targets are refused. */
  allowPrivateNetwork?: boolean;
}

export interface ScraperSelectorMatch {
  index: number;
  path: string;
  text: string;
  attributes: Record<string, string>;
}

export interface ScraperPluginInfo {
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

/** A qBittorrent call carries its own connection settings; main stores none. */
export interface ScraperQbitInput {
  config: ScraperQbittorrentSettings;
  /**
   * Plaintext, in-memory only, for this one call. Never persisted by main.
   *
   * No renderer produces this: the drawer saves the secret to the keychain and
   * main reads it back by ref, so this is a main-process/test affordance only.
   * Wiring a real "test before saving" flow means threading the drawer's
   * in-progress secret through `ipcScraperPort.qbitTest`, which nothing does
   * today — do not read the field's existence as evidence that it happens.
   */
  password?: string;
  /** Same lifetime rules and same absent producer as `password`. Consulted only when `config.authMode` is `apiKey`. */
  apiKey?: string;
}

export interface ScraperQbitSendInput extends ScraperQbitInput {
  rows: TorrentRow[];
  /**
   * Who these releases are, from the surface that found them, plus the
   * destination it chose. Present → the torrents are tagged `gum`, their
   * identity is recorded for the media ingest, and a `savePath` turns
   * Automatic Torrent Management off so the destination is honoured.
   */
  ingest?: import('./mediaIngest').ScraperIngestHandoff;
}

/** What the Downloads page and Torrent Manager can do to a transfer. */
export const QBIT_TORRENT_ACTIONS = ['pause', 'resume', 'recheck', 'retry', 'delete'] as const;
export type ScraperQbitTorrentAction = (typeof QBIT_TORRENT_ACTIONS)[number];

export interface ScraperQbitActionInput extends ScraperQbitInput {
  action: ScraperQbitTorrentAction;
  /** Info hashes, as the transfer list reports them. */
  hashes: string[];
  /**
   * `delete` only. Never defaulted to true anywhere: removing a transfer and
   * deleting what it downloaded are different requests, and the screen asks.
   */
  deleteFiles?: boolean;
}

export interface ScraperQbitActionReport {
  /** True only when every hash was acted on. */
  ok: boolean;
  done: number;
  /** One entry per hash qBittorrent refused, with its reason. */
  failures: { hash: string; reason: string }[];
}

/**
 * Free space where downloads land.
 *
 * `bytes` is null when nothing could be measured — the page says "unknown"
 * rather than inventing a number.
 */
export interface ScraperFreeSpaceReport {
  bytes: number | null;
  /** Who measured it: the torrent client itself, or this machine's disk. */
  source: 'qbittorrent' | 'disk' | 'none';
  /** The folder measured, when known. */
  path: string;
}

/**
 * A scrape carries the profile it should run under.
 *
 * Settings live in the renderer (they are per-profile and the Settings app
 * edits the same document), so main is told what to use rather than keeping its
 * own copy — which is what makes switching profiles take effect immediately.
 */
export interface ScraperStartInput {
  request: ScrapeRequest;
  settings: ScraperSettings;
  context?: ScraperRunContext;
}

export interface ScraperJobEventEnvelope {
  jobId: string;
  event: ScrapeJobEvent;
}

/**
 * Scheduler configuration pushed down from the renderer. `settings` rides along
 * because a scheduled run has no window to ask — main must already hold
 * everything a scrape needs at the moment the timer fires.
 */
export interface ScraperSchedulerSyncInput {
  scheduler: ScraperSchedulerSettings;
  settings: ScraperSettings;
  context?: ScraperRunContext;
  /**
   * Resolved settings of every profile a schedule entry names, keyed by profile
   * id (P6). An entry runs under its own profile's settings when present here,
   * and under `settings` (the active profile) otherwise — which is also how a
   * config synced by an older build behaves.
   */
  profileSettings?: Record<string, ScraperSettings>;
}

export interface ScraperScheduleRunRecord {
  id: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  /** The job the last run produced, for linking through to History. */
  lastJobId: string | null;
}

export interface ScraperSchedulerState {
  entries: ScraperScheduleRunRecord[];
  /**
   * Why nothing is firing right now; '' means the scheduler is free to run.
   *
   * Aliased to the planner's own union rather than restated: the two drifted
   * apart the first time a hold reason was added, and a state the runner can
   * produce but the wire type cannot carry is a compile error at best.
   */
  heldBy: SchedulerTickDecision['heldBy'];
  runningJobIds: string[];
}

export interface ScraperExportInput {
  jobId: string;
  format: string;
  destination: string;
  /** Column ids to include, in order. Empty means every column. */
  columns: string[];
}

/** Shapes returned by main, restated here so the preload types stay honest. */
export interface ScraperIpcApi {
  capabilities(): Promise<ScraperMethod[]>;
  systemStats(): Promise<SystemStats>;
  fetchHttp(request: ScraperHttpProbeRequest): Promise<ScraperHttpProbeResult>;
  listSources(entries: ScraperSourceEntry[]): Promise<SourceStatus[]>;
  listAcquisitionProviders(): Promise<AcquisitionProviderInventory>;
  getAcquisitionSnapshot(): Promise<AcquisitionBackendSnapshot>;
  runAcquisitionAction(action: AcquisitionAction): Promise<AcquisitionActionResult>;
  probeSource(input: ScraperProbeInput): Promise<SourceStatus>;
  malUnits(input: MalUnitsInput): Promise<MalUnitsResult>;
  searchTorrents(input: ScraperTorrentSearchInput): Promise<TorrentRow[]>;
  qbitTest(input: ScraperQbitInput): Promise<QbitStatusReport>;
  qbitTransfers(input: ScraperQbitInput): Promise<QbitTransferRow[]>;
  qbitSend(input: ScraperQbitSendInput): Promise<QbitSendReport>;
  qbitAction(input: ScraperQbitActionInput): Promise<ScraperQbitActionReport>;
  freeSpace(input: ScraperQbitInput): Promise<ScraperFreeSpaceReport>;
  startScrape(request: ScrapeRequest): Promise<string>;
  cancelScrape(jobId: string): Promise<void>;
  listJobs(): Promise<ScrapeJobSummary[]>;
  getResult(jobId: string): Promise<ScrapeResult>;
  listDownloads(): Promise<DownloadRow[]>;
  listExports(): Promise<ExportRecord[]>;
  listPlugins(): Promise<ScraperPluginInfo[]>;
  writeExport(input: ScraperExportInput): Promise<ExportRecord>;
  syncScheduler(input: ScraperSchedulerSyncInput): Promise<ScraperSchedulerState>;
  runSchedule(entryId: string): Promise<string | null>;
}

export type ScraperLogListener = (line: LogLine) => void;

/** Result of storing a secret. `ref` is what settings should keep. */
export interface ScraperCredentialResult {
  ok: boolean;
  ref: string;
  message: string;
}
