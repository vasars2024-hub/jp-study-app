// The Downloads page's data.
//
// The scraper does not fetch media itself — what it does is hand magnets to the
// user's torrent client. So "downloads" means the transfers that client is
// running, projected onto the row shape the page renders. When qBittorrent is
// switched off or unreachable the honest answer is an empty list, not a set of
// invented rows.

import type { DownloadRow, QbitTransferRow } from '../../shared/scraperResults';
import type { ScraperQbitInput } from '../../shared/scraperIpc';
import { qbitTransfers } from './qbittorrent';

/** qBittorrent's state vocabulary, narrowed to what a download row can be. */
export function toDownloadState(state: QbitTransferRow['state']): DownloadRow['state'] {
  switch (state) {
    case 'downloading':
    case 'checking':
      return 'downloading';
    case 'seeding':
      return 'done';
    case 'paused':
      return 'paused';
    case 'error':
      return 'failed';
    case 'stalled':
    case 'queued':
    default:
      return 'queued';
  }
}

export function toDownloadRow(transfer: QbitTransferRow): DownloadRow {
  const receivedBytes = transfer.downloadedBytes
    || Math.round(transfer.sizeBytes * transfer.progress);
  // A completed transfer that is now seeding is "done" even though qBittorrent
  // keeps reporting an upload speed.
  const state = transfer.progress >= 1 ? 'done' : toDownloadState(transfer.state);
  return {
    id: transfer.hash,
    episodeId: transfer.episodeId ?? '',
    title: transfer.name,
    subtitle: [transfer.category, ...transfer.tags].filter(Boolean).join(' · '),
    state,
    receivedBytes,
    totalBytes: transfer.sizeBytes,
    speedBps: transfer.downloadSpeedBps,
    etaSec: state === 'done' ? null : transfer.etaSec,
    destination: transfer.savePath,
    error: transfer.state === 'error' ? 'qBittorrent reported an error for this transfer.' : '',
  };
}

export async function listDownloads(input: ScraperQbitInput): Promise<DownloadRow[]> {
  if (!input?.config?.enabled) return [];
  const transfers = await qbitTransfers(input);
  return transfers.map(toDownloadRow);
}
