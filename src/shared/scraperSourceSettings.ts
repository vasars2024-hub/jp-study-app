// Where the scraper looks, in what order, and what it does with a torrent.
//
// Three groups, added in settings v3:
//
//   sources     — the ordered list of sites to try, with per-source fallback
//                 chains, plus the streaming/torrent mode switch.
//   torrents    — indexer preferences: seeders, size, release groups, subtitles.
//   qbittorrent — the connection to a running qBittorrent, and every option
//                 that goes with "send this to it".
//
// SECURITY: no secret is ever stored here. The qBittorrent group holds a
// `passwordRef` — an opaque handle into OS-protected storage, the same shape
// as ScraperAuthenticationSettings.credentialRef. A `password` key arriving on
// input is dropped and raises an issue; see the test that asserts it.

import {
  booleanValue,
  boundedNumber,
  enumValue,
  isRecord,
  normalizeHost,
  safeId,
  stringListValue,
  stringValue,
  nullableDateValue,
  numberListValue,
  type ScraperSettingsIssue,
} from './scraperSettingsPrimitives';

// ---------------------------------------------------------------- sources ---

export const SCRAPER_SOURCE_MODES = ['streaming', 'torrent', 'both'] as const;
export type ScraperSourceMode = (typeof SCRAPER_SOURCE_MODES)[number];

export const SCRAPER_SOURCE_KINDS = ['streaming', 'torrent', 'metadata', 'subtitles'] as const;
export type ScraperSourceKind = (typeof SCRAPER_SOURCE_KINDS)[number];

export const SCRAPER_SOURCE_HEALTHS = [
  'unknown',
  'ok',
  'degraded',
  'blocked',
  'offline',
] as const;
export type ScraperSourceHealth = (typeof SCRAPER_SOURCE_HEALTHS)[number];

export interface ScraperSourceEntry {
  id: string;
  label: string;
  host: string;
  kind: ScraperSourceKind;
  enabled: boolean;
  /** 1..N, densified on normalize so the list can never show two "3"s. */
  priority: number;
  /** Tried in order when this source fails. Ids that no longer exist are dropped. */
  fallbackIds: string[];
  /** Links to an entry in verifiedSites.ts; '' when this source is scraper-only. */
  verifiedSiteId: string;
  requiresAuth: boolean;
  supportsSubtitles: boolean;
  health: ScraperSourceHealth;
  lastCheckedAt: string | null;
  notes: string;
}

export interface ScraperSourceSettings {
  mode: ScraperSourceMode;
  entries: ScraperSourceEntry[];
  /** Canonical priority chain. Entry ids, best first. */
  order: string[];
  stopAfterFirstSuccess: boolean;
  maxFallbackDepth: number;
  perSourceTimeoutMs: number;
  skipUnhealthy: boolean;
  /** Drives the per-row subtitle badge and can exclude sources that lack subs. */
  requireSubtitleAvailability: boolean;
}

const MAX_SOURCES = 100;
const MAX_FALLBACKS = 8;

export const DEFAULT_SCRAPER_SOURCE_SETTINGS: ScraperSourceSettings = {
  mode: 'streaming',
  entries: [],
  order: [],
  stopAfterFirstSuccess: true,
  maxFallbackDepth: 3,
  perSourceTimeoutMs: 30_000,
  skipUnhealthy: true,
  requireSubtitleAvailability: false,
};

export function cloneScraperSourceSettings(
  value: ScraperSourceSettings,
): ScraperSourceSettings {
  return {
    ...value,
    entries: value.entries.map((entry) => ({ ...entry, fallbackIds: [...entry.fallbackIds] })),
    order: [...value.order],
  };
}

export function mergeScraperSourceSettings(
  base: ScraperSourceSettings,
  patch: Partial<ScraperSourceSettings> | undefined,
): ScraperSourceSettings {
  const merged = { ...base, ...patch };
  return {
    ...merged,
    entries: (patch?.entries ?? base.entries).map((entry) => ({
      ...entry,
      fallbackIds: [...entry.fallbackIds],
    })),
    order: [...(patch?.order ?? base.order)],
  };
}

function validateSourceEntry(
  input: unknown,
  index: number,
  path: string,
  issues: ScraperSettingsIssue[],
): ScraperSourceEntry | null {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Ignored a source that is not an object.' });
    return null;
  }
  const id = safeId(input.id, '');
  if (!id) {
    issues.push({ path: `${path}.id`, message: 'Ignored a source with no usable id.' });
    return null;
  }
  const host = normalizeHost(input.host);
  if (!host) {
    issues.push({ path: `${path}.host`, message: 'Ignored a source with no usable hostname.' });
    return null;
  }
  return {
    id,
    label: stringValue(input.label, id, 80, `${path}.label`, issues),
    host,
    kind: enumValue(input.kind, SCRAPER_SOURCE_KINDS, 'streaming', `${path}.kind`, issues),
    enabled: booleanValue(input.enabled, true, `${path}.enabled`, issues),
    priority: boundedNumber(input.priority, index + 1, 1, MAX_SOURCES, `${path}.priority`, issues),
    fallbackIds: stringListValue(
      input.fallbackIds,
      [],
      `${path}.fallbackIds`,
      issues,
      MAX_FALLBACKS,
    ).map((value) => safeId(value, '')).filter(Boolean),
    verifiedSiteId: safeId(input.verifiedSiteId, ''),
    requiresAuth: booleanValue(input.requiresAuth, false, `${path}.requiresAuth`, issues),
    supportsSubtitles: booleanValue(
      input.supportsSubtitles,
      false,
      `${path}.supportsSubtitles`,
      issues,
    ),
    health: enumValue(input.health, SCRAPER_SOURCE_HEALTHS, 'unknown', `${path}.health`, issues),
    lastCheckedAt: nullableDateValue(input.lastCheckedAt, null, `${path}.lastCheckedAt`, issues),
    notes: stringValue(input.notes, '', 240, `${path}.notes`, issues),
  };
}

export function validateScraperSourceSettings(
  input: unknown,
  fallback: ScraperSourceSettings,
  issues: ScraperSettingsIssue[],
  prefix: string,
): ScraperSourceSettings {
  const source = isRecord(input) ? input : {};

  const entries: ScraperSourceEntry[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(source.entries)) {
    for (const [index, raw] of source.entries.slice(0, MAX_SOURCES).entries()) {
      const entry = validateSourceEntry(raw, index, `${prefix}.entries.${index}`, issues);
      if (!entry) continue;
      if (seenIds.has(entry.id)) {
        issues.push({
          path: `${prefix}.entries.${index}`,
          message: `Ignored a duplicate source id "${entry.id}".`,
        });
        continue;
      }
      seenIds.add(entry.id);
      entries.push(entry);
    }
  } else if (source.entries !== undefined) {
    issues.push({ path: `${prefix}.entries`, message: 'Expected a list of sources.' });
    entries.push(...fallback.entries.map((e) => ({ ...e, fallbackIds: [...e.fallbackIds] })));
    for (const entry of entries) seenIds.add(entry.id);
  } else {
    entries.push(...fallback.entries.map((e) => ({ ...e, fallbackIds: [...e.fallbackIds] })));
    for (const entry of entries) seenIds.add(entry.id);
  }

  // A fallback chain pointing at a source that no longer exists would strand
  // the scraper mid-run, so dangling ids are dropped here rather than at use.
  for (const entry of entries) {
    const kept = entry.fallbackIds.filter((id) => id !== entry.id && seenIds.has(id));
    if (kept.length !== entry.fallbackIds.length) {
      issues.push({
        path: `${prefix}.entries.${entry.id}.fallbackIds`,
        message: 'Dropped fallback ids that do not match a known source.',
      });
    }
    entry.fallbackIds = [...new Set(kept)];
  }

  // The order is authoritative for priority; anything missing from it is
  // appended in declaration order so a hand-edited document can't hide a source.
  const requestedOrder = stringListValue(
    source.order,
    fallback.order,
    `${prefix}.order`,
    issues,
    MAX_SOURCES,
  )
    .map((value) => safeId(value, ''))
    .filter((id) => id && seenIds.has(id));
  const order = [
    ...new Set([...requestedOrder, ...entries.map((e) => e.id)]),
  ];

  // Densify: priority follows position, so the list always reads 1..N.
  const rank = new Map(order.map((id, index) => [id, index + 1]));
  for (const entry of entries) entry.priority = rank.get(entry.id) ?? entries.length;
  entries.sort((a, b) => a.priority - b.priority);

  return {
    mode: enumValue(source.mode, SCRAPER_SOURCE_MODES, fallback.mode, `${prefix}.mode`, issues),
    entries,
    order,
    stopAfterFirstSuccess: booleanValue(
      source.stopAfterFirstSuccess,
      fallback.stopAfterFirstSuccess,
      `${prefix}.stopAfterFirstSuccess`,
      issues,
    ),
    maxFallbackDepth: boundedNumber(
      source.maxFallbackDepth,
      fallback.maxFallbackDepth,
      0,
      10,
      `${prefix}.maxFallbackDepth`,
      issues,
    ),
    perSourceTimeoutMs: boundedNumber(
      source.perSourceTimeoutMs,
      fallback.perSourceTimeoutMs,
      1_000,
      300_000,
      `${prefix}.perSourceTimeoutMs`,
      issues,
    ),
    skipUnhealthy: booleanValue(
      source.skipUnhealthy,
      fallback.skipUnhealthy,
      `${prefix}.skipUnhealthy`,
      issues,
    ),
    requireSubtitleAvailability: booleanValue(
      source.requireSubtitleAvailability,
      fallback.requireSubtitleAvailability,
      `${prefix}.requireSubtitleAvailability`,
      issues,
    ),
  };
}

// --------------------------------------------------------------- torrents ---

export const SCRAPER_TORRENT_PROTOCOLS = ['magnet', 'torrent-file', 'both'] as const;
export type ScraperTorrentProtocol = (typeof SCRAPER_TORRENT_PROTOCOLS)[number];

export interface ScraperTorrentTracker {
  url: string;
  enabled: boolean;
}

export interface ScraperTorrentSettings {
  enabled: boolean;
  protocols: ScraperTorrentProtocol;
  /** Source ids of kind 'torrent'. */
  indexerIds: string[];
  minSeeders: number;
  /** 0 = unlimited. */
  maxSizeMb: number;
  preferredReleaseGroups: string[];
  blockedReleaseGroups: string[];
  requireSubtitles: boolean;
  subtitleLanguages: string[];
  extraTrackers: ScraperTorrentTracker[];
  dedupeByInfoHash: boolean;
  resolutionPriority: number[];
  preferBatches: boolean;
  verifyInfoHash: boolean;
}

const MAX_TRACKERS = 50;

export const DEFAULT_SCRAPER_TORRENT_SETTINGS: ScraperTorrentSettings = {
  enabled: false,
  protocols: 'magnet',
  indexerIds: [],
  minSeeders: 3,
  maxSizeMb: 0,
  preferredReleaseGroups: [],
  blockedReleaseGroups: [],
  requireSubtitles: false,
  subtitleLanguages: ['ja', 'en'],
  extraTrackers: [],
  dedupeByInfoHash: true,
  resolutionPriority: [1080, 720],
  preferBatches: false,
  verifyInfoHash: true,
};

export function cloneScraperTorrentSettings(
  value: ScraperTorrentSettings,
): ScraperTorrentSettings {
  return {
    ...value,
    indexerIds: [...value.indexerIds],
    preferredReleaseGroups: [...value.preferredReleaseGroups],
    blockedReleaseGroups: [...value.blockedReleaseGroups],
    subtitleLanguages: [...value.subtitleLanguages],
    extraTrackers: value.extraTrackers.map((t) => ({ ...t })),
    resolutionPriority: [...value.resolutionPriority],
  };
}

export function mergeScraperTorrentSettings(
  base: ScraperTorrentSettings,
  patch: Partial<ScraperTorrentSettings> | undefined,
): ScraperTorrentSettings {
  return cloneScraperTorrentSettings({ ...base, ...patch });
}

function trackerListValue(
  value: unknown,
  fallback: ScraperTorrentTracker[],
  path: string,
  issues: ScraperSettingsIssue[],
): ScraperTorrentTracker[] {
  if (value === undefined) return fallback.map((t) => ({ ...t }));
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Expected a list of trackers.' });
    return fallback.map((t) => ({ ...t }));
  }
  const out: ScraperTorrentTracker[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of value.slice(0, MAX_TRACKERS).entries()) {
    const entry = isRecord(raw) ? raw : { url: raw };
    const url = stringValue(entry.url, '', 2_048, `${path}.${index}.url`, issues).trim();
    if (!/^(https?|udp|wss?):\/\/[^\s]+$/i.test(url)) {
      issues.push({ path: `${path}.${index}.url`, message: 'Ignored an unusable tracker URL.' });
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, enabled: booleanValue(entry.enabled, true, `${path}.${index}.enabled`, issues) });
  }
  return out;
}

export function validateScraperTorrentSettings(
  input: unknown,
  fallback: ScraperTorrentSettings,
  issues: ScraperSettingsIssue[],
  prefix: string,
): ScraperTorrentSettings {
  const source = isRecord(input) ? input : {};
  return {
    enabled: booleanValue(source.enabled, fallback.enabled, `${prefix}.enabled`, issues),
    protocols: enumValue(
      source.protocols,
      SCRAPER_TORRENT_PROTOCOLS,
      fallback.protocols,
      `${prefix}.protocols`,
      issues,
    ),
    indexerIds: stringListValue(source.indexerIds, fallback.indexerIds, `${prefix}.indexerIds`, issues)
      .map((value) => safeId(value, ''))
      .filter(Boolean),
    minSeeders: boundedNumber(
      source.minSeeders,
      fallback.minSeeders,
      0,
      100_000,
      `${prefix}.minSeeders`,
      issues,
    ),
    maxSizeMb: boundedNumber(
      source.maxSizeMb,
      fallback.maxSizeMb,
      0,
      1_048_576,
      `${prefix}.maxSizeMb`,
      issues,
    ),
    preferredReleaseGroups: stringListValue(
      source.preferredReleaseGroups,
      fallback.preferredReleaseGroups,
      `${prefix}.preferredReleaseGroups`,
      issues,
    ),
    blockedReleaseGroups: stringListValue(
      source.blockedReleaseGroups,
      fallback.blockedReleaseGroups,
      `${prefix}.blockedReleaseGroups`,
      issues,
    ),
    requireSubtitles: booleanValue(
      source.requireSubtitles,
      fallback.requireSubtitles,
      `${prefix}.requireSubtitles`,
      issues,
    ),
    subtitleLanguages: stringListValue(
      source.subtitleLanguages,
      fallback.subtitleLanguages,
      `${prefix}.subtitleLanguages`,
      issues,
      20,
    ),
    extraTrackers: trackerListValue(
      source.extraTrackers,
      fallback.extraTrackers,
      `${prefix}.extraTrackers`,
      issues,
    ),
    dedupeByInfoHash: booleanValue(
      source.dedupeByInfoHash,
      fallback.dedupeByInfoHash,
      `${prefix}.dedupeByInfoHash`,
      issues,
    ),
    resolutionPriority: numberListValue(
      source.resolutionPriority,
      fallback.resolutionPriority,
      `${prefix}.resolutionPriority`,
      issues,
    ),
    preferBatches: booleanValue(
      source.preferBatches,
      fallback.preferBatches,
      `${prefix}.preferBatches`,
      issues,
    ),
    verifyInfoHash: booleanValue(
      source.verifyInfoHash,
      fallback.verifyInfoHash,
      `${prefix}.verifyInfoHash`,
      issues,
    ),
  };
}

// ------------------------------------------------------------ qbittorrent ---

export const SCRAPER_QBIT_STATUSES = [
  'not-configured',
  'connected',
  'unauthorized',
  'unreachable',
  'unknown',
] as const;
export type ScraperQbitStatus = (typeof SCRAPER_QBIT_STATUSES)[number];

export const SCRAPER_QBIT_ADD_MODES = ['paused', 'started', 'forced'] as const;
export type ScraperQbitAddMode = (typeof SCRAPER_QBIT_ADD_MODES)[number];

export const SCRAPER_QBIT_LAYOUTS = ['original', 'subfolder', 'nosubfolder'] as const;
export type ScraperQbitContentLayout = (typeof SCRAPER_QBIT_LAYOUTS)[number];

export interface ScraperQbittorrentSettings {
  enabled: boolean;
  scheme: 'http' | 'https';
  host: string;
  port: number;
  basePath: string;
  username: string;
  /**
   * SECURITY: a handle into OS-protected storage, never the secret itself.
   * validateScraperQbittorrentSettings actively drops a `password` key.
   */
  passwordRef: string;
  connectionStatus: ScraperQbitStatus;
  lastCheckedAt: string | null;

  // "Send to qBittorrent" options.
  category: string;
  tags: string[];
  savePath: string;
  addMode: ScraperQbitAddMode;
  contentLayout: ScraperQbitContentLayout;
  sequentialDownload: boolean;
  firstLastPiecePriority: boolean;
  skipHashCheck: boolean;
  autoTmm: boolean;
  /** -1 follows qBittorrent's global setting. */
  ratioLimit: number;
  seedingTimeLimitMin: number;
  /** 0 = unlimited. */
  uploadLimitKbps: number;
  downloadLimitKbps: number;
  renameTemplate: string;
}

export const DEFAULT_SCRAPER_QBITTORRENT_SETTINGS: ScraperQbittorrentSettings = {
  enabled: false,
  scheme: 'http',
  host: 'localhost',
  port: 8080,
  basePath: '',
  username: '',
  passwordRef: '',
  connectionStatus: 'not-configured',
  lastCheckedAt: null,
  category: '',
  tags: [],
  savePath: '',
  addMode: 'started',
  contentLayout: 'original',
  sequentialDownload: false,
  firstLastPiecePriority: false,
  skipHashCheck: false,
  autoTmm: true,
  ratioLimit: -1,
  seedingTimeLimitMin: -1,
  uploadLimitKbps: 0,
  downloadLimitKbps: 0,
  renameTemplate: '',
};

export function cloneScraperQbittorrentSettings(
  value: ScraperQbittorrentSettings,
): ScraperQbittorrentSettings {
  return { ...value, tags: [...value.tags] };
}

export function mergeScraperQbittorrentSettings(
  base: ScraperQbittorrentSettings,
  patch: Partial<ScraperQbittorrentSettings> | undefined,
): ScraperQbittorrentSettings {
  return cloneScraperQbittorrentSettings({ ...base, ...patch });
}

export function validateScraperQbittorrentSettings(
  input: unknown,
  fallback: ScraperQbittorrentSettings,
  issues: ScraperSettingsIssue[],
  prefix: string,
): ScraperQbittorrentSettings {
  const source = isRecord(input) ? input : {};

  // A plaintext password must never survive into a persisted document. Older
  // hand-written configs and naive imports are the realistic sources of one.
  if ('password' in source) {
    issues.push({
      path: `${prefix}.password`,
      message: 'Removed a plaintext password. Store credentials in the OS keychain.',
    });
  }

  const host = normalizeHost(source.host);
  if (source.host !== undefined && !host) {
    issues.push({ path: `${prefix}.host`, message: 'Expected a hostname or IP address.' });
  }

  // Leading slash, no trailing slash — so callers can always concatenate.
  const rawBase = stringValue(source.basePath, fallback.basePath, 120, `${prefix}.basePath`, issues)
    .trim()
    .replace(/\/+$/, '');
  const basePath = rawBase && !rawBase.startsWith('/') ? `/${rawBase}` : rawBase;

  return {
    enabled: booleanValue(source.enabled, fallback.enabled, `${prefix}.enabled`, issues),
    scheme: enumValue(source.scheme, ['http', 'https'] as const, fallback.scheme, `${prefix}.scheme`, issues),
    host: host ?? fallback.host,
    port: boundedNumber(source.port, fallback.port, 1, 65_535, `${prefix}.port`, issues),
    basePath,
    username: stringValue(source.username, fallback.username, 120, `${prefix}.username`, issues),
    passwordRef: stringValue(
      source.passwordRef,
      fallback.passwordRef,
      256,
      `${prefix}.passwordRef`,
      issues,
    ),
    connectionStatus: enumValue(
      source.connectionStatus,
      SCRAPER_QBIT_STATUSES,
      fallback.connectionStatus,
      `${prefix}.connectionStatus`,
      issues,
    ),
    lastCheckedAt: nullableDateValue(
      source.lastCheckedAt,
      fallback.lastCheckedAt,
      `${prefix}.lastCheckedAt`,
      issues,
    ),
    category: stringValue(source.category, fallback.category, 120, `${prefix}.category`, issues),
    tags: stringListValue(source.tags, fallback.tags, `${prefix}.tags`, issues, 20),
    savePath: stringValue(source.savePath, fallback.savePath, 1_024, `${prefix}.savePath`, issues),
    addMode: enumValue(
      source.addMode,
      SCRAPER_QBIT_ADD_MODES,
      fallback.addMode,
      `${prefix}.addMode`,
      issues,
    ),
    contentLayout: enumValue(
      source.contentLayout,
      SCRAPER_QBIT_LAYOUTS,
      fallback.contentLayout,
      `${prefix}.contentLayout`,
      issues,
    ),
    sequentialDownload: booleanValue(
      source.sequentialDownload,
      fallback.sequentialDownload,
      `${prefix}.sequentialDownload`,
      issues,
    ),
    firstLastPiecePriority: booleanValue(
      source.firstLastPiecePriority,
      fallback.firstLastPiecePriority,
      `${prefix}.firstLastPiecePriority`,
      issues,
    ),
    skipHashCheck: booleanValue(
      source.skipHashCheck,
      fallback.skipHashCheck,
      `${prefix}.skipHashCheck`,
      issues,
    ),
    autoTmm: booleanValue(source.autoTmm, fallback.autoTmm, `${prefix}.autoTmm`, issues),
    ratioLimit: boundedNumber(
      source.ratioLimit,
      fallback.ratioLimit,
      -1,
      10_000,
      `${prefix}.ratioLimit`,
      issues,
    ),
    seedingTimeLimitMin: boundedNumber(
      source.seedingTimeLimitMin,
      fallback.seedingTimeLimitMin,
      -1,
      525_600,
      `${prefix}.seedingTimeLimitMin`,
      issues,
    ),
    uploadLimitKbps: boundedNumber(
      source.uploadLimitKbps,
      fallback.uploadLimitKbps,
      0,
      10_000_000,
      `${prefix}.uploadLimitKbps`,
      issues,
    ),
    downloadLimitKbps: boundedNumber(
      source.downloadLimitKbps,
      fallback.downloadLimitKbps,
      0,
      10_000_000,
      `${prefix}.downloadLimitKbps`,
      issues,
    ),
    renameTemplate: stringValue(
      source.renameTemplate,
      fallback.renameTemplate,
      240,
      `${prefix}.renameTemplate`,
      issues,
    ),
  };
}
