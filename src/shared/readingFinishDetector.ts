/**
 * §4 — deciding that a book was actually finished, from progress saves alone.
 *
 * Pure. The whole point of §4.3 is that this lives in main on the
 * `library:setProgress` path rather than in a reader: `NovelReader.tsx` is 130 KB
 * and `MangaReader.tsx` 87 KB, there will be more readers, and two
 * implementations of "what finishing means" is how `finishedAt` and `state`
 * drift apart.
 *
 * The split that matters is §4.2's: HARD signals auto-tick, SOFT signals only
 * ask. `percent >= 0.98` alone is not a finish signal — one drag of the
 * scrollbar to peek at the afterword writes exactly one save at 100 %, and a
 * detector without the dwell marks the book read. So the hard rule needs the
 * position to have SURVIVED: two consecutive saves at the same place, at least
 * {@link FINISH_DWELL_MS} apart.
 *
 * That dwell needs no new state anywhere. The previous save is already on the
 * `LibraryItem` — `progress` plus `lastReadAt` — and main reads it immediately
 * before overwriting it. It therefore also survives a restart, which an
 * in-memory dwell map would not.
 */

/** Overall progress at or above which a book can be considered done. §4.1. */
export const FINISH_PERCENT = 0.985;
/** The position must have held for at least this long, across two saves. §4.1. */
export const FINISH_DWELL_MS = 60_000;
/** Near the end but not at it — §4.2's soft band. Asks, never ticks. */
export const SUGGEST_PERCENT = 0.9;
/** No progress for this long, near the end, is what turns soft into a question. */
export const SUGGEST_IDLE_MS = 14 * 24 * 60 * 60 * 1000;
/**
 * How far into the part a novel location must sit to count as "the final part
 * was reached".
 *
 * §4.1's clause is "`location` parses to the final part", and there is no part
 * COUNT anywhere in the tree to compare against — `LibraryItem` carries
 * `pageCount` for manga and nothing equivalent for books. The derivable form of
 * the same guard is: the location parses, and it sits at the end of whatever
 * part it names. Combined with the whole-book `percent`, "at the end of a part"
 * and "at 98.5 % of the book" can only both be true at the end of the last one —
 * while a corrupt or stale `percent` of 0.99 against a location at part 3
 * fraction 0.4 is rejected, which is the case the clause exists for.
 */
export const FINAL_PART_FRACTION = 0.98;

export interface ReadingPosition {
  page?: number;
  location?: string;
  percent?: number;
}

export interface ReadingFinishInput {
  kind: string;
  /** Manga only. Absent for books. */
  pageCount?: number;
  /** The save already on the item, i.e. the one about to be replaced. */
  previous?: ReadingPosition;
  /** When that save happened — the item's `lastReadAt`. */
  previousAt?: number;
  next: ReadingPosition;
  at: number;
}

/**
 * §4.3: "not decoration — when a false positive is reported, it is the only way
 * to tell which rule misfired."
 */
export interface ReadingFinishEvidence {
  percent: number;
  location: string | null;
  dwellMs: number;
  saves: number;
}

export type ReadingFinishVerdict =
  | { verdict: 'finished'; evidence: ReadingFinishEvidence }
  | { verdict: 'suggest'; reason: 'stalled-near-end'; evidence: ReadingFinishEvidence }
  | { verdict: 'none'; reason: string };

export interface NovelLocation {
  part: number;
  fraction: number;
}

/**
 * `p:<partIndex>:<fractionWithinPart>`, the novel reader's own format. A very old
 * save is a bare number — a fraction of the whole book — and is reported as part
 * 0, since that is exactly what it means. Anything else is unparseable and, per
 * the guard above, cannot satisfy the final-part clause.
 */
export function parseNovelLocation(location: string | undefined): NovelLocation | null {
  if (typeof location !== 'string') return null;
  const trimmed = location.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts[0] === 'p' && parts.length >= 3) {
    const part = Number(parts[1]);
    const fraction = Number(parts[2]);
    if (!Number.isFinite(part) || !Number.isFinite(fraction)) return null;
    return { part, fraction };
  }
  const bare = Number(trimmed);
  return Number.isFinite(bare) ? { part: 0, fraction: bare } : null;
}

/** Two saves are "the same position" when the reader would restore to the same place. */
function samePosition(a: ReadingPosition | undefined, b: ReadingPosition): boolean {
  if (!a) return false;
  // `percent` is deliberately excluded: it is a derived display number and drifts
  // by a hair between saves at an identical location, which would silently make
  // the dwell unreachable rather than strict.
  return (a.page ?? null) === (b.page ?? null) && (a.location ?? null) === (b.location ?? null);
}

function evidenceOf(input: ReadingFinishInput, dwellMs: number, saves: number): ReadingFinishEvidence {
  return {
    percent: input.next.percent ?? 0,
    location: input.next.location ?? null,
    dwellMs,
    saves,
  };
}

/**
 * One save in, one verdict out.
 *
 * Never returns `finished` on a first sighting of a position, by construction:
 * the dwell is measured against the save that is being replaced, so a scrub to
 * the end has nothing behind it to compare with.
 */
export function detectReadingFinish(input: ReadingFinishInput): ReadingFinishVerdict {
  const percent = input.next.percent ?? 0;
  const held = samePosition(input.previous, input.next);
  const dwellMs = held && input.previousAt !== undefined ? input.at - input.previousAt : 0;
  const atEnd =
    input.kind === 'manga'
      ? typeof input.pageCount === 'number' &&
        input.pageCount > 0 &&
        typeof input.next.page === 'number' &&
        input.next.page >= input.pageCount - 1
      : percent >= FINISH_PERCENT &&
        (parseNovelLocation(input.next.location)?.fraction ?? -1) >= FINAL_PART_FRACTION;

  if (atEnd) {
    if (!held) return { verdict: 'none', reason: 'position-not-held' };
    if (dwellMs < FINISH_DWELL_MS) return { verdict: 'none', reason: 'dwell-too-short' };
    return { verdict: 'finished', evidence: evidenceOf(input, dwellMs, 2) };
  }

  // §4.2. Near the end and untouched for a fortnight is a question, not a tick:
  // it is equally the shape of a book abandoned twenty pages from the end.
  if (
    percent >= SUGGEST_PERCENT &&
    input.previousAt !== undefined &&
    input.at - input.previousAt >= SUGGEST_IDLE_MS
  ) {
    return {
      verdict: 'suggest',
      reason: 'stalled-near-end',
      evidence: evidenceOf(input, input.at - input.previousAt, held ? 2 : 1),
    };
  }

  return { verdict: 'none', reason: percent >= SUGGEST_PERCENT ? 'near-end' : 'reading' };
}
