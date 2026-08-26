// The page-size contract for a dictionary lookup, shared by main and renderer.
//
// It lives here because both ends have to agree on it and neither may own it:
// main clamps what arrives over IPC, and the renderer decides what to ask for
// next once a result comes back marked `truncated`. Keeping the two numbers in
// one place is what stops the surface from asking for a page main will silently
// shrink, which would render as a "Show more" button that changes nothing.

/**
 * How many entries one lookup renders before the result says it truncated.
 *
 * Eight is what the result surfaces were built around — a popup that has to
 * scroll is worse than a popup that says there is more.
 */
export const DICT_LOOKUP_LIMIT = 8;

/**
 * The largest page a renderer may ask for.
 *
 * A bound, not a preference: `limit` arrives over IPC, and an unbounded one
 * turns a 650k-row database into an arbitrarily long synchronous read on the
 * main event loop.
 */
export const DICT_LOOKUP_MAX_LIMIT = 200;

/** How much bigger each "show more" step is than the page before it. */
export const DICT_LOOKUP_STEP = 5;

/**
 * The next page size to ask for after the user asked to see more.
 *
 * Multiplicative rather than a fixed increment so a word with a long tail is
 * reached in a few clicks instead of forty, and clamped so the last step lands
 * exactly on the maximum rather than overshooting it into a value main would
 * quietly reduce.
 */
export function nextLookupLimit(current: number): number {
  return clampLookupLimit(current * DICT_LOOKUP_STEP);
}

/** Clamp a page size onto the range the database read allows. */
export function clampLookupLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DICT_LOOKUP_LIMIT;
  return Math.min(DICT_LOOKUP_MAX_LIMIT, Math.max(1, Math.floor(limit)));
}
