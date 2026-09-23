// Acquisition handoffs — the moment a release leaves the Scraper for a client.
//
// Every route that hands torrents over (qBittorrent send, the Seanime torrent
// client, Seanime debrid) announces what it handed over here, with whatever
// identity the surface had. The media ingest ledger listens, so a finished
// download can be filed under the right show and episode without guessing it
// back out of a release name.
//
// A tiny in-process hub rather than a direct import: the send paths live in
// modules the Files census and the scraper tests load outside Electron, and
// this keeps them free of the ingest module's `app` and `ipcMain`.

import type { ScraperIngestHandoff } from '../../shared/mediaIngest';

export type AcquisitionHandoffTarget = 'qbittorrent' | 'seanime-torrent-client' | 'seanime-debrid';

export interface AcquisitionHandoffRow {
  id: string;
  name: string;
  /** Lowercase hex, or `''` when neither the row nor its magnet says. */
  infoHash: string;
}

export interface AcquisitionHandoff {
  target: AcquisitionHandoffTarget;
  /** Only the rows the client accepted. */
  rows: AcquisitionHandoffRow[];
  ingest?: ScraperIngestHandoff;
  /** Where the files were asked to go (a Seanime destination), when known. */
  destination?: string;
}

type Listener = (handoff: AcquisitionHandoff) => void;

const listeners = new Set<Listener>();

export function onAcquisitionHandoff(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitAcquisitionHandoff(handoff: AcquisitionHandoff): void {
  if (!handoff.rows.length) return;
  for (const listener of listeners) {
    try {
      listener(handoff);
    } catch {
      // A ledger that cannot record must never fail the send that just succeeded.
    }
  }
}
