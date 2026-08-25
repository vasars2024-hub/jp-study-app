import type { MediaItem } from './types';
import { isVideoKind } from './mediaKind';
import { mediaCategory, type MediaCategory } from './mediaCategories';
import { mediaLibraryTarget } from './mediaFileIdentity';

// The taxonomy lives in a leaf module so `mediaFileIdentity` can share it without a
// cycle; re-exported here because this is where the rest of the app looks for it.
export { MEDIA_CATEGORIES, mediaCategory, type MediaCategory } from './mediaCategories';

export interface MediaHubSearchOptions { query?: string; category?: MediaCategory | 'all'; language?: string; genre?: string; }
export function searchMediaHub(items: readonly MediaItem[], options: MediaHubSearchOptions): MediaItem[] {
  const q = options.query?.trim().toLocaleLowerCase() ?? '';
  const genre = options.genre?.toLocaleLowerCase();
  return items.filter((item) => {
    if (options.category && options.category !== 'all' && mediaCategory(item) !== options.category) return false;
    if (options.language && item.lang !== options.language) return false;
    if (genre && !(item.genres ?? []).some((g) => g.toLocaleLowerCase() === genre)) return false;
    if (!q) return true;
    // `item.path` is deliberately NOT searched. It is an absolute path, so every item shares the
    // drive, the account name and the download folder, and none of that is on the card. Measured
    // live 2026-08-25 over the real 36-item library: "arseniy" (the Windows account name) matched
    // 36 of 36 while appearing on 0 cards, and so did "users" and "downloads" — a search that
    // returns the whole library for a word nothing displays reads as a broken filter. The file
    // name is the part of the path a card does show, and it stays in the haystack.
    return [item.title, item.fileName, item.artist, ...(item.genres ?? []), ...(item.actors ?? []), item.jlptLevel]
      .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(q));
  });
}

export interface MediaStorageDiagnostics { totalBytes: number; existingBytes: number; missing: string[]; duplicates: Array<{ path: string; itemIds: string[] }>; }
export function buildStorageDiagnostics(items: readonly MediaItem[], fileSize: (path: string) => number | null): MediaStorageDiagnostics {
  const base = diagnoseMediaPaths(items, (path) => fileSize(path) !== null);
  let totalBytes = 0; let existingBytes = 0;
  for (const item of items) { const size = fileSize(item.path); if (size !== null) { totalBytes += size; existingBytes += size; } }
  return { totalBytes, existingBytes, missing: base.missing, duplicates: base.duplicates };
}

export interface MediaHubSections {
  recentlyAdded: MediaItem[];
  continueWatching: MediaItem[];
  unorganized: MediaItem[];
  recentlyStudied: MediaItem[];
  recentlyListened: MediaItem[];
  recommended: MediaItem[];
}

export type MediaDuplicateChoice = 'keep-existing' | 'keep-incoming' | 'keep-both' | 'skip';
export interface MediaOrganizationPreview {
  itemId: string;
  sourcePath: string;
  targetPath: string;
  action: 'move' | 'rename' | 'noop' | 'conflict';
  conflictItemIds?: string[];
}
export interface MediaRelationship { id: string; fromId: string; toId: string; type: 'vocabulary' | 'sentence' | 'lyrics' | 'note' | 'flashcard'; createdAt: number; }
export interface MediaBackupContract { schema: 1; createdAt: number; items: MediaItem[]; relationships: MediaRelationship[]; }

export function previewMediaOrganization(item: MediaItem, root: string, items: readonly MediaItem[] = []): MediaOrganizationPreview {
  const targetPath = mediaLibraryTarget(item, root).path;
  const conflictItemIds = items.filter((other) => other.id !== item.id && mediaPathKey(other.path) === mediaPathKey(targetPath)).map((other) => other.id);
  return { itemId: item.id, sourcePath: item.path, targetPath, action: mediaPathKey(item.path) === mediaPathKey(targetPath) ? 'noop' : conflictItemIds.length ? 'conflict' : 'move', ...(conflictItemIds.length ? { conflictItemIds } : {}) };
}

export function resolveMediaDuplicates(choice: MediaDuplicateChoice, existingId: string, incoming: MediaItem, items: readonly MediaItem[]): MediaItem[] {
  if (choice === 'keep-existing' || choice === 'skip') return [...items];
  if (choice === 'keep-incoming') return items.map((item) => item.id === existingId ? incoming : item);
  return items.some((item) => item.id === incoming.id) ? [...items] : [incoming, ...items];
}

export interface MediaHubItemState {
  favorite?: boolean;
  studyQueue?: boolean;
  note?: string;
}

export interface MediaHubDiagnostics {
  duplicates: Array<{ path: string; itemIds: string[] }>;
  missing: string[];
}

/** Stable, case-insensitive path key for local diagnostics. */
export function mediaPathKey(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

/** Groups duplicate local paths and reports missing paths without filesystem access. */
export function diagnoseMediaPaths(
  items: readonly MediaItem[],
  pathExists: (path: string) => boolean,
): MediaHubDiagnostics {
  const groups = new Map<string, { path: string; itemIds: string[] }>();
  const missing = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.path !== 'string' || item.sourceUrl) continue;
    const key = mediaPathKey(item.path);
    if (!key) continue;
    const group = groups.get(key) ?? { path: item.path, itemIds: [] };
    group.itemIds.push(item.id);
    groups.set(key, group);
    if (!pathExists(item.path)) missing.add(item.path);
  }
  return {
    duplicates: [...groups.values()].filter((group) => group.itemIds.length > 1),
    missing: [...missing].sort((a, b) => mediaPathKey(a).localeCompare(mediaPathKey(b))),
  };
}

/** Deterministic local-library projection for the Media Hub dashboard. */
export function buildMediaHubSections(items: readonly MediaItem[]): MediaHubSections {
  const valid = items.filter((item) => item && typeof item.id === 'string');
  const byRecent = (a: MediaItem, b: MediaItem) =>
    (b.lastPlayedAt ?? b.addedAt ?? 0) - (a.lastPlayedAt ?? a.addedAt ?? 0);
  return {
    recentlyAdded: [...valid].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 6),
    continueWatching: valid
      .filter((item) => {
        if (!isVideoKind(item.kind)) return false;
        const position = item.positionSec ?? 0;
        return position > 0 && (!item.durationSec || position < item.durationSec - 5);
      })
      .sort(byRecent)
      .slice(0, 6),
    unorganized: valid
      .filter((item) => !item.sourceUrl && !item.fileName.includes('/') && !item.fileName.includes('\\'))
      .slice(0, 6),
    recentlyStudied: valid.filter((item) => item.lastStudiedAt).sort((a, b) => (b.lastStudiedAt ?? 0) - (a.lastStudiedAt ?? 0)).slice(0, 6),
    recentlyListened: valid.filter((item) => item.kind === 'audio' && item.lastPlayedAt).sort(byRecent).slice(0, 6),
    recommended: valid.filter((item) => !item.lastPlayedAt && !item.lastStudiedAt && !item.sourceUrl).sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 6),
  };
}
