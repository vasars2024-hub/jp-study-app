import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Cover resolution for anything backed by a `media://<ownerId>/<relPath>` file
 * (library books/manga, and cached Jiten deck covers — see main/jiten.ts's
 * jitenCacheCover, which stores under the same itemDir(ownerId) convention).
 *
 * The chain is: recorded art -> art that actually loads -> designed fallback.
 * The middle step is the one that was missing. A cover path is recorded in the
 * library index, but the file behind it can go away — a userData folder moved
 * between machines, a manga page deleted, a Jiten cache pruned. `media://` then
 * 404s, and because the art was painted as a *background image* there is no
 * error event and nothing to fall back to: the card rendered as an empty
 * bordered box. Worse, LibraryView only drew the title text when `coverPath`
 * was absent, so an item whose art was merely broken lost its title too and
 * became an unlabelled blank rectangle.
 */

/** The `media://` URL for a recorded cover, or null when there is no art to try. */
export function coverUrlFor(coverPath?: string, ownerId?: string): string | null {
  return coverPath && ownerId ? `media://${ownerId}/${coverPath}` : null;
}

/**
 * The designed fallback: a deterministic title-derived gradient, so an
 * uncovered item still looks distinct and the same title always looks the same.
 */
export function coverFallbackImage(title: string): string {
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 50% 18%))`;
}

/**
 * Failure caching, session-scoped and deliberately not persisted.
 *
 * A missing cover is repaired by re-importing or re-caching, both of which
 * restart the app's view of the item; persisting "this URL is broken" would
 * outlive the repair and keep showing a fallback over art that is now fine.
 * Within a session it earns its keep: a library scrolled through a virtual
 * list mounts the same card many times, and without this each mount would
 * re-request a URL already known to 404.
 */
const brokenCovers = new Set<string>();
const inFlight = new Map<string, Promise<boolean>>();

export function isCoverBroken(url: string): boolean {
  return brokenCovers.has(url);
}

export function markCoverBroken(url: string): void {
  brokenCovers.add(url);
}

/** Test seam only — the caches are module state and would leak between cases. */
export function resetCoverArtCache(): void {
  brokenCovers.clear();
  inFlight.clear();
}

export type CoverLoader = (url: string) => Promise<boolean>;

/**
 * Validate through an `Image`, not `fetch`: this is the same request the
 * background-image makes, so a success is served from the renderer's own image
 * cache rather than doubling the read. `naturalWidth` is checked because a
 * 0-byte or truncated file can fire `load` with nothing decodable in it.
 */
const imageLoader: CoverLoader = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });

/** Probe a cover once per URL per session; concurrent callers share the probe. */
export function probeCover(url: string, load: CoverLoader = imageLoader): Promise<boolean> {
  if (brokenCovers.has(url)) return Promise.resolve(false);
  const existing = inFlight.get(url);
  if (existing) return existing;
  const probe = load(url).then((ok) => {
    if (!ok) brokenCovers.add(url);
    inFlight.delete(url);
    return ok;
  });
  inFlight.set(url, probe);
  return probe;
}

/**
 * Shared cover-art styling. The art is layered *over* the fallback rather than
 * replacing it, so a cover that fails to paint reveals the designed gradient
 * instead of a transparent box — the fix holds even for callers that never
 * probe, and for art that is still loading.
 */
export function coverStyleFor(title: string, coverPath?: string, ownerId?: string): CSSProperties {
  const url = coverUrlFor(coverPath, ownerId);
  const fallback = coverFallbackImage(title);
  if (!url || isCoverBroken(url)) return { backgroundImage: fallback };
  return { backgroundImage: `url("${url}"), ${fallback}` };
}

export interface ResolvedCover {
  style: CSSProperties;
  /** True while art is the intended paint — false once it is known not to load. */
  hasArt: boolean;
  /** `art` or `fallback`, for deterministic live inspection. */
  resolution: 'art' | 'fallback';
}

/**
 * Resolve one item's cover, re-rendering only when a probe demotes it to the
 * fallback. Callers use `hasArt` to decide whether to draw the title over the
 * gradient, which is what makes a broken cover legible rather than blank.
 */
export function useCoverArt(title: string, coverPath?: string, ownerId?: string): ResolvedCover {
  const url = coverUrlFor(coverPath, ownerId);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(() =>
    url && isCoverBroken(url) ? url : null,
  );

  useEffect(() => {
    if (!url) return;
    if (isCoverBroken(url)) {
      setBrokenUrl(url);
      return;
    }
    // A late probe for a URL this card no longer shows must not demote the one
    // it moved on to, so the result is matched against the URL it was for.
    let alive = true;
    void probeCover(url).then((ok) => {
      if (alive && !ok) setBrokenUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  const hasArt = !!url && brokenUrl !== url;
  return {
    style: hasArt ? coverStyleFor(title, coverPath, ownerId) : { backgroundImage: coverFallbackImage(title) },
    hasArt,
    resolution: hasArt ? 'art' : 'fallback',
  };
}
