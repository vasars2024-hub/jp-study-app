/**
 * Canonical reading contracts (Phase 5 — reading convergence).
 *
 * Study OS reads things that have never shared a shape: manga volumes (a folder
 * of images, addressed by page index) and novels/articles (addressed by the
 * novel reader's own part-and-fraction pair). Seanime adds a third: a remote
 * provider's chapter feed, whose pages are URLs that only load with the right
 * request headers.
 *
 * These types describe *what was read and where*, not any one provider's API —
 * the same rule `acquisition.ts` follows for playback. That is what lets the
 * retained Study OS readers and the adopted Seanime manga catalogue meet at one
 * boundary instead of becoming two apps.
 *
 * Deliberately NOT imported here: `types.ts` (`LibraryItem`), the Seanime
 * generated types, or anything under `scraperResults.ts`. The adapters live
 * beside their own side of the boundary, so this module stays a leaf and
 * `src/shared` keeps its zero-import-cycle rule.
 */

export const READING_CONTENT_TYPES = ['manga', 'novel', 'article'] as const;
export type ReadingContentType = (typeof READING_CONTENT_TYPES)[number];

/**
 * How an edition's bytes are laid out. This drives which locator kind is
 * meaningful, so it is a property of the edition rather than of the work: the
 * same manga can exist as a local image series and as a provider chapter feed.
 */
export type ReadingFormat = 'image-series' | 'epub' | 'pdf' | 'text';

/** Where an edition's content comes from. */
export type ReadingOrigin = 'local' | 'provider';

/**
 * The work, independent of how it is read.
 *
 * `workId` is Study OS's own identity and stays stable when the edition,
 * provider or file changes — the same rule as `AcquisitionIdentity.workId`.
 */
export interface ReadingWork {
  contentType: ReadingContentType;
  workId: string;
  title: string;
  /** Original-language title when it differs from `title`. */
  titleNative: string;
  aniListId: number | null;
  malId: number | null;
}

/**
 * One concrete way to read a work: a local EPUB, a local manga volume, or a
 * provider's chapter feed.
 */
export interface ReadingEdition {
  editionId: string;
  workId: string;
  format: ReadingFormat;
  origin: ReadingOrigin;
  /** Empty for local editions. */
  providerId: string;
  providerLabel: string;
  language: string;
  /** Cover reference in whatever form the origin uses (path or URL). */
  coverRef: string;
  /**
   * Total addressable units when the edition knows it up front — pages for an
   * image series, 0 when the format has no fixed count (EPUB, text).
   */
  unitCount: number;
}

/**
 * Optional grouping between an edition and its chapters. Manga has volumes;
 * a novel usually does not, and omitting it must never break a reader — so
 * `volumeId` on a chapter is nullable rather than a required parent.
 */
export interface ReadingVolume {
  volumeId: string;
  editionId: string;
  /** Volume number as printed. Not parsed into a number: "7.5" and "Extra" both occur. */
  label: string;
  ordinal: number;
}

export interface ReadingChapter {
  chapterId: string;
  editionId: string;
  volumeId: string | null;
  /** Chapter number as published — kept as text for the same reason as `ReadingVolume.label`. */
  number: string;
  title: string;
  /** Position within the edition, ascending. Providers disagree about numbering; order does not. */
  index: number;
  scanlator: string;
  language: string;
}

/**
 * A page of an image-series edition.
 *
 * `headers` is part of the page's identity, not an optimisation: provider CDNs
 * reject requests without their Referer/User-Agent pair, so a page carried
 * without them would be a URL that no reader can actually display. This mirrors
 * `AcquisitionPlayback.headers`, and it is subject to the same persistence rule
 * — see `stripReadingPageSecrets` below.
 */
export interface ReadingPage {
  index: number;
  url: string;
  headers: Record<string, string>;
  width: number;
  height: number;
}

/**
 * Where the reader is. The union is the whole point of this model: three
 * readers that address content in three incompatible ways can still report,
 * store and restore progress through one type.
 */
export type ReadingLocator =
  /** Image series and PDF: 0-based page index within a chapter or volume. */
  | { kind: 'page'; index: number }
  /**
   * Novels and articles: the address the Study OS novel reader actually uses —
   * a part (chapter) index plus a 0..1 fraction through that part.
   *
   * **Not a CFI.** `types.ts` called `Progress.location` an "EPUB CFI location
   * string" and this model was first written to match that comment, but no
   * reader in this app has ever produced one: `NovelReader.tsx:656` and `:829`
   * write `p:<part>:<frac>` and `parseLoc` (`:157`) reads it back. `bookmarks.ts`
   * names its field `cfi` for the same historical reason and stores the same
   * part/fraction string. A `cfi` arm belongs here only once a reader emits a
   * real one — modelling the format we wish we had is what made the first
   * version of this union wrong.
   */
  | { kind: 'part'; part: number; fraction: number };

export interface ReadingProgress {
  editionId: string;
  chapterId: string | null;
  locator: ReadingLocator;
  /** 0..1 through the edition. Readers that cannot compute it report 0. */
  percent: number;
  updatedAt: number;
}

/**
 * Persisted history must not carry a provider's signed page URLs or its
 * credentialed headers — the rule the Phase 4 scraper history already follows.
 * A stripped page is marked so a reader re-resolves the chapter instead of
 * rendering a URL that has expired or a request that will 403.
 */
export interface StoredReadingPage extends Omit<ReadingPage, 'headers'> {
  refreshRequired: true;
}

export function stripReadingPageSecrets(page: ReadingPage): StoredReadingPage {
  return {
    index: page.index,
    url: '',
    width: page.width,
    height: page.height,
    refreshRequired: true,
  };
}

/** The locator kind an edition's format can actually express. */
export function locatorKindFor(format: ReadingFormat): ReadingLocator['kind'] {
  switch (format) {
    case 'image-series':
    case 'pdf':
      return 'page';
    case 'epub':
    case 'text':
      // Both go through the one Study OS novel reader, which addresses an EPUB
      // and an imported article identically. Splitting them here would invent a
      // distinction no reader makes.
      return 'part';
  }
}

/**
 * Guards against the failure this model exists to prevent: a page index stored
 * against a novel, or a part/fraction against a manga volume. A mismatch is a
 * bug in the caller, so it fails loudly rather than being coerced into
 * something plausible.
 */
export function isLocatorValidFor(format: ReadingFormat, locator: ReadingLocator): boolean {
  return locator.kind === locatorKindFor(format);
}

/** Stable, comparable form for storage keys and equality checks. */
export function serializeLocator(locator: ReadingLocator): string {
  switch (locator.kind) {
    case 'page':
      return `page:${locator.index}`;
    case 'part':
      return `part:${locator.part}:${locator.fraction}`;
  }
}

export function parseLocator(value: string): ReadingLocator | null {
  const separator = value.indexOf(':');
  if (separator < 0) return null;
  const kind = value.slice(0, separator);
  const rest = value.slice(separator + 1);
  if (kind === 'page') {
    const index = Number(rest);
    return Number.isInteger(index) && index >= 0 ? { kind: 'page', index } : null;
  }
  if (kind === 'part') {
    const divider = rest.indexOf(':');
    if (divider < 0) return null;
    const partText = rest.slice(0, divider);
    const fractionText = rest.slice(divider + 1);
    // `Number('')` is 0, so an empty half would otherwise parse as a valid
    // position at the start of part 0.
    if (!partText || !fractionText) return null;
    const part = Number(partText);
    const fraction = Number(fractionText);
    return Number.isInteger(part) &&
      part >= 0 &&
      Number.isFinite(fraction) &&
      fraction >= 0 &&
      fraction <= 1
      ? { kind: 'part', part, fraction }
      : null;
  }
  return null;
}

/**
 * Order chapters for reading. Providers return chapters in whatever order their
 * site lists them — newest-first is common — so `index` is authoritative and
 * the printed `number` is only a tie-break for the ones that share an index.
 */
export function sortReadingChapters(chapters: ReadingChapter[]): ReadingChapter[] {
  return chapters.slice().sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    return a.number.localeCompare(b.number, undefined, { numeric: true });
  });
}
