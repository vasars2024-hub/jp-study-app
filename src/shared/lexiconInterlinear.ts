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

function uniqueGlosses(glosses: readonly LexiconLookupGloss[]): LexiconLookupGloss[] {
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

/** Prefix hits are useful in a search list, but are not a grounded token gloss. */
function selectEntry(
  result: LexiconLookupResult,
  targetLangs: readonly string[],
): LexiconLookupEntry | undefined {
  const grounded = result.entries.filter((entry) => entry.via !== 'prefix');
  return grounded.find((entry) => entryGlosses(entry, targetLangs).length > 0) ?? grounded[0];
}

function toMatch(
  query: string,
  entry: LexiconLookupEntry,
  targetLangs: readonly string[],
): LexiconInterlinearMatch {
  const glosses = entryGlosses(entry, targetLangs);
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
    const match = chosenEntry ? toMatch(query, chosenEntry, targetLangs) : undefined;
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
