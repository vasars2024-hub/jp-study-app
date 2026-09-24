/**
 * Manga reading → statistics and the Reading Garden.
 *
 * The novel reader recorded reading time, characters and garden pages; the
 * manga reader recorded nothing but its position, so an evening of manga left
 * Statistics, the daily goal and the garden exactly where they were. This is the
 * manga half, kept out of the component so the crediting rules are testable
 * without mounting a reader:
 *
 * - A page is credited when the reader turns FORWARD off it — once per page per
 *   reader session, like the novel reader's garden pages. A jump (the scrubber,
 *   "last page") credits nothing: skipping past 150 pages is not reading them.
 * - Characters come from that page's OCR when it has been read by OCR; a page
 *   with no OCR still counts as a page, and as reading time, with 0 characters.
 */
import type { MokuroPage } from '../shared/mokuroTypes';

/** Characters a reader actually reads on a page: dialogue and narration, no SFX, no whitespace. */
export function mokuroPageCharCount(page: MokuroPage | null | undefined): number {
  if (!page) return 0;
  let chars = 0;
  for (const block of page.blocks) {
    if (block.kind === 'ignore' || block.kind === 'sfx') continue;
    for (const line of block.lines) chars += line.replace(/\s+/g, '').length;
  }
  return chars;
}

export interface MangaReadingTrackerSinks {
  /** Characters earned by finishing pages; flushed with reading time. */
  addChars: (chars: number) => void;
  /** One page toward the Reading Garden. */
  creditGardenPage: (pageIndex: number) => void;
}

export interface MangaReadingTracker {
  /** The OCR text length of a page, whenever it becomes known. */
  notePageChars(pageIndex: number, chars: number): void;
  /**
   * The reader moved from `from` to `to`. `span` is how many pages one step
   * shows (a two-page spread turns two pages at once).
   */
  turn(from: number, to: number, span?: number): void;
}

export function createMangaReadingTracker(sinks: MangaReadingTrackerSinks): MangaReadingTracker {
  const charsByPage = new Map<number, number>();
  const credited = new Set<number>();
  return {
    notePageChars(pageIndex, chars) {
      if (Number.isFinite(chars) && chars >= 0) charsByPage.set(pageIndex, chars);
    },
    turn(from, to, span = 1) {
      const step = to - from;
      // Backward, or a jump further than one turn: nothing was read on the way.
      if (step <= 0 || step > Math.max(1, span)) return;
      for (let page = from; page < to; page += 1) {
        if (credited.has(page)) continue;
        credited.add(page);
        const chars = charsByPage.get(page) ?? 0;
        if (chars > 0) sinks.addChars(chars);
        sinks.creditGardenPage(page);
      }
    },
  };
}
