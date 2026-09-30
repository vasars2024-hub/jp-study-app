export const UNIFIED_SEARCH_MODEL_VERSION = 1;

export type UnifiedSearchProviderKind = 'local-library' | 'site' | 'metadata' | 'connector';
export type UnifiedSearchMethod = 'local' | 'get' | 'post';
export type UnifiedSearchMediaType = 'anime' | 'movie' | 'tv' | 'ova' | 'special' | 'manga' | 'novel' | 'other';
export type UnifiedSearchAvailability = 'available' | 'partial' | 'unavailable' | 'unknown';
export type UnifiedSearchTrackingStatus = 'untracked' | 'planned' | 'watching' | 'completed' | 'paused' | 'dropped' | 'unknown';

/** Declarative, inert search configuration. Nothing in this module executes it. */
export interface UnifiedSearchProviderDefinition {
  endpoint: string | null;
  method: UnifiedSearchMethod;
  selectors: Record<string, string[]>;
  apiConfiguration: Record<string, string>;
  resultParser: string | null;
  metadataMapping: Record<string, string>;
}

export interface UnifiedSearchProvider {
  id: string;
  name: string;
  kind: UnifiedSearchProviderKind;
  enabled: boolean;
  priority: number;
  groupIds: string[];
  supportedLanguages: string[];
  definition: UnifiedSearchProviderDefinition;
}

export interface UnifiedSearchSourceGroup {
  id: string;
  name: string;
  providerIds: string[];
}

/** A provider-produced value after it crosses the future search boundary. */
export interface UnifiedSearchResult {
  id: string;
  providerId: string;
  providerResultId: string;
  title: string;
  /** Local cards without a source title; the title is a grouping sentinel only. */
  unknownSource?: boolean;
  alternativeTitles: string[];
  japaneseTitle: string | null;
  romajiTitle: string | null;
  authorsOrStudios: string[];
  coverUrl: string | null;
  language: string | null;
  availability: UnifiedSearchAvailability;
  metadataQuality: number | null;
  episodeCount: number | null;
  trackingStatus: UnifiedSearchTrackingStatus;
  mediaType: UnifiedSearchMediaType;
  year: number | null;
  season: string | null;
  genres: string[];
}

export interface UnifiedSearchDocument {
  version: typeof UNIFIED_SEARCH_MODEL_VERSION;
  providers: UnifiedSearchProvider[];
  groups: UnifiedSearchSourceGroup[];
  results: UnifiedSearchResult[];
}

export type UnifiedSearchPlanStatus = 'ready' | 'empty-query' | 'no-providers';

export interface UnifiedSearchQueryPlanStep {
  providerId: string;
  providerName: string;
  providerKind: UnifiedSearchProviderKind;
  priority: number;
  groupIds: string[];
}

/** A deterministic description of future work. It contains no executable callbacks. */
export interface UnifiedSearchQueryPlan {
  query: string;
  selectedGroupIds: string[];
  status: UnifiedSearchPlanStatus;
  steps: UnifiedSearchQueryPlanStep[];
}

export interface UnifiedSearchQueryPlanningState {
  query: string;
  selectedGroupIds?: string[];
}

export interface UnifiedSearchIssue { path: string; message: string }
export interface UnifiedSearchValidationResult { value: UnifiedSearchDocument; issues: UnifiedSearchIssue[] }

export type UnifiedSearchAction =
  | { type: 'provider/create'; provider: UnifiedSearchProvider }
  | { type: 'provider/update'; id: string; patch: Partial<Omit<UnifiedSearchProvider, 'id'>> }
  | { type: 'provider/remove'; id: string }
  | { type: 'provider/reorder'; providerIds: string[] }
  | { type: 'group/create'; group: UnifiedSearchSourceGroup }
  | { type: 'group/update'; id: string; patch: Partial<Omit<UnifiedSearchSourceGroup, 'id'>> }
  | { type: 'group/remove'; id: string }
  | { type: 'group/reorder'; groupIds: string[] }
  | { type: 'snapshots/replace'; results: UnifiedSearchResult[] }
  | { type: 'snapshots/clear' };

export type UnifiedSearchMutationResult =
  | { ok: true; value: UnifiedSearchDocument }
  | { ok: false; value: UnifiedSearchDocument; error: string };

type UnknownRecord = Record<string, unknown>;
const PROVIDER_KINDS: UnifiedSearchProviderKind[] = ['local-library', 'site', 'metadata', 'connector'];
const METHODS: UnifiedSearchMethod[] = ['local', 'get', 'post'];
const AVAILABILITY: UnifiedSearchAvailability[] = ['available', 'partial', 'unavailable', 'unknown'];
const TRACKING: UnifiedSearchTrackingStatus[] = ['untracked', 'planned', 'watching', 'completed', 'paused', 'dropped', 'unknown'];
const MEDIA_TYPES: UnifiedSearchMediaType[] = ['anime', 'movie', 'tv', 'ova', 'special', 'manga', 'novel', 'other'];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number, path: string, issues: UnifiedSearchIssue[]): string {
  if (typeof value !== 'string') {
    if (value !== undefined && value !== null) issues.push({ path, message: 'Expected text.' });
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) issues.push({ path, message: `Trimmed to ${max} characters.` });
  return trimmed.slice(0, max);
}

function id(value: unknown, path: string, issues: UnifiedSearchIssue[]): string {
  return text(value, '', 64, path, issues).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function list(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function finite(value: unknown, fallback: number | null, min: number, max: number, path: string, issues: UnifiedSearchIssue[]): number | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ path, message: 'Expected a finite number.' });
    return fallback;
  }
  const bounded = Math.min(max, Math.max(min, value));
  if (bounded !== value) issues.push({ path, message: `Clamped to ${min}-${max}.` });
  return bounded;
}

function httpUrl(value: unknown, path: string, issues: UnifiedSearchIssue[]): string | null {
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

function stringMap(value: unknown, maxEntries = 50, path?: string, issues?: UnifiedSearchIssue[]): Record<string, string> {
  if (!isRecord(value)) return {};
  const blockedKeys = new Set(['authorization', 'cookie', 'password', 'token', 'api-key', 'apikey', 'secret']);
  return Object.fromEntries(Object.entries(value).slice(0, maxEntries).flatMap(([key, item]) => {
    const safeKey = key.trim().slice(0, 100);
    if (blockedKeys.has(safeKey.toLowerCase())) {
      issues?.push({ path: `${path ?? 'map'}.${safeKey}`, message: 'Credential-bearing configuration is not stored in search providers.' });
      return [];
    }
    return safeKey && typeof item === 'string' ? [[safeKey, item.trim().slice(0, 2_000)]] : [];
  }));
}

function selectorMap(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 50).flatMap(([key, item]) => {
    const values = list(item, 20, 500);
    return key.trim() && values.length ? [[key.trim().slice(0, 100), values]] : [];
  }));
}

export function createEmptyUnifiedSearchDocument(): UnifiedSearchDocument {
  return { version: UNIFIED_SEARCH_MODEL_VERSION, providers: [], groups: [], results: [] };
}

/** Returns enabled providers in stable priority order, optionally restricted to known groups. */
export function selectEnabledUnifiedSearchProviders(
  document: UnifiedSearchDocument,
  selectedGroupIds?: readonly string[],
): UnifiedSearchProvider[] {
  const normalized = normalizeUnifiedSearchDocument(document).value;
  const knownGroupIds = new Set(normalized.groups.map((group) => group.id));
  const requestedGroupIds = selectedGroupIds === undefined
    ? null
    : new Set(selectedGroupIds.filter((groupId) => knownGroupIds.has(groupId)));
  const groupProviderIds = new Map(normalized.groups.map((group) => [group.id, new Set(group.providerIds)]));

  return normalized.providers
    .map((provider, documentIndex) => ({ provider, documentIndex }))
    .filter(({ provider }) => provider.enabled
      && (requestedGroupIds === null
        || [...requestedGroupIds].some((groupId) => provider.groupIds.includes(groupId)
          || groupProviderIds.get(groupId)?.has(provider.id))))
    .sort((left, right) => left.provider.priority - right.provider.priority
      || left.documentIndex - right.documentIndex
      || left.provider.id.localeCompare(right.provider.id))
    .map(({ provider }) => provider);
}

/** Builds an inert plan only; provider definitions are never interpreted or invoked here. */
export function createUnifiedSearchQueryPlan(
  document: UnifiedSearchDocument,
  state: UnifiedSearchQueryPlanningState,
): UnifiedSearchQueryPlan {
  const normalized = normalizeUnifiedSearchDocument(document).value;
  const query = state.query.trim().replace(/\s+/g, ' ').slice(0, 500);
  const knownGroupIds = new Set(normalized.groups.map((group) => group.id));
  const selectedGroupIds = state.selectedGroupIds === undefined
    ? normalized.groups.map((group) => group.id)
    : [...new Set(state.selectedGroupIds)].filter((groupId) => knownGroupIds.has(groupId));
  const providers = selectEnabledUnifiedSearchProviders(
    normalized,
    state.selectedGroupIds === undefined ? undefined : selectedGroupIds,
  );
  const providerGroups = new Map(normalized.groups.map((group) => [group.id, new Set(group.providerIds)]));
  const steps = providers.map((provider) => ({
    providerId: provider.id,
    providerName: provider.name,
    providerKind: provider.kind,
    priority: provider.priority,
    groupIds: selectedGroupIds.filter((groupId) => provider.groupIds.includes(groupId)
      || providerGroups.get(groupId)?.has(provider.id)),
  }));

  return {
    query,
    selectedGroupIds,
    status: query.length === 0 ? 'empty-query' : steps.length === 0 ? 'no-providers' : 'ready',
    steps,
  };
}

function normalizeProvider(value: unknown, index: number, issues: UnifiedSearchIssue[]): UnifiedSearchProvider | null {
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
  const kind = PROVIDER_KINDS.includes(value.kind as UnifiedSearchProviderKind) ? value.kind as UnifiedSearchProviderKind : 'connector';
  const definition = isRecord(value.definition) ? value.definition : {};
  const method = METHODS.includes(definition.method as UnifiedSearchMethod)
    ? definition.method as UnifiedSearchMethod : kind === 'local-library' ? 'local' : 'get';
  return {
    id: providerId, name, kind, enabled: value.enabled !== false,
    priority: finite(value.priority, 100, 0, 10_000, `${prefix}.priority`, issues) ?? 100,
    groupIds: list(value.groupIds, 50, 64).map((item) => id(item, `${prefix}.groupIds`, issues)).filter(Boolean),
    supportedLanguages: list(value.supportedLanguages, 50, 35),
    definition: {
      endpoint: httpUrl(definition.endpoint, `${prefix}.definition.endpoint`, issues),
      method,
      selectors: selectorMap(definition.selectors),
      apiConfiguration: stringMap(definition.apiConfiguration, 50, `${prefix}.definition.apiConfiguration`, issues),
      resultParser: text(definition.resultParser, '', 4_000, `${prefix}.definition.resultParser`, issues) || null,
      metadataMapping: stringMap(definition.metadataMapping),
    },
  };
}

function normalizeResult(value: unknown, index: number, providerIds: Set<string>, issues: UnifiedSearchIssue[]): UnifiedSearchResult | null {
  const prefix = `results.${index}`;
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid result.' });
    return null;
  }
  const providerId = id(value.providerId, `${prefix}.providerId`, issues);
  const providerResultId = text(value.providerResultId, '', 200, `${prefix}.providerResultId`, issues);
  const title = text(value.title, '', 300, `${prefix}.title`, issues);
  if (!providerIds.has(providerId) || !providerResultId || !title) {
    issues.push({ path: prefix, message: 'A result requires a known provider, provider result ID, and title.' });
    return null;
  }
  const resultId = id(value.id, `${prefix}.id`, issues) || `${providerId}-${index + 1}`;
  return {
    id: resultId, providerId, providerResultId, title,
    ...(value.unknownSource === true ? { unknownSource: true } : {}),
    alternativeTitles: list(value.alternativeTitles, 50, 300),
    japaneseTitle: text(value.japaneseTitle, '', 300, `${prefix}.japaneseTitle`, issues) || null,
    romajiTitle: text(value.romajiTitle, '', 300, `${prefix}.romajiTitle`, issues) || null,
    authorsOrStudios: list(value.authorsOrStudios, 50, 200),
    coverUrl: httpUrl(value.coverUrl, `${prefix}.coverUrl`, issues),
    language: text(value.language, '', 35, `${prefix}.language`, issues) || null,
    availability: AVAILABILITY.includes(value.availability as UnifiedSearchAvailability) ? value.availability as UnifiedSearchAvailability : 'unknown',
    metadataQuality: finite(value.metadataQuality, null, 0, 100, `${prefix}.metadataQuality`, issues),
    episodeCount: finite(value.episodeCount, null, 0, 1_000_000, `${prefix}.episodeCount`, issues),
    trackingStatus: TRACKING.includes(value.trackingStatus as UnifiedSearchTrackingStatus) ? value.trackingStatus as UnifiedSearchTrackingStatus : 'unknown',
    mediaType: MEDIA_TYPES.includes(value.mediaType as UnifiedSearchMediaType) ? value.mediaType as UnifiedSearchMediaType : 'other',
    year: finite(value.year, null, 1800, 3000, `${prefix}.year`, issues),
    season: text(value.season, '', 40, `${prefix}.season`, issues) || null,
    genres: list(value.genres, 50, 80),
  };
}

export function normalizeUnifiedSearchDocument(input: unknown): UnifiedSearchValidationResult {
  const issues: UnifiedSearchIssue[] = [];
  if (!isRecord(input)) return { value: createEmptyUnifiedSearchDocument(), issues: [{ path: '', message: 'Expected a unified-search document.' }] };
  if (typeof input.version === 'number' && input.version > UNIFIED_SEARCH_MODEL_VERSION) {
    return { value: createEmptyUnifiedSearchDocument(), issues: [{ path: 'version', message: 'Document was created by a newer app version.' }] };
  }
  const rawProviders = Array.isArray(input.providers) ? input.providers : [];
  const providers = rawProviders.map((item, index) => normalizeProvider(item, index, issues)).filter((item): item is UnifiedSearchProvider => item !== null);
  const seenProviders = new Set<string>();
  const uniqueProviders = providers.filter((provider, index) => {
    if (seenProviders.has(provider.id)) { issues.push({ path: `providers.${index}.id`, message: 'Ignored duplicate provider ID.' }); return false; }
    seenProviders.add(provider.id); return true;
  });
  const rawGroups = Array.isArray(input.groups) ? input.groups : [];
  const seenGroups = new Set<string>();
  const groups = rawGroups.flatMap((raw, index): UnifiedSearchSourceGroup[] => {
    if (!isRecord(raw)) { issues.push({ path: `groups.${index}`, message: 'Ignored invalid source group.' }); return []; }
    const groupId = id(raw.id, `groups.${index}.id`, issues);
    const name = text(raw.name, '', 100, `groups.${index}.name`, issues);
    if (!groupId || !name || seenGroups.has(groupId)) { issues.push({ path: `groups.${index}`, message: 'Ignored incomplete or duplicate source group.' }); return []; }
    seenGroups.add(groupId);
    const providerIds = list(raw.providerIds, 500, 64).map((item) => id(item, `groups.${index}.providerIds`, issues))
      .filter((providerId) => seenProviders.has(providerId));
    return [{ id: groupId, name, providerIds }];
  });
  const knownGroups = new Set(groups.map((group) => group.id));
  for (const provider of uniqueProviders) provider.groupIds = provider.groupIds.filter((groupId) => knownGroups.has(groupId));
  const rawResults = Array.isArray(input.results) ? input.results : [];
  const results = rawResults.map((item, index) => normalizeResult(item, index, seenProviders, issues)).filter((item): item is UnifiedSearchResult => item !== null);
  const seenResults = new Set<string>();
  const uniqueResults = results.filter((result, index) => {
    const key = `${result.providerId}:${result.providerResultId}`;
    if (seenResults.has(key)) { issues.push({ path: `results.${index}`, message: 'Ignored duplicate provider result.' }); return false; }
    seenResults.add(key); return true;
  });
  return { value: { version: UNIFIED_SEARCH_MODEL_VERSION, providers: uniqueProviders, groups, results: uniqueResults }, issues };
}

function failed(value: UnifiedSearchDocument, error: string): UnifiedSearchMutationResult {
  return { ok: false, value, error };
}

function sameIds(actual: string[], requested: string[]): boolean {
  return actual.length === requested.length
    && new Set(actual).size === actual.length
    && new Set(requested).size === requested.length
    && actual.every((item) => requested.includes(item));
}

function synchronizeMembership(document: UnifiedSearchDocument): UnifiedSearchDocument {
  const groupIds = new Set(document.groups.map((group) => group.id));
  const providerIds = new Set(document.providers.map((provider) => provider.id));
  const memberships = new Set<string>();
  for (const provider of document.providers) {
    for (const groupId of provider.groupIds) if (groupIds.has(groupId)) memberships.add(`${provider.id}\0${groupId}`);
  }
  for (const group of document.groups) {
    for (const providerId of group.providerIds) if (providerIds.has(providerId)) memberships.add(`${providerId}\0${group.id}`);
  }
  return {
    ...document,
    providers: document.providers.map((provider) => ({ ...provider, groupIds: document.groups
      .filter((group) => memberships.has(`${provider.id}\0${group.id}`)).map((group) => group.id) })),
    groups: document.groups.map((group) => ({ ...group, providerIds: document.providers
      .filter((provider) => memberships.has(`${provider.id}\0${group.id}`)).map((provider) => provider.id) })),
  };
}

function canonicalizePriorities(document: UnifiedSearchDocument): UnifiedSearchDocument {
  return { ...document, providers: document.providers.map((provider, priority) => ({ ...provider, priority })) };
}

/** Pure, local-only mutation boundary. Failed actions return the original document unchanged. */
export function reduceUnifiedSearchDocument(
  current: UnifiedSearchDocument,
  action: UnifiedSearchAction,
): UnifiedSearchMutationResult {
  const original = normalizeUnifiedSearchDocument(current).value;
  let candidate: UnifiedSearchDocument;

  switch (action.type) {
    case 'provider/create':
      if (original.providers.some((provider) => provider.id === action.provider.id)) return failed(original, `Provider "${action.provider.id}" already exists.`);
      if (action.provider.groupIds.some((id) => !original.groups.some((group) => group.id === id))) return failed(original, 'Provider references an unknown group.');
      candidate = { ...original, providers: [...original.providers, action.provider], groups: original.groups.map((group) => ({ ...group, providerIds: action.provider.groupIds.includes(group.id) ? [...group.providerIds, action.provider.id] : group.providerIds })) };
      break;
    case 'provider/update': {
      const index = original.providers.findIndex((provider) => provider.id === action.id);
      if (index < 0) return failed(original, `Provider "${action.id}" does not exist.`);
      const next = { ...original.providers[index], ...action.patch, id: action.id };
      if (next.groupIds.some((id) => !original.groups.some((group) => group.id === id))) return failed(original, 'Provider references an unknown group.');
      candidate = { ...original, providers: original.providers.map((provider, providerIndex) => providerIndex === index ? next : provider), groups: original.groups.map((group) => ({ ...group, providerIds: next.groupIds.includes(group.id) ? [...group.providerIds.filter((id) => id !== action.id), action.id] : group.providerIds.filter((id) => id !== action.id) })) };
      break;
    }
    case 'provider/remove':
      if (!original.providers.some((provider) => provider.id === action.id)) return failed(original, `Provider "${action.id}" does not exist.`);
      candidate = { ...original, providers: original.providers.filter((provider) => provider.id !== action.id), groups: original.groups.map((group) => ({ ...group, providerIds: group.providerIds.filter((id) => id !== action.id) })), results: original.results.filter((result) => result.providerId !== action.id) };
      break;
    case 'provider/reorder':
      if (!sameIds(original.providers.map((provider) => provider.id), action.providerIds)) return failed(original, 'Provider reorder must contain every provider ID exactly once.');
      candidate = { ...original, providers: action.providerIds.map((id) => original.providers.find((provider) => provider.id === id) as UnifiedSearchProvider) };
      break;
    case 'group/create':
      if (original.groups.some((group) => group.id === action.group.id)) return failed(original, `Group "${action.group.id}" already exists.`);
      if (action.group.providerIds.some((id) => !original.providers.some((provider) => provider.id === id))) return failed(original, 'Group references an unknown provider.');
      candidate = { ...original, groups: [...original.groups, action.group], providers: original.providers.map((provider) => ({ ...provider, groupIds: action.group.providerIds.includes(provider.id) ? [...provider.groupIds, action.group.id] : provider.groupIds })) };
      break;
    case 'group/update': {
      const index = original.groups.findIndex((group) => group.id === action.id);
      if (index < 0) return failed(original, `Group "${action.id}" does not exist.`);
      const next = { ...original.groups[index], ...action.patch, id: action.id };
      if (next.providerIds.some((id) => !original.providers.some((provider) => provider.id === id))) return failed(original, 'Group references an unknown provider.');
      candidate = { ...original, groups: original.groups.map((group, groupIndex) => groupIndex === index ? next : group), providers: original.providers.map((provider) => ({ ...provider, groupIds: next.providerIds.includes(provider.id) ? [...provider.groupIds.filter((id) => id !== action.id), action.id] : provider.groupIds.filter((id) => id !== action.id) })) };
      break;
    }
    case 'group/remove':
      if (!original.groups.some((group) => group.id === action.id)) return failed(original, `Group "${action.id}" does not exist.`);
      candidate = { ...original, groups: original.groups.filter((group) => group.id !== action.id), providers: original.providers.map((provider) => ({ ...provider, groupIds: provider.groupIds.filter((id) => id !== action.id) })) };
      break;
    case 'group/reorder':
      if (!sameIds(original.groups.map((group) => group.id), action.groupIds)) return failed(original, 'Group reorder must contain every group ID exactly once.');
      candidate = { ...original, groups: action.groupIds.map((id) => original.groups.find((group) => group.id === id) as UnifiedSearchSourceGroup) };
      break;
    case 'snapshots/replace':
      candidate = { ...original, results: action.results };
      break;
    case 'snapshots/clear':
      return { ok: true, value: { ...original, results: [] } };
  }

  const validated = normalizeUnifiedSearchDocument(synchronizeMembership(candidate));
  const relevantIssues = validated.issues.filter((issue) => {
    if (action.type.startsWith('provider/')) return issue.path.startsWith('providers');
    if (action.type.startsWith('group/')) return issue.path.startsWith('groups');
    return issue.path.startsWith('results');
  });
  if (relevantIssues.length) return failed(original, relevantIssues[0].message);
  if (action.type === 'snapshots/replace' && validated.value.results.length !== action.results.length) return failed(original, 'Every inert snapshot must be valid and unique.');
  return { ok: true, value: canonicalizePriorities(validated.value) };
}
