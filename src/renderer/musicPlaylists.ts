// User music playlists: named, ordered lists of library track ids.
//
// Stored like the liked hearts (`likedSongs.ts`) — one localStorage document, a
// module-level cache and a change signal — but written through the guarded writer, so a
// refused write is reported rather than silently lost. Tracks are kept by media id, the
// same identity the library, the liked set and the player use; a track that later leaves
// the library stays in the list and is skipped when the playlist is resolved, so
// re-adding the folder brings it back in place.

import type { MediaItem } from '../shared/types';
import { writeLocalStorageJson } from './localStorageWrite';

export const PLAYLISTS_KEY = 'jp-music-playlists';
/** Long enough for any real name, short enough that a pasted paragraph is not one. */
export const PLAYLIST_NAME_MAX = 80;

export interface MusicPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface PlaylistsDoc {
  version: 1;
  playlists: MusicPlaylist[];
}

const listeners = new Set<() => void>();
const playListeners = new Set<(id: string) => void>();

function sanitize(raw: unknown): MusicPlaylist[] {
  const list = (raw as Partial<PlaylistsDoc> | null)?.playlists;
  if (!Array.isArray(list)) return [];
  const out: MusicPlaylist[] = [];
  const seen = new Set<string>();
  for (const p of list as Partial<MusicPlaylist>[]) {
    if (!p || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const ids = Array.isArray(p.trackIds) ? p.trackIds.filter((x): x is string => typeof x === 'string' && !!x) : [];
    out.push({
      id: p.id,
      name: typeof p.name === 'string' ? p.name.slice(0, PLAYLIST_NAME_MAX) : '',
      trackIds: [...new Set(ids)],
      createdAt: Number(p.createdAt) || 0,
      updatedAt: Number(p.updatedAt) || 0,
    });
  }
  return out;
}

function load(): MusicPlaylist[] {
  try {
    return sanitize(JSON.parse(localStorage.getItem(PLAYLISTS_KEY) ?? 'null'));
  } catch {
    return [];
  }
}

let playlists = load();

function commit(next: MusicPlaylist[]): void {
  playlists = next;
  writeLocalStorageJson(PLAYLISTS_KEY, { version: 1, playlists } satisfies PlaylistsDoc);
  for (const l of listeners) l();
}

// Another window (the detached player, a pop-out) edited the list.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== PLAYLISTS_KEY) return;
    playlists = load();
    for (const l of listeners) l();
  });
}

/** Re-read storage (tests, and after a backup restore rewrote the key). */
export function reloadPlaylists(): void {
  playlists = load();
  for (const l of listeners) l();
}

export function listPlaylists(): MusicPlaylist[] {
  return playlists;
}

export function getPlaylist(id: string | null | undefined): MusicPlaylist | undefined {
  return id ? playlists.find((p) => p.id === id) : undefined;
}

export function onPlaylistsChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function cleanPlaylistName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, PLAYLIST_NAME_MAX);
}

function newId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `pl-${Date.now().toString(36)}-${rand}`;
}

function update(id: string, fn: (p: MusicPlaylist) => MusicPlaylist | null): boolean {
  const at = playlists.findIndex((p) => p.id === id);
  if (at < 0) return false;
  const changed = fn(playlists[at]);
  if (!changed) return false;
  const next = playlists.slice();
  next[at] = { ...changed, updatedAt: Date.now() };
  commit(next);
  return true;
}

/** Create a playlist. An empty (or blank) name falls back to `fallbackName`. */
export function createPlaylist(name: string, fallbackName: string, trackIds: string[] = []): MusicPlaylist {
  const now = Date.now();
  const playlist: MusicPlaylist = {
    id: newId(),
    name: cleanPlaylistName(name) || cleanPlaylistName(fallbackName),
    trackIds: [...new Set(trackIds.filter(Boolean))],
    createdAt: now,
    updatedAt: now,
  };
  commit([...playlists, playlist]);
  return playlist;
}

/** Rename; a blank name is refused so a playlist never loses its label. */
export function renamePlaylist(id: string, name: string): boolean {
  const clean = cleanPlaylistName(name);
  if (!clean) return false;
  return update(id, (p) => (p.name === clean ? null : { ...p, name: clean }));
}

export function deletePlaylist(id: string): boolean {
  if (!playlists.some((p) => p.id === id)) return false;
  commit(playlists.filter((p) => p.id !== id));
  return true;
}

/** Append tracks not already in the list; returns how many were added. */
export function addTracksToPlaylist(id: string, trackIds: readonly string[]): number {
  let added = 0;
  update(id, (p) => {
    const have = new Set(p.trackIds);
    const fresh: string[] = [];
    for (const t of trackIds) {
      if (!t || have.has(t)) continue;
      have.add(t);
      fresh.push(t);
    }
    added = fresh.length;
    return added ? { ...p, trackIds: [...p.trackIds, ...fresh] } : null;
  });
  return added;
}

export function removeTrackFromPlaylist(id: string, trackId: string): boolean {
  return update(id, (p) => (p.trackIds.includes(trackId) ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId) } : null));
}

/** Pure: `list` with the entry at `from` moved to `to` (both clamped). */
export function movedEntry<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

/** Move a track to another position in its playlist. */
export function moveTrackInPlaylist(id: string, trackId: string, to: number): boolean {
  return update(id, (p) => {
    const from = p.trackIds.indexOf(trackId);
    if (from < 0 || from === to) return null;
    const next = movedEntry(p.trackIds, from, to);
    return next.every((t, i) => t === p.trackIds[i]) ? null : { ...p, trackIds: next };
  });
}

/**
 * The playlist's tracks that exist in `library`, in playlist order. A track that has left
 * the library is skipped (and kept in the list), never shown as a broken row.
 */
export function resolvePlaylistTracks(playlist: MusicPlaylist | undefined, library: readonly MediaItem[]): MediaItem[] {
  if (!playlist) return [];
  const byId = new Map(library.map((item) => [item.id, item]));
  const out: MediaItem[] = [];
  for (const id of playlist.trackIds) {
    const item = byId.get(id);
    if (item) out.push(item);
  }
  return out;
}

// ----- "play this playlist" from outside the Music window (the palette) -----------------

let pendingPlay: string | null = null;

/**
 * Ask whichever Music surface is (or is about to be) mounted to play `id` from the top.
 * The request is held until one surface takes it, so opening the Music window and asking
 * in the same tick still plays once, and two mounted surfaces never both start it.
 */
export function requestPlaylistPlay(id: string): void {
  pendingPlay = id;
  for (const l of playListeners) l(id);
}

/** Claim the pending request (once). */
export function takePendingPlaylistPlay(): string | null {
  const id = pendingPlay;
  pendingPlay = null;
  return id;
}

export function onPlaylistPlayRequested(cb: (id: string) => void): () => void {
  playListeners.add(cb);
  return () => playListeners.delete(cb);
}
