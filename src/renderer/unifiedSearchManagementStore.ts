import {
  normalizeUnifiedSearchFilters,
  normalizeUnifiedSearchManagement,
  type UnifiedSearchFavorite,
  type UnifiedSearchFilterPreset,
  type UnifiedSearchFilters,
  type UnifiedSearchManagementDocument,
} from '../shared/unifiedSearchManagement';

export const UNIFIED_SEARCH_MANAGEMENT_STORAGE_KEY = 'jp-unified-search-management-v1';
let memoryDocument: UnifiedSearchManagementDocument = { version: 1, favorites: [], presets: [] };

export function loadUnifiedSearchManagement(): UnifiedSearchManagementDocument {
  try {
    const raw = localStorage.getItem(UNIFIED_SEARCH_MANAGEMENT_STORAGE_KEY);
    if (raw) memoryDocument = normalizeUnifiedSearchManagement(JSON.parse(raw));
  } catch { /* retain last valid memory state */ }
  return structuredClone(memoryDocument);
}

function save(document: UnifiedSearchManagementDocument): UnifiedSearchManagementDocument {
  memoryDocument = normalizeUnifiedSearchManagement(document);
  try { localStorage.setItem(UNIFIED_SEARCH_MANAGEMENT_STORAGE_KEY, JSON.stringify(memoryDocument)); } catch { /* memory fallback */ }
  return structuredClone(memoryDocument);
}

export function saveUnifiedSearchFavorite(id: string, query: string, filters: UnifiedSearchFilters, createdAt = Date.now()): UnifiedSearchManagementDocument {
  const current = loadUnifiedSearchManagement();
  const favorite: UnifiedSearchFavorite = { id, query, filters: normalizeUnifiedSearchFilters(filters), createdAt };
  return save({ ...current, favorites: [favorite, ...current.favorites.filter((item) => item.id !== id)] });
}

export function removeUnifiedSearchFavorite(id: string): UnifiedSearchManagementDocument {
  const current = loadUnifiedSearchManagement();
  return save({ ...current, favorites: current.favorites.filter((item) => item.id !== id) });
}

export function saveUnifiedSearchPreset(id: string, name: string, filters: UnifiedSearchFilters, createdAt = Date.now()): UnifiedSearchManagementDocument {
  const current = loadUnifiedSearchManagement();
  const preset: UnifiedSearchFilterPreset = { id, name, filters: normalizeUnifiedSearchFilters(filters), createdAt };
  return save({ ...current, presets: [preset, ...current.presets.filter((item) => item.id !== id)] });
}

export function removeUnifiedSearchPreset(id: string): UnifiedSearchManagementDocument {
  const current = loadUnifiedSearchManagement();
  return save({ ...current, presets: current.presets.filter((item) => item.id !== id) });
}
