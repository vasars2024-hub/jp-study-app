// The Downloads page's data.
//
// The scraper does not fetch media itself — what it does is hand magnets to the
// user's torrent client. So "downloads" means the transfers that client is
// running, projected onto the row shape the page renders. When qBittorrent is
// switched off or unreachable the honest answer is an empty list, not a set of
// invented rows.

import fsp from 'node:fs/promises';
import { app } from 'electron';
import type { DownloadRow, QbitTransferRow } from '../../shared/scraperResults';
import type { ScraperFreeSpaceReport, ScraperQbitInput } from '../../shared/scraperIpc';
import { qbitDefaultSavePath, qbitFreeSpace, qbitTransfers } from './qbittorrent';

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
    contentPath: transfer.contentPath || undefined,
    error: transfer.state === 'error' ? 'qBittorrent reported an error for this transfer.' : '',
  };
}

export async function listDownloads(input: ScraperQbitInput): Promise<DownloadRow[]> {
  if (!input?.config?.enabled) return [];
  const transfers = await qbitTransfers(input);
  return transfers.map(toDownloadRow);
}

/** Free bytes on the volume holding `dir`, or null when it cannot be read. */
export async function freeBytesAt(dir: string): Promise<number | null> {
  if (!dir) return null;
  try {
    const stats = await fsp.statfs(dir);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return Number.isFinite(free) && free >= 0 ? free : null;
  } catch {
    return null;
  }
}

/**
 * The Downloads page's storage line, measured rather than written down.
 *
 * With qBittorrent on, the client is asked for the free space at its own save
 * path — it is where the bytes will land, and it may be another machine. When
 * it cannot answer, its save path is measured locally if it exists here; with
 * qBittorrent off, the user's Downloads folder is. Nothing measurable is
 * reported as `null`, never as a number.
 */
export async function downloadsFreeSpace(input: ScraperQbitInput): Promise<ScraperFreeSpaceReport> {
  if (input?.config?.enabled) {
    const [reported, savePath] = await Promise.all([
      qbitFreeSpace(input),
      qbitDefaultSavePath(input),
    ]);
    const path = savePath.ok ? savePath.value : '';
    if (reported.ok) return { bytes: reported.value, source: 'qbittorrent', path };
    const local = await freeBytesAt(path);
    if (local !== null) return { bytes: local, source: 'disk', path };
    return { bytes: null, source: 'none', path };
  }
  let dir = '';
  try {
    dir = app.getPath('downloads');
  } catch {
    dir = '';
  }
  const local = await freeBytesAt(dir);
  return local === null ? { bytes: null, source: 'none', path: dir } : { bytes: local, source: 'disk', path: dir };
}
