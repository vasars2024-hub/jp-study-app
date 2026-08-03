import {
  createEmptyMediaProvidersDocument,
  normalizeMediaProvidersDocument,
  removeMediaProvider,
  upsertMediaProvider,
  type MediaProvidersDocument,
  type MediaProvidersValidationResult,
} from '../shared/mediaProviders';

export const MEDIA_PROVIDER_STORAGE_KEY = 'jp-media-providers-v1';

let memoryFallback: MediaProvidersDocument | null = null;

function readCandidate(key: string): MediaProvidersDocument | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const validated = normalizeMediaProvidersDocument(JSON.parse(raw));
    if (validated.issues.some((issue) => issue.path === '' || issue.path === 'version')) return null;
    return validated.value;
  } catch {
    return null;
  }
}

export function loadMediaProvidersDocument(): MediaProvidersDocument {
  try {
    const document = readCandidate(MEDIA_PROVIDER_STORAGE_KEY);
    if (document) {
      memoryFallback = document;
      return document;
    }
  } catch { /* retain the last validated in-memory snapshot */ }
  return memoryFallback ?? createEmptyMediaProvidersDocument();
}

export function saveMediaProvidersDocument(input: unknown): MediaProvidersValidationResult {
  const result = normalizeMediaProvidersDocument(input);
  memoryFallback = result.value;
  try { localStorage.setItem(MEDIA_PROVIDER_STORAGE_KEY, JSON.stringify(result.value)); } catch { /* retain in memory */ }
  return result;
}

export function exportMediaProvidersDocument(document = loadMediaProvidersDocument()): string {
  return JSON.stringify(normalizeMediaProvidersDocument(document).value, null, 2);
}

export function importMediaProvidersDocument(json: string): MediaProvidersValidationResult {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('Media providers JSON is not valid.'); }
  const validated = normalizeMediaProvidersDocument(parsed);
  const fatalIssue = validated.issues.find((issue) => issue.path === '' || issue.path === 'version');
  if (fatalIssue) throw new Error(`Media providers import was rejected: ${fatalIssue.message}`);
  return saveMediaProvidersDocument(validated.value);
}

/** Toggles a provider's enabled flag and persists. No provider code is invoked. */
export function setMediaProviderEnabled(providerId: string, enabled: boolean): MediaProvidersDocument {
  const current = loadMediaProvidersDocument();
  const provider = current.providers.find((item) => item.id === providerId.trim().toLowerCase());
  if (!provider) return current;
  return saveMediaProvidersDocument(upsertMediaProvider(current, { ...provider, enabled }).value).value;
}

/**
 * Reassigns provider priorities to match `orderedIds` (position → priority), so the
 * capability planner routes in the chosen order. Unlisted providers keep their relative
 * order after the listed ones. Purely local; persists and returns the normalized document.
 */
export function reorderMediaProviders(orderedIds: string[]): MediaProvidersDocument {
  const current = loadMediaProvidersDocument();
  const rank = new Map(orderedIds.map((id, index) => [id.trim().toLowerCase(), index]));
  const fallbackBase = orderedIds.length;
  const providers = current.providers
    .map((provider, index) => ({ provider, rank: rank.get(provider.id) ?? fallbackBase + index }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ provider }, index) => ({ ...provider, priority: index }));
  return saveMediaProvidersDocument({ ...current, providers }).value;
}

/** Inserts or replaces a provider by ID, then persists. */
export function upsertMediaProviderRecord(input: unknown): MediaProvidersValidationResult {
  const result = upsertMediaProvider(loadMediaProvidersDocument(), input);
  return { value: saveMediaProvidersDocument(result.value).value, issues: result.issues };
}

/** Removes a provider and every descriptor it produced, then persists. */
export function removeMediaProviderRecord(providerId: string): MediaProvidersDocument {
  return saveMediaProvidersDocument(removeMediaProvider(loadMediaProvidersDocument(), providerId)).value;
}
