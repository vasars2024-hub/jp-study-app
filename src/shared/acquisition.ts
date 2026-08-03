/**
 * Shared acquisition contracts.
 *
 * Phase 4 makes the Scraper a coordinator over multiple backends instead of an
 * anime-only page reader. These types deliberately describe the result, not a
 * particular provider API, so Seanime extensions, torrent/debrid clients and a
 * later manga source can meet at the same boundary.
 */

export const ACQUISITION_CONTENT_TYPES = ['anime', 'manga'] as const;
export type AcquisitionContentType = (typeof ACQUISITION_CONTENT_TYPES)[number];

export type AcquisitionProviderKind =
  | 'catalogue'
  | 'online-stream'
  | 'torrent'
  | 'debrid'
  | 'manga-source'
  | 'local';

export interface AcquisitionIdentity {
  contentType: AcquisitionContentType;
  /** Study OS identity. It remains stable when a provider is replaced. */
  workId: string;
  aniListId: number | null;
  malId: number | null;
}

export interface AcquisitionProvider {
  id: string;
  label: string;
  kind: AcquisitionProviderKind;
  language: string;
  capabilities: Array<'search' | 'episodes' | 'streams' | 'download'>;
  supportsDub?: boolean;
  servers?: string[];
}

export interface AcquisitionProviderInventory {
  backend: 'seanime';
  state: 'ready' | 'disabled' | 'offline' | 'error';
  providers: AcquisitionProvider[];
  message: string;
}

export type AcquisitionBackendState = 'ready' | 'disabled' | 'offline' | 'error';

export interface AcquisitionSubsystemStatus {
  state: AcquisitionBackendState;
  message: string;
}

export interface AcquisitionTorrentTransfer {
  id: string;
  name: string;
  state: string;
  progress: number;
  size: string;
  eta: string;
  downSpeed: string;
  upSpeed: string;
  seeds: number;
  peers: number;
}

export interface AcquisitionDebridItem {
  id: string;
  name: string;
  state: string;
  progress: number;
  size: string;
  eta: string;
  ready: boolean;
  downloadingLocally: boolean;
}

export interface AcquisitionAutoDownloaderRule {
  id: number;
  mediaId: number;
  enabled: boolean;
  episodeType: 'recent' | 'selected';
  episodeNumbers: number[];
  profileId: number | null;
}

export interface AcquisitionAutoDownloaderItem {
  id: number;
  ruleId: number;
  mediaId: number;
  episode: number;
  torrentName: string;
  downloaded: boolean;
  delayed: boolean;
  delayUntil: string | null;
  score: number;
}

/**
 * Read-only, secret-free view of Seanime's acquisition engines.
 *
 * API keys, magnets, signed links and local destination paths deliberately do
 * not cross into the renderer. Mutations identify rows by their stable ids and
 * main refetches any sensitive material immediately before using it.
 */
export interface AcquisitionBackendSnapshot {
  backend: 'seanime';
  state: AcquisitionBackendState;
  refreshedAt: string;
  message: string;
  torrentClient: AcquisitionSubsystemStatus & {
    client: string;
    transfers: AcquisitionTorrentTransfer[];
  };
  debrid: AcquisitionSubsystemStatus & {
    provider: string;
    items: AcquisitionDebridItem[];
  };
  autoDownloader: AcquisitionSubsystemStatus & {
    provider: string;
    intervalMinutes: number;
    downloadAutomatically: boolean;
    useDebrid: boolean;
    rules: AcquisitionAutoDownloaderRule[];
    queue: AcquisitionAutoDownloaderItem[];
  };
}

export interface AcquisitionSimulationRow {
  ruleId: number;
  mediaId: number;
  episode: number;
  torrentName: string;
  score: number;
  providerId: string;
  delayed: boolean;
}

/**
 * What a backend needs to accept a torrent, and nothing more.
 *
 * Declared here rather than reusing the Scraper's `TorrentRow`: this module is
 * the content-neutral base that `scraperResults.ts` imports, so pointing back
 * at it closed an import cycle inside `src/shared` (caught by
 * `architectureBaseline.test.ts`, which holds that count at zero). `TorrentRow`
 * satisfies this structurally, so callers still pass their rows unchanged.
 */
export interface AcquisitionTorrentCandidate {
  id: string;
  name: string;
  magnet: string;
  infoHash: string;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  resolution: string;
  releaseGroup: string;
  isBatch: boolean;
}

export type AcquisitionAction =
  | { kind: 'run-auto-downloader' }
  | { kind: 'simulate-auto-downloader'; ruleIds: number[] }
  | { kind: 'download-queued-item'; itemId: number }
  | {
      kind: 'send-torrents';
      target: 'torrent-client' | 'debrid';
      torrentIds: string[];
      destination: string;
      torrents: AcquisitionTorrentCandidate[];
    };

export interface AcquisitionActionResult {
  ok: boolean;
  message: string;
  accepted: number;
  simulation: AcquisitionSimulationRow[];
}

/**
 * Everything a player needs to open a provider result.
 *
 * Request headers are part of the stream identity: many extension-backed URLs
 * reject a request without their Referer/User-Agent pair. Keeping only `url`
 * would make the Scraper appear to find streams that no player can actually use.
 */
export interface AcquisitionPlayback {
  providerId: string;
  providerLabel: string;
  server: string;
  kind: 'mp4' | 'hls' | 'unknown';
  url: string;
  headers: Record<string, string>;
  subtitles: Array<{
    url: string;
    language: string;
    default: boolean;
  }>;
  dubbed: boolean;
  /**
   * Persisted history deliberately clears provider URLs and headers. A true
   * value tells the caller to resolve this episode again before playback.
   */
  refreshRequired?: boolean;
}
