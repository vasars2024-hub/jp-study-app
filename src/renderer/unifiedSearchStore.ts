import {
  createEmptyUnifiedSearchDocument,
  normalizeUnifiedSearchDocument,
  reduceUnifiedSearchDocument,
  type UnifiedSearchAction,
  type UnifiedSearchDocument,
  type UnifiedSearchMutationResult,
  type UnifiedSearchValidationResult,
} from '../shared/unifiedSearch';
import { BUILT_IN_UNIFIED_SEARCH_PROVIDERS, LATER_BUILT_IN_IDS } from './unifiedSearchBackends';
import { writeLocalStorageJson } from './localStorageWrite';

export const UNIFIED_SEARCH_STORAGE_KEY = 'jp-unified-search-v1';
export const LEGACY_UNIFIED_SEARCH_STORAGE_KEYS = ['jp-unified-search', 'jp-multi-source-search'] as const;

let memoryFallback: UnifiedSearchDocument | null = null;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Migrates the pre-versioned persistence draft without executing any provider data. */
function migrateStoredDocument(input: unknown): unknown {
  if (!isRecord(input) || typeof input.version === 'number') return input;

  const providers = Array.isArray(input.providerConfigurations)
    ? input.providerConfigurations
    : input.providers;
  const groups = Array.isArray(input.sourceGroups) ? input.sourceGroups : input.groups;
  const results = Array.isArray(input.resultSnapshots) ? input.resultSnapshots : input.results;
  const order = Array.isArray(input.providerOrder)
    ? input.providerOrder.filter((item): item is string => typeof item === 'string')
    : [];
  const orderById = new Map(order.map((providerId, index) => [providerId, index]));

  return {
    version: 1,
    providers: Array.isArray(providers)
      ? providers.map((provider, index) => isRecord(provider)
        ? { ...provider, priority: orderById.get(String(provider.id)) ?? provider.priority ?? index }
        : provider)
      : [],
    groups: Array.isArray(groups) ? groups : [],
    results: Array.isArray(results) ? results : [],
  };
}

function readCandidate(key: string): UnifiedSearchDocument | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = migrateStoredDocument(JSON.parse(raw));
    const validated = normalizeUnifiedSearchDocument(parsed);
    if (validated.issues.some((issue) => issue.path === '' || issue.path === 'version')) return null;
    return validated.value;
  } catch {
    return null;
  }
}

export function loadUnifiedSearchDocument(): UnifiedSearchDocument {
  try {
    for (const key of [UNIFIED_SEARCH_STORAGE_KEY, ...LEGACY_UNIFIED_SEARCH_STORAGE_KEYS]) {
      const stored = readCandidate(key);
      if (!stored) continue;
      const document = withBuiltInProviders(stored);
      memoryFallback = document;
      if (key !== UNIFIED_SEARCH_STORAGE_KEY) {
        localStorage.setItem(UNIFIED_SEARCH_STORAGE_KEY, JSON.stringify(document));
      }
      return document;
    }
  } catch { /* retain the last validated in-memory snapshot */ }
  return memoryFallback ?? withBuiltInProviders(createEmptyUnifiedSearchDocument());
}

/**
 * A document with no sources at all is given the three the app can actually
 * search — the local library, the public catalogues and the torrent indexes —
 * rather than a search box that can only ever answer "no sources". Only an
 * empty document is seeded: a user who removed or reordered sources keeps
 * exactly what they chose.
 */
function withBuiltInProviders(document: UnifiedSearchDocument): UnifiedSearchDocument {
  if (document.providers.length) return document;
  return { ...document, providers: BUILT_IN_UNIFIED_SEARCH_PROVIDERS.map((provider) => ({ ...provider })) };
}

const LATER_BUILT_INS_KEY = 'jp-unified-search-later-builtins-v1';

/**
 * Sources added after a learner already had a list (dramas/films, subtitle
 * presence) are appended once, at the end, when the search opens; removing
 * them afterwards sticks, because the append is remembered and never repeated.
 * Not done on load, so a stored document always reads back exactly as saved.
 */
export function addLaterBuiltInsOnce(): UnifiedSearchDocument {
  const current = loadUnifiedSearchDocument();
  const next = withLaterBuiltIns(current);
  return next === current ? current : saveUnifiedSearchDocument(next).value;
}

function withLaterBuiltIns(document: UnifiedSearchDocument): UnifiedSearchDocument {
  let seen: string[] = [];
  try {
    seen = JSON.parse(localStorage.getItem(LATER_BUILT_INS_KEY) ?? '[]') as string[];
  } catch {
    seen = [];
  }
  const missing = LATER_BUILT_IN_IDS.filter((id) => !seen.includes(id) && !document.providers.some((p) => p.id === id));
  if (!missing.length) return document;
  writeLocalStorageJson(LATER_BUILT_INS_KEY, [...new Set([...seen, ...LATER_BUILT_IN_IDS])]);
  const added = BUILT_IN_UNIFIED_SEARCH_PROVIDERS.filter((p) => missing.includes(p.id)).map((p) => ({ ...p }));
  return { ...document, providers: [...document.providers, ...added] };
}

export function saveUnifiedSearchDocument(input: unknown): UnifiedSearchValidationResult {
  const result = normalizeUnifiedSearchDocument(input);
  memoryFallback = result.value;
  try { localStorage.setItem(UNIFIED_SEARCH_STORAGE_KEY, JSON.stringify(result.value)); } catch { /* retain in memory */ }
  return result;
}

export function exportUnifiedSearchDocument(document = loadUnifiedSearchDocument()): string {
  return JSON.stringify(normalizeUnifiedSearchDocument(document).value, null, 2);
}

export function importUnifiedSearchDocument(json: string): UnifiedSearchValidationResult {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('Unified Search JSON is not valid.'); }
  const validated = normalizeUnifiedSearchDocument(migrateStoredDocument(parsed));
  const fatalIssue = validated.issues.find((issue) => issue.path === '' || issue.path === 'version');
  if (fatalIssue) throw new Error(`Unified Search import was rejected: ${fatalIssue.message}`);
  return saveUnifiedSearchDocument(validated.value);
}

/** Applies and persists one atomic local mutation. No provider code is invoked. */
export function dispatchUnifiedSearchAction(action: UnifiedSearchAction): UnifiedSearchMutationResult {
  const result = reduceUnifiedSearchDocument(loadUnifiedSearchDocument(), action);
  if (!result.ok) return result;
  saveUnifiedSearchDocument(result.value);
  return result;
}
