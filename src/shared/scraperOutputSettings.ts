// What the scraper produces and how it behaves while producing it.
//
// Nine groups added in settings v3: images, metadata, performance, logging,
// validation, export, scheduler, notifications, developer. Split out of
// scraperSettings.ts to keep that file readable; the validation contract is
// identical (never throw, always fall back, explain every adjustment).

import {
  booleanValue,
  boundedNumber,
  clockValue,
  cronValue,
  enumValue,
  isRecord,
  nullableDateValue,
  safeId,
  stringListValue,
  stringValue,
  type ScraperSettingsIssue,
} from './scraperSettingsPrimitives';

// ----------------------------------------------------------------- images ---

export const SCRAPER_IMAGE_FORMATS = ['original', 'webp', 'jpg', 'png'] as const;
export type ScraperImageFormat = (typeof SCRAPER_IMAGE_FORMATS)[number];

export interface ScraperImageSettings {
  downloadThumbnails: boolean;
  downloadPosters: boolean;
  downloadBanners: boolean;
  minWidth: number;
  minHeight: number;
  preferredFormat: ScraperImageFormat;
  maxPerEntry: number;
  skipDuplicatesByHash: boolean;
  namingTemplate: string;
}

export const DEFAULT_SCRAPER_IMAGE_SETTINGS: ScraperImageSettings = {
  downloadThumbnails: true,
  downloadPosters: true,
  downloadBanners: false,
  minWidth: 120,
  minHeight: 68,
  preferredFormat: 'webp',
  maxPerEntry: 12,
  skipDuplicatesByHash: true,
  namingTemplate: '{series}/{season}/{episode}-{kind}',
};

export function validateScraperImageSettings(
  input: unknown,
  fallback: ScraperImageSettings,
  issues: ScraperSettingsIssue[],
  p: string,
): ScraperImageSettings {
  const s = isRecord(input) ? input : {};
  return {
    downloadThumbnails: booleanValue(s.downloadThumbnails, fallback.downloadThumbnails, `${p}.downloadThumbnails`, issues),
    downloadPosters: booleanValue(s.downloadPosters, fallback.downloadPosters, `${p}.downloadPosters`, issues),
    downloadBanners: booleanValue(s.downloadBanners, fallback.downloadBanners, `${p}.downloadBanners`, issues),
    minWidth: boundedNumber(s.minWidth, fallback.minWidth, 0, 7_680, `${p}.minWidth`, issues),
    minHeight: boundedNumber(s.minHeight, fallback.minHeight, 0, 4_320, `${p}.minHeight`, issues),
    preferredFormat: enumValue(s.preferredFormat, SCRAPER_IMAGE_FORMATS, fallback.preferredFormat, `${p}.preferredFormat`, issues),
    maxPerEntry: boundedNumber(s.maxPerEntry, fallback.maxPerEntry, 0, 200, `${p}.maxPerEntry`, issues),
    skipDuplicatesByHash: booleanValue(s.skipDuplicatesByHash, fallback.skipDuplicatesByHash, `${p}.skipDuplicatesByHash`, issues),
    namingTemplate: stringValue(s.namingTemplate, fallback.namingTemplate, 240, `${p}.namingTemplate`, issues),
  };
}

// --------------------------------------------------------------- metadata ---

export const SCRAPER_TITLE_LANGUAGES = ['romaji', 'english', 'native'] as const;
export type ScraperTitleLanguage = (typeof SCRAPER_TITLE_LANGUAGES)[number];

export const SCRAPER_MERGE_STRATEGIES = ['first-wins', 'prefer-complete', 'manual'] as const;
export type ScraperMergeStrategy = (typeof SCRAPER_MERGE_STRATEGIES)[number];

export interface ScraperMetadataSettings {
  providerOrder: string[];
  fetchSynopsis: boolean;
  fetchGenres: boolean;
  fetchStaff: boolean;
  fetchAirDates: boolean;
  fetchRatings: boolean;
  titleLanguage: ScraperTitleLanguage;
  /** Drives the second, smaller Japanese line under each row title. */
  alsoStoreNativeTitle: boolean;
  mergeStrategy: ScraperMergeStrategy;
  cacheHours: number;
}

export const DEFAULT_SCRAPER_METADATA_SETTINGS: ScraperMetadataSettings = {
  providerOrder: ['jikan', 'anilist'],
  fetchSynopsis: true,
  fetchGenres: true,
  fetchStaff: false,
  fetchAirDates: true,
  fetchRatings: true,
  titleLanguage: 'english',
  alsoStoreNativeTitle: true,
  mergeStrategy: 'prefer-complete',
  cacheHours: 168,
};

export function validateScraperMetadataSettings(
  input: unknown,
  fallback: ScraperMetadataSettings,
  issues: ScraperSettingsIssue[],
  p: string,
): ScraperMetadataSettings {
  const s = isRecord(input) ? input : {};
  return {
    providerOrder: stringListValue(s.providerOrder, fallback.providerOrder, `${p}.providerOrder`, issues, 10)
      .map((v) => safeId(v, ''))
      .filter(Boolean),
    fetchSynopsis: booleanValue(s.fetchSynopsis, fallback.fetchSynopsis, `${p}.fetchSynopsis`, issues),
    fetchGenres: booleanValue(s.fetchGenres, fallback.fetchGenres, `${p}.fetchGenres`, issues),
    fetchStaff: booleanValue(s.fetchStaff, fallback.fetchStaff, `${p}.fetchStaff`, issues),
    fetchAirDates: booleanValue(s.fetchAirDates, fallback.fetchAirDates, `${p}.fetchAirDates`, issues),
    fetchRatings: booleanValue(s.fetchRatings, fallback.fetchRatings, `${p}.fetchRatings`, issues),
    titleLanguage: enumValue(s.titleLanguage, SCRAPER_TITLE_LANGUAGES, fallback.titleLanguage, `${p}.titleLanguage`, issues),
    alsoStoreNativeTitle: booleanValue(s.alsoStoreNativeTitle, fallback.alsoStoreNativeTitle, `${p}.alsoStoreNativeTitle`, issues),
    mergeStrategy: enumValue(s.mergeStrategy, SCRAPER_MERGE_STRATEGIES, fallback.mergeStrategy, `${p}.mergeStrategy`, issues),
    cacheHours: boundedNumber(s.cacheHours, fallback.cacheHours, 0, 8_760, `${p}.cacheHours`, issues),
  };
}

// ------------------------------------------------------------ performance ---

export interface ScraperPerformanceSettings {
  maxParallelJobs: number;
  maxParallelDownloads: number;
  memoryBudgetMb: number;
  cpuThrottlePercent: number;
  reuseBrowserContext: boolean;
  prefetchNextPage: boolean;
  batchSize: number;
}

export const DEFAULT_SCRAPER_PERFORMANCE_SETTINGS: ScraperPerformanceSettings = {
  maxParallelJobs: 4,
  maxParallelDownloads: 4,
  memoryBudgetMb: 1_024,
  cpuThrottlePercent: 80,
  reuseBrowserContext: true,
  prefetchNextPage: true,
  batchSize: 50,
};

export function validateScraperPerformanceSettings(
  input: unknown,
  fallback: ScraperPerformanceSettings,
  issues: ScraperSettingsIssue[],
  p: string,
): ScraperPerformanceSettings {
  const s = isRecord(input) ? input : {};
  return {
    maxParallelJobs: boundedNumber(s.maxParallelJobs, fallback.maxParallelJobs, 1, 16, `${p}.maxParallelJobs`, issues),
    maxParallelDownloads: boundedNumber(s.maxParallelDownloads, fallback.maxParallelDownloads, 1, 32, `${p}.maxParallelDownloads`, issues),
    memoryBudgetMb: boundedNumber(s.memoryBudgetMb, fallback.memoryBudgetMb, 128, 32_768, `${p}.memoryBudgetMb`, issues),
    cpuThrottlePercent: boundedNumber(s.cpuThrottlePercent, fallback.cpuThrottlePercent, 10, 100, `${p}.cpuThrottlePercent`, issues),
    reuseBrowserContext: booleanValue(s.reuseBrowserContext, fallback.reuseBrowserContext, `${p}.reuseBrowserContext`, issues),
    prefetchNextPage: booleanValue(s.prefetchNextPage, fallback.prefetchNextPage, `${p}.prefetchNextPage`, issues),
    batchSize: boundedNumber(s.batchSize, fallback.batchSize, 1, 500, `${p}.batchSize`, issues),
  };
}

// ---------------------------------------------------------------- logging ---

export const SCRAPER_LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type ScraperLogLevel = (typeof SCRAPER_LOG_LEVELS)[number];

export const SCRAPER_LOG_CHANNELS = [
  'network',
  'browser',
  'extraction',
  'torrent',
  'qbit',
  'scheduler',
] as const;
export type ScraperLogChannel = (typeof SCRAPER_LOG_CHANNELS)[number];

export interface ScraperLoggingSettings {
  level: ScraperLogLevel;
  persistToDisk: boolean;
  retentionDays: number;
  maxFileSizeMb: number;
  redactCookies: boolean;
  redactCredentials: boolean;
  captureHar: boolean;
  captureScreenshotsOnError: boolean;
  channels: ScraperLogChannel[];
}

export const DEFAULT_SCRAPER_LOGGING_SETTINGS: ScraperLoggingSettings = {
  level: 'info',
  persistToDisk: true,
  retentionDays: 14,
  maxFileSizeMb: 64,
  redactCookies: true,
  redactCredentials: true,
  captureHar: false,
  captureScreenshotsOnError: true,
  channels: ['network', 'extraction'],
};

export function validateScraperLoggingSettings(
  input: unknown,
  fallback: ScraperLoggingSettings,
  issues: ScraperSettingsIssue[],
  p: string,
): ScraperLoggingSettings {
  const s = isRecord(input) ? input : {};
  const channels = stringListValue(s.channels, fallback.channels, `${p}.channels`, issues, 12)
    .filter((c): c is ScraperLogChannel => (SCRAPER_LOG_CHANNELS as readonly string[]).includes(c));
  return {
    level: enumValue(s.level, SCRAPER_LOG_LEVELS, fallback.level, `${p}.level`, issues),
    persistToDisk: booleanValue(s.persistToDisk, fallback.persistToDisk, `${p}.persistToDisk`, issues),
    retentionDays: boundedNumber(s.retentionDays, fallback.retentionDays, 0, 365, `${p}.retentionDays`, issues),
    maxFileSizeMb: boundedNumber(s.maxFileSizeMb, fallback.maxFileSizeMb, 1, 4_096, `${p}.maxFileSizeMb`, issues),
    // Redaction defaults on and stays on unless explicitly disabled — a log
    // that leaks a session cookie is a security incident, not a bug report.
    redactCookies: booleanValue(s.redactCookies, fallback.redactCookies, `${p}.redactCookies`, issues),
    redactCredentials: booleanValue(s.redactCredentials, fallback.redactCredentials, `${p}.redactCredentials`, issues),
    captureHar: booleanValue(s.captureHar, fallback.captureHar, `${p}.captureHar`, issues),
    captureScreenshotsOnError: booleanValue(s.captureScreenshotsOnError, fallback.captureScreenshotsOnError, `${p}.captureScreenshotsOnError`, issues),
    channels,
  };
}

// ------------------------------------------------------------- validation ---

export const SCRAPER_VALIDATION_FAILURE_MODES = ['warn', 'skip', 'abort'] as const;
export type ScraperValidationFailureMode = (typeof SCRAPER_VALIDATION_FAILURE_MODES)[number];

export interface ScraperValidationSettings {
  requirePlayableStream: boolean;
  verifyEpisodeCount: boolean;
  verifySubtitlePresence: boolean;
  rejectPlaceholderTitles: boolean;
  rejectDuplicateHashes: boolean;
  minEpisodeDurationSec: number;
  maxTitleLength: number;
  onFailure: ScraperValidationFailureMode;
}

export const DEFAULT_SCRAPER_VALIDATION_SETTINGS: ScraperValidationSettings = {
  requirePlayableStream: true,
  verifyEpisodeCount: true,
  verifySubtitlePresence: false,
  rejectPlaceholderTitles: true,
  rejectDuplicateHashes: true,
  minEpisodeDurationSec: 60,
  maxTitleLength: 200,
  onFailure: 'warn',
};

export function validateScraperValidationSettings(
  input: unknown,
  fallback: ScraperValidationSettings,
  issues: ScraperSettingsIssue[],
  p: string,
): ScraperValidationSettings {
  const s = isRecord(input) ? input : {};
  return {
    requirePlayableStream: booleanValue(s.requirePlayableStream, fallback.requirePlayableStream, `${p}.requirePlayableStream`, issues),
    verifyEpisodeCount: booleanValue(s.verifyEpisodeCount, fallback.verifyEpisodeCount, `${p}.verifyEpisodeCount`, issues),
    verifySubtitlePresence: booleanValue(s.verifySubtitlePresence, fallback.verifySubtitlePresence, `${p}.verifySubtitlePresence`, issues),
    rejectPlaceholderTitles: booleanValue(s.rejectPlaceholderTitles, fallback.rejectPlaceholderTitles, `${p}.rejectPlaceholderTitles`, issues),
    rejectDuplicateHashes: booleanValue(s.rejectDuplicateHashes, fallback.rejectDuplicateHashes, `${p}.rejectDuplicateHashes`, issues),
    minEpisodeDurationSec: boundedNumber(s.minEpisodeDurationSec, fallback.minEpisodeDurationSec, 0, 86_400, `${p}.minEpisodeDurationSec`, issues),
    maxTitleLength: boundedNumber(s.maxTitleLength, fallback.maxTitleLength, 16, 512, `${p}.maxTitleLength`, issues),
    onFailure: enumValue(s.onFailure, SCRAPER_VALIDATION_FAILURE_MODES, fallback.onFailure, `${p}.onFailure`, issues),
  };
}

// ----------------------------------------------------------------- export ---

export const SCRAPER_EXPORT_FORMATS = ['json', 'csv', 'ndjson', 'm3u', 'torrent-list'] as const;
export type ScraperExportFormat = (typeof SCRAPER_EXPORT_FORMATS)[number];

export interface ScraperExportSettings {
  format: ScraperExportFormat;
  /** A path handle, resolved by the main process — never a raw user path here. */
  destinationRef: string;
  includeColumns: string[];
  splitBySeason: boolean;
  includeSubtitleColumn: boolean;
  prettyPrint: boolean;
  openAfterExport: boolean;
  filenameTemplate: string;
}

export const DEFAULT_SCRAPER_EXPORT_SETTINGS: ScraperExportSettings = {
  format: 'json',
  destinationRef: '',
  includeColumns: ['index', 'title', 'type', 'language', 'resolution', 'source', 'size'],
  splitBySeason: false,
  includeSubtitleColumn: true,
  prettyPrint: true,
  openAfterExport: false,
  filenameTemplate: '{series}-{date}',
};

export function validateScraperExportSettings(
  input: unknown,
  fallback: ScraperExportSettings,
  issues: ScraperSettingsIssue[],
  p: string,
): ScraperExportSettings {
  const s = isRecord(input) ? input : {};
  return {
    format: enumValue(s.format, SCRAPER_EXPORT_FORMATS, fallback.format, `${p}.format`, issues),
    destinationRef: stringValue(s.destinationRef, fallback.destinationRef, 1_024, `${p}.destinationRef`, issues),
    includeColumns: stringListValue(s.includeColumns, fallback.includeColumns, `${p}.includeColumns`, issues, 40),
    splitBySeason: booleanValue(s.splitBySeason, fallback.splitBySeason, `${p}.splitBySeason`, issues),
    includeSubtitleColumn: booleanValue(s.includeSubtitleColumn, fallback.includeSubtitleColumn, `${p}.includeSubtitleColumn`, issues),
    prettyPrint: booleanValue(s.prettyPrint, fallback.prettyPrint, `${p}.prettyPrint`, issues),
    openAfterExport: booleanValue(s.openAfterExport, fallback.openAfterExport, `${p}.openAfterExport`, issues),
    filenameTemplate: stringValue(s.filenameTemplate, fallback.filenameTemplate, 240, `${p}.filenameTemplate`, issues),
  };
}

// -------------------------------------------------------------- scheduler ---

export const SCRAPER_MISSED_RUN_POLICIES = ['skip', 'run-once', 'run-all'] as const;
export type ScraperMissedRunPolicy = (typeof SCRAPER_MISSED_RUN_POLICIES)[number];

export interface ScraperScheduleEntry {
  id: string;
  label: string;
  cron: string;
  targetUrl: string;
  profileId: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface ScraperSchedulerSettings {
  enabled: boolean;
  entries: ScraperScheduleEntry[];
  maxConcurrentScheduled: number;
  skipIfRunning: boolean;
  missedRunPolicy: ScraperMissedRunPolicy;
  requireExternalPower: boolean;
  requireUnmeteredNetwork: boolean;
  /** '' on either side disables quiet hours. */
  quietHoursStart: string;
  quietHoursEnd: string;
}

const MAX_SCHEDULES = 50;

export const DEFAULT_SCRAPER_SCHEDULER_SETTINGS: ScraperSchedulerSettings = {
  enabled: false,
  entries: [],
  maxConcurrentScheduled: 2,
  skipIfRunning: true,
  missedRunPolicy: 'run-once',
  requireExternalPower: false,
  requireUnmeteredNetwork: true,
  quietHoursStart: '',
  quietHoursEnd: '',
};

export function validateScraperSchedulerSettings(
  input: unknown,
  fallback: ScraperSchedulerSettings,
  issues: ScraperSettingsIssue[],
  p: string,
): ScraperSchedulerSettings {
  const s = isRecord(input) ? input : {};

  let entries: ScraperScheduleEntry[];
  if (Array.isArray(s.entries)) {
    const seen = new Set<string>();
    entries = [];
    for (const [index, raw] of s.entries.slice(0, MAX_SCHEDULES).entries()) {
      const path = `${p}.entries.${index}`;
      if (!isRecord(raw)) {
        issues.push({ path, message: 'Ignored a schedule that is not an object.' });
        continue;
      }
      const id = safeId(raw.id, '');
      if (!id || seen.has(id)) {
        issues.push({ path, message: 'Ignored a schedule with a missing or duplicate id.' });
        continue;
      }
      seen.add(id);
      entries.push({
        id,
        label: stringValue(raw.label, id, 120, `${path}.label`, issues),
        cron: cronValue(raw.cron, '0 3 * * *', `${path}.cron`, issues),
        targetUrl: stringValue(raw.targetUrl, '', 2_048, `${path}.targetUrl`, issues),
        profileId: safeId(raw.profileId, 'balanced'),
        enabled: booleanValue(raw.enabled, true, `${path}.enabled`, issues),
        lastRunAt: nullableDateValue(raw.lastRunAt, null, `${path}.lastRunAt`, issues),
        nextRunAt: nullableDateValue(raw.nextRunAt, null, `${path}.nextRunAt`, issues),
      });
    }
  } else {
    if (s.entries !== undefined) {
      issues.push({ path: `${p}.entries`, message: 'Expected a list of schedules.' });
    }
    entries = fallback.entries.map((e) => ({ ...e }));
  }

  return {
    enabled: booleanValue(s.enabled, fallback.enabled, `${p}.enabled`, issues),
    entries,
    maxConcurrentScheduled: boundedNumber(s.maxConcurrentScheduled, fallback.maxConcurrentScheduled, 1, 8, `${p}.maxConcurrentScheduled`, issues),
    skipIfRunning: booleanValue(s.skipIfRunning, fallback.skipIfRunning, `${p}.skipIfRunning`, issues),
    missedRunPolicy: enumValue(s.missedRunPolicy, SCRAPER_MISSED_RUN_POLICIES, fallback.missedRunPolicy, `${p}.missedRunPolicy`, issues),
    requireExternalPower: booleanValue(s.requireExternalPower, fallback.requireExternalPower, `${p}.requireExternalPower`, issues),
    requireUnmeteredNetwork: booleanValue(s.requireUnmeteredNetwork, fallback.requireUnmeteredNetwork, `${p}.requireUnmeteredNetwork`, issues),
    quietHoursStart: clockValue(s.quietHoursStart, fallback.quietHoursStart, `${p}.quietHoursStart`, issues),
    quietHoursEnd: clockValue(s.quietHoursEnd, fallback.quietHoursEnd, `${p}.quietHoursEnd`, issues),
  };
}

// ---------------------------------------------------------- notifications ---

export const SCRAPER_NOTIFY_CHANNELS = ['toast', 'system', 'both', 'none'] as const;
export type ScraperNotifyChannel = (typeof SCRAPER_NOTIFY_CHANNELS)[number];

export interface ScraperNotificationSettings {
  onComplete: boolean;
  onError: boolean;
  onNewEpisode: boolean;
  onScheduleRun: boolean;
  onStudyReady: boolean;
  channel: ScraperNotifyChannel;
  soundEnabled: boolean;
  /** 0 = deliver immediately. */
  digestMinutes: number;
}

export const DEFAULT_SCRAPER_NOTIFICATION_SETTINGS: ScraperNotificationSettings = {
  onComplete: true,
  onError: true,
  onNewEpisode: true,
  onScheduleRun: false,
  onStudyReady: true,
  channel: 'toast',
  soundEnabled: false,
  digestMinutes: 0,
};

export function validateScraperNotificationSettings(
  input: unknown,
  fallback: ScraperNotificationSettings,
  issues: ScraperSettingsIssue[],
  p: string,
): ScraperNotificationSettings {
  const s = isRecord(input) ? input : {};
  return {
    onComplete: booleanValue(s.onComplete, fallback.onComplete, `${p}.onComplete`, issues),
    onError: booleanValue(s.onError, fallback.onError, `${p}.onError`, issues),
    onNewEpisode: booleanValue(s.onNewEpisode, fallback.onNewEpisode, `${p}.onNewEpisode`, issues),
    onScheduleRun: booleanValue(s.onScheduleRun, fallback.onScheduleRun, `${p}.onScheduleRun`, issues),
    onStudyReady: booleanValue(s.onStudyReady, fallback.onStudyReady, `${p}.onStudyReady`, issues),
    channel: enumValue(s.channel, SCRAPER_NOTIFY_CHANNELS, fallback.channel, `${p}.channel`, issues),
    soundEnabled: booleanValue(s.soundEnabled, fallback.soundEnabled, `${p}.soundEnabled`, issues),
    digestMinutes: boundedNumber(s.digestMinutes, fallback.digestMinutes, 0, 1_440, `${p}.digestMinutes`, issues),
  };
}

// -------------------------------------------------------------- developer ---

export interface ScraperDeveloperSettings {
  showRawHtml: boolean;
  showSelectorOverlay: boolean;
  recordNetworkTrace: boolean;
  /** Gates the Script Console's input; off means the console is read-only. */
  allowScriptConsole: boolean;
  /**
   * Forces every screen back onto sample data even where a real backend exists.
   * Defaulted off now that one does: the port already falls back per method for
   * anything main has not implemented, so this is a debugging switch rather
   * than the normal way to run.
   */
  mockMode: boolean;
  verboseTimings: boolean;
  pluginIds: string[];
  experimentFlags: Record<string, boolean>;
}

export const DEFAULT_SCRAPER_DEVELOPER_SETTINGS: ScraperDeveloperSettings = {
  showRawHtml: false,
  showSelectorOverlay: false,
  recordNetworkTrace: false,
  allowScriptConsole: false,
  mockMode: false,
  verboseTimings: false,
  pluginIds: [],
  experimentFlags: {},
};

export function validateScraperDeveloperSettings(
  input: unknown,
  fallback: ScraperDeveloperSettings,
  issues: ScraperSettingsIssue[],
  p: string,
): ScraperDeveloperSettings {
  const s = isRecord(input) ? input : {};

  let experimentFlags: Record<string, boolean>;
  if (s.experimentFlags === undefined) {
    experimentFlags = { ...fallback.experimentFlags };
  } else if (!isRecord(s.experimentFlags)) {
    issues.push({ path: `${p}.experimentFlags`, message: 'Expected a flag name/boolean object.' });
    experimentFlags = { ...fallback.experimentFlags };
  } else {
    experimentFlags = {};
    for (const [rawName, rawValue] of Object.entries(s.experimentFlags).slice(0, 50)) {
      const name = safeId(rawName, '');
      if (!name || typeof rawValue !== 'boolean') {
        issues.push({ path: `${p}.experimentFlags.${rawName}`, message: 'Ignored an invalid flag.' });
        continue;
      }
      experimentFlags[name] = rawValue;
    }
  }

  return {
    showRawHtml: booleanValue(s.showRawHtml, fallback.showRawHtml, `${p}.showRawHtml`, issues),
    showSelectorOverlay: booleanValue(s.showSelectorOverlay, fallback.showSelectorOverlay, `${p}.showSelectorOverlay`, issues),
    recordNetworkTrace: booleanValue(s.recordNetworkTrace, fallback.recordNetworkTrace, `${p}.recordNetworkTrace`, issues),
    allowScriptConsole: booleanValue(s.allowScriptConsole, fallback.allowScriptConsole, `${p}.allowScriptConsole`, issues),
    mockMode: booleanValue(s.mockMode, fallback.mockMode, `${p}.mockMode`, issues),
    verboseTimings: booleanValue(s.verboseTimings, fallback.verboseTimings, `${p}.verboseTimings`, issues),
    pluginIds: stringListValue(s.pluginIds, fallback.pluginIds, `${p}.pluginIds`, issues, 50)
      .map((v) => safeId(v, ''))
      .filter(Boolean),
    experimentFlags,
  };
}

// ------------------------------------------------------- clone / merge -----
//
// Every group with a nested array or record needs an explicit deep copy —
// a shallow spread would let two profiles share one array, which is exactly
// the aliasing bug the settings tests guard against.

export function cloneScraperOutputGroup<
  T extends Record<string, unknown>,
>(value: T, arrayKeys: (keyof T)[], recordKeys: (keyof T)[] = []): T {
  const out = { ...value };
  for (const key of arrayKeys) {
    const list = value[key];
    if (Array.isArray(list)) {
      (out[key] as unknown) = list.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item) ? { ...item } : item,
      );
    }
  }
  for (const key of recordKeys) {
    const record = value[key];
    if (record && typeof record === 'object') (out[key] as unknown) = { ...record };
  }
  return out;
}
