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

/** Convert one unified SQLite lookup into the stable legacy renderer shape. */
export function lookupResultToDictResult(result: LookupResult): DictResult {
  const deinflection = deinflectionFor(result);
  return {
    query: result.query,
    entries: result.entries.map(toLegacyEntry),
    ...(deinflection ? { deinflection } : {}),
  };
}

/** Restore legacy pitch/frequency fields until the unified lookup exposes them. */
export function enrichLexiconResultMetadata(
  result: DictResult,
  metadata: {
    pitchHtml: (word: string, reading: string) => string;
    frequency: (word: string, reading: string) => number | undefined;
  },
): DictResult {
  return {
    ...result,
    entries: result.entries.map((entry) => {
      const pitchHtml = metadata.pitchHtml(entry.word, entry.reading);
      const frequency = metadata.frequency(entry.word, entry.reading);
      return {
        ...entry,
        ...(pitchHtml ? { pitchHtml } : {}),
        ...(frequency !== undefined ? { frequency } : {}),
      };
    }),
  };
}
