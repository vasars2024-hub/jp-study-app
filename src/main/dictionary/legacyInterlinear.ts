// Reading the *legacy* Yomitan stores through the Workbench's lookup contract.
//
// ## Why this exists at all
//
// `service.ts` explains, at length and correctly, that the SQLite migration has
// nowhere to run: `better-sqlite3` is synchronous, importing this machine's four
// bundled stores takes minutes, and the `utilityProcess` that would host it needs
// a build-config entry point that CLAUDE.md puts out of scope. The consequence it
// records is that `migrateLegacyStoresNow()` is never called on boot.
//
// The consequence it does *not* record is the one that matters here. `lookupTerm`
// survives an empty database because it falls back to the legacy in-memory index;
// `lookupOfflineInterlinear` had no such fallback, so the Workbench's segmentation
// and glossary rungs asked SQLite, got nothing, and reported every token of every
// passage as "not in your dictionaries" — on an installation with 97 MB of JMdict
// sitting in `userData/yomitan/bundled-jmdict-en/index.json` and answering the
// pop-up dictionary perfectly. Three consecutive ledger slices could only be
// accepted on their negative branch because of it. That is a code gap in one call
// path, not the data prerequisite it was being read as.
//
// So this module is the same additive fallback `lookupTerm` already has, in the
// shape `buildOfflineInterlinear` consumes. It is pure: the caller supplies the
// entries and the registry, so it can be tested without Electron, a database, or
// a 97 MB file.
//
// ## What the legacy shape cannot carry, stated once
//
// `DictEntry` is what the legacy path returns, and it is lossier than a database
// row. Two fields are therefore approximations, and both are deliberate:
//
//   * **`score`** — `enrichEntry` already collapsed the stored numeric score into
//     the boolean `isCommon`, so the original number is gone before this module
//     is reached. `isCommon ? 1 : 0` preserves the only distinction that survived.
//     It ranks nothing here: `selectEntry` picks by gloss availability and then by
//     the merged index's own priority order, which is registry order.
//   * **`dictId`** — entries are tagged with the dictionary's *title*, not its id,
//     so the id is resolved back through the registry. A title with no registry
//     match falls back to the title itself rather than to a blank or an invented
//     id, because the field's consumers (harvest rows, mining route metadata)
//     want something stable and human-traceable more than they want a real key.

import type { DictEntry, YomitanDictInfo } from '../../shared/types';
import type {
  LexiconLookupEntry,
  LexiconLookupGloss,
  LexiconLookupResult,
} from '../../shared/lexiconInterlinear';

/** The conjugation path `lookupOfflineDeinflected` reports, structurally. */
export interface LegacyDeinflection {
  source: string;
  term: string;
  reasons: string[];
}

export interface LegacyLookupBatch {
  entries: readonly DictEntry[];
  deinflection?: LegacyDeinflection;
}

/**
 * Default gloss language for a dictionary that never declared one.
 *
 * The same `'en'` the migration writes (`glossLangOf` in `migrate.ts`), so a
 * store gets the same language code whether it is read through this fallback or
 * through the database it will eventually be imported into.
 */
const DEFAULT_GLOSS_LANG = 'en';

function titleToId(dicts: readonly YomitanDictInfo[]): Map<string, string> {
  const out = new Map<string, string>();
  // Registry order is priority order, so the first dictionary to claim a title
  // is the one a tie should resolve to.
  for (const info of dicts) {
    if (!info.title || out.has(info.title)) continue;
    out.set(info.title, info.id);
  }
  return out;
}

function glossesOf(entry: DictEntry): Array<{ glosses: LexiconLookupGloss[] }> {
  const lang = entry.sourceLangs?.find((code) => code?.trim())?.trim().toLowerCase()
    ?? DEFAULT_GLOSS_LANG;
  return entry.senses.map((sense, senseOrd) => ({
    glosses: (sense.definitions ?? []).map((text, glossOrd) => ({
      lang,
      text,
      // The structured HTML belongs to the entry rather than to one definition,
      // so it rides on the first gloss of the first sense — exactly where
      // `migrate.ts` puts it, and therefore where a reader already looks.
      ...(senseOrd === 0 && glossOrd === 0 && entry.glossaryHtml
        ? { html: entry.glossaryHtml }
        : {}),
    })),
  }));
}

/**
 * Convert one legacy lookup into the Workbench's grounded-lookup shape.
 *
 * `via` is `'deinflected'` for the whole batch when a conjugation path was
 * followed and `'exact'` otherwise — never `'prefix'`. The caller is expected to
 * have asked for an exact-only lookup; a prefix hit arriving here would be
 * indistinguishable from an exact one and would ground a token on a word the
 * passage never used.
 *
 * Headword ids are negative and sequential. They only have to be distinct —
 * `sameHeadword` falls back to text/reading when two ids differ — and negative
 * keeps them from ever colliding with a SQLite rowid, so a consumer holding both
 * kinds can never mistake one for the other.
 */
export function legacyBatchToLookupResult(
  query: string,
  batch: LegacyLookupBatch,
  dicts: readonly YomitanDictInfo[],
): LexiconLookupResult {
  const ids = titleToId(dicts);
  const via = batch.deinflection ? 'deinflected' : 'exact';
  const reasons = batch.deinflection?.reasons?.filter((reason) => reason?.trim()) ?? [];

  const entries: LexiconLookupEntry[] = batch.entries.map((entry, index) => {
    const dictTitle = entry.source ?? '';
    return {
      headwordId: -(index + 1),
      dictId: ids.get(dictTitle) ?? dictTitle,
      dictTitle,
      text: entry.word,
      reading: entry.reading,
      via,
      score: entry.isCommon ? 1 : 0,
      ...(reasons.length ? { reasons: [...reasons] } : {}),
      senses: glossesOf(entry),
    };
  });

  return { query, entries };
}
