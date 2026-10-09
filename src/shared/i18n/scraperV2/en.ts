// Scraper, second round (2026-10) -- English source of truth.
//
// Site-rule page failures in the job summary, and `.torrent` files sent to
// qBittorrent. Keys live under `scr2.`; every key exists in all four languages.
// (qBittorrent's new message codes are under `scraperFix.qbit.`, beside the
// existing ones, because `sxQbitMessage` resolves that prefix.)
import type { Catalog } from '../core';

export const SCRAPER_V2_EN: Catalog = {
  // ---- job note: pages after the first that could not be read ----
  'scr2.note.pagesFailed': 'Could not read {list}; the episode list may be incomplete.',
  'scr2.note.pageStatus': 'page {page} (HTTP {status})',
  'scr2.note.pageEmpty': 'page {page} (no rows)',
  'scr2.note.pageUnreachable': 'page {page} (not reachable)',
  // ---- .torrent files ----
  'scr2.torrentFile.title': 'Add .torrent files',
  'scr2.torrentFile.desc': 'Send torrent files saved on this computer to qBittorrent, with the same category, save path and options as a magnet link.',
  'scr2.torrentFile.choose': 'Choose .torrent files...',
  'scr2.torrentFile.adding': 'Adding...',
  'scr2.torrentFile.disabled': 'Turn on sending to qBittorrent in its settings first.',
  'scr2.torrentFile.result': 'Added: {sent}. Skipped: {skipped}. Failed: {failed}.',
  'scr2.torrentFile.empty': 'The file is empty or too large.',
  'scr2.torrentFile.too-large': 'The file is too large to be a .torrent.',
  'scr2.torrentFile.not-bencode': 'This is not a .torrent file.',
  'scr2.torrentFile.no-info': 'The file has no torrent metadata.',
  'scr2.torrentFile.no-name': 'The torrent names no file or folder.',
  'scr2.torrentFile.no-pieces': 'The torrent carries no piece hashes.',
  'scr2.torrentFile.duplicate': 'The same torrent was chosen twice.',
};
