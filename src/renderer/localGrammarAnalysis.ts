import { GRAMMAR } from './data/grammar';
import type { NormalizedGrammarPoint } from './data/grammar/normalize';
import { grammarSurfaceCore } from '../shared/grammarPatternSurface';
import {
  findPatternSpans,
  patternAlternatives,
  toSimplifiedForMatch,
  type MatchLang,
} from '../shared/grammarPatternMatch';
import {
  alignAnnotations,
  normalizeAnalysisText,
  type SentenceAnnotation,
  type SentenceAnalysisResult,
  type UnalignedAnnotation,
} from '../shared/sentenceAnalysisCore';

/**
 * Grammar highlight without AI: the Grammar app's own library, matched on the sentence.
 *
 * The AI analysis explains a line; this only finds which library patterns the line
 * literally contains, with the library's meaning, explanation and examples for each. That
 * is enough to colour the subtitle and fill the panel offline and for free, so the toggle
 * does something in a fresh profile, and the AI stays what adds depth when it is set up.
 *
 * The match is `grammarSurfaceCore` — the same conservative rule Grammar practice uses, so
 * a short kana fragment (に, て) that occurs inside unrelated words is never claimed. That
 * under-reports on purpose: a highlight that points at the wrong characters teaches the
 * wrong thing, while a missing one only teaches less.
 *
 * Chinese and Russian are matched by `grammarPatternMatch` instead: a pattern there is an
 * ordered frame of literal parts (虽然…但是…, если бы … бы), Traditional lines are compared
 * in Simplified, and Russian parts are whole words. Each part found is its own highlighted
 * span pointing at the same library point.
 */

interface LibraryEntry {
  core: string;
  point: NormalizedGrammarPoint;
}

const libraryByLang = new Map<string, LibraryEntry[]>();

function libraryFor(lang: string): LibraryEntry[] {
  const cached = libraryByLang.get(lang);
  if (cached) return cached;
  const seen = new Set<string>();
  const entries: LibraryEntry[] = [];
  // GRAMMAR runs N5 → N1 (then HSK), so a core shared by several records keeps its
  // earliest, best-authored one rather than a later supplement's copy.
  for (const point of GRAMMAR) {
    if (point.lang !== lang) continue;
    const core = grammarSurfaceCore(point.title);
    // Chinese has no kana, so the "has a kanji" escape hatch would admit every one-hanzi
    // pattern (的, 了) and highlight half the sentence.
    if (!core || (lang !== 'ja' && core.length < 2) || seen.has(core)) continue;
    seen.add(core);
    entries.push({ core, point });
  }
  libraryByLang.set(lang, entries);
  return entries;
}

/** Chinese / Russian: each point's alternatives, each an ordered list of literal parts. */
interface FrameEntry {
  alternatives: string[][];
  point: NormalizedGrammarPoint;
}

const framesByLang = new Map<MatchLang, FrameEntry[]>();

function framesFor(lang: MatchLang): FrameEntry[] {
  const cached = framesByLang.get(lang);
  if (cached) return cached;
  const seen = new Set<string>();
  const entries: FrameEntry[] = [];
  for (const point of GRAMMAR) {
    if (point.lang !== lang) continue;
    const alternatives = patternAlternatives(point.title, lang).filter((parts) => {
      const key = parts.join('…');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (alternatives.length) entries.push({ alternatives, point });
  }
  framesByLang.set(lang, entries);
  return entries;
}

function annotationFor(point: NormalizedGrammarPoint, text: string): UnalignedAnnotation {
  return {
    text,
    category: 'grammar',
    headword: point.title,
    level: String(point.level),
    meaning: point.meaning,
    explanation: point.explanation,
    examples: point.examples.slice(0, MAX_EXAMPLES).map((example) => ({
      text: example.jp,
      translation: example.en,
    })),
    vocabulary: [],
    // Kept so a highlight can lead back to its library point (and the point to its
    // scenes) instead of only to a title string several points can share.
    grammarId: point.id,
  };
}

/**
 * The library point id the highlighter reports for `point`, or null when the offline
 * highlighter can never report it.
 *
 * The library is deduplicated by surface core (Japanese) or by frame (Chinese/Russian),
 * keeping the earliest record, so a later point with the same core is reported under the
 * earlier one's id — the same characters, so the same claim. A point whose core is too
 * short to match safely is never reported, and a "scenes with this point" search for it
 * would be a list that is always empty for a reason the user cannot see.
 */
export function localGrammarReportedId(
  point: { id: string; title: string; lang?: string },
): string | null {
  const pointLang = point.lang ?? 'ja';
  if (pointLang === 'zh' || pointLang === 'ru') {
    const lang: MatchLang = pointLang;
    const own = patternAlternatives(point.title, lang).map((parts) => parts.join('…'));
    if (!own.length) return null;
    const frames = framesFor(lang);
    if (frames.some((entry) => entry.point.id === point.id)) return point.id;
    return frames.find((entry) =>
      entry.alternatives.some((parts) => own.includes(parts.join('…'))))?.point.id ?? null;
  }
  const core = grammarSurfaceCore(point.title);
  if (!core) return null;
  return libraryFor(pointLang).find((entry) => entry.core === core)?.point.id ?? null;
}

/**
 * Whether the offline highlighter finds `pointId` in `sentence` — the same claim the
 * subtitle overlay would colour. Reads the overlay's cache when the line is in it, but
 * never writes it: a library-wide search would otherwise evict the lines on screen.
 */
export function sentenceHasLocalGrammarPoint(raw: string, lang: string, pointId: string): boolean {
  const sentence = normalizeAnalysisText(raw);
  if (!sentence) return false;
  const key = `${lang}::${sentence}`;
  const annotations = resultCache.has(key)
    ? resultCache.get(key)?.annotations ?? []
    : libraryAnnotations(sentence, lang);
  return annotations.some((annotation) => annotation.grammarId === pointId);
}

/** Chinese / Russian spans, placed by offset and kept in reading order without overlaps. */
function frameAnnotations(sentence: string, lang: MatchLang): SentenceAnnotation[] {
  const haystack = lang === 'zh' ? toSimplifiedForMatch(sentence) : sentence;
  const placed: SentenceAnnotation[] = [];
  for (const { alternatives, point } of framesFor(lang)) {
    for (const parts of alternatives) {
      const spans = findPatternSpans(haystack, parts, lang);
      if (!spans) continue;
      for (const span of spans) {
        placed.push({ ...annotationFor(point, sentence.slice(span.start, span.end)), start: span.start, end: span.end });
      }
      break;
    }
  }
  // Longest first at one position, the more specific claim, as `alignAnnotations` does.
  placed.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: SentenceAnnotation[] = [];
  let lastEnd = 0;
  for (const annotation of placed) {
    if (annotation.start < lastEnd) continue;
    kept.push(annotation);
    lastEnd = annotation.end;
  }
  return kept;
}

const MAX_EXAMPLES = 2;
const CACHE_LIMIT = 200;
const resultCache = new Map<string, SentenceAnalysisResult | null>();

/** The library spans in an already-normalized sentence, aligned and non-overlapping. */
function libraryAnnotations(sentence: string, lang: string): SentenceAnnotation[] {
  if (lang === 'zh' || lang === 'ru') return frameAnnotations(sentence, lang);
  const hits: Array<{ at: number; annotation: UnalignedAnnotation }> = [];
  for (const { core, point } of libraryFor(lang)) {
    const at = sentence.indexOf(core);
    if (at < 0) continue;
    hits.push({ at, annotation: annotationFor(point, core) });
  }
  // Reading order, longest first at one position: `alignAnnotations` keeps the longer of
  // two overlapping spans, the more specific claim (〜なければならない over 〜ならない).
  hits.sort((a, b) => a.at - b.at || b.annotation.text.length - a.annotation.text.length);
  return alignAnnotations(sentence, hits.map((hit) => hit.annotation));
}

/**
 * The library patterns in `raw`, as a `SentenceAnalysisResult` the subtitle line and the
 * analysis panel render as they would the AI's. `null` when nothing in the library
 * matches, so the caller can tell "no offline highlight" from "an empty one".
 */
export function localSentenceAnalysis(raw: string, lang: string): SentenceAnalysisResult | null {
  const sentence = normalizeAnalysisText(raw);
  if (!sentence) return null;
  const key = `${lang}::${sentence}`;
  if (resultCache.has(key)) return resultCache.get(key) ?? null;

  const annotations = libraryAnnotations(sentence, lang);
  const result = annotations.length
    ? { sentence, translations: {}, annotations, nuance: [], pitfalls: [] }
    : null;
  resultCache.set(key, result);
  while (resultCache.size > CACHE_LIMIT) {
    const oldest = resultCache.keys().next().value;
    if (oldest === undefined) break;
    resultCache.delete(oldest);
  }
  return result;
}
