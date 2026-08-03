/**
 * MASTER_PLAN §8 — subtitle persistence (renderer store).
 *
 * The only layer in §8 allowed to touch `localStorage` and the clock. The shared
 * modules stay pure: they validate timestamps but never generate them, so `addedAt`
 * on a track and `updatedAt` on a selection or a sync adjustment are stamped here.
 *
 * Two documents, two keys, mirroring §7's split:
 *   - the *catalogue* (`subtitleProviders.ts`): providers and the tracks they describe,
 *   - the *management* document (`subtitleManagement.ts`): preferences, pinned versions
 *     and saved timing offsets.
 *
 * Every read re-validates through the shared normalizers, so a corrupted or
 * hand-edited payload degrades to the last good in-memory snapshot instead of
 * throwing. Still strictly offline: nothing here contacts a provider or downloads a
 * subtitle file.
 */

import {
  clearSubtitleOffset,
  clearSubtitleVersionSelection,
  createEmptySubtitleManagementDocument,
  normalizeSubtitleManagementDocument,
  selectSubtitleVersion,
  setSubtitleOffset,
  setSubtitlePreferences,
  shiftSubtitleOffset,
  type SubtitleAdjustmentTarget,
  type SubtitleManagementDocument,
  type SubtitleManagementValidationResult,
  type SubtitlePreferences,
} from '../shared/subtitleManagement';
import {
  createEmptySubtitleProvidersDocument,
  normalizeSubtitleProvidersDocument,
  removeSubtitleProvider,
  removeSubtitleTrack,
  upsertSubtitleProvider,
  upsertSubtitleTrack,
  type SubtitleProvidersDocument,
  type SubtitleProvidersValidationResult,
} from '../shared/subtitleProviders';

export const SUBTITLE_PROVIDERS_STORAGE_KEY = 'jp-subtitle-providers-v1';
export const SUBTITLE_MANAGEMENT_STORAGE_KEY = 'jp-subtitle-management-v1';
export const SUBTITLE_STORE_CHANGED_EVENT = 'jp:subtitle-store-changed';

let providersFallback: SubtitleProvidersDocument | null = null;
let managementFallback: SubtitleManagementDocument | null = null;

function emitSubtitleStoreChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SUBTITLE_STORE_CHANGED_EVENT));
}

export function onSubtitleStoreChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(SUBTITLE_STORE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SUBTITLE_STORE_CHANGED_EVENT, listener);
}

/** A validated read, or null when the payload is missing, unparseable, or rejected wholesale. */
function readDocument<T>(key: string, normalize: (input: unknown) => { value: T; issues: { path: string }[] }): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const validated = normalize(JSON.parse(raw));
    if (validated.issues.some((issue) => issue.path === '' || issue.path === 'version')) return null;
    return validated.value;
  } catch {
    return null;
  }
}

export function loadSubtitleProvidersDocument(): SubtitleProvidersDocument {
  try {
    const document = readDocument(SUBTITLE_PROVIDERS_STORAGE_KEY, normalizeSubtitleProvidersDocument);
    if (document) {
      providersFallback = document;
      return document;
    }
  } catch { /* retain the last validated in-memory snapshot */ }
  return providersFallback ?? createEmptySubtitleProvidersDocument();
}

export function saveSubtitleProvidersDocument(input: unknown): SubtitleProvidersValidationResult {
  const result = normalizeSubtitleProvidersDocument(input);
  providersFallback = result.value;
  try { localStorage.setItem(SUBTITLE_PROVIDERS_STORAGE_KEY, JSON.stringify(result.value)); } catch { /* retain in memory */ }
  emitSubtitleStoreChanged();
  return result;
}

export function loadSubtitleManagementDocument(): SubtitleManagementDocument {
  try {
    const document = readDocument(SUBTITLE_MANAGEMENT_STORAGE_KEY, normalizeSubtitleManagementDocument);
    if (document) {
      managementFallback = document;
      return document;
    }
  } catch { /* retain the last validated in-memory snapshot */ }
  return managementFallback ?? createEmptySubtitleManagementDocument();
}

export function saveSubtitleManagementDocument(input: unknown): SubtitleManagementValidationResult {
  const result = normalizeSubtitleManagementDocument(input);
  managementFallback = result.value;
  try { localStorage.setItem(SUBTITLE_MANAGEMENT_STORAGE_KEY, JSON.stringify(result.value)); } catch { /* retain in memory */ }
  emitSubtitleStoreChanged();
  return result;
}

/** Inserts or replaces a provider. */
export function upsertSubtitleProviderEntry(input: unknown): SubtitleProvidersDocument {
  return saveSubtitleProvidersDocument(upsertSubtitleProvider(loadSubtitleProvidersDocument(), input).value).value;
}

/** Removes a provider and every track it contributed, plus any selection those tracks held. */
export function removeSubtitleProviderEntry(providerId: string): SubtitleProvidersDocument {
  const catalogue = saveSubtitleProvidersDocument(removeSubtitleProvider(loadSubtitleProvidersDocument(), providerId)).value;
  pruneOrphanSelections(catalogue);
  return catalogue;
}

/**
 * Inserts or replaces a track, stamping `addedAt` on first insert and preserving it
 * afterwards. The track's provider must already exist or the write is a no-op.
 */
export function upsertSubtitleTrackEntry(input: unknown, now = Date.now()): SubtitleProvidersDocument {
  const current = loadSubtitleProvidersDocument();
  const staged = upsertSubtitleTrack(current, input).value;
  const iso = new Date(now).toISOString();
  const tracks = staged.tracks.map((track) => {
    const before = current.tracks.find((entry) => entry.id === track.id);
    // A replacement inherits the original insertion time; a genuinely new track is
    // stamped now unless the caller (an import) already supplied one.
    return before ? { ...track, addedAt: before.addedAt ?? track.addedAt } : { ...track, addedAt: track.addedAt ?? iso };
  });
  return saveSubtitleProvidersDocument({ ...staged, tracks }).value;
}

/** Removes a track, and un-pins it if it was the selected version for its shelf. */
export function removeSubtitleTrackEntry(trackId: string): SubtitleProvidersDocument {
  const catalogue = saveSubtitleProvidersDocument(removeSubtitleTrack(loadSubtitleProvidersDocument(), trackId)).value;
  pruneOrphanSelections(catalogue);
  return catalogue;
}

/** Drops selections pointing at tracks the catalogue no longer has. */
function pruneOrphanSelections(catalogue: SubtitleProvidersDocument): SubtitleManagementDocument {
  const current = loadSubtitleManagementDocument();
  const known = new Set(catalogue.tracks.map((track) => track.id));
  const kept = current.selections.filter((selection) => known.has(selection.trackId));
  if (kept.length === current.selections.length) return current;
  return saveSubtitleManagementDocument({ ...current, selections: kept }).value;
}

/** Patches subtitle preferences, re-validating every field. */
export function updateSubtitlePreferences(patch: Partial<SubtitlePreferences>): SubtitleManagementDocument {
  return saveSubtitleManagementDocument(setSubtitlePreferences(loadSubtitleManagementDocument(), patch).value).value;
}

/** Pins a release for a shelf, stamping the selection's `updatedAt`. */
export function selectSubtitleVersionEntry(identityId: string, trackId: string, now = Date.now()): SubtitleManagementDocument {
  const current = loadSubtitleManagementDocument();
  const result = selectSubtitleVersion(loadSubtitleProvidersDocument(), current, identityId, trackId);
  if (result.issues.some((issue) => issue.path === 'selections')) return current;
  return saveSubtitleManagementDocument(stampSelections(result.value, current, now)).value;
}

/** Un-pins a shelf. */
export function clearSubtitleVersionEntry(identityId: string, language: string): SubtitleManagementDocument {
  return saveSubtitleManagementDocument(clearSubtitleVersionSelection(loadSubtitleManagementDocument(), identityId, language)).value;
}

/** Saves an absolute timing offset for a series/season/episode, stamping `updatedAt`. */
export function saveSubtitleOffsetEntry(
  target: SubtitleAdjustmentTarget,
  offsetMs: number,
  now = Date.now(),
): SubtitleManagementDocument {
  const current = loadSubtitleManagementDocument();
  const result = setSubtitleOffset(current, target, offsetMs);
  return saveSubtitleManagementDocument(stampAdjustments(result.value, current, now)).value;
}

/** Shifts subtitles by ±ms relative to the effective offset, stamping `updatedAt`. */
export function shiftSubtitleOffsetEntry(
  target: SubtitleAdjustmentTarget,
  deltaMs: number,
  now = Date.now(),
): SubtitleManagementDocument {
  const current = loadSubtitleManagementDocument();
  const result = shiftSubtitleOffset(current, target, deltaMs);
  return saveSubtitleManagementDocument(stampAdjustments(result.value, current, now)).value;
}

/** Drops the offset saved at exactly this scope. */
export function clearSubtitleOffsetEntry(target: SubtitleAdjustmentTarget): SubtitleManagementDocument {
  return saveSubtitleManagementDocument(clearSubtitleOffset(loadSubtitleManagementDocument(), target)).value;
}

/** Stamps `updatedAt` on adjustments whose offset this write created or changed. */
function stampAdjustments(next: SubtitleManagementDocument, previous: SubtitleManagementDocument, now: number): SubtitleManagementDocument {
  const iso = new Date(now).toISOString();
  return {
    ...next,
    adjustments: next.adjustments.map((adjustment) => {
      const before = previous.adjustments.find((item) => item.identityId === adjustment.identityId
        && item.season === adjustment.season
        && item.episode === adjustment.episode);
      return before && before.offsetMs === adjustment.offsetMs
        ? { ...adjustment, updatedAt: before.updatedAt }
        : { ...adjustment, updatedAt: iso };
    }),
  };
}

/** Stamps `updatedAt` on selections this write created or re-pointed. */
function stampSelections(next: SubtitleManagementDocument, previous: SubtitleManagementDocument, now: number): SubtitleManagementDocument {
  const iso = new Date(now).toISOString();
  return {
    ...next,
    selections: next.selections.map((selection) => {
      const before = previous.selections.find((item) => item.identityId === selection.identityId
        && item.language === selection.language);
      return before && before.trackId === selection.trackId
        ? { ...selection, updatedAt: before.updatedAt }
        : { ...selection, updatedAt: iso };
    }),
  };
}
