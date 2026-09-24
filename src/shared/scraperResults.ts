// Row and event shapes the Scraper's screens render.
//
// In shared/ rather than the renderer because src/main may import shared but
// never the renderer: when a real scraping backend lands, it emits exactly
// these shapes and the UI does not change. That is the whole point of putting
// them here before the backend exists.

import type {
  AcquisitionContentType,
  AcquisitionPlayback,
} from './acquisition';
import type { ScraperQbitAuthMode } from './scraperSourceSettings';

export type ScrapeStage =
  | 'queued'
  | 'searching'
  | 'fetching'
  | 'parsing'
  | 'streams'
  | 'subtitles'
  | 'validating'
  | 'done'
  | 'failed'
  | 'cancelled';

/** Stages a job never leaves on its own — anything else is still in flight. */
export const TERMINAL_SCRAPE_STAGES: readonly ScrapeStage[] = ['done', 'failed', 'cancelled'];

export function isRunningStage(stage: ScrapeStage): boolean {
  return !TERMINAL_SCRAPE_STAGES.includes(stage);
}

export type EpisodeKind =
  | 'episode'
  | 'special'
  | 'ova'
  | 'ona'
  | 'movie'
  | 'recap'
  | 'opening'
  | 'ending'
  | 'trailer';

export type SubtitleFormat = 'srt' | 'ass' | 'ssa' | 'vtt' | 'ttml';

export interface SubtitleAvailability {
  /** ISO 639-1 where possible; the provider's own label otherwise. */
  language: string;
  format: SubtitleFormat;
  /** Baked into the media rather than a separate file. */
  embedded: boolean;
  /** 0..1 — completeness, timing sanity and encoding confidence combined. */
  quality: number;
  source: string;
}

export interface EpisodeRow {
  id: string;
  seriesId: string;
  /** Sortable, decimals allowed (12.5). */
  number: number;
  /** What the provider actually printed, e.g. "EP 01" or "第1話". */
  numberLabel: string;
  season: number;
  titleEn: string;
  titleJa: string;
  kind: EpisodeKind;
  /** 'sub' | 'dub' | 'raw' as the provider labels it. */
  audio: string;
  resolution: string;
  sourceId: string;
  sourceLabel: string;
  sizeBytes: number;
  durationSec: number;
  airDate: string | null;
  url: string;
  thumbnailUrl: string;
  subtitles: SubtitleAvailability[];
  /** Whether this row passed the active validation rules. */
  status: 'ok' | 'warning' | 'failed' | 'pending';
  statusNote: string;
}

export interface StreamRow {
  id: string;
  episodeId: string;
  sourceId: string;
  sourceLabel: string;
  resolution: string;
  codec: string;
  container: string;
  bitrateKbps: number;
  audioLanguages: string[];
  subtitleLanguages: string[];
  /** Milliseconds to first byte on the last check; 0 when never checked. */
  latencyMs: number;
  health: 'ok' | 'degraded' | 'dead' | 'unknown';
  /** Signed URLs expire; the UI warns rather than handing over a dead link. */
  expiresInSec: number | null;
  url: string;
  /** Present for streams resolved through the Phase-4 acquisition boundary. */
  playback?: AcquisitionPlayback;
}

export interface TorrentRow {
  id: string;
  infoHash: string;
  name: string;
  releaseGroup: string;
  resolution: string;
  seeders: number;
  leechers: number;
  /** Copies of the full file available across peers. */
  availability: number;
  tracker: string;
  sizeBytes: number;
  ageDays: number;
  fileCount: number;
  subtitleLanguages: string[];
  isBatch: boolean;
  magnet: string;
}

/** A transfer as qBittorrent reports it, plus what the mirror adds. */
export interface QbitTransferRow {
  hash: string;
  name: string;
  state:
    | 'downloading'
    | 'seeding'
    | 'paused'
    | 'queued'
    | 'checking'
    | 'stalled'
    | 'error';
  progress: number;
  downloadSpeedBps: number;
  uploadSpeedBps: number;
  etaSec: number | null;
  ratio: number;
  category: string;
  tags: string[];
  savePath: string;
  /**
   * The torrent's file or root folder on disk (qBittorrent 4.4+). Optional so
   * sample rows and older daemons still type-check; `''` when unknown.
   */
  contentPath?: string;
  sizeBytes: number;
  downloadedBytes: number;
  uploadedBytes: number;
  addedOn: string;
  completedOn: string | null;
  peersConnected: number;
  peersTotal: number;
  seedsConnected: number;
  seedsTotal: number;
  availability: number;
  /** 0..1 per piece, downsampled for the progress strip. */
  pieceStates: number[];
  /** Set when the scraper knows which episode this transfer is for. */
  episodeId: string | null;
}

export interface ImageRow {
  id: string;
  episodeId: string | null;
  kind: 'thumbnail' | 'poster' | 'banner' | 'still';
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
  url: string;
  sourceLabel: string;
}

export interface LogLine {
  id: string;
  /** Milliseconds since the job started, so fixtures never age. */
  offsetMs: number;
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  channel: string;
  message: string;
  /** Ties related lines, requests and saved evidence together. */
  correlationId: string;
}

export interface SeriesMetadata {
  seriesId: string;
  titleEn: string;
  titleJa: string;
  titleRomaji: string;
  synopsis: string;
  genres: string[];
  studios: string[];
  format: string;
  status: string;
  season: string;
  episodeCount: number;
  averageDurationSec: number;
  contentRating: string;
  communityRating: number;
  malId: number | null;
  aniListId: number | null;
  openingTheme: string;
  endingTheme: string;
  officialSite: string;
  /** Which provider supplied each field, so disagreements are explainable. */
  provenance: Record<string, string>;
}

/** How long one stage of a run actually took, measured at its transition. */
export interface ScrapeStageTiming {
  stage: ScrapeStage;
  ms: number;
}

export interface ScrapeJobSummary {
  id: string;
  seriesId: string;
  titleEn: string;
  titleJa: string;
  provider: string;
  profile: string;
  stage: ScrapeStage;
  /** Minutes before now — relative so a fixture list never looks stale. */
  ageMinutes: number;
  durationSec: number;
  found: number;
  failed: number;
  bytes: number;
  note: string;
  /**
   * Measured per-stage durations, in the order the run passed through them.
   *
   * Optional because jobs recorded before this existed have no timeline, and
   * because a caller must be able to tell "not measured" from "measured as
   * zero". History previously rendered a *fixed* weight table
   * (0.08/0.34/0.31/0.16/0.11 × total), so a 6 s job and a 53 s job reported
   * identical percentages and the panel presented invention as diagnosis —
   * audit F2. Absent means the breakdown is not rendered; it is never
   * back-filled.
   */
  stageTimings?: ScrapeStageTiming[];
}

export type ScrapeJobEvent =
  | { kind: 'stage'; stage: ScrapeStage }
  | { kind: 'progress'; done: number; total: number; etaSec: number }
  | { kind: 'log'; line: LogLine }
  | { kind: 'row'; row: EpisodeRow }
  | { kind: 'error'; message: string }
  | { kind: 'done'; summary: ScrapeJobSummary };

export interface ScrapeRequest {
  targetUrl: string;
  profileId: string;
  /** Defaults to anime. Manga uses the same job boundary in Phase 5. */
  contentType?: AcquisitionContentType;
  /** Empty means "use the source order from settings". */
  sourceId?: string;
}

export interface SourceStatus {
  id: string;
  label: string;
  host: string;
  kind: 'streaming' | 'torrent' | 'metadata' | 'subtitles';
  enabled: boolean;
  priority: number;
  fallbackIds: string[];
  health: 'ok' | 'degraded' | 'blocked' | 'offline' | 'unknown';
  latencyMs: number;
  supportsSubtitles: boolean;
  requiresAuth: boolean;
  /** 0..1 success rate samples, oldest first. */
  history: number[];
  /**
   * What the last probe saw beyond its health word — "Anti-bot challenge.",
   * "Authentication required.", "Rate limited." — or '' when there was
   * nothing to say. A health signal only: nothing tries to get past a
   * challenge. Absent on sample rows.
   */
  note?: string;
  /** When the last probe ran, ISO; null when never probed. */
  lastCheckedAt?: string | null;
}

export interface DownloadRow {
  id: string;
  episodeId: string;
  title: string;
  subtitle: string;
  state: 'queued' | 'downloading' | 'paused' | 'done' | 'failed';
  receivedBytes: number;
  totalBytes: number;
  speedBps: number;
  etaSec: number | null;
  destination: string;
  /**
   * The file or folder the transfer wrote, as qBittorrent reports it — what a
   * player is handed. Absent on daemons older than 4.4 and on sample rows.
   */
  contentPath?: string;
  error: string;
}

export interface ExportRecord {
  id: string;
  format: string;
  destination: string;
  records: number;
  ageMinutes: number;
  outcome: 'ok' | 'partial' | 'failed';
  note: string;
}

export interface QbitStatusReport {
  status: 'not-configured' | 'connected' | 'unauthorized' | 'unreachable' | 'unknown';
  version: string;
  message: string;
  latencyMs: number;
  /**
   * qBittorrent's own `connection_status` — `connected`, `firewalled` or
   * `disconnected` — and `''` when it could not be read.
   *
   * Separate from `status` because they answer different questions: `status` is
   * about this app reaching the WebUI, and a client can answer that in 1 ms
   * while being unable to reach a single peer. Optional so every existing
   * producer and stored report stays valid.
   */
  connection?: string;
  /**
   * Which credential the test actually used — `MAIN_V1_COMPLETION_PLAN.md`
   * Phase 9.0, "a user can tell a working key from a working password".
   *
   * Present on every outcome, not only success, because the failures are where
   * it decides what the user does next: with both a password and a key stored,
   * "unauthorized" alone sends them to change the credential that was never
   * consulted. Absent on `not-configured`, where no credential was reached, and
   * optional so every stored report from before this field stays valid.
   */
  authMode?: ScraperQbitAuthMode;
}

export interface QbitSendReport {
  sent: number;
  skipped: number;
  failed: number;
  details: { name: string; outcome: 'sent' | 'skipped' | 'failed'; reason: string }[];
}

export interface SystemStats {
  memoryMb: number;
  cpuPercent: number;
  activeJobs: number;
}

/** Everything one finished job produced. */
export interface ScrapeResult {
  jobId: string;
  seriesId: string;
  episodes: EpisodeRow[];
  streams: StreamRow[];
  torrents: TorrentRow[];
  images: ImageRow[];
  metadata: SeriesMetadata;
  logs: LogLine[];
}

/**
 * Best subtitle line for a row, in the language order the user prefers.
 * Shared so the table badge and the export column cannot disagree.
 */
export function bestSubtitle(
  subtitles: SubtitleAvailability[],
  languagePriority: string[],
): SubtitleAvailability | null {
  if (!subtitles.length) return null;
  for (const lang of languagePriority) {
    const match = subtitles
      .filter((s) => s.language === lang)
      .sort((a, b) => b.quality - a.quality)[0];
    if (match) return match;
  }
  return [...subtitles].sort((a, b) => b.quality - a.quality)[0] ?? null;
}
