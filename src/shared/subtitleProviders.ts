/**
 * MASTER_PLAN §8 — Subtitle Provider & Management System (offline data-model
 * foundation).
 *
 * Defines the *subtitle provider* record (name, supported languages, search method,
 * matching rules, format support, reliability score) and the *subtitle track* record
 * — one known subtitle release, described by exactly one provider and attached to a
 * §7 {@link MediaIdentity} id so a title carried by several media providers still has
 * one subtitle shelf. On top of both sits a deterministic routing projection that
 * names which providers *could* serve a subtitle request, in priority order.
 *
 * A track is **metadata about a subtitle release**, never its bytes: there is no file
 * path, no download URL to fetch, no cue list. §8's scope note is explicit that this
 * system manages and provides subtitle files to external players (§9) — and this phase
 * stops one step earlier still, at describing and organizing them.
 *
 * Deliberately out of scope for this phase (do NOT add here):
 *   - provider execution, networking, scraping, browser automation, authentication,
 *     and request contracts of any kind (URL templates, headers, response field maps),
 *   - downloading, writing, parsing or playing subtitle files,
 *   - matching tracks to a target (that is `subtitleMatching.ts`),
 *   - preferences, versions and offsets (that is `subtitleManagement.ts`),
 *   - clock access: timestamps are stored/validated, never generated here.
 * Everything below is pure, synchronous, and deterministic. Nothing here does I/O.
 */

import {
  normalizeSubtitleQualityRatings,
  scoreSubtitleQuality,
  type SubtitleQualityRatings,
} from './subtitleQuality';

export const SUBTITLE_PROVIDER_MODEL_VERSION = 1;

/** Subtitle container formats §8 requires support for. */
export type SubtitleFormat = 'srt' | 'ass' | 'ssa' | 'vtt' | 'embedded';

/** Preferred rendering style. Mirrors `MediaSubtitleStyle` in §7's tracking model. */
export type SubtitleStyle = 'full' | 'signs-songs' | 'forced';

/** How a provider looks releases up. Descriptive only — nothing is ever executed. */
export type SubtitleSearchMethod = 'title' | 'identifier' | 'file-hash' | 'catalogue' | 'manual';

/** The signals a provider's matching rules may use. Evaluated by `subtitleMatching.ts`. */
export type SubtitleMatchSignal =
  | 'title'
  | 'episode'
  | 'season'
  | 'year'
  | 'release-group'
  | 'duration'
  | 'language';

/** Health status. Detection only — never a bypass signal (see §3). */
export type SubtitleProviderAvailability = 'available' | 'degraded' | 'unavailable' | 'unknown';

export interface SubtitleProvider {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  /** Recorded for display and attribution. This app never requests it. */
  baseUrl: string | null;
  /** Supported language tags, normalized (e.g. `ja`, `zh-hans`). Empty = unrestricted. */
  languages: string[];
  searchMethod: SubtitleSearchMethod;
  /** The provider's matching rules; empty falls back to {@link DEFAULT_SUBTITLE_MATCH_SIGNALS}. */
  matchSignals: SubtitleMatchSignal[];
  /** Format support. Empty = unrestricted. */
  formats: SubtitleFormat[];
  /** Styles the provider is known to carry. Empty = unrestricted. */
  styles: SubtitleStyle[];
  availability: SubtitleProviderAvailability;
  /** 0–100 operator-assigned reliability, or null when unassessed. */
  reliabilityScore: number | null;
  notes: string;
}

/**
 * One known subtitle release. Descriptive metadata only — this record is what the app
 * *knows about* a subtitle, not the subtitle.
 */
export interface SubtitleTrack {
  id: string;
  providerId: string;
  /** Key → §7 `MediaIdentity.id`; the shelf this release belongs to. */
  identityId: string;
  /** Provider-side identifier for the release, stored for later resolution. */
  providerItemId: string | null;
  language: string;
  format: SubtitleFormat;
  style: SubtitleStyle;
  /** Release title as listed by the provider (used by title matching). */
  title: string;
  season: number | null;
  episode: number | null;
  year: number | null;
  releaseGroup: string | null;
  /** Translator or fansub group credited (§8 translation management). */
  translator: string | null;
  /** Runtime the release is timed against, for duration matching. */
  durationSeconds: number | null;
  hearingImpaired: boolean;
  quality: SubtitleQualityRatings;
  /** ISO-8601, validated/stored only — never generated here. */
  addedAt: string | null;
}

export interface SubtitleProvidersDocument {
  version: typeof SUBTITLE_PROVIDER_MODEL_VERSION;
  providers: SubtitleProvider[];
  tracks: SubtitleTrack[];
}

export interface SubtitleProviderIssue { path: string; message: string }
export interface SubtitleProvidersValidationResult {
  value: SubtitleProvidersDocument;
  issues: SubtitleProviderIssue[];
}

export type SubtitleProviderPlanStatus = 'ready' | 'no-enabled-providers' | 'no-capable-providers';

export interface SubtitleProviderPlanStep {
  providerId: string;
  providerName: string;
  priority: number;
  searchMethod: SubtitleSearchMethod;
  availability: SubtitleProviderAvailability;
  reliabilityScore: number | null;
  /** How many known tracks this provider already contributes for the request. */
  knownTrackCount: number;
}

/** A deterministic description of which providers could serve a request. It executes nothing. */
export interface SubtitleProviderPlan {
  language: string | null;
  format: SubtitleFormat | null;
  style: SubtitleStyle | null;
  status: SubtitleProviderPlanStatus;
  steps: SubtitleProviderPlanStep[];
}

export interface SubtitleProviderRequest {
  language?: string;
  format?: SubtitleFormat;
  style?: SubtitleStyle;
  /** Restrict to providers whose matching rules include this signal. */
  signal?: SubtitleMatchSignal;
  /** Count known tracks for this identity when building the plan steps. */
  identityId?: string;
}

type UnknownRecord = Record<string, unknown>;

export const SUBTITLE_FORMATS: SubtitleFormat[] = ['srt', 'ass', 'ssa', 'vtt', 'embedded'];
export const SUBTITLE_STYLES: SubtitleStyle[] = ['full', 'signs-songs', 'forced'];
export const SUBTITLE_SEARCH_METHODS: SubtitleSearchMethod[] = ['title', 'identifier', 'file-hash', 'catalogue', 'manual'];
export const SUBTITLE_MATCH_SIGNALS: SubtitleMatchSignal[] = [
  'title', 'episode', 'season', 'year', 'release-group', 'duration', 'language',
];
/** Used when a provider declares no matching rules of its own. */
export const DEFAULT_SUBTITLE_MATCH_SIGNALS: SubtitleMatchSignal[] = ['title', 'episode', 'season', 'language'];
const AVAILABILITY: SubtitleProviderAvailability[] = ['available', 'degraded', 'unavailable', 'unknown'];
/** Formats that exist as a separate sidecar file; `embedded` lives inside the media container. */
const SIDECAR_FORMATS = new Set<SubtitleFormat>(['srt', 'ass', 'ssa', 'vtt']);
/** Formats carrying positioning/styling directives (signs & songs work needs these). */
const STYLED_FORMATS = new Set<SubtitleFormat>(['ass', 'ssa']);

/** True when the format is a standalone sidecar file rather than an embedded stream. */
export function isSidecarSubtitleFormat(format: SubtitleFormat): boolean {
  return SIDECAR_FORMATS.has(format);
}

/** True when the format can carry styling/positioning (ASS/SSA). */
export function subtitleFormatSupportsStyling(format: SubtitleFormat): boolean {
  return STYLED_FORMATS.has(format);
}

/**
 * Folds a language tag into its comparison form: lower-cased, `_` folded to `-`,
 * everything else non-alphanumeric dropped (`zh_Hans` → `zh-hans`). Returns '' when
 * there is nothing comparable left.
 */
export function normalizeSubtitleLanguage(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]+/g, '')
    .replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
    .slice(0, 35);
}

/** Stable shelf identity used by provider tracks and media-series lookups. */
export function normalizeSubtitleIdentityId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number, path: string, issues: SubtitleProviderIssue[]): string {
  if (typeof value !== 'string') {
    if (value !== undefined && value !== null) issues.push({ path, message: 'Expected text.' });
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) issues.push({ path, message: `Trimmed to ${max} characters.` });
  return trimmed.slice(0, max);
}

function id(value: unknown, path: string, issues: SubtitleProviderIssue[]): string {
  return text(value, '', 80, path, issues).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function languageList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeSubtitleLanguage(item)).filter(Boolean))].slice(0, maxItems);
}

function enumList<T extends string>(value: unknown, allowed: readonly T[], maxItems: number): T[] {
  if (!Array.isArray(value)) return [];
  const set = new Set(allowed);
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is T => set.has(item as T)))].slice(0, maxItems);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value.trim().toLowerCase())
    ? value.trim().toLowerCase() as T
    : fallback;
}

function finite(value: unknown, fallback: number | null, min: number, max: number, path: string, issues: SubtitleProviderIssue[]): number | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ path, message: 'Expected a finite number.' });
    return fallback;
  }
  const bounded = Math.min(max, Math.max(min, value));
  if (bounded !== value) issues.push({ path, message: `Clamped to ${min}-${max}.` });
  return bounded;
}

function integer(value: unknown, fallback: number | null, min: number, max: number, path: string, issues: SubtitleProviderIssue[]): number | null {
  const bounded = finite(value, fallback, min, max, path, issues);
  return bounded === null ? null : Math.trunc(bounded);
}

function httpUrl(value: unknown, path: string, issues: SubtitleProviderIssue[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    } catch { /* reported below */ }
  }
  issues.push({ path, message: 'Expected an HTTP(S) URL or null.' });
  return null;
}

function isoDateTime(value: unknown, path: string, issues: SubtitleProviderIssue[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!Number.isNaN(Date.parse(trimmed))) return trimmed;
  }
  issues.push({ path, message: 'Expected an ISO-8601 date-time or null.' });
  return null;
}

function normalizeProvider(value: unknown, index: number, issues: SubtitleProviderIssue[]): SubtitleProvider | null {
  const prefix = `providers.${index}`;
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid subtitle provider.' });
    return null;
  }
  const providerId = id(value.id, `${prefix}.id`, issues);
  const name = text(value.name, '', 100, `${prefix}.name`, issues);
  if (!providerId || !name) {
    issues.push({ path: prefix, message: 'A subtitle provider requires an ID and name.' });
    return null;
  }
  return {
    id: providerId,
    name,
    enabled: value.enabled !== false,
    priority: finite(value.priority, 100, 0, 10_000, `${prefix}.priority`, issues) ?? 100,
    baseUrl: httpUrl(value.baseUrl ?? value.url, `${prefix}.baseUrl`, issues),
    languages: languageList(value.languages ?? value.supportedLanguages, 100),
    searchMethod: oneOf(value.searchMethod, SUBTITLE_SEARCH_METHODS, 'title'),
    matchSignals: enumList(value.matchSignals ?? value.matchingRules, SUBTITLE_MATCH_SIGNALS, SUBTITLE_MATCH_SIGNALS.length),
    formats: enumList(value.formats, SUBTITLE_FORMATS, SUBTITLE_FORMATS.length),
    styles: enumList(value.styles, SUBTITLE_STYLES, SUBTITLE_STYLES.length),
    availability: oneOf(value.availability, AVAILABILITY, 'unknown'),
    reliabilityScore: finite(value.reliabilityScore, null, 0, 100, `${prefix}.reliabilityScore`, issues),
    notes: text(value.notes, '', 2_000, `${prefix}.notes`, issues),
  };
}

function normalizeTrack(value: unknown, index: number, providerIds: Set<string>, issues: SubtitleProviderIssue[]): SubtitleTrack | null {
  const prefix = `tracks.${index}`;
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid subtitle track.' });
    return null;
  }
  const providerId = id(value.providerId, `${prefix}.providerId`, issues);
  const identityId = id(value.identityId, `${prefix}.identityId`, issues);
  const language = normalizeSubtitleLanguage(value.language);
  if (!providerIds.has(providerId) || !identityId || !language) {
    issues.push({ path: prefix, message: 'A subtitle track requires a known provider, an identity ID, and a language.' });
    return null;
  }
  return {
    id: id(value.id, `${prefix}.id`, issues) || `${providerId}-${index + 1}`,
    providerId,
    identityId,
    providerItemId: text(value.providerItemId, '', 200, `${prefix}.providerItemId`, issues) || null,
    language,
    format: oneOf(value.format, SUBTITLE_FORMATS, 'srt'),
    style: oneOf(value.style, SUBTITLE_STYLES, 'full'),
    title: text(value.title, '', 300, `${prefix}.title`, issues),
    season: integer(value.season, null, 0, 100_000, `${prefix}.season`, issues),
    episode: integer(value.episode, null, 0, 100_000_000, `${prefix}.episode`, issues),
    year: integer(value.year, null, 1800, 3000, `${prefix}.year`, issues),
    releaseGroup: text(value.releaseGroup, '', 120, `${prefix}.releaseGroup`, issues) || null,
    translator: text(value.translator, '', 120, `${prefix}.translator`, issues) || null,
    durationSeconds: finite(value.durationSeconds, null, 0, 200_000, `${prefix}.durationSeconds`, issues),
    hearingImpaired: value.hearingImpaired === true,
    quality: normalizeSubtitleQualityRatings(value.quality),
    addedAt: isoDateTime(value.addedAt, `${prefix}.addedAt`, issues),
  };
}

export function createEmptySubtitleProvidersDocument(): SubtitleProvidersDocument {
  return { version: SUBTITLE_PROVIDER_MODEL_VERSION, providers: [], tracks: [] };
}

/**
 * Validates and clamps a stored document. Providers are de-duplicated by ID; tracks
 * whose provider is unknown are dropped (no orphan shelves), and duplicate tracks —
 * same ID, or the same release described twice by one provider — are dropped too.
 * A document from a newer app version is refused rather than silently downgraded.
 */
export function normalizeSubtitleProvidersDocument(input: unknown): SubtitleProvidersValidationResult {
  const issues: SubtitleProviderIssue[] = [];
  if (!isRecord(input)) {
    return { value: createEmptySubtitleProvidersDocument(), issues: [{ path: '', message: 'Expected a subtitle-providers document.' }] };
  }
  if (typeof input.version === 'number' && input.version > SUBTITLE_PROVIDER_MODEL_VERSION) {
    return { value: createEmptySubtitleProvidersDocument(), issues: [{ path: 'version', message: 'Document was created by a newer app version.' }] };
  }
  const rawProviders = Array.isArray(input.providers) ? input.providers : [];
  const providers = rawProviders.map((item, index) => normalizeProvider(item, index, issues))
    .filter((item): item is SubtitleProvider => item !== null);
  const seenProviders = new Set<string>();
  const uniqueProviders = providers.filter((provider, index) => {
    if (seenProviders.has(provider.id)) {
      issues.push({ path: `providers.${index}.id`, message: 'Ignored duplicate subtitle provider ID.' });
      return false;
    }
    seenProviders.add(provider.id);
    return true;
  });
  const rawTracks = Array.isArray(input.tracks) ? input.tracks : [];
  const tracks = rawTracks.map((item, index) => normalizeTrack(item, index, seenProviders, issues))
    .filter((item): item is SubtitleTrack => item !== null);
  const seenTrackIds = new Set<string>();
  const seenReleases = new Set<string>();
  const uniqueTracks = tracks.filter((track, index) => {
    if (seenTrackIds.has(track.id)) {
      issues.push({ path: `tracks.${index}.id`, message: 'Ignored duplicate subtitle track ID.' });
      return false;
    }
    // Two translations of the same episode by different groups are different releases,
    // so the translator is part of a release's identity.
    const release = [
      track.providerId, track.identityId, track.language, track.format, track.style,
      track.season ?? '', track.episode ?? '', track.releaseGroup ?? '', track.translator ?? '',
      track.providerItemId ?? '',
    ].join('\0');
    if (seenReleases.has(release)) {
      issues.push({ path: `tracks.${index}`, message: 'Ignored duplicate subtitle release.' });
      return false;
    }
    seenTrackIds.add(track.id);
    seenReleases.add(release);
    return true;
  });
  return { value: { version: SUBTITLE_PROVIDER_MODEL_VERSION, providers: uniqueProviders, tracks: uniqueTracks }, issues };
}

/** The matching rules a provider actually applies (its own, or the shared default). */
export function subtitleProviderMatchSignals(provider: SubtitleProvider): SubtitleMatchSignal[] {
  return provider.matchSignals.length > 0 ? provider.matchSignals : DEFAULT_SUBTITLE_MATCH_SIGNALS;
}

/**
 * Enabled providers able to serve a request, in stable priority order. An empty
 * `languages`/`formats`/`styles` list on a provider means "unrestricted", not "none".
 * Purely descriptive: nothing is contacted.
 */
export function selectCapableSubtitleProviders(
  document: SubtitleProvidersDocument,
  request: SubtitleProviderRequest = {},
): SubtitleProvider[] {
  const normalized = normalizeSubtitleProvidersDocument(document).value;
  const language = normalizeSubtitleLanguage(request.language);
  const format = request.format && SUBTITLE_FORMATS.includes(request.format) ? request.format : null;
  const style = request.style && SUBTITLE_STYLES.includes(request.style) ? request.style : null;
  const signal = request.signal && SUBTITLE_MATCH_SIGNALS.includes(request.signal) ? request.signal : null;
  return normalized.providers
    .map((provider, documentIndex) => ({ provider, documentIndex }))
    .filter(({ provider }) => provider.enabled
      && (!language || provider.languages.length === 0 || provider.languages.includes(language))
      && (!format || provider.formats.length === 0 || provider.formats.includes(format))
      && (!style || provider.styles.length === 0 || provider.styles.includes(style))
      && (!signal || subtitleProviderMatchSignals(provider).includes(signal)))
    .sort((left, right) => left.provider.priority - right.provider.priority
      || left.documentIndex - right.documentIndex
      || left.provider.id.localeCompare(right.provider.id))
    .map(({ provider }) => provider);
}

/**
 * Projects an inert plan: which providers *could* serve the subtitle request and in
 * what order, annotated with how many tracks each already contributes. It searches
 * nothing, contacts nothing and downloads nothing — the steps are a plan, not work.
 */
export function planSubtitleProviders(
  document: SubtitleProvidersDocument,
  request: SubtitleProviderRequest = {},
): SubtitleProviderPlan {
  const normalized = normalizeSubtitleProvidersDocument(document).value;
  const language = normalizeSubtitleLanguage(request.language) || null;
  const format = request.format && SUBTITLE_FORMATS.includes(request.format) ? request.format : null;
  const style = request.style && SUBTITLE_STYLES.includes(request.style) ? request.style : null;
  const identityId = request.identityId ? request.identityId.trim().toLowerCase() : null;
  const enabled = normalized.providers.filter((provider) => provider.enabled);
  if (enabled.length === 0) {
    return { language, format, style, status: 'no-enabled-providers', steps: [] };
  }
  const providers = selectCapableSubtitleProviders(normalized, request);
  const steps: SubtitleProviderPlanStep[] = providers.map((provider) => ({
    providerId: provider.id,
    providerName: provider.name,
    priority: provider.priority,
    searchMethod: provider.searchMethod,
    availability: provider.availability,
    reliabilityScore: provider.reliabilityScore,
    knownTrackCount: normalized.tracks.filter((track) => track.providerId === provider.id
      && (!identityId || track.identityId === identityId)
      && (!language || track.language === language)
      && (!format || track.format === format)
      && (!style || track.style === style)).length,
  }));
  return {
    language,
    format,
    style,
    status: steps.length === 0 ? 'no-capable-providers' : 'ready',
    steps,
  };
}

/** Every known track for an identity, optionally filtered by language, in stable order. */
export function selectSubtitleTracks(
  document: SubtitleProvidersDocument,
  identityId: string,
  language?: string,
): SubtitleTrack[] {
  const normalized = normalizeSubtitleProvidersDocument(document).value;
  const targetIdentity = identityId.trim().toLowerCase();
  const targetLanguage = normalizeSubtitleLanguage(language);
  return normalized.tracks
    .filter((track) => track.identityId === targetIdentity && (!targetLanguage || track.language === targetLanguage))
    .sort((left, right) => left.language.localeCompare(right.language) || left.id.localeCompare(right.id));
}

/** The composite quality score for a track, or null when the release is unrated. */
export function subtitleTrackQualityScore(track: SubtitleTrack): number | null {
  return scoreSubtitleQuality(track.quality).score;
}

/** Inserts or replaces a provider by ID. Pure and local; returns the normalized document. */
export function upsertSubtitleProvider(
  document: SubtitleProvidersDocument,
  input: unknown,
): SubtitleProvidersValidationResult {
  const normalizedInput = normalizeSubtitleProvidersDocument({ providers: [input] });
  const provider = normalizedInput.value.providers[0];
  const current = normalizeSubtitleProvidersDocument(document).value;
  if (!provider) return { value: current, issues: normalizedInput.issues };
  return {
    value: { ...current, providers: [...current.providers.filter((item) => item.id !== provider.id), provider] },
    issues: normalizedInput.issues,
  };
}

/** Removes a provider and every track it contributed (no orphan tracks). */
export function removeSubtitleProvider(document: SubtitleProvidersDocument, providerId: string): SubtitleProvidersDocument {
  const normalizedId = providerId.trim().toLowerCase();
  return normalizeSubtitleProvidersDocument({
    ...document,
    providers: document.providers.filter((provider) => provider.id !== normalizedId),
    tracks: document.tracks.filter((track) => track.providerId !== normalizedId),
  }).value;
}

/** Inserts or replaces a track by ID. The track's provider must already exist. */
export function upsertSubtitleTrack(
  document: SubtitleProvidersDocument,
  input: unknown,
): SubtitleProvidersValidationResult {
  const current = normalizeSubtitleProvidersDocument(document).value;
  const normalizedInput = normalizeSubtitleProvidersDocument({ providers: current.providers, tracks: [input] });
  const track = normalizedInput.value.tracks[0];
  if (!track) return { value: current, issues: normalizedInput.issues };
  return {
    value: { ...current, tracks: [...current.tracks.filter((item) => item.id !== track.id), track] },
    issues: normalizedInput.issues,
  };
}

/** Removes a single track by ID. */
export function removeSubtitleTrack(document: SubtitleProvidersDocument, trackId: string): SubtitleProvidersDocument {
  const normalizedId = trackId.trim().toLowerCase();
  return normalizeSubtitleProvidersDocument({
    ...document,
    tracks: document.tracks.filter((track) => track.id !== normalizedId),
  }).value;
}
