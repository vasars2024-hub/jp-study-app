import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  DEFAULT_SCRAPER_SOURCE_SETTINGS,
  DEFAULT_SCRAPER_TORRENT_SETTINGS,
  cloneScraperQbittorrentSettings,
  cloneScraperSourceSettings,
  cloneScraperTorrentSettings,
  mergeScraperQbittorrentSettings,
  mergeScraperSourceSettings,
  mergeScraperTorrentSettings,
  validateScraperQbittorrentSettings,
  validateScraperSourceSettings,
  validateScraperTorrentSettings,
  type ScraperQbittorrentSettings,
  type ScraperSourceSettings,
  type ScraperTorrentSettings,
} from './scraperSourceSettings';
import {
  DEFAULT_SCRAPER_DEVELOPER_SETTINGS,
  DEFAULT_SCRAPER_EXPORT_SETTINGS,
  DEFAULT_SCRAPER_IMAGE_SETTINGS,
  DEFAULT_SCRAPER_LOGGING_SETTINGS,
  DEFAULT_SCRAPER_METADATA_SETTINGS,
  DEFAULT_SCRAPER_NOTIFICATION_SETTINGS,
  DEFAULT_SCRAPER_PERFORMANCE_SETTINGS,
  DEFAULT_SCRAPER_SCHEDULER_SETTINGS,
  DEFAULT_SCRAPER_VALIDATION_SETTINGS,
  cloneScraperOutputGroup,
  validateScraperDeveloperSettings,
  validateScraperExportSettings,
  validateScraperImageSettings,
  validateScraperLoggingSettings,
  validateScraperMetadataSettings,
  validateScraperNotificationSettings,
  validateScraperPerformanceSettings,
  validateScraperSchedulerSettings,
  validateScraperValidationSettings,
  type ScraperDeveloperSettings,
  type ScraperExportSettings,
  type ScraperImageSettings,
  type ScraperLoggingSettings,
  type ScraperMetadataSettings,
  type ScraperNotificationSettings,
  type ScraperPerformanceSettings,
  type ScraperSchedulerSettings,
  type ScraperValidationSettings,
} from './scraperOutputSettings';
import {
  booleanValue,
  boundedNumber,
  isRecord,
  nullableDateValue,
  numberListValue,
  recordAt,
  safeId,
  stringListValue,
  stringValue,
  type ScraperSettingsIssue,
  type UnknownRecord,
} from './scraperSettingsPrimitives';
import type { ScraperSiteRule } from './scraperSiteRules';

/**
 * v3 added twelve groups (sources, torrents, qbittorrent, images, metadata,
 * performance, logging, validation, export, scheduler, notifications,
 * developer). No migration step is needed to read a v1 or v2 document:
 * validateScraperSettings falls back *per field* to DEFAULT_SCRAPER_SETTINGS,
 * so groups that simply aren't there normalize to their defaults, and
 * normalizeScraperSettingsDocument rewrites `version` unconditionally. The
 * guard against a *newer* version is what this constant really protects.
 */
export const SCRAPER_SETTINGS_VERSION = 3;
export const SCRAPER_PROFILE_HISTORY_LIMIT = 20;
export const DEFAULT_SCRAPER_PROFILE_ID = 'balanced';

export type ScraperPresetId = 'fast' | 'balanced' | 'thorough' | 'custom';
export type ScraperBrowserEngine = 'chromium' | 'firefox';
export type ScraperAudioPreference = 'subbed' | 'dubbed' | 'raw' | 'none';
export type ScraperCacheMode = 'standard' | 'offline';
export type ScraperLoginStatus = 'not-configured' | 'signed-out' | 'signed-in' | 'expired' | 'unknown';

export interface ScraperNetworkSettings {
  userAgent: string;
  headers: Record<string, string>;
  cookieHeader: string;
  proxyUrl: string;
  proxyRotation: string[];
  retryAttempts: number;
  retryDelayMs: number;
  requestTimeoutMs: number;
  concurrentRequests: number;
  randomDelayMinMs: number;
  randomDelayMaxMs: number;
  followRedirects: boolean;
  verifySsl: boolean;
}

/**
 * Headless-browser options that nothing drives.
 *
 * 2026-08-02: this project has no browser-automation dependency and none is
 * planned, so every field here is stored, validated and never read by a scrape.
 * The Scraper's Advanced Settings drawer no longer offers them — the 'browser'
 * category and its nine controls were deleted from
 * `renderer/components/scraper/settings/fields.ts`, along with the `set.browser`
 * build-status dot.
 *
 * The group itself survives because two things outside the Scraper still name
 * it: `shared/connectionProfiles.ts` (the 'browser-assisted' and 'metadata-only'
 * presets are defined largely in terms of these values) and the main Settings
 * app's Scraper page. Removing it means retiring a user-visible connection
 * preset and its catalog keys, which belongs to that feature, not this one.
 * Until then: do not wire anything to these, and do not add fields here.
 */
export interface ScraperBrowserSettings {
  engine: ScraperBrowserEngine;
  headless: boolean;
  viewportWidth: number;
  viewportHeight: number;
  javascriptWaitMs: number;
  waitForNetworkIdle: boolean;
  scrollBeforeScraping: boolean;
  scrollSpeedPxPerSecond: number;
  scrollPasses: number;
  preExtractionScript: string;
}

export interface ScraperSessionSettings {
  consistentFingerprint: boolean;
  persistAuthenticatedSession: boolean;
  sessionLabel: string;
  expiresAt: string | null;
  lastValidatedAt: string | null;
}

export interface ScraperCacheSettings {
  mode: ScraperCacheMode;
  htmlEnabled: boolean;
  metadataEnabled: boolean;
  thumbnailsEnabled: boolean;
  lifetimeMinutes: number;
  maxSizeMb: number;
}

export interface ScraperSafetySettings {
  respectRobotsTxt: boolean;
  crawlDelayMs: number;
  maxRequestsPerMinute: number;
  pauseAfterFailures: number;
  pauseDurationMs: number;
  domainRateLimits: Record<string, number>;
}

export interface ScraperAuthenticationSettings {
  loginStatus: ScraperLoginStatus;
  accountLabel: string;
  credentialRef: string;
  cookieJarRef: string;
  manualLoginRequired: boolean;
}

export interface ScraperExtractionSettings {
  cssSelectors: string[];
  xpathSelectors: string[];
  regexPattern: string;
  regexFlags: string;
  attribute: string;
  ignoreHiddenElements: boolean;
  cleanText: boolean;
  decodeHtmlEntities: boolean;
  removeDuplicateEpisodes: boolean;
  normalizeEpisodeNumbering: boolean;
  detectSeasonNumbers: boolean;
  detectSpecials: boolean;
  /**
   * Per-host selector sets, used when a target is not in any catalogue. Lives
   * under `extraction` rather than in its own section because that is exactly
   * what it is — extraction configuration, scoped to a host.
   */
  siteRules: ScraperSiteRule[];
}

export interface ScraperEpisodeProcessingSettings {
  naturalSort: boolean;
  detectMissingNumbers: boolean;
  mergeDuplicateSources: boolean;
  keepHighestQuality: boolean;
  audioPreference: ScraperAudioPreference;
  languagePriority: string[];
  resolutionPriority: number[];
  ignoreFiller: boolean;
  ignoreRecaps: boolean;
  renameEpisodes: boolean;
}

export interface ScraperSettings {
  network: ScraperNetworkSettings;
  browser: ScraperBrowserSettings;
  session: ScraperSessionSettings;
  cache: ScraperCacheSettings;
  safety: ScraperSafetySettings;
  authentication: ScraperAuthenticationSettings;
  extraction: ScraperExtractionSettings;
  episodeProcessing: ScraperEpisodeProcessingSettings;
  // ---- v3 ----
  sources: ScraperSourceSettings;
  torrents: ScraperTorrentSettings;
  qbittorrent: ScraperQbittorrentSettings;
  images: ScraperImageSettings;
  metadata: ScraperMetadataSettings;
  performance: ScraperPerformanceSettings;
  logging: ScraperLoggingSettings;
  validation: ScraperValidationSettings;
  export: ScraperExportSettings;
  scheduler: ScraperSchedulerSettings;
  notifications: ScraperNotificationSettings;
  developer: ScraperDeveloperSettings;
}

export interface ScraperSettingsProfile {
  id: string;
  name: string;
  description: string;
  preset: ScraperPresetId;
  createdAt: string;
  updatedAt: string;
  settings: ScraperSettings;
  history: ScraperProfileVersion[];
}

export interface ScraperProfileVersion {
  id: string;
  createdAt: string;
  reason: string;
  preset: ScraperPresetId;
  settings: ScraperSettings;
}

export interface ScraperSiteOverride {
  /** Optional profile to inherit before applying this site's settings snapshot. */
  profileId?: string;
  settings: ScraperSettings;
}

export interface ScraperSettingsDocument {
  version: typeof SCRAPER_SETTINGS_VERSION;
  activeProfileId: string;
  profiles: ScraperSettingsProfile[];
  siteOverrides: Record<string, ScraperSiteOverride>;
}

export interface ScraperSettingsValidationResult<T> {
  value: T;
  issues: ScraperSettingsIssue[];
}

/**
 * Exported so renderer/scraperSettingsStore.ts can take a patch without
 * maintaining its own hand-written copy of this shape — one that silently
 * stopped covering half the model when v3 added twelve groups.
 */
export type ScraperSettingsPatch = {
  network?: Partial<ScraperNetworkSettings>;
  browser?: Partial<ScraperBrowserSettings>;
  session?: Partial<ScraperSessionSettings>;
  cache?: Partial<ScraperCacheSettings>;
  safety?: Partial<ScraperSafetySettings>;
  authentication?: Partial<ScraperAuthenticationSettings>;
  extraction?: Partial<ScraperExtractionSettings>;
  episodeProcessing?: Partial<ScraperEpisodeProcessingSettings>;
  // v3
  sources?: Partial<ScraperSourceSettings>;
  torrents?: Partial<ScraperTorrentSettings>;
  qbittorrent?: Partial<ScraperQbittorrentSettings>;
  images?: Partial<ScraperImageSettings>;
  metadata?: Partial<ScraperMetadataSettings>;
  performance?: Partial<ScraperPerformanceSettings>;
  logging?: Partial<ScraperLoggingSettings>;
  validation?: Partial<ScraperValidationSettings>;
  export?: Partial<ScraperExportSettings>;
  scheduler?: Partial<ScraperSchedulerSettings>;
  notifications?: Partial<ScraperNotificationSettings>;
  developer?: Partial<ScraperDeveloperSettings>;
};

type SettingsPatch = ScraperSettingsPatch;

const BALANCED_SETTINGS: ScraperSettings = {
  network: {
    userAgent: '',
    headers: {},
    cookieHeader: '',
    proxyUrl: '',
    proxyRotation: [],
    retryAttempts: 3,
    retryDelayMs: 1_000,
    requestTimeoutMs: 30_000,
    concurrentRequests: 4,
    randomDelayMinMs: 350,
    randomDelayMaxMs: 900,
    followRedirects: true,
    verifySsl: true,
  },
  browser: {
    engine: 'chromium',
    headless: true,
    viewportWidth: 1_440,
    viewportHeight: 900,
    javascriptWaitMs: 15_000,
    waitForNetworkIdle: true,
    scrollBeforeScraping: false,
    scrollSpeedPxPerSecond: 600,
    scrollPasses: 2,
    preExtractionScript: '',
  },
  session: {
    consistentFingerprint: true,
    persistAuthenticatedSession: true,
    sessionLabel: '',
    expiresAt: null,
    lastValidatedAt: null,
  },
  cache: {
    mode: 'standard',
    htmlEnabled: true,
    metadataEnabled: true,
    thumbnailsEnabled: true,
    lifetimeMinutes: 1_440,
    maxSizeMb: 512,
  },
  safety: {
    respectRobotsTxt: true,
    crawlDelayMs: 500,
    maxRequestsPerMinute: 60,
    pauseAfterFailures: 5,
    pauseDurationMs: 60_000,
    domainRateLimits: {},
  },
  authentication: {
    loginStatus: 'not-configured',
    accountLabel: '',
    credentialRef: '',
    cookieJarRef: '',
    manualLoginRequired: false,
  },
  extraction: {
    cssSelectors: ['a[href*="episode"]'],
    xpathSelectors: [],
    regexPattern: '',
    regexFlags: 'i',
    attribute: 'href',
    ignoreHiddenElements: true,
    cleanText: true,
    decodeHtmlEntities: true,
    removeDuplicateEpisodes: true,
    normalizeEpisodeNumbering: true,
    detectSeasonNumbers: true,
    detectSpecials: true,
    // No rules by default: a shipped rule for a site nobody has visited would
    // be a guess, and a wrong guess here silently mis-parses a real page.
    siteRules: [],
  },
  episodeProcessing: {
    naturalSort: true,
    detectMissingNumbers: true,
    mergeDuplicateSources: true,
    keepHighestQuality: true,
    audioPreference: 'subbed',
    languagePriority: ['ja', 'en'],
    resolutionPriority: [2160, 1080, 720, 480],
    ignoreFiller: false,
    ignoreRecaps: false,
    renameEpisodes: false,
  },
  // v3 groups keep their own module's defaults rather than restating them, so
  // there is exactly one place to change a default value.
  sources: DEFAULT_SCRAPER_SOURCE_SETTINGS,
  torrents: DEFAULT_SCRAPER_TORRENT_SETTINGS,
  qbittorrent: DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  images: DEFAULT_SCRAPER_IMAGE_SETTINGS,
  metadata: DEFAULT_SCRAPER_METADATA_SETTINGS,
  performance: DEFAULT_SCRAPER_PERFORMANCE_SETTINGS,
  logging: DEFAULT_SCRAPER_LOGGING_SETTINGS,
  validation: DEFAULT_SCRAPER_VALIDATION_SETTINGS,
  export: DEFAULT_SCRAPER_EXPORT_SETTINGS,
  scheduler: DEFAULT_SCRAPER_SCHEDULER_SETTINGS,
  notifications: DEFAULT_SCRAPER_NOTIFICATION_SETTINGS,
  developer: DEFAULT_SCRAPER_DEVELOPER_SETTINGS,
};

const PRESET_PATCHES: Record<Exclude<ScraperPresetId, 'custom'>, SettingsPatch> = {
  fast: {
    network: {
      retryAttempts: 1,
      retryDelayMs: 400,
      requestTimeoutMs: 15_000,
      concurrentRequests: 8,
      randomDelayMinMs: 100,
      randomDelayMaxMs: 350,
    },
    browser: {
      javascriptWaitMs: 7_500,
      waitForNetworkIdle: false,
      scrollBeforeScraping: false,
      scrollPasses: 1,
    },
    // Deliberately minimal: the presets are distinguished by pacing, and
    // widening them per group would make "what does Fast actually change?"
    // impossible to answer.
    performance: { maxParallelJobs: 8 },
    logging: { level: 'warn' },
  },
  balanced: {},
  thorough: {
    network: {
      retryAttempts: 5,
      retryDelayMs: 2_000,
      requestTimeoutMs: 60_000,
      concurrentRequests: 2,
      randomDelayMinMs: 900,
      randomDelayMaxMs: 2_400,
    },
    browser: {
      javascriptWaitMs: 30_000,
      waitForNetworkIdle: true,
      scrollBeforeScraping: true,
      scrollSpeedPxPerSecond: 350,
      scrollPasses: 4,
    },
    performance: { maxParallelJobs: 2 },
    logging: { level: 'debug' },
  },
};

function cloneSettings(settings: ScraperSettings): ScraperSettings {
  return {
    network: {
      ...settings.network,
      headers: { ...settings.network.headers },
      proxyRotation: [...settings.network.proxyRotation],
    },
    browser: { ...settings.browser },
    session: { ...settings.session },
    cache: { ...settings.cache },
    safety: { ...settings.safety, domainRateLimits: { ...settings.safety.domainRateLimits } },
    authentication: { ...settings.authentication },
    extraction: {
      ...settings.extraction,
      cssSelectors: [...settings.extraction.cssSelectors],
      xpathSelectors: [...settings.extraction.xpathSelectors],
      siteRules: settings.extraction.siteRules.map((rule) => ({ ...rule })),
    },
    episodeProcessing: {
      ...settings.episodeProcessing,
      languagePriority: [...settings.episodeProcessing.languagePriority],
      resolutionPriority: [...settings.episodeProcessing.resolutionPriority],
    },
    // Every v3 group with a nested array or record gets an explicit deep copy.
    // A shallow spread would let two profiles share one array — the exact
    // aliasing bug the "custom profiles without sharing nested settings" test
    // exists to catch.
    sources: cloneScraperSourceSettings(settings.sources),
    torrents: cloneScraperTorrentSettings(settings.torrents),
    qbittorrent: cloneScraperQbittorrentSettings(settings.qbittorrent),
    images: { ...settings.images },
    metadata: cloneScraperOutputGroup(settings.metadata, ['providerOrder']),
    performance: { ...settings.performance },
    logging: cloneScraperOutputGroup(settings.logging, ['channels']),
    validation: { ...settings.validation },
    export: cloneScraperOutputGroup(settings.export, ['includeColumns']),
    scheduler: cloneScraperOutputGroup(settings.scheduler, ['entries']),
    notifications: { ...settings.notifications },
    developer: cloneScraperOutputGroup(settings.developer, ['pluginIds'], ['experimentFlags']),
  };
}

export function mergeScraperSettings(base: ScraperSettings, patch: SettingsPatch): ScraperSettings {
  return {
    network: {
      ...base.network,
      ...patch.network,
      headers: patch.network?.headers
        ? { ...patch.network.headers }
        : { ...base.network.headers },
      proxyRotation: patch.network?.proxyRotation
        ? [...patch.network.proxyRotation]
        : [...base.network.proxyRotation],
    },
    browser: { ...base.browser, ...patch.browser },
    session: { ...base.session, ...patch.session },
    cache: { ...base.cache, ...patch.cache },
    safety: {
      ...base.safety,
      ...patch.safety,
      domainRateLimits: patch.safety?.domainRateLimits
        ? { ...patch.safety.domainRateLimits }
        : { ...base.safety.domainRateLimits },
    },
    authentication: { ...base.authentication, ...patch.authentication },
    extraction: {
      ...base.extraction,
      ...patch.extraction,
      cssSelectors: patch.extraction?.cssSelectors ? [...patch.extraction.cssSelectors] : [...base.extraction.cssSelectors],
      xpathSelectors: patch.extraction?.xpathSelectors ? [...patch.extraction.xpathSelectors] : [...base.extraction.xpathSelectors],
      siteRules: (patch.extraction?.siteRules ?? base.extraction.siteRules).map((rule) => ({ ...rule })),
    },
    episodeProcessing: {
      ...base.episodeProcessing,
      ...patch.episodeProcessing,
      languagePriority: patch.episodeProcessing?.languagePriority
        ? [...patch.episodeProcessing.languagePriority]
        : [...base.episodeProcessing.languagePriority],
      resolutionPriority: patch.episodeProcessing?.resolutionPriority
        ? [...patch.episodeProcessing.resolutionPriority]
        : [...base.episodeProcessing.resolutionPriority],
    },
    sources: mergeScraperSourceSettings(base.sources, patch.sources),
    torrents: mergeScraperTorrentSettings(base.torrents, patch.torrents),
    qbittorrent: mergeScraperQbittorrentSettings(base.qbittorrent, patch.qbittorrent),
    images: { ...base.images, ...patch.images },
    metadata: cloneScraperOutputGroup({ ...base.metadata, ...patch.metadata }, ['providerOrder']),
    performance: { ...base.performance, ...patch.performance },
    logging: cloneScraperOutputGroup({ ...base.logging, ...patch.logging }, ['channels']),
    validation: { ...base.validation, ...patch.validation },
    export: cloneScraperOutputGroup({ ...base.export, ...patch.export }, ['includeColumns']),
    scheduler: cloneScraperOutputGroup({ ...base.scheduler, ...patch.scheduler }, ['entries']),
    notifications: { ...base.notifications, ...patch.notifications },
    developer: cloneScraperOutputGroup(
      { ...base.developer, ...patch.developer },
      ['pluginIds'],
      ['experimentFlags'],
    ),
  };
}

export function getScraperPreset(preset: Exclude<ScraperPresetId, 'custom'>): ScraperSettings {
  return mergeScraperSettings(BALANCED_SETTINGS, PRESET_PATCHES[preset]);
}

export const DEFAULT_SCRAPER_SETTINGS = getScraperPreset('balanced');






function proxyValue(
  value: unknown,
  fallback: string,
  path: string,
  issues: ScraperSettingsIssue[],
): string {
  const candidate = stringValue(value, fallback, 2_048, path, issues).trim();
  if (!candidate) return '';
  if (/^(https?|socks5):\/\/[^\s]+$/i.test(candidate)) return candidate;
  issues.push({ path, message: 'Proxy must use http, https, or socks5.' });
  return fallback;
}

function headersValue(
  value: unknown,
  fallback: Record<string, string>,
  path: string,
  issues: ScraperSettingsIssue[],
): Record<string, string> {
  if (value === undefined) return { ...fallback };
  if (!isRecord(value)) {
    issues.push({ path, message: 'Expected a header name/value object.' });
    return { ...fallback };
  }
  const next: Record<string, string> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || typeof raw !== 'string') {
      issues.push({ path: `${path}.${name}`, message: 'Ignored invalid header.' });
      continue;
    }
    if (/[\r\n]/.test(raw)) {
      issues.push({ path: `${path}.${name}`, message: 'Removed line breaks from header value.' });
    }
    next[name] = raw.replace(/[\r\n]+/g, ' ').slice(0, 4_096);
  }
  return next;
}

function proxyRotationValue(
  value: unknown,
  fallback: string[],
  path: string,
  issues: ScraperSettingsIssue[],
): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Expected a list of proxy URLs.' });
    return [...fallback];
  }
  const next: string[] = [];
  for (const [index, candidate] of value.slice(0, 100).entries()) {
    const parsed = proxyValue(candidate, '', `${path}.${index}`, issues);
    if (parsed && !next.includes(parsed)) next.push(parsed);
  }
  return next;
}




function domainRateLimitsValue(
  value: unknown,
  fallback: Record<string, number>,
  path: string,
  issues: ScraperSettingsIssue[],
): Record<string, number> {
  if (value === undefined) return { ...fallback };
  if (!isRecord(value)) {
    issues.push({ path, message: 'Expected a hostname/rate object.' });
    return { ...fallback };
  }
  const result: Record<string, number> = {};
  for (const [rawSite, rawRate] of Object.entries(value).slice(0, 100)) {
    const site = normalizeScraperSite(rawSite);
    if (!site || typeof rawRate !== 'number' || !Number.isFinite(rawRate)) {
      issues.push({ path: `${path}.${rawSite}`, message: 'Ignored invalid domain rate limit.' });
      continue;
    }
    result[site] = Math.min(10_000, Math.max(1, Math.round(rawRate)));
  }
  return result;
}

/** Upper bound on stored site rules — a settings file, not a rule database. */
const MAX_SITE_RULES = 100;

function validateSiteRules(
  value: unknown,
  fallback: ScraperSiteRule[],
  issues: ScraperSettingsIssue[],
  path: string,
): ScraperSiteRule[] {
  if (value === undefined) return fallback.map((rule) => ({ ...rule }));
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Expected a list of site rules.' });
    return fallback.map((rule) => ({ ...rule }));
  }

  const seen = new Set<string>();
  const rules: ScraperSiteRule[] = [];
  for (const [index, raw] of value.slice(0, MAX_SITE_RULES).entries()) {
    const at = `${path}.${index}`;
    if (!isRecord(raw)) {
      issues.push({ path: at, message: 'Ignored a site rule that is not an object.' });
      continue;
    }
    const id = safeId(raw.id, '');
    if (!id || seen.has(id)) {
      issues.push({ path: at, message: 'Ignored a site rule with a missing or duplicate id.' });
      continue;
    }
    seen.add(id);
    rules.push({
      id,
      host: stringValue(raw.host, '', 253, `${at}.host`, issues).trim().toLowerCase(),
      sampleUrl: stringValue(raw.sampleUrl, '', 2_048, `${at}.sampleUrl`, issues).trim(),
      episodeSelector: stringValue(raw.episodeSelector, '', 512, `${at}.episodeSelector`, issues),
      titleSelector: stringValue(raw.titleSelector, '', 512, `${at}.titleSelector`, issues),
      linkSelector: stringValue(raw.linkSelector, '', 512, `${at}.linkSelector`, issues),
      linkAttribute: stringValue(raw.linkAttribute, '', 128, `${at}.linkAttribute`, issues).trim(),
      numberSelector: stringValue(raw.numberSelector, '', 512, `${at}.numberSelector`, issues),
      numberPattern: stringValue(raw.numberPattern, '', 512, `${at}.numberPattern`, issues),
      enabled: booleanValue(raw.enabled, false, `${at}.enabled`, issues),
      lastValidatedAt: nullableDateValue(raw.lastValidatedAt, null, `${at}.lastValidatedAt`, issues),
      lastMatchCount: boundedNumber(raw.lastMatchCount, 0, 0, 1_000_000, `${at}.lastMatchCount`, issues),
    });
  }
  return rules;
}

export function validateScraperSettings(
  input: unknown,
  fallback: ScraperSettings = DEFAULT_SCRAPER_SETTINGS,
): ScraperSettingsValidationResult<ScraperSettings> {
  const issues: ScraperSettingsIssue[] = [];
  if (!isRecord(input)) {
    if (input !== undefined) issues.push({ path: '', message: 'Expected a settings object.' });
    return { value: cloneSettings(fallback), issues };
  }

  const network = recordAt(input, 'network');
  const browser = recordAt(input, 'browser');
  const session = recordAt(input, 'session');
  const cache = recordAt(input, 'cache');
  const safety = recordAt(input, 'safety');
  const authentication = recordAt(input, 'authentication');
  const extraction = recordAt(input, 'extraction');
  const episodeProcessing = recordAt(input, 'episodeProcessing');
  const result: ScraperSettings = {
    network: {
      userAgent: stringValue(network.userAgent, fallback.network.userAgent, 512, 'network.userAgent', issues),
      headers: headersValue(network.headers, fallback.network.headers, 'network.headers', issues),
      cookieHeader: stringValue(network.cookieHeader, fallback.network.cookieHeader, 16_384, 'network.cookieHeader', issues)
        .replace(/[\r\n]+/g, ' '),
      proxyUrl: proxyValue(network.proxyUrl, fallback.network.proxyUrl, 'network.proxyUrl', issues),
      proxyRotation: proxyRotationValue(
        network.proxyRotation,
        fallback.network.proxyRotation,
        'network.proxyRotation',
        issues,
      ),
      retryAttempts: boundedNumber(network.retryAttempts, fallback.network.retryAttempts, 0, 12, 'network.retryAttempts', issues),
      retryDelayMs: boundedNumber(network.retryDelayMs, fallback.network.retryDelayMs, 0, 120_000, 'network.retryDelayMs', issues),
      requestTimeoutMs: boundedNumber(
        network.requestTimeoutMs,
        fallback.network.requestTimeoutMs,
        1_000,
        300_000,
        'network.requestTimeoutMs',
        issues,
      ),
      concurrentRequests: boundedNumber(
        network.concurrentRequests,
        fallback.network.concurrentRequests,
        1,
        32,
        'network.concurrentRequests',
        issues,
      ),
      randomDelayMinMs: boundedNumber(
        network.randomDelayMinMs,
        fallback.network.randomDelayMinMs,
        0,
        120_000,
        'network.randomDelayMinMs',
        issues,
      ),
      randomDelayMaxMs: boundedNumber(
        network.randomDelayMaxMs,
        fallback.network.randomDelayMaxMs,
        0,
        120_000,
        'network.randomDelayMaxMs',
        issues,
      ),
      followRedirects: booleanValue(network.followRedirects, fallback.network.followRedirects, 'network.followRedirects', issues),
      verifySsl: booleanValue(network.verifySsl, fallback.network.verifySsl, 'network.verifySsl', issues),
    },
    browser: {
      engine:
        browser.engine === 'chromium' || browser.engine === 'firefox'
          ? browser.engine
          : fallback.browser.engine,
      headless: booleanValue(browser.headless, fallback.browser.headless, 'browser.headless', issues),
      viewportWidth: boundedNumber(browser.viewportWidth, fallback.browser.viewportWidth, 320, 7_680, 'browser.viewportWidth', issues),
      viewportHeight: boundedNumber(browser.viewportHeight, fallback.browser.viewportHeight, 240, 4_320, 'browser.viewportHeight', issues),
      javascriptWaitMs: boundedNumber(
        browser.javascriptWaitMs,
        fallback.browser.javascriptWaitMs,
        0,
        300_000,
        'browser.javascriptWaitMs',
        issues,
      ),
      waitForNetworkIdle: booleanValue(
        browser.waitForNetworkIdle,
        fallback.browser.waitForNetworkIdle,
        'browser.waitForNetworkIdle',
        issues,
      ),
      scrollBeforeScraping: booleanValue(
        browser.scrollBeforeScraping,
        fallback.browser.scrollBeforeScraping,
        'browser.scrollBeforeScraping',
        issues,
      ),
      scrollSpeedPxPerSecond: boundedNumber(
        browser.scrollSpeedPxPerSecond,
        fallback.browser.scrollSpeedPxPerSecond,
        50,
        5_000,
        'browser.scrollSpeedPxPerSecond',
        issues,
      ),
      scrollPasses: boundedNumber(browser.scrollPasses, fallback.browser.scrollPasses, 1, 30, 'browser.scrollPasses', issues),
      preExtractionScript: stringValue(
        browser.preExtractionScript,
        fallback.browser.preExtractionScript,
        20_000,
        'browser.preExtractionScript',
        issues,
      ),
    },
    session: {
      consistentFingerprint: booleanValue(
        session.consistentFingerprint,
        fallback.session.consistentFingerprint,
        'session.consistentFingerprint',
        issues,
      ),
      persistAuthenticatedSession: booleanValue(
        session.persistAuthenticatedSession,
        fallback.session.persistAuthenticatedSession,
        'session.persistAuthenticatedSession',
        issues,
      ),
      sessionLabel: stringValue(session.sessionLabel, fallback.session.sessionLabel, 120, 'session.sessionLabel', issues).trim(),
      expiresAt: nullableDateValue(session.expiresAt, fallback.session.expiresAt, 'session.expiresAt', issues),
      lastValidatedAt: nullableDateValue(session.lastValidatedAt, fallback.session.lastValidatedAt, 'session.lastValidatedAt', issues),
    },
    cache: {
      mode: cache.mode === 'standard' || cache.mode === 'offline' ? cache.mode : fallback.cache.mode,
      htmlEnabled: booleanValue(cache.htmlEnabled, fallback.cache.htmlEnabled, 'cache.htmlEnabled', issues),
      metadataEnabled: booleanValue(cache.metadataEnabled, fallback.cache.metadataEnabled, 'cache.metadataEnabled', issues),
      thumbnailsEnabled: booleanValue(cache.thumbnailsEnabled, fallback.cache.thumbnailsEnabled, 'cache.thumbnailsEnabled', issues),
      lifetimeMinutes: boundedNumber(cache.lifetimeMinutes, fallback.cache.lifetimeMinutes, 0, 525_600, 'cache.lifetimeMinutes', issues),
      maxSizeMb: boundedNumber(cache.maxSizeMb, fallback.cache.maxSizeMb, 16, 1_048_576, 'cache.maxSizeMb', issues),
    },
    safety: {
      respectRobotsTxt: booleanValue(safety.respectRobotsTxt, fallback.safety.respectRobotsTxt, 'safety.respectRobotsTxt', issues),
      crawlDelayMs: boundedNumber(safety.crawlDelayMs, fallback.safety.crawlDelayMs, 0, 300_000, 'safety.crawlDelayMs', issues),
      maxRequestsPerMinute: boundedNumber(safety.maxRequestsPerMinute, fallback.safety.maxRequestsPerMinute, 1, 10_000, 'safety.maxRequestsPerMinute', issues),
      pauseAfterFailures: boundedNumber(safety.pauseAfterFailures, fallback.safety.pauseAfterFailures, 1, 1_000, 'safety.pauseAfterFailures', issues),
      pauseDurationMs: boundedNumber(safety.pauseDurationMs, fallback.safety.pauseDurationMs, 1_000, 86_400_000, 'safety.pauseDurationMs', issues),
      domainRateLimits: domainRateLimitsValue(safety.domainRateLimits, fallback.safety.domainRateLimits, 'safety.domainRateLimits', issues),
    },
    authentication: {
      loginStatus: authentication.loginStatus === 'not-configured'
        || authentication.loginStatus === 'signed-out'
        || authentication.loginStatus === 'signed-in'
        || authentication.loginStatus === 'expired'
        || authentication.loginStatus === 'unknown'
        ? authentication.loginStatus
        : fallback.authentication.loginStatus,
      accountLabel: stringValue(authentication.accountLabel, fallback.authentication.accountLabel, 120, 'authentication.accountLabel', issues).trim(),
      credentialRef: stringValue(authentication.credentialRef, fallback.authentication.credentialRef, 240, 'authentication.credentialRef', issues).trim(),
      cookieJarRef: stringValue(authentication.cookieJarRef, fallback.authentication.cookieJarRef, 240, 'authentication.cookieJarRef', issues).trim(),
      manualLoginRequired: booleanValue(authentication.manualLoginRequired, fallback.authentication.manualLoginRequired, 'authentication.manualLoginRequired', issues),
    },
    extraction: {
      cssSelectors: stringListValue(extraction.cssSelectors, fallback.extraction.cssSelectors, 'extraction.cssSelectors', issues),
      xpathSelectors: stringListValue(extraction.xpathSelectors, fallback.extraction.xpathSelectors, 'extraction.xpathSelectors', issues),
      regexPattern: stringValue(extraction.regexPattern, fallback.extraction.regexPattern, 4_096, 'extraction.regexPattern', issues),
      regexFlags: stringValue(extraction.regexFlags, fallback.extraction.regexFlags, 8, 'extraction.regexFlags', issues)
        .replace(/[^dgimsuvy]/g, ''),
      attribute: stringValue(extraction.attribute, fallback.extraction.attribute, 128, 'extraction.attribute', issues).trim(),
      ignoreHiddenElements: booleanValue(extraction.ignoreHiddenElements, fallback.extraction.ignoreHiddenElements, 'extraction.ignoreHiddenElements', issues),
      cleanText: booleanValue(extraction.cleanText, fallback.extraction.cleanText, 'extraction.cleanText', issues),
      decodeHtmlEntities: booleanValue(extraction.decodeHtmlEntities, fallback.extraction.decodeHtmlEntities, 'extraction.decodeHtmlEntities', issues),
      removeDuplicateEpisodes: booleanValue(extraction.removeDuplicateEpisodes, fallback.extraction.removeDuplicateEpisodes, 'extraction.removeDuplicateEpisodes', issues),
      normalizeEpisodeNumbering: booleanValue(extraction.normalizeEpisodeNumbering, fallback.extraction.normalizeEpisodeNumbering, 'extraction.normalizeEpisodeNumbering', issues),
      detectSeasonNumbers: booleanValue(extraction.detectSeasonNumbers, fallback.extraction.detectSeasonNumbers, 'extraction.detectSeasonNumbers', issues),
      detectSpecials: booleanValue(extraction.detectSpecials, fallback.extraction.detectSpecials, 'extraction.detectSpecials', issues),
      siteRules: validateSiteRules(extraction.siteRules, fallback.extraction.siteRules, issues, 'extraction.siteRules'),
    },
    episodeProcessing: {
      naturalSort: booleanValue(episodeProcessing.naturalSort, fallback.episodeProcessing.naturalSort, 'episodeProcessing.naturalSort', issues),
      detectMissingNumbers: booleanValue(episodeProcessing.detectMissingNumbers, fallback.episodeProcessing.detectMissingNumbers, 'episodeProcessing.detectMissingNumbers', issues),
      mergeDuplicateSources: booleanValue(episodeProcessing.mergeDuplicateSources, fallback.episodeProcessing.mergeDuplicateSources, 'episodeProcessing.mergeDuplicateSources', issues),
      keepHighestQuality: booleanValue(episodeProcessing.keepHighestQuality, fallback.episodeProcessing.keepHighestQuality, 'episodeProcessing.keepHighestQuality', issues),
      audioPreference: episodeProcessing.audioPreference === 'subbed'
        || episodeProcessing.audioPreference === 'dubbed'
        || episodeProcessing.audioPreference === 'raw'
        || episodeProcessing.audioPreference === 'none'
        ? episodeProcessing.audioPreference
        : fallback.episodeProcessing.audioPreference,
      languagePriority: stringListValue(episodeProcessing.languagePriority, fallback.episodeProcessing.languagePriority, 'episodeProcessing.languagePriority', issues, 20),
      resolutionPriority: numberListValue(episodeProcessing.resolutionPriority, fallback.episodeProcessing.resolutionPriority, 'episodeProcessing.resolutionPriority', issues),
      ignoreFiller: booleanValue(episodeProcessing.ignoreFiller, fallback.episodeProcessing.ignoreFiller, 'episodeProcessing.ignoreFiller', issues),
      ignoreRecaps: booleanValue(episodeProcessing.ignoreRecaps, fallback.episodeProcessing.ignoreRecaps, 'episodeProcessing.ignoreRecaps', issues),
      renameEpisodes: booleanValue(episodeProcessing.renameEpisodes, fallback.episodeProcessing.renameEpisodes, 'episodeProcessing.renameEpisodes', issues),
    },

    // ---- v3 groups ----
    // Each validator falls back per field, so a v1/v2 document that has none of
    // these keys normalizes to defaults without a migration step and without
    // raising an issue.
    sources: validateScraperSourceSettings(input.sources, fallback.sources, issues, 'sources'),
    torrents: validateScraperTorrentSettings(input.torrents, fallback.torrents, issues, 'torrents'),
    qbittorrent: validateScraperQbittorrentSettings(input.qbittorrent, fallback.qbittorrent, issues, 'qbittorrent'),
    images: validateScraperImageSettings(input.images, fallback.images, issues, 'images'),
    metadata: validateScraperMetadataSettings(input.metadata, fallback.metadata, issues, 'metadata'),
    performance: validateScraperPerformanceSettings(input.performance, fallback.performance, issues, 'performance'),
    logging: validateScraperLoggingSettings(input.logging, fallback.logging, issues, 'logging'),
    validation: validateScraperValidationSettings(input.validation, fallback.validation, issues, 'validation'),
    export: validateScraperExportSettings(input.export, fallback.export, issues, 'export'),
    scheduler: validateScraperSchedulerSettings(input.scheduler, fallback.scheduler, issues, 'scheduler'),
    notifications: validateScraperNotificationSettings(input.notifications, fallback.notifications, issues, 'notifications'),
    developer: validateScraperDeveloperSettings(input.developer, fallback.developer, issues, 'developer'),
  };

  if (result.network.randomDelayMaxMs < result.network.randomDelayMinMs) {
    result.network.randomDelayMaxMs = result.network.randomDelayMinMs;
    issues.push({
      path: 'network.randomDelayMaxMs',
      message: 'Raised to match the minimum request delay.',
    });
  }
  if (browser.engine !== undefined && browser.engine !== 'chromium' && browser.engine !== 'firefox') {
    issues.push({ path: 'browser.engine', message: 'Unsupported browser engine.' });
  }
  return { value: result, issues };
}


function safeDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return fallback;
  return new Date(value).toISOString();
}

function presetId(value: unknown): ScraperPresetId {
  return value === 'fast' || value === 'balanced' || value === 'thorough' || value === 'custom'
    ? value
    : 'custom';
}

function profileVersionId(now: string, index = 0): string {
  return `v-${now.replace(/[^0-9]/g, '').slice(0, 17)}${index ? `-${index}` : ''}`;
}

function snapshotProfile(
  profile: ScraperSettingsProfile,
  reason: string,
  now: string,
): ScraperProfileVersion[] {
  let id = profileVersionId(now);
  let suffix = 1;
  const ids = new Set(profile.history.map((version) => version.id));
  while (ids.has(id)) id = profileVersionId(now, suffix++);
  return [...profile.history, {
    id,
    createdAt: now,
    reason: reason.slice(0, 160),
    preset: profile.preset,
    settings: cloneSettings(profile.settings),
  }].slice(-SCRAPER_PROFILE_HISTORY_LIMIT);
}

/**
 * The built-in profiles' stored name and description, with the i18n keys the
 * renderer shows in their place.
 *
 * The document keeps the English text: it is exported as portable JSON and read
 * by main, so it must not change with the UI language, and a user may rename a
 * profile. The renderer (`scraper/localize.ts`) translates a built-in profile's
 * name or description only while it still equals the value below, so a stored
 * default renders in the UI language and a user's own text renders as typed.
 */
export const SCRAPER_BUILTIN_PROFILE_TEXT = {
  fast: {
    name: 'Fast',
    nameKey: 'scraperMgmt.preset.fast',
    description: 'Lower waits and higher concurrency for reliable sources.',
    descriptionKey: 'scrApp.r2.profile.desc.fast',
  },
  balanced: {
    name: 'Balanced',
    nameKey: 'scraperMgmt.preset.balanced',
    description: 'Safe defaults for everyday scraping.',
    descriptionKey: 'scrApp.r2.profile.desc.balanced',
  },
  thorough: {
    name: 'Thorough',
    nameKey: 'scraperMgmt.preset.thorough',
    description: 'Longer waits and conservative concurrency for complex pages.',
    descriptionKey: 'scrApp.r2.profile.desc.thorough',
  },
} as const satisfies Record<Exclude<ScraperPresetId, 'custom'>, {
  name: string;
  nameKey: string;
  description: string;
  descriptionKey: string;
}>;

/**
 * The revision-log reasons this module writes. Stored in English for the same
 * reason as the profile names; the renderer recognises these and translates them.
 */
export const SCRAPER_PROFILE_REASON = {
  updated: 'Settings updated',
  fallback: 'Profile update',
  preset: (preset: string) => `Applied ${preset} preset`,
  presetPattern: /^Applied (fast|balanced|thorough|custom) preset$/,
  rollback: (versionId: string) => `Rolled back to ${versionId}`,
  rollbackPattern: /^Rolled back to (.+)$/,
} as const;

function makeProfile(
  preset: Exclude<ScraperPresetId, 'custom'>,
  now: string,
): ScraperSettingsProfile {
  const text = SCRAPER_BUILTIN_PROFILE_TEXT[preset];
  return {
    id: preset,
    name: text.name,
    description: text.description,
    preset,
    createdAt: now,
    updatedAt: now,
    settings: getScraperPreset(preset),
    history: [],
  };
}

export function createDefaultScraperSettingsDocument(now = new Date().toISOString()): ScraperSettingsDocument {
  return {
    version: SCRAPER_SETTINGS_VERSION,
    activeProfileId: DEFAULT_SCRAPER_PROFILE_ID,
    profiles: [makeProfile('fast', now), makeProfile('balanced', now), makeProfile('thorough', now)],
    siteOverrides: {},
  };
}

function normalizeProfile(
  input: unknown,
  index: number,
  now: string,
  issues: ScraperSettingsIssue[],
): ScraperSettingsProfile | null {
  if (!isRecord(input)) {
    issues.push({ path: `profiles.${index}`, message: 'Ignored invalid profile.' });
    return null;
  }
  const preset = presetId(input.preset);
  const fallback = preset === 'custom' ? DEFAULT_SCRAPER_SETTINGS : getScraperPreset(preset);
  const validated = validateScraperSettings(input.settings, fallback);
  issues.push(...validated.issues.map((issue) => ({ ...issue, path: `profiles.${index}.${issue.path}` })));
  const id = safeId(input.id, `profile-${index + 1}`);
  const history: ScraperProfileVersion[] = [];
  if (Array.isArray(input.history)) {
    for (const [historyIndex, rawVersion] of input.history.slice(-SCRAPER_PROFILE_HISTORY_LIMIT).entries()) {
      if (!isRecord(rawVersion)) {
        issues.push({ path: `profiles.${index}.history.${historyIndex}`, message: 'Ignored invalid profile version.' });
        continue;
      }
      const versionSettings = validateScraperSettings(rawVersion.settings, validated.value);
      history.push({
        id: safeId(rawVersion.id, profileVersionId(now, historyIndex)),
        createdAt: safeDate(rawVersion.createdAt, now),
        reason: stringValue(rawVersion.reason, SCRAPER_PROFILE_REASON.fallback, 160, `profiles.${index}.history.${historyIndex}.reason`, issues),
        preset: presetId(rawVersion.preset),
        settings: versionSettings.value,
      });
    }
  }
  return {
    id,
    name: stringValue(input.name, `Profile ${index + 1}`, 80, `profiles.${index}.name`, issues).trim() || `Profile ${index + 1}`,
    description: stringValue(input.description, '', 240, `profiles.${index}.description`, issues),
    preset,
    createdAt: safeDate(input.createdAt, now),
    updatedAt: safeDate(input.updatedAt, now),
    settings: validated.value,
    history,
  };
}

export function normalizeScraperSettingsDocument(
  input: unknown,
  now = new Date().toISOString(),
): ScraperSettingsValidationResult<ScraperSettingsDocument> {
  const issues: ScraperSettingsIssue[] = [];
  if (!isRecord(input)) {
    issues.push({ path: '', message: 'Expected a scraper settings document.' });
    return { value: createDefaultScraperSettingsDocument(now), issues };
  }
  if (typeof input.version === 'number' && input.version > SCRAPER_SETTINGS_VERSION) {
    issues.push({ path: 'version', message: 'Settings were created by a newer app version.' });
    return { value: createDefaultScraperSettingsDocument(now), issues };
  }

  // Version 0 stored one settings object without profiles. Promote it to a
  // custom profile so old local data survives the profile-based v1 format.
  const rawProfiles = Array.isArray(input.profiles)
    ? input.profiles
    : [{
        id: 'migrated',
        name: 'Migrated settings',
        description: 'Imported from the original settings format.',
        preset: 'custom',
        settings: input.settings ?? input,
        createdAt: now,
        updatedAt: now,
        history: [],
      }];
  const profiles = rawProfiles
    .map((profile, index) => normalizeProfile(profile, index, now, issues))
    .filter((profile): profile is ScraperSettingsProfile => profile !== null);
  if (!profiles.length) profiles.push(makeProfile('balanced', now));

  const seen = new Set<string>();
  for (const [index, profile] of profiles.entries()) {
    if (!seen.has(profile.id)) {
      seen.add(profile.id);
      continue;
    }
    profile.id = `${profile.id}-${index + 1}`;
    issues.push({ path: `profiles.${index}.id`, message: 'Renamed duplicate profile ID.' });
    seen.add(profile.id);
  }

  const requestedActive = safeId(input.activeProfileId, profiles[0].id);
  const activeProfileId = profiles.some((profile) => profile.id === requestedActive)
    ? requestedActive
    : profiles[0].id;
  const siteOverrides: Record<string, ScraperSiteOverride> = {};
  if (isRecord(input.siteOverrides)) {
    for (const [rawSite, rawOverride] of Object.entries(input.siteOverrides)) {
      const site = normalizeScraperSite(rawSite);
      if (!site || !isRecord(rawOverride)) {
        issues.push({ path: `siteOverrides.${rawSite}`, message: 'Ignored invalid site override.' });
        continue;
      }
      const profileId = typeof rawOverride.profileId === 'string' && profiles.some((profile) => profile.id === rawOverride.profileId)
        ? rawOverride.profileId
        : undefined;
      const base = profiles.find((profile) => profile.id === profileId)?.settings
        ?? profiles.find((profile) => profile.id === activeProfileId)?.settings
        ?? DEFAULT_SCRAPER_SETTINGS;
      const validated = validateScraperSettings(rawOverride.settings, base);
      issues.push(...validated.issues.map((issue) => ({ ...issue, path: `siteOverrides.${site}.${issue.path}` })));
      siteOverrides[site] = { profileId, settings: validated.value };
    }
  }

  return {
    value: {
      version: SCRAPER_SETTINGS_VERSION,
      activeProfileId,
      profiles,
      siteOverrides,
    },
    issues,
  };
}

export function normalizeScraperSite(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function resolveScraperSettings(
  document: ScraperSettingsDocument,
  site?: string,
): ScraperSettings {
  const active = document.profiles.find((profile) => profile.id === document.activeProfileId)
    ?? document.profiles[0];
  if (!active) return cloneSettings(DEFAULT_SCRAPER_SETTINGS);
  const siteKey = site ? normalizeScraperSite(site) : null;
  const override = siteKey ? document.siteOverrides[siteKey] : undefined;
  if (!override) return cloneSettings(active.settings);
  const inherited = document.profiles.find((profile) => profile.id === override.profileId)?.settings
    ?? active.settings;
  return validateScraperSettings(override.settings, inherited).value;
}

export function patchScraperProfile(
  document: ScraperSettingsDocument,
  profileId: string,
  patch: SettingsPatch,
  now = new Date().toISOString(),
): ScraperSettingsDocument {
  return {
    ...document,
    profiles: document.profiles.map((profile) => {
      if (profile.id !== profileId) return profile;
      const next = validateScraperSettings(mergeScraperSettings(profile.settings, patch), profile.settings).value;
      return {
        ...profile,
        preset: 'custom',
        updatedAt: now,
        settings: next,
        history: snapshotProfile(profile, SCRAPER_PROFILE_REASON.updated, now),
      };
    }),
  };
}

export function applyScraperPreset(
  document: ScraperSettingsDocument,
  profileId: string,
  preset: Exclude<ScraperPresetId, 'custom'>,
  now = new Date().toISOString(),
): ScraperSettingsDocument {
  return {
    ...document,
    profiles: document.profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            preset,
            updatedAt: now,
            settings: getScraperPreset(preset),
            history: snapshotProfile(profile, SCRAPER_PROFILE_REASON.preset(preset), now),
          }
        : profile,
    ),
  };
}

export function setScraperSiteOverride(
  document: ScraperSettingsDocument,
  site: string,
  patch: SettingsPatch,
  profileId = document.activeProfileId,
): ScraperSettingsDocument {
  const siteKey = normalizeScraperSite(site);
  if (!siteKey) throw new Error('A valid site hostname is required.');
  const base = document.profiles.find((profile) => profile.id === profileId)?.settings
    ?? resolveScraperSettings(document);
  const settings = validateScraperSettings(mergeScraperSettings(base, patch), base).value;
  return {
    ...document,
    siteOverrides: {
      ...document.siteOverrides,
      [siteKey]: { profileId, settings },
    },
  };
}

function uniqueProfileId(profiles: ScraperSettingsProfile[], name: string): string {
  const base = safeId(name, 'profile');
  const ids = new Set(profiles.map((profile) => profile.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function createScraperProfile(
  document: ScraperSettingsDocument,
  name: string,
  sourceProfileId = document.activeProfileId,
  now = new Date().toISOString(),
): ScraperSettingsDocument {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new Error('A profile name is required.');
  const source = document.profiles.find((profile) => profile.id === sourceProfileId)
    ?? document.profiles[0];
  const settings = source?.settings ?? DEFAULT_SCRAPER_SETTINGS;
  const profile: ScraperSettingsProfile = {
    id: uniqueProfileId(document.profiles, cleanName),
    name: cleanName,
    description: source ? `Based on ${source.name}.` : '',
    preset: 'custom',
    createdAt: now,
    updatedAt: now,
    settings: cloneSettings(settings),
    history: [],
  };
  return { ...document, activeProfileId: profile.id, profiles: [...document.profiles, profile] };
}

export function updateScraperProfileDetails(
  document: ScraperSettingsDocument,
  profileId: string,
  details: { name?: string; description?: string },
  now = new Date().toISOString(),
): ScraperSettingsDocument {
  return {
    ...document,
    profiles: document.profiles.map((profile) => {
      if (profile.id !== profileId) return profile;
      const name = details.name === undefined ? profile.name : details.name.trim().slice(0, 80);
      if (!name) throw new Error('A profile name is required.');
      return {
        ...profile,
        name,
        description: details.description === undefined
          ? profile.description
          : details.description.trim().slice(0, 240),
        updatedAt: now,
      };
    }),
  };
}

export function deleteScraperProfile(
  document: ScraperSettingsDocument,
  profileId: string,
): ScraperSettingsDocument {
  if (document.profiles.length <= 1) throw new Error('At least one profile must remain.');
  if (!document.profiles.some((profile) => profile.id === profileId)) return document;
  const profiles = document.profiles.filter((profile) => profile.id !== profileId);
  const activeProfileId = document.activeProfileId === profileId
    ? profiles[0].id
    : document.activeProfileId;
  const siteOverrides = Object.fromEntries(Object.entries(document.siteOverrides).map(([site, override]) => [
    site,
    override.profileId === profileId ? { settings: override.settings } : override,
  ]));
  return { ...document, activeProfileId, profiles, siteOverrides };
}

export function resetScraperProfile(
  document: ScraperSettingsDocument,
  profileId: string,
  now = new Date().toISOString(),
): ScraperSettingsDocument {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) return document;
  const preset = profile.id === 'fast' || profile.id === 'balanced' || profile.id === 'thorough'
    ? profile.id
    : 'balanced';
  return applyScraperPreset(document, profileId, preset, now);
}

export function rollbackScraperProfile(
  document: ScraperSettingsDocument,
  profileId: string,
  versionId: string,
  now = new Date().toISOString(),
): ScraperSettingsDocument {
  return {
    ...document,
    profiles: document.profiles.map((profile) => {
      if (profile.id !== profileId) return profile;
      const version = profile.history.find((candidate) => candidate.id === versionId);
      if (!version) throw new Error('The requested profile version does not exist.');
      return {
        ...profile,
        preset: version.preset,
        updatedAt: now,
        settings: cloneSettings(version.settings),
        history: snapshotProfile(profile, SCRAPER_PROFILE_REASON.rollback(versionId), now),
      };
    }),
  };
}

export function removeScraperSiteOverride(
  document: ScraperSettingsDocument,
  site: string,
): ScraperSettingsDocument {
  const siteKey = normalizeScraperSite(site);
  if (!siteKey || !document.siteOverrides[siteKey]) return document;
  const siteOverrides = { ...document.siteOverrides };
  delete siteOverrides[siteKey];
  return { ...document, siteOverrides };
}
