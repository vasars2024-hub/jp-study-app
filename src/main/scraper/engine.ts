// The scrape engine.
//
// A run is a sequence of stages, each of which emits events as it goes: the
// progress bar, the log console and the episode table are all fed from the same
// stream, so what the UI shows is what the job did rather than a summary
// written afterwards.
//
// What a run actually does, and deliberately does not do:
//
//   searching   — resolves the target (a title, or a URL whose <title> is read)
//                 against the public catalogue.
//   fetching    — pulls the episode list for the matched title.
//   parsing     — turns it into rows, applying the episode-processing rules.
//   streams     — asks the configured torrent *indexes* what releases exist for
//                 the title. There is no stream resolver here: this app reads
//                 published metadata and index listings, and hands magnets to
//                 the user's own torrent client. It does not locate, decrypt or
//                 fetch media from streaming sites.
//   subtitles   — reports what the indexed releases advertise. Provider lookups
//                 that need an API key are skipped with a log line saying so,
//                 rather than silently returning nothing.
//   validating  — applies the profile's validation rules to every row.

import type {
  EpisodeRow,
  ScrapeJobEvent,
  ScrapeJobSummary,
  ScrapeResult,
  ScrapeStage,
  ScrapeStageTiming,
  SubtitleAvailability,
  TorrentRow,
} from '../../shared/scraperResults';
import type { ScraperAudioPreference, ScraperSettings } from '../../shared/scraperSettings';
import type { ScraperTitleLanguage } from '../../shared/scraperOutputSettings';
import type { ScraperStartInput } from '../../shared/scraperIpc';
import {
  catalogueDetail,
  catalogueEpisodes,
  providerLabel,
  searchCatalogue,
  toSeriesMetadata,
  workTitleFor,
  type CatalogueEpisode,
  type CatalogueWork,
} from './catalogue';
import { DOMParser } from 'linkedom';
import {
  extractWithRule,
  ruleForUrl,
  type RuleDocument,
  type RuleExtraction,
  type ScraperSiteRule,
} from '../../shared/scraperSiteRules';
import { applyExtractionSettings } from './extractionRules';
import {
  applyEpisodeProcessing,
  missingEpisodeNumbers,
  missingEpisodesNote,
} from './episodeProcessingRules';
import { buildImageRows, episodeThumbnailFor } from './imageSet';
import { scraperRequest } from './http';
import { scraperLog, scraperLogsFor } from './logBus';
import { runWithScraperRuntime, scraperRuntimeFor } from './runtime';
import { searchTorrents } from './torrents';
import { resolveSeanimeStreams } from './seanimeSources';
import { enabledSourcesOfKind, metadataProviderOrder } from '../../shared/scraperSourceOrder';

export type JobEmitter = (jobId: string, event: ScrapeJobEvent) => void;

interface Job {
  id: string;
  input: ScraperStartInput;
  startedAt: number;
  stage: ScrapeStage;
  /** When the current stage began; -1 once the timeline has been closed. */
  stageStartedAt: number;
  /** Measured stage durations, in the order the run passed through them. */
  timings: ScrapeStageTiming[];
  cancelled: boolean;
  rows: EpisodeRow[];
  result: ScrapeResult | null;
  summary: ScrapeJobSummary | null;
}

const jobs = new Map<string, Job>();
let counter = 0;

export interface JobFinished {
  summary: ScrapeJobSummary;
  result: ScrapeResult;
  /**
   * The profile the run used. Carried on the hook rather than looked up by the
   * consumer: history and notifications both need it, and the job that produced
   * it is the only thing that reliably knows which of several profiles it was.
   */
  settings: ScraperSettings;
}

export interface JobFailed {
  jobId: string;
  /** The target as the user typed it — the only name a failed run ever has. */
  target: string;
  message: string;
  settings: ScraperSettings;
}

/** Set by index.ts so persistence can live outside the engine. */
let onFinished: ((job: JobFinished) => void) | null = null;
/** Set by index.ts. Separate from `onFinished`, which only fires on success. */
let onFailed: ((job: JobFailed) => void) | null = null;

export function setJobFinishedHook(hook: ((job: JobFinished) => void) | null): void {
  onFinished = hook;
}

export function setJobFailedHook(hook: ((job: JobFailed) => void) | null): void {
  onFailed = hook;
}

export function activeJobCount(): number {
  let count = 0;
  for (const job of jobs.values()) {
    if (!job.cancelled && job.stage !== 'done' && job.stage !== 'failed' && job.stage !== 'cancelled') {
      count += 1;
    }
  }
  return count;
}

class Cancelled extends Error {}

// ------------------------------------------------------------------ target ---

const URL_LIKE = /^https?:\/\//i;

/** `Frieren - Watch on Example` → `Frieren`, so a pasted page title still matches. */
export function cleanPageTitle(title: string): string {
  return title
    .replace(/\s*[|｜–—·・-]\s*(watch|stream|anime|episode list|myanimelist|anilist).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `https://anilist.co/anime/21/ONE-PIECE/` → `ONE PIECE`. */
export function slugFromUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  // Trailing numeric ids are not names; walk back to the last wordy segment.
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (/^\d+$/.test(segment) || /^(https?:|www\.)/i.test(segment)) continue;
    if (segment.includes('.') && i <= 1) continue;
    // A stray `%` makes decodeURIComponent throw; the raw segment is a fine
    // answer, and a URIError here would surface as a scrape failure whose
    // message says nothing about the URL that caused it.
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      /* keep the segment as written */
    }
    const words = decoded.replace(/[-_+]+/g, ' ').trim();
    if (/[a-z]/i.test(words) || /[぀-ヿ一-鿿]/.test(words)) return words;
  }
  return '';
}

/**
 * An id-safe slug for a URL.
 *
 * `slugFromUrl` deliberately returns human words because its job is to build a
 * search query; that is the wrong thing to embed in an id, which ends up in
 * row ids, history filenames and export names. This keeps only characters that
 * are safe everywhere.
 */
export function idSlugFromUrl(url: string): string {
  const words = slugFromUrl(url);
  const slug = words
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (slug) return slug;
  // A page with no wordy segment at all still needs a stable, distinct id.
  try {
    return new URL(url).hostname.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'page';
  } catch {
    return 'page';
  }
}

/**
 * Whether a page title is really the site's own name.
 *
 * Client-rendered catalogue sites serve a shell whose `<title>` is just the
 * brand — anilist.co literally answers `AniList` — and searching for that finds
 * nothing. Recognising it is what lets the slug take over.
 */
export function isSiteNameOnly(title: string, url: string): boolean {
  const cleaned = title.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!cleaned) return true;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  const brand = host
    .replace(/^www\./i, '')
    .split('.')
    .slice(0, -1)
    .join('')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  return Boolean(brand) && cleaned === brand;
}

/**
 * Turns whatever the user typed into a search query.
 *
 * A URL is fetched and its `<title>` used — that is the one case where the
 * scraper reads a page the user chose, and it reads only the title element.
 */
export async function resolveQuery(target: string, correlationId: string): Promise<string> {
  const trimmed = target.trim();
  if (!trimmed) return '';
  if (!URL_LIKE.test(trimmed)) return trimmed;
  scraperLog('info', 'engine', `Reading the page title from ${trimmed}`, { correlationId });
  try {
    const response = await scraperRequest(trimmed, {
      timeoutMs: 20_000,
      maxBytes: 256 * 1024,
      correlationId,
      // A page the user pointed us at, read for its <title>. This and the site
      // rule fetch below are the two requests robots.txt governs.
      crawl: true,
    });
    const title = /<title[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(response.body)?.[1] ?? '';
    const cleaned = cleanPageTitle(title.replace(/&amp;/g, '&').replace(/&#\d+;/g, ''));
    if (cleaned && !isSiteNameOnly(cleaned, trimmed)) {
      scraperLog('info', 'engine', `Page title: "${cleaned}"`, { correlationId });
      return cleaned;
    }
    if (cleaned) {
      scraperLog('info', 'engine', `"${cleaned}" is just the site name; using the URL instead.`, {
        correlationId,
      });
    }
  } catch (error) {
    scraperLog('warn', 'engine', `Could not read that page: ${
      error instanceof Error ? error.message : String(error)
    }`, { correlationId });
  }
  // No usable title — the URL's own slug is the next best evidence, and on a
  // client-rendered catalogue site it is usually the only evidence there is.
  const slug = slugFromUrl(trimmed);
  if (slug) scraperLog('info', 'engine', `Using the URL slug: "${slug}"`, { correlationId });
  return slug;
}

// -------------------------------------------------------------------- rows ---

/**
 * The audio column's value for a profile's preference.
 *
 * The preference enum is `subbed | dubbed | raw | none`; this used to compare
 * against `'dub'`, which no setting can ever equal, so every row was labelled
 * `sub` regardless of the profile.
 */
export function audioLabel(preference: ScraperAudioPreference): string {
  switch (preference) {
    case 'dubbed':
      return 'dub';
    case 'raw':
      return 'raw';
    case 'none':
      return '';
    default:
      return 'sub';
  }
}

function numberLabel(n: number): string {
  return `EP ${String(n).padStart(2, '0')}`;
}

function subtitlesFromReleases(
  releases: TorrentRow[],
  episodeNumber: number,
): SubtitleAvailability[] {
  // A release's advertised languages are evidence about that episode only when
  // the release covers it: a batch covers everything, a single episode has its
  // number in the name.
  const relevant = releases.filter(
    (row) => row.isBatch || new RegExp(`\\b0*${episodeNumber}\\b`).test(row.name),
  );
  const byLanguage = new Map<string, SubtitleAvailability>();
  for (const release of relevant) {
    for (const language of release.subtitleLanguages) {
      if (byLanguage.has(language)) continue;
      byLanguage.set(language, {
        language,
        // The index publishes the language, not the container format.
        format: 'ass',
        embedded: true,
        // Advertised, not inspected: this is availability evidence, not a
        // quality measurement, and claiming a precise score would be a lie.
        quality: 0.5,
        source: release.tracker,
      });
    }
  }
  return [...byLanguage.values()];
}

/**
 * Turns a site rule's extraction into episode rows.
 *
 * A rule-scraped page carries far less than a catalogue: no Japanese title, no
 * runtime, no air date. Those are left empty rather than guessed — a fabricated
 * air date is worse than a missing one, because it looks like data.
 */
export function buildRuleRows(
  extraction: RuleExtraction,
  rule: ScraperSiteRule,
  settings: ScraperSettings,
  seriesId: string,
): EpisodeRow[] {
  const processing = settings.episodeProcessing;
  const preferredResolution = processing.resolutionPriority[0]
    ? `${processing.resolutionPriority[0]}p`
    : '';

  let rows = extraction.rows.map((row): EpisodeRow => {
    // A row the rule could not number falls back to its document position, so
    // it still gets a stable id rather than colliding on `-eNaN`.
    const number = row.number ?? row.index;
    return {
      id: `${seriesId}-e${number}`,
      seriesId,
      number,
      numberLabel: numberLabel(number),
      season: 1,
      titleEn: row.title,
      titleJa: '',
      kind: 'episode',
      audio: audioLabel(processing.audioPreference),
      resolution: preferredResolution,
      sourceId: `site-rule:${rule.id}`,
      sourceLabel: rule.host,
      sizeBytes: 0,
      durationSec: 0,
      airDate: '',
      url: row.link,
      thumbnailUrl: '',
      subtitles: [],
      status: 'pending',
      statusNote: '',
    };
  });

  rows = applyExtractionSettings(rows, settings.extraction);
  rows = applyEpisodeProcessing(rows, processing).rows;
  if (processing.naturalSort) rows = [...rows].sort((a, b) => a.number - b.number);
  return rows;
}

/**
 * Which of a catalogue episode's titles the Metadata group asked for.
 *
 * Each choice falls back through the others rather than to an empty string: a
 * provider that publishes only a romaji title should not produce a blank row
 * because the profile prefers English.
 */
export function episodeTitleFor(
  episode: CatalogueEpisode,
  language: ScraperTitleLanguage,
): string {
  switch (language) {
    case 'romaji':
      return episode.titleRomaji || episode.titleEn || episode.titleJa;
    case 'native':
      return episode.titleJa || episode.titleEn || episode.titleRomaji;
    default:
      return episode.titleEn || episode.titleRomaji || episode.titleJa;
  }
}

export function buildEpisodeRows(
  work: CatalogueWork,
  episodes: CatalogueEpisode[],
  settings: ScraperSettings,
  releases: TorrentRow[],
): EpisodeRow[] {
  const seriesId = `${work.provider}-${work.id}`;
  const label = providerLabel(work);
  const processing = settings.episodeProcessing;
  const metadata = settings.metadata;
  const preferredResolution = processing.resolutionPriority[0]
    ? `${processing.resolutionPriority[0]}p`
    : '';

  let rows = episodes.map((episode): EpisodeRow => {
    const matching = releases.filter(
      (row) => row.isBatch || new RegExp(`\\b0*${episode.number}\\b`).test(row.name),
    );
    const best = matching[0];
    return {
      id: `${seriesId}-e${episode.number}`,
      seriesId,
      number: episode.number,
      numberLabel: numberLabel(episode.number),
      season: 1,
      titleEn: episodeTitleFor(episode, metadata.titleLanguage),
      // The second, smaller Japanese line under a row title is exactly what
      // `alsoStoreNativeTitle` names, so turning it off empties the field
      // rather than merely hiding it.
      titleJa: metadata.alsoStoreNativeTitle ? episode.titleJa : '',
      kind: episode.recap ? 'recap' : 'episode',
      audio: audioLabel(processing.audioPreference),
      resolution: best?.resolution || preferredResolution,
      sourceId: best ? 'index' : 'catalogue',
      sourceLabel: best?.tracker ?? label,
      // Only a matched release knows a size; the catalogue never does.
      sizeBytes: best && !best.isBatch ? best.sizeBytes : 0,
      durationSec: work.averageDurationSec,
      airDate: metadata.fetchAirDates ? episode.airDate : null,
      url: episode.url,
      thumbnailUrl: episodeThumbnailFor(episode, work, settings.images),
      subtitles: subtitlesFromReleases(releases, episode.number),
      status: 'pending',
      statusNote: '',
    };
  });

  // Before the recap filter, not after: `detectSpecials` can re-classify a row
  // the catalogue never flagged, and `ignoreRecaps` should act on the kind the
  // user will actually see.
  rows = applyExtractionSettings(rows, settings.extraction);
  if (processing.ignoreRecaps) rows = rows.filter((row) => row.kind !== 'recap');
  if (processing.ignoreFiller) {
    const filler = new Set(episodes.filter((e) => e.filler).map((e) => e.number));
    rows = rows.filter((row) => !filler.has(row.number));
  }
  rows = applyEpisodeProcessing(rows, processing, { skipKindFilter: true }).rows;
  if (processing.naturalSort) rows.sort((a, b) => a.number - b.number);
  return rows;
}

/**
 * Applies the profile's validation rules.
 *
 * `onFailure: 'skip'` drops the row; 'warn' keeps it marked; 'abort' is
 * reported by the caller, which needs to stop the whole run.
 */
export function validateRows(
  rows: EpisodeRow[],
  settings: ScraperSettings,
): { rows: EpisodeRow[]; failures: number } {
  const validation = settings.validation;
  const marked = rows.map((row) => {
    const problems: string[] = [];
    if (validation.rejectPlaceholderTitles) {
      const title = row.titleEn.trim();
      if (!title || /^(episode|ep\.?)\s*\d+$/i.test(title) || title === '?') {
        problems.push('Placeholder title.');
      }
    }
    if (validation.maxTitleLength > 0 && row.titleEn.length > validation.maxTitleLength) {
      problems.push('Title is longer than the limit.');
    }
    // A duration of 0 means "the catalogue did not say", which is not the same
    // as "too short" — only a known-and-too-short duration is a failure.
    if (
      validation.minEpisodeDurationSec > 0
      && row.durationSec > 0
      && row.durationSec < validation.minEpisodeDurationSec
    ) {
      problems.push('Shorter than the minimum episode duration.');
    }
    if (validation.verifySubtitlePresence && row.subtitles.length === 0) {
      problems.push('No subtitles found.');
    }
    if (validation.requirePlayableStream && !row.url) {
      problems.push('No playable link.');
    }
    if (!problems.length) return { ...row, status: 'ok' as const, statusNote: '' };
    return {
      ...row,
      status: validation.onFailure === 'warn' ? ('warning' as const) : ('failed' as const),
      statusNote: problems.join(' '),
    };
  });

  const failures = marked.filter((row) => row.status !== 'ok').length;
  const kept = validation.onFailure === 'skip'
    ? marked.filter((row) => row.status === 'ok')
    : marked;
  return { rows: kept, failures };
}


// ------------------------------------------------------------------- runner ---

type StageFn = (next: ScrapeStage) => void;
type ProgressFn = (done: number, total: number, etaSec: number) => void;

/**
 * Streams rows to the UI, reporting progress once per batch.
 *
 * `performance.batchSize` is what "Batch Size" means here: rows still arrive
 * one event at a time — a table that filled in blocks of fifty would be a worse
 * table — but the progress bar is told once per batch. That is the cost the
 * setting can actually control, since a progress event crosses the IPC boundary
 * and a row event was crossing it either way. The last row always reports, so
 * the bar reaches its total whatever the batch size is.
 */
function emitRows(
  job: Job,
  rows: EpisodeRow[],
  settings: ScraperSettings,
  emit: JobEmitter,
  progress: ProgressFn,
): void {
  const batchSize = Math.max(1, settings.performance.batchSize);
  for (const [index, row] of rows.entries()) {
    if (job.cancelled) throw new Cancelled();
    emit(job.id, { kind: 'row', row });
    if ((index + 1) % batchSize === 0 || index === rows.length - 1) {
      progress(index + 1, rows.length, 0);
    }
  }
}

/**
 * The site-rule path: fetch the target itself and extract with the rule, rather
 * than asking a catalogue about a title it has never heard of.
 */
/**
 * Records how long the stage being left actually took. History renders these;
 * it used to split the total by a fixed weight table, which reported the same
 * percentages for every run.
 */
function markStage(job: Job, next: ScrapeStage): void {
  const now = Date.now();
  if (job.stageStartedAt > 0 && next !== job.stage) {
    job.timings.push({ stage: job.stage, ms: Math.max(0, now - job.stageStartedAt) });
    job.stageStartedAt = now;
  }
}

/** Closes the timeline at the moment the summary is written. */
function closeStageTimings(job: Job): ScrapeStageTiming[] {
  if (job.stageStartedAt > 0) {
    job.timings.push({ stage: job.stage, ms: Math.max(0, Date.now() - job.stageStartedAt) });
    job.stageStartedAt = -1;
  }
  return [...job.timings];
}

async function runWithSiteRule(
  job: Job,
  rule: ScraperSiteRule,
  emit: JobEmitter,
  stage: StageFn,
  progress: ProgressFn,
): Promise<void> {
  const { settings, request } = job.input;
  const correlationId = job.id;
  scraperLog('info', 'engine', `Using site rule "${rule.host}" for ${request.targetUrl}.`, {
    correlationId,
  });

  stage('fetching');
  // No per-call network options: the job runs inside its profile's runtime
  // scope, so the timeout, user agent, custom headers, cookie, proxy, retries
  // and redirect policy are already applied by `scraperRequest`.
  const response = await scraperRequest(request.targetUrl, { correlationId, crawl: true });
  if (response.status >= 400) {
    throw new Error(`${request.targetUrl} answered ${response.status}.`);
  }

  stage('parsing');
  const doc = new DOMParser().parseFromString(response.body, 'text/html');
  // linkedom's document satisfies the small surface RuleDocument needs; the
  // cast keeps shared/ free of any DOM-library type.
  const extraction = extractWithRule(
    doc as unknown as RuleDocument,
    rule,
    request.targetUrl,
    { ignoreHiddenElements: settings.extraction.ignoreHiddenElements },
  );
  if (extraction.error) throw new Error(extraction.error);
  if (!extraction.rows.length) {
    throw new Error(`The rule for ${rule.host} matched nothing on ${request.targetUrl}.`);
  }
  for (const item of extraction.checks) {
    scraperLog(item.ok ? 'debug' : 'warn', 'engine', `${item.label}: ${item.detail}`, {
      correlationId,
    });
  }

  const seriesId = `site-${rule.id}-${idSlugFromUrl(request.targetUrl)}`;
  const parsed = buildRuleRows(extraction, rule, settings, seriesId);
  emitRows(job, parsed, settings, emit, progress);

  stage('validating');
  const validated = validateRows(parsed, settings);
  job.rows = validated.rows;
  if (settings.validation.onFailure === 'abort' && validated.failures > 0) {
    throw new Error(`${validated.failures} episode(s) failed validation.`);
  }

  const title = cleanPageTitle(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(response.body)?.[1] ?? '')
    || rule.host;
  const summary: ScrapeJobSummary = {
    id: job.id,
    seriesId,
    titleEn: title,
    titleJa: '',
    provider: `Site rule · ${rule.host}`,
    profile: request.profileId,
    stage: 'done',
    ageMinutes: 0,
    durationSec: Math.round((Date.now() - job.startedAt) / 1_000),
    stageTimings: closeStageTimings(job),
    found: job.rows.length,
    failed: validated.failures,
    bytes: 0,
    note: [
      extraction.ok ? '' : 'Some rule checks did not pass.',
      settings.episodeProcessing.detectMissingNumbers
        ? missingEpisodesNote(missingEpisodeNumbers(job.rows))
        : '',
    ].filter(Boolean).join(' '),
  };
  job.result = {
    jobId: job.id,
    seriesId,
    episodes: job.rows,
    streams: [],
    torrents: [],
    images: [],
    // Everything a catalogue would supply is left empty rather than invented:
    // a rule only ever knows what was on the page it scraped.
    metadata: {
      seriesId,
      titleEn: title,
      titleJa: '',
      titleRomaji: '',
      synopsis: '',
      genres: [],
      studios: [],
      format: '',
      status: '',
      season: '',
      episodeCount: job.rows.length,
      averageDurationSec: 0,
      contentRating: '',
      communityRating: 0,
      malId: null,
      aniListId: null,
      openingTheme: '',
      endingTheme: '',
      officialSite: request.targetUrl,
      provenance: { titleEn: `site-rule:${rule.id}`, episodeCount: `site-rule:${rule.id}` },
    },
    logs: scraperLogsFor(correlationId),
  };
  job.summary = summary;

  stage('done');
  emit(job.id, { kind: 'done', summary });
  onFinished?.({ summary, result: job.result, settings });
}

async function run(job: Job, emit: JobEmitter): Promise<void> {
  const { settings, request } = job.input;
  const correlationId = job.id;
  const stage = (next: ScrapeStage) => {
    if (job.cancelled) throw new Cancelled();
    markStage(job, next);
    job.stage = next;
    emit(job.id, { kind: 'stage', stage: next });
  };
  const progress = (done: number, total: number, etaSec: number) =>
    emit(job.id, { kind: 'progress', done, total, etaSec });

  stage('searching');

  // A site rule wins over the catalogue for its own host: the user configured
  // it precisely because the catalogue does not know this page.
  const rule = ruleForUrl(settings.extraction.siteRules, request.targetUrl);
  if (rule) {
    await runWithSiteRule(job, rule, emit, stage, progress);
    return;
  }

  if (request.contentType && request.contentType !== 'anime') {
    throw new Error(
      `${request.contentType} acquisition is not connected to a catalogue provider yet.`,
    );
  }

  const query = await resolveQuery(request.targetUrl, correlationId);
  if (!query) throw new Error('There is nothing to search for.');
  // The Source Manager's metadata order when it lists a catalogue, the
  // metadata group's own order otherwise — see `metadataProviderOrder`.
  const candidates = await searchCatalogue(
    query,
    correlationId,
    5,
    metadataProviderOrder(settings),
  );
  if (!candidates.length) throw new Error(`Nothing in the catalogue matches "${query}".`);
  const chosen = candidates[0];
  scraperLog('info', 'engine', `Matched "${chosen.titleEn || chosen.titleRomaji}".`, {
    correlationId,
  });

  stage('fetching');
  const detail = (await catalogueDetail(chosen, correlationId)) ?? chosen;
  const episodes = await catalogueEpisodes(detail, correlationId, (page, count) => {
    if (job.cancelled) return;
    // Episode pages are the only part of the run whose size is knowable in
    // advance, so this is where a real percentage comes from.
    const total = detail.episodeCount || count;
    progress(Math.min(count, total), total, 0);
    scraperLog('debug', 'engine', `Episode page ${page}: ${count} so far.`, { correlationId });
  });
  if (job.cancelled) throw new Cancelled();
  if (!episodes.length) {
    scraperLog('warn', 'engine', 'The catalogue lists no episodes for this title.', {
      correlationId,
    });
  }

  stage('streams');
  let releases: TorrentRow[] = [];
  // Priority order, so a release two indexes both list is credited to the
  // higher one, and a failed index can hand over to its fallbacks.
  const indexers = enabledSourcesOfKind(settings.sources, 'torrent');
  if (settings.sources.mode !== 'streaming' && indexers.length) {
    releases = await searchTorrents({
      query: { text: detail.titleRomaji || detail.titleEn },
      indexers,
      torrents: settings.torrents,
      timeoutMs: settings.sources.perSourceTimeoutMs,
      pool: settings.sources.entries,
      maxFallbackDepth: settings.sources.maxFallbackDepth,
    });
  } else {
    scraperLog(
      'info',
      'engine',
      indexers.length
        ? 'Source mode is streaming-only, so no index was searched.'
        : 'No torrent index is enabled, so this run is catalogue-only.',
      { correlationId },
    );
  }
  if (job.cancelled) throw new Cancelled();

  const parsed = buildEpisodeRows(detail, episodes, settings, releases);
  let streams = await resolveSeanimeStreams({
    work: detail,
    episodes: parsed,
    settings,
    correlationId,
    providerOrder: job.input.context?.streamProviderOrder,
  });
  if (job.cancelled) throw new Cancelled();

  stage('parsing');
  emitRows(job, parsed, settings, emit, progress);

  stage('subtitles');
  const withSubtitles = parsed.filter((row) => row.subtitles.length > 0).length;
  scraperLog(
    'info',
    'engine',
    `${withSubtitles} of ${parsed.length} episodes have a release advertising subtitles.`,
    { correlationId },
  );

  stage('validating');
  const validated = validateRows(parsed, settings);
  job.rows = validated.rows;
  if (settings.validation.onFailure === 'abort' && validated.failures > 0) {
    throw new Error(`${validated.failures} episode(s) failed validation.`);
  }
  scraperLog(
    validated.failures ? 'warn' : 'info',
    'engine',
    `Validation: ${validated.rows.length} kept, ${validated.failures} flagged.`,
    { correlationId },
  );

  const seriesId = `${detail.provider}-${detail.id}`;
  const keptEpisodeIds = new Set(job.rows.map((row) => row.id));
  streams = streams.filter((stream) => keptEpisodeIds.has(stream.episodeId));
  const durationSec = Math.round((Date.now() - job.startedAt) / 1_000);
  const summary: ScrapeJobSummary = {
    id: job.id,
    seriesId,
    titleEn: workTitleFor(detail, settings.metadata.titleLanguage),
    titleJa: settings.metadata.alsoStoreNativeTitle ? detail.titleJa : '',
    provider: providerLabel(detail),
    profile: request.profileId,
    stage: 'done',
    ageMinutes: 0,
    durationSec,
    stageTimings: closeStageTimings(job),
    found: job.rows.length,
    failed: validated.failures,
    bytes: job.rows.reduce((total, row) => total + row.sizeBytes, 0),
    note: [
      settings.episodeProcessing.detectMissingNumbers
        ? missingEpisodesNote(missingEpisodeNumbers(job.rows))
        : '',
      releases.length ? `${releases.length} index result(s).` : '',
      streams.length ? `${streams.length} playable stream(s).` : '',
    ].filter(Boolean).join(' '),
  };
  job.result = {
    jobId: job.id,
    seriesId,
    episodes: job.rows,
    streams,
    torrents: releases,
    images: buildImageRows(detail, seriesId, episodes, settings.images, providerLabel(detail)),
    metadata: toSeriesMetadata(detail, seriesId, settings.metadata),
    logs: scraperLogsFor(correlationId),
  };
  job.summary = summary;

  stage('done');
  emit(job.id, { kind: 'done', summary });
  onFinished?.({ summary, result: job.result, settings });
}

// --------------------------------------------------------- job admission ---
//
// `performance.maxParallelJobs` decides how many runs may be in flight. A job
// beyond the limit waits at stage 'queued' — which the stage vocabulary already
// had and nothing ever used — rather than starting and competing for sockets.
//
// The limit is read from the waiting job's own profile, not from a global, so a
// run started under Thorough (2) does not inherit the limit of a Fast run that
// happens to be queued behind it.

interface PendingJob {
  job: Job;
  start: () => Promise<void>;
}

const pending: PendingJob[] = [];
let runningJobs = 0;

function pumpJobQueue(): void {
  while (pending.length) {
    const next = pending[0];
    const limit = Math.max(1, next.job.input.settings.performance.maxParallelJobs);
    if (runningJobs >= limit) return;
    pending.shift();
    runningJobs += 1;
    void next.start().finally(() => {
      runningJobs -= 1;
      pumpJobQueue();
    });
  }
}

export function startScrape(input: ScraperStartInput, emit: JobEmitter): string {
  counter += 1;
  const id = `job-${Date.now().toString(36)}-${counter}`;
  const job: Job = {
    id,
    input,
    startedAt: Date.now(),
    stage: 'queued',
    stageStartedAt: Date.now(),
    timings: [],
    cancelled: false,
    rows: [],
    result: null,
    summary: null,
  };
  jobs.set(id, job);
  scraperLog('info', 'engine', `Job ${id} queued for "${input.request.targetUrl}".`, {
    correlationId: id,
  });

  const start = () =>
    // Every request the run makes, however deep, resolves its timeout, user
    // agent, headers, cookie, proxy, retries, pacing, concurrency limit and
    // cache behaviour from this scope.
    runWithScraperRuntime(
      scraperRuntimeFor(input.settings, id, input.context?.hosts),
      () => run(job, emit),
    )
      .catch((error: unknown) => {
        if (error instanceof Cancelled || job.cancelled) {
          job.stage = 'cancelled';
          scraperLog('warn', 'engine', `Job ${id} cancelled.`, { correlationId: id });
          emit(id, { kind: 'stage', stage: 'cancelled' });
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        job.stage = 'failed';
        scraperLog('error', 'engine', `Job ${id} failed: ${message}`, { correlationId: id });
        emit(id, { kind: 'stage', stage: 'failed' });
        emit(id, { kind: 'error', message });
        // A cancelled run returns above: the user already knows, and telling
        // them their own click failed is the notification everyone turns off.
        onFailed?.({
          jobId: id,
          target: input.request.targetUrl,
          message,
          settings: input.settings,
        });
      });

  pending.push({ job, start });
  const limit = Math.max(1, input.settings.performance.maxParallelJobs);
  if (runningJobs >= limit) {
    scraperLog(
      'info',
      'engine',
      `Job ${id} is waiting: ${runningJobs} of ${limit} parallel job(s) already running.`,
      { correlationId: id },
    );
  }
  // Deferred a tick so the caller can subscribe before the first event lands.
  setTimeout(pumpJobQueue, 0);

  return id;
}

export function cancelScrape(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job || job.stage === 'done') return;
  job.cancelled = true;
}

export function jobResult(jobId: string): ScrapeResult | null {
  return jobs.get(jobId)?.result ?? null;
}

export function jobSummaries(): ScrapeJobSummary[] {
  return [...jobs.values()]
    .filter((job): job is Job & { summary: ScrapeJobSummary } => job.summary !== null)
    .map((job) => ({
      ...job.summary,
      ageMinutes: Math.round((Date.now() - job.startedAt) / 60_000),
    }));
}

/** Test seam — forgets every job, including any still waiting for a slot. */
export function resetScrapeJobs(): void {
  jobs.clear();
  pending.length = 0;
  runningJobs = 0;
  counter = 0;
}
