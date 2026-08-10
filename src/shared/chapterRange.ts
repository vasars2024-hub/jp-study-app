/**
 * Chapter-range scoping for mining, and the ONE place that names what a scoped
 * run produces.
 *
 * Two separate problems live here on purpose.
 *
 * **Scope.** Mining has always been whole-book. `extractEpubText` builds one text
 * per spine item and then joins them, so the boundaries exist and are thrown away
 * on the last line. A range is a 1-based, inclusive pair over those sections.
 *
 * **Naming.** A scoped run must land somewhere stable and distinct. The deck store
 * groups cards by the `(bookId, bookTitle)` PAIR — `replaceImportedDeck`,
 * `setBookGroupFolder` and `renameBookGroup` all match on both — and
 * `replaceImportedDeck` deletes every card in the matched group before inserting.
 * That is destructive when two runs collide and idempotent when they don't, so the
 * range has to reach the identity or re-mining chapter 5 would wipe chapters 1–3.
 * Every surface that names a scoped deck — traditional mining, AI Card Studio, the
 * Anki deck name, the export file — takes its name from `miningDeckIdentity` so
 * the four can never drift apart.
 *
 * The range label is deliberately NOT translated. Deck names are study content
 * under the project i18n rule, and a translated label would rename a user's deck
 * when they switch UI language — which, given the group key, would orphan the
 * cards already in it.
 */

/** A 1-based, inclusive span of chapters. `null` means the whole book. */
export interface ChapterRange {
  from: number;
  to: number;
}

export interface ChapterRangeInput {
  from?: number | null;
  to?: number | null;
}

function clampIndex(value: number, sectionCount: number): number {
  return Math.max(1, Math.min(sectionCount, Math.floor(value)));
}

/**
 * Reads a caller-supplied range against a known section count.
 *
 * Returns `null` for "whole book", which is also what a range covering every
 * section normalizes to — so a full-span selection names itself the same way an
 * unscoped run does, rather than producing a second identity for the same cards.
 * A reversed pair (`to` before `from`) is ordered rather than refused: it is a
 * typo in a form and a routine mistake for a language model, and the intent is
 * never ambiguous.
 */
export function normalizeChapterRange(
  raw: ChapterRangeInput | null | undefined,
  sectionCount: number,
): ChapterRange | null {
  if (!raw || sectionCount <= 0) return null;
  const hasFrom = typeof raw.from === 'number' && Number.isFinite(raw.from);
  const hasTo = typeof raw.to === 'number' && Number.isFinite(raw.to);
  if (!hasFrom && !hasTo) return null;

  // A single bound means a single chapter, not an open span: "only chapter 5" is
  // the common request, and an open-ended default would silently mine to the end.
  const from = clampIndex(hasFrom ? (raw.from as number) : (raw.to as number), sectionCount);
  const to = clampIndex(hasTo ? (raw.to as number) : (raw.from as number), sectionCount);
  const range = from <= to ? { from, to } : { from: to, to: from };
  return range.from === 1 && range.to === sectionCount ? null : range;
}

/** `[from, to]` as 0-based array bounds for slicing a section list. */
export function chapterRangeSlice<T>(sections: readonly T[], range: ChapterRange | null): T[] {
  if (!range) return [...sections];
  return sections.slice(range.from - 1, range.to);
}

export function chapterRangeCount(range: ChapterRange | null, sectionCount: number): number {
  return range ? range.to - range.from + 1 : sectionCount;
}

/**
 * The human-readable label. Stable across UI languages by design — see the module
 * comment. An en dash separates a span because the name reaches file names and
 * Anki deck names, where a hyphen reads as part of a slug.
 */
export function formatChapterRange(range: ChapterRange | null): string {
  if (!range) return 'Full book';
  return range.from === range.to ? `Ch. ${range.from}` : `Ch. ${range.from}–${range.to}`;
}

/** The identity-safe form: ASCII, lowercase, no separators that a slug would eat. */
export function chapterRangeSlug(range: ChapterRange | null): string {
  if (!range) return 'full';
  return range.from === range.to ? `ch${range.from}` : `ch${range.from}-${range.to}`;
}

/**
 * Filesystem- and Anki-safe rendering of an arbitrary title.
 *
 * Unlike `deckBookId`'s `[^\w]+` slug this keeps non-ASCII letters, because
 * `\w` is ASCII-only: every Japanese title collapses to the same empty slug under
 * it, so a book id derived from a Japanese title carries no information about
 * WHICH book. That is why `miningDeckIdentity` derives its id from the item id.
 */
export function safeTitleSegment(title: string, limit = 60): string {
  return title
    .trim()
    // Path separators and the Windows-reserved set.
    .replace(/[\\/:*?"<>|]/g, ' ')
    // Control characters, as escapes so no control byte lives in this source.
    // Stripping them is the point of the rule this disables: a title carrying
    // one would produce a file name the shell cannot address.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
    .trim();
}

function idSlug(value: string, limit = 48): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, limit);
}

export interface MiningDeckIdentityInput {
  /** The library item id. Stable, ASCII, and unique — unlike the title. */
  itemId: string;
  /** The book's own title, as the library holds it. */
  bookTitle: string;
  range: ChapterRange | null;
  /**
   * Distinguishes generators that can both target the same book and range, so an
   * AI Card Studio run does not replace a traditional mining run's deck.
   */
  generator?: 'mining' | 'ai-studio';
}

export interface MiningDeckIdentity {
  /** Group key part 1. Encodes item + range, so a re-run replaces only its own range. */
  bookId: string;
  /** Group key part 2, and the deck's display name. */
  deckTitle: string;
  /** The deck name sent to Anki. Matches `deckTitle` so the two surfaces agree. */
  ankiDeckName: string;
  /** Export file base name, without extension. */
  fileBaseName: string;
  rangeLabel: string;
}

/**
 * The single source of truth for what a scoped run is called.
 *
 * Determinism is the contract: the same `(itemId, range, generator)` yields the
 * same `bookId` and `deckTitle` on every run, forever. That is what makes
 * re-mining a range update it in place instead of duplicating it, and what lets
 * the exported file, the Anki deck and the in-app deck share one name.
 */
export function miningDeckIdentity(input: MiningDeckIdentityInput): MiningDeckIdentity {
  const generator = input.generator ?? 'mining';
  const prefix = generator === 'ai-studio' ? 'ai' : 'epub';
  const title = safeTitleSegment(input.bookTitle) || 'Untitled';
  const rangeLabel = formatChapterRange(input.range);
  const deckTitle = input.range ? `${title} — ${rangeLabel}` : title;

  return {
    bookId: `${prefix}-${idSlug(input.itemId) || 'item'}-${chapterRangeSlug(input.range)}`,
    deckTitle,
    ankiDeckName: deckTitle,
    fileBaseName: safeTitleSegment(
      input.range ? `${title} ${chapterRangeSlug(input.range)}` : title,
      80,
    ),
    rangeLabel,
  };
}
