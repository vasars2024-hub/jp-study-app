/**
 * MASTER_PLAN §7 — Global Media Provider System (offline data-model foundation).
 *
 * This module defines the *universal media model* and the *content-provider
 * capability model* that let the app describe anime, drama, movies, TV, etc. with
 * one shared architecture, plus a deterministic capability-routing projection
 * ("data flow") that names which providers *can* serve a given content type and
 * capability.
 *
 * Deliberately out of scope for this phase (do NOT add here):
 *   - result/descriptor merging across providers,
 *   - identity resolution / cross-source de-duplication (the §7 Media Identity
 *     Engine — identifiers are *stored*, never *matched*),
 *   - networking, scraping, playback/downloads, authentication,
 *   - any provider/browser execution.
 * Everything below is pure, synchronous, and deterministic: it normalizes stored
 * configuration and projects inert plans. Nothing here performs I/O.
 */

export const MEDIA_PROVIDER_MODEL_VERSION = 1;

export type MediaContentType =
  | 'anime'
  | 'jdrama'
  | 'cdrama'
  | 'kdrama'
  | 'movie'
  | 'tv'
  | 'documentary'
  | 'special'
  | 'ova'
  | 'webseries';

/** Category a provider plays in the ecosystem. Not a content type — a provider role. */
export type MediaProviderRole = 'anime' | 'drama' | 'movie' | 'metadata' | 'user-added' | 'community';

/** Health/availability status. Detection only — never a bypass signal (see §3). */
export type MediaProviderAvailability = 'available' | 'degraded' | 'unavailable' | 'unknown';

/** External ID systems a provider can supply. Stored for later resolution, not resolved here. */
export type MediaIdentifierNamespace = 'tmdb' | 'imdb' | 'anilist' | 'mal' | 'tvdb' | 'tvmaze' | 'custom';

/** Fixed capability flags — the heart of provider-capability modeling. */
export interface MediaProviderCapabilities {
  /** Can search its catalogue for a title. */
  search: boolean;
  /** Can supply descriptive metadata (synopsis, genres, cast, …). */
  metadata: boolean;
  /** Can enumerate episodes / seasons. */
  episodes: boolean;
  /** Can supply cover art / artwork. */
  artwork: boolean;
  /** Can report release schedules / tracking signals. */
  tracking: boolean;
  /** Can surface subtitle availability (managed by §8, discovery only here). */
  subtitles: boolean;
}

export type MediaProviderCapability = keyof MediaProviderCapabilities;

export interface MediaProvider {
  id: string;
  name: string;
  role: MediaProviderRole;
  enabled: boolean;
  priority: number;
  baseUrl: string | null;
  contentTypes: MediaContentType[];
  languages: string[];
  identifierNamespaces: MediaIdentifierNamespace[];
  availability: MediaProviderAvailability;
  reliabilityScore: number | null;
  capabilities: MediaProviderCapabilities;
  notes: string;
}

export interface MediaIdentifierRef {
  namespace: MediaIdentifierNamespace;
  value: string;
}

/**
 * A universal media item as described by a *single* provider. Descriptors are kept
 * partitioned per provider — this foundation never merges two descriptors, even if
 * they clearly refer to the same title. That is the Media Identity Engine's job.
 */
export interface MediaDescriptor {
  id: string;
  providerId: string;
  providerItemId: string;
  contentType: MediaContentType;
  title: string;
  originalTitle: string | null;
  japaneseTitle: string | null;
  chineseTitle: string | null;
  koreanTitle: string | null;
  romajiTitle: string | null;
  alternativeTitles: string[];
  year: number | null;
  studio: string | null;
  director: string | null;
  actors: string[];
  episodeCount: number | null;
  languages: string[];
  availability: MediaProviderAvailability;
  identifiers: MediaIdentifierRef[];
  // Drama-specific metadata (§7).
  broadcastNetwork: string | null;
  episodesPerWeek: number | null;
  country: string | null;
  // Movie-specific metadata (§7).
  runtimeMinutes: number | null;
  releaseRegions: string[];
  ageRating: string | null;
}

export interface MediaProvidersDocument {
  version: typeof MEDIA_PROVIDER_MODEL_VERSION;
  providers: MediaProvider[];
  descriptors: MediaDescriptor[];
}

export interface MediaProviderIssue { path: string; message: string }
export interface MediaProvidersValidationResult {
  value: MediaProvidersDocument;
  issues: MediaProviderIssue[];
}

export type MediaCapabilityPlanStatus = 'ready' | 'no-content-type' | 'no-capable-providers';

export interface MediaCapabilityPlanStep {
  providerId: string;
  providerName: string;
  role: MediaProviderRole;
  priority: number;
  availability: MediaProviderAvailability;
}

/** A deterministic description of which providers could serve a request. It executes nothing. */
export interface MediaCapabilityPlan {
  contentType: MediaContentType | null;
  capability: MediaProviderCapability;
  language: string | null;
  status: MediaCapabilityPlanStatus;
  steps: MediaCapabilityPlanStep[];
}

export interface MediaCapabilityRequest {
  contentType: MediaContentType;
  capability?: MediaProviderCapability;
  language?: string;
}

type UnknownRecord = Record<string, unknown>;

const CONTENT_TYPES: MediaContentType[] = [
  'anime', 'jdrama', 'cdrama', 'kdrama', 'movie', 'tv', 'documentary', 'special', 'ova', 'webseries',
];
const ROLES: MediaProviderRole[] = ['anime', 'drama', 'movie', 'metadata', 'user-added', 'community'];
const AVAILABILITY: MediaProviderAvailability[] = ['available', 'degraded', 'unavailable', 'unknown'];
const NAMESPACES: MediaIdentifierNamespace[] = ['tmdb', 'imdb', 'anilist', 'mal', 'tvdb', 'tvmaze', 'custom'];

/** The provider ids the metadata sweep stores on a library item. */
export interface StoredProviderIds {
  malId?: number;
  anilistId?: number;
  tvmazeId?: number;
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  imdbId?: string;
}

/**
 * A library item's stored provider ids as identifier refs — the form the §7
 * identity engine keys on. TMDB's value carries its namespace (`movie/129`,
 * `tv/1399`) because TMDB movie and TV ids collide. Pure projection: nothing
 * is resolved or verified here.
 */
export function identifiersFromProviderIds(ids: StoredProviderIds): MediaIdentifierRef[] {
  const refs: MediaIdentifierRef[] = [];
  const positive = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;
  if (positive(ids.malId)) refs.push({ namespace: 'mal', value: String(ids.malId) });
  if (positive(ids.anilistId)) refs.push({ namespace: 'anilist', value: String(ids.anilistId) });
  if (positive(ids.tvmazeId)) refs.push({ namespace: 'tvmaze', value: String(ids.tvmazeId) });
  if (positive(ids.tmdbId)) refs.push({ namespace: 'tmdb', value: `${ids.tmdbType ?? 'movie'}/${ids.tmdbId}` });
  if (typeof ids.imdbId === 'string' && /^tt\d+$/.test(ids.imdbId.trim())) {
    refs.push({ namespace: 'imdb', value: ids.imdbId.trim() });
  }
  return refs;
}
const CAPABILITY_KEYS: MediaProviderCapability[] = ['search', 'metadata', 'episodes', 'artwork', 'tracking', 'subtitles'];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number, path: string, issues: MediaProviderIssue[]): string {
  if (typeof value !== 'string') {
    if (value !== undefined && value !== null) issues.push({ path, message: 'Expected text.' });
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) issues.push({ path, message: `Trimmed to ${max} characters.` });
  return trimmed.slice(0, max);
}

function id(value: unknown, path: string, issues: MediaProviderIssue[]): string {
  return text(value, '', 64, path, issues).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function list(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function enumList<T extends string>(value: unknown, allowed: readonly T[], maxItems: number): T[] {
  if (!Array.isArray(value)) return [];
  const set = new Set(allowed);
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is T => set.has(item as T)))].slice(0, maxItems);
}

function finite(value: unknown, fallback: number | null, min: number, max: number, path: string, issues: MediaProviderIssue[]): number | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ path, message: 'Expected a finite number.' });
    return fallback;
  }
  const bounded = Math.min(max, Math.max(min, value));
  if (bounded !== value) issues.push({ path, message: `Clamped to ${min}-${max}.` });
  return bounded;
}

function httpUrl(value: unknown, path: string, issues: MediaProviderIssue[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    } catch { /* report below */ }
  }
  issues.push({ path, message: 'Expected an HTTP(S) URL or null.' });
  return null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value.trim().toLowerCase())
    ? value.trim().toLowerCase() as T
    : fallback;
}

function normalizeCapabilities(value: unknown): MediaProviderCapabilities {
  const raw = isRecord(value) ? value : {};
  const entries = CAPABILITY_KEYS.map((key) => [key, raw[key] === true] as const);
  return Object.fromEntries(entries) as unknown as MediaProviderCapabilities;
}

function normalizeIdentifiers(value: unknown, prefix: string, issues: MediaProviderIssue[]): MediaIdentifierRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const refs: MediaIdentifierRef[] = [];
  value.forEach((raw, index) => {
    if (!isRecord(raw)) {
      issues.push({ path: `${prefix}.${index}`, message: 'Ignored invalid identifier.' });
      return;
    }
    const namespace = oneOf(raw.namespace, NAMESPACES, 'custom');
    const refValue = text(raw.value, '', 200, `${prefix}.${index}.value`, issues);
    if (!refValue) {
      issues.push({ path: `${prefix}.${index}`, message: 'An identifier requires a value.' });
      return;
    }
    const key = `${namespace}\0${refValue}`;
    if (seen.has(key)) {
      issues.push({ path: `${prefix}.${index}`, message: 'Ignored duplicate identifier.' });
      return;
    }
    seen.add(key);
    refs.push({ namespace, value: refValue });
  });
  return refs.slice(0, 50);
}

function normalizeProvider(value: unknown, index: number, issues: MediaProviderIssue[]): MediaProvider | null {
  const prefix = `providers.${index}`;
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid provider.' });
    return null;
  }
  const providerId = id(value.id, `${prefix}.id`, issues);
  const name = text(value.name, '', 100, `${prefix}.name`, issues);
  if (!providerId || !name) {
    issues.push({ path: prefix, message: 'A provider requires an ID and name.' });
    return null;
  }
  return {
    id: providerId,
    name,
    role: oneOf(value.role, ROLES, 'user-added'),
    enabled: value.enabled !== false,
    priority: finite(value.priority, 100, 0, 10_000, `${prefix}.priority`, issues) ?? 100,
    baseUrl: httpUrl(value.baseUrl ?? value.url, `${prefix}.baseUrl`, issues),
    contentTypes: enumList(value.contentTypes, CONTENT_TYPES, CONTENT_TYPES.length),
    languages: list(value.languages ?? value.supportedLanguages, 50, 35),
    identifierNamespaces: enumList(value.identifierNamespaces, NAMESPACES, NAMESPACES.length),
    availability: oneOf(value.availability, AVAILABILITY, 'unknown'),
    reliabilityScore: finite(value.reliabilityScore, null, 0, 100, `${prefix}.reliabilityScore`, issues),
    capabilities: normalizeCapabilities(value.capabilities),
    notes: text(value.notes, '', 2_000, `${prefix}.notes`, issues),
  };
}

function normalizeDescriptor(value: unknown, index: number, providerIds: Set<string>, issues: MediaProviderIssue[]): MediaDescriptor | null {
  const prefix = `descriptors.${index}`;
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid descriptor.' });
    return null;
  }
  const providerId = id(value.providerId, `${prefix}.providerId`, issues);
  const providerItemId = text(value.providerItemId, '', 200, `${prefix}.providerItemId`, issues);
  const title = text(value.title, '', 300, `${prefix}.title`, issues);
  if (!providerIds.has(providerId) || !providerItemId || !title) {
    issues.push({ path: prefix, message: 'A descriptor requires a known provider, provider item ID, and title.' });
    return null;
  }
  return {
    id: id(value.id, `${prefix}.id`, issues) || `${providerId}-${index + 1}`,
    providerId,
    providerItemId,
    contentType: oneOf(value.contentType, CONTENT_TYPES, 'anime'),
    title,
    originalTitle: text(value.originalTitle, '', 300, `${prefix}.originalTitle`, issues) || null,
    japaneseTitle: text(value.japaneseTitle, '', 300, `${prefix}.japaneseTitle`, issues) || null,
    chineseTitle: text(value.chineseTitle, '', 300, `${prefix}.chineseTitle`, issues) || null,
    koreanTitle: text(value.koreanTitle, '', 300, `${prefix}.koreanTitle`, issues) || null,
    romajiTitle: text(value.romajiTitle, '', 300, `${prefix}.romajiTitle`, issues) || null,
    alternativeTitles: list(value.alternativeTitles, 50, 300),
    year: finite(value.year, null, 1800, 3000, `${prefix}.year`, issues),
    studio: text(value.studio, '', 200, `${prefix}.studio`, issues) || null,
    director: text(value.director, '', 200, `${prefix}.director`, issues) || null,
    actors: list(value.actors, 100, 200),
    episodeCount: finite(value.episodeCount, null, 0, 1_000_000, `${prefix}.episodeCount`, issues),
    languages: list(value.languages, 50, 35),
    availability: oneOf(value.availability, AVAILABILITY, 'unknown'),
    identifiers: normalizeIdentifiers(value.identifiers, `${prefix}.identifiers`, issues),
    broadcastNetwork: text(value.broadcastNetwork, '', 200, `${prefix}.broadcastNetwork`, issues) || null,
    episodesPerWeek: finite(value.episodesPerWeek, null, 0, 100, `${prefix}.episodesPerWeek`, issues),
    country: text(value.country, '', 100, `${prefix}.country`, issues) || null,
    runtimeMinutes: finite(value.runtimeMinutes, null, 0, 100_000, `${prefix}.runtimeMinutes`, issues),
    releaseRegions: list(value.releaseRegions, 50, 100),
    ageRating: text(value.ageRating, '', 40, `${prefix}.ageRating`, issues) || null,
  };
}

export function createEmptyMediaProvidersDocument(): MediaProvidersDocument {
  return { version: MEDIA_PROVIDER_MODEL_VERSION, providers: [], descriptors: [] };
}

export function normalizeMediaProvidersDocument(input: unknown): MediaProvidersValidationResult {
  const issues: MediaProviderIssue[] = [];
  if (!isRecord(input)) {
    return { value: createEmptyMediaProvidersDocument(), issues: [{ path: '', message: 'Expected a media-providers document.' }] };
  }
  if (typeof input.version === 'number' && input.version > MEDIA_PROVIDER_MODEL_VERSION) {
    return { value: createEmptyMediaProvidersDocument(), issues: [{ path: 'version', message: 'Document was created by a newer app version.' }] };
  }
  const rawProviders = Array.isArray(input.providers) ? input.providers : [];
  const providers = rawProviders.map((item, index) => normalizeProvider(item, index, issues))
    .filter((item): item is MediaProvider => item !== null);
  const seenProviders = new Set<string>();
  const uniqueProviders = providers.filter((provider, index) => {
    if (seenProviders.has(provider.id)) {
      issues.push({ path: `providers.${index}.id`, message: 'Ignored duplicate provider ID.' });
      return false;
    }
    seenProviders.add(provider.id);
    return true;
  });
  const rawDescriptors = Array.isArray(input.descriptors) ? input.descriptors : [];
  const descriptors = rawDescriptors.map((item, index) => normalizeDescriptor(item, index, seenProviders, issues))
    .filter((item): item is MediaDescriptor => item !== null);
  const seenDescriptors = new Set<string>();
  const uniqueDescriptors = descriptors.filter((descriptor, index) => {
    const key = `${descriptor.providerId}\0${descriptor.providerItemId}`;
    if (seenDescriptors.has(key)) {
      issues.push({ path: `descriptors.${index}`, message: 'Ignored duplicate provider descriptor.' });
      return false;
    }
    seenDescriptors.add(key);
    return true;
  });
  return { value: { version: MEDIA_PROVIDER_MODEL_VERSION, providers: uniqueProviders, descriptors: uniqueDescriptors }, issues };
}

/** Returns enabled providers capable of a request, in stable priority order. Purely descriptive. */
export function selectCapableMediaProviders(
  document: MediaProvidersDocument,
  request: MediaCapabilityRequest,
): MediaProvider[] {
  const normalized = normalizeMediaProvidersDocument(document).value;
  const contentType = CONTENT_TYPES.includes(request.contentType) ? request.contentType : null;
  if (contentType === null) return [];
  const capability = CAPABILITY_KEYS.includes(request.capability ?? 'search') ? request.capability ?? 'search' : 'search';
  const language = request.language?.trim().toLowerCase();
  return normalized.providers
    .map((provider, documentIndex) => ({ provider, documentIndex }))
    .filter(({ provider }) => provider.enabled
      && provider.contentTypes.includes(contentType)
      && provider.capabilities[capability]
      && (!language || provider.languages.length === 0
        || provider.languages.some((item) => item.toLowerCase() === language)))
    .sort((left, right) => left.provider.priority - right.provider.priority
      || left.documentIndex - right.documentIndex
      || left.provider.id.localeCompare(right.provider.id))
    .map(({ provider }) => provider);
}

/**
 * Projects an inert capability plan: which providers *could* serve the request and
 * in what order. It resolves nothing and calls nothing — the steps are a plan, not work.
 */
export function planMediaProviderCapabilities(
  document: MediaProvidersDocument,
  request: MediaCapabilityRequest,
): MediaCapabilityPlan {
  const contentType = CONTENT_TYPES.includes(request.contentType) ? request.contentType : null;
  const capability = CAPABILITY_KEYS.includes(request.capability ?? 'search') ? request.capability ?? 'search' : 'search';
  const language = request.language?.trim() ? request.language.trim() : null;
  if (contentType === null) {
    return { contentType: null, capability, language, status: 'no-content-type', steps: [] };
  }
  const providers = selectCapableMediaProviders(document, { contentType, capability, language: language ?? undefined });
  const steps: MediaCapabilityPlanStep[] = providers.map((provider) => ({
    providerId: provider.id,
    providerName: provider.name,
    role: provider.role,
    priority: provider.priority,
    availability: provider.availability,
  }));
  return {
    contentType,
    capability,
    language,
    status: steps.length === 0 ? 'no-capable-providers' : 'ready',
    steps,
  };
}

/** Inserts or replaces a provider by ID. Pure and local; returns the normalized document. */
export function upsertMediaProvider(document: MediaProvidersDocument, input: unknown): MediaProvidersValidationResult {
  const normalizedInput = normalizeMediaProvidersDocument({ providers: [input] });
  const provider = normalizedInput.value.providers[0];
  const current = normalizeMediaProvidersDocument(document).value;
  if (!provider) return { value: current, issues: normalizedInput.issues };
  return {
    value: { ...current, providers: [...current.providers.filter((item) => item.id !== provider.id), provider] },
    issues: normalizedInput.issues,
  };
}

/** Removes a provider and every descriptor it produced (no dangling descriptors). */
export function removeMediaProvider(document: MediaProvidersDocument, providerId: string): MediaProvidersDocument {
  const normalizedId = providerId.trim().toLowerCase();
  return normalizeMediaProvidersDocument({
    ...document,
    providers: document.providers.filter((provider) => provider.id !== normalizedId),
    descriptors: document.descriptors.filter((descriptor) => descriptor.providerId !== normalizedId),
  }).value;
}
