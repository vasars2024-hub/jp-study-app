/**
 * Seanime torrent/debrid/auto-downloader adoption boundary.
 *
 * Provider secrets and queued magnets stay in main. The renderer receives a
 * compact operational snapshot and sends stable ids back for deliberate user
 * actions.
 */

import type {
  Anime_AutoDownloaderRule,
  AutoDownloader_SimulationResult,
  Debrid_TorrentItem,
  HibikeTorrent_AnimeTorrent,
  Models_AutoDownloaderItem,
  Status,
  TorrentClient_Torrent,
} from '../../../vendor/seanime/generated/types';
import type {
  AcquisitionAction,
  AcquisitionActionResult,
  AcquisitionAutoDownloaderItem,
  AcquisitionAutoDownloaderRule,
  AcquisitionBackendSnapshot,
  AcquisitionBackendState,
  AcquisitionDebridItem,
  AcquisitionSimulationRow,
  AcquisitionSubsystemStatus,
  AcquisitionTorrentCandidate,
  AcquisitionTorrentTransfer,
} from '../../shared/acquisition';
import { seanimeApi, SeanimeUnavailableError } from '../seanime/client';
import { infoHashFromMagnet, normalizeIngestHandoff } from '../../shared/mediaIngest';
import { emitAcquisitionHandoff } from './handoffs';
import { scraperLog } from './logBus';

const STATUS_ROUTE = '/api/v1/status';
const TORRENT_LIST_ROUTE = '/api/v1/torrent-client/list';
const TORRENT_DOWNLOAD_ROUTE = '/api/v1/torrent-client/download';
const DEBRID_TORRENTS_ROUTE = '/api/v1/debrid/torrents';
const AUTO_RULES_ROUTE = '/api/v1/auto-downloader/rules';
const AUTO_ITEMS_ROUTE = '/api/v1/auto-downloader/items';
const AUTO_RUN_ROUTE = '/api/v1/auto-downloader/run';
const AUTO_SIMULATE_ROUTE = '/api/v1/auto-downloader/run/simulation';
const AUTO_RULE_MAGNET_ROUTE = '/api/v1/torrent-client/rule-magnet';
const MAX_ACTION_TORRENTS = 100;

function unavailableState(error: unknown): AcquisitionBackendState {
  if (!(error instanceof SeanimeUnavailableError)) return 'error';
  return /disabled/i.test(error.message) ? 'disabled' : 'offline';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function subsystem(
  state: AcquisitionBackendState,
  message: string,
): AcquisitionSubsystemStatus {
  return { state, message };
}

function torrentTransfer(row: TorrentClient_Torrent): AcquisitionTorrentTransfer {
  return {
    id: row.hash,
    name: row.name,
    state: row.status,
    progress: Math.max(0, Math.min(100, row.progress)),
    size: row.size,
    eta: row.eta,
    downSpeed: row.downSpeed,
    upSpeed: row.upSpeed,
    seeds: row.seeds,
    peers: row.peers,
  };
}

function debridItem(row: Debrid_TorrentItem): AcquisitionDebridItem {
  return {
    id: row.id,
    name: row.name,
    state: row.status,
    progress: Math.max(0, Math.min(100, row.completionPercentage)),
    size: row.formattedSize,
    eta: row.eta,
    ready: row.isReady,
    downloadingLocally: Boolean(row.isDownloadingLocally),
  };
}

function autoRule(row: Anime_AutoDownloaderRule): AcquisitionAutoDownloaderRule {
  return {
    id: row.dbId,
    mediaId: row.mediaId,
    enabled: row.enabled,
    episodeType: row.episodeType,
    episodeNumbers: [...(row.episodeNumbers ?? [])],
    profileId: row.profileId ?? null,
  };
}

function autoItem(row: Models_AutoDownloaderItem): AcquisitionAutoDownloaderItem {
  return {
    id: row.id,
    ruleId: row.ruleId,
    mediaId: row.mediaId,
    episode: row.episode,
    torrentName: row.torrentName,
    downloaded: row.downloaded,
    delayed: row.isDelayed,
    delayUntil: row.delayUntil ?? null,
    score: row.score,
  };
}

function simulationRow(row: AutoDownloader_SimulationResult): AcquisitionSimulationRow {
  return {
    ruleId: row.ruleId,
    mediaId: row.mediaId,
    episode: row.episode,
    torrentName: row.torrentName,
    score: row.score,
    providerId: row.extensionId,
    delayed: row.isDelayed,
  };
}

function settledRows<T>(
  result: PromiseSettledResult<T[]>,
  enabled: boolean,
): { rows: T[]; status: AcquisitionSubsystemStatus } {
  if (!enabled) return { rows: [], status: subsystem('disabled', 'Disabled in Seanime.') };
  if (result.status === 'fulfilled') {
    return {
      rows: result.value,
      status: subsystem('ready', `${result.value.length} item(s).`),
    };
  }
  return { rows: [], status: subsystem('error', errorMessage(result.reason)) };
}

export async function getSeanimeAcquisitionSnapshot(): Promise<AcquisitionBackendSnapshot> {
  const refreshedAt = new Date().toISOString();
  let status: Status;
  try {
    status = await seanimeApi<Status>(STATUS_ROUTE);
  } catch (error) {
    const state = unavailableState(error);
    const message = errorMessage(error);
    return {
      backend: 'seanime',
      state,
      refreshedAt,
      message,
      torrentClient: { ...subsystem(state, message), client: '', transfers: [] },
      debrid: { ...subsystem(state, message), provider: '', items: [] },
      autoDownloader: {
        ...subsystem(state, message),
        provider: '',
        intervalMinutes: 0,
        downloadAutomatically: false,
        useDebrid: false,
        rules: [],
        queue: [],
      },
    };
  }

  const torrentClient = status.settings?.torrent?.defaultTorrentClient?.trim() ?? '';
  const torrentEnabled = Boolean(torrentClient && torrentClient !== 'none');
  const debridSettings = status.debridSettings;
  const debridEnabled = Boolean(debridSettings?.enabled);
  const autoSettings = status.settings?.autoDownloader;
  const autoEnabled = Boolean(autoSettings?.enabled);

  const [torrentResult, debridResult, rulesResult, queueResult] = await Promise.allSettled([
    torrentEnabled
      ? seanimeApi<TorrentClient_Torrent[]>(TORRENT_LIST_ROUTE)
      : Promise.resolve<TorrentClient_Torrent[]>([]),
    debridEnabled
      ? seanimeApi<Debrid_TorrentItem[]>(DEBRID_TORRENTS_ROUTE)
      : Promise.resolve<Debrid_TorrentItem[]>([]),
    autoEnabled
      ? seanimeApi<Anime_AutoDownloaderRule[]>(AUTO_RULES_ROUTE)
      : Promise.resolve<Anime_AutoDownloaderRule[]>([]),
    autoEnabled
      ? seanimeApi<Models_AutoDownloaderItem[]>(AUTO_ITEMS_ROUTE)
      : Promise.resolve<Models_AutoDownloaderItem[]>([]),
  ]);

  const torrents = settledRows(torrentResult, torrentEnabled);
  const debrid = settledRows(debridResult, debridEnabled);
  const rules = settledRows(rulesResult, autoEnabled);
  const queue = settledRows(queueResult, autoEnabled);
  const enabledStates = [
    torrentEnabled ? torrents.status.state : null,
    debridEnabled ? debrid.status.state : null,
    autoEnabled ? rules.status.state : null,
    autoEnabled ? queue.status.state : null,
  ].filter(Boolean);
  const state: AcquisitionBackendState = enabledStates.includes('error') ? 'error' : 'ready';

  return {
    backend: 'seanime',
    state,
    refreshedAt,
    message: state === 'ready'
      ? 'Seanime acquisition engines responded.'
      : 'One or more Seanime acquisition engines failed to respond.',
    torrentClient: {
      ...torrents.status,
      client: torrentClient,
      transfers: torrents.rows.map(torrentTransfer),
    },
    debrid: {
      ...debrid.status,
      provider: debridSettings?.provider ?? '',
      items: debrid.rows.map(debridItem),
    },
    autoDownloader: {
      state: rules.status.state === 'error' || queue.status.state === 'error'
        ? 'error'
        : rules.status.state,
      message: rules.status.state === 'error'
        ? rules.status.message
        : queue.status.state === 'error'
          ? queue.status.message
          : `${rules.rows.length} rule(s), ${queue.rows.length} queued item(s).`,
      provider: autoSettings?.provider ?? '',
      intervalMinutes: autoSettings?.interval ?? 0,
      downloadAutomatically: Boolean(autoSettings?.downloadAutomatically),
      useDebrid: Boolean(autoSettings?.useDebrid),
      rules: rules.rows.map(autoRule),
      queue: queue.rows.map(autoItem),
    },
  };
}

function torrentPayload(row: AcquisitionTorrentCandidate): HibikeTorrent_AnimeTorrent {
  return {
    provider: 'study-os',
    name: row.name,
    date: '',
    size: row.sizeBytes,
    formattedSize: String(row.sizeBytes),
    seeders: row.seeders,
    leechers: row.leechers,
    downloadCount: 0,
    link: row.magnet,
    downloadUrl: row.magnet,
    magnetLink: row.magnet,
    infoHash: row.infoHash,
    resolution: row.resolution,
    isBatch: row.isBatch,
    releaseGroup: row.releaseGroup,
    isBestRelease: false,
    confirmed: false,
  };
}

function actionResult(
  ok: boolean,
  message: string,
  accepted = 0,
  simulation: AcquisitionSimulationRow[] = [],
): AcquisitionActionResult {
  return { ok, message, accepted, simulation };
}

async function assertAutoDownloaderEnabled(): Promise<void> {
  const status = await seanimeApi<Status>(STATUS_ROUTE);
  if (!status.settings?.autoDownloader?.enabled) {
    throw new Error('Seanime auto-downloader is disabled.');
  }
}

export async function runSeanimeAcquisitionAction(
  action: AcquisitionAction,
): Promise<AcquisitionActionResult> {
  try {
    if (action.kind === 'run-auto-downloader') {
      await assertAutoDownloaderEnabled();
      const started = await seanimeApi<boolean>(AUTO_RUN_ROUTE, { method: 'POST' });
      const result = actionResult(Boolean(started), started
        ? 'Seanime auto-downloader started.'
        : 'Seanime did not start the auto-downloader.');
      scraperLog(result.ok ? 'info' : 'warn', 'seanime-acquisition', result.message);
      return result;
    }

    if (action.kind === 'simulate-auto-downloader') {
      await assertAutoDownloaderEnabled();
      const ruleIds = [...new Set(action.ruleIds)]
        .filter((id) => Number.isSafeInteger(id) && id > 0)
        .slice(0, 100);
      const rows = await seanimeApi<AutoDownloader_SimulationResult[]>(AUTO_SIMULATE_ROUTE, {
        method: 'POST',
        body: { ruleIds },
      });
      const simulation = rows.map(simulationRow);
      const result = actionResult(
        true,
        `Simulation found ${simulation.length} candidate(s).`,
        simulation.length,
        simulation,
      );
      scraperLog('info', 'seanime-acquisition', result.message);
      return result;
    }

    if (action.kind === 'download-queued-item') {
      if (!Number.isSafeInteger(action.itemId) || action.itemId <= 0) {
        return actionResult(false, 'Invalid queued item id.');
      }
      const items = await seanimeApi<Models_AutoDownloaderItem[]>(AUTO_ITEMS_ROUTE);
      const item = items.find((candidate) => candidate.id === action.itemId);
      if (!item) return actionResult(false, 'Queued item no longer exists.');
      if (!item.magnet) return actionResult(false, 'Queued item has no magnet.');
      const added = await seanimeApi<boolean>(AUTO_RULE_MAGNET_ROUTE, {
        method: 'POST',
        body: {
          magnetUrl: item.magnet,
          ruleId: item.ruleId,
          queuedItemId: item.id,
        },
      });
      const queuedHash = infoHashFromMagnet(item.magnet);
      if (added && queuedHash) {
        // The queued item knows exactly who it is (AniList id and episode), and
        // without a handoff its files arrived in the ingest as a bare guess.
        const episode = Number.isSafeInteger(item.episode) && item.episode > 0 ? item.episode : undefined;
        emitAcquisitionHandoff({
          target: 'seanime-torrent-client',
          rows: [{ id: `seanime-queued-${item.id}`, name: item.torrentName ?? '', infoHash: queuedHash }],
          ingest: {
            via: 'seanime-auto-downloader',
            hint: {
              provider: 'seanime',
              ...(Number.isSafeInteger(item.mediaId) && item.mediaId > 0 ? { anilistId: item.mediaId } : {}),
              ...(episode ? { episodes: [episode] } : {}),
            },
          },
        });
      }
      const result = actionResult(Boolean(added), added
        ? `Queued episode ${item.episode} sent to Seanime's torrent client.`
        : 'Seanime rejected the queued item.', added ? 1 : 0);
      scraperLog(result.ok ? 'info' : 'warn', 'seanime-acquisition', result.message);
      return result;
    }

    const wanted = new Set(action.torrentIds);
    const rows = action.torrents
      .filter((row) => wanted.has(row.id) && row.magnet.startsWith('magnet:?'))
      .slice(0, MAX_ACTION_TORRENTS);
    if (!rows.length) return actionResult(false, 'No usable selected magnets.');
    const destination = action.destination.trim().slice(0, 1_024);
    const route = action.target === 'debrid' ? DEBRID_TORRENTS_ROUTE : TORRENT_DOWNLOAD_ROUTE;
    const body = action.target === 'debrid'
      ? { torrents: rows.map(torrentPayload), destination }
      : {
          torrents: rows.map(torrentPayload),
          destination,
          smartSelect: { enabled: false, missingEpisodeNumbers: [] },
        };
    const accepted = await seanimeApi<boolean>(route, { method: 'POST', body });
    if (accepted) {
      // Recorded for the media ingest: Seanime's client may be the same
      // qBittorrent the poller watches, or the files may land in a watched
      // folder — either way the identity travels with the info hash.
      emitAcquisitionHandoff({
        target: action.target === 'debrid' ? 'seanime-debrid' : 'seanime-torrent-client',
        rows: rows.map((row) => ({
          id: row.id,
          name: row.name,
          infoHash: (row.infoHash || infoHashFromMagnet(row.magnet)).toLowerCase(),
        })),
        ingest: normalizeIngestHandoff(action.ingest) ?? { via: 'seanime' },
        destination: destination || undefined,
      });
    }
    const result = actionResult(
      Boolean(accepted),
      accepted
        ? `${rows.length} torrent(s) sent to Seanime ${action.target === 'debrid' ? 'debrid' : 'torrent client'}.`
        : 'Seanime rejected the torrent request.',
      accepted ? rows.length : 0,
    );
    scraperLog(result.ok ? 'info' : 'warn', 'seanime-acquisition', result.message);
    return result;
  } catch (error) {
    const message = errorMessage(error);
    scraperLog('error', 'seanime-acquisition', message);
    return actionResult(false, message);
  }
}
