/**
 * Artwork for a library item, fetched once per id and shared by every surface.
 *
 * A poster grid mounts and unmounts cards constantly as it virtualizes, so a
 * naive `useEffect(() => fetch())` would re-ask the main process for the same
 * image every time a card scrolled back into view. The cache below is module
 * scoped for that reason: the answer for an id is fetched once per session and
 * every later card reads it synchronously, which is also what stops the grid
 * from flashing skeletons while you scroll back up.
 *
 * `null` (a known-artless file) is cached exactly like a hit — that is the whole
 * point of the main process caching the miss too.
 *
 * The memo is dropped per id when the metadata sweep writes art
 * (`media:metadataUpdated`), and every *mounted* card for those ids re-asks at
 * once. Before that, a card resolved while the sweep was still running kept its
 * frame grab for the rest of the session even though a real poster had landed:
 * clearing the map alone does nothing for a card that is already on screen.
 */

import { useEffect, useRef, useState } from 'react';
import type { MediaMetadataUpdate } from '../../../../shared/mediaMetadataIpc';

type Resolved = string | null;

/**
 * Which image to ask for. `poster` prefers provider key art and falls back to a
 * generated still, so a metadata pass upgrades every card with no call-site
 * change. `banner` (the hero) and `backdrop` (16:9) are provider-only and
 * resolve to null without one. `still` is the file's own episode still, or a
 * frame grab.
 */
export type MediaArtworkVariant = 'poster' | 'banner' | 'backdrop' | 'still';

const VARIANTS: readonly MediaArtworkVariant[] = ['poster', 'banner', 'backdrop', 'still'];

const resolved = new Map<string, Resolved>();
const inFlight = new Map<string, Promise<Resolved>>();
/** Mounted hooks, told when their id's memo is dropped so they re-ask. */
const listeners = new Set<(ids: ReadonlySet<string> | null) => void>();

const cacheKey = (id: string, variant: MediaArtworkVariant): string => `${variant}:${id}`;

function notify(ids: ReadonlySet<string> | null): void {
  for (const listener of [...listeners]) {
    try {
      listener(ids);
    } catch {
      /* one broken card must not stop the others refreshing */
    }
  }
}

/** Drops the memo so a re-import or a metadata refresh can re-ask. */
export function invalidateMediaArtwork(id?: string): void {
  if (id === undefined) {
    resolved.clear();
    inFlight.clear();
    notify(null);
    return;
  }
  invalidateMediaArtworkIds([id]);
}

/** Drops the memo for several ids at once, then refreshes their mounted cards. */
export function invalidateMediaArtworkIds(ids: readonly string[]): void {
  if (ids.length === 0) return;
  for (const id of ids) {
    for (const variant of VARIANTS) {
      resolved.delete(cacheKey(id, variant));
      inFlight.delete(cacheKey(id, variant));
    }
  }
  notify(new Set(ids));
}

let wired = false;

/**
 * Subscribes once, on first use, to the sweep's "these items changed" push.
 * Only an update that touched art invalidates: a sweep that only wrote a
 * synopsis must not make every card re-ask.
 */
function wireMetadataUpdates(): void {
  if (wired) return;
  const subscribe = typeof window === 'undefined' ? undefined : window.api?.onMediaMetadataUpdated;
  if (typeof subscribe !== 'function') return;
  wired = true;
  subscribe((update: MediaMetadataUpdate) => {
    if (!update?.artwork || !Array.isArray(update.ids)) return;
    invalidateMediaArtworkIds(update.ids.filter((id): id is string => typeof id === 'string'));
  });
}

function load(id: string, variant: MediaArtworkVariant): Promise<Resolved> {
  const key = cacheKey(id, variant);
  const existing = inFlight.get(key);
  if (existing) return existing;

  let self: Promise<Resolved> | null = null;
  const job = (async (): Promise<Resolved> => {
    // Always settle after `inFlight.set` below, even if the bridge throws
    // synchronously, so the bookkeeping in `finally` sees this job registered.
    await null;
    try {
      const url = (await window.api?.mediaArtwork?.(id, variant)) ?? null;
      // Only memoized if nothing invalidated the key while this was in flight;
      // otherwise a pre-sweep answer would be written back over the drop.
      if (inFlight.get(key) === self) resolved.set(key, url);
      return url;
    } catch {
      // Not cached: a transient IPC failure should be retried the next time the
      // card mounts, unlike a genuine "this file has no image".
      return null;
    } finally {
      if (inFlight.get(key) === self) inFlight.delete(key);
    }
  })();

  self = job;
  inFlight.set(key, job);
  return job;
}

export interface MediaArtworkState {
  url: string | null;
  /** True until the first answer arrives — drives the skeleton, not a spinner. */
  loading: boolean;
}

/**
 * Resolves an item's artwork. The main process decides whether that is provider
 * key art or a locally generated still, so this stays one call either way.
 */
export function useMediaArtwork(
  id: string | null,
  variant: MediaArtworkVariant = 'poster',
): MediaArtworkState {
  const cached = id !== null ? resolved.get(cacheKey(id, variant)) : undefined;

  const [url, setUrl] = useState<Resolved>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined && id !== null);
  /** Bumped when this id's memo is dropped, so the effect below re-asks. */
  const [generation, setGeneration] = useState(0);
  /** Set by an invalidation: the next load is a refresh, not a first paint. */
  const refreshing = useRef(false);

  useEffect(() => {
    wireMetadataUpdates();
    if (id === null) return undefined;
    const listener = (ids: ReadonlySet<string> | null): void => {
      if (ids !== null && !ids.has(id)) return;
      refreshing.current = true;
      setGeneration((value) => value + 1);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [id]);

  useEffect(() => {
    if (id === null) {
      setUrl(null);
      setLoading(false);
      return;
    }
    const key = cacheKey(id, variant);
    if (resolved.has(key)) {
      setUrl(resolved.get(key) ?? null);
      setLoading(false);
      return;
    }

    let live = true;
    // A refresh keeps showing the previous image until the new one arrives,
    // rather than flashing the skeleton over a card that already had art.
    if (!refreshing.current) setLoading(true);
    refreshing.current = false;
    void load(id, variant).then((next) => {
      if (!live) return;
      setUrl(next);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [id, variant, generation]);

  return { url, loading };
}
