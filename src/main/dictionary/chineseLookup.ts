// The Chinese lookup path, moved out of the renderer.
//
// Phase 4. `renderer/chineseDict.ts` held a second, private dictionary engine:
// it fetched the whole 9.4 MB CC-CEDICT file into the renderer heap, built a
// Map of ~120 000 headwords on the UI thread, and answered an English query by
// scanning every entry linearly. `dictService.lookup()` already answers exactly
// that question from an index, in both directions, for every language. This
// module is the seam that lets the renderer stop owning an engine.
//
// ## Why the file fallback still exists, and why removing it would be a bug
//
// The database is **not populated on boot** — `service.ts` explains at length
// why the legacy migration cannot run on the main thread, and CC-CEDICT has no
// automatic importer either. So on every installation today the `zh` side of
// the database is empty. Pointing the Chinese surfaces straight at `lookup()`
// would therefore have made them return *nothing at all*, silently, which is
// strictly worse than the renderer engine they replaced.
//
// The shape here is the same additive one `dictionary.ts:129` already uses for
// Japanese: try the database, and fall back to the legacy source when it has no
// answer. The difference from the old code is *where the fallback runs* — main,
// not the renderer — so the 9.4 MB parse never lands on the UI thread again and
// there is exactly one Chinese code path for the whole app.
//
// The pure functions here take their database and their CC-CEDICT text as
// arguments; `service.ts` supplies the real ones. That keeps this testable
// without Electron, which is the same reason `lexiconAdapter.ts` is separate.

import type { DictEntry, DictResult } from '../../shared/types';
import type { LexiconLookupResult } from '../../shared/lexiconInterlinear';
import { cedictHeadwords, parseCedictLine, pinyinToneMarks, type CedictEntry } from '../../shared/pinyin';
import type { SqliteDb } from './db';
import { lookup } from './dictService';
import { lookupResultToDictResult } from './lexiconAdapter';

export interface CedictIndex {
  /** simplified or traditional headword -> entries */
  byWord: Map<string, CedictEntry[]>;
  /** every entry, for English (gloss) search */
  all: CedictEntry[];
}

const CJK_RE = /[㐀-鿿豈-﫿]/;

export function hasHanText(text: string): boolean {
  return CJK_RE.test(text);
}

export function buildCedictIndex(text: string): CedictIndex {
  const byWord = new Map<string, CedictEntry[]>();
  const all: CedictEntry[] = [];
  for (const line of text.split('\n')) {
    const entry = parseCedictLine(line);
    if (!entry) continue;
    all.push(entry);
    for (const key of cedictHeadwords(entry)) {
      const list = byWord.get(key);
      if (list) list.push(entry);
      else byWord.set(key, [entry]);
    }
  }
  return { byWord, all };
}

function toDictEntry(entry: CedictEntry): DictEntry {
  return {
    word: entry.simp,
    reading: pinyinToneMarks(entry.pinyin),
    isCommon: false,
    jlpt: [],
    senses: [{ partsOfSpeech: [], definitions: entry.defs, tags: [] }],
  };
}

/**
 * The former renderer engine, unchanged in behaviour.
 *
 * Kept byte-for-byte equivalent on purpose: it is the fallback, so any
 * "improvement" here would be a behaviour change on the path users are actually
 * on today, with no database to compare against.
 */
export function lookupCedictIndex(index: CedictIndex, query: string): DictResult {
  const q = (query ?? '').trim();
  if (!q) return { query: q, entries: [] };
  const { byWord, all } = index;

  if (hasHanText(q)) {
    // Exact headword, else the longest matching prefix (good for a reader
    // selection that grabbed a word plus a trailing particle/character).
    let hit = byWord.get(q);
    if (!hit) {
      for (let len = q.length - 1; len >= 1 && !hit; len--) {
        hit = byWord.get(q.slice(0, len));
      }
    }
    return { query: q, entries: (hit ?? []).slice(0, 12).map(toDictEntry) };
  }

  // English → Chinese: match whole glosses first, then substrings.
  const needle = q.toLowerCase();
  const exact: CedictEntry[] = [];
  const partial: CedictEntry[] = [];
  for (const e of all) {
    const defs = e.defs.map((d) => d.toLowerCase());
    if (defs.some((d) => d === needle || d.startsWith(needle + ' ') || d.startsWith('to ' + needle))) {
      exact.push(e);
    } else if (defs.some((d) => d.includes(needle))) {
      partial.push(e);
    }
    if (exact.length >= 20) break;
  }
  const merged = [...exact, ...partial].slice(0, 20);
  return { query: q, entries: merged.map(toDictEntry) };
}

/**
 * The database side. Returns `null` — not an empty result — when the database
 * has nothing, because "no Chinese dictionary imported" and "this word does not
 * exist" are different answers and only the first one may fall through.
 *
 * `sourceLangs: ['zh']` pins the headword direction, but the reverse (gloss →
 * headword) direction is deliberately **not** language-pinned inside
 * `lookup()`, so an English query can surface Japanese entries. This is the
 * Chinese surface, so those are filtered out here rather than shown.
 */
export function lookupChineseInDb(db: SqliteDb, query: string, limit = 20): DictResult | null {
  const q = (query ?? '').trim();
  if (!q) return null;
  const result = lookup(db, { text: q, sourceLangs: ['zh'], limit });
  const entries = result.entries.filter((entry) => entry.lang === 'zh');
  if (!entries.length) return null;
  // `truncated` is measured before this filter runs, so a dropped row means the
  // rows the limit cut off may have been droppable too — "more matches exist"
  // stops being provable and is therefore not claimed. Carried through only when
  // the filter removed nothing.
  const { truncated, ...rest } = result;
  const keepTruncated = truncated && entries.length === result.entries.length;
  return lookupResultToDictResult({ ...rest, entries, ...(keepTruncated ? { truncated } : {}) });
}

export interface ChineseLookupDeps {
  /** The open dictionary database, or null when it could not be opened. */
  db: () => SqliteDb | null;
  /** The CC-CEDICT `.u8` text — managed install first, bundled copy second. */
  loadCedictText: () => Promise<string>;
}

let indexPromise: Promise<CedictIndex> | null = null;

/** Drop the cached CC-CEDICT index so a newly installed copy is picked up. */
export function resetCedictIndexCache(): void {
  indexPromise = null;
}

/**
 * The CC-CEDICT index itself, loading it on first use. Exported for callers that
 * need synchronous exact probes afterwards — the passage breakdown's lookup
 * callback and the pinyin reading aid.
 */
export function getCedictIndex(deps: ChineseLookupDeps): Promise<CedictIndex> {
  return getIndex(deps);
}

/**
 * An exact CC-CEDICT headword (simplified or traditional) in the passage
 * breakdown's grounded-lookup shape. Exact only: `buildOfflineInterlinear`
 * probes candidate spans itself, and a prefix hit here would ground a token on a
 * word the passage never contained.
 */
export function cedictInterlinearLookup(index: CedictIndex, query: string): LexiconLookupResult {
  const q = (query ?? '').trim();
  const hits = q ? index.byWord.get(q) ?? [] : [];
  return {
    query: q,
    detectedLangs: ['zh'],
    entries: hits.slice(0, 8).map((entry, i) => ({
      headwordId: -(i + 1),
      dictId: 'cc-cedict',
      dictTitle: 'CC-CEDICT',
      // The script the passage is written in: a Traditional passage keeps 們.
      text: entry.trad === q && entry.simp !== q ? entry.trad : entry.simp,
      reading: pinyinToneMarks(entry.pinyin),
      via: 'exact' as const,
      score: 0,
      senses: [{ glosses: entry.defs.map((text) => ({ lang: 'en', text })) }],
    })),
  };
}

function getIndex(deps: ChineseLookupDeps): Promise<CedictIndex> {
  if (!indexPromise) {
    indexPromise = deps.loadCedictText().then(buildCedictIndex).catch((err) => {
      // A failed load must not be cached as a permanent failure: the asset may
      // simply not be downloaded yet, and the next call should retry.
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}

/** Look a Chinese term (or an English gloss) up: database first, CC-CEDICT second. */
export async function lookupChineseTerm(
  query: string,
  deps: ChineseLookupDeps,
  limit?: number,
): Promise<DictResult> {
  const q = (query ?? '').trim();
  if (!q) return { query: q, entries: [] };
  try {
    const db = deps.db();
    if (db) {
      const fromDb = limit === undefined ? lookupChineseInDb(db, q) : lookupChineseInDb(db, q, limit);
      if (fromDb) return fromDb;
    }
  } catch {
    // A database read must never take the CC-CEDICT fallback down. Same rule as
    // `dictionary.ts`'s Japanese path.
  }
  try {
    return lookupCedictIndex(await getIndex(deps), q);
  } catch (err) {
    return { query: q, entries: [], error: err instanceof Error ? err.message : String(err) };
  }
}
