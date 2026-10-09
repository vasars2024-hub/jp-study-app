/**
 * Per-word corpus frequency (`dict:frequency`), cached for the session.
 *
 * A dictionary result lists up to a page of entries and each one now shows every
 * installed corpus's rank, the way Yomitan prints one tag per frequency dictionary. The
 * read is one indexed probe, but the popup re-renders on every grade, star and Anki
 * heartbeat, and a reader looks the same words up again and again — so each word|language
 * is asked once, concurrent askers share the request, and a failed request is not cached.
 */
import type { LexiconFrequencyResult } from '../shared/lexiconFrequency';
import { onDictionariesChanged } from './dictionaryChangeSignal';

const MAX_CACHED = 500;
const cache = new Map<string, LexiconFrequencyResult>();
const pending = new Map<string, Promise<LexiconFrequencyResult | null>>();
/** Bumped whenever the cache is dropped, so a mounted chip row knows to ask again. */
let generation = 0;
const clearedListeners = new Set<() => void>();
let stopWatching: (() => void) | null = null;

function cacheKey(word: string, lang: string): string {
  return `${lang}\u0000${word.trim()}`;
}

/**
 * "Cached for the session" must not outlive the dictionaries it was read from. Found by
 * the e2e harness: on a fresh profile every word answers `entries: []` (no corpus yet),
 * that empty answer was cached, and a frequency dictionary installed afterwards never
 * showed a chip until the app restarted.
 */
function watchDictionaryChanges(): void {
  if (!stopWatching) stopWatching = onDictionariesChanged(clearWordFrequencyCache);
}

/** Drop every cached answer (in-flight requests finish but are not trusted past this point). */
export function clearWordFrequencyCache(): void {
  cache.clear();
  pending.clear();
  generation += 1;
  for (const listener of clearedListeners) listener();
}

/** Current cache generation; changes each time the cache is dropped. */
export function wordFrequencyCacheGeneration(): number {
  return generation;
}

/** Called after the cache is dropped. Returns the unsubscribe. */
export function onWordFrequencyCacheCleared(listener: () => void): () => void {
  watchDictionaryChanges();
  clearedListeners.add(listener);
  return () => {
    clearedListeners.delete(listener);
  };
}

/** The cached reply, without asking; undefined until it has been fetched. */
export function cachedWordFrequency(word: string, lang: string): LexiconFrequencyResult | undefined {
  return cache.get(cacheKey(word, lang));
}

/** The reply for a word: cached, in flight, or fetched now. Null when it cannot be had. */
export function fetchWordFrequency(word: string, lang: string): Promise<LexiconFrequencyResult | null> {
  watchDictionaryChanges();
  const key = cacheKey(word, lang);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const api = typeof window !== 'undefined' ? window.api?.dictFrequency : undefined;
  if (typeof api !== 'function' || !word.trim()) return Promise.resolve(null);
  const askedIn = generation;
  const request = api(word.trim(), { sourceLangs: [lang] })
    .then((reply): LexiconFrequencyResult | null => {
      if (!reply || !Array.isArray(reply.entries)) return null;
      // Read against dictionaries that have since changed: answer the caller, cache nothing.
      if (askedIn !== generation) return reply;
      if (cache.size >= MAX_CACHED) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, reply);
      return reply;
    })
    .catch(() => null)
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

/**
 * A corpus title short enough for a chip. "Japanese frequency (JPDB v2.2)" says its
 * name in the parentheses; a title that is already short is used as is; anything else
 * is cut, and the chip's tooltip carries the full title.
 */
export function frequencySourceShortLabel(title: string, max = 14): string {
  const clean = title.trim();
  const inner = /\(([^()]{1,40})\)\s*$/.exec(clean)?.[1]?.trim();
  if (inner) return inner.length <= max ? inner : `${inner.slice(0, max - 1)}…`;
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

/** Tests only: forget every cached and in-flight word. */
export function resetWordFrequencyCache(): void {
  cache.clear();
  pending.clear();
  generation = 0;
  clearedListeners.clear();
  stopWatching?.();
  stopWatching = null;
}
