/**
 * MASTER_PLAN.md §2 — Connection Profiles.
 *
 * Deliberately a *layer over* §1 (`scraperSettings.ts`), not a second copy of it.
 * §1 already owns the settings shape (network / browser / session / cache / safety /
 * authentication / extraction / episodeProcessing), its validator, its presets and its
 * per-site overrides. Re-declaring any of that here would create exactly the duplicate
 * system §21 exists to remove.
 *
 * What §2 adds on top, and what lives in this file:
 *   - named profiles carrying icon + tags + built-in flag,
 *   - **rule inheritance** — a profile resolves its parent first, then applies its own
 *     sparse overrides (§2 "one profile inherits from another and overrides only a few
 *     settings"),
 *   - the six built-in preset profiles §2 names by hand,
 *   - monitoring (response time, success/failure rate, last successful scrape, error
 *     categories, request history, per-profile performance statistics),
 *   - logging (network / browser / parsing / error channels, debug gate, export,
 *     performance timeline),
 *   - profile comparison,
 *   - a diagnostics summary (connection quality, parsing success, cache efficiency),
 *   - scheduled health checks,
 *   - a batch queue with pause/resume and priority.
 *
 * Purity contract, identical to `mediaFileIdentity.ts` / `scraperSettings.ts`:
 * no I/O, no `Date.now()`, no `Math.random()`. Every function that needs "now" or a new
 * id takes it as an argument, so the whole module is deterministic and resumable.
 * Nothing here opens a socket — §2 is configuration and record-keeping; the connectors
 * that would honour it are still out of scope.
 */

import {
  DEFAULT_SCRAPER_SETTINGS,
  mergeScraperSettings,
  normalizeScraperSite,
  type ScraperBrowserSettings,
  type ScraperCacheSettings,
  type ScraperEpisodeProcessingSettings,
  type ScraperExtractionSettings,
  type ScraperNetworkSettings,
  type ScraperSafetySettings,
  type ScraperSessionSettings,
  type ScraperSettings,
  type ScraperSettingsValidationResult,
} from './scraperSettings';

export const CONNECTION_PROFILES_VERSION = 1;
export const CONNECTION_PROFILE_HISTORY_LIMIT = 20;
export const CONNECTION_ATTEMPT_HISTORY_LIMIT = 200;
export const CONNECTION_LOG_LIMIT = 500;
export const CONNECTION_RECENT_DURATION_LIMIT = 50;
/** Guards a hand-edited or imported `inheritsFrom` chain from running away. */
export const CONNECTION_INHERITANCE_DEPTH_LIMIT = 12;

export const DEFAULT_CONNECTION_PROFILE_ID = 'balanced';

export type ConnectionPresetId =
  | 'fast'
  | 'balanced'
  | 'conservative'
  | 'metadata-only'
  | 'browser-assisted'
  | 'low-bandwidth'
  | 'custom';

/** Built-in presets in §2's own order. `custom` is not a preset, it is the absence of one. */
export const CONNECTION_PRESET_IDS = [
  'fast',
  'balanced',
  'conservative',
  'metadata-only',
  'browser-assisted',
  'low-bandwidth',
] as const satisfies readonly Exclude<ConnectionPresetId, 'custom'>[];

/**
 * Icon *identifiers*, not glyphs. The renderer maps these onto its own icon set, so a
 * profile exported from one build still renders on a build whose icon names differ.
 */
export type ConnectionProfileIcon =
  | 'bolt'
  | 'scale'
  | 'shield'
  | 'tag'
  | 'browser'
  | 'signal'
  | 'gear';

export const CONNECTION_PROFILE_ICONS = [
  'bolt',
  'scale',
  'shield',
  'tag',
  'browser',
  'signal',
  'gear',
] as const satisfies readonly ConnectionProfileIcon[];

/** A sparse patch over `ScraperSettings`; the same shape §1's `patchScraperProfile` takes. */
export interface ConnectionOverrides {
  network?: Partial<ScraperNetworkSettings>;
  browser?: Partial<ScraperBrowserSettings>;
  session?: Partial<ScraperSessionSettings>;
  cache?: Partial<ScraperCacheSettings>;
  safety?: Partial<ScraperSafetySettings>;
  extraction?: Partial<ScraperExtractionSettings>;
  episodeProcessing?: Partial<ScraperEpisodeProcessingSettings>;
}

const OVERRIDE_SECTIONS = [
  'network',
  'browser',
  'session',
  'cache',
  'safety',
  'extraction',
  'episodeProcessing',
] as const;

type OverrideSection = (typeof OVERRIDE_SECTIONS)[number];

/**
 * `authentication` is deliberately *not* an overridable section. It holds account
 * labels and opaque credential references; inheriting one profile's account into
 * another silently is the kind of surprise §2's Safety section exists to prevent.
 * Authentication stays a §1 per-profile concern.
 */

export interface ConnectionProfileVersion {
  id: string;
  createdAt: string;
  reason: string;
  preset: ConnectionPresetId;
  inheritsFrom: string | null;
  overrides: ConnectionOverrides;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  description: string;
  icon: ConnectionProfileIcon;
  tags: string[];
  preset: ConnectionPresetId;
  /** Built-in profiles can be edited and cloned but never deleted. */
  builtIn: boolean;
  /** Rule inheritance. `null` means "start from the base settings". */
  inheritsFrom: string | null;
  overrides: ConnectionOverrides;
  createdAt: string;
  updatedAt: string;
  history: ConnectionProfileVersion[];
  /** Scheduled health checks; `0` disables them for this profile. */
  healthCheckIntervalMinutes: number;
  lastHealthCheckAt: string | null;
}

export type ConnectionErrorCategory =
  | 'timeout'
  | 'dns'
  | 'tls'
  | 'http-4xx'
  | 'http-5xx'
  | 'parse'
  | 'blocked'
  | 'offline'
  | 'cancelled'
  | 'unknown';

export const CONNECTION_ERROR_CATEGORIES = [
  'timeout',
  'dns',
  'tls',
  'http-4xx',
  'http-5xx',
  'parse',
  'blocked',
  'offline',
  'cancelled',
  'unknown',
] as const satisfies readonly ConnectionErrorCategory[];

/** One recorded request. Callers build these; this module never performs one. */
export interface ConnectionAttempt {
  id: string;
  profileId: string;
  site: string;
  startedAt: string;
  durationMs: number;
  outcome: 'success' | 'failure';
  /** HTTP status when there was one; `null` for transport-level failures. */
  status: number | null;
  bytes: number;
  fromCache: boolean;
  /** Whether extraction produced a usable result. Only meaningful on a success. */
  parsed: boolean;
  errorCategory: ConnectionErrorCategory | null;
}

export interface ConnectionProfileStats {
  attempts: number;
  successes: number;
  failures: number;
  cacheHits: number;
  parseAttempts: number;
  parseSuccesses: number;
  totalDurationMs: number;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  totalBytes: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  errorCategories: Record<string, number>;
  /** Rolling window used for percentiles; capped so the store stays small. */
  recentDurationsMs: number[];
}

export type ConnectionLogChannel = 'network' | 'browser' | 'parsing' | 'error';
export type ConnectionLogLevel = 'debug' | 'info' | 'warn' | 'error';

export const CONNECTION_LOG_CHANNELS = [
  'network',
  'browser',
  'parsing',
  'error',
] as const satisfies readonly ConnectionLogChannel[];

export const CONNECTION_LOG_LEVELS = [
  'debug',
  'info',
  'warn',
  'error',
] as const satisfies readonly ConnectionLogLevel[];

/**
 * `code` is a stable identifier, never an English sentence — the renderer is the only
 * place that calls `t()` on it. Same contract as `AssetError` in the download manager.
 */
export interface ConnectionLogEntry {
  id: string;
  at: string;
  profileId: string;
  channel: ConnectionLogChannel;
  level: ConnectionLogLevel;
  code: string;
  detail: Record<string, string | number | boolean>;
  durationMs: number | null;
}

export type ConnectionQueueState =
  | 'queued'
  | 'running'
  | 'paused'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface ConnectionQueueItem {
  id: string;
  profileId: string;
  site: string;
  label: string;
  /** Higher runs first. Ties break on `enqueuedAt`, then id, so ordering is total. */
  priority: number;
  state: ConnectionQueueState;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  errorCategory: ConnectionErrorCategory | null;
}

export interface ConnectionQueue {
  paused: boolean;
  concurrency: number;
  items: ConnectionQueueItem[];
}

export interface ConnectionProfilesDocument {
  version: typeof CONNECTION_PROFILES_VERSION;
  activeProfileId: string;
  profiles: ConnectionProfile[];
  /** Hostname → profile id. Which profile a site uses; the settings themselves stay in §1. */
  siteAssignments: Record<string, string>;
  stats: Record<string, ConnectionProfileStats>;
  attemptHistory: ConnectionAttempt[];
  logs: ConnectionLogEntry[];
  /** Debug mode keeps `debug`-level entries; otherwise they are dropped at append time. */
  debugMode: boolean;
  queue: ConnectionQueue;
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

/**
 * Presets are *sparse overrides*, not full settings snapshots. That is the whole point
 * of §2 inheritance: "Conservative" says what it changes about the base and nothing
 * more, so a later change to the shared base reaches every preset for free.
 */
export const CONNECTION_PRESET_OVERRIDES: Record<
  Exclude<ConnectionPresetId, 'custom'>,
  ConnectionOverrides
> = {
  fast: {
    network: {
      concurrentRequests: 8,
      retryAttempts: 1,
      retryDelayMs: 250,
      requestTimeoutMs: 15_000,
      randomDelayMinMs: 0,
      randomDelayMaxMs: 100,
    },
    safety: { crawlDelayMs: 0, maxRequestsPerMinute: 240 },
    cache: { lifetimeMinutes: 720 },
  },
  // The neutral profile: everything comes from the base. Deliberately empty.
  balanced: {},
  conservative: {
    network: {
      concurrentRequests: 1,
      retryAttempts: 4,
      retryDelayMs: 4_000,
      requestTimeoutMs: 60_000,
      randomDelayMinMs: 1_500,
      randomDelayMaxMs: 5_000,
    },
    safety: {
      respectRobotsTxt: true,
      crawlDelayMs: 3_000,
      maxRequestsPerMinute: 12,
      pauseAfterFailures: 3,
      pauseDurationMs: 600_000,
    },
  },
  'metadata-only': {
    // No rendered pages and no artwork: fetch descriptive data, nothing heavy.
    browser: { headless: true, waitForNetworkIdle: false, scrollBeforeScraping: false, javascriptWaitMs: 0 },
    cache: { thumbnailsEnabled: false, htmlEnabled: false, metadataEnabled: true },
    network: { concurrentRequests: 3, requestTimeoutMs: 20_000 },
  },
  'browser-assisted': {
    browser: {
      headless: true,
      waitForNetworkIdle: true,
      scrollBeforeScraping: true,
      javascriptWaitMs: 4_000,
      scrollPasses: 4,
    },
    network: { concurrentRequests: 2, requestTimeoutMs: 90_000 },
    safety: { crawlDelayMs: 2_000, maxRequestsPerMinute: 30 },
  },
  'low-bandwidth': {
    network: { concurrentRequests: 1, requestTimeoutMs: 120_000, retryAttempts: 5, retryDelayMs: 6_000 },
    cache: { thumbnailsEnabled: false, lifetimeMinutes: 10_080, maxSizeMb: 256 },
    safety: { crawlDelayMs: 4_000, maxRequestsPerMinute: 8 },
  },
};

const PRESET_ICONS: Record<Exclude<ConnectionPresetId, 'custom'>, ConnectionProfileIcon> = {
  fast: 'bolt',
  balanced: 'scale',
  conservative: 'shield',
  'metadata-only': 'tag',
  'browser-assisted': 'browser',
  'low-bandwidth': 'signal',
};

/**
 * Tags are stable English identifiers used for filtering, not display copy — the panel
 * shows them verbatim the same way `scraperSettings` shows a preset id. They are part
 * of the exported document, so translating them would break portability.
 */
const PRESET_TAGS: Record<Exclude<ConnectionPresetId, 'custom'>, string[]> = {
  fast: ['speed', 'parallel'],
  balanced: ['default'],
  conservative: ['polite', 'robots'],
  'metadata-only': ['metadata', 'light'],
  'browser-assisted': ['javascript', 'rendered'],
  'low-bandwidth': ['bandwidth', 'mobile'],
};

// ---------------------------------------------------------------------------
// Small validation helpers (same conventions as scraperSettings.ts)
// ---------------------------------------------------------------------------

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : value;
}

function uniqueStrings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

/** Rebuilds an overrides patch from known keys only, so a stale shape cannot persist. */
function sanitizeOverrides(value: unknown): ConnectionOverrides {
  if (!isRecord(value)) return {};
  const template = DEFAULT_SCRAPER_SETTINGS as unknown as Record<string, UnknownRecord>;
  const out: Record<string, UnknownRecord> = {};
  for (const section of OVERRIDE_SECTIONS) {
    const raw = value[section];
    if (!isRecord(raw)) continue;
    const known = template[section];
    const patch: UnknownRecord = {};
    for (const [key, entry] of Object.entries(raw)) {
      if (!(key in known)) continue;
      const shape = known[key];
      if (shape === null) {
        // `session.expiresAt` / `lastValidatedAt` default to null, so the default value
        // cannot describe their real type. They are the nullable-timestamp fields.
        if (entry === null || typeof entry === 'string') patch[key] = entry;
        continue;
      }
      if (typeof entry !== typeof shape) {
        // Arrays and records are both `object`; keep only matching container kinds.
        continue;
      }
      if (Array.isArray(shape) !== Array.isArray(entry)) continue;
      if (entry === null) continue;
      patch[key] = entry;
    }
    if (Object.keys(patch).length) out[section] = patch;
  }
  return out as ConnectionOverrides;
}

function emptyStats(): ConnectionProfileStats {
  return {
    attempts: 0,
    successes: 0,
    failures: 0,
    cacheHits: 0,
    parseAttempts: 0,
    parseSuccesses: 0,
    totalDurationMs: 0,
    minDurationMs: null,
    maxDurationMs: null,
    totalBytes: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    errorCategories: {},
    recentDurationsMs: [],
  };
}

// ---------------------------------------------------------------------------
// Document construction
// ---------------------------------------------------------------------------

export function createConnectionProfile(
  preset: Exclude<ConnectionPresetId, 'custom'>,
  now: string,
): ConnectionProfile {
  return {
    id: preset,
    // Display names for built-ins are the preset id: the panel resolves an i18n key
    // (`connection.preset.<id>`) and only falls back to this when a key is missing.
    name: preset,
    description: '',
    icon: PRESET_ICONS[preset],
    tags: [...PRESET_TAGS[preset]],
    preset,
    builtIn: true,
    inheritsFrom: null,
    overrides: structuredCopy(CONNECTION_PRESET_OVERRIDES[preset]),
    createdAt: now,
    updatedAt: now,
    history: [],
    healthCheckIntervalMinutes: 0,
    lastHealthCheckAt: null,
  };
}

function structuredCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDefaultConnectionProfilesDocument(
  now = new Date().toISOString(),
): ConnectionProfilesDocument {
  return {
    version: CONNECTION_PROFILES_VERSION,
    activeProfileId: DEFAULT_CONNECTION_PROFILE_ID,
    profiles: CONNECTION_PRESET_IDS.map((preset) => createConnectionProfile(preset, now)),
    siteAssignments: {},
    stats: {},
    attemptHistory: [],
    logs: [],
    debugMode: false,
    queue: { paused: false, concurrency: 2, items: [] },
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeProfile(
  value: unknown,
  index: number,
  now: string,
  issues: ScraperSettingsIssue[],
): ConnectionProfile | null {
  if (!isRecord(value)) {
    issues.push({ path: `profiles[${index}]`, message: 'Profile entry is not an object.' });
    return null;
  }
  const id = str(value.id).trim();
  if (!id) {
    issues.push({ path: `profiles[${index}].id`, message: 'Profile is missing an id.' });
    return null;
  }
  const preset = oneOf<ConnectionPresetId>(
    value.preset,
    [...CONNECTION_PRESET_IDS, 'custom'],
    'custom',
  );
  const inheritsFromRaw = str(value.inheritsFrom).trim();
  return {
    id,
    name: str(value.name, id).slice(0, 120) || id,
    description: str(value.description).slice(0, 500),
    icon: oneOf(value.icon, CONNECTION_PROFILE_ICONS, 'gear'),
    tags: uniqueStrings(value.tags, 12),
    preset,
    builtIn: bool(value.builtIn, (CONNECTION_PRESET_IDS as readonly string[]).includes(id)),
    inheritsFrom: inheritsFromRaw && inheritsFromRaw !== id ? inheritsFromRaw : null,
    overrides: sanitizeOverrides(value.overrides),
    createdAt: isoOrNull(value.createdAt) ?? now,
    updatedAt: isoOrNull(value.updatedAt) ?? now,
    history: normalizeHistory(value.history, now),
    healthCheckIntervalMinutes: int(value.healthCheckIntervalMinutes, 0, 0, 10_080),
    lastHealthCheckAt: isoOrNull(value.lastHealthCheckAt),
  };
}

function normalizeHistory(value: unknown, now: string): ConnectionProfileVersion[] {
  if (!Array.isArray(value)) return [];
  const out: ConnectionProfileVersion[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = str(entry.id).trim();
    if (!id) continue;
    const inheritsFrom = str(entry.inheritsFrom).trim();
    out.push({
      id,
      createdAt: isoOrNull(entry.createdAt) ?? now,
      reason: str(entry.reason, 'edit').slice(0, 120),
      preset: oneOf<ConnectionPresetId>(entry.preset, [...CONNECTION_PRESET_IDS, 'custom'], 'custom'),
      inheritsFrom: inheritsFrom || null,
      overrides: sanitizeOverrides(entry.overrides),
    });
    if (out.length >= CONNECTION_PROFILE_HISTORY_LIMIT) break;
  }
  return out;
}

function normalizeStats(value: unknown): ConnectionProfileStats {
  if (!isRecord(value)) return emptyStats();
  const base = emptyStats();
  const categories: Record<string, number> = {};
  if (isRecord(value.errorCategories)) {
    for (const category of CONNECTION_ERROR_CATEGORIES) {
      const count = int(value.errorCategories[category], 0, 0, Number.MAX_SAFE_INTEGER);
      if (count > 0) categories[category] = count;
    }
  }
  const durations = Array.isArray(value.recentDurationsMs)
    ? value.recentDurationsMs
        .filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0)
        .slice(-CONNECTION_RECENT_DURATION_LIMIT)
        .map((entry) => Math.round(entry))
    : [];
  const minRaw = value.minDurationMs;
  const maxRaw = value.maxDurationMs;
  return {
    ...base,
    attempts: int(value.attempts, 0, 0, Number.MAX_SAFE_INTEGER),
    successes: int(value.successes, 0, 0, Number.MAX_SAFE_INTEGER),
    failures: int(value.failures, 0, 0, Number.MAX_SAFE_INTEGER),
    cacheHits: int(value.cacheHits, 0, 0, Number.MAX_SAFE_INTEGER),
    parseAttempts: int(value.parseAttempts, 0, 0, Number.MAX_SAFE_INTEGER),
    parseSuccesses: int(value.parseSuccesses, 0, 0, Number.MAX_SAFE_INTEGER),
    totalDurationMs: int(value.totalDurationMs, 0, 0, Number.MAX_SAFE_INTEGER),
    minDurationMs: typeof minRaw === 'number' && Number.isFinite(minRaw) ? Math.max(0, Math.round(minRaw)) : null,
    maxDurationMs: typeof maxRaw === 'number' && Number.isFinite(maxRaw) ? Math.max(0, Math.round(maxRaw)) : null,
    totalBytes: int(value.totalBytes, 0, 0, Number.MAX_SAFE_INTEGER),
    lastAttemptAt: isoOrNull(value.lastAttemptAt),
    lastSuccessAt: isoOrNull(value.lastSuccessAt),
    lastFailureAt: isoOrNull(value.lastFailureAt),
    errorCategories: categories,
    recentDurationsMs: durations,
  };
}

function normalizeAttempt(value: unknown, now: string): ConnectionAttempt | null {
  if (!isRecord(value)) return null;
  const id = str(value.id).trim();
  const profileId = str(value.profileId).trim();
  if (!id || !profileId) return null;
  const outcome = oneOf<'success' | 'failure'>(value.outcome, ['success', 'failure'], 'failure');
  const status = typeof value.status === 'number' && Number.isFinite(value.status)
    ? int(value.status, 0, 0, 599)
    : null;
  return {
    id,
    profileId,
    site: normalizeScraperSite(str(value.site)) ?? str(value.site).trim().toLowerCase(),
    startedAt: isoOrNull(value.startedAt) ?? now,
    durationMs: int(value.durationMs, 0, 0, 86_400_000),
    outcome,
    status,
    bytes: int(value.bytes, 0, 0, Number.MAX_SAFE_INTEGER),
    fromCache: bool(value.fromCache, false),
    parsed: bool(value.parsed, false),
    errorCategory: outcome === 'failure'
      ? oneOf(value.errorCategory, CONNECTION_ERROR_CATEGORIES, 'unknown')
      : null,
  };
}

function normalizeLogEntry(value: unknown, now: string): ConnectionLogEntry | null {
  if (!isRecord(value)) return null;
  const id = str(value.id).trim();
  const code = str(value.code).trim();
  if (!id || !code) return null;
  const detail: Record<string, string | number | boolean> = {};
  if (isRecord(value.detail)) {
    for (const [key, entry] of Object.entries(value.detail)) {
      if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
        detail[key] = entry;
      }
    }
  }
  const durationRaw = value.durationMs;
  return {
    id,
    at: isoOrNull(value.at) ?? now,
    profileId: str(value.profileId).trim(),
    channel: oneOf(value.channel, CONNECTION_LOG_CHANNELS, 'network'),
    level: oneOf(value.level, CONNECTION_LOG_LEVELS, 'info'),
    code: code.slice(0, 120),
    detail,
    durationMs: typeof durationRaw === 'number' && Number.isFinite(durationRaw)
      ? Math.max(0, Math.round(durationRaw))
      : null,
  };
}

function normalizeQueueItem(value: unknown, now: string): ConnectionQueueItem | null {
  if (!isRecord(value)) return null;
  const id = str(value.id).trim();
  const profileId = str(value.profileId).trim();
  if (!id || !profileId) return null;
  const state = oneOf<ConnectionQueueState>(
    value.state,
    ['queued', 'running', 'paused', 'done', 'failed', 'cancelled'],
    'queued',
  );
  return {
    id,
    profileId,
    site: normalizeScraperSite(str(value.site)) ?? '',
    label: str(value.label).slice(0, 200),
    priority: int(value.priority, 0, -100, 100),
    state,
    enqueuedAt: isoOrNull(value.enqueuedAt) ?? now,
    startedAt: isoOrNull(value.startedAt),
    finishedAt: isoOrNull(value.finishedAt),
    attempts: int(value.attempts, 0, 0, 10_000),
    errorCategory: state === 'failed'
      ? oneOf(value.errorCategory, CONNECTION_ERROR_CATEGORIES, 'unknown')
      : null,
  };
}

/**
 * Rebuilds the whole document from known keys only. An unrecognised key is dropped
 * rather than carried forward, so a stale shape can never persist across a version.
 */
export function normalizeConnectionProfilesDocument(
  input: unknown,
  now = new Date().toISOString(),
): ScraperSettingsValidationResult<ConnectionProfilesDocument> {
  const issues: ScraperSettingsIssue[] = [];
  const raw = isRecord(input) ? input : {};
  if (!isRecord(input)) {
    issues.push({ path: '', message: 'Connection profiles document is not an object.' });
  }

  const profiles: ConnectionProfile[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.profiles)) {
    raw.profiles.forEach((entry, index) => {
      const profile = normalizeProfile(entry, index, now, issues);
      if (!profile) return;
      if (seen.has(profile.id)) {
        issues.push({ path: `profiles[${index}].id`, message: `Duplicate profile id "${profile.id}".` });
        return;
      }
      seen.add(profile.id);
      profiles.push(profile);
    });
  }
  // Built-ins are restored rather than invented: a document that lost "conservative"
  // gets it back with its stock overrides instead of silently losing a preset.
  for (const preset of CONNECTION_PRESET_IDS) {
    if (seen.has(preset)) continue;
    profiles.push(createConnectionProfile(preset, now));
    seen.add(preset);
  }

  // Drop inheritance edges that point nowhere; keep the profile itself.
  for (const profile of profiles) {
    if (profile.inheritsFrom && !seen.has(profile.inheritsFrom)) {
      issues.push({
        path: `profiles.${profile.id}.inheritsFrom`,
        message: `Unknown parent profile "${profile.inheritsFrom}".`,
      });
      profile.inheritsFrom = null;
    }
  }
  breakInheritanceCycles(profiles, issues);

  const activeCandidate = str(raw.activeProfileId).trim();
  const activeProfileId = seen.has(activeCandidate) ? activeCandidate : DEFAULT_CONNECTION_PROFILE_ID;
  if (activeCandidate && activeCandidate !== activeProfileId) {
    issues.push({ path: 'activeProfileId', message: `Unknown profile "${activeCandidate}".` });
  }

  const siteAssignments: Record<string, string> = {};
  if (isRecord(raw.siteAssignments)) {
    for (const [site, profileId] of Object.entries(raw.siteAssignments)) {
      const host = normalizeScraperSite(site);
      if (!host) {
        issues.push({ path: `siteAssignments.${site}`, message: 'Invalid hostname.' });
        continue;
      }
      if (typeof profileId !== 'string' || !seen.has(profileId)) {
        issues.push({ path: `siteAssignments.${site}`, message: 'Unknown profile.' });
        continue;
      }
      siteAssignments[host] = profileId;
    }
  }

  const stats: Record<string, ConnectionProfileStats> = {};
  if (isRecord(raw.stats)) {
    for (const [profileId, value] of Object.entries(raw.stats)) {
      if (!seen.has(profileId)) continue;
      stats[profileId] = normalizeStats(value);
    }
  }

  const attemptHistory = (Array.isArray(raw.attemptHistory) ? raw.attemptHistory : [])
    .map((entry) => normalizeAttempt(entry, now))
    .filter((entry): entry is ConnectionAttempt => entry !== null && seen.has(entry.profileId))
    .slice(-CONNECTION_ATTEMPT_HISTORY_LIMIT);

  const logs = (Array.isArray(raw.logs) ? raw.logs : [])
    .map((entry) => normalizeLogEntry(entry, now))
    .filter((entry): entry is ConnectionLogEntry => entry !== null)
    .slice(-CONNECTION_LOG_LIMIT);

  const queueRaw = isRecord(raw.queue) ? raw.queue : {};
  const queue: ConnectionQueue = {
    paused: bool(queueRaw.paused, false),
    concurrency: int(queueRaw.concurrency, 2, 1, 16),
    items: (Array.isArray(queueRaw.items) ? queueRaw.items : [])
      .map((entry) => normalizeQueueItem(entry, now))
      .filter((entry): entry is ConnectionQueueItem => entry !== null && seen.has(entry.profileId)),
  };

  return {
    value: {
      version: CONNECTION_PROFILES_VERSION,
      activeProfileId,
      profiles,
      siteAssignments,
      stats,
      attemptHistory,
      logs,
      debugMode: bool(raw.debugMode, false),
      queue,
    },
    issues,
  };
}

/**
 * A hand-edited or merged export can describe `a → b → a`. Resolution would then either
 * loop forever or silently pick a winner, so cycles are cut here, once, at the edge that
 * closes them, and reported as an issue.
 */
function breakInheritanceCycles(profiles: ConnectionProfile[], issues: ScraperSettingsIssue[]): void {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  for (const profile of profiles) {
    const path = new Set<string>([profile.id]);
    let current = profile;
    let depth = 0;
    while (current.inheritsFrom) {
      if (depth >= CONNECTION_INHERITANCE_DEPTH_LIMIT) {
        issues.push({
          path: `profiles.${current.id}.inheritsFrom`,
          message: 'Inheritance chain is too deep.',
        });
        current.inheritsFrom = null;
        break;
      }
      if (path.has(current.inheritsFrom)) {
        issues.push({
          path: `profiles.${current.id}.inheritsFrom`,
          message: 'Inheritance cycle removed.',
        });
        current.inheritsFrom = null;
        break;
      }
      const parent = byId.get(current.inheritsFrom);
      if (!parent) break;
      path.add(parent.id);
      current = parent;
      depth += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Resolution (inheritance)
// ---------------------------------------------------------------------------

export function findConnectionProfile(
  document: ConnectionProfilesDocument,
  profileId: string,
): ConnectionProfile | null {
  return document.profiles.find((profile) => profile.id === profileId) ?? null;
}

/**
 * Root → leaf order, so the leaf's overrides are applied last and win.
 * Cycle-guarded even though `normalize` already cut cycles: this function is also
 * reachable from an in-memory document a caller built by hand.
 */
export function connectionInheritanceChain(
  document: ConnectionProfilesDocument,
  profileId: string,
): ConnectionProfile[] {
  const chain: ConnectionProfile[] = [];
  const seen = new Set<string>();
  let current = findConnectionProfile(document, profileId);
  while (current && !seen.has(current.id) && chain.length < CONNECTION_INHERITANCE_DEPTH_LIMIT) {
    seen.add(current.id);
    chain.push(current);
    current = current.inheritsFrom ? findConnectionProfile(document, current.inheritsFrom) : null;
  }
  return chain.reverse();
}

export function resolveConnectionSettings(
  document: ConnectionProfilesDocument,
  profileId: string,
  base: ScraperSettings = DEFAULT_SCRAPER_SETTINGS,
): ScraperSettings {
  let settings = base;
  for (const profile of connectionInheritanceChain(document, profileId)) {
    settings = mergeScraperSettings(settings, profile.overrides);
  }
  return settings;
}

/** Which profile a site uses: its explicit assignment, else the active profile. */
export function profileForSite(document: ConnectionProfilesDocument, site?: string): string {
  if (!site) return document.activeProfileId;
  const host = normalizeScraperSite(site);
  if (!host) return document.activeProfileId;
  return document.siteAssignments[host] ?? document.activeProfileId;
}

export function resolveConnectionSettingsForSite(
  document: ConnectionProfilesDocument,
  site?: string,
  base: ScraperSettings = DEFAULT_SCRAPER_SETTINGS,
): ScraperSettings {
  return resolveConnectionSettings(document, profileForSite(document, site), base);
}

// ---------------------------------------------------------------------------
// Profile mutations
// ---------------------------------------------------------------------------

function withProfile(
  document: ConnectionProfilesDocument,
  profileId: string,
  update: (profile: ConnectionProfile) => ConnectionProfile,
): ConnectionProfilesDocument {
  let touched = false;
  const profiles = document.profiles.map((profile) => {
    if (profile.id !== profileId) return profile;
    touched = true;
    return update(profile);
  });
  if (!touched) throw new Error(`Unknown connection profile "${profileId}".`);
  return { ...document, profiles };
}

function pushHistory(profile: ConnectionProfile, reason: string, versionId: string, now: string): ConnectionProfileVersion[] {
  const version: ConnectionProfileVersion = {
    id: versionId,
    createdAt: now,
    reason,
    preset: profile.preset,
    inheritsFrom: profile.inheritsFrom,
    overrides: structuredCopy(profile.overrides),
  };
  return [version, ...profile.history].slice(0, CONNECTION_PROFILE_HISTORY_LIMIT);
}

export function patchConnectionProfile(
  document: ConnectionProfilesDocument,
  profileId: string,
  overrides: ConnectionOverrides,
  options: { now: string; versionId: string },
): ConnectionProfilesDocument {
  const patch = sanitizeOverrides(overrides);
  return withProfile(document, profileId, (profile) => {
    const merged: ConnectionOverrides = structuredCopy(profile.overrides);
    for (const section of OVERRIDE_SECTIONS) {
      const incoming = patch[section];
      if (!incoming) continue;
      const target = (merged as Record<OverrideSection, UnknownRecord | undefined>)[section] ?? {};
      (merged as Record<OverrideSection, UnknownRecord>)[section] = { ...target, ...incoming };
    }
    return {
      ...profile,
      history: pushHistory(profile, 'edit', options.versionId, options.now),
      overrides: merged,
      // Any manual change detaches the profile from its preset, exactly as §1 does.
      preset: 'custom',
      updatedAt: options.now,
    };
  });
}

export function applyConnectionPreset(
  document: ConnectionProfilesDocument,
  profileId: string,
  preset: Exclude<ConnectionPresetId, 'custom'>,
  options: { now: string; versionId: string },
): ConnectionProfilesDocument {
  return withProfile(document, profileId, (profile) => ({
    ...profile,
    history: pushHistory(profile, 'preset', options.versionId, options.now),
    preset,
    overrides: structuredCopy(CONNECTION_PRESET_OVERRIDES[preset]),
    updatedAt: options.now,
  }));
}

export function updateConnectionProfileDetails(
  document: ConnectionProfilesDocument,
  profileId: string,
  details: {
    name?: string;
    description?: string;
    icon?: ConnectionProfileIcon;
    tags?: string[];
    healthCheckIntervalMinutes?: number;
  },
  now: string,
): ConnectionProfilesDocument {
  if (details.name !== undefined && !details.name.trim()) {
    throw new Error('A profile name cannot be empty.');
  }
  return withProfile(document, profileId, (profile) => ({
    ...profile,
    name: details.name !== undefined ? details.name.trim().slice(0, 120) : profile.name,
    description: details.description !== undefined ? details.description.slice(0, 500) : profile.description,
    icon: details.icon !== undefined ? oneOf(details.icon, CONNECTION_PROFILE_ICONS, profile.icon) : profile.icon,
    tags: details.tags !== undefined ? uniqueStrings(details.tags, 12) : profile.tags,
    healthCheckIntervalMinutes: details.healthCheckIntervalMinutes !== undefined
      ? int(details.healthCheckIntervalMinutes, profile.healthCheckIntervalMinutes, 0, 10_080)
      : profile.healthCheckIntervalMinutes,
    updatedAt: now,
  }));
}

export function setConnectionProfileParent(
  document: ConnectionProfilesDocument,
  profileId: string,
  parentId: string | null,
  now: string,
): ConnectionProfilesDocument {
  if (parentId) {
    if (parentId === profileId) throw new Error('A profile cannot inherit from itself.');
    if (!findConnectionProfile(document, parentId)) throw new Error(`Unknown connection profile "${parentId}".`);
    // Walk up from the candidate parent: if this profile is already above it, the edge
    // would close a cycle. Reject rather than silently rewriting someone else's tree.
    for (const ancestor of connectionInheritanceChain(document, parentId)) {
      if (ancestor.id === profileId) throw new Error('That parent would create an inheritance cycle.');
    }
  }
  return withProfile(document, profileId, (profile) => ({
    ...profile,
    inheritsFrom: parentId,
    updatedAt: now,
  }));
}

export function cloneConnectionProfile(
  document: ConnectionProfilesDocument,
  sourceId: string,
  options: { id: string; name: string; now: string; inherit?: boolean },
): ConnectionProfilesDocument {
  const source = findConnectionProfile(document, sourceId);
  if (!source) throw new Error(`Unknown connection profile "${sourceId}".`);
  const id = options.id.trim();
  if (!id) throw new Error('A profile id cannot be empty.');
  if (findConnectionProfile(document, id)) throw new Error(`Profile "${id}" already exists.`);
  const name = options.name.trim();
  if (!name) throw new Error('A profile name cannot be empty.');
  const clone: ConnectionProfile = {
    ...structuredCopy(source),
    id,
    name: name.slice(0, 120),
    builtIn: false,
    history: [],
    createdAt: options.now,
    updatedAt: options.now,
    lastHealthCheckAt: null,
    // "Clone and inherit" keeps the copy thin: it starts empty and tracks its source.
    // A plain clone snapshots the resolved overrides and stands alone.
    ...(options.inherit
      ? { inheritsFrom: sourceId, overrides: {}, preset: 'custom' as ConnectionPresetId }
      : {}),
  };
  return { ...document, profiles: [...document.profiles, clone] };
}

export function deleteConnectionProfile(
  document: ConnectionProfilesDocument,
  profileId: string,
): ConnectionProfilesDocument {
  const profile = findConnectionProfile(document, profileId);
  if (!profile) throw new Error(`Unknown connection profile "${profileId}".`);
  if (profile.builtIn) throw new Error('Built-in profiles cannot be deleted.');
  const profiles = document.profiles
    .filter((entry) => entry.id !== profileId)
    // Children re-point at the deleted profile's own parent so the tree stays connected
    // instead of silently flattening a whole branch back to the base.
    .map((entry) => (entry.inheritsFrom === profileId ? { ...entry, inheritsFrom: profile.inheritsFrom } : entry));
  const siteAssignments = Object.fromEntries(
    Object.entries(document.siteAssignments).filter(([, id]) => id !== profileId),
  );
  const stats = Object.fromEntries(Object.entries(document.stats).filter(([id]) => id !== profileId));
  return {
    ...document,
    profiles,
    siteAssignments,
    stats,
    activeProfileId: document.activeProfileId === profileId
      ? DEFAULT_CONNECTION_PROFILE_ID
      : document.activeProfileId,
    attemptHistory: document.attemptHistory.filter((entry) => entry.profileId !== profileId),
    queue: {
      ...document.queue,
      items: document.queue.items.filter((item) => item.profileId !== profileId),
    },
  };
}

export function rollbackConnectionProfile(
  document: ConnectionProfilesDocument,
  profileId: string,
  versionId: string,
  options: { now: string; versionId: string },
): ConnectionProfilesDocument {
  return withProfile(document, profileId, (profile) => {
    const version = profile.history.find((entry) => entry.id === versionId);
    if (!version) throw new Error('That version is no longer available.');
    return {
      ...profile,
      // Rollback is itself a change, so the state being replaced is snapshotted first.
      history: pushHistory(profile, 'rollback', options.versionId, options.now),
      preset: version.preset,
      inheritsFrom: version.inheritsFrom,
      overrides: structuredCopy(version.overrides),
      updatedAt: options.now,
    };
  });
}

export function setActiveConnectionProfile(
  document: ConnectionProfilesDocument,
  profileId: string,
): ConnectionProfilesDocument {
  if (!findConnectionProfile(document, profileId)) {
    throw new Error(`Unknown connection profile "${profileId}".`);
  }
  return { ...document, activeProfileId: profileId };
}

export function assignSiteProfile(
  document: ConnectionProfilesDocument,
  site: string,
  profileId: string,
): ConnectionProfilesDocument {
  const host = normalizeScraperSite(site);
  if (!host) throw new Error('Enter a hostname such as example.org.');
  if (!findConnectionProfile(document, profileId)) {
    throw new Error(`Unknown connection profile "${profileId}".`);
  }
  return { ...document, siteAssignments: { ...document.siteAssignments, [host]: profileId } };
}

export function clearSiteProfile(
  document: ConnectionProfilesDocument,
  site: string,
): ConnectionProfilesDocument {
  const host = normalizeScraperSite(site) ?? site;
  const siteAssignments = { ...document.siteAssignments };
  delete siteAssignments[host];
  return { ...document, siteAssignments };
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

function foldAttempt(stats: ConnectionProfileStats, attempt: ConnectionAttempt): ConnectionProfileStats {
  const next: ConnectionProfileStats = {
    ...stats,
    attempts: stats.attempts + 1,
    successes: stats.successes + (attempt.outcome === 'success' ? 1 : 0),
    failures: stats.failures + (attempt.outcome === 'failure' ? 1 : 0),
    cacheHits: stats.cacheHits + (attempt.fromCache ? 1 : 0),
    totalDurationMs: stats.totalDurationMs + attempt.durationMs,
    totalBytes: stats.totalBytes + attempt.bytes,
    minDurationMs: stats.minDurationMs === null
      ? attempt.durationMs
      : Math.min(stats.minDurationMs, attempt.durationMs),
    maxDurationMs: stats.maxDurationMs === null
      ? attempt.durationMs
      : Math.max(stats.maxDurationMs, attempt.durationMs),
    lastAttemptAt: attempt.startedAt,
    lastSuccessAt: attempt.outcome === 'success' ? attempt.startedAt : stats.lastSuccessAt,
    lastFailureAt: attempt.outcome === 'failure' ? attempt.startedAt : stats.lastFailureAt,
    errorCategories: { ...stats.errorCategories },
    recentDurationsMs: [...stats.recentDurationsMs, attempt.durationMs].slice(-CONNECTION_RECENT_DURATION_LIMIT),
  };
  // Parsing is only counted where it was actually attempted. A cache hit or a transport
  // failure never reached the parser, and counting those as parse failures would make
  // the parsing-success figure track network health instead of selector health.
  if (attempt.outcome === 'success' && !attempt.fromCache) {
    next.parseAttempts = stats.parseAttempts + 1;
    next.parseSuccesses = stats.parseSuccesses + (attempt.parsed ? 1 : 0);
  }
  if (attempt.errorCategory) {
    next.errorCategories[attempt.errorCategory] = (stats.errorCategories[attempt.errorCategory] ?? 0) + 1;
  }
  return next;
}

export function recordConnectionAttempt(
  document: ConnectionProfilesDocument,
  attempt: ConnectionAttempt,
): ConnectionProfilesDocument {
  if (!findConnectionProfile(document, attempt.profileId)) {
    throw new Error(`Unknown connection profile "${attempt.profileId}".`);
  }
  const current = document.stats[attempt.profileId] ?? emptyStats();
  const withAttempt: ConnectionProfilesDocument = {
    ...document,
    stats: { ...document.stats, [attempt.profileId]: foldAttempt(current, attempt) },
    attemptHistory: [...document.attemptHistory, attempt].slice(-CONNECTION_ATTEMPT_HISTORY_LIMIT),
  };
  return appendConnectionLog(withAttempt, {
    id: `log-${attempt.id}`,
    at: attempt.startedAt,
    profileId: attempt.profileId,
    channel: attempt.outcome === 'failure' ? 'error' : 'network',
    level: attempt.outcome === 'failure' ? 'warn' : 'debug',
    code: attempt.outcome === 'failure'
      ? `connection.attempt.failed.${attempt.errorCategory ?? 'unknown'}`
      : 'connection.attempt.succeeded',
    detail: {
      site: attempt.site,
      status: attempt.status ?? 0,
      cached: attempt.fromCache,
    },
    durationMs: attempt.durationMs,
  });
}

export function connectionStatsFor(
  document: ConnectionProfilesDocument,
  profileId: string,
): ConnectionProfileStats {
  return document.stats[profileId] ?? emptyStats();
}

export interface ConnectionPerformance {
  profileId: string;
  attempts: number;
  successRate: number;
  failureRate: number;
  averageResponseMs: number;
  p50ResponseMs: number;
  p95ResponseMs: number;
  cacheHitRate: number;
  parseSuccessRate: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  topErrors: Array<{ category: ConnectionErrorCategory; count: number }>;
}

function percentile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 0;
  // Nearest-rank: with 20 samples p95 is the 19th, which is what an operator expects
  // from "95% of requests were at least this fast".
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : 0;
}

export function profilePerformance(
  document: ConnectionProfilesDocument,
  profileId: string,
): ConnectionPerformance {
  const stats = connectionStatsFor(document, profileId);
  const sorted = [...stats.recentDurationsMs].sort((left, right) => left - right);
  const topErrors = (Object.entries(stats.errorCategories) as Array<[ConnectionErrorCategory, number]>)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([category, count]) => ({ category, count }));
  return {
    profileId,
    attempts: stats.attempts,
    successRate: ratio(stats.successes, stats.attempts),
    failureRate: ratio(stats.failures, stats.attempts),
    averageResponseMs: stats.attempts ? Math.round(stats.totalDurationMs / stats.attempts) : 0,
    p50ResponseMs: percentile(sorted, 0.5),
    p95ResponseMs: percentile(sorted, 0.95),
    cacheHitRate: ratio(stats.cacheHits, stats.attempts),
    parseSuccessRate: ratio(stats.parseSuccesses, stats.parseAttempts),
    lastSuccessAt: stats.lastSuccessAt,
    lastFailureAt: stats.lastFailureAt,
    topErrors,
  };
}

export function requestHistoryFor(
  document: ConnectionProfilesDocument,
  profileId: string,
  limit = 50,
): ConnectionAttempt[] {
  return document.attemptHistory
    .filter((attempt) => attempt.profileId === profileId)
    .slice(-Math.max(0, limit))
    .reverse();
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Stable note identifiers; the renderer maps each to a `connection.note.*` i18n key. */
export type ConnectionDiagnosticNote =
  | 'no-data'
  | 'low-success'
  | 'high-latency'
  | 'latency-spread'
  | 'parse-drift'
  | 'cache-cold'
  | 'healthy';

export interface ConnectionDiagnostics {
  profileId: string;
  /** 0–100. Blends success rate with median latency. */
  connectionQuality: number;
  /** 0–100 share of fetched pages that parsed. */
  parsingSuccess: number;
  /** 0–100 share of requests served from cache. */
  cacheEfficiency: number;
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  notes: ConnectionDiagnosticNote[];
}

/**
 * Latency → 0–100. 250 ms or better scores 100, 8 s or worse scores 0, linear between.
 * The bounds are deliberately generous: this measures a scraper against sites it does
 * not control, not a local API.
 */
function latencyScore(ms: number): number {
  if (ms <= 250) return 100;
  if (ms >= 8_000) return 0;
  return Math.round(100 - ((ms - 250) / (8_000 - 250)) * 100);
}

export function diagnoseConnectionProfile(
  document: ConnectionProfilesDocument,
  profileId: string,
): ConnectionDiagnostics {
  const performance = profilePerformance(document, profileId);
  if (!performance.attempts) {
    return {
      profileId,
      connectionQuality: 0,
      parsingSuccess: 0,
      cacheEfficiency: 0,
      score: 0,
      grade: 'unknown',
      notes: ['no-data'],
    };
  }
  const connectionQuality = Math.round(
    performance.successRate * 100 * 0.7 + latencyScore(performance.p50ResponseMs) * 0.3,
  );
  const stats = connectionStatsFor(document, profileId);
  // With nothing parsed yet the figure is "not measured", not "0% success" — reporting
  // a hard zero here would drag the score down for a cache-only or metadata profile.
  const parsingSuccess = stats.parseAttempts ? Math.round(performance.parseSuccessRate * 100) : 100;
  const cacheEfficiency = Math.round(performance.cacheHitRate * 100);
  const score = Math.round(connectionQuality * 0.55 + parsingSuccess * 0.3 + cacheEfficiency * 0.15);

  const notes: ConnectionDiagnosticNote[] = [];
  if (performance.successRate < 0.9) notes.push('low-success');
  if (performance.p50ResponseMs > 3_000) notes.push('high-latency');
  if (performance.p95ResponseMs > performance.p50ResponseMs * 4 && performance.p50ResponseMs > 0) {
    notes.push('latency-spread');
  }
  if (stats.parseAttempts >= 5 && performance.parseSuccessRate < 0.85) notes.push('parse-drift');
  if (performance.attempts >= 20 && performance.cacheHitRate < 0.05) notes.push('cache-cold');
  if (!notes.length) notes.push('healthy');

  return {
    profileId,
    connectionQuality,
    parsingSuccess,
    cacheEfficiency,
    score,
    grade: score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 55 ? 'fair' : 'poor',
    notes,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface ConnectionProfileDifference {
  path: string;
  left: unknown;
  right: unknown;
}

function flatten(settings: ScraperSettings): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [section, values] of Object.entries(settings as unknown as Record<string, UnknownRecord>)) {
    for (const [key, value] of Object.entries(values)) {
      out.set(`${section}.${key}`, value);
    }
  }
  return out;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  // Arrays and record fields (headers, domain rate limits) need structural equality;
  // JSON is enough because every settings value is a JSON primitive or container.
  if (typeof left === 'object' && typeof right === 'object' && left !== null && right !== null) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

/**
 * Compares the two profiles' *resolved* settings, so an inherited value shows up as
 * equal rather than as "missing on the left". A comparison of raw overrides would say
 * two profiles differ when they behave identically.
 */
export function compareConnectionProfiles(
  document: ConnectionProfilesDocument,
  leftId: string,
  rightId: string,
  base: ScraperSettings = DEFAULT_SCRAPER_SETTINGS,
): ConnectionProfileDifference[] {
  const left = flatten(resolveConnectionSettings(document, leftId, base));
  const right = flatten(resolveConnectionSettings(document, rightId, base));
  const out: ConnectionProfileDifference[] = [];
  for (const [path, value] of left) {
    const other = right.get(path);
    if (!sameValue(value, other)) out.push({ path, left: value, right: other });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export function appendConnectionLog(
  document: ConnectionProfilesDocument,
  entry: ConnectionLogEntry,
): ConnectionProfilesDocument {
  // The debug gate lives here rather than at each call site, so turning debug mode off
  // is genuinely quiet instead of quiet-in-most-places.
  if (entry.level === 'debug' && !document.debugMode) return document;
  return { ...document, logs: [...document.logs, entry].slice(-CONNECTION_LOG_LIMIT) };
}

export function setConnectionDebugMode(
  document: ConnectionProfilesDocument,
  debugMode: boolean,
): ConnectionProfilesDocument {
  return { ...document, debugMode };
}

export function clearConnectionLogs(document: ConnectionProfilesDocument): ConnectionProfilesDocument {
  return { ...document, logs: [] };
}

export function filterConnectionLogs(
  document: ConnectionProfilesDocument,
  filter: { profileId?: string; channel?: ConnectionLogChannel; level?: ConnectionLogLevel } = {},
): ConnectionLogEntry[] {
  const minimum = filter.level ? CONNECTION_LOG_LEVELS.indexOf(filter.level) : 0;
  return document.logs.filter((entry) => {
    if (filter.profileId && entry.profileId !== filter.profileId) return false;
    if (filter.channel && entry.channel !== filter.channel) return false;
    return CONNECTION_LOG_LEVELS.indexOf(entry.level) >= minimum;
  });
}

/** Newline-delimited JSON: appendable, greppable, and safe to truncate mid-file. */
export function exportConnectionLogs(
  document: ConnectionProfilesDocument,
  filter?: Parameters<typeof filterConnectionLogs>[1],
): string {
  return filterConnectionLogs(document, filter)
    .map((entry) => JSON.stringify(entry))
    .join('\n');
}

export interface ConnectionTimelineBucket {
  startedAt: string;
  attempts: number;
  successes: number;
  failures: number;
  averageResponseMs: number;
}

/**
 * Performance timeline: attempts folded into fixed-width buckets. Empty buckets are
 * emitted too, so a gap in activity reads as a gap instead of being closed up.
 */
export function connectionTimeline(
  document: ConnectionProfilesDocument,
  profileId: string,
  options: { bucketMinutes?: number; buckets?: number; now: string },
): ConnectionTimelineBucket[] {
  const bucketMinutes = Math.max(1, Math.round(options.bucketMinutes ?? 60));
  const count = Math.max(1, Math.min(240, Math.round(options.buckets ?? 12)));
  const width = bucketMinutes * 60_000;
  const end = Date.parse(options.now);
  if (Number.isNaN(end)) return [];
  const start = end - width * count;

  const out: ConnectionTimelineBucket[] = Array.from({ length: count }, (_, index) => ({
    startedAt: new Date(start + index * width).toISOString(),
    attempts: 0,
    successes: 0,
    failures: 0,
    averageResponseMs: 0,
  }));
  const totals = new Array<number>(count).fill(0);

  for (const attempt of document.attemptHistory) {
    if (attempt.profileId !== profileId) continue;
    const at = Date.parse(attempt.startedAt);
    if (Number.isNaN(at) || at < start || at >= end) continue;
    const index = Math.min(count - 1, Math.floor((at - start) / width));
    const bucket = out[index];
    bucket.attempts += 1;
    if (attempt.outcome === 'success') bucket.successes += 1;
    else bucket.failures += 1;
    totals[index] += attempt.durationMs;
  }
  return out.map((bucket, index) => ({
    ...bucket,
    averageResponseMs: bucket.attempts ? Math.round(totals[index] / bucket.attempts) : 0,
  }));
}

// ---------------------------------------------------------------------------
// Scheduled health checks
// ---------------------------------------------------------------------------

export function dueHealthChecks(document: ConnectionProfilesDocument, now: string): ConnectionProfile[] {
  const at = Date.parse(now);
  if (Number.isNaN(at)) return [];
  return document.profiles.filter((profile) => {
    if (profile.healthCheckIntervalMinutes <= 0) return false;
    if (!profile.lastHealthCheckAt) return true;
    const last = Date.parse(profile.lastHealthCheckAt);
    if (Number.isNaN(last)) return true;
    return at - last >= profile.healthCheckIntervalMinutes * 60_000;
  });
}

export function markHealthChecked(
  document: ConnectionProfilesDocument,
  profileId: string,
  now: string,
): ConnectionProfilesDocument {
  return withProfile(document, profileId, (profile) => ({ ...profile, lastHealthCheckAt: now }));
}

// ---------------------------------------------------------------------------
// Batch queue
// ---------------------------------------------------------------------------

export function enqueueConnectionJob(
  document: ConnectionProfilesDocument,
  job: { id: string; profileId: string; site: string; label?: string; priority?: number },
  now: string,
): ConnectionProfilesDocument {
  if (!findConnectionProfile(document, job.profileId)) {
    throw new Error(`Unknown connection profile "${job.profileId}".`);
  }
  if (document.queue.items.some((item) => item.id === job.id)) {
    throw new Error(`Job "${job.id}" is already queued.`);
  }
  const item: ConnectionQueueItem = {
    id: job.id,
    profileId: job.profileId,
    site: normalizeScraperSite(job.site) ?? '',
    label: (job.label ?? job.site).slice(0, 200),
    priority: int(job.priority ?? 0, 0, -100, 100),
    state: 'queued',
    enqueuedAt: now,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    errorCategory: null,
  };
  return { ...document, queue: { ...document.queue, items: [...document.queue.items, item] } };
}

function withQueueItem(
  document: ConnectionProfilesDocument,
  jobId: string,
  update: (item: ConnectionQueueItem) => ConnectionQueueItem,
): ConnectionProfilesDocument {
  let touched = false;
  const items = document.queue.items.map((item) => {
    if (item.id !== jobId) return item;
    touched = true;
    return update(item);
  });
  if (!touched) throw new Error(`Unknown queued job "${jobId}".`);
  return { ...document, queue: { ...document.queue, items } };
}

export function setConnectionJobPriority(
  document: ConnectionProfilesDocument,
  jobId: string,
  priority: number,
): ConnectionProfilesDocument {
  return withQueueItem(document, jobId, (item) => ({ ...item, priority: int(priority, 0, -100, 100) }));
}

export function setConnectionQueuePaused(
  document: ConnectionProfilesDocument,
  paused: boolean,
): ConnectionProfilesDocument {
  return { ...document, queue: { ...document.queue, paused } };
}

export function setConnectionQueueConcurrency(
  document: ConnectionProfilesDocument,
  concurrency: number,
): ConnectionProfilesDocument {
  return { ...document, queue: { ...document.queue, concurrency: int(concurrency, 2, 1, 16) } };
}

export function cancelConnectionJob(
  document: ConnectionProfilesDocument,
  jobId: string,
  now: string,
): ConnectionProfilesDocument {
  return withQueueItem(document, jobId, (item) =>
    item.state === 'done' || item.state === 'cancelled'
      ? item
      : { ...item, state: 'cancelled', finishedAt: now });
}

export function clearFinishedConnectionJobs(
  document: ConnectionProfilesDocument,
): ConnectionProfilesDocument {
  const items = document.queue.items.filter(
    (item) => item.state !== 'done' && item.state !== 'cancelled' && item.state !== 'failed',
  );
  return { ...document, queue: { ...document.queue, items } };
}

/**
 * The jobs that should start now: nothing while paused, never more than `concurrency`
 * running in total, highest priority first, then FIFO, then id. Total ordering matters —
 * two jobs enqueued in the same millisecond must still have a defined winner or the
 * queue is non-deterministic across reloads.
 */
export function nextConnectionJobs(document: ConnectionProfilesDocument): ConnectionQueueItem[] {
  if (document.queue.paused) return [];
  const running = document.queue.items.filter((item) => item.state === 'running').length;
  const slots = document.queue.concurrency - running;
  if (slots <= 0) return [];
  return document.queue.items
    .filter((item) => item.state === 'queued')
    .sort((left, right) =>
      right.priority - left.priority
      || left.enqueuedAt.localeCompare(right.enqueuedAt)
      || left.id.localeCompare(right.id))
    .slice(0, slots);
}

export function markConnectionJobStarted(
  document: ConnectionProfilesDocument,
  jobId: string,
  now: string,
): ConnectionProfilesDocument {
  return withQueueItem(document, jobId, (item) => ({
    ...item,
    state: 'running',
    startedAt: now,
    attempts: item.attempts + 1,
    errorCategory: null,
  }));
}

export function markConnectionJobFinished(
  document: ConnectionProfilesDocument,
  jobId: string,
  outcome: { state: 'done' | 'failed'; errorCategory?: ConnectionErrorCategory },
  now: string,
): ConnectionProfilesDocument {
  return withQueueItem(document, jobId, (item) => ({
    ...item,
    state: outcome.state,
    finishedAt: now,
    errorCategory: outcome.state === 'failed' ? (outcome.errorCategory ?? 'unknown') : null,
  }));
}

// ---------------------------------------------------------------------------
// Portability
// ---------------------------------------------------------------------------

export interface ConnectionProfilesExport {
  version: typeof CONNECTION_PROFILES_VERSION;
  activeProfileId: string;
  profiles: ConnectionProfile[];
  siteAssignments: Record<string, string>;
}

/**
 * Export carries configuration only. Stats, request history, logs and the queue are
 * this machine's operational record — shipping them to another install would import
 * someone else's health scores as if they were yours.
 */
export function exportConnectionProfiles(document: ConnectionProfilesDocument): ConnectionProfilesExport {
  return {
    version: CONNECTION_PROFILES_VERSION,
    activeProfileId: document.activeProfileId,
    profiles: structuredCopy(document.profiles),
    siteAssignments: { ...document.siteAssignments },
  };
}

export function importConnectionProfiles(
  current: ConnectionProfilesDocument,
  input: unknown,
  now = new Date().toISOString(),
): ScraperSettingsValidationResult<ConnectionProfilesDocument> {
  if (isRecord(input) && typeof input.version === 'number' && input.version > CONNECTION_PROFILES_VERSION) {
    throw new Error('These connection profiles were created by a newer app version.');
  }
  const normalized = normalizeConnectionProfilesDocument(
    {
      ...(isRecord(input) ? input : {}),
      // Operational record stays local: an import replaces configuration, never history.
      stats: current.stats,
      attemptHistory: current.attemptHistory,
      logs: current.logs,
      debugMode: current.debugMode,
      queue: current.queue,
    },
    now,
  );
  // Assignments and stats are keyed by profile id; drop any that the import removed.
  const known = new Set(normalized.value.profiles.map((profile) => profile.id));
  normalized.value.stats = Object.fromEntries(
    Object.entries(normalized.value.stats).filter(([id]) => known.has(id)),
  );
  normalized.value.attemptHistory = normalized.value.attemptHistory.filter((entry) => known.has(entry.profileId));
  normalized.value.queue.items = normalized.value.queue.items.filter((item) => known.has(item.profileId));
  return normalized;
}
