import { hasCyrillic, hasHan, hasKana, hasLatin } from './langs';
import { normalizeLexiconText } from './lexiconWorkbench';

/** Keep a passage lookup responsive while the future Workbench renders rows. */
export const MAX_OFFLINE_INTERLINEAR_CHARS = 4_000;
export const MAX_OFFLINE_INTERLINEAR_MERGE_SEGMENTS = 8;

export type LexiconLookupVia =
  | 'exact'
  | 'reading'
  | 'deinflected'
  | 'variant'
  | 'prefix'
  | 'gloss';

export interface LexiconLookupGloss {
  lang: string;
  text: string;
  html?: string;
}

export interface LexiconLookupEntry {
  headwordId: number;
  dictId: string;
  dictTitle: string;
  text: string;
  reading: string;
  via: LexiconLookupVia;
  score: number;
  reasons?: string[];
  senses: Array<{ glosses: LexiconLookupGloss[] }>;
}

export interface LexiconLookupResult {
  query: string;
  detectedLangs?: string[];
  entries: LexiconLookupEntry[];
}

export type LexiconInterlinearLookup = (query: string) => LexiconLookupResult;

/** One requested target language's grounded glosses, and the dictionary they came from. */
export interface LexiconInterlinearParallelGloss {
  lang: string;
  dictId: string;
  dictTitle: string;
  glosses: LexiconLookupGloss[];
}

/**
 * The fields of an installed dictionary that decide which glosses exist offline.
 * Kept structural so the shared layer does not depend on the Yomitan registry
 * type; `YomitanDictInfo` satisfies it.
 */
export interface LexiconGlossSource {
  hasTerms?: boolean;
  enabled?: boolean;
  glossLangs?: string[];
  glossLangOverride?: string;
}

/**
 * More columns than this stops being a reading aid and starts being a table, and
 * each extra target costs a gloss filter over every entry of every token.
 */
export const MAX_PARALLEL_GLOSS_TARGETS = 3;

/**
 * Decide which gloss languages to request, primary first.
 *
 * A parallel target is only worth asking for when a dictionary the user actually
 * installed can answer it, so the list is derived from the registry rather than
 * from the UI language or a fixed table. Registry order is priority order, so
 * the cap drops the dictionaries the user already ranked last.
 */
export function parallelGlossTargets(
  primary: string,
  sources: readonly LexiconGlossSource[],
  max: number = MAX_PARALLEL_GLOSS_TARGETS,
): string[] {
  const limit = Math.max(1, Math.floor(max));
  const out: string[] = [];

  const push = (lang: string | undefined): void => {
    const code = lang?.trim().toLowerCase();
    if (!code || out.length >= limit || out.includes(code)) return;
    out.push(code);
  };

  push(primary);
  for (const source of sources) {
    if (source.hasTerms === false || source.enabled === false) continue;
    const override = source.glossLangOverride?.trim();
    if (override) {
      push(override);
      continue;
    }
    for (const lang of source.glossLangs ?? []) push(lang);
  }

  return out;
}

/**
 * One sense of the matched headword, restricted to the requested target languages.
 *
 * `index` is the sense's position in the dictionary's own sequence for that
 * headword rather than in this filtered array, so a pin recorded against it
 * still names the same sense when the passage is looked up again with a
 * different set of gloss targets.
 */
export interface LexiconInterlinearSense {
  index: number;
  glosses: LexiconLookupGloss[];
}

/**
 * Past this many senses a picker stops being a choice and becomes the dictionary
 * page the Lookup lens already renders. The cap also bounds what a passage-scale
 * result has to carry per token.
 */
export const MAX_PINNABLE_SENSES = 8;

export interface LexiconInterlinearMatch {
  query: string;
  headwordId: number;
  dictId: string;
  dictTitle: string;
  text: string;
  reading: string;
  via: Exclude<LexiconLookupVia, 'prefix'>;
  score: number;
  reasons?: string[];
  /** Only glosses in the requested target languages are exposed here. */
  glosses: LexiconLookupGloss[];
  /**
   * Per-language grouping, in the order the targets were requested. Populated
   * only when more than one target language was asked for, so a single-target
   * caller sees exactly the shape it saw before parallel targets existed.
   */
  parallel?: LexiconInterlinearParallelGloss[];
  /**
   * The chosen entry's senses, present only when it offers more than one in the
   * requested targets. A single-sense token has nothing to pin, so it pays no
   * payload for the field and consumers keep the shape they had before.
   */
  senses?: LexiconInterlinearSense[];
  /**
   * The sense a reader pinned for this token. Written only by the pin layer —
   * a lookup never decides which sense a passage meant.
   */
  pinnedSense?: number;
  /** True when the database matched the token but no requested gloss exists. */
  hasTargetGloss: boolean;
}

export interface LexiconInterlinearToken {
  kind: 'token';
  text: string;
  start: number;
  end: number;
  match?: LexiconInterlinearMatch;
}

export interface LexiconInterlinearSeparator {
  kind: 'separator';
  text: string;
  start: number;
  end: number;
}

export type LexiconInterlinearPart = LexiconInterlinearToken | LexiconInterlinearSeparator;

export interface LexiconInterlinearOptions {
  /** Pins the locale used for deterministic word segmentation when supplied. */
  sourceLangs?: readonly string[];
  /** Limits sourced glosses without asking a model to translate anything. */
  glossLangs?: readonly string[];
  maxChars?: number;
  maxMergeSegments?: number;
}

export interface LexiconInterlinearResult {
  /** The exact normalized passage represented by `parts`. */
  text: string;
  detectedLangs: string[];
  glossLangs: string[];
  parts: LexiconInterlinearPart[];
  tokenCount: number;
  matchedCount: number;
  truncated: boolean;
}

interface BaseSegment {
  text: string;
  start: number;
  end: number;
  wordLike: boolean;
}

interface SegmenterResult {
  segment: string;
  index: number;
  isWordLike?: boolean;
}

interface WordSegmenter {
  segment(text: string): Iterable<SegmenterResult>;
}

interface WordSegmenterConstructor {
  new (locales?: string | string[], options?: { granularity: 'word' }): WordSegmenter;
}

function segmenterConstructor(): WordSegmenterConstructor | undefined {
  const intl = Intl as unknown as { Segmenter?: WordSegmenterConstructor };
  return intl.Segmenter;
}

function localeFor(text: string, sourceLangs?: readonly string[]): string {
  const explicit = sourceLangs?.find((lang) => lang.trim());
  if (explicit) return explicit;
  if (hasKana(text)) return 'ja';
  if (hasHan(text)) return 'zh';
  if (hasCyrillic(text)) return 'ru';
  if (hasLatin(text)) return 'en';
  return 'en';
}

function isCjkCodePoint(char: string): boolean {
  return /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff]/u.test(char);
}

function isWordCodePoint(char: string): boolean {
  return /[\p{L}\p{N}\p{M}]/u.test(char);
}

/** Conservative fallback for runtimes whose ICU build lacks Intl.Segmenter. */
function fallbackSegments(text: string): BaseSegment[] {
  const out: BaseSegment[] = [];
  let codeUnitIndex = 0;

  for (const char of text) {
    const start = codeUnitIndex;
    codeUnitIndex += char.length;
    const whitespace = /\s/u.test(char);

    if (whitespace) {
      const previous = out[out.length - 1];
      if (previous && !previous.wordLike && /\s/u.test(previous.text)) {
        previous.text += char;
        previous.end = codeUnitIndex;
      } else {
        out.push({ text: char, start, end: codeUnitIndex, wordLike: false });
      }
      continue;
    }

    if (isCjkCodePoint(char)) {
      out.push({ text: char, start, end: codeUnitIndex, wordLike: true });
      continue;
    }

    if (isWordCodePoint(char)) {
      const previous = out[out.length - 1];
      if (previous && previous.wordLike && previous.end === start && !isCjkCodePoint(previous.text)) {
        previous.text += char;
        previous.end = codeUnitIndex;
      } else {
        out.push({ text: char, start, end: codeUnitIndex, wordLike: true });
      }
      continue;
    }

    out.push({ text: char, start, end: codeUnitIndex, wordLike: false });
  }

  return out;
}

/** Segment without dropping punctuation or whitespace from the render stream. */
export function segmentLexiconText(
  text: string,
  sourceLangs?: readonly string[],
): Array<Pick<BaseSegment, 'text' | 'start' | 'end' | 'wordLike'>> {
  const Segmenter = segmenterConstructor();
  if (!Segmenter) return fallbackSegments(text);

  try {
    const segmenter = new Segmenter(localeFor(text, sourceLangs), { granularity: 'word' });
    return [...segmenter.segment(text)].map((part) => ({
      text: part.segment,
      start: part.index,
      end: part.index + part.segment.length,
      wordLike: Boolean(part.isWordLike),
    }));
  } catch {
    return fallbackSegments(text);
  }
}

export function uniqueGlosses(glosses: readonly LexiconLookupGloss[]): LexiconLookupGloss[] {
  const seen = new Set<string>();
  const out: LexiconLookupGloss[] = [];
  for (const gloss of glosses) {
    const lang = gloss.lang.trim().toLowerCase();
    const text = gloss.text.trim();
    if (!lang || !text) continue;
    const key = `${lang}\u0000${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...gloss, lang, text });
  }
  return out;
}

function entryGlosses(entry: LexiconLookupEntry, targetLangs: readonly string[]): LexiconLookupGloss[] {
  const all = uniqueGlosses(entry.senses.flatMap((sense) => sense.glosses));
  if (!targetLangs.length) return all;
  const wanted = new Set(targetLangs.map((lang) => lang.trim().toLowerCase()).filter(Boolean));
  return all.filter((gloss) => wanted.has(gloss.lang));
}

/**
 * The senses a reader could pin for this token.
 *
 * Where the senses live depends on the store, and both shapes are real on this
 * installation. A migrated SQLite row carries every sense of a headword in one
 * entry. The legacy Yomitan stores — which is what answers today, and what a
 * live probe of 見る actually returned — split each JMdict sense into its own
 * `DictEntry`, so the entry the lookup chose holds exactly one sense and the
 * rest arrive as siblings. Reading only `entry.senses` therefore finds one sense
 * for every word in the user's real dictionaries and the picker never appears.
 *
 * So a sense list is collected across the chosen entry and its same-dictionary
 * siblings for the same headword, in result order. A different dictionary's
 * entry is never folded in: its sense numbering is its own, and mixing the two
 * would put a number on a sense the source dictionary never gave it.
 *
 * Senses that say nothing in the requested targets are skipped but still consume
 * their ordinal, so a pin keeps naming the same sense when the gloss targets
 * change. One surviving sense is not a choice, so nothing is returned.
 */
function pinnableSenses(
  result: LexiconLookupResult,
  entry: LexiconLookupEntry,
  targetLangs: readonly string[],
): LexiconInterlinearSense[] {
  const wanted = targetLangs.length
    ? new Set(targetLangs.map((lang) => lang.trim().toLowerCase()).filter(Boolean))
    : undefined;
  const out: LexiconInterlinearSense[] = [];
  let index = 0;

  for (const candidate of result.entries) {
    if (candidate.via === 'prefix') continue;
    if (candidate !== entry && (candidate.dictId !== entry.dictId || !sameHeadword(entry, candidate))) {
      continue;
    }
    for (const sense of candidate.senses) {
      if (out.length >= MAX_PINNABLE_SENSES) return out;
      const glosses = uniqueGlosses(sense.glosses).filter((gloss) => !wanted || wanted.has(gloss.lang));
      if (glosses.length) out.push({ index, glosses });
      index += 1;
    }
  }

  return out.length > 1 ? out : [];
}

/** Prefix hits are useful in a search list, but are not a grounded token gloss. */
function selectEntry(
  result: LexiconLookupResult,
  targetLangs: readonly string[],
): LexiconLookupEntry | undefined {
  const grounded = result.entries.filter((entry) => entry.via !== 'prefix');
  return grounded.find((entry) => entryGlosses(entry, targetLangs).length > 0) ?? grounded[0];
}

/**
 * A second target language almost always lives in a different imported
 * dictionary, so a parallel gloss has to be read off a sibling entry. Only the
 * same headword qualifies — never a different word that merely ranked nearby.
 * A dictionary that stores no reading is still the same headword.
 */
function sameHeadword(a: LexiconLookupEntry, b: LexiconLookupEntry): boolean {
  if (a.headwordId === b.headwordId) return true;
  if (a.text !== b.text) return false;
  if (!a.reading || !b.reading) return true;
  return a.reading === b.reading;
}

function parallelGlosses(
  result: LexiconLookupResult,
  entry: LexiconLookupEntry,
  targetLangs: readonly string[],
): LexiconInterlinearParallelGloss[] {
  const out: LexiconInterlinearParallelGloss[] = [];

  for (const lang of targetLangs) {
    const own = entryGlosses(entry, [lang]);
    if (own.length) {
      out.push({ lang, dictId: entry.dictId, dictTitle: entry.dictTitle, glosses: own });
      continue;
    }
    for (const sibling of result.entries) {
      if (sibling === entry || sibling.via === 'prefix' || !sameHeadword(entry, sibling)) continue;
      const glosses = entryGlosses(sibling, [lang]);
      if (!glosses.length) continue;
      out.push({ lang, dictId: sibling.dictId, dictTitle: sibling.dictTitle, glosses });
      break;
    }
  }

  return out;
}

function toMatch(
  query: string,
  result: LexiconLookupResult,
  entry: LexiconLookupEntry,
  targetLangs: readonly string[],
): LexiconInterlinearMatch {
  const parallel = targetLangs.length > 1 ? parallelGlosses(result, entry, targetLangs) : [];
  const glosses = parallel.length
    ? uniqueGlosses(parallel.flatMap((group) => group.glosses))
    : entryGlosses(entry, targetLangs);
  const senses = pinnableSenses(result, entry, targetLangs);
  return {
    query,
    headwordId: entry.headwordId,
    dictId: entry.dictId,
    dictTitle: entry.dictTitle,
    text: entry.text,
    reading: entry.reading,
    via: entry.via as Exclude<LexiconLookupVia, 'prefix'>,
    score: entry.score,
    ...(entry.reasons?.length ? { reasons: [...entry.reasons] } : {}),
    glosses,
    ...(parallel.length ? { parallel } : {}),
    ...(senses.length ? { senses } : {}),
    hasTargetGloss: glosses.length > 0,
  };
}

function cappedText(text: string, maxChars: number): { text: string; truncated: boolean } {
  const codePoints = Array.from(text);
  if (codePoints.length <= maxChars) return { text, truncated: false };
  return { text: codePoints.slice(0, maxChars).join(''), truncated: true };
}

function hasPrefixSignal(result: LexiconLookupResult): boolean {
  return result.entries.some((entry) => entry.via === 'prefix');
}

function contiguousWordRange(segments: BaseSegment[], start: number, maxSegments: number): number {
  let end = start;
  while (
    end < segments.length &&
    end - start < maxSegments &&
    segments[end].wordLike &&
    (end === start || segments[end - 1].end === segments[end].start)
  ) {
    end += 1;
  }
  return end;
}

/**
 * Build the offline segmentation and glossary rungs of the Workbench ladder.
 *
 * The lookup callback is deliberately injected: the renderer can consume this
 * contract through a future typed bridge, while main-process tests can use the
 * canonical SQLite service directly. No translation, model call, or inferred
 * gloss is allowed here.
 */
export function buildOfflineInterlinear(
  rawText: string,
  lookup: LexiconInterlinearLookup,
  options: LexiconInterlinearOptions = {},
): LexiconInterlinearResult {
  const normalized = normalizeLexiconText(rawText);
  const maxChars = Math.max(1, Math.floor(options.maxChars ?? MAX_OFFLINE_INTERLINEAR_CHARS));
  const bounded = cappedText(normalized, maxChars);
  const targetLangs = [...new Set((options.glossLangs ?? []).map((lang) => lang.trim().toLowerCase()).filter(Boolean))];
  const maxMergeSegments = Math.max(
    1,
    Math.floor(options.maxMergeSegments ?? MAX_OFFLINE_INTERLINEAR_MERGE_SEGMENTS),
  );
  const segments = segmentLexiconText(bounded.text, options.sourceLangs) as BaseSegment[];
  const cache = new Map<string, LexiconLookupResult>();
  const detectedLangs = new Set<string>();
  const parts: LexiconInterlinearPart[] = [];
  let tokenCount = 0;
  let matchedCount = 0;

  const resultFor = (query: string): LexiconLookupResult => {
    const cached = cache.get(query);
    if (cached) return cached;
    const result = lookup(query);
    cache.set(query, result);
    for (const lang of result.detectedLangs ?? []) {
      const normalizedLang = lang.trim().toLowerCase();
      if (normalizedLang) detectedLangs.add(normalizedLang);
    }
    return result;
  };

  let index = 0;
  while (index < segments.length) {
    const segment = segments[index];
    if (!segment.wordLike) {
      parts.push({ kind: 'separator', text: segment.text, start: segment.start, end: segment.end });
      index += 1;
      continue;
    }

    const rangeEnd = contiguousWordRange(segments, index, maxMergeSegments);
    let chosenEnd = index + 1;
    const firstResult = resultFor(segment.text);
    let chosenEntry = selectEntry(firstResult, targetLangs);

    // ICU commonly splits Japanese morphology into a one-character stem plus
    // suffix fragments. Probe the adjacent pair first; only expand to a longer
    // candidate when the pair or the first lookup signals a prefix, or when the
    // first fragment had no grounded entry. This keeps long passages bounded
    // instead of probing every possible n-gram for every already-known token.
    const firstCodePoint = Array.from(segment.text)[0] ?? '';
    const shortCjkStem = Array.from(segment.text).length <= 2 && isCjkCodePoint(firstCodePoint);
    if (shortCjkStem && rangeEnd > index + 1) {
      const pairEnd = index + 2;
      const pairQuery = bounded.text.slice(segment.start, segments[pairEnd - 1].end);
      const pairResult = resultFor(pairQuery);
      const pairEntry = selectEntry(pairResult, targetLangs);
      if (pairEntry) {
        chosenEnd = pairEnd;
        chosenEntry = pairEntry;
      } else if (!chosenEntry || hasPrefixSignal(firstResult) || hasPrefixSignal(pairResult)) {
        for (let candidateEnd = rangeEnd; candidateEnd > pairEnd; candidateEnd -= 1) {
          const query = bounded.text.slice(segment.start, segments[candidateEnd - 1].end);
          const candidateResult = resultFor(query);
          const candidateEntry = selectEntry(candidateResult, targetLangs);
          if (!candidateEntry) continue;
          chosenEnd = candidateEnd;
          chosenEntry = candidateEntry;
          break;
        }
      }
    }

    const end = segments[chosenEnd - 1].end;
    const query = bounded.text.slice(segment.start, end);
    // `query` is always one of the strings already probed above, so this reads
    // the memoized result rather than issuing a second lookup for the token.
    const match = chosenEntry
      ? toMatch(query, resultFor(query), chosenEntry, targetLangs)
      : undefined;
    parts.push({ kind: 'token', text: query, start: segment.start, end, ...(match ? { match } : {}) });
    tokenCount += 1;
    if (match) matchedCount += 1;
    index = chosenEnd;
  }

  return {
    text: bounded.text,
    detectedLangs: [...detectedLangs],
    glossLangs: targetLangs,
    parts,
    tokenCount,
    matchedCount,
    truncated: bounded.truncated,
  };
}
