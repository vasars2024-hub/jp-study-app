// Adapter from the canonical SQLite/FTS lookup shape to the legacy DictResult
// contract used by the current Dictionary popup and mining flow.
//
// Keeping this boundary explicit lets the database become the first lookup path
// without forcing the dirty renderer routes to change at the same time. The
// adapter is deliberately lossy only where the unified result has not exposed
// the corresponding field yet (for example, JLPT, pitch, and frequency);
// dictionary.ts restores legacy pitch/frequency metadata after conversion.
// Sourced gloss, attribution, HTML and de-inflection information are retained.

import type { DictEntry, DictResult, DictSense, DeinflectionInfo } from '../../shared/types';
import { sanitizeDictHtml } from '../../shared/dictHtmlSanitize';
import { withoutFormsSenses } from '../../shared/dictFormsSense';
import { isJmdictCommon, jmdictPriorityCodes } from '../../shared/jmdictPriority';
import type { LookupEntry, LookupResult, LookupSense } from './dictService';

/**
 * The entries a popup should show: JMdict's flattened "forms" table is not a
 * meaning (see `shared/dictFormsSense.ts`), so its sense — or the whole row,
 * when that was all it held — is dropped here, for every caller at once.
 */
function displayableEntries(entries: readonly LookupEntry[]): LookupEntry[] {
  return entries.map((entry) => withoutFormsSenses(entry)).filter((entry): entry is LookupEntry => entry !== null);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** `dictService.normalizeForLookup`, inlined so this adapter stays free of the database module. */
function normalizeForCompare(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase();
}

/**
 * The legacy shape's `via` for a database entry.
 *
 * The database reports a traditional-Chinese row as `variant` whichever probe
 * found it, which hides whether it was a match or a near miss. It is resolved
 * against the query here: the variant written (or read) exactly as the query is
 * a match, one that only starts with it is a prefix hit, and anything else is
 * left unlabelled rather than guessed.
 */
function legacyVia(entry: LookupEntry, query: string | undefined): DictEntry['via'] {
  if (entry.via !== 'variant') return entry.via;
  if (query === undefined) return undefined;
  const q = normalizeForCompare(query);
  if (!q) return undefined;
  if (normalizeForCompare(entry.text) === q) return 'exact';
  if (entry.readingNorm && normalizeForCompare(entry.readingNorm) === q) return 'reading';
  if (normalizeForCompare(entry.text).startsWith(q)) return 'prefix';
  return undefined;
}

function senseHtml(sense: LookupSense): string | undefined {
  return sense.glosses.find((gloss) => gloss.html)?.html;
}

function toLegacySense(sense: LookupSense, perSenseHtml: boolean): DictSense {
  // Stored HTML is sanitized on every read, never trusted because it was ours.
  const html = perSenseHtml ? senseHtml(sense) : undefined;
  const clean = html ? sanitizeDictHtml(html) : '';
  return {
    partsOfSpeech: unique(sense.pos),
    definitions: unique(sense.glosses.map((gloss) => gloss.text.trim()).filter(Boolean)),
    tags: unique(sense.tags),
    ...(sense.dictTitle ? { source: sense.dictTitle } : {}),
    ...(clean ? { html: clean } : {}),
  };
}

function toLegacyEntry(entry: LookupEntry, query?: string): DictEntry {
  const glosses = entry.senses.flatMap((sense) => sense.glosses);
  // Two or more senses with HTML of their own means the dictionary's senses were
  // kept apart (a structured dictionary that marks them, or one row per sense
  // merged here): the entry is then drawn sense by sense, each under its own part
  // of speech. With at most one, that HTML is the whole entry's block, as before.
  const perSenseHtml = entry.senses.filter((sense) => senseHtml(sense)).length >= 2;
  // Stored gloss HTML came from an imported dictionary file (or a JSON store
  // written before the import escaped its text) and is inserted with innerHTML
  // by the pop-ups, so it is sanitized here, on every read, not trusted.
  const rawHtml = perSenseHtml ? undefined : glosses.find((gloss) => gloss.html)?.html;
  const glossaryHtml = rawHtml ? sanitizeDictHtml(rawHtml) : '';
  const sourceLangs = unique(glosses.map((gloss) => gloss.lang));
  const via = legacyVia(entry, query);
  const priorityTags = jmdictPriorityCodes(entry.prio);
  return {
    word: entry.text,
    reading: entry.reading,
    isCommon: entry.score > 0 || isJmdictCommon(priorityTags),
    // No word-level JLPT source exists on this path: the database has no JLPT
    // column for headwords (only KANJIDIC's per-character `chars.jlpt`), and the
    // bundled JMdict carries none. Left empty rather than estimated.
    jlpt: [],
    senses: entry.senses.map((sense) => toLegacySense(sense, perSenseHtml)),
    ...(entry.ipa?.length ? { ipa: [...entry.ipa] } : {}),
    ...(glossaryHtml ? { glossaryHtml } : {}),
    source: entry.dictTitle,
    ...(sourceLangs.length ? { sourceLangs } : {}),
    ...(via ? { via } : {}),
    ...(priorityTags.length ? { priorityTags } : {}),
    ...(entry.via === 'deinflected' && entry.reasons?.length ? { inflection: [...entry.reasons] } : {}),
  };
}

function deinflectionFor(result: LookupResult): DeinflectionInfo | undefined {
  const entry = result.entries.find((candidate) => candidate.via === 'deinflected' && candidate.reasons?.length);
  if (!entry?.reasons?.length) return undefined;
  return {
    source: result.query,
    term: entry.text,
    reasons: entry.reasons,
  };
}

/**
 * Whether this whole result is approximate rather than exact.
 *
 * Derived from the entries instead of from the call site on purpose: the flag has
 * to describe the rows actually being rendered, and asking for a fuzzy lookup is
 * not the same as receiving fuzzy rows — the service only falls back to them when
 * nothing matched exactly.
 */
function isApproximate(result: LookupResult): boolean {
  return result.entries.length > 0 && result.entries.every((entry) => entry.via === 'fuzzy');
}

/** Convert one unified SQLite lookup into the stable legacy renderer shape. */
export function lookupResultToDictResult(result: LookupResult): DictResult {
  const deinflection = deinflectionFor(result);
  const character = result.character
    ? {
        lang: result.character.lang,
        char: result.character.char,
        ...(result.character.strokes !== undefined ? { strokes: result.character.strokes } : {}),
        ...(result.character.radical ? { radical: result.character.radical } : {}),
        components: [...result.character.components],
        readings: [...result.character.readings],
        meanings: [...result.character.meanings],
        ...(result.character.jlpt ? { jlpt: result.character.jlpt } : {}),
        ...(result.character.hsk ? { hsk: result.character.hsk } : {}),
        ...(result.character.grade !== undefined ? { grade: result.character.grade } : {}),
        ...(result.character.frequency !== undefined ? { frequency: result.character.frequency } : {}),
        sources: result.character.sources.map((source) => ({ ...source })),
      }
    : undefined;
  return {
    query: result.query,
    entries: displayableEntries(result.entries).map((entry) => toLegacyEntry(entry, result.query)),
    ...(character ? { character } : {}),
    ...(deinflection ? { deinflection } : {}),
    ...(isApproximate(result) ? { approximate: true } : {}),
    ...(result.truncated ? { truncated: true as const } : {}),
    ...(result.missingSourceLangs?.length ? { missingSourceLangs: [...result.missingSourceLangs] } : {}),
  };
}

/**
 * One legacy entry per gloss language, where the database merged several.
 *
 * The database merges dictionaries that agree on headword and reading, so the
 * bundled JMdict (English) and JMdict (Russian) arrive as one entry whose senses
 * are the English ones followed by the Russian ones. The legacy in-memory index
 * kept one entry per dictionary, and the callers moved off it depend on that:
 * the gloss batch picks "the entry declared for this language", and a merged
 * entry declares both, so its `glossaryHtml` (one dictionary's) could be served
 * as the other language's gloss. Every sense comes from one dictionary, so its
 * glosses share a language and grouping by it undoes the merge.
 *
 * The groups appear in the order the sources were merged, primary first, so
 * each group is credited to the source in the same position when the counts
 * agree. When they do not (a source whose senses were all duplicates), the
 * entry's own primary title is the honest answer.
 */
function toLegacyEntriesByGlossLang(entry: LookupEntry, query?: string): DictEntry[] {
  const groups = new Map<string, LookupSense[]>();
  for (const sense of entry.senses) {
    const lang = sense.glosses[0]?.lang ?? '';
    const list = groups.get(lang);
    if (list) list.push(sense);
    else groups.set(lang, [sense]);
  }
  if (groups.size <= 1) return [toLegacyEntry(entry, query)];
  const titles = entry.sources.map((source) => source.dictTitle);
  const attributable = titles.length === groups.size;
  return [...groups.values()].map((senses, index) =>
    toLegacyEntry({ ...entry, senses, dictTitle: (attributable && titles[index]) || entry.dictTitle }, query));
}

/**
 * `lookupResultToDictResult`, with merged entries split back into one entry per
 * gloss language — the shape the legacy index answered with. For the callers
 * that replaced a legacy read (the extension, the gloss batch, offline lookups).
 */
export function lookupResultToPerLanguageDictResult(result: LookupResult): DictResult {
  return {
    ...lookupResultToDictResult(result),
    entries: displayableEntries(result.entries).flatMap((entry) => toLegacyEntriesByGlossLang(entry, result.query)),
  };
}

/**
 * Restore legacy pitch/frequency fields until the unified lookup exposes them.
 *
 * The frequency resolver may answer with a bare rank or with a rank that knows
 * which dictionary produced it. Both shapes are accepted because the callers
 * migrated at different times, and a bare number stays legal: it is the honest
 * representation of a rank with no attributable source.
 */
export function enrichLexiconResultMetadata(
  result: DictResult,
  metadata: {
    pitchHtml: (word: string, reading: string) => string;
    frequency: (
      word: string,
      reading: string,
    ) => number | { rank: number; source?: string } | undefined;
    /**
     * IPA from the legacy in-memory stores. Consulted only when the database
     * row carried none — a store imported but not yet migrated.
     */
    ipa?: (word: string, reading: string) => string[];
  },
): DictResult {
  return {
    ...result,
    entries: result.entries.map((entry) => {
      // Built from escaped morae by `pitchPatternHtml`; sanitized again here
      // because the resolver is injected and the result reaches innerHTML.
      const rawPitch = metadata.pitchHtml(entry.word, entry.reading);
      const pitchHtml = rawPitch ? sanitizeDictHtml(rawPitch) : '';
      const freq = metadata.frequency(entry.word, entry.reading);
      const rank = typeof freq === 'number' ? freq : freq?.rank;
      const source = typeof freq === 'number' ? undefined : freq?.source;
      const ipa = entry.ipa?.length ? entry.ipa : metadata.ipa?.(entry.word, entry.reading) ?? [];
      return {
        ...entry,
        ...(pitchHtml ? { pitchHtml } : {}),
        ...(ipa.length ? { ipa } : {}),
        ...(rank !== undefined ? { frequency: rank } : {}),
        ...(source ? { frequencySource: source } : {}),
      };
    }),
  };
}
