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
 */

import { useEffect, useState } from 'react';

type Resolved = string | null;

/**
 * Which image to ask for. `poster` prefers provider key art and falls back to a
 * generated still, so a metadata pass upgrades every card with no call-site
 * change. `banner` is provider-only and resolves to null without one.
 */
export type MediaArtworkVariant = 'poster' | 'banner' | 'still';

const resolved = new Map<string, Resolved>();
const inFlight = new Map<string, Promise<Resolved>>();

const cacheKey = (id: string, variant: MediaArtworkVariant): string => `${variant}:${id}`;

/** Drops the memo so a re-import or a metadata refresh can re-ask. */
export function invalidateMediaArtwork(id?: string): void {
  if (id === undefined) {
    resolved.clear();
    inFlight.clear();
    return;
  }
  for (const variant of ['poster', 'banner', 'still'] as const) {
    resolved.delete(cacheKey(id, variant));
    inFlight.delete(cacheKey(id, variant));
  }
}

function load(id: string, variant: MediaArtworkVariant): Promise<Resolved> {
  const key = cacheKey(id, variant);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = (async (): Promise<Resolved> => {
    try {
      const url = (await window.api?.mediaArtwork?.(id, variant)) ?? null;
      resolved.set(key, url);
      return url;
    } catch {
      // Not cached: a transient IPC failure should be retried the next time the
      // card mounts, unlike a genuine "this file has no image".
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

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
    setLoading(true);
    void load(id, variant).then((next) => {
      if (!live) return;
      setUrl(next);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [id, variant]);

  return { url, loading };
}
