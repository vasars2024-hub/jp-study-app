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
import type { LookupEntry, LookupResult, LookupSense } from './dictService';

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function toLegacySense(sense: LookupSense): DictSense {
  return {
    partsOfSpeech: unique(sense.pos),
    definitions: unique(sense.glosses.map((gloss) => gloss.text.trim()).filter(Boolean)),
    tags: unique(sense.tags),
  };
}

function toLegacyEntry(entry: LookupEntry): DictEntry {
  const glosses = entry.senses.flatMap((sense) => sense.glosses);
  const glossaryHtml = glosses.find((gloss) => gloss.html)?.html;
  const sourceLangs = unique(glosses.map((gloss) => gloss.lang));
  return {
    word: entry.text,
    reading: entry.reading,
    isCommon: entry.score > 0,
    jlpt: [],
    senses: entry.senses.map(toLegacySense),
    ...(entry.ipa?.length ? { ipa: [...entry.ipa] } : {}),
    ...(glossaryHtml ? { glossaryHtml } : {}),
    source: entry.dictTitle,
    ...(sourceLangs.length ? { sourceLangs } : {}),
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
    entries: result.entries.map(toLegacyEntry),
    ...(character ? { character } : {}),
    ...(deinflection ? { deinflection } : {}),
    ...(isApproximate(result) ? { approximate: true } : {}),
    ...(result.truncated ? { truncated: true as const } : {}),
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
function toLegacyEntriesByGlossLang(entry: LookupEntry): DictEntry[] {
  const groups = new Map<string, LookupSense[]>();
  for (const sense of entry.senses) {
    const lang = sense.glosses[0]?.lang ?? '';
    const list = groups.get(lang);
    if (list) list.push(sense);
    else groups.set(lang, [sense]);
  }
  if (groups.size <= 1) return [toLegacyEntry(entry)];
  const titles = entry.sources.map((source) => source.dictTitle);
  const attributable = titles.length === groups.size;
  return [...groups.values()].map((senses, index) =>
    toLegacyEntry({ ...entry, senses, dictTitle: (attributable && titles[index]) || entry.dictTitle }));
}

/**
 * `lookupResultToDictResult`, with merged entries split back into one entry per
 * gloss language — the shape the legacy index answered with. For the callers
 * that replaced a legacy read (the extension, the gloss batch, offline lookups).
 */
export function lookupResultToPerLanguageDictResult(result: LookupResult): DictResult {
  return {
    ...lookupResultToDictResult(result),
    entries: result.entries.flatMap(toLegacyEntriesByGlossLang),
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
      const pitchHtml = metadata.pitchHtml(entry.word, entry.reading);
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
