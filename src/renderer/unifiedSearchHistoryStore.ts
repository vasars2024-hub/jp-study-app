import {
  addUnifiedSearchHistory,
  normalizeUnifiedSearchHistory,
  type UnifiedSearchHistoryEntry,
} from '../shared/unifiedSearchManagement';

export const UNIFIED_SEARCH_HISTORY_STORAGE_KEY = 'jp-unified-search-history-v1';
let memoryHistory: UnifiedSearchHistoryEntry[] = [];

export function loadUnifiedSearchHistory(): UnifiedSearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(UNIFIED_SEARCH_HISTORY_STORAGE_KEY);
    if (raw) memoryHistory = normalizeUnifiedSearchHistory(JSON.parse(raw));
  } catch { /* retain the last valid in-memory history */ }
  return [...memoryHistory];
}

export function recordUnifiedSearchHistory(query: string, searchedAt = Date.now()): UnifiedSearchHistoryEntry[] {
  memoryHistory = addUnifiedSearchHistory(loadUnifiedSearchHistory(), query, searchedAt);
  try { localStorage.setItem(UNIFIED_SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(memoryHistory)); } catch { /* memory fallback */ }
  return [...memoryHistory];
}

export function clearUnifiedSearchHistory(): void {
  memoryHistory = [];
  try { localStorage.removeItem(UNIFIED_SEARCH_HISTORY_STORAGE_KEY); } catch { /* memory fallback is already clear */ }
}
