// Dictionary hits for a whole deck selection — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 4's dictionary enrichment and its gate 11.
//
// The shape of the answer is `shared/ankiEnrich.ts`'s `EnrichEntry`; the policy
// for turning several entries into one field value lives there too. This module
// only fetches, and it lives beside the other dictionary services rather than in
// `dictionary.ts` so a test can exercise it against the real database without
// standing up the whole IPC surface.

import type { EnrichEntry } from '../../shared/ankiEnrich';
import type { DictEntry } from '../../shared/types';
import { normalizeLexiconText } from '../../shared/lexiconWorkbench';
import type { LookupEntry } from './dictService';
import { lookupInDictionaryDb } from './service';
import { initYomitan, lookupOfflineDeinflected } from './yomitan';

/**
 * How many distinct words one enrichment pass will look up. A larger selection
 * is truncated rather than refused: the tray names every note it could not
 * enrich, so a partial answer stays visible instead of silently short.
 */
export const MAX_ENRICH_BATCH = 2_000;

/** Entries kept per word — beyond a handful the resulting field is unreadable. */
export const MAX_ENRICH_ENTRIES_PER_TERM = 4;

/**
 * How long the lookup loop may hold Electron's main event loop before letting
 * it breathe.
 *
 * `lookupInDictionaryDb` is synchronous better-sqlite3 and measured **~67 ms
 * per word** on this installation, so a 500-word selection ran the loop for
 * **33.7 s** without ever yielding — measured live 2026-08-16, with a `/health`
 * request that touches only main taking **36,910 ms** to answer during it and
 * **1 ms** immediately after. Nothing could paint, drag or answer IPC for that
 * whole window, which is exactly what CLAUDE.md's performance rule forbids.
 *
 * A time budget rather than a fixed chunk size, because the per-word cost
 * varies with the installed dictionaries: a count tuned for one profile starves
 * another. The total run takes the same time; it is now interruptible.
 */
const ENRICH_YIELD_MS = 50;

/** Hand the event loop back — a macrotask, so timers, IPC and paint all run. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * A legacy Yomitan hit. That store never merges across dictionaries, so one
 * entry is one dictionary and `source` says everything there is to say.
 */
function fromLegacyEntry(entry: DictEntry): EnrichEntry {
  return {
    // A store that could not attribute the entry gives `undefined`; the shared
    // model wants an explicit `null` for "unattributed", and a missing key would
    // read downstream as a dictionary literally named `undefined`.
    source: entry.source ?? null,
    reading: entry.reading ?? '',
    senses: (entry.senses ?? []).map((sense) => ({
      partsOfSpeech: sense.partsOfSpeech ?? [],
      definitions: sense.definitions ?? [],
    })),
  };
}

/**
 * A unified-database hit, read as a `LookupEntry` rather than through
 * `lookupResultToDictResult`.
 *
 * That adapter keeps only `dictTitle`, and the database **merges** entries that
 * agree on language, headword and reading — two installed dictionaries glossing
 * 猫 arrive as one entry whose senses are already combined. Converting through
 * the legacy shape would credit the primary dictionary alone for text several of
 * them wrote, which is exactly the provenance claim gate 11 has to prove. The
 * merged `sources` list is already ordered primary-first and deduplicated by
 * `mergeLookupEntry`, so it is carried across as it stands.
 */
function fromLookupEntry(entry: LookupEntry): EnrichEntry {
  const sources = entry.sources.map((source) => source.dictTitle).filter(Boolean);
  return {
    source: entry.dictTitle || sources[0] || null,
    ...(sources.length > 1 ? { sources } : {}),
    reading: entry.reading ?? '',
    senses: entry.senses.map((sense) => ({
      partsOfSpeech: sense.pos ?? [],
      definitions: sense.glosses.map((gloss) => gloss.text).filter(Boolean),
    })),
  };
}

/**
 * **Offline only, on purpose.** `lookupTerm` falls back to Jisho over HTTP; a
 * 3,000-note enrichment doing that is 3,000 requests to someone else's server
 * and a batch whose result depends on the network. The unified database answers
 * first and the legacy Yomitan store only for words it did not know — the same
 * additive order `lookupTerm` uses, minus the network.
 *
 * A word nothing answered for is **absent from the result**, never an empty
 * array: the tray reports "no dictionary answered" as its own outcome, and an
 * empty array is indistinguishable from an entry that has no senses.
 */
export async function enrichTermsBatch(
  terms: readonly string[],
  opts: {
    /**
     * Consult the legacy Yomitan store for words the database did not know.
     *
     * On by default because that store still holds this installation's JMdict.
     * It is separable because reaching it means `initYomitan()`, which on a
     * profile that has never opened a dictionary **provisions the bundled
     * dictionaries** — hundreds of thousands of terms and about fifteen seconds.
     * A test that only wants to prove the database path must be able to say so
     * rather than pay for that, and it is genuinely a different claim.
     */
    legacyFallback?: boolean;
  } = {},
): Promise<Record<string, EnrichEntry[]>> {
  const legacyFallback = opts.legacyFallback !== false;
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of terms) {
    if (typeof raw !== 'string') continue;
    const term = normalizeLexiconText(raw);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    unique.push(term);
    if (unique.length >= MAX_ENRICH_BATCH) break;
  }
  if (!unique.length) return {};

  const out: Record<string, EnrichEntry[]> = {};
  const missed: string[] = [];
  let sliceStart = Date.now();
  for (const term of unique) {
    let entries: LookupEntry[] = [];
    try {
      entries = lookupInDictionaryDb({ text: term, limit: 8 }).entries;
    } catch {
      // An un-migrated installation has no database; fall through to legacy.
    }
    if (entries.length) out[term] = entries.slice(0, MAX_ENRICH_ENTRIES_PER_TERM).map(fromLookupEntry);
    else missed.push(term);
    if (Date.now() - sliceStart >= ENRICH_YIELD_MS) {
      await yieldToEventLoop();
      sliceStart = Date.now();
    }
  }
  if (!legacyFallback || !missed.length) return out;

  // Only now, and only once: the whole point of deferring this is that a
  // selection the database can answer never provisions the legacy store.
  try {
    await initYomitan();
  } catch {
    return out;
  }
  sliceStart = Date.now();
  for (const term of missed) {
    let entries: DictEntry[] = [];
    try {
      entries = lookupOfflineDeinflected(term).entries;
    } catch {
      entries = [];
    }
    if (Date.now() - sliceStart >= ENRICH_YIELD_MS) {
      await yieldToEventLoop();
      sliceStart = Date.now();
    }
    if (!entries.length) continue;
    out[term] = entries.slice(0, MAX_ENRICH_ENTRIES_PER_TERM).map(fromLegacyEntry);
  }
  return out;
}
