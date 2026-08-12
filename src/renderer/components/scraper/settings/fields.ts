// The Advanced Settings drawer, as data.
//
// Twenty groups of controls is a lot of JSX to hand-write, and hand-written
// panels drift: one group gets a hint, the next doesn't; one clamps, the next
// doesn't. So the drawer is declared here and rendered generically. That buys
// three things for free — a consistent row treatment, a search index over every
// field, and validation bounds that come from the same numbers the settings
// model clamps to.
//
// TEXT NOTE: this file owns user-facing label/hint text, making it the second
// text-owning module after strings.ts (which says so). Keeping labels beside
// their bounds is what stops the two drifting; the deferred i18n sweep moves
// both maps into the catalogs together.

import type { IconName } from '../../Icons';
import type { ScraperSettingActionId } from './settingActions';
import {
  SCRAPER_IMAGE_FORMATS,
  SCRAPER_LOG_CHANNELS,
  SCRAPER_LOG_LEVELS,
  SCRAPER_MERGE_STRATEGIES,
  SCRAPER_MISSED_RUN_POLICIES,
  SCRAPER_NOTIFY_CHANNELS,
  SCRAPER_TITLE_LANGUAGES,
  SCRAPER_VALIDATION_FAILURE_MODES,
  SCRAPER_EXPORT_FORMATS,
} from '../../../../shared/scraperOutputSettings';
import {
  SCRAPER_QBIT_ADD_MODES,
  SCRAPER_QBIT_LAYOUTS,
  SCRAPER_SOURCE_MODES,
  SCRAPER_TORRENT_PROTOCOLS,
} from '../../../../shared/scraperSourceSettings';

export type ScraperFieldKind =
  | 'toggle'
  | 'number'
  | 'text'
  | 'textarea'
  | 'select'
  | 'tags'
  /** A pair of number inputs bound to two paths, e.g. Random Delay min–max. */
  | 'range'
  /** Opens a sub-editor and shows how many entries it holds. */
  | 'counted'
  /** Read-only status readout with an action, e.g. Test Connection. */
  | 'status';

export interface ScraperFieldOption {
  value: string;
  label: string;
}

export interface ScraperFieldDef {
  /** Dotted path into ScraperSettings, e.g. 'network.retryAttempts'. */
  path: string;
  group: ScraperSettingsGroupId;
  label: string;
  hint?: string;
  kind: ScraperFieldKind;
  options?: ScraperFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  /** Suffix shown inside the control, e.g. 'ms'. */
  unit?: string;
  placeholder?: string;
  /** Second path for 'range'. */
  toPath?: string;
  /** For 'counted'/'status': which sub-editor or action to open. */
  action?: ScraperSettingActionId;
  /** Hidden unless the shell's Advanced mode is on. */
  advanced?: boolean;
  /** Extra search terms, deliberately literal English. */
  keywords?: string[];
  /**
   * This field persists but nothing reads it yet.
   *
   * The drawer renders a visible marker for it. A control that edits a stored
   * value while changing no behaviour is the defect the audit called F5 — the
   * value really is saved, so the settings document is not lying; the *screen*
   * was, by presenting the control exactly like the ones that work. Marking it
   * is not a substitute for wiring it, but an unmarked inert control is
   * indistinguishable from a broken one, and a user cannot tell which.
   */
  inert?: boolean;
}

// 2026-08-02: 'browser' was removed from this union. It offered nine
// headless-browser controls — engine, viewport, JavaScript wait, scroll passes,
// a pre-extraction script — and this project has no browser-automation
// dependency, so there was nothing for a consumer to drive. The `browser` block
// survives in `shared/scraperSettings.ts` because `shared/connectionProfiles.ts`
// and the main Settings app's Scraper page still reference it; nothing in
// `src/main/scraper` reads it. Its `set.browser` dot is gone from
// featureStatus.ts as well — a category that does not exist is not a feature
// that is unbuilt.
//
// 'ui' stayed. It has no entries in SCRAPER_FIELDS, but it is not empty: like
// 'profiles', its controls are rendered by hand in ScraperSettingsDrawer.tsx
// because they bind to the shell state in `shared/scraperShell.ts` rather than
// to the settings document every declarative field here writes to.
export type ScraperSettingsGroupId =
  | 'network'
  | 'antibot'
  | 'extraction'
  | 'episodes'
  | 'sources'
  | 'torrent'
  | 'qbittorrent'
  | 'images'
  | 'metadata'
  | 'cache'
  | 'performance'
  | 'logging'
  | 'validation'
  | 'export'
  | 'scheduler'
  | 'notifications'
  | 'profiles'
  | 'developer'
  | 'ui';

export interface ScraperSettingsGroup {
  id: ScraperSettingsGroupId;
  label: string;
  description: string;
  icon: IconName;
  /** Feature-status id, so each category carries its own build state. */
  statusId: string;
}

/** Drawer categories, in the reference design's order. */
export const SCRAPER_SETTINGS_GROUPS: ScraperSettingsGroup[] = [
  { id: 'network', label: 'Network', description: 'Configure network requests and connections.', icon: 'globe', statusId: 'set.network' },
  { id: 'antibot', label: 'Anti-Bot', description: 'How the scraper behaves when a provider challenges it.', icon: 'shield', statusId: 'set.antibot' },
  { id: 'extraction', label: 'Extraction', description: 'Selectors and text handling.', icon: 'scan', statusId: 'set.extraction' },
  { id: 'episodes', label: 'Episode Processing', description: 'Ordering, deduplication and language preferences.', icon: 'video', statusId: 'set.episodes' },
  { id: 'sources', label: 'Sources', description: 'Which sites to try, in what order.', icon: 'network', statusId: 'set.sources' },
  { id: 'torrent', label: 'Torrents', description: 'Indexer preferences and release filtering.', icon: 'download', statusId: 'set.torrent' },
  { id: 'qbittorrent', label: 'qBittorrent', description: 'Connection and send options for your torrent client.', icon: 'drive', statusId: 'set.qbittorrent' },
  { id: 'images', label: 'Images', description: 'Thumbnails, posters and artwork handling.', icon: 'image', statusId: 'set.images' },
  { id: 'metadata', label: 'Metadata', description: 'Where series information comes from.', icon: 'file-text', statusId: 'set.metadata' },
  { id: 'cache', label: 'Cache', description: 'What is stored locally, and for how long.', icon: 'drive', statusId: 'set.cache' },
  { id: 'performance', label: 'Performance', description: 'Concurrency and resource limits.', icon: 'chart-bar', statusId: 'set.performance' },
  { id: 'logging', label: 'Logging', description: 'What is recorded, and what is redacted.', icon: 'clipboard', statusId: 'set.logging' },
  { id: 'validation', label: 'Validation', description: 'Checks a result must pass to count as complete.', icon: 'check', statusId: 'set.validation' },
  { id: 'export', label: 'Export', description: 'Default format and destination for exports.', icon: 'external', statusId: 'set.export' },
  { id: 'scheduler', label: 'Scheduler', description: 'Recurring runs and when they may happen.', icon: 'calendar', statusId: 'set.scheduler' },
  { id: 'notifications', label: 'Notifications', description: 'Which events are worth interrupting you for.', icon: 'bell', statusId: 'set.notifications' },
  { id: 'profiles', label: 'Profiles', description: 'Saved configurations and presets.', icon: 'app', statusId: 'set.profiles' },
  { id: 'developer', label: 'Developer', description: 'Diagnostics and experimental behaviour.', icon: 'wrench', statusId: 'set.developer' },
  // No SCRAPER_FIELDS entries by design — see the note on ScraperSettingsGroupId.
  { id: 'ui', label: 'UI', description: 'How the scraper window itself behaves.', icon: 'widgets', statusId: 'set.ui' },
];

const opts = (values: readonly string[], labels?: Record<string, string>): ScraperFieldOption[] =>
  values.map((value) => ({ value, label: labels?.[value] ?? value }));

export const SCRAPER_FIELDS: ScraperFieldDef[] = [
  // ------------------------------------------------------------ network ---
  {
    path: 'network.userAgent', group: 'network', kind: 'select', label: 'User-Agent',
    hint: 'Random is recommended — a fixed identity is easier for a provider to fingerprint.',
    options: [
      { value: '', label: 'Random (Recommended)' },
      { value: 'chrome-win', label: 'Chrome on Windows' },
      { value: 'firefox-win', label: 'Firefox on Windows' },
      { value: 'safari-mac', label: 'Safari on macOS' },
      { value: 'custom', label: 'Custom' },
    ],
    keywords: ['ua', 'browser identity', 'fingerprint'],
  },
  // Deliberately the same path as the select above: choosing a preset writes a
  // canned string here, and this box edits that same string directly. The model
  // stores one user-agent, so inventing a second field would mean two sources
  // of truth for one header.
  { path: 'network.userAgent', group: 'network', kind: 'text', label: 'Custom User-Agent', placeholder: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  { path: 'network.headers', group: 'network', kind: 'counted', label: 'Request Headers', action: 'headers', keywords: ['header', 'referer', 'accept-language'] },
  { path: 'network.cookieHeader', group: 'network', kind: 'counted', label: 'Cookies', action: 'cookies', keywords: ['cookie', 'session', 'login'] },
  { path: 'network.proxyUrl', group: 'network', kind: 'text', label: 'Proxy', placeholder: 'http://host:port — leave empty for no proxy', keywords: ['socks', 'vpn'] },
  { path: 'network.proxyRotation', group: 'network', kind: 'tags', label: 'Proxy Rotation', hint: 'Rotates through these when a request fails.', advanced: true },
  { path: 'network.retryAttempts', group: 'network', kind: 'number', label: 'Retry Attempts', min: 0, max: 10 },
  { path: 'network.retryDelayMs', group: 'network', kind: 'number', label: 'Retry Delay', min: 0, max: 60_000, step: 100, unit: 'ms' },
  { path: 'network.requestTimeoutMs', group: 'network', kind: 'number', label: 'Request Timeout', min: 1_000, max: 300_000, step: 1_000, unit: 'ms' },
  { path: 'network.concurrentRequests', group: 'network', kind: 'number', label: 'Concurrent Requests', min: 1, max: 32, hint: 'Higher is faster, and harder on the provider.' },
  { path: 'network.randomDelayMinMs', toPath: 'network.randomDelayMaxMs', group: 'network', kind: 'range', label: 'Random Delay', min: 0, max: 60_000, step: 50, unit: 'ms', hint: 'A pause between requests, varied so traffic is not perfectly uniform.' },
  { path: 'network.followRedirects', group: 'network', kind: 'toggle', label: 'Follow Redirects' },
  { path: 'network.verifySsl', group: 'network', kind: 'toggle', label: 'SSL Verification', hint: 'Turning this off exposes the connection to interception. Leave it on.' },

  // ------------------------------------------------------------ anti-bot ---
  { path: 'session.consistentFingerprint', group: 'antibot', kind: 'toggle', label: 'Consistent Fingerprint', hint: 'Reuse one plausible browser identity instead of varying it per request.' },
  { path: 'session.persistAuthenticatedSession', group: 'antibot', kind: 'toggle', label: 'Persist Signed-In Session', hint: 'Keeps approved cookies so a challenge is not repeated on every page.' },
  { path: 'session.sessionLabel', group: 'antibot', kind: 'text', label: 'Session Label', placeholder: 'e.g. StreamSB — main account' },
  { path: 'safety.respectRobotsTxt', group: 'antibot', kind: 'toggle', label: 'Respect robots.txt' },
  { path: 'safety.crawlDelayMs', group: 'antibot', kind: 'number', label: 'Crawl Delay', min: 0, max: 60_000, step: 100, unit: 'ms' },
  { path: 'safety.maxRequestsPerMinute', group: 'antibot', kind: 'number', label: 'Max Requests / Minute', min: 1, max: 600 },
  { path: 'safety.pauseAfterFailures', group: 'antibot', kind: 'number', label: 'Pause After Failures', min: 1, max: 100 },
  { path: 'safety.pauseDurationMs', group: 'antibot', kind: 'number', label: 'Pause Duration', min: 1_000, max: 3_600_000, step: 1_000, unit: 'ms' },

  // ---------------------------------------------------------- extraction ---
  { path: 'extraction.cssSelectors', group: 'extraction', kind: 'tags', label: 'CSS Selectors', hint: 'Tried in order; the first that matches wins.' },
  { path: 'extraction.xpathSelectors', group: 'extraction', kind: 'tags', label: 'XPath Selectors', advanced: true },
  { path: 'extraction.regexPattern', group: 'extraction', kind: 'text', label: 'Regex Pattern', placeholder: 'Episode\\s*(\\d+)', advanced: true },
  { path: 'extraction.regexFlags', group: 'extraction', kind: 'text', label: 'Regex Flags', placeholder: 'gi', advanced: true },
  { path: 'extraction.attribute', group: 'extraction', kind: 'select', label: 'Attribute', options: opts(['text', 'href', 'src', 'data-src', 'title'], { text: 'Visible text' }) },
  { path: 'extraction.ignoreHiddenElements', group: 'extraction', kind: 'toggle', label: 'Ignore Hidden Elements', hint: 'Skips templates and duplicate mobile layouts.' },
  { path: 'extraction.cleanText', group: 'extraction', kind: 'toggle', label: 'Clean Text' },
  { path: 'extraction.decodeHtmlEntities', group: 'extraction', kind: 'toggle', label: 'Decode HTML Entities' },
  { path: 'extraction.removeDuplicateEpisodes', group: 'extraction', kind: 'toggle', label: 'Remove Duplicate Episodes' },
  { path: 'extraction.normalizeEpisodeNumbering', group: 'extraction', kind: 'toggle', label: 'Normalize Episode Numbering', hint: 'Turns "EP 01", "Episode 1" and "1話" into one sortable value.' },
  { path: 'extraction.detectSeasonNumbers', group: 'extraction', kind: 'toggle', label: 'Detect Season Numbers' },
  { path: 'extraction.detectSpecials', group: 'extraction', kind: 'toggle', label: 'Detect Specials', keywords: ['ova', 'ona', 'recap'] },

  // ------------------------------------------------------------ episodes ---
  { path: 'episodeProcessing.naturalSort', group: 'episodes', kind: 'toggle', label: 'Natural Sort', hint: 'Sorts 2 before 10, and keeps 12.5 in the right place.' },
  { path: 'episodeProcessing.detectMissingNumbers', group: 'episodes', kind: 'toggle', label: 'Report Missing Episodes' },
  { path: 'episodeProcessing.mergeDuplicateSources', group: 'episodes', kind: 'toggle', label: 'Merge Duplicate Sources' },
  { path: 'episodeProcessing.keepHighestQuality', group: 'episodes', kind: 'toggle', label: 'Keep Highest Quality' },
  { path: 'episodeProcessing.audioPreference', group: 'episodes', kind: 'select', label: 'Audio', options: opts(['subbed', 'dubbed', 'raw', 'none'], { subbed: 'Subbed', dubbed: 'Dubbed', raw: 'Raw', none: 'No preference' }) },
  { path: 'episodeProcessing.languagePriority', group: 'episodes', kind: 'tags', label: 'Language Priority', hint: 'Ordered. Japanese first is the usual choice for immersion.' },
  { path: 'episodeProcessing.resolutionPriority', group: 'episodes', kind: 'tags', label: 'Resolution Priority' },
  { path: 'episodeProcessing.ignoreFiller', group: 'episodes', kind: 'toggle', label: 'Ignore Filler' },
  { path: 'episodeProcessing.ignoreRecaps', group: 'episodes', kind: 'toggle', label: 'Ignore Recaps' },
  { path: 'episodeProcessing.renameEpisodes', group: 'episodes', kind: 'toggle', label: 'Rename Episodes' },

  // ------------------------------------------------------------- sources ---
  { path: 'sources.mode', group: 'sources', kind: 'select', label: 'Source Mode', options: opts(SCRAPER_SOURCE_MODES, { streaming: 'Streaming only', torrent: 'Torrents only', both: 'Streaming and torrents' }), keywords: ['mode', 'switch'] },
  { path: 'sources.stopAfterFirstSuccess', group: 'sources', kind: 'toggle', label: 'Stop After First Success', hint: 'Off means every enabled source is tried, even after one works.' },
  { path: 'sources.maxFallbackDepth', group: 'sources', kind: 'number', label: 'Max Fallback Depth', min: 0, max: 10 },
  { path: 'sources.perSourceTimeoutMs', group: 'sources', kind: 'number', label: 'Per-Source Timeout', min: 1_000, max: 300_000, step: 1_000, unit: 'ms' },
  { path: 'sources.skipUnhealthy', group: 'sources', kind: 'toggle', label: 'Skip Unhealthy Sources' },
  { path: 'sources.requireSubtitleAvailability', group: 'sources', kind: 'toggle', label: 'Require Subtitles', hint: 'Only accept a source that actually offers your subtitle languages.' },
  { path: 'sources.entries', group: 'sources', kind: 'counted', label: 'Sources', action: 'sources' },

  // ------------------------------------------------------------- torrent ---
  { path: 'torrents.enabled', group: 'torrent', kind: 'toggle', label: 'Enable Torrent Sources' },
  { path: 'torrents.protocols', group: 'torrent', kind: 'select', label: 'Protocols', options: opts(SCRAPER_TORRENT_PROTOCOLS, { magnet: 'Magnet links', 'torrent-file': '.torrent files', both: 'Both' }) },
  { path: 'torrents.minSeeders', group: 'torrent', kind: 'number', label: 'Minimum Seeders', min: 0, max: 100_000 },
  { path: 'torrents.maxSizeMb', group: 'torrent', kind: 'number', label: 'Maximum Size', min: 0, max: 1_048_576, step: 100, unit: 'MB', hint: '0 means no limit.' },
  { path: 'torrents.preferredReleaseGroups', group: 'torrent', kind: 'tags', label: 'Preferred Release Groups', hint: 'Ordered. Ranked above anything not listed.' },
  { path: 'torrents.blockedReleaseGroups', group: 'torrent', kind: 'tags', label: 'Blocked Release Groups' },
  { path: 'torrents.requireSubtitles', group: 'torrent', kind: 'toggle', label: 'Require Subtitles' },
  { path: 'torrents.subtitleLanguages', group: 'torrent', kind: 'tags', label: 'Subtitle Languages' },
  { path: 'torrents.resolutionPriority', group: 'torrent', kind: 'tags', label: 'Resolution Priority' },
  { path: 'torrents.preferBatches', group: 'torrent', kind: 'toggle', label: 'Prefer Batch Releases' },
  { path: 'torrents.dedupeByInfoHash', group: 'torrent', kind: 'toggle', label: 'De-duplicate by Info Hash' },
  { path: 'torrents.verifyInfoHash', group: 'torrent', kind: 'toggle', label: 'Verify Info Hash' },
  { path: 'torrents.extraTrackers', group: 'torrent', kind: 'counted', label: 'Extra Trackers', action: 'trackers', advanced: true },

  // --------------------------------------------------------- qbittorrent ---
  { path: 'qbittorrent.enabled', group: 'qbittorrent', kind: 'toggle', label: 'Send to qBittorrent' },
  { path: 'qbittorrent.connectionStatus', group: 'qbittorrent', kind: 'status', label: 'Connection', action: 'qbit-test', keywords: ['test', 'connect'] },
  { path: 'qbittorrent.scheme', group: 'qbittorrent', kind: 'select', label: 'Scheme', options: opts(['http', 'https']) },
  { path: 'qbittorrent.host', group: 'qbittorrent', kind: 'text', label: 'Host', placeholder: 'localhost' },
  { path: 'qbittorrent.port', group: 'qbittorrent', kind: 'number', label: 'Port', min: 1, max: 65_535 },
  { path: 'qbittorrent.basePath', group: 'qbittorrent', kind: 'text', label: 'Base Path', placeholder: '/qbt', advanced: true },
  { path: 'qbittorrent.username', group: 'qbittorrent', kind: 'text', label: 'Username' },
  { path: 'qbittorrent.passwordRef', group: 'qbittorrent', kind: 'status', label: 'Password', action: 'qbit-password', hint: 'Stored by the operating system, never in this settings file.' },
  { path: 'qbittorrent.category', group: 'qbittorrent', kind: 'text', label: 'Category', placeholder: 'anime' },
  { path: 'qbittorrent.tags', group: 'qbittorrent', kind: 'tags', label: 'Tags' },
  { path: 'qbittorrent.savePath', group: 'qbittorrent', kind: 'text', label: 'Save Path', placeholder: 'Leave empty to use qBittorrent’s default' },
  { path: 'qbittorrent.addMode', group: 'qbittorrent', kind: 'select', label: 'Add Mode', options: opts(SCRAPER_QBIT_ADD_MODES, { paused: 'Add paused', started: 'Start immediately', forced: 'Force start' }) },
  { path: 'qbittorrent.contentLayout', group: 'qbittorrent', kind: 'select', label: 'Content Layout', options: opts(SCRAPER_QBIT_LAYOUTS, { original: 'Original', subfolder: 'Create subfolder', nosubfolder: 'No subfolder' }) },
  { path: 'qbittorrent.autoTmm', group: 'qbittorrent', kind: 'toggle', label: 'Automatic Torrent Management' },
  { path: 'qbittorrent.sequentialDownload', group: 'qbittorrent', kind: 'toggle', label: 'Sequential Download' },
  { path: 'qbittorrent.firstLastPiecePriority', group: 'qbittorrent', kind: 'toggle', label: 'First/Last Piece Priority', hint: 'Lets a file start playing before it finishes.' },
  { path: 'qbittorrent.skipHashCheck', group: 'qbittorrent', kind: 'toggle', label: 'Skip Hash Check', advanced: true },
  { path: 'qbittorrent.ratioLimit', group: 'qbittorrent', kind: 'number', label: 'Ratio Limit', min: -1, max: 10_000, step: 0.1, hint: '-1 follows qBittorrent’s global setting.' },
  { path: 'qbittorrent.seedingTimeLimitMin', group: 'qbittorrent', kind: 'number', label: 'Seeding Time Limit', min: -1, max: 525_600, unit: 'min' },
  { path: 'qbittorrent.uploadLimitKbps', group: 'qbittorrent', kind: 'number', label: 'Upload Limit', min: 0, max: 10_000_000, unit: 'KB/s', hint: '0 means unlimited.' },
  { path: 'qbittorrent.downloadLimitKbps', group: 'qbittorrent', kind: 'number', label: 'Download Limit', min: 0, max: 10_000_000, unit: 'KB/s' },
  { path: 'qbittorrent.renameTemplate', group: 'qbittorrent', kind: 'text', label: 'Rename Template', placeholder: '{series} - {episode}', advanced: true },

  // -------------------------------------------------------------- images ---
  { path: 'images.downloadThumbnails', group: 'images', kind: 'toggle', label: 'Download Thumbnails' },
  { path: 'images.downloadPosters', group: 'images', kind: 'toggle', label: 'Download Posters' },
  { path: 'images.downloadBanners', group: 'images', kind: 'toggle', label: 'Download Banners' },
  { path: 'images.minWidth', toPath: 'images.minHeight', group: 'images', kind: 'range', label: 'Minimum Size', min: 0, max: 7_680, step: 10, unit: 'px', hint: 'Stored for a future downloader. Catalogue providers currently expose URLs without measured pixel dimensions.', inert: true },
  { path: 'images.preferredFormat', group: 'images', kind: 'select', label: 'Preferred Format', options: opts(SCRAPER_IMAGE_FORMATS, { original: 'Keep original', webp: 'WebP', jpg: 'JPEG', png: 'PNG' }) },
  { path: 'images.maxPerEntry', group: 'images', kind: 'number', label: 'Max Images Per Entry', min: 0, max: 200 },
  { path: 'images.skipDuplicatesByHash', group: 'images', kind: 'toggle', label: 'Skip Duplicates by Hash', hint: 'Stored for a future downloader. No image bytes are downloaded or hashed by the scraper yet.', inert: true },
  { path: 'images.namingTemplate', group: 'images', kind: 'text', label: 'Naming Template', hint: 'Stored for a future downloader. The current scraper returns image URLs and does not write artwork files.', advanced: true, inert: true },

  // ------------------------------------------------------------ metadata ---
  { path: 'metadata.providerOrder', group: 'metadata', kind: 'tags', label: 'Provider Order', hint: 'Ordered. The first provider with a value wins.' },
  { path: 'metadata.titleLanguage', group: 'metadata', kind: 'select', label: 'Title Language', options: opts(SCRAPER_TITLE_LANGUAGES, { romaji: 'Romaji', english: 'English', native: 'Japanese' }) },
  { path: 'metadata.alsoStoreNativeTitle', group: 'metadata', kind: 'toggle', label: 'Also Store Japanese Title', hint: 'Shown as the second line under each result.' },
  { path: 'metadata.mergeStrategy', group: 'metadata', kind: 'select', label: 'Merge Strategy', options: opts(SCRAPER_MERGE_STRATEGIES, { 'first-wins': 'First provider wins', 'prefer-complete': 'Prefer the most complete', manual: 'Ask me' }) },
  { path: 'metadata.fetchSynopsis', group: 'metadata', kind: 'toggle', label: 'Fetch Synopsis' },
  { path: 'metadata.fetchGenres', group: 'metadata', kind: 'toggle', label: 'Fetch Genres' },
  { path: 'metadata.fetchAirDates', group: 'metadata', kind: 'toggle', label: 'Fetch Air Dates' },
  { path: 'metadata.fetchRatings', group: 'metadata', kind: 'toggle', label: 'Fetch Ratings' },
  { path: 'metadata.fetchStaff', group: 'metadata', kind: 'toggle', label: 'Fetch Staff and Cast', advanced: true },
  { path: 'metadata.cacheHours', group: 'metadata', kind: 'number', label: 'Metadata Cache', min: 0, max: 8_760, unit: 'h' },

  // --------------------------------------------------------------- cache ---
  { path: 'cache.mode', group: 'cache', kind: 'select', label: 'Cache Mode', options: opts(['standard', 'offline'], { standard: 'Standard', offline: 'Offline — never refetch' }) },
  { path: 'cache.htmlEnabled', group: 'cache', kind: 'toggle', label: 'Cache Pages' },
  { path: 'cache.metadataEnabled', group: 'cache', kind: 'toggle', label: 'Cache Metadata' },
  { path: 'cache.thumbnailsEnabled', group: 'cache', kind: 'toggle', label: 'Cache Thumbnails' },
  { path: 'cache.lifetimeMinutes', group: 'cache', kind: 'number', label: 'Cache Lifetime', min: 1, max: 525_600, unit: 'min' },
  { path: 'cache.maxSizeMb', group: 'cache', kind: 'number', label: 'Cache Size Limit', min: 16, max: 1_048_576, step: 16, unit: 'MB' },

  // --------------------------------------------------------- performance ---
  { path: 'performance.maxParallelJobs', group: 'performance', kind: 'number', label: 'Parallel Jobs', min: 1, max: 16 },
  { path: 'performance.maxParallelDownloads', group: 'performance', kind: 'number', label: 'Parallel Downloads', min: 1, max: 32 },
  { path: 'performance.memoryBudgetMb', group: 'performance', kind: 'number', label: 'Memory Budget', min: 128, max: 32_768, step: 128, unit: 'MB' },
  { path: 'performance.cpuThrottlePercent', group: 'performance', kind: 'number', label: 'CPU Ceiling', min: 10, max: 100, unit: '%' },
  { path: 'performance.batchSize', group: 'performance', kind: 'number', label: 'Batch Size', min: 1, max: 500 },
  { path: 'performance.reuseBrowserContext', group: 'performance', kind: 'toggle', label: 'Reuse Browser Context' },
  { path: 'performance.prefetchNextPage', group: 'performance', kind: 'toggle', label: 'Prefetch Next Page' },

  // ------------------------------------------------------------- logging ---
  { path: 'logging.level', group: 'logging', kind: 'select', label: 'Log Level', options: opts(SCRAPER_LOG_LEVELS, { silent: 'Silent', error: 'Errors only', warn: 'Warnings', info: 'Info', debug: 'Debug', trace: 'Trace' }) },
  { path: 'logging.channels', group: 'logging', kind: 'tags', label: 'Channels', hint: `One or more of: ${SCRAPER_LOG_CHANNELS.join(', ')}.` },
  { path: 'logging.persistToDisk', group: 'logging', kind: 'toggle', label: 'Write Logs to Disk' },
  { path: 'logging.retentionDays', group: 'logging', kind: 'number', label: 'Retention', min: 0, max: 365, unit: 'days' },
  { path: 'logging.maxFileSizeMb', group: 'logging', kind: 'number', label: 'Max Log File Size', min: 1, max: 4_096, unit: 'MB' },
  { path: 'logging.redactCookies', group: 'logging', kind: 'toggle', label: 'Redact Cookies', hint: 'A log that leaks a session cookie is a security incident. Leave this on.' },
  { path: 'logging.redactCredentials', group: 'logging', kind: 'toggle', label: 'Redact Credentials' },
  { path: 'logging.captureScreenshotsOnError', group: 'logging', kind: 'toggle', label: 'Screenshot on Failure' },
  { path: 'logging.captureHar', group: 'logging', kind: 'toggle', label: 'Capture HAR', advanced: true },

  // ---------------------------------------------------------- validation ---
  { path: 'validation.requirePlayableStream', group: 'validation', kind: 'toggle', label: 'Require a Playable Stream' },
  { path: 'validation.verifyEpisodeCount', group: 'validation', kind: 'toggle', label: 'Verify Episode Count' },
  { path: 'validation.verifySubtitlePresence', group: 'validation', kind: 'toggle', label: 'Verify Subtitles Present' },
  { path: 'validation.rejectPlaceholderTitles', group: 'validation', kind: 'toggle', label: 'Reject Placeholder Titles' },
  { path: 'validation.rejectDuplicateHashes', group: 'validation', kind: 'toggle', label: 'Reject Duplicate Files' },
  { path: 'validation.minEpisodeDurationSec', group: 'validation', kind: 'number', label: 'Minimum Episode Length', min: 0, max: 86_400, unit: 's' },
  { path: 'validation.maxTitleLength', group: 'validation', kind: 'number', label: 'Maximum Title Length', min: 16, max: 512 },
  { path: 'validation.onFailure', group: 'validation', kind: 'select', label: 'On Failure', options: opts(SCRAPER_VALIDATION_FAILURE_MODES, { warn: 'Warn and keep', skip: 'Skip the item', abort: 'Abort the job' }) },

  // -------------------------------------------------------------- export ---
  { path: 'export.format', group: 'export', kind: 'select', label: 'Format', options: opts(SCRAPER_EXPORT_FORMATS, { json: 'JSON', csv: 'CSV', ndjson: 'NDJSON', m3u: 'M3U playlist', 'torrent-list': 'Torrent list' }) },
  { path: 'export.destinationRef', group: 'export', kind: 'text', label: 'Destination', placeholder: 'Choose a folder' },
  { path: 'export.filenameTemplate', group: 'export', kind: 'text', label: 'Filename Template' },
  { path: 'export.includeColumns', group: 'export', kind: 'tags', label: 'Columns' },
  { path: 'export.includeSubtitleColumn', group: 'export', kind: 'toggle', label: 'Include Subtitle Availability' },
  { path: 'export.splitBySeason', group: 'export', kind: 'toggle', label: 'Split by Season' },
  { path: 'export.prettyPrint', group: 'export', kind: 'toggle', label: 'Pretty Print' },
  { path: 'export.openAfterExport', group: 'export', kind: 'toggle', label: 'Open After Export' },

  // ----------------------------------------------------------- scheduler ---
  { path: 'scheduler.enabled', group: 'scheduler', kind: 'toggle', label: 'Enable Scheduled Runs' },
  { path: 'scheduler.entries', group: 'scheduler', kind: 'counted', label: 'Schedules', action: 'schedules' },
  { path: 'scheduler.maxConcurrentScheduled', group: 'scheduler', kind: 'number', label: 'Max Concurrent Scheduled Runs', min: 1, max: 8 },
  { path: 'scheduler.skipIfRunning', group: 'scheduler', kind: 'toggle', label: 'Skip If Already Running' },
  { path: 'scheduler.missedRunPolicy', group: 'scheduler', kind: 'select', label: 'Missed Runs', options: opts(SCRAPER_MISSED_RUN_POLICIES, { skip: 'Skip them', 'run-once': 'Run once on return', 'run-all': 'Run every missed job' }) },
  { path: 'scheduler.quietHoursStart', toPath: 'scheduler.quietHoursEnd', group: 'scheduler', kind: 'range', label: 'Quiet Hours', hint: 'Leave empty to disable. 24-hour clock.' },
  { path: 'scheduler.requireExternalPower', group: 'scheduler', kind: 'toggle', label: 'Only on External Power' },
  { path: 'scheduler.requireUnmeteredNetwork', group: 'scheduler', kind: 'toggle', label: 'Only on an Unmetered Network' },

  // ------------------------------------------------------- notifications ---
  { path: 'notifications.channel', group: 'notifications', kind: 'select', label: 'Deliver Via', options: opts(SCRAPER_NOTIFY_CHANNELS, { toast: 'In-app', system: 'System notifications', both: 'Both', none: 'Nothing' }) },
  { path: 'notifications.onComplete', group: 'notifications', kind: 'toggle', label: 'Scrape Complete' },
  { path: 'notifications.onError', group: 'notifications', kind: 'toggle', label: 'Failure Needing Attention' },
  { path: 'notifications.onNewEpisode', group: 'notifications', kind: 'toggle', label: 'New Episode Found' },
  { path: 'notifications.onStudyReady', group: 'notifications', kind: 'toggle', label: 'Subtitles Ready to Study' },
  { path: 'notifications.onScheduleRun', group: 'notifications', kind: 'toggle', label: 'Scheduled Run Started' },
  { path: 'notifications.soundEnabled', group: 'notifications', kind: 'toggle', label: 'Play a Sound' },
  { path: 'notifications.digestMinutes', group: 'notifications', kind: 'number', label: 'Group Into a Digest', min: 0, max: 1_440, unit: 'min', hint: '0 delivers each event as it happens.' },

  // ----------------------------------------------------------- developer ---
  { path: 'developer.mockMode', group: 'developer', kind: 'toggle', label: 'Sample Data Mode', hint: 'On, because there is no scraping backend yet. Every figure you see is illustrative.' },
  { path: 'developer.showRawHtml', group: 'developer', kind: 'toggle', label: 'Show Raw HTML' },
  { path: 'developer.showSelectorOverlay', group: 'developer', kind: 'toggle', label: 'Selector Overlay' },
  { path: 'developer.recordNetworkTrace', group: 'developer', kind: 'toggle', label: 'Record Network Trace' },
  { path: 'developer.verboseTimings', group: 'developer', kind: 'toggle', label: 'Verbose Timings' },
  // The old hint read "Scripts run against live pages", which was never true and
  // is now emphatically not: the console evaluates nothing. This toggle gates
  // the fixed allow-list of read-only inspection commands in ToolPages.tsx's
  // ScriptConsolePage, which is the whole of what that page can do.
  { path: 'developer.allowScriptConsole', group: 'developer', kind: 'toggle', label: 'Unlock Script Console', hint: 'Lets the Script Console run its allow-listed, read-only inspection commands. Nothing you type is executed.', keywords: ['console', 'inspect', 'diagnostics'] },
  { path: 'developer.pluginIds', group: 'developer', kind: 'tags', label: 'Enabled Plugins', advanced: true },
];

/** Reads a dotted path out of a settings object. */
export function readField(settings: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[key];
    return undefined;
  }, settings);
}

/**
 * Builds the shallow patch a dotted path implies — the settings model takes
 * `{ group: { key: value } }`, never a deep path.
 */
export function fieldPatch(path: string, value: unknown): Record<string, unknown> {
  const [group, key] = path.split('.');
  if (!group || !key) return {};
  return { [group]: { [key]: value } };
}

export function fieldsForGroup(
  group: ScraperSettingsGroupId,
  advanced: boolean,
): ScraperFieldDef[] {
  return SCRAPER_FIELDS.filter((f) => f.group === group && (advanced || !f.advanced));
}

export function groupMeta(id: string): ScraperSettingsGroup | undefined {
  return SCRAPER_SETTINGS_GROUPS.find((g) => g.id === id);
}

/**
 * Field search for the drawer's own box. Same shape as the shell's registry
 * search so the two rank alike; scored on label, hint, path and keywords.
 */
export function searchScraperFields(
  query: string,
  advanced: boolean,
): ScraperFieldDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const scored: { field: ScraperFieldDef; score: number }[] = [];

  for (const field of SCRAPER_FIELDS) {
    if (field.advanced && !advanced) continue;
    const label = field.label.toLowerCase();
    const hay = [field.label, field.hint ?? '', field.path, field.group, ...(field.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    let score = 0;
    if (label.includes(q)) score += 40;
    if (hay.includes(q)) score += 20;
    for (const w of words) {
      if (label.includes(w)) score += 12;
      else if (hay.includes(w)) score += 6;
    }
    if (score > 0) scored.push({ field, score });
  }

  scored.sort((a, b) => b.score - a.score || a.field.label.localeCompare(b.field.label));
  return scored.slice(0, 24).map((s) => s.field);
}
