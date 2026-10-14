// The first-use download notice (renderer/components/common/DownloadNotice.tsx)
// -- English source of truth.
//
// A lazy pack of its own: the notice loads these per language by dynamic
// import the first time it is shown, so no window pays for them at boot. Keys
// live under `downloadNotice.`; every key exists in all four languages.
//
// Two variants. `torrent` is shown before the scraper's first torrent search or
// send to qBittorrent; `youtube` before the first YouTube download. The wording
// is factual and short on purpose, and is the owner's to approve (plan D11).
import type { Catalog } from '../core';

export const DOWNLOAD_NOTICE_EN: Catalog = {
  'downloadNotice.torrent.title': 'Before you use torrents',
  'downloadNotice.torrent.ip': 'When you search torrent indexes or download through qBittorrent, trackers and other peers can see your IP address.',
  'downloadNotice.torrent.legal': 'You are responsible for making sure that what you download is legal where you live.',
  'downloadNotice.torrent.scope': 'Gum searches only the indexes you add and passes links to your own qBittorrent. It does not host any content.',
  'downloadNotice.youtube.title': 'Before you download from YouTube',
  'downloadNotice.youtube.terms': 'YouTube’s Terms of Service limit downloading. Download only videos you have the right to keep, such as your own or ones whose owner allows it.',
  'downloadNotice.youtube.copyright': 'Respect copyright: keep downloads for your own study and do not share them.',
  'downloadNotice.acknowledge': 'I understand',
  'downloadNotice.cancel': 'Not now',
  'downloadNotice.once': 'This notice is shown once.',
};
