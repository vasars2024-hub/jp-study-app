import type { UnifiedSearchResult } from '../shared/unifiedSearch';
import type { UnifiedSearchProviderProgress } from '../shared/unifiedSearchExecution';
import {
  EMPTY_UNIFIED_SEARCH_FILTERS,
  filterUnifiedSearchResults,
  type UnifiedSearchFilters,
} from '../shared/unifiedSearchManagement';

export interface UnifiedSearchResultPartition {
  providerId: string;
  providerName: string;
  results: readonly UnifiedSearchResult[];
}

/**
 * Projects execution progress into provider-owned result partitions.
 *
 * Provider order and result order are deliberately retained. Results are never
 * compared, deduplicated, merged, or moved between providers in this phase.
 */
export function partitionUnifiedSearchResults(
  providers: readonly UnifiedSearchProviderProgress[],
  filters: Readonly<UnifiedSearchFilters> = EMPTY_UNIFIED_SEARCH_FILTERS,
): readonly UnifiedSearchResultPartition[] {
  return Object.freeze(providers.map((provider) => Object.freeze({
    providerId: provider.providerId,
    providerName: provider.providerName,
    results: filterUnifiedSearchResults(provider.results, filters),
  })));
}
