/**
 * VNDB art for the renderer, through main's cache.
 *
 * The packaged CSP does not allow `t.vndb.org`, and must not be widened for it
 * (`shared/contentSecurityPolicy.ts`), so a VNDB URL is never put in an `<img>`
 * directly: main downloads it once and hands back a `media://vn-art/…` URL that
 * the CSP-exempt `media:` scheme serves. Results are memoised per session, and
 * a failure is remembered too so a broken image is not re-requested on every
 * render.
 */
import { useEffect, useState } from 'react';

const resolved = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export function resolveVisualNovelArt(url: string): Promise<string> {
  if (!url) return Promise.resolve('');
  const known = resolved.get(url);
  if (known !== undefined) return Promise.resolve(known);
  const inFlight = pending.get(url);
  if (inFlight) return inFlight;
  const api = typeof window !== 'undefined' ? window.api : undefined;
  if (typeof api?.visualNovelArt !== 'function') return Promise.resolve('');
  const run = api.visualNovelArt(url)
    .then((result) => (result?.ok && result.url ? result.url : ''))
    .catch(() => '')
    .then((value) => {
      resolved.set(url, value);
      pending.delete(url);
      return value;
    });
  pending.set(url, run);
  return run;
}

/** The local URL for a VNDB image, or '' while it loads or when it cannot be cached. */
export function useVisualNovelArt(url: string): string {
  const [local, setLocal] = useState(() => resolved.get(url) ?? '');
  useEffect(() => {
    let active = true;
    setLocal(resolved.get(url) ?? '');
    void resolveVisualNovelArt(url).then((value) => {
      if (active) setLocal(value);
    });
    return () => {
      active = false;
    };
  }, [url]);
  return local;
}

/** Test seam. */
export function resetVisualNovelArtCache(): void {
  resolved.clear();
  pending.clear();
}
