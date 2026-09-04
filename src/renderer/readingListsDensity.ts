/**
 * §11.4's density row — *"a 20-book list and a 300-book list are not the same
 * UI problem."*
 *
 * A view preference, so it lives in renderer `localStorage` alongside the other
 * per-view toggles this app already keeps there (`MediaCenterView`'s nav tools,
 * `NovelReader`'s translate mode). It is deliberately NOT in the reading-lists
 * document: that document is user DATA, it round-trips through main and it is
 * what §1's event log and recovery are for. A chrome preference riding in it
 * would make every density flip a store write, a broadcast to every window and
 * a line in the log.
 *
 * Three things this module is careful about, each because the naive version is
 * silently wrong:
 *
 * 1. **A junk or absent value is `comfortable`, never a crash and never a blank
 *    surface.** The key is written by this app only, but a profile copied
 *    between builds, a half-finished write or a user with dev tools open all
 *    produce values this must survive.
 * 2. **`localStorage` can throw** — it does in a denied-storage partition, and
 *    every access here is guarded. A read that throws is a default, not an
 *    error banner: the user loses a preference, not the view.
 * 3. **A failed write is REPORTED to the caller** rather than swallowed. The
 *    toggle still applies for the session; the caller decides whether to say so.
 *    A preference that silently does not persist is the exact defect
 *    `filesViewStateStore` was built to avoid.
 */
export const READING_LIST_DENSITIES = ['comfortable', 'compact'] as const;

export type ReadingListDensity = (typeof READING_LIST_DENSITIES)[number];

export const READING_LIST_DENSITY_DEFAULT: ReadingListDensity = 'comfortable';

export const READING_LIST_DENSITY_STORAGE_KEY = 'jp-reading-lists-density-v1';

/** Anything that is not one of the two known modes resolves to the default. */
export function normalizeReadingListDensity(value: unknown): ReadingListDensity {
  return READING_LIST_DENSITIES.includes(value as ReadingListDensity)
    ? (value as ReadingListDensity)
    : READING_LIST_DENSITY_DEFAULT;
}

export function loadReadingListDensity(): ReadingListDensity {
  try {
    return normalizeReadingListDensity(
      globalThis.localStorage?.getItem(READING_LIST_DENSITY_STORAGE_KEY),
    );
  } catch {
    return READING_LIST_DENSITY_DEFAULT;
  }
}

/** `false` means the mode applies for this session but will not survive a restart. */
export function saveReadingListDensity(density: ReadingListDensity): boolean {
  try {
    globalThis.localStorage?.setItem(
      READING_LIST_DENSITY_STORAGE_KEY,
      normalizeReadingListDensity(density),
    );
    return true;
  } catch {
    return false;
  }
}
