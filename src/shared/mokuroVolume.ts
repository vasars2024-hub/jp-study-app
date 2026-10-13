/**
 * Mokuro VOLUME import (`.mokuro` files).
 *
 * Mokuro (0.2.x) writes one JSON file per volume: the volume's title and uuid,
 * and a `pages` array where each page carries `img_path` plus the same block
 * shape our per-page cache already uses (`box`, `vertical`, `font_size`,
 * `lines`, and `lines_coords`, which we do not need). This module turns that
 * file into per-page `MokuroPage`s in OUR cache schema and decides which page
 * of the library item each one belongs to. It is pure: main does the I/O.
 *
 * Format only — see the license note in `mokuroTypes.ts`. No Mokuro code.
 */
import {
  MOKURO_EMIT_VERSION,
  MokuroParseError,
  parseMokuroPage,
  regionIdFromBox,
  type MokuroPage,
} from './mokuroTypes';

/** Upper bound on pages in one volume file; a real tankoubon has ~200. */
export const MOKURO_VOLUME_MAX_PAGES = 2_000;
/** A `.mokuro` file larger than this is not a volume (a few MB is typical). */
export const MOKURO_VOLUME_MAX_BYTES = 64 * 1024 * 1024;

export interface MokuroVolumePage {
  /** The page image's path as Mokuro wrote it (relative to the volume folder). */
  imgPath: string;
  /** Lower-cased file name without extension — what a library page stem is matched on. */
  stemKey: string;
  page: MokuroPage;
}

export interface MokuroVolume {
  version: string;
  title: string;
  volume: string;
  pages: MokuroVolumePage[];
}

/** `img/001.jpg` -> `001`, case-folded. Separators of either OS are accepted. */
export function mokuroStemKey(imgPath: string): string {
  const name = imgPath.split(/[\\/]/).filter(Boolean).pop() ?? imgPath;
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).normalize('NFC').toLowerCase();
}

function isSupportedVolumeVersion(version: string): boolean {
  return /^0\.[12](?:\.\d+)?$/.test(version.trim());
}

/**
 * Validate a parsed `.mokuro` file. Throws `MokuroParseError` on anything that
 * is not a Mokuro volume, so the reader can say so instead of writing junk.
 *
 * Each page is normalised to our cache schema: version 1.01, `kind: 'text'`,
 * the lines frozen as `rawLines` (the "revert to raw" baseline), and a region id
 * derived from the box — `regionIdFromBox` with the page's own stem, exactly
 * what a scan would have produced, so corrections key the same way.
 */
export function parseMokuroVolume(raw: unknown): MokuroVolume {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MokuroParseError('a .mokuro file must be a JSON object');
  }
  const o = raw as Record<string, unknown>;
  const version = typeof o.version === 'string' ? o.version.trim() : '';
  if (!version || !isSupportedVolumeVersion(version)) {
    throw new MokuroParseError(`unsupported .mokuro version "${version || '?'}" (accepted: 0.1.x, 0.2.x)`);
  }
  if (!Array.isArray(o.pages)) throw new MokuroParseError('a .mokuro file must have a pages array');
  if (o.pages.length > MOKURO_VOLUME_MAX_PAGES) throw new MokuroParseError('too many pages in one volume');
  const pages: MokuroVolumePage[] = [];
  o.pages.forEach((rawPage, index) => {
    if (!rawPage || typeof rawPage !== 'object') {
      throw new MokuroParseError(`pages[${index}] must be an object`);
    }
    const p = rawPage as Record<string, unknown>;
    const imgPath = typeof p.img_path === 'string' ? p.img_path.trim() : '';
    if (!imgPath) throw new MokuroParseError(`pages[${index}].img_path is required`);
    const parsed = parseMokuroPage({
      version: MOKURO_EMIT_VERSION,
      img_width: p.img_width,
      img_height: p.img_height,
      blocks: Array.isArray(p.blocks) ? p.blocks : [],
    });
    const stemKey = mokuroStemKey(imgPath);
    pages.push({
      imgPath,
      stemKey,
      page: {
        ...parsed,
        blocks: parsed.blocks
          .map((block) => ({
            box: block.box,
            vertical: block.vertical,
            ...(block.font_size !== undefined ? { font_size: block.font_size } : null),
            lines: block.lines.map((line) => line.trim()).filter(Boolean),
            kind: 'text' as const,
          }))
          .filter((block) => block.lines.length > 0)
          .map((block) => ({ ...block, rawLines: [...block.lines] })),
      },
    });
  });
  return {
    version,
    title: typeof o.title === 'string' ? o.title : '',
    volume: typeof o.volume === 'string' ? o.volume : '',
    pages,
  };
}

export interface MokuroPageAssignment {
  /** The library page's stem (file name without extension), as the OCR cache keys it. */
  stem: string;
  page: MokuroPage;
}

export interface MokuroMatchResult {
  assignments: MokuroPageAssignment[];
  /** How the pages were paired: by file name, or (no names matched) by position. */
  matchedBy: 'name' | 'order' | 'none';
  /** Volume pages that found no library page. */
  unmatched: number;
}

/** `0007` -> 7; anything that is not all digits -> null. */
function numericStem(stem: string): number | null {
  const key = stem.normalize('NFKC').trim();
  if (!/^\d{1,9}$/.test(key)) return null;
  return Number.parseInt(key, 10);
}

/** The same order the library used when it renamed the pages (`library.ts` naturalCompare). */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * The library's numbers, when its page stems are its own 1-based renaming
 * (`0001`, `0002`, ... — `extractMangaPages` / `copyFolderImages`). Those names
 * say where a page sits in reading order and nothing about the source file it
 * came from, so they must not be string-compared with the names Mokuro kept.
 */
function ordinalLibraryNumbers(libraryStems: readonly string[]): number[] | null {
  if (!libraryStems.length) return null;
  const numbers: number[] = [];
  for (const stem of libraryStems) {
    const n = numericStem(stem);
    if (n === null) return null;
    numbers.push(n);
  }
  if (new Set(numbers).size !== numbers.length) return null;
  return Math.min(...numbers) === 1 ? numbers : null;
}

/**
 * Pair each volume page with a library page.
 *
 * The library renames every imported page to its 1-based position (`0001.jpg`
 * is the first page in natural order, whatever the source file was called), so
 * when the library stems are that numbering they are matched by POSITION:
 *
 * - a volume whose image names are all numbers is aligned on its lowest number
 *   (`000.jpg` from a 0-based scan is library page 1, `001.jpg` from a 1-based
 *   one is too), which keeps gaps where Mokuro skipped a page;
 * - otherwise, when the counts agree, the volume's pages are put in the same
 *   natural order the library used and paired one to one.
 *
 * Comparing `0001` with Mokuro's `0001.jpg` as strings, which is what this used
 * to do, put every page of a 0-based volume one page late.
 *
 * Library pages that kept a real name are matched by file name — Mokuro keeps
 * the image names too. When NOT ONE name matches but the page counts are equal
 * (the archive was repacked and renamed), the order is the pairing; anything
 * else would be a guess, and a wrong guess paints one page's text over another,
 * so it is refused rather than attempted.
 *
 * Every assigned page gets region ids built from ITS stem, so an imported box
 * and a later rescan of the same box share a correction key.
 */
export function matchMokuroPages(volume: MokuroVolume, libraryStems: readonly string[]): MokuroMatchResult {
  let pairs: Array<{ stem: string; source: MokuroVolumePage }> = [];
  let matchedBy: MokuroMatchResult['matchedBy'] = 'none';

  const ordinals = ordinalLibraryNumbers(libraryStems);
  const volumeNumbers: number[] = [];
  for (const page of volume.pages) {
    const n = numericStem(page.stemKey);
    if (n === null) break;
    volumeNumbers.push(n);
  }
  if (ordinals && volume.pages.length > 0) {
    if (volumeNumbers.length === volume.pages.length) {
      const base = Math.min(...volumeNumbers);
      const byNumber = new Map<number, MokuroVolumePage>();
      volume.pages.forEach((page, index) => {
        const position = volumeNumbers[index] - base + 1;
        if (!byNumber.has(position)) byNumber.set(position, page);
      });
      libraryStems.forEach((stem, index) => {
        const source = byNumber.get(ordinals[index]);
        if (source) pairs.push({ stem, source });
      });
      if (pairs.length) matchedBy = 'name';
    } else if (volume.pages.length === libraryStems.length) {
      const sorted = [...volume.pages].sort((a, b) => naturalCompare(a.imgPath, b.imgPath));
      const byPosition = libraryStems
        .map((stem, index) => ({ stem, n: ordinals[index] }))
        .sort((a, b) => a.n - b.n);
      pairs = byPosition.map(({ stem }, index) => ({ stem, source: sorted[index] }));
      matchedBy = 'order';
    }
  } else {
    const byKey = new Map<string, MokuroVolumePage>();
    for (const page of volume.pages) if (!byKey.has(page.stemKey)) byKey.set(page.stemKey, page);
    for (const stem of libraryStems) {
      const source = byKey.get(stem.normalize('NFC').toLowerCase());
      if (source) pairs.push({ stem, source });
    }
    if (pairs.length) matchedBy = 'name';
    if (!pairs.length && volume.pages.length > 0 && volume.pages.length === libraryStems.length) {
      pairs = libraryStems.map((stem, index) => ({ stem, source: volume.pages[index] }));
      matchedBy = 'order';
    }
  }

  const used = new Set(pairs.map((pair) => pair.source));
  return {
    assignments: pairs.map(({ stem, source }) => ({
      stem,
      page: {
        ...source.page,
        blocks: source.page.blocks.map((block) => ({ ...block, regionId: regionIdFromBox(block.box, stem) })),
      },
    })),
    matchedBy,
    unmatched: volume.pages.filter((page) => !used.has(page)).length,
  };
}
