// Torrent index search.
//
// This talks to public torrent *indexes* — sites that publish an RSS feed of
// torrent metadata. It reads that feed and turns it into rows. It does not
// connect to a swarm, download a piece, or resolve any media: handing a magnet
// to a torrent client is the user's explicit action on the Torrent Manager
// page, and qBittorrent is what does it.
//
// Nyaa's feed shape is the one implemented because it is what the Torrent
// Manager's columns were designed around; the parser is fed a document, not a
// URL, so a second index only needs its own URL builder.

import { DOMParser } from 'linkedom';
import type { TorrentRow } from '../../shared/scraperResults';
import type {
  ScraperSourceEntry,
  ScraperTorrentSettings,
} from '../../shared/scraperSourceSettings';
import type { ScraperTorrentQuery, ScraperTorrentSearchInput } from '../../shared/scraperIpc';
import { scraperRequest } from './http';
import { scraperLog } from './logBus';
import { fallbackChain } from '../../shared/scraperSourceOrder';

/** Trackers attached to a magnet when the feed does not carry its own. */
export const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://exodus.desync.com:6969/announce',
];

const MAX_ROWS = 300;

// ------------------------------------------------------------- parse bits ---

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1_000,
  kib: 1_024,
  mb: 1_000_000,
  mib: 1_024 * 1_024,
  gb: 1_000_000_000,
  gib: 1_024 * 1_024 * 1_024,
  tb: 1_000_000_000_000,
  tib: 1_024 ** 4,
};

/** `1.4 GiB` → bytes. Feeds mix SI and binary units, so both are handled. */
export function parseSizeBytes(text: string): number {
  const match = /([\d.]+)\s*([a-z]+)/i.exec(text ?? '');
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  const unit = SIZE_UNITS[match[2].toLowerCase()];
  if (!Number.isFinite(value) || !unit) return 0;
  return Math.round(value * unit);
}

/** `[SubsPlease] Title - 01 (1080p)` → `SubsPlease`. */
export function parseReleaseGroup(name: string): string {
  const leading = /^\s*[[(]([^\])]{1,40})[\])]/.exec(name ?? '');
  if (leading) return leading[1].trim();
  // Some groups sign at the end instead: `Title - 01 [1080p]-Group`.
  const trailing = /-\s*([A-Za-z0-9_.]{2,20})\s*$/.exec((name ?? '').replace(/\.\w{2,4}$/, ''));
  return trailing ? trailing[1].trim() : '';
}

export function parseResolution(name: string): string {
  const explicit = /\b(\d{3,4})[pP]\b/.exec(name ?? '');
  if (explicit) return `${explicit[1]}p`;
  const dimensions = /\b\d{3,4}\s*[xX×]\s*(\d{3,4})\b/.exec(name ?? '');
  if (dimensions) return `${dimensions[1]}p`;
  if (/\b(4k|uhd)\b/i.test(name ?? '')) return '2160p';
  return '';
}

/**
 * Whether one torrent covers a range of episodes rather than a single one.
 *
 * Worth getting right: a batch and a single episode are the same size class
 * only by coincidence, and `preferBatches` sorts on this.
 */
export function looksLikeBatch(name: string): boolean {
  const text = name ?? '';
  if (/\b(batch|complete|全\d+話)\b/i.test(text)) return true;
  if (/\bseason\s*\d+\b/i.test(text) && /\bcomplete\b/i.test(text)) return true;
  // An episode range: `01-12`, `01~12`, `E01-E12`. Bounded to three digits so a
  // year range or a `1920-1080` style dimension pair cannot match.
  return /\b(?:e|ep|episode)?\s?\d{1,3}\s*[-~]\s*(?:e|ep)?\s?\d{1,3}\b/i.test(text);
}

/** Language tags a release advertises, normalised to ISO 639-1 where obvious. */
export function parseSubtitleLanguages(name: string): string[] {
  const found = new Set<string>();
  const text = name ?? '';
  if (/\b(eng?(?:lish)?|eng[- ]?sub|softsub)\b/i.test(text)) found.add('en');
  if (/\b(jp|jpn|japanese|raw)\b/i.test(text)) found.add('ja');
  // `[Multiple Subtitle]` is Erai-raws' house style; `[Multi-Sub]` is everyone
  // else's. Both mean the same thing and both have to match.
  if (/\bmulti(?:ple)?[- ]?sub(?:title)?s?\b/i.test(text)) {
    found.add('en');
    found.add('ja');
  }
  if (/\b(chs|cht|chinese|中文|简体|繁體)\b/i.test(text)) found.add('zh');
  if (/\b(rus|russian|русск)/i.test(text)) found.add('ru');
  return [...found];
}

export function magnetFor(infoHash: string, name: string, trackers: string[]): string {
  if (!infoHash) return '';
  const params = [
    `magnet:?xt=urn:btih:${infoHash.toLowerCase()}`,
    `dn=${encodeURIComponent(name)}`,
    ...trackers.map((tracker) => `tr=${encodeURIComponent(tracker)}`),
  ];
  return params.join('&');
}

function textOf(item: Element, ...names: string[]): string {
  for (const name of names) {
    const direct = item.getElementsByTagName(name)[0];
    if (direct?.textContent) return direct.textContent.trim();
  }
  return '';
}

function ageDaysFrom(pubDate: string, now: number): number {
  const parsed = Date.parse(pubDate);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round((now - parsed) / 86_400_000));
}

/**
 * Turns one index feed into rows.
 *
 * `now` is a parameter rather than a `Date.now()` call so the age column is
 * testable without freezing the clock.
 */
export function parseTorrentFeed(
  xml: string,
  options: { tracker: string; trackers: string[]; now?: number },
): TorrentRow[] {
  const now = options.now ?? Date.now();
  let document: Document;
  try {
    document = new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
  } catch {
    return [];
  }
  const items = Array.from(document.querySelectorAll('item')).slice(0, MAX_ROWS);
  const rows: TorrentRow[] = [];
  for (const [index, item] of items.entries()) {
    const name = textOf(item, 'title');
    if (!name) continue;
    const infoHash = textOf(item, 'nyaa:infoHash', 'infoHash', 'torrent:infoHash').toLowerCase();
    const guid = textOf(item, 'guid') || textOf(item, 'link') || `${options.tracker}-${index}`;
    const seeders = Number.parseInt(textOf(item, 'nyaa:seeders', 'seeders') || '0', 10);
    const leechers = Number.parseInt(textOf(item, 'nyaa:leechers', 'leechers') || '0', 10);
    const downloads = Number.parseInt(textOf(item, 'nyaa:downloads', 'downloads') || '0', 10);
    const sizeBytes = parseSizeBytes(textOf(item, 'nyaa:size', 'size', 'contentLength'));
    rows.push({
      id: guid,
      infoHash,
      name,
      releaseGroup: parseReleaseGroup(name),
      resolution: parseResolution(name),
      seeders: Number.isFinite(seeders) ? seeders : 0,
      leechers: Number.isFinite(leechers) ? leechers : 0,
      // Feeds do not publish swarm availability; completed downloads is the
      // closest published proxy and is what the column is read as.
      availability: Number.isFinite(downloads) ? downloads : 0,
      tracker: options.tracker,
      sizeBytes,
      ageDays: ageDaysFrom(textOf(item, 'pubDate'), now),
      // Not published per item by these feeds. Left at 1 for a single release
      // and 0 for a batch, where the count is genuinely unknown.
      fileCount: looksLikeBatch(name) ? 0 : 1,
      subtitleLanguages: parseSubtitleLanguages(name),
      isBatch: looksLikeBatch(name),
      magnet: magnetFor(infoHash, name, options.trackers),
    });
  }
  return rows;
}

// ---------------------------------------------------------------- filtering ---

/**
 * Applies the user's torrent preferences.
 *
 * Split out from the fetch so the whole preference model is testable without a
 * network, and so a second index gets the same treatment for free.
 */
export function applyTorrentPreferences(
  rows: TorrentRow[],
  settings: ScraperTorrentSettings,
  query: ScraperTorrentQuery,
): TorrentRow[] {
  const blocked = new Set(settings.blockedReleaseGroups.map((g) => g.toLowerCase()));
  const preferred = new Set(settings.preferredReleaseGroups.map((g) => g.toLowerCase()));
  const minSeeders = query.minSeeders ?? settings.minSeeders;
  const maxBytes = settings.maxSizeMb > 0 ? settings.maxSizeMb * 1_024 * 1_024 : Infinity;

  let out = rows.filter((row) => {
    if (row.seeders < minSeeders) return false;
    if (row.sizeBytes > maxBytes) return false;
    if (blocked.has(row.releaseGroup.toLowerCase())) return false;
    if (query.resolution && row.resolution !== query.resolution) return false;
    if (
      query.releaseGroup
      && row.releaseGroup.toLowerCase() !== query.releaseGroup.toLowerCase()
    ) {
      return false;
    }
    if (settings.requireSubtitles && row.subtitleLanguages.length === 0) return false;
    if (settings.subtitleLanguages.length && settings.requireSubtitles) {
      const wanted = settings.subtitleLanguages;
      if (!row.subtitleLanguages.some((lang) => wanted.includes(lang))) return false;
    }
    return true;
  });

  if (settings.dedupeByInfoHash) {
    const seen = new Set<string>();
    out = out.filter((row) => {
      // A row with no hash cannot be deduped against anything; keeping it is
      // better than collapsing every hashless row into one.
      if (!row.infoHash) return true;
      if (seen.has(row.infoHash)) return false;
      seen.add(row.infoHash);
      return true;
    });
  }

  const resolutionRank = (row: TorrentRow): number => {
    const height = Number.parseInt(row.resolution, 10);
    const index = settings.resolutionPriority.indexOf(height);
    return index === -1 ? settings.resolutionPriority.length : index;
  };

  return [...out].sort((a, b) => {
    if (settings.preferBatches && a.isBatch !== b.isBatch) return a.isBatch ? -1 : 1;
    const aPreferred = preferred.has(a.releaseGroup.toLowerCase());
    const bPreferred = preferred.has(b.releaseGroup.toLowerCase());
    if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    const rank = resolutionRank(a) - resolutionRank(b);
    if (rank !== 0) return rank;
    return b.seeders - a.seeders;
  });
}

// ------------------------------------------------------------------ search ---

/** Nyaa's RSS endpoint, sorted so the best-seeded releases arrive first. */
export function buildIndexUrl(host: string, query: ScraperTorrentQuery): string {
  const params = new URLSearchParams({
    page: 'rss',
    q: query.text.trim(),
    // 1_0 is the whole Anime tree, and is the default because that is what the
    // scrape pipeline asks for. Manga passes `3_0` (Literature) instead —
    // without it a manga search comes back full of .mkv files, since a series
    // is named the same in both trees.
    c: query.category?.trim() || '1_0',
    f: '0',
    s: 'seeders',
    o: 'desc',
  });
  return `https://${host}/?${params.toString()}`;
}

/** One index's answer: its rows, or null when it could not be searched. */
async function queryIndex(
  entry: ScraperSourceEntry,
  input: ScraperTorrentSearchInput,
  trackers: string[],
): Promise<TorrentRow[] | null> {
  const url = buildIndexUrl(entry.host, input.query);
  try {
    const response = await scraperRequest(url, {
      timeoutMs: input.timeoutMs,
      correlationId: 'torrents',
    });
    if (response.status !== 200) {
      scraperLog('warn', 'torrents', `${entry.label} answered ${response.status}.`, {
        correlationId: 'torrents',
      });
      return null;
    }
    const rows = parseTorrentFeed(response.body, { tracker: entry.label, trackers });
    scraperLog('info', 'torrents', `${entry.label}: ${rows.length} results.`, {
      correlationId: 'torrents',
    });
    return rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scraperLog('error', 'torrents', `${entry.label} failed: ${message}`, {
      correlationId: 'torrents',
    });
    return null;
  }
}

/**
 * Searches every enabled index at once — a search is interactive, and waiting
 * on each index in turn would multiply the wait — but keeps the Source
 * Manager's promises about order:
 *
 *   - rows are merged in priority order, so when two indexes list the same
 *     release the higher one is the copy kept, and equal-ranked rows keep that
 *     order through the preference sort;
 *   - an index that fails (no answer, or a non-200) hands over to its own
 *     `fallbackIds`, in order, up to `maxFallbackDepth` hops. A fallback that
 *     is already being searched as a primary is not asked twice, and a disabled
 *     source is never contacted.
 */
export async function searchTorrents(input: ScraperTorrentSearchInput): Promise<TorrentRow[]> {
  const indexers = input.indexers.filter(
    (entry: ScraperSourceEntry) => entry.enabled && entry.kind === 'torrent',
  );
  if (!indexers.length) {
    scraperLog('warn', 'torrents', 'No torrent index is enabled in this profile.');
    return [];
  }

  const trackers = [
    ...DEFAULT_TRACKERS,
    ...input.torrents.extraTrackers.filter((t) => t.enabled).map((t) => t.url),
  ];
  const pool = input.pool ?? [];
  const depth = Math.max(0, input.maxFallbackDepth ?? 0);
  // Shared across the parallel walks, so two failed primaries naming the same
  // fallback do not both query it.
  const tried = new Set(indexers.map((entry) => entry.id));

  const perIndex = await Promise.all(
    indexers.map(async (entry) => {
      const rows = await queryIndex(entry, input, trackers);
      if (rows) return rows;
      for (const fallback of fallbackChain(entry, pool, depth, new Set(tried))) {
        if (tried.has(fallback.id)) continue;
        tried.add(fallback.id);
        scraperLog('info', 'torrents', `${entry.label} failed; trying ${fallback.label}.`, {
          correlationId: 'torrents',
        });
        const fallbackRows = await queryIndex(fallback, input, trackers);
        if (fallbackRows) return fallbackRows;
      }
      // One dead index must not empty the table when another answered.
      return [];
    }),
  );

  const merged = applyTorrentPreferences(perIndex.flat(), input.torrents, input.query);
  scraperLog('info', 'torrents', `${merged.length} results after filters.`, {
    correlationId: 'torrents',
  });
  return merged;
}
