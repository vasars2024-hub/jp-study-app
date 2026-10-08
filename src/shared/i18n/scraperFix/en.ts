// Scraper audit fixes (2026-10) -- English source of truth.
//
// One block per work package of the scraper audit, so the packages that ran
// side by side never edited the same lines. Keys live under `scraperFix.`;
// English is the source of truth and every key exists in all four languages.
import type { Catalog } from '../core';

export const SCRAPER_FIX_EN: Catalog = {
  // ---- http (P3 / P8) ----
  'scraperDrawer.field.safety.allowPrivateNetwork.label': 'Allow Private Network',
  'scraperDrawer.field.safety.allowPrivateNetwork.hint': 'Lets crawls, source probes and the HTTP Inspector reach localhost and LAN addresses. Off refuses them; qBittorrent and Seanime are never affected.',
  // ---- subtitles (P1 / P4 / P7) ----
  // ---- qbittorrent and ingest (P5) ----
  'scraperDrawer.field.qbittorrent.pathMappings.label': 'Path Mappings',
  'scraperDrawer.field.qbittorrent.pathMappings.hint': 'For qBittorrent on another machine: the folder it reports, and the same folder as this computer sees it.',
  'scraperFix.qbit.mappings.hint': 'qBittorrent in Docker or on a NAS reports its own paths, such as /downloads. Pair each with the same folder as this computer sees it, so finished downloads can be added to the library.',
  'scraperFix.qbit.mappings.remote': 'Path in qBittorrent',
  'scraperFix.qbit.mappings.local': 'Path on this computer',
  'scraperFix.qbit.unresolved': { one: '{count} finished download could not be found on this computer yet. If qBittorrent runs on another machine, add a path mapping in its settings.', other: '{count} finished downloads could not be found on this computer yet. If qBittorrent runs on another machine, add a path mapping in its settings.' },
  // ---- engine (P4 / P6 / P8) ----
  'scraperFix.rule.nextPageSelector': 'Next page link',
  'scraperFix.rule.maxPages': 'Maximum pages',
  'scraperFix.rule.maxPagesHint': '1 reads only the first page. Pages are followed on the same site only.',
  // ---- outputs, logs, notifications, scheduler (P6 / P7) ----
  'scraperFix.notice.complete.title': 'Scrape complete',
  'scraperFix.notice.complete.body': { one: '{subject} — {count} episode.', other: '{subject} — {count} episodes.' },
  'scraperFix.notice.error.title': 'Scrape failed',
  'scraperFix.notice.error.body': '{subject}',
  'scraperFix.notice.new-episode.title': 'New episode found',
  'scraperFix.notice.new-episode.body': { one: '{subject} — {count} new episode.', other: '{subject} — {count} new episodes.' },
  'scraperFix.notice.schedule-run.title': 'Scheduled run started',
  'scraperFix.notice.schedule-run.body': '{subject}',
  'scraperFix.notice.study-ready.title': 'Subtitles ready to study',
  'scraperFix.notice.study-ready.body': { one: '{subject} — {count} episode with a subtitle track.', other: '{subject} — {count} episodes with a subtitle track.' },
  'scraperFix.notice.digest.title': { one: 'Scraper — {count} update', other: 'Scraper — {count} updates' },
  'scraperFix.notice.digest.complete': { one: '{count} scrape complete', other: '{count} scrapes complete' },
  'scraperFix.notice.digest.new-episode': '{count} series with new episodes',
  'scraperFix.notice.digest.study-ready': '{count} series ready to study',
  'scraperFix.notice.digest.schedule-run': { one: '{count} scheduled run', other: '{count} scheduled runs' },
  'scraperFix.notice.digest.error': { one: '{count} failure', other: '{count} failures' },
  // ---- ui (P9) ----
  'scraperFix.ui.stage.queued': 'Queued',
  'scraperFix.ui.stage.searching': 'Searching',
  'scraperFix.ui.stage.fetching': 'Fetching',
  'scraperFix.ui.stage.parsing': 'Extracting',
  'scraperFix.ui.stage.streams': 'Checking mirrors',
  'scraperFix.ui.stage.subtitles': 'Collecting subtitles',
  'scraperFix.ui.stage.validating': 'Validating',
  'scraperFix.ui.stage.done': 'Complete',
  'scraperFix.ui.stage.failed': 'Failed',
  'scraperFix.ui.stage.cancelled': 'Cancelled',
  'scraperFix.ui.run.failed': 'The scrape stopped: {detail}',
  'scraperFix.ui.run.cancelFailed': 'Could not cancel the scrape: {detail}',
  'scraperFix.ui.err.httpStatus': '{target} answered with HTTP {status}.',
  'scraperFix.ui.err.ruleNoMatch': 'The site rule for {host} matched nothing on {url}.',
  'scraperFix.ui.err.validationFailed': 'Episodes that failed validation: {count}.',
  'scraperFix.ui.err.nothingToSearch': 'There is nothing to search for. Enter a URL or a title.',
  'scraperFix.ui.err.noCatalogueMatch': 'Nothing in the catalogue matches "{query}".',
  'scraperFix.ui.err.contentType': 'Scraping {type} is not connected to a catalogue provider yet.',
  'scraperFix.ui.err.autoDownloaderOff': 'The Seanime auto-downloader is turned off.',
  'scraperFix.ui.err.unknown': 'Unknown error.',
  'scraperFix.ui.field.notNumber': 'Not saved: enter a number.',
  'scraperFix.ui.field.outOfRange': 'Not saved: enter a value from {min} to {max}.',
  'scraperFix.ui.dash.cancelling': 'Cancelling...',
  'scraperFix.ui.plugins.notReady': 'Plugins are not ready yet. Nothing on this page is saved or changes what the scraper runs, so its switches and buttons are turned off.',
  'scraperFix.ui.note.ruleChecks': 'Some rule checks did not pass.',
  'scraperFix.ui.note.missing': 'Missing episode numbers: {list}.',
  'scraperFix.ui.note.missingMore': 'Missing episode numbers: {list}, and {more} more.',
};
