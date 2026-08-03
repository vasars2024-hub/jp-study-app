/**
 * Shortlist for the Scraper app — the titles the user has flagged to study next.
 *
 * Deliberately its own small store rather than a write into `mediaTrackingStore`:
 * a tracking record is keyed by a resolved `MediaIdentity`, and a catalogue
 * search hit has not been resolved to one. Storing the candidate verbatim keeps
 * discovery self-contained and leaves the identity resolution for the point
 * where the user actually imports a file.
 *
 * Same shape as every other renderer store: localStorage, a validating read, and
 * an event so open windows stay in sync.
 */

import type { DiscoveryCandidate } from '../shared/mediaDiscovery';
import { discoveryCandidateId } from '../shared/mediaDiscovery';
import type { YoutubeDiscoveryCandidate } from '../shared/youtubeDiscovery';
import { youtubeCandidateId, youtubeWatchUrlFor } from '../shared/youtubeDiscovery';

export const DISCOVERY_SHORTLIST_KEY = 'jp-discovery-shortlist-v1';
export const DISCOVERY_SHORTLIST_EVENT = 'discovery-shortlist-changed';

/** Bounded so a stray loop cannot fill the origin's storage quota. */
const MAX_ENTRIES = 200;

/**
 * Anything the user can shortlist.
 *
 * A catalogue title and a YouTube video are genuinely different records — one
 * has a numeric provider id, episodes and a rating; the other has an 11-character
 * string id, a channel and a caption inventory — so this is a discriminated
 * union rather than one flattened shape with half its fields optional. They
 * share one storage key because to the user it is one shortlist: the thing they
 * decided to study next.
 *
 * Readers that only handle one kind use {@link loadMediaShortlist} or
 * {@link loadYoutubeShortlist}, which narrow the type at the seam so no consumer
 * has to type-test a candidate it was never going to render.
 */
export type ShortlistCandidate = DiscoveryCandidate | YoutubeDiscoveryCandidate;

export function isYoutubeShortlistCandidate(
  candidate: ShortlistCandidate,
): candidate is YoutubeDiscoveryCandidate {
  return candidate.provider === 'youtube';
}

/** `jikan:52991`, `manga:anilist:30002`, or `youtube:dQw4w9WgXcQ`. */
export function shortlistCandidateId(candidate: ShortlistCandidate): string {
  return isYoutubeShortlistCandidate(candidate)
    ? youtubeCandidateId(candidate)
    : discoveryCandidateId(candidate);
}

export interface DiscoveryShortlistEntry {
  /** From {@link shortlistCandidateId}. */
  id: string;
  candidate: ShortlistCandidate;
  /** Epoch ms; newest first in {@link loadShortlist}. */
  addedAt: number;
}

export interface MediaShortlistEntry extends DiscoveryShortlistEntry {
  candidate: DiscoveryCandidate;
}

export interface YoutubeShortlistEntry extends DiscoveryShortlistEntry {
  candidate: YoutubeDiscoveryCandidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accepts an entry only if it still has the fields the console renders. A
 * half-written candidate from an older build is dropped rather than crashing a
 * list render three screens away.
 */
function normalizeMediaCandidate(candidate: Record<string, unknown>): DiscoveryCandidate | null {
  const provider = candidate.provider;
  const id = candidate.id;
  const title = candidate.title;
  if (provider !== 'jikan' && provider !== 'anilist') return null;
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  return {
    ...(candidate as unknown as DiscoveryCandidate),
    provider,
    id,
    title,
    genres: Array.isArray(candidate.genres)
      ? candidate.genres.filter((genre): genre is string => typeof genre === 'string')
      : [],
  };
}

function normalizeYoutubeCandidate(
  candidate: Record<string, unknown>,
): YoutubeDiscoveryCandidate | null {
  const videoId = candidate.videoId;
  const title = candidate.title;
  if (typeof videoId !== 'string' || !videoId.trim()) return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  return {
    ...(candidate as unknown as YoutubeDiscoveryCandidate),
    provider: 'youtube',
    videoId,
    title,
    // Rebuilt rather than trusted: a stored `url` is the one field an older
    // build could have written as a `youtu.be` short link or a watch URL with a
    // stale `list=` parameter, and the hand-off to the playlist manager expands
    // that parameter into somebody else's whole playlist.
    url: youtubeWatchUrlFor(videoId),
  };
}

function normalizeEntry(raw: unknown): DiscoveryShortlistEntry | null {
  if (!isRecord(raw) || !isRecord(raw.candidate)) return null;
  const candidate = raw.candidate;
  const normalized: ShortlistCandidate | null = candidate.provider === 'youtube'
    ? normalizeYoutubeCandidate(candidate)
    : normalizeMediaCandidate(candidate);
  if (!normalized) return null;
  return {
    id: shortlistCandidateId(normalized),
    candidate: normalized,
    addedAt: typeof raw.addedAt === 'number' && Number.isFinite(raw.addedAt) ? raw.addedAt : 0,
  };
}

export function loadShortlist(): DiscoveryShortlistEntry[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DISCOVERY_SHORTLIST_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is DiscoveryShortlistEntry => entry !== null)
      .sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

function write(entries: DiscoveryShortlistEntry[]): DiscoveryShortlistEntry[] {
  const capped = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(DISCOVERY_SHORTLIST_KEY, JSON.stringify(capped));
  } catch {
    // A full or unavailable store must not lose the in-memory answer — the
    // caller still gets the new list, it just will not survive a reload.
  }
  window.dispatchEvent(new CustomEvent(DISCOVERY_SHORTLIST_EVENT));
  return capped;
}

/** Catalogue titles only — the shape the anime/manga console ranks. */
export function loadMediaShortlist(): MediaShortlistEntry[] {
  return loadShortlist().filter((entry): entry is MediaShortlistEntry =>
    !isYoutubeShortlistCandidate(entry.candidate));
}

/** YouTube videos only — the shape the YouTube console ranks. */
export function loadYoutubeShortlist(): YoutubeShortlistEntry[] {
  return loadShortlist().filter((entry): entry is YoutubeShortlistEntry =>
    isYoutubeShortlistCandidate(entry.candidate));
}

/** Adds a candidate, or refreshes it in place if it is already shortlisted. */
export function addToShortlist(
  candidate: ShortlistCandidate,
  now = Date.now(),
): DiscoveryShortlistEntry[] {
  const id = shortlistCandidateId(candidate);
  const rest = loadShortlist().filter((entry) => entry.id !== id);
  return write([{ id, candidate, addedAt: now }, ...rest]);
}

export function removeFromShortlist(id: string): DiscoveryShortlistEntry[] {
  return write(loadShortlist().filter((entry) => entry.id !== id));
}

export function clearShortlist(): DiscoveryShortlistEntry[] {
  return write([]);
}

export function onShortlistChanged(cb: () => void): () => void {
  const handler = (): void => cb();
  window.addEventListener(DISCOVERY_SHORTLIST_EVENT, handler);
  // `storage` fires only in *other* windows, which is exactly what a pop-out
  // needs to notice a change made on the desktop copy.
  const storage = (event: StorageEvent): void => {
    if (event.key === DISCOVERY_SHORTLIST_KEY) cb();
  };
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(DISCOVERY_SHORTLIST_EVENT, handler);
    window.removeEventListener('storage', storage);
  };
}
