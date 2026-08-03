import type {
  UnifiedSearchAvailability,
  UnifiedSearchMediaType,
  UnifiedSearchResult,
  UnifiedSearchTrackingStatus,
} from './unifiedSearch';

export interface UnifiedSearchFilters {
  providerIds: string[];
  languages: string[];
  mediaTypes: UnifiedSearchMediaType[];
  genres: string[];
  seasons: string[];
  availability: UnifiedSearchAvailability[];
  trackingStatuses: UnifiedSearchTrackingStatus[];
  yearFrom: number | null;
  yearTo: number | null;
}

export interface UnifiedSearchHistoryEntry {
  query: string;
  searchedAt: number;
}

export interface UnifiedSearchFavorite {
  id: string;
  query: string;
  filters: UnifiedSearchFilters;
  createdAt: number;
}

export interface UnifiedSearchFilterPreset {
  id: string;
  name: string;
  filters: UnifiedSearchFilters;
  createdAt: number;
}

export interface UnifiedSearchManagementDocument {
  version: 1;
  favorites: UnifiedSearchFavorite[];
  presets: UnifiedSearchFilterPreset[];
}

export interface UnifiedSearchSuggestionGroups {
  favorites: UnifiedSearchFavorite[];
  recent: UnifiedSearchHistoryEntry[];
}

export const EMPTY_UNIFIED_SEARCH_FILTERS: UnifiedSearchFilters = Object.freeze({
  providerIds: [], languages: [], mediaTypes: [], genres: [], seasons: [],
  availability: [], trackingStatuses: [], yearFrom: null, yearTo: null,
});

function normalizedText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normalizedLabel(value: string, limit = 500): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, limit);
}

export function createUnifiedSearchManagementId(kind: 'favorite' | 'preset', label: string): string {
  let hash = 2166136261;
  for (const character of normalizedText(label)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${kind}-${(hash >>> 0).toString(36)}`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => normalizedLabel(item, 100)).filter(Boolean))]
    : [];
}

export function normalizeUnifiedSearchFilters(input: unknown): UnifiedSearchFilters {
  const value = typeof input === 'object' && input !== null ? input as Partial<UnifiedSearchFilters> : {};
  const year = (candidate: unknown) => typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0 && candidate <= 9999 ? candidate : null;
  return {
    providerIds: stringList(value.providerIds), languages: stringList(value.languages),
    mediaTypes: stringList(value.mediaTypes) as UnifiedSearchMediaType[], genres: stringList(value.genres),
    seasons: stringList(value.seasons), availability: stringList(value.availability) as UnifiedSearchAvailability[],
    trackingStatuses: stringList(value.trackingStatuses) as UnifiedSearchTrackingStatus[],
    yearFrom: year(value.yearFrom), yearTo: year(value.yearTo),
  };
}

export function normalizeUnifiedSearchManagement(input: unknown): UnifiedSearchManagementDocument {
  const value = typeof input === 'object' && input !== null ? input as Partial<UnifiedSearchManagementDocument> : {};
  const ids = new Set<string>();
  const normalizeItems = <T>(items: unknown, kind: 'favorite' | 'preset'): T[] => {
    if (!Array.isArray(items)) return [];
    return items.reduce<T[]>((output, item) => {
      if (typeof item !== 'object' || item === null) return output;
      const candidate = item as Record<string, unknown>;
      const id = typeof candidate.id === 'string' ? normalizedLabel(candidate.id, 100) : '';
      const createdAt = candidate.createdAt;
      const label = kind === 'favorite' ? candidate.query : candidate.name;
      if (!id || ids.has(id) || typeof label !== 'string' || !normalizedLabel(label) || typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return output;
      ids.add(id);
      output.push({ id, [kind === 'favorite' ? 'query' : 'name']: normalizedLabel(label), filters: normalizeUnifiedSearchFilters(candidate.filters), createdAt } as T);
      return output;
    }, []);
  };
  return { version: 1, favorites: normalizeItems<UnifiedSearchFavorite>(value.favorites, 'favorite'), presets: normalizeItems<UnifiedSearchFilterPreset>(value.presets, 'preset') };
}

/** Returns separately ranked local suggestions; it never combines their identities. */
export function getUnifiedSearchSuggestions(
  query: string,
  history: readonly UnifiedSearchHistoryEntry[],
  favorites: readonly UnifiedSearchFavorite[],
  limit = 5,
): UnifiedSearchSuggestionGroups {
  const needle = normalizedText(query);
  const matches = (value: string) => !needle || normalizedText(value).includes(needle);
  const cap = Math.max(0, Math.floor(limit));
  return {
    favorites: favorites.filter((item) => matches(item.query)).slice(0, cap),
    recent: history.filter((item) => matches(item.query)).slice(0, cap),
  };
}

function includes(values: readonly string[], value: string | null): boolean {
  if (values.length === 0) return true;
  if (!value) return false;
  const candidate = normalizedText(value);
  return values.some((item) => normalizedText(item) === candidate);
}

/** Pure local filtering. Input order is retained and no result identities are compared. */
export function filterUnifiedSearchResults(
  results: readonly UnifiedSearchResult[],
  filters: Readonly<UnifiedSearchFilters>,
): readonly UnifiedSearchResult[] {
  if (filters.providerIds.length === 0 && filters.languages.length === 0
    && filters.mediaTypes.length === 0 && filters.genres.length === 0
    && filters.seasons.length === 0 && filters.availability.length === 0
    && filters.trackingStatuses.length === 0 && filters.yearFrom === null && filters.yearTo === null) {
    return results;
  }
  const genreFilters = filters.genres.map(normalizedText).filter(Boolean);
  return results.filter((result) => {
    if (!includes(filters.providerIds, result.providerId)) return false;
    if (!includes(filters.languages, result.language)) return false;
    if (filters.mediaTypes.length && !filters.mediaTypes.includes(result.mediaType)) return false;
    if (!includes(filters.seasons, result.season)) return false;
    if (filters.availability.length && !filters.availability.includes(result.availability)) return false;
    if (filters.trackingStatuses.length && !filters.trackingStatuses.includes(result.trackingStatus)) return false;
    if (genreFilters.length && !genreFilters.every((genre) => result.genres.some((item) => normalizedText(item) === genre))) return false;
    if (filters.yearFrom !== null && (result.year === null || result.year < filters.yearFrom)) return false;
    if (filters.yearTo !== null && (result.year === null || result.year > filters.yearTo)) return false;
    return true;
  });
}

/** Adds a normalized query to most-recent-first history with deterministic de-duplication. */
export function addUnifiedSearchHistory(
  history: readonly UnifiedSearchHistoryEntry[],
  query: string,
  searchedAt: number,
  limit = 20,
): UnifiedSearchHistoryEntry[] {
  const normalized = query.trim().replace(/\s+/g, ' ').slice(0, 500);
  if (!normalized || !Number.isFinite(searchedAt) || limit <= 0) return [...history];
  const key = normalized.toLocaleLowerCase();
  return [
    { query: normalized, searchedAt },
    ...history.filter((entry) => entry.query.toLocaleLowerCase() !== key),
  ].slice(0, Math.floor(limit));
}

export function normalizeUnifiedSearchHistory(input: unknown, limit = 20): UnifiedSearchHistoryEntry[] {
  if (!Array.isArray(input)) return [];
  return input.reduce<UnifiedSearchHistoryEntry[]>((history, item) => {
    if (typeof item !== 'object' || item === null) return history;
    const candidate = item as { query?: unknown; searchedAt?: unknown };
    return typeof candidate.query === 'string' && typeof candidate.searchedAt === 'number'
      ? addUnifiedSearchHistory(history, candidate.query, candidate.searchedAt, limit)
      : history;
  }, []).sort((left, right) => right.searchedAt - left.searchedAt).slice(0, limit);
}
