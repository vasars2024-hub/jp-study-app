/**
 * Structured pitch accent (`dict:pitch`), cached per term|reading for the session.
 *
 * The dictionary popup draws one contour per entry, and a reader looks the same few
 * hundred words up over and over — so each pair is asked for once, concurrent askers
 * share the one request, and a re-render never asks again. A reply is cached whether or
 * not it has entries ("this word has no accent data" is an answer too); a failed request
 * is not, so a later lookup can still succeed.
 */
import { isPitchLookup, type PitchLookup } from '../shared/pitchAccent';

/** Enough for a long session's lookups; the oldest pair is dropped past it. */
const MAX_CACHED = 500;

/**
 * How long a "no pitch dictionary installed" reply stands for EVERY word. Without it each
 * new lookup would still ask once per entry for an answer already known to be no; with
 * it unbounded, a dictionary imported mid-session would not show until a restart.
 */
const UNAVAILABLE_TTL_MS = 5 * 60_000;

const cache = new Map<string, PitchLookup>();
const pending = new Map<string, Promise<PitchLookup | null>>();
let unavailableUntil = 0;

const NONE: PitchLookup = { available: false, entries: [] };

/** True while the last reply said no pitch dictionary is installed at all. */
export function pitchKnownUnavailable(): boolean {
  return Date.now() < unavailableUntil;
}

function pitchKey(term: string, reading?: string): string {
  return `${term.trim()}|${(reading ?? '').trim()}`;
}

/** The cached reply for a pair, without asking; undefined until it has been fetched. */
export function cachedPitch(term: string, reading?: string): PitchLookup | undefined {
  return cache.get(pitchKey(term, reading)) ?? (pitchKnownUnavailable() ? NONE : undefined);
}

/** The reply for a pair: cached, in flight, or fetched now. Null when it cannot be had. */
export function fetchPitch(term: string, reading?: string): Promise<PitchLookup | null> {
  const key = pitchKey(term, reading);
  const hit = cachedPitch(term, reading);
  if (hit) return Promise.resolve(hit);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const api = typeof window !== 'undefined' ? window.api?.dictPitch : undefined;
  if (typeof api !== 'function' || !term.trim()) return Promise.resolve(null);
  const request = api(term.trim(), reading?.trim() || undefined)
    .then((reply: unknown): PitchLookup | null => {
      if (!isPitchLookup(reply)) return null;
      if (!reply.available) {
        unavailableUntil = Date.now() + UNAVAILABLE_TTL_MS;
        return reply;
      }
      unavailableUntil = 0;
      if (cache.size >= MAX_CACHED) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, reply);
      return reply;
    })
    .catch(() => null)
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

/** Tests only: forget every cached and in-flight pair. */
export function resetPitchCache(): void {
  cache.clear();
  pending.clear();
  unavailableUntil = 0;
}
